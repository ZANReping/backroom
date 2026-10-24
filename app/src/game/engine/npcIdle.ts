// NPC 待机行为（活人气息）：站立时的小动作、坐长椅/靠墙、两人闲聊（只做动作）、对玩家的注视与回应。
// 纯本地状态（WeakMap，不进存档、不走联机协议）；渲染层通过 npcIdleView() 读取并驱动骨骼（renderer/npcIdlePose.ts）。
import type { Engine } from '../engine'
import type { NpcState } from '../content/npcs'
import type { Structure } from '../core/types'
import { floorHeight, walkableAt } from '../world/mapgen'
import { seatsFor, type SeatAnchor } from '../world/seating'
import { pickChatExchange, type ChatExchange } from '../content/npcChatLines'

export type IdleTemper = 'plain' | 'calm' | 'warm' | 'wary' | 'loud' | 'busy'
export type IdleAct =
  | 'look' | 'stretch' | 'neck' | 'watch' | 'scratch' | 'cross' | 'hips' | 'back' | 'yawn' | 'shuffle' | 'wipe' | 'dust'
  | 'clipboard' | 'book' | 'radio' | 'hardhat' | 'satchel' | 'headphones' | 'tools' | 'medic'
  | 'scan' | 'crouch' | 'count' | 'apron'
  | 'wave' | 'nod' | 'glare' | 'avert'
export type IdleMode = 'stand' | 'seat' | 'lean' | 'chat'

/** 渲染层可读视图（坐标为本地地图坐标） */
export interface NpcIdleView {
  mode: IdleMode
  /** 坐：approach 走向座位 / down 落座 / sit / up 起身；靠墙：approach / lean / off */
  phase: 'approach' | 'down' | 'sit' | 'up' | 'lean' | 'off' | ''
  act: IdleAct | ''; actT: number; actDur: number; actId: number
  seatH: number; seatRelaxed: boolean
  /** 注视点（本地坐标 + 绝对高度），lookK 0..1 由渲染层平滑 */
  look: { x: number; y: number; z: number } | null
  /** 远离注视点（avert） */
  avoid: boolean
  /** 闲聊中当前是否在说话（听者点头） */
  talking: boolean
  /** 靠墙时双臂姿势 */
  leanArms: 'cross' | 'back' | 'front'
  seed: number
  temper: IdleTemper
}

interface IdleState extends NpcIdleView {
  next: number            // 距下个小动作（秒）
  still: number           // 已静止时长
  moving: boolean
  seat?: SeatAnchor & { front: { x: number; y: number }; ground: number; key: string }
  lean?: { x: number; y: number; facing: number }
  modeT: number           // 当前模式剩余时长
  stuckT: number
  partner?: NpcState
  chatLead?: boolean
  lines?: ChatExchange; lineI: number
  talkT: number
  greetCd: number          // 打招呼冷却
  near: boolean            // 上帧玩家是否在近距
  stareT: number; stareCd: number
  glanceT: number
  lookT: number            // 注视剩余
  losT: number; losOk: boolean
  lastPX: number; lastPY: number
  pauseCd: number
  map?: unknown
  pois?: { x: number; y: number }[]
  seatCand?: { s: Structure; d: number }[]
  modeCd: number
  origin?: { map: object; x: number; y: number }
}

const states = new WeakMap<NpcState, IdleState>()
const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export function idleTemper(personality: string): IdleTemper {
  const p = personality || ''
  if (/沉默|寡言|冷淡|冷静|话少|内向|木讷|阴沉/.test(p)) return 'calm'
  if (/热心|健谈|见谁都|开朗|爱笑|热情|好客|乐呵/.test(p)) return 'warm'
  if (/谨|规矩|紧张|多疑|警惕|胆小|小心|戒备/.test(p)) return 'wary'
  if (/大大咧咧|豪爽|粗|嗓门|笑声|莽/.test(p)) return 'loud'
  if (/停不下|勤|忙|手上|闲不住|眼里有活/.test(p)) return 'busy'
  return 'plain'
}

