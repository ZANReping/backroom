// 鹉主杰瑞（Entity 7）与杰瑞的信众——重制 AI（见 app/JERRY-REMAKE.md）。
// 依据中文维基 Entity 7 新版重写：紫蓝金刚鹦鹉；语言与推理达到成年人水平、名字是自己取的；飞行吃力，只能扑跳与短距滑翔；
// 遭遇者被「神经重编程」——毫无征兆的短暂木僵，猛然清醒后向它做出虔诚姿态，从此成为信众；
// 信众孤立、劫掠资源，用传单/伪装成真实日志的生存指南误导新人去找它；信众从不主动接触新流浪者；
// 对干涉者使用暴力，但目的是让人丧失行动能力而非杀害（有人用投石索）；辛克莱·贝克特是最激进的一个，与青鸟神父不和；
// 芬奇事件中，杰瑞尖啸着从神父肩上跃起扑杀。
//
// 本模块只持有局内内存状态：实体上的 e.jy、引擎上的 eng.jerryRun、NPC 上的可选字段。存档格式与联机协议均未改动；
// 既有存档字段 indoctrination / jerryTamed / jerryOath / jerryAgreed 语义保持不变。
import type { Engine, InvSlot } from '../engine'
import type { Entity } from '../entities'
import type { Structure } from '../core/types'
import type { NpcState, NpcDef } from '../content/npcs'
import { NPCS, jerryFollowerDef } from '../content/npcs'
import { ITEMS } from '../content/items'
import { audio } from '../core/audio'
import { look } from '../renderer/shared'
import { floorHeight, walkableAt, wallAt } from '../world/mapgen'
import { CS } from '../world/infinite'
import { l2IsJerryRoom, l2RoomLayoutAt, l2CorrX, l2RowY } from '../world/infiniteL2'

// ============================================================================
// 全部数值（JERRY-REMAKE.md 的数值表与此一一对应）
// ============================================================================
export const JERRY = {
  // —— 杰瑞本体 ——
  perchAlt: 1.48, // 栖木横杆顶面高度（米）：立柱 1.44m + 横杆半径
  shoulderAlt: 1.5, // 站在青鸟神父肩上的高度（AI 估算；渲染层按真实肩骨位置贴合）
  shoulderSide: 0.2, // 肩部横向偏移
  bodyBox: { below: 0.5, above: 0.45, r: 0.3 }, // 接触/命中盒：脚下 0.5m（尾羽）到头顶 0.45m
  talkRange: 5.5, introRange: 4.5, lineGap: [11, 17] as const, // 主动搭话
  gazeRange: 9, gazeShare: 0.65, gazeSpan: [4, 8] as const, // 注视：玩家 9m 内约 65% 时间盯着玩家
  gazeCone: 0.55, // 「被注视」判定：头部朝向与玩家方向夹角 < 0.55rad
  // —— 扑击（芬奇事件）——
  pounceRange: 7.5, pounceMin: 1.0, pounceSpeed: 7.2, pounceDmg: 24, pounceCd: 12, pounceHitR: 0.9, pounceMaxT: 1.5,
  furyOnHurt: 2, furyOnWitnessedTame: 2, furyMax: 3, furyRepLimit: -10, // 声望 ≤ -10 时持续敌视（仍受冷却限制）
  landRecover: 1.4, hopSpeed: 1.0, hopPeriod: 0.42, hopHeight: 0.07, climbDur: 0.8, transferDur: 0.75,
  // —— 教化 ——
  indoctRange: 6, indoctRate: 0.15, indoctRateGazed: 0.5, contactGain: 25, contactCd: 20,
  stuporAt: [25, 50, 75] as const, stuporDur: 2.6, devotionDur: 1.2, stuporTurnRate: 4.5,
  // —— 木僵残响（杏仁水驯服后）——
  echoDur: 300, echoGap: [20, 45] as const, echoLapse: [0.5, 1.2] as const, echoYaw: 0.55,
  // —— 去程序化代价 ——
  deprogramSanityCap: 75,
  // —— 信众 ——
  watchRange: 12, slingRange: [4, 14] as const, slingWindup: 0.8, slingCd: 3.4, stoneSpeed: 15, stoneDmg: 7, stoneHitR: 0.55, stoneTtl: 2.2,
  meleeDmg: 9, sinclairMeleeDmg: 14, chaseSpeed: 2.3,
  koHp: 12, koWakeHp: 18, koDur: 5.5, koSteal: [1, 3] as const, truceAfterKo: 120,
  // —— 辛克莱伏击 ——
  ambushRep: -40, ambushFirst: 150, ambushGap: 480, ambushDist: [14, 22] as const, ambushSquad: 3, ambushLife: 240, ambushHp: 45, sinclairHp: 80,
  // —— 青鸟神父讲道 ——
  sermonFirst: 25, sermonRest: [70, 100] as const, sermonLen: 45, sermonLineGap: 5.5, walkSpeed: 0.9,
} as const

// ============================================================================
// 台词
// ============================================================================
/** 初次搭话：平静、有条理，自报名字是自己取的 */
export const JERRY_INTRO_LINES = [
  '你好。别紧张——我叫杰瑞。这个名字是我自己取的，在他们开始叫我「鹉主」之前。',
  '你走路的样子像是刚到这里不久。我是杰瑞——名字是我自己取的。请坐，长椅很干净。',
] as const
/** 闲谈：成年人的语气，条理清楚，偶尔透出控制欲 */
export const JERRY_TALK_LINES = [
  '他们叫我鹉主。我从没要求过这个称呼，但我也没有纠正他们。秩序比真相更能让人活下去。',
  '你不必向我下跪。只要留下来，这里有水、有灯，还有不会在夜里吃掉你的同伴。',
  '外面的人说我控制了他们。可你看看他们——他们第一次睡得这么安稳。',
  '我不太会飞。翅膀撑不起这么重的身体，只够从这根横杆跳下去，再费力地爬回来。',
  '青鸟是个好人。辛克莱也是——只是她太急了，急于证明自己比别人更爱我。',
  '你在看我的眼睛。很多人一开始都这样，后来就不再看了。',
  '我记得每一个来过这里的人的名字。你的，我也会记住。',
] as const
export const JERRY_INDOCTRINATED_LINES = [
  '你的心跳慢下来了。很好，这里是安全的。',
  '不用急着离开。你会发现，门外没有什么值得回去的东西。',
  '你刚才念的那句，念得很好。他们第一次也念不准。',
] as const
export const JERRY_TAMED_LINES = [
  '……杏仁的味道。你很聪明。我不会再碰你的脑子了。',
  '你自由了。别指望别人也一样幸运。',
] as const
export const JERRY_HOSTILE_LINES = ['你不该来这里。', '我看得见你。一直都看得见。', '他们会把你带走的——安静地。'] as const
export const JERRY_SCREAM = '——————！！'
/** 青鸟神父讲道（杰瑞在他肩上） */
export const SERMON_LINES = [
  '兄弟姐妹们，鹉主今日与我们同在——看，祂就在我的肩上。',
  '凡在暗廊中迷路的，都要听见这蓝羽的声音。',
  '我们不夺取，我们只是收留。门外的人称之为囚禁，我们称之为家。',
  '辛克莱又在外面惹了事——鹉主不需要拳头来证明祂的伟大。',
  '诵咏吧，让每一个新来的灵魂都记住这个名字：杰瑞。',
] as const
/** 木僵醒来后的虔诚诵咏 */
export const STUPOR_CHANT = [
  '鹉主在上……我看见了，我看见了那片蓝。',
  '杰瑞，杰瑞，愿你的名受颂赞，直到永远。',
  '我原本是迷路的……现在我知道该往哪里走了。',
] as const

