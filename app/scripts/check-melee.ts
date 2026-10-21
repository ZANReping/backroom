/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读写引擎内部状态 */
// 近战武器重制——无头机制验收（真实 Engine + 真实 Level 0 生成）
// 运行：npm run check:melee
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: (tag: string) => tag === 'canvas' ? createCanvas(256, 256) : ({ getContext: () => null, style: {} }), createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const { audio } = await import('../src/game/core/audio')
const { look } = await import('../src/game/renderer/shared')
const { makeEntity } = await import('../src/game/entities')
const { ITEMS } = await import('../src/game/content/items')
const C = await import('../src/game/content/melee')
const M = await import('../src/game/engine/melee')
const { meleeSwing } = await import('../src/game/renderer/meleeAnim')
const { buildItemMesh } = await import('../src/game/renderer/itemsMesh')
const { buildDetailedItemMesh } = await import('../src/game/renderer/detailItemsMesh')
const { wallAt } = await import('../src/game/world/mapgen')
const { buildHeldItem, vmAnimPose } = await import('../src/game/renderer/viewmodel')

for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'clang', 'spark', 'searchTick'] as const) (audio as any)[k] = () => {}
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps
const DT = 1 / 60

function fresh(level = 0) {
  const e: any = new Engine(); e.seed = 7
  e.loadLevel(level, { mapSeed: 7, firstVisit: level === 0 }); e.introT = 0
  e.dev.frozenAI = true; e.dev.god = true; e.dev.statLock = false
  e.player.hp = 100; e.player.sanity = 100; e.player.stamina = 100
  e.map.entities.length = 0
  const msgs: string[] = []; const om = e.msg.bind(e); e.msg = (t: string, k: any) => { msgs.push(t); om(t, k) }
  return { e, msgs }
}
/** 找一块四周开阔的地（6m 内无墙），玩家站上去朝 +X 看 */
function openSpot(e: any) {
  const m = e.map
  for (let y = 4; y < m.h - 4; y++) for (let x = 4; x < m.w - 4; x++) {
    let clear = true
    for (let dy = -2; dy <= 2 && clear; dy++) for (let dx = -1; dx <= 4 && clear; dx++) if (wallAt(m, x + dx, y + dy, 0) || m.structs?.some((st: any) => st.solid && Math.abs(st.x - (x + dx + .5)) < 1 && Math.abs(st.y - (y + dy + .5)) < 1)) clear = false
    if (clear) return { x: x + .5, y: y + .5 }
  }
  throw new Error('no open spot')
}
function face(e: any, dirX: number, dirY: number) {
  e.player.facing = Math.atan2(dirY, dirX)
  look.yaw = Math.atan2(-dirX, -dirY); look.pitch = -0.05
  look.rayX = -Math.sin(look.yaw) * Math.cos(look.pitch); look.rayY = -Math.cos(look.yaw) * Math.cos(look.pitch); look.rayZ = Math.sin(look.pitch)
}
function setup(type: string, opts: { dist?: number[]; dur?: number } = {}) {
  const { e, msgs } = fresh()
  const s = openSpot(e)
  e.player.x = s.x; e.player.y = s.y; e.player.z = 0; face(e, 1, 0)
  e.player.hotbar[0] = { type, count: 1, ...(opts.dur !== undefined ? { dur: opts.dur } : {}) }; e.player.selected = 0
  const ents = (opts.dist ?? [1.4]).map((d, i) => {
    const en: any = makeEntity('wretch', s.x + d, s.y + (i ? (i % 2 ? .35 : -.35) : 0), 0)
    en.hp = 1e6; en.facing = Math.PI; en.state = 'wander'
    e.map.entities.push(en); return en
  })
  return { e, msgs, ents, slot: e.player.hotbar[0] }
}
const step = (e: any, secs: number, each?: () => void) => { for (let t = 0; t < secs - 1e-9; t += DT) { each?.(); e.step(DT) } }
const tap = (e: any) => { e.input.attack = true; e.input.attackHeld = false }
const dmgOf = (en: any) => 1e6 - en.hp

