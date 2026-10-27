// 猎犬（Entity 8）重制·阶段 3：机制验收（模拟引擎 + 真实模型）
// npm run check:hound
//   编组包抄站位 / 嚎叫搜寻期 / 躲出视线后徘徊 / pin 扑倒与挣脱（连按、手电、自己打、联机同伴、超时）/ 前爪落点 /
//   直视角度判定 / 手电与暗处 / 尸体认领、拖走与进食（警觉降低）/ LOD 三档切换与低骨数毛发替身 / stalk 步幅 / 三形态差异
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'
import { makeEntity, type Entity } from '../src/game/entities'
import {
  HD, beginHoundFrame, initHound, updateHound, houndHear, provokeHound, houndControlsPlayer, houndPinner, houndPinProgress, houndSpecial,
  houndHeadPos, houndGazeAngle, houndGazeEval, houndGazeCone, houndGazeLimit, releaseHoundPin, houndPinOverlay, PIN_BITE_FLASH,
} from '../src/game/engine/houndAI'

let fails = 0, passes = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (c) passes++; else fails++ }
const f2 = (v: number) => v.toFixed(2)

type V3 = { x: number; y: number; z: number }
function world(levelId = 2, o: { lit?: boolean } = {}) {
  const msgs: string[] = []
  const eng: any = {
    levelDef: { id: levelId },
    player: { x: 0, y: 0, z: 0, hp: 100, stamina: 100, sanity: 100, slowT: 0, crouching: false, flashlight: false, battery: 100, facing: 0 },
    playerNoiseT: 0, map: { entities: [] as Entity[], items: [] as any[], inf: { ox: 0, oy: 0 } }, projectiles: [] as any[],
    input: { sprint: false, attack: false, interact: false, jump: false }, specialHeld: false, applyingNet: false,
    dev: { invisible: false }, camShake: 0, hurt: 0, lit: o.lit ?? true,
    dir: { x: 0, y: 0, z: 1 } as V3, // 默认看天花板（不直视任何猎犬）
    msg: (t: string) => msgs.push(t),
    losFn: (_x0: number, _y0: number, _x1: number, _y1: number) => true,
    los(x0: number, y0: number, x1: number, y1: number) { return this.losFn(x0, y0, x1, y1) },
    crosshairRay() { const p = this.player; const eye = (houndPinner(this) ? HD.PIN_EYE : HD.EYE_H - (p.crouching ? HD.EYE_CROUCH : 0)); return { x: p.x, y: p.y, z: p.z + eye, dx: this.dir.x, dy: this.dir.y, dz: this.dir.z } },
    isLit() { return this.lit },
    lookingAt() { return false },
    viewAngle(x: number, y: number) { const a = Math.atan2(y - this.player.y, x - this.player.x), f = Math.atan2(this.dir.y, this.dir.x); let d = Math.abs(a - f); if (d > Math.PI) d = 2 * Math.PI - d; return Math.hypot(this.dir.x, this.dir.y) < 0.2 ? Math.PI : d },
    wanderTarget(e: Entity) { e.targetX = e.x + 1; e.targetY = e.y; e.stateT = 3 },
    stepEntity(e: Entity, sp: number, dt: number) { const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < 0.02) return true; const k = Math.min(d, sp * dt) / d; e.x += dx * k; e.y += dy * k; return false },
    faceToward(e: Entity, x: number, y: number) { e.facing = Math.atan2(y - e.y, x - e.x) },
    meleeZOk: () => true,
    hurtPlayer(dmg: number) { this.hurt += dmg; this.player.hp -= dmg },
  }
  const spawn = (x: number, y: number, form?: 'hound-hostile' | 'hound-neutral' | 'hound-ambusher') => { const e = makeEntity('hound', x, y, 0, form); eng.map.entities.push(e); initHound(eng, e); return e }
  const aimAt = (q: V3) => { const r = eng.crosshairRay(); const v = { x: q.x - r.x, y: q.y - r.y, z: q.z - r.z }, l = Math.hypot(v.x, v.y, v.z); eng.dir = { x: v.x / l, y: v.y / l, z: v.z / l } }
  const lookUp = () => { eng.dir = { x: 0, y: 0, z: 1 } }
  let T = 0
  /** 一帧：movement 钩子（被压住时接管）→ 实体（死亡计时同 entityAI）→ 猎犬 AI */
  const step = (dt = 1 / 30, each?: () => void) => {
    each?.(); T += dt
    houndControlsPlayer(eng)
    beginHoundFrame(eng, dt)
    for (const e of eng.map.entities as Entity[]) {
      if (e.dead) { e.deathT -= dt; continue }
      e.attackCd -= dt; e.stateT -= dt
      if (e.def.type === 'hound') updateHound(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y), 1, levelId === 3)
    }
    eng.map.entities = eng.map.entities.filter((e: Entity) => !e.dead || e.deathT > 0)
  }
  const run = (secs: number, each?: (t: number) => void) => { const t0 = T; while (T - t0 < secs) step(1 / 30, each ? () => each(T - t0) : undefined) }
  return { eng, msgs, spawn, step, run, aimAt, lookUp, time: () => T }
}

