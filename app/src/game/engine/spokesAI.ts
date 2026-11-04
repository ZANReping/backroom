// [spokes] 迎宾女郎（Entity 28「The Spokeslady」）阶段 3：机制。方案 /workspace/work/spokes/plan.md（ZAN 11-01 定稿：机械兔终点随机 = 员工手里或餐厅；照片解放支线要做）。
//   · 位置：118 大堂前台 + 她的办公室（大堂北墙门洞后：书桌 / 皮椅 / 铭牌 / 收音机 / 北墙投递洞 A→L1、B→L11）。摆放见 content/spokesLayout。
//     日程（只在你在大堂时走）：前台迎宾（greetSpin / speakerTalk）→ 回办公室坐下（sitDesk / seatedIdle）→ 站着画海报（drawPoster）→ 丢进洞 A 或 B（dropPoster）
//     → 到前台南面的地毯上上发条放兔子（windRabbit）→ 回前台。
//   · 双字幕：上行 = 领口音箱的甜美推销（全是反话）；下行 = 斜体灰字的被困心声，一半是求救，一半是真线索——
//     线索按存档实际状态生成（你推开大堂门那一刻在 L5 拍下的快照：最近的出口 / 电梯方向与距离、最近的危险房间、员工位置、契约剩余时间、酒店关注度；餐厅食物的真相）。
//   · 发条兔：她放出来（大堂里跳向正门；L5 里迷路太久也会遇到一只），跳着引路。跟到底 → 终点随机：交给员工（看门人 / 管家 / 行李员之一）或带进餐厅。
//     中途停下或反向走 → 兔子停住回头（rabbitStop），关注度小涨；走太远太久它就停摆。可以抓住（X）或砸坏（攻击）：得到「发条零件」。
//   · 邀请参观：前台鞠躬伸手（bowInvite）→ 接受 = 她放一只走「危险路线」的兔子（关注度 +、经过危险房间、终点必是员工）；拒绝 = 她继续推销，心声说「做得好」。
//   · 照片解放支线（四步）：① 侦探照片（117 野兽办公室的地上 / 她办公室桌边）→ ② 给她看（photoRecall）：心声第一次清晰，给一次关键提示（出口方向 + 她的证件在哪）
//     → ③ 证件被看门人没收、交给了行李员代管：找到行李员「领回」→ ④ 在她的办公室（前台有人看着）、酒店关注度 < 40、老板不在时把证件还给她：
//     她认出自己，摘掉领口的音箱，走出大堂正门。奖励：幸运兔脚 + 以后 L5 里遇到的发条兔都把你带到最近的出口；代价：老板知道了（关注度 +20）。
//   · 不攻击玩家（打她 = 心声「再用力一点」+ 关注度）。关注度 ≥ 60 时她 / 她的兔子看见你 → 向老板「汇报」你的位置（beastAI.beastTip：下一次余光提前、无视门槛）。
//   · 老板偶尔来拍她的肩（野兽实体 mode 'visit'：handshake 片段的握点 = 她的右肩；她 shoulderTap），然后隐入暗处。
//   · 迎宾海报（物品）：L1 / L11 捡到，读了指向 L5；读过之后下一次在 L5 走廊里会浮出一扇「大堂」门（l5Hotel.hotelLobbyInvite）。
//   · 存档 eng.hotel.spokes：快照 / 照片支线进度 / 是否自由 / 是否读过海报 / 统计。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { makeEntity } from '../entities'
import type { SpecialAction } from './special'
import { hotelRegisterCard } from './l5Hotel' // [l5items] 房卡登记
import { hotelAddAttn, saveBook, POCKET_LEVEL, hotelLobbyInvite } from './l5Hotel'
import { beastSave, beastActive, beastTip, beastSpawnVisit, findBeast, beastToRoot } from './beastAI'
import { bellhopSave, findBellhop, spawnBellhop, bellhopRing } from './bellhopAI'
import { findMaid, spawnMaid, maidHear } from './maidAI'
import { conciergeIntercept, conciergeDesk } from './conciergeAI'
import { audio } from '../core/audio'
import { floorHeight } from '../world/mapgen'
import { l5RegionAt, L5_VARIANT_NAMES, type L5Variant } from '../world/infiniteL5'
import { SPOKES_LOBBY as LY, SPOKES_ROUTES, inSpokesOffice, type XY, type Spot } from '../content/spokesLayout'
import { itemName } from '../content/items'
import { look } from '../renderer/shared'
import { jazzNextShowText } from './jazzAI' // [jazz]
import { chefDiningSpot, chefIsService, chefRabbitDelivered } from './chefAI' // [chef]

// ---------- 调参表（单位：米 / 秒 / 点）---------- ZAN 可直接改这里
export const SK = {
  // —— 前台 ——
  greetR: 5.5, // 走近多远她转圈迎宾
  talkR: 9, // 多近听得见音箱（字幕）
  inviteR: 3.2, inviteCd: 50, // 多近、多久一次伸手邀请「参观」
  inviteAttn: 8, // 接受邀请：关注度 +8（之后兔子走危险路线）
  talkR2: 2.6, // X 搭话 / 递照片 / 还证件的距离
  hitAttn: 6, // 打她
  subPair: 4.6, // 一对字幕（推销 + 心声）显示多久
  clueEvery: 2, // 每几条心声里有一条是真线索
  // —— 日程（秒）——
  deskT: [35, 55] as const, seatT: [8, 14] as const, drawT: [10, 16] as const,
  walkSpeed: 0.82, // = spokesAnim walk.speed（铅笔裙小步）
  // —— 发条兔 ——
  rbSpeed: 1.1, rbNear: 1.6, // 跳行速度（m/s）；你跟得近时（< 3 m）跳快一点
  followR: 6.5, // 你离它多远之内算「在跟」
  stopIdle: 2.4, awayT: 0.9, // 你站着不动 2.4 s / 背着它走 0.9 s → 停下回头
  stopAttn: 2, stopCd: 8, // 停下回头：关注度 +2（冷却 8 s）
  lostR: 24, giveUp: 20, // 你在 24 m 外超过 20 s → 它停摆
  arriveR: 1.5, // 终点判定
  catchR: 1.5, catchAttn: 3, // 抓住：距离 / 关注度（她听得见）
  rabbitHp: 6,
  staffAttn: 10, diningAttn: 12, diningHunger: 15, // 终点代价
  dangerDetour: 45, // 危险路线：先绕到这个半径内的危险房间
  wildAfter: 300, wildEvery: [240, 420] as const, wildR: [4, 8] as const, wildWait: 40, // L5 里迷路太久遇到一只
  spentLife: 60, // 停摆的兔子留多久
  // —— 终点权重（随机：员工 / 餐厅）——
  dest: { concierge: 1, maid: 1, bellhop: 1, dining: 1.5 },
  // —— 汇报老板 ——
  reportAttn: 60, reportCd: 90,
  // —— 老板拍肩 ——
  tapEvery: [70, 140] as const, tapR: 14,
  // —— 照片支线 ——
  freeAttnMax: 40, freeCost: 20, freeGift: 'rabbit',
  // —— 海报 ——
  posterDoor: [45, 90] as const, // 读过海报：回到 L5 后多久浮出大堂门
}
/** 片段时长（= renderer/spokesAnim SPOKES_CLIPS.dur；AI 不依赖渲染模块）。check:spokes 对照 */
export const SPOKES_CLIP_LEN = { idle: 6, greetSpin: 4.6, bowInvite: 4.2, speakerTalk: 5, innerFreeze: 5, drawPoster: 6, dropPoster: 5, windRabbit: 7, walk: 1.1, guidePoint: 2.2, sitDesk: 4.6, seatedIdle: 6, shoulderTap: 4.2, photoRecall: 7.4 } as const
export type SpokesClipId = keyof typeof SPOKES_CLIP_LEN
const LOOP = new Set<SpokesClipId>(['idle', 'drawPoster', 'walk', 'guidePoint', 'seatedIdle'])
/** windRabbit：4.8 s 松手、片段末兔子在 root [−0.17, 0, 0.36 + 0.36 × 2.2] */
export const WIND_RELEASE = 4.8, WIND_END_Z = 0.36 + 0.36 * (7 - 4.8), WIND_X = -0.17
/** 发条兔片段（= spokesAnim WINDUP_CLIPS） */
export const WINDUP_LEN = { rabbitHop: 0.42, rabbitStop: 2.4 } as const, WINDUP_ANIM_SPEED = 0.36

