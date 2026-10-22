// L8 蛛形纲重制——阶段 3：变种数值表（纯数据，不依赖引擎/渲染，供 forms.ts、生成器、AI、验收脚本共用）。
// 数值按体型与威胁度定：小型蜘蛛 6–26 血、符文强化 30–40 血、极巨蛛 180 血；速度单位 m/s（1 瓦片 = 1m）。
// 注意：arachnidAI.ts 会原样再导出 ARACHNID_STATS，AI 与文档以那份为准。
import type { ArachnidVariant } from '../renderer/arachnidMesh'

/** 能参与 AI 的 17 个个体变种（runenest 是环境件，不是实体） */
export type ArachnidKind = Exclude<ArachnidVariant, 'runenest'>

export interface ArachnidFlags {
  /** 会游泳/潜水：玩家跳水甩不掉，会在水里追击 */
  swim?: boolean
  /** 无氧：能在水下存活（沿湖底行走追击），同样甩不掉 */
  anoxic?: boolean
  /** 失明：只靠震动/脚步感知（蹲走可以躲开） */
  blind?: boolean
  /** 免疫火焰伤害、不怕火把（打火机）驱赶 */
  fireproof?: boolean
  /** 群体：单体近战伤害大幅衰减，火焰/爆炸一次驱散 */
  swarm?: boolean
  /** 胆小：受惊就跑，从不主动攻击（长脚盲蛛；旧「食草被动型」标志也走这条） */
  timid?: boolean
  /** 符文强化（蒙面教会改造）：发光呼吸、可挂点光源、只在蛛巢或极稀有野外出现 */
  runic?: boolean
  /** 织网：在通道里织可见的减速网，守网不远追 */
  webber?: boolean
  /** 伏击：静止潜伏，玩家靠近才暴起 */
  ambush?: boolean
}

export interface ArachnidVenom { dps: number; dur: number; stacks: number }

export interface ArachnidStat {
  kind: ArachnidKind
  name: string
  hp: number
  /** 追击速度 m/s */
  speed: number
  /** 游荡速度 m/s */
  walk: number
  /** 单次攻击伤害（群体/蜱为每秒伤害） */
  damage: number
  /** 视野 m（盲眼为 0） */
  sight: number
  /** 听觉 m */
  hearing: number
  /** 身体碰撞半径 m */
  radius: number
  /** 最小洞穴余量（m）：小于此值的狭窄通道过不去（极巨蛛） */
  minMargin?: number
  /** 近战出手距离 m */
  reach: number
  /** 攻击冷却 s */
  cd: number
  venom?: ArachnidVenom
  flags: ArachnidFlags
  /** 特殊能力（一句话，写进文档和图鉴） */
  ability: string
  /** 野外生成权重（蛛巢另有自己的表） */
  weight: number
}

const S = (kind: ArachnidKind, name: string, o: Omit<ArachnidStat, 'kind' | 'name'>): ArachnidStat => ({ kind, name, ...o })

