// [creeper] 爬菌（Entity 17）重制·阶段 3：机制。方案与 ZAN 定稿见 /workspace/work/creeper/plan.md（「ZAN 定稿」一节是硬性要求）：
//   · 玩家隐藏值「孢子负荷」p.creep（eng.creepRun.load），满 100 确诊。被咬 +25；近战击杀感染体被溅到（2 m 内）+15；吃感染体的肉 +40；
//     不再接触后每分钟回落 5；包扎伤口后 3 分钟内被咬，这一口减半。与疫疾 p.infection 相互独立。
//   · 病程（确诊后，约 12 分钟）：1 阶 3 min 疼痛 / 周期抽痛 / 少量掉血 → 2 阶 1 min 手臂绒毛痘、饥饿 ×3 → 3 阶 30 s 整条手臂覆盖、
//     高烧热浪、耐力上限降低 → 4 阶 7.5 min 理智崩坏、「冲动」、长指甲徒手伤害提高、NPC 拒绝交易 → 5 阶死亡，原地爬出一只爬菌人。
//     推进速度乘环境系数：干燥、明亮时减慢，潮湿、温暖、黑暗时加快（各层级有基础系数，再乘当前位置的明暗 / 湿度 / 锅炉热源，夹在 0.3–2）。
//     2 阶起无法挽回。HUD 不显示病程：只有第一人称手臂菌斑（creeperRender.CreepViewHands）、手指痉挛、画面 / 声音症状。
//   · 1 阶自救：已出现症状（收到过剧痛提示）且身上有火盐晶体或打火机时，特殊交互键 X（engine/special.ts；移动端情境按钮）烧灼伤口：
//     扣血、清除感染。打火机不消耗；没有打火机时消耗 1 颗火盐晶体。
//   · 感染体：尸鼠 / 蛛形纲的感染变体（同一个实体 type 'creeper'，图鉴 Entity 17），1–4 阶：阶段越高移动越慢、攻击间隔越长、
//     攻击性越强（被激怒后记仇更久、出手更狠）。野外多为 1–3 阶，不主动攻击；少数 4 阶会主动追击。死后原地留下孢子团（靠近加负荷）。
//     感染体会把身边未感染的尸鼠 / 蛛形纲传染成 1 阶（每 8 s 检查一次，1.4 m 内，概率 10%）。
//   · 生成：L2 / L3 / L8，L5 只在锅炉房（罕见）。按比例把这些层级已有的尸鼠、蛛形纲生成替换成感染变体（按世界坐标确定性哈希，
//     chunk 重载结果一致）；墙角放「僵尸蜘蛛」装饰（静态尸体，靠近同样加负荷）；爬菌人极罕见（主动追击、双手爬行、余烬闪烁）。
// 所有数值集中在 CR 表。运行期状态：玩家侧 eng.creepRun（写存档 creep），实体侧 e.cr（不入存档 / 联机）。
import { audio } from '../core/audio'
import type { Engine } from '../engine'
import { ENTITIES, makeEntity, type Entity } from '../entities'
import { refinedDefinition } from '../entities/forms'
import { ratMorphFor, type RatMorph } from '../entities/rats'
import { faceToward } from './entityAI'
import type { SpecialAction } from './special'
import { CHUNK_SPAWN_HOOKS } from '../world/chunkHooks'
import { l5RegionAt } from '../world/infiniteL5'

export type CreepHost = 'rat' | 'arachnid' | 'human'
/** 感染体阶段：宿主 1–4，爬菌人 5 */
export type CreepEntStage = 1 | 2 | 3 | 4 | 5
/** 蛛形纲宿主可用的外形（arachnidMesh 里的蜘蛛类） */
export type CreepSpiderVariant = 'wolf' | 'weaver' | 'harvestman' | 'blindcave' | 'jumper'

