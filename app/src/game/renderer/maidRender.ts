// [maid] 管家（Entity 111）阶段 3：渲染接入。
//   · buildMaidEntityMesh：实体根组（正面 +X）= 管家模型 + 清洁车（推在手里时挂在身前 MD.cartAhead）。
//   · animateMaidEntity：按 maidAI 的 e.md.clip / seq 驱动 maidAnim（clip 或 seq 变化就重播，0.25 s 淡入）；
//     推车走 / 逼近按实际速度同步步频；车停下时（e.md.cart）把车固定在世界坐标。
import * as THREE from 'three'
import type { MaidClip } from './maidAnim'
import type { Entity } from '../entities'
import { buildMaidMesh, buildMaidCartMesh } from './maidMesh'
import { createMaidAnimator, MAID_SPEED, type MaidAnimator } from './maidAnim'
import { MD } from '../engine/maidAI'

/** 图鉴档案的四个定格姿态（archiveViews 按个体序号轮换）：巡楼推车 / 扫地 / 嘘声警告 / 放下推车走来 */
export const MAID_ARCHIVE_POSES = [
  { clip: 'push', t: 0.35, label: '巡楼', cart: null },
  { clip: 'sweep', t: 0.9, label: '打扫走廊', cart: [0.5, -1.15, 0.5] },
  { clip: 'shush', t: 0.85, label: '「请安静」', cart: [0.35, -1.1, 0.35] },
  { clip: 'approach', t: 0.4, label: '朝你走来', cart: [-1.7, 0.35, 0.2] },
] as const satisfies readonly { clip: MaidClip; t: number; label: string; cart: readonly [number, number, number] | null }[]

export function buildMaidEntityMesh(archivePose?: number): THREE.Group {
  const root = new THREE.Group(); root.name = 'maidEntity'
  const maid = buildMaidMesh(); root.add(maid)
  const cart = buildMaidCartMesh(); cart.position.set(MD.cartAhead, 0, 0); root.add(cart)
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
  root.userData.entityType = 'maid'; root.userData.maidModel = maid; root.userData.maidCart = cart
  if (archivePose !== undefined) {
    const P = MAID_ARCHIVE_POSES[((archivePose % MAID_ARCHIVE_POSES.length) + MAID_ARCHIVE_POSES.length) % MAID_ARCHIVE_POSES.length]
    const an = createMaidAnimator(maid); an.play(P.clip, 0)
    for (let t = 0; t < P.t; t += 1 / 30) an.update(Math.min(1 / 30, P.t - t), { look: [0.9, 0.1] })
    if (P.cart) { cart.position.set(P.cart[0], 0, P.cart[1]); cart.rotation.set(0, P.cart[2], 0) }
  }
  return root
}

interface MaidView { an: MaidAnimator; seq: number; clip: string }
export function animateMaidEntity(grp: THREE.Group, e: Entity, dt: number, gz: number) {
  const maid = grp.userData.maidModel as THREE.Object3D | undefined, cart = grp.userData.maidCart as THREE.Object3D | undefined
  if (!maid || !cart) return
  const s = e.md
  let v = grp.userData.maidView as MaidView | undefined
  if (!v) { v = { an: createMaidAnimator(maid), seq: -1, clip: '' }; grp.userData.maidView = v }
  const clip = s?.clip ?? 'push'
  if (s && (s.seq !== v.seq || clip !== v.clip)) { v.an.play(clip, 0.25); v.seq = s.seq; v.clip = clip }
  const gait = clip === 'push' ? MAID_SPEED.push : clip === 'approach' ? MAID_SPEED.approach : 0
  const rate = gait ? Math.min(1.5, (s?.speed ?? 0) / gait) : 1
  v.an.update(dt * rate, { look: s?.look ?? [0, 0] })
  // 清洁车：推在手里 → 挂在身前；停下 → 固定在世界坐标（换算到实体组局部）
  if (!s?.cart) { cart.position.set(MD.cartAhead, 0, 0); cart.rotation.set(0, 0, 0) }
  else {
    const th = grp.rotation.y, wx = s.cart.x - e.x, wz = s.cart.y - e.y, c = Math.cos(th), sn = Math.sin(th)
    cart.position.set(wx * c - wz * sn, 0, wx * sn + wz * c)
    cart.rotation.set(0, -s.cart.f - th, 0)
  }
  void gz
}
