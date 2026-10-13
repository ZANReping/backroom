// ================= Level 10「丰裕」无限农田（v64 重制） =================
// 设定依据：Backrooms 中文维基 Level 10「丰裕」——
//   · 向四面八方无限延伸的麦田，被一排排树木与灌木丛分割成许多小块；灌木高度一致、不会竞相生长；
//   · 水体广布于低地：同一水位、清澈、湖泊周围未开垦，只有泥土与草地；
//   · 小木棚、外屋、谷仓、马厩间或出现，内部大多空空如也，只存放木材与钉子；
//   · 泥土小径 = 两条轮胎碾痕夹一条草带，沿小径走很远可到 Level 11；
//   · 一米以下的土壤里有大量蠕虫。
//
// v64 生成结构（全部是世界坐标纯函数，区块边界不会换相）：
//   1. 田块：扭曲的 Voronoi 地块（约 26m 间距）。每块田有自己的用途（小麦/大麦/休耕/草场/
//      干草场/罕见油菜花）与耕作方向；田块之间才是树篱、树列或开放的田埂。
//      → 不同作物之间的过渡发生在自然的树篱/田埂处，而不是 32m 区块的直线上。
//   2. 低地水系：独立低频「湿度场」决定低洼处；水面统一在 y=0，湖底与岸坡共用同一高度场；
//      岸边留出未开垦的草地/泥滩，麦田在离岸若干米处由疏到无自然收边。
//   3. 农舍群：沿土路的院落（谷仓 + 马厩/棚屋/外屋），田间偶有孤立的小棚与外屋。
//      建筑占地、院落、地基整平都按世界坐标解析计算，跨区块的建筑在每个区块里都一致。
import type { ExitDef, ExitInstance, GroundItem, LevelDef, LightSource, Structure } from '../core/types'
import { CS, GEN_ITEM_BASE, h32 } from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'

export type L10Variant =
  | 'wheatfield' | 'barleyfield' | 'mixedfield' | 'lowland'
  | 'farmstead' | 'worksite' | 'deeplake'

export const L10_VARIANT_NAMES: Record<L10Variant, string> = {
  wheatfield: '小麦田', barleyfield: '大麦田', mixedfield: '混合农田',
  lowland: '低洼湖区', farmstead: '农舍群', worksite: 'M.E.G. 临时作业点',
  deeplake: '深湖',
}

export const L10_VARIANT_LORE: Record<string, string[]> = {
  wheatfield: ['成熟的小麦一直延伸到阴云下的地平线。田块被同样高度的灌木一块块隔开。'],
  barleyfield: ['更低、更密的大麦随阵风成片伏倒，又缓慢挺直。'],
  mixedfield: ['小麦、大麦、休耕地与草场在树篱之间交错，田埂上的草从不被踩倒。'],
  lowland: ['地势缓慢沉入清澈的湖水。湖边没有开垦过，只有泥滩和草地。'],
  farmstead: ['谷仓、马厩和棚屋围着一块被碾实的土院；屋里除了木材和钉子几乎什么都没有。'],
  worksite: ['M.E.G. 的折叠桌、测量标记和废弃记录仍留在田边，但这里并非永久据点。'],
  deeplake: ['罕见的深湖看不见湖底。只有湖心最深处能通往 Level 7。'],
}

export const L10_RARE_VARIANTS: readonly string[] = Object.keys(L10_VARIANT_NAMES)
export const L10_L9_SPAWN = { x: 16.5, y: 20.5 }
export const L10_L11_SPAWN = { x: 16.5, y: 12.5 }

const h01 = (...n: number[]) => h32(...n) / 4294967296
const idx = (x: number, y: number) => y * CS + x
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const mod = (v: number, n: number) => ((v % n) + n) % n
const smooth = (t: number) => t * t * (3 - 2 * t)
const sstep = (a: number, b: number, v: number) => smooth(clamp((v - a) / (b - a), 0, 1))

function valueNoise(seed: number, salt: number, x: number, y: number, scale: number): number {
  const gx = Math.floor(x / scale), gy = Math.floor(y / scale)
  const fx = smooth(mod(x, scale) / scale), fy = smooth(mod(y, scale) / scale)
  const a = h01(seed, salt, gx, gy), b = h01(seed, salt, gx + 1, gy)
  const c = h01(seed, salt, gx, gy + 1), d = h01(seed, salt, gx + 1, gy + 1)
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy
}

// ---------------------------------------------------------------- 道路
// 东西向主路跨世界连续弯曲；支路每 160m 左右纵向汇入主路。（与 v23 相同，保证 Level 11 终点不漂移）
export function l10MainRoadY(seed: number, wx: number, band = 0): number {
  const base = band * 256 + 16
  return base + Math.sin(wx * .0105 + h01(seed, 0x10b0, band) * 6.283) * 7
    + Math.sin(wx * .0032 + h01(seed, 0x10b1, band) * 6.283) * 4
}
const branchX = (seed: number, k: number) => 72 + k * 160 + (h01(seed, 0x10b2, k) - .5) * 30

export function l10RoadInfo(seed: number, wx: number, wy: number) {
  const band = Math.round((wy - 16) / 256)
  const mainY = l10MainRoadY(seed, wx, band)
  let d = Math.abs(wy - mainY)
  let branch = false
  const bx0 = Math.round((wx - 72) / 160)
  for (let k = -1; k <= 1; k++) {
    const bd = Math.abs(wx - branchX(seed, bx0 + k))
    if (bd < d && Math.abs(wy - mainY) < 118) { d = bd; branch = true }
  }
  return { d, branch, mainY, band }
}

// ---------------------------------------------------------------- 低地水系
/** 湖水线阈值：湿度场低于它即为湖面；水面统一在 y=0。 */
export const L10_LAKE_T = .322
const SPAWN_C = { x: 16.5, y: 18 }

function rawWetness(seed: number, wx: number, wy: number) {
  return valueNoise(seed, 0x10c0, wx, wy, 150) * .6 + valueNoise(seed, 0x10c1, wx, wy, 57) * .3
    + valueNoise(seed, 0x10c2, wx, wy, 17) * .1
}

/** 湿度场：越小越低洼。道路和出生点附近被抬高，湖泊不会淹没土路或入口。 */
export function l10Wetness(seed: number, wx: number, wy: number): number {
  let wl = rawWetness(seed, wx, wy)
  const road = l10RoadInfo(seed, wx, wy).d
  wl += .3 * (1 - sstep(5, 24, road))
  wl += .45 * (1 - sstep(26, 64, Math.hypot(wx - SPAWN_C.x, wy - SPAWN_C.y)))
  wl += yardLift(seed, wx, wy)
  return wl
}

