// 前厅（序章）程序化贴图：全部在运行时用 Canvas 2D 绘制（无外部素材、无许可依赖）。
// 地板/墙砖/织物/木纹按世界尺度平铺（repeat 由 UV 世界坐标决定）；屏幕/海报/夜景为单张贴图。
// 文字与品牌全部为虚构中性名称，不指向具体国家。
import * as THREE from 'three'
import { foyerLightmap } from './foyerBake'

const cache = new Map<string, THREE.CanvasTexture>()

function hash(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
function rngOf(seed: number) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296 } }

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: boolean; srgb?: boolean } = {}): THREE.CanvasTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  draw(g, w, h)
  const t = new THREE.CanvasTexture(c)
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace
  if (opts.repeat !== false) { t.wrapS = t.wrapT = THREE.RepeatWrapping }
  t.anisotropy = 8
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.userData.foyer = true
  cache.set(key, t)
  return t
}

/** 关卡卸载时由 renderer 统一回收（几何/材质随世界组退役，贴图在此释放）。 */
export function disposeFoyerTextures() { for (const t of cache.values()) t.dispose(); cache.clear(); foyerLightmap.value?.dispose(); foyerLightmap.value = null }

function noise(g: CanvasRenderingContext2D, w: number, h: number, amt: number, seed: number, size = 1) {
  const img = g.getImageData(0, 0, w, h), d = img.data, r = rngOf(seed)
  for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
    const v = (r() - 0.5) * amt
    for (let yy = 0; yy < size && y + yy < h; yy++) for (let xx = 0; xx < size && x + xx < w; xx++) {
      const i = ((y + yy) * w + x + xx) * 4
      d[i] += v; d[i + 1] += v; d[i + 2] += v
    }
  }
  g.putImageData(img, 0, 0)
}

const shade = (hex: string, k: number) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString() }

/** 木地板：1 张贴图 = 2m×2m；板宽 0.18m、板长 0.9–1.5m 错缝。 */
export function woodFloorTex(tone: 'oak' | 'ash'): THREE.CanvasTexture {
  return make('floor-' + tone, 1024, 1024, (g, w, h) => {
    const base = tone === 'oak' ? ['#a77a4c', '#9b6f42', '#b2865a', '#8f6640'] : ['#c3a581', '#b89874', '#cdb08d', '#ad8d69']
    const r = rngOf(tone === 'oak' ? 11 : 23)
    const pw = w / (2 / 0.18)
    for (let row = 0; row * pw < h + pw; row++) {
      let x = -r() * 300
      while (x < w) {
        const len = (0.9 + r() * 0.6) / 2 * w
        const c = base[Math.floor(r() * base.length)]
        g.fillStyle = c
        g.fillRect(x, row * pw, len, pw)
        // 木纹
        g.globalAlpha = 0.18
        for (let k = 0; k < 9; k++) {
          g.strokeStyle = r() > 0.5 ? shade(c, 0.78) : shade(c, 1.12)
          g.lineWidth = 1 + r() * 2
          g.beginPath()
          const yy = row * pw + r() * pw
          g.moveTo(x, yy)
          for (let s = 0; s <= 8; s++) g.lineTo(x + (len * s) / 8, yy + Math.sin(s * 1.3 + k) * (1 + r() * 2.5))
          g.stroke()
        }
        // 节疤
        if (r() > 0.82) { g.globalAlpha = 0.25; g.fillStyle = shade(c, 0.6); g.beginPath(); g.ellipse(x + r() * len, row * pw + pw / 2, 6 + r() * 6, 3 + r() * 2, 0, 0, Math.PI * 2); g.fill() }
        g.globalAlpha = 1
        g.fillStyle = 'rgba(40,24,10,0.55)'
        g.fillRect(x, row * pw, 2, pw)
        x += len
      }
      g.fillStyle = 'rgba(40,24,10,0.45)'
      g.fillRect(0, row * pw, w, 2)
    }
    noise(g, w, h, 14, 5)
  })
}

