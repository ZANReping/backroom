// v61：笑魇（Entity 3）重制——变种定义与层级分布。
// 依据：Backrooms Wikidot Entity 3（趋光、直视并缓慢后退可免于攻击、恐慌逃跑/巨响会引发攻击、
// 抛出光源可引开）、Liminal Archives（会主动破坏光源、偶尔成群、以扼颈为主要攻击方式）、
// 各 Fandom 分支中的幽影笑魇 / 饥饿笑魇 / 犬形笑魇 / 巨笑魇。
// 所有子变种共用 type='smiler' 和图鉴；def.smilerKind 保存实例形态，e.sm 保存 AI 状态。
import type { EntityDef } from './types'
import { SPECIAL_ENTITIES } from './special'

export type SmilerKind = 'common' | 'phantom' | 'starved' | 'canid' | 'great'

export interface SmilerKindDef {
  name: string
  desc: string
  behavior: string
  hp: number
  speed: number // 瓦片/秒（追击基准）
  damage: number
  sight: number // 手电光照下的发现距离
  hearing: number
  lightPull: number // 手电光吸引半径
  gazeHold: number // 被直视时能稳住它的秒数（0=直视无效；Infinity=始终有效）
  scale: number
  blurb: string // 首次遭遇提示
}

export const SMILER_KINDS: Record<SmilerKind, SmilerKindDef> = {
  common: {
    name: '笑魇', hp: 40, speed: 2.5, damage: 20, sight: 9, hearing: 5, lightPull: 13, gazeHold: Infinity, scale: 1,
    desc: '悬浮的黑火轮廓中露出一双亮眼和弯曲齿列，细臂向后反折。',
    behavior: '被光吸引，直视可使其对峙；关灯后持续对视会让它退去。奔跑或攻击会触发扑击，荧光棒可将其引开。',
    blurb: '黑暗里浮出一排发亮的牙。别跑——盯住它，慢慢退。',
  },
  phantom: {
    name: '幽影笑魇', hp: 26, speed: 3.6, damage: 17, sight: 8, hearing: 3, lightPull: 9, gazeHold: 0, scale: 0.92,
    desc: '环形眼和整齐方齿悬在半透明黑影中，远处仅剩微弱余光。',
    behavior: '不受对视约束；近处突然打开手电会使其扑击。靠近或被光束照到时现形，很快会咬碎荧光棒。',
    blurb: '一对环形的眼在半空亮起又熄灭。幽影笑魇会在手电亮起的那一刻扑上来。',
  },
  starved: {
    name: '饥饿笑魇', hp: 30, speed: 1.95, damage: 15, sight: 6, hearing: 10, lightPull: 6, gazeHold: 2.4, scale: 1.12,
    desc: '高瘦躯体拖着修长手臂，狭窄笑口中的牙齿持续打颤。',
    behavior: '主要循声锁定目标；对视只能短暂拖延。地上的食物能转移其注意，锁定玩家后往往无视荧光棒。',
    blurb: '细长的影子拖着够到地面的手臂，牙齿不停打颤。它循着声音来，也会被食物引开。',
  },
  canid: {
    name: '犬形笑魇', hp: 30, speed: 3.25, damage: 13, sight: 10, hearing: 7, lightPull: 12, gazeHold: 1.6, scale: 1,
    desc: '四足低伏的黑影，细长关节肢体和尾部随步态摆动。',
    behavior: '自然遭遇时成群包抄，绕到视线外扑击；被直视的个体会退开。咬中后还会损伤理智。',
    blurb: '低伏的四足黑影成群绕到你身侧。被你盯住的那只会退开，别让背后空着。',
  },
  great: {
    name: '巨笑魇', hp: 140, speed: 1.55, damage: 34, sight: 11, hearing: 6, lightPull: 15, gazeHold: 0, scale: 1.65,
    desc: '体型庞大的长角黑影，四只亮眼和宽阔双排齿列压迫着走廊。',
    behavior: '不受对视约束，移动时会震动地面并踩灭荧光棒；持续用手电照眼可使其短暂踉跄。',
    blurb: '长角的巨大笑脸压低身子挤进走廊。直视没用——用手电持续照它的眼睛。',
  },
}

