// 微光向导（Entity 35）重制——第 3 阶段：游戏机制（AI、带路、守巢、生成分组）。
// 依据中文维基 entity-35 与 ZAN 2026-10-21 确认的机制：
//   · 纯光球（直径 5–15cm），能穿墙（穿过岩体时走 phase 片段），挂一个小点光源（同屏数量有上限，见 lightguideRender）。
//   · 玩家进入约 8m 后飘近、变青白（guide），带玩家去最近的补给（60m 内地上的食物/水/医疗物资或未搜过的补给容器），
//     附近没有补给就带去最近的 L8 出口。带路沿可走格子的寻路结果走，不穿墙飞走；在玩家前方 3–5m 处 beckon 等待，
//     玩家停下或落后就回头等；到达后在目标上方绕圈，然后离开、回到 idle。
//   · 附近有危险（敌对实体 15m 内，或前方是危险区域如符文蛛巢）：渐变粉白（warn），原地快速颤动；危险解除后恢复带路。
//   · 被玩家命中：flee 逃离并消失，玩家理智 -10，之后一段冷却时间内所有向导都回避玩家、不再带路。
//   · 氙弹珠（旧设定保留）：投出的弹珠会把附近的向导全部引过去守巢（nest_orbit）；地上自然散落的弹珠也会让闲逛的向导守着。
//   · 生成：只在 L8 多维之路区块，稀有；单只或 2–3 只一组（infiniteL8 调用 groupLightguideSpawns）。
//
// 本模块刻意不导入 three / 音频 / 渲染层：infiniteL8 的区块生成也跑在 worker 里，会把本模块一起打包进去。
// 所有长期坐标（家、路径、目标、巢）都存世界坐标（窗口坐标 + inf.ox/oy），无限层窗口平移后依然有效。
import { caveCeilingAt, floorHeight, solidStructAtFloor, wallAt, type GameMap } from '../world/mapgen'
import { recordEntityEncounter } from '../entities/codex'
import { CONTAINERS } from '../decorations/containers'
import { ITEMS } from '../content/items'
import { infiniteImplFor } from '../world/infiniteRegistry'
import type { Entity } from '../entities/types'
import type { Engine } from '../engine'

// ───────────────────────────── 数值表 ─────────────────────────────
export const LIGHTGUIDE = {
  /** 光球直径范围（米），按实体 id 确定性取值 */
  SIZE_MIN: 0.05, SIZE_MAX: 0.15,
  /** 感知：玩家进入此距离（且有视线，或贴近到 NEAR_R 内）就飘过来 */
  APPROACH_R: 8, NEAR_R: 4,
  /** 靠近时在离玩家这么远的地方停下；靠近速度；靠近阶段最长时间 */
  APPROACH_STOP: 2.6, APPROACH_SPEED: 1.9, APPROACH_MAX_T: 4,
  /** 补给搜索半径（米，直线距离）；寻路结果的路程上限是它的 1.6 倍 */
  SUPPLY_R: 60, SUPPLY_PATH_K: 1.6,
  /** 带路：领先玩家的路程距离（沿路径，米） */
  LEAD_MIN: 3, LEAD_PREF: 4, LEAD_MAX: 5,
  /** 带路追赶速度上限 / 回头等的速度 / 锚点追位速度（米/秒） */
  GUIDE_SPEED: 3.4, RETURN_SPEED: 1.5, ANCHOR_SPEED: 4.5,
  /** 玩家离路径超过这个距离就从玩家当前位置重新寻路；正常重算间隔 */
  OFFPATH_R: 4, REPLAN_T: 1.5,
  /** 玩家掉队超过 LOST_R 持续 LOST_T 秒：放弃带路 */
  LOST_R: 16, LOST_T: 10,
  /** 到达：玩家进入目标 ARRIVE_R 内后再绕 ARRIVE_ORBIT_T 秒离开；最长等 ARRIVE_MAX_T 秒 */
  ARRIVE_R: 3.5, ARRIVE_ORBIT_T: 5, ARRIVE_MAX_T: 25, ARRIVE_RADIUS: 0.45,
  /** 第九大道路标链：玩家到下一块路标这么近就换下一块 */
  SIGN_REACH: 5,
  /** 离开：飞远距离、速度、离开后多久不再主动找玩家；已展示过的目标多久内不重复带 */
  LEAVE_DIST: 13, LEAVE_SPEED: 2.2, IGNORE_T: 30, SHOWN_T: 240,
  /** 危险：敌对实体距玩家或向导 DANGER_R 内；危险区域（符文蛛巢等）距向导或前方路径 DANGER_ZONE_R 内 */
  DANGER_R: 15, DANGER_ZONE_R: 7, DANGER_AHEAD: 8, DANGER_SCAN_T: 0.25, DANGER_CLEAR_T: 1.2, WARN_MSG_T: 8,
  /** 受击：扣理智、冷却时长、冷却期内的回避半径与速度 */
  HIT_SANITY: 10, COOLDOWN_T: 120, AVOID_R: 12, AVOID_SPEED: 2.2, HIT_ALARM_R: 20,
  /** 守巢：闲逛时发现 NEST_SCAN_R 内地上的氙弹珠就守着；投出的弹珠吸引 LURE_R 内全部向导，LURE_HOLD_T 内不会离巢带路 */
  NEST_SCAN_R: 7, LURE_R: 16, LURE_HOLD_T: 20, NEST_RADIUS: 0.3, NEST_RADIUS_STEP: 0.05, MARBLE_R: 0.8,
  /** 闲逛：离家半径、速度 */
  WANDER_R: 4, WANDER_SPEED: 0.5,
  /** 飞行高度（离地，米）；离洞顶至少留 ROOF_GAP */
  HEIGHT_IDLE: 1.3, HEIGHT_GUIDE: 1.45, HEIGHT_ARRIVE: 1.1, HEIGHT_NEST: 0.32, ROOF_GAP: 0.25, CLIMB: 1.6,
  /** 分组：首帧 GROUP_R 内的向导归为同一组；随行者落在领头者身后这么远 */
  GROUP_R: 3, ESCORT_BACK: 0.9, ESCORT_LOST_R: 12,
  /** 寻路：BFS 最多扩展的格子数 */
  PATH_NODES: 26000,
  /** 生成：多维之路区块无向导的概率；单只的概率（否则 2–3 只一组） */
  SPAWN_NONE_P: 0.25, SPAWN_SINGLE_P: 0.45,
} as const
/** 与 renderer/lightguideAnim.ts 的片段常量保持一致（check-lightguide 校验）。本模块不导入渲染层，故在此重述。 */
export const LG_CLIP = { BECKON_LEN: 3.6, BECKON_ADVANCE: 0.9, FLEE_GONE_T: 1.5, PHASE_LEN: 1.2, PHASE_WALL_T: 0.6, WARN_FADE: 0.5 } as const

