// [beast] 第五层的野兽（Entity 18「The Beast of Level 5」）阶段 3：机制。设计见 /workspace/work/beast/plan.md（ZAN 10-31 17:51 定稿：6 个待定全按推荐，好处池去掉「免死一次」「指出本层出口」）。
//   · 不可击杀、孤例、只在 L5（含 117 办公室口袋房间）。只处理本地玩家（不管联机）。
//   · 117 办公室：灯光同时闪烁浮出的木门 → 他坐在书桌后（seatedIdle）。你进门：起身招手（beckon）、说话（talk，只用字幕）；走到书桌前按 X「谈生意」：
//     第一次先倒茶推杯（pourTea）→ 契约界面（BeastDeal）：三份契约选一份（好处池只有三项：关注度清零 / 理智回满且 10 分钟不降 / 一件稀有物品，
//     每份配一个限时任务作代价），推契约递笔（signContract）→ 握手（handshake，握点 = 你手的真实位置，AI 换算到他的 root 空间）即签。
//     可以「婉拒」（关注度 +10、他恼怒闪色 colorFlash）或「怀疑他」（doubtFreeze「你为何要怀疑我？」「哦。」「呃…？」→ colorFlash → reveal 真身 → tentacleGrab）。
//   · 任务（代价）：把「绅士的情书」交给行李员（对接 bellhopAI 情书彩蛋）/ 在酒店里连续 N 秒不奔跑 / 把一幅画像翻过去 / 请行李员喝一杯茶。限时，超时 = 违约。
//     隐藏代价：契约未了期间，他在你余光里出现的门槛失效、频率 ×1.6（「他会一直看着你」）。
//   · 余光：关注度 ≥ 50 或理智 < 40（或契约未了）时，L5 走廊里他会出现在你视线 35°–70° 的余光位置（peripheralStill，盯着你）；
//     被余光看见：理智 −3、关注度 +3；一转头正视（±17°）他就后退隐入暗处（vanish，beastVanishState 同步变暗 / 淡出 / 移除）。理智越低出现越频繁。
//   · 画像：关注度 ≥ 25 或契约未了时，L5 会看人的肖像换成他的脸（眼睛跟随）；盯着他的画像额外加关注度。办公室那幅是活的（portraitGaze，渲染层离屏渲染）。
//   · 惩罚（关注度满 100 / 怀疑他 / 违约 / 动手打他）：熄灯 → 他从背后用触腕缠住你（tentacleGrab，真身）→ 拖进 117 办公室强签一份苛刻契约
//     （二选一：交出一件物品 / 理智上限 −20）；第二次再犯（strikes ≥ deathAt）才死亡。在办公室里怀疑他 = 就地 reveal + 缠抓 → 强签。
//   · 存档（eng.hotel.beast）：违约 / 冒犯次数、已签契约、进行中的契约与计时、好处计时（理智锁）、理智上限扣减、待执行的惩罚。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { makeEntity } from '../entities'
import type { BeastClip } from '../renderer/beastAnim'
import { hotelAddAttn, saveBook, POCKET_LEVEL } from './l5Hotel'
import { casinoBeastDrag } from './casinoAI' // [casino]
import { bellhopSave } from './bellhopAI'
import type { SpecialAction } from './special'
import { audio } from '../core/audio'
import { floorHeight } from '../world/mapgen'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { isKeyItem, itemName } from '../content/items'
import { look } from '../renderer/shared'
import { resetMoveVelocity } from './moveTuning'
import { spokesVisitGrip, spokesWarmHint } from './spokesAI' // [spokes]
import { chefBeastHandoff } from './chefAI' // [chef]

// ---------- 调参表（单位：米 / 秒 / 点）---------- ZAN 可直接改这里
export const BE = {
  // —— 余光 ——
  periAttn: 50, periSan: 40, // 门槛：关注度 ≥ 50 或 理智 < 40（契约未了时门槛失效）
  periEvery: [45, 90] as const, // 两次余光出现的基础间隔（秒）
  periSanK: 1.5, // 理智越低越频繁：频率 × (1 + periSanK × (periSan − 理智) / periSan)
  periAttnK: 0.5, // 关注度 ≥ 75 再 × (1 + 0.5)
  periContractK: 1.6, // 契约未了：频率 ×1.6（隐藏代价）
  periCone: [0.61, 1.22] as const, // 出现在视线 35°–70°（rad）
  periR: [6, 14] as const, // 距离
  directCone: 0.3, // 正视判定 ±17°：一看过去就 vanish
  seenCone: 0.95, // 余光「看见」判定（视线 ±54° 内、有视线）
  seenDelay: 0.25, // 余光里停留这么久算「看见」
  seenSan: 3, seenAttn: 3, // 每次被余光看见
  periLife: 12, // 最长停留（秒）；到点若在视野里就 vanish，不在就悄悄消失
  periLost: 3, // 离开余光（> 1.4 rad 或被遮挡）这么久就悄悄消失
  periFirst: 20, // 进入 L5 地图后至少多久才会第一次出现
  // —— 画像 ——
  portraitAttn: 25, portraitStareAttn: 1.5, // 关注度 ≥ 25 换脸；盯他的画像每秒额外 +1.5
  // —— 办公室 ——
  greetR: 6.5, dealR: 2.8, // 进门多远起身招手 / 多近可以谈生意
  declineSanity: 8,
  declineAttn: 10, // 婉拒：关注度 +10
  shakeReach: 0.48, // 握点最远（root +Z，米）：再远右臂伸直也够不到（IK 实测 0.5 m 起残差 > 5 cm）
  shakeGrip: 1.3, // 握手片段里握住的时刻（= beastAnim handshake 1.3 s）→ 契约生效
  // —— 契约 ——
  maxActive: 1, // 同时最多一份未了的契约（未了时他不再给新的）
  boonFearless: 600, // 理智回满且 10 分钟不降
  rare: ['nightvision', 'traumakit', 'royalration', 'luckymilk', 'xenonmarble', 'rabbit'] as const, // 稀有物品池（与 118 大堂礼物同级）
  task: {
    letter: { limit: 900 }, // 把「绅士的情书」交给行李员（15 分钟）
    still: { limit: 720, need: 240 }, // 12 分钟内，在酒店里连续 4 分钟不奔跑
    flip: { limit: 600 }, // 10 分钟内把一幅会看人的画像翻过去
    tea: { limit: 900 }, // 15 分钟内请行李员喝一杯茶
  },
  remind: 60, // 剩 60 s 时远处叩桌提醒
  // —— 惩罚 ——
  deathAt: 2, // 第几次冒犯（关注度满 / 怀疑 / 违约 / 动手）直接死亡；之前每次都是强签苛刻契约
  blackLen: 1.2, // 熄灯多久后缠抓
  behindR: 1.45, // 他出现在你身后多远
  grabHold: 1.3, // tentacleGrab 片段里缠住的时刻
  harshSanCut: 20, sanCutMax: 40, // 苛刻契约：理智上限 −20（累计最多 −40）
  afterAttn: 60, // 强签之后关注度落到 60
  pendingDelay: 20, // 在别的层违约：回到 L5 后多久执行惩罚
  attnFullCd: 30, // 两次「关注度满」惩罚的最短间隔（秒）
  tipDelay: 4, // [spokes] 迎宾女郎 / 她的兔子汇报你的位置之后：多久他出现在余光里（无视门槛，一次）
}
export type BeastBoon = 'calm' | 'fearless' | 'rare'
export type BeastTask = keyof typeof BE.task
export type BeastHarsh = 'item' | 'mind'
export const BOON_TEXT: Record<BeastBoon, { title: string; text: string }> = {
  calm: { title: '一次宽恕', text: '酒店对你的关注，一笔勾销。' },
  fearless: { title: '再也不会感到恐惧', text: '理智回满，此后十分钟不会再下降。' },
  rare: { title: '一件小礼物', text: '从我的收藏里挑一样给你。' },
}
export const TASK_TEXT: Record<BeastTask, (m: number) => string> = {
  letter: (m) => `把这封信交给走廊尽头的行李员。${m} 分钟内。`,
  still: (m) => `在酒店里安安静静地待满 ${Math.round(BE.task.still.need / 60)} 分钟，不许奔跑。${m} 分钟内。`,
  flip: (m) => `把一幅一直在看你的画像翻过去，面朝墙。${m} 分钟内。`,
  tea: (m) => `请行李员喝一杯茶。他喜欢有人请他。${m} 分钟内。`,
}
export const HARSH_TEXT: Record<BeastHarsh, { title: string; text: string }> = {
  item: { title: '抵押', text: '你身上的一件东西，归我。' },
  mind: { title: '一小块你', text: '理智上限永久 −20。' },
}
/** 片段时长（= renderer/beastAnim BEAST_CLIPS.dur，免得 AI 依赖渲染模块） */
export const BEAST_CLIP_LEN: Record<BeastClip, number> = { idle: 6, seatedIdle: 6, talk: 4, beckon: 2.6, handshake: 3.6, pourTea: 7, signContract: 6.4, peripheralStill: 4, vanish: 2.4, portraitGaze: 6, doubtFreeze: 4.4, reveal: 3.6, tentacleGrab: 3.6, colorFlash: 2.4 }
const LOOP = new Set<BeastClip>(['idle', 'seatedIdle', 'talk', 'peripheralStill', 'portraitGaze'])
/** 与 beastAnim beastVanishState 一致（AI 不依赖渲染模块）：t ≥ 2.4 s 结束 */
export const beastVanishDone = (t: number) => t >= BEAST_CLIP_LEN.vanish

