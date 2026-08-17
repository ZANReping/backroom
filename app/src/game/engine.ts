// 游戏引擎：组合根——全部状态字段、主循环 step()、对外公共 API 门面。
// v53：机制实现按类别拆分到 engine/ 子模块（持续性效果注册表 effects / 存档 save /
// 层级切换 level / 移动积分 movement / 生存属性 survival / 实体AI entityAI / 战斗投掷 combat /
// 交互容器 interact / NPC委托声望 npc / 背包装备 inventory / 现象停电 ambient / 开发者API dev），
// 逻辑逐语句搬运，行为/数值/时序不变；本类方法与字段名保持对外契约完全一致
// （字段改由子模块直接读写，故不再标 private——TS 可见性放宽，运行时语义不变）。
import { type GameMap } from './world/mapgen'
import { NORMAL_LEVELS, levelLabel, levelDefOf } from './levels'
import { type Entity } from './entities'
import { createIntegrator, type MoveIntegrator } from './core/player'
import { look } from './core/renderer3d'
import type { ExitDef, FloorBand, LightSource, Structure } from './core/types'
import { audio } from './core/audio'
import { ROCK_SONG_IDS, musicName, setRadioCfg } from './core/midi'
import { seedString } from './core/rng'
import { type NpcState, type NpcDef } from './content/npcs'
import { OUTPOSTS } from './content/outposts'
import { REP_START, type QuestDef, type QuestFaction } from './content/factions'
import { DIFF, type Difficulty } from './engine/shared'
import { runEffectTicks, resetEffects } from './engine/effects'
import * as save from './engine/save'
import * as level from './engine/level'
import * as movement from './engine/movement'
import * as survival from './engine/survival'
import * as entityAI from './engine/entityAI'
import * as combat from './engine/combat'
import * as interact from './engine/interact'
import * as npc from './engine/npc'
import * as inventory from './engine/inventory'
import * as warehouse from './engine/warehouse'
import * as ambient from './engine/ambient'
import * as dev from './engine/dev'
import * as unstuck from './engine/unstuck'
import { loadSaveSnapshot, type SaveSnapshot } from './engine/save'

// v53：对外契约再导出（原 engine.ts 直接导出的符号保持不变）
export { SAVE_KEY, loadSaveSnapshot, clearSaveSnapshot, listSaveSlots, readSaveSlot, SAVE_SLOT_KEYS, SAVE_SLOT_LABELS } from './engine/save'
export type { SaveSnapshot, SaveSlotId, SlotInfo } from './engine/save'
export type { Difficulty } from './engine/shared'
export { EFFECTS } from './engine/effects'

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
  kind: 'msg' | 'toast' | 'damage' | 'sanityhit' | 'transition' | 'floorchange' | 'dead' | 'victory' | 'levelchange' | 'lootpanel' | 'notebook' | 'doc' | 'landmark' | 'dialog' | 'radioheard' | 'mpevent'
  cutIn?: string
  dest?: number | 'random' | 'win'
  text?: string
  msgKind?: MsgKind
  anim?: string
  fallDamage?: number
  song?: string // v56：radioheard——新收听的曲目 id
  mp?: import('./net/protocol').MpEvent // v58：联机世界事件（session 订阅转发）
}

