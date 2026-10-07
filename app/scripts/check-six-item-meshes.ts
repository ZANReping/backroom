/**
 * Headless regression checks for the six detailed item meshes.
 * This intentionally uses CPU-side Three.js attributes only; it does not require
 * a WebGL/GPU context, texture decoding, or renderer capabilities.
 */
import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { SIX_ITEM_TYPES, buildSixItemMesh, type SixItemType } from '../src/game/renderer/sixItemMesh'
import { buildItemMesh } from '../src/game/renderer/itemsMesh'
import { buildHeldItem } from '../src/game/renderer/viewmodel'
import { getMaterialMode, setMaterialMode } from '../src/game/renderer/shared'

Object.defineProperty(globalThis, 'document', {
  value: { createElement: () => createCanvas(128, 128), createElementNS: () => { throw new Error('headless') } },
})

const finite = (a: THREE.BufferAttribute) => Array.from(a.array).every(Number.isFinite)
const triangles = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3
const meshesOf = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = []
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh) })
  return out
}
const dimensions = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
}

function checkGeometry(type: SixItemType, mesh: THREE.Mesh) {
  const g = mesh.geometry
  for (const name of ['position', 'normal', 'uv']) {
    const attr = g.getAttribute(name) as THREE.BufferAttribute | undefined
    assert(attr, `${type}: missing ${name}`)
    assert(finite(attr), `${type}: non-finite ${name}`)
  }
  assert(triangles(g) > 0 && Number.isInteger(triangles(g)), `${type}: degenerate triangle count`)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i)
    assert(u >= 0 && u <= 1 && v >= 0 && v <= 1, `${type}: UV outside atlas`)
    const um = u * 4 - Math.floor(u * 4), vm = v * 4 - Math.floor(v * 4)
    assert(um >= .03125 - 1e-6 && um <= .96875 + 1e-6 && vm >= .03125 - 1e-6 && vm <= .96875 + 1e-6, `${type}: UV lacks atlas edge padding`)
  }
  const idx = g.index
  const vertex = (n: number) => idx ? idx.getX(n) : n
  for (let i = 0; i < triangles(g) * 3; i += 3) {
    const ids = [0, 1, 2].map(k => vertex(i + k))
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const a = new THREE.Vector3().fromBufferAttribute(pos, ids[0])
    const b = new THREE.Vector3().fromBufferAttribute(pos, ids[1])
    const c = new THREE.Vector3().fromBufferAttribute(pos, ids[2])
    assert(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).lengthSq() > 1e-14, `${type}: degenerate triangle area`)
    const us = ids.map(id => Math.floor(uv.getX(id) * 4))
    const vs = ids.map(id => Math.floor(uv.getY(id) * 4))
    assert(us.every(x => x === us[0]) && vs.every(y => y === vs[0]), `${type}: triangle crosses atlas tile`)
  }
}

function checkMaterials(type: SixItemType, root: THREE.Group, mode: 'classic' | 'realistic') {
  const meshes = meshesOf(root)
  assert(meshes.length <= 3, `${type}/${mode}: ${meshes.length} material batches exceeds 3`)
  let total = 0
  const textures = new Set<THREE.Texture>()
  for (const mesh of meshes) {
    checkGeometry(type, mesh)
    total += triangles(mesh.geometry)
    const material = mesh.material as THREE.Material & { map?: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture }
    assert(material.map, `${type}/${mode}: missing color atlas`)
    assert(material.map.colorSpace === THREE.SRGBColorSpace, `${type}: color atlas must be sRGB`)
    const basic = material instanceof THREE.MeshBasicMaterial
    if (!basic) {
      assert(material.normalMap, `${type}/${mode}: missing normal atlas`)
      assert(material.normalMap.colorSpace === THREE.NoColorSpace, `${type}: normal atlas must be linear`)
      if (mode === 'classic') assert(!material.roughnessMap, `${type}: classic unexpectedly has roughness map`)
      else assert(material.roughnessMap && material.roughnessMap.colorSpace === THREE.NoColorSpace, `${type}: realistic roughness atlas missing/encoded`)
    }
    textures.add(material.map); if (material.normalMap) textures.add(material.normalMap); if (material.roughnessMap) textures.add(material.roughnessMap)
  }
  assert(total <= 1200, `${type}/${mode}: ${total} triangles exceeds 1200`)
  return { meshes: meshes.length, triangles: total, textures: textures.size }
}

