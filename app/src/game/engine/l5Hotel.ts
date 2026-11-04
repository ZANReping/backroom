// L5「恐怖旅馆」第一期 1a：酒店关注度 / 换班（音乐停唱）/ 自洁 / 门时钟与活门 / 氛围事件 / 床上休息。
// 设计见 /workspace/work/l5-expand/level-design.md（ZAN 10-30 确认：全按推荐，不管联机）。
// 关注度是每个存档一份的隐藏值（0–100），不在 HUD 显示；「住客登记簿」面板只显示档位与抖动指针。
// 换班 / 门时钟全部是（种子, 世界时间）的纯函数——自检脚本可直接验证确定性。
import { stepL5Map, restoreL5MapSave, type L5MapSave } from '../content/l5Map' // [l5map]
import { stepCasino, restoreCasinoSave, type CasinoSave } from './casinoAI' // [casino]
import type { Engine } from '../engine'
import { rememberOutpostEntry } from './outpostReturn'
import { restoreTails, stepTails, hotelHasInvite, type TailsSave } from './l5Tails' // [l5tails]
import type { Structure, GroundItem } from '../core/types'
import { h32 } from '../world/infinite'
import { l5RegionAt, type L5Variant } from '../world/infiniteL5'
import { audio } from '../core/audio'
import { ITEMS } from '../content/items' // [l5items]
import { L5_FLOORS } from '../world/infiniteL5'
import { updateVanish } from './l5Elevator'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { resetMoveVelocity } from './moveTuning'
import { enterOutpost } from './level' // [l5tails]
import type { SpecialAction } from './special'
import { L5_RULE, ruleCardAt, type L5RuleCard, type L5RuleId } from '../content/l5Rules'
import { phonoSyncData, restoreObj, stepObjects, stepFateDie, phonoKey, objSave, o18RoomKey, rollFateDie, CARD_REST_MUL, CARD_REISSUE_ATTN, LOCKER_SLOTS, cardOpens, o18DoorLocked, o18LiftProgress, type L5ObjSave, type L5ObjHooks } from './l5Objects' // [l5items]
import { conciergeStartLift } from './conciergeAI' // [l5items]
import { beastSpawnPeripheral } from './beastAI' // [l5items]
import { NORMAL_LEVELS } from '../levels' // [l5items]
import { restoreMaidSave, stepMaidWorld, maidPress, type MaidSave } from './maidAI'
import { restoreConciergeSave, stepConciergeWorld, conciergePress, type ConciergeSave } from './conciergeAI'
import { restoreBellhopSave, stepBellhopWorld, bellhopPress, bellhopDistantBell, type BellhopSave } from './bellhopAI'
import { restoreChefSave, stepChefGlobal, stepChefWorld, chefPress, type ChefSave } from './chefAI' // [chef]
import { restoreJazzSave, stepJazzGlobal, stepJazzWorld, jazzPress, type JazzSave } from './jazzAI' // [jazz]
import { restoreSpokesSave, stepSpokesGlobal, spokesPress, spokesSnapshot, spokesLobbyArrive, spokesOfficeArrive, type SpokesSave } from './spokesAI' // [spokes]
import { restoreBeastSave, stepBeastGlobal, beastPress, beastAttnFull, beastNoteFlip, beastPortraitStare, beastOfficeArrive, type BeastSave } from './beastAI'

const h01 = (...n: number[]) => h32(...n) / 4294967296

// ---------- 调参表 ----------
export const HT = {
  // 关注度来源（每秒 / 每次）
  attnRun: 0.6, attnStaff: 0.4, attnDark: 0.3, darkDelay: 20, darkR: 5.5,
  attnGun: 6, attnBreak: 4, attnMelee: 2, attnDnd: 8,
  attnDecay: 0.25, attnRest: 1.5, restSanity: 0.5, attnRuleTrue: 3,
  shiftMul: 2,
  tiers: [25, 50, 75, 100] as const,
  gazeSanity: 20, gazeDrop: 70,
  // 换班
  shiftEvery: [480, 720] as const, shiftWarn: 60, shiftLen: 45, shiftDim: 0.3,
  tuneLen: [90, 180] as const, tunes: 5,
  hearShift: 1.2, hearClean: 1.3,
  // 自洁（不在任何视线内多久后清除）
  cleanDecal: [90, 150] as const, cleanItem: 180 /* 实体尸体本就 1.4 s 内淡出；L5 的 corpse 结构是可搜索容器，不清 */, lostCap: 40, cleanDoor: 300,
  unseenNear: 6, unseenCone: 0.9, // 6 m 内一律算「看得见」；视锥半角（弧度）
  // 门
  doorCycle: 360, doorOpenFrac: 0.3, doorOpenLen: 120, liveDoor: 0.03, liveMin: 20, liveSpan: 40, dnd: 0.04,
  scanR: 26, scanEvery: 0.25,
  // 1b 空间
  stareDelay: 3, attnStare: 2, stareSan: 1.5, stareCone: 0.13, stareR: 10, attnFlip: 3,
  bevGo: [0.7, 0.25, 0.05] as const, // 贝弗莉门：主厅 / 锅炉房 / 休息室
  mahjongR: 2.5, mahjongPush: 1.2, mahjongSan: 2, tileHold: 4, tileReach: 1.8, tileSan: 15, attnTile: 10,
  heatThirst: 2.5, heatStamina: 0.3,
  steam: [6, 1, 2] as const, steamP: 0.35, steamR: 2.5, steamDmg: 8, valveCd: 600, furnaceR: 2, furnaceSan: 0.5,
  // 氛围
  partyEvery: [40, 90] as const, whisperSan: 60, tapEvery: [300, 480] as const,
  bellEvery: [14, 30] as const, // 「关照」档：远处行李员铃声（[bellhop] 他在同层时从他所在的位置发出）
  stepsEvery: [2.5, 5] as const, // 换班：走廊脚步/推车
}

export type HotelTier = 0 | 1 | 2 | 3 | 4
export const HOTEL_TIER_NAMES = ['宾客', '留意', '关照', '清理', '注视'] as const
export function l5Tier(attn: number): HotelTier {
  let t = 0
  for (const v of HT.tiers) if (attn >= v) t++
  return t as HotelTier
}

