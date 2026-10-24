// 枪械系统（鎏金兵械库特许店，2026-10-23）：数值表。
// 设计边界：只收录 19 世纪手工作坊即可制造的结构（折开式双管、杠杆、单动转轮、前装、活门后膛），
// 不做自动武器、弹匣之类的近代工业品。每把枪只吃自己的口径；爆团弹（Object 23）只装 12 号。
//
// 时间表由 engine/firearms.ts（判定）与 renderer/firearmAnim.ts（动画）共用，check:firearms 校验两者一致。

export type GunType = 'dbshotgun' | 'leverrifle' | 'revolver' | 'musket' | 'trapdoor'
export type AmmoType = 'shell_buck' | 'shell_bird' | 'shell_clump' | 'cart_4440' | 'cart_paper' | 'cart_4570'
export type Caliber = '12ga' | '44-40' | 'paper69' | '45-70'
/** 弹仓里一格的状态：弹药类型 / 'spent' 已击发的空壳 / '' 空 */
export type Chamber = AmmoType | 'spent' | ''

export interface AmmoDef {
  type: AmmoType
  cal: Caliber
  name: string
  short: string // HUD 弹仓格子旁的两字简称
  /** 每发弹丸数（独头 / 步枪弹 = 1） */
  pellets: number
  /** 单颗弹丸在近距（≤ near 米）的伤害 */
  dmg: number
  /** 伤害线性衰减：near 内满额，到 far 降到 farK 倍；超过 maxRange 不判定 */
  near: number; far: number; farK: number; maxRange: number
  /** 散布（弧度，弹丸相对于瞄准线的锥角半径） */
  spread: number
  /** 对小型实体（尸鼠 / 飞蛾）伤害倍率 */
  smallMul?: number
  /** 穿透：打穿第一个目标后以 pierceK 倍伤害继续飞（最多 pierce 个） */
  pierce?: number; pierceK?: number
  /** 弹壳 / 纸包颜色（模型 / HUD） */
  hull: string; head: string
  box: number // 一盒发数（商店按盒卖）
  special?: 'clumpburst'
}

/** Object 23「爆团弹」：独头弹丸穿入目标后在体内起爆。打墙、打地面不炸——弹丸要先「穿透目标」。 */
export const CLUMPBURST = {
  fuse: 0.12, // 穿入 → 起爆（秒）
  blast: 60, // 体内起爆伤害
  favored: ['clump', 'wretch'] as string[], // 广告：肢团（Entity 5）；Kat：「对悲尸也同样有效」
  favoredMul: 2,
  splashR: 1.5, splash: 20, // 周边波及（实体）
  selfR: 1.6, selfDmg: 15, // 离得太近自己也会被溅到
  knock: 2.4, // 把目标「炸上天」：沿弹道方向击退（米，墙体校验）
  stun: 1.4,
} as const

export const AMMO: Record<AmmoType, AmmoDef> = {
  shell_buck: {
    type: 'shell_buck', cal: '12ga', name: '12 号鹿弹', short: '鹿弹', pellets: 9, dmg: 10,
    near: 5, far: 22, farK: 0.22, maxRange: 40, spread: 0.055, hull: '#a8322a', head: '#c9a45a', box: 6,
  },
  shell_bird: {
    type: 'shell_bird', cal: '12ga', name: '12 号鸟弹', short: '鸟弹', pellets: 24, dmg: 2.6,
    near: 4, far: 14, farK: 0.12, maxRange: 24, spread: 0.078, smallMul: 2.5, hull: '#3f6a3a', head: '#c9a45a', box: 10,
  },
  shell_clump: {
    type: 'shell_clump', cal: '12ga', name: '爆团弹', short: '爆团', pellets: 1, dmg: 35,
    near: 12, far: 35, farK: 0.6, maxRange: 45, spread: 0.012, hull: '#d4a62a', head: '#8a6a24', box: 6, special: 'clumpburst',
  },
  cart_4440: {
    type: 'cart_4440', cal: '44-40', name: '.44-40 弹', short: '.44', pellets: 1, dmg: 40,
    near: 15, far: 60, farK: 0.55, maxRange: 90, spread: 0.004, hull: '#c9a45a', head: '#7a6a5a', box: 20,
  },
  cart_paper: {
    type: 'cart_paper', cal: 'paper69', name: '纸包弹', short: '纸包', pellets: 1, dmg: 85,
    near: 8, far: 40, farK: 0.45, maxRange: 60, spread: 0.022, hull: '#d8ccb0', head: '#8e8e92', box: 10,
  },
  cart_4570: {
    type: 'cart_4570', cal: '45-70', name: '.45-70 弹', short: '.45', pellets: 1, dmg: 75,
    near: 25, far: 110, farK: 0.6, maxRange: 140, spread: 0.0025, pierce: 1, pierceK: 0.6, hull: '#c9a45a', head: '#6e6458', box: 10,
  },
}