const TEMPER: Record<IdleTemper, { gap: [number, number]; chat: number; sit: number; lean: number }> = {
  plain: { gap: [3, 7], chat: .35, sit: .3, lean: .25 },
  calm: { gap: [6, 12], chat: .15, sit: .35, lean: .35 },
  warm: { gap: [3, 6], chat: .6, sit: .25, lean: .15 },
  wary: { gap: [2.5, 5], chat: .2, sit: .15, lean: .35 },
  loud: { gap: [2.5, 5], chat: .55, sit: .3, lean: .2 },
  busy: { gap: [2, 4.5], chat: .25, sit: .1, lean: .1 },
}

export const IDLE_ACT_DUR: Record<IdleAct, [number, number]> = {
  look: [3, 5], stretch: [3.2, 4.2], neck: [2.5, 3.5], watch: [2, 3], scratch: [1.6, 2.4], cross: [5, 10], hips: [4, 8],
  back: [5, 10], yawn: [2.6, 3.2], shuffle: [1.6, 2.2], wipe: [1.6, 2.2], dust: [2.2, 3],
  clipboard: [4, 7], book: [5, 9], radio: [2.5, 4], hardhat: [1.5, 2], satchel: [1.8, 2.6], headphones: [2, 3],
  tools: [3, 5], medic: [3, 5], scan: [4, 7], crouch: [3.5, 5], count: [3, 4.5], apron: [2.5, 3.5],
  wave: [1.6, 2], nod: [1, 1.3], glare: [3, 4], avert: [2.5, 3.5],
}

function pool(n: NpcState, st: IdleState): [IdleAct, number][] {
  const t = st.temper, g = n.def.communityGear, role = n.def.role || ''
  const a: [IdleAct, number][] = [
    ['look', t === 'wary' ? 4 : 2], ['stretch', t === 'loud' ? 1.6 : t === 'calm' ? .4 : .8], ['neck', 1], ['watch', t === 'busy' ? 1.6 : .8],
    ['scratch', .8], ['cross', t === 'calm' || t === 'wary' ? 2.2 : 1.2], ['hips', t === 'loud' ? 2 : .9], ['back', t === 'calm' ? 1.6 : .8],
    ['yawn', t === 'busy' ? .3 : .7], ['shuffle', 1.2], ['wipe', .5], ['dust', .6],
  ]
  const gear: Partial<Record<NonNullable<typeof g>, IdleAct>> = { clipboard: 'clipboard', book: 'book', radio: 'radio', hardhat: 'hardhat', satchel: 'satchel', headphones: 'headphones', tools: 'tools', medic: 'medic', apron: 'apron' }
  if (g && gear[g]) a.push([gear[g]!, t === 'busy' ? 5 : 3])
  if (/哨兵|巡逻|守卫|警卫|保安|卫兵|安保/.test(role)) a.push(['scan', 4])
  if (/园丁|农|种植|苗/.test(role)) a.push(['crouch', 3])
  if (/仓库|管理员|库管|物资|军需|会计|登记/.test(role)) a.push(['count', 2.5])
  if (/厨|炊|伙食/.test(role)) a.push(['apron', 3])
  if (/医|护士|药/.test(role)) a.push(['medic', 2.5])
  if (/学徒|维修|技工|工程|电工/.test(role)) a.push(['tools', 2.5])
  return a
}
const SEATED_ACTS: IdleAct[] = ['look', 'neck', 'watch', 'yawn', 'scratch', 'cross', 'book', 'clipboard']

function pick(list: [IdleAct, number][]): IdleAct {
  let s = 0; for (const [, w] of list) s += w
  let r = Math.random() * s
  for (const [k, w] of list) { r -= w; if (r <= 0) return k }
  return list[0][0]
}

function state(n: NpcState): IdleState {
  let st = states.get(n)
  if (!st) {
    const seed = hashStr(n.id)
    st = {
      mode: 'stand', phase: '', act: '', actT: 0, actDur: 0, actId: 0, seatH: .46, seatRelaxed: false, look: null, avoid: false, talking: false,
      leanArms: (['cross', 'back', 'front'] as const)[seed % 3], seed, temper: idleTemper(n.def.personality),
      next: 1.5 + (seed % 7) * .5, still: 0, moving: false, modeT: 0, stuckT: 0, talkT: 0, greetCd: 0, near: false,
      stareT: 0, stareCd: 0, lineI: 0, glanceT: 0, lookT: 0, losT: 0, losOk: false, lastPX: NaN, lastPY: NaN, pauseCd: 4, modeCd: 6 + (seed % 9),
    }
    states.set(n, st)
  }
  return st
}