// ---------- 存档（eng.hotel.beast，随局）----------
export interface BeastContract {
  id: number; boon: BeastBoon; task: BeastTask; item?: string
  limit: number; left: number // 剩余秒数（beast clock）
  prog: number // still 任务：连续不奔跑秒数
  base: number // 签约时的基数（tea：bellhop.n.tea；flip：本局翻画数）
  state: 'active' | 'done' | 'breach'
  reminded?: 1
}
export interface BeastSave {
  strikes: number // 冒犯次数（关注度满 / 怀疑 / 违约 / 动手）
  next: number // 下一份契约编号
  contracts: BeastContract[] // 签过的契约（含已完成 / 违约，保留最近 12 份）
  harsh: { clause: BeastHarsh; item?: string; t: number }[] // 签过的苛刻契约
  fearT: number // 理智锁剩余秒数
  sanCut: number // 理智上限扣减（0..sanCutMax）
  pending?: 1 // 在别的层违约：回到 L5 后执行惩罚
  officeOffense?: 'doubt' | 'hit' | 'breach'
  forced?: 1 // 被拖进办公室：一到就强签
  flips: number // 本局翻过的画像数（flip 任务）
  n: { visit: number; deal: number; decline: number; doubt: number; peri: number; seen: number; vanish: number; grab: number }
}
export function freshBeastSave(): BeastSave {
  return { strikes: 0, next: 1, contracts: [], harsh: [], fearT: 0, sanCut: 0, flips: 0, n: { visit: 0, deal: 0, decline: 0, doubt: 0, peri: 0, seen: 0, vanish: 0, grab: 0 } }
}
const BOONS: BeastBoon[] = ['calm', 'fearless', 'rare']
const TASKS = Object.keys(BE.task) as BeastTask[]
export function restoreBeastSave(raw: unknown): BeastSave {
  const f = freshBeastSave()
  if (!raw || typeof raw !== 'object') return f
  const r = raw as Partial<BeastSave>
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
  const n = (r.n ?? {}) as Partial<BeastSave['n']>
  const cs = Array.isArray(r.contracts) ? r.contracts.filter((c) => c && BOONS.includes(c.boon) && TASKS.includes(c.task)).slice(-12).map((c) => ({
    id: num(c.id), boon: c.boon, task: c.task, ...(typeof c.item === 'string' ? { item: c.item } : {}), limit: num(c.limit), left: num(c.left), prog: num(c.prog), base: num(c.base),
    state: (c.state === 'done' || c.state === 'breach' ? c.state : 'active') as BeastContract['state'], ...(c.reminded ? { reminded: 1 as const } : {}),
  })) : []
  return {
    strikes: Math.max(0, num(r.strikes)), next: Math.max(1, num(r.next, 1)), contracts: cs,
    harsh: Array.isArray(r.harsh) ? r.harsh.filter((h) => h && (h.clause === 'item' || h.clause === 'mind')).slice(-12) : [],
    fearT: Math.max(0, num(r.fearT)), sanCut: Math.max(0, Math.min(BE.sanCutMax, num(r.sanCut))), flips: Math.max(0, num(r.flips)),
    ...(r.pending ? { pending: 1 as const } : {}), ...(r.forced ? { forced: 1 as const } : {}),
    ...(r.officeOffense === 'doubt' || r.officeOffense === 'hit' || r.officeOffense === 'breach' ? { officeOffense: r.officeOffense } : {}),
    n: { visit: num(n.visit), deal: num(n.deal), decline: num(n.decline), doubt: num(n.doubt), peri: num(n.peri), seen: num(n.seen), vanish: num(n.vanish), grab: num(n.grab) },
  }
}
export function beastSave(eng: Engine): BeastSave { return ((eng.hotel as { beast?: BeastSave }).beast ??= freshBeastSave()) }
export const beastActive = (sv: BeastSave) => sv.contracts.filter((c) => c.state === 'active')

