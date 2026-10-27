/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [movefeel] 移动手感优化无头验收：真实 Engine.updateMovement（engine/movement.ts）+ core/player 碰撞，
// 手搭平地图。运行：npm run check:movefeel
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(64, 64) },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { audio } = await import('../src/game/core/audio')
const { MV, stickResponse, directionLimit, approachVelocity, strideFor } = await import('../src/game/engine/moveTuning')
const { integrateMove, integrateVelocityMove, resolvePlayerPenetration, createIntegrator, canOccupy } = await import('../src/game/core/player')

// 音效全部静默；记录脚步声（声像）
const steps: number[] = []
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
;(audio as any).footstep = (_f: string, pan = 0) => { steps.push(pan) }

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const r3 = (v: number) => Math.round(v * 1000) / 1000
const DM = { dmg: 1, drain: 1 }

/** 手搭平地：S×S，四周墙；facing=0（前方 +x） */
function world(S = 96) {
  const N = S * S, zero = () => new Uint8Array(N)
  const eng: any = new Engine()
  eng.player.level = 2
  eng.map = { w: S, h: S, tiles: zero().fill(1), structures: [], items: [], lights: [], exits: [], entities: [], spawn: { x: 20, y: 20 },
    wet: zero(), elev: zero(), outdoor: zero(), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(N),
    liquid: zero(), seaFloor: new Float32Array(N), floors: 1, dn: zero(), dnWall: zero(), tint: zero() }
  const m = eng.map
  for (let i = 0; i < S; i++) { m.tiles[i] = 0; m.tiles[(S - 1) * S + i] = 0; m.tiles[i * S] = 0; m.tiles[i * S + S - 1] = 0 }
  const p = eng.player
  Object.assign(p, { x: 20.5, y: 48.5, z: 0, vz: 0, floor: 0, hp: 100, sanity: 100, stamina: 100, facing: 0, hunger: 100, thirst: 100 })
  const inp = (mx: number, my: number, o: { sprint?: boolean; crouch?: boolean } = {}) => { eng.input.mx = mx; eng.input.my = my; eng.input.sprint = !!o.sprint; eng.input.crouch = !!o.crouch }
  const frame = (dt = 1 / 60, lock = false) => eng.updateMovement(dt, DM, lock)
  const run = (sec: number, dt = 1 / 60, each?: (t: number) => void) => { const k = Math.round(sec / dt); for (let i = 0; i < k; i++) { frame(dt); each?.((i + 1) * dt) } }
  const spd = () => Math.hypot(eng.mv.vx, eng.mv.vy)
  return { eng, m, p, inp, frame, run, spd, S }
}