/** 危险区域结构（蛛形纲的符文蛛巢等）。用字符串比较，结构种类由其他模块注册。 */
export const LIGHTGUIDE_DANGER_ZONES = new Set(['runenest', 'spidernest', 'webnest', 'mothnest'])
/** 即便定义里是 passive 也视为危险的实体（无）；以及永远不算危险的实体 */
const NEVER_DANGER = new Set(['lightguide', 'dryshrimp', 'ferren'])
/** 算作补给的容器（未搜过 / 未搜空） */
export const LIGHTGUIDE_SUPPLY_CONTAINERS = new Set(['crate', 'megcrate', 'campstall', 'barrel', 'fridge', 'corpse', 'bonepile', 'suitcase', 'locker'])

// ───────────────────────────── 类型 ─────────────────────────────
export type LightguideMode = 'idle' | 'approach' | 'guide' | 'warn' | 'arrive' | 'leave' | 'flee' | 'nest' | 'avoid' | 'escort'
export type LightguideMoodName = 'idle' | 'guide' | 'warn' | 'nest'
export type LightguideClipName = 'wander' | 'beckon' | 'warn' | 'flee' | 'nest_orbit' | 'phase'
export interface LgPoint { x: number; y: number }
export interface LightguideTarget {
  kind: 'supply' | 'exit'
  /** 世界坐标 */
  x: number; y: number
  label: string
  /** 去重键（已展示目标表） */
  key: string
  /** exit 的路线方式：direct=窗口内直接寻路；avenue=沿第九大道路标链；greedy=朝区域出口锚点贪心前进 */
  via?: 'direct' | 'avenue' | 'greedy'
  /** 当前目标点是否为最终目标（路标链的中途路标为 false） */
  final: boolean
  /** 路标链：最终出口（世界坐标） */
  exitX?: number; exitY?: number
}
export interface LightguideState {
  mode: LightguideMode
  modeT: number
  /** 光球直径（米） */
  size: number
  /** 分组 id（组内最小实体 id）；-1 = 未分组 */
  group: number
  /** 家（世界坐标）：闲逛围着它 */
  home: LgPoint
  wander?: LgPoint
  target?: LightguideTarget
  /** 带路路径（世界坐标，起点在玩家附近，终点为目标） */
  path: LgPoint[]
  pathLen: number[]
  /** 向导锚点在路径上的弧长位置 */
  pathS: number
  replanT: number
  lostT: number
  arriveT: number
  /** 当前片段与片段时间（渲染层读取；beckon 循环回绕时 AI 同步把锚点前移 BECKON_ADVANCE） */
  clip: LightguideClipName
  clipT: number
  mood: LightguideMoodName
  /** warn 片段的起始色 */
  warnFrom: LightguideMoodName
  /** nest_orbit：第几只 / 共几只 / 半径 */
  orbit: { i: number; n: number; r: number }
  /** 穿墙计时：-1 = 不在墙里；进墙后 0→PHASE_WALL_T 停住，出墙后继续走到 PHASE_LEN */
  phaseT: number
  /** warn 结束后回到的模式 */
  resume?: LightguideMode
  dangerScanT: number
  /** 最近一次检测到危险的时刻（引擎时间） */
  dangerAt: number
  danger?: { x: number; y: number; what: string }
  /** 巢（世界坐标）；thrown=玩家投出的弹珠；until=投出后在此之前不离巢带路 */
  nest?: { x: number; y: number; thrown: boolean; until: number }
  /** 此时刻之前不主动找玩家 */
  ignoreUntil: number
  leaveTo?: LgPoint
  /** 随行：跟随的领头者 id */
  follow?: number
  /** flee：逃离方向（游戏平面单位向量） */
  fleeDir?: LgPoint
  /** 渲染亮度倍率（avoid 时变暗） */
  dim: number
}
interface LightguideWorld {
  cooldownUntil: number
  /** 当前带路的领头者 id（全局同时只有一组带路） */
  leaderId: number
  shown: Map<string, number>
  warnMsgAt: number
  greetedAt: number
  lastPx: number; lastPy: number; playerSpeed: number
  frameTime: number
}
const worlds = new WeakMap<Engine, LightguideWorld>()
export function lightguideWorld(eng: Engine): LightguideWorld {
  let w = worlds.get(eng)
  if (!w) { w = { cooldownUntil: -1e9, leaderId: -1, shown: new Map(), warnMsgAt: -1e9, greetedAt: -1e9, lastPx: NaN, lastPy: NaN, playerSpeed: 0, frameTime: -1 }; worlds.set(eng, w) }
  return w
}

