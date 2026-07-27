// 程序化贴图工厂：涂鸦/贴花/标牌/仪表盘/油画等（确定性种子）
import * as THREE from 'three'
import { makeCanvasCtx, toTex, ageCanvas, mulberry } from './shared'

// ---------- 涂鸦程序化贴图（≥8 变种，透明底）----------
export const graffitiTexCache: THREE.CanvasTexture[] = []
export function graffitiTextures(): THREE.CanvasTexture[] {
  if (graffitiTexCache.length) return graffitiTexCache
  const mk = (paint: (g: CanvasRenderingContext2D, s: number, rng: () => number, ink: string) => void, ink0: string): THREE.CanvasTexture => {
    const s = 256
    const rng = mulberry(graffitiTexCache.length * 131071 + 7)
    const [c, g] = makeCanvasCtx(s, s)
    const inks = [ink0, '#1c1a16', '#5a1210', '#233042', '#3d4a2a']
    const ink = inks[Math.floor(rng() * inks.length)]
    paint(g, s, rng, ink)
    ageCanvas(g, s, s, rng, 110)
    return toTex(c)
  }
  const crayon = (g: CanvasRenderingContext2D, pts: [number, number][], color: string, w: number) => {
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1])
    g.stroke()
  }
  const text = (g: CanvasRenderingContext2D, t: string, x: number, y: number, px: number, color: string, rot = 0, font = 'bold') => {
    g.save(); g.translate(x, y); g.rotate(rot)
    g.font = `${font} ${px}px "Courier New", monospace`
    g.textAlign = 'center'; g.fillStyle = color
    g.fillText(t, 0, 0)
    g.restore()
  }
  // 0 箭头 THIS WAY
  graffitiTexCache.push(mk((g, s, rng, ink) => {
    g.save(); g.translate(s / 2, s / 2); g.rotate((rng() - 0.5) * 0.5)
    g.fillStyle = ink
    g.beginPath()
    g.moveTo(-70, -18); g.lineTo(20, -18); g.lineTo(20, -44); g.lineTo(80, 0); g.lineTo(20, 44); g.lineTo(20, 18); g.lineTo(-70, 18)
    g.closePath(); g.fill()
    g.restore()
    text(g, 'THIS WAY', s / 2, s - 42, 34, ink, (rng() - 0.5) * 0.2)
  }, '#5a1210'))
  // 1 眼睛
  graffitiTexCache.push(mk((g, s, rng, ink) => {
    g.strokeStyle = ink; g.lineWidth = 9
    g.beginPath(); g.ellipse(s / 2, s / 2, 86, 46, 0, 0, 7); g.stroke()
    g.fillStyle = ink
    g.beginPath(); g.arc(s / 2, s / 2, 30 + rng() * 8, 0, 7); g.fill()
    g.fillStyle = '#00000000'
    g.globalCompositeOperation = 'destination-out'
    g.beginPath(); g.arc(s / 2 + 8, s / 2 - 8, 10, 0, 7); g.fill()
    g.globalCompositeOperation = 'source-over'
    g.strokeStyle = ink; g.lineWidth = 4
    for (let i = 0; i < 5; i++) {
      const a = -0.6 + i * 0.3
      crayon(g, [[s / 2 + Math.cos(a - 1.2) * 60, s / 2 - 60], [s / 2 + Math.cos(a - 1.2) * 76, s / 2 - 78]], ink, 4)
    }
  }, '#1c1a16'))
  // 2 符文串
  graffitiTexCache.push(mk((g, s, rng, ink) => {
    for (let i = 0; i < 6; i++) {
      const cx = 34 + i * 38, cy = s / 2 + (rng() - 0.5) * 30
      const n = 3 + Math.floor(rng() * 3)
      for (let k = 0; k < n; k++) {
        crayon(g, [[cx + (rng() - 0.5) * 24, cy + (rng() - 0.5) * 34], [cx + (rng() - 0.5) * 24, cy + (rng() - 0.5) * 34]], ink, 5)
      }
      if (rng() < 0.5) { g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.stroke() }
    }
  }, '#233042'))
  // 3 WARNING 警告标语
  graffitiTexCache.push(mk((g, s, rng, ink) => {
    g.fillStyle = ink
    g.fillRect(18, 30, s - 36, 60)
    text(g, 'WARNING', s / 2, 74, 40, '#c9b458')
    text(g, 'DO NOT ENTER', s / 2, 140, 30, ink, (rng() - 0.5) * 0.1)
    text(g, 'LEVEL BREACHED', s / 2, 178, 20, ink, (rng() - 0.5) * 0.15)
  }, '#5a1210'))
  // 4 血手印
  graffitiTexCache.push(mk((g, s, rng, ink) => {
    g.fillStyle = ink
    const cx = s / 2 + (rng() - 0.5) * 40, cy = s / 2 + 20
    g.beginPath(); g.ellipse(cx, cy, 34, 44, (rng() - 0.5) * 0.4, 0, 7); g.fill()
    for (let i = 0; i < 5; i++) {
      const a = -1.9 + i * 0.42
      const fx = cx + Math.cos(a) * 40, fy = cy - 52 + Math.abs(i - 2) * 10
      g.beginPath(); g.ellipse(fx, fy, 9, 24 - Math.abs(i - 2) * 4, a + 1.57, 0, 7); g.fill()
    }
    // 向下拖拽血痕
    for (let i = 0; i < 4; i++) {
      const dx = cx - 24 + i * 16
      g.globalAlpha = 0.6
      g.fillRect(dx, cy + 30, 5, 20 + rng() * 60)
    }
    g.globalAlpha = 1
  }, '#6a100c'))
  // 5 DON'T MOVE
  graffitiTexCache.push(mk((g, s, rng, ink) => {
    text(g, "DON'T", s / 2, 96, 52, ink, (rng() - 0.5) * 0.12)
    text(g, 'MOVE', s / 2, 152, 52, ink, (rng() - 0.5) * 0.12)
    text(g, 'IT HEARS YOU', s / 2, 200, 19, ink, (rng() - 0.5) * 0.2)
  }, '#1c1a16'))
  // 6 儿童涂鸦（蜡笔太阳/火柴人/房子）
  graffitiTexCache.push(mk((g, s, rng) => {
    void s
    const cols = ['#b83a2e', '#2e6ab8', '#3a8a3a', '#c9a03a']
    // 太阳
    g.strokeStyle = cols[3]
    g.beginPath(); g.arc(52, 56, 22, 0, 7); g.stroke()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      crayon(g, [[52 + Math.cos(a) * 26, 56 + Math.sin(a) * 26], [52 + Math.cos(a) * 38, 56 + Math.sin(a) * 38]], cols[3], 4)
    }
    // 房子
    crayon(g, [[150, 130], [150, 80], [195, 52], [240, 80], [240, 130], [150, 130]], cols[0], 5)
    crayon(g, [[185, 130], [185, 100], [205, 100], [205, 130]], cols[1], 4)
    // 火柴人
    g.strokeStyle = cols[1]; g.lineWidth = 5
    g.beginPath(); g.arc(80, 160, 14, 0, 7); g.stroke()
    crayon(g, [[80, 174], [80, 215]], cols[1], 5)
    crayon(g, [[80, 188], [58, 202]], cols[1], 4)
    crayon(g, [[80, 188], [102, 202]], cols[1], 4)
    crayon(g, [[80, 215], [64, 244]], cols[1], 4)
    crayon(g, [[80, 215], [96, 244]], cols[1], 4)
    // 草地线
    crayon(g, [[20, 250], [70, 246], [130, 252], [200, 247], [245, 251]], cols[2], 4)
    void rng
  }, '#b83a2e'))
  // 7 M.E.G. 标记
  graffitiTexCache.push(mk((g, s, rng, ink) => {
    g.strokeStyle = ink; g.lineWidth = 7
    g.beginPath(); g.arc(s / 2, 100, 62, 0, 7); g.stroke()
    g.beginPath(); g.moveTo(s / 2, 48); g.lineTo(s / 2 + 46, 126); g.lineTo(s / 2 - 46, 126); g.closePath(); g.stroke()
    text(g, 'M.E.G.', s / 2, 196, 40, ink, (rng() - 0.5) * 0.08)
    text(g, 'BASE →', s / 2, 228, 22, ink, (rng() - 0.5) * 0.1)
  }, '#2e4a6a'))
  // 8 IT'S WATCHING + 小眼
  graffitiTexCache.push(mk((g, s, rng, ink) => {
    text(g, "IT'S", s / 2, 80, 44, ink, (rng() - 0.5) * 0.14)
    text(g, 'WATCHING', s / 2, 132, 44, ink, (rng() - 0.5) * 0.14)
    g.strokeStyle = ink; g.lineWidth = 5
    g.beginPath(); g.ellipse(s / 2, 190, 34, 17, 0, 0, 7); g.stroke()
    g.fillStyle = ink
    g.beginPath(); g.arc(s / 2, 190, 11, 0, 7); g.fill()
  }, '#3d4a2a'))
  // 9 笑脸（Smiler 风）
  graffitiTexCache.push(mk((g, s, rng, ink) => {
    g.strokeStyle = ink; g.lineWidth = 8
    g.beginPath(); g.arc(s / 2, s / 2, 70, 0.25, Math.PI - 0.25); g.stroke()
    g.fillStyle = ink
    g.beginPath(); g.arc(s / 2 - 30, s / 2 - 34, 9 + rng() * 4, 0, 7); g.fill()
    g.beginPath(); g.arc(s / 2 + 30, s / 2 - 34, 9 + rng() * 4, 0, 7); g.fill()
    // 牙
    g.lineWidth = 4
    for (let i = -3; i <= 3; i++) crayon(g, [[s / 2 + i * 17, s / 2 + 38], [s / 2 + i * 15, s / 2 + 56]], ink, 3)
  }, '#c9c2a8'))
  return graffitiTexCache
}