/** 地砖：size=每块边长（米），1 张贴图 = 1.2m。 */
export function floorTileTex(kind: 'tile60' | 'tile30' | 'terrazzo'): THREE.CanvasTexture {
  return make('tile-' + kind, 1024, 1024, (g, w, h) => {
    const r = rngOf(kind.length * 31)
    if (kind === 'terrazzo') {
      g.fillStyle = '#9c9a93'; g.fillRect(0, 0, w, h)
      for (let i = 0; i < 5200; i++) {
        g.fillStyle = ['#6f6d68', '#c7c4bb', '#4d4b47', '#b5a991', '#e3e0d8'][Math.floor(r() * 5)]
        g.globalAlpha = 0.65
        g.beginPath(); g.ellipse(r() * w, r() * h, 1 + r() * 5, 1 + r() * 4, r() * 3, 0, Math.PI * 2); g.fill()
      }
      g.globalAlpha = 1
      noise(g, w, h, 18, 9, 2)
      return
    }
    const n = kind === 'tile60' ? 2 : 4
    const s = w / n
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = kind === 'tile60' ? 205 + r() * 14 : 170 + r() * 12
      g.fillStyle = kind === 'tile60' ? `rgb(${v},${v - 3},${v - 9})` : `rgb(${v - 6},${v - 2},${v})`
      g.fillRect(i * s, j * s, s, s)
      // 石纹
      g.globalAlpha = 0.12
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = '#7d7a72'; g.lineWidth = 1 + r() * 2
        g.beginPath(); let x = i * s + r() * s, y = j * s + r() * s; g.moveTo(x, y)
        for (let q = 0; q < 6; q++) { x += (r() - 0.5) * s * 0.4; y += (r() - 0.3) * s * 0.3; g.lineTo(x, y) }
        g.stroke()
      }
      g.globalAlpha = 1
    }
    noise(g, w, h, 10, 3)
    g.strokeStyle = kind === 'tile60' ? '#9b968c' : '#8e9497'; g.lineWidth = kind === 'tile60' ? 5 : 6
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke() }
  })
}

/** 乳胶漆墙面：1 张 = 2m，细微滚筒纹理。 */
export function paintTex(hex: string): THREE.CanvasTexture {
  return make('paint-' + hex, 512, 512, (g, w, h) => {
    g.fillStyle = hex; g.fillRect(0, 0, w, h)
    noise(g, w, h, 7, hex.length * 13 + parseInt(hex.slice(1, 3), 16), 2)
    noise(g, w, h, 4, 77, 1)
  })
}

/** 卫生间墙砖（30×60 竖铺白砖 + 灰缝），1 张 = 1.2m。 */
export function wallTileTex(): THREE.CanvasTexture {
  return make('walltile', 1024, 1024, (g, w, h) => {
    const r = rngOf(4)
    const cw = w / 4, ch = h / 2
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
      const v = 236 + r() * 10
      const grd = g.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch)
      grd.addColorStop(0, `rgb(${v},${v},${v - 2})`); grd.addColorStop(1, `rgb(${v - 10},${v - 9},${v - 8})`)
      g.fillStyle = grd; g.fillRect(i * cw, j * ch, cw, ch)
    }
    g.strokeStyle = '#b9bcbc'; g.lineWidth = 5
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, h); g.stroke() }
    for (let j = 0; j <= 2; j++) { g.beginPath(); g.moveTo(0, j * ch); g.lineTo(w, j * ch); g.stroke() }
    noise(g, w, h, 5, 2)
  })
}

/** 厨房防溅墙（小白方砖），1 张 = 0.6m。 */
export function backsplashTex(): THREE.CanvasTexture {
  return make('backsplash', 512, 512, (g, w) => {
    const r = rngOf(8), n = 6, s = w / n
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const off = j % 2 ? s / 2 : 0
      const v = 228 + r() * 14
      g.fillStyle = `rgb(${v - 4},${v},${v - 2})`
      g.fillRect(i * s + off - (off ? s : 0), j * s, s, s)
      g.fillRect(i * s + off, j * s, s, s)
    }
    g.strokeStyle = '#a7aaa6'; g.lineWidth = 3
    for (let j = 0; j <= n; j++) { g.beginPath(); g.moveTo(0, j * s); g.lineTo(w, j * s); g.stroke() }
    for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) { const x = i * s + (j % 2 ? s / 2 : 0); g.beginPath(); g.moveTo(x, j * s); g.lineTo(x, (j + 1) * s); g.stroke() }
  })
}

