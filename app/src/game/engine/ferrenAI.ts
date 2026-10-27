// [ferren] Ferren（Entity 92）重制·阶段 3：机制。依据 backrooms-wiki-cn entity-92 与 ZAN 的取舍（10-23）：
//   · 只有 1 只，只出现在商人之家（Level 102）的雪貂笼；不偷东西、不带回资源、不反击（critters noRetaliate）。
//   · 作息：按维基「B.N.T.G. 为 Ferren 设置的早晚作息表」，一整天（7:00 起 24 h）压缩成游戏内 FR.CYCLE 秒一轮，各时段按维基时长等比缩放：
//       唤醒 → 早餐 → 晨练 → 娱乐 → 训练 → 午餐 → 午睡 → 唤醒 → 下午锻炼 → 娱乐 → 训练 → 散步 → 晚餐 → 娱乐（释放精力）→ 上床 → 睡觉
//     时间轴（累计秒数）写进存档（SaveSnapshot.ferren）。
//   · 行为：睡觉/午睡 回窝蜷睡 · 进食 去食盆吃 · 娱乐 战舞/打滚/在笼里撒欢，玩家在旁边就跟过去蹭 · 训练 站立/伸懒腰/嗅 + 切行练习（笼内到另一侧）
//     · 散步 笼内绕圈慢走 · 晨练/锻炼 绕圈飞奔 · 唤醒 窝里伸懒腰 · 上床 回窝嗅一嗅、伸个懒腰、躺下。
//   · 特殊交互键（X，engine/special.ts 情境；移动端情境按钮）按时段：娱乐/散步 摸摸（pet，理智 +、B.N.T.G. 好感 +，有冷却）·
//     训练 算作打扰（声望 −、警告）· 睡觉（上床已进窝/午睡/夜间）盖被子（每次入睡只能盖一次，好感 +）。其余时段只有提示文字。
//   · 切行（noclip）：只在站内短距离——瞬移到商人之家里另一处可走点（不进墙、不出商人之家、不过门：从笼子出发、不穿实心结构的
//     连通区域内）。娱乐/锻炼时偶尔自发切行（切到笼外后过一会儿再切行回笼）；训练时在笼内练习切行。切行那一刻和他有身体接触的玩家
//     （中心距 ≤ FR.CONTACT_R，或正在摸他）被一起带走，落在他旁边；传送前后屏幕闪白，理智小幅波动。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import type { Structure } from '../core/types'
import type { FerrenClip } from '../renderer/ferrenAnim'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { recordEntityEncounter } from '../entities'
import { faceToward, los, stepEntity } from './entityAI'
import type { SpecialAction } from './special'

/** 数值表（秒 / 米 / 点）。时长按 FERREN_CLIPS 对齐（stretch 2.8、noclip 2.8、pet 2.4）。 */
export const FR = {
  LEVEL: 102, // 商人之家
  CYCLE: 1200, // 一轮作息（游戏秒）= 维基 24 h（7:00 → 次日 7:00）
  DAY_MIN: 1440,
  START_MIN: 60, // 新开局时钟：8:00（维基分钟，自 7:00 起算）——刚进入上午的娱乐时间
  // 移动
  WALK: 0.45, RUN: 2.2, TROT: 1.1, // 与片段 speed 对齐（walk 0.45 / run 2.2）；TROT = 撒欢 / 跟人时的小跑（walk 片段加快）
  TURN: 8,
  LAP_MARGIN: 0.75, // 绕圈半径 = 笼内半宽 − 这个余量
  // 交互
  USE_R: 1.6, // X 交互距离
  HINT_R: 6, // 状态提示文字的显示距离
  FOLLOW_R: 4, FOLLOW_LOSE: 6, RUB_R: 0.42, // 娱乐时跟人蹭
  PET_T: 2.4, PET_CD: 20, PET_SAN: 3, PET_REP: 1, PET_REP_MAX: 3, // 每轮作息最多 +3 好感（之后摸还加理智，不再加声望）
  DISTURB_REP: -2, DISTURB_CD: 8, DISTURB_T: 1.6,
  TUCK_REP: 2, TUCK_SAN: 2,
  // 切行
  NOCLIP_T: 2.8, NOCLIP_AT: 1.4, // 片段中点完全消失 → 此刻换位
  FLASH_IN: 0.45, FLASH_OUT: 0.7,
  CONTACT_R: 0.6,
  NOCLIP_SAN: -4, NOCLIP_SAN_BACK: 2, NOCLIP_SAN_BACK_T: 1.2, // 带人：先 −4，回过神 +2
  SPONT_RATE: 0.012, // 娱乐/锻炼时每秒自发切行概率
  SPONT_CD: 30, // 两次自发切行最少间隔
  PET_NOCLIP_P: 0.15, // 娱乐时被摸，淘气地切行的概率（摸着的人被一起带走）
  OUT_MIN: 3, OUT_MAX: 8, // 自发切行距离
  OUT_T: 9, OUT_T_RAND: 6, // 切到笼外后逗留多久再切行回笼
  TRAIN_HOP_MIN: 1.4, // 训练切行：笼内至少换这么远
  REACH_DEPTH: 18, // 连通区域搜索深度（格）
  NEST_R: 0.15, BOWL_OFF: 0.26,
}

