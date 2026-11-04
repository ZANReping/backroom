// [casino] Level 5.1「恐怖旅馆赌场盛大开幕」
//   阶段 1：营业时钟 / L5 大门 / 进出 / 野兽第二次关注度满 → 拖进赌场（紫筹码 −50）。
//   阶段 4（机制）：员工（engine/casinoStaff）· 筹码经济（普通筹码 ≥ 0 + 紫筹码可负）· 兑换台（Louie：物品 / 理智 / 记忆 → 筹码；筹码 → 奖品 + 稀有池）
//                  · 四种游戏（engine/casinoGames：老虎机 / 21 点 / 轮盘 / 骰宝；覆盖层菜单 CasinoMenu，暂停）· 操纵与上瘾（前几把偏赢、近失、连输送酒、
//                  「再玩一把」、离场减速 + 心声、场内无钟 / 时间加速）· 紫筹码为负拦门 · 野兽双人 21 点（≤ −200 强制 / 头奖邀请）→ 赢：清债 + 三倍奖励；输：专属结局。
// 内部 level id = 119（CASINO_LEVEL）：口袋房间同款独立 id（117 野兽办公室 / 118 大堂之后），displayId 5.1，只经 levelDefOf 解析。
import { o666BigWin, O666T } from './l5Objects' // [l5items]
import type { Engine } from '../engine'
import { rememberOutpostEntry } from './outpostReturn'
import type { Structure } from '../core/types'
import { look } from '../renderer/shared'
import * as SH from './casinoShow'
import { audio } from '../core/audio'
import { CASINO_DOOR } from '../world/infiniteL5'
import { casinoLayout, OX, OY } from '../content/casinoLayout'
import { ITEMS } from '../content/items'
import { stepStaff, spawnStaff, staffSetClip, staffRt } from './casinoStaff'
import * as G from './casinoGames'

export const CASINO_LEVEL = 119
/** 数值表（全部列在 app/CASINO-REMAKE.md） */
export const CA = {
  openSec: 16 * 60, // 营业 16 分钟（游戏时间压缩：16 时 → 16 分钟）
  closedSec: 8 * 60, // 打烊 8 分钟
  door: CASINO_DOOR, // 大门：floor 层（每局一处，离出生大厅格最近的贝弗莉室北墙正中）/ r 找贝弗莉室的大厅格半径 / halfW 门头占北墙 ±3 格（world/infiniteL5）
  enterDepth: 0.62, // 贴近门面 0.62 m 内并面朝大门 → 进入
  purpleDebt: -50, // 野兽第二次关注度满：拖进赌场，紫色筹码余额 −50
  closeKickSec: 30, // 打烊后仍在场内：30 s 后员工清场（正余额送出大门；负余额 = 打烊加班）
  // ---- 筹码 ----
  chip: { red: 1, blue: 5, yellow: 10, green: 20 },
  purpleFloor: -400, // 紫筹码最低能欠到 −400（再低就不让下注）
  beastDebt: -200, // 紫筹码 ≤ −200：野兽到场，双人 21 点
  closeWork: 30, closeWorkSan: 8, // 负余额遇上打烊：替赌场加班一轮，抵债 30、理智 −8
  // ---- 兑换台（物品 → 筹码；维基价）----
  sell: { almond: 2, royalration: 20, babelbalm: 40, memoryjuice: 4, firesalt: 10, saltbox: 25, bottledwater: 1, snackbar: 1, bandage: 2, battery: 2 } as Record<string, number>,
  sanSell: 10, sanSellChips: 5, sanSellMin: 25, // 理智 −10 → 5 红；理智低于 25 不收
  memSellChips: 8, // 一段记忆（每次来访一次）→ 8 红；你会忘掉读过的旅馆告示
  // ---- 奖品（筹码 → 物品）；稀有池 ----
  prize: { almond: 3, bottledwater: 2, snackbar: 2, bandage: 3, battery: 3, firesalt: 14, babelbalm: 48, memoryjuice: 8, royalration: 30, traumakit: 40 } as Record<string, number>,
  rare: { silencejuice: 500, mysteryegg: 150, warpberry: 120, fatedie: 150 } as Record<string, number>,
  // ---- 操纵与上瘾 ----
  earlyN: 5, earlyFlip: 0.5, // 前 5 把：输局有 50% 重摇一次（「新手运」）
  seeSan: 70, // 理智 ≥ 70 能看出动手脚（字幕提示）
  drinkStreak: 3, drinkSan: 8, drinkAfterSan: -4, drunkSec: 150, drunkBetMul: 2, barDrinkCost: 2,
  addictPlay: 2.5, addictNear: 6, addictWin: 4, addictDecay: 0.02, addictDecayOut: 0.1, // 每秒衰减（场内 / 场外）
  addictSlow: 0.35, slowR: 12, // 上瘾 100 时离大门 12 m 内移动 −35%
  againAt: 30, againSan: 3, // 上瘾 ≥ 30 关菜单先问「再玩一把？」；硬走 −3 理智
  voiceAt: 35, voiceGap: [16, 30] as [number, number],
  timeWarp: 1.6, warpDrain: 0.012, // 场内无钟：时间感 ×1.6；饥渴额外流失 / 秒
  // ---- 野兽挑战 ----
  beastReward: 150, beastBoon: 'royalration',
  blockY: 2.6, // 负数拦门：玩家停在门内 2.6 m（员工站门内 2.0 m 的补光下）
}
export type CasinoGame = 'slot' | 'bj' | 'rou' | 'dice'
export interface CasinoSave {
  purple: number; drags: number; visits: number
  chips: number; pchip: number; addict: number; again: number; drinks: number; plays: number; streak: number; drunkT: number; memSold: number
  ending: number; beastWon: number; jackpots: number; warpSec: number
  stats: Record<CasinoGame, [number, number]> // [下注总额, 返还总额]
  ledger: { exIn: number; prizeOut: number; bets: number; rets: number; debtIn: number; work: number; boon: number; bar: number }
}
const freshStats = (): Record<CasinoGame, [number, number]> => ({ slot: [0, 0], bj: [0, 0], rou: [0, 0], dice: [0, 0] })
const freshLedger = () => ({ exIn: 0, prizeOut: 0, bets: 0, rets: 0, debtIn: 0, work: 0, boon: 0, bar: 0 })
export function freshCasinoSave(): CasinoSave { return { purple: 0, drags: 0, visits: 0, chips: 0, pchip: 0, addict: 0, again: 0, drinks: 0, plays: 0, streak: 0, drunkT: 0, memSold: 0, ending: 0, beastWon: 0, jackpots: 0, warpSec: 0, stats: freshStats(), ledger: freshLedger() } }
export function restoreCasinoSave(r: unknown): CasinoSave {
  const o = (r && typeof r === 'object' ? r : {}) as Partial<CasinoSave>
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0), p = (v: unknown) => Math.max(0, n(v))
  const st = freshStats(); for (const k of Object.keys(st) as CasinoGame[]) { const a = (o.stats as Record<string, unknown> | undefined)?.[k]; if (Array.isArray(a)) st[k] = [p(a[0]), p(a[1])] }
  const lg = freshLedger(); for (const k of Object.keys(lg) as (keyof typeof lg)[]) lg[k] = n((o.ledger as Record<string, unknown> | undefined)?.[k])
  if (!o.ledger) lg.debtIn = n(o.purple) + 0 - p(o.chips) * 0 // 阶段 1 旧档：现有紫筹码余额全记为初始债
  return {
    purple: n(o.purple), drags: p(o.drags), visits: p(o.visits), chips: p(o.chips), pchip: o.pchip || (o.pchip === undefined && n(o.purple) !== 0) ? 1 : 0, addict: Math.min(100, p(o.addict)), again: p(o.again), drinks: p(o.drinks), plays: p(o.plays),
    streak: p(o.streak), drunkT: p(o.drunkT), memSold: p(o.memSold), ending: o.ending ? 1 : 0, beastWon: p(o.beastWon), jackpots: p(o.jackpots), warpSec: p(o.warpSec), stats: st, ledger: lg,
  }
}
export const casinoSave = (eng: Engine): CasinoSave => {
  const h = eng.hotel
  if (!h.casino) h.casino = freshCasinoSave()
  else if (!h.casino.stats) h.casino = restoreCasinoSave(h.casino) // 阶段 1 旧档补字段
  return h.casino
}