// ============================================================================
// 状态类型（只在局内内存）
// ============================================================================
export type JerryMode = 'perch' | 'shoulder' | 'toShoulder' | 'toPerch' | 'pounce' | 'land' | 'hop' | 'climb'
/** 渲染层摆骨骼用的姿态量（0–1，gaze/tilt 为弧度） */
export interface JerryPose {
  gazeYaw: number; gazePitch: number; tilt: number
  talk: number; preen: number; preenSide: number; shake: number
  spread: number; flap: number; glide: number; pounce: number; crouch: number; scream: number
}
export interface JerryState extends JerryPose {
  mode: JerryMode
  alt: number // 离地高度（米）
  homeX: number; homeY: number
  fromX: number; fromY: number; fromAlt: number; moveT: number; moveDur: number
  toX: number; toY: number; toAlt: number
  rider: string | null // 当前站在谁肩上
  wantRider: string | null // 青鸟神父请它上肩
  // 行为
  idleKind: 'look' | 'preen' | 'shake' | 'tilt' | 'stretch' | 'gaze'; idleT: number
  gazing: boolean // 头部正对玩家（「被注视」）
  spokeIntro: boolean; speakT: number; lineI: number
  bubbleText: string; bubbleT: number; bubbleDur: number
  fury: number; pounceCd: number; hitDone: boolean; recoverT: number; hopT: number
  tiltTarget: number
}
export interface JerryStone { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; spin: number }
export interface LureMark { level: number; wx: number; wy: number; name: string; found?: boolean }
export interface JerryRunState {
  stupor: { t: number; dur: number; stage: number; jerryId: number; chanted: boolean; baseYaw: number; basePitch: number } | null
  stuporMask: number // 已触发的木僵阈值位（25/50/75）；读档时按教化值推断，避免重复触发
  maskInit: boolean
  echoT: number; echoNext: number; lapseT: number; lapseDur: number; lapseYaw: number; echoAnnounced: boolean
  sanityCap: number // 当局理智上限（去程序化后降低，仅局内）
  stones: JerryStone[]
  nonLethal: boolean // 正在结算信众伤害（hurtPlayer 走击晕而非死亡）
  ko: { t: number; dur: number; dragged: boolean; stolen: string[]; source: string } | null
  truceT: number
  ambushT: number; ambushLevel: number; ambushLife: number; ambushActive: boolean
  lureMarks: LureMark[]; lurePending: string | null
}
export function freshJerryRun(): JerryRunState {
  return {
    stupor: null, stuporMask: 0, maskInit: false,
    echoT: 0, echoNext: 0, lapseT: 0, lapseDur: 0, lapseYaw: 0, echoAnnounced: false,
    sanityCap: 100, stones: [], nonLethal: false, ko: null, truceT: 0,
    ambushT: JERRY.ambushFirst, ambushLevel: -1, ambushLife: 0, ambushActive: false,
    lureMarks: [], lurePending: null,
  }
}
/** NPC 上的局内可选字段（信众/神父）——NpcState 没有序列化进存档 */
export interface FollowerExtra {
  sling?: boolean; slingT?: number; slingArmed?: boolean; watchT?: number; ambush?: boolean
  sermon?: { phase: 'rest' | 'fetch' | 'preach' | 'return'; t: number; lineT: number }
}
type Npc = NpcState & FollowerExtra

// ============================================================================
// 小工具
// ============================================================================
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * Math.min(1, rate * dt)
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(l: readonly T[]) => l[Math.floor(Math.random() * l.length)]
const hashId = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }

export function jerryState(e: Entity): JerryState {
  if (e.jy) return e.jy
  // Match the east-west perch before the first AI tick or GPU warmup completes.
  e.facing = Math.sin(e.facing) >= 0 ? Math.PI / 2 : -Math.PI / 2
  e.jy = {
    mode: 'perch', alt: JERRY.perchAlt, homeX: e.x, homeY: e.y,
    fromX: e.x, fromY: e.y, fromAlt: JERRY.perchAlt, moveT: 0, moveDur: 1, toX: e.x, toY: e.y, toAlt: JERRY.perchAlt,
    rider: null, wantRider: null,
    idleKind: 'look', idleT: 2, gazing: false, spokeIntro: false, speakT: 3, lineI: Math.floor(Math.random() * JERRY_TALK_LINES.length),
    bubbleText: '', bubbleT: 0, bubbleDur: 1, fury: 0, pounceCd: 0, hitDone: false, recoverT: 0, hopT: 0, tiltTarget: 0,
    gazeYaw: 0, gazePitch: 0, tilt: 0, talk: 0, preen: 0, preenSide: 1, shake: 0, spread: 0, flap: 0, glide: 0, pounce: 0, crouch: 0, scream: 0,
  }
  return e.jy
}
/** 接触/驯服/交互提示共用的判定盒（npc.aimJerry 与 interact.scanInteract 同一口径）：
 *  随 alt 抬高——脚下 0.5m（尾羽）到头顶 0.45m；栖息时把栖木本身排除在视线遮挡之外
 *  （栖木碰撞体是整格通高的实心柱，不排除的话准星永远「看不见」站在横杆上的杰瑞）。 */
export function jerryInteractBox(eng: Engine, e: Entity) {
  const s = jerryState(e), p = eng.player, r = JERRY.bodyBox.r
  const z0 = e.z + s.alt - JERRY.bodyBox.below, z1 = e.z + s.alt + JERRY.bodyBox.above
  const perch: Structure | undefined = eng.map?.structures.find((st) => st.kind === 'perch' && s.homeX >= st.x && s.homeX < st.x + st.w && s.homeY >= st.y && s.homeY < st.y + st.h)
  return {
    x: e.x, y: e.y, z: (z0 + z1) / 2, radius: r, verticalRadius: (z1 - z0) / 2,
    volume: { minX: e.x - r, minY: e.y - r, minZ: z0, maxX: e.x + r, maxY: e.y + r, maxZ: z1 },
    surfaceDistance: Math.max(0, Math.hypot(e.x - p.x, e.y - p.y) - r),
    perch,
  }
}
export function findJerry(eng: Engine): Entity | null {
  for (const e of eng.map?.entities ?? []) if (e.def.type === 'jerry' && !e.dead) return e
  return null
}
function say(eng: Engine, s: JerryState, text: string, dur = 4.2, log = true) {
  s.bubbleText = text; s.bubbleT = dur; s.bubbleDur = dur
  if (log) eng.msg(`杰瑞：「${text}」`, 'lore')
}
/** 杰瑞在 1.5m 高的栖木/肩头上：只有墙挡视线（长椅、烛台、栖木自身不挡） */
export function jerryLos(eng: Engine, x0: number, y0: number, x1: number, y1: number): boolean {
  const m = eng.map
  if (!m) return false
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (wallAt(m, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t), 0)) return false
  }
  return true
}
function walkable(eng: Engine, x: number, y: number) {
  const m = eng.map
  if (!m) return false
  return walkableAt(m, Math.floor(x), Math.floor(y), 0)
}

