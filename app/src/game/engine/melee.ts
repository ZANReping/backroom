// 近战武器重制 阶段 3：按住蓄力 / 三段式挥砍（前摇后才判定）/ 卡帧 / 打墙弹刀 / 单件耐久 / 残件 / 修理。
// 数值表见 content/melee.ts；动画见 renderer/meleeAnim.ts（两者时间表由 check:melee 对齐）。
import type { Engine, InvSlot } from '../engine'
import { ITEMS } from '../content/items'
import {
  MELEE, isMelee, type MeleeKind, HEAVY_MIN_CHARGE, heavyDamageMul, HEAVY_STAMINA_MUL, CHARGE_DELAY,
  DUR_HIT, DUR_HEAVY_HIT, DUR_WALL, REPAIR_MATERIALS, REPAIR_TO, REPAIR_TIME, LOW_DUR,
} from '../content/melee'
import { audio } from '../core/audio'

export interface MeleePending { t: number; kind: MeleeKind; heavy: boolean; charge: number; slot: InvSlot }

/** Legacy timber stacks become independent weapons, preserving quantity and appearance. */
export function normalizeMeleeInventory(eng:Engine){
  const p=eng.player,extras:InvSlot[]=[]
  for(const a of [p.hotbar,p.backpack])for(const s of a)if(s&&isMelee(s.type)&&s.count>1){const n=Math.min(100,Math.floor(s.count));s.count=1;for(let i=1;i<n;i++)extras.push({...s,count:1})}
  for(const s of extras){const hot=p.hotbar.indexOf(null),bag=p.backpack.indexOf(null);if(hot>=0)p.hotbar[hot]=s;else if(bag>=0)p.backpack[bag]=s;else p.backpack.push(s)}
}

// ---------- 单件耐久 ----------
/** 旧存档 / 新刷出的武器没有 dur 字段 = 满耐久 */
export function slotDur(s: InvSlot): number { return isMelee(s.type) ? (s.dur ?? MELEE[s.type].maxDur) : 0 }
export function slotMaxDur(s: InvSlot): number { return isMelee(s.type) ? MELEE[s.type].maxDur : 0 }
export function isBroken(s: InvSlot | null | undefined): boolean { return !!s && isMelee(s.type) && s.dur === 0 }
/** 带残件后缀的物品名（HUD / 背包 / 提示共用） */
export function slotName(s: InvSlot): string {
  const n = ITEMS[s.type]?.name ?? s.type
  return isBroken(s) ? `${n}（残件）` : n
}
/** 扣耐久；归零 → 残件（不消失）。返回是否刚刚断掉 */
export function wearSlot(eng: Engine, s: InvSlot, n: number): boolean {
  if (!isMelee(s.type) || isBroken(s) || eng.dev.oneHit) return false
  const max = MELEE[s.type].maxDur, before = slotDur(s)
  s.dur = Math.max(0, before - n)
  const name = ITEMS[s.type].name
  if (s.dur === 0) {
    audio.clang(s.type !== 'timber', true)
    eng.camShake = Math.min(1, eng.camShake + .3)
    eng.msg(BREAK_MSG[s.type] ?? `${name}坏了。`, 'damage')
    return true
  }
  if (before > max * LOW_DUR && s.dur <= max * LOW_DUR) eng.msg(`${name}上的裂纹越来越多了。（耐久 ${s.dur}/${max}，用钉子或尼龙绳修理）`, 'system')
  return false
}
const BREAK_MSG: Partial<Record<MeleeKind, string>> = {
  knife: '刀刃「啪」地断掉了一截——只剩半把刀。（残件：伤害、距离下降，可修理）',
  crowbar: '撬棍弯了，一边羊角崩掉了。（残件：伤害下降，可修理）',
  wrench: '管钳的活动钳口松脱了。（残件：伤害下降，可修理）',
  timber: '木板从中间裂开，只剩半截。（残件：伤害、距离大幅下降，可修理）',
  axe: '斧柄「咔」地裂开，斧刃也崩了口。（残件：不能劈门，伤害大降，可修理）',
}

