// 手机横屏全屏提示：一键 requestFullscreen（需用户手势）；iOS 兜底提示
import { useEffect, useState } from 'react'
import { storage } from '@/game/core/storage'

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export default function FullscreenHint() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window
      const landscape = window.matchMedia?.('(orientation: landscape)').matches
      const dismissed = storage.get('br_fs_dismissed') === '1'
      const isFs = !!document.fullscreenElement
      setShow(!!(coarse && landscape && !dismissed && !isFs))
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  if (!show) return null
  const ios = isIOS()
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center p-2" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
      <div className="hud-panel pointer-events-auto flex items-center gap-3 px-4 py-2" style={{ background: 'var(--panel)' }}>
        {ios ? (
          <span className="font-mono2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
            iOS：用 Safari「添加到主屏幕」可获得全屏体验
          </span>
        ) : (
          <button
            className="menu-btn !w-auto px-4 py-1.5 text-[13px]"
            onClick={() => {
              document.documentElement.requestFullscreen?.().catch(() => { /* 不支持则忽略 */ })
              setShow(false)
            }}
          >
            进入全屏
          </button>
        )}
        <button
          className="font-mono2 text-[12px]"
          style={{ color: 'var(--text-dim)' }}
          onClick={() => { storage.set('br_fs_dismissed', '1'); setShow(false) }}
        >
          不再提示
        </button>
      </div>
    </div>
  )
}