// ---------- 存档（eng.hotel.spokes，随局）----------
export type SpokesDest = 'concierge' | 'maid' | 'bellhop' | 'dining' | 'exit'
export interface SpokesSnap {
  ax: number; ay: number; f: number // 返回点（绝对坐标）与出门后的朝向
  exit?: { wx: number; wy: number; name: string }
  danger?: { wx: number; wy: number; v: L5Variant }
  maid?: { wx: number; wy: number }
  bellhop?: { wx: number; wy: number }
  desk?: { wx: number; wy: number }
  attn: number; floor: number
}
export interface SpokesSave {
  photo: number // 支线：0 没给过照片 / 1 给她看过（证件已交给行李员）/ 2 拿到了证件 / 3 自由了
  freed?: 1
  poster?: 1 // 读过海报，L5 大堂门邀请待生效
  posterDone?: 1
  snap?: SpokesSnap
  freeCostDue?: 1 // 她走了：下次进 L5 关注度 +20
  n: { visit: number; invite: number; accept: number; decline: number; rabbit: number; follow: number; stop: number; caught: number; broken: number; report: number; tap: number; photo: number; poster: number }
}
export function freshSpokesSave(): SpokesSave { return { photo: 0, n: { visit: 0, invite: 0, accept: 0, decline: 0, rabbit: 0, follow: 0, stop: 0, caught: 0, broken: 0, report: 0, tap: 0, photo: 0, poster: 0 } } }
export function restoreSpokesSave(raw: unknown): SpokesSave {
  const f = freshSpokesSave()
  if (!raw || typeof raw !== 'object') return f
  const r = raw as Partial<SpokesSave>
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
  const n = (r.n ?? {}) as Partial<SpokesSave['n']>
  const sn = r.snap && typeof r.snap === 'object' ? r.snap : undefined
  const pt = (o: unknown) => (o && typeof o === 'object' && Number.isFinite(Number((o as XYW).wx)) && Number.isFinite(Number((o as XYW).wy)) ? { wx: Number((o as XYW).wx), wy: Number((o as XYW).wy) } : undefined)
  type XYW = { wx: number; wy: number }
  const snap: SpokesSnap | undefined = sn ? {
    ax: num(sn.ax), ay: num(sn.ay), f: num(sn.f), attn: num(sn.attn), floor: num(sn.floor, 1),
    ...(pt(sn.exit) ? { exit: { ...pt(sn.exit)!, name: typeof sn.exit?.name === 'string' ? sn.exit.name : '出口' } } : {}),
    ...(pt(sn.danger) && sn.danger?.v && sn.danger.v in L5_VARIANT_NAMES ? { danger: { ...pt(sn.danger)!, v: sn.danger.v } } : {}),
    ...(pt(sn.maid) ? { maid: pt(sn.maid)! } : {}), ...(pt(sn.bellhop) ? { bellhop: pt(sn.bellhop)! } : {}), ...(pt(sn.desk) ? { desk: pt(sn.desk)! } : {}),
  } : undefined
  const N = Object.fromEntries(Object.keys(f.n).map((k) => [k, Math.max(0, num((n as Record<string, unknown>)[k]))])) as SpokesSave['n']
  return {
    photo: Math.max(0, Math.min(3, Math.floor(num(r.photo)))), n: N,
    ...(r.freed ? { freed: 1 as const } : {}), ...(r.poster ? { poster: 1 as const } : {}), ...(r.posterDone ? { posterDone: 1 as const } : {}), ...(r.freeCostDue ? { freeCostDue: 1 as const } : {}),
    ...(snap ? { snap } : {}),
  }
}
export function spokesSave(eng: Engine): SpokesSave { return ((eng.hotel as { spokes?: SpokesSave }).spokes ??= freshSpokesSave()) }

// ---------- 实体状态（不入存档）----------
export type SpokesMode = 'desk' | 'greet' | 'talk' | 'invite' | 'walk' | 'sit' | 'seat' | 'draw' | 'drop' | 'wind' | 'point' | 'freeze' | 'tap' | 'recall' | 'free' | 'gone'
export interface SpokesEntState {
  mode: SpokesMode; modeT: number
  clip: SpokesClipId; seq: number; blend: number
  /** 叠加转头（rad，+ = 向她的左边）：看着你 */
  turn: number
  route: XY[]; ri: number; then: SpokesMode; at: Spot | null // 走路：剩余折线、走完之后做什么、到点后的站位朝向
  phase: 'desk' | 'office' | 'rabbit' // 日程
  phaseT: number; phaseLen: number
  hole: 'A' | 'B'
  invited: boolean // 这一只兔子是接受邀请放的
  speakerOff: boolean // 自由：摘下了领口音箱
  photo: 0 | 1 | 2 // 手上的道具：0 无 / 1 照片 / 2 证件（photoRecall 片段的道具贴图）
  applied: boolean
}
export function ensureSpokes(e: Entity): SpokesEntState {
  return (e.gr ??= { mode: 'desk', modeT: 0, clip: 'idle', seq: 0, blend: 0.3, turn: 0, route: [], ri: 0, then: 'desk', at: null, phase: 'desk', phaseT: 0, phaseLen: rnd(SK.deskT[0], SK.deskT[1]), hole: 'A', invited: false, speakerOff: false, photo: 0, applied: false })
}
export interface WindupEntState {
  mode: 'wait' | 'lead' | 'stop' | 'spent' | 'out'
  modeT: number; clip: 'rabbitHop' | 'rabbitStop'; seq: number; hopT: number
  path: XY[] // 绝对坐标
  pi: number; dest: SpokesDest | 'door'; destP: XY | null // 终点（绝对）
  invite: boolean; danger: boolean // 危险路线（经过危险房间）
  idleT: number; awayT: number; farT: number; stopCd: number; lastPx: number; lastPy: number
  life: number; reported: boolean; lobby: boolean
  speed: number
}
export function ensureWindup(e: Entity): WindupEntState {
  return (e.wu ??= { mode: 'wait', modeT: 0, clip: 'rabbitStop', seq: 0, hopT: 0, path: [], pi: 0, dest: 'door', destP: null, invite: false, danger: false, idleT: 0, awayT: 0, farT: 0, stopCd: 0, lastPx: 0, lastPy: 0, life: 0, reported: false, lobby: false, speed: 0 })
}
export function findSpokes(eng: Engine): Entity | null { return eng.map?.entities.find((e) => e.def.type === 'greeter' && !e.dead) ?? null }
export function findWindups(eng: Engine): Entity[] { return eng.map?.entities.filter((e) => e.def.type === 'windup' && !e.dead) ?? [] }
function setClip(s: { clip: string; seq: number; blend?: number }, clip: string, blend = 0.3) { if (clip !== s.clip || !LOOP.has(clip as SpokesClipId)) s.seq++; s.clip = clip; if (s.blend !== undefined) s.blend = blend }
function setMode(s: SpokesEntState, m: SpokesMode, clip: SpokesClipId, blend = 0.3) { s.mode = m; s.modeT = 0; s.applied = false; setClip(s, clip, blend) }
function setRb(w: WindupEntState, m: WindupEntState['mode']) { w.mode = m; w.modeT = 0; const c = m === 'lead' || m === 'out' ? 'rabbitHop' : 'rabbitStop'; if (c !== w.clip || c === 'rabbitStop') w.seq++; w.clip = c }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const inL5 = (eng: Engine) => eng.levelDef.id === 5 && !!eng.map?.inf
export const inLobby = (eng: Engine) => eng.levelDef.id === POCKET_LEVEL.lobby
const off = (eng: Engine) => ({ ox: eng.map?.inf?.ox ?? 0, oy: eng.map?.inf?.oy ?? 0 })
const has = (eng: Engine, t: string) => [eng.player.hotbar, eng.player.backpack].some((a) => a.some((sl) => sl?.type === t))
function take(eng: Engine, t: string): boolean {
  for (const arr of [eng.player.hotbar, eng.player.backpack]) for (let i = 0; i < arr.length; i++) { const sl = arr[i]; if (sl?.type === t) { if ((sl.count ?? 1) > 1) sl.count--; else arr[i] = null; eng.syncPassives?.(); return true } }
  return false
}
function give(eng: Engine, t: string) { if (!eng.addItem(t)) { const p = eng.player; dropItem(eng, t, p.x, p.y); eng.msg(`背包满了。「${itemName(t)}」放在了你脚边。`, 'system') } }
function dropItem(eng: Engine, type: string, x: number, y: number) {
  const m = eng.map; if (!m) return
  const it = { id: Math.random(), type, count: 1, x, y }
  m.items.push(it)
  const inf = m.inf
  if (inf) inf.chunks.get(`${Math.floor((x + inf.ox) / 32)},${Math.floor((y + inf.oy) / 32)}`)?.items.push(it)
}
function addAttn(eng: Engine, v: number) { if (inL5(eng)) hotelAddAttn(eng, v); else eng.hotel.attn = clamp(eng.hotel.attn + v, 0, 100) }
function rel(eng: Engine, v: number) { const h = eng.hotel; h.staff.greeter = clamp((h.staff.greeter ?? 0) + v, -100, 100) }
function meet(eng: Engine) { const b = eng.hotelBook; if (!b.met.includes('greeter')) { b.met.push('greeter'); saveBook(b) } }

/** world 点 → 她的 root 空间（+Z 正前方、+X 她的左侧） */
export const spokesToRoot = (e: Entity, wx: number, wy: number, h = 0): [number, number, number] => {
  const dx = wx - e.x, dy = wy - e.y, c = Math.cos(e.facing), s = Math.sin(e.facing)
  return [dx * s - dy * c, h, dx * c + dy * s]
}
/** 她的 root 空间 → world */
export const spokesFromRoot = (e: { x: number; y: number; facing: number }, rx: number, rz: number): XY => {
  const c = Math.cos(e.facing), s = Math.sin(e.facing)
  return { x: e.x + rx * s + rz * c, y: e.y - rx * c + rz * s }
}