// ---------- 1. 数据表 ----------
for (const k of C.MELEE_KINDS) for (const heavy of [false, true]) {
  const a = meleeSwing(k as any, heavy), t = heavy ? C.MELEE[k].heavy : C.MELEE[k].light
  ok(near(a.dur, t.dur) && near(a.windup, t.windup) && near(a.active, t.active) && a.keys.some((x) => near(x.t, t.windup)) && a.keys.some((x) => near(x.t, t.active)),
    `${k}${heavy ? ' 重击' : ' 普攻'}：动画关键帧与机制时间表一致（${t.dur}s，判定 ${t.windup}–${t.active}）`)
  ok(near(t.dur, heavy ? t.dur : ITEMS[k].attackInterval!) , `${k}${heavy ? ' 重击' : ' 普攻'}：普攻时长 = 物品攻击间隔`)
}

// ---------- 2. 前摇后才判定 ----------
for (const k of C.MELEE_KINDS) {
  const { e, ents } = setup(k)
  const t = C.MELEE[k].light, hitAt = t.windup * t.dur
  tap(e); step(e, DT)
  ok(dmgOf(ents[0]) === 0 && e.meleePending, `${k}：按下后进入前摇，尚未结算伤害`)
  let firstHit = -1, time = DT
  step(e, t.dur + .3, () => { time += DT; if (firstHit < 0 && dmgOf(ents[0]) > 0) firstHit = time })
  ok(firstHit > 0 && Math.abs(firstHit - hitAt) <= 3.5 * DT, `${k}：在前摇结束时（${hitAt.toFixed(3)}s）命中，实测 ${firstHit.toFixed(3)}s`)
  ok(near(dmgOf(ents[0]), ITEMS[k].weapon!), `${k}：普攻伤害 ${ITEMS[k].weapon}（实测 ${dmgOf(ents[0])}）`)
  ok(M.slotDur(e.player.hotbar[0]) === C.MELEE[k].maxDur - C.DUR_HIT, `${k}：命中扣耐久 ${C.DUR_HIT}（${M.slotDur(e.player.hotbar[0])}/${C.MELEE[k].maxDur}）`)
  ok((e.player.hotbar[0].blood ?? 0) > 0, `${k}：命中后刃上沾血`)
}

// ---------- 3. 卡帧 ----------
{
  const { e } = setup('crowbar')
  tap(e); const t = C.MELEE.crowbar.light
  let saw = false, frozen = true, prevAnim = -1
  step(e, t.dur, () => {
    if (e.hitStopT > 0) { if (saw && prevAnim >= 0 && e.attackAnimT !== prevAnim) frozen = false; saw = true; prevAnim = e.attackAnimT } else prevAnim = -1
  })
  ok(saw && frozen, '命中卡帧：hitStopT 期间挥砍动画进度冻结')
}

// ---------- 4. 蓄力重击 ----------
for (const k of ['crowbar', 'axe', 'knife'] as const) {
  const { e, ents } = setup(k)
  const st0 = e.player.stamina
  e.input.attack = true; e.input.attackHeld = true
  step(e, C.CHARGE_DELAY + C.MELEE[k].chargeTime + .1)
  ok(near(e.meleeCharge, 1), `${k}：按住 ${C.CHARGE_DELAY}+${C.MELEE[k].chargeTime}s 蓄满（${e.meleeCharge.toFixed(2)}）`)
  ok(dmgOf(ents[0]) === 0 && e.attackAnimT <= 0, `${k}：蓄力期间不出手`)
  const st0b = e.player.stamina
  e.input.attackHeld = false
  step(e, DT)
  const spent = st0b - e.player.stamina
  step(e, C.MELEE[k].heavy.dur + .2)
  ok(e.meleeHeavy, `${k}：松开后放出重击`)
  ok(near(dmgOf(ents[0]), ITEMS[k].weapon! * 1.8, 1e-6), `${k}：满蓄重击伤害 ×1.8（${dmgOf(ents[0])}）`)
  void st0
  ok(Math.abs(spent - ITEMS[k].attackStamina! * 2) < .5, `${k}：重击体力消耗 ×2（${ITEMS[k].attackStamina! * 2}，实测 ${spent.toFixed(1)}）`)
  ok(M.slotDur(e.player.hotbar[0]) === C.MELEE[k].maxDur - C.DUR_HEAVY_HIT, `${k}：重击命中扣耐久 ${C.DUR_HEAVY_HIT}`)
}
{
  const { e, ents } = setup('wrench')
  e.input.attack = true; e.input.attackHeld = true; step(e, .1); e.input.attackHeld = false
  step(e, 1.2)
  ok(!e.meleeHeavy && near(dmgOf(ents[0]), ITEMS.wrench.weapon!), '短按（<0.2s）= 普攻')
}
{
  const { e, ents } = setup('wrench')
  e.input.attack = true; e.input.attackHeld = true
  step(e, C.CHARGE_DELAY + .1) // 只蓄了一点点
  e.input.attackHeld = false; step(e, 1.3)
  ok(!e.meleeHeavy && near(dmgOf(ents[0]), ITEMS.wrench.weapon!), `蓄力不足 ${C.HEAVY_MIN_CHARGE} 松开 = 普攻`)
}
{
  const { e, msgs } = setup('axe')
  e.player.stamina = 5
  e.input.attack = true; e.input.attackHeld = true; step(e, 1.2)
  ok(e.meleeCharge === 0 && msgs.some((m) => m.includes('体力不够蓄力')), '体力不足：不能蓄力，并提示')
}

