// [beast] 第五层的野兽（Entity 18）契约界面：117 办公室书桌前 X「谈生意」打开（暂停游戏）。
//   · 普通交易：三份契约（好处池三项各一份 + 限时任务），点一份 = 签约（他推契约递笔 → 握手即签，握手时好处兑现）；下方「婉拒」「怀疑他」；Esc = 再想想。
//   · 强签（关注度满 / 违约 / 怀疑之后被拖进办公室）：两份苛刻契约二选一（交出一件物品 / 理智上限 −20），不能关。
// 复用 HotelNotice 的卡纸样式（hn-*）。数字键 1–3 选契约。
import { useEffect } from 'react'
import { engine } from '@/game/engine'
import { audio } from '@/game/core/audio'
import { beastDealView, beastChoose, beastForcedSign, beastDecline, beastDoubt, beastCloseDeal, beastActive, beastSave } from '@/game/engine/beastAI'
import './HotelNotice.css'
import './BeastDeal.css'

export default function BeastDeal({ onClose }: { onClose: () => void }) {
  const v = beastDealView(engine)
  const act = (f: () => boolean) => { if (f()) { audio.uiTick(); onClose() } }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'Escape') { e.preventDefault(); act(() => beastCloseDeal(engine)) }
      const m = /^(?:Digit|Numpad)([1-3])$/.exec(e.code)
      if (m) { const i = Number(m[1]) - 1; const d = beastDealView(engine); if (!d) return; e.preventDefault(); if (d.forced) { const h = d.harsh[i]; if (h) act(() => beastForcedSign(engine, h.clause)) } else act(() => beastChoose(engine, i)) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  if (!v) return null
  const active = beastActive(beastSave(engine))[0]
  return (
    <div className="hn-veil" data-beast-deal={v.forced ? 'forced' : 'offer'}>
      <div className="bd-who">— 第五层的野兽 —</div>
      <div className="bd-line">「{v.line}」</div>
      {!v.forced && active && <div className="hn-status">（你们之间还有一份契约没了结：No.{active.id}）</div>}
      <div className="bd-row">
        {!v.forced && v.offers.map((o, i) => (
          <div key={i} className="bd-card hn-card anim-slideUp" role="button" tabIndex={0} data-beast-offer={o.boon} onClick={() => act(() => beastChoose(engine, i))}>
            <div className="hn-corner tl" /><div className="hn-corner tr" /><div className="hn-corner bl" /><div className="hn-corner br" />
            <div className="hn-kicker">— 契 约 · {i + 1} —</div>
            <div className="hn-name">{o.title}</div>
            <div className="hn-rule" />
            <div className="bd-k">甲方给予</div><div className="bd-v">{o.boonText}</div>
            <div className="bd-k">乙方须</div><div className="bd-v">{o.taskText}</div>
            <div className="bd-k" style={{ fontSize: 11 }}>逾期视为违约。</div>
            <div className="bd-seal">兽</div>
          </div>
        ))}
        {v.forced && v.harsh.map((h, i) => (
          <div key={h.clause} className="bd-card hn-card harsh anim-slideUp" role="button" tabIndex={0} data-beast-harsh={h.clause} onClick={() => act(() => beastForcedSign(engine, h.clause))}>
            <div className="hn-corner tl" /><div className="hn-corner tr" /><div className="hn-corner bl" /><div className="hn-corner br" />
            <div className="hn-kicker">— 契 约 · {i + 1} —</div>
            <div className="hn-name">{h.title}</div>
            <div className="hn-rule" />
            <div className="bd-v">{h.text}</div>
            <div className="bd-k" style={{ fontSize: 11, color: '#e8b48a' }}>本契约不可撤销。</div>
            <div className="bd-seal">兽</div>
          </div>
        ))}
      </div>
      {!v.forced && (
        <div className="bd-actions">
          <button className="bd-btn" onClick={() => act(() => beastDecline(engine))}>婉拒</button>
          <button className="bd-btn doubt" onClick={() => act(() => beastDoubt(engine))}>「我凭什么相信你？」</button>
        </div>
      )}
      <div className="hn-close">{v.forced ? '选一份。笔已经在你手里了。' : '点一份契约签下（握手即签）· 数字键 1–3 · Esc 再想想'}</div>
    </div>
  )
}