/** 湖面以下水深（米）；0 表示陆地。深湖由另一张极低频场在少数湖心放大。 */
export function l10LakeDepth(seed: number, wx: number, wy: number, wl = l10Wetness(seed, wx, wy)): number {
  const d = L10_LAKE_T - wl
  if (d <= 0) return 0
  const deep = sstep(.74, .88, valueNoise(seed, 0x10c8, wx, wy, 240))
  return Math.min(2.4, d * 19) * (1 + deep * 2.0) + .04
}

/** 陆地基础起伏（不含湖岸、道路和地基修整）。 */
function groundBase(seed: number, wx: number, wy: number) {
  const broad = valueNoise(seed, 0x1010, wx, wy, 86) - .5
  const mid = valueNoise(seed, 0x1011, wx, wy, 27) - .5
  return .34 + broad * 1.05 + mid * .24
}

/** 含湖盆与岸坡的连续地面高度（不含道路和地基）。 */
function naturalHeight(seed: number, wx: number, wy: number, wl: number) {
  if (wl < L10_LAKE_T) return -l10LakeDepth(seed, wx, wy, wl)
  const g = Math.max(.04, groundBase(seed, wx, wy))
  return g * sstep(L10_LAKE_T, L10_LAKE_T + .075, wl)
}

// ---------------------------------------------------------------- 田块
export type L10PlotUse = 'wheat' | 'barley' | 'fallow' | 'meadow' | 'hay' | 'canola'
export type L10Boundary = 'hedge' | 'treeline' | 'open'
const PLOT = 26

function plotSite(seed: number, i: number, j: number) {
  return { x: i * PLOT + 3 + h01(seed, 0x1101, i, j) * (PLOT - 6), y: j * PLOT + 3 + h01(seed, 0x1102, i, j) * (PLOT - 6) }
}
const plotId = (i: number, j: number) => (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0

export function l10PlotUse(seed: number, i: number, j: number): L10PlotUse {
  // 大尺度上让相邻田块倾向同一作物，形成「一片麦区」「一片大麦区」的连贯感。
  const s = plotSite(seed, i, j)
  const region = valueNoise(seed, 0x1105, s.x, s.y, 140)
  const r = h01(seed, 0x1104, i, j) * .7 + region * .3
  if (r < .40) return 'wheat'
  if (r < .58) return 'barley'
  const r2 = h01(seed, 0x1106, i, j)
  if (r2 < .30) return region < .5 ? 'wheat' : 'barley'
  if (r2 < .50) return 'fallow'
  if (r2 < .72) return 'meadow'
  if (r2 < .93) return 'hay'
  return 'canola'
}

function boundaryKind(seed: number, a: number, b: number): L10Boundary {
  const lo = Math.min(a, b), hi = Math.max(a, b)
  const r = h01(seed, 0x1110, lo, hi)
  return r < .58 ? 'hedge' : r < .82 ? 'treeline' : 'open'
}

export interface L10PlotSample {
  i: number; j: number; id: number
  /** 到最近田块边界（Voronoi 平分线）的距离，米 */
  edge: number
  /** 边界另一侧的田块 */
  ni: number; nj: number; nid: number
  use: L10PlotUse
  /** 播种行方向（弧度） */
  dir: number
}

/** 扭曲 Voronoi：先对查询点做两层低频位移，田块边界因而呈自然弯曲而非直线。 */
export function l10PlotAt(seed: number, wx: number, wy: number): L10PlotSample {
  const qx = wx + (valueNoise(seed, 0x1120, wx, wy, 43) - .5) * 12 + (valueNoise(seed, 0x1122, wx, wy, 13) - .5) * 2.2
  const qy = wy + (valueNoise(seed, 0x1121, wx, wy, 43) - .5) * 12 + (valueNoise(seed, 0x1123, wx, wy, 13) - .5) * 2.2
  const ci = Math.floor(qx / PLOT), cj = Math.floor(qy / PLOT)
  let bi = 0, bj = 0, bd = Infinity
  const sites: { i: number; j: number; x: number; y: number }[] = []
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, j = cj + dj, s = plotSite(seed, i, j)
    sites.push({ i, j, x: s.x, y: s.y })
    const d = (qx - s.x) ** 2 + (qy - s.y) ** 2
    if (d < bd) { bd = d; bi = i; bj = j }
  }
  const a = plotSite(seed, bi, bj)
  let edge = Infinity, ni = bi, nj = bj
  for (const s of sites) {
    if (s.i === bi && s.j === bj) continue
    const dx = s.x - a.x, dy = s.y - a.y, len = Math.hypot(dx, dy) || 1
    const d = ((s.x + a.x) / 2 - qx) * dx / len + ((s.y + a.y) / 2 - qy) * dy / len
    if (d < edge) { edge = d; ni = s.i; nj = s.j }
  }
  // 田块耕作方向：大致对齐南北/东西，再给 ±14° 的个体偏差，看起来像人工犁出的条播行。
  const axis = h01(seed, 0x1107, bi, bj) < .5 ? 0 : Math.PI / 2
  const dir = axis + (h01(seed, 0x1108, bi, bj) - .5) * .5
  return { i: bi, j: bj, id: plotId(bi, bj), edge, ni, nj, nid: plotId(ni, nj), use: l10PlotUse(seed, bi, bj), dir }
}

// ---------------------------------------------------------------- 农舍群与孤立建筑
export type L10BuildingKind = 'barn' | 'l10stable' | 'l10shed' | 'l10outhouse'
export interface L10Building {
  kind: L10BuildingKind
  /** 世界坐标轴对齐占地 */
  x: number; y: number; w: number; h: number
  /** 门朝向：0=+y，90=+x，180=-y，270=-x */
  deg: number
  key: number
}
export interface L10Farmstead {
  key: number
  cx: number; cy: number
  /** 院落半轴（世界坐标，轴对齐椭圆） */
  rx: number; ry: number
  buildings: L10Building[]
  worksite?: boolean
}

const FARM_CELL = 120
const BUILD_DIMS: Record<L10BuildingKind, [number, number]> = {
  barn: [12, 9], l10stable: [13, 6], l10shed: [6, 5], l10outhouse: [2, 2],
}
const farmCache = new Map<number, L10Farmstead | null>()
let farmCacheSeed = NaN