console.log('— A 速度模型 —')
{
  // 1 加速到走速
  for (const fps of [30, 60, 144]) {
    const { inp, run, spd } = world(); inp(1, 0)
    let t95 = -1; run(0.6, 1 / fps, (t) => { if (t95 < 0 && spd() >= MV.WALK * 0.95) t95 = t })
    ok(t95 > 0.1 && t95 < 0.2, `${fps} fps：0 → 95% 走速用时 ${r3(t95)} s（目标 ≈0.15 s，「轻」）`)
    ok(Math.abs(spd() - MV.WALK) < 1e-6, `${fps} fps：稳态走速仍为 3.4 m/s`, r3(spd()))
  }
  // 2 急停距离
  { const { p, inp, run, spd } = world(); inp(1, 0); run(1); const x0 = p.x; inp(0, 0)
    let tStop = -1; run(0.5, 1 / 60, (t) => { if (tStop < 0 && spd() === 0) tStop = t })
    const d = p.x - x0
    ok(d > 0.12 && d < 0.32, `走速急停滑行 ${r3(d)} m（理论 v²/2a = ${r3(MV.WALK ** 2 / 2 / MV.DECEL)} m）`)
    ok(tStop > 0 && tStop < 0.16, `走速急停用时 ${r3(tStop)} s`) }
  { const { p, inp, run } = world(); inp(1, 0, { sprint: true }); run(1.5); const x0 = p.x; inp(0, 0); run(0.6)
    ok(p.x - x0 < 0.9, `跑速急停滑行 ${r3(p.x - x0)} m < 0.9 m`) }
  // 3 反向
  { const { inp, run, eng, spd } = world(); inp(1, 0); run(1); inp(-1, 0)
    let t = -1; run(0.6, 1 / 60, (tt) => { if (t < 0 && eng.mv.vx <= -MV.WALK * MV.BACK * 0.95) t = tt })
    const noMul = MV.WALK / MV.ACCEL + MV.WALK * MV.BACK * 0.95 / MV.ACCEL
    ok(t > 0 && t < noMul - 0.03, `反向（前→后）到 95% 后退速度 ${r3(t)} s（无反向倍率时约 ${r3(noMul)} s）`)
    ok(Math.abs(spd() - MV.WALK * MV.BACK) < 1e-6, '反向后稳态为后退限速', r3(spd())) }
  // 4 方向限速
  { const cases: [string, number, number, number][] = [['正前', 1, 0, MV.FWD], ['正侧', 0, 1, MV.SIDE], ['正后', -1, 0, MV.BACK], ['斜前 45°', Math.SQRT1_2, Math.SQRT1_2, (MV.FWD + MV.SIDE) / 2], ['斜后 45°', -Math.SQRT1_2, Math.SQRT1_2, (MV.BACK + MV.SIDE) / 2]]
    for (const [label, mx, my, k] of cases) { const { inp, run, spd } = world(); inp(mx, my); run(1.2); ok(Math.abs(spd() - MV.WALK * k) < 1e-3, `${label}限速 ${r3(spd())} m/s（= 3.4 × ${k}）`) } }
  { const { inp, run, spd, p } = world(); p.facing = Math.PI / 2; inp(0, 1); run(1); ok(Math.abs(spd() - MV.WALK) < 1e-6, '转向后「前」跟着视角走（facing=90° 时 +y 为正前）', r3(spd())) }
  // 5 冲刺渐入
  { const { inp, run, spd } = world(); inp(1, 0); run(1); inp(1, 0, { sprint: true })
    let s1 = 0; run(0.1, 1 / 60); s1 = spd(); let tRun = -1; run(0.6, 1 / 60, (t) => { if (tRun < 0 && spd() >= MV.RUN * 0.98) tRun = t + 0.1 })
    ok(s1 > MV.WALK + 0.2 && s1 < 5.2, `冲刺 0.1 s 时 ${r3(s1)} m/s（渐入，不再瞬切 3.4→6.0）`)
    ok(tRun > 0.22 && tRun < 0.45, `冲刺到 98% 跑速 ${r3(tRun)} s（渐入 ${MV.SPRINT_RAMP} s）`)
    ok(Math.abs(spd() - MV.RUN) < 1e-6, '稳态跑速仍为 6.0 m/s', r3(spd())) }
  // 6 冲刺只在前进 ±50°
  { const deg = (d: number) => [Math.cos(d * Math.PI / 180), Math.sin(d * Math.PI / 180)] as const
    for (const [d, sprints] of [[0, true], [40, true], [49, true], [60, false], [90, false], [180, false]] as [number, boolean][]) {
      const { inp, run, spd, p } = world(); const [mx, my] = deg(d); inp(mx, my, { sprint: true }); run(1.5)
      const k = directionLimit(mx, my), want = (sprints ? MV.RUN : MV.WALK) * k
      ok(Math.abs(spd() - want) < 1e-3 && (sprints ? p.stamina < 100 : p.stamina === 100), `${d}° + 冲刺键 → ${sprints ? '冲刺' : '不冲刺、不耗体力'} ${r3(spd())} m/s`)
    } }
  // 7 体力消耗速率不变
  { const { inp, run, p } = world(); inp(1, 0, { sprint: true }); run(1); ok(Math.abs((100 - p.stamina) - MV.STAMINA_DRAIN) < 0.5, `冲刺体力消耗 ${r3(100 - p.stamina)}/s（原 22/s）`) }
  // 8 喘息不闪烁
  { const { eng, inp, run, spd, p } = world(); p.stamina = 10; inp(1, 0, { sprint: true })
    const segs: number[] = []; let prev = false, tEx = -1, tResume = -1, st0 = p.stamina
    run(12, 1 / 60, (t) => { const s = p.stamina < st0; st0 = p.stamina; if (s !== prev) segs.push(t); prev = s; if (tEx < 0 && eng.mv.winded) tEx = t; if (tEx > 0 && tResume < 0 && t > tEx && !eng.mv.winded) tResume = t })
    const gaps: number[] = []; for (let i = 1; i < segs.length; i += 2) if (segs[i + 1] !== undefined) gaps.push(segs[i + 1] - segs[i])
    ok(tEx > 0 && tEx < 0.6, `体力 10 冲刺 ${r3(tEx)} s 后进入喘息`)
    ok(tResume - tEx >= MV.WINDED_T - 0.02, `喘息 ${r3(tResume - tEx)} s ≥ ${MV.WINDED_T} s 才能再冲`)
    ok(gaps.length > 0 && gaps.every((g) => g >= MV.WINDED_T - 0.02), `12 s 按住冲刺：冲刺（耗体力）/ 喘息切换 ${segs.length} 次，每次停冲 ≥2.5 s（不闪烁）`, gaps.map(r3))
    void spd }
  // 原逻辑对照：体力 1 附近每帧切换
  { let st = 1.0, toggles = 0, prev = false
    for (let i = 0; i < 600; i++) { const s = st > 1; if (s !== prev) toggles++; prev = s; st = s ? Math.max(0, st - 22 / 60) : Math.min(100, st + 12 / 60) }
    ok(toggles > 40, `（对照）原逻辑 10 s 内冲刺 / 走路切换 ${toggles} 次 → 新逻辑已消除`) }
  // 9 湿地打滑 / 速度乘子
  { const { m, inp, run, spd } = world(); m.wet.fill(1); inp(1, 0); let t95 = -1; run(1.5, 1 / 60, (t) => { if (t95 < 0 && spd() >= MV.WALK * 0.55 * 0.95) t95 = t })
    ok(Math.abs(spd() - MV.WALK * 0.55) < 1e-3, `湿地限速 ${r3(spd())}（原乘子 ×0.55 保留）`)
    ok(t95 > 0.15, `湿地加速变慢（打滑感）：到 95% 用 ${r3(t95)} s`) }
  { const { inp, run, spd, eng } = world(); eng.dev.speed = true; inp(1, 0); run(1); ok(Math.abs(spd() - MV.WALK * 1.8) < 1e-3, `dev.speed ×1.8 → ${r3(spd())}`) }
  { const { inp, run, spd, p } = world(); inp(1, 0, { crouch: true }); run(1); ok(Math.abs(spd() - MV.WALK * 0.5) < 1e-3, `蹲行 ×0.5 → ${r3(spd())}`); p.slowT = 5; inp(1, 0); run(0.5); ok(Math.abs(spd() - MV.WALK * 0.5) < 1e-3, `slowT ×0.5 → ${r3(spd())}`) }
  { const { inp, run, spd, eng } = world(); eng.webbedT = 5; inp(1, 0); run(1); ok(Math.abs(spd() - MV.WALK * 0.5) < 1e-3, `缠丝 webbed ×0.5 → ${r3(spd())}`) }
  // 10 纯函数
  ok(stickResponse(0.1) === 0 && stickResponse(0.13) > 0.1 && stickResponse(0.13) < 0.15 && Math.abs(stickResponse(1) - 1) < 1e-9 && stickResponse(0.5) < 0.5, `摇杆死区 0.12 + 曲线：0.1→0 / 0.13→${r3(stickResponse(0.13))} / 0.5→${r3(stickResponse(0.5))} / 1→1`)
  { const [vx] = approachVelocity(0, 0, 3.4, 0, 22, 28, 0.1); ok(Math.abs(vx - 2.2) < 1e-9, 'approachVelocity 线性加速') }
  ok(r3(strideFor(MV.WALK, false)) === MV.STRIDE_WALK && r3(strideFor(MV.RUN, false)) === MV.STRIDE_RUN && strideFor(1.7, true) === MV.STRIDE_CROUCH, '步长：走 0.75 / 跑 1.05 / 蹲 0.5')
}

