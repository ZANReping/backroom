// [concierge] 看门人（Entity 131）阶段 3：渲染接入。
//   · buildConciergeEntityMesh：实体根组（正面 +X）= LOD1（1.5 万三角形，立即建）+ LOD0（6.4 万，第一次走近 14 m 内才建）；
//     9 m 内用 LOD0、11 m 外用 LOD1（中间保持，防抖）。GPU 蒙皮；?cpu=1 时由 qaCpuSkin 全局替身接管（LOD 切换切的是父组可见性）。
//   · 前台（1F）：柜台 + 钥匙墙 + 台式电话 + 嵌墙送菜升降梯，挂在实体组下、每帧按世界坐标反算（不进 chunk 结构）。
//     他不在接电话时，台上放着话筒和盘好的电话线（静态）；phone 片段里由 conciergeAnim 画动态螺旋线。
//   · 别的楼层抓到人：送菜升降梯（墙里的小木厢）出现在 AI 选好的墙上（e.cg.lift）。
//   · 动画：按 e.cg.clip / seq 切换（0.2 s 混合；blinkTeleport 冻结切换瞬间的姿态）；非循环片段时间直接用 AI 的 modeT（与逻辑同步），
//     循环片段（walk / run / drag）按实际速度推进步频；giveKey 倒放 = 收下 437 钥匙挂回墙上。
import * as THREE from 'three'
import type { Entity } from '../entities'
import { buildConciergeMesh, type ConciergeRig } from './conciergeMesh'
import { CONCIERGE_CLIPS, CONCIERGE_DESK, CONCIERGE_PHONE_DESK, CONCIERGE_HANDSET_EXIT, CONCIERGE_PHONE_SOCKET, applyConciergePose, conciergePose, cloneConciergePose, mixConciergePose, conciergeCradlePose, type ConciergeClip, type ConciergePose, type ConciergeAnimOpts } from './conciergeAnim'
import { buildConciergeDeskMesh, buildDumbwaiterMesh } from './conciergeProps'
import { createCord, updateCord } from './conciergeCord'
import { CG_DESK, cgLocal } from '../engine/conciergeAI'
import type { V3 } from './conciergeRig'

/** LOD 切换距离（米）：< near 用 LOD0，> far 用 LOD1，之间保持；build 内才建 LOD0 */
export const CONCIERGE_LOD = { near: 9, far: 11, build: 14 }

/** 图鉴档案四个定格姿态（archiveViews 按个体序号轮换） */
export const CONCIERGE_ARCHIVE_POSES = [
  { clip: 'phone', t: 2.6, label: '前台接电话', desk: true },
  { clip: 'armWatch', t: 1.4, label: '抬起前臂「看」你', desk: false },
  { clip: 'talk', t: 1.4, label: '「你需要帮助吗？」', desk: false },
  { clip: 'gnawMetal', t: 0.5, label: '啃银餐具', desk: false },
] as const satisfies readonly { clip: ConciergeClip; t: number; label: string; desk: boolean }[]

interface View { clip: ConciergeClip; seq: number; t: number; gt: number; fadeT: number; prev: ConciergePose | null; frozen: ConciergePose | null; last: ConciergePose | null; lod: 0 | 1 }

export function buildConciergeEntityMesh(archivePose?: number): THREE.Group {
  const root = new THREE.Group(); root.name = 'conciergeEntity'
  root.userData.entityType = 'concierge'
  const holder1 = new THREE.Group(); holder1.name = 'conciergeLOD1'; root.add(holder1)
  const m1 = buildConciergeMesh({ lod: archivePose !== undefined ? 0 : 1 }); holder1.add(m1)
  root.userData.lod1 = holder1; root.userData.rig1 = m1.userData.concierge
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
  if (archivePose !== undefined) {
    const P = CONCIERGE_ARCHIVE_POSES[((archivePose % CONCIERGE_ARCHIVE_POSES.length) + CONCIERGE_ARCHIVE_POSES.length) % CONCIERGE_ARCHIVE_POSES.length]
    const rig = m1.userData.concierge as ConciergeRig
    const opts: ConciergeAnimOpts = { seed: 3, desk: P.desk, target: P.clip === 'armWatch' ? [0.4, 1.5, 2.4] : [0, 1.6, 2.2], phoneDesk: P.desk ? CONCIERGE_PHONE_DESK : null }
    for (let t = Math.max(0, P.t - 0.6); t <= P.t; t += 1 / 30) applyConciergePose(rig, conciergePose(P.clip, t, opts), { ...opts, time: t, dt: 1 / 30 })
    if (P.desk) { const desk = buildConciergeDeskMesh(); desk.position.set(...CONCIERGE_DESK.desk); desk.rotation.y = 0; m1.add(desk) }
    root.userData.archive = true
  }
  return root
}