/** 在局部「沿路 u / 离路 v」坐标下摆放建筑，再映射到世界轴对齐矩形。 */
function placeLocal(kind: L10BuildingKind, u: number, v: number, along: 'x' | 'y', side: 1 | -1,
  ox: number, oy: number, facing: 'road' | 'u+' | 'u-', key: number, long: 'u' | 'v'): L10Building {
  const [a, b] = BUILD_DIMS[kind]
  const du = long === 'u' ? a : b, dv = long === 'u' ? b : a
  let x0: number, y0: number, w: number, h: number
  if (along === 'x') { w = du; h = dv; x0 = ox + u - du / 2; y0 = side > 0 ? oy + v - dv / 2 : oy - v - dv / 2 }
  else { w = dv; h = du; y0 = oy + u - du / 2; x0 = side > 0 ? ox + v - dv / 2 : ox - v - dv / 2 }
  // 门的世界方向
  let dx = 0, dy = 0
  if (facing === 'road') { if (along === 'x') dy = -side; else dx = -side }
  else { const s = facing === 'u+' ? 1 : -1; if (along === 'x') dx = s; else dy = s }
  const deg = dy > 0 ? 0 : dx > 0 ? 90 : dy < 0 ? 180 : 270
  return { kind, x: Math.round(x0 * 2) / 2, y: Math.round(y0 * 2) / 2, w, h, deg, key }
}

export function l10FarmsteadOf(seed: number, fa: number, fb: number): L10Farmstead | null {
  if (seed !== farmCacheSeed || farmCache.size > 8192) { farmCache.clear(); farmCacheSeed = seed }
  const ck = (fa + 32768) * 65536 + (fb + 32768)
  const hit = farmCache.get(ck)
  if (hit !== undefined) return hit
  let out = makeFarmstead(seed, fa, fb)
  // 相邻宏格的院落过近（< 58m）时只保留优先级（哈希）更高的一个，避免两组建筑挤在一起
  if (out) {
    const pr = h01(seed, 0x1207, fa, fb)
    for (let db = -1; db <= 1 && out; db++) for (let da = -1; da <= 1 && out; da++) {
      if (!da && !db) continue
      const o = makeFarmstead(seed, fa + da, fb + db)
      if (o && Math.hypot(o.cx - out.cx, o.cy - out.cy) < 58 && h01(seed, 0x1207, fa + da, fb + db) > pr) out = null
    }
  }
  farmCache.set(ck, out)
  return out
}

function makeFarmstead(seed: number, fa: number, fb: number): L10Farmstead | null {
  const roll = h01(seed, 0x1200, fa, fb)
  if (roll > .40) return null
  const worksite = roll > .355
  const x0 = fa * FARM_CELL, y0 = fb * FARM_CELL
  const px = x0 + 20 + h01(seed, 0x1201, fa, fb) * (FARM_CELL - 40)
  const py = y0 + 20 + h01(seed, 0x1202, fa, fb) * (FARM_CELL - 40)
  const side: 1 | -1 = h01(seed, 0x1203, fa, fb) < .5 ? 1 : -1
  let along: 'x' | 'y', ox: number, oy: number
  const band = Math.round((py - 16) / 256)
  const mainY = l10MainRoadY(seed, px, band)
  const k = Math.round((px - 72) / 160), bx = branchX(seed, k)
  if (mainY > y0 + 8 && mainY < y0 + FARM_CELL - 8) { along = 'x'; ox = px; oy = mainY }
  else if (bx > x0 + 8 && bx < x0 + FARM_CELL - 8 && Math.abs(py - mainY) < 100) { along = 'y'; ox = bx; oy = py }
  else return null
  // 院落中心离路 15m（worksite 只需 10m）
  const off = worksite ? 10 : 15
  const cx = along === 'x' ? ox : ox + side * off, cy = along === 'x' ? oy + side * off : oy
  if (Math.hypot(cx - SPAWN_C.x, cy - SPAWN_C.y) < 46) return null
  if (rawWetness(seed, cx, cy) < L10_LAKE_T + .05) return null
  const key = (h32(seed, 0x1204, fa, fb) & 0x7fffffff) || 1
  if (worksite) {
    return { key, cx, cy, rx: 7, ry: 7, buildings: [], worksite: true }
  }
  // 局部坐标：u 沿路，v 离路（v=off 为院心）
  const b: L10Building[] = []
  const lay = h32(seed, 0x1205, fa, fb)
  const flip = (lay & 1) ? 1 : -1
  const along2 = along
  const P = (kind: L10BuildingKind, u: number, v: number, facing: 'road' | 'u+' | 'u-', long: 'u' | 'v') =>
    b.push(placeLocal(kind, u * flip, v, along2, side, ox, oy, facing === 'road' ? 'road' : (facing === 'u+') === (flip > 0) ? 'u+' : 'u-', key + b.length, long))
  // 谷仓位于院落远端，大门朝向院子与道路
  P('barn', (h01(seed, 0x1206, fa, fb) - .5) * 4, off + 10.5, 'road', 'u')
  if ((lay >> 1) % 10 < 7) P('l10stable', -14.5, off + 1.5, 'u+', 'v')
  if ((lay >> 5) % 10 < 7) P('l10shed', 12.5, off + 3, 'u-', 'u')
  if ((lay >> 9) % 10 < 6) P('l10outhouse', 14.5, off + 9.5, 'u-', 'u')
  // 支路与主路交汇处可能有另一条路穿过院落：压到任何土路（含 4m 路肩）的附属建筑直接省略
  const clear = (q: L10Building) => {
    for (let sy = 0; sy <= 2; sy++) for (let sx = 0; sx <= 2; sx++)
      if (l10RoadInfo(seed, q.x + q.w * sx / 2, q.y + q.h * sy / 2).d < 4.2) return false
    return true
  }
  const kept = b.filter(clear)
  if (!kept.some(q => q.kind === 'barn')) return null
  return { key, cx, cy, rx: along === 'x' ? 19 : 16, ry: along === 'x' ? 16 : 19, buildings: kept }
}

