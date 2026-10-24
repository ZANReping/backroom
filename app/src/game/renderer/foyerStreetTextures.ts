// 前厅 M3 街区：运行时 Canvas 2D 程序化贴图（招牌、寻人启事、立面窗格、涂鸦、货架、天空等）。
// 全部为代码绘制，无外部图像依赖；招牌/品牌均为虚构中性名称。地面/墙体的写实 PBR 材质复用
// L11 已登记的 ambientCG CC0 贴图（见 renderer/l11Materials.ts 与 public/textures/L11-ASSET-SOURCES.md）。
import * as THREE from 'three'

const cache = new Map<string, THREE.CanvasTexture>()
function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true, repeat = false): THREE.CanvasTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  draw(g, w, h)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping }
  t.anisotropy = 4
  t.needsUpdate = true
  cache.set(key, t)
  return t
}
export function disposeFoyerStreetTextures() { for (const t of cache.values()) t.dispose(); cache.clear() }

function rng(seed: number) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

// ---------------------------------------------------------------- 立面
/** 立面：24m×24m 一张（8 层 × 8 开间，层高/开间 3m）。返回颜色图与窗灯发光图。 */
export function facadeTex(style: 'res' | 'office' | 'shop' | 'brick', seed: number): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const N = 512, cell = N / 8
  const lit: boolean[] = []
  const r = rng(seed * 977 + style.length * 31)
  for (let i = 0; i < 64; i++) lit.push(r() < (style === 'office' ? 0.16 : style === 'brick' ? 0.08 : 0.24))
  const tint: string[] = []
  for (let i = 0; i < 64; i++) tint.push(['#ffd59a', '#ffe7c0', '#cfe0ff', '#ffc98a', '#f4f0ff'][Math.floor(r() * 5)])
  const map = make(`facade-${style}-${seed}`, N, N, (g) => {
    const base = style === 'res' ? '#8d8a84' : style === 'office' ? '#5d636a' : style === 'shop' ? '#8a8279' : '#6e4a3c'
    g.fillStyle = base; g.fillRect(0, 0, N, N)
    // 细微污渍/竖向雨痕
    const rr = rng(seed + 5)
    for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + rr() * 0.05})`; g.fillRect(rr() * N, rr() * N, 1 + rr() * 3, 10 + rr() * 60) }
    if (style === 'brick') {
      for (let y = 0; y < N; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < N; x += 16) { g.fillStyle = `rgba(${90 + rr() * 30},${50 + rr() * 15},${38},0.5)`; g.fillRect(x + 1, y + 1, 14, 6) }
    }
    for (let fy = 0; fy < 8; fy++) for (let fx = 0; fx < 8; fx++) {
      const x = fx * cell, y = fy * cell
      if (style === 'office') {
        g.fillStyle = '#2a3038'; g.fillRect(x + 2, y + 10, cell - 4, cell - 20)
        g.fillStyle = '#1a1f26'; g.fillRect(x + 4, y + 12, cell - 8, cell - 24)
        g.fillStyle = '#4a525c'; g.fillRect(x + cell / 2 - 1, y + 10, 2, cell - 20)
      } else {
        const wx = x + cell * 0.2, wy = y + cell * 0.22, ww = cell * 0.6, wh = cell * 0.5
        g.fillStyle = '#4f4c47'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 8)
        g.fillStyle = '#1b1d22'; g.fillRect(wx, wy, ww, wh)
        g.fillStyle = '#56534d'; g.fillRect(wx + ww / 2 - 1, wy, 2, wh)
        if (style === 'res' && (fx + fy) % 3 === 0) { // 阳台栏板 + 空调外机
          g.fillStyle = '#7a776f'; g.fillRect(x + 4, y + cell * 0.66, cell - 8, cell * 0.2)
          g.fillStyle = '#c9c7c0'; g.fillRect(x + cell * 0.72, y + cell * 0.72, cell * 0.2, cell * 0.12)
        }
      }
      if (lit[fy * 8 + fx]) { // 亮窗的窗帘颜色
        g.fillStyle = 'rgba(255,220,170,0.35)'
        if (style === 'office') g.fillRect(x + 4, y + 12, cell - 8, cell - 24)
        else g.fillRect(x + cell * 0.2, y + cell * 0.22, cell * 0.6, cell * 0.5)
      }
    }
    // 层间线
    g.fillStyle = 'rgba(0,0,0,0.18)'
    for (let fy = 0; fy < 8; fy++) g.fillRect(0, fy * cell, N, 2)
  }, true, true)
  const glow = make(`facadeglow-${style}-${seed}`, N, N, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, N, N)
    for (let fy = 0; fy < 8; fy++) for (let fx = 0; fx < 8; fx++) {
      if (!lit[fy * 8 + fx]) continue
      const x = fx * cell, y = fy * cell
      g.fillStyle = tint[fy * 8 + fx]
      if (style === 'office') g.fillRect(x + 4, y + 12, cell - 8, cell - 24)
      else g.fillRect(x + cell * 0.2, y + cell * 0.22, cell * 0.6, cell * 0.5)
      g.fillStyle = 'rgba(0,0,0,0.35)' // 窗帘/人影
      g.fillRect(x + cell * 0.25 + (fx % 2) * 10, y + cell * 0.3, cell * 0.18, cell * 0.36)
    }
  }, true, true)
  return { map, glow }
}

// ---------------------------------------------------------------- 招牌
export function shopSignTex(kind: string): THREE.CanvasTexture {
  return make('sign-' + kind, 1024, 160, (g, w, h) => {
    const C: Record<string, [string, string, string, string]> = {
      mart: ['#0f6b4f', '#ffffff', '24H MART', 'OPEN 24 HOURS · SNACKS · DRINKS'],
      laundry: ['#1d4f8f', '#e9f4ff', 'BUBBLE WASH', 'SELF-SERVICE LAUNDRY · 24H'],
      pharmacy: ['#f2f5f2', '#11804a', '+ PHARMACY', 'NIGHT COUNTER'],
      lease: ['#2b2b2b', '#cfcfcf', 'FOR LEASE', 'CONTACT AGENT · 555-0143'],
      noodle: ['#5a1e16', '#f6d7a8', 'NOODLE HOUSE', 'CLOSED'],
      repair: ['#222831', '#7fd1ff', 'PHONE REPAIR', 'SCREENS · BATTERIES'],
    }
    const [bg, fg, t1, t2] = C[kind] ?? C.lease
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, bg); grad.addColorStop(1, shade(bg, -0.25))
    g.fillStyle = grad; g.fillRect(0, 0, w, h)
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 6, w, 4)
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.font = 'bold 86px "Helvetica Neue", Arial, sans-serif'
    g.fillText(t1, w / 2, h * 0.42, w - 60)
    g.font = '26px Arial, sans-serif'; g.globalAlpha = 0.85
    g.fillText(t2, w / 2, h * 0.82, w - 80)
    g.globalAlpha = 1
    if (kind === 'mart') { g.fillStyle = '#f5c84b'; g.fillRect(0, h - 12, w, 12) }
  })
}
function shade(hex: string, k: number) {
  const c = new THREE.Color(hex); c.multiplyScalar(1 + k); return '#' + c.getHexString()
}

/** 店内背景（非可进入店铺透过玻璃看到的画面）。 */
export function shopInteriorTex(kind: string): THREE.CanvasTexture {
  return make('interior-' + kind, 512, 256, (g, w, h) => {
    const r = rng(kind.length * 17 + 3)
    if (kind === 'laundry') {
      g.fillStyle = '#d9e4ea'; g.fillRect(0, 0, w, h)
      g.fillStyle = '#b9c7cf'; g.fillRect(0, h * 0.72, w, h * 0.28)
      for (let i = 0; i < 6; i++) { // 两排洗衣机
        const x = 20 + i * 82
        for (const y of [40, 132]) {
          g.fillStyle = '#f4f6f7'; g.fillRect(x, y, 70, 80)
          g.fillStyle = '#6b7a85'; g.beginPath(); g.arc(x + 35, y + 44, 24, 0, Math.PI * 2); g.fill()
          g.fillStyle = '#a9d1ea'; g.beginPath(); g.arc(x + 35, y + 44, 18, 0, Math.PI * 2); g.fill()
          g.fillStyle = '#2a3a44'; g.fillRect(x + 6, y + 6, 26, 8)
        }
      }
    } else if (kind === 'pharmacy') {
      g.fillStyle = '#eef3ef'; g.fillRect(0, 0, w, h)
      for (let s = 0; s < 4; s++) {
        const y = 30 + s * 52
        g.fillStyle = '#c9d3cc'; g.fillRect(0, y + 38, w, 6)
        for (let x = 6; x < w; x += 14 + r() * 10) { g.fillStyle = ['#f2f2f2', '#d64545', '#3a8fd1', '#f1c84c', '#5fb36a'][Math.floor(r() * 5)]; g.fillRect(x, y + 38 - (16 + r() * 18), 10 + r() * 6, 16 + r() * 18) }
      }
      g.fillStyle = '#1c8a52'; g.fillRect(w / 2 - 20, 4, 40, 14)
    } else if (kind === 'mart') {
      g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, w, h)
      for (let s = 0; s < 4; s++) {
        const y = 24 + s * 56
        g.fillStyle = '#c8ccd2'; g.fillRect(0, y + 44, w, 5)
        for (let x = 4; x < w; x += 10 + r() * 8) { g.fillStyle = `hsl(${Math.floor(r() * 360)},${50 + r() * 30}%,${45 + r() * 20}%)`; g.fillRect(x, y + 44 - (14 + r() * 20), 7 + r() * 5, 14 + r() * 20) }
      }
    } else {
      g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, w, h)
    }
  })
}

/** 卷帘门。 */
export function shutterTex(): THREE.CanvasTexture {
  return make('shutter', 256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 8) { const gr = g.createLinearGradient(0, y, 0, y + 8); gr.addColorStop(0, '#9a9c9e'); gr.addColorStop(0.6, '#77797c'); gr.addColorStop(1, '#4f5154'); g.fillStyle = gr; g.fillRect(0, y, w, 8) }
    const r = rng(9)
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(60,40,30,${r() * 0.15})`; g.fillRect(r() * w, r() * h, 4 + r() * 30, 2 + r() * 10) }
    g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 6; g.font = 'bold 40px Arial'; g.fillStyle = 'rgba(40,40,45,0.35)'; g.fillText('B0RD3R', 30, 150)
  }, true, true)
}

