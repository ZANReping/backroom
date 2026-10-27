/* eslint-disable @typescript-eslint/no-explicit-any -- 预览页直接拨动引擎内部字段 */
// [movefeel] 移动手感预览：2D canvas 直接驱动真实 Engine.updateMovement（engine/movement.ts）与 core/player 碰撞，
// 画速度—时间曲线、方向限速、体力 / 喘息、跳跃 z(t)、俯视轨迹（斜贴墙 / 绕凸角）、镜头起伏与脚步声相位。
// 虚线 = 改动前的行为（原代码的瞬切速度 / 对称重力 11 / 原 integrateMove 轴分离碰撞 / 原体力规则）。
import { Engine } from '../game/engine'
import { audio } from '../game/core/audio'
import { MV, directionLimit } from '../game/engine/moveTuning'
import { integrateMove, createIntegrator } from '../game/core/player'

const W = 1600, H = 1000
const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv)
const g = cv.getContext('2d')!
const FONT = "'Noto Sans CJK SC','Noto Sans SC',sans-serif"
const C = { bg: '#14120c', panel: '#1d1a12', grid: '#2e2a1d', text: '#e8e0c4', dim: '#9a9070', newc: '#e8b93c', old: '#7fa7c9', run: '#e0603a', wall: '#6d6650', ok: '#7cc47a' }

const steps: { t: number; pan: number }[] = []
let simT = 0
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
;(audio as any).footstep = (_f: string, pan = 0) => { steps.push({ t: simT, pan }) }

function world(S = 96) {
  const N = S * S, zero = () => new Uint8Array(N)
  const eng: any = new Engine()
  eng.player.level = 2
  eng.map = { w: S, h: S, tiles: zero().fill(1), structures: [], items: [], lights: [], exits: [], entities: [], spawn: { x: 20, y: 20 },
    wet: zero(), elev: zero(), outdoor: zero().fill(1), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(N),
    liquid: zero(), seaFloor: new Float32Array(N), floors: 1, dn: zero(), dnWall: zero(), tint: zero() }
  const m = eng.map
  for (let i = 0; i < S; i++) { m.tiles[i] = 0; m.tiles[(S - 1) * S + i] = 0; m.tiles[i * S] = 0; m.tiles[i * S + S - 1] = 0 }
  Object.assign(eng.player, { x: 20.5, y: 48.5, z: 0, vz: 0, floor: 0, hp: 100, sanity: 100, stamina: 100, facing: 0 })
  const inp = (mx: number, my: number, o: { sprint?: boolean; crouch?: boolean } = {}) => { eng.input.mx = mx; eng.input.my = my; eng.input.sprint = !!o.sprint; eng.input.crouch = !!o.crouch }
  const frame = (dt = 1 / 60) => { simT += dt; eng.updateMovement(dt, { dmg: 1, drain: 1 }, false) }
  return { eng, m, p: eng.player, inp, frame, S }
}