export const ARACHNID_STATS: Record<ArachnidKind, ArachnidStat> = {
  wolf: S('wolf', '洞穴狼蛛', { hp: 26, speed: 3.3, walk: 1.0, damage: 9, sight: 7, hearing: 6, radius: 0.3, reach: 1.25, cd: 1.5, venom: { dps: 1, dur: 4, stacks: 1 }, flags: { ambush: true }, ability: '地面伏击：静伏到 4.5m 内暴起，lunge 扑咬带轻微毒（1/s × 4s）', weight: 22 }),
  weaver: S('weaver', '织网蛛', { hp: 18, speed: 1.9, walk: 0.7, damage: 6, sight: 5, hearing: 5, radius: 0.25, reach: 1.1, cd: 1.6, flags: { webber: true }, ability: '在通道里织网（缠住 3s、挣扎可提前挣脱）；守网半径 7m，不远追', weight: 18 }),
  jumper: S('jumper', '跳蛛', { hp: 14, speed: 2.8, walk: 1.1, damage: 8, sight: 8, hearing: 5, radius: 0.2, reach: 1.0, cd: 1.3, flags: {}, ability: '3–5m 内蓄力跳扑（根位移 0.9m，其余距离在空中补足），落点 1.2m 内命中', weight: 16 }),
  blindcave: S('blindcave', '盲眼洞蛛', { hp: 22, speed: 2.5, walk: 0.8, damage: 8, sight: 0, hearing: 7, radius: 0.28, reach: 1.1, cd: 1.5, flags: { blind: true }, ability: '无眼，只靠脚步震动定位；蹲走（近乎无声）可以从它身边走过', weight: 12 }),
  broodswarm: S('broodswarm', '群居幼蛛潮', { hp: 30, speed: 1.7, walk: 0.6, damage: 2.4, sight: 4, hearing: 6, radius: 0.7, reach: 0.9, cd: 0.5, flags: { swarm: true }, ability: '几十只幼蛛涌上来持续啃咬（2.4/s）；单体打击只伤 12%，火焰/爆炸一次驱散；带母蛛时持续补员', weight: 10 }),
  harvestman: S('harvestman', '长脚盲蛛', { hp: 8, speed: 3.0, walk: 0.8, damage: 1, sight: 4, hearing: 5, radius: 0.45, reach: 0.9, cd: 2, flags: { timid: true }, ability: '基本无害：3.2m 内或受击就逃（挂旧「食草被动型」标志）', weight: 14 }),
  diving: S('diving', '水蛛', { hp: 18, speed: 2.3, walk: 0.8, damage: 7, sight: 6, hearing: 6, radius: 0.25, reach: 1.1, cd: 1.5, flags: { swim: true }, ability: '会游泳和潜水：跳水甩不掉，在水里以 2.8m/s 追击、跟着玩家下潜', weight: 6 }),
  colossus: S('colossus', '极巨蛛', { hp: 180, speed: 2.1, walk: 0.7, damage: 30, sight: 9, hearing: 9, radius: 1.1, minMargin: 2.4, reach: 2.3, cd: 2.6, flags: { runic: true }, ability: '首次交战先 rear 威吓 1.6s，lunge 重伤 30 并减速；洞穴余量 <2.4m 的窄道过不去', weight: 0.6 }),
  widow: S('widow', '寡妇毒蛛', { hp: 30, speed: 2.6, walk: 0.8, damage: 6, sight: 6, hearing: 5, radius: 0.3, reach: 1.2, cd: 1.6, venom: { dps: 2, dur: 12, stacks: 3 }, flags: { runic: true }, ability: '强毒：每次咬中叠 1 层中毒（2/s × 12s，最多 3 层）', weight: 1 }),
  regen: S('regen', '再生蛛', { hp: 40, speed: 2.7, walk: 0.9, damage: 9, sight: 6, hearing: 6, radius: 0.32, reach: 1.2, cd: 1.5, flags: { runic: true }, ability: '每秒回血 3（被火烧后停 6s）；单次受击 ≥8 断肢，脱战后用 regen 片段长回', weight: 1 }),
  undying: S('undying', '不死蛛', { hp: 34, speed: 2.3, walk: 0.8, damage: 10, sight: 6, hearing: 6, radius: 0.32, reach: 1.2, cd: 1.6, flags: { runic: true }, ability: '第一次「死亡」后 4s 内 revive，以 30% 血复活一次（跛行）；只有火焰或 ≥15 的重击处决才能彻底杀死', weight: 0.8 }),
  fireproof: S('fireproof', '抗火蛛', { hp: 38, speed: 2.8, walk: 0.9, damage: 10, sight: 7, hearing: 6, radius: 0.3, reach: 1.2, cd: 1.5, flags: { runic: true, fireproof: true }, ability: '免疫火焰与爆炸火焰伤害，不怕打火机驱赶', weight: 1 }),
  anoxic: S('anoxic', '无氧蛛', { hp: 32, speed: 2.6, walk: 0.9, damage: 9, sight: 6, hearing: 6, radius: 0.3, reach: 1.2, cd: 1.5, flags: { runic: true, anoxic: true }, ability: '无需呼吸：沿湖底追进水里，跳水甩不掉', weight: 0.8 }),
  cavescorpion: S('cavescorpion', '洞蝎', { hp: 28, speed: 2.5, walk: 0.8, damage: 7, sight: 5, hearing: 6, radius: 0.32, reach: 1.45, cd: 1.4, venom: { dps: 1.5, dur: 6, stacks: 2 }, flags: {}, ability: '贴身 pinch 螯夹 7；1.1–1.45m 用 sting 尾刺 6 + 中毒（1.5/s × 6s）', weight: 10 }),
  whipscorpion: S('whipscorpion', '鞭蝎', { hp: 22, speed: 2.3, walk: 0.8, damage: 4, sight: 6, hearing: 5, radius: 0.28, reach: 1.1, cd: 1.4, flags: {}, ability: '2–4.5m 内 spray 喷酸雾：35° 锥形内每口 2 伤害 + 6s 腐蚀视野；贴身 pinch', weight: 8 }),
  tick: S('tick', '吸附蜱', { hp: 6, speed: 1.8, walk: 0.5, damage: 1, sight: 3, hearing: 4, radius: 0.12, reach: 0.85, cd: 1.5, flags: {}, ability: 'latch 吸附后每秒吸血 1、逐渐 engorge 膨胀；交互键或打击拔下；约 20s 吸饱后自己脱落', weight: 12 }),
  mitecloud: S('mitecloud', '螨群', { hp: 20, speed: 1.5, walk: 0.5, damage: 0.4, sight: 3, hearing: 3, radius: 0.6, reach: 1.0, cd: 0.5, flags: { swarm: true }, ability: '钻进衣物：20s 瘙痒（理智 -1.2/s、生命 -0.15/s）；入水或被泼水即散；火焰驱散', weight: 8 }),
}

