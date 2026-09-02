// ================= Level 8「洞穴系统」无限有机洞穴 =================
// 世界坐标纯函数生成：规则节点只负责保证洞网全局连通，最终几何由连续洞底/洞顶高度场
// 与弯曲边壁构建，因此玩家看到的是天然洞穴，而不是房间和直角走廊。
import { RNG } from '../core/rng'
import { UNIVERSAL_ITEMS } from '../content/items'
import type { ExitInstance, GroundItem, LevelDef, LightSource, Structure } from '../core/types'
import { CS, GEN_ITEM_BASE, h32 } from './infinite'
import { registerInfiniteLevel, type CaveVolumeColumn, type GenChunk } from './infiniteRegistry'

export type L8Variant = 'phreatic' | 'vadose' | 'breakdown' | 'hyperspace' | 'rottnest' | 'movile' | 'handyland'

export const L8_VARIANT_NAMES: Record<L8Variant, string> = {
  phreatic: '潜水管', vadose: '渗流洞穴', breakdown: '断层室',
  hyperspace: '多维之路', rottnest: '罗特尼斯大丛林', movile: '新莫维勒窟',
  handyland: '巨臂林地',
}

export const L8_VARIANT_LORE: Record<string, string[]> = {
  phreatic: ['杏仁水曾经填满这些圆润的潜水管。低矮拱顶和潮痕会在没有征兆时再次被水淹没。'],
  vadose: ['狭长裂隙顺着岩层上下蜿蜒，滴水汇成浅溪；岩刺从地面、洞顶与侧壁同时长出。'],
  breakdown: ['巨大的断层室被错动岩壁横切，地面堆满折断的岩块，少数碎石脱离重力，安静悬在半空。'],
  hyperspace: ['二十三条狭窄通道彼此穿插。发光细菌和真菌依靠杏仁水沉积物生长，溪底偶尔能找到氙气玻璃珠。'],
  rottnest: ['两股相反的重力把尸鼠群留在洞顶；下方是苔藓、蕨类和多彩发光蘑菇组成的潮湿森林。'],
  movile: ['化能合成菌毯覆盖温热岩面。硫化物与甲烷气味浓烈，空气不适合久留。'],
  handyland: ['超大洞厅中遍布酷似手臂与人手的天然岩刺，血红色发光苔藓沿“指纹”爬行。这里应该避开。'],
}

// 开发者面板与图鉴展示完整自然地形，而不只列出稀有生态。
export const L8_RARE_VARIANTS: readonly string[] = ['phreatic', 'vadose', 'breakdown', 'hyperspace', 'rottnest', 'movile', 'handyland']

/** 固定地下湖：玩家永远出生在南岸石滩，第九大道从该处向东延伸。 */
export const L8_LAKE_CENTER = { x: 15, y: 21 }
export const L8_LAKE_WATER_RADIUS = 8.6
export const L8_LAKE_BANK_RADIUS = 13.2
export const L8_ORIGIN = { x: 15, y: 9 }
export const L8_AVENUE_SPACING = 50
export const L8_AVENUE_SEGMENTS = 8
const HANDY_ZONE_CHUNKS = 4

const h01 = (...n: number[]) => h32(...n) / 4294967296
const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function valueNoise(seed: number, salt: number, wx: number, wy: number, scale: number): number {
  const fx = wx / scale, fy = wy / scale
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const tx = smooth(fx - x0), ty = smooth(fy - y0)
  const v = (x: number, y: number) => h01(seed, salt, x, y) * 2 - 1
  return lerp(lerp(v(x0, y0), v(x0 + 1, y0), tx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), tx), ty)
}

export function l8VariantOf(seed: number, cx: number, cy: number): L8Variant {
  if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) return 'phreatic'
  // 巨臂林地使用独立 4×4 chunk 巨型生态区（约 128m 见方），明显大于其他 3×3 地质带。
  // 单独的宏区哈希也让边界保持整块连续，不会被相邻生态在每 32m 处切碎。
  const hx = Math.floor(cx / HANDY_ZONE_CHUNKS), hy = Math.floor(cy / HANDY_ZONE_CHUNKS)
  if (h01(seed, 0x810f, hx, hy) < 0.14) return 'handyland'
  // 3×3 chunk 地质带让生态在移动窗口中形成大片连续区域，而非每 32m 突变。
  const gx = Math.floor(cx / 3), gy = Math.floor(cy / 3)
  const r = h01(seed, 0x8101, gx, gy)
  // 新莫维勒窟仍是罕见生态；巨臂林地已由上方的大宏区负责，不再重复抽取小块。
  return r < 0.055 ? 'movile'
    : r < 0.22 ? 'rottnest' : r < 0.38 ? 'hyperspace' : r < 0.56 ? 'breakdown'
      : r < 0.8 ? 'vadose' : 'phreatic'
}

/** 在 chunk 中心之间平滑插值生态权重，供地形起伏与洞顶高度共用，避免边界硬断层。 */
function variantBandWeightAt(seed: number, wx: number, wy: number, wanted: L8Variant): number {
  const fx = wx / CS - 0.5, fy = wy / CS - 0.5
  const ix = Math.floor(fx), iy = Math.floor(fy)
  const tx = smooth(fx - ix), ty = smooth(fy - iy)
  const hit = (x: number, y: number) => l8VariantOf(seed, x, y) === wanted ? 1 : 0
  return lerp(lerp(hit(ix, iy), hit(ix + 1, iy), tx), lerp(hit(ix, iy + 1), hit(ix + 1, iy + 1), tx), ty)
}

const CELL = 24
function caveNode(seed: number, gx: number, gy: number): { x: number; y: number } {
  return {
    x: gx * CELL + CELL * 0.5 + (h01(seed, 0x8110, gx, gy) - 0.5) * 7,
    y: gy * CELL + CELL * 0.5 + (h01(seed, 0x8111, gx, gy) - 0.5) * 7,
  }
}

function curvedSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number, bend: number): number {
  const dx = bx - ax, dy = by - ay
  const d2 = dx * dx + dy * dy
  const t = d2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / d2)) : 0
  const len = Math.sqrt(d2) || 1
  // 正弦偏移在两端严格回到节点，邻接洞管无缝；中段可左右弯折而不再是直线连接。
  const offset = Math.sin(Math.PI * t) * bend
  const qx = ax + dx * t - dy / len * offset
  const qy = ay + dy * t + dx / len * offset
  return Math.hypot(px - qx, py - qy)
}

/** 第九大道的确定性路标点；首点是湖岸出生点，末点是通往 L9 的狭窄洞口出口。 */
export function l8AvenuePoint(seed: number, index: number): { x: number; y: number } {
  const i = Math.max(0, Math.min(L8_AVENUE_SEGMENTS, index))
  if (i === 0) return { ...L8_ORIGIN }
  const drift = Math.sin(i * 1.17) * 4.2 + (h01(seed, 0x81a0, i) - 0.5) * 5.2
  return { x: L8_ORIGIN.x + i * L8_AVENUE_SPACING, y: L8_ORIGIN.y + drift }
}

