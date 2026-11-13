// [spokes] 迎宾女郎（Entity 28）阶段 3：渲染接入。
//   · buildGreeterEntityMesh：实体根组（正面 +X；外层 buildSpokes 组 rotation.y = π/2 / facesZ）= LOD1（约 1.8 万三角形，立即建）+ LOD0（约 6 万，走近 11 m 内才建）；
//     7 m 内用 LOD0、9 m 外用 LOD1（中间保持，防抖）。GPU 蒙皮；?cpu=1 时 qaCpuSkin 全局替身接管。
//   · animateGreeterEntity：按 spokesAI 的 e.gr.clip / seq 切片段（混合 = AI 给的 blend）；非循环片段时间直接用 AI 的 modeT（放兔子 / 丢海报 / 照片与逻辑同步）。
//     opts.turn = e.gr.turn（看着你）；自由之后领口音箱隐藏（e.gr.speakerOff）；photoRecall 拿的是照片（photo 1）还是证件（photo 2，换证件贴图）；
//     windRabbit 片段末（t ≥ 7 s）手边的道具兔子藏起来——AI 在同一位置放出实体兔子。
//   · buildWindupEntityMesh / animateWindupEntity：发条兔实体（spokesProps.buildWindupRabbit，外层 rotation.y = π/2）；跳行片段时间 = AI 的 hopT（已按速度换算）。
//   · buildSpokesProp：118 办公室道具（structures.buildStructure 的 spokesprop 分支调用）：
//     office = 胡桃木书桌（桌面 0.74 m、近边 = 座位 + 0.24 m）+ 皮椅（椅面 0.44 m）+ 铭牌 + 收音机 + 桌上一叠海报；holes = 北墙投递洞面板（洞口 0.8 m）。坐标见 content/spokesLayout。
import * as THREE from 'three'
import type { Entity } from '../entities'
import type { Structure } from '../core/types'
import { deferSpokesGeometry, buildSpokes, spokesGeometryReady, type SpokesRig } from './spokesMesh'
import { SPOKES_CLIPS, spokesPose, mixSpokesPose, cloneSpokesPose, applySpokesPose, resetSpokesDynamics, animateWindupRabbit, resetWindupRabbit, SPOKES_SEAT_Y, SPOKES_DESK_Y, SPOKES_DESK_Z, type SpokesClip, type SpokesPose, type SpokesAnimOpts } from './spokesAnim'
import { buildWindupRabbit, buildNameplate, buildRadio, buildPosterDrops, posterTexture } from './spokesProps'
import { SPOKES_LOBBY as LY } from '../content/spokesLayout'
import { litMaterial } from './shared'

/** LOD 切换距离（米）：< near 用 LOD0，> far 用 LOD1，之间保持；build 内才建 LOD0 */
export const SPOKES_RLOD = { near: 7, far: 9, build: 11 }
/** 图鉴档案四个定格姿态（archiveViews 按个体序号轮换） */
export const SPOKES_ARCHIVE_POSES = [
  { clip: 'greetSpin', t: 2.4, label: '前台迎宾' },
  { clip: 'speakerTalk', t: 2.0, label: '「这里一点也不危险！」' },
  { clip: 'innerFreeze', t: 2.2, label: '心声' },
  { clip: 'windRabbit', t: 3.0, label: '上发条' },
] as const satisfies readonly { clip: SpokesClip; t: number; label: string }[]

interface View { clip: SpokesClip; seq: number; t: number; gt: number; fadeT: number; blend: number; prev: SpokesPose | null; last: SpokesPose | null; lod: 0 | 1; photo: number }
const shadowsOn = (o: THREE.Object3D, on: boolean) => o.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.castShadow = on; m.receiveShadow = true } })