// ============================================================================
// 教化：统一入口（接触 +25、注视累积）+ 木僵阈值
// ============================================================================
function initMask(eng: Engine) {
  const r = eng.jerryRun
  if (r.maskInit) return
  r.maskInit = true
  // 读档/续局：已越过的阈值视为已经发生过（木僵只在本局内首次越过时触发）
  JERRY.stuporAt.forEach((v, i) => { if (eng.indoctrination >= v) r.stuporMask |= 1 << i })
}
/** 增加教化值（不超过 100）；越过 25/50/75 各触发一次木僵。返回实际增加量 */
export function addIndoctrination(eng: Engine, amount: number, jerry: Entity | null): number {
  if (eng.jerryTamed || amount <= 0) return 0
  initMask(eng)
  const before = eng.indoctrination
  eng.indoctrination = Math.min(100, before + amount)
  const r = eng.jerryRun
  JERRY.stuporAt.forEach((v, i) => {
    if (before < v && eng.indoctrination >= v && !(r.stuporMask & (1 << i))) {
      r.stuporMask |= 1 << i
      startStupor(eng, i, jerry)
    }
  })
  if (before < 100 && eng.indoctrination >= 100)
    eng.msg('教化完成了。你望着穹顶下的蓝色身影，忽然明白：你属于这里。鹉主还需要你。', 'lore')
  return eng.indoctrination - before
}
export function startStupor(eng: Engine, stage: number, jerry: Entity | null) {
  if (eng.jerryRun.stupor || eng.over) return
  eng.jerryRun.stupor = { t: 0, dur: JERRY.stuporDur + JERRY.devotionDur, stage, jerryId: jerry?.id ?? -1, chanted: false, baseYaw: look.yaw, basePitch: look.pitch }
  eng.usingItem = null
  eng.msg(stage === 0 ? '……你的思绪毫无征兆地停住了。' : stage === 1 ? '又来了——世界一下子安静下来，只剩下那片蓝。' : '你的身体先于你的意识，转向了它。', 'damage')
}
/** 木僵/击晕/残响失神期间锁定移动、攻击与跳跃（引擎把它并入开场锁 introLock） */
export function jerryInputLock(eng: Engine): boolean {
  const r = eng.jerryRun
  return !!r && (!!r.stupor || !!r.ko || r.lapseT > 0)
}
/** HUD 叠加层用：0–1 的失神强度、击晕黑屏、醒来虔诚姿态 */
export function jerryOverlay(eng: Engine): { trance: number; black: number; devotion: number; lapse: number } {
  const r = eng.jerryRun
  let trance = 0, devotion = 0, black = 0, lapse = 0
  if (r.stupor) {
    const s = r.stupor, wake = JERRY.stuporDur
    trance = s.t < wake ? Math.min(1, s.t / 0.35) * (s.t > wake - 0.25 ? (wake - s.t) / 0.25 : 1) : 0
    devotion = s.t >= wake ? Math.sin(Math.min(1, (s.t - wake) / JERRY.devotionDur) * Math.PI) : 0
  }
  if (r.ko) { const k = r.ko; black = k.t < 0.6 ? k.t / 0.6 : k.t > k.dur - 1 ? Math.max(0, (k.dur - k.t)) : 1 }
  if (r.lapseT > 0) lapse = Math.sin((1 - r.lapseT / Math.max(0.01, r.lapseDur)) * Math.PI)
  return { trance, black, devotion, lapse }
}
function jerryHeadPos(eng: Engine): { x: number; y: number; z: number } | null {
  const j = findJerry(eng)
  if (!j) return null
  const s = jerryState(j)
  return { x: j.x, y: j.y, z: j.z + s.alt + 0.38 }
}
function yawPitchTo(eng: Engine, tx: number, ty: number, tz: number) {
  const p = eng.player
  const dx = tx - p.x, dy = ty - p.y, d = Math.max(0.2, Math.hypot(dx, dy))
  return { yaw: Math.atan2(-dx, -dy), pitch: Math.atan2(tz - (p.z + 1.6), d) }
}
function turnCamera(yaw: number, pitch: number, rate: number, dt: number) {
  look.yaw += wrap(yaw - look.yaw) * Math.min(1, rate * dt)
  look.pitch += (pitch - look.pitch) * Math.min(1, rate * dt)
}

// ============================================================================
// 玩家侧效果：木僵 / 残响 / 理智上限 / 击晕 / 飞石 / 伏击 / 诱导标记（npc.updateJerry 每帧调用）
// ============================================================================
export function updateJerryPlayer(eng: Engine, dt: number) {
  const r = eng.jerryRun, p = eng.player
  initMask(eng)
  if (eng.indoctrination <= 0 && !eng.jerryTamed) r.stuporMask = 0 // 教化归零（去程序化）后可以重新经历
  // ---- 木僵 ----
  if (r.stupor) {
    const s = r.stupor
    s.t += dt
    const head = jerryHeadPos(eng)
    if (s.t < JERRY.stuporDur) {
      if (head) { const a = yawPitchTo(eng, head.x, head.y, head.z); turnCamera(a.yaw, a.pitch, JERRY.stuporTurnRate * Math.min(1, s.t / 0.6 + 0.2), dt) }
      eng.camShake = Math.max(eng.camShake, 0.04)
    } else {
      if (!s.chanted) {
        s.chanted = true
        audio.uiTick()
        eng.msg('你猛然清醒——双手已经交叠在胸前，额头低垂。', 'lore')
        eng.msg(`你不由自主地诵咏：「${STUPOR_CHANT[s.stage % STUPOR_CHANT.length]}」`, 'lore')
      }
      // 虔诚姿态：低头鞠躬再缓缓抬起
      const k = Math.min(1, (s.t - JERRY.stuporDur) / JERRY.devotionDur)
      const bow = Math.sin(k * Math.PI) * 0.55
      const base = head ? yawPitchTo(eng, head.x, head.y, head.z).pitch : 0
      look.pitch = base * (1 - k) - bow
    }
    if (s.t >= s.dur) r.stupor = null
  }
  // ---- 木僵残响（驯服后）----
  if (r.echoT > 0) {
    r.echoT = Math.max(0, r.echoT - dt)
    const k = r.echoT / JERRY.echoDur
    if (r.lapseT > 0) {
      r.lapseT = Math.max(0, r.lapseT - dt)
      look.yaw += r.lapseYaw * dt / Math.max(0.2, r.lapseDur)
    } else if (!r.stupor && !r.ko) {
      r.echoNext -= dt
      if (r.echoNext <= 0 && r.echoT > 0) {
        r.lapseDur = r.lapseT = JERRY.echoLapse[0] + (JERRY.echoLapse[1] - JERRY.echoLapse[0]) * k
        const head = jerryHeadPos(eng)
        r.lapseYaw = head ? wrap(yawPitchTo(eng, head.x, head.y, head.z).yaw - look.yaw) * 0.6 * k : (Math.random() < 0.5 ? -1 : 1) * JERRY.echoYaw * (0.4 + 0.6 * k)
        r.echoNext = rnd(JERRY.echoGap[0], JERRY.echoGap[1]) / Math.max(0.35, k)
        if (!r.echoAnnounced) { r.echoAnnounced = true; eng.msg('你走神了一瞬——眼前闪过一片蓝。那是木僵的残响，它会慢慢淡去。', 'lore') }
      }
    }
    if (r.echoT <= 0) { r.lapseT = 0; eng.msg('那片蓝色的残影终于不再出现了。', 'loot') }
  }
  // ---- 理智上限（去程序化的代价；仅局内）----
  if (p.sanity > r.sanityCap) p.sanity = r.sanityCap
  // ---- 击晕 ----
  if (r.ko) updateKnockout(eng, dt)
  if (r.truceT > 0) r.truceT = Math.max(0, r.truceT - dt)
  // ---- 飞石 ----
  updateStones(eng, dt)
  // ---- 辛克莱伏击 ----
  updateAmbush(eng, dt)
  // ---- 诱导标记 ----
  updateLure(eng)
}