export const ARACHNID_KINDS = Object.keys(ARACHNID_STATS) as ArachnidKind[]
export const isArachnidKind = (v: unknown): v is ArachnidKind => typeof v === 'string' && Object.hasOwn(ARACHNID_STATS, v)

/** 水体甩脱规则：玩家进入深水后，这个变种会不会失去目标（会游泳 / 无氧的甩不掉） */
export function arachnidLosesTargetInWater(kind: ArachnidKind): boolean {
  const f = ARACHNID_STATS[kind].flags
  return !f.swim && !f.anoxic
}
/** 能否进入深水（游泳 / 湖底行走） */
export const arachnidCanEnterWater = (kind: ArachnidKind) => !arachnidLosesTargetInWater(kind)

/** forms.ts 用的子变种描述（图鉴、开发者召唤）——18 项 = 17 个变种 + 旧「食草被动型」行为标志 */
export interface ArachnidFormRow { id: `arachnid-${ArachnidKind}` | 'arachnid-herbivore'; name: string; desc: string; behavior: string; kind: ArachnidKind; herbivore?: boolean }
export const ARACHNID_FORM_ROWS: ArachnidFormRow[] = [
  ...ARACHNID_KINDS.map((k): ArachnidFormRow => ({ id: `arachnid-${k}`, name: ARACHNID_STATS[k].name, desc: `${ARACHNID_STATS[k].name}（生命 ${ARACHNID_STATS[k].hp} · 速度 ${ARACHNID_STATS[k].speed}m/s）`, behavior: ARACHNID_STATS[k].ability, kind: k })),
  { id: 'arachnid-herbivore', name: '食草型', desc: '植被区的被动狼蛛形个体（沿用旧食草被动型标志）。', behavior: '不主动攻击，被伤害后仍会防卫 8 秒。', kind: 'wolf', herbivore: true },
]