/** 营业状态（纯函数）：每局按种子错开相位 */
export function casinoPhase(seed: number, t: number): { open: boolean; left: number } {
  const P = CA.openSec + CA.closedSec
  const k = (((t + (seed % 997) * 7) % P) + P) % P
  return k < CA.openSec ? { open: true, left: CA.openSec - k } : { open: false, left: P - k }
}
export const casinoOpen = (eng: Engine) => casinoPhase(eng.seed, eng.time).open

/** L5 大门结构：靠门格 + 门面法线（门在格子北侧 → 玩家从南面走向北） */
function nearDoor(eng: Engine): Structure | null {
  const m = eng.map, p = eng.player
  if (!m) return null
  for (const s of m.structures) {
    if (s.kind !== 'casinodoor') continue
    const cx = s.x + 0.5, wallY = s.y // 北墙内表面 y = s.y
    if (Math.abs(p.x - cx) < 1.6 && p.y - wallY < CA.enterDepth + 0.35 && p.y > wallY - 0.1) return s
  }
  return null
}

// ===================================================================== 运行时
export type MenuMode = 'cashier' | CasinoGame | 'drink' | 'beast' | 'ending'
export interface CasinoMenu {
  mode: MenuMode; bet: number; line: string; again: number; table: string
  slot?: G.SlotResult; bj?: G.BjState; rou?: { n: number; kind: G.RouKind; pick: number; ret: number }; dice?: { d: number[]; kind: G.DiceKind; pick: number; ret: number }
  beast?: G.BeastMatch; forced?: boolean; drinkOffer?: number; invite?: number; rig?: string
}
interface Rt {
  lockMsgT: number; closedT: number; menu: CasinoMenu | null; rng: G.Rng
  voice: { text: string; t: number } | null; voiceT: number; blockMsgT: number; wasIn: number; visitT: number
  serveTo: { x: number; y: number } | null; beast: { x: number; y: number; yaw: number; clip: string } | null; worked: number
  /** 阶段 4b：入座（不暂停）。blend 0→1 镜头过渡，leave 起身中；show 当前实体演出（先算结果）；deal 发牌表；drinkT 端杯喝的动作 */
  seat: { a: SH.SeatAnchor; blend: number; leave: number; y0?: number; p0?: number } | null; show: { s: SH.Show; t: number } | null; deal: SH.DealtCard[]; clock: number; reels: number[]; wheel: number; drinkT: number; glass: number; xch: { t: number; what: string } | null
}
const RT = new WeakMap<Engine, Rt>()
const rt = (eng: Engine) => { let r = RT.get(eng); if (!r) { r = { lockMsgT: 0, closedT: 0, menu: null, rng: Math.random, voice: null, voiceT: 12, blockMsgT: 0, wasIn: 0, visitT: 0, serveTo: null, beast: null, worked: 0, seat: null, show: null, deal: [], clock: 0, reels: [0, 0, 0], wheel: 0, drinkT: 0, glass: 0, xch: null }; RT.set(eng, r) } return r }
/** check：固定随机源 */
export function casinoSetRng(eng: Engine, r: G.Rng) { rt(eng).rng = r }
const inCasino = (eng: Engine) => eng.levelDef.id === CASINO_LEVEL
const X = (v: number) => OX + v, Y = (v: number) => OY + v

// ===================================================================== 钱包
/** 能动用的总额（普通筹码 + 紫筹码可欠到 purpleFloor） */
export function casinoFunds(eng: Engine) { const s = casinoSave(eng); return s.chips + (s.pchip ? s.purple - CA.purpleFloor : 0) }
export const casinoDebt = (eng: Engine) => Math.min(0, casinoSave(eng).purple)
export const casinoCanLeave = (eng: Engine) => casinoSave(eng).purple >= 0
/** 下注：先扣普通筹码，不够再从紫筹码里欠 */
function pay(eng: Engine, amt: number): boolean {
  const s = casinoSave(eng)
  if (amt <= 0 || casinoFunds(eng) < amt) return false
  const a = Math.min(s.chips, amt); s.chips -= a
  if (amt - a > 0) s.purple -= amt - a
  return true
}
/** 入账：紫筹码在场时，赢的进紫筹码（数字随输赢浮动）；否则进普通筹码。为负先还债。 */
function credit(eng: Engine, amt: number) {
  const s = casinoSave(eng)
  if (amt <= 0) return
  if (amt >= O666T.bigWin && o666BigWin(eng, amt, (t) => eng.addItem(t))) eng.addItem('diereceipt') // [l5items] 一掷千金送命运之骰
  if (s.pchip) { s.purple += amt; if (s.purple === 0) purpleVanish(eng) } else s.chips += amt
}
function purpleVanish(eng: Engine) { const s = casinoSave(eng); if (!s.pchip) return; s.pchip = 0; eng.msg('紫色筹码中间的数字跳成 0——它在你掌心里化掉了，像从来没有过。', 'lore') }
/** 兑换所得：先还紫筹码的债，剩下的进普通筹码 */
function exchangeIn(eng: Engine, amt: number) {
  const s = casinoSave(eng)
  s.ledger.exIn += amt
  if (s.purple < 0) { const k = Math.min(-s.purple, amt); s.purple += k; amt -= k; if (s.purple === 0 && s.pchip) purpleVanish(eng) }
  s.chips += amt
}
/** 筹码按面额拆（红 1 / 蓝 5 / 黄 10 / 绿 20） */
export function chipDenoms(n: number) { n = Math.max(0, Math.floor(n)); const g = Math.floor(n / 20); n -= g * 20; const y = Math.floor(n / 10); n -= y * 10; const b = Math.floor(n / 5); n -= b * 5; return { green: g, yellow: y, blue: b, red: n } }

