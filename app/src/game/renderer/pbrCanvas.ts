// [l5items v2] 程序生成 PBR 贴图小工具：Canvas 2D 画颜色 / 高度 / 粗糙度 / 金属度，高度图经 Sobel 转切线空间法线图。
// 运行时只生成一次并缓存（同一 key 共享）；无头 check 下 document.createElement 由 @napi-rs/canvas 提供。
import * as THREE from 'three'
import { litMaterial } from './shared'

export type Ctx = CanvasRenderingContext2D
export function canvas(w: number, h = w): HTMLCanvasElement { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
export function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296) }

/** 高度图（灰度 canvas，亮 = 高）→ 法线图 canvas（OpenGL 约定，+Y 向上 = 绿） */
export function heightToNormal(src: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const w = src.width, h = src.height, sx = src.getContext('2d')!.getImageData(0, 0, w, h).data
  const out = canvas(w, h), ox = out.getContext('2d')!, img = ox.createImageData(w, h), d = img.data
  const H = (x: number, y: number) => sx[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4
    d[i] = ((-dx / l) * .5 + .5) * 255; d[i + 1] = ((dy / l) * .5 + .5) * 255; d[i + 2] = ((1 / l) * .5 + .5) * 255; d[i + 3] = 255
  }
  ox.putImageData(img, 0, 0)
  return out
}
export function tex(c: HTMLCanvasElement, srgb: boolean, name: string, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4; t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  t.name = name
  return t
}
export interface PbrDraw {
  size: number
  color: (x: Ctx, s: number) => void
  height?: (x: Ctx, s: number) => void
  rough?: (x: Ctx, s: number) => void // 灰度：白 = 粗糙
  metal?: (x: Ctx, s: number) => void // 灰度：白 = 金属
  normalStrength?: number
}
export interface PbrSet { map: THREE.CanvasTexture; normalMap?: THREE.CanvasTexture; roughnessMap?: THREE.CanvasTexture; metalnessMap?: THREE.CanvasTexture; size: number }
const cache = new Map<string, PbrSet>()
export function pbrSet(key: string, d: PbrDraw): PbrSet {
  const hit = cache.get(key); if (hit) return hit
  const mk = (fn: (x: Ctx, s: number) => void) => { const c = canvas(d.size); fn(c.getContext('2d')!, d.size); return c }
  const set: PbrSet = { map: tex(mk(d.color), true, key + '-color'), size: d.size }
  if (d.height) set.normalMap = tex(heightToNormal(mk(d.height), d.normalStrength ?? 2), false, key + '-normal')
  if (d.rough) set.roughnessMap = tex(mk(d.rough), false, key + '-rough')
  if (d.metal) set.metalnessMap = tex(mk(d.metal), false, key + '-metal')
  cache.set(key, set)
  return set
}
/** 用 PBR 套贴图建材质（写实模式 MeshStandardMaterial 吃全套；Lambert 模式只吃颜色 + 法线） */
export function pbrMaterial(set: PbrSet, roughness: number, metalness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const m = litMaterial({ color: '#ffffff', map: set.map, ...(set.normalMap ? { normalMap: set.normalMap } : {}), roughness, ...(set.roughnessMap ? { roughnessMap: set.roughnessMap } : {}), metalness, envBase: metalness > .3 ? .4 : .14, ...(extra as object) })
  if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial && set.metalnessMap) (m as THREE.MeshStandardMaterial).metalnessMap = set.metalnessMap
  return m
}
export function triCount(o: THREE.Object3D, visibleOnly = false): number {
  let n = 0
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh || (visibleOnly && !m.visible)) return
    n += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.getAttribute('position').count / 3
  })
  return Math.round(n)
}
