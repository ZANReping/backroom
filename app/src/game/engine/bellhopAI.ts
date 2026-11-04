// [bellhop] 行李员（Entity 135「The Bellhopper」）阶段 3：L5 恐怖旅馆的行李员工。设计见 /workspace/work/bellhop/plan.md（ZAN 10-30 23:09 定稿：全按推荐）。
//   · 孤例：全楼只有一位，只在 L5。进层后在你所在楼层一条长走廊的尽头出现（距 20–40 m、你的视线外）；10F 行李层一定在，其他楼层按概率。
//     位置按世界绝对坐标记在存档里（eng.hotel.bellhop.ax / ay），流式地图平移 / chunk 卸载后会在原处重建。
//   · 「你回头的时候，他也会转头」：被你看着时一动不动（stillWatch，头和脸都不变）；你移开视线再看回去，他的头已经拧向你，
//     而且换了一张脸（8 张面盘洗牌轮换、不重复，换脸只在不被看时发生）。不被看时他会挪到你前方下一条走廊的尽头候命（视线外瞬移）。
//   · 不说话，只摇铃：友好（清脆两下）/ 恼怒（沉闷一长声）。恼怒铃 = 酒店关注度 +10，并把管家 / 看门人引到铃声的位置。
//     他本人从不攻击；挨打不受伤，只后退一步、摇恼怒铃。
//   · 寄存（X，2 m 内）：把手上（快捷栏选中，空手则快捷栏第一件）的一件东西交给他，换一张带编号的行李牌（物品 bagTag，编号存在格子的 tag 字段）；
//     再按 X 出示行李牌取回。寄存物存在 eng.hotel.bellhop.deposits，不在身上，所以看门人 13 楼的没收不影响它们。
//   · 「他知道住客的结局」：关注度 ≥ 75 时他不再收寄存（恼怒铃），并把你寄存的东西全部送到 10F 行李房（主厅角落的行李寄存处），要自己去取。
//   · 拿走：13 楼后果里被没收的钥匙类物品转交他保管（找到他按 X 领回，代价关注度 +5）；你在 L5 死亡时身上的东西被他搬去 10F 行李房——
//     死亡会结束本局（本局存档失效），所以这份「遗物」按存档位记在 localStorage（br_bellhop_legacy_<槽位>），同一存档位下一局在 10F 行李房取回。
//   · 茶：把客房茶 / 咖啡递给他 → 友好铃 + 饮茶（teaSip），免下一次领取代价。
//   · 彩蛋：10F 行李房里有一封「绅士的情书」（Entity 18 写给他的信）。交给他之后本局永久友好（领回不再有代价），图鉴解锁一行（跨局）。
//   · 只处理本地玩家（不管联机）。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { makeEntity } from '../entities'
import type { BellhopClip } from '../renderer/bellhopAnim'
import { hotelAddAttn, l5Tier, saveBook, type HotelLostItem } from './l5Hotel'
import { l5HallRect, l5RegionAt } from '../world/infiniteL5'
import type { SpecialAction } from './special'
import { audio } from '../core/audio'
import { floorHeight } from '../world/mapgen'
import { canOccupy } from '../core/player'
import { isKeyItem, itemName } from '../content/items'
import type { InvSlot } from '../engine'
import { findMaid, ensureMaid, maidActAt } from './maidAI'
import { conciergeHearBell } from './conciergeAI'

// ---------- 调参表（单位：米 / 秒 / 点）----------
export const BH = {
  // —— 生成 ——
  firstDelay: 10, // 进入一张 L5 地图后多久开始尝试出现
  spawnP: { lux: 1, other: 0.55, retry: 0.35 }, // 10F 必出现；其他楼层首次 55%，失败后每 retryGap 秒再掷 35%
  retryGap: 90,
  luggageFloor: 10,
  spawnR: [20, 40] as const, spawnLoose: [12, 48] as const, // 走廊尽头距离（找不到时放宽）
  // —— 注视 ——
  watchCone: 0.8, watchR: 40, zSame: 2.5, // 「被看着」：玩家视线 ±0.8 rad、40 m 内、视线无遮挡
  turnAfter: 0.45, // 移开视线这么久以后：头已拧向你、脸已换
  relocateT: 3.5, relocateNear: 9, relocateFar: 46, relocateBehind: 2.2, // 视线外 3.5 s 且（太近 / 太远 / 落在你身后）→ 挪到你前方下一条走廊尽头
  faceSeenR: 18, // 看清他的脸（点亮图鉴「见过的面孔」）的距离
  // —— 服务 ——
  serveR: 2.0, depositCap: 8, tagStart: 135,
  refuseAt: 75, // 关注度 ≥ 75（清理档）：拒收寄存 + 把寄存物送去 10F 行李房
  keyClaimAttn: 5, // 领回 13 楼被没收的钥匙：关注度 +5（有茶 / 情书则免）
  annoyAttn: 10, annoyCd: 3, // 恼怒铃：关注度 +10（冷却内不重复计）
  lureR: 40, // 恼怒铃引员工的范围（管家听得见的距离）
  hitBack: 0.6, // 挨打后退
  roomR: 2.4, legacyCap: 16, holdCap: 24, roomCap: 60,
  // —— 远处铃声（关照档，l5Hotel.bellEvery）——
  farBellR: 60,
  rel: { deposit: 2, claim: 1, tea: 8, letter: 60, annoyed: -6, hit: -10 },
}
/** 片段时长（= renderer/bellhopAnim BELLHOP_CLIPS.dur，免得 AI 依赖渲染模块） */
export const BH_CLIP_LEN: Record<BellhopClip, number> = { idle: 6, headTurn: 3.2, ringFriendly: 2.4, ringAnnoyed: 3.4, bow: 3, walk: 1.05, pushCart: 1.25, takeItem: 3.2, giveBack: 3.2, tagHand: 3, teaSip: 6, faceShift: 1.4, pickUp: 4.6, stillWatch: 2 }
const LOOP = new Set<BellhopClip>(['idle', 'walk', 'pushCart', 'stillWatch'])