function ensureLod0(grp: THREE.Group): THREE.Group {
  let h = grp.userData.lod0 as THREE.Group | undefined
  if (h) return h
  h = new THREE.Group(); h.name = 'conciergeLOD0'; h.visible = false
  const m0 = buildConciergeMesh({ lod: 0 }); h.add(m0)
  m0.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
  grp.add(h); grp.userData.lod0 = h; grp.userData.rig0 = m0.userData.concierge
  return h
}

/** 世界坐标（游戏平面 x / y + 高度）→ 实体组局部；yaw = 模型（+Z 正面）在世界里的朝向 f */
function placeWorld(grp: THREE.Group, obj: THREE.Object3D, wx: number, wy: number, wz: number, f: number) {
  const th = grp.rotation.y, dx = wx - grp.position.x, dz = wy - grp.position.z, c = Math.cos(th), s = Math.sin(th)
  obj.position.set(dx * c - dz * s, wz - grp.position.y, dx * s + dz * c)
  obj.rotation.set(0, -f + Math.PI / 2 - th, 0)
}
/** 世界点 → 模型（root 骨）空间：+Z 前、+X 左 */
function toModel(grp: THREE.Group, w: [number, number, number]): V3 {
  const f = -grp.rotation.y, dx = w[0] - grp.position.x, dy = w[2] - grp.position.z
  return [dx * Math.sin(f) - dy * Math.cos(f), w[1], dx * Math.cos(f) + dy * Math.sin(f)]
}

interface Props { desk: THREE.Group; deskLift: THREE.Group; lift: THREE.Group; restSet: THREE.Group | null }
function props(grp: THREE.Group, rig: ConciergeRig): Props {
  let P = grp.userData.cgProps as Props | undefined
  if (P) return P
  const desk = new THREE.Group(); desk.name = 'conciergeDeskSet'
  const d = buildConciergeDeskMesh(); d.position.set(...CONCIERGE_DESK.desk); desk.add(d)
  const mkLift = () => { const l = buildDumbwaiterMesh(); l.children[0].visible = false; return l } // 去掉示意用的绿墙板
  const deskLift = mkLift(); desk.add(deskLift)
  deskLift.position.set(CG_DESK.lift[0], 0, CG_DESK.lift[1]); deskLift.rotation.y = 0
  const lift = mkLift(); lift.visible = false
  grp.add(desk, lift)
  desk.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
  // 台上静置的话筒 + 盘好的电话线（他不在接电话时显示）
  let restSet: THREE.Group | null = null
  try {
    const cm = conciergeCradlePose(rig)
    restSet = new THREE.Group(); restSet.name = 'phoneRest'
    const hs = rig.handset.clone(true); hs.visible = true; hs.traverse((x) => { if (x.name === 'cord') x.visible = false })
    const b = CONCIERGE_PHONE_DESK.base
    const M = new THREE.Matrix4().makeTranslation(b[0], b[1], b[2]).multiply(cm)
    M.decompose(hs.position, hs.quaternion, hs.scale); restSet.add(hs)
    const cord = createCord(); cord.mesh.visible = true
    const A = new THREE.Vector3(b[0] + CONCIERGE_PHONE_SOCKET[0], b[1] + CONCIERGE_PHONE_SOCKET[1], b[2] + CONCIERGE_PHONE_SOCKET[2])
    const B = CONCIERGE_HANDSET_EXIT.clone().applyMatrix4(M)
    updateCord(cord, A, B, [], { socket: [A.x, A.y, A.z], base: b, top: CONCIERGE_PHONE_DESK.top, rect: CONCIERGE_PHONE_DESK.rect })
    restSet.add(cord.mesh); desk.add(restSet)
  } catch { restSet = null }
  P = { desk, deskLift, lift, restSet }; grp.userData.cgProps = P
  return P
}

