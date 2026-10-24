// [vending] 售货机重制阶段 3：普通售货机（structure 'vending'）与 Entity 36「人制品售货机」的机制。
// 依据 backrooms-wiki-cn entity-36 与 ZAN 的取舍（10-23）：
//   · 两种机器共用一套交互界面：字母键（A/B）+ 数字键（1–4）选格，红色数码屏显示输入；出货动画在 3D 机器上实际播放，
//     货掉进取货口后在界面上点「取货口」拿走。
//   · 普通机：虚构品牌、免费；每格库存有限、卖光变红灯；每次出货 25% 卡货——货卡在格口半道上，之后整台机器罢工；
//     拍打机身有机会把卡住的那件拍下来。只收磁带的旧机器保留：投一盘磁带 = 两次出货额度。
//   · Entity 36：正面取货无需支付——由一只白骨手推出；产品是人体组织，取出后都是物品「人制品」；
//     每格库存有限，定时一瞬间补满，补货 / 出货时机器里传来亲人般的哭声。
//   · 背面是安全的辨认方式（标语 + 艾里克家族），不再有「背对它就激活」。
//   · 成瘾（按推荐）：吃人制品累积依赖度；≥25 远离售货机持续掉理智；≥50 越来越难吃下别的食物；
//     满 100 成为「受害者」——它不再攻击你，但每隔几分钟抹掉你对周围地形的记忆（小地图探索清空）。
//   · 激怒：只有攻击它（没有流浪者，所以没有领地驱赶）。普通武器几乎打不动（×0.12）；瓶装闪电（Object 42）电晕 8 秒并造成重创。
//   · 活化：底门伸出两条金属涂装骷髅臂当腿站起，爬行追击；顶门伸出巨型骷髅臂劈砍；贴身时抓取。
//     跟丢 / 离得太远就爬回原位重新休眠；被打坏后瘫在原地，撬开后部暗格是三具无臂的艾里克尸体在低语。
//   · 只在原有生成点出现（L2 走廊尽头）。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import type { Structure } from '../core/types'
import { ENTITIES, recordEntityEncounter } from '../entities'
import { audio } from '../core/audio'
import { look } from '../core/renderer3d'
import { los, faceToward, stepEntity } from './entityAI'
import {
  vendingLayout, vendingSeedOfEntity, vendingSeedOfStruct, PRODUCT_NAME, PRODUCT_BLURB, SLOT_CODES, BRAND_LABEL, VENDING_E36_STOCK,
  type VendingBrand, type VendingProduct, type VendingVariant,
} from '../content/vendingLayout'

/** 数值表（秒 / 米 / 点） */
export const VM = {
  USE_R: 2.4, // 界面打开时离机器超过这个距离自动关闭
  COIL_T: 1.8, HAND_T: 2.4, JAM_T: 1.6, RESTOCK_T: 1.0, // 与 vendingAnim 片段时长一致
  BIN_AT_COIL: 1.45, BIN_AT_HAND: 2.05, // 片段里货落进取货斗的时刻
  JAM_P: 0.25, KICK_P: 0.35, KICK_CD: 1.2, TAPE_CREDIT: 2,
  E36_RESTOCK: 300, CRY_R: 14, CRY_SAN: 3,
  // 成瘾
  ADDICT_EAT: 22, ADDICT_DECAY: 0.02, T1: 25, T2: 50, VICTIM: 100, VICTIM_LOSE: 60,
  FAR_R: 30, FAR_SAN: 0.12, FAR_MSG: 75, REFUSE_BASE: 40, WIPE_T: 240,
  // 战斗
  RESIST: 0.12, SHOCK_DMG: 70, SHOCK_STUN: 8, SHOCK_R: 2.8,
  EMERGE_T: 1.6, SETTLE_T: 1.6, SPEED: 1.4, RETURN_SPEED: 1.0,
  OPEN_T: 1.2, CHOP_R: 2.3, CHOP_HIT_AT: 0.62, CHOP_T: 1.1, CHOP_DMG: 18, CHOP_REACH: 2.7,
  GRAB_R: 1.15, GRAB_HIT_AT: 0.7, GRAB_T: 1.3, GRAB_DMG: 10, GRAB_SLOW: 2.2,
  ATTACK_CD: 1.5, LOSE_R: 26, LOSE_T: 16, OPEN_SAN: 15,
}