/**
 * 装填方式：
 *  break  —— 折开 / 掀开枪机：open（抽壳器弹出空壳）→ 逐发 extract / insert → close（双管猎枪、活门后膛步枪）
 *  tube   —— 杠杆步枪：机匣右侧装弹口逐发压进管式弹仓（open = 转出装弹口，close = 收回；膛空则补一次拉杆）
 *  gate   —— 单动转轮：半击发 + 开装弹门 → 每个膛先用退壳杆捅出空壳再塞弹 → 关门
 *  muzzle —— 前装：咬开纸包 → 倒药 → 放弹 → 通条压实 → 收通条 → 装火帽（每一步都可中断，进度留在枪上）
 */
export type ReloadKind = 'break' | 'tube' | 'gate' | 'muzzle'
export const MUZZLE_STAGES = ['bite', 'pour', 'ball', 'ram', 'rod', 'cap'] as const
export type MuzzleStage = (typeof MUZZLE_STAGES)[number]
export const MUZZLE_STAGE_LABEL: Record<MuzzleStage, string> = { bite: '咬开纸包', pour: '倒药', ball: '装弹丸', ram: '通条压实', rod: '收回通条', cap: '装火帽' }

export interface GunDef {
  type: GunType
  name: string
  cal: Caliber
  /** 弹仓格数（tube：0 = 膛，1.. = 管式弹仓；gate：转轮 6 膛） */
  capacity: number
  ammo: AmmoType[]
  /** 两次击发的最短间隔（秒）；双管 = 手指换扳机，转轮 = 拇指扳击锤 */
  fireInterval: number
  /** tube：击发后拉杆循环（抛壳 + 上膛）耗时 */
  cycle?: number
  /** 腰射额外的瞄准偏移（弧度）；贴腮瞄准时降到 adsJitter */
  hipJitter: number; adsJitter: number
  moveJitter: number
  kick: number; kickRecover: number
  noiseR: number
  adsTime: number; adsFov: number
  reload: {
    kind: ReloadKind
    open: number; eject: number; extract: number; insert: number; close: number
    /** muzzle：每一步耗时 */
    stages?: Record<MuzzleStage, number>
  }
  twoHanded: boolean
  /** 硝烟浓度（黑火药前装 = 3） */
  smoke: number
  note: string
}