console.log('— B 碰撞滑动 —')
{
  // 斜贴墙：x=40 一整列墙，朝 (1,1) 斜走
  { const { m, p, inp, frame, S } = world(); for (let y = 0; y < S; y++) m.tiles[y * S + 40] = 0
    p.x = 38.5; p.y = 30.5; inp(Math.SQRT1_2, Math.SQRT1_2)
    let stall = 0, contact = -1; const ys: number[] = []
    for (let i = 0; i < 180; i++) { const y0 = p.y; frame(); ys.push(p.y - y0); if (contact < 0 && p.x > 40 - 0.33) contact = i; if (contact >= 0 && i > contact && p.y - y0 < 1e-4) stall++ }
    const along = (ys.slice(-30).reduce((a, b) => a + b, 0)) / 0.5
    ok(contact > 0 && stall === 0, `斜贴墙滑行：接触后 ${180 - contact} 帧沿墙推进、0 帧停顿`)
    ok(Math.abs(along - MV.WALK * Math.SQRT1_2 * directionLimit(Math.SQRT1_2, Math.SQRT1_2)) < 0.1, `沿墙速度 ${r3(along)} m/s（= 输入在墙切线上的投影）`)
    ok(p.x <= 40 - 0.32 + 1e-6, '没有穿墙') }
  // 撞墙扣法向速度
  { const { m, p, inp, run, eng, S } = world(); for (let y = 0; y < S; y++) m.tiles[y * S + 40] = 0; p.x = 38.5; inp(1, 0); run(1.2)
    ok(Math.abs(eng.mv.vx) < 0.2, `顶着墙走：法向速度被扣掉（vx=${r3(eng.mv.vx)}，不再「顶墙满速」）`)
    ok(eng.mv.speed < 0.2, `顶墙时实测速度 ${r3(eng.mv.speed)} → 镜头不再晃`)
    inp(0, 1); let t = -1; run(0.4, 1 / 60, (tt) => { if (t < 0 && eng.mv.vy > MV.SIDE * MV.WALK * 0.95) t = tt })
    ok(t > 0 && t < 0.25, `离墙横移即刻加速（${r3(t)} s），没有残余的顶墙速度`) }
  // 门框凸角：单格墙 (40,30)，玩家 AABB 擦过 0.08 m
  for (const [over, pass] of [[0.08, true], [0.11, true], [0.2, false]] as [number, boolean][]) {
    const { m, p, inp, run, S } = world(); m.tiles[30 * S + 40] = 0
    p.x = 37.5; p.y = 30 - 0.32 + over; const y0 = p.y; inp(1, 0); run(2)
    ok(pass ? p.x > 41.5 && Math.abs(p.y - y0) <= over + 0.02 : p.x < 40, `直走擦过凸角 ${over} m → ${pass ? '自动绕过' : '挡住（> 0.12 m 不绕）'}（x=${r3(p.x)}，横移 ${r3(Math.abs(p.y - y0))} m）`)
    if (over === 0.08) { const q = { x: 37.5, y: 30 - 0.32 + over }, it = createIntegrator(); for (let i = 0; i < 120; i++) integrateMove(m, q, 1, 0, 3.4, 1 / 60, it); ok(q.x < 40, `（对照）原 integrateMove 在同一凸角卡住 x=${r3(q.x)}`) }
  }
  // 门洞偏心：1 m 门洞，偏离中线 0.25 m 直走（门框擦身 0.07 m）
  { const { m, p, inp, run, S } = world(); for (let x = 30; x < 46; x++) if (x !== 38) m.tiles[38 * S + x] = 0
    p.x = 38.75; p.y = 34.5; inp(0, 1); run(2)
    const q = { x: 38.75, y: 34.5 }, it = createIntegrator(); for (let i = 0; i < 120; i++) integrateMove(m, q, 0, 1, 3.4, 1 / 60, it)
    ok(p.y > 40 && Math.abs(p.x - 38.75) <= 0.09, `门洞偏心 0.25 m 直走 → 穿过（y=${r3(p.y)}，横移 ${r3(Math.abs(p.x - 38.75))} m）；原 integrateMove 卡在 y=${r3(q.y)}`) }
  // 圆柱：斜向撞上细柱子沿切线滑过
  for (const off of [0.12, -0.12]) {
    const { m, p, inp, run } = world(); m.structures.push({ id: 1, kind: 'pillar', x: 39.85, y: 29.85, w: 0.3, h: 0.3, solid: true, floor: 0 } as any)
    p.x = 37.6 + off; p.y = 27.6 - off; inp(Math.SQRT1_2, Math.SQRT1_2); run(2.5)
    const q = { x: 37.6 + off, y: 27.6 - off }, it = createIntegrator(); for (let i = 0; i < 150; i++) integrateMove(m, q, Math.SQRT1_2, Math.SQRT1_2, 3.4, 1 / 60, it)
    ok(p.x + p.y > 70.5 && canOccupy(m, p.x, p.y), `斜向撞细柱（偏心 ${off} m）沿切线绕过、不卡死：沿行进方向走出 ${r3((p.x + p.y - 65.2) / Math.SQRT2)} m（原 integrateMove 同样 2.5 s ${r3((q.x + q.y - 65.2) / Math.SQRT2)} m）`) }
}

