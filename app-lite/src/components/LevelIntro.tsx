// 层级进入卡片：文本一次渲染，逐字符显隐交给 CSS，避免逐字更新 React 状态。
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { seedString } from '@/game/core/rng'
import { levelTitleTheme } from './levelTitleTheme'
import LevelTitleOrnament from './LevelTitleOrnament'
import './LevelIntro.css'
import './LevelTitleTheme.css'

interface Props { level: number; levelId?: number; name: string; flavor: string; seed: number; ready: boolean; onPhaseChange?: (phase: 'presenting' | 'holding' | 'exiting') => void; onDone: () => void }
const PRESENT_MIN = 2400, HOLD_AFTER_LAST = 300, EXIT_MS = 240

function AnimatedText({ text, className, delay = 0, step = 40, style }: { text: string; className: string; delay?: number; step?: number; style?: CSSProperties }) {
  return <div className={className} style={style}>{[...text].map((char, i) => <span key={`${char}-${i}`} className="level-intro__char" style={{ animationDelay: `${delay + i * step}ms` }}>{char === ' ' ? '\u00a0' : char}</span>)}</div>
}

export default function LevelIntro({ level, levelId, name, flavor, seed, ready, onPhaseChange, onDone }: Props) {
  const [phase, setPhase] = useState<'presenting' | 'holding' | 'exiting'>('presenting')
  const doneRef = useRef(onDone), phaseRef = useRef(onPhaseChange)
  const readyRef = useRef(ready), completedRef = useRef(false)
  doneRef.current = onDone; phaseRef.current = onPhaseChange
  readyRef.current = ready
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const line1 = `LEVEL ${level}`, line2 = `「${name}」`
  const line2Start = line1.length * 40 + 150, flavorStart = line2Start + line2.length * 40 + 150
  const lastReveal = flavorStart + Math.max(0, flavor.length - 1) * 30
  const theme = levelTitleTheme(levelId ?? level)
  const themed = theme !== 'default'

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReducedMotion(media.matches)
    if (media.addEventListener) media.addEventListener('change', change)
    else media.addListener(change)
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', change)
      else media.removeListener(change)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'presenting') return
    phaseRef.current?.('presenting')
    const timer = window.setTimeout(() => { setPhase('holding'); phaseRef.current?.('holding') }, reducedMotion ? 600 : Math.max(PRESENT_MIN, lastReveal + HOLD_AFTER_LAST))
    return () => window.clearTimeout(timer)
  }, [lastReveal, reducedMotion, phase])

  useEffect(() => {
    if (!ready) {
      if (phase === 'exiting') { completedRef.current = false; setPhase('holding'); phaseRef.current?.('holding') }
      return
    }
    if (phase === 'holding') { setPhase('exiting'); phaseRef.current?.('exiting'); return }
    if (phase !== 'exiting') return
    // Schedule after the phase commit, so the holding -> exiting render cannot
    // clean up its own completion timer. Read the latest gate when it fires.
    const timer = window.setTimeout(() => {
      if (readyRef.current && !completedRef.current) { completedRef.current = true; doneRef.current() }
    }, EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [ready, phase])

  return <div className={`level-intro${themed ? ' level-title-themed' : ''}`} data-level-intro data-title-theme={theme} data-phase={phase} data-ready={ready ? 'true' : 'false'} style={themed ? { '--title-delay': `${line2Start}ms` } as CSSProperties : undefined}>
    <div className="level-intro__scan" aria-hidden="true" />
    <LevelTitleOrnament theme={theme} />
    <AnimatedText text={line1} className="level-intro__level level-title__eyebrow font-mono2 text-[20px]" style={{ color: 'var(--title-accent, var(--exit))', letterSpacing: '0.3em' }} />
    <AnimatedText text={line2} className="level-intro__name level-title__name font-title mt-3 text-[40px]" delay={line2Start} style={{ color: 'var(--title-ink, var(--text))' }} />
    <AnimatedText text={flavor} className="level-intro__flavor mt-3 text-[13px]" delay={flavorStart} step={30} style={{ color: 'var(--title-muted, var(--text-dim))' }} />
    <div className="font-mono2 mt-6 text-[10px]" style={{ color: 'var(--title-muted, var(--text-dim))' }}>SEED: {seedString(seed)}</div>
    <div className="level-intro__status text-[11px]" aria-live="polite">{ready ? '附近场景已就绪' : '正在准备附近场景…'}</div>
    {!ready && <div className="level-intro__signal" aria-hidden="true" />}
  </div>
}
