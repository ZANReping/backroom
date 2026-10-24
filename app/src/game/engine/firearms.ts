// 枪械系统（鎏金兵械库特许店，阶段 1）：击发 / 散布 / 弹道判定 / 折枪装填 / 弹种切换 / 爆团弹体内起爆 / 据点禁枪。
// 数值表：content/firearms.ts；动画：renderer/firearmAnim.ts（时间表共用 GUNS[*].reload，check:firearms 校验）。
//
// 状态拆分：
//   · 枪身状态跟着「那一把枪」走：InvSlot.mag（每管：弹种 / 'spent' 空壳 / '' 空膛）+ InvSlot.ammoSel（选定弹种），
//     存档、丢在地上再捡起都保留；
//   · 动作状态（正在折枪、装第几发、贴腮程度、后坐）是玩家的，放在 eng.gun（GunRun），换手 / 收枪即中断。
// 本轮仅接入单人流程；联机入口保持封闭，未改协议。
import type { Engine, InvSlot } from '../engine'
import type { Entity } from '../entities'
import { recordEntityEncounter } from '../entities'
import { GUNS, AMMO, CLUMPBURST, FIRE_ORDER, SMALL_TARGETS, MUZZLE_STAGES, MUZZLE_STAGE_LABEL, falloff, isGun, isAmmo, type GunDef, type GunType, type AmmoType, type Chamber, type MuzzleStage } from '../content/firearms'
import { ITEMS } from '../content/items'
import { OUTPOSTS } from '../content/outposts'
import { tradersGunLane } from '../content/tradersShops'
import { tradersContains } from '../content/tradersLayout'
import { FACTIONS, REP_TIER } from '../content/factions'
import { bandOfZ, bandOfPlayerZ, groundHeightAt, wallAt, structBlocksSight } from '../world/mapgen'
import { look } from '../core/renderer3d'
import { audio } from '../core/audio'
import { crosshairDirection, mpHurtEntity, bloodKind } from './combat'
import { seatedEyeHeight, seatedEyeOffset } from './seating'
import { blockUnderwaterGun } from './swim'
import { jerryHurt, jerryInputLock } from './jerryAI'
import { nguithrInputLock } from './nguithrAI'
import { armsInputLock } from './armsAI'
import { nwInvulnerable } from './watchAI'
import { isWrangler, initWrangler } from './wranglerAI'
import { bursterMelee } from './bursterAI'
import { tinyStruck } from './tinyAI'
import { thingStruck } from './thingAI'
import { partygoerAimPart, partygoerDamage } from './partygoerAI'
import { skinStealerHit } from './skinStealerAI'
import { isVm36, vm36Struck } from './vendingAI'
import { facelingAgeOf } from './facelingAI'
import { FACELING_AGE_HEIGHT } from '../entities/facelingTraits'
import { witnessedOffense } from './career'

export type GunAct = 'idle' | 'fire' | 'cycle' | 'dry' | 'open' | 'extract' | 'insert' | 'stage' | 'close'
export interface GunStep { act: 'extract' | 'insert' | 'stage'; barrel: number; ammo?: AmmoType; stage?: MuzzleStage }
export interface GunRun {
  act: GunAct
  t: number // 当前动作已进行（秒）
  dur: number
  /** 开枪机后的步骤队列 */
  steps: GunStep[]
  step: GunStep | null
  /** 本次装填已做完的步数（动画：第一步从护木 / 握把出发，之后从腰间） */
  stepNo: number
  stopReq: boolean // 装填中按了扳机：做完当前一步就收尾
  ejected: boolean // 本次开枪机 / 拉杆是否已抛出空壳
  aim: number // 贴腮 0..1
  recoil: number // 视觉后坐 1→0
  kickLeft: number // 镜头俯仰待回正量
  shotN: number; lastBarrel: number; lastAmmo: AmmoType | null
  ejectN: number; ejectBarrels: number[]; ejectAmmo: AmmoType | null // 抛出的空壳（渲染层按 ejectN 递增生成飞出的弹壳）
  dryN: number
  wall: number // 枪口前方到墙的距离（米，≥1 视为无遮挡），渲染层据此收枪避墙
  slot: InvSlot | null
  autoStowed: boolean // 是据点自动收起的（换下枪即自动取出空手）
  msgT: number
  pending: { e: Entity; t: number; dx: number; dy: number }[] // 爆团弹：穿入目标后待起爆
  allowT: number // 自动收枪后，重新允许持枪的时长（满 0.45 秒自动取出）
}
export const newGunRun = (): GunRun => ({
  act: 'idle', t: 0, dur: 0, steps: [], step: null, stepNo: 0, stopReq: false, ejected: false, aim: 0, recoil: 0, kickLeft: 0,
  shotN: 0, lastBarrel: 0, lastAmmo: null, ejectN: 0, ejectBarrels: [], ejectAmmo: null, dryN: 0, wall: 1, slot: null, autoStowed: false, msgT: 0, pending: [], allowT: 0,
})

/** 渲染层特效事件（枪口在第一人称模型上，渲染层自己取；这里只给弹着点） */
export type GunFx =
  | { kind: 'shot'; gun: GunType; ammo: AmmoType; barrel: number }
  | { kind: 'impact'; x: number; y: number; z: number; nx: number; ny: number; nz: number; ent: boolean; blood?: boolean | 'wretch' }
  | { kind: 'burst'; x: number; y: number; z: number }

