// 迷彩爬行者（Entity 31）重制阶段 3：成组贴壁的生成布局。
// 纯函数、零运行时依赖——既给 chunk 生成器（可能跑在 Web Worker 里）用，也给运行时 AI 找回壁点用。
// 坐标约定与引擎一致：x/y 为水平面，h 为高度。场用「柱」工厂表示：column(x, y) 返回该水平点上 h → 场值的函数，
// > 0 为洞内空腔，<= 0 为岩体；同一点的几个高度共用一次柱采样（L8 的柱计算是主要开销）。
export type CamoColumn = (x: number, y: number) => (h: number) => number

/** 生成参数（数值表见 app/CAMO-REMAKE.md） */
export const CAMO_PACK = {
  /** 每组个体数 */
  MIN: 2, MAX: 3,
  /** 组员离组锚点的最远距离（m）：同组分散在附近的岩壁上 */
  SPREAD: 7,
  /** 组员之间的最小间距（m） */
  GAP: 1.8,
  /** 实体中心离岩面的距离（m）：模型空间里背后的墙在 x=-0.34，再留 0.06 的皮肤余量 */
  CLING_OFF: 0.4,
  /** 找墙时沿 16 个方向向外步进的最远距离（m） */
  WALL_REACH: 3.2,
  /** 测墙的三个高度（离地 m）：取最近的一处，保证躯干任何部位都不会插进岩里 */
  PROBE_H: [0.55, 1.05, 1.5] as readonly number[],
  /** 贴壁点与锚点的地面高差上限（m） */
  MAX_RISE: 0.7,
} as const

export interface CamoSpot { x: number; y: number; facing: number }

/** 32 位整数哈希 → [0,1) 随机数发生器（mulberry32），生成器内部用，不消耗调用方 RNG 序列 */
export function camoRand(seed: number): () => number {
  let a = (seed >>> 0) || 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RING = Array.from({ length: 10 }, (_, k) => (k / 10) * Math.PI * 2)
const FAN = [0, -0.4, 0.4, -0.8, 0.8]
/** 从 (x, y) 沿 dirs 个方向、在离地 PROBE_H 的三个高度上步进，返回最近岩面的方向与距离（找不到 = Infinity） */
function nearestWall(x: number, y: number, g: number, field: CamoColumn, reach: number, angles: readonly number[], step: number, hs: readonly number[] = CAMO_PACK.PROBE_H, start = step) {
  let best = Infinity, bx = 0, by = 0
  const solid = (f: (h: number) => number) => hs.some((h) => f(g + h) <= 0)
  for (const a of angles) {
    const dx = Math.cos(a), dy = Math.sin(a)
    if (solid(field(x + dx * Math.max(0.02, start - step), y + dy * Math.max(0.02, start - step)))) continue // 起点已在岩里：这个方向不可信
    for (let s = start; s <= reach && s < best; s += step) {
      if (!solid(field(x + dx * s, y + dy * s))) continue
      // 二分细化到 ~1cm
      let lo = s - step, hi = s
      for (let n = 0; n < 3; n++) { const mid = (lo + hi) / 2; if (solid(field(x + dx * mid, y + dy * mid))) hi = mid; else lo = mid }
      if (hi < best) { best = hi; bx = dx; by = dy }
      break
    }
  }
  return { d: best, dx: bx, dy: by }
}

/**
 * 从 (x, y) 出发找最近的岩壁，返回贴壁点（背后最近的岩面恰好离中心 CLING_OFF）与朝向（背对岩壁 = 朝洞内）。
 * 洞壁是圆角的三维岩体，贴近后脚下地面会抬高、要测的高度跟着变，所以在贴壁点上再迭代修正三次。找不到返回 null。
 */
export function camoWallSpot(x: number, y: number,
  field: CamoColumn,
  ground: (x: number, y: number) => number,
  ok: (x: number, y: number) => boolean,
  reach: number = CAMO_PACK.WALL_REACH): CamoSpot | null {
  const g0 = ground(x, y)
  const w0 = nearestWall(x, y, g0, field, reach, RING, 0.3, [1.05])
  if (!Number.isFinite(w0.d)) return null
  let sx = x + w0.dx * Math.max(0, w0.d - CAMO_PACK.CLING_OFF), sy = y + w0.dy * Math.max(0, w0.d - CAMO_PACK.CLING_OFF)
  let nx = -w0.dx, ny = -w0.dy, dmin = Infinity
  for (let it = 0; it < 3; it++) {
    // 只在当前法线反方向 ±60° 的扇面里细测，并从 0.2m 起步（墙就在 0.4m 附近）
    const back = Math.atan2(-ny, -nx)
    const w = nearestWall(sx, sy, ground(sx, sy), field, 1.1, FAN.map((d) => back + d), 0.1, CAMO_PACK.PROBE_H, 0.2)
    if (!Number.isFinite(w.d)) return null
    dmin = w.d; nx = -w.dx; ny = -w.dy
    const move = dmin - CAMO_PACK.CLING_OFF
    if (Math.abs(move) < 0.03) break
    sx -= nx * move; sy -= ny * move
  }
  if (Math.abs(dmin - CAMO_PACK.CLING_OFF) > 0.12 || !ok(sx, sy)) return null
  if (Math.abs(ground(sx, sy) - g0) > CAMO_PACK.MAX_RISE) return null
  // 身前要有站得开的空腔（不是窄缝）
  if (field(sx + nx * 0.7, sy + ny * 0.7)(ground(sx, sy) + 1.05) <= 0) return null
  return { x: sx, y: sy, facing: Math.atan2(ny, nx) }
}

/**
 * 一组迷彩爬行者的贴壁位置。anchor 是组锚点（洞底空地），seed 决定组规模与散布，确定性。
 * 返回 2–3 个点；附近墙面凑不够 2 个时返回空数组。
 */
export function camoPackSpots(seed: number, anchor: { x: number; y: number },
  ok: (x: number, y: number) => boolean,
  field: CamoColumn,
  ground: (x: number, y: number) => number,
  count?: number): CamoSpot[] {
  const R = camoRand(seed)
  // 一组之内反复测同一片岩面：按 1cm 网格缓存柱采样
  const memo = new Map<number, (h: number) => number>()
  const raw = field
  field = (x, y) => {
    const k = Math.round(x * 100) * 1000003 + Math.round(y * 100)
    let f = memo.get(k)
    if (!f) { f = raw(x, y); memo.set(k, f) }
    return f
  }
  const n = count ?? (CAMO_PACK.MIN + Math.floor(R() * (CAMO_PACK.MAX - CAMO_PACK.MIN + 1)))
  const out: CamoSpot[] = []
  for (let t = 0; t < 40 && out.length < n; t++) {
    const a = R() * Math.PI * 2, r = t === 0 ? 0 : 1 + R() * (CAMO_PACK.SPREAD - 1)
    const px = anchor.x + Math.cos(a) * r, py = anchor.y + Math.sin(a) * r
    if (!ok(px, py) || out.some((q) => Math.hypot(q.x - px, q.y - py) < CAMO_PACK.GAP * 0.6)) continue
    const s = camoWallSpot(px, py, field, ground, ok)
    if (!s) continue
    if (Math.hypot(s.x - anchor.x, s.y - anchor.y) > CAMO_PACK.SPREAD + 1.5) continue
    if (out.some((q) => Math.hypot(q.x - s.x, q.y - s.y) < CAMO_PACK.GAP)) continue
    out.push(s)
  }
  // 凑不够一组（2 只）就整组放弃：迷彩爬行者只成群出现，调用方可换一个锚点再试
  return out.length >= CAMO_PACK.MIN ? out : []
}