// ---------- 实体状态（不入存档）----------
export type BeastMode = 'peri' | 'vanish' | 'seat' | 'greet' | 'talk' | 'tea' | 'sign' | 'shake' | 'doubt' | 'flash' | 'reveal' | 'grab' | 'gone' | 'visit' | 'audience' // [spokes] visit：118 大堂里来拍迎宾女郎的肩 // [jazz] audience：坐在爵士乐队观众席后排看演出（终曲更难装）
export interface BeastEntState {
  mode: BeastMode; modeT: number
  clip: BeastClip; seq: number // 渲染层：clip / seq 变了就重播
  blend: number // 片段混合时长（起身 / 坐下用 0.8 s）
  /** 握点（root 空间，handshake）/ 缠抓点（root 空间，tentacleGrab）——AI 每帧按玩家真实位置给 */
  shakeP: [number, number, number] | null; grabP: [number, number, number] | null; grabR: number
  /** 注视目标（root 空间）：peripheralStill / talk 时头眼对着你 */
  lookP: [number, number, number] | null
  flash: number // 叠加恼怒闪色 0..1（渲染层 opts.flash）
  seenT: number; lostT: number; life: number; seen: boolean
  then?: BeastMode // 当前片段结束后转到哪
  pend?: { kind: 'sign'; i: number } | { kind: 'harsh'; clause: BeastHarsh }
  applied: boolean // 握手 / 缠抓的效果是否已结算
}
export function ensureBeast(e: Entity): BeastEntState {
  return (e.bst ??= { mode: 'seat', modeT: 0, clip: 'seatedIdle', seq: 0, blend: 0.2, shakeP: null, grabP: null, grabR: 0.16, lookP: null, flash: 0, seenT: 0, lostT: 0, life: 0, seen: false, applied: false })
}
export function findBeast(eng: Engine): Entity | null { return eng.map?.entities.find((e) => e.def.type === 'beast' && !e.dead) ?? null }
function setClip(s: BeastEntState, clip: BeastClip, blend = 0.2) { if (clip !== s.clip || !LOOP.has(clip)) s.seq++; s.clip = clip; s.blend = blend }
function setMode(s: BeastEntState, m: BeastMode, clip: BeastClip, blend = 0.2) { s.mode = m; s.modeT = 0; s.applied = false; setClip(s, clip, blend) }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const inL5 = (eng: Engine) => eng.levelDef.id === 5 && !!eng.map?.inf
const inOffice = (eng: Engine) => eng.levelDef.id === POCKET_LEVEL.beast
const walkable = (eng: Engine, x: number, y: number) => { const m = eng.map!; return x > 0.5 && y > 0.5 && x < m.w - 0.5 && y < m.h - 0.5 && eng.entityWalkH(m, Math.floor(x), Math.floor(y), 0) !== null && canOccupy(m, x, y, 0.3, { z: 0 }) }
/** 关注度（办公室里 hotelAddAttn 不生效：直接改存档值，不触发换班倍率） */
function addAttn(eng: Engine, v: number) {
  if (inL5(eng)) { hotelAddAttn(eng, v); return }
  eng.hotel.attn = clamp(eng.hotel.attn + v, 0, 100)
}
function rel(eng: Engine, v: number) { const h = eng.hotel; h.staff.beast = clamp((h.staff.beast ?? 0) + v, -100, 100) }
function meet(eng: Engine) { const b = eng.hotelBook; if (!b.met.includes('beast')) { b.met.push('beast'); saveBook(b) } }

/** world 点 → 他的 root 空间（+Z = 他的正前方、+X = 他的左侧、+Y 上） */
export function beastToRoot(e: Entity, wx: number, wy: number, h: number): [number, number, number] {
  const dx = wx - e.x, dy = wy - e.y, c = Math.cos(e.facing), s = Math.sin(e.facing)
  return [dx * s - dy * c, h, dx * c + dy * s]
}
/** 玩家手（握手）在 root 空间：玩家身前 0.45 m、1.05 m 高；夹到他够得着的范围（越过书桌） */
export function beastShakePoint(eng: Engine, e: Entity): [number, number, number] {
  const p = eng.player
  const hx = p.x + Math.cos(p.facing) * 0.45, hy = p.y + Math.sin(p.facing) * 0.45
  const r = beastToRoot(e, hx, hy, 1.05 + (p.z - (e.z ?? 0)))
  // 两人之间取中点（隔着桌子，各伸一半），再夹到够得着的范围
  return [clamp(r[0] * 0.5 - 0.06, -0.3, 0.12), clamp(r[1], 0.95, 1.2), clamp(r[2] * 0.5, 0.32, BE.shakeReach)]
}
/** 缠抓点：玩家躯干（root 空间，1.2 m 高） */
export function beastGrabPoint(eng: Engine, e: Entity): [number, number, number] {
  const p = eng.player
  return beastToRoot(e, p.x, p.y, 1.2 + (p.z - (e.z ?? 0)))
}

// ---------- 字幕 / HUD（运行时）----------
interface Sub { text: string; t: number }
interface BeastRt {
  subs: Sub[]
  periNext: number; periMap: unknown; mapT: number
  pun: { phase: 'black' | 'grab'; t: number; reason: string } | null
  deal: BeastDealView | null
  offers: BeastOffer[] | null // 这次来访的三份（同一次来访不重掷）
  officeMap: unknown; greeted: boolean; teaDone: boolean
  pendT: number; lastFull: number; clock: number
  stillLast: number
  tip: boolean // [spokes] 迎宾女郎汇报了你的位置：下一次余光无视门槛、提前出现
}
const RT = new WeakMap<Engine, BeastRt>()
function rt(eng: Engine): BeastRt {
  let r = RT.get(eng)
  if (!r) { r = { subs: [], periNext: -1, periMap: null, mapT: 0, pun: null, deal: null, offers: null, officeMap: null, greeted: false, teaDone: false, pendT: 0, lastFull: -1e9, clock: 0, stillLast: 0, tip: false }; RT.set(eng, r) }
  return r
}
export function beastDebug(eng: Engine) { return rt(eng) }
/** 他说的话：只用字幕（不入日志、不配音） */
export function beastSay(eng: Engine, text: string, dur = 3.2, clear = false) {
  const r = rt(eng)
  if (clear) r.subs.length = 0 // 状态变了（签约 / 握手 / 怀疑 / 熄灯）：旧台词作废，免得字幕落后于动作
  r.subs.push({ text, t: dur })
  if (r.subs.length > 3) r.subs.shift()
}
export interface BeastHudView { sub: string | null; veil: number; contract: string | null; fear: number | null }
export function beastHud(eng: Engine): BeastHudView {
  const r = RT.get(eng), sv = (eng.hotel as { beast?: BeastSave }).beast
  const sub = r?.subs[0]?.text ?? null
  let veil = 0
  if (r?.pun) veil = r.pun.phase === 'black' ? Math.min(0.94, r.pun.t / 0.25 * 0.94) : 0.9 + 0.06 * Math.sin(r.pun.t * 23)
  const c = sv ? beastActive(sv)[0] : undefined
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const contract = c ? `契约 No.${c.id}：${TASK_SHORT[c.task]}${c.task === 'still' ? `（${Math.floor(c.prog)}/${BE.task.still.need} s）` : ''} · 剩 ${mm(c.left)}` : null
  return { sub, veil, contract, fear: sv && sv.fearT > 0 ? sv.fearT : null }
}
const TASK_SHORT: Record<BeastTask, string> = { letter: '把情书交给行李员', still: '在酒店里不奔跑', flip: '翻过一幅画像', tea: '请行李员喝茶' }