export type VendAnimClip = 'coil' | 'jam' | 'hand' | 'restock'
export interface VendMachineState {
  variant: VendingVariant; brand: VendingBrand
  products: VendingProduct[]; stock: number[]; max: number[]
  input: string // 数码屏上已输入的编号（'' / 'A' / 'A3'）
  flash: string; flashT: number // 数码屏临时显示（SOLD / Err / 'A3' 闪烁）
  anim: { clip: VendAnimClip; slot: number; t: number } | null
  bin: { slot: number; product: VendingProduct } | null // 掉进取货口、还没拿走的货
  jamSlot: number // 卡在格口的那件（-1 = 没有）
  jammed: boolean; credit: number; kickCd: number
  cry: string; cryT: number // 界面底部的哭声字幕
  pendingDrop?: VendingProduct // 拍下来的那件（库存已在卡货时扣过）
}
export type Vm36Mode = 'dormant' | 'emerge' | 'chase' | 'open' | 'chop' | 'grab' | 'stun' | 'return' | 'settle' | 'broken'
export interface Vm36State extends VendMachineState {
  mode: Vm36Mode; modeT: number; hitDone: boolean; armOut: boolean
  homeX: number; homeY: number; homeFacing: number // homeX/Y 是世界坐标（减去 map.inf.ox/oy 才是本地坐标）
  restockT: number; loseT: number; resistMsgT: number; opened: boolean
}
export interface VendRunState {
  addict: number; victim: boolean; farT: number; wipeT: number
  structs: Map<Structure, VendMachineState> // 普通机运行时状态（只在内存；卡死写进 s.data.jammed 随存档）
}
export const freshVendRun = (): VendRunState => ({ addict: 0, victim: false, farT: VM.FAR_MSG, wipeT: VM.WIPE_T, structs: new Map() })
/** 交互界面当前对着的机器 */
export type VendTarget = { s: Structure; e?: undefined } | { e: Entity; s?: undefined }

// ---------------------------------------------------------------- 状态

function freshMachine(variant: VendingVariant, seed: number): VendMachineState {
  const lay = vendingLayout(variant, seed)
  return {
    variant, brand: lay.brand, products: lay.products, stock: [...lay.stock], max: [...lay.stock], input: '', flash: '', flashT: 0,
    anim: null, bin: null, jamSlot: -1, jammed: false, credit: 0, kickCd: 0, cry: '', cryT: 0,
  }
}
export function structMachine(eng: Engine, s: Structure): VendMachineState {
  const run = eng.vendRun
  let st = run.structs.get(s)
  if (!st) {
    st = freshMachine('normal', vendingSeedOfStruct(s, eng.map?.inf?.ox, eng.map?.inf?.oy))
    if (s.data?.jammed) { st.jammed = true; st.jamSlot = typeof s.data.jamSlot === 'number' ? s.data.jamSlot : -1 }
    run.structs.set(s, st)
  }
  return st
}
export function vm36(e: Entity, eng?: Engine): Vm36State {
  if (!e.vm) {
    const ox = eng?.map?.inf?.ox ?? 0, oy = eng?.map?.inf?.oy ?? 0 // 原位按世界坐标记（无限层会平移原点）
    const base = freshMachine('e36', vendingSeedOfEntity(e.id))
    e.vm = { ...base, mode: e.def.type === 'vmad' ? 'chase' : 'dormant', modeT: 0, hitDone: false, armOut: false, homeX: e.x + ox, homeY: e.y + oy, homeFacing: e.facing,
      restockT: VM.E36_RESTOCK * (0.4 + Math.random() * 0.6), loseT: 0, resistMsgT: 0, opened: false }
  }
  return e.vm
}
export const isVm36 = (e: Entity) => e.def.type === 'vendingmachine' || e.def.type === 'vmad'
const machineOf = (eng: Engine, t: VendTarget): VendMachineState => (t.s ? structMachine(eng, t.s) : vm36(t.e!, eng))
const isTapeMachine = (t: VendTarget) => !!t.s && !t.s.data?.trade

function setMode(eng: Engine, e: Entity, v: Vm36State, mode: Vm36Mode) {
  v.mode = mode; v.modeT = 0; v.hitDone = false
  const mad = mode !== 'dormant' && mode !== 'broken'
  const want = mad ? ENTITIES.vmad : ENTITIES.vendingmachine
  if (e.def !== want) { e.def = want; if (e.hp > want.hp) e.hp = want.hp }
  e.state = mode === 'chase' || mode === 'return' ? 'chase' : mode === 'chop' || mode === 'grab' || mode === 'open' ? 'attack' : 'idle'
  if (mad && eng.vendUi?.e === e) closeVending(eng)
}