// ---------- 状态 ----------
// 局内状态（随存档快照；新一局清零）
export interface HotelLostItem { type: string; count: number; dur?: number; blood?: number; mag?: string[]; ammoSel?: string; stage?: number; cyl?: number; t: number }
export interface HotelState {
  v: 1
  attn: number
  stay: number // 本局在 L5 的累计秒数
  lost: HotelLostItem[] // 失物招领（先进先出，上限 HT.lostCap）
  staff: Record<string, number> // 员工关系值 −100..100（员工期）
  floor: number // 当前楼层（0=B1，1–12；从别的层级进入 L5 时回到 1F）
  tile: number // 贝弗莉室麻将牌：0=还没取 / 1=已取（每局一次）
  read: string[] // 1c：本局读过的住客须知条目（首次读到真规则 −3）
  pocket?: { kind: 'beast' | 'lobby' | 'casino'; floor: number; mapSeed: number } // 1c：口袋房间返程（[casino] Level 5.1 同款返程）
  casino?: CasinoSave // [casino] Level 5.1：紫筹码余额（野兽拖进来 −50）/ 被拖次数 / 来访次数
  casinoDragPending?: 1 // [casino] 野兽拖进赌场：到达时出字幕
  maid?: MaidSave // [maid] 管家：失物车（被打扫 / 捡走的东西）与警告 / 打扫 / 领回次数
  concierge?: ConciergeSave // [concierge] 看门人：搭话 / 跟他走 / 追逐 / 捆绑 / 挣脱 / 13 楼次数、437 钥匙是否已交还
  objs?: L5ObjSave // [l5items] O18 / 房卡 / O666
  cgWake?: 1 // [concierge] 13 楼回来：下次进 L5 在员工通道醒来
  jazz?: JazzSave // [jazz] 爵士脑：好感 / 假吸魂成功·露馅 / 告发 / 私下对话 / 线索 / 辣椒酱 / 曲目增益 / 统计
  chef?: ChefSave // [chef] 厨师：是否被盯上 / 上瘾剩余 / 食物真相 / 锅 / 灶 / 夜晚数 / 受害者 / 血迹 / 统计
  spokes?: SpokesSave // [spokes] 迎宾女郎：大堂门快照（心声线索）/ 照片支线进度 / 是否自由 / 读过海报 / 统计
  beast?: BeastSave // [beast] 野兽：冒犯次数 / 契约（进行中 / 已了 / 违约）/ 苛刻契约 / 理智锁与上限扣减 / 待执行的惩罚
  tails?: TailsSave // [l5tails] 水洼（喝过的）/ 读过贝弗莉邀请函
  map?: L5MapSave // [l5map] 楼层导览图探索记录（每页区块类别 + 要素），随存档往返
  bellhop?: BellhopSave // [bellhop] 行李员：位置（绝对坐标）/ 行李牌编号 / 寄存 / 10F 行李房 / 代管钥匙 / 茶 / 情书 / 换脸洗牌
}
export function freshHotel(): HotelState { return { v: 1, attn: 0, stay: 0, lost: [], staff: {}, floor: 1, tile: 0, read: [] } }
export function restoreHotel(raw: unknown): HotelState {
  const f = freshHotel()
  if (!raw || typeof raw !== 'object') return f
  const r = raw as Partial<HotelState>
  const fl = Number(r.floor)
  return { v: 1, attn: clamp(Number(r.attn) || 0, 0, 100), stay: Number(r.stay) || 0, lost: Array.isArray(r.lost) ? r.lost.slice(-HT.lostCap) : [], staff: { ...(r.staff ?? {}) }, floor: Number.isInteger(fl) && fl >= 0 && fl <= 12 ? fl : 1, tile: r.tile ? 1 : 0, read: Array.isArray(r.read) ? r.read.filter((v) => typeof v === 'string') : [], ...(r.maid ? { maid: restoreMaidSave(r.maid) } : {}), ...(r.concierge ? { concierge: restoreConciergeSave(r.concierge) } : {}), ...(r.bellhop ? { bellhop: restoreBellhopSave(r.bellhop) } : {}), ...(r.beast ? { beast: restoreBeastSave(r.beast) } : {}), ...(r.spokes ? { spokes: restoreSpokesSave(r.spokes) } : {}), ...(r.chef ? { chef: restoreChefSave(r.chef) } : {}), ...(r.jazz ? { jazz: restoreJazzSave(r.jazz) } : {}), ...(r.cgWake ? { cgWake: 1 as const } : {}), ...(r.tails ? { tails: restoreTails(r.tails) } : {}), ...(r.objs ? { objs: restoreObj(r.objs) } : {}), ...(r.casino ? { casino: restoreCasinoSave(r.casino) } : {}), ...(r.map ? { map: restoreL5MapSave(r.map) } : {}), ...(r.pocket && typeof r.pocket === 'object' ? { pocket: { kind: r.pocket.kind === 'lobby' ? 'lobby' : r.pocket.kind === 'casino' ? 'casino' : 'beast', floor: L5_FLOORS[r.pocket.floor] ? r.pocket.floor : 1, mapSeed: Number.isFinite(r.pocket.mapSeed) ? r.pocket.mapSeed : 0 } } : {}) }
}
// 登记簿（跨局永久，localStorage br_hotel_book；死亡不清空）
export interface HotelBook {
  v: 1
  firstEntry: number // 首次入住的 Date.now()（0=还没来过）
  floors: number[] // 到访过的楼层（1b 起写入）
  rules: Record<string, 'seen' | 'true' | 'false'> // 住客须知（1c）
  marks: Record<string, 'true' | 'false'> // 玩家铅笔标记（1c）
  met: string[] // 遇见过的员工（员工期）
  rooms: string[] // 发现过的特殊房间
  gazes: number // 被「先生」注视的次数
  src: Record<string, string> // 1c 面板：每条守则第一次读到的出处（「3F · 走廊」）
  seen: Record<string, number> // 面板：各区域 / 事件第一次见到的楼层（variant 名或 flicker / office）
}
const BOOK_KEY = 'br_hotel_book'
export function freshBook(): HotelBook { return { v: 1, firstEntry: 0, floors: [], rules: {}, marks: {}, met: [], rooms: [], gazes: 0, src: {}, seen: {} } }
export function loadBook(): HotelBook {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BOOK_KEY) : null
    if (!raw) return freshBook()
    const r = JSON.parse(raw) as Partial<HotelBook>
    const f = freshBook()
    return { ...f, ...r, v: 1, floors: Array.isArray(r.floors) ? r.floors : [], met: Array.isArray(r.met) ? r.met : [], rooms: Array.isArray(r.rooms) ? r.rooms : [], rules: { ...(r.rules ?? {}) }, marks: { ...(r.marks ?? {}) }, src: { ...(r.src ?? {}) }, seen: { ...(r.seen ?? {}) } }
  } catch { return freshBook() }
}
export function saveBook(b: HotelBook) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(BOOK_KEY, JSON.stringify(b)) } catch { /* 无存储环境 */ }
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// 运行时（不入存档）
interface HotelRt {
  lastTier: HotelTier
  phase: ShiftPhase
  tune: number
  scan: number
  darkT: number
  o18Noise?: boolean // [l5items]
  party: number; tap: number; bell: number; steps: number; whisper: number
  seen: WeakMap<object, number> // 结构/地面物品 → 最近一次「不可见」开始的时间（−1=当前可见）
  doorOpenAt: WeakMap<Structure, number>
  restAt: { s: Structure; x: number; y: number } | null
  stareT: number; stareMsg: boolean
  tileT: number
  hissed: WeakSet<Structure>
}
const RT = new WeakMap<Engine, HotelRt>()
function rt(eng: Engine): HotelRt {
  let r = RT.get(eng)
  if (!r) {
    r = { lastTier: 0, phase: 'play', tune: -1, scan: 0, darkT: 0, party: 30, tap: 240, bell: 20, steps: 3, whisper: 25, seen: new WeakMap(), doorOpenAt: new WeakMap(), restAt: null, stareT: 0, stareMsg: false, tileT: 0, hissed: new WeakSet() }
    RT.set(eng, r)
  }
  return r
}

// ---------- 换班时刻表（纯函数）----------
export type ShiftPhase = 'play' | 'warn' | 'shift'
export interface ShiftInfo { phase: ShiftPhase; cycle: number; tLeft: number; tune: number; nextShift: number }
/** 第 i 轮「营业」时长（不含换班 45 s） */
function playLen(seed: number, floor: number, i: number) {
  const [a, b] = HT.shiftEvery
  return a + h01(seed, 0x5f1, floor, i) * (b - a)
}
export function hotelShift(seed: number, t: number, floor = 1): ShiftInfo {
  let t0 = 0, i = 0
  const tt = Math.max(0, t)
  for (; i < 100000; i++) {
    const L = playLen(seed, floor, i), end = t0 + L + HT.shiftLen
    if (tt < end) {
      const inPlay = tt - t0
      if (inPlay < L) {
        const phase: ShiftPhase = inPlay >= L - HT.shiftWarn ? 'warn' : 'play'
        return { phase, cycle: i, tLeft: L - inPlay, tune: tuneAt(seed, floor, i, inPlay), nextShift: t0 + L }
      }
      return { phase: 'shift', cycle: i, tLeft: end - tt, tune: -1, nextShift: t0 + L }
    }
    t0 = end
  }
  return { phase: 'play', cycle: i, tLeft: 1, tune: 0, nextShift: t0 }
}
/** [jazz] 当前这一轮营业从什么时候开始（t0）、营业多长（不含换班）：爵士脑按它排每晚两场演出 */
export function hotelPlayStart(seed: number, t: number, floor = 1): { t0: number; len: number; cycle: number } {
  let t0 = 0
  const tt = Math.max(0, t)
  for (let i = 0; i < 100000; i++) {
    const L = playLen(seed, floor, i), end = t0 + L + HT.shiftLen
    if (tt < end) return { t0, len: L, cycle: i }
    t0 = end
  }
  return { t0, len: HT.shiftEvery[0], cycle: 0 }
}
/** 一轮营业里的曲目序列（每首 90–180 s，相邻不重复） */
function tuneAt(seed: number, floor: number, cycle: number, inPlay: number) {
  let t = 0, prev = -1
  for (let j = 0; j < 64; j++) {
    const [a, b] = HT.tuneLen
    const len = a + h01(seed, 0x5f2, floor, cycle, j) * (b - a)
    let tune = h32(seed, 0x5f3, floor, cycle, j) % HT.tunes
    if (tune === prev) tune = (tune + 1) % HT.tunes
    if (inPlay < t + len) return tune
    t += len; prev = tune
  }
  return prev < 0 ? 0 : prev
}

// ---------- 门时钟 / 活门 / 请勿打扰（纯函数）----------
export function doorKey(wx: number, wy: number) { return [Math.floor(wx), Math.floor(wy)] as const }
/** 上锁门此刻是否处在「自行解锁」窗口 */
export function doorClockOpen(seed: number, wx: number, wy: number, t: number): boolean {
  const off = h01(seed, 0x5f4, wx, wy) * HT.doorCycle
  const tt = t + off, cyc = Math.floor(tt / HT.doorCycle), inC = tt - cyc * HT.doorCycle
  return inC < HT.doorOpenLen && h01(seed, 0x5f5, wx, wy, cyc) < HT.doorOpenFrac
}
export function isLiveDoor(seed: number, wx: number, wy: number) { return h01(seed, 0x5f6, wx, wy) < HT.liveDoor }
export function isDndDoor(seed: number, wx: number, wy: number) { return h01(seed, 0x5f8, wx, wy) < HT.dnd }
/** 活门此刻「想要」的开合状态 */
export function liveDoorWantsOpen(seed: number, wx: number, wy: number, t: number) {
  const period = HT.liveMin + h01(seed, 0x5f7, wx, wy) * HT.liveSpan
  return (Math.floor((t + period * h01(seed, 0x5f9, wx, wy)) / period) & 1) === 1
}
/** 金色门牌：三位数，末两位永远不是 13 */
export function roomNumber(seed: number, wx: number, wy: number) {
  let n = 100 + (h32(seed, 0x5fa, wx, wy) % 900)
  if (n % 100 === 13) n += 1
  return n
}

// ---------- 工具 ----------
const ROOMS: ReadonlySet<L5Variant> = new Set(['guestroom', 'lounge', 'gym', 'pool', 'boilerroom', 'mothnest'])
export function hotelHere(eng: Engine): { variant: L5Variant | null; inRoom: boolean } | null {
  const m = eng.map
  if (eng.levelDef.id !== 5 || !m?.inf) return null
  const p = eng.player
  const reg = l5RegionAt(m.inf.seed, p.x + (m.inf.ox ?? 0), p.y + (m.inf.oy ?? 0))
  const v = reg?.variant ?? null
  return { variant: v, inRoom: !!v && ROOMS.has(v) }
}
/** 所有玩家视线都看不到这个点（6 m 内一律算看得见） */
export function hotelUnseen(eng: Engine, x: number, y: number): boolean {
  const p = eng.player
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy)
  if (d < HT.unseenNear) return false
  let da = Math.atan2(dy, dx) - p.facing
  da = Math.atan2(Math.sin(da), Math.cos(da))
  if (Math.abs(da) > HT.unseenCone) return true
  return !eng.los(p.x, p.y, x, y)
}
function inShift(eng: Engine) { return eng.hotelShift.phase === 'shift' }

