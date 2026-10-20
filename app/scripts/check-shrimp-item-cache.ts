import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { buildShrimpItemMesh, prepareShrimpItemMesh, shrimpItemMeshReady } from '../src/game/renderer/shrimpMesh'

Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(256, 256), createElementNS: () => ({}) } })
const poses = ['shrimp', 'liveshrimp', 'friedshrimp']
const attrs = ['position', 'normal', 'uv', 'color']
const arrays = (g: THREE.Group) => { const out: THREE.BufferGeometry[] = []; g.traverse((o: any) => { if (o.isMesh) out.push(o.geometry) }); return out }
const oldGD = THREE.BufferGeometry.prototype.dispose, oldMD = THREE.Material.prototype.dispose; let gd = 0, md = 0
THREE.BufferGeometry.prototype.dispose = function () { gd++; return oldGD.call(this) }
THREE.Material.prototype.dispose = function () { md++; return oldMD.call(this) }
for (const type of poses) for (const cut of [1, 7]) {
  const g = prepareShrimpItemMesh(type); for (let i = 0; i < cut; i++) g.next(); g.return?.()
  assert(!shrimpItemMeshReady(type), `${type}: cancelled preparation does not publish template`)
}
assert(gd > 0 && md > 0, 'cancelled preparation releases temporary resources')
// Cold-cache preparation must advance through several real geometry stages.
for (const type of poses) {
  const g = prepareShrimpItemMesh(type); let n = 0, step = g.next()
  while (!step.done) {
    n++; assert(n < 16, `${type}: bounded preparation`)
    // An item can appear while the loading job is preparing this same pose.
    if (type === 'friedshrimp' && n === 1) {
      const concurrent = buildShrimpItemMesh(type)
      concurrent.traverse((o: any) => { if(o.isMesh) { o.geometry.dispose(); for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose() } })
    }
    step = g.next()
  }
  assert(shrimpItemMeshReady(type), `${type}: complete preparation publishes template`)
  assert(n >= 9, `${type}: preparation has real geometry stages`)
}
for (const type of poses) {
  const fresh = buildShrimpItemMesh(type), a = arrays(fresh)
  assert.equal(a.length, 3, `${type}: three batches`)
  for (let i = 0; i < 3; i++) for (const k of attrs) { const x = a[i].getAttribute(k); assert(x, `${type}: ${k}`); assert(Array.from(x.array).every(Number.isFinite), `${type}: ${k} finite`) }
  const ba = new THREE.Box3().setFromObject(fresh), expected = ba.getSize(new THREE.Vector3())
  assert(expected.x > .1 && expected.x < .4 && expected.y > .01 && expected.y < .2, `${type}: bounds`)
  const second = buildShrimpItemMesh(type), ga = arrays(fresh), gb = arrays(second)
  assert(ga.every((g, i) => g !== gb[i]), `${type}: instance geometries independent`)
  fresh.traverse((o: any) => { if (o.isMesh) o.geometry.dispose() }); second.traverse((o: any) => { if (o.isMesh) o.geometry.dispose() })
}
for (const type of poses) { const again = prepareShrimpItemMesh(type); assert(again.next().done === true, `${type}: ready preparation is no-op`) }
console.log('Shrimp item cache checks passed: 3 poses, 3 batches, bounded preparation')