/** 手持近战武器（枪糖生效时右手是枪，不算） */
export function heldMelee(eng: Engine): InvSlot | null {
  const s = eng.player.hotbar[eng.player.selected]
  return s && isMelee(s.type) && eng.gunCandyT <= 0 ? s : null
}
export function meleeReachOf(s: InvSlot): number {
  const st = MELEE[s.type as MeleeKind]
  return isBroken(s) ? st.brokenReach : st.reach
}

// ---------- 输入：短按 = 普攻；按住 0.2s 起蓄力，松开放重击 ----------
export function updateMeleeInput(eng: Engine, dt: number, locked: boolean) {
  const held = heldMelee(eng)
  if(locked||eng.handsStowed||eng.usingItem){eng.meleePending=null;eng.meleePress=null;eng.meleeCharge=0;return}
  eng.meleeReach = held ? meleeReachOf(held) : 0
  // 卡帧 / 弹刀回震 / 待结算判定
  if (eng.meleeBounce > 0) eng.meleeBounce = Math.max(0, eng.meleeBounce - dt / .4)
  const pend = eng.meleePending
  if (pend && eng.hitStopT <= 0) {
    pend.t -= dt
    if (pend.t <= 0) {
      eng.meleePending = null
      // 判定前换了武器 / 收起了手：这一下落空
      if (heldMelee(eng) === pend.slot && !eng.handsStowed) resolveMelee(eng, pend)
    }
  }
  const press = eng.meleePress
  if (!press) { eng.meleeCharge = 0; return }
  if (!held || locked || eng.usingItem || eng.handsStowed || held !== press.slot) { eng.meleePress = null; eng.meleeCharge = 0; return }
  press.t += dt
  const st = MELEE[held.type as MeleeKind]
  const ready = eng.dev.noAttackCooldown || eng.attackCooldownT <= 0
  if (eng.input.attackHeld && press.t >= CHARGE_DELAY) {
    if (!ready) { press.t = CHARGE_DELAY; return } // 上一下还没收招：等收完再开始蓄
    const cost = (ITEMS[held.type].attackStamina ?? 8) * HEAVY_STAMINA_MUL
    if (eng.player.stamina < cost) {
      if (eng.statusMsgT.stamina <= 0) { eng.msg('体力不够蓄力重击了。（松开键普攻）', 'system'); eng.statusMsgT.stamina = 2.5 }
      eng.meleeCharge = 0
      return
    }
    eng.meleeCharge = Math.min(1, (press.t - CHARGE_DELAY) / st.chargeTime)
    return
  }
  if (eng.input.attackHeld) return // 还没到蓄力门槛，继续等
  // 松开
  const charge = eng.meleeCharge
  eng.meleePress = null; eng.meleeCharge = 0
  startMeleeSwing(eng, charge >= HEAVY_MIN_CHARGE, charge)
}

/** 开始一次挥砍：扣体力、起动画、排期判定（前摇结束时结算） */
export function startMeleeSwing(eng: Engine, heavy: boolean, charge: number): boolean {
  const held = heldMelee(eng)
  if (!held || eng.handsStowed) return false
  if (!eng.dev.noAttackCooldown && eng.attackCooldownT > 0) return false
  const p = eng.player, def = ITEMS[held.type], kind = held.type as MeleeKind
  const base = def.attackStamina ?? 8
  const cost = heavy ? base * HEAVY_STAMINA_MUL : base
  if (heavy && p.stamina < cost) heavy = false
  p.stamina = Math.max(0, p.stamina - (heavy ? cost : base))
  const tm = heavy ? MELEE[kind].heavy : MELEE[kind].light
  const exhausted = p.stamina <= 0.01
  const cd = exhausted ? Math.max(3.1, tm.dur * 4.5) : tm.dur
  eng.attackCooldownDur = eng.dev.noAttackCooldown ? 0 : cd
  eng.attackCooldownT = eng.attackCooldownDur
  if (!heavy) eng.meleeSide = -eng.meleeSide // 刀：左右交替快划
  eng.meleeHeavy = heavy
  eng.attackAnimKind = 'swing'
  eng.attackAnimDur = tm.dur
  eng.attackAnimT = tm.dur
  eng.meleePending = { t: tm.windup * tm.dur, kind, heavy, charge, slot: held }
  if (exhausted && eng.statusMsgT.stamina <= 0) {
    eng.msg('体力已经耗尽——手臂沉得抬不起来，下一次攻击需要很久。', 'system')
    eng.statusMsgT.stamina = 2.5
  }
  return true
}