/** 关注度增量（换班 ×2；在客房里不受换班影响） */
export function hotelAddAttn(eng: Engine, amt: number) {
  if (eng.levelDef.id !== 5 || amt === 0) return
  const h = eng.hotel
  let k = 1
  if (amt > 0 && inShift(eng) && !hotelHere(eng)?.inRoom) k = HT.shiftMul
  h.attn = clamp(h.attn + amt * k, 0, 100)
  if (h.attn >= 100 && !beastAttnFull(eng)) hotelGaze(eng) // [beast] 关注度满 = 野兽现身（熄灯 → 背后缠抓 → 拖进办公室）；冷却内 / 不能接管时退回旧的全屏注视
}

/** 噪音事件 → 关注度（entityAI.noiseEvent 调用）。普通脚步（≤10 m）另由奔跑计时处理 */
export function hotelHear(eng: Engine, radius: number, sprint: boolean) {
  if (eng.levelDef.id !== 5) return
  if (radius >= 8 && radius < 18) { const r = RT.get(eng); if (r) r.o18Noise = true } // [l5items] O18 房里：近战 = 砸留声机 / 砸门
  if (radius >= 18) hotelAddAttn(eng, HT.attnGun)
  else if (radius >= 14) hotelAddAttn(eng, HT.attnBreak)
  else if (radius >= 11 && sprint) hotelAddAttn(eng, HT.attnMelee * 1.5)
  else if (radius >= 8 && !sprint) hotelAddAttn(eng, HT.attnMelee)
}
/** 换班 / 「清理」档时，实体听得更远（noiseEvent 半径乘子） */
export function hotelHearMul(eng: Engine, radius = 99): number {
  if (eng.levelDef.id !== 5) return 1
  let k = 1
  if (radius <= 10 && L5_FLOORS[eng.hotel.floor]?.silent) k *= 0.5 // 11F：厚地毯吸音，脚步声减半
  if (inShift(eng)) k *= HT.hearShift
  if (l5Tier(eng.hotel.attn) >= 3) k *= HT.hearClean
  return k
}

// ---------- 床上休息 ----------
export function hotelCanRest(eng: Engine, s: Structure) { return eng.levelDef.id === 5 && s.kind === 'bed' }
export function hotelToggleRest(eng: Engine, s: Structure) {
  const r = rt(eng)
  if (r.restAt?.s === s) { r.restAt = null; eng.msg('你从床上坐起来，整了整被单。', 'system'); return }
  r.restAt = { s, x: eng.player.x, y: eng.player.y }
  eng.msg('你和衣躺下。隔壁的爵士乐隔着墙传来，像有人在很远的地方跳舞。', 'lore')
  audio.uiTick()
}
export function hotelResting(eng: Engine) { return !!RT.get(eng)?.restAt }

// ---------- 主更新（ambient.updateAmbient 每帧调用）----------
export function updateHotel(eng: Engine, dt: number) {
  const m = eng.map
  stepL5Map(eng, dt) // [l5map] 楼层导览图：记录探索 / 要素
  stepCasino(eng, dt) // [casino] Level 5.1：L5 大门（营业 / 打烊上锁）· 场内打烊清场
  stepBeastGlobal(eng, dt) // [beast] 野兽 Entity 18：契约计时 / 理智锁与上限 / 余光 / 惩罚（任何层级；办公室 117 的待客也在这里）
  if (eng.levelDef.id === POCKET_LEVEL.beast) beastPress(eng) // [beast] 办公室：X 谈生意
  stepSpokesGlobal(eng, dt) // [spokes] 迎宾女郎 Entity 28：大堂日程 / 字幕 / 发条兔（L5 迷路 / 跟出大堂）/ 海报邀请门
  spokesPress(eng) // [spokes] X：搭话 / 给她看照片 / 还证件（大堂）· 抓住发条兔（大堂 / L5）
  stepJazzGlobal(eng, dt) // [jazz] 爵士脑 Entity 197：曲目增益 / 辣椒酱暖身 / 告发后离开计时 / 字幕（任何层级）
  stepChefGlobal(eng, dt) // [chef] 厨师 Entity 800：上瘾（饥饿加快 + 念头字幕）/ 被盯上的记忆 / 灶的停产计时 / 血迹（任何层级）
  { const ob = (eng.hotel as HotelState | undefined)?.objs; if (ob && (ob.pend || ob.die || ob.anim)) stepFateDie(eng, ob, eng.levelDef.id === 5 && m?.inf ? curRoom(eng)?.key ?? null : null, dt, l5Hooks(eng)) } // [l5items 收尾] O666：结果延后到停下 + 进行中的骰子（任何层级）
  if (eng.levelDef.id !== 5 || !m?.inf) {
    if (eng.hotelLightMul !== 1) eng.hotelLightMul = 1
    if (eng.hotelShift.phase !== 'play') eng.hotelShift = { ...eng.hotelShift, phase: 'play' }
    audio.hotelMusic('play', -1, 0)
    const r = RT.get(eng); if (r) r.restAt = null
    return
  }
  const h = eng.hotel, p = eng.player, r = rt(eng), seed = m.inf.seed
  const book = eng.hotelBook
  if (!book.firstEntry || !book.floors.includes(h.floor)) { if (!book.firstEntry) book.firstEntry = Date.now(); if (!book.floors.includes(h.floor)) book.floors.push(h.floor); saveBook(book) }
  h.stay += dt
  const here = hotelHere(eng)!
  stepL5Objects(eng, dt, here.variant === 'guestroom') // [l5items]
  if (here.variant && book.seen[here.variant] === undefined) { book.seen[here.variant] = h.floor; saveBook(book) }
  // ---- 换班 ----
  const sh = hotelShift(seed, eng.time)
  if (sh.phase !== r.phase) {
    if (sh.phase === 'warn') eng.msg('唱片开始跳针。', 'lore')
    else if (sh.phase === 'shift') { eng.msg('音乐停了。走廊里响起推车轮子的声音。', 'lore'); audio.hotelScratch(0.8) }
    else if (r.phase === 'shift') { eng.msg('一声清脆的迎宾铃。音乐又响了起来。', 'lore'); audio.hotelChime(0.7) }
    r.phase = sh.phase
  }
  if (sh.phase !== 'shift' && sh.tune !== r.tune) { if (r.tune >= 0) audio.hotelScratch(0.35); r.tune = sh.tune }
  eng.hotelShift = sh
  const tier = l5Tier(h.attn)
  const silent = !!L5_FLOORS[h.floor]?.silent // 11F 静默层：没有音乐（换班照样有脚步）
  if (eng.hotelVanishT <= 0) audio.hotelMusic(silent && sh.phase !== 'shift' ? 'shift' : sh.phase, sh.tune, tier >= 1 ? 0.25 + (tier - 1) * 0.2 : 0)
  updateVanish(eng, dt)
  const dimTarget = sh.phase === 'shift' ? 1 - HT.shiftDim : 1
  eng.hotelLightMul += (dimTarget - eng.hotelLightMul) * Math.min(1, dt * 1.5)
  // ---- 关注度 ----
  const rest = r.restAt
  if (rest && Math.hypot(p.x - rest.x, p.y - rest.y) > 0.35) r.restAt = null
  const sprinting = !!eng.input.sprint && eng.mv.sprintK > 0.5 && eng.mv.speed > 4
  if (r.restAt) {
    h.attn = clamp(h.attn - HT.attnRest * (hotelOwnRoom(eng) ? CARD_REST_MUL : 1) * dt, 0, 100) // [l5items] 房卡：你的房间降得更快
    p.sanity = Math.min(100, p.sanity + HT.restSanity * dt)
  } else {
    if (sprinting && !here.inRoom) { hotelAddAttn(eng, HT.attnRun * dt); if (h.attn >= HT.tiers[0]) hotelRuleProve(eng, 'run') }
    if (here.variant === 'maintenance') hotelAddAttn(eng, HT.attnStaff * dt)
    // 无灯房间：最近的灯 > 5.5 m
    let lit = false
    if (here.inRoom) for (const L of m.lights) if (L.on !== false && Math.abs(L.x - p.x) < HT.darkR && Math.abs(L.y - p.y) < HT.darkR && Math.hypot(L.x - p.x, L.y - p.y) < HT.darkR) { lit = true; break }
    r.darkT = here.inRoom && !lit ? r.darkT + dt : 0
    if (r.darkT > HT.darkDelay) hotelAddAttn(eng, HT.attnDark * dt)
    if (!sprinting) h.attn = clamp(h.attn - HT.attnDecay * dt, 0, 100)
  }
  // ---- 档位征兆 ----
  if (tier !== r.lastTier) {
    if (tier > r.lastTier && p.sanity < 40) eng.msg(TIER_WHISPER[tier], 'lore')
    r.lastTier = tier
  }
  if (tier >= 2) {
    r.bell -= dt
    if (r.bell <= 0) { const v = 0.35 + 0.15 * (tier - 2); if (!bellhopDistantBell(eng, v)) audio.hotelBell(v); r.bell = rnd(HT.bellEvery) } // [bellhop] 同层时铃声来自他的位置
  }
  // ---- 换班音效 ----
  if (sh.phase === 'shift' && !here.inRoom) {
    r.steps -= dt
    if (r.steps <= 0) { Math.random() < 0.3 ? audio.hotelBell(0.25) : audio.hotelSteps(0.5 + Math.random() * 0.3); r.steps = rnd(HT.stepsEvery) }
  }
  // ---- 氛围事件（独处、在大厅或走廊）----
  if (!here.inRoom && sh.phase !== 'shift') {
    r.party -= dt
    if (r.party <= 0) { audio.hotelParty(0.5); r.party = rnd(HT.partyEvery) }
  }
  if (p.sanity < HT.whisperSan) {
    r.whisper -= dt
    if (r.whisper <= 0) { audio.whisper(0.35); r.whisper = 18 + Math.random() * 30 }
  }
  r.tap -= dt
  if (r.tap <= 0) {
    r.tap = rnd(HT.tapEvery)
    if (!here.inRoom && !r.restAt) { eng.camShake = Math.max(eng.camShake, 0.18); audio.hotelTap(0.6); eng.msg('有什么轻轻拍了拍你的肩膀。', 'lore') }
  }
  // ---- 1b：肖像 / 麻将桌 / 锅炉房 ----
  updateSpaces(eng, dt, here.variant)
  // ---- 1c：守则验证 / 灯光闪烁木门 ----
  updateEvents(eng, dt, here.variant)
  // ---- 门与自洁（低频扫描）----
  r.scan -= dt
  if (r.scan <= 0) { const step = HT.scanEvery - r.scan; r.scan = HT.scanEvery; scanHotel(eng, step) }
  // ---- [maid] 管家 Entity 111：孤例生成 / X 要回失物 ----
  stepMaidWorld(eng, dt); maidPress(eng)
  // ---- [concierge] 看门人 Entity 131：前台 / 拦截 / 追踪 / 13 楼黑屏 / X ----
  stepConciergeWorld(eng, dt); conciergePress(eng)
  // ---- [bellhop] 行李员 Entity 135：走廊尽头出现 / 原处重建 / X 寄存·取回·递茶·递信·行李房 ----
  stepBellhopWorld(eng, dt); bellhopPress(eng)
  // ---- [chef] 厨师 Entity 800：餐厅后场孤例 / 营业·打烊（接换班）/ 吃饭 / 黑屏·拖行·冷库 / X ----
  stepChefWorld(eng, dt); chefPress(eng)
  // ---- [jazz] 爵士脑 Entity 197：厨师餐厅舞台的四人乐队 / 每晚两场（接换班）/ 听演出 / 假吸魂 / 点歌 / 搭话 / 告发 / 声部空间化 ----
  stepJazzWorld(eng, dt); jazzPress(eng)
}
const TIER_WHISPER = ['', '……有人在画里看你。', '……铃声是在找你。', '……他们要来打扫了。', '……先生在看你。']
const rnd = ([a, b]: readonly [number, number]) => a + Math.random() * (b - a)