// ───────────────────────────── 纯函数（单测覆盖） ─────────────────────────────
const hash01 = (n: number) => { let h = (n | 0) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
/** 光球直径（米）：按实体 id 确定性取值，渲染层建模与 AI 共用 */
export function lightguideSize(id: number): number { return LIGHTGUIDE.SIZE_MIN + (LIGHTGUIDE.SIZE_MAX - LIGHTGUIDE.SIZE_MIN) * hash01(id * 7919 + 17) }

export interface LgCandidate { x: number; y: number; label: string; key: string; kind: 'supply' | 'exit'; final?: boolean; via?: LightguideTarget['via']; exitX?: number; exitY?: number }
/** 目标选择：SUPPLY_R 内最近的补给优先；没有补给就选最近的出口；都没有返回 null。坐标系不限（同一坐标系即可） */
export function pickLightguideTarget(supplies: LgCandidate[], exits: LgCandidate[], px: number, py: number, R: number = LIGHTGUIDE.SUPPLY_R): LgCandidate | null {
  let best: LgCandidate | null = null, bd = Infinity
  for (const s of supplies) { const d = Math.hypot(s.x - px, s.y - py); if (d <= R && d < bd) { bd = d; best = s } }
  if (best) return best
  for (const s of exits) { const d = Math.hypot(s.x - px, s.y - py); if (d < bd) { bd = d; best = s } }
  return best
}
/** 是否算补给物品：食物、饮水、医疗（含理智/止血/消毒） */
export function isLightguideSupplyItem(type: string): boolean {
  const d = ITEMS[type]
  if (!d) return false
  if (d.use === 'eat' || d.use === 'heal' || d.use === 'cure' || d.use === 'sanity' || d.use === 'sanityeat' || d.use === 'bigsanity') return true
  return (d.value3 ?? 0) > 0
}
/** 带路时向导锚点的下一步：给出玩家投影弧长 sp、当前锚点弧长 sg、路径总长 L，返回带路子状态与新的 sg（不含 beckon 回绕前移） */
export function lightguideLeadStep(sp: number, sg: number, L: number, dt: number, playerSpeed = 0): { sub: 'travel' | 'beckon' | 'return'; sg: number } {
  const lead = sg - sp
  if (sg >= L - 1e-3 && lead >= 0) return { sub: lead > LIGHTGUIDE.LEAD_MAX ? 'return' : 'beckon', sg: lead > LIGHTGUIDE.LEAD_MAX ? Math.max(sp + LIGHTGUIDE.LEAD_PREF, sg - LIGHTGUIDE.RETURN_SPEED * dt) : sg }
  if (lead < LIGHTGUIDE.LEAD_MIN) {
    const want = Math.min(L, sp + LIGHTGUIDE.LEAD_PREF)
    const v = Math.min(LIGHTGUIDE.GUIDE_SPEED, Math.max(1.6, playerSpeed + 0.8))
    return { sub: 'travel', sg: Math.min(want, sg + v * dt) }
  }
  if (lead <= LIGHTGUIDE.LEAD_MAX) return { sub: 'beckon', sg }
  // 玩家停下或落后：回头，等在玩家前方 LEAD_PREF 处
  return { sub: 'return', sg: Math.max(sp + LIGHTGUIDE.LEAD_PREF, sg - LIGHTGUIDE.RETURN_SPEED * dt) }
}
/** 情绪色：按模式决定 */
export function lightguideMoodFor(mode: LightguideMode, prev: LightguideMoodName = 'idle'): LightguideMoodName {
  switch (mode) {
    case 'approach': case 'guide': case 'arrive': return 'guide'
    case 'warn': return 'warn'
    case 'nest': return 'nest'
    case 'flee': return prev
    case 'escort': return prev
    default: return 'idle'
  }
}
/** 是否算危险实体（公共查询接口还没有时，按实体类型与定义判断） */
export function isLightguideDanger(q: Entity): boolean {
  if (q.dead || NEVER_DANGER.has(q.def.type)) return false
  if (q.def.friendly) return false
  if (q.def.herbivore && !q.provoked) return false
  if (q.def.passive && !q.provoked) return false
  return q.def.damage > 0 || !!q.provoked
}

// ───────────────────────────── 生成分组（infiniteL8 调用，纯函数） ─────────────────────────────
/**
 * 把多维之路区块原本 placeEntity('lightguide', 2–4) 放下的向导重新整理成「稀有、单只或 2–3 只一组」：
 * 不改变生成器的随机序列（只在已经放好的条目上做确定性的删除 / 挪位）。
 * @param list   区块的实体列表（世界坐标）；从 start 开始是本次放下的向导
 * @param salt   区块哈希（h32(seed, salt, cx, cy)）
 * @param open   世界坐标处是否为可站洞底
 */
export function groupLightguideSpawns(list: { type: string; x: number; y: number }[], start: number, salt: number, open: (wx: number, wy: number) => boolean): number {
  const idx: number[] = []
  for (let i = start; i < list.length; i++) if (list[i].type === 'lightguide') idx.push(i)
  if (!idx.length) return 0
  const r = (k: number) => hash01(salt * 31 + k * 101)
  let keep = r(0) < LIGHTGUIDE.SPAWN_NONE_P ? 0 : r(1) < LIGHTGUIDE.SPAWN_SINGLE_P ? 1 : r(2) < 0.6 ? 2 : 3
  keep = Math.min(keep, idx.length)
  const lead = list[idx[0]]
  for (let k = 1; k < keep; k++) {
    const q = list[idx[k]]
    for (let t = 0; t < 8; t++) {
      const a = r(10 + k * 9 + t) * Math.PI * 2, d = 0.8 + r(40 + k * 9 + t) * 0.8
      const x = lead.x + Math.cos(a) * d, y = lead.y + Math.sin(a) * d
      if (open(x, y)) { q.x = x; q.y = y; break }
    }
  }
  // 倒序删除多余的
  for (let k = idx.length - 1; k >= keep; k--) list.splice(idx[k], 1)
  return keep
}

// ───────────────────────────── 寻路 ─────────────────────────────
/** 向导带路用的可走格子：不是岩壁、没有实心结构、不是深水湖 */
export function lightguideWalkable(m: GameMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false
  if (wallAt(m, tx, ty, 0)) return false
  if (m.liquid?.[ty * m.w + tx] === 1) return false
  return !solidStructAtFloor(m, tx + 0.5, ty + 0.5, 0)
}
function lineWalkable(m: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3)
  for (let i = 1; i < n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t
    if (!lightguideWalkable(m, Math.floor(x), Math.floor(y))) return false
    // 斜穿角落：两侧都检查一下，避免路径擦过岩壁角
    if (!lightguideWalkable(m, Math.floor(x + 0.3), Math.floor(y)) && !lightguideWalkable(m, Math.floor(x - 0.3), Math.floor(y))) return false
  }
  return true
}
/**
 * 窗口坐标下从 (sx,sy) 到 (gx,gy) 的可走路径（格心点，已做拉直）。
 * 目标不可达（超出窗口 / 超过节点上限 / 被隔断）时，若 partial=true 返回到「离目标最近的已探索格子」的路径。
 */
export function findLightguidePath(m: GameMap, sx: number, sy: number, gx: number, gy: number, partial = true, maxNodes: number = LIGHTGUIDE.PATH_NODES): { pts: LgPoint[]; reached: boolean } | null {
  const W = m.w, H = m.h
  let s = nearestWalkable(m, Math.floor(sx), Math.floor(sy)), g = nearestWalkable(m, Math.floor(gx), Math.floor(gy), 3)
  if (!s) return null
  const goalIn = !!g
  const tgx = Math.floor(gx), tgy = Math.floor(gy)
  const prev = new Int32Array(W * H).fill(-1)
  const si = s.y * W + s.x
  prev[si] = si
  const q = new Int32Array(Math.min(W * H, maxNodes + 8))
  let qh = 0, qt = 0
  q[qt++] = si
  let found = -1, bestI = si, bestD = Math.hypot(s.x - tgx, s.y - tgy)
  const gi = g ? g.y * W + g.x : -1
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1]
  while (qh < qt) {
    const i = q[qh++]
    if (i === gi) { found = i; break }
    const x = i % W, y = (i - x) / W
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k]
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const ni = ny * W + nx
      if (prev[ni] >= 0 || !lightguideWalkable(m, nx, ny)) continue
      // 斜走不切角
      if (k >= 4 && (!lightguideWalkable(m, x + DX[k], y) || !lightguideWalkable(m, x, y + DY[k]))) continue
      prev[ni] = i
      const dd = Math.hypot(nx - tgx, ny - tgy)
      if (dd < bestD) { bestD = dd; bestI = ni }
      if (qt < q.length) q[qt++] = ni
    }
    if (qt >= q.length && qh >= qt) break
  }
  let end = found
  if (end < 0) { if (!partial) return null; end = bestI }
  const cells: LgPoint[] = []
  for (let i = end; ; i = prev[i]) { const x = i % W; cells.push({ x: x + 0.5, y: (i - x) / W + 0.5 }); if (prev[i] === i) break }
  cells.reverse()
  if (found >= 0 && goalIn) cells.push({ x: gx, y: gy })
  // 拉直：能直线走通的中间点省掉
  const out: LgPoint[] = [cells[0]]
  let a = 0
  while (a < cells.length - 1) {
    let b = cells.length - 1
    while (b > a + 1 && !lineWalkable(m, cells[a].x, cells[a].y, cells[b].x, cells[b].y)) b--
    out.push(cells[b]); a = b
  }
  return { pts: out, reached: found >= 0 }
}
function nearestWalkable(m: GameMap, tx: number, ty: number, R = 4): { x: number; y: number } | null {
  for (let r = 0; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
    if (lightguideWalkable(m, tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy }
  }
  return null
}
const cumLen = (pts: LgPoint[]) => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); return L }
/** 路径上弧长 s 处的点与切向 */
export function pathPointAt(pts: LgPoint[], L: number[], s: number): { x: number; y: number; dx: number; dy: number } {
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, dx: 1, dy: 0 }
  const ss = Math.max(0, Math.min(L[L.length - 1], s))
  let i = 1
  while (i < L.length - 1 && L[i] < ss) i++
  const a = pts[i - 1], b = pts[i], seg = Math.max(1e-6, L[i] - L[i - 1]), t = (ss - L[i - 1]) / seg
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / seg, dy: (b.y - a.y) / seg }
}
/** 点到路径的最近弧长与距离 */
export function projectOnPath(pts: LgPoint[], L: number[], x: number, y: number): { s: number; d: number } {
  if (pts.length === 1) return { s: 0, d: Math.hypot(x - pts[0].x, y - pts[0].y) }
  let bs = 0, bd = Infinity
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1e-9
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2))
    const d = Math.hypot(a.x + vx * t - x, a.y + vy * t - y)
    if (d < bd) { bd = d; bs = L[i - 1] + Math.sqrt(l2) * t }
  }
  return { s: bs, d: bd }
}

