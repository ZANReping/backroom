// [casino] Level 5.1 阶段 4：员工 AI（引擎侧，纯逻辑；渲染 renderer/casinoStaffRender 每帧读 staffList 摆模型、播 casinoStaffAnim 片段）。
//   主角：Louie（兑换台）/ 假肢人（门口招揽 + 拦门）/ Billy（1 号 21 点桌发牌）/ 酒保 E164（环形吧台内横移、摇酒、递酒）
//   背景：荷官 ×7（21 点 4 桌 + 轮盘 2 + 骰宝 1）/ 侍应 ×3（沿主通道巡逻送饮）/ 保安 ×3（门口 · VIP · 员工门）= 13（8–14）
//   状态机：work（本职）→ watch（你 5 m 内：转身盯你）→ warn（你闯进禁区：发牌区 / 吧台内 / 员工门 / 未受邀的 VIP）→ expel（第 3 次警告或滞留 8 s：保安走过来把你「请」回前厅）
//          patrol（侍应：A* 沿航点巡逻）· serve（侍应 / 酒保送免费饮料）· block（紫筹码为负：Louie + 假肢人 + 门口保安堵住大门）· gather（野兽挑战：员工围住牌桌）
//   寻路：0.5 m 栅格 A*（碰撞盒外扩 0.28 m），走路时避让玩家（0.8 m 内停下，停 1.2 s 侧移）。
import type { Engine } from '../engine'
import { casinoLayout, OX, OY } from '../content/casinoLayout'
import type { StaffWho } from '../renderer/casinoStaffRig'

