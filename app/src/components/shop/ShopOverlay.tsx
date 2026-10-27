// 商人商店界面（特殊交互键 X 直接打开，与 E 的对话窗分开）：每个团体一套独立皮肤（shopSkins.ts + ShopOverlay.css）。
// 页签：购买（含以物易物）/ 卖给商人（逐格出售，可选数量）。交易规则全部在 engine/merchantTrade.ts。
// 键盘：X / Esc 离开 · E 切到交谈 · Tab 切页签 · ↑↓ 选货 · Enter 成交。
import { useEffect, useMemo, useRef, useState } from 'react'
import { NPCS } from '@/game/content/npcs'
import { ITEMS, ITEM_RARITY_LABEL } from '@/game/content/items'
import { FACTIONS } from '@/game/content/factions'
import { engine } from '@/game/engine'
import { audio } from '@/game/core/audio'
import { bindLabelFor, getKeybinds } from '@/game/core/keybinds'
import { ItemGlyph } from '../HUD'
import { bntgPaymentPlan, type BntgPaymentMode, type BankResult } from '@/game/engine/bntgBank'
import { COIN_NAME, COIN_RATE, merchantAt, merchantBarter, merchantBuy, merchantBuyPrice, merchantCoin, merchantExchange, merchantSell, repDiscount, repRefuses, sellUnitPrice } from '@/game/engine/merchantTrade'
import { skinOf, shopTitle } from './shopSkins'
import './ShopOverlay.css'

type Row =
  | { kind: 'buy'; key: string; item: string; qty: number; price: number }
  | { kind: 'barter'; key: string; index: number; get: string; getN: number; give: [string, number][] }
  | { kind: 'sell'; key: string; where: 'hotbar' | 'backpack'; i: number; item: string; count: number; unit: number | null }