export function buildGreeterEntityMesh(archivePose?: number): THREE.Group {
  const root = new THREE.Group(); root.name = 'greeterEntity'
  root.userData.entityType = 'greeter'
  const holder1 = new THREE.Group(); holder1.name = 'greeterLOD1'; root.add(holder1)
  const m1 = buildSpokes({ lod: archivePose !== undefined ? 0 : 1 }); holder1.add(m1)
  root.userData.lod1 = holder1; root.userData.rig1 = m1.userData.spokes
  shadowsOn(root, true)
  if (archivePose !== undefined) {
    const P = SPOKES_ARCHIVE_POSES[((archivePose % SPOKES_ARCHIVE_POSES.length) + SPOKES_ARCHIVE_POSES.length) % SPOKES_ARCHIVE_POSES.length]
    const rig = m1.userData.spokes as SpokesRig
    resetSpokesDynamics(rig)
    const opts: SpokesAnimOpts = { seed: 3 }
    for (let t = Math.max(0, P.t - 0.6); t <= P.t + 1e-6; t += 1 / 30) applySpokesPose(rig, spokesPose(P.clip, t, opts), { ...opts, time: t, dt: 1 / 30 })
    root.userData.archive = true
  }
  return root
}
function ensureLod0(grp: THREE.Group): THREE.Group {
  let h = grp.userData.lod0 as THREE.Group | undefined
  if (h) return h
  h = new THREE.Group(); h.name = 'greeterLOD0'; h.visible = false
  const m0 = buildSpokes({ lod: 0 }); h.add(m0)
  shadowsOn(m0, true)
  grp.add(h); grp.userData.lod0 = h; grp.userData.rig0 = m0.userData.spokes
  return h
}

/** 证件贴图（photoRecall 拿的是证件时替换照片道具的正面） */
let badgeTex: THREE.CanvasTexture | null = null
function badgeTexture(): THREE.CanvasTexture | null {
  if (badgeTex) return badgeTex
  const c = typeof document !== 'undefined' ? (document.createElement('canvas') as HTMLCanvasElement) : null
  if (!c) return null
  c.width = 256; c.height = 360
  const x = c.getContext('2d'); if (!x) return null
  x.fillStyle = '#1c1714'; x.fillRect(0, 0, 256, 360)
  x.fillStyle = '#e9e0c8'; x.fillRect(14, 190, 228, 156)
  x.fillStyle = '#b38a3a'; x.beginPath(); x.moveTo(128, 30); x.lineTo(196, 60); x.lineTo(186, 140); x.lineTo(128, 172); x.lineTo(70, 140); x.lineTo(60, 60); x.closePath(); x.fill()
  x.fillStyle = '#7a5a1e'; x.font = '700 22px Georgia, serif'; x.textAlign = 'center'; x.fillText('DETECTIVE', 128, 110)
  x.fillStyle = '#6a4a32'; x.fillRect(28, 206, 70, 92)
  x.fillStyle = '#3a2a20'; x.font = '16px sans-serif'; x.textAlign = 'left'; x.fillText('M.', 112, 236); for (let i = 0; i < 4; i++) x.fillRect(112, 252 + i * 16, 100 - i * 14, 3)
  badgeTex = new THREE.CanvasTexture(c); badgeTex.colorSpace = THREE.SRGBColorSpace
  return badgeTex
}
type PropRig = SpokesRig & { __sprops?: { photo: THREE.Group; rabbit: THREE.Group } }
function syncHeld(rig: SpokesRig, v: View, clip: SpokesClip, t: number, speakerOff: boolean) {
  rig.speaker.visible = !speakerOff
  const sp = (rig as PropRig).__sprops
  if (!sp) return
  if (clip === 'windRabbit' && t >= SPOKES_CLIPS.windRabbit.dur - 1e-3) sp.rabbit.visible = false // AI 在这一刻把实体兔子放在同一位置
  const fr = sp.photo.children[0] as THREE.Mesh | undefined
  if (fr && v.photo !== (fr.userData.badge ? 2 : 1)) {
    const mat = fr.material as THREE.MeshLambertMaterial
    if (!fr.userData.photoMap) fr.userData.photoMap = mat.map
    const want = v.photo === 2 ? badgeTexture() : (fr.userData.photoMap as THREE.Texture | null)
    if (want) { mat.map = want; mat.emissiveMap = want; mat.needsUpdate = true }
    fr.userData.badge = v.photo === 2
  }
}

