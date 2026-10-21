// 死亡飞蛾巢穴登记（Entity 4 重制·第 3 阶段）：主巢（L5 贝弗利室旁育幼巢）+ 稀有卫星巢（L2/L3/L8/L9 墙角小巢）。
// 巢描述保存在 inf.mothNests（世界坐标，随 chunk 实例化登记，卸载不删除），AI 与渲染层共用 nestProps() 得到确定性的道具摆位。
import type { InfiniteState } from './infinite'
import { l5NestLayout } from './infiniteL5'

export interface MothNestDesc {
  id: string
  kind: 'main' | 'sat'
  /** 巢心（世界坐标，瓦片中心） */
  cx: number; cy: number
  /** 主巢：房间内部矩形（含边界瓦片）与门；卫星巢：墙角瓦片 + 两面墙的方向 */
  x0: number; y0: number; x1: number; y1: number
  doorX?: number; doorY?: number
  /** 卫星巢墙角：两面贴墙方向（'w' | 'e' | 'n' | 's'） */
  walls?: ('w' | 'e' | 'n' | 's')[]
  seed: number
}
/** 巢道具（世界坐标 x/y = 地图平面，h = 离地高度）。eggs = 卵粒数（可被打破的目标） */
export interface MothNestProp {
  key: string; kind: 'coat' | 'sac' | 'pillar' | 'door' | 'floor'
  x: number; y: number; h: number
  /** 贴墙道具朝向：墙面法线方向（世界平面单位向量） */
  nx: number; ny: number
  w: number; ht: number; r: number; eggs: number
}

/** 卫星巢生成概率（每 chunk） */
export const SAT_NEST_CHANCE: Record<number, number> = { 2: 0.04, 3: 0.05, 8: 0.06, 9: 0.03 }