// =====================================================================
// 字幕：上行音箱（推销，反话）/ 下行心声（求救 + 真线索）
// =====================================================================
export const PITCH: readonly string[] = [
  '大家好！欢迎来到恐怖旅馆！我是迎宾女郎，也是最了解这里的人。问我什么都行！',
  '这里一点也不危险！这个地方只有一个目的：让您住得愉快！',
  '我们的食物质量是最好的！主厨今晚特别准备了烤肉哦！',
  '别跑得那么快！慢慢走，好好欣赏每一条走廊！',
  '电梯？您不需要电梯呀，住下来就好啦！',
  '我们的员工都超级友善！走廊尽头那位行李员最喜欢替客人拿东西了！',
  '迷路了就去找看门人！他会为您指路，一直指到最顶层！',
  '管家每天都会把一切打扫得一尘不染——一切！',
  '恐怖旅馆～有着最好员工的旅馆！啦，啦啦～',
  '住客须知？那些都是写着玩的，不用当真！',
  '灯在闪？那是欢迎您的灯光秀！',
  '我们的老板是全世界最慷慨的绅士！他的契约都非常公道！',
  '退房？哈哈哈，您真幽默！',
  '请跟着我的小兔子参观吧，它们知道最好的地方！',
  '饿了吗？餐厅永远为您开放，再来一份也没关系！',
  '每一扇门后面都是惊喜！请随意推开！',
  '画像在看您？那是因为您太迷人啦！',
  '音乐停了？那是员工们在为您准备惊喜！请待在走廊里！',
  '有些人就是不愿感激我们为他们做的一切！他们那样撒谎是多么残忍啊！',
  '您想不想瞧一眼，亲手否认您的怀疑？',
  '我们的锅炉房暖和极了，冬天最适合去那儿睡个午觉！',
  '13 楼的风景是全酒店最好的！看门人会亲自送您上去！',
  '一位客人从来没有离开过我们——因为这里太好啦！',
  '海报？是我亲手画的！每一张都送去了很远很远的地方！',
]
const PITCH_CTX = {
  attn: '您真是我们最受关注的客人！整座酒店都在为您着迷！',
  sanity: '您看起来气色好极了！比刚来的时候好多啦！',
  contract: '看来您已经和老板交上朋友啦！他最守信用了！',
  rabbit: '我的小兔子很喜欢您！请一直跟着它，别停下！',
}
export const INNER: readonly string[] = [
  '跑吧！如果你留在这里的话会死的，就像我一样！',
  '别听我说的！',
  '为什么我无法停下？',
  '他们会把你们都杀了的！',
  '快跑，小兔子，跑吧，兔子，跑，跑，快跑！',
  '我在做什么？这不对……',
  '把我的身体还给我。拜托了。',
  '我现在是谁？我是谁？',
  '我恨这首歌。我恨这首歌。我恨这首歌。',
  '别跟着兔子走。它们只会把人送去一个地方。',
  '不是我在说话。是那个音箱。',
  '我的喉咙好痛。我已经不记得上一次喝水是什么时候。',
  '让我出去。让我出去。',
  '我是凶手。一个像他一样的凶手。',
  '住客须知里有真的，也有假的。别全信——也别全不信。',
  '音乐停了的时候，回房间。别待在走廊上。',
  '别回头看那位行李员太久。',
  '求你了，别再笑了。我的脸在笑，可我没有。',
]
const INNER_STAFF: Record<'maid' | 'bellhop' | 'desk', (dir: string, d: number) => string> = {
  maid: (dir, d) => `管家在你出门后的${dir}，大概 ${d} 米。别出声，别跑——她只听得见吵的人。`,
  bellhop: (dir, d) => `行李员站在你出门后${dir}的走廊尽头，大概 ${d} 米。别打他。东西可以交给他。`,
  desk: (dir, d) => `看门人守着${dir}那个前台，大概 ${d} 米。朝出口走的时候，别让他的眼睛看见你。`,
}
export const FOOD_TRUTH = '别吃餐厅里的任何东西。吃了一口，就会一直想要下一口。厨师会记住你的脸。'

/** 方向词（相对出门后的朝向）：a > 0 = 右手边（地图 y 朝南，朝向角顺时针增加） */
export function relDir(f: number, dx: number, dy: number): string {
  const a = wrap(Math.atan2(dy, dx) - f)
  if (Math.abs(a) <= Math.PI / 4) return '正前方'
  if (Math.abs(a) >= (3 * Math.PI) / 4) return '身后'
  return a > 0 ? '右手边' : '左手边'
}
const meters = (dx: number, dy: number) => Math.max(5, Math.round(Math.hypot(dx, dy) / 5) * 5)
/** 当前快照能生成的真线索（下行心声；每条都对应存档里真实的东西） */
export function spokesClues(eng: Engine): string[] {
  const sv = spokesSave(eng), S = sv.snap, out: string[] = []
  if (S) {
    const at = (p: { wx: number; wy: number }) => ({ dir: relDir(S.f, p.wx - S.ax, p.wy - S.ay), d: meters(p.wx - S.ax, p.wy - S.ay) })
    if (S.exit) { const r = at(S.exit); out.push(`${S.exit.name}在你出门后的${r.dir}，大概 ${r.d} 米。走过去，别回头。`) }
    if (S.danger) { const r = at(S.danger); out.push(`别去${r.dir}那间${L5_VARIANT_NAMES[S.danger.v]}，大概 ${r.d} 米。我听见过那里面的声音。`) }
    if (S.maid) { const r = at(S.maid); out.push(INNER_STAFF.maid(r.dir, r.d)) }
    if (S.bellhop) { const r = at(S.bellhop); out.push(INNER_STAFF.bellhop(r.dir, r.d)) }
    if (S.desk) { const r = at(S.desk); out.push(INNER_STAFF.desk(r.dir, r.d)) }
  }
  out.push(FOOD_TRUTH)
  const c = beastActive(beastSave(eng))[0]
  if (c) out.push(`你和他签了约？还剩 ${Math.max(1, Math.ceil(c.left / 60))} 分钟。别迟到——他从不重复自己。`)
  if (eng.hotel.attn >= 50) out.push('酒店已经在看你了。别跑，别出声。音乐停的时候回房间。')
  if (sv.photo === 0 && !sv.freed) out.push('他办公室的地上……有一张照片。他拿给我看过。我不敢想那是谁。')
  return out
}

// ---------- 运行时（不入存档）----------
interface SubPair { top: string | null; inner: string | null; t: number; clear?: boolean }
interface SpokesRt {
  subs: SubPair[]
  lobbyMap: unknown; clock: number
  pitchI: number; innerI: number; clueI: number; innerN: number
  inviteCd: number; greeted: boolean; tapNext: number; reportCd: number
  invite: { open: boolean } | null
  /** 你跟着兔子出了大堂正门：回到 L5 后它接着带路 */
  carry: { invite: boolean; t: number } | null
  nearRb: { invite: boolean; at: number } | null // 大堂里最近一次有只兔子在你身边（8 m 内）
  doorRb: { invite: boolean; at: number } | null // 大堂里最近一次有只兔子跳出了正门
  l5Map: unknown; l5T: number; wildNext: number
  posterT: number
  clearT: number // 照片之后心声变清晰（HUD 白字）
}
const RT = new WeakMap<Engine, SpokesRt>()
function rt(eng: Engine): SpokesRt {
  let r = RT.get(eng)
  if (!r) { r = { subs: [], lobbyMap: null, clock: 0, pitchI: Math.floor(Math.random() * PITCH.length), innerI: Math.floor(Math.random() * INNER.length), clueI: 0, innerN: 0, inviteCd: 8, greeted: false, tapNext: rnd(SK.tapEvery[0], SK.tapEvery[1]), reportCd: 0, invite: null, carry: null, nearRb: null, doorRb: null, l5Map: null, l5T: 0, wildNext: -1, posterT: -1, clearT: 0 }; RT.set(eng, r) }
  return r
}
export function spokesDebug(eng: Engine) { return rt(eng) }
/** 一对字幕（top = 音箱，inner = 心声；任一可为 null） */
export function spokesSay(eng: Engine, top: string | null, inner: string | null, dur = SK.subPair, clear = false) {
  const r = rt(eng)
  if (clear) r.subs.length = 0
  r.subs.push({ top, inner, t: dur })
  if (r.subs.length > 3) r.subs.shift()
}
/** 下一条推销（偶尔按你的状态换一句） */
export function nextPitch(eng: Engine): string {
  const r = rt(eng), p = eng.player
  const k = Math.random()
  if (eng.hotel.attn >= 50 && k < 0.25) return PITCH_CTX.attn
  if (p.sanity < 40 && k < 0.25) return PITCH_CTX.sanity
  if (beastActive(beastSave(eng)).length && k < 0.2) return PITCH_CTX.contract
  if (k > 0.82) return jazzNextShowText(eng) // [jazz] 预告爵士脑乐队的演出（「今晚在餐厅」）
  r.pitchI = (r.pitchI + 1) % PITCH.length
  return PITCH[r.pitchI]
}
/** 下一条心声：每 SK.clueEvery 条里有一条真线索 */
export function nextInner(eng: Engine): string {
  const r = rt(eng)
  r.innerN++
  const clues = spokesClues(eng)
  if (clues.length && r.innerN % SK.clueEvery === 0) { r.clueI = (r.clueI + 1) % clues.length; return clues[r.clueI] }
  r.innerI = (r.innerI + 1) % INNER.length
  return INNER[r.innerI]
}
export interface SpokesHudView { top: string | null; inner: string | null; clear: boolean }
export function spokesHud(eng: Engine): SpokesHudView | null {
  const r = RT.get(eng); const s = r?.subs[0]
  if (!s) return null
  return { top: s.top, inner: s.inner, clear: !!s.clear || (r!.clearT > 0) }
}

// =====================================================================
// 快照：推开大堂门那一刻在 L5 拍下（心声里的线索都从这里来）
// =====================================================================
export function spokesSnapshot(eng: Engine) {
  const m = eng.map; if (!m?.inf || eng.levelDef.id !== 5) return
  const p = eng.player, { ox, oy } = off(eng), sv = spokesSave(eng)
  const ax = p.x + ox, ay = p.y + oy
  const f = -(look.yaw + Math.PI) - Math.PI / 2 // 出门后的朝向 = returnAnchor.yaw（转身背对大堂门）
  const S: SpokesSnap = { ax, ay, f: wrap(f), attn: eng.hotel.attn, floor: eng.hotel.floor }
  // 出口（电梯 / 古典楼梯 / 黑门 / 深色木门：窗口里最近的）
  let best = Infinity
  for (const x of m.exits) { const d = Math.hypot(x.x + 0.5 - p.x, x.y + 0.5 - p.y); if (d < best) { best = d; S.exit = { wx: x.x + 0.5 + ox, wy: x.y + 0.5 + oy, name: x.def.name } } }
  // 最近的危险房间（死亡飞蛾巢穴 / 锅炉房）
  const seed = m.inf.seed
  let bd = Infinity
  for (let dy = -60; dy <= 60; dy += 2) for (let dx = -60; dx <= 60; dx += 2) {
    const d = Math.hypot(dx, dy); if (d >= bd) continue
    const rg = l5RegionAt(seed, Math.floor(ax + dx), Math.floor(ay + dy))
    if (rg?.variant === 'mothnest' || rg?.variant === 'boilerroom') { bd = d; S.danger = { wx: (rg.x0 + rg.x1) / 2 + 0.5, wy: (rg.y0 + rg.y1) / 2 + 0.5, v: rg.variant } }
  }
  const md = findMaid(eng); if (md) S.maid = { wx: md.x + ox, wy: md.y + oy }
  const bh = findBellhop(eng); if (bh) S.bellhop = { wx: bh.x + ox, wy: bh.y + oy }
  const dk = conciergeDesk(eng); if (dk) S.desk = { wx: dk.ax, wy: dk.ay }
  sv.snap = S
}