export function animateGreeterEntity(grp: THREE.Group, e: Entity, dt: number, distance: number, preparedOnly = false) {
  if (grp.userData.archive) return
  const s = e.gr
  if (distance < SPOKES_RLOD.build && !deferSpokesGeometry(0) && (!preparedOnly || spokesGeometryReady(0))) ensureLod0(grp)
  let v = grp.userData.grView as View | undefined
  if (!v) { v = { clip: s?.clip ?? 'idle', seq: -1, t: 0, gt: 0, fadeT: 1, blend: 0.3, prev: null, last: null, lod: 1, photo: 1 }; grp.userData.grView = v }
  const h1 = grp.userData.lod1 as THREE.Group, h0 = grp.userData.lod0 as THREE.Group | undefined
  const prevLod = v.lod
  if (h0) { if (distance < SPOKES_RLOD.near) v.lod = 0; else if (distance > SPOKES_RLOD.far) v.lod = 1 } else v.lod = 1
  h1.visible = v.lod === 1; if (h0) h0.visible = v.lod === 0
  const rig = (v.lod === 0 ? grp.userData.rig0 : grp.userData.rig1) as SpokesRig
  if (prevLod !== v.lod && v.last) resetSpokesDynamics(rig)
  const clip = (s?.clip ?? 'idle') as SpokesClip, C = SPOKES_CLIPS[clip]
  if (s && (s.seq !== v.seq || clip !== v.clip)) { v.prev = v.last ? cloneSpokesPose(v.last) : null; v.fadeT = 0; v.blend = s.blend || C.blend; v.clip = clip; v.seq = s.seq; v.t = 0 }
  v.fadeT += dt; v.gt += dt
  if (C.loop) v.t += dt
  else v.t = s ? Math.min(s.modeT, C.dur) : Math.min(v.t + dt, C.dur)
  if (s?.photo) v.photo = s.photo
  const opts: SpokesAnimOpts = { seed: (e.id % 7) + 1, turn: s?.turn ?? 0 }
  let P = spokesPose(clip, v.t, { ...opts, time: v.gt })
  if (v.prev && v.fadeT < v.blend) P = mixSpokesPose(v.prev, P, smooth(v.fadeT / v.blend))
  v.last = P
  applySpokesPose(rig, P, { ...opts, time: v.gt, dt })
  syncHeld(rig, v, clip, v.t, !!s?.speakerOff)
}
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }

// ---------- 发条兔实体 ----------
export function buildWindupEntityMesh(): THREE.Group {
  const root = new THREE.Group(); root.name = 'windupEntity'; root.userData.entityType = 'windup'
  const face = buildWindupRabbit(); face.rotation.y = Math.PI / 2; face.userData.facesZ = 1 // 兔子正面 +Z → 实体正面 +X
  root.add(face); root.userData.rabbit = face
  shadowsOn(root, true)
  return root
}
export function animateWindupEntity(grp: THREE.Group, e: Entity, dt: number) {
  const w = e.wu, rb = grp.userData.rabbit as THREE.Group
  if (!w || !rb) return
  let st = grp.userData.wuView as { seq: number; t: number } | undefined
  if (!st) { st = { seq: -1, t: 0 }; grp.userData.wuView = st }
  if (w.seq !== st.seq) { st.seq = w.seq; st.t = 0 }
  st.t += dt
  if (w.clip === 'rabbitHop') { animateWindupRabbit(rb, 'rabbitHop', w.hopT); grp.userData.windupT = w.hopT }
  else if (w.mode === 'spent') { resetWindupRabbit(rb); rb.rotation.z = 0; grp.userData.windupT = -1 } // 停摆：立着不动
  else { animateWindupRabbit(rb, 'rabbitStop', Math.min(st.t, 2.4)); grp.userData.windupT = st.t }
}