console.log('— C 跳跃与落地 —')
{
  // 跳高不变
  { const { p, inp, frame, eng, m } = world(); m.outdoor.fill(1); inp(0, 0); eng.input.jump = true; let top = 0, air = 0
    for (let i = 0; i < 240; i++) { frame(1 / 120); top = Math.max(top, p.z); if (p.z > 0) air++ }
    ok(Math.abs(top - MV.JUMP_VZ ** 2 / 2 / MV.GRAV_UP) < 0.03 && Math.abs(top - 1.32) < 0.03, `跳跃顶点 ${r3(top)} m（原 ≈1.32 m）`)
    ok(air / 120 < 0.95, `滞空 ${r3(air / 120)} s（原 0.98 s；下落重力 15 更干脆）`) }
  // 跃上 1.2 m 高台
  { const { m, p, inp, frame, eng, S } = world(); for (let y = 0; y < S; y++) for (let x = 42; x < S - 1; x++) m.elev[y * S + x] = 2
    p.x = 39.2; inp(1, 0); for (let i = 0; i < 60; i++) frame(); eng.input.jump = true; for (let i = 0; i < 90; i++) frame()
    ok(p.x > 42.3 && Math.abs(p.z - 1.2) < 0.01, `助跑跳上 +1.2 m 高台（x=${r3(p.x)} z=${r3(p.z)}）`) }
  // 土狼时间：x≥40 下沉 1.2 m 的坑
  for (const [delay, jumps] of [[0.05, true], [0.09, true], [0.16, false]] as [number, boolean][]) {
    const { m, p, inp, frame, eng, S } = world(); for (let y = 0; y < S; y++) for (let x = 40; x < S - 1; x++) m.elev[y * S + x] = 1
    p.x = 38; inp(1, 0); let tEdge = -1, t = 0, jumped = false
    for (let i = 0; i < 120; i++) { frame(); t += 1 / 60; if (tEdge < 0 && p.z < -0.001) tEdge = t - 1 / 60; if (tEdge > 0 && !eng.input.jump && !jumped && t - tEdge >= delay - 1e-9 && t - tEdge < delay + 1 / 60) eng.input.jump = true; if (p.vz > 3) jumped = true }
    ok(jumped === jumps, `走出边缘 ${delay} s 后按跳 → ${jumps ? '仍能起跳（土狼时间 0.1 s）' : '不能起跳'}`)
  }
  // 跳跃缓冲
  for (const [early, rejump] of [[0.08, true], [0.2, false]] as [number, boolean][]) {
    const { p, inp, frame, eng } = world(); inp(0, 0); eng.input.jump = true; frame()
    let landT = -1, t = 0; for (let i = 0; i < 70; i++) { frame(); t += 1 / 60; if (landT < 0 && p.z === 0 && p.vz === 0) landT = t }
    // 用解析落地时间安排提前量，再跑一次
    const w = world(); w.inp(0, 0); w.eng.input.jump = true; w.frame(); t = 0; let again = false, landed = false
    for (let i = 0; i < 90; i++) { t += 1 / 60; if (!w.eng.input.jump && Math.abs(t - (landT - early)) < 1 / 120) w.eng.input.jump = true; w.frame(); if (w.p.z <= 0.0001 && w.p.vz <= 0) landed = true; if (t > landT - 0.001 && t < landT + 0.05 && w.p.vz > 3) again = true }
    ok(again === rejump, `落地前 ${early} s 按跳 → ${rejump ? '落地即起跳（缓冲 0.12 s）' : '不触发'}`, { landT: r3(landT), landed })
  }
  // 落地减速
  { const { inp, frame, eng, spd } = world(); inp(1, 0); for (let i = 0; i < 60; i++) frame(); eng.input.jump = true
    let landed = -1, minAfter = 99, t = 0; for (let i = 0; i < 120; i++) { frame(); t += 1 / 60; if (landed < 0 && eng.mv.landT > 0) landed = t; if (landed > 0 && t - landed < 0.3) minAfter = Math.min(minAfter, spd()) }
    ok(landed > 0 && minAfter < MV.WALK * 0.9 && minAfter > MV.WALK * 0.5, `跳跃落地短暂减速到 ${r3(minAfter)} m/s（时长 ${r3(eng.mv.landDur)} s）`)
    ok(Math.abs(spd() - MV.WALK) < 1e-3, '0.3 s 后恢复走速') }
}