// ------------------------------------------------------------------ 查询
export function heldGun(eng: Engine): { slot: InvSlot; def: GunDef } | null {
  const s = eng.player.hotbar[eng.player.selected]
  return s && isGun(s.type) ? { slot: s, def: GUNS[s.type] } : null
}
/** 规范化弹仓（旧档 / 新枪没有 mag = 全空） */
export function gunMag(slot: InvSlot): Chamber[] {
  const def = GUNS[slot.type as GunType]
  if (!slot.mag || slot.mag.length !== def.capacity) slot.mag = Array.from({ length: def.capacity }, (_, i) => (slot.mag?.[i] ?? '') as Chamber)
  return slot.mag as Chamber[]
}
export const loadedCount = (slot: InvSlot) => gunMag(slot).filter(isAmmo).length
/** 杠杆步枪：管式弹仓里的发数（不含膛） */
export const tubeCount = (slot: InvSlot) => gunMag(slot).slice(1).filter(isAmmo).length
/** 前装：已完成的装填步数（0..6；6 = 装好可击发） */
export const muzzleStage = (slot: InvSlot) => Math.max(0, Math.min(MUZZLE_STAGES.length, slot.stage ?? (isAmmo(gunMag(slot)[0]) ? MUZZLE_STAGES.length : 0)))
/** 选定弹种：缺省取背包里第一种有货的适配弹（都没有则取第一种） */
export function gunAmmoSel(eng: Engine, slot: InvSlot): AmmoType {
  const def = GUNS[slot.type as GunType]
  if (slot.ammoSel && def.ammo.includes(slot.ammoSel as AmmoType)) return slot.ammoSel as AmmoType
  return def.ammo.find((a) => eng.countItem(a) > 0) ?? def.ammo[0]
}
export const gunBusy = (eng: Engine) => eng.gun.act !== 'idle'
/** 装填相关动作（不能瞄准；扣扳机 = 请求中断） */
export const gunActionOpen = (eng: Engine) => ['open', 'extract', 'insert', 'stage', 'close'].includes(eng.gun.act)

// ------------------------------------------------------------------ 据点禁枪
/** 当前位置禁止亮枪的原因（据点名）；null = 可以用枪。敌对据点（声望 ≤ 拒绝交谈线）不受限。 */
export function gunZoneLock(eng: Engine): string | null {
  if (!eng.inOutpost) return null
  const o = Object.values(OUTPOSTS).find((x) => x.levelId === eng.player.level)
  if (!o) return null
  const f = FACTIONS[o.faction]
  if (f?.hasRep && (eng.rep[o.faction] ?? 0) <= REP_TIER.noTalk) return null
  if (gunLaneAllows(eng)) return null
  return o.name
}
/** 鎏金兵械库试射道：只有站在射击位里、枪口指向靶道、准星附近没有任何人，才允许亮枪 / 开火。
 *  其余情况写下原因（laneWhy），供收枪提示使用。 */
let laneWhy = ''
let laneCache: ReturnType<typeof tradersGunLane> | null = null
export const gunLane = () => (laneCache ??= tradersGunLane())
export function gunLaneAllows(eng: Engine): boolean {
  laneWhy = ''
  if (!eng.map?.traders) return false
  const L = gunLane(), p = eng.player
  if (!tradersContains(L.booth, p.x, p.y)) { laneWhy = tradersContains(L.lane, p.x, p.y) ? 'downrange' : 'outside'; return false }
  const dir = crosshairDirection()
  const off = seatedEyeOffset(eng)
  const ox = p.x + off.x, oy = p.y + off.y, oz = p.z + seatedEyeHeight(eng)
  // 枪口对着人：准星射线直接打到 NPC，或者 NPC 在准星 7° 以内且看得见
  const tr = trace(eng, ox, oy, oz, dir, 40)
  if (tr.npc !== null) { laneWhy = 'npc'; return false }
  for (const n of eng.npcs) {
    const dx = n.x - ox, dy = n.y - oy, dz = p.z + 1.2 - oz, d = Math.hypot(dx, dy, dz)
    if (d < 0.4 || d > 40) continue
    const cos = (dx * dir.x + dy * dir.y + dz * dir.z) / d
    if (cos > Math.cos(0.12) && d < tr.travel + 0.5) { laneWhy = 'npc'; return false }
  }
  // 枪口必须朝着靶道：弹着点（第一面墙）落在靶道里，且是往靶的方向打
  if (!tradersContains(L.lane, tr.x, tr.y) || dir.y > 0.05) { laneWhy = 'aim'; return false }
  return true
}
const LANE_MSG: Record<string, string> = {
  outside: '商人之家里只有鎏金兵械库的射击位能开火——你把枪收了起来。',
  downrange: '靶道里不准拿枪——回到长凳后面的射击位再取出来。',
  npc: '枪口对着人了——霍布斯一声「收枪」，你把枪放了下来。',
  aim: '枪口只能朝着靶道——你把枪收了起来。',
}
/** 纸靶：子弹从 (ox,oy,oz) 沿 dir 飞了 travel 米，途中穿过哪块靶、几环 */
export function laneTargetHit(o: { x: number; y: number; z: number }, dir: V, travel: number): { k: number; ring: number } | null {
  if (!laneCache || Math.abs(dir.y) < 1e-4) return null
  for (let k = 0; k < laneCache.targets.length; k++) {
    const t = laneCache.targets[k], s = (t.y - o.y) / dir.y
    if (s <= 0 || s > travel) continue
    const hx = o.x + dir.x * s - t.x, hz = o.z + dir.z * s - t.z
    const rr = Math.hypot(hx, hz) / t.r
    if (Math.abs(hx) <= 0.35 && hz >= -0.4 && hz <= 0.4) return { k, ring: rr > 1 ? 0 : Math.max(5, 10 - Math.floor(rr * 6)) }
  }
  return null
}
/** 收起 / 取出主手时的拦截：禁枪区里拿着枪不能取出 */
export function gunHolsterLock(eng: Engine): boolean {
  if (!eng.handsStowed || !heldGun(eng)) return false
  const z = gunZoneLock(eng)
  if (!z) return false
  eng.msg(`${z}里不准亮枪——枪留在背带上。换一样东西拿在手里，或者离开这里。`, 'system')
  return true
}


