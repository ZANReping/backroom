// [l5items] L5 第三期物品：O18 留声机客房陷阱 / 房卡（118 大堂登记）/ O666 命运之骰
// 纯逻辑（o18Step / o666Roll / cardOpens …）可被无头 check 直接调用；engine 接线在文件末尾（stepL5Objects / l5ObjectsUse）。
import type { Engine } from '../engine'
import { h32 } from '../world/infinite'
import { audio } from '../core/audio'
import { tileAt } from '../world/mapgen'
import { simulateDieThrow, dieWallPlanes, RESULT_FACE, THROW_DUR, THROW_REL, REVEAL_SPIN, dieHandPoint, dieResolveDelay, lookYawOfFacing, type DiePlane, type V } from './fateDieSim'
import { look } from '../renderer/shared'

// ---------------- 数值表 ----------------
export const O18T = {
  roomFrac: 0.03, // 约 3% 客房生成崭新留声机
  lockAfter: 4, // 进门 4 s 后门「像被锁上但没有锁」
  sanityDrain: 0.4, // 理智 −0.4/s
  needMul: 2, // 饥饿 / 口渴 ×2
  liftHold: 3, // 长按 X 3 s 抬唱针
  liftSanity: 1, // 抬针期间理智额外 −1/s（中断重来）
  smashHits: 4, // 近战 4 下砸烂
  smashAttn: 15,
  bangRescue: [60, 120] as const, // 砸门后 60–120 s 员工来开门
  rescueAttn: 25,
  corpseSanity: 20, // 理智 <20 被当尸体「清理」→ 13 楼
  echoEvery: 7, // 复读心声间隔
} as const
export const O18_ECHO = ['我好像已经写过这些了。', '我好像已经写过这些了。我好像已经', '这段旋律我听过。我在哪里听过？', '再听一遍就好。再听一遍。', '门没有锁。门没有锁。门没有锁。'] as const

export const O666T = {
  cooldown: 600, // 每颗冷却 10 min
  bigWin: 100, // 赌场单局赢 ≥100 筹码送一颗
  price: 150, // Louie 稀有池
  rareAttn: 20,
  hallucinate: 300, // 理智回满后 300 s 幻听
  spin: 300, // 封闭房间：转 5 min 不停 → 高动能武器
  freeze: 10, // 乌贼 / 旅馆 / 赌徒面：原地不动 10 s
  freezeMove: 0.25, // 移动超过 0.25 m 算动了
  edgeR: 2.2, // 立在棱上：靠近触发随机事件
  weapon: 'shotgun', // 游戏内已有强力枪械
  rarePool: ['silencejuice', 'mysteryegg', 'warpberry', 'almondwater'] as const,
} as const
export type O666Face = 'rare' | 'sanity' | 'teleport' | 'weapon' | 'squid' | 'hotel' | 'gambler' | 'blank' | 'edge'
export const O666_FACE_NAME: Record<O666Face, string> = { rare: '宝箱', sanity: '心', teleport: '门', weapon: '枪', squid: '乌贼', hotel: '旅馆', gambler: '赌徒', blank: '空白', edge: '立在棱上' }
/** 结果表权重（weapon 只在封闭房间投出时出现，表面全是好事，实际都有代价） */
const FACE_W: [O666Face, number][] = [['rare', 18], ['sanity', 18], ['teleport', 12], ['weapon', 10], ['squid', 8], ['hotel', 8], ['gambler', 8], ['blank', 8], ['edge', 6]]
export function o666Roll(r: number, enclosed: boolean): O666Face {
  const pool = FACE_W.filter(([f]) => enclosed || f !== 'weapon')
  const tot = pool.reduce((a, [, w]) => a + w, 0)
  let x = Math.min(0.999999, Math.max(0, r)) * tot
  for (const [f, w] of pool) { if ((x -= w) < 0) return f }
  return pool[pool.length - 1][0]
}