// ---------- 5. 攻击距离 / 目标数 / 特性 ----------
{
  const a = setup('knife', { dist: [1.75] }); tap(a.e); step(a.e, .6)
  const b = setup('crowbar', { dist: [1.75] }); tap(b.e); step(b.e, 1)
  ok(dmgOf(a.ents[0]) === 0 && dmgOf(b.ents[0]) > 0, `距离：刀 ${C.MELEE.knife.reach}m 够不着 1.75m，撬棍 ${C.MELEE.crowbar.reach}m 够得着`)
  const c = setup('timber', { dist: [2.2] }); tap(c.e); step(c.e, 1.1)
  ok(dmgOf(c.ents[0]) > 0, `距离：木板 ${C.MELEE.timber.reach}m 打到 2.2m`)
}
{
  const a = setup('crowbar', { dist: [1.2, 1.4] }); tap(a.e); step(a.e, 1)
  ok(a.ents.filter((x: any) => dmgOf(x) > 0).length === 1 && dmgOf(a.ents[0]) > 0, '撬棍一次只打最近的 1 个目标')
  const b = setup('timber', { dist: [1.2, 1.4, 1.6] }); tap(b.e); step(b.e, 1.1)
  ok(b.ents.filter((x: any) => dmgOf(x) > 0).length === 3, '木板横扫一次打 3 个目标')
}
{
  const a = setup('wrench'); tap(a.e); step(a.e, C.MELEE.wrench.light.windup * C.MELEE.wrench.light.dur + 2 * DT)
  ok(near(a.ents[0].stunT, C.MELEE.wrench.stun, .05), `管钳硬直 ${C.MELEE.wrench.stun}s（实测 ${a.ents[0].stunT.toFixed(2)}）`)
}
{
  const a = setup('knife'); a.ents[0].facing = 0 // 背对玩家（玩家在它 -X 侧，它朝 +X）
  tap(a.e); step(a.e, .6)
  ok(near(dmgOf(a.ents[0]), ITEMS.knife.weapon! * 2) && a.msgs.some((m) => m.includes('背刺')), `刀背刺 ×2（${dmgOf(a.ents[0])}）`)
  const b = setup('knife'); b.ents[0].facing = 0; b.ents[0].state = 'chase'
  tap(b.e); step(b.e, .6)
  ok(near(dmgOf(b.ents[0]), ITEMS.knife.weapon!), '正在追你的目标不吃背刺')
  const c = setup('crowbar'); c.ents[0].facing = 0; tap(c.e); step(c.e, 1)
  ok(near(dmgOf(c.ents[0]), ITEMS.crowbar.weapon!), '只有刀能背刺')
}
{
  const a = setup('crowbar'); tap(a.e); step(a.e, .1)
  a.e.player.hotbar[1] = { type: 'knife', count: 1 }; a.e.player.selected = 1
  step(a.e, 1)
  ok(dmgOf(a.ents[0]) === 0 && M.slotDur(a.e.player.hotbar[0]) === C.MELEE.crowbar.maxDur, '前摇中换武器：这一下作废（不伤害、不扣耐久）')
}