// ---------- 交易 ----------
export interface BeastOffer { boon: BeastBoon; task: BeastTask; item?: string; limit: number; title: string; boonText: string; taskText: string }
export interface BeastDealView { forced: boolean; offers: BeastOffer[]; harsh: { clause: BeastHarsh; title: string; text: string; item?: string }[]; line: string; busy?: string }
export function beastDealView(eng: Engine): BeastDealView | null { return RT.get(eng)?.deal ?? null }
/** 可用的任务（情书：行李员还没收到、信没被别人送过） */
export function beastTasksAvail(eng: Engine): BeastTask[] {
  const bh = bellhopSave(eng)
  return TASKS.filter((t) => t !== 'letter' || !bh.loved)
}
/** 三份契约：好处池三项各一份，各配一个不同的任务 */
export function beastMakeOffers(eng: Engine): BeastOffer[] {
  const tasks = beastTasksAvail(eng).sort(() => Math.random() - 0.5)
  return BOONS.map((boon, i) => {
    const task = tasks[i % tasks.length]
    const limit = BE.task[task].limit
    const item = boon === 'rare' ? BE.rare[Math.floor(Math.random() * BE.rare.length)] : undefined
    return { boon, task, item, limit, title: BOON_TEXT[boon].title, boonText: boon === 'rare' && item ? `${BOON_TEXT.rare.text}——「${itemName(item)}」。` : BOON_TEXT[boon].text, taskText: TASK_TEXT[task](Math.round(limit / 60)) }
  })
}
function harshOptions(eng: Engine): BeastDealView['harsh'] {
  const it = harshItem(eng)
  const out: BeastDealView['harsh'] = []
  if (it) out.push({ clause: 'item', title: HARSH_TEXT.item.title, text: `${HARSH_TEXT.item.text}（「${itemName(it.type)}」）`, item: it.type })
  out.push({ clause: 'mind', title: HARSH_TEXT.mind.title, text: HARSH_TEXT.mind.text })
  return out
}
/** 苛刻契约要拿走的那件：快捷栏选中（非关键物品）优先，否则快捷栏 / 背包第一件非关键物品 */
function harshItem(eng: Engine): { arr: (import('../engine').InvSlot | null)[]; i: number; type: string } | null {
  const p = eng.player
  const ok = (sl: import('../engine').InvSlot | null) => !!sl && !isKeyItem(sl.type) && sl.type !== 'bagTag' && sl.type !== 'gentletter'
  if (ok(p.hotbar[p.selected])) return { arr: p.hotbar, i: p.selected, type: p.hotbar[p.selected]!.type }
  for (const arr of [p.hotbar, p.backpack]) for (let i = 0; i < arr.length; i++) if (ok(arr[i])) return { arr, i, type: arr[i]!.type }
  return null
}
function openDeal(eng: Engine, forced: boolean) {
  const r = rt(eng), sv = beastSave(eng)
  if (forced) r.deal = { forced: true, offers: [], harsh: harshOptions(eng), line: sv.strikes > 0 ? '你违约了。这一份，没有得挑。' : '这一份，没有得挑。' }
  else {
    if (beastActive(sv).length >= BE.maxActive) { beastSay(eng, '我们之间还有一份没了结的契约。先把它办完。', 3.4); return }
    r.offers ??= beastMakeOffers(eng)
    r.deal = { forced: false, offers: r.offers, harsh: [], line: '挑一份吧。我从不强人所难。' }
  }
  eng.emit({ kind: 'beastdeal' })
}
/** 界面：选第 i 份（推契约递笔 → 握手即签） */
export function beastChoose(eng: Engine, i: number): boolean {
  const r = rt(eng), e = findBeast(eng)
  if (!r.deal || r.deal.forced || !r.deal.offers[i] || !e) return false
  r.deal = null
  const s = ensureBeast(e)
  s.pend = { kind: 'sign', i }
  setMode(s, 'sign', 'signContract', 0.3)
  beastSay(eng, '签在这里。然后，我们握个手。', 3.6, true)
  return true
}
/** 界面：强签（二选一） */
export function beastForcedSign(eng: Engine, clause: BeastHarsh): boolean {
  const r = rt(eng), e = findBeast(eng)
  if (!r.deal?.forced || !r.deal.harsh.some((h) => h.clause === clause) || !e) return false
  r.deal = null
  const s = ensureBeast(e)
  s.pend = { kind: 'harsh', clause }
  setMode(s, 'sign', 'signContract', 0.5)
  beastSay(eng, '别紧张。笔在这里。', 3, true)
  return true
}
/** 界面：婉拒（理智 -8、关注度 +10，他恼怒闪一下色） */
export function beastDecline(eng: Engine): boolean {
  const r = rt(eng)
  if (!r.deal || r.deal.forced) return false
  r.deal = null
  const sv = beastSave(eng); sv.n.decline++
  eng.player.sanity = Math.max(0, eng.player.sanity - BE.declineSanity)
  eng.emit({ kind: 'sanityhit' })
  eng.msg('野兽的身影扭曲了一瞬。你的思绪一阵刺痛。（理智 −8）', 'damage')
  addAttn(eng, BE.declineAttn); rel(eng, -5)
  const e = findBeast(eng); if (e) ensureBeast(e).flash = 1
  beastSay(eng, '……可惜。', 2.2, true); beastSay(eng, '门在你身后。它不会一直在那儿。', 3.2)
  return true
}
/** 界面：怀疑他（「你为何要怀疑我？」「哦。」「呃…？」→ 恼怒 → 真身 → 缠抓 → 强签 / 第二次死亡） */
export function beastDoubt(eng: Engine): boolean {
  const r = rt(eng), e = findBeast(eng)
  if (!r.deal || r.deal.forced || !e) return false
  r.deal = null
  beastSave(eng).n.doubt++
  officeOffense(eng, e, 'doubt')
  return true
}
/** 界面关闭（Esc）：普通交易 = 当作「再想想」；强签界面不能关 */
export function beastCloseDeal(eng: Engine): boolean {
  const r = rt(eng)
  if (!r.deal) return true
  if (r.deal.forced) return false
  r.deal = null
  beastSay(eng, '慢慢想。我有的是时间——你没有。', 3)
  return true
}
function officeOffense(eng: Engine, e: Entity, why: NonNullable<BeastSave['officeOffense']>) {
  const s = ensureBeast(e)
  if (inOffice(eng)) {
    if (s.mode === 'doubt' || s.mode === 'flash' || s.mode === 'reveal' || s.mode === 'grab' || beastSave(eng).forced) return
    beastSave(eng).officeOffense = why
    rt(eng).deal = null
  }
  s.pend = undefined
  if (why === 'doubt' || why === 'hit') {
    setMode(s, 'doubt', 'doubtFreeze', 0.25); s.then = 'flash'
    beastSay(eng, '你为何要怀疑我？', 1.6, true); beastSay(eng, '哦。', 1.2); beastSay(eng, '呃…？', 1.8)
  } else { setMode(s, 'reveal', 'reveal', 0.3); s.then = 'grab'; beastSay(eng, '你违约了。', 2.4, true) }
}