export type BellhopMode = 'wait' | 'still' | 'serve' | 'ring'
export interface BellhopEntState {
  mode: BellhopMode; modeT: number
  clip: BellhopClip; seq: number // 渲染层：clip / seq 变了就重播
  queue: BellhopClip[] // 服务片段队列（takeItem → tagHand → ringFriendly …）
  watched: boolean; unseenT: number; turned: boolean
  /** 拧头角（rad，+ = 向他的左边，与 bellhopAnim opts.turn 同约定）；只在不被看时更新 */
  headYaw: number
  face: number
  annoyCd: number; hitT: number
}
/** 每局存档（eng.hotel.bellhop） */
export interface BellhopDeposit { tag: number; item: HotelLostItem }
export interface BellhopSave {
  floor: number; ax: number; ay: number; f: number; placed?: 1 // 上一次所在楼层与绝对坐标（同层回来时原处重建）
  next: number // 下一张行李牌编号
  deposits: BellhopDeposit[] // 寄存在他手里的东西
  room: HotelLostItem[] // 10F 行李房里的东西（≥75 转运 / 死亡遗物）
  held: HotelLostItem[] // 13 楼没收、转交他保管的钥匙类
  free: number // 茶换来的免代价次数
  loved?: 1 // 情书：本局永久友好
  letter?: 1 // 情书已从行李房取走
  face: number; bag: number[] // 当前脸 / 洗牌剩余
  n: { deposit: number; claim: number; refuse: number; annoyed: number; friendly: number; tea: number; moved: number; keys: number }
}
export function freshBellhopSave(): BellhopSave {
  return { floor: -1, ax: 0, ay: 0, f: 0, next: BH.tagStart, deposits: [], room: [], held: [], free: 0, face: 0, bag: [], n: { deposit: 0, claim: 0, refuse: 0, annoyed: 0, friendly: 0, tea: 0, moved: 0, keys: 0 } }
}
const arrItems = (v: unknown, cap: number): HotelLostItem[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && typeof (x as HotelLostItem).type === 'string').slice(-cap) as HotelLostItem[] : [])
export function restoreBellhopSave(raw: unknown): BellhopSave {
  const f = freshBellhopSave()
  if (!raw || typeof raw !== 'object') return f
  const r = raw as Partial<BellhopSave>
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
  const n = (r.n ?? {}) as Partial<BellhopSave['n']>
  return {
    floor: num(r.floor, -1), ax: num(r.ax), ay: num(r.ay), f: num(r.f), ...(r.placed ? { placed: 1 as const } : {}),
    next: Math.max(BH.tagStart, num(r.next, BH.tagStart)),
    deposits: Array.isArray(r.deposits) ? r.deposits.filter((d) => d && Number.isFinite(Number(d.tag)) && d.item && typeof d.item.type === 'string').slice(-BH.depositCap) : [],
    room: arrItems(r.room, BH.roomCap), held: arrItems(r.held, BH.holdCap), free: Math.max(0, num(r.free)),
    ...(r.loved ? { loved: 1 as const } : {}), ...(r.letter ? { letter: 1 as const } : {}),
    face: ((Math.floor(num(r.face)) % 8) + 8) % 8, bag: Array.isArray(r.bag) ? r.bag.filter((x) => Number.isInteger(x) && x >= 0 && x < 8) : [],
    n: { deposit: num(n.deposit), claim: num(n.claim), refuse: num(n.refuse), annoyed: num(n.annoyed), friendly: num(n.friendly), tea: num(n.tea), moved: num(n.moved), keys: num(n.keys) },
  }
}
export function bellhopSave(eng: Engine): BellhopSave { return ((eng.hotel as { bellhop?: BellhopSave }).bellhop ??= freshBellhopSave()) }
/** 登记簿（跨局）：见过的面孔 / 情书那一行 */
interface BookExt { bhFaces?: number[]; bhLove?: 1 }
export function bellhopBook(eng: Engine): BookExt { return eng.hotelBook as unknown as BookExt }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
function setClip(s: BellhopEntState, clip: BellhopClip) { if (clip !== s.clip || !LOOP.has(clip)) s.seq++; s.clip = clip }
function setMode(s: BellhopEntState, m: BellhopMode, clip: BellhopClip) { s.mode = m; s.modeT = 0; setClip(s, clip) }
export function ensureBellhop(e: Entity): BellhopEntState {
  return (e.bh ??= { mode: 'wait', modeT: 0, clip: 'idle', seq: 0, queue: [], watched: false, unseenT: 99, turned: true, headYaw: 0, face: 0, annoyCd: 0, hitT: 0 })
}
export function findBellhop(eng: Engine): Entity | null { return eng.map?.entities.find((e) => e.def.type === 'bellhop' && !e.dead) ?? null }
const ox = (eng: Engine) => eng.map?.inf?.ox ?? 0, oy = (eng: Engine) => eng.map?.inf?.oy ?? 0
const walkable = (eng: Engine, x: number, y: number) => { const m = eng.map!; return x > 0.5 && y > 0.5 && x < m.w - 0.5 && y < m.h - 0.5 && eng.entityWalkH(m, Math.floor(x), Math.floor(y), 0) !== null && canOccupy(m, x, y, 0.3, { z: 0 }) }
function rel(eng: Engine, v: number) { const h = eng.hotel; h.staff.bellhop = Math.max(-100, Math.min(100, (h.staff.bellhop ?? 0) + v)) }
function meet(eng: Engine) { const b = eng.hotelBook; if (!b.met.includes('bellhop')) { b.met.push('bellhop'); saveBook(b) } }

// ---------- 注视 ----------
/** 玩家正看着这个点（视线 ±watchCone、watchR 内、无遮挡）。0.6 m 内一律算看着 */
export function bellhopWatched(eng: Engine, x: number, y: number): boolean {
  const p = eng.player, dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy)
  if (d > BH.watchR) return false
  if (d < 0.6) return true
  if (Math.abs(wrap(Math.atan2(dy, dx) - p.facing)) > BH.watchCone) return false
  return eng.los(p.x, p.y, x, y)
}