/** 田间孤立的小棚/外屋：每个田块约 5% 概率，落在田块中心附近。 */
export function l10PlotBuilding(seed: number, i: number, j: number): L10Building | null {
  const r = h01(seed, 0x1210, i, j)
  if (r > .055) return null
  const kind: L10BuildingKind = r < .02 ? 'l10outhouse' : r < .045 ? 'l10shed' : 'l10stable'
  const s = plotSite(seed, i, j)
  if (Math.hypot(s.x - SPAWN_C.x, s.y - SPAWN_C.y) < 40) return null
  if (l10RoadInfo(seed, s.x, s.y).d < 10 || rawWetness(seed, s.x, s.y) < L10_LAKE_T + .08) return null
  const [a, bb] = BUILD_DIMS[kind]
  const rot = h32(seed, 0x1211, i, j) % 4
  const w = rot % 2 ? bb : a, h = rot % 2 ? a : bb
  return { kind, x: Math.round((s.x - w / 2) * 2) / 2, y: Math.round((s.y - h / 2) * 2) / 2, w, h, deg: rot * 90, key: (h32(seed, 0x1212, i, j) & 0x7fffffff) || 1 }
}

/** 某一世界矩形附近（含边距）的全部农舍与孤立建筑。 */
function featuresNear(seed: number, x0: number, y0: number, x1: number, y1: number) {
  const farms: L10Farmstead[] = []
  for (let fb = Math.floor((y0 - 60) / FARM_CELL); fb <= Math.floor((y1 + 60) / FARM_CELL); fb++)
    for (let fa = Math.floor((x0 - 60) / FARM_CELL); fa <= Math.floor((x1 + 60) / FARM_CELL); fa++) {
      const f = l10FarmsteadOf(seed, fa, fb)
      if (f && f.cx > x0 - 60 && f.cx < x1 + 60 && f.cy > y0 - 60 && f.cy < y1 + 60) farms.push(f)
    }
  const lone: L10Building[] = []
  for (let j = Math.floor((y0 - 40) / PLOT); j <= Math.floor((y1 + 40) / PLOT); j++)
    for (let i = Math.floor((x0 - 40) / PLOT); i <= Math.floor((x1 + 40) / PLOT); i++) {
      const b = l10PlotBuilding(seed, i, j)
      if (b && !farms.some(f => Math.abs(f.cx - b.x) < 40 && Math.abs(f.cy - b.y) < 40)) lone.push(b)
    }
  return { farms, lone }
}

/** 院落与建筑周边抬高湿度场，保证农舍不会落进湖里。 */
function yardLift(seed: number, wx: number, wy: number) {
  const fa = Math.floor(wx / FARM_CELL), fb = Math.floor(wy / FARM_CELL)
  let lift = 0
  for (let db = -1; db <= 1; db++) for (let da = -1; da <= 1; da++) {
    const f = l10FarmsteadOf(seed, fa + da, fb + db)
    if (!f) continue
    const d = Math.hypot((wx - f.cx) / (f.rx + 12), (wy - f.cy) / (f.ry + 12))
    lift = Math.max(lift, .4 * (1 - sstep(.7, 1.4, d)))
  }
  return lift
}

// ---------------------------------------------------------------- HUD 区域判定
/** 区块的代表性区域（HUD/图鉴用）：只采样区块中心。 */
export function l10VariantOf(seed: number, cx: number, cy: number): L10Variant {
  const wx = cx * CS + 16, wy = cy * CS + 16
  if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) return 'mixedfield'
  const depth = l10LakeDepth(seed, wx, wy)
  if (depth > 0) return depth > 3.6 ? 'deeplake' : 'lowland'
  const { farms } = featuresNear(seed, wx - 16, wy - 16, wx + 16, wy + 16)
  for (const f of farms) if (Math.hypot(f.cx - wx, f.cy - wy) < 30) return f.worksite ? 'worksite' : 'farmstead'
  if (l10Wetness(seed, wx, wy) < L10_LAKE_T + .06) return 'lowland'
  const u = l10PlotAt(seed, wx, wy).use
  return u === 'wheat' ? 'wheatfield' : u === 'barley' ? 'barleyfield' : 'mixedfield'
}

/** 旧接口兼容：返回某点的地表组成（作物覆盖/草地/裸土比例）。 */
export function l10BiomeMixAt(seed: number, wx: number, wy: number) {
  const s = sampleSurface(seed, wx, wy)
  const crop = s.crop
  return {
    crop, grass: s.grass, bare: Math.max(0, 1 - crop - s.grass),
    wheat: s.use === 'wheat' ? crop : 0, barley: s.use === 'barley' ? crop : 0,
    mixed: s.use === 'wheat' || s.use === 'barley' ? 0 : 1,
  }
}

/** 某点的作物覆盖度（0~1）与草地占比：考虑田块用途、田埂、湖岸未开垦带和道路。 */
function sampleSurface(seed: number, wx: number, wy: number, plot = l10PlotAt(seed, wx, wy), wl = l10Wetness(seed, wx, wy)) {
  const cropUse = plot.use === 'wheat' || plot.use === 'barley' || plot.use === 'canola'
  // 田埂：靠近边界留 1.2~2.2m 草带（树篱/树列边更宽）
  const bk = boundaryKind(seed, plot.id, plot.nid)
  const headland = bk === 'open' ? .9 : 1.7
  const edgeNoise = (valueNoise(seed, 0x1130, wx, wy, 5) - .5) * .9
  const edgeK = sstep(headland - .4, headland + .9, plot.edge + edgeNoise)
  // 湖岸未开垦带：湿度场越接近水线，作物越稀疏，最后变为草地/泥滩
  const shoreK = sstep(L10_LAKE_T + .045, L10_LAKE_T + .095, wl + (valueNoise(seed, 0x1131, wx, wy, 7) - .5) * .02)
  const crop = cropUse ? edgeK * shoreK : 0
  const grass = cropUse ? (1 - crop) * .85 : plot.use === 'fallow' ? .18 * edgeK + (1 - edgeK) * .8 : .92
  return { crop, grass, use: plot.use, edgeK, shoreK, bk }
}

// ---------------------------------------------------------------- 出口
const exitOf = (def: LevelDef, kind: string): ExitDef | undefined => def.exits.find(e => e.kind === kind)
const sidOf = (seed: number, cx: number, cy: number, n: number) => (h32(seed, 0x10d0, cx, cy, n) & 0x7fffffff) || 1

