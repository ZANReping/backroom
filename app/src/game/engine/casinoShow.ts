// [casino] Level 5.1 阶段 4b：桌面 / 机器上的实体演出（不暂停、不用菜单）。
//   规则：结果永远先由 casinoAI（casinoGames 的分布与 RTP）算出，这里只生成「能求值的时间线」，
//   渲染（renderer/casinoTables.ts）与无头 check 共用同一组函数：转轴角 → 正面符号、球相对轮角 → 格子号、
//   骰子四元数 → 朝上点数、发牌表 → 牌面。时间线在终点精确落到结果上（引导 + 末段吸附），所以视觉 = 规则。
import * as G from './casinoGames'

const TAU = Math.PI * 2
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const mod = (a: number, n: number) => ((a % n) + n) % n

// ===================================================================== 入座锚点
export type SeatKind = 'slot' | 'bj' | 'rou' | 'dice' | 'cashier' | 'drink' | 'beast'
/** 入座：玩家眼睛的位置（地图 x, y, 高 z）与朝向（yaw：forward = (−sin, −cos)），以及对应道具（局部 +Z 朝玩家） */
export interface SeatAnchor { kind: SeatKind; x: number; y: number; z: number; yaw: number; px: number; py: number; rot: number; idx: number }
export const SEAT = {
  blendSec: 0.7, // 镜头过渡
  dist: { slot: 0.74, bj: 1.08, rou: 1.02, dice: 1.12, cashier: 0, drink: 0, beast: 1.5 } as Record<SeatKind, number>,
  eye: { slot: 1.22, bj: 1.3, rou: 1.32, dice: 1.36, cashier: 1.55, drink: 1.5, beast: 1.3 } as Record<SeatKind, number>,
}
export const yawToward = (fx: number, fy: number, tx: number, ty: number) => Math.atan2(-(tx - fx), -(ty - fy))
/** 道具 (px, py, rot) 前方 dist 处坐下，面朝道具 */
export function seatAt(kind: SeatKind, px: number, py: number, rot: number, idx = 0): SeatAnchor {
  const d = SEAT.dist[kind], x = px + Math.cos(rot) * d, y = py + Math.sin(rot) * d
  return { kind, x, y, z: SEAT.eye[kind], yaw: yawToward(x, y, px, py), px, py, rot, idx }
}
/** 站立位置看向某点（兑换台 / 吧台：不坐，站在台前） */
export function standAt(kind: SeatKind, x: number, y: number, tx: number, ty: number): SeatAnchor {
  const rot = Math.atan2(y - ty, x - tx)
  return { kind, x, y, z: SEAT.eye[kind], yaw: yawToward(x, y, tx, ty), px: tx, py: ty, rot, idx: 0 }
}