// ---------- 走廊尽头 ----------
/** 从 (x, y) 沿 a 方向走到墙前的最后一个可站点（步长 0.5 m）；返回距离 */
function corridorEnd(eng: Engine, x: number, y: number, a: number, max: number): { x: number; y: number; d: number } | null {
  const cx = Math.cos(a), cy = Math.sin(a)
  let last: { x: number; y: number; d: number } | null = null
  for (let d = 1; d <= max; d += 0.5) {
    const px = x + cx * d, py = y + cy * d
    if (!walkable(eng, px, py)) break
    last = { x: px, y: py, d }
  }
  if (!last) return null
  // 退离墙 0.6 m
  const back = Math.max(1, last.d - 0.6)
  return { x: x + cx * back, y: y + cy * back, d: back }
}
/** 玩家视线外的「长走廊尽头」：从玩家出发 32 条射线，取尽头距离在 r0–r1 内、尽头点不被看着的；
 *  heading 给定时优先玩家前进方向（±0.6 rad 最好，背后最差） */
export function bellhopCorridorSpot(eng: Engine, r0: number, r1: number, heading?: number): { x: number; y: number; f: number } | null {
  const p = eng.player
  let best: { x: number; y: number; f: number; sc: number } | null = null
  const N = 32, a0 = Math.random() * Math.PI * 2
  for (let i = 0; i < N; i++) {
    const a = a0 + (i / N) * Math.PI * 2
    const end = corridorEnd(eng, p.x, p.y, a, r1 + 1)
    if (!end || end.d < r0 || end.d > r1) continue
    if (bellhopWatched(eng, end.x, end.y)) continue
    if (Math.abs(floorHeight(eng.map!, end.x, end.y) - p.z) > 1) continue
    let sc = end.d * 0.2 + Math.random() * 2
    if (heading !== undefined) sc += 10 * Math.cos(wrap(a - heading))
    if (!best || sc > best.sc) best = { x: end.x, y: end.y, f: Math.atan2(p.y - end.y, p.x - end.x), sc }
  }
  return best ? { x: best.x, y: best.y, f: best.f } : null
}

// ---------- 世界（每引擎一份；地图变化重置）----------
interface BhWorld { map: unknown; t: number; rolled: boolean; pending: boolean; nextRoll: number; present: boolean; lastPx: number; lastPy: number; heading: number; room: { ax: number; ay: number } | null; roomTried: boolean; legacyTaken: boolean; teaPlaced: boolean }
const WORLD = new WeakMap<Engine, BhWorld>()
function world(eng: Engine): BhWorld {
  let w = WORLD.get(eng)
  if (!w || w.map !== eng.map) {
    w = { map: eng.map, t: 0, rolled: false, pending: false, nextRoll: 0, present: false, lastPx: eng.player.x, lastPy: eng.player.y, heading: eng.player.facing, room: null, roomTried: false, legacyTaken: false, teaPlaced: false }
    WORLD.set(eng, w)
  }
  return w
}
export function bellhopDebug(eng: Engine) { return world(eng) }

/** 10F 行李房（主厅角落的行李寄存处；绝对坐标）。只在 10F 有 */
export function bellhopRoom(eng: Engine): { x: number; y: number; ax: number; ay: number } | null {
  if (eng.levelDef.id !== 5 || !eng.map?.inf || eng.hotel.floor !== BH.luggageFloor) return null
  const w = world(eng)
  if (!w.roomTried) {
    w.roomTried = true
    const r = l5HallRect(eng.map.inf.seed, 0, 0)
    // 主厅四角往里 1.6 m，取第一个可站且周围 1.2 m 都空的角
    const cand = [[r.x0 + 1.6, r.y0 + 1.6], [r.x1 - 0.6, r.y0 + 1.6], [r.x0 + 1.6, r.y1 - 0.6], [r.x1 - 0.6, r.y1 - 0.6], [(r.x0 + r.x1) / 2, r.y0 + 1.6]]
    for (const [ax, ay] of cand) {
      const x = ax - ox(eng), y = ay - oy(eng)
      let okc = walkable(eng, x, y)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (okc && !walkable(eng, x + dx * 0.9, y + dy * 0.9)) okc = false
      if (okc && !eng.map.exits.some((q) => Math.hypot(q.x - x, q.y - y) < 3)) { w.room = { ax, ay }; break }
    }
    if (!w.room) { // 退路：玩家附近随便一个开阔点（仍记成绝对坐标）
      const p = eng.player
      for (let t = 0; t < 60 && !w.room; t++) { const a = Math.random() * Math.PI * 2, rr = rnd(4, 10), x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr; if (walkable(eng, x, y)) w.room = { ax: x + ox(eng), ay: y + oy(eng) } }
    }
  }
  return w.room ? { x: w.room.ax - ox(eng), y: w.room.ay - oy(eng), ax: w.room.ax, ay: w.room.ay } : null
}

// ---------- 生成 ----------
export function spawnBellhop(eng: Engine, at?: { x: number; y: number; f?: number }): Entity | null {
  const m = eng.map; if (!m) return null
  const old = findBellhop(eng); if (old) return old
  const pos = at ?? bellhopCorridorSpot(eng, BH.spawnR[0], BH.spawnR[1]) ?? bellhopCorridorSpot(eng, BH.spawnLoose[0], BH.spawnLoose[1])
  if (!pos) return null
  const e = makeEntity('bellhop', pos.x, pos.y, floorHeight(m, pos.x, pos.y))
  e.facing = pos.f ?? Math.atan2(eng.player.y - pos.y, eng.player.x - pos.x)
  e.state = 'idle'
  const s = ensureBellhop(e), sv = bellhopSave(eng)
  s.face = sv.face
  m.entities.push(e)
  sv.floor = eng.hotel.floor; sv.ax = e.x + ox(eng); sv.ay = e.y + oy(eng); sv.f = e.facing; sv.placed = 1
  return e
}
/** 洗牌取下一张脸：8 张一轮、不重复，也不和当前这张相同 */
export function bellhopNextFace(sv: BellhopSave): number {
  if (!sv.bag.length) { const a = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => i !== sv.face); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } sv.bag = a }
  let f = sv.bag.shift()!
  if (f === sv.face && sv.bag.length) { sv.bag.push(f); f = sv.bag.shift()! }
  sv.face = f
  return f
}

