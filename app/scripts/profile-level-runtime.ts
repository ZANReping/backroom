// Headless steady-state CPU profile of every playable level.
// This does not measure GPU frame time or display FPS. It times the real Engine
// load/update path and the per-frame sight, interaction and AI functions.
//
//   npx esbuild scripts/profile-level-runtime.ts --bundle --platform=node --format=esm --outfile=.cache/profile-level-runtime.mjs
//   node .cache/profile-level-runtime.mjs [id,id,...]
import { performance } from 'node:perf_hooks'
import { mkdirSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  },
  window: {
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  },
  document: { createElement: () => ({ getContext: () => null, style: {} }) },
})

const { Engine } = await import('../src/game/engine')
const { audio } = await import('../src/game/core/audio')
const { ALL_LEVEL_DEFS, FOYER_LEVEL_DEF, L02_LEVEL_DEF, levelDefOf, levelLabel } = await import('../src/game/levels/index')
const { mapSight } = await import('../src/game/world/mapSight')
const { computeVisibility } = await import('../src/game/engine/ambient')
const { scanInteract } = await import('../src/game/engine/interact')
const { updateEntities } = await import('../src/game/engine/entityAI')
const { enableRuntimeStructCollisionIndex } = await import('../src/game/world/mapgen')
const { look } = await import('../src/game/renderer/shared')

for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) {
  if (key !== 'constructor' && typeof (audio as unknown as Record<string, unknown>)[key] === 'function')
    (audio as unknown as Record<string, () => void>)[key] = () => {}
}

const percentile = (values: number[], q: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))]
}
const stats = (values: number[]) => ({
  n: values.length,
  median: percentile(values, .5),
  p90: percentile(values, .9),
  max: values.length ? Math.max(...values) : 0,
})
const heap = () => process.memoryUsage().heapUsed

function boot(id: number) {
  const eng = new Engine()
  eng.emit = () => {}
  eng.persist = () => {}
  eng.seed = 424242
  eng.difficulty = 'normal'
  eng.dev.god = true
  eng.dev.statLock = true
  eng.introT = 0
  const started = performance.now()
  eng.loadLevel(id, { mapSeed: 424242, firstVisit: false })
  const loadMs = performance.now() - started
  return { eng, loadMs }
}

function counts(eng: Engine) {
  const m = eng.map!
  let solid = 0
  for (const s of m.structures) if (s.solid) solid++
  return {
    label: levelLabel(eng.player.level),
    name: eng.levelDef.name,
    gen: eng.levelDef.gen,
    infinite: !!eng.levelDef.infinite,
    fullMap: !!eng.levelDef.fullMap,
    w: m.w, h: m.h,
    structures: m.structures.length,
    solid,
    entities: m.entities.length,
    items: m.items.length,
    exits: m.exits.length,
    lights: m.lights.length,
    chunks: m.inf?.chunks.size ?? 0,
    npcs: eng.npcs?.length ?? 0,
  }
}

function timeCalls(n: number, fn: () => void) {
  const samples: number[] = []
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    fn()
    samples.push(performance.now() - t)
  }
  return stats(samples)
}

