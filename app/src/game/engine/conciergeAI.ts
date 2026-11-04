import { walkHotelStaff } from './hotelStaffWalk'
// [concierge] 看门人（Entity 131「The Concierge」）阶段 3：L5 恐怖旅馆大堂前台的员工。设计见 /workspace/work/concierge/plan.md（ZAN 10-30 16:10 定稿）。
//   · 全楼只有一位：1F 主厅前台（CONCIERGE_DESK 布局：柜台 + 钥匙墙 + 台式电话，送菜升降梯嵌在柜台旁的墙里）。
//     别的楼层平时不在；被他「盯上」时（追踪 / 拦截）才眨眼出现在你身后。
//   · 眼睛 = 登记：在 L5 里他随时知道你在哪。被盯上（追踪 / 搭话 / 追逐）时视野边缘偶尔闪现一只橙色横瞳的眼（HUD）。
//   · 「错误方向」只算真正的出口（古典楼梯 →L4、锅炉房完全黑暗的门 →L6、深色木门 →L9）：
//     朝它走（10 m 内持续接近 1.2 s，或贴近到 3.5 m）→ 他眨眼瞬移到你身后搭话。电梯是酒店自己的，不拦。
//   · 关注度到「清理」档（≥ 75）：他离开前台追踪你 —— 你不看他时眨眼靠近，你看着他时站定、抬起前臂用前臂眼「看」你。
//   · 搭话：「你需要帮助吗？我可以把宴会的方向指给你……」X = 跟他走（被领回酒店深处，关系 +，一段时间不再拦）；
//     走开 / 不理 = 拒绝 → 追逐（他比人跑得快，看不见他时还会眨眼贴上来）→ 扑倒 → 捆绑（连按挣脱，成功可再跑一段）
//     → 拖到最近的送菜升降梯 → 塞进去拉绳 → 13 楼（简化：黑屏 + 拉绳声，随机楼层员工通道醒来；丢钥匙类、关注度 ↑、HP / 理智 ↓）。
//   · 不管的人：蹲着不动躲在客房里发抖的、在床上睡觉的、在「正确方向」上徘徊的。
//   · 金属：地上有住客丢下的金属（银餐具最香）他会去啃，给你一段逃跑窗口。茶歇：每隔一阵他在前台后喝茶，此时不拦人；换班时回到岗位。
//   · 437 号钥匙：13 楼的同事总忘了还。捡到交给他（前台 X）→ 关系大幅 +，很长一段时间放行。
//   · 不可击杀：攻击只会让他更快动手（同管家）。处理完人之后他会掏出手帕擦手。
//   · 只处理本地玩家（不管联机）。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { makeEntity } from '../entities'
import type { ConciergeClip } from '../renderer/conciergeAnim'
import { hotelAddAttn, hotelHere, hotelResting, hotelOwnRoomDnd, l5Tier } from './l5Hotel'
import { l5HallRect, l5RegionAt } from '../world/infiniteL5'
import type { SpecialAction } from './special'
import { audio } from '../core/audio'
import { floorHeight } from '../world/mapgen'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import type { ExitInstance } from '../core/types'
import { bellhopKeep, bellhopKeepSlot } from './bellhopAI' // [bellhop] 13 楼没收的钥匙转交行李员保管

// ---------- 调参表（单位：米 / 秒 / 点）----------
export const CC = {
  // —— 出口判定（只算真出口）——
  trueExits: ['oldstairs', 'boilerdeep', 'darkwooddoor'] as readonly string[], // 古典楼梯 →L4 / 完全黑暗的门 →L6 / 深色木门 →L9（电梯不算）
  exitR: 10, // 这个半径内才判定「朝出口走」
  exitHold: 1.2, // 持续接近这么久 → 拦截
  exitNear: 3.5, // 贴近到这里直接拦截
  exitApproach: 0.35, // 接近速度阈值（m/s）
  // —— 追踪（关注度触发）——
  trackTier: 3, // 关注度档位 ≥ 3（清理）开始追踪
  watchCone: 0.75, watchR: 32, // 「被注视」：玩家视线方向 ±0.75 rad、32 m 内、视线无遮挡
  blinkEvery: [2.2, 3.6] as const, // 追踪时两次眨眼瞬移的间隔
  blinkNear: 2.6, blinkK: 0.45, // 每次瞬移把距离缩到 max(2.6, 当前 × 0.45)
  talkR: 3.2, // 追踪到这么近 → 搭话
  spawnR: [14, 22] as const, // 别的楼层被盯上时在这个距离外（视线外）出现
  // —— 搭话 / 跟他走 ——
  talkT: 9, talkLeave: 4.5, // 9 s 不表态或走开 4.5 m = 拒绝
  leadSpeed: 1.35, leadKeep: 7, leadLoseT: 3, leadMax: 25, leadR: [14, 20] as const,
  passFollow: 180, passKey: 600, // 跟他走 / 交还 437 钥匙后放行多久
  // —— 追逐 / 扑倒 / 捆绑 / 拖行 ——
  run: 6.4, // 追逐速度（玩家冲刺 6.0）
  rageRun: 7.2, rageT: 6, // 挨打后更快
  chaseBlinkD: 7, // 追逐中看不见他、相距 > 7 m → 眨眼贴到你身后
  loseR: 30, loseT: 10, // 追丢：距离 > 30 或视线断开 10 s
  tackleR: 1.25, tackleHit: 0.35, tackleDmg: 6,
  tackleNeed: 6, tackleWin: 2.0, // 扑倒后 2 s 内连按 6 下 → 在他爬起来之前挣开
  bindNeed: 10, bindDecay: 1.4, bindT: 4.2, // 捆绑 4.2 s 内连按 10 下（每秒衰减 1.4）→ 挣脱
  escapeStagger: 1.6, escapeGrace: 4, // 挣脱后他愣 1.6 s；4 s 内不再扑
  drag: 0.9, liftSearch: [2.5, 12] as const, deskLiftR: 16, dragMax: 30,
  // —— 13 楼（简化）——
  blackDur: 7, ropeEvery: 0.75, wakeFade: 1.6,
  liftHp: 25, liftSanity: 20, liftAttn: 15,
  // —— 金属 / 茶歇 / 前台 ——
  metal: ['silverware', 'knife', 'crowbar', 'wrench', 'presses', 'eaglecoin'] as readonly string[],
  metalR: 16, gnawT: { silverware: 12, other: 7 } as const,
  teaEvery: [300, 420] as const, teaLen: 90,
  phoneEvery: [35, 80] as const, phoneR: 22,
  deskKeyR: 2.6,
  // —— 挂眼提示 ——
  eyeEvery: [6, 14] as const, eyeShow: 0.38,
  // —— 其他 ——
  hideT: 2, hideSpeed: 0.25, // 蹲着不动 2 s（在客房里）= 躲着发抖
  zSame: 2.5, walk: 1.35,
  rel: { follow: 8, key: 40, refuse: -6, lift: -12, escape: -3, hit: -10 },
}
const LINES = {
  talk: '「你需要帮助吗？我可以把宴会的方向指给你……」',
  follow: '「这边请。宴会在这边。」',
  arrive: '「祝您用餐愉快。请不要再走错方向了。」',
  refuse: '「……这样不好。」',
  bound: '「请不要乱动。我会送您去该去的地方。」',
  key: '「啊……437。谢谢您，十三楼的同事总是忘了还。」',
  tea: '他端起茶杯，耳朵放松地垂了下来。',
  gnaw: '他蹲下去，捡起那件金属，用门牙啃了起来。',
}

