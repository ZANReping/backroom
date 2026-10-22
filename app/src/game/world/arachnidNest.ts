// L8 蛛形纲重制——阶段 3：L8 生成接入 + 符文蛛巢区（runenest 环境）。
// 设计原则：
// - 蛛巢的选址只由 (seed, cx, cy) 的哈希与洞穴余量场决定，生成器（填种群）与运行时（网、茧、危险区、渲染）
//   各自调用同一个纯函数 arachnidNestOfChunk 得到完全相同的描述，不需要往 chunk raw 里塞新结构种类。
// - 这里的随机数全部来自独立哈希 RNG，不消耗 genL8ChunkRaw 的 rng 序列：接入前后其它生成内容的位置不变。
// - 坐标：本文件里的 x/y 一律是世界坐标（不随无限窗口平移）；运行时用 inf.ox/oy 换算成窗口坐标。
import { RNG } from '../core/rng'
import { h32 } from './infiniteSeed'
import type { GenChunk } from './infiniteRegistry'
import {
  l8CaveMarginAt, l8AvenueDistanceAt, l8LakeDistanceAt, l8RoofAt, l8GroundAt, l8VariantOf,
  L8_ORIGIN, L8_LAKE_BANK_RADIUS, type L8Variant,
} from './infiniteL8'
import { ARACHNID_STATS, type ArachnidKind } from '../engine/arachnidStats'

const CS = 32
const h01 = (...n: number[]) => h32(...n) / 4294967296

/** 蛛巢区出现概率（每个合格 chunk） */
export const ARACHNID_NEST_CHANCE = 0.035
/** 危险区半径（m，以巢心为圆心）；微光向导等系统据此避开 */
export const ARACHNID_NEST_RADIUS = 6.5
/** 只在这些洞系出现（多维之路与巨臂林地有自己的生态，不放蛛巢） */
const NEST_VARIANTS: readonly L8Variant[] = ['phreatic', 'vadose', 'breakdown', 'rottnest', 'movile']

export interface ArachnidNestDesc {
  id: string
  cx: number; cy: number
  /** 巢角（贴墙点，世界坐标） */
  x: number; y: number
  /** 朝洞内的单位方向（巢网从墙角向这个方向铺开） */
  dx: number; dy: number
  /** 巢心（危险区圆心） */
  zx: number; zy: number
  r: number
  seed: number
  /** 洞穴余量（巢心处），决定能不能住极巨蛛 */
  margin: number
  /** 可拆的人形茧 */
  cocoons: { id: string; x: number; y: number; rot: number }[]
  /** 巢区内的固定网（减速陷阱） */
  webs: { id: string; x: number; y: number; nx: number; ny: number }[]
}

const NEST_CACHE = new Map<string, ArachnidNestDesc | null>()

/** 某个 chunk 有没有蛛巢；有则返回完整描述（纯函数，带缓存） */
export function arachnidNestOfChunk(seed: number, cx: number, cy: number, variant?: string): ArachnidNestDesc | null {
  const key = `${seed}:${cx},${cy}`
  const hit = NEST_CACHE.get(key)
  if (hit !== undefined) return hit
  if (NEST_CACHE.size > 4000) NEST_CACHE.clear()
  const res = computeNest(seed, cx, cy, (variant as L8Variant | undefined) ?? l8VariantOf(seed, cx, cy))
  NEST_CACHE.set(key, res)
  return res
}