// ============================================================================
console.log('— 直视角度判定 —')
{
  const { eng, spawn, aimAt } = world()
  const e = spawn(5, 0); e.facing = Math.PI
  const head = houndHeadPos(e)
  ok(Math.abs(head.x - (5 - HD.HEAD.hostile.fwd)) < 1e-6 && Math.abs(head.z - HD.HEAD.hostile.z) < 0.02, `头部位置在身前 ${HD.HEAD.hostile.fwd} m、离地 ${f2(head.z)} m`)
  aimAt(head)
  let r = eng.crosshairRay(), g = houndGazeAngle(r, { x: r.dx, y: r.dy, z: r.dz }, head)
  ok(g.ang < 1e-6 && houndGazeEval(g.ang, g.dist, false, true).on, '准星正对头部 → 直视成立')
  { // 侧身站着的猎犬：准星落在它后半身上不算
    const side = spawn(3, 0); side.facing = Math.PI / 2
    aimAt({ x: 3, y: -0.45, z: 0.4 })
    const rr = eng.crosshairRay(), gg = houndGazeAngle(rr, { x: rr.dx, y: rr.dy, z: rr.dz }, houndHeadPos(side))
    ok(!houndGazeEval(gg.ang, gg.dist, false, true).on, `侧身时准星落在后半身（与头夹角 ${f2(gg.ang)} rad > 阈值 ${f2(houndGazeCone(gg.dist))}）→ 不算直视`)
    eng.map.entities.splice(eng.map.entities.indexOf(side), 1)
  }
  eng.dir = { x: Math.cos(0.3), y: Math.sin(0.3), z: -0.2 } // 只偏 0.3 rad（旧版 lookingAt 的 0.4 rad 水平锥内）
  r = eng.crosshairRay(); g = houndGazeAngle(r, { x: r.dx, y: r.dy, z: r.dz }, head)
  ok(!houndGazeEval(g.ang, g.dist, false, true).on, `准星偏到头旁 ${f2(g.ang)} rad（旧版会算直视）→ 不算`)
  // 近处要低头：水平视线在 2.5 m 外看不到脸
  const near = spawn(2.5, 0); near.facing = Math.PI
  eng.dir = { x: 1, y: 0, z: 0 }
  r = eng.crosshairRay(); g = houndGazeAngle(r, { x: r.dx, y: r.dy, z: r.dz }, houndHeadPos(near))
  ok(!houndGazeEval(g.ang, g.dist, false, true).on, `2.5 m 平视（夹角 ${f2(g.ang)}）→ 没对准脸`)
  aimAt(houndHeadPos(near)); r = eng.crosshairRay(); g = houndGazeAngle(r, { x: r.dx, y: r.dy, z: r.dz }, houndHeadPos(near))
  ok(houndGazeEval(g.ang, g.dist, false, true).on, '2.5 m 低头对准脸 → 直视成立')
  ok(houndGazeCone(2) > houndGazeCone(8) && houndGazeCone(8) > HD.GAZE_CONE, `阈值随距离收窄（2 m ${f2(houndGazeCone(2))} / 8 m ${f2(houndGazeCone(8))} rad）`)
}
console.log('— 手电加成 / 暗处减弱 —')
{
  const lit = houndGazeEval(0.05, 8, false, true), dark = houndGazeEval(0.05, 8, false, false), darkNear = houndGazeEval(0.05, 4, false, false)
  const flash = houndGazeEval(0.25, 12, true, false), flashOff = houndGazeEval(0.25, 12, false, true)
  ok(lit.on && lit.durK === 1, '明处 8 m 直视有效，时长 ×1')
  ok(!dark.on && darkNear.on && darkNear.dark && darkNear.durK === HD.DUR_DARK, `暗处只在 ${HD.GAZE_R_DARK} m 内有效、时长 ×${HD.DUR_DARK}`)
  ok(flash.on && flash.flash && flash.durK === HD.DUR_FLASH && !flashOff.on, `手电光锥照到脸：12 m、偏 0.25 rad 也有效（时长 ×${HD.DUR_FLASH}）；不开手电则无效`)
  // 实际威慑时长：明处 ≈4 s、手电 ≈6 s、暗处 ≈2.4 s（+0.4 s 起效延迟）
  const measure = (mode: 'lit' | 'flash' | 'dark') => {
    const W = world(1, { lit: mode !== 'dark' })
    const e = W.spawn(4.5, 0); e.hd!.howled = true; e.hd!.phase = 'stalk'; e.facing = Math.PI
    if (mode === 'flash') W.eng.player.flashlight = true
    let tCower = -1, tHab = -1
    W.run(12, (t) => { if (tHab < 0) W.aimAt(houndHeadPos(e)); else W.lookUp(); if (tCower < 0 && e.hd!.phase === 'cower') tCower = t; if (tHab < 0 && tCower >= 0 && e.hd!.gazeCd > 5) tHab = t })
    return { tCower, dur: tHab - tCower }
  }
  const mL = measure('lit'), mF = measure('flash'), mD = measure('dark')
  ok(mL.tCower < 0.1 && Math.abs(mL.dur - HD.GAZE_T) < 0.3, `明处：立即伏低，${f2(mL.dur)} s 后习惯目光`)
  ok(Math.abs(mF.dur - HD.GAZE_T * HD.DUR_FLASH) < 0.4, `手电照脸：威慑 ${f2(mF.dur)} s（≈6 s）`)
  ok(mD.tCower >= HD.TRIGGER_DARK - 0.05 && Math.abs(mD.dur - HD.GAZE_T * HD.DUR_DARK) < 0.3, `暗处：盯 ${f2(mD.tCower)} s 才伏低，威慑 ${f2(mD.dur)} s`)
  ok(houndGazeLimit(true, 1, false) === HD.GAZE_T + HD.GAZE_NOISE_T && houndGazeLimit(false, 1, true) === Infinity, '持续噪音延长到 6 s；高智能无时限')
}

console.log('— 群猎包抄 —')
{
  const W = world(1), { eng } = W
  const lead = W.spawn(5.5, 0), a = W.spawn(7.5, 1.5), b = W.spawn(8, -1.6)
  eng.losFn = (x0: number) => x0 < 6 || W.time() > 0.4 // 先只让 lead 看见玩家
  eng.dir = { x: 0.97, y: 0, z: 0.243 } // 面朝猎犬群、视线略高于它们的头（不触发直视）
  W.run(0.4)
  const P = lead.hd!.pack
  ok(P !== undefined && a.hd!.pack === P && b.hd!.pack === P, '三只就近编成一群')
  W.run(0.3)
  ok(lead.hd!.phase === 'howl' && lead.hd!.role === 'lead', '头犬嚎叫')
  ok(a.hd!.phase === 'flank' && b.hd!.phase === 'flank' && a.hd!.role === -b.hd!.role, `其余两只左右分开包抄（${a.hd!.role} / ${b.hd!.role}）`)
  let closeT = -1, leadMin = 99, leadMax = 0, snap: any = null, inViewFrames = 0, frames = 0
  const exitT: Record<number, number> = {}
  W.run(12, (t) => {
    const sp = lead.hd!.phase
    if (closeT < 0) {
      if (t > 2 && sp === 'stalk') { const d = Math.hypot(lead.x, lead.y); leadMin = Math.min(leadMin, d); leadMax = Math.max(leadMax, d) }
      for (const q of [a, b]) if (q.hd!.phase === 'flank') { const iv = eng.viewAngle(q.x, q.y) < HD.FLANK_VIEW; if (!iv && exitT[q.id] === undefined) exitT[q.id] = t; if (exitT[q.id] !== undefined) { frames++; if (iv) inViewFrames++ } }
      if ([lead, a, b].every((q) => q.hd!.phase === 'charge')) { closeT = t; snap = [lead, a, b].map((q) => ({ x: q.x, y: q.y, ready: q.hd!.flankReady })) }
    }
  })
  ok(closeT > 0 && closeT < HD.FLANK_MAX + 1.5, `两翼就位后全体收拢冲锋（${f2(closeT)} s）`)
  if (snap) {
    const ang = (q: { x: number; y: number }) => Math.atan2(q.y, q.x)
    const da = (u: number, v: number) => { let d = Math.abs(u - v); if (d > Math.PI) d = 2 * Math.PI - d; return d }
    const aL = ang(snap[0]), aA = ang(snap[1]), aB = ang(snap[2])
    ok(da(aA, aL) > 1.6 && da(aB, aL) > 1.6, `收拢时两翼在玩家两侧偏后（与头犬方位差 ${f2(da(aA, aL))} / ${f2(da(aB, aL))} rad > 1.6）`)
    ok(Math.sign(Math.sin(aA - aL)) !== Math.sign(Math.sin(aB - aL)), '两翼分处左右两侧')
    ok(snap[1].ready && snap[2].ready, '两翼都已就位')
  }
  ok(leadMin > HD.LEAD_HOLD - 1.6 && leadMax < HD.LEAD_HOLD + 2, `头犬在正面 ${f2(leadMin)}–${f2(leadMax)} m 处吸引（保持约 ${HD.LEAD_HOLD} m）`)
  ok(Object.keys(exitT).length === 2 && Math.max(...Object.values(exitT)) < 1.5 && inViewFrames === 0, `两翼 ${f2(Math.max(...Object.values(exitT)))} s 内横向绕出玩家正面视野（±${HD.FLANK_VIEW} rad），之后不再从正面进入`)
  ok(W.msgs.some((m) => m.includes('分头绕到你身边')), '提示：分头包抄')
}

