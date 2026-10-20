/**
 * Headless regression checks for the 56 refined item meshes (refinedItemMesh.ts).
 * CPU-side Three.js attributes only; no WebGL context or texture decoding.
 * Optional: REFINED_ITEM_EXPORT=<dir> writes one OBJ + MTL per item (UVs into the shared atlases).
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { REFINED_ITEM_ATLAS, REFINED_ITEM_TYPES, buildRefinedItemMesh, isRefinedItemType, type RefinedItemType } from '../src/game/renderer/refinedItemMesh'
import { buildItemMesh } from '../src/game/renderer/itemsMesh'
import { buildHeldItem } from '../src/game/renderer/viewmodel'
import { setMaterialMode } from '../src/game/renderer/shared'

Object.defineProperty(globalThis, 'document', {
  value: { createElement: () => createCanvas(128, 128), createElementNS: () => { throw new Error('headless') } },
})

const MAX_TRIANGLES = 1200, MAX_BATCHES = 3
const meshesOf = (root: THREE.Object3D) => { const out: THREE.Mesh[] = []; root.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh) }); return out }
const tris = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3
function dispose(root: THREE.Object3D) {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
  for (const mesh of meshesOf(root)) {
    geometry.add(mesh.geometry)
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
  }
  geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose())
}
let checks = 0
const report: Record<string, { triangles: number; batches: number; size: number[]; atlas: string }> = {}

function checkGeometry(type: string, mesh: THREE.Mesh) {
  const g = mesh.geometry
  for (const name of ['position', 'normal', 'uv']) {
    const attr = g.getAttribute(name) as THREE.BufferAttribute
    assert(attr, `${type}: missing ${name}`)
    assert(Array.from(attr.array).every(Number.isFinite), `${type}: non-finite ${name}`)
  }
  const pos = g.getAttribute('position') as THREE.BufferAttribute, nor = g.getAttribute('normal') as THREE.BufferAttribute, uv = g.getAttribute('uv') as THREE.BufferAttribute
  assert(!g.index && pos.count % 3 === 0, `${type}: expected non-indexed triangle list`)
  for (let i = 0; i < nor.count; i++) assert(Math.abs(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) - 1) < 1e-3, `${type}: unnormalised normal`)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1).sub(a); c.fromBufferAttribute(pos, i + 2).sub(a)
    assert(b.cross(c).lengthSq() > 1e-16, `${type}: degenerate triangle`)
    const us = [0, 1, 2].map(k => Math.floor(uv.getX(i + k) * 4 - 1e-9)), vs = [0, 1, 2].map(k => Math.floor(uv.getY(i + k) * 4 - 1e-9))
    assert(us.every(x => x === us[0]) && vs.every(y => y === vs[0]), `${type}: triangle crosses atlas tile`)
  }
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i)
    assert(u >= 0 && u <= 1 && v >= 0 && v <= 1, `${type}: UV outside atlas`)
    const um = u * 4 - Math.floor(u * 4 - 1e-9), vm = v * 4 - Math.floor(v * 4 - 1e-9)
    assert(um >= .03125 - 1e-6 && um <= .96875 + 1e-6 && vm >= .03125 - 1e-6 && vm <= .96875 + 1e-6, `${type}: UV lacks atlas edge padding`)
  }
  checks += 4
}

function exportObj(dir: string, type: RefinedItemType, root: THREE.Group) {
  const atlas = REFINED_ITEM_ATLAS[type]
  let obj = `# ${type} — Backroom refined item (atlas: ${atlas})\nmtllib ${type}.mtl\n`, mtl = ''
  let base = 1
  root.updateMatrixWorld(true)
  for (const [k, mesh] of meshesOf(root).entries()) {
    const g = mesh.geometry, pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv')
    const m = mesh.material as THREE.MeshStandardMaterial
    const name = `${type}_${k}_${m.transparent ? 'glass' : m.type === 'MeshBasicMaterial' ? 'glow' : 'surface'}`
    mtl += `newmtl ${name}\nKd 1 1 1\nKa 0 0 0\nKs 0.1 0.1 0.1\nd ${m.transparent ? m.opacity.toFixed(2) : '1'}\nmap_Kd ../textures/${atlas}/color.png\n`
    if (m.type !== 'MeshBasicMaterial') mtl += `norm ../textures/${atlas}/normal.png\nmap_Pr ../textures/${atlas}/roughness.png\n`
    else mtl += `map_Ke ../textures/${atlas}/color.png\nKe 1 1 1\n`
    mtl += '\n'
    obj += `o ${name}\nusemtl ${name}\n`
    const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); obj += `v ${v.x.toFixed(5)} ${v.y.toFixed(5)} ${v.z.toFixed(5)}\n` }
    for (let i = 0; i < uv.count; i++) obj += `vt ${uv.getX(i).toFixed(6)} ${uv.getY(i).toFixed(6)}\n`
    for (let i = 0; i < nor.count; i++) { n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); obj += `vn ${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)}\n` }
    for (let i = 0; i < pos.count; i += 3) obj += `f ${base + i}/${base + i}/${base + i} ${base + i + 1}/${base + i + 1}/${base + i + 1} ${base + i + 2}/${base + i + 2}/${base + i + 2}\n`
    base += pos.count
  }
  writeFileSync(`${dir}/${type}.obj`, obj); writeFileSync(`${dir}/${type}.mtl`, mtl)
}

const exportDir = process.env.REFINED_ITEM_EXPORT
if (exportDir) mkdirSync(exportDir, { recursive: true })

for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode)
  for (const type of REFINED_ITEM_TYPES) {
    const root = buildRefinedItemMesh(type)
    const meshes = meshesOf(root)
    assert(meshes.length >= 1 && meshes.length <= MAX_BATCHES, `${type}: ${meshes.length} batches (max ${MAX_BATCHES})`)
    const triangles = meshes.reduce((s, m) => s + tris(m.geometry), 0)
    assert(triangles <= MAX_TRIANGLES, `${type}: ${triangles} triangles (max ${MAX_TRIANGLES})`)
    assert(triangles >= 60, `${type}: suspiciously low triangle count ${triangles}`)
    for (const mesh of meshes) checkGeometry(type, mesh)
    if (type === 'rope') {
      // Two open-ended rope tubes and the open binding sleeve: 40 perimeter
      // edges in total. Extra boundaries indicate a split between UV segments.
      const edges = new Map<string, number>(), pos = meshes[0].geometry.getAttribute('position')
      const vertex = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => Math.round(v * 1e6)).join(',')
      for (let i = 0; i < pos.count; i += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const edge = [vertex(i + a), vertex(i + b)].sort().join('|'); edges.set(edge, (edges.get(edge) ?? 0) + 1)
      }
      assert.equal([...edges.values()].filter(n => n === 1).length, 40, 'rope: open cracks between UV segments')
      checks++
    }
    for (const mesh of meshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial
      assert(mat.map, `${type}: material without atlas map`)
      if (mode === 'realistic' && mat.type === 'MeshStandardMaterial') assert(mat.roughnessMap, `${type}: realistic mode lacks roughness map`)
      if (mode === 'classic') assert(mat.type !== 'MeshStandardMaterial', `${type}: classic mode must stay Lambert`)
      if (mat.transparent) assert(!mat.depthWrite, `${type}: transparent batch writes depth`)
    }
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
    assert(Math.max(size.x, size.y, size.z) <= .62 && Math.max(size.x, size.y, size.z) >= .05, `${type}: implausible size ${size.toArray()}`)
    // Through the public factory: no fallback cube, halo still present.
    const item = buildItemMesh(type)
    assert(!item.userData.fallback, `${type}: still falls back to the generic cube`)
    assert(item.children.length === 2, `${type}: expected refined model + halo`)
    const noHalo = buildItemMesh(type, { halo: false })
    assert(noHalo.children.length === 1, `${type}: halo:false still adds halo`)
    const held = buildHeldItem(type)
    assert(meshesOf(held).length >= 1, `${type}: held model empty`)
    // Instance-owned geometry/material; disposing one leaves the other intact.
    const twin = buildRefinedItemMesh(type)
    meshesOf(twin).forEach((m, i) => { assert(m.geometry !== meshes[i].geometry && m.material !== meshes[i].material, `${type}: shared instance resources`) })
    const sharedMap = (meshes[0].material as THREE.MeshStandardMaterial).map
    assert(sharedMap === (meshesOf(twin)[0].material as THREE.MeshStandardMaterial).map, `${type}: atlas texture not shared`)
    checks += 10
    if (mode === 'realistic') {
      report[type] = { triangles, batches: meshes.length, size: size.toArray().map(x => +x.toFixed(3)), atlas: REFINED_ITEM_ATLAS[type] }
      if (exportDir) exportObj(exportDir, type, root)
    }
    let released = 0, twinReleased = 0, atlasReleased = 0
    for (const m of meshes) { m.geometry.addEventListener('dispose', () => released++); (m.material as THREE.Material).addEventListener('dispose', () => released++) }
    for (const m of meshesOf(twin)) { m.geometry.addEventListener('dispose', () => twinReleased++); (m.material as THREE.Material).addEventListener('dispose', () => twinReleased++) }
    const onTextureDispose = () => atlasReleased++
    sharedMap!.addEventListener('dispose', onTextureDispose)
    dispose(root)
    assert.equal(released, meshes.length * 2, `${type}: instance not fully disposed`)
    assert.equal(twinReleased, 0, `${type}: disposed other instance`)
    assert.equal(atlasReleased, 0, `${type}: disposed shared atlas`)
    sharedMap!.removeEventListener('dispose', onTextureDispose)
    for (const g of [twin, item, noHalo, held]) dispose(g)
    checks += 3
  }
}
setMaterialMode('classic')
assert.equal(REFINED_ITEM_TYPES.length, 54) // v79：+尸鼠肉；v81：旱虾/酥炸旱虾移交 shrimpMesh
for (const type of ['toString', 'constructor', '__proto__', 'unknown-item']) {
  assert(!isRefinedItemType(type), `${type}: prototype key dispatched as an item`)
  const fallback = buildItemMesh(type, { halo: false }); dispose(fallback); checks++
}
const totals = Object.values(report)
console.log(JSON.stringify({ items: totals.length, maxTriangles: Math.max(...totals.map(r => r.triangles)), maxBatches: Math.max(...totals.map(r => r.batches)), checks }, null, 0))
if (process.env.REFINED_ITEM_REPORT) writeFileSync(process.env.REFINED_ITEM_REPORT, JSON.stringify(report, null, 2) + '\n')
console.log('refined item mesh checks passed')