// ───────────────────────────── 引擎侧 ─────────────────────────────
const off = (m: GameMap) => ({ ox: m.inf?.ox ?? 0, oy: m.inf?.oy ?? 0 })
export function lightguideState(eng: Engine, e: Entity): LightguideState {
  if (e.lg) return e.lg
  const { ox, oy } = off(eng.map!)
  const S: LightguideState = {
    mode: 'idle', modeT: 0, size: lightguideSize(e.id), group: -1,
    home: { x: e.x + ox, y: e.y + oy }, path: [], pathLen: [], pathS: 0, replanT: 0, lostT: 0, arriveT: 0,
    clip: 'wander', clipT: (e.id * 0.37) % 6, mood: 'idle', warnFrom: 'idle', orbit: { i: 0, n: 1, r: LIGHTGUIDE.NEST_RADIUS },
    phaseT: -1, dangerScanT: (e.id % 7) * 0.03, dangerAt: -1e9, ignoreUntil: -1e9, dim: 1,
  }
  e.lg = S
  return S
}
function setMode(e: Entity, S: LightguideState, mode: LightguideMode) {
  if (S.mode === mode) return
  S.mode = mode; S.modeT = 0
  S.mood = lightguideMoodFor(mode, S.mood)
  e.state = mode === 'idle' || mode === 'leave' || mode === 'avoid' ? 'wander' : 'investigate'
}
function setClip(S: LightguideState, clip: LightguideClipName) { if (S.clip !== clip) { S.clip = clip; S.clipT = 0 } }
const guides = (m: GameMap) => m.entities.filter((q) => !q.dead && q.def.type === 'lightguide')

/** 每帧在实体循环前调用一次：玩家速度、分组、领头者有效性 */
export function beginLightguideFrame(eng: Engine, dt: number) {
  const m = eng.map
  if (!m) return
  const W = lightguideWorld(eng), p = eng.player
  if (W.frameTime === eng.time) return
  W.frameTime = eng.time
  const { ox, oy } = off(m)
  const wx = p.x + ox, wy = p.y + oy
  if (Number.isFinite(W.lastPx) && dt > 0) {
    const v = Math.hypot(wx - W.lastPx, wy - W.lastPy) / dt
    W.playerSpeed += (Math.min(8, v) - W.playerSpeed) * Math.min(1, dt * 4)
  }
  W.lastPx = wx; W.lastPy = wy
  const list = guides(m)
  if (!list.length) return
  // 分组：首帧把 GROUP_R 内的向导并成一组（组 id = 组内最小 id）
  for (const e of list) {
    const S = lightguideState(eng, e)
    if (S.group >= 0) continue
    let g = e.id
    for (const q of list) if (q !== e && Math.hypot(q.x - e.x, q.y - e.y) < LIGHTGUIDE.GROUP_R) g = Math.min(g, q.lg?.group !== undefined && q.lg.group >= 0 ? q.lg.group : q.id)
    S.group = g
  }
  const L = list.find((q) => q.id === W.leaderId)
  if (!L || !L.lg || !(['approach', 'guide', 'warn', 'arrive'] as LightguideMode[]).includes(L.lg.mode)) W.leaderId = -1
}

/** 投出氙弹珠：LURE_R 内的向导全部过去守巢。返回被吸引的数量（combat.ts 的 lure 分支调用） */
export function lightguideLure(eng: Engine, x: number, y: number): number {
  const m = eng.map!, { ox, oy } = off(m)
  let n = 0
  for (const e of guides(m)) {
    const S = lightguideState(eng, e)
    if (S.mode === 'flee' || Math.hypot(e.x - x, e.y - y) > LIGHTGUIDE.LURE_R) continue
    S.nest = { x: x + ox, y: y + oy, thrown: true, until: eng.time + LIGHTGUIDE.LURE_HOLD_T }
    if (lightguideWorld(eng).leaderId === e.id) lightguideWorld(eng).leaderId = -1
    S.target = undefined; S.path = []; S.follow = undefined
    setMode(e, S, 'nest')
    n++
  }
  return n
}

/** 玩家命中（combat.killCheck 开头调用）：向导不会被打死，而是逃离消失；扣理智并进入冷却。返回 true = 已处理 */
export function lightguideHit(eng: Engine, e: Entity): boolean {
  if (e.def.type !== 'lightguide') return false
  e.hp = e.def.hp // 纯光球：伤害不累计，命中只会把它吓跑
  const S = lightguideState(eng, e)
  if (S.mode === 'flee' || e.dead) return true
  const p = eng.player, W = lightguideWorld(eng)
  const dx = e.x - p.x, dy = e.y - p.y, dl = Math.hypot(dx, dy) || 1
  S.fleeDir = { x: dx / dl, y: dy / dl }
  e.facing = Math.atan2(dy, dx)
  if (W.leaderId === e.id) W.leaderId = -1
  setMode(e, S, 'flee'); setClip(S, 'flee')
  S.phaseT = -1
  p.sanity = Math.max(0, p.sanity - LIGHTGUIDE.HIT_SANITY)
  eng.emit({ kind: 'sanityhit' })
  W.cooldownUntil = eng.time + LIGHTGUIDE.COOLDOWN_T
  eng.msg('微光猛地一暗，像被烫到一样逃开，消失在岩壁里。你心里莫名空了一块。（理智 -10）', 'damage')
  // 附近的同类都看见了：一起回避
  for (const q of guides(eng.map!)) {
    if (q === e || Math.hypot(q.x - e.x, q.y - e.y) > LIGHTGUIDE.HIT_ALARM_R) continue
    const Q = lightguideState(eng, q)
    if (Q.mode === 'flee' || Q.mode === 'nest') continue
    Q.target = undefined; Q.path = []; Q.follow = undefined
    setMode(q, Q, 'avoid')
  }
  return true
}

