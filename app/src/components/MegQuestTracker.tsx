import { useEffect, useState } from 'react'
import type { Engine } from '@/game/engine'
import { trackedMegSummary } from '@/game/engine/megMissions'
import { trackedFactionSummary } from '@/game/engine/factionMissions'
import { FACTION_TERMINALS } from '@/game/content/factionTerminals'

export default function MegQuestTracker({ engine, mobileLandscape = false }: { engine: Engine; mobileLandscape?: boolean }) {
  const [, refresh] = useState(0)
  useEffect(() => {
    const off = engine.on(() => refresh(n => n + 1))
    const timer = setInterval(() => refresh(n => n + 1), 400)
    return () => { off(); clearInterval(timer) }
  }, [engine])

  const factionTask = trackedFactionSummary(engine)
  const task = factionTask ?? trackedMegSummary(engine)
  if (!task) return null
  const brand = factionTask ? FACTION_TERMINALS[factionTask.faction].short : 'MEG'
  const accent = factionTask ? FACTION_TERMINALS[factionTask.faction].color : '#a5a45a'
  const percent = Math.max(0, Math.min(100, task.percent))
  const shortLandscape = mobileLandscape && window.innerHeight < 376
  return (
    <aside
      aria-label={`${brand}任务追踪`}
      className="hud-panel pointer-events-none w-[min(260px,46vw)] p-2 text-left"
      style={{ borderColor: accent, color: '#edf0e9', fontFamily: 'var(--font-mono, monospace)', ...(mobileLandscape ? { position: 'fixed', top: 48, right: shortLandscape ? 256 : 208, width: shortLandscape ? 'clamp(110px, calc(100vw - 430px), 200px)' : 'min(220px, 35vw)' } : {}) }}
    >
      <div className="truncate text-[10px] font-bold tracking-wide" style={{ color: accent }}>{brand} · {task.chapter}</div>
      <div className="mt-0.5 truncate text-[11px] font-semibold" title={task.title}>{task.title}</div>
      <div className="mt-0.5 line-clamp-2 break-words text-[11px] leading-tight" title={task.objective} style={{ color: '#c8c7a3' }}>{task.objective}</div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-sm bg-black/50">
          <div className="h-full transition-[width]" style={{ width: `${percent}%`, background: accent }} />
        </div>
        <span className="shrink-0 text-[10px]" style={{ color: '#c8c77c' }}>{task.label}</span>
      </div>
    </aside>
  )
}