export type FerrenPhaseKind = 'wake' | 'meal' | 'exercise' | 'play' | 'train' | 'nap' | 'walk' | 'bedtime' | 'sleep'
export interface FerrenPhase { kind: FerrenPhaseKind; zh: string; wiki: string; from: number; to: number }
/** 维基作息表（分钟，自 7:00 起算）。维基 7:20–7:30 的空档并入早餐。 */
export const FERREN_SCHEDULE: FerrenPhase[] = ([
  ['wake', '唤醒', '7:00–7:10', 0, 10],
  ['meal', '早餐', '7:10–7:30', 10, 30],
  ['exercise', '晨练', '7:30–8:00', 30, 60],
  ['play', '娱乐', '8:00–10:00', 60, 180],
  ['train', '训练', '10:00–11:30', 180, 270],
  ['meal', '午餐', '11:30–12:00', 270, 300],
  ['nap', '午睡', '12:00–13:00', 300, 360],
  ['wake', '唤醒', '13:00–13:10', 360, 370],
  ['exercise', '下午锻炼', '13:10–13:40', 370, 400],
  ['play', '娱乐', '13:40–15:30', 400, 510],
  ['train', '训练', '15:30–16:30', 510, 570],
  ['walk', '散步', '16:30–17:00', 570, 600],
  ['meal', '晚餐', '17:00–18:30', 600, 690],
  ['play', '娱乐（释放精力）', '18:30–19:00', 690, 720],
  ['bedtime', '上床', '19:00–21:00', 720, 840],
  ['sleep', '睡觉', '21:00–7:00', 840, 1440],
] as const).map(([kind, zh, wiki, from, to]) => ({ kind, zh, wiki, from, to }))

/** 游戏秒 → 维基分钟（一轮内） */
export const ferrenMinute = (clock: number) => (((clock % FR.CYCLE) + FR.CYCLE) % FR.CYCLE) / FR.CYCLE * FR.DAY_MIN
export function ferrenPhaseIndex(clock: number) {
  const mn = ferrenMinute(clock)
  for (let i = 0; i < FERREN_SCHEDULE.length; i++) if (mn < FERREN_SCHEDULE[i].to) return i
  return FERREN_SCHEDULE.length - 1
}
export const ferrenPhase = (clock: number) => FERREN_SCHEDULE[ferrenPhaseIndex(clock)]
/** 一个时段在一轮里的游戏秒区间 */
export const phaseSeconds = (p: FerrenPhase) => [p.from / FR.DAY_MIN * FR.CYCLE, p.to / FR.DAY_MIN * FR.CYCLE] as const
/** 维基时刻文字（7:00 + 分钟） */
export function ferrenClockText(clock: number) {
  const mn = (Math.floor(ferrenMinute(clock)) + 7 * 60) % 1440
  return `${String(Math.floor(mn / 60)).padStart(2, '0')}:${String(mn % 60).padStart(2, '0')}`
}
/** 当前睡眠段的键（同一段睡眠只能盖一次被子；上床 + 夜间睡眠算同一段） */
export function sleepSessionKey(clock: number): string | null {
  const k = ferrenPhase(clock).kind, cyc = Math.floor(clock / FR.CYCLE)
  if (k === 'nap') return `${cyc}:nap`
  if (k === 'bedtime' || k === 'sleep') return `${cyc}:night`
  return null
}

// ============================================================================
// 运行时状态
// ============================================================================
export interface FerrenSave { clock: number; tuck: string | null; petGain: number; petCycle: number; petCd: number }
export interface FerrenRunState extends FerrenSave {
  disturbCd: number
  prevHeld: boolean
  /** 屏幕闪白 0..1（HUD） */
  flash: number
  /** 带人切行后的理智回升倒计时（>0 时计时，归零 +FR.NOCLIP_SAN_BACK） */
  sanBackT: number
  /** 带人切行的次数（验收/统计） */
  carried: number
  /** 当前「手放在他身上」剩余秒数（摸的时候切行 = 一起带走） */
  touchT: number
}
export const freshFerrenRun = (): FerrenRunState => ({
  clock: FR.START_MIN / FR.DAY_MIN * FR.CYCLE, tuck: null, petGain: 0, petCycle: 0, petCd: 0,
  disturbCd: 0, prevHeld: false, flash: 0, sanBackT: 0, carried: 0, touchT: 0,
})
export function captureFerren(eng: Engine): FerrenSave {
  const r = eng.ferrenRun
  return { clock: r.clock, tuck: r.tuck, petGain: r.petGain, petCycle: r.petCycle, petCd: r.petCd }
}
export function restoreFerren(s: Partial<FerrenSave> | undefined): FerrenRunState {
  const r = freshFerrenRun()
  if (!s) return r
  if (Number.isFinite(s.clock) && (s.clock as number) >= 0) r.clock = s.clock as number
  r.tuck = typeof s.tuck === 'string' ? s.tuck : null
  r.petGain = Number.isFinite(s.petGain) ? Math.max(0, s.petGain as number) : 0
  r.petCycle = Number.isFinite(s.petCycle) ? (s.petCycle as number) : 0
  r.petCd = Number.isFinite(s.petCd) ? Math.max(0, s.petCd as number) : 0
  return r
}

export type FerrenAct =
  | 'goNest' | 'nestSleep' | 'nestStretch' | 'nestSniff' | 'goBowl' | 'eat' | 'lap' | 'idle'
  | 'dance' | 'roll' | 'romp' | 'follow' | 'rub' | 'pet' | 'stand' | 'stretch' | 'sniff' | 'noclip' | 'disturbed' | 'flee' | 'outside'
export interface FerrenNoclip { t: number; dx: number; dy: number; px: number; py: number; done: boolean; carry: boolean; kind: 'spont' | 'train' | 'home' }
export interface FerrenEntState {
  act: FerrenAct; actT: number
  clip: FerrenClip; clipT: number
  /** 本帧实际移动速度（m/s，渲染层按它同步步频） */
  speed: number
  phase: number // 当前作息段下标（变化时重排行为）
  sub: number // 段内行为序列计数
  lapA: number; lapDir: number
  tx: number; ty: number
  inNest: boolean
  outside: boolean; outT: number
  noclip: FerrenNoclip | null
  spontCd: number
  lastHp: number
  rnd: number
}