// ---- 绘图工具 ----
type Box = { x: number; y: number; w: number; h: number }
function panel(b: Box, title: string, sub: string) {
  g.fillStyle = C.panel; g.fillRect(b.x, b.y, b.w, b.h)
  g.fillStyle = C.text; g.font = `700 17px ${FONT}`; g.fillText(title, b.x + 14, b.y + 24)
  g.fillStyle = C.dim; g.font = `12px ${FONT}`; g.fillText(sub, b.x + 14, b.y + 42)
}
function axes(b: Box, x0: number, x1: number, y0: number, y1: number, xl: string, yl: string, xt: number, yt: number) {
  const P = { l: b.x + 46, r: b.x + b.w - 14, t: b.y + 54, b: b.y + b.h - 30 }
  const X = (v: number) => P.l + (v - x0) / (x1 - x0) * (P.r - P.l), Y = (v: number) => P.b - (v - y0) / (y1 - y0) * (P.b - P.t)
  g.strokeStyle = C.grid; g.lineWidth = 1; g.fillStyle = C.dim; g.font = `11px ${FONT}`
  for (let v = x0; v <= x1 + 1e-9; v += xt) { g.beginPath(); g.moveTo(X(v), P.t); g.lineTo(X(v), P.b); g.stroke(); g.fillText(String(Math.round(v * 100) / 100), X(v) - 8, P.b + 14) }
  for (let v = y0; v <= y1 + 1e-9; v += yt) { g.beginPath(); g.moveTo(P.l, Y(v)); g.lineTo(P.r, Y(v)); g.stroke(); g.fillText(String(Math.round(v * 100) / 100), P.l - 34, Y(v) + 4) }
  g.fillText(xl, P.r - 60, P.b + 26); g.save(); g.translate(b.x + 12, P.t + 60); g.rotate(-Math.PI / 2); g.fillText(yl, 0, 0); g.restore()
  return { X, Y, P }
}
function line(pts: [number, number][], X: (v: number) => number, Y: (v: number) => number, col: string, w = 2.2, dash: number[] = []) {
  g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash); g.beginPath()
  pts.forEach(([a, b], i) => (i ? g.lineTo(X(a), Y(b)) : g.moveTo(X(a), Y(b)))); g.stroke(); g.setLineDash([])
}
function legend(x: number, y: number, items: [string, string, number[]?][]) {
  g.font = `12px ${FONT}`
  for (const [label, col, dash] of items) { g.strokeStyle = col; g.lineWidth = 2.5; g.setLineDash(dash ?? []); g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 24, y - 4); g.stroke(); g.setLineDash([]); g.fillStyle = C.text; g.fillText(label, x + 30, y); x += 40 + g.measureText(label).width }
}
function note(x: number, y: number, s: string, col = C.text) { g.fillStyle = col; g.font = `12px ${FONT}`; g.fillText(s, x, y) }

g.fillStyle = C.bg; g.fillRect(0, 0, W, H)
g.fillStyle = C.newc; g.font = `700 24px ${FONT}`; g.fillText('移动手感优化（惯性「轻」）——真实 updateMovement / player 碰撞驱动', 24, 36)
g.fillStyle = C.dim; g.font = `13px ${FONT}`; g.fillText('实线 = 新手感（engine/moveTuning.ts MV 表）　虚线 = 改动前　走速 3.4 / 跑速 6.0 / 跳高 1.32 m / 噪音事件不变', 24, 58)

const info: Record<string, unknown> = {}
const cols = 3, pw = (W - 24 * 2 - 16 * (cols - 1)) / cols, ph = 440
const box = (i: number): Box => ({ x: 24 + (i % cols) * (pw + 16), y: 74 + Math.floor(i / cols) * (ph + 16), w: pw, h: ph })

// ① 速度—时间：起步 → 冲刺 → 松冲刺 → 松手
{
  const b = box(0); panel(b, '① 速度—时间', '0 s 按 W → 1.0 s 按 Shift → 2.2 s 松 Shift → 3.0 s 松手')
  const w = world(); const pts: [number, number][] = [], old: [number, number][] = []
  const dt = 1 / 120; let t = 0, t95 = -1, tStop = -1, xStop = 0
  for (let i = 0; i < 3.6 / dt; i++) {
    const sp = t >= 1 && t < 2.2, on = t < 3
    w.inp(on ? 1 : 0, 0, { sprint: sp }); if (Math.abs(t - 3) < dt / 2) xStop = w.p.x
    w.frame(dt); t += dt
    const v = Math.hypot(w.eng.mv.vx, w.eng.mv.vy); pts.push([t, v]); old.push([t, on ? (sp ? 6 : 3.4) : 0])
    if (t95 < 0 && v >= 3.4 * 0.95) t95 = t
    if (t > 3 && tStop < 0 && v === 0) { tStop = t - 3; xStop = w.p.x - xStop }
  }
  const { X, Y } = axes(b, 0, 3.6, 0, 7, '时间 s', '速度 m/s', 0.5, 1)
  line(old, X, Y, C.old, 2, [6, 5]); line(pts, X, Y, C.newc, 2.6)
  legend(b.x + 60, b.y + b.h - 44 - 300, [['新', C.newc], ['原', C.old, [6, 5]]])
  note(X(0.05), Y(4.3), `到 95% 走速 ${t95.toFixed(3)} s`, C.newc)
  note(X(1.25), Y(6.6), `冲刺渐入 ${MV.SPRINT_RAMP} s`, C.newc)
  note(X(2.55), Y(1.5), `急停 ${tStop.toFixed(2)} s / ${xStop.toFixed(2)} m`, C.newc)
  info.accel95 = t95; info.stopT = tStop; info.stopD = xStop
}