/** 世界步进（l5Hotel.updateHotel 调用）：生成 / 原处重建 / 遗物 / 客房茶 */
export function stepBellhopWorld(eng: Engine, dt: number) {
  const m = eng.map
  if (!m || eng.levelDef.id !== 5 || !m.inf) return
  const w = world(eng), sv = bellhopSave(eng), p = eng.player
  w.t += dt
  // 玩家前进方向（移动时才更新）
  const vx = p.x - w.lastPx, vy = p.y - w.lastPy
  if (Math.hypot(vx, vy) > 0.02 && Math.hypot(vx, vy) < 3) w.heading = Math.atan2(vy, vx)
  w.lastPx = p.x; w.lastPy = p.y
  if (!w.legacyTaken && eng.hotel.floor === BH.luggageFloor) { w.legacyTaken = true; takeLegacy(eng) }
  if (!w.teaPlaced) { w.teaPlaced = true; placeRoomTea(eng) }
  bellhopTierCheck(eng)
  let e = findBellhop(eng)
  if (e) { sv.floor = eng.hotel.floor; sv.ax = e.x + ox(eng); sv.ay = e.y + oy(eng); sv.f = e.facing; return }
  if (w.t < BH.firstDelay || eng.dev?.frozenAI) return
  // 同一层回来 / chunk 卸载：在记下的绝对坐标原处重建
  if (w.present || (sv.placed && sv.floor === eng.hotel.floor)) {
    const x = sv.ax - ox(eng), y = sv.ay - oy(eng)
    if (walkable(eng, x, y) && !bellhopWatched(eng, x, y)) { e = spawnBellhop(eng, { x, y, f: sv.f }); if (e) { w.present = true; return } }
    if (w.present) { e = spawnBellhop(eng); if (e) return }
  }
  if (w.present) return
  if (w.t < w.nextRoll) return
  if (!w.pending) {
    const pr = !w.rolled ? (eng.hotel.floor === BH.luggageFloor ? BH.spawnP.lux : BH.spawnP.other) : BH.spawnP.retry
    w.rolled = true; w.nextRoll = w.t + BH.retryGap
    if (Math.random() >= pr) return
    w.pending = true
  }
  e = spawnBellhop(eng)
  if (e) { w.present = true; w.pending = false }
  else w.nextRoll = w.t + 1 // 这次没找到视线外的走廊尽头：1 s 后再找（概率已经掷过）
}
/** 客房茶：每张 L5 地图在客房 / 餐厅 / 休息室里放 1–2 杯 */
function placeRoomTea(eng: Engine) {
  const m = eng.map!, p = eng.player
  const n = Math.random() < 0.5 ? 1 : 2
  let placed = 0
  for (let t = 0; t < 160 && placed < n; t++) {
    const x = Math.floor(rnd(4, m.w - 4)) + 0.5, y = Math.floor(rnd(4, m.h - 4)) + 0.5
    if (Math.hypot(x - p.x, y - p.y) < 8 || !walkable(eng, x, y)) continue
    const reg = l5RegionAt(m.inf!.seed, x + ox(eng), y + oy(eng))
    const v = reg?.variant as string | undefined
    if (!(v === 'guestroom' || v === 'lounge' || v === 'dining') && t < 120) continue
    m.items.push({ id: Math.random(), type: 'roomtea', count: 1, x, y })
    placed++
  }
}

// ---------- 主更新（entityAI 分派）----------
export function updateBellhop(eng: Engine, e: Entity, dt: number) {
  const s = ensureBellhop(e), p = eng.player, sv = bellhopSave(eng)
  s.modeT += dt; s.annoyCd -= dt; s.hitT -= dt
  if (e.hp < e.def.hp) bellhopKillGuard(eng, e)
  e.state = 'idle'
  const d = Math.hypot(p.x - e.x, p.y - e.y), sameZ = Math.abs((e.z ?? 0) - p.z) < BH.zSame
  const watched = sameZ && bellhopWatched(eng, e.x, e.y)
  s.watched = watched
  if (watched) {
    s.unseenT = 0; s.turned = false // 下一次移开视线才会再转头、再换脸
    // 看清了这张脸：点亮图鉴（脸朝着你、不太远）
    const toP = Math.atan2(p.y - e.y, p.x - e.x), faceDir = e.facing - s.headYaw
    if (d < BH.faceSeenR && Math.abs(wrap(toP - faceDir)) < 1.25) seeFace(eng, s.face)
    if (d < 6) meet(eng)
  } else s.unseenT += dt
  // —— 服务片段队列（玩家触发的；被看着也照常播完）——
  if (s.mode === 'serve' || s.mode === 'ring') {
    if (s.modeT >= BH_CLIP_LEN[s.clip]) {
      const nx = s.queue.shift()
      if (nx) setMode(s, nx === 'ringAnnoyed' || nx === 'ringFriendly' ? 'ring' : 'serve', nx)
      else setMode(s, watched ? 'still' : 'wait', watched ? 'stillWatch' : 'idle')
    }
    return
  }
  if (watched) { // 一动不动：头和脸保持你移开视线前的样子
    if (s.mode !== 'still') setMode(s, 'still', 'stillWatch')
    return
  }
  if (s.mode !== 'wait') setMode(s, 'wait', 'idle')
  // —— 不被看着 ——
  if (s.unseenT >= BH.turnAfter && !s.turned) {
    s.turned = true
    s.headYaw = Math.max(-Math.PI, Math.min(Math.PI, -wrap(Math.atan2(p.y - e.y, p.x - e.x) - e.facing))) // 猫头鹰式拧头：最多 180°
    s.face = bellhopNextFace(sv)
  }
  if (s.unseenT >= BH.turnAfter) s.headYaw = Math.max(-Math.PI, Math.min(Math.PI, -wrap(Math.atan2(p.y - e.y, p.x - e.x) - e.facing))) // 视线外持续跟着你转
  // 挪到你前方下一条走廊尽头（视线外瞬移）
  if (s.unseenT >= BH.relocateT) {
    const w = world(eng)
    const behind = Math.cos(wrap(Math.atan2(e.y - p.y, e.x - p.x) - w.heading)) < -0.2 && d > BH.relocateBehind
    if (d < BH.relocateNear || d > BH.relocateFar || behind || !sameZ) {
      const to = bellhopCorridorSpot(eng, BH.spawnR[0], BH.spawnR[1], w.heading) ?? bellhopCorridorSpot(eng, BH.spawnLoose[0], BH.spawnLoose[1], w.heading)
      if (to && Math.cos(wrap(Math.atan2(to.y - p.y, to.x - p.x) - w.heading)) > -0.1) {
        e.x = to.x; e.y = to.y; e.targetX = to.x; e.targetY = to.y; e.facing = to.f; e.z = floorHeight(eng.map!, to.x, to.y)
        s.headYaw = 0; s.unseenT = BH.turnAfter; s.face = bellhopNextFace(sv)
      } else s.unseenT = BH.relocateT - 1.5 // 没找到：过一会儿再试
    }
  }
}
function seeFace(eng: Engine, f: number) {
  const b = bellhopBook(eng)
  const arr = (b.bhFaces ??= [])
  if (!arr.includes(f)) { arr.push(f); arr.sort((a, c) => a - c); saveBook(eng.hotelBook) }
}

