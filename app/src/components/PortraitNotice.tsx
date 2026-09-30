import { useEffect, useId, useRef } from 'react'
import { RotateCw } from 'lucide-react'

export default function PortraitNotice({ onIgnore }: { onIgnore: () => void }) {
  const titleId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const button = buttonRef.current
    button?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Tab') {
        event.preventDefault()
        button?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      previousFocus?.focus()
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black px-4 py-4"
      style={{
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <section className="hud-panel my-auto w-full max-w-md overflow-y-auto px-6 py-7 text-center" style={{ background: 'var(--panel)', maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px)' }}>
        <div className="mb-5 flex justify-center" aria-hidden="true">
          <RotateCw size={38} strokeWidth={1.5} style={{ color: 'var(--amber)' }} />
        </div>
        <h2 id={titleId} className="font-title text-xl sm:text-2xl" style={{ color: 'var(--amber)' }}>
          建议打开旋转，横屏游玩
        </h2>
        <p className="font-mono2 mt-4 text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
          打开手机自动旋转，然后将手机横过来。横屏后此页面会自动关闭。
        </p>
        <button
          ref={buttonRef}
          type="button"
          className="menu-btn mt-7 !w-full px-4 py-3 font-mono2 text-sm"
          style={{ color: 'var(--amber)' }}
          onClick={onIgnore}
        >
          无视，竖屏游玩
        </button>
        <p className="font-mono2 mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          仅跳过本次竖屏提示，再次转回竖屏时会重新提醒。
        </p>
      </section>
    </div>
  )
}