/**
 * 第九大道前段的两处唯一据点地标。位置由层级 seed 与第一段大道切线决定，因而每次生成
 * 都紧邻前几个路标、彼此相邻，同时只归属于一个确定的世界区块，不会随区块重载重复。
 */
export function l8OutpostLandmarkPoints(seed: number): { outpost: 'emptynest' | 'hammoz'; x: number; y: number }[] {
  const prev = l8AvenuePoint(seed, 0), center = l8AvenuePoint(seed, 1), next = l8AvenuePoint(seed, 2)
  const len = Math.hypot(next.x - prev.x, next.y - prev.y) || 1
  const side = h01(seed, 0x81ef, 1) < 0.5 ? -1 : 1
  const nx = -(next.y - prev.y) / len * side, ny = (next.x - prev.x) / len * side
  return [
    { outpost: 'emptynest', x: center.x + nx * 2.05, y: center.y + ny * 2.05 },
    { outpost: 'hammoz', x: center.x - nx * 2.05, y: center.y - ny * 2.05 },
  ]
}

/** 到第九大道中心线的最近距离；仅检查横坐标附近的段，供体积场高频采样。 */
export function l8AvenueDistanceAt(seed: number, wx: number, wy: number): number {
  const approx = Math.floor((wx - L8_ORIGIN.x) / L8_AVENUE_SPACING)
  let best = Infinity
  for (let i = Math.max(0, approx - 1); i <= Math.min(L8_AVENUE_SEGMENTS - 1, approx + 1); i++) {
    const a = l8AvenuePoint(seed, i), b = l8AvenuePoint(seed, i + 1)
    const bend = (h01(seed, 0x81a1, i) - 0.5) * 8
    best = Math.min(best, curvedSegDist(wx, wy, a.x, a.y, b.x, b.y, bend))
  }
  // 大道范围外仍需让首尾形成圆润端厅，而不是把 Infinity 送入后续计算。
  if (!Number.isFinite(best)) {
    const end = wx < L8_ORIGIN.x ? l8AvenuePoint(seed, 0) : l8AvenuePoint(seed, L8_AVENUE_SEGMENTS)
    best = Math.hypot(wx - end.x, wy - end.y)
  }
  return best
}

/** 玩家是否碰到第九大道末端的狭窄洞口平面；触发宽度与实际岩洞净空一致。 */
export function l8AvenuePortalContact(seed: number, wx: number, wy: number): boolean {
  const prev = l8AvenuePoint(seed, L8_AVENUE_SEGMENTS - 1)
  const end = l8AvenuePoint(seed, L8_AVENUE_SEGMENTS)
  const len = Math.hypot(end.x - prev.x, end.y - prev.y) || 1
  const dx = (end.x - prev.x) / len, dy = (end.y - prev.y) / len
  const forward = (wx - end.x) * dx + (wy - end.y) * dy
  const lateral = (wx - end.x) * -dy + (wy - end.y) * dx
  // 终点已经收束成狭窄岩洞，触发宽度必须与实际洞口一致；否则玩家可能隔着
  // 洞口两侧的岩壁碰到原先覆盖整条宽通道的隐形传送平面。
  return forward >= -0.42 && forward <= 0.8 && Math.abs(lateral) <= 1.34
}

export const l8LakeDistanceAt = (wx: number, wy: number) => Math.hypot(wx - L8_LAKE_CENTER.x, wy - L8_LAKE_CENTER.y)
export const l8LakeWaterAt = (wx: number, wy: number) => l8LakeDistanceAt(wx, wy) < L8_LAKE_WATER_RADIUS

