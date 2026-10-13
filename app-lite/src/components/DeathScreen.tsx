// 死亡结算
import { useEffect, useState } from 'react'
import type { Engine } from '@/game/engine'
import { seedString } from '@/game/core/rng'
import { WIN_TAPES } from '@/game/levels'
import { audio } from '@/game/core/audio'
import ToySurvivalReport from './ToySurvivalReport'
import { makeReport, type SurvivalReport } from '@/game/platform/toyReport'

export default function DeathScreen({ engine, cause, onRetry, onTitle }: { engine: Engine; cause: string; onRetry: () => void; onTitle: () => void }) {
  const p = engine.player
  const [report, setReport] = useState<SurvivalReport | null>(null)
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
  // 2026-10 UI：事故报告式结算——编号取自种子，死因置于血色框，数据两列大字号
  return (
    <div className="end-backdrop end-backdrop--death fixed inset-0 z-50 flex items-center justify-center p-4">
      {report && <ToySurvivalReport report={report} onClose={() => setReport(null)} />}
      <div className="end-card end-card--death hud-panel relative max-h-[90dvh] w-full max-w-[480px] overflow-y-auto p-6" style={{ borderColor: 'var(--blood)' }}>
        {/* 血滴渐变 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-full" style={{ background: 'linear-gradient(to bottom, color-mix(in srgb, var(--blood) 30%, transparent), transparent 55%)', animation: 'dripDown 2s ease-out both' }} />
        <div className="end-kicker font-mono2 relative">
          <span>INCIDENT REPORT · 事故报告</span>
          <span>#{seedString(engine.seed)}</span>
        </div>
        <h1 className="font-title relative mt-2 text-center text-[56px]" style={{ color: 'var(--blood)', textShadow: '0 0 20px color-mix(in srgb, var(--blood) 50%, transparent)' }}>
          {title.slice(0, chars)}<span className="end-caret" aria-hidden>▌</span>
        </h1>
        <div className="end-cause relative anim-slideUp" style={{ animationDelay: '700ms' }}>
          <span className="font-mono2">死因</span>
          <span>{cause}</span>
        </div>
        <div className="end-stats font-mono2 relative">
          {rows.filter(([k]) => k !== '种子').map(([k, v], i) => (
            <div key={k} className={`end-stat anim-slideUp ${k === '到达层级' ? 'is-wide' : ''}`} style={{ animationDelay: `${800 + i * 90}ms` }}>
              <span className="end-stat-k">{k}</span>
              <span className="end-stat-v">{v}</span>
            </div>
          ))}
        </div>
        <div className="relative mt-6 flex gap-3">
          <button className="menu-btn menu-btn--primary end-btn flex-1 text-center" onClick={() => { audio.uiTick(); onRetry() }}>再来一次</button>
          <button className="menu-btn end-btn flex-1 text-center" onClick={() => { audio.uiTick(); onTitle() }}>回到标题</button>
        </div>
        <button className="mt-3 w-full border px-3 py-2 text-sm" onClick={() => setReport(makeReport(engine, 'dead', cause))}>生成生存报告</button>
      </div>
    </div>
  )
}