// ---------- 6. 打墙弹刀（Level 4 办公区有实墙）----------
{
  const { e, msgs } = fresh(4)
  const m = e.map
  let spot: any = null
  for (let y = 3; y < m.h - 3 && !spot; y++) for (let x = 3; x < m.w - 3 && !spot; x++) if (!wallAt(m, x, y, 0) && !wallAt(m, x - 1, y, 0) && !wallAt(m, x - 2, y, 0) && wallAt(m, x + 1, y, 0)) spot = { x: x + .5, y: y + .5 }
  e.player.x = spot.x + .1; e.player.y = spot.y; e.player.z = 0; face(e, 1, 0)
  e.player.hotbar[0] = { type: 'axe', count: 1 }; e.player.selected = 0
  tap(e); let bounced = 0
  step(e, 1.2, () => { bounced = Math.max(bounced, e.meleeBounce) })
  ok(bounced > .9, '对着墙挥：弹刀（meleeBounce=1）')
  ok(M.slotDur(e.player.hotbar[0]) === C.MELEE.axe.maxDur - C.DUR_WALL, `弹刀扣耐久 ${C.DUR_WALL}`)
  ok(msgs.some((x) => x.includes('弹了回来')), '弹刀提示')
  e.player.hotbar[0] = { type: 'crowbar', count: 1 }; e.player.selected = 0; face(e, -1, 0)
  for (let k = 0; k < 4; k++) { e.attackCooldownT = 0; tap(e); step(e, 1) }
  ok(M.slotDur(e.player.hotbar[0]) === C.MELEE.crowbar.maxDur, '对着空地挥空：不扣耐久')
}

// ---------- 7. 残件 / 修理 ----------
{
  const { e, ents, msgs } = setup('timber', { dur: 1 })
  tap(e); step(e, 1.1)
  const s = e.player.hotbar[0]
  ok(s && s.type === 'timber' && s.dur === 0 && M.isBroken(s), '耐久归零：武器不消失，变成残件')
  ok(M.slotName(s) === '木板（残件）' && msgs.some((x) => x.includes('裂开')), `残件改名「${M.slotName(s)}」并提示`)
  ents[0].x = e.player.x + 1.4; ents[0].y = e.player.y // 第一下的击退把它推远了
  const before = dmgOf(ents[0]); e.attackCooldownT = 0; tap(e); step(e, 1.1)
  ok(near(dmgOf(ents[0]) - before, ITEMS.timber.weapon! * C.MELEE.timber.brokenDmg), `残件伤害 ×${C.MELEE.timber.brokenDmg}（${dmgOf(ents[0]) - before}）`)
  ok(e.meleeReach === C.MELEE.timber.brokenReach, `残件攻击距离降到 ${C.MELEE.timber.brokenReach}m`)
  ok(s.dur === 0, '残件不再扣耐久')
  // 修理
  ok(!M.tryRepairHeld(e) && msgs.some((x) => x.includes('钉子或尼龙绳')), '没有材料：不能修，提示需要钉子或尼龙绳')
  e.player.backpack[0] = { type: 'nails', count: 2 }
  e.quickUse()
  ok(e.usingItem?.label === '修理', '右键残件 + 背包有钉子 → 开始修理动作')
  step(e, C.REPAIR_TIME + .1)
  ok(s.dur === Math.ceil(C.MELEE.timber.maxDur * C.REPAIR_TO) && !M.isBroken(s), `修理完成：耐久回到 ${s.dur}/${C.MELEE.timber.maxDur}（50%），残件变回完好`)
  ok(e.player.backpack[0]?.count === 1, '修理消耗 1 份钉子')
  e.quickUse()
  ok(!e.usingItem && msgs.some((x) => x.includes('低于一半才需要修')), '耐久 ≥50%：不能再修')
  s.dur = 3; e.player.backpack[0] = null; e.player.backpack[1] = { type: 'rope', count: 1 }
  e.quickUse(); step(e, C.REPAIR_TIME + .1)
  ok(s.dur === Math.ceil(C.MELEE.timber.maxDur * C.REPAIR_TO) && !e.player.backpack[1], '尼龙绳也能修，修完消耗掉')
  s.dur = 2; e.player.backpack[0] = { type: 'nails', count: 1 }
  e.quickUse(); step(e, 1); e.player.selected = 1; step(e, C.REPAIR_TIME)
  ok(s.dur === 2 && e.player.backpack[0]?.count === 1, '修理中切走：中断，不消耗材料')
}
{
  const { e } = setup('knife', { dur: 16 })
  const low: string[] = []; const om = e.msg; e.msg = (t: string, k: any) => { low.push(t); om(t, k) }
  tap(e); step(e, .6)
  ok(low.some((x) => x.includes('裂纹')), `耐久跌破 ${C.LOW_DUR * 100}% 时提示裂纹`)
}