// 每个 16×16 chunk 超区域在主路上有一个确定性的 Level 11 终点。
function longRoadPoint(seed: number, rx: number, ry: number) {
  const x = rx * 512 + 511 - (h32(seed, 0x10e0, rx, ry) % 12)
  const band = ry * 2
  return { x: x + .5, y: l10MainRoadY(seed, x, band) + .5 }
}
/** 轻量测试/HUD 共用的 16×16 chunk 超区域出口坐标，不生成区块。 */
export const l10RegionExitPoint = (seed: number, rx: number, ry: number) => longRoadPoint(seed, rx, ry)

const LAKE_CELL = 96
/** 每个 96m 宏格中最深的湖心点；只有水深超过 4.6m 的深湖才通往 Level 7。 */
export function l10DeepLakeExit(seed: number, la: number, lb: number): { x: number; y: number; depth: number } | null {
  let best: { x: number; y: number; depth: number } | null = null
  for (let sy = 0; sy < 12; sy++) for (let sx = 0; sx < 12; sx++) {
    const x = la * LAKE_CELL + 4 + sx * 8, y = lb * LAKE_CELL + 4 + sy * 8
    const d = l10LakeDepth(seed, x, y)
    if (d > 4.6 && (!best || d > best.depth)) best = { x, y, depth: d }
  }
  return best
}

// ---------------------------------------------------------------- 区块生成
type Forced = { lake?: 'lowland' | 'deeplake'; farm?: boolean; worksite?: boolean; use?: L10PlotUse }
function forcedOf(forced?: string): Forced | null {
  if (!forced) return null
  if (forced === 'lowland' || forced === 'deeplake') return { lake: forced }
  if (forced === 'farmstead') return { farm: true }
  if (forced === 'worksite') return { worksite: true }
  if (forced === 'wheatfield') return { use: 'wheat' }
  if (forced === 'barleyfield') return { use: 'barley' }
  if (forced === 'mixedfield') return {}
  return null
}

