// [casino] Level 5.1 阶段 4：员工渲染接入——每帧读 engine/casinoStaff.staffList，摆模型、播 casinoStaffAnim 片段（inPlace：位移由 AI 给）。
//   LOD：< 8 m LOD0、< 18 m LOD1、更远 LOD2（±1 m 迟滞）；> CS.lodCull（42 m）整只隐藏、不解算骨骼。
//   建模分帧：每帧最多新建 1 个 LOD 网格（buildCasinoStaff 的几何按 who/lod/palette 缓存，同款第二只是零成本）；新 LOD 建好前沿用已有的。
//   Louie 脸：材质先用 256² 预览烘焙，2048² 正式烘焙由 casinoStaffLouieFace.bakeLouieFaceAsync 在 idle 回调里分块做完再换（不卡主线程）。
//   野兽挑战时：野兽（beastRender 实体网格，假实体驱动 seatedIdle / talk / reveal）坐在 VIP 牌桌对面。
import * as THREE from 'three'
import type { Engine } from '../engine'
import { buildCasinoStaff } from './casinoStaffMesh'
import { animateStaff, newStaffDyn, type StaffDyn } from './casinoStaffAnim'
import { staffList, CS, type StaffAgent } from '../engine/casinoStaff'
import { casinoBeastView } from '../engine/casinoAI'
import { buildBeastEntityMesh, animateBeastEntity } from './beastRender'
import type { Entity } from '../entities'

export const STAFF_RLOD = { b0: 8, b1: 18, hyst: 1 }
interface View { root: THREE.Group; lods: (THREE.Group | null)[]; lod: number; dyn: StaffDyn; seq: number; t: number }
const VIEWS = new WeakMap<THREE.Object3D, Map<number, View>>()
export interface StaffRenderStats { agents: number; visible: number; built: number; lods: number[] }
let lastStats: StaffRenderStats = { agents: 0, visible: 0, built: 0, lods: [0, 0, 0] }
export const casinoStaffRenderStats = () => lastStats
let beastGrp: THREE.Group | null = null
const fakeBeast = { id: 18, bst: { clip: 'seatedIdle', seq: 0, blend: 0.6, modeT: 0, mode: 'casino' } } as unknown as Entity

export function syncCasinoStaff(parent: THREE.Object3D, eng: Engine, dt: number, cam: THREE.Vector3) {
  let map = VIEWS.get(parent)
  if (!map) { map = new Map(); VIEWS.set(parent, map) }
  const list = staffList(eng)
  let builtThisFrame = 0, vis = 0
  const lods = [0, 0, 0]
  for (const a of list) {
    let v = map.get(a.id)
    if (!v) { const root = new THREE.Group(); root.name = 'casinoStaff-' + a.who + '-' + a.id; parent.add(root); v = { root, lods: [null, null, null], lod: -1, dyn: newStaffDyn(), seq: -1, t: 0 }; map.set(a.id, v) }
    const d = Math.hypot(a.x - cam.x, a.y - cam.z)
    if (d > CS.lodCull) { v.root.visible = false; continue }
    // 目标 LOD（迟滞）
    let want = d < STAFF_RLOD.b0 ? 0 : d < STAFF_RLOD.b1 ? 1 : 2
    if (v.lod >= 0 && want !== v.lod) { const edge = want < v.lod ? (want === 0 ? STAFF_RLOD.b0 : STAFF_RLOD.b1) : (v.lod === 0 ? STAFF_RLOD.b0 : STAFF_RLOD.b1); if (Math.abs(d - edge) < STAFF_RLOD.hyst) want = v.lod }
    if (!v.lods[want] && builtThisFrame < 1) { v.lods[want] = mk(v.root, a, want); builtThisFrame++ }
    const use = v.lods[want] ? want : v.lods.findIndex((x) => !!x)
    if (use < 0) { v.root.visible = false; continue }
    if (use !== v.lod) { v.lods.forEach((g, i) => g && (g.visible = i === use)); v.lod = use; v.dyn = newStaffDyn() }
    v.root.visible = true; vis++; lods[use]++
    v.root.position.set(a.x, 0, a.y)
    v.root.rotation.y = -a.yaw
    animateOne(v, a, dt)
  }
  lastStats = { agents: list.length, visible: vis, built: [...map.values()].reduce((n, v) => n + v.lods.filter(Boolean).length, 0), lods }
  // ---- 野兽（挑战时坐到 VIP 牌桌对面）----
  const bv = casinoBeastView(eng)
  if (bv) {
    if (!beastGrp) { beastGrp = buildBeastEntityMesh(); parent.add(beastGrp) }
    if (beastGrp.parent !== parent) parent.add(beastGrp)
    beastGrp.visible = true
    beastGrp.position.set(bv.x, 0, bv.y); beastGrp.rotation.y = -bv.yaw
    const s = (fakeBeast as unknown as { bst: { clip: string; seq: number; modeT: number } }).bst
    if (s.clip !== bv.clip) { s.clip = bv.clip; s.seq++; s.modeT = 0 } else s.modeT += dt
    animateBeastEntity(beastGrp, fakeBeast, dt, Math.hypot(bv.x - cam.x, bv.y - cam.z))
  } else if (beastGrp) beastGrp.visible = false
}
function mk(root: THREE.Group, a: StaffAgent, lod: number) {
  const g = buildCasinoStaff(a.who, { lod, palette: a.palette })
  const h = new THREE.Group(); h.name = 'lod' + lod; h.add(g); h.visible = false
  root.add(h)
  return h
}
function animateOne(v: View, a: StaffAgent, dt: number) {
  const g = v.lods[v.lod]?.children[0]
  if (!g) return
  if (a.seq !== v.seq) { v.seq = a.seq; v.t = 0 }
  v.t = a.clipT
  animateStaff(g, a.clip, v.t, { dyn: v.dyn, dt, inPlace: true, seed: a.id + 1 })
}
export function disposeCasinoStaff(parent: THREE.Object3D) { VIEWS.delete(parent); beastGrp = null }
