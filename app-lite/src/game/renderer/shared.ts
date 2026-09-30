// 渲染器公共工具：常量/调色/几何与程序化纹理基础
import * as THREE from 'three'
import { prepareCachedTextureImage, publishTextureImage } from './textureImages'
import type { ExitInstance, GroundItem, Structure } from '../core/types'

export interface RenderOpts { grain: boolean; flicker: number; shake: boolean }
export type RenderResolutionMode = 'native' | '720p' | '480p_retro' | '320p_ps1'

interface VisualInteractionHitBase {
  x: number
  y: number
  z: number
  rayT: number
  yaw: number
  pitch: number
  playerX: number
  playerY: number
  playerZ: number
  at: number
}

export type VisualInteractionHit = VisualInteractionHitBase & (
  | { kind: 'structure'; structure: Structure }
  | { kind: 'item'; item: GroundItem }
  | { kind: 'exit'; exit: ExitInstance } // v58：出口模型（电梯门等）也进准星射线
)

// 视角共享状态（桌面 Pointer Lock / 移动端右半屏拖动写入）。visualHit 由真实 Three.js 相机射线逐帧写入，
// 引擎只把它当成候选命中，仍会重新验证距离、楼层与三维 LOS。
export const look: { yaw: number; pitch: number; locked: boolean; rayX: number; rayY: number; rayZ: number; visualHit: VisualInteractionHit | null } = {
  yaw: 0, pitch: 0, locked: false,
  // 相机中心射线的游戏世界分量（rayY 对应 Three.js Z，rayZ 是垂直轴）。
  rayX: 0, rayY: -1, rayZ: 0,
  visualHit: null,
}

// v23 新增：darkhall 极其狭窄的走廊 / ocean 高悬的混凝土天花板 / caves 洞穴净空 /
// suburb 郊区层高 / field 谷仓与田野 / city 大都会临街层高 / library 图书馆挑高
export const WALL_H: Record<string, number> = {
  rooms: 3.0, garage: 3.6, pipes: 2.7, grid: 4.2, office: 2.9, hotel: 3.3,
  darkhall: 2.5, ocean: 7.0, caves: 4.5, suburb: 3.2, field: 2.6, city: 6.0, library: 4.2,
}

// v7 室外：层级异色天空（L1 灰黄霾 / L2 昏灰 / L4 雾灰 / L5 夜蓝霓虹）
// v23：L7 无源昏暗自然光 / L9 午夜 / L10 阴沉铅灰 / L11 恒定白昼
export const SKY: Record<number, string> = {
  1: '#6e6748', 2: '#4a5157', 4: '#677075', 5: '#16264e', 6: '#03050a',
  7: '#4a5e64', 9: '#05070f', 10: '#8d9195', 11: '#9aa2ab', // v58：L7 雾色对齐迷雾天空盒地平霾色
}
// v7 室外地面配色（沥青/天台/庭院）
// v12 修复：全面提亮并与各层天空/水面拉开色相——旧版 hotel '#233048' 藏青与
// 夜空 #16264e、池水 #2a6fd8 几乎同色，黑夜中庭院地面融进天空被当成「脚下虚空」；
// garage '#2b2b2d' 在停车场黑暗度下近乎纯黑不可辨。现为暖灰铺装/沥青色调。
// v23：suburb 湿沥青 / field 土路与田地 / city 混凝土路面 / ocean 海面之下的岩床
export const OUTDOOR_FLOOR: Record<string, string> = {
  garage: '#45423a', pipes: '#4a5256', grid: '#42454b', office: '#5c666d', hotel: '#5b5348', rooms: '#504c3e',
  darkhall: '#17191c', suburb: '#1b1d22', field: '#6b5c34', city: '#4a4d52', ocean: '#2b3b44',
}

export function col(hex: string): THREE.Color { return new THREE.Color(hex) }

// ---------- 光影模式（classic=现状 Lambert；realistic=物理光照 Standard + 环境反射）----------
export type MaterialMode = 'classic' | 'realistic'
let materialMode: MaterialMode = 'classic'
let reflectK = 1 // 反射强度倍率（设置 0–100 → k=0–1.67，默认 60→1）
export function setMaterialMode(m: MaterialMode) { materialMode = m }
export function getMaterialMode(): MaterialMode { return materialMode }
export function setReflectK(k: number) { reflectK = k }
export function getReflectK(): number { return reflectK }

/**
 * 受光材质工厂：classic 一律 MeshLambertMaterial（与现状一致）；
 * realistic 换 MeshStandardMaterial 以获得 PBR 环境反射（envMapIntensity = envBase × 全局反射倍率）。
 * envBase 记录在 userData.envBase，供「反射强度」设置即时调整（renderer.setReflectivity 遍历应用）。
 */