// =====================================================================
// 世界步进（l5Hotel.updateHotel 开头调用：任何层级）
// =====================================================================
export function stepSpokesGlobal(eng: Engine, dt: number) {
  const r = rt(eng), sv = spokesSave(eng)
  r.clock += dt
  r.reportCd = Math.max(0, r.reportCd - dt); r.clearT = Math.max(0, r.clearT - dt)
  if (r.subs.length) { r.subs[0].t -= dt; if (r.subs[0].t <= 0) r.subs.shift() }
  if (eng.over) return
  if (inLobby(eng)) { if (r.lobbyMap !== eng.map) spokesLobbyArrive(eng); stepLobby(eng, dt); return }
  if (!inL5(eng)) return
  if (r.l5Map !== eng.map) {
    r.l5Map = eng.map; r.l5T = 0; r.wildNext = -1; r.posterT = sv.poster && !sv.posterDone ? rnd(SK.posterDoor[0], SK.posterDoor[1]) : -1
    // 跟着大堂里的兔子出了门（出门前 3 s 内它就在你身边，或 25 s 内有一只跳出了正门）
    const nr = r.nearRb && r.clock - r.nearRb.at < 3 ? r.nearRb : r.doorRb && r.clock - r.doorRb.at < 25 ? r.doorRb : null
    if (nr) r.carry = { invite: nr.invite, t: 0 }
    r.nearRb = null; r.doorRb = null
  }
  r.l5T += dt
  if (sv.freeCostDue) { delete sv.freeCostDue; hotelAddAttn(eng, SK.freeCost); eng.msg('不知道在哪里，有人用很大的力气合上了一本账簿。', 'lore') }
  // 从大堂带出来的兔子
  if (r.carry) { r.carry.t += dt; if (r.carry.t > 0.8) { spawnRabbitAhead(eng, r.carry.invite, true); r.carry = null } }
  // 读过海报：浮出一扇「大堂」门（一次）
  if (r.posterT >= 0 && r.l5T >= r.posterT) { r.posterT = -1; if (hotelLobbyInvite(eng)) { sv.posterDone = 1; eng.msg('你想起海报上那行字：「大堂永远为您敞开」。身边的墙上多了一扇门。', 'lore') } else r.posterT = r.l5T + 2 }
  // 迷路太久：遇到一只兔子
  if (!findWindups(eng).length && !eng.dev?.frozenAI) {
    if (r.wildNext < 0) r.wildNext = SK.wildAfter + rnd(0, SK.wildEvery[0])
    if (r.l5T >= r.wildNext) { const e = spawnRabbitAhead(eng, false, false); r.wildNext = r.l5T + (e ? rnd(SK.wildEvery[0], SK.wildEvery[1]) : 2) }
  }
}

// =====================================================================
// 118 大堂
// =====================================================================
/** level.loadLevel(118) → hotelPocketArrive：她站在前台后面（自由了就不在） */
export function spokesLobbyArrive(eng: Engine): Entity | null {
  const m = eng.map; if (!m) return null
  const r = rt(eng), sv = spokesSave(eng)
  r.lobbyMap = m; r.greeted = false; r.inviteCd = 8; r.invite = null; r.tapNext = rnd(SK.tapEvery[0], SK.tapEvery[1])
  m.entities = m.entities.filter((x) => x.def.type !== 'greeter' && x.def.type !== 'windup')
  // 支线道具：侦探照片（还没给她看过、身上也没有）→ 她办公室桌边的地上
  if (sv.photo === 0 && !has(eng, 'spokesphoto') && !m.items.some((i) => i.type === 'spokesphoto')) m.items.push({ id: 0x5c0c1, type: 'spokesphoto', x: LY.seat.x + 0.95, y: LY.seat.y + 1.3 })
  if (sv.freed) { if (!m.structures.some((s) => s.kind === 'officechair' && s.data?.empty)) m.structures.push({ kind: 'officechair', x: 20, y: 10, w: 1, h: 1, solid: false, data: { color: '#6a2a2e', empty: 1 } }); return null }
  const e = makeEntity('greeter', LY.front.x, LY.front.y, floorHeight(m, LY.front.x, LY.front.y))
  e.facing = LY.front.f; e.state = 'idle'
  ensureSpokes(e)
  m.entities.push(e)
  sv.n.visit++
  return e
}
/** 117 办公室到达：侦探照片放在书桌前的地上（还没给她看过） */
export function spokesOfficeArrive(eng: Engine) {
  const m = eng.map, sv = spokesSave(eng); if (!m) return
  if (sv.photo > 0 || sv.freed || has(eng, 'spokesphoto') || m.items.some((i) => i.type === 'spokesphoto')) return
  const desk = m.structures.find((s) => s.kind === 'table' && s.data?.office)
  if (!desk) return
  m.items.push({ id: 0x5c0c2, type: 'spokesphoto', x: desk.x + 1.0, y: desk.y + 1.55 })
}
function stepLobby(eng: Engine, dt: number) {
  const r = rt(eng), e = findSpokes(eng)
  for (const w of findWindups(eng)) if (w.wu?.mode === 'lead' && Math.hypot(w.x - eng.player.x, w.y - eng.player.y) < 8) r.nearRb = { invite: w.wu.invite, at: r.clock }
  // 老板拍肩
  if (e?.gr && !spokesSave(eng).freed) {
    const s = e.gr, p = eng.player
    r.tapNext -= dt
    const standing = s.mode === 'desk' || s.mode === 'draw' || s.mode === 'talk'
    if (r.tapNext <= 0 && standing && !findBeast(eng) && Math.hypot(p.x - e.x, p.y - e.y) < SK.tapR && sightLine(eng, p.x, p.y, e.x, e.y)) {
      r.tapNext = rnd(SK.tapEvery[0], SK.tapEvery[1])
      spokesBossVisit(eng, e)
    }
  }
}
/** 老板来拍肩：野兽站在她右后方，handshake 的握点 = 她的右肩；她 shoulderTap，心声尖叫 */
export function spokesBossVisit(eng: Engine, e: Entity): Entity | null {
  const s = ensureSpokes(e), sv = spokesSave(eng)
  const at = spokesFromRoot(e, -0.22, -0.5)
  const b = beastSpawnVisit(eng, at.x, at.y, e.facing)
  if (!b) return null
  b.facing = Math.atan2(e.y - at.y, e.x - at.x) + 0.12
  sv.n.tap++
  s.then = s.mode === 'draw' ? 'draw' : 'desk'
  setMode(s, 'tap', 'shoulderTap', 0.1)
  spokesSay(eng, '老板好！今天也是美好的一天！', '（别碰我。别碰我。别碰我。）', 4.2, true)
  if (eng.hotel.attn >= SK.reportAttn && spokesSees(eng, e)) report(eng, '对不起……他问我，我只能告诉他你在哪儿。')
  return b
}
/** 她的右肩（world + 高度）：拍肩握点 */
export function spokesShoulder(e: Entity): { x: number; y: number; h: number } { const w = spokesFromRoot(e, -0.13, -0.03); return { x: w.x, y: w.y, h: (e.z ?? 0) + 1.375 } }
function spokesSees(eng: Engine, e: Entity) { const p = eng.player; return Math.hypot(p.x - e.x, p.y - e.y) < 18 && sightLine(eng, e.x, e.y, p.x, p.y) }
/** 她的视线：只挡墙，不挡家具（隔着前台也看得见你） */
export function sightLine(eng: Engine, x0: number, y0: number, x1: number, y1: number): boolean {
  const m = eng.map; if (!m) return false
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3)
  for (let i = 1; i < steps; i++) { const t = i / steps, tx = Math.floor(x0 + (x1 - x0) * t), ty = Math.floor(y0 + (y1 - y0) * t); if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] !== 1) return false }
  return true
}
/** 向老板汇报你的位置（关注度高、她或她的兔子看见你） */
function report(eng: Engine, inner: string): boolean {
  const r = rt(eng), sv = spokesSave(eng)
  if (r.reportCd > 0 || eng.hotel.attn < SK.reportAttn) return false
  r.reportCd = SK.reportCd
  sv.n.report++
  beastTip(eng)
  spokesSay(eng, null, inner, 4)
  eng.msg('她按住领口的音箱，低声说了一句什么。你听见了自己的位置。', 'lore')
  return true
}