// ===================================================================== 菜单（覆盖层：暂停游戏）
const MIN: Record<CasinoGame, number> = { slot: G.CG.slotBets[0], bj: G.CG.bjMin, rou: G.CG.rouMin, dice: G.CG.diceMin }
const MAX: Record<CasinoGame, number> = { slot: G.CG.slotBets[1], bj: G.CG.bjMax, rou: G.CG.rouMax, dice: G.CG.diceMax }
/** 默认下注：喝了酒 ×2、越上瘾越高（判断力下降） */
export function casinoDefaultBet(eng: Engine, g: CasinoGame) {
  const s = casinoSave(eng)
  const k = (s.drunkT > 0 ? CA.drunkBetMul : 1) * (1 + Math.floor(s.addict / 34))
  if (g === 'slot') return k > 1 ? G.CG.slotBets[1] : G.CG.slotBets[0]
  return Math.min(MAX[g], MIN[g] * k)
}
export function casinoOpenMenu(eng: Engine, mode: MenuMode, table = '', anchor?: SH.SeatAnchor): boolean {
  const r = rt(eng), s = casinoSave(eng)
  if (s.ending && mode !== 'ending') return false
  const isGame = mode === 'slot' || mode === 'bj' || mode === 'rou' || mode === 'dice'
  if ((isGame || mode === 'cashier' || mode === 'drink') && !casinoOpen(eng) && !r.beast) { eng.msg('打烊了。荷官把牌收进木匣，朝你摇摇头。', 'lore'); return false }
  r.menu = { mode, bet: isGame ? casinoDefaultBet(eng, mode) : 0, line: menuLine(eng, mode, table), again: 0, table }
  if (mode === 'cashier') staffSetClip(eng, 'louie', 'exchange')
  if (mode === 'drink') staffSetClip(eng, 'bartender', 'pour')
  if (mode === 'bj' && table === 'billy') staffSetClip(eng, 'billy', 'deal')
  audio.uiTick()
  // 阶段 4b：不再弹覆盖层、不暂停——入座，镜头过渡到该桌 / 机的就座视角（结局画面仍走覆盖层）
  //   例外：兑换台（Louie）回到阶段 4 的虚拟 UI 菜单（CasinoMenu cashier 覆盖层，打开即暂停），不入座、无实体价目牌
  if (mode === 'ending' || mode === 'cashier') eng.emit({ kind: 'casinomenu' })
  else { r.seat = { a: anchor ?? SH.standAt(mode === 'drink' ? 'drink' : 'cashier', eng.player.x, eng.player.y, eng.player.x - Math.sin(look.yaw), eng.player.y - Math.cos(look.yaw)), blend: 0, leave: 0 }; r.show = null; r.deal.length = 0 }
  return true
}
/** 入座状态（渲染 / HUD / check 读） */
export const casinoSeat = (eng: Engine) => RT.get(eng)?.seat ?? null
export const casinoSeated = (eng: Engine) => { const s = RT.get(eng)?.seat; return !!s && !s.leave }
export function casinoSeatView(eng: Engine) { const r = RT.get(eng); return r?.seat ? { seat: r.seat, show: r.show, deal: r.deal, clock: r.clock, menu: r.menu, drinkT: r.drinkT, glass: r.glass, xch: r.xch } : null }
/** 演出进行中（UI 层据此不接受新一把；无头 check 直接连调规则函数不受影响） */
export function casinoBusy(eng: Engine) { const r = RT.get(eng); if (!r) return false; if (r.show && r.show.t < r.show.s.end) return true; return r.deal.some((c) => r.clock < c.t0 + SH.DEAL_T.slide + SH.DEAL_T.flip) }
/** 起身：结束这一桌（「再玩一把？」照旧会拦一次）；返回是否真的起身 */
export function casinoStand(eng: Engine, force = false): boolean {
  const r = rt(eng)
  if (!casinoCloseMenu(eng, force)) return false
  if (r.seat) r.seat.leave = 1e-6
  return true
}
/** 演出推进 dt 秒（check 用：把动画快进到终点） */
export function casinoShowAdvance(eng: Engine, dt: number) { const r = rt(eng); r.clock += dt; if (r.show) r.show.t += dt; if (r.xch) r.xch.t += dt }
/** 筹码实体：演出没播完时，奖金还在路上（桌面堆 = 余额 − 未落袋的返还） */
export function casinoShownChips(eng: Engine) {
  const r = rt(eng), s = casinoSave(eng), sh = r.show
  if (!sh || sh.t >= sh.s.end) return s.chips
  const ret = sh.s.kind === 'slot' ? sh.s.win : sh.s.ret
  return Math.max(0, s.chips - (s.pchip ? 0 : ret))
}
function menuLine(eng: Engine, mode: MenuMode, table: string) {
  switch (mode) {
    case 'cashier': return casinoSave(eng).purple < 0 ? '「你…欠着账呢。先把账结了。」Louie 的台球眼转了一圈。' : '「换筹码？」Louie 用杆臂敲了敲柜台，「我好像…在哪见过你？」'
    case 'slot': return '投一枚红筹码。拉杆。'
    case 'bj': return table === 'billy' ? 'Billy 的舌头垂在牌靴上。他把牌洗得哗哗响。' : '荷官把牌摊成一道弧。「下注吧。」'
    case 'rou': return '「红还是黑？」轮盘在转，小球在等。'
    case 'dice': return '三颗骰子在骰盅里磕了磕。「大，还是小？」'
    case 'drink': return casinoSave(eng).drinks === 0 ? '酒保 E164：「第一杯…免费…老板的意思。」' : `酒保 E164：「再来一杯？…${CA.barDrinkCost} 个红筹码。」`
    case 'beast': return '「我们来玩一把双人 21 点，就你和我。」'
    case 'ending': return ''
  }
}
export const casinoMenu = (eng: Engine) => RT.get(eng)?.menu ?? null
export const casinoMenuOpen = (eng: Engine) => !!RT.get(eng)?.menu
/** 关菜单：上瘾 ≥ 30 且刚玩过 → 先问「再玩一把？」（返回 false 留在菜单）；第二次关 = 硬走（−3 理智） */
export function casinoCloseMenu(eng: Engine, force = false): boolean {
  const r = rt(eng), m = r.menu, s = casinoSave(eng)
  if (!m) return true
  if (m.mode === 'beast' && !m.beast?.over) return false // 野兽挑战不能走
  if (m.mode === 'ending') return false
  const isGame = m.mode === 'slot' || m.mode === 'bj' || m.mode === 'rou' || m.mode === 'dice'
  if (!force && isGame && s.addict >= CA.againAt && !m.again && (m.slot || m.bj || m.rou || m.dice)) { m.again = 1; m.line = '……再玩一把？就一把。'; return false }
  if (isGame && m.again) { eng.player.sanity = Math.max(0, eng.player.sanity - CA.againSan); say(eng, '你逼自己站起来。手还在发抖。') }
  if (m.mode === 'beast' && m.beast?.over && m.beast.won) endBeast(eng, true)
  r.menu = null
  return true
}
/** 「再玩一把」：计数 +1，留在桌上 */
export function casinoAgain(eng: Engine) { const m = casinoMenu(eng); if (!m || !m.again) return false; m.again = 0; casinoSave(eng).again++; m.line = '再来一把。'; return true }
export function casinoSetBet(eng: Engine, bet: number) { const m = casinoMenu(eng); if (!m) return false; const g = m.mode as CasinoGame; if (!(g in MIN)) return false; m.bet = Math.max(MIN[g], Math.min(MAX[g], Math.round(bet))); return true }