console.log('— 嚎叫搜寻期 / 躲出视线后徘徊 —')
{
  const W = world(1), { eng } = W
  const a = W.spawn(5, 0), far = W.spawn(18, 12) // 不在同一群（> PACK_R）
  eng.losFn = (x0: number, y0: number) => !(x0 > 10 || y0 > 6) // far 看不见玩家
  W.run(0.3)
  ok(far.hd!.phase === 'search' && far.hd!.pack !== a.hd!.pack, '远处同类听到嚎叫进入搜寻')
  const src = { x: a.hd!.lastX, y: a.hd!.lastY }
  eng.dev.invisible = true // 玩家藏好：之后谁也看不见
  let arrive = -1, maxR = 0
  W.run(HD.SEARCH_T + 2, (t) => { const d = Math.hypot(far.x - (far.hd!.cx ?? src.x), far.y - (far.hd!.cy ?? src.y)); if (far.hd!.cx !== undefined) { if (arrive < 0) arrive = t; maxR = Math.max(maxR, d) } })
  ok(arrive > 0, `搜寻者朝嚎叫声源前去（${f2(arrive)} s 到达）`)
  ok(maxR <= HD.SEARCH_R + 0.6, `到达后在声源附近 ${f2(maxR)} m 内嗅探（≤ ${HD.SEARCH_R}）`)
  ok(far.hd!.phase === 'roam', '搜寻期结束回到游荡')
}
{
  const W = world(1), { eng } = W
  const e = W.spawn(5, 0); e.hd!.howled = true; e.hd!.phase = 'stalk'
  W.run(0.5)
  eng.player.x = -3; eng.player.y = 4 // 玩家躲到拐角后
  const last = { x: 0, y: 0 }
  eng.losFn = () => false
  let lingerAt = -1, maxR = 0, stayed = 0
  W.run(HD.LOST_CHARGE + HD.LINGER_T + 6, (t) => {
    if (e.hd!.phase === 'linger') { if (lingerAt < 0) lingerAt = t; if (e.hd!.cx !== undefined) { maxR = Math.max(maxR, Math.hypot(e.x - last.x, e.y - last.y)); stayed += 1 / 30 } }
  })
  ok(lingerAt > HD.LOST_STALK - 0.2 && lingerAt < HD.LOST_CHARGE + 0.5, `失去视线 ${f2(lingerAt)} s 后转入徘徊（潜行 ${HD.LOST_STALK} s / 冲锋 ${HD.LOST_CHARGE} s）`)
  ok(maxR < HD.LINGER_R + 0.6 && stayed > HD.LINGER_T - 1, `在最后看到玩家的位置 ${f2(maxR)} m 内徘徊 ${f2(stayed)} s`)
  ok(e.hd!.phase === 'roam', '徘徊结束后游荡离开')
}