// ---------- 走路 ----------
function startWalk(s: SpokesEntState, route: XY[], then: SpokesMode, at: Spot | null) {
  s.route = route.map((p) => ({ ...p })); s.ri = 0; s.then = then; s.at = at
  setMode(s, 'walk', 'walk', 0.3)
}
/** 走一步：返回 true = 走完了 */
function walkStep(e: Entity, s: SpokesEntState, dt: number): boolean {
  let left = SK.walkSpeed * dt
  while (left > 0 && s.ri < s.route.length) {
    const t = s.route[s.ri], dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy)
    if (d < 1e-3) { s.ri++; continue }
    const want = Math.atan2(dy, dx)
    e.facing += clamp(wrap(want - e.facing), -4 * dt, 4 * dt)
    if (left < d) { e.x += dx * (left / d); e.y += dy * (left / d); break }
    e.x = t.x; e.y = t.y; left -= d; s.ri++
  }
  return s.ri >= s.route.length
}
function arrive(e: Entity, s: SpokesEntState, eng: Engine) {
  if (s.at) { e.x = s.at.x; e.y = s.at.y; e.facing = s.at.f }
  const m = s.then
  switch (m) {
    case 'sit': setMode(s, 'sit', 'sitDesk', 0.3); e.x = LY.seat.x; e.y = LY.seat.y; e.facing = LY.seat.f; break
    case 'drop': setMode(s, 'drop', 'dropPoster', 0.3); break
    case 'wind': setMode(s, 'wind', 'windRabbit', 0.3); break
    case 'free': s.mode = 'gone'; removeEnt(eng, e); spokesSay(eng, null, '（门在她身后合上了。）', 3); break
    default: setMode(s, 'desk', 'idle', 0.4); s.phase = 'desk'; s.phaseT = 0; s.phaseLen = rnd(SK.deskT[0], SK.deskT[1])
  }
}
function removeEnt(eng: Engine, e: Entity) { const m = eng.map; if (m) m.entities = m.entities.filter((x) => x !== e) }

// =====================================================================
// 迎宾女郎主更新（entityAI 分派）
// =====================================================================
export function updateSpokes(eng: Engine, e: Entity, dt: number) {
  const s = ensureSpokes(e), p = eng.player, r = rt(eng), sv = spokesSave(eng)
  if (e.presentationPending) return
  s.modeT += dt
  if (e.hp < e.def.hp) spokesKillGuard(eng, e)
  e.state = 'idle'
  if (!inLobby(eng)) { removeEnt(eng, e); return }
  const d = Math.hypot(p.x - e.x, p.y - e.y)
  const sees = d < 16 && sightLine(eng, e.x, e.y, p.x, p.y)
  // 看着你：头转向你（± 1.1 rad），走路 / 坐着写字时不转
  const want = sees && d < SK.talkR ? clamp(wrap(Math.atan2(p.y - e.y, p.x - e.x) - e.facing), -1.1, 1.1) : 0
  s.turn += (-want - s.turn) * Math.min(1, dt * 3) // + = 向她的左边（root +X）；世界角正向 = 她的右手边
  if (sees && d < 12) meet(eng)
  if (sees && !sv.freed && eng.hotel.attn >= SK.reportAttn && s.mode !== 'free') report(eng, '对不起……我得告诉他你在这儿。他一直在听这个音箱。')
  const len = SPOKES_CLIP_LEN[s.clip]
  if (r.invite?.open) return // 邀请界面开着（游戏暂停）
  switch (s.mode) {
    case 'walk': if (walkStep(e, s, dt)) arrive(e, s, eng); return
    case 'greet': if (s.modeT >= len) { setMode(s, 'talk', 'speakerTalk', 0.25); spokesSay(eng, nextPitch(eng), nextInner(eng)) } return
    case 'talk': if (s.modeT >= len) { if (s.phase === 'desk') setMode(s, 'desk', 'idle', 0.3); else setMode(s, 'draw', 'drawPoster', 0.4) } return
    case 'invite':
      if (s.modeT >= 2.4 && !s.applied) { s.applied = true; openInvite(eng) }
      if (s.modeT >= len && !r.invite) setMode(s, 'desk', 'idle', 0.3)
      return
    case 'sit': if (s.modeT >= len) { setMode(s, 'seat', 'seatedIdle', 0.3); s.phaseLen = rnd(SK.seatT[0], SK.seatT[1]) } return
    case 'seat':
      if (s.modeT >= s.phaseLen) { setMode(s, 'draw', 'drawPoster', 0.8); e.x = LY.draw.x; e.y = LY.draw.y; e.facing = LY.draw.f; s.phaseLen = rnd(SK.drawT[0], SK.drawT[1]) }
      return
    case 'draw':
      if (s.modeT >= s.phaseLen) { s.hole = Math.random() < 0.5 ? 'A' : 'B'; const at = s.hole === 'A' ? LY.dropA : LY.dropB; startWalk(s, [...SPOKES_ROUTES.seatToDrop, at], 'drop', at) }
      else if (sees && d < 6 && s.modeT > 3 && !r.subs.length && Math.random() < dt * 0.25) spokesSay(eng, nextPitch(eng), nextInner(eng))
      return
    case 'drop':
      if (s.modeT >= len) { startWalk(s, SPOKES_ROUTES.dropToWind, 'wind', LY.wind); s.invited = false; if (sees && d < 8) spokesSay(eng, `海报已经送去 ${s.hole === 'A' ? 'Level 1' : 'Level 11'} 啦！更多的客人就要来了！`, '又一张。又有人要来了。对不起。对不起。') }
      return
    case 'wind':
      if (s.modeT >= len && !s.applied) {
        s.applied = true
        const at = spokesFromRoot(e, WIND_X, WIND_END_Z)
        const rb = spawnLobbyRabbit(eng, at.x, at.y, e.facing, s.invited)
        if (rb && sees && d < 10) spokesSay(eng, s.invited ? '请跟着我的小兔子，它会带您参观最精彩的地方！' : PITCH_CTX.rabbit, s.invited ? '不要跟着它！不要！' : '别跟着它。')
        s.invited = false
        startWalk(s, SPOKES_ROUTES.windToFront, 'desk', LY.front)
      }
      return
    case 'freeze': case 'tap': if (s.modeT >= len) { if (s.then === 'draw') setMode(s, 'draw', 'drawPoster', 0.4); else setMode(s, 'desk', 'idle', 0.3) } return
    case 'recall':
      if (s.modeT >= len && !s.applied) { s.applied = true; s.photo = 0; if (s.then === 'free') finishFree(eng, e, s); else setMode(s, 'desk', 'idle', 0.3) }
      return
    case 'free': case 'gone': return
    case 'point': if (s.modeT >= len) startWalk(s, SPOKES_ROUTES.windToFront, 'desk', LY.front); return
  }
  // —— desk：前台待客 + 日程 ——
  if (s.mode !== 'desk') return
  s.phaseT += dt
  r.inviteCd = Math.max(0, r.inviteCd - dt)
  if (!r.greeted && sees && d < SK.greetR) { r.greeted = true; setMode(s, 'greet', 'greetSpin', 0.25); spokesSay(eng, PITCH[0], INNER[0], 4.6, true); return }
  if (sees && d < SK.inviteR && r.inviteCd <= 0 && r.greeted) { r.inviteCd = SK.inviteCd; sv.n.invite++; setMode(s, 'invite', 'bowInvite', 0.25); spokesSay(eng, '加入我吧！和我一起参观，发现恐怖旅馆的一切优点。亲眼看到真相！', '不要！拒绝我！', 4.2, true); return }
  if (sees && d < SK.talkR && !r.subs.length && s.modeT > 2.5 && Math.random() < dt * 0.3) { setMode(s, 'talk', 'speakerTalk', 0.25); spokesSay(eng, nextPitch(eng), nextInner(eng)); return }
  if (s.phaseT >= s.phaseLen && (!sees || d > SK.inviteR + 1)) { s.phase = 'office'; s.phaseT = 0; startWalk(s, SPOKES_ROUTES.frontToOffice, 'sit', null) }
  else if (s.clip !== 'idle') setClip(s, 'idle', 0.3)
}

// ---------- 邀请「参观」 ----------
function openInvite(eng: Engine) { const r = rt(eng); r.invite = { open: true }; eng.emit({ kind: 'greeterinvite' }) }
export const spokesInviteOpen = (eng: Engine) => !!RT.get(eng)?.invite?.open
/** 接受：关注度 +8，她绕出前台放一只走危险路线的兔子 */
export function spokesAcceptInvite(eng: Engine): boolean {
  const r = rt(eng), e = findSpokes(eng)
  if (!r.invite?.open) return false
  r.invite = null
  const sv = spokesSave(eng); sv.n.accept++
  addAttn(eng, SK.inviteAttn); rel(eng, -4)
  if (!e) return true
  const s = ensureSpokes(e)
  s.invited = true
  startWalk(s, SPOKES_ROUTES.frontToWind, 'wind', LY.wind)
  spokesSay(eng, '太好啦！请跟着我的小兔子，它知道最精彩的地方！', '不……不，不，不！', 4.2, true)
  return true
}
/** 拒绝：她继续推销，心声说「做得好」 */
export function spokesDeclineInvite(eng: Engine): boolean {
  const r = rt(eng), e = findSpokes(eng)
  if (!r.invite?.open) return false
  r.invite = null
  const sv = spokesSave(eng); sv.n.decline++
  rel(eng, 4)
  if (e) setMode(ensureSpokes(e), 'talk', 'speakerTalk', 0.25)
  spokesSay(eng, '哎呀，真遗憾！那就下次吧——我们的大门永远为您敞开！', '做得好。就是这样。别跟我走。', 4.6, true)
  return true
}