// ---------------- 存档 ----------------
export interface O18Run { key: string; t: number; lift: number; hits: number; bang: number; rescueAt: number; echo: number; done?: 'lift' | 'smash' | 'rescue' | 'clean' }
export interface RoomCard { no: number; floor: number; dx?: number; dy?: number } // dx/dy：绑定的房门（第一次刷卡的那扇）
/** [收尾] fx/fy/ex/ey 为世界坐标（窗口坐标 + inf.ox/oy），w=1 标记；无限层原点平移不影响 */
export interface DieRun { face: O666Face | null; rollT: number; spin: number; spinRoom: string; freeze: number; fx: number; fy: number; ex?: number; ey?: number; w?: 1; er?: number }
/** [收尾] 结果已定、尚未生效（骰子还在飞 / 滚 / 图案浮现中）：at = eng.time 生效时刻；ex/ey = 棱上平衡点（世界坐标） */
export interface DiePend { face: O666Face; at: number; room: string | null; ex: number; ey: number }
/** [收尾] 留声机模型状态存档（键 = 楼层:留声机世界瓦片坐标） */
export interface PhonoSave { arm: number; broke: 0 | 1; dent: number; on: 0 | 1 }
export interface L5ObjSave {
  v: 1
  smashed: string[] // 已砸烂 / 停下的 O18 房（本局不再触发）
  o18?: O18Run
  card?: RoomCard // 你登记的房间（房卡物品丢了可补办）
  locker: { type: string; count: number }[] // 床边 8 格储物柜（跨局不保留：随局存档，新局清空）
  dieCd: number // 命运之骰冷却到（eng.time）
  die?: DieRun
  hallu: number // 幻听剩余秒
  receipt: number // 购买凭证张数（损坏回赌场免费换）
  bigWinGiven?: 1
  /** [l5items v2] 渲染用瞬态（不进存档）：最近一次投骰的 3D 动画参数；最近一次 O18 结束方式 */
  pend?: DiePend
  phono?: Record<string, PhonoSave>
  /** x/y = 玩家世界坐标（窗口 + ox/oy）；from = 松手时手中骰子位置（相对 x/y，场景坐标）；rel = 按 X 到松手；walls = 投出时附近墙面（相对 x/y） */
  anim?: { t0: number; seed: number; face: O666Face; x: number; y: number; yaw: number; from: V; rel: number; walls: DiePlane[]; settle: number }
  o18Last?: { key: string; done: NonNullable<O18Run['done']> }
}
export const LOCKER_SLOTS = 8
/** [l5items v2] O18 交互 → 留声机模型状态（arm 唱臂抬起 0..1、broke 砸烂、dent 受击次数）；run = 本房进行中的 O18，last = 本房最近结束方式，prev = 结构上现有 data */
export function phonoSyncData(run: O18Run | null, last: O18Run['done'] | null, prev: { arm?: unknown; broke?: unknown; dent?: unknown } = {}) {
  const arm = run ? Math.min(1, run.lift / O18T.liftHold) : last === 'lift' ? 1 : (Number(prev.arm) || 0)
  const broke = last === 'smash' ? 1 : (prev.broke ? 1 : 0)
  const dent = run ? run.hits : last === 'smash' ? O18T.smashHits : (Number(prev.dent) || 0)
  return { arm, broke, dent }
}
export function freshObj(): L5ObjSave { return { v: 1, smashed: [], locker: [], dieCd: 0, hallu: 0, receipt: 0 } }
export function restoreObj(raw: unknown): L5ObjSave {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<L5ObjSave>
  const o = freshObj()
  o.smashed = Array.isArray(r.smashed) ? r.smashed.filter((v) => typeof v === 'string').slice(-64) : []
  if (r.card && Number.isFinite(r.card.no)) o.card = { no: r.card.no | 0, floor: r.card.floor | 0, ...(Number.isFinite(r.card.dx) ? { dx: Number(r.card.dx), dy: Number(r.card.dy) } : {}) }
  o.locker = Array.isArray(r.locker) ? r.locker.filter((s) => s && typeof s.type === 'string').slice(0, LOCKER_SLOTS).map((s) => ({ type: s.type, count: Math.max(1, s.count | 0) })) : []
  o.dieCd = Number(r.dieCd) || 0; o.hallu = Number(r.hallu) || 0; o.receipt = Math.max(0, Number(r.receipt) | 0)
  if (r.o18 && typeof r.o18.key === 'string') o.o18 = { ...r.o18 }
  if (r.die && r.die.w === 1) o.die = { ...r.die } // 旧档里的窗口坐标读档后已失效：丢弃
  if (r.pend && typeof r.pend.face === 'string' && Number.isFinite(r.pend.at)) o.pend = { ...r.pend }
  if (r.phono && typeof r.phono === 'object') { o.phono = {}; for (const [k, v] of Object.entries(r.phono).slice(-64)) if (v && typeof v === 'object') o.phono[k] = { arm: Math.max(0, Math.min(1, Number(v.arm) || 0)), broke: v.broke ? 1 : 0, dent: Math.max(0, Math.min(O18T.smashHits, Number(v.dent) | 0)), on: v.on === 0 ? 0 : 1 } }
  if (r.bigWinGiven) o.bigWinGiven = 1
  return o
}

