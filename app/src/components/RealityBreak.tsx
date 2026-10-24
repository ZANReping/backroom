// 前厅 M4（P3）：RealityBreak —— 回程终点「现实破碎」过场（3D 版）。
// 起手：回程终点在玩家眼睛处抓取的六面图（renderer.captureCubeAtlas），过场用 Three.js 实时渲染（独立 WebGL 上下文）：
//   crack   周围真实世界（地面、楼栋、路灯、树……）沿碎片边缘从脚下开裂，裂缝透出昏黄的光
//   shatter 碎片由近到远剥落、翻滚，露出黑暗虚空；脚下塌空，开始下坠
//   void    虚空中下坠：环境碎片在四周缓慢翻滚、相对上升，尘埃冷光
//   self    低头：看见自己的身体在下坠（衣服抖动），手机、手电从手边飘走
//   maze    脚下远处的黄色迷宫（Level 0 俯视）急速放大，穿过天花板层被荧光黄白淹没
//   impact  撞击闪白 → card 黑场 + 荧光灯嗡鸣（App 在此阶段换图/预热）→ in 在 Level 0 醒来（眼皮开合）
// 没有六面抓取或 WebGL 初始化失败时退回 2D 版（RealityBreak2D：截图碎片演出）。
// 跳过：空格 / 回车（桌面）、「跳过 ▸」按钮（触屏）→ 直接进入黑场。移动端/粗指针：碎片与尘埃减半、关闭抗锯齿；
// prefers-reduced-motion：关闭震动与闪白，镜头转动减小。
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JSX } from 'react'
import { createBreakAudio } from '@/game/core/realityBreakAudio'
import { takeBreakShot } from '@/game/engine/foyerLanding'
import { takeBreakCube, type BreakCubeCapture } from '@/game/core/breakCube'
import RealityBreak2D from './RealityBreak2D'
import { stageAt, TL, type BreakScene } from './realityBreak3d/breakScene'
import { takePreparedBreak } from './realityBreak3d/breakPreparation'

type Props = {
  toName?: string
  levelId?: number
  ready?: boolean
  onStageChange?: (stage: 'out' | 'loading' | 'in') => void
  onDone?: () => void
}

const CARD_MIN = 2.2
const IN_DUR = 2.6
const MONO = "'JetBrains Mono', ui-monospace, monospace"
const BR_YELLOW = '#c9b458'
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k) }

/** 性能统计（自动化测试读取）：碎片数、迷宫实例数、break 阶段每帧渲染耗时。 */
export interface RbStats { mode: '3d' | '2d'; shards: number; maze: number; frames: number; avgMs: number; maxMs: number }

export default function RealityBreak(props: Props): JSX.Element {
  const [initial] = useState(() => { const cube=takeBreakCube(); return { cube, prepared:takePreparedBreak(cube) } })
  const { cube,prepared } = initial
  if (!cube || !prepared) return <RealityBreak2D {...props} />
  return <RealityBreak3D {...props} cube={cube} prepared={prepared} />
}

