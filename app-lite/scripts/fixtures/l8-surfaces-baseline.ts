// ================= Level 8「洞穴系统」无限有机洞穴 =================
// 世界坐标纯函数生成：规则节点只负责保证洞网全局连通，最终几何由连续洞底/洞顶高度场
// 与弯曲边壁构建，因此玩家看到的是天然洞穴，而不是房间和直角走廊。
import { RNG } from '../../src/game/core/rng'
import { UNIVERSAL_ITEMS } from '../../src/game/content/items'
import type { ExitInstance, GroundItem, LevelDef, LightSource, Structure } from '../../src/game/core/types'
import { CS, GEN_ITEM_BASE, h32 } from '../../src/game/world/infinite'
import { registerInfiniteLevel, type CaveVolumeColumn, type GenChunk } from '../../src/game/world/infiniteRegistry'

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
