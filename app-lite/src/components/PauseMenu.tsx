// 暂停菜单
// v54：「保存游戏」——展开手动槽位选择（3 个手动槽；自动槽不可手选），保存到所选槽并绑定为当前槽
import { Fragment, useState } from 'react'
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
  onRadio: () => void // v56：电台管理（仅 MIDI 曲风下显示入口）
  showRadio: boolean
  onUnstuck: () => void
  onQuit: () => void
}

export default function PauseMenu({ onResume, onSettings, onHowTo, onRadio, showRadio, onUnstuck, onQuit }: Props) {
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
    ['脱离卡死', onUnstuck],
    ['保存游戏', () => { setPicking(true); setSavedTo(null) }],
    ['设置', onSettings],
    ['操作说明', onHowTo],
    ['保存并退出到标题', onQuit],
  ]
  // v56：电台管理入口（MIDI 曲风下显示，插在设置之后）
  const radioItem: [string, () => void] = ['电台管理', onRadio]
  const confirmSnap = confirmOverwrite ? slots.find((s) => s.id === confirmOverwrite)?.snap : null
  return (
    <div className="pause-backdrop fixed inset-0 z-50 flex items-stretch bg-black/60 backdrop-saturate-[0.6]">
      {/* 2026-10 UI：贴左全高侧栏——顶部显示当前进度，主操作强调，退出与其余项分隔 */}
      <div className="pause-panel hud-panel anim-slideUp flex flex-col gap-2 overflow-y-auto" style={{ background: 'var(--panel)' }}>
        <div className="pause-head">
          <div className="pause-kicker font-mono2">❚❚ PAUSED · 录像已冻结</div>
          <h2 className="font-title text-[30px]" style={{ color: 'var(--amber)' }}>已暂停</h2>
          <div className="pause-status font-mono2">
            <span>{levelLabel(engine.player.level)}「{levelDefOf(engine.player.level)?.name ?? ''}」</span>
            <span>磁带 {engine.player.tapes}/{WIN_TAPES} · 当前{SAVE_SLOT_LABELS[engine.saveSlot] ?? '槽位'}</span>
          </div>
        </div>
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
              <Fragment key={label}>
                {label === '保存并退出到标题' && <div className="title-menu-sep" aria-hidden />}
                <button
                  className={`menu-btn title-menu-btn pause-btn anim-slideUp ${label === '继续' ? 'menu-btn--primary' : ''} ${label === '保存并退出到标题' ? 'is-exit' : ''}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  onClick={() => { audio.uiTick(); fn() }}
                >
                  <span className="menu-index" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                  <span className="menu-label">{label}</span>
                  {label === '脱离卡死' && <span className="menu-hint">返回游戏检测 3 秒；仅确认无法移动后传送</span>}
                  {label === '继续' && <span className="menu-hint">Esc 也可返回</span>}
                </button>
                {/* v56：电台管理入口（MIDI 曲风下显示） */}
                {label === '设置' && showRadio && (
                  <button
                    className="menu-btn title-menu-btn pause-btn anim-slideUp"
                    style={{ animationDelay: `${i * 40}ms` }}
                    onClick={() => { audio.uiTick(); onRadio() }}
                  >
                    <span className="menu-index" aria-hidden>♪</span>
                    <span className="menu-label">{radioItem[0]}</span>
                  </button>
                )}
              </Fragment>
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