console.log('— D 脚步 / 噪音（实体听觉平衡不变）—')
{
  for (const [label, o, radius] of [['走', {}, 4], ['跑', { sprint: true }, 10], ['蹲', { crouch: true }, 1]] as [string, { sprint?: boolean; crouch?: boolean }, number][]) {
    const { eng, p, inp, run } = world(); p.x = 4; const ev: number[] = []; eng.noiseEvent = (_x: number, _y: number, r: number) => { ev.push(r) }
    steps.length = 0; inp(1, 0, o); const x0 = p.x; run(label === '蹲' ? 6 : 3)
    const dist = p.x - x0, expect = dist / 0.9
    ok(ev.length >= Math.floor(expect) - 2 && ev.length <= Math.ceil(expect) && ev.every((r) => r === radius), `${label} ${r3(dist)} m：噪音事件 ${ev.length} 次（每 ≈0.9 m 一次）、半径 ${radius}（不变）`)
    const stride = label === '跑' ? MV.STRIDE_RUN : label === '蹲' ? MV.STRIDE_CROUCH : MV.STRIDE_WALK
    ok(Math.abs(steps.length - dist / stride) <= 2, `${label}：脚步声 ${steps.length} 下 ≈ 距离 / 步长 ${stride}（= ${r3(dist / stride)}）`)
    ok(steps.length > 2 && steps.every((s, i) => i === 0 || Math.sign(s) === -Math.sign(steps[i - 1])), `${label}：左右脚声像交替`)
  }
  { const { eng, p, inp, run, m, S } = world(); for (let y = 0; y < S; y++) m.tiles[y * S + 40] = 0; p.x = 38.5; inp(1, 0); run(1); steps.length = 0; const ev: number[] = []; eng.noiseEvent = (_x: number, _y: number, r: number) => { ev.push(r) }; run(2)
    ok(steps.length === 0 && ev.length === 0, '顶着墙原地踏步：无脚步声、无噪音事件（按实际位移计）') }
}

