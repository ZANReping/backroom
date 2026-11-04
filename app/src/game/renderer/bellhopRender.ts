// [bellhop] 行李员（Entity 135）阶段 3：渲染接入。
//   · buildBellhopEntityMesh：实体根组（正面 +X）= LOD1（1.7 万三角形，立即建）+ LOD0（5.9 万，第一次走近 14 m 内才建）；
//     9 m 内用 LOD0、11 m 外用 LOD1（中间保持，防抖）。GPU 蒙皮；?cpu=1 时由 qaCpuSkin 全局替身接管（LOD 切换切的是父组可见性）。
//   · animateBellhopEntity：按 bellhopAI 的 e.bh.clip / seq 切片段（0.2 s 混合）；非循环片段时间直接用 AI 的 modeT（与逻辑同步）。
//     拧头 = e.bh.headYaw（opts.turn，只在视线外由 AI 更新）；脸 = e.bh.face（AI 只在视线外换，渲染层照抄 → 你永远看不到换脸的过程）。
//     铃 / 茶具 / 行李牌 / 手提箱的显隐由各片段自己决定（bellhopAnim.applyProps）。
//   · syncBellhopRoom：10F 行李房（主厅角落的行李寄存处）= 黄铜行李车 + 一摞行李箱 / 帽盒 + 铜牌「行李寄存 BAGGAGE」，
//     挂在场景上、按绝对坐标每帧换算（不进 chunk 结构）；箱子的数量跟着里面还剩几件变。
import * as THREE from 'three'
import type { Entity } from '../entities'
import { buildBellhopMesh, setBellhopFace, type BellhopRig } from './bellhopMesh'
import { BELLHOP_CLIPS, bellhopPose, mixBellhopPose, cloneBellhopPose, applyBellhopPose, type BellhopClip, type BellhopPose, type BellhopAnimOpts } from './bellhopAnim'
import { buildBellhopCart } from './bellhopProps'

/** LOD 切换距离（米）：< near 用 LOD0，> far 用 LOD1，之间保持；build 内才建 LOD0 */
export const BELLHOP_LOD = { near: 9, far: 11, build: 14 }

/** 图鉴档案四个定格姿态（archiveViews 按个体序号轮换） */
export const BELLHOP_ARCHIVE_POSES = [
  { clip: 'stillWatch', t: 0.4, label: '走廊尽头候命', turn: 0, face: 0 },
  { clip: 'stillWatch', t: 0.4, label: '你回头，他也转头', turn: 2.6, face: 3 },
  { clip: 'teaSip', t: 2.4, label: '饮茶', turn: 0, face: 1 },
  { clip: 'ringAnnoyed', t: 1.15, label: '恼怒铃', turn: 0, face: 5 },
] as const satisfies readonly { clip: BellhopClip; t: number; label: string; turn: number; face: number }[]

interface View { clip: BellhopClip; seq: number; t: number; gt: number; fadeT: number; prev: BellhopPose | null; last: BellhopPose | null; frozen: BellhopPose | null; lod: 0 | 1 }

export function buildBellhopEntityMesh(archivePose?: number): THREE.Group {
  const root = new THREE.Group(); root.name = 'bellhopEntity'
  root.userData.entityType = 'bellhop'
  const holder1 = new THREE.Group(); holder1.name = 'bellhopLOD1'; root.add(holder1)
  const m1 = buildBellhopMesh({ lod: archivePose !== undefined ? 0 : 1 }); holder1.add(m1)
  root.userData.lod1 = holder1; root.userData.rig1 = m1.userData.bellhop
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
  if (archivePose !== undefined) {
    const P = BELLHOP_ARCHIVE_POSES[((archivePose % BELLHOP_ARCHIVE_POSES.length) + BELLHOP_ARCHIVE_POSES.length) % BELLHOP_ARCHIVE_POSES.length]
    const rig = m1.userData.bellhop as BellhopRig
    setBellhopFace(rig, P.face)
    const opts: BellhopAnimOpts = { seed: 3, turn: P.turn || undefined, tilt: P.turn ? 0.22 : undefined }
    for (let t = Math.max(0, P.t - 0.6); t <= P.t + 1e-6; t += 1 / 30) applyBellhopPose(rig, bellhopPose(P.clip, t, opts), { ...opts, time: t, dt: 1 / 30, faceFrom: P.face })
    root.userData.archive = true
  }
  return root
}

function ensureLod0(grp: THREE.Group): THREE.Group {
  let h = grp.userData.lod0 as THREE.Group | undefined
  if (h) return h
  h = new THREE.Group(); h.name = 'bellhopLOD0'; h.visible = false
  const m0 = buildBellhopMesh({ lod: 0 }); h.add(m0)
  m0.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
  grp.add(h); grp.userData.lod0 = h; grp.userData.rig0 = m0.userData.bellhop
  return h
}