// ---------------------------------------------------------------- 交互界面（UI 调用）

export function openVending(eng: Engine, t: VendTarget) {
  const st = machineOf(eng, t)
  st.input = ''
  eng.vendUi = t
  const p = eng.player, x = t.s ? t.s.x + t.s.w / 2 : t.e!.x, y = t.s ? t.s.y + t.s.h / 2 : t.e!.y
  p.facing = Math.atan2(y - p.y, x - p.x); look.yaw = -p.facing - Math.PI / 2 // 镜头转向机器正面
  eng.input.mx = 0; eng.input.my = 0; eng.input.attack = false; eng.input.attackHeld = false
  eng.input.jump = false; eng.input.sprint = false; eng.inspectHeld = false; eng.specialHeld = false
  if (t.e) recordEntityEncounter(t.e)
  audio.uiTick()
  eng.emit({ kind: 'vending' })
}
export function closeVending(eng: Engine) { eng.vendUi = null }

export interface VendView {
  variant: VendingVariant; brand: VendingBrand; title: string; sub: string; ink: string; accent: string; body: string; face: string
  slots: { code: string; product: VendingProduct; name: string; blurb: string; stock: number; selected: boolean }[]
  display: string; busy: boolean; bin: { name: string } | null; jammed: boolean; jamName: string
  tape: boolean; credit: number; tapes: number; cry: string; broken: boolean; gone: boolean
}
export function vendingView(eng: Engine): VendView | null {
  const t = eng.vendUi
  if (!t) return null
  const st = machineOf(eng, t)
  const B = BRAND_LABEL[st.brand]
  const broken = !!t.e && vm36(t.e).mode === 'broken'
  const display = broken ? '' : st.flashT > 0 ? st.flash : st.jammed && !st.anim ? 'Err' : st.input || (st.anim ? '----' : '--')
  return {
    variant: st.variant, brand: st.brand, title: B.title, sub: B.sub, ink: B.ink, accent: B.accent, body: B.body, face: B.face,
    slots: st.products.map((product, i) => ({ code: SLOT_CODES[i], product, name: PRODUCT_NAME[product], blurb: PRODUCT_BLURB[product], stock: st.stock[i], selected: st.input === SLOT_CODES[i] || st.anim?.slot === i })),
    display, busy: !!st.anim, bin: st.bin ? { name: PRODUCT_NAME[st.bin.product] } : null,
    jammed: st.jammed, jamName: st.jamSlot >= 0 ? PRODUCT_NAME[st.products[st.jamSlot]] : st.jammed ? '一瓶看不清标签的饮料' : '',
    tape: isTapeMachine(t), credit: st.credit, tapes: eng.player.tapes, cry: st.cryT > 0 ? st.cry : '', broken, gone: !vendTargetValid(eng, t),
  }
}
function flash(st: VendMachineState, text: string, t = 1.2) { st.flash = text; st.flashT = t }

/** 按键：'A' | 'B' | '1'–'4' | 'C'（清除） */
export function vendingPress(eng: Engine, key: string) {
  const t = eng.vendUi; if (!t) return
  const st = machineOf(eng, t)
  if (t.e && vm36(t.e).mode === 'broken') return
  audio.uiTick()
  if (st.anim) return
  if (key === 'C') { st.input = ''; return }
  if (key === 'A' || key === 'B') { st.input = key; return }
  if (!/^[1-4]$/.test(key)) return
  if (st.input !== 'A' && st.input !== 'B') { flash(st, 'A-B?', 0.8); return }
  const code = st.input + key
  st.input = code
  const slot = SLOT_CODES.indexOf(code as typeof SLOT_CODES[number])
  vendSlot(eng, t, st, slot)
}