console.log('— 扑倒压制与挣脱 —')
const pounce = (W: ReturnType<typeof world>, e: Entity) => { e.hd!.howled = true; e.hd!.phase = 'charge'; let t = 0; while (!houndPinner(W.eng) && t < 4) { W.step(); t += 1 / 30 } return t }
{
  const W = world(1), { eng } = W
  const e = W.spawn(3, 0)
  const tp = pounce(W, e)
  ok(houndPinner(eng) === e && e.hd!.phase === 'pin', `冲锋扑中 → 压倒（${f2(tp)} s）`)
  ok(houndControlsPlayer(eng) === true, '被压住时 movement 由猎犬接管（不能移动）')
  ok(houndSpecial(eng)?.label === '挣脱' && houndSpecial(eng)?.hold === false, '特殊交互键 / 移动端情境按钮显示「挣脱」（点按）')
  const r = eng.crosshairRay(); ok(Math.abs(r.z - HD.PIN_EYE) < 1e-6, `视角压低到 ${HD.PIN_EYE} m`)
  const hp0 = eng.player.hp; W.run(2.05)
  ok(Math.abs((hp0 - eng.player.hp) - 2 * HD.PIN_BITE) < 0.01, `每秒撕咬 ${HD.PIN_BITE}（2 s 掉 ${hp0 - eng.player.hp}）`)
  ok(Math.abs(Math.hypot(e.x, e.y) - HD.PIN_OFF) < 0.05, `猎犬压在玩家身上（中心距 ${f2(Math.hypot(e.x, e.y))} m）`)
  // 连按交互键挣脱
  let presses = 0, tt = 0
  while (houndPinner(eng) && tt < 3) { W.step(1 / 30, () => { const on = Math.floor(tt * 12) % 2 === 0; if (on && !eng.input.interact) presses++; eng.input.interact = on }); tt += 1 / 30 }
  eng.input.interact = false
  ok(!houndPinner(eng) && presses >= HD.PIN_NEED && presses <= HD.PIN_NEED + 2, `连按 ${presses} 下挣脱`)
  ok(e.hd!.phase === 'stagger', `挣脱后猎犬硬直（${e.hd!.phase}）`)
  let restrike = false
  W.run(HD.STAGGER_T - 0.1, () => { if (e.hd!.strikeT !== undefined || houndPinner(eng)) restrike = true })
  ok(!restrike, `硬直 ${HD.STAGGER_T} s 期间不会再扑`)
  const tr = pounce(W, e)
  ok(tr > HD.STAGGER_T, `${f2(tr)} s 内不会立刻再次压倒（REPIN_CD ${HD.REPIN_CD} s）`)
}
{
  const W = world(1), { eng } = W, e = W.spawn(3, 0)
  pounce(W, e)
  eng.player.flashlight = true
  let freed = -1
  W.run(HD.PIN_MAX, (t) => { if (houndPinner(eng)) W.aimAt(houndHeadPos(e)); else if (freed < 0) freed = t })
  ok(freed > 0 && freed < HD.PIN_MAX - 0.3, `手电照脸不按键也能挣脱（${f2(freed)} s）`)
}
{
  const W = world(1), { eng } = W, e = W.spawn(3, 0)
  pounce(W, e); W.run(0.2)
  e.hp -= 4; provokeHound(eng, e); W.step()
  ok(houndPinProgress(eng) > 0.3, `自己打中它也算挣扎（进度 ${f2(houndPinProgress(eng))}）`)
  eng.applyingNet = true; e.hp -= 4; provokeHound(eng, e); eng.applyingNet = false
  ok(!houndPinner(eng) && e.hd!.phase === 'stagger', '联机同伴的攻击（房主结算 entHit）直接解救被压住的玩家')
}
{
  const W = world(1), { eng } = W, e = W.spawn(3, 0)
  pounce(W, e)
  const hp0 = eng.player.hp
  W.run(HD.PIN_MAX + 0.5)
  ok(!houndPinner(eng) && hp0 - eng.player.hp <= HD.PIN_BITE * (HD.PIN_MAX + 1), `不挣扎最多压 ${HD.PIN_MAX} s（掉 ${hp0 - eng.player.hp}）后松口`)
}
{
  const W = world(1), { eng } = W, e = W.spawn(3, 0), q = W.spawn(4, 2.5)
  q.hd!.howled = true; q.hd!.phase = 'charge'
  pounce(W, e)
  let minD = 99
  W.run(0.8); W.run(2, () => { minD = Math.min(minD, Math.hypot(q.x, q.y)) })
  ok(houndPinner(eng) === e && minD > HD.PIN_RING - 0.4, `同伴压住时其余猎犬在外圈等（最近 ${f2(minD)} m）`)
  releaseHoundPin(eng, 'drop')
}
console.log('— 挣脱进度条 HUD（houndPinOverlay） —')
{
  const W = world(1), { eng } = W, e = W.spawn(3, 0)
  ok(houndPinOverlay(eng) === null, '没被压住时 HUD 快照为 null（进度条不显示）')
  pounce(W, e)
  let o = houndPinOverlay(eng)!
  ok(!!o && o.need === HD.PIN_NEED && o.max === HD.PIN_MAX && o.kind === 'hostile', `被压住时显示：需要 ${o?.need} 下、最长 ${o?.max} s`)
  ok(o.bite > 0.5, `扑中那一下就红闪（bite ${f2(o.bite)}）`)
  let inRange = true, maxP = 0
  const chk = () => { const q = houndPinOverlay(eng); if (q) { if (!(q.progress >= 0 && q.progress <= 1) || Math.abs(q.progress - houndPinProgress(eng)) > 1e-9) inRange = false; maxP = Math.max(maxP, q.progress) } }
  // 按 3 下：进度上升
  const p0 = houndPinOverlay(eng)!.progress
  let tt = 0
  while (tt < 0.45) { W.step(1 / 30, () => { eng.input.interact = Math.floor(tt * 12) % 2 === 0 }); chk(); tt += 1 / 30 }
  eng.input.interact = false; W.step(); chk()
  const p1 = houndPinOverlay(eng)!.progress
  ok(p1 > p0 + 2 / HD.PIN_NEED - 0.05, `按键后进度上升（${f2(p0)} → ${f2(p1)}）`)
  // 松手 1 s：按 PIN_DECAY 衰减，且逐帧单调下降（平滑）
  let mono = true, prev = p1, sawBite = 0
  W.run(1, () => { const q = houndPinOverlay(eng); if (q) { if (q.progress > prev + 1e-9) mono = false; prev = q.progress; sawBite = Math.max(sawBite, q.bite) } chk() })
  const p2 = houndPinOverlay(eng)!.progress
  ok(p2 < p1 && Math.abs((p1 - p2) * HD.PIN_NEED - HD.PIN_DECAY) < 0.1 && mono, `松手后逐帧衰减（1 s 内 ${f2(p1)} → ${f2(p2)}，≈ ${HD.PIN_DECAY}/s）`)
  ok(sawBite > 0.8, `每秒撕咬时红闪（峰值 ${f2(sawBite)}，${PIN_BITE_FLASH} s 内消退）`)
  const left = houndPinOverlay(eng)!.left
  ok(left > 0 && left < HD.PIN_MAX && Math.abs(left - (HD.PIN_MAX - e.hd!.pinT!)) < 1e-6, `剩余压制时间倒数（${f2(left)} s）`)
  // 连按到挣脱：进度一直在 0..1，挣脱后隐藏
  tt = 0
  while (houndPinner(eng) && tt < 3) { W.step(1 / 30, () => { eng.input.attack = Math.floor(tt * 12) % 2 === 0 }); chk(); tt += 1 / 30 }
  eng.input.attack = false
  ok(inRange, `整个压制期间进度都在 0..1 且与 houndPinProgress 一致（最高 ${f2(maxP)}）`)
  ok(!houndPinner(eng) && houndPinOverlay(eng) === null && houndPinProgress(eng) === 0, '挣脱成功后进度条隐藏、进度归零')
}
{
  const W = world(1), { eng } = W, e = W.spawn(3, 0)
  pounce(W, e)
  W.run(HD.PIN_MAX + 0.3)
  ok(!houndPinner(eng) && houndPinOverlay(eng) === null, `压满 ${HD.PIN_MAX} s 松口后进度条隐藏`)
  const W2 = world(1), e2 = W2.spawn(3, 0)
  pounce(W2, e2); W2.eng.player.flashlight = true; W2.aimAt(houndHeadPos(e2)); W2.step()
  ok(houndPinOverlay(W2.eng)?.flash === true, 'HUD 标出手电正照着它的脸')
  e2.hp = 0; e2.dead = true; W2.step()
  ok(houndPinOverlay(W2.eng) === null, '压人的猎犬死了 → 进度条隐藏')
}
{ // HUD 组件：服务端渲染一遍（桌面 / 移动端提示、移动端宽度让开「挣脱」按钮、没被压住时不渲染）
  // react-dom/server 是 CJS（内部 require('util')），不能打进 esm 包：运行时从 node_modules 直接 require
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  const { renderToStaticMarkup } = req('react-dom/server') as typeof import('react-dom/server')
  const React = req('react') as typeof import('react')
  Object.assign(globalThis, { React }) // esbuild 按经典 JSX 编 .tsx（React.createElement），测试里补一个全局 React
  const { default: HoundPinHud, houndPinHint, HOUND_PIN_TOUCH_GUTTER, HOUND_PIN_BAR_W } = await import('../src/components/houndPinHud')
  const W = world(1), e = W.spawn(3, 0)
  ok(renderToStaticMarkup(React.createElement(HoundPinHud, { engine: W.eng, isMobile: false })) === '', 'HUD 组件：没被压住时不渲染')
  pounce(W, e)
  const desk = renderToStaticMarkup(React.createElement(HoundPinHud, { engine: W.eng, isMobile: false }))
  const mob = renderToStaticMarkup(React.createElement(HoundPinHud, { engine: W.eng, isMobile: true }))
  ok(desk.includes('data-hound-pin=') && desk.includes('hud-bar-track') && desk.includes('压制 ') && /连按 E \/ 左键 \/ 空格 \/ X 挣脱/.test(houndPinHint(false)), `桌面：${houndPinHint(false)}`)
  ok(mob.includes('「挣脱」') && mob.includes(`${HOUND_PIN_TOUCH_GUTTER}px`), `移动端：${houndPinHint(true)}；宽度 min(${HOUND_PIN_BAR_W}px, 100vw − 2×(安全区 + ${HOUND_PIN_TOUCH_GUTTER}px))`)
  // 移动端「挣脱」按钮：距屏幕边 22 px、宽 64 px（TouchControls）；常见竖屏宽度下进度条两端都不进按钮的横向范围
  let clear = true
  for (const vw of [320, 360, 375, 390, 414, 768]) { const w = Math.min(HOUND_PIN_BAR_W, vw - 2 * HOUND_PIN_TOUCH_GUTTER); if ((vw + w) / 2 > vw - 22 - 64 - 8 || w < 100) clear = false }
  ok(clear, '移动端进度条与右下（左手模式左下）「挣脱」按钮横向不重叠（320–768 px）')
  // 第一人称实机截图（verify-hound-fp）：面板原在 64% 正好压住张开的嘴，下面还叠一行重复的「【X】挣脱」特殊交互提示
  const { HOUND_PIN_BAR_TOP } = await import('../src/components/houndPinHud')
  const hudSrc = (await import('node:fs')).readFileSync(new URL('../src/components/HUD.tsx', import.meta.url), 'utf8')
  ok(desk.includes(`top:${HOUND_PIN_BAR_TOP}`) && mob.includes('top:64%') && /sa\.id !== 'houndPin'.*data-special-prompt/.test(hudSrc),
    `桌面面板下移到 ${HOUND_PIN_BAR_TOP}（让出嘴和牙），压制时不再叠「【X】挣脱」特殊交互提示（面板已列出 X）；移动端保持 64%`)
}
console.log('— 前爪落点按玩家实际位置 —')
Object.assign(globalThis, { document: { createElement: () => createCanvas(256, 256) } })
const { buildHoundMesh } = await import('../src/game/renderer/houndMesh')
const { animateHound, houndLodTier, houndActiveBones, buildFurProxy, HOUND_CLIPS, sampleHoundPose, houndStrideK, HOUND_PIN_CHEST_FWD } = await import('../src/game/renderer/houndAnim')
{
  for (const off of [HD.PIN_OFF, HD.PIN_OFF + 0.2, HD.PIN_OFF - 0.12]) {
    const grp = buildHoundMesh(false, 3, 'hostile'); const e = makeEntity('hound', 0, 0, 0); const W = world(1); initHound(W.eng, e)
    e.hd!.phase = 'pin'; e.facing = 0.6
    const px = Math.cos(e.facing) * off, py = Math.sin(e.facing) * off
    grp.rotation.y = -e.facing
    for (let i = 0; i < 20; i++) animateHound(grp, e, i / 30, 0, { dist: off, px, py })
    grp.updateMatrixWorld(true)
    const r = grp.userData.houndRig
    const fronts = r.legs.filter((L: any) => L.front).map((L: any) => L.paw.getWorldPosition(new THREE.Vector3()))
    // 世界：three x = 游戏 x，three z = 游戏 y
    const fwd = fronts.map((v: THREE.Vector3) => v.x * Math.cos(e.facing) + v.z * Math.sin(e.facing))
    const err = Math.max(...fwd.map((f: number) => Math.abs(f - (off - HOUND_PIN_CHEST_FWD))))
    ok(err < 0.12 && fronts.every((v: THREE.Vector3) => v.y > 0.06 && v.y < 0.3), `玩家在 ${off} m：前爪落在胸口（前向误差 ${(err * 100).toFixed(1)} cm，高 ${fronts.map((v: THREE.Vector3) => (v.y * 100).toFixed(0)).join('/')} cm）`)
  }
}