interface FerrenHome { nx: number; ny: number; bx: number; by: number; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }
const homeCache = new WeakMap<object, FerrenHome>()
/** 窝 / 食盆 / 笼子（mapgenOutpost 放的 ferrennest 结构带笼子内沿 cage0..3；没有窝时以出生点为中心兜底） */
export function ferrenHome(eng: Engine, e?: Entity): FerrenHome {
  const m = eng.map!
  const hit = homeCache.get(m.structures)
  if (hit) return hit
  const nest = m.structures.find((s) => s.kind === 'ferrennest')
  const bowl = m.structures.find((s) => s.kind === 'ferrenbowl')
  const ctr = (s: Structure) => [s.x + s.w / 2, s.y + s.h / 2] as const
  let h: FerrenHome
  if (nest) {
    const [nx, ny] = ctr(nest), d = nest.data ?? {}
    const x0 = Number(d.cage0 ?? nest.x - 1), y0 = Number(d.cage1 ?? nest.y - 1), x1 = Number(d.cage2 ?? nest.x + 2), y1 = Number(d.cage3 ?? nest.y + 2)
    const [bx, by] = bowl ? ctr(bowl) : [(x0 + x1) / 2, (y0 + y1) / 2]
    h = { nx, ny, bx, by, x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
  } else {
    const sx = e?.x ?? m.spawn.x, sy = e?.y ?? m.spawn.y
    h = { nx: sx, ny: sy, bx: sx + 0.8, by: sy, x0: sx - 1.5, y0: sy - 1.5, x1: sx + 1.5, y1: sy + 1.5, cx: sx, cy: sy }
  }
  homeCache.set(m.structures, h)
  return h
}
const inCage = (h: FerrenHome, x: number, y: number, pad = 0) => x > h.x0 + pad && x < h.x1 - pad && y > h.y0 + pad && y < h.y1 - pad

/** 从笼子出发能走到的格（不穿墙 / 围栏 / 实心结构、不过门、不靠近出口、不上楼梯——即商人之家里和笼子连通的同一片地面）；格 → 步数。
 *  格心要能站下 Ferren（r 0.22），相邻两格的交界中点要能过（r 0.08，笼门这种窄口也算连通）。 */
const reachCache = new WeakMap<object, Map<number, number>>()
export function ferrenReach(eng: Engine): Map<number, number> {
  const m = eng.map!
  const c = reachCache.get(m.structures)
  if (c) return c
  const h = ferrenHome(eng)
  const blocked = new Set<number>()
  for (const s of m.structures) if (s.data?.tradersDoor || /door|gate/.test(s.kind))
    for (let y = Math.floor(s.y - 0.6); y <= Math.floor(s.y + s.h + 0.6); y++) for (let x = Math.floor(s.x - 0.6); x <= Math.floor(s.x + s.w + 0.6); x++) blocked.add(y * m.w + x)
  for (const ex of m.exits) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) blocked.add((Math.floor(ex.y) + dy) * m.w + Math.floor(ex.x) + dx)
  const occ = (x: number, y: number, r: number) => canOccupy(m, x, y, r, { z: 0, band: 0 })
  const ok = (x: number, y: number) => x > 0 && y > 0 && x < m.w - 1 && y < m.h - 1 && m.tiles[y * m.w + x] === 1 && !blocked.has(y * m.w + x) && !(m.stair[y * m.w + x] & 7) && occ(x + 0.5, y + 0.5, 0.22)
  const out = new Map<number, number>()
  const q: number[] = []
  const sx = Math.floor(h.cx), sy = Math.floor(h.cy)
  if (ok(sx, sy)) { out.set(sy * m.w + sx, 0); q.push(sy * m.w + sx) }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], d = out.get(i)!
    if (d >= FR.REACH_DEPTH) continue
    const x = i % m.w, y = (i - x) / m.w
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ax, ny = y + ay, ni = ny * m.w + nx
      if (out.has(ni) || !ok(nx, ny)) continue
      if (!occ(x + 0.5 + ax * 0.5, y + 0.5 + ay * 0.5, 0.08)) continue
      out.set(ni, d + 1); q.push(ni)
    }
  }
  reachCache.set(m.structures, out)
  return out
}
/** 两点之间是否走得过去（沿线每 0.15 m 量一次，能卡住 Ferren 的细围栏也算挡） */
export function ferrenClear(eng: Engine, x0: number, y0: number, x1: number, y1: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.15))
  for (let i = 1; i <= n; i++) { const k = i / n; if (!canOccupy(eng.map!, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 0.12, { z: 0, band: 0 })) return false }
  return true
}
/** 切行落点是否合法：连通区域内、Ferren 与玩家都能站（不进墙 / 实心结构） */
export function ferrenSpotOk(eng: Engine, x: number, y: number, r = 0.22): boolean {
  const m = eng.map!
  const tx = Math.floor(x), ty = Math.floor(y)
  if (!ferrenReach(eng).has(ty * m.w + tx)) return false
  return canOccupy(m, x, y, r, { z: 0, band: 0 })
}
/** 落点旁边给玩家找一个能站的位置（0.45–0.9 m 环） */
export function playerLanding(eng: Engine, x: number, y: number, face: number): { x: number; y: number } | null {
  for (const r of [0.55, 0.7, 0.9, 0.45])
    for (let k = 0; k < 12; k++) {
      const a = face + Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6)
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
      if (ferrenSpotOk(eng, px, py, PLAYER_RADIUS)) return { x: px, y: py }
    }
  return null
}
/** 选一个切行目的地 */
export function pickNoclipDest(eng: Engine, e: Entity, kind: FerrenNoclip['kind'], rnd = Math.random): { x: number; y: number } | null {
  const h = ferrenHome(eng, e), m = eng.map!
  const good = (x: number, y: number) => ferrenSpotOk(eng, x, y) && !!playerLanding(eng, x, y, Math.atan2(y - e.y, x - e.x))
  if (kind === 'train' || kind === 'home') {
    for (let t = 0; t < 40; t++) {
      const x = h.x0 + 0.4 + rnd() * (h.x1 - h.x0 - 0.8), y = h.y0 + 0.4 + rnd() * (h.y1 - h.y0 - 0.8)
      if (kind === 'train' && Math.hypot(x - e.x, y - e.y) < FR.TRAIN_HOP_MIN) continue
      if (Math.hypot(x - h.nx, y - h.ny) < 0.3 || Math.hypot(x - h.bx, y - h.by) < 0.3) continue
      if (good(x, y)) return { x, y }
    }
    return null
  }
  const cands: number[] = []
  for (const i of ferrenReach(eng).keys()) {
    const x = (i % m.w) + 0.5, y = Math.floor(i / m.w) + 0.5
    const d = Math.hypot(x - e.x, y - e.y)
    if (d >= FR.OUT_MIN && d <= FR.OUT_MAX && !inCage(h, x, y)) cands.push(i)
  }
  for (let t = 0; t < 24 && cands.length; t++) {
    const i = cands[Math.floor(rnd() * cands.length)]
    const x = (i % m.w) + 0.25 + rnd() * 0.5, y = Math.floor(i / m.w) + 0.25 + rnd() * 0.5
    const d = Math.hypot(x - e.x, y - e.y)
    if (d >= FR.OUT_MIN && d <= FR.OUT_MAX && ferrenReach(eng).has(Math.floor(y) * m.w + Math.floor(x)) && good(x, y)) return { x, y }
  }
  return null
}