function vendSlot(eng: Engine, t: VendTarget, st: VendMachineState, slot: number) {
  if (st.jammed) { flash(st, 'Err'); st.input = ''; eng.msg('数码屏闪了两下「Err」。机器里有什么东西卡着，它不肯再出货了。', 'system'); return }
  if (st.bin) { flash(st, 'TAKE'); st.input = ''; eng.msg('取货口里还有东西没拿走。', 'system'); return }
  if (st.stock[slot] <= 0) { flash(st, 'SOLD'); st.input = ''; return }
  if (isTapeMachine(t)) {
    if (st.credit <= 0) { flash(st, 'TAPE'); st.input = ''; eng.msg('售货机上贴着字条：「只收磁带」。', 'system'); return }
    st.credit--
  }
  st.stock[slot]--
  if (t.s && Math.random() < VM.JAM_P) {
    // 卡货：这一件不会掉下来，之后整台机器罢工
    st.anim = { clip: 'jam', slot, t: 0 }
    st.jammed = true; st.jamSlot = slot
    t.s.data = { ...t.s.data, jammed: 1, jamSlot: slot }
    eng.msg('螺旋线转到一半卡住了——那件货斜挂在格口，变成一种很低的、不情愿的嗡嗡声。', 'system')
    return
  }
  st.anim = { clip: t.s ? 'coil' : 'hand', slot, t: 0 }
  if (t.e) {
    eng.msg('格子里没有螺旋线。一只白骨化的人手从背板后伸出来，把它往前推了下去。', 'lore')
    cry(eng, st, true)
  }
}

/** 从取货口拿货 */
export function vendingTake(eng: Engine) {
  const t = eng.vendUi; if (!t) return
  const st = machineOf(eng, t)
  if (!st.bin) return
  const prod = st.bin.product
  const item = st.variant === 'e36' ? 'manmade' : prod
  if (!eng.addItem(item)) { eng.msg('背包已满，取不走。', 'system'); return }
  st.bin = null
  audio.pickup()
  if (st.variant === 'e36') eng.msg(`你从取货口里拿出了「${PRODUCT_NAME[prod]}」——糖果纸包着，甜得发腻的气味。（获得 人制品 ×1）`, 'lore')
  else eng.msg(`你从取货口拿出一份${PRODUCT_NAME[prod]}。`, 'loot')
}

/** 拍打卡住的普通机 */
export function vendingKick(eng: Engine) {
  const t = eng.vendUi; if (!t?.s) return
  const st = structMachine(eng, t.s)
  if (!st.jammed || st.kickCd > 0 || st.anim) return
  st.kickCd = VM.KICK_CD
  audio.clang(true); eng.camShake = Math.min(1, eng.camShake + 0.12); eng.noiseEvent(eng.player.x, eng.player.y, 7, false)
  const stuck = st.jamSlot >= 0 || !t.s.data?.jamFreed
  if (!stuck) { eng.msg('机器晃了晃，什么也没掉下来。它是真的坏了。', 'system'); return }
  if (Math.random() >= VM.KICK_P) { eng.msg('你拍了一下机身。卡住的那件晃了晃，没掉。', 'system'); return }
  if (st.jamSlot >= 0) {
    const slot = st.jamSlot
    st.jamSlot = -1
    st.anim = { clip: 'coil', slot, t: 0.8 } // 从格口掉下去那一段
    t.s.data = { ...t.s.data, jamSlot: -1, jamFreed: 1 }
    st.stock[slot] = Math.max(0, st.stock[slot]) // 这件已经扣过库存
    st.pendingDrop = st.products[slot]
  } else {
    // 生成时就卡着的旧机器：那件看不清标签的货掉进取货口
    t.s.data = { ...t.s.data, jamFreed: 1 }
    st.bin = { slot: 5, product: Math.random() < 0.5 ? 'almond' : 'coffee' }
  }
  audio.clang(false)
  eng.msg('「哐」——卡住的那件终于掉进了取货口。机器本身还是罢工。', 'loot')
}

export function vendingInsertTape(eng: Engine) {
  const t = eng.vendUi; if (!t?.s || !isTapeMachine(t)) return
  const st = structMachine(eng, t.s)
  if (eng.player.tapes <= 0 || !eng.consumeItem('tape')) { eng.msg('你身上没有磁带。', 'system'); return }
  eng.player.tapes--
  st.credit += VM.TAPE_CREDIT
  audio.uiTick()
  eng.msg(`售货机吞下一盘磁带。数码屏亮起「${st.credit}」。`, 'lore')
}

function vendTargetValid(eng: Engine, t: VendTarget): boolean {
  const p = eng.player
  if (t.s) return eng.map?.structures.includes(t.s) === true && Math.hypot(t.s.x + t.s.w / 2 - p.x, t.s.y + t.s.h / 2 - p.y) <= VM.USE_R + 0.6
  const e = t.e!
  return !e.dead && (e.vm?.mode ?? 'dormant') === 'dormant' && Math.hypot(e.x - p.x, e.y - p.y) <= VM.USE_R && eng.map?.entities.includes(e) === true
}