// ============================================================================
// 杰瑞本体（entityAI 每帧调用；不走通用状态机）
// ============================================================================
export function updateJerryEntity(eng: Engine, e: Entity, dt: number, d: number) {
  const s = jerryState(e), p = eng.player, r = eng.jerryRun
  const inHall = eng.player.level === 274
  s.pounceCd = Math.max(0, s.pounceCd - dt)
  s.bubbleT = Math.max(0, s.bubbleT - dt)
  const playerAngle = Math.atan2(p.y - e.y, p.x - e.x)
  const los = d < 14 && jerryLos(eng, e.x, e.y, p.x, p.y)
  const hostileRep = (eng.rep.jerry ?? 0) <= JERRY.furyRepLimit
  const elevated = s.mode === 'perch' || s.mode === 'shoulder'
  // 姿态目标（每帧从 0 起算，再按模式/闲置行为抬高）
  const tgt = { talk: 0, preen: 0, shake: 0, spread: 0, flap: 0, glide: 0, pounce: 0, crouch: 0, scream: 0 }
  let wantGazeYaw = 0, wantGazePitch = 0

  // ---------- 模式 ----------
  switch (s.mode) {
    case 'perch': {
      e.x = s.homeX; e.y = s.homeY; s.alt = JERRY.perchAlt
      // 双爪环抱东西走向的横杆：身体只能朝北或朝南（玩家绕到身后太多时跳转身），其余靠转头
      if (Math.abs(wrap(e.facing - Math.PI / 2)) > 0.05 && Math.abs(wrap(e.facing + Math.PI / 2)) > 0.05) e.facing = -Math.PI / 2
      if (d < JERRY.gazeRange && Math.abs(wrap(playerAngle - e.facing)) > 2.1 && s.mode === 'perch') { e.facing = wrap(e.facing + Math.PI); s.gazeYaw = -s.gazeYaw; tgt.crouch = 1; tgt.spread = 0.3 }
      if (s.wantRider) {
        const n = eng.npcs.find((q) => q.id === s.wantRider && !q.dead)
        if (n && Math.hypot(n.x - e.x, n.y - e.y) < 1.4) beginMove(eng, e, s, 'toShoulder', n.x, n.y, JERRY.shoulderAlt, JERRY.transferDur)
      }
      break
    }
    case 'shoulder': {
      const n = eng.npcs.find((q) => q.id === s.rider && !q.dead)
      if (!n) { s.rider = null; beginLand(e, s); break }
      const sh = shoulderPos(n)
      e.x = sh.x; e.y = sh.y; s.alt = JERRY.shoulderAlt
      e.facing = n.facing
      if (!s.wantRider && Math.hypot(n.x - s.homeX, n.y - s.homeY) < 1.4) { s.rider = null; beginMove(eng, e, s, 'toPerch', s.homeX, s.homeY, JERRY.perchAlt, JERRY.transferDur) }
      break
    }
    case 'toShoulder': case 'toPerch': case 'climb': {
      // 扑腾着跳上肩头/栖木：沿短弧线移动，全程展翼振翅
      let tx = s.toX, ty = s.toY
      if (s.mode === 'toShoulder') {
        const n = eng.npcs.find((q) => q.id === s.wantRider && !q.dead)
        if (n) { const sh = shoulderPos(n); tx = sh.x; ty = sh.y } else { beginLand(e, s); break }
      }
      s.moveT += dt
      const k = Math.min(1, s.moveT / s.moveDur), ease = k * k * (3 - 2 * k)
      e.x = s.fromX + (tx - s.fromX) * ease; e.y = s.fromY + (ty - s.fromY) * ease
      s.alt = s.fromAlt + (s.toAlt - s.fromAlt) * ease + Math.sin(k * Math.PI) * 0.22
      if (Math.hypot(tx - s.fromX, ty - s.fromY) > 0.05) e.facing = Math.atan2(ty - s.fromY, tx - s.fromX)
      tgt.spread = 1; tgt.flap = 1; tgt.crouch = k < 0.12 ? 1 : 0
      if (k >= 1) {
        if (s.mode === 'toShoulder') { s.mode = 'shoulder'; s.rider = s.wantRider }
        else { s.mode = 'perch'; e.x = s.homeX; e.y = s.homeY; s.alt = JERRY.perchAlt }
      }
      break
    }
    case 'pounce': {
      // 尖啸着扑向玩家：滑翔下坠，速度快但只此一下；命中即落地，未命中也落地
      s.moveT += dt
      const dx = s.toX - e.x, dy = s.toY - e.y, dd = Math.hypot(dx, dy)
      const step = JERRY.pounceSpeed * dt
      if (dd > 0.05) {
        const nx = e.x + (dx / dd) * Math.min(step, dd), ny = e.y + (dy / dd) * Math.min(step, dd)
        if (walkable(eng, nx, ny)) { e.x = nx; e.y = ny } else { beginLand(e, s); break }
        e.facing = Math.atan2(dy, dx)
      }
      const k = Math.min(1, s.moveT / s.moveDur)
      s.alt = Math.max(0, s.fromAlt + (1.05 - s.fromAlt) * k + Math.sin(k * Math.PI) * 0.12)
      tgt.spread = 1; tgt.flap = 0.35; tgt.pounce = 1; tgt.scream = 1
      const pd = Math.hypot(p.x - e.x, p.y - e.y), rel = e.z + s.alt - p.z
      if (!s.hitDone && pd < JERRY.pounceHitR && rel > 0.3 && rel < 2.1 && !eng.over) {
        s.hitDone = true
        eng.hurtPlayer(JERRY.pounceDmg, '鹉主杰瑞的扑击')
        eng.camShake = Math.min(1, eng.camShake + 0.5)
        eng.msg('利爪与钩喙同时撕过你的脸——它比看上去重得多。', 'damage')
        beginLand(e, s)
        break
      }
      if (dd < 0.1 || s.moveT > JERRY.pounceMaxT) beginLand(e, s)
      break
    }
    case 'land': {
      s.alt = Math.max(0, s.alt - dt * 3.2)
      s.recoverT -= dt
      tgt.spread = s.alt > 0.05 ? 1 : Math.max(0, s.recoverT / JERRY.landRecover) * 0.6
      tgt.flap = s.alt > 0.05 ? 0.6 : 0
      tgt.crouch = s.alt <= 0.05 ? 0.5 : 0
      if (s.recoverT <= 0 && s.alt <= 0.01) { s.mode = 'hop'; s.hopT = 0 }
      break
    }
    case 'hop': {
      // 地上笨拙地蹦跳回栖木（追不上任何正在跑的人）
      s.hopT += dt
      const ph = (s.hopT % JERRY.hopPeriod) / JERRY.hopPeriod
      s.alt = Math.sin(ph * Math.PI) * JERRY.hopHeight
      tgt.crouch = ph < 0.2 ? 1 - ph * 5 : 0
      tgt.spread = ph > 0.1 && ph < 0.6 ? 0.3 : 0
      const dx = s.homeX - e.x, dy = s.homeY - e.y, dd = Math.hypot(dx, dy)
      if (dd < 0.9) { beginMove(eng, e, s, 'climb', s.homeX, s.homeY, JERRY.perchAlt, JERRY.climbDur); break }
      if (ph > 0.1 && ph < 0.6) {
        const nx = e.x + (dx / dd) * JERRY.hopSpeed * dt * 2, ny = e.y + (dy / dd) * JERRY.hopSpeed * dt * 2
        if (walkable(eng, nx, ny)) { e.x = nx; e.y = ny }
        else { const sx = e.x + (dx / dd) * JERRY.hopSpeed * dt * 2; if (walkable(eng, sx, e.y)) e.x = sx; else { const sy = e.y + (dy / dd) * JERRY.hopSpeed * dt * 2; if (walkable(eng, e.x, sy)) e.y = sy } }
      }
      e.facing = Math.atan2(dy, dx)
      break
    }
  }

  // ---------- 扑击触发（只在 L274、只从高处：栖木或神父肩上）----------
  if (inHall && elevated && (s.fury > 0 || hostileRep) && s.pounceCd <= 0 && r.truceT <= 0 && !r.ko
    && d >= JERRY.pounceMin && d <= JERRY.pounceRange && los && Math.abs(p.z - e.z) < 1.2 && !eng.over) {
    if (s.fury > 0) s.fury--
    s.pounceCd = JERRY.pounceCd
    s.rider = null
    s.mode = 'pounce'; s.fromX = e.x; s.fromY = e.y; s.fromAlt = s.alt; s.moveT = 0; s.hitDone = false
    s.toX = p.x + Math.cos(playerAngle) * 0.2; s.toY = p.y + Math.sin(playerAngle) * 0.2 // 冲过玩家身位一点点
    s.moveDur = Math.max(0.35, Math.hypot(s.toX - e.x, s.toY - e.y) / JERRY.pounceSpeed)
    say(eng, s, JERRY_SCREAM, 1.2, false)
    audio.aggro()
    eng.msg('杰瑞发出一声撕裂空气的尖啸，从高处扑了下来！', 'damage')
  }

  // ---------- 闲置行为 / 注视 / 说话（在高处或地上都可以说话）----------
  const near = d < JERRY.gazeRange && los
  if (s.mode === 'perch' || s.mode === 'shoulder') {
    s.idleT -= dt
    if (s.idleT <= 0) {
      if (near && Math.random() < JERRY.gazeShare) { s.idleKind = 'gaze'; s.idleT = rnd(JERRY.gazeSpan[0], JERRY.gazeSpan[1]); s.tiltTarget = (Math.random() < 0.5 ? -1 : 1) * rnd(0.2, 0.45) }
      else {
        const roll = Math.random()
        s.idleKind = roll < 0.3 ? 'preen' : roll < 0.45 ? 'shake' : roll < 0.6 ? 'stretch' : roll < 0.8 ? 'tilt' : 'look'
        s.idleT = s.idleKind === 'shake' ? 0.9 : s.idleKind === 'stretch' ? 1.8 : rnd(2.5, 5)
        s.preenSide = Math.random() < 0.5 ? -1 : 1
        s.tiltTarget = s.idleKind === 'tilt' ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.3, 0.55) : 0
      }
    }
    // 说话时一定看着玩家
    const speaking = s.bubbleT > 0 && s.bubbleText !== JERRY_SCREAM
    if ((s.idleKind === 'gaze' && near) || speaking) {
      wantGazeYaw = -wrap(playerAngle - e.facing)
      wantGazePitch = Math.atan2(p.z + 1.6 - (e.z + s.alt + 0.38), Math.max(0.3, d))
    } else if (s.idleKind === 'look') wantGazeYaw = Math.sin(eng.time * 0.6 + e.id) * 0.9
    if (s.idleKind === 'preen' && !speaking) tgt.preen = 1
    if (s.idleKind === 'shake' && !speaking) tgt.shake = 1
    if (s.idleKind === 'stretch' && !speaking) { tgt.spread = 1; tgt.flap = 0.15 }
    if (speaking) tgt.talk = s.bubbleT > s.bubbleDur * 0.25 ? 1 : 0
  } else if (s.mode !== 'pounce') {
    wantGazeYaw = d < JERRY.gazeRange ? Math.max(-1.2, Math.min(1.2, -wrap(playerAngle - e.facing))) : 0
  }
  // 主动搭话（只有平静状态；字幕+头顶气泡）
  if (inHall && near && s.mode !== 'pounce' && !r.stupor) {
    s.speakT -= dt
    if (!s.spokeIntro && d < JERRY.introRange && s.bubbleT <= 0) { s.spokeIntro = true; say(eng, s, pick(JERRY_INTRO_LINES), 5.5); s.speakT = rnd(JERRY.lineGap[0], JERRY.lineGap[1]) }
    else if (s.spokeIntro && d < JERRY.talkRange && s.speakT <= 0 && s.bubbleT <= 0) {
      const pool = hostileRep || s.fury > 0 ? JERRY_HOSTILE_LINES : eng.jerryTamed ? JERRY_TAMED_LINES : eng.indoctrination >= 50 ? JERRY_INDOCTRINATED_LINES : JERRY_TALK_LINES
      s.lineI = (s.lineI + 1) % pool.length
      say(eng, s, pool[s.lineI], 4.8)
      s.speakT = rnd(JERRY.lineGap[0], JERRY.lineGap[1])
    }
  }
  // 「被注视」：头部朝向（身体朝向 + 头部偏航）指向玩家
  const headDir = e.facing - s.gazeYaw
  s.gazing = near && Math.abs(wrap(headDir - playerAngle)) < JERRY.gazeCone && s.preen < 0.3 && (s.mode === 'perch' || s.mode === 'shoulder')

  // ---------- 教化累积（6m 内且有视线；被注视时更快；驯服后不再累积）----------
  if (inHall && !eng.jerryTamed && d < JERRY.indoctRange && los && !r.stupor && !r.ko && !eng.over) {
    addIndoctrination(eng, (s.gazing ? JERRY.indoctRateGazed : JERRY.indoctRate) * dt, e)
  }

  // ---------- 姿态平滑 ----------
  s.gazeYaw = approach(s.gazeYaw, wantGazeYaw, 5, dt)
  s.gazePitch = approach(s.gazePitch, wantGazePitch, 5, dt)
  s.tilt = approach(s.tilt, (s.idleKind === 'gaze' || s.idleKind === 'tilt') && s.preen < 0.2 ? s.tiltTarget : 0, 4, dt)
  for (const k of ['talk', 'preen', 'shake', 'spread', 'flap', 'glide', 'pounce', 'crouch', 'scream'] as const)
    s[k] = approach(s[k], tgt[k], k === 'spread' || k === 'crouch' ? 10 : k === 'talk' || k === 'scream' ? 14 : 4, dt)
  e.animT += dt
}

