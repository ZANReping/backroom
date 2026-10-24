// [vending] 售货机渲染桥：把 vendingAI 的状态（出货片段 / 库存 / 活化状态机）映射到 vendingAnim 片段，
// 再按库存把卖光的格子藏起来、亮红灯。普通机走 renderer.updateStructs，Entity 36 走实体循环末尾。
import * as THREE from 'three'
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import type { Structure } from '../core/types'
import { vendStructRender, vm36Render, type VendRenderState } from '../engine/vendingAI'
import { animateVending } from './vendingAnim'
import type { VendingHandles } from './vendingMesh'

function vmRootOf(g: THREE.Object3D): THREE.Object3D | null {
  if (g.userData.vmRoot !== undefined) return g.userData.vmRoot as THREE.Object3D | null
  let found: THREE.Object3D | null = null
  g.traverse((o) => { if (!found && o !== g && o.userData.vending) found = o })
  g.userData.vmRoot = found
  return found
}

function apply(root: THREE.Object3D, rs: VendRenderState) {
  animateVending(root, rs.clip, rs.t, { slot: rs.slot, time: rs.t, standing: rs.standing })
  const H = root.userData.vending as VendingHandles
  H.slots.forEach((S, i) => {
    const has = (rs.stock[i] ?? 0) > 0
    const moving = i === rs.slot && (rs.clip === 'coil' || rs.clip === 'hand' || rs.clip === 'jam')
    if (S.item && !has && !moving) S.item.visible = false
    S.lampOk.visible = has; S.lampOut.visible = !has
  })
  if (H.jamItem && (rs.jamFreed || rs.jamSlot >= 0)) H.jamItem.visible = false
  if (rs.dark) {
    // 被打坏：灯箱和背光灭掉，机身歪一点
    for (const material of new Set(H.bayLights.map(m => m.material as THREE.MeshBasicMaterial))) material.color.multiplyScalar(0.12)
    ;(H.display.material as THREE.MeshBasicMaterial).color.multiplyScalar(0.05)
    H.body.rotation.z = 0.05; H.body.position.y = -0.02
  }
}

/** renderer.updateStructs：普通售货机（还没交互过的机器没有状态，保持静态） */
export function animateVendingStruct(g: THREE.Object3D, s: Structure, eng: Engine, time: number) {
  const rs = vendStructRender(eng, s, time)
  if (!rs) return
  const root = vmRootOf(g)
  if (root) apply(root, rs)
}

/** renderer 实体循环末尾：Entity 36（覆盖通用动画写下的倾斜） */
export function animateVendingEntity(grp: THREE.Object3D, e: Entity, time: number, gz: number) {
  const root = vmRootOf(grp)
  if (!root) return
  grp.rotation.x = 0; grp.rotation.z = 0; grp.position.y = gz
  apply(root, vm36Render(e, time))
}
