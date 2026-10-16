import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { buildRatMesh, buildRatGearMesh, prepareRatTextures, ratTexturesReady, type RatRig } from '../src/game/renderer/ratMesh'
import { setMaterialMode } from '../src/game/renderer/shared'

Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128), createElementNS: () => { throw new Error('headless') } } })
const morphs = ['common', 'hairless', 'cave', 'hotel', 'capybara'] as const
const finite = (a: ArrayLike<number>) => Array.from(a).every(Number.isFinite)
const meshesOf = (root: THREE.Object3D) => { const out: THREE.Mesh[] = []; root.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh) }); return out }
const resources = (root: THREE.Object3D) => {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  for (const m of meshesOf(root)) {
    geometries.add(m.geometry)
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { materials.add(mat); if ((mat as THREE.MeshLambertMaterial).map) textures.add((mat as THREE.MeshLambertMaterial).map!) }
  }
  return { geometries, materials, textures }
}
const dispose = (root: THREE.Object3D) => { const r = resources(root); r.geometries.forEach(g => g.dispose()); r.materials.forEach(m => m.dispose()) }
let checks = 0
const disposed = new WeakSet<object>()
const disposeGeometry = THREE.BufferGeometry.prototype.dispose, disposeMaterial = THREE.Material.prototype.dispose
THREE.BufferGeometry.prototype.dispose = function () { disposed.add(this); disposeGeometry.call(this) }
THREE.Material.prototype.dispose = function () { disposed.add(this); disposeMaterial.call(this) }
assert(!ratTexturesReady('common'), 'fresh rat texture set is unprepared'); checks++
const textureJob = prepareRatTextures('common'); let textureSteps = 0
while (!textureJob.next().done) textureSteps++
assert(textureSteps === 3 && ratTexturesReady('common'), 'fur, skin and strands prepare in separate steps'); checks++
for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode)
  for (const morph of morphs) {
    const root = buildRatMesh(morph, 17)
    const meshes = meshesOf(root)
    const live = resources(root)
    assert([...live.geometries, ...live.materials].every(v => !disposed.has(v)), `${mode}/${morph}: batching never disposes retained resources`); checks++
    assert(meshes.length > 0 && meshes.length < 40, `${mode}/${morph}: finite batch count`); checks++
    for (const mesh of meshes) for (const attr of Object.values(mesh.geometry.attributes)) { assert(finite((attr as THREE.BufferAttribute).array), `${mode}/${morph}: finite attributes`); checks++ }
    const rig = root.userData.ratRig as RatRig
    assert(rig && rig.fur.every(m => m.parent), `${mode}/${morph}: animation keep objects retained`); checks++
    root.updateMatrixWorld(true); root.traverse(o => assert(finite(o.matrixWorld.elements), `${mode}/${morph}: finite transform`)); checks++
    dispose(root)
  }
  for (const kind of ['trap', 'bomb'] as const) {
    const root = buildRatGearMesh(kind, 19), meshes = meshesOf(root)
    assert(meshes.length > 0 && meshes.length < 30, `${mode}/${kind}: finite batch count`); checks++
    for (const mesh of meshes) for (const attr of Object.values(mesh.geometry.attributes)) { assert(finite((attr as THREE.BufferAttribute).array), `${mode}/${kind}: finite attributes`); checks++ }
    dispose(root)
  }
}
const a = buildRatMesh('common', 3), b = buildRatMesh('common', 3), ra = resources(a), rb = resources(b)
assert([...ra.geometries].every(g => !rb.geometries.has(g)), 'instance geometries are independent')
assert([...ra.materials].every(m => !rb.materials.has(m)), 'instance materials are independent')
assert([...ra.textures].every(t => rb.textures.has(t) && t.userData.entityShared === true), 'procedural textures are shared and marked')
let aDisposed = 0, bDisposed = 0
for (const g of ra.geometries) g.addEventListener('dispose', () => aDisposed++)
for (const g of rb.geometries) g.addEventListener('dispose', () => bDisposed++)
dispose(a); assert.equal(aDisposed, ra.geometries.size, 'first instance releases owned geometry'); assert.equal(bDisposed, 0, 'second instance survives')
b.updateMatrixWorld(true); b.traverse(o => assert(finite(o.matrixWorld.elements), 'survivor transform remains finite')); dispose(b); assert.equal(bDisposed, rb.geometries.size, 'second instance releases owned geometry')
THREE.BufferGeometry.prototype.dispose = disposeGeometry; THREE.Material.prototype.dispose = disposeMaterial
console.log(JSON.stringify({ morphs: morphs.length, modes: 2, gear: 2, checks }))