// ② 方向限速（极坐标）+ 反向
{
  const b = box(1); panel(b, '② 方向限速 / 冲刺锥', `前 ${MV.FWD} · 侧 ${MV.SIDE} · 后 ${MV.BACK}；冲刺只在前进 ±${MV.SPRINT_CONE_DEG}°（右图：前→后 反向 ×${MV.REVERSE_MUL}）`)
  const cx = b.x + 158, cy = b.y + 238, R = 24 // 每 m/s 24 px
  g.strokeStyle = C.grid; g.lineWidth = 1
  for (const r of [2, 4, 6]) { g.beginPath(); g.arc(cx, cy, r * R, 0, Math.PI * 2); g.stroke(); note(cx + r * R + 2, cy - 2, `${r}`, C.dim) }
  const ring = (fn: (a: number) => number, col: string, dash: number[] = []) => { const pts: [number, number][] = []; for (let d = 0; d <= 360; d += 3) { const a = d * Math.PI / 180; pts.push([Math.sin(a) * fn(a), Math.cos(a) * fn(a)]) } line(pts, (v) => cx + v * R, (v) => cy - v * R, col, 2.4, dash) }
  const measured = (a: number, sprint: boolean) => { const w = world(); w.inp(Math.cos(a), Math.sin(a), { sprint }); for (let i = 0; i < 90; i++) w.frame(); return Math.hypot(w.eng.mv.vx, w.eng.mv.vy) }
  const cache = new Map<string, number>(); const meas = (a: number, s: boolean) => { const k = a.toFixed(3) + s; if (!cache.has(k)) cache.set(k, measured(a, s)); return cache.get(k)! }
  ring(() => 3.4, C.old, [6, 5]); ring(() => 6, C.old, [2, 4])
  ring((a) => meas(a, false), C.newc); ring((a) => meas(a, true), C.run)
  note(cx - 14, cy - 6.4 * R, '前', C.text); note(cx - 14, cy + 6.8 * R, '后', C.text)
  legend(b.x + 14, b.y + b.h - 12, [['走（实测）', C.newc], ['冲刺键（实测）', C.run], ['原 走 / 跑', C.old, [6, 5]]])
  // 反向
  const w = world(); w.inp(1, 0); for (let i = 0; i < 60; i++) w.frame()
  const pts: [number, number][] = [], old: [number, number][] = []; let t = 0
  for (let i = 0; i < 60; i++) { w.inp(t < 0.05 ? 1 : -1, 0); w.frame(); t += 1 / 60; pts.push([t, w.eng.mv.vx]); old.push([t, t < 0.05 ? 3.4 : -3.4]) }
  const sb: Box = { x: b.x + 335, y: b.y + 90, w: b.w - 345, h: 250 }
  const { X, Y } = axes({ ...sb, y: sb.y - 40 }, 0, 1, -4, 4, 's', 'vx', 0.25, 2)
  line(old, X, Y, C.old, 2, [6, 5]); line(pts, X, Y, C.newc, 2.4)
  note(sb.x + 50, sb.y + sb.h, `前进 3.4 → 后退 ${(3.4 * MV.BACK).toFixed(2)} m/s`, C.dim)
  info.back = meas(Math.PI, false); info.side = meas(Math.PI / 2, false)
}

