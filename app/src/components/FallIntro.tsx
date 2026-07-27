// 开场动画（多段式，约 13s）：
//   ① 黑场 M.E.G. 档案打字机 → ② 深夜办公走廊（正常现实）→ ③ 异常渗入（墙纸泛黄/透视拉长）
//   → ④ no-clip 撕裂（RGB 分离 + 条带抽出 + 空间对折）→ ⑤ 无限坠落（穿过一层层黄房间）
//   → ⑥ 落地（潮湿 Berber 地毯）→ ⑦ LEVEL 0 标题卡 + 淡出
// 纯 Canvas2D 程序化绘制（无素材依赖）；点击或按任意键跳过；
// onReveal() 在淡出开始时调用一次，onDone() 在结束时调用一次（语义与旧版一致）。
import { useEffect, useRef } from 'react'
import { audio } from '@/game/audio'

// ---------------- 时间轴（秒）----------------
const T_L1 = 0.25 // 字幕第一行开始打字
const T_L2 = 1.5 // 字幕第二行开始打字
const T_HALL = 2.6 // 现实：深夜办公走廊
const T_WRONG = 5.6 // 异常渗入
const T_TEAR = 7.4 // no-clip 撕裂
const T_FALL = 8.4 // 无限坠落
const T_IMPACT = 11.2 // 落地
const T_TITLE = 11.95 // 标题卡
const T_FADE = 12.4 // 开始淡出（= onReveal）
const DUR = 13.0 // 结束（= onDone）

const LINE1 = '> 如果你不小心，在错误的地方剪辑出了现实……'
const LINE2 = '> 你会落进后室。'
const CPS = 21 // 打字速度（字/秒）
const MONO = "'JetBrains Mono', ui-monospace, monospace"
const SANS = "'Noto Sans SC', system-ui, sans-serif"

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (x: number) => {
  const k = clamp01(x)
  return k * k * (3 - 2 * k)
}
// 稳定伪随机（同一 (i,s) 永远同值）
const hash = (i: number, s: number) => {
  const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453
  return v - Math.floor(v)
}
const mixc = (a: number, b: number, k: number) => Math.round(a + (b - a) * k)