/** 楼道墙：上白下绿墙裙（1 张 = 宽 2m × 高 2.8m，不在竖向平铺）。 */
export function stairWallTex(): THREE.CanvasTexture {
  return make('stairwall', 512, 716, (g, w, h) => {
    g.fillStyle = '#d9d8d0'; g.fillRect(0, 0, w, h)
    const dado = h * (1 - 1.2 / 2.8)
    g.fillStyle = '#5f7a6c'; g.fillRect(0, dado, w, h - dado)
    g.fillStyle = '#3f5247'; g.fillRect(0, dado - 4, w, 8)
    noise(g, w, h, 12, 31, 2)
    // 擦痕与污渍
    const r = rngOf(12)
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,55,45,${0.04 + r() * 0.06})`; g.beginPath(); g.ellipse(r() * w, dado + r() * (h - dado), 6 + r() * 30, 2 + r() * 8, r(), 0, 7); g.fill() }
  })
}

/** 家具木纹（单向长纹），1 张 = 1m。 */
export function woodGrainTex(hex: string): THREE.CanvasTexture {
  return make('grain-' + hex, 512, 512, (g, w, h) => {
    g.fillStyle = hex; g.fillRect(0, 0, w, h)
    const r = rngOf(parseInt(hex.slice(1), 16) % 997)
    g.globalAlpha = 0.16
    for (let k = 0; k < 70; k++) {
      g.strokeStyle = r() > 0.5 ? shade(hex, 0.72) : shade(hex, 1.15)
      g.lineWidth = 1 + r() * 2.5
      g.beginPath(); const y0 = r() * h; g.moveTo(0, y0)
      for (let s = 0; s <= 16; s++) g.lineTo((w * s) / 16, y0 + Math.sin(s * 0.7 + k) * (2 + r() * 4))
      g.stroke()
    }
    g.globalAlpha = 1
    noise(g, w, h, 10, 3)
  })
}

/** 织物（编织纹 + 绒感），1 张 = 0.5m。 */
export function fabricTex(hex: string): THREE.CanvasTexture {
  return make('fabric-' + hex, 256, 256, (g, w, h) => {
    g.fillStyle = hex; g.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)'; g.fillRect(0, y, w, 1) }
    for (let x = 0; x < w; x += 2) { g.fillStyle = x % 4 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)'; g.fillRect(x, 0, 1, h) }
    noise(g, w, h, 16, hex.length * 7)
  })
}

/** 地毯（卧室：几何米灰；客厅：褪色深蓝波斯纹）——单张不平铺。 */
export function rugTex(kind: 'bed' | 'living'): THREE.CanvasTexture {
  return make('rug-' + kind, 1024, 768, (g, w, h) => {
    const r = rngOf(kind === 'bed' ? 41 : 43)
    if (kind === 'bed') {
      g.fillStyle = '#cfc6b4'; g.fillRect(0, 0, w, h)
      g.strokeStyle = '#8f8676'; g.lineWidth = 10
      g.strokeRect(40, 40, w - 80, h - 80)
      g.lineWidth = 4
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(80 + i * 72, 80); g.lineTo(80 + i * 72 + 120, h - 80); g.stroke() }
    } else {
      g.fillStyle = '#2d3a52'; g.fillRect(0, 0, w, h)
      g.fillStyle = '#8b3a2f'; g.fillRect(50, 50, w - 100, h - 100)
      g.fillStyle = '#2d3a52'; g.fillRect(90, 90, w - 180, h - 180)
      g.strokeStyle = '#c9a76a'; g.lineWidth = 6; g.strokeRect(70, 70, w - 140, h - 140)
      g.fillStyle = '#7d3a33'
      g.beginPath(); g.ellipse(w / 2, h / 2, 220, 150, 0, 0, 7); g.fill()
      g.strokeStyle = '#d4b98a'; g.lineWidth = 5
      for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(w / 2, h / 2, 60 + i * 45, 40 + i * 30, 0, 0, 7); g.stroke() }
      for (let i = 0; i < 40; i++) { g.fillStyle = ['#c9a76a', '#6b8a8f', '#a8483a'][i % 3]; g.beginPath(); g.arc(120 + r() * (w - 240), 120 + r() * (h - 240), 6 + r() * 10, 0, 7); g.fill() }
    }
    noise(g, w, h, 30, 6, 2)
    // 褪色
    const grd = g.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7)
    grd.addColorStop(0, 'rgba(255,240,220,0.08)'); grd.addColorStop(1, 'rgba(0,0,0,0.12)')
    g.fillStyle = grd; g.fillRect(0, 0, w, h)
  }, { repeat: false })
}

/** 吸顶/石膏天花板：1 张 = 2m。 */
export function ceilingTex(): THREE.CanvasTexture {
  return make('ceiling', 256, 256, (g, w, h) => { g.fillStyle = '#efede7'; g.fillRect(0, 0, w, h); noise(g, w, h, 6, 19, 2) })
}

/** 窗外夜景：远处楼群剪影 + 零星亮窗 + 城市光污染；view='cityLow' 低楼层更多街景光。 */
export function nightCityTex(view: 'city' | 'cityLow'): THREE.CanvasTexture {
  return make('night-' + view, 2048, 1024, (g, w, h) => {
    const r = rngOf(view === 'city' ? 101 : 202)
    const sky = g.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#05070f'); sky.addColorStop(0.55, '#141b2e'); sky.addColorStop(0.8, '#3a3048'); sky.addColorStop(1, '#5a4040')
    g.fillStyle = sky; g.fillRect(0, 0, w, h)
    // 星（极少：城市光污染）
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.4})`; g.fillRect(r() * w, r() * h * 0.4, 1.5, 1.5) }
    const layers = view === 'city' ? [[0.42, '#0d1220', 0.012], [0.55, '#0a0e19', 0.02], [0.7, '#070a12', 0.03]] as const : [[0.3, '#0d1220', 0.01], [0.45, '#0a0e19', 0.016], [0.62, '#06080f', 0.028]] as const
    for (const [top, color, lit] of layers) {
      let x = 0
      while (x < w) {
        const bw = 60 + r() * 180
        const bh = h * (1 - top) * (0.45 + r() * 0.75)
        const y = h - bh
        g.fillStyle = color; g.fillRect(x, y, bw, bh)
        // 屋顶细节
        if (r() > 0.6) { g.fillRect(x + bw * 0.3, y - 18, 6, 18); g.fillStyle = '#c03030'; g.fillRect(x + bw * 0.3, y - 20, 6, 4) }
        // 亮窗
        const cols = Math.floor(bw / 14), rows = Math.floor(bh / 20)
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          if (r() > lit * 10) continue
          const warm = r() > 0.35
          g.fillStyle = warm ? `rgba(255,${190 + r() * 40},${110 + r() * 50},${0.55 + r() * 0.4})` : `rgba(${170 + r() * 40},${200 + r() * 30},255,${0.4 + r() * 0.4})`
          g.fillRect(x + 4 + i * 14, y + 6 + j * 20, 8, 11)
        }
        x += bw + r() * 12
      }
    }
    // 街道光与招牌（虚构中性品牌）
    const glow = g.createLinearGradient(0, h * 0.75, 0, h)
    glow.addColorStop(0, 'rgba(255,170,90,0)'); glow.addColorStop(1, view === 'cityLow' ? 'rgba(255,170,90,0.45)' : 'rgba(255,170,90,0.25)')
    g.fillStyle = glow; g.fillRect(0, h * 0.75, w, h * 0.25)
    const signs = [['NORTHLINE', '#5fd3c8'], ['24H MART', '#ffd36a'], ['OPTIKA', '#ff7a9a'], ['PARCEL·GO', '#8fb7ff']]
    g.font = 'bold 34px "Noto Sans CJK SC", sans-serif'
    for (let i = 0; i < signs.length; i++) {
      const [t, c] = signs[i]
      const sx = 200 + i * 480 + r() * 80, sy = h * (view === 'cityLow' ? 0.7 : 0.62) + r() * 60
      g.shadowColor = c; g.shadowBlur = 18; g.fillStyle = c; g.fillText(t, sx, sy); g.shadowBlur = 0
    }
    // 远处高架/路灯点
    for (let i = 0; i < 70; i++) { const x = r() * w, y = h * (0.86 + r() * 0.12); g.fillStyle = `rgba(255,${200 + r() * 40},150,0.8)`; g.beginPath(); g.arc(x, y, 2 + r() * 2, 0, 7); g.fill() }
  }, { repeat: false })
}

