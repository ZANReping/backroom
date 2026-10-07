import assert from 'node:assert/strict'

// Keep these imports ordered: mapgen owns the collision helpers, then levels
// registers level definitions, and l0Architecture remains the pure generator.
import { structColliders } from '../src/game/world/mapgen'
import { LEVELS } from '../src/game/levels'
import { genL0Architecture, genL0Private, l0Layout, l0RegionOf, L0_PHOTO_ANCHORS, newL0Space } from '../src/game/world/l0Architecture'

const l0 = LEVELS.find(level => level.id === 0)!
assert(l0, 'Level 0 definition is registered')

const finite = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(finite)
  if (value && typeof value === 'object') return Object.values(value).every(finite)
  return true
}

const stable = (raw: ReturnType<typeof genL0Architecture>) => ({
  variant: raw.variant,
  tiles: Array.from(raw.tiles),
  structures: raw.structures,
  items: raw.items,
  exits: raw.exits.map(exit => ({ x: exit.x, y: exit.y, kind: exit.def.kind })),
  l0: raw.l0,
})

// Determinism and finite coordinates, including negative world chunks.
for (const [seed, cx, cy, revision] of [[20261006, 0, 0, 0], [17, -11, 7, 0], [17, 5, -9, 2]] as const) {
  const a = genL0Architecture(l0, seed, cx, cy, undefined, revision)
  const b = genL0Architecture(l0, seed, cx, cy, undefined, revision)
  assert.deepEqual(stable(a), stable(b), `deterministic L0 output at ${cx},${cy}`)
  assert(finite(a), `finite L0 output at ${cx},${cy}`)
}

assert.equal(L0_PHOTO_ANCHORS.length, 12, 'all 12 photo anchors are present')
assert.equal(new Set(L0_PHOTO_ANCHORS.map(anchor => anchor.id)).size, 12, 'photo anchor ids are unique')
for (const anchor of L0_PHOTO_ANCHORS) assert(finite(anchor), `finite photo anchor ${anchor.id}`)

// Showcase/reference layouts are deliberately frozen while normal layouts may revise.
for (let cx = 0; cx <= 18; cx += 3) {
  const first = l0Layout(20261006, cx, 0, undefined, 0)
  const revised = l0Layout(20261006, cx, 0, undefined, 4)
  assert(first.reference, `showcase chunk ${cx} is marked reference`)
  assert.deepEqual(revised, first, `showcase layout ${cx} is revision invariant`)
}

function crossesBoundary(layout: ReturnType<typeof l0Layout>, axis: 'x' | 'y', edge: number) {
  return layout.walls.some(w => axis === 'x'
    ? w.x < edge && w.x + w.w > edge
    : w.y < edge && w.y + w.h > edge)
}
for (const [cx, cy] of [[6, -1], [6, 0], [6, 1], [15, -2], [15, -1], [15, 0], [15, 1]] as const) {
  const layout = l0Layout(20261006, cx, cy)
  assert(!crossesBoundary(layout, 'x', (cx + 1) * 32), `reference region ${cx},${cy} has no cross-chunk x wall`)
  assert(!crossesBoundary(layout, 'y', (cy + 1) * 32), `reference region ${cx},${cy} has no cross-chunk y wall`)
  assert.deepEqual(l0Layout(20261006, cx, cy, undefined, 1), layout, `reference layout ${cx},${cy} stays frozen across revisions`)
  if(cy>(cx===6?-1:-2))assert(!layout.walls.some(w=>w.y<=cy*32+.01&&w.y+w.h>cy*32+.01&&w.w>8),`joined ${cx},${cy} has no old boundary wall closing the hall`)
}