// ------------------------------------------------------------------ 输入
/** 左键：击发；装填中 = 请求中断（做完这一步收尾） */
export function gunTrigger(eng: Engine) {
  const g = heldGun(eng), run = eng.gun
  if (!g || eng.handsStowed || jerryInputLock(eng) || nguithrInputLock(eng) || armsInputLock(eng) || eng.usingItem) return
  if (gunZoneLock(eng)) return // Check before spending a cartridge, including the first frame after crossing into a base.
  if (gunActionOpen(eng)) { if (run.act !== 'close') run.stopReq = true; return }
  if (run.act !== 'idle') return
  if (blockUnderwaterGun(eng, eng.swim)) return
  fire(eng, g.slot, g.def)
}
const OPEN_SOUND: Record<GunType, Parameters<typeof audio.gunMech>[0]> = { dbshotgun: 'breakOpen', trapdoor: 'blockOpen', leverrifle: 'gate', revolver: 'halfcock', musket: 'paper' }
/** R 轻按：用选定弹种填满空位（不动已装的其它弹）；replace = 轮盘换弹种（拔出其它弹） */
export function gunReload(eng: Engine, replace = false): boolean {
  const g = heldGun(eng), run = eng.gun
  if (!g || eng.handsStowed || eng.usingItem || jerryInputLock(eng) || nguithrInputLock(eng) || armsInputLock(eng)) return false
  if (run.act !== 'idle') return false
  const def = g.def, slot = g.slot, mag = gunMag(slot), sel = gunAmmoSel(eng, slot)
  let have = eng.countItem(sel)
  const steps: GunStep[] = []
  const kind = def.reload.kind
  if (kind === 'muzzle') {
    const st = muzzleStage(slot)
    if (st >= MUZZLE_STAGES.length) { eng.msg(`${def.name}已经装好了。`, 'system'); return false }
    if (st === 0 && have <= 0) { eng.msg(`没有${AMMO[sel].name}了。`, 'system'); return false }
    for (let k = st; k < MUZZLE_STAGES.length; k++) steps.push({ act: 'stage', barrel: 0, stage: MUZZLE_STAGES[k], ammo: sel })
    run.steps = steps; run.slot = slot; run.stopReq = false; run.ejected = false; run.stepNo = 0
    run.step = run.steps.shift()!
    begin(run, 'stage', def.reload.stages![run.step.stage!])
    audio.gunMech('paper')
    return true
  }
  if (kind === 'tube') {
    // 膛（0）不经装弹口；管式弹仓从 1 往后排，最后压进去的最先上膛
    for (let b = 1; b < mag.length && have > 0; b++) if (!isAmmo(mag[b])) { steps.push({ act: 'insert', barrel: b, ammo: sel }); have-- }
  } else {
    for (let b = 0; b < mag.length; b++) {
      const c = mag[b]
      if (c === sel) continue
      if (isAmmo(c) && !replace) continue
      if (have <= 0) break
      if (isAmmo(c) || (kind === 'gate' && c === 'spent')) steps.push({ act: 'extract', barrel: b })
      steps.push({ act: 'insert', barrel: b, ammo: sel })
      have--
    }
    // 转轮：只有空壳没弹可装时，也要把空壳捅出来
    if (kind === 'gate' && have <= 0) for (let b = 0; b < mag.length; b++) if (mag[b] === 'spent' && !steps.some((s) => s.barrel === b)) steps.push({ act: 'extract', barrel: b })
  }
  const spent = kind === 'break' && mag.some((c) => c === 'spent')
  if (!steps.length && !spent) {
    if (eng.countItem(sel) <= 0) eng.msg(`没有${AMMO[sel].name}了。${def.ammo.length > 1 ? '按住 R 换别的弹种。' : ''}`, 'system')
    else eng.msg(`${def.name}已经装满了。`, 'system')
    return false
  }
  // 双管 / 活门：先拔后装；转轮：逐膛「捅壳 → 装弹」
  run.steps = kind === 'gate' ? steps.sort((a, b) => a.barrel - b.barrel || (a.act === 'extract' ? -1 : 1)) : steps.sort((a, b) => (a.act === b.act ? a.barrel - b.barrel : a.act === 'extract' ? -1 : 1))
  run.slot = slot; run.stopReq = false; run.ejected = false; run.stepNo = 0
  begin(run, 'open', def.reload.open)
  audio.gunMech(OPEN_SOUND[def.type])
  return true
}
/** 轮盘选弹：记下弹种并立刻换上（替换已装的其它弹） */
export function gunSelectAmmo(eng: Engine, ammo: AmmoType) {
  const g = heldGun(eng)
  if (!g || !g.def.ammo.includes(ammo)) return
  g.slot.ammoSel = ammo
  if (eng.countItem(ammo) <= 0) { eng.msg(`选定${AMMO[ammo].name}——但身上一发也没有。`, 'system'); return }
  eng.msg(`${g.def.name}：改用${AMMO[ammo].name}。`, 'system')
  gunReload(eng, true)
}
/** 轮盘「退弹」：把未击发的弹全部退出放回背包（前装枪不能退弹） */
export function gunUnload(eng: Engine) {
  const g = heldGun(eng), run = eng.gun
  if (!g || eng.handsStowed || run.act !== 'idle') return
  if (g.def.reload.kind === 'muzzle') { eng.msg('前装枪退不了弹——只能打出去。', 'system'); return }
  const mag = gunMag(g.slot)
  if (g.def.reload.kind === 'tube') {
    // 杠杆步枪：反复拉杆把弹一发发抛出来（这里简化为逐发从装弹口退出）
    run.steps = mag.map((c, b) => (isAmmo(c) ? { act: 'extract', barrel: b } as GunStep : null)).filter((x): x is GunStep => !!x).reverse()
  } else run.steps = mag.map((c, b) => (isAmmo(c) || (g.def.reload.kind === 'gate' && c === 'spent') ? { act: 'extract', barrel: b } as GunStep : null)).filter((x): x is GunStep => !!x)
  if (!run.steps.length && !mag.includes('spent')) { eng.msg('枪里是空的。', 'system'); return }
  run.slot = g.slot; run.stopReq = false; run.ejected = false; run.stepNo = 0
  begin(run, 'open', g.def.reload.open)
  audio.gunMech(OPEN_SOUND[g.def.type])
}

function begin(run: GunRun, act: GunAct, dur: number) { run.act = act; run.t = 0; run.dur = Math.max(0.01, dur) }
const RELOAD_ACTS = new Set<GunAct>(['open', 'extract', 'insert', 'stage', 'close'])