export function npcIdleView(n: NpcState): NpcIdleView | undefined { return states.get(n) }
/** 玩家不能坐到 NPC 正坐着/正要坐的位置 */
export function npcSeatTaken(eng: Engine, x: number, y: number): boolean {
  for (const n of eng.npcs) { const st = states.get(n); if (st?.mode === 'seat' && st.seat && Math.hypot(st.seat.x - x, st.seat.y - y) < .5) return true }
  return false
}

function startAct(st: IdleState, act: IdleAct, dur?: number) {
  const [a, b] = IDLE_ACT_DUR[act]
  st.act = act; st.actT = 0; st.actDur = dur ?? rnd(a, b); st.actId++
}
function endMode(n: NpcState, st: IdleState) {
  if (st.partner) { st.partner.bubbleT = Math.min(st.partner.bubbleT, .6); n.bubbleT = Math.min(n.bubbleT, .6); const ps = states.get(st.partner); if (ps && ps.partner === n) { ps.partner = undefined; ps.mode = 'stand'; ps.talking = false; ps.modeCd = rnd(20, 40); st.partner.moveT = Math.min(st.partner.moveT, rnd(.5, 2)) } }
  st.partner = undefined; st.mode = 'stand'; st.phase = ''; st.talking = false; st.seat = undefined; st.lean = undefined
  st.modeCd = rnd(18, 40); n.moveT = rnd(.4, 1.6); n.tx = n.x; n.ty = n.y
}

const toward = (n: NpcState, x: number, y: number, sp: number, dt: number, walkOk: (x: number, y: number) => boolean): 'arrived' | 'moving' | 'blocked' => {
  const dx = x - n.x, dy = y - n.y, d = Math.hypot(dx, dy)
  n.tx = x; n.ty = y
  if (d < .08) return 'arrived'
  const s = Math.min(d, sp * dt), nx = n.x + dx / d * s, ny = n.y + dy / d * s
  n.facing = Math.atan2(dy, dx)
  if (!walkOk(nx, ny)) return 'blocked'
  n.x = nx; n.y = ny; return 'moving'
}

function seatCandidates(eng: Engine, n: NpcState, st: IdleState) {
  const m = eng.map!
  if (st.map !== m || !st.seatCand) {
    const R = Math.max(4, (n.def.wanderRadius ?? 3) + 3)
    st.seatCand = []; st.pois = [{ x: n.homeX, y: n.homeY }]
    for (const s of m.structures) {
      const d = Math.hypot(s.x - n.homeX, s.y - n.homeY)
      if (d > R + 3) continue
      if (d <= R) st.seatCand.push({ s, d })
      if (st.pois.length < 14 && d > 1.2) st.pois.push({ x: s.x, y: s.y })
    }
    st.map = m
  }
  return st.seatCand
}

function trySeat(eng: Engine, n: NpcState, st: IdleState, walkOk: (x: number, y: number) => boolean): boolean {
  const m = eng.map!, floor = n.floor ?? 0, ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const pa = eng.seating?.anchor
  const opts: (SeatAnchor & { front: { x: number; y: number }; ground: number; key: string })[] = []
  for (const { s } of seatCandidates(eng, n, st)) {
    let anchors: SeatAnchor[]
    try { anchors = seatsFor(s, m, eng.levelDef.id) } catch { continue }
    for (const a of anchors) {
      if (a.floor !== floor) continue
      const ground = floorHeight(m, a.x, a.y, floor), h = a.z - ground
      if (!(h >= .3 && h <= .7)) continue
      if (pa && Math.hypot(pa.x - ox - a.x, pa.y - oy - a.y) < .5) continue
      if (npcSeatTaken(eng, a.x, a.y)) continue
      if (Math.hypot(eng.player.x - a.x, eng.player.y - a.y) < .7) continue
      const front = { x: a.x + Math.sin(a.yaw) * .5, y: a.y + Math.cos(a.yaw) * .5 }
      if (!walkOk(front.x, front.y)) continue
      opts.push({ ...a, front, ground, key: `${s.x},${s.y},${a.index}` })
    }
  }
  if (!opts.length) return false
  opts.sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y))
  const a = opts[Math.floor(Math.random() * Math.min(3, opts.length))]
  st.seat = a; st.mode = 'seat'; st.phase = 'approach'; st.modeT = rnd(16, 45); st.stuckT = 0
  st.seatH = a.z - a.ground; st.seatRelaxed = a.relaxed; st.act = ''
  return true
}

