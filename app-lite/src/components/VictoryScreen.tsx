// 胜利结算（亮色对比）
import { useEffect, useState } from 'react'
import type { Engine } from '@/game/engine'
import { seedString } from '@/game/core/rng'
import { audio } from '@/game/core/audio'
import { levelLabel } from '@/game/levels'
import ToySurvivalReport from './ToySurvivalReport'
import { makeReport, type SurvivalReport } from '@/game/platform/toyReport'

export default function VictoryScreen({ engine, onNG, onTitle }: { engine: Engine; onNG: () => void; onTitle: () => void }) {
  const p = engine.player
  const [report, setReport] = useState<SurvivalReport | null>(null)
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 2000)
    const t2 = setTimeout(() => setStage(2), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])
  const mins = p.aliveTime / 60
  const rank = mins < 20 ? 'S' : mins < 35 ? 'A' : 'B'
  const rows: [string, string][] = [
    ['到达层级', `${levelLabel(p.level)} · ${engine.levelDef.name}`],
    ['逃出用时', `${Math.floor(mins)}分${Math.floor(p.aliveTime % 60)}秒`],
    ['击杀', `${p.kills}`],
    ['评价', rank],
    ['种子', seedString(engine.seed)],
  ]
  // 2026-10 UI：雨后纸面——评价做成印章，数据两列；保持亮色反差（刻意不随主题变色）
  return (
    <div className="end-victory fixed inset-0 z-50 flex items-center justify-center p-4">
      {report && <ToySurvivalReport report={report} onClose={() => setReport(null)} />}
      <div className="end-rain" aria-hidden />
      <div className="relative max-h-[90dvh] w-full max-w-[460px] overflow-y-auto text-center" style={{ opacity: stage >= 1 ? 1 : 0, transition: 'opacity 1.5s' }}>
        <div className="font-mono2 text-[10px] tracking-[0.3em]" style={{ color: '#8a8270' }}>EXIT LOGGED · 已离开后室</div>
        <div className="mt-3 text-[15px] italic" style={{ color: '#5a544a' }}>你听到了……雨声。</div>
        <h1 className="font-title mt-2 text-[48px]" style={{ color: '#1a1815', opacity: stage >= 2 ? 1 : 0, transition: 'opacity 1.2s' }}>
          你 逃 出 来 了
        </h1>
        <div className="end-paper relative mx-auto mt-6 max-w-[360px] text-left" style={{ opacity: stage >= 2 ? 1 : 0, transition: 'opacity 1.2s 0.4s' }}>
          <div className={`end-stamp end-stamp--${rank}`} aria-label={`评价 ${rank}`}><span>评价</span>{rank}</div>
          <div className="end-stats end-stats--light font-mono2">
            {rows.filter(([k]) => k !== '评价').map(([k, v]) => (
              <div key={k} className={`end-stat ${k === '到达层级' || k === '种子' ? 'is-wide' : ''}`}>
                <span className="end-stat-k">{k}</span><span className="end-stat-v">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 flex justify-center gap-3">
          <button className="menu-btn end-btn-light is-primary" onClick={() => { audio.uiTick(); onNG() }}>新的挑战 (NG+)</button>
          <button className="menu-btn end-btn-light" onClick={() => { audio.uiTick(); onTitle() }}>回到标题</button>
        </div>
        <button className="mt-3 border px-3 py-2 text-sm" style={{ color: '#5a544a' }} onClick={() => setReport(makeReport(engine, 'escaped'))}>生成生存报告</button>
      </div>
    </div>
  )
}