export type ConciergeMode = 'desk' | 'tea' | 'track' | 'blink' | 'talk' | 'lead' | 'chase' | 'tackle' | 'bind' | 'drag' | 'stuff' | 'goMetal' | 'gnaw' | 'wipe' | 'return' | 'stagger'
export interface ConciergeEntState {
  mode: ConciergeMode; modeT: number
  clip: ConciergeClip; seq: number; rev: boolean // 渲染层：clip / seq 变了就重播（rev = 倒放：giveKey 倒放 = 收下钥匙挂回墙上）
  speed: number; watched: boolean
  gaze: [number, number, number] | null // 注视点（世界坐标 x, 高度, y）
  blinkTo: { x: number; y: number; f: number } | null; blinkDone: boolean; after: ConciergeMode; blinkCd: number
  struggle: number; need: number
  lift: { x: number; y: number; f: number } | null // 升降梯开口（窗口坐标；f = 开口朝向）
  metal: { x: number; y: number; type: string } | null
  rageT: number; graceT: number; lostT: number; stuckT: number; leadLose: number
  lead: { x: number; y: number } | null
  phase: number // 子阶段（stuff：0 塞 / 1 拉绳；desk：0 待机 / 1 电话 / 2 收钥匙）
  hidden?: boolean
}
/** 每局存档（eng.hotel.concierge） */
export interface ConciergeSave { met?: 1; talks: number; follows: number; chases: number; binds: number; escapes: number; lifts: number; gnaws: number; key437?: 1 }
export function freshConciergeSave(): ConciergeSave { return { talks: 0, follows: 0, chases: 0, binds: 0, escapes: 0, lifts: 0, gnaws: 0 } }
export function restoreConciergeSave(raw: unknown): ConciergeSave {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ConciergeSave>
  const n = (v: unknown) => Math.max(0, Number(v) || 0)
  return { talks: n(r.talks), follows: n(r.follows), chases: n(r.chases), binds: n(r.binds), escapes: n(r.escapes), lifts: n(r.lifts), gnaws: n(r.gnaws), ...(r.met ? { met: 1 as const } : {}), ...(r.key437 ? { key437: 1 as const } : {}) }
}
export function conciergeSave(eng: Engine): ConciergeSave { return ((eng.hotel as { concierge?: ConciergeSave }).concierge ??= freshConciergeSave()) }

const LOOP = new Set<ConciergeClip>(['idle', 'walk', 'run', 'talk', 'drag', 'pullRope', 'gnawMetal'])
export const CONCIERGE_CLIP_LEN: Partial<Record<ConciergeClip, number>> = { phone: 6.4, giveKey: 4.6, armWatch: 3.4, blinkTeleport: 1.6, trip: 4.4, bind: 4.2, stuffLift: 3.6, wipeHands: 3.2, teaBreak: 6.0 }
/** blinkTeleport：此刻挪位置（= conciergeAnim.CONCIERGE_TELEPORT_AT） */
export const CONCIERGE_BLINK_AT = 0.58
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
function setMode(s: ConciergeEntState, m: ConciergeMode, clip: ConciergeClip, rev = false) {
  s.mode = m; s.modeT = 0
  if (clip !== s.clip || !LOOP.has(clip) || rev !== s.rev) s.seq++
  s.clip = clip; s.rev = rev
}
export function ensureConcierge(e: Entity): ConciergeEntState {
  return (e.cg ??= { mode: 'desk', modeT: 0, clip: 'idle', seq: 0, rev: false, speed: 0, watched: false, gaze: null, blinkTo: null, blinkDone: false, after: 'talk', blinkCd: rnd(CC.blinkEvery[0], CC.blinkEvery[1]), struggle: 0, need: 0, lift: null, metal: null, rageT: 0, graceT: 0, lostT: 0, stuckT: 0, leadLose: 0, lead: null, phase: 0 })
}

// ---------- 世界（每引擎一份；地图变化重置）----------
interface Desk { ax: number; ay: number; f: number } // 看门人站位（绝对坐标）+ 朝向（面朝住客）
interface CgWorld {
  map: unknown; desk: Desk | null; deskTried: boolean
  passUntil: number; teaNext: number; teaUntil: number; phoneNext: number
  exitT: number; exitPrev: WeakMap<ExitInstance, number>
  hideT: number; lastPx: number; lastPy: number; pSpeed: number
  eyeNext: number; eyeUntil: number; eyeX: number; eyeY: number; eyeRot: number; eyeCount: number
  keyPlaced: boolean; lastShift: string
}
/** 跨地图保留：13 楼黑屏 / 醒来淡入 / 被捆时的按键边沿 */
interface CgGlobal { black: number; blackDur: number; ropeT: number; wake: number; finished: boolean; keys: Record<string, boolean>; captured: boolean }
const WORLD = new WeakMap<Engine, CgWorld>()
const GLOBAL = new WeakMap<Engine, CgGlobal>()
function glob(eng: Engine): CgGlobal { let g = GLOBAL.get(eng); if (!g) { g = { black: 0, blackDur: 0, ropeT: 0, wake: 0, finished: false, keys: {}, captured: false }; GLOBAL.set(eng, g) } return g }
function world(eng: Engine): CgWorld {
  let w = WORLD.get(eng)
  const m = eng.map
  if (!w || w.map !== m) {
    const keep = w ? { passUntil: w.passUntil, teaNext: w.teaNext, teaUntil: w.teaUntil } : { passUntil: -1, teaNext: eng.time + rnd(CC.teaEvery[0], CC.teaEvery[1]), teaUntil: -1 }
    w = { map: m, desk: null, deskTried: false, ...keep, phoneNext: eng.time + rnd(CC.phoneEvery[0], CC.phoneEvery[1]), exitT: 0, exitPrev: new WeakMap(), hideT: 0, lastPx: eng.player.x, lastPy: eng.player.y, pSpeed: 0, eyeNext: eng.time + rnd(CC.eyeEvery[0], CC.eyeEvery[1]), eyeUntil: -1, eyeX: 0, eyeY: 0, eyeRot: 0, eyeCount: 0, keyPlaced: false, lastShift: 'play' }
    WORLD.set(eng, w)
  }
  return w
}
const ox = (eng: Engine) => eng.map?.inf?.ox ?? 0, oy = (eng: Engine) => eng.map?.inf?.oy ?? 0

// ---------- 基础判定 ----------
export const isTrueExit = (kind: string) => CC.trueExits.includes(kind)
export function findConcierge(eng: Engine): Entity | null { return eng.map?.entities.find((e) => e.def.type === 'concierge' && !e.dead) ?? null }
/** 玩家正看着这个点（视线方向 ±watchCone、watchR 内、无遮挡） */
export function playerWatching(eng: Engine, x: number, y: number): boolean {
  const p = eng.player, dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy)
  if (d > CC.watchR) return false
  if (d < 0.6) return true
  const da = wrap(Math.atan2(dy, dx) - p.facing)
  if (Math.abs(da) > CC.watchCone) return false
  return eng.los(p.x, p.y, x, y)
}
/** 躲着发抖（客房里蹲着不动 2 s）或在床上睡觉：他不管 */
export function conciergeIgnores(eng: Engine): boolean {
  if (hotelResting(eng)) return true
  if (hotelOwnRoomDnd(eng)) return true // [l5items] 你的房间挂着「请勿打扰」
  const w = WORLD.get(eng)
  return !!w && w.hideT >= CC.hideT
}
export function conciergeOnTea(eng: Engine) { const w = WORLD.get(eng); return !!w && eng.time < w.teaUntil }
export function conciergePassed(eng: Engine) { const w = WORLD.get(eng); return !!w && eng.time < w.passUntil }
const walkable = (eng: Engine, x: number, y: number) => { const m = eng.map!; return x > 0.5 && y > 0.5 && x < m.w - 0.5 && y < m.h - 0.5 && eng.entityWalkH(m, Math.floor(x), Math.floor(y), 0) !== null && canOccupy(m, x, y, 0.3, { z: 0 }) }
function rel(eng: Engine, v: number) { const h = eng.hotel; h.staff.concierge = Math.max(-100, Math.min(100, (h.staff.concierge ?? 0) + v)) }
function meet(eng: Engine) { const b = eng.hotelBook; if (!b.met.includes('concierge')) b.met.push('concierge'); conciergeSave(eng).met = 1 }
function face(e: Entity, tx: number, ty: number, dt: number, rate: number) {
  const d = wrap(Math.atan2(ty - e.y, tx - e.x) - e.facing)
  e.facing += Math.sign(d) * Math.min(Math.abs(d), rate * dt)
}
function move(eng: Engine, e: Entity, s: ConciergeEntState, speed: number, dt: number) {
  s.speed = walkHotelStaff(eng, e, { x: e.targetX, y: e.targetY }, speed, dt)
  if (Math.hypot(e.targetX - e.x, e.targetY - e.y) > 0.6 && s.speed < speed * 0.2) s.stuckT += dt; else s.stuckT = Math.max(0, s.stuckT - dt)
  e.z = floorHeight(eng.map!, e.x, e.y)
}
/** 把实体从地图（和所在 chunk）里拿掉 */
function removeEntity(eng: Engine, e: Entity) {
  const m = eng.map!; const i = m.entities.indexOf(e); if (i >= 0) m.entities.splice(i, 1)
  const inf = m.inf as unknown as { chunks?: Map<string, { entities: Entity[] }> } | undefined
  if (inf?.chunks) for (const c of inf.chunks.values()) { const k = c.entities.indexOf(e); if (k >= 0) c.entities.splice(k, 1) }
  e.dead = true; e.hidden = true
}