console.log('— 第一人称压倒镜头（镜头 = 玩家头部，眼高 PIN_EYE）—')
{
  // 按 AI 的撕咬节拍（每 1 s 一口）跑 2 s：脸（双眼）、嘴、头发、前爪指趾到镜头的距离；镜头上仰后脸在画面里
  for (const kind of ['hostile', 'ambusher'] as const) {
    const grp = buildHoundMesh(false, 3, kind); const e = makeEntity('hound', 0, 0, 0, `hound-${kind}`); const W = world(kind === 'ambusher' ? 3 : 1); initHound(W.eng, e)
    const off = kind === 'ambusher' ? HD.PIN_OFF_L3 : HD.PIN_OFF
    e.hd!.phase = 'pin'; e.facing = 0
    const cam = new THREE.Vector3(off, HD.PIN_EYE, 0), v = new THREE.Vector3()
    let skin: any, hair: any; grp.traverse((m: any) => { if (m.isSkinnedMesh) { if (!skin) skin = m; else hair = m } })
    const r = grp.userData.houndRig, bones = skin.skeleton.bones, headB = new Set([r.head, r.jaw, r.earL, r.earR].map((b: any) => bones.indexOf(b)))
    const si = skin.geometry.getAttribute('skinIndex'), sw = skin.geometry.getAttribute('skinWeight')
    let eyes: any; grp.traverse((m: any) => { if (m.name === 'eyes') eyes = m })
    let faceMin = 9, faceMax = 0, faceIdle = 0, faceBite = 9, mouth = 9, hairD = 9, finger = 9, body = 9, upMin = 9, upMax = -9, headErr = 0, headIdle = 0
    for (let i = 0; i <= 60; i++) {
      const t = i / 30
      e.hd!.pinT = t; e.hd!.biteAt = Math.floor(t); e.hd!.biteT = 1 - (t - Math.floor(t))
      grp.updateMatrixWorld(true); animateHound(grp, e, t, 0, { dist: off, px: off, py: 0 }); grp.updateMatrixWorld(true)
      const ec = new THREE.Box3().setFromObject(eyes).getCenter(new THREE.Vector3()), fd = ec.distanceTo(cam), since = t - Math.floor(t)
      faceMin = Math.min(faceMin, fd); faceMax = Math.max(faceMax, fd)
      if (since > 0.5 && since < 0.7) faceIdle = Math.max(faceIdle, fd)
      if (since > 0.08 && since < 0.2) faceBite = Math.min(faceBite, fd)
      const up = Math.atan2(ec.y - HD.PIN_EYE, off - ec.x); upMin = Math.min(upMin, up); upMax = Math.max(upMax, up)
      const hp = houndHeadPos(e), he = Math.hypot(hp.x - ec.x, hp.z - ec.y); headErr = Math.max(headErr, he); if (since > 0.4 && since < 0.7) headIdle = Math.max(headIdle, he)
      for (let n = 0; n < si.count; n += 2) { skin.getVertexPosition(n, v); v.applyMatrix4(skin.matrixWorld); const d = v.distanceTo(cam); if (headB.has(si.getX(n)) && sw.getX(n) > 0.5) mouth = Math.min(mouth, d); else body = Math.min(body, d) }
      const hpA = hair.geometry.getAttribute('position'); for (let n = 0; n < hpA.count; n += 2) { hair.getVertexPosition(n, v); v.applyMatrix4(hair.matrixWorld); hairD = Math.min(hairD, v.distanceTo(cam)) }
      grp.traverse((m: any) => { if (!m.isMesh || m.isSkinnedMesh || m === eyes || m.name === 'drool') return; const p = m.geometry.getAttribute('position'); for (let n = 0; n < p.count; n += 3) { v.fromBufferAttribute(p, n).applyMatrix4(m.matrixWorld); finger = Math.min(finger, v.distanceTo(cam)) } })
    }
    const c = (x: number) => (x * 100).toFixed(0)
    ok(faceMin >= 0.33 && faceMax <= 0.62, `${kind}：脸（双眼）离镜头 ${c(faceMin)}–${c(faceMax)} cm（0.35–0.6 m 左右）`)
    ok(faceBite < faceIdle - 0.05, `${kind}：咬的那一下往前探（${c(faceIdle)} → ${c(faceBite)} cm）`)
    ok(mouth > 0.14 && body > 0.25 && finger > 0.18, `${kind}：不穿进镜头（近裁剪面 5 cm）——嘴 / 头 ≥ ${c(mouth)} cm，躯干 / 四肢 ≥ ${c(body)} cm，指爪 ≥ ${c(finger)} cm`)
    ok(hairD > 0.25, `${kind}：头发离镜头 ≥ ${c(hairD)} cm（掀起刘海，不整片糊在屏幕上）`)
    const half = 36 * Math.PI / 180 // 竖直半视角（fov 72°）
    ok(upMin > HD.PIN_LOOK_UP - half + 0.12 && upMax < HD.PIN_LOOK_UP + half - 0.12, `${kind}：镜头上仰 ${(HD.PIN_LOOK_UP * 57.3).toFixed(0)}° 后脸在画面里（仰角 ${(upMin * 57.3).toFixed(0)}–${(upMax * 57.3).toFixed(0)}°）`)
    ok(headIdle < 0.1 && headErr < 0.2, `${kind}：AI 的压人头部位置（直视 / 手电判定）与模型双眼相差 ${c(headIdle)} cm（撕咬蓄力 / 前探时 ${c(headErr)} cm）`)
  }
}