function wrapText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  let line = ''
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW) { g.fillText(line, x, y); y += lh; line = ch } else line += ch
  }
  if (line) { g.fillText(line, x, y); y += lh }
  return y
}

/** 电脑屏幕：左侧新闻网站（失踪报道），右侧本地论坛标签页。 */
export function computerScreenTex(): THREE.CanvasTexture {
  return make('screen-pc', 1280, 720, (g, w, h) => {
    g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, w, h)
    // 浏览器标签栏
    g.fillStyle = '#d9dce2'; g.fillRect(0, 0, w, 44)
    g.fillStyle = '#ffffff'; g.fillRect(12, 8, 300, 36)
    g.fillStyle = '#c7cbd3'; g.fillRect(318, 8, 300, 36)
    g.font = '17px "Noto Sans CJK SC", sans-serif'; g.fillStyle = '#333'
    g.fillText('都市晨讯 · 本地新闻', 28, 32)
    g.fillStyle = '#555'; g.fillText('边界线论坛 · 都市传说版', 334, 32)
    g.fillStyle = '#ffffff'; g.fillRect(0, 44, w, 40)
    g.fillStyle = '#eef0f3'; g.fillRect(70, 52, 700, 26)
    g.fillStyle = '#666'; g.font = '15px monospace'; g.fillText('https://news.citymorning.example/local/missing', 82, 70)
    // 新闻站头
    g.fillStyle = '#1d3557'; g.fillRect(0, 84, w, 70)
    g.fillStyle = '#fff'; g.font = 'bold 34px "Noto Serif CJK SC", serif'; g.fillText('都市晨讯', 40, 132)
    g.font = '16px "Noto Sans CJK SC", sans-serif'; g.fillText('本地  ·  交通  ·  天气  ·  社区', 260, 128)
    g.fillStyle = '#c1121f'; g.fillRect(40, 176, 76, 26); g.fillStyle = '#fff'; g.font = 'bold 15px "Noto Sans CJK SC"'; g.fillText('持续关注', 46, 195)
    g.fillStyle = '#111'; g.font = 'bold 34px "Noto Sans CJK SC", sans-serif'
    g.fillText('本月第七起：夜归青年在老城区失联', 130, 200)
    g.fillStyle = '#777'; g.font = '15px "Noto Sans CJK SC"'; g.fillText('23:12 更新 · 记者 林舟', 130, 228)
    // 配图
    const grd = g.createLinearGradient(40, 250, 40, 520)
    grd.addColorStop(0, '#2b2f3a'); grd.addColorStop(1, '#15171d')
    g.fillStyle = grd; g.fillRect(40, 250, 520, 290)
    g.fillStyle = '#d8c690'; g.fillRect(200, 300, 30, 200); g.fillRect(330, 290, 40, 220)
    g.fillStyle = 'rgba(255,220,140,0.25)'; g.beginPath(); g.ellipse(300, 330, 160, 60, 0, 0, 7); g.fill()
    g.fillStyle = '#888'; g.font = '13px "Noto Sans CJK SC"'; g.fillText('监控最后拍到她的位置：一条没有名字的后巷', 40, 560)
    g.fillStyle = '#222'; g.font = '18px "Noto Sans CJK SC"'
    let y = 280
    const body = '警方证实，失踪者最后出现在第六大街与旧仓路之间。家属称她出门前说要“去看看那条巷子”。这是本月同一片区第七起类似报告，所有失踪者的手机都在午夜前后同时断开信号。'
    y = wrapText(g, body, 590, y, 640, 30)
    g.fillStyle = '#1d3557'; g.font = 'bold 20px "Noto Sans CJK SC"'; g.fillText('相关报道', 590, y + 20)
    g.fillStyle = '#333'; g.font = '17px "Noto Sans CJK SC"'
    const rel = ['· 便利店店员：“他进巷子以后，监控就只剩黄色雪花了”', '· 专家提醒：深夜请勿独自前往无照明区域', '· 失踪者家属自发张贴寻人启事', '· 天气：今夜多云，最低气温 9℃']
    rel.forEach((t, i) => g.fillText(t, 590, y + 56 + i * 32))
    // 寻人启事格
    g.fillStyle = '#fff7e0'; g.fillRect(40, 590, 1200, 110)
    g.fillStyle = '#7a4b00'; g.font = 'bold 20px "Noto Sans CJK SC"'; g.fillText('寻人', 60, 625)
    for (let i = 0; i < 6; i++) { g.fillStyle = '#c9b78a'; g.fillRect(140 + i * 180, 604, 64, 80); g.fillStyle = '#5a4a2a'; g.font = '14px "Noto Sans CJK SC"'; g.fillText(['陈某 19岁', '赵某 23岁', '许某 17岁', '何某 31岁', '吴某 20岁', '周某 26岁'][i], 212 + i * 180, 650) }
    noise(g, w, h, 3, 1)
  }, { repeat: false })
}

