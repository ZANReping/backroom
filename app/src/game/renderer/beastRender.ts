// [beast] 第五层的野兽（Entity 18）阶段 3：渲染接入。
//   · buildBeastEntityMesh：实体根组（正面 +X，外层 beastMesh 组 rotation.y = π/2 / facesZ）= LOD1（约 1.5 万三角形，立即建）+ LOD0（约 6 万，走近 14 m 内才建）；
//     9 m 内用 LOD0、11 m 外用 LOD1（中间保持，防抖）。余光 / 隐入暗处时永远用 LOD1（远、短、在视野边缘），不为它建 LOD0。
//     GPU 蒙皮；?cpu=1 时由 qaCpuSkin 全局替身接管（LOD 切换切的是父组可见性）。
//   · animateBeastEntity：按 beastAI 的 e.bst.clip / seq 切片段（混合时长 = AI 给的 blend：起身 / 坐下 0.8 s，其余 0.2 s）；
//     非循环片段时间直接用 AI 的 modeT（与逻辑同步：握手握住 1.3 s = 契约生效、缠抓 1.3 s = 缠住）。
//     opts：target = e.bst.lookP（头眼盯着你）、shakeP = e.bst.shakeP（握点 = 你手的真实位置）、grabTarget / grabR（缠抓点 = 你的躯干）、flash（婉拒时的恼怒闪色叠加）。
//     色素随状态：片段自带（平静斑驳 / 握手云纹 / 怀疑变白 / 恼怒红褐 / 真身威胁色 / 隐入近黑）；余光里再按你的恐惧（1 − 理智）加深（「他嗅得到恐惧」）。
//     vanish：P.fade 由动画淡出（beastVanishState），fade < 0.6 时关掉阴影；AI 在 vanish 结束时移除实体。
//   · syncBeastLivePortrait：117 办公室那幅他的画像是活的——离屏渲染一只 LOD1 的他（portraitGaze，头眼跟着你转），10 Hz 写进画布贴图；
//     渲染前后保存 / 恢复全局 BEAST_CHROMA uniform（画像里的他不影响书桌后那位的色素）。
import * as THREE from 'three'
import type { Entity } from '../entities'
import { buildBeast, beastGeometryReady, BEAST_CHROMA, type BeastRig } from './beastMesh'
import { BEAST_CLIPS, beastPose, mixBeastPose, cloneBeastPose, applyBeastPose, resetBeastDynamics, type BeastClip, type BeastPose, type BeastAnimOpts } from './beastAnim'
import type { V3 } from './beastRig'

/** LOD 切换距离（米）：< near 用 LOD0，> far 用 LOD1，之间保持；build 内才建 LOD0 */
export const BEAST_LOD = { near: 9, far: 11, build: 14 }

/** 图鉴档案四个定格姿态（archiveViews 按个体序号轮换） */
export const BEAST_ARCHIVE_POSES = [
  { clip: 'idle', t: 1.2, label: '绅士' },
  { clip: 'talk', t: 1.0, label: '「都很公道。」' },
  { clip: 'peripheralStill', t: 1.0, label: '余光里' },
  { clip: 'reveal', t: 3.2, label: '真身' },
] as const satisfies readonly { clip: BeastClip; t: number; label: string }[]

interface View { clip: BeastClip; seq: number; t: number; gt: number; fadeT: number; blend: number; prev: BeastPose | null; last: BeastPose | null; lod: 0 | 1 }

const shadowsOn = (o: THREE.Object3D, on: boolean) => o.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.castShadow = on; m.receiveShadow = true } })

export function buildBeastEntityMesh(archivePose?: number): THREE.Group {
  const root = new THREE.Group(); root.name = 'beastEntity'
  root.userData.entityType = 'beast'
  const holder1 = new THREE.Group(); holder1.name = 'beastLOD1'; root.add(holder1)
  const m1 = buildBeast({ lod: archivePose !== undefined ? 0 : 1 }); holder1.add(m1)
  root.userData.lod1 = holder1; root.userData.rig1 = m1.userData.beast
  shadowsOn(root, true)
  if (archivePose !== undefined) {
    const P = BEAST_ARCHIVE_POSES[((archivePose % BEAST_ARCHIVE_POSES.length) + BEAST_ARCHIVE_POSES.length) % BEAST_ARCHIVE_POSES.length]
    const rig = m1.userData.beast as BeastRig
    resetBeastDynamics(rig, 0)
    const opts: BeastAnimOpts = { seed: 3, target: [0.4, 1.6, 2] }
    for (let t = Math.max(0, P.t - 0.6); t <= P.t + 1e-6; t += 1 / 30) applyBeastPose(rig, beastPose(P.clip, t, opts), { ...opts, time: t, dt: 1 / 30 })
    root.userData.archive = true
  }
  return root
}