// ③ 体力 / 喘息
{
  const b = box(2); panel(b, '③ 体力 / 喘息（按住冲刺 12 s，起始体力 30）', `耗尽 → 喘息 ${MV.WINDED_T} s 且体力 ≥ ${MV.WINDED_RESUME} 才能再冲（原逻辑在体力 1 附近每几帧切换一次）`)
  const w = world(); w.p.stamina = 30; w.inp(1, 0, { sprint: true })
  const st: [number, number][] = [], sp: [number, number][] = [], ost: [number, number][] = [], osp: [number, number][] = []
  let t = 0, os = 30, toggles = 0, prevS = false
  for (let i = 0; i < 12 * 60; i++) {
    w.frame(); t += 1 / 60; st.push([t, w.p.stamina]); sp.push([t, Math.hypot(w.eng.mv.vx, w.eng.mv.vy) * 10])
    const s = os > 1; if (s !== prevS) toggles++; prevS = s; os = s ? Math.max(0, os - 22 / 60) : Math.min(100, os + 12 / 60); ost.push([t, os]); osp.push([t, (s ? 6 : 3.4) * 10])
  }
  const { X, Y } = axes(b, 0, 12, 0, 70, '时间 s', '体力 / 速度×10', 2, 10)
  line(osp, X, Y, C.old, 1, [2, 2]); line(ost, X, Y, C.old, 2, [6, 5]); line(sp, X, Y, C.run, 2); line(st, X, Y, C.newc, 2.6)
  legend(b.x + 50, b.y + 68, [['体力', C.newc], ['速度×10', C.run], ['原 体力 / 速度', C.old, [6, 5]]])
  { const s = `原逻辑 12 s 切换 ${toggles} 次（闪烁）`; g.font = `12px ${FONT}`; const tw = g.measureText(s).width; g.fillStyle = C.panel; g.fillRect(b.x + 46, b.y + 78, tw + 12, 18); note(b.x + 52, b.y + 92, s, C.old) }
  info.oldToggles = toggles
}

// ④ 跳跃 z(t) + 土狼 / 缓冲
{
  const b = box(3); panel(b, '④ 跳跃 z(t)', `初速 ${MV.JUMP_VZ}，上升重力 ${MV.GRAV_UP} / 下落 ${MV.GRAV_DOWN}（原 11/11）；土狼 ${MV.COYOTE} s · 缓冲 ${MV.JUMP_BUFFER} s`)
  const w = world(); w.inp(0, 0); w.eng.input.jump = true
  const pts: [number, number][] = [], old: [number, number][] = []; let t = 0, top = 0, land = -1
  for (let i = 0; i < 130; i++) { w.frame(1 / 120); t += 1 / 120; pts.push([t, w.p.z]); top = Math.max(top, w.p.z); if (land < 0 && t > 0.1 && w.p.z <= 0) land = t }
  for (let tt = 0; tt <= 1.1; tt += 1 / 120) old.push([tt, Math.max(0, 5.4 * tt - 5.5 * tt * tt)])
  const { X, Y } = axes(b, 0, 1.1, 0, 1.6, '时间 s', 'z m', 0.1, 0.2)
  line(old, X, Y, C.old, 2, [6, 5]); line(pts, X, Y, C.newc, 2.6)
  g.fillStyle = 'rgba(124,196,122,.18)'; g.fillRect(X(land - MV.JUMP_BUFFER), Y(1.6), X(land) - X(land - MV.JUMP_BUFFER), Y(0) - Y(1.6))
  note(X(land - MV.JUMP_BUFFER) - 10, Y(0.5), '缓冲窗', C.ok)
  note(X(0.32), Y(1.45), `顶点 ${top.toFixed(3)} m（不变）`, C.newc)
  note(X(0.72), Y(0.25), `落地 ${land.toFixed(2)} s（原 0.98 s）`, C.newc)
  legend(b.x + 60, b.y + b.h - 44, [['新', C.newc], ['原', C.old, [6, 5]]])
  info.jumpTop = top; info.jumpAir = land
}