// ---------------------------------------------------------------- 每帧（engine.step）

const CRY_LINES = ['……妈妈？', '机器深处，有个孩子在很小声地哭。', '是谁在哭？——听起来像你认识的人。', '「回家吧……」', '哭声隔着玻璃，忽远忽近。']
function cry(_eng: Engine, st: VendMachineState, near: boolean) {
  st.cry = CRY_LINES[Math.floor(Math.random() * CRY_LINES.length)]; st.cryT = 4
  audio.facelingCry(near ? 0.35 : 0.2)
}

export function tickVendMachine(_eng: Engine, st: VendMachineState, dt: number) {
  if (st.flashT > 0) { st.flashT -= dt; if (st.flashT <= 0) st.input = '' }
  if (st.cryT > 0) st.cryT -= dt
  if (st.kickCd > 0) st.kickCd -= dt
  const a = st.anim
  if (!a) return
  const before = a.t
  a.t += dt
  const binAt = a.clip === 'coil' ? VM.BIN_AT_COIL : a.clip === 'hand' ? VM.BIN_AT_HAND : -1
  if (binAt > 0 && before < binAt && a.t >= binAt) {
    const prod = st.pendingDrop ?? st.products[a.slot]
    st.pendingDrop = undefined
    st.bin = { slot: a.slot, product: prod }
    audio.clang(true)
  }
  const dur = a.clip === 'coil' ? VM.COIL_T : a.clip === 'hand' ? VM.HAND_T : a.clip === 'jam' ? VM.JAM_T : VM.RESTOCK_T
  if (a.t >= dur) { st.anim = null; if (st.flashT <= 0) st.input = '' }
}

/** engine.step：普通机的片段 / 成瘾 / 界面有效性（Entity 36 本体在 entityAI 主循环里走 updateVm36） */
export function stepVending(eng: Engine, dt: number) {
  for (const st of eng.vendRun.structs.values()) tickVendMachine(eng, st, dt)
  if (eng.vendUi && !vendTargetValid(eng, eng.vendUi)) closeVending(eng)
  stepAddiction(eng, dt)
}

// ---------------------------------------------------------------- 成瘾

/** inventory：吃下一份人制品 */
export function vendingAte(eng: Engine) {
  const r = eng.vendRun
  const was = r.addict
  r.addict = Math.min(VM.VICTIM, r.addict + VM.ADDICT_EAT)
  if (was < VM.T1 && r.addict >= VM.T1) eng.msg('你开始惦记那台售货机了。离它远一点，心里就空一点。', 'damage')
  if (was < VM.T2 && r.addict >= VM.T2) eng.msg('别的食物闻起来都像纸板。你只想要它卖的东西。', 'damage')
  if (!r.victim && r.addict >= VM.VICTIM) {
    r.victim = true; r.wipeT = VM.WIPE_T
    eng.msg('你已经离不开它了。它知道——它不会再对你动手。', 'damage')
    eng.emit({ kind: 'sanityhit' })
  }
}
/** inventory：成瘾 ≥50 时拒食其他食物的概率 */
export function vendingRefuseFood(eng: Engine): boolean {
  const a = eng.vendRun.addict
  if (a < VM.T2) return false
  return Math.random() < (a - VM.REFUSE_BASE) / 100
}
function nearestVm36(eng: Engine): number {
  let best = Infinity
  const p = eng.player
  for (const e of eng.map?.entities ?? []) if (!e.dead && isVm36(e) && e.vm?.mode !== 'broken') best = Math.min(best, Math.hypot(e.x - p.x, e.y - p.y))
  return best
}
function stepAddiction(eng: Engine, dt: number) {
  const r = eng.vendRun
  if (r.addict <= 0) return
  if (eng.manmadeT <= 0) r.addict = Math.max(0, r.addict - VM.ADDICT_DECAY * dt)
  if (r.victim && r.addict < VM.VICTIM_LOSE) { r.victim = false; eng.msg('那台售货机在你脑子里的位置，终于淡了一些。', 'system') }
  if (r.addict >= VM.T1) {
    const tier = r.addict >= VM.VICTIM ? 3 : r.addict >= VM.T2 ? 2 : 1
    if (nearestVm36(eng) > VM.FAR_R) {
      eng.player.sanity = Math.max(0, eng.player.sanity - VM.FAR_SAN * tier * dt)
      r.farT -= dt
      if (r.farT <= 0) { r.farT = VM.FAR_MSG; eng.msg(['你一直在想那台售货机。', '你的手在发抖。那里还有货吗？', '你记得它的灯光，红的、绿的。'][Math.floor(Math.random() * 3)], 'system') }
    }
  }
  if (r.victim) {
    r.wipeT -= dt
    if (r.wipeT <= 0) {
      r.wipeT = VM.WIPE_T
      eng.explored.fill(0)
      eng.map?.inf?.explored?.clear()
      eng.msg('你想不起来自己是怎么走到这里的。周围的一切都很陌生——只有那台售货机的样子还清清楚楚。（地图记忆被抹掉了）', 'damage')
    }
  }
}