console.log('— 第一人称实机复查（verify-hound-fp 四个时刻）—')
{
  // ① 扑中瞬间：扑击前摇 0.3 s（pounce 片段）→ pin，淡入期间脸 / 吻部不能贴到镜头上（实机旧版前 3 帧只看到头顶和耳朵）
  // ② 压住 / 蓄力 / 撕咬：吻部轴线对着镜头（不露下巴底、不只给头顶），平时半张嘴、蓄力才大张
  for (const kind of ['hostile', 'ambusher'] as const) {
    const grp = buildHoundMesh(false, 3, kind); const e = makeEntity('hound', 0, 0, 0, `hound-${kind}`); const W = world(kind === 'ambusher' ? 3 : 1); initHound(W.eng, e)
    const off = kind === 'ambusher' ? HD.PIN_OFF_L3 : HD.PIN_OFF, cam = new THREE.Vector3(off, HD.PIN_EYE, 0), v = new THREE.Vector3()
    let eyes: any, skin: any; grp.traverse((m: any) => { if (m.name === 'eyes') eyes = m; if (m.isSkinnedMesh && !skin) skin = m })
    const r = grp.userData.houndRig, bones = skin.skeleton.bones, headB = new Set([r.head, r.jaw].map((b: any) => bones.indexOf(b))), si = skin.geometry.getAttribute('skinIndex')
    e.facing = 0; e.hd!.phase = 'charge'; e.hd!.strikeT = HD.STRIKE_WIND
    let t = 0
    for (; t < HD.STRIKE_WIND; t += 1 / 30) animateHound(grp, e, t, 0, { dist: off })
    e.hd!.strikeT = undefined; e.hd!.phase = 'pin'; e.hd!.pinT = 0; e.hd!.biteAt = 0; e.hd!.biteT = HD.PIN_BITE_GAP
    e.hd!.jaw = 1 // 与游戏一致：AI 在 pin 时把 s.jaw 拉到 1（不能把嘴撑成常开）
    let entry = 9, entryHead = 9, angMax = 0, angWind = 0, angBite = 0, jawIdle = 0, jawWind = 0, jawLunge = 9
    for (let i = 0; i <= 75; i++, t += 1 / 30) {
      const pt = i / 30; e.hd!.pinT = pt
      const bt = Math.floor(pt); e.hd!.biteAt = bt; e.hd!.biteT = HD.PIN_BITE_GAP - (pt - bt)
      animateHound(grp, e, t, 0, { dist: off, px: off, py: 0 }); grp.updateMatrixWorld(true)
      const ec = new THREE.Box3().setFromObject(eyes).getCenter(new THREE.Vector3())
      if (pt <= 0.3) {
        entry = Math.min(entry, ec.distanceTo(cam))
        for (let n = 0; n < si.count; n += 3) if (headB.has(si.getX(n))) { skin.getVertexPosition(n, v); v.applyMatrix4(skin.matrixWorld); entryHead = Math.min(entryHead, v.distanceTo(cam)) }
      }
      if (pt < 0.3) continue // 淡入完成后再量朝向
      const ang = new THREE.Vector3(1, 0, 0).applyQuaternion(r.head.getWorldQuaternion(new THREE.Quaternion())).angleTo(cam.clone().sub(ec))
      const since = pt - bt, until = HD.PIN_BITE_GAP - since, jaw = -r.jaw.rotation.z
      if (since < 0.42) angBite = Math.max(angBite, ang); else angMax = Math.max(angMax, ang) // 撕咬那一下有甩头，单独放宽
      if (until < 0.15) { angWind = Math.max(angWind, ang); jawWind = Math.max(jawWind, jaw) }
      if (since > 0.45 && until > 0.3) jawIdle = Math.max(jawIdle, jaw)
      if (since > 0 && since < 0.06) jawLunge = Math.min(jawLunge, jaw)
    }
    const c = (x: number) => (x * 100).toFixed(0), dg = (x: number) => (x * 57.3).toFixed(0)
    ok(entry > 0.3 && entryHead > 0.16, `${kind}：扑中瞬间（扑击前摇 → 压住淡入 0.3 s 内）双眼离镜头 ≥ ${c(entry)} cm、头 / 嘴 ≥ ${c(entryHead)} cm（不贴脸）`)
    ok(angMax < 0.4 && angWind < 0.45 && angBite < 0.85, `${kind}：压住时吻部对着镜头（偏差 ≤ ${dg(angMax)}°，蓄力 ${dg(angWind)}°，撕咬甩头 ${dg(angBite)}°；不露下巴底）`)
    ok(jawIdle < 0.3 && jawWind > jawIdle + 0.1 && jawLunge > jawIdle + 0.1, `${kind}：平时半张嘴龇牙（下颌 ≤ ${dg(jawIdle)}°，AI s.jaw=1 时也一样），蓄力大张（${dg(jawWind)}°），扑咬头 0.06 s 仍张着（≥ ${dg(jawLunge)}°）`)
  }
  // ① 扑中瞬间（AI）：前冲停在压人距离，扑中那一帧就在 PIN_OFF（原来冲到玩家脚下 0.3–0.5 m，头盖在镜头上）
  for (const [lvl, form, off] of [[1, 'hound-hostile', HD.PIN_OFF], [3, 'hound-ambusher', HD.PIN_OFF_L3]] as const) {
    const W = world(lvl), { eng } = W, e = W.spawn(3.2, 0, form)
    e.hd!.howled = true; e.hd!.phase = 'charge'
    let dMin = 9, t = 0
    while (!houndPinner(eng) && t < 4) { W.step(); t += 1 / 30; dMin = Math.min(dMin, Math.hypot(e.x, e.y)) }
    const d = Math.hypot(e.x, e.y)
    ok(houndPinner(eng) === e && Math.abs(d - off) < 0.08 && dMin > off - 0.08, `${form.slice(6)}：扑中那一帧就在压人距离 ${f2(d)} m（${off}），前冲最近 ${f2(dMin)} m，不冲过头`)
  }
  // ④ 挣脱成功：猎犬被掀开，0.3 s 内就退离胸口（硬直的后退初速 + 衰减），截图里看得到整只踉跄的猎犬
  {
    const W = world(1), { eng } = W, e = W.spawn(3, 0)
    pounce(W, e)
    let tt = 0
    while (houndPinner(eng) && tt < 3) { W.step(1 / 30, () => { eng.input.interact = Math.floor(tt * 12) % 2 === 0 }); tt += 1 / 30 }
    eng.input.interact = false
    // 与游戏引擎一致：stepEntity 把朝向拧到移动方向（entityAI.stepEntity）
    const step0 = eng.stepEntity.bind(eng); eng.stepEntity = (en: Entity, sp: number, dt: number) => { const dx = en.targetX - en.x, dy = en.targetY - en.y; if (Math.hypot(dx, dy) > 0.02) en.facing = Math.atan2(dy, dx); return step0(en, sp, dt) }
    let faceErr = 0
    const d0 = Math.hypot(e.x, e.y), ph0 = e.hd!.phase; W.run(0.3, () => { faceErr = Math.max(faceErr, Math.abs(Math.atan2(Math.sin(Math.atan2(-e.y, -e.x) - e.facing), Math.cos(Math.atan2(-e.y, -e.x) - e.facing)))) }); const d1 = Math.hypot(e.x, e.y); W.run(HD.STAGGER_T - 0.4); const d2 = Math.hypot(e.x, e.y)
    eng.stepEntity = step0
    ok(faceErr < 0.35, `硬直后退时一直面朝玩家（引擎 stepEntity 拧朝向也不侧身，最大偏 ${(faceErr * 57.3).toFixed(0)}°）`)
    ok(ph0 === 'stagger' && d1 - d0 > 0.35 && d2 - d0 < 2.2, `挣脱后被掀开：0.3 s 退开 ${f2(d1 - d0)} m，整段硬直共退 ${f2(d2 - d0)} m`)
    const rs = (await import('node:fs')).readFileSync(new URL('../src/game/renderer/renderer.ts', import.meta.url), 'utf8')
    ok(/houndLookT = 0\.6/.test(rs) && /phase !== 'stagger'/.test(rs) && /look\.pitch \+= \(wantP - look\.pitch\)/.test(rs), '起身时视线低头跟着硬直后退的猎犬（renderer houndLookT 0.6 s）')
  }
}

