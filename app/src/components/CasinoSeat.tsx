// [casino] Level 5.1 阶段 4b：入座后的键位提示 + 输入（不暂停、不是菜单）。牌局本身在场景里（renderer/casinoTables.ts）。
//   Esc / X 起身 · 老虎机 Space 拉杆、1 / 2 投 1 / 5 · 21 点 ← → 下注、Space 发牌、H 要 · S 停 · D 加倍
//   轮盘 / 骰宝：准星对准桌面格子，Space 或左键放筹码（兑换台走 CasinoMenu 覆盖层，不入座） · Y / N 饮料、邀请、「再来一把？」
import { useEffect, useState } from 'react'
import type { Engine } from '@/game/engine'
import * as C from '@/game/engine/casinoAI'
import { casinoAimCell } from '@/game/renderer/casinoTables'
import type { RouKind, DiceKind } from '@/game/engine/casinoGames'

const cellName = (c: { kind: string; pick: number } | null, g: string) => !c ? '（准星对准桌面格子）' : c.kind === 'num' ? (g === 'rou' ? `单号 ${c.pick === 37 ? '00' : c.pick}` : `点数 ${c.pick}`) : ({ red: '红', black: '黑', odd: '单', even: '双', big: '大', small: '小' } as Record<string, string>)[c.kind]
export function casinoSeatKey(engine: Engine, key: string, click = false): boolean {
  const seat = C.casinoSeat(engine), m = C.casinoMenu(engine)
  if (!seat || seat.leave || !m) return false
  const k = key.toLowerCase(), busy = C.casinoBusy(engine)
  if (k === 'escape' || k === 'x') { if (m.mode !== 'beast') C.casinoStand(engine); return true }
  if (m.again) { if (k === 'y') C.casinoAgain(engine); else if (k === 'n') C.casinoStand(engine, true); return k === 'y' || k === 'n' }
  if (m.invite) { if (k === 'y' || k === 'n') { C.casinoBeastAccept(engine, k === 'y'); return true } }
  if (m.drinkOffer) { if (k === 'y' || k === 'n') { C.casinoDrink(engine, k === 'y'); return true } }
  if (busy && (k === ' ' || click)) return true
  const g = m.mode
  if (k === 'arrowleft' || k === 'arrowright') { C.casinoSetBet(engine, m.bet + (k === 'arrowleft' ? -5 : 5)); return true }
  if (g === 'slot') { if (k === '1' || k === '2') { C.casinoSetBet(engine, k === '1' ? 1 : 5); return true } if (k === ' ') { C.casinoSlot(engine); return true } }
  else if (g === 'bj') { const open = m.bj && !m.bj.done; if (k === ' ' && !open) { C.casinoBjDeal(engine); return true } if (open && k === 'h') { C.casinoBjHit(engine); return true } if (open && k === 's') { C.casinoBjStand(engine); return true } if (open && k === 'd') { C.casinoBjDouble(engine); return true } }
  else if (g === 'rou' || g === 'dice') { if (k === ' ' || click) { const c = casinoAimCell; if (c) { if (g === 'rou') C.casinoRoulette(engine, c.kind as RouKind, c.pick); else C.casinoDice(engine, c.kind as DiceKind, c.pick) } return true } }
  else if (g === 'drink') { if (k === ' ' || k === 'y') { C.casinoDrink(engine, true); return true } }
  else if (g === 'beast') { const b = m.beast!; if (b.over && b.won && (k === ' ' || k === 'enter')) { C.casinoStand(engine, true); return true } if (k === ' ' && b.done && !b.over) { C.casinoBeastDeal(engine); return true } if (!b.done && k === 'h') { C.casinoBeastHit(engine); return true } if (!b.done && k === 's') { C.casinoBeastStand(engine); return true } }
  return false
}
export default function CasinoSeat({ engine }: { engine: Engine }) {
  const [, setT] = useState(0)
  useEffect(() => { const id = setInterval(() => setT((x) => x + 1), 150); return () => clearInterval(id) }, [])
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (!C.casinoSeat(engine) || e.repeat) return; if (casinoSeatKey(engine, e.key)) { e.preventDefault(); e.stopImmediatePropagation() } }
    const md = (e: MouseEvent) => { if (e.button !== 0 || !C.casinoSeated(engine)) return; if (casinoSeatKey(engine, '', true)) { e.preventDefault(); e.stopImmediatePropagation() } }
    window.addEventListener('keydown', kd, true); window.addEventListener('mousedown', md, true)
    return () => { window.removeEventListener('keydown', kd, true); window.removeEventListener('mousedown', md, true) }
  }, [engine])
  const seat = C.casinoSeat(engine), m = C.casinoMenu(engine)
  if (!seat || seat.leave || !m) return null
  const g = m.mode, busy = C.casinoBusy(engine)
  let keys = ''
  if (m.again) keys = 'Y 再来一把 · N 硬起身（理智 −3）'
  else if (m.invite) keys = 'Y 接受野兽的邀请 · N 婉拒'
  else if (m.drinkOffer) keys = 'Y 拿起来喝 · N 推回去'
  else if (g === 'slot') keys = `1 / 2 投 1 / 5（现 ${m.bet}）· Space 拉杆`
  else if (g === 'bj') keys = m.bj && !m.bj.done ? 'H 要牌 · S 停牌 · D 加倍' : `← → 下注 ${m.bet} · Space 发牌`
  else if (g === 'rou' || g === 'dice') keys = `← → 下注 ${m.bet} · Space / 左键 放到 ${cellName(casinoAimCell, g)}`
  else if (g === 'drink') keys = 'Space 来一杯'
  else if (g === 'beast') { const b = m.beast!; keys = b.over && b.won ? 'Space 收下奖励离开' : b.done ? `Space 下一局（${b.pw} : ${b.bw}）` : 'H 要牌 · S 停牌' }
  return (
    <div className="ch-seat" data-casino-seat>
      {m.line && !busy ? <div className="ch-seat-line">{m.line}</div> : null}
      {m.rig && !busy ? <div className="ch-seat-line rig">{m.rig}</div> : null}
      <div className="ch-seat-keys">{busy ? '……' : keys}{g !== 'beast' && !m.again ? ' · Esc / X 起身' : ''}</div>
    </div>
  )
}