const photoIds = new Set(['manila-plan'])
for (const anchor of L0_PHOTO_ANCHORS) {
  if (photoIds.has(anchor.id)) continue
  const cx = Math.floor(anchor.x / 32), cy = Math.floor(anchor.y / 32)
  const layout = l0Layout(20261006, cx, cy)
  const eyeHeight = 1.55+('z' in anchor?anchor.z:0), radius = .15
  for (const wall of layout.walls) {
    if (wall.bottom > eyeHeight) continue
    const dx = Math.max(wall.x - anchor.x, 0, anchor.x - (wall.x + wall.w))
    const dy = Math.max(wall.y - anchor.y, 0, anchor.y - (wall.y + wall.h))
    assert(Math.hypot(dx, dy) > radius, `photo anchor ${anchor.id} clears walls`)
  }
  assert(!layout.pits.some(p => anchor.x >= p.x && anchor.x <= p.x + p.w && anchor.y >= p.y && anchor.y <= p.y + p.h), `photo anchor ${anchor.id} is not in a pit`)
}

const manila = genL0Architecture(l0, 20261006, 18, 0)
assert.equal(manila.l0?.region, 'manila', 'showcase Manila region')
assert.deepEqual(manila.l0?.wood, { x: 18 * 32 + 12, y: 12, w: 8, h: 8 }, 'Manila has an 8x8m wood interior')
assert.equal(manila.structures.filter(s => s.kind === 'hoteldoor').length, 4, 'Manila has four wooden doors')
assert.equal(manila.structures.filter(s => s.data?.chair).length, 2, 'Manila has two chairs')
assert.equal(manila.structures.filter(s => s.data?.fallen).length, 1, 'Manila has one fallen chair')
assert.equal(manila.exits.filter(e => e.def.kind === 'flickerdoor').length, 1, 'Manila has a reliable flicker-door exit')

const privateRoom = genL0Private(l0, 20261006, 0, 0)
assert.equal(privateRoom.items.length, 0, 'private red room has no raw items')
assert.equal(privateRoom.exits.length, 0, 'private red room has no raw exits')
assert.equal(privateRoom.entities.length, 0, 'private red room has no entities')
const privateFloor = (x: number, y: number) => privateRoom.tiles[y * 32 + x] === 1
const privatePoints = [[3, 23], [3, 14], [12, 14], [12, 4], [23, 4]] as const
const queue = [privatePoints[0]]
const seen = new Set(queue.map(([x, y]) => `${x},${y}`))
while (queue.length) {
  const [x, y] = queue.shift()!
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy, key = `${nx},${ny}`
    if (privateFloor(nx, ny) && !seen.has(key)) { seen.add(key); queue.push([nx, ny]) }
  }
}
for (const [x, y] of privatePoints) assert(seen.has(`${x},${y}`), `private red-room floor point ${x},${y} is connected`)

// Exercise normal generation over a broad fixture set, including negative coordinates.
let pillarhall = false
for (let cy = -10; cy < 10; cy++) for (let cx = -10; cx < 10; cx++) {
  const raw = genL0Architecture(l0, 7391, cx, cy)
  assert(finite(raw), `finite normal chunk ${cx},${cy}`)
  assert(raw.structures.some(s => s.data?.l0Wall), `normal chunk ${cx},${cy} has wall structures`)
  if (raw.variant === 'pillarhall') pillarhall = true
  for (const structure of raw.structures.filter(s => s.data?.l0Wall)) {
    const boxes = structColliders(structure)
    assert.equal(boxes.length, 1, 'each l0Wall has one collider')
    assert(Math.abs((boxes[0].x1 - boxes[0].x0) - structure.w) <= 1e-8, 'l0Wall collider width matches structure')
    assert(Math.abs((boxes[0].y1 - boxes[0].y0) - structure.h) <= 1e-8, 'l0Wall collider height matches structure')
  }
  assert(raw.exits.every(exit => exit.def.kind !== 'graystairs'), `no graystairs in chunk ${cx},${cy}`)
}
assert(pillarhall, 'normal seed produces a pillar hall across the fixture area')

console.log('L0 architecture checks passed')