console.log('— 尸体：认领 / 拖走 / 进食 / 警觉降低 —')
{
  const W = world(1), { eng } = W
  eng.player.x = -6
  const h = W.spawn(4, 0)
  eng.dev.invisible = true; W.run(0.5); eng.dev.invisible = false
  const rat = makeEntity('corpserat', 7, 1, 0); eng.map.entities.push(rat); rat.hp = 0; rat.dead = true; rat.deathT = 1.4
  eng.losFn = () => false
  W.run(1)
  ok(h.hd!.phase === 'feed' && h.hd!.corpse === rat, '附近刚死的尸鼠被猎犬认领')
  eng.player.x = 7 - 5.5; eng.player.y = 1; eng.losFn = () => true // 玩家在 5.5 m 外、看得见
  let dragged = false
  const x0 = rat.x
  W.run(HD.DRAG_T + 3, () => { if (h.hd!.phase === 'drag') dragged = true })
  ok(eng.map.entities.includes(rat) && rat.deathT > 0, `尸体在认领期间不会消失（${f2(W.time())} s）`)
  ok(dragged && Math.hypot(rat.x - eng.player.x, rat.y - eng.player.y) > 5.5 + 0.5 && rat.x !== x0, `玩家在旁：先把尸体拖开（拖到 ${f2(Math.hypot(rat.x - eng.player.x, rat.y - eng.player.y))} m 外）`)
  ok(h.hd!.phase === 'feed' && h.state === 'idle', '然后伏下进食')
  // 正常视距 6 m，进食时只有 ×0.35：在 3 m 多外慢慢走过去不会惊动它
  const hp0 = eng.player.hp
  const cx = rat.x, cy = rat.y
  W.run(3, (t) => { eng.player.x = cx - 3.2 + t * 0.4; eng.player.y = cy + 3.2 })
  ok(h.hd!.phase === 'feed' && eng.player.hp === hp0, `进食中玩家在 ${f2(Math.hypot(h.x - eng.player.x, h.y - eng.player.y))} m 处溜过去没被发现`)
  houndHear(eng, h, eng.player.x, eng.player.y, 6, false)
  ok(h.hd!.phase === 'feed', '进食中普通脚步声不会惊动')
  eng.player.x = h.x - 1.8; eng.player.y = h.y; W.step()
  ok(h.hd!.phase !== 'feed' && h.hd!.corpse === undefined, `靠近到 ${HD.FEED_NOTICE_R} m 内被发现（${h.hd!.phase}）`)
  W.run(2)
  ok(!eng.map.entities.includes(rat), '被放下的尸体按原计时消失')
}
{
  const W = world(1), { eng } = W
  eng.player.x = -20; eng.losFn = () => false
  const h = W.spawn(4, 0)
  const rat = makeEntity('corpserat', 6, 0, 0); eng.map.entities.push(rat); rat.hp = 0; rat.dead = true; rat.deathT = 1.4
  W.run(HD.FEED_T + 3)
  ok(!eng.map.entities.includes(rat) && h.hd!.phase !== 'feed' && (h.hd!.feedCd ?? 0) > 0, `啃完（${HD.FEED_T} s）后尸体消失，猎犬离开`)
  const W2 = world(1); W2.eng.player.x = -20; W2.eng.losFn = () => false
  const h2 = W2.spawn(4, 0); const rat2 = makeEntity('corpserat', 6, 0, 0); W2.eng.map.entities.push(rat2); rat2.hp = 0; rat2.dead = true; rat2.deathT = 1.4
  W2.run(1); houndHear(W2.eng, h2, h2.x - 3, h2.y, 12, true); W2.step()
  ok(h2.hd!.phase !== 'feed', '进食中附近狂奔会惊醒它')
}

