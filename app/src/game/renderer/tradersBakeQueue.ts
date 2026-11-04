import type * as THREE from 'three'

interface Request { id: number; pending: boolean; colors?: Float32Array; failed?: boolean; positions: Float32Array; normals: Float32Array; cancel: () => void }
interface Slot { worker: Worker; job?: Request }
const slots: Slot[] = [], queued: Request[] = []
let serial = 0, failed = false, completed = 0, cancelled = 0
function fail() {
  failed = true
  for (const slot of slots) { slot.worker.terminate(); if (slot.job) { slot.job.failed = true; slot.job.pending = false } }
  slots.length = 0
  for (const job of queued) { job.failed = true; job.pending = false }
  queued.length = 0
}
function pump() {
  for (const slot of slots) if (!slot.job && queued.length) {
    const job = queued.shift()!; slot.job = job
    try { slot.worker.postMessage({ id: job.id, positions: job.positions, normals: job.normals }, [job.positions.buffer, job.normals.buffer]) }
    catch { fail(); return }
  }
}
/** Start only for an accepted entry to the authored Traders Keep. */
export function prepareTradersBakeWorkers() {
  if (failed || typeof Worker === 'undefined') return false
  if (slots.length) return true
  const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2
  const count = mobile || cores < 6 ? 1 : 2
  try {
    for (let i = 0; i < count; i++) {
      const slot: Slot = { worker: new Worker(new URL('../world/tradersBake.worker.ts', import.meta.url), { type: 'module' }) }
      slots.push(slot)
      slot.worker.onmessage = ({ data }: MessageEvent<{ id: number; colors?: Float32Array }>) => {
        const job = slot.job
        if (!job || data.id !== job.id) return
        slot.job = undefined
        if (job.pending) { job.colors = data.colors; job.failed = !data.colors; job.pending = false; completed++ }
        pump()
      }
      slot.worker.onerror = fail
    }
    return true
  } catch { fail(); return false }
}
function copy(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const array = new Float32Array(attribute.count * 3)
  for (let i = 0; i < attribute.count; i++) { array[i * 3] = attribute.getX(i); array[i * 3 + 1] = attribute.getY(i); array[i * 3 + 2] = attribute.getZ(i) }
  return array
}
/** Copies immutable inputs; transferring a request never detaches live geometry. */
export function requestTradersBake(positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, normals: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  if (positions.count < 256 || queued.length >= 16 || !prepareTradersBakeWorkers()) return null
  const job: Request = { id: ++serial, pending: true, positions: copy(positions), normals: copy(normals), cancel: () => {
    if (!job.pending) return
    cancelled++; job.pending = false
    const index = queued.indexOf(job); if (index >= 0) queued.splice(index, 1)
  } }
  queued.push(job); pump(); return job
}
/** Leaving the level cancels CPU work; a late result can never publish old geometry. */
export function cancelTradersBakeWork() {
  for (const slot of slots) { slot.job?.cancel(); slot.worker.terminate() }
  slots.length = 0
  for (const job of [...queued]) job.cancel()
  queued.length = 0
}
export function tradersBakeStats() { return { workers: slots.length, active: slots.filter(s => s.job).length, queued: queued.length, completed, cancelled, failed } }
