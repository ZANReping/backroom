import assert from 'node:assert/strict'
import * as THREE from 'three'
import { cloneRenderGeometry } from '../src/game/renderer/renderGeometry'

let checks = 0
const same = (ok: boolean, label: string) => { checks++; assert.ok(ok, label) }
type NumericArray = ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }
const bytes = (a: NumericArray) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
const equalBytes = (a: NumericArray, b: NumericArray, label: string) => { assert.deepEqual(bytes(a), bytes(b), label); checks++ }
const compareArray = (a: THREE.BufferAttribute, b: THREE.BufferAttribute, label: string) => {
  same(a.itemSize === b.itemSize && a.normalized === b.normalized && a.array.constructor === b.array.constructor, `${label} metadata`)
  equalBytes(a.array as NumericArray, b.array as NumericArray, `${label} bytes`)
  same(a.array !== b.array, `${label} buffer is independent`)
}
const compareBounds = (a: THREE.BufferGeometry, b: THREE.BufferGeometry, label: string) => {
  same((a.boundingBox === null && b.boundingBox === null) || a.boundingBox?.equals(b.boundingBox!) === true, `${label} box`)
  same((a.boundingSphere === null && b.boundingSphere === null) || (a.boundingSphere?.center.equals(b.boundingSphere?.center ?? new THREE.Vector3()) === true && a.boundingSphere?.radius === b.boundingSphere?.radius), `${label} sphere`)
}
const compare = (source: THREE.BufferGeometry, old: THREE.BufferGeometry, copy: THREE.BufferGeometry) => {
  same(source.index?.count === old.index?.count && source.index?.count === copy.index?.count, 'index count preserved')
  if (source.index && old.index && copy.index) {
    same(source.index.array.constructor === old.index.array.constructor && source.index.array.constructor === copy.index.array.constructor, 'index constructor preserved')
    equalBytes(old.index.array as NumericArray, copy.index.array as NumericArray, 'index bytes preserved')
    same(old.index.array !== copy.index.array, 'index buffer is independent')
  }
  for (const name of Object.keys(source.attributes)) {
    compareArray(source.attributes[name], old.attributes[name], `${name} source clone`)
    compareArray(old.attributes[name], copy.attributes[name], `${name} render copy`)
  }
  for (const name of Object.keys(source.morphAttributes)) {
    const a = source.morphAttributes[name], b = old.morphAttributes[name], c = copy.morphAttributes[name]
    same(a.length === b.length && a.length === c.length, `${name} morph target count`)
    for (let i = 0; i < a.length; i++) { compareArray(a[i], b[i], `${name} morph ${i} source clone`); compareArray(b[i], c[i], `${name} morph ${i} render copy`) }
  }
  same(source.morphTargetsRelative === copy.morphTargetsRelative, 'morphTargetsRelative preserved')
  same(JSON.stringify(source.groups) === JSON.stringify(copy.groups), 'groups preserved')
  same(JSON.stringify(source.drawRange) === JSON.stringify(copy.drawRange), 'draw range preserved')
  same(source.name === copy.name && JSON.stringify(source.userData) === JSON.stringify(copy.userData), 'name and userData preserved')
  compareBounds(source, copy, 'initial bounds')
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(2, 3, 4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.4, 0.1)), new THREE.Vector3(1.5, 0.75, 2.25))
  old.applyMatrix4(matrix); copy.applyMatrix4(matrix)
  for (const name of Object.keys(old.attributes)) equalBytes(old.attributes[name].array as NumericArray, copy.attributes[name].array as NumericArray, `${name} transformed bytes`)
  if (old.index && copy.index) equalBytes(old.index.array as NumericArray, copy.index.array as NumericArray, 'transformed index bytes')
  for (const name of Object.keys(old.morphAttributes)) for (let i = 0; i < old.morphAttributes[name].length; i++) equalBytes(old.morphAttributes[name][i].array as NumericArray, copy.morphAttributes[name][i].array as NumericArray, `${name} transformed morph ${i}`)
  compareBounds(old, copy, 'transformed bounds')
  const original = new Map<string, Uint8Array>()
  for (const name of Object.keys(source.attributes)) original.set(`a:${name}`, bytes(source.attributes[name].array as NumericArray).slice())
  if (source.index) original.set('i', bytes(source.index.array as NumericArray).slice())
  for (const name of Object.keys(source.morphAttributes)) for (let i = 0; i < source.morphAttributes[name].length; i++) original.set(`m:${name}:${i}`, bytes(source.morphAttributes[name][i].array as NumericArray).slice())
  for (const name of Object.keys(copy.attributes)) { (copy.attributes[name].array as NumericArray)[0] += 1; equalBytes(source.attributes[name].array as NumericArray, original.get(`a:${name}`) as NumericArray, `${name} mutation leaves source`) }
  if (copy.index && source.index) { (copy.index.array as NumericArray)[0] += 1; equalBytes(source.index.array as NumericArray, original.get('i') as NumericArray, 'index mutation leaves source') }
  for (const name of Object.keys(copy.morphAttributes)) for (let i = 0; i < copy.morphAttributes[name].length; i++) { (copy.morphAttributes[name][i].array as NumericArray)[0] += 1; equalBytes(source.morphAttributes[name][i].array as NumericArray, original.get(`m:${name}:${i}`) as NumericArray, `${name} morph ${i} mutation leaves source`) }
}
const geometries: THREE.BufferGeometry[] = [new THREE.BoxGeometry(), new THREE.CylinderGeometry(), new THREE.DodecahedronGeometry(), new THREE.PlaneGeometry(), new THREE.CircleGeometry(), new THREE.SphereGeometry()]
const custom = new THREE.BufferGeometry()
custom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); custom.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); custom.setIndex([0, 1, 2]); custom.addGroup(0, 2, 0); custom.addGroup(2, 1, 1); custom.setDrawRange(1, 2); custom.name = 'custom'; custom.userData = { tag: 'render' }; custom.computeBoundingBox(); custom.computeBoundingSphere(); custom.morphTargetsRelative = true
custom.morphAttributes.position = [new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0], 3), new THREE.Float32BufferAttribute([0, 0, 0, -0.1, 0, 0, 0, -0.1, 0], 3)]; geometries.push(custom)
for (const source of geometries) { const old = source.clone(); const copy = cloneRenderGeometry(source); compare(source, old, copy); source.dispose(); old.dispose(); copy.dispose() }
console.log(`render geometry regression passed: ${checks} checks`)