// ---------------- 下注与结算公共部分 ----------------
function begin(eng: Engine, g: CasinoGame, bet: number): boolean {
  const m = casinoMenu(eng), s = casinoSave(eng)
  if (!m || m.mode !== g) return false
  if (!casinoOpen(eng)) { m.line = '打烊了。'; return false }
  bet = Math.max(MIN[g], Math.min(MAX[g], Math.round(bet)))
  if (!pay(eng, bet)) { m.line = s.pchip ? '紫筹码上的数字已经到底了。' : '筹码不够。去兑换台找 Louie。'; return false }
  m.bet = bet; m.again = 0; m.rig = undefined; m.drinkOffer = undefined
  s.plays++; s.addict = Math.min(100, s.addict + CA.addictPlay)
  s.stats[g][0] += bet; s.ledger.bets += bet
  return true
}
function settle(eng: Engine, g: CasinoGame, bet: number, ret: number, near = false) {
  const m = casinoMenu(eng)!, s = casinoSave(eng), p = eng.player
  s.stats[g][1] += ret; s.ledger.rets += ret
  credit(eng, ret)
  if (near) s.addict = Math.min(100, s.addict + CA.addictNear)
  if (ret > bet) {
    s.streak = 0; s.addict = Math.min(100, s.addict + CA.addictWin)
    audio.hotelBell?.(Math.min(0.8, 0.3 + ret / bet * 0.05)) // 中奖：铃声 + HUD 金光
    m.line = `赢了 ${ret - bet}！${ret >= bet * 10 ? '灯光全亮了，四周有人在欢呼。' : '筹码叮叮当当落进托盘。'}`
  } else if (ret === bet) { m.line = '平局，退还本金。' }
  else {
    s.streak++
    m.line = near ? '差一点！——就差一格。' : pick(eng, ['没中。', '庄家把筹码耙走了。', '「下一把一定行。」不知道是谁在说。'])
    if (s.streak >= CA.drinkStreak) { m.drinkOffer = 1; s.streak = 0; m.line += ' 一位侍应端着托盘停在你身边：「酒保送您的，免费。」' }
  }
  if (s.pchip && s.purple <= CA.beastDebt) startBeast(eng, true)
  void p
}
/** 演出用的落点盐（不动规则随机源：RTP / 固定种子 check 序列不变） */
const salt = (eng: Engine) => (casinoSave(eng).plays * 0.6180339) % 1
const pick = (eng: Engine, a: string[]) => a[Math.floor(rt(eng).rng() * a.length)]
/** 新手运：前 earlyN 把输了有一半概率重来一次 */
const early = (eng: Engine) => casinoSave(eng).plays <= CA.earlyN && rt(eng).rng() < CA.earlyFlip
const seeRig = (eng: Engine, text: string) => { const m = casinoMenu(eng); if (m && eng.player.sanity >= CA.seeSan) m.rig = text }

// ---------------- 老虎机 ----------------
export function casinoSlot(eng: Engine, bet?: number): G.SlotResult | null {
  const m = casinoMenu(eng), r = rt(eng), s = casinoSave(eng); if (!m) return null
  if (!begin(eng, 'slot', bet ?? m.bet)) return null
  let res = G.slotSpin(r.rng, m.bet)
  if (res.mul === 0 && early(eng)) { res = G.slotSpin(r.rng, m.bet); seeRig(eng, '你看见第三个滚轮停下之后，又自己往前拨了一格。') }
  else if (res.near) seeRig(eng, '第三个滚轮像被什么按住了一样，从 7 上滑开。')
  m.slot = res
  r.show = { s: SH.slotShow(res, m.bet, r.reels, salt(eng)), t: 0 }; r.reels = (r.show.s as SH.SlotShow).to.map((a) => a % (Math.PI * 2))
  if (res.jackpot) { s.jackpots++; m.invite = 1 }
  settle(eng, 'slot', m.bet, res.win, res.near)
  if (res.jackpot) m.line = '头奖！TH TH TH！——全场的灯光都转向了你。有人在你身后轻轻鼓掌。'
  return res
}
// ---------------- 21 点 ----------------
export function casinoBjDeal(eng: Engine, bet?: number): G.BjState | null {
  const m = casinoMenu(eng), r = rt(eng); if (!m) return null
  if (m.bj && !m.bj.done) return m.bj
  if (!begin(eng, 'bj', bet ?? m.bet)) return null
  m.bj = G.bjDeal(r.rng, m.bet)
  if (m.bj.done) bjEnd(eng)
  return m.bj
}
function bjEnd(eng: Engine) {
  const m = casinoMenu(eng)!, r = rt(eng), b = m.bj!
  if (b.result === 'lose' && early(eng)) { b.result = 'win'; b.payout = b.bet * 2; seeRig(eng, '庄家的暗牌在你眼前自己翻了个面——变成了一张爆牌。'); b.dealer.push(G.draw(r.rng)) }
  if (m.table === 'billy') staffSetClip(eng, 'billy', b.result === 'lose' ? 'tongue' : 'knock')
  settle(eng, 'bj', b.bet, b.payout)
  // 加倍时多扣的那一注已在 casinoBjDouble 记账
}
export function casinoBjHit(eng: Engine) { const m = casinoMenu(eng); if (!m?.bj || m.bj.done) return null; G.bjHit(rt(eng).rng, m.bj); if (m.bj.done) bjEnd(eng); return m.bj }
export function casinoBjStand(eng: Engine) { const m = casinoMenu(eng); if (!m?.bj || m.bj.done) return null; G.bjStand(rt(eng).rng, m.bj); bjEnd(eng); return m.bj }
export function casinoBjDouble(eng: Engine) {
  const m = casinoMenu(eng), s = casinoSave(eng); if (!m?.bj || m.bj.done || m.bj.player.length !== 2) return null
  const add = m.bj.bet
  if (!pay(eng, add)) { m.line = '不够加倍。'; return m.bj }
  s.stats.bj[0] += add; s.ledger.bets += add
  G.bjDouble(rt(eng).rng, m.bj); bjEnd(eng); return m.bj
}
// ---------------- 轮盘 ----------------
export function casinoRoulette(eng: Engine, kind: G.RouKind, pickN = 0, bet?: number) {
  const m = casinoMenu(eng), r = rt(eng); if (!m) return null
  if (!begin(eng, 'rou', bet ?? m.bet)) return null
  let n = G.rouSpin(r.rng), ret = G.rouPay(n, kind, pickN) * m.bet
  if (!ret && early(eng)) { n = G.rouSpin(r.rng); ret = G.rouPay(n, kind, pickN) * m.bet; seeRig(eng, '轮盘在最后一秒突然加速了一下。') }
  m.rou = { n, kind, pick: pickN, ret }
  r.show = { s: SH.rouShow(n, m.bet, ret, kind, pickN, r.wheel, salt(eng)), t: 0 }; r.wheel = SH.wheelAngle(r.show.s as SH.RouShow, SH.ROU_T.end) % (Math.PI * 2)
  settle(eng, 'rou', m.bet, ret)
  return m.rou
}
// ---------------- 骰宝 ----------------
export function casinoDice(eng: Engine, kind: G.DiceKind, pickN = 1, bet?: number) {
  const m = casinoMenu(eng), r = rt(eng); if (!m) return null
  if (!begin(eng, 'dice', bet ?? m.bet)) return null
  let d = G.rollDice(r.rng), ret = G.dicePay(d, kind, pickN) * m.bet
  if (!ret && early(eng)) { d = G.rollDice(r.rng); ret = G.dicePay(d, kind, pickN) * m.bet; seeRig(eng, '骰盅掀开前，你听见里面有一颗骰子多滚了半圈。') }
  m.dice = { d, kind, pick: pickN, ret }
  r.show = { s: SH.diceShow(d, m.bet, ret, kind, pickN, salt(eng)), t: 0 }
  settle(eng, 'dice', m.bet, ret)
  return m.dice
}
// ---------------- 饮料（连输送酒 / 吧台）----------------
export function casinoDrink(eng: Engine, accept: boolean): boolean {
  const m = casinoMenu(eng), s = casinoSave(eng), p = eng.player, r = rt(eng)
  if (!m) return false
  const free = m.drinkOffer === 1 || (m.mode === 'drink' && s.drinks === 0)
  m.drinkOffer = undefined
  r.glass = 0
  if (!accept) { m.line = '你把杯子推了回去。酒保的触须垂了一下。'; return true }
  if (!free) { if (!pay(eng, CA.barDrinkCost)) { m.line = '「…筹码…不够…」'; return false } s.ledger.bar += CA.barDrinkCost }
  s.drinks++; s.drunkT = CA.drunkSec
  p.sanity = Math.min(100, p.sanity + CA.drinkSan)
  m.line = pick(eng, ['「国王威士忌」。喉咙一路烧下去，心里却松快了。', '「日光杯」。甜得发腻，筹码看起来更亮了。', '一杯 Shirley Temple。你确定这杯里没有酒吗？'])
  staffSetClip(eng, 'bartender', 'serve')
  r.drinkT = 1.6 // 拿起杯子喝：镜头仰一下、晃两下（renderer 读 drinkT）
  return true
}

