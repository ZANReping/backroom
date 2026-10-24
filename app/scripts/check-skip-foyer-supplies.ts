import assert from 'node:assert/strict'
const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => ({ getContext: () => null }), createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }) },
  window: { addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { generateInfinite } = await import('../src/game/world/infinite')
const { levelDefOf } = await import('../src/game/levels')
const { canOccupy, PLAYER_RADIUS } = await import('../src/game/core/player')
const { FOYER_ID } = await import('../src/game/world/foyerLayout')

let checks = 0
const ok = (value: unknown, message: string) => { assert(value, message); checks++ }
const eq = (actual: unknown, expected: unknown, message: string) => { assert.equal(actual, expected, message); checks++ }
const same = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks++ }

const starter = new Set(['flashlight', 'bandage', 'almond'])
const seeds = [1, 29, 424243, 20261006, -7, 8128]
for (const seed of seeds) {
  const base = generateInfinite(levelDefOf(0)!, seed, false)
  const fresh = generateInfinite(levelDefOf(0)!, seed, true)
  const delta = fresh.items.filter(it => !base.items.some(x => x.type === it.type && Math.hypot(x.x - it.x, x.y - it.y) < .01))
  same(delta.map(it => it.type).sort(), ['almond', 'bandage', 'flashlight'], `fixed starter delta seed ${seed}`)
  for (const it of delta) {
    const inf = fresh.inf!
    const key = `${Math.floor((it.x + inf.ox) / 32)},${Math.floor((it.y + inf.oy) / 32)}`
    const chunk = inf.chunks.get(key)
    ok(chunk?.items.some(x => x === it), `chunk reference ${seed}/${it.type}`)
    ok(canOccupy(fresh, it.x, it.y, PLAYER_RADIUS, { z: 0 }), `reachable ${seed}/${it.type}`)
    ok(Math.hypot(it.x - fresh.spawn.x, it.y - fresh.spawn.y) <= 8, `near spawn ${seed}/${it.type}`)
  }
  eq(generateInfinite(levelDefOf(0)!, seed, false).items.filter(it => starter.has(it.type)).length, base.items.filter(it => starter.has(it.type)).length, `firstVisit false no append ${seed}`)
}

const e = new Engine(); e.newRun(8128, 'normal', 'slot1', true, 0)
eq(e.player.level, 0, 'skip foyer starts L0')
eq(e.countItem('phone'), 1, 'phone grant'); eq(e.countItem('bottledwater'), 1, 'water grant'); eq(e.countItem('snackbar'), 2, 'snackbar grant')
eq(e.player.phone?.docked, false, 'phone undocked'); eq(e.player.phone?.cracked, true, 'phone cracked'); eq(e.player.phone?.noSignal, true, 'phone no signal'); eq(e.player.phone?.torch, false, 'phone torch off')
const foyer = new Engine(); foyer.newRun(8128, 'normal', 'slot2', true, FOYER_ID)
eq(foyer.player.level, FOYER_ID, 'prologue starts foyer'); eq(foyer.countItem('phone'), 0, 'prologue no phone inventory'); eq(foyer.countItem('bottledwater'), 0, 'prologue no water inventory'); eq(foyer.countItem('snackbar'), 0, 'prologue no snack inventory')
e.persist(); const r = new Engine(); r.newRun(8128, 'normal', 'slot1')
eq(r.countItem('phone'), 1, 'save phone once'); eq(r.countItem('bottledwater'), 1, 'save water once'); eq(r.countItem('snackbar'), 2, 'save snacks once')
eq(r.player.phone?.docked, false, 'save phone undocked'); eq(r.player.phone?.cracked, true, 'save phone cracked'); eq(r.player.phone?.noSignal, true, 'save phone no signal'); eq(r.player.phone?.torch, false, 'save phone torch off')
ok(r.map?.inf?.chunks.size, 'streaming chunk references present')
console.log(JSON.stringify({ ok: true, checks }))