/** 电视画面：深夜新闻台，滚动字幕。 */
export function tvScreenTex(): THREE.CanvasTexture {
  return make('screen-tv', 1024, 576, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h)
    grd.addColorStop(0, '#1c2c48'); grd.addColorStop(1, '#0b1322')
    g.fillStyle = grd; g.fillRect(0, 0, w, h)
    g.fillStyle = '#2a3d62'; g.fillRect(560, 70, 400, 330)
    g.fillStyle = '#d7b98a'; g.beginPath(); g.arc(760, 200, 58, 0, 7); g.fill()
    g.fillStyle = '#2b2b33'; g.fillRect(680, 262, 160, 140)
    g.fillStyle = '#d0d4dc'; g.fillRect(60, 120, 420, 240)
    g.fillStyle = '#333'; g.font = 'bold 30px "Noto Sans CJK SC"'; g.fillText('夜间要闻', 80, 170)
    g.font = '22px "Noto Sans CJK SC"'; g.fillText('老城区失联事件', 80, 220); g.fillText('累计已达 7 人', 80, 256)
    g.fillStyle = '#c1121f'; g.fillRect(0, 460, w, 50)
    g.fillStyle = '#fff'; g.font = 'bold 24px "Noto Sans CJK SC"'; g.fillText('快讯 | 警方呼吁市民夜间勿进入无照明巷道 · 地铁末班车 23:50', 20, 494)
    g.fillStyle = '#0d1b2f'; g.fillRect(0, 510, w, 66)
    g.fillStyle = '#9fb3d1'; g.font = '20px monospace'; g.fillText('CH 07  CITY NIGHT  23:41', 20, 552)
    for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y, w, 1) }
  }, { repeat: false })
}

