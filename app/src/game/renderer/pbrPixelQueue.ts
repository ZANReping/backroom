import type { PhonoRecipe, PbrPixels } from './pbrDraw'
type Request = { recipe: PhonoRecipe } | { height: { width: number; height: number; pixels: Uint8ClampedArray<ArrayBuffer>; strength: number } }
type Job = { id: number; request: Request; done: (planes: PbrPixels | null) => void }
const jobs: Job[] = []
let worker: Worker | null = null, active: Job | null = null, failed = false, serial = 0
let timeout: ReturnType<typeof setTimeout> | undefined, idle: ReturnType<typeof setTimeout> | undefined
const stats = { submitted: 0, completed: 0, failures: 0, workerMs: 0 }
function stop(failure = false) {
  clearTimeout(timeout); clearTimeout(idle); worker?.terminate(); worker = null
  if (failure) { failed = true; stats.failures++ }
  const pending = [...(active ? [active] : []), ...jobs.splice(0)]
  active = null
  for (const job of pending) job.done(null)
}
function pump() {
  if (active || !worker || !jobs.length) return
  clearTimeout(idle); active = jobs.shift()!
  try {
    const buffers = 'height' in active.request ? [active.request.height.pixels.buffer] : []
    worker.postMessage({ id: active.id, ...active.request }, buffers); stats.submitted++
    timeout = setTimeout(() => stop(true), 10000)
  } catch { stop(true) }
}
/** Bounded, single CPU worker, never owns or detaches a live Three texture. */
export function requestPbrPixels(request: Request, done: Job['done']): boolean {
  if (failed || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || jobs.length >= 24
    || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('workerJobs') === '0')) return false
  if (!worker) try {
    worker = new Worker(new URL('./pbrPixels.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<{ id: number; planes?: PbrPixels; error?: string; ms?: number }>) => {
      if (!active || active.id !== data.id) return
      if (data.error || !data.planes) { stop(true); return }
      clearTimeout(timeout); const job = active; active = null; stats.completed++; stats.workerMs += data.ms ?? 0
      job.done(data.planes); pump()
      if (!active && !jobs.length) idle = setTimeout(() => stop(), 15000)
    }
    worker.onerror = () => stop(true); worker.onmessageerror = () => stop(true)
  } catch { stop(true); return false }
  jobs.push({ id: ++serial, request, done }); pump()
  return !failed
}
export function pbrPixelStats() { return { ...stats, queued: jobs.length, active: Number(!!active), running: !!worker, failed } }
export function disposePbrPixelWorker() { stop() }