// ===================================================================== 兑换台（Louie）
export interface CashierRow { key: string; name: string; chips: number; have?: number; ok: boolean }
export function casinoCashierView(eng: Engine) {
  const s = casinoSave(eng), p = eng.player
  const sell: CashierRow[] = Object.entries(CA.sell).map(([k, v]) => ({ key: k, name: ITEMS[k]?.name ?? k, chips: v, have: eng.countItem(k), ok: eng.countItem(k) > 0 }))
  sell.push({ key: '#sanity', name: `理智（−${CA.sanSell}）`, chips: CA.sanSellChips, ok: p.sanity >= CA.sanSellMin })
  sell.push({ key: '#memory', name: '一段记忆', chips: CA.memSellChips, ok: s.memSold < Math.max(1, s.visits) })
  const prize: CashierRow[] = Object.entries(CA.prize).map(([k, v]) => ({ key: k, name: ITEMS[k]?.name ?? k, chips: v, ok: (s.chips >= v && s.purple >= 0) || (k === 'fatedie' && eng.countItem('brokendie') > 0 && eng.countItem('diereceipt') > 0) }))
  const rare: CashierRow[] = Object.entries(CA.rare).map(([k, v]) => ({ key: k, name: ITEMS[k]?.name ?? k, chips: v, ok: s.chips >= v && s.purple >= 0 }))
  return { sell, prize, rare, chips: s.chips, purple: s.purple, pchip: s.pchip }
}
/** 卖：物品 / 理智 / 记忆 → 筹码（先抵紫筹码的债） */
export function casinoSell(eng: Engine, key: string): boolean {
  const m = casinoMenu(eng), s = casinoSave(eng), p = eng.player
  let got = 0
  if (key === '#sanity') { if (p.sanity < CA.sanSellMin) return false; p.sanity -= CA.sanSell; got = CA.sanSellChips; if (m) m.line = 'Louie 把一枚小小的红筹码按进你的手心。你有一瞬间想不起自己为什么在这里。' }
  else if (key === '#memory') {
    if (s.memSold >= Math.max(1, s.visits)) return false
    s.memSold++; eng.hotel.read = []; got = CA.memSellChips
    if (m) m.line = 'Louie 把一只空罐子贴在你耳边。你忘了……读过的什么告示。Louie 也困惑地眨了眨眼，好像他也丢过同样的东西。'
  } else {
    const v = CA.sell[key]; if (!v || !eng.consumeItem(key)) return false
    got = v; if (m) m.line = `Louie 把${ITEMS[key]?.name ?? key}收进柜台下面：「${v} 个筹码。」`
  }
  exchangeIn(eng, got)
  rt(eng).xch = { t: 0, what: '+' + got } // Louie 把筹码推过台面
  staffSetClip(eng, 'louie', 'exchange')
  audio.uiTick()
  return true
}
/** [l5items] 碎骰子 + 购买凭证 → 免费换一颗命运之骰 */
export function casinoSwapDie(eng: Engine): boolean {
  if (eng.countItem('brokendie') <= 0 || eng.countItem('diereceipt') <= 0) return false
  eng.consumeItem('brokendie'); eng.consumeItem('diereceipt'); eng.addItem('fatedie')
  const m = casinoMenu(eng); if (m) m.line = 'Louie 看了看凭证，从柜台底下又摸出一颗一模一样的白骰子。'
  return true
}
/** 买：筹码 → 奖品（负债时不卖） */
export function casinoBuy(eng: Engine, key: string): boolean {
  const m = casinoMenu(eng), s = casinoSave(eng)
  const v = CA.prize[key] ?? CA.rare[key]
  if (!v) return false
  if (key === 'fatedie' && casinoSwapDie(eng)) return true // [l5items] 凭证免费换
  if (s.purple < 0) { if (m) m.line = '「先…还账。」Louie 的杆臂横在柜台上。'; staffSetClip(eng, 'louie', 'refuse'); return false }
  if (s.chips < v) { if (m) m.line = '「不够。」'; return false }
  if (!eng.addItem(key)) { if (m) m.line = '你的包装不下了。'; return false }
  if (key === 'fatedie') eng.addItem('diereceipt') // [l5items] 附购买凭证
  s.chips -= v; s.ledger.prizeOut += v
  rt(eng).xch = { t: 0, what: key } // Louie 把奖品放到台面上递过来
  if (m) m.line = CA.rare[key] ? `Louie 从柜台底下捧出${ITEMS[key]?.name ?? key}，四周响起掌声。` : `成交：${ITEMS[key]?.name ?? key}。`
  staffSetClip(eng, 'louie', 'exchange')
  return true
}
/** 紫筹码为正：在 Louie 这里兑成普通筹码（紫筹码随之消失） */
export function casinoCashPurple(eng: Engine): boolean {
  const s = casinoSave(eng)
  if (!s.pchip || s.purple <= 0) return false
  s.chips += s.purple; s.purple = 0; purpleVanish(eng)
  return true
}