// ---------- 前台位置（1F 出生主厅；绝对坐标）----------
/** 前台布局（与 renderer/conciergeAnim 的 CONCIERGE_DESK / CONCIERGE_DUMBWAITER 一致；模型空间 +Z 朝住客、+X = 他的左手边） */
export const CG_DESK = { center: [0.35, 0.5] as const, half: [1.25, 0.36] as const, wallBack: 0.75, lift: [-2.4, -0.78] as const }
/** 模型空间 (mx, mz) → 世界偏移（f = 朝向） */
export const cgLocal = (f: number, mx: number, mz: number): [number, number] => [Math.cos(f) * mz + Math.sin(f) * mx, Math.sin(f) * mz - Math.cos(f) * mx]
export function conciergeDesk(eng: Engine): Desk | null {
  if (eng.levelDef.id !== 5 || !eng.map?.inf || eng.hotel.floor !== 1) return null
  const w = world(eng)
  if (w.deskTried) return w.desk
  w.deskTried = true
  const seed = eng.map.inf.seed, r = l5HallRect(seed, 0, 0), m = eng.map
  // 候选：主厅四面墙的中段，背靠墙站 0.75 m（钥匙墙贴墙），柜台在前方；整块不压实心结构 / 出口
  const cand: Desk[] = []
  const mx = (r.x0 + r.x1 + 1) / 2, my = (r.y0 + r.y1 + 1) / 2
  for (const k of [0, -3, 3, -6, 6]) {
    cand.push({ ax: mx + k, ay: r.y0 + CG_DESK.wallBack, f: Math.PI / 2 }, { ax: mx + k, ay: r.y1 + 1 - CG_DESK.wallBack, f: -Math.PI / 2 })
    cand.push({ ax: r.x0 + CG_DESK.wallBack, ay: my + k, f: 0 }, { ax: r.x1 + 1 - CG_DESK.wallBack, ay: my + k, f: Math.PI })
  }
  for (const c of cand) {
    const X = c.ax - ox(eng), Y = c.ay - oy(eng)
    let okc = true
    for (let a = -1.6; a <= 1.6 && okc; a += 0.4) for (const z of [-0.5, 0, 0.5, 1.0]) {
      const [dx, dy] = cgLocal(c.f, a + 0.35, z)
      const x = X + dx, y = Y + dy
      if (x < 1 || y < 1 || x > m.w - 1 || y > m.h - 1 || eng.entityWalkH(m, Math.floor(x), Math.floor(y), 0) === null) { okc = false; break }
      if (m.structures.some((s) => s.solid && x >= s.x - 0.2 && x < s.x + s.w + 0.2 && y >= s.y - 0.2 && y < s.y + s.h + 0.2)) { okc = false; break }
    }
    if (okc && m.exits.some((e) => Math.hypot(e.x - X, e.y - Y) < 4)) okc = false
    if (okc) { w.desk = c; break }
  }
  return w.desk
}
const deskWin = (eng: Engine, d: Desk) => ({ x: d.ax - ox(eng), y: d.ay - oy(eng) })
/** 柜台矩形碰撞：把玩家推出柜台（柜台不在 chunk 结构里，免得流式重建 / 平移时丢失） */
function pushOutDesk(eng: Engine, d: Desk) {
  const p = eng.player, D = deskWin(eng, d)
  const [cx, cy] = cgLocal(d.f, CG_DESK.center[0], CG_DESK.center[1])
  const rx = p.x - (D.x + cx), ry = p.y - (D.y + cy)
  const fx = Math.cos(d.f), fy = Math.sin(d.f), lx = Math.sin(d.f), ly = -Math.cos(d.f)
  const u = rx * lx + ry * ly, v = rx * fx + ry * fy // u 沿柜台长边、v 沿朝向
  const hu = CG_DESK.half[0] + PLAYER_RADIUS, hv = CG_DESK.half[1] + PLAYER_RADIUS
  if (Math.abs(u) >= hu || Math.abs(v) >= hv) return
  const pu = hu - Math.abs(u), pv = hv - Math.abs(v)
  if (pv < pu) { const nv = Math.sign(v || 1) * hv; p.x += (nv - v) * fx; p.y += (nv - v) * fy }
  else { const nu = Math.sign(u || 1) * hu; p.x += (nu - u) * lx; p.y += (nu - u) * ly }
}
export function conciergeDeskLift(eng: Engine): { x: number; y: number; f: number } | null {
  const d = conciergeDesk(eng); if (!d) return null
  const D = deskWin(eng, d), [dx, dy] = cgLocal(d.f, CG_DESK.lift[0], CG_DESK.lift[1])
  return { x: D.x + dx, y: D.y + dy, f: d.f } // 开口朝住客一侧（与他站在柜台后时同向）
}

// ---------- 挂眼提示 ----------
export interface ConciergeEyeFlash { k: number; x: number; y: number; rot: number }
/** HUD：视野边缘闪一只眼（x / y = 屏幕百分比；k = 不透明度 0..1） */
export function conciergeEyeFlash(eng: Engine): ConciergeEyeFlash | null {
  const w = WORLD.get(eng); if (!w || eng.time >= w.eyeUntil) return null
  const u = 1 - (w.eyeUntil - eng.time) / CC.eyeShow
  return { k: Math.sin(Math.min(1, Math.max(0, u)) * Math.PI), x: w.eyeX, y: w.eyeY, rot: w.eyeRot }
}
export const conciergeEyeCount = (eng: Engine) => WORLD.get(eng)?.eyeCount ?? 0
function stepEye(eng: Engine, w: CgWorld, on: boolean) {
  if (!on) { if (w.eyeNext < eng.time + 2) w.eyeNext = eng.time + rnd(2, CC.eyeEvery[0]); return }
  if (eng.time < w.eyeNext) return
  w.eyeNext = eng.time + rnd(CC.eyeEvery[0], CC.eyeEvery[1])
  w.eyeUntil = eng.time + CC.eyeShow; w.eyeCount++
  // 四条边之一，避开正中与角落
  const side = Math.floor(Math.random() * 4), t = rnd(0.18, 0.82)
  ;[w.eyeX, w.eyeY, w.eyeRot] = side === 0 ? [3.5, t * 100, 90] : side === 1 ? [96.5, t * 100, -90] : side === 2 ? [t * 100, 4, 180] : [t * 100, 95, 0]
}