// ============================================================================
// 实体 AI
// ============================================================================
function ensureState(eng: Engine, e: Entity): FerrenEntState {
  if (e.fr) return e.fr
  const s: FerrenEntState = {
    act: 'idle', actT: 0, clip: 'idle', clipT: 0, speed: 0, phase: -1, sub: 0, lapA: 0, lapDir: 1,
    tx: e.x, ty: e.y, inNest: false, outside: false, outT: 0, noclip: null, spontCd: FR.SPONT_CD * 0.5, lastHp: e.hp, rnd: Math.random(),
  }
  e.fr = s
  // 第一次见到：按当前时段直接摆好（睡觉 → 窝里；进食 → 食盆边）
  const h = ferrenHome(eng, e), k = ferrenPhase(eng.ferrenRun.clock).kind
  if (k === 'sleep' || k === 'nap' || k === 'wake') { e.x = h.nx; e.y = h.ny }
  else if (k === 'meal') { const [x, y] = bowlSpot(h); e.x = x; e.y = y }
  return s
}
const bowlSpot = (h: FerrenHome) => { const a = Math.atan2(h.cy - h.by, h.cx - h.bx); return [h.bx + Math.cos(a) * FR.BOWL_OFF, h.by + Math.sin(a) * FR.BOWL_OFF] as const }
const setAct = (s: FerrenEntState, act: FerrenAct, t: number) => { s.act = act; s.actT = t }
const play = (s: FerrenEntState, clip: FerrenClip, dt: number) => { if (s.clip !== clip) { s.clip = clip; s.clipT = 0 } else s.clipT += dt }

/** 走向 (tx,ty)；到达返回 true。走路片段 + 记录实际速度 */
function moveTo(eng: Engine, e: Entity, s: FerrenEntState, tx: number, ty: number, speed: number, dt: number, clip: FerrenClip = speed > 1.5 ? 'run' : 'walk', stop = 0.12): boolean {
  const d = Math.hypot(tx - e.x, ty - e.y)
  if (d <= stop) { s.speed = 0; return true }
  const ox = e.x, oy = e.y, f0 = e.facing
  e.targetX = tx; e.targetY = ty
  const v = Math.min(speed, d / Math.max(dt, 1e-3))
  let stuck = false
  if (d < 0.32) {
    // stepEntity 在 0.3 m 内就当作「到了」：最后这一小段自己走（窝 / 食盆 / 蹭人要贴得更近）
    const k = Math.min(1, (v * dt) / d), nx = e.x + (tx - e.x) * k, ny = e.y + (ty - e.y) * k
    if (canOccupy(eng.map!, nx, ny, 0.12, { z: e.z, band: 0 })) { e.x = nx; e.y = ny } else stuck = true
  } else stuck = stepEntity(eng, e, v, dt)
  const moved = Math.hypot(e.x - ox, e.y - oy)
  s.speed = moved / Math.max(dt, 1e-3)
  e.facing = f0; faceToward(eng, e, tx, ty, dt, FR.TURN)
  e.animT += moved * 4
  play(s, moved > 1e-4 ? clip : 'idle', dt)
  if (Math.hypot(tx - e.x, ty - e.y) <= stop) return true
  return stuck && moved < 1e-4 // stepEntity 卡住
}

function lapStep(eng: Engine, e: Entity, s: FerrenEntState, h: FerrenHome, speed: number, dt: number) {
  const R = Math.max(0.5, Math.min(h.x1 - h.x0, h.y1 - h.y0) / 2 - FR.LAP_MARGIN)
  if (s.act !== 'lap') { s.lapA = Math.atan2(e.y - h.cy, e.x - h.cx); setAct(s, 'lap', 0) }
  const tx = h.cx + Math.cos(s.lapA) * R, ty = h.cy + Math.sin(s.lapA) * R
  if (moveTo(eng, e, s, tx, ty, speed, dt, speed > 1.5 ? 'run' : 'walk', 0.25)) s.lapA += s.lapDir * 0.5
}