function RealityBreak3D(props: Props & { cube: BreakCubeCapture; prepared: { canvas: HTMLCanvasElement; scene: BreakScene } }): JSX.Element {
  const { toName, ready = true } = props
  const glRef = useRef<HTMLDivElement>(null)
  const ovRef = useRef<HTMLCanvasElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const blurRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'break' | 'card' | 'in'>('break')
  const doneRef = useRef(props.onDone); doneRef.current = props.onDone
  const readyRef = useRef(ready); readyRef.current = ready
  const stageRef = useRef(props.onStageChange); stageRef.current = props.onStageChange
  const skipRef = useRef(false)
  const coarse = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 500)

  useEffect(() => {
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let sc: BreakScene | null = props.prepared.scene
    const canvas=props.prepared.canvas
    Object.assign(canvas.style,{ width:'100%',height:'100%',display:'block' })
    glRef.current?.appendChild(canvas)
    takeBreakShot() // 2D 起手截图不再需要（同时复位请求标记）
    const ov = ovRef.current!
    const g = ov.getContext('2d')!
    const snd = createBreakAudio()
    const stats: RbStats = { mode: '3d', shards: sc.shardCount, maze: sc.mazeInstances, frames: 0, avgMs: 0, maxMs: 0 }
    ;(window as unknown as { __rbStats?: RbStats }).__rbStats = stats
    rootRef.current?.setAttribute('data-rb-shards', String(sc.shardCount))
    let W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight)
    ov.width = W; ov.height = H
    let raf = 0
    let ph: 'break' | 'card' | 'in' = 'break'
    let elapsed = 0, last = performance.now(), cardFrames = 0, loadingAllowed = false
    let stage = ''
    let sumMs = 0
    const fired: Record<string, boolean> = {}
    const once = (k: string, fn: () => void) => { if (!fired[k]) { fired[k] = true; fn() } }
    const setStage = (s: string) => { if (stage !== s) { stage = s; rootRef.current?.setAttribute('data-rb-stage', s) } }
    const freeGl = () => {
      if (!sc) return
      sc.dispose(); sc = null
      if (glRef.current) glRef.current.style.display = 'none'
    }
    stageRef.current?.('out')
    setStage('crack')

    const toCard = () => {
      ph = 'card'; elapsed = 0; setPhase('card'); setStage('card')
      snd.distort(0); snd.wind(0)
      once('impact', () => snd.impact())
      freeGl()
    }

    const draw = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000)
      last = now
      if (document.hidden) { raf = requestAnimationFrame(draw); return }
      elapsed += delta
      const nW = Math.max(1, window.innerWidth), nH = Math.max(1, window.innerHeight)
      if (nW !== W || nH !== H) { W = nW; H = nH; ov.width = W; ov.height = H }
      if (skipRef.current) {
        skipRef.current = false
        if (ph === 'break') toCard()
        else if (ph === 'in') elapsed = IN_DUR
      }
      if (ph === 'in' && elapsed >= IN_DUR) {
        g.clearRect(0, 0, W, H)
        snd.stop(1.2)
        doneRef.current?.()
        return
      }
      raf = requestAnimationFrame(draw)
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
      rootRef.current?.setAttribute('data-rb-t', elapsed.toFixed(2))

      if (ph === 'break') {
        const t = elapsed
        if (t >= TL.end || !sc) { toCard(); return }
        setStage(stageAt(t))
        // 声音：碎裂由近及远多次、低鸣随破碎加深、下坠风声、迷宫逼近时嗡鸣渐起
        once('c0', () => snd.crack(0.6))
        if (t > 0.55) once('c1', () => snd.crack(0.9))
        if (t > 1.2) once('c2', () => snd.crack(1.1))
        if (t > TL.peelStart + 0.1) once('c3', () => snd.crack(1.4))
        if (t > TL.fallStart - 0.1) once('c4', () => snd.crack(1.5))
        if (t > 3.9) once('c5', () => snd.crack(0.7))
        snd.distort(t < TL.voidStart ? clamp01(t / TL.voidStart) : 1 - 0.65 * smooth((t - TL.voidStart) / 2))
        snd.wind(t < TL.fallStart ? 0 : 0.45 * smooth((t - TL.fallStart) / 1.8) + 0.55 * smooth((t - 8.6) / 2.6))
        if (t > 8.4) snd.hum(0.55 * smooth((t - 8.4) / 3))
        if (t > TL.impact) once('impact', () => snd.impact())

        let ms = 0
        try { ms = sc.render(t, W, H) } catch (err) { console.warn('[RealityBreak] 3D 渲染失败', err); toCard(); return }
        stats.frames++; sumMs += ms; stats.avgMs = +(sumMs / stats.frames).toFixed(2); stats.maxMs = +Math.max(stats.maxMs, ms).toFixed(2)

        // 叠加层：暗角、裂开时的黄光、穿过天花板的荧光淹没、撞击闪白 → 黑
        g.clearRect(0, 0, W, H)
        const voidK = smooth((t - 2.2) / 2.5)
        const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.hypot(W, H) * 0.62)
        vg.addColorStop(0, 'rgba(0,0,0,0)')
        vg.addColorStop(1, `rgba(0,0,0,${0.25 + 0.4 * voidK})`)
        g.fillStyle = vg; g.fillRect(0, 0, W, H)
        // 迷宫光从下方漫上来（低头后屏幕下半部偏黄）
        const glowK = smooth((t - 8.2) / 3)
        if (glowK > 0.01) {
          const gr = g.createLinearGradient(0, H, 0, 0)
          gr.addColorStop(0, `rgba(255,214,120,${0.16 * glowK})`); gr.addColorStop(1, 'rgba(255,214,120,0)')
          g.fillStyle = gr; g.fillRect(0, 0, W, H)
        }
        const { ceilK } = sc.info(t)
        if (t < TL.ceil) {
          if (ceilK > 0.01) { g.fillStyle = `rgba(255,244,206,${(reduced ? 0.5 : 0.85) * ceilK * ceilK})`; g.fillRect(0, 0, W, H) }
        } else {
          // 穿过天花板：荧光黄白淹没 → 撞击闪白（减弱动效时改为暗黄）→ 黑
          const k1 = clamp01((t - TL.ceil) / (TL.impact - TL.ceil))
          const k2 = clamp01((t - TL.impact) / (TL.end - TL.impact))
          g.fillStyle = reduced ? `rgba(120,104,52,${0.85})` : `rgba(255,${Math.round(246 - 20 * k1)},${Math.round(214 - 60 * k1)},${0.92 + 0.08 * k1})`
          g.fillRect(0, 0, W, H)
          if (t > TL.impact) {
            if (!reduced && k2 < 0.3) { g.fillStyle = `rgba(255,255,250,${1 - k2 / 0.3})`; g.fillRect(0, 0, W, H) }
            g.fillStyle = `rgba(0,0,0,${smooth(k2 * 1.15)})`; g.fillRect(0, 0, W, H)
          }
        }
      } else if (ph === 'card') {
        g.fillStyle = '#030303'
        g.fillRect(0, 0, W, H)
        if (!reduced && Math.random() < 0.06) { g.fillStyle = 'rgba(201,180,88,0.035)'; g.fillRect(0, 0, W, H) }
        snd.hum(0.55 + 0.45 * clamp01(elapsed / 0.8))
        cardFrames++
        if (!loadingAllowed && elapsed >= 0.32 && cardFrames >= 2) { loadingAllowed = true; stageRef.current?.('loading') }
        if (loadingAllowed && elapsed >= CARD_MIN && readyRef.current) {
          ph = 'in'; elapsed = 0; setPhase('in'); setStage('in'); stageRef.current?.('in')
        }
      } else {
        // 醒来：眼皮两次开合 + 模糊消退
        const t = elapsed
        const open = t < 0.7 ? smooth(t / 0.7) * 0.35 : t < 1.05 ? 0.35 * (1 - smooth((t - 0.7) / 0.35)) : smooth((t - 1.05) / 1.1)
        g.clearRect(0, 0, W, H)
        g.fillStyle = '#030303'
        g.fillRect(0, 0, W, H)
        if (open > 0.002) {
          g.globalCompositeOperation = 'destination-out'
          const rx = W * (0.55 + 0.25 * open), ry = Math.max(1, H * 0.62 * open)
          const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 1)
          gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.75, 'rgba(0,0,0,0.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
          g.save(); g.translate(W / 2, H / 2); g.scale(rx, ry); g.translate(-W / 2, -H / 2)
          g.fillStyle = gr
          g.beginPath(); g.arc(W / 2, H / 2, 1, 0, Math.PI * 2); g.fill()
          g.restore()
          g.globalCompositeOperation = 'destination-over'
          g.fillStyle = `rgba(201,180,88,${0.22 * (1 - smooth(t / IN_DUR))})`
          g.fillRect(0, 0, W, H)
          g.globalCompositeOperation = 'source-over'
        }
        if (blurRef.current) {
          const b = 10 * (1 - smooth((t - 0.6) / (IN_DUR - 0.6)))
          blurRef.current.style.backdropFilter = `blur(${b.toFixed(1)}px)`
          ;(blurRef.current.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = `blur(${b.toFixed(1)}px)`
        }
        snd.hum(1 - 0.6 * smooth(t / IN_DUR))
      }
    }
    raf = requestAnimationFrame(draw)
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); skipRef.current = true }
    }
    window.addEventListener('keydown', onKey, true)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); snd.stop(0.4); freeGl() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 挂到 body 上（与准星等 body 级元素同一层叠上下文，盖住它们）
  return createPortal(
    <div ref={rootRef} data-cutscene data-reality-break data-rb-mode="3d" data-phase={phase} data-ready={ready} style={{ position: 'fixed', inset: 0, zIndex: 55, pointerEvents: 'none' }}>
      <div ref={blurRef} style={{ position: 'absolute', inset: 0, display: phase === 'in' ? 'block' : 'none' }} />
      <div ref={glRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: phase === 'break' ? 'block' : 'none', background: '#000' }} />
      <canvas ref={ovRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {phase === 'card' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', animation: 'rbCardIn 1.2s ease-out both' }}>
          <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.4em', color: 'rgba(201,180,88,0.75)' }}>——  你穿过了地面  ——</div>
          {toName && <div style={{ fontFamily: MONO, fontSize: 19, letterSpacing: '0.32em', color: BR_YELLOW }}>{toName}</div>}
          <div style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(201,180,88,0.45)', letterSpacing: '0.2em' }}>嗡————————</div>
          <div role="status" style={{ fontSize: 12, color: 'var(--text-dim)' }}>{ready ? '附近场景已就绪' : '正在准备附近场景…'}</div>
        </div>
      )}
      {phase === 'in' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: '18%', textAlign: 'center', fontFamily: MONO, fontSize: 14, letterSpacing: '0.25em', color: 'rgba(230,215,150,0.85)', textShadow: '0 1px 4px #000', animation: 'rbWake 2.6s ease-in-out both' }}>
          ……荧光灯在嗡嗡作响。
        </div>
      )}
      {phase === 'break' && (
        coarse
          ? <button data-rb-skip onClick={() => { skipRef.current = true }} style={{ position: 'absolute', right: 18, bottom: 18, pointerEvents: 'auto', padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(201,180,88,.5)', background: 'rgba(0,0,0,.45)', color: BR_YELLOW, fontFamily: MONO, fontSize: 13, letterSpacing: '0.2em' }}>跳过 ▸</button>
          : <div data-rb-skip style={{ position: 'absolute', right: 22, bottom: 18, fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: 'rgba(240,225,170,.55)', textShadow: '0 1px 3px #000' }}>[空格] 跳过</div>
      )}
      <style>{`
        @keyframes rbCardIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rbWake { 0% { opacity: 0 } 30% { opacity: 1 } 80% { opacity: 1 } 100% { opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { [data-reality-break] > div { animation: none !important; } }
      `}</style>
    </div>,
    document.body,
  )
}