// ---------- 铃声 ----------
/** 摇铃：friendly 清脆两下 / annoyed 沉闷一长声。annoyed = 关注度 +10，并把管家 / 看门人引到铃声位置 */
export function bellhopRing(eng: Engine, e: Entity, kind: 'friendly' | 'annoyed', queue = true) {
  const s = ensureBellhop(e), sv = bellhopSave(eng)
  const clip: BellhopClip = kind === 'friendly' ? 'ringFriendly' : 'ringAnnoyed'
  if (queue && (s.mode === 'serve' || s.mode === 'ring')) s.queue.push(clip)
  else setMode(s, 'ring', clip)
  playBell(eng, e.x, e.y, kind)
  if (kind === 'friendly') { sv.n.friendly++; return }
  sv.n.annoyed++; rel(eng, BH.rel.annoyed)
  if (s.annoyCd > 0) return
  s.annoyCd = BH.annoyCd
  hotelAddAttn(eng, BH.annoyAttn)
  lureStaff(eng, e.x, e.y)
}
function playBell(eng: Engine, x: number, y: number, kind: 'friendly' | 'annoyed', far = 1) {
  const p = eng.player, d = Math.hypot(x - p.x, y - p.y)
  const vol = Math.max(0.08, 1 - d / BH.farBellR) * far
  const pan = Math.sin(wrap(Math.atan2(y - p.y, x - p.x) - p.facing)) * Math.min(1, d / 4)
  audio.bellhopBell?.(kind, vol, pan)
}
/** 恼怒铃把员工引过来：管家（听觉，打扰值拉到「走过来」阈值，目标 = 铃声位置）/ 看门人（眨眼到铃声附近，再回岗） */
function lureStaff(eng: Engine, x: number, y: number) {
  const md = findMaid(eng)
  if (md && Math.hypot(md.x - x, md.y - y) < BH.lureR) {
    const ms = ensureMaid(md)
    if (ms.grace <= 0 && ms.mode !== 'clean') { ms.dist = Math.max(ms.dist, maidActAt(eng) + 1); ms.quietT = 0; ms.nx = x; ms.ny = y }
  }
  conciergeHearBell(eng, x, y)
}
/** l5Hotel「关照」档远处铃声：他在同层时由他所在的位置发出（返回 true = 已处理） */
export function bellhopDistantBell(eng: Engine, vol: number): boolean {
  const e = findBellhop(eng); if (!e) return false
  playBell(eng, e.x, e.y, 'friendly', vol / 0.35 * 0.6)
  return true
}

// ---------- 挨打：不受伤，只后退一步、摇恼怒铃（combat.killCheck 钩子）----------
export function bellhopKillGuard(eng: Engine, e: Entity): boolean {
  if (e.def.type !== 'bellhop') return false
  const s = ensureBellhop(e)
  e.hp = e.def.hp; e.dead = false
  if (s.hitT > 0) return true
  s.hitT = 0.8
  const p = eng.player, a = Math.atan2(e.y - p.y, e.x - p.x)
  const x = e.x + Math.cos(a) * BH.hitBack, y = e.y + Math.sin(a) * BH.hitBack
  if (walkable(eng, x, y)) { e.x = x; e.y = y }
  rel(eng, BH.rel.hit)
  s.queue = []
  bellhopRing(eng, e, 'annoyed', false)
  eng.msg('行李员往后退了一步，掸了掸袖口。铃声沉沉地响了很久。', 'lore')
  return true
}