/** 手机锁屏（充电中）。 */
export function phoneScreenTex(): THREE.CanvasTexture {
  return make('screen-phone', 256, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h)
    grd.addColorStop(0, '#26304a'); grd.addColorStop(1, '#0c0f18')
    g.fillStyle = grd; g.fillRect(0, 0, w, h)
    g.fillStyle = '#fff'; g.font = '200 76px "Noto Sans CJK SC"'; g.textAlign = 'center'; g.fillText('23:40', w / 2, 150)
    g.font = '18px "Noto Sans CJK SC"'; g.fillText('星期五 · 充电中 62%', w / 2, 186)
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(20, 240, w - 40, 64); g.fillRect(20, 314, w - 40, 64)
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = '15px "Noto Sans CJK SC"'
    g.fillText('边界线论坛  你关注的帖子有新回复', 30, 266); g.fillText('“六卷磁带的事是真的”', 30, 290)
    g.fillText('妈妈  到家了吗？早点睡', 30, 340); g.fillText('22:58', 30, 364)
  }, { repeat: false })
}

/** 后室周边海报：Level 0 黄色走廊 + NO-CLIP 标题（同人周边，非真实品牌）。 */
export function posterTex(kind: 'level0' | 'vhs' | 'art'): THREE.CanvasTexture {
  return make('poster-' + kind, 512, 768, (g, w, h) => {
    const r = rngOf(kind.length * 17)
    if (kind === 'level0') {
      g.fillStyle = '#c9b25a'; g.fillRect(0, 0, w, h)
      // 透视走廊
      g.fillStyle = '#d9c46a'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w * 0.62, h * 0.38); g.lineTo(w * 0.38, h * 0.38); g.fill()
      g.fillStyle = '#a99449'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.38, h * 0.38); g.lineTo(w * 0.38, h * 0.62); g.lineTo(0, h); g.fill()
      g.fillStyle = '#b8a24f'; g.beginPath(); g.moveTo(w, 0); g.lineTo(w * 0.62, h * 0.38); g.lineTo(w * 0.62, h * 0.62); g.lineTo(w, h); g.fill()
      g.fillStyle = '#8a7a45'; g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.38, h * 0.62); g.lineTo(w * 0.62, h * 0.62); g.lineTo(w, h); g.fill()
      g.fillStyle = '#fffbe0'; for (let i = 0; i < 4; i++) { const k = 1 - i * 0.22; g.fillRect(w / 2 - 60 * k, h * (0.04 + i * 0.09), 120 * k, 14 * k) }
      g.fillStyle = '#111'; g.fillRect(w * 0.47, h * 0.47, w * 0.06, h * 0.12)
      g.fillStyle = '#1a1a1a'; g.font = 'bold 72px "Noto Sans CJK SC"'; g.textAlign = 'center'; g.fillText('LEVEL 0', w / 2, h * 0.86)
      g.font = '22px monospace'; g.fillText('IF YOU NO-CLIP OUT OF REALITY…', w / 2, h * 0.92)
    } else if (kind === 'vhs') {
      g.fillStyle = '#121212'; g.fillRect(0, 0, w, h)
      g.fillStyle = '#e8d24a'; g.fillRect(40, 60, w - 80, 380)
      for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(40, 60 + i * 48, w - 80, 4) }
      g.fillStyle = '#f2f2f2'; g.font = 'bold 54px monospace'; g.textAlign = 'center'; g.fillText('FOUND', w / 2, 520); g.fillText('FOOTAGE', w / 2, 580)
      g.font = '20px monospace'; g.fillStyle = '#e8d24a'; g.fillText('TAPE 1 / 6  ·  ARCHIVE COPY', w / 2, 640)
      g.fillStyle = '#d33'; g.beginPath(); g.arc(80, 700, 10, 0, 7); g.fill(); g.fillStyle = '#ddd'; g.textAlign = 'left'; g.font = '18px monospace'; g.fillText('REC  00:13:37', 100, 706)
    } else {
      g.fillStyle = '#e9e3d6'; g.fillRect(0, 0, w, h)
      const cs = ['#d9a441', '#476a6f', '#c8553d', '#2d3047', '#93b7be']
      for (let i = 0; i < 9; i++) { g.fillStyle = cs[i % cs.length]; g.globalAlpha = 0.85; g.beginPath(); g.arc(r() * w, r() * h, 40 + r() * 120, 0, 7); g.fill() }
      g.globalAlpha = 1
      g.strokeStyle = '#2d3047'; g.lineWidth = 6; g.beginPath(); g.moveTo(40, h * 0.7); g.bezierCurveTo(w * 0.3, h * 0.4, w * 0.7, h * 0.9, w - 40, h * 0.5); g.stroke()
    }
    noise(g, w, h, 14, 2)
  }, { repeat: false })
}