// ---------------- O18 纯逻辑 ----------------
/** [收尾] 留声机存档键：楼层 + 世界瓦片坐标 */
export function phonoKey(floor: number, wx: number, wy: number) { return `${floor}:${Math.round(wx)},${Math.round(wy)}` }
export function o18RoomKey(floor: number, x0: number, y0: number) { return `${floor}:${x0},${y0}` }
export function isO18Room(seed: number, floor: number, x0: number, y0: number) { return ((h32(seed, 0x518, floor * 977 + x0, y0) >>> 0) % 10000) / 10000 < O18T.roomFrac }
export interface O18In { holdX: boolean; meleeHit: boolean; bang: boolean; sanity: number; rnd: number }
export interface O18Out { sanity: number; needMul: number; locked: boolean; clockJitter: boolean; echo: string | null; attn: number; event: O18Run['done'] | 'liftReset' | 'bangHeard' | null }
/** 一帧：困在 O18 房里。返回效果；run.done 置位即脱身（门开）。 */
export function o18Step(run: O18Run, dt: number, i: O18In): O18Out {
  const out: O18Out = { sanity: 0, needMul: O18T.needMul, locked: false, clockJitter: true, echo: null, attn: 0, event: null }
  if (run.done) { out.needMul = 1; out.clockJitter = false; return out }
  run.t += dt
  out.locked = run.t >= O18T.lockAfter
  out.sanity -= O18T.sanityDrain * dt
  run.echo -= dt
  if (run.echo <= 0) { run.echo = O18T.echoEvery; out.echo = O18_ECHO[Math.floor(i.rnd * O18_ECHO.length) % O18_ECHO.length] }
  // ① 抬唱针
  if (i.holdX) {
    run.lift += dt; out.sanity -= O18T.liftSanity * dt
    if (run.lift >= O18T.liftHold) { run.done = 'lift'; out.event = 'lift'; out.locked = false; return out }
  } else if (run.lift > 0) { run.lift = 0; out.event = 'liftReset' }
  // ② 砸烂
  if (i.meleeHit) {
    run.hits++
    if (run.hits >= O18T.smashHits) { run.done = 'smash'; out.event = 'smash'; out.attn += O18T.smashAttn; out.locked = false; return out }
  }
  // ③ 砸门 → 员工来开门
  if (i.bang && out.locked && run.rescueAt <= 0) { run.rescueAt = run.t + O18T.bangRescue[0] + i.rnd * (O18T.bangRescue[1] - O18T.bangRescue[0]); out.event = 'bangHeard' }
  if (run.rescueAt > 0 && run.t >= run.rescueAt) {
    out.attn += O18T.rescueAttn; out.locked = false
    run.done = i.sanity + out.sanity < O18T.corpseSanity ? 'clean' : 'rescue'; out.event = run.done
  }
  return out
}
export function newO18Run(key: string): O18Run { return { key, t: 0, lift: 0, hits: 0, bang: 0, rescueAt: 0, echo: 2 } }

// ---------------- 房卡纯逻辑 ----------------
/** 房卡只开自己的房门 */
export function cardOpens(card: RoomCard | undefined, floor: number, roomNo: number) { return !!card && card.floor === floor && card.dx !== undefined && card.no === roomNo }
export const CARD_REISSUE_ATTN = 5
export const CARD_REST_MUL = 2.5 // 你的房间：关注度降得更快