// ---------- 物品工具 ----------
const toLost = (sl: InvSlot): HotelLostItem => ({ type: sl.type, count: sl.count ?? 1, t: Date.now(), ...(sl.dur !== undefined ? { dur: sl.dur } : {}), ...(sl.blood ? { blood: sl.blood } : {}), ...(sl.mag ? { mag: [...sl.mag] } : {}), ...(sl.ammoSel ? { ammoSel: sl.ammoSel } : {}), ...(sl.stage ? { stage: sl.stage } : {}), ...(sl.cyl ? { cyl: sl.cyl } : {}), ...(sl.tag !== undefined && sl.type === 'warpberry' ? { tag: sl.tag } : {}) } as HotelLostItem)
const extraOf = (it: HotelLostItem) => ({ ...(it.dur !== undefined ? { dur: it.dur } : {}), ...(it.blood ? { blood: it.blood } : {}), ...(it.mag ? { mag: [...it.mag] } : {}), ...(it.ammoSel ? { ammoSel: it.ammoSel } : {}), ...(it.stage ? { stage: it.stage } : {}), ...(it.cyl ? { cyl: it.cyl } : {}) })
/** 把一件寄存物整件放回背包；返回放回的数量 */
function giveItem(eng: Engine, it: HotelLostItem): number {
  let got = 0
  while (got < it.count && eng.addItem(it.type, extraOf(it) as never)) got++
  return got
}
/** 快捷栏 / 背包里放一张带编号的行李牌（tag 字段 = 编号；不同编号不堆叠） */
function addTag(eng: Engine, no: number): boolean {
  const p = eng.player
  for (const arr of [p.hotbar, p.backpack]) for (let i = 0; i < arr.length; i++) if (!arr[i]) { arr[i] = { type: 'bagTag', count: 1, tag: no }; return true }
  return false
}
/** 身上的行李牌（快捷栏选中优先）；返回位置与编号（没有编号的旧牌 no = -1） */
function findTag(eng: Engine): { arr: (InvSlot | null)[]; i: number; no: number } | null {
  const p = eng.player
  const sel = p.hotbar[p.selected]
  if (sel?.type === 'bagTag') return { arr: p.hotbar, i: p.selected, no: sel.tag ?? -1 }
  for (const arr of [p.hotbar, p.backpack]) for (let i = 0; i < arr.length; i++) { const sl = arr[i]; if (sl?.type === 'bagTag') return { arr, i, no: sl.tag ?? -1 } }
  return null
}
/** 要寄存的那件：快捷栏选中；空手则快捷栏第一件（不收行李牌 / 关键物品 / 情书 / 茶） */
const NO_DEPOSIT = new Set(['bagTag', 'gentletter', 'roomtea', 'coffee'])
function depositSlot(eng: Engine): { i: number; sl: InvSlot } | null {
  const p = eng.player
  const ok = (sl: InvSlot | null): sl is InvSlot => !!sl && !NO_DEPOSIT.has(sl.type) && !isKeyItem(sl.type)
  if (ok(p.hotbar[p.selected])) return { i: p.selected, sl: p.hotbar[p.selected]! }
  if (p.hotbar[p.selected]) return null // 手上拿着不收的东西：不替你另挑
  for (let i = 0; i < p.hotbar.length; i++) if (ok(p.hotbar[i])) return { i, sl: p.hotbar[i]! }
  return null
}
const hasAny = (eng: Engine, types: string[]) => { const p = eng.player; return [p.hotbar, p.backpack].some((a) => a.some((sl) => sl && types.includes(sl.type))) }
function takeOne(eng: Engine, type: string): boolean {
  const p = eng.player
  for (const arr of [p.hotbar, p.backpack]) for (let i = 0; i < arr.length; i++) { const sl = arr[i]; if (sl?.type === type) { if ((sl.count ?? 1) > 1) sl.count--; else arr[i] = null; return true } }
  return false
}

