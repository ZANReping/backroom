// [window] 窗户 Entity 2：把 AI 状态（windowAI）映射到 windowAnim 片段，并把模型摆到挂墙位姿上。
// 在 renderer 的实体循环末尾调用：覆盖通用实体动画写下的位置 / 朝向 / 缩放。
import * as THREE from 'three'
import type { Entity } from '../entities'
import { windowRenderState } from '../engine/windowAI'
import { animateWindow, type WindowClip } from './windowAnim'

const tmp = new THREE.Vector3()
export function animateWindowEntity(grp: THREE.Object3D, e: Entity, time: number, px: number, py: number, ox: number, oy: number): void {
  const rs = windowRenderState(e)
  if (!rs) return
  const ax = rs.wx - ox, ay = rs.wy - oy
  grp.position.set(ax, 0, ay)
  grp.rotation.set(0, rs.yaw, 0)
  // L2 / L601 与普通窗户同框：略放大一点盖住底下的普通窗户；L4 本身就在雨窗前 9cm
  grp.scale.setScalar(rs.style === 'l4' ? 1 : 1.015)
  // 玩家胸口在窗户局部坐标里的位置（手臂瞄准）
  const dx = px - ax, dz = py - ay, c = Math.cos(rs.yaw), s = Math.sin(rs.yaw)
  tmp.set(dx * c - dz * s, 1.25, dx * s + dz * c)
  const clip: WindowClip = rs.mode
  animateWindow(grp, clip, rs.modeT, { sil: rs.sil, target: tmp, time })
}