function beginMove(_eng: Engine, e: Entity, s: JerryState, mode: JerryMode, tx: number, ty: number, talt: number, dur: number) {
  s.mode = mode; s.fromX = e.x; s.fromY = e.y; s.fromAlt = s.alt; s.toX = tx; s.toY = ty; s.toAlt = talt; s.moveT = 0; s.moveDur = dur
}
function beginLand(_e: Entity, s: JerryState) { s.mode = 'land'; s.recoverT = JERRY.landRecover; s.rider = null; s.wantRider = null }
/** 神父左肩的世界位置（NPC 朝向 f：左侧 = (sin f, -cos f)） */
export function shoulderPos(n: NpcState) {
  return { x: n.x + Math.sin(n.facing) * JERRY.shoulderSide, y: n.y - Math.cos(n.facing) * JERRY.shoulderSide }
}

/** 杰瑞受到玩家伤害：怒气 +2（最多 3 次扑击），很快反扑 */
export function jerryHurt(eng: Engine, e: Entity) {
  const s = jerryState(e)
  s.fury = Math.min(JERRY.furyMax, s.fury + JERRY.furyOnHurt)
  s.pounceCd = Math.min(s.pounceCd, 0.6)
  if (s.mode === 'perch' || s.mode === 'shoulder') say(eng, s, '你会后悔的。', 2.2)
}
/** 杏仁水驯服：教化清零 + 留下木僵残响；被信众目击 → 杰瑞同样扑击 */
export function jerryTamed(eng: Engine, witnessed: boolean) {
  const r = eng.jerryRun
  r.echoT = JERRY.echoDur; r.echoNext = rnd(8, 16); r.echoAnnounced = false
  r.stupor = null
  const j = findJerry(eng)
  if (j) {
    const s = jerryState(j)
    if (witnessed) { s.fury = Math.min(JERRY.furyMax, s.fury + JERRY.furyOnWitnessedTame); s.pounceCd = Math.min(s.pounceCd, 1.2) }
    else say(eng, s, JERRY_TAMED_LINES[0], 4.5)
  }
}
/** 隔离去程序化完成：教化清零的代价——当局理智上限永久降低 */
export function jerryDeprogrammed(eng: Engine) {
  const r = eng.jerryRun
  r.sanityCap = Math.min(r.sanityCap, JERRY.deprogramSanityCap)
  r.stupor = null; r.stuporMask = 0
  eng.msg(`去程序化留下了空洞：有些记忆再也找不回来了。（本局理智上限降为 ${r.sanityCap}）`, 'damage')
}
/** 接触杰瑞（交互）：+25 教化（保留 20s 冷却，由 npc.contactJerry 管）——交给统一入口以触发木僵 */
export function jerryContactGain(eng: Engine, e: Entity) { return addIndoctrination(eng, JERRY.contactGain, e) }