/** 数值表（员工） */
export const CS = {
  cell: 0.5, inflate: 0.28,
  walk: 1.15, walkHero: 0.95, walkGuard: 1.5, sprint: 2.6,
  watchR: 5, watchT: 3, warnMax: 3, warnStay: 8, warnCool: 3.5, expelReach: 1.2,
  avoidR: 0.8, avoidWait: 1.2,
  lodCull: 42, // 渲染：超过 42 m 不画
  blockR: 5, // 紫筹码为负时，玩家离大门 5 m 内员工就堵门
}
export type StaffState = 'work' | 'patrol' | 'watch' | 'warn' | 'expel' | 'serve' | 'block' | 'gather'
export interface StaffAgent {
  id: number; who: StaffWho; role: string; palette: number
  x: number; y: number; yaw: number
  hx: number; hy: number; hyaw: number // 岗位
  state: StaffState; clip: string; clipT: number; seq: number
  path: [number, number][]; route?: [number, number][]; ri: number
  stT: number; waitT: number; moving: number
}
const X = (v: number) => OX + v, Y = (v: number) => OY + v
const S = Math.PI / 2, W = Math.PI, E = 0
/** 岗位表（地图米；布局 casinoLayout 坐标 + OX/OY） */
export const STAFF_POSTS: { who: StaffWho; role: string; x: number; y: number; yaw: number; palette?: number; route?: [number, number][] }[] = [
  { who: 'louie', role: '赌场经理 · 兑换台', x: X(51.3), y: Y(30.5), yaw: W },
  { who: 'prosthetic', role: '门口招揽', x: X(23.0), y: Y(33.2), yaw: E },
  { who: 'billy', role: '21 点发牌员', x: X(19.6), y: Y(1.7), yaw: S },
  { who: 'bartender', role: '酒保 E164', x: X(45.9), y: Y(8.6), yaw: W },
  ...([[24.6, 3.0], [29.6, 3.0], [19.6, 8.6], [24.6, 8.6]] as [number, number][]).map(([x, y], i) => ({ who: 'dealer' as StaffWho, role: '21 点荷官', x: X(x), y: Y(y - 1.3), yaw: S, palette: i % 3 })),
  ...([[19.7, 14.0], [25.1, 14.0]] as [number, number][]).map(([x, y], i) => ({ who: 'dealer' as StaffWho, role: '轮盘荷官', x: X(x), y: Y(y - 1.2), yaw: S, palette: (i + 1) % 3 })),
  { who: 'dealer', role: '骰宝荷官', x: X(19.6), y: Y(18.35), yaw: S, palette: 2 },
  { who: 'waiter', role: '侍应', x: X(15.4), y: Y(25.2), yaw: E, palette: 0, route: [[15.4, 25.2], [33.6, 25.2], [33.6, 12], [33.6, 25.2], [47, 28.2], [15.4, 25.2]] },
  { who: 'waiter', role: '侍应', x: X(15.4), y: Y(12), yaw: S, palette: 1, route: [[15.4, 12], [15.4, 33], [26, 33.5], [15.4, 25.2], [15.4, 12]] },
  { who: 'waiter', role: '侍应', x: X(33.8), y: Y(3), yaw: S, palette: 2, route: [[33.8, 3], [33.8, 22], [40, 25.2], [33.8, 22], [33.8, 3]] },
  { who: 'guard', role: '门口保安', x: X(29.0), y: Y(33.6), yaw: W, palette: 0 },
  { who: 'guard', role: 'VIP 保安', x: X(8.2), y: Y(10.4), yaw: S, palette: 1 },
  { who: 'guard', role: '员工门保安', x: X(50.4), y: Y(26.2), yaw: W, palette: 2 },
]
export const STAFF_COUNT = { heroes: 4, background: STAFF_POSTS.length - 4 }
const WORK_CLIP: Record<StaffWho, string> = { louie: 'idle', prosthetic: 'smoke', billy: 'deal', bartender: 'wipe', dealer: 'work', waiter: 'walk', guard: 'work' }
const WALK_CLIP: Record<StaffWho, string> = { louie: 'walk', prosthetic: 'walk', billy: 'walk', bartender: 'side', dealer: 'walk', waiter: 'walk', guard: 'walk' }
const WARN_CLIP: Record<StaffWho, string> = { louie: 'warn', prosthetic: 'track', billy: 'knock', bartender: 'stare', dealer: 'refuse', waiter: 'refuse', guard: 'refuse' }
const STARE_CLIP: Record<StaffWho, string> = { louie: 'stare', prosthetic: 'hat', billy: 'tongue', bartender: 'stare', dealer: 'idle', waiter: 'idle', guard: 'idle' }
const BLOCK_CLIP: Record<StaffWho, string> = { louie: 'refuse', prosthetic: 'track', billy: 'knock', bartender: 'stare', dealer: 'refuse', waiter: 'refuse', guard: 'refuse' }