/** 好处结算（握手握住的瞬间） */
export function beastApplyBoon(eng: Engine, o: BeastOffer) {
  const p = eng.player, sv = beastSave(eng)
  if (o.boon === 'calm') { eng.hotel.attn = 0; eng.msg('契约生效：酒店对你的关注，一笔勾销。', 'system') }
  else if (o.boon === 'fearless') { p.sanity = beastSanMax(eng); sv.fearT = BE.boonFearless; eng.msg('契约生效：你再也不会感到恐惧。（理智回满，10 分钟内不会下降）', 'system') }
  else if (o.item) {
    if (eng.addItem(o.item)) eng.msg(`契约生效：他把「${itemName(o.item)}」推到你面前。`, 'loot')
    else { eng.map?.items.push({ id: Math.random(), type: o.item, count: 1, x: p.x, y: p.y }); eng.msg(`背包满了。「${itemName(o.item)}」放在了你脚边。`, 'system') }
  }
}
function startContract(eng: Engine, o: BeastOffer) {
  const sv = beastSave(eng), bh = bellhopSave(eng)
  const c: BeastContract = { id: sv.next++, boon: o.boon, task: o.task, ...(o.item ? { item: o.item } : {}), limit: o.limit, left: o.limit, prog: 0, base: o.task === 'tea' ? bh.n.tea : o.task === 'flip' ? sv.flips : 0, state: 'active' }
  sv.contracts.push(c); while (sv.contracts.length > 12) sv.contracts.shift()
  sv.n.deal++; rel(eng, 6)
  if (o.task === 'letter') { // 把情书交给你（行李房里那封就此被取走）
    const has = [eng.player.hotbar, eng.player.backpack].some((a) => a.some((sl) => sl?.type === 'gentletter'))
    if (!has) { bh.letter = 1; if (!eng.addItem('gentletter')) eng.map?.items.push({ id: Math.random(), type: 'gentletter', count: 1, x: eng.player.x, y: eng.player.y }) }
  }
  eng.msg(`契约 No.${c.id}：${TASK_TEXT[o.task](Math.round(o.limit / 60))}`, 'system')
  return c
}
function applyHarsh(eng: Engine, clause: BeastHarsh) {
  const sv = beastSave(eng), p = eng.player
  let item: string | undefined
  if (clause === 'item') {
    const it = harshItem(eng)
    if (it) { item = it.type; const sl = it.arr[it.i]!; if ((sl.count ?? 1) > 1) sl.count--; else it.arr[it.i] = null; eng.syncPassives?.(); eng.msg(`苛刻契约：「${itemName(item)}」归他了。`, 'damage') }
    else clause = 'mind'
  }
  if (clause === 'mind') { sv.sanCut = Math.min(BE.sanCutMax, sv.sanCut + BE.harshSanCut); p.sanity = Math.min(p.sanity, beastSanMax(eng)); eng.msg(`苛刻契约：你的理智上限永久 −${BE.harshSanCut}（现为 ${beastSanMax(eng)}）。`, 'damage') }
  sv.harsh.push({ clause, ...(item ? { item } : {}), t: Date.now() }); while (sv.harsh.length > 12) sv.harsh.shift()
  delete sv.forced
  eng.hotel.attn = Math.min(eng.hotel.attn, BE.afterAttn)
}
export const beastSanMax = (eng: Engine) => 100 - ((eng.hotel as { beast?: BeastSave }).beast?.sanCut ?? 0)

// ---------- 任务进度（每帧；任何层级都走 beast clock）----------
/** l5Hotel 翻画像时调用 */
export function beastNoteFlip(eng: Engine) { beastSave(eng).flips++ }
function stepContracts(eng: Engine, dt: number) {
  const sv = beastSave(eng), bh = bellhopSave(eng)
  for (const c of sv.contracts) {
    if (c.state !== 'active') continue
    // 完成判定
    let done = false
    if (c.task === 'letter') done = !!bh.loved
    else if (c.task === 'tea') done = bh.n.tea > c.base
    else if (c.task === 'flip') done = sv.flips > c.base
    else if (c.task === 'still') {
      if (inL5(eng)) {
        const sprinting = !!eng.input.sprint && eng.mv.sprintK > 0.5 && eng.mv.speed > 4
        c.prog = sprinting ? 0 : c.prog + dt
      }
      done = c.prog >= BE.task.still.need
    }
    if (done) { c.state = 'done'; rel(eng, 8); eng.msg(`契约 No.${c.id} 已履行。远处有人满意地合上了一本账簿。`, 'lore'); if (inL5(eng) || inOffice(eng)) beastSay(eng, '很好。我就知道你守信用。', 3); continue }
    c.left -= dt
    if (c.left <= BE.remind && !c.reminded) { c.reminded = 1; eng.msg('不知道哪里，有人用指节轻轻叩了三下桌面。', 'lore') }
    if (c.left <= 0) beastBreach(eng, c)
  }
}
/** 违约：L5 里立刻熄灯缠抓；在办公室里就地翻脸；在别的层，回到 L5 后执行 */
export function beastBreach(eng: Engine, c: BeastContract) {
  const sv = beastSave(eng)
  c.state = 'breach'; c.left = 0; rel(eng, -20)
  eng.msg(`契约 No.${c.id} 到期了。你没有做到。`, 'damage')
  beastPunish(eng, 'breach')
  void sv
}
/** 惩罚入口（关注度满 / 违约 / 怀疑 / 动手）：返回 true = 已接管 */
export function beastPunish(eng: Engine, reason: string): boolean {
  const r = rt(eng), sv = beastSave(eng)
  if (r.pun) return true
  if (inOffice(eng)) { const e = findBeast(eng); if (e) { officeOffense(eng, e, reason === 'breach' ? 'breach' : 'doubt'); return true } }
  if (!inL5(eng) || eng.over) { sv.pending = 1; return false }
  r.pun = { phase: 'black', t: 0, reason }
  r.deal = null
  audio.hotelScratch?.(1); audio.whisper?.(0.8)
  eng.msg('所有的灯在同一瞬间熄灭了。', 'lore')
  return true
}
/** l5Hotel.hotelAddAttn：关注度满 → 野兽现身（取代旧的全屏注视）。返回 false = 退回旧的注视 */
export function beastAttnFull(eng: Engine): boolean {
  const r = rt(eng)
  if (r.pun) return true
  if (!inL5(eng) || eng.dev?.frozenAI || r.clock - r.lastFull < BE.attnFullCd) return false
  r.lastFull = r.clock
  eng.hotelBook.gazes++; saveBook(eng.hotelBook)
  return beastPunish(eng, 'attn')
}
function strike(eng: Engine, why: string): boolean {
  const sv = beastSave(eng)
  sv.strikes++; sv.n.grab++
  if (sv.strikes >= BE.deathAt && why === 'attn' && casinoBeastDrag(eng)) return false // [casino] 关注度第二次满：不再死亡 → 拖进 Level 5.1（紫筹码 −50）
  if (sv.strikes >= BE.deathAt) {
    beastSay(eng, '第二次了。我从不强人所难——但我也从不重复自己。', 4)
    if (!eng.dev?.god) eng.die(why === 'attn' ? '被第五层的野兽拖进了黑暗里' : '和第五层的野兽做了交易，又违背了它')
    return false
  }
  return true
}

// ---------- 世界步进（l5Hotel.updateHotel 开头调用：任何层级）----------
export function stepBeastGlobal(eng: Engine, dt: number) {
  const r = rt(eng), sv = beastSave(eng), p = eng.player
  r.clock += dt
  if (r.subs.length) { r.subs[0].t -= dt; if (r.subs[0].t <= 0) r.subs.shift() }
  // 理智锁 / 上限
  if (sv.fearT > 0) { sv.fearT = Math.max(0, sv.fearT - dt); p.sanity = Math.max(p.sanity, beastSanMax(eng)) ; if (sv.fearT === 0) eng.msg('那份「再也不会感到恐惧」的契约，到期了。', 'lore') }
  if (sv.sanCut > 0 && p.sanity > beastSanMax(eng)) p.sanity = beastSanMax(eng)
  if (eng.over) return
  stepContracts(eng, dt)
  if (inL5(eng)) {
    if (r.periMap !== eng.map) { r.periMap = eng.map; r.mapT = 0; r.periNext = -1; r.officeMap = null }
    r.mapT += dt
    if (sv.pending && !r.pun) { r.pendT += dt; if (r.pendT >= BE.pendingDelay) { r.pendT = 0; delete sv.pending; beastPunish(eng, 'breach') } }
    if (r.pun) stepPunish(eng, dt)
    else stepPeripheral(eng, dt)
  } else if (inOffice(eng)) stepOffice(eng)
}