/** 正数=洞内离边界的余量；负数=岩体。东西/南北节点边始终存在，保证整个无限洞网连通。 */
export function l8CaveMarginAt(seed: number, wx: number, wy: number): number {
  const gx0 = Math.floor(wx / CELL), gy0 = Math.floor(wy / CELL)
  let margin = -999
  for (let gy = gy0 - 1; gy <= gy0 + 1; gy++) for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
    const a = caveNode(seed, gx, gy)
    const east = caveNode(seed, gx + 1, gy), south = caveNode(seed, gx, gy + 1)
    const re = 2.15 + h01(seed, 0x8120, gx, gy) * 1.45
    const rs = 2.15 + h01(seed, 0x8121, gx, gy) * 1.45
    const bendE = (h01(seed, 0x8128, gx, gy) - 0.5) * 9.5
    const bendS = (h01(seed, 0x8129, gx, gy) - 0.5) * 9.5
    margin = Math.max(margin, re - curvedSegDist(wx, wy, a.x, a.y, east.x, east.y, bendE))
    margin = Math.max(margin, rs - curvedSegDist(wx, wy, a.x, a.y, south.x, south.y, bendS))
    const chamber = 3.8 + h01(seed, 0x8122, gx, gy) * 3.6
    margin = Math.max(margin, chamber - Math.hypot(wx - a.x, wy - a.y))
  }
  // 罗特尼斯与新莫维勒仍以 3×3 chunk 为主体洞厅，但不再把整个地质带掏成空盒：
  // 连续噪声留下少量岩柱和短岩墙，外围再平滑收回原生洞网。
  const zoneSpan = CS * 3
  const zgx0 = Math.floor(wx / zoneSpan), zgy0 = Math.floor(wy / zoneSpan)
  for (let zgy = zgy0 - 1; zgy <= zgy0 + 1; zgy++) for (let zgx = zgx0 - 1; zgx <= zgx0 + 1; zgx++) {
    const zoneVariant = l8VariantOf(seed, zgx * 3 + 1, zgy * 3 + 1)
    if (zoneVariant !== 'rottnest' && zoneVariant !== 'movile') continue
    const centerX = (zgx + 0.5) * zoneSpan, centerY = (zgy + 0.5) * zoneSpan
    const inset = zoneSpan * 0.37
    const dx = Math.max(0, Math.abs(wx - centerX) - inset)
    const dy = Math.max(0, Math.abs(wy - centerY) - inset)
    const edge = Math.hypot(dx, dy)
    const broad = valueNoise(seed, zoneVariant === 'movile' ? 0x812d : 0x812c, wx, wy, zoneVariant === 'movile' ? 23 : 19)
    const fine = valueNoise(seed, zoneVariant === 'movile' ? 0x812f : 0x812e, wx, wy, 8.5)
    const rockMask = smooth(Math.max(0, Math.min(1, (broad - 0.08) / 0.36)))
    const open = (zoneVariant === 'movile' ? 8.4 : 6.6) - edge * 1.18
      + broad * (zoneVariant === 'movile' ? 1.45 : 1.1) + fine * 0.48
      - rockMask * (zoneVariant === 'movile' ? 13 : 11.2)
    margin = Math.max(margin, open)
  }
  // 巨臂林地宏区略微开阔，但不会掏成空盒：长波洞厅之间保留低矮连接管、岩柱和短墙。
  const handSpan = CS * HANDY_ZONE_CHUNKS
  const hgx = Math.floor(wx / handSpan), hgy = Math.floor(wy / handSpan)
  // 开阔场在宏区边界前已经自然衰减到岩体，邻接八个宏区不会贡献可见洞腔；只计算当前宏区，
  // 避免体积网格每个采样点都重复九次哈希与边界距离计算。
  if (h01(seed, 0x810f, hgx, hgy) < 0.14) {
    const centerX = (hgx + 0.5) * handSpan, centerY = (hgy + 0.5) * handSpan
    const inset = handSpan * 0.355
    const dx = Math.max(0, Math.abs(wx - centerX) - inset)
    const dy = Math.max(0, Math.abs(wy - centerY) - inset)
    const edge = Math.hypot(dx, dy)
    const broad = valueNoise(seed, 0x812a, wx, wy, 31)
    const fine = valueNoise(seed, 0x812b, wx, wy, 9.5)
    const rockMask = smooth(Math.max(0, Math.min(1, (broad - 0.16) / 0.4)))
    const open = 7.25 - edge * 1.12 + broad * 1.15 + fine * 0.52 - rockMask * 10.4
    margin = Math.max(margin, open)
  }
  // 固定地下湖洞厅 + 第九大道：两者直接写进洞穴场，所以跨区块不会出现封门或断路。
  margin = Math.max(margin, 15.4 - Math.hypot((wx - L8_LAKE_CENTER.x) / 1.12, (wy - L8_LAKE_CENTER.y) / 0.94))
  const avenueEnd = l8AvenuePoint(seed, L8_AVENUE_SEGMENTS)
  const endDistance = Math.hypot(wx - avenueEnd.x, wy - avenueEnd.y)
  // 最后约 12m 从四米宽主洞逐渐收束到约 1.5m 半径的天然洞颈。
  // 终点附近先压回随机洞网/生态大厅的开阔体积，再重新雕出大道洞颈：即使终点
  // 落在罗特尼斯、新莫维勒或巨臂林地的大洞厅中，出口也只会嵌在狭窄岩洞里。
  const neckT = smooth(Math.max(0, Math.min(1, (12 - endDistance) / 12)))
  if (endDistance < 9) {
    const sealT = smooth(Math.max(0, Math.min(1, (9 - endDistance) / 3.2)))
    margin = lerp(margin, Math.min(margin, -0.46), sealT)
  }
  const avenueRadius = lerp(4.05, 1.52, neckT)
  margin = Math.max(margin, avenueRadius - l8AvenueDistanceAt(seed, wx, wy))
  // 湖岸出生点额外拓宽，给路标、转身和开发者安全传送留出无遮挡空间。
  margin = Math.max(margin, 5.8 - Math.hypot(wx - L8_ORIGIN.x, wy - L8_ORIGIN.y))
  return margin
}

export function l8FloorAt(seed: number, wx: number, wy: number): number {
  const rottnest = variantBandWeightAt(seed, wx, wy, 'rottnest')
  const movile = variantBandWeightAt(seed, wx, wy, 'movile')
  const handy = variantBandWeightAt(seed, wx, wy, 'handyland')
  const ecosystemRelief = valueNoise(seed, 0x8136, wx, wy, 27) * (rottnest * 0.42 + movile * 0.66)
    + valueNoise(seed, 0x8137, wx, wy, 9.5) * (rottnest * 0.16 + movile * 0.24)
    + valueNoise(seed, 0x813c, wx, wy, 34) * handy * 0.42
    + valueNoise(seed, 0x813d, wx, wy, 8.5) * handy * 0.19
  const base = valueNoise(seed, 0x8130, wx, wy, 46) * 0.52
    + valueNoise(seed, 0x8131, wx, wy, 13) * 0.16
    + valueNoise(seed, 0x8134, wx, wy, 5.5) * 0.075
    + ecosystemRelief
  const d = l8LakeDistanceAt(wx, wy)
  if (d >= L8_LAKE_WATER_RADIUS + 3.2) return base
  // 中央约 5m 深，临水处缓慢下切；水线本身略高于水面，阻止湖面越过岸缘铺到干地。
  const inside = Math.max(0, Math.min(1, (L8_LAKE_WATER_RADIUS - d) / L8_LAKE_WATER_RADIUS))
  const bowl = Math.pow(inside, 0.72) * 5.15
  const waterline = Math.exp(-Math.pow((d - L8_LAKE_WATER_RADIUS) / 0.72, 2))
  const bank = Math.exp(-Math.pow((d - (L8_LAKE_WATER_RADIUS + 1.55)) / 1.5, 2)) * 0.26
  const eroded = base - bowl + bank
  return lerp(eroded, Math.max(eroded, 0.16), waterline)
}

function l8CeilingFrom(seed: number, wx: number, wy: number, floor: number, rawMargin: number): number {
  const margin = Math.max(0, rawMargin)
  const hall = (valueNoise(seed, 0x8132, wx, wy, 58) + 1) * 0.5
  const lakeOpen = Math.max(0, Math.min(1, (L8_LAKE_BANK_RADIUS + 2 - l8LakeDistanceAt(wx, wy)) / (L8_LAKE_BANK_RADIUS + 2)))
  const avenueOpen = Math.max(0, Math.min(1, (4.5 - l8AvenueDistanceAt(seed, wx, wy)) / 1.5))
  let base = 2.45 + hall * 2.65 + valueNoise(seed, 0x8133, wx, wy, 19) * 0.72
  // 生态高度由与洞底相同的平滑权重控制，再叠加独立长短波洞顶起伏。
  const hyperOpen = variantBandWeightAt(seed, wx, wy, 'hyperspace')
  const rottnestOpen = variantBandWeightAt(seed, wx, wy, 'rottnest')
  const movileOpen = variantBandWeightAt(seed, wx, wy, 'movile')
  const handyOpen = variantBandWeightAt(seed, wx, wy, 'handyland')
  const handyHall = smooth(Math.max(0, Math.min(1, (valueNoise(seed, 0x813e, wx, wy, 52) + 0.12) / 0.62)))
  base = Math.max(base, 4.5 * avenueOpen)
  base += lakeOpen * 5.25
  base += hyperOpen * 3.35
  base += rottnestOpen * (1.75 + valueNoise(seed, 0x8138, wx, wy, 24) * 0.95 + valueNoise(seed, 0x813a, wx, wy, 8) * 0.34)
  base += movileOpen * (2.75 + valueNoise(seed, 0x8139, wx, wy, 31) * 1.3 + valueNoise(seed, 0x813b, wx, wy, 9) * 0.46)
  // 同一巨臂林地里既有约 2.2–4m 的压迫低洞，也有接近 12m 的高大洞厅。
  base += handyOpen * (-0.35 + handyHall * 6.4 + valueNoise(seed, 0x813f, wx, wy, 11) * 0.72)
  const swell = Math.min(4.4, margin * (0.16 + hall * 0.36))
  const ripple = valueNoise(seed, 0x8135, wx, wy, 7.5) * 0.28
  let clearance = base + swell + ripple
  // 水平洞颈收窄时同步压低洞顶，防止出口仍出现在高大洞厅的正中央。
  // 最深处保留约 3.05m 净高，玩家可以自然穿过，但视觉上明确是狭窄洞口。
  const avenueEnd = l8AvenuePoint(seed, L8_AVENUE_SEGMENTS)
  const endDistance = Math.hypot(wx - avenueEnd.x, wy - avenueEnd.y)
  const neckT = smooth(Math.max(0, Math.min(1, (10 - endDistance) / 10)))
  clearance = lerp(clearance, Math.min(clearance, 3.05), neckT)
  return floor + Math.max(2.15, Math.min(12.6, clearance))
}