/** 冷却剩余秒数（0 = 没有冷却） */
export function lightguideCooldown(eng: Engine): number { return Math.max(0, lightguideWorld(eng).cooldownUntil - eng.time) }

// —— 目标收集 ——
function collectSupplies(eng: Engine, px: number, py: number): LgCandidate[] {
  const m = eng.map!, { ox, oy } = off(m), W = lightguideWorld(eng), R = LIGHTGUIDE.SUPPLY_R
  const out: LgCandidate[] = []
  const fresh = (key: string) => (W.shown.get(key) ?? -1e9) < eng.time
  for (const it of m.items) {
    if (it.fake || !isLightguideSupplyItem(it.type) || Math.hypot(it.x - px, it.y - py) > R) continue
    const key = `i${it.id}`
    if (fresh(key)) out.push({ kind: 'supply', x: it.x + ox, y: it.y + oy, label: ITEMS[it.type]?.name ?? '补给', key, final: true })
  }
  for (const s of m.structures) {
    if (!LIGHTGUIDE_SUPPLY_CONTAINERS.has(s.kind) || s.looted || s.data?.searched) continue
    if (s.kind === 'bonepile' && !s.data?.loot) continue
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2
    if (Math.hypot(cx - px, cy - py) > R) continue
    const key = `s${s.data?.sid ?? `${Math.round(cx + ox)},${Math.round(cy + oy)}`}`
    if (fresh(key)) out.push({ kind: 'supply', x: cx + ox, y: cy + oy, label: CONTAINERS[s.kind]?.label ?? '补给箱', key, final: true })
  }
  return out
}
function collectExits(eng: Engine, px: number, py: number): LgCandidate[] {
  const m = eng.map!, { ox, oy } = off(m)
  const out: LgCandidate[] = []
  for (const x of m.exits) {
    const ex = x.x + 0.5 + ox, ey = x.y + 0.5 + oy
    out.push({ kind: 'exit', x: ex, y: ey, label: x.def.name ?? '出口', key: `x${Math.round(ex)},${Math.round(ey)}`, final: true, via: 'direct' })
  }
  if (eng.levelDef.id !== 8) return out
  // 第九大道路标链：离玩家最近的已加载路标 → 它的下一块 → …… → 大道尽头出口
  const exitAnchor = (() => { try { return infiniteImplFor(8).regionExitPos?.(m.inf?.seed ?? 0, 0, 0) ?? null } catch { return null } })()
  const ax = exitAnchor ? exitAnchor.x + 0.5 : NaN, ay = exitAnchor ? exitAnchor.y + 0.5 : NaN
  if (out.some((c) => Number.isFinite(ax) && Math.hypot(c.x - ax, c.y - ay) < 3)) return out // 大道尽头已在窗口里
  let sign: { x: number; y: number; seq: number; nx: number; ny: number; final: boolean } | null = null, sd = Infinity
  for (const s of m.structures) {
    if (s.kind !== 'roadsign' || !s.data?.avenue) continue
    const d = Math.hypot(s.x + 0.5 - px, s.y + 0.5 - py)
    if (d < sd) { sd = d; sign = { x: s.x + 0.5 + ox, y: s.y + 0.5 + oy, seq: Number(s.data.seq ?? 0), nx: Number(s.data.nextX), ny: Number(s.data.nextY), final: !!s.data.final } }
  }
  if (sign && Number.isFinite(ax)) {
    // 已经走到这块路标附近：直接指向下一块
    const near = sd < LIGHTGUIDE.SIGN_REACH
    const wp = near ? { x: sign.nx, y: sign.ny } : { x: sign.x, y: sign.y }
    out.push({ kind: 'exit', x: wp.x, y: wp.y, label: '第九大道洞口', key: 'avenue', final: false, via: 'avenue', exitX: ax, exitY: ay })
  } else if (Number.isFinite(ax)) {
    out.push({ kind: 'exit', x: ax, y: ay, label: '第九大道洞口', key: 'avenue', final: false, via: 'greedy', exitX: ax, exitY: ay })
  }
  return out
}
/** 为带路挑目标并寻路（窗口坐标的玩家位置）；成功时写入 S.target / S.path */
function planGuide(eng: Engine, e: Entity, S: LightguideState): boolean {
  const m = eng.map!, p = eng.player, { ox, oy } = off(m)
  const supplies = collectSupplies(eng, p.x, p.y).sort((a, b) => Math.hypot(a.x - ox - p.x, a.y - oy - p.y) - Math.hypot(b.x - ox - p.x, b.y - oy - p.y))
  // 补给按距离逐个试寻路，第一个可达且路程不离谱的就是目标
  for (const c of supplies.slice(0, 6)) {
    const r = findLightguidePath(m, p.x, p.y, c.x - ox, c.y - oy, false)
    if (!r) continue
    const L = cumLen(r.pts)
    if (L[L.length - 1] > LIGHTGUIDE.SUPPLY_R * LIGHTGUIDE.SUPPLY_PATH_K) continue
    return adoptPlan(eng, e, S, { ...c, final: true }, r.pts)
  }
  const exits = collectExits(eng, p.x + ox, p.y + oy)
  const ex = pickLightguideTarget([], exits, p.x + ox, p.y + oy)
  if (!ex) return false
  const r = findLightguidePath(m, p.x, p.y, ex.x - ox, ex.y - oy, true)
  if (!r || r.pts.length < 2) return false
  return adoptPlan(eng, e, S, { kind: 'exit', x: ex.x, y: ex.y, label: ex.label, key: ex.key, via: ex.via, final: !!ex.final && r.reached, exitX: ex.exitX, exitY: ex.exitY }, r.pts)
}
function adoptPlan(eng: Engine, e: Entity, S: LightguideState, t: LightguideTarget, pts: LgPoint[]): boolean {
  const { ox, oy } = off(eng.map!)
  S.target = t
  S.path = pts.map((q) => ({ x: q.x + ox, y: q.y + oy }))
  S.pathLen = cumLen(S.path)
  // 锚点从向导当前位置在新路径上的投影开始，不跳回起点
  // （路径从玩家脚下开始：锚点最多放在玩家前方 LEAD_MAX+1 处，避免离路径很远的向导被投影到终点直接判为到达）
  const pr = projectOnPath(S.path, S.pathLen, e.x + ox, e.y + oy)
  S.pathS = Math.min(pr.s, LIGHTGUIDE.LEAD_MAX + 1)
  S.replanT = LIGHTGUIDE.REPLAN_T
  return true
}
function replan(eng: Engine, e: Entity, S: LightguideState) {
  const m = eng.map!, p = eng.player, { ox, oy } = off(m), t = S.target
  if (!t) return
  // 补给已被拿走 / 容器搜过：重新挑目标
  if (t.kind === 'supply') {
    const still = t.key.startsWith('i') ? m.items.some((it) => `i${it.id}` === t.key) : m.structures.some((s) => `s${s.data?.sid}` === t.key && !s.looted && !s.data?.searched)
    if (!still) { if (!planGuide(eng, e, S)) endGuide(eng, e, S); return }
  }
  const r = findLightguidePath(m, p.x, p.y, t.x - ox, t.y - oy, t.via !== 'direct' && t.kind === 'exit')
  if (r && r.pts.length >= 1) {
    if (t.kind === 'exit' && t.via === 'greedy') t.final = false
    adoptPlan(eng, e, S, t, r.pts)
  }
}
function endGuide(eng: Engine, e: Entity, S: LightguideState, leave = false) {
  const W = lightguideWorld(eng), p = eng.player, { ox, oy } = off(eng.map!)
  if (W.leaderId === e.id) W.leaderId = -1
  S.target = undefined; S.path = []; S.pathLen = []
  S.ignoreUntil = eng.time + LIGHTGUIDE.IGNORE_T
  if (leave) {
    const dx = e.x - p.x, dy = e.y - p.y, dl = Math.hypot(dx, dy) || 1
    S.leaveTo = { x: e.x + ox + (dx / dl) * LIGHTGUIDE.LEAVE_DIST, y: e.y + oy + (dy / dl) * LIGHTGUIDE.LEAVE_DIST }
    setMode(e, S, 'leave')
  } else setMode(e, S, 'idle')
  S.home = { x: e.x + ox, y: e.y + oy }
}

