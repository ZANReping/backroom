// 标题画面（移动端横屏：左右分栏布局）
// v54：存档槽位——首屏为「开始游戏」（新开，绑定槽 1）/「继续游戏」双主按钮；
// 点「继续游戏」进入槽位页（3 手动槽 + 只读自动槽，显示层级/磁带/时间，选择后读取）
import { useEffect, useState } from 'react'
import { audio } from '@/game/core/audio'
import { levelLabel, levelDefOf, WIN_TAPES } from '@/game/levels'
import { SAVE_SLOT_LABELS, type SaveSlotId, type SlotInfo } from '@/game/engine'
import FullscreenButton from './FullscreenButton'

interface Props {
  slots: SlotInfo[]
  onNewGame: (slot: SaveSlotId) => void
  onContinueSlot: (slot: SaveSlotId) => void
  onDeleteSlot: (slot: SaveSlotId) => void // v54：删除手动槽存档（先弹确认窗）
  onSettings: () => void
  onHowTo: () => void
  onCodex: () => void
  onAvatar: () => void
  devMode?: boolean // v54：开发者模式（HUD DevPanel 同一开关）——显示「设计模式」入口
  onDesign?: () => void
}

const GLYPHS = '▓▒░█◼◻／＼'

// 移动端横屏检测（触屏设备 + 宽大于高）
function useMobileLandscape(): boolean {
  const check = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window) &&
    window.innerWidth > window.innerHeight
  const [v, setV] = useState(check)
  useEffect(() => {
    const fn = () => setV(check())
    window.addEventListener('resize', fn)
    window.addEventListener('orientationchange', fn)
    return () => {
      window.removeEventListener('resize', fn)
      window.removeEventListener('orientationchange', fn)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return v
}

function slotTime(t?: number): string {
  if (!t) return '时间未知'
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function TitleScreen({ slots, onNewGame, onContinueSlot, onDeleteSlot, onSettings, onHowTo, onCodex, onAvatar, devMode, onDesign }: Props) {
  const [title, setTitle] = useState('后 室')
  const [entered, setEntered] = useState(false)
  const [view, setView] = useState<'main' | 'slots'>('main') // v54：main=主按钮 / slots=存档槽位页（「继续游戏」进入）
  const [pendingDelete, setPendingDelete] = useState<SaveSlotId | null>(null) // v54：待确认删除的手动槽
  const landscape = useMobileLandscape()

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 100)
    return () => clearTimeout(t)
  }, [])

  // 随机字形故障
  useEffect(() => {
    let alive = true
    const glitch = () => {
      if (!alive) return
      const chars = '后 室'.split('')
      const n = 1 + Math.floor(Math.random() * 2)
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * chars.length)
        if (chars[idx] !== ' ') chars[idx] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      }
      setTitle(chars.join(''))
      setTimeout(() => alive && setTitle('后 室'), 120)
      setTimeout(glitch, 2000 + Math.random() * 3000)
    }
    const to = setTimeout(glitch, 2500)
    return () => { alive = false; clearTimeout(to) }
  }, [])

  const btn = (label: string, fn: () => void, delay: number, key?: string) => (
    <button
      key={key ?? label}
      className="menu-btn font-mono2 anim-slideUp"
      style={
        landscape
          ? { animationDelay: `${delay}ms`, width: '100%', padding: '6px 12px', fontSize: 13 }
          : { animationDelay: `${delay}ms`, width: 320, margin: '0 auto' }
      }
      onClick={() => { audio.resume(); audio.uiTick(); fn() }}
    >
      {label}
    </button>
  )

  // v54：存档槽位页（「继续游戏」进入）——每槽显示层级/磁带进度/保存时间；空槽标注「空」；
  // 自动槽只读（仅继续，不可选为新游戏写入槽）。新开游戏走首屏「开始游戏」（绑定槽 1）。
  // v54 修复溢出：行内「继续」按钮不用 .menu-btn（该类 block w-full，flex 行内会撑出面板）；
  // 面板限高可滚动，行 overflow-hidden 兜底，窄屏/移动端均不溢出
  const slotPanel = (
    <div
      className="hud-panel font-mono2 flex max-h-[62dvh] w-full flex-col gap-1 overflow-y-auto overflow-x-hidden p-2"
      style={{ background: 'color-mix(in srgb, var(--panel) 88%, transparent)' }}
    >
      <div className="text-[10px]" style={{ color: 'var(--text-dim)', letterSpacing: '0.2em' }}>选 择 存 档 槽 位</div>
      {/* v54：自动保存槽排最上方（只读，标注「自动保存」），手动槽 1/2/3 随后 */}
      {[...slots].sort((a, b) => Number(b.auto) - Number(a.auto)).map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-2 overflow-hidden border px-2 py-1.5"
          style={{ borderColor: 'var(--panel-edge)', fontSize: landscape ? 10 : 11 }}
        >
          <span className="shrink-0" style={{ color: s.auto ? 'var(--thirst, #4aa8d8)' : 'var(--amber)', minWidth: landscape ? 52 : 62 }}>
            {s.label}
          </span>
          {s.snap ? (
            <>
              <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text)' }}>
                {levelLabel(s.snap.level)}「{levelDefOf(s.snap.level)?.name ?? ''}」 · 磁带 {s.snap.player.tapes}/{WIN_TAPES}
              </span>
              <span className="shrink-0 text-[9px]" style={{ color: 'var(--text-dim)' }}>{slotTime(s.snap.savedAt)}</span>
              <button
                className="shrink-0 border px-2 py-0.5 text-[10px]"
                style={{ borderColor: 'var(--panel-edge)', color: 'var(--amber)', background: 'color-mix(in srgb, var(--panel) 80%, transparent)' }}
                onClick={() => { audio.resume(); audio.uiTick(); onContinueSlot(s.id) }}
              >
                继续
              </button>
              {/* v54：删除手动槽（先弹确认窗）；自动槽不可删除 */}
              {!s.auto && (
                <button
                  className="shrink-0 border px-1.5 py-0.5 text-[10px]"
                  style={{ borderColor: 'var(--blood)', color: 'var(--blood)', background: 'color-mix(in srgb, var(--panel) 80%, transparent)' }}
                  title={`删除${s.label}的存档`}
                  onClick={() => { audio.uiTick(); setPendingDelete(s.id) }}
                >
                  删
                </button>
              )}
            </>
          ) : (
            <span className="flex-1" style={{ color: 'var(--text-dim)' }}>—— 空 ——</span>
          )}
        </div>
      ))}
    </div>
  )

  const buttons = view === 'slots' ? (
    <>
      {slotPanel}
      {btn('返回', () => setView('main'), 100)}
    </>
  ) : (
    <>
      {btn('开始游戏', () => onNewGame('slot1'), 100)}
      {btn('继续游戏', () => setView('slots'), 180)}
      {btn('图鉴档案', onCodex, 260)}
      {btn('形象编辑', onAvatar, 300)}
      {btn('设置', onSettings, 340)}
      {btn('操作说明', onHowTo, 420)}
      {devMode && onDesign && btn('设计模式', onDesign, 500)}
    </>
  )

  return (
    <div className="fixed inset-0 z-40" style={{ padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}>
      {/* 背景漂移坐标 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.12] font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
        {['SECTOR 0.7.13', 'NOCLIP DETECTED', 'HUM: 50Hz', 'CAM_04 OFFLINE', 'DEPTH: ??', 'SIGNAL LOST'].map((s, i) => (
          <div key={s} className="absolute" style={{ left: `${(i * 37) % 90}%`, top: `${(i * 53) % 90}%` }}>{s}</div>
        ))}
      </div>

      {landscape ? (
        /* 移动端横屏：左标题/装饰，右按钮列 */
        <div className="flex h-full w-full flex-row items-center justify-between gap-4 px-8">
          <div className="flex min-w-0 flex-col items-start gap-2" style={{ maxWidth: '48%' }}>
            <h1
              className="title-hero font-title anim-flickerIn"
              style={{ fontSize: 'clamp(32px, 14vh, 58px)', lineHeight: 1.1, color: 'var(--text)', textShadow: '2px 0 rgba(179,53,43,0.4), -2px 0 rgba(122,111,208,0.4)' }}
            >
              {title}
            </h1>
            <div className="title-hero font-mono2 text-[11px]" style={{ color: 'var(--text-dim)', letterSpacing: '0.4em' }}>
              BACKROOMS : DESCENT
            </div>
            <div className="title-hero font-mono2 mt-1 text-[10px]" style={{ color: 'var(--text-dim)', opacity: 0.8 }}>
              v1.0 · 所有层级均为程序生成 · 戴上耳机体验更佳
            </div>
          </div>
          <div
            className="flex shrink-0 flex-col gap-2 overflow-y-auto"
            style={{ width: view === 'slots' ? 'min(460px, 62%)' : 'min(320px, 46%)', maxHeight: '100%', opacity: entered ? 1 : 0, transition: 'opacity 0.5s' }}
          >
            {buttons}
          </div>
        </div>
      ) : (
        /* 竖屏 / 桌面：居中纵向布局 */
        <div className="flex h-full w-full flex-col items-center justify-center">
          <div className="flex w-full max-w-[560px] flex-col items-center gap-6 px-6">
            <div className="text-center">
              <h1
                className="title-hero font-title anim-flickerIn"
                style={{ fontSize: 'clamp(44px, 10vw, 72px)', color: 'var(--text)', textShadow: '2px 0 rgba(179,53,43,0.4), -2px 0 rgba(122,111,208,0.4)' }}
              >
                {title}
              </h1>
              <div className="title-hero font-mono2 mt-2 text-[13px]" style={{ color: 'var(--text-dim)', letterSpacing: '0.4em' }}>
                BACKROOMS : DESCENT
              </div>
            </div>
            <div className={`flex w-full flex-col items-stretch gap-3 ${view === 'slots' ? 'max-w-[560px]' : 'max-w-[340px]'}`} style={{ opacity: entered ? 1 : 0, transition: 'opacity 0.5s' }}>
              {buttons}
            </div>
            <div className="title-hero font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
              v1.0 · 所有层级均为程序生成 · 戴上耳机体验更佳
            </div>
          </div>
        </div>
      )}

      {/* v54：删除存档确认窗（手动槽；不可恢复） */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => setPendingDelete(null)}>
          <div className="hud-panel anim-slideUp flex w-full max-w-[360px] flex-col gap-3 p-5" style={{ background: 'var(--panel)' }} onClick={(e) => e.stopPropagation()}>
            <div className="font-title text-[18px]" style={{ color: 'var(--blood)' }}>删除存档</div>
            <div className="font-mono2 text-[12px]" style={{ color: 'var(--text)' }}>
              确定删除{SAVE_SLOT_LABELS[pendingDelete]}的存档？此操作不可恢复。
            </div>
            <div className="flex gap-2">
              <button
                className="menu-btn flex-1 px-3 py-1.5 text-[13px]"
                style={{ borderColor: 'var(--blood)', color: 'var(--blood)' }}
                onClick={() => { audio.uiTick(); onDeleteSlot(pendingDelete); setPendingDelete(null) }}
              >确认删除</button>
              <button className="menu-btn flex-1 px-3 py-1.5 text-[13px]" onClick={() => { audio.uiTick(); setPendingDelete(null) }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 角落全屏按钮 */}
      <FullscreenButton />
    </div>
  )
}
