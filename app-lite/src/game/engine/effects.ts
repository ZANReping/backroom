// v53：持续性效果/状态统一注册表（自 engine.ts 拆分）。
// 引擎中所有「持续性效果/状态」字段在此登记：id、字段名、默认值、分类、
// 存档序列化键（SaveSnapshot）、重置时机（新一局/换层）、tick 挂载点。
// 字段本体仍声明在 Engine 类上（HUD/DevPanel/存档兼容直读 eng.<field>），本表提供：
//  - runEffectTicks：step 顶部计时器组的统一 tick（pre=售货机活化判定前 / post=其后，相对顺序与原内联代码一致）
//  - resetEffects：新一局（newRun）/换层（loadLevel）按表重置为默认值（替换原逐字段赋值，逐字段语义一致）
// 未迁移进 tick 的效果在 mount 注明其逻辑挂载点（原 step 内联位置/交互入口），代码原位保留。
import type { Engine } from '../engine'
import type { SaveSnapshot } from './save'
import { freshWarehouses } from './warehouse'

export interface EffectDef {
  id: string // 唯一 id
  field: string // Engine 实例字段名（dev.phenOn/phenOff 为 dev 子字段，仅登记不参与重置）
  def: unknown // 默认值（函数=工厂，每次调用生成新值——Set/对象等引用类型必须如此）
  cat: 'blackout' | 'addiction' | 'plant' | 'candy' | 'jerry' | 'brc' | 'phen' | 'misc' // 机制分类
  saveKey?: keyof SaveSnapshot // 存档序列化键（随 br_save_state 持久；缺省=不持久）
  resetOnNewRun?: boolean // newRun 时重置为默认值（读档路径随后由快照覆盖）
  resetOnLevel?: boolean // loadLevel 时重置为默认值
  tickPhase?: 'pre' | 'post' // step 顶部计时器组：pre=人制品售货机活化判定之前，post=之后
  tick?: (eng: Engine, dt: number) => void // 每帧 tick/衰减（仅 step 顶部计时器组迁移至此）
  mount: string // 逻辑挂载点说明（未迁移的效果注明其代码位置）
}