function computeNest(seed: number, cx: number, cy: number, variant: L8Variant): ArachnidNestDesc | null {
  if (!NEST_VARIANTS.includes(variant)) return null
  if (Math.abs(cx) + Math.abs(cy) < 3) return null // 出生湖厅附近不放
  if (h01(seed, 0xa8a0, cx, cy) >= ARACHNID_NEST_CHANCE) return null
  const WX = cx * CS, WY = cy * CS
  const R = new RNG(h32(seed, 0xa8a1, cx, cy))
  const M = (x: number, y: number) => l8CaveMarginAt(seed, x, y)
  // 候选点：4m 网格 + 抖动，按哈希打乱后取第一个合格的
  const cand: [number, number][] = []
  for (let gy = 3; gy < CS - 3; gy += 3) for (let gx = 3; gx < CS - 3; gx += 3) cand.push([WX + gx + R.next() * 2, WY + gy + R.next() * 2])
  R.shuffle(cand)
  for (const [x, y] of cand) {
    const m0 = M(x, y)
    if (m0 < 0.45 || m0 > 1.25) continue // 要贴着岩壁
    if (l8AvenueDistanceAt(seed, x, y) < 6 || l8LakeDistanceAt(x, y) < L8_LAKE_BANK_RADIUS + 5) continue
    if (Math.hypot(x - L8_ORIGIN.x, y - L8_ORIGIN.y) < 40) continue
    let gx = M(x + 0.4, y) - M(x - 0.4, y), gy = M(x, y + 0.4) - M(x, y - 0.4)
    const gl = Math.hypot(gx, gy)
    if (gl < 1e-4) continue
    gx /= gl; gy /= gl
    const zx = x + gx * 2.6, zy = y + gy * 2.6
    const mz = M(zx, zy)
    if (mz < 2.2) continue // 巢前要有一片开阔洞厅
    if (Math.floor(zx / CS) !== cx || Math.floor(zy / CS) !== cy) continue
    const roof = l8RoofAt(seed, zx, zy) - l8GroundAt(seed, zx, zy)
    if (roof < 2.6) continue
    const id = `an:${cx},${cy}`
    const corner = { x: x - gx * Math.max(0, m0 - 0.15), y: y - gy * Math.max(0, m0 - 0.15) }
    // 茧：沿墙两侧各一个 + 巢前一个
    const tx = -gy, ty = gx
    const cocoons = [
      { id: `${id}:c0`, x: corner.x + gx * 0.9 + tx * 1.7, y: corner.y + gy * 0.9 + ty * 1.7, rot: R.next() * 6.28 },
      { id: `${id}:c1`, x: corner.x + gx * 0.9 - tx * 1.8, y: corner.y + gy * 0.9 - ty * 1.8, rot: R.next() * 6.28 },
      { id: `${id}:c2`, x: corner.x + gx * 2.2 + tx * 0.5, y: corner.y + gy * 2.2 + ty * 0.5, rot: R.next() * 6.28 },
    ].filter((c) => M(c.x, c.y) > 0.35)
    // 网：巢区外圈三张，横在来路上（网面法线沿着通向巢心的方向）
    const webs: ArachnidNestDesc['webs'] = []
    for (let k = 0; k < 6 && webs.length < 3; k++) {
      const a = Math.atan2(gy, gx) + (R.next() - 0.5) * 2.6
      const rr = 3.6 + R.next() * 1.8
      const wx = zx + Math.cos(a) * rr, wy = zy + Math.sin(a) * rr
      if (M(wx, wy) < 0.6) continue
      webs.push({ id: `${id}:w${k}`, x: wx, y: wy, nx: Math.cos(a), ny: Math.sin(a) })
    }
    return { id, cx, cy, x: corner.x, y: corner.y, dx: gx, dy: gy, zx, zy, r: ARACHNID_NEST_RADIUS, seed: h32(seed, 0xa8a2, cx, cy) % 997, margin: mz, cocoons, webs }
  }
  return null
}

// ======================================================================
// 生成：野外种群 + 蛛巢守卫
// ======================================================================
type RawEntity = GenChunk['entities'][number]