// ---------------- engine 接线 ----------------
type Hotelish = { objs?: L5ObjSave; attn: number; floor: number }
export function objSave(eng: Engine): L5ObjSave { const h = eng.hotel as unknown as Hotelish; return (h.objs ??= freshObj()) }
const RT = new WeakMap<Engine, { echoT: number; clockOff: number; edgeFired: boolean; lastHits: number }>()
function rt(eng: Engine) { let r = RT.get(eng); if (!r) { r = { echoT: 0, clockOff: 0, edgeFired: false, lastHits: 0 }; RT.set(eng, r) } return r }
/** HUD 时钟乱跳偏移（秒）；0 = 正常 */
export function o18ClockOffset(eng: Engine) { return RT.get(eng)?.clockOff ?? 0 }
/** O18 房门锁死：门 / 撬锁 / 万能钥匙都打不开 */
export function o18DoorLocked(eng: Engine) { const o = (eng.hotel as unknown as Hotelish).objs?.o18; return !!o && !o.done && o.t >= O18T.lockAfter }
/** 抬针进度 0..1（HUD 进度条） */
export function o18LiftProgress(eng: Engine) { const o = (eng.hotel as unknown as Hotelish).objs?.o18; return o && !o.done ? Math.min(1, o.lift / O18T.liftHold) : 0 }

export interface L5ObjFrame { inO18Room: string | null; holdX: boolean; meleeHit: boolean; bang: boolean; moved: number; enclosedRoom: string | null }
/** 每帧由 updateHotel 调用：hooks 由调用方（engine 接线）提供，便于无头测试注入 */
export interface L5ObjHooks {
  msg(text: string, kind?: string): void
  addAttn(n: number): void
  addItem(type: string): boolean
  beastGaze(): void
  lift13(): void
  teleport(): void
  randomEvent(): void
  phono(on: boolean, k: number): void
}
export function stepObjects(eng: Engine, o: L5ObjSave, f: L5ObjFrame, dt: number, hk: L5ObjHooks) {
  const p = eng.player, r = rt(eng)
  // ---- O18 ----
  if (f.inO18Room && !o.smashed.includes(f.inO18Room)) {
    if (!o.o18 || o.o18.key !== f.inO18Room) { o.o18 = newO18Run(f.inO18Room); hk.msg('房间角落里摆着一台崭新的留声机。唱针落着，在放一首……你听过的曲子。', 'lore') }
    const out = o18Step(o.o18, dt, { holdX: f.holdX, meleeHit: f.meleeHit, bang: f.bang, sanity: p.sanity, rnd: Math.random() })
    p.sanity = Math.max(0, p.sanity + out.sanity)
    if (out.needMul > 1) { p.hunger = Math.max(0, p.hunger - 0.05 * (out.needMul - 1) * dt); p.thirst = Math.max(0, p.thirst - 0.07 * (out.needMul - 1) * dt) }
    r.clockOff = out.clockJitter ? (Math.random() - 0.5) * 7200 : 0
    if (out.echo) hk.msg(out.echo, 'lore')
    if (out.attn) hk.addAttn(out.attn)
    hk.phono(!o.o18.done, 1)
    switch (out.event) {
      case 'lift': hk.msg('你把唱针抬了起来。旋律断在半个小节上。门把手「咔」地一声，自己弹开了。', 'system'); break
      case 'smash': hk.msg('喇叭花瘪了，转盘歪在一边。最后一个音拖得很长。你在碎片里捡到半张唱片。', 'system'); hk.addItem('brokenrecord'); break
      case 'bangHeard': hk.msg('你用力砸门。走廊尽头好像有人听见了。', 'system'); break
      case 'rescue': hk.msg('门开了。行李员探进头来，皱着眉看你，又看了看那台留声机。', 'system'); break
      case 'clean': hk.msg('有人进来了。他们弯腰看你的时候，你一动不动——「又一个。」', 'lore'); hk.lift13(); break
      case 'liftReset': hk.msg('手一松，唱针又落了回去。', 'system'); break
    }
    if (o.o18.done) { o.o18Last = { key: o.o18.key, done: o.o18.done }; o.smashed.push(o.o18.key); o.o18 = undefined; r.clockOff = 0; hk.phono(false, 0) }
  } else if (o.o18 && !f.inO18Room) { o.o18 = undefined; r.clockOff = 0; hk.phono(false, 0) }
  // ---- 幻听 ----
  if (o.hallu > 0) { o.hallu = Math.max(0, o.hallu - dt); if (Math.random() < dt / 9) hk.msg(['有人在你身后小声叫你的名字。', '走廊里有骰子滚动的声音。', '……再投一次。'][Math.floor(Math.random() * 3)], 'lore') }
}

/** 窗口原点（无限层平移量）：窗口坐标 + 原点 = 世界坐标 */
export function winOrigin(eng: Engine) { const i = eng.map?.inf; return { ox: i?.ox ?? 0, oy: i?.oy ?? 0 } }
const DT = new WeakMap<Engine, { map: unknown; floor: number }>()
/** X 投出命运之骰：结果此刻就定（返回结果，冷却中返回 null），但提示文字和效果等骰子停下、图案浮现完才生效（o.pend）。
 *  第一人称挥臂 0.6 s，松手（0.33 s）那一帧骰子从手中出手，接上刚体轨迹。 */