/** 书脊（书架/书柜），1 张 = 一层书。 */
export function booksTex(seed: number): THREE.CanvasTexture {
  return make('books-' + seed, 512, 128, (g, w, h) => {
    const r = rngOf(seed)
    g.fillStyle = '#2a2420'; g.fillRect(0, 0, w, h)
    let x = 0
    while (x < w) {
      const bw = 10 + r() * 22, bh = h * (0.68 + r() * 0.3)
      g.fillStyle = ['#7a2e2e', '#2e4a7a', '#d9c9a3', '#3d6b4f', '#8a6a3a', '#1f1f24', '#b3473a', '#5b5f8a', '#e0dccf'][Math.floor(r() * 9)]
      g.fillRect(x, h - bh, bw - 1.5, bh)
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 2, h - bh + 10, bw - 6, 3); g.fillRect(x + 2, h - 18, bw - 6, 2)
      x += bw
    }
  }, { repeat: false })
}

/** 楼道小广告 / 寻人启事。 */
export function flyersTex(): THREE.CanvasTexture {
  return make('flyers', 1024, 384, (g, w, h) => {
    g.fillStyle = '#d9d8d0'; g.fillRect(0, 0, w, h)
    const r = rngOf(5)
    const items: [string, string, string][] = [['寻人启事', '有人见过他吗？\n最后出现：旧仓路后巷', '#fff7d0'], ['开锁 · 换锁', '24 小时上门\n电话 ·· ···· ····', '#ffffff'], ['管道疏通', '楼道 3 单元', '#ffe0e0'], ['寻人', '许某 17岁\n校服 白色球鞋', '#fff7d0'], ['房屋出租', '一室一厅 近地铁', '#e0f0ff'], ['请勿在楼道堆放杂物', '物业服务中心', '#ffffff']]
    items.forEach(([t, b, c], i) => {
      const x = 20 + (i % 6) * 166 + r() * 10, y = 30 + r() * 120, rot = (r() - 0.5) * 0.12
      g.save(); g.translate(x, y); g.rotate(rot)
      g.fillStyle = c; g.fillRect(0, 0, 150, 200)
      g.fillStyle = '#222'; g.font = 'bold 22px "Noto Sans CJK SC"'; g.fillText(t, 10, 34)
      if (t.startsWith('寻人')) { g.fillStyle = '#9a9a9a'; g.fillRect(30, 50, 90, 80) }
      g.fillStyle = '#333'; g.font = '14px "Noto Sans CJK SC"'
      b.split('\n').forEach((ln, k) => g.fillText(ln, 10, (t.startsWith('寻人') ? 152 : 70) + k * 20))
      g.fillStyle = 'rgba(200,200,200,0.7)'; g.fillRect(55, -6, 40, 14)
      g.restore()
    })
    noise(g, w, h, 10, 3)
  }, { repeat: false })
}

