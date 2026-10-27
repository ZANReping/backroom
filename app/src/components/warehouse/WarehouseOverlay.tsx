// 阵营寄存仓库界面（从寄存 NPC 的对话里打开，整屏独立页面）：M.E.G. = 军需物资库（钢格货架 + 登记牌），
// B.N.T.G. = 保管箱库（黄铜编号保管箱 + 存取凭条）。左仓库 48 栏 / 中详情 / 右背包（快捷栏 + 行囊）。
// 操作：点格选中 → 寄存 / 取回（可选数量）；双击整格移动；拖拽到另一侧；同类一键；整理仓库。
// 键盘：Tab 切换仓库/背包 · 方向键移动选格 · Enter 整格移动 · Shift+Enter 同类全部 · E 返回交谈（Esc 由 App 关闭对话）。
// 规则全部在 engine/warehouse.ts；临时通行（BNTG 付费）仍由 DialogOverlay 卸载时清空。
import { useEffect, useRef, useState } from 'react'
import { NPCS } from '@/game/content/npcs'
import { ITEMS, ITEM_RARITY_LABEL } from '@/game/content/items'
import { engine } from '@/game/engine'
import { audio } from '@/game/core/audio'
import { bindLabelFor, getKeybinds } from '@/game/core/keybinds'
import { ItemGlyph } from '../HUD'
import {
  WAREHOUSE_CAT_LABEL, WAREHOUSE_REP_GATE, WAREHOUSE_SIZE, warehouseCat, warehouseDepositAllOf, warehouseDepositN,
  warehouseSort, warehouseWithdrawAllOf, warehouseWithdrawN, type WarehouseFaction,
} from '@/game/engine/warehouse'
import type { InvSlot } from '@/game/engine'
import './WarehouseOverlay.css'

type Side = 'wh' | 'inv'
type Pick = { side: 'wh'; i: number } | { side: 'inv'; w: 'hotbar' | 'backpack'; i: number }

const SKIN: Record<WarehouseFaction, {
  kicker: string; title: string; share: string; whLabel: string; invLabel: string; cellCode: (i: number) => string
  put: string; take: string; putAll: string; takeAll: string; sort: string; motto: string; empty: string; emblem: string
}> = {
  meg: {
    kicker: 'M.E.G. SUPPLY DEPOT · 寄存登记', title: '联合物资库', share: 'Alpha / Beta / Gemma / Omega 基地互通',
    whLabel: '库位', invLabel: '随身', cellCode: (i) => `${'ABCDEF'[Math.floor(i / 8)]}-${String((i % 8) + 1).padStart(2, '0')}`,
    put: '登记入库', take: '领出', putAll: '全部入库', takeAll: '全部领出', sort: '整理货架', motto: '入库登记 · 出库签字 · 别把实体样本放进普通货位', empty: '空库位', emblem: 'M.E.G.',
  },
  bntg: {
    kicker: 'B.N.T.G. SAFE DEPOSIT · 保管箱库', title: '保管箱库', share: '存储设施 / EL3A / 新时代广场互通',
    whLabel: '保管箱', invLabel: '随身物品', cellCode: (i) => String(i + 1).padStart(3, '0'),
    put: '存入保管箱', take: '取出', putAll: '全部存入', takeAll: '全部取出', sort: '整理箱位', motto: 'Bartering · Negotiation · Trade · Goods — 您的物品，我们保管', empty: '空箱', emblem: 'B.N.T.G.',
  },
}

