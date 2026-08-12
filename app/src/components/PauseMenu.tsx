// 暂停菜单
// v54：「保存游戏」——展开手动槽位选择（3 个手动槽；自动槽不可手选），保存到所选槽并绑定为当前槽
import { useState } from 'react'
import { audio } from '@/game/core/audio'
import { engine } from '@/game/engine'
import { listSaveSlots, SAVE_SLOT_LABELS, type SaveSlotId } from '@/game/engine/save'
import { levelLabel, levelDefOf, WIN_TAPES } from '@/game/levels'

function slotTime(t?: number): string {
  if (!t) return '时间未知'
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

interface Props {
  onResume: () => void
  onSettings: () => void
  onHowTo: () => void
  onQuit: () => void
}

export default function PauseMenu({ onResume, onSettings, onHowTo, onQuit }: Props) {
  const [picking, setPicking] = useState(false)
  const [savedTo, setSavedTo] = useState<SaveSlotId | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState<SaveSlotId | null>(null) // v54：覆盖已有存档前确认
  const slots = listSaveSlots().filter((s) => !s.auto) // 自动槽不可手动选为写入槽

  const doSave = (slot: SaveSlotId) => {
    engine.saveSlot = slot // 绑定为当前槽（此后暂停/退标题落盘写入该槽）
    engine.persist()
    setSavedTo(slot)
    setPicking(false)
    setConfirmOverwrite(null)
    audio.pickup()
  }
  // v54：选已有存档的手动槽 → 先弹覆盖确认（显示该槽现有进度摘要）
  const saveTo = (slot: SaveSlotId) => {
    const snap = slots.find((s) => s.id === slot)?.snap
    if (snap) setConfirmOverwrite(slot)
    else doSave(slot)
  }

  const items: [string, () => void][] = [
    ['继续', onResume],
    ['保存游戏', () => { setPicking(true); setSavedTo(null) }],
    ['设置', onSettings],
    ['操作说明', onHowTo],
    ['保存并退出到标题', onQuit],
  ]
  const confirmSnap = confirmOverwrite ? slots.find((s) => s.id === confirmOverwrite)?.snap : null
  return (
    <div className="fixed inset-0 z-50 flex items-center bg-black/60 backdrop-saturate-[0.6]">
      <div className="hud-panel anim-slideUp ml-0 flex w-[280px] flex-col gap-3 p-6 max-md:mx-auto" style={{ background: 'var(--panel)' }}>
        <h2 className="font-title mb-2 text-[26px]" style={{ color: 'var(--amber)' }}>已暂停</h2>
        {confirmOverwrite && confirmSnap ? (
          <>
            <div className="font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
              {SAVE_SLOT_LABELS[confirmOverwrite]}已有存档：
            </div>
            <div className="font-mono2 border p-2 text-[11px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)' }}>
              {levelLabel(confirmSnap.level)}「{levelDefOf(confirmSnap.level)?.name ?? ''}」<br />
              磁带 {confirmSnap.player.tapes}/{WIN_TAPES} · {slotTime(confirmSnap.savedAt)}
            </div>
            <div className="font-mono2 text-[11px]" style={{ color: 'var(--blood)' }}>覆盖后旧存档不可恢复。确认覆盖？</div>
            <button
              className="menu-btn px-3 py-1.5 text-[13px]"
              style={{ borderColor: 'var(--blood)', color: 'var(--blood)' }}
              onClick={() => doSave(confirmOverwrite)}
            >确认覆盖{SAVE_SLOT_LABELS[confirmOverwrite]}</button>
            <button className="menu-btn" onClick={() => { audio.uiTick(); setConfirmOverwrite(null) }}>取消</button>
          </>
        ) : picking ? (
          <>
            <div className="font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>选择写入的存档槽（自动槽仅自动保存）：</div>
            {slots.map((s) => (
              <button
                key={s.id}
                className="menu-btn font-mono2 px-3 py-1.5 text-left text-[12px]"
                onClick={() => saveTo(s.id)}
              >
                {SAVE_SLOT_LABELS[s.id]}
                <span className="ml-2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                  {s.snap
                    ? `${levelLabel(s.snap.level)}「${levelDefOf(s.snap.level)?.name ?? ''}」 · 磁带 ${s.snap.player.tapes}/${WIN_TAPES}（覆盖）`
                    : '空'}
                </span>
              </button>
            ))}
            <button className="menu-btn" onClick={() => { audio.uiTick(); setPicking(false) }}>返回</button>
          </>
        ) : (
          <>
            {items.map(([label, fn], i) => (
              <button
                key={label}
                className="menu-btn anim-slideUp"
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={() => { audio.uiTick(); fn() }}
              >
                {label}
              </button>
            ))}
            {savedTo && (
              <div className="font-mono2 text-[11px]" style={{ color: 'var(--exit)' }}>
                ✓ 已保存到{SAVE_SLOT_LABELS[savedTo]}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
