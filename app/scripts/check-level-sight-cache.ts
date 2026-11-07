// The steady-state sight index must match a full rebuild, and Level 601 must
// not fall back to scanning every structure on each visibility pass.
//
//   npx esbuild scripts/check-level-sight-cache.ts --bundle --platform=node --format=esm --outfile=.cache/check-level-sight-cache.mjs && node .cache/check-level-sight-cache.mjs
import { performance } from 'node:perf_hooks'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
  document: { createElement: () => ({ getContext: () => null, style: {} }) },
})

const { Engine } = await import('../src/game/engine')
const { audio } = await import('../src/game/core/audio')
const { levelLabel } = await import('../src/game/levels/index')
const { mapSight } = await import('../src/game/world/mapSight')
const { computeVisibility } = await import('../src/game/engine/ambient')
const { scanInteract } = await import('../src/game/engine/interact')
const { look } = await import('../src/game/renderer/shared')

for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) {
  if (key !== 'constructor' && typeof (audio as unknown as Record<string, unknown>)[key] === 'function')
    (audio as unknown as Record<string, () => void>)[key] = () => {}
}

let failed = 0
const ok = (cond: unknown, message: string) => {
  if (!cond) { failed++; console.error('FAIL', message) }
  else console.log('ok', message)
}
const same = (a: { cells: number[]; points: { x: number; y: number }[]; range: number }, b: typeof a) => {
  if (a.range !== b.range || a.points.length !== b.points.length || a.cells.length !== b.cells.length) return false
  const as = [...a.cells].sort((x, y) => x - y), bs = [...b.cells].sort((x, y) => x - y)
  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false
  for (let i = 0; i < a.points.length; i++) if (a.points[i].x !== b.points[i].x || a.points[i].y !== b.points[i].y) return false
  return true
}

function boot(id: number) {
  const eng = new Engine()
  eng.emit = () => {}
  eng.persist = () => {}
  eng.seed = 424242
  eng.dev.god = true
  eng.dev.statLock = true
  eng.introT = 0
  eng.loadLevel(id, { mapSeed: 424242, firstVisit: false })
  look.yaw = 0
  look.pitch = 0
  return eng
}

function checkSight(id: number) {
  const eng = boot(id)
  const label = levelLabel(id)
  const poses: { x: number; y: number; yaw: number; crouch: boolean }[] = [
    { x: eng.player.x, y: eng.player.y, yaw: 0, crouch: false },
    { x: eng.player.x + 3.2, y: eng.player.y + 1.7, yaw: 0.4, crouch: false },
    { x: eng.player.x + 3.2, y: eng.player.y + 1.7, yaw: 1.2, crouch: true },
  ]
  for (const pose of poses) {
    // Warm the collider index, then step far enough to miss the result cache
    // while still reusing that index. `fresh` rebuilds the index from scratch.
    eng.player.x = pose.x
    eng.player.y = pose.y
    eng.player.crouching = pose.crouch
    look.yaw = pose.yaw
    mapSight(eng, pose.yaw, false)
    eng.player.x += .25
    look.yaw += .01
    const reused = mapSight(eng, look.yaw, false)
    const rebuilt = mapSight(eng, look.yaw, true)
    ok(same(reused, rebuilt), `${label} reused sight index matches a rebuild at yaw ${pose.yaw.toFixed(2)} crouch ${pose.crouch}`)
    ok(reused.cells.length > 0, `${label} sight reveals at least one cell`)
  }
  const held = mapSight(eng, look.yaw, false)
  const again = mapSight(eng, look.yaw, false)
  ok(again === held, `${label} an unchanged pose reuses the sight result`)
  eng.player.x += .05
  const nudged = mapSight(eng, look.yaw, false)
  if (id !== 11) ok(nudged !== held, `${label} a 5 cm step recomputes the cone`)
  ok(same(nudged, mapSight(eng, look.yaw, true)), `${label} the stepped cone matches a rebuild`)
  if (eng.map?.inf) {
    const before = eng.map.inf.rev
    eng.player.x += 40
    eng.updateInfiniteWindow()
    ok(eng.map.inf.rev !== before, `${label} a chunk crossing advances the map revision`)
    ok(same(mapSight(eng, look.yaw, false), mapSight(eng, look.yaw, true)), `${label} sight after a chunk crossing matches a rebuild`)
  }
  computeVisibility(eng)
  const visible = Uint8Array.from(eng.visible)
  const x = eng.player.x
  eng.player.x = x + .02
  computeVisibility(eng)
  eng.player.x = x
  computeVisibility(eng)
  let changed = 0
  for (let i = 0; i < visible.length; i++) if (visible[i] !== eng.visible[i]) changed++
  ok(changed === 0, `${label} visibility is stable when the player returns to the same point (${changed} cells differed)`)
  eng.map = null
}

function sameTarget(a: { kind: string; label: string; s?: object; it?: object; e?: object; npc?: object; ent?: object; foyerId?: string } | null, b: typeof a) {
  if (a === b) return true
  if (!a || !b) return false
  return a.kind === b.kind && a.label === b.label && a.s === b.s && a.it === b.it && a.e === b.e && a.npc === b.npc && a.ent === b.ent && a.foyerId === b.foyerId
}
function checkInteract(id: number) {
  const eng = boot(id)
  const label = levelLabel(id)
  const originX = eng.player.x, originY = eng.player.y
  for (const dx of [0, 2.5, -4, 7]) for (const dy of [0, 1.5, -3, 6]) {
    eng.player.x = originX + dx
    eng.player.y = originY + dy
    look.yaw = dx * .15
    scanInteract(eng, true)
    const brute = eng.interactTarget
    scanInteract(eng)
    ok(sameTarget(brute, eng.interactTarget), `${label} interact target matches a full scan at ${dx},${dy}`)
  }
  const samples: number[] = []
  for (let i = 0; i < 40; i++) {
    eng.player.x = originX + (i % 8)
    const t = performance.now()
    scanInteract(eng)
    samples.push(performance.now() - t)
  }
  samples.sort((a, b) => a - b)
  const p90 = samples[Math.floor((samples.length - 1) * .9)]
  console.log(`interact ${label} p90 ${p90.toFixed(3)} ms`)
  eng.map = null
}

checkSight(0)
checkSight(1)
checkSight(4)
checkSight(12)
checkInteract(0)
checkInteract(12)
checkInteract(101)

{
  const eng = boot(12)
  const samples: number[] = []
  for (let i = 0; i < 24; i++) {
    eng.player.x += .3
    const t = performance.now()
    computeVisibility(eng)
    samples.push(performance.now() - t)
  }
  samples.sort((a, b) => a - b)
  const p90 = samples[Math.floor((samples.length - 1) * .9)]
  ok(p90 < 25, `Level 601 visibility p90 ${p90.toFixed(2)} ms stays indexed (unindexed baseline was ~15 ms per pass)`)
  eng.map = null
}

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('level sight cache checks passed')