export function rollFateDie(eng: Engine, o: L5ObjSave, enclosedRoom: string | null, hk: L5ObjHooks, r = Math.random()): O666Face | null {
  if (eng.time < o.dieCd) { hk.msg(`骰子摸上去冰凉，好像还没「醒」。（${Math.ceil((o.dieCd - eng.time) / 60)} 分钟）`, 'system'); return null }
  o.dieCd = eng.time + O666T.cooldown
  const face = o666Roll(r, !!enclosedRoom)
  const p = eng.player, { ox, oy } = winOrigin(eng), m = eng.map
  const seed = Math.floor(Math.random() * 1e9), from = dieHandPoint(lookYawOfFacing(p.facing), look.pitch, 1.55 + (p.z || 0))
  const walls = m ? dieWallPlanes((tx, ty) => tileAt(m, tx, ty) === 1, p.x, p.y) : []
  const mode = face === 'edge' ? 'edge' as const : face === 'weapon' ? 'spin' as const : 'flat' as const
  const sim = simulateDieThrow({ seed, topFace: RESULT_FACE[face], mode, yaw: p.facing, from, walls })
  const end = sim.frames[sim.frames.length - 1].p
  o.anim = { t0: eng.time, seed, face, x: p.x + ox, y: p.y + oy, yaw: p.facing, from, rel: THROW_REL, walls, settle: sim.settleT }
  o.pend = { face, at: eng.time + THROW_REL + dieResolveDelay(sim), room: enclosedRoom, ex: p.x + ox + end[0], ey: p.y + oy + end[2] }
  DT.set(eng, { map: eng.map, floor: (eng.hotel as unknown as Hotelish)?.floor ?? 0 })
  const e = eng as unknown as { attackAnimT?: number; attackAnimDur?: number; attackAnimKind?: string }
  e.attackAnimKind = 'dieThrow'; e.attackAnimT = THROW_DUR; e.attackAnimDur = THROW_DUR // 第一人称挥臂（viewmodel.vmAnimPose 'dieThrow'）
  audio.hotelClick?.(0.7)
  return face
}
/** 结果生效（骰子停稳且图案浮现完 / 棱上平衡达成 / 落地开始转）。 */
export function resolveFateDie(eng: Engine, o: L5ObjSave, pd: DiePend, hk: L5ObjHooks) {
  const p = eng.player, face = pd.face, { ox, oy } = winOrigin(eng)
  if (face !== 'weapon' && face !== 'edge') hk.msg(`白色的立方体在地上翻滚……停下了：「${O666_FACE_NAME[face]}」。`, 'system')
  switch (face) {
    case 'rare': { const it = O666T.rarePool[Math.floor(Math.random() * O666T.rarePool.length)]; hk.addItem(it); hk.addAttn(O666T.rareAttn); hk.msg('你手里多了一样东西。远处，推车的轮子停了一下。', 'lore'); break }
    case 'sanity': p.sanity = 100; o.hallu = O666T.hallucinate; hk.msg('脑子一下子清醒了。清醒得过分。', 'lore'); break
    case 'teleport': hk.msg('脚下的地毯像被抽走了一样。', 'lore'); hk.teleport(); break
    case 'weapon': o.die = { face, rollT: eng.time, spin: O666T.spin + REVEAL_SPIN, spinRoom: pd.room ?? '', freeze: 0, fx: p.x + ox, fy: p.y + oy, w: 1 }; hk.msg('骰子落地了，却没有停——它在原地越转越快。别离开这个房间。', 'system'); break // 5 min 满 + 「枪」浮现完才给枪
    case 'squid': case 'hotel': case 'gambler': o.die = { face, rollT: eng.time, spin: 0, spinRoom: '', freeze: O666T.freeze, fx: p.x + ox, fy: p.y + oy, w: 1 }; hk.msg('别动。', 'lore'); break
    case 'blank': { const b = eng.hotelBook as unknown as { src: Record<string, string> }; b.src['object-666-blank'] ??= '空白面 · 一段向下的楼梯（L600）'; hk.msg('你碰了一下空白的那面。眼前一黑——一段漫长的楼梯，向下，没有尽头。', 'lore'); p.sanity = Math.max(0, p.sanity - 8); break }
    case 'edge': { const d0 = Math.hypot(p.x + ox - pd.ex, p.y + oy - pd.ey); o.die = { face, rollT: eng.time, spin: 0, spinRoom: '', freeze: 0, fx: p.x + ox, fy: p.y + oy, ex: pd.ex, ey: pd.ey, w: 1, er: Math.max(.5, Math.min(O666T.edgeR, d0 - .4)) } } // 落点离玩家不足 2.2 m 时要再走近 0.4 m 才倒（不在停下当帧就倒）
       hk.msg('骰子立在一条棱上，一动不动。', 'system'); break
  }
}
/** 每帧（任何层级）：待生效结果 + 进行中的骰子（转 / 定身 / 棱上）。enclosedRoom = 当前所在封闭客房 key。
 *  换地图 / 换楼层（掉落、传送、电梯）时投掷中的骰子作废；无限层原点平移不影响（全部世界坐标）。 */