// ---------- 余光 ----------
/** 门槛：关注度 ≥ 50 或 理智 < 40；契约未了时门槛失效 */
export function beastPeriGate(eng: Engine): boolean {
  const sv = beastSave(eng)
  return eng.hotel.attn >= BE.periAttn || eng.player.sanity < BE.periSan || beastActive(sv).length > 0
}
/** 每秒出现率（期望） */
export function beastPeriRate(eng: Engine): number {
  const sv = beastSave(eng), san = eng.player.sanity
  let k = 1
  if (san < BE.periSan) k *= 1 + BE.periSanK * (BE.periSan - san) / BE.periSan
  if (eng.hotel.attn >= 75) k *= 1 + BE.periAttnK
  if (beastActive(sv).length) k *= BE.periContractK
  return k / ((BE.periEvery[0] + BE.periEvery[1]) / 2)
}
function periNextGap(eng: Engine) { return rnd(BE.periEvery[0], BE.periEvery[1]) / (beastPeriRate(eng) * (BE.periEvery[0] + BE.periEvery[1]) / 2) }
function stepPeripheral(eng: Engine, dt: number) {
  const r = rt(eng)
  if (findBeast(eng)) return
  if (eng.dev?.frozenAI || eng.hotelVanishT > 0 || (!beastPeriGate(eng) && !r.tip)) { if (r.periNext >= 0) r.periNext = Math.max(r.periNext, r.mapT + 2); return }
  if (r.tip) { r.periNext = Math.min(r.periNext < 0 ? Infinity : r.periNext, r.mapT + BE.tipDelay) } // [spokes] 有人汇报了你的位置
  if (r.periNext < 0) r.periNext = Math.max(BE.periFirst, r.mapT + periNextGap(eng))
  if (r.mapT < r.periNext) return
  const e = beastSpawnPeripheral(eng)
  if (e) r.tip = false
  r.periNext = r.mapT + (e ? periNextGap(eng) : 2)
  void dt
}
/** 余光位置：视线左右 35°–70°、6–14 m、可站、有视线 */
export function beastPeriSpot(eng: Engine): { x: number; y: number } | null {
  const p = eng.player
  for (let k = 0; k < 40; k++) {
    const side = Math.random() < 0.5 ? -1 : 1
    const a = p.facing + side * rnd(BE.periCone[0], BE.periCone[1]), d = rnd(BE.periR[0], BE.periR[1])
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d
    if (!walkable(eng, x, y) || !eng.los(p.x, p.y, x, y)) continue
    if (Math.abs(floorHeight(eng.map!, x, y) - p.z) > 1) continue
    return { x, y }
  }
  return null
}
export function beastSpawnPeripheral(eng: Engine, at?: { x: number; y: number }): Entity | null {
  const m = eng.map; if (!m || findBeast(eng)) return null
  const pos = at ?? beastPeriSpot(eng); if (!pos) return null
  const e = makeEntity('beast', pos.x, pos.y, floorHeight(m, pos.x, pos.y))
  e.facing = Math.atan2(eng.player.y - pos.y, eng.player.x - pos.x); e.state = 'idle'
  const s = ensureBeast(e)
  setMode(s, 'peri', 'peripheralStill', 0)
  m.entities.push(e)
  beastSave(eng).n.peri++
  return e
}
function removeBeast(eng: Engine, e: Entity) { const m = eng.map; if (m) m.entities = m.entities.filter((x) => x !== e) }
/** 玩家视线与他的夹角（rad），以及有无遮挡 */
export function beastOffAxis(eng: Engine, e: Entity): { a: number; los: boolean; d: number } {
  const p = eng.player, d = Math.hypot(e.x - p.x, e.y - p.y)
  return { a: Math.abs(wrap(Math.atan2(e.y - p.y, e.x - p.x) - p.facing)), los: eng.los(p.x, p.y, e.x, e.y), d }
}

// ---------- 惩罚：熄灯 → 背后缠抓 → 拖进办公室 ----------
function stepPunish(eng: Engine, dt: number) {
  const r = rt(eng), P = r.pun!, p = eng.player
  P.t += dt
  if (P.phase === 'black') {
    eng.hotelLightMul = Math.min(eng.hotelLightMul, 0.04)
    p.flashlight = false
    if (P.t >= BE.blackLen) {
      // 他出现在你身后
      let e = findBeast(eng)
      if (e) removeBeast(eng, e)
      const m = eng.map!
      let bx = p.x - Math.cos(p.facing) * BE.behindR, by = p.y - Math.sin(p.facing) * BE.behindR
      if (!walkable(eng, bx, by)) { bx = p.x - Math.cos(p.facing) * 0.9; by = p.y - Math.sin(p.facing) * 0.9 }
      e = makeEntity('beast', bx, by, floorHeight(m, bx, by))
      e.facing = Math.atan2(p.y - by, p.x - bx); e.state = 'idle'
      const s = ensureBeast(e); setMode(s, 'grab', 'tentacleGrab', 0)
      m.entities.push(e)
      P.phase = 'grab'; P.t = 0
      eng.camShake = Math.max(eng.camShake, 0.5)
      beastSay(eng, P.reason === 'attn' ? '你让整座酒店都在看着你。这对生意不好。' : '你违约了。', 3.2, true)
    }
    return
  }
  eng.hotelLightMul = Math.min(eng.hotelLightMul, 0.08)
  const e = findBeast(eng)
  if (!e) { r.pun = null; return }
  const s = ensureBeast(e)
  s.grabP = beastGrabPoint(eng, e)
  if (s.modeT >= BE.grabHold && !s.applied) {
    s.applied = true
    eng.camShake = Math.max(eng.camShake, 0.8); eng.emit({ kind: 'damage' })
    // 被缠住：转过去面对他
    look.yaw = -Math.atan2(e.y - p.y, e.x - p.x) - Math.PI / 2
    audio.whisper?.(1)
  }
  if (s.modeT >= BEAST_CLIP_LEN.tentacleGrab) {
    r.pun = null
    removeBeast(eng, e)
    if (P.reason === 'attn' && chefBeastHandoff(eng)) return // [chef] 关注度满：有时把「送来的人」交给厨师（醒在冷库，不记冒犯）
    if (!strike(eng, P.reason)) return
    beastDragToOffice(eng)
  }
}
/** 被拖进 117 办公室（口袋返程 = 原楼层原地图；到了就强签） */
export function beastDragToOffice(eng: Engine) {
  const m = eng.map, h = eng.hotel, sv = beastSave(eng)
  sv.forced = 1
  h.pocket = { kind: 'beast', floor: h.floor, mapSeed: eng.mapSeed }
  eng.hotelEventDoor = null
  eng.career.returnAnchor = { level: 5, x: eng.player.x + (m?.inf?.ox ?? 0), y: eng.player.y + (m?.inf?.oy ?? 0), yaw: look.yaw + Math.PI }
  eng.outpostReturn = 5
  const dest = POCKET_LEVEL.beast
  eng.transition = { anim: 'bloom', t: 0, dest }
  eng.emit({ kind: 'transition', anim: 'bloom', cutIn: 'outpost', dest })
  eng.msg('触腕把你从地上提起来，拖进了一扇你从没见过的门。', 'lore')
}
/** movement 钩子：被缠住 / 熄灯 / 签字握手时接管玩家 */
export function beastExitBlocked(eng: Engine): boolean {
  if (!inOffice(eng)) return false
  const sv = beastSave(eng)
  if (!sv.officeOffense && !sv.forced) return false
  eng.msg('门纹丝不动。野兽还有一笔账要与你结清。', 'lore')
  return true
}