// ---------- 13 楼（简化）----------
export interface ConciergeBlackout { k: number; phase: 'lift' | 'wake' }
/** HUD：黑屏不透明度（塞进升降梯 → 黑屏 → 醒来淡入） */
export function conciergeBlackout(eng: Engine): ConciergeBlackout | null {
  const g = GLOBAL.get(eng); if (!g) return null
  if (g.black > 0) return { k: Math.min(1, (g.blackDur - g.black) / 0.5), phase: 'lift' }
  if (g.wake > 0) return { k: Math.min(1, g.wake / CC.wakeFade), phase: 'wake' }
  return null
}
/** 钥匙类：口袋里的钥匙 / 门禁卡 / 万能钥匙 / 437 号钥匙 */
export const isConciergeKey = (t: string) => t === 'skeleton' || t === 'keycard' || t === 'key437' || /key$/.test(t)
/** 塞进升降梯、黑屏结束：结算后果 + 换到随机楼层（员工通道醒来见 conciergeArrive） */
export function conciergeLiftFinish(eng: Engine) {
  const p = eng.player, cs = conciergeSave(eng)
  let lost = 0
  const kept: ReturnType<typeof bellhopKeepSlot>[] = []
  for (const arr of [p.equip.pockets, p.hotbar, p.backpack]) for (let i = 0; i < arr.length; i++) { const sl = arr[i]; if (sl && isConciergeKey(sl.type)) { lost += sl.count ?? 1; kept.push(bellhopKeepSlot(sl)); arr[i] = null } }
  bellhopKeep(eng, kept) // [bellhop] 没收的钥匙不会消失：转交行李员保管，找到他可以领回（关注度 +5）
  eng.syncPassives?.()
  if (!eng.dev.god) { p.hp = Math.max(1, p.hp - CC.liftHp); p.sanity = Math.max(0, p.sanity - CC.liftSanity) }
  hotelAddAttn(eng, CC.liftAttn)
  cs.lifts++; rel(eng, CC.rel.lift)
  const cur = eng.hotel.floor
  let dest = cur
  while (dest === cur) dest = 1 + Math.floor(Math.random() * 12)
  eng.hotel.floor = dest
  ;(eng.hotel as { cgWake?: 1 }).cgWake = 1
  eng.msg('黑暗里，绳子一下一下地往上拽。很久以后，轿厢停了。门外的走廊有人在哼歌。', 'lore')
  if (lost) eng.msg(`口袋轻了——身上的钥匙（${lost} 件）都不见了。也许该去问问走廊尽头那位摇铃的。`, 'system')
  eng.transition = { anim: 'iris', t: 0, dest: 5 }
  eng.emit({ kind: 'transition', anim: 'iris', dest: 5 })
  const g = glob(eng); g.black = 0; g.finished = true; g.wake = CC.wakeFade; g.captured = false
  return { dest, lost }
}
/** level.ts：13 楼回来的抵达 —— 放到员工通道（维修层区域；找不到就放到离真出口最远的走廊） */
export function conciergeArrive(eng: Engine) {
  const h = eng.hotel as { cgWake?: 1 }
  if (!h.cgWake || eng.levelDef.id !== 5 || !eng.map?.inf) return
  delete h.cgWake
  const m = eng.map, seed = m.inf!.seed, p = eng.player
  const exits = m.exits.filter((e) => isTrueExit(e.def.kind))
  let best: { x: number; y: number; sc: number } | null = null
  for (let y = 3; y < m.h - 3; y += 2) for (let x = 3; x < m.w - 3; x += 2) {
    const cx = x + 0.5, cy = y + 0.5
    if (eng.entityWalkH(m, x, y, 0) === null || !canOccupy(m, cx, cy, PLAYER_RADIUS, { z: 0 })) continue
    const reg = l5RegionAt(seed, cx + (m.inf!.ox ?? 0), cy + (m.inf!.oy ?? 0))
    const ex = exits.reduce((a, e) => Math.min(a, Math.hypot(e.x - cx, e.y - cy)), 99)
    if (ex < 12) continue
    const staff = reg?.variant === 'maintenance' ? 100 : 0
    const sc = staff + Math.min(40, ex) - Math.hypot(cx - m.w / 2, cy - m.h / 2) * 0.3
    if (!best || sc > best.sc) best = { x: cx, y: cy, sc }
  }
  if (best) { p.x = best.x; p.y = best.y }
  p.crouching = true
  eng.msg('你在一条窄窄的员工通道里醒来，墙上刷着「仅供员工使用」。手腕上还有绳子勒过的印子。', 'lore')
}

// ---------- 被捆 / 拖行：接管玩家（movement 钩子）----------
const CAPTURE = new Set<ConciergeMode>(['bind', 'drag', 'stuff'])
export function conciergeCaptured(eng: Engine): boolean {
  const g = GLOBAL.get(eng); if (g && g.black > 0) return true
  const e = findConcierge(eng); const s = e?.cg
  return !!s && (CAPTURE.has(s.mode) || (s.mode === 'tackle' && s.modeT >= CC.tackleHit && s.phase === 1))
}
/** 挣脱进度（HUD）：null = 没被抓 */
export function conciergeStruggleHud(eng: Engine): { progress: number; label: string; left: number } | null {
  const e = findConcierge(eng), s = e?.cg
  if (!s) return null
  if (s.mode === 'tackle' && s.phase === 1 && s.modeT >= CC.tackleHit) return { progress: Math.min(1, s.struggle / CC.tackleNeed), label: '被扑倒了——趁他爬起来之前挣开！', left: Math.max(0, CC.tackleHit + CC.tackleWin - s.modeT) }
  if (s.mode === 'bind') return { progress: Math.min(1, s.struggle / CC.bindNeed), label: '他在捆你——挣脱绳子！', left: Math.max(0, CC.bindT - s.modeT) }
  if (s.mode === 'drag' || s.mode === 'stuff') return { progress: 0, label: '被捆住了，动弹不得……', left: 0 }
  return null
}
/** 连按计一下（movement 钩子里按键上升沿；验收脚本直接调） */
export function conciergeStrugglePress(eng: Engine, n = 1) {
  const e = findConcierge(eng), s = e?.cg; if (!s) return
  if ((s.mode === 'tackle' && s.phase === 1) || s.mode === 'bind') s.struggle += n
}
export function conciergeControlsPlayer(eng: Engine): boolean {
  if (eng.levelDef.id !== 5) return false
  const g = glob(eng)
  if (!conciergeCaptured(eng)) { if (g.captured) { g.captured = false; eng.player.crouching = false } return false }
  g.captured = true
  const k = { a: !!eng.input.attack, i: !!eng.input.interact, j: !!eng.input.jump, x: !!eng.specialHeld }
  for (const n of ['a', 'i', 'j', 'x'] as const) if (k[n] && !g.keys[n]) conciergeStrugglePress(eng)
  g.keys = k
  const p = eng.player; p.vz = 0; p.crouching = true
  // 拖行：玩家贴在他手边（他倒退着走，人在他正前方地上）
  const e = findConcierge(eng), s = e?.cg
  if (e && s && (s.mode === 'drag' || (s.mode === 'stuff' && s.phase === 0) || s.mode === 'bind' || s.mode === 'tackle')) {
    const off = s.mode === 'drag' ? 0.95 : s.mode === 'stuff' ? 0.7 : 0.62
    const tx = e.x + Math.cos(e.facing) * off, ty = e.y + Math.sin(e.facing) * off
    if (s.mode !== 'tackle' || canOccupy(eng.map!, tx, ty, PLAYER_RADIUS * 0.6, { z: 0 })) { p.x = tx; p.y = ty }
  }
  return true
}

// ---------- 生成 ----------
export function spawnConcierge(eng: Engine, at?: { x: number; y: number; f?: number }, mode: ConciergeMode = 'desk'): Entity | null {
  const m = eng.map; if (!m) return null
  const old = findConcierge(eng); if (old) return old
  let pos = at ?? null
  if (!pos) { const d = conciergeDesk(eng); if (d) pos = { ...deskWin(eng, d), f: d.f } }
  if (!pos) return null
  const e = makeEntity('concierge', pos.x, pos.y, floorHeight(m, pos.x, pos.y))
  e.facing = pos.f ?? 0
  const s = ensureConcierge(e); s.mode = mode
  if (mode !== 'desk') s.clip = 'walk'
  m.entities.push(e)
  return e
}
/** 玩家身后（视线外）的一个可站点：距离 r，左右张开搜索 */
function behindPlayer(eng: Engine, r: number, from?: { x: number; y: number }): { x: number; y: number } | null {
  const p = eng.player
  for (const rr of [r, r + 0.6, r - 0.5, r + 1.4]) for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
    const a = p.facing + Math.PI + da, x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr
    if (!walkable(eng, x, y) || !eng.los(p.x, p.y, x, y)) continue
    if (playerWatching(eng, x, y)) continue
    if (from && Math.hypot(x - from.x, y - from.y) < 0.3) continue
    return { x, y }
  }
  return null
}
/** 视线外、距离玩家 r0–r1 的可站点（别的楼层被盯上时出场） */
function unseenSpot(eng: Engine, r0: number, r1: number): { x: number; y: number } | null {
  const p = eng.player
  for (let t = 0; t < 80; t++) {
    const a = Math.random() * Math.PI * 2, r = rnd(r0, r1), x = Math.floor(p.x + Math.cos(a) * r) + 0.5, y = Math.floor(p.y + Math.sin(a) * r) + 0.5
    if (walkable(eng, x, y) && !playerWatching(eng, x, y)) return { x, y }
  }
  return null
}
function startBlink(s: ConciergeEntState, to: { x: number; y: number; f: number }, after: ConciergeMode) { s.blinkTo = to; s.blinkDone = false; s.after = after; setMode(s, 'blink', 'blinkTeleport') }
/** 拦截：眨眼瞬移到玩家身后 → 搭话 */
export function conciergeIntercept(eng: Engine, why: 'exit' | 'track' = 'exit'): Entity | null {
  const p = eng.player
  let e = findConcierge(eng)
  if (!e) { const sp = unseenSpot(eng, 6, 14) ?? behindPlayer(eng, 4); if (!sp) return null; e = spawnConcierge(eng, { ...sp, f: Math.atan2(p.y - sp.y, p.x - sp.x) }, 'track') }
  if (!e) return null
  const s = ensureConcierge(e)
  const b = behindPlayer(eng, 2.0, e)
  if (!b) { setMode(s, 'track', 'walk'); return e }
  startBlink(s, { ...b, f: Math.atan2(p.y - b.y, p.x - b.x) }, 'talk')
  void why
  return e
}