export interface PlayerState {
  x: number; y: number; facing: number
  // v7 数据契约：z 轴高度系统
  z: number // 脚底高度（米，随地面高度档/坡道/跳跃变化）
  vz: number // 垂直速度（重力积分）
  crouching: boolean // 蹲伏（减速、过低通道）
  floor: FloorBand
  hp: number; sanity: number; hunger: number; stamina: number
  thirst: number // v54：口渴值（0-100；与饥饿同率流失，归零持续扣血）
  infection: number // v55：疫疾感染值（0+，隐藏数值——游戏内无数值/提示文本，仅风味特效；每 100 点进一阶）
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

export class Engine {
  map: GameMap | null = null
  player: PlayerState
  input: InputState = { mx: 0, my: 0, sprint: false, attack: false, interact: false, toggleLight: false, jump: false, crouch: false }
  listeners: ((e: HudEvent) => void)[] = []
  difficulty: Difficulty = 'normal'
  seed = 1
  noise = 0 // 当前噪音值 0-1（HUD 显示）
  playerNoiseT = 0 // 玩家噪音残余时间（>0 = 正在/刚刚制造噪音；猎犬威慑判定，noiseEvent 刷新）
  camShake = 0
  time = 0
  paused = false
  over = false
  victory = false
  // v54：F1 沉浸模式——隐藏全部 HUD DOM 与第一人称手部建模（UI 状态，不入存档；新一局重置）
  hudHidden = false
  // v54：F1/F2 互斥状态机——hudHidden=隐藏 HUD 铬件；handsHidden=连手部建模/准星一起隐藏。
  // F1 全沉浸（hudHidden+handsHidden）/ F2 半沉浸（仅 hudHidden，保留手部建模与准星）；
  // 按当前生效的键恢复，按另一个键直接切换到另一种模式（互不叠加）。
  handsHidden = false
  // v29a：存档/读档状态
  mapSeed = 0 // 当前层级地图生成种子（loadLevel 记录，读档恢复同一张图用）
  mapFirstVisit = true // 当前地图生成时的 firstVisit 标记
  // v58：联机状态——会话引用（App 注入）；mpMapSeed 覆盖 loadLevel 种子算法（全房间同图）；
  // mpSpawnSlot 为本次开局的出生槽位（0=默认出生点）
  mpSession: import('./net/session').MpSession | null = null
  mpMapSeed: ((id: number) => number) | null = null
  mpSpawnSlot: number | null = null
  applyingNet = false // v59：正在应用远端联机事件（applyMpEvent）——此期间引擎函数不再广播，防回环
  autosaveT = 0 // 周期自动存档计时（秒）
  idleSaved = false // 暂停/结束后已落盘一次（避免每帧重复写存储）
  // 暂停页脱困检测（仅内存态；3 秒内观测移动后自动清除）
  unstuckCheck: unstuck.UnstuckCheckState | null = null
  // v54：本局绑定的存档槽（slot1/2/3=手动槽，暂停/退标题落盘写入；auto=从自动槽继续的局）
  saveSlot: save.SaveSlotId = 'slot1'
  /** v23：本层内是否主动挑衅过实体（解除 Level 11 Effect 的被动状态） */
  provoked = false
  /** v23：在 Level 601 走进过多少次「你家的前门」 */
  fakeEnds = 0
  pocketsAlarmT = 6
  manilaT = 4
  transition: { anim: string; t: number; dest: number | 'random' | 'win'; fallDamage?: number } | null = null
  explored: Uint8Array = new Uint8Array(0)
  visible: Uint8Array = new Uint8Array(0)
  fakes: { x: number; y: number; t: number }[] = [] // 理智幻影
  particles: { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; size: number; z?: number; vz?: number }[] = []
  // v13：液体状态
  inLiquid = 0 // 当前所在液体类型（0 无 1 深水 2 浅水）
  submerged = false // 头部没入水下
  breathT = 0 // 水下屏气计时（超限微扣 HP）
  wasSubmerged = false
  bubbleT = 0
  rippleT = 0
  // v13：电梯乘降 / 梯子攀爬（脚本化垂直移动，期间锁定水平移动与重力）
  ride: { sx: number; sy: number; from: number; to: number; t: number } | null = null
  climb: { baseX: number; baseY: number; topX: number; topY: number; dir: 1 | -1; zBase?: number; zTop?: number; rope?: 1 } | null = null
  climbCd = 0 // 攀爬送达后的再触发冷却（防止到顶立即又爬下）
  // v58：L7 门廊舱门异常重力拖拽演出——非空即进行中（t 秒；sx/sy/sz 起点 → dx/dy 落海点）
  porchDrop: { t: number; sx: number; sy: number; sz: number; dx: number; dy: number } | null = null
  stepAcc = 0
  // v12：interactTarget 携带目标引用（结构/物品/出口），HUD 提示与 doInteract 执行
  // 共用 scanInteract 的同一选择结果，杜绝「提示普通门却触发相邻上锁门」的目标漂移。
  interactTarget: { kind: string; label: string; s?: Structure; it?: GameMap['items'][number]; e?: GameMap['exits'][number]; npc?: NpcState; ent?: Entity; vmBack?: boolean } | null = null
  // 开发者模式（v8 扩展：statLock=每帧锁满状态，oneHit=一击必杀，invisible=实体不追击，frozenAI=冻结实体）
  dev = { god: false, noclip: false, speed: false, statLock: true, oneHit: false, invisible: false, frozenAI: false, bright: false, phenOn: new Set<string>(), phenOff: new Set<string>(), hintDist: 30 }
  // 地图就地修改版本号（开发者强制生成固定结构时 +1；渲染层据此重建有限层静态几何）
  mapRev = 0
  // 开场爬起动画计时（>0 时锁定移动/攻击/跳跃，渲染层相机从贴地侧躺缓慢起身）
  introT = 0
  // 容器搜索（按住交互 → 进度 → 战利品面板）
  searching: { sid: number; t: number; dur: number; label: string } | null = null
  lootPanel: { sid: number; label: string; items: string[] } | null = null
  statusMsgT = { hunger: 0, thirst: 0, battery: 0, stamina: 0 }
  redAnnounced = new Set<string>() // 本层已播报预警的红室 chunk（chunkKey）
  // 固定子步移动积分器（帧间保留时间余数，保证高低帧率位移一致）
  moveIt: MoveIntegrator = createIntegrator()
  // 攻击挥动动画计时（渲染层读取做手部挥砍/准心收缩）
  attackAnimT = 0
  // 攻击动画种类（渲染层据此切换动作）：punch=空手出拳 swing=武器挥舞 throw=投掷
  attackAnimKind: 'punch' | 'swing' | 'throw' | 'spray' | 'drink' = 'punch'
  // 飞行中的投掷物（订书机/汽油罐等；落地触发效果，见 landProjectile）
  projectiles: Projectile[] = []
  projId = 1
  // 层级氛围事件（wiki 设定播报）计时
  ambientT = 14
  // L1 停电事件：剩余时间 + 被移除光源的备份
  blackoutT = 0
  // v31：「闪烁」预警期（完全停电前灯光快速闪烁的秒数；渲染层据此做灯光快闪）
  blackoutWarnT = 0
  blackoutPendingDur = 0
  blackoutBackup: LightSource[] | null = null