function startNoclip(eng: Engine, e: Entity, s: FerrenEntState, kind: FerrenNoclip['kind'], rnd = Math.random): boolean {
  const dest = pickNoclipDest(eng, e, kind, rnd)
  if (!dest) return false
  s.noclip = { t: 0, dx: dest.x, dy: dest.y, px: e.x, py: e.y, done: false, carry: false, kind }
  setAct(s, 'noclip', FR.NOCLIP_T); s.clip = 'noclip'; s.clipT = 0; s.speed = 0
  return true
}
/** 此刻和他有身体接触：中心距 ≤ CONTACT_R，或正在摸他 */
export function ferrenContact(eng: Engine, e: Entity): boolean {
  const p = eng.player
  if (p.hp <= 0 || eng.over || eng.player.level !== FR.LEVEL) return false
  const d = Math.hypot(p.x - e.x, p.y - e.y)
  return d <= FR.CONTACT_R || (eng.ferrenRun.touchT > 0 && d <= FR.USE_R)
}
function noclipStep(eng: Engine, e: Entity, s: FerrenEntState, dt: number) {
  const n = s.noclip!
  n.t += dt; s.clipT = n.t; s.clip = 'noclip'; s.speed = 0
  const r = eng.ferrenRun
  if (!n.done && n.t >= FR.NOCLIP_AT - FR.FLASH_IN && ferrenContact(eng, e)) r.flash = Math.max(r.flash, (n.t - (FR.NOCLIP_AT - FR.FLASH_IN)) / FR.FLASH_IN)
  if (!n.done && n.t >= FR.NOCLIP_AT) {
    n.done = true
    const p = eng.player
    const carry = ferrenContact(eng, e)
    const fromX = e.x, fromY = e.y
    e.x = n.dx; e.y = n.dy; e.targetX = e.x; e.targetY = e.y
    const h = ferrenHome(eng, e)
    s.outside = !inCage(h, e.x, e.y)
    s.outT = s.outside ? FR.OUT_T + Math.random() * FR.OUT_T_RAND : 0
    if (carry) {
      const land = playerLanding(eng, e.x, e.y, Math.atan2(e.y - fromY, e.x - fromX))
      if (land) {
        n.carry = true
        p.x = land.x; p.y = land.y; p.vz = 0
        r.flash = 1; r.carried++; r.touchT = 0
        p.sanity = Math.max(0, Math.min(100, p.sanity + FR.NOCLIP_SAN))
        r.sanBackT = FR.NOCLIP_SAN_BACK_T
        eng.msg('眼前一阵发白——你和 Ferren 一起「切行」到了别处。（理智小幅波动）', 'system')
      }
    }
  }
  if (n.t >= FR.NOCLIP_T) { s.noclip = null; setAct(s, 'idle', 0.6); s.sub++ }
}