/** 各洞系的野外变种权重乘数（不写的按 1；符文变种只在这里以极低权重出现，主要靠蛛巢） */
const ECO_MUL: Partial<Record<L8Variant, Partial<Record<ArachnidKind, number>>>> = {
  phreatic: { diving: 2.2, weaver: 1.2, tick: 0.6 },
  vadose: { weaver: 1.6, blindcave: 1.3, wolf: 1.1 },
  breakdown: { cavescorpion: 2, whipscorpion: 2, jumper: 1.3, weaver: 0.5 },
  hyperspace: { blindcave: 1.5, mitecloud: 1.4, harvestman: 1.4, colossus: 0, wolf: 0.6 },
  rottnest: { tick: 2, mitecloud: 2, harvestman: 2, broodswarm: 1.4 },
  movile: { mitecloud: 1.6, harvestman: 1.6, whipscorpion: 1.2 },
  handyland: { wolf: 1.4, jumper: 1.4, colossus: 0 },
}
/** 野外每个 chunk 出现一群蛛形纲的概率 */
const WILD_CHANCE: Record<L8Variant, number> = { phreatic: 0.24, vadose: 0.26, breakdown: 0.3, hyperspace: 0.16, rottnest: 0.12, movile: 0.1, handyland: 0.08 }

export function arachnidWildWeights(variant: L8Variant, nearLake: boolean): { v: ArachnidKind; w: number }[] {
  return (Object.keys(ARACHNID_STATS) as ArachnidKind[]).map((k) => {
    let w = ARACHNID_STATS[k].weight * (ECO_MUL[variant]?.[k] ?? 1)
    if (k === 'diving') w *= nearLake ? 3 : 0.25
    return { v: k, w }
  }).filter((e) => e.w > 0)
}

/** 旧「只换皮」数据（arachnidMorph / herbivore）→ 新变种。旧存档、旧生成调用都走这里 */
export function legacyArachnidKind(morph: string | undefined, herbivore: boolean, hash: number): ArachnidKind {
  const u = (hash % 1000) / 1000
  if (morph === 'mite') return 'mitecloud'
  if (morph === 'tick') return 'tick'
  if (morph === 'scorpion') return u < 0.6 ? 'cavescorpion' : 'whipscorpion'
  if (herbivore) return u < 0.55 ? 'harvestman' : u < 0.8 ? 'weaver' : 'wolf'
  return u < 0.32 ? 'wolf' : u < 0.54 ? 'weaver' : u < 0.74 ? 'jumper' : u < 0.9 ? 'blindcave' : 'broodswarm'
}

/** 蛛巢守卫：符文强化变种（极巨蛛只住得下开阔的巢） */
function nestGuards(n: ArachnidNestDesc, R: RNG): ArachnidKind[] {
  const pool: { v: ArachnidKind; w: number }[] = [
    { v: 'widow', w: 3 }, { v: 'regen', w: 3 }, { v: 'undying', w: 2 }, { v: 'fireproof', w: 2 }, { v: 'anoxic', w: 2 },
    { v: 'colossus', w: n.margin >= 3.2 ? 2.2 : 0 },
  ]
  const out: ArachnidKind[] = [R.weighted(pool)]
  if (R.chance(0.55)) out.push(R.weighted(pool.filter((p) => p.v !== 'colossus')))
  return out
}

export interface ArachnidChunkCtx {
  tiles: Uint8Array
  liquid: Uint8Array
  entities: RawEntity[]
  solidAt: (wx: number, wy: number) => boolean
}

/**
 * genL8ChunkRaw 的接入钩子：在本 chunk 里补野外蛛形纲种群；若本 chunk 是蛛巢区，再补守巢种群。
 * 只往 ctx.entities 里追加（世界坐标），不改瓦片，不消耗生成器 rng。
 */