function tryLean(eng: Engine, n: NpcState, st: IdleState, walkOk: (x: number, y: number) => boolean): boolean {
  const m = eng.map!, floor = n.floor ?? 0, R = Math.max(2, Math.min(5, (n.def.wanderRadius ?? 3) + 1))
  const hx = Math.floor(n.homeX), hy = Math.floor(n.homeY), spots: { x: number; y: number; facing: number }[] = []
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  for (let ty = hy - R; ty <= hy + R; ty++) for (let tx = hx - R; tx <= hx + R; tx++) {
    if (!walkableAt(m, tx, ty, floor)) continue
    for (const [dx, dy] of dirs) {
      if (walkableAt(m, tx + dx, ty + dy, floor) || !walkableAt(m, tx - dx, ty - dy, floor)) continue
      // 墙面要够宽（左右邻格也是墙），避免靠在门框/柱角
      const px = -dy, py = dx
      if (walkableAt(m, tx + dx + px, ty + dy + py, floor) || walkableAt(m, tx + dx - px, ty + dy - py, floor)) continue
      const x = tx + .5 + dx * .28, y = ty + .5 + dy * .28
      if (!walkOk(x, y) || !walkOk(x - dx * .5, y - dy * .5)) continue
      if (eng.npcs.some(o => o !== n && Math.hypot(o.x - x, o.y - y) < .9)) continue
      spots.push({ x, y, facing: Math.atan2(-dy, -dx) })
    }
  }
  if (!spots.length) return false
  spots.sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y))
  st.lean = spots[Math.floor(Math.random() * Math.min(4, spots.length))]
  st.mode = 'lean'; st.phase = 'approach'; st.modeT = rnd(12, 30); st.stuckT = 0; st.act = ''
  return true
}

function tryChat(eng: Engine, n: NpcState, st: IdleState): boolean {
  let best: NpcState | undefined, bd = 3.4
  for (const o of eng.npcs) {
    if (o === n || o.dead || o.hostile || o.def.faction === 'brc' || (o.floor ?? 0) !== (n.floor ?? 0)) continue
    const os = states.get(o)
    if (!os || os.mode !== 'stand' || os.moving || os.still < 1 || os.modeCd > 0 || os.act) continue
    const d = Math.hypot(o.x - n.x, o.y - n.y)
    if (d < bd && d > .7 && eng.los(n.x, n.y, o.x, o.y)) { bd = d; best = o }
  }
  if (!best) return false
  const os = states.get(best)!, dur = rnd(10, 22)
  st.mode = os.mode = 'chat'; st.partner = best; os.partner = n; st.chatLead = true; os.chatLead = false
  st.lines = pickChatExchange(n.def.faction, best.def.faction); st.lineI = 0
  st.modeT = os.modeT = Math.max(dur, st.lines.reduce((t, l) => t + 1.6 + l.length * .14, 0) + 3)
  st.talkT = os.talkT = rnd(.6, 1.2); st.talking = false; os.talking = false
  st.act = os.act = ''; st.phase = os.phase = ''
  return true
}

