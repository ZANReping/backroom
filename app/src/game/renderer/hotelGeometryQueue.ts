import type { GeometryTree } from './geometryPacket'
type Kind = 'beast' | 'spokes' | 'chef'
type Job = { id: number; key: string; kind: Kind; lod: number; done: ((tree: GeometryTree | null) => void)[] }
const jobs = new Map<string, Job>()
let worker: Worker | null = null, active: Job | null = null, failed = false, serial = 0
let timeout: ReturnType<typeof setTimeout> | undefined, idle: ReturnType<typeof setTimeout> | undefined
const stats = { submitted: 0, completed: 0, failures: 0, workerMs: 0 }
function stop(failure = false) {
  clearTimeout(timeout); clearTimeout(idle); worker?.terminate(); worker = null
  if (failure) { failed = true; stats.failures++ }
  const pending = [...jobs.values()]
  jobs.clear(); active = null
  for (const job of pending) for (const done of job.done) done(null)
}
function pump() {
  if (active || !worker || !jobs.size) return
  clearTimeout(idle); active = jobs.values().next().value!
  try {
    worker.postMessage({ id: active.id, kind: active.kind, lod: active.lod }); stats.submitted++
    timeout = setTimeout(() => stop(true), 30000)
  } catch { stop(true) }
}
export function requestHotelGeometry(kind: Kind, lod: number, done: Job['done'][number]): boolean {
  if (failed || typeof Worker === 'undefined' || typeof document === 'undefined'
    || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('workerJobs') === '0')) return false
  if (!worker) try {
    worker = new Worker(new URL('./hotelGeometry.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<{ id: number; tree?: GeometryTree; ms?: number; error?: string }>) => {
      if (!active || active.id !== data.id) return
      if (data.error || !data.tree) { stop(true); return }
      clearTimeout(timeout); const job = active; active = null; jobs.delete(job.key); stats.completed++; stats.workerMs += data.ms ?? 0
      for (const done of job.done) done(data.tree)
      pump(); if (!active && !jobs.size) idle = setTimeout(() => stop(), 15000)
    }
    worker.onerror = () => stop(true); worker.onmessageerror = () => stop(true)
  } catch { stop(true); return false }
  const key = kind + ':' + lod, existing = jobs.get(key)
  if (existing) existing.done.push(done)
  else {
    if (jobs.size >= 8) return false
    jobs.set(key, { id: ++serial, key, kind, lod, done: [done] })
  }
  pump(); return !failed
}
export function hotelGeometryStats() { return { ...stats, queued: jobs.size - Number(!!active), active: Number(!!active), running: !!worker, failed } }
export function disposeHotelGeometryWorker() { stop() }
