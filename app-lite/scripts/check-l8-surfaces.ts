import * as current from '../src/game/world/infiniteL8'
import * as baseline from './fixtures/l8-surfaces-baseline'

const seeds = [1, 42, 424242, 13371337]
const points: [number, number][] = []
for (let i = 0; i < 600; i++) {
  const x = (i * 7919 % 4096) - 2048 + (i % 7 === 0 ? 1e-8 : 0)
  const z = ((i * 104729) % 4096) - 2048 + (i % 11 === 0 ? -1e-8 : 0)
  points.push([x, z])
}
// Explicit edge, negative-coordinate, lake-shore and macro-ecology samples.
for (const p of [[-1e-8, -1e-8], [-512, 0], [0, -512], [512, 512], [-2048, 2048], [2048, -2048], [31.99999999, 32.00000001], [96, -96]]) points.push(p as [number, number])
for (const radius of [0, 8.6, 13.2, 15.4]) for (const epsilon of [-1e-8, 0, 1e-8]) {
  points.push([15 + radius + epsilon, 21], [15, 21 - radius - epsilon])
}
points.push([15, 9], [415, 9])

let checks = 0
const assertSame = (label: string, actual: number, expected: number) => {
  checks++
  if (!Object.is(actual, expected)) throw new Error(`${label}: ${actual} !== ${expected}`)
}
const compare = (seed: number, wx: number, wz: number) => {
  assertSame(`ground ${seed}/${wx}/${wz}`, current.l8GroundAt(seed, wx, wz), baseline.l8GroundAt(seed, wx, wz))
  assertSame(`roof ${seed}/${wx}/${wz}`, current.l8RoofAt(seed, wx, wz), baseline.l8RoofAt(seed, wx, wz))
  for (const y of [-8, 0, 4, 12, 24]) assertSame(`field ${seed}/${wx}/${y}/${wz}`, current.l8VolumeField(seed, wx, y, wz), baseline.l8VolumeField(seed, wx, y, wz))
}

for (const seed of seeds) {
  for (const [wx, wz] of points) {
    compare(seed, wx, wz)
    // Exercise both cache entries in both call orders.
    assertSame('cached ground', current.l8GroundAt(seed, wx, wz), baseline.l8GroundAt(seed, wx, wz))
    assertSame('cached roof', current.l8RoofAt(seed, wx, wz), baseline.l8RoofAt(seed, wx, wz))
    assertSame('reverse roof', current.l8RoofAt(seed, wx, wz), baseline.l8RoofAt(seed, wx, wz))
    assertSame('reverse ground', current.l8GroundAt(seed, wx, wz), baseline.l8GroundAt(seed, wx, wz))
  }
}

const early = points.slice(0, 16).map(([wx, wz]) => [wx, wz, seeds[0]] as const)
for (const [wx, wz, seed] of early) compare(seed, wx, wz)
for (let i = 0; i < 2300; i++) current.l8GroundAt(seeds[0], i * 17.125 - 19000, i * 29.75 - 31000)
for (const [wx, wz, seed] of early) compare(seed, wx, wz)
for (const seed of [42, 424242, 13371337, 1]) for (const [wx, wz] of points.slice(0, 24)) compare(seed, wx, wz)

console.log(`L8 surface regression passed: ${checks} exact checks`)