// ---------------------------------------------------------------- 伤害（combat 调用）

/** 近战命中：几乎打不动；受害者打它不会被追 */
export function vm36Struck(eng: Engine, e: Entity, dmg: number) {
  const v = vm36(e, eng)
  if (v.mode === 'broken') { eng.msg('它已经不动了。', 'system'); return }
  e.hp -= dmg * VM.RESIST
  audio.clang(true)
  if (v.resistMsgT <= 0) { v.resistMsgT = 6; eng.msg('打在外壳上只留下一道浅痕——像在砸一台保险柜。（伤害 ×0.12）', 'system') }
  provoke(eng, e, v)
  vm36KillGuard(eng, e)
}
/** 瓶装闪电：重创 + 电晕 */
export function vm36Shocked(eng: Engine, e: Entity) {
  const v = vm36(e, eng)
  if (v.mode === 'broken') return
  e.hp -= VM.SHOCK_DMG
  if (vm36KillGuard(eng, e)) return
  if (v.mode === 'dormant') provoke(eng, e, v)
  setMode(eng, e, v, 'stun')
  audio.spark()
  eng.msg('电弧爬满了整台机器——灯箱爆闪，骷髅臂抽搐着瘫了下去。（电晕 8 秒）', 'damage')
}
function provoke(eng: Engine, e: Entity, v: Vm36State) {
  if (eng.vendRun.victim) {
    if (v.mode === 'dormant') eng.msg('机器只是轻轻颤了一下。它不和你计较——你是它的人。', 'lore')
    return
  }
  if (v.mode !== 'dormant') return
  setMode(eng, e, v, 'emerge')
  audio.aggro(); audio.scrape(0.8)
  eng.camShake = Math.min(1, eng.camShake + 0.35)
  eng.msg('底部的暗门「咔」地弹开——两条涂着金属漆的骷髅臂撑住地面，把整台售货机托了起来。', 'damage')
}
/** 血量见底：瘫在原地（不算击杀），之后可以撬开后部暗格 */
export function vm36KillGuard(eng: Engine, e: Entity): boolean {
  if (!isVm36(e)) return false
  const v = vm36(e, eng)
  if (e.hp > 0) return v.mode === 'broken'
  e.hp = 1
  if (v.mode !== 'broken') {
    setMode(eng, e, v, 'broken')
    v.stock.fill(0)
    audio.clang(false)
    eng.msg('人制品售货机重重地砸在地上，灯箱熄灭了。骷髅臂缩回暗门里，再也没有伸出来。', 'loot')
  }
  return true
}

// ---------------------------------------------------------------- 后部暗格

export function vm36OpenBack(eng: Engine, e: Entity) {
  const v = vm36(e, eng)
  if (v.mode !== 'broken') return
  if (!v.opened) {
    v.opened = true
    eng.player.sanity = Math.max(0, eng.player.sanity - VM.OPEN_SAN)
    audio.whisper(0.8)
    eng.emit({ kind: 'sanityhit' })
    eng.msg('你撬开后部的暗格。里面挤着三具没有手臂的尸体，短腿蜷着，额头上写着名字：亨利·艾里克、史蒂文·艾里克、马文·艾里克。它们的下颌一张一合——在低声说话。', 'lore')
    return
  }
  audio.whisper(0.5)
  eng.msg(WHISPERS[Math.floor(Math.random() * WHISPERS.length)], 'lore')
}
const WHISPERS = ['「……它于人人……」', '「人人为它……」', '「……亚利桑那，二〇一九……」', '「别吃……别吃……别……」', '低语声和售货机的嗡嗡声叠在一起，分不清是谁在说。']

// ---------------------------------------------------------------- Entity 36 本体（entityAI 主循环，接管全部移动）