/** 数值表（秒 / 米 / 点）。病程四阶时长按 wiki：3 min + 1 min + 30 s + 7.5 min = 12 min */
export const CR = {
  // —— 孢子负荷（隐藏值）——
  LOAD_MAX: 100,
  BITE: 25, // 被感染体咬一口
  SPLASH: 15, SPLASH_R: 2, // 近战击杀感染体时 2 m 内被溅到（远程击杀安全）
  EAT: 40, // 吃感染体的肉
  DECAY_PER_MIN: 5, // 不再接触后每分钟回落
  CONTACT_GRACE: 10, // 最后一次接触后过这么久才开始回落（孢子团旁站着不算「不再接触」）
  BANDAGE_T: 180, BANDAGE_K: 0.5, // 包扎后 3 分钟内被咬：这一口 ×0.5
  // 孢子团（感染体尸体）/ 僵尸蜘蛛装饰：靠近持续加负荷
  SPORE_R: 1.6, SPORE_RATE: 2.5, SPORE_LIFE: 300, SPORE_MAX: 24,
  DECOR_R: 0.9, DECOR_RATE: 1.2,
  BURN_R: 2.4, // 火盐晶体爆开：烧掉这个半径内的孢子团 / 僵尸蜘蛛
  // —— 病程 ——
  STAGE_DUR: [0, 180, 60, 30, 450] as readonly number[], // 1–4 阶基准时长（s）；总 720 s ≈ 12 min
  AWARE_T: 12, // 确诊后多久第一次剧痛（=「察觉」：从此 1 阶可以烧灼）
  PAIN_GAP: [24, 40] as readonly number[], // 1 阶周期性抽痛间隔
  PAIN_HP: 2, // 每次抽痛掉血
  BLEED1: 0.03, // 1 阶持续掉血（hp/s）
  HUNGER_K2: 3, // 2 阶起饥饿流失倍数
  STAMINA_CAP3: 55, // 3 阶起耐力上限
  SANITY4: 0.3, // 4 阶理智流失（/s）
  FIST_K4: 2.25, // 4 阶徒手伤害倍数（长指甲）
  URGE_GAP: [26, 46] as readonly number[], // 4 阶「冲动」间隔
  // 环境系数：层级基础 × 当前位置（明亮 ×0.6 / 黑暗 ×1.25 / 潮湿 ×1.35 / 锅炉等热源旁 ×1.45），夹在 [ENV_MIN, ENV_MAX]
  ENV_MIN: 0.3, ENV_MAX: 2,
  ENV_LEVEL: { 0: 0.7, 1: 0.85, 2: 1.4, 3: 1.3, 4: 0.6, 5: 0.9, 6: 1.2, 7: 1.1, 8: 1.5, 9: 0.9, 10: 0.6, 11: 0.5 } as Record<number, number>,
  ENV_DEFAULT: 1,
  ENV_LIT: 0.6, ENV_DARK: 1.25, ENV_WET: 1.35, ENV_WARM: 1.45, WARM_R: 5,
  // —— 1 阶烧灼 ——
  CAUTERIZE_HP: 25, CAUTERIZE_SAN: 6,
  // —— 感染体（下标 = 阶段 1–4；0 = 未感染参考值）——
  HOST: {
    speedK: [1, 0.85, 0.7, 0.56, 0.45] as readonly number[], // 移动速度倍数
    attackGap: [1.2, 1.6, 2.0, 2.5, 3.0] as readonly number[], // 两次攻击最短间隔（s）
    aggression: [0, 0.25, 0.45, 0.7, 1] as readonly number[], // 攻击性 0–1：记仇时长、出手力度
    chase: [false, false, false, false, true] as readonly boolean[], // 是否主动追击（只有 4 阶）
    damage: { rat: [9, 6, 8, 10, 13], arachnid: [10, 7, 9, 12, 15] } as Record<'rat' | 'arachnid', readonly number[]>,
    hp: { rat: [26, 22, 20, 18, 16], arachnid: [30, 26, 24, 21, 18] } as Record<'rat' | 'arachnid', readonly number[]>,
    wander: { rat: 0.42, arachnid: 0.48 } as Record<'rat' | 'arachnid', number>, // 游荡基准速度（× speedK）
    run: { rat: 2.3, arachnid: 2.5 } as Record<'rat' | 'arachnid', number>, // 追击 / 记仇基准速度（× speedK）
    reach: { rat: 1.0, arachnid: 1.15 } as Record<'rat' | 'arachnid', number>,
    sight: 7,
  },
  GRUDGE_BASE: 6, GRUDGE_K: 22, // 被打后记仇 6 + 22 × 攻击性（s）
  TWITCH_P: 0.06, // 游荡时每秒偶发抽搐概率
  HOST_STAGE_W: [0, 40, 32, 20, 8] as readonly number[], // 野外阶段权重：多为 1–3 阶，少数 4 阶
  SPREAD_GAP: 8, SPREAD_R: 1.4, SPREAD_P: 0.1, // 感染体传染未感染的尸鼠 / 蛛形纲（成为 1 阶）
  CORPSE_T: 3.2, // 尸体停留（death 片段 2.8 s）
  MEAT_P: 0.6, // 感染尸鼠被打死掉「长白毛的尸鼠肉」概率
  // —— 生成 ——
  /** 替换比例：这些层级里已有的尸鼠 / 蛛形纲生成，按此概率替换成感染变体（L5 只在锅炉房） */
  SPAWN: { 2: { corpserat: 0.35 }, 3: { corpserat: 0.3 }, 5: { corpserat: 0.5 }, 8: { corpserat: 0.18, arachnid: 0.3 } } as Record<number, Partial<Record<'corpserat' | 'arachnid', number>>>,
  L5_INJECT: 0.08, // L5：含锅炉房的 chunk 额外放一只感染尸鼠的概率（锅炉房里本来很少有尸鼠）
  DECOR_CHUNK: { 2: 0.35, 3: 0.3, 5: 0.12, 8: 0.6 } as Record<number, number>, // 每个 chunk 放一只僵尸蜘蛛装饰的概率
  DECOR_Z: 1.55, // 挂点离地高度（会被天花板压低）
  HUMAN_CHUNK: { 2: 0.004, 3: 0.004, 5: 0.002, 8: 0.006 } as Record<number, number>, // 爬菌人：每个 chunk 的生成概率（极罕见）
  // —— 爬菌人 ——
  HUMAN: { hp: 90, speed: 1.0, sight: 14, hearing: 16, damage: 22, lungeR: 2.2, lungeDist: 0.6, lungeHit: 0.9, lungeDur: 1.5, lungeGap: 3.2, reach: 1.75, screamDur: 2.2, screamCd: 30, loseT: 12 },
}

/** 病程总时长（基准，环境系数 1） */
export const CREEP_COURSE = CR.STAGE_DUR.reduce((a, b) => a + b, 0)

// ============================================================================
// 纯函数（check:creeper 直接断言）
// ============================================================================
export interface CreepRunState {
  load: number // 孢子负荷 0–100（隐藏）
  contactT: number // 距最后一次接触（s）
  bandageT: number // 包扎后剩余的减半窗口（s）
  infected: boolean
  courseT: number // 病程进度（按环境系数推进的「基准秒」）
  aware: boolean // 已收到剧痛提示（1 阶可以烧灼）
  painT: number // 下一次抽痛倒计时
  urgeT: number
  stageShown: number // 已提示过的阶段
  throb: number // 画面抽痛强度（衰减）
  env: number // 最近一次环境系数（调试 / 验收）
  prevHeld: boolean
  spores: CreepSpore[]
  decor: Map<string, CreepDecor[]> // chunk → 僵尸蜘蛛（按种子确定，只在内存）
  burnedDecor: Set<string>
  scanT: number
}
export interface CreepSpore { id: number; wx: number; wy: number; z: number; t: number; life: number; level: number; seed: number }
export interface CreepDecor { id: string; wx: number; wy: number; /** 挂点离地高度（渲染层再按天花板压低） */ z: number; rot: number; seed: number }
export interface CreepSave { load: number; contactT: number; bandageT: number; infected: boolean; courseT: number; aware: boolean; stageShown: number; spores: CreepSpore[]; burnedDecor?: string[] }

export function freshCreepRun(): CreepRunState {
  return { load: 0, contactT: 999, bandageT: 0, infected: false, courseT: 0, aware: false, painT: CR.AWARE_T, urgeT: CR.URGE_GAP[0], stageShown: 0, throb: 0, env: 1, prevHeld: false, spores: [], decor: new Map(), burnedDecor: new Set(), scanT: 0 }
}
export function captureCreep(eng: Engine): CreepSave {
  const r = eng.creepRun
  return { load: r.load, contactT: r.contactT, bandageT: r.bandageT, infected: r.infected, courseT: r.courseT, aware: r.aware, stageShown: r.stageShown, spores: r.spores.map((s) => ({ ...s })), burnedDecor:[...r.burnedDecor] }
}
export function restoreCreep(s?: CreepSave): CreepRunState {
  const r = freshCreepRun()
  if (!s) return r
  Object.assign(r, { load: s.load ?? 0, contactT: s.contactT ?? 999, bandageT: s.bandageT ?? 0, infected: !!s.infected, courseT: s.courseT ?? 0, aware: !!s.aware, stageShown: s.stageShown ?? 0, spores: (s.spores ?? []).map((x) => ({ ...x })) })
  r.burnedDecor=new Set(s.burnedDecor??[])
  return r
}

