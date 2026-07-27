// 胜利结算（亮色对比）
import { useEffect, useState } from 'react'
import type { Engine } from '@/game/engine'
import { seedString } from '@/game/rng'
import { audio } from '@/game/audio'

export default function VictoryScreen({ engine, onNG, onTitle }: { engine: Engine; onNG: () => void; onTitle: () => void }) {
  const p = engine.player
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 2000)
    const t2 = setTimeout(() => setStage(2), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])
  const mins = p.aliveTime / 60
  const rank = mins < 20 ? 'S' : mins < 35 ? 'A' : 'B'
  const rows: [string, string][] = [
    ['到达层级', 'LEVEL 5 · 恐怖酒店'],
    ['逃出用时', `${Math.floor(mins)}分${Math.floor(p.aliveTime % 60)}秒`],
    ['击杀', `${p.kills}`],
    ['评价', rank],
    ['种子', seedString(engine.seed)],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: '#efe9d8' }}>
      <div className="w-full max-w-[440px] text-center" style={{ opacity: stage >= 1 ? 1 : 0, transition: 'opacity 1.5s' }}>
        <div className="text-[15px] italic" style={{ color: '#5a544a' }}>你听到了……雨声。</div>
        <h1 className="font-title mt-3 text-[48px]" style={{ color: '#1a1815', opacity: stage >= 2 ? 1 : 0, transition: 'opacity 1.2s' }}>
          你 逃 出 来 了
        </h1>
        <div className="font-mono2 mx-auto mt-6 max-w-[320px] space-y-2 text-left text-[12px]" style={{ color: '#3a352c' }}>
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b pb-1" style={{ borderColor: '#c9c2ac' }}>
              <span style={{ color: '#7a7462' }}>{k}</span><span>{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center gap-3">
          <button className="menu-btn" style={{ borderColor: 'var(--amber)', color: '#8a6a10', background: 'rgba(255,255,255,0.4)' }} onClick={() => { audio.uiTick(); onNG() }}>新的挑战 (NG+)</button>
          <button className="menu-btn" style={{ color: '#5a544a', background: 'rgba(255,255,255,0.4)' }} onClick={() => { audio.uiTick(); onTitle() }}>回到标题</button>
        </div>
      </div>
    </div>
  )
}
