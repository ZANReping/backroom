// [casino] Level 5.1 光照烘焙（构建时 CPU 一次性预计算，按项目 foyerBake 的思路简化）：
//  · 地面 → 光照贴图（4 texel/m，RGBA8，lightMapIntensity = LM_MAX）：全部灯（实时点光按 0.35 计间接反弹，只烘焙灯全额）+ 聚光锥 + 碰撞盒接触 AO + 墙根 AO + 模糊；
//  · 静态合批网格 → 逐顶点颜色（辐照度 × 高度 AO），InstancedMesh → 每实例颜色（老虎机椅子吃屏幕彩光、高脚凳吃筒灯）。
// 光源：content/casinoLayout.lights（bake=1 的是筒灯点阵 / 屏幕辉光 / 牌桌聚光 / 跑马灯外溢 / 灯带，不占实时点光池）。
import * as THREE from 'three'
import { casinoLayout, CASINO_W, CASINO_D, OX, OY, type CasinoLight } from '../content/casinoLayout'

export const LM_TEXEL = 0.25, LM_MAX = 4, LM_GAIN = 0.55
interface BL { x: number; y: number; z: number; c: [number, number, number]; I: number; rc: number; spot: number }
let lightsCache: BL[] | null = null
let grid: Map<number, BL[]> | null = null
const CELL = 4
const hexc = (h: string): [number, number, number] => { const c = new THREE.Color(h); return [c.r, c.g, c.b] } // 线性
function lights(): BL[] {
  if (lightsCache) return lightsCache
  const L = casinoLayout()
  lightsCache = L.lights.map((l: CasinoLight) => ({ x: l.x, y: l.y, z: l.z, c: hexc(l.color), I: (l.I ?? 1) * (l.bake ? 1 : 0.35), rc: l.r * (l.spot ? 1.6 : 2.2), spot: l.spot ?? 0 }))
  grid = new Map()
  for (const b of lightsCache) {
    const r = Math.max(b.rc, b.spot ? (b.z) * Math.tan(b.spot + 0.25) + 1 : b.rc)
    for (let gy = Math.floor((b.y - r) / CELL); gy <= Math.floor((b.y + r) / CELL); gy++) for (let gx = Math.floor((b.x - r) / CELL); gx <= Math.floor((b.x + r) / CELL); gx++) { const k = gy * 1000 + gx; const a = grid.get(k) ?? []; a.push(b); grid.set(k, a) }
  }
  return lightsCache
}
/** 世界点（地图 x, 高 h, 地图 y）+ 法线（世界 x/y/z，y 向上）的烘焙辐照度（线性 RGB） */
export function casinoIrradiance(x: number, h: number, y: number, nx = 0, ny = 1, nz = 0, out: [number, number, number] = [0, 0, 0]) {
  lights(); out[0] = out[1] = out[2] = 0
  const a = grid!.get(Math.floor(y / CELL) * 1000 + Math.floor(x / CELL)); if (!a) return out
  for (const b of a) {
    const dx = b.x - x, dz = b.y - y, dy = b.z - h, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) + 1e-4
    let cos = (dx * nx + dy * ny + dz * nz) / d
    cos = cos * 0.8 + 0.2 // 半 lambert：模拟一次反弹，侧面不死黑
    if (cos <= 0) continue
    let k = b.I * cos * 3.9 / (d2 + 0.6)
    if (b.spot) { const down = dy / d; const ca = Math.cos(b.spot), cb = Math.cos(b.spot + 0.22); const s = down <= cb ? 0 : down >= ca ? 1 : (down - cb) / (ca - cb); k *= s * s * (3 - 2 * s) * 2.4 + 0.04 }
    else { const t = Math.min(1, d / b.rc); k *= (1 - t * t) * (1 - t * t) }
    out[0] += b.c[0] * k; out[1] += b.c[1] * k; out[2] += b.c[2] * k
  }
  return out
}
/** 2D 接触 AO：到最近碰撞盒的距离（盒内 = 0.42） */
function aoAt(x: number, y: number, boxes: { x0: number; y0: number; x1: number; y1: number; top: number }[]) {
  let ao = 1
  for (const b of boxes) {
    const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1), d = Math.hypot(dx, dy)
    if (d > 0.7) continue
    const strength = b.top >= 2 ? 0.55 : 0.4
    ao = Math.min(ao, d === 0 ? 1 - strength : 1 - strength * (1 - d / 0.7) ** 2)
  }
  const W0 = OX, W1 = OX + CASINO_W, D0 = OY, D1 = OY + CASINO_D, wd = Math.min(x - W0, W1 - x, y - D0, D1 - y)
  if (wd < 0.8) ao *= 0.7 + 0.3 * Math.max(0, wd) / 0.8
  return ao
}
export interface CasinoLightmap { tex: THREE.DataTexture; w: number; h: number; data: Float32Array; mean: number; zoneMean: Record<string, number>; ms: number }
let lmCache: CasinoLightmap | null = null
/** 亮度（Rec.709 线性） */
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b
export function bakeCasinoLightmap(): CasinoLightmap {
  if (lmCache) return lmCache
  const t0 = Date.now(), L = casinoLayout()
  const w = Math.round(CASINO_W / LM_TEXEL), h = Math.round(CASINO_D / LM_TEXEL)
  const raw = new Float32Array(w * h * 3), o: [number, number, number] = [0, 0, 0]
  const boxes = L.boxes.filter((b) => b.top > 0.3)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = OX + (i + 0.5) * LM_TEXEL, y = OY + (j + 0.5) * LM_TEXEL
    casinoIrradiance(x, 0.02, y, 0, 1, 0, o)
    const ao = aoAt(x, y, boxes), k = (j * w + i) * 3
    raw[k] = o[0] * ao; raw[k + 1] = o[1] * ao; raw[k + 2] = o[2] * ao
  }
  // 可分离盒模糊（半径 2 texel = 0.5 m）：柔化光斑边缘 + 近似漫反射扩散
  const blur = (src: Float32Array, horiz: boolean) => { const dst = new Float32Array(src.length), R = 2; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) for (let c = 0; c < 3; c++) { let s = 0, n = 0; for (let t = -R; t <= R; t++) { const ii = horiz ? i + t : i, jj = horiz ? j : j + t; if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue; s += src[(jj * w + ii) * 3 + c]; n++ } dst[(j * w + i) * 3 + c] = s / n } return dst }
  const data = blur(blur(raw, true), false)
  // 间接环境底：全场平均的 18%
  let mr = 0, mg = 0, mb = 0; for (let k = 0; k < w * h; k++) { mr += data[k * 3]; mg += data[k * 3 + 1]; mb += data[k * 3 + 2] }
  mr /= w * h; mg /= w * h; mb /= w * h
  for (let k = 0; k < w * h; k++) { data[k * 3] += mr * 0.18; data[k * 3 + 1] += mg * 0.18; data[k * 3 + 2] += mb * 0.18 }
  const px = new Uint8Array(w * h * 4); let sum = 0
  for (let k = 0; k < w * h; k++) { for (let c = 0; c < 3; c++) px[k * 4 + c] = Math.min(255, Math.round(Math.min(1, data[k * 3 + c] / LM_MAX) * 255)); px[k * 4 + 3] = 255; sum += lum(data[k * 3], data[k * 3 + 1], data[k * 3 + 2]) }
  // 线性存储：texel × LM_MAX = 辐照度；材质 lightMapIntensity = LM_MAX × π × LM_GAIN（three 的间接漫反射会除以 π）
  const tex = new THREE.DataTexture(px, w, h, THREE.RGBAFormat); tex.colorSpace = THREE.NoColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.channel = 1; tex.needsUpdate = true
  const zoneMean: Record<string, number> = {}
  for (const z of L.zones) { let s = 0, n = 0; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const x = OX + (i + 0.5) * LM_TEXEL, y = OY + (j + 0.5) * LM_TEXEL; if (x < z.x0 || x >= z.x1 || y < z.y0 || y >= z.y1) continue; const k = (j * w + i) * 3; s += lum(data[k], data[k + 1], data[k + 2]); n++ } zoneMean[z.name] = n ? s / n : 0 }
  lmCache = { tex, w, h, data, mean: sum / (w * h), zoneMean, ms: Date.now() - t0 }
  return lmCache
}
/** 合批网格逐顶点辐照度 → color 属性（× 高度 AO）。返回顶点数 */
export function bakeVertexColors(g: THREE.BufferGeometry, gain = 1) {
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute | undefined, n = pos.count
  const col = new Float32Array(n * 3), o: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const nx = nor ? nor.getX(i) : 0, ny = nor ? nor.getY(i) : 1, nz = nor ? nor.getZ(i) : 0
    casinoIrradiance(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, nx, ny, nz, o)
    const ao = 0.62 + 0.38 * Math.min(1, Math.max(0, y) / 1.1)
    for (let c = 0; c < 3; c++) col[i * 3 + c] = Math.min(2.4, ao * (0.42 + o[c] * 0.55 * gain))
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return n
}
/** InstancedMesh 每实例颜色（辐照度，可乘基色） */
export function bakeInstanceColors(im: THREE.InstancedMesh, base?: (i: number) => THREE.Color | null, yOff = 0.6) {
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), o: [number, number, number] = [0, 0, 0], c = new THREE.Color()
  for (let i = 0; i < im.count; i++) {
    im.getMatrixAt(i, m); p.setFromMatrixPosition(m)
    casinoIrradiance(p.x, p.y + yOff, p.z, 0, 1, 0, o)
    c.setRGB(Math.min(1.5, 0.42 + o[0] * 0.33), Math.min(1.5, 0.42 + o[1] * 0.33), Math.min(1.5, 0.42 + o[2] * 0.33))
    const b = base?.(i); if (b) c.multiply(b)
    im.setColorAt(i, c)
  }
  if (im.instanceColor) im.instanceColor.needsUpdate = true
}