const metrics: unknown[] = []
const initialMode = getMaterialMode()
for (const type of SIX_ITEM_TYPES) {
  const perMode: Record<string, unknown> = {}
  for (const mode of ['classic', 'realistic'] as const) {
    setMaterialMode(mode)
    const root = buildSixItemMesh(type)
    const size = dimensions(root)
    for (const axis of [size.x, size.y, size.z]) assert(axis >= .01 && axis <= .4, `${type}/${mode}: dimension ${axis} outside .01..0.4`)
    const result = checkMaterials(type, root, mode)
    perMode[mode] = { ...result, dimensions: size.toArray().map(v => +v.toFixed(3)) }
    rootDispose(root)
  }

  setMaterialMode('classic')
  const worldNoHalo = buildItemMesh(type, { halo: false })
  const worldHalo = buildItemMesh(type, { halo: true })
  assert.equal(meshesOf(worldHalo).length, meshesOf(worldNoHalo).length + 1, `${type}: halo must add exactly one mesh`)
  assert(meshesOf(worldHalo).some(m => m.geometry.type === 'RingGeometry'), `${type}: halo ring missing`)
  const held = buildHeldItem(type)
  assert(!meshesOf(held).some(m => m.geometry.type === 'RingGeometry'), `${type}: held item contains pickup halo`)
  if (type === 'fuyouyu') {
    held.updateMatrixWorld(true)
    const stone = meshesOf(held).find(m => m.name === 'fuyouyu-surface') ?? meshesOf(held)[0]
    assert(stone, `${type}: held jewelry mesh missing`)
    const center = new THREE.Vector3(0, -.015, 0).applyMatrix4(stone.matrixWorld)
    const holeHits = new THREE.Raycaster(center.clone().add(new THREE.Vector3(0, 0, 1)), new THREE.Vector3(0, 0, -1)).intersectObject(held, true)
    assert.equal(holeHits.length, 0, `${type}: held jewelry hole is blocked`)
    const rim = new THREE.Vector3(.051, -.015, 0).applyMatrix4(stone.matrixWorld)
    const rimHits = new THREE.Raycaster(rim.clone().add(new THREE.Vector3(0, 0, 1)), new THREE.Vector3(0, 0, -1)).intersectObject(held, true)
    assert(rimHits.length > 0, `${type}: held jewelry ring has no hittable rim`)
  }

  const a = buildSixItemMesh(type), b = buildSixItemMesh(type)
  const am = meshesOf(a), bm = meshesOf(b)
  assert.equal(am.length, bm.length)
  for (let i = 0; i < am.length; i++) {
    assert.notEqual(am[i].geometry, bm[i].geometry, `${type}: geometry shared between instances`)
    assert.notEqual(am[i].material, bm[i].material, `${type}: material shared between instances`)
    const ma = am[i].material as THREE.Material & { map?: THREE.Texture; normalMap?: THREE.Texture }
    const mb = bm[i].material as THREE.Material & { map?: THREE.Texture; normalMap?: THREE.Texture }
    assert.equal(ma.map, mb.map); assert.equal(ma.normalMap, mb.normalMap); assert.equal(ma.roughnessMap, mb.roughnessMap)
  }
  const sharedTextures = new Set<THREE.Texture>()
  for (const mesh of am) {
    const material = mesh.material as THREE.Material & { map?: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture }
    for (const texture of [material.map, material.normalMap, material.roughnessMap]) if (texture) sharedTextures.add(texture)
  }
  let textureDisposals = 0
  for (const texture of sharedTextures) texture.addEventListener('dispose', () => textureDisposals++)
  const disposed = { geometry: 0, material: 0 }
  for (const mesh of bm) {
    mesh.geometry.addEventListener('dispose', () => disposed.geometry++)
    const material = mesh.material as THREE.Material
    material.addEventListener('dispose', () => disposed.material++)
  }
  for (const mesh of am) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose() }
  assert.equal(disposed.geometry, 0, `${type}: disposing first instance affected second geometry`)
  assert.equal(disposed.material, 0, `${type}: disposing first instance affected second material`)
  assert.equal(textureDisposals, 0, `${type}: disposing first instance disposed shared texture`)
  assert(bm.every(mesh => mesh.geometry.getAttribute('position')))
  rootDispose(a); rootDispose(b); rootDispose(worldNoHalo); rootDispose(worldHalo); rootDispose(held)
  metrics.push({ type, ...perMode })
}

setMaterialMode(initialMode)
console.log(JSON.stringify(metrics, null, 2))

function rootDispose(root: THREE.Object3D) {
  root.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) material.dispose()
  })
}