// ⑤ 俯视轨迹：斜贴墙 + 绕凸角
{
  const b = box(4); panel(b, '⑤ 俯视轨迹：门洞偏心 / 墙角凸起', `左：偏离门洞中线 0.25 m 直走　右：擦过墙角 0.08 m（≤${MV.CORNER_NUDGE} m 自动绕）`)
  const ox = b.x + 30, oy = b.y + 62, sc = 24
  const drawWalls = (m: any, x0: number, y0: number, w: number, h: number, dx: number) => { g.fillStyle = C.wall; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (m.tiles[y * m.w + x] === 0) g.fillRect(dx + (x - x0) * sc, oy + (y - y0) * sc, sc, sc); g.strokeStyle = C.grid; g.strokeRect(dx, oy, w * sc, h * sc) }
  // 门洞偏心：y=38 一排墙，x=38 留 1 m 门洞；玩家从 x=38.75 直走 +y
  { const w = world(); for (let x = 30; x < 46; x++) if (x !== 38) w.m.tiles[38 * w.S + x] = 0; w.p.x = 38.75; w.p.y = 34.5; w.inp(0, 1)
    const pts: [number, number][] = [[w.p.x, w.p.y]]; for (let i = 0; i < 150; i++) { w.frame(); pts.push([w.p.x, w.p.y]) }
    const q = { x: 38.75, y: 34.5 }, it = createIntegrator(), opts: [number, number][] = [[q.x, q.y]]; for (let i = 0; i < 150; i++) { integrateMove(w.m, q, 0, 1, 3.4, 1 / 60, it); opts.push([q.x, q.y]) }
    drawWalls(w.m, 35, 33, 7, 12, ox)
    const X = (v: number) => ox + (v - 35) * sc, Y = (v: number) => oy + (v - 33) * sc
    g.strokeStyle = 'rgba(232,185,60,.35)'; g.lineWidth = 1; g.strokeRect(X(38.75 - 0.32), Y(34.5 - 0.32), 0.64 * sc, 0.64 * sc)
    line(opts, X, Y, C.old, 2, [6, 5]); line(pts, X, Y, C.newc, 2.6)
    note(ox, oy + 12 * sc + 18, `新：穿过门洞（横移 ${Math.abs(w.p.x - 38.75).toFixed(2)} m）`, C.newc)
    note(ox, oy + 12 * sc + 36, `原：卡在门框前 y=${q.y.toFixed(2)}`, C.old)
    info.doorNew = w.p.y; info.doorOld = q.y }
  // 凸角
  { const w = world(); w.m.tiles[30 * w.S + 40] = 0; w.m.tiles[31 * w.S + 40] = 0; w.m.tiles[32 * w.S + 40] = 0; w.p.x = 36.5; w.p.y = 30 - 0.32 + 0.08 - 0.6 + 0.6; w.inp(1, 0)
    const y0 = w.p.y; const pts: [number, number][] = [[w.p.x, w.p.y]]; for (let i = 0; i < 150; i++) { w.frame(); pts.push([w.p.x, w.p.y]) }
    const q = { x: 36.5, y: y0 }, it = createIntegrator(), opts: [number, number][] = [[q.x, q.y]]; for (let i = 0; i < 150; i++) { integrateMove(w.m, q, 1, 0, 3.4, 1 / 60, it); opts.push([q.x, q.y]) }
    const dx = ox + 7 * sc + 40
    drawWalls(w.m, 35, 26, 9, 8, dx)
    const X = (v: number) => dx + (v - 35) * sc, Y = (v: number) => oy + (v - 26) * sc
    g.strokeStyle = 'rgba(232,185,60,.35)'; g.lineWidth = 1; g.strokeRect(X(pts[0][0] - 0.32), Y(pts[0][1] - 0.32), 0.64 * sc, 0.64 * sc)
    line(opts, X, Y, C.old, 2, [6, 5]); line(pts, X, Y, C.newc, 2.6)
    note(dx, oy + 8 * sc + 18, `新：绕过（横移 ${Math.abs(w.p.y - y0).toFixed(2)} m）`, C.newc)
    note(dx, oy + 8 * sc + 36, `原：卡在 x=${q.x.toFixed(2)}`, C.old)
    info.cornerNudge = Math.abs(w.p.y - y0); info.cornerOld = q.x }
  legend(b.x + 14, b.y + b.h - 12, [['新', C.newc], ['原 integrateMove', C.old, [6, 5]], ['墙', C.wall]])
}