export default function WarehouseOverlay({ npcId, onBack, onClose }: { npcId: string; onBack: () => void; onClose: () => void }) {
  const def = NPCS[npcId] ?? engine.npcs.find((n) => n.id === npcId)?.def
  const fac = def?.warehouse as WarehouseFaction | undefined
  const [pick, setPick] = useState<Pick | null>(null)
  const [focus, setFocus] = useState<Side>('inv')
  const [qty, setQty] = useState(1)
  const [notice, setNotice] = useState<{ ok: boolean; text: string; n: number } | null>(null)
  const [drag, setDrag] = useState<Pick | null>(null)
  const [, setTick] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const p = engine.player
  const wh = fac ? engine.warehouses[fac] : []
  const invCells: Pick[] = [...p.hotbar.map((_, i) => ({ side: 'inv', w: 'hotbar', i }) as Pick), ...p.backpack.map((_, i) => ({ side: 'inv', w: 'backpack', i }) as Pick)]
  const slotOf = (k: Pick | null): InvSlot | null => !k ? null : k.side === 'wh' ? wh[k.i] ?? null : p[k.w][k.i] ?? null
  const cur = slotOf(pick)
  const say = (ok: boolean, text: string) => { setNotice({ ok, text, n: Date.now() }); if (ok) { audio.pickup(); engine.persist() } else audio.uiTick(); setTick((x) => x + 1) }

  const move = (k: Pick | null, n?: number) => {
    const s = slotOf(k)
    if (!fac || !k || !s) return
    if (!engine.canUseWarehouse(npcId)) { say(false, '仓库权限已失效，请返回交谈。'); return }
    const name = ITEMS[s.type]?.name ?? s.type
    const c = Math.min(n ?? s.count, s.count)
    if (k.side === 'wh') {
      const ok = warehouseWithdrawN(engine, fac, k.i, n)
      say(ok, ok ? `${SKIN[fac].take}：${name}${c > 1 ? ' ×' + c : ''}` : '背包已满，取不出来。')
    } else {
      const ok = warehouseDepositN(engine, fac, { w: k.w, i: k.i }, n)
      say(ok, ok ? `${SKIN[fac].put}：${name}${c > 1 ? ' ×' + c : ''}` : `仓库已满（${WAREHOUSE_SIZE} 栏）。`)
    }
    if (!slotOf(k)) setPick(null)
    setQty(1)
  }
  const moveAll = (k: Pick | null) => {
    const s = slotOf(k)
    if (!fac || !k || !s) return
    if (!engine.canUseWarehouse(npcId)) { say(false, '仓库权限已失效，请返回交谈。'); return }
    const name = ITEMS[s.type]?.name ?? s.type
    const n = k.side === 'wh' ? warehouseWithdrawAllOf(engine, fac, s.type) : warehouseDepositAllOf(engine, fac, s.type)
    say(n > 0, n > 0 ? `${k.side === 'wh' ? SKIN[fac].takeAll : SKIN[fac].putAll}：${name} ×${n}` : k.side === 'wh' ? '背包已满，取不出来。' : '仓库已满。')
    if (!slotOf(k)) setPick(null)
  }
  const sortWh = () => { if (!fac || !engine.canUseWarehouse(npcId)) return; const ok = warehouseSort(engine, fac); setPick(null); say(ok, ok ? '已并摞同类并按分类排好。' : '未能整理，原库存已保留。') }

  // 键盘
  useEffect(() => {
    const kb = getKeybinds()
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); onClose(); return }
      if (e.code === kb.interact && !e.repeat) { e.preventDefault(); audio.uiTick(); onBack(); return }
      if (e.code === 'Tab') {
        e.preventDefault(); audio.uiTick()
        const to: Side = focus === 'wh' ? 'inv' : 'wh'
        setFocus(to); setPick(to === 'wh' ? { side: 'wh', i: 0 } : invCells[0]); setQty(1); return
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault()
        const cells = [...(root.current?.querySelectorAll<HTMLButtonElement>(focus === 'wh' ? '.wh-store .wh-cell' : '.wh-inv .wh-cell') ?? [])]
        const idx = !pick || pick.side !== focus ? 0 : pick.side === 'wh' ? pick.i : invCells.findIndex(c => c.side === 'inv' && pick.side === 'inv' && c.w === pick.w && c.i === pick.i)
        const rect = cells[idx]?.getBoundingClientRect()
        let next = idx
        if (rect) {
          const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
          const horizontal = e.code === 'ArrowLeft' || e.code === 'ArrowRight', sign = e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? -1 : 1
          let best = Infinity
          cells.forEach((cell, i) => {
            const r = cell.getBoundingClientRect(), dx = r.x + r.width / 2 - x, dy = r.y + r.height / 2 - y
            const forward = (horizontal ? dx : dy) * sign, across = Math.abs(horizontal ? dy : dx)
            if (forward < 1 || horizontal && across > rect.height * .6) return
            const score = forward * 1000 + across
            if (score < best) { best = score; next = i }
          })
        }
        setPick(focus === 'wh' ? { side: 'wh', i: next } : invCells[next]); setQty(1); return
      }
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) { e.preventDefault(); if (e.shiftKey) moveAll(pick); else move(pick) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  useEffect(() => {
    const previous = document.activeElement
    root.current?.focus({ preventScroll: true })
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  useEffect(() => { root.current?.querySelector('.wh-cell.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [pick, focus])
  if (!def || !fac) return null
  if (!engine.canUseWarehouse(npcId)) return <div className={`wh-root wh--${fac}`} data-wh-skin={fac} role="dialog" aria-modal="true" aria-label="仓库权限不足"><div className="wh-sheet wh-locked" role="alert"><p>仓库权限已失效，请返回交谈。</p><button className="wh-key" onClick={onBack}>返回交谈</button><button className="wh-key" onClick={onClose}>关闭</button></div></div>
  const sk = SKIN[fac]
  const used = wh.filter(Boolean).length
  const temp = engine.warehouseTempUnlock.has(fac) && (engine.rep[fac] ?? 0) < WAREHOUSE_REP_GATE
  const same = (a: Pick | null, b: Pick) => !!a && a.side === b.side && a.i === b.i && (a.side === 'wh' || (b.side === 'inv' && a.w === b.w))

  const cell = (k: Pick, s: InvSlot | null, label: string) => {
    const on = same(pick, k)
    const it = s ? ITEMS[s.type] : null
    const charges = s && it?.charges ? (s.dur ?? it.charges) : null
    return (
      <button
        key={(k.side === 'wh' ? 'w' : k.w[0]) + k.i}
        className={`wh-cell${s ? ' full' : ''}${on ? ' on' : ''}${s ? ' r-' + (it?.rarity ?? 'common') : ''}`}
        aria-pressed={on}
        data-wh-side={k.side}
        data-wh-where={k.side === 'inv' ? k.w : undefined}
        data-wh-index={k.i}
        title={label}
        aria-label={s ? `${it?.name ?? s.type} ×${s.count}` : `${label} 空`}
        draggable={!!s}
        onDragStart={e => { e.dataTransfer.setData('application/x-backroom-warehouse', JSON.stringify(k)); e.dataTransfer.effectAllowed = 'move'; setDrag(k) }}
        onDragEnd={() => setDrag(null)}
        onDragOver={(e) => { if (drag && drag.side !== k.side) e.preventDefault() }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag && drag.side !== k.side) move(drag); setDrag(null) }}
        onClick={() => { setPick(k); setFocus(k.side); setQty(1); audio.uiTick() }}
        onDoubleClick={() => { setPick(k); move(k) }}
      >
        <span className="wh-code">{label}</span>
        {s && <span className="wh-ico"><ItemGlyph type={s.type} size={30} /></span>}
        {s && s.count > 1 && <span className="wh-n">{s.count}</span>}
        {charges != null && <span className="wh-n">{charges}/{it!.charges}</span>}
      </button>
    )
  }
  const dropZone = (side: Side) => ({
    onDragOver: (e: React.DragEvent) => { if (drag && drag.side !== side) e.preventDefault() },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (drag && drag.side !== side) move(drag); setDrag(null) },
  })

  const it = cur ? ITEMS[cur.type] : null
  const n = cur ? Math.max(1, Math.min(qty, cur.count)) : 1
  const isWh = pick?.side === 'wh'
  const elsewhere = cur ? (isWh ? engine.countItem(cur.type) : wh.reduce((t, s) => t + (s && s.type === cur.type ? s.count : 0), 0)) : 0

  return (
    <div ref={root} className={`wh-root wh--${fac}`} data-wh-skin={fac} role="dialog" aria-modal="true" aria-label={sk.title} tabIndex={-1}>
      <div className="wh-sheet anim-slideUp">
        <div className="wh-deco" aria-hidden />
        <header className="wh-head">
          <div className="wh-emblem">{sk.emblem}</div>
          <div className="wh-titles">
            <div className="wh-kicker">{sk.kicker}</div>
            <h2 className="wh-title">{sk.title}</h2>
            <div className="wh-keeper">经办：{def.name} · {def.role}</div>
          </div>
          <div className="wh-cap">
            <div className="wh-cap-num"><b>{used}</b>/{WAREHOUSE_SIZE} 栏</div>
            <div className="wh-cap-bar"><i style={{ width: `${(used / WAREHOUSE_SIZE) * 100}%` }} /></div>
            <div className="wh-cap-note">{sk.share}</div>
            {temp && <div className="wh-temp">临时通行 · 仅本次对话</div>}
          </div>
        </header>
        <main className="wh-body">
          <section className={`wh-pane wh-store${focus === 'wh' ? ' focus' : ''}`} {...dropZone('wh')}>
            <div className="wh-pane-head"><span>{sk.whLabel}</span><button className="wh-mini" onClick={sortWh} disabled={!used}>{sk.sort}</button></div>
            <div className="wh-grid">{wh.map((s, i) => cell({ side: 'wh', i }, s, sk.cellCode(i)))}</div>
          </section>
          <aside className={`wh-detail${cur && it ? '' : ' idle'}`}>
            {cur && it ? (
              <>
                <div className="wh-detail-info"><div className="wh-tag">
                  <div className="wh-tag-code">{isWh ? `${sk.whLabel} ${sk.cellCode((pick as { i: number }).i)}` : pick?.side === 'inv' && pick.w === 'hotbar' ? `快捷栏 ${pick.i + 1}` : `行囊 ${(pick as { i: number }).i + 1}`}</div>
                  <div className="wh-big"><ItemGlyph type={cur.type} size={64} /></div>
                  <div className="wh-dname">{it.name}</div>
                  <div className="wh-meta">{WAREHOUSE_CAT_LABEL[warehouseCat(cur.type)]} · {ITEM_RARITY_LABEL[it.rarity ?? 'common']}{it.anomalous ? ' · 后室物品' : ''}</div>
                  <div className="wh-meta">这一格 {cur.count} 件 · {isWh ? '身上' : '库里'}另有 {elsewhere} 件</div>
                  <p className="wh-desc">{it.desc}</p>
                </div>
                </div>
                {cur.count > 1 && (
                  <div className="wh-qty">
                    <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                    <span>{n} / {cur.count}</span>
                    <button onClick={() => setQty((q) => Math.min(cur.count, q + 1))}>＋</button>
                    <button onClick={() => setQty(cur.count)}>整格</button>
                  </div>
                )}
                <button className="wh-act" onClick={() => move(pick, n)}>
                  {isWh ? `◀ ${sk.take}` : `${sk.put} ▶`}{n > 1 ? ` ×${n}` : ''}
                </button>
                <button className="wh-act2" onClick={() => moveAll(pick)}>{isWh ? sk.takeAll : sk.putAll}「{it.name}」</button>
              </>
            ) : (
              <div className="wh-hint">
                <p>点一格查看，再选「{sk.put}」或「{sk.take}」。</p>
                <p>双击整格移动，或拖到另一边。</p>
                <p className="wh-hint-k"><kbd>Tab</kbd> 切换 · <kbd>方向键</kbd> 选格 · <kbd>Enter</kbd> 移动 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 同类全部</p>
                <p className="wh-hint-k">装备位物品要先卸下才能寄存。</p>
              </div>
            )}
          </aside>
          <section className={`wh-pane wh-inv${focus === 'inv' ? ' focus' : ''}`} {...dropZone('inv')}>
            <div className="wh-pane-head"><span>{sk.invLabel}</span><em>快捷栏</em></div>
            <div className="wh-grid wh-hot">{p.hotbar.map((s, i) => cell({ side: 'inv', w: 'hotbar', i }, s, String(i + 1)))}</div>
            <div className="wh-pane-head sub"><em>行囊</em></div>
            <div className="wh-grid">{p.backpack.map((s, i) => cell({ side: 'inv', w: 'backpack', i }, s, ''))}</div>
          </section>
        </main>
        <footer className="wh-foot">
          {notice && <div key={notice.n} className={`wh-notice${notice.ok ? '' : ' bad'}`} role="status">{notice.text}</div>}
          <div className="wh-motto">{sk.motto}</div>
          <button className="wh-key" onClick={() => { audio.uiTick(); onBack() }}><kbd>{bindLabelFor('interact')}</kbd>返回交谈</button>
          <button className="wh-key wh-close" aria-label="关闭仓库与交谈" onClick={onClose}>关闭</button>
        </footer>
      </div>
    </div>
  )
}