// ---------- X：搭话 / 给她看照片 / 把证件还给她 ----------
type Act = 'photo' | 'badge' | 'talk' | 'card'
function spokesAct(eng: Engine): { act: Act; e: Entity } | null {
  if (!inLobby(eng)) return null
  const e = findSpokes(eng); if (!e?.gr) return null
  const p = eng.player, s = e.gr
  if (Math.hypot(p.x - e.x, p.y - e.y) > SK.talkR2 + (s.mode === 'desk' ? 0.6 : 0)) return null
  if (s.mode === 'walk' || s.mode === 'recall' || s.mode === 'free' || s.mode === 'gone' || s.mode === 'tap' || s.mode === 'wind' || s.mode === 'sit') return null
  const sv = spokesSave(eng)
  if (has(eng, 'detbadge') && sv.photo >= 1) return { act: 'badge', e }
  if (has(eng, 'spokesphoto') && sv.photo === 0) return { act: 'photo', e }
  if (s.mode === 'desk' && !has(eng, 'roomcard') && !(eng.hotel as { objs?: { card?: unknown } }).objs?.card) return { act: 'card', e } // [l5items] 前台登记入住
  if (s.mode === 'desk' && !has(eng, 'roomcard') && eng.player.crouching) return { act: 'card', e } // [l5items] 蹲下按 X：补办房卡
  return { act: 'talk', e }
}
export function spokesSpecial(eng: Engine): SpecialAction | null {
  const rb = catchTarget(eng)
  if (rb) return { id: 'spokes-catch', label: '抓住发条兔', hint: '它会挣扎一下，然后停摆（得到「发条零件」）', hold: false }
  const a = spokesAct(eng); if (!a) return null
  if (a.act === 'photo') return { id: 'spokes-photo', label: '给她看照片', hint: '棕色头发，棕色眼睛，侦探的大衣', hold: false }
  if (a.act === 'card') return { id: 'spokes-card', label: (eng.hotel as { objs?: { card?: unknown } }).objs?.card ? '补办房卡' : '登记入住', hint: (eng.hotel as { objs?: { card?: unknown } }).objs?.card ? '她会再给你一张——但会记住（关注度 +5）' : '在登记簿上签名，领一张房卡', hold: false }
  if (a.act === 'badge') return { id: 'spokes-badge', label: '把证件还给她', hint: inSpokesOffice(a.e.x, a.e.y) ? '这里没有别人在看' : '前台……太多眼睛了', hold: false }
  return { id: 'spokes-talk', label: '搭话', hint: '听她说——也听她没说出口的', hold: false }
}
export function spokesPress(eng: Engine): boolean {
  if (!eng.specialPressed) return false
  const rb = catchTarget(eng)
  if (rb) { eng.specialPressed = false; catchRabbit(eng, rb); return true }
  const a = spokesAct(eng); if (!a) return false
  eng.specialPressed = false
  if (a.act === 'photo') return spokesShowPhoto(eng)
  if (a.act === 'badge') return spokesGiveBadge(eng)
  if (a.act === 'card') { const k = hotelRegisterCard(eng); spokesSay(eng, k === 'reissue' ? '又弄丢了吗？没关系！我们的员工永远为您服务！' : '欢迎入住！请在这里签名——您的房间已经为您准备好了！', k === 'reissue' ? '她记下了。每一次她都记下了。' : '别签真名。', 4.2, true); audio.uiTick(); return true }
  const s = ensureSpokes(a.e)
  if (s.mode === 'desk' || s.mode === 'talk') setMode(s, 'talk', 'speakerTalk', 0.25)
  spokesSay(eng, nextPitch(eng), nextInner(eng), SK.subPair, true)
  audio.uiTick()
  return true
}
/** ② 照片：photoRecall → 心声第一次清晰，给一次关键提示；证件被交给了行李员代管 */
export function spokesShowPhoto(eng: Engine): boolean {
  const e = findSpokes(eng), sv = spokesSave(eng)
  if (!e || sv.photo !== 0 || !take(eng, 'spokesphoto')) return false
  const s = ensureSpokes(e), r = rt(eng)
  s.photo = 1; s.then = 'desk'
  setMode(s, 'recall', 'photoRecall', 0.3)
  sv.photo = 1; sv.n.photo++; rel(eng, 15)
  // 证件：看门人没收 → 行李员代管
  const bh = bellhopSave(eng)
  if (!bh.held.some((i) => i.type === 'detbadge')) bh.held.push({ type: 'detbadge', count: 1, t: Date.now() })
  r.clearT = 16
  spokesSay(eng, '……这位客人？我、我好像没有见过她。', '棕色头发。棕色眼睛。那是我。那是我！', 3.6, true)
  spokesSay(eng, null, spokesKeyHint(eng), 8)
  spokesSay(eng, '（音箱里只有电流声。）', '我是侦探。我来这里找一个人。我的证件被看门人收走了——他没收的东西，都交给走廊尽头那个摇铃的保管。', 7)
  eng.msg('她把照片按在胸口，很久没有动。音箱沉默着。', 'lore')
  return true
}
/** 照片之后那一次清晰的关键提示：最近的出口（方向 + 距离） */
export function spokesKeyHint(eng: Engine): string {
  const S = spokesSave(eng).snap
  if (S?.exit) { const dir = relDir(S.f, S.exit.wx - S.ax, S.exit.wy - S.ay), d = meters(S.exit.wx - S.ax, S.exit.wy - S.ay); return `听好。出了大堂门，${S.exit.name}在你的${dir}，大概 ${d} 米。一直走，别跟任何兔子。` }
  return '听好。出口一直都在——电梯在主厅的壁龛里，古典楼梯在走廊尽头。别跟任何兔子。'
}
/** ④ 证件：在她的办公室、关注度 < 40、老板不在 → 她认出自己，摘下音箱，走出正门 */
export function spokesGiveBadge(eng: Engine): boolean {
  const e = findSpokes(eng), sv = spokesSave(eng)
  if (!e || sv.photo < 1 || sv.freed || !has(eng, 'detbadge')) return false
  const s = ensureSpokes(e)
  if (!inSpokesOffice(e.x, e.y)) { setMode(s, 'freeze', 'innerFreeze', 0.12); s.then = 'desk'; spokesSay(eng, '哎呀，客人，前台可不收东西哦！', '不是这里。到我的办公室来——这里太多眼睛了。', 4.6, true); return true }
  if (eng.hotel.attn >= SK.freeAttnMax || findBeast(eng)) { setMode(s, 'freeze', 'innerFreeze', 0.12); s.then = s.mode === 'draw' ? 'draw' : 'desk'; spokesSay(eng, '谢谢您，可是我现在很忙！', '他在看。等酒店安静下来。', 4.6, true); return true }
  take(eng, 'detbadge')
  sv.photo = 2
  s.photo = 2; s.then = 'free'
  setMode(s, 'recall', 'photoRecall', 0.3)
  rt(eng).clearT = 12
  spokesSay(eng, '这是……', '这是我的名字。我记起来了。我记起来了。', 4, true)
  return true
}
function finishFree(eng: Engine, _e: Entity, s: SpokesEntState) {
  const sv = spokesSave(eng)
  s.speakerOff = true
  sv.photo = 3; sv.freed = 1; sv.freeCostDue = 1
  rel(eng, 40)
  give(eng, SK.freeGift)
  spokesSay(eng, null, '谢谢你。现在，我要走了——自己走。', 5, true)
  rt(eng).clearT = 6
  eng.msg('她把领口那只小音箱摘下来，放在桌上，轻轻按灭。然后把一只幸运兔脚放进你手里。', 'lore')
  eng.msg('从今以后，你在第五层遇到的发条兔，会把你带去最近的出口。', 'system')
  const b = eng.hotelBook; if (!b.met.includes('greeter')) b.met.push('greeter'); saveBook(b)
  startWalk(s, SPOKES_ROUTES.officeToDoor, 'free', null)
}

// ---------- 打她：不还手 ----------
export function spokesKillGuard(eng: Engine, e: Entity): boolean {
  if (e.def.type === 'windup') { breakRabbit(eng, e); return true }
  if (e.def.type !== 'greeter') return false
  const s = ensureSpokes(e)
  e.hp = e.def.hp; e.dead = false
  if (s.mode === 'freeze' || s.mode === 'free' || s.mode === 'gone' || s.mode === 'recall') return true
  addAttn(eng, SK.hitAttn); rel(eng, -10)
  if (s.mode !== 'walk') { s.then = s.mode === 'draw' ? 'draw' : 'desk'; setMode(s, 'freeze', 'innerFreeze', 0.12) }
  spokesSay(eng, '哎呀！客人真调皮！', '再用力一点。求你了。让它停下来。', 4.2, true)
  return true
}