// ===================================================================== 野兽双人 21 点
export const VIP_TABLE = { x: X(5.5), y: Y(4.8) }
export function startBeast(eng: Engine, forced: boolean) {
  const r = rt(eng), p = eng.player
  if (r.beast) return false
  r.beast = { x: VIP_TABLE.x, y: VIP_TABLE.y - 1.1, yaw: Math.PI / 2, clip: 'talk' }
  p.x = VIP_TABLE.x; p.y = VIP_TABLE.y + 1.5; look.yaw = 0 // 坐到牌桌对面，面朝北
  r.seat = { a: SH.seatAt('beast', VIP_TABLE.x, VIP_TABLE.y, Math.PI / 2), blend: 0, leave: 0 }; r.show = null; r.deal.length = 0
  r.menu = { mode: 'beast', bet: 0, line: forced ? '紫色筹码上的数字是负的两百。所有员工都停下手里的事看着你。一位绅士在 VIP 包间里朝你招手。「我们来玩一把双人 21 点，就你和我。赢了，你的账一笔勾销，奖励翻三番。输了嘛……这里一直缺人手。」' : '「运气不错。」野兽不知什么时候坐到了你身边。「为什么不再冒些险？双人 21 点，赢了奖励翻三番。」', again: 0, table: 'beast', forced, beast: G.beastStart(p.sanity) }
  eng.msg('第五层的野兽坐到了牌桌对面。员工们围了过来——一旦坐下，就得玩到最后。', 'lore')
  audio.hotelScratch?.(0.6)
  return true
}
export function casinoBeastAccept(eng: Engine, yes: boolean) {
  const m = casinoMenu(eng)
  if (!m || !m.invite) return false
  m.invite = undefined
  if (!yes) { m.line = '你摇摇头。身后那位绅士轻声笑了：「下次。」'; return true }
  rt(eng).menu = null
  return startBeast(eng, false)
}
export function casinoBeastDeal(eng: Engine) { const m = casinoMenu(eng); if (!m?.beast) return null; G.beastDeal(rt(eng).rng, m.beast); rt(eng).beast!.clip = 'talk'; return m.beast }
export function casinoBeastHit(eng: Engine) { const m = casinoMenu(eng); if (!m?.beast) return null; G.beastHit(rt(eng).rng, m.beast); beastAfter(eng); return m.beast }
export function casinoBeastStand(eng: Engine) { const m = casinoMenu(eng); if (!m?.beast) return null; G.beastStand(rt(eng).rng, m.beast); beastAfter(eng); return m.beast }
function beastAfter(eng: Engine) {
  const m = casinoMenu(eng)!, b = m.beast!, r = rt(eng)
  if (!b.done) return
  if (b.hand >= 1 && b.bw > 0 && eng.player.sanity >= CA.seeSan) m.rig = '你看见他的触腕在牌靴边上轻轻一拨。'
  r.beast!.clip = 'seatedIdle'
  if (!b.over) { m.line = b.log[b.log.length - 1] ?? ''; return }
  if (b.won) { m.line = '「……你赢了。」他的笑容僵住了一瞬，又恢复了。「庄家偶尔也得输一次，不然没人来玩了。」'; endBeast(eng, true) }
  else { m.line = '「你忘了赌博的黄金法则：庄家永胜。」'; r.beast!.clip = 'reveal'; m.mode = 'ending'; eng.emit({ kind: 'casinomenu' }) }
}
function endBeast(eng: Engine, won: boolean) {
  const r = rt(eng), s = casinoSave(eng)
  if (!r.beast) return
  if (won) {
    if (s.purple < 0) { s.ledger.debtIn += -s.purple; s.purple = 0 }
    if (s.pchip) purpleVanish(eng)
    s.chips += CA.beastReward; s.ledger.boon += CA.beastReward; s.beastWon++
    eng.addItem(CA.beastBoon)
    eng.msg(`野兽兑现了承诺：账清了，${CA.beastReward} 个筹码，外加一磅皇家口粮。他起身离开时，员工们让开了一条路。`, 'lore')
    r.beast = null
  }
}
/** 专属结局：输给野兽 = 成为赌场员工（游戏结束） */
export const CASINO_ENDING = {
  title: '结局 · 赌场员工',
  text: '牌桌那头的绅士把你的手按在绒面上。你想喊，但声音被筹码的叮当声吞掉了。\n\n后来有人在 M.E.G. 前哨的门阶上发现了一叠折得整整齐齐的衣服。\n\n恐怖旅馆赌场多了一位新员工。他记得自己的名字，记得怎么发牌，记得要对每一位客人微笑。\n\n别的，他什么都不记得了。',
  cause: '成为了恐怖旅馆赌场的员工（专属结局）',
}
export function casinoEndingConfirm(eng: Engine) {
  const s = casinoSave(eng), r = rt(eng)
  if (!r.menu || r.menu.mode !== 'ending') return false
  s.ending = 1
  try { globalThis.localStorage?.setItem('br.casinoEnding', String(Date.now())) } catch { /* ignore */ }
  r.menu = null; r.beast = null
  eng.die(CASINO_ENDING.cause, true)
  return true
}
export const casinoBeastView = (eng: Engine) => RT.get(eng)?.beast ?? null