console.log('— LOD 三档 —')
{
  ok(houndLodTier(5) === 0 && houndLodTier(15) === 1 && houndLodTier(30) === 2, `距离分档：<${HD.LOD1} m / <${HD.LOD2} m / 更远`)
  ok(houndLodTier(HD.LOD2 - 1, 2) === 2 && houndLodTier(HD.LOD1 - 1, 1) === 1 && houndLodTier(HD.LOD2 - 1, 1) === 1, `带 ${HD.LOD_HYST} m 回差，不来回抖`)
  const grp = buildHoundMesh(false, 5, 'hostile'); const e = makeEntity('hound', 0, 0, 0); const W = world(1); initHound(W.eng, e)
  const full = houndActiveBones(grp)
  const fur = grp.getObjectByName('houndHair') as THREE.SkinnedMesh
  e.state = 'chase'; e.hd!.phase = 'charge'
  let t = 0
  const anim = (dist: number, n = 6) => { for (let i = 0; i < n; i++) { e.animT += 0.15; t += 1 / 30; animateHound(grp, e, t, 0, { dist }) } }
  anim(5)
  const D = grp.userData.hdDyn
  const th0 = D.th.reduce((a: number, b: number) => a + Math.abs(b), 0)
  ok(grp.userData.hdLod.tier === 0 && th0 > 0, `近处（5 m）全量：二阶摆动在动（Σ|θ| ${th0.toFixed(4)}）`)
  anim(15)
  const th1 = D.th.reduce((a: number, b: number) => a + Math.abs(b), 0)
  anim(15); const th1b = D.th.reduce((a: number, b: number) => a + Math.abs(b), 0)
  ok(grp.userData.hdLod.tier === 1 && th1 === th1b, '中距（15 m）：停止二阶摆动')
  anim(30)
  const proxy = grp.getObjectByName('houndHairLod') as THREE.SkinnedMesh
  const far = houndActiveBones(grp)
  ok(grp.userData.hdLod.tier === 2 && !fur.visible && !!proxy?.visible, '远处（30 m）：毛发换成低骨数替身')
  ok(far < full * 0.2 && proxy.skeleton.bones.length <= 16, `场景图里的骨 ${full} → ${far}，替身只绑 ${proxy.skeleton.bones.length} 根锚骨（原 ${fur.skeleton.bones.length}）`)
  const rig = grp.userData.houndRig
  e.animT += 0.4; t += 1 / 30; const b0 = rig.body.position.y; animateHound(grp, e, t, 0, { dist: 30 }); const changed1 = rig.body.position.y !== b0
  e.animT += 0.4; t += 1 / 30; const b1 = rig.body.position.y; animateHound(grp, e, t, 0, { dist: 30 }); const changed2 = rig.body.position.y !== b1
  ok(changed1 !== changed2, `远处姿态隔帧更新（每 ${HD.LOD2_EVERY} 帧一次）`)
  let meshes = 0; grp.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) meshes++ })
  ok(meshes === 8, `远处可见网格仍是 ${meshes}（不增加绘制次数）`)
  anim(5)
  ok(grp.userData.hdLod.tier === 0 && fur.visible && !proxy.visible && houndActiveBones(grp) === full, '回到近处：发链挂回、毛发恢复')
  grp.updateMatrixWorld(true)
  ok(fur.skeleton.bones.every((b) => Number.isFinite(b.matrixWorld.elements[12])), '挂回后骨矩阵有效')
  // 替身蒙皮在发链静止时与原毛发重合
  const g2 = buildHoundMesh(false, 9, 'hostile'); const f2m = g2.getObjectByName('houndHair') as THREE.SkinnedMesh
  const rig2 = g2.userData.houndRig; rig2.body.rotation.z = 0.3; rig2.head.rotation.y = 0.5; rig2.tailChain[2].rotation.y = 0.4
  const locks = new Set<THREE.Object3D>(); for (const k of [...rig2.hair, ...rig2.mane]) for (const b of k.bones) locks.add(b)
  const px = buildFurProxy(f2m, locks); g2.add(px); g2.updateMatrixWorld(true)
  let maxErr = 0; const va = new THREE.Vector3(), vb = new THREE.Vector3(), n = f2m.geometry.getAttribute('position').count
  for (let i = 0; i < n; i += 37) { f2m.getVertexPosition(i, va); px.getVertexPosition(i, vb); maxErr = Math.max(maxErr, va.distanceTo(vb)) }
  ok(maxErr < 0.002, `低骨数替身与原毛发（发链静止姿态、躯干 / 头 / 尾转动后）顶点误差 ${(maxErr * 1000).toFixed(2)} mm`)
  // 压住玩家时保持全量
  e.hd!.phase = 'pin'; anim(30, 2); ok(grp.userData.hdLod.tier === 0, '压住玩家时不降档（前爪落点要精确）')
}

console.log('— stalk 速度与步态 —')
{
  const v = HD.STALK_K * 3.4, C = HOUND_CLIPS.stalk, k = houndStrideK('stalk', v)
  const freq = v / (C.stride! * k)
  ok(v < 1.7 && freq < 1.65, `stalk 降到 ${f2(v)} m/s（原 2.55），步幅 ×${f2(k)} = ${f2(C.stride! * k)} m，步频 ${f2(freq)} Hz（原 ${f2(2.55 / C.stride!)} Hz）`)
  // 步幅缩放后支撑脚仍锁地：按距离累加相位，逐帧比较支撑脚的世界位置
  const grp = buildHoundMesh(false, 2, 'hostile'), r = grp.userData.houndRig
  let ph = 0, dist = 0, slide = 0, prev: number[] | null = null, prevLock: number[] | null = null
  for (let i = 0; i < 90; i++) {
    const dd = v / 30; dist += dd; ph += dd / (C.stride! * k)
    const P = sampleHoundPose(r, 'stalk', ph * C.dur, k)
    const wx = P.feet.map((f) => f.x + dist)
    if (prev) P.feet.forEach((f, j) => { if (f.lock >= 1 && prevLock![j] >= 1) slide = Math.max(slide, Math.abs(wx[j] - prev![j])) })
    prev = wx; prevLock = P.feet.map((f) => f.lock)
  }
  ok(slide < 0.015, `步幅缩放后支撑脚滑动 ${(slide * 100).toFixed(2)} cm（≤1.5）`)
}

console.log('— 三形态差异 —')
{
  const W = world(11), { eng } = W
  const n = W.spawn(5, 0, 'hound-neutral'), n2 = W.spawn(6, 2, 'hound-neutral')
  W.run(6)
  ok(n.hd!.neutral && n.hd!.pack === undefined && n2.hd!.pack === undefined && !houndPinner(eng) && eng.hurt === 0, 'neutral：不编组、不扑倒、不攻击')
  const rat = makeEntity('corpserat', 6, -1, 0); eng.map.entities.push(rat); rat.hp = 0; rat.dead = true; rat.deathT = 1.4
  W.run(0.8); ok(n.hd!.phase !== 'feed' && n2.hd!.phase !== 'feed', 'neutral：不抢尸体')
  const W3 = world(3)
  const am = W3.spawn(4.5, 0, 'hound-ambusher'), am2 = W3.spawn(5, 1.5, 'hound-ambusher')
  W3.eng.dir = { x: -1, y: 0, z: 0 } // 背对
  W3.run(0.2)
  ok(am.hd!.pack === undefined && am2.hd!.pack === undefined, 'ambusher：单独伏击，不编组')
  let t = 0; while (!houndPinner(W3.eng) && t < 4) { W3.step(); t += 1 / 30 }
  const pinner = houndPinner(W3.eng)
  ok(!!pinner && pinner.def.houndKind === 'ambusher', 'ambusher：背对时扑上来压倒')
  let presses = 0
  W3.run(2, (tt) => { if (!houndPinner(W3.eng)) return; const on = Math.floor(tt * 16) % 2 === 0; if (on && !W3.eng.input.attack) presses++; W3.eng.input.attack = on })
  ok(!houndPinner(W3.eng) && presses >= HD.PIN_NEED_L3, `ambusher：要连按 ${presses} 下（≥${HD.PIN_NEED_L3}）才能挣脱`)
  const W4 = world(2), h = W4.spawn(12, 0), h2 = W4.spawn(13, 1)
  W4.eng.dev.invisible = true; W4.run(0.3)
  ok(h.hd!.pack !== undefined && h.hd!.pack === h2.hd!.pack, 'hostile：就近编组')
}

console.log('— 图鉴 —')
{
  const { ENTITIES } = await import('../src/game/entities')
  const c = ENTITIES.hound.codex!
  const lore = c.lore.join('\n')
  ok(lore.includes('蜂巢') && lore.includes('幼犬'), '图鉴档案写入蜂巢卵与幼犬（不建模）')
  ok(['包抄', '扑倒', '尸体', '脸', '徘徊'].every((k) => c.behavior.includes(k)) && ['挣脱', '手电', '两侧', '最后出现'].every((k) => c.counter.includes(k)), '行为 / 应对写入群猎、扑倒挣脱、尸体、直视对准脸、徘徊等提示')
}

if (fails) { console.error(`\n${fails} 项未通过（${passes} 通过）`); process.exit(1) }
console.log(`\ncheck:hound 全部通过（${passes}/${passes}）`)