export function animateBellhopEntity(grp: THREE.Group, e: Entity, dt: number, distance: number) {
  if (grp.userData.archive) return
  const s = e.bh
  const h1 = grp.userData.lod1 as THREE.Group
  if (distance < BELLHOP_LOD.build) ensureLod0(grp)
  let v = grp.userData.bhView as View | undefined
  if (!v) { v = { clip: 'idle', seq: -1, t: 0, gt: 0, fadeT: 1, prev: null, last: null, frozen: null, lod: 1 }; grp.userData.bhView = v }
  const h0 = grp.userData.lod0 as THREE.Group | undefined
  if (h0) { if (distance < BELLHOP_LOD.near) v.lod = 0; else if (distance > BELLHOP_LOD.far) v.lod = 1 } else v.lod = 1
  h1.visible = v.lod === 1; if (h0) h0.visible = v.lod === 0
  const rig = (v.lod === 0 ? grp.userData.rig0 : grp.userData.rig1) as BellhopRig
  const clip = s?.clip ?? 'idle', C = BELLHOP_CLIPS[clip]
  if (s && (s.seq !== v.seq || clip !== v.clip)) { v.prev = v.last ? cloneBellhopPose(v.last) : null; v.frozen = clip === 'stillWatch' && v.last ? cloneBellhopPose(v.last) : null; v.fadeT = 0; v.clip = clip; v.seq = s.seq; v.t = 0 }
  v.fadeT += dt; v.gt += dt
  if (C.loop) v.t += clip === 'stillWatch' ? 0 : dt // 被看着：完全定住（stillWatch 不推进）
  else v.t = s ? s.modeT : v.t + dt
  const face = s?.face ?? 0
  const opts: BellhopAnimOpts = { seed: (e.id % 7) + 1, turn: s?.headYaw || undefined, faceFrom: face }
  // 被看着（stillWatch）：直接冻结在切换那一刻的姿态（连呼吸 / 下摆二阶都停），不做混合
  const still = clip === 'stillWatch' && !!v.frozen
  let P = still ? v.frozen! : bellhopPose(clip, v.t, opts)
  if (!still && v.prev && v.fadeT < 0.2) P = mixBellhopPose(v.prev, P, v.fadeT / 0.2)
  v.last = P
  applyBellhopPose(rig, P, { ...opts, time: still ? 0 : v.gt, dt: still ? 0 : dt })
  // 另一套 LOD 的脸也跟上（切 LOD 时不会闪回旧脸）
  const other = (v.lod === 0 ? grp.userData.rig1 : grp.userData.rig0) as BellhopRig | undefined
  if (other && other.faceIndex !== face) setBellhopFace(other, face)
}

// ---------- 10F 行李房 ----------
let roomGrp: THREE.Group | null = null, roomKey = ''
const VAL_COL = ['#6b3a26', '#2e3a52', '#7a5a2e', '#4a2a2e', '#3a4a3a', '#5a4632']
function buildRoom(): THREE.Group {
  const g = new THREE.Group(); g.name = 'bellhopLuggageRoom'
  const cart = buildBellhopCart(); cart.position.set(0, 0, -0.35); cart.rotation.y = 0.2; g.add(cart)
  // 一摞行李箱（count 决定显示几只）
  const pile = new THREE.Group(); pile.name = 'pile'; g.add(pile)
  const sizes: [number, number, number][] = [[0.62, 0.22, 0.42], [0.55, 0.2, 0.38], [0.48, 0.18, 0.34], [0.4, 0.24, 0.3], [0.44, 0.16, 0.32], [0.3, 0.26, 0.3]]
  let y = 0
  sizes.forEach((sz, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...sz), new THREE.MeshStandardMaterial({ color: VAL_COL[i], roughness: 0.75, metalness: 0.05 }))
    m.position.set(0.55 + (i % 2) * 0.04, y + sz[1] / 2, 0.35 - (i % 3) * 0.03); m.rotation.y = (i * 0.37) % 0.5 - 0.25
    m.castShadow = true; m.receiveShadow = true; m.userData.i = i; pile.add(m)
    const strap = new THREE.Mesh(new THREE.BoxGeometry(sz[0] * 0.08, sz[1] + 0.004, sz[2] + 0.004), new THREE.MeshStandardMaterial({ color: '#b08d46', roughness: 0.4, metalness: 0.7 }))
    strap.position.copy(m.position); strap.rotation.copy(m.rotation); strap.userData.i = i; pile.add(strap)
    y += sz[1]
  })
  // 铜牌「行李寄存 BAGGAGE」
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.1, 10), new THREE.MeshStandardMaterial({ color: '#b08d46', roughness: 0.35, metalness: 0.8 }))
  post.position.set(-0.75, 0.55, 0.3); g.add(post)
  const plateMat = (() => {
    if (typeof document === 'undefined') return new THREE.MeshStandardMaterial({ color: '#c9a45a' })
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d')!
    x.fillStyle = '#2a1414'; x.fillRect(0, 0, 256, 128); x.strokeStyle = '#d4a94a'; x.lineWidth = 6; x.strokeRect(6, 6, 244, 116)
    x.fillStyle = '#e8c97a'; x.textAlign = 'center'; x.font = 'bold 40px serif'; x.fillText('行李寄存', 128, 62); x.font = '22px serif'; x.fillText('BAGGAGE · 10F', 128, 100)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.3 })
  })()
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.21, 0.02), plateMat); plate.position.set(-0.75, 1.18, 0.3); g.add(plate)
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
  return g
}
/** 每帧：10F 时把行李房放到绝对坐标（场景 x = 窗口 x、场景 z = 窗口 y）；count = 行李房里还剩几件 */
export function syncBellhopRoom(scene: THREE.Scene, room: { x: number; y: number } | null, count: number, gz = 0) {
  if (!room) { if (roomGrp) { scene.remove(roomGrp); roomGrp = null; roomKey = '' } return }
  if (!roomGrp) { roomGrp = buildRoom(); scene.add(roomGrp) }
  const key = `${room.x.toFixed(2)},${room.y.toFixed(2)},${count}`
  if (key === roomKey) return
  roomKey = key
  roomGrp.position.set(room.x, gz, room.y)
  const show = Math.min(6, count)
  for (const c of (roomGrp.getObjectByName('pile') as THREE.Group).children) c.visible = (c.userData.i as number) < show
}
