import type { BreakCubeCapture } from '@/game/core/breakCube'
import { createBreakScene, type BreakScene } from './breakScene'
import type { BreakAppearance } from './breakBody'

interface Prepared { canvas: HTMLCanvasElement; scene: BreakScene; ready: boolean; cancelled: boolean; settled: boolean }
let cached: Prepared | null = null

export function resetBreakPreparation() {
  const p = cached; cached = null
  if (!p) return
  p.cancelled = true
  // compileAsync still owns materials until its promise settles.
  if (p.settled) p.scene.dispose()
}

/** Called during the warning, while normal gameplay continues. Never constructs a renderer at cut-in. */
export function prepareBreakAnimation(cube: BreakCubeCapture, appearance?: BreakAppearance) {
  if (cached) return
  const canvas = document.createElement('canvas')
  const lite = window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth,window.innerHeight)<500
  const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  let scene: BreakScene
  try { scene = createBreakScene(canvas,cube,{ lite,reduced,appearance }) } catch { return }
  const p: Prepared = { canvas,scene,ready:false,cancelled:false,settled:false }; cached = p
  const t = performance.now()
  void scene.prepare(window.innerWidth,window.innerHeight,() => p.cancelled).then(() => {
    p.ready = true
    ;(globalThis as unknown as { __breakPrepareMs?: number }).__breakPrepareMs = performance.now()-t
  }).catch(() => { p.cancelled = true }).finally(() => {
    p.settled = true
    if (p.cancelled) { scene.dispose(); if (cached === p) cached = null }
  })
}

export function takePreparedBreak(cube: BreakCubeCapture | null): { canvas: HTMLCanvasElement; scene: BreakScene } | null {
  const p = cached
  if (!cube || !p?.ready || p.cancelled) { resetBreakPreparation(); return null }
  cached = null
  try { p.scene.setCapture(cube); return { canvas:p.canvas,scene:p.scene } }
  catch { p.scene.dispose(); return null }
}