// ============================================================================
// 青鸟神父讲道：走到栖木旁请杰瑞上肩 → 回讲坛前讲道 → 送它回栖木
// ============================================================================
export function updateBluebird(eng: Engine, n: Npc, dt: number, walkOk: (x: number, y: number) => boolean): boolean {
  if (eng.player.level !== 274 || n.hostile) return false
  const j = findJerry(eng)
  if (!j) return false
  const s = jerryState(j)
  const sm = n.sermon ??= { phase: 'rest', t: JERRY.sermonFirst, lineT: 0 }
  const busy = s.mode === 'pounce' || s.mode === 'land' || s.mode === 'hop' || s.mode === 'climb' || s.fury > 0
  const walkTo = (x: number, y: number) => {
    const dx = x - n.x, dy = y - n.y, dd = Math.hypot(dx, dy)
    if (dd < 0.12) { n.tx = n.x; n.ty = n.y; return true }
    const st = Math.min(dd, JERRY.walkSpeed * dt)
    const nx = n.x + (dx / dd) * st, ny = n.y + (dy / dd) * st
    if (walkOk(nx, ny)) { n.x = nx; n.y = ny } else if (walkOk(nx, n.y)) n.x = nx; else if (walkOk(n.x, ny)) n.y = ny
    n.tx = x; n.ty = y; n.facing = Math.atan2(dy, dx)
    return false
  }
  // 栖木北侧（讲坛一侧）0.75m 的接鸟点；讲道位置在神父岗位
  const fetchX = s.homeX, fetchY = s.homeY - 0.75
  if (busy && sm.phase !== 'rest') { s.wantRider = null; sm.phase = 'rest'; sm.t = rnd(JERRY.sermonRest[0], JERRY.sermonRest[1]) }
  switch (sm.phase) {
    case 'rest':
      sm.t -= dt
      if (sm.t <= 0 && !busy && s.mode === 'perch') sm.phase = 'fetch'
      return false
    case 'fetch':
      if (walkTo(fetchX, fetchY)) {
        n.facing = Math.atan2(s.homeY - n.y, s.homeX - n.x)
        s.wantRider = n.id
        if (s.mode === 'shoulder' && s.rider === n.id) { sm.phase = 'preach'; sm.t = JERRY.sermonLen; sm.lineT = 1.5; n.bubbleText = '来，鹉主。'; n.bubbleT = 2 }
      }
      return true
    case 'preach': {
      if (walkTo(n.homeX, n.homeY)) {
        n.facing = Math.PI / 2 // 面朝南侧长椅会众
        sm.t -= dt; sm.lineT -= dt
        if (sm.lineT <= 0) { n.bubbleText = pick(SERMON_LINES); n.bubbleT = 4.5; sm.lineT = JERRY.sermonLineGap }
      }
      if (s.mode !== 'shoulder' || s.rider !== n.id) { sm.phase = 'rest'; sm.t = rnd(JERRY.sermonRest[0], JERRY.sermonRest[1]); return false }
      if (sm.t <= 0) sm.phase = 'return'
      return true
    }
    case 'return':
      if (walkTo(fetchX, fetchY)) {
        n.facing = Math.atan2(s.homeY - n.y, s.homeX - n.x)
        s.wantRider = null
        if (s.mode === 'perch') { sm.phase = 'rest'; sm.t = rnd(JERRY.sermonRest[0], JERRY.sermonRest[1]) }
      }
      return true
  }
}
/** 验收/截图用：立即开始一场讲道（杰瑞直接上肩） */
export function forceSermon(eng: Engine): boolean {
  const n = eng.npcs.find((q) => q.id === 'bluebird') as Npc | undefined, j = findJerry(eng)
  if (!n || !j) return false
  const s = jerryState(j)
  n.x = n.homeX; n.y = n.homeY; n.facing = Math.PI / 2
  n.sermon = { phase: 'preach', t: JERRY.sermonLen, lineT: 0 }
  s.wantRider = n.id; s.rider = n.id; s.mode = 'shoulder'; s.fury = 0
  return true
}

