// Shared Canvas PBR assets. Expensive recipes/Sobel pixels run in a bounded Worker;
// synchronous drawing remains available to scripts and unsupported browsers.
import * as THREE from 'three'
import { litMaterial } from './shared'
import { normalPixels } from './normalPixels'
import { requestPbrPixels } from './pbrPixelQueue'
import { phonoTextureRecipe } from './phonoTextureRecipe'
import type { Ctx, PbrDraw, PhonoRecipe, PbrPlane, PbrPixels } from './pbrDraw'
export { rng } from './pbrDraw'
export type { Ctx, PbrDraw } from './pbrDraw'

export function canvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c
}
function put(c: HTMLCanvasElement, plane: PbrPlane) {
  const ctx = c.getContext('2d')!, image = ctx.createImageData(plane.width, plane.height)
  image.data.set(plane.pixels); ctx.putImageData(image, 0, 0)
}
export function heightToNormal(src: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const w = src.width, h = src.height, out = canvas(w, h)
  put(out, { width: w, height: h, pixels: normalPixels(src.getContext('2d')!.getImageData(0, 0, w, h).data, w, h, strength) })
  return out
}
export function tex(c: HTMLCanvasElement, srgb: boolean, name: string, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4; t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  t.name = name
  return t
}
/** Stable texture identity; readiness/quality changes never replace a material slot. */
export function normalTexture(src: HTMLCanvasElement, strength = 2, name = 'generated-normal'): THREE.CanvasTexture {
  const out = canvas(src.width, src.height), ctx = out.getContext('2d')!
  ctx.fillStyle = '#8080ff'; ctx.fillRect(0, 0, out.width, out.height)
  const texture = tex(out, false, name)
  texture.userData.generatedPending = true
  let finished = false
  const finish = (planes: PbrPixels | null) => {
    if (finished) return
    finished = true
    if (planes?.normalMap) put(out, planes.normalMap)
    else ctx.drawImage(heightToNormal(src, strength), 0, 0)
    texture.needsUpdate = true; texture.userData.generatedPending = false
  }
  const accepted = requestPbrPixels({ height: { width: src.width, height: src.height, pixels: src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data, strength } }, finish)
  if (!accepted) finish(null)
  return texture
}
export interface PbrSet { map: THREE.CanvasTexture; normalMap?: THREE.CanvasTexture; roughnessMap?: THREE.CanvasTexture; metalnessMap?: THREE.CanvasTexture; size: number }
const cache = new Map<string, PbrSet>()
export function pbrSet(key: string, d: PbrDraw): PbrSet {
  const hit = cache.get(key); if (hit) return hit
  const mk = (fn: (x: Ctx, s: number) => void) => { const c = canvas(d.size); fn(c.getContext('2d')!, d.size); return c }
  const set: PbrSet = { map: tex(mk(d.color), true, key + '-color'), size: d.size }
  if (d.height) set.normalMap = normalTexture(mk(d.height), d.normalStrength ?? 2, key + '-normal')
  if (d.rough) set.roughnessMap = tex(mk(d.rough), false, key + '-rough')
  if (d.metal) set.metalnessMap = tex(mk(d.metal), false, key + '-metal')
  cache.set(key, set)
  return set
}
/** Brush functions stay in a shared pure recipe module, never serialized/eval'd. */
export function phonoSet(key: string, recipe: PhonoRecipe): PbrSet {
  const hit = cache.get(key); if (hit) return hit
  // Non-browser checks preserve the synchronous original contract.
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined'
    || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('workerJobs') === '0')) return pbrSet(key, phonoTextureRecipe(recipe))
  const d = phonoTextureRecipe(recipe), set: PbrSet = { map: tex(canvas(d.size), true, key + '-color'), size: d.size }
  if (d.height) set.normalMap = tex(canvas(d.size), false, key + '-normal')
  if (d.rough) set.roughnessMap = tex(canvas(d.size), false, key + '-rough')
  if (d.metal) set.metalnessMap = tex(canvas(d.size), false, key + '-metal')
  const channels = ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const
  for (const k of channels) if (set[k]) set[k]!.userData.generatedPending = true
  cache.set(key, set)
  let finished = false
  const finish = (planes: PbrPixels | null) => {
    if (finished) return
    finished = true
    const paint = (fn: (ctx: Ctx, s: number) => void) => { const c = canvas(d.size); fn(c.getContext('2d')!, d.size); return c }
    for (const k of channels) {
      const t = set[k]; if (!t) continue
      const out = t.image as HTMLCanvasElement, plane = planes?.[k]
      if (plane) put(out, plane)
      else {
        const source = k === 'normalMap' ? heightToNormal(paint(d.height!), d.normalStrength ?? 2) : paint(k === 'map' ? d.color : k === 'roughnessMap' ? d.rough! : d.metal!)
        out.getContext('2d')!.drawImage(source, 0, 0)
      }
      t.needsUpdate = true; t.userData.generatedPending = false
    }
  }
  if (!requestPbrPixels({ recipe }, finish)) finish(null)
  return set
}
export function pbrMaterial(set: PbrSet, roughness: number, metalness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const m = litMaterial({ color: '#ffffff', map: set.map, ...(set.normalMap ? { normalMap: set.normalMap } : {}), roughness, ...(set.roughnessMap ? { roughnessMap: set.roughnessMap } : {}), metalness, envBase: metalness > .3 ? .4 : .14, ...(extra as object) })
  if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial && set.metalnessMap) (m as THREE.MeshStandardMaterial).metalnessMap = set.metalnessMap
  return m
}
export function triCount(o: THREE.Object3D, visibleOnly = false): number {
  let n = 0
  o.traverse(c => { const m = c as THREE.Mesh; if (!m.isMesh || (visibleOnly && !m.visible)) return; n += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.getAttribute('position').count / 3 })
  return Math.round(n)
}