export function updateVm36(eng: Engine, e: Entity, dt: number, d: number) {
  const v = vm36(e, eng), p = eng.player
  const hx = v.homeX - (eng.map?.inf?.ox ?? 0), hy = v.homeY - (eng.map?.inf?.oy ?? 0)
  tickVendMachine(eng, v, dt)
  v.modeT += dt
  if (v.resistMsgT > 0) v.resistMsgT -= dt
  e.stunT = 0
  const sees = d < 30 && los(eng, e.x, e.y, p.x, p.y)
  if (!e.encountered && sees && d < 8) recordEntityEncounter(e)
  switch (v.mode) {
    case 'dormant': {
      e.x = hx; e.y = hy; e.facing = v.homeFacing
      v.restockT -= dt
      if (v.restockT <= 0 && !v.anim) {
        v.restockT = VM.E36_RESTOCK
        if (v.stock.some((n, i) => n < v.max[i])) {
          v.stock = [...v.max]
          v.anim = { clip: 'restock', slot: 0, t: 0 }
          if (d < VM.CRY_R) {
            cry(eng, v, d < 4)
            p.sanity = Math.max(0, p.sanity - VM.CRY_SAN)
            eng.msg('整台机器猛地一颤，空格子在一瞬间全满了。玻璃后面传来很轻的哭声。', 'lore')
          }
        }
      }
      return
    }
    case 'broken': e.x = hx; e.y = hy; return
    case 'emerge': if (v.modeT >= VM.EMERGE_T) setMode(eng, e, v, 'chase'); faceToward(eng, e, p.x, p.y, dt, 2); return
    case 'settle': {
      e.x = hx; e.y = hy; faceToward(eng, e, e.x + Math.cos(v.homeFacing), e.y + Math.sin(v.homeFacing), dt, 4)
      if (v.modeT >= VM.SETTLE_T) { e.facing = v.homeFacing; v.armOut = false; setMode(eng, e, v, 'dormant') }
      return
    }
    case 'stun': if (v.modeT >= VM.SHOCK_STUN) setMode(eng, e, v, eng.vendRun.victim ? 'return' : 'chase'); return
    case 'chase': {
      if (eng.vendRun.victim || eng.dev.invisible) { setMode(eng, e, v, 'return'); return }
      v.loseT = sees ? 0 : v.loseT + dt
      if (d > VM.LOSE_R || v.loseT > VM.LOSE_T) { setMode(eng, e, v, 'return'); eng.msg('骷髅臂刮擦地面的声音远去了——它爬回了原来的位置。', 'system'); return }
      faceToward(eng, e, p.x, p.y, dt, 2.5)
      const zOk = Math.abs(e.z - p.z) < 1.2
      if (zOk && sees && e.attackCd <= 0) {
        if (d < VM.GRAB_R) { setMode(eng, e, v, 'grab'); return }
        if (d < VM.CHOP_R) { setMode(eng, e, v, v.armOut ? 'chop' : 'open'); return }
      }
      e.targetX = p.x; e.targetY = p.y
      if (d > 0.9) stepEntity(eng, e, VM.SPEED, dt)
      e.animT += dt
      return
    }
    case 'open': {
      faceToward(eng, e, p.x, p.y, dt, 3)
      if (v.modeT >= VM.OPEN_T) { v.armOut = true; setMode(eng, e, v, 'chop') }
      return
    }
    case 'chop': case 'grab': {
      faceToward(eng, e, p.x, p.y, dt, v.mode === 'chop' ? 3 : 5)
      const hitAt = v.mode === 'chop' ? VM.CHOP_HIT_AT : VM.GRAB_HIT_AT
      if (!v.hitDone && v.modeT >= hitAt) {
        v.hitDone = true
        const reach = v.mode === 'chop' ? VM.CHOP_REACH : VM.GRAB_R + 0.35
        if (d < reach && Math.abs(e.z - p.z) < 1.2 && !eng.vendRun.victim) {
          if (v.mode === 'chop') { eng.hurtPlayer(VM.CHOP_DMG, e.def.name); eng.camShake = Math.min(1, eng.camShake + 0.45); eng.msg('巨大的骷髅臂从机顶劈下来，砸在你身上！', 'damage') }
          else { eng.hurtPlayer(VM.GRAB_DMG, e.def.name); p.slowT = Math.max(p.slowT ?? 0, VM.GRAB_SLOW); eng.msg('一只白骨手攥住了你的脚踝——你挣开了，但腿发软。', 'damage') }
        } else audio.clang(false)
      }
      if (v.modeT >= (v.mode === 'chop' ? VM.CHOP_T : VM.GRAB_T)) { e.attackCd = VM.ATTACK_CD; setMode(eng, e, v, 'chase') }
      return
    }
    case 'return': {
      const dh = Math.hypot(hx - e.x, hy - e.y)
      if (dh < 0.35) { e.x = hx; e.y = hy; setMode(eng, e, v, 'settle'); return }
      if (!eng.vendRun.victim && sees && d < 8 && v.loseT === 0 && e.hp < e.def.hp * 0.999 && !eng.dev.invisible && v.modeT > 3) { setMode(eng, e, v, 'chase'); return }
      e.targetX = hx; e.targetY = hy
      faceToward(eng, e, hx, hy, dt, 2.5)
      if (!stepEntity(eng, e, VM.RETURN_SPEED, dt) && v.modeT > 40) { e.x = hx; e.y = hy } // 卡住太久：直接归位
      e.animT += dt
      return
    }
  }
}