export type CreepSource = 'bite' | 'splash' | 'eat' | 'spore' | 'decor'
/**
 * 加孢子负荷。bite / splash / eat 是一次性的（amount 缺省取表值），spore / decor 是持续接触（amount = 本帧的量）。
 * 包扎窗口内被咬，这一口减半。满 100 确诊（负荷清零、病程从 0 开始）。返回实际加了多少。
 */
export function creepAddLoad(r: CreepRunState, src: CreepSource, amount?: number): number {
  let a = amount ?? (src === 'bite' ? CR.BITE : src === 'splash' ? CR.SPLASH : src === 'eat' ? CR.EAT : 0)
  if (src === 'bite' && r.bandageT > 0) a *= CR.BANDAGE_K
  r.contactT = 0
  if (r.infected || a <= 0) return 0
  r.load += a
  if (r.load >= CR.LOAD_MAX) { r.load = 0; r.infected = true; r.courseT = 0; r.aware = false; r.painT = CR.AWARE_T; r.stageShown = 0 }
  return a
}
/** 每帧：包扎窗口倒计时；离开接触超过 CONTACT_GRACE 后负荷按每分钟 5 回落 */
export function creepDecayLoad(r: CreepRunState, dt: number) {
  r.contactT += dt
  r.bandageT = Math.max(0, r.bandageT - dt)
  if (!r.infected && r.contactT > CR.CONTACT_GRACE) r.load = Math.max(0, r.load - CR.DECAY_PER_MIN / 60 * dt)
}
export interface CreepEnvSample { lit: boolean; wet: boolean; warm: boolean }
/** 环境系数：层级基础 × 明暗 × 湿度 × 热源，夹在 [0.3, 2] */
export function creepEnvFactor(levelId: number, s: CreepEnvSample): number {
  const base = CR.ENV_LEVEL[levelId] ?? CR.ENV_DEFAULT
  const k = base * (s.lit ? CR.ENV_LIT : CR.ENV_DARK) * (s.wet ? CR.ENV_WET : 1) * (s.warm ? CR.ENV_WARM : 1)
  return Math.min(CR.ENV_MAX, Math.max(CR.ENV_MIN, k))
}
/** 病程进度（基准秒）→ 阶段 1–4；走完全程 = 5（死亡 / 转化） */
export function creepStageAt(courseT: number): CreepEntStage {
  let acc = 0
  for (let s = 1; s <= 4; s++) { acc += CR.STAGE_DUR[s]; if (courseT < acc) return s as CreepEntStage }
  return 5
}
/** 当前病程阶段（未感染 = 0） */
export const creepStage = (r: CreepRunState): number => r.infected ? creepStageAt(r.courseT) : 0
/** X 烧灼是否可用：只在 1 阶、已察觉、身上有火盐晶体或打火机 */
export function creepCanCauterize(r: CreepRunState, items: { firesalt: number; lighter: boolean }): boolean {
  return r.infected && creepStageAt(r.courseT) === 1 && r.aware && (items.lighter || items.firesalt > 0)
}
/** 感染体阶段 → 速度 / 攻击间隔 / 攻击性 / 是否主动追击 */
export function creepHostTraits(stage: number) {
  const s = Math.max(1, Math.min(4, stage))
  return { speedK: CR.HOST.speedK[s], attackGap: CR.HOST.attackGap[s], aggression: CR.HOST.aggression[s], chase: CR.HOST.chase[s], grudge: CR.GRUDGE_BASE + CR.GRUDGE_K * CR.HOST.aggression[s] }
}
/** 野外感染体阶段（u ∈ [0,1)）：按 HOST_STAGE_W 加权 */
export function creepPickStage(u: number): 1 | 2 | 3 | 4 {
  const W = CR.HOST_STAGE_W, tot = W[1] + W[2] + W[3] + W[4]
  let t = u * tot
  for (let s = 1; s <= 4; s++) { t -= W[s]; if (t < 0) return s as 1 | 2 | 3 | 4 }
  return 4
}
/** 生成替换：这一只（type）在这个层级（levelId）是否换成感染变体。u ∈ [0,1)；L5 只在锅炉房（boiler） */
export function creepSpawnReplace(levelId: number, type: string, u: number, boiler = false): boolean {
  const row = CR.SPAWN[levelId]
  if (!row || (type !== 'corpserat' && type !== 'arachnid')) return false
  if (levelId === 5 && !boiler) return false
  return u < (row[type] ?? 0)
}
/** 世界坐标确定性哈希 → [0,1) */
export function creepHash(seed: number, x: number, y: number, salt: number): number {
  let h = Math.imul((seed | 0) ^ 0x2c1b3c6d, 0x85ebca6b) ^ Math.imul(Math.floor(x * 16) | 0, 0x27d4eb2f) ^ Math.imul(Math.floor(y * 16) | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9)
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

// ============================================================================
// 实体：感染体 / 爬菌人
// ============================================================================
export type CreepMode = 'idle' | 'wander' | 'twitch' | 'chase' | 'attack' | 'scream' | 'dead'
export interface CreepEntState {
  host: CreepHost
  stage: CreepEntStage
  morph?: RatMorph
  variant?: CreepSpiderVariant
  seed: number
  mode: CreepMode
  modeT: number
  /** 当前动画片段（宿主：idle/walk/twitch/attack/death；爬菌人：idle/crawl/lunge/scream/death）与片段时间 */
  clip: string
  clipT: number
  /** 本帧的实际移动速度（m/s），渲染层按它同步步频 */
  speed: number
  hitDone: boolean
  grudgeT: number
  spreadT: number
  lastHp: number
  lungeD: number // 扑击已走过的根位移
  corpseT: number // 尸体停留总时长（渲染层按 corpseT − deathT 播 death 片段）
  alertT: number
  screamCd: number
}
const FORM_OF: Record<CreepHost, 'creeper-rat' | 'creeper-spider' | 'creeper-human'> = { rat: 'creeper-rat', arachnid: 'creeper-spider', human: 'creeper-human' }
const SPIDERS: readonly CreepSpiderVariant[] = ['wolf', 'weaver', 'harvestman', 'blindcave', 'jumper']

/** 扑击根位移（m）：前摇后腾起前扑，落地时整只往前挪了 lungeDist。creeperAnim 的 lunge 片段按这条曲线把身体留在根上 */
export function creeperLungeRoot(t: number): number {
  const W = 0.55, E = 1.15, k = Math.min(1, Math.max(0, (t - W) / (E - W)))
  return CR.HUMAN.lungeDist * k * k * (3 - 2 * k)
}

/** 把一只尸鼠 / 蛛形纲（或新建的实体）变成爬菌感染体 / 爬菌人。保留位置、id、朝向、体型缩放 */
export function makeCreeper(e: Entity, host: CreepHost, stage: CreepEntStage, levelId: number, seed = e.id): Entity {
  const oldDef = e.def, frac = oldDef.hp > 0 ? Math.max(0.2, Math.min(1, e.hp / oldDef.hp)) : 1
  const base = refinedDefinition(ENTITIES.creeper, FORM_OF[host])
  const s = host === 'human' ? 5 : Math.max(1, Math.min(4, stage)) as CreepEntStage
  let morph: RatMorph | undefined, variant: CreepSpiderVariant | undefined
  if (host === 'rat') morph = oldDef.type === 'corpserat' ? (e.rt?.morph ?? ratMorphFor(levelId, oldDef)) : ratMorphFor(levelId, {})
  if (host === 'arachnid') {
    const v = oldDef.arachnidVariant as string | undefined
    variant = (SPIDERS as readonly string[]).includes(v ?? '') ? v as CreepSpiderVariant : SPIDERS[Math.floor(creepHash(seed, 1, 2, 77) * SPIDERS.length)]
  }
  if (host === 'human') {
    e.def = { ...base, hp: CR.HUMAN.hp, speed: CR.HUMAN.speed, damage: CR.HUMAN.damage, sight: CR.HUMAN.sight, hearing: CR.HUMAN.hearing, passive: false, creepHost: 'human', creepStage: 5 }
  } else {
    const hp = CR.HOST.hp[host][s], dmg = CR.HOST.damage[host][s], T = creepHostTraits(s)
    e.def = { ...base, hp, damage: dmg, speed: CR.HOST.run[host] * T.speedK, sight: CR.HOST.sight, passive: !T.chase, creepHost: host, creepStage: s, ...(oldDef.scale !== undefined && oldDef.type === 'corpserat' ? { scale: Math.min(1.2, oldDef.scale) } : {}) }
  }
  e.hp = Math.max(1, e.def.hp * frac)
  e.rt = undefined; e.arachnid = undefined; e.provoked = undefined; e.targetEnt = undefined
  e.state = 'wander'; e.stateT = 0
  e.cr = { host, stage: s, morph, variant, seed: seed | 0, mode: host === 'human' ? 'idle' : 'wander', modeT: 0, clip: host === 'human' ? 'idle' : 'walk', clipT: 0, speed: 0, hitDone: false, grudgeT: 0, spreadT: CR.SPREAD_GAP * creepHash(seed, 3, 4, 5), lastHp: e.hp, lungeD: 0, corpseT: CR.CORPSE_T, alertT: 0, screamCd: 0 }
  return e
}
/** 直接新建（dev 召唤 / 玩家死亡转化 / chunk 注入） */
export function spawnCreeper(host: CreepHost, stage: CreepEntStage, x: number, y: number, z: number, levelId: number, seed?: number): Entity {
  const e = makeEntity('creeper', x, y, z, FORM_OF[host])
  return makeCreeper(e, host, stage, levelId, seed ?? e.id)
}
/** 实体刚生成还没有 e.cr（dev 召唤）：按形态补上 */
function ensureCreep(eng: Engine, e: Entity): CreepEntState {
  if (e.cr) return e.cr
  const host: CreepHost = e.def.creepHost ?? (e.def.entityForm === 'creeper-human' ? 'human' : e.def.entityForm === 'creeper-spider' ? 'arachnid' : 'rat')
  makeCreeper(e, host, (e.def.creepStage as CreepEntStage | undefined) ?? creepPickStage(creepHash(e.id, 0, 0, 9)), eng.levelDef?.id ?? 0)
  return e.cr!
}
const setMode = (s: CreepEntState, m: CreepMode, clip: string) => { s.mode = m; s.modeT = 0; if (s.clip !== clip || m === 'attack' || m === 'twitch' || m === 'scream') { s.clip = clip; s.clipT = 0; s.hitDone = false } }

/** 宿主攻击片段时长 / 命中时刻（与 creeperAnim.creeperClipInfo('host','attack',stage) 同式；engine 不依赖渲染模块） */
const WINDUP = [0.25, 0.35, 0.5, 0.7, 0.95], FURY = [1, 1.1, 1.25, 1.45, 1.7]
export function creepHostAttackTiming(stage: number) { const S = 0.14 / Math.sqrt(FURY[stage]); return { dur: WINDUP[stage] + S + 0.6, hit: WINDUP[stage] + S * 0.8 } }

/** 每帧：感染体 / 爬菌人 AI（entityAI 的 generic 分派调用） */
export function updateCreeper(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number) {
  const s = ensureCreep(eng, e)
  s.modeT += dt; s.clipT += dt; s.grudgeT -= dt; s.spreadT -= dt; s.screamCd -= dt
  if (s.host === 'human') return updateHuman(eng, e, s, dt, d, dmgMult)
  const p = eng.player, host = s.host as 'rat' | 'arachnid'
  const T = creepHostTraits(s.stage)
  if (e.hp < s.lastHp - 1e-6) { s.grudgeT = T.grudge; if (s.mode !== 'attack') setMode(s, 'chase', 'walk') }
  s.lastHp = e.hp
  if (s.spreadT <= 0) { s.spreadT = CR.SPREAD_GAP; spreadFrom(eng, e, s) }
  const sees = d < CR.HOST.sight && Math.abs(e.z - p.z) < 1.6 && eng.los(e.x, e.y, p.x, p.y)
  const hostile = !eng.over && ((T.chase && sees) || s.grudgeT > 0)
  const reach = CR.HOST.reach[host] * (e.def.scale ?? 1)
  s.speed = 0
  switch (s.mode) {
    case 'attack': {
      const A = creepHostAttackTiming(s.stage)
      faceToward(eng, e, p.x, p.y, dt, 3)
      if (!s.hitDone && s.clipT >= A.hit) {
        s.hitDone = true
        if (d < reach + 0.4 && eng.meleeZOk(e) && eng.los(e.x,e.y,p.x,p.y)) { eng.hurtPlayer(e.def.damage * dmgMult, e.def.name); creepBite(eng, e.def.name) }
      }
      if (s.clipT >= A.dur) setMode(s, hostile ? 'chase' : 'wander', 'walk')
      break
    }
    case 'twitch':
      if (s.clipT >= 1.4) setMode(s, 'wander', 'walk')
      break
    default: {
      if (hostile) {
        if (s.mode !== 'chase') setMode(s, 'chase', 'walk')
        e.targetX = p.x; e.targetY = p.y
        if (d < reach && e.attackCd <= 0 && eng.meleeZOk(e) && eng.los(e.x,e.y,p.x,p.y)) {
          setMode(s, 'attack', 'attack'); e.attackCd = T.attackGap + creepHostAttackTiming(s.stage).dur
          break
        }
        if (d > reach * 0.8) { const sp = CR.HOST.run[host] * T.speedK; const x0 = e.x, y0 = e.y; eng.stepEntity(e, sp, dt); s.speed = Math.hypot(e.x - x0, e.y - y0) / Math.max(1e-4, dt) }
        else faceToward(eng, e, p.x, p.y, dt, 4)
      } else {
        if (s.mode === 'chase') setMode(s, 'wander', 'walk')
        if (s.mode === 'idle') { if (s.modeT > 2 + creepHash(s.seed, s.modeT | 0, 1, 2) * 3) setMode(s, 'wander', 'walk') }
        else {
          if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.35) {
            if (Math.random() < 0.35) { setMode(s, 'idle', 'idle'); break }
            eng.wanderTarget(e)
          }
          const x0 = e.x, y0 = e.y
          eng.stepEntity(e, CR.HOST.wander[host] * T.speedK, dt)
          s.speed = Math.hypot(e.x - x0, e.y - y0) / Math.max(1e-4, dt)
        }
        if (Math.random() < CR.TWITCH_P * dt * (0.5 + s.stage * 0.25)) setMode(s, 'twitch', 'twitch')
      }
    }
  }
  e.state = s.mode === 'attack' ? 'attack' : hostile ? 'chase' : 'wander'
}