// ---------- 世界步进（l5Hotel.updateHotel 调用）----------
/** [l5items] O18 留声机：理智 <20 时员工把你当尸体「清理」——直接走 13 楼黑屏流程 */
export function conciergeStartLift(eng: Engine): boolean {
  const g = glob(eng); if (g.black > 0) return false
  g.black = CC.blackDur; g.blackDur = CC.blackDur; g.ropeT = 0.6; g.finished = false; audio.hotelCreak?.(0.6); return true
}
export function stepConciergeWorld(eng: Engine, dt: number) {
  const m = eng.map
  if (!m || eng.levelDef.id !== 5 || !m.inf) return
  const w = world(eng), g = glob(eng), p = eng.player
  // 13 楼黑屏 / 醒来淡入
  if (g.black > 0) {
    g.black = Math.max(0, g.black - dt); g.ropeT -= dt
    if (g.ropeT <= 0) { g.ropeT = CC.ropeEvery; audio.conciergeRope?.(0.7) }
    if (g.black <= 0 && !g.finished) conciergeLiftFinish(eng)
    return
  }
  if (g.wake > 0 && !eng.transition) g.wake = Math.max(0, g.wake - dt)
  // 玩家速度 / 躲藏计时
  const sp = Math.hypot(p.x - w.lastPx, p.y - w.lastPy) / Math.max(1e-4, dt); w.lastPx = p.x; w.lastPy = p.y
  w.pSpeed = sp > 20 ? w.pSpeed : sp
  const here = hotelHere(eng)
  if (p.crouching && w.pSpeed < CC.hideSpeed && here?.inRoom) w.hideT += dt; else w.hideT = 0
  // 茶歇：计时开始 → teaLen；换班开始时回到岗位
  const shift = eng.hotelShift.phase
  if (shift === 'shift' && w.lastShift !== 'shift' && eng.time < w.teaUntil) { w.teaUntil = eng.time; w.teaNext = eng.time + rnd(CC.teaEvery[0], CC.teaEvery[1]) }
  w.lastShift = shift
  if (eng.time >= w.teaNext && eng.time >= w.teaUntil) { w.teaUntil = eng.time + CC.teaLen; w.teaNext = eng.time + CC.teaLen + rnd(CC.teaEvery[0], CC.teaEvery[1]) }
  // 前台（1F）
  const desk = conciergeDesk(eng)
  if (desk) pushOutDesk(eng, desk)
  let e = findConcierge(eng)
  if (!e && desk && !conciergeCaptured(eng)) e = spawnConcierge(eng)
  const s = e?.cg
  // 437 钥匙：没交还过、身上没有、这张图上也没有 → 每张图 35% 放一把在远处（别的楼层）
  if (!w.keyPlaced) { w.keyPlaced = true; placeKey437(eng) }
  // 拦截 / 追踪触发
  const free = !s || s.mode === 'desk' || s.mode === 'return' || s.mode === 'wipe' || s.mode === 'track'
  const calmOK = !conciergeOnTea(eng) && !conciergePassed(eng) && !conciergeIgnores(eng) && !eng.dev?.frozenAI && !eng.dev?.invisible && eng.hotelVanishT <= 0
  // 出口：10 m 内持续接近 1.2 s，或贴近 3.5 m
  let exitHit = false
  for (const x of m.exits) {
    if (!isTrueExit(x.def.kind)) continue
    const d = Math.hypot(x.x - p.x, x.y - p.y)
    const prev = w.exitPrev.get(x); w.exitPrev.set(x, d)
    if (d > CC.exitR || prev === undefined) continue
    const vApp = (prev - d) / Math.max(1e-4, dt)
    if (d < CC.exitNear) exitHit = true
    if (vApp > CC.exitApproach) { w.exitT += dt; if (w.exitT >= CC.exitHold) exitHit = true }
  }
  if (!exitHit) w.exitT = Math.max(0, w.exitT - dt * 0.5)
  if (calmOK && free && exitHit && (!s || s.mode !== 'track' || Math.hypot(e!.x - p.x, e!.y - p.y) > CC.talkR)) { conciergeIntercept(eng, 'exit'); w.exitT = 0 }
  else if (calmOK && l5Tier(eng.hotel.attn) >= CC.trackTier) {
    if (!e) { const sp2 = unseenSpot(eng, CC.spawnR[0], CC.spawnR[1]); if (sp2) e = spawnConcierge(eng, { ...sp2, f: Math.atan2(p.y - sp2.y, p.x - sp2.x) }, 'track') }
    else if (s && (s.mode === 'desk' || s.mode === 'return')) setMode(s, 'track', 'walk')
  }
  // 挂眼提示：被盯上（追踪 / 搭话 / 追逐 / 正要拦截）时
  const on = !!s && (s.mode === 'track' || s.mode === 'talk' || s.mode === 'chase' || (s.mode === 'blink' && s.after !== 'desk' && s.after !== 'return'))
  stepEye(eng, w, on)
  // 前台电话
  if (s && s.mode === 'desk' && s.phase === 0 && e && eng.time >= w.phoneNext) {
    w.phoneNext = eng.time + rnd(CC.phoneEvery[0], CC.phoneEvery[1])
    if (Math.hypot(e.x - p.x, e.y - p.y) < CC.phoneR) { audio.conciergePhone?.(0.6); s.phase = 1; setMode(s, 'desk', 'phone'); s.phase = 1 }
  }
}
function placeKey437(eng: Engine) {
  const m = eng.map!, p = eng.player, cs = conciergeSave(eng)
  if (cs.key437 || eng.hotel.floor === 1) return
  const has = [p.equip.pockets, p.hotbar, p.backpack].some((a) => a.some((sl) => sl?.type === 'key437'))
  if (has || m.items.some((it) => it.type === 'key437') || Math.random() > 0.35) return
  for (let t = 0; t < 120; t++) {
    const x = Math.floor(rnd(4, m.w - 4)) + 0.5, y = Math.floor(rnd(4, m.h - 4)) + 0.5
    if (Math.hypot(x - p.x, y - p.y) < 25 || !walkable(eng, x, y)) continue
    const reg = l5RegionAt(m.inf!.seed, x + ox(eng), y + oy(eng))
    if ((!reg?.variant || !['guestroom', 'lounge', 'beverly', 'maintenance'].includes(reg.variant)) && t < 90) continue
    m.items.push({ id: Math.random(), type: 'key437', count: 1, x, y })
    return
  }
}

