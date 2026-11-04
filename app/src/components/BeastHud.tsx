// [beast] 第五层的野兽（Entity 18）HUD：字幕（他说的话只用字幕，不配音）/ 熄灯黑幕（惩罚：熄灯 → 背后缠抓）/ 契约倒计时小条 / 「再也不会感到恐惧」剩余时间。
// 只读 beastAI.beastHud；什么都没有时不渲染。HUD.tsx 里一行接入（// [beast]）。
import type { Engine } from '@/game/engine'
import { beastHud } from '@/game/engine/beastAI'
import './BeastDeal.css'

const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export default function BeastHud({ engine }: { engine: Engine }) {
  const v = beastHud(engine)
  if (!v.sub && !v.veil && !v.contract && v.fear === null) return null
  return (
    <>
      {v.veil > 0 && <div data-beast-veil={v.veil.toFixed(2)} className="pointer-events-none fixed inset-0 z-[46]" style={{ background: 'radial-gradient(ellipse at center, rgba(4,6,6,0.86), #000 70%)', opacity: v.veil }} />}
      {v.sub && <div data-beast-sub className="bd-sub"><span className="who">野兽</span>{v.sub}</div>}
      {(v.contract || v.fear !== null) && (
        <div data-beast-chip className="bd-chip">
          {v.contract && <div>{v.contract}</div>}
          {v.fear !== null && <div style={{ color: '#b8d8a0' }}>再也不会感到恐惧 · {mm(v.fear)}</div>}
        </div>
      )}
    </>
  )
}