/** Cached seats and look targets use window coordinates; rebase with the live NPC. */
function syncIdleWorld(eng: Engine, n: NpcState) {
  const st = state(n), m = eng.map!, ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0, old = st.origin
  if (old?.map === m) {
    const dx = ox - old.x, dy = oy - old.y
    if (dx || dy) {
      if (st.seat) { st.seat.x -= dx; st.seat.y -= dy; st.seat.front.x -= dx; st.seat.front.y -= dy }
      if (st.lean) { st.lean.x -= dx; st.lean.y -= dy }
      if (st.look) { st.look.x -= dx; st.look.y -= dy }
      for (const p of st.pois ?? []) { p.x -= dx; p.y -= dy }
      st.lastPX -= dx; st.lastPY -= dy
    }
  } else if (old) { endMode(n, st); st.map = undefined; st.seatCand = undefined; st.pois = undefined }
  st.origin = { map: m, x: ox, y: oy }
  return st
}
/** 默认游荡者在 moveT 决策点调用：返回 true 表示本次决策被待机行为接管（不选新游荡目标） */
export function npcIdleDecide(eng: Engine, n: NpcState, walkOk: (x: number, y: number) => boolean): boolean {
  const st = syncIdleWorld(eng, n)
  if (st.mode !== 'stand') return true
  if (st.act) { n.moveT = .4 + (st.actDur - st.actT); return true }
  if (st.modeCd > 0 || Math.random() > .55) return false
  // 定点 NPC（站柜台/固定朝向/不游荡）不离岗：只做原地小动作，可作为闲聊的被动一方
  if (n.homeFacing !== undefined || (n.def.wanderRadius ?? 3) < 1) return false
  const T = TEMPER[st.temper], r = Math.random() * (T.chat + T.sit + T.lean + .6)
  if (r < T.chat) { if (tryChat(eng, n, st)) return true }
  else if (r < T.chat + T.sit) { if (trySeat(eng, n, st, walkOk)) return true }
  else if (r < T.chat + T.sit + T.lean) { if (tryLean(eng, n, st, walkOk)) return true }
  st.modeCd = rnd(6, 14)
  return false
}

/** 坐/靠墙/闲聊模式的移动与计时；返回 true 时本帧跳过默认游荡逻辑 */
export function npcIdleControl(eng: Engine, n: NpcState, dt: number, walkOk: (x: number, y: number) => boolean): boolean {
  const st = syncIdleWorld(eng, n)
  st.modeCd = Math.max(0, st.modeCd - dt)
  if (st.mode === 'stand') return false
  st.modeT -= dt
  const p = eng.player, pd = Math.hypot(p.x - n.x, p.y - n.y)
  if (st.mode === 'seat' && st.seat) {
    const a = st.seat
    if (st.phase === 'approach') {
      const r = toward(n, a.front.x, a.front.y, .8, dt, walkOk)
      if (r === 'blocked') st.stuckT += dt
      if (st.stuckT > 1.5 || st.modeT < 0 || Math.hypot(p.x - a.x, p.y - a.y) < .6) { endMode(n, st); return false }
      if (r === 'arrived') { st.phase = 'down'; st.modeT = Math.max(st.modeT, 10) }
      return true
    }
    const faceYaw = Math.atan2(Math.cos(a.yaw), Math.sin(a.yaw))
    n.facing = faceYaw
    if (st.phase === 'down') {
      const dx = a.x - n.x, dy = a.y - n.y, d = Math.hypot(dx, dy), s = Math.min(d, .85 * dt)
      if (d > .01) { n.x += dx / d * s; n.y += dy / d * s }
      n.tx = n.x; n.ty = n.y
      if (d < .02) { st.phase = 'sit'; st.next = rnd(2, 5) }
      return true
    }
    if (st.phase === 'sit') {
      n.x = a.x; n.y = a.y; n.tx = n.x; n.ty = n.y
      if (st.modeT <= 0 && !st.act) st.phase = 'up'
      return true // 接管移动；小动作与注视照常（npc.ts 随后调用 npcIdleTick）
    }
    if (st.phase === 'up') {
      const dx = a.front.x - n.x, dy = a.front.y - n.y, d = Math.hypot(dx, dy), s = Math.min(d, .85 * dt)
      if (d > .01) { n.x += dx / d * s; n.y += dy / d * s }
      n.tx = n.x; n.ty = n.y
      if (d < .02) endMode(n, st)
      return true
    }
  }
  if (st.mode === 'lean' && st.lean) {
    const l = st.lean
    if (st.phase === 'approach') {
      const r = toward(n, l.x, l.y, .75, dt, walkOk)
      if (r === 'blocked') st.stuckT += dt
      if (st.stuckT > 1.5 || st.modeT < 0) { endMode(n, st); return false }
      if (r === 'arrived') { st.phase = 'lean'; st.next = rnd(3, 6) }
      return true
    }
    if (st.phase === 'lean') {
      n.facing = l.facing; n.tx = n.x; n.ty = n.y
      if (st.modeT <= 0 && !st.act) { st.phase = 'off'; st.modeT = .7 }
      return true
    }
    if (st.phase === 'off') { n.tx = n.x; n.ty = n.y; if (st.modeT <= 0) endMode(n, st); return true }
  }
  if (st.mode === 'chat') {
    const q = st.partner, qs = q ? states.get(q) : undefined
    if (!q || !qs || qs.partner !== n || q.dead || q.hostile) { endMode(n, st); return false }
    const dx = q.x - n.x, dy = q.y - n.y, d = Math.hypot(dx, dy)
    if (st.chatLead && d > 1.55) { const r = toward(n, q.x, q.y, .7, dt, walkOk); if (r === 'blocked') st.stuckT += dt; if (st.stuckT > 1.5) { endMode(n, st); return false } return true }
    n.tx = n.x; n.ty = n.y; if (n.homeFacing === undefined) n.facing = Math.atan2(dy, dx)
    if (st.chatLead) {
      st.talkT -= dt
      if (st.talkT <= 0) {
        // 一问一答：A(发起者) 说第 0/2 句，B 说第 1/3 句；说完后只剩手势，偶尔各自沉默
        const L = st.lines ?? [], i = st.lineI++
        if (i < L.length) {
          const spk = i % 2 === 0 ? n : q
          st.talking = spk === n; qs.talking = !st.talking
          spk.bubbleText = L[i]; spk.bubbleT = 1.6 + L[i].length * .14; st.talkT = spk.bubbleT + rnd(.2, .6)
        } else { st.talking = !st.talking && Math.random() < .6; qs.talking = !st.talking && Math.random() < .6; st.talkT = rnd(1.8, 3.5) }
      }
      if (st.modeT <= 0 || pd < 1.1) { endMode(n, st); return false }
    }
    return true
  }
  return false
}

