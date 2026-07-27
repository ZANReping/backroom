// 层级切换过场演出：切出（kind）→ 黑场字幕卡 →（可选）切入（cutIn）
// 统一在「老式录像带 / 空间故障」母题上；全屏 Canvas2D 覆盖层，pointer-events: none。
// 用法：<Cutscene kind="noclip" cutIn="fall" toName="Level 1 · 车库" caption="你剪辑出去了" onDone={...} />
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { audio } from '@/game/audio'

export type CutKind = 'bloom' | 'shutter' | 'iris' | 'glitch' | 'fall' | 'noclip' | 'collapse' | 'sink' | 'dawn'
export type CutIn = 'fall' | 'collapse' | 'wade' | 'crawl' | 'step' | 'surface' | 'dark'

type Ctx = CanvasRenderingContext2D

// 各类过场时长（秒）
const OUT_DUR: Record<CutKind, number> = {
  bloom: 0.95,
  shutter: 0.9,
  iris: 1.0,
  glitch: 1.1,
  fall: 1.15,
  noclip: 1.5,
  collapse: 1.35,
  sink: 1.55,
  dawn: 1.45,
}
const IN_DUR: Record<CutIn, number> = {
  fall: 0.95,
  collapse: 0.95,
  wade: 0.9,
  crawl: 1.0,
  step: 0.7,
  surface: 0.9,
  dark: 0.85,
}
const CARD_DUR = 0.72
const MONO = "'JetBrains Mono', ui-monospace, monospace"

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (x: number) => {
  const k = clamp01(x)
  return k * k * (3 - 2 * k)
}
const hash = (i: number, s: number) => {
  const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453
  return v - Math.floor(v)
}

// 用四周黑边模拟「画面剧烈位移」的震动感
const shakeBars = (g: Ctx, W: number, H: number, amp: number) => {
  if (amp < 0.5) return
  const ox = (Math.random() - 0.5) * amp
  const oy = (Math.random() - 0.5) * amp * 1.5
  g.fillStyle = '#08070a'
  if (oy > 0) g.fillRect(0, 0, W, oy)
  else g.fillRect(0, H + oy, W, -oy)
  if (ox > 0) g.fillRect(0, 0, ox, H)
  else g.fillRect(W + ox, 0, -ox, H)
}