export function beastControlsPlayer(eng: Engine): boolean {
  const r = RT.get(eng)
  if (!r) return false
  if (r.pun) {
    const p = eng.player; p.vz = 0
    if (r.pun.phase === 'grab') {
      const e = findBeast(eng), s = e?.bst
      if (e && s && s.modeT >= BE.grabHold) { // 被拖向他
        const k = Math.min(1, (s.modeT - BE.grabHold) / 1.2), tx = e.x + Math.cos(e.facing) * 0.75, ty = e.y + Math.sin(e.facing) * 0.75
        const nx = p.x + (tx - p.x) * k * 0.15, ny = p.y + (ty - p.y) * k * 0.15
        if (canOccupy(eng.map!, nx, ny, PLAYER_RADIUS * 0.6, { z: p.z })) { p.x = nx; p.y = ny }
      }
    }
    resetMoveVelocity(eng.mv)
    return true
  }
  if (inOffice(eng)) { const e = findBeast(eng), s = e?.bst; if (s && (s.mode === 'grab' || s.mode === 'reveal')) { if (s.mode === 'grab' && s.modeT >= BE.grabHold && e) { const p = eng.player, tx = e.x + Math.cos(e.facing) * 1.1, ty = e.y + Math.sin(e.facing) * 1.1; if (canOccupy(eng.map!, tx, ty, PLAYER_RADIUS * 0.6, { z: p.z })) { p.x += (tx - p.x) * 0.12; p.y += (ty - p.y) * 0.12 } } return true } }
  return false
}

// ---------- 117 办公室 ----------
/** 办公室座位（书桌后、椅子上；面朝门） */
export function beastOfficeSeat(eng: Engine): { x: number; y: number; f: number } | null {
  const m = eng.map; if (!m) return null
  const chair = m.structures.find((s) => s.kind === 'officechair' && s.data?.empty)
  const desk = m.structures.find((s) => s.kind === 'table' && s.data?.office)
  if (!chair) return null
  const door = m.exits[0]
  const cx = chair.x + 0.5, cy = chair.y + 0.5
  const f = door ? Math.atan2(door.y - cy, door.x - cx) : Math.PI / 2
  // 书桌近沿在他正前方 0.27 m（坐姿桌面道具在 root +Z 0.3–0.47 m）
  const dy = desk ? Math.max(cy, desk.y - 0.27) : cy
  return { x: cx, y: dy, f: Math.round(f / (Math.PI / 2)) * (Math.PI / 2) }
}
/** level.loadLevel(117) → hotelPocketArrive：他坐在书桌后 */
export function beastOfficeArrive(eng: Engine): Entity | null {
  const m = eng.map; if (!m) return null
  const r = rt(eng), sv = beastSave(eng)
  r.officeMap = m; r.greeted = false; r.teaDone = false; r.offers = null; r.deal = null; r.pun = null
  m.entities = m.entities.filter((x) => x.def.type !== 'beast')
  const seat = beastOfficeSeat(eng); if (!seat) return null
  const e = makeEntity('beast', seat.x, seat.y, floorHeight(m, seat.x, seat.y))
  e.facing = seat.f; e.state = 'idle'
  ensureBeast(e)
  m.entities.push(e)
  sv.n.visit++; meet(eng)
  if (sv.officeOffense) { r.greeted = true; officeOffense(eng, e, sv.officeOffense) }
  else if (sv.forced) { r.greeted = true; r.subs.length = 0; openDeal(eng, true) }
  return e
}
function stepOffice(eng: Engine) {
  const r = rt(eng), m = eng.map
  if (r.officeMap !== m) beastOfficeArrive(eng)
}

// ---------- 主更新（entityAI 分派）----------
export function updateBeast(eng: Engine, e: Entity, dt: number) {
  const s = ensureBeast(e), p = eng.player, r = rt(eng)
  if (e.presentationPending) return // 模型还没准备好：不计时、不算被看见
  s.modeT += dt; s.flash = Math.max(0, s.flash - dt / 1.2)
  if (e.hp < e.def.hp) beastKillGuard(eng, e)
  e.state = 'idle'
  s.lookP = beastToRoot(e, p.x, p.y, 1.55 + (p.z - (e.z ?? 0)))
  const len = BEAST_CLIP_LEN[s.clip]
  switch (s.mode) {
    // —— 余光 ——
    case 'peri': {
      const { a, los } = beastOffAxis(eng, e)
      e.facing = Math.atan2(p.y - e.y, p.x - e.x)
      s.life += dt
      if (los && a < BE.directCone) { setMode(s, 'vanish', 'vanish', 0.15); beastSave(eng).n.vanish++; return } // 正视：后退隐入暗处
      if (los && a < BE.seenCone) {
        s.seenT += dt; s.lostT = 0
        if (!s.seen && s.seenT >= BE.seenDelay) { s.seen = true; const sv = beastSave(eng); sv.n.seen++; p.sanity = Math.max(0, p.sanity - BE.seenSan); addAttn(eng, BE.seenAttn); eng.emit({ kind: 'sanityhit' }) }
      } else { s.lostT += dt; if (s.lostT >= BE.periLost) { removeBeast(eng, e); return } }
      if (s.life >= BE.periLife) { if (los && a < BE.seenCone) setMode(s, 'vanish', 'vanish', 0.2); else removeBeast(eng, e) }
      return
    }
    case 'vanish':
      if (beastVanishDone(s.modeT)) removeBeast(eng, e)
      return
    case 'visit': { // [spokes] 118 大堂：手搭在迎宾女郎的右肩上（handshake 片段，握点 = 她的肩），然后隐入暗处
      const g = spokesVisitGrip(eng, e)
      s.shakeP = g; s.lookP = g ? [g[0], g[1] + 0.2, g[2]] : s.lookP
      if (s.modeT >= 1.3 && !s.applied) { s.applied = true; beastSay(eng, '干得不错，亲爱的。', 2.6) }
      if (!g || s.modeT >= BEAST_CLIP_LEN.handshake) { s.shakeP = null; setMode(s, 'vanish', 'vanish', 0.3) }
      return
    }
    case 'audience': // [jazz] 爵士乐队观众席后排：站着看演出（idle），jazzAI 演完叫他走（beastLeaveAudience → vanish）
      if (s.clip !== 'idle') setClip(s, 'idle', 0.6)
      return
    case 'grab': // 惩罚缠抓（L5 由 stepPunish 收尾；办公室里由这里收尾）
      s.grabP = beastGrabPoint(eng, e)
      if (inOffice(eng) && s.modeT >= len && !s.applied) {
        s.applied = true
        const sv = beastSave(eng), reason = sv.officeOffense ?? 'doubt'
        delete sv.officeOffense
        if (!strike(eng, reason)) { setMode(s, 'gone', 'tentacleGrab', 0); s.applied = true; return }
        sv.forced = 1
        setMode(s, 'seat', 'seatedIdle', 0.9)
        openDeal(eng, true)
      }
      return
    case 'gone': return
    case 'doubt': if (s.modeT >= len) { setMode(s, 'flash', 'colorFlash', 0.2) } return
    case 'flash': if (s.modeT >= len) { setMode(s, 'reveal', 'reveal', 0.25); beastSay(eng, '……', 1.5) } return
    case 'reveal': if (s.modeT >= len) { setMode(s, 'grab', 'tentacleGrab', 0.2); s.grabP = beastGrabPoint(eng, e) } return
  }
  // —— 办公室待客 ——
  if (!inOffice(eng)) { removeBeast(eng, e); return }
  const d = Math.hypot(p.x - e.x, p.y - e.y)
  switch (s.mode) {
    case 'seat':
      if (!r.greeted && d < BE.greetR) { r.greeted = true; setMode(s, 'greet', 'beckon', 0.8); beastSay(eng, '啊，请进。快请进。', 2.6); beastSay(eng, '别站在门口——灯会一直闪的。', 3) }
      else if (s.clip !== 'seatedIdle') setClip(s, 'seatedIdle', 0.8)
      return
    case 'greet': if (s.modeT >= len) { setMode(s, 'talk', 'talk', 0.3); beastSay(eng, '我这里有几份契约。都很公道。', 3.4) } return
    case 'talk':
      if (d < BE.dealR || s.modeT > 12) { setMode(s, 'seat', 'seatedIdle', 0.8); if (d < BE.dealR) beastSay(eng, '坐——哦，这里没有给客人的椅子。站着也好。', 3.2) }
      return
    case 'tea': if (s.modeT >= len) { setMode(s, 'seat', 'seatedIdle', 0.3); r.teaDone = true; openDeal(eng, false) } return
    case 'sign': if (s.modeT >= len) { setMode(s, 'shake', 'handshake', 0.8); s.shakeP = beastShakePoint(eng, e) } return
    case 'shake':
      s.shakeP = beastShakePoint(eng, e)
      if (s.modeT >= BE.shakeGrip && !s.applied) {
        s.applied = true
        const pend = s.pend; s.pend = undefined
        if (pend?.kind === 'sign') { const o = r.offers?.[pend.i]; if (o) { beastApplyBoon(eng, o); startContract(eng, o); r.offers = null; beastSay(eng, '成交。', 1.6, true); beastSay(eng, '我会一直看着你的——这是服务的一部分。', 3.4) } }
        else if (pend?.kind === 'harsh') { applyHarsh(eng, pend.clause); beastSay(eng, '成交。下一次，就没有契约了。', 3.4, true) }
        audio.hotelChime?.(0.3)
      }
      if (s.modeT >= len) setMode(s, 'seat', 'seatedIdle', 0.8)
      return
  }
}

