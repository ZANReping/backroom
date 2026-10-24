// 前厅（序章）PBR 材质：Poly Haven CC0 1K 贴图套组（颜色 sRGB / OpenGL 法线 / ORM：R=AO、G=粗糙度，线性），
// 来源与处理见 public/textures/foyer/FOYER-ASSET-SOURCES.md 与 scripts/prepare-foyer-textures.py。
// 前厅材质一律为 MeshStandardMaterial（与「经典/真实光影」开关无关）：前厅场景小、灯光全部烘焙，
// PBR 成本可控；其余层级仍走 shared.litMaterial，不受影响。
import * as THREE from 'three'
import { levelTexture, configureSurfaceTexture, getReflectK } from './shared'

/** 贴图套组：physical=1 张贴图对应的真实尺寸（米）。 */
export const FOYER_SETS = {
  wood_floor: { physical: 1.7 }, // laminate_floor_02
  stone_floor: { physical: 1.5 }, // marble_01（米色石材地砖）
  granite_tile: { physical: 0.9 }, // granite_tile_03（官方 1.8m；按设计缩至 0.45m 砖，卫生间防滑砖尺度）
  wall_tile: { physical: 1.27 }, // long_white_tiles
  terrazzo: { physical: 2.0 }, // terrazzo_tiles
  plaster: { physical: 3.2 }, // plastered_wall_04（灰度化后按漆色着色）
  wool: { physical: 0.27 }, // poly_wool_herringbone（灰度化）
  linen: { physical: 0.27 }, // rough_linen（灰度化）
  jersey: { physical: 0.26 }, // cotton_jersey（灰度化）
  velvet: { physical: 0.28 }, // velour_velvet（灰度化）
  oak: { physical: 1.83 }, // oak_veneer_01
  walnut: { physical: 1.8 }, // walnut_veneer
  maple: { physical: 1.0 }, // white_maple_veneer
} as const
export type FoyerSet = keyof typeof FOYER_SETS

function px(hex: string): THREE.DataTexture {
  const c = new THREE.Color(hex)
  const t = new THREE.DataTexture(new Uint8Array([c.r * 255, c.g * 255, c.b * 255, 255]), 1, 1)
  t.needsUpdate = true
  return t
}
const loaded = new Map<string, THREE.Texture>()
function base(set: FoyerSet, ch: 'col' | 'nrm' | 'orm'): THREE.Texture {
  const key = `foyer/${set}_${ch}.jpg`
  let t = loaded.get(key)
  if (!t) {
    t = levelTexture(key, () => px(ch === 'col' ? '#c8c8c8' : ch === 'nrm' ? '#8080ff' : '#ffb000'))
    configureSurfaceTexture(t, ch === 'col' ? THREE.SRGBColorSpace : THREE.NoColorSpace)
    t.generateMipmaps = true
    t.minFilter = THREE.LinearMipmapLinearFilter
    loaded.set(key, t)
  }
  return t
}
/** 换关卡时无需单独释放：贴图由 levelTexture 全局缓存持有，供下次进入复用。 */
export function disposeFoyerPbrVariants() { /* 保留接口 */ }

export interface FoyerMatOpts {
  set?: FoyerSet
  /** 贴图平铺尺度倍率：1 张贴图覆盖 physical×scale 米（几何 UV 按 userData.uvUnit 生成）。 */
  scale?: number
  color?: THREE.ColorRepresentation
  roughness?: number
  metalness?: number
  normalScale?: number
  /** ORM 中的粗糙度乘数（MeshStandardMaterial 中 roughness × roughnessMap.g）。 */
  env?: number
  ao?: boolean
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
  depthWrite?: boolean
}

// ---------------------------------------------------------------- 室内环境反射（夜间公寓）
let envTex: THREE.CanvasTexture | null = null
/** 夜间室内 equirect：暖色灯具亮斑、暗墙、窗外冷色城市光带。Three.js 首次使用时自动 PMREM。 */
export function foyerEnvMap(): THREE.Texture {
  if (envTex) return envTex
  const w = 512, h = 256
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 0, h)
  grd.addColorStop(0, '#5a4c3c'); grd.addColorStop(0.3, '#3f362d'); grd.addColorStop(0.5, '#2c2a28'); grd.addColorStop(0.62, '#2a231c'); grd.addColorStop(1, '#17120e')
  g.fillStyle = grd; g.fillRect(0, 0, w, h)
  // 窗：两处冷色城市夜景光带
  for (const [x0, ww] of [[40, 70], [300, 110]] as const) {
    const wg = g.createLinearGradient(0, 70, 0, 140)
    wg.addColorStop(0, '#22262e'); wg.addColorStop(0.6, '#323844'); wg.addColorStop(1, '#3e424a')
    g.fillStyle = wg; g.fillRect(x0, 70, ww, 70)
    for (let i = 0; i < 40; i++) { g.fillStyle = i % 3 ? '#ffd9a0' : '#cfe0ff'; g.fillRect(x0 + Math.random() * ww, 95 + Math.random() * 40, 2, 2) }
  }
  // 灯具：吊顶暖光斑
  for (const [x, y, r] of [[128, 28, 26], [380, 22, 22], [230, 60, 14], [470, 70, 12]] as const) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, '#fff3d8'); rg.addColorStop(0.35, '#e8b878'); rg.addColorStop(1, 'rgba(90,70,50,0)')
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  envTex = new THREE.CanvasTexture(c)
  envTex.mapping = THREE.EquirectangularReflectionMapping
  envTex.colorSpace = THREE.SRGBColorSpace
  envTex.userData.foyer = true
  return envTex
}
export function disposeFoyerEnv() { envTex?.dispose(); envTex = null }

/** 前厅 PBR 材质（烘焙光照的着色器注入由 foyerBake.installFoyerBake 完成）。 */
export function foyerStd(o: FoyerMatOpts): THREE.MeshStandardMaterial {
  const p: THREE.MeshStandardMaterialParameters = {
    color: o.color ?? '#ffffff',
    roughness: o.roughness ?? 0.85,
    metalness: o.metalness ?? 0,
  }
  if (o.transparent) { p.transparent = true; p.opacity = o.opacity ?? 1; p.depthWrite = o.depthWrite ?? false }
  if (o.side !== undefined) p.side = o.side
  if (o.emissive !== undefined) { p.emissive = new THREE.Color(o.emissive); p.emissiveIntensity = o.emissiveIntensity ?? 1 }
  const mat = new THREE.MeshStandardMaterial(p)
  if (o.set) {
    const u = FOYER_SETS[o.set].physical * (o.scale ?? 1)
    mat.map = base(o.set, 'col')
    mat.normalMap = base(o.set, 'nrm')
    const ns = o.normalScale ?? 1
    mat.normalScale.set(ns, ns)
    const orm = base(o.set, 'orm')
    mat.roughnessMap = orm
    // roughnessMap 的 G 通道 × roughness：调用方给的 roughness 视为倍率（1=按扫描）
    mat.roughness = o.roughness ?? 1
    if (o.ao !== false) { mat.aoMap = orm; mat.aoMapIntensity = 1 }
    mat.userData.uvUnit = u
  }
  mat.envMap = foyerEnvMap()
  const envBase = o.env ?? 0.35
  mat.envMapIntensity = envBase * getReflectK()
  mat.userData.envBase = envBase
  mat.userData.foyerPbr = true
  return mat
}