/** 段内行为序列（每段开始 sub = 0；一个动作做完 sub++ 选下一个） */
function phaseBehavior(eng: Engine, e: Entity, s: FerrenEntState, dt: number) {
  const clk = eng.ferrenRun.clock, pi = ferrenPhaseIndex(clk), ph = FERREN_SCHEDULE[pi]
  const h = ferrenHome(eng, e), p = eng.player
  if (pi !== s.phase) { s.phase = pi; s.sub = 0; setAct(s, 'idle', 0); s.lapDir = Math.random() < 0.5 ? 1 : -1 }
  s.spontCd -= dt
  const wasOut = s.outside
  s.outside = !inCage(h, e.x, e.y)
  if (s.outside && !wasOut && s.outT <= 0) s.outT = FR.OUT_T // 跟着人走出了笼门，也算「在外面」：过一会儿切行回笼
  // 不在笼里：除了娱乐 / 锻炼（自发切行出去逛的那一会儿），一律先切行回笼
  if (s.outside) {
    s.outT -= dt
    const playful = ph.kind === 'play' || ph.kind === 'exercise'
    if ((!playful || s.outT <= 0) && s.act !== 'pet' && startNoclip(eng, e, s, 'home')) return
  }
  const dist = Math.hypot(p.x - e.x, p.y - e.y)
  const near = p.level === FR.LEVEL && p.hp > 0 && dist < FR.FOLLOW_R && ferrenClear(eng, e.x, e.y, p.x, p.y)
  s.inNest = false
  switch (ph.kind) {
    case 'sleep': case 'nap': {
      if (s.act !== 'nestSleep') { if (moveTo(eng, e, s, h.nx, h.ny, FR.WALK, dt, 'walk', FR.NEST_R * 0.5)) { setAct(s, 'nestSleep', 0); e.x = h.nx; e.y = h.ny; s.inNest = true; s.clip = 'sleep'; s.clipT = 0 } return }
      s.inNest = true; s.speed = 0; play(s, 'sleep', dt); return
    }
    case 'bedtime': {
      if (s.act === 'nestSleep') { s.inNest = true; s.speed = 0; play(s, 'sleep', dt); return }
      if (Math.hypot(e.x - h.nx, e.y - h.ny) > FR.NEST_R) { moveTo(eng, e, s, h.nx, h.ny, FR.WALK, dt, 'walk', FR.NEST_R * 0.5); setAct(s, 'goNest', 0); return }
      e.x = h.nx; e.y = h.ny; s.inNest = true; s.speed = 0
      if (s.act === 'goNest' || s.act === 'idle' && s.sub === 0) { setAct(s, 'nestSniff', 3); s.clip = 'sniff'; s.clipT = 0; s.sub = 1 }
      s.actT -= dt
      if (s.act === 'nestSniff') { play(s, 'sniff', dt); if (s.actT <= 0) { setAct(s, 'nestStretch', FR.NOCLIP_T); s.clip = 'stretch'; s.clipT = 0 } return }
      if (s.act === 'nestStretch') { play(s, 'stretch', dt); if (s.actT <= 0) setAct(s, 'nestSleep', 0); return }
      setAct(s, 'nestSleep', 0); return
    }
    case 'wake': {
      if (Math.hypot(e.x - h.nx, e.y - h.ny) > FR.NEST_R * 2 && s.sub === 0) s.sub = 2
      if (s.sub === 0) { s.inNest = true; setAct(s, 'nestStretch', FR.NOCLIP_T); s.clip = 'stretch'; s.clipT = 0; s.sub = 1 }
      s.actT -= dt
      if (s.sub === 1) { s.inNest = true; s.speed = 0; play(s, 'stretch', dt); if (s.actT <= 0) { s.sub = 2; setAct(s, 'stand', 3) } return }
      if (s.act === 'stand') { s.inNest = Math.hypot(e.x - h.nx, e.y - h.ny) < FR.NEST_R * 2; s.speed = 0; play(s, 'stand', dt); if (s.actT <= 0) setAct(s, 'idle', 1e9); return }
      s.speed = 0; play(s, 'idle', dt); return
    }
    case 'meal': {
      const [bx, by] = bowlSpot(h)
      if (s.act !== 'eat') { if (moveTo(eng, e, s, bx, by, FR.WALK * 1.6, dt, 'walk', 0.08)) setAct(s, 'eat', 0); return }
      s.speed = 0; faceToward(eng, e, h.bx, h.by, dt, FR.TURN); play(s, 'eat', dt); return
    }
    case 'exercise': {
      if (s.spontCd <= 0 && Math.random() < FR.SPONT_RATE * dt) { s.spontCd = FR.SPONT_CD; if (startNoclip(eng, e, s, 'spont')) return }
      if (s.outside) { outsideStep(s, dt); return }
      lapStep(eng, e, s, h, FR.RUN, dt); return
    }
    case 'walk': {
      if (s.act === 'pet') { petStep(eng, e, s, dt); return }
      lapStep(eng, e, s, h, FR.WALK, dt); return
    }
    case 'play': {
      if (s.act === 'pet') { petStep(eng, e, s, dt); return }
      if (s.spontCd <= 0 && Math.random() < FR.SPONT_RATE * dt) { s.spontCd = FR.SPONT_CD; if (startNoclip(eng, e, s, 'spont')) return }
      // 跟着玩家蹭
      if (near && s.act !== 'dance' && s.act !== 'roll') {
        const a = Math.atan2(e.y - p.y, e.x - p.x)
        const tx = p.x + Math.cos(a) * FR.RUB_R, ty = p.y + Math.sin(a) * FR.RUB_R
        if (dist > FR.RUB_R + 0.12) { setAct(s, 'follow', 0); moveTo(eng, e, s, tx, ty, FR.TROT, dt, 'walk', 0.05) }
        else { setAct(s, 'rub', 0); s.speed = 0; faceToward(eng, e, p.x, p.y, dt, FR.TURN); play(s, 'pet', dt) }
        return
      }
      if ((s.act === 'follow' || s.act === 'rub') && !near) setAct(s, 'idle', 0)
      if (s.outside && s.act === 'idle') { outsideStep(s, dt); return }
      s.actT -= dt
      if (s.act === 'romp') { if (moveTo(eng, e, s, s.tx, s.ty, FR.TROT, dt, 'walk', 0.15) || s.actT <= 0) setAct(s, 'idle', 0); return }
      if (s.act === 'dance') { s.speed = 0; play(s, 'wardance', dt); if (s.actT <= 0) setAct(s, 'idle', 0); return }
      if (s.act === 'roll') { s.speed = 0; play(s, 'roll', dt); if (s.actT <= 0) setAct(s, 'idle', 0); return }
      if (s.act === 'idle' && s.actT > 0) { s.speed = 0; play(s, 'idle', dt); return }
      // 下一个娱乐动作：战舞 → 撒欢 → 打滚 → 撒欢 → 歇一下（循环）
      const k = s.sub++ % 5
      if (k === 0) { setAct(s, 'dance', 1.3 * (2 + Math.floor(Math.random() * 3))); s.clip = 'wardance'; s.clipT = 0 }
      else if (k === 2) { setAct(s, 'roll', 1.8 * (1 + Math.floor(Math.random() * 2))); s.clip = 'roll'; s.clipT = 0 }
      else if (k === 4) { setAct(s, 'idle', 1.5 + Math.random() * 2) }
      else {
        const c = s.outside ? { x0: e.x - 1.5, y0: e.y - 1.5, x1: e.x + 1.5, y1: e.y + 1.5 } : h
        let ok = false
        for (let t = 0; t < 10 && !ok; t++) {
          const x = c.x0 + 0.45 + Math.random() * (c.x1 - c.x0 - 0.9), y = c.y0 + 0.45 + Math.random() * (c.y1 - c.y0 - 0.9)
          if (ferrenSpotOk(eng, x, y, 0.2) && ferrenClear(eng, e.x, e.y, x, y)) { s.tx = x; s.ty = y; ok = true }
        }
        setAct(s, ok ? 'romp' : 'idle', ok ? 5 : 1)
      }
      return
    }
    case 'train': {
      if (s.act === 'disturbed') { s.actT -= dt; s.speed = 0; faceToward(eng, e, p.x, p.y, dt, FR.TURN); play(s, 'stand', dt); if (s.actT <= 0) setAct(s, 'idle', 0); return }
      s.actT -= dt
      if (s.actT > 0 && s.act !== 'idle') { s.speed = 0; play(s, s.act === 'stand' ? 'stand' : s.act === 'stretch' ? 'stretch' : 'sniff', dt); return }
      if (s.act === 'idle' && s.actT > 0) { s.speed = 0; play(s, 'idle', dt); return }
      // 训练序列：站立张望 → 嗅 → 切行练习（笼内另一侧）→ 歇 → 伸展（维基：最后让他做伸展运动）
      const k = s.sub++ % 5
      if (k === 0) { setAct(s, 'stand', 4); s.clip = 'stand'; s.clipT = 0 }
      else if (k === 1) { setAct(s, 'sniff', 3.5); s.clip = 'sniff'; s.clipT = 0 }
      else if (k === 2) { if (!startNoclip(eng, e, s, 'train')) setAct(s, 'idle', 1) }
      else if (k === 3) setAct(s, 'idle', 2)
      else { setAct(s, 'stretch', FR.NOCLIP_T); s.clip = 'stretch'; s.clipT = 0 }
      return
    }
  }
}
function outsideStep(s: FerrenEntState, dt: number) {
  // 切到笼外：原地嗅一嗅、张望（不乱跑，过一会儿切行回笼）
  s.speed = 0
  play(s, s.outT % 6 > 3 ? 'sniff' : 'stand', dt)
}
function petStep(eng: Engine, e: Entity, s: FerrenEntState, dt: number) {
  s.actT -= dt; s.speed = 0
  faceToward(eng, e, eng.player.x, eng.player.y, dt, FR.TURN)
  play(s, 'pet', dt)
  if (s.actT <= 0) setAct(s, 'idle', 0.5)
}