/** Human hosts hear nearby spatial noise while early infected animals remain passive. */
export function creeperHear(eng:Engine,e:Entity,x:number,y:number,radius:number){
 if(e.dead||eng.over||Math.abs(e.z-eng.player.z)>1.8)return
 const s=ensureCreep(eng,e),d=Math.hypot(e.x-x,e.y-y)
 if(s.host!=='human'||d<.001||d>Math.min(radius,CR.HUMAN.hearing))return
 s.alertT=CR.HUMAN.loseT;e.targetX=x;e.targetY=y
 if(s.mode==='idle')setMode(s,'chase','crawl')
}

function updateHuman(eng: Engine, e: Entity, s: CreepEntState, dt: number, d: number, dmgMult: number) {
  const p = eng.player, H = CR.HUMAN
  const sees = d < H.sight && Math.abs(e.z - p.z) < 1.8 && eng.los(e.x, e.y, p.x, p.y)
  if (e.hp < s.lastHp - 1e-6) {s.alertT = H.loseT;e.targetX=p.x;e.targetY=p.y}
  s.lastHp = e.hp
  if (sees) {s.alertT=H.loseT;e.targetX=p.x;e.targetY=p.y} else s.alertT -= dt
  const alert = !eng.over && (s.alertT > 0)
  s.speed = 0
  switch (s.mode) {
    case 'scream':
      faceToward(eng, e, p.x, p.y, dt, 4)
      if (s.clipT >= H.screamDur) setMode(s, 'chase', 'crawl')
      break
    case 'attack': {
      // 扑击：按 creeperLungeRoot 推进根位移（沿朝向，撞墙就停）
      const want = creeperLungeRoot(s.clipT), step = want - s.lungeD
      if (step > 1e-5) {
        e.targetX = e.x + Math.cos(e.facing) * 3; e.targetY = e.y + Math.sin(e.facing) * 3
        const x0 = e.x, y0 = e.y
        eng.stepEntity(e, step / Math.max(1e-4, dt), dt)
        s.speed = Math.hypot(e.x - x0, e.y - y0) / Math.max(1e-4, dt)
      }
      s.lungeD = want
      if (!s.hitDone && s.clipT >= H.lungeHit) {
        s.hitDone = true
        if (Math.hypot(e.x - p.x, e.y - p.y) < H.reach && eng.meleeZOk(e) && eng.los(e.x,e.y,p.x,p.y)) { eng.hurtPlayer(H.damage * dmgMult, e.def.name); creepBite(eng, e.def.name) }
      }
      if (s.clipT >= H.lungeDur) setMode(s, alert ? 'chase' : 'idle', alert ? 'crawl' : 'idle')
      break
    }
    default:
      if (alert) {
        if (s.screamCd <= 0 && sees && s.mode !== 'chase') {
          s.screamCd = H.screamCd; setMode(s, 'scream', 'scream'); eng.noiseEvent(e.x, e.y, 18, true)
          if (d < 20) { audio.aggro(); eng.msg('一声嘶哑的尖叫——地上那团焦黑的东西撑起双臂，朝你爬了过来。', 'damage') }
          break
        }
        if (s.mode !== 'chase') setMode(s, 'chase', 'crawl')
        if (d < H.lungeR && e.attackCd <= 0 && sees && eng.meleeZOk(e)) {
          const want = Math.atan2(p.y - e.y, p.x - e.x); e.facing = want
          setMode(s, 'attack', 'lunge'); s.lungeD = 0; e.attackCd = H.lungeGap
          break
        }
        const x0 = e.x, y0 = e.y
        eng.stepEntity(e, H.speed, dt)
        s.speed = Math.hypot(e.x - x0, e.y - y0) / Math.max(1e-4, dt)
      } else {
        if (s.mode !== 'idle') setMode(s, 'idle', 'idle')
      }
  }
  e.state = s.mode === 'attack' ? 'attack' : alert ? 'chase' : 'idle'
}