// ------------------------------------------------------------------ 每帧
export function updateFirearms(eng: Engine, dt: number) {
  const run = eng.gun, g = heldGun(eng)
  run.msgT = Math.max(0, run.msgT - dt)
  run.recoil = Math.max(0, run.recoil - dt * 4.2)
  // 镜头后坐回正（一部分；剩下的是真实的枪口上跳，需要玩家自己压）
  if (run.kickLeft > 0) { const k = Math.min(run.kickLeft, dt * 0.55); look.pitch -= k; run.kickLeft -= k }
  updatePending(eng, dt)
  // 自动收枪 / 取出
  const zone = g ? gunZoneLock(eng) : null
  if (g && zone && !eng.handsStowed) {
    eng.handsStowed = true; run.autoStowed = true; run.allowT = 0
    eng.input.attack = false
    cancel(run)
    if (run.msgT <= 0) { eng.msg(eng.map?.traders && laneWhy ? LANE_MSG[laneWhy] : `${zone}里不准亮枪——你把${g.def.name}收了起来。`, 'system'); run.msgT = 4 }
  } else if (g && !zone && run.autoStowed && eng.handsStowed) {
    // 回到射击位、枪口重新朝靶：稍等片刻自动把枪取出来
    run.allowT += dt
    if (run.allowT > 0.45) { eng.handsStowed = false; run.autoStowed = false; run.allowT = 0 }
  } else if (!g && run.autoStowed) {
    run.autoStowed = false
    if (eng.handsStowed) eng.handsStowed = false
  }
  // 换手 / 收枪：装填动作中断（折开的枪自动合上，已装的弹保留；前装进度留在枪上）
  if ((!g || g.slot !== run.slot || eng.handsStowed) && RELOAD_ACTS.has(run.act)) cancel(run)
  if ((!g || g.slot !== run.slot) && (run.act === 'fire' || run.act === 'cycle' || run.act === 'dry')) { if (run.act === 'cycle' && run.slot) finishCycle(eng, run, run.slot); run.act = 'idle' }
  // 贴腮
  const sprinting = eng.input.sprint && Math.hypot(eng.input.mx, eng.input.my) > 0.1
  const wantAim = !!g && !!eng.input.aimHeld && !eng.handsStowed && !sprinting && !gunActionOpen(eng) && run.wall > 0.55
  if (g) run.aim = Math.max(0, Math.min(1, run.aim + (wantAim ? 1 : -1.3) * dt / g.def.adsTime))
  else run.aim = 0
  // 枪口前方的墙（避墙收枪）
  run.wall = g && eng.map ? Math.min(1, wallAhead(eng, 1.05)) : 1
  if (!g || run.act === 'idle') return
  run.t += dt
  const def = g.def, slot = g.slot, mag = gunMag(slot)
  // 折开 / 掀开枪机：抽壳器抛出空壳
  if (run.act === 'open' && def.reload.kind === 'break' && !run.ejected && run.t >= def.reload.eject) {
    run.ejected = true
    const out: number[] = []
    for (let b = 0; b < mag.length; b++) if (mag[b] === 'spent') { mag[b] = ''; out.push(b) }
    if (out.length) eject(run, out, run.lastAmmo)
  }
  // 拉杆：杠杆下压到底时抛出膛里的空壳
  if (run.act === 'cycle' && !run.ejected && run.t >= run.dur * 0.42) {
    run.ejected = true
    if (mag[0] === 'spent') { mag[0] = ''; eject(run, [0], run.lastAmmo) }
    else if (isAmmo(mag[0])) { const c = mag[0]; mag[0] = ''; eject(run, [0], c); if (!eng.addItem(c)) dropAmmo(eng, c) } // 膛里有未击发的弹：被抛出来（捡回背包）
    audio.gunMech('leverDown')
  }
  // 转轮：退壳杆推到底时空壳从装弹门掉出来
  if (run.act === 'extract' && def.reload.kind === 'gate' && run.step && mag[run.step.barrel] === 'spent' && run.t >= run.dur * 0.6) { mag[run.step.barrel] = ''; eject(run, [run.step.barrel], run.lastAmmo ?? def.ammo[0]) }
  if (run.t < run.dur) return
  // 一个动作结束
  switch (run.act) {
    case 'fire':
      if (def.reload.kind === 'tube') { begin(run, 'cycle', def.cycle!); run.ejected = false } // 杠杆：击发后紧接着拉杆
      else run.act = 'idle'
      break
    case 'dry': run.act = 'idle'; break
    case 'cycle': finishCycle(eng, run, slot); run.act = 'idle'; break
    case 'open': next(eng, run, slot, def); break
    case 'extract': {
      const st = run.step!, c = mag[st.barrel]
      if (isAmmo(c)) { mag[st.barrel] = ''; if (!eng.addItem(c)) dropAmmo(eng, c) }
      else if (c === 'spent') { mag[st.barrel] = ''; eject(run, [st.barrel], run.lastAmmo ?? def.ammo[0]) } // 转轮：退壳杆把空壳捅出来
      run.stepNo++
      next(eng, run, slot, def); break
    }
    case 'insert': {
      const st = run.step!
      if (st.ammo && eng.consumeItem(st.ammo)) { mag[st.barrel] = st.ammo; audio.gunMech('insert') }
      run.stepNo++
      next(eng, run, slot, def); break
    }
    case 'stage': {
      const st = run.step!
      if (st.stage === 'bite') {
        if (!st.ammo || !eng.consumeItem(st.ammo)) { eng.msg('没有纸包弹了。', 'system'); cancel(run); begin(run, 'close', def.reload.close); return }
        slot.ammoSel = st.ammo
      }
      slot.stage = muzzleStage(slot) + 1
      if (slot.stage >= MUZZLE_STAGES.length) { mag[0] = (slot.ammoSel as AmmoType) ?? 'cart_paper'; slot.stage = MUZZLE_STAGES.length }
      audio.gunMech(st.stage === 'ram' ? 'ram' : st.stage === 'cap' ? 'cock' : 'paper')
      run.stepNo++
      // 通条还插在枪管里时不能中断：一定把「收回通条」做完
      const nx = run.stopReq && st.stage !== 'ram' ? undefined : run.steps.shift()
      if (nx) { run.step = nx; begin(run, 'stage', def.reload.stages![nx.stage!]) }
      else if (slot.stage >= MUZZLE_STAGES.length) { run.act = 'idle'; run.step = null; run.steps = [] } // 「装火帽」的动作本身就回到持枪
      else { run.step = null; run.steps = []; begin(run, 'close', def.reload.close) } // 中断：把枪端回来，进度留在枪上
      break
    }
    case 'close':
      run.act = 'idle'; run.step = null
      // 杠杆步枪：膛是空的就补一次拉杆上膛
      if (def.reload.kind === 'tube' && !isAmmo(mag[0]) && tubeCount(slot) > 0) { begin(run, 'cycle', def.cycle!); run.ejected = false }
      break
  }
}
function eject(run: GunRun, barrels: number[], ammo: AmmoType | null) {
  run.ejectBarrels = barrels; run.ejectAmmo = ammo; run.ejectN++
  audio.gunMech('eject')
}
/** 拉杆回位：管式弹仓里最后压进去的一发上膛 */
function finishCycle(eng: Engine, run: GunRun, slot: InvSlot) {
  const mag = gunMag(slot)
  if (isAmmo(mag[0])) return
  for (let b = mag.length - 1; b >= 1; b--) if (isAmmo(mag[b])) { mag[0] = mag[b]; mag[b] = ''; break }
  audio.gunMech('leverUp')
  void eng; void run
}
function next(eng: Engine, run: GunRun, _slot: InvSlot, def: GunDef) {
  let st = run.stopReq ? undefined : run.steps.shift()
  while (st && st.act === 'insert' && st.ammo && eng.countItem(st.ammo) <= 0) st = run.steps.shift()
  if (st) { run.step = st; begin(run, st.act, st.act === 'extract' ? def.reload.extract : def.reload.insert); return }
  run.step = null; run.steps = []
  begin(run, 'close', def.reload.close)
  audio.gunMech(def.type === 'dbshotgun' ? 'breakClose' : def.type === 'trapdoor' ? 'blockClose' : def.type === 'revolver' ? 'gateClose' : 'gate')
}
function cancel(run: GunRun) { run.act = 'idle'; run.steps = []; run.step = null; run.stopReq = false; run.aim = 0 }
function dropAmmo(eng: Engine, type: string) {
  const p = eng.player
  eng.map?.items.push({ id: Math.random(), type, x: p.x + 0.25, y: p.y + 0.25 })
  eng.msg(`背包满了——${ITEMS[type].name}掉在了脚边。`, 'system')
}

