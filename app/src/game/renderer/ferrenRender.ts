// [ferren] Ferren（Entity 92）重制·阶段 3：渲染接入。renderer 的通用实体分支跳过 ferren（不再改它的腿/臂/头/躯干），改由这里
// 按 ferrenAI 的状态（e.fr.clip / clipT / speed / inNest）驱动 ferrenAnim：
//   · 走 / 跑片段按实际移动速度同步步频（片段时间推进率 = speed / FERREN_CLIPS[clip].speed），原地片段按真实时间循环；
//   · 不循环的片段（noclip 切行、stretch 伸懒腰）直接用 AI 的片段时间，保证「消失的那一刻」和 AI 的换位同一帧；
//   · 片段切换时用 mixFerrenPose 在 BLEND 秒内从上一片段混到新片段（上一片段继续推进）；
//   · 进窝时整只抬到窝垫面（buildFerrenNestMesh 的 userData.nest.bedY），盖过被子就在身上显示小被子。
import * as THREE from 'three'
import type { Entity } from '../entities'
import { applyFerrenPose, ferrenPose, FERREN_CLIPS, mixFerrenPose, type FerrenClip } from './ferrenAnim'
import { buildFerrenBlanketMesh, type FerrenRig } from './ferrenMesh'

export const FERREN_RENDER = {
  BLEND: 0.28, // 片段切换混合时长（秒）
  NEST_SCALE: 1.35, // 游戏里的窝按这个倍数放大（蜷睡团外廓约 0.32 × 0.36 m，原尺寸的窝垫只有 0.37 m）
  NEST_BED_Y: 0.053, // ≈ buildFerrenNestMesh().userData.nest.bedY（0.045）× NEST_SCALE 再减去垫子中间的下凹
  NEST_LIFT_RATE: 6, // 进 / 出窝时抬升的跟随速率
  MIN_GAIT_RATE: 0.35, // 走 / 跑片段最低推进率（刚起步 / 将停时不至于原地定格）
  MAX_GAIT_RATE: 2.6,
}
const AI_TIMED = new Set<FerrenClip>(['noclip', 'stretch'])

export interface FerrenAnimState { clip: FerrenClip; t: number; prev: FerrenClip | null; prevT: number; k: number; lift: number }

/** 片段时间推进：走 / 跑按速度同步，AI 计时片段直接取 AI 时间，其余按真实时间 */
export function advanceFerrenClip(clip: FerrenClip, t: number, dt: number, speed: number, aiT?: number): number {
  if (AI_TIMED.has(clip) && aiT !== undefined) return aiT
  const C = FERREN_CLIPS[clip]
  if (C.speed > 0) return t + dt * Math.min(FERREN_RENDER.MAX_GAIT_RATE, Math.max(FERREN_RENDER.MIN_GAIT_RATE, speed / C.speed))
  return t + dt
}

/** 推进动画状态（不碰网格；Node 验收也能直接跑） */
export function stepFerrenAnim(st: FerrenAnimState, e: Entity, dt: number) {
  const s = e.fr
  const want: FerrenClip = s?.clip ?? 'idle'
  if (want !== st.clip) { st.prev = st.clip; st.prevT = st.t; st.clip = want; st.t = AI_TIMED.has(want) ? (s?.clipT ?? 0) : 0; st.k = 0 }
  else st.t = advanceFerrenClip(st.clip, st.t, dt, s?.speed ?? 0, s?.clipT)
  if (st.prev) { st.prevT = advanceFerrenClip(st.prev, st.prevT, dt, s?.speed ?? 0); st.k += dt / FERREN_RENDER.BLEND; if (st.k >= 1) { st.prev = null; st.k = 1 } }
  const wantLift = s?.inNest ? FERREN_RENDER.NEST_BED_Y : 0
  st.lift += (wantLift - st.lift) * Math.min(1, dt * FERREN_RENDER.NEST_LIFT_RATE)
  return st
}
const ease = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }

/** 按当前睡姿量躯干顶面高度（实体组局部坐标，1 cm 格），做成小被子的垂布包络 */
const _m = new THREE.Matrix4(), _v = new THREE.Vector3()
function blanketFor(grp: THREE.Group): THREE.Mesh {
  const rig = grp.userData.ferren as FerrenRig
  grp.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert()
  // 躯干 + 尾巴 + 脖子（头骨上的脸不算：被子在那里开口）；从上往下打射线量顶面（形变后的几何先重算包围球）
  const meshes: THREE.Mesh[] = [rig.torso, rig.tailMesh, ...rig.head.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[]]
  for (const mm of meshes) { mm.geometry.computeBoundingSphere(); mm.geometry.computeBoundingBox() }
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0)
  let sx = 0, sz = 0, nn = 0
  _m.multiplyMatrices(inv, rig.torso.matrixWorld)
  const pa = rig.torso.geometry.attributes.position
  for (let i = 0; i < pa.count; i += 3) { _v.fromBufferAttribute(pa, i).applyMatrix4(_m); sx += _v.x; sz += _v.z; nn++ }
  const hits = new Map<string, number>()
  const top = (x: number, z: number) => {
    const k = Math.round(x * 400) + ',' + Math.round(z * 400)
    const c = hits.get(k); if (c !== undefined) return c
    ray.set(new THREE.Vector3(x, 1, z).applyMatrix4(grp.matrixWorld), down)
    const h = ray.intersectObjects(meshes, false)[0]
    const y = h ? h.point.applyMatrix4(inv).y : -1
    hits.set(k, y); return y
  }
  // 先在被子范围内量一张 1 cm 网格，没打到身体的地方从最近的身体边缘陡峭垂下
  const cx = sx / nn, cz = sz / nn, r = 0.18, pts: [number, number, number][] = []
  for (let x = cx - r; x <= cx + r; x += 0.01) for (let z = cz - r; z <= cz + r; z += 0.01) { const y = top(x, z); if (y > 0) pts.push([x, z, y]) }
  const drape = (x: number, z: number) => { const y = top(x, z); if (y > 0) return y; let h = 0; for (const [px, pz, py] of pts) { const v = py - 3 * Math.hypot(x - px, z - pz); if (v > h) h = v } return h }
  // 头（头骨中心往吻部前移一点）那里开个口，被子盖到脖子，脸露在外面
  const hp = new THREE.Vector3(0, 0, 0.045).applyMatrix4(rig.skull.matrixWorld).applyMatrix4(inv)
  return buildFerrenBlanketMesh(drape, cx, cz, r, { x: hp.x, z: hp.z, r: 0.07 })
}

export function animateFerrenEntity(grp: THREE.Group, e: Entity, dt: number, gz: number, tucked: boolean) {
  const st = (grp.userData.ferrenAnim ??= { clip: e.fr?.clip ?? 'idle', t: 0, prev: null, prevT: 0, k: 1, lift: e.fr?.inNest ? FERREN_RENDER.NEST_BED_Y : 0 }) as FerrenAnimState
  stepFerrenAnim(st, e, dt)
  const cur = ferrenPose(st.clip, st.t)
  applyFerrenPose(grp, st.prev ? mixFerrenPose(ferrenPose(st.prev, st.prevT), cur, ease(st.k)) : cur)
  grp.position.y = gz + st.lift
  // 小被子：盖过、在窝里、在睡
  let bl = grp.userData.ferrenBlanket as THREE.Mesh | undefined
  const show = tucked && !!e.fr?.inNest && st.clip === 'sleep'
  if (show && !bl) { bl = blanketFor(grp); grp.add(bl); grp.userData.ferrenBlanket = bl }
  if (bl) bl.visible = show
}