// ===================================================================== 交互（X）
type Act = { mode: MenuMode; label: string; hint: string; table?: string; anchor?: SH.SeatAnchor }
export function casinoAct(eng: Engine): Act | null {
  if (!inCasino(eng) || eng.over) return null
  if (rt(eng).seat) return null // 已入座：不再显示「【X】坐到…」交互提示（X 由入座输入处理为起身）
  const p = eng.player, L = casinoLayout()
  // 兑换台：柜台西侧
  if (p.x > X(46.4) && p.x < X(48.7) && Math.abs(p.y - Y(30.5)) < 3.6) return { mode: 'cashier', label: '找 Louie 兑换', hint: '物品 / 理智 / 记忆 → 筹码；筹码 → 奖品' } // 兑换走覆盖层菜单（不入座）
  const bd = Math.hypot(p.x - X(44.8), p.y - Y(8.6))
  if (bd > 4.5 && bd < 6.0 && p.x < X(44.8) + 1) return { mode: 'drink', label: '靠到吧台边', hint: casinoSave(eng).drinks === 0 ? '第一杯免费' : `${CA.barDrinkCost} 个红筹码`, anchor: SH.standAt('drink', p.x, p.y, X(44.8), Y(8.6)) }
  let best: Act | null = null, bdist = Infinity
  for (const q of L.props) {
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    if (q.kind === 'slot' && d < 1.25 && d < bdist) { bdist = d; best = { mode: 'slot', label: '坐到这台老虎机前', hint: '1 / 5 红筹码一把', anchor: SH.seatAt('slot', q.x, q.y, q.rot, q.data?.i ?? 0) } }
    else if (q.kind === 'blackjack' && d < 2.3 && d < bdist) { bdist = d; const billy = q.data?.i === 0; best = { mode: 'bj', label: billy ? '坐到 Billy 的 21 点桌' : '坐到 21 点桌', hint: `最低 ${G.CG.bjMin}`, table: billy ? 'billy' : 'bj' + (q.data?.i ?? 0), anchor: SH.seatAt('bj', q.x, q.y, q.rot, q.data?.i ?? 0) } }
    else if (q.kind === 'roulette' && d < 2.3 && d < bdist) { bdist = d; best = { mode: 'rou', label: '坐到轮盘桌', hint: `最低 ${G.CG.rouMin}`, anchor: SH.seatAt('rou', q.x, q.y, q.rot, q.data?.i ?? 0) } }
    else if (q.kind === 'craps' && d < 2.5 && d < bdist) { bdist = d; best = { mode: 'dice', label: '站到骰宝桌边', hint: `最低 ${G.CG.diceMin}`, anchor: SH.seatAt('dice', q.x, q.y, q.rot, q.data?.i ?? 0) } }
  }
  return best
}
export function casinoSpecial(eng: Engine) { const a = casinoAct(eng); return a ? { id: 'casino-' + a.mode, label: a.label, hint: a.hint, hold: false } : null }
function casinoPress(eng: Engine) {
  if (!eng.specialPressed) return
  const a = casinoAct(eng); if (!a) return
  eng.specialPressed = false
  casinoOpenMenu(eng, a.mode, a.table, a.anchor)
}

// ===================================================================== 上瘾 / 心声 / 减速
const VOICE = ['再来一把就走。', '刚才只差一格。', '下一把肯定是你的。', '把输掉的赢回来就停。', '这里好像没有钟。', '外面……过去多久了？', '再坐一会儿也没关系。']
export function casinoMoveMul(eng: Engine) {
  if (!inCasino(eng)) return 1
  if (RT.get(eng)?.seat) return 0 // 入座：脚不动，头能转
  const s = casinoSave(eng), L = casinoLayout(), p = eng.player
  const d = Math.hypot(p.x - L.door.x, p.y - L.door.y)
  return d < CA.slowR ? 1 - CA.addictSlow * (s.addict / 100) : 1
}
export interface CasinoHudView { chips: number; denom: ReturnType<typeof chipDenoms>; purple: number; pchip: number; addict: number; again: number; drunk: number; voice: string | null; debt: boolean; block: string | null; open: boolean; beast: boolean; warn: number }
export function casinoHud(eng: Engine): CasinoHudView | null {
  if (!inCasino(eng)) return null
  const s = casinoSave(eng), r = rt(eng)
  return { chips: s.chips, denom: chipDenoms(s.chips), purple: s.purple, pchip: s.pchip, addict: Math.round(s.addict), again: s.again, drunk: Math.ceil(s.drunkT), voice: r.voice?.text ?? null, debt: s.purple < 0, block: r.blockMsgT > 0 ? '紫筹码是负数。Louie 和假肢人挡在门口：「账结清了才能走。」' : null, open: casinoOpen(eng), beast: !!r.beast, warn: staffRt(eng).warnN }
}
const say = (eng: Engine, text: string) => { rt(eng).voice = { text, t: 5 } }