export const GUNS: Record<GunType, GunDef> = {
  dbshotgun: {
    type: 'dbshotgun', name: '双管猎枪', cal: '12ga', capacity: 2,
    ammo: ['shell_buck', 'shell_bird', 'shell_clump'],
    fireInterval: 0.26, hipJitter: 0.032, adsJitter: 0.004, moveJitter: 0.02,
    kick: 0.085, kickRecover: 0.6, noiseR: 34, adsTime: 0.22, adsFov: 0.82,
    // open：按下开合杠杆、枪管下折；eject：折到底时抽壳器弹出已击发空壳（开启后 eject 秒）；
    // extract：手动拔出一发未击发弹（换弹种时）；insert：从腰间取弹塞进膛；close：合枪
    reload: { kind: 'break', open: 0.42, eject: 0.3, extract: 0.38, insert: 0.58, close: 0.4 },
    twoHanded: true, smoke: 1,
    note: '12 号并列双管 · 28 英寸枪管 · 箱式枪机、双扳机（前扳机 = 右管）· 抽壳弹出器 · 胡桃木英式直枪托',
  },
  leverrifle: {
    type: 'leverrifle', name: '杠杆步枪', cal: '44-40', capacity: 11, // 膛 1 + 管式弹仓 10
    ammo: ['cart_4440'],
    fireInterval: 0.14, cycle: 0.5, hipJitter: 0.026, adsJitter: 0.0015, moveJitter: 0.018,
    kick: 0.05, kickRecover: 0.7, noiseR: 30, adsTime: 0.24, adsFov: 0.78,
    reload: { kind: 'tube', open: 0.32, eject: 0, extract: 0, insert: 0.46, close: 0.28 },
    twoHanded: true, smoke: 1,
    note: '.44-40 杠杆步枪 · 20 英寸圆管卡宾枪管 · 黄铜机匣、右侧装弹口 · 管式弹仓 10 发 · 鞍环 · 胡桃木直托',
  },
  revolver: {
    type: 'revolver', name: '单动转轮手枪', cal: '44-40', capacity: 6,
    ammo: ['cart_4440'],
    fireInterval: 0.48, hipJitter: 0.03, adsJitter: 0.003, moveJitter: 0.02,
    kick: 0.075, kickRecover: 0.65, noiseR: 30, adsTime: 0.2, adsFov: 0.86,
    reload: { kind: 'gate', open: 0.5, eject: 0, extract: 0.42, insert: 0.5, close: 0.36 },
    twoHanded: false, smoke: 1,
    note: '.44-40 单动转轮 · 7½ 英寸枪管 · 六发转轮、右侧装弹门 + 退壳杆 · 渗碳彩纹框 · 胡桃木握把',
  },
  musket: {
    type: 'musket', name: '前装滑膛枪', cal: 'paper69', capacity: 1,
    ammo: ['cart_paper'],
    fireInterval: 0.3, hipJitter: 0.04, adsJitter: 0.012, moveJitter: 0.025,
    kick: 0.1, kickRecover: 0.55, noiseR: 40, adsTime: 0.26, adsFov: 0.84,
    reload: {
      kind: 'muzzle', open: 0, eject: 0, extract: 0, insert: 0, close: 0.45,
      stages: { bite: 0.9, pour: 1.0, ball: 0.8, ram: 2.2, rod: 1.5, cap: 1.3 },
    },
    twoHanded: true, smoke: 3,
    note: '.69 口径击发式前装滑膛枪 · 42 英寸枪管 · 击锤 + 火帽座 · 钢通条 · 三道箍 · 胡桃木全托',
  },
  trapdoor: {
    type: 'trapdoor', name: '活门后膛步枪', cal: '45-70', capacity: 1,
    ammo: ['cart_4570'],
    fireInterval: 0.3, hipJitter: 0.03, adsJitter: 0.001, moveJitter: 0.02,
    kick: 0.095, kickRecover: 0.55, noiseR: 40, adsTime: 0.26, adsFov: 0.74,
    // open：拇指扳下击锤到半击发、掀起活门，抽壳器把空壳抛向后上方；insert：塞一发；close：压下活门、扳到全击发
    reload: { kind: 'break', open: 0.5, eject: 0.36, extract: 0.4, insert: 0.62, close: 0.42 },
    twoHanded: true, smoke: 1,
    note: '.45-70 活门式单发后膛步枪 · 32½ 英寸枪管 · 铰链活门枪机 + 外露击锤 · 立框表尺 · 胡桃木全托',
  },
}

export const isGun = (t: string | undefined | null): t is GunType => !!t && Object.prototype.hasOwnProperty.call(GUNS, t)
export const isAmmo = (t: string | undefined | null): t is AmmoType => !!t && Object.prototype.hasOwnProperty.call(AMMO, t)
/** 双管先右（前扳机）后左 */
export const FIRE_ORDER: Partial<Record<GunType, number[]>> = { dbshotgun: [0, 1], trapdoor: [0], musket: [0] }

/** 距离衰减系数 */
export function falloff(a: AmmoDef, d: number): number {
  if (d > a.maxRange) return 0
  if (d <= a.near) return 1
  if (d >= a.far) return a.farK
  return 1 - (1 - a.farK) * (d - a.near) / (a.far - a.near)
}
/** 小型实体（鸟弹加成） */
export const SMALL_TARGETS = new Set(['corpserat', 'deathmoth', 'rat'])

/** 商店牌价（压印币；弹药为一盒） */
export const FIREARM_PRICES: Record<string, number> = {
  dbshotgun: 120, leverrifle: 160, revolver: 110, musket: 60, trapdoor: 180,
  shell_buck: 8, shell_bird: 5, shell_clump: 30, cart_4440: 18, cart_paper: 6, cart_4570: 16,
}
