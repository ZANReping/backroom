// 游戏引擎：玩家/实体AI/生存系统/交互/出入口/事件派发
import { generateLevel, tileAt, tileH, groundHeightAt, solidStructAtFloor, bandOfZ, FLOOR_H, POOL_DEPTH, type GameMap } from './mapgen'
import { LEVELS, LEVEL_EVENTS, WIN_TAPES, NORMAL_LEVELS, levelLabel } from './levels'
import { ITEMS, itemName } from './items'
import { recordEncounter, makeEntity, ENTITIES, type Entity } from './entities'
import { createIntegrator, integrateMove, type MoveIntegrator } from './player'
import { look } from './renderer3d'
import type { ExitDef, LightSource, Structure } from './types'
import { audio } from './audio'
import { seedString, RNG, randomSeed } from './rng'
import { updateInfinite, l0NearestExit, findNearestVariant, CS, RARE_VARIANTS, VARIANT_NAMES, chunkKey, applyRedPlague, type L0Variant } from './infinite'
import { prefabsForLevel, placePrefabForced } from './prefabs'

export interface InvSlot { type: string; count: number }
// 装备槽位标识：hotbar/backpack 为背包格；offhand/body/gloves/pocket 为装备位（主手=快捷栏选中项，不是独立槽位）
export type SlotWhere = 'hotbar' | 'backpack' | 'offhand' | 'body' | 'gloves' | 'pocket'
export interface SlotRef { w: SlotWhere; i: number }
export interface EquipState {
  offhand: InvSlot | null // 副手：持久手持（打火机）
  body: InvSlot | null // 身体：服饰（绝缘服）
  gloves: InvSlot | null // 手套：隔热手套
  pockets: (InvSlot | null)[] // 口袋 ×4：持久小物（兔子脚/门禁卡/钥匙）
}
export type MsgKind = 'loot' | 'damage' | 'lore' | 'system'
export interface HudEvent {
  kind: 'msg' | 'toast' | 'damage' | 'sanityhit' | 'transition' | 'dead' | 'victory' | 'levelchange' | 'lootpanel'
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

// v23：可搜索容器统一表（名称 / 搜索时长 / 掉落池 / 件数 / 前置条件）
// 物品生成容器化后，多数补给需要开箱才能拿到；掉落池按容器语义分化。
export const CONTAINERS: Record<string, { label: string; dur: number; pool: string[]; n: number; gate?: 'carkey' | 'crowbar' }> = {
  crate:    { label: '补给箱',        dur: 1.8, n: 2, pool: ['almond', 'canned', 'bandage', 'battery', 'tape', 'glowstick'] },
  corpse:   { label: '尸体',          dur: 1.2, n: 1, pool: ['bandage', 'almond', 'battery', 'tape', 'wallpaper'] },
  car:      { label: '后备箱',        dur: 1.8, n: 2, pool: ['gas', 'almond', 'canned', 'battery', 'tape'], gate: 'carkey' },
  cabinet:  { label: '配电柜',        dur: 1.8, n: 2, pool: ['battery', 'fuse', 'capacitor', 'tape'] },
  dresser:  { label: '柜子',          dur: 1.6, n: 2, pool: ['silverware', 'sedative', 'almond', 'bandage', 'tape'] },
  megcrate: { label: 'M.E.G. 补给箱', dur: 2.0, n: 3, pool: ['almond', 'almond', 'bandage', 'battery', 'megfolder', 'tape'] },
  // v23 新增容器
  locker:   { label: '储物柜',        dur: 1.6, n: 2, pool: ['battery', 'bandage', 'canned', 'flashlight', 'housekey', 'tape'] },
  toolbox:  { label: '工具箱',        dur: 1.4, n: 2, pool: ['crowbar', 'wrench', 'nails', 'battery', 'timber', 'tape'] },
  suitcase: { label: '行李箱',        dur: 1.6, n: 2, pool: ['bandage', 'almond', 'lighter', 'rabbit', 'pamphlet', 'tape'] },
  fridge:   { label: '冰箱',          dur: 1.5, n: 2, pool: ['canned', 'almond', 'citywater', 'driedfruit', 'thingmeat'] },
  safebox:  { label: '保险箱',        dur: 2.4, n: 3, pool: ['presses', 'sedative', 'keycard', 'skeleton', 'rabbit', 'tape'], gate: 'crowbar' },
  mailbox:  { label: '信箱',          dur: 1.1, n: 1, pool: ['housekey', 'pamphlet', 'wallpaper', 'endnote', 'tape'] },
  barrel:   { label: '木桶',          dur: 1.5, n: 2, pool: ['almond', 'almond', 'oddbook', 'rope', 'tape'] },
  bookcase: { label: '书柜',          dur: 1.6, n: 2, pool: ['oddbook', 'oddbook', 'pamphlet', 'megfolder', 'tape'] },
  bonepile: { label: '骨堆',          dur: 1.4, n: 1, pool: ['bandage', 'divemask', 'rope', 'wallpaper', 'tape'] },
  campstall:{ label: '营地摊位',      dur: 2.0, n: 3, pool: ['driedfruit', 'cavingsuit', 'uvlamp', 'almond', 'battery', 'xenonmarble'] },
}

export class Engine {
  map: GameMap | null = null
  player: PlayerState
  input: InputState = { mx: 0, my: 0, sprint: false, attack: false, interact: false, toggleLight: false, jump: false, crouch: false }
  listeners: ((e: HudEvent) => void)[] = []
  difficulty: Difficulty = 'normal'
  seed = 1
  noise = 0 // 当前噪音值 0-1（HUD 显示）
  camShake = 0
  time = 0
  paused = false
  over = false
  victory = false
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
  private chimeT = 0
  // v12：interactTarget 携带目标引用（结构/物品/出口），HUD 提示与 doInteract 执行
  // 共用 scanInteract 的同一选择结果，杜绝「提示普通门却触发相邻上锁门」的目标漂移。
  private interactTarget: { kind: string; label: string; s?: Structure; it?: GameMap['items'][number]; e?: GameMap['exits'][number] } | null = null
  // 开发者模式（v8 扩展：statLock=每帧锁满状态，oneHit=一击必杀，invisible=实体不追击，frozenAI=冻结实体）
  dev = { god: false, noclip: false, speed: false, statLock: true, oneHit: false, invisible: false, frozenAI: false }
  // 地图就地修改版本号（开发者强制生成固定结构时 +1；渲染层据此重建有限层静态几何）
  mapRev = 0
  // 开场爬起动画计时（>0 时锁定移动/攻击/跳跃，渲染层相机从贴地侧躺缓慢起身）
  introT = 0
  // 容器搜索（按住交互 → 进度 → 战利品面板）
  searching: { sid: number; t: number; dur: number; label: string } | null = null
  lootPanel: { sid: number; label: string; items: string[] } | null = null
  private statusMsgT = { hunger: 0, battery: 0, stamina: 0 }
  private seenThisLevel = new Set<string>() // 本层已记录遭遇的实体类型
  // 固定子步移动积分器（帧间保留时间余数，保证高低帧率位移一致）
  private moveIt: MoveIntegrator = createIntegrator()
  // 攻击挥动动画计时（渲染层读取做手部挥砍/准心收缩）
  attackAnimT = 0
  // 层级氛围事件（wiki 设定播报）计时
  private ambientT = 14
  // L1 停电事件：剩余时间 + 被移除光源的备份
  blackoutT = 0
  private blackoutBackup: LightSource[] | null = null

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
      equip: { offhand: null, body: null, gloves: null, pockets: [null, null, null, null] },
      kills: 0, tapes: 0, steps: 0,
      startTime: Date.now(), aliveTime: 0,
      hasGloves: false, hasSuit: false, hasLighter: false, hasRabbit: false, hasPockets: false,
      coffeeT: 0, leverPulled: false, slowT: 0, flashJamT: 0,
    }
  }

  on(fn: (e: HudEvent) => void) { this.listeners.push(fn) }
  emit(e: HudEvent) { for (const f of this.listeners) f(e) }
  msg(text: string, kind: MsgKind = 'system') { this.emit({ kind: 'msg', text, msgKind: kind }) }

  newRun(seed: number, difficulty: Difficulty) {
    this.seed = seed
    this.difficulty = difficulty
    this.player = this.freshPlayer()
    this.over = false; this.victory = false; this.transition = null
    this.time = 0
    this.loadLevel(0)
    this.introT = 3.2 // 开场：摔到 L0 地面后缓慢爬起
    this.msg(`你坠入了后室。种子 ${seedString(seed)}`, 'system')
    this.msg('找到每层的出口，向下探索。收集 6 盘磁带。', 'lore')
  }

  loadLevel(id: number) {
    const def = LEVELS[id]
    this.map = generateLevel(def, this.seed + this.time * 7 + id * 131)
    this.player.level = id
    this.player.x = this.map.spawn.x + 0.5
    this.player.y = this.map.spawn.y + 0.5
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
    this.fakes = []
    this.particles = []
    this.searching = null
    this.lootPanel = null
    this.seenThisLevel = new Set()
    this.blackoutT = 0
    this.provoked = false
    this.blackoutBackup = null
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
      stairs: '楼梯间的穿堂风从某个方向吹来。',
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
      flickerdoor: '某处有一扇灯光疯狂闪烁的门——跟着电流声与气流走。',
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
    const p = this.player
    const m = this.map
    const dm = DIFF[this.difficulty]

    // 过渡动画中
    if (this.transition) {
      this.transition.t += dt
      if (this.transition.t > 0.9) {
        const t = this.transition
        this.transition = null
        if (t.dest === 'win') {
          this.victory = true; this.over = true
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
    if (wantSprint) { speed = 6.0; p.stamina = Math.max(0, p.stamina - 22 * dt) }
    else p.stamina = Math.min(100, p.stamina + (p.coffeeT > 0 ? 24 : 12) * dt)
    if (p.crouching) speed *= 0.5 // 蹲伏减速
    if (wet && lq === 0) speed *= 0.55
    if (lq !== 0) speed *= 0.5 // v13：液体中移动减速
    if (p.slowT > 0) { p.slowT -= dt; speed *= 0.5 }
    if (p.flashJamT > 0) p.flashJamT -= dt
    if (this.dev.speed) speed *= 1.8
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
    if (mag > 0.1 && !this.ride && !this.climb && !introLock) {
      // 固定子步积分：dt 先入累加器，按 FIXED_STEP 切分子步逐次「移动→解碰撞」。
      // 高帧率不会积分抖动，低帧率不会大步长穿墙弹回；脚步声/噪音按实际位移计。
      const scale = Math.min(mag, 1) / mag
      const moved = integrateMove(m, p, this.input.mx * scale, this.input.my * scale, speed, dt, this.moveIt, { noclip: this.dev.noclip, z: p.z, crouch: p.crouching, band })
      const movedDist = Math.hypot(moved.x, moved.y)
      p.facing = Math.atan2(this.input.my, this.input.mx)
      this.stepAcc += movedDist
      p.steps += movedDist
      if (this.stepAcc > 0.9) {
        this.stepAcc = 0
        const g0 = this.levelDef.gen
        if (lq !== 0) audio.swim() // 水中移动划水声
        else audio.footstep(g0 === 'garage' || g0 === 'grid' ? 'concrete' : g0 === 'pipes' ? 'metal' : 'carpet')
        this.noise = Math.min(1, this.noise + (wantSprint ? 0.5 : 0.15))
        if (wantSprint) this.noiseEvent(p.x, p.y, 10, true)
        else this.noiseEvent(p.x, p.y, 4, false)
      }
      // v13：移动涟漪（浅水与水面）
      if (lq !== 0 && movedDist > 0.01) {
        this.rippleT -= dt
        if (this.rippleT <= 0) { this.rippleT = 0.22; this.rippleParticles(p.x, p.y) }
      }
    }
    this.noise = Math.max(0, this.noise - dt * 1.2)

    // ---- v17：无限模式（L0）——玩家跨出中心 chunk 时流式平移窗口 ----
    if (m.inf) {
      this.updateInfiniteWindow()
      // 红室蔓延：玩家身处红室 → 周围所有房间与即将生成的新区域全部变成红室（不再产物资）
      const inf = m.inf
      if (!inf.plague) {
        const c = inf.chunks.get(chunkKey(Math.floor((inf.ox + p.x) / CS), Math.floor((inf.oy + p.y) / CS)))
        if (c?.variant === 'red') {
          applyRedPlague(m)
          p.sanity = Math.max(0, p.sanity - 15)
          this.camShake = Math.min(1, this.camShake + 0.5)
          audio.whisper(1)
          this.msg('红色漫过了你的脚踝——墙纸、地毯、灯光，一切都在变红。档案说得对：已经来不及了。', 'lore')
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
        this.emit({ kind: 'transition', anim: 'noclip', cutIn: LEVELS[td]?.entryAnim ?? 'dark', dest: td })
      }
    }

    // ---- v13：梯子攀爬（贴近按住前进即竖直攀爬）----
    if (!this.ride) this.updateClimb(dt, mag)

    // ---- v7：垂直（跳跃/重力/高度档贴地）+ v13 深水浮沉 ----
    if (this.ride || this.climb) {
      // 垂直位置由电梯/梯子脚本驱动
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
      const g = groundHeightAt(m, p.x, p.y, band)
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

    // ---- 生存消耗 ----
    p.hunger = Math.max(0, p.hunger - 0.28 * dm.drain * (this.levelDef.entropy ?? 1) * dt)
    if (p.hunger <= 25 && this.statusMsgT.hunger <= 0) {
      this.statusMsgT.hunger = 8
      this.msg('你饿得头晕。', 'damage')
      audio.stomach()
    }
    if (p.hunger <= 0 && !this.dev.god) { p.hp -= 1.2 * dt; if (p.hp <= 0) { this.die('饿死了'); return } }
    // 理智：黑暗中流失
    const lit = this.isLit(p.x, p.y)
    if (!this.dev.god) {
      if (!lit && !p.flashlight) p.sanity -= 1.5 * dm.drain * dt
      else if (!lit) p.sanity -= 0.5 * dm.drain * dt
      else p.sanity = Math.min(100, p.sanity + 0.4 * dt)
      // 附近实体压迫感
      for (const e of m.entities) {
        if (e.dead || e.hidden || e.disguised) continue
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d < 5 && !e.def.passive) p.sanity -= (5 - d) * 0.5 * dt
      }
      p.sanity = Math.max(0, Math.min(100, p.sanity))
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
    if (this.input.toggleLight) {
      this.input.toggleLight = false
      if (p.equip.offhand?.type !== 'flashlight') {
        this.msg('没有手电筒。它应该装在【副手】装备位。', 'system')
      } else if (p.battery > 0 || p.flashlight) {
        p.flashlight = !p.flashlight
        audio.uiTick()
        this.msg(p.flashlight ? '手电筒：开' : '手电筒：关', 'system')
      }
    }

    // ---- 实体 AI ----
    this.updateEntities(dt, dm.dmg)

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
    if (this.blackoutT > 0) {
      this.blackoutT -= dt
      if (this.blackoutT <= 0) this.endBlackout()
    }

    // ---- 视野 ----
    this.computeVisibility()

    // 出口提示音
    this.chimeT -= dt
    if (this.chimeT <= 0) {
      this.chimeT = 2.2
      const e = this.nearestExit()
      if (e) audio.exitChime(Math.hypot(e.x + 0.5 - p.x, e.y + 0.5 - p.y))
    }

    this.camShake = Math.max(0, this.camShake - dt * 2.2)
  }

  // ---------- 层级氛围事件（wiki 设定播报）----------
  private rollAmbientEvent() {
    const lvl = this.player.level
    // L1 停电事件（Fandom：停电数分钟到数天，实体倾巢而出）
    if (lvl === 1 && this.blackoutT <= 0 && Math.random() < 0.3) {
      this.startBlackout(14 + Math.random() * 10)
      return
    }
    const pool = LEVEL_EVENTS[lvl]
    if (!pool?.length) return
    this.msg(pool[Math.floor(Math.random() * pool.length)], 'lore')
  }

  private startBlackout(dur: number) {
    const m = this.map
    if (!m || this.blackoutBackup) return
    this.blackoutBackup = m.lights
    m.lights = m.lights.filter(() => Math.random() < 0.15) // 仅剩零星应急灯
    this.blackoutT = dur
    this.msg('灯光一排排熄灭——停电了。黑暗里有什么开始移动。', 'damage')
    audio.spark()
  }

  private endBlackout() {
    if (this.blackoutBackup && this.map) {
      // 停电期间玩家可能用荧光棒追加了光源，保留新增部分
      const added = this.map.lights.filter((l) => !this.blackoutBackup!.includes(l))
      this.map.lights = [...this.blackoutBackup, ...added]
    }
    this.blackoutBackup = null
    this.blackoutT = 0
    this.msg('电流声重新响起，灯光逐一恢复。', 'system')
  }

  private isLit(x: number, y: number): boolean {
    const m = this.map!
    for (const l of m.lights) if (Math.hypot(l.x - x, l.y - y) < l.r * 0.7) return true
    return false
  }

  private noiseEvent(x: number, y: number, radius: number, sprint: boolean) {
    for (const e of this.map!.entities) {
      if (e.dead || e.def.stationary) continue
      const d = Math.hypot(e.x - x, e.y - y)
      const hearR = sprint && e.def.hearsSprint ? e.def.hearing * 1.6 : e.def.hearing
      if (d < Math.max(radius, hearR) && e.state !== 'chase' && e.state !== 'attack') {
        e.state = 'investigate'; e.targetX = x; e.targetY = y; e.stateT = 6
      }
    }
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
      if (e.stunT > 0) { e.stunT -= dt; continue }
      // 开发者模式：隐形——所有距离判定视为无穷远，实体永不索敌/攻击/特殊触发
      const d = this.dev.invisible ? 1e9 : Math.hypot(e.x - p.x, e.y - p.y)
      const def = e.def

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
        if (!e.screamed && d < def.sight && this.los(e.x, e.y, p.x, p.y)) {
          e.screamed = true
          this.msg('久坐者发出了刺耳的尖叫！', 'damage')
          audio.aggro()
          this.noiseEvent(p.x, p.y, 20, true)
          p.sanity = Math.max(0, p.sanity - 10)
          this.emit({ kind: 'sanityhit' })
        }
        if (d < 1.2 && e.attackCd <= 0 && this.meleeZOk(e)) { e.attackCd = 1.2; this.hurtPlayer(def.damage * dmgMult, def.name) }
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

      // 视野追击
      const darkBonus = def.darkAmbusher && !lightOn ? 4 : 0
      const canSee = d < def.sight + darkBonus && this.los(e.x, e.y, p.x, p.y)
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
      if (def.passive && e.state === 'chase' && e.stateT < -8) { e.state = 'wander' }
      // 无面灵：贴身冲撞激怒
      if (def.passive && d < 0.6) {
        e.state = 'chase'; e.stateT = 0
        this.msg('你碰到了无面灵——它记住你了。', 'damage')
        audio.aggro()
      }
      // 趋光实体（死亡飞蛾）：被手电光吸引
      if (def.lightLure && lightOn && d < 11 && (e.state === 'wander' || e.state === 'idle')) {
        e.state = 'investigate'; e.targetX = p.x; e.targetY = p.y; e.stateT = 4
      }

      switch (e.state) {
        case 'idle':
          if (e.stateT <= 0) { e.state = 'wander'; this.wanderTarget(e) }
          break
        case 'wander': {
          if (this.stepEntity(e, def.speed * 0.45, dt)) this.wanderTarget(e)
          e.animT += dt * def.speed * 0.45
          break
        }
        case 'investigate': {
          if (this.stepEntity(e, def.speed * 0.7, dt) || e.stateT <= 0) { e.state = 'wander'; this.wanderTarget(e) }
          this.faceToward(e, p.x, p.y, dt, 5) // 调查中面向玩家方向
          e.animT += dt * def.speed * 0.7
          break
        }
        case 'chase': {
          if (def.passive) { e.state = 'wander'; break }
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
          } else {
            e.targetX = p.x; e.targetY = p.y
            this.stepEntity(e, def.speed, dt)
            this.faceToward(e, p.x, p.y, dt, 9) // 追击时平滑转向面向玩家
          }
          e.animT += dt * def.speed
          if (d < 0.85 && e.attackCd <= 0) {
            e.state = 'attack'; e.lungeT = 0.32; e.attackCd = 1.4
          } else if (!canSee && d > def.sight * 1.4 && !def.mirrorMove) {
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
    }
    m.entities = m.entities.filter((e) => !e.dead || e.deathT > 0)
  }

  private wanderTarget(e: Entity) {
    const m = this.map!
    const band = bandOfZ(e.z)
    for (let t = 0; t < 20; t++) {
      const a = Math.random() * Math.PI * 2
      const tx = e.x + Math.cos(a) * 5, ty = e.y + Math.sin(a) * 5
      const ti = Math.floor(ty) * m.w + Math.floor(tx)
      if (Math.floor(tx) < 0 || Math.floor(ty) < 0 || Math.floor(tx) >= m.w || Math.floor(ty) >= m.h) continue
      // v13：按所在楼层高度带选游荡目标（上层实体不下楼闲逛；楼梯口允许上下）
      if (m.stair[ti] & 7) { e.targetX = tx; e.targetY = ty; e.stateT = 4; return }
      if (band === 1 ? (m.up[ti] === 1 && m.upWall[ti] !== 1) : tileAt(m, Math.floor(tx), Math.floor(ty)) === 1) {
        if (band === 0 && m.liquid[ti] === 1) continue // 实体不主动下水
        e.targetX = tx; e.targetY = ty; e.stateT = 4; return
      }
    }
    e.targetX = e.x; e.targetY = e.y; e.stateT = 2
  }

  // 平滑转向（最短弧 lerp yaw）面向目标点
  private faceToward(e: Entity, tx: number, ty: number, dt: number, rate: number) {
    const want = Math.atan2(ty - e.y, tx - e.x)
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
    e.x = nx; e.y = ny
    // v13：跟随地面（楼梯坡道连续爬升；上下层带随 z 自动切换）
    e.z = groundHeightAt(m, e.x, e.y, bandOfZ(e.z))
    // 深坑：实体坠入后死亡（无血花，直坠深渊消散）
    if (m.elev[Math.floor(e.y) * m.w + Math.floor(e.x)] === 4 && !e.dead) {
      e.hp = 0; e.dead = true; e.deathT = 1.4
    }
    return false
  }

  // 实体近战高度判定：与玩家脚底高差 ≥1m 时够不着（高台/沟底/跨层安全）
  private meleeZOk(e: Entity): boolean {
    return Math.abs(e.z - this.player.z) < 1
  }

  hurtPlayer(dmg: number, source: string) {
    if (this.dev.god) return
    const p = this.player
    p.hp -= dmg
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
    audio.stopHum(); audio.stopBGM(); audio.setHeartbeat(false, 0)
    this.emit({ kind: 'dead', text: cause })
  }

  private attack() {
    const p = this.player, m = this.map!
    audio.swing()
    this.attackAnimT = 0.35 // 手部挥砍动画/准心收缩反馈
    const held = p.hotbar[p.selected]
    // 开发者模式：一击必杀
    const dmg = this.dev.oneHit ? 99999 : held ? (ITEMS[held.type].weapon ?? 8) : 8
    const reach = 1.6
    let hit = false
    for (const e of m.entities) {
      if (e.dead || e.disguised) continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d > reach) continue
      if (Math.abs(e.z - p.z) >= 1) continue // 高差过大打不到（跨层够不着）
      const ang = Math.atan2(e.y - p.y, e.x - p.x)
      let diff = Math.abs(ang - p.facing)
      if (diff > Math.PI) diff = Math.PI * 2 - diff
      if (diff > 1.1) continue
      // 绝缘猎手：近战伤害减半
      const eff = e.def.type === 'insulator' ? dmg * 0.5 : dmg
      e.hp -= eff
      e.stunT = 0.35
      e.x += Math.cos(ang) * 0.4; e.y += Math.sin(ang) * 0.4
      hit = true
      this.bloodParticles(e.x, e.y)
      if (e.def.type === 'insulator' && Math.random() < 0.4) this.msg('攻击被绝缘服缓冲了。', 'system')
      this.provoked = true // v23：主动挑衅解除「Level 11 Effect」的被动状态
      if (e.def.passive) { e.state = 'chase'; e.stateT = 0 } // 激怒无面灵
      if (e.hp <= 0) {
        e.dead = true; e.deathT = 1.4
        p.kills++
        this.msg(`击杀了 ${e.def.name}`, 'loot')
        if (Math.random() < (p.hasRabbit ? 0.6 : 0.35)) {
          const drops = ['bandage', 'almond', 'canned', 'battery']
          const t = drops[Math.floor(Math.random() * drops.length)]
          m.items.push({ id: Date.now() % 100000 + Math.random(), type: t, x: e.x, y: e.y })
        }
      }
    }
    if (hit) { audio.hit(); this.camShake = Math.min(1, this.camShake + 0.15) }
    // 空手/武器挥击也产生噪音
    this.noiseEvent(p.x, p.y, 5, false)
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
  private updateInfiniteWindow() {
    const m = this.map!
    const shift = updateInfinite(m, this.levelDef, this.player.x, this.player.y, this.explored)
    if (!shift) return
    const { dx, dy } = shift
    const p = this.player
    p.x -= dx; p.y -= dy
    for (const f of this.fakes) { f.x -= dx; f.y -= dy }
    for (const pt of this.particles) { pt.x -= dx; pt.y -= dy }
    // 窗口重建对象列表：中断进行中的引用型状态
    this.searching = null
    this.lootPanel = null
    this.interactTarget = null
    this.ride = null
    this.climb = null
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
      if (bi) { this.interactTarget = { kind: 'item', label: `拾取 ${itemName(bi.type)}`, it: bi }; return }
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
      if (d > 2.2 || !this.inView(cx, cy, 2.2)) continue
      // v13：结构按楼层过滤（楼上楼下同名容器互不干扰）；lift 跨层服务
      if (s.kind !== 'lift' && (s.floor ?? 0) !== band) continue
      if (s.kind === 'lift') { consider('lift', band === 0 ? '乘电梯 上楼' : '乘电梯 下楼', s, d, !this.ride); continue }
      // v18：已搜空容器仍可选中（交互时提示「容器是空的」），未搜空的正常提示
      // v23：全部容器走统一表（含新增的储物柜/工具箱/行李箱/冰箱/保险箱/信箱/木桶/书柜/骨堆/营地摊位）
      if (CONTAINERS[s.kind]) {
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
      else if (s.kind === 'roadsign' || s.kind === 'megsign') consider('roadsign', '查看 路标', s, d, true)
      else if (s.kind === 'braille') consider('braille', '摸读 墙上的刻痕', s, d, true)
      else if (s.kind === 'arcadecab') consider('arcadecab', '投币 街机', s, d, true)
      else if (s.kind === 'endletters') consider('endletters', '走近 金属字母', s, d, true)
      else if (s.kind === 'clipfuse') consider('clipfuse', '查看 卡在一起的两栋房子', s, d, true)
      else if (s.kind === 'handspike') consider('handspike', '触摸 石头做的手', s, d, true)
      else if (s.kind === 'hoteldoor') {
        if (s.data?.locked) {
          const can = this.hasItem('crowbar') || this.hasPocket('skeleton')
          consider('hoteldoor', can ? '撬开 上锁的房门' : '上锁的房门（需要撬棍/万能钥匙）', s, d, can)
        } else consider('hoteldoor', s.data?.open ? '关上 房门' : '打开 房门', s, d, true)
      }
      else if (s.kind === 'rollerdoor') consider('rollerdoor', s.data?.open ? '放下 卷帘门' : '升起 卷帘门', s, d, true)
      else if (s.kind === 'glassdoor') consider('glassdoor', s.data?.open ? '关上 玻璃门' : '推开 玻璃门', s, d, true)
      else if (s.kind === 'glasswin') consider('glasswin', '眺望 窗外', s, d, true)
      else if (s.kind === 'windowtrap') consider('windowtrap', s.data?.triggered ? '查看 窗户（已无异常）' : '查看 未涂黑的窗户', s, d, true)
      else if (s.kind === 'windowblack') consider('windowblack', '查看 涂黑的窗户', s, d, true)
      else if (s.kind === 'graffiti') consider('graffiti', '查看 涂鸦', s, d, true)
      else if (s.kind === 'valve') consider('valve', s.data?.on ? '关闭 蒸汽阀门' : '打开 蒸汽阀门', s, d, true)
      else if (s.kind === 'booth' && !this.player.leverPulled) consider('lever', '扳动 电源拉杆', s, d, true)
      else if (s.kind === 'server' && s.locked) consider('server', '刷门禁卡 进入', s, d, this.hasPocket('keycard'))
      else if (s.kind === 'vending') consider('vending', '使用 自动售货机', s, d, true)
      else if (s.kind === 'frontdesk') consider('frontdesk', '与前台交易', s, d, true)
    }
    //（闭包内赋值 TS 无法跟踪，显式还原声明类型）
    const picked = best as { kind: string; label: string; s: Structure } | null
    this.interactTarget = picked ? { kind: picked.kind, label: picked.label, s: picked.s } : null
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
          if (this.addItem(bi.type)) {
            m.items = m.items.filter((i) => i !== bi)
            if (m.inf) m.inf.taken.add(bi.id) // v17：防止窗口重载后物品复活
            audio.pickup(bi.type === 'tape')
            if (bi.type === 'tape') { p.tapes++; this.msg(`拾取 磁带（${p.tapes}/${WIN_TAPES}）`, 'lore') }
            this.emit({ kind: 'toast', text: `+1 ${itemName(bi.type)}` })
          } else this.msg('背包已满。', 'system')
        }
        break
      }
      case 'crate': case 'corpse': case 'car': case 'cabinet': case 'dresser': case 'megcrate':
      case 'locker': case 'toolbox': case 'suitcase': case 'fridge': case 'safebox':
      case 'mailbox': case 'barrel': case 'bookcase': case 'bonepile': case 'campstall': {
        const kind = t.kind
        // v12：搜索 scanInteract 选中的同一容器（不再是数组序第一个同类容器）
        const s = t.s && t.s.kind === kind && Math.hypot(t.s.x + t.s.w / 2 - p.x, t.s.y + t.s.h / 2 - p.y) < 2.6 ? t.s : null
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
        this.msg('路标上有 M.E.G. 的标志，还有一个箭头。', 'lore')
        if (ex) { for (const e2 of m.exits) e2.discovered = true; this.msg('你记下了方向——出口的位置标在了地图上。', 'loot') }
        audio.uiTick()
        break
      }
      case 'braille': {
        const marks = ['「往回走」', '「这边死路」', '「第 3 次经过这里」', '「别应声」']
        this.msg(`指尖摸到一行刻痕：${marks[Math.floor(Math.random() * marks.length)]}`, 'lore')
        p.sanity = Math.min(100, p.sanity + 4)
        audio.uiTick()
        break
      }
      case 'arcadecab': {
        // Wikidot Level 11：位置不合常理的街机柜——任何交互都会把你送去 Level 25
        this.msg('屏幕亮了。它没有投币口，但它开始运行了。', 'lore')
        const ad = Math.floor(Math.random() * NORMAL_LEVELS)
        this.transition = { anim: 'glitch', t: 0, dest: ad }
        this.emit({ kind: 'transition', anim: 'glitch', cutIn: LEVELS[ad]?.entryAnim, dest: ad })
        break
      }
      case 'endletters': {
        this.msg('金属字母底下积了一层灰：the end is near。', 'lore')
        this.msg('落款没有日期。你数了数字母之间的间距——它们是均匀的，均匀得像印刷。', 'system')
        p.sanity = Math.max(0, p.sanity - 6)
        break
      }
      case 'clipfuse': {
        this.msg('一间卧室的墙，从另一间的餐桌中央穿了出来。两栋房子都完好，只是它们同时占着这一块地方。', 'lore')
        p.sanity = Math.max(0, p.sanity - 10)
        this.emit({ kind: 'sanityhit' })
        break
      }
      case 'handspike': {
        this.msg('石头做的手。指节分明，掌纹清晰——上面有指纹，而且和你见过的任何一枚都不一样。', 'lore')
        this.msg('化学检测证实它纯属天然矿物，没有任何人工雕刻的证据。', 'system')
        p.sanity = Math.max(0, p.sanity - 8)
        break
      }
      case 'hoteldoor': {
        // v12：开/关/撬 scanInteract 选中的同一扇门（根因修复：旧版按数组序找第一扇门，
        // 上锁门与普通门相邻时提示「打开 房门」却触发上锁门）
        const s = t.s && t.s.kind === 'hoteldoor' && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
        if (!s) return
        if (s.data?.locked) {
          if (this.hasPocket('skeleton')) {
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
      case 'glasswin': {
        const lvl = p.level
        this.msg(
          lvl === 4
            ? '玻璃外是雾。楼群的剪影在灰白里沉浮，像沉船的桅杆。没有一条路通向那里。'
            : '窗外是凝固的夜景：霓虹在远处明灭，街道上空无一人。玻璃纹丝不动。',
          'lore',
        )
        p.sanity = Math.min(100, p.sanity + 1)
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
        this.msg('窗户被从里面涂死了。档案说：涂黑的是安全的，没涂黑的才是陷阱。', 'lore')
        p.sanity = Math.min(100, p.sanity + 1)
        break
      }
      case 'graffiti': {
        // v17：变体房间专属 lore（涂鸦/文档，按 data.loreKind；同处再读顺延下一条）
        const s2g = t.s && t.s.kind === 'graffiti' ? t.s : null
        const loreKind = s2g?.data?.loreKind as string | undefined
        const LOREKIND: Record<string, string[]> = {
          arch: [
            '墙上刻着：「拱门房的拱门从不动。档案说这里是全层最稳定的地方——可以喘息，但别过夜。」',
            '「穿过第七个拱门时别回头。它们喜欢数拱门。」',
          ],
          pillarhall: [
            '「柱子比昨天多了两根。别数。数了就会一直数下去。」',
            'M.E.G. 标记：「柱厅——视线受阻，记路用喷漆，别用声音。」',
          ],
          pit: [
            '坑边的刻字：「别往下看太久。坑底也在看你。」',
            '「坑是方的。所有天然的东西都不是方的。」',
          ],
          blackout: [
            '「停电区的灯不是坏了——是被『关掉』的。开着手电，别停。」',
            '「黑暗里没有东西。官方说的。你信官方吗？」',
          ],
          manila: [
            '一份泛黄的文档：「马尼拉室——给还能读到这句话的人。床是干净的，水在柜子里。别把这里的事告诉墙纸。」',
            '文档第二页：「……在这里睡了一晚，嗡鸣声远了。如果你找到闪烁的门，别犹豫。——K.」',
          ],
          red: [
            '「红房间里待太久的人，出来时都不说话。」',
            '「红色不是灯光的颜色，是这里『空气』的颜色。数到十，离开。」',
          ],
          exitguide: [
            '涂鸦箭头指向一侧：「闪烁的门在这边——跟着电流声。」',
            '「门在闪。灯闪三下停一下的就是真的，别信常亮的。」',
          ],
        }
        if (loreKind && LOREKIND[loreKind] && s2g) {
          const pool2 = LOREKIND[loreKind]
          const li2 = ((s2g.data?.loreIdx as number | undefined) ?? -1) + 1
          s2g.data = { ...s2g.data, loreIdx: li2 }
          this.msg(pool2[li2 % pool2.length], 'lore')
          p.sanity = Math.min(100, p.sanity + 2)
          break
        }
        const lore = [
          '墙上写着：「别停下。它们在听。」',
          '潦草的字迹：「磁带……集齐六盘……门就会开。」',
          '有人刻下：「 Level 5 的旋转门是唯一的出路。」',
          '「黑暗里别关灯。不，还是关上吧。」——逻辑已无法辨认。',
          '「如果你看到另一个你，跑。」',
          '「无面的人不记得自己是谁。别提醒他们。」',
          'M.E.G. 告示：「不要喝地毯里的水，无论它看起来多像杏仁水。」',
          '「停电区里没有灯，但灯里有东西。」',
          '「电梯按钮有 382 层。别按 13 层以上的。」',
          '「红房间里待太久的人，出来时都不说话。」',
        ]
        this.msg(lore[Math.floor(Math.random() * lore.length)], 'lore')
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
        p.sanity = Math.min(100, p.sanity + 2)
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
    return items
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
      this.transition = { anim: 'bloom', t: 0, dest: def.dest }
      this.emit({ kind: 'transition', anim: 'bloom' })
      return
    }
    audio.pickup()
    // v23：立刻解析 random 目标——过场演出需要知道「切入」的是哪一层
    const dest: number | 'win' = def.dest === 'random' ? Math.floor(Math.random() * NORMAL_LEVELS) : def.dest
    const cutIn = dest === 'win' ? undefined : (def.cutIn ?? LEVELS[dest]?.entryAnim)
    this.transition = { anim: def.anim, t: 0, dest, fallDamage: def.fallDamage }
    this.emit({ kind: 'transition', anim: def.anim, fallDamage: def.fallDamage, cutIn, dest })
  }

  // ---------- 背包 ----------
  addItem(type: string): boolean {
    const p = this.player
    const def = ITEMS[type]
    const all = [...p.hotbar, ...p.backpack]
    for (const s of all) if (s && s.type === type && s.count < def.stack) { s.count++; this.syncPassives(); return true }
    for (let i = 0; i < p.hotbar.length; i++) if (!p.hotbar[i]) { p.hotbar[i] = { type, count: 1 }; this.syncPassives(); return true }
    for (let i = 0; i < p.backpack.length; i++) if (!p.backpack[i]) { p.backpack[i] = { type, count: 1 }; this.syncPassives(); return true }
    return false
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
      const slotName = { offhand: '副手', body: '身体', gloves: '手套', pocket: '口袋' }[def.equip]
      this.msg(`${def.name} 是装备（${def.passive ?? def.desc}），应放在【${slotName}】栏——在背包中拖拽到对应装备位。`, 'system')
      return
    }
    if (!def.use || def.use === 'none') { this.msg(`${def.name} 无法直接使用。`, 'system'); return }
    const p = this.player
    switch (def.use) {
      case 'eat': p.hunger = Math.min(100, p.hunger + (def.value ?? 30)); break
      case 'heal': p.hp = Math.min(100, p.hp + (def.value ?? 30)); break
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
    this.consumeItem(s.type)
  }
  // v18：快捷使用当前持有物品（默认鼠标右键，同背包「使用」按钮效果）
  quickUse() {
    this.useSlot('hotbar', this.player.selected)
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
    this.map.items.push({ id: Math.random(), type: s.type, x: p.x + 0.3, y: p.y + 0.3 })
    this.slotSet(r, null)
    this.syncPassives()
    this.msg(`丢下了 ${itemName(s.type)}`, 'system')
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
    const fits = (r: SlotRef, s: InvSlot | null): boolean => {
      if (!s) return true
      if (r.w === 'hotbar' || r.w === 'backpack') return true
      return ITEMS[s.type]?.equip === (r.w === 'pocket' ? 'pocket' : r.w)
    }
    if (!fits(to, fs) || !fits(from, ts)) {
      const name = to.w === 'offhand' ? '副手' : to.w === 'body' ? '身体' : to.w === 'gloves' ? '手套' : to.w === 'pocket' ? '口袋' : ''
      if (name) this.msg(`${itemName(fs.type)} 不能放在【${name}】栏。`, 'system')
      return false
    }
    this.slotSet(from, ts)
    this.slotSet(to, fs)
    if (to.w === 'offhand' && fs.type === 'flashlight') this.player.flashlight = true // 装备手电筒即点亮
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
    // 手电筒=副手装备：未装备则强制关灯（装备/拾取时由对应路径点亮）
    if (p.equip.offhand?.type !== 'flashlight') p.flashlight = false
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

  get levelDef() { return LEVELS[this.player.level] }

  // 开发者模式：层级跳转
  devJump(id: number) {
    if (id < 0 || id >= LEVELS.length || !this.map) return
    this.transition = null
    this.loadLevel(id)
    this.emit({ kind: 'transition', anim: 'intro' })
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

  /** 传送：exit=最近出口 / entity=最近实体 / container=最近未搜容器 / spawn=出生点 */
  devTeleport(target: 'exit' | 'entity' | 'container' | 'spawn'): boolean {
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
    // container
    const kinds = ['crate', 'corpse', 'car', 'cabinet', 'dresser', 'megcrate']
    let bs: import('./types').Structure | null = null, bd = 1e9
    for (const s of m.structures) {
      if (!kinds.includes(s.kind) || s.looted) continue
      const d = Math.hypot(s.x + s.w / 2 - p.x, s.y + s.h / 2 - p.y)
      if (d < bd) { bd = d; bs = s }
    }
    if (!bs) { this.msg('[DEV] 本层没有未搜索的容器。', 'system'); return false }
    return go(bs.x + bs.w / 2, bs.y + bs.h / 2 + 1, `最近容器（${bd.toFixed(1)}m）`)
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
  devGotoVariant(kind: L0Variant): boolean {
    const m = this.map
    if (!m?.inf) { this.msg('[DEV] 当前不是无限层级。', 'system'); return false }
    const inf = m.inf
    const p = this.player
    const name = VARIANT_NAMES[kind]
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
    const hit = findNearestVariant(inf.seed, inf.ox + p.x, inf.oy + p.y, kind)
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
    variants: { id: L0Variant; name: string; found: boolean }[]
  } {
    const m = this.map
    const def = this.levelDef
    // 无限层级（L0）不走 prefab 生成路径，只有变种房间；有限层级只有固定结构
    const prefabs = m?.inf ? [] : prefabsForLevel(def.id, def.skipPrefabs).map((pf) => ({
      id: pf.id,
      name: pf.name,
      found: !!m?.structures.some((s) => s.kind === 'prefabmark' && s.data?.prefab === pf.id),
    }))
    const variants = m?.inf
      ? RARE_VARIANTS.map((v) => ({
          id: v as L0Variant,
          name: VARIANT_NAMES[v],
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

  /** v17：传送到最近的保底闪烁门出口（窗口外也可达） */
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
    this.msg(`[DEV] 已传送到闪烁门出口（约 ${w.d.toFixed(0)}m 外）`, 'system')
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
    const containers = (m?.structures ?? []).filter((s) => ['crate', 'corpse', 'car', 'cabinet', 'dresser', 'megcrate'].includes(s.kind))
    return {
      x: p.x, y: p.y, z: p.z, tx, ty, elev, outdoor,
      level: p.level, seed: this.seed, time: this.time,
      entities: ents,
      containers: { total: containers.length, unlooted: containers.filter((s) => !s.looted).length },
      exits: (m?.exits ?? []).map((e) => ({ name: e.def.name, d: Math.hypot(e.x + 0.5 - p.x, e.y + 0.5 - p.y), discovered: e.discovered })),
      blackout: this.blackoutT > 0 ? this.blackoutT : 0,
    }
  }
}

export const engine = new Engine()