/** 关注度满：「先生」的注视（员工期改为野兽现身） */
export function hotelGaze(eng: Engine) {
  const h = eng.hotel, p = eng.player
  h.attn = HT.gazeDrop; eng.hotelBook.gazes++; saveBook(eng.hotelBook)
  p.sanity = Math.max(0, p.sanity - HT.gazeSanity)
  eng.hotelGazeT = 2.2
  eng.emit({ kind: 'sanityhit' })
  audio.whisper(1); audio.hotelBell(0.6)
  eng.msg('墙纸上的花纹在一瞬间全都变成了脸。整座酒店都在看着你。', 'lore')
}

function scanHotel(eng: Engine, dt: number) {
  const m = eng.map!, p = eng.player, r = rt(eng), inf = m.inf!, seed = inf.seed, ox = inf.ox ?? 0, oy = inf.oy ?? 0
  const now = eng.time
  // 门
  for (const s of m.structures) {
    if (s.kind !== 'hoteldoor') continue
    if (Math.abs(s.x - p.x) > HT.scanR || Math.abs(s.y - p.y) > HT.scanR) continue
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2
    const d = s.data ?? (s.data = {})
    if (d.sealed || d.careerDoor || d.mothNest || d.serviceEntry || d.staff) continue
    const wx = Math.floor(s.x + ox), wy = Math.floor(s.y + oy)
    if (d.hotelInit !== 1) {
      d.hotelInit = 1
      if (d.locked === 1) d.baseLock = 1
      else if (isLiveDoor(seed, wx, wy)) d.live = 1
      if (isDndDoor(seed, wx, wy)) d.dnd = 1
      d.room = roomNumber(seed, wx, wy)
    }
    const near = Math.hypot(cx - p.x, cy - p.y)
    const open = d.open === 1
    // 门时钟：关着的原上锁门按时钟锁/解锁
    if (d.baseLock === 1 && !open) {
      const want = doorClockOpen(seed, wx, wy, now) ? 0 : 1
      if (d.locked !== want) { d.locked = want; if (!want && near < 8) audio.hotelClick(0.5 * (1 - near / 8)) }
    }
    // 活门
    if (d.live === 1) {
      const wantOpen = liveDoorWantsOpen(seed, wx, wy, now)
      if (wantOpen !== open && near > 1.3) setDoor(s, wantOpen, near)
      continue
    }
    // 打开太久且没人看 → 自己关上
    if (open) {
      const t0 = r.doorOpenAt.get(s) ?? now
      if (!r.doorOpenAt.has(s)) r.doorOpenAt.set(s, now)
      if (now - t0 > HT.cleanDoor && near > 3 && hotelUnseen(eng, cx, cy)) { setDoor(s, false, near); r.doorOpenAt.delete(s) }
    } else r.doorOpenAt.delete(s)
  }
  // 丢在地上的物品 → 失物招领
  for (let i = m.items.length - 1; i >= 0; i--) {
    const it = m.items[i]
    if (it.dropped === undefined) continue
    cleanTick(eng, r, it, it.x, it.y, HT.cleanItem, () => { m.items.splice(i, 1); hotelLose(eng, it) })
  }
  void dt
}
function cleanTick(eng: Engine, r: HotelRt, key: object, x: number, y: number, need: number, act: () => void) {
  const now = eng.time
  if (!hotelUnseen(eng, x, y)) { r.seen.set(key, -1); return }
  const since = r.seen.get(key)
  if (since === undefined || since < 0) { r.seen.set(key, now); return }
  if (now - since >= need) { r.seen.delete(key); act() }
}
function setDoor(s: Structure, open: boolean, near: number) {
  s.data = { ...s.data, open: open ? 1 : 0 }
  s.solid = !open
  if (near < 12) audio.hotelCreak(0.55 * (1 - near / 12))
}
/** 自洁收走的物品进失物招领（先进先出） */
export function hotelLose(eng: Engine, it: GroundItem) {
  const h = eng.hotel
  h.lost.push({ type: it.type, count: it.count ?? 1, t: Date.now(), ...(it.dur !== undefined ? { dur: it.dur } : {}), ...(it.blood ? { blood: it.blood } : {}), ...(it.mag ? { mag: [...it.mag] } : {}), ...(it.ammoSel ? { ammoSel: it.ammoSel } : {}), ...(it.stage ? { stage: it.stage } : {}), ...(it.cyl ? { cyl: it.cyl } : {}) })
  while (h.lost.length > HT.lostCap) h.lost.shift()
}
export const LOST_FEE = { type: 'almond', count: 1 }
/** 在奥蒂斯处取回第 i 件失物：付 1 瓶杏仁水 */
export function hotelReclaim(eng: Engine, i: number): string {
  const h = eng.hotel, it = h.lost[i]
  if (!it) return '那件东西已经不在架子上了。'
  if (eng.countItem(LOST_FEE.type) < LOST_FEE.count) return '奥蒂斯敲了敲架子：「一瓶杏仁水。规矩不是我定的。」'
  const extra = { ...(it.dur !== undefined ? { dur: it.dur } : {}), ...(it.blood ? { blood: it.blood } : {}), ...(it.mag ? { mag: [...it.mag] } : {}), ...(it.ammoSel ? { ammoSel: it.ammoSel } : {}), ...(it.stage ? { stage: it.stage } : {}), ...(it.cyl ? { cyl: it.cyl } : {}) } as never
  let got = 0
  while (got < it.count && eng.addItem(it.type, extra)) got++
  if (!got) return '背包满了。'
  if (got < it.count) { it.count -= got; return `背包只装得下 ${got} 件，剩下的奥蒂斯先替你收着。` }
  eng.consumeItem(LOST_FEE.type)
  h.lost.splice(i, 1)
  hotelRuleProve(eng, 'lost')
  return '奥蒂斯从架子上取下它，用袖子擦了擦：「洗过了。它们总是洗过的。」'
}