/** 实体循环入口（entityAI.updateEntities 里接管 ferren，不走通用状态机） */
export function updateFerren(eng: Engine, e: Entity, dt: number) {
  // 只出现在商人之家、只有 1 只
  if (eng.levelDef.id !== FR.LEVEL || eng.map!.entities.some((o) => o !== e && o.def.type === 'ferren' && !o.dead && o.id < e.id)) {
    e.dead = true; e.hidden = true; e.deathT = 0; return
  }
  const s = ensureState(eng, e)
  if (!e.encountered && Math.hypot(eng.player.x - e.x, eng.player.y - e.y) < e.def.sight && los(eng, eng.player.x, eng.player.y, e.x, e.y)) recordEntityEncounter(e) // 图鉴登记
  e.state = 'idle'; e.provoked = false
  // 被打：不反击，惊得窜到笼子另一侧
  if (e.hp < s.lastHp) {
    s.lastHp = e.hp
    if (!s.noclip) { const h = ferrenHome(eng, e); s.tx = h.cx * 2 - e.x; s.ty = h.cy * 2 - e.y; if (!ferrenSpotOk(eng, s.tx, s.ty)) { s.tx = h.cx; s.ty = h.cy } setAct(s, 'flee', 2.5) }
  }
  if (e.stunT > 0) e.stunT -= dt
  if (s.noclip) { noclipStep(eng, e, s, dt); return }
  if (s.act === 'flee') {
    s.actT -= dt
    if (moveTo(eng, e, s, s.tx, s.ty, FR.RUN, dt, 'run', 0.2) || s.actT <= 0) { setAct(s, 'idle', 1); s.phase = -1 }
    return
  }
  phaseBehavior(eng, e, s, dt)
}

// ============================================================================
// 世界步进（engine.step 每帧调用，任何层级都走时钟）+ X 键
// ============================================================================
export function ferrenEntity(eng: Engine): Entity | null {
  if (!eng.map || eng.levelDef.id !== FR.LEVEL) return null
  return eng.map.entities.find((e) => e.def.type === 'ferren' && !e.dead) ?? null
}
type FerrenUse = { kind: 'pet' | 'disturb' | 'tuck'; e: Entity; cd: number }
/** 此刻 X 能对 Ferren 做什么（null = 不在旁边 / 这个时段没有可做的） */
export function ferrenUse(eng: Engine): FerrenUse | null {
  const e = ferrenEntity(eng)
  if (!e || !e.fr || eng.over || eng.player.hp <= 0) return null
  if (Math.hypot(eng.player.x - e.x, eng.player.y - e.y) > FR.USE_R) return null
  if (e.fr.noclip) return null
  const r = eng.ferrenRun, k = ferrenPhase(r.clock).kind
  if (k === 'play' || k === 'walk') return { kind: 'pet', e, cd: r.petCd }
  if (k === 'train') return { kind: 'disturb', e, cd: r.disturbCd }
  if (k === 'sleep' || k === 'nap' || (k === 'bedtime' && e.fr.act === 'nestSleep')) {
    if (!e.fr.inNest || r.tuck === sleepSessionKey(r.clock)) return null
    return { kind: 'tuck', e, cd: 0 }
  }
  return null
}
export function ferrenSpecial(eng: Engine): SpecialAction | null {
  const u = ferrenUse(eng)
  if (!u) return null
  if (u.kind === 'pet') return { id: 'ferren-pet', label: '摸摸 Ferren', hint: u.cd > 0 ? `它刚被摸过，过 ${Math.ceil(u.cd)} 秒再逗它` : '摸一摸、逗它玩（理智 +，B.N.T.G. 好感 +）', hold: false }
  if (u.kind === 'disturb') return { id: 'ferren-disturb', label: '逗 Ferren', hint: '他在训练——B.N.T.G. 不希望有人打扰（声望 −）', hold: false }
  return { id: 'ferren-tuck', label: '盖被子', hint: '给睡着的 Ferren 盖好小被子（B.N.T.G. 好感 +，每次入睡只能盖一次）', hold: false }
}
/** 按下 X（点按，取上升沿） */
export function ferrenPress(eng: Engine): boolean {
  const u = ferrenUse(eng)
  if (!u) return false
  const r = eng.ferrenRun, p = eng.player, s = u.e.fr!
  const cyc = Math.floor(r.clock / FR.CYCLE)
  if (u.kind === 'pet') {
    if (r.petCd > 0) { eng.msg(`Ferren 刚被摸过，正忙着玩别的。（${Math.ceil(r.petCd)} 秒后再来）`, 'system'); return true }
    r.petCd = FR.PET_CD; r.touchT = FR.PET_T
    setAct(s, 'pet', FR.PET_T); s.clip = 'pet'; s.clipT = 0; s.speed = 0
    p.sanity = Math.min(100, p.sanity + FR.PET_SAN)
    if (r.petCycle !== cyc) { r.petCycle = cyc; r.petGain = 0 }
    if (r.petGain < FR.PET_REP_MAX) { r.petGain += FR.PET_REP; eng.changeRep('bntg', FR.PET_REP) }
    eng.msg('你摸了摸 Ferren 的脑袋，它眯着眼往你手心里蹭。（理智 +）', 'loot')
    // 淘气：娱乐时被摸，偶尔就这么切行了——摸着它的人一起被带走
    if (ferrenPhase(r.clock).kind === 'play' && Math.random() < FR.PET_NOCLIP_P && s.spontCd <= 0) {
      s.spontCd = FR.SPONT_CD
      const n0 = s.noclip
      if (!n0 && startNoclip(eng, u.e, s, 'spont')) s.noclip!.t = 0
    }
    return true
  }
  if (u.kind === 'disturb') {
    if (r.disturbCd > 0) { eng.msg('Ferren 还在训练。B.N.T.G. 的看护人已经警告过你了。', 'system'); return true }
    r.disturbCd = FR.DISTURB_CD
    eng.changeRep('bntg', FR.DISTURB_REP)
    eng.msg('⚠ 训练时请勿打扰 Ferren——B.N.T.G. 的看护人朝你皱起了眉。（B.N.T.G. 声望 −）', 'damage')
    if (!s.noclip) { setAct(s, 'disturbed', FR.DISTURB_T) }
    return true
  }
  r.tuck = sleepSessionKey(r.clock)
  eng.changeRep('bntg', FR.TUCK_REP)
  p.sanity = Math.min(100, p.sanity + FR.TUCK_SAN)
  eng.msg('你把小被子轻轻盖在 Ferren 身上。它在梦里咂了咂嘴。', 'loot')
  return true
}