  // v29：经 L0「向下的灰色阶梯」进入 L1 的标记（下一次 loadLevel(1) 时在出生点附近生成返程阶梯）
  arriveStairs = false
  // v51：乘电梯（elevatorshaft）抵达的标记——下一次 loadLevel 把出生点改到本层电梯旁（内存标记，不入存档）
  arriveElevator = false
  // v54：经古典楼梯（oldstairs）抵达的标记——下一次 loadLevel(5) 把出生点改到 L5 保底楼梯 2 格外的空旷地板
  // （内存标记，不入存档；仅 L5 消费——L4 的古典楼梯落点维持默认出生点不变）
  arriveOldstairs = false
  arriveL6Band: FloorBand | null = null // L5 黑门=-1；L4/Omega 活板门=0
  // v29：返程「向上的灰色阶梯」（世界坐标固定；窗口平移 stitch 后重新注入）
  bonusExit: { def: ExitDef; wx: number; wy: number } | null = null
  // v29：本局已到过的层级（初始物资仅首次进 L0 刷新）
  visitedLevels = new Set<number>()
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
  // v54：据点寄存仓库（阵营互通，每阵营 48 栏；随存档持久；新一局由 EFFECTS 注册表重置）
  warehouses: warehouse.WarehouseState = warehouse.freshWarehouses()
  // v54 二轮：BNTG 付费通道——本次对话临时解锁的阵营仓库（不持久；DialogOverlay 卸载即清空）
  warehouseTempUnlock = new Set<warehouse.WarehouseFaction>()
  // v39：BRC（后室装修公司）——未告发的伤害/杀死计数（攻击/杀死员工不立即降声望，
  // 与员工对话「坦白」时按 伤害-10/人、杀死-30/人 结清；随存档持久）与模仿装修冷却
  brcSin = { hurt: 0, killed: 0 }
  brcMimicCd = 0 // 模仿装修全局冷却剩余秒数（~90s 防连点）
  brcMimicPending = 0 // 模仿动作进行中（挥臂动画播完后结算 +2 声望）
  // ===== v45：杰瑞的信众 / Level 274 教化系统（随存档持久）=====
  indoctrination = 0 // 教化值 0~100（接触杰瑞 +25；≥100 成为信众一员，无法主动离开 L274）
  jerryTamed = false // 鹉主已被杏仁水驯服（教化清零且此后接触不再积累）
  jerryAgreed = new Set<string>() // 已「认同杰瑞」的信众 NPC id（引路选项按此显示；v49 起每局至多一名）
  jerryOath = false // v49：本局已宣誓认同杰瑞（+10 每局仅首次有效——宣誓一次，全鹦鹉门下皆知）
  homelyApplied = false // v55：家常酒店（L5 据点 111）入住申请已提交（地标卡办理；随存档持久）
  // v56：电台（MIDI 曲风下暂停页电台管理）——随层级变化/固定音乐 + 单层覆盖；随存档持久
  radio: { mode: 'follow' | 'fixed'; fixed: string | null; perLevel: Record<number, string> } = { mode: 'follow', fixed: null, perLevel: {} }
  // v56：已收听曲目 id 列表（电台可选的前提；乐手演奏后解锁摇滚曲目；随存档持久）
  heardSongs: string[] = []
  // v56：乐手（乔伊）演奏中标记（渲染层弹奏动画 + 对话「停下」选项；播完/叫停/切层自动清除）
  joeyPlaying = false
  jerryContactCd = 0 // v47：接触杰瑞冷却剩余秒数（20s 防连点刷声望/教化；HUD 交互提示显示剩余）
  jerryTerritory = false // 玩家身处信众宣传间矩形内（HUD 显示 jerry 声望；引擎每帧维护）
  chantT = 0 // 诵咏计时（L274 内被教化后周期性咏出崇拜词）
  // v29：玩家当前在可行走阶梯上（碰撞 z 按地面处理、跳过重力贴地；由 updateStairs 每帧维护）
  onStairs = false

  // 现象系统：当前生效的现象 id 列表（每帧由 step 重算；HUD 左上角与物品栏「状态」页读取展示）
  activePhenomena: string[] = []
  // 现象「孤立效应」的附加表现：每次进入 Level 0，画面色调/饱和度/对比度/亮度
  // 发生极轻微偏移（幅度刻意控制在一般无法察觉的范围；App.tsx 以 CSS filter 施加到画布）
  colorGrade = { hue: 0, sat: 1, con: 1, bri: 1 }
  // v30：植殖癌（Level 1 花园段）——0..1 进展度：在花园段内约 75 秒涨满，离开后以 2 倍速消退。
  // 行为逐渐僵硬（移动减速）、视野逐渐变绿（App.tsx 绿色覆盖层），涨满即原地生根（死亡）
  plantK = 0
  plantStage = 0
  inGardenEff = false // 本帧植殖癌是否生效（含开发者强制开/关），供现象列表读取
  // ===== v32：新物品机制状态 =====
  axeDur = 0 // 斧头耐久（获得时重置为 5；破门 -1，耗尽报废）
  squirtTank: 'none' | 'water' | 'almond' | 'cashew' | 'liquidpain' = 'none' // 滋水枪储罐液体（单一种类）
  // v51：Object 5 糖果效果计时器
  candyAddictT = 0 // 糖瘾：吃糖后 60s 内需再吃，否则理智 -10
  silverTongueT = 0 // 银舌头：交易 95 折（秒）
  slipperyT = 0 // 咀嚼子弹：脚滑（秒）
  gunCandyT = 0 // 枪糖：右手变枪（秒）
  slipVx = 0
  slipVy = 0
  chocoCd = 0 // 巧克力子弹射速冷却
  manmadeT = 0 // v51：人制品效应剩余秒数（5 分钟：拒食他物/治疗减半/恒显饥饿特效/体力恢复减半消耗加倍/受伤 -10%）
  webbedT = 0 // v51：Nguithr'xurh 镇静剂麻痹剩余秒数（视野模糊 + 移动迟缓）
  /** 当前是否身处据点（饥饿减速/体力加速的判定依据） */
  get inOutpost(): boolean { return Object.values(OUTPOSTS).some((o) => o.levelId === this.player.level) }
  squirtAmmo = 0 // 储罐剩余喷射份数（1 瓶 = 3 份，上限 9 瓶 = 27 份）
  warpBerryLevel: number | null = null // 迁跃浆果：首次获得时所在层级（食用传送目标）
  royalAddictT = 0 // 皇家口粮成瘾剩余秒数（期间其他食物不回饥饿）
  sanityFloor = 0 // 皇家口粮锁定的理智下限（成瘾崩塌期间不生效）
  royalDrainT = 0 // 成瘾崩塌：理智急速下降剩余秒数
  // v55：疫疾（Entity 19）——感染阶段跟踪（升阶计图鉴遭遇）与潜藏期咳嗽计时；
  // infection 本体在 PlayerState（随存档快照持久，freshPlayer 清零）
  infectionStage = 0
  coughT = 0
  // v55：「恢复」buff 剩余秒数（杏仁水/幸运豆奶/消毒液/皇家口粮 60s；重复服用重置计时）——
  // 持续期间感染值不再增长，且在非感染区（非湿地/非锅炉房）每 5s 自然 -1
  infectionRecoverT = 0

  constructor() {
    this.player = this.freshPlayer()
    // v56：BGM 曲目播放回调 → 电台收听记录（heardSongs 持久，电台管理可选范围）
    audio.onSongPlayed = (id: string) => { this.markSongHeard(id) }
    // v56：乐手演奏结束（播完/被叫停/切层）→ 清除演奏标记（渲染层弹奏动画随止）
    audio.onOneshotEnd = () => { this.joeyPlaying = false }
  }