// =====================================================================
// 1b 空间：肖像凝视与翻面、贝弗莉门墙、麻将桌、锅炉房（高温 / 蒸汽阀 / 杏仁水排气阀 / 熔炉耳语）
// =====================================================================
const yawTo = (eng: Engine, x: number, y: number) => {
  const p = eng.player
  const da = Math.atan2(y - p.y, x - p.x) - p.facing
  return Math.abs(Math.atan2(Math.sin(da), Math.cos(da)))
}
/** X 键情境：翻肖像（点按）/ 取麻将牌（按住） */
export function hotelSpecial(eng: Engine): SpecialAction | null {
  if (eng.levelDef.id !== 5 || !eng.map) return null
  const t = eng.interactTarget?.s
  if (t?.kind === 'bigpainting' && t.data?.gaze && !t.data.flipped) return { id: 'hotelFlip', label: '翻过去', hint: '把肖像翻转朝墙——它从此不再看你（酒店会注意到）', hold: false }
  const tb = nearMahjong(eng)
  { const o = (eng.hotel as HotelState).objs?.o18; if (o && !o.done) return { id: 'o18Lift', label: `抬起唱针（${Math.round(o18LiftProgress(eng) * 100)}%）`, hint: '按住 3 秒；松手就落回去（理智额外 −1/s）', hold: true } } // [l5items] O18
  if (nearOwnBed(eng)) { const o = objSave(eng), h = eng.player.hotbar[eng.player.selected]; return eng.player.crouching || !h ? { id: 'hotelLocker', label: `取回 床边储物柜（${o.locker.length}/${LOCKER_SLOTS}）`, hint: '柜里的东西随这一局；离开就清空', hold: false } : { id: 'hotelLocker', label: `存入 床边储物柜（${o.locker.length}/${LOCKER_SLOTS}）`, hint: '存手里这件；蹲下按 X 全部取回', hold: false } } // [l5items] 房卡
  if (tb && !eng.hotel.tile && tb.d < HT.tileReach) return { id: 'hotelTile', label: '取一张麻将牌', hint: `顶着推力按住 ${HT.tileHold} 秒`, hold: true }
  return null
}
function nearOwnBed(eng: Engine): boolean {
  if (!hotelOwnRoom(eng)) return false
  const p = eng.player
  return eng.map!.structures.some((s) => s.kind === 'bed' && Math.hypot(s.x + 0.5 - p.x, s.y + 1 - p.y) < 1.7)
}
function lockerPress(eng: Engine) {
  const o = objSave(eng), p = eng.player, h = p.hotbar[p.selected]
  if (p.crouching || !h) {
    let n = 0
    while (o.locker.length) { const it = o.locker[0]; if (!eng.addItem(it.type, { count: it.count })) break; o.locker.shift(); n++ }
    eng.msg(n ? `你从柜子里取回了 ${n} 件东西。` : o.locker.length ? '包满了。' : '柜子是空的。', 'system'); audio.uiTick(); return
  }
  if (o.locker.length >= LOCKER_SLOTS) { eng.msg('柜子塞满了。', 'system'); return }
  if (h.type === 'roomcard') { eng.msg('房卡还是带在身上吧。', 'system'); return }
  o.locker.push({ type: h.type, count: h.count ?? 1 }); p.hotbar[p.selected] = null
  eng.msg(`${ITEM_NAME(h.type)} 放进了床边的储物柜。`, 'system'); audio.uiTick()
}
const ITEM_NAME = (t: string) => ITEMS[t]?.name ?? t
function nearMahjong(eng: Engine): { s: Structure; d: number } | null {
  const p = eng.player
  for (const s of eng.map!.structures) {
    if (s.kind !== 'oddtable') continue
    const d = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
    if (d < HT.mahjongR) return { s, d }
  }
  return null
}
function updateSpaces(eng: Engine, dt: number, variant: L5Variant | null) {
  const m = eng.map!, p = eng.player, r = rt(eng), h = eng.hotel
  // ---- 肖像：准星对准 3 s 后掉理智、加关注度 ----
  let staring: Structure | null = null
  for (const s of m.structures) {
    if (s.kind !== 'bigpainting' || !s.data?.gaze || s.data.flipped) continue
    const cx = s.x + 0.5, cy = s.y + 0.5, d = Math.hypot(cx - p.x, cy - p.y)
    if (d > HT.stareR || d < 0.6) continue
    if (yawTo(eng, cx, cy) < Math.max(HT.stareCone, 0.5 / d) && eng.los(p.x, p.y, cx, cy)) { staring = s; break }
  }
  r.stareT = staring ? r.stareT + dt : 0
  if (r.stareT > HT.stareDelay) {
    p.sanity = Math.max(0, p.sanity - HT.stareSan * dt)
    hotelAddAttn(eng, HT.attnStare * dt)
    beastPortraitStare(eng, dt) // [beast] 画像换成了他的脸：盯着看额外加关注度
    if (!r.stareMsg) { r.stareMsg = true; eng.msg('画里的眼睛和你对上了。它没有眨。', 'lore'); hotelRuleProve(eng, 'gaze') }
  } else if (!staring) r.stareMsg = false
  // ---- [l5items] X：床边储物柜（你的房间）----
  if (eng.specialPressed && nearOwnBed(eng)) { eng.specialPressed = false; lockerPress(eng) }
  // ---- X：翻肖像 ----
  if (eng.specialPressed) {
    const t = eng.interactTarget?.s
    if (t?.kind === 'bigpainting' && t.data?.gaze && !t.data.flipped) {
      eng.specialPressed = false
      t.data = { ...t.data, flipped: 1 }
      hotelAddAttn(eng, HT.attnFlip)
      beastNoteFlip(eng) // [beast] 契约任务「把一幅画像翻过去」
      eng.msg('你把画框转过去，让它面朝墙壁。麻布背面有一行褪色的字：「请勿凝视画像」。', 'lore')
      audio.hotelCreak(0.3)
    }
  }
  // ---- 贝弗莉室麻将桌：缓推 + 掉理智；按住 X 取牌 ----
  const tb = nearMahjong(eng)
  if (tb) {
    const cx = tb.s.x + 0.5, cy = tb.s.y + 0.5, d = Math.max(0.05, tb.d)
    const nx = p.x + (p.x - cx) / d * HT.mahjongPush * dt, ny = p.y + (p.y - cy) / d * HT.mahjongPush * dt
    if (canOccupy(m, nx, ny, PLAYER_RADIUS, { z: p.z })) { p.x = nx; p.y = ny }
    p.sanity = Math.max(0, p.sanity - HT.mahjongSan * dt)
    if (!h.tile && eng.specialHeld && d < HT.tileReach) {
      r.tileT += dt
      if (r.tileT >= HT.tileHold) {
        r.tileT = 0
        if (eng.addItem('mahjongtile')) {
          h.tile = 1
          p.sanity = Math.max(0, p.sanity - HT.tileSan)
          hotelAddAttn(eng, HT.attnTile)
          eng.emit({ kind: 'sanityhit' })
          eng.msg('你的指尖碰到了一张牌。它是温的。背面画着一只闭着的眼睛。', 'lore')
        } else eng.msg('背包满了。牌从指缝间滑回了桌上。', 'system')
      }
    } else r.tileT = Math.max(0, r.tileT - dt * 2)
  } else r.tileT = 0
  // ---- 锅炉房 ----
  if (variant === 'boilerroom') {
    p.thirst = Math.max(0, p.thirst - 0.28 * (HT.heatThirst - 1) * dt)
    if (!eng.input.sprint && p.stamina < 100) p.stamina = Math.max(0, p.stamina - 12 * HT.heatStamina * dt)
  }
  for (const s of m.structures) {
    if (Math.abs(s.x - p.x) > 10 || Math.abs(s.y - p.y) > 10) continue
    if (s.kind === 'furnace' && Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y) < HT.furnaceR) p.sanity = Math.max(0, p.sanity - HT.furnaceSan * dt)
    if (s.kind === 'pipes' && s.data?.l5 && s.data.steam === 1) steamTick(eng, s, dt, r)
  }
}
/** 蒸汽阀循环：静止 6 s → 嘶声 1 s → 喷射 2 s（2.5 m 锥形，8 伤害/秒） */
export function steamPhase(seed: number, wx: number, wy: number, t: number): 'idle' | 'hiss' | 'jet' {
  const [a, b, c] = HT.steam, P = a + b + c
  const k = ((t + h01(seed, 0x5fc, wx, wy) * P) % P + P) % P
  return k < a ? 'idle' : k < a + b ? 'hiss' : 'jet'
}
/** 玩家是否在蒸汽锥里（喷口在 cx,cy，朝 dir=±1 的 x 方向；axis='y' 的管子贴东西墙） */
export function inSteamCone(px: number, py: number, cx: number, cy: number, dir: number) {
  const along = (px - cx) * dir, lat = Math.abs(py - cy)
  return along > 0.1 && along < HT.steamR && lat < 0.35 + along * 0.58
}
function steamTick(eng: Engine, s: Structure, dt: number, r: HotelRt) {
  const m = eng.map!, p = eng.player, inf = m.inf!
  const ph = steamPhase(inf.seed, Math.floor(s.x + (inf.ox ?? 0)), Math.floor(s.y + (inf.oy ?? 0)), eng.time)
  const dir = Number(s.data?.dir ?? 1), cx = s.x + 0.5, cy = s.y + 0.5
  const near = Math.hypot(cx - p.x, cy - p.y)
  if (ph === 'hiss') { if (!r.hissed.has(s) && near < 10) { r.hissed.add(s); audio.hotelSteam(0.35 * (1 - near / 10), 1) } }
  else r.hissed.delete(s)
  if ((s.data?.jet === 1) !== (ph === 'jet')) s.data = { ...s.data, jet: ph === 'jet' ? 1 : 0 }
  if (ph !== 'jet') return
  if (Math.random() < dt * 30) eng.particles.push({ x: cx + dir * 0.4, y: cy + (Math.random() - 0.5) * 0.2, z: 1.15, vx: dir * (3 + Math.random() * 2), vy: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.3) * 0.6, t: 0, life: 0.7, color: '#e9e4da', size: 7, opacity: 0.55 })
  if (inSteamCone(p.x, p.y, cx, cy, dir)) {
    p.hp -= HT.steamDmg * dt
    eng.emit({ kind: 'damage' })
    if (p.hp <= 0) eng.die('被锅炉房的蒸汽烫死了')
  }
}
/** 锅炉房排气阀：每阀每 10 分钟接一瓶杏仁水（非 L5 返回 false，走原有阀门逻辑） */
export function hotelValveAlmond(eng: Engine, s: Structure): boolean {
  if (eng.levelDef.id !== 5) return false
  if (!hotelValveReady(eng, s)) { eng.msg('排气阀里只剩下嘶嘶的热气。过一阵再来。', 'system'); return true }
  if (!eng.addItem('almond')) { eng.msg('背包满了。', 'system'); return true }
  s.data = { ...s.data, almondT: eng.time }
  eng.msg('你拧开排气阀。管子里先是一阵嘶鸣，然后流出一股带着杏仁香的温水。（获得 杏仁水）', 'loot')
  audio.hotelSteam(0.3, 0.6)
  return true
}
export function hotelValveReady(eng: Engine, s: Structure) { return s.data?.almondT === undefined || eng.time - Number(s.data.almondT) >= HT.valveCd }