// ---------- 动手：不受伤，算「怀疑他」 ----------
export function beastKillGuard(eng: Engine, e: Entity): boolean {
  if (e.def.type !== 'beast') return false
  const s = ensureBeast(e)
  e.hp = e.def.hp; e.dead = false
  if (s.mode === 'doubt' || s.mode === 'flash' || s.mode === 'reveal' || s.mode === 'grab' || s.mode === 'vanish') return true
  if (s.mode === 'peri' || s.mode === 'visit') { setMode(s, 'vanish', 'vanish', 0.15); beastPunish(eng, 'doubt'); return true } // [spokes] 在大堂里打他：一样算怀疑（回到 L5 后执行）
  if (inOffice(eng) && beastSave(eng).forced) return true
  rt(eng).deal = null
  officeOffense(eng, e, 'hit')
  return true
}

// ---------- X 情境（办公室：谈生意）----------
function dealTarget(eng: Engine): Entity | null {
  if (!inOffice(eng) || beastSave(eng).forced) return null
  const e = findBeast(eng); if (!e?.bst) return null
  if (Math.hypot(eng.player.x - e.x, eng.player.y - e.y) > BE.dealR) return null
  const m = e.bst.mode
  return m === 'seat' || m === 'talk' || m === 'greet' ? e : null
}
export function beastSpecial(eng: Engine): SpecialAction | null {
  const e = dealTarget(eng); if (!e) return null
  const sv = beastSave(eng)
  if (beastActive(sv).length) return { id: 'beast-talk', label: '交谈', hint: '你们之间还有一份没了结的契约', hold: false }
  return { id: 'beast-deal', label: '谈生意', hint: '看看他的契约（握手即签）', hold: false }
}
export function beastPress(eng: Engine): boolean {
  if (!eng.specialPressed || !inOffice(eng)) return false
  const e = dealTarget(eng); if (!e) return false
  eng.specialPressed = false
  const s = ensureBeast(e), r = rt(eng)
  if (beastActive(beastSave(eng)).length) { openDeal(eng, false); return true }
  if (!r.teaDone) { setMode(s, 'tea', 'pourTea', 0.6); beastSay(eng, '请用茶。还是热的——它总是热的。', 3.4, true); return true }
  openDeal(eng, false)
  return true
}

/** 渲染层预热 LOD1 的提示：快到余光门槛（关注度 ≥ 40 或理智 < 50 或契约未了）——在他第一次出现之前把几何建好，别在吓人的那一刻卡一下 */
export function beastWarmHint(eng: Engine): boolean {
  if (inOffice(eng)) return true
  if (eng.levelDef.id === POCKET_LEVEL.lobby) return spokesWarmHint(eng) // [spokes] 大堂：他会来拍迎宾女郎的肩
  if (!inL5(eng)) return false
  return eng.hotel.attn >= BE.periAttn - 10 || eng.player.sanity < BE.periSan + 10 || beastActive(beastSave(eng)).length > 0
}
/** 画像换成他的脸（L5：关注度 ≥ 25 或契约未了；办公室那幅一直是他） */
export function beastPortraitActive(eng: Engine): boolean {
  if (inOffice(eng)) return true
  if (!inL5(eng)) return false
  return eng.hotel.attn >= BE.portraitAttn || beastActive(beastSave(eng)).length > 0
}
/** l5Hotel 肖像凝视：盯着他的画像额外加关注度 */
export function beastPortraitStare(eng: Engine, dt: number) { if (beastPortraitActive(eng) && inL5(eng)) hotelAddAttn(eng, BE.portraitStareAttn * dt) }

// ---------- [spokes] 迎宾女郎联动 ----------
/** 迎宾女郎 / 她的发条兔向他汇报了你的位置：下一次余光无视门槛、BE.tipDelay 秒后出现（一次） */
export function beastTip(eng: Engine) { rt(eng).tip = true }
export const beastTipped = (eng: Engine) => !!RT.get(eng)?.tip
/** 118 大堂：他站在迎宾女郎右后方，手搭上她的肩（mode 'visit'，handshake 片段）→ 隐入暗处 */
export function beastSpawnVisit(eng: Engine, x: number, y: number, f: number): Entity | null {
  const m = eng.map; if (!m || findBeast(eng)) return null
  const e = makeEntity('beast', x, y, floorHeight(m, x, y))
  e.facing = f; e.state = 'idle'
  const s = ensureBeast(e)
  setMode(s, 'visit', 'handshake', 0.3)
  m.entities.push(e)
  return e
}
// ---------- [jazz] 爵士脑联动 ----------
/** 演出时老板本人坐在观众席后排（mode 'audience'，idle 片段，看着台上 / 你）；已有野兽实体就不来 */
export function beastSpawnAudience(eng: Engine, x: number, y: number, f: number): Entity | null {
  const m = eng.map; if (!m || findBeast(eng)) return null
  const e = makeEntity('beast', x, y, floorHeight(m, x, y))
  e.facing = f; e.state = 'idle'
  const s = ensureBeast(e)
  setMode(s, 'audience', 'idle', 0.4)
  m.entities.push(e)
  return e
}
/** 演出结束：他隐入暗处 */
export function beastLeaveAudience(eng: Engine): boolean {
  const e = findBeast(eng); if (!e) return false
  const s = ensureBeast(e); if (s.mode !== 'audience') return false
  setMode(s, 'vanish', 'vanish', 0.3)
  return true
}
export const beastInAudience = (eng: Engine) => findBeast(eng)?.bst?.mode === 'audience'