// ============================================================================
// 切出（kind）：从透明开始，结束时必须完全遮住画面
// ============================================================================
const drawOut = (g: Ctx, kind: CutKind, p: number, tt: number, W: number, H: number) => {
  const cx = W / 2
  const cy = H / 2
  switch (kind) {
    // 白场绽开：从中心炸开的暖白光
    case 'bloom': {
      const a = smooth(p)
      const r = Math.hypot(W, H) * (0.04 + p * p * 0.9)
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(2, r))
      gr.addColorStop(0, `rgba(255,253,240,${Math.min(1, a * 1.35)})`)
      gr.addColorStop(0.5, `rgba(245,227,122,${a * 0.92})`)
      gr.addColorStop(1, 'rgba(232,185,60,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, W, H)
      if (p > 0.68) {
        g.fillStyle = `rgba(255,252,236,${smooth((p - 0.68) / 0.32)})`
        g.fillRect(0, 0, W, H)
      }
      break
    }
    // 上下快门合拢
    case 'shutter': {
      const h = p * p * H * 0.5
      g.fillStyle = '#0a0908'
      g.fillRect(0, 0, W, h)
      g.fillRect(0, H - h, W, h)
      g.fillStyle = `rgba(232,185,60,${0.3 + 0.45 * p})`
      g.fillRect(0, h - 2, W, 2)
      g.fillRect(0, H - h, W, 2)
      if (p > 0.9) {
        g.fillStyle = `rgba(10,9,8,${(p - 0.9) / 0.1})`
        g.fillRect(0, 0, W, H)
      }
      break
    }
    // 圆形光圈收缩到中心
    case 'iris': {
      g.fillStyle = '#0a0908'
      g.fillRect(0, 0, W, H)
      const r = (1 - p * p) * Math.hypot(W, H) * 0.52
      if (r > 1) {
        g.globalCompositeOperation = 'destination-out'
        const gr = g.createRadialGradient(cx, cy, r * 0.84, cx, cy, r)
        gr.addColorStop(0, 'rgba(0,0,0,1)')
        gr.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = gr
        g.fillRect(0, 0, W, H)
        g.globalCompositeOperation = 'source-over'
        g.strokeStyle = `rgba(232,185,60,${0.2 + 0.3 * p})`
        g.lineWidth = 2
        g.beginPath()
        g.arc(cx, cy, r * 0.9, 0, Math.PI * 2)
        g.stroke()
      }
      break
    }
    // 电视信号撕裂：RGB 色差 + 横向条带错位 + 扫描线跳动
    case 'glitch': {
      const fr = Math.floor(tt * 26)
      for (let i = 0; i < 11; i++) {
        const y = hash(i, fr) * H
        const bh = (4 + hash(i, fr + 7) * 44) * (0.4 + p)
        const dx = (hash(i, fr + 3) - 0.5) * W * 0.4 * p
        g.fillStyle = `rgba(10,9,8,${0.5 + 0.45 * p})`
        g.fillRect(dx, y, W, bh)
        const s = 4 + 16 * p
        g.globalCompositeOperation = 'lighter'
        g.fillStyle = `rgba(255,40,50,${0.25 + 0.2 * p})`
        g.fillRect(dx - s, y, s, bh)
        g.fillStyle = `rgba(40,240,255,${0.25 + 0.2 * p})`
        g.fillRect(dx + W, y, s, bh)
        g.globalCompositeOperation = 'source-over'
      }
      for (let i = 0; i < 3; i++) {
        g.fillStyle = `rgba(255,255,255,${0.08 + hash(fr, 60 + i) * 0.16})`
        g.fillRect(0, hash(fr, 50 + i) * H, W, 1 + hash(fr, 70 + i) * 5)
      }
      g.fillStyle = `rgba(10,9,8,${smooth((p - 0.5) / 0.5)})`
      g.fillRect(0, 0, W, H)
      break
    }
    // 坠落拉黑：下坠模糊 + 速度线 + 拉黑
    case 'fall': {
      g.fillStyle = `rgba(6,6,8,${Math.pow(clamp01(p * 1.05), 1.4)})`
      g.fillRect(0, 0, W, H)
      for (let i = 0; i < 52; i++) {
        const x = hash(i, 2) * W
        const y = ((hash(i, 3) + tt * (1.4 + p * 4)) % 1) * (H + 400) - 200
        const len = 40 + p * H * 0.4
        g.fillStyle = `rgba(220,226,236,${0.08 + 0.3 * p})`
        g.fillRect(x, y, 1.5, len)
      }
      const vg = g.createRadialGradient(cx, cy, Math.min(W, H) * (0.4 - 0.3 * p), cx, cy, Math.max(W, H) * 0.72)
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, `rgba(0,0,0,${0.4 + 0.6 * p})`)
      g.fillStyle = vg
      g.fillRect(0, 0, W, H)
      if (p > 0.8) {
        g.fillStyle = `rgba(6,6,8,${smooth((p - 0.8) / 0.2)})`
        g.fillRect(0, 0, W, H)
      }
      break
    }
    // 剪辑穿透：十几条水平带以不同速度横向抽出，留下黑缝；末尾一次空间对折
    case 'noclip': {
      const BANDS = 15
      const bh = H / BANDS
      const fr = Math.floor(tt * 24)
      for (let i = 0; i < BANDS; i++) {
        const y = i * bh
        const dir = i % 2 === 0 ? 1 : -1
        const sp = 0.5 + hash(i, 1) * 1.2
        const w = clamp01(p * sp * 1.45) * W
        if (w <= 0) continue
        const x = dir > 0 ? 0 : W - w
        g.fillStyle = '#000'
        g.fillRect(x, y, w, bh + 1)
        // 抽出边缘的强烈 RGB 分离
        const ex = dir > 0 ? x + w : x
        const s = (5 + 24 * p + hash(i, fr) * 12) * dir
        g.globalCompositeOperation = 'lighter'
        g.fillStyle = `rgba(255,32,48,${0.45 * (1 - p * 0.4)})`
        g.fillRect(ex, y, -s, bh + 1)
        g.fillStyle = `rgba(40,240,255,${0.4 * (1 - p * 0.4)})`
        g.fillRect(ex + s, y, s * 0.8, bh + 1)
        g.globalCompositeOperation = 'source-over'
      }
      // 偶发全黑闪帧
      if (p > 0.25 && hash(fr, 9) < 0.09) {
        g.fillStyle = '#000'
        g.fillRect(0, 0, W, H)
      }
      // 空间对折：上下半部互相镜像挤压
      if (p > 0.6) {
        const k = smooth((p - 0.6) / 0.3)
        const hh = (H / 2) * k
        g.fillStyle = '#000'
        g.fillRect(0, 0, W, hh)
        g.fillRect(0, H - hh, W, hh)
        g.fillStyle = `rgba(255,250,225,${0.45 * k})`
        g.fillRect(0, hh - 1, W, 2)
        g.fillRect(0, H - hh - 1, W, 2)
        g.fillStyle = `rgba(255,255,255,${0.2 + 0.65 * k})`
        g.fillRect(0, H / 2 - 1.5, W, 3)
      }
      if (p > 0.86) {
        g.fillStyle = `rgba(0,0,0,${smooth((p - 0.86) / 0.14)})`
        g.fillRect(0, 0, W, H)
      }
      break
    }
    // 地面坍塌：剧烈震动 + 从下方裂开的黑色裂缝吞没画面 + 尘土
    case 'collapse': {
      shakeBars(g, W, H, (0.4 + p) * 26)
      const crack = smooth(p) * H * 1.2
      g.beginPath()
      g.moveTo(0, H + 4)
      for (let i = 0; i <= 18; i++) {
        const x = (i / 18) * W
        const jag = (hash(i, 5) - 0.5) * H * 0.18 * (0.35 + p)
        g.lineTo(x, H - crack + jag)
      }
      g.lineTo(W, H + 4)
      g.closePath()
      g.fillStyle = '#050405'
      g.fill()
      g.strokeStyle = `rgba(140,104,58,${0.45 * (1 - p * 0.5)})`
      g.lineWidth = 2
      g.stroke()
      // 尘土颗粒
      for (let i = 0; i < 80; i++) {
        const x = hash(i, 6) * W
        const y = H - ((hash(i, 7) + tt * (0.5 + hash(i, 8) * 1.2)) % 1) * H
        const s = 1 + hash(i, 9) * 3
        g.fillStyle = `rgba(176,148,102,${0.15 + 0.4 * hash(i, 10) * (1 - p * 0.4)})`
        g.fillRect(x, y, s, s * 1.4)
      }
      if (p > 0.85) {
        g.fillStyle = `rgba(4,4,5,${smooth((p - 0.85) / 0.15)})`
        g.fillRect(0, 0, W, H)
      }
      break
    }
    // 沉没：水面从下往上淹没，水下蓝绿偏移 + 波纹 + 气泡
    case 'sink': {
      const surf = H * (1 - smooth(p) * 1.12)
      if (surf < H) {
        const top = Math.max(0, surf)
        g.save()
        g.beginPath()
        g.rect(0, top, W, H - top)
        g.clip()
        const gr = g.createLinearGradient(0, top, 0, H)
        gr.addColorStop(0, `rgba(46,124,120,${0.5 + 0.2 * p})`)
        gr.addColorStop(1, `rgba(6,26,44,${0.75 + 0.25 * p})`)
        g.fillStyle = gr
        g.fillRect(0, top, W, H - top)
        // 波纹扭曲
        for (let i = 0; i < 26; i++) {
          const y = top + i * ((H - top) / 26) + Math.sin(tt * 3 + i * 0.8) * 4
          g.fillStyle = `rgba(160,235,225,${0.04 + 0.06 * (0.5 + 0.5 * Math.sin(tt * 4 + i * 0.7))})`
          g.fillRect(0, y, W, 3)
        }
        // 上升的气泡
        for (let i = 0; i < 34; i++) {
          const bx = hash(i, 1) * W
          const by = H - ((hash(i, 2) + tt * (0.35 + hash(i, 3) * 0.6)) % 1) * (H - top + 40)
          const r = 2 + hash(i, 4) * 6
          g.fillStyle = `rgba(198,238,236,${0.18 + 0.3 * hash(i, 5)})`
          g.beginPath()
          g.arc(bx, by, r, 0, Math.PI * 2)
          g.fill()
        }
        g.restore()
        // 水面线
        g.fillStyle = 'rgba(196,242,236,0.45)'
        for (let x = 0; x < W; x += 8) g.fillRect(x, surf + Math.sin(x * 0.02 + tt * 4) * 4, 8, 2)
      }
      if (p > 0.78) {
        g.fillStyle = `rgba(4,14,26,${smooth((p - 0.78) / 0.22)})`
        g.fillRect(0, 0, W, H)
      }
      break
    }
    // 破晓：从底部升起一片冷白光，缓慢覆盖全屏
    case 'dawn': {
      const h = smooth(p) * H * 1.2
      if (h > 1) {
        const gr = g.createLinearGradient(0, H, 0, H - h)
        gr.addColorStop(0, `rgba(238,244,250,${0.8 + 0.2 * p})`)
        gr.addColorStop(0.5, `rgba(226,236,246,${0.25 + 0.55 * p})`)
        gr.addColorStop(1, 'rgba(226,236,246,0)')
        g.fillStyle = gr
        g.fillRect(0, H - h, W, h)
      }
      // 柔光光柱
      g.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 7; i++) {
        const x = (i / 7 + 0.07) * W + Math.sin(tt * 0.6 + i) * 12
        const w = W * (0.03 + hash(i, 12) * 0.05)
        const gr2 = g.createLinearGradient(0, H, 0, H - h)
        gr2.addColorStop(0, `rgba(255,255,255,${0.12 * p})`)
        gr2.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = gr2
        g.fillRect(x - w / 2, H - h, w, h)
      }
      g.globalCompositeOperation = 'source-over'
      if (p > 0.75) {
        g.fillStyle = `rgba(240,245,250,${smooth((p - 0.75) / 0.25)})`
        g.fillRect(0, 0, W, H)
      }
      break
    }
  }
}