console.log('— 特殊状态：不残留惯性 —')
{
  const states: [string, (w: ReturnType<typeof world>) => void, (w: ReturnType<typeof world>) => void][] = [
    ['垂直传送 3 m', (w) => { w.p.z += 3 }, () => {}],
    ['传送（脚本挪位 3 m）', (w) => { w.p.x += 3 }, () => {}],
    ['暂停菜单', (w) => { w.eng.paused = true; w.eng.update(1/60) }, (w) => { w.eng.paused = false }],
    ['梯子攀爬', (w) => { w.eng.climb = { baseX: 0, baseY: 0, topX: 0, topY: 0, dir: 1, zBase: 0, zTop: 9 } }, (w) => { w.eng.climb = null; w.p.z = 0; w.p.vz = 0 }],
    ['电梯', (w) => { w.eng.ride = { sx: w.p.x, sy: w.p.y, from: 0, to: 0, t: 0 } }, (w) => { w.eng.ride = null }],
    ['开场 / 木僵锁定', (w) => { w.frame(1 / 60, true) }, () => {}],
    ['dev 飞行', (w) => { w.eng.devEnabled = true; w.eng.dev.fly = true }, (w) => { w.eng.dev.fly = false; w.p.z = 0 }],
    ['深水游泳', (w) => { const i = Math.floor(w.p.y) * w.S + Math.floor(w.p.x); for (let d = -2; d <= 2; d++) for (let e = -2; e <= 2; e++) { w.m.liquid[i + d * w.S + e] = 1; w.m.seaFloor[i + d * w.S + e] = 1.7 } }, (w) => { w.m.liquid.fill(0); w.eng.inLiquid = 0; w.p.z = 0; w.p.vz = 0 }],
    ['换图', (w) => { w.eng.map = { ...w.m } }, () => {}],
  ]
  for (const [label, enter, leave] of states) {
    const w = world(); w.inp(1, 0, { sprint: true }); w.run(1); w.inp(0, 0)
    enter(w); w.frame(); leave(w)
    const x = w.p.x, y = w.p.y; w.run(0.5)
    ok(Math.hypot(w.p.x - x, w.p.y - y) < 1e-6 && w.eng.mv.vx === 0 && w.eng.mv.vy === 0, `${label}：退出后不被残留惯性带走（位移 ${r3(Math.hypot(w.p.x - x, w.p.y - y))} m）`)
  }

}