/** 挂钟表盘（23:40）。 */
export function clockTex(): THREE.CanvasTexture {
  return make('clock', 256, 256, (g, w) => {
    const c = w / 2
    g.fillStyle = '#f6f3ea'; g.beginPath(); g.arc(c, c, c - 4, 0, 7); g.fill()
    g.strokeStyle = '#222'; g.lineWidth = 3
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.sin(a) * (c - 14), c - Math.cos(a) * (c - 14)); g.lineTo(c + Math.sin(a) * (c - 30), c - Math.cos(a) * (c - 30)); g.stroke() }
    const hand = (a: number, len: number, wdt: number) => { g.lineWidth = wdt; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.sin(a) * len, c - Math.cos(a) * len); g.stroke() }
    hand(((23 % 12) + 40 / 60) / 12 * Math.PI * 2, c * 0.5, 7)
    hand(40 / 60 * Math.PI * 2, c * 0.75, 4)
    g.fillStyle = '#c1121f'; g.beginPath(); g.arc(c, c, 6, 0, 7); g.fill()
  }, { repeat: false })
}

/** 冰箱内壁/货架贴图（饮料、零食的平面示意）。 */
export function fridgeInsideTex(): THREE.CanvasTexture {
  return make('fridge-in', 256, 512, (g, w, h) => {
    g.fillStyle = '#eef3f6'; g.fillRect(0, 0, w, h)
    const r = rngOf(9)
    for (let s = 0; s < 4; s++) {
      const y = 40 + s * 115
      for (let i = 0; i < 5; i++) { g.fillStyle = ['#2d7dd2', '#f2c14e', '#e15554', '#3bb273', '#ffffff'][Math.floor(r() * 5)]; const bw = 22 + r() * 18, bh = 40 + r() * 50; g.fillRect(12 + i * 46, y + 100 - bh, bw, bh) }
      g.fillStyle = 'rgba(180,200,210,0.8)'; g.fillRect(0, y + 100, w, 6)
    }
  }, { repeat: false })
}

/** 品牌标签（虚构）：冰箱/洗衣机/电视上的小铭牌。 */
export function labelTex(text: string, fg = '#555', bg = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
  return make('label-' + text + fg + bg, 256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    g.fillStyle = fg; g.font = 'bold 34px "Noto Sans CJK SC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2)
  }, { repeat: false })
}

export const __foyerTexHash = hash
