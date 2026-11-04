// [casino] Level 5.1 HUD：筹码（红 / 蓝 / 黄 / 绿）· 紫筹码（中心数字，可负）· 上瘾（「再来一把」冲动）· 醉意 · 心声字幕 · 拦门提示。场内无钟：不显示营业倒计时。
import { useEffect, useState } from 'react'
import type { Engine } from '@/game/engine'
import { casinoHud } from '@/game/engine/casinoAI'
import './CasinoMenu.css'
import CasinoSeat from './CasinoSeat'
export default function CasinoHud({ engine }: { engine: Engine }) {
  const [, setT] = useState(0)
  useEffect(() => { const id = setInterval(() => setT((x) => x + 1), 250); return () => clearInterval(id) }, [])
  const v = casinoHud(engine)
  if (!v) return null
  return (<>
    <CasinoSeat engine={engine} />
    <div className="ch-hud" data-casino-hud>
      <div className="ch-row">
        <span className="cm-chip r" />{v.denom.red}<span className="cm-chip b" />{v.denom.blue}<span className="cm-chip y" />{v.denom.yellow}<span className="cm-chip g" />{v.denom.green}<b>&nbsp;{v.chips}</b>
        {v.pchip ? <span className={'cm-purple' + (v.debt ? ' neg' : '')}>{v.purple}</span> : null}
      </div>
      {v.addict > 0 && <div className="ch-row">再来一把 <span className="ch-bar"><i style={{ width: v.addict + '%' }} /></span>{v.again ? ` ×${v.again}` : ''}{v.drunk ? ` · 醉意 ${v.drunk}s` : ''}</div>}
      {v.voice && <div className="ch-voice">「{v.voice}」</div>}
      {v.block && <div className="ch-row ch-block">{v.block}</div>}
      {!v.open && <div className="ch-row">打烊中</div>}
    </div>
  </>)
}