console.log('— 当前项目接入边界 —')
{
  const w = world(); w.eng.mv.winded = true; w.eng.mv.windedT = 2.5; w.eng.mv.jumpBuf = .1; w.eng.mv.stride = 7; w.eng.mv.vx = 6
  w.eng.loadLevel = () => {}; w.eng.newRun(424242, 'normal', 'slot1', true)
  ok(!w.eng.mv.winded && w.eng.mv.vx === 0 && w.eng.mv.jumpBuf === 0 && w.eng.mv.stride === 0, '新开局清除上一局喘息、跳跃缓冲和惯性')
}
{
  const w = world(192); w.p.x = 80; w.eng.map.inf = { ox: 0, oy: 0, seed: 424242, chunks: new Map(), explored: new Map() }; w.eng.updateInfiniteWindow = () => {}
  w.inp(1,0); w.run(1); w.eng.map.inf.ox += 32; w.p.x -= 32; w.frame()
  ok(Math.abs(w.eng.mv.vx - MV.WALK) < 1e-6, '无限窗口平移 32 m、世界坐标连续时不丢失惯性')
}
{
  const {parseGraphicsPresets,graphicsEqual,graphicsSnapshot} = await import('../src/game/core/graphicsPresets')
  const defaults:any = {headBob:true,headBobStrong:false}
  const presets = parseGraphicsPresets(JSON.stringify([{id:'old-on',name:'旧完整',values:{headBob:true}},{id:'old-off',name:'旧关闭',values:{headBob:false}},{id:'new-light',name:'简化',values:{headBob:true,headBobStrong:false}}]), defaults)
  ok(presets[0].values.headBobStrong && !presets[1].values.headBob && !presets[1].values.headBobStrong, '旧自定义预设保留完整摇晃或关闭选项')
  ok(graphicsEqual(defaults,presets[2].values) && !graphicsEqual({...defaults,headBobStrong:true},graphicsSnapshot(defaults)), '画面预设匹配包含新增强烈摇晃选项')
}
{
  const {L1_CRATE,l1CrateCollider} = await import('../src/game/world/l1Crate')
  const {structStandTopAt} = await import('../src/game/world/mapgen')
  let sweeps=0,embedded=0,failed=0
  for(const deg of [0,30,45,90,180])for(const stack of [1,2])for(const fps of [30,60,144])for(let a=0;a<8;a++){
    const w=world(32),st:any={kind:'crate',x:10,y:10,w:L1_CRATE.width,h:L1_CRATE.depth,solid:true,data:{l1Crate:1,l1Stack:stack,deg}}
    w.m.structures=[st];const top=l1CrateCollider(st).top;Object.assign(w.p,{x:10+st.w/2,y:10+st.h/2,z:top,vz:0});const start={x:w.p.x,y:w.p.y},v={vx:0,vy:0},it=createIntegrator(),dt=1/fps,ang=a*Math.PI/4
    for(let i=0;i<fps*3;i++){
      integrateVelocityMove(w.m,w.p,v,{tx:Math.cos(ang)*1.3,ty:Math.sin(ang)*1.3,accel:MV.ACCEL,decel:MV.DECEL},dt,it,{z:w.p.z,band:0})
      const g=Math.max(0,structStandTopAt(w.m,w.p.x,w.p.y,w.p.z,0));if(w.p.z>g){w.p.vz-=MV.GRAV_DOWN*dt;w.p.z+=w.p.vz*dt;if(w.p.z<=g){w.p.z=g;w.p.vz=0}}else{w.p.z=g;w.p.vz=0}
      resolvePlayerPenetration(w.m,w.p,.32,{z:w.p.z,band:0});if(!canOccupy(w.m,w.p.x,w.p.y,.32,{z:w.p.z,band:0}))embedded++
    }
    if(Math.hypot(w.p.x-start.x,w.p.y-start.y)<3.8 || w.p.z!==0)failed++;sweeps++
  }
  ok(sweeps===240&&embedded===0&&failed===0, '新速度积分在旋转/叠放补给箱顶面向八方向滑落不卡边（240 场景，30/60/144 fps）',{sweeps,embedded,failed})
}

console.log(`\n${fails ? '✘' : '✔'} check:movefeel ${n - fails}/${n}`)
if (fails) process.exit(1)
