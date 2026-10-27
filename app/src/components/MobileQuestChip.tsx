// 移动端主线任务清单：默认收成一行（当前步骤 + 进度），点按展开完整清单，数秒后自动收回；
// 清单有新完成项时自动短暂展开。避免长清单盖住右侧触屏按钮。
import { useCallback, useEffect, useRef, useState } from 'react'

export interface QuestChecklist { title: string; items: { text: string; done: boolean }[] }

export const QUEST_CHIP_OPEN_MS = 5000
export const QUEST_CHIP_FLASH_MS = 3500

export default function MobileQuestChip({ quest, reveal = '' }: { quest: QuestChecklist; reveal?: string }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const doneN = quest.items.filter((it) => it.done).length
  const prevDone = useRef({ title: quest.title, count: doneN })
  const total = quest.items.length
  const current = quest.items.find((it) => !it.done)

  const openFor = useCallback((ms: number) => {
    setOpen(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { timer.current = null; setOpen(false) }, ms)
  }, [])
  useEffect(() => {
    if (quest.title !== prevDone.current.title) {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
      setOpen(false)
    } else if (doneN > prevDone.current.count) openFor(QUEST_CHIP_FLASH_MS)
    prevDone.current = { title: quest.title, count: doneN }
  }, [doneN, quest.title, openFor])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <button
      type="button"
      className={`hud-panel hud-foyer-quest hud-quest-chip pointer-events-auto block w-full px-2.5 py-1.5 text-left font-mono2 text-[11px]${reveal}`}
      style={{ minHeight: 44, touchAction: 'manipulation' }}
      data-foyer-quest
      data-quest-chip={open ? 'open' : 'closed'}
      aria-expanded={open}
      aria-label={`任务：${quest.title}，已完成 ${doneN}/${total}，点按${open ? '收起' : '展开'}清单`}
      onClick={(e) => { e.stopPropagation(); if (open) { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; setOpen(false) } else openFor(QUEST_CHIP_OPEN_MS) }}
      onTouchStart={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') e.stopPropagation() }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') e.stopPropagation() }}
    >
      <div className="flex items-baseline gap-2 text-[10px] tracking-widest" style={{ color: 'var(--amber)' }}>
        <span className="min-w-0 flex-1 truncate">任务 · {quest.title}</span>
        <span className="shrink-0 tracking-normal" style={{ color: 'var(--text-dim)' }}>{doneN}/{total} {open ? '▴' : '▾'}</span>
      </div>
      {open ? (
        <div className="mt-0.5">
          {quest.items.map((it, i) => (
            <div key={i} className="flex items-start gap-1.5" style={{ color: it.done ? 'var(--text-dim)' : 'var(--text)', textDecoration: it.done ? 'line-through' : 'none', opacity: it.done ? 0.6 : 1 }}>
              <span>{it.done ? '■' : '□'}</span><span>{it.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-0.5 flex items-start gap-1.5" style={{ color: current ? 'var(--text)' : 'var(--text-dim)' }}>
          <span>{current ? '□' : '■'}</span><span className="min-w-0 flex-1 truncate">{current ? current.text : '全部完成'}</span>
        </div>
      )}
    </button>
  )
}