export function isSmilerKind(value: unknown): value is SmilerKind {
  return typeof value === 'string' && Object.hasOwn(SMILER_KINDS, value)
}

/** Entity 3 subform definition; never registers a separate entity or codex key. */
export function smilerDefinition(kind: SmilerKind, base: EntityDef = SPECIAL_ENTITIES.smiler): EntityDef {
  const k = SMILER_KINDS[kind]
  return { ...base, smilerKind: kind, name: k.name, hp: k.hp, speed: k.speed, damage: k.damage,
    sight: k.sight, hearing: k.hearing, scale: k.scale === 1 ? undefined : k.scale }
}

/** 各层级的变种权重（L1 区分停电生成；未列出的层级只出普通笑魇） */
export function smilerWeights(levelId: number, blackout: boolean): [SmilerKind, number][] {
  switch (levelId) {
    case 1: return blackout ? [['common', 64], ['phantom', 22], ['starved', 14]] : [['common', 80], ['starved', 20]]
    case 2: return [['common', 52], ['starved', 24], ['phantom', 16], ['canid', 8]]
    case 3: return [['common', 38], ['canid', 30], ['phantom', 14], ['great', 10], ['starved', 8]]
    case 8: return [['common', 46], ['canid', 22], ['great', 20], ['phantom', 12]]
    default: return [['common', 100]]
  }
}

export function pickSmilerKind(levelId: number, blackout: boolean, rand: () => number = Math.random): SmilerKind {
  const w = smilerWeights(levelId, blackout)
  let r = rand() * w.reduce((s, [, x]) => s + x, 0)
  for (const [k, x] of w) { r -= x; if (r <= 0) return k }
  return 'common'
}

/** 运行时状态（不入存档、不入联机快照） */
export type SmilerPhase =
  | 'drift' // 游荡：黑暗中缓慢漂移
  | 'lure' // 被荧光棒/食物吸引，前往诱饵
  | 'feed' // 盯着诱饵咧嘴，然后咬碎它
  | 'stalk' // 已察觉：向光源/声源逼近
  | 'standoff' // 被直视：僵持（光亮时缓慢蠕近，黑暗中原地不动）
  | 'flank' // 犬形：绕到玩家侧后方
  | 'pounce' // 扑击：短时高速冲刺
  | 'retreat' // 退回黑暗（受伤、被瞪退、灯亮）
  | 'stagger' // 巨笑魇被强光灼眼，踉跄

export interface SmilerState {
  kind: SmilerKind
  phase: SmilerPhase
  t: number // 当前阶段计时
  aware: number // 对玩家的锁定剩余秒数
  gaze: number // 本次僵持累计秒数
  glare: number // 巨笑魇：被手电持续直射的累计秒数
  glareCd: number
  lastHp: number
  lureKey?: string // 诱饵标识（地面物品 id 或 'p'+投射物序号）
  lureX: number
  lureY: number
  orbit: number // 犬形：绕行角偏移
  packId: number
  vis: number // 0..1 渲染可见度（幽影笑魇）
  grin: number // 0..1 咧嘴张开程度（渲染）
  glow: number // 0..1 眼齿亮度（渲染）
  giggleT: number
  heardX?: number // 最近听见的声源，世界坐标（不随流式窗口原点移动）
  heardY?: number
  heardT?: number
  heardLoud?: boolean
  brokeGaze?: number // 对峙中被移开视线后的加速窗口
  strikeT?: number // 攻击前摇剩余
  ceilingBend?: number // 巨笑魇当前净空要求（弧度），移动减速与姿态使用相同计算
}