// ⑥ 镜头起伏与脚步声（按实际位移 / 步长）
{
  const b = box(5); panel(b, '⑥ 镜头起伏 × 脚步声（相位 = 实际位移 / 步长）', `步长 走 ${MV.STRIDE_WALK} / 跑 ${MV.STRIDE_RUN} / 蹲 ${MV.STRIDE_CROUCH} m；落脚（▼）= 镜头最低点；1.6 s 起顶墙：不再晃`)
  const w = world(); for (let y = 0; y < w.S; y++) w.m.tiles[y * w.S + 34] = 0; w.p.x = 22
  steps.length = 0; simT = 0
  const bob: [number, number][] = [], spd: [number, number][] = []; let t = 0, amp = 0
  for (let i = 0; i < 3.2 * 60; i++) {
    const phase = t < 0.8 ? 'walk' : t < 1.6 ? 'run' : t < 2.4 ? 'walk' : 'crouch'
    if (t >= 1.6 && t < 1.62) w.p.x = 33.3 // 1.6 s 起：贴到 x=34 墙前，顶墙走
    if (t >= 2.4 && t < 2.42) w.p.x = 25
    w.inp(1, 0, { sprint: phase === 'run', crouch: phase === 'crouch' }); w.frame(); t += 1 / 60
    const hs = w.eng.mv.speed, aT = hs < 0.15 ? 0 : hs <= 3.4 ? hs / 3.4 : 1 + 0.5 * Math.min(1, (hs - 3.4) / 2.6)
    amp += (aT - amp) * Math.min(1, 8 / 60)
    bob.push([t, -Math.cos(w.eng.mv.stride * Math.PI * 2) * 0.026 * amp * MV.BOB_LIGHT * 100]); spd.push([t, hs])
  }
  const { X, Y } = axes(b, 0, 3.2, -3, 7, '时间 s', '起伏 cm / 速度 m/s', 0.4, 1)
  line(spd, X, Y, C.dim, 1.4, [3, 3]); line(bob, X, Y, C.newc, 2.4)
  for (const s of steps) { const x = X(s.t); g.fillStyle = C.run; g.beginPath(); g.moveTo(x - 5, Y(-1.5)); g.lineTo(x + 5, Y(-1.5)); g.lineTo(x, Y(-2.2)); g.fill(); note(x - 3, Y(-2.7), s.pan < 0 ? 'L' : 'R', C.dim) }
  for (const [x0, s] of [[0.1, '走'], [0.9, '跑'], [1.7, '顶墙'], [2.5, '蹲行']] as [number, string][]) note(X(x0), Y(5.6), s, C.text)
  legend(b.x + 60, b.y + 74, [['镜头起伏（简化版 ×0.6）', C.newc], ['实测速度', C.dim, [3, 3]], ['▼ 脚步声', C.run]])
  info.footsteps = steps.length
}

info.directionLimitDiag = directionLimit(Math.SQRT1_2, Math.SQRT1_2)
;(window as any).__info = info
;(window as any).__ready = true
