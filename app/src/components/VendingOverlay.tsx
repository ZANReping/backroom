// [vending] 售货机交互界面（普通售货机 / Entity 36 共用）。
// 不暂停游戏：界面像机器右侧的操作区一样贴在屏幕右边，左边留给 3D 机器——按键后出货片段就在玻璃后面真实播放，
// 货掉进取货口后，点界面上的「取货口」拿走。Entity 36 的界面起雾、发暗，出货时底部有哭声字幕。
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { engine } from '@/game/engine'
import { closeVending, vendingInsertTape, vendingKick, vendingPress, vendingTake, vendingView } from '@/game/engine/vendingAI'
import './VendingOverlay.css'

const KEYS_L = ['A', 'B'] as const
const KEYS_N = ['1', '2', '3', '4'] as const

export default function VendingOverlay({ onClose }: { onClose: () => void }) {
  const [, setTick] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    root.current?.focus()
    const id = window.setInterval(() => setTick((n) => n + 1), 90)
    return () => { window.clearInterval(id); closeVending(engine); prev?.focus() }
  }, [])
  const v = vendingView(engine)
  const gone = !v || v.gone
  useEffect(() => { if (gone) onClose() }, [gone, onClose])
  if (!v) return null
  const e36 = v.variant === 'e36'
  const press = (k: string) => { vendingPress(engine, k); setTick((n) => n + 1) }
  const take = () => { vendingTake(engine); setTick((n) => n + 1) }
  const key = (ev: KeyboardEvent<HTMLDivElement>) => {
    ev.stopPropagation()
    if (ev.key === 'Tab') {
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = (at + (ev.shiftKey ? -1 : 1) + buttons.length) % buttons.length
      if (buttons.length) { ev.preventDefault(); buttons[next].focus() }
      return
    }
    const k = ev.key.toUpperCase()
    if (ev.key === 'Escape') { ev.preventDefault(); onClose(); return }
    if (k === 'A' || k === 'B' || /^[1-4]$/.test(k)) { ev.preventDefault(); press(k); return }
    if (k === 'C' || ev.key === 'Backspace') { ev.preventDefault(); press('C'); return }
    if (k === 'E' || ev.key === 'Enter') { ev.preventDefault(); take(); return }
    if (ev.key === ' ' && v.jammed) { ev.preventDefault(); vendingKick(engine) }
  }
  const style = { '--vm-ink': v.ink, '--vm-accent': v.accent, '--vm-body': v.body, '--vm-face': v.face } as React.CSSProperties
  return <div className={'vm-overlay' + (e36 ? ' vm-e36' : '')} onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose() }}>
    <div className="vm-panel" role="dialog" aria-modal="true" aria-label={v.title + ' 自动售货机'} tabIndex={-1} ref={root} onKeyDown={key} style={style}>
      <header className="vm-head">
        <div><strong>{v.title}</strong><span>{v.sub}</span></div>
        <button className="vm-close" aria-label="离开售货机" onClick={onClose}>×</button>
      </header>
      <section className="vm-shelf" aria-label="陈列窗">
        {v.slots.map((s) => <button key={s.code} className={'vm-slot' + (s.stock <= 0 ? ' is-out' : '') + (s.selected ? ' is-sel' : '')}
          disabled={v.busy || v.broken} onClick={() => { press(s.code[0]); press(s.code[1]) }}>
          <b>{s.code}</b><span className="vm-name">{s.name}</span><small>{s.blurb}</small>
          <i className="vm-lamp" aria-label={s.stock > 0 ? '有货' : '售罄'} /><em>{s.stock > 0 ? (e36 ? '免费' : '¥0') : '售罄'}</em>
        </button>)}
      </section>
      <section className="vm-ops">
        <div className="vm-led" aria-live="polite"><span>{v.broken ? '' : v.display}</span></div>
        <div className="vm-keys">
          <div className="vm-row">{KEYS_L.map((k) => <button key={k} className="vm-key vm-key-l" disabled={v.busy || v.broken} onClick={() => press(k)}>{k}</button>)}
            <button className="vm-key vm-key-c" disabled={v.busy || v.broken} onClick={() => press('C')} aria-label="清除">C</button></div>
          <div className="vm-row">{KEYS_N.map((k) => <button key={k} className="vm-key" disabled={v.busy || v.broken} onClick={() => press(k)}>{k}</button>)}</div>
        </div>
        {v.tape && <div className="vm-tape"><span>只收磁带 · 额度 <b>{v.credit}</b></span>
          <button disabled={v.tapes <= 0} onClick={() => vendingInsertTape(engine)}>投入磁带（{v.tapes}）</button></div>}
        {v.jammed && <div className="vm-jam"><span>{v.jamName ? `「${v.jamName}」卡在格口` : '机器罢工了'}</span>
          <button onClick={() => vendingKick(engine)}>拍打机身 <small>空格</small></button></div>}
      </section>
      <button className={'vm-bin' + (v.bin ? ' has-item' : '')} disabled={!v.bin} onClick={take}>
        <span className="vm-bin-flap">PUSH 取货口</span>
        <strong>{v.bin ? v.bin.name : v.busy ? (e36 ? '……有什么在里面推' : '出货中…') : '空'}</strong>
        {v.bin && <small>点击或按 E 取出</small>}
      </button>
      <footer className="vm-foot">{e36 ? (v.cry || '字母键 + 数字键选格 · 无需支付') : '字母键 + 数字键选格 · 免费取用 · 出货后偶尔会卡'}</footer>
    </div>
  </div>
}
