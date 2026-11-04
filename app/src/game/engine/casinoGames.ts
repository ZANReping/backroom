// [casino] Level 5.1 阶段 4：四种游戏的纯规则（无引擎依赖，node / check 可直接跑蒙特卡洛）。
//   老虎机：三轴加权滚轮 + 赔率表 + 近失（输局里前两轴同为高价符号、第三轴停在相邻格——只改「看起来」，不改结果分布）
//   21 点：无限牌靴；庄家软 17 要牌；黑杰克 1:1；只有要牌 / 停牌 / 加倍（不分牌、不保险）
//   轮盘：美式双零 38 格；红黑 / 单双 1:1、单号 35:1
//   掷骰（plan.md「骰子」，按骰宝做）：三颗骰；大小 1:1（围骰通杀）、单双 1:1（围骰通杀）、单点 1/2/3 倍
//   野兽双人 21 点：三局两胜；第一局让你赢（20 对 17），之后发牌被操纵（理智高能看穿一点）
// 赌场优势：每种玩法 RTP 落在 CG.rtpRange（0.92–0.975），check:casino 用 10 万局蒙特卡洛验。
export type Rng = () => number
/** 可复现 RNG（mulberry32） */
export function mkRng(seed: number): Rng {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** 数值表（游戏） */
export const CG = {
  rtpRange: [0.92, 0.975] as const,
  // ---- 老虎机 ----
  slotSyms: ['TH', '7', 'BAR', '铃', '樱桃', '空'] as const,
  slotZh: { TH: 'TH', '7': '7', BAR: 'BAR', 铃: '铃', 樱桃: '樱', 空: '—' } as Record<string, string>,
  /** 每轴权重（三轴相同，合计 64） */
  slotW: [1, 3, 6, 10, 12, 32],
  /** 三连赔付（含本金的总返还倍数）：TH 头奖 / 7 / BAR / 铃 / 樱桃 */
  slotPay3: { TH: 2000, '7': 200, BAR: 50, 铃: 25, 樱桃: 10 } as Record<string, number>,
  slotCherry2: 4, // 任意两颗樱桃
  slotCherry1: 1, // 一颗樱桃（退本金）
  slotNearMiss: 0.55, // 前两轴高价符号、第三轴落空时显示「近失」的概率
  slotBets: [1, 5],
  // ---- 21 点 ----
  bjPayBJ: 1, // 黑杰克只赔 1:1（赌场把 3:2 改了）
  bjMin: 5, bjMax: 100,
  // ---- 轮盘 ----
  rouPockets: 38, // 0 / 00 / 1–36
  rouRed: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],
  rouMin: 5, rouMax: 100,
  // ---- 骰宝 ----
  diceMin: 5, diceMax: 100,
  // ---- 野兽双人 21 点 ----
  beastHands: 3, beastNeed: 2, beastRig: 0.85, beastRigSharp: 0.7, beastSharpSan: 80,
}

// ===================== 老虎机 =====================
export type SlotSym = (typeof CG.slotSyms)[number]
const SW_SUM = CG.slotW.reduce((a, b) => a + b, 0)
function reel(r: Rng): number { let x = r() * SW_SUM; for (let i = 0; i < CG.slotW.length; i++) { x -= CG.slotW[i]; if (x < 0) return i } return CG.slotW.length - 1 }
export function slotPay(s: SlotSym[]): number {
  if (s[0] === s[1] && s[1] === s[2] && CG.slotPay3[s[0]]) return CG.slotPay3[s[0]]
  const ch = s.filter((x) => x === '樱桃').length
  return ch >= 2 ? CG.slotCherry2 : ch === 1 ? CG.slotCherry1 : 0
}
export interface SlotResult { syms: SlotSym[]; mul: number; win: number; near: boolean; jackpot: boolean }
export function slotSpin(r: Rng, bet: number): SlotResult {
  const syms = [reel(r), reel(r), reel(r)].map((i) => CG.slotSyms[i]) as SlotSym[]
  const mul = slotPay(syms)
  const hi = (x: SlotSym) => x === 'TH' || x === '7'
  // 近失：输局（mul 0）里，若前两轴恰好同为高价，第三轴停在「上一格」——纯展示
  let near = false
  if (mul === 0 && syms[0] === syms[1] && hi(syms[0])) near = true
  else if (mul === 0 && r() < CG.slotNearMiss * 0.12) { near = true } // 少量「第三轴擦边」演出（依旧是输局）
  return { syms, mul, win: bet * mul, near, jackpot: mul === CG.slotPay3.TH }
}
/** 精确 RTP（枚举） */
export function slotExactRTP(): number {
  let e = 0
  const n = CG.slotSyms.length
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) {
    const p = (CG.slotW[a] * CG.slotW[b] * CG.slotW[c]) / SW_SUM ** 3
    e += p * slotPay([CG.slotSyms[a], CG.slotSyms[b], CG.slotSyms[c]] as SlotSym[])
  }
  return e
}

