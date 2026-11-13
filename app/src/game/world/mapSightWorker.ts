import type { SightField, SightQuery } from './mapSightTrace'

type Job = { id: number; field: SightField; query: SightQuery; done: (cells: Uint32Array | null) => void }
let worker: Worker | null = null, failed = false, sequence = 0, active: Job | null = null, queued: Job | null = null
let currentField: SightField | null = null, fieldId = 0, timeout: ReturnType<typeof setTimeout> | undefined, idle: ReturnType<typeof setTimeout> | undefined
const stats = { submitted: 0, completed: 0, superseded: 0, failures: 0, workerMs: 0, dispatchMs: 0, active: 0 }

/** One in flight + the latest pending observation; no per-frame message backlog. */
function stop(failure = false) {
  clearTimeout(timeout); clearTimeout(idle)
  worker?.terminate(); worker = null; currentField = null
  if (failure) { failed = true; stats.failures++ }
  const jobs = [active, queued]
  active = null; queued = null; stats.active = 0
  for (const job of jobs) job?.done(null)
}
function pump() {
  if (active || !queued || !worker) return
  clearTimeout(idle)
  active = queued; queued = null; stats.active = 1
  const job = active, changed = currentField !== job.field, started = performance.now()
  if (changed) { currentField = job.field; fieldId++ }
  try {
    // Never transfer the game's tile arrays. The Worker receives an immutable copy.
    worker.postMessage({ id: job.id, fieldId, ...(changed ? { field: job.field } : {}), query: job.query })
    stats.dispatchMs += performance.now() - started; stats.submitted++
    timeout = setTimeout(() => stop(true), 6000)
  } catch { stop(true) }
}
export function sightWorkerAvailable() { return !failed && typeof Worker !== 'undefined' && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('workerJobs') === '0') }
export function requestSight(field: SightField, query: SightQuery, done: Job['done']): boolean {
  if (!sightWorkerAvailable()) return false
  if (!worker) try {
    worker = new Worker(new URL('./mapSight.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<{ id: number; cells?: Uint32Array; error?: string; ms?: number }>) => {
      if (!active || active.id !== data.id) return
      if (data.error || !data.cells) { stop(true); return }
      clearTimeout(timeout)
      const job = active; active = null; stats.active = 0; stats.completed++; stats.workerMs += data.ms ?? 0
      job.done(data.cells)
      pump()
      if (!active && !queued) idle = setTimeout(() => stop(), 15000)
    }
    worker.onerror = () => stop(true)
    worker.onmessageerror = () => stop(true)
  } catch { stop(true); return false }
  if (queued) { const old = queued; queued = null; stats.superseded++; old.done(null) }
  queued = { id: ++sequence, field, query, done }; pump()
  return !failed
}
export function disposeSightWorker() { stop() }
export function sightWorkerStats() { return { ...stats, queued: Number(!!queued), running: !!worker, failed } }