// ---------------------------------------------------------------- 寻人启事 / 海报 / 涂鸦
export function missingPosterTex(v: number): THREE.CanvasTexture {
  return make('missing-' + v, 256, 360, (g, w, h) => {
    const r = rng(v * 131 + 7)
    g.fillStyle = '#f1ede2'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#b3241f'; g.font = 'bold 54px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('MISSING', w / 2, 58)
    // 照片
    g.fillStyle = '#9da3a6'; g.fillRect(48, 76, 160, 150)
    g.fillStyle = '#6c7377'; g.beginPath(); g.arc(128, 136, 34, 0, Math.PI * 2); g.fill(); g.fillRect(78, 176, 100, 50)
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(48, 76, 160, 150)
    g.fillStyle = '#222'; g.textAlign = 'left'; g.font = '15px Arial'
    for (let i = 0; i < 6; i++) g.fillRect(28, 246 + i * 16, 120 + r() * 80, 3)
    g.font = 'bold 18px Arial'; g.fillText('555-01' + (20 + v * 7), 28, 350)
    // 撕痕与水渍
    g.fillStyle = 'rgba(120,100,60,0.18)'; g.beginPath(); g.arc(r() * w, r() * h, 40 + r() * 40, 0, Math.PI * 2); g.fill()
    g.clearRect(w - 30, h - 24, 30, 24)
  })
}
export function adPanelTex(): THREE.CanvasTexture {
  return make('ad-panel', 256, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d2a44'); gr.addColorStop(1, '#5a3a6a')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    g.fillStyle = '#f7e9c8'; g.beginPath(); g.arc(w / 2, h * 0.36, 70, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.fillText('SLEEP WELL', w / 2, h * 0.66)
    g.font = '18px Arial'; g.fillText('a better mattress for a better night', w / 2, h * 0.72)
    g.fillStyle = '#f2c14e'; g.fillRect(w / 2 - 50, h * 0.8, 100, 30)
  })
}
export function graffitiTex(): THREE.CanvasTexture {
  return make('graffiti', 512, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h)
    g.lineCap = 'round'; g.lineJoin = 'round'
    // 黄色歪门
    g.strokeStyle = '#e8c547'; g.lineWidth = 14
    g.beginPath(); g.moveTo(120, 340); g.lineTo(112, 90); g.lineTo(250, 80); g.lineTo(262, 344); g.stroke()
    g.fillStyle = 'rgba(232,197,71,0.35)'; g.fillRect(124, 96, 128, 240)
    g.fillStyle = '#e8c547'; g.beginPath(); g.arc(232, 220, 9, 0, Math.PI * 2); g.fill()
    // 文字与箭头
    g.fillStyle = '#f2f2f2'; g.font = 'bold 44px "Comic Sans MS", Arial'; g.save(); g.translate(290, 150); g.rotate(-0.08); g.fillText('NOCLIP', 0, 0); g.fillText('HERE', 20, 46); g.restore()
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 8; g.beginPath(); g.moveTo(300, 260); g.lineTo(460, 300); g.lineTo(430, 270); g.moveTo(460, 300); g.lineTo(425, 322); g.stroke()
    // 七道计数划痕
    g.strokeStyle = 'rgba(30,30,30,0.85)'; g.lineWidth = 5
    for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(30 + i * 11, 40); g.lineTo(34 + i * 11, 90); g.stroke() }
    // 滴落
    g.fillStyle = '#e8c547'; for (const x of [130, 170, 245]) g.fillRect(x, 330, 4, 20 + (x % 30))
    // 杂乱 tag
    g.strokeStyle = 'rgba(200,60,60,0.8)'; g.lineWidth = 6; g.beginPath(); g.moveTo(330, 60); g.bezierCurveTo(360, 20, 400, 90, 440, 40); g.stroke()
  })
}