// ============================================================================
// 切入（cutIn）：从黑场开始，结束时必须完全放开画面
// ============================================================================
const drawIn = (g: Ctx, kind: CutIn, p: number, tt: number, W: number, H: number) => {
  switch (kind) {
    // 失重坠入：速度线由密到疏，落地一次白闪 + 震动
    case 'fall': {
      const land = 0.62
      const blackA = p < land ? 1 : 1 - smooth((p - land) / 0.3)
      g.fillStyle = `rgba(8,8,9,${blackA})`
      g.fillRect(0, 0, W, H)
      const cnt = Math.round(64 * (1 - p * 0.85)) + 6
      for (let i = 0; i < cnt; i++) {
        const x = hash(i, 3) * W
        const y = ((hash(i, 4) + tt * (2.6 - p * 2)) % 1) * (H + 400) - 200
        const len = H * 0.34 * (1 - p * 0.8) + 20
        g.fillStyle = `rgba(226,230,238,${(0.3 - 0.24 * p) * blackA + 0.03})`
        g.fillRect(x, y, 1.4, len)
      }
      if (p > land && p < land + 0.3) {
        const fk = 1 - (p - land) / 0.3
        g.fillStyle = `rgba(252,248,226,${0.85 * fk})`
        g.fillRect(0, 0, W, H)
        shakeBars(g, W, H, fk * 28)
      }
      break
    }
    // 坍塌坠入：碎石尘土从上往下落，落地黄褐色尘雾
    case 'collapse': {
      g.fillStyle = `rgba(8,7,6,${clamp01(1 - smooth((p - 0.18) / 0.5))})`
      g.fillRect(0, 0, W, H)
      for (let i = 0; i < 90; i++) {
        const x = hash(i, 5) * W
        const y = ((hash(i, 7) + tt * (0.6 + hash(i, 6) * 1.5)) % 1) * (H + 200) - 100
        const s = 1 + hash(i, 8) * 3
        g.fillStyle = `rgba(174,148,102,${0.2 + 0.45 * hash(i, 9)})`
        g.fillRect(x, y, s, s * (1 + hash(i, 10) * 2))
      }
      if (p > 0.45) {
        const dk = 1 - (p - 0.45) / 0.55
        const gr = g.createRadialGradient(W / 2, H * 1.05, 10, W / 2, H * 1.05, Math.max(W, H) * 0.95)
        gr.addColorStop(0, `rgba(172,136,78,${0.7 * dk})`)
        gr.addColorStop(1, 'rgba(150,120,70,0)')
        g.fillStyle = gr
        g.fillRect(0, 0, W, H)
        shakeBars(g, W, H, dk * 16)
      }
      break
    }
    // 涉水而入：底部水波纹退去
    case 'wade': {
      g.fillStyle = `rgba(6,10,12,${clamp01(1 - smooth(p / 0.35))})`
      g.fillRect(0, 0, W, H)
      const top = H * (0.55 + smooth(p) * 0.6)
      if (top < H) {
        const gr = g.createLinearGradient(0, top, 0, H)
        gr.addColorStop(0, 'rgba(52,116,112,0.42)')
        gr.addColorStop(1, 'rgba(14,40,52,0.66)')
        g.fillStyle = gr
        g.fillRect(0, top, W, H - top)
        for (let i = 0; i < 16; i++) {
          const y = H - ((hash(i, 11) + tt * 0.55) % 1) * (H - top)
          if (y < top) continue
          g.fillStyle = `rgba(170,232,222,${0.05 + 0.1 * hash(i, 12)})`
          g.fillRect(0, y, W, 2)
        }
        g.fillStyle = 'rgba(186,236,228,0.4)'
        for (let x = 0; x < W; x += 8) g.fillRect(x, top + Math.sin(x * 0.02 + tt * 4) * 3, 8, 2)
      }
      break
    }
    // 匍匐钻入：从一道横向窄缝缓缓张开
    case 'crawl': {
      const open = smooth(p)
      const bar = ((1 - (0.05 + open * 0.95)) / 2) * H
      g.fillStyle = '#07070a'
      g.fillRect(0, 0, W, bar)
      g.fillRect(0, H - bar, W, bar)
      const soft = Math.min(48, H * 0.06)
      const g1 = g.createLinearGradient(0, bar, 0, bar + soft)
      g1.addColorStop(0, 'rgba(7,7,10,0.9)')
      g1.addColorStop(1, 'rgba(7,7,10,0)')
      g.fillStyle = g1
      g.fillRect(0, bar, W, soft)
      const g2 = g.createLinearGradient(0, H - bar, 0, H - bar - soft)
      g2.addColorStop(0, 'rgba(7,7,10,0.9)')
      g2.addColorStop(1, 'rgba(7,7,10,0)')
      g.fillStyle = g2
      g.fillRect(0, H - bar - soft, W, soft)
      g.fillStyle = `rgba(6,6,8,${0.5 * (1 - open)})`
      g.fillRect(0, 0, W, H)
      break
    }
    // 走入：黑场简单淡开
    case 'step': {
      g.fillStyle = `rgba(8,8,9,${1 - smooth(p)})`
      g.fillRect(0, 0, W, H)
      break
    }
    // 破水而出：水膜从画面上滑落 + 残留水滴
    case 'surface': {
      g.fillStyle = `rgba(6,12,14,${clamp01(1 - smooth(p / 0.3))})`
      g.fillRect(0, 0, W, H)
      const top = smooth(p) * H * 1.25 - H * 0.05
      if (top < H) {
        const gr = g.createLinearGradient(0, top, 0, H)
        gr.addColorStop(0, 'rgba(158,224,216,0.34)')
        gr.addColorStop(0.25, 'rgba(46,120,120,0.42)')
        gr.addColorStop(1, 'rgba(16,52,66,0.55)')
        g.fillStyle = gr
        g.fillRect(0, Math.max(0, top), W, H - Math.max(0, top))
        if (top > 0) {
          g.fillStyle = 'rgba(204,246,240,0.5)'
          for (let x = 0; x < W; x += 6) g.fillRect(x, top + Math.sin(x * 0.035 + tt * 6) * 5, 6, 3)
        }
      }
      const dropA = 0.32 * (1 - smooth((p - 0.25) / 0.75))
      if (dropA > 0.01) {
        for (let i = 0; i < 22; i++) {
          const dx = hash(i, 13) * W
          const dy = hash(i, 14) * H * 0.85 + smooth(Math.max(0, p - hash(i, 15) * 0.5)) * H * 0.4
          if (dy > H) continue
          const r = 3 + hash(i, 16) * 9
          const gr2 = g.createRadialGradient(dx - r * 0.3, dy - r * 0.3, 1, dx, dy, r)
          gr2.addColorStop(0, `rgba(226,246,244,${dropA})`)
          gr2.addColorStop(1, 'rgba(120,180,186,0)')
          g.fillStyle = gr2
          g.beginPath()
          g.arc(dx, dy, r, 0, Math.PI * 2)
          g.fill()
        }
      }
      break
    }
    // 陷入黑暗：不淡开，保持近全黑，只在中心留一点极弱辉光后收掉
    case 'dark': {
      const hold = 0.74
      const a = p < hold ? 0.94 : 0.94 * (1 - smooth((p - hold) / (1 - hold)))
      g.fillStyle = `rgba(4,4,5,${a})`
      g.fillRect(0, 0, W, H)
      const gp = p < 0.42 ? smooth(p / 0.3) : 1 - smooth((p - 0.42) / 0.4)
      if (gp > 0.01) {
        const r = Math.max(10, Math.min(W, H) * (0.3 - 0.2 * p))
        const gr = g.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, r)
        gr.addColorStop(0, `rgba(232,185,60,${0.12 * gp})`)
        gr.addColorStop(1, 'rgba(232,185,60,0)')
        g.fillStyle = gr
        g.fillRect(0, 0, W, H)
      }
      break
    }
  }
}