/** 判定窗开始：结算命中 / 弹刀 / 耐久 */
function resolveMelee(eng: Engine, pend: MeleePending) {
  const s = pend.slot, st = MELEE[pend.kind], broken = isBroken(s)
  const base = eng.dev.oneHit ? 99999 : (ITEMS[s.type].weapon ?? 8)
  const dmg = base * (pend.heavy ? heavyDamageMul(pend.charge) : 1) * (broken ? st.brokenDmg : 1)
  const r = eng.strike(dmg, {
    kind: pend.kind, heavy: pend.heavy, broken, targets: st.targets,
    stun: st.stun + (pend.heavy ? .25 : 0), backstab: broken ? undefined : st.backstab, reach: meleeReachOf(s),
  })
  if (r.hit) {
    eng.hitStopT = pend.heavy ? .11 : .06
    s.blood = Math.min(1, (s.blood ?? 0) + (pend.heavy ? .2 : .12))
    wearSlot(eng, s, pend.heavy ? DUR_HEAVY_HIT : DUR_HIT)
  } else if (r.wall) {
    // 打墙弹刀：回震 + 后半段收招提前结束，扣耐久
    eng.meleeBounce = 1
    eng.camShake = Math.min(1, eng.camShake + .22)
    eng.attackAnimT = Math.min(eng.attackAnimT, eng.attackAnimDur * .32)
    audio.clang(pend.kind !== 'timber')
    if (!wearSlot(eng, s, DUR_WALL) && eng.statusMsgT.bounce <= 0) {
      eng.msg(`${slotName(s)}砸在墙上弹了回来，震得手发麻。（耐久 -${DUR_WALL}）`, 'system')
      eng.statusMsgT.bounce = 6
    }
  }
}

// ---------- 修理 ----------
/** 右键手持近战武器：耐久低于 50%（或残件）且背包有钉子/尼龙绳 → 开始修理动作 */
export function tryRepairHeld(eng: Engine): boolean {
  const p = eng.player, s = p.hotbar[p.selected]
  if (!s || !isMelee(s.type)) return false
  const max = slotMaxDur(s), d = slotDur(s)
  const name = slotName(s)
  if (d >= max * REPAIR_TO) {
    eng.msg(`${name} 就握在你手里——左键挥砍，按住蓄力重击。（耐久 ${d}/${max}；低于一半才需要修）`, 'system')
    return false
  }
  const mat = REPAIR_MATERIALS.find((m) => eng.hasItem(m))
  if (!mat) { eng.msg(`${name}需要修理（耐久 ${d}/${max}）——找些钉子或尼龙绳来。`, 'system'); return false }
  if (eng.usingItem) return false
  eng.searching = null
  eng.usingItem = { where: 'hotbar', i: p.selected, type: s.type, tag: s.tag, t: 0, dur: REPAIR_TIME, anim: 'activate', label: '修理', repairSlot: s }
  audio.uiTick()
  return true
}
/** 修理动作完成（updateItemUse 回调） */
export function finishRepair(eng: Engine, s: InvSlot) {
  const mat = REPAIR_MATERIALS.find((m) => eng.hasItem(m))
  if (!mat || !isMelee(s.type)) { eng.msg('修理材料不见了。', 'system'); return }
  eng.consumeItem(mat)
  const max = slotMaxDur(s), wasBroken = isBroken(s)
  s.dur = Math.max(slotDur(s), Math.ceil(max * REPAIR_TO))
  audio.pickup()
  const how = mat === 'nails' ? '用钉子加固' : '用尼龙绳缠紧'
  eng.msg(`${how}了${ITEMS[s.type].name}${wasBroken ? '——勉强又能用了' : ''}。（耐久 ${s.dur}/${max}）`, 'loot')
}

/** 能劈门的斧头（优先手里那把；残件不行） */
export function usableAxe(eng: Engine): InvSlot | null {
  const p = eng.player, sel = p.hotbar[p.selected]
  if (sel?.type === 'axe' && !isBroken(sel)) return sel
  for (const s of [...p.hotbar, ...p.backpack]) if (s?.type === 'axe' && !isBroken(s)) return s
  return null
}