// ------------------------------------------------------------------ 击发
/** 这一枪用哪一格；null = 空击；'cycle' = 杠杆步枪膛空、先拉杆 */
function pickChamber(slot: InvSlot, def: GunDef): number | null | 'cycle' {
  const mag = gunMag(slot)
  switch (def.reload.kind) {
    case 'tube': return isAmmo(mag[0]) ? 0 : (mag[0] === 'spent' || tubeCount(slot) > 0) ? 'cycle' : null
    case 'gate': {
      // 单动转轮：每次扳击锤，转轮转到下一膛（装弹时会把空膛转开，这里直接取下一发实弹）
      const n = mag.length, c0 = slot.cyl ?? 0
      for (let k = 0; k < n; k++) { const b = (c0 + k) % n; if (isAmmo(mag[b])) return b }
      return null
    }
    case 'muzzle': return isAmmo(mag[0]) && muzzleStage(slot) >= MUZZLE_STAGES.length ? 0 : null
    default: return (FIRE_ORDER[def.type] ?? [0]).find((b) => isAmmo(mag[b])) ?? null
  }
}
const DRY_MSG: Record<GunType, string> = {
  dbshotgun: '两管都没有弹。按 R 折枪装填。',
  leverrifle: '弹仓打空了。按 R 从装弹口压弹。',
  revolver: '六个膛都打空了。按 R 开装弹门装填。',
  musket: '枪里没装弹——前装枪要按 R 一步步装填（约 8 秒）。',
  trapdoor: '膛里没有弹。按 R 掀开活门装填。',
}
function fire(eng: Engine, slot: InvSlot, def: GunDef) {
  const run = eng.gun, p = eng.player, mag = gunMag(slot)
  run.slot = slot
  const pick = pickChamber(slot, def)
  if (pick === 'cycle') { begin(run, 'cycle', def.cycle!); run.ejected = false; return }
  if (pick === null) {
    begin(run, 'dry', 0.22); run.dryN++
    audio.gunMech('dry')
    if (def.reload.kind === 'muzzle' && muzzleStage(slot) > 0 && run.msgT <= 0) { eng.msg(`${def.name}只装了一半（${MUZZLE_STAGE_LABEL[MUZZLE_STAGES[muzzleStage(slot)]]}还没做）。按 R 接着装。`, 'system'); run.msgT = 3 }
    else if (run.msgT <= 0) { eng.msg(`咔哒——${DRY_MSG[def.type]}`, 'system'); run.msgT = 3 }
    return
  }
  const barrel = pick
  const ammo = mag[barrel] as AmmoType, a = AMMO[ammo]
  // 前装：打出去什么也不剩；其余留下空壳
  mag[barrel] = def.reload.kind === 'muzzle' ? '' : 'spent'
  if (def.reload.kind === 'muzzle') slot.stage = 0
  if (def.reload.kind === 'gate') slot.cyl = (barrel + 1) % mag.length
  begin(run, 'fire', def.fireInterval)
  run.shotN++; run.lastBarrel = barrel; run.lastAmmo = ammo; run.recoil = 1
  // 瞄准偏移：腰射 / 贴腮 / 移动 / 冲刺
  const moving = Math.hypot(eng.input.mx, eng.input.my) > 0.1
  const sprint = moving && eng.input.sprint
  const jitter = def.hipJitter + (def.adsJitter - def.hipJitter) * run.aim + (moving ? def.moveJitter : 0) + (sprint ? def.moveJitter * 2 : 0)
  const base = crosshairDirection()
  const aim = coneDir(base, jitter * Math.sqrt(Math.random()), Math.random() * Math.PI * 2)
  const off = seatedEyeOffset(eng)
  const ox = p.x + off.x, oy = p.y + off.y, oz = p.z + seatedEyeHeight(eng)
  // 逐颗弹丸（.45-70 可穿透第一个目标）
  const hits = new Map<Entity, { dmg: number; n: number; d: number; x: number; y: number; z: number; dx: number; dy: number; dz: number }>()
  let impacts = 0, firstNpc: Engine['npcs'][number] | null = null
  const laneHits: { k: number; ring: number }[] = []
  for (let k = 0; k < a.pellets; k++) {
    const dir = a.pellets > 1 ? coneDir(aim, a.spread * Math.sqrt(Math.random()), Math.random() * Math.PI * 2) : coneDir(aim, a.spread * Math.random(), Math.random() * Math.PI * 2)
    let sx = ox, sy = oy, sz = oz, travel0 = 0, k2 = 1, pierceLeft = a.pierce ?? 0
    const skip = new Set<Entity>()
    for (;;) {
      const tr = trace(eng, sx, sy, sz, dir, a.maxRange - travel0, skip)
      const dist = travel0 + tr.travel
      if (eng.map?.traders) { const th = laneTargetHit({ x: sx, y: sy, z: sz - p.z }, dir, tr.travel); if (th) laneHits.push(th) }
      if (tr.npc !== null) { firstNpc ??= eng.npcs[tr.npc]; break }
      if (tr.entity) {
        const e = tr.entity
        const dmg = a.dmg * k2 * falloff(a, dist) * (a.smallMul && SMALL_TARGETS.has(e.def.type) ? a.smallMul : 1)
        const h = hits.get(e)
        if (h) { h.dmg += dmg; h.n++ } else hits.set(e, { dmg, n: 1, d: dist, x: tr.x, y: tr.y, z: tr.z, dx: dir.x, dy: dir.y, dz: dir.z })
        if (impacts < 10) { eng.gunFx.push({ kind: 'impact', x: tr.x, y: tr.y, z: tr.z, nx: -dir.x, ny: -dir.y, nz: -dir.z, ent: true, blood: bloodKind(e) }); impacts++ }
        if (pierceLeft-- > 0) { skip.add(e); sx = tr.x; sy = tr.y; sz = tr.z; travel0 = dist; k2 *= a.pierceK ?? 0.6; continue }
      } else if (dist < a.maxRange - 0.05 && impacts < 10) {
        eng.gunFx.push({ kind: 'impact', x: tr.x, y: tr.y, z: tr.z, nx: tr.nx, ny: tr.ny, nz: tr.nz, ent: false }); impacts++
      }
      break
    }
  }
  eng.gunFx.push({ kind: 'shot', gun: def.type, ammo, barrel })
  const mm = eng.map!, otx = Math.floor(p.x), oty = Math.floor(p.y)
  audio.gunshot(def.type, mm.outdoor?.[oty * mm.w + otx] === 1 ? 0.35 : 1)
  eng.noiseEvent(p.x, p.y, def.noiseR, true)
  eng.camShake = Math.min(1, eng.camShake + 0.32 - run.aim * 0.1)
  const kick = def.kick * (1 - run.aim * 0.25) * (eng.input.crouch ? 0.8 : 1)
  look.pitch = Math.min(1.2, look.pitch + kick)
  look.yaw += (Math.random() - 0.5) * kick * 0.35
  run.kickLeft += kick * def.kickRecover
  p.stamina = Math.max(0, p.stamina - 3)
  // 结算实体
  const lines: string[] = []
  for (const [e, h] of hits) {
    const dealt = Math.round(h.dmg)
    shotHitEntity(eng, e, eng.dev.oneHit ? 99999 : h.dmg, h.dx, h.dy, 'bullet', { ox, oy, oz, dx: h.dx, dy: h.dy, dz: h.dz })
    if (a.special === 'clumpburst' && !e.dead) run.pending.push({ e, t: CLUMPBURST.fuse, dx: h.dx, dy: h.dy })
    lines.push(a.pellets > 1 ? `${e.def.name}（${h.n} 颗，−${dealt}）` : `${e.def.name}（−${dealt}）`)
  }
  if (lines.length) eng.msg(`${a.name}${a.special ? '钻进了' : '打中'}${lines.join('、')}${a.special ? '——它在里面要炸了。' : '。'}`, 'damage')
  else if (a.special && impacts > 0 && run.msgT <= 0) { eng.msg('爆团弹打在了墙上——它没有穿入任何目标，不会起爆。', 'system'); run.msgT = 4 }
  if (firstNpc) npcShot(eng, firstNpc)
  // 试射道纸靶：报环数
  if (eng.map?.traders) {
    if (laneHits.length) {
      const best = laneHits.reduce((m, h) => (h.ring > m.ring ? h : m)), n = laneHits.filter((h) => h.ring > 0).length
      const far = best.k >= 2 ? '远靶（16 米）' : '近靶（11 米）'
      eng.msg(a.pellets > 1 ? `${far}：${n} 颗上靶，最好 ${best.ring} 环。` : best.ring ? `${far}：${best.ring} 环。` : `${far}：脱靶（擦着靶纸边）。`, 'system')
    } else if (!lines.length) eng.msg('脱靶。', 'system')
  }
}