/** 每帧（默认游荡者，移动之后）：小动作计时、驻足朝向、玩家注视与回应 */
export function npcIdleTick(eng: Engine, n: NpcState, dt: number, walkOk: (x: number, y: number) => boolean) {
  const st = syncIdleWorld(eng, n), p = eng.player
  const moving = Math.hypot(n.tx - n.x, n.ty - n.y) > .15 && !(st.mode === 'seat' && st.phase === 'sit')
  if (st.moving && !moving && st.mode === 'stand' && Math.random() < .45) {
    // 驻足：面向附近「有东西可看」的方向（家具/岗位），不是随机朝向
    seatCandidates(eng, n, st)
    const pois = (st.pois ?? []).filter(q => Math.hypot(q.x - n.x, q.y - n.y) > .8)
    if (pois.length) { const q = pois[Math.floor(Math.random() * pois.length)]; n.facing = Math.atan2(q.y - n.y, q.x - n.x) }
  }
  st.moving = moving
  st.still = moving ? 0 : st.still + dt
  st.pauseCd = Math.max(0, st.pauseCd - dt)
  if (moving && st.mode === 'stand' && st.pauseCd <= 0 && Math.random() < dt * .05) {
    // 走着走着停下来回头看一眼
    n.tx = n.x; n.ty = n.y; n.moveT = rnd(2.5, 4.5); st.pauseCd = rnd(12, 25); startAct(st, 'look', rnd(2, 3))
  }
  if (st.act) {
    st.actT += dt
    if (st.actT >= st.actDur || (moving && st.act !== 'look')) st.act = ''
  }

  // ---- 玩家感知 ----
  const dx = p.x - n.x, dy = p.y - n.y, d = Math.hypot(dx, dy)
  const sameFloor = (p.floor ?? 0) === (n.floor ?? 0)
  const pv = Number.isFinite(st.lastPX) && dt > 0 ? Math.hypot(p.x - st.lastPX, p.y - st.lastPY) / dt : 0
  st.lastPX = p.x; st.lastPY = p.y
  st.losT -= dt
  if (st.losT <= 0) { st.losT = .3 + Math.random() * .1; st.losOk = sameFloor && d < 8 && eng.los(n.x, n.y, p.x, p.y) }
  const sees = st.losOk && d < 8
  st.greetCd = Math.max(0, st.greetCd - dt); st.stareCd = Math.max(0, st.stareCd - dt)
  st.glanceT = Math.max(0, st.glanceT - dt); st.lookT = Math.max(0, st.lookT - dt)
  if (sees && pv > 3.6 && pv < 30 && d < 7) st.glanceT = 1.6
  const close = sees && d < (st.mode === 'chat' ? 2.2 : 4.5)
  const free = !moving && (st.mode === 'stand' || st.mode === 'lean' || (st.mode === 'seat' && st.phase === 'sit') || st.mode === 'chat')
  if (close || st.glanceT > 0) st.lookT = Math.max(st.lookT, .6)
  st.avoid = st.act === 'avert'
  st.look = (st.lookT > 0 && free) || st.act === 'glare' || st.act === 'wave' ? { x: p.x, y: p.y, z: p.z + (p.crouching ? 1.05 : 1.58) } : null
  if (!st.look && st.mode === 'chat' && st.partner) st.look = { x: st.partner.x, y: st.partner.y, z: floorHeight(eng.map!, st.partner.x, st.partner.y, st.partner.floor ?? 0) + 1.55 }

  // 打招呼
  const nowNear = sees && d < 3.2
  if (nowNear && !st.near && st.greetCd <= 0 && free && !st.act) {
    const t = st.temper
    const wave = t === 'warm' ? .65 : t === 'loud' ? .5 : t === 'calm' || t === 'wary' ? .05 : .25
    const r = Math.random()
    if (r < wave) startAct(st, 'wave'); else if (r < wave + (t === 'wary' ? .3 : .55)) startAct(st, 'nod'); else if (t === 'wary') startAct(st, 'cross', rnd(4, 6))
    st.greetCd = rnd(60, 120)
  }
  st.near = nowNear
  // 被盯着看
  const view = Math.cos(p.facing) * dx / (d || 1) + Math.sin(p.facing) * dy / (d || 1) // 玩家 → NPC 的反向点积（玩家面向 NPC 时 ≈ -1）
  if (sees && d < 4.5 && view < -.985 && free) st.stareT += dt; else st.stareT = Math.max(0, st.stareT - dt * 2)
  if (st.stareT > 4 && st.stareCd <= 0 && !st.act) {
    const t = st.temper
    startAct(st, t === 'loud' ? 'glare' : t === 'warm' ? (Math.random() < .5 ? 'wave' : 'nod') : t === 'busy' ? 'scratch' : 'avert')
    st.stareT = 0; st.stareCd = rnd(20, 35)
  }
  // 站立时玩家走到身侧/背后：转身面对
  if (st.mode === 'stand' && n.homeFacing === undefined && (n.def.wanderRadius ?? 3) >= 1 && !moving && close && d < 3.5) {
    const rel = wrap(Math.atan2(dy, dx) - n.facing)
    if (Math.abs(rel) > 1.2 && st.act !== 'avert') n.facing = Math.atan2(dy, dx) - Math.sign(rel) * .35
  }

  // ---- 小动作 ----
  if (!st.act && !moving && st.still > 1.5) {
    st.next -= dt
    const ok = st.mode === 'stand' || (st.mode === 'seat' && st.phase === 'sit') || (st.mode === 'lean' && st.phase === 'lean')
    if (st.next <= 0 && ok) {
      const T = TEMPER[st.temper]
      let list = pool(n, st)
      if (st.mode === 'seat') list = list.filter(([k]) => SEATED_ACTS.includes(k))
      if (st.mode === 'lean') list = list.filter(([k]) => ['look', 'neck', 'watch', 'yawn', 'scratch', 'radio', 'book', 'clipboard', 'headphones'].includes(k))
      if (list.length) startAct(st, pick(list))
      st.next = rnd(T.gap[0], T.gap[1])
    }
  }
  void walkOk
}

/** 测试/调试：强制某 NPC 进入指定动作 */
export function npcIdleForce(n: NpcState, act: IdleAct | '', mode?: IdleMode) {
  const st = state(n)
  if (mode) st.mode = mode
  if (act) startAct(st, act, 1e6); else st.act = ''
  return st
}
export function npcIdleForceLean(n: NpcState, phase: 'lean' | '' = 'lean') { const st = state(n); st.mode = phase ? 'lean' : 'stand'; st.phase = phase; return st }
export function npcIdleForceSeat(n: NpcState, h = .46, relaxed = false) { const st = state(n); st.mode = 'seat'; st.phase = 'sit'; st.seatH = h; st.seatRelaxed = relaxed; return st }