// ---------------- 栅格 + A* ----------------
interface Grid { w: number; h: number; c: number; free: Uint8Array }
let GRID: Grid | null = null
export function staffGrid(): Grid {
  if (GRID) return GRID
  const L = casinoLayout(), c = CS.cell
  const w = Math.ceil((OX * 2 + 52) / c), h = Math.ceil((OY * 2 + 36 + 6) / c)
  const free = new Uint8Array(w * h)
  const k = CS.inflate
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = (i + 0.5) * c, y = (j + 0.5) * c
    let ok = x > OX + 0.35 && x < OX + 52 - 0.35 && y > OY + 0.35 && y < OY + 36 - 0.3
    if (ok) for (const b of L.boxes) if (x > b.x0 - k && x < b.x1 + k && y > b.y0 - k && y < b.y1 + k) { ok = false; break }
    free[j * w + i] = ok ? 1 : 0
  }
  return (GRID = { w, h, c, free })
}
const cellOf = (g: Grid, x: number, y: number): [number, number] => [Math.max(0, Math.min(g.w - 1, Math.floor(x / g.c))), Math.max(0, Math.min(g.h - 1, Math.floor(y / g.c)))]
function nearestFree(g: Grid, i: number, j: number): [number, number] {
  if (g.free[j * g.w + i]) return [i, j]
  for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
    const a = i + di, b = j + dj
    if (a >= 0 && b >= 0 && a < g.w && b < g.h && g.free[b * g.w + a]) return [a, b]
  }
  return [i, j]
}
export const staffFreeAt = (x: number, y: number) => { const g = staffGrid(), [i, j] = cellOf(g, x, y); return !!g.free[j * g.w + i] }
/** A*（8 邻接、禁止切角）→ 世界米航点（已做直线可见性平滑） */
export function staffPath(x0: number, y0: number, x1: number, y1: number, maxIter = 12000): [number, number][] {
  const g = staffGrid()
  const [si, sj] = nearestFree(g, ...cellOf(g, x0, y0)), [ti, tj] = nearestFree(g, ...cellOf(g, x1, y1))
  const W_ = g.w, s = sj * W_ + si, t = tj * W_ + ti
  if (s === t) return [[x1, y1]]
  const G = new Float32Array(g.w * g.h).fill(Infinity), P = new Int32Array(g.w * g.h).fill(-1), closed = new Uint8Array(g.w * g.h)
  const open: number[] = [s], F = new Float32Array(g.w * g.h).fill(Infinity)
  const hh = (n: number) => { const dx = Math.abs((n % W_) - ti), dy = Math.abs(((n / W_) | 0) - tj); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy) }
  G[s] = 0; F[s] = hh(s)
  let it = 0
  while (open.length && it++ < maxIter) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (F[open[k]] < F[open[bi]]) bi = k
    const n = open[bi]; open[bi] = open[open.length - 1]; open.pop()
    if (n === t) break
    if (closed[n]) continue
    closed[n] = 1
    const ni = n % W_, nj = (n / W_) | 0
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue
      const a = ni + di, b = nj + dj
      if (a < 0 || b < 0 || a >= g.w || b >= g.h) continue
      const m = b * W_ + a
      if (!g.free[m] || closed[m]) continue
      if (di && dj && (!g.free[nj * W_ + a] || !g.free[b * W_ + ni])) continue
      const ng = G[n] + (di && dj ? 1.414 : 1)
      if (ng < G[m]) { G[m] = ng; P[m] = n; F[m] = ng + hh(m); open.push(m) }
    }
  }
  if (P[t] < 0) return []
  const cells: number[] = []; for (let n = t; n !== -1 && n !== s; n = P[n]) cells.push(n)
  cells.reverse()
  const pts: [number, number][] = cells.map((n) => [((n % W_) + 0.5) * g.c, (((n / W_) | 0) + 0.5) * g.c])
  // 平滑：能直线走到的航点跳过
  const out: [number, number][] = []
  let cx = x0, cy = y0, k = 0
  while (k < pts.length) {
    let far = k
    for (let q = pts.length - 1; q > k; q--) if (lineFree(cx, cy, pts[q][0], pts[q][1])) { far = q; break }
    out.push(pts[far]); cx = pts[far][0]; cy = pts[far][1]; k = far + 1
  }
  out.push([x1, y1])
  return out
}
function lineFree(x0: number, y0: number, x1: number, y1: number) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.2)
  for (let i = 1; i < n; i++) if (!staffFreeAt(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false
  return true
}

// ---------------- 禁区 ----------------
export type Zone = 'dealer' | 'bar' | 'staffdoor' | 'vip' | null
export function forbiddenZone(x: number, y: number, vipOk = false): Zone {
  const lx = x - OX, ly = y - OY
  if (Math.hypot(lx - 44.8, ly - 8.6) < 3.4) return 'bar'
  if (lx > 49 && ly > 22.5 && ly < 26.5) return 'staffdoor'
  if (!vipOk && lx < 11 && ly < 9) return 'vip'
  for (const [tx, ty] of [[19.6, 3.0], [24.6, 3.0], [29.6, 3.0], [19.6, 8.6], [24.6, 8.6], [29.6, 8.6], [14.3, 3.0], [25.0, 19.6]]) if (Math.abs(lx - tx) < 1.3 && ly < ty - 0.95 && ly > ty - 2.0) return 'dealer'
  return null
}
const ZONE_LINE: Record<Exclude<Zone, null>, string> = {
  dealer: '「客人，发牌区请勿靠近。」', bar: '「吧台…里面…不对客人开放…」', staffdoor: '「员工通道。请回到场内。」', vip: '「VIP 包间。老板没有请您。」',
}

// ---------------- 运行时 ----------------
export interface StaffRt { list: StaffAgent[]; warnN: number; zoneT: number; warnCool: number; expelBy: number; serveBy: number; blockOn: boolean; gatherOn: boolean; lastZone: Zone }
const RT = new WeakMap<Engine, StaffRt>()
export function staffRt(eng: Engine): StaffRt {
  let r = RT.get(eng)
  if (!r) { r = { list: [], warnN: 0, zoneT: 0, warnCool: 0, expelBy: -1, serveBy: -1, blockOn: false, gatherOn: false, lastZone: null }; RT.set(eng, r) }
  return r
}
export const staffList = (eng: Engine): StaffAgent[] => { const r = staffRt(eng); if (!r.list.length && eng.levelDef?.id === 119) spawnStaff(eng); return r.list }
export function spawnStaff(eng: Engine) {
  const r = staffRt(eng)
  r.list = STAFF_POSTS.map((p, id) => ({ id, who: p.who, role: p.role, palette: p.palette ?? 0, x: p.x, y: p.y, yaw: p.yaw, hx: p.x, hy: p.y, hyaw: p.yaw, state: p.route ? 'patrol' : 'work', clip: p.route ? 'walk' : WORK_CLIP[p.who], clipT: (id * 0.73) % 3, seq: 0, path: [], route: p.route?.map(([x, y]) => [X(x), Y(y)] as [number, number]), ri: 0, stT: 0, waitT: 0, moving: 0 }))
  r.warnN = 0; r.zoneT = 0; r.expelBy = -1; r.serveBy = -1; r.blockOn = false; r.gatherOn = false
  return r.list
}
const setClip = (a: StaffAgent, c: string) => { if (a.clip !== c) { a.clip = c; a.clipT = 0; a.seq++ } }
const go = (a: StaffAgent, x: number, y: number) => { a.path = staffPath(a.x, a.y, x, y) }
const turnTo = (a: StaffAgent, f: number, dt: number, k = 4) => { const d = Math.atan2(Math.sin(f - a.yaw), Math.cos(f - a.yaw)); a.yaw += d * Math.min(1, dt * k) }
const speedOf = (a: StaffAgent) => (a.state === 'expel' ? CS.sprint * 0.7 : a.who === 'guard' ? CS.walkGuard : a.who === 'louie' || a.who === 'bartender' ? CS.walkHero : CS.walk)
/** 沿路径走；返回是否到达 */
function walk(eng: Engine, a: StaffAgent, dt: number): boolean {
  if (!a.path.length) { a.moving = 0; return true }
  const p = eng.player, [tx, ty] = a.path[0]
  const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy)
  // 避让玩家：前方 0.8 m 内有你 → 停；停太久侧移半步
  const pd = Math.hypot(p.x - a.x, p.y - a.y)
  if (pd < CS.avoidR && a.state !== 'expel' && ((p.x - a.x) * dx + (p.y - a.y) * dy) > 0) {
    a.waitT += dt; a.moving = 0
    if (a.waitT > CS.avoidWait) { const sx = a.x - dy / (d || 1) * 0.5, sy = a.y + dx / (d || 1) * 0.5; if (staffFreeAt(sx, sy)) { a.x = sx; a.y = sy } a.waitT = 0 }
    return false
  }
  a.waitT = 0
  const v = speedOf(a) * dt
  if (d <= v) { a.x = tx; a.y = ty; a.path.shift() } else { a.x += dx / d * v; a.y += dy / d * v }
  turnTo(a, Math.atan2(dy, dx), dt, 8)
  a.moving = 1
  setClip(a, a.state === 'expel' && a.who === 'prosthetic' ? 'sprint' : WALK_CLIP[a.who])
  return !a.path.length
}
/** 每帧（只在 119 层） */
export function stepStaff(eng: Engine, dt: number, o: { debt: boolean; vipOk: boolean; gather: { x: number; y: number } | null; serveTo: { x: number; y: number } | null; onExpel: () => void; onServed: () => void }) {
  const r = staffRt(eng), p = eng.player
  if (!r.list.length) spawnStaff(eng)
  r.warnCool = Math.max(0, r.warnCool - dt)
  // ---- 禁区检测 ----
  const z = forbiddenZone(p.x, p.y, o.vipOk)
  if (z) {
    r.zoneT += dt
    if (r.warnCool <= 0) {
      r.warnN++; r.warnCool = CS.warnCool
      const w = nearestOf(r.list, p.x, p.y, (a) => a.state !== 'expel' && a.state !== 'block')
      if (w) { w.state = 'warn'; w.stT = 0; setClip(w, WARN_CLIP[w.who]) }
      eng.msg(`${w ? w.role : '员工'}：${ZONE_LINE[z]}${r.warnN >= CS.warnMax ? '（最后一次）' : ''}`, 'lore')
    }
    if ((r.warnN > CS.warnMax || r.zoneT > CS.warnStay) && r.expelBy < 0) {
      const g = nearestOf(r.list, p.x, p.y, (a) => a.who === 'guard') ?? r.list[0]
      r.expelBy = g.id; g.state = 'expel'; g.stT = 0
    }
  } else { r.zoneT = Math.max(0, r.zoneT - dt * 2); if (r.warnCool <= 0 && r.warnN > 0 && r.zoneT === 0) r.warnN = Math.max(0, r.warnN - dt * 0.05) }
  r.lastZone = z
  // ---- 拦门 ----
  const L = casinoLayout(), doorD = Math.hypot(p.x - L.door.x, p.y - L.door.y)
  const wantBlock = o.debt && doorD < CS.blockR
  if (wantBlock !== r.blockOn) {
    r.blockOn = wantBlock
    for (const a of r.list) if (a.who === 'louie' || a.who === 'prosthetic' || a.role === '门口保安') {
      if (wantBlock) { a.state = 'block'; a.stT = 0; const k = a.who === 'louie' ? 0 : a.who === 'prosthetic' ? -1.1 : 1.1; go(a, L.door.x + k, L.door.y - 2.0) } // 4b：站到门内补光下（玩家停在门内 2.6 m）
      else if (a.state === 'block') { a.state = 'work'; go(a, a.hx, a.hy) }
    }
  }
  // ---- 野兽挑战：围住牌桌 ----
  const wantG = !!o.gather
  if (wantG !== r.gatherOn) {
    r.gatherOn = wantG
    let k = 0
    for (const a of r.list) if (a.who === 'guard' || a.who === 'waiter' || a.who === 'prosthetic') {
      if (wantG) { const ang = (k++ / 6) * Math.PI * 2; a.state = 'gather'; go(a, o.gather!.x + Math.cos(ang) * 2.6, o.gather!.y + 2.4 + Math.sin(ang) * 1.2) }
      else if (a.state === 'gather') { a.state = a.route ? 'patrol' : 'work'; go(a, a.hx, a.hy) }
    }
  }
  // ---- 送饮 ----
  if (o.serveTo && r.serveBy < 0) { const w = nearestOf(r.list, o.serveTo.x, o.serveTo.y, (a) => a.who === 'waiter' && a.state === 'patrol') ; if (w) { r.serveBy = w.id; w.state = 'serve'; w.stT = 0; go(w, o.serveTo.x, o.serveTo.y) } }
  // ---- 每个员工 ----
  for (const a of r.list) {
    a.clipT += dt; a.stT += dt
    const pd = Math.hypot(p.x - a.x, p.y - a.y), toP = Math.atan2(p.y - a.y, p.x - a.x)
    switch (a.state) {
      case 'work': {
        if (a.path.length) { walk(eng, a, dt); break }
        if (Math.hypot(a.x - a.hx, a.y - a.hy) > 0.3) { go(a, a.hx, a.hy); break }
        a.moving = 0; turnTo(a, a.hyaw, dt, 2)
        if (a.who === 'bartender') { setClip(a, a.clipT > 9 ? 'side' : 'wipe'); if (a.clip === 'side') { a.y = a.hy + Math.sin(a.stT * 0.5) * 1.2 } }
        else setClip(a, WORK_CLIP[a.who])
        if (pd < CS.watchR && a.stT > 6 && a.who !== 'waiter') { a.state = 'watch'; a.stT = 0; setClip(a, STARE_CLIP[a.who]) }
        break
      }
      case 'watch': a.moving = 0; turnTo(a, toP, dt, 3); if (a.stT > CS.watchT || pd > CS.watchR + 1) { a.state = 'work'; a.stT = 0 } break
      case 'warn': a.moving = 0; turnTo(a, toP, dt, 5); if (a.stT > 2.4) { a.state = a.route ? 'patrol' : 'work'; a.stT = 0 } break
      case 'patrol': {
        if (!a.route) { a.state = 'work'; break }
        if (!a.path.length) { a.ri = (a.ri + 1) % a.route.length; go(a, ...a.route[a.ri]) }
        walk(eng, a, dt)
        if (pd < 2.2 && a.stT > 10) { a.stT = 0; a.path = []; a.state = 'watch'; setClip(a, 'idle') }
        break
      }
      case 'serve': {
        const tx = o.serveTo?.x ?? p.x, ty = o.serveTo?.y ?? p.y
        if (Math.hypot(tx - a.x, ty - a.y) > 1.2) { if (!a.path.length || a.stT > 4) { go(a, tx, ty); a.stT = 0 } walk(eng, a, dt) }
        else { a.moving = 0; a.path = []; turnTo(a, toP, dt, 6); setClip(a, 'serve'); if (a.clipT > 2.2) { o.onServed(); r.serveBy = -1; a.state = 'patrol'; a.stT = 0 } }
        break
      }
      case 'expel': {
        if (pd > CS.expelReach) { if (!a.path.length || a.stT > 1.5) { go(a, p.x, p.y); a.stT = 0 } walk(eng, a, dt) }
        else { a.path = []; a.moving = 0; setClip(a, 'refuse'); o.onExpel(); r.expelBy = -1; r.warnN = 0; r.zoneT = 0; a.state = 'work'; go(a, a.hx, a.hy) }
        break
      }
      case 'block': if (a.path.length) walk(eng, a, dt); else { a.moving = 0; turnTo(a, toP, dt, 5); setClip(a, BLOCK_CLIP[a.who]) } break
      case 'gather': if (a.path.length) walk(eng, a, dt); else { a.moving = 0; turnTo(a, toP, dt, 3); setClip(a, STARE_CLIP[a.who]) } break
    }
  }
}
function nearestOf(list: StaffAgent[], x: number, y: number, f: (a: StaffAgent) => boolean) {
  let best: StaffAgent | null = null, bd = Infinity
  for (const a of list) { if (!f(a)) continue; const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = a } }
  return best
}
export const staffBy = (eng: Engine, who: StaffWho) => staffList(eng).find((a) => a.who === who) ?? null
export function staffSetClip(eng: Engine, who: StaffWho, clip: string, face?: number) { const a = staffBy(eng, who); if (a) { setClip(a, clip); a.stT = 0; if (face !== undefined) a.yaw = face } }