export function stepFateDie(eng: Engine, o: L5ObjSave, enclosedRoom: string | null, dt: number, hk: L5ObjHooks) {
  const p = eng.player, { ox, oy } = winOrigin(eng), px = p.x + ox, py = p.y + oy
  if (o.pend || o.anim) {
    const floor = (eng.hotel as unknown as Hotelish)?.floor ?? 0, t = DT.get(eng)
    if (!t) DT.set(eng, { map: eng.map, floor }) // 读档后第一帧：认当前地图
    else if (t.map !== eng.map || t.floor !== floor) {
      const had = !!o.pend; o.pend = undefined; o.anim = undefined; DT.delete(eng)
      if (o.die && o.die.spin <= 0 && o.die.freeze <= 0) o.die = undefined // 棱上的骰子留在原楼层：作废
      if (had) hk.msg('骰子滚进了黑暗里。你没看清它停在哪一面。', 'system')
    }
  }
  if (o.pend && eng.time >= o.pend.at) { const pd = o.pend; o.pend = undefined; resolveFateDie(eng, o, pd, hk); return } // 生效这一帧不再步进
  const d = o.die
  if (!d) return
  if (d.spin > 0) {
    if (enclosedRoom !== d.spinRoom) { o.die = undefined; hk.msg('你一离开，骰子就倒下了——空白朝上。什么都没有发生。', 'system'); return }
    d.spin -= dt
    if (d.spin <= 0) { if (hk.addItem(O666T.weapon)) hk.msg('骰子终于停了：一把枪的图案。地板上多了一把沉甸甸的霰弹枪。骰子从一条棱上裂开了。', 'system'); if (eng.consumeItem('fatedie')) hk.addItem('brokendie'); o.die = undefined }
  } else if (d.freeze > 0) {
    d.freeze -= dt
    if (Math.hypot(px - d.fx, py - d.fy) > O666T.freezeMove) { o.die = undefined; hk.msg('你动了。余光里，有个西装的轮廓在看你。', 'lore'); hk.beastGaze() }
    else if (d.freeze <= 0) { o.die = undefined; hk.msg('……什么也没发生。你慢慢呼出一口气。', 'system') }
  } else if (d.face === 'edge' && d.ex !== undefined && d.ey !== undefined) {
    if (Math.hypot(px - d.ex, py - d.ey) < (d.er ?? O666T.edgeR)) { o.die = undefined; hk.msg('骰子从棱上倒了下来。', 'system'); hk.randomEvent() }
  }
}
/** 渲染用：当前地图上正在显示的投骰动画（换地图 / 换楼层后 null） */
export function liveDieAnim(eng: Engine) { const o = (eng.hotel as unknown as Hotelish | undefined)?.objs, t = DT.get(eng); if (!o?.anim || !t || t.map !== eng.map) return null; return o.anim }

/** 赌场单局赢 ≥100：送一颗（每局存档最多一次由调用方决定） */
export function o666BigWin(eng: Engine, amt: number, add: (t: string) => boolean): boolean {
  if (amt < O666T.bigWin) return false
  const o = objSave(eng); if (o.bigWinGiven) return false
  if (!add('fatedie')) return false
  o.bigWinGiven = 1; o.receipt++
  eng.msg('一掷千金！发牌员把一颗没有点数的白色骰子推到你面前，附一张购买凭证。', 'system')
  return true
}