// ============================================================================
// 信众：不主动接触新人 / 投石索 / 近身打倒 / 击晕拖走
// ============================================================================
export function followerHostile(eng: Engine): boolean {
  return (eng.rep.jerry ?? 0) <= -10 && eng.jerryRun.truceT <= 0 && !eng.jerryRun.ko
}
export function hasSling(n: NpcState): boolean { const x = n as Npc; return x.sling ?? (x.sling = n.id !== 'sinclair' && hashId(n.id) % 2 === 0) }
/** 信众行为（npc.updateNpcs 对 faction='jerry' 调用）。返回 true = 本帧已处理 */
export function updateFollower(eng: Engine, n: Npc, dt: number, walkOk: (x: number, y: number) => boolean): boolean {
  const p = eng.player, m = eng.map!
  const dx = p.x - n.x, dy = p.y - n.y, dd = Math.hypot(dx, dy)
  const rep = eng.rep.jerry ?? 0
  n.hostile = followerHostile(eng) ? true : undefined
  if (eng.jerryRun.ko) { n.tx = n.x; n.ty = n.y; return true } // 正在拖走玩家：都停手
  if (n.hostile) {
    n.atkT = Math.max(0, (n.atkT ?? 0) - dt)
    n.slingT = Math.max(0, (n.slingT ?? 0) - dt)
    n.meleeRecoveryT = Math.max(0, (n.meleeRecoveryT ?? 0) - dt)
    n.facing = Math.atan2(dy, dx)
    const sameBand = Math.abs(p.z - floorHeight(m, n.x, n.y, n.floor ?? 0)) < 1.2
    const los = dd < 20 && eng.los(n.x, n.y, p.x, p.y)
    // 出手（投石或近身挥击）都用 lungeT 播放挥臂动作
    if ((n.lungeT ?? 0) > 0) {
      n.lungeT = Math.max(0, n.lungeT! - dt)
      n.tx = n.x; n.ty = n.y
      if (!n.lungeT) {
        n.meleeRecoveryT = 0.45
        if ((n.atkT ?? 0) > 0.5 && dd <= 1.35 && sameBand && los) followerHurt(eng, n.id === 'sinclair' ? JERRY.sinclairMeleeDmg : JERRY.meleeDmg, `${n.def.name}`)
        else if (n.slingArmed) throwStone(eng, n)
        n.slingArmed = false
      }
      return true
    }
    if ((n.meleeRecoveryT ?? 0) > 0.3) { n.tx = n.x; n.ty = n.y; return true }
    const sling = hasSling(n)
    if (sling && los && dd >= JERRY.slingRange[0] && dd <= JERRY.slingRange[1]) {
      n.tx = n.x; n.ty = n.y
      if (n.slingT! <= 0) { n.slingT = JERRY.slingCd; n.lungeT = JERRY.slingWindup; n.slingArmed = true; audio.swing() }
      return true
    }
    if (dd > 1.15) {
      const sp = JERRY.chaseSpeed * dt
      const nx = n.x + (dx / dd) * sp, ny = n.y + (dy / dd) * sp
      if (walkOk(nx, ny)) { n.x = nx; n.y = ny } else if (walkOk(nx, n.y)) n.x = nx; else if (walkOk(n.x, ny)) n.y = ny
      n.tx = p.x; n.ty = p.y
    } else {
      n.tx = n.x; n.ty = n.y
      if ((n.atkT ?? 0) <= 0 && sameBand && los) { n.atkT = 1.3; n.lungeT = 0.32; n.slingArmed = false; audio.swing() }
    }
    return true
  }
  n.lungeT = 0; n.meleeRecoveryT = 0
  if (p.level === 274 || p.level === 108) return false // 圣地之内：照常游荡，等玩家开口
  if (n.ambush) return false
  if (rep >= 30) return false // 已是虔徒：交给原有的靠近传教逻辑
  // 中立：从不主动走来搭话——停下，远远看着
  if (dd < JERRY.watchRange && eng.los(n.x, n.y, p.x, p.y)) {
    n.tx = n.x; n.ty = n.y
    n.facing = Math.atan2(dy, dx)
    n.watchT = (n.watchT ?? 0) + dt
    return true
  }
  n.watchT = 0
  return false
}
function throwStone(eng: Engine, n: NpcState) {
  const p = eng.player, m = eng.map!
  const z0 = floorHeight(m, n.x, n.y, n.floor ?? 0) + 1.55
  const tz = p.z + 1.0
  const dx = p.x - n.x, dy = p.y - n.y, dd = Math.max(0.5, Math.hypot(dx, dy))
  const t = dd / JERRY.stoneSpeed
  const g = 9.8
  eng.jerryRun.stones.push({ x: n.x + dx / dd * 0.4, y: n.y + dy / dd * 0.4, z: z0, vx: dx / t, vy: dy / t, vz: (tz - z0 + 0.5 * g * t * t) / t, t: 0, spin: Math.random() * 6 })
}
/** 飞石碰撞只看墙瓦片（tiles === 2）：wallAt 会把长椅、柜台等实心结构也算作墙，飞石应从矮家具上方飞过 */
function stoneWallAt(m: NonNullable<Engine['map']>, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y)
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return true
  return m.tiles[ty * m.w + tx] === 2
}
function updateStones(eng: Engine, dt: number) {
  const st = eng.jerryRun.stones
  if (!st.length) return
  const p = eng.player, m = eng.map
  for (let i = st.length - 1; i >= 0; i--) {
    const s = st[i]
    s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vz -= 9.8 * dt; s.spin += dt * 14
    const hit = Math.hypot(s.x - p.x, s.y - p.y) < JERRY.stoneHitR && s.z > p.z + 0.2 && s.z < p.z + 1.9
    if (hit && !eng.over) { st.splice(i, 1); followerHurt(eng, JERRY.stoneDmg, '信众的投石索'); eng.msg('一块石头狠狠砸在你身上。', 'damage'); continue }
    const ground = m ? floorHeight(m, s.x, s.y, 0) : 0
    if (s.t > JERRY.stoneTtl || s.z < ground || (m && stoneWallAt(m, s.x, s.y))) st.splice(i, 1) // 飞石只被墙瓦片挡（长椅等实心结构挡不住）
  }
}
/** 信众造成的伤害：血量见底时击晕拖走，而不是死亡 */
export function followerHurt(eng: Engine, dmg: number, source: string) {
  eng.jerryRun.nonLethal = true
  try { eng.hurtPlayer(dmg, source) } finally { eng.jerryRun.nonLethal = false }
}
/** combat.hurtPlayer 调用：信众伤害把血量打到击晕线以下时，转为击晕（返回 true = 已接管，不要判死亡） */
export function jerryKnockoutIntercept(eng: Engine, source: string): boolean {
  const r = eng.jerryRun
  if (!r?.nonLethal || r.ko || eng.player.hp > JERRY.koHp) return false
  eng.player.hp = Math.max(1, eng.player.hp)
  r.ko = { t: 0, dur: JERRY.koDur, dragged: false, stolen: [], source }
  r.stones.length = 0
  r.stupor = null
  eng.usingItem = null
  audio.hurt()
  eng.msg(`${source}把你打倒在地。视野边缘一点点黑了下去……`, 'damage')
  return true
}
function updateKnockout(eng: Engine, dt: number) {
  const r = eng.jerryRun, k = r.ko!
  k.t += dt
  eng.player.vz = 0
  if (!k.dragged && k.t >= 1.2) {
    k.dragged = true
    k.stolen = stealItems(eng)
    dragPlayer(eng)
    eng.player.hp = Math.max(eng.player.hp, JERRY.koWakeHp)
    r.truceT = JERRY.truceAfterKo
    despawnAmbush(eng)
  }
  if (k.t >= k.dur) {
    r.ko = null
    eng.msg(k.stolen.length ? `你在一个陌生的角落醒来，头痛欲裂。背包轻了——${k.stolen.join('、')}被拿走了。` : '你在一个陌生的角落醒来，头痛欲裂。他们没拿走什么——大概你身上也没什么可拿的。', 'damage')
    eng.msg('他们没有杀你。他们只是要你明白：别再插手。', 'lore')
  }
}
/** 劫掠：拿走 1–3 格物品（优先消耗品），返回物品名 */
export function stealItems(eng: Engine, rand: () => number = Math.random): string[] {
  const p = eng.player
  const slots: { arr: (InvSlot | null)[]; i: number; pri: number }[] = []
  const scan = (arr: (InvSlot | null)[]) => arr.forEach((s, i) => { if (s) { const u = ITEMS[s.type]?.use; slots.push({ arr, i, pri: u && u !== 'none' && u !== 'doc' ? 0 : 1 }) } })
  scan(p.hotbar); scan(p.backpack)
  if (!slots.length) return []
  const n = Math.min(slots.length, JERRY.koSteal[0] + Math.floor(rand() * (JERRY.koSteal[1] - JERRY.koSteal[0] + 1)))
  slots.sort((a, b) => a.pri - b.pri || rand() - 0.5)
  const out: string[] = []
  for (const s of slots.slice(0, n)) {
    const it = s.arr[s.i]!
    const take = Math.max(1, Math.ceil(it.count / 2)) // 一格拿走一半（至少 1 个）
    it.count -= take
    out.push(`${ITEMS[it.type]?.name ?? it.type}×${take}`)
    if (it.count <= 0) s.arr[s.i] = null
  }
  return out
}
function dragPlayer(eng: Engine) {
  const p = eng.player, m = eng.map
  if (!m) return
  let spot: { x: number; y: number } | null = null
  if (p.level === 274) spot = eng.devFindSpot(20, 68.5, 4, 0) // 南侧信徒居住区的第一间小屋
  for (let i = 0; i < 24 && !spot; i++) {
    const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 12
    const s = eng.devFindSpot(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 3, 0)
    if (s && Math.hypot(s.x - p.x, s.y - p.y) > 10) spot = s
  }
  if (!spot) return
  p.x = spot.x; p.y = spot.y; p.z = floorHeight(m, p.x, p.y, 0) + 0.02; p.vz = 0; p.floor = 0
}