/** 贝弗莉门墙 / 活板门：能开的那扇把人送到同楼层某个区域 */
export function hotelBevDoor(eng: Engine, s: Structure) {
  const floorDoor = s.kind === 'l5floordoor'
  if (!s.data?.go) {
    eng.msg(floorDoor ? '你掀起活板门——底下是实心的地板，铺着同样的玫瑰地毯。' : '门把手转动了，门开了一条缝——门后是一堵砖墙。', 'system')
    audio.hotelCreak(0.4)
    return
  }
  if (hotelHasInvite(eng)) { // [l5tails] 持贝弗莉邀请函：能推开的门通往原住民据点
    eng.photoFlashT = 0.35; audio.hotelChime(0.4)
    eng.msg(floorDoor ? '活板门下是一段铺着旧地毯的楼梯，楼梯尽头有留声机的声音。' : '门后不是走廊，是一间点着煤气灯的客厅。有人在等你。', 'lore')
    if (enterOutpost(eng, 'originals')) return
  }
  const roll = Math.random(), [a, b] = HT.bevGo
  const want: L5Variant = roll < a ? 'mainhall' : roll < a + b ? 'boilerroom' : 'lounge'
  const spot = hotelFindSpot(eng, want) ?? hotelFindSpot(eng, 'mainhall') ?? hotelFindSpot(eng, null)
  if (!spot) { eng.msg('门后的走廊在你眼前合上了。', 'system'); return }
  const p = eng.player
  p.x = spot.x; p.y = spot.y
  resetMoveVelocity(eng.mv)
  eng.photoFlashT = 0.35
  audio.hotelChime(0.4)
  eng.msg(floorDoor ? '你跳进活板门——落脚处是另一片地毯。' : '你推开门走了进去，身后的门无声地合上了。', 'lore')
}
/** 在已载入地图里找一个指定区域、可站、离玩家 >12 m 的点（variant=null：任意走廊） */
export function hotelFindSpot(eng: Engine, want: L5Variant | null): { x: number; y: number } | null {
  const m = eng.map!, inf = m.inf!, p = eng.player
  for (let k = 0; k < 6000; k++) {
    const x = 2 + Math.floor(Math.random() * (m.w - 4)) + 0.5, y = 2 + Math.floor(Math.random() * (m.h - 4)) + 0.5
    if (Math.hypot(x - p.x, y - p.y) < 12) continue
    const v = l5RegionAt(inf.seed, x + (inf.ox ?? 0), y + (inf.oy ?? 0))?.variant ?? null
    if (v !== want) continue
    if (canOccupy(m, x, y, PLAYER_RADIUS, { z: 0 })) return { x, y }
  }
  return null
}

// =====================================================================
// 1c 事件：住客须知（真假守则卡）/ 灯光同时闪烁 → 野兽办公室木门 / 大堂房间
// =====================================================================
export const HT1C = {
  flickerEvery: 1200, flickerTierK: 3, flicker8F: 2, flickerR: 15, flickerLen: 3, flickerSafe: 14,
  beastDoorLen: 60, attnBeastDoor: 10, doorMin: 2.5, doorMax: 9, doorCone: 0.7,
  lobbyP: 0.004, lobbyWipeR: 60,
  lobbyAway: 1.5, lobbyR: 14, lobbyCone: 0.85, // 大堂门：在 14 m 内、连续 1.5 s 不在视野（±0.85 rad 且无遮挡）里，才会「出现」
  boilerProve: 12, // 在锅炉房连续待多少秒算「验证了」锅炉房守则
}
export const POCKET_LEVEL = { beast: 117, lobby: 118, casino: 119 } as const // [casino] 119 = Level 5.1 赌场（engine/casinoAI.CASINO_LEVEL）
export type PocketKind = keyof typeof POCKET_LEVEL

/** 读一张住客须知卡：返回卡面（同时记登记簿；首次读到真规则 −3 关注度） */
export function hotelReadRule(eng: Engine, s: Structure): L5RuleCard | null {
  const m = eng.map
  if (!m?.inf) return null
  const inf = m.inf, wx = s.data?.wx !== undefined ? Number(s.data.wx) : Math.floor(s.x + (inf.ox ?? 0)), wy = s.data?.wy !== undefined ? Number(s.data.wy) : Math.floor(s.y + (inf.oy ?? 0))
  const card = ruleCardAt(inf.seed, eng.hotel.floor, wx, wy)
  const book = eng.hotelBook, h = eng.hotel
  if (!book.rules[card.rule]) { book.rules[card.rule] = 'seen'; book.src[card.rule] = `${L5_FLOORS[eng.hotel.floor]?.name ?? '1F'} · ${s.data?.ontable ? '客房桌上' : '走廊'}`; saveBook(book) }
  if (!h.read.includes(card.rule)) {
    h.read.push(card.rule)
    if (!card.fake) hotelAddAttn(eng, -HT.attnRuleTrue)
  }
  eng.emit({ kind: 'hotelnotice', text: JSON.stringify(card) })
  audio.uiTick()
  return card
}
/** 实际判定验证了一条守则（只验证读过的条目；真规则 → 已核实为真，假规则 → 已核实为假） */
export function hotelRuleProve(eng: Engine, id: L5RuleId) {
  const book = eng.hotelBook
  if (book.rules[id] !== 'seen') return false
  const def = L5_RULE[id]
  book.rules[id] = def.truth ? 'true' : 'false'
  saveBook(book)
  if (def.proof) eng.msg(def.proof, 'lore')
  return true
}