// ---------------------------------------------------------------- 店内
export function shelfGoodsTex(v: number): THREE.CanvasTexture {
  return make('goods-' + v, 512, 256, (g, w, h) => {
    const r = rng(v * 71 + 11)
    g.fillStyle = '#e9ebee'; g.fillRect(0, 0, w, h)
    for (let s = 0; s < 4; s++) {
      const y = s * 64
      g.fillStyle = '#b8bcc2'; g.fillRect(0, y + 58, w, 6)
      g.fillStyle = '#f7f7f7'; g.fillRect(0, y + 52, w, 6)
      for (let x = 3; x < w - 8; x += 9 + r() * 9) {
        const hh = 18 + r() * 30, ww = 7 + r() * 7
        g.fillStyle = `hsl(${Math.floor(r() * 360)},${45 + r() * 40}%,${40 + r() * 25}%)`
        g.fillRect(x, y + 52 - hh, ww, hh)
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 1, y + 52 - hh + 3, ww - 2, 3)
      }
      for (let x = 10; x < w; x += 46) { g.fillStyle = '#ffd84a'; g.fillRect(x, y + 53, 18, 4) }
    }
  })
}
export function coolerTex(): THREE.CanvasTexture {
  return make('cooler', 512, 256, (g, w, h) => {
    const r = rng(42)
    g.fillStyle = '#dfeaf2'; g.fillRect(0, 0, w, h)
    for (let s = 0; s < 4; s++) {
      const y = s * 64
      g.fillStyle = '#9fb0bc'; g.fillRect(0, y + 60, w, 4)
      for (let x = 4; x < w - 6; x += 12) {
        const hh = 34 + r() * 16
        g.fillStyle = ['#2f78c4', '#d63b3b', '#f2c14e', '#3fa66a', '#f4f4f4', '#7b4fb3', '#e98a2c'][Math.floor(r() * 7)]
        g.fillRect(x, y + 60 - hh, 9, hh)
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 2, y + 60 - hh, 2, hh)
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#4a5560'; for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 5, h)
  })
}
export function martPosterTex(): THREE.CanvasTexture {
  return make('mart-poster', 256, 128, (g, w, h) => {
    g.fillStyle = '#f2c14e'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#c0392b'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.fillText('2 FOR 1', w / 2, 52)
    g.fillStyle = '#222'; g.font = '20px Arial'; g.fillText('HOT BUNS · COFFEE', w / 2, 92)
  })
}
export function tvTex(): THREE.CanvasTexture {
  return make('tv-news', 256, 160, (g, w, h) => {
    g.fillStyle = '#1b2a4a'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#c0392b'; g.fillRect(0, h - 36, w, 36)
    g.fillStyle = '#fff'; g.font = 'bold 18px Arial'; g.fillText('BREAKING · 7th MISSING', 8, h - 12)
    g.fillStyle = '#8fa6c8'; g.fillRect(20, 20, 90, 80); g.fillStyle = '#d6dce6'; g.fillRect(130, 30, 100, 10); g.fillRect(130, 50, 80, 10)
  })
}
export function vendingTex(): THREE.CanvasTexture {
  return make('vending', 256, 512, (g, w, h) => {
    g.fillStyle = '#e7eef4'; g.fillRect(0, 0, w, h)
    const r = rng(77)
    for (let s = 0; s < 6; s++) for (let i = 0; i < 6; i++) {
      const x = 14 + i * 36, y = 20 + s * 62
      g.fillStyle = s === 5 ? '#f3e9c6' : ['#2f78c4', '#d63b3b', '#3fa66a', '#f2c14e', '#7b4fb3'][Math.floor(r() * 5)]
      g.fillRect(x, y, 24, 46)
      g.fillStyle = '#333'; g.fillRect(x, y + 50, 24, 6)
    }
    g.fillStyle = '#c8a24a'; g.font = 'bold 14px Arial'; g.fillText('ALMOND', 18, 392)
    g.fillStyle = '#2b3440'; g.fillRect(0, h - 110, w, 110)
    g.fillStyle = '#5cff8a'; g.fillRect(w - 70, h - 96, 50, 16)
  })
}
export function noticeTex(): THREE.CanvasTexture {
  return make('notice', 512, 320, (g, w, h) => {
    g.fillStyle = '#b89a6a'; g.fillRect(0, 0, w, h)
    const r = rng(5)
    const papers = [['#f6f3ea', 'NOTICE: LIFT MAINTENANCE'], ['#fff6c8', 'WATER OFF THU 9-12'], ['#f1ede2', 'MISSING'], ['#e8f1ff', 'RECYCLING DAY: MON']]
    papers.forEach(([c, t], i) => {
      const x = 20 + (i % 2) * 250 + r() * 10, y = 20 + Math.floor(i / 2) * 150 + r() * 10
      g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.08)
      g.fillStyle = c; g.fillRect(0, 0, 210, 130)
      g.fillStyle = t === 'MISSING' ? '#b3241f' : '#222'; g.font = 'bold 18px Arial'; g.fillText(t, 10, 28)
      g.fillStyle = '#777'; for (let k = 0; k < 5; k++) g.fillRect(10, 44 + k * 14, 140 + r() * 50, 3)
      if (t === 'MISSING') { g.clearRect(110, 0, 100, 130); g.fillStyle = '#b89a6a'; g.fillRect(110, 0, 100, 130) }
      g.fillStyle = '#c0392b'; g.beginPath(); g.arc(105, 6, 5, 0, Math.PI * 2); g.fill()
      g.restore()
    })
  })
}
export function labelTex(text: string, fg: string, bg: string, w = 512, h = 128, font = 'bold 64px Arial'): THREE.CanvasTexture {
  return make(`label-${text}-${fg}-${bg}-${w}`, w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2, w - 20)
  })
}
export function exitSignTex(): THREE.CanvasTexture {
  return make('exit-sign', 256, 96, (g, w, h) => {
    g.fillStyle = '#108a43'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#fff'
    // 跑动小人（中性通用图形）
    g.beginPath(); g.arc(46, 22, 9, 0, Math.PI * 2); g.fill()
    g.lineWidth = 8; g.strokeStyle = '#fff'; g.lineCap = 'round'
    g.beginPath(); g.moveTo(44, 34); g.lineTo(36, 58); g.lineTo(22, 80); g.moveTo(36, 58); g.lineTo(54, 72); g.lineTo(52, 86); g.moveTo(42, 40); g.lineTo(60, 50); g.moveTo(42, 40); g.lineTo(26, 46); g.stroke()
    g.strokeRect(80, 18, 34, 62)
    g.font = 'bold 40px Arial'; g.fillText('EXIT', 130, 62)
  })
}
export function fenceTex(): THREE.CanvasTexture {
  return make('fence', 512, 256, (g, w, h) => {
    g.fillStyle = '#e9e6dc'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#2f6db3'; g.fillRect(0, h - 50, w, 50); g.fillRect(0, 0, w, 24)
    g.fillStyle = '#2f6db3'; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.fillText('ROAD WORKS', w / 2, 110)
    g.font = '24px Arial'; g.fillStyle = '#555'; g.fillText('NO THROUGH ACCESS', w / 2, 150)
    for (let x = -40; x < w; x += 60) { g.fillStyle = '#d43c2c'; g.beginPath(); g.moveTo(x, h - 50); g.lineTo(x + 30, h - 50); g.lineTo(x + 60, h); g.lineTo(x + 30, h); g.fill() }
  })
}
export function cardboardTex(): THREE.CanvasTexture {
  return make('cardboard', 256, 256, (g, w, h) => {
    g.fillStyle = '#9b7a4c'; g.fillRect(0, 0, w, h)
    const r = rng(3)
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,40,20,${r() * 0.2})`; g.fillRect(r() * w, r() * h, 20 + r() * 60, 6 + r() * 30) }
    g.fillStyle = 'rgba(40,30,20,0.6)'; g.fillRect(0, h / 2 - 3, w, 6)
    g.strokeStyle = '#3b2c1a'; g.lineWidth = 3; g.strokeRect(60, 80, 70, 50); g.font = 'bold 22px Arial'; g.fillStyle = '#3b2c1a'; g.fillText('↑↑', 80, 112)
  }, true, true)
}
export function skyTex(): THREE.CanvasTexture {
  return make('night-sky', 64, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h)
    gr.addColorStop(0, '#05070d'); gr.addColorStop(0.35, '#0b1020'); gr.addColorStop(0.47, '#1e2236'); gr.addColorStop(0.5, '#3a3040'); gr.addColorStop(0.53, '#141420'); gr.addColorStop(1, '#050507')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    const r = rng(12)
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`; g.fillRect(r() * w, r() * h * 0.4, 1, 1) }
  })
}
export function roadMarkTex(): THREE.CanvasTexture {
  return make('zebra', 64, 64, (g, w, h) => { g.fillStyle = '#e8e6df'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.12)'; const r = rng(4); for (let i = 0; i < 60; i++) g.fillRect(r() * w, r() * h, 2, 2) })
}