// ---------- 装饰贴花程序化贴图 ----------
// 墙纸剥落补丁
export function texPeel(seed: number): THREE.CanvasTexture {
  const rng = mulberry(seed)
  const s = 128
  const [c, g] = makeCanvasCtx(s, s)
  g.fillStyle = '#4a4032'
  g.beginPath()
  const cx = s / 2, cy = s / 2
  g.moveTo(cx + 40, cy)
  for (let a = 0.3; a < 6.6; a += 0.3) {
    const r = 34 + rng() * 22
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8)
  }
  g.closePath(); g.fill()
  g.fillStyle = '#33291e'
  g.beginPath(); g.ellipse(cx - 6, cy + 4, 22, 16, 0.3, 0, 7); g.fill()
  // 翘起的纸边
  g.strokeStyle = '#8a7a5a'; g.lineWidth = 5; g.lineCap = 'round'
  g.beginPath(); g.moveTo(cx + 20, cy - 28); g.quadraticCurveTo(cx + 44, cy - 10, cx + 34, cy + 16); g.stroke()
  ageCanvas(g, s, s, rng, 40)
  return toTex(c)
}
// 油渍 / 水渍
export function texStain(seed: number, wet: boolean): THREE.CanvasTexture {
  const rng = mulberry(seed)
  const s = 128
  const [c, g] = makeCanvasCtx(s, s)
  for (let i = 0; i < 7; i++) {
    const r = 14 + rng() * 34
    g.fillStyle = wet ? `rgba(18,26,30,${0.25 + rng() * 0.3})` : `rgba(12,10,8,${0.3 + rng() * 0.35})`
    g.beginPath(); g.ellipse(s / 2 + (rng() - 0.5) * 40, s / 2 + (rng() - 0.5) * 40, r, r * (0.6 + rng() * 0.4), rng() * 3, 0, 7); g.fill()
  }
  if (wet) {
    // 反光高光弧
    g.strokeStyle = 'rgba(200,220,230,0.5)'; g.lineWidth = 3
    g.beginPath(); g.ellipse(s / 2 - 8, s / 2 - 10, 26, 14, -0.4, 3.4, 5.2); g.stroke()
    g.strokeStyle = 'rgba(200,220,230,0.25)'
    g.beginPath(); g.ellipse(s / 2 + 12, s / 2 + 14, 18, 9, 0.5, 3.5, 5.0); g.stroke()
  }
  return toTex(c)
}
// 标牌（白字底牌）
export function texSign(seed: number, lines: string[], bg = '#3a3f46', fg = '#d8d2c0', border = '#d8d2c0'): THREE.CanvasTexture {
  const rng = mulberry(seed)
  const [c, g] = makeCanvasCtx(256, 160)
  g.fillStyle = bg; g.fillRect(0, 0, 256, 160)
  g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(8, 8, 240, 144)
  g.fillStyle = fg; g.textAlign = 'center'
  lines.forEach((ln, i) => {
    g.font = `bold ${lines.length > 1 ? 40 : 56}px "Courier New", monospace`
    g.fillText(ln, 128, lines.length > 1 ? 70 + i * 52 : 102)
  })
  ageCanvas(g, 256, 160, rng, 30)
  return toTex(c)
}
// 警示带（黄黑斜纹）
export function texCautionTape(seed: number): THREE.CanvasTexture {
  const rng = mulberry(seed)
  const [c, g] = makeCanvasCtx(256, 32)
  g.fillStyle = '#c9a03a'; g.fillRect(0, 0, 256, 32)
  g.fillStyle = '#1a1815'
  for (let x = -32; x < 288; x += 32) {
    g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 0); g.lineTo(x + 28, 0); g.lineTo(x + 12, 32); g.closePath(); g.fill()
  }
  g.fillStyle = '#1a1815'; g.textAlign = 'center'; g.font = 'bold 15px "Courier New", monospace'
  g.fillText('CAUTION', 128, 22)
  ageCanvas(g, 256, 32, rng, 14)
  return toTex(c)
}
// 压力表盘
export function texGaugeDial(seed: number): THREE.CanvasTexture {
  const rng = mulberry(seed)
  const s = 128
  const [c, g] = makeCanvasCtx(s, s)
  g.fillStyle = '#d8d2c0'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill()
  g.strokeStyle = '#2a2d30'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke()
  g.lineWidth = 3
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5
    g.strokeStyle = i > 7 ? '#a63a2e' : '#2a2d30'
    g.beginPath()
    g.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44)
    g.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52)
    g.stroke()
  }
  const na = Math.PI * 0.75 + rng() * Math.PI * 1.5
  g.strokeStyle = '#a63a2e'; g.lineWidth = 4
  g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(na) * 40, 64 + Math.sin(na) * 40); g.stroke()
  g.fillStyle = '#2a2d30'; g.beginPath(); g.arc(64, 64, 6, 0, 7); g.fill()
  g.font = 'bold 13px "Courier New", monospace'; g.textAlign = 'center'; g.fillStyle = '#2a2d30'
  g.fillText('kPa', 64, 96)
  ageCanvas(g, s, s, rng, 18)
  return toTex(c)
}
// 白板残留字迹
export function texWhiteboard(seed: number): THREE.CanvasTexture {
  const rng = mulberry(seed)
  const [c, g] = makeCanvasCtx(256, 192)
  g.fillStyle = '#b8b8b2'; g.fillRect(0, 0, 256, 192)
  g.strokeStyle = '#6a6a66'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 186)
  g.globalAlpha = 0.45
  const inks = ['#3a4a6a', '#6a3a3a', '#3a5a3a']
  for (let i = 0; i < 6; i++) {
    const y = 36 + i * 26, ink = inks[Math.floor(rng() * 3)]
    g.strokeStyle = ink; g.lineWidth = 3; g.lineCap = 'round'
    g.beginPath(); g.moveTo(24, y)
    let x = 24
    while (x < 60 + rng() * 150) { x += 8 + rng() * 14; g.lineTo(x, y + (rng() - 0.5) * 10) }
    g.stroke()
  }
  // 残留的饼图/箭头
  g.globalAlpha = 0.4; g.strokeStyle = '#3a4a6a'; g.lineWidth = 4
  g.beginPath(); g.arc(200, 60, 26, 0, 4.6); g.stroke()
  g.beginPath(); g.moveTo(200, 60); g.lineTo(226, 60); g.stroke()
  g.beginPath(); g.moveTo(60, 160); g.lineTo(140, 160); g.lineTo(128, 148); g.stroke()
  g.globalAlpha = 1
  ageCanvas(g, 256, 192, rng, 24)
  return toTex(c)
}
// 油画（酒店）
export function texPainting(seed: number): THREE.CanvasTexture {
  const rng = mulberry(seed)
  const [c, g] = makeCanvasCtx(192, 144)
  const skies = ['#2a3542', '#3a2f3d', '#24352e']
  g.fillStyle = skies[Math.floor(rng() * 3)]; g.fillRect(0, 0, 192, 144)
  // 远山
  g.fillStyle = 'rgba(20,22,18,0.8)'
  g.beginPath(); g.moveTo(0, 100)
  for (let x = 0; x <= 192; x += 24) g.lineTo(x, 66 + rng() * 34)
  g.lineTo(192, 144); g.lineTo(0, 144); g.closePath(); g.fill()
  // 月亮/落日
  g.fillStyle = rng() < 0.5 ? '#c9b458' : '#b8632e'
  g.beginPath(); g.arc(40 + rng() * 110, 30 + rng() * 26, 10 + rng() * 8, 0, 7); g.fill()
  // 前景笔触
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(${40 + rng() * 60 | 0},${36 + rng() * 50 | 0},${26 + rng() * 30 | 0},0.6)`
    g.lineWidth = 3 + rng() * 4; g.lineCap = 'round'
    const y = 108 + rng() * 32
    g.beginPath(); g.moveTo(rng() * 150, y); g.lineTo(rng() * 60 + 130, y + (rng() - 0.5) * 8); g.stroke()
  }
  // 签名
  g.fillStyle = 'rgba(200,190,160,0.7)'; g.font = 'italic 12px serif'
  g.fillText('A. Ryder', 140, 134)
  ageCanvas(g, 192, 144, rng, 12)
  return toTex(c)
}
// 假门（贴墙平面）
export function texFakeDoor(seed: number): THREE.CanvasTexture {
  const rng = mulberry(seed)
  const [c, g] = makeCanvasCtx(128, 256)
  g.fillStyle = '#241d16'; g.fillRect(0, 0, 128, 256) // 门洞阴影
  g.fillStyle = '#3a2e22'; g.fillRect(8, 6, 112, 250)
  g.fillStyle = '#463626'; g.fillRect(20, 20, 88, 96)
  g.fillRect(20, 136, 88, 96)
  g.strokeStyle = '#2a2018'; g.lineWidth = 4
  g.strokeRect(20, 20, 88, 96); g.strokeRect(20, 136, 88, 96)
  g.fillStyle = '#8a7a4a'; g.beginPath(); g.arc(100, 128, 6, 0, 7); g.fill()
  ageCanvas(g, 128, 256, rng, 22)
  return toTex(c)
}
// 散落纸张
export function texPaper(seed: number): THREE.CanvasTexture {
  const rng = mulberry(seed)
  const [c, g] = makeCanvasCtx(64, 84)
  g.fillStyle = '#c9c5b8'; g.fillRect(0, 0, 64, 84)
  g.strokeStyle = 'rgba(60,60,70,0.55)'; g.lineWidth = 2
  for (let y = 14; y < 76; y += 9) {
    g.beginPath(); g.moveTo(8, y); g.lineTo(56 - rng() * 18, y); g.stroke()
  }
  ageCanvas(g, 64, 84, rng, 8)
  return toTex(c)
}