// ===================================================================== 老虎机：实体转轴
/** 每条转轴 16 格（符号顺序固定，画在圆柱贴图上；第 k 格在角度 k·STEP 处） */
/** 每种符号都至少有一格紧挨 7 / TH（近失演出：赢线上 / 下一格擦过高价符号） */
export const REEL = ['樱桃', '7', 'TH', 'BAR', '空', '铃', '空', '樱桃', '空', '铃', '7', '空', 'BAR', '樱桃', '空', '铃'] as const
export const REEL_N = REEL.length, REEL_STEP = TAU / REEL_N
export const SLOT_T = { lever: 0.55, stop: [1.25, 1.75, 2.3], near: 0.35, lamp: 1.8, coinGap: 0.07, coinMax: 24 }
const HI = new Set(['7', 'TH'])
/** 第 k 格的上 / 下一格是 7 / TH */
export const reelNearHi = (k: number) => HI.has(REEL[mod(k - 1, REEL_N)]) || HI.has(REEL[mod(k + 1, REEL_N)])
/** 转轴角 θ → 赢线上的格子 / 符号 */
export const reelIndexAt = (theta: number) => mod(Math.round(theta / REEL_STEP), REEL_N)
export const reelSymAt = (theta: number) => REEL[reelIndexAt(theta)]
/** 选落点格：符号 = 结果；近失时挑「上 / 下一格是 7 / TH」的那一格（擦着赢线过去） */
function reelPick(sym: string, near: boolean, salt: number): number {
  const c: number[] = []
  for (let k = 0; k < REEL_N; k++) if (REEL[k] === sym && (!near || reelNearHi(k))) c.push(k)
  const all = c.length ? c : REEL.map((s, k) => (s === sym ? k : -1)).filter((k) => k >= 0)
  return all[Math.floor(salt * all.length) % all.length]
}
export interface SlotShow { kind: 'slot'; from: number[]; to: number[]; idx: number[]; syms: string[]; near: boolean; win: number; bet: number; jackpot: boolean; end: number }
export function slotShow(res: G.SlotResult, bet: number, prev: number[] = [0, 0, 0], salt = 0.37): SlotShow {
  const idx = res.syms.map((s, i) => reelPick(s, res.near && i === 2, (salt * (i + 1) * 7.13) % 1))
  // 每轴至少转 3 + i 圈：终角 = 落点格角 + 整圈（从上一把停的角接着转）
  const to = idx.map((k, i) => { const base = prev[i] + TAU * (3 + i); return base + mod(k * REEL_STEP - base, TAU) })
  const end = SLOT_T.stop[2] + (res.near ? SLOT_T.near : 0) + (res.win > 0 ? SLOT_T.lamp : 0.3) + Math.min(SLOT_T.coinMax, res.win) * SLOT_T.coinGap
  return { kind: 'slot', from: prev.slice(), to, idx, syms: res.syms.slice(), near: res.near, win: res.win, bet, jackpot: res.jackpot, end }
}
/** 第 i 轴在 t 秒的角度：拉杆后起转，指数减速，最后 8% 回弹吸附到落点（近失轴先冲过一格再退回） */
export function reelAngle(s: SlotShow, i: number, t: number): number {
  const t0 = SLOT_T.lever * 0.6, t1 = SLOT_T.stop[i] + (s.near && i === 2 ? SLOT_T.near : 0)
  const u = clamp01((t - t0) / (t1 - t0))
  if (u <= 0) return s.from[i]
  if (u >= 1) return s.to[i]
  const e = 1 - Math.pow(1 - u, 3)
  const over = s.near && i === 2 ? -REEL_STEP * 1.0 : -REEL_STEP * 0.18 // 冲过头（负 = 继续往前）再回到格中
  const back = u > 0.82 ? Math.sin(((u - 0.82) / 0.18) * Math.PI) * over : 0
  return s.from[i] + (s.to[i] - s.from[i]) * e + back
}
/** 拉杆 0（立）→ 1（拉到底）：0.18 s 拉下，弹簧回弹带一次过冲 */
export function leverPull(t: number): number {
  if (t < 0) return 0
  if (t < 0.18) return t / 0.18
  const u = (t - 0.18) / (SLOT_T.lever - 0.18)
  return u >= 1 ? 0 : Math.max(-0.12, Math.cos(u * Math.PI * 1.5) * (1 - u))
}
export const slotStopped = (s: SlotShow, t: number) => t >= SLOT_T.stop[2] + (s.near ? SLOT_T.near : 0)
/** 掉进托盘的硬币数（最多 coinMax 枚实体） */
export const slotCoins = (s: SlotShow, t: number) => (slotStopped(s, t) && s.win > 0 ? Math.min(Math.min(SLOT_T.coinMax, s.win), Math.floor((t - SLOT_T.stop[2] - (s.near ? SLOT_T.near : 0)) / SLOT_T.coinGap)) : 0)

