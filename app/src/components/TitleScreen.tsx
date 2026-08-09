// 标题画面（移动端横屏：左右分栏布局）
import { useEffect, useState } from 'react'
import { audio } from '@/game/audio'
import FullscreenButton from './FullscreenButton'

interface Props {
  hasSave: boolean
  onStart: () => void
  onContinue: () => void
  onSettings: () => void
  onHowTo: () => void
  onCodex: () => void
  onAvatar: () => void
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

export default function TitleScreen({ hasSave, onStart, onContinue, onSettings, onHowTo, onCodex, onAvatar }: Props) {
  const [title, setTitle] = useState('后 室')
  const [entered, setEntered] = useState(false)
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
          : { animationDelay: `${delay}ms`, width: 260, margin: '0 auto' }
      }
      onClick={() => { audio.resume(); audio.uiTick(); fn() }}
    >
      {label}
    </button>
  )

  const buttons = (
    <>
      {btn('开始游戏', onStart, 100)}
      {hasSave && btn('继续游戏', onContinue, 180)}
      {btn('图鉴档案', onCodex, 260)}
      {btn('形象编辑', onAvatar, 300)}
      {btn('设置', onSettings, 340)}
      {btn('操作说明', onHowTo, 420)}
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
            style={{ width: 'min(240px, 42%)', maxHeight: '100%', opacity: entered ? 1 : 0, transition: 'opacity 0.5s' }}
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
            <div className="flex flex-col gap-3" style={{ opacity: entered ? 1 : 0, transition: 'opacity 0.5s' }}>
              {buttons}
            </div>
            <div className="title-hero font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
              v1.0 · 所有层级均为程序生成 · 戴上耳机体验更佳
            </div>
          </div>
        </div>
      )}

      {/* 角落全屏按钮 */}
      <FullscreenButton />
    </div>
  )
}
