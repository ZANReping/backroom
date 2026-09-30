import assert from 'node:assert/strict'
import * as THREE from 'three'
import { cloneRenderGeometry } from '../src/game/renderer/renderGeometry'
import { batchRigidItem } from '../src/game/renderer/itemBatches'

let checks = 0
const check = (value: boolean, message: string) => { assert.ok(value, message); checks++ }
const material = () => new THREE.MeshBasicMaterial({ color: '#aabbee' })
const fixture = (type = 'almond') => {
  const root = new THREE.Group(), parent = new THREE.Group(), mat = material()
  root.userData.itemType = type; root.add(parent)
  const a = new THREE.Mesh(new THREE.BoxGeometry(), mat), b = new THREE.Mesh(new THREE.BoxGeometry(), mat)
  parent.add(a, b)
  return { root, parent, a, b, mat }
}
const test = fixture()
test.root.position.set(4, 5, 6); test.root.rotation.y = .3; test.root.scale.set(1.2, .8, 1.5)
test.parent.position.set(2, 0, -1); test.parent.rotation.z = .2
test.a.position.set(1, 2, 3); test.a.rotation.z = .2; test.a.scale.set(1, 2, 1)
test.b.position.set(-2, 1, 0); test.b.rotation.x = .4
test.root.updateMatrixWorld(true)
const rootMatrix = test.root.matrix.clone(), parentMatrix = test.parent.matrix.clone()
const expected = [test.a, test.b].map(source => cloneRenderGeometry(source.geometry).applyMatrix4(source.matrix))
let disposedA = 0, disposedB = 0, disposedMaterial = 0
test.a.geometry.addEventListener('dispose', () => disposedA++)
test.b.geometry.addEventListener('dispose', () => disposedB++)
test.mat.addEventListener('dispose', () => disposedMaterial++)
batchRigidItem(test.root)
const merged = test.parent.children[0] as THREE.Mesh
check(test.parent.children.length === 1 && merged.name === 'item-rigid-material-batch', 'shared material merged')
check(test.root.matrix.equals(rootMatrix) && test.parent.matrix.equals(parentMatrix), 'ancestor matrices unchanged')
for (const name of ['position', 'normal', 'uv']) {
  const actual = Array.from(merged.geometry.getAttribute(name).array)
  const wanted = expected.flatMap(g => Array.from(g.getAttribute(name).array))
  assert.deepEqual(actual, wanted, `${name} ordered transformed buffers`); checks++
}
assert.deepEqual(Array.from(merged.geometry.index!.array), [...expected[0].index!.array, ...Array.from(expected[1].index!.array, index => index + expected[0].getAttribute('position').count)]); checks++
check(disposedA === 1 && disposedB === 1, 'unreferenced original geometry disposed exactly once')
check(disposedMaterial === 0 && merged.material === test.mat, 'original shared material retained')
batchRigidItem(test.root)
check(test.parent.children.length === 1 && test.parent.children[0] === merged && disposedA === 1, 'repeat is idempotent')
for (const g of expected) g.dispose()

const different = fixture(); different.b.material = material(); batchRigidItem(different.root)
check(different.parent.children.length === 2, 'separate material identities remain separate')
const excluded = (label: string, setup: (mesh: THREE.Mesh) => void, type = 'battery') => {
  const f = fixture(type)
  for (const mesh of [f.a, f.b]) setup(mesh)
  batchRigidItem(f.root)
  check(f.parent.children.length === 2 && f.a.parent === f.parent && f.b.parent === f.parent, label)
}
excluded('transparent', m => { (m.material as THREE.Material).transparent = true })
excluded('before-render callback', m => { m.onBeforeRender = () => {} })
excluded('after-render callback', m => { m.onAfterRender = () => {} })
excluded('non-leaf', m => m.add(new THREE.Object3D()))
excluded('negative determinant', m => { m.scale.x = -1 })
excluded('morph geometry', m => { m.geometry.morphAttributes.position = [m.geometry.getAttribute('position').clone()] })
excluded('partial draw range', m => { m.geometry.setDrawRange(3, 3) })
excluded('unsupported item', () => {}, 'unknown')
excluded('custom material shader', m => { (m.material as THREE.Material).onBeforeCompile = () => {} })
excluded('invisible', m => { m.visible = false })
excluded('render order', m => { m.renderOrder = 2 })
excluded('depth-write disabled', m => { (m.material as THREE.Material).depthWrite = false })

const shared = fixture('bandage'), sharedGeometry = shared.a.geometry
shared.b.geometry.dispose(); shared.b.geometry = sharedGeometry
const survivor = new THREE.Mesh(sharedGeometry, new THREE.MeshBasicMaterial({ transparent: true }))
shared.parent.add(survivor)
let sharedDisposals = 0; sharedGeometry.addEventListener('dispose', () => sharedDisposals++)
batchRigidItem(shared.root)
check(shared.parent.children.length === 2 && survivor.parent === shared.parent && sharedDisposals === 0, 'excluded live reference keeps source geometry alive')

const arrayCase = (groups: [number, number, number][]) => {
  const f = fixture('bandage')
  const arrays = [f.mat, f.mat]
  for (const mesh of [f.a, f.b]) {
    mesh.material = arrays as unknown as THREE.MeshBasicMaterial
    mesh.geometry.clearGroups()
    for (const [start, count, index] of groups) mesh.geometry.addGroup(start, count, index)
  }
  batchRigidItem(f.root)
  return { ...f, arrays }
}
const complete = arrayCase([[0, 18, 0], [18, 18, 1]])
check(complete.parent.children.length === 1 && (complete.parent.children[0] as THREE.Mesh).material === complete.mat, 'complete identical material partition folds and merges')
for (const [label, groups] of [
  ['gap', [[0, 15, 0], [18, 18, 1]]],
  ['overlap', [[0, 21, 0], [18, 18, 1]]],
  ['missing tail', [[0, 18, 0]]],
  ['partial triangles', [[0, 17, 0], [17, 19, 1]]],
  ['invalid index', [[0, 18, 0], [18, 18, 2]]],
] as [string, [number, number, number][]][]) {
  const f = arrayCase(groups)
  check(f.parent.children.length === 2 && (f.a.material as unknown) === f.arrays, `${label} array preserved`)
}
console.log(`item batches regression passed: ${checks} checks`)