// ===================================================================== 轮盘：转盘 + 球
/** 美式轮盘的真实格序（37 = 00） */
export const WHEEL = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2]
export const POCKET = TAU / WHEEL.length
export const ROU_T = { spin: 6.2, drop: 0.62, rimR: 0.4, pocketR: 0.29, wheelW: 1.4, end: 7.6 }
export interface RouShow { kind: 'rou'; n: number; slot: number; w0: number; rel0: number; relF: number; end: number; bet: number; ret: number; betKind: G.RouKind; pick: number }
export function rouShow(n: number, bet: number, ret: number, betKind: G.RouKind, pick: number, w0 = 0, salt = 0.5): RouShow {
  const slot = WHEEL.indexOf(n)
  const relF = slot * POCKET
  const rel0 = relF + TAU * (7 + Math.floor(salt * 3)) + salt * TAU // 球逆着转盘绕 7–9 圈
  return { kind: 'rou', n, slot, w0, rel0, relF, end: ROU_T.end, bet, ret, betKind, pick }
}
export const wheelAngle = (s: RouShow, t: number) => s.w0 + ROU_T.wheelW * t * (1 - 0.25 * clamp01(t / s.end))
/** 球相对转盘的角度：二次减速到落点；落入阶段（u > drop）在相邻格之间跳 3 下，幅度衰减到 0（终点精确 = relF） */
export function ballRel(s: RouShow, t: number): number {
  const u = clamp01(t / ROU_T.spin)
  const base = s.relF + (s.rel0 - s.relF) * (1 - u) * (1 - u)
  if (u <= ROU_T.drop || u >= 1) return base
  const v = (u - ROU_T.drop) / (1 - ROU_T.drop)
  return base + Math.sin(v * Math.PI * 6) * (1 - v) * (1 - v) * POCKET * 1.4
}
/** 球半径：外轨 → 下落到格子，弹跳几下 */
export function ballRadius(t: number): number {
  const u = clamp01(t / ROU_T.spin)
  if (u <= ROU_T.drop) return ROU_T.rimR
  const v = (u - ROU_T.drop) / (1 - ROU_T.drop)
  return ROU_T.pocketR + (ROU_T.rimR - ROU_T.pocketR) * Math.max(0, 1 - v * 2.2) + Math.abs(Math.sin(v * Math.PI * 5)) * (1 - v) * 0.03
}
export const ballHop = (t: number) => { const u = clamp01(t / ROU_T.spin); if (u <= ROU_T.drop || u >= 1) return 0; const v = (u - ROU_T.drop) / (1 - ROU_T.drop); return Math.abs(Math.sin(v * Math.PI * 5)) * (1 - v) * 0.025 }
/** 球所在格（相对转盘）→ 号码 */
export const pocketAt = (rel: number) => WHEEL[mod(Math.round(rel / POCKET), WHEEL.length)]
/** 桌面下注区（局部坐标 u ∈ [−1, 1] 横向、v ∈ [−1, 1] 纵向，+v 朝玩家）：上 3 行 12 列号码，下排红 / 黑 / 单 / 双 */
export function rouCell(u: number, v: number): { kind: G.RouKind; pick: number } | null {
  if (u < -1 || u > 1 || v < -1 || v > 1) return null
  if (v > 0.45) { const c = Math.min(3, Math.floor((u + 1) * 2)); return { kind: (['red', 'black', 'odd', 'even'] as const)[c], pick: 0 } }
  if (u < -0.86) return { kind: 'num', pick: v < -0.27 ? 37 : 0 } // 0 / 00
  const col = Math.min(11, Math.floor((u + 0.86) / 1.86 * 12)), row = Math.min(2, Math.floor((v + 1) / 1.45 * 3))
  return { kind: 'num', pick: col * 3 + (3 - row) }
}