/** 每帧：走作息时钟、冷却、闪白衰减、理智回升、X 上升沿 */
export function stepFerrenWorld(eng: Engine, dt: number) {
  const r = eng.ferrenRun
  r.clock += dt
  r.petCd = Math.max(0, r.petCd - dt); r.disturbCd = Math.max(0, r.disturbCd - dt); r.touchT = Math.max(0, r.touchT - dt)
  if (r.tuck && r.tuck !== sleepSessionKey(r.clock)) r.tuck = null
  const e = ferrenEntity(eng)
  const flashing = !!e?.fr?.noclip && !e.fr.noclip.done && e.fr.noclip.t >= FR.NOCLIP_AT - FR.FLASH_IN && ferrenContact(eng, e)
  if (!flashing) r.flash = Math.max(0, r.flash - dt / FR.FLASH_OUT)
  if (r.sanBackT > 0) { r.sanBackT -= dt; if (r.sanBackT <= 0) eng.player.sanity = Math.min(100, eng.player.sanity + FR.NOCLIP_SAN_BACK) }
  const held = !!eng.specialHeld
  // Only consume the tap when Ferren actually handles it; merchants share this input.
  if ((eng.specialPressed || held && !r.prevHeld) && ferrenPress(eng)) eng.specialPressed = false
  r.prevHeld = held
}

/** HUD：闪白 + 状态提示（当前时段在做什么） */
export function ferrenOverlay(eng: Engine): { flash: number; hint: string } {
  const r = eng.ferrenRun, e = ferrenEntity(eng)
  let hint = ''
  if (e && e.fr && Math.hypot(eng.player.x - e.x, eng.player.y - e.y) < FR.HINT_R) hint = ferrenStatusText(eng, e)
  return { flash: Math.min(1, r.flash), hint }
}
export function ferrenStatusText(eng: Engine, e: Entity): string {
  const r = eng.ferrenRun, ph = ferrenPhase(r.clock), s = e.fr
  const t = `〔${ferrenClockText(r.clock)} · ${ph.zh}〕`
  if (s?.noclip) return t + 'Ferren 缩成一小团，闪了几下——它在「切行」！'
  if (s?.act === 'pet') return t + 'Ferren 眯着眼蹭你的手。'
  if (s?.act === 'flee') return t + 'Ferren 被吓得窜到了一边。'
  if (s?.outside) return t + 'Ferren 切行到了笼子外面，正东嗅西嗅——过一会儿它会自己切行回笼。'
  switch (ph.kind) {
    case 'wake': return t + 'Ferren 刚被叫醒，正在窝里伸懒腰。'
    case 'meal': return t + `Ferren 埋头在食盆边吃${ph.zh}。`
    case 'exercise': return t + `Ferren 在笼子里一圈圈飞奔——${ph.zh}时间。`
    case 'play': return t + (s?.act === 'rub' || s?.act === 'follow' ? 'Ferren 跟在你脚边蹭来蹭去，想让你陪它玩。' : 'Ferren 的娱乐时间：蹦来蹦去、打滚撒欢，也愿意被摸。')
    case 'train': return t + 'Ferren 正在训练（站立、嗅探、伸展和切行练习）。B.N.T.G. 希望流浪者不要打扰。'
    case 'walk': return t + 'Ferren 在笼子里慢慢绕圈散步，可以摸摸它。'
    case 'bedtime': return t + (s?.act === 'nestSleep' ? (r.tuck ? 'Ferren 盖着小被子躺在窝里。' : 'Ferren 躺进窝里准备睡了——可以给它盖被子。') : 'Ferren 被安顿回窝里，正准备上床。')
    case 'nap': case 'sleep': return t + (r.tuck === sleepSessionKey(r.clock) ? 'Ferren 盖着小被子，蜷在窝里睡得正香。' : `Ferren 蜷在窝里${ph.kind === 'nap' ? '午睡' : '睡着了'}。`)
  }
}