export function arachnidL8Chunk(seed: number, cx: number, cy: number, variant: string, ctx: ArachnidChunkCtx) {
  const v = variant as L8Variant
  const R = new RNG(h32(seed, 0xa8b0, cx, cy))
  const WX = cx * CS, WY = cy * CS
  const ok = (wx: number, wy: number, minMargin = 0.9) => {
    const lx = Math.floor(wx - WX), ly = Math.floor(wy - WY)
    if (lx < 1 || ly < 1 || lx >= CS - 1 || ly >= CS - 1) return false
    const i = ly * CS + lx
    if (ctx.tiles[i] !== 1 || ctx.liquid[i] === 1 || ctx.solidAt(wx, wy)) return false
    if (Math.hypot(wx - L8_ORIGIN.x, wy - L8_ORIGIN.y) < 9) return false
    return l8CaveMarginAt(seed, wx, wy) >= minMargin
  }
  const spotNear = (x: number, y: number, rad: number, minMargin = 0.9): { x: number; y: number } | null => {
    for (let t = 0; t < 30; t++) {
      const a = R.next() * Math.PI * 2, r = Math.sqrt(R.next()) * rad
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
      if (ok(px, py, minMargin)) return { x: Math.floor(px) + 0.5, y: Math.floor(py) + 0.5 }
    }
    return null
  }
  const push = (kind: ArachnidKind, p: { x: number; y: number }, extra: Partial<RawEntity> = {}) =>
    ctx.entities.push({ type: 'arachnid', x: p.x, y: p.y, arachnidVariant: kind, ...extra })
  // 野外
  if (Math.abs(cx) + Math.abs(cy) >= 2 && R.chance(WILD_CHANCE[v] ?? 0.2)) {
    const nearLake = l8LakeDistanceAt(WX + CS / 2, WY + CS / 2) < 48
    const kind = R.weighted(arachnidWildWeights(v, nearLake))
    const stat = ARACHNID_STATS[kind]
    const base = spotNear(WX + CS / 2, WY + CS / 2, CS * 0.45, stat.minMargin ?? 1.0)
    if (base) {
      const n = stat.flags.swarm || stat.flags.runic ? 1 : kind === 'tick' ? R.int(1, 3) : R.int(1, 2)
      for (let k = 0; k < n; k++) {
        const p = k === 0 ? base : spotNear(base.x, base.y, 3, stat.minMargin ?? 0.9)
        if (p) push(kind, p, kind === 'broodswarm' ? { arachnidMother: R.chance(0.35) ? 1 : undefined } : {})
      }
    }
  }
  // 蛛巢区
  const nest = arachnidNestOfChunk(seed, cx, cy, v)
  if (nest) {
    for (const g of nestGuards(nest, R)) {
      const p = spotNear(nest.zx, nest.zy, 2.2, ARACHNID_STATS[g].minMargin ?? 0.9)
      if (p) push(g, p, { arachnidNest: nest.id })
    }
    for (let k = 0; k < 2; k++) { const p = spotNear(nest.zx, nest.zy, 4.5); if (p) push('weaver', p, { arachnidNest: nest.id }) }
    const b = spotNear(nest.x + nest.dx * 1.4, nest.y + nest.dy * 1.4, 1.5, 0.6)
    if (b) push('broodswarm', b, { arachnidNest: nest.id, arachnidMother: 1 })
  }
}

/** 运行时：当前已加载 chunk 里的全部蛛巢（世界坐标描述） */
export function arachnidNestsLoaded(inf: { seed: number; chunks: Map<string, { cx: number; cy: number; variant?: string }> }): ArachnidNestDesc[] {
  const out: ArachnidNestDesc[] = []
  for (const c of inf.chunks.values()) { const n = arachnidNestOfChunk(inf.seed, c.cx, c.cy, c.variant); if (n) out.push(n) }
  return out
}

/** 从世界坐标 (wx, wy) 起按 chunk 螺旋找最近的蛛巢（开发者传送 / 验收用） */
export function findNearestArachnidNest(seed: number, wx: number, wy: number, maxR = 40): ArachnidNestDesc | null {
  const c0x = Math.floor(wx / CS), c0y = Math.floor(wy / CS)
  for (let r = 0; r <= maxR; r++) {
    let best: ArachnidNestDesc | null = null, bd = 1e18
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
      const n = arachnidNestOfChunk(seed, c0x + dx, c0y + dy)
      if (n) { const d = Math.hypot(n.zx - wx, n.zy - wy); if (d < bd) { bd = d; best = n } }
    }
    if (best) return best
  }
  return null
}