// ============================================================================
// 辛克莱·贝克特的伏击（声望很低时在野外带一小队信众堵你）
// ============================================================================
function wildLevel(eng: Engine) {
  const id = eng.player.level
  return !!eng.map?.inf && id !== 274 && id !== 108 && eng.levelDef.gen !== 'outpost' && !eng.map.settlement
}
function updateAmbush(eng: Engine, dt: number) {
  const r = eng.jerryRun
  if (r.ambushActive) {
    r.ambushLife -= dt
    const alive = eng.npcs.filter((n) => (n as Npc).ambush && !n.dead)
    const far = alive.every((n) => Math.hypot(n.x - eng.player.x, n.y - eng.player.y) > 60)
    if (r.ambushLife <= 0 || !alive.length || far || eng.player.level !== r.ambushLevel) despawnAmbush(eng)
    return
  }
  if ((eng.rep.jerry ?? 0) > JERRY.ambushRep || !wildLevel(eng) || r.ko || eng.over) return
  r.ambushT -= dt
  if (r.ambushT > 0) return
  r.ambushT = JERRY.ambushGap
  spawnAmbush(eng)
}
/** 生成伏击小队（也供验收脚本直接调用）。返回生成人数 */
export function spawnAmbush(eng: Engine): number {
  const m = eng.map, p = eng.player
  if (!m) return 0
  let spot: { x: number; y: number } | null = null
  for (let pass = 0; pass < 2 && !spot; pass++) for (let i = 0; i < 30 && !spot; i++) {
    const a = Math.random() * Math.PI * 2, rr = JERRY.ambushDist[0] + Math.random() * (JERRY.ambushDist[1] - JERRY.ambushDist[0])
    const s = eng.devFindSpot(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, 2, 0)
    if (s && Math.hypot(s.x - p.x, s.y - p.y) > 10 && (pass === 1 || !eng.los(s.x, s.y, p.x, p.y))) spot = s
  }
  if (!spot) return 0
  const mk = (def: NpcDef, x: number, y: number, hp: number): Npc => ({
    id: def.id, def, x, y, facing: Math.atan2(p.y - y, p.x - x), floor: 0, homeX: x, homeY: y, tx: x, ty: y,
    moveT: 2, bubbleText: '', bubbleT: 0, hp, ambush: true, sling: def.id !== 'sinclair',
  })
  const tag = Math.floor(eng.time * 10) & 0xffff
  const squad: Npc[] = [mk(NPCS.sinclair, spot.x, spot.y, JERRY.sinclairHp)]
  for (let i = 0; i < JERRY.ambushSquad; i++) {
    const s2 = eng.devFindSpot(spot.x + Math.cos(i * 2.1) * 1.5, spot.y + Math.sin(i * 2.1) * 1.5, 2, 0) ?? spot
    squad.push(mk(jerryFollowerDef(0xa3b, tag, i), s2.x, s2.y, JERRY.ambushHp))
  }
  squad[0].bubbleText = '就是他。鹉主不需要宽恕——祂需要安静。'; squad[0].bubbleT = 4
  if (m.inf) {
    for (const n of squad) {
      const cx = Math.floor((n.x + m.inf.ox) / CS), cy = Math.floor((n.y + m.inf.oy) / CS)
      const c = m.inf.chunks.get(`${cx},${cy}`) ?? [...m.inf.chunks.values()][0]
      c?.npcs.push(n)
    }
    eng.syncInfNpcs()
  } else eng.npcs.push(...squad)
  const r = eng.jerryRun
  r.ambushActive = true; r.ambushLife = JERRY.ambushLife; r.ambushLevel = p.level
  audio.aggro()
  eng.msg('远处传来投石索的呼啸——辛克莱·贝克特带着几名信众堵住了你的退路。', 'damage')
  return squad.length
}
function despawnAmbush(eng: Engine) {
  const r = eng.jerryRun
  if (!r.ambushActive) return
  r.ambushActive = false
  const m = eng.map
  const isAmb = (n: NpcState) => !!(n as Npc).ambush
  if (m?.inf) for (const c of m.inf.chunks.values()) c.npcs = c.npcs.filter((n) => !isAmb(n))
  eng.npcs = eng.npcs.filter((n) => !isAmb(n))
}

// ============================================================================
// 诱导材料：传单 / 伪装成生存指南的「假日志」——读完在地图上标出一个「据点」
// 实际指向 Level 2 的信众宣传间（信众在那里给「足够虔诚」的人引路去 Level 274）
// ============================================================================
export const LURE_TEXT: Record<string, { read: string; mark: string }> = {
  jerryflyer: {
    read: '传单上印着一只蓝色的鸟和一行手写体：「迷路了？Level 2 的管道深处有一间亮着灯的屋子。那里有水、有食物、有人等你。」背面是一张手绘的方位图。',
    mark: '蓝羽庇护所',
  },
  fakelog: {
    read: '「流浪者日志 · 第 17 天。我终于找到了安全屋——Level 2，沿着管道一直走，门口贴满了蓝色海报的那间。那里的人很友善，他们分给我杏仁水。如果你读到这页，去那里。」字迹工整得不像在逃命。',
    mark: '安全屋（日志标注）',
  },
}
/** 读完诱导材料：标出据点（在 L2 立即解析最近的信众宣传间；在别处则等进入 L2 再标） */
export function jerryLureRead(eng: Engine, type: string) {
  const t = LURE_TEXT[type]
  if (!t) return
  eng.msg(t.read, 'lore')
  if (eng.player.level === 2) {
    const mk = resolveLure(eng, t.mark)
    if (mk) eng.msg(`地图上多了一个标记：「${t.mark}」。`, 'system')
    else eng.msg('方位图画得很潦草，你没能在地图上对上位置。', 'system')
  } else {
    eng.jerryRun.lurePending = t.mark
    eng.msg(`方位图指向 Level 2。到了那里，地图上会标出「${t.mark}」。`, 'system')
  }
}
/** 从玩家位置搜索最近的信众宣传间（确定性：同种子同位置结果相同） */
export function nearestJerryRoom(seed: number, wx: number, wy: number, R = 14): { wx: number; wy: number } | null {
  const k0 = Math.round((wx - 13) / 24), r0 = Math.round((wy - 13) / 28)
  let best: { wx: number; wy: number; d: number } | null = null
  for (let k = k0 - R; k <= k0 + R; k++) {
    if (best && Math.abs(l2CorrX(seed, k) - wx) > best.d) continue
    for (let r = r0 - R; r <= r0 + R; r++) {
      if (best && Math.abs(l2RowY(seed, r) - wy) > best.d + 30) continue
      for (const side of [0, 1]) for (const t of [0, 1, 2]) {
        if (!l2IsJerryRoom(seed, k, r, side, t)) continue
        const L = l2RoomLayoutAt(seed, k, r, side, t)!
        const cx = (L.x0 + L.x1) / 2 + 0.5, cy = (L.y0 + L.y1) / 2 + 0.5, d = Math.hypot(cx - wx, cy - wy)
        if (!best || d < best.d) best = { wx: cx, wy: cy, d }
      }
    }
  }
  return best ? { wx: best.wx, wy: best.wy } : null
}
function resolveLure(eng: Engine, name: string): LureMark | null {
  const inf = eng.map?.inf
  if (!inf || eng.player.level !== 2) return null
  const at = nearestJerryRoom(inf.seed, inf.ox + eng.player.x, inf.oy + eng.player.y)
  if (!at) return null
  const r = eng.jerryRun
  const old = r.lureMarks.find((m) => m.level === 2 && Math.hypot(m.wx - at.wx, m.wy - at.wy) < 2)
  if (old) return old
  const mk: LureMark = { level: 2, wx: at.wx, wy: at.wy, name }
  r.lureMarks.push(mk)
  return mk
}
function updateLure(eng: Engine) {
  const r = eng.jerryRun
  if (eng.player.level !== 2 || !eng.map?.inf) return
  if (r.lurePending) { const name = r.lurePending; r.lurePending = null; if (resolveLure(eng, name)) eng.msg(`你对照方位图，在地图上标出了「${name}」。`, 'system') }
  const inf = eng.map.inf
  for (const mk of r.lureMarks) {
    if (mk.found || mk.level !== 2) continue
    if (Math.hypot(inf.ox + eng.player.x - mk.wx, inf.oy + eng.player.y - mk.wy) < 3.5) {
      mk.found = true
      eng.msg(`这就是「${mk.name}」——没有水，也没有食物。满墙都是同一只蓝色鹦鹉的海报。`, 'lore')
    }
  }
}
/** HUD 地图用：当前层级的诱导标记（窗口坐标） */
export function jerryLureMarks(eng: Engine): { x: number; y: number; name: string; found: boolean }[] {
  const inf = eng.map?.inf
  if (!inf) return []
  return eng.jerryRun.lureMarks.filter((m) => m.level === eng.player.level).map((m) => ({ x: m.wx - inf.ox, y: m.wy - inf.oy, name: m.name, found: !!m.found }))
}
