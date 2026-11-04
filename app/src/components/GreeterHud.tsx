// [spokes] 迎宾女郎（Entity 28）HUD：双字幕——上行是领口音箱的甜美推销（全是反话），下行是斜体灰字的被困心声（一半求救、一半真线索）。
// 给她看过照片之后的那一次清晰提示：下行变成白色正体。只读 spokesAI.spokesHud；没有字幕时不渲染。HUD.tsx 里一行接入（// [spokes]）。
import type { Engine } from '@/game/engine'
import { spokesHud } from '@/game/engine/spokesAI'
import './Spokes.css'

export default function GreeterHud({ engine }: { engine: Engine }) {
  const v = spokesHud(engine)
  if (!v || (!v.top && !v.inner)) return null
  return (
    <div className="sp-subs" data-spokes-sub>
      {v.top && <div className="sp-top" data-spokes-top><span className="who">音箱</span>{v.top}</div>}
      {v.inner && <div className={`sp-inner${v.clear ? ' clear' : ''}`} data-spokes-inner>{v.clear || v.inner.startsWith('（') ? v.inner : `（${v.inner}）`}</div>}
    </div>
  )
}
