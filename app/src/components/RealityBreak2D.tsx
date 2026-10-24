// 前厅 M4（P3）：RealityBreak —— 回程终点「现实破碎」过场，替换原 Cutscene 'fall'。
// 阶段（data-rb-stage）：
//   crack   0.0–1.6 s  回程终点最后一帧 3D 画面上裂纹蔓延，裂缝里透出昏黄的光，画面震动、局部错位
//   shatter 1.6–3.5 s  画面褪向后室黄，沿裂纹切开的碎片向上剥落飞散，露出下方一层层黄房间
//   fall    3.5–5.9 s  穿过一层层黄房间（天花板 → 墙纸 → 地毯）加速下坠，风声
//   impact  5.9–6.15s  撞击
//   card    黑场 + 荧光灯嗡鸣 + 字幕；等待 Level 0 附近场景就绪（App 在此阶段换图/预热）
//   in      在 Level 0 醒来：眼皮开合两次、模糊消退
// 跳过：空格 / 回车（桌面），右下角「跳过」按钮（触屏）→ 直接进入黑场。
// 移动端/粗指针：碎片更少、关闭画面错位；prefers-reduced-motion：关闭震动与闪白。
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { createBreakAudio } from '@/game/core/realityBreakAudio'
import { takeBreakShot } from '@/game/engine/foyerLanding'

type Ctx = CanvasRenderingContext2D
type Stage = 'crack' | 'shatter' | 'fall' | 'impact' | 'card' | 'in'

const T_CRACK = 1.6
const T_SHATTER = 3.5
const T_FALL = 5.9
const T_BREAK = 6.15
const CARD_MIN = 2.2
const IN_DUR = 2.6
const MONO = "'JetBrains Mono', ui-monospace, monospace"
const BR_YELLOW = '#c9b458'

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

interface Pt { x: number; y: number }
interface Crack { pts: Pt[]; len: number[]; total: number; born: number; speed: number; w: number }
interface Shard { poly: Pt[]; cx: number; cy: number; t0: number; vx: number; vy: number; spin: number; grow: number }

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/** 由撞击点生成「放射主裂纹 + 环形裂纹」，并沿同一结构切出碎片多边形（保证碎片沿裂纹剥落）。 */
function buildFracture(W: number, H: number, lite: boolean) {
  const r = rng(0xb7ea4)
  const ix = W * 0.5 + (r() - 0.5) * W * 0.08, iy = H * 0.8
  const rays = lite ? 8 : 12
  const rings = lite ? 4 : 6
  const maxR = Math.hypot(W, H) * 1.05
  // 每条射线在各环上的节点（带抖动）
  const node: Pt[][] = []
  const baseA: number[] = []
  for (let i = 0; i < rays; i++) baseA.push((i / rays) * Math.PI * 2 + (r() - 0.5) * (Math.PI / rays) * 0.8)
  for (let i = 0; i < rays; i++) {
    const row: Pt[] = [{ x: ix, y: iy }]
    for (let k = 1; k <= rings; k++) {
      const rr = maxR * Math.pow(k / rings, 1.7) * (0.85 + r() * 0.3)
      const a = baseA[i] + (r() - 0.5) * 0.22
      row.push({ x: ix + Math.cos(a) * rr, y: iy + Math.sin(a) * rr * 0.92 })
    }
    node.push(row)
  }
  const cracks: Crack[] = []
  const mk = (pts: Pt[], born: number, speed: number, w: number) => {
    const len = [0]
    for (let j = 1; j < pts.length; j++) len.push(len[j - 1] + Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y))
    cracks.push({ pts, len, total: len[len.length - 1], born, speed, w })
  }
  // 主裂纹：沿射线，中间加细碎折点
  for (let i = 0; i < rays; i++) {
    const pts: Pt[] = [node[i][0]]
    for (let k = 1; k <= rings; k++) {
      const a = node[i][k - 1], b = node[i][k]
      const mid = { x: (a.x + b.x) / 2 + (r() - 0.5) * 18, y: (a.y + b.y) / 2 + (r() - 0.5) * 18 }
      pts.push(mid, b)
    }
    mk(pts, 0.05 + r() * 0.25, (W + H) * (0.55 + r() * 0.5), 2.4)
  }
  // 环形裂纹：相邻射线同环节点之间，内环先出现
  for (let k = 1; k < rings; k++) for (let i = 0; i < rays; i++) {
    if (k > 1 && r() < 0.22) continue
    const a = node[i][k], b = node[(i + 1) % rays][k]
    const m = { x: (a.x + b.x) / 2 + (r() - 0.5) * 22, y: (a.y + b.y) / 2 + (r() - 0.5) * 22 }
    mk([a, m, b], 0.35 + k * 0.22 + r() * 0.2, (W + H) * 0.35, 1.5)
  }
  // 碎片：射线 i/i+1 与环 k/k+1 围成的四边形；内圈先剥落
  const shards: Shard[] = []
  for (let k = 0; k < rings; k++) for (let i = 0; i < rays; i++) {
    const j = (i + 1) % rays
    const poly = k === 0 ? [node[i][0], node[i][1], node[j][1]] : [node[i][k], node[i][k + 1], node[j][k + 1], node[j][k]]
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length, cy = poly.reduce((s, p) => s + p.y, 0) / poly.length
    const dx = cx - ix, dy = cy - iy, dl = Math.max(1, Math.hypot(dx, dy))
    shards.push({
      poly, cx, cy,
      t0: T_CRACK + 0.05 + k * (lite ? 0.26 : 0.2) + r() * 0.3,
      vx: (dx / dl) * (60 + r() * 140),
      vy: -(260 + r() * 360) + (dy / dl) * 40,
      spin: (r() - 0.5) * 3.2,
      grow: 0.4 + r() * 0.9,
    })
  }
  return { cracks, shards, ix, iy }
}

