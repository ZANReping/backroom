import assert from 'node:assert/strict'
import { tree, trace, occluded, covered, type Occluder } from '../src/game/world/l1BakeRaycast'

const box = (min: [number, number, number], max: [number, number, number]): Occluder => ({ id: `box:${min.join(',')}`, min, max, style: 'parking', surface: 'wall', solid: true, occlude: true })
const cyl = (axis: 0 | 1 | 2, min: [number, number, number], max: [number, number, number]): Occluder => ({ id: `cyl:${axis}`, min, max, axis, shape: 'round', style: 'storage', surface: 'column', solid: true, occlude: true })
// Inward-facing, one-sided roof shell. Its coarse bounds cover the whole roof
// volume but only the two triangles should occlude rays.
const roof: Occluder = { id: 'roof', min: [-4, 2, -4], max: [4, 5, 4], style: 'gothic', surface: 'ceiling', solid: true, occlude: true, triangles: [
  [[-4, 2, -4], [4, 2, -4], [4, 5, 4]],
  [[-4, 2, -4], [4, 5, 4], [-4, 5, 4]],
] }
const root = tree([box([-2, 0, -1], [2, 1.8, 1]), box([4, -1, -2], [5, 3, 2]), box([-5, .2, 3], [-3, 2, 5]), box([2, 1, 3], [3, 2, 4]), cyl(0, [-1, 0, 3], [1, 3, 5]), cyl(1, [6, 0, -1], [8, 4, 1]), cyl(2, [-1, 0, 7], [1, 2, 9]), roof])
let state = 0x91e10da5
const rnd = () => { state = Math.imul(state ^ (state >>> 13), 0x5bd1e995) + 0x6d2b79f5 | 0; return (state >>> 0) / 0x100000000 }
const unit = (x: number, y: number, z: number): [number, number, number] => { const n = Math.hypot(x, y, z) || 1; return [x / n, y / n, z / n] }
for (let i = 0; i < 20000; i++) {
  const origin: [number, number, number] = [rnd() * 20 - 10, rnd() * 8 - 2, rnd() * 20 - 6]
  const d = unit(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1)
  const limit = i % 7 === 0 ? .003 + rnd() * .01 : i % 11 === 0 ? .05 : .01 + rnd() * 20
  const a = !!trace(root, origin, d, limit, true), b = occluded(root, origin, d, limit)
  assert.equal(b, a, `occluded mismatch at ray ${i}: origin=${origin} dir=${d} limit=${limit}`)
}
// Explicit axis-parallel rays and origins inside each solid exercise slab exit,
// cylinder caps, and the shared .002 threshold.
for (const origin of [[0, .9, 0], [4.5, 0, 0], [0, 1.5, 4], [0, 3, 0]] as [number, number, number][]) {
  for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as [number, number, number][]) {
    assert.equal(occluded(root, origin, d, 10), !!trace(root, origin, d, 10, true), `axis ray mismatch ${origin}/${d}`)
  }
}
// The roof's acceleration bounds are not a filled cuboid: below the shell it
// must remain uncovered, while ordinary box/cylinder interiors are covered.
assert.equal(covered(root, [0, 2.4, 0]), false, 'roof bounds must not count as filled volume')
assert.equal(covered(root, [0, .8, 0]), true, 'box interior is covered')
assert.equal(covered(root, [0, 1.5, 4]), true, 'cylinder interior is covered')
console.log('L1 bake ray checks passed: 20,024 rays and 3 coverage cases')
