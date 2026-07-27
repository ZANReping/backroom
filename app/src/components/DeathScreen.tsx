// 死亡结算
import { useEffect, useState } from 'react'
import type { Engine } from '@/game/engine'
import { seedString } from '@/game/rng'
import { WIN_TAPES } from '@/game/levels'
import { audio } from '@/game/audio'

export default function DeathScreen({ engine, cause, onRetry, onTitle }: { engine: Engine; cause: string; onRetry: () => void; onTitle: () => void }) {
  const p = engine.player
  const [chars, setChars] = useState(0)
  const title = '你 死 了'
  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i <= title.length; i++) ts.push(setTimeout(() => setChars(i), 300 + i * 60))
    return () => ts.forEach(clearTimeout)
  }, [])
  const rows: [string, string][] = [
    ['到达层级', `LEVEL ${p.level} · ${engine.levelDef.name}`],
    ['存活时间', `${Math.floor(p.aliveTime / 60)}分${Math.floor(p.aliveTime % 60)}秒`],
    ['击杀', `${p.kills}`],
    ['收集磁带', `${p.tapes}/${WIN_TAPES}`],
    ['步数', `${Math.round(p.steps)}`],
    ['种子', seedString(engine.seed)],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div className="hud-panel relative w-full max-w-[420px] overflow-hidden p-6" style={{ borderColor: 'var(--blood)' }}>
        {/* 血滴渐变 */}
        <div className="pointer-events-none absolute inset-x-0 top-0" style={{ background: 'linear-gradient(to bottom, rgba(179,53,43,0.35), transparent)', animation: 'dripDown 2s ease-out both' }} />
        <h1 className="font-title text-center text-[56px]" style={{ color: 'var(--blood)', textShadow: '0 0 20px rgba(179,53,43,0.5)' }}>
          {title.slice(0, chars)}
        </h1>
        <div className="mt-1 text-center text-[13px]" style={{ color: 'var(--text-dim)' }}>死因:{cause}</div>
        <div className="font-mono2 mt-5 space-y-2 text-[12px]">
          {rows.map(([k, v], i) => (
            <div key={k} className="anim-slideUp flex justify-between border-b pb-1" style={{ borderColor: 'var(--panel-edge)', animationDelay: `${800 + i * 90}ms` }}>
              <span style={{ color: 'var(--text-dim)' }}>{k}</span>
              <span style={{ color: 'var(--text)' }}>{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button className="menu-btn flex-1 text-center" style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={() => { audio.uiTick(); onRetry() }}>再来一次</button>
          <button className="menu-btn flex-1 text-center" onClick={() => { audio.uiTick(); onTitle() }}>回到标题</button>
        </div>
      </div>
    </div>
  )
}