// ---------- X 情境 ----------
type Act = 'letter' | 'tea' | 'claim' | 'keys' | 'deposit' | 'room'
function serveTarget(eng: Engine): Entity | null {
  if (eng.levelDef.id !== 5) return null
  const e = findBellhop(eng); if (!e?.bh) return null
  const p = eng.player
  if (Math.hypot(p.x - e.x, p.y - e.y) > BH.serveR || Math.abs((e.z ?? 0) - p.z) > BH.zSame) return null
  return e
}
function roomNear(eng: Engine) { const r = bellhopRoom(eng); return r && Math.hypot(eng.player.x - r.x, eng.player.y - r.y) < BH.roomR ? r : null }
export function bellhopAct(eng: Engine): Act | null {
  const sv = bellhopSave(eng)
  if (serveTarget(eng)) {
    const s = findBellhop(eng)!.bh!
    if (s.mode === 'serve') return null // 正忙
    // 优先级：递信 > 递茶 > 手上拿着行李牌 = 取回 > 领回代管的钥匙 > 手上的东西 = 寄存 > 身上有牌 = 取回 > 空手 = 寄存快捷栏第一件
    const sel = eng.player.hotbar[eng.player.selected]
    if (hasAny(eng, ['gentletter']) && !sv.loved) return 'letter'
    if (hasAny(eng, ['roomtea', 'coffee'])) return 'tea'
    if (sel?.type === 'bagTag') return 'claim'
    if (sv.held.length) return 'keys'
    if (sel && depositSlot(eng)) return 'deposit'
    if (findTag(eng)) return 'claim'
    if (depositSlot(eng)) return 'deposit'
    return null
  }
  if (roomNear(eng) && (sv.room.length || !sv.letter)) return 'room'
  return null
}
export function bellhopSpecial(eng: Engine): SpecialAction | null {
  const a = bellhopAct(eng); if (!a) return null
  const sv = bellhopSave(eng)
  const free = sv.loved || sv.free > 0
  switch (a) {
    case 'letter': return { id: 'bellhop-letter', label: '递信', hint: '把「绅士的情书」交给行李员', hold: false }
    case 'tea': return { id: 'bellhop-tea', label: '递茶', hint: '请他喝一杯（下一次领回免代价）', hold: false }
    case 'claim': { const t = findTag(eng)!; return { id: 'bellhop-claim', label: '取回', hint: `出示行李牌${t.no >= 0 ? ` No.${t.no}` : ''}，取回寄存的东西`, hold: false } }
    case 'keys': return { id: 'bellhop-keys', label: sv.held.some((i) => i.type === 'detbadge') ? '领回代管的东西' : '领回钥匙', hint: `他替你收着 13 楼那边没收的${sv.held.some((i) => i.type === 'detbadge') ? '东西' : '钥匙'}（${sv.held.length} 件）${free ? '' : `；酒店关注度 +${BH.keyClaimAttn}`}`, hold: false } // [spokes] 看门人没收的迎宾女郎的证件也在他这儿
    case 'deposit': { const d = depositSlot(eng)!; return { id: 'bellhop-deposit', label: '寄存', hint: `把「${itemName(d.sl.type)}」交给行李员，换一张行李牌`, hold: false } }
    case 'room': return { id: 'bellhop-room', label: '翻找行李房', hint: `10F 行李寄存处（${sv.room.length + (sv.letter ? 0 : 1)} 件）`, hold: false }
  }
}
/** 按下 X（l5Hotel.updateHotel 之后调用；消费 specialPressed） */
export function bellhopPress(eng: Engine): boolean {
  if (!eng.specialPressed || eng.levelDef.id !== 5) return false
  const a = bellhopAct(eng); if (!a) return false
  eng.specialPressed = false
  const e = findBellhop(eng)
  switch (a) {
    case 'letter': bellhopLetter(eng, e!); break
    case 'tea': bellhopTea(eng, e!); break
    case 'claim': bellhopClaim(eng, e!); break
    case 'keys': bellhopClaimKeys(eng, e!); break
    case 'deposit': bellhopDeposit(eng, e!); break
    case 'room': bellhopTakeRoom(eng); break
  }
  return true
}
function serve(e: Entity, clips: BellhopClip[]) {
  const s = ensureBellhop(e)
  const [first, ...rest] = clips
  s.queue = rest
  setMode(s, first === 'ringFriendly' || first === 'ringAnnoyed' ? 'ring' : 'serve', first)
}
/** 寄存：关注度 ≥ 75 拒收（恼怒铃 + 转运 10F）；否则收下、给编号行李牌 */
export function bellhopDeposit(eng: Engine, e: Entity): boolean {
  const sv = bellhopSave(eng), p = eng.player
  if (eng.hotel.attn >= BH.refuseAt) { refuse(eng, e); return false }
  const d = depositSlot(eng); if (!d) return false
  if (sv.deposits.length >= BH.depositCap) { eng.msg('行李员看了看他推车上码得满满的行李，轻轻摇了摇头。', 'system'); return false }
  const no = sv.next++
  sv.deposits.push({ tag: no, item: toLost(d.sl) })
  p.hotbar[d.i] = null
  if (!addTag(eng, no)) { // 没地方放牌：东西还你
    sv.deposits.pop(); sv.next--; p.hotbar[d.i] = d.sl
    eng.msg('你身上连一张行李牌都塞不下了。', 'system'); return false
  }
  eng.syncPassives?.()
  sv.n.deposit++; rel(eng, BH.rel.deposit); meet(eng)
  serve(e, ['takeItem', 'tagHand'])
  bellhopRing(eng, e, 'friendly')
  eng.msg(`行李员双手接过「${itemName(d.sl.type)}」，递给你一张黄铜行李牌：No.${no}。`, 'lore')
  return true
}
/** 拒收：恼怒铃，并把已寄存的东西送到 10F 行李房 */
function refuse(eng: Engine, e: Entity) {
  const sv = bellhopSave(eng)
  sv.n.refuse++
  serve(e, ['ringAnnoyed'])
  bellhopRing(eng, e, 'annoyed', true)
  const moved = bellhopMoveToRoom(eng)
  eng.msg('行李员没有伸手。他看着你，像在看一张已经填好日期的退房单。', 'lore')
  if (moved) eng.msg(`你寄存的 ${moved} 件东西被他送去了 10F 行李房。要的话，自己去取。`, 'system')
}
/** 把寄存物全部转运到 10F 行李房；返回件数 */
export function bellhopMoveToRoom(eng: Engine): number {
  const sv = bellhopSave(eng)
  const n = sv.deposits.length
  for (const d of sv.deposits) sv.room.push(d.item)
  sv.deposits = []
  while (sv.room.length > BH.roomCap) sv.room.shift()
  if (n) sv.n.moved += n
  return n
}
/** 出示行李牌取回 */
export function bellhopClaim(eng: Engine, e: Entity): boolean {
  const sv = bellhopSave(eng), t = findTag(eng); if (!t) return false
  let k = sv.deposits.findIndex((d) => d.tag === t.no)
  if (k < 0 && t.no < 0 && sv.deposits.length) k = 0 // 没有编号的旧牌：给最早的一件
  if (k < 0) {
    t.arr[t.i] = null
    const inRoom = sv.room.length > 0
    serve(e, ['ringAnnoyed'])
    playBell(eng, e.x, e.y, 'annoyed')
    eng.msg(inRoom ? `行李员接过 No.${t.no} 的牌子，朝天花板指了指——东西在 10F 行李房。` : `行李员接过 No.${t.no} 的牌子看了很久，把它收进了口袋。这张牌上没有东西。`, 'lore')
    return false
  }
  const it = sv.deposits[k].item
  const tagSlot = t.arr[t.i]
  t.arr[t.i] = null // 先交牌，腾出一格
  const got = giveItem(eng, it)
  if (!got) { t.arr[t.i] = tagSlot; eng.msg('背包满了。行李员把牌子还给了你。', 'system'); return false }
  if (got < it.count) { it.count -= got; t.arr[t.i] = tagSlot; eng.msg(`背包只装得下 ${got} 件，剩下的他先替你收着（牌子还你）。`, 'system') }
  else sv.deposits.splice(k, 1)
  eng.syncPassives?.()
  sv.n.claim++; rel(eng, BH.rel.claim)
  serve(e, ['giveBack', 'bow'])
  bellhopRing(eng, e, 'friendly')
  eng.msg(`行李员收回 No.${t.no} 的牌子，双手把「${itemName(it.type)}」递还给你。`, 'lore')
  return true
}
/** 领回 13 楼被没收的钥匙：代价关注度 +5（茶 / 情书免） */
export function bellhopClaimKeys(eng: Engine, e: Entity): boolean {
  const sv = bellhopSave(eng)
  if (!sv.held.length) return false
  let n = 0
  while (sv.held.length) {
    const it = sv.held[0], got = giveItem(eng, it)
    if (!got) break
    n += got
    if (got < it.count) { it.count -= got; break }
    sv.held.shift()
  }
  if (!n) { eng.msg('背包满了。', 'system'); return false }
  eng.syncPassives?.()
  let cost = BH.keyClaimAttn
  if (sv.loved) cost = 0
  else if (sv.free > 0) { sv.free--; cost = 0 }
  if (cost) hotelAddAttn(eng, cost)
  sv.n.claim++; sv.n.keys += n
  serve(e, ['giveBack', 'bow'])
  bellhopRing(eng, e, 'friendly')
  eng.msg(cost ? `行李员把钥匙一把一把放进你手里（${n} 件）。远处有人记下了这件事。` : `行李员把钥匙一把一把放进你手里（${n} 件），什么也没收。`, 'lore')
  return true
}
/** 递茶：友好铃 + 饮茶；免下一次领取代价 */
export function bellhopTea(eng: Engine, e: Entity): boolean {
  const sv = bellhopSave(eng)
  const type = hasAny(eng, ['roomtea']) ? 'roomtea' : 'coffee'
  if (!takeOne(eng, type)) return false
  sv.free++; sv.n.tea++; rel(eng, BH.rel.tea); meet(eng)
  serve(e, ['ringFriendly', 'teaSip', 'bow'])
  playBell(eng, e.x, e.y, 'friendly'); sv.n.friendly++
  eng.msg(type === 'roomtea' ? '行李员托起茶碟，把杯子举到喙前，停了很久。铃声清脆地响了两下。' : '行李员把罐装咖啡倒进他自己的瓷杯里，托着碟子喝了一口。铃声清脆地响了两下。', 'lore')
  return true
}
/** 递信：情书 → 本局永久友好，图鉴（跨局）解锁一行 */
export function bellhopLetter(eng: Engine, e: Entity): boolean {
  const sv = bellhopSave(eng)
  if (!takeOne(eng, 'gentletter')) return false
  sv.loved = 1; rel(eng, BH.rel.letter); meet(eng)
  const b = bellhopBook(eng); b.bhLove = 1; saveBook(eng.hotelBook)
  serve(e, ['takeItem', 'bow', 'ringFriendly'])
  playBell(eng, e.x, e.y, 'friendly'); sv.n.friendly++
  eng.msg('行李员接过信，没有拆开。他把它贴着胸口放进制服内袋，面盘慢慢低下去，像是在闭眼。', 'lore')
  eng.msg('从今以后，他替你保管的东西，都不再收任何代价。', 'system')
  return true
}
/** 翻找 10F 行李房：先拿情书（还没拿过的话），再把东西一件件放回背包 */
export function bellhopTakeRoom(eng: Engine): number {
  const sv = bellhopSave(eng)
  let n = 0
  if (!sv.letter) {
    if (eng.addItem('gentletter')) { sv.letter = 1; n++; eng.msg('压在行李堆最底下的，是一封没贴邮票的信。信封上只写着：「致行李员」。', 'lore') }
    else { eng.msg('背包满了。', 'system'); return 0 }
  }
  while (sv.room.length) {
    const it = sv.room[0], got = giveItem(eng, it)
    if (!got) break
    n += got
    if (got < it.count) { it.count -= got; break }
    sv.room.shift()
  }
  eng.syncPassives?.()
  if (sv.room.length) eng.msg(`背包满了。行李房里还剩 ${sv.room.length} 件。`, 'system')
  else if (n) eng.msg('你把行李房里属于你的东西都翻了出来。每一件都系着一张写好名字的牌子。', 'lore')
  audio.uiTick()
  return n
}

