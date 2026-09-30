import type { LevelDef } from '../core/types'
import { infiniteImplRevision, type GenChunk } from './infiniteRegistry'
import { canPrepareL11, prepareL11Window } from './l11ChunkCache'

// Only raw, deterministic chunks cross the worker boundary. Live items, NPCs,
// loot and save state remain owned by the main thread's instantiate() path.
type Job = { key: string; def: LevelDef; seed: number; cx: number; cy: number }
const ready = new Map<string, GenChunk>()
const queued = new Map<string, Job>()
let worker: Worker | undefined
let active: Job | undefined
let failed = false
let context = ''
const keyOf = (level: number, seed: number, cx: number, cy: number) => `${level}:${seed}:${cx}:${cy}`
const supported = (def: LevelDef) => !!def.infinite && def.id !== 11 && infiniteImplRevision(def.id) === 1

function pump() {
  if (!worker || active || !queued.size) return
  active = queued.values().next().value!
  queued.delete(active.key)
  worker.postMessage(active)
}

function ensureWorker() {
  if (failed || typeof Worker === 'undefined') return false
  if (worker) return true
  try {
    worker = new Worker(new URL('./chunks.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ key: string; raw?: GenChunk }>) => {
      const { key, raw } = event.data
      if (!raw) { failed = true; worker?.terminate(); worker = undefined; active = undefined; queued.clear(); return }
      if (raw && key.startsWith(context + ':')) {
        ready.set(key, raw)
        while (ready.size > 64) ready.delete(ready.keys().next().value!)
      }
      active = undefined
      pump()
    }
    worker.onerror = () => { failed = true; worker?.terminate(); worker = undefined; active = undefined; queued.clear() }
    return true
  } catch { failed = true; return false }
}

export function canPrepareChunks(def: LevelDef) { return def.id === 11 ? canPrepareL11() : supported(def) && ensureWorker() }

function setContext(def: LevelDef, seed: number) {
  const next = `${def.id}:${seed}`
  if (context === next) return
  context = next; ready.clear(); queued.clear()
}

function enqueue(def: LevelDef, seed: number, cx: number, cy: number) {
  const key = keyOf(def.id, seed, cx, cy)
  if (ready.has(key) || queued.has(key) || active?.key === key || queued.size >= 64) return
  queued.set(key, { key, def, seed, cx, cy })
}

/** The cache is consumed once: mutable tile arrays must never contaminate a revisit. */
export function takePreparedChunk(def: LevelDef, seed: number, cx: number, cy: number): GenChunk | undefined {
  if (!supported(def)) return undefined
  const key = keyOf(def.id, seed, cx, cy), raw = ready.get(key)
  ready.delete(key)
  queued.delete(key)
  return raw
}

let lastWindow = ''
export function prefetchChunks(def: LevelDef, seed: number, cx: number, cy: number, loaded: ReadonlyMap<string, unknown>) {
  if (!supported(def) || !ensureWorker()) return
  const windowKey = keyOf(def.id, seed, cx, cy)
  if (lastWindow === windowKey) return
  lastWindow = windowKey
  setContext(def, seed)
  // Drop obsolete queued work when moving quickly; preserve completed nearby chunks.
  queued.clear()
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    // The outgoing ring needs a fresh worker-owned raw copy for a return;
    // mutable live arrays must not be reused even while they remain loaded.
    if (Math.max(Math.abs(dx), Math.abs(dy)) === 3 || !loaded.has(`${cx + dx},${cy + dy}`)) enqueue(def, seed, cx + dx, cy + dy)
  }
  pump()
}

/** Initial map generation can await this behind the real loading UI. */
export async function prepareChunkWindow(def: LevelDef, seed: number, cx = 0, cy = 0, progress?: (n: number) => void) {
  if (def.id === 11) return prepareL11Window(def, seed, cx, cy, progress)
  if (!supported(def) || !ensureWorker()) return
  setContext(def, seed); lastWindow = ''
  const expected: string[] = []
  for (let radius = 0; radius <= 2; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
    expected.push(keyOf(def.id, seed, cx + dx, cy + dy))
    enqueue(def, seed, cx + dx, cy + dy)
  }
  pump()
  const until = performance.now() + 10000, taskContext = context
  while (!failed && context === taskContext && performance.now() < until) {
    const count = expected.reduce((n, key) => n + Number(ready.has(key)), 0)
    progress?.(count / expected.length)
    if (count === expected.length) return
    await new Promise<void>(resolve => setTimeout(resolve, 16))
  }
}
