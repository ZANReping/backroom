import * as THREE from 'three'
import { CW, CH, SKY_PROFILES, renderSkyPixels } from './skyPixels'

const textures = new Map<number, THREE.CanvasTexture>()
type Pending = { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement; timer: ReturnType<typeof setTimeout> }
const pending = new Map<number, Pending>()
let worker: Worker | null = null
let workerFailed = false

function finish(id: number, pixels: Uint8ClampedArray<ArrayBuffer>) {
  const job = pending.get(id)
  if (!job) return
  clearTimeout(job.timer)
  // WebGL immutable storage cannot grow from the 2×2 placeholder to 2048×1024.
  // Release its allocation before resizing the same CanvasTexture source.
  job.texture.dispose()
  job.canvas.width = CW; job.canvas.height = CH
  job.canvas.getContext('2d')!.putImageData(new ImageData(pixels, CW, CH), 0, 0)
  job.texture.needsUpdate = true
  job.texture.userData.skyPending = false
  pending.delete(id)
  // Only a small set of layers use bitmap skies. Release the worker heap after
  // its queue drains; the finished canvas remains cached for revisits.
  if (!pending.size) { worker?.terminate(); worker = null }
}

function failWorker() {
  worker?.terminate(); worker = null; workerFailed = true
  for (const [id, job] of pending) {
    clearTimeout(job.timer)
    // Preserve the original deterministic appearance if Workers are unavailable.
    setTimeout(() => { if (pending.has(id)) finish(id, renderSkyPixels(SKY_PROFILES[id], id)) }, 0)
  }
}

/** Return a cheap placeholder immediately; scene readiness waits for its pixels. */
export function skyTexture(id: number): THREE.CanvasTexture {
  const hit = textures.get(id)
  if (hit) return hit
  const profile = SKY_PROFILES[id]
  if (!profile) throw new Error(`No bitmap sky profile for Level ${id}`)
  const canvas = document.createElement('canvas')
  canvas.width = 2; canvas.height = 2
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 0, 2)
  gradient.addColorStop(0, profile.zenith); gradient.addColorStop(1, profile.horizon)
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 2, 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.userData.skyPending = true
  textures.set(id, texture)
  pending.set(id, { texture, canvas, timer: setTimeout(failWorker, 15_000) })
  if (workerFailed || typeof Worker === 'undefined') { failWorker(); return texture }
  try {
    if (!worker) {
      worker = new Worker(new URL('./skyPixels.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }: MessageEvent<{ id: number; pixels?: ArrayBuffer; error?: string }>) => {
        if (data.error || !data.pixels) { failWorker(); return }
        finish(data.id, new Uint8ClampedArray(data.pixels))
      }
      worker.onerror = failWorker
      worker.onmessageerror = failWorker
    }
    worker.postMessage({ id })
  } catch { failWorker() }
  return texture
}