export function genL10ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forcedVariant?: string): GenChunk {
  const F = forcedOf(forcedVariant)
  const variant = (forcedVariant as L10Variant | undefined) ?? l10VariantOf(seed, cx, cy)
  const WX = cx * CS, WY = cy * CS
  const tiles = new Uint8Array(CS * CS).fill(1)
  const wet = new Uint8Array(CS * CS)
  const elev = new Uint8Array(CS * CS).fill(3)
  const step = new Uint8Array(CS * CS)
  const tint = new Uint8Array(CS * CS).fill(44) // 干土
  const crawl = new Uint8Array(CS * CS)
  const outdoor = new Uint8Array(CS * CS).fill(1)
  const ceiling = new Uint8Array(CS * CS)
  const liquid = new Uint8Array(CS * CS)
  const seaFloor = new Float32Array(CS * CS).fill(1.7)
  const terrain = new Float32Array(CS * CS)
  const structures: Structure[] = []
  const items: GroundItem[] = []
  const lights: LightSource[] = []
  const exits: ExitInstance[] = []
  const entities: GenChunk['entities'] = []
  let stateN = 0, itemN = 0

  // 强制区域（开发面板/测试）：在区块中心叠加一处合成湖盆或农舍。
  const forcedFarm: L10Farmstead | null = F?.farm || F?.worksite ? (() => {
    const cxw = WX + 16, cyw = WY + 16, key = (h32(seed, 0x12f0, cx, cy) & 0x7fffffff) || 1
    if (F.worksite) return { key, cx: cxw, cy: cyw, rx: 7, ry: 7, buildings: [], worksite: true }
    const b: L10Building[] = [
      { kind: 'barn', x: WX + 10, y: WY + 6, w: 12, h: 9, deg: 0, key },
      { kind: 'l10stable', x: WX + 2, y: WY + 15, w: 6, h: 13, deg: 90, key: key + 1 },
      { kind: 'l10shed', x: WX + 24, y: WY + 18, w: 6, h: 5, deg: 270, key: key + 2 },
      { kind: 'l10outhouse', x: WX + 27, y: WY + 26, w: 2, h: 2, deg: 270, key: key + 3 },
    ]
    return { key, cx: cxw, cy: cyw + 4, rx: 15, ry: 12, buildings: b }
  })() : null
  const wetAt = (wx: number, wy: number) => {
    let wl = forcedFarm ? Math.max(l10Wetness(seed, wx, wy), .6) : l10Wetness(seed, wx, wy)
    if (F?.lake) {
      const r = Math.hypot(wx - (WX + 16), wy - (WY + 16)) / (F.lake === 'deeplake' ? 30 : 22)
      wl = Math.min(wl, L10_LAKE_T - (F.lake === 'deeplake' ? .26 : .085) * (1 - r * r) + (r > 1 ? (r - 1) * .2 : 0))
    }
    return wl
  }
  const depthAt = (wx: number, wy: number, wl: number) => {
    if (!F?.lake) return l10LakeDepth(seed, wx, wy, wl)
    if (wl >= L10_LAKE_T) return 0
    return Math.min(F.lake === 'deeplake' ? 6.9 : 2.4, (L10_LAKE_T - wl) * 26) + .04
  }
  const plotAt = (wx: number, wy: number) => {
    const p = l10PlotAt(seed, wx, wy)
    if (F?.use) p.use = F.use
    return p
  }

  const add = (kind: Structure['kind'], x: number, y: number, w = 1, h = 1, solid = false, data?: Structure['data']) => {
    const dyn = data && (data.loot || data.interactive || kind === 'l10digsite') ? { ...data, sid: sidOf(seed, cx, cy, stateN++) } : data
    structures.push({ kind, x: WX + x, y: WY + y, w, h, solid, data: dyn })
  }
  const occupied = (wx: number, wy: number, pad = 0) => structures.some(s =>
    wx >= s.x - pad && wx <= s.x + s.w + pad && wy >= s.y - pad && wy <= s.y + s.h + pad)

  // 本区块需要考虑的建筑：附近农舍 + 孤立建筑（含跨区块者）
  const near = featuresNear(seed, WX, WY, WX + CS, WY + CS)
  const farms = forcedFarm ? [forcedFarm] : near.farms
  const buildings: L10Building[] = [...farms.flatMap(f => f.buildings), ...(forcedFarm ? [] : near.lone)]
  const inRect = (wx: number, wy: number, b: { x: number; y: number; w: number; h: number }, pad: number) =>
    wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad
  const yardK = (wx: number, wy: number) => {
    let k = 0
    for (const f of farms) {
      const d = Math.hypot((wx - f.cx) / f.rx, (wy - f.cy) / f.ry) + (valueNoise(seed, 0x1140, wx, wy, 4) - .5) * .18
      k = Math.max(k, 1 - sstep(.82, 1.08, d))
    }
    for (const b of buildings) {
      const dx = Math.max(b.x - wx, 0, wx - (b.x + b.w)), dy = Math.max(b.y - wy, 0, wy - (b.y + b.h))
      k = Math.max(k, 1 - sstep(1.2, 3.4, Math.hypot(dx, dy)))
    }
    return k
  }

  // 建筑地基：目标高度取占地范围内自然地形平均值（解析采样，跨区块一致）
  const foundation = buildings.map(b => {
    let sum = 0, n = 0
    for (let sy = 0; sy <= 3; sy++) for (let sx = 0; sx <= 3; sx++) {
      const wx = b.x + b.w * sx / 3, wy = b.y + b.h * sy / 3
      sum += naturalHeight(seed, wx, wy, wetAt(wx, wy)); n++
    }
    return { b, target: Math.max(.06, sum / n) }
  })
  for (const f of farms) if (f.worksite) {
    let sum = 0, n = 0
    for (let a = 0; a < 8; a++) { const wx = f.cx + Math.cos(a) * 4, wy = f.cy + Math.sin(a) * 4; sum += naturalHeight(seed, wx, wy, wetAt(wx, wy)); n++ }
    foundation.push({ b: { kind: 'l10shed', x: f.cx - 5, y: f.cy - 3.5, w: 10, h: 7, deg: 0, key: f.key }, target: Math.max(.06, sum / n) })
  }

  // ---------------- 地表逐瓦片：高度、水体、地表材质
  for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
    const wx = WX + x + .5, wy = WY + y + .5, i = idx(x, y)
    const wl = wetAt(wx, wy)
    let h = wl < L10_LAKE_T ? -depthAt(wx, wy, wl) : naturalHeight(seed, wx, wy, wl)
    const plot = plotAt(wx, wy)
    const surf = sampleSurface(seed, wx, wy, plot, wl)
    // 作物地（麦茬土）/ 草地 / 干土，按覆盖度与噪声抖动分配，形成自然的舌状边缘
    const pick = valueNoise(seed, 0x1023, wx, wy, 3.2) * .7 + h01(seed, 0x1024, Math.floor(wx), Math.floor(wy)) * .3
    let t = surf.crop > .5 ? 50 : pick < surf.grass ? 45 : 44
    if (plot.use === 'fallow' && surf.edgeK > .6) t = pick < .2 ? 45 : 44
    if (plot.use === 'meadow' || plot.use === 'hay') t = pick < .9 ? 45 : 44
    // 湖岸：泥滩→潮湿岸
    if (wl < L10_LAKE_T + .028) { t = 48; wet[i] = 1 }
    else if (wl < L10_LAKE_T + .06 && pick < .55) t = 45
    // 院落：碾实土，靠边掺草
    const yk = yardK(wx, wy)
    if (yk > .5) t = pick < .14 * (1 - yk) * 2 ? 45 : 47
    // 道路：两道湿车辙夹一条草带
    const road = l10RoadInfo(seed, wx, wy)
    if (road.d < 3.25) {
      const cross = road.d
      t = cross > .72 && cross < 1.48 ? 46 : cross < .52 ? 45 : 47
      wet[i] = cross > .72 && cross < 1.48 ? 1 : 0
      h -= Math.max(0, 1 - road.d / 3.25) * .10
      if (cross > .72 && cross < 1.48) h -= .035 // 碾痕略低于草带
    }
    // 地基整平：占地内完全平整，外缘 2m 缓坡接回
    for (const fd of foundation) {
      const b = fd.b, small = b.kind === 'l10outhouse'
      const pad = small ? .4 : .9, apron = small ? 1 : 2.2
      const dx = Math.max(b.x - pad - wx, 0, wx - (b.x + b.w + pad)), dy = Math.max(b.y - pad - wy, 0, wy - (b.y + b.h + pad))
      const dist = Math.hypot(dx, dy)
      if (dist < apron) h += (fd.target - h) * (dist <= 0 ? 1 : smooth(1 - dist / apron))
    }
    // 建筑室内：不露天（挡雨、室内光照）；谷仓/马厩是夯土地，棚屋/外屋是木地板
    for (const b of buildings) {
      if (wx > b.x + .15 && wx < b.x + b.w - .15 && wy > b.y + .15 && wy < b.y + b.h - .15) {
        outdoor[i] = 0
        t = b.kind === 'l10shed' || b.kind === 'l10outhouse' ? 49 : 47
        wet[i] = 0
      }
    }
    if (wl < L10_LAKE_T) {
      liquid[i] = 1
      seaFloor[i] = Math.max(.04, -h)
      h = -seaFloor[i]
    }
    tint[i] = t
    terrain[i] = h
  }

  // ---------------- 树篱 / 树列：沿田块边界 1m 采样
  const trees: { x: number; y: number }[] = []
  const treeNear = (px: number, py: number, r: number) => trees.some(t => Math.hypot(t.x - px, t.y - py) < r)
  // 灌木高度一致（维基：不会竞相生长、高度似乎一致）；树列是树篱中每隔 6~9m 冒出一棵等高的树。
  for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
    const wx = WX + x + .5, wy = WY + y + .5
    const plot = l10PlotAt(seed, wx, wy)
    if (plot.edge > .62) continue
    const bk = boundaryKind(seed, plot.id, plot.nid)
    if (bk === 'open') continue
    const road = l10RoadInfo(seed, wx, wy)
    if (road.d < 4.6) continue
    const wl = wetAt(wx, wy)
    if (wl < L10_LAKE_T + .05 || yardK(wx, wy) > .05) continue
    if (buildings.some(b => inRect(wx, wy, b, 2.2))) continue
    // 豁口：沿边界每 ~9m 一格，约 15% 留出可穿行的缺口（2~3m 宽）
    const lo = Math.min(plot.id, plot.nid), hi = Math.max(plot.id, plot.nid)
    if (h01(seed, 0x1150, Math.floor(wx / 3), Math.floor(wy / 3), lo ^ hi) < .16) continue
    const tree = bk === 'treeline' && h01(seed, 0x1151, Math.floor(wx / 7), Math.floor(wy / 7)) < .5
      && mod(Math.floor(wx) * 7 + Math.floor(wy) * 13, 5) === 0
    if (tree && !treeNear(wx, wy, 5)) {
      trees.push({ x: wx, y: wy })
      add('l10tree', x + .2, y + .2, .6, .6, true, { v: h32(seed, 0x1031, Math.floor(wx), Math.floor(wy)) % 4, wind: 1, hedge: 1 })
      continue
    }
    add('hedgerow', x, y, 1, 1, true, { node: 1, wind: 1, v: h32(seed, 0x1152, Math.floor(wx), Math.floor(wy)) % 997 })
  }

  // ---------------- 建筑（只在含其中心的区块生成结构；地基/院落已跨区块整平）
  const ownsPoint = (px: number, py: number) => Math.floor(px / CS) === cx && Math.floor(py / CS) === cy
  for (const b of buildings) {
    const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2
    if (!ownsPoint(bcx, bcy)) continue
    add(b.kind, b.x - WX, b.y - WY, b.w, b.h, true, { deg: b.deg, v: b.key % 4, material: 'weathered_wood' })
    // 内部只有木材与钉子（维基）：本地坐标 → 世界
    const lw = b.deg % 180 ? b.h : b.w, ld = b.deg % 180 ? b.w : b.h
    const toWorld = (lx: number, lz: number) => {
      const a = b.deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
      return { x: bcx + lx * c + lz * s, y: bcy - lx * s + lz * c }
    }
    if (b.kind === 'l10outhouse') continue
    const lootSpots = b.kind === 'barn' ? [[-lw / 2 + 1.6, -ld / 2 + 1.4], [lw / 2 - 2.2, -ld / 2 + 1.5]]
      : b.kind === 'l10stable' ? [[-lw / 2 + 1.2, -ld / 2 + 1.0]]
        : [[lw / 2 - 1.1, -ld / 2 + .9]]
    lootSpots.forEach(([lx, lz], n) => {
      const p = toWorld(lx, lz)
      const kind = n === 0 ? 'toolbox' : 'crate'
      const sz = kind === 'crate' ? 1.2 : .9
      add(kind, p.x - sz / 2 - WX, p.y - sz / 2 - WY, sz, sz, true, { loot: 1, lootItems: ['timber', 'nails'], l10Interior: 1 })
    })
  }
  for (const f of farms) {
    if (!f.worksite || !ownsPoint(f.cx, f.cy)) continue
    add('l10worksite', f.cx - 5 - WX, f.cy - 3.5 - WY, 10, 7, false, { interactive: 1, temporary: 1 })
    add('table', f.cx - 3 - WX, f.cy - 1.5 - WY, 2.2, 1.1, true, { folding: 1 })
    add('toolbox', f.cx + 1 - WX, f.cy - 1.5 - WY, 1, 1, true, { loot: 1, lootItems: ['nails', 'timber'] })
  }
  // 院落里的干草堆与木料垛（静态实心）
  for (const f of farms) {
    if (f.worksite || !ownsPoint(f.cx, f.cy)) continue
    const n = 2 + (f.key % 3)
    for (let k = 0; k < n; k++) {
      const a = h01(seed, 0x1160, f.key, k) * Math.PI * 2, r = .45 + h01(seed, 0x1161, f.key, k) * .35
      const px = f.cx + Math.cos(a) * f.rx * r, py = f.cy + Math.sin(a) * f.ry * r
      if (buildings.some(b => inRect(px, py, b, 1.6)) || occupied(px, py, 1.2)) continue
      if (l10RoadInfo(seed, px, py).d < 4) continue
      const round = k % 2 === 0
      const bw = round ? 1.5 : .95, bd = round ? 1.5 : .8
      add('l10haybale', px - bw / 2 - WX, py - bd / 2 - WY, bw, bd, true, {
        height: round ? 1.25 : .62, round: round ? 1 : 0, deg: Math.floor(h01(seed, 0x1162, f.key, k) * 360),
      })
    }
  }

  // ---------------- 干草场：割过的草地上散落圆捆（每块干草场 3~6 个，属于站点所在区块）
  {
    const seen = new Set<number>()
    for (let y = 2; y < CS; y += 8) for (let x = 2; x < CS; x += 8) {
      const p = plotAt(WX + x, WY + y)
      if (p.use !== 'hay' || seen.has(p.id)) continue
      seen.add(p.id)
      const site = plotSite(seed, p.i, p.j)
      const n = 3 + (h32(seed, 0x1170, p.i, p.j) % 4)
      for (let k = 0; k < n; k++) {
        const along = (k - (n - 1) / 2) * 5.5
        const px = site.x + Math.cos(p.dir) * along + (h01(seed, 0x1171, p.i, p.j, k) - .5) * 2
        const py = site.y + Math.sin(p.dir) * along + (h01(seed, 0x1172, p.i, p.j, k) - .5) * 2
        if (!ownsPoint(px, py)) continue
        const q = l10PlotAt(seed, px, py)
        if (q.id !== p.id || q.edge < 2.5 || l10RoadInfo(seed, px, py).d < 5 || wetAt(px, py) < L10_LAKE_T + .06) continue
        if (occupied(px, py, 1.4) || buildings.some(b => inRect(px, py, b, 2))) continue
        add('l10haybale', px - .75 - WX, py - .75 - WY, 1.5, 1.5, true, {
          height: 1.25, round: 1, deg: Math.floor(h01(seed, 0x1173, p.i, p.j, k) * 360),
        })
      }
    }
  }

  // ---------------- 作物：4×4m 覆盖块，每块携带所在田块的品种、播种方向与覆盖度
  // 密度直接取四角+中心的覆盖度平均，所以田埂、湖岸与院落边缘都是由疏到无的自然渐变。
  for (let y = 0; y < CS; y += 4) for (let x = 0; x < CS; x += 4) {
    const wx = WX + x + 2, wy = WY + y + 2
    let cov = 0, n = 0, wheat = 0, barley = 0, canola = 0, dir = 0, anyLake = false
    let plotKey = 0
    const corner: number[] = []
    for (const [ox, oy] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5], [0, 0]]) {
      const px = wx + ox, py = wy + oy
      const wl = wetAt(px, py)
      if (wl < L10_LAKE_T + .03) anyLake = true
      if (wl < L10_LAKE_T + .012) { cov = -99; break }
      const p = plotAt(px, py)
      const s = sampleSurface(seed, px, py, p, wl)
      let c = s.crop * (1 - yardK(px, py))
      if (l10RoadInfo(seed, px, py).d < 3.6) c = 0
      if (buildings.some(b => inRect(px, py, b, 1.2))) c = 0
      cov += c; n++
      if (ox !== 0) corner.push(c)
      if (ox === 0) { dir = p.dir; plotKey = p.id }
      if (p.use === 'wheat') wheat += c; else if (p.use === 'barley') barley += c; else if (p.use === 'canola') canola += c
    }
    cov /= n
    if (anyLake && cov < .3) continue
    if (cov < .06) continue
    if (structures.some(s => s.kind === 'l10haybale' && s.x < wx + 2 && s.x + s.w > wx - 2 && s.y < wy + 2 && s.y + s.h > wy - 2)) continue
    const species = canola > wheat && canola > barley ? 2 : barley > wheat ? 1 : 0
    add('wheatpatch', x, y, 4, 4, false, {
      barley: species === 1 ? 1 : 0,
      canola: species === 2 ? 1 : 0,
      density: Math.round(.94 * Math.max(.1, cov) * 1000) / 1000,
      transition: cov < .82 ? 1 : 0,
      dir: Math.round(dir * 1000) / 1000,
      // 四角覆盖度（-x-y, +x-y, -x+y, +x+y）：渲染器逐株双线性插值，块内也能由密到疏
      q0: Math.round(corner[0] * 100) / 100, q1: Math.round(corner[1] * 100) / 100,
      q2: Math.round(corner[2] * 100) / 100, q3: Math.round(corner[3] * 100) / 100,
      plot: plotKey % 100000,
      wind: 1,
    })
  }

  // ---------------- 湖畔与农舍旁的孤树（同样等高）
  for (let wy = Math.ceil(WY / 12) * 12; wy < WY + CS; wy += 12) for (let wx = Math.ceil(WX / 12) * 12; wx < WX + CS; wx += 12) {
    const jx = wx + (h01(seed, 0x1180, wx, wy) - .5) * 7, jy = wy + (h01(seed, 0x1181, wx, wy) - .5) * 7
    const wl = wetAt(jx, jy)
    const nearShore = wl > L10_LAKE_T + .02 && wl < L10_LAKE_T + .07
    const nearFarm = farms.some(f => !f.worksite && Math.hypot((jx - f.cx) / (f.rx + 7), (jy - f.cy) / (f.ry + 7)) < 1 && Math.hypot((jx - f.cx) / f.rx, (jy - f.cy) / f.ry) > .95)
    if (!(nearShore && h01(seed, 0x1182, wx, wy) < .45) && !(nearFarm && h01(seed, 0x1183, wx, wy) < .5)) continue
    if (l10RoadInfo(seed, jx, jy).d < 6 || treeNear(jx, jy, 5) || occupied(jx, jy, 1.2) || buildings.some(b => inRect(jx, jy, b, 3))) continue
    trees.push({ x: jx, y: jy })
    add('l10tree', jx - .3 - WX, jy - .3 - WY, .6, .6, true, { v: h32(seed, 0x1031, Math.floor(jx), Math.floor(jy)) % 4, wind: 1 })
  }

  // ---------------- 旧挖掘点：局部、可持久化事件；不会开放自由挖地
  if (h01(seed, 0x1050, cx, cy) < .014) {
    const x = 7 + h32(seed, 0x1051, cx, cy) % 18, y = 7 + h32(seed, 0x1052, cx, cy) % 18
    const wx = WX + x, wy = WY + y
    if (l10RoadInfo(seed, wx, wy).d > 6 && wetAt(wx, wy) > L10_LAKE_T + .08 && !occupied(wx, wy, 2) && !buildings.some(b => inRect(wx, wy, b, 3)))
      add('l10digsite', x - 1, y - 1, 2, 2, false, { interactive: 1, dug: 0 })
  }

  // ---------------- 可收割的麦穗极少
  if (h01(seed, 0x1060, cx, cy) < .06) {
    const x = 5 + h32(seed, 0x1061, cx, cy) % 22, y = 5 + h32(seed, 0x1062, cx, cy) % 22
    const wx = WX + x + .5, wy = WY + y + .5
    if (l10RoadInfo(seed, wx, wy).d > 5 && liquid[idx(x, y)] === 0 && plotAt(wx, wy).use !== 'meadow')
      items.push({ id: GEN_ITEM_BASE + (h32(seed, 0x1063, cx, cy, itemN++) & 0xfffff), type: 'wheatgrain', x: wx, y: wy })
  }

  // ---------------- 深湖出口：每个 96m 宏格最深点（水深 > 4.6m）一个 Level 7 入口
  {
    const ex = exitOf(def, 'lakeswim')
    if (ex) {
      if (F?.lake === 'deeplake') exits.push({ def: ex, x: WX + 16, y: WY + 16, z: -2.8, discovered: false })
      else if (!F) {
        for (let lb = Math.floor(WY / LAKE_CELL); lb <= Math.floor((WY + CS - 1) / LAKE_CELL); lb++)
          for (let la = Math.floor(WX / LAKE_CELL); la <= Math.floor((WX + CS - 1) / LAKE_CELL); la++) {
            const p = l10DeepLakeExit(seed, la, lb)
            if (p && ownsPoint(p.x, p.y)) exits.push({ def: ex, x: p.x, y: p.y, z: -2.8, discovered: false })
          }
      }
    }
  }

  // ---------------- 每个 16×16 超区域一个土路尽头
  const rx = Math.floor(cx / 16), ry = Math.floor(cy / 16), end = longRoadPoint(seed, rx, ry)
  if (Math.floor(end.x / CS) === cx && Math.floor(end.y / CS) === cy) {
    const ex = exitOf(def, 'longroad')
    if (ex) exits.push({ def: ex, x: end.x, y: end.y, discovered: false })
  }

  return { variant, tiles, wet, elev, step, tint, crawl, outdoor, ceiling, liquid, seaFloor, terrain, structures, items, lights, exits, entities }
}

registerInfiniteLevel(10, {
  genRaw: genL10ChunkRaw,
  variantOf: l10VariantOf,
  rareVariants: L10_RARE_VARIANTS,
  variantNames: L10_VARIANT_NAMES,
  variantLore: L10_VARIANT_LORE,
  spawnWorld: L10_L9_SPAWN,
  spawnFloor: 0,
  regionExitPos: (seed, rx, ry) => {
    // HUD 超区域以 8×8 chunk 计；两组 HUD 区域映射到同一 16×16 路线终点。
    return l10RegionExitPoint(seed, Math.floor(rx / 2), Math.floor(ry / 2))
  },
})