// ---- 灯光同时闪烁 → 野兽办公室木门 ----
interface FlickRt { t: number; boilerT: number; door: Structure | null; doorT: number; doorMap: object | null; lobbyMap: object | null; lobbyShown: Set<string>; lobbyAway: Map<string, number> }
const FR = new WeakMap<Engine, FlickRt>()
function frt(eng: Engine) { let r = FR.get(eng); if (!r) { r = { t: 0, boilerT: 0, door: null, doorT: 0, doorMap: null, lobbyMap: null, lobbyShown: new Set(), lobbyAway: new Map() }; FR.set(eng, r) } return r }
/** 每秒触发率（基础 1/20 分钟；「关照」档以上 ×3；8F ×2） */
export function flickerRate(attn: number, floor: number) {
  let k = 1 / HT1C.flickerEvery
  if (l5Tier(attn) >= 2) k *= HT1C.flickerTierK
  if (L5_FLOORS[floor]?.flickerK) k *= L5_FLOORS[floor]!.flickerK!
  return k
}
/** 渲染层用：灯光闪烁的同步方波（1=亮，0.08=暗） */
export function flickerMul(eng: Engine, lx: number, ly: number): number {
  const f = eng.hotelFlicker
  if (!f || f.t <= 0) return 1
  if (Math.hypot(lx - f.x, ly - f.y) > HT1C.flickerR) return 1
  const k = HT1C.flickerLen - f.t
  return Math.floor(k * 9 + (k > 2 ? k * 6 : 0)) % 2 ? 0.08 : 1
}
function updateEvents(eng: Engine, dt: number, variant: L5Variant | null) {
  const m = eng.map!, p = eng.player, r = frt(eng), h = eng.hotel
  updateLobbyDoors(eng, dt)
  stepTails(eng, dt) // [l5tails] 墙纸人脸
  // 锅炉房守则：连续待满 12 s 算验证
  r.boilerT = variant === 'boilerroom' ? r.boilerT + dt : 0
  if (r.boilerT > HT1C.boilerProve) hotelRuleProve(eng, 'boiler')
  // 换班时待在房间里 → 「音乐停止时回房间」验证
  if (eng.hotelShift.phase === 'shift' && variant && ROOMS.has(variant)) hotelRuleProve(eng, 'music')
  // 闪烁倒计时
  if (eng.hotelFlicker && eng.hotelFlicker.t > 0) {
    eng.hotelFlicker.t -= dt
    if (eng.hotelFlicker.t <= 0) eng.hotelFlicker = null
  }
  // 木门寿命（窗口平移会重拼结构表：门不在表里就按世界坐标补回去）
  if (r.door && r.doorMap !== m) { r.door = null; eng.hotelEventDoor = null } // 换了地图（换楼层 / 读档）：门作废
  if (r.door) {
    r.doorT -= dt
    const ed = eng.hotelEventDoor, inf = m.inf
    if (ed && inf && !m.structures.includes(r.door)) { r.door.x = ed.wx - inf.ox; r.door.y = ed.wy - inf.oy; m.structures.push(r.door) }
    if (r.doorT <= 0 || !ed) {
      m.structures = m.structures.filter((v) => v !== r.door)
      if (ed && Math.hypot(r.door.x + 0.5 - p.x, r.door.y + 0.5 - p.y) < 12) eng.msg('你回头时，那扇木门已经不在了。墙纸严丝合缝。', 'lore')
      eng.hotelEventDoor = null; r.door = null
    }
    return
  }
  // 触发（出生安全区与刚进层的 60 s 内不触发）
  const sp = m.spawn
  if (h.stay < 60 || (sp && Math.hypot(p.x - sp.x, p.y - sp.y) < HT1C.flickerSafe)) return
  if (Math.random() < flickerRate(h.attn, h.floor) * dt) hotelFlickerEvent(eng)
}
/** 立刻触发一次「灯光同时闪烁」（自检 / dev 可直接调用）；返回浮出的木门 */
export function hotelFlickerEvent(eng: Engine): Structure | null {
  const m = eng.map, p = eng.player
  if (!m || eng.levelDef.id !== 5) return null
  eng.hotelFlicker = { x: p.x, y: p.y, t: HT1C.flickerLen }
  audio.hotelBell(0.3)
  eng.msg('四周的灯同时闪了起来。', 'lore')
  const spot = findViewWall(eng)
  if (!spot) return null
  const inf = m.inf
  const s: Structure = { kind: 'l5pocketdoor', x: spot.x, y: spot.y, w: 1, h: 1, solid: false, data: { l5: 1, pocket: 'beast', wall: spot.wall, event: 1 } }
  m.structures.push(s) // 只进窗口结构表（交互用）；模型由 renderer/l5Notice.syncHotelEventDoor 单独画，不触发 chunk 重建
  eng.hotelEventDoor = { wx: spot.x + (inf?.ox ?? 0), wy: spot.y + (inf?.oy ?? 0), wall: spot.wall }
  if (eng.hotelBook.seen.flicker === undefined) { eng.hotelBook.seen.flicker = eng.hotel.floor; saveBook(eng.hotelBook) }
  const r = frt(eng)
  r.door = s; r.doorT = HT1C.beastDoorLen; r.doorMap = m
  return s
}
/** [spokes] 读过迎宾海报：视野里的墙上浮出一扇「大堂」门（一次；寿命同野兽木门，不闪灯）。返回是否成功 */
export function hotelLobbyInvite(eng: Engine): Structure | null {
  const m = eng.map
  if (!m?.inf || eng.levelDef.id !== 5) return null
  const r = frt(eng)
  if (r.door) return null
  const spot = findViewWall(eng)
  if (!spot) return null
  const inf = m.inf
  const s: Structure = { kind: 'l5pocketdoor', x: spot.x, y: spot.y, w: 1, h: 1, solid: false, data: { l5: 1, pocket: 'lobby', wall: spot.wall, event: 1 } }
  m.structures.push(s)
  eng.hotelEventDoor = { wx: spot.x + inf.ox, wy: spot.y + inf.oy, wall: spot.wall, pocket: 'lobby' }
  r.door = s; r.doorT = HT1C.beastDoorLen; r.doorMap = m
  return s
}
/** 视野内最近的一面墙：返回贴墙的地板格（wall=墙在该格的哪一侧 0E 1S 2W 3N） */
export function findViewWall(eng: Engine): { x: number; y: number; wall: number } | null {
  const m = eng.map!, p = eng.player
  const solid = (x: number, y: number) => x < 0 || y < 0 || x >= m.w || y >= m.h || m.tiles[y * m.w + x] !== 1
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const
  let best: { x: number; y: number; wall: number; d: number } | null = null
  const R = Math.ceil(HT1C.doorMax)
  for (let y = Math.floor(p.y) - R; y <= Math.floor(p.y) + R; y++) for (let x = Math.floor(p.x) - R; x <= Math.floor(p.x) + R; x++) {
    if (solid(x, y)) continue
    const cx = x + 0.5, cy = y + 0.5, d = Math.hypot(cx - p.x, cy - p.y)
    if (d < HT1C.doorMin || d > HT1C.doorMax || (best && d >= best.d)) continue
    if (yawTo(eng, cx, cy) > HT1C.doorCone) continue
    if (m.structures.some((s) => s.x === x && s.y === y)) continue
    for (let w = 0; w < 4; w++) {
      const [dx, dy] = DIRS[w]
      if (!solid(x + dx, y + dy)) continue
      if (solid(x - dx, y - dy)) continue // 窄缝不挂
      // 墙面必须朝向玩家（玩家在门前一侧）
      if ((p.x - cx) * dx + (p.y - cy) * dy > 0.2) continue
      if (!eng.los(p.x, p.y, cx, cy)) continue
      best = { x, y, wall: w, d }
      break
    }
  }
  return best ? { x: best.x, y: best.y, wall: best.wall } : null
}
// ---- 口袋房间（野兽办公室 117 / 大堂 118）----
/** 推开口袋门：记录返程（楼层 + 地图种子 + 位置），走据点同款 bloom 过场 */
export function hotelEnterPocket(eng: Engine, kind: PocketKind) {
  const m = eng.map
  if (!m || eng.levelDef.id !== 5 || eng.transition) return false
  const h = eng.hotel
  if (kind === 'beast') { hotelAddAttn(eng, HT1C.attnBeastDoor); hotelRuleProve(eng, 'flicker') }
  if (kind === 'lobby') spokesSnapshot(eng) // [spokes] 推开大堂门这一刻：给迎宾女郎的心声拍一张 L5 快照（出口 / 危险房间 / 员工）
  h.pocket = { kind, floor: h.floor, mapSeed: eng.mapSeed }
  eng.hotelEventDoor = null
  const dest = POCKET_LEVEL[kind]
  rememberOutpostEntry(eng, dest)
  eng.career.returnAnchor!.yaw += Math.PI
  eng.transition = { anim: 'bloom', t: 0, dest }
  eng.emit({ kind: 'transition', anim: 'bloom', cutIn: 'outpost', dest })
  audio.hotelCreak(0.5)
  return true
}
/** 进入口袋房间时（level.loadLevel 调用） */
export function hotelPocketArrive(eng: Engine, id: number) {
  const h = eng.hotel
  if (id === POCKET_LEVEL.lobby) {
    eng.player.sanity = 100
    eng.msg('大堂。一尘不染。服务铃旁边放着一样东西，像是在等你。', 'lore')
    spokesLobbyArrive(eng) // [spokes] 迎宾女郎站在前台后面（自由之后不在）
  } else if (id === POCKET_LEVEL.beast) {
    if (eng.hotelBook.seen.office === undefined) { eng.hotelBook.seen.office = h.pocket?.floor ?? 1; saveBook(eng.hotelBook) }
    eng.msg('一间办公室。茶还是热的。书桌后面，有人在等你。墙上的画像正看着门口。', 'lore') // [beast] 阶段 3：椅子不再是空的
    beastOfficeArrive(eng)
    spokesOfficeArrive(eng) // [spokes] 侦探照片在书桌前的地上（还没给她看过的话）
  }
  void h
}
/** 回到 L5 时（level.loadLevel 生成地图之前调用）：返回该用的地图种子（不是口袋返程则 null） */
export function hotelPocketReturnSeed(eng: Engine): number | null {
  const pk = eng.hotel.pocket
  if (!pk || (eng.player.level !== POCKET_LEVEL.beast && eng.player.level !== POCKET_LEVEL.lobby && eng.player.level !== POCKET_LEVEL.casino)) return null
  return pk.mapSeed
}
/** 回到 L5 之后：大堂的「抹除」——60 m 迷雾重置、日志改写、登记簿只记「???」 */
export function hotelPocketAfterReturn(eng: Engine) {
  const pk = eng.hotel.pocket
  if (!pk) return
  eng.hotel.pocket = undefined
  if (pk.kind !== 'lobby') return
  const m = eng.map, p = eng.player
  if (m && eng.explored.length === m.w * m.h) {
    const R = HT1C.lobbyWipeR
    for (let y = Math.max(0, Math.floor(p.y - R)); y < Math.min(m.h, p.y + R); y++) for (let x = Math.max(0, Math.floor(p.x - R)); x < Math.min(m.w, p.x + R); x++)
      if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= R) eng.explored[y * m.w + x] = 0
  }
  for (const e of eng.msgLog) if (e.text.includes('大堂')) e.text = '你不该知道这些。'
  const book = eng.hotelBook
  if (!book.rooms.includes('lobby')) { book.rooms.push('lobby'); saveBook(book) }
  eng.photoFlashT = 0.9
  eng.msg('一片白光。你站在走廊里，想不起刚才去过哪里。', 'lore')
}

/** 面板：玩家在住客须知上用铅笔标「真？」/「假？」（再点一次擦掉） */
export function hotelPencil(eng: Engine, id: string, v: 'true' | 'false') {
  const b = eng.hotelBook
  if (b.marks[id] === v) delete b.marks[id]; else b.marks[id] = v
  saveBook(b)
}
/** 面板：换班提示语（不给精确秒数） */
export function hotelShiftHint(eng: Engine): string {
  const s = eng.hotelShift
  if (eng.levelDef.id !== 5) return '你不在酒店里。唱片还在某处转着。'
  if (s.phase === 'shift') return '音乐停了。走廊里有推车的声音。'
  if (s.phase === 'warn') return '唱片在跳针。'
  return s.tLeft < 180 ? '这首曲子快放完了。' : '留声机正放着一首慢狐步。'
}

// ---- 1d：大堂门只在不被注视时出现 ----
// 生成时就在墙上，但一开始是「不存在」的：玩家看着那面墙时它不会出现；在附近、却连续 1.5 s 没看着它，它才浮现，
// 之后（本楼层地图内）一直在。没出现的门不可交互、不渲染（renderer 每帧按 hotelLobbyShown 切 visible）。
const lobbyKey = (eng: Engine, s: Structure) => `${s.x + (eng.map?.inf?.ox ?? 0)},${s.y + (eng.map?.inf?.oy ?? 0)}`
export function hotelLobbyShownKey(eng: Engine, key: string) { const r = FR.get(eng); return !!r && r.lobbyMap === eng.map && r.lobbyShown.has(key) }
export function hotelLobbyShown(eng: Engine, s: Structure) { return s.data?.pocket !== 'lobby' || !!s.data?.event || hotelLobbyShownKey(eng, lobbyKey(eng, s)) } // [spokes] 海报邀请浮出的大堂门（event）一出现就能推
function updateLobbyDoors(eng: Engine, dt: number) {
  const m = eng.map!, p = eng.player, r = frt(eng)
  if (r.lobbyMap !== m) { r.lobbyMap = m; r.lobbyShown.clear(); r.lobbyAway.clear() }
  for (const s of m.structures) {
    if (s.kind !== 'l5pocketdoor' || s.data?.pocket !== 'lobby') continue
    const cx = s.x + 0.5, cy = s.y + 0.5, key = lobbyKey(eng, s)
    if (r.lobbyShown.has(key) || Math.hypot(cx - p.x, cy - p.y) > HT1C.lobbyR) continue
    const watched = yawTo(eng, cx, cy) < HT1C.lobbyCone && eng.los(p.x, p.y, cx, cy)
    const t = watched ? 0 : (r.lobbyAway.get(key) ?? 0) + dt
    r.lobbyAway.set(key, t)
    if (t >= HT1C.lobbyAway) { r.lobbyShown.add(key); r.lobbyAway.delete(key); if (Math.hypot(cx - p.x, cy - p.y) < 8) eng.msg('身后的走廊似乎多了点什么。', 'lore') }
  }
}