export function l8CeilingAt(seed: number, wx: number, wy: number): number {
  const floor = l8FloorAt(seed, wx, wy)
  return l8CeilingFrom(seed, wx, wy, floor, l8CaveMarginAt(seed, wx, wy))
}

/** 场值正数=洞内空气、负数=岩体。平滑交集把洞底/侧壁/洞顶熔成同一张连续曲面。 */
const smoothMin = (a: number, b: number, k: number): number => {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k))
  return lerp(b, a, h) - k * h * (1 - h)
}

export function l8VolumeColumn(seed: number, wx: number, wz: number): CaveVolumeColumn {
  const floor = l8FloorAt(seed, wx, wz)
  const margin = l8CaveMarginAt(seed, wx, wz)
  return {
    floor,
    ceiling: l8CeilingFrom(seed, wx, wz, floor, margin),
    margin,
    rounding: 1.55 + (Math.sin(wx * 0.071 + wz * 0.053 + seed * 0.000013) + 1) * 0.34,
  }
}

/**
 * L8 三维隐式岩体。二维洞网只提供全局连通骨架；随高度变化的三维噪声实际雕刻岩壁，
 * floor/wall/ceiling 的相交处用 smoothMin 连成圆润洞肩，不再存在三种网格之间的接缝。
 */
export function l8VolumeField(seed: number, wx: number, worldY: number, wz: number, cached?: CaveVolumeColumn): number {
  const c = cached ?? l8VolumeColumn(seed, wx, wz)
  const span = Math.max(0.1, c.ceiling - c.floor)
  const rel = Math.max(0, Math.min(1, (worldY - c.floor) / span))
  const envelope = Math.sin(Math.PI * rel)
  // 靠近洞底/洞顶时水平净空逐渐收窄，形成椭圆/圆形横截面，消除“平地+直墙+平顶”的方盒轮廓。
  const verticalEdge = Math.abs(rel * 2 - 1)
  const roundedMargin = c.margin - (c.rounding ?? 1.7) * Math.pow(verticalEdge, 2.15)
  let field = smoothMin(roundedMargin, worldY - c.floor, 0.46)
  field = smoothMin(field, c.ceiling - worldY, 0.48)
  // 噪声在洞底/洞顶零交界自动衰减，既雕出非挤压式的三维侧壁，也保留稳定可解的脚底与顶高。
  // 两组非轴对齐三维波场避免“二维轮廓向上挤压”的观感；只用连续解析函数，流式网格化无需
  // 为每个体素重复执行昂贵的 8 角哈希插值。
  const phase = (seed >>> 0) * 0.00000137
  const rock = Math.sin(wx * 0.57 + worldY * 0.83 + wz * 0.41 + phase) * 0.12
    + Math.sin(wx * 1.19 - worldY * 0.71 + wz * 0.97 + phase * 1.73) * 0.042
  return field + rock * envelope * envelope
}

function solveSurface(seed: number, wx: number, wz: number, lower: boolean): number {
  const c = l8VolumeColumn(seed, wx, wz)
  let lo = lower ? c.floor - 0.9 : c.ceiling - 1.35
  let hi = lower ? c.floor + 1.15 : c.ceiling + 0.9
  // 在极窄边缘没有完整空气柱；这里退回包络面，实际水平体积碰撞会禁止玩家抵达该点。
  if (lower && l8VolumeField(seed, wx, hi, wz, c) <= 0) return c.floor
  if (!lower && l8VolumeField(seed, wx, lo, wz, c) <= 0) return c.ceiling
  for (let n = 0; n < 14; n++) {
    const mid = (lo + hi) * 0.5
    const inside = l8VolumeField(seed, wx, mid, wz, c) > 0
    if (lower ? inside : !inside) hi = mid
    else lo = mid
  }
  return (lo + hi) * 0.5
}

export const l8GroundAt = (seed: number, wx: number, wz: number) => solveSurface(seed, wx, wz, true)
export const l8RoofAt = (seed: number, wx: number, wz: number) => solveSurface(seed, wx, wz, false)

function openInChunk(seed: number, cx: number, cy: number, salt: number, maxHeight = Infinity): { x: number; y: number } | null {
  const WX = cx * CS, WY = cy * CS
  const sx = 4 + (h32(seed, salt, cx, cy) % 24), sy = 4 + (h32(seed, salt + 1, cx, cy) % 24)
  let fallback: { x: number; y: number; height: number } | null = null
  for (let r = 0; r < 25; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
    const x = sx + dx, y = sy + dy
    if (x < 2 || y < 2 || x >= CS - 2 || y >= CS - 2) continue
    const wx = WX + x + 0.5, wy = WY + y + 0.5
    if (l8CaveMarginAt(seed, wx, wy) <= 1.25) continue
    const height = l8RoofAt(seed, wx, wy) - l8GroundAt(seed, wx, wy)
    if (!fallback || height < fallback.height) fallback = { x, y, height }
    if (height <= maxHeight) return { x, y }
  }
  // 高洞厅中也不会因找不到低顶而吞掉出口；渲染时仍会精确贴顶。
  return fallback ? { x: fallback.x, y: fallback.y } : null
}

export function l8RegionExitAnchor(seed: number, _rx: number, _ry: number): { x: number; y: number } {
  const end = l8AvenuePoint(seed, L8_AVENUE_SEGMENTS)
  return { x: end.x - 0.5, y: end.y - 0.5 }
}

