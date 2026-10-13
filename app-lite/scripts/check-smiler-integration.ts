import assert from 'node:assert/strict'
import * as THREE from 'three'
import { makeEntity } from '../src/game/entities'
import { beginSmilerFrame, flushSmilerSpawns, initSmiler, smilerHear, updateSmiler } from '../src/game/engine/smilerAI'
import { SMILER_KINDS, type SmilerKind } from '../src/game/entities/smilers'
import { buildEntityMesh } from '../src/game/renderer/entitiesMesh'
import { animateSmiler } from '../src/game/renderer/smilerMesh'

function world(kind: SmilerKind = 'common') {
  const e = makeEntity('smiler', 6, 0, 0)
  const w = 32, h = 32, cells = w * h
  const eng: any = {
    // Roofless open plane with the complete map arrays needed by clearance.
    map: {
      w, h, tiles: new Uint8Array(cells), tint: new Uint8Array(cells),
      ceiling: new Uint8Array(cells), floors: 1, stair: new Int32Array(cells),
      up: new Uint8Array(cells), up2: new Uint8Array(cells), dn: new Uint8Array(cells),
      crawl: new Uint8Array(cells), outdoor: new Uint8Array(cells),
      elev: new Uint8Array(cells), step: new Uint8Array(cells),
      liquid: new Uint8Array(cells), seaFloor: new Float32Array(cells),
      structures: [], lights: [], exits: [], spawn: { x: 0, y: 0 },
      entities: [e], items: [], inf: { ox: 0, oy: 0, taken: new Set<number>() }
    },
    player: { x: 0, y: 0, z: 0, hp: 100, sanity: 100, stamina: 100, slowT: 0 },
    levelDef: { id: 2 }, input: { sprint: false }, dev: {}, projectiles: [], camShake: 0,
    msg() {}, los: () => true, lookingAt: () => false, entityWalkH: () => 0,
    viewAngle: () => 0, faceToward() {}, wanderTarget() {}, stepEntity: () => false,
    meleeZOk: () => true, hurtPlayer(n: number) { this.player.hp -= n },
  }
  initSmiler(eng, e, kind, 1)
  const step = (light = false, dt = 1 / 30) => {
    beginSmilerFrame(eng, dt, light)
    updateSmiler(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y), 1, false)
  }
  return { eng, e, step }
}
{
  const { eng, e, step } = world()
  eng.map.items.push({ id: 42, type: 'glowstick', x: 6, y: 0, z: 0 })
  e.sm!.phase = 'feed'; e.sm!.lureKey = 'i42'; e.sm!.t = 7
  step()
  assert.equal(eng.map.items.length, 0)
  assert(eng.map.inf.taken.has(42), 'consumed bait must stay removed after chunk restitch')
}
for (const blocked of ['floor', 'wall']) {
  const { eng, e, step } = world('great')
  eng.map.items.push({ id: 42, type: 'glowstick', x: 6, y: 0, z: blocked === 'floor' ? 4 : 0 })
  if (blocked === 'wall') eng.los = () => false
  step()
  assert.equal(eng.map.items.length, 1, `${blocked} blocks crushing`)
  assert.notEqual(e.sm!.phase, 'feed', `${blocked} blocks feeding`)
}
{
  const { eng, e, step } = world()
  e.x = .6; e.sm!.phase = 'pounce'; e.sm!.strikeT = .01
  eng.los = () => false
  step(true)
  assert.equal(eng.player.hp, 100, 'wall blocks a strike that is already winding up')
  step(true)
  assert.equal(e.sm!.strikeT, undefined, 'wall blocks a new strike')
}
{
  const { eng, e, step } = world()
  step(true)
  eng.input.sprint = true
  for (let i = 0; i < 3; i++) {
    eng.map.inf.ox += 32; eng.player.x -= 32; e.x -= 32
    step(true)
  }
  assert.notEqual(e.sm!.phase, 'pounce', 'window recentering is not sprint panic')
  smilerHear(eng, e, e.x + 3, 0, 5, false)
  e.sm!.aware = 0; e.sm!.phase = 'drift'
  eng.map.inf.ox += 32; eng.player.x -= 32; e.x -= 32
  step(false)
  assert.equal(e.targetX, e.x + 3, 'remembered sound stays at its world position')
}
{
  const { eng, e } = world()
  initSmiler(eng, e, 'canid') // queues extra pack members
  eng.map = { ...eng.map, entities: [], items: [] }
  flushSmilerSpawns(eng)
  assert.equal(eng.map.entities.length, 0, 'old-map pack cannot enter a new level')
  const other = world()
  flushSmilerSpawns(other.eng)
  assert.equal(other.eng.map.entities.length, 1, 'engines do not share spawn queues')
}
{
  const { eng } = world()
  const hurt = makeEntity('smiler', 4, 0, 0)
  hurt.hp *= .25
  initSmiler(eng, hurt, 'phantom')
  assert.equal(hurt.hp, SMILER_KINDS.phantom.hp * .25, 'first-hit initialization keeps health proportion')
  const upper = makeEntity('smiler', 4, 0, 4)
  const bands: number[] = []
  eng.entityWalkH = (_m: unknown, _x: number, _y: number, band: number) => { bands.push(band); return 4 }
  initSmiler(eng, upper, 'canid'); flushSmilerSpawns(eng)
  assert(bands.length && bands.every(b => b === 1), 'pack spawn checks its own floor')
  assert(eng.map.entities.slice(1).every((v: any) => v.z === 4), 'pack stays on the same floor')
}

const budgets: object[] = []
for (const kind of Object.keys(SMILER_KINDS) as SmilerKind[]) {
  const a = buildEntityMesh('smiler', { smilerKind: kind, seed: 3 })
  const b = buildEntityMesh('smiler', { smilerKind: kind, seed: 3 })
  const collect = (group: THREE.Group) => {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    let meshes = 0, triangles = 0
    group.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return
      meshes++; geometries.add(o.geometry)
      triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3
      for (const attr of Object.values(o.geometry.attributes)) assert(Array.from(attr.array).every(Number.isFinite), `${kind}: finite attributes`)
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m)
    })
    return { geometries, materials, meshes, triangles }
  }
  const ca = collect(a), cb = collect(b)
  assert(ca.meshes <= 24 && ca.triangles <= 1800, `${kind}: model budget`)
  let disposedOther = 0
  for (const g of cb.geometries) { assert(!ca.geometries.has(g)); g.addEventListener('dispose', () => disposedOther++) }
  for (const m of cb.materials) { assert(!ca.materials.has(m)); m.addEventListener('dispose', () => disposedOther++) }
  for (const g of ca.geometries) g.dispose()
  for (const m of ca.materials) m.dispose()
  assert.equal(disposedOther, 0, 'one instance disposal does not dispose another')
  const { e } = world(kind)
  for (const grin of [0, .5, 1]) {
    e.sm!.grin = grin; e.sm!.vis = grin; e.state = 'chase'
    animateSmiler(b, e, grin * 8, 0); b.updateMatrixWorld(true)
    b.traverse(o => assert(o.matrixWorld.elements.every(Number.isFinite)))
  }
  collect(b)
  budgets.push({ kind, meshes: ca.meshes, triangles: ca.triangles })
  for (const g of cb.geometries) g.dispose()
  for (const m of cb.materials) m.dispose()
}
console.log(JSON.stringify({ integration: 'passed', budgets }, null, 2))