function ensureLod0(grp: THREE.Group): THREE.Group {
  let h = grp.userData.lod0 as THREE.Group | undefined
  if (h) return h
  h = new THREE.Group(); h.name = 'beastLOD0'; h.visible = false
  const m0 = buildBeast({ lod: 0 }); h.add(m0)
  shadowsOn(m0, true)
  grp.add(h); grp.userData.lod0 = h; grp.userData.rig0 = m0.userData.beast
  return h
}

export interface BeastViewCtx { /** 玩家恐惧 0..1（= 1 − 理智 / 100）：余光里色素加深 */ fear?: number; preparedOnly?: boolean }
/** 余光 / 隐入暗处：不为它建 LOD0 */
const FAR_MODES = new Set(['peri', 'vanish'])
export function animateBeastEntity(grp: THREE.Group, e: Entity, dt: number, distance: number, ctx: BeastViewCtx = {}) {
  if (grp.userData.archive) return
  const s = e.bst
  const far = !!s && FAR_MODES.has(s.mode)
  if (distance < BEAST_LOD.build && !far && (!ctx.preparedOnly || beastGeometryReady(0))) ensureLod0(grp)
  let v = grp.userData.bstView as View | undefined
  if (!v) { v = { clip: s?.clip ?? 'seatedIdle', seq: -1, t: 0, gt: 0, fadeT: 1, blend: 0.2, prev: null, last: null, lod: 1 }; grp.userData.bstView = v }
  const h1 = grp.userData.lod1 as THREE.Group, h0 = grp.userData.lod0 as THREE.Group | undefined
  const prevLod = v.lod
  if (h0 && !far) { if (distance < BEAST_LOD.near) v.lod = 0; else if (distance > BEAST_LOD.far) v.lod = 1 } else v.lod = 1
  h1.visible = v.lod === 1; if (h0) h0.visible = v.lod === 0
  const rig = (v.lod === 0 ? grp.userData.rig0 : grp.userData.rig1) as BeastRig
  if (prevLod !== v.lod && v.last) resetBeastDynamics(rig, v.gt) // 换 LOD：新 rig 的二阶从当前相位起
  const clip = s?.clip ?? 'seatedIdle', C = BEAST_CLIPS[clip]
  if (s && (s.seq !== v.seq || clip !== v.clip)) { v.prev = v.last ? cloneBeastPose(v.last) : null; v.fadeT = 0; v.blend = s.blend || 0.2; v.clip = clip; v.seq = s.seq; v.t = 0 }
  v.fadeT += dt; v.gt += dt
  if (C.loop) v.t += dt
  else v.t = s ? s.modeT : v.t + dt
  const opts: BeastAnimOpts = {
    seed: (e.id % 7) + 1,
    target: s?.lookP ?? undefined, grabTarget: s?.grabP ?? undefined, grabR: s?.grabR, shakeP: (s?.shakeP ?? undefined) as V3 | undefined, flash: s?.flash || undefined,
  }
  let P = beastPose(clip, v.t, { ...opts, time: v.gt })
  if (v.prev && v.fadeT < v.blend) P = mixBeastPose(v.prev, P, smooth(v.fadeT / v.blend))
  if (s?.mode === 'peri' && ctx.fear) { const k = Math.min(1, ctx.fear); P.chroma.expand += 0.45 * k; P.chroma.eyeRing += 0.5 * k; P.chroma.dark = Math.min(1, P.chroma.dark + 0.25 * k) } // 嗅到恐惧：越怕他越暗
  v.last = P
  applyBeastPose(rig, P, { ...opts, time: v.gt, dt })
  const fadeOk = P.fade > 0.6
  if (grp.userData.shadowOn !== fadeOk) { shadowsOn(grp, fadeOk); grp.userData.shadowOn = fadeOk }
  grp.userData.beastFade = P.fade; grp.userData.beastForm = P.form
}
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }

