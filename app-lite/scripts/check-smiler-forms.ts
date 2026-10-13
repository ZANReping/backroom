import assert from 'node:assert/strict'
import type { GameMap } from '../src/game/world/mapgen'
const memory = new Map<string, string>()
Object.assign(globalThis, {
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  document: { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null,
    addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { FLOOR_H } = await import('../src/game/world/mapgen')
const { Engine } = await import('../src/game/engine')
const { ENTITIES, SMILER_KINDS, MOTH_FORMS, makeEntity, recordEntityEncounter, loadSeen } = await import('../src/game/entities')
const { initSmiler, beginSmilerFrame, flushSmilerSpawns, updateSmiler } = await import('../src/game/engine/smilerAI')
type Kind = keyof typeof SMILER_KINDS
const kinds = Object.keys(SMILER_KINDS) as Kind[]
const zero = () => new Uint8Array(1024)
const eng = new Engine()
eng.map = { w:32,h:32,tiles:new Uint8Array(1024).fill(1),structures:[],items:[],lights:[],exits:[],entities:[],spawn:{x:16,y:16},
  wet:zero(),elev:zero(),outdoor:zero(),step:zero(),crawl:zero(),ceiling:zero(),up:zero(),upWall:zero(),up2:zero(),upWall2:zero(),stair:new Int32Array(1024),
  liquid:zero(),seaFloor:new Float32Array(1024),floors:1,dn:zero(),dnWall:zero(),tint:zero() } satisfies GameMap
Object.assign(eng.player, { level: 0, x: 16.5, y: 16.5, z: 0, floor: 0 })
eng.dev.frozenAI = true
const original = JSON.stringify(ENTITIES.smiler)
assert.deepEqual(Object.keys(ENTITIES).filter(k => k.startsWith('smiler')), ['smiler'])
for (const kind of kinds) {
  const def = SMILER_KINDS[kind]
  const e = makeEntity('smiler', 10, 10, 0, kind)
  assert.equal(e.def.smilerKind, kind)
  assert.equal(e.def.type, 'smiler')
  assert.equal(e.def.codex.no, ENTITIES.smiler.codex.no)
  assert.equal(e.hp, def.hp)
  initSmiler(eng, e, undefined, 0, false)
  assert.equal(e.sm?.kind, kind, 'explicit forms survive initialization in a level that only picks common')
  assert(eng.devSpawnEntity('smiler', 3, kind))
  const spawned = eng.map.entities.at(-1)!
  assert.equal(spawned.def.smilerKind, kind)
  assert.equal(spawned.sm?.kind, kind, 'frozen AI still has the selected form')
  assert.equal(spawned.hp, def.hp)
  assert.equal(spawned.def.damage, def.damage)
  beginSmilerFrame(eng, 1 / 30, false)
  updateSmiler(eng, spawned, 1 / 30, 3, 1, false)
  flushSmilerSpawns(eng)
  assert.equal(spawned.sm?.kind, kind, 'AI update never rerolls explicit selection')
  recordEntityEncounter(spawned)
}
assert.equal(eng.map.entities.length, 5, 'each developer click creates exactly one individual')
assert.equal(loadSeen().smiler, 5, 'all forms share encounter progress')
assert.equal(Object.keys(loadSeen()).filter(k => k.startsWith('smiler')).length, 1)
assert.equal(JSON.stringify(ENTITIES.smiler), original, 'base registration is not mutated')
assert.equal(makeEntity('smiler', 0, 0).def.smilerKind, undefined, 'natural spawns keep weighted selection')
assert(eng.devSpawnEntity('smiler'))
assert.equal(eng.map.entities.at(-1)!.sm?.kind, 'common', 'default developer selection is common')
for (const form of Object.keys(MOTH_FORMS) as (keyof typeof MOTH_FORMS)[]) {
  assert(eng.devSpawnEntity('deathmoth', 3, form))
  assert.equal(eng.map.entities.at(-1)!.def.mothForm, form)
}
assert.equal(makeEntity('deathmoth_female', 0, 0).def.mothForm, 'female', 'legacy moth alias still resolves')
assert.equal(makeEntity('deathmoth', 0, 0, 0, 'great').def.mothForm, 'male', 'foreign form cannot corrupt moth registration')
assert.equal(makeEntity('smiler', 0, 0, 0, 'female').def.smilerKind, undefined)
eng.map.up.fill(1); eng.player.floor = 1; eng.player.z = FLOOR_H
assert(eng.devSpawnEntity('smiler', 3, 'canid'))
assert.equal(eng.map.entities.at(-1)!.z, FLOOR_H, 'developer smiler is placed on the selected floor')
eng.map.tiles.fill(0)
const count = eng.map.entities.length
assert.equal(eng.devSpawnEntity('smiler', 3, 'great'), false)
assert.equal(eng.map.entities.length, count, 'failed placement creates no entity')
console.log('Smiler subforms: factory, shared codex, exact developer selection, frozen/active AI, single dog, floor and moth regression passed.')