export default function Cutscene(props: {
  kind: CutKind
  cutIn?: CutIn
  toName?: string
  caption?: string
  onDone?: () => void
}): JSX.Element {
  const { kind, cutIn, toName, caption, onDone } = props
  const ref = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'out' | 'card' | 'in'>('out')
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const hasCard = !!(caption || toName)

  useEffect(() => {
    const c = ref.current!
    const g = c.getContext('2d')!
    const outD = OUT_DUR[kind]
    const cardD = hasCard ? CARD_DUR : 0
    const inKind: CutIn = cutIn ?? 'step'
    const inD = cutIn ? IN_DUR[cutIn] : 0.3 // 未指定切入时补一小段淡开，避免硬切
    const total = outD + cardD + inD
    let raf = 0
    let ph: 'out' | 'card' | 'in' = 'out'
    const fired: Record<string, boolean> = {}
    const once = (key: string, fn: () => void) => {
      if (fired[key]) return
      fired[key] = true
      fn()
    }

    // 扫描线图案（统一的录像带质感）
    const sl = document.createElement('canvas')
    sl.width = 1
    sl.height = 3
    const slg = sl.getContext('2d')!
    slg.fillStyle = 'rgba(0,0,0,0.24)'
    slg.fillRect(0, 2, 1, 1)
    const scanPat = g.createPattern(sl, 'repeat')

    // 切出起手音
    if (kind === 'glitch') audio.spark()
    else if (kind === 'noclip') { audio.spark(); audio.hit() }
    else if (kind === 'collapse') audio.hit()
    else if (kind === 'sink') audio.splash(0.9)
    else if (kind === 'fall') audio.swing()
    else if (kind === 'shutter' || kind === 'iris') audio.uiTick()

    const t0 = performance.now()
    const draw = (now: number) => {
      const t = (now - t0) / 1000
      const W = Math.max(1, window.innerWidth)
      const H = Math.max(1, window.innerHeight)
      if (c.width !== W || c.height !== H) {
        c.width = W
        c.height = H
      }
      if (t >= total) {
        g.clearRect(0, 0, W, H)
        doneRef.current?.()
        return
      }
      raf = requestAnimationFrame(draw)
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'

      if (t < outD) {
        g.clearRect(0, 0, W, H)
        drawOut(g, kind, clamp01(t / outD), t, W, H)
        if (kind === 'noclip' && t > outD * 0.6) once('fold', () => audio.hit())
        if (ph !== 'out') { ph = 'out'; setPhase('out') }
      } else if (t < outD + cardD) {
        // 字幕卡黑场：不清屏，直接在上一帧之上压黑（自然地从白/水/裂缝过渡到纯黑）
        g.fillStyle = `rgba(6,6,7,${0.3 + 0.7 * clamp01((t - outD) / 0.22)})`
        g.fillRect(0, 0, W, H)
        if (ph !== 'card') { ph = 'card'; setPhase('card') }
      } else {
        const p = clamp01((t - outD - cardD) / inD)
        g.clearRect(0, 0, W, H)
        drawIn(g, inKind, p, t, W, H)
        if (ph !== 'in') {
          ph = 'in'
          setPhase('in')
          if (inKind === 'wade') audio.swim()
          else if (inKind === 'surface') audio.splash(0.6)
        }
        if ((inKind === 'fall' || inKind === 'collapse') && p > 0.6) once('land', () => audio.hurt())
      }

      if (scanPat) {
        g.fillStyle = scanPat
        g.fillRect(0, 0, W, H)
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 55, pointerEvents: 'none' }}>
      <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {phase === 'card' && hasCard && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            animation: `cutCard ${CARD_DUR}s ease-in-out both`,
          }}
        >
          {caption && (
            <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.4em', color: 'var(--text-dim)' }}>
              {`——  ${caption}  ——`}
            </div>
          )}
          {toName && (
            <div style={{ fontFamily: MONO, fontSize: 19, letterSpacing: '0.32em', color: 'var(--exit)' }}>
              {toName}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes cutCard {
        0% { opacity: 0; filter: blur(3px); transform: scale(0.985) }
        26% { opacity: 1; filter: blur(0); transform: scale(1) }
        74% { opacity: 1; filter: blur(0); transform: scale(1) }
        100% { opacity: 0; filter: blur(2px); transform: scale(1.01) }
      }`}</style>
    </div>
  )
}