// ---------------------------------------------------------------- 渲染层读取

export interface VendRenderState {
  clip: 'idle' | 'coil' | 'jam' | 'hand' | 'restock' | 'stand' | 'crawl' | 'open' | 'chop' | 'grab' | 'stun' | 'whisper'
  t: number; slot: number; standing: boolean
  stock: number[]; bin: { slot: number } | null; jamSlot: number; jamFreed: boolean; dark: boolean
}
const CLIP_DUR: Record<string, number> = { coil: VM.COIL_T, hand: VM.HAND_T, jam: VM.JAM_T, restock: VM.RESTOCK_T }
function machineRender(st: VendMachineState, time: number): Omit<VendRenderState, 'standing' | 'jamFreed' | 'dark'> {
  if (st.anim) return { clip: st.anim.clip, t: st.anim.t, slot: st.anim.slot, stock: st.stock, bin: st.bin, jamSlot: st.jamSlot }
  // 取货口里还躺着货：停在出货片段的最后一帧
  if (st.bin && st.bin.slot >= 0 && st.stock[st.bin.slot] !== undefined) {
    const clip = st.variant === 'e36' ? 'hand' : 'coil'
    return { clip, t: CLIP_DUR[clip], slot: st.bin.slot, stock: st.stock, bin: st.bin, jamSlot: st.jamSlot }
  }
  if (st.jamSlot >= 0) return { clip: 'jam', t: VM.JAM_T, slot: st.jamSlot, stock: st.stock, bin: null, jamSlot: st.jamSlot }
  return { clip: 'idle', t: time, slot: 0, stock: st.stock, bin: null, jamSlot: -1 }
}
export function vendStructRender(eng: Engine, s: Structure, time: number): VendRenderState | null {
  const st = eng.vendRun.structs.get(s)
  if (!st) return null
  return { ...machineRender(st, time), standing: false, jamFreed: !!s.data?.jamFreed, dark: false }
}
export function vm36Render(e: Entity, time: number): VendRenderState {
  const v = vm36(e)
  const base = { stock: v.stock, bin: v.bin, jamSlot: -1, jamFreed: false, dark: false }
  switch (v.mode) {
    case 'dormant': return { ...machineRender(v, time), standing: false, jamFreed: false, dark: false }
    case 'broken': return { ...base, clip: v.opened ? 'whisper' : 'idle', t: v.opened ? time : 0, slot: 0, standing: false, dark: true }
    case 'emerge': return { ...base, clip: 'stand', t: v.modeT, slot: 0, standing: false }
    case 'settle': return { ...base, clip: 'stand', t: Math.max(0, VM.SETTLE_T - v.modeT), slot: 0, standing: false }
    case 'chase': case 'return': return { ...base, clip: 'crawl', t: e.animT, slot: 0, standing: true }
    case 'open': return { ...base, clip: 'open', t: v.modeT, slot: 0, standing: true }
    case 'chop': return { ...base, clip: 'chop', t: v.modeT, slot: 0, standing: true }
    case 'grab': return { ...base, clip: 'grab', t: v.modeT, slot: 0, standing: true }
    case 'stun': return { ...base, clip: 'stun', t: Math.min(v.modeT, 2.2), slot: 0, standing: true }
  }
}
export const VENDING_PRODUCT_LABEL = (p: VendingProduct) => PRODUCT_NAME[p]
export { VENDING_E36_STOCK }