export function litMaterial(params: THREE.MeshLambertMaterialParameters & { roughness?: number; roughnessMap?: THREE.Texture; metalness?: number; envBase?: number }): THREE.MeshLambertMaterial | THREE.MeshStandardMaterial {
  const { roughness, roughnessMap, metalness, envBase, ...rest } = params
  // 暗处保底自发光也必须经过颜色贴图。否则有 map 的材质在无直接光时只剩一层
  // 均匀 emissive 颜色，开灯后才突然出现纹理，视觉上会像整套材质被瞬间替换。
  // 这里仅自动补齐缺失的 emissiveMap；显式提供的专用发光图仍然优先。
  const shaded = { ...rest }
  if (shaded.map && shaded.emissive && !shaded.emissiveMap) shaded.emissiveMap = shaded.map
  if (materialMode !== 'realistic') return new THREE.MeshLambertMaterial(shaded)
  const mat = new THREE.MeshStandardMaterial({
    ...shaded,
    roughness: roughness ?? 0.85,
    ...(roughnessMap !== undefined ? { roughnessMap } : {}),
    metalness: metalness ?? 0,
  })
  const base = envBase ?? 0.18
  mat.envMapIntensity = base * reflectK
  mat.userData.envBase = base
  return mat
}

// 通用建筑玻璃。它不使用 emissive，也不以高 transmission 直接吞入整片天空亮度；
// 因此夜景中的窗户仍有可辨认的冷色反射与高光，但不会变成均匀发白的“光门”。
// 材质全局共享，街区内数百扇窗不会重复分配 shader/material。
// 无厚度平面只需一次双面绘制；有厚度的玻璃盒仍分正反面绘制，保持透明混合顺序。
let architecturalGlass: THREE.MeshPhysicalMaterial | null = null
let architecturalGlassPlanar: THREE.MeshPhysicalMaterial | null = null
let architecturalGlassPasses: [THREE.MeshPhysicalMaterial, THREE.MeshPhysicalMaterial] | null = null
export function architecturalGlassMaterial(planar = false): THREE.MeshPhysicalMaterial {
  const cached = planar ? architecturalGlassPlanar : architecturalGlass
  if (cached) return cached
  const envBase = 0.32
  const material = new THREE.MeshPhysicalMaterial({
    color: '#263942',
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.18,
    metalness: 0.015,
    transmission: 0,
    ior: 1.46,
    clearcoat: 0.72,
    clearcoatRoughness: 0.16,
    specularIntensity: 0.48,
    envMapIntensity: envBase * reflectK,
    forceSinglePass: planar,
  })
  material.userData.envBase = envBase
  material.userData.sharedArchitecturalGlass = 1
  if (planar) architecturalGlassPlanar = material
  else architecturalGlass = material
  return material
}

// A bounded shared pair for the two passes of solid glass. Separate, fixed sides
// avoid Three changing material.version and rebuilding program parameters on
// every visible pane, while retaining the same back-then-front blending.
export function architecturalGlassPassMaterials(): [THREE.MeshPhysicalMaterial, THREE.MeshPhysicalMaterial] {
  if (!architecturalGlassPasses) {
    const source = architecturalGlassMaterial()
    architecturalGlassPasses = [source.clone(), source.clone()]
    architecturalGlassPasses[0].side = THREE.BackSide
    architecturalGlassPasses[1].side = THREE.FrontSide
    for (const material of architecturalGlassPasses) material.forceSinglePass = true
  }
  for (const material of architecturalGlassPasses) material.envMapIntensity = Number(material.userData.envBase) * reflectK
  return architecturalGlassPasses
}