// ---------- 117 办公室：活的画像（离屏渲染 portraitGaze）----------
interface Live { rt: THREE.WebGLRenderTarget; scene: THREE.Scene; cam: THREE.PerspectiveCamera; grp: THREE.Group; rig: BeastRig; t: number; acc: number; canvas: THREE.Mesh; old: THREE.Material | THREE.Material[] }
const LIVE = new WeakMap<THREE.Object3D, Live>()
const _v = new THREE.Vector3()
function snapChroma() { const o: Record<string, unknown> = {}; for (const [k, u] of Object.entries(BEAST_CHROMA)) { const val = (u as { value: unknown }).value; o[k] = val && typeof val === 'object' && 'clone' in (val as object) ? (val as { clone(): unknown }).clone() : val } return o }
function restoreChroma(o: Record<string, unknown>) { for (const [k, u] of Object.entries(BEAST_CHROMA)) { const val = o[k], U = u as { value: unknown }; if (val && typeof val === 'object' && 'copy' in (U.value as object)) (U.value as { copy(x: unknown): void }).copy(val); else U.value = val } }
/** 每帧（renderer.updateStructs，只在 117）：portrait = buildL5Portrait 的组；eye = 镜头世界坐标。syncCpu = QA CPU 蒙皮同步函数（?cpu=1） */
export function syncBeastLivePortrait(three: THREE.WebGLRenderer, portrait: THREE.Object3D, eye: THREE.Vector3, dt: number, syncCpu?: (s: THREE.Scene) => void): boolean {
  const pr = portrait.userData.portrait as { front: THREE.Group; pupils: THREE.Mesh[] } | undefined
  if (!pr || portrait.userData.flipped) return false
  let L = LIVE.get(portrait)
  if (!L) {
    const canvas = pr.front.children.find((c) => (c as THREE.Mesh).isMesh && ((c as THREE.Mesh).geometry as THREE.BufferGeometry).type === 'PlaneGeometry') as THREE.Mesh | undefined
    if (!canvas) return false
    const rt = new THREE.WebGLRenderTarget(192, 240, { depthBuffer: true }); rt.texture.colorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#0c1210')
    scene.add(new THREE.AmbientLight('#2a3a36', 0.6))
    const key = new THREE.SpotLight('#7fd8cc', 30, 6, 0.6, 0.6); key.position.set(1.0, 2.3, 1.6); key.target.position.set(0, 1.6, 0); scene.add(key, key.target) // 附图同款：左前方冷青聚光
    const rim = new THREE.PointLight('#7a2a30', 6, 4); rim.position.set(-0.8, 1.9, -0.8); scene.add(rim)
    const fill = new THREE.PointLight('#f0d0c8', 2.5, 3); fill.position.set(-0.4, 1.2, 1.2); scene.add(fill)
    const grp = buildBeast({ lod: 1 }); scene.add(grp)
    grp.rotation.y = 0 // 外层组正面 +X → 让 root +Z 朝镜头：buildBeast 外层已 rotation.y = π/2（root +Z → +X），这里改回 0 让 +Z 朝 +Z
    const cam = new THREE.PerspectiveCamera(26, 192 / 240, 0.1, 10); cam.position.set(0, 1.62, 1.55); cam.lookAt(0, 1.56, 0)
    L = { rt, scene, cam, grp, rig: grp.userData.beast as BeastRig, t: 0, acc: 1, canvas, old: canvas.material }
    canvas.material = new THREE.MeshLambertMaterial({ map: rt.texture, emissive: new THREE.Color('#ffffff'), emissiveMap: rt.texture, emissiveIntensity: 0.35 })
    for (const p of pr.pupils) p.visible = false
    for (const c of pr.front.children) if (c !== canvas && (c as THREE.Mesh).isMesh) c.visible = false // 眼白圆片也藏起来：眼睛在离屏画面里自己转
    LIVE.set(portrait, L)
  }
  L.t += dt; L.acc += dt
  if (L.acc < 0.1) return true
  const step = L.acc; L.acc = 0
  // 镜头在画像局部坐标（画面中心原点、+z 朝屋里）→ 画里他的 root 空间：+X = 他的左 = 画面右
  _v.copy(eye); pr.front.worldToLocal(_v)
  const target: V3 = [_v.x * 0.9, 1.6 + _v.y * 0.8, Math.max(0.6, _v.z)]
  const saved = snapChroma()
  applyBeastPose(L.rig, beastPose('portraitGaze', L.t, { target, time: L.t }), { target, time: L.t, dt: step })
  L.grp.updateMatrixWorld(true)
  syncCpu?.(L.scene)
  const prev = three.getRenderTarget()
  three.setRenderTarget(L.rt); three.render(L.scene, L.cam); three.setRenderTarget(prev)
  restoreChroma(saved)
  return true
}
/** 离开办公室：释放离屏资源，画布换回原贴图 */
export function disposeBeastLivePortrait(portrait: THREE.Object3D) {
  const L = LIVE.get(portrait); if (!L) return
  L.rt.dispose(); L.canvas.material = L.old
  LIVE.delete(portrait)
}
