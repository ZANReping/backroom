// 标题界面全屏按钮：PC 直接全屏；移动端全屏后尝试锁定横屏；iOS 不支持时提示兜底
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { audio } from '@/game/audio'
import { IconFullscreen, IconFullscreenExit } from './icons'

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isCoarse(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window
}

export default function FullscreenButton() {
  const [isFs, setIsFs] = useState(false)
  const [hint, setHint] = useState('')

  useEffect(() => {
    const fn = () => setIsFs(!!document.fullscreenElement)
    fn()
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(''), 3200)
    return () => clearTimeout(t)
  }, [hint])

  const toggle = async () => {
    audio.resume()
    audio.uiTick()
    if (document.fullscreenElement) {
      try { await document.exitFullscreen() } catch { /* 忽略 */ }
      return
    }
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
    const req = el.requestFullscreen ?? el.webkitRequestFullscreen
    if (!req) {
      // iOS Safari（iPhone）不支持网页全屏：提示兜底
      setHint(isIOS() ? 'iOS 不支持网页全屏：请横屏游玩，或用 Safari「添加到主屏幕」' : '当前浏览器不支持全屏')
      return
    }
    try {
      await req.call(el)
      // 移动端：全屏后尝试锁定横屏（需全屏才生效，失败则静默兜底）
      if (isCoarse()) {
        try {
          const ori = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
          await ori.lock?.('landscape')
        } catch { /* 不支持锁定则忽略 */ }
      }
    } catch {
      setHint(isIOS() ? 'iOS 不支持网页全屏：请横屏游玩' : '全屏请求被拒绝，请重试')
    }
  }

  return createPortal(
    <>
      {hint && (
        <div
          className="hud-panel anim-slideUp font-mono2 fixed z-[61] px-3 py-2 text-[11px]"
          style={{
            color: 'var(--amber)',
            left: 'calc(env(safe-area-inset-left) + 12px)',
            top: 'calc(env(safe-area-inset-top) + 60px)',
            maxWidth: 'min(320px, 80vw)',
          }}
        >
          {hint}
        </div>
      )}
      <button
        aria-label={isFs ? '退出全屏' : '进入全屏'}
        title={isFs ? '退出全屏' : '进入全屏'}
        className="hud-panel fixed z-[61] flex items-center justify-center transition-colors duration-150"
        style={{
          width: 40, height: 40,
          left: 'calc(env(safe-area-inset-left) + 12px)',
          top: 'calc(env(safe-area-inset-top) + 12px)',
          color: isFs ? 'var(--amber)' : 'var(--text-dim)',
          opacity: 0.85,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--amber)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = isFs ? 'var(--amber)' : 'var(--text-dim)' }}
        onClick={toggle}
      >
        {isFs ? <IconFullscreenExit width={18} height={18} /> : <IconFullscreen width={18} height={18} />}
      </button>
    </>,
    document.body
  )
}