  // ===== v56：电台（音乐库收听 + 配置） =====
  /** 标记已收听曲目（去重；随存档持久；乐手摇滚曲目播报「已加入电台」） */
  markSongHeard(id: string) {
    if (this.heardSongs.includes(id)) return
    this.heardSongs.push(id)
    this.emit({ kind: 'radioheard', song: id })
    if (id.startsWith('rock_')) this.msg(`♪ 已收听新曲目「${musicName(id)}」——已加入电台（暂停页 → 电台管理）。`, 'lore')
  }
  /** 电台配置变更：同步解析器 + 立即重开当前 BGM + 落盘 */
  setRadio(cfg: { mode: 'follow' | 'fixed'; fixed: string | null; perLevel: Record<number, string> }) {
    this.radio = { mode: cfg.mode, fixed: cfg.fixed, perLevel: { ...cfg.perLevel } }
    setRadioCfg(this.radio)
    audio.startBGM(this.player.level) // 立即换曲
    this.persist()
  }
  /** v56：乐手演奏——MIDI 曲风下随机一首摇滚风格（收听解锁电台），程序化曲风下普通摇滚 */
  musicianPlay(): string {
    this.joeyPlaying = true
    if (audio.midiEnabled) {
      const pool = ROCK_SONG_IDS.filter((id) => id !== audio.currentSong) // 尽量不重上一首
      const id = (pool.length ? pool : ROCK_SONG_IDS)[Math.floor(Math.random() * (pool.length ? pool.length : ROCK_SONG_IDS.length))]
      audio.playMusicianSong(id)
      return musicName(id)
    }
    audio.playProceduralRock()
    return '一首老式摇滚'
  }
  /** v56：乐手停止演奏（对话「停下」）——淡出演奏并恢复 BGM */
  musicianStop() {
    this.joeyPlaying = false
    audio.stopMusician()
  }