export function genL8ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string): GenChunk {
  const variant = (forceVariant as L8Variant | undefined) ?? l8VariantOf(seed, cx, cy)
  const rng = new RNG(h32(seed, 0x8100, cx, cy))
  const N = CS * CS, WX = cx * CS, WY = cy * CS
  const tiles = new Uint8Array(N), wet = new Uint8Array(N), elev = new Uint8Array(N)
  const step = new Uint8Array(N), tint = new Uint8Array(N), crawl = new Uint8Array(N)
  const liquid = new Uint8Array(N), terrain = new Float32Array(N), caveCeil = new Float32Array(N)
  const seaFloor = new Float32Array(N).fill(1.7)
  const structures: Structure[] = [], items: GroundItem[] = [], lights: LightSource[] = [], exits: ExitInstance[] = []
  const entities: GenChunk['entities'] = []
  const zoneX = Math.floor(cx / 3), zoneY = Math.floor(cy / 3)
  const zoneLocal = ((cx % 3) + 3) % 3 + (((cy % 3) + 3) % 3) * 3
  const li = (x: number, y: number) => y * CS + x
  const tintOf: Record<L8Variant, number> = { phreatic: 34, vadose: 35, breakdown: 36, hyperspace: 37, rottnest: 38, movile: 39, handyland: 40 }
  for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
    const wx = WX + x + 0.5, wy = WY + y + 0.5, i = li(x, y)
    const margin = l8CaveMarginAt(seed, wx, wy)
    // 原始数组只承担缩略图/生态落点的低成本代表值；运行时高度与网格读取 caveVolume 的精确零等值面。
    terrain[i] = l8FloorAt(seed, wx, wy)
    caveCeil[i] = l8CeilingAt(seed, wx, wy)
    tint[i] = tintOf[variant]
    if (margin <= 0) { tiles[i] = 2; continue }
    tiles[i] = 1; elev[i] = 3
    if (l8LakeWaterAt(wx, wy)) {
      wet[i] = 1
      liquid[i] = 1
      seaFloor[i] = Math.max(1.1, -terrain[i] + 0.03)
    }
    const streamLimit = variant === 'hyperspace' ? 0.235 : variant === 'vadose' ? 0.12 : 0.055
    const stream = liquid[i] === 0 && Math.abs(valueNoise(seed, 0x8140, wx, wy, 21)) < streamLimit
    if (stream && variant !== 'handyland') { wet[i] = 1; liquid[i] = 2 }
    if (variant === 'movile' && valueNoise(seed, 0x8141, wx, wy, 12) > -0.25) wet[i] = 1
  }

  let sidN = 0, itemN = 0
  const sid = () => h32(seed, 0x8150, cx, cy, sidN++)
  const solidAt = (wx: number, wy: number) => structures.some((s) => s.solid && wx >= s.x && wx < s.x + s.w && wy >= s.y && wy < s.y + s.h)
  const findSpot = (nearWall = false, minClear = 0.65, dryOnly = false): { x: number; y: number } | null => {
    for (let t = 0; t < 80; t++) {
      const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3), i = li(x, y)
      if (tiles[i] !== 1 || liquid[i] === 1 || (dryOnly && liquid[i] !== 0) || solidAt(WX + x + 0.5, WY + y + 0.5)) continue
      const margin = l8CaveMarginAt(seed, WX + x + 0.5, WY + y + 0.5)
      if (margin < minClear || (nearWall && margin > 1.7)) continue
      if (Math.hypot(WX + x + 0.5 - L8_ORIGIN.x, WY + y + 0.5 - L8_ORIGIN.y) < 6.5) continue
      if (l8AvenueDistanceAt(seed, WX + x + 0.5, WY + y + 0.5) < 2.65) continue
      return { x, y }
    }
    return null
  }
  const pushStruct = (kind: Structure['kind'], x: number, y: number, w = 1, h = 1, solid = false, data?: Structure['data']) => {
    structures.push({ kind, x, y, w, h, solid, data: { ...data, sid: sid() } })
  }
  const placeStruct = (kind: Structure['kind'], count: number, opts?: { nearWall?: boolean; solid?: boolean; w?: number; h?: number; data?: () => Structure['data'] }) => {
    for (let n = 0; n < count; n++) {
      const p = findSpot(opts?.nearWall, opts?.solid ? 1.1 : 0.55)
      if (p) pushStruct(kind, WX + p.x, WY + p.y, opts?.w ?? 1, opts?.h ?? 1, opts?.solid ?? false, opts?.data?.())
    }
  }
  const pushLight = (x: number, y: number, r: number, color: string, z?: number, intensityMul?: number) => lights.push({
    x: x + 0.5, y: y + 0.5, r, color, flickerSeed: rng.next() * 100, gen: 1, noFix: 1,
    ...(z === undefined ? {} : { fixZ: z }), ...(intensityMul === undefined ? {} : { intensityMul }),
    ...(intensityMul !== undefined && intensityMul < 0.5 ? { natural: 1 as const } : {}),
  })
  type RawEntity = GenChunk['entities'][number]
  const placeEntity = (type: string, count: number, opts?: { dryOnly?: boolean; data?: () => Partial<RawEntity> }) => {
    for (let n = 0; n < count; n++) {
      const p = findSpot(false, 1.2, opts?.dryOnly)
      if (p) entities.push({ type, x: WX + p.x + 0.5, y: WY + p.y + 0.5, ...opts?.data?.() })
    }
  }

  // 固定地下湖石岸：分层侵蚀岩棚沿真实地形落位；出生点与第九大道起点附近留出安全缺口。
  for (let n = 0; n < 34; n++) {
    const rr = h01(seed, 0x81b0, n), a = n / 34 * Math.PI * 2 + (rr - 0.5) * 0.14
    const r = L8_LAKE_WATER_RADIUS + 0.7 + h01(seed, 0x81b1, n) * 2.7
    const x = L8_LAKE_CENTER.x + Math.cos(a) * r, y = L8_LAKE_CENTER.y + Math.sin(a) * r
    if (Math.floor(x / CS) !== cx || Math.floor(y / CS) !== cy) continue
    if (Math.hypot(x - L8_ORIGIN.x, y - L8_ORIGIN.y) < 4.2 || l8AvenueDistanceAt(seed, x, y) < 2.8) continue
    pushStruct('cavebank', x - 1.05, y - 0.62, 2.1, 1.24, false, {
      rot: a + Math.PI / 2, scale: 0.8 + h01(seed, 0x81b2, n) * 0.55, tex: 'phreatic', erosion: n % 4,
    })
  }

  // 湖厅上方密集钟乳石。用全局编号筛选所属 chunk，保证区块重访/平移后数量和位置不变。
  for (let n = 0; n < 52; n++) {
    const a = h01(seed, 0x81c0, n) * Math.PI * 2
    const r = Math.sqrt(h01(seed, 0x81c1, n)) * (L8_LAKE_WATER_RADIUS + 3.4)
    const x = L8_LAKE_CENTER.x + Math.cos(a) * r, y = L8_LAKE_CENTER.y + Math.sin(a) * r
    if (Math.floor(x / CS) !== cx || Math.floor(y / CS) !== cy) continue
    if (Math.hypot(x - L8_ORIGIN.x, y - L8_ORIGIN.y) < 3.3) continue
    pushStruct('stalagspike', x - 0.5, y - 0.5, 1, 1, true, {
      ceiling: 1, knot: n % 4, scale: 1.05 + h01(seed, 0x81c2, n) * 1.15,
      rot: h01(seed, 0x81c3, n) * Math.PI * 2, tex: 'phreatic', lake: 1,
    })
  }

  // 不同生态带拥有独立的钟乳石/石笋/突岩密度；一处 structure 是一簇 3–5 根，密度仍受净空筛选避免堵路。
  const geology: Record<L8Variant, { floor: [number, number]; ceiling: [number, number]; rocks: [number, number] }> = {
    phreatic: { floor: [3, 6], ceiling: [3, 6], rocks: [1, 3] },
    vadose: { floor: [5, 8], ceiling: [7, 11], rocks: [2, 4] },
    breakdown: { floor: [2, 5], ceiling: [2, 5], rocks: [6, 10] },
    hyperspace: { floor: [3, 6], ceiling: [5, 8], rocks: [1, 3] },
    rottnest: { floor: [4, 7], ceiling: [7, 11], rocks: [2, 5] },
    movile: { floor: [3, 6], ceiling: [4, 7], rocks: [2, 4] },
    handyland: { floor: [2, 4], ceiling: [3, 6], rocks: [4, 7] },
  }
  const geo = geology[variant]
  placeStruct('stalagspike', rng.int(geo.floor[0], geo.floor[1]), { nearWall: true, solid: true, data: () => ({ knot: rng.int(0, 3), scale: rng.range(0.8, 1.35), rot: rng.range(0, Math.PI * 2), tex: variant }) })
  placeStruct('stalagspike', rng.int(geo.ceiling[0], geo.ceiling[1]), { solid: true, data: () => ({ knot: rng.int(0, 3), ceiling: 1, scale: rng.range(0.75, 1.4), rot: rng.range(0, Math.PI * 2), tex: variant }) })
  placeStruct('caveboulder', rng.int(geo.rocks[0], geo.rocks[1]), { solid: true, data: () => ({ scale: rng.range(0.55, 1.45), squash: rng.range(0.55, 1.25), rot: rng.range(0, Math.PI * 2), tex: variant }) })
  if (rng.chance(0.2)) placeStruct('bonepile', 1, { data: () => ({ loot: 1 }) })
  if (rng.chance(0.08)) placeStruct('corpse', 1, { data: () => ({ loot: 1 }) })

  if (variant === 'breakdown') {
    placeStruct('cavefloat', rng.int(4, 8), { data: () => ({ z: rng.range(1.1, 3.8), scale: rng.range(0.5, 1.5), rot: rng.range(0, 6.28) }) })
  } else if (variant === 'hyperspace') {
    // 数量提升后仍只使用一个 GPU 粒子场；细菌场只从本区块的浅溪瓦片采样。
    pushStruct('caveglowpoints', WX, WY, CS, CS, false, {
      count: rng.int(780, 1020), spread: CS * 0.49, hue: rng.int(0, 3), tex: 'hyperspace',
    })
    pushStruct('cavebacteria', WX, WY, CS, CS, false, { count: rng.int(190, 280), hue: rng.int(0, 2) })
    for (let n = 0; n < 2; n++) {
      const p = findSpot(false, 1.5)
      if (p) {
        const lx = WX + p.x + 0.5, ly = WY + p.y + 0.5
        pushLight(WX + p.x, WY + p.y, 3.2, n ? '#55d9ff' : '#69e8d6', l8RoofAt(seed, lx, ly) - 0.08, 0.065)
      }
    }
    placeEntity('lightguide', rng.int(2, 4))
  } else if (variant === 'rottnest') {
    // 苔藓/蕨类按区块合批成实例网格，替代上千个独立小网格。
    pushStruct('cavemoss', WX, WY, CS, CS, false, { count: rng.int(90, 135), hue: rng.int(0, 3) })
    pushStruct('cavefern', WX, WY, CS, CS, false, { count: rng.int(65, 95), hue: rng.int(0, 3) })
    placeStruct('glowshroom', rng.int(11, 17), { data: () => ({ hue: rng.int(0, 5), tall: rng.chance(0.42) }) })
    // 每区块只取两组蘑菇作真实光源代理：照亮岩面，但不为每朵菌盖建立昂贵点光源。
    for (const s of structures.filter((q) => q.kind === 'glowshroom').slice(0, 2)) {
      const gx = s.x + 0.5, gy = s.y + 0.5
      pushLight(s.x, s.y, 4.5, Number(s.data?.hue ?? 0) % 2 ? '#db68c8' : '#66e0b4', l8GroundAt(seed, gx, gy) + 1.55, 0.2)
    }
    // 仍显著高于旧版 2–4 只/区块，同时降低同屏骨骼实体总量，解决群落卡顿。
    placeEntity('corpserat', rng.int(4, 7), { dryOnly: true })
    placeEntity('corpserat', rng.int(2, 4), { dryOnly: true, data: () => ({ ceilingCrawler: 1, scale: rng.range(0.9, 1.12) }) })
  } else if (variant === 'movile') {
    pushStruct('fungalmat', WX, WY, CS, CS, false, { count: rng.int(115, 175), hue: rng.int(0, 3) })
    placeStruct('glowshroom', rng.int(3, 6), { data: () => ({ hue: 2, tall: false, mat: 1 }) })
    // 菌盖本身自发光之外，用至多两盏无阴影弱点光把菌毯的凹凸/湿润反射真正照出来。
    // 这也避免 MeshStandardMaterial 在没有任何入射光时退化成纯黑色。
    for (const s of structures.filter((q) => q.kind === 'glowshroom').slice(0, 2)) {
      const gx = s.x + 0.5, gy = s.y + 0.5
      pushLight(s.x, s.y, 4.8, '#a9d572', l8GroundAt(seed, gx, gy) + 1.2, 0.22)
    }
    // 提高新莫维勒种群密度，但仍按整座 3×3 地质带分槽，避免九个区块同时堆满高细节实体。
    // 两个捕食点各自生成受眷鸟与飞蛾，另外两个飞蛾点维持猎物补充：每座约 2–4 鸟、14–22 蛾。
    const birdSlotA = h32(seed, 0x8188, zoneX, zoneY) % 9
    const birdSlotB = (birdSlotA + 5) % 9
    const mothSlotA = (birdSlotA + 2) % 9, mothSlotB = (birdSlotA + 7) % 9
    if (zoneLocal === birdSlotA || zoneLocal === birdSlotB) {
      placeEntity('deathmoth', rng.int(4, 6))
      placeEntity('curabitur', rng.int(1, 2), { data: () => ({ scale: rng.range(0.92, 1.08) }) })
    } else if (zoneLocal === mothSlotA || zoneLocal === mothSlotB) placeEntity('deathmoth', rng.int(3, 5))
  } else if (variant === 'handyland') {
    // 一整个区块的血红苔藓合成一批地面/墙面贴花；不会为每一斑苔藓创建独立对象。
    pushStruct('bloodmoss', WX, WY, CS, CS, false, { count: rng.int(62, 96), hue: rng.int(0, 2) })
    // 手形岩刺大小、倾斜和手势各不相同：张开、蜷曲、抓握、指向与侧伸。
    for (let n = 0, count = rng.int(13, 19); n < count; n++) {
      const p = findSpot(false, 0.85)
      if (!p) continue
      const wx = WX + p.x + 0.5, wy = WY + p.y + 0.5
      const clearance = l8RoofAt(seed, wx, wy) - l8GroundAt(seed, wx, wy)
      // 低隧道只出现矮小石臂；巨型张手留给高洞厅，避免指尖穿入平滑洞顶。
      const scale = rng.range(0.52, Math.max(0.7, Math.min(2.25, (clearance - 0.24) / 1.2)))
      pushStruct('handspike', WX + p.x, WY + p.y, 1, 1, scale > 1.18, {
        moss: rng.chance(0.48) ? 1 : 0, rot: rng.range(0, Math.PI * 2), scale,
        pose: rng.int(0, 4), leanX: rng.range(-0.34, 0.34), leanZ: rng.range(-0.28, 0.28),
      })
    }
    // 只在净空足够的高洞厅生成顶层云雾；雷雨与极光各自按区块低频出现。
    let weatherClearance = 0, weatherAnchorX = 0, weatherAnchorY = 0
    // 固定采样整个区块而非只抽一个随机点，确保只要存在高洞厅就一定铺设云层；低矮隧道不会误生天气。
    for (let sy = 3; sy < CS - 2; sy += 4) for (let sx = 3; sx < CS - 2; sx += 4) {
      if (tiles[li(sx, sy)] !== 1) continue
      const wx = WX + sx + 0.5, wy = WY + sy + 0.5
      const clearance = l8RoofAt(seed, wx, wy) - l8GroundAt(seed, wx, wy)
      if (clearance > weatherClearance) {
        weatherClearance = clearance
        weatherAnchorX = sx + 0.5 - CS * 0.5
        weatherAnchorY = sy + 0.5 - CS * 0.5
      }
    }
    if (weatherClearance > 7.2) pushStruct('handweather', WX, WY, CS, CS, false, {
      // 每座高洞厅都有独立相位；雨暴与极光只占周期中的短窗口，因而不会变成常驻天气。
      storm: 1, aurora: 1,
      phase: rng.range(0, 55), period: rng.range(25, 42), count: rng.int(150, 220),
      anchorX: weatherAnchorX, anchorY: weatherAnchorY,
    })
    // 少量无阴影红光代理同时照亮苔藓、岩壁法线和手形石钉。
    // 每区块只用一盏聚合红光；苔藓本体仍有自发光，避免九区块窗口同时挂载数十盏点光源。
    for (const hs of structures.filter((q) => q.kind === 'handspike' && q.data?.moss).slice(0, 1)) {
      const gx = hs.x + 0.5, gy = hs.y + 0.5
      pushLight(hs.x, hs.y, 7.2, '#d22625', l8GroundAt(seed, gx, gy) + 0.85 * Number(hs.data?.scale ?? 1), 0.17)
    }

    // 巨臂林地的生物群按 4×4 宏区限额分槽，保证六类实体都会生成，同时避免每区块全刷一遍。
    const handZoneX = Math.floor(cx / HANDY_ZONE_CHUNKS), handZoneY = Math.floor(cy / HANDY_ZONE_CHUNKS)
    const handLocal = ((cx % HANDY_ZONE_CHUNKS) + HANDY_ZONE_CHUNKS) % HANDY_ZONE_CHUNKS
      + (((cy % HANDY_ZONE_CHUNKS) + HANDY_ZONE_CHUNKS) % HANDY_ZONE_CHUNKS) * HANDY_ZONE_CHUNKS
    const slot = (salt: number, add = 0) => (h32(seed, salt, handZoneX, handZoneY) + add) % 16
    if (handLocal === slot(0x81c0) || handLocal === slot(0x81c0, 7)) placeEntity('deathmoth', rng.int(1, 2))
    if (handLocal === slot(0x81c1) || handLocal === slot(0x81c1, 5) || handLocal === slot(0x81c1, 11)) placeEntity('dryshrimp', rng.int(1, 2), { dryOnly: true })
    if (handLocal === slot(0x81c2) || handLocal === slot(0x81c2, 4) || handLocal === slot(0x81c2, 9)) placeEntity('arachnid', rng.int(1, 2), {
      dryOnly: true,
      data: () => ({ arachnidMorph: rng.chance(0.72) ? 'spider' : 'mite', arachnidBreed: rng.int(0, 7), herbivore: 1, scale: rng.range(0.66, 1.12) }),
    })
    if (handLocal === slot(0x81c3)) placeEntity('nguithr', 1)
    if (handLocal === slot(0x81c4)) placeEntity('smiler', 1)
    if (handLocal === slot(0x81c5) || handLocal === slot(0x81c5, 8)) placeEntity('camocrawler', 1)
  } else {
    if (rng.chance(0.28)) placeEntity('camocrawler', 1)
  }

  // 旱虾只在排除罗特尼斯、新莫维勒和巨臂林地后的干燥洞底低概率出现。
  if (variant !== 'rottnest' && variant !== 'movile' && variant !== 'handyland' && rng.chance(0.16)) {
    placeEntity('dryshrimp', rng.int(1, 2), { dryOnly: true })
  }

  // 蛛形纲仅占据除多维之路外的四个命名生态系统；形态、花纹与食性由实例固定。
  if (variant === 'movile') {
    const spiderSlotA = h32(seed, 0x818a, zoneX, zoneY) % 9
    const spiderSlotB = (spiderSlotA + 2) % 9, spiderSlotC = (spiderSlotA + 5) % 9, spiderSlotD = (spiderSlotA + 7) % 9
    if (zoneLocal === spiderSlotA || zoneLocal === spiderSlotB || zoneLocal === spiderSlotC || zoneLocal === spiderSlotD) placeEntity('arachnid', rng.int(2, 4), {
      dryOnly: true,
      data: () => ({ arachnidMorph: 'spider', arachnidBreed: rng.int(0, 7), herbivore: rng.chance(0.28) ? 1 : undefined, scale: rng.range(0.72, 1.12) }),
    })
  } else if (variant === 'rottnest') {
    const eco: { morphs: RawEntity['arachnidMorph'][]; herbivore: number; chance: number } = {
      morphs: ['spider', 'spider', 'mite', 'tick'], herbivore: 0.58, chance: 0.82,
    }
    if (rng.chance(eco.chance)) placeEntity('arachnid', rng.int(1, 3), {
      dryOnly: true,
      data: () => ({
        arachnidMorph: eco.morphs[rng.int(0, eco.morphs.length - 1)],
        arachnidBreed: rng.int(0, 7),
        herbivore: rng.chance(eco.herbivore) ? 1 : undefined,
        scale: rng.range(0.72, 1.18),
      }),
    })
  }

  // 补给和特有物严格落在洞内；氙气玻璃珠在多维之路明显更常见。
  const itemPool = [...def.items, ...UNIVERSAL_ITEMS].filter((q) => q.type !== 'xenonmarble')
  const itemCount = variant === 'hyperspace' ? rng.int(2, 4) : rng.int(0, 2)
  for (let n = 0; n < itemCount; n++) {
    const p = findSpot(false, 1.1); if (!p) continue
    const type0 = variant === 'hyperspace' && rng.chance(0.64) ? 'xenonmarble' : rng.weighted(itemPool.map((q) => ({ v: q.type, w: q.w })))
    items.push({ id: GEN_ITEM_BASE + (h32(seed, 0x8160, cx, cy, itemN++) & 0xfffff), type: type0, x: WX + p.x + 0.5, y: WY + p.y + 0.5 })
  }

  const byKind = (kind: string) => def.exits.find((e) => e.kind === kind)
  // 第九大道：首块路标立在出生石岸，之后严格每 50m 一块；末段收束成狭窄洞口接入 L9。
  for (let n = 0; n < L8_AVENUE_SEGMENTS; n++) {
    const p = l8AvenuePoint(seed, n), next = l8AvenuePoint(seed, n + 1)
    if (Math.floor(p.x / CS) !== cx || Math.floor(p.y / CS) !== cy) continue
    pushStruct('roadsign', p.x - 0.5, p.y - 0.5, 1, 1, false, {
      avenue: 1, seq: n, nextX: next.x, nextY: next.y, final: n === L8_AVENUE_SEGMENTS - 1 ? 1 : 0,
    })
  }
  // “空巢”与哈莫兹地标由全局固定点所属的唯一 chunk 生成；不会像随机生态装饰那样重抽，
  // 因而一层各自严格只有一个。它们分列第一号路标两侧，既临近第九大道也彼此相邻。
  for (const mark of l8OutpostLandmarkPoints(seed)) {
    if (Math.floor(mark.x / CS) !== cx || Math.floor(mark.y / CS) !== cy) continue
    pushStruct('landmark', mark.x - 0.5, mark.y - 0.5, 1, 1, false, {
      outpost: mark.outpost, l8Post: 1, avenueSeq: 1,
    })
  }
  const avenueEnd = l8AvenuePoint(seed, L8_AVENUE_SEGMENTS)
  if (Math.floor(avenueEnd.x / CS) === cx && Math.floor(avenueEnd.y / CS) === cy) {
    const e = byKind('ninthroad')
    if (e) exits.push({ def: e, x: avenueEnd.x - 0.5, y: avenueEnd.y - 0.5, discovered: false })
  }
  if (variant === 'rottnest' && h01(seed, 0x8192, cx, cy) < 0.12) {
    const p = openInChunk(seed, cx, cy, 0x8193, 5.1), e = byKind('l8vent')
    if (p && e) {
      const ex = WX + p.x + 0.5, ey = WY + p.y + 0.5
      exits.push({ def: e, x: WX + p.x, y: WY + p.y, z: l8RoofAt(seed, ex, ey) - 0.76, discovered: false })
    }
  }
  return { variant, tiles, wet, elev, step, tint, crawl, liquid, seaFloor, terrain, caveCeil, structures, items, lights, exits, entities }
}