/** 下坠隧道：一层层黄房间（天花板板材+灯管 / 墙纸 / 地毯），从近到远画嵌套矩形。 */
function drawTunnel(g: Ctx, W: number, H: number, depth: number, t: number, motion: boolean) {
  const cx = W / 2 + (motion ? Math.sin(t * 1.3) * W * 0.025 : 0)
  const cy = H / 2 + (motion ? Math.cos(t * 1.1) * H * 0.02 : 0)
  g.save()
  g.translate(cx, cy)
  if (motion) g.rotate(t * 0.22)
  const R = Math.hypot(W, H) * 0.75
  g.fillStyle = '#3a3216'
  g.fillRect(-R, -R, R * 2, R * 2)
  const ROOM = 3
  const bands: { z0: number; z1: number; kind: 'ceil' | 'wall' | 'floor' }[] = []
  const start = Math.floor(depth / ROOM) * ROOM
  for (let room = start; room < depth + 30; room += ROOM) {
    bands.push({ z0: room, z1: room + 0.3, kind: 'ceil' }, { z0: room + 0.3, z1: room + 2.75, kind: 'wall' }, { z0: room + 2.75, z1: room + 3, kind: 'floor' })
  }
  const K = Math.min(W, H) * 0.42
  const half = (z: number) => (K / Math.max(0.06, z))
  for (const b of bands) {
    const zn = b.z0 - depth, zf = b.z1 - depth
    if (zf <= 0.06) continue
    const hn = half(Math.max(0.06, zn)), hf = half(zf)
    if (hf > R * 2) continue
    const fog = clamp01((Math.max(0.06, zn) - 2) / 34)
    const shade = (r: number, g2: number, bl: number) => `rgb(${Math.round(lerp(r, 40, fog))},${Math.round(lerp(g2, 34, fog))},${Math.round(lerp(bl, 16, fog))})`
    g.fillStyle = b.kind === 'ceil' ? shade(214, 206, 170) : b.kind === 'wall' ? shade(201, 180, 88) : shade(122, 98, 52)
    const hw = Math.min(hn, R), hh = hw
    g.fillRect(-hw, -hh * 0.8, hw * 2, hh * 1.6)
    if (b.kind === 'wall') {
      // 墙纸竖条纹 → 透视下为指向灭点的放射线
      g.strokeStyle = `rgba(120,100,40,${0.35 * (1 - fog)})`
      g.lineWidth = 1
      g.beginPath()
      for (let s = -4; s <= 4; s++) {
        const u = s / 4
        for (const [sx, sy] of [[u, -0.8], [u, 0.8], [-1, u * 0.8], [1, u * 0.8]] as const) {
          g.moveTo(sx * Math.min(hn, R * 1.5), sy * Math.min(hn, R * 1.5)); g.lineTo(sx * hf, sy * hf)
        }
      }
      g.stroke()
    } else if (b.kind === 'ceil' && zn > 0.06) {
      // 天花板灯管：四边各两支亮条
      const hm = half((zn + zf) / 2)
      g.fillStyle = `rgba(255,252,225,${0.9 * (1 - fog)})`
      const lw = hm * 0.22, lt = Math.max(1, hm * 0.025)
      for (const u of [-0.45, 0.45]) {
        g.fillRect(u * hm - lw / 2, -hm * 0.8 + lt, lw, lt * 2)
        g.fillRect(u * hm - lw / 2, hm * 0.8 - lt * 3, lw, lt * 2)
      }
    }
  }
  g.restore()
  // 速度线
  if (motion) {
    const sp = clamp01(t / 3)
    g.strokeStyle = `rgba(255,240,180,${0.12 + 0.2 * sp})`
    g.lineWidth = 1.5
    g.beginPath()
    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996 + t * 0.4
      const r0 = ((i * 97 + t * 900 * (0.5 + sp)) % (Math.hypot(W, H) * 0.6))
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
      g.lineTo(cx + Math.cos(a) * (r0 + 40 + 120 * sp), cy + Math.sin(a) * (r0 + 40 + 120 * sp))
    }
    g.stroke()
  }
}