// ---------- 8. 掉落 / 拾取 / 旧档 ----------
{
  const { e } = setup('axe', { dur: 0 })
  e.dropSlot('hotbar', 0)
  const g = e.map.items.find((x: any) => x.type === 'axe')
  ok(g && g.dur === 0 && !e.player.hotbar[0], '丢下残件：地面物品保留 dur=0')
  e.addItem(g.type, { dur: g.dur, blood: g.blood })
  ok(e.player.hotbar.some((x: any) => x?.type === 'axe' && x.dur === 0), '捡回来仍是残件')
  e.addItem('axe')
  ok(e.player.hotbar.filter((x: any) => x?.type === 'axe').length === 2, '近战武器不堆叠（每把单独记耐久）')
  const legacy = { type: 'crowbar', count: 1 }
  ok(M.slotDur(legacy as any) === C.MELEE.crowbar.maxDur && !M.isBroken(legacy as any), '旧存档没有 dur 字段 = 满耐久')
  ok(e.axeDur === 0, '全局 axeDur 已弃用')
}
// ---------- 9. 斧头劈门 ----------
{
  const { e } = fresh()
  e.player.hotbar[0] = { type: 'axe', count: 1, dur: 1 }; e.player.hotbar[1] = { type: 'axe', count: 1, dur: 0 }
  e.player.selected = 1
  ok(M.usableAxe(e) === e.player.hotbar[0], '劈门优先手上的斧头；手上是残件时用背包里完好的那把')
  M.wearSlot(e, e.player.hotbar[0], C.DUR_DOOR)
  ok(M.usableAxe(e) === null, `劈门扣 ${C.DUR_DOOR}，斧头成残件后不能再劈门`)
}

// ---------- 10. 渲染：模型与姿势 ----------
{
  for (const k of C.MELEE_KINDS) for (const v of ['', ':broken']) {
    const g = buildItemMesh(k + v, { halo: false }), ref = buildDetailedItemMesh(k === 'wrench' || k === 'timber' ? 'knife' : k)
    const b = new THREE.Box3().setFromObject(g), rb = new THREE.Box3().setFromObject(ref)
    ok(b.max.y - b.min.y < .2 && b.max.x - b.min.x > .1 && g.userData.itemType === k, `地面模型 ${k}${v}：平躺（高 ${(b.max.y - b.min.y).toFixed(3)}m）`)
    ok(Math.abs((b.max.y + b.min.y) / 2) < .005 && b.min.y > rb.min.y - .1, `地面模型 ${k}${v}：竖直居中，与旧模型同一悬浮基准（底 ${b.min.y.toFixed(3)} / 旧 ${rb.min.y.toFixed(3)}）`)
    const h = buildHeldItem(k + v)
    ok(!!h.userData.meleeRig, `第一人称模型 ${k}${v} 带握持数据`)
  }
  let finite = true
  for (const k of C.MELEE_KINDS) for (const heavy of [false, true]) for (let i = 0; i <= 20; i++) {
    const p = vmAnimPose({ mx: 0, my: 0, bobPhase: 0, time: i * .1, attackAnimT: (1 - i / 20) * .9, attackAnimDur: .9, attackAnimKind: 'swing', melee: { type: k as any, heavy } })
    if (![p.px, p.py, p.pz, p.rx, p.ry, p.rz].every(Number.isFinite) || p.rx < -0.9 || p.rx > 1.6) finite = false
  }
  ok(finite, '挥砍姿势全程有限值，前倾 rx 不超过前臂翻起的上限')
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