function updatePending(eng: Engine, dt: number) {
  const run = eng.gun
  if (!run.pending.length || !eng.map) return
  for (let i = run.pending.length - 1; i >= 0; i--) {
    const pd = run.pending[i]
    pd.t -= dt
    if (pd.t > 0) continue
    run.pending.splice(i, 1)
    const e = pd.e
    if (!eng.map.entities.includes(e)) continue
    const x = e.x, y = e.y, z = e.z + 0.9
    eng.gunFx.push({ kind: 'burst', x, y, z })
    audio.gunBurst()
    eng.camShake = Math.min(1, eng.camShake + 0.25)
    eng.noiseEvent(x, y, 20, true)
    const fav = CLUMPBURST.favored.includes(e.def.type)
    if (!e.dead) {
      shotHitEntity(eng, e, CLUMPBURST.blast * (fav ? CLUMPBURST.favoredMul : 1), pd.dx, pd.dy, 'blast')
      eng.msg(fav ? `爆团弹在${e.def.name}体内炸开——把它从里面撕开、掀翻在地。（−${CLUMPBURST.blast * CLUMPBURST.favoredMul}，对${e.def.name}伤害翻倍）` : `爆团弹在${e.def.name}体内炸开。（−${CLUMPBURST.blast}）`, 'damage')
    }
    for (const o of eng.map.entities) {
      if (o === e || o.dead || (o.disguised && o.disguised !== 'human')) continue
      if (Math.hypot(o.x - x, o.y - y) > CLUMPBURST.splashR || Math.abs(o.z - e.z) >= 1) continue
      shotHitEntity(eng, o, CLUMPBURST.splash, o.x - x, o.y - y, 'splash')
    }
    const p = eng.player
    if (Math.hypot(p.x - x, p.y - y) < CLUMPBURST.selfR && Math.abs(p.z - e.z) < 1) eng.hurtPlayer(CLUMPBURST.selfDmg, '离得太近的爆团弹')
  }
}