registerInfiniteLevel(8, {
  genRaw: genL8ChunkRaw,
  variantOf: l8VariantOf,
  rareVariants: L8_RARE_VARIANTS,
  variantNames: L8_VARIANT_NAMES,
  variantLore: L8_VARIANT_LORE,
  spawnWorld: L8_ORIGIN,
  regionExitPos: l8RegionExitAnchor,
  caveVolume: {
    column: l8VolumeColumn,
    field: l8VolumeField,
    ground: l8GroundAt,
    roof: l8RoofAt,
    horizontalSegments: 32,
    verticalMin: -2,
    verticalMax: 14,
    verticalStep: 0.7,
    texture: 'l8_wall.jpg',
    color: '#8a8272',
    materials: {
      phreatic: { texture: 'l8_wall.jpg', normalTexture: 'l8_wall_normal.jpg', roughnessTexture: 'l8_wall_roughness.jpg', color: '#c8c2b5', textureScale: 0.32, normalStrength: 0.82, roughness: 0.96, envBase: 0.19 },
      vadose: { texture: 'l8_ceil.jpg', normalTexture: 'l8_ceil_normal.jpg', roughnessTexture: 'l8_ceil_roughness.jpg', color: '#c5bcae', textureScale: 0.37, normalStrength: 0.9, roughness: 1.0, envBase: 0.13 },
      breakdown: { texture: 'l8_floor.jpg', normalTexture: 'l8_floor_normal.jpg', roughnessTexture: 'l8_floor_roughness.jpg', color: '#bbb8b0', textureScale: 0.27, normalStrength: 0.96, roughness: 1.0, envBase: 0.12 },
      hyperspace: { texture: 'l8_wall.jpg', normalTexture: 'l8_wall_normal.jpg', roughnessTexture: 'l8_wall_roughness.jpg', color: '#afc6be', textureScale: 0.35, normalStrength: 0.78, roughness: 0.9, envBase: 0.2 },
      rottnest: { texture: 'l8_floor.jpg', normalTexture: 'l8_floor_normal.jpg', roughnessTexture: 'l8_floor_roughness.jpg', color: '#786f55', textureScale: 0.25, normalStrength: 0.9, roughness: 0.98, envBase: 0.12 },
      movile: { texture: 'l8_ceil.jpg', normalTexture: 'l8_ceil_normal.jpg', roughnessTexture: 'l8_ceil_roughness.jpg', color: '#bbb894', textureScale: 0.39, normalStrength: 0.72, roughness: 0.87, envBase: 0.22 },
      handyland: { texture: 'l8_wall.jpg', normalTexture: 'l8_wall_normal.jpg', roughnessTexture: 'l8_wall_roughness.jpg', color: '#bd958d', textureScale: 0.33, normalStrength: 0.9, roughness: 0.96, envBase: 0.15 },
    },
  },
})