// ===================== 21 点 =====================
export const SUITS = ['♠', '♥', '♦', '♣'] as const
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
export interface Card { r: number; s: number } // r 0..12（A..K）
export const cardStr = (c: Card) => SUITS[c.s] + RANKS[c.r]
export const draw = (r: Rng): Card => ({ r: Math.floor(r() * 13), s: Math.floor(r() * 4) })
const cv = (c: Card) => (c.r === 0 ? 1 : Math.min(10, c.r + 1))
export function handVal(h: Card[]): { v: number; soft: boolean } {
  let v = 0, a = 0
  for (const c of h) { v += cv(c); if (c.r === 0) a++ }
  const soft = a > 0 && v + 10 <= 21
  return { v: soft ? v + 10 : v, soft }
}
export const isBJ = (h: Card[]) => h.length === 2 && handVal(h).v === 21
export interface BjState { bet: number; player: Card[]; dealer: Card[]; done: boolean; doubled: boolean; result?: 'win' | 'lose' | 'push' | 'bj'; payout: number }
export function bjDeal(r: Rng, bet: number): BjState {
  const s: BjState = { bet, player: [draw(r), draw(r)], dealer: [draw(r), draw(r)], done: false, doubled: false, payout: 0 }
  if (isBJ(s.player) || isBJ(s.dealer)) bjSettle(r, s, false)
  return s
}
function dealerPlay(r: Rng, s: BjState) { for (;;) { const d = handVal(s.dealer); if (d.v < 17 || (d.v === 17 && d.soft)) s.dealer.push(draw(r)); else break } }
/** 结算：payout = 返还总额（含本金） */
export function bjSettle(r: Rng, s: BjState, play = true) {
  const pb = isBJ(s.player), db = isBJ(s.dealer)
  const pv = handVal(s.player).v
  if (pb || db) { s.result = pb && db ? 'push' : pb ? 'bj' : 'lose' }
  else if (pv > 21) s.result = 'lose'
  else {
    if (play) dealerPlay(r, s)
    const dv = handVal(s.dealer).v
    s.result = dv > 21 || pv > dv ? 'win' : pv === dv ? 'push' : 'lose'
  }
  s.payout = s.result === 'bj' ? s.bet * (1 + CG.bjPayBJ) : s.result === 'win' ? s.bet * 2 : s.result === 'push' ? s.bet : 0
  s.done = true
  return s
}
export function bjHit(r: Rng, s: BjState) { if (s.done) return s; s.player.push(draw(r)); if (handVal(s.player).v > 21) bjSettle(r, s, false); else if (handVal(s.player).v === 21) bjSettle(r, s); return s }
export function bjStand(r: Rng, s: BjState) { if (!s.done) bjSettle(r, s); return s }
export function bjDouble(r: Rng, s: BjState) { if (s.done || s.player.length !== 2) return s; s.bet *= 2; s.doubled = true; s.player.push(draw(r)); return bjSettle(r, s, handVal(s.player).v <= 21) }
/** check 用的简化基本策略 */
export function bjAuto(r: Rng, s: BjState) {
  const up = cv(s.dealer[0]) === 1 ? 11 : cv(s.dealer[0])
  while (!s.done) {
    const { v, soft } = handVal(s.player)
    if (s.player.length === 2 && !soft && (v === 11 || (v === 10 && up <= 9) || (v === 9 && up >= 3 && up <= 6))) { bjDouble(r, s); break }
    const hit = soft ? v <= 17 || (v === 18 && up >= 9) : v <= 11 || (v <= 16 && up >= 7) || (v === 12 && up <= 3)
    if (hit) bjHit(r, s); else bjStand(r, s)
  }
  return s
}