// —— 运动 ——
/** 飞向窗口坐标 (tx,ty)：直线（可穿墙），返回是否已到达 */
function flyToward(e: Entity, tx: number, ty: number, speed: number, dt: number, face = true): boolean {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy)
  if (d < 1e-4) return true
  const st = Math.min(d, speed * dt)
  e.x += (dx / d) * st; e.y += (dy / d) * st
  if (face && st > 1e-4) turnToward(e, Math.atan2(dy, dx), dt)
  return st >= d - 1e-4
}
function turnToward(e: Entity, ang: number, dt: number, rate = 6) {
  const diff = ((((ang - e.facing) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  const st = rate * dt
  if (Math.abs(diff) <= st) e.facing = ang
  else e.facing += Math.sign(diff) * st
}
function updateHeight(eng: Engine, e: Entity, S: LightguideState, above: number, dt: number) {
  const m = eng.map!
  const tx = Math.floor(e.x), ty = Math.floor(e.y)
  if (wallAt(m, tx, ty, 0)) return // 在岩体里：保持当前高度穿过去
  const ground = floorHeight(m, e.x, e.y, 0)
  const roof = m.organicCave ? caveCeilingAt(m, e.x, e.y) : ground + 3
  const want = Math.max(ground + 0.15, Math.min(ground + above, roof - LIGHTGUIDE.ROOF_GAP))
  if (!e.flightReady || !Number.isFinite(e.z)) { e.z = want; e.flightReady = true; return }
  const st = LIGHTGUIDE.CLIMB * dt
  e.z += Math.max(-st, Math.min(st, want - e.z))
  void S
}
function updatePhase(eng: Engine, e: Entity, S: LightguideState, dt: number) {
  const inWall = wallAt(eng.map!, Math.floor(e.x), Math.floor(e.y), 0)
  if (inWall) S.phaseT = S.phaseT < 0 ? 0 : Math.min(LG_CLIP.PHASE_WALL_T, S.phaseT + dt)
  else if (S.phaseT >= 0) {
    S.phaseT = Math.max(S.phaseT, LG_CLIP.PHASE_WALL_T) + dt
    if (S.phaseT >= LG_CLIP.PHASE_LEN) S.phaseT = -1
  }
}

// —— 危险 ——
function scanDanger(eng: Engine, e: Entity, S: LightguideState): LightguideState['danger'] {
  const m = eng.map!, p = eng.player, { ox, oy } = off(m)
  for (const q of m.entities) {
    if (q === e || !isLightguideDanger(q)) continue
    if (Math.hypot(q.x - p.x, q.y - p.y) <= LIGHTGUIDE.DANGER_R || Math.hypot(q.x - e.x, q.y - e.y) <= LIGHTGUIDE.DANGER_R)
      return { x: q.x + ox, y: q.y + oy, what: q.def.name }
  }
  // 危险区域：向导周围，或前方 DANGER_AHEAD 米路径上
  const probes: LgPoint[] = [{ x: e.x, y: e.y }]
  if (S.path.length > 1) for (let k = 2; k <= LIGHTGUIDE.DANGER_AHEAD; k += 2) { const q = pathPointAt(S.path, S.pathLen, S.pathS + k); probes.push({ x: q.x - ox, y: q.y - oy }) }
  for (const s of m.structures) {
    if (!LIGHTGUIDE_DANGER_ZONES.has(s.kind as string)) continue
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2
    for (const q of probes) if (Math.hypot(cx - q.x, cy - q.y) <= LIGHTGUIDE.DANGER_ZONE_R) return { x: cx + ox, y: cy + oy, what: '危险区域' }
  }
  return undefined
}

// —— 巢 ——
function marbleAt(m: GameMap, x: number, y: number, R: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bd = R
  for (const it of m.items) {
    if (it.type !== 'xenonmarble') continue
    const d = Math.hypot(it.x - x, it.y - y)
    if (d <= bd) { bd = d; best = { x: it.x, y: it.y } }
  }
  return best
}

/** 单只向导的 AI（entityAI 循环内调用；d = 到玩家的距离，开发者隐形时为 1e9） */
export function updateLightguide(eng: Engine, e: Entity, dt: number, d: number) {
  const m = eng.map!, p = eng.player, W = lightguideWorld(eng), { ox, oy } = off(m)
  beginLightguideFrame(eng, dt) // 兜底：钩子漏调时也能工作（同一帧只执行一次）
  const S = lightguideState(eng, e)
  S.modeT += dt
  const prevClip = S.clip, prevClipT = S.clipT
  S.clipT += dt
  S.dim += ((S.mode === 'avoid' || S.mode === 'leave' ? 0.6 : 1) - S.dim) * Math.min(1, dt * 2)
  const senses = d < 1e8
  const now = eng.time

  // 图鉴：玩家看见
  if (!e.encountered && senses && d < e.def.sight && eng.los(p.x, p.y, e.x, e.y)) recordEntityEncounter(e)

  // ① 逃离：片段播完就消失
  if (S.mode === 'flee') {
    setClip(S, 'flee')
    if (S.modeT >= LG_CLIP.FLEE_GONE_T) { e.dead = true; e.deathT = 0; e.hidden = true }
    return
  }
  // ② 巢：投出的弹珠优先级最高
  if (S.mode !== 'nest' && S.nest?.thrown && S.nest.until > now) setMode(e, S, 'nest')
  // ③ 冷却期：回避玩家
  const cooling = W.cooldownUntil > now
  if (cooling && senses && d < LIGHTGUIDE.AVOID_R && S.mode !== 'nest') {
    if (S.mode !== 'avoid') { if (W.leaderId === e.id) W.leaderId = -1; S.target = undefined; S.path = []; S.follow = undefined; setMode(e, S, 'avoid') }
  }
  // ④ 危险
  S.dangerScanT -= dt
  const engaged = S.mode === 'approach' || S.mode === 'guide' || S.mode === 'arrive' || S.mode === 'escort' || S.mode === 'warn' || (S.mode === 'idle' && senses && d < LIGHTGUIDE.APPROACH_R)
  if (engaged && S.dangerScanT <= 0) {
    S.dangerScanT = LIGHTGUIDE.DANGER_SCAN_T
    const dz = senses ? scanDanger(eng, e, S) : undefined
    if (dz) { S.danger = dz; S.dangerAt = now }
  }
  if (engaged && S.mode !== 'warn' && now - S.dangerAt < 0.05 + LIGHTGUIDE.DANGER_SCAN_T && S.danger) {
    S.resume = S.mode; S.warnFrom = S.mood
    setMode(e, S, 'warn'); setClip(S, 'warn')
    if (now - W.warnMsgAt > LIGHTGUIDE.WARN_MSG_T && senses && d < LIGHTGUIDE.DANGER_R) {
      W.warnMsgAt = now
      eng.msg('微光骤然褪成粉白色，停在原地急促地颤动——附近有东西，先别动。', 'system')
    }
  }

  let height: number = LIGHTGUIDE.HEIGHT_IDLE
  switch (S.mode) {
    case 'idle': {
      setClip(S, 'wander')
      // 守着地上的氙弹珠
      const mb = marbleAt(m, e.x, e.y, LIGHTGUIDE.NEST_SCAN_R)
      if (mb) { S.nest = { x: mb.x + ox, y: mb.y + oy, thrown: false, until: -1e9 }; setMode(e, S, 'nest'); break }
      if (tryEngage(eng, e, S, d)) break
      // 闲逛：家附近随机可走点
      if (!S.wander || S.modeT > 9 || Math.hypot(S.wander.x - ox - e.x, S.wander.y - oy - e.y) < 0.2) {
        S.modeT = 0
        for (let t = 0; t < 6; t++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * LIGHTGUIDE.WANDER_R
          const wx = S.home.x + Math.cos(a) * r, wy = S.home.y + Math.sin(a) * r
          if (lightguideWalkable(m, Math.floor(wx - ox), Math.floor(wy - oy))) { S.wander = { x: wx, y: wy }; break }
        }
        S.wander ??= { ...S.home }
      }
      flyToward(e, S.wander.x - ox, S.wander.y - oy, LIGHTGUIDE.WANDER_SPEED, dt)
      break
    }
    case 'approach': {
      setClip(S, 'wander')
      height = LIGHTGUIDE.HEIGHT_GUIDE
      const dx = e.x - p.x, dy = e.y - p.y, dl = Math.hypot(dx, dy) || 1
      const there = flyToward(e, p.x + (dx / dl) * LIGHTGUIDE.APPROACH_STOP, p.y + (dy / dl) * LIGHTGUIDE.APPROACH_STOP, LIGHTGUIDE.APPROACH_SPEED, dt, false)
      turnToward(e, Math.atan2(-dy, -dx), dt)
      if ((there && S.modeT > 1.0) || S.modeT > LIGHTGUIDE.APPROACH_MAX_T) {
        if (planGuide(eng, e, S)) {
          setMode(e, S, 'guide')
          if (now - W.greetedAt > 60) {
            W.greetedAt = now
            eng.msg(S.target?.kind === 'supply'
              ? '一团青白色的微光飘到你面前，又往前挪了一点，停下来等你——像是要带你去什么地方。'
              : '青白色的微光在前方停住，朝洞穴深处轻轻一晃。它在给你指路。', 'lore')
          }
        } else endGuide(eng, e, S)
      }
      break
    }
    case 'guide': {
      height = LIGHTGUIDE.HEIGHT_GUIDE
      if (!S.target || S.path.length < 2) { if (!S.target || !planGuide(eng, e, S)) { endGuide(eng, e, S); break } }
      // 掉队太久：放弃
      if (d > LIGHTGUIDE.LOST_R) S.lostT += dt; else S.lostT = 0
      if (S.lostT > LIGHTGUIDE.LOST_T) { endGuide(eng, e, S); eng.msg('微光等了很久，光慢慢褪回暖白，飘走了。', 'system'); break }
      const pw = { x: p.x + ox, y: p.y + oy }
      let pr = projectOnPath(S.path, S.pathLen, pw.x, pw.y)
      S.replanT -= dt
      if (pr.d > LIGHTGUIDE.OFFPATH_R || S.replanT <= 0) { replan(eng, e, S); if (S.mode !== 'guide' || !S.target) break; pr = projectOnPath(S.path, S.pathLen, pw.x, pw.y) }
      const L = S.pathLen[S.pathLen.length - 1]
      // beckon 循环回绕：根位移同步——锚点沿路径前移 BECKON_ADVANCE
      if (prevClip === 'beckon' && Math.floor(S.clipT / LG_CLIP.BECKON_LEN) > Math.floor(prevClipT / LG_CLIP.BECKON_LEN)) {
        const before = pathPointAt(S.path, S.pathLen, S.pathS)
        const lead = S.pathS - pr.s
        if (lead + LG_CLIP.BECKON_ADVANCE <= LIGHTGUIDE.LEAD_MAX + 0.4 && S.pathS < L) {
          S.pathS = Math.min(L, S.pathS + LG_CLIP.BECKON_ADVANCE)
          const after = pathPointAt(S.path, S.pathLen, S.pathS)
          // 视觉上光球已经飘到了前方：锚点直接跟上，不做追位
          if (Math.hypot(before.x - ox - e.x, before.y - oy - e.y) < 0.35) { e.x += after.x - before.x; e.y += after.y - before.y }
        } else setClip(S, 'wander') // 再往前就超出 5m：这一轮不前移，改成原地悬停等
      }
      const st = lightguideLeadStep(pr.s, S.pathS, L, dt, W.playerSpeed)
      S.pathS = st.sg
      if (st.sub === 'beckon') { if (S.clip !== 'beckon' && (S.clip !== 'wander' || S.clipT > 0.6)) setClip(S, 'beckon') }
      else setClip(S, 'wander')
      const a = pathPointAt(S.path, S.pathLen, S.pathS)
      flyToward(e, a.x - ox, a.y - oy, LIGHTGUIDE.ANCHOR_SPEED, dt, false)
      turnToward(e, st.sub === 'return' ? Math.atan2(p.y - e.y, p.x - e.x) : Math.atan2(a.dy, a.dx), dt)
      // 到达路径终点
      const end = S.path[S.path.length - 1]
      if (S.pathS >= L - 0.25 && Math.hypot(end.x - ox - e.x, end.y - oy - e.y) < 1.5) {
        const t = S.target!
        if (t.final) { setMode(e, S, 'arrive'); S.arriveT = 0; break }
        // 中途路标：玩家走近了就换下一段
        if (Math.hypot(pw.x - t.x, pw.y - t.y) < LIGHTGUIDE.SIGN_REACH) { if (!planGuide(eng, e, S)) endGuide(eng, e, S) }
      }
      break
    }
    case 'arrive': {
      height = LIGHTGUIDE.HEIGHT_ARRIVE
      const t = S.target
      if (!t) { endGuide(eng, e, S); break }
      setClip(S, 'nest_orbit')
      S.orbit = { i: 0, n: 1, r: LIGHTGUIDE.ARRIVE_RADIUS }
      flyToward(e, t.x - ox, t.y - oy, LIGHTGUIDE.ANCHOR_SPEED * 0.6, dt, false)
      const pd = Math.hypot(p.x + ox - t.x, p.y + oy - t.y)
      if (pd < LIGHTGUIDE.ARRIVE_R) {
        if (S.arriveT === 0) eng.msg(t.kind === 'supply' ? `微光在${t.label}上方慢慢绕了几圈。` : `微光绕着${t.label}打转——出口就在这里。`, 'lore')
        S.arriveT += dt
      }
      if (S.arriveT >= LIGHTGUIDE.ARRIVE_ORBIT_T || S.modeT > LIGHTGUIDE.ARRIVE_MAX_T) {
        W.shown.set(t.key, now + LIGHTGUIDE.SHOWN_T)
        endGuide(eng, e, S, true)
      }
      break
    }
    case 'warn': {
      setClip(S, 'warn')
      height = S.resume === 'nest' ? LIGHTGUIDE.HEIGHT_NEST : LIGHTGUIDE.HEIGHT_GUIDE
      if (S.danger) turnToward(e, Math.atan2(S.danger.y - oy - e.y, S.danger.x - ox - e.x), dt, 3)
      // 原地不动；危险解除 DANGER_CLEAR_T 秒后恢复
      if (now - S.dangerAt > LIGHTGUIDE.DANGER_CLEAR_T) {
        const back = S.resume && S.resume !== 'warn' ? S.resume : 'idle'
        S.danger = undefined
        setMode(e, S, back)
        if (back === 'guide') { setClip(S, 'wander'); S.replanT = 0 }
      }
      break
    }
    case 'leave': {
      setClip(S, 'wander')
      const to = S.leaveTo ?? S.home
      const done = flyToward(e, to.x - ox, to.y - oy, LIGHTGUIDE.LEAVE_SPEED, dt)
      if (done || S.modeT > 7) { S.home = { x: e.x + ox, y: e.y + oy }; setMode(e, S, 'idle') }
      break
    }
    case 'avoid': {
      setClip(S, 'wander')
      if (!cooling || !senses || d > LIGHTGUIDE.AVOID_R + 1) { S.home = { x: e.x + ox, y: e.y + oy }; setMode(e, S, 'idle'); break }
      const dx = e.x - p.x, dy = e.y - p.y, dl = Math.hypot(dx, dy) || 1
      flyToward(e, e.x + (dx / dl) * 2, e.y + (dy / dl) * 2, LIGHTGUIDE.AVOID_SPEED, dt)
      break
    }
    case 'escort': {
      setClip(S, 'wander')
      height = LIGHTGUIDE.HEIGHT_GUIDE + 0.15
      const L = m.entities.find((q) => q.id === S.follow && !q.dead)
      if (!L || !L.lg || !(['approach', 'guide', 'warn', 'arrive'] as LightguideMode[]).includes(L.lg.mode) || Math.hypot(L.x - e.x, L.y - e.y) > LIGHTGUIDE.ESCORT_LOST_R) {
        S.follow = undefined; S.home = { x: e.x + ox, y: e.y + oy }; S.ignoreUntil = now + LIGHTGUIDE.IGNORE_T; setMode(e, S, 'idle'); break
      }
      S.mood = L.lg.mood === 'warn' ? 'warn' : 'guide'
      // 组内排序决定站位：领头者身后左右错开
      const mates = m.entities.filter((q) => !q.dead && q.lg?.follow === L.id).sort((a, b) => a.id - b.id)
      const k = Math.max(0, mates.indexOf(e)), side = k % 2 ? -1 : 1
      const back = L.facing + Math.PI + side * (0.5 + 0.25 * k)
      const r = LIGHTGUIDE.ESCORT_BACK * (1 + 0.4 * k)
      if (L.lg.mode !== 'warn') flyToward(e, L.x + Math.cos(back) * r, L.y + Math.sin(back) * r, LIGHTGUIDE.GUIDE_SPEED, dt, false)
      turnToward(e, L.facing, dt)
      break
    }
    case 'nest': {
      setClip(S, 'nest_orbit')
      height = LIGHTGUIDE.HEIGHT_NEST
      const nest = S.nest
      const mb = nest ? marbleAt(m, nest.x - ox, nest.y - oy, LIGHTGUIDE.MARBLE_R) : null
      if (!nest || !mb) { S.nest = undefined; S.home = { x: e.x + ox, y: e.y + oy }; S.ignoreUntil = Math.max(S.ignoreUntil, now + 4); setMode(e, S, 'idle'); break }
      // 同巢排序：轨道编号、半径
      const mates = m.entities.filter((q) => !q.dead && q.lg?.mode === 'nest' && q.lg.nest && Math.hypot(q.lg.nest.x - nest.x, q.lg.nest.y - nest.y) < 0.5).sort((a, b) => a.id - b.id)
      const i = Math.max(0, mates.indexOf(e))
      S.orbit = { i, n: Math.max(1, mates.length), r: LIGHTGUIDE.NEST_RADIUS + i * LIGHTGUIDE.NEST_RADIUS_STEP }
      flyToward(e, mb.x, mb.y, LIGHTGUIDE.APPROACH_SPEED * 1.3, dt, false)
      // 自然巢：玩家靠近时，巢里编号最小的那只出来带路（投出的弹珠在保持期内不离巢）
      if (i === 0 && now >= nest.until && tryEngage(eng, e, S, d)) { S.nest = undefined }
      break
    }
  }
  updateHeight(eng, e, S, height, dt)
  updatePhase(eng, e, S, dt)
}

/** 闲逛 / 守巢中的向导看见玩家：成为领头者靠近，或作为随行者跟随本组领头者 */
function tryEngage(eng: Engine, e: Entity, S: LightguideState, d: number): boolean {
  const W = lightguideWorld(eng), p = eng.player, now = eng.time
  if (d >= LIGHTGUIDE.APPROACH_R || W.cooldownUntil > now || now < S.ignoreUntil) return false
  if (d >= LIGHTGUIDE.NEAR_R && !eng.los(e.x, e.y, p.x, p.y)) return false
  const leader = W.leaderId >= 0 ? eng.map!.entities.find((q) => q.id === W.leaderId && !q.dead) : undefined
  if (leader) {
    if (leader.lg?.group === S.group && leader !== e) { S.follow = leader.id; setMode(e, S, 'escort'); return true }
    return false // 别的组正在带路
  }
  W.leaderId = e.id
  setMode(e, S, 'approach')
  // 同组其余闲逛的个体一起跟上
  for (const q of guides(eng.map!)) {
    if (q === e || q.lg?.group !== S.group || q.lg.mode !== 'idle') continue
    q.lg.follow = e.id; setMode(q, q.lg, 'escort')
  }
  return true
}