/** 感染体传染身边未感染的尸鼠 / 蛛形纲（规则从简：1.4 m 内、每 8 s 一次、10%，新感染 1 阶） */
function spreadFrom(eng: Engine, e: Entity, s: CreepEntState) {
  if (s.host === 'human') return
  for (const q of eng.map!.entities) {
    if (q.dead || q === e || (q.def.type !== 'corpserat' && q.def.type !== 'arachnid') || q.def.ceilingCrawler) continue
    if (Math.hypot(q.x - e.x, q.y - e.y) > CR.SPREAD_R || Math.random() >= CR.SPREAD_P) continue
    makeCreeper(q, q.def.type === 'arachnid' ? 'arachnid' : 'rat', 1, eng.levelDef?.id ?? 0)
  }
}

// ============================================================================
// 玩家侧：接触途径
// ============================================================================
/** 被感染体咬中（伤害已结算）。包扎窗口内减半 */
export function creepBite(eng: Engine, _src: string) {
  if (eng.dev?.god) return
  const r = eng.creepRun, before = r.infected
  const a = creepAddLoad(r, 'bite')
  if (a > 0 && r.bandageT > 0) eng.msg('伤口被咬开了一点——好在包扎过，没有咬透。', 'system')
  if (!before && r.infected) onDiagnosed(eng)
}
/** 近战击杀感染体：2 m 内被孢子溅到 */
export function creeperMeleeKill(eng: Engine, e: Entity) {
  if (e.def.type !== 'creeper' || eng.dev?.god) return
  if (Math.hypot(e.x - eng.player.x, e.y - eng.player.y) > CR.SPLASH_R) return
  const r = eng.creepRun, before = r.infected
  if (creepAddLoad(r, 'splash') > 0) eng.msg('它破开的瞬间喷出一蓬白色的粉末，扑了你一脸。', 'damage')
  if (!before && r.infected) onDiagnosed(eng)
}
/** 击杀（任何方式）：尸体停留、原地留孢子团、尸鼠掉「长白毛的尸鼠肉」 */
export function creeperKilled(eng: Engine, e: Entity) {
  if (e.def.type !== 'creeper' || !e.cr) return
  e.deathT = CR.CORPSE_T
  e.cr.mode = 'dead'; e.cr.clip = 'death'; e.cr.clipT = 0
  const m = eng.map!, ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const r = eng.creepRun
  r.spores.push({ id: (Date.now() % 1e7) + Math.random(), wx: e.x + ox, wy: e.y + oy, z: e.z, t: CR.SPORE_LIFE, life: CR.SPORE_LIFE, level: eng.levelDef.id, seed: e.id })
  while (r.spores.length > CR.SPORE_MAX) r.spores.shift()
  if (e.cr.host === 'rat' && Math.random() < CR.MEAT_P) {
    const item = { id: Math.random(), type: 'creepmeat', x: e.x, y: e.y, z: e.z }
    m.items.push(item)
    const inf = m.inf
    if (inf) inf.chunks.get(`${Math.floor((item.x + inf.ox) / 32)},${Math.floor((item.y + inf.oy) / 32)}`)?.items.push(item)
  }
}
/** 吃下感染体的肉 */
export function creepEat(eng: Engine) {
  const r = eng.creepRun, before = r.infected
  creepAddLoad(r, 'eat')
  if (!before && r.infected) onDiagnosed(eng)
}
/** 包扎伤口：之后 3 分钟内被咬，负荷减半 */
export function creepBandage(eng: Engine) { eng.creepRun.bandageT = CR.BANDAGE_T }
/** 火盐晶体爆开：烧掉附近的孢子团和僵尸蜘蛛 */
export function creepBurnAt(eng: Engine, x: number, y: number, r = CR.BURN_R) {
  const m = eng.map, run = eng.creepRun
  if (!m) return 0
  const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const n0 = run.spores.length
  run.spores = run.spores.filter((s) => s.level !== eng.levelDef.id || Math.hypot(s.wx - ox - x, s.wy - oy - y) > r)
  let n = n0 - run.spores.length
  for (const list of run.decor.values()) for (const dd of list) if (!run.burnedDecor.has(dd.id) && Math.hypot(dd.wx - ox - x, dd.wy - oy - y) < r) { run.burnedDecor.add(dd.id); n++ }
  if (n > 0) eng.msg('火焰舔过那团白绒，噼啪作响地卷曲、焦黑。', 'system')
  return n
}
function onDiagnosed(_eng: Engine) { /* 确诊无提示（HUD 不显示病程）：第一次剧痛在 AWARE_T 秒后 */ }