// ---------- [l5items] O18 / 房卡 / O666 接线 ----------
function curRoom(eng: Engine) {
  const m = eng.map; if (!m?.inf) return null
  const p = eng.player, reg = l5RegionAt(m.inf.seed, p.x + (m.inf.ox ?? 0), p.y + (m.inf.oy ?? 0))
  if (!reg?.variant || !ROOMS.has(reg.variant)) return null
  return { reg, key: o18RoomKey(eng.hotel.floor, reg.x0, reg.y0), no: roomNumber(m.inf.seed, reg.x0, reg.y0) }
}
/** 站在你登记的房间里（房卡：睡觉安全 / 员工不扰 / 关注度降更快 / 储物柜） */
export function hotelOwnRoom(eng: Engine): boolean {
  const c = curRoom(eng), o = (eng.hotel as HotelState).objs
  const k = o?.card
  if (!c || c.reg.variant !== 'guestroom' || !k || k.floor !== eng.hotel.floor || k.dx === undefined || eng.countItem('roomcard') <= 0) return false
  const ox = eng.map!.inf!.ox ?? 0, oy = eng.map!.inf!.oy ?? 0, M = 1.5
  return k.dx + ox >= c.reg.x0 - M && k.dx + ox <= c.reg.x1 + M && k.dy! + oy >= c.reg.y0 - M && k.dy! + oy <= c.reg.y1 + M
}
/** 房卡：同楼层、尚未绑定或就是你那间 → 可刷 */
export function hotelCardCan(eng: Engine, s: Structure): boolean {
  if (eng.levelDef.id !== 5 || eng.countItem('roomcard') <= 0 || s.data?.staff === 1) return false
  const k = (eng.hotel as HotelState).objs?.card
  if (!k || k.floor !== eng.hotel.floor) return false
  return k.dx === undefined ? true : cardOpens(k, eng.hotel.floor, Number(s.data?.room))
}
export function hotelCardSwipe(eng: Engine, s: Structure): boolean {
  if (!hotelCardCan(eng, s)) return false
  const k = objSave(eng).card!
  if (k.dx === undefined) { k.no = Number(s.data?.room) || k.no; k.dx = s.x; k.dy = s.y; eng.msg(`房卡「嘀」了一声，绿灯。从今天起，${k.no} 号是你的房间。`, 'system') }
  else eng.msg('房卡「嘀」了一声，绿灯。', 'system')
  s.data = { ...s.data, locked: 0, baseLock: 0, open: 1 }; s.solid = false; audio.uiTick()
  return true
}
/** 118 大堂前台登记（迎宾女郎接待，签登记簿）→ 房卡；丢卡补办关注度 +5 */
export function hotelRegisterCard(eng: Engine): 'new' | 'reissue' | null {
  const o = objSave(eng), has = eng.countItem('roomcard') > 0
  if (has) return null
  const floor = Math.max(1, eng.hotel.floor)
  const re = !!o.card
  if (!eng.addItem('roomcard')) return null
  if (re) { eng.hotel.attn = clamp(eng.hotel.attn + CARD_REISSUE_ATTN, 0, 100); eng.msg(`补办了一张房卡（${o.card!.no} 号）。她的笑容停顿了半拍。`, 'system') }
  else { o.card = { no: 100 + Math.floor(Math.random() * 900), floor }; eng.msg(`你在登记簿上签了名。房卡：${floor} 楼——刷你遇到的第一扇关着的客房门，那就是你的房间。`, 'system') }
  const b = eng.hotelBook; b.src.roomcard ??= `${floor}F · 118 大堂前台`; saveBook(b)
  return re ? 'reissue' : 'new'
}
/** 你的房间、且你绑定的那扇门挂着「请勿打扰」（房卡让挂牌真的有用） */
export function hotelOwnRoomDnd(eng: Engine): boolean {
  if (eng.levelDef.id !== 5 || !hotelOwnRoom(eng)) return false
  const k = objSave(eng).card!
  return !!eng.map?.structures.some((s) => s.kind === 'hoteldoor' && s.x === k.dx && s.y === k.dy && s.data?.dnd)
}
/** 员工（管家 / 行李员 / 看门人）是否该绕开玩家：在自己房间休息时 */
export function hotelStaffSkip(eng: Engine): boolean { return eng.levelDef.id === 5 && hotelOwnRoom(eng) && !!RT.get(eng)?.restAt }
/** 门能否被打开（O18 锁死优先；房卡只开自己的门） */
export function hotelDoorBlocked(eng: Engine): boolean { return eng.levelDef.id === 5 && o18DoorLocked(eng) }
export function l5Hooks(eng: Engine): L5ObjHooks {
  return {
    msg: (t, k) => eng.msg(t, (k ?? 'system') as Parameters<Engine['msg']>[1]),
    addAttn: (n) => { eng.hotel.attn = clamp(eng.hotel.attn + n, 0, 100) },
    addItem: (t) => eng.addItem(t),
    beastGaze: () => { beastSpawnPeripheral(eng) },
    lift13: () => { conciergeStartLift(eng) },
    teleport: () => { const id = 1 + Math.floor(Math.random() * Math.max(1, NORMAL_LEVELS - 1)); eng.loadLevel(id === 5 ? 4 : id) },
    randomEvent: () => { const k = Math.floor(Math.random() * 3); if (k === 0) audio.hotelBell(0.8); else if (k === 1) { eng.hotelVanishT = Math.max(eng.hotelVanishT, 3); audio.hotelScratch(0.8) } else { eng.hotel.attn = clamp(eng.hotel.attn + 10, 0, 100); audio.hotelSteps(0.8) } },
    phono: (on) => { audio.phonoO18 = on },
  }
}
function stepL5Objects(eng: Engine, dt: number, guest: boolean) {
  const o = objSave(eng), r = rt(eng), c = guest ? curRoom(eng) : null
  // O18：所在客房区里有一台 data.o18 的留声机（infiniteL5 生成时按 3% 掷点）
  let ph: Structure | null = null
  if (c) {
    const ox = eng.map!.inf!.ox ?? 0, oy = eng.map!.inf!.oy ?? 0
    for (const s of eng.map!.structures) if (s.kind === 'phonograph' && s.data?.o18 && s.x + ox >= c.reg.x0 && s.x + ox <= c.reg.x1 && s.y + oy >= c.reg.y0 && s.y + oy <= c.reg.y1) { ph = s; break }
  }
  const o18 = ph && ph.data?.on !== 0 ? c!.key : null
  let melee = false, bang = false
  if (r.o18Noise && o18) { if (Math.hypot(eng.player.x - ph!.x - 0.5, eng.player.y - ph!.y - 0.5) < 1.9) melee = true; else bang = true }
  r.o18Noise = false
  const hk = l5Hooks(eng)
  // [l5items 收尾] 读档恢复：存档里有状态的留声机（砸烂 / 抬臂 / 凹陷 / 停转）写回结构 data（窗口重建 / 读档后 data 是新生成的）
  if (o.phono && eng.map?.inf) { const ox = eng.map.inf.ox ?? 0, oy = eng.map.inf.oy ?? 0
    for (const s of eng.map.structures) if (s.kind === 'phonograph' && s.data?.o18 && !s.data.restored) { const sv = o.phono[phonoKey(eng.hotel.floor, s.x + ox, s.y + oy)]; s.data = { ...s.data, restored: 1, ...(sv ? { arm: sv.arm, broke: sv.broke, dent: sv.dent, ...(sv.on ? {} : { on: 0 }) } : {}) } } }
  const savePh = () => { if (!ph || !eng.map?.inf) return; const k = phonoKey(eng.hotel.floor, ph.x + (eng.map.inf.ox ?? 0), ph.y + (eng.map.inf.oy ?? 0)), d = ph.data ?? {}
    const v = { arm: Number(d.arm) || 0, broke: (d.broke ? 1 : 0) as 0 | 1, dent: Number(d.dent) || 0, on: (d.on === 0 ? 0 : 1) as 0 | 1 }, cur = o.phono?.[k]
    if (v.on && !v.arm && !v.broke && !v.dent && !cur) return
    if (!cur || cur.arm !== v.arm || cur.broke !== v.broke || cur.dent !== v.dent || cur.on !== v.on) (o.phono ??= {})[k] = v }
  hk.phono = (on) => { audio.phonoO18 = on; if (!on && ph) ph.data = { ...ph.data, on: 0 } }
  stepObjects(eng, o, { inO18Room: o18, holdX: !!eng.specialHeld && !!o18, meleeHit: melee, bang, moved: 0, enclosedRoom: c?.key ?? null }, dt, hk)
  if (o18 && o.smashed.includes(o18) && ph) ph.data = { ...ph.data, on: 0 }
  // [l5items v2] 留声机模型状态与 O18 交互同步：arm = 唱臂抬起进度 0..1（抬针完成停在 1），broke = 被砸烂（换碎裂模型）
  if (ph) {
    const run = o.o18 && o.o18.key === o18 ? o.o18 : null, last = o.o18Last && o.o18Last.key === c?.key ? o.o18Last.done : null
    const { arm, broke, dent } = phonoSyncData(run, last, ph.data ?? {})
    if (ph.data?.arm !== arm || (ph.data?.broke ?? 0) !== broke || (ph.data?.dent ?? 0) !== dent) ph.data = { ...ph.data, arm, broke, dent }
  }
  savePh()
}
/** X 使用命运之骰（inventory.finishUseSlot 先问这里） */
export function hotelUseFateDie(eng: Engine): boolean {
  const c = eng.levelDef.id === 5 && eng.map?.inf ? curRoom(eng) : null
  rollFateDie(eng, objSave(eng), c?.key ?? null, l5Hooks(eng))
  return true
}
