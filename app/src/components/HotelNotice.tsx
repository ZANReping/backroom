// L5 恐怖旅馆 1c：住客须知卡阅读视图——象牙卡纸、双线金框、装饰艺术角花；
// 店名、条号、正文、小字、页脚房号都与场景里那张卡一致（假卡的破绽：「恐怖旅舘」或四位数房号）。
// 卡下方附一行登记簿状态（未核实 / 已核实为真 / 已核实为假）。暂停游戏，点任意处或 Esc 关闭。
import { useEffect } from 'react'
import { engine } from '@/game/engine'
import { audio } from '@/game/core/audio'
import { L5_RULE, HOTEL_NAME, HOTEL_NAME_FAKE, type L5RuleCard } from '@/game/content/l5Rules'
import './HotelNotice.css'

export default function HotelNotice({ data, onClose }: { data: string; onClose: () => void }) {
  let card: L5RuleCard | null = null
  try { card = JSON.parse(data) as L5RuleCard } catch { card = null }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'e' || e.key === 'E') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  if (!card || !L5_RULE[card.rule]) return null
  const def = L5_RULE[card.rule]
  const st = engine.hotelBook.rules[card.rule]
  const status = st === 'true' ? '登记簿：已核实——属实' : st === 'false' ? '登记簿：已核实——不实' : '登记簿：未核实'
  return (
    <div className="hn-veil" onClick={() => { audio.uiTick(); onClose() }} onTouchEnd={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hn-card anim-slideUp" onClick={(e) => e.stopPropagation()}>
        <div className="hn-corner tl" /><div className="hn-corner tr" /><div className="hn-corner bl" /><div className="hn-corner br" />
        <div className="hn-name">{card.tellName ? HOTEL_NAME_FAKE : HOTEL_NAME}</div>
        <div className="hn-kicker">— 住 客 须 知 —</div>
        <div className="hn-rule" />
        <div className="hn-no">第 {card.no} 条</div>
        <div className="hn-text">{def.text}</div>
        <div className="hn-sub">{def.sub}</div>
        <div className="hn-rule bottom" />
        <div className="hn-foot">前台 敬启 · 客房 {card.room}</div>
      </div>
      <div className={`hn-status ${st === 'true' ? 'ok' : st === 'false' ? 'bad' : ''}`}>{status}</div>
      <div className="hn-close">点任意处或按 Esc 放下</div>
    </div>
  )
}
