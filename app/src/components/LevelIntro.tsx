// 层级进入卡片（打字机 + 扫描线 + 故障）
import { useEffect, useState } from 'react'
import { seedString } from '@/game/core/rng'

interface Props {
  level: number
  name: string
  flavor: string
  seed: number
  onDone: () => void
}

export default function LevelIntro({ level, name, flavor, seed, onDone }: Props) {
  const line1 = `LEVEL ${level}`
  const line2 = `「${name}」`
  const [n1, setN1] = useState(0)
  const [n2, setN2] = useState(0)
  const [n3, setN3] = useState(0)
  const [glitch, setGlitch] = useState(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i <= line1.length; i++) timers.push(setTimeout(() => setN1(i), i * 40))
    const t2 = line1.length * 40 + 150
    for (let i = 0; i <= line2.length; i++) timers.push(setTimeout(() => setN2(i), t2 + i * 40))
    const t3 = t2 + line2.length * 40 + 150
    for (let i = 0; i <= flavor.length; i++) timers.push(setTimeout(() => setN3(i), t3 + i * 30))
    timers.push(setTimeout(() => setGlitch(true), 1600))
    timers.push(setTimeout(() => setGlitch(false), 1720))
    timers.push(setTimeout(onDone, 2400))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black ${glitch ? 'anim-glitch' : ''}`}
      onClick={onDone}
      style={{ cursor: 'pointer' }}
    >
      {/* 扫描线扫过 */}
      <div className="pointer-events-none absolute inset-x-0 h-[2px] bg-white/20" style={{ animation: 'scanSweep 0.4s linear 0.2s both', top: 0 }} />
      <style>{`@keyframes scanSweep { from { top: 0 } to { top: 100% } }`}</style>
      <div className="font-mono2 text-[20px]" style={{ color: 'var(--exit)', letterSpacing: '0.3em' }}>{line1.slice(0, n1)}</div>
      <div className="font-title mt-3 text-[40px]" style={{ color: 'var(--text)' }}>{line2.slice(0, n2)}</div>
      <div className="mt-3 text-[13px]" style={{ color: 'var(--text-dim)' }}>{flavor.slice(0, n3)}</div>
      <div className="font-mono2 mt-6 text-[10px]" style={{ color: 'var(--text-dim)' }}>SEED: {seedString(seed)}</div>
    </div>
  )
}
