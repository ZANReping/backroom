import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import * as THREE from 'three'
import { denseL0Maze, mazeHasStraightCrossing } from '../src/game/world/l0Maze'
import { exposedL0WallFaces } from '../src/game/world/l0WallFaces'
import { genL0Architecture, type L0Layout, type L0Wall } from '../src/game/world/l0Architecture'
import { LEVELS } from '../src/game/levels'
import { legacyL0Region, l0BaseRegion, l0EnvironmentAt } from '../src/game/world/l0Regions'
import '../src/game/world/mapgen'
import { createL0LightSampler } from '../src/game/renderer/l0LightingBake'
import { buildL0FixtureParts } from '../src/game/renderer/l0Fixtures'

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const area = (f: { w: number; h: number }) => f.w * f.h
const wall = (x: number, y: number, w: number, h: number): L0Wall => ({ x, y, w, h, bottom: 0, top: 2, surface: 'wall' })
const emptyLayout = (seed: number, cx: number, cy: number, lamps: L0Layout['lamps']): L0Layout => ({
  seed, cx, cy, region: 'open', baseRegion: 'open', revision: 0, reference: false,
  walls: [], pits: [], puddles: [], arches: [], lamps,
})

const start = performance.now()
let wallTotal = 0
let finalMazeChecks = 0
for (let i = 0; i < 1000; i++) {
  const seed = (i * 2654435761) | 0
  const cx = (i % 19) - 9, cy = ((i * 7) % 19) - 9
  const a = denseL0Maze(seed, cx, cy), b = denseL0Maze(seed, cx, cy)
  assert.deepEqual(a, b, `maze is not deterministic at ${seed}/${cx}/${cy}`)
  for (const w of a) for (const n of [w.x, w.y, w.w, w.h, w.bottom, w.top]) assert(finite(n), 'maze contains non-finite wall')
  assert.equal(mazeHasStraightCrossing(a, cx * 32, cy * 32), false, 'maze has X straight crossing')
  assert.equal(mazeHasStraightCrossing(a, cx * 32, cy * 32, true), false, 'maze has Y straight crossing')
  wallTotal += a.length
  const final = genL0Architecture(LEVELS[0], seed, cx, cy).l0!
  if (final.baseRegion === 'maze' && !final.reference) {
    assert.equal(mazeHasStraightCrossing(final.walls, cx * 32, cy * 32), false, `final maze X crossing ${seed}/${cx}/${cy}`)
    assert.equal(mazeHasStraightCrossing(final.walls, cx * 32, cy * 32, true), false, `final maze Y crossing ${seed}/${cx}/${cy}`)
    finalMazeChecks++
  }
}

const lWalls = [wall(0, 0, 2, 1), wall(1, 0, 1, 2)]
const faces = exposedL0WallFaces(lWalls)
const faceKeys = new Set(faces.map(f => `${f.axis}:${f.sign}:${f.at}:${f.u}:${f.v}:${f.w}:${f.h}`))
assert.equal(faceKeys.size, faces.length, 'exposed faces contain duplicate coplanar patches')
assert.equal(faces.reduce((s, f) => s + area(f), 0), 22, 'L union exposes an internal cap or misses a surface')

const fixtureMetrics: Record<string, unknown> = {}
for (const lamp of [{ x: 0, y: 0, round: false }, { x: 7, y: -3, round: false, width: 1.2, depth: .6 }]) {
  const parts = buildL0FixtureParts(lamp, 3)
  assert.equal(parts.diffuser.length, 4, 'rectangular fixture must have four tubes')
  let triangles = 0
  const root = new THREE.Group()
  for (const geometries of Object.values(parts)) for (const geometry of geometries) {
    const position = geometry.getAttribute('position')
    assert(Array.from(position.array).every(Number.isFinite), 'fixture position is non-finite')
    triangles += (geometry.index?.count ?? position.count) / 3
    root.add(new THREE.Mesh(geometry))
  }
  root.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  assert(size.toArray().every(Number.isFinite), 'fixture bounds are non-finite')
  assert(triangles <= 650, `fixture exceeds triangle budget: ${triangles}`)
  fixtureMetrics[`${lamp.x},${lamp.y}`] = { triangles, diffuser: parts.diffuser.length, bounds: size.toArray() }
}

const lamps: L0Layout['lamps'] = [
  { x: 0, y: 0, red: false, off: false, round: false, width: 1.2, depth: .6 },
  { x: 4, y: 0, red: false, off: false, round: false, width: 1.2, depth: .6 },
]
const la = emptyLayout(1, 0, 0, lamps), lb = emptyLayout(2, 0, 0, lamps.slice().reverse())
const sampleA = createL0LightSampler(la, [lb]), sampleB = createL0LightSampler(lb, [la])
const lighting: Record<string, number> = {}
for (const h of [.14, .15, .16]) {
  const a = sampleA(2, 0, h, 0, 1, 0), b = sampleB(2, 0, h, 0, 1, 0)
  assert(Math.abs(a - b) < .03, `lighting order mismatch at h=${h}`)
  lighting[h.toFixed(2)] = a
}
assert(Math.max(...Object.values(lighting)) - Math.min(...Object.values(lighting)) < .03, 'lighting is discontinuous across fixture heights')

const weightSeed = 7391
const weights = { red: 0, blackout: 0, total: 0 }
const legacyCounts: Record<string, number> = {}
for (let cy = -40; cy <= 40; cy++) for (let cx = -40; cx <= 40; cx++) {
  const legacy = legacyL0Region(weightSeed, cx, cy); legacyCounts[legacy] = (legacyCounts[legacy] ?? 0) + 1
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const e = l0EnvironmentAt(weightSeed, cx * 32 + (gx + .5) * 8, cy * 32 + (gy + .5) * 8)
    weights.total++; if (e.red > .5) weights.red++; if (e.blackout > .5) weights.blackout++
  }
}

let archChecks = 0
for (let cy = -40; cy <= 40; cy++) for (let cx = -40; cx <= 40; cx++) {
  const a = genL0Architecture(LEVELS[0], weightSeed, cx, cy).l0!
  if (a.region !== 'arch' || a.reference) continue
  archChecks++
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.notEqual(l0BaseRegion(weightSeed, cx + dx, cy + dy), 'manila', `arch/manila adjacency ${cx},${cy}`)
  for (let y = -12; y <= 44; y += 8) for (let x = -12; x <= 44; x += 8) {
    const e = l0EnvironmentAt(weightSeed, cx * 32 + x, cy * 32 + y)
    assert(e.red <= .5 && e.blackout <= .5, `arch 12m buffer has red/blackout at ${cx},${cy}`)
  }
}

const report = { elapsedMs: +(performance.now() - start).toFixed(1), mazeSamples: 1000, finalMazeChecks, averageWalls: wallTotal / 1000, fixtureMetrics, lWallFaceArea: faces.reduce((s, f) => s + area(f), 0), lighting, seed7391: { weights, legacyCounts, archChecks } }
const reportDir=`reports/l0-remake/${process.env.QA_TAG??'iteration-16'}`
await mkdir(reportDir, { recursive: true })
await writeFile(`${reportDir}/continuity.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
