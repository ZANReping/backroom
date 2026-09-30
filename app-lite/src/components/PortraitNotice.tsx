import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { RotateCw } from 'lucide-react'
import { enterToyGame, subscribeToy, toySnapshot } from '@/game/platform/toy'

export default function PortraitNotice({ onIgnore }: { onIgnore: () => void }) {
  const titleId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const toy = useSyncExternalStore(subscribeToy, toySnapshot)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const button = buttonRef.current
    button?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Tab') {
        event.preventDefault()
        const buttons = Array.from(sectionRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
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
        paddingTop: 'max(16px, var(--toy-safe-top, env(safe-area-inset-top)))',
        paddingBottom: 'max(16px, var(--toy-safe-bottom, env(safe-area-inset-bottom)))',
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <section ref={sectionRef} className="hud-panel my-auto w-full max-w-md overflow-y-auto px-6 py-7 text-center" style={{ background: 'var(--panel)', maxHeight: 'calc(var(--toy-height, 100dvh) - var(--toy-safe-top, env(safe-area-inset-top)) - var(--toy-safe-bottom, env(safe-area-inset-bottom)) - 32px)' }}>
        <div className="mb-5 flex justify-center" aria-hidden="true">
          <RotateCw size={38} strokeWidth={1.5} style={{ color: 'var(--amber)' }} />
        </div>
        <h2 id={titleId} className="font-title text-xl sm:text-2xl" style={{ color: 'var(--amber)' }}>
          建议打开旋转，横屏游玩
        </h2>
        <p className="font-mono2 mt-4 text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
          打开手机自动旋转，然后将手机横过来。横屏后此页面会自动关闭。
        </p>
        {toy.supported.setContainerMode && toy.supported.onContainerChange && <button type="button" className="menu-btn mt-5 !w-full px-4 py-3 text-sm" onClick={enterToyGame}>横屏沉浸游玩</button>}
        {toy.notice && <p role="status" className="mt-2 text-sm">{toy.notice}</p>}
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
