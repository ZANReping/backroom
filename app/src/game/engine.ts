// 游戏引擎：玩家/实体AI/生存系统/交互/出入口/事件派发
import { generateLevel, tileAt, tileH, groundHeightAt, solidStructAtFloor, bandOfZ, FLOOR_H, POOL_DEPTH, structStandTopAt, ceilingHeightAt, type GameMap } from './mapgen'
import { WALL_H } from './renderer/shared'
import { LEVELS, LEVEL_EVENTS, WIN_TAPES, NORMAL_LEVELS, levelLabel, levelDefOf } from './levels'
import { ITEMS, itemName } from './items'
import { recordEncounter, makeEntity, ENTITIES, loadSeen, type Entity } from './entities'
import { canOccupy, createIntegrator, integrateMove, PLAYER_RADIUS, type MoveIntegrator } from './player'
import { look } from './renderer3d'
import type { ExitDef, ExitInstance, LightSource, Structure } from './types'
import { audio } from './audio'
import { storage } from './storage'
import { seedString, RNG, randomSeed } from './rng'
import { updateInfinite, l0NearestExit, findNearestVariant, CS, chunkKey, applyRedPlague, infiniteImplFor, restitch } from './infinite'
import { prefabsForLevel, placePrefabForced } from './prefabs'
import { CONTAINERS, CONTAINER_KINDS, CONTAINER_RARE } from './containers'
import { DECOR_VIEWS, GRAFFITI_LORE, GRAFFITI_LORE_KIND, BRAILLE_MARKS, GLASSWIN_TEXT } from './decorations'
import { NPCS, JERRY_PREACH_LINES, JERRY_CHANT_LINES, type NpcState, type NpcDef } from './npcs'
import { OUTPOSTS } from './outposts'
import { FACTIONS, REP_START, REP_TIER, genQuest, genBntgQuest, genArianeQuest, genEl3aQuest, genJerryQuest, type QuestDef, type QuestFaction } from './factions'
import { l2JerryRoomRectAt } from './infiniteL2' // v45：信众宣传间领地矩形（HUD 声望显示）

export interface InvSlot { type: string; count: number; tag?: number } // tag：来源层级标签（迁跃浆果=发现它的层级；不同标签不堆叠）
// 装备槽位标识：hotbar/backpack 为背包格；offhand/body/gloves/pocket 为装备位（主手=快捷栏选中项，不是独立槽位）
export type SlotWhere = 'hotbar' | 'backpack' | 'offhand' | 'body' | 'gloves' | 'head' | 'pocket'
export interface SlotRef { w: SlotWhere; i: number }
export interface EquipState {
  offhand: InvSlot | null // 副手：持久手持（打火机/手电筒）
  body: InvSlot | null // 身体：服饰（绝缘服/保温服）
  gloves: InvSlot | null // 手套：隔热手套
  head: InvSlot | null // 头饰：潜水面罩
  pockets: (InvSlot | null)[] // 口袋 ×4：持久小物（兔子脚/门禁卡/钥匙）
}
export type MsgKind = 'loot' | 'damage' | 'lore' | 'system'
/** 飞行中的投掷物（v28 可投掷道具；落地触发效果） */
export interface Projectile {
  id: number
  type: string
  x: number; y: number; z: number // z=离地高度（米）
  floorZ: number // 落点地面高度（掷出时玩家脚下高度）
  vx: number; vy: number; vz: number
  done?: boolean
}
export interface HudEvent {
  kind: 'msg' | 'toast' | 'damage' | 'sanityhit' | 'transition' | 'dead' | 'victory' | 'levelchange' | 'lootpanel' | 'notebook' | 'doc' | 'landmark' | 'dialog'
  cutIn?: string
  dest?: number | 'random' | 'win'
  text?: string
  msgKind?: MsgKind
  anim?: string
  fallDamage?: number
}

export interface PlayerState {
  x: number; y: number; facing: number
  // v7 数据契约：z 轴高度系统
  z: number // 脚底高度（米，随地面高度档/坡道/跳跃变化）
  vz: number // 垂直速度（重力积分）
  crouching: boolean // 蹲伏（减速、过低通道）
  floor: number // v13：当前楼层（0=主层 1=上层，按 z 高度带推断；HUD/小地图读取）
  hp: number; sanity: number; hunger: number; stamina: number
  battery: number; flashlight: boolean
  level: number
  hotbar: (InvSlot | null)[]
  backpack: (InvSlot | null)[]
  selected: number
  equip: EquipState // 装备栏（副手/身体/手套/口袋×4；主手=快捷栏选中项）
  kills: number; tapes: number; steps: number
  startTime: number; aliveTime: number
  hasGloves: boolean; hasSuit: boolean; hasLighter: boolean; hasRabbit: boolean; hasPockets: boolean
  coffeeT: number
  leverPulled: boolean // L1 电梯拉杆
  slowT: number // 被团块抓住的减速
  flashJamT: number // 手电被电弧体瘫痪
}

export interface InputState {
  mx: number; my: number // 移动向量（-1..1）
  sprint: boolean
  attack: boolean
  interact: boolean
  toggleLight: boolean
  jump: boolean // v7：跳跃（桌面空格 / 移动端按钮，边沿触发由引擎消费）
  crouch: boolean // v7：蹲伏（桌面 C/Ctrl / 移动端按钮，按住状态）
}

export type Difficulty = 'easy' | 'normal' | 'hard'
const DIFF = { easy: { dmg: 0.6, drain: 0.6 }, normal: { dmg: 1, drain: 1 }, hard: { dmg: 1.5, drain: 1.4 } }

// v51：天才糖的「冷知识」（简单但常被人认错）
const GENIUS_FACTS = [
  '土耳其的首都是安卡拉，不是伊斯坦布尔',
  '拿破仑并不矮，他大约有 170 厘米',
  '从太空里肉眼是看不见长城的',
  '金鱼的记忆远不止七秒',
  '蝙蝠并不是瞎子',
  '地球自转一周其实不足 24 小时',
  '指南针指的并不是真正的北极',
]