// ---------- 主更新（entityAI 分派）----------
export function updateConcierge(eng: Engine, e: Entity, dt: number) {
  const s = ensureConcierge(e), p = eng.player, w = world(eng), cs = conciergeSave(eng)
  if (e.presentationPending) return
  s.modeT += dt; s.rageT -= dt; s.graceT -= dt; s.speed = 0; s.blinkCd -= dt
  if (e.hp < e.def.hp) conciergeKillGuard(eng, e)
  const d = Math.hypot(p.x - e.x, p.y - e.y), sameZ = Math.abs((e.z ?? 0) - p.z) < CC.zSame
  s.watched = sameZ && playerWatching(eng, e.x, e.y)
  const desk = conciergeDesk(eng), D = desk ? deskWin(eng, desk) : null
  const ignore = conciergeIgnores(eng)
  s.gaze = null
  // 金属：平静 / 追踪 / 搭话 / 追逐 / 回去 时都会被吸引
  if (!CAPTURE.has(s.mode) && s.mode !== 'tackle' && s.mode !== 'blink' && s.mode !== 'gnaw' && s.mode !== 'goMetal' && s.mode !== 'stagger') {
    const it = metalNear(eng, e)
    if (it) { s.metal = { x: it.x, y: it.y, type: it.type }; setMode(s, 'goMetal', s.mode === 'chase' ? 'run' : 'walk'); }
  }
  switch (s.mode) {
    case 'desk': case 'tea': {
      e.state = 'idle'
      if (!D || !desk) { setMode(s, 'return', 'walk'); break }
      if (Math.hypot(D.x - e.x, D.y - e.y) > 0.25) { setMode(s, 'return', 'walk'); break }
      e.x = D.x; e.y = D.y; e.facing = desk.f
      const tea = conciergeOnTea(eng)
      if (tea && s.mode === 'desk' && s.phase === 0) { s.mode = 'tea'; setMode(s, 'tea', 'teaBreak'); if (d < 14) eng.msg(LINES.tea, 'lore') }
      if (!tea && s.mode === 'tea' && s.clip !== 'teaBreak') { setMode(s, 'desk', 'idle'); s.phase = 0 }
      if (s.mode === 'tea') { if (s.clip === 'teaBreak' && s.modeT >= CONCIERGE_CLIP_LEN.teaBreak!) setMode(s, 'tea', tea ? (Math.random() < 0.6 ? 'teaBreak' : 'idle') : 'idle'); else if (s.clip === 'idle' && s.modeT > 4) { if (tea) setMode(s, 'tea', 'teaBreak'); else { setMode(s, 'desk', 'idle'); s.phase = 0 } } break }
      // 电话 / 收钥匙 播完回待机
      if (s.phase === 1 && s.clip === 'phone' && s.modeT >= CONCIERGE_CLIP_LEN.phone!) { s.phase = 0; setMode(s, 'desk', 'idle') }
      if (s.phase === 2 && s.modeT >= CONCIERGE_CLIP_LEN.giveKey!) { s.phase = 0; setMode(s, 'desk', 'idle') }
      if (s.phase === 0 && d < 9 && sameZ) s.gaze = [p.x, 1.55, p.y]
      if (!cs.met && d < 5 && s.watched) meet(eng)
      break
    }
    case 'track': {
      e.state = 'investigate'
      if (ignore || (!conciergeOnTea(eng) && l5Tier(eng.hotel.attn) < CC.trackTier && w.exitT <= 0 && s.modeT > 6 && !s.watched)) { goHome(eng, e, s); break }
      if (conciergeOnTea(eng)) { goHome(eng, e, s); break }
      s.gaze = [p.x, 1.5, p.y]
      if (d < CC.talkR && sameZ) { startTalk(eng, e, s); break }
      if (s.watched) {
        // 被看着：站定，抬起前臂用前臂眼看你
        face(e, p.x, p.y, dt, 3)
        if (s.clip !== 'armWatch') setMode(s, 'track', 'armWatch')
        else if (s.modeT >= CONCIERGE_CLIP_LEN.armWatch! - 0.1) setMode(s, 'track', 'armWatch')
        break
      }
      // 不被看着：眨眼靠近
      if (s.blinkCd <= 0) {
        s.blinkCd = rnd(CC.blinkEvery[0], CC.blinkEvery[1])
        const r = Math.max(CC.blinkNear, d * CC.blinkK)
        const to = r <= CC.blinkNear + 0.01 ? behindPlayer(eng, CC.blinkNear, e) : towardPlayer(eng, e, r)
        if (to) { startBlink(s, { ...to, f: Math.atan2(p.y - to.y, p.x - to.x) }, 'track'); break }
      }
      if (s.clip === 'armWatch' && s.modeT < 0.8) break
      e.targetX = p.x; e.targetY = p.y
      if (s.clip !== 'walk') setMode(s, 'track', 'walk')
      move(eng, e, s, CC.walk, dt)
      break
    }
    case 'blink': {
      e.state = 'idle'
      if (!s.blinkDone && s.modeT >= CONCIERGE_BLINK_AT && s.blinkTo) {
        s.blinkDone = true
        if (s.after === 'desk' && !D) { removeEntity(eng, e); return } // 别的楼层：眨眼就不见了
        e.x = s.blinkTo.x; e.y = s.blinkTo.y; e.facing = s.blinkTo.f; e.z = floorHeight(eng.map!, e.x, e.y)
        e.targetX = e.x; e.targetY = e.y
        audio.conciergeHoof?.(0.35)
      }
      if (s.modeT >= CONCIERGE_CLIP_LEN.blinkTeleport!) {
        if (s.after === 'talk') startTalk(eng, e, s)
        else if (s.after === 'desk') { setMode(s, 'desk', 'idle'); s.phase = 0 }
        else if (s.after === 'chase') setMode(s, 'chase', 'run')
        else setMode(s, s.after, s.after === 'track' ? 'walk' : 'idle')
      }
      break
    }
    case 'talk': {
      e.state = 'idle'; face(e, p.x, p.y, dt, 4); s.gaze = [p.x, 1.6, p.y]
      if (ignore) { goHome(eng, e, s); break }
      if (d > CC.talkLeave || s.modeT > CC.talkT || w.exitT > CC.exitHold * 0.6) { refuse(eng, e, s); break }
      break
    }
    case 'lead': {
      e.state = 'wander'
      const L = s.lead!
      e.targetX = L.x; e.targetY = L.y
      if (d > CC.leadKeep) s.leadLose += dt; else s.leadLose = Math.max(0, s.leadLose - dt)
      if (s.leadLose > CC.leadLoseT || w.exitT > CC.exitHold) { refuse(eng, e, s); break }
      if (Math.hypot(L.x - e.x, L.y - e.y) < 1.0 || s.modeT > CC.leadMax) {
        w.passUntil = eng.time + CC.passFollow
        eng.msg(`看门人：${LINES.arrive}`, 'lore'); rel(eng, CC.rel.follow); cs.follows++
        setMode(s, 'wipe', 'wipeHands'); break
      }
      move(eng, e, s, CC.leadSpeed, dt)
      break
    }
    case 'chase': {
      e.state = 'chase'
      if (ignore) { goHome(eng, e, s); break }
      const sees = sameZ && eng.los(e.x, e.y, p.x, p.y)
      s.lostT = sees ? 0 : s.lostT + dt
      if (d > CC.loseR || s.lostT > CC.loseT) { goHome(eng, e, s); break }
      s.gaze = [p.x, 1.4, p.y]
      if (d < CC.tackleR + (s.rageT > 0 ? 0.3 : 0) && sees && s.graceT <= 0) { setMode(s, 'tackle', 'trip'); s.phase = 0; s.struggle = 0; face(e, p.x, p.y, 1, 99); break }
      // 看不见他、而且离得远 / 卡住了 → 眨眼贴到你身后
      if (!s.watched && (d > CC.chaseBlinkD || s.stuckT > 0.8)) {
        const b = behindPlayer(eng, 2.2, e)
        if (b) { s.stuckT = 0; startBlink(s, { ...b, f: Math.atan2(p.y - b.y, p.x - b.x) }, 'chase'); break }
      }
      e.targetX = p.x; e.targetY = p.y
      move(eng, e, s, s.rageT > 0 ? CC.rageRun : CC.run, dt)
      break
    }
    case 'tackle': {
      e.state = 'attack'
      // trip 片段：0–0.7 s 扑下去（0.35 s 扑中）→ 侧躺 → 2.3 s 起身 → 4.4 s 站好
      if (s.phase === 0 && s.modeT < CC.tackleHit) { e.targetX = p.x; e.targetY = p.y; move(eng, e, s, 3.5, dt) }
      if (s.phase === 0 && s.modeT >= CC.tackleHit) {
        if (d < CC.tackleR + 0.7 && sameZ && eng.los(e.x, e.y, p.x, p.y)) { s.phase = 1; s.struggle = 0; tackled(eng) }
        else { s.phase = 2 } // 扑空：照样摔一跤（逃跑窗口）
      }
      if (s.phase === 1) {
        if (s.struggle >= CC.tackleNeed && s.modeT < CC.tackleHit + CC.tackleWin) { escape(eng, e, s, '你一脚蹬开他，从他身下滚了出来！'); break }
        if (s.modeT >= CC.tackleHit + CC.tackleWin + 0.3) { startBind(eng, e, s); break }
      }
      if (s.phase === 2 && s.modeT >= CONCIERGE_CLIP_LEN.trip!) setMode(s, 'chase', 'run')
      break
    }
    case 'bind': {
      e.state = 'attack'
      s.struggle = Math.max(0, s.struggle - CC.bindDecay * dt)
      if (s.struggle >= CC.bindNeed) { escape(eng, e, s, '绳子一松——你挣脱出来了！快跑！'); cs.escapes++; rel(eng, CC.rel.escape); break }
      if (s.modeT >= CC.bindT) {
        cs.binds++
        s.lift = pickLift(eng, e)
        if (!s.lift) { escape(eng, e, s, '他四下看了看，好像找不到地方送你。绳结松开了。'); break }
        eng.msg(`看门人：${LINES.bound}`, 'lore')
        setMode(s, 'drag', 'drag')
      }
      break
    }
    case 'drag': {
      e.state = 'wander'
      const L = s.lift!
      const stand = { x: L.x + Math.cos(L.f) * 0.92, y: L.y + Math.sin(L.f) * 0.92 } // 他站在开口前 0.92 m、背对开口倒退过去
      e.targetX = stand.x; e.targetY = stand.y
      const dd = Math.hypot(stand.x - e.x, stand.y - e.y)
      if (dd < 0.35 || s.modeT > CC.dragMax) { if (s.modeT > CC.dragMax) { e.x = stand.x; e.y = stand.y } e.facing = L.f + Math.PI; s.phase = 0; setMode(s, 'stuff', 'stuffLift'); break }
      move(eng, e, s, CC.drag, dt)
      if (s.speed > 0) e.facing += Math.PI // Along the route, drag backward facing the player.
      if (s.stuckT > 1.5) { e.x = stand.x; e.y = stand.y; s.stuckT = 0 }
      break
    }
    case 'stuff': {
      e.state = 'idle'
      const g = glob(eng)
      if (s.phase === 0 && s.modeT >= 2.75 && g.black <= 0 && !g.finished) { g.black = CC.blackDur; g.blackDur = CC.blackDur; g.ropeT = 0.6; g.finished = false; audio.hotelCreak?.(0.6) }
      if (s.phase === 0 && s.modeT >= CONCIERGE_CLIP_LEN.stuffLift!) { s.phase = 1; setMode(s, 'stuff', 'pullRope'); s.phase = 1 }
      else if (s.phase === 1 && s.modeT >= 2.8) setMode(s, 'wipe', 'wipeHands')
      break
    }
    case 'goMetal': {
      const M = s.metal
      if (!M || !eng.map!.items.some((it) => it.type === M.type && Math.hypot(it.x - M.x, it.y - M.y) < 0.2)) { s.metal = null; goHome(eng, e, s); break }
      e.targetX = M.x; e.targetY = M.y; s.gaze = [M.x, 0.1, M.y]
      if (Math.hypot(M.x - e.x, M.y - e.y) < 0.7) { face(e, M.x, M.y, 1, 99); setMode(s, 'gnaw', 'gnawMetal'); takeMetal(eng, M); if (d < 15) eng.msg(LINES.gnaw, 'lore'); cs.gnaws++; break }
      move(eng, e, s, s.clip === 'run' ? CC.run * 0.8 : CC.walk * 1.3, dt)
      if (s.stuckT > 2) { e.x = M.x - Math.cos(e.facing) * 0.5; e.y = M.y - Math.sin(e.facing) * 0.5; s.stuckT = 0 }
      break
    }
    case 'gnaw': {
      e.state = 'idle'
      const T = s.metal?.type === 'silverware' ? CC.gnawT.silverware : CC.gnawT.other
      if (Math.floor(s.modeT / 0.8) !== Math.floor((s.modeT - dt) / 0.8)) audio.conciergeGnaw?.(0.4)
      if (s.modeT >= T) { s.metal = null; setMode(s, 'wipe', 'wipeHands') }
      break
    }
    case 'wipe': {
      e.state = 'idle'
      if (s.modeT >= CONCIERGE_CLIP_LEN.wipeHands!) goHome(eng, e, s)
      break
    }
    case 'stagger': {
      e.state = 'stunned'
      if (s.modeT >= 2.2 + CC.escapeStagger) setMode(s, 'chase', 'run') // modeT 从 2.2 起（trip 的爬起段）
      break
    }
    case 'return': {
      e.state = 'wander'
      if (!D || !desk) { // 别的楼层：不被看着时眨眼离开
        if (!s.watched && s.modeT > 0.5) startBlink(s, { x: e.x, y: e.y, f: e.facing }, 'desk')
        else { e.targetX = e.x - Math.cos(e.facing) * 3; e.targetY = e.y - Math.sin(e.facing) * 3; if (s.clip !== 'walk') setMode(s, 'return', 'walk'); move(eng, e, s, CC.walk, dt) }
        break
      }
      const dd = Math.hypot(D.x - e.x, D.y - e.y)
      if (dd < 0.3) { e.x = D.x; e.y = D.y; e.facing = desk.f; s.phase = 0; setMode(s, 'desk', 'idle'); break }
      if (!s.watched && dd > 8 && s.modeT > 0.6) { startBlink(s, { x: D.x, y: D.y, f: desk.f }, 'desk'); break }
      e.targetX = D.x; e.targetY = D.y
      if (s.clip !== 'walk') setMode(s, 'return', 'walk')
      move(eng, e, s, CC.walk, dt)
      if (s.stuckT > 2 && !s.watched) startBlink(s, { x: D.x, y: D.y, f: desk.f }, 'desk')
      break
    }
  }
}
function towardPlayer(eng: Engine, e: Entity, r: number): { x: number; y: number } | null {
  const p = eng.player, a0 = Math.atan2(e.y - p.y, e.x - p.x)
  for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) for (const rr of [r, r + 1, r - 1]) {
    const x = p.x + Math.cos(a0 + da) * rr, y = p.y + Math.sin(a0 + da) * rr
    if (walkable(eng, x, y) && !playerWatching(eng, x, y) && eng.los(p.x, p.y, x, y)) return { x, y }
  }
  return behindPlayer(eng, Math.min(r, 6), e)
}
function goHome(eng: Engine, e: Entity, s: ConciergeEntState) { s.struggle = 0; s.lift = null; setMode(s, 'return', 'walk'); void eng; void e }
function startTalk(eng: Engine, e: Entity, s: ConciergeEntState) {
  const cs = conciergeSave(eng)
  setMode(s, 'talk', 'talk'); cs.talks++; meet(eng)
  eng.msg(`看门人：${LINES.talk}`, 'lore')
  eng.msg('（X 跟他走 · 走开 = 拒绝）', 'system')
  void e
}
function refuse(eng: Engine, e: Entity, s: ConciergeEntState) {
  const cs = conciergeSave(eng)
  eng.msg(`看门人：${LINES.refuse}`, 'lore'); cs.chases++; rel(eng, CC.rel.refuse)
  audio.conciergeHoof?.(0.6)
  setMode(s, 'chase', 'run'); s.lostT = 0; void e
}
function tackled(eng: Engine) {
  const p = eng.player
  if (!eng.dev.god) p.hp = Math.max(1, p.hp - CC.tackleDmg)
  eng.camShake = 1; audio.hurt(); eng.emit({ kind: 'damage' })
  eng.msg('他整个人扑了上来，把你压倒在地毯上！连按 交互 / 攻击 / 跳跃 / X 挣开！', 'damage')
}
function startBind(eng: Engine, e: Entity, s: ConciergeEntState) {
  s.struggle = 0; setMode(s, 'bind', 'bind')
  eng.msg('他跪在你身上，从腰间解下一卷绳子。连按挣脱！', 'damage'); void e
}
function escape(eng: Engine, e: Entity, s: ConciergeEntState, text: string) {
  s.struggle = 0; s.graceT = CC.escapeGrace; setMode(s, 'stagger', 'trip')
  s.modeT = 2.2 // 从 trip 的爬起段开始播（renderer 按 modeT 对齐）
  s.seq++
  const p = eng.player; p.crouching = false
  eng.msg(text, 'system')
  // 往他背后推开一点
  const a = Math.atan2(p.y - e.y, p.x - e.x), x = e.x + Math.cos(a) * 1.4, y = e.y + Math.sin(a) * 1.4
  if (canOccupy(eng.map!, x, y, PLAYER_RADIUS, { z: 0 })) { p.x = x; p.y = y }
}
/** 最近的送菜升降梯：1F 前台旁那台在 16 m 内就用它；否则找附近一面墙（墙里藏着的员工升降梯小门） */
function pickLift(eng: Engine, e: Entity): { x: number; y: number; f: number } | null {
  const dl = conciergeDeskLift(eng)
  if (dl && Math.hypot(dl.x - e.x, dl.y - e.y) < CC.deskLiftR) return dl
  const m = eng.map!
  let best: { x: number; y: number; f: number; d: number } | null = null
  const r1 = CC.liftSearch[1]
  for (let ty = Math.floor(e.y - r1); ty <= e.y + r1; ty++) for (let tx = Math.floor(e.x - r1); tx <= e.x + r1; tx++) {
    if (tx < 2 || ty < 2 || tx > m.w - 3 || ty > m.h - 3) continue
    const cx = tx + 0.5, cy = ty + 0.5, dd = Math.hypot(cx - e.x, cy - e.y)
    if (dd < CC.liftSearch[0] || dd > r1 || (best && dd >= best.d)) continue
    if (eng.entityWalkH(m, tx, ty, 0) === null) continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (eng.entityWalkH(m, tx + dx, ty + dy, 0) !== null) continue // 那一侧是墙
      const sx = cx - dx * 0.92, sy = cy - dy * 0.92 // 他站的位置（开口前 0.92 m）
      if (!walkable(eng, sx, sy) || !walkable(eng, cx - dx * 0.4, cy - dy * 0.4)) continue
      if (eng.entityWalkH(m, tx + dx + dy, ty + dy + dx, 0) !== null || eng.entityWalkH(m, tx + dx - dy, ty + dy - dx, 0) !== null) continue // 整面墙（不是墙角 / 门洞）
      best = { x: cx + dx * 0.5, y: cy + dy * 0.5, f: Math.atan2(-dy, -dx), d: dd }
    }
  }
  return best ? { x: best.x - Math.cos(best.f) * 0.0, y: best.y, f: best.f } : null
}
function metalNear(eng: Engine, e: Entity) {
  const m = eng.map!
  let best: (typeof m.items)[number] | null = null, bd = CC.metalR
  for (const it of m.items) {
    if (it.dropped === undefined || !CC.metal.includes(it.type)) continue
    const d = Math.hypot(it.x - e.x, it.y - e.y)
    if (d >= bd || Math.abs(floorHeight(m, it.x, it.y) - (e.z ?? 0)) > 1) continue
    if (d > 6 && !eng.los(e.x, e.y, it.x, it.y)) continue
    best = it; bd = d
  }
  return best
}
function takeMetal(eng: Engine, M: { x: number; y: number; type: string }) {
  const m = eng.map!, i = m.items.findIndex((it) => it.type === M.type && Math.hypot(it.x - M.x, it.y - M.y) < 0.2)
  if (i < 0) return
  const it = m.items[i]
  if ((it.count ?? 1) > 1) it.count = (it.count ?? 1) - 1; else m.items.splice(i, 1)
}