// ===================================================================== 骰宝：骰盅 + 三颗骰子
export const DICE_T = { shake: 1.4, lift: 1.9, settle: 2.5, end: 4.2 }
/** 骰子局部面法线 → 点数（单位立方体：+Y 1、−Y 6、+Z 2、−Z 5、+X 3、−X 4；对面和为 7） */
export const DIE_FACES: [number, number, number, number][] = [[0, 1, 0, 1], [0, -1, 0, 6], [0, 0, 1, 2], [0, 0, -1, 5], [1, 0, 0, 3], [-1, 0, 0, 4]]
type Q = [number, number, number, number]
const qAxis = (ax: number, ay: number, az: number, a: number): Q => { const s = Math.sin(a / 2); return [ax * s, ay * s, az * s, Math.cos(a / 2)] }
const qMul = (a: Q, b: Q): Q => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]
/** 点数 v 朝上、绕竖轴转 yaw 的四元数 [x, y, z, w]（three.js 约定） */
export function dieQuat(v: number, yaw: number): Q {
  const tilt: Q = v === 1 ? [0, 0, 0, 1] : v === 6 ? qAxis(1, 0, 0, Math.PI) : v === 2 ? qAxis(1, 0, 0, -Math.PI / 2) : v === 5 ? qAxis(1, 0, 0, Math.PI / 2) : v === 3 ? qAxis(0, 0, 1, Math.PI / 2) : qAxis(0, 0, 1, -Math.PI / 2)
  return qMul(qAxis(0, 1, 0, yaw), tilt)
}
/** 四元数 → 朝上点数（把 6 个面法线转到世界，取 y 最大的） */
export function dieUp(q: Q): number {
  let best = 0, by = -2
  for (const [x, y, z, v] of DIE_FACES) {
    // v' = q · v · q⁻¹ 的 y 分量
    const [qx, qy, qz, qw] = q, tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x)
    const wy = y + qw * ty + (qz * tx - qx * tz)
    if (wy > by) { by = wy; best = v }
  }
  return best
}
export interface DiceShow { kind: 'dice'; d: number[]; yaw: number[]; pos: [number, number][]; end: number; bet: number; ret: number; betKind: G.DiceKind; pick: number }
export function diceShow(d: number[], bet: number, ret: number, betKind: G.DiceKind, pick: number, salt = 0.3): DiceShow {
  const pos: [number, number][] = [[-0.06, 0.02], [0.05, -0.04], [0.01, 0.07]]
  return { kind: 'dice', d: d.slice(), yaw: d.map((_, i) => (salt * 5.1 + i * 2.2) % TAU), pos, end: DICE_T.end, bet, ret, betKind, pick }
}
/** 骰子 i 在 t 时的四元数：盅内翻滚（看不见）→ 揭盅前已落定到结果（最后 0.6 s slerp 吸附） */
export function dieAt(s: DiceShow, i: number, t: number): Q {
  const f = dieQuat(s.d[i], s.yaw[i])
  if (t >= DICE_T.settle) return f
  const k = Math.max(0, (DICE_T.settle - t) / DICE_T.settle)
  const tumble = qMul(qAxis(0.6, 0.48, 0.64, k * 19 + i), qAxis(1, 0, 0, k * 11 * (i + 1)))
  return qMul(f, qAxis(...norm3(tumble[0], tumble[1], tumble[2]), 2 * Math.acos(Math.min(1, Math.abs(tumble[3]))) * k))
}
const norm3 = (x: number, y: number, z: number): [number, number, number] => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l] }
/** 骰盅：0 平放 → 摇（荷官端起左右晃）→ 揭开抬起 */
export function cupAt(t: number): { lift: number; shake: number } {
  if (t < DICE_T.shake) return { lift: 0.06, shake: Math.sin(t * 26) * (1 - t / DICE_T.shake) }
  if (t < DICE_T.lift) return { lift: 0.06 * (1 - (t - DICE_T.shake) / (DICE_T.lift - DICE_T.shake)), shake: 0 }
  return { lift: Math.min(0.32, (t - DICE_T.lift) * 0.8), shake: 0 }
}
export function diceCell(u: number, v: number): { kind: G.DiceKind; pick: number } | null {
  if (u < -1 || u > 1 || v < -1 || v > 1) return null
  if (v < 0) { const c = Math.min(3, Math.floor((u + 1) * 2)); return { kind: (['small', 'odd', 'even', 'big'] as const)[c], pick: 1 } }
  return { kind: 'num', pick: Math.min(6, 1 + Math.floor((u + 1) * 3)) }
}