// ===================== 轮盘 =====================
export type RouKind = 'red' | 'black' | 'odd' | 'even' | 'num'
/** 0 = 0、37 = 00 */
export const rouColor = (n: number) => (n === 0 || n === 37 ? 'green' : CG.rouRed.includes(n) ? 'red' : 'black')
export const rouLabel = (n: number) => (n === 37 ? '00' : String(n))
export function rouSpin(r: Rng) { return Math.floor(r() * CG.rouPockets) }
export function rouPay(n: number, kind: RouKind, pick = 0): number {
  if (n === 0 || n === 37) return kind === 'num' && pick === n ? 36 : 0
  switch (kind) {
    case 'red': return rouColor(n) === 'red' ? 2 : 0
    case 'black': return rouColor(n) === 'black' ? 2 : 0
    case 'odd': return n % 2 === 1 ? 2 : 0
    case 'even': return n % 2 === 0 ? 2 : 0
    case 'num': return n === pick ? 36 : 0
  }
}

// ===================== 骰宝 =====================
export type DiceKind = 'big' | 'small' | 'odd' | 'even' | 'num'
export const rollDice = (r: Rng): number[] => [0, 0, 0].map(() => 1 + Math.floor(r() * 6))
export function dicePay(d: number[], kind: DiceKind, pick = 1): number {
  const sum = d[0] + d[1] + d[2], triple = d[0] === d[1] && d[1] === d[2]
  switch (kind) {
    case 'big': return !triple && sum >= 11 ? 2 : 0
    case 'small': return !triple && sum <= 10 ? 2 : 0
    case 'odd': return !triple && sum % 2 === 1 ? 2 : 0
    case 'even': return !triple && sum % 2 === 0 ? 2 : 0
    case 'num': { const k = d.filter((x) => x === pick).length; return k ? 1 + k : 0 }
  }
}

// ===================== 野兽双人 21 点 =====================
export interface BeastMatch { hand: number; pw: number; bw: number; player: Card[]; beast: Card[]; done: boolean; over: boolean; won?: boolean; log: string[]; rig: number }
export function beastStart(sanity: number): BeastMatch {
  return { hand: 0, pw: 0, bw: 0, player: [], beast: [], done: true, over: false, log: [], rig: sanity >= CG.beastSharpSan ? CG.beastRigSharp : CG.beastRig }
}
const C = (r: number, s: number): Card => ({ r, s })
export function beastDeal(r: Rng, m: BeastMatch) {
  if (m.over || !m.done) return m
  m.done = false
  if (m.hand === 0) { m.player = [C(11, 2), C(9, 3)]; m.beast = [C(12, 0), C(6, 1)] } // 让你一局：Q+10 = 20 对 K+7 = 17
  else { m.player = [draw(r), draw(r)]; m.beast = [draw(r), draw(r)] }
  return m
}
function beastFinish(r: Rng, m: BeastMatch) {
  const pv = handVal(m.player).v
  if (m.hand === 0) { /* 第一局：他停在 17 */ }
  else if (pv <= 21 && r() < m.rig) {
    // 操纵：牌自己翻成刚好压过你的点数（或黑杰克）
    const want = pv >= 21 ? 21 : pv + 1 + Math.floor(r() * (21 - pv))
    m.beast = [C(12, 0), want === 21 ? C(0, 0) : C(Math.max(1, Math.min(9, want - 11)), 0)]
    if (handVal(m.beast).v <= pv) m.beast = [C(12, 0), C(0, 0)]
  } else dealerPlay(r, { bet: 0, player: m.player, dealer: m.beast, done: false, doubled: false, payout: 0 })
  const bv = handVal(m.beast).v
  const pWin = pv <= 21 && (bv > 21 || pv > bv), tie = pv <= 21 && bv === pv
  if (tie) m.log.push(`第 ${m.hand + 1} 局平（${pv}）——重发`)
  else { if (pWin) m.pw++; else m.bw++; m.log.push(`第 ${m.hand + 1} 局：你 ${pv > 21 ? '爆牌' : pv} 对 他 ${bv > 21 ? '爆牌' : bv} → ${pWin ? '你赢' : '他赢'}`); m.hand++ }
  m.done = true
  if (m.pw >= CG.beastNeed || m.bw >= CG.beastNeed) { m.over = true; m.won = m.pw >= CG.beastNeed }
  return m
}
export function beastHit(r: Rng, m: BeastMatch) { if (m.done) return m; if (m.hand === 0) { m.log.push('他按住了你的手：「20 点还要？别贪。」'); return m } m.player.push(draw(r)); if (handVal(m.player).v >= 21) beastFinish(r, m); return m } // 第一局他不让你爆
export function beastStand(r: Rng, m: BeastMatch) { if (!m.done) beastFinish(r, m); return m }
export function beastAuto(r: Rng, m: BeastMatch) { while (!m.over) { beastDeal(r, m); while (!m.done) { if (handVal(m.player).v < 17) beastHit(r, m); else beastStand(r, m) } } return m }
