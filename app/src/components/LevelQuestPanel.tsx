// HUD 层级任务面板（LevelQuestDirector.views）：显示当前层级已出现的任务与目标进度。
// - 计数目标显示「n/目标」，可选目标标「可选」，未解锁目标不显示；完成的目标划线并短暂高亮。
// - 任务完成后面板保留数秒再收起；桌面常显完整列表，移动端默认折叠为一行，点按展开；移动端由 HUD 放在左上状态条下方（不压住右侧触屏动作键），展开时限高可滚动。
import { useEffect, useState } from 'react'
import type { Engine } from '@/game/engine'

export default function LevelQuestPanel({ engine, isMobile }: { engine: Engine; isMobile: boolean }) {
  const [, tick] = useState(0)
  const [open, setOpen] = useState(!isMobile)
  useEffect(() => {
    const off = engine.on(() => tick((n) => n + 1))
    const t = setInterval(() => tick((n) => n + 1), 400)
    return () => { off(); clearInterval(t) }
  }, [engine])
  // Level 0.2（id 902）是 Level 0 的子层级：面板沿用 Level 0 的任务
  const views = engine.levelQuests.views(engine, isMobile, engine.player.level === 902 ? 0 : engine.player.level)
  if (!views.length) return null
  const expanded = !isMobile || open
  return (
    <div
      className={`hud-panel hud-level-quest font-mono2${isMobile ? ' is-mobile pointer-events-auto' : ''}`}
      data-level-quest={views.map((v) => v.id).join(' ')}
      style={isMobile ? { maxWidth: 210, maxHeight: 'calc(100dvh - 240px)', overflowY: 'auto' } : { maxWidth: 250 }}
      role={isMobile ? 'button' : 'status'}
      tabIndex={isMobile ? 0 : undefined}
      aria-expanded={isMobile ? expanded : undefined}
      onClick={isMobile ? () => setOpen((o) => !o) : undefined}
      onKeyDown={isMobile ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }
      } : undefined}
    >
      {views.map((q) => {
        const req = q.objectives.filter((o) => !o.optional)
        const doneReq = req.filter((o) => o.done).length
        const next = q.objectives.find((o) => !o.done && !o.optional) ?? q.objectives.find((o) => !o.done)
        return (
          <div key={q.id} className={`hud-level-quest__quest${q.done ? ' is-done' : ''}${q.pulse ? ' is-pulse' : ''}`} data-quest={q.id} data-quest-done={q.done ? '1' : '0'}>
            <div className="hud-level-quest__title">
              <span>任务 · {q.title}</span>
              <span className="hud-level-quest__state">{q.done ? '完成' : `${doneReq}/${req.length}`}</span>
            </div>
            {(expanded ? q.objectives : next ? [next] : []).map((o) => (
              <div key={o.id} className={`hud-level-quest__obj${o.done ? ' is-done' : ''}${o.pulse ? ' is-pulse' : ''}`} data-obj={o.id} data-obj-done={o.done ? '1' : '0'}>
                <span className="hud-level-quest__box" aria-hidden>{o.done ? '■' : o.optional ? '◇' : '□'}</span>
                <span className="hud-level-quest__text">
                  {o.text}
                  {o.count && <b className="hud-level-quest__count"> ({o.count})</b>}
                  {o.optional && <i className="hud-level-quest__opt">可选</i>}
                </span>
              </div>
            ))}
          </div>
        )
      })}
      {isMobile && <div className="hud-level-quest__fold" aria-hidden>{expanded ? '▴ 收起' : '▾ 展开'}</div>}
    </div>
  )
}