// ===================================================================== 21 点 / 野兽：发牌
export interface DealtCard { c: G.Card; who: 'p' | 'd'; slot: number; t0: number; up: boolean }
export const DEAL_T = { gap: 0.38, slide: 0.42, flip: 0.25, collect: 1.6 }
/** 增量同步：把规则状态里新出现的牌按出现顺序排进发牌表；庄家暗牌（第 2 张）在 done 前背面朝上 */
export function syncDeal(list: DealtCard[], player: G.Card[], dealer: G.Card[], done: boolean, now: number): DealtCard[] {
  const np = list.filter((c) => c.who === 'p').length, nd = list.filter((c) => c.who === 'd').length
  if (np > player.length || nd > dealer.length || (list.length && player.length && list[0].c !== player[0])) list.length = 0 // 新一局（首张牌对象换了）
  let t = Math.max(now, ...list.map((c) => c.t0 + DEAL_T.gap))
  const p0 = list.filter((c) => c.who === 'p').length, d0 = list.filter((c) => c.who === 'd').length
  // 首发 P D P D 交替
  for (let i = 0; i < Math.max(player.length - p0, dealer.length - d0); i++) {
    if (p0 + i < player.length) { list.push({ c: player[p0 + i], who: 'p', slot: p0 + i, t0: t, up: true }); t += DEAL_T.gap }
    if (d0 + i < dealer.length) { list.push({ c: dealer[d0 + i], who: 'd', slot: d0 + i, t0: t, up: d0 + i !== 1 }); t += DEAL_T.gap }
  }
  if (done) for (const c of list) c.up = true
  return list
}
/** 桌面落点（桌局部：+Z 朝玩家；玩家牌在下注圈前，庄家牌在牌靴旁） */
export function cardSpot(who: 'p' | 'd', slot: number): [number, number, number] {
  return who === 'p' ? [-0.12 + slot * 0.085, 0.872 + slot * 0.0012, 0.2 - slot * 0.004] : [-0.12 + slot * 0.085, 0.872 + slot * 0.0012, -0.32]
}
export const SHOE: [number, number, number] = [0.6, 0.94, -0.5]
/** 牌在 t 时的位置与翻面角（0 = 背面，π = 正面） */
export function cardAt(c: DealtCard, t: number): { p: [number, number, number]; flip: number; shown: boolean } {
  const u = clamp01((t - c.t0) / DEAL_T.slide), e = 1 - Math.pow(1 - u, 2), to = cardSpot(c.who, c.slot)
  const p: [number, number, number] = [SHOE[0] + (to[0] - SHOE[0]) * e, SHOE[1] + (to[1] - SHOE[1]) * e + Math.sin(u * Math.PI) * 0.03, SHOE[2] + (to[2] - SHOE[2]) * e]
  const fu = c.up ? clamp01((t - c.t0 - DEAL_T.slide) / DEAL_T.flip) : 0
  return { p, flip: fu * Math.PI, shown: t >= c.t0 }
}
/** 牌面朝上（翻面角过半）的牌 → 用来校验「桌面牌面 = 规则结果」 */
export const visibleFaces = (list: DealtCard[], who: 'p' | 'd', t: number) => list.filter((c) => c.who === who && cardAt(c, t).flip > Math.PI / 2).map((c) => c.c)

// ===================================================================== 筹码实体
export const CHIP_VAL = { red: 1, blue: 5, yellow: 10, green: 20 } as const
/** 桌面筹码堆：按面额拆（同 chipDenoms），每摞最多 20 枚，超出另起一摞；返回每枚筹码的面额序列（实体数 = 序列长度） */
export function chipStacks(n: number): { color: keyof typeof CHIP_VAL; stack: number; h: number }[] {
  n = Math.max(0, Math.floor(n))
  const out: { color: keyof typeof CHIP_VAL; stack: number; h: number }[] = []
  let stack = 0
  for (const color of ['green', 'yellow', 'blue', 'red'] as const) {
    let k = Math.floor(n / CHIP_VAL[color]); n -= k * CHIP_VAL[color]
    let h = 0
    if (k) { while (k-- > 0) { out.push({ color, stack, h }); if (++h >= 20) { h = 0; stack++ } } if (h) stack++ }
  }
  return out
}
export const chipStackValue = (s: ReturnType<typeof chipStacks>) => s.reduce((a, c) => a + CHIP_VAL[c.color], 0)

export type Show = SlotShow | RouShow | DiceShow