// ---------- 118 办公室道具 ----------
const MAT: Record<string, THREE.Material> = {}
const mat = (k: string, p: Parameters<typeof litMaterial>[0]) => (MAT[k] ??= litMaterial(p))
function box(g: THREE.Group, name: string, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.name = name; o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o
}
/** structures.buildStructure → spokesprop：返回已摆在世界坐标里的组 */
export function buildSpokesProp(s: Structure): THREE.Object3D | null {
  const kind = s.data?.prop
  if (kind === 'holes') {
    const d = buildPosterDrops(); d.name = 'spokesHoles'
    d.position.set(LY.holes.x, 0.8 - 0.31, LY.holes.y) // 面板局部 +Z 朝南（朝屋里）；洞口中心 0.8 m（= dropPoster SPOKES_DROP_HOLE y）
    shadowsOn(d, true)
    return d
  }
  if (kind !== 'office') return null
  const g = new THREE.Group(); g.name = 'spokesOffice'
  const wood = mat('wood', { color: '#4a2a18', roughness: 0.6 }), woodDk = mat('woodDk', { color: '#2e1a10', roughness: 0.7 }), leather = mat('leather', { color: '#5a1e1a', roughness: 0.5 })
  const sx = LY.seat.x, sz = LY.seat.y // 座位 root 原点（她朝南：root +Z = 世界 +z，root +X = 世界 +x）
  // 书桌 1.4 × 0.7 m：桌面上沿 0.74 m，近边 = 座位 + 0.24 m
  const desk = new THREE.Group(); desk.name = 'spokesDesk'; g.add(desk)
  const dz = sz + SPOKES_DESK_Z + 0.35, dy = SPOKES_DESK_Y
  box(desk, 'spokesDeskTop', 1.4, 0.04, 0.7, sx, dy - 0.02, dz, wood)
  for (const x of [-0.66, 0.66]) for (const z of [-0.31, 0.31]) box(desk, 'spokesDeskLeg', 0.05, dy - 0.04, 0.05, sx + x, (dy - 0.04) / 2, dz + z, woodDk)
  box(desk, 'spokesDeskModesty', 1.36, 0.42, 0.02, sx, dy - 0.25, dz + 0.33, wood) // 访客那一侧的挡板
  box(desk, 'spokesDeskDrawer', 0.42, 0.14, 0.6, sx + 0.44, dy - 0.11, dz, woodDk)
  // 皮椅：椅面 0.44 m（root z −0.08 中心）、靠背 root z −0.33
  const chair = new THREE.Group(); chair.name = 'spokesChair'; g.add(chair)
  const sy = SPOKES_SEAT_Y
  box(chair, 'spokesChairSeat', 0.5, 0.06, 0.44, sx, sy - 0.03, sz - 0.08, leather)
  box(chair, 'spokesChairBack', 0.5, 0.62, 0.06, sx, sy + 0.32, sz - 0.33, leather)
  for (const [x, z] of [[-0.22, 0.1], [0.22, 0.1], [-0.22, -0.26], [0.22, -0.26]]) box(chair, 'spokesChairLeg', 0.035, sy - 0.06, 0.035, sx + x, (sy - 0.06) / 2, sz + z, woodDk)
  // 铭牌（朝访客 = 朝南）、收音机、一叠画好的海报
  const np = buildNameplate(); np.position.set(LY.nameplate.x, dy, LY.nameplate.y); g.add(np)
  const rd = buildRadio(); rd.position.set(LY.radio.x - 0.42, dy, LY.radio.y + 0.05); rd.rotation.y = 0.35; rd.position.y += 0.008; g.add(rd)
  const pt = posterTexture()
  if (pt) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.02, 0.29), [woodDk, woodDk, litMaterial({ color: '#ffffff', map: pt.map }), woodDk, woodDk, woodDk] as unknown as THREE.Material); st.name = 'spokesPosterPile'; st.position.set(sx + 0.5, dy + 0.01, dz - 0.05); st.rotation.y = -0.2; g.add(st) }
  shadowsOn(g, true)
  return g
}