// ===== v29a：存档/读档 =====
// br_save（App.tsx 写入）仅存 seed+difficulty 供主界面「继续游戏」取种子；
// br_save_state（引擎自动维护）存全量快照——继续游戏时凭种子匹配恢复进度。
export const SAVE_KEY = 'br_save_state'
export interface SaveSnapshot {
  v: 1
  seed: number
  difficulty: Difficulty
  time: number // 游戏内时间（地图种子派生依赖它）
  mapSeed: number // 当前层级地图生成种子（读档需复现同一张图）
  mapFirstVisit: boolean // 生成该图时的 firstVisit 标记（影响初始物资刷新）
  level: number
  visited: number[] // 已到过的层级（初始物资仅首访刷新）
  outpostReturn?: number | null // v35：进入据点前的层级（据点返程落点）
  rep?: Record<string, number> // v35：团体声望
  quests?: { def: QuestDef; progress: number; baseline: number; done: boolean }[] // v35：委托任务
  brcSin?: { hurt: number; killed: number } // v39：BRC 未告发的伤害/杀死计数
  brcMimicCd?: number // v39：BRC 模仿装修冷却剩余秒数
  indoctrination?: number // v45：教化值 0~100（接触杰瑞积累；驯服清零；随存档持久）
  jerryTamed?: boolean // v45：鹉主已被杏仁水驯服（教化不再积累）
  jerryAgreed?: string[] // v45：已对其「认同杰瑞」的信众 NPC id（引路选项按此显示；v49 起每局至多一名——见 jerryOath）
  jerryOath?: boolean // v49：本局已宣誓认同杰瑞（+10 每局仅首次；之后任何信众处认同选项不再出现）
  // v47：传教使命已标准委托化（kind 'preach' 进 quests，随 quests 持久）；旧档 jerryPreach 字段废弃不再读取
  player: PlayerState
}
export function loadSaveSnapshot(): SaveSnapshot | null {
  try {
    const raw = storage.get(SAVE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SaveSnapshot
    if (!s || s.v !== 1 || typeof s.seed !== 'number' || !s.player) return null
    if (!Array.isArray(s.player.hotbar) || !Array.isArray(s.player.backpack)) return null
    return s
  } catch { return null }
}
export function clearSaveSnapshot() { storage.remove(SAVE_KEY) }

export class Engine {
  map: GameMap | null = null
  player: PlayerState
  input: InputState = { mx: 0, my: 0, sprint: false, attack: false, interact: false, toggleLight: false, jump: false, crouch: false }
  listeners: ((e: HudEvent) => void)[] = []
  difficulty: Difficulty = 'normal'
  seed = 1
  noise = 0 // 当前噪音值 0-1（HUD 显示）
  private playerNoiseT = 0 // 玩家噪音残余时间（>0 = 正在/刚刚制造噪音；猎犬威慑判定，noiseEvent 刷新）
  camShake = 0
  time = 0
  paused = false
  over = false
  victory = false
  // v29a：存档/读档状态
  private mapSeed = 0 // 当前层级地图生成种子（loadLevel 记录，读档恢复同一张图用）
  private mapFirstVisit = true // 当前地图生成时的 firstVisit 标记
  private autosaveT = 0 // 周期自动存档计时（秒）
  private idleSaved = false // 暂停/结束后已落盘一次（避免每帧重复写存储）
  /** v23：本层内是否主动挑衅过实体（解除 Level 11 Effect 的被动状态） */
  provoked = false
  /** v23：在 Level 601 走进过多少次「你家的前门」 */
  fakeEnds = 0
  private pocketsAlarmT = 6
  private manilaT = 4
  transition: { anim: string; t: number; dest: number | 'random' | 'win'; fallDamage?: number } | null = null
  explored: Uint8Array = new Uint8Array(0)
  visible: Uint8Array = new Uint8Array(0)
  fakes: { x: number; y: number; t: number }[] = [] // 理智幻影
  particles: { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; size: number; z?: number; vz?: number }[] = []
  // v13：液体状态
  inLiquid = 0 // 当前所在液体类型（0 无 1 深水 2 浅水）
  submerged = false // 头部没入水下
  breathT = 0 // 水下屏气计时（超限微扣 HP）
  private wasSubmerged = false
  private bubbleT = 0
  private rippleT = 0
  // v13：电梯乘降 / 梯子攀爬（脚本化垂直移动，期间锁定水平移动与重力）
  ride: { sx: number; sy: number; from: number; to: number; t: number } | null = null
  climb: { baseX: number; baseY: number; topX: number; topY: number; dir: 1 | -1 } | null = null
  private climbCd = 0 // 攀爬送达后的再触发冷却（防止到顶立即又爬下）
  private stepAcc = 0
  // v12：interactTarget 携带目标引用（结构/物品/出口），HUD 提示与 doInteract 执行
  // 共用 scanInteract 的同一选择结果，杜绝「提示普通门却触发相邻上锁门」的目标漂移。
  private interactTarget: { kind: string; label: string; s?: Structure; it?: GameMap['items'][number]; e?: GameMap['exits'][number]; npc?: NpcState; ent?: Entity; vmBack?: boolean } | null = null
  // 开发者模式（v8 扩展：statLock=每帧锁满状态，oneHit=一击必杀，invisible=实体不追击，frozenAI=冻结实体）
  dev = { god: false, noclip: false, speed: false, statLock: true, oneHit: false, invisible: false, frozenAI: false, bright: false, phenOn: new Set<string>(), phenOff: new Set<string>(), hintDist: 30 }
  // 地图就地修改版本号（开发者强制生成固定结构时 +1；渲染层据此重建有限层静态几何）
  mapRev = 0
  // 开场爬起动画计时（>0 时锁定移动/攻击/跳跃，渲染层相机从贴地侧躺缓慢起身）
  introT = 0
  // 容器搜索（按住交互 → 进度 → 战利品面板）
  searching: { sid: number; t: number; dur: number; label: string } | null = null
  lootPanel: { sid: number; label: string; items: string[] } | null = null
  private statusMsgT = { hunger: 0, battery: 0, stamina: 0 }
  private seenThisLevel = new Set<string>() // 本层已记录遭遇的实体类型
  private redAnnounced = new Set<string>() // 本层已播报预警的红室 chunk（chunkKey）
  // 固定子步移动积分器（帧间保留时间余数，保证高低帧率位移一致）
  private moveIt: MoveIntegrator = createIntegrator()
  // 攻击挥动动画计时（渲染层读取做手部挥砍/准心收缩）
  attackAnimT = 0
  // 攻击动画种类（渲染层据此切换动作）：punch=空手出拳 swing=武器挥舞 throw=投掷
  attackAnimKind: 'punch' | 'swing' | 'throw' | 'spray' | 'drink' = 'punch'
  // 飞行中的投掷物（订书机/汽油罐等；落地触发效果，见 landProjectile）
  projectiles: Projectile[] = []
  private projId = 1
  // 层级氛围事件（wiki 设定播报）计时
  private ambientT = 14
  // L1 停电事件：剩余时间 + 被移除光源的备份
  blackoutT = 0
  // v31：「闪烁」预警期（完全停电前灯光快速闪烁的秒数；渲染层据此做灯光快闪）
  blackoutWarnT = 0
  private blackoutPendingDur = 0
  private blackoutBackup: LightSource[] | null = null

  // v29：经 L0「向下的灰色阶梯」进入 L1 的标记（下一次 loadLevel(1) 时在出生点附近生成返程阶梯）
  private arriveStairs = false
  // v51：乘电梯（elevatorshaft）抵达的标记——下一次 loadLevel 把出生点改到本层电梯旁（内存标记，不入存档）
  private arriveElevator = false
  // v29：返程「向上的灰色阶梯」（世界坐标固定；窗口平移 stitch 后重新注入）
  private bonusExit: { def: ExitDef; wx: number; wy: number } | null = null
  // v29：本局已到过的层级（初始物资仅首次进 L0 刷新）
  private visitedLevels = new Set<number>()
  // v35：据点——进入据点前的层级（据点出口 dest:'back' 的返程落点；随存档持久）
  outpostReturn: number | null = null
  el3aReliefClaimed = false // v43：本次进入 EL3A 是否已领过免费补给包（每次进入重置）
  // v35：本层 NPC（据点居民；不是实体——不进 m.entities，不可被 dev 召唤，换层重建）
  npcs: NpcState[] = []
  // v35：本局已遇见的 NPC 定义（图鉴「人士」页数据源；随机 NPC 在同局内跨层保留）
  knownNpcs: NpcDef[] = []
  // v35：团体声望（factions.ts；流浪者不参与声望；MEG 默认 30 友好）与委托任务
  rep: Record<string, number> = { meg: REP_START }
  quests: { def: QuestDef; progress: number; baseline: number; done: boolean }[] = []
  // v39：BRC（后室装修公司）——未告发的伤害/杀死计数（攻击/杀死员工不立即降声望，
  // 与员工对话「坦白」时按 伤害-10/人、杀死-30/人 结清；随存档持久）与模仿装修冷却
  brcSin = { hurt: 0, killed: 0 }
  brcMimicCd = 0 // 模仿装修全局冷却剩余秒数（~90s 防连点）
  private brcMimicPending = 0 // 模仿动作进行中（挥臂动画播完后结算 +2 声望）
  // ===== v45：杰瑞的信众 / Level 274 教化系统（随存档持久）=====
  indoctrination = 0 // 教化值 0~100（接触杰瑞 +25；≥100 成为信众一员，无法主动离开 L274）
  jerryTamed = false // 鹉主已被杏仁水驯服（教化清零且此后接触不再积累）
  jerryAgreed = new Set<string>() // 已「认同杰瑞」的信众 NPC id（引路选项按此显示；v49 起每局至多一名）
  jerryOath = false // v49：本局已宣誓认同杰瑞（+10 每局仅首次有效——宣誓一次，全鹦鹉门下皆知）
  jerryContactCd = 0 // v47：接触杰瑞冷却剩余秒数（20s 防连点刷声望/教化；HUD 交互提示显示剩余）
  jerryTerritory = false // 玩家身处信众宣传间矩形内（HUD 显示 jerry 声望；引擎每帧维护）
  private chantT = 0 // 诵咏计时（L274 内被教化后周期性咏出崇拜词）
  // v29：玩家当前在可行走阶梯上（碰撞 z 按地面处理、跳过重力贴地；由 updateStairs 每帧维护）
  private onStairs = false

  // 现象系统：当前生效的现象 id 列表（每帧由 step 重算；HUD 左上角与物品栏「状态」页读取展示）
  activePhenomena: string[] = []
  // 现象「孤立效应」的附加表现：每次进入 Level 0，画面色调/饱和度/对比度/亮度
  // 发生极轻微偏移（幅度刻意控制在一般无法察觉的范围；App.tsx 以 CSS filter 施加到画布）
  colorGrade = { hue: 0, sat: 1, con: 1, bri: 1 }
  // v30：植殖癌（Level 1 花园段）——0..1 进展度：在花园段内约 75 秒涨满，离开后以 2 倍速消退。
  // 行为逐渐僵硬（移动减速）、视野逐渐变绿（App.tsx 绿色覆盖层），涨满即原地生根（死亡）
  plantK = 0
  private plantStage = 0
  private inGardenEff = false // 本帧植殖癌是否生效（含开发者强制开/关），供现象列表读取
  // ===== v32：新物品机制状态 =====
  axeDur = 0 // 斧头耐久（获得时重置为 5；破门 -1，耗尽报废）
  squirtTank: 'none' | 'water' | 'almond' | 'cashew' | 'liquidpain' = 'none' // 滋水枪储罐液体（单一种类）
  // v51：Object 5 糖果效果计时器
  candyAddictT = 0 // 糖瘾：吃糖后 60s 内需再吃，否则理智 -10
  silverTongueT = 0 // 银舌头：交易 95 折（秒）
  slipperyT = 0 // 咀嚼子弹：脚滑（秒）
  gunCandyT = 0 // 枪糖：右手变枪（秒）
  private slipVx = 0
  private slipVy = 0
  private chocoCd = 0 // 巧克力子弹射速冷却
  manmadeT = 0 // v51：人制品效应剩余秒数（5 分钟：拒食他物/治疗减半/恒显饥饿特效/体力恢复减半消耗加倍/受伤 -10%）
  webbedT = 0 // v51：Nguithr'xurh 镇静剂麻痹剩余秒数（视野模糊 + 移动迟缓）
  /** 当前是否身处据点（饥饿减速/体力加速的判定依据） */
  get inOutpost(): boolean { return Object.values(OUTPOSTS).some((o) => o.levelId === this.player.level) }
  squirtAmmo = 0 // 储罐剩余喷射份数（1 瓶 = 3 份，上限 9 瓶 = 27 份）
  warpBerryLevel: number | null = null // 迁跃浆果：首次获得时所在层级（食用传送目标）
  royalAddictT = 0 // 皇家口粮成瘾剩余秒数（期间其他食物不回饥饿）
  sanityFloor = 0 // 皇家口粮锁定的理智下限（成瘾崩塌期间不生效）
  private royalDrainT = 0 // 成瘾崩塌：理智急速下降剩余秒数

  constructor() {
    this.player = this.freshPlayer()
  }

  private freshPlayer(): PlayerState {
    return {
      x: 2.5, y: 2.5, facing: 0,
      z: 0, vz: 0, crouching: false, floor: 0,
      hp: 100, sanity: 100, hunger: 100, stamina: 100,
      battery: 100, flashlight: false,
      level: 0,
      hotbar: new Array(7).fill(null), // 开局一无所有（物资散落在出生点周围）
      backpack: new Array(16).fill(null),
      selected: 0,
      equip: { offhand: null, body: null, gloves: null, head: null, pockets: [null, null, null, null] },
      kills: 0, tapes: 0, steps: 0,
      startTime: Date.now(), aliveTime: 0,
      hasGloves: false, hasSuit: false, hasLighter: false, hasRabbit: false, hasPockets: false,
      coffeeT: 0, leverPulled: false, slowT: 0, flashJamT: 0,
    }
  }

  // 全量播报历史（HUD 左下仅显示最近几条且截断；物品栏「日志」页展示完整记录，上限 400 条）
  msgLog: { text: string; kind: MsgKind }[] = []

  // 粉笔头画在墙上的记号（level + 世界坐标 + 墙面朝向；换层重新生成地图时清空）
  wallMarks: { level: number; wx: number; wy: number; dir: number }[] = []

  /** 订阅引擎事件；返回取消订阅函数（调用方必须在卸载时取消，否则监听器累积会导致播报重复） */
  on(fn: (e: HudEvent) => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
  }
  emit(e: HudEvent) { for (const f of this.listeners) f(e) }
  msg(text: string, kind: MsgKind = 'system') {
    this.msgLog.push({ text, kind })
    if (this.msgLog.length > 400) this.msgLog.splice(0, this.msgLog.length - 400)
    this.emit({ kind: 'msg', text, msgKind: kind })
  }

  newRun(seed: number, difficulty: Difficulty) {
    this.seed = seed
    this.difficulty = difficulty
    this.player = this.freshPlayer()
    this.over = false; this.victory = false; this.transition = null
    this.idleSaved = false
    this.autosaveT = 0
    this.time = 0
    this.msgLog = [] // 新一局清空播报历史
    this.visitedLevels.clear() // 新一局重置到层记录（初始物资首访刷新用）
    this.outpostReturn = null // 新一局清空据点返程记录（读档时由快照恢复）
    this.knownNpcs = [] // 新一局清空随机 NPC 记录（静态 NPC 由注册表恒定提供）
    this.rep = { meg: REP_START } // 新一局声望重置（MEG 默认友好；读档时由快照恢复）
    this.quests = []
    this.brcSin = { hurt: 0, killed: 0 } // v39：BRC 未告发记录清空（读档时由快照恢复）
    this.brcMimicCd = 0
    this.brcMimicPending = 0
    // v45：教化系统重置（读档时由快照恢复）
    this.indoctrination = 0
    this.jerryTamed = false
    this.jerryAgreed = new Set()
    this.jerryOath = false
    this.jerryContactCd = 0
    this.jerryTerritory = false
    this.chantT = 0
    // v29a：主界面「继续游戏」用存档种子重进 newRun——存在同种子快照时恢复进度而不是重开新游戏。
    // （「开始新游戏」的种子是随机新生成的，与快照种子不同，自然走全新开局路径。）
    const snap = loadSaveSnapshot()
    if (snap && snap.seed === seed) {
      this.difficulty = snap.difficulty ?? difficulty
      this.time = snap.time
      for (const id of snap.visited ?? []) this.visitedLevels.add(id)
      this.outpostReturn = snap.outpostReturn ?? null
      this.rep = snap.rep ?? { meg: REP_START }
      this.quests = snap.quests ?? []
      this.brcSin = snap.brcSin ?? { hurt: 0, killed: 0 } // v39：恢复 BRC 未告发记录
      this.brcMimicCd = snap.brcMimicCd ?? 0
      // v45：恢复教化系统状态
      this.indoctrination = snap.indoctrination ?? 0
      this.jerryTamed = snap.jerryTamed ?? false
      this.jerryAgreed = new Set(snap.jerryAgreed ?? [])
      // v49：恢复宣誓标记；旧档无此字段时按「已认同过任一信众」迁移（每局仅首次认同有效）
      this.jerryOath = snap.jerryOath ?? ((snap.jerryAgreed ?? []).length > 0)
      this.loadLevel(snap.level, { mapSeed: snap.mapSeed, firstVisit: snap.mapFirstVisit })
      // loadLevel 已把 player 放到出生点；此处整体恢复为存档时的玩家状态
      const fresh = this.freshPlayer()
      this.player = {
        ...fresh,
        ...snap.player,
        equip: { ...fresh.equip, ...(snap.player.equip ?? {}), pockets: snap.player.equip?.pockets ?? fresh.equip.pockets },
      }
      this.player.level = snap.level
      // aliveTime 由 (Date.now()-startTime) 推导：平移 startTime 保持存活时长连续
      this.player.startTime = Date.now() - (snap.player.aliveTime ?? 0) * 1000
      this.introT = 0 // 读档不播摔落爬起动画
      this.msg(`读档成功——回到 ${levelLabel(snap.level)}。`, 'system')
      return
    }
    this.loadLevel(0)
    this.introT = 3.2 // 开场：摔到 L0 地面后缓慢爬起
    this.msg(`你坠入了后室。种子 ${seedString(seed)}`, 'system')
    this.msg('找到每层的出口，向下探索。收集 6 盘磁带。', 'lore')
    this.persist() // v29a：新开局立即覆盖旧快照，保证 br_save 种子与快照始终同局
  }

  // v29a：当前进度快照（纯 JSON 可序列化）
  snapshot(): SaveSnapshot {
    return {
      v: 1,
      seed: this.seed,
      difficulty: this.difficulty,
      time: this.time,
      mapSeed: this.mapSeed,
      mapFirstVisit: this.mapFirstVisit,
      level: this.player.level,
      visited: [...this.visitedLevels],
      outpostReturn: this.outpostReturn,
      rep: this.rep,
      quests: this.quests,
      brcSin: this.brcSin,
      brcMimicCd: this.brcMimicCd,
      indoctrination: this.indoctrination,
      jerryTamed: this.jerryTamed,
      jerryAgreed: [...this.jerryAgreed],
      jerryOath: this.jerryOath,
      player: JSON.parse(JSON.stringify(this.player)),
    }
  }
  /** 立即写盘（暂停/退回主界面/周期自动存档共用入口；死亡与胜利后不再覆盖存档） */
  persist() {
    if (!this.map || this.player.hp <= 0 || this.victory) return
    storage.set(SAVE_KEY, JSON.stringify(this.snapshot()))
  }

  loadLevel(id: number, restore?: { mapSeed: number; firstVisit: boolean }) {
    const def = levelDefOf(id)!
    // v29：初始物资仅首次到层刷新（重访 L0 不再白嫖出生点补给）
    const firstVisit = !this.visitedLevels.has(id)
    this.visitedLevels.add(id)
    // v29：经 L0 灰色阶梯下行 → L1 出生点附近生成返程阶梯（在换图前取走标记）
    const viaStairs = this.arriveStairs
    this.arriveStairs = false
    // v51：乘电梯抵达（在换图前取走标记；读档恢复 restore 路径不套用电梯落点——存档以原出生点为准）
    const viaElevator = this.arriveElevator && !restore
    this.arriveElevator = false
    // v29a：读档恢复时复用存档记录的地图种子与首访标记，保证复现同一张图
    const mapSeed = restore?.mapSeed ?? (this.seed + this.time * 7 + id * 131)
    const fv = restore?.firstVisit ?? firstVisit
    this.map = generateLevel(def, mapSeed, fv)
    this.mapSeed = mapSeed
    this.mapFirstVisit = fv
    this.bonusExit = null
    this.wallMarks = [] // 地图重新生成，旧粉笔记号随之失效
    this.player.level = id
    this.player.x = this.map.spawn.x + 0.5
    this.player.y = this.map.spawn.y + 0.5
    // v51：乘电梯抵达——出生点改到本层电梯（elevatorshaft 出口）邻格；找不到可站邻格则保留默认出生点
    if (viaElevator) {
      const elev = this.map.exits.find((e) => e.def.kind === 'elevatorshaft')
      if (elev) {
        const m = this.map
        outer: for (let rad = 1; rad <= 4; rad++)
          for (let dy = -rad; dy <= rad; dy++)
            for (let dx = -rad; dx <= rad; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
              const nx = Math.floor(elev.x) + dx, ny = Math.floor(elev.y) + dy
              if (!canOccupy(m, nx + 0.5, ny + 0.5, PLAYER_RADIUS, { z: 0 })) continue
              this.player.x = nx + 0.5; this.player.y = ny + 0.5
              break outer
            }
      }
    }
    this.player.z = 0
    this.player.vz = 0
    this.player.crouching = false
    this.player.floor = 0
    this.introT = 0 // 层级切换不播爬起动画
    this.inLiquid = 0
    this.submerged = false
    this.breathT = 0
    this.wasSubmerged = false
    this.ride = null
    this.climb = null
    audio.setUnderwater(false)
    this.explored = new Uint8Array(this.map.w * this.map.h)
    this.visible = new Uint8Array(this.map.w * this.map.h)
    if (def.fullMap) this.explored.fill(1) // v35：据点——进入即获得完整地图
    if (id === 105) this.el3aReliefClaimed = false // v43：每次进入 EL3A 可领一次免费补给包
    this.fakes = []
    this.particles = []
    this.searching = null
    this.lootPanel = null
    this.seenThisLevel = new Set()
    this.redAnnounced = new Set()
    // v35：NPC 实例化（据点居民；不是实体；定义 = 静态注册表 + 本图随机生成）
    const npcDefMap = new Map<string, NpcDef>()
    for (const d of Object.values(NPCS)) npcDefMap.set(d.id, d)
    for (const d of this.map.npcDefs ?? []) npcDefMap.set(d.id, d)
    this.npcs = (this.map.npcs ?? [])
      .filter((sp) => npcDefMap.has(sp.id))
      .map((sp) => ({
        id: sp.id, def: npcDefMap.get(sp.id)!,
        x: sp.x, y: sp.y, facing: sp.facing ?? Math.random() * Math.PI * 2,
        floor: sp.floor ?? 0, // v46：多层据点——上层居民（EL3A 夹楼办公区 NPC 在 2F 游荡/交互）
        homeX: sp.x, homeY: sp.y, tx: sp.x, ty: sp.y,
        moveT: 1 + Math.random() * 5, bubbleText: '', bubbleT: 0,
      }))
    for (const n of this.npcs) if (!this.knownNpcs.some((k) => k.id === n.id)) this.knownNpcs.push(n.def)
    // v39：无限层级的 chunk NPC（衔尾段 BRC 员工）——活体对象由 LiveChunk 持有，这里收集为工作列表
    if (this.map.inf) this.syncInfNpcs()
    this.blackoutT = 0
    this.blackoutWarnT = 0
    this.provoked = false
    this.blackoutBackup = null
    this.plantK = 0 // v30：换层后植殖癌进展归零
    this.plantStage = 0
    // 现象「孤立效应」：每次进入 Level 0，画面微调色重新随机（极其轻微，一般无法察觉）
    this.colorGrade = id === 0
      ? {
          hue: (Math.random() * 2 - 1) * 1.5,
          sat: 1 + (Math.random() * 2 - 1) * 0.02,
          con: 1 + (Math.random() * 2 - 1) * 0.015,
          bri: 1 + (Math.random() * 2 - 1) * 0.02,
        }
      : { hue: 0, sat: 1, con: 1, bri: 1 }
    if (id === 1 && viaStairs && this.map.inf) this.placeBonusStairs() // v29：返程「向上的灰色阶梯」
    this.ambientT = 10 + Math.random() * 8
    audio.startHum(id)
    audio.startBGM(id)
    this.emit({ kind: 'levelchange' })
    this.msg(`${levelLabel(id)}「${def.name}」`, 'lore')
    if (def.sd) this.msg(def.sd, 'system')
    this.msg(`入口：${def.entrance}`, 'system')
    // 出口类型线索（任务 9）
    const hintKinds: Record<string, string> = {
      firedoor: '某处有一扇漆成红色的消防门。',
      crack: '你感觉某面墙后面「不太对劲」——像是空间本身的裂缝。',
      collapse: '某处地板看起来不结实。',
      freight: '你隐约听见货运电梯绞盘的锈响。',
      hatch: '某处有一个维修通道的方形舱口。',
      stairs: '楼梯井的穿堂风从某个方向吹来。',
      unlockeddoor: '某处有一扇没上锁的门——推开试试。',
      breakerdoor: '主电闸门就在本层，配电声隐隐可闻。',
      shaft: '排水竖井的滴水声在地底回荡。',
      backvent: '回流通风口在本层某处。',
      elevatorshaft: '电梯井在等两枚保险丝。',
      emergstairs: '绿色应急灯应该标着应急楼梯的方向。',
      arcflash: '某处有电弧短路的焦味——那也许能切出本层。',
      stafflift: '员工电梯需要门禁卡。',
      window: '落地窗的方向能感到微弱气流。',
      fireexit: '消防通道的指示牌在黑暗中发着绿光。',
      revolving: '大堂旋转门是离开这里的正门。',
      servicelift: '货运梯藏在本层的服务区。',
      mirror: '本层的某面镜子不是镜子。',
      flickerdoor: '某处有一面墙在规律地闪烁——跟着电流声与气流走。',
      // v23：Level 5–11 与结局层
      boilerdeep: '锅炉房深处的管道后面有一道下行的口子。据说从那里能到 Level 6。',
      seastairs: '往下走，仔细听——某个方向传来极微弱的海浪声。',
      coldgate: '你摸到一扇金属门，冰得手指发麻。',
      wiretrip: '脚踝高度有一根绷紧的细线。别绊到——除非你想去 Level 6.1。',
      seacave: '入口正下方那座海山的侧面，有一个黑色的洞口。',
      pipering: '西边约一百五十米、水下一百五十米，有一圈巨大的管道与石柱围成的环。里面立着一扇木门。',
      abyss: '七公里以下什么都没有，只有焦油堆和不停冒出的气泡。在那儿失去意识的人会在别处醒来。',
      ninthroad: '第九之路的路标每五十米一个，牌子上有 M.E.G. 的标志。跟着走。',
      tarpool: '前面有一池冒着热气的黑色焦油。幸存者说他们在 Level 41 或 91 醒来。',
      ceilclip: '洞顶某处的岩层薄得不正常——可以刻意向上剪辑出去。',
      arrowsign: '路口立着带箭头的路牌。沿着它走一百到两百英里，会到一座城市。',
      grasspath: '街区之间有一条通往草地的步道。',
      streetclip: '这段街面的沥青摸上去是软的。',
      longroad: '双车辙的土路笔直伸向地平线。它通向一座城市。',
      canola: '远处一片刺眼的黄——那是油菜地。它不属于这里的调色板。',
      lakeswim: '湖水清澈见底，底下却没有底。',
      basebeta: 'M.E.G. Base Beta 的档案室在城里。档案员要看齐六盘磁带才肯开门。',
      shopsign: '街上有一排陌生的店招。每一块牌子后面都是另一层。',
      groundclip: '这一段人行道下面是空的。',
      homedoor: '走廊尽头那扇门后面透出暖黄的光。门缝底下摆着一双拖鞋。',
      trueend: '中央那排金属字母底下有一扇门。没有装饰，也没有灯。',
    }
    const ex = this.map.exits[0]
    if (ex) this.msg(`出口线索：${hintKinds[ex.def.kind] ?? `找到 ${ex.def.name}。`}`, 'lore')
  }

  // ---------- 主更新 ----------
  update(dt: number) {
    // renderer3d.applyView 会把 input 向量「就地」旋转到世界系；键盘/触屏按住期间
    // mx/my 不会每帧重写，若消费后不复原，旋转将逐帧叠加 → 移动方向漂移、
    // 周期性朝反方向走（玩家感知为「卡顿/位置被拉回」）。
    // 这里保证：无论 step 从哪个分支返回，input 都被转回屏幕系。
    try {
      this.step(dt)
    } finally {
      this.unwindInput()
    }
    // v29a：暂停（暂停菜单）或退回主界面（over=true 且存活）时落盘一次
    if (this.paused || this.over) {
      if (!this.idleSaved) { this.idleSaved = true; this.persist() }
    } else this.idleSaved = false
  }

  // applyView 旋转的逆变换（R^-1 = R^T）
  private unwindInput() {
    const i = this.input
    if (Math.abs(i.mx) < 1e-6 && Math.abs(i.my) < 1e-6) return
    const s = Math.sin(look.yaw), c = Math.cos(look.yaw)
    const mx = c * i.mx - s * i.my
    const my = s * i.mx + c * i.my
    i.mx = mx; i.my = my
  }

  private step(dt: number) {
    if (!this.map || this.paused || this.over) return
    dt = Math.min(dt, 0.05)
    this.time += dt
    // v29a：每 3 秒自动存档（退回主界面后「继续游戏」恢复进度用）
    this.autosaveT += dt
    if (this.autosaveT >= 3) { this.autosaveT = 0; this.persist() }
    const p = this.player
    const m = this.map
    const dm = DIFF[this.difficulty]
    // v51：糖果效果计时器
    if (this.candyAddictT > 0) {
      this.candyAddictT -= dt
      if (this.candyAddictT <= 0) {
        p.sanity = Math.max(0, p.sanity - 10)
        this.msg('糖瘾发作——你需要再来一颗糖。（理智 -10）', 'damage')
      }
    }
    if (this.silverTongueT > 0) this.silverTongueT -= dt
    if (this.gunCandyT > 0) {
      this.gunCandyT -= dt
      if (this.gunCandyT <= 0) this.msg('右手的枪感褪去了——它重新变回了手。', 'lore')
    }
    if (this.chocoCd > 0) this.chocoCd -= dt
    // v51：人制品售货机——看过背面后，玩家背对它（视线锥外且 10m 内）即活化追击；受到攻击也会活化
    for (const e of m.entities) {
      if (e.dead || e.def.type !== 'vendingmachine') continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      const provoked = e.hp < e.def.hp // 受到攻击
      const turnedBack = !!e.activated && d <= 10 && this.viewAngle(e.x, e.y) > 1.7 // 看过背面后背对它
      if (provoked || turnedBack) {
        e.activated = false
        e.def = ENTITIES.vmad
        e.state = 'chase'; e.stateT = 0; e.targetX = p.x; e.targetY = p.y
        audio.aggro()
        this.msg('背后传来白骨摩擦地面的声响——人制品售货机站起来了。', 'damage')
      }
    }
    // v51：人制品效应计时（5 分钟）
    if (this.manmadeT > 0) this.manmadeT -= dt
    // v51：Nguithr'xurh 镇静剂麻痹计时
    if (this.webbedT > 0) this.webbedT -= dt
    // v51：玩家朝向每帧跟随视角——此前仅在移动时按移动方向赋值，
    // 原地转身后攻击判定锥/投掷物/滋水枪水线仍朝旧方向（与 renderer3d 视线前向一致）
    p.facing = Math.atan2(-Math.sin(look.yaw), -Math.cos(look.yaw))

    // 过渡动画中
    if (this.transition) {
      this.transition.t += dt
      if (this.transition.t > 0.9) {
        const t = this.transition
        this.transition = null
        if (t.dest === 'win') {
          this.victory = true; this.over = true
          clearSaveSnapshot() // v29a：通关后旧进度存档失效
          this.emit({ kind: 'victory' })
          audio.stopHum(); audio.stopBGM(); audio.setHeartbeat(false, 0)
        } else {
          const dest = t.dest === 'random' ? Math.floor(Math.random() * NORMAL_LEVELS) : t.dest
          if (t.fallDamage) {
            p.hp -= t.fallDamage
            this.emit({ kind: 'damage' })
            if (p.hp <= 0) { this.die('坠亡'); return }
          }
          this.loadLevel(dest)
          this.emit({ kind: 'transition', anim: 'intro' })
        }
      }
      return
    }

    p.aliveTime = (Date.now() - p.startTime) / 1000

    // 开场爬起：计时递减，期间锁定移动/攻击/跳跃（任意输入=立即起身跳过）
    if (this.introT > 0) {
      const skip = Math.hypot(this.input.mx, this.input.my) > 0.1 || this.input.jump || this.input.attack
      this.introT = skip ? 0 : Math.max(0, this.introT - dt)
    }
    const introLock = this.introT > 0

    // ---- 移动 ----
    const mag = Math.hypot(this.input.mx, this.input.my)
    const tileI = Math.floor(p.y) * m.w + Math.floor(p.x)
    const wet = m.wet[tileI] === 1
    // v13：楼层高度带（供 HUD/小地图与碰撞）
    const band = bandOfZ(p.z)
    p.floor = band
    // v13：液体状态（深水=可沉没游泳；浅水=减速涟漪）
    const lq = band === 0 ? m.liquid[tileI] : 0
    if (lq !== this.inLiquid) {
      if (lq === 1 && this.inLiquid === 0) { // 入水扑通
        audio.splash()
        this.splashParticles(p.x, p.y, 0)
        this.msg('你跌进了水里——冰冷刺骨。', 'system')
      } else if (this.inLiquid === 1 && lq !== 1) { // 出水
        audio.splash(0.5)
        this.splashParticles(p.x, p.y, 0)
        this.breathT = 0
      }
      this.inLiquid = lq
    }
    // 蹲伏状态：按住蹲伏键，或身处低通道被风道强制压低头
    p.crouching = this.input.crouch || m.crawl[tileI] === 1
    let speed = 3.4
    const wantSprint = this.input.sprint && !p.crouching && mag > 0.1 && p.stamina > 1 && lq !== 1
    if (this.input.sprint && mag > 0.1 && p.stamina <= 1) {
      // 体力耗尽提示（节流 4 秒）
      if (this.statusMsgT.stamina <= 0) { this.msg('体力耗尽——喘口气再跑。', 'system'); this.statusMsgT.stamina = 4 }
    }
    if (wantSprint) { speed = 6.0; p.stamina = Math.max(0, p.stamina - 22 * (this.manmadeT > 0 ? 2 : 1) * dt) } // v51：人制品效应中体力消耗 ×2
    else p.stamina = Math.min(100, p.stamina + (p.coffeeT > 0 ? 24 : 12) * (this.inOutpost ? 2 : 1) * (this.manmadeT > 0 ? 0.5 : 1) * dt) // v51：人制品效应中体力恢复 ×0.5
    if (p.crouching) speed *= 0.5 // 蹲伏减速
    if (wet && lq === 0) speed *= 0.55
    if (lq !== 0) speed *= 0.5 // v13：液体中移动减速
    if (p.slowT > 0) { p.slowT -= dt; speed *= 0.5 }
    if (this.webbedT > 0) speed *= 0.5 // v51：镇静剂麻痹——移动迟缓
    if (p.flashJamT > 0) p.flashJamT -= dt
    if (this.dev.speed) speed *= 1.8
    if (this.plantK > 0) speed *= 1 - 0.55 * Math.min(1, this.plantK) // v30 植殖癌：行为逐渐僵硬
    if (p.coffeeT > 0) p.coffeeT -= dt
    this.statusMsgT.stamina -= dt
    this.statusMsgT.hunger -= dt
    // v23：The Manila Room——墙内传出敲击声与砰砰声，灯灭期间最响；灯亮度剧烈波动、周期性全黑
    {
      const mi = Math.floor(p.y) * m.w + Math.floor(p.x)
      const inManila = m.tint?.[mi] === 1
      if (inManila) {
        this.manilaT -= dt
        if (this.manilaT <= 0) {
          this.manilaT = 9 + Math.random() * 11
          const dark = this.blackoutT > 0
          const lines = dark
            ? ['灯全灭了。墙里那阵敲击声一下子变得很近——就在你背后那面墙的里面。',
               '黑暗中，砰、砰、砰。有规律，像是在回应什么。']
            : ['墙里传来敲击声。你贴上去听，它停了；你退开，它又开始了。',
               '砰的一声闷响从墙体内部传来。这间房的墙有两格厚。',
               '如果有人从门口进来，你会先看见一个轮廓「淡入现形」。别和别人同时走同一个门。']
          this.msg(lines[Math.floor(Math.random() * lines.length)], 'lore')
          if (dark) { p.sanity = Math.max(0, p.sanity - 6); this.emit({ kind: 'sanityhit' }) }
        }
      } else this.manilaT = 4
    }
    // v30：植殖癌（Level 1 花园段）——行为逐渐僵硬、视野逐渐变绿，最终原地生根化为一株植物
    {
      const inf = m.inf
      const realGarden = this.levelDef.id === 1 && !!inf &&
        inf.chunks.get(chunkKey(Math.floor((inf.ox + p.x) / CS), Math.floor((inf.oy + p.y) / CS)))?.variant === 'garden'
      // 开发者面板现象开关：可强制触发/屏蔽植殖癌（无视所在区段）
      const inGarden = (realGarden || this.dev.phenOn.has('plantcancer')) && !this.dev.phenOff.has('plantcancer')
      this.inGardenEff = inGarden
      if (inGarden) this.plantK = Math.min(1, this.plantK + dt / 75)
      else this.plantK = Math.max(0, this.plantK - dt / 37)
      const stages: [number, string][] = [
        [0.25, '你的关节有些发僵，像是很久没有活动过。'],
        [0.5, '视野的边缘泛起一层新绿。你的动作越来越迟缓了。'],
        [0.75, '皮肤下浮现出叶脉般的纹路——阳光照在身上，竟有种光合作用的暖意。'],
      ]
      while (this.plantStage < stages.length && this.plantK >= stages[this.plantStage][0]) {
        this.msg(stages[this.plantStage][1], 'damage')
        this.plantStage++
      }
      if (this.plantK <= 0.05 && this.plantStage > 0) {
        this.plantStage = 0
        this.msg('绿意从视野里褪去，四肢重新听使唤了。', 'system')
      }
      if (this.plantK >= 1) { this.die('植殖癌——你在阳光里生根，化作了一株绿植'); return }
    }
    // v23：⚠ 切勿把 Pockets 带入 Level 9——会立即引来 Entity 96「The Neighborhood Watch」
    if (p.hasPockets && this.levelDef.id === 9) {
      this.pocketsAlarmT -= dt
      if (this.pocketsAlarmT <= 0) {
        this.pocketsAlarmT = 22
        let n = 0
        for (const e of m.entities) {
          if (e.dead || (e.def.type !== 'watcher' && e.def.type !== 'strider')) continue
          e.state = 'chase'; e.targetX = p.x; e.targetY = p.y; e.stateT = 0
          n++
        }
        if (n) {
          this.msg('背包里的 Pockets 在发烫。街区尽头，有什么东西同时转了过来。', 'damage')
          audio.aggro()
        }
      }
    }
    this.statusMsgT.battery -= dt
    // v13：电梯乘降 / 梯子攀爬进行中：锁定水平移动（垂直由对应逻辑驱动）
    // v51：脚滑漂移量足够时，即使松开方向键也会继续滑动
    const slipDrift = Math.hypot(this.slipVx, this.slipVy)
    if ((mag > 0.1 || (this.slipperyT > 0 && slipDrift > 0.05)) && !this.ride && !this.climb && !introLock) {
      // 固定子步积分：dt 先入累加器，按 FIXED_STEP 切分子步逐次「移动→解碰撞」。
      // 高帧率不会积分抖动，低帧率不会大步长穿墙弹回；脚步声/噪音按实际位移计。
      const scale = mag > 0.1 ? Math.min(mag, 1) / mag : 0
      // v51：咀嚼子弹脚滑——输入叠加衰减的惯性漂移，停步后仍会向前滑出
      if (this.slipperyT > 0) {
        this.slipperyT -= dt
        this.slipVx += this.input.mx * dt * 3
        this.slipVy += this.input.my * dt * 3
        this.slipVx *= Math.max(0, 1 - dt * 1.8)
        this.slipVy *= Math.max(0, 1 - dt * 1.8)
      } else { this.slipVx = 0; this.slipVy = 0 }
      const moved = integrateMove(m, p, this.input.mx * scale + this.slipVx, this.input.my * scale + this.slipVy, speed, dt, this.moveIt, { noclip: this.dev.noclip, z: this.onStairs ? 0 : p.z, crouch: p.crouching, band: this.onStairs ? 0 : band })
      const movedDist = Math.hypot(moved.x, moved.y)
      // v51 修复：删除移动方向覆写 p.facing 的旧行——facing 由 609 行每帧锁定为视角方向；
      // 移动中（尤其侧移/后退）被覆写成移动方向，导致 inView 视锥错位、交互提示一会有一会无
      this.stepAcc += movedDist
      p.steps += movedDist
      if (this.stepAcc > 0.9) {
        this.stepAcc = 0
        const g0 = this.levelDef.gen
        if (lq !== 0) audio.swim() // 水中移动划水声
        else audio.footstep(g0 === 'garage' || g0 === 'grid' ? 'concrete' : g0 === 'pipes' ? 'metal' : 'carpet')
        this.noise = Math.min(1, this.noise + (wantSprint ? 0.5 : 0.15))
        if (wantSprint) this.noiseEvent(p.x, p.y, 10, true)
        else this.noiseEvent(p.x, p.y, p.crouching ? 1 : 4, false) // 蹲行近乎无声（肢团听不见）
      }
      // v13：移动涟漪（浅水与水面）
      if (lq !== 0 && movedDist > 0.01) {
        this.rippleT -= dt
        if (this.rippleT <= 0) { this.rippleT = 0.22; this.rippleParticles(p.x, p.y) }
      }
    }
    this.noise = Math.max(0, this.noise - dt * 1.2)
    this.playerNoiseT = Math.max(0, this.playerNoiseT - dt)

    // ---- v17：无限模式（L0）——玩家跨出中心 chunk 时流式平移窗口 ----
    if (m.inf) {
      this.updateInfiniteWindow()
      // 红室（v34）：到达刷新红室的区块先播报预警；玩家真正走进红厅（瓦片 tint=2）才触发蔓延
      const inf = m.inf
      if (!inf.plague) {
        const ck = chunkKey(Math.floor((inf.ox + p.x) / CS), Math.floor((inf.oy + p.y) / CS))
        const c = inf.chunks.get(ck)
        if (c?.variant === 'red') {
          if (!this.redAnnounced.has(ck)) {
            this.redAnnounced.add(ck)
            this.msg('空气里多了一股铁锈味。前方有个房间透着不祥的红光——档案里管那种地方叫「红室」，别久留。', 'lore')
          }
          if (m.tint[Math.floor(p.y) * m.w + Math.floor(p.x)] === 2) {
            // 红室蔓延：周围所有房间与即将生成的新区域全部变成红室（不再产物资）
            applyRedPlague(m)
            p.sanity = Math.max(0, p.sanity - 15)
            this.camShake = Math.min(1, this.camShake + 0.5)
            audio.whisper(1)
            this.msg('红色漫过了你的脚踝——墙纸、地毯、灯光，一切都在变红。档案说得对：已经来不及了。', 'lore')
          }
        }
      }
    }

    // ---- v13：电梯乘降（交互后轿厢垂直送达另一层）----
    if (this.ride) {
      const r = this.ride
      r.t += dt
      const k = Math.min(1, r.t / 1.7)
      const s = k * k * (3 - 2 * k)
      p.x = r.sx; p.y = r.sy // 轿厢内固定
      p.z = r.from + (r.to - r.from) * s
      p.vz = 0
      const liftS = m.structures.find((st) => st.kind === 'lift' && Math.floor(st.x) === Math.floor(r.sx) && Math.floor(st.y) === Math.floor(r.sy))
      if (liftS) liftS.data = { ...liftS.data, carZ: p.z } // 轿厢随玩家升降
      if (k >= 1) {
        if (liftS) liftS.data = { ...liftS.data, car: bandOfZ(r.to), carZ: r.to }
        this.ride = null
        audio.pickup()
        this.msg(bandOfZ(p.z) === 1 ? '电梯门滑开——上层。' : '电梯门滑开——回到了楼下。', 'system')
      }
    }

    // ---- v23：绊线（Wikidot Level 6「意外绊到线 → Level 6.1」）----
    if (!this.transition) {
      const tw = m.structures.find((st) => st.kind === 'tripwire' && !st.data?.tripped
        && Math.hypot(st.x + 0.5 - p.x, st.y + 0.5 - p.y) < 0.62)
      if (tw) {
        tw.data = { ...tw.data, tripped: 1 }
        this.msg('脚踝碰到了一根绷紧的细线。', 'damage')
        audio.hurt()
        p.hp -= 6
        this.emit({ kind: 'damage' })
        if (p.hp <= 0) { this.die('绊线'); return }
        const td = Math.floor(Math.random() * NORMAL_LEVELS)
        this.transition = { anim: 'noclip', t: 0, dest: td }
        this.emit({ kind: 'transition', anim: 'noclip', cutIn: levelDefOf(td)?.entryAnim ?? 'dark', dest: td })
      }
    }

    // ---- v13：梯子攀爬（贴近按住前进即竖直攀爬）----
    if (!this.ride) this.updateClimb(dt, mag)

    // ---- v7：垂直（跳跃/重力/高度档贴地）+ v13 深水浮沉 ----
    if (this.ride || this.climb || this.onStairs) {
      // 垂直位置由电梯/梯子/可行走阶梯脚本驱动（onStairs 时由 updateStairs 绑定坡道高度）
    } else if (lq === 1) {
      // 深水中：下沉→池底；跳跃=向上划水；浮力趋向水面
      const FLOAT_Z = -0.5 // 浮起时水面下的平衡高度（头露出水面）
      if (this.input.jump) {
        this.input.jump = false
        p.vz = 2.6 // 划水上浮
        audio.swim()
      }
      p.vz -= 5.0 * dt // 水中重力（缓沉）
      if (p.z > FLOAT_Z && p.vz > 0) p.vz -= 9 * dt // 水面附近压回
      p.vz = Math.max(-1.5, Math.min(2.6, p.vz))
      p.z += p.vz * dt
      if (p.z <= -POOL_DEPTH) { p.z = -POOL_DEPTH; p.vz = 0 } // 池底
      if (p.z > 0.1) { p.z = 0.1; p.vz = 0 } // 不越出水面
      // 水下状态：屏气 + 低通滤波 + 气泡
      const sub = p.z + 1.55 < 0
      if (sub && !this.wasSubmerged) this.msg('水没过了头顶——视野变成浑浊的蓝。', 'system')
      this.submerged = sub
      this.wasSubmerged = sub
      audio.setUnderwater(sub)
      if (sub) {
        this.breathT += dt
        this.bubbleT -= dt
        if (this.bubbleT <= 0) { this.bubbleT = 0.5; this.bubbleParticles(p.x, p.y, p.z + 1.3) }
        if (this.breathT > 8 && !this.dev.god) {
          p.hp -= 2.5 * dt * dm.dmg
          if (this.statusMsgT.hunger <= 0) { this.statusMsgT.hunger = 5; this.msg('你快喘不上气了——快浮上去！', 'damage') }
          if (p.hp <= 0) { this.die('溺亡在泳池里'); return }
        }
      } else this.breathT = Math.max(0, this.breathT - dt * 2)
    } else {
      // v26：地面高度 = 地形地面 与 可站立结构顶面（桌/床/箱等低矮家具）取高者
      const g = Math.max(groundHeightAt(m, p.x, p.y, band), structStandTopAt(m, p.x, p.y, p.z, band))
      if (this.input.jump && !introLock) {
        this.input.jump = false
        // 贴地且未蹲伏才能起跳（蹲伏中无法发力）
        if (!p.crouching && p.vz <= 0 && p.z <= g + 0.02) {
          p.vz = 5.4 // 跳跃初速（重力 11 → 跳跃顶点 ≈1.32m，可跃上 +1.2m 高台）
          p.z = g + 0.02
          audio.footstep('concrete')
        }
      }
      if (p.z > g || p.vz > 0) {
        // 滞空：重力积分
        p.vz -= 11 * dt
        p.z += p.vz * dt
        if (p.z <= g) {
          // 落地（重着地震屏 + 脚步声）
          if (p.vz < -4) {
            this.camShake = Math.min(1, this.camShake + 0.18)
            const g0 = this.levelDef.gen
            audio.footstep(g0 === 'garage' || g0 === 'grid' ? 'concrete' : g0 === 'pipes' ? 'metal' : 'carpet')
          }
          p.z = g; p.vz = 0
        }
      } else {
        p.z = g // 贴地跟随（坡道平滑上下）
        if (p.vz < 0) p.vz = 0
      }
    }
    // v26：天花板碰撞——跳跃/上浮头顶不穿天花板（室外/挑高区按各自顶高；风道底 1.15m）
    if (!this.ride && !this.climb) {
      const ceil = ceilingHeightAt(m, p.x, p.y, WALL_H[this.levelDef.gen] ?? 3, band)
      const headH = p.crouching ? 0.95 : 1.55
      const maxZ = ceil - headH
      if (p.z > maxZ) {
        p.z = Math.max(groundHeightAt(m, p.x, p.y, band), maxZ)
        if (p.vz > 0) p.vz = 0
      }
    }
    // v29：可行走灰色阶梯——走下去/走上去自动换层（覆盖本帧重力贴地结果）
    this.updateStairs(dt)
    // 深坑坠落：跌入深渊（elev=4，洞底 -10m）持续下坠，超过 -4.5m 即死（环境抹除，无视无敌）
    if (!this.ride && !this.climb && p.z < -4.5 && !this.dev.noclip) { this.die('坠入深坑', true); return }
    // 离水判定（走出液体格）
    if (this.inLiquid !== 0 && m.liquid[tileI] === 0) {
      this.inLiquid = 0
      this.submerged = false
      this.wasSubmerged = false
      this.breathT = 0
      audio.setUnderwater(false)
    }

    // ---- 生存消耗（v51：据点中饥饿下降 ×1/3；玩家不动时 ×1/2，可叠加）----
    const hungerK = (this.inOutpost ? 1 / 3 : 1) * (mag > 0.1 ? 1 : 0.5)
    p.hunger = Math.max(0, p.hunger - 0.28 * dm.drain * (this.levelDef.entropy ?? 1) * hungerK * dt)
    if (p.hunger <= 25 && this.statusMsgT.hunger <= 0) {
      this.statusMsgT.hunger = 8
      this.msg('你饿得头晕。', 'damage')
      audio.stomach()
    }
    if (p.hunger <= 0 && !this.dev.god) { p.hp -= 1.2 * dt; if (p.hp <= 0) { this.die('饿死了'); return } }
    // 理智：黑暗中流失
    const lit = this.isLit(p.x, p.y)
    // 现象判定：孤立效应——Level 0 除马尼拉室外的所有区域发生（红室 tint=2，马尼拉 tint=1），
    // 生效期间替代原版的黑暗理智流失机制；植殖癌——花园段生效（判定见上方，含染病未愈期）。
    // 开发者面板可对每个现象强制开（phenOn）/强制关（phenOff）
    const pTint = m.tint?.[Math.floor(p.y) * m.w + Math.floor(p.x)] ?? 0
    let isolation = p.level === 0 && pTint !== 1
    if (this.dev.phenOn.has('isolation')) isolation = true
    if (this.dev.phenOff.has('isolation')) isolation = false
    const flickerActive = this.levelDef.id === 1 &&
      (this.dev.phenOn.has('flicker') || (!this.dev.phenOff.has('flicker') && (this.blackoutWarnT > 0 || this.blackoutT > 0)))
    this.activePhenomena = [
      ...(isolation ? ['isolation'] : []),
      ...(this.inGardenEff || this.plantK > 0.01 ? ['plantcancer'] : []),
      ...(flickerActive ? ['flicker'] : []),
    ]
    if (!this.dev.god) {
      if (isolation) {
        // 孤立效应：缓慢失去理智；红室内流失速率加倍
        p.sanity -= 0.25 * dm.drain * (pTint === 2 ? 2 : 1) * dt
      } else if (!lit && !p.flashlight) p.sanity -= 1.5 * dm.drain * dt
      else if (!lit) p.sanity -= 0.5 * dm.drain * dt
      else p.sanity = Math.min(100, p.sanity + 0.4 * dt)
      // 附近实体压迫感
      for (const e of m.entities) {
        if (e.dead || e.hidden || e.disguised) continue
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d < 5 && !e.def.passive) p.sanity -= (5 - d) * 0.5 * dt
      }
      p.sanity = Math.max(0, Math.min(100, p.sanity))
      // v32：皇家口粮——理智下限锁定（成瘾崩塌期间失效，崩塌时理智急速下降）
      if (this.royalDrainT > 0) { this.royalDrainT -= dt; p.sanity = Math.max(0, p.sanity - 9 * dt) }
      else if (p.sanity < this.sanityFloor) p.sanity = this.sanityFloor
    }
    // v32：皇家口粮成瘾期计时（期间其他食物不恢复饥饿）
    if (this.royalAddictT > 0) {
      this.royalAddictT -= dt
      if (this.royalAddictT <= 0) this.msg('对皇家口粮的渴求终于褪去了。', 'system')
    }
    // v23：Level 6 的外带光源全部失效——开关是响的，灯头在发烫，但视野里什么都没有改变
    if (this.levelDef.noFlashlight && p.flashlight && this.statusMsgT.battery <= 0) {
      this.statusMsgT.battery = 14
      this.msg('手电亮着，灯头在发烫——但你的视野里什么都没有改变。', 'lore')
    }
    if (p.flashlight) {
      // v23：Level 8 的熵效应——电池飞快耗尽
      p.battery = Math.max(0, p.battery - 0.5 * (this.levelDef.entropy ?? 1) * dt)
      if (p.battery <= 0) { p.flashlight = false; this.msg('手电筒没电了。', 'system') }
      else if (p.battery <= 15 && this.statusMsgT.battery <= 0) {
        this.statusMsgT.battery = 10
        this.msg('手电电池快耗尽了，光开始闪烁。', 'system')
      }
    }
    // 开发者模式：状态锁定（devSetStat 会暂时解除锁定以便手动调整）
    if (this.dev.god && this.dev.statLock) { p.hp = 100; p.sanity = 100; p.hunger = 100; p.stamina = 100; if (p.flashlight) p.battery = 100 }

    audio.updateHeartbeat(p.hp)
    audio.updateWhispers(dt, p.sanity)
    audio.setSanityDistort(p.sanity)

    // 低理智幻影
    if (p.sanity < 40 && Math.random() < dt * 0.25 && this.fakes.length < 4) {
      const ang = Math.random() * Math.PI * 2
      const fx = p.x + Math.cos(ang) * 6, fy = p.y + Math.sin(ang) * 6
      if (tileAt(m, Math.floor(fx), Math.floor(fy)) === 1)
        this.fakes.push({ x: fx, y: fy, t: 2 + Math.random() * 3 })
    }
    for (const f of this.fakes) f.t -= dt
    this.fakes = this.fakes.filter((f) => f.t > 0)

    // ---- 攻击 ----
    if (this.attackAnimT > 0) this.attackAnimT -= dt
    if (this.input.attack) {
      this.input.attack = false
      if (!introLock) this.attack()
    }
    this.updateProjectiles(dt)
    if (this.input.toggleLight) {
      this.input.toggleLight = false
      // v32：头灯（头饰栏）与手电筒（副手）共用开关与电池
      const beamKind = p.equip.offhand?.type === 'flashlight' ? '手电筒' : p.equip.head?.type === 'headlamp' ? '头灯' : null
      if (!beamKind) {
        this.msg('没有手电筒或头灯。手电筒装在【副手】，头灯装在【头饰】。', 'system')
      } else if (p.battery > 0 || p.flashlight) {
        p.flashlight = !p.flashlight
        audio.uiTick()
        this.msg(`${beamKind}：${p.flashlight ? '开' : '关'}`, 'system')
      }
    }

    // ---- 实体 AI ----
    this.updateEntities(dt, dm.dmg)
    this.trackQuests(dt) // v35：委托进度追踪

    // ---- v45：信众领地判定（HUD 声望显示，仿衔尾段 ouroboros：记下房间矩形，玩家在矩形内即显示）----
    this.jerryTerritory = p.level === 2 && !!m.inf && l2JerryRoomRectAt(m.inf.seed, m.inf.ox + p.x, m.inf.oy + p.y) !== null
    // ---- v45：教化诵咏——在 Level 274 内被教化（教化值 >0 且鹉主未被驯服）的玩家周期性不受控咏出崇拜词；离开即停 ----
    if (p.level === 274 && this.indoctrination > 0 && !this.jerryTamed) {
      this.chantT -= dt
      if (this.chantT <= 0) {
        this.chantT = 7 + Math.random() * 6
        this.msg(`你不受控地诵咏：「${JERRY_CHANT_LINES[Math.floor(Math.random() * JERRY_CHANT_LINES.length)]}」`, 'lore')
      }
    } else this.chantT = 0
    // v47：接触杰瑞冷却（20s 防连点刷声望/教化；HUD 交互提示显示剩余秒数）
    if (this.jerryContactCd > 0) this.jerryContactCd = Math.max(0, this.jerryContactCd - dt)

    // ---- v35：NPC（据点居民：岗位附近缓慢游荡 + 偶尔自言自语）----
    // v39：BRC 模仿装修（挥臂动画播完才结算 +2 声望——动作即「短暂延迟」；冷却全局 ~90s）
    if (this.brcMimicCd > 0) this.brcMimicCd = Math.max(0, this.brcMimicCd - dt)
    if (this.brcMimicPending > 0) {
      this.brcMimicPending -= dt
      if (this.brcMimicPending <= 0) {
        this.changeRep('brc', 2)
        this.msg('你学着他们的动作挥臂敲打了一阵。附近的员工似乎朝你点了点头。（后室装修公司 声望 +2）', 'loot')
      }
    }
    for (const n of this.npcs) {
      n.bubbleT = Math.max(0, n.bubbleT - dt)
      // v46：NPC 楼层带感知的可行走判定（上层居民走 up 楼板避开上层墙/上层实心家具；主层居民走地板）
      const walkOk = (nx: number, ny: number): boolean => {
        if ((n.floor ?? 0) === 1) {
          const ti = Math.floor(ny) * m.w + Math.floor(nx)
          return m.up[ti] === 1 && m.upWall[ti] !== 1 && !solidStructAtFloor(m, nx, ny, 1)
        }
        return tileAt(m, Math.floor(nx), Math.floor(ny)) === 1 && !solidStructAtFloor(m, nx, ny, 0)
      }
      // v39：死亡动画计时（尸体由渲染层倒地/下沉，计时归零后在循环尾移除）
      if (n.dead) { n.deathT = (n.deathT ?? 0) - dt; continue }
      // v45：杰瑞的信众敌意规则（全团体通用）——jerry 声望 ≤ -10 转敌对（主动攻击玩家），恢复后放下敌意
      if (n.def.faction === 'jerry') n.hostile = (this.rep.jerry ?? 0) <= -10 ? true : undefined
      // v39：敌对（被当面坦白的 BRC 员工）：追击玩家 + 近战；玩家可反击杀死
      if (n.hostile) {
        const hdx = p.x - n.x, hdy = p.y - n.y, hdd = Math.hypot(hdx, hdy)
        n.atkT = Math.max(0, (n.atkT ?? 0) - dt)
        if (hdd > 1.15) {
          const sp = 2.3 * dt
          const nx2 = n.x + (hdx / hdd) * sp, ny2 = n.y + (hdy / hdd) * sp
          if (walkOk(nx2, ny2)) { n.x = nx2; n.y = ny2 }
          n.tx = p.x; n.ty = p.y // 渲染层据此播步态
        } else {
          n.tx = n.x; n.ty = n.y
          if (n.atkT <= 0) { n.atkT = 1.3; this.hurtPlayer(9, `${FACTIONS[n.def.faction ?? 'meg']?.name ?? 'NPC'} ${n.def.name}`); audio.swing() }
        }
        n.facing = Math.atan2(hdy, hdx)
        continue
      }
      // v45：杰瑞的信众——看见玩家（~8m）主动靠近（approach 走向玩家），到 ~2.5m 停下后高频自言自语传教；
      // 不追出领地（玩家离岗位锚点 >10m 即放弃，回默认游荡）；
      // v47：仅野外随机信众（L2 宣传间）主动传教——L274 内的信众不主动靠近，需玩家主动交谈
      if (n.def.faction === 'jerry' && p.level !== 274) {
        const jdx = p.x - n.x, jdy = p.y - n.y, jdd = Math.hypot(jdx, jdy)
        if (jdd < 8 && Math.hypot(p.x - n.homeX, p.y - n.homeY) < 10) {
          if (jdd > 2.5) {
            const sp = 1.7 * dt
            const nx2 = n.x + (jdx / jdd) * sp, ny2 = n.y + (jdy / jdd) * sp
            if (walkOk(nx2, ny2)) { n.x = nx2; n.y = ny2 }
            n.tx = p.x; n.ty = p.y // 渲染层据此播步态
          } else {
            n.tx = n.x; n.ty = n.y // 停下：面向玩家高频传教
            n.moveT -= dt
            if (n.moveT <= 0) {
              n.bubbleText = JERRY_PREACH_LINES[Math.floor(Math.random() * JERRY_PREACH_LINES.length)]
              n.bubbleT = 2.8
              n.moveT = 2.5 + Math.random() * 2
            }
          }
          n.facing = Math.atan2(jdy, jdx)
          continue
        }
      }
      // v39：工作循环（BRC 员工）：锚定在工作点不游荡，始终面向工作面（墙/脚手架）
      if (n.def.workLoop) {
        n.tx = n.homeX; n.ty = n.homeY
        if (n.homeFacing !== undefined) n.facing = n.homeFacing
        continue
      }
      n.moveT -= dt
      if (n.moveT <= 0) {
        if (Math.random() < 0.3 && n.def.idle.length > 0) { // 驻足自语
          n.bubbleText = n.def.idle[Math.floor(Math.random() * n.def.idle.length)]
          n.bubbleT = 3
          n.moveT = 4 + Math.random() * 5
        } else { // 新挪动目标（岗位半径 3 内）
          const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 2.5
          n.tx = n.homeX + Math.cos(a) * r
          n.ty = n.homeY + Math.sin(a) * r
          n.moveT = 5 + Math.random() * 7
        }
      }
      const ndx = n.tx - n.x, ndy = n.ty - n.y, ndd = Math.hypot(ndx, ndy)
      if (ndd > 0.15) {
        const sp = 0.7 * dt
        const nx = n.x + (ndx / ndd) * sp, ny = n.y + (ndy / ndd) * sp
        if (walkOk(nx, ny)) { n.x = nx; n.y = ny }
        else { n.tx = n.homeX; n.ty = n.homeY } // 受阻回岗位
        n.facing = Math.atan2(ndy, ndx)
      }
    }
    // v39：尸体清理（引擎列表与所属 chunk 一并移除，防止窗口重缝合/重访时复活）
    if (this.npcs.some((n) => n.dead && (n.deathT ?? 0) <= 0)) {
      const gone = this.npcs.filter((n) => n.dead && (n.deathT ?? 0) <= 0)
      this.npcs = this.npcs.filter((n) => !(n.dead && (n.deathT ?? 0) <= 0))
      if (m.inf) for (const c of m.inf.chunks.values()) c.npcs = c.npcs.filter((n) => !gone.includes(n))
    }

    // ---- v51：L3 配电箱电流嗡鸣（定位音频惯例：按最近配电箱距离逐帧调音量）----
    if (this.levelDef.id === 3) {
      let dh = 1e9
      for (const s of m.structures) {
        if (s.kind !== 'elecbox') continue
        const dd = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
        if (dd < dh) dh = dd
      }
      audio.setElecHum(dh < 9 ? 1 - dh / 9 : 0)
    } else audio.setElecHum(0)

    // ---- 交互检测 ----
    this.scanInteract()
    if (this.input.interact) {
      this.input.interact = false
      this.doInteract()
    }

    // ---- 容器搜索进度 ----
    if (this.searching) {
      const s = this.searching
      const st = m.structures.find((x) => x.data?.sid === s.sid)
      const near = st && Math.hypot(st.x + st.w / 2 - p.x, st.y + st.h / 2 - p.y) < 2.4
      if (!st || !near || st.looted) {
        this.searching = null // 离开或已空，取消
      } else {
        s.t += dt
        if (Math.random() < dt * 5) audio.searchTick()
        if (s.t >= s.dur) {
          this.searching = null
          this.finishSearch(st)
        }
      }
    }

    // ---- 战利品面板：离开交互半径自动关闭（未拿取物品留在容器内，可再次搜索）----
    if (this.lootPanel) {
      const lp = this.lootPanel
      const st = m.structures.find((x) => x.data?.sid === lp.sid)
      if (!st || Math.hypot(st.x + st.w / 2 - p.x, st.y + st.h / 2 - p.y) > 2.5) {
        this.closeLootPanel()
      }
    }

    // ---- 粒子 ----
    for (const pt of this.particles) { pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; if (pt.z !== undefined) pt.z += (pt.vz ?? 0) * dt }
    this.particles = this.particles.filter((pt) => pt.t < pt.life).slice(-120)

    // 未涂黑窗户陷阱（wiki L4：未涂黑的窗户必须避开）——靠近即触发一次
    for (const s of m.structures) {
      if (s.kind !== 'windowtrap' || s.data?.triggered) continue
      const d = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
      if (d < 1.9) {
        s.data = { ...s.data, triggered: 1 }
        p.sanity = Math.max(0, p.sanity - 14)
        this.emit({ kind: 'sanityhit' })
        this.camShake = Math.min(1, this.camShake + 0.4)
        this.msg('玻璃后面贴着一张脸——它不是你的倒影！你踉跄后退。（理智-14）', 'damage')
        audio.aggro()
        this.noiseEvent(p.x, p.y, 12, true) // 响动引来实体
      }
    }

    // 锈蚀钢筋（L1：突出墙壁的生锈金属尖端——wikidot/Fandom：刺伤可致破伤风；一次性划伤）
    for (const s of m.structures) {
      if (s.kind !== 'rebar' || s.data?.triggered) continue
      if (Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y) < 0.9) {
        s.data = { ...s.data, triggered: 1 }
        this.hurtPlayer(4, '锈蚀钢筋')
      }
    }

    // 蒸汽阀门伤害
    for (const s of m.structures) {
      if (s.kind === 'valve' && s.data?.on) {
        const d = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
        if (d < 1.6 && !p.hasGloves) {
          p.hp -= 8 * dt * dm.dmg
          if (Math.random() < dt * 2) this.steamParticles(s.x + 0.5, s.y + 0.5)
          if (p.hp <= 0) { this.die('被蒸汽烫死了'); return }
        }
        if (Math.random() < dt * 3) this.steamParticles(s.x + 0.5, s.y + 0.5)
      }
    }

    // ---- 层级氛围事件（wiki 设定播报）+ L1 停电恢复 ----
    this.ambientT -= dt
    if (this.ambientT <= 0) {
      this.ambientT = 16 + Math.random() * 18
      this.rollAmbientEvent()
    }
    if (this.blackoutWarnT > 0) {
      // v31：「闪烁」预警期——灯光快速明灭数秒后才真正停电
      this.blackoutWarnT -= dt
      if (this.blackoutWarnT <= 0) this.applyBlackout()
    }
    if (this.blackoutT > 0) {
      this.blackoutT -= dt
      if (this.blackoutT <= 0) this.endBlackout()
    }
    // 开发者现象开关：强制触发/屏蔽「闪烁」
    if (this.dev.phenOn.has('flicker') && this.levelDef.id === 1 && this.blackoutT <= 0 && this.blackoutWarnT <= 0) this.startBlackout(20)
    if (this.dev.phenOff.has('flicker')) {
      if (this.blackoutWarnT > 0) this.blackoutWarnT = 0
      else if (this.blackoutT > 0) this.endBlackout()
    }

    // ---- 视野 ----
    this.computeVisibility()

    this.camShake = Math.max(0, this.camShake - dt * 2.2)
  }

  // ---------- 层级氛围事件（wiki 设定播报）----------
  private rollAmbientEvent() {
    const lvl = this.player.level
    // L1「闪烁」现象（Fandom：停电数分钟到数天，实体倾巢而出）——低频率随机发生
    if (lvl === 1 && this.blackoutT <= 0 && this.blackoutWarnT <= 0 && !this.dev.phenOff.has('flicker') && Math.random() < 0.12) {
      this.startBlackout(14 + Math.random() * 10)
      return
    }
    const pool = LEVEL_EVENTS[lvl]
    if (!pool?.length) return
    this.msg(pool[Math.floor(Math.random() * pool.length)], 'lore')
  }

  private startBlackout(dur: number) {
    const m = this.map
    if (!m || this.blackoutBackup || m.inf?.blackout || this.blackoutWarnT > 0) return
    // v31：「闪烁」——完全停电前先进入预警期：所有主区域灯光快速闪烁数秒
    this.blackoutWarnT = 3.5
    this.blackoutPendingDur = dur
    this.msg('灯光开始剧烈闪烁，电流声忽高忽低——', 'damage')
    audio.spark()
  }

  private applyBlackout() {
    const m = this.map
    if (!m) return
    if (m.inf) {
      // 无限模式：stitch 会重建 m.lights，数组置换会被冲掉——改走 inf.blackout 标志
      // （stitch 据此剔除层级固有灯；维护通廊 keep 灯与玩家追加灯保留）
      m.inf.blackout = true
      m.lights = m.lights.filter((l) => l.keep === 1 || !l.gen)
    } else {
      this.blackoutBackup = m.lights
      m.lights = m.lights.filter(() => Math.random() < 0.15) // 仅剩零星应急灯
    }
    this.blackoutT = this.blackoutPendingDur
    this.msg('灯光一排排熄灭——停电了。黑暗里有什么开始移动。', 'damage')
    audio.spark()
    // L1「闪烁」：笑魇在黑暗中倾巢而出（灯光恢复时消散）
    if (this.player.level === 1) this.spawnBlackoutSmilers()
  }

  // 停电专属：在玩家周围的黑暗瓦片生成 2~3 只笑魇（打标 blackoutSpawn，电力恢复即退散）
  private spawnBlackoutSmilers() {
    const m = this.map!, p = this.player
    const n = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 30; t++) {
        const ang = Math.random() * Math.PI * 2
        const r = 8 + Math.random() * 10
        const tx = Math.floor(p.x + Math.cos(ang) * r), ty = Math.floor(p.y + Math.sin(ang) * r)
        if (this.entityWalkH(m, tx, ty, 0) === null) continue
        const e = makeEntity('smiler', tx + 0.5, ty + 0.5)
        e.blackoutSpawn = true
        m.entities.push(e)
        break
      }
    }
  }

  private endBlackout() {
    if (this.map?.inf) {
      this.map.inf.blackout = false
      restitch(this.map) // 立即按 chunk 重建窗口数组，灯光恢复
    } else if (this.blackoutBackup && this.map) {
      // 停电期间玩家可能用荧光棒追加了光源，保留新增部分
      const added = this.map.lights.filter((l) => !this.blackoutBackup!.includes(l))
      this.map.lights = [...this.blackoutBackup, ...added]
    }
    this.blackoutBackup = null
    this.blackoutT = 0
    // 停电生成的笑魇随灯光恢复退散（其他层级的常驻笑魇无标记，不受影响）
    if (this.map) {
      const fleeing = this.map.entities.filter((e) => e.blackoutSpawn && !e.dead)
      if (fleeing.length > 0) {
        for (const e of fleeing) { e.dead = true; e.deathT = 0.6 }
        this.msg('灯光亮起，笑魇退回了黑暗。', 'system')
      }
    }
    this.msg('电流声重新响起，灯光逐一恢复。', 'system')
  }

  private isLit(x: number, y: number): boolean {
    const m = this.map!
    for (const l of m.lights) if (Math.hypot(l.x - x, l.y - y) < l.r * 0.7) return true
    return false
  }

  private noiseEvent(x: number, y: number, radius: number, sprint: boolean) {
    this.playerNoiseT = 0.8 // 玩家噪音残余计时（猎犬威慑「持续发声」判定；脚步/挥击/搜索等都会刷新）
    for (const e of this.map!.entities) {
      if (e.dead || e.def.stationary) continue
      if (e.def.passive) continue // 被动实体（无面灵）不循声索敌——只有被攻击才反击
      const d = Math.hypot(e.x - x, e.y - y)
      const hearR = sprint && e.def.hearsSprint ? e.def.hearing * 1.6 : e.def.hearing
      // 失明实体（肢团）只按「响度半径」听觉——蹲行/慢走的小声响不会被顺风耳放大
      const effR = e.def.blind ? radius : Math.max(radius, hearR)
      if (d >= effR) continue
      if (e.state === 'chase' || e.state === 'attack') continue
      // 肢团（失明）：听见声音即高速径直冲撞声源
      if (e.def.blind) {
        e.state = 'chase'; e.targetX = x; e.targetY = y; e.stateT = 8
        continue
      }
      e.state = 'investigate'; e.targetX = x; e.targetY = y; e.stateT = 6
    }
  }

  // 玩家是否正「直视」实体（视角锥 ±0.4 rad 内且有视线）——猎犬威慑判定
  private lookingAt(e: Entity): boolean {
    const p = this.player
    const ang = Math.atan2(e.y - p.y, e.x - p.x)
    const fwd = Math.atan2(-Math.sin(look.yaw), -Math.cos(look.yaw)) // 与 renderer3d 视线前向一致
    let diff = Math.abs(ang - fwd)
    if (diff > Math.PI) diff = Math.PI * 2 - diff
    return diff < 0.4 && this.los(p.x, p.y, e.x, e.y)
  }

  private los(x0: number, y0: number, x1: number, y1: number): boolean {
    const m = this.map!
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (tileAt(m, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t)) !== 1) return false
    }
    return true
  }

  private updateEntities(dt: number, dmgMult: number) {
    const m = this.map!, p = this.player
    const lightOn = p.flashlight && p.battery > 0 && p.flashJamT <= 0
    // v51：L3 圣所邻域 chunk 集（圣所 chunk + 八邻——wikidot：实体甚至不会进入包含圣所入口的走廊）
    let sanctChunks: Set<string> | null = null
    if (this.levelDef.id === 3 && m.inf) {
      sanctChunks = new Set()
      for (const c of m.inf.chunks.values())
        if (c.variant === 'sanct')
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) sanctChunks.add(chunkKey(c.cx + dx, c.cy + dy))
    }
    // 开发者模式：冻结实体 AI（仅保留死亡动画消散，便于截图/观察）
    if (this.dev.frozenAI) {
      for (const e of m.entities) if (e.dead) e.deathT -= dt
      m.entities = m.entities.filter((e) => !e.dead || e.deathT > 0)
      return
    }
    for (const e of m.entities) {
      // 死亡动画计时（倒地/消散后移除）
      if (e.dead) { e.deathT -= dt; continue }
      e.stateT -= dt; e.attackCd -= dt
      // 开发者模式：隐形——所有距离判定视为无穷远，实体永不索敌/攻击/特殊触发
      const d = this.dev.invisible ? 1e9 : Math.hypot(e.x - p.x, e.y - p.y)
      const def = e.def
      // v51：Nguithr'xurh（Entity 16）——天花板网囊陷阱专属状态机
      if (def.type === 'nguithr') { this.updateNguithr(e, d, dt); continue }
      // 猎犬威慑：玩家「实时直视 + 持续制造噪音」才定身——逐帧刷新 stunT，
      // 停止发声或移开视线即不再刷新，猎犬在 0.25s 内恢复行动（对已在追击的猎犬同样有效）
      if (def.intimidatable) {
        const held = d < 10 && this.playerNoiseT > 0 && this.lookingAt(e)
        if (held) {
          e.stunT = Math.max(e.stunT, 0.25)
          if (!e.intimidated) {
            e.intimidated = true
            this.msg('你直视着猎犬的眼睛发出巨响——它被震慑住了！', 'system')
            audio.aggro()
          }
        } else if (e.intimidated) {
          e.intimidated = undefined
          this.msg('猎犬摆脱了震慑，重新扑来！', 'damage')
        }
      }
      if (e.stunT > 0) { e.stunT -= dt; continue }

      // v51：L3 圣所威慑——实体畏惧天使雕像：不进入圣所 chunk 及其八邻（含入口走廊）。
      // 踏上圣所邻域/tint 20 瓦片的实体立刻以 ×1.4 速度逃向最近的非圣所可走瓦片，
      // 该 tick 跳过索敌/攻击/特殊行为（wanderTarget 同样拒绝这些瓦片）
      {
        const etx = Math.floor(e.x), ety = Math.floor(e.y)
        let holy = false
        if (etx >= 0 && ety >= 0 && etx < m.w && ety < m.h) {
          if (m.tint[ety * m.w + etx] === 20) holy = true
          else if (sanctChunks && m.inf)
            holy = sanctChunks.has(chunkKey(Math.floor((m.inf.ox + e.x) / CS), Math.floor((m.inf.oy + e.y) / CS)))
        }
        if (holy) {
          let fx = -1, fy = -1
          outer: for (let rad = 1; rad <= 16; rad++)
            for (let dy = -rad; dy <= rad; dy++)
              for (let dx = -rad; dx <= rad; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
                const nx = etx + dx, ny = ety + dy
                if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
                const ni = ny * m.w + nx
                if (m.tint[ni] === 20 || tileAt(m, nx, ny) !== 1) continue
                if (sanctChunks && m.inf && sanctChunks.has(chunkKey(Math.floor((m.inf.ox + nx) / CS), Math.floor((m.inf.oy + ny) / CS)))) continue
                fx = nx; fy = ny; break outer
              }
          if (fx >= 0) {
            e.state = 'wander'; e.targetX = fx + 0.5; e.targetY = fy + 0.5; e.stateT = 4
            this.stepEntity(e, def.speed * 1.4, dt)
          }
          continue
        }
      }

      // 遭遇记录（图鉴渐进解锁）：进入视野范围且有视线
      if (d < def.sight && !this.seenThisLevel.has(def.type) && this.los(p.x, p.y, e.x, e.y)) {
        this.seenThisLevel.add(def.type)
        recordEncounter(def.type)
      }

      // 窃皮者伪装：近身才现身
      if (e.disguised) {
        if (d < 2.2) {
          e.disguised = undefined
          this.msg('那不是物品——是窃皮者！', 'damage')
          audio.aggro()
          e.state = 'chase'
        } else continue
      }
      // 手臂：蛰伏于天花板通风管（hidden=缩回管内）；层级灯光熄灭时伸出猎捕
      if (def.type === 'arms') {
        const darkOut = (m.inf?.blackout ?? false) || this.blackoutT > 0
        if (e.hidden) {
          if (darkOut && d < 5) {
            e.hidden = undefined
            this.msg('头顶的通风管里伸出了一只手臂！', 'damage')
            audio.aggro()
          } else continue
        }
        if (!darkOut || d > 7) { e.hidden = true; continue } // 灯光恢复或玩家远离：缩回管内
        if (d < 2.2 && e.attackCd <= 0) {
          e.attackCd = 1.6
          this.hurtPlayer(def.damage * dmgMult, def.name)
          p.slowT = Math.max(p.slowT, 1.5)
          this.msg('通风管的手臂抓住了你！', 'damage')
        }
        e.animT += dt
        continue
      }
      // 管道蠕虫埋伏：近身破土
      if (e.hidden) {
        if (d < 3.2) {
          e.hidden = undefined
          this.msg('管道炸开——蠕虫破土而出！', 'damage')
          audio.aggro()
          this.camShake = Math.min(1, this.camShake + 0.5)
          e.state = 'chase'
        } else continue
      }

      if (def.stationary) {
        // 久坐者：看见玩家就尖叫
        if (def.type === 'seated' && !e.screamed && d < def.sight && this.los(e.x, e.y, p.x, p.y)) {
          e.screamed = true
          this.msg('久坐者发出了刺耳的尖叫！', 'damage')
          audio.aggro()
          this.noiseEvent(p.x, p.y, 20, true)
          p.sanity = Math.max(0, p.sanity - 10)
          this.emit({ kind: 'sanityhit' })
        }
        if (def.damage > 0 && d < 1.2 && e.attackCd <= 0 && this.meleeZOk(e)) { e.attackCd = 1.2; this.hurtPlayer(def.damage * dmgMult, def.name) }
        continue
      }

      // —— 特殊行为 ——
      // 笑魇：只在黑暗中逼近；手电照亮时后退
      if (def.darkAmbusher && lightOn && d < 7 && this.los(e.x, e.y, p.x, p.y)) {
        if (e.state === 'chase' || e.state === 'investigate') { e.state = 'wander'; this.wanderTarget(e) }
        // 缓慢远离玩家
        if (d < 5 && e.state === 'wander') {
          e.targetX = e.x + (e.x - p.x); e.targetY = e.y + (e.y - p.y); e.stateT = 1
        }
      }
      // 电弧体：靠近瘫痪手电
      if (def.jamsLight && d < 3 && p.flashlight && p.flashJamT <= 0) {
        p.flashJamT = 2.5
        p.flashlight = false
        p.battery = Math.max(0, p.battery - 6)
        this.msg('电磁脉冲——手电瘫痪了！', 'damage')
        audio.spark()
      }
      // 笑魇听觉通道：手电熄灭但玩家在听觉半径内持续制造噪音（noiseEvent 刷新的残余计时），同样会被察觉
      const hearP = !!def.lightHunter && this.playerNoiseT > 0 && d < def.hearing && this.los(e.x, e.y, p.x, p.y)
      // 笑魇：趋光猎手——玩家手电熄灭时不再靠近，并缓慢退开（听见噪音除外：循声追击）
      if (def.lightHunter && !lightOn && !hearP && d < 6) {
        if (e.state === 'chase' || e.state === 'investigate') { e.state = 'wander'; this.wanderTarget(e) }
        if (e.state === 'wander') {
          e.targetX = e.x + (e.x - p.x); e.targetY = e.y + (e.y - p.y); e.stateT = 1
        }
      }
      // 死亡飞蛾：扑灯耗电
      if (def.drainsLight && d < 1.4 && p.flashlight) {
        p.battery = Math.max(0, p.battery - 4 * dt)
        if (Math.random() < dt * 1.5) audio.searchTick()
      }
      // 复印机幽灵：周期性生成幻影
      if (def.spawnsFakes && d < 8) {
        e.fakeT = (e.fakeT ?? 0) - dt
        if (e.fakeT <= 0 && this.fakes.length < 6) {
          e.fakeT = 5
          const ang = Math.random() * Math.PI * 2
          this.fakes.push({ x: p.x + Math.cos(ang) * 3.5, y: p.y + Math.sin(ang) * 3.5, t: 4 })
        }
      }

      // 视野追击（趋光猎手仅在玩家手电亮时能看见目标；关灯后可靠听觉察觉噪音）
      const darkBonus = def.darkAmbusher && !lightOn ? 4 : 0
      const canSee = hearP || (d < def.sight + darkBonus && (!def.lightHunter || lightOn) && this.los(e.x, e.y, p.x, p.y))
      const feigning = def.feignNeutral && d > 2.4 && e.state !== 'chase' && e.state !== 'attack' // 侍者装中立
      // v23「Level 11 Effect」：本层敌对实体更不倾向于攻击——但主动挑衅（攻击过任何实体）会解除
      const pacified = !this.provoked && (this.levelDef.pacify ?? 0) > 0 && Math.random() < (this.levelDef.pacify ?? 0)
      if (canSee && !def.passive && !feigning && !pacified && e.state !== 'chase' && e.state !== 'attack') {
        e.state = 'chase'
        if (def.aggroStinger) audio.aggro()
      }
      // 侍者近身暴起
      if (def.feignNeutral && d <= 2.4 && e.state !== 'chase' && e.state !== 'attack' && this.los(e.x, e.y, p.x, p.y)) {
        e.state = 'chase'
        this.msg('侍者不笑了。', 'damage')
        audio.aggro()
      }
      // 被动实体（无面灵）：脱战 8 秒后平息（不再反击）；无视线/听觉/贴身索敌——只有被打才反击。
      // v42：grudge（尸鼠=合并死亡鼠）记仇不放——激怒后持续仇恨，永不平息
      if (def.passive && !def.grudge && e.state === 'chase' && e.stateT < -8) { e.state = 'wander'; e.provoked = false; e.targetEnt = undefined }
      // 趋光实体（死亡飞蛾）：被手电光吸引
      if (def.lightLure && lightOn && d < 11 && (e.state === 'wander' || e.state === 'idle')) {
        e.state = 'investigate'; e.targetX = p.x; e.targetY = p.y; e.stateT = 4
      }
      // v44：尸鼠群体激怒（加入围殴）——注意到 4m 内有同伴处于激怒状态时一同激怒，攻击同一目标
      if (def.type === 'corpserat' && !e.provoked) {
        for (const q of m.entities) {
          if (q === e || q.dead || q.def.type !== 'corpserat' || !q.provoked) continue
          if (Math.hypot(q.x - e.x, q.y - e.y) < 4) { e.provoked = true; e.state = 'chase'; e.stateT = 0; break }
        }
      }
      // v41：尸鼠（hunts）——实体对实体仇恨：主动猎杀附近的死亡飞蛾；
      // 被玩家激怒（provoked）时优先反击玩家（走下方正常状态机）
      if (def.hunts && !e.provoked && e.state !== 'attack') {
        let prey: Entity | null = null, pd = 1e9
        for (const q of m.entities) {
          if (q === e || q.dead || q.hidden || q.disguised) continue
          if (!def.hunts.includes(q.def.type)) continue
          const qd = Math.hypot(q.x - e.x, q.y - e.y)
          if (qd < 9 && qd < pd && this.los(e.x, e.y, q.x, q.y)) { prey = q; pd = qd }
        }
        if (prey) {
          if (pd < 1.0 && e.attackCd <= 0) {
            e.attackCd = 1.1
            prey.hp -= def.damage
            prey.stunT = Math.max(prey.stunT, 0.3)
            this.bloodParticles(prey.x, prey.y)
            if (prey.hp <= 0 && !prey.dead) {
              prey.dead = true; prey.deathT = 1.4
              if (d < 9) this.msg(`尸鼠扑翻了那只${prey.def.name}，几下撕碎拖进了墙缝。`, 'system')
            } else if (!prey.def.noRetaliate) {
              // 实体对实体仇恨：被尸鼠攻击的飞蛾反击该尸鼠（仇恨目标转为伤害者本人）
              prey.provoked = true; prey.targetEnt = e; prey.state = 'chase'; prey.stateT = 0
            }
          } else {
            e.state = 'investigate'; e.targetX = prey.x; e.targetY = prey.y; e.stateT = 2
          }
        }
      }

      switch (e.state) {
        case 'idle':
          if (e.stateT <= 0) { e.state = 'wander'; this.wanderTarget(e) }
          break
        case 'wander': {
          if (this.stepEntity(e, def.speed * 0.45, dt)) {
            // 撞墙卡住（未到达目标）：被动实体在当前目标方向上偏转 ±60°~120° 另选目标，
            // 不再顶着同一面墙蹭（Ferren 保留专属小半径逻辑；其余实体维持随机重选）
            if (def.passive && def.type !== 'ferren' && Math.hypot(e.targetX - e.x, e.targetY - e.y) > 0.35) this.wanderDeflect(e)
            else this.wanderTarget(e)
          }
          e.animT += dt * def.speed * 0.45
          break
        }
        case 'investigate': {
          if (def.grudge && e.provoked) {
            // v42：记仇（尸鼠=合并死亡鼠）——调查中持续追踪玩家本人，超时转回追击而非放弃
            e.targetX = p.x; e.targetY = p.y
            this.stepEntity(e, def.speed * 0.7, dt)
            if (e.stateT <= 0 || d < def.sight) e.state = 'chase'
          } else if (this.stepEntity(e, def.speed * 0.7, dt) || e.stateT <= 0) { e.state = 'wander'; this.wanderTarget(e) }
          // v41：hunts 实体（尸鼠）调查中面向猎物目标；其余实体面向玩家方向
          this.faceToward(e, def.hunts ? e.targetX : p.x, def.hunts ? e.targetY : p.y, dt, 5)
          e.animT += dt * def.speed * 0.7
          break
        }
        case 'chase': {
          if (def.passive && (def.noRetaliate || !e.provoked) ) { e.state = 'wander'; break } // 被动实体未被激怒：撤销追击（被攻击后由 provoked 放行；Ferren 绝不反击）
          if (e.targetEnt?.dead) { // 反击目标已死亡：仇恨解除（被动实体回到漫游，不迁怒玩家）
            e.targetEnt = undefined
            if (def.passive) { e.provoked = false; e.state = 'wander'; this.wanderTarget(e); break }
          }
          if (def.mirrorMove) {
            // 镜中人：以玩家为镜面做镜像移动（保持距离对称）
            const mx = e.x + (e.x - p.x), my = e.y + (e.y - p.y)
            const dd = Math.hypot(mx - e.x, my - e.y) || 1
            this.stepEntity(e, def.speed * (d > 1.6 ? 1 : 0.2), dt)
            if (d > 1.6) { e.targetX = mx; e.targetY = my }
            void dd
          } else if (def.charger) {
            // 运输车：直线冲撞，无法急转
            this.faceToward(e, p.x, p.y, dt, 1.6)
            e.targetX = e.x + Math.cos(e.facing) * 5
            e.targetY = e.y + Math.sin(e.facing) * 5
            this.stepEntity(e, def.speed * 1.7, dt)
            if (d < 1.1 && e.attackCd <= 0 && this.meleeZOk(e)) {
              e.attackCd = 1.6
              this.hurtPlayer(def.damage * dmgMult, def.name)
              this.camShake = Math.min(1, this.camShake + 0.5)
            }
            e.animT += dt * def.speed
            break
          } else if (def.blind) {
            // 肢团（失明）：径直冲向最后听见的声音点；冲达后无处可依则回游荡
            const arrived = this.stepEntity(e, def.speed, dt)
            this.faceToward(e, e.targetX, e.targetY, dt, 9)
            if (arrived) { e.state = 'wander'; this.wanderTarget(e) }
          } else if (e.targetEnt) {
            // 实体对实体反击（死亡飞蛾反击尸鼠）：追击伤害者本人
            const tgt = e.targetEnt
            e.targetX = tgt.x; e.targetY = tgt.y
            this.stepEntity(e, def.speed, dt)
            this.faceToward(e, tgt.x, tgt.y, dt, 9)
            const td = Math.hypot(tgt.x - e.x, tgt.y - e.y)
            if (td < 1.0 && e.attackCd <= 0) {
              e.attackCd = 1.2
              tgt.hp -= def.damage
              tgt.stunT = Math.max(tgt.stunT, 0.3)
              this.bloodParticles(tgt.x, tgt.y)
              if (tgt.hp <= 0 && !tgt.dead) { tgt.dead = true; tgt.deathT = 1.4 }
            }
          } else {
            e.targetX = p.x; e.targetY = p.y
            this.stepEntity(e, def.speed, dt)
            this.faceToward(e, p.x, p.y, dt, 9) // 追击时平滑转向面向玩家
          }
          e.animT += dt * def.speed
          if (!e.targetEnt && d < 0.85 && e.attackCd <= 0) {
            e.state = 'attack'; e.lungeT = 0.32; e.attackCd = 1.4
          } else if (!e.targetEnt && !canSee && d > def.sight * 1.4 && !def.mirrorMove && !def.blind && !(def.grudge && e.provoked)) {
            e.state = 'investigate'; e.stateT = 5
          }
          break
        }
        case 'attack': {
          this.faceToward(e, p.x, p.y, dt, 14) // 攻击前摇快速对准玩家
          e.lungeT -= dt
          if (e.lungeT <= 0) {
            // 必须基本正对玩家才出手，否则延长前摇继续转向
            const want = Math.atan2(p.y - e.y, p.x - e.x)
            let diff = Math.abs(want - e.facing)
            if (diff > Math.PI) diff = Math.PI * 2 - diff
            if (diff > 0.7) { e.lungeT = 0.1; break }
            if (d < (def.grabs ? 1.8 : 1.2) && this.meleeZOk(e)) {
              this.hurtPlayer(def.damage * dmgMult, def.name)
              if (def.grabs) {
                p.slowT = 2.5; p.stamina = 0
                this.msg('团块的肢体缠住了你！', 'damage')
              }
            }
            e.state = 'chase'
          }
          break
        }
      }

      // 穿墙实体（钝人）：行动时发出刺耳的沙沙声，隔着墙也能听见
      if (def.phases && (e.state === 'wander' || e.state === 'investigate' || e.state === 'chase') && d < 14) {
        e.scrapeT = (e.scrapeT ?? Math.random() * 0.7) - dt
        if (e.scrapeT <= 0) {
          e.scrapeT = 0.7
          const inWall = tileAt(m, Math.floor(e.x), Math.floor(e.y)) !== 1
          audio.scrape(Math.min(1, (1 - d / 14) * (inWall ? 1.3 : 1)))
        }
      }

      // ---- v26：实体-玩家最小间距（碰撞推挤分离，攻击判定用距离+面向而非重叠）----
      if (!this.dev.invisible && Math.abs(e.z - p.z) < 1.2) {
        const MIN_SEP = def.stationary ? 0.5 : 0.56
        let sx = e.x - p.x, sy = e.y - p.y
        let sd = Math.hypot(sx, sy)
        if (sd < 1e-4) { const a = Math.random() * Math.PI * 2; sx = Math.cos(a); sy = Math.sin(a); sd = 1 }
        if (sd < MIN_SEP) {
          const ux = sx / sd, uy = sy / sd, push = MIN_SEP - sd
          if (!def.stationary) {
            // 实体侧退 60%（目标瓦片可站才移动，防止被推进墙里）
            const ex = e.x + ux * push * 0.6, ey = e.y + uy * push * 0.6
            if (this.entityWalkH(m, Math.floor(ex), Math.floor(ey), bandOfZ(e.z)) !== null) { e.x = ex; e.y = ey }
          }
          // 玩家侧退剩余部分（碰撞校验，贴墙时不强推）
          const k = def.stationary ? 1 : 0.4
          const px2 = p.x - ux * push * k, py2 = p.y - uy * push * k
          if (canOccupy(m, px2, py2, PLAYER_RADIUS, { z: p.z, crouch: p.crouching, band: bandOfZ(p.z) })) { p.x = px2; p.y = py2 }
        }
      }
    }
    m.entities = m.entities.filter((e) => !e.dead || e.deathT > 0)
  }

  private wanderTarget(e: Entity) {
    const m = this.map!
    const band = bandOfZ(e.z)
    // Ferren（雪貂笼宠物）：小半径就近游荡 + 直线路径可走校验——不再隔着笼墙选点往墙上蹭；
    // 偶尔趴下歇一会儿（宠物漫游节奏）
    if (e.def.type === 'ferren') {
      if (Math.random() < 0.3) { e.state = 'idle'; e.stateT = 1.2 + Math.random() * 2.2; e.targetX = e.x; e.targetY = e.y; return }
      for (let t = 0; t < 12; t++) {
        const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 1.8
        const tx = e.x + Math.cos(a) * r, ty = e.y + Math.sin(a) * r
        let clear = true
        for (let k = 1; k <= 4 && clear; k++) {
          const sx = e.x + (tx - e.x) * (k / 4), sy = e.y + (ty - e.y) * (k / 4)
          if (!canOccupy(m, sx, sy, 0.2, { z: e.z, band })) clear = false
        }
        if (clear) { e.targetX = tx; e.targetY = ty; e.stateT = 3; return }
      }
      e.state = 'idle'; e.stateT = 1.5; e.targetX = e.x; e.targetY = e.y
      return
    }
    for (let t = 0; t < 20; t++) {
      const a = Math.random() * Math.PI * 2
      const tx = e.x + Math.cos(a) * 5, ty = e.y + Math.sin(a) * 5
      const ti = Math.floor(ty) * m.w + Math.floor(tx)
      if (Math.floor(tx) < 0 || Math.floor(ty) < 0 || Math.floor(tx) >= m.w || Math.floor(ty) >= m.h) continue
      // v13：按所在楼层高度带选游荡目标（上层实体不下楼闲逛；楼梯口允许上下）
      if (m.stair[ti] & 7) { e.targetX = tx; e.targetY = ty; e.stateT = 4; return }
      if (m.tint[ti] === 20) continue // v51：实体不主动进入圣所（tint 20）
      // v51：圣所邻域 chunk 同样不选为游荡目标（实体不进入包含圣所入口的走廊）
      if (this.levelDef.id === 3 && m.inf) {
        const wcx = Math.floor((m.inf.ox + tx) / CS), wcy = Math.floor((m.inf.oy + ty) / CS)
        let holy = false
        for (const c of m.inf.chunks.values())
          if (c.variant === 'sanct' && Math.abs(c.cx - wcx) <= 1 && Math.abs(c.cy - wcy) <= 1) { holy = true; break }
        if (holy) continue
      }
      if (band === 1 ? (m.up[ti] === 1 && m.upWall[ti] !== 1) : tileAt(m, Math.floor(tx), Math.floor(ty)) === 1) {
        if (band === 0 && m.liquid[ti] === 1) continue // 实体不主动下水
        e.targetX = tx; e.targetY = ty; e.stateT = 4; return
      }
    }
    e.targetX = e.x; e.targetY = e.y; e.stateT = 2
  }

  // 被动漫游撞墙转向：在当前目标方向基础上偏转 ±60°~120° 另选可走目标（两侧交替试），
  // 找不到才回退到随机重选——解决顶着同一面墙反复蹭的问题
  private wanderDeflect(e: Entity) {
    const m = this.map!
    const band = bandOfZ(e.z)
    const base = Math.atan2(e.targetY - e.y, e.targetX - e.x)
    const s0 = Math.random() < 0.5 ? 1 : -1
    for (let t = 0; t < 6; t++) {
      const s = t % 2 === 0 ? s0 : -s0
      const a = base + s * (60 + Math.random() * 60) * Math.PI / 180
      const tx = e.x + Math.cos(a) * 4, ty = e.y + Math.sin(a) * 4
      const fx = Math.floor(tx), fy = Math.floor(ty)
      if (fx < 0 || fy < 0 || fx >= m.w || fy >= m.h) continue
      if (this.entityWalkH(m, fx, fy, band) === null) continue
      if (band === 0 && m.liquid[fy * m.w + fx] === 1) continue // 实体不主动下水（与 wanderTarget 一致）
      e.targetX = tx; e.targetY = ty; e.stateT = 4; return
    }
    this.wanderTarget(e)
  }

  // v44：尸鼠群体激怒——一只被激怒时，周围 ~6m 的同伴一同被激怒（攻击同一目标：玩家）
  private provokeRatPack(e: Entity) {
    for (const q of this.map!.entities) {
      if (q === e || q.dead || q.def.type !== 'corpserat' || q.provoked) continue
      if (Math.hypot(q.x - e.x, q.y - e.y) < 6) { q.provoked = true; q.state = 'chase'; q.stateT = 0 }
    }
  }

  /** Nguithr'xurh（Entity 16）：网囊（hidden）→ 玩家经过正下方爆开（麻痹）→ 未离开即降下攻击 → 逃脱则回巢结囊 */
  private updateNguithr(e: Entity, d: number, dt: number) {
    const p = this.player, m = this.map!
    const ceilZ = (WALL_H[this.levelDef.gen] ?? 3) - 0.55
    // 陷阱点初始化（生成位置即结囊处）
    if (e.webX === undefined) { e.webX = e.x; e.webY = e.y; e.hidden = true }
    if (e.hidden) {
      // 网囊形态：挂顶不动，缓缓升到天花板
      e.z += (ceilZ - e.z) * Math.min(1, dt * 3)
      if (d < 1.3 && this.webbedT <= 0 && !this.dev.invisible) {
        // 爆开：镇静剂洒落——视野模糊 + 移动迟缓 4 秒
        this.webbedT = 4
        e.hidden = false
        e.state = 'idle'; e.stateT = 4 // 等待麻痹期（与 webbedT 同步）
        this.camShake = Math.min(1, this.camShake + 0.4)
        audio.aggro()
        this.msg('头顶的球状网囊突然爆开——镇静剂洒了你一身。（视线模糊 · 移动迟缓）', 'damage')
      }
      return
    }
    if (e.state === 'idle') {
      // 麻痹等待期：玩家仍停留在那一格 → 垂降进食；已离开 → 回巢重新结囊
      e.z += (ceilZ - e.z) * Math.min(1, dt * 3)
      if (e.stateT <= 0) {
        const sameTile = Math.floor(p.x) === Math.floor(e.webX!) && Math.floor(p.y) === Math.floor(e.webY!)
        if (sameTile) {
          e.state = 'chase'; e.stateT = 0
          audio.aggro()
          this.msg('有什么东西顺着丝从天花板降了下来——', 'damage')
        } else {
          e.hidden = true; e.stateT = 0 // 猎物已离开：重新结囊
        }
      }
      return
    }
    // 地面态：慢速逼近玩家；玩家逃出 8m（且未杀死它）→ 回到陷阱点重新结囊
    if (d > 8) {
      const tx = e.webX, ty = e.webY!
      const dd = Math.hypot(tx - e.x, ty - e.y)
      if (dd < 0.4) { e.hidden = true; e.stateT = 0; return }
      this.faceToward(e, tx, ty, dt, 6)
      e.targetX = tx; e.targetY = ty
      this.stepEntity(e, e.def.speed, dt)
      e.animT += dt
      return
    }
    // 落地（z 降到地面）
    const gz = groundHeightAt(m, e.x, e.y)
    e.z += (gz - e.z) * Math.min(1, dt * 6)
    // 攻击前摇：原地停步、抬起前身（节肢式蓄力），随后下扑
    if (e.lungeT > 0) {
      e.lungeT -= dt
      if (e.lungeT <= 0 && d < 1.3 && this.meleeZOk(e)) {
        e.attackCd = 1.4
        this.hurtPlayer(e.def.damage, e.def.name)
        // 每次遭到 Nguithr'xurh 攻击 → 麻痹 1 秒（模糊+迟缓）
        this.webbedT = Math.max(this.webbedT, 1)
        this.msg('镇静剂的余效让你浑身发麻。（麻痹 1 秒）', 'damage')
      }
      return
    }
    this.faceToward(e, p.x, p.y, dt, 5)
    e.targetX = p.x; e.targetY = p.y
    this.stepEntity(e, e.def.speed, dt)
    e.animT += dt
    if (d < 1.3 && e.attackCd <= 0 && this.meleeZOk(e)) e.lungeT = 0.45 // 进入前摇
  }

  // 平滑转向（最短弧 lerp yaw）面向目标点
  private faceToward(e: Entity, tx: number, ty: number, dt: number, rate: number) {    const want = Math.atan2(ty - e.y, tx - e.x)
    let diff = want - e.facing
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    const t = Math.min(1, rate * dt)
    e.facing += diff * t
  }

  // ---- v13：梯子攀爬 ----
  // 贴近攀爬梯（base 在主层 / top 在上层），按住前进且面朝梯子即开始竖直攀爬，脚本化送达
  private updateClimb(dt: number, mag: number) {
    const p = this.player, m = this.map!
    if (this.climb) {
      const c = this.climb
      p.z += c.dir * 1.9 * dt
      p.vz = 0
      if (c.dir === 1 && p.z >= FLOOR_H) {
        p.x = c.topX + 0.5; p.y = c.topY + 0.5; p.z = FLOOR_H
        this.climb = null
        this.climbCd = 0.9
        audio.footstep('metal')
        this.msg('你爬上梯子，翻上了高处。', 'system')
      } else if (c.dir === -1 && p.z <= 0) {
        p.x = c.baseX + 0.5; p.y = c.baseY + 0.5; p.z = 0
        this.climb = null
        this.climbCd = 0.9
        audio.footstep('metal')
      }
      return
    }
    if (this.climbCd > 0) { this.climbCd -= dt; return }
    if (mag < 0.1) return
    const fx = Math.cos(p.facing), fy = Math.sin(p.facing)
    for (const s of m.structures) {
      if (s.kind !== 'ladder' || !s.data?.climb) continue
      const tx = s.data.tx as number, ty = s.data.ty as number
      const band = bandOfZ(p.z)
      if (band === 0) {
        const cx = s.x + 0.5, cy = s.y + 0.5
        const dx = cx - p.x, dy = cy - p.y
        const d = Math.hypot(dx, dy)
        // 接近环（0.2..1.0m）且面朝梯子中心；送达梯底（d<0.2）不会原地再触发
        if (d > 0.2 && d < 1.0 && (dx / d) * fx + (dy / d) * fy > 0.3) {
          this.climb = { baseX: Math.floor(s.x), baseY: Math.floor(s.y), topX: tx, topY: ty, dir: 1 }
          audio.footstep('metal')
          return
        }
      } else {
        // 上层：站在顶格附近且面朝梯口方向（顶格→底格），按住前进即攀下；
        // 刚爬上来时面朝夹层内侧（背向梯口）不会误触发
        const cx = tx + 0.5, cy = ty + 0.5
        const dx = cx - p.x, dy = cy - p.y
        const d = Math.hypot(dx, dy)
        const bx = s.x + 0.5 - cx, by = s.y + 0.5 - cy
        const bd = Math.hypot(bx, by) || 1
        if (d < 1.0 && (bx / bd) * fx + (by / bd) * fy > 0.5) {
          this.climb = { baseX: Math.floor(s.x), baseY: Math.floor(s.y), topX: tx, topY: ty, dir: -1 }
          audio.footstep('metal')
          return
        }
      }
    }
  }

  // ---- v13：液体粒子 ----
  splashParticles(x: number, y: number, z: number) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 2.2
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.45 + Math.random() * 0.3, color: '#bfe6ff', size: 0.05 + Math.random() * 0.06, z: z + 0.15, vz: 1.2 + Math.random() * 1.8 })
    }
  }
  bubbleParticles(x: number, y: number, z: number) {
    for (let i = 0; i < 4; i++) {
      this.particles.push({ x: x + (Math.random() - 0.5) * 0.5, y: y + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, t: 0, life: 0.8 + Math.random() * 0.5, color: '#9fd4f0', size: 0.03 + Math.random() * 0.03, z, vz: 0.8 + Math.random() * 0.6 })
    }
  }
  rippleParticles(x: number, y: number) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.3
      this.particles.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * 0.7, vy: Math.sin(a) * 0.7, t: 0, life: 0.5, color: '#7fb8d8', size: 0.04 + Math.random() * 0.03, z: this.inLiquid === 1 ? 0.06 : -0.16, vz: 0 })
    }
  }

  // 实体行走高度（v13 楼层带感知；楼梯坡道取中位连续高度；深水不可进入）
  private entityWalkH(m: GameMap, tx: number, ty: number, band: 0 | 1): number | null {
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return null
    const i = ty * m.w + tx
    if (m.stair[i] & 7) { // 楼梯：两层带都可走（连续坡道上下）
      if (band === 1 && m.up[i] !== 1) return null
      if (solidStructAtFloor(m, tx, ty, band)) return null
      return tileH(m, tx, ty)
    }
    if (band === 1) {
      if (m.up[i] !== 1 || m.upWall[i] === 1) return null
      if (solidStructAtFloor(m, tx, ty, 1)) return null
      return FLOOR_H
    }
    if (tileAt(m, tx, ty) !== 1) return null
    if (m.crawl[i] === 1) return null
    if (m.liquid[i] === 1) return null // 实体不进入深水（不溺亡简化：直接不走）
    if (m.elev[i] === 4) return 0 // 深坑洞口：实体不会避险，走入即坠落（stepEntity 中处死）
    return tileH(m, tx, ty)
  }

  private stepEntity(e: Entity, speed: number, dt: number): boolean {
    const dx = e.targetX - e.x, dy = e.targetY - e.y
    const d = Math.hypot(dx, dy)
    if (d < 0.3) return true
    const m = this.map!
    let nx = e.x + (dx / d) * speed * dt
    let ny = e.y + (dy / d) * speed * dt
    // v7：实体不追入高差 >0.4m 的区域；v13：楼层带感知 + 可走楼梯跨层（坡道高差 ≤0.75）
    const band = bandOfZ(e.z)
    // 穿墙实体（钝人/缠斗者）：无视墙体与实心结构，径直穿行——仅钳制在地图边界内
    if (e.def.phases) {
      nx = Math.max(0.2, Math.min(m.w - 0.2, nx))
      ny = Math.max(0.2, Math.min(m.h - 0.2, ny))
      e.facing = Math.atan2(dy, dx)
      e.x = nx; e.y = ny
      if (tileAt(m, Math.floor(nx), Math.floor(ny)) === 1) e.z = groundHeightAt(m, nx, ny, band)
      return false
    }
    const curStair = m.stair[Math.floor(e.y) * m.w + Math.floor(e.x)] & 7
    const h0 = curStair ? tileH(m, Math.floor(e.x), Math.floor(e.y)) : (band === 1 ? FLOOR_H : tileH(m, Math.floor(e.x), Math.floor(e.y)))
    const canGo = (px: number, py: number): boolean => {
      const tx = Math.floor(px), ty = Math.floor(py)
      const nh = this.entityWalkH(m, tx, ty, band)
      if (nh === null) return false
      const onStair = (m.stair[ty * m.w + tx] & 7) !== 0 || curStair !== 0
      return Math.abs(nh - h0) <= (onStair ? 0.75 : 0.4)
    }
    if (!canGo(nx, e.y)) nx = e.x
    if (!canGo(nx, ny)) ny = e.y
    if (nx === e.x && ny === e.y) return true // 卡住
    e.facing = Math.atan2(dy, dx)
    const ox = e.x, oy = e.y
    e.x = nx; e.y = ny
    // v26：实体半径防穿模——把半径 0.24m 的「圆」从相邻阻挡瓦片（墙/实心结构/不可达高差）中推出，
    // 实体不再半身卡进桌柜/墙体（此前实体为零半径质点，贴墙移动时模型穿进实心结构）
    {
      const ER = 0.24
      const etx = Math.floor(e.x), ety = Math.floor(e.y)
      for (let ty2 = ety - 1; ty2 <= ety + 1; ty2++) {
        for (let tx2 = etx - 1; tx2 <= etx + 1; tx2++) {
          if (tx2 === etx && ty2 === ety) continue
          if (this.entityWalkH(m, tx2, ty2, band) !== null) continue
          const cx2 = Math.max(tx2, Math.min(tx2 + 1, e.x))
          const cy2 = Math.max(ty2, Math.min(ty2 + 1, e.y))
          const ddx = e.x - cx2, ddy = e.y - cy2
          const dd = Math.hypot(ddx, ddy)
          if (dd >= ER || dd < 1e-6) continue
          e.x = cx2 + (ddx / dd) * ER
          e.y = cy2 + (ddy / dd) * ER
        }
      }
    }
    // v13：跟随地面（楼梯坡道连续爬升；上下层带随 z 自动切换）
    e.z = groundHeightAt(m, e.x, e.y, bandOfZ(e.z))
    // 深坑：实体坠入后死亡（无血花，直坠深渊消散）
    if (m.elev[Math.floor(e.y) * m.w + Math.floor(e.x)] === 4 && !e.dead) {
      e.hp = 0; e.dead = true; e.deathT = 1.4
    }
    // 卡住判定（v44 补）：防穿模推挤把本步位移完全抵消——顶着墙原地蹭也算卡住，
    // 漫游状态据此偏转另选目标（见 wanderDeflect），不再顶着同一面墙蹭
    if (Math.hypot(e.x - ox, e.y - oy) < 1e-3) return true
    return false
  }

  // 实体近战高度判定：与玩家脚底高差 ≥1m 时够不着（高台/沟底/跨层安全）
  private meleeZOk(e: Entity): boolean {
    return Math.abs(e.z - this.player.z) < 1
  }

  hurtPlayer(dmg: number, source: string) {
    if (this.dev.god) return
    const p = this.player
    p.hp -= dmg * (this.manmadeT > 0 ? 0.9 : 1) // v51：人制品效应中受到的伤害 -10%
    p.sanity = Math.max(0, p.sanity - 4)
    this.camShake = Math.min(1, this.camShake + 0.6)
    audio.hurt()
    this.emit({ kind: 'damage' })
    this.msg(`受到 ${Math.round(dmg)} 点伤害（${source}）`, 'damage')
    if (p.hp <= 0) this.die(`被 ${source} 撕碎`)
  }

  private die(cause: string, force = false) {
    if (this.dev.god && !force) { this.player.hp = Math.max(this.player.hp, 20); return }
    this.over = true
    this.player.hp = 0
    clearSaveSnapshot() // v29a：死亡后旧进度存档失效（继续游戏将开新局）
    audio.stopHum(); audio.stopBGM(); audio.setHeartbeat(false, 0)
    this.emit({ kind: 'dead', text: cause })
  }

  // 攻击距离：基础 1.9m，巨型实体按体量加成（v28：原 1.6 过短，近身常常够不到）
  private attackReach(e: Entity): number {
    return 1.9 + Math.max(0, (e.def.huge ?? 1) - 1) * 0.6
  }

  /** 当前攻击能否命中该实体：距离 + 高差 + 朝向锥（贴脸 <0.9m 免除朝向判定——
   *  实体与玩家几乎重合时 atan2 方向退化，旧判定会永远 miss，这就是"近身打不到"的根因） */
  private canHit(e: Entity): boolean {
    const p = this.player
    if (e.dead || e.disguised) return false
    const d = Math.hypot(e.x - p.x, e.y - p.y)
    if (d > this.attackReach(e)) return false
    if (Math.abs(e.z - p.z) >= 1) return false // 高差过大打不到（跨层够不着）
    if (d >= 0.9) {
      const ang = Math.atan2(e.y - p.y, e.x - p.x)
      let diff = Math.abs(ang - p.facing)
      if (diff > Math.PI) diff = Math.PI * 2 - diff
      if (diff > 1.1) return false
    }
    return true
  }

  /** 准星当前可命中的最近实体（渲染层据此改变准星样式） */
  aimEntity(): Entity | null {
    const m = this.map
    if (!m) return null
    let best: Entity | null = null, bd = 1e9
    for (const e of m.entities) {
      if (!this.canHit(e)) continue
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y)
      if (d < bd) { bd = d; best = e }
    }
    return best
  }

  private killCheck(e: Entity) {
    if (e.hp > 0 || e.dead) return
    const p = this.player, m = this.map!
    e.dead = true; e.deathT = 1.4
    p.kills++
    // v35：杀死 Ferren——BNTG 声望大跌（它是商人之家的吉祥物）
    if (e.def.type === 'ferren') {
      this.changeRep('bntg', -50)
      this.msg('整个市场安静了一秒。你意识到自己干了什么。（B.N.T.G. 声望大跌）', 'damage')
    }
    // v47：杀死鹉主杰瑞——信众永远不会原谅：jerry 声望直接跌至 -100（彻底敌对）
    if (e.def.type === 'jerry') {
      this.rep.jerry = -100
      audio.aggro()
      this.msg('鹉主从栖木上坠落。穹顶的圣辉摇晃了一瞬——信众的哭喊与怒吼同时炸开。（杰瑞的信众 声望 → -100）', 'damage')
    }
    this.msg(`击杀了 ${e.def.name}`, 'loot')
    // 旱虾（Entity 20）：被玩家击杀必掉可食用的「旱虾」——被敌方实体捕食不经由本函数，不掉落物品
    if (e.def.type === 'dryshrimp') {
      m.items.push({ id: Date.now() % 100000 + Math.random(), type: 'dryshrimp', x: e.x, y: e.y })
      return
    }
    if (Math.random() < (p.hasRabbit ? 0.6 : 0.35)) {
      const drops = ['bandage', 'almond', 'canned', 'battery']
      const t0 = drops[Math.floor(Math.random() * drops.length)]
      const t = t0 === 'almond' && Math.random() < 0.1 ? 'cashew' : t0 // v32：腰果水 1/10 替代
      m.items.push({ id: Date.now() % 100000 + Math.random(), type: t, x: e.x, y: e.y })
    }
  }

  private attack() {
    const p = this.player, m = this.map!
    const held = p.hotbar[p.selected]
    // v51：枪糖生效中——无论当前持有什么，右手都是枪（左键发射巧克力子弹）
    if (this.gunCandyT > 0) { this.shootChocolate(); return }
    // 可投掷道具：左键掷出而非近战
    if (held && ITEMS[held.type]?.throw) { this.throwHeld(held.type); return }
    // v32：滋水枪——左键喷射储罐液体
    if (held?.type === 'squirtgun') { this.squirt(); return }
    audio.swing()
    this.attackAnimT = 0.35 // 手部挥砍动画/准心收缩反馈
    this.attackAnimKind = held && ITEMS[held.type]?.weapon ? 'swing' : 'punch'
    // 开发者模式：一击必杀
    const dmg = this.dev.oneHit ? 99999 : held ? (ITEMS[held.type].weapon ?? 8) : 8
    let hit = false
    let blockedJerry = false // v47：教化约束——被拦下的对鹉主挥击（提示「你下不去手」）
    for (const e of m.entities) {
      if (!this.canHit(e)) continue
      // v47：教化约束——教化值 >0 后无法再对鹉主出手（驯服清零后解除约束）
      if (e.def.type === 'jerry' && this.indoctrination > 0) { blockedJerry = true; continue }
      const ang = Math.atan2(e.y - p.y, e.x - p.x)
      // 绝缘猎手：近战伤害减半
      const eff = e.def.type === 'insulator' ? dmg * 0.5 : dmg
      e.hp -= eff
      e.stunT = 0.35
      // v47：伤害鹉主杰瑞——信众哗然：jerry 声望立即 -50（每次）
      if (e.def.type === 'jerry') this.hurtJerryRep()
      // 击退位移做墙体校验：落点不可走（墙/实心结构/不可达高差）则不位移——
      // 击杀后的尸体同样不会被钉进墙里（尸体落点即击退落点）
      const kx = e.x + Math.cos(ang) * 0.4, ky = e.y + Math.sin(ang) * 0.4
      if (this.entityWalkH(m, Math.floor(kx), Math.floor(ky), bandOfZ(e.z)) !== null) { e.x = kx; e.y = ky }
      hit = true
      this.bloodParticles(e.x, e.y)
      if (e.def.type === 'insulator' && Math.random() < 0.4) this.msg('攻击被绝缘服缓冲了。', 'system')
      this.provoked = true // v23：主动挑衅解除「Level 11 Effect」的被动状态
      if (e.def.type === 'ferren') this.changeRep('bntg', -15) // v35：攻击 Ferren 惹恼 B.N.T.G.（杀死罚更重，见 killCheck）
      if (e.def.passive && !e.def.noRetaliate) { e.provoked = true; e.targetEnt = undefined; e.state = 'chase'; e.stateT = 0 } // 激怒无面灵（被攻击才反击；Ferren 绝不反击不进 chase）
      if (e.def.type === 'corpserat' && e.provoked) this.provokeRatPack(e) // v44：尸鼠群体激怒——周围同伴一同反击同一目标
      this.killCheck(e)
    }
    if (hit) { audio.hit(); this.camShake = Math.min(1, this.camShake + 0.15) }
    else if (blockedJerry) this.msg('你下不去手——鹉主的蓝羽在你眼中只剩神圣。（教化约束：驯服祂才能解除）', 'system')
    // v35：挥击波及 NPC——降低其所属团体声望（NPC 是居民不是实体：不会受伤、不会死亡）
    let blockedFollower = false // v47：教化约束——被拦下的对信众挥击
    for (const n of this.npcs) {
      if (n.dead) continue
      if ((n.floor ?? 0) !== bandOfZ(p.z)) continue // v46：隔层打不到（夹楼 NPC 不会被穿楼板挥中）
      const d = Math.hypot(n.x - p.x, n.y - p.y)
      if (d > 1.8) continue
      const ang = Math.atan2(n.y - p.y, n.x - p.x)
      let ndiff = Math.abs(ang - p.facing)
      if (ndiff > Math.PI) ndiff = Math.PI * 2 - ndiff
      if (ndiff > 0.7) continue
      // v39：BRC 员工——跳过 changeRep(-15)：不立即降声望，改记未告发次数（坦白时结清）。
      // 员工不受攻击影响（不逃跑/不反击/不停手），但可被杀死；敌对员工被杀死不另记罪（已坦白结清）
      if (n.def.faction === 'brc') {
        const dmg2 = this.dev.oneHit ? 99999 : held ? (ITEMS[held.type].weapon ?? 8) : 8
        n.hp = (n.hp ?? 55) - dmg2
        this.bloodParticles(n.x, n.y)
        audio.hit()
        this.camShake = Math.min(1, this.camShake + 0.15)
        if (n.hp <= 0) {
          n.dead = true; n.deathT = 1.4
          p.kills++
          if (!n.hostile) {
            this.brcSin.killed++
            this.msg(`${n.def.name} 一声不响地倒下了——周围的员工没有一个人停下手里的活。（未告发的杀死 ×${this.brcSin.killed}）`, 'damage')
          } else this.msg(`${n.def.name} 倒下了。`, 'loot')
        } else if (!n.hostile) {
          this.brcSin.hurt++
          this.msg(`你攻击了 ${n.def.name}——对方没有任何反应，继续手中的活。（未告发的伤害 ×${this.brcSin.hurt}）`, 'damage')
        }
        break
      }
      // v45：信众 NPC——与 BRC 员工同契约：可伤害/可杀死；非敌对时攻击会重降声望（并立即招致敌意）
      if (n.def.faction === 'jerry') {
        // v47：教化约束——教化值 ≥50 后无法再攻击信众 NPC（他们是你的兄弟姐妹；驯服清零后解除）
        if (this.indoctrination >= 50) { blockedFollower = true; continue }
        const dmg2 = this.dev.oneHit ? 99999 : held ? (ITEMS[held.type].weapon ?? 8) : 8
        n.hp = (n.hp ?? 45) - dmg2
        this.bloodParticles(n.x, n.y)
        audio.hit()
        this.camShake = Math.min(1, this.camShake + 0.15)
        if (n.hp <= 0) {
          n.dead = true; n.deathT = 1.4
          p.kills++
          if (!n.hostile) {
            this.changeRep('jerry', -30) // 杀死信众：信众永远不会原谅
            this.msg(`${n.def.name} 倒下了——满墙海报上的鹉主仿佛在看着你。`, 'damage')
          } else this.msg(`${n.def.name} 倒下了。`, 'loot')
        } else if (!n.hostile) {
          this.changeRep('jerry', -15)
          this.msg(`你攻击了 ${n.def.name}——信众视此为宣战。`, 'damage')
          audio.aggro()
        }
        break
      }
      this.changeRep(n.def.faction ?? 'meg', -15)
      n.bubbleText = '你在干什么？！'
      n.bubbleT = 3
      this.msg(`你攻击了 ${n.def.name}——周围的人都看见了。（声望下降）`, 'damage')
      audio.aggro()
      break // 一次挥击只结算一名 NPC
    }
    if (blockedFollower) this.msg('你下不去手——他们是你的兄弟姐妹。（教化约束：驯服鹉主才能解除）', 'system')
    // 空手/武器挥击也产生噪音（可主动威慑猎犬）
    this.noiseEvent(p.x, p.y, 8, false)
  }

  // ---------- v28：可投掷道具 ----------
  /** 掷出手持的可投掷物品（消耗 1 个；订书机/玻璃珠落地后可捡回） */
  private throwHeld(type: string) {
    const p = this.player
    const slot = p.hotbar[p.selected]
    if (!slot || slot.type !== type) return
    slot.count--
    if (slot.count <= 0) p.hotbar[p.selected] = null
    audio.swing()
    this.attackAnimT = 0.35
    this.attackAnimKind = 'throw'
    const speed = 9
    this.projectiles.push({
      id: this.projId++, type,
      x: p.x + Math.cos(p.facing) * 0.4, y: p.y + Math.sin(p.facing) * 0.4,
      z: p.z + 1.4, floorZ: p.z,
      vx: Math.cos(p.facing) * speed, vy: Math.sin(p.facing) * speed, vz: 2.6,
    })
    this.msg(`你掷出了${ITEMS[type].name}。`, 'system')
    this.noiseEvent(p.x, p.y, 4, false)
  }

  // ---------- v32：滋水枪 / 迁跃浆果 ----------
  /** 滋水枪储罐容量（份数）：9 瓶 × 每瓶 3 份 = 27 */
  static readonly SQUIRT_CAP = 27
  /** 往滋水枪储罐装入 1 瓶液体（3 份喷射量；储罐只能装一种液体，清水无需对应物品） */
  loadSquirt(liquid: 'water' | 'almond' | 'cashew' | 'liquidpain'): boolean {
    const NAME = { water: '清水', almond: '杏仁水', cashew: '腰果水', liquidpain: '液态痛苦' } as const
    if (this.squirtTank !== 'none' && this.squirtTank !== liquid) {
      this.msg(`储罐里还有别的液体——喷完或喝完才能换。`, 'system')
      return false
    }
    if (this.squirtAmmo >= Engine.SQUIRT_CAP) { this.msg(`储罐已经装满了。（${Engine.SQUIRT_CAP}/${Engine.SQUIRT_CAP}）`, 'system'); return false }
    if (liquid !== 'water' && !this.hasItem(liquid)) { this.msg(`背包里没有${NAME[liquid]}。`, 'system'); return false }
    if (liquid !== 'water') this.consumeItem(liquid)
    this.squirtTank = liquid
    this.squirtAmmo = Math.min(Engine.SQUIRT_CAP, this.squirtAmmo + 3)
    audio.pickup()
    this.msg(`装入 1 瓶${NAME[liquid]}（储罐 ${this.squirtAmmo}/${Engine.SQUIRT_CAP}）。`, 'loot')
    return true
  }

  /** 清空储罐（把残液倒掉，换液体免喷完） */
  clearSquirt() {
    if (this.squirtTank === 'none') { this.msg('储罐本来就是空的。', 'system'); return }
    const NAME = { water: '清水', almond: '杏仁水', cashew: '腰果水', liquidpain: '液态痛苦' } as const
    this.msg(`倒空了储罐里的${NAME[this.squirtTank]}（${this.squirtAmmo} 份残液）。`, 'system')
    this.squirtTank = 'none'
    this.squirtAmmo = 0
  }

  // ---------- v51：Object 5 糖果效果 ----------

  /** 纸片人斯坦利：瞬移到最近的「无阻挡开阔墙面」（贴墙地板且无实心结构遮挡） */
  private stanleyTeleport() {
    const p = this.player, m = this.map!
    let best: { x: number; y: number; d: number } | null = null
    for (let y = 1; y < m.h - 1; y++) {
      for (let x = 1; x < m.w - 1; x++) {
        const i = y * m.w + x
        if (m.tiles[i] !== 1) continue
        const wall = m.tiles[i + 1] !== 1 || m.tiles[i - 1] !== 1 || m.tiles[i + m.w] !== 1 || m.tiles[i - m.w] !== 1
        if (!wall) continue
        if (m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) continue
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y)
        if (d < 1.5) continue // 不落在脚下
        if (!best || d < best.d) best = { x, y, d }
      }
    }
    if (best) {
      p.x = best.x + 0.5; p.y = best.y + 0.5
      p.z = groundHeightAt(m, p.x, p.y)
      this.camShake = Math.min(1, this.camShake + 0.3)
      this.msg('你突然扁成了一张纸——再展开时，已经贴在了最近的墙面上。（饥饿+5 理智+5）', 'lore')
    } else {
      this.msg('你扁了一瞬又弹了回来——附近没有可以贴上去的开阔墙面。（饥饿+5 理智+5）', 'lore')
    }
  }

  /** 枪糖：左键发射巧克力子弹（直线 12m，1 点伤害，命中也只是糊一脸） */
  private shootChocolate() {
    const p = this.player, m = this.map!
    if (this.chocoCd > 0) return
    this.chocoCd = 0.22
    audio.swing()
    this.attackAnimT = 0.2
    this.attackAnimKind = 'spray'
    const dx = Math.cos(p.facing), dy = Math.sin(p.facing)
    const pc = '#7a4a2a' // 巧克力色
    let hitEnt: Entity | null = null
    let travel = 12
    for (let s = 0.5; s <= 12; s += 0.2) {
      const rx = p.x + dx * s, ry = p.y + dy * s
      if (tileAt(m, Math.floor(rx), Math.floor(ry)) !== 1) { travel = s - 0.2; break }
      for (const e of m.entities) {
        if (e.dead || e.hidden) continue
        if (Math.hypot(e.x - rx, e.y - ry) < 0.45) { hitEnt = e; travel = s; break }
      }
      if (hitEnt) break
    }
    // 弹道视觉（同滋水枪：枪口→准星点）
    const rfx = -Math.sin(p.facing), rfy = Math.cos(p.facing)
    const cp = Math.cos(look.pitch)
    const tx = p.x + dx * travel * cp, ty = p.y + dy * travel * cp
    const tz = p.z + 1.55 + Math.sin(look.pitch) * travel
    const mx = p.x + dx * 0.5 + rfx * 0.25, my = p.y + dy * 0.5 + rfy * 0.25, mz = p.z + 1.25
    const dist = Math.max(0.5, Math.hypot(tx - mx, ty - my, tz - mz))
    for (let s = 0.3; s < dist; s += 0.3) {
      const k = s / dist
      this.particles.push({
        x: mx + (tx - mx) * k, y: my + (ty - my) * k,
        vx: ((tx - mx) / dist) * 9, vy: ((ty - my) / dist) * 9,
        t: 0, life: 0.22, color: pc, size: 1.2, z: mz + (tz - mz) * k, vz: ((tz - mz) / dist) * 9,
      })
    }
    if (hitEnt) {
      const e = hitEnt
      e.hp -= 1
      e.stunT = Math.max(e.stunT, 0.1)
      this.killCheck(e)
      audio.hit()
      this.msg(`巧克力子弹啪叽糊在${e.def.name}身上。（1 点伤害）`, 'system')
    }
  }

  /** 滋水枪喷射：清水无效果；杏仁水雾轻伤实体，腰果水雾造成更大伤害 */
  private squirt() {
    const p = this.player, m = this.map!
    if (this.squirtAmmo <= 0 || this.squirtTank === 'none') {
      this.msg('储罐是空的——先装入液体。', 'system')
      return
    }
    this.squirtAmmo--
    audio.swing()
    this.attackAnimT = 0.35
    this.attackAnimKind = 'spray' // 滋水枪专属喷射动画
    const dmg = this.squirtTank === 'liquidpain' ? 60 : this.squirtTank === 'cashew' ? 20 : 8 // 液态痛苦：腐蚀性高伤
    const pc = this.squirtTank === 'liquidpain' ? '#d94a3a' : this.squirtTank === 'cashew' ? '#c9a05a' : this.squirtTank === 'almond' ? '#c9e8a0' : '#9adfff'
    // v34：线性水线——沿视线射线步进（射程 4.5m，撞墙即停，顺带修复隔墙命中）；水线碰到首个实体才触发液体效果
    const dx = Math.cos(p.facing), dy = Math.sin(p.facing)
    const RANGE = 4.5, STEP = 0.2
    let hitEnt: Entity | null = null
    let travel = RANGE
    for (let s = 0.6; s <= RANGE; s += STEP) {
      const rx = p.x + dx * s, ry = p.y + dy * s
      if (tileAt(m, Math.floor(rx), Math.floor(ry)) !== 1) { travel = s - STEP; break } // 撞墙
      for (const e of m.entities) {
        if (e.dead || e.hidden) continue
        if (Math.hypot(e.x - rx, e.y - ry) < 0.45) { hitEnt = e; travel = s; break }
      }
      if (hitEnt) break
    }
    // 水线视觉：从右手枪模口射出、笔直射向准星所指点（枪口=右手下前方；目标=视线射线末端，含俯仰）
    const rfx = -Math.sin(p.facing), rfy = Math.cos(p.facing) // 右手方向（与视角模型右手位一致）
    const cp = Math.cos(look.pitch)
    const tx = p.x + dx * travel * cp, ty = p.y + dy * travel * cp // 准星目标点
    const tz = p.z + 1.55 + Math.sin(look.pitch) * travel
    const mx = p.x + dx * 0.5 + rfx * 0.25, my = p.y + dy * 0.5 + rfy * 0.25, mz = p.z + 1.25 // 枪口（右手下前方）
    const dist = Math.max(0.5, Math.hypot(tx - mx, ty - my, tz - mz))
    for (let s = 0.26; s < dist; s += 0.26) {
      const k = s / dist
      this.particles.push({
        x: mx + (tx - mx) * k, y: my + (ty - my) * k,
        vx: ((tx - mx) / dist) * 5, vy: ((ty - my) / dist) * 5,
        t: 0, life: 0.3,
        color: pc, size: 1.6, z: mz + (tz - mz) * k, vz: ((tz - mz) / dist) * 5,
      })
    }
    for (let i = 0; i < 6; i++) {
      const a = p.facing + (Math.random() - 0.5) * 1.2
      this.particles.push({
        x: p.x + dx * travel, y: p.y + dy * travel,
        vx: Math.cos(a) * (1 + Math.random() * 2), vy: Math.sin(a) * (1 + Math.random() * 2),
        t: 0, life: 0.3, color: pc, size: 1.4, z: 1.1,
      })
    }
    if (hitEnt) {
      const e = hitEnt
      if (this.squirtTank !== 'water') {
        e.hp -= dmg
        e.stunT = 0.4
        this.provoked = true // v23：主动挑衅解除「Level 11 Effect」的被动状态
        if (e.def.passive) { e.provoked = true; e.targetEnt = undefined; e.state = 'chase'; e.stateT = 0 } // 激怒无面灵（与近战受击一致）
        if (e.def.type === 'corpserat' && e.provoked) this.provokeRatPack(e) // v44：尸鼠群体激怒（与近战受击一致）
        this.killCheck(e)
        audio.hit()
        this.msg(this.squirtTank === 'liquidpain' ? `水线正中${e.def.name}——液态痛苦嘶嘶地腐蚀着它的表皮。` : this.squirtTank === 'cashew' ? `水线正中${e.def.name}——苦涩的腰果水把它灼得发颤。` : `水线正中${e.def.name}，甜腻的杏仁水四溅。`, 'system')
      } else {
        this.msg(`水线滋了${e.def.name}一身清水——什么效果也没有。`, 'system')
      }
    } else {
      this.msg(this.squirtTank === 'water' ? '你喷出一道清水——什么效果也没有。' : this.squirtTank === 'liquidpain' ? '你喷出一道淡红色的腐蚀水线。' : this.squirtTank === 'cashew' ? '你喷出一道苦涩的腰果水线。' : '你喷出一道甜腻的杏仁水线。', 'system')
    }
    if (this.squirtAmmo <= 0) {
      this.squirtTank = 'none'
      this.msg('储罐空了。', 'system')
    }
  }

  /** 迁跃浆果：传送回首次发现这种浆果的层级 */
  private warpToBerryLevel(tag?: number) {    const dest = tag ?? this.warpBerryLevel // 格子标签优先；无标签的旧档浆果回退到首次获得层级
    if (dest === null || dest === this.player.level) {
      this.msg('浆果的空间涟漪荡开——但你已经在这里了。', 'lore')
      return
    }
    this.msg('浆果在你口中炸开一圈空间涟漪——', 'lore')
    this.transition = { anim: 'bloom', t: 0, dest }
    this.emit({ kind: 'transition', anim: 'bloom', dest })
  }

  private updateProjectiles(dt: number) {
    const m = this.map!
    for (const pr of this.projectiles) {
      const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt
      pr.vz -= 9.8 * dt
      pr.z += pr.vz * dt
      if (pr.z <= pr.floorZ) { pr.done = true; this.landProjectile(pr, pr.x, pr.y); continue }
      // 撞墙：在原地提前落地
      if (tileAt(m, Math.floor(nx), Math.floor(ny)) !== 1) { pr.done = true; this.landProjectile(pr, pr.x, pr.y); continue }
      pr.x = nx; pr.y = ny
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.done)
  }

  private landProjectile(pr: Projectile, x: number, y: number) {
    const m = this.map!
    const kind = ITEMS[pr.type].throw
    switch (kind) {
      case 'explode': { // 汽油罐：范围伤害
        this.noiseEvent(x, y, 18, true)
        this.camShake = Math.min(1, this.camShake + 0.5)
        audio.hit()
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2
          this.particles.push({ x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, t: 0, life: 0.6, color: i % 3 === 0 ? '#e8823c' : '#c93a1e', size: 3 + Math.random() * 3 })
        }
        let n = 0
        for (const e of m.entities) {
          if (e.dead || e.disguised) continue
          const d = Math.hypot(e.x - x, e.y - y)
          if (d > 3.2 || Math.abs(e.z - pr.floorZ) >= 1) continue
          if (e.def.type === 'jerry' && this.indoctrination > 0) continue // v47：教化约束——投掷波及对鹉主无效
          e.hp -= d < 2.2 ? 45 : 20
          e.stunT = Math.max(e.stunT, 0.6)
          this.bloodParticles(e.x, e.y)
          if (e.def.type === 'jerry') this.hurtJerryRep() // v47：伤害鹉主 → 信众哗然 -50
          n++
          this.killCheck(e)
        }
        this.msg(n > 0 ? `汽油罐轰然炸开——火焰吞没了 ${n} 个实体。` : '汽油罐轰然炸开，火焰很快熄灭了。', n > 0 ? 'damage' : 'system')
        break
      }
      case 'shock': { // 瓶装闪电：电击 + 长眩晕
        this.noiseEvent(x, y, 12, true)
        audio.spark()
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2
          this.particles.push({ x, y, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, t: 0, life: 0.4, color: '#9ad2ff', size: 2 + Math.random() * 2 })
        }
        let n = 0
        for (const e of m.entities) {
          if (e.dead || e.disguised) continue
          const d = Math.hypot(e.x - x, e.y - y)
          if (d > 2.8 || Math.abs(e.z - pr.floorZ) >= 1) continue
          if (e.def.type === 'jerry' && this.indoctrination > 0) continue // v47：教化约束——投掷波及对鹉主无效
          e.hp -= 20
          e.stunT = Math.max(e.stunT, 2.5)
          if (e.def.type === 'jerry') this.hurtJerryRep() // v47：伤害鹉主 → 信众哗然 -50
          n++
          this.killCheck(e)
        }
        this.msg(n > 0 ? `瓶装闪电炸开一团电火花——${n} 个实体被电得僵直。` : '瓶装闪电炸开一团电火花，什么也没电到。', n > 0 ? 'damage' : 'system')
        break
      }
      case 'noise': { // 订书机：落地脆响引怪（可捡回）
        m.items.push({ id: Math.random(), type: pr.type, x, y })
        this.noiseEvent(x, y, 16, true)
        this.msg('订书机「啪」地砸在远处——有什么听见了。', 'system')
        break
      }
      case 'lure': { // 氙气玻璃珠：引路者的筑巢材料（可捡回）
        m.items.push({ id: Math.random(), type: pr.type, x, y })
        this.noiseEvent(x, y, 8, false)
        let n = 0
        for (const e of m.entities) {
          if (e.dead || e.def.type !== 'lightguide') continue
          e.state = 'investigate'; e.targetX = x; e.targetY = y; e.stateT = 10
          n++
        }
        this.msg(n > 0 ? '玻璃珠滚落在地——蓝绿色的微光朝它聚拢过来。' : '玻璃珠滚落在地，发出清脆的声响。', n > 0 ? 'lore' : 'system')
        break
      }
    }
  }

  bloodParticles(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2
      this.particles.push({ x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, t: 0, life: 0.5, color: '#b3352b', size: 2 + Math.random() * 2 })
    }
  }
  steamParticles(x: number, y: number) {
    this.particles.push({ x, y, vx: (Math.random() - 0.5) * 0.5, vy: -1.5 - Math.random(), t: 0, life: 1.2, color: 'rgba(207,196,180,0.5)', size: 4 + Math.random() * 4 })
  }

  // ---------- v17：无限窗口平移 ----------
  // chunk 以世界种子+坐标确定性生成，窗口平移后相对世界完全一致；
  // 玩家/幻影/粒子等动态坐标随窗口反向平移，玩家无感。
  /** v39：无限层级 NPC 同步——从已加载 LiveChunk 收集活体 NPC（窗口平移后重收集：
   *  新 chunk 的员工加入、卸载 chunk 的员工消失；对象身份跨平移保持，状态不丢） */
  private syncInfNpcs() {
    const m = this.map
    if (!m?.inf) return
    this.npcs = []
    for (const c of m.inf.chunks.values()) for (const n of c.npcs) this.npcs.push(n)
    for (const n of this.npcs) if (!this.knownNpcs.some((k) => k.id === n.id)) this.knownNpcs.push(n.def)
  }

  private updateInfiniteWindow() {
    const m = this.map!
    const shift = updateInfinite(m, this.levelDef, this.player.x, this.player.y, this.explored)
    if (!shift) return
    const { dx, dy } = shift
    const p = this.player
    p.x -= dx; p.y -= dy
    for (const f of this.fakes) { f.x -= dx; f.y -= dy }
    for (const pt of this.particles) { pt.x -= dx; pt.y -= dy }
    for (const pr of this.projectiles) { pr.x -= dx; pr.y -= dy }
    // 窗口重建对象列表：中断进行中的引用型状态
    this.searching = null
    this.lootPanel = null
    this.interactTarget = null
    this.ride = null
    this.climb = null
    this.syncInfNpcs() // v39：窗口平移后重收集 chunk NPC（卸载消失/新载加入）
    // v29：返程阶梯（世界坐标固定；stitch 重建 m.exits 后重新注入，并同步所属 chunk 供渲染）
    if (this.bonusExit && m.inf && !m.exits.some((e) => e.def === this.bonusExit!.def)) {
      const inf = m.inf
      const exit: ExitInstance = { def: this.bonusExit.def, x: this.bonusExit.wx - inf.ox, y: this.bonusExit.wy - inf.oy, discovered: true }
      m.exits.push(exit)
      const c = inf.chunks.get(chunkKey(Math.floor(this.bonusExit.wx / CS), Math.floor(this.bonusExit.wy / CS)))
      if (c && !c.exits.some((e) => e.def === this.bonusExit!.def)) c.exits.push(exit)
    }
  }

  // ---------- 交互 ----------
  nearestExit() {
    const p = this.player, m = this.map!
    // v17 无限模式：解析式最近保底出口（窗口外也可指向，适配出口提示/气流/音效）
    if (m.inf) {
      const inf = m.inf
      // 优先窗口内已加载出口（可交互实例）
      let best: { x: number; y: number } | null = null, bd = 1e9
      for (const e of m.exits) {
        const d = Math.hypot(e.x + 0.5 - p.x, e.y + 0.5 - p.y)
        if (d < bd) { bd = d; best = e }
      }
      if (best && bd < 40) return { x: best.x, y: best.y, d: bd }
      const w = l0NearestExit(m, this.levelDef, inf.ox + p.x, inf.oy + p.y)
      if (w && (!best || w.d < bd)) return w
      return best ? { x: best.x, y: best.y, d: bd } : w
    }
    let best: { x: number; y: number } | null = null, bd = 1e9
    for (const e of m.exits) {
      const d = Math.hypot(e.x + 0.5 - p.x, e.y + 0.5 - p.y)
      if (d < bd) { bd = d; best = e }
    }
    return best ? { x: best.x, y: best.y, d: bd } as { x: number; y: number; d: number } | null : null
  }

  /** v35：最近的定居点地标（出口提示的替代目标——附近无出口时指向它） */
  nearestLandmark(): { x: number; y: number; d: number } | null {
    const p = this.player, m = this.map
    if (!m) return null
    let best: { x: number; y: number } | null = null, bd = 1e9
    for (const s of m.structures) {
      if (s.kind !== 'landmark') continue
      const d = Math.hypot(s.x + s.w / 2 - p.x, s.y + s.h / 2 - p.y)
      if (d < bd) { bd = d; best = { x: s.x + s.w / 2, y: s.y + s.h / 2 } }
    }
    return best ? { ...best, d: bd } : null
  }

  getInteract(): { kind: string; label: string } | null { return this.interactTarget }

  // 交互判定：3D 距离 + 视线角 + LOS（不依赖瓦片对齐）
  private inView(x: number, y: number, radius: number): boolean {
    const p = this.player
    const dx = x - p.x, dy = y - p.y
    const d = Math.hypot(dx, dy)
    if (d > radius) return false
    // 贴身目标无视线角要求
    if (d < 0.9) return true
    const ang = Math.atan2(dy, dx)
    let diff = Math.abs(ang - p.facing)
    if (diff > Math.PI) diff = Math.PI * 2 - diff
    if (diff > 1.5) return false // ~86° 半锥，宽容
    // 目标点向玩家回拉，避免实心容器/结构自身遮挡 LOS
    const pull = Math.min(0.65, d * 0.5)
    const tx = x - (dx / d) * pull, ty = y - (dy / d) * pull
    return this.los(p.x, p.y, tx, ty)
  }

  // 目标与视线朝向的角差（弧度；贴身目标视为 0）——v12 统一目标选择的主排序键
  private viewAngle(x: number, y: number): number {
    const p = this.player
    const dx = x - p.x, dy = y - p.y
    if (Math.hypot(dx, dy) < 0.9) return 0
    const ang = Math.atan2(dy, dx)
    let diff = Math.abs(ang - p.facing)
    if (diff > Math.PI) diff = Math.PI * 2 - diff
    return diff
  }

  // v12：统一可交互目标选择（HUD 提示与 interact() 执行共用本函数结果）。
  // 优先级：视线角最小（正对）> 距离最近 > 同角同距时可执行优先于不可执行
  // （如上锁但无撬棍/万能钥匙的房门、无车钥匙的后备箱）。
  private scanInteract() {
    const p = this.player, m = this.map!
    this.interactTarget = null
    const band = bandOfZ(p.z)
    // 出口（进入判定仍用近距离，不挡拾取；v13：出口都在主层，上层不触发）
    if (band === 0) for (const e of m.exits) {
      if (e.def.kind === 'graystairs' || e.def.kind === 'graystairsup') continue // v29：可行走阶梯——直接走上去/走下去，无 E 交互
      if (Math.hypot(e.x + 0.5 - p.x, e.y + 0.5 - p.y) < 1.6) {
        e.discovered = true
        this.interactTarget = { kind: 'exit', label: `进入 ${e.def.name}`, e }
        return
      }
    }
    // 地面物品（同一优先级：视线角 > 距离，半径 2.0m；v13：按物品所在高度过滤楼层）
    {
      let bi: (typeof m.items)[0] | null = null, ba = 1e9, bd = 1e9
      for (const it of m.items) {
        const d = Math.hypot(it.x - p.x, it.y - p.y)
        if (d >= 2.0 || !this.inView(it.x, it.y, 2.0)) continue
        const iz = it.z ?? groundHeightAt(m, it.x, it.y)
        if (Math.abs(iz - p.z) > 1.4) continue
        const a = this.viewAngle(it.x, it.y)
        if (a < ba - 1e-6 || (Math.abs(a - ba) <= 1e-6 && d < bd - 1e-6)) { ba = a; bd = d; bi = it }
      }
      if (bi) { this.interactTarget = { kind: 'item', label: bi.type === 'welcomenote' ? `查看 ${itemName(bi.type)}` : `拾取 ${itemName(bi.type)}`, it: bi }; return }
    }
    // 结构（半径 2.2m，含容器）
    let best: { kind: string; label: string; s: Structure; a: number; d: number; can: boolean } | null = null
    const consider = (kind: string, label: string, s: Structure, d: number, can: boolean) => {
      const a = this.viewAngle(s.x + s.w / 2, s.y + s.h / 2)
      if (!best || a < best.a - 1e-6
        || (Math.abs(a - best.a) <= 1e-6 && d < best.d - 1e-6)
        || (Math.abs(a - best.a) <= 1e-6 && Math.abs(d - best.d) <= 1e-6 && can && !best.can)) {
        best = { kind, label, s, a, d, can }
      }
    }
    for (const s of m.structures) {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2
      const d = Math.hypot(cx - p.x, cy - p.y)
      const maxD = CONTAINERS[s.kind] ? 2.7 : 2.2 // v51：容器交互距离放宽（十字锥选取保留，不再要贴着才能搜）
      if (d > maxD || !this.inView(cx, cy, maxD)) continue
      // v13：结构按楼层过滤（楼上楼下同名容器互不干扰）；lift 跨层服务
      if (s.kind !== 'lift' && (s.floor ?? 0) !== band) continue
      if (s.kind === 'lift') { consider('lift', band === 0 ? '乘电梯 上楼' : '乘电梯 下楼', s, d, !this.ride); continue }
      // v18：已搜空容器仍可选中（交互时提示「容器是空的」），未搜空的正常提示
      // v23：全部容器走统一表（含新增的储物柜/工具箱/行李箱/冰箱/保险箱/信箱/木桶/书柜/骨堆/营地摊位）
      if (CONTAINERS[s.kind]) {
        // v51：容器要求准星近似对准（~26° 半锥）——86° 宽容锥下余光里的容器会抢占交互位，
        // 挡住玩家正对其他目标的交互；对准才可选中，不对准时完全不影响其他交互
        if (this.viewAngle(cx, cy) > 0.45) continue
        const C = CONTAINERS[s.kind]
        const gate = !C.gate || (C.gate === 'carkey' ? this.hasPocket('carkey') : this.hasItem('crowbar'))
        const gateText = C.gate === 'carkey' ? '（需要车钥匙）' : '（需要撬棍）'
        const label = s.looted ? `${C.label}（空）`
          : !gate ? `${C.label}${gateText}`
          : s.data?.searched ? `查看 ${C.label}（剩余物品）`
          : `搜索 ${C.label}`
        consider(s.kind, label, s, d, s.looted ? true : gate)
      }
      else if (s.kind === 'lightswitch') consider('lightswitch', s.data?.flipped ? '电灯开关（已经拨过了）' : '拨动 电灯开关', s, d, true)
      else if (s.kind === 'roadsign' || s.kind === 'megsign') consider('roadsign', DECOR_VIEWS.roadsign.label, s, d, true)
      else if (s.kind === 'braille') consider('braille', DECOR_VIEWS.braille.label, s, d, true)
      else if (s.kind === 'arcadecab') consider('arcadecab', '投币 街机', s, d, true)
      else if (s.kind === 'endletters') consider('endletters', DECOR_VIEWS.endletters.label, s, d, true)
      else if (s.kind === 'clipfuse') consider('clipfuse', DECOR_VIEWS.clipfuse.label, s, d, true)
      else if (s.kind === 'handspike') consider('handspike', DECOR_VIEWS.handspike.label, s, d, true)
      else if (s.kind === 'hoteldoor') {
        if (s.data?.sealed) consider('hoteldoor', '锁死的门（锁的结构闻所未闻）', s, d, true) // v41：L2 特殊锁死门——任何方式都打不开
        else if (s.data?.locked) {
          const canAxe = this.hasItem('axe') && this.axeDur > 0
          const can = this.hasItem('crowbar') || this.hasPocket('skeleton') || canAxe
          const label = canAxe ? `劈开 上锁的房门（斧头耐久 ${this.axeDur}/5）`
            : can ? '撬开 上锁的房门' : '上锁的房门（需要撬棍/万能钥匙/斧头）'
          consider('hoteldoor', label, s, d, can)
        } else consider('hoteldoor', s.data?.open ? '关上 房门' : '打开 房门', s, d, true)
      }
      else if (s.kind === 'rollerdoor') {
        if (s.data?.locked) consider('rollerdoor', '卷帘门锁死了', s, d, false)
        else consider('rollerdoor', s.data?.open ? '放下 卷帘门' : '升起 卷帘门', s, d, true)
      }
      else if (s.kind === 'glassdoor') consider('glassdoor', s.data?.open ? '关上 玻璃门' : '推开 玻璃门', s, d, true)
      else if (s.kind === 'inkdoor') consider('inkdoor', s.data?.open ? '关上 墨黑色金属门' : '打开 墨黑色金属门', s, d, true)
      else if (s.kind === 'bargate') consider('bargate', s.data?.open ? '关上 栅栏门' : '打开 栅栏门', s, d, true)
      else if (s.kind === 'glasswin') consider('glasswin', DECOR_VIEWS.glasswin.label, s, d, true)
      else if (s.kind === 'windowtrap') consider('windowtrap', s.data?.triggered ? '查看 窗户（已无异常）' : '查看 未涂黑的窗户', s, d, true)
      else if (s.kind === 'windowblack') consider('windowblack', DECOR_VIEWS.windowblack.label, s, d, true)
      else if (s.kind === 'graffiti') consider('graffiti', DECOR_VIEWS.graffiti.label, s, d, true)
      else if (s.kind === 'statue') consider('statue', DECOR_VIEWS.statue.label, s, d, true)
      else if (s.kind === 'megdoc') consider('megdoc', '阅读 M.E.G. 文档', s, d, true)
      else if (s.kind === 'landmark') consider('landmark', '查看 定居点地标', s, d, true)
      else if (s.kind === 'valve') consider('valve', s.data?.on ? '关闭 蒸汽阀门' : '打开 蒸汽阀门', s, d, true)
      else if (s.kind === 'booth' && !this.player.leverPulled) consider('lever', '扳动 电源拉杆', s, d, true)
      else if (s.kind === 'server' && s.locked) consider('server', '刷门禁卡 进入', s, d, this.hasPocket('keycard'))
      else if (s.kind === 'vending') consider('vending', '使用 自动售货机', s, d, true)
      else if (s.kind === 'frontdesk') consider('frontdesk', '与前台交易', s, d, true)
    }
    //（闭包内赋值 TS 无法跟踪，显式还原声明类型）
    const picked = best as { kind: string; label: string; s: Structure } | null
    this.interactTarget = picked ? { kind: picked.kind, label: picked.label, s: picked.s } : null
    // v35：NPC 交谈（据点；优先级最低——出口/物品/结构都未选中时才考虑）
    if (!this.interactTarget) {
      let bn: NpcState | null = null, ba = 1e9, bd = 1e9
      for (const n of this.npcs) {
        if (n.dead || n.hostile) continue // v39：尸体与敌对员工不可交谈
        if ((n.floor ?? 0) !== bandOfZ(p.z)) continue // v46：隔层不可交谈（夹楼 NPC 须上到 2F）
        const d = Math.hypot(n.x - p.x, n.y - p.y)
        if (d > 2.2 || !this.inView(n.x, n.y, 2.2)) continue
        const a = this.viewAngle(n.x, n.y)
        if (a < ba - 1e-6 || (Math.abs(a - ba) <= 1e-6 && d < bd)) { ba = a; bd = d; bn = n }
      }
      if (bn) this.interactTarget = { kind: 'npc', label: `与 ${bn.def.name} 交谈`, npc: bn }
    }
    // v45：实体「杰瑞」——接触杰瑞（与 NPC 同级最低优先级；驯服提示随状态变化；v47：冷却剩余在提示中显示）
    if (!this.interactTarget) {
      for (const e of m.entities) {
        if (e.dead || e.def.type !== 'jerry') continue
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d > 2.2 || !this.inView(e.x, e.y, 2.2)) continue
        this.interactTarget = {
          kind: 'jerry',
          label: this.jerryContactCd > 0
            ? `接触 鹉主杰瑞（冷却 ${Math.ceil(this.jerryContactCd)}s）`
            : this.jerryTamed ? '接触 鹉主杰瑞（已驯服）' : '接触 鹉主杰瑞（教化 +25 · 对其使用杏仁水可驯服）',
          ent: e,
        }
        break
      }
    }
    // v51：人制品售货机（Entity 36）——正面取货 / 背面看标语（与杰瑞同级最低优先级）
    if (!this.interactTarget) {
      for (const e of m.entities) {
        if (e.dead || e.def.type !== 'vendingmachine' || e.activated) continue
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d > 2.2 || !this.inView(e.x, e.y, 2.2)) continue
        // 正/背面：玩家在机器朝向的一侧为正面
        const behind = Math.cos(e.facing) * (p.x - e.x) + Math.sin(e.facing) * (p.y - e.y) < 0
        this.interactTarget = {
          kind: 'vendingmachine',
          label: behind ? '查看 人制品售货机（背面）' : '取出 人制品',
          ent: e, vmBack: behind,
        }
        break
      }
    }
  }

  private doInteract() {
    const t = this.interactTarget
    if (!t || !this.map) return
    const p = this.player, m = this.map
    switch (t.kind) {
      case 'exit': {
        // v12：执行 scanInteract 选中的同一出口（距离兜底校验）
        const e = t.e && Math.hypot(t.e.x + 0.5 - p.x, t.e.y + 0.5 - p.y) < 1.6 ? t.e
          : m.exits.find((x) => Math.hypot(x.x + 0.5 - p.x, x.y + 0.5 - p.y) < 1.6)
        if (e) this.takeExit(e.def)
        break
      }
      case 'item': {
        // v12：拾取 scanInteract 选中的同一物品（仍在地上才有效）
        const bi = t.it && m.items.includes(t.it) ? t.it : null
        if (bi) {
          if (bi.fake) { m.items = m.items.filter((i) => i !== bi); if (m.inf) m.inf.taken.add(bi.id); return }
          // v34：致新流浪者的纸条——查看即收录图鉴「文档」（不入背包，归宿是文档存档）
          if (bi.type === 'welcomenote') {
            m.items = m.items.filter((i) => i !== bi)
            if (m.inf) m.inf.taken.add(bi.id)
            audio.pickup()
            this.emit({ kind: 'doc', text: 'welcome_note' })
            this.msg('纸条已存档到图鉴 ·「文档」。', 'system')
            break
          }
          // 手电筒：副手空着时拾取即自动装备（开局引导）
          if (bi.type === 'flashlight' && !p.equip.offhand) {
            m.items = m.items.filter((i) => i !== bi)
            if (m.inf) m.inf.taken.add(bi.id)
            p.equip.offhand = { type: 'flashlight', count: 1 }
            p.flashlight = true
            this.syncPassives()
            audio.pickup()
            this.msg('拾取 手电筒——已自动装到【副手】。', 'loot')
            this.emit({ kind: 'toast', text: '+1 手电筒（副手）' })
            break
          }
          const n = bi.count ?? 1 // 整叠丢弃的地面物品带堆叠数量
          let got = 0
          for (let k = 0; k < n; k++) if (this.addItem(bi.type)) got++
          if (got > 0) {
            if (got >= n) {
              m.items = m.items.filter((i) => i !== bi)
              if (m.inf) m.inf.taken.add(bi.id) // v17：防止窗口重载后物品复活
            } else {
              bi.count = n - got // 背包装不下：剩余的留在原地
              this.msg(`背包已满，${n - got} 个 ${itemName(bi.type)} 留在地上。`, 'system')
            }
            audio.pickup(bi.type === 'tape')
            if (bi.type === 'tape') { p.tapes += got; this.msg(`拾取 磁带（${p.tapes}/${WIN_TAPES}）`, 'lore') }
            this.emit({ kind: 'toast', text: `+${got} ${itemName(bi.type)}` })
          } else this.msg('背包已满。', 'system')
        }
        break
      }
      case 'crate': case 'corpse': case 'car': case 'cabinet': case 'dresser': case 'megcrate':
      case 'locker': case 'toolbox': case 'suitcase': case 'fridge': case 'safebox':
      case 'mailbox': case 'barrel': case 'bookcase': case 'bonepile': case 'campstall':
      case 'elecbox': { // v51：L3 配电箱（统一容器表成员，漏登记会导致显示可交互但按键无响应）
        const kind = t.kind
        // v12：搜索 scanInteract 选中的同一容器（不再是数组序第一个同类容器）
        // v51：容器交互距离 2.8（与 scanInteract 的 2.7 选取门限对齐，不再脱节）
        const s = t.s && t.s.kind === kind && Math.hypot(t.s.x + t.s.w / 2 - p.x, t.s.y + t.s.h / 2 - p.y) < 2.8 ? t.s : null
        if (!s) return
        // v18：空容器直接提示（不出面板、不出进度条）
        const leftover = s.data?.lootItems as string[] | undefined
        if (s.looted || (s.data?.searched && (!leftover || leftover.length === 0))) {
          s.looted = true
          this.msg('容器是空的。', 'system')
          return
        }
        if (!s.data?.sid) s.data = { ...s.data, sid: Math.floor(Math.random() * 1e9) }
        const C = CONTAINERS[kind] ?? CONTAINERS.crate
        const label = C.label
        // v18：已搜索过且仍有剩余物品 → 免进度条，直接打开面板显示之前没拿完的物品
        if (s.data?.searched && leftover && leftover.length > 0) {
          this.lootPanel = { sid: s.data.sid as number, label, items: leftover }
          audio.searchDone()
          this.emit({ kind: 'lootpanel' })
          return
        }
        if (C.gate === 'carkey' && !this.hasPocket('carkey')) { this.msg('后备箱锁着，需要车钥匙（放在口袋栏生效）。', 'system'); return }
        if (C.gate === 'crowbar' && !this.hasItem('crowbar')) { this.msg('转盘锁纹丝不动。得用撬棍撬铰链。', 'system'); return }
        if (kind === 'crate' && !this.hasItem('crowbar') && Math.random() < 0.5) { this.msg('箱子钉死了，也许需要撬棍。', 'system'); return }
        // v18：首次搜索——内容物在搜索发起时生成并持久（即使中断重搜也不刷新）
        if (!Array.isArray(s.data?.lootItems)) s.data = { ...s.data, lootItems: this.rollLoot(kind) }
        this.searching = { sid: s.data.sid as number, t: 0, dur: C.dur, label }
        audio.searchStart()
        this.noiseEvent(p.x, p.y, 6, false) // 翻找容器的声音会被听见（肢团）
        break
      }
      // ============ v23：新层级的可交互物 ============
      case 'lightswitch': {
        // Wikidot Level 6「世界最安静的房间」：那个人声称找到了电灯开关，会不断恳求来访者去拨动它。
        // 官方警告只有一句：不要拨。
        const s = t.s
        if (!s) return
        if (s.data?.flipped) { this.msg('开关已经在另一侧了。什么也没有发生过。', 'system'); return }
        s.data = { ...s.data, flipped: 1 }
        audio.uiTick()
        this.msg('你拨动了开关。', 'system')
        this.msg('……什么都没有亮起来。但走廊里所有的声音，在这一瞬间同时停了。', 'damage')
        p.sanity = Math.max(0, p.sanity - 22)
        this.emit({ kind: 'sanityhit' })
        // 拨开关会把本层所有「模仿者」引到你这里——它们一直在等有人拨它
        for (const e of m.entities) if (!e.dead && e.def.type === 'mimicry') { e.state = 'chase'; e.targetX = p.x; e.targetY = p.y }
        audio.aggro()
        break
      }
      case 'roadsign': {
        const ex = this.nearestExit()
        const R = DECOR_VIEWS.roadsign.msgs!
        this.msg(R[0].text, R[0].type)
        if (ex) { for (const e2 of m.exits) e2.discovered = true; this.msg(R[1].text, R[1].type) }
        audio.uiTick()
        break
      }
      case 'braille': {
        this.msg(`指尖摸到一行刻痕：${BRAILLE_MARKS[Math.floor(Math.random() * BRAILLE_MARKS.length)]}`, 'lore')
        p.sanity = Math.min(100, p.sanity + DECOR_VIEWS.braille.sanity)
        audio.uiTick()
        break
      }
      case 'arcadecab': {
        // Wikidot Level 11：位置不合常理的街机柜——任何交互都会把你送去 Level 25
        this.msg('屏幕亮了。它没有投币口，但它开始运行了。', 'lore')
        const ad = Math.floor(Math.random() * NORMAL_LEVELS)
        this.transition = { anim: 'glitch', t: 0, dest: ad }
        this.emit({ kind: 'transition', anim: 'glitch', cutIn: levelDefOf(ad)?.entryAnim, dest: ad })
        break
      }
      case 'endletters': {
        for (const dm of DECOR_VIEWS.endletters.msgs!) this.msg(dm.text, dm.type)
        p.sanity = Math.max(0, p.sanity + DECOR_VIEWS.endletters.sanity)
        break
      }
      case 'clipfuse': {
        for (const dm of DECOR_VIEWS.clipfuse.msgs!) this.msg(dm.text, dm.type)
        p.sanity = Math.max(0, p.sanity + DECOR_VIEWS.clipfuse.sanity)
        this.emit({ kind: 'sanityhit' })
        break
      }
      case 'statue': {
        // v51：L3 铁栅栏后的风化希腊女像（纯氛围查看，同 clipfuse/endletters 惯例）
        for (const dm of DECOR_VIEWS.statue.msgs!) this.msg(dm.text, dm.type)
        p.sanity = Math.max(0, p.sanity + DECOR_VIEWS.statue.sanity)
        this.emit({ kind: 'sanityhit' })
        break
      }
      case 'handspike': {
        for (const dm of DECOR_VIEWS.handspike.msgs!) this.msg(dm.text, dm.type)
        p.sanity = Math.max(0, p.sanity + DECOR_VIEWS.handspike.sanity)
        break
      }
      case 'hoteldoor': {
        // v12：开/关/撬 scanInteract 选中的同一扇门（根因修复：旧版按数组序找第一扇门，
        // 上锁门与普通门相邻时提示「打开 房门」却触发上锁门）
        const s = t.s && t.s.kind === 'hoteldoor' && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
        if (!s) return
        if (s.data?.sealed) {
          // v41：L2 特殊锁死门——撬棍/万能钥匙/斧头全部无效（锁的结构闻所未闻）
          this.msg('这扇门纹丝不动，锁的结构闻所未闻。', 'system')
          audio.uiTick()
          return
        }
        if (s.data?.locked) {
          if (this.hasItem('axe') && this.axeDur > 0) {
            // v32：斧头破门——消耗 1 点耐久（共 5 点，耗尽斧头报废）
            this.axeDur--
            s.data = { ...s.data, locked: 0, open: 1 }
            s.solid = false
            audio.hit()
            this.noiseEvent(p.x, p.y, 16, true) // 破门巨响引来实体
            if (this.axeDur <= 0) {
              this.consumeItem('axe')
              this.axeDur = this.hasItem('axe') ? 5 : 0
              this.msg('你一斧劈开了门锁——斧刃崩断，斧头报废了！', 'damage')
            } else {
              this.msg(`你一斧劈开了门锁！（斧头耐久剩余 ${this.axeDur}）`, 'system')
            }
          } else if (this.hasPocket('skeleton')) {
            s.data = { ...s.data, locked: 0, open: 1 }
            s.solid = false
            this.msg('黄铜万能钥匙转了一圈——锁开了。', 'loot')
            audio.pickup()
          } else if (this.hasItem('crowbar')) {
            s.data = { ...s.data, locked: 0, open: 1 }
            s.solid = false
            this.msg('你用撬棍猛地撬开了门锁，巨响在走廊里回荡。', 'system')
            audio.hit()
            this.noiseEvent(p.x, p.y, 14, true) // 撬锁巨响引来实体
          } else {
            this.msg('门锁死了。需要撬棍撬开，或一把万能钥匙。', 'system')
          }
          return
        }
        const open = s.data?.open ? 0 : 1
        s.data = { ...s.data, open }
        s.solid = !open
        if (!open) {
          // v41：关门时玩家站在门洞——把玩家推到最近的可走一侧（否则嵌进实心门体卡死）
          const m = this.map!
          const r = PLAYER_RADIUS
          if (p.x > s.x - r && p.x < s.x + s.w + r && p.y > s.y - r && p.y < s.y + s.h + r) {
            const f = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
            const ax = Math.floor(s.x + s.w / 2), ay = Math.floor(s.y + s.h / 2)
            const alongY = !f(ax - 1, ay) && !f(ax + 1, ay) // 门两侧是墙 ⇒ 通行沿 y 轴
            const cand = alongY
              ? [{ x: p.x, y: s.y - r - 0.12 }, { x: p.x, y: s.y + s.h + r + 0.12 }]
              : [{ x: s.x - r - 0.12, y: p.y }, { x: s.x + s.w + r + 0.12, y: p.y }]
            const ok = (c: { x: number; y: number }) => canOccupy(m, c.x, c.y, r, { z: p.z, crouch: p.crouching })
            const d0 = Math.hypot(cand[0].x - p.x, cand[0].y - p.y)
            const d1 = Math.hypot(cand[1].x - p.x, cand[1].y - p.y)
            const [near, far] = d0 <= d1 ? [cand[0], cand[1]] : [cand[1], cand[0]]
            if (ok(near)) { p.x = near.x; p.y = near.y }
            else if (ok(far)) { p.x = far.x; p.y = far.y }
          }
        }
        this.msg(open ? '门吱呀一声开了。' : '你轻轻带上了门。', 'system')
        audio.uiTick()
        break
      }
      case 'lift': {
        // v13：电梯——交互后轿厢垂直送达另一层（脚本化乘降，期间锁定移动）
        const s = t.s && t.s.kind === 'lift' && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
        if (!s || this.ride) return
        const from = bandOfZ(p.z) === 1 ? FLOOR_H : 0
        const to = from === 0 ? FLOOR_H : 0
        p.x = s.x + 0.5; p.y = s.y + 0.5 // 走进轿厢
        this.ride = { sx: p.x, sy: p.y, from, to, t: 0 }
        audio.uiTick()
        this.msg(to > 0 ? '电梯抖动了一下，缓缓上升……' : '电梯抖动了一下，缓缓下降……', 'system')
        break
      }
      case 'rollerdoor': case 'glassdoor': {
        const s = t.s && t.s.kind === t.kind && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
        if (!s) return
        if (t.kind === 'rollerdoor' && s.data?.locked) {
          this.msg('卷帘门锁死了，纹丝不动。门缝里黑漆漆的，看不清里面堆了什么。', 'system')
          break
        }
        const open = s.data?.open ? 0 : 1
        s.data = { ...s.data, open }
        s.solid = !open
        this.msg(
          open
            ? t.kind === 'rollerdoor' ? '卷帘门哗啦一声升起，室外的空气涌了进来。' : '玻璃门无声滑开。'
            : t.kind === 'rollerdoor' ? '卷帘门哐当落下。' : '玻璃门合上了。',
          'system',
        )
        audio.uiTick()
        break
      }
      case 'inkdoor': {
        // 维护通廊墨黑色金属门（横跨 2 格门洞，交互开/关；关门时实心阻挡）
        const s = t.s && t.s.kind === 'inkdoor' && Math.hypot(t.s.x + t.s.w / 2 - p.x, t.s.y + t.s.h / 2 - p.y) < 2.6 ? t.s : null
        if (!s) return
        const open = s.data?.open ? 0 : 1
        s.data = { ...s.data, open }
        s.solid = !open
        this.msg(open ? '墨黑色金属门吱呀一声开了——门后是一片晃眼的白。' : '你带上了墨黑色金属门。', 'system')
        audio.uiTick()
        break
      }
      case 'bargate': {
        // v51：L3 铁栅栏门（交互开/关；关门时实心阻挡，玩家站门洞则推到最近可走一侧——同 hoteldoor）
        const s = t.s && t.s.kind === 'bargate' && Math.hypot(t.s.x + t.s.w / 2 - p.x, t.s.y + t.s.h / 2 - p.y) < 2.6 ? t.s : null
        if (!s) return
        const open = s.data?.open ? 0 : 1
        s.data = { ...s.data, open }
        s.solid = !open
        if (!open) {
          const m = this.map!
          const r = PLAYER_RADIUS
          if (p.x > s.x - r && p.x < s.x + s.w + r && p.y > s.y - r && p.y < s.y + s.h + r) {
            const f = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
            const ax = Math.floor(s.x + s.w / 2), ay = Math.floor(s.y + s.h / 2)
            const alongY = !f(ax - 1, ay) && !f(ax + 1, ay) // 门两侧是墙 ⇒ 通行沿 y 轴
            const cand = alongY
              ? [{ x: p.x, y: s.y - r - 0.12 }, { x: p.x, y: s.y + s.h + r + 0.12 }]
              : [{ x: s.x - r - 0.12, y: p.y }, { x: s.x + s.w + r + 0.12, y: p.y }]
            const ok = (c: { x: number; y: number }) => canOccupy(m, c.x, c.y, r, { z: p.z, crouch: p.crouching })
            const d0 = Math.hypot(cand[0].x - p.x, cand[0].y - p.y)
            const d1 = Math.hypot(cand[1].x - p.x, cand[1].y - p.y)
            const [near, far] = d0 <= d1 ? [cand[0], cand[1]] : [cand[1], cand[0]]
            if (ok(near)) { p.x = near.x; p.y = near.y }
            else if (ok(far)) { p.x = far.x; p.y = far.y }
          }
        }
        this.msg(open ? '栅栏门哐当一声开了。' : '你带上了栅栏门，铁栏撞出一声闷响。', 'system')
        audio.uiTick()
        break
      }
      case 'megdoc': {
        // M.E.G. 文档：打开文档视图（App 侧记录到图鉴「文档」分类）
        const s = t.s && t.s.kind === 'megdoc' ? t.s : null
        if (!s) return
        audio.pickup()
        this.emit({ kind: 'doc', text: (s.data?.doc as string) ?? 'meg_levels' })
        break
      }
      case 'landmark': {
        // v35：定居点地标——打开地标卡（据点介绍 + 前往/离开）
        const s = t.s && t.s.kind === 'landmark' ? t.s : null
        if (!s) return
        audio.uiTick()
        this.emit({ kind: 'landmark', text: (s.data?.outpost as string) ?? 'alpha' })
        break
      }
      case 'npc': {
        // v35：与 NPC 交谈（App 打开对话窗并记录图鉴「NPC」分类）
        const n = t.npc
        if (!n) return
        // NPC 转身面向玩家（v39：工作循环的 BRC 员工不转身——他们从不停手）
        if (!n.def.workLoop) n.facing = Math.atan2(p.y - n.y, p.x - n.x)
        audio.uiTick()
        this.emit({ kind: 'dialog', text: n.id })
        break
      }
      case 'jerry': {
        // v45：接触杰瑞——声望 +5（每次）+ 教化 +25 + 触发诵咏（驯服后不再积累教化）
        this.contactJerry(t.ent)
        break
      }
      case 'vendingmachine': {
        // v51：人制品售货机——背面看标语（此后背对它即激活）；正面取一份人制品
        const e = t.ent
        if (!e || e.dead || e.def.type !== 'vendingmachine') return
        if (t.vmBack) {
          this.msg('人制品售货机 · 艾里克家族出品 ——「它于人人，人人为它，它为人人。」· 2019，亚利桑那', 'lore')
          e.activated = true // 标记：玩家已看过背面——背对它时激活
          this.msg('看完最好也别背对它。', 'system')
        } else {
          this.msg('格子里的金属线没有转动——一只白骨化的人手把产品推到了取货口。（获得 人制品 ×1）', 'lore')
          if (!this.addItem('manmade')) this.msg('背包已满，取不走这份产品。', 'system')
        }
        break
      }
      case 'glasswin': {
        const lvl = p.level
        this.msg(lvl === 4 ? GLASSWIN_TEXT.l4 : GLASSWIN_TEXT.other, 'lore')
        p.sanity = Math.min(100, p.sanity + DECOR_VIEWS.glasswin.sanity)
        break
      }
      case 'windowtrap': {
        const s = t.s && t.s.kind === 'windowtrap' ? t.s : null
        if (!s || s.data?.triggered) { this.msg('玻璃后面只剩黑暗。', 'system'); return }
        s.data = { ...s.data, triggered: 1 }
        p.sanity = Math.max(0, p.sanity - 14)
        this.emit({ kind: 'sanityhit' })
        this.camShake = Math.min(1, this.camShake + 0.4)
        this.msg('你凑近那扇没涂黑的窗户——里面的「房间」转过头来看你。（理智-14）', 'damage')
        audio.aggro()
        this.noiseEvent(p.x, p.y, 12, true)
        break
      }
      case 'windowblack': {
        for (const dm of DECOR_VIEWS.windowblack.msgs!) this.msg(dm.text, dm.type)
        p.sanity = Math.min(100, p.sanity + DECOR_VIEWS.windowblack.sanity)
        break
      }
      case 'graffiti': {
        // v17：变体房间专属 lore（涂鸦/文档，按 data.loreKind；同处再读顺延下一条）
        const s2g = t.s && t.s.kind === 'graffiti' ? t.s : null
        const loreKind = s2g?.data?.loreKind as string | undefined
        if (loreKind && GRAFFITI_LORE_KIND[loreKind] && s2g) {
          const pool2 = GRAFFITI_LORE_KIND[loreKind]
          const li2 = ((s2g.data?.loreIdx as number | undefined) ?? -1) + 1
          s2g.data = { ...s2g.data, loreIdx: li2 }
          this.msg(pool2[li2 % pool2.length], 'lore')
          p.sanity = Math.min(100, p.sanity + DECOR_VIEWS.graffiti.sanity)
          break
        }
        this.msg(GRAFFITI_LORE[Math.floor(Math.random() * GRAFFITI_LORE.length)], 'lore')
        // 出口方位涂鸦线索（按真实方位生成；v12：用选中的同一涂鸦）
        const s2 = t.s && t.s.kind === 'graffiti' ? t.s : null
        const ex = m.exits[0]
        if (s2 && ex && !s2.data?.readHint) {
          s2.data = { ...s2.data, readHint: 1 }
          const dx = ex.x - s2.x, dy = ex.y - s2.y
          const dir8 = ['东', '东南', '南', '西南', '西', '西北', '北', '东北']
          const idx = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8
          const words = ['出口', '门', '电梯', '楼梯', '通道']
          const w = words[Math.floor(Math.random() * words.length)]
          this.msg(`下面还有一行小字：「${w}在${dir8[idx]}边，别回头。」`, 'lore')
        }
        p.sanity = Math.min(100, p.sanity + DECOR_VIEWS.graffiti.sanity)
        break
      }
      case 'valve': {
        const s = t.s && t.s.kind === 'valve' && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
        if (!s) return
        if (s.data?.on && !p.hasGloves && !this.hasItem('wrench')) {
          p.hp -= 6; this.emit({ kind: 'damage' })
          this.msg('阀门烫得吓人！你需要扳手或隔热手套。', 'damage')
          if (p.hp <= 0) this.die('被阀门烫死了')
          return
        }
        s.data = { ...s.data, on: s.data?.on ? 0 : 1 }
        this.msg(s.data.on ? '蒸汽喷涌而出。' : '蒸汽阀门关上了。', 'system')
        audio.uiTick()
        break
      }
      case 'lever': {
        p.leverPulled = true
        this.msg('电源拉杆已扳下。货运电梯恢复供电！', 'loot')
        audio.pickup()
        break
      }
      case 'server': {
        if (this.hasPocket('keycard')) {
          const s = t.s && t.s.kind === 'server' && t.s.locked ? t.s : m.structures.find((x) => x.kind === 'server' && x.locked)
          if (s) { s.locked = false; s.solid = false; this.msg('服务器机房解锁了。里面有些设备。', 'loot'); this.addItem('battery'); this.addItem('capacitor') }
        } else this.msg('需要门禁卡（放在口袋栏生效）。', 'system')
        break
      }
      case 'vending': {
        if (p.tapes > 0 && this.consumeItem('tape')) {
          p.tapes--
          this.addItem('coffee'); this.addItem('canned')
          this.msg('售货机吞下一盘磁带，吐出了咖啡和罐头。（公平交易？）', 'lore')
        } else this.msg('售货机上贴着字条：「只收磁带」。', 'system')
        break
      }
      case 'frontdesk': {
        if (this.hasItem('silverware') && this.consumeItem('silverware')) {
          this.addItem('sedative'); this.addItem('almond')
          this.msg('前台铃铛自己响了。托盘上多了些东西。', 'lore')
        } else { p.sanity = Math.min(100, p.sanity + 10); this.msg('前台空无一人，但你觉得安全了一些。（理智+10）', 'lore') }
        break
      }
    }
  }

  // ---------- 容器搜索 / 战利品面板 ----------
  // v18：内容物生成（首次搜索发起时调用一次，结果持久在结构 data.lootItems 上）
  private rollLoot(kind: string): string[] {
    const p = this.player
    const C = CONTAINERS[kind] ?? CONTAINERS.crate
    // 本层独有物品也可能出现在容器里（容器化掉落的核心：补给不再只躺在地上）
    const levelUnique = this.levelDef.items.map((it) => it.type)
    const loot = [...C.pool, ...levelUnique]
    const lucky = p.hasRabbit
    const n = C.n + (lucky && Math.random() < 0.4 ? 1 : 0)
    const items: string[] = []
    for (let i = 0; i < n; i++) {
      const cap = lucky ? loot.length : loot.length - 1 // 非幸运不出磁带
      items.push(loot[Math.floor(Math.random() * cap)])
    }
    // v32：小概率稀有掉落（表在 containers.ts；onceOwned=玩家已拥有一个后不再生成）
    for (const r of CONTAINER_RARE[kind] ?? []) {
      if (Math.random() >= r.p) continue
      if (r.onceOwned && this.hasItem(r.type)) continue
      items.push(r.type)
    }
    // v32：腰果水 1/10 概率替代杏仁水（开局势能物资不受影响——那部分不走生成器）
    return items.map((t) => (t === 'almond' && Math.random() < 0.1 ? 'cashew' : t))
  }

  // 搜索进度完成：打开面板，内容 = 结构上持久的物品数组（拿取即同步容器剩余）
  private finishSearch(s: import('./types').Structure) {
    s.data = { ...s.data, opened: 1, searched: 1 }
    const items = (s.data.lootItems as string[] | undefined) ?? []
    const kind = s.kind
    const label = CONTAINERS[kind]?.label ?? '容器'
    if (items.length === 0) {
      s.looted = true
      this.msg('容器是空的。', 'system')
      return
    }
    this.lootPanel = { sid: s.data!.sid as number, label, items }
    audio.searchDone()
    this.emit({ kind: 'lootpanel' })
  }

  // 从战利品面板拿取一件（返回 false=背包满）
  takeLoot(i: number): boolean {
    const lp = this.lootPanel
    if (!lp) return false
    const type = lp.items[i]
    if (!type) return false
    if (!this.addItem(type)) { this.msg('背包已满。', 'system'); return false }
    lp.items.splice(i, 1)
    audio.pickup(type === 'tape')
    this.emit({ kind: 'toast', text: `+1 ${itemName(type)}` })
    if (type === 'tape') { this.player.tapes++; this.msg(`找到 磁带（${this.player.tapes}/${WIN_TAPES}）`, 'lore') }
    this.afterLootChange()
    return true
  }

  takeAllLoot() {
    const lp = this.lootPanel
    if (!lp) return
    let i = 0
    while (lp.items.length && i++ < 20) {
      if (!this.takeLoot(0)) break
    }
  }

  closeLootPanel() {
    this.afterLootChange()
    this.lootPanel = null
  }

  private afterLootChange() {
    const lp = this.lootPanel
    if (lp && lp.items.length === 0) {
      // 容器搜空：状态可见
      const s = this.map?.structures.find((x) => x.data?.sid === lp.sid)
      if (s) s.looted = true
    }
  }

  private takeExit(def: ExitDef) {
    const p = this.player
    // v45：Level 274 教化规则——教化满（≥100）成为信众一员：无法主动离开（开发者传送除外）；
    // 未满时主动离开 → jerry 声望 -5；有进行中的传教委托（v47 标准委托化）离开不受声望惩罚
    if (p.level === 274 && def.dest === 'back') {
      if (this.indoctrination >= 100) {
        this.msg('你属于这里。鹉主还需要你。', 'lore')
        audio.uiTick()
        return
      }
      if (this.quests.some((q) => q.def.kind === 'preach' && !q.done)) this.msg('你肩负传教使命离开圣地——鹉主允许你为祂远行。（免于声望惩罚）', 'system')
      else {
        this.changeRep('jerry', -5)
        this.msg('你转身离开了圣地。信众的目光在你背后发凉。（杰瑞的信众 声望 -5）', 'damage')
      }
    }
    if (def.req) {
      if (def.req.tapes && p.tapes < def.req.tapes) {
        this.msg(`${def.name}没有反应。${def.reqText ?? ''}（当前 ${p.tapes}/${def.req.tapes}）`, 'system')
        return
      }
      // v23：Level 7 的木门在水下 150 米——没有绳索，下得去也上不来
      if (def.req.rope && !this.hasPocket('rope') && !this.hasItem('rope')) {
        this.msg(`${def.reqText ?? '需要一卷绳索。'}`, 'system')
        return
      }
      if (def.req.fuses) {
        let cnt = this.countItem('fuse')
        if (cnt < def.req.fuses) { this.msg(`电梯井没有反应。${def.reqText}（当前 ${cnt}/${def.req.fuses}）`, 'system'); return }
        for (let i = 0; i < def.req.fuses; i++) this.consumeItem('fuse')
      }
      if (def.req.keycard && !this.hasPocket('keycard')) { this.msg(`门锁红灯闪烁。${def.reqText}（门禁卡需放在口袋栏）`, 'system'); return }
      if (def.req.lever && !p.leverPulled) { this.msg(`电梯没有电。${def.reqText}（找找收费亭）`, 'system'); return }
    }
    // v23：Level 601「The End」——它会为闯入者制造个人化的假现实，让人以为自己已经安全到家
    if (def.kind === 'homedoor') {
      this.fakeEnds++
      const lines = [
        ['你推开门。玄关的灯是开着的，鞋摆得整整齐齐，钥匙在门口的小碟子里。', '你在图书馆的地板上醒来。手里攥着一把不属于任何一扇门的钥匙。'],
        ['厨房有饭的香味。有人在里面喊你的名字，用的是你最熟悉的那个称呼。', '你在同一排书架之间醒来。金属字母还在那儿：the end is near。'],
        ['这一次你没有回头。你走过玄关，走过走廊，走到了自己的房门口——', '门后面是图书馆。你数过了：你家的走廊没有这么长。'],
      ]
      const L = lines[Math.min(this.fakeEnds - 1, lines.length - 1)]
      this.msg(L[0], 'lore')
      this.msg(L[1], 'damage')
      p.sanity = Math.max(0, p.sanity - 18)
      this.emit({ kind: 'sanityhit' })
      if (this.fakeEnds >= 2) this.msg('中央那排金属字母底下还有一扇门。没有装饰，也没有灯。', 'system')
      audio.pickup()
      this.transition = { anim: 'bloom', t: 0, dest: def.dest as number } // homedoor 的 dest 恒为数字（Level 601 假门循环）
      this.emit({ kind: 'transition', anim: 'bloom' })
      return
    }
    audio.pickup()
    // v29：经 L0「向下的灰色阶梯」下行 → 在 L1 出生点附近生成返程阶梯
    if (def.kind === 'graystairs' && def.dest === 1) this.arriveStairs = true
    // v51：乘电梯 → 抵达层出生点改到该层电梯旁（L3↔L4/L5 双向）
    if (def.kind === 'elevatorshaft') this.arriveElevator = true
    // v23：立刻解析 random 目标——过场演出需要知道「切入」的是哪一层
    // v35：'back' 解析为进入据点前的层级（据点入口的返程）
    const resolved = def.dest === 'back' ? (this.outpostReturn ?? 1) : def.dest
    const dest: number | 'win' = resolved === 'random' ? Math.floor(Math.random() * NORMAL_LEVELS) : resolved
    if (def.dest === 'back') this.outpostReturn = null // 返程后清空（下次进据点重新记录）
    const cutIn = dest === 'win' ? undefined : (def.cutIn ?? levelDefOf(dest)?.entryAnim)
    this.transition = { anim: def.anim, t: 0, dest, fallDamage: def.fallDamage }
    this.emit({ kind: 'transition', anim: def.anim, fallDamage: def.fallDamage, cutIn, dest })
  }

  // ---------- v29：可行走灰色阶梯（走下去→L1 / 走上去→L0，自动换层，无需按 E）----------
  private updateStairs(dt: number) {
    const m = this.map, p = this.player
    this.onStairs = false
    if (!m || this.transition || this.ride || this.climb) return
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.tiles[y * m.w + x])
    for (const e of m.exits) {
      const up = e.def.kind === 'graystairsup'
      if (!up && e.def.kind !== 'graystairs') continue
      const tx = Math.floor(e.x), ty = Math.floor(e.y)
      // 阶梯走向 = 邻墙且反侧 4 格畅通（地板且无实心结构；优先级同渲染层 orientStairs；兜底取第一面墙）
      let dx = 0, dy = 0
      const solidAtT = (x: number, y: number) => m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
      const sides: [number, number][] = []
      for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (at(tx + wx, ty + wy) === 1) continue
        sides.push([wx, wy])
        let clear = true
        for (let k = 1; k <= 4; k++) if (at(tx - wx * k, ty - wy * k) !== 1 || solidAtT(tx - wx * k, ty - wy * k)) { clear = false; break }
        if (clear) { dx = -wx; dy = -wy; break }
      }
      if (!dx && !dy) {
        if (!sides.length) continue
        dx = -sides[0][0]; dy = -sides[0][1]
      }
      const cx = tx + 0.5, cy = ty + 0.5
      const s = (p.x - cx) * dx + (p.y - cy) * dy // 沿走向距离（入口≈0，深入为正）
      const latS = (p.x - cx) * dy - (p.y - cy) * dx // 横向偏移（带符号）
      if (s < -0.8 || s > 3.1 || Math.abs(latS) > 1.0) continue
      this.onStairs = true // 碰撞 z 按地面处理、跳过重力贴地（本帧由这里接管垂直位置）
      // 在阶梯上：高度沿走向绑定（下行 -3.2m / 上行 +3.2m，坡道与可见踏步严格一致），横向限位防跌落
      const t = Math.max(0, Math.min(1, s / 2.6))
      const targetZ = (up ? 3.2 : -3.2) * t
      p.z += (targetZ - p.z) * Math.min(1, dt * 12)
      p.vz = 0
      // v29a 碰撞修正：横向限位对齐护栏碰撞盒——护栏内沿 |lat|=0.56，减去玩家半径 0.32 → 0.24
      // （旧值 0.55 让玩家身体直接穿进护栏模型）；入口处（s≤0.4，脚底未低于地面）保持开阔不夹挤
      const latLimit = s > 0.4 ? 0.24 : 0.55
      if (s > -0.1 && Math.abs(latS) > latLimit) {
        const over = Math.abs(latS) - latLimit, sgn = latS > 0 ? 1 : -1
        p.x -= dy * over * sgn
        p.y += dx * over * sgn
      }
      if (t >= 0.93) this.takeExit(e.def) // 走到尽头：自动换层
      return // 同帧只处理一个阶梯
    }
  }

  // v29：在 L1 出生点附近放置返程「向上的灰色阶梯」（邻墙地板格，就近搜索）
  private placeBonusStairs() {
    const m = this.map!, inf = m.inf!, W = m.w
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= W ? 0 : m.tiles[y * W + x])
    const solidAt = (x: number, y: number) => m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    // 可行走阶梯：走向需 4 格畅通（地板且无实心结构）
    const runOk = (x: number, y: number) => {
      for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (at(x + wx, y + wy) === 1) continue
        let clear = true
        for (let k = 1; k <= 4; k++) if (at(x - wx * k, y - wy * k) !== 1 || solidAt(x - wx * k, y - wy * k)) { clear = false; break }
        if (clear) return true
      }
      return false
    }
    for (let r = 1; r <= 6; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.floor(m.spawn.x) + dx, y = Math.floor(m.spawn.y) + dy
          if (x < 1 || y < 1 || x >= W - 1 || y >= W - 1) continue
          if (m.tiles[y * W + x] !== 1 || !runOk(x, y)) continue
          if (m.tiles[y * W + x + 1] === 1 && m.tiles[y * W + x - 1] === 1 && m.tiles[(y + 1) * W + x] === 1 && m.tiles[(y - 1) * W + x] === 1) continue // 需邻墙
          const def: ExitDef = { kind: 'graystairsup', name: '向上的灰色阶梯', dest: 0, anim: 'bloom' }
          this.bonusExit = { def, wx: inf.ox + x, wy: inf.oy + y }
          const exit: ExitInstance = { def, x, y, discovered: true }
          m.exits.push(exit)
          // 渲染层按 chunk 出口列表构建网格——必须同步进所属 LiveChunk 才会被渲染
          const c = inf.chunks.get(chunkKey(Math.floor((inf.ox + x) / CS), Math.floor((inf.oy + y) / CS)))
          c?.exits.push(exit)
          this.msg('不远处有一段向上的灰色阶梯——可以循原路返回 Level 0。', 'lore')
          return
        }
  }

  // ---------- 背包 ----------
  addItem(type: string): boolean {
    const p = this.player
    const def = ITEMS[type]
    const tag = type === 'warpberry' ? p.level : undefined // 迁跃浆果：获得时打上当前层级标签
    const all = [...p.hotbar, ...p.backpack]
    let ok = false
    for (const s of all) if (!ok && s && s.type === type && s.tag === tag && s.count < def.stack) { s.count++; ok = true }
    for (let i = 0; !ok && i < p.hotbar.length; i++) if (!p.hotbar[i]) { p.hotbar[i] = { type, count: 1, ...(tag !== undefined ? { tag } : {}) }; ok = true }
    for (let i = 0; !ok && i < p.backpack.length; i++) if (!p.backpack[i]) { p.backpack[i] = { type, count: 1, ...(tag !== undefined ? { tag } : {}) }; ok = true }
    if (ok) {
      this.syncPassives()
      // v32：迁跃浆果——首次获得时记录所在层级（旧存档无标签浆果的回退传送目标；新档按格子标签传送）
      if (type === 'warpberry' && this.warpBerryLevel === null) this.warpBerryLevel = p.level
      // v32：斧头——获得时重置耐久（5 点，破门消耗）
      if (type === 'axe' && this.axeDur <= 0) this.axeDur = 5
    }
    return ok
  }
  hasItem(type: string): boolean { return this.countItem(type) > 0 }
  countItem(type: string): number {
    const p = this.player
    return [...p.hotbar, ...p.backpack].reduce((s, sl) => s + (sl && sl.type === type ? sl.count : 0), 0)
  }
  consumeItem(type: string): boolean {
    const p = this.player
    for (const arr of [p.hotbar, p.backpack]) {
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i]
        if (s && s.type === type) {
          s.count--
          if (s.count <= 0) arr[i] = null
          this.syncPassives()
          return true
        }
      }
    }
    return false
  }
  useSlot(where: SlotWhere, i: number) {
    const s = this.slotGet({ w: where, i })
    if (!s) return
    const def = ITEMS[s.type]
    // 装备类物品：主手使用无效果 → 提示其作用与应在的装备位
    if (def.equip) {
      const slotName = { offhand: '副手', body: '身体', gloves: '手套', head: '头饰', pocket: '口袋' }[def.equip]
      this.msg(`${def.name} 是装备（${def.passive ?? def.desc}），应放在【${slotName}】栏——在背包中拖拽到对应装备位。`, 'system')
      return
    }
    if (!def.use || def.use === 'none') {
      // v32：笔记本和笔——翻开笔记本（可自由书写，字迹自动保留）
      if (s.type === 'notebook') { this.emit({ kind: 'notebook' }); return }
      // v32：滋水枪——右键/使用 = 把储罐液体对自己喝一口（杏仁水理智+10，腰果水-10，清水无效果）
      if (s.type === 'squirtgun') {
        if (this.squirtAmmo <= 0 || this.squirtTank === 'none') {
          this.msg('储罐是空的——在物品栏选中滋水枪，于右侧信息栏装入液体。', 'system')
          return
        }
        this.squirtAmmo--
        this.attackAnimT = 0.35
        this.attackAnimKind = 'drink' // 举到嘴边的饮用动画
        audio.pickup()
        if (this.squirtTank === 'almond') { this.player.sanity = Math.min(100, this.player.sanity + 10); this.msg('你就着储罐喝了一口杏仁水——甜腻。（理智 +10）', 'loot') }
        else if (this.squirtTank === 'cashew') { this.player.sanity = Math.max(0, this.player.sanity - 10); this.msg('你就着储罐喝了一口腰果水——苦涩烧喉。（理智 -10）', 'damage') }
        else if (this.squirtTank === 'liquidpain') {
          // 液态痛苦（Object 48）：腐蚀性酸液——自饮重创
          this.player.hp = Math.max(1, this.player.hp - 35)
          this.player.sanity = Math.max(0, this.player.sanity - 55)
          this.msg('你就着储罐喝了一口液态痛苦——喉咙和胃像被烧穿了一样。千万别再这么干。（生命 -35 · 理智 -55）', 'damage')
        }
        else this.msg('你就着储罐喝了一口清水。', 'system')
        if (this.squirtAmmo <= 0) { this.squirtTank = 'none'; this.msg('储罐空了。', 'system') }
        return
      }
      this.msg(`${def.name} 无法直接使用。`, 'system')
      return
    }
    const p = this.player
    let noConsume = false // v51：人制品效应拒食——效果门控时不消耗物品
    // v45：对杰瑞给予杏仁水（Level 274 视线内 2.5m）→ 驯服鹉主，而不是自己喝掉
    if (s.type === 'almond' && p.level === 274 && !this.jerryTamed && this.aimJerry()) {
      this.tameJerry()
      return
    }
    switch (def.use) {
      case 'eat': {
        // v51：人制品——5 分钟效应（拒食他物/治疗减半/恒显饥饿特效/体力恢复减半消耗加倍/受伤 -10%）
        if (s.type === 'manmade') {
          this.manmadeT = 300
          p.hunger = Math.min(100, p.hunger + (def.value ?? 15))
          this.msg('甜得发腻，胃里却更空了——你还想要更多。（人制品效应 5 分钟 · 饥饿+15）', 'lore')
          break
        }
        // v51：人制品效应中——拒绝进食其他食物（不消耗物品）
        if (this.manmadeT > 0) {
          this.msg('你的胃拒绝接受别的食物——你满脑子只有那台售货机。（人制品效应）', 'damage')
          noConsume = true
          break
        }
        // v51：Object 5 糖果——统一 饥饿+5 理智+5 + 糖瘾计时 + 各自超自然效果
        if (s.type.startsWith('candy')) {
          p.hunger = Math.min(100, p.hunger + 5)
          p.sanity = Math.min(100, p.sanity + 5)
          this.candyAddictT = 60
          if (s.type === 'candysilver') {
            this.silverTongueT = 300
            this.msg('银舌头在口中化开，一股金属凉意——说话突然顺溜了。（交易 95 折 · 5 分钟 · 饥饿+5 理智+5）', 'lore')
          } else if (s.type === 'candybullet') {
            this.slipperyT = 10
            this.msg('子弹巧克力滑下喉咙——脚底有点抹了油。（脚滑 10 秒 · 饥饿+5 理智+5）', 'lore')
          } else if (s.type === 'candygun') {
            this.gunCandyT = 10
            this.msg('你感觉右手一阵酥麻——它变成了一把枪。（10 秒 · 左键发射巧克力子弹 · 饥饿+5 理智+5）', 'lore')
          } else if (s.type === 'candystanley') {
            this.stanleyTeleport()
          } else if (s.type === 'candywaste') {
            p.hp = Math.max(1, p.hp - 5)
            this.msg('酸！唾液烧得口腔发疼。（生命 -5 · 饥饿+5 理智+5）', 'damage')
          } else if (s.type === 'candygenius') {
            const fact = GENIUS_FACTS[Math.floor(Math.random() * GENIUS_FACTS.length)]
            this.msg(`「${fact}」——你好像知道了什么。（饥饿+5 理智+5）`, 'lore')
          } else {
            this.msg('薄荷混着杏仁的清凉在口中散开——口气清新了。（饥饿+5 理智+5）', 'lore')
          }
          break
        }
        // v50：液态痛苦（Object 48）——饮用 = 腐蚀自身（生命/理智双损）
        if (s.type === 'liquidpain') {
          p.hp = Math.max(1, p.hp - 35)
          p.sanity = Math.max(0, p.sanity - 55)
          this.msg('你喝下了液态痛苦——盐酸般的灼烧从喉咙一路烧进胃里，眼前一阵发黑。（生命 -35 · 理智 -55）', 'damage')
          break
        }
        // v32：皇家口粮——饥饿全满 + 理智下限锁定 + 成瘾机制（可多次食用，逐次加长成瘾）
        if (s.type === 'royalration') {
          p.hunger = 100
          if (this.sanityFloor < 40) {
            this.sanityFloor = 40
            this.msg('甘美难以言喻——你的理智下限仿佛被钉住了。（理智不再跌破 40）', 'lore')
          } else this.msg('甘美依旧，渴求更深了。', 'loot')
          this.royalAddictT += 180
          // 成瘾性触发：概率把余下的皇家口粮全部消耗掉，理智急速下降
          if (Math.random() < 0.25) {
            for (const arr of [p.hotbar, p.backpack])
              for (let i = 0; i < arr.length; i++)
                if (arr[i]?.type === 'royalration') arr[i] = null
            this.royalDrainT = 5
            this.msg('渴求压倒了你——余下的皇家口粮被发疯般全部吃光！理智开始崩塌。', 'damage')
          }
          break
        }
        // 成瘾期间：其他所有食物均不恢复饥饿（仍被吃掉）
        if (this.royalAddictT > 0) {
          this.msg('成瘾发作：其他食物尝起来像灰烬，一点也吃不饱。', 'damage')
          break
        }
        p.hunger = Math.min(100, p.hunger + (def.value ?? 30))
        // v32：迁跃浆果——食用后传送回该颗浆果标签记录的层级（不同标签不混堆）
        if (s.type === 'warpberry') this.warpToBerryLevel(s.tag)
        break
      }
      case 'heal': p.hp = Math.min(100, p.hp + (def.value ?? 30) * (this.manmadeT > 0 ? 0.5 : 1)); break // v51：人制品效应中治疗减半
      case 'cure': {
        // 消毒液：消去疫疾——疫疾尚未实装，无感染时仅作预防性消毒（仍消耗 1 瓶）
        this.msg('你仔细地做了一遍预防性消毒。目前没有感染疫疾。', 'loot')
        break
      }
      case 'sanity': p.sanity = Math.min(100, p.sanity + (def.value ?? 30)); break
      case 'bigsanity': p.sanity = Math.min(100, p.sanity + (def.value ?? 60)); break
      case 'battery': p.battery = Math.min(100, p.battery + (def.value ?? 50)); break
      case 'stamina': p.coffeeT = 60; p.stamina = 100; break
      case 'light': {
        if (this.map) this.map.lights.push({ x: p.x, y: p.y, r: 2.5, color: '#a8e0a0', flickerSeed: Math.random() * 100 })
        break
      }
    }
    audio.pickup()
    this.emit({ kind: 'toast', text: `使用了 ${def.name}` })
    // v35：皇家口粮不是消耗品——使用不会吃掉它（仅「全部吃光」触发时才被消耗）；
    // v51：人制品效应拒食时不消耗
    if (s.type !== 'royalration' && !noConsume) this.consumeItem(s.type)
  }
  // ---------- 粉笔头：在墙上画白色记号 ----------
  /** 手持粉笔头右键：在面前墙上画记号（消耗 1 支；同一墙面不重复消耗） */
  private drawChalk() {
    const p = this.player, m = this.map!
    const ox = m.inf ? m.inf.ox : 0, oy = m.inf ? m.inf.oy : 0
    // 沿朝向由近及远探测墙面
    for (const r of [0.8, 1.2, 1.6]) {
      const tx = Math.floor(p.x + Math.cos(p.facing) * r)
      const ty = Math.floor(p.y + Math.sin(p.facing) * r)
      if (tileAt(m, tx, ty) === 1) continue // 地板，继续往前探
      // 墙面朝向玩家的一侧（4 向：0=+x 1=-x 2=+y 3=-y）
      const dx = p.x - (tx + 0.5), dy = p.y - (ty + 0.5)
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 1) : (dy > 0 ? 2 : 3)
      const wx = ox + tx, wy = oy + ty
      if (this.wallMarks.some((mk) => mk.level === p.level && mk.wx === wx && mk.wy === wy && mk.dir === dir)) {
        this.msg('这面墙上已经有你的记号了。', 'system')
        return
      }
      this.wallMarks.push({ level: p.level, wx, wy, dir })
      if (this.wallMarks.length > 60) this.wallMarks.shift() // 上限 60，丢弃最旧
      const slot = p.hotbar[p.selected]
      if (slot && slot.type === 'chalkstub' && --slot.count <= 0) p.hotbar[p.selected] = null
      audio.uiTick()
      this.msg('你在墙上画下一道白色记号。', 'system')
      return
    }
    this.msg('伸手可及的范围内没有墙——粉笔无处下笔。', 'system')
  }

  // v18：快捷使用当前持有物品（默认鼠标右键，同背包「使用」按钮效果）
  // v23b/v26：主手持**装备类**物品（手电/打火机/手套/服饰/口袋类）按右键 = 直接装入对应装备位
  // （占位则互换——v23b 曾实现后随仓库同步丢失，玩家反馈"没有实现"，此为断链修复）；
  // 武器（撬棍/扳手/木板）本就握在主手，右键提示用法；其余物品 = 使用（吃/喝/治疗…）
  quickUse() {
    const p = this.player
    const s = p.hotbar[p.selected]
    if (!s) return
    const def = ITEMS[s.type]
    if (def?.equip) {
      if (this.equipItem('hotbar', p.selected)) audio.uiTick()
      return
    }
    if (s.type === 'chalkstub') { this.drawChalk(); return }
    if (def?.throw) {
      this.msg(`${def.name} 就握在你手里——左键把它掷出去。`, 'system')
      return
    }
    if (def?.weapon) {
      this.msg(`${def.name} 就握在你手里——左键挥舞攻击（伤害 ${def.weapon}）。`, 'system')
      return
    }
    this.useSlot('hotbar', p.selected)
  }
  // v20：快捷丢弃当前手持物品（默认 Q，整叠丢到脚下地面；空手无效）
  quickDrop() {
    const p = this.player
    if (!p.hotbar[p.selected]) return
    this.dropSlot('hotbar', p.selected)
    audio.uiTick()
  }
  // ---------- 槽位读写（背包格 + 装备位统一）----------
  slotGet(r: SlotRef): InvSlot | null {
    const p = this.player
    if (r.w === 'hotbar') return p.hotbar[r.i] ?? null
    if (r.w === 'backpack') return p.backpack[r.i] ?? null
    if (r.w === 'pocket') return p.equip.pockets[r.i] ?? null
    return p.equip[r.w]
  }
  private slotSet(r: SlotRef, v: InvSlot | null) {
    const p = this.player
    if (r.w === 'hotbar') p.hotbar[r.i] = v
    else if (r.w === 'backpack') p.backpack[r.i] = v
    else if (r.w === 'pocket') p.equip.pockets[r.i] = v
    else p.equip[r.w] = v
  }
  // 口袋中是否有指定物品（钥匙/门禁卡/护符类判定走口袋，不再全背包生效）
  hasPocket(type: string): boolean {
    return this.player.equip.pockets.some((s) => s?.type === type)
  }
  dropSlot(where: SlotWhere, i: number) {
    const p = this.player
    const r = { w: where, i }
    const s = this.slotGet(r)
    if (!s || !this.map) return
    this.map.items.push({ id: Math.random(), type: s.type, count: s.count, x: p.x + 0.3, y: p.y + 0.3 })
    this.slotSet(r, null)
    this.syncPassives()
    this.msg(s.count > 1 ? `丢下了 ${itemName(s.type)} ×${s.count}` : `丢下了 ${itemName(s.type)}`, 'system')
  }
  // 卸下装备位物品到第一个空背包格（背包满则失败）
  unequipSlot(where: SlotWhere, i: number): boolean {
    const r = { w: where, i }
    const s = this.slotGet(r)
    if (!s) return false
    const p = this.player
    const freeHot = p.hotbar.findIndex((x) => !x)
    const freeBack = p.backpack.findIndex((x) => !x)
    if (freeHot < 0 && freeBack < 0) { this.msg('背包已满，无法卸下。', 'system'); return false }
    this.slotSet(r, null)
    if (freeHot >= 0) p.hotbar[freeHot] = s
    else p.backpack[freeBack] = s
    this.syncPassives()
    this.msg(`卸下了 ${itemName(s.type)}`, 'system')
    return true
  }
  // 一键装备：把背包/快捷栏物品放入对应装备位（占位则交换；口袋取第一个空位）
  equipItem(where: SlotWhere, i: number): boolean {
    if (where !== 'hotbar' && where !== 'backpack') return false
    const from = { w: where, i }
    const s = this.slotGet(from)
    if (!s) return false
    const eq = ITEMS[s.type]?.equip
    if (!eq) { this.msg(`${itemName(s.type)} 不是装备。`, 'system'); return false }
    if (eq === 'pocket') {
      // 口袋不允许重复道具（同类护符/钥匙只生效一件，堆叠没有意义）
      if (this.player.equip.pockets.some((x) => x?.type === s.type)) {
        this.msg(`口袋里已经有一件 ${itemName(s.type)} 了。`, 'system')
        return false
      }
      const free = this.player.equip.pockets.findIndex((x) => !x)
      if (free < 0) { this.msg('口袋栏已满。', 'system'); return false }
      return this.moveSlot(from, { w: 'pocket', i: free })
    }
    return this.moveSlot(from, { w: eq, i: 0 })
  }
  // 槽位交换（含装备位；装备位有类型限制，非法交换会被拒绝并提示）
  moveSlot(from: SlotRef, to: SlotRef): boolean {
    if (from.w === to.w && from.i === to.i) return false
    const fs = this.slotGet(from)
    if (!fs) return false
    const ts = this.slotGet(to)
    // v51：同类可堆叠物品拖到同一格——合并为一摞（合计不超过堆叠上限时优先于交换）
    if (ts && ts.type === fs.type && ts.tag === fs.tag) {
      const lim = ITEMS[fs.type]?.stack ?? 1
      if (lim > 1 && fs.count + ts.count <= lim) {
        if (to.w !== 'hotbar' && to.w !== 'backpack') return false // 装备位不合摞
        this.slotSet(to, { ...ts, count: ts.count + fs.count })
        this.slotSet(from, null)
        this.syncPassives()
        return true
      }
    }
    const fits = (r: SlotRef, s: InvSlot | null): boolean => {
      if (!s) return true
      if (r.w === 'hotbar' || r.w === 'backpack') return true
      return ITEMS[s.type]?.equip === (r.w === 'pocket' ? 'pocket' : r.w)
    }
    if (!fits(to, fs) || !fits(from, ts)) {
      const name = to.w === 'offhand' ? '副手' : to.w === 'body' ? '身体' : to.w === 'gloves' ? '手套' : to.w === 'head' ? '头饰' : to.w === 'pocket' ? '口袋' : ''
      if (name) this.msg(`${itemName(fs.type)} 不能放在【${name}】栏。`, 'system')
      return false
    }
    // 口袋不允许重复道具（拖拽换入同样校验）
    if (to.w === 'pocket' && this.player.equip.pockets.some((x, xi) => xi !== to.i && x?.type === fs.type)) {
      this.msg(`口袋里已经有一件 ${itemName(fs.type)} 了。`, 'system')
      return false
    }
    this.slotSet(from, ts)
    this.slotSet(to, fs)
    if (to.w === 'offhand' && fs.type === 'flashlight') this.player.flashlight = true // 装备手电筒即点亮
    if (to.w === 'head' && fs.type === 'headlamp') this.player.flashlight = true // v32：装备头灯即点亮
    this.syncPassives()
    return true
  }
  private syncPassives() {
    const p = this.player
    p.hasGloves = p.equip.gloves?.type === 'gloves'
    p.hasSuit = p.equip.body?.type === 'suit'
    p.hasLighter = p.equip.offhand?.type === 'lighter'
    p.hasRabbit = p.equip.pockets.some((s) => s?.type === 'rabbit')
    // v23 Object 51「Pockets」：背包上限 +4（取下时只收回空出来的格子，不会吞物品）
    p.hasPockets = p.equip.pockets.some((s) => s?.type === 'pockets')
    const wantBag = 16 + (p.hasPockets ? 4 : 0)
    while (p.backpack.length < wantBag) p.backpack.push(null)
    while (p.backpack.length > wantBag && !p.backpack[p.backpack.length - 1]) p.backpack.pop()
    // 照明=副手手电筒 / 头饰头灯：两者皆无则强制关灯（装备/拾取时由对应路径点亮）
    if (p.equip.offhand?.type !== 'flashlight' && p.equip.head?.type !== 'headlamp') p.flashlight = false
  }

  // ---------- 视野 ----------
  private computeVisibility() {
    const m = this.map!, p = this.player
    this.visible.fill(0)
    const r = 8
    const px = Math.floor(p.x), py = Math.floor(p.y)
    for (let y = Math.max(0, py - r); y <= Math.min(m.h - 1, py + r); y++) {
      for (let x = Math.max(0, px - r); x <= Math.min(m.w - 1, px + r); x++) {
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y)
        if (d > r) continue
        if (this.los(p.x, p.y, x + 0.5, y + 0.5)) {
          this.visible[y * m.w + x] = 1
          this.explored[y * m.w + x] = 1
          // 光源照亮额外格
          for (const l of m.lights) {
            if (Math.hypot(l.x - x - 0.5, l.y - y - 0.5) < l.r) this.explored[y * m.w + x] = 1
          }
        }
      }
    }
  }

  get levelDef() { return levelDefOf(this.player.level)! }

  // 开发者模式：层级跳转
  devJump(id: number) {
    if (id < 0 || id >= LEVELS.length || !this.map) return
    this.transition = null
    this.loadLevel(id)
    this.emit({ kind: 'transition', anim: 'intro' })
  }

  /** v35：前往据点（地标弹窗「前往」/DevPanel 据点跳转共用）：记录返程层级后切入 */
  enterOutpost(outpostId: string): boolean {
    const o = OUTPOSTS[outpostId]
    if (!o || !this.map) return false
    // v35：声望过低被其团体禁止进入据点（<=-90）
    const rep = this.rep[o.faction] ?? 0
    if (FACTIONS[o.faction]?.hasRep && rep <= REP_TIER.banned) {
      this.msg(`守卫拦下了你——${FACTIONS[o.faction]!.name}拒绝你进入。（声望 ${rep}）`, 'damage')
      return false
    }
    this.outpostReturn = this.player.level
    this.transition = { anim: 'bloom', t: 0, dest: o.levelId }
    this.emit({ kind: 'transition', anim: 'bloom', cutIn: 'outpost', dest: o.levelId })
    return true
  }
  /** [DEV] 据点跳转（与 enterOutpost 同路径） */
  devJumpOutpost(outpostId: string): boolean {
    const ok = this.enterOutpost(outpostId)
    if (ok) this.msg(`[DEV] 已跳转到据点「${OUTPOSTS[outpostId]?.name}」`, 'system')
    return ok
  }

  // ---------- v35：团体声望与委托任务 ----------
  /** 调整某团体声望（clamp ±100；流浪者等无声望团体直接忽略） */
  changeRep(factionId: string, delta: number) {
    const f = FACTIONS[factionId]
    if (!f?.hasRep || delta === 0) return
    const cur = this.rep[factionId] ?? 0
    const next = Math.max(-100, Math.min(100, cur + delta))
    this.rep[factionId] = next
    this.msg(`与${f.name}的声望 ${cur > 0 ? '+' : ''}${cur} → ${next > 0 ? '+' : ''}${next}`, delta > 0 ? 'loot' : 'damage')
  }

  // ---------- v39：BRC（后室装修公司）模仿装修 / 坦白 ----------
  static readonly BRC_MIMIC_CD = 90 // 模仿装修全局冷却（秒，防连点）
  /** 模仿 BRC 员工的动作进行装修：播放挥臂动画，动作播完 +2 声望；全局冷却 ~90s（冷却中返回 false） */
  mimicBrc(): boolean {
    if (this.brcMimicCd > 0) {
      this.msg(`手臂还酸着——先歇 ${Math.ceil(this.brcMimicCd)} 秒再学。`, 'system')
      return false
    }
    this.brcMimicCd = Engine.BRC_MIMIC_CD
    this.brcMimicPending = 0.9 // 挥臂动画播完结算（引擎主循环倒数）
    this.attackAnimT = 0.5
    this.attackAnimKind = 'swing'
    audio.swing()
    this.msg('你学着他们的动作，对着墙面挥臂敲打起来……', 'system')
    return true
  }

  /** 向 BRC 员工坦白你伤害/杀死了他们的同事：结清未告发记录（伤害 -10/人、杀死 -30/人），
   *  且当前对话的这名员工转为敌对（追击 + 近战；可被反击杀死）。无未告发记录返回 false */
  confessBrc(npcId: string): boolean {
    const n = this.npcs.find((x) => x.id === npcId)
    const { hurt, killed } = this.brcSin
    if (!n || n.def.faction !== 'brc' || n.dead || hurt + killed === 0) return false
    const pen = hurt * 10 + killed * 30
    this.brcSin = { hurt: 0, killed: 0 }
    n.hostile = true
    n.atkT = 0.9 // 坦白后短暂停顿（「困惑与不舒适」），随即追击
    n.bubbleT = 0
    this.changeRep('brc', -pen)
    audio.aggro()
    this.msg(`你坦白了。${n.def.name} 停下手里的活，缓缓转向你——贝雷帽下的黑脸没有任何表情。`, 'damage')
    return true
  }

  // ---------- v45：杰瑞的信众 / Level 274 教化系统 ----------
  /** 视线内 2.5m 内的活体杰瑞实体（接触/驯服判定共用） */
  private aimJerry(): Entity | null {
    const p = this.player
    for (const e of this.map?.entities ?? []) {
      if (e.dead || e.def.type !== 'jerry') continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d <= 2.5 && this.inView(e.x, e.y, 2.5)) return e
    }
    return null
  }

  /** 对话「认同：杰瑞是最伟大的」是否可选（DialogOverlay 显示条件与引擎判定同一口径）：
   *  v48 仅野外信众（L274 内他们已认可你才带你来）；v49 每局仅首次——已宣誓后任何信众处不再出现 */
  canAgreeJerry(npcId: string): boolean {
    const n = this.npcs.find((x) => x.id === npcId)
    return !!n && n.def.faction === 'jerry' && !n.dead && this.player.level !== 274 && !this.jerryOath
  }

  /** 对话「认同：杰瑞是最伟大的」——jerry 声望 +10（v49：每局游戏仅首次有效——宣誓一次，
   *  全鹦鹉门下皆知；之后任何信众处该选项不再出现，引擎层同样拒绝）；
   *  v48：仅野外信众（L2 宣传间）可表达——L274 内的信众已认可你才带你来，不提供认同选项 */
  agreeJerry(npcId: string): boolean {
    const n = this.npcs.find((x) => x.id === npcId)
    if (!n || n.def.faction !== 'jerry' || n.dead) return false
    if (this.player.level === 274) {
      this.msg(`${n.def.name}微笑着按住你的手：「无需多言——你能站在圣地，便是鹉主对你的认可。」`, 'system')
      return false
    }
    if (this.jerryOath) {
      this.msg(`${n.def.name}颔首：「你已宣誓过了，兄弟姐妹——鹉主记得每一句誓言。」（每局仅首次认同有效）`, 'system')
      return false
    }
    this.jerryOath = true
    this.jerryAgreed.add(npcId)
    this.changeRep('jerry', 10)
    this.msg(`${n.def.name}眼中亮起光：「鹉主听见了！欢迎你，兄弟姐妹。」`, 'loot')
    return true
  }

  /** 对话「带我去杰瑞的房间」（表达认同后出现）——jerry 声望 ≥10 才引路，否则拒绝 */
  gotoJerryRoom(npcId: string): boolean {
    const n = this.npcs.find((x) => x.id === npcId)
    if (!n || n.def.faction !== 'jerry' || n.dead) return false
    const rep = this.rep.jerry ?? 0
    if (rep < 10) {
      this.msg(`${n.def.name}摇了摇头：「你还不够虔诚。」（需要杰瑞的信众声望 ≥10，当前 ${rep}）`, 'system')
      return false
    }
    this.outpostReturn = this.player.level
    this.transition = { anim: 'bloom', t: 0, dest: 274 }
    this.emit({ kind: 'transition', anim: 'bloom', cutIn: 'outpost', dest: 274 })
    this.msg(`${n.def.name}虔诚地低下头：「随我来——鹉主在穹顶之下等你。」`, 'lore')
    return true
  }

  /** 对话「非议杰瑞」（作死选项）——jerry 声望 -10（≤-10 时信众立即转敌对） */
  slanderJerry(npcId: string): boolean {
    const n = this.npcs.find((x) => x.id === npcId)
    if (!n || n.def.faction !== 'jerry' || n.dead) return false
    this.changeRep('jerry', -10)
    this.msg(`${n.def.name}的笑容凝固了：「……你刚才，是在非议鹉主吗？」`, 'damage')
    return true
  }

  /** v47：伤害鹉主杰瑞——信众哗然：jerry 声望立即 -50（每次伤害；挥击/投掷波及均走此通道） */
  private hurtJerryRep() {
    this.changeRep('jerry', -50)
    audio.aggro()
    this.msg('你伤害了鹉主——信众哗然！怒喝与哭喊响彻穹顶。（杰瑞的信众 声望 -50）', 'damage')
  }

  /** 接触杰瑞：jerry 声望 +5（每次）+ 教化 +25 + 触发诵咏；驯服后接触不再积累教化；
   *  v47：内置 20s 冷却（防连点刷声望/教化；冷却剩余在 HUD 交互提示显示） */
  contactJerry(ent?: Entity): boolean {
    const p = this.player
    const j = ent && !ent.dead && ent.def.type === 'jerry' && Math.hypot(ent.x - p.x, ent.y - p.y) < 2.6 ? ent : this.aimJerry()
    if (!j) return false
    if (this.jerryContactCd > 0) {
      this.msg(`鹉主刚刚赐福过你——先消化这份恩典。（接触冷却 ${Math.ceil(this.jerryContactCd)}s）`, 'system')
      return false
    }
    this.jerryContactCd = 20
    recordEncounter('jerry')
    audio.pickup()
    this.changeRep('jerry', 5) // 每次接触 +5
    if (this.jerryTamed) {
      this.msg('你抚摸着鹉主的羽毛。它温顺地蹭了蹭你的手——驯服之后，它的凝视不再触及你的灵魂。（声望 +5）', 'loot')
      return true
    }
    const before = this.indoctrination
    this.indoctrination = Math.min(100, this.indoctrination + 25)
    this.msg('你触碰了鹉主。一股温热的蓝意在脑海深处散开——词语开始自己涌上舌尖。（声望 +5 · 教化 +25）', 'lore')
    if (before === 0) this.chantT = 3 // 首次接触后很快开始诵咏
    if (before < 100 && this.indoctrination >= 100)
      this.msg('教化完成了。你望着穹顶下的蓝色身影，忽然明白：你属于这里。鹉主还需要你。', 'lore')
    return true
  }

  /** 驯服：对杰瑞给予杏仁水（消耗 1 瓶）——教化清零且此后接触不再积累；
   *  但若被信众 NPC 看见（~8m 内有信众）→ 视为亵渎：jerry 声望 -10 */
  tameJerry(): boolean {
    if (this.jerryTamed) { this.msg('鹉主已经被你驯服了——它安静地看着你。', 'system'); return false }
    if (!this.aimJerry()) { this.msg('这里没有鹉主的身影。', 'system'); return false }
    if (!this.hasItem('almond')) { this.msg('需要一瓶杏仁水。', 'system'); return false }
    this.consumeItem('almond')
    this.jerryTamed = true
    this.indoctrination = 0
    audio.pickup()
    const p = this.player
    const witnessed = this.npcs.some((n) => !n.dead && n.def.faction === 'jerry' && Math.hypot(n.x - p.x, n.y - p.y) <= 8)
    if (witnessed) {
      // 被信众看见：亵渎
      this.changeRep('jerry', -10)
      audio.aggro()
      this.msg('「亵渎者！！」信众的怒喝响彻穹顶——你当着他们的面驯服了鹉主。（杰瑞的信众 声望 -10）', 'damage')
    } else {
      this.msg('鹉主啄食了杏仁水，满足地抖了抖羽毛。它不再凝视你的灵魂——教化消退了。（教化值清零）', 'loot')
    }
    this.emit({ kind: 'toast', text: '鹉主已被驯服（教化清零）' })
    return true
  }

  /** v47：传教使命已标准委托化（QuestDef kind 'preach'，三选一接取/交付；jerry 声望 ≥30 才显示入口）。
   *  进行中的传教委托（未完成）可让玩家离开 L274 时免于声望惩罚（takeExit）。 */
  preachQuest(): { def: QuestDef; progress: number; baseline: number; done: boolean } | undefined {
    return this.quests.find((q) => q.def.kind === 'preach')
  }

  /** 传教目标是否有效（对话「传教」选项显示条件）：指定据点的任意 NPC / 任意地点的其他团体 NPC */
  preachTargetOk(npcId: string): boolean {
    const q = this.quests.find((q) => q.def.kind === 'preach' && !q.done)
    if (!q) return false
    const def = this.npcs.find((x) => x.id === npcId)?.def ?? NPCS[npcId]
    if (!def || def.faction === 'jerry') return false
    if (this.player.level === OUTPOSTS[q.def.target]?.levelId) return true // 指定据点的任意 NPC
    const f = def.faction ?? 'meg'
    return f !== 'wanderer' && !!FACTIONS[f]?.hasRep // 任意地点的其他团体 NPC
  }

  /** 对目标 NPC 传教——委托目标达成（回 L274 侍立信众处交付领赏）；代价：目标 NPC 所属团体声望 -5（布道惹人嫌） */
  preachTo(npcId: string): boolean {
    const q = this.quests.find((q) => q.def.kind === 'preach' && !q.done)
    if (!q) return false
    const def = this.npcs.find((x) => x.id === npcId)?.def ?? NPCS[npcId]
    if (!def) return false
    if (!this.preachTargetOk(npcId)) { this.msg('他不是合适的传教对象。', 'system'); return false }
    const o = OUTPOSTS[q.def.target]
    q.progress = 1
    q.done = true
    const f = def.faction ?? 'meg'
    if (f !== 'jerry' && FACTIONS[f]?.hasRep) this.changeRep(f, -5)
    else if (o && FACTIONS[o.faction]?.hasRep) this.changeRep(o.faction, -5) // 无团体者：记在其所在据点头上
    audio.pickup()
    this.emit({ kind: 'toast', text: '传教目标达成——回 Level 274 向侍立信众复命' })
    this.msg(`${def.name}礼貌地听你讲完，表情微妙。教义已传播——总会有人记住鹉主之名。`, 'loot')
    this.msg('传教目标达成——回 Level 274 向侍立信众复命，信众自会记你的好。', 'system')
    return true
  }

  /** 三个候选委托（类型/目标互不相同，也不与手上委托重复；供玩家三选一；按发放团体分题库） */
  questOffers(faction: QuestFaction = 'meg'): QuestDef[] {
    // v47：传教使命（jerry）声望 ≥30 才提供（与 DialogOverlay 的入口显示门槛一致）
    if (faction === 'jerry' && (this.rep.jerry ?? 0) < 30) return []
    const out: QuestDef[] = []
    const seen = new Set<string>(this.quests.map((q) => `${q.def.kind}:${q.def.target}`))
    const gen = faction === 'bntg' ? genBntgQuest : faction === 'ariane' ? genArianeQuest : faction === 'jerry' ? genJerryQuest : genQuest
    for (let tries = 0; tries < 40 && out.length < 3; tries++) {
      const def = gen(Math.random)
      const key = `${def.kind}:${def.target}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(def)
    }
    return out
  }

  /** 接取 MEG 委托（探险署；同类同目标不重复；困难任务赠迁跃浆果） */
  acceptQuest(def?: QuestDef): boolean {
    if (this.quests.filter((q) => !q.done).length >= 3) { this.msg('手上的委托太多了——先完成一个再说。', 'system'); return false }
    for (let tries = 0; tries < 8; tries++) {
      const q = def ?? genQuest(Math.random)
      if (this.quests.some((x) => x.def.kind === q.kind && x.def.target === q.target)) {
        if (def) { this.msg('同样的委托已经在手上了。', 'system'); return false }
        continue
      }
      const baseline = q.kind === 'entity' ? (loadSeen()[q.target] ?? 0) : q.unit === 'dist' ? this.player.steps : 0
      // v43：物流委托——接取即得实体「物流包裹」（占背包格；背包满则接取失败）
      if (q.kind === 'deliverGoods' && !this.addItem('parcel')) { this.msg('背包满了，腾不出放包裹的格子。', 'system'); return false }
      this.quests.push({ def: q, progress: 0, baseline, done: false })
      this.msg(`接取委托：「${q.title}」——${q.desc}`, 'loot')
      if (q.hard) {
        this.addItem('warpberry')
        this.msg('困难委托：探险署额外发了一枚迁跃浆果（食用可返回接取该任务的据点）。', 'loot')
      }
      return true
    }
    this.msg('暂时没有合适的委托。', 'system')
    return false
  }

  /** 交付委托（按委托方过滤；物品类现场扣除；按委托方发放声望/货币/物资奖励） */
  turnInQuest(faction: QuestFaction = 'meg'): boolean {
    const q = this.quests.find((q) => q.done && q.def.faction === faction)
    if (!q) { this.msg('还没有已完成的委托。', 'system'); return false }
    if (q.def.kind === 'item') {
      if (this.countItem(q.def.target) < q.def.n) { this.msg(`物资不够：还差 ${q.def.n - this.countItem(q.def.target)} 个。`, 'system'); return false }
      for (let i = 0; i < q.def.n; i++) this.consumeItem(q.def.target)
    }
    this.quests = this.quests.filter((x) => x !== q)
    const coin = q.def.faction === 'bntg' ? 'presses' : 'eaglecoin'
    const coinName = q.def.faction === 'bntg' ? '压印币' : '天鹰币'
    this.changeRep(q.def.faction, q.def.rewardRep)
    for (let i = 0; i < q.def.rewardCoin; i++) this.addItem(coin)
    for (const t of q.def.rewardItems) this.addItem(t)
    audio.pickup()
    // 阿丽亚娜无货币（rewardCoin=0）：toast 只显示声望 + 物资
    const rewardText = q.def.rewardCoin > 0
      ? `+${q.def.rewardRep} 声望 · ${coinName}×${q.def.rewardCoin}`
      : `+${q.def.rewardRep} 声望${q.def.rewardItems.length ? ` · ${q.def.rewardItems.map((t) => itemName(t)).join('、')}` : ''}`
    this.emit({ kind: 'toast', text: `委托交付：${rewardText}` })
    this.msg(`委托「${q.def.title}」交付完成。${FACTIONS[q.def.faction]?.name ?? '对方'}记下了你的贡献。`, 'loot')
    return true
  }

  /** 押运交付：与押运目标 NPC 交谈时当面交付（BNTG 委托；立即结算奖励） */
  deliverQuestTo(npcId: string): boolean {
    const q = this.quests.find((q) => q.def.kind === 'deliver' && q.def.target === npcId && !q.done)
    if (!q) return false
    q.done = true
    this.quests = this.quests.filter((x) => x !== q)
    this.changeRep('bntg', q.def.rewardRep)
    for (let i = 0; i < q.def.rewardCoin; i++) this.addItem('presses')
    for (const t of q.def.rewardItems) this.addItem(t)
    audio.pickup()
    this.emit({ kind: 'toast', text: `押运交付：+${q.def.rewardRep} BNTG 声望 · 压印币×${q.def.rewardCoin}` })
    this.msg(`包裹当面交付完成。商人之家记下了你的可靠。`, 'loot')
    return true
  }

  /** v43：EL3A 物流委托候选（三个目标互不相同的 deliverGoods；供物流主管处三选一） */
  goodsQuestOffers(): QuestDef[] {
    const out: QuestDef[] = []
    const seen = new Set<string>(this.quests.map((q) => `${q.def.kind}:${q.def.target}`))
    for (let tries = 0; tries < 40 && out.length < 3; tries++) {
      const def = genEl3aQuest(Math.random)
      const key = `${def.kind}:${def.target}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(def)
    }
    return out
  }

  /** v43：物流交付——与收件 NPC 交谈时当面交付（须带着物流包裹；立即结算压印币 + BNTG 声望） */
  deliverGoodsTo(npcId: string): boolean {
    const q = this.quests.find((q) => q.def.kind === 'deliverGoods' && q.def.target === npcId && !q.done)
    if (!q) return false
    if (!this.hasItem('parcel')) { this.msg('包裹不在身上——你不会把它弄丢了吧？回 EL3A 找物流主管说明情况。', 'system'); return false }
    this.consumeItem('parcel')
    q.done = true
    this.quests = this.quests.filter((x) => x !== q)
    this.changeRep('bntg', q.def.rewardRep)
    for (let i = 0; i < q.def.rewardCoin; i++) this.addItem('presses')
    for (const t of q.def.rewardItems) this.addItem(t)
    audio.pickup()
    this.emit({ kind: 'toast', text: `物流交付：+${q.def.rewardRep} BNTG 声望 · 压印币×${q.def.rewardCoin}` })
    this.msg(`包裹当面签收。办公区EL3A 的补给线又顺了一程。`, 'loot')
    return true
  }

  /** v43：物流失败认定——包裹不在身上时回 EL3A 向物流主管认栽（任务移除，BNTG 声望 -3） */
  failGoodsQuest(): boolean {
    const q = this.quests.find((q) => q.def.kind === 'deliverGoods' && !q.done)
    if (!q) { this.msg('手上没有进行中的物流委托。', 'system'); return false }
    if (this.hasItem('parcel')) { this.msg('包裹不是还在你背包里吗？别自己吓自己。', 'system'); return false }
    this.quests = this.quests.filter((x) => x !== q)
    this.changeRep('bntg', -3)
    this.emit({ kind: 'toast', text: `委托失败：「${q.def.title}」——BNTG 声望 -3` })
    this.msg(`你向麦考利主管认栽了。他在登记簿上画了一道黑杠：「下次看紧点。」`, 'system')
    return true
  }

  /** v43：玩家身上基础物资（杏仁水/罐装食品/绷带/电池）总数——免费救济判定用 */
  basicSupplyCount(): number {
    return this.countItem('almond') + this.countItem('canned') + this.countItem('bandage') + this.countItem('battery')
  }
  /** v43：免费补给包可领条件（物资匮乏：基础物资 <2；每次进入 EL3A 限领一次） */
  canClaimEl3aRelief(): boolean {
    return !this.el3aReliefClaimed && this.basicSupplyCount() < 2
  }
  /** v43：领取免费补给包（杏仁水×1 + 罐装食品×1） */
  claimEl3aRelief(): boolean {
    if (this.el3aReliefClaimed) { this.msg('这趟你已经领过补给包了——下次进仓再来吧。', 'system'); return false }
    if (this.basicSupplyCount() >= 2) { this.msg('你身上的物资还够——补给包留给更需要的人。', 'system'); return false }
    if (!this.addItem('almond') || !this.addItem('canned')) { this.msg('背包满了，腾不出放补给包的格子。', 'system'); return false }
    this.el3aReliefClaimed = true
    audio.pickup()
    this.emit({ kind: 'toast', text: '领取补给包：杏仁水×1 · 罐装食品×1' })
    this.msg('维斯珀从柜台下取出一个补给包塞给你：「先顶着，别客气。」', 'loot')
    return true
  }

  /** 委托进度追踪（每帧 step 调用；完成即提示回探险署交付） */
  private trackQuests(dt: number) {
    const p = this.player
    for (const q of this.quests) {
      if (q.done) continue
      const d = q.def
      if (d.kind === 'level' && p.level === Number(d.target)) {
        q.progress = d.unit === 'time' ? q.progress + dt : p.steps - q.baseline
      } else if (d.kind === 'phen' && this.activePhenomena.includes(d.target)) {
        q.progress = 1
      } else if (d.kind === 'entity' && (loadSeen()[d.target] ?? 0) > q.baseline) {
        q.progress = 1
      } else continue
      if (q.progress >= d.n) {
        q.done = true
        audio.pickup()
        this.msg(`委托目标达成：「${d.title}」——回探险署（中控室）交付。`, 'loot')
      }
    }
  }

  // ================= 开发者模式 API（v8 大扩展） =================
  // 以下方法仅供开发者面板/冒烟测试调用；不改变正常游戏流程。

  // 玩家视线正前方（世界系），与渲染层 look.yaw 保持一致
  private devForward(): { fx: number; fy: number } {
    const fx = -Math.cos(look.yaw), fy = -Math.sin(look.yaw)
    if (Math.abs(fx) < 1e-6 && Math.abs(fy) < 1e-6) return { fx: Math.cos(this.player.facing), fy: Math.sin(this.player.facing) }
    return { fx, fy }
  }

  // 以 (cx,cy) 为中心螺旋搜索最近的可站立点（地板且无实心结构）
  private devFindSpot(cx: number, cy: number, maxR = 6): { x: number; y: number } | null {
    const m = this.map
    if (!m) return null
    const solidAt = (x: number, y: number) =>
      m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy
          if (x < 1 || y < 1 || x >= m.w - 1 || y >= m.h - 1) continue
          if (tileAt(m, x, y) !== 1 || solidAt(x, y)) continue
          if (m.elev[y * m.w + x] === 4) continue // 深坑洞口不可落脚
          return { x: x + 0.5, y: y + 0.5 }
        }
      }
    }
    return null
  }

  /** 召唤实体：在玩家前方 dist 格（默认 3）生成指定类型实体 */
  devSpawnEntity(type: string, dist = 3): boolean {
    const m = this.map
    if (!m || !ENTITIES[type]) return false
    const p = this.player
    const { fx, fy } = this.devForward()
    const spot = this.devFindSpot(p.x + fx * dist, p.y + fy * dist)
    if (!spot) { this.msg('附近没有可召唤的空位。', 'system'); return false }
    m.entities.push(makeEntity(type, spot.x, spot.y))
    this.msg(`[DEV] 召唤了 ${ENTITIES[type].name}（${spot.x.toFixed(0)}, ${spot.y.toFixed(0)}）`, 'system')
    return true
  }

  /** 每种实体各召唤一只，环绕玩家排开 */
  devSpawnAllEntities(): number {
    let n = 0
    const types = Object.keys(ENTITIES)
    const p = this.player
    types.forEach((t, i) => {
      const ang = (i / types.length) * Math.PI * 2
      const spot = this.devFindSpot(p.x + Math.cos(ang) * 4, p.y + Math.sin(ang) * 4, 8)
      if (spot && this.map) { this.map.entities.push(makeEntity(t, spot.x, spot.y)); n++ }
    })
    this.msg(`[DEV] 召唤了全部 ${n} 种实体（各一只）`, 'system')
    return n
  }

  /** 给予物品：默认进背包；toGround=true 时生成在玩家脚下 */
  devGiveItem(type: string, toGround = false): boolean {
    const m = this.map
    if (!m || !ITEMS[type]) return false
    const p = this.player
    if (toGround) {
      m.items.push({ id: Math.random(), type, x: p.x + 0.2, y: p.y + 0.2 })
      this.msg(`[DEV] ${itemName(type)} 已生成在脚下`, 'system')
      return true
    }
    if (!this.addItem(type)) { this.msg('[DEV] 背包已满。', 'system'); return false }
    this.msg(`[DEV] 获得 ${itemName(type)}`, 'system')
    this.emit({ kind: 'toast', text: `+1 ${itemName(type)}` })
    return true
  }

  /** 一键全套补给：杏仁水×5 罐头×5 电池×3（放不下的掉到脚下） */
  devGiveSupplies() {
    const give = (t: string, n: number) => {
      for (let i = 0; i < n; i++) if (!this.addItem(t)) this.map?.items.push({ id: Math.random(), type: t, x: this.player.x + Math.random() - 0.5, y: this.player.y + Math.random() - 0.5 })
    }
    give('almond', 5); give('canned', 5); give('battery', 3)
    this.msg('[DEV] 全套补给已发放（杏仁水×5 罐头×5 电池×3）', 'loot')
  }

  /** 状态控制：设置单项数值（0-100）。会自动解除状态锁定使数值生效。 */
  devSetStat(key: 'hp' | 'sanity' | 'hunger' | 'stamina' | 'battery', v: number) {
    const p = this.player
    p[key] = Math.max(0, Math.min(100, v))
    this.dev.statLock = false // 解除每帧锁满，否则下一帧被覆盖
    if (key === 'battery' && p.battery > 0 && !p.flashlight) p.flashlight = true
  }

  /** 全部补满 */
  devFillStats() {
    const p = this.player
    p.hp = p.sanity = p.hunger = p.stamina = p.battery = 100
    this.msg('[DEV] 状态已全部补满', 'system')
  }

  /** 全部清空（HP 保留 1 防死亡） */
  devDrainStats() {
    this.devSetStat('hp', 1)
    this.devSetStat('sanity', 0)
    this.devSetStat('hunger', 0)
    this.devSetStat('stamina', 0)
    this.devSetStat('battery', 0)
    this.msg('[DEV] 状态已清空', 'system')
  }

  /** 召唤指定出口：仅限本层可生成的种类（levelDef.exits）；在玩家附近邻墙地板生成一个并标记已发现 */
  devSummonExit(kind: string): boolean {
    const m = this.map
    if (!m) return false
    const def = this.levelDef.exits.find((e) => e.kind === kind)
    if (!def) { this.msg('[DEV] 本层不会生成该出口。', 'system'); return false }
    const p = this.player
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.tiles[y * m.w + x])
    const solidAt = (x: number, y: number) => m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    // 可行走阶梯：走向需 4 格畅通（真实走下去/走上去的通道）
    const stairKind = kind === 'graystairs' || kind === 'graystairsup'
    const runOk = (x: number, y: number) => {
      if (!stairKind) return true
      for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (at(x + wx, y + wy) === 1) continue
        let clear = true
        for (let k = 1; k <= 4; k++) if (at(x - wx * k, y - wy * k) !== 1 || solidAt(x - wx * k, y - wy * k)) { clear = false; break }
        if (clear) return true
      }
      return false
    }
    let best: { x: number; y: number; score: number } | null = null
    for (let ty = Math.floor(p.y) - 7; ty <= Math.floor(p.y) + 7; ty++)
      for (let tx = Math.floor(p.x) - 7; tx <= Math.floor(p.x) + 7; tx++) {
        if (at(tx, ty) !== 1 || solidAt(tx, ty) || !runOk(tx, ty)) continue
        if (at(tx + 1, ty) === 1 && at(tx - 1, ty) === 1 && at(tx, ty + 1) === 1 && at(tx, ty - 1) === 1) continue // 需邻墙
        const d = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y)
        if (d < 1.6 || d > 8) continue
        if (m.exits.some((e) => Math.floor(e.x) === tx && Math.floor(e.y) === ty)) continue
        const ang = Math.abs(Math.atan2(ty + 0.5 - p.y, tx + 0.5 - p.x) - p.facing)
        const score = d + Math.min(ang, Math.PI * 2 - ang) * 2 // 优先朝向侧
        if (!best || score < best.score) best = { x: tx, y: ty, score }
      }
    if (!best) { this.msg('[DEV] 附近没有可放置出口的邻墙地板。', 'system'); return false }
    const exit: ExitInstance = { def, x: best.x, y: best.y, discovered: true }
    m.exits.push(exit)
    // 无限模式：同步进所属 LiveChunk，窗口重缝合后不丢（chunk 卸载后失效，dev 工具可接受）
    const inf = m.inf
    if (inf) {
      const c = inf.chunks.get(chunkKey(Math.floor((inf.ox + best.x) / CS), Math.floor((inf.oy + best.y) / CS)))
      c?.exits.push(exit)
      // 下行阶梯：走向 3 格标为深渊洞口（视觉开洞；同步 chunk 局部数组防 stitch 还原）
      if (kind === 'graystairs' && c) {
        for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (at(best.x + wx, best.y + wy) === 1) continue
          let clear = true
          for (let k = 1; k <= 3; k++) if (at(best.x - wx * k, best.y - wy * k) !== 1) { clear = false; break }
          if (!clear) continue
          for (let k = 1; k <= 3; k++) {
            const hx = best.x - wx * k, hy = best.y - wy * k
            m.elev[hy * m.w + hx] = 4
            const lx = hx - (c.cx * CS - inf.ox), ly = hy - (c.cy * CS - inf.oy)
            if (lx >= 0 && ly >= 0 && lx < CS && ly < CS) c.elev[ly * CS + lx] = 4
          }
          break
        }
      }
      inf.redo = (inf.redo ?? 0) + 1 // 出口网格只在 chunk 构建时生成——强制重建以渲染新召唤的出口
    }
    this.mapRev++ // 有限层：触发渲染层重建静态几何（含新出口）
    this.msg(`[DEV] 已在附近召唤出口「${def.name}」（${best.x},${best.y}）`, 'system')
    return true
  }

  /** 传送：exit=最近出口 / entity=最近实体 / container=最近未搜容器 / spawn=出生点 / landmark=最近定居点地标 */
  devTeleport(target: 'exit' | 'entity' | 'container' | 'spawn' | 'landmark'): boolean {
    const m = this.map
    if (!m) return false
    const p = this.player
    const go = (x: number, y: number, label: string) => {
      const spot = this.devFindSpot(x, y, 3)
      if (!spot) { this.msg(`[DEV] ${label}附近没有落脚点。`, 'system'); return false }
      p.x = spot.x; p.y = spot.y; p.z = 0; p.vz = 0
      this.msg(`[DEV] 已传送到${label}`, 'system')
      return true
    }
    if (target === 'spawn') return go(m.spawn.x, m.spawn.y, '出生点')
    if (target === 'landmark') {
      let bl: import('./types').Structure | null = null, bd = 1e9
      for (const s of m.structures) {
        if (s.kind !== 'landmark') continue
        const d = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
        if (d < bd) { bd = d; bl = s }
      }
      if (!bl) { this.msg('[DEV] 本层没有定居点地标。', 'system'); return false }
      return go(bl.x + 0.5, bl.y + 1, `最近定居点地标（${bd.toFixed(1)}m）`)
    }
    if (target === 'exit') {
      const e = this.nearestExit()
      if (!e) { this.msg('[DEV] 本层没有出口。', 'system'); return false }
      return go(e.x, e.y, '出口')
    }
    if (target === 'entity') {
      let best: Entity | null = null, bd = 1e9
      for (const e of m.entities) {
        if (e.dead) continue
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d < bd) { bd = d; best = e }
      }
      if (!best) { this.msg('[DEV] 本层没有存活实体。', 'system'); return false }
      return go(best.x + 1, best.y + 1, `最近实体（${best.def.name}，${bd.toFixed(1)}m）`)
    }
    // container（kind 统一走 containers.ts 注册表）
    let bs: import('./types').Structure | null = null, bd = 1e9
    for (const s of m.structures) {
      if (!CONTAINER_KINDS.includes(s.kind) || s.looted) continue
      const d = Math.hypot(s.x + s.w / 2 - p.x, s.y + s.h / 2 - p.y)
      if (d < bd) { bd = d; bs = s }
    }
    if (!bs) { this.msg('[DEV] 本层没有未搜索的容器。', 'system'); return false }
    return go(bs.x + bs.w / 2, bs.y + bs.h / 2 + 1, `最近容器（${bd.toFixed(1)}m）`)
  }

  /** 开发者：传送到本层指定 NPC 身旁（DevPanel 传送页 NPC 列表） */
  devGotoNpc(id: string): boolean {
    const m = this.map
    if (!m) return false
    const n = this.npcs.find((x) => x.id === id)
    if (!n) { this.msg('[DEV] 没有找到这名 NPC。', 'system'); return false }
    const p = this.player
    const spot = this.devFindSpot(n.x, n.y, 3)
    if (!spot) { this.msg(`[DEV] ${n.def.name} 附近没有落脚点。`, 'system'); return false }
    p.x = spot.x; p.y = spot.y; p.z = 0; p.vz = 0
    this.msg(`[DEV] 已传送到 ${n.def.name}（${n.def.role}）身旁`, 'system')
    return true
  }

  /** 时间快进：模拟 sec 秒的生存消耗（饥饿/理智/电池），不触发伤害死亡 */
  devFastForward(sec = 60) {
    const p = this.player
    const dm = DIFF[this.difficulty]
    const wasLocked = this.dev.statLock
    this.dev.statLock = false
    p.hunger = Math.max(0, p.hunger - 0.28 * dm.drain * sec)
    if (p.flashlight) p.battery = Math.max(0, p.battery - 0.5 * sec)
    const lit = this.map ? this.isLit(p.x, p.y) : true
    if (!lit) p.sanity = Math.max(0, p.sanity - (p.flashlight ? 0.5 : 1.5) * dm.drain * sec)
    this.time += sec
    this.msg(`[DEV] 快进 ${sec}s：饥饿 ${Math.round(p.hunger)} 理智 ${Math.round(p.sanity)} 电池 ${Math.round(p.battery)}${wasLocked ? '（已解除状态锁定）' : ''}`, 'system')
  }

  /** 立即触发一次本层随机氛围事件 */
  devTriggerEvent() {
    this.rollAmbientEvent()
  }

  /** 强制停电 dur 秒（已在停电中则先恢复再触发） */
  devForceBlackout(dur = 20) {
    if (this.blackoutT > 0) this.endBlackout()
    this.startBlackout(dur)
  }

  /** v17：传送到无限 L0 最近的指定变体 chunk 中心（截图/冒烟测试用）。
   *  优先已加载窗口内的变体 chunk；没有则定位最近未生成 chunk（传送即触发流式生成）。 */
  devGotoVariant(kind: string): boolean {
    const m = this.map
    if (!m?.inf) { this.msg('[DEV] 当前不是无限层级。', 'system'); return false }
    const inf = m.inf
    const p = this.player
    const impl = infiniteImplFor(this.levelDef.id)
    const name = impl.variantNames[kind] ?? kind
    // 已生成区域内已有该变体 → 直接传送（同一窗口内无需流式加载）
    const loaded = [...inf.chunks.values()].find((c) => c.variant === kind)
    if (loaded) {
      const cx = loaded.cx * CS + CS / 2 - inf.ox, cy = loaded.cy * CS + CS / 2 - inf.oy
      const spot = this.devFindSpot(cx, cy, 14)
      if (!spot) { this.msg(`[DEV] 变种房间「${name}」附近没有落脚点。`, 'system'); return false }
      p.x = spot.x; p.y = spot.y; p.z = 0; p.vz = 0
      this.msg(`[DEV] 已传送到变种房间「${name}」（已在生成区域内）`, 'system')
      return true
    }
    // 未生成：搜索最近的目标变体 chunk 并传送（窗口平移即强制生成该新区域）
    const hit = findNearestVariant(inf.seed, inf.ox + p.x, inf.oy + p.y, kind, 120, impl.variantOf)
    if (!hit) { this.msg(`[DEV] 附近没有变体 ${name}。`, 'system'); return false }
    // 世界坐标目标（chunk 中心）；直接改写玩家窗口坐标，由窗口平移完成流式加载
    const wcx = hit.cx * CS + CS / 2, wcy = hit.cy * CS + CS / 2
    p.x = wcx - inf.ox; p.y = wcy - inf.oy; p.z = 0; p.vz = 0
    this.updateInfiniteWindow()
    const spot = this.devFindSpot(p.x, p.y, 12)
    if (spot) { p.x = spot.x; p.y = spot.y }
    this.msg(`[DEV] 已传送到变种房间「${name}」（已生成新区域，chunk ${hit.cx},${hit.cy}）`, 'system')
    return true
  }

  /** 当前层级可能生成的固定结构（prefab）与变种房间清单，标注是否已出现在已生成区域 */
  devLevelStructures(): {
    prefabs: { id: string; name: string; found: boolean }[]
    variants: { id: string; name: string; found: boolean }[]
  } {
    const m = this.map
    const def = this.levelDef
    // 无限层级不走 prefab 生成路径，只有变种房间；有限层级只有固定结构
    const prefabs = m?.inf ? [] : prefabsForLevel(def.id, def.skipPrefabs).map((pf) => ({
      id: pf.id,
      name: pf.name,
      found: !!m?.structures.some((s) => s.kind === 'prefabmark' && s.data?.prefab === pf.id),
    }))
    const variants = m?.inf
      ? infiniteImplFor(def.id).rareVariants.map((v) => ({
          id: v,
          name: infiniteImplFor(def.id).variantNames[v] ?? v,
          found: [...m.inf!.chunks.values()].some((c) => c.variant === v),
        }))
      : []
    return { prefabs, variants }
  }

  /** 传送到指定固定结构；已生成区域没有时先在墙区开洞强制生成一个再传送 */
  devGotoPrefab(id: string): boolean {
    const m = this.map
    if (!m || m.inf) { this.msg('[DEV] 当前层级没有固定结构。', 'system'); return false }
    const def = prefabsForLevel(this.levelDef.id, this.levelDef.skipPrefabs).find((x) => x.id === id)
    if (!def) return false
    const findMark = () => m.structures.find((s) => s.kind === 'prefabmark' && s.data?.prefab === id)
    let mark = findMark()
    let forced = false
    if (!mark) {
      if (!placePrefabForced(m, new RNG(randomSeed()), id)) {
        this.msg(`[DEV] 无法生成「${def.name}」：本图没有合适的放置空间。`, 'system')
        return false
      }
      forced = true
      this.mapRev++ // 开洞/新结构 → 通知渲染层重建静态几何
      mark = findMark()
    }
    if (!mark?.data) return false
    const d = mark.data
    const cx = (d.rx as number) + (d.rw as number) / 2
    const cy = (d.ry as number) + (d.rh as number) / 2
    const spot = this.devFindSpot(cx, cy, Math.max(def.w, def.h))
    if (!spot) { this.msg('[DEV] 结构附近没有落脚点。', 'system'); return false }
    const p = this.player
    p.x = spot.x; p.y = spot.y; p.z = 0; p.vz = 0
    this.msg(`[DEV] 已传送到固定结构「${def.name}」${forced ? '（本图原本未生成，已强制生成）' : ''}`, 'system')
    return true
  }

  /** 测试场地：仅 L0 无限模式、开发者模式专用——在附近开辟 80×80 无墙空旷区域并传送（不会自然生成） */
  devTestField(): boolean {
    const m = this.map
    if (!m?.inf || this.levelDef.id !== 0) { this.msg('[DEV] 测试场地仅在教学关卡（Level 0）可用。', 'system'); return false }
    const p = this.player
    const W = m.w
    // 场地中心：玩家前方 48 格（限制在当前 chunk 窗口内）
    const cx = Math.max(42, Math.min(W - 42, Math.round(p.x + 48)))
    const cy = Math.max(42, Math.min(W - 42, Math.round(p.y)))
    const R = 40
    const x0 = cx - R, y0 = cy - R, x1 = cx + R, y1 = cy + R
    const inR = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1
    // 关键：无限模式的窗口数组（m.tiles 等）只是已加载 chunk 的缝合副本，
    // 窗口平移时 stitch() 会用 chunk 数据覆盖它们——必须同步改写底层 LiveChunk，
    // 否则传送触发平移后场地立刻被原始迷宫还原；渲染层也只认 inf.redo，不认 mapRev
    const inf = m.inf!
    for (const c of inf.chunks.values()) {
      const wx0 = c.cx * CS - inf.ox, wy0 = c.cy * CS - inf.oy
      const lx0 = Math.max(x0, wx0) - wx0, ly0 = Math.max(y0, wy0) - wy0
      const lx1 = Math.min(x1, wx0 + CS - 1) - wx0, ly1 = Math.min(y1, wy0 + CS - 1) - wy0
      if (lx0 > lx1 || ly0 > ly1) continue
      for (let ly = ly0; ly <= ly1; ly++)
        for (let lx = lx0; lx <= lx1; lx++) {
          const i = ly * CS + lx
          c.tiles[i] = 1; c.elev[i] = 0; c.tint[i] = 0; c.wet[i] = 0
        }
      c.structures = c.structures.filter((s) => !inR(s.x + s.w / 2, s.y + s.h / 2))
      c.items = c.items.filter((it) => !inR(it.x, it.y))
      c.lights = c.lights.filter((l) => !inR(l.x, l.y))
      c.exits = c.exits.filter((e) => !inR(e.x, e.y))
      c.entities = c.entities.filter((e) => !inR(e.x, e.y))
    }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x
        m.tiles[i] = 1; m.elev[i] = 0; m.step[i] = 0; m.crawl[i] = 0
        m.liquid[i] = 0; m.outdoor[i] = 0; m.tint[i] = 0; m.wet[i] = 0
        m.up[i] = 0; m.upWall[i] = 0; m.stair[i] = 0; m.ceiling[i] = 0
      }
    // 清空区域内结构/物品/实体/光源/出口（空旷无阻挡）
    m.structures = m.structures.filter((s) => !inR(s.x + s.w / 2, s.y + s.h / 2))
    m.items = m.items.filter((it) => !inR(it.x, it.y))
    m.entities = m.entities.filter((e) => !inR(e.x, e.y))
    m.lights = m.lights.filter((l) => !inR(l.x, l.y))
    m.exits = m.exits.filter((e) => !inR(e.x, e.y))
    // 场地照明：按 8 格网格补灯，同时写入窗口数组与底层 LiveChunk——
    // 窗口平移 stitch 从 chunk 重建 m.lights 后灯仍在（清空 gen 灯后场地不能是黑场）
    for (let y = y0 + 4; y <= y1; y += 8)
      for (let x = x0 + 4; x <= x1; x += 8) {
        const L = { x: x + 0.5, y: y + 0.5, r: 5, color: '#d9c39a', flickerSeed: Math.random() * 100, gen: 1 as const }
        m.lights.push(L)
        for (const c of inf.chunks.values()) {
          const wx0 = c.cx * CS - inf.ox, wy0 = c.cy * CS - inf.oy
          if (L.x >= wx0 && L.x < wx0 + CS && L.y >= wy0 && L.y < wy0 + CS) { c.lights.push(L); break }
        }
      }
    p.x = cx; p.y = cy; p.z = 0; p.vz = 0
    this.mapRev++ // 有限层渲染重建用（无限层忽略，保留无害）
    inf.redo = (inf.redo ?? 0) + 1 // 无限层：通知渲染层重建全部已烘焙 chunk 几何
    this.msg('[DEV] 已生成「测试场地」（80×80 空旷区域）并传送。', 'system')
    return true
  }

  /** v17：传送到最近的保底出口「闪烁的墙壁」（窗口外也可达） */
  devGotoExit(): boolean {
    const m = this.map
    if (!m?.inf) return this.devTeleport('exit')
    const inf = m.inf
    const p = this.player
    const w = l0NearestExit(m, this.levelDef, inf.ox + p.x, inf.oy + p.y)
    if (!w) { this.msg('[DEV] 未找到保底出口。', 'system'); return false }
    // 出口世界坐标 → 站到出口旁 1 格
    const wex = w.x + inf.ox + 0.5, wey = w.y + inf.oy + 0.5
    p.x = wex - inf.ox + 1; p.y = wey - inf.oy; p.z = 0; p.vz = 0
    this.updateInfiniteWindow()
    // 平移后精确站在出口相邻地板瓦片上（交互半径内）
    const e = m.exits[0]
    if (e) {
      let placed = false
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const tx = Math.floor(e.x) + dx, ty = Math.floor(e.y) + dy
        if (tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.tiles[ty * m.w + tx] === 1) {
          p.x = tx + 0.5; p.y = ty + 0.5; placed = true; break
        }
      }
      if (!placed) {
        const spot = this.devFindSpot(e.x + 0.5, e.y + 1.5, 4)
        if (spot) { p.x = spot.x; p.y = spot.y }
      }
    }
    this.msg(`[DEV] 已传送到出口「闪烁的墙壁」（约 ${w.d.toFixed(0)}m 外）`, 'system')
    return true
  }

  /** 重新生成当前层级：newSeed=true 换随机种子，否则同种子重建 */
  devRegenLevel(newSeed: boolean) {
    if (!this.map) return
    if (newSeed) this.seed = Math.floor(Math.random() * 0x7fffffff)
    this.transition = null
    this.loadLevel(this.player.level)
    this.emit({ kind: 'transition', anim: 'intro' })
    this.msg(`[DEV] 层级已重新生成（${newSeed ? '新' : '同'}种子 ${seedString(this.seed)}）`, 'system')
  }

  /** 清场：击杀本层全部实体 */
  devKillAllEntities(): number {
    const m = this.map
    if (!m) return 0
    let n = 0
    for (const e of m.entities) {
      if (e.dead) continue
      e.hp = 0; e.dead = true; e.deathT = 1.4; n++
      this.bloodParticles(e.x, e.y)
    }
    this.player.kills += n
    this.msg(`[DEV] 清场：击杀 ${n} 只实体`, 'system')
    return n
  }

  /** 调试信息快照（信息页签展示用） */
  devInfo() {
    const m = this.map
    const p = this.player
    const tx = Math.floor(p.x), ty = Math.floor(p.y)
    const idx = m ? ty * m.w + tx : -1
    const mm = m as unknown as { elev?: Uint8Array; outdoor?: Uint8Array } | null
    const elev = m && mm?.elev && idx >= 0 && idx < mm.elev.length ? mm.elev[idx] : undefined
    const outdoor = m && mm?.outdoor && idx >= 0 && idx < mm.outdoor.length ? mm.outdoor[idx] === 1 : undefined
    const ents = (m?.entities ?? [])
      .map((e) => ({
        type: e.def.type, name: e.def.name,
        d: Math.hypot(e.x - p.x, e.y - p.y),
        state: e.dead ? 'dead' : e.hidden ? 'hidden' : e.disguised ? 'disguised' : e.state,
        hp: e.hp,
      }))
      .sort((a, b) => a.d - b.d)
    const containers = (m?.structures ?? []).filter((s) => CONTAINER_KINDS.includes(s.kind))
    return {
      x: p.x, y: p.y, z: p.z, tx, ty, elev, outdoor,
      level: p.level, seed: this.seed, time: this.time,
      entities: ents,
      containers: { total: containers.length, unlooted: containers.filter((s) => !s.looted).length },
      exits: (m?.exits ?? []).map((e) => ({ name: e.def.name, d: Math.hypot(e.x + 0.5 - p.x, e.y + 0.5 - p.y), discovered: e.discovered })),
      landmarks: (m?.structures ?? [])
        .filter((s) => s.kind === 'landmark')
        .map((s) => ({ name: OUTPOSTS[(s.data?.outpost as string) ?? '']?.name ?? '定居点地标', d: Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y) })),
      blackout: this.blackoutT > 0 ? this.blackoutT : 0,
    }
  }
}

export const engine = new Engine()