/** combat.killCheck 钩子：不可击杀；挨打 = 更快动手 */
export function conciergeKillGuard(eng: Engine, e: Entity): boolean {
  if (e.def.type !== 'concierge') return false
  const s = ensureConcierge(e)
  e.hp = e.def.hp; e.dead = false
  s.rageT = CC.rageT
  if (s.mode === 'desk' || s.mode === 'tea' || s.mode === 'track' || s.mode === 'talk' || s.mode === 'return' || s.mode === 'wipe' || s.mode === 'lead') {
    rel(eng, CC.rel.hit); conciergeSave(eng).chases++
    eng.msg('看门人慢慢转过头来。他四只眼睛同时眯了起来。', 'lore')
    setMode(s, 'chase', 'run'); s.lostT = 0
  }
  return true
}

// ---------- X ----------
function talkTarget(eng: Engine): Entity | null {
  const e = findConcierge(eng); if (!e?.cg || e.cg.mode !== 'talk') return null
  return Math.hypot(eng.player.x - e.x, eng.player.y - e.y) < CC.talkLeave ? e : null
}
function keyTarget(eng: Engine): Entity | null {
  const e = findConcierge(eng), s = e?.cg, p = eng.player
  if (!e || !s || (s.mode !== 'desk' && s.mode !== 'tea') || Math.hypot(p.x - e.x, p.y - e.y) > CC.deskKeyR + 0.9) return null
  return [p.equip.pockets, p.hotbar, p.backpack].some((a) => a.some((sl) => sl?.type === 'key437')) ? e : null
}
export function conciergeSpecial(eng: Engine): SpecialAction | null {
  if (eng.levelDef.id !== 5) return null
  if (talkTarget(eng)) return { id: 'concierge-follow', label: '跟他走', hint: '让看门人把你领回宴会厅（一段时间内他不再拦你）', hold: false }
  if (keyTarget(eng)) return { id: 'concierge-key', label: '交还 437 号钥匙', hint: '他一直在找这把钥匙', hold: false }
  return null
}
/** 按下 X（l5Hotel.updateHotel 之后调用；消费 specialPressed） */
export function conciergePress(eng: Engine): boolean {
  if (!eng.specialPressed || eng.levelDef.id !== 5) return false
  const t = talkTarget(eng)
  if (t) { eng.specialPressed = false; conciergeFollow(eng, t); return true }
  const k = keyTarget(eng)
  if (k) { eng.specialPressed = false; conciergeReturnKey(eng, k); return true }
  return false
}
export function conciergeFollow(eng: Engine, e: Entity) {
  const s = ensureConcierge(e), m = eng.map!
  const exits = m.exits.filter((x) => isTrueExit(x.def.kind))
  let best: { x: number; y: number; sc: number } | null = null
  for (let t = 0; t < 40; t++) {
    const a = (t / 40) * Math.PI * 2, r = rnd(CC.leadR[0], CC.leadR[1]), x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r
    if (!walkable(eng, x, y)) continue
    const sc = exits.reduce((acc, q) => Math.min(acc, Math.hypot(q.x - x, q.y - y)), 60) + (eng.los(e.x, e.y, x, y) ? 10 : 0)
    if (!best || sc > best.sc) best = { x, y, sc }
  }
  s.lead = best ?? { x: e.x, y: e.y }; s.leadLose = 0
  setMode(s, 'lead', 'walk')
  eng.msg(`看门人：${LINES.follow}`, 'lore')
}
export function conciergeReturnKey(eng: Engine, e: Entity) {
  const p = eng.player, s = ensureConcierge(e), cs = conciergeSave(eng), w = world(eng)
  for (const a of [p.equip.pockets, p.hotbar, p.backpack]) for (let i = 0; i < a.length; i++) if (a[i]?.type === 'key437') { a[i] = null; break }
  eng.syncPassives?.()
  cs.key437 = 1; rel(eng, CC.rel.key); meet(eng)
  w.passUntil = Math.max(w.passUntil, eng.time + CC.passKey)
  s.phase = 2; setMode(s, s.mode === 'tea' ? 'tea' : 'desk', 'giveKey', true); s.mode = 'desk'; s.phase = 2
  eng.msg(`看门人：${LINES.key}`, 'lore'); audio.uiTick()
}
/** [bellhop] 行李员的恼怒铃：看门人（不在茶歇 / 没在抓人时）眨眼到铃声附近站一会儿（擦手），然后回岗 / 离开 */
export function conciergeHearBell(eng: Engine, x: number, y: number): Entity | null {
  if (eng.levelDef.id !== 5 || !eng.map?.inf || conciergeOnTea(eng) || conciergeCaptured(eng) || eng.dev?.frozenAI) return null
  let sp: { x: number; y: number } | null = null
  for (let t = 0; t < 24 && !sp; t++) { const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 2.5, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (walkable(eng, px, py) && !playerWatching(eng, px, py)) sp = { x: px, y: py } }
  if (!sp) return null
  const f = Math.atan2(y - sp.y, x - sp.x)
  let e = findConcierge(eng)
  if (!e) { e = spawnConcierge(eng, { ...sp, f }, 'wipe'); if (e) setMode(ensureConcierge(e), 'wipe', 'wipeHands'); return e }
  const s = ensureConcierge(e)
  if (s.mode === 'desk' || s.mode === 'return' || s.mode === 'wipe' || s.mode === 'track') startBlink(s, { ...sp, f }, 'wipe')
  return e
}
/** 验收 / 调试：直接设茶歇、放行 */
export function conciergeDebug(eng: Engine) { return world(eng) }
export function conciergeGlobal(eng: Engine) { return glob(eng) }