// ------------------------------------------------------------------ 命中结算（远程版 strike：各实体特例与近战一致）
export function shotHitEntity(eng: Engine, e: Entity, dmg: number, dx: number, dy: number, kind: 'bullet' | 'blast' | 'splash',
  ray?: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }) {
  const m = eng.map!
  if (e.dead) return
  recordEntityEncounter(e)
  eng.provoked = true
  if (e.def.type === 'thething') { thingStruck(eng, e); return }
  if (e.def.type === 'jerry' && eng.indoctrination > 0) { if (kind === 'bullet') eng.msg('你扣不下扳机——鹉主的蓝羽在你眼中只剩神圣。（教化约束）', 'system'); return }
  if (mpHurtEntity(eng, e, dmg)) { eng.bloodParticles(e.x, e.y, bloodKind(e)); return }
  if (nwInvulnerable(e.def.type)) {
    if ((e.turnSlowT ?? 0) <= 0) eng.msg(e.def.type === 'watcher' ? '弹丸从湿滑的巩膜上弹开了。它没有眨眼——它没有眼睑。' : '弹丸穿过了一团烟雾。什么也没打到。', 'system')
    e.turnSlowT = 2; return
  }
  if (isWrangler(e.def.type)) {
    const s = e.wg ?? initWrangler(eng, e)
    if ((e.turnSlowT ?? 0) <= 0) eng.msg(s.kind === 'juvenile' ? '弹丸从幼体半透明的皮上滑开了——只有火能伤到它。' : s.kind === 'male' ? '子弹打在它身上像打进湿透的轮胎。那张笑脸甚至没有变。' : '弹丸在甲壳上崩出一串火星。', 'system')
    e.turnSlowT = 2
    if (s.kind === 'female') { s.aggro = true; s.provokeT = 99 }
    return
  }
  if (e.def.type === 'burster') { bursterMelee(eng, e, dmg, kind !== 'bullet'); return }
  if (e.def.type === 'tiny') { tinyStruck(eng, e); return }
  if (isVm36(e)) { vm36Struck(eng, e, dmg); return }
  if (e.def.type === 'partygoer') {
    const part = ray ? partygoerAimPart(eng, e, ray) : 'body'
    partygoerDamage(eng, e, dmg, kind === 'bullet' ? 'other' : 'fire', part)
  } else if (e.def.type === 'jerry') {
    e.hp -= dmg; jerryHurt(eng, e); eng.hurtJerryRep()
  } else {
    e.hp -= dmg
    // 击退：弹丸小幅推开；爆团弹体内起爆把它整个掀出去（逐段墙体校验，不钉进墙里）
    const dist = kind === 'blast' ? CLUMPBURST.knock : kind === 'splash' ? 0.6 : Math.min(0.5, dmg / 120)
    const n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n
    const l9 = eng.levelDef.id === 9 && (e.def.type === 'watcher' || e.def.type === 'strider' || e.def.type === 'mangled')
    for (let s = 0.2; s <= dist + 1e-6; s += 0.2) {
      const kx = e.x + ux * 0.2, ky = e.y + uy * 0.2, ktx = Math.floor(kx), kty = Math.floor(ky)
      if (eng.entityWalkH(m, ktx, kty, bandOfZ(e.z)) === null || (l9 && m.outdoor[kty * m.w + ktx] !== 1)) break
      e.x = kx; e.y = ky
    }
  }
  e.stunT = Math.max(e.stunT, kind === 'blast' ? CLUMPBURST.stun : kind === 'splash' ? 0.5 : 0.45)
  eng.bloodParticles(e.x, e.y, bloodKind(e))
  skinStealerHit(eng, e)
  if (e.def.type === 'ferren') eng.changeRep('bntg', -15)
  if (e.def.passive && !e.def.noRetaliate) { e.provoked = true; e.targetEnt = undefined; e.state = 'chase'; e.stateT = 0 }
  if (e.def.type === 'corpserat' && e.provoked) eng.provokeRatPack(e)
  audio.hit()
  eng.killCheck(e)
}

/** 打中 NPC（居民不是实体）：与近战波及同一契约——声望下降、旁人看见 */
function npcShot(eng: Engine, n: Engine['npcs'][number]) {
  if (n.def.faction === 'jerry' && eng.indoctrination >= 50) { eng.msg('你无法伤害自己的兄弟姐妹。（教化约束）', 'system'); return }
  const witness = eng.npcs.find(w => !w.dead && w.id !== n.id && Math.hypot(w.x-eng.player.x,w.y-eng.player.y)<8 && eng.los(w.x,w.y,eng.player.x,eng.player.y))
  if (witness) witnessedOffense(eng, `gun-assault:${eng.player.level}:${eng.career.clock.toFixed(3)}:${n.id}`, witness.id)
  if (n.def.faction === 'brc' || n.def.faction === 'jerry') {
    n.hp = (n.hp ?? 50) - 45
    eng.bloodParticles(n.x, n.y)
    if (n.hp <= 0 && !n.dead) {
      n.dead = true; n.deathT = 1.4; eng.player.kills++
      if (n.def.faction === 'brc' && !n.hostile) eng.brcSin.killed++
      if (n.def.faction === 'jerry' && !n.hostile) eng.changeRep('jerry', -30)
      eng.msg(`${n.def.name} 中枪倒下了。`, 'damage')
    } else if (!n.hostile) {
      if (n.def.faction === 'brc') eng.brcSin.hurt++
      else eng.changeRep('jerry', -15)
      eng.msg(`你开枪打伤了 ${n.def.name}。`, 'damage')
    }
    return
  }
  eng.changeRep(n.def.faction ?? 'meg', -25)
  n.bubbleText = '别开枪！！'
  n.bubbleT = 3
  eng.msg(`弹丸擦着 ${n.def.name} 飞过去——周围的人都看见你朝人开枪了。（声望大幅下降）`, 'damage')
  audio.aggro()
}