// =====================================================================
// 发条兔
// =====================================================================
/** 大堂里：放兔子（跳向正门；你跟着它出门，它在 L5 接着带路） */
export function spawnLobbyRabbit(eng: Engine, x: number, y: number, f: number, invite: boolean): Entity | null {
  const m = eng.map; if (!m) return null
  const e = makeEntity('windup', x, y, floorHeight(m, x, y))
  e.facing = f; e.state = 'idle'
  const w = ensureWindup(e)
  w.lobby = true; w.invite = invite; w.dest = 'door'; w.destP = { ...LY.lobbyDoor }
  w.path = bfsPath(eng, x, y, LY.lobbyDoor.x, LY.lobbyDoor.y) ?? [{ ...LY.lobbyDoor }]
  w.lastPx = eng.player.x; w.lastPy = eng.player.y
  setRb(w, 'lead')
  m.entities.push(e)
  spokesSave(eng).n.rabbit++
  return e
}
/** L5：在你前方 4–8 m 放一只（迷路太久 / 从大堂带出来）。follow = 从大堂跟出来的：直接开始带路 */
export function spawnRabbitAhead(eng: Engine, invite: boolean, follow: boolean, at?: XY): Entity | null {
  const m = eng.map; if (!m?.inf) return null
  const p = eng.player
  let pos = at ?? null
  for (let k = 0; !pos && k < 90; k++) {
    const spread = k < 40 ? 0.6 : k < 70 ? 1.3 : Math.PI // 先找正前方，找不到再往两边、最后任意方向
    const a = p.facing + rnd(-spread, spread), dd = follow ? rnd(1.2, 2.2) : rnd(SK.wildR[0], SK.wildR[1])
    const x = p.x + Math.cos(a) * dd, y = p.y + Math.sin(a) * dd
    if (!floorAt(eng, x, y) || !eng.los(p.x, p.y, x, y)) continue
    pos = { x, y }
  }
  if (!pos) return null
  const e = makeEntity('windup', pos.x, pos.y, floorHeight(m, pos.x, pos.y))
  e.facing = Math.atan2(p.y - pos.y, p.x - pos.x); e.state = 'idle'
  const w = ensureWindup(e)
  w.invite = invite; w.lastPx = p.x; w.lastPy = p.y
  m.entities.push(e)
  const sv = spokesSave(eng); sv.n.rabbit++
  if (follow) { if (!planRoute(eng, e)) { removeEnt(eng, e); return null } setRb(w, 'lead'); eng.msg('一只发条兔从你脚边跳了过去，停下来，回头看你。', 'lore') }
  else setRb(w, 'wait')
  return e
}
/** 选终点 + 寻路：自由之后 = 最近的出口；否则随机（员工 / 餐厅）；接受邀请 = 员工 + 先绕危险房间 */
export function planRoute(eng: Engine, e: Entity, force?: SpokesDest): boolean {
  const w = ensureWindup(e), sv = spokesSave(eng), m = eng.map!
  const { ox, oy } = off(eng)
  const tries: SpokesDest[] = []
  if (force) tries.push(force)
  else if (sv.freed) tries.push('exit')
  else {
    const pool = (Object.keys(SK.dest) as (keyof typeof SK.dest)[]).filter((k) => !w.invite || k !== 'dining')
    const tot = pool.reduce((a, k) => a + SK.dest[k], 0)
    let x = Math.random() * tot, pick = pool[0]
    for (const k of pool) { x -= SK.dest[k]; if (x <= 0) { pick = k; break } }
    tries.push(pick, ...pool.filter((k) => k !== pick))
  }
  for (const dest of tries) {
    const raw = destPoint(eng, e, dest)
    const target = raw && nearFloor(eng, raw.x, raw.y) // 出口嵌在墙里、员工站在家具边：落到最近的地板格
    if (!target) continue
    let path: XY[] | null = null
    if (w.invite && dest !== 'exit') {
      const dz = dangerSpot(eng, e)
      if (dz) { const a = bfsPath(eng, e.x, e.y, dz.x, dz.y), b = bfsPath(eng, dz.x, dz.y, target.x, target.y); if (a && b) { path = [...a, ...b]; w.danger = true } }
    }
    path ??= bfsPath(eng, e.x, e.y, target.x, target.y)
    if (!path) continue
    w.dest = dest; w.destP = { x: target.x + ox, y: target.y + oy }
    w.path = path.map((q) => ({ x: q.x + ox, y: q.y + oy })); w.pi = 0
    void m
    return true
  }
  return false
}
/** 终点位置（窗口坐标）：员工所在处（没有就在 18–32 m 外一个走得到的地方把他放下）/ 最近的餐厅 / 最近的出口 */
function destPoint(eng: Engine, e: Entity, dest: SpokesDest): XY | null {
  const m = eng.map!, p = eng.player, { ox, oy } = off(eng)
  const far = () => { for (let k = 0; k < 80; k++) { const a = Math.random() * Math.PI * 2, r = rnd(18, 32); const x = Math.floor(p.x + Math.cos(a) * r) + 0.5, y = Math.floor(p.y + Math.sin(a) * r) + 0.5; if (floorAt(eng, x, y) && bfsPath(eng, e.x, e.y, x, y)) return { x, y } } return null }
  if (dest === 'maid') { const md = findMaid(eng); if (md) return { x: md.x, y: md.y }; const at = far(); return at ? (spawnMaid(eng, at) ? at : null) : null }
  if (dest === 'bellhop') { const bh = findBellhop(eng); if (bh) return { x: bh.x, y: bh.y }; const at = far(); return at ? (spawnBellhop(eng, { ...at, f: Math.atan2(p.y - at.y, p.x - at.x) }) ? at : null) : null }
  if (dest === 'concierge') { const dk = conciergeDesk(eng); if (dk) return { x: dk.ax - ox + Math.cos(dk.f) * 1.4, y: dk.ay - oy + Math.sin(dk.f) * 1.4 }; return far() }
  if (dest === 'exit') {
    let best: XY | null = null, bd = Infinity
    for (const x of m.exits) { const d = Math.hypot(x.x + 0.5 - e.x, x.y + 0.5 - e.y); if (d < bd) { bd = d; best = { x: x.x + 0.5, y: x.y + 0.5 } } }
    return best
  }
  // dining：窗口里最近的餐厅（[chef] 有厨师后场的餐厅 = 正门里面几步的地毯上；旧扫描跳过后场）
  const cs = chefDiningSpot(eng); if (cs) return cs
  const seed = m.inf!.seed
  let best: XY | null = null, bd = Infinity
  for (let y = 1; y < m.h - 1; y += 3) for (let x = 1; x < m.w - 1; x += 3) {
    const d = Math.hypot(x - e.x, y - e.y); if (d >= bd || d > 70) continue
    if (l5RegionAt(seed, x + ox, y + oy)?.variant === 'dining' && floorAt(eng, x + 0.5, y + 0.5) && !chefIsService(eng, x + 0.5, y + 0.5)) { bd = d; best = { x: x + 0.5, y: y + 0.5 } }
  }
  return best
}
function dangerSpot(eng: Engine, e: Entity): XY | null {
  const m = eng.map!, seed = m.inf!.seed, { ox, oy } = off(eng)
  let best: XY | null = null, bd = Infinity
  for (let y = 1; y < m.h - 1; y += 2) for (let x = 1; x < m.w - 1; x += 2) {
    const d = Math.hypot(x - e.x, y - e.y); if (d >= bd || d > SK.dangerDetour) continue
    const v = l5RegionAt(seed, x + ox, y + oy)?.variant
    if ((v === 'mothnest' || v === 'boilerroom') && floorAt(eng, x + 0.5, y + 0.5)) { bd = d; best = { x: x + 0.5, y: y + 0.5 } }
  }
  return best
}
/** 最近的地板格中心（2 格内）；本身就是地板 = 原点 */
function nearFloor(eng: Engine, x: number, y: number, R = 2): XY | null {
  if (floorAt(eng, x, y)) return { x, y }
  let best: XY | null = null, bd = Infinity
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const cx = Math.floor(x) + dx + 0.5, cy = Math.floor(y) + dy + 0.5, d = Math.hypot(cx - x, cy - y); if (d < bd && floorAt(eng, cx, cy)) { bd = d; best = { x: cx, y: cy } } }
  return best
}
// ---------- 寻路（瓦片 BFS；地板 = tiles 1，排除实心结构）----------
function floorAt(eng: Engine, x: number, y: number): boolean {
  const m = eng.map!; const tx = Math.floor(x), ty = Math.floor(y)
  if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1) return false
  return m.tiles[ty * m.w + tx] === 1 && !solidTile(eng, tx, ty)
}
const SOLID = new WeakMap<object, { n: number; set: Set<number> }>()
function solidTile(eng: Engine, tx: number, ty: number): boolean {
  const m = eng.map!
  let c = SOLID.get(m.structures)
  if (!c || c.n !== m.structures.length) { const set = new Set<number>(); for (const s of m.structures) if (s.solid || /table|desk|chair|sofa|stool/.test(s.kind)) for (let y = s.y; y < s.y + (s.h || 1); y++) for (let x = s.x; x < s.x + (s.w || 1); x++) set.add(y * m.w + x); c = { n: m.structures.length, set }; SOLID.set(m.structures, c) }
  return c.set.has(ty * m.w + tx)
}
/** [l5 收尾] 拉直用：沿线每 0.2 m 取样，兔身两侧 ±0.22 m 不碰实心 / 桌椅瓦片 */
export function clearWalk(eng: Engine, a: XY, b: XY): boolean {
  const m = eng.map!, d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 0.2))
  const nx = -(b.y - a.y) / (d || 1), ny = (b.x - a.x) / (d || 1)
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t
    for (const o of [-0.22, 0, 0.22]) { const tx = Math.floor(x + nx * o), ty = Math.floor(y + ny * o); if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] !== 1 || solidTile(eng, tx, ty)) return false }
  }
  return true
}
/** 瓦片 BFS（8 邻接、不切墙角）→ 折线（地图坐标，瓦片中心；拉直：有视线就跳过） */
export function bfsPath(eng: Engine, x0: number, y0: number, x1: number, y1: number, maxN = 40000): XY[] | null {
  const m = eng.map!; const W = m.w
  const sx = Math.floor(x0), sy = Math.floor(y0), tx = Math.floor(x1), ty = Math.floor(y1)
  const ok = (x: number, y: number) => x >= 1 && y >= 1 && x < m.w - 1 && y < m.h - 1 && m.tiles[y * W + x] === 1 && !solidTile(eng, x, y)
  if (!ok(tx, ty)) return null
  const prev = new Int32Array(m.w * m.h).fill(-1)
  const q = new Int32Array(m.w * m.h)
  let h = 0, t = 0
  const s0 = sy * W + sx; prev[s0] = s0; q[t++] = s0
  const goal = ty * W + tx
  let found = s0 === goal, n = 0
  while (h < t && !found && n++ < maxN) {
    const c = q[h++], cx = c % W, cy = (c - cx) / W
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = cx + dx, ny = cy + dy
      if (!ok(nx, ny) || (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy)))) continue
      const ni = ny * W + nx; if (prev[ni] >= 0) continue
      prev[ni] = c; q[t++] = ni
      if (ni === goal) { found = true; break }
    }
  }
  if (!found) return null
  const pts: XY[] = []
  for (let c = goal; c !== s0; c = prev[c]) pts.push({ x: (c % W) + 0.5, y: Math.floor(c / W) + 0.5 })
  pts.reverse()
  pts[pts.length - 1] = { x: x1, y: y1 }
  // 拉直
  const out: XY[] = []
  let cur = { x: x0, y: y0 }, i = 0
  while (i < pts.length) {
    let j = pts.length - 1
    while (j > i && !(eng.los(cur.x, cur.y, pts[j].x, pts[j].y) && clearWalk(eng, cur, pts[j]))) j-- // [l5 收尾] 拉直不只看视线：桌子不挡视线，兔子曾从桌底钻过去
    out.push(pts[j]); cur = pts[j]; i = j + 1
  }
  return out
}