export interface ConciergeRenderCtx {
  /** 前台站位（窗口坐标）+ 朝向；null = 本层没有前台 */
  desk: { x: number; y: number; f: number } | null
  distance: number
}
export function animateConciergeEntity(grp: THREE.Group, e: Entity, dt: number, gz: number, ctx: ConciergeRenderCtx) {
  if (grp.userData.archive) return
  const s = e.cg
  const h1 = grp.userData.lod1 as THREE.Group
  if (ctx.distance < CONCIERGE_LOD.build) ensureLod0(grp)
  let v = grp.userData.cgView as View | undefined
  if (!v) { v = { clip: 'idle', seq: -1, t: 0, gt: 0, fadeT: 1, prev: null, frozen: null, last: null, lod: 1 }; grp.userData.cgView = v }
  // LOD
  const h0 = grp.userData.lod0 as THREE.Group | undefined
  if (h0) { if (ctx.distance < CONCIERGE_LOD.near) v.lod = 0; else if (ctx.distance > CONCIERGE_LOD.far) v.lod = 1 } else v.lod = 1
  h1.visible = v.lod === 1; if (h0) h0.visible = v.lod === 0
  const rig = (v.lod === 0 ? grp.userData.rig0 : grp.userData.rig1) as ConciergeRig
  // 片段切换
  const clip = s?.clip ?? 'idle', C = CONCIERGE_CLIPS[clip]
  if (s && (s.seq !== v.seq || clip !== v.clip)) {
    v.prev = v.last ? cloneConciergePose(v.last) : null
    v.frozen = clip === 'blinkTeleport' && v.last ? cloneConciergePose(v.last) : null
    v.fadeT = 0; v.clip = clip; v.seq = s.seq; v.t = 0
  }
  v.fadeT += dt; v.gt += dt
  // 时间：循环片段按实际速度推进；其余直接用 AI 的 modeT
  if (C.loop) { const k = C.speed ? Math.min(1.8, (s?.speed ?? 0) / Math.abs(C.speed)) : 1; v.t += dt * (C.speed ? k : 1) }
  else v.t = s ? (s.rev ? C.dur - s.modeT : s.modeT) : v.t + dt
  // 注视 / 目标
  const opts: ConciergeAnimOpts = { seed: (e.id % 7) + 1, side: 'R' }
  if (s?.gaze) opts.target = toModel(grp, s.gaze)
  const atDesk = !!s && (s.mode === 'desk' || s.mode === 'tea') && !!ctx.desk
  opts.desk = atDesk
  opts.phoneDesk = atDesk && clip === 'phone' ? CONCIERGE_PHONE_DESK : null
  let P = conciergePose(clip, v.t, { ...opts, from: v.frozen ?? undefined })
  const fade = clip === 'blinkTeleport' ? 0 : 0.2
  if (v.prev && v.fadeT < fade) P = mixConciergePose(v.prev, P, v.fadeT / fade)
  v.last = P
  applyConciergePose(rig, P, { ...opts, time: v.gt, dt })
  // 前台 / 升降梯
  const pr = props(grp, (grp.userData.rig1 as ConciergeRig))
  if (ctx.desk) {
    pr.desk.visible = true
    const [ox, oy] = [ctx.desk.x, ctx.desk.y]
    placeWorld(grp, pr.desk, ox, oy, gz, ctx.desk.f)
    if (pr.restSet) pr.restSet.visible = !(atDesk && clip === 'phone' && v.lod === 0)
    const L = s?.lift
    const deskLiftUsed = !!L && Math.hypot(L.x - (ox + cgLocal(ctx.desk.f, CG_DESK.lift[0], CG_DESK.lift[1])[0]), L.y - (oy + cgLocal(ctx.desk.f, CG_DESK.lift[0], CG_DESK.lift[1])[1])) < 0.3
    const dw = pr.deskLift.userData.dumbwaiter as { open: (k: number) => void }
    dw.open(deskLiftUsed && s!.mode === 'stuff' ? liftOpen(s!.phase, s!.modeT) : 0)
  } else pr.desk.visible = false
  const L = s?.lift
  const farLift = !!L && (!ctx.desk || pr.desk.visible && !(Math.hypot(L.x - ctx.desk.x, L.y - ctx.desk.y) < 4))
  pr.lift.visible = farLift && !!s && (s.mode === 'drag' || s.mode === 'stuff' || s.mode === 'wipe')
  if (pr.lift.visible && L) {
    placeWorld(grp, pr.lift, L.x, L.y, gz, L.f)
    ;(pr.lift.userData.dumbwaiter as { open: (k: number) => void }).open(s!.mode === 'stuff' ? liftOpen(s!.phase, s!.modeT) : s!.mode === 'drag' ? Math.min(1, s!.modeT / 1.5) : 0)
  }
  void CG_DESK.half
}
/** 升降梯拉门开度：塞人时开着，2.75 s 关上；拉绳时关着 */
const liftOpen = (phase: number, t: number) => (phase === 0 ? (t < 2.75 ? 1 : Math.max(0, 1 - (t - 2.75) / 0.4)) : 0)
