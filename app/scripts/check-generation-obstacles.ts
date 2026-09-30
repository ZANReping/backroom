import assert from 'node:assert/strict'
import { generationObstacles } from '../src/game/world/generationObstacles'
import { RNG } from '../src/game/core/rng'
import type { FloorBand, Structure } from '../src/game/core/types'

let checks = 0
const assertEqual = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++ }
type Box = { x0: number; y0: number; x1: number; y1: number }
const doors = ['hoteldoor', 'rollerdoor', 'glassdoor', 'bargate']
const solid: Structure = { kind: 'pillar', x: 1, y: 1, w: 2, h: 2, solid: true }
const door: Structure = { kind: 'hoteldoor', x: 1, y: 1, w: 1, h: 1, solid: true }
const box = { x0: 1, y0: 1, x1: 2, y1: 2 }
let result = generationObstacles(4, 4, [solid], 0, () => [box])
assertEqual([result[5], result[6], result[9], result[10]], [1, 1, 1, 1], 'both collision endpoints inclusive')
result = generationObstacles(4, 4, [solid, door], 0, () => [box])
assertEqual([result[5], result[6], result[9], result[10]], [0, 1, 1, 1], 'door upper bound exclusive; door overrides overlapping solid')
solid.solid = false
assertEqual(generationObstacles(4, 4, [solid], 0, () => [box]), new Uint8Array(16), 'non-solid ignored')
solid.solid = true; solid.floor = 1
assertEqual(generationObstacles(4, 4, [solid], 0, () => [box]), new Uint8Array(16), 'upper floor cannot block main floor')
assertEqual(generationObstacles(4, 4, [solid], 1, () => [box])[5], 1, 'matching upper floor blocks')
box.x0 = 2; box.x1 = 3
assertEqual(generationObstacles(4, 4, [solid], 1, () => [box])[5], 0, 'new flood sees changed bounds')
assertEqual(result[6], 1, 'existing snapshot remains independent')

for (let seed = 0; seed < 20; seed++) {
  const rng = new RNG(seed + 2532), structures: Structure[] = [], boxes = new Map<Structure, Box[]>()
  for (let i = 0; i < 80; i++) {
    const s: Structure = { kind: rng.pick(['pillar', ...doors]) as Structure['kind'], x: rng.int(-8, 56) / 4, y: rng.int(-8, 48) / 4,
      w: rng.int(1, 12) / 4, h: rng.int(1, 12) / 4, solid: rng.chance(.8), floor: rng.pick([undefined, -1, 0, 1, 2]) }
    const own: Box[] = []
    for (let j = 0; j < rng.int(0, 4); j++) {
      const x0 = s.x + rng.int(-4, 8) / 4, y0 = s.y + rng.int(-4, 8) / 4
      own.push({ x0, y0, x1: x0 + rng.int(-1, 12) / 4, y1: y0 + rng.int(-1, 12) / 4 })
    }
    structures.push(s); boxes.set(s, own)
  }
  for (const band of [-1, 0, 1, 2] as FloorBand[]) {
    let calls = 0
    const actual = generationObstacles(13, 11, structures, band, s => { calls++; return boxes.get(s)! })
    for (let y = 0; y < 11; y++) for (let x = 0; x < 13; x++) {
      // Independent scalar predicate from the previous BFS. No raster ranges.
      const blocked = structures.some(s => s.solid && (s.floor ?? 0) === band && boxes.get(s)!.some(b => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1))
      const openable = structures.some(s => s.solid && (s.floor ?? 0) === band && doors.includes(s.kind) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
      assertEqual(actual[y * 13 + x], Number(blocked && !openable), `scalar predicate seed=${seed} band=${band} cell=${x},${y}`)
    }
    assertEqual(calls, structures.filter(s => s.solid && (s.floor ?? 0) === band).length, 'one collider evaluation per eligible structure per flood')
  }
}
console.log(`generation obstacles regression passed: ${checks} checks`)