// ------------------------------------------------------------------ 弹道
type V = { x: number; y: number; z: number }
/** 以 base 为轴、偏离 ang 弧度、绕轴相位 phi 的方向 */
export function coneDir(base: V, ang: number, phi: number): V {
  if (ang <= 0) return { ...base }
  // 正交基
  const up = Math.abs(base.z) < 0.95 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  let ux = base.y * up.z - base.z * up.y, uy = base.z * up.x - base.x * up.z, uz = base.x * up.y - base.y * up.x
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul
  const vx = base.y * uz - base.z * uy, vy = base.z * ux - base.x * uz, vz = base.x * uy - base.y * ux
  const c = Math.cos(ang), s = Math.sin(ang), cp = Math.cos(phi) * s, sp = Math.sin(phi) * s
  const x = base.x * c + ux * cp + vx * sp, y = base.y * c + uy * cp + vy * sp, z = base.z * c + uz * cp + vz * sp
  const l = Math.hypot(x, y, z) || 1
  return { x: x / l, y: y / l, z: z / l }
}

export interface TraceHit { x: number; y: number; z: number; travel: number; entity: Entity | null; npc: number | null; nx: number; ny: number; nz: number }
/** 三维射线步进：墙 / 结构 / 地面 / 实体胶囊 / NPC 胶囊。与 combat.traceCrosshair 同一套实体体积。 */
export function trace(eng: Engine, ox: number, oy: number, oz: number, dir: V, range: number, skip?: Set<Entity>): TraceHit {
  const m = eng.map!, p = eng.player
  const band = bandOfPlayerZ(m, p.z, p.x, p.y)
  // 只检查射线前方、射程内的候选（每颗弹丸都要走一遍，先粗筛）
  const cand: { e: Entity; r: number; bot: number; top: number }[] = []
  for (const e of m.entities) {
    if (e.dead || e.hidden || (e.disguised && e.disguised !== 'human') || skip?.has(e)) continue
    const ex = e.x - ox, ey = e.y - oy, along = ex * dir.x + ey * dir.y
    if (along < -1.5 || along > range + 1.5) continue
    const scale = (e.def.scale ?? 1) * Math.min(2.5, e.def.huge ?? 1)
    const r = Math.max(0.3, Math.min(1.35, 0.42 * scale))
    const lat = Math.abs(ex * dir.y - ey * dir.x) / (Math.hypot(dir.x, dir.y) || 1)
    if (lat > r + 0.5) continue
    const bodyH = e.def.type === 'skinstealer' ? (e.disguised === 'human' ? 1.95 : 2.2) : e.def.type === 'faceling' ? 1.85 * FACELING_AGE_HEIGHT[facelingAgeOf(e)] : 1.6
    cand.push({ e, r, bot: e.z - (e.def.flying ? 0.38 * scale : 0.05), top: e.z + Math.max(0.8, bodyH * scale) })
  }
  const npcs: number[] = []
  for (let i = 0; i < eng.npcs.length; i++) {
    const n = eng.npcs[i]
    if (n.dead || (n.floor ?? 0) !== band) continue
    const ex = n.x - ox, ey = n.y - oy, along = ex * dir.x + ey * dir.y
    if (along < -0.5 || along > range + 0.5) continue
    if (Math.abs(ex * dir.y - ey * dir.x) / (Math.hypot(dir.x, dir.y) || 1) > 0.8) continue
    npcs.push(i)
  }
  const step = 0.1
  let px = ox, py = oy, pz = oz
  for (let s = 0.12; s <= range; s += step) {
    const x = ox + dir.x * s, y = oy + dir.y * s, z = oz + dir.z * s
    const tx = Math.floor(x), ty = Math.floor(y)
    const g = groundHeightAt(m, x, y, band)
    if (wallAt(m, tx, ty, band) || structBlocksSight(m, x, y, z, band) || z <= g + 0.02) {
      // 法线：判断从哪一面进入
      let nx = 0, ny = 0, nz = 0
      if (z <= g + 0.02) nz = 1
      else if (Math.floor(px) !== tx) nx = px < x ? -1 : 1
      else if (Math.floor(py) !== ty) ny = py < y ? -1 : 1
      else { nx = -dir.x; ny = -dir.y; nz = -dir.z }
      return { x: px, y: py, z: pz, travel: Math.max(0, s - step), entity: null, npc: null, nx, ny, nz }
    }
    for (const c of cand) if (Math.hypot(c.e.x - x, c.e.y - y) <= c.r && z >= c.bot && z <= c.top) return { x, y, z, travel: s, entity: c.e, npc: null, nx: -dir.x, ny: -dir.y, nz: -dir.z }
    for (const i of npcs) { const n = eng.npcs[i]; if (Math.hypot(n.x - x, n.y - y) <= 0.32 && z >= p.z - 0.2 && z <= p.z + 1.8) return { x, y, z, travel: s, entity: null, npc: i, nx: -dir.x, ny: -dir.y, nz: -dir.z } }
    px = x; py = y; pz = z
  }
  return { x: ox + dir.x * range, y: oy + dir.y * range, z: oz + dir.z * range, travel: range, entity: null, npc: null, nx: 0, ny: 0, nz: 0 }
}
/** 视线正前方到墙 / 结构的距离（避墙收枪；不看实体） */
function wallAhead(eng: Engine, range: number): number {
  const m = eng.map!, p = eng.player, d = crosshairDirection()
  const off = seatedEyeOffset(eng), ox = p.x + off.x, oy = p.y + off.y, oz = p.z + seatedEyeHeight(eng) - 0.12
  const band = bandOfPlayerZ(m, p.z, p.x, p.y)
  for (let s = 0.15; s <= range; s += 0.08) {
    const x = ox + d.x * s, y = oy + d.y * s, z = oz + d.z * s
    if (wallAt(m, Math.floor(x), Math.floor(y), band) || structBlocksSight(m, x, y, z, band)) return s
  }
  return range
}
