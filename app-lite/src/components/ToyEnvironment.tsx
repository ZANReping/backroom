import { useEffect, useSyncExternalStore } from 'react'
import { initToy, subscribeToy, toySnapshot, toyNotice } from '@/game/platform/toy'

export default function ToyEnvironment() {
  const { notice } = useSyncExternalStore(subscribeToy, toySnapshot)
  useEffect(initToy, [])
  return notice ? <div role="status" className="hud-panel fixed z-[90] max-w-sm p-3 text-sm" style={{ top: 'calc(var(--toy-safe-top, env(safe-area-inset-top)) + 12px)', left: '50%', transform: 'translateX(-50%)' }}>
    {notice}<button className="ml-3 underline" onClick={() => toyNotice('')}>关闭</button>
  </div> : null
}
