// [casino] Level 5.1 覆盖层菜单（打开即暂停；同 BeastDeal / JazzMenu 惯例）：兑换台（Louie）/ 老虎机 / 21 点 / 轮盘 / 骰宝 / 吧台饮料 / 野兽双人 21 点 / 专属结局。
//   键盘：每个按钮旁标着键（Space / Enter = 主操作，H 要牌 · S 停牌 · D 加倍，← → 调下注，Y / N 免费饮料与野兽邀请，Esc 关 →「再玩一把？」）；鼠标 / 触屏点按。
//   无头环境（check）不走这里，直接调 engine/casinoAI 的同名函数。
import { useEffect, useState } from 'react'
import { engine } from '@/game/engine'
import * as C from '@/game/engine/casinoAI'
import { CG, cardStr, handVal, rouColor, rouLabel, type RouKind, type DiceKind } from '@/game/engine/casinoGames'
import './HotelNotice.css'
import './CasinoMenu.css'

interface Btn { k: string; key: string; label: string; f: () => unknown; dis?: boolean; cls?: string }
const KEYNAME: Record<string, string> = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: 'Enter' }

export default function CasinoMenu({ onClose }: { onClose: () => void }) {
  const [, setTick] = useState(0)
  const re = () => setTick((x) => x + 1)
  const [rouPick, setRouPick] = useState(17)
  const [dicePick, setDicePick] = useState(4)
  const m = C.casinoMenu(engine)
  const close = () => { if (C.casinoCloseMenu(engine)) onClose(); else re() }
  const btns: Btn[] = []
  const B = (key: string, label: string, f: () => unknown, dis = false, cls = '') => btns.push({ k: label + key, key, label, f: () => { f(); if (!C.casinoMenu(engine)) onClose(); else re() }, dis, cls })
  if (m) {
    const g = m.mode
    if (m.again) { B('y', '再玩一把', () => C.casinoAgain(engine), false, 'hot'); B('n', '离开（理智 −3）', () => { if (C.casinoCloseMenu(engine)) onClose() }) }
    else if (m.drinkOffer) { B('y', '喝下免费饮料', () => C.casinoDrink(engine, true), false, 'hot'); B('n', '不用了', () => C.casinoDrink(engine, false)) }
    else if (m.invite) { B('y', '接受野兽的邀请', () => C.casinoBeastAccept(engine, true), false, 'hot'); B('n', '婉拒', () => C.casinoBeastAccept(engine, false)) }
    else if (g === 'slot') { for (const b of CG.slotBets) B(String(b === 1 ? 1 : 2), `投 ${b} 红`, () => C.casinoSetBet(engine, b), false, m.bet === b ? 'on' : ''); B(' ', '拉杆', () => C.casinoSlot(engine), false, 'hot') }
    else if (g === 'bj') {
      const open = m.bj && !m.bj.done
      if (!open) { B('ArrowLeft', '−5', () => C.casinoSetBet(engine, m.bet - 5)); B('ArrowRight', '+5', () => C.casinoSetBet(engine, m.bet + 5)); B(' ', `发牌（下注 ${m.bet}）`, () => C.casinoBjDeal(engine), false, 'hot') }
      else { B('h', '要牌', () => C.casinoBjHit(engine), false, 'hot'); B('s', '停牌', () => C.casinoBjStand(engine)); B('d', '加倍', () => C.casinoBjDouble(engine), m.bj!.player.length !== 2) }
    } else if (g === 'rou') {
      B('ArrowLeft', '−5', () => C.casinoSetBet(engine, m.bet - 5)); B('ArrowRight', '+5', () => C.casinoSetBet(engine, m.bet + 5))
      const R = (key: string, label: string, k: RouKind) => B(key, label, () => C.casinoRoulette(engine, k, rouPick), false, k === 'red' ? 'red' : k === 'black' ? 'blk' : '')
      R('1', '押红', 'red'); R('2', '押黑', 'black'); R('3', '押单', 'odd'); R('4', '押双', 'even'); R('5', `押单号 ${rouPick === 37 ? '00' : rouPick}`, 'num')
      B('-', '号码 −', () => setRouPick((x) => (x + 37) % 38)); B('=', '号码 +', () => setRouPick((x) => (x + 1) % 38))
    } else if (g === 'dice') {
      B('ArrowLeft', '−5', () => C.casinoSetBet(engine, m.bet - 5)); B('ArrowRight', '+5', () => C.casinoSetBet(engine, m.bet + 5))
      const D = (key: string, label: string, k: DiceKind) => B(key, label, () => C.casinoDice(engine, k, dicePick))
      D('1', '押大（11–17）', 'big'); D('2', '押小（4–10）', 'small'); D('3', '押单', 'odd'); D('4', '押双', 'even'); D('5', `押点数 ${dicePick}`, 'num')
      B('-', '点数 −', () => setDicePick((x) => (x + 4) % 6 + 1)); B('=', '点数 +', () => setDicePick((x) => (x % 6) + 1))
    } else if (g === 'drink') { B('y', C.casinoSave(engine).drinks === 0 ? '来一杯（免费）' : `来一杯（${C.CA.barDrinkCost} 红）`, () => C.casinoDrink(engine, true), false, 'hot'); B('n', '算了', () => C.casinoDrink(engine, false)) }
    else if (g === 'beast') {
      const b = m.beast!
      if (b.over && b.won) B('Enter', '收下奖励，离开牌桌', () => { if (C.casinoCloseMenu(engine)) onClose() }, false, 'hot')
      else if (b.done) B(' ', b.hand === 0 && !b.player.length ? '开始（第一局）' : '下一局', () => C.casinoBeastDeal(engine), false, 'hot')
      else { B('h', '要牌', () => C.casinoBeastHit(engine), false, 'hot'); B('s', '停牌', () => C.casinoBeastStand(engine)) }
    } else if (g === 'ending') B('Enter', '……', () => C.casinoEndingConfirm(engine), false, 'hot')
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      const hit = btns.find((b) => b.key === e.key || b.key === e.key.toLowerCase() || (b.key === ' ' && e.code === 'Space'))
      if (hit && !hit.dis) { e.preventDefault(); hit.f() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  if (!m) return null
  const s = C.casinoSave(engine), dn = C.chipDenoms(s.chips)
  const title: Record<C.MenuMode, string> = { cashier: '兑换台 · 赌场经理 Louie', slot: '老虎机', bj: m.table === 'billy' ? '21 点 · 台球先生 Billy 发牌' : '21 点', rou: '轮盘（美式双零）', dice: '骰宝（掷骰）', drink: '环形酒吧 · 酒保 E164', beast: '双人 21 点 · 第五层的野兽', ending: C.CASINO_ENDING.title }
  return (
    <div className={'hn-veil cm-veil cm-m-' + m.mode} data-casino-menu={m.mode}>{/* cm-m- 前缀：曾用 'cm-' + mode，与 .cm-rou / .cm-dice / .cm-ending 内容块规则重名 → 遮罩被 max-width 640 / 560 截成左半屏 = 竖向明暗分界线 */}
      {m.mode !== 'ending' && <div className="cm-wallet">
        <span className="cm-chip r" />{dn.red}<span className="cm-chip b" />{dn.blue}<span className="cm-chip y" />{dn.yellow}<span className="cm-chip g" />{dn.green}
        <b> = {s.chips}</b>{s.pchip ? <span className={'cm-purple' + (s.purple < 0 ? ' neg' : '')}>{s.purple}</span> : null}
        {s.drunkT > 0 && <span className="cm-drunk">醉意 {Math.ceil(s.drunkT)}s</span>}
      </div>}
      <div className="cm-title">{title[m.mode]}</div>
      {m.mode === 'cashier' && <Cashier onAct={re} />}
      {m.mode === 'slot' && <div className={'cm-reels' + (m.slot?.near ? ' near' : '') + (m.slot && m.slot.win > m.bet ? ' win' : '')}>{(m.slot?.syms ?? ['TH', '7', 'BAR']).map((x, i) => <div key={i} className="cm-reel">{CG.slotZh[x]}</div>)}</div>}
      {m.mode === 'slot' && <div className="cm-pay">TH×3 = {CG.slotPay3.TH}× · 7×3 = {CG.slotPay3['7']}× · BAR×3 = {CG.slotPay3.BAR}× · 铃×3 = {CG.slotPay3['铃']}× · 樱×3 = {CG.slotPay3['樱桃']}× · 两樱 = {CG.slotCherry2}× · 一樱 = {CG.slotCherry1}×</div>}
      {(m.mode === 'bj') && m.bj && <Hands a={m.bj.dealer} b={m.bj.player} hide={!m.bj.done} la="庄家" lb="你" />}
      {m.mode === 'beast' && m.beast && m.beast.player.length > 0 && <Hands a={m.beast.beast} b={m.beast.player} hide={!m.beast.done} la="绅士" lb="你" />}
      {m.mode === 'beast' && m.beast && <div className="cm-score">你 {m.beast.pw} : {m.beast.bw} 他 · 三局两胜{m.forced ? ' · 赢了清账' : ''}</div>}
      {m.mode === 'rou' && <div className="cm-rou">{m.rou ? <span className={'cm-ball ' + rouColor(m.rou.n)}>{rouLabel(m.rou.n)}</span> : <span className="cm-ball green">?</span>} 单号 35:1 · 红黑 / 单双 1:1 · 0 / 00 庄家通吃</div>}
      {m.mode === 'dice' && <div className="cm-dice">{(m.dice?.d ?? [0, 0, 0]).map((d, i) => <span key={i} className="cm-die">{d ? '⚀⚁⚂⚃⚄⚅'[d - 1] : '?'}</span>)} 大小 / 单双 1:1（围骰通杀）· 点数出现 1/2/3 颗赔 1/2/3 倍</div>}
      {m.mode === 'ending' && <div className="cm-ending">{C.CASINO_ENDING.text.split('\n\n').map((t, i) => <p key={i}>{t}</p>)}</div>}
      {m.line && <div className="cm-line">{m.line}</div>}
      {m.rig && <div className="cm-rig">（{m.rig}）</div>}
      {(m.mode === 'bj' || m.mode === 'rou' || m.mode === 'dice') && <div className="cm-bet">下注 <b>{m.bet}</b>{s.drunkT > 0 ? '（喝了酒，手比平时大方）' : ''}</div>}
      <div className="cm-btns">{btns.map((b) => <button key={b.k} className={'bd-btn cm-btn ' + (b.cls ?? '')} disabled={b.dis} onClick={b.f}>{b.label}<i>{KEYNAME[b.key] ?? b.key.toUpperCase()}</i></button>)}</div>
      {m.mode !== 'beast' && m.mode !== 'ending' && <div className="hn-close" onClick={close} role="button">Esc 离开{s.again ? ` · 已经「再玩一把」${s.again} 次` : ''}</div>}
    </div>
  )
}
function Hands({ a, b, hide, la, lb }: { a: { r: number; s: number }[]; b: { r: number; s: number }[]; hide: boolean; la: string; lb: string }) {
  return (
    <div className="cm-felt">
      <div className="cm-hand"><span>{la}{hide ? '' : ` · ${handVal(a).v}`}</span>{a.map((c, i) => <span key={i} className={'cm-card' + (hide && i === 1 ? ' back' : '') + (c.s === 1 || c.s === 2 ? ' red' : '')}>{hide && i === 1 ? '🂠' : cardStr(c)}</span>)}</div>
      <div className="cm-hand"><span>{lb} · {handVal(b).v}</span>{b.map((c, i) => <span key={i} className={'cm-card' + (c.s === 1 || c.s === 2 ? ' red' : '')}>{cardStr(c)}</span>)}</div>
    </div>
  )
}
function Cashier({ onAct }: { onAct: () => void }) {
  const v = C.casinoCashierView(engine)
  const Row = ({ r, buy }: { r: C.CashierRow; buy: boolean }) => (
    <button className="cm-row" disabled={!r.ok} onClick={() => { if (buy) C.casinoBuy(engine, r.key); else C.casinoSell(engine, r.key); onAct() }}>
      <span>{r.name}{r.have !== undefined ? ` ×${r.have}` : ''}</span><b>{buy ? '−' : '+'}{r.chips}</b>
    </button>
  )
  return (
    <div className="cm-cashier">
      <div><div className="cm-h">换筹码（先抵紫筹码的账）</div>{v.sell.map((r) => <Row key={r.key} r={r} buy={false} />)}</div>
      <div><div className="cm-h">奖品</div>{v.prize.map((r) => <Row key={r.key} r={r} buy />)}<div className="cm-h rare">稀有池</div>{v.rare.map((r) => <Row key={r.key} r={r} buy />)}
        {v.pchip && v.purple > 0 ? <button className="cm-row" onClick={() => { C.casinoCashPurple(engine); onAct() }}><span>把紫筹码兑成普通筹码</span><b>+{v.purple}</b></button> : null}
      </div>
    </div>
  )
}