export const EFFECTS: EffectDef[] = [
  // ===== L1 停电事件（现象「闪烁」）=====
  { id: 'blackout-timer', field: 'blackoutT', def: 0, cat: 'blackout', resetOnLevel: true, mount: 'ambient.updateAmbient（倒计时归零→endBlackout）' },
  { id: 'blackout-warn', field: 'blackoutWarnT', def: 0, cat: 'blackout', resetOnLevel: true, mount: 'ambient.updateAmbient（预警期归零→applyBlackout）' },
  { id: 'blackout-pending', field: 'blackoutPendingDur', def: 0, cat: 'blackout', mount: 'ambient.startBlackout→applyBlackout（换层不重置，维持原语义）' },
  { id: 'blackout-backup', field: 'blackoutBackup', def: null, cat: 'blackout', resetOnLevel: true, mount: 'ambient.applyBlackout/endBlackout（有限层光源备份）' },
  // ===== 皇家口粮成瘾 =====
  { id: 'royal-addict', field: 'royalAddictT', def: 0, cat: 'addiction', mount: 'survival.updateSurvival（成瘾期计时，结束播报）' },
  { id: 'royal-floor', field: 'sanityFloor', def: 0, cat: 'addiction', mount: 'survival.updateSurvival（理智下限锁定，崩塌期失效）' },
  { id: 'royal-drain', field: 'royalDrainT', def: 0, cat: 'addiction', mount: 'survival.updateSurvival（崩塌期理智急降，仅非 god 分支内）' },
  // ===== 植殖癌（L1 花园段）=====
  { id: 'plant-k', field: 'plantK', def: 0, cat: 'plant', resetOnLevel: true, mount: 'movement.updateMovement（花园段内涨/离段 2 倍速退）' },
  { id: 'plant-stage', field: 'plantStage', def: 0, cat: 'plant', resetOnLevel: true, mount: 'movement.updateMovement（三阶段播报进度）' },
  { id: 'plant-active', field: 'inGardenEff', def: false, cat: 'plant', mount: 'movement.updateMovement（本帧生效标记，含 dev 强制开/关）' },
  // ===== Object 5 糖果 / 人制品 / 镇静剂 =====
  { id: 'candy-addict', field: 'candyAddictT', def: 0, cat: 'candy', tickPhase: 'pre', mount: 'effects tick（pre）', tick(eng, dt) {
    if (eng.candyAddictT > 0) {
      eng.candyAddictT -= dt
      if (eng.candyAddictT <= 0) {
        eng.player.sanity = Math.max(0, eng.player.sanity - 10)
        eng.msg('糖瘾发作——你需要再来一颗糖。（理智 -10）', 'damage')
      }
    }
  } },
  { id: 'silver-tongue', field: 'silverTongueT', def: 0, cat: 'candy', tickPhase: 'pre', mount: 'effects tick（pre）', tick(eng, dt) {
    if (eng.silverTongueT > 0) eng.silverTongueT -= dt
  } },
  { id: 'gun-candy', field: 'gunCandyT', def: 0, cat: 'candy', tickPhase: 'pre', mount: 'effects tick（pre）', tick(eng, dt) {
    if (eng.gunCandyT > 0) {
      eng.gunCandyT -= dt
      if (eng.gunCandyT <= 0) eng.msg('右手的枪感褪去了——它重新变回了手。', 'lore')
    }
  } },
  { id: 'choco-cd', field: 'chocoCd', def: 0, cat: 'candy', tickPhase: 'pre', mount: 'effects tick（pre）', tick(eng, dt) {
    if (eng.chocoCd > 0) eng.chocoCd -= dt
  } },
  { id: 'slippery', field: 'slipperyT', def: 0, cat: 'candy', mount: 'movement.updateMovement（移动积分内衰减 + 惯性漂移）' },
  { id: 'manmade', field: 'manmadeT', def: 0, cat: 'candy', tickPhase: 'post', mount: 'effects tick（post）', tick(eng, dt) {
    if (eng.manmadeT > 0) eng.manmadeT -= dt
  } },
  { id: 'webbed', field: 'webbedT', def: 0, cat: 'misc', tickPhase: 'post', mount: 'effects tick（post）+ movement 减速 + entityAI.updateNguithr 触发', tick(eng, dt) {
    if (eng.webbedT > 0) eng.webbedT -= dt
  } },
  // ===== 玩家噪音残余 =====
  { id: 'player-noise', field: 'playerNoiseT', def: 0, cat: 'misc', mount: 'movement.updateMovement（每帧衰减；entityAI.noiseEvent 刷新）' },
  // ===== 杰瑞的信众 / Level 274 教化 =====
  { id: 'jerry-contact-cd', field: 'jerryContactCd', def: 0, cat: 'jerry', resetOnNewRun: true, mount: 'npc.updateJerry（20s 接触冷却）' },
  { id: 'jerry-oath', field: 'jerryOath', def: false, cat: 'jerry', resetOnNewRun: true, saveKey: 'jerryOath', mount: 'npc.agreeJerry（每局仅首次 +10；旧档按 jerryAgreed 非空迁移）' },
  { id: 'jerry-agreed', field: 'jerryAgreed', def: () => new Set<string>(), cat: 'jerry', resetOnNewRun: true, saveKey: 'jerryAgreed', mount: 'npc.agreeJerry（引路选项显示依据）' },
  { id: 'indoctrination', field: 'indoctrination', def: 0, cat: 'jerry', resetOnNewRun: true, saveKey: 'indoctrination', mount: 'npc.contactJerry/tameJerry（教化 0~100）' },
  { id: 'jerry-tamed', field: 'jerryTamed', def: false, cat: 'jerry', resetOnNewRun: true, saveKey: 'jerryTamed', mount: 'npc.tameJerry（驯服后教化不再积累）' },
  { id: 'jerry-territory', field: 'jerryTerritory', def: false, cat: 'jerry', resetOnNewRun: true, mount: 'npc.updateJerry（每帧按信众宣传间矩形重算）' },
  { id: 'chant-t', field: 'chantT', def: 0, cat: 'jerry', resetOnNewRun: true, mount: 'npc.updateJerry（L274 诵咏计时）' },
  // ===== BRC 后室装修公司 =====
  { id: 'brc-sin', field: 'brcSin', def: () => ({ hurt: 0, killed: 0 }), cat: 'brc', resetOnNewRun: true, saveKey: 'brcSin', mount: 'combat.attack（记罪）/ npc.confessBrc（坦白结清）' },
  { id: 'brc-mimic-cd', field: 'brcMimicCd', def: 0, cat: 'brc', resetOnNewRun: true, saveKey: 'brcMimicCd', mount: 'npc.updateNpcs（冷却倒数）/ npc.mimicBrc（触发）' },
  { id: 'brc-mimic-pending', field: 'brcMimicPending', def: 0, cat: 'brc', resetOnNewRun: true, mount: 'npc.updateNpcs（挥臂动画播完结算 +2）' },
  // ===== 其他持续状态 =====
  { id: 'el3a-relief', field: 'el3aReliefClaimed', def: false, cat: 'misc', mount: 'level.loadLevel（id===105 条件重置，保持原逻辑）/ npc.claimEl3aRelief' },
  { id: 'provoked', field: 'provoked', def: false, cat: 'misc', resetOnLevel: true, mount: 'combat.attack/squirt（解除 Level 11 Effect 被动状态）' },
  // ===== v54：据点寄存仓库（阵营互通库存；新一局清空，读档由快照覆盖）=====
  { id: 'warehouses', field: 'warehouses', def: () => freshWarehouses(), cat: 'misc', resetOnNewRun: true, saveKey: 'warehouses', mount: 'warehouse.warehouseDeposit/warehouseWithdraw（DialogOverlay 仓库模式）' },
  // ===== v55：疫疾（Entity 19）——infection 本体是 PlayerState 字段（freshPlayer 清零、随快照持久，
  // 不参与本表重置——field 带点号即跳过）；infectionStage/coughT 为引擎侧派生/计时 =====
  { id: 'malady-infection', field: 'player.infection', def: 0, cat: 'misc', mount: 'PlayerState 字段：survival.updateSurvival 积累（湿地/锅炉房）与阶段效果；快照随 player 持久；freshPlayer=0' },
  { id: 'malady-stage', field: 'infectionStage', def: 0, cat: 'misc', resetOnNewRun: true, mount: 'survival.updateSurvival（升阶计图鉴遭遇；读档按快照感染值推导）' },
  { id: 'malady-cough', field: 'coughT', def: 0, cat: 'misc', resetOnNewRun: true, mount: 'survival.updateSurvival（潜藏期咳嗽计时→noiseEvent）' },
  { id: 'malady-recover', field: 'infectionRecoverT', def: 0, cat: 'misc', resetOnNewRun: true, mount: 'survival.updateSurvival（「恢复」buff：阻增长+非感染区每 5s -1）' },
  // ===== 开发者现象开关（dev 子字段，仅登记）=====
  { id: 'phen-on', field: 'dev.phenOn', def: () => new Set<string>(), cat: 'phen', mount: 'DevPanel 世界页强制开；step 现象判定读取' },
  { id: 'phen-off', field: 'dev.phenOff', def: () => new Set<string>(), cat: 'phen', mount: 'DevPanel 世界页强制关；step 现象判定读取' },
]

/** step 顶部计时器组统一 tick（pre/post 两组的相对位置与原内联代码一致） */
export function runEffectTicks(eng: Engine, dt: number, phase: 'pre' | 'post') {
  for (const e of EFFECTS) if (e.tickPhase === phase && e.tick) e.tick(eng, dt)
}

/** 按注册表重置持续性效果状态（scope=newRun：新一局；scope=level：换层） */
export function resetEffects(eng: Engine, scope: 'newRun' | 'level') {
  for (const e of EFFECTS) {
    if (e.field.includes('.')) continue // dev 子字段不参与重置
    if (scope === 'newRun' ? !e.resetOnNewRun : !e.resetOnLevel) continue
    ;(eng as unknown as Record<string, unknown>)[e.field] = typeof e.def === 'function' ? (e.def as () => unknown)() : e.def
  }
}