  private freshPlayer(): PlayerState {
    return {
      x: 2.5, y: 2.5, facing: 0,
      z: 0, vz: 0, crouching: false, floor: 0,
      hp: 100, sanity: 100, hunger: 100, stamina: 100,
      thirst: 100,
      infection: 0,
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

  newRun(seed: number, difficulty: Difficulty, slot: save.SaveSlotId = 'slot1') {
    this.seed = seed
    this.difficulty = difficulty
    this.saveSlot = slot
    this.player = this.freshPlayer()
    this.over = false; this.victory = false; this.transition = null
    this.unstuckCheck = null
    this.idleSaved = false
    this.autosaveT = 0
    this.time = 0
    this.msgLog = [] // 新一局清空播报历史
    this.visitedLevels.clear() // 新一局重置到层记录（初始物资首访刷新用）
    this.outpostReturn = null // 新一局清空据点返程记录（读档时由快照恢复）
    this.knownNpcs = [] // 新一局清空随机 NPC 记录（静态 NPC 由注册表恒定提供）
    this.rep = { meg: REP_START } // 新一局声望重置（MEG 默认友好；读档时由快照恢复）
    this.quests = []
    this.warehouseTempUnlock.clear() // v54：新一局清空仓库付费临时解锁
    // v56：电台重置（随层级变化 + 无收听记录；读档时由快照恢复）
    this.radio = { mode: 'follow', fixed: null, perLevel: {} }
    this.heardSongs = []
    setRadioCfg(this.radio)
    // v39/v45/v47 等持续性效果状态清空（EFFECTS 注册表 newRun 组：BRC 未告发记录与模仿冷却、
    // 教化系统/宣誓/接触冷却/诵咏——逐字段语义与原显式赋值一致；读档时由快照恢复）
    resetEffects(this, 'newRun')
    // v29a：主界面「继续游戏」用存档种子重进 newRun——存在同种子快照时恢复进度而不是重开新游戏。
    // （「开始新游戏」的种子是随机新生成的，与快照种子不同，自然走全新开局路径。）
    // v54：从绑定的存档槽读取快照（slot1/2/3/auto）；v58：联机开局一律全新（不读档）
    const snap = this.mpSession ? null : loadSaveSnapshot(slot)
    if (snap && snap.seed === seed) {
      this.difficulty = snap.difficulty ?? difficulty
      this.time = snap.time
      for (const id of snap.visited ?? []) this.visitedLevels.add(id)
      this.outpostReturn = snap.outpostReturn ?? null
      this.rep = snap.rep ?? { meg: REP_START }
      this.quests = snap.quests ?? []
      this.warehouses = snap.warehouses ?? warehouse.freshWarehouses() // v54：恢复寄存仓库库存
      this.brcSin = snap.brcSin ?? { hurt: 0, killed: 0 } // v39：恢复 BRC 未告发记录
      this.brcMimicCd = snap.brcMimicCd ?? 0
      // v45：恢复教化系统状态
      this.indoctrination = snap.indoctrination ?? 0
      this.jerryTamed = snap.jerryTamed ?? false
      this.jerryAgreed = new Set(snap.jerryAgreed ?? [])
      // v49：恢复宣誓标记；旧档无此字段时按「已认同过任一信众」迁移（每局仅首次认同有效）
      this.jerryOath = snap.jerryOath ?? ((snap.jerryAgreed ?? []).length > 0)
      this.homelyApplied = snap.homelyApplied ?? false // v55：家常酒店入住申请
      // v56：恢复电台配置与收听记录（旧档缺省=随层级变化/空）
      this.radio = snap.radio ?? { mode: 'follow', fixed: null, perLevel: {} }
      this.radio.perLevel = this.radio.perLevel ?? {}
      this.heardSongs = snap.heardSongs ?? []
      setRadioCfg(this.radio)
      this.loadLevel(snap.level, { mapSeed: snap.mapSeed, firstVisit: snap.mapFirstVisit })
      // loadLevel 已把 player 放到出生点；此处整体恢复为存档时的玩家状态
      const fresh = this.freshPlayer()
      this.player = {
        ...fresh,
        ...snap.player,
        equip: { ...fresh.equip, ...(snap.player.equip ?? {}), pockets: snap.player.equip?.pockets ?? fresh.equip.pockets },
      }
      this.player.level = snap.level
      const placement = level.restoreSavedPlayerPosition(this, snap.worldPos)
      // v55：感染阶段从存档感染值推导（升阶遭遇计数的基准）
      this.infectionStage = Math.min(4, Math.floor((this.player.infection ?? 0) / 100))
      // aliveTime 由 (Date.now()-startTime) 推导：平移 startTime 保持存活时长连续
      this.player.startTime = Date.now() - (snap.player.aliveTime ?? 0) * 1000
      this.introT = 0 // 读档不播摔落爬起动画
      if (placement === 'legacy-spawn') this.msg('旧版无限层存档缺少世界坐标，已移至本层安全入口。', 'system')
      else if (placement !== 'exact') this.msg('原存档落点已被地形占用，已移至附近安全位置。', 'system')
      this.msg(`读档成功——回到 ${levelLabel(snap.level)}。`, 'system')
      return
    }
    this.loadLevel(0)
    if (this.mpSpawnSlot !== null) level.applyMpSpawn(this, this.mpSpawnSlot) // v58：联机槽位出生 + 全槽位物资
    this.introT = 3.2 // 开场：摔到 L0 地面后缓慢爬起
    this.msg(`你坠入了后室。种子 ${seedString(seed)}`, 'system')
    this.msg('找到每层的出口，向下探索。收集 6 盘磁带。', 'lore')
    this.persist() // v29a/v54：新开局立即写入绑定槽位，保证槽内快照始终同局（自动槽由 loadLevel 切层存档覆盖）
  }

  // ---------- 存档读写（engine/save.ts）----------
  // v29a：当前进度快照（纯 JSON 可序列化）
  snapshot(): SaveSnapshot { return save.snapshot(this) }
  /** 立即写盘（暂停/退回主界面/周期自动存档共用入口；死亡与胜利后不再覆盖存档） */
  persist() { save.persist(this) }

  // ---------- 层级切换与出口（engine/level.ts）----------
  loadLevel(id: number, restore?: { mapSeed: number; firstVisit: boolean }) { level.loadLevel(this, id, restore) }
  /** v39：无限层级 NPC 同步——从已加载 LiveChunk 收集活体 NPC（窗口平移后重收集） */
  syncInfNpcs() { level.syncInfNpcs(this) }
  updateInfiniteWindow() { level.updateInfiniteWindow(this) }
  nearestExit() { return level.nearestExit(this) }
  /** v35：最近的定居点地标（出口提示的替代目标——附近无出口时指向它） */
  nearestLandmark() { return level.nearestLandmark(this) }
  /** v57o：游泳信息（HUD 水深/氧气显示；仅在深水中非 null） */
  swimInfo() {
    const p = this.player, m = this.map
    if (!m || this.inLiquid !== 1) return null
    const i = Math.floor(p.y) * m.w + Math.floor(p.x)
    const depth = this.levelDef.id === 7 ? Math.max(0, -p.z) : (m.seaFloor?.[i] ?? 1.7)
    return { depth, breath: this.breathT, limit: movement.breathLimit(this), submerged: this.submerged }
  }
  takeExit(def: ExitDef) { level.takeExit(this, def) }
  updateStairs(dt: number) { level.updateStairs(this, dt) }
  switchL6Floor(target: -1 | 0, reason: 'stairs' | 'pit' = 'stairs') { return level.switchL6Floor(this, target, reason) }
  placeBonusStairs() { level.placeBonusStairs(this) }
  /** v35：前往据点（地标弹窗「前往」/DevPanel 据点跳转共用）：记录返程层级后切入 */
  enterOutpost(outpostId: string, dev = false): boolean { return level.enterOutpost(this, outpostId, dev) } // v54：dev=DevPanel 跳转绕过准入门槛
  /** v55：家常酒店入住申请（地标卡办理，永久解锁） */
  applyHomelyStay() { level.applyHomelyStay(this) }

  // ---------- 移动/输入积分 + 垂直物理（engine/movement.ts）----------
  updateMovement(dt: number, dm: (typeof DIFF)[Difficulty], introLock: boolean): number | null { return movement.updateMovement(this, dt, dm, introLock) }
  updateClimb(dt: number, mag: number) { movement.updateClimb(this, dt, mag) }

  // ---------- 生存属性（engine/survival.ts）----------
  updateSurvival(dt: number, dm: (typeof DIFF)[Difficulty], mag: number): boolean { return survival.updateSurvival(this, dt, dm, mag) }

  // ---------- 实体 AI 与感知（engine/entityAI.ts）----------
  updateVendingMachines() { entityAI.updateVendingMachines(this) }
  isLit(x: number, y: number): boolean { return entityAI.isLit(this, x, y) }
  noiseEvent(x: number, y: number, radius: number, sprint: boolean) { entityAI.noiseEvent(this, x, y, radius, sprint) }
  lookingAt(e: Entity): boolean { return entityAI.lookingAt(this, e) }
  los(x0: number, y0: number, x1: number, y1: number): boolean { return entityAI.los(this, x0, y0, x1, y1) }
  updateEntities(dt: number, dmgMult: number) { entityAI.updateEntities(this, dt, dmgMult) }
  wanderTarget(e: Entity) { entityAI.wanderTarget(this, e) }
  wanderDeflect(e: Entity) { entityAI.wanderDeflect(this, e) }
  provokeRatPack(e: Entity) { entityAI.provokeRatPack(this, e) }
  updateNguithr(e: Entity, d: number, dt: number) { entityAI.updateNguithr(this, e, d, dt) }
  faceToward(e: Entity, tx: number, ty: number, dt: number, rate: number) { entityAI.faceToward(this, e, tx, ty, dt, rate) }
  entityWalkH(m: GameMap, tx: number, ty: number, band: FloorBand, aquatic = false): number | null { return entityAI.entityWalkH(this, m, tx, ty, band, aquatic) }
  stepEntity(e: Entity, speed: number, dt: number): boolean { return entityAI.stepEntity(this, e, speed, dt) }
  meleeZOk(e: Entity): boolean { return entityAI.meleeZOk(this, e) }

  // ---------- 战斗/投掷/击退 + 粒子（engine/combat.ts）----------
  hurtPlayer(dmg: number, source: string) { combat.hurtPlayer(this, dmg, source) }
  die(cause: string, force = false) { combat.die(this, cause, force) }
  attackReach(e: Entity): number { return combat.attackReach(this, e) }
  canHit(e: Entity): boolean { return combat.canHit(this, e) }
  /** 准星当前可命中的最近实体（渲染层据此改变准星样式） */
  aimEntity(): Entity | null { return combat.aimEntity(this) }
  killCheck(e: Entity) { combat.killCheck(this, e) }
  attack() { combat.attack(this) }
  throwHeld(type: string) { combat.throwHeld(this, type) }
  /** 往滋水枪储罐装入 1 瓶液体（3 份喷射量；储罐只能装一种液体，清水无需对应物品） */
  loadSquirt(liquid: 'water' | 'almond' | 'cashew' | 'liquidpain'): boolean { return combat.loadSquirt(this, liquid) }
  /** 清空储罐（把残液倒掉，换液体免喷完） */
  clearSquirt() { combat.clearSquirt(this) }
  stanleyTeleport() { combat.stanleyTeleport(this) }
  shootChocolate() { combat.shootChocolate(this) }
  squirt() { combat.squirt(this) }
  updateProjectiles(dt: number) { combat.updateProjectiles(this, dt) }
  landProjectile(pr: Projectile, x: number, y: number) { combat.landProjectile(this, pr, x, y) }
  bloodParticles(x: number, y: number) { combat.bloodParticles(this, x, y) }
  steamParticles(x: number, y: number) { combat.steamParticles(this, x, y) }
  splashParticles(x: number, y: number, z: number) { combat.splashParticles(this, x, y, z) }
  bubbleParticles(x: number, y: number, z: number) { combat.bubbleParticles(this, x, y, z) }
  rippleParticles(x: number, y: number) { combat.rippleParticles(this, x, y) }
  updateParticles(dt: number) { combat.updateParticles(this, dt) }

  // ---------- 交互/容器/结构触发（engine/interact.ts）----------
  updateElecHum() { interact.updateElecHum(this) }
  updateContainerSearch(dt: number) { interact.updateContainerSearch(this, dt) }
  triggerStructs(dt: number, dm: (typeof DIFF)[Difficulty]): boolean { return interact.triggerStructs(this, dt, dm) }
  inView(x: number, y: number, radius: number): boolean { return interact.inView(this, x, y, radius) }
  viewAngle(x: number, y: number): number { return interact.viewAngle(this, x, y) }
  interactionProbe(
    x: number, y: number, z: number, band: FloorBand, maxDistance: number, radius = 0.25,
    volume?: interact.InteractionVolume,
  ) {
    return interact.interactionProbe(this, x, y, z, band, maxDistance, radius, volume)
  }
  scanInteract() { interact.scanInteract(this) }
  doInteract() { interact.doInteract(this) }
  rollLoot(kind: string): string[] { return interact.rollLoot(this, kind) }
  finishSearch(s: Structure) { interact.finishSearch(this, s) }
  // 从战利品面板拿取一件（返回 false=背包满）
  takeLoot(i: number): boolean { return interact.takeLoot(this, i) }
  takeAllLoot() { interact.takeAllLoot(this) }
  closeLootPanel() { interact.closeLootPanel(this) }
  afterLootChange() { interact.afterLootChange(this) }

  // ---------- NPC/对话/委托/声望（engine/npc.ts）----------
  updateJerry(dt: number) { npc.updateJerry(this, dt) }
  updateNpcs(dt: number) { npc.updateNpcs(this, dt) }
  trackQuests(dt: number) { npc.trackQuests(this, dt) }
  /** 调整某团体声望（clamp ±100；流浪者等无声望团体直接忽略） */
  changeRep(factionId: string, delta: number) { npc.changeRep(this, factionId, delta) }
  /** 模仿 BRC 员工的动作进行装修：播放挥臂动画，动作播完 +2 声望；全局冷却 ~90s（冷却中返回 false） */
  mimicBrc(): boolean { return npc.mimicBrc(this) }
  /** 向 BRC 员工坦白你伤害/杀死了他们的同事：结清未告发记录，且该员工转为敌对 */
  confessBrc(npcId: string): boolean { return npc.confessBrc(this, npcId) }
  aimJerry(): Entity | null { return npc.aimJerry(this) }
  canAgreeJerry(npcId: string): boolean { return npc.canAgreeJerry(this, npcId) }
  agreeJerry(npcId: string): boolean { return npc.agreeJerry(this, npcId) }
  gotoJerryRoom(npcId: string): boolean { return npc.gotoJerryRoom(this, npcId) }
  slanderJerry(npcId: string): boolean { return npc.slanderJerry(this, npcId) }
  hurtJerryRep() { npc.hurtJerryRep(this) }
  contactJerry(ent?: Entity): boolean { return npc.contactJerry(this, ent) }
  tameJerry(): boolean { return npc.tameJerry(this) }
  preachQuest() { return npc.preachQuest(this) }
  preachTargetOk(npcId: string): boolean { return npc.preachTargetOk(this, npcId) }
  preachTo(npcId: string): boolean { return npc.preachTo(this, npcId) }
  questOffers(faction: QuestFaction = 'meg'): QuestDef[] { return npc.questOffers(this, faction) }
  acceptQuest(def?: QuestDef): boolean { return npc.acceptQuest(this, def) }
  turnInQuest(faction: QuestFaction = 'meg'): boolean { return npc.turnInQuest(this, faction) }
  deliverQuestTo(npcId: string): boolean { return npc.deliverQuestTo(this, npcId) }
  goodsQuestOffers(): QuestDef[] { return npc.goodsQuestOffers(this) }
  deliverGoodsTo(npcId: string): boolean { return npc.deliverGoodsTo(this, npcId) }
  failGoodsQuest(): boolean { return npc.failGoodsQuest(this) }
  basicSupplyCount(): number { return npc.basicSupplyCount(this) }
  canClaimEl3aRelief(): boolean { return npc.canClaimEl3aRelief(this) }
  claimEl3aRelief(): boolean { return npc.claimEl3aRelief(this) }
  /** v55：求治感染（疫疾三阶以上，仅医疗身份 NPC——杜邦/马丁/莫雷尔/萨伊拉·昆恩） */
  cureInfection(npcId: string): boolean { return npc.cureInfection(this, npcId) }

  // ---------- 背包/装备/物品使用（engine/inventory.ts）----------
  addItem(type: string): boolean { return inventory.addItem(this, type) }
  hasItem(type: string): boolean { return inventory.hasItem(this, type) }
  countItem(type: string): number { return inventory.countItem(this, type) }
  consumeItem(type: string): boolean { return inventory.consumeItem(this, type) }
  useSlot(where: SlotWhere, i: number) { inventory.useSlot(this, where, i) }
  drawChalk() { inventory.drawChalk(this) }
  quickUse() { inventory.quickUse(this) }
  quickDrop() { inventory.quickDrop(this) }
  slotGet(r: SlotRef): InvSlot | null { return inventory.slotGet(this, r) }
  slotSet(r: SlotRef, v: InvSlot | null) { inventory.slotSet(this, r, v) }
  // 口袋中是否有指定物品（钥匙/门禁卡/护符类判定走口袋，不再全背包生效）
  hasPocket(type: string): boolean { return inventory.hasPocket(this, type) }
  dropSlot(where: SlotWhere, i: number) { inventory.dropSlot(this, where, i) }
  unequipSlot(where: SlotWhere, i: number): boolean { return inventory.unequipSlot(this, where, i) }
  equipItem(where: SlotWhere, i: number): boolean { return inventory.equipItem(this, where, i) }
  moveSlot(from: SlotRef, to: SlotRef): boolean { return inventory.moveSlot(this, from, to) }
  syncPassives() { inventory.syncPassives(this) }
  warpToBerryLevel(tag?: number) { inventory.warpToBerryLevel(this, tag) }

  // ---------- 据点寄存仓库（engine/warehouse.ts，v54）----------
  /** NPC 的阵营仓库 id（非寄存 NPC 返回 null） */
  warehouseOfNpc(npcId: string): warehouse.WarehouseFaction | null { return warehouse.warehouseOfNpc(npcId) }
  /** 声望门槛：对应团体声望 ≥10 开放（或 BNTG 付费临时解锁） */
  canUseWarehouse(npcId: string): boolean { return warehouse.canUseWarehouse(this, npcId) }
  /** BNTG 付费通道：付 5 压印币，本次对话临时使用仓库（MEG 无付费通道） */
  payWarehouseAccess(fac: warehouse.WarehouseFaction): boolean { return warehouse.payWarehouseAccess(this, fac) }
  /** 寄存：背包/快捷栏物品移入阵营仓库（同类并摞；满仓失败） */
  warehouseDeposit(fac: warehouse.WarehouseFaction, from: SlotRef): boolean { return warehouse.warehouseDeposit(this, fac, from) }
  /** 取回：仓库栏位移回背包（背包满失败） */
  warehouseWithdraw(fac: warehouse.WarehouseFaction, i: number): boolean { return warehouse.warehouseWithdraw(this, fac, i) }

  // ---------- 现象与停电/视野（engine/ambient.ts）----------
  updateAmbient(dt: number) { ambient.updateAmbient(this, dt) }
  rollAmbientEvent() { ambient.rollAmbientEvent(this) }
  startBlackout(dur: number) { ambient.startBlackout(this, dur) }
  applyBlackout() { ambient.applyBlackout(this) }
  spawnBlackoutSmilers() { ambient.spawnBlackoutSmilers(this) }
  endBlackout() { ambient.endBlackout(this) }
  computeVisibility() { ambient.computeVisibility(this) }

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
    unstuck.updateUnstuckCheck(this, dt)
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

  getInteract(): { kind: string; label: string } | null { return this.interactTarget }

  /** 暂停页脱困：开始 3 秒真实移动检测；成功后由引擎自动传送到安全连通地块。 */
  startUnstuckCheck(): boolean { return unstuck.startUnstuckCheck(this) }
  /** 暴露给冒烟测试/诊断：当前位置是否存在连续逃生路径。 */
  canEscapeCurrentPosition(): boolean { return unstuck.canEscapeCurrentPosition(this) }
  /** 暴露给冒烟测试/诊断：计算最近的开阔连通安全落点。 */
  findUnstuckDestination(): unstuck.UnstuckDestination | null { return unstuck.findUnstuckDestination(this) }

  private step(dt: number) {
    if (!this.map || this.paused || this.over) return
    dt = Math.min(dt, 0.05)
    this.time += dt
    // v29a/v54：每 60 秒自动存档到「自动保存」槽（退回主界面后从自动槽继续可恢复进度用；
    // 手动槽由暂停/退回标题落盘与切层之外的节点维护）
    this.autosaveT += dt
    if (this.autosaveT >= 60) { this.autosaveT = 0; save.persist(this, 'auto') }
    const p = this.player
    const dm = DIFF[this.difficulty]
    // v51：糖果效果计时器（EFFECTS 注册表 pre 组：糖瘾/银舌头/枪糖/巧克力冷却——与原内联顺序一致）
    runEffectTicks(this, dt, 'pre')
    // v51：人制品售货机——看过背面后，玩家背对它（视线锥外且 10m 内）即活化追击；受到攻击也会活化
    this.updateVendingMachines()
    // v51：人制品效应计时（5 分钟）+ Nguithr'xurh 镇静剂麻痹计时（EFFECTS 注册表 post 组）
    runEffectTicks(this, dt, 'post')
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
          save.clearRunSlots(this) // v29a/v54：通关后本局进度的存档槽失效（绑定槽 + 自动槽）
          this.emit({ kind: 'victory' })
          audio.stopHum(); audio.stopBGM(); audio.stopRain(); audio.setHeartbeat(false, 0) // v54：雨声随通关停止
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

    // ---- 移动 ----（engine/movement.ts；返回 null=本帧已死亡/终止，同原 step 内 return）
    const mag = this.updateMovement(dt, dm, introLock)
    if (mag === null) return

    // ---- 生存消耗（engine/survival.ts；返回 true=本帧已死亡）----
    if (this.updateSurvival(dt, dm, mag)) return

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

    // ---- v45：信众领地判定 / 教化诵咏 / 接触冷却（engine/npc.ts）----
    this.updateJerry(dt)
    // ---- v35：NPC 步进 + v39：BRC 模仿装修结算（engine/npc.ts）----
    this.updateNpcs(dt)

    // ---- v51：L3 配电箱电流嗡鸣（engine/interact.ts）----
    this.updateElecHum()

    // ---- 交互检测 ----
    this.scanInteract()
    if (this.input.interact) {
      this.input.interact = false
      this.doInteract()
    }

    // ---- 容器搜索进度 / 战利品面板自动关闭（engine/interact.ts）----
    this.updateContainerSearch(dt)

    // ---- 粒子 ----
    this.updateParticles(dt)

    // 未涂黑窗户陷阱 / 锈蚀钢筋 / 蒸汽阀门伤害（engine/interact.ts；返回 true=本帧已死亡）
    if (this.triggerStructs(dt, dm)) return

    // ---- 层级氛围事件（wiki 设定播报）+ L1 停电恢复（engine/ambient.ts）----
    this.updateAmbient(dt)

    // ---- 视野 ----
    this.computeVisibility()

    this.camShake = Math.max(0, this.camShake - dt * 2.2)
  }

  get levelDef() { return levelDefOf(this.player.level)! }

  // ---------- 开发者模式 API（engine/dev.ts；仅供开发者面板/冒烟测试调用）----------
  devJump(id: number) { dev.devJump(this, id) }
  devJumpOutpost(outpostId: string): boolean { return dev.devJumpOutpost(this, outpostId) }
  devForward(): { fx: number; fy: number } { return dev.devForward(this) }
  devFindSpot(cx: number, cy: number, maxR = 6): { x: number; y: number } | null { return dev.devFindSpot(this, cx, cy, maxR) }
  /** 召唤实体：在玩家前方 dist 格（默认 3）生成指定类型实体 */
  devSpawnEntity(type: string, dist = 3): boolean { return dev.devSpawnEntity(this, type, dist) }
  /** 每种实体各召唤一只，环绕玩家排开 */
  devSpawnAllEntities(): number { return dev.devSpawnAllEntities(this) }
  /** 给予物品：默认进背包；toGround=true 时生成在玩家脚下 */
  devGiveItem(type: string, toGround = false): boolean { return dev.devGiveItem(this, type, toGround) }
  /** 一键全套补给：杏仁水×5 罐头×5 电池×3（放不下的掉到脚下） */
  devGiveSupplies() { dev.devGiveSupplies(this) }
  /** 状态控制：设置单项数值（0-100）。会自动解除状态锁定使数值生效。 */
  devSetStat(key: 'hp' | 'sanity' | 'hunger' | 'thirst' | 'stamina' | 'battery' | 'infection', v: number) { dev.devSetStat(this, key, v) }
  /** 全部补满 */
  devFillStats() { dev.devFillStats(this) }
  /** 全部清空（HP 保留 1 防死亡） */
  devDrainStats() { dev.devDrainStats(this) }
  /** 召唤指定出口：仅限本层可生成的种类（levelDef.exits）；在玩家附近邻墙地板生成一个并标记已发现 */
  devSummonExit(kind: string): boolean { return dev.devSummonExit(this, kind) }
  /** v54：传送到本层已生成的指定种类出口（召唤出口「已存在则传送」） */
  devGotoExitKind(kind: string): boolean { return dev.devGotoExitKind(this, kind) }
  /** v54：召唤装饰物（decorRegistry 结构类条目；落位面前 1 格，无限层同步写 LiveChunk） */
  devSpawnDecor(kind: string): boolean { return dev.devSpawnDecor(this, kind) }
  /** 传送：exit=最近出口 / entity=最近实体 / container=最近未搜容器 / spawn=出生点 / landmark=最近定居点地标 */
  devTeleport(target: 'exit' | 'entity' | 'container' | 'spawn' | 'landmark' | 'island'): boolean { return dev.devTeleport(this, target) }
  /** v57t：传送到最近的 L7 荒岛 */
  devGotoIsland(): boolean { return dev.devGotoIsland(this) }
  /** 开发者：传送到本层指定 NPC 身旁（DevPanel 传送页 NPC 列表） */
  devGotoNpc(id: string): boolean { return dev.devGotoNpc(this, id) }
  /** 时间快进：模拟 sec 秒的生存消耗（饥饿/理智/电池），不触发伤害死亡 */
  devFastForward(sec = 60) { dev.devFastForward(this, sec) }
  /** 立即触发一次本层随机氛围事件 */
  devTriggerEvent() { dev.devTriggerEvent(this) }
  /** 强制停电 dur 秒（已在停电中则先恢复再触发） */
  devForceBlackout(dur = 20) { dev.devForceBlackout(this, dur) }
  /** v17：传送到无限 L0 最近的指定变体 chunk 中心（截图/冒烟测试用） */
  devGotoVariant(kind: string): boolean { return dev.devGotoVariant(this, kind) }
  /** 当前层级可能生成的固定结构（prefab）与变种房间清单，标注是否已出现在已生成区域 */
  devLevelStructures() { return dev.devLevelStructures(this) }
  /** 传送到指定固定结构；已生成区域没有时先在墙区开洞强制生成一个再传送 */
  devGotoPrefab(id: string): boolean { return dev.devGotoPrefab(this, id) }
  /** 测试场地：仅 L0 无限模式、开发者模式专用——在附近开辟 80×80 无墙空旷区域并传送（不会自然生成） */
  devTestField(): boolean { return dev.devTestField(this) }
  /** v17：传送到最近的保底出口「闪烁的墙壁」（窗口外也可达） */
  devGotoExit(): boolean { return dev.devGotoExit(this) }
  /** 重新生成当前层级：newSeed=true 换随机种子，否则同种子重建 */
  devRegenLevel(newSeed: boolean) { dev.devRegenLevel(this, newSeed) }
  /** 清场：击杀本层全部实体 */
  devKillAllEntities(): number { return dev.devKillAllEntities(this) }
  /** 调试信息快照（信息页签展示用） */
  devInfo() { return dev.devInfo(this) }

  /** 滋水枪储罐容量（份数）：9 瓶 × 每瓶 3 份 = 27 */
  static readonly SQUIRT_CAP = combat.SQUIRT_CAP
  static readonly BRC_MIMIC_CD = npc.BRC_MIMIC_CD // 模仿装修全局冷却（秒，防连点）
}

export const engine = new Engine()