// 台阶/坡道楔形几何（封闭棱柱：顶面斜坡 + 四个侧面到底边，消除侧缝）
// v46：skip 可按边跳过侧面——同向连续楼梯坡道的相邻侧面在接缝处完全重叠（同面片闪色），由调用方跳过
export function rampGeo(dir: number, low: number, high: number, tx: number, tz: number, cTop: THREE.Color, base?: number, skip?: { px?: boolean; nx?: boolean; pz?: boolean; nz?: boolean }): THREE.BufferGeometry {
  const hAt = (fx: number, fz: number) => {
    const t = dir === 1 ? fx : dir === 2 ? 1 - fx : dir === 3 ? fz : 1 - fz
    return low + (high - low) * t
  }
  const b = base ?? Math.min(low, high) - 0.03
  const h00 = hAt(0, 0), h10 = hAt(1, 0), h11 = hAt(1, 1), h01 = hAt(0, 1)
  const cSide = cTop.clone().multiplyScalar(0.5)
  const pos: number[] = [], carr: number[] = [], uv: number[] = []
  const push = (x: number, y: number, z: number, c: THREE.Color, u: number, v: number) => {
    pos.push(x, y, z); carr.push(c.r, c.g, c.b); uv.push(u, v)
  }
  const quad = (a: number[], bq: number[], cq: number[], dq: number[], c: THREE.Color) => {
    push(a[0], a[1], a[2], c, 0, 0); push(bq[0], bq[1], bq[2], c, 1, 0); push(cq[0], cq[1], cq[2], c, 1, 1)
    push(a[0], a[1], a[2], c, 0, 0); push(cq[0], cq[1], cq[2], c, 1, 1); push(dq[0], dq[1], dq[2], c, 0, 1)
  }
  // 顶面斜坡（逆时针朝上）
  quad([tx, h00, tz], [tx, h01, tz + 1], [tx + 1, h11, tz + 1], [tx + 1, h10, tz], cTop)
  // 四个侧面
  if (!skip?.pz) quad([tx, b, tz + 1], [tx, h01, tz + 1], [tx + 1, h11, tz + 1], [tx + 1, b, tz + 1], cSide)
  if (!skip?.nz) quad([tx + 1, b, tz], [tx + 1, h10, tz], [tx, h00, tz], [tx, b, tz], cSide)
  if (!skip?.nx) quad([tx, b, tz], [tx, h00, tz], [tx, h01, tz + 1], [tx, b, tz + 1], cSide)
  if (!skip?.px) quad([tx + 1, b, tz + 1], [tx + 1, h11, tz + 1], [tx + 1, h10, tz], [tx + 1, b, tz], cSide)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(carr), 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2))
  geo.computeVertexNormals()
  return geo
}



// CC0 真实贴图（ambientCG，存 public/textures/），加载失败保留程序化兜底
const texCache = new Map<string, THREE.Texture>()
let surfaceAnisotropy = 4
export function setSurfaceAnisotropy(value: number) { surfaceAnisotropy = value }
/** Cached images must not be decoded/uploaded again for every new terrain slice. */
export function configureSurfaceTexture(texture: THREE.Texture, colorSpace: string): THREE.Texture {
  if (texture.colorSpace !== colorSpace || texture.anisotropy !== surfaceAnisotropy) {
    texture.colorSpace = colorSpace
    texture.anisotropy = surfaceAnisotropy
    texture.needsUpdate = true
  }
  return texture
}
// v16 修复：部署域（子路径/无尾斜杠/iframe 重写）下 BASE_URL='./' 相对页面 URL 解析会 404，
// 导致墙纸静默退化为纯色噪点兜底。构建产物的 JS 模块一定位于 <base>assets/ 下，
// 用 import.meta.url 向上推导 <base>textures/ 与页面路径完全解耦；dev 下回退 BASE_URL。
export function textureUrl(name: string): string {
  const file = name.includes('.') ? name : `${name}.jpg` // 允许显式带扩展名（如 manila_wallpaper.png）
  try {
    const mod = import.meta.url
    if (mod.includes('/assets/')) return new URL(`../textures/${file}`, mod).href
  } catch { /* dev/旧浏览器回退 */ }
  const base = ((import.meta.env?.BASE_URL as string | undefined) ?? '/').replace(/\/?$/, '/')
  return `${base}textures/${file}`
}
// 层级贴图别名：L5 三处据点沿用酒店材质；L8 两处洞穴前哨沿用岩层颜色/法线/粗糙度材质。
export const LEVEL_TEX_ALIAS: Partial<Record<number, number>> = { 110: 5, 111: 5, 112: 5, 113: 8, 114: 8 }
export const texLevelId = (id: number) => LEVEL_TEX_ALIAS[id] ?? id

export function levelTexture(name: string, fallback: () => THREE.Texture): THREE.Texture {  const cached = texCache.get(name)
  if (cached) { prepareCachedTextureImage(cached); return cached }
  const ph = fallback()
  // v15：L0 墙纸等贴图按 UV>1 平铺（墙盒 UV 按墙高放大），需要重复环绕；
  // 其余贴图 UV 均在 0..1 内，开启 Repeat 无影响
  ph.wrapS = THREE.RepeatWrapping
  ph.wrapT = THREE.RepeatWrapping
  texCache.set(name, ph)
  try {
    const url = textureUrl(name)
    new THREE.TextureLoader().load(
      url,
      async (t) => { await publishTextureImage(ph, t, url) },
      undefined,
      (err) => { console.warn(`[textures] ${url} 加载失败，保留程序化兜底`, err) },
    )
  } catch { /* 离线校验/桩环境无 TextureLoader：保留程序化兜底 */ }
  return ph
}