// ============================================================================
// 玩家侧：每帧
// ============================================================================
const PAIN_LINES = ['伤口那里一跳一跳地疼，像有细针在往里钻。', '一阵抽痛顺着胳膊往上爬。', '你按住伤口——皮肤底下有什么东西在动。']
const URGE_LINES = ['你想把脸埋进潮湿、温暖的墙角里。', '暗处在叫你。去暗处，去更湿的地方。', '你盯着自己的手指，想咬下去，看看里面是不是白色的。', '你忽然很想停下来，蜷在地上，一动不动。', '那些尸鼠……闻起来很亲切。']
const pick = (a: readonly string[]) => a[Math.floor(Math.random() * a.length)]
const between = (a: readonly number[]) => a[0] + Math.random() * (a[1] - a[0])

/** 当前位置的环境样本（明暗 / 湿度 / 热源） */
export function creepEnvAt(eng: Engine): CreepEnvSample {
  const p = eng.player, m = eng.map!
  const ti = Math.floor(p.y) * m.w + Math.floor(p.x)
  const lit = eng.isLit(p.x, p.y) // 手电不算「明亮」：只看环境光
  const wet = m.wet?.[ti] === 1 || eng.inLiquid !== 0
  let warm = false
  for (const s of m.structures) {
    if (s.kind !== 'boiler' && s.kind !== 'sphboiler') continue
    if (Math.hypot(s.x + s.w / 2 - p.x, s.y + s.h / 2 - p.y) < CR.WARM_R) { warm = true; break }
  }
  return { lit, wet, warm }
}