// ===================================================================== 每帧
/** 每帧（l5Hotel.updateHotel 开头，任何层级） */
export function stepCasino(eng: Engine, dt: number) {
  const r = rt(eng)
  r.lockMsgT = Math.max(0, r.lockMsgT - dt)
  const id = eng.levelDef.id
  const s = eng.hotel.casino
  if (s) {
    if (s.drunkT > 0) { s.drunkT = Math.max(0, s.drunkT - dt); if (s.drunkT === 0) { eng.player.sanity = Math.max(0, eng.player.sanity + CA.drinkAfterSan); say(eng, '酒劲过去了，脑袋里空落落的。') } }
    if (id !== CASINO_LEVEL && s.addict > 0) s.addict = Math.max(0, s.addict - CA.addictDecayOut * dt)
  }
  if (r.voice) { r.voice.t -= dt; if (r.voice.t <= 0) r.voice = null }
  casinoShowAdvance(eng, dt)
  if (r.drinkT > 0) r.drinkT = Math.max(0, r.drinkT - dt)
  if (r.seat) {
    if (r.seat.leave) { r.seat.blend = Math.max(0, r.seat.blend - dt / SH.SEAT.blendSec); if (r.seat.blend <= 0) { r.seat = null; r.show = null; r.deal.length = 0; r.glass = 0 } }
    else if (r.seat.blend < 1) {
      // 镜头朝向按过渡进度插值（与帧率无关：低帧率下也在 blend = 1 时正好对准机器 / 牌桌），之后头可自由转
      if (r.seat.y0 === undefined) { r.seat.y0 = look.yaw; r.seat.p0 = look.pitch }
      r.seat.blend = Math.min(1, r.seat.blend + dt / SH.SEAT.blendSec)
      const k = r.seat.blend * r.seat.blend * (3 - 2 * r.seat.blend), d = Math.atan2(Math.sin(r.seat.a.yaw - r.seat.y0), Math.cos(r.seat.a.yaw - r.seat.y0))
      look.yaw = r.seat.y0 + d * k; look.pitch = r.seat.p0! + (-0.18 - r.seat.p0!) * k
    }
  }
  if (r.seat) {
    const m = r.menu
    if (m?.bj) SH.syncDeal(r.deal, m.bj.player, m.bj.dealer, m.bj.done, r.clock)
    else if (m?.beast) SH.syncDeal(r.deal, m.beast.player, m.beast.beast, m.beast.done, r.clock)
    if (m?.drinkOffer && !r.serveTo && !r.glass) r.serveTo = { x: r.seat.a.x + Math.cos(r.seat.a.rot + 1.2) * 0.6, y: r.seat.a.y + Math.sin(r.seat.a.rot + 1.2) * 0.6 }
    if (!m && !r.seat.leave) r.seat.leave = 1e-6
  }
  if (id !== CASINO_LEVEL && r.wasIn) {
    r.wasIn = 0
    const real = r.visitT * CA.timeWarp
    if (r.visitT > 60) eng.msg(`你以为只待了 ${Math.round(r.visitT / 60)} 分钟。走廊里的钟说，过去了 ${Math.round(real / 60)} 分钟。`, 'lore')
  }
  if (id === 5 && !eng.transition) {
    const sd = nearDoor(eng)
    if (!sd) return
    const f = -look.yaw - Math.PI / 2, facing = Math.abs(Math.atan2(Math.sin(f + Math.PI / 2), Math.cos(f + Math.PI / 2))) < 1.1 // 面朝北（f = −π/2）
    if (!facing) return
    if (!casinoOpen(eng)) { if (r.lockMsgT <= 0) { eng.msg('TH 的灯全熄了。大门锁着，门缝里透出筹码碰撞的回声。', 'lore'); r.lockMsgT = 6 } return }
    casinoEnter(eng)
  } else if (id === CASINO_LEVEL) {
    const sv = casinoSave(eng), p = eng.player
    r.wasIn = 1; r.visitT += dt
    // 场内无钟：饥渴按 timeWarp 额外流失
    if (!r.menu) { p.hunger = Math.max(0, p.hunger - CA.warpDrain * dt); p.thirst = Math.max(0, p.thirst - CA.warpDrain * dt) }
    sv.warpSec += dt * (CA.timeWarp - 1)
    if (!r.menu) sv.addict = Math.max(0, sv.addict - CA.addictDecay * dt)
    // 心声
    r.voiceT -= dt
    if (r.voiceT <= 0) { r.voiceT = CA.voiceGap[0] + r.rng() * (CA.voiceGap[1] - CA.voiceGap[0]); if (sv.addict >= CA.voiceAt && !r.menu) say(eng, VOICE[Math.floor(r.rng() * VOICE.length)]) }
    // 拦门：紫筹码为负，不让走到门口
    r.blockMsgT = Math.max(0, r.blockMsgT - dt)
    const L = casinoLayout()
    if (sv.purple < 0 && p.y > L.door.y - CA.blockY && Math.abs(p.x - L.door.x) < 3.5) { p.y = L.door.y - CA.blockY; if (r.blockMsgT <= 0) { eng.msg('Louie 的杆臂横在你胸前：「你还欠着赌场的。」假肢人举了举帽子，八条腿把门口挡得严严实实。', 'lore'); audio.uiTick() } r.blockMsgT = 3 }
    // 员工
    stepStaff(eng, dt, {
      debt: sv.purple < 0, vipOk: !!r.beast, gather: r.beast ? VIP_TABLE : null, serveTo: r.serveTo,
      onExpel: () => { p.x = L.spawn.x; p.y = L.spawn.y - 1.5; eng.msg('保安把你架回了前厅。「请遵守场内规定。」', 'lore') },
      onServed: () => { r.serveTo = null; if (r.menu?.drinkOffer) r.glass = 1 },
    })
    if (r.serveTo && r.menu) { /* 菜单开着时不走 */ }
    if (!r.menu && !eng.transition) casinoPress(eng)
    // 打烊
    if (casinoOpen(eng)) { r.closedT = 0; r.worked = 0; return }
    r.closedT += dt
    if (r.closedT > 0 && r.closedT - dt <= 0) eng.msg('灯光暗下来一半。广播用一种听不懂的语言念着什么——打烊了。', 'lore')
    if (r.closedT >= CA.closeKickSec && !eng.transition && !r.beast) {
      if (sv.purple < 0) {
        if (!r.worked) {
          r.worked = 1
          const k = Math.min(-sv.purple, CA.closeWork); sv.purple += k; sv.ledger.work += k; p.sanity = Math.max(0, p.sanity - CA.closeWorkSan)
          eng.msg(`打烊了，你却走不了。Louie 递给你一块抹布：「欠账的…留下来打扫。」你擦了一整轮牌桌，紫筹码 +${k}（现在 ${sv.purple}）。`, 'lore')
          if (sv.purple === 0 && sv.pchip) purpleVanish(eng)
        }
        if (sv.purple < 0) return
      }
      r.closedT = -1e9; eng.msg('几只手把你「请」出了大门。', 'lore'); casinoLeave(eng)
    }
  }
}
/** 推开大门：口袋同款返程（原楼层原地图 + 门前） */
export function casinoEnter(eng: Engine, why: 'door' | 'beast' = 'door') {
  const m = eng.map
  if (!m || eng.levelDef.id !== 5 || eng.transition) return false
  const h = eng.hotel, sv = casinoSave(eng)
  sv.visits++
  h.pocket = { kind: 'casino', floor: h.floor, mapSeed: eng.mapSeed }
  rememberOutpostEntry(eng, CASINO_LEVEL)
  eng.career.returnAnchor!.yaw += Math.PI
  eng.transition = { anim: 'bloom', t: 0, dest: CASINO_LEVEL }
  eng.emit({ kind: 'transition', anim: 'bloom', cutIn: 'outpost', dest: CASINO_LEVEL })
  if (why === 'door') audio.hotelBell?.(0.5)
  return true
}
/** 出口（只有大门回 L5）：走 def.exits 的 back，这里给打烊清场用；负余额不放 */
export function casinoLeave(eng: Engine) {
  if (eng.levelDef.id !== CASINO_LEVEL || eng.transition || !casinoCanLeave(eng)) return false
  const exit = eng.levelDef.exits.find(exit => exit.dest === 'back')
  if (!exit) return false
  eng.takeExit(exit)
  return !!eng.transition
}
/** level.takeExit 守卫：负余额不让出大门 */
export function casinoExitBlocked(eng: Engine): boolean {
  if (eng.levelDef.id !== CASINO_LEVEL || casinoCanLeave(eng)) return false
  eng.msg(`紫色筹码上的数字是 ${casinoSave(eng).purple}。门口的员工一齐朝你摇头。`, 'lore')
  rt(eng).blockMsgT = 3
  return true
}
/** 进入赌场时（level.loadLevel） */
export function casinoArrive(eng: Engine, restoring = false) {
  const sv = casinoSave(eng), r = rt(eng)
  r.menu = null; r.beast = null; r.serveTo = null; r.seat = null; r.show = null; r.deal.length = 0; r.glass = 0; r.visitT = 0; r.closedT = 0; r.worked = 0
  spawnStaff(eng)
  if (restoring) return
  if (sv.purple < 0 && eng.hotel.pocket?.kind === 'casino' && sv.drags > 0 && eng.hotel.casinoDragPending) {
    eng.hotel.casinoDragPending = undefined
    eng.msg(`你醒在一张绿色的赌桌旁。手里攥着一枚紫色筹码，中间的数字是 ${sv.purple}。`, 'lore')
  } else eng.msg('霓虹、筹码、听不懂的歌。赌场盛大开幕。', 'lore')
}
/** [beast] 钩子：关注度第二次满 → 不再死亡，拖进 5.1；紫筹码余额 −50 记到 hotel.casino.purple */
export function casinoBeastDrag(eng: Engine): boolean {
  if (eng.levelDef.id !== 5) return false
  const sv = casinoSave(eng)
  sv.drags++
  sv.purple += CA.purpleDebt; sv.pchip = 1; sv.ledger.debtIn += CA.purpleDebt
  eng.hotel.casinoDragPending = 1
  eng.msg('触腕把你拖过一道挂满灯泡的门。身后有人在笑。', 'lore')
  return casinoEnter(eng, 'beast')
}
/** 经济守恒：chips + purple == debtIn(负) + exIn − prizeOut − bets + rets + work + boon − bar（check 用） */
export function casinoLedgerOk(eng: Engine) {
  const s = casinoSave(eng), l = s.ledger
  const want = l.debtIn + l.exIn - l.prizeOut - l.bets + l.rets + l.work + l.boon - l.bar
  return { ok: Math.abs(s.chips + s.purple - want) < 1e-6, have: s.chips + s.purple, want }
}