function profile(id: number) {
  look.yaw = 0
  look.pitch = 0
  const { eng, loadMs } = boot(id)
  const m = eng.map!
  const beforeIndex = eng.levelDef.fullMap ? null : timeCalls(12, () => computeVisibility(eng))
  enableRuntimeStructCollisionIndex(m)
  const info = counts(eng)
  const p = eng.player
  // Bust the exact-position sight cache on every sample. L11 also ignores
  // sub-0.18 m moves, so the step and yaw delta stay above that threshold.
  const sight = timeCalls(36, () => {
    p.x += .25
    look.yaw += .02
    mapSight(eng, look.yaw)
  })
  p.x = m.spawn.x + .5
  look.yaw = 0
  const visibility = eng.levelDef.fullMap ? null : timeCalls(36, () => {
    p.x += .25
    look.yaw += .02
    computeVisibility(eng)
  })
  p.x = m.spawn.x + .5
  p.y = m.spawn.y + .5
  look.yaw = 0
  const interact = timeCalls(80, () => scanInteract(eng))
  const ai = timeCalls(40, () => updateEntities(eng, 1 / 60, 1))
  const beforeHeap = heap()
  const sightAlloc = timeCalls(80, () => {
    p.x += .25
    look.yaw += .02
    mapSight(eng, look.yaw)
  })
  const sightHeapDelta = heap() - beforeHeap
  p.x = m.spawn.x + .5
  p.y = m.spawn.y + .5
  look.yaw = 0
  eng.input.mx = 1
  eng.input.my = 0
  const walkSamples: number[] = []
  let moved = 0
  const x0 = p.x, y0 = p.y
  for (let i = 0; i < 120; i++) {
    eng.input.mx = 1
    eng.input.my = 0
    const t = performance.now()
    eng.update(1 / 60)
    walkSamples.push(performance.now() - t)
  }
  moved = Math.hypot(p.x - x0, p.y - y0)
  // One forced chunk-window shift, when the level streams.
  let shiftMs: number | null = null
  if (m.inf) {
    p.x += 32
    const t = performance.now()
    eng.updateInfiniteWindow()
    shiftMs = performance.now() - t
  }
  eng.map = null
  return {
    level: id,
    ...info,
    loadMs,
    beforeIndexVisibility: beforeIndex,
    mapSightWhileMoving: sight,
    computeVisibilityWhileMoving: visibility,
    scanInteract: interact,
    updateEntities: ai,
    walkUpdate: stats(walkSamples),
    walkedMetres: moved,
    shiftMs,
    sightHeapDeltaBytes: sightHeapDelta,
    sightAllocWhileMoving: sightAlloc,
  }
}

const requested = process.argv[2]?.split(',').map(Number).filter(n => Number.isFinite(n))
const ids = requested?.length ? requested : [
  ...ALL_LEVEL_DEFS.map(d => d.id),
  FOYER_LEVEL_DEF.id,
  L02_LEVEL_DEF.id,
  117, 118, 119,
]
const rows = []
for (const id of ids) {
  const def = levelDefOf(id)
  if (!def) { rows.push({ level: id, error: 'missing level def' }); continue }
  const started = performance.now()
  try {
    const row = profile(id)
    rows.push(row)
    console.log(JSON.stringify({
      level: row.level, label: row.label, gen: row.gen, infinite: row.infinite,
      loadMs: Math.round(row.loadMs),
      structures: row.structures, entities: row.entities, chunks: row.chunks,
      walkP90: +row.walkUpdate.p90.toFixed(2),
      sightP90: +row.mapSightWhileMoving.p90.toFixed(2),
      visP90: row.computeVisibilityWhileMoving ? +row.computeVisibilityWhileMoving.p90.toFixed(2) : null,
      interactP90: +row.scanInteract.p90.toFixed(2),
      aiP90: +row.updateEntities.p90.toFixed(2),
      shiftMs: row.shiftMs === null ? null : +row.shiftMs.toFixed(1),
      beforeVisP90: row.beforeIndexVisibility ? +row.beforeIndexVisibility.p90.toFixed(2) : null,
      walked: +row.walkedMetres.toFixed(2),
      ms: Math.round(performance.now() - started),
    }))
  } catch (error) {
    rows.push({ level: id, label: levelLabel(id), error: error instanceof Error ? error.stack ?? error.message : String(error) })
    console.log(JSON.stringify({ level: id, error: error instanceof Error ? error.message : String(error) }))
  }
  if (global.gc) global.gc()
}

const out = {
  kind: 'node-engine-cpu',
  note: 'Synthetic headless timings of the real Engine. Not GPU frame time and not a FPS claim. Collision index is enabled before steady samples, matching the renderer after a level finishes building. beforeIndexVisibility is the same visibility pass before that index exists.',
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpus: cpus().map(c => c.model),
  seed: 424242,
  capturedAt: new Date().toISOString(),
  rows,
}
const file = process.argv[3] ?? 'reports/level-runtime-performance/profile.json'
mkdirSync(new URL('../reports/level-runtime-performance/', import.meta.url), { recursive: true })
writeFileSync(file.startsWith('/') ? file : new URL('../' + file, import.meta.url), JSON.stringify(out, null, 2))
console.log('wrote', file)