/** 每帧（engine.step，在 stepFerrenWorld 之前：X 上升沿由这里先判） */
export function stepCreepWorld(eng: Engine, dt: number) {
  const r = eng.creepRun, p = eng.player, m = eng.map
  r.throb = Math.max(0, r.throb - dt * 1.6)
  if (!m || eng.over) { r.prevHeld = !!eng.specialHeld; return }
  // —— X：1 阶烧灼 ——
  const held = !!eng.specialHeld
  if ((eng.specialPressed || (held && !r.prevHeld)) && creepCauterizeAvailable(eng)) { creepCauterize(eng); eng.specialPressed = false; eng.ferrenRun.prevHeld=held }
  r.prevHeld = held
  // —— 孢子团 / 僵尸蜘蛛：持续接触 ——
  const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0, lv = eng.levelDef.id
  r.spores = r.spores.filter((s) => (s.t -= dt) > 0)
  let touch = 0
  if (!eng.dev?.god) {
    for (const s of r.spores) if (s.level === lv && Math.abs(s.z - p.z) < 1.4 && Math.hypot(s.wx - ox - p.x, s.wy - oy - p.y) < CR.SPORE_R) touch += CR.SPORE_RATE * dt
    for (const list of r.decor.values()) for (const dd of list) if (!r.burnedDecor.has(dd.id) && Math.hypot(dd.wx - ox - p.x, dd.wy - oy - p.y) < CR.DECOR_R) touch += CR.DECOR_RATE * dt
  }
  if (touch > 0) { const before = r.infected; creepAddLoad(r, 'spore', touch); if (!before && r.infected) onDiagnosed(eng) }
  creepDecayLoad(r, dt)
  r.scanT -= dt
  if (r.scanT <= 0) { r.scanT = 1; scanDecor(eng) }
  // —— 病程 ——
  if (!r.infected) return
  if (eng.dev?.god && eng.dev.statLock) return
  const env = creepEnvFactor(lv, creepEnvAt(eng))
  r.env = env
  r.courseT += dt * env
  const st = creepStageAt(r.courseT)
  if (st >= 5) { creepTurn(eng); return }
  if (st > r.stageShown) { r.stageShown = st; stageEntry(eng, st) }
  if (st === 1) {
    p.hp -= CR.BLEED1 * dt
    r.painT -= dt
    if (r.painT <= 0) {
      r.painT = between(CR.PAIN_GAP)
      r.throb = 1
      p.hp -= CR.PAIN_HP; audio.hurt(); eng.camShake = Math.min(1, eng.camShake + 0.25)
      if (!r.aware) { r.aware = true; eng.msg('被咬过的地方猛地一阵剧痛——像有什么东西在皮肤底下扎了根。', 'damage') }
      else eng.msg(pick(PAIN_LINES), 'damage')
    }
  }
  if (st >= 2) p.hunger = Math.max(0, p.hunger - 0.28 * (CR.HUNGER_K2 - 1) * dt)
  if (st >= 3) p.stamina = Math.min(p.stamina, CR.STAMINA_CAP3)
  if (st >= 4) {
    p.sanity = Math.max(0, p.sanity - CR.SANITY4 * dt)
    r.urgeT -= dt
    if (r.urgeT <= 0) { r.urgeT = between(CR.URGE_GAP); eng.msg(pick(URGE_LINES), 'lore'); audio.whisper(0.6); r.throb = 0.6 }
  }
  if (p.hp <= 0) eng.die('爬菌在身体里扎了根')
}
function stageEntry(eng: Engine, st: number) {
  if (st === 2) { eng.msg('手背上冒出几颗白色的绒毛痘，挠不掉，越挠越多。你饿得发慌。', 'damage'); audio.stomach() }
  else if (st === 3) { eng.msg('白绒连成了片，整条手臂都被盖住了。浑身滚烫，眼前的空气在扭动。', 'damage'); eng.creepRun.throb = 1 }
  else if (st === 4) { eng.msg('指甲长长了，又硬又弯。脑子里有个声音，一直在让你去暗处、去潮湿温暖的地方……', 'lore'); audio.whisper(0.8) }
}
/** 5 阶：死亡，原地爬出一只爬菌人 */
function creepTurn(eng: Engine) {
  const p = eng.player, m = eng.map!
  const h = spawnCreeper('human', 5, p.x, p.y, p.z, eng.levelDef.id)
  h.facing = p.facing
  m.entities.push(h)
  eng.creepRun.infected = false
  eng.die('爬菌走完了病程——你的身体用双手撑起来，自己爬走了', true)
}

// —— X 烧灼 ——
function hasLighter(eng: Engine) { return !!eng.player.hasLighter || eng.player.equip?.offhand?.type === 'lighter' || eng.countItem('lighter') > 0 }
export function creepCauterizeAvailable(eng: Engine): boolean {
  return creepCanCauterize(eng.creepRun, { firesalt: eng.countItem('firesalt'), lighter: hasLighter(eng) })
}
export function creepSpecial(eng: Engine): SpecialAction | null {
  if (!creepCauterizeAvailable(eng)) return null
  return { id: 'creep-cauterize', label: '烧灼伤口', hint: hasLighter(eng) ? '用打火机把伤口烧焦，赶在它扎根之前（扣血）' : '捏碎一颗火盐晶体按在伤口上（扣血）', hold: false }
}
/** 烧灼：扣血（不致死）、清除感染、负荷清零；打火机不消耗，否则消耗 1 颗火盐晶体 */
export function creepCauterize(eng: Engine): boolean {
  if (!creepCauterizeAvailable(eng)) return false
  const p = eng.player, r = eng.creepRun
  const lighter = hasLighter(eng)
  if (!lighter) eng.consumeItem('firesalt')
  p.hp = Math.max(1, p.hp - CR.CAUTERIZE_HP)
  p.sanity = Math.max(0, p.sanity - CR.CAUTERIZE_SAN)
  r.infected = false; r.courseT = 0; r.load = 0; r.aware = false; r.stageShown = 0; r.throb = 1
  eng.camShake = Math.min(1, eng.camShake + 0.6)
  audio.armsSfx('sizzle'); audio.hurt()
  eng.emit({ kind: 'damage' })
  eng.msg(lighter ? '你咬紧牙，把打火机的火苗压在伤口上。一股焦糊味——底下那点在动的东西不动了。' : '你捏碎火盐晶体按在伤口上，炽热的火花把皮肉烫得滋滋作响——底下那点在动的东西不动了。', 'damage')
  return true
}

// —— 其它系统读取 ——
/** 徒手伤害倍数（4 阶长指甲） */
export function creepFistMult(eng: Engine): number { return creepStage(eng.creepRun) >= 4 ? CR.FIST_K4 : 1 }
/** NPC 拒绝交易（4 阶）：返回 true 表示已拒绝（调用方不再打开对话） */
export function creepNpcRefuse(eng: Engine, name: string): boolean {
  if (creepStage(eng.creepRun) < 4) return false
  eng.msg(`${name}看清你的手，猛地往后退了一步：「别过来！……走开，我不跟你做买卖。」`, 'system')
  return true
}
/** 第一人称手臂阶段（0–4）：病程 1 阶手上还看不出，2–4 阶依次长菌 */
export function creepHandStage(eng: Engine): 0 | 2 | 3 | 4 {
  const s = creepStage(eng.creepRun)
  return s >= 4 ? 4 : s === 3 ? 3 : s === 2 ? 2 : 0
}
/** HUD 画面症状（无数值）：throb 抽痛红闪、heat 高烧热浪、vignette 4 阶血红暗角 */
export function creepOverlay(eng: Engine): { throb: number; heat: number; vignette: number } {
  const s = creepStage(eng.creepRun)
  return { throb: eng.creepRun.throb, heat: s >= 3 ? (s === 3 ? 0.8 : 0.45) : 0, vignette: s >= 4 ? 1 : 0 }
}