export default function RealityBreak2D(props: {
  toName?: string
  levelId?: number
  ready?: boolean
  onStageChange?: (stage: 'out' | 'loading' | 'in') => void
  onDone?: () => void
}): JSX.Element {
  const { toName, ready = true } = props
  const ref = useRef<HTMLCanvasElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const blurRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'break' | 'card' | 'in'>('break')
  const doneRef = useRef(props.onDone); doneRef.current = props.onDone
  const readyRef = useRef(ready); readyRef.current = ready
  const stageRef = useRef(props.onStageChange); stageRef.current = props.onStageChange
  const skipRef = useRef(false)
  const coarse = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 500)

  useEffect(() => {
    const c = ref.current!
    const g = c.getContext('2d')!
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const motion = !reduced
    const lite = coarse
    const shot = takeBreakShot()
    const snd = createBreakAudio()
    let W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight)
    c.width = W; c.height = H
    let frac = buildFracture(W, H, lite)
    // 场景缓冲：起手画面（cover 适配）+ 褪色到后室黄
    const scene = document.createElement('canvas')
    const sg = scene.getContext('2d')!
    const paintScene = (yellowK: number) => {
      if (scene.width !== W || scene.height !== H) { scene.width = W; scene.height = H }
      sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1
      if (shot) {
        const k = Math.max(W / shot.width, H / shot.height)
        const dw = shot.width * k, dh = shot.height * k
        sg.drawImage(shot, (W - dw) / 2, (H - dh) / 2, dw, dh)
      } else {
        const gr = sg.createLinearGradient(0, 0, 0, H)
        gr.addColorStop(0, '#0b0f1c'); gr.addColorStop(0.6, '#1a1d26'); gr.addColorStop(1, '#2a2620')
        sg.fillStyle = gr; sg.fillRect(0, 0, W, H)
      }
      if (yellowK > 0.01) {
        sg.globalCompositeOperation = 'color'
        sg.fillStyle = `rgba(201,180,88,${Math.min(1, yellowK)})`
        sg.fillRect(0, 0, W, H)
        sg.globalCompositeOperation = 'multiply'
        sg.fillStyle = `rgba(255,236,170,${0.55 * yellowK})`
        sg.fillRect(0, 0, W, H)
        sg.globalCompositeOperation = 'screen'
        sg.fillStyle = `rgba(120,96,30,${0.25 * yellowK})`
        sg.fillRect(0, 0, W, H)
        sg.globalCompositeOperation = 'source-over'
      }
    }

    let raf = 0
    let ph: 'break' | 'card' | 'in' = 'break'
    let elapsed = 0, last = performance.now(), cardFrames = 0, loadingAllowed = false
    let stage: Stage | '' = ''
    const fired: Record<string, boolean> = {}
    const once = (k: string, fn: () => void) => { if (!fired[k]) { fired[k] = true; fn() } }
    const setStage = (s: Stage) => {
      if (stage === s) return
      stage = s
      rootRef.current?.setAttribute('data-rb-stage', s)
    }
    stageRef.current?.('out')
    setStage('crack')

    const toCard = () => {
      ph = 'card'; elapsed = 0; setPhase('card'); setStage('card')
      snd.distort(0); snd.wind(0)
      once('impact', () => snd.impact())
    }

    const draw = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000)
      last = now
      if (document.hidden) { raf = requestAnimationFrame(draw); return }
      elapsed += delta
      const nW = Math.max(1, window.innerWidth), nH = Math.max(1, window.innerHeight)
      if (nW !== W || nH !== H) { W = nW; H = nH; c.width = W; c.height = H; frac = buildFracture(W, H, lite) }
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
      g.filter = 'none'

      rootRef.current?.setAttribute('data-rb-t', elapsed.toFixed(2))
      if (ph === 'break') {
        const t = elapsed
        if (t >= T_BREAK) { toCard(); return }
        setStage(t < T_CRACK ? 'crack' : t < T_SHATTER ? 'shatter' : t < T_FALL ? 'fall' : 'impact')
        const shake = motion ? (t < T_CRACK ? 2 + t * 5 : t < T_SHATTER ? 9 : t < T_FALL ? 5 : 14) : 0
        const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake
        const yellowK = smooth((t - 0.7) / (T_SHATTER - 0.7))
        // 声音
        once('c0', () => snd.crack(0.7))
        if (t > 0.6) once('c1', () => snd.crack(1))
        if (t > 1.25) once('c2', () => snd.crack(1.2))
        if (t > T_CRACK) once('c3', () => snd.crack(1.4))
        snd.distort(clamp01(t / T_SHATTER))
        snd.wind(t < T_CRACK ? 0 : clamp01((t - T_CRACK) / (T_FALL - T_CRACK)))
        if (t > T_FALL) once('impact', () => snd.impact())

        // 底层：下坠隧道（碎片剥落后露出）
        const fallK = clamp01((t - T_CRACK) / (T_FALL - T_CRACK))
        const depth = 0.4 + fallK * fallK * 26
        if (t >= T_CRACK) drawTunnel(g, W, H, depth, t - T_CRACK, motion)
        else { g.fillStyle = '#2a2410'; g.fillRect(0, 0, W, H) }

        // 场景层（未剥落的碎片）
        paintScene(yellowK)
        g.save()
        g.translate(sx, sy)
        if (t < T_CRACK + 0.05) {
          g.drawImage(scene, 0, 0)
        } else {
          for (const s of frac.shards) {
            const lt = t - s.t0
            if (lt > 2.2) continue
            g.save()
            if (lt > 0) {
              const k = lt
              g.translate(s.cx + s.vx * k, s.cy + s.vy * k - 260 * k * k)
              g.rotate(s.spin * k)
              const sc = 1 + s.grow * k * k
              g.scale(sc, sc)
              g.translate(-s.cx, -s.cy)
              g.globalAlpha = 1 - smooth((lt - 1.2) / 1)
            }
            g.beginPath()
            s.poly.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
            g.closePath()
            g.clip()
            g.drawImage(scene, 0, 0)
            if (lt > 0) {
              // 碎片边缘高光与背面阴影
              g.strokeStyle = 'rgba(255,240,170,0.55)'; g.lineWidth = 2; g.stroke()
              g.fillStyle = `rgba(0,0,0,${Math.min(0.22, lt * 0.3)})`; g.fill()
            }
            g.restore()
          }
        }
        // 裂纹（随时间生长）+ 裂缝透光
        if (t < T_SHATTER + 0.6) {
          const ca = 1 - smooth((t - T_SHATTER) / 0.6)
          g.lineCap = 'round'; g.lineJoin = 'round'
          for (const pass of [0, 1, 2]) {
            g.beginPath()
            for (const cr of frac.cracks) {
              const L = (t - cr.born) * cr.speed
              if (L <= 0) continue
              g.moveTo(cr.pts[0].x, cr.pts[0].y)
              for (let j = 1; j < cr.pts.length; j++) {
                if (cr.len[j] <= L) g.lineTo(cr.pts[j].x, cr.pts[j].y)
                else {
                  const k = (L - cr.len[j - 1]) / (cr.len[j] - cr.len[j - 1])
                  g.lineTo(lerp(cr.pts[j - 1].x, cr.pts[j].x, k), lerp(cr.pts[j - 1].y, cr.pts[j].y, k))
                  break
                }
              }
            }
            if (pass === 0) { g.strokeStyle = `rgba(255,214,90,${0.22 * ca})`; g.lineWidth = lite ? 10 : 16 }
            else if (pass === 1) { g.strokeStyle = `rgba(20,14,6,${0.85 * ca})`; g.lineWidth = 3.2 }
            else { g.strokeStyle = `rgba(255,236,150,${0.95 * ca})`; g.lineWidth = 1.2 }
            g.stroke()
          }
          // 撞击点光晕
          const glow = smooth(t / T_CRACK) * ca
          const gr = g.createRadialGradient(frac.ix, frac.iy, 0, frac.ix, frac.iy, Math.min(W, H) * (0.12 + 0.3 * glow))
          gr.addColorStop(0, `rgba(255,232,140,${0.75 * glow})`)
          gr.addColorStop(1, 'rgba(255,214,90,0)')
          g.fillStyle = gr
          g.fillRect(0, 0, W, H)
        }
        g.restore()
        // 画面错位（横向切片位移）——仅桌面、非减弱动效
        if (motion && !lite && t > 0.4 && t < T_SHATTER && Math.random() < 0.35) {
          for (let i = 0; i < 3; i++) {
            const y = Math.random() * H, h = 6 + Math.random() * 30, dx = (Math.random() - 0.5) * 50 * (0.5 + yellowK)
            g.drawImage(c, 0, y, W, h, dx, y, W, h)
          }
        }
        // 色差边缘 + 暗角
        const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6)
        vg.addColorStop(0, 'rgba(0,0,0,0)')
        vg.addColorStop(1, `rgba(20,14,4,${0.35 + 0.35 * fallK})`)
        g.fillStyle = vg
        g.fillRect(0, 0, W, H)
        // 撞击：闪白（减弱动效时改为直接压暗）→ 黑
        if (t > T_FALL) {
          const k = (t - T_FALL) / (T_BREAK - T_FALL)
          if (motion && k < 0.35) { g.fillStyle = `rgba(255,246,210,${0.85 * (1 - k / 0.35)})`; g.fillRect(0, 0, W, H) }
          g.fillStyle = `rgba(0,0,0,${smooth(k)})`
          g.fillRect(0, 0, W, H)
        } else if (t > T_FALL - 0.5) {
          g.fillStyle = `rgba(255,240,190,${0.3 * smooth((t - (T_FALL - 0.5)) / 0.5)})`
          g.fillRect(0, 0, W, H)
        }
      } else if (ph === 'card') {
        g.fillStyle = '#030303'
        g.fillRect(0, 0, W, H)
        // 极淡的荧光灯频闪
        if (motion && Math.random() < 0.06) { g.fillStyle = 'rgba(201,180,88,0.035)'; g.fillRect(0, 0, W, H) }
        snd.hum(clamp01(elapsed / 0.8))
        cardFrames++
        if (!loadingAllowed && elapsed >= 0.32 && cardFrames >= 2) { loadingAllowed = true; stageRef.current?.('loading') }
        if (loadingAllowed && elapsed >= CARD_MIN && readyRef.current) {
          ph = 'in'; elapsed = 0; setPhase('in'); setStage('in'); stageRef.current?.('in')
        }
      } else {
        // 醒来：眼皮两次开合 + 模糊消退
        const t = elapsed
        if (!readyRef.current) { /* 场景仍在准备：保持当前帧 */ }
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
          // 后室黄的余晕：只落在睁开的区域（画在眼皮之后）
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
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); snd.stop(0.4) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={rootRef} data-cutscene data-reality-break data-phase={phase} data-ready={ready} style={{ position: 'fixed', inset: 0, zIndex: 55, pointerEvents: 'none' }}>
      <div ref={blurRef} style={{ position: 'absolute', inset: 0, display: phase === 'in' ? 'block' : 'none' }} />
      <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
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
    </div>
  )
}