const hash = (seed: number, a: number, b: number, c = 0) => {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(a, 0xc2b2ae35) ^ Math.imul(b, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

/**
 * 在一个 chunk 的瓦片里找卫星巢墙角（tiles: 1=地板 0=墙，CS×CS，chunk 原点世界坐标 WX/WY）。
 * 优先离 chunk 中心近、两面相邻为墙且对角开阔的地板瓦片。返回 null 表示本 chunk 没有巢。
 */
export function findSatelliteNest(levelId: number, seed: number, cx: number, cy: number, tiles: Uint8Array, CS: number): MothNestDesc | null {
  const p = SAT_NEST_CHANCE[levelId]
  if (!p || hash(seed, cx, cy, 0x4d07) >= p) return null
  const fl = (x: number, y: number) => x >= 0 && y >= 0 && x < CS && y < CS && tiles[y * CS + x] === 1
  let best: { x: number; y: number; walls: ('w' | 'e' | 'n' | 's')[]; score: number } | null = null
  for (let y = 3; y < CS - 3; y++) for (let x = 3; x < CS - 3; x++) {
    if (!fl(x, y)) continue
    const walls: ('w' | 'e' | 'n' | 's')[] = []
    if (!fl(x - 1, y)) walls.push('w'); if (!fl(x + 1, y)) walls.push('e'); if (!fl(x, y - 1)) walls.push('n'); if (!fl(x, y + 1)) walls.push('s')
    if (walls.length !== 2 || (walls.includes('w') && walls.includes('e')) || (walls.includes('n') && walls.includes('s'))) continue
    // 对角两格开阔（种群有地方飞）
    const dx = walls.includes('w') ? 1 : -1, dy = walls.includes('n') ? 1 : -1
    if (!fl(x + dx, y + dy) || !fl(x + 2 * dx, y + 2 * dy)) continue
    const score = Math.hypot(x - CS / 2, y - CS / 2) + hash(seed, x, y, 0x4d08) * 6
    if (!best || score < best.score) best = { x, y, walls, score }
  }
  if (!best) return null
  const wx = cx * CS + best.x, wy = cy * CS + best.y
  return { id: `sat:${cx},${cy}`, kind: 'sat', cx: wx + 0.5, cy: wy + 0.5, x0: wx, y0: wy, x1: wx, y1: wy, walls: best.walls, seed: Math.floor(hash(seed, cx, cy, 0x4d09) * 1e6) }
}

/** L5 主巢描述（由 l5NestLayout 推出；id 与实体的 mothNest 字段一致） */
export function mainNestDesc(seed: number, nestId: string): MothNestDesc | null {
  const [hk, hr] = nestId.split(',').map(Number)
  if (!Number.isFinite(hk) || !Number.isFinite(hr)) return null
  const n = l5NestLayout(seed, hk, hr)
  if (!n) return null
  return { id: nestId, kind: 'main', cx: (n.x0 + n.x1 + 1) / 2, cy: (n.y0 + n.y1 + 1) / 2, x0: n.x0, y0: n.y0, x1: n.x1, y1: n.y1, doorX: n.doorX, doorY: n.doorY, seed: (hk * 73856093) ^ (hr * 19349663) }
}

export function registerNest(inf: InfiniteState, d: MothNestDesc) { (inf.mothNests ??= {})[d.id] = d }
export function nestOf(inf: InfiniteState | undefined, id: string | undefined): MothNestDesc | undefined { return id && inf?.mothNests ? inf.mothNests[id] : undefined }

/** 确定性道具摆位：主巢=三面墙覆层 + 门框增生 + 墙角高处卵囊 + 巢心卵柱 + 地面卵堆；卫星巢=两面墙覆层 + 墙角卵囊 + 地面卵堆 */
export function nestProps(d: MothNestDesc, wallH = 3): MothNestProp[] {
  const out: MothNestProp[] = []
  const r = (k: number) => hash(d.seed, k, 0x77)
  if (d.kind === 'main') {
    const W = d.x1 - d.x0 + 1, H = d.y1 - d.y0 + 1
    const cH = Math.min(2.6, wallH - 0.2)
    out.push({ key: 'coatW', kind: 'coat', x: d.x0, y: d.y0 + H / 2, h: cH / 2, nx: 1, ny: 0, w: H, ht: cH, r: 0, eggs: 0 })
    out.push({ key: 'coatN', kind: 'coat', x: d.x0 + W / 2, y: d.y0, h: cH / 2, nx: 0, ny: 1, w: W, ht: cH, r: 0, eggs: 0 })
    out.push({ key: 'coatS', kind: 'coat', x: d.x0 + W / 2, y: d.y1 + 1, h: cH / 2, nx: 0, ny: -1, w: W, ht: cH, r: 0, eggs: 0 })
    if (d.doorX !== undefined && d.doorY !== undefined) out.push({ key: 'door', kind: 'door', x: d.doorX + 0.02, y: d.doorY + 0.5, h: 0, nx: 1, ny: 0, w: 0.95, ht: Math.min(2.1, wallH - 0.3), r: 0, eggs: 0 })
    const corners: [number, number, number, number][] = [[d.x0 + 0.28, d.y0 + 0.28, 0.7, 0.7], [d.x0 + 0.28, d.y1 + 0.72, 0.7, -0.7], [d.x1 + 0.72, d.y0 + 0.28, -0.7, 0.7], [d.x1 + 0.72, d.y1 + 0.72, -0.7, -0.7]]
    corners.forEach(([x, y, nx, ny], i) => { if (i < 3 || r(i) < 0.5) { const rad = 0.24 + r(i + 10) * 0.12; out.push({ key: `sac${i}`, kind: 'sac', x, y, h: cH - 0.4 - r(i + 20) * 0.5, nx, ny, w: 0, ht: 0, r: rad, eggs: Math.round(rad * rad * 1700) }) } })
    out.push({ key: 'pillar', kind: 'pillar', x: d.cx - 0.2, y: d.cy - 0.1, h: 0, nx: 0, ny: 0, w: 0, ht: Math.min(1.3, wallH - 0.6), r: 0.16, eggs: 0 })
    out.push({ key: 'floor', kind: 'floor', x: d.cx + 0.6, y: d.cy + 0.5, h: 0, nx: 0, ny: 0, w: 0, ht: 0, r: 0.22, eggs: Math.round(0.22 * 0.22 * 1700) })
  } else {
    const ws = d.walls ?? ['w', 'n']
    const N: Record<string, [number, number]> = { w: [1, 0], e: [-1, 0], n: [0, 1], s: [0, -1] }
    const cH = Math.min(1.9, wallH - 0.4)
    for (const w of ws) {
      const [nx, ny] = N[w]
      const x = w === 'w' ? d.x0 : w === 'e' ? d.x0 + 1 : d.x0 + 0.5, y = w === 'n' ? d.y0 : w === 's' ? d.y0 + 1 : d.y0 + 0.5
      out.push({ key: `coat${w}`, kind: 'coat', x, y, h: cH / 2, nx, ny, w: 1.4, ht: cH, r: 0, eggs: 0 })
    }
    const sx = ws.includes('w') ? 0.26 : 0.74, sy = ws.includes('n') ? 0.26 : 0.74
    const nx = ws.includes('w') ? 0.7 : -0.7, ny = ws.includes('n') ? 0.7 : -0.7
    out.push({ key: 'sac0', kind: 'sac', x: d.x0 + sx, y: d.y0 + sy, h: 1.1 + r(1) * 0.5, nx, ny, w: 0, ht: 0, r: 0.22, eggs: Math.round(0.22 * 0.22 * 1700) })
    out.push({ key: 'floor', kind: 'floor', x: d.x0 + sx + nx * 0.6, y: d.y0 + sy + ny * 0.6, h: 0, nx: 0, ny: 0, w: 0, ht: 0, r: 0.18, eggs: Math.round(0.18 * 0.18 * 1700) })
  }
  return out
}

/** 卫星巢的种群（世界坐标；实体条目同 chunk raw 格式） */
export function satelliteColony(d: MothNestDesc): { type: 'deathmoth'; mothForm: 'male' | 'female' | 'larva'; x: number; y: number; mothNest: string }[] {
  const out: { type: 'deathmoth'; mothForm: 'male' | 'female' | 'larva'; x: number; y: number; mothNest: string }[] = []
  const r = (k: number) => hash(d.seed, k, 0x99)
  const dx = d.walls?.includes('w') ? 1 : -1, dy = d.walls?.includes('n') ? 1 : -1
  const nF = 2 + (r(1) < 0.4 ? 1 : 0), nL = 1 + Math.floor(r(2) * 2), nM = 1 + (r(3) < 0.5 ? 1 : 0)
  const put = (form: 'male' | 'female' | 'larva', k: number, reach: number) => out.push({ type: 'deathmoth', mothForm: form, x: d.cx + dx * (0.3 + r(k) * reach), y: d.cy + dy * (0.3 + r(k + 50) * reach), mothNest: d.id })
  for (let i = 0; i < nF; i++) put('female', 10 + i, 1.4)
  for (let i = 0; i < nL; i++) put('larva', 20 + i, 0.8)
  for (let i = 0; i < nM; i++) put('male', 30 + i, 2.2)
  return out
}

/** 巢外普通生成的雌蛾比例（ZAN 2026-10-21：一般大部分是雄蛾；L3 特殊，大部分是雌蛾）。L11 只有雄性。 */
export const WILD_FEMALE_SHARE: Record<number, number> = { 3: 0.7, 11: 0 }
export const WILD_FEMALE_DEFAULT = 0.2
/** 巢外普通生成个体的形态：按世界坐标确定性哈希（chunk 重载后不变） */
export function wildMothForm(levelId: number, seed: number, wx: number, wy: number): 'male' | 'female' {
  const share = WILD_FEMALE_SHARE[levelId] ?? WILD_FEMALE_DEFAULT
  return hash(seed, Math.floor(wx * 16), Math.floor(wy * 16), 0x4d0f) < share ? 'female' : 'male'
}