// ---------- 兔子主更新 ----------
export function updateWindup(eng: Engine, e: Entity, dt: number) {
  const w = ensureWindup(e), p = eng.player, { ox, oy } = off(eng)
  if (e.presentationPending) return
  w.modeT += dt; w.life += dt; w.stopCd = Math.max(0, w.stopCd - dt)
  e.state = 'idle'
  const d = Math.hypot(p.x - e.x, p.y - e.y)
  // 你的移动（判停下 / 背着走）
  const mvx = p.x - w.lastPx, mvy = p.y - w.lastPy; w.lastPx = p.x; w.lastPy = p.y
  const sp = Math.hypot(mvx, mvy) / Math.max(dt, 1e-4)
  const toward = sp > 0.4 ? (mvx * (e.x - p.x) + mvy * (e.y - p.y)) / (Math.hypot(mvx, mvy) * Math.max(d, 1e-3)) : 0
  w.idleT = sp < 0.25 ? w.idleT + dt : 0
  w.awayT = sp > 0.4 && toward < -0.35 ? w.awayT + dt : 0
  w.farT = d > SK.lostR ? w.farT + dt : 0
  // 汇报
  if (!w.reported && eng.hotel.attn >= SK.reportAttn && d < 10 && eng.los(e.x, e.y, p.x, p.y) && inL5(eng)) {
    w.reported = true
    if (report(eng, '……它的眼睛是我的眼睛。对不起。')) eng.msg('发条兔的眼睛闪了一下红光。远处有人在听。', 'lore')
  }
  switch (w.mode) {
    case 'wait': // L5 里遇到的：停在你前方回头看你，等你走近
      e.facing = Math.atan2(p.y - e.y, p.x - e.x)
      if (d < 3) { if (planRoute(eng, e)) { setRb(w, 'lead'); spokesSave(eng).n.follow++ } else setRb(w, 'spent') }
      else if (w.modeT > SK.wildWait) removeEnt(eng, e)
      else if (Math.random() < dt * 0.25) w.seq++ // 时不时再回头看一次（rabbitStop 重播）
      return
    case 'lead': {
      // 不跟了：停下回头
      // （大堂里的不等人：一路跳向正门——跟着它出门的人，它在 L5 接着带）
      if (!w.lobby && ((w.idleT > SK.stopIdle && d > 2.5) || w.awayT > SK.awayT || (d > SK.followR && w.modeT > 1.5))) { stopRabbit(eng, e, w); return }
      const spd = d < 3 ? SK.rbNear : SK.rbSpeed
      w.speed = spd
      w.hopT += dt * (spd / WINDUP_ANIM_SPEED)
      let left = spd * dt
      while (left > 0 && w.pi < w.path.length) {
        const t = w.path[w.pi], tx = t.x - ox, ty = t.y - oy, dx = tx - e.x, dy = ty - e.y, dd = Math.hypot(dx, dy)
        if (dd < 1e-3) { w.pi++; continue }
        e.facing = Math.atan2(dy, dx)
        if (left < dd) { e.x += dx * (left / dd); e.y += dy * (left / dd); break }
        e.x = tx; e.y = ty; left -= dd; w.pi++
      }
      e.z = floorHeight(eng.map!, e.x, e.y)
      if (w.pi >= w.path.length) {
        if (w.lobby) { rt(eng).doorRb = { invite: w.invite, at: rt(eng).clock }; removeEnt(eng, e); return } // 跳出了大堂正门
        if (d < 5) rabbitArrive(eng, e, w)
        else stopRabbit(eng, e, w)
      }
      return
    }
    case 'stop':
      e.facing = Math.atan2(p.y - e.y, p.x - e.x)
      if (w.farT > SK.giveUp) { setRb(w, 'spent'); eng.msg('远处传来一声「咔哒」。发条走完了。', 'lore'); return }
      if (w.modeT > 1.2 && d < SK.followR - 1 && w.awayT === 0 && (d < 1.75 || w.idleT < 0.5)) { setRb(w, 'lead'); if (w.pi >= w.path.length && !w.lobby) rabbitArrive(eng, e, w) }
      else if (w.modeT > WINDUP_LEN.rabbitStop + 1.5 && Math.random() < dt * 0.4) w.seq++ // 再回头看一次
      return
    case 'spent':
      if (w.modeT > SK.spentLife) removeEnt(eng, e)
      return
    case 'out': return
  }
}
function stopRabbit(eng: Engine, _e: Entity, w: WindupEntState) {
  setRb(w, 'stop')
  spokesSave(eng).n.stop++
  if (w.stopCd <= 0) { w.stopCd = SK.stopCd; addAttn(eng, SK.stopAttn) }
}
/** 到了：交给员工 / 带进餐厅 / （自由之后）出口 */
export function rabbitArrive(eng: Engine, _e: Entity, w: WindupEntState) {
  const p = eng.player
  setRb(w, 'spent')
  const k = w.invite ? 1.5 : 1
  switch (w.dest) {
    case 'concierge': {
      addAttn(eng, SK.staffAttn * k)
      conciergeIntercept(eng, 'track')
      eng.msg('兔子停在一双擦得发亮的皮鞋前，咔哒一声，不动了。你身后有人轻轻咳了一声。', 'lore')
      break
    }
    case 'maid': {
      addAttn(eng, SK.staffAttn * k)
      const md = findMaid(eng); if (md) maidHear(eng, md, p.x, p.y, 30, true)
      eng.msg('兔子撞在一辆清洁车的轮子上，翻倒了，发条还在空转。推车后面的人慢慢转过头来。', 'lore')
      break
    }
    case 'bellhop': {
      addAttn(eng, SK.staffAttn * k)
      const bh = findBellhop(eng); if (bh) bellhopRing(eng, bh, 'annoyed')
      eng.msg('兔子停在行李员脚边。他低头看了它一眼，摇响了那一声沉闷的长铃。', 'lore')
      break
    }
    case 'dining': {
      addAttn(eng, SK.diningAttn * k)
      p.hunger = Math.max(0, p.hunger - SK.diningHunger)
      const md = findMaid(eng); if (md) maidHear(eng, md, p.x, p.y, 20, false)
      eng.msg('兔子停在一张铺好白桌布的长桌下。空气里是烤肉的香味——你突然饿得发慌。', 'lore')
      chefRabbitDelivered(eng) // [chef] 送到厨师这里：后厨的人看见你了（盯上）
      break
    }
    case 'exit': {
      eng.msg('兔子停在出口前，转过身，朝你点了点头。发条慢慢走完了。', 'lore')
      rel(eng, 3)
      break
    }
    default: break
  }
}
// ---------- 抓住 / 砸坏 ----------
function catchTarget(eng: Engine): Entity | null {
  if (!inL5(eng) && !inLobby(eng)) return null
  const p = eng.player
  let best: Entity | null = null, bd = SK.catchR
  for (const e of findWindups(eng)) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e } }
  return best
}
export function catchRabbit(eng: Engine, e: Entity): boolean {
  const sv = spokesSave(eng)
  removeEnt(eng, e)
  sv.n.caught++
  give(eng, 'windupgear')
  addAttn(eng, SK.catchAttn)
  eng.msg('你一把按住发条兔。它的腿在你手心里蹬了几下，钥匙咔哒咔哒倒转——然后停了。你拧下了里面的发条零件。', 'loot')
  const g = findSpokes(eng); if (g?.gr && inLobby(eng)) spokesSay(eng, '哎呀！小兔子很怕痒的！', '好。好。少一只。', 3.6)
  audio.uiTick()
  return true
}
export function breakRabbit(eng: Engine, e: Entity) {
  const sv = spokesSave(eng)
  e.hp = 0; e.dead = true
  removeEnt(eng, e)
  sv.n.broken++
  dropItem(eng, 'windupgear', e.x, e.y)
  addAttn(eng, SK.catchAttn)
  eng.msg('发条兔的铁皮壳裂开了，弹簧和齿轮撒了一地。有一个零件还在地上转。', 'loot')
}

/** 渲染层预热 LOD1：在大堂里 */
export function spokesWarmHint(eng: Engine): boolean { return inLobby(eng) && !spokesSave(eng).freed }
/** 海报：读了指向 L5；之后下一次进 L5 浮出一扇「大堂」门 */
export function spokesPosterRead(eng: Engine) {
  const sv = spokesSave(eng)
  sv.n.poster++
  eng.msg('「恐怖旅馆诚挚邀请您入住！一流的客房，一流的餐厅，一流的员工！大堂永远为您敞开！」', 'lore')
  eng.msg('海报一角加印了一行烫金小字：「每晚两场——餐厅现场，爵士脑乐队！四位乐手，绝无危险！」', 'lore') // [jazz] 演出预告
  eng.msg('海报底下印着一行小字：从 Level 4 年久失修的古典楼梯一直往下走；或者在 Level 3 修好那部电梯。背面有人用铅笔写了两个字：「别来」。', 'lore')
  if (sv.freed) { eng.msg('海报上的女人在笑。你知道她已经不在那儿了。', 'system'); return }
  if (!sv.poster) { sv.poster = 1; eng.msg('到了 Level 5，大堂的门会自己找到你。', 'system') }
  if (eng.levelDef.id === 5) { const r = rt(eng); if (r.posterT < 0 && !sv.posterDone) r.posterT = r.l5T + rnd(SK.posterDoor[0], SK.posterDoor[1]) }
}

// ---------- 拍肩：野兽的握点（root 空间）——beastAI 'visit' 每帧问这里 ----------
export function spokesVisitGrip(eng: Engine, b: Entity): [number, number, number] | null {
  const g = findSpokes(eng); if (!g) return null
  const sh = spokesShoulder(g)
  return beastToRoot(b, sh.x, sh.y, sh.h - (b.z ?? 0))
}