// ---------- 拿走：13 楼没收的钥匙 / L5 死亡遗物 ----------
/** conciergeAI.conciergeLiftFinish：没收的钥匙类转交他保管 */
export function bellhopKeep(eng: Engine, items: HotelLostItem[]) {
  const sv = bellhopSave(eng)
  for (const it of items) sv.held.push(it)
  while (sv.held.length > BH.holdCap) sv.held.shift()
}
export const bellhopKeepSlot = (sl: InvSlot) => toLost(sl)
const legacyKey = (slot: string) => `br_bellhop_legacy_${slot}`
/** combat.die：在 L5 死亡 → 身上的东西（非关键物品）记到这个存档位的「遗物」里，下一局在 10F 行李房取回 */
export function bellhopOnDeath(eng: Engine) {
  if (eng.levelDef.id !== 5) return
  const p = eng.player, out: HotelLostItem[] = []
  for (const arr of [p.hotbar, p.backpack, p.equip.pockets]) for (const sl of arr) if (sl && !isKeyItem(sl.type) && sl.type !== 'bagTag') out.push(toLost(sl))
  const sv = bellhopSave(eng)
  for (const d of sv.deposits) out.push(d.item) // 寄存在他那里的，也一并送去
  if (!out.length) return
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(legacyKey(String(eng.saveSlot ?? 'auto')), JSON.stringify(out.slice(-BH.legacyCap))) } catch { /* 无存储环境 */ }
}
function takeLegacy(eng: Engine) {
  try {
    if (typeof localStorage === 'undefined') return
    const k = legacyKey(String(eng.saveSlot ?? 'auto')), raw = localStorage.getItem(k)
    if (!raw) return
    localStorage.removeItem(k)
    const items = arrItems(JSON.parse(raw), BH.legacyCap), sv = bellhopSave(eng)
    for (const it of items) sv.room.push(it)
    while (sv.room.length > BH.roomCap) sv.room.shift()
    if (items.length) eng.msg('10F 的行李寄存处里，码着一摞你认得的东西。牌子上的名字是你的，日期是「上一次」。', 'lore')
  } catch { /* 坏数据：丢掉 */ }
}

/** 渲染层用：行李房里有没有东西（决定行李堆显示多少） */
export function bellhopRoomCount(eng: Engine) { const sv = bellhopSave(eng); return sv.room.length + (sv.letter ? 0 : 1) }
/** 关照档（≥ 75）时把寄存物转运（不等你来寄存：关注度一过线就送走） */
export function bellhopTierCheck(eng: Engine) {
  const sv = bellhopSave(eng)
  if (sv.deposits.length && eng.hotel.attn >= BH.refuseAt && l5Tier(eng.hotel.attn) >= 3) {
    const n = bellhopMoveToRoom(eng)
    if (n) eng.msg(`远处响起一声沉闷的长铃。你寄存的 ${n} 件东西，大概已经在 10F 行李房了。`, 'lore')
  }
}