// ============================================================================
// 生成：chunk 实例化时替换 / 注入（world/infinite.ts 调用）；僵尸蜘蛛装饰
// ============================================================================
/**
 * chunk 实体实例化后调用：按 CR.SPAWN 把尸鼠 / 蛛形纲替换成感染体，L5 锅炉房 chunk 额外注入，极罕见注入爬菌人。
 * tiles = chunk 局部 CS×CS（1 = 地面）；boiler(wx,wy) = 该世界坐标是否在 L5 锅炉房里。entities 坐标为窗口坐标。
 */
export function creeperChunkSpawns(levelId: number, seed: number, cx: number, cy: number, CS: number, tiles: ArrayLike<number>, entities: Entity[], ox: number, oy: number, boiler?: (wx: number, wy: number) => boolean) {
  if (!CR.SPAWN[levelId]) return
  for (const e of entities) {
    if ((e.def.type !== 'corpserat' && e.def.type !== 'arachnid') || e.def.ceilingCrawler || e.def.arachnidNest || e.def.arachnidMother) continue
    const wx = e.x + ox, wy = e.y + oy
    if (!creepSpawnReplace(levelId, e.def.type, creepHash(seed, wx, wy, 0x17), levelId === 5 ? !!boiler?.(wx, wy) : false)) continue
    makeCreeper(e, e.def.type === 'arachnid' ? 'arachnid' : 'rat', creepPickStage(creepHash(seed, wx, wy, 0x18)), levelId, Math.floor(creepHash(seed, wx, wy, 0x19) * 1e6))
  }
  const floorTile = (salt: number, test?: (wx: number, wy: number) => boolean) => {
    for (let i = 0; i < 24; i++) {
      const lx = Math.floor(creepHash(seed, cx, cy, salt + i * 2) * CS), ly = Math.floor(creepHash(seed, cx, cy, salt + i * 2 + 1) * CS)
      if (tiles[ly * CS + lx] !== 1) continue
      const wx = cx * CS + lx + 0.5, wy = cy * CS + ly + 0.5
      if (test && !test(wx, wy)) continue
      return { wx, wy }
    }
    return null
  }
  if (levelId === 5 && boiler && creepHash(seed, cx, cy, 0x51) < CR.L5_INJECT) {
    const t = floorTile(0x520, boiler)
    if (t) entities.push(spawnCreeper('rat', creepPickStage(creepHash(seed, cx, cy, 0x53)), t.wx - ox, t.wy - oy, 0, levelId, Math.floor(creepHash(seed,cx,cy,0x54)*1e6)))
  }
  if (creepHash(seed, cx, cy, 0x61) < (CR.HUMAN_CHUNK[levelId] ?? 0)) {
    const t = floorTile(0x620, levelId === 5 ? boiler : undefined)
    if (t) entities.push(spawnCreeper('human', 5, t.wx - ox, t.wy - oy, 0, levelId, Math.floor(creepHash(seed, cx, cy, 0x63) * 1e6)))
  }
}

/** 已加载 chunk 的僵尸蜘蛛位置（墙角挂点，按种子确定；烧掉的记在 burnedDecor） */
function scanDecor(eng: Engine) {
  const m = eng.map!, r = eng.creepRun, lv = eng.levelDef.id
  const chance = CR.DECOR_CHUNK[lv]
  if (!chance || !m.inf) { if (r.decor.size) r.decor.clear(); return }
  const inf = m.inf, CS = 32, seed = inf.seed
  const live = new Set<string>()
  for (const c of inf.chunks.values()) {
    const key = `${lv}:${c.cx},${c.cy}`
    live.add(key)
    if (r.decor.has(key)) continue
    const list: CreepDecor[] = []
    if (creepHash(seed, c.cx, c.cy, 0x71) < chance) {
      const tiles = c.tiles as ArrayLike<number>
      const at = (lx: number, ly: number) => lx < 0 || ly < 0 || lx >= CS || ly >= CS ? 0 : tiles[ly * CS + lx]
      for (let i = 0; i < 128 && !list.length; i++) {
        const lx = 1 + Math.floor(creepHash(seed, c.cx, c.cy, 0x700 + i * 2) * (CS - 2)), ly = 1 + Math.floor(creepHash(seed, c.cx, c.cy, 0x701 + i * 2) * (CS - 2))
        if (at(lx, ly) !== 1) continue
        // Tile 0 is empty space, not a wall supporting a web.
        const wW = at(lx - 1, ly) === 2, wE = at(lx + 1, ly) === 2, wN = at(lx, ly - 1) === 2, wS = at(lx, ly + 1) === 2
        // 墙角：两面相邻的墙；装饰局部 +X/+Z 朝房间
        let rot: number | null = null, kx = 0, ky = 0
        if (wW && wN) { rot = 0; kx = 0; ky = 0 } else if (wW && wS) { rot = Math.PI / 2; kx = 0; ky = 1 } else if (wE && wN) { rot = -Math.PI / 2; kx = 1; ky = 0 } else if (wE && wS) { rot = Math.PI; kx = 1; ky = 1 }
        if (rot === null) continue
        const wx = c.cx * CS + lx + kx + (kx ? -0.04 : 0.04), wy = c.cy * CS + ly + ky + (ky ? -0.04 : 0.04)
        if(lv===5&&l5RegionAt(seed,wx,wy)?.variant!=='boilerroom')continue
        list.push({ id: `${key}:${lx},${ly}`, wx, wy, z: CR.DECOR_Z, rot, seed: Math.floor(creepHash(seed, wx, wy, 0x72) * 1e6) })
      }
    }
    r.decor.set(key, list)
  }
  for (const k of [...r.decor.keys()]) if (!live.has(k)) r.decor.delete(k)
}

// chunk 实例化钩子（world/infinite 调用；L5 锅炉房判定用 l5RegionAt）
CHUNK_SPAWN_HOOKS.push((lv, seed, cx, cy, CS, tiles, ents, ox, oy) => creeperChunkSpawns(lv, seed, cx, cy, CS, tiles, ents, ox, oy, lv === 5 ? (wx, wy) => l5RegionAt(seed, wx, wy)?.variant === 'boilerroom' : undefined))
