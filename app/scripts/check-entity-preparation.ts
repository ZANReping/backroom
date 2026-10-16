import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { EntityPreparationQueue } from '../src/game/renderer/entityPreparation'
import { clumpBlobReady, getBlob, prepareClumpBlob } from '../src/game/renderer/clumpBlob'
import { mothTextures, mothTexturesReady, prepareMothTextures } from '../src/game/renderer/mothTextures'

Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(512, 512), createElementNS: () => ({}) } })

let checks = 0
const ok = (v: unknown, msg: string) => { assert.ok(v, msg); checks++ }
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); checks++ }

// Queue scheduling: deferred creation, deduplication, bounded round-robin, and clear().
{
  const q = new EntityPreparationQueue(), trace: string[] = [], finallySeen: string[] = []
  const job = (name: string, steps: number): Generator<void, void> => (function* () {
    try { for (let i = 0; i < steps; i++) { trace.push(`${name}${i}`); yield } }
    finally { finallySeen.push(name) }
  })()
  let created = 0
  const create = (name: string, steps: number) => () => { created++; return job(name, steps) }
  ok(!q.request('a', false, create('a', 20)), 'request defers work')
  ok(!q.request('a', false, create('duplicate', 1)) && created === 1, 'same key is deduplicated')
  ok(q.request('ready', true, create('ready', 1)) && created === 1, 'ready resource creates no job')
  q.advance(0); eq(trace.length, 1, 'advance performs at least one step')
  q.request('b', false, create('b', 2))
  const before = trace.length; q.advance(0); ok(trace.length - before <= 2, 'advance remains bounded')
  q.advance(0)
  ok(trace.some((x) => x.startsWith('b')), 'round-robin reaches later job')
  for (let i = 0; i < 30; i++) q.advance(0)
  ok(!trace.some((x) => x.startsWith('duplicate')), 'deduplicated creator never runs')
  const bounded = new EntityPreparationQueue(), boundedTrace: number[] = []
  bounded.request('long', false, () => (function* () { while (true) { boundedTrace.push(boundedTrace.length); yield } })())
  bounded.advance(100000)
  eq(boundedTrace.length, 16, 'advance enforces a maximum of 16 steps')
  const c = new EntityPreparationQueue(), cTrace: number[] = [], g = (function* () { try { cTrace.push(1); yield; cTrace.push(2); yield } finally { finallySeen.push('clear') } })()
  c.request('clear', false, () => g); c.advance(0); c.clear()
  ok(finallySeen.includes('clear'), 'clear calls generator finally')
  const clearedAt = cTrace.length; c.advance(); eq(cTrace.length, clearedAt, 'clear removes pending jobs')
}

// Clump preparation completes asynchronously, caches by variant, and can be cancelled/retried.
{
  const seed = 1000003
  ok(!clumpBlobReady(true, seed), 'fresh clump variant starts uncached')
  const first = prepareClumpBlob(true, seed)
  let n = 0, step = first.next()
  while (!step.done) { n++; step = first.next() }
  ok(n > 1 && clumpBlobReady(true, seed), 'clump preparation is multi-step and caches on completion')
  const blob = getBlob(true, seed % 3, new THREE.Vector3(0, 0.418, 0))
  eq(getBlob(true, seed % 3, new THREE.Vector3(9, 9, 9)), blob, 'cached clump returns same object')
  ok(Number.isFinite(blob.geo.attributes.position.getX(0)) && Number.isFinite(blob.env.r(blob.env.C)), 'clump cache has finite geometry and envelope')
  const retrySeed = 1000004
  const cancelled = prepareClumpBlob(false, retrySeed); cancelled.next(); cancelled.return()
  const retry = prepareClumpBlob(false, retrySeed); let rs = retry.next(); while (!rs.done) rs = retry.next()
  ok(clumpBlobReady(false, retrySeed), 'cancelled clump variant can be retried')
}

// Moth texture preparation is cancellable and reuses the shared texture cache.
{
  const cancelled = prepareMothTextures(); cancelled.next(); cancelled.return()
  const complete = prepareMothTextures(); let step = complete.next(), n = 0
  while (!step.done) { n++; step = complete.next() }
  ok(n > 1 && mothTexturesReady(), 'moth texture preparation completes in slices')
  const a = mothTextures(), b = mothTextures()
  eq(a, b, 'moth texture cache is reused')
}

console.log(`entity preparation checks: ${checks} passed`)