// 程序化噪点纹理
export function noiseTexture(base: string, alt: string, n = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const b = col(base), a = col(alt)
  const img = g.createImageData(n, n)
  for (let i = 0; i < n * n; i++) {
    const t = Math.random()
    const cc = Math.random() < 0.5 ? b : a
    const v = 0.85 + t * 0.3
    img.data[i * 4] = Math.min(255, cc.r * 255 * v)
    img.data[i * 4 + 1] = Math.min(255, cc.g * 255 * v)
    img.data[i * 4 + 2] = Math.min(255, cc.b * 255 * v)
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  return tex
}


// v26：马尼拉室墙纸——程序化同步生成（无异步加载，杜绝"纹理未换入"回归）。
// 近白底细竖条纹：顶点色 #e5c88f（马尼拉文件夹暖米色）与之叠乘后呈现带条纹的米色墙纸，
// 世界空间 UV（1m 一循环）下条纹宽约 3.9cm，与 L0 黄墙纸同密度、跨墙盒无缝。
let manilaWallTex: THREE.CanvasTexture | null = null
export function manilaWallTexture(): THREE.CanvasTexture {
  if (manilaWallTex) return manilaWallTex
  const n = 256
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  // 26 列竖条纹（一图覆盖 1m → 列宽 ≈3.9cm），明暗交替 + 轻微抖动
  const rng = mulberry(0x9e3779b9)
  for (let i = 0; i < 26; i++) {
    const x = Math.floor((i * n) / 26)
    const w = Math.ceil(n / 26)
    const base = i % 2 === 0 ? 246 : 232
    const jit = Math.floor(rng() * 8)
    g.fillStyle = `rgb(${base - jit},${base - 6 - jit},${base - 26 - jit})`
    g.fillRect(x, 0, w, n)
  }
  // 纸面斑驳（细密噪点，做旧但保持浅色调）
  const img = g.getImageData(0, 0, n, n)
  for (let i = 0; i < n * n; i++) {
    const v = (rng() - 0.5) * 14
    img.data[i * 4] = Math.max(0, Math.min(255, img.data[i * 4] + v))
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, img.data[i * 4 + 1] + v))
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, img.data[i * 4 + 2] + v))
  }
  g.putImageData(img, 0, 0)
  // 底部踢脚阴影线 + 偶发水渍痕（竖向渐变暗条），近景更有「旧墙纸」质感
  const grad = g.createLinearGradient(0, n - 26, 0, n)
  grad.addColorStop(0, 'rgba(90,70,40,0)')
  grad.addColorStop(1, 'rgba(90,70,40,0.22)')
  g.fillStyle = grad
  g.fillRect(0, n - 26, n, 26)
  for (let k = 0; k < 4; k++) {
    const sx = rng() * n, sw = 3 + rng() * 7, sh = 40 + rng() * 90
    const st = g.createLinearGradient(0, 0, 0, sh)
    st.addColorStop(0, 'rgba(120,95,55,0.10)')
    st.addColorStop(1, 'rgba(120,95,55,0)')
    g.fillStyle = st
    g.fillRect(sx, 0, sw, sh)
  }
  manilaWallTex = new THREE.CanvasTexture(c)
  manilaWallTex.colorSpace = THREE.SRGBColorSpace
  manilaWallTex.wrapS = THREE.RepeatWrapping
  manilaWallTex.wrapT = THREE.RepeatWrapping
  manilaWallTex.anisotropy = 4
  return manilaWallTex
}

// 确定性随机（装饰摆放随地图稳定）
export function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeCanvasCtx(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return [c, c.getContext('2d')!]
}

export function toTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 2
  return t
}

// 做旧：随机擦除 + 污渍斑驳
export function ageCanvas(g: CanvasRenderingContext2D, w: number, h: number, rng: () => number, amount = 90) {
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < amount; i++) {
    g.globalAlpha = 0.05 + rng() * 0.25
    const r = 1 + rng() * 6
    g.beginPath(); g.arc(rng() * w, rng() * h, r, 0, 7); g.fill()
  }
  // 边缘磨损
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.1 + rng() * 0.3
    const edge = Math.floor(rng() * 4)
    const x = edge === 0 ? rng() * w : edge === 1 ? rng() * w : edge === 2 ? 0 : w
    const y = edge === 0 ? 0 : edge === 1 ? h : rng() * h
    g.beginPath(); g.arc(x, y, 2 + rng() * 9, 0, 7); g.fill()
  }
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
}


// 盒子助手（带颜色）
export function box(w: number, h: number, d: number, color: string | number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }))
  m.position.set(x, y, z)
  return m
}
export function cyl(rt: number, rb: number, h: number, color: string | number, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), new THREE.MeshLambertMaterial({ color }))
  m.position.set(x, y, z)
  return m
}
export function glow(w: number, h: number, d: number, color: string | number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }))
  m.position.set(x, y, z)
  return m
}