export default function FallIntro({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(false)
  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  useEffect(() => {
    const onKey = () => finish()
    window.addEventListener('keydown', onKey)
    const c = ref.current!
    const g = c.getContext('2d')!
    // 离屏「世界层」：先把场景画在这里，再做撕裂/扭曲等后期合成
    const sc = document.createElement('canvas')
    const sg = sc.getContext('2d')!
    // RGB 分离用的两个通道缓存
    const chA = document.createElement('canvas')
    const chB = document.createElement('canvas')
    let carpet: HTMLCanvasElement | null = null
    let grainPat: CanvasPattern | null = null
    let scanPat: CanvasPattern | null = null
    let raf = 0
    const t0 = performance.now()
    let prevT = 0
    let stepT = 0
    let lastTypeN = -1
    const fired: Record<string, boolean> = {}
    const once = (key: string, fn: () => void) => {
      if (fired[key]) return
      fired[key] = true
      fn()
    }

    // ---------------- VHS 噪点 / 扫描线图案（只建一次）----------------
    const buildPatterns = () => {
      const tile = document.createElement('canvas')
      tile.width = tile.height = 96
      const tg = tile.getContext('2d')!
      const img = tg.createImageData(96, 96)
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(90 + Math.random() * 165)
        img.data[i] = v
        img.data[i + 1] = v
        img.data[i + 2] = v
        img.data[i + 3] = Math.random() < 0.55 ? 255 : 140
      }
      tg.putImageData(img, 0, 0)
      grainPat = g.createPattern(tile, 'repeat')

      const sl = document.createElement('canvas')
      sl.width = 1
      sl.height = 3
      const slg = sl.getContext('2d')!
      slg.fillStyle = 'rgba(0,0,0,0.26)'
      slg.fillRect(0, 2, 1, 1)
      scanPat = g.createPattern(sl, 'repeat')
    }

    // ---------------- 把世界层染成单通道（用于 RGB 分离）----------------
    const tintTo = (dst: HTMLCanvasElement, color: string, W: number, H: number) => {
      if (dst.width !== W || dst.height !== H) {
        dst.width = W
        dst.height = H
      }
      const q = dst.getContext('2d')!
      q.setTransform(1, 0, 0, 1, 0, 0)
      q.globalAlpha = 1
      q.globalCompositeOperation = 'source-over'
      q.clearRect(0, 0, W, H)
      q.drawImage(sc, 0, 0)
      q.globalCompositeOperation = 'multiply'
      q.fillStyle = color
      q.fillRect(0, 0, W, H)
      q.globalCompositeOperation = 'source-over'
    }

    // ======================================================================
    // ① 黑场 + 打字机字幕
    // ======================================================================
    const drawTypeCard = (t: number, W: number, H: number) => {
      const n1 = Math.min(LINE1.length, Math.max(0, Math.floor((t - T_L1) * CPS)))
      const n2 = Math.min(LINE2.length, Math.max(0, Math.floor((t - T_L2) * CPS)))
      const fade = 1 - smooth((t - (T_HALL - 0.35)) / 0.35)
      if (fade <= 0.01) return
      const fs = Math.max(12, Math.min(20, Math.round(W / 46)))
      g.textAlign = 'left'
      g.textBaseline = 'alphabetic'
      g.font = `${fs}px ${MONO}`
      const w1 = g.measureText(LINE1).width
      const w2 = g.measureText(LINE2).width
      const x0 = W / 2 - Math.max(w1, w2) / 2
      const y1 = H * 0.46
      const y2 = y1 + fs * 2.1
      const s1 = LINE1.slice(0, n1)
      const s2 = LINE2.slice(0, n2)
      // 档案抬头
      g.font = `${Math.max(9, Math.round(fs * 0.58))}px ${MONO}`
      g.fillStyle = `rgba(138,130,102,${0.55 * fade})`
      g.fillText('M.E.G. // ARCHIVE 00 — THRESHOLD', x0, y1 - fs * 2.6)
      g.font = `${fs}px ${MONO}`
      g.fillStyle = `rgba(214,207,174,${0.92 * fade})`
      g.fillText(s1, x0, y1)
      if (t >= T_L2) g.fillText(s2, x0, y2)
      // 光标（打字中常亮，打完后闪烁）
      const onL2 = t >= T_L2
      const typing = onL2 ? n2 < LINE2.length : n1 < LINE1.length
      const blink = typing || Math.floor(t * 2.6) % 2 === 0
      if (blink) {
        const cxp = x0 + g.measureText(onL2 ? s2 : s1).width
        const cy = onL2 ? y2 : y1
        g.fillStyle = `rgba(232,185,60,${0.85 * fade})`
        g.fillRect(cxp + 2, cy - fs * 0.82, fs * 0.5, fs * 0.95)
      }
    }

    // ======================================================================
    // ②③ 现实：深夜荧光灯办公走廊（wrong>0 时开始异常化）
    // ======================================================================
    const applyYellow = (wrong: number, W: number, H: number) => {
      const k = Math.min(1, wrong)
      if (k <= 0.01) return
      const er = mixc(255, 201, k)
      const eg = mixc(255, 180, k)
      const eb = mixc(255, 88, k)
      const gr = sg.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.08, W / 2, H * 0.5, Math.hypot(W, H) * 0.56)
      gr.addColorStop(0, 'rgb(255,255,255)')
      gr.addColorStop(0.42, `rgb(${mixc(255, er, 0.45)},${mixc(255, eg, 0.45)},${mixc(255, eb, 0.45)})`)
      gr.addColorStop(1, `rgb(${er},${eg},${eb})`)
      sg.globalCompositeOperation = 'multiply'
      sg.fillStyle = gr
      sg.fillRect(0, 0, W, H)
      sg.globalCompositeOperation = 'source-over'
    }

    // 墙纸从边缘剥落
    const drawPeel = (wrong: number, t: number, W: number, H: number) => {
      const k = Math.min(1, wrong)
      if (k <= 0.03) return
      for (let i = 0; i < 10; i++) {
        const right = i % 2 === 1
        const y = (hash(i, 11) * 1.1 - 0.05) * H
        const hgt = (0.06 + hash(i, 12) * 0.17) * H
        const w = (0.03 + hash(i, 13) * 0.11) * W * k * (0.7 + 0.3 * Math.sin(t * 1.9 + i))
        if (w < 2) continue
        const x = right ? W : 0
        const d = right ? -1 : 1
        sg.beginPath()
        sg.moveTo(x, y)
        sg.lineTo(x + d * w, y + hgt * 0.26)
        sg.lineTo(x + d * w * 0.7, y + hgt * 0.74)
        sg.lineTo(x, y + hgt)
        sg.closePath()
        sg.fillStyle = `rgba(201,180,88,${0.45 + 0.5 * k})`
        sg.fill()
        sg.strokeStyle = `rgba(236,220,152,${0.45 * k})`
        sg.lineWidth = 2
        sg.stroke()
        // 卷起后露出的暗层
        sg.beginPath()
        sg.moveTo(x + d * w, y + hgt * 0.26)
        sg.lineTo(x + d * w * 1.32, y + hgt * 0.44)
        sg.lineTo(x + d * w * 0.7, y + hgt * 0.74)
        sg.closePath()
        sg.fillStyle = `rgba(58,48,24,${0.5 * k})`
        sg.fill()
      }
    }

    const drawHall = (t: number, wrong: number, W: number, H: number) => {
      const cx = W / 2
      const walk = t - T_HALL
      const bob = Math.sin(walk * 6.2) * 2.4
      const roll = Math.sin(walk * 3.1) * 0.004 + (wrong > 0 ? Math.sin(walk * 11) * 0.006 * wrong : 0)
      const hy = H * 0.47 + bob
      const stretch = wrong * wrong * 2.6 // 尽头被拉长
      const f = H * 0.9 * (1 + stretch * 0.45)
      const hw = 1.8
      const ceilH = 1.3
      const floorH = 1.5
      const dN = 0.8
      const dF = 20 + stretch * 55
      const camZ = walk * 2.4
      const px = (x: number, d: number) => cx + (x * f) / d
      const py = (y: number, d: number) => hy - (y * f) / d

      sg.save()
      sg.translate(cx, hy)
      sg.rotate(roll)
      sg.translate(-cx, -hy)

      sg.fillStyle = '#15181a'
      sg.fillRect(-W, -H, W * 3, H * 3)

      const xLn = px(-hw, dN)
      const xLf = px(-hw, dF)
      const xRn = px(hw, dN)
      const xRf = px(hw, dF)
      const yCn = py(ceilH, dN)
      const yCf = py(ceilH, dF)
      const yFn = py(-floorH, dN)
      const yFf = py(-floorH, dF)
      const yPn = py(-0.08, dN)
      const yPf = py(-0.08, dF)

      const quad = (
        ax: number, ay: number, bx: number, by: number,
        cx2: number, cy2: number, dx2: number, dy2: number, fill: string,
      ) => {
        sg.beginPath()
        sg.moveTo(ax, ay)
        sg.lineTo(bx, by)
        sg.lineTo(cx2, cy2)
        sg.lineTo(dx2, dy2)
        sg.closePath()
        sg.fillStyle = fill
        sg.fill()
      }
      // 走廊尽头的墙
      sg.fillStyle = '#3f4548'
      sg.fillRect(xLf, yCf, xRf - xLf, yFf - yCf)
      // 天花板 / 地面 / 两侧墙（四个面沿真实棱线拼接，互不重叠）
      quad(xLn, yCn, xRn, yCn, xRf, yCf, xLf, yCf, '#c3c8ca')
      quad(xLn, yFn, xRn, yFn, xRf, yFf, xLf, yFf, '#474d52')
      quad(xLn, yCn, xLf, yCf, xLf, yFf, xLn, yFn, '#a9aeb0')
      quad(xRn, yCn, xRf, yCf, xRf, yFf, xRn, yFn, '#9ea3a6')
      // 办公隔断（下半截布面）
      quad(xLn, yPn, xLf, yPf, xLf, yFf, xLn, yFn, '#8d8b81')
      quad(xRn, yPn, xRf, yPf, xRf, yFf, xRn, yFn, '#847f76')
      sg.strokeStyle = 'rgba(58,56,50,0.6)'
      sg.lineWidth = 2
      sg.beginPath()
      sg.moveTo(xLn, yPn)
      sg.lineTo(xLf, yPf)
      sg.moveTo(xRn, yPn)
      sg.lineTo(xRf, yPf)
      sg.stroke()

      // 纵深细节：地毯拼缝 / 天花龙骨 / 隔断竖缝（向观察者移动）
      const SP = 2.2
      const off = camZ % SP
      for (let k = 1; k <= 14; k++) {
        const d = k * SP - off
        if (d <= dN) continue
        if (d > dF) break
        const xa = px(-hw, d)
        const xb = px(hw, d)
        const a = clamp01(1 - d / (dF * 0.9)) * 0.5
        const th = Math.max(1, (f / d) * 0.02)
        sg.fillStyle = `rgba(26,30,34,${a})`
        sg.fillRect(xa, py(-floorH, d), xb - xa, th)
        sg.fillStyle = `rgba(126,134,138,${a})`
        sg.fillRect(xa, py(ceilH, d), xb - xa, th)
        const wd = Math.max(1, (f / d) * 0.03)
        const hgt = py(-0.08, d) - py(-floorH, d)
        sg.fillStyle = `rgba(44,42,38,${a * 1.2})`
        sg.fillRect(xa, py(-floorH, d), wd, hgt)
        sg.fillRect(xb - wd, py(-floorH, d), wd, hgt)
      }

      // 头顶一排荧光灯管（向后掠过）+ 地面光池
      const TSP = 3.3
      const toff = camZ % TSP
      for (let k = 1; k <= 9; k++) {
        const d = k * TSP - toff
        if (d <= dN * 1.15) continue
        if (d > dF) break
        const s = f / d
        const half = 0.62 * s
        const ty = hy - (ceilH - 0.03) * s
        const th = Math.max(1.2, 0.11 * s)
        let br = 0.95
        if (wrong > 0.12) {
          const fl = hash(k, Math.floor(t * (6 + wrong * 30)))
          br = fl < 0.16 * wrong ? 0.12 + fl : 0.95
        }
        const gr = sg.createRadialGradient(cx, ty, 1, cx, ty, Math.max(8, half * 1.9))
        gr.addColorStop(0, `rgba(236,244,255,${0.3 * br})`)
        gr.addColorStop(1, 'rgba(236,244,255,0)')
        sg.fillStyle = gr
        sg.fillRect(cx - half * 2, ty - half * 1.3, half * 4, half * 2.8)
        sg.fillStyle = `rgba(244,249,255,${br})`
        sg.fillRect(cx - half, ty, half * 2, th)
        const fy = hy + floorH * s
        const pg = sg.createRadialGradient(cx, fy, 1, cx, fy, Math.max(10, 1.5 * s))
        pg.addColorStop(0, `rgba(226,236,246,${0.16 * br})`)
        pg.addColorStop(1, 'rgba(226,236,246,0)')
        sg.fillStyle = pg
        sg.fillRect(cx - 1.8 * s, fy - 0.65 * s, 3.6 * s, 1.3 * s)
      }
      sg.restore()

      applyYellow(wrong, W, H)
      drawPeel(wrong, t, W, H)
    }

    // ======================================================================
    // ④ no-clip 撕裂：RGB 分离 + 条带抽出 + 空间对折
    // ======================================================================
    const compositeWarp = (amp: number, t: number, W: number, H: number) => {
      g.drawImage(sc, 0, 0)
      if (amp < 0.6) return
      const bands = 40
      const bh = Math.ceil(H / bands)
      for (let i = 0; i < bands; i++) {
        const y = i * bh
        const sh = Math.min(bh, H - y)
        if (sh <= 0) break
        const dx = Math.sin(y * 0.016 + t * 2.6) * amp + Math.sin(y * 0.0045 - t * 1.4) * amp * 0.55
        g.drawImage(sc, 0, y, W, sh, dx, y, W, sh)
      }
    }

    const drawGlitch = (W: number, H: number, split: number, tear: number, fr: number) => {
      const bands = 16
      const bh = Math.ceil(H / bands)
      g.fillStyle = '#000'
      g.fillRect(0, 0, W, H)
      g.globalCompositeOperation = 'lighter'
      for (let i = 0; i < bands; i++) {
        const y = i * bh
        const sh = Math.min(bh, H - y)
        if (sh <= 0) break
        const strong = hash(i, fr) > 0.62
        const off = (hash(i, fr + 3) - 0.5) * 2 * W * tear * (strong ? 0.55 : 0.1)
        g.drawImage(chA, 0, y, W, sh, off + split, y, W, sh)
        g.drawImage(chB, 0, y, W, sh, off - split, y, W, sh)
      }
      g.globalCompositeOperation = 'source-over'
      // 扫描线跳动
      for (let i = 0; i < 3; i++) {
        const y = hash(fr, 50 + i) * H
        g.fillStyle = `rgba(255,255,255,${0.1 + hash(fr, 60 + i) * 0.18})`
        g.fillRect(0, y, W, 1 + hash(fr, 70 + i) * 5)
      }
    }

    // 空间对折：上下半部互相镜像并向中缝挤压
    const drawFold = (W: number, H: number, k: number, split: number) => {
      g.fillStyle = '#000'
      g.fillRect(0, 0, W, H)
      const h = H / 2
      const sq = h * 0.6 * k
      g.globalCompositeOperation = 'lighter'
      g.drawImage(chA, 0, 0, W, h, split, sq, W, h - sq)
      g.drawImage(chB, 0, 0, W, h, -split, sq, W, h - sq)
      g.save()
      g.translate(0, H)
      g.scale(1, -1)
      g.drawImage(chA, 0, 0, W, h, -split, sq, W, h - sq)
      g.drawImage(chB, 0, 0, W, h, split, sq, W, h - sq)
      g.restore()
      g.globalCompositeOperation = 'source-over'
      g.fillStyle = `rgba(255,250,222,${0.25 + 0.6 * k})`
      g.fillRect(0, H / 2 - 1.5, W, 3)
    }

    // ======================================================================
    // ⑤ 无限坠落：一层又一层的黄色房间向上掠过
    // ======================================================================
    const drawRoomBand = (y0: number, RH: number, W: number, H: number, id: number, p: number) => {
      if (y0 > H + 4 || y0 + RH < -4) return
      const dim = 1 - Math.min(0.55, p * 0.55)
      // 黄墙纸
      sg.fillStyle = `rgb(${Math.round(201 * dim)},${Math.round(180 * dim)},${Math.round(88 * dim)})`
      sg.fillRect(0, y0, W, RH)
      const stripe = Math.max(12, W / 46)
      sg.fillStyle = 'rgba(0,0,0,0.06)'
      for (let x = (id * 7) % stripe; x < W; x += stripe) sg.fillRect(x, y0, Math.max(1, stripe * 0.16), RH)
      // 房间纵深（中间更暗）
      const mg = sg.createLinearGradient(0, 0, W, 0)
      mg.addColorStop(0, 'rgba(0,0,0,0)')
      mg.addColorStop(0.5, 'rgba(22,15,4,0.4)')
      mg.addColorStop(1, 'rgba(0,0,0,0)')
      sg.fillStyle = mg
      sg.fillRect(0, y0, W, RH)
      // 一排荧光灯
      const ly = y0 + RH * 0.08
      const lh = Math.max(2, RH * 0.022)
      for (let k = 0; k < 3; k++) {
        const lx = W * (0.14 + k * 0.26)
        const lw = W * 0.18
        const gr = sg.createRadialGradient(lx + lw / 2, ly + lh / 2, 1, lx + lw / 2, ly + lh / 2, lw * 0.95)
        gr.addColorStop(0, `rgba(250,248,214,${0.42 * dim})`)
        gr.addColorStop(1, 'rgba(250,248,214,0)')
        sg.fillStyle = gr
        sg.fillRect(lx - lw * 0.5, ly - lw * 0.5, lw * 2, lw * 1.1)
        sg.fillStyle = `rgba(252,250,226,${0.92 * dim})`
        sg.fillRect(lx, ly, lw, lh)
      }
      // 潮湿地毯地面边缘 + 踢脚线 + 落下去的洞
      const fy = y0 + RH * 0.82
      const fh = RH * 0.18
      sg.fillStyle = `rgb(${Math.round(122 * dim)},${Math.round(112 * dim)},${Math.round(86 * dim)})`
      sg.fillRect(0, fy, W, fh)
      for (let k = 0; k < 4; k++) {
        const sx = hash(id * 5 + k, 3) * W
        const sw = (0.05 + hash(id + k, 4) * 0.12) * W
        sg.fillStyle = 'rgba(46,38,24,0.28)'
        sg.beginPath()
        sg.ellipse(sx, fy + fh * 0.55, sw, fh * 0.36, 0, 0, Math.PI * 2)
        sg.fill()
      }
      const bb = Math.max(2, RH * 0.012)
      sg.fillStyle = 'rgba(40,32,14,0.5)'
      sg.fillRect(0, fy - bb, W, bb)
      sg.fillStyle = '#050505'
      sg.fillRect(W * 0.3, fy, W * 0.4, fh)
      const hg = sg.createLinearGradient(0, fy, 0, fy + fh)
      hg.addColorStop(0, 'rgba(0,0,0,0.9)')
      hg.addColorStop(1, 'rgba(0,0,0,0.25)')
      sg.fillStyle = hg
      sg.fillRect(W * 0.3, fy, W * 0.4, fh)
    }

    const drawFallScene = (p: number, W: number, H: number) => {
      const dist = (p * p * 26 + p * 2.2) * H
      const RH = Math.max(180, H * 0.6)
      const base = dist % RH
      const id0 = Math.floor(dist / RH)
      sg.fillStyle = '#0a0906'
      sg.fillRect(0, 0, W, H)
      const n = Math.ceil(H / RH) + 2
      for (let i = -1; i <= n; i++) drawRoomBand(i * RH - base, RH, W, H, id0 + i, p)
      // 速度线
      const cnt = 26 + Math.floor(p * 46)
      for (let i = 0; i < cnt; i++) {
        const x = hash(i, 21) * W
        const y = ((hash(i, 22) + p * (3 + p * 12)) % 1) * (H + 400) - 200
        const len = 30 + p * p * H * 0.55
        sg.fillStyle = `rgba(226,222,196,${0.08 + 0.3 * p})`
        sg.fillRect(x, y, 1 + p * 1.5, len)
      }
      // 四周渐暗
      const vg = sg.createRadialGradient(
        W / 2, H / 2, Math.min(W, H) * (0.42 - 0.3 * p),
        W / 2, H / 2, Math.max(W, H) * (0.74 - 0.2 * p),
      )
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, `rgba(0,0,0,${0.55 + 0.42 * p})`)
      sg.fillStyle = vg
      sg.fillRect(0, 0, W, H)
    }

    // ======================================================================
    // ⑥ 落地：潮湿的 Berber 地毯
    // ======================================================================
    const buildCarpet = (W: number, H: number) => {
      const cv = document.createElement('canvas')
      cv.width = W
      cv.height = H
      const q = cv.getContext('2d')!
      q.fillStyle = '#a89878'
      q.fillRect(0, 0, W, H)
      // 潮湿暗斑
      for (let i = 0; i < 10; i++) {
        const x = hash(i, 31) * W
        const y = H * (0.2 + hash(i, 32) * 0.85)
        const r = (0.1 + hash(i, 33) * 0.26) * Math.min(W, H)
        const gr = q.createRadialGradient(x, y, r * 0.1, x, y, r)
        gr.addColorStop(0, 'rgba(50,40,26,0.6)')
        gr.addColorStop(0.6, 'rgba(58,48,32,0.3)')
        gr.addColorStop(1, 'rgba(58,48,32,0)')
        q.fillStyle = gr
        q.fillRect(x - r, y - r, r * 2, r * 2)
      }
      // Berber 织点
      const N = Math.min(9000, Math.floor((W * H) / 300))
      for (let i = 0; i < N; i++) {
        const x = Math.random() * W
        const y = Math.random() * H
        const v = Math.random()
        q.fillStyle = v < 0.42 ? 'rgba(64,54,38,0.45)' : v < 0.76 ? 'rgba(214,202,172,0.4)' : 'rgba(140,124,94,0.45)'
        q.fillRect(x, y, 2, v < 0.5 ? 1 : 2)
      }
      const lg = q.createLinearGradient(0, 0, 0, H)
      lg.addColorStop(0, 'rgba(0,0,0,0.62)')
      lg.addColorStop(0.4, 'rgba(0,0,0,0.12)')
      lg.addColorStop(1, 'rgba(0,0,0,0.42)')
      q.fillStyle = lg
      q.fillRect(0, 0, W, H)
      return cv
    }

    const drawGround = (q: number, W: number, H: number) => {
      if (!carpet) carpet = buildCarpet(W, H)
      sg.fillStyle = '#0a0906'
      sg.fillRect(0, 0, W, H)
      const zoom = 1.16 - Math.min(0.16, q * 0.18)
      const dw = W * zoom
      const dh = H * zoom
      const dx = (W - dw) / 2
      const dy = (H - dh) / 2 + H * 0.06
      sg.drawImage(carpet, dx, dy, dw, dh)
      // 刚落地时的失焦（叠加位移副本近似）
      const blur = Math.max(0, 1 - q / 0.7)
      if (blur > 0.02) {
        sg.globalAlpha = 0.4 * blur
        sg.drawImage(carpet, dx - 7, dy + 6, dw, dh)
        sg.drawImage(carpet, dx + 7, dy - 6, dw, dh)
        sg.globalAlpha = 1
      }
      // 画面上方：黄墙 + 荧光灯余光
      const wh = H * 0.2
      sg.fillStyle = '#b8a44e'
      sg.fillRect(0, 0, W, wh)
      const gr = sg.createLinearGradient(0, 0, 0, wh * 1.7)
      gr.addColorStop(0, 'rgba(250,246,206,0.5)')
      gr.addColorStop(1, 'rgba(250,246,206,0)')
      sg.fillStyle = gr
      sg.fillRect(0, 0, W, wh * 1.7)
      const bb = Math.max(2, H * 0.006)
      sg.fillStyle = 'rgba(40,32,14,0.55)'
      sg.fillRect(0, wh - bb, W, bb)
    }

    // ======================================================================
    // 文字 / 全局叠加
    // ======================================================================
    const subtitle = (text: string, rgb: string, a: number, W: number, H: number) => {
      if (a <= 0.01) return
      const fs = Math.max(13, Math.min(19, Math.round(W / 52)))
      g.font = `${fs}px ${SANS}`
      g.textAlign = 'center'
      g.textBaseline = 'alphabetic'
      const y = H * 0.845
      const w = g.measureText(text).width
      g.fillStyle = `rgba(0,0,0,${0.4 * a})`
      g.fillRect(W / 2 - w / 2 - 14, y - fs - 8, w + 28, fs + 18)
      g.fillStyle = `rgba(${rgb},${a})`
      g.fillText(text, W / 2, y)
    }

    const drawTitle = (t: number, W: number, H: number) => {
      const a = smooth((t - T_TITLE) / 0.45)
      if (a <= 0.01) return
      const big = Math.max(22, Math.min(46, Math.round(W / 24)))
      g.textAlign = 'center'
      g.textBaseline = 'alphabetic'
      g.font = `${big}px ${MONO}`
      g.fillStyle = `rgba(232,185,60,${a})`
      g.fillText('L E V E L   0', W / 2, H * 0.44)
      g.font = `${Math.round(big * 0.46)}px ${MONO}`
      g.fillStyle = `rgba(214,207,174,${a * 0.8})`
      g.fillText('T H R E S H O L D', W / 2, H * 0.44 + big * 0.98)
      g.font = `${Math.max(12, Math.round(W / 68))}px ${SANS}`
      g.fillStyle = `rgba(138,130,102,${a * 0.95})`
      g.fillText('——你摔在了潮湿的地毯上。荧光灯在嗡嗡作响。', W / 2, H * 0.44 + big * 2.05)
    }

    const drawSkip = (t: number, W: number, H: number) => {
      const a = 0.34 * (1 - smooth((t - T_FADE) / 0.3)) * (0.75 + 0.25 * Math.sin(t * 1.7))
      if (a <= 0.01) return
      g.textAlign = 'right'
      g.textBaseline = 'alphabetic'
      g.font = `${Math.max(10, Math.round(W / 100))}px ${SANS}`
      g.fillStyle = `rgba(138,130,102,${a})`
      g.fillText('点击或按任意键跳过', W - 18, H - 16)
    }

    const overlays = (t: number, W: number, H: number) => {
      if (scanPat) {
        g.fillStyle = scanPat
        g.fillRect(0, 0, W, H)
      }
      if (grainPat) {
        g.save()
        g.translate(-Math.floor(Math.random() * 90), -Math.floor(Math.random() * 90))
        g.globalAlpha = 0.055
        g.fillStyle = grainPat
        g.fillRect(0, 0, W + 96, H + 96)
        g.restore()
      }
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72)
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, 'rgba(0,0,0,0.55)')
      g.fillStyle = vg
      g.fillRect(0, 0, W, H)
      // 偶发录像带跳带
      const fr = Math.floor(t * 12)
      if (hash(fr, 77) < 0.06) {
        g.fillStyle = 'rgba(255,255,255,0.06)'
        g.fillRect(0, hash(fr, 78) * H, W, 2 + hash(fr, 79) * 6)
      }
    }

    // ======================================================================
    // 主循环
    // ======================================================================
    const draw = (now: number) => {
      const t = (now - t0) / 1000
      if (t >= DUR) {
        finish()
        return
      }
      raf = requestAnimationFrame(draw)
      const dt = Math.min(0.05, Math.max(0, t - prevT))
      prevT = t
      const W = Math.max(1, window.innerWidth)
      const H = Math.max(1, window.innerHeight)
      if (c.width !== W || c.height !== H) {
        c.width = W
        c.height = H
      }
      if (sc.width !== W || sc.height !== H) {
        sc.width = W
        sc.height = H
        carpet = null
      }
      if (!grainPat) buildPatterns()

      // ---------- 音效提示 ----------
      if (t < T_HALL) {
        const n =
          Math.min(LINE1.length, Math.max(0, Math.floor((t - T_L1) * CPS))) +
          Math.min(LINE2.length, Math.max(0, Math.floor((t - T_L2) * CPS)))
        if (n !== lastTypeN) {
          if (n > lastTypeN && n % 3 === 0) audio.uiTick()
          lastTypeN = n
        }
      }
      if (t >= T_HALL && t < T_TEAR) {
        stepT -= dt
        if (stepT <= 0) {
          stepT = 0.5
          audio.footstep('concrete')
        }
      }
      if (t >= T_WRONG) once('w1', () => audio.whisper(0.8))
      if (t >= T_WRONG + 0.9) once('w2', () => audio.whisper(1.1))
      if (t >= T_TEAR) once('tear1', () => { audio.spark(); audio.hit() })
      if (t >= T_TEAR + 0.35) once('tear2', () => audio.spark())
      if (t >= T_TEAR + 0.72) once('tear3', () => { audio.hit(); audio.whisper(1.4) })
      if (t >= T_FALL) once('fall', () => audio.swing())
      if (t >= T_FALL + 0.6) once('f1', () => audio.whisper(1.2))
      if (t >= T_FALL + 1.3) once('f2', () => { audio.whisper(1.6); audio.swing() })
      if (t >= T_FALL + 2.1) once('f3', () => audio.whisper(2))
      if (t >= T_IMPACT) once('imp', () => { audio.hurt(); audio.splash(0.45); audio.footstep('carpet') })
      if (t >= T_FADE) once('reveal', onReveal) // 淡出开始 = 进入游戏

      // ---------- 震屏 ----------
      let shX = 0
      let shY = 0
      if (t >= T_IMPACT && t < T_IMPACT + 0.55) {
        const k = 1 - (t - T_IMPACT) / 0.55
        shX = (Math.random() - 0.5) * 36 * k * k
        shY = (Math.random() - 0.5) * 36 * k * k
      } else if (t >= T_WRONG && t < T_TEAR) {
        const k = (t - T_WRONG) / (T_TEAR - T_WRONG)
        shX = (Math.random() - 0.5) * 5 * k
        shY = (Math.random() - 0.5) * 4 * k
      }

      // ---------- 世界层 ----------
      sg.setTransform(1, 0, 0, 1, 0, 0)
      sg.globalAlpha = 1
      sg.globalCompositeOperation = 'source-over'
      sg.fillStyle = '#000'
      sg.fillRect(0, 0, W, H)

      // ---------- 主画布 ----------
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
      g.fillStyle = '#000'
      g.fillRect(0, 0, W, H)
      g.save()
      g.translate(shX, shY)

      if (t < T_HALL) {
        // ① 黑场（世界层保持纯黑）
      } else if (t < T_TEAR) {
        // ②③ 走廊 + 异常渗入
        const wrong = t < T_WRONG ? 0 : smooth((t - T_WRONG) / (T_TEAR - T_WRONG))
        drawHall(t, wrong, W, H)
        compositeWarp(wrong * wrong * 20, t, W, H)
        const fin = 1 - smooth((t - T_HALL) / 0.5)
        if (fin > 0.01) {
          g.fillStyle = `rgba(0,0,0,${fin})`
          g.fillRect(0, 0, W, H)
        }
      } else if (t < T_FALL) {
        // ④ no-clip 撕裂
        const k = (t - T_TEAR) / (T_FALL - T_TEAR)
        drawHall(t, 1 + k * 0.7, W, H)
        if (k > 0.5) {
          sg.fillStyle = `rgba(0,0,0,${smooth((k - 0.5) / 0.5) * 0.9})`
          sg.fillRect(0, 0, W, H)
        }
        const fr = Math.floor(t * 30)
        const black = (k > 0.27 && k < 0.315) || (k > 0.55 && k < 0.585) || hash(fr, 41) < 0.05
        const fold = k > 0.62 ? smooth((k - 0.62) / 0.28) : 0
        if (black) {
          g.fillStyle = '#000'
          g.fillRect(0, 0, W, H)
        } else {
          tintTo(chA, '#ff2a2a', W, H)
          tintTo(chB, '#2affff', W, H)
          const split = (5 + hash(fr, 42) * 22) * (0.5 + k)
          if (fold > 0) drawFold(W, H, fold, split * 0.7)
          else drawGlitch(W, H, split, 0.05 + k * 0.75, fr)
        }
        if (k > 0.88) {
          g.fillStyle = `rgba(0,0,0,${smooth((k - 0.88) / 0.12)})`
          g.fillRect(0, 0, W, H)
        }
      } else if (t < T_IMPACT) {
        // ⑤ 无限坠落
        const p = (t - T_FALL) / (T_IMPACT - T_FALL)
        drawFallScene(p, W, H)
        g.drawImage(sc, 0, 0)
        const smear = p * p * H * 0.05
        if (smear > 1) {
          g.globalAlpha = 0.32
          g.drawImage(sc, 0, -smear)
          g.drawImage(sc, 0, smear)
          g.globalAlpha = 1
        }
        const fin = 1 - smooth(p / 0.08)
        if (fin > 0.01) {
          g.fillStyle = `rgba(0,0,0,${fin})`
          g.fillRect(0, 0, W, H)
        }
      } else {
        // ⑥ 落地
        const q = t - T_IMPACT
        drawGround(q, W, H)
        g.drawImage(sc, 0, 0)
        if (q < 0.4) {
          g.fillStyle = `rgba(250,244,196,${0.95 * (1 - q / 0.4)})`
          g.fillRect(0, 0, W, H)
        }
      }
      g.restore()

      // ---------- 叠加层 ----------
      overlays(t, W, H)
      if (t < T_HALL) drawTypeCard(t, W, H)
      if (t >= T_HALL + 0.4 && t < T_WRONG + 0.15) {
        const a = Math.min(1, (t - (T_HALL + 0.4)) / 0.5, (T_WRONG + 0.15 - t) / 0.4)
        subtitle('你加班到很晚。走廊比记忆里长了一点。', '214,207,174', a * 0.92, W, H)
      }
      if (t >= T_WRONG + 0.3 && t < T_TEAR) {
        const a = Math.min(1, (t - (T_WRONG + 0.3)) / 0.35, (T_TEAR - t) / 0.35)
        subtitle('墙的颜色不对。', '179,53,43', a, W, H)
      }
      if (t >= T_TITLE) drawTitle(t, W, H)
      drawSkip(t, W, H)

      // ---------- 结尾淡出（露出底下的 3D 画面）----------
      c.style.opacity = String(t >= T_FADE ? Math.max(0, 1 - (t - T_FADE) / (DUR - T_FADE)) : 1)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <canvas
      ref={ref}
      className="fixed inset-0 z-50"
      style={{ cursor: 'pointer', background: '#000' }}
      onClick={finish}
    />
  )
}
