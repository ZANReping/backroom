/**
 * 物品模型全覆盖（2026-11-01 物品建模补全）：ITEMS 里每件物品的地面模型都不是通用 fallback 方块，
 * 至少一个材质带贴图（或顶点色），且第一人称手持模型可构建、尺寸有限；L5 旅馆五件 ≤1,200 面 / ≤3 批 / 有 UV 且落在分区内缩边界里。
 * 无 WebGL；前厅四件依赖 DOM Canvas 2D 文字测量，node 下跳过（它们有专属模型 foyerItemModels）。
 */
import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { ITEMS } from '../src/game/content/items'
import { buildItemMesh } from '../src/game/renderer/itemsMesh'
import { buildHeldItem } from '../src/game/renderer/viewmodel'
import { L5_ITEM_TYPES, buildL5ItemMesh } from '../src/game/renderer/l5ItemModels'
import { buildMeleeMesh } from '../src/game/renderer/meleeMesh'

Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128), createElementNS: () => { throw new Error('headless') } } })
const DOM_ONLY = new Set(['phone', 'bottledwater', 'foyerpack', 'snackbar'])
let checks = 0
const ok = (c: unknown, m: string) => { assert(c, m); checks++ }
const meshes = (o: THREE.Object3D) => { const a: THREE.Mesh[] = []; o.traverse(x => { if ((x as THREE.Mesh).isMesh) a.push(x as THREE.Mesh) }); return a }
for (const type of Object.keys(ITEMS)) {
  if (DOM_ONLY.has(type)) continue
  const g = buildItemMesh(type, { halo: false })
  ok(!g.userData.fallback, `${type}: 不是通用 fallback 方块`)
  const ms = meshes(g)
  ok(ms.length > 0, `${type}: 有网格`)
  const mats = ms.flatMap(m => (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[])
  ok(mats.some(m => m.map || m.vertexColors), `${type}: 至少一个材质带贴图或顶点色`)
  g.updateMatrixWorld(true)
  const s = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3())
  ok([s.x, s.y, s.z].every(Number.isFinite) && Math.max(s.x, s.y, s.z) > .02 && Math.max(s.x, s.y, s.z) < 1.8, `${type}: 地面尺寸合理 ${s.toArray().map(v => v.toFixed(3))}`)
  const h = buildHeldItem(type); h.updateMatrixWorld(true)
  const hs = new THREE.Box3().setFromObject(h).getSize(new THREE.Vector3())
  ok([hs.x, hs.y, hs.z].every(Number.isFinite) && hs.length() > .01, `${type}: 手持模型可构建`)
}
for (const type of L5_ITEM_TYPES) {
  for (const pose of ['ground', 'upright'] as const) {
    const g = buildL5ItemMesh(type, pose), ms = meshes(g)
    const tris = ms.reduce((n, m) => n + m.geometry.getAttribute('position').count / 3, 0)
    ok(tris <= 1200 && ms.length <= 3, `${type}/${pose}: ${tris} 面 / ${ms.length} 批`)
    for (const m of ms) {
      const uv = m.geometry.getAttribute('uv'), pos = m.geometry.getAttribute('position'), nor = m.geometry.getAttribute('normal')
      ok(uv && nor && pos.count % 3 === 0 && !m.geometry.index, `${type}: 非索引三角形 + 法线 + UV`)
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i) * 4, v = (1 - uv.getY(i)) * 1024 % 256
        assert(Number.isFinite(u) && v >= 7.9 && v <= 248.1 && (uv.getX(i) * 1024) % 256 >= 7.9 && (uv.getX(i) * 1024) % 256 <= 248.1, `${type}: UV 落在分区内缩边界内`)
      }
      checks++
      // 法线朝外：顶点法线与面法线同向
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), vn = new THREE.Vector3()
      let bad = 0
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1).sub(a); c.fromBufferAttribute(pos, i + 2).sub(a); n.copy(b).cross(c)
        vn.fromBufferAttribute(nor, i).add(b.fromBufferAttribute(nor, i + 1)).add(c.fromBufferAttribute(nor, i + 2))
        if (n.dot(vn) < 0) bad++
      }
      ok(bad === 0, `${type}: ${bad} 个三角形绕序与法线相反`)
    }
  }
}
// 木板：多材质部件不再被 batchMelee 丢掉
for (const state of ['intact', 'broken'] as const) {
  const t = buildMeleeMesh('timber', { state }); t.updateMatrixWorld(true)
  const visible = meshes(t).filter(m => m.visible)
  const s = new THREE.Box3(); for (const m of visible) s.expandByObject(m)
  ok(s.getSize(new THREE.Vector3()).y > (state === 'intact' ? .8 : .45), `木板 ${state}: 板身在（可见部分长 ${s.getSize(new THREE.Vector3()).y.toFixed(2)} m）`)
}
console.log(`item model checks passed: ${checks}`)