export default function ShopOverlay({ npcId, onClose, onTalk }: { npcId: string; onClose: () => void; onTalk: () => void }) {
  const def = NPCS[npcId] ?? engine.npcs.find((n) => n.id === npcId)?.def
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [sel, setSel] = useState(0)
  const [qty, setQty] = useState(1)
  const [pay, setPay] = useState<BntgPaymentMode>('auto')
  const [notice, setNotice] = useState<{ ok: boolean; text: string; n: number } | null>(null)
  const [, setTick] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const rowCount = useRef(0)
  const skin = useMemo(() => (def ? skinOf(def) : null), [def])

  // 关掉页面的键：X（特殊交互键）/ E 切交谈；Tab 换页签；↑↓ 选；Enter 成交（Esc 由 App 统一关闭）
  useEffect(() => {
    const kb = getKeybinds()
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      if ((e.code === kb.special || e.code === 'Escape') && !e.repeat) { e.preventDefault(); audio.uiTick(); onClose(); return }
      if (e.code === kb.interact && !e.repeat) { e.preventDefault(); audio.uiTick(); onTalk(); return }
      if (e.code === 'Tab') { e.preventDefault(); setTab((t) => (t === 'buy' ? 'sell' : 'buy')); setSel(0); setQty(1); audio.uiTick(); return }
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, Math.min(rowCount.current - 1, s + (e.code === 'ArrowDown' ? 1 : -1)))); setQty(1); return }
      if (e.code === 'Enter') { e.preventDefault(); (document.querySelector('.shop-act') as HTMLButtonElement | null)?.click() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onTalk])
  useEffect(() => {
    const previous = document.activeElement
    root.current?.focus({ preventScroll: true })
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  useEffect(() => {
    root.current?.querySelector('.shop-row.on')?.scrollIntoView({ block: 'nearest' })
  }, [sel, tab])
  if (!def || !skin) return null

  const fac = FACTIONS[def.faction ?? 'meg']
  const coin = merchantCoin(def)
  const coinName = COIN_NAME[coin]
  const isBntg = def.faction === 'bntg' && coin === 'presses'
  const refused = repRefuses(engine, def)
  const near = !!merchantAt(engine, npcId)
  const discount = repDiscount(engine, def)
  const have = (t: string) => engine.countItem(t)

  const buyRows: Row[] = [
    ...(def.trade ?? []).map((t): Row => ({ kind: 'buy', key: 'b' + t.item, item: t.item, qty: Math.max(1, t.qty ?? 1), price: merchantBuyPrice(engine, def, t.price) })),
    ...(def.barter ?? []).map((b, index): Row => ({ kind: 'barter', key: 'x' + index, index, get: b.get, getN: b.getN, give: [[b.give, b.giveN], ...(b.give2 ? [[b.give2, b.give2N ?? 1] as [string, number]] : [])] })),
  ]
  const sellRows: Row[] = (['hotbar', 'backpack'] as const).flatMap((where) =>
    engine.player[where].map((s, i): Row | null => (s && !(s.type in COIN_RATE) ? { kind: 'sell', key: where + i, where, i, item: s.type, count: s.count, unit: sellUnitPrice(engine, def, s) } : null)).filter((r): r is Row => !!r),
  ).sort((a, b) => ((b as { unit: number | null }).unit ?? -1) - ((a as { unit: number | null }).unit ?? -1))
  const rows = tab === 'buy' ? buyRows : sellRows
  rowCount.current = rows.length
  const cur = rows[Math.min(sel, rows.length - 1)]

  const plan = (cost: number) => (isBntg ? bntgPaymentPlan(engine, cost, pay) : have(coin) >= cost ? { credit: 0, cash: cost } : null)
  const affordable = (r: Row): boolean => {
    if (r.kind === 'buy') return !!plan(r.price)
    if (r.kind === 'barter') {
      const cash = r.give.reduce((n, [t, c]) => n + (t === 'presses' && isBntg ? c : 0), 0)
      return (!cash || !!plan(cash)) && r.give.every(([t, c]) => (t === 'presses' && isBntg) || have(t) >= c)
    }
    return r.unit != null
  }
  const report = (r: BankResult) => {
    setNotice({ ok: r.ok, text: r.message, n: Date.now() })
    if (r.ok) { audio.pickup(); engine.emit({ kind: 'toast', text: r.message }) } else audio.uiTick()
    setTick((x) => x + 1)
  }
  const act = (row = cur) => {
    if (!row || refused) return
    if (row.kind === 'buy') report(merchantBuy(engine, npcId, row.item, pay))
    else if (row.kind === 'barter') report(merchantBarter(engine, npcId, row.index, pay))
    else {
      const n = Math.min(qty, row.count)
      report(merchantSell(engine, npcId, row.where, row.i, n, pay))
      setQty(1)
    }
  }
  const priceText = (n: number) => `${skin.priceMark}${n}${skin.id === 'bntg' ? '' : ' ' + coinName}`
  const itemOf = (t: string) => ITEMS[t]
  const rowName = (r: Row) => r.kind === 'barter' ? `${itemOf(r.get)?.name ?? r.get}${r.getN > 1 ? ' ×' + r.getN : ''}` : `${itemOf(r.item)?.name ?? r.item}${r.kind === 'buy' && r.qty > 1 ? ' ×' + r.qty : r.kind === 'sell' && r.count > 1 ? ' ×' + r.count : ''}`
  const rowPrice = (r: Row) => r.kind === 'buy' ? priceText(r.price) : r.kind === 'barter' ? r.give.map(([t, c]) => `${itemOf(t)?.name ?? t}×${c}`).join(' + ') : r.unit == null ? '不收' : priceText(r.unit)
  const rowType = (r: Row) => (r.kind === 'barter' ? r.get : r.item)

  const sellN = cur?.kind === 'sell' ? Math.max(1, Math.min(qty, cur.count)) : 1
  const actLabel = !cur ? '' : cur.kind === 'buy' ? `${skin.buyVerb} · ${priceText(cur.price)}` : cur.kind === 'barter' ? skin.barterVerb : cur.unit == null ? '不收这件' : `${skin.sellVerb} · ${priceText(cur.unit * sellN)}`
  const canAct = !!cur && near && !refused && affordable(cur)

  return (
    <div ref={root} className={`shop-root shop--${skin.id}`} role="dialog" aria-modal="true" aria-label={shopTitle(def, skin)} tabIndex={-1} onClick={onClose} data-shop-skin={skin.id}>
      <div className="shop-sheet anim-slideUp" onClick={(e) => e.stopPropagation()} style={{ ['--fac' as string]: fac?.color ?? '#e8b93c' }}>
        <div className="shop-deco" aria-hidden />
        <header className="shop-head">
          <div className="shop-emblem">{skin.emblem}</div>
          <div className="shop-titles">
            <div className="shop-kicker">{skin.kicker}</div>
            <h2 className="shop-title">{shopTitle(def, skin)}</h2>
            <div className="shop-keeper">{def.name} · {def.role}</div>
          </div>
          <div className="shop-wallet">
            {coin !== 'almond' && <span><i>{coinName}</i><b>{have(coin)}</b></span>}
            <span><i>杏仁水</i><b>{have('almond')}</b></span>
            {isBntg && <span><i>信用点</i><b>{engine.bntgBank.balance.toLocaleString('zh-CN')}</b></span>}
          </div>
        </header>
        <nav className="shop-tabs">
          <button className={tab === 'buy' ? 'on' : ''} onClick={() => { setTab('buy'); setSel(0); audio.uiTick() }}>{skin.buyTab}<em>{buyRows.length}</em></button>
          <button className={tab === 'sell' ? 'on' : ''} onClick={() => { setTab('sell'); setSel(0); setQty(1); audio.uiTick() }}>{skin.sellTab}</button>
          <span className="shop-tabs-gap" />
          {discount && <span className="shop-perk">声望优惠：买八折 · 回收加价</span>}
          <button className="shop-key" onClick={() => { audio.uiTick(); onTalk() }}><kbd>{bindLabelFor('interact')}</kbd>交谈</button>
          <button className="shop-key" onClick={() => { audio.uiTick(); onClose() }}><kbd>{bindLabelFor('special')}</kbd>离开</button>
        </nav>
        {refused ? (
          <div className="shop-refuse">{skin.refuse}<small>（与{fac?.name}的声望过低，交易被拒绝）</small></div>
        ) : (
          <main className="shop-body">
            <section className="shop-list" role="listbox">
              {rows.length === 0 && <div className="shop-empty">{tab === 'sell' ? skin.emptySell : '今天没有货。'}</div>}
              {rows.map((r, i) => {
                const on = r === cur, ok = affordable(r)
                return (
                  <button key={r.key} role="option" aria-selected={on} className={`shop-row${on ? ' on' : ''}${ok ? '' : ' off'}`} onClick={() => { setSel(i); setQty(1); audio.uiTick() }} onDoubleClick={() => { setSel(i); act(r) }}>
                    <span className="shop-glyph"><ItemGlyph type={rowType(r)} size={26} /></span>
                    <span className="shop-name">{rowName(r)}</span>
                    {r.kind === 'barter' && <span className="shop-tagx">换</span>}
                    <span className="shop-price">{rowPrice(r)}</span>
                  </button>
                )
              })}
            </section>
            <aside className="shop-detail">
              {cur ? (() => {
                const t = rowType(cur), it = itemOf(t)
                return (
                  <>
                    <div className="shop-detail-info">
                    <div className="shop-big"><ItemGlyph type={t} size={64} /></div>
                    <div className="shop-dname">{it?.name ?? t}</div>
                    <div className="shop-meta">{ITEM_RARITY_LABEL[it?.rarity ?? 'common']}{it?.anomalous ? ' · 后室物品' : ''} · 持有 {have(t)}</div>
                    <p className="shop-desc">{it?.desc}</p>
                    {cur.kind === 'barter' && (
                      <div className="shop-give">需要：{cur.give.map(([g, c]) => <span key={g} className={have(g) >= c || (g === 'presses' && isBntg) ? '' : 'short'}>{itemOf(g)?.name ?? g} ×{c}（有 {have(g)}）</span>)}</div>
                    )}
                    {cur.kind === 'sell' && cur.unit != null && cur.count > 1 && (
                      <div className="shop-qty">
                        <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                        <span>{sellN} / {cur.count}</span>
                        <button onClick={() => setQty((q) => Math.min(cur.count, q + 1))}>＋</button>
                        <button onClick={() => setQty(cur.count)}>全部</button>
                      </div>
                    )}
                    {isBntg && (cur.kind !== 'sell' || cur.unit != null) && (
                      <div className="shop-pay">
                        {(cur.kind === 'sell' ? [['auto', '收现金'], ['credits', '入账信用点']] : [['auto', '自动'], ['credits', '信用点'], ['cash', '压印币']]).map(([m, l]) => (
                          <button key={m} className={pay === m || (cur.kind === 'sell' && m === 'auto' && pay === 'cash') ? 'on' : ''} onClick={() => { setPay(m as BntgPaymentMode); audio.uiTick() }}>{l}</button>
                        ))}
                      </div>
                    )}
                    </div>
                    <button className="shop-act" disabled={!canAct} onClick={() => act()}>{actLabel}</button>
                    {!near && <div className="shop-warn">你离柜台太远了。</div>}
                  </>
                )
              })() : <div className="shop-empty">—</div>}
            </aside>
          </main>
        )}
        <footer className="shop-foot">
          {coin !== 'almond' && !!def.trade?.length && !refused && (
            <div className="shop-fx">
              <button onClick={() => report(merchantExchange(engine, npcId, 'sellAlmond', pay))}>杏仁水 ×1 → {coinName} ×{COIN_RATE[coin]}</button>
              <button onClick={() => report(merchantExchange(engine, npcId, 'buyAlmond', pay))}>{coinName} ×{COIN_RATE[coin]} → 杏仁水 ×1</button>
            </div>
          )}
          {notice && <div key={notice.n} className={`shop-notice${notice.ok ? '' : ' bad'}`} role="status">{notice.text}</div>}
          <div className="shop-motto">{skin.motto}</div>
        </footer>
      </div>
    </div>
  )
}
