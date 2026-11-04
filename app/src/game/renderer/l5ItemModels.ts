// Level 5（恐怖旅馆）新物品的专用低模（此前走 itemsMesh 的通用 fallback 方块）：
//   mahjongtile 贝弗莉的麻将牌：象牙白牌面（红「中」）+ 青色牌背（闭着的眼睛）+ 两色分层侧面，圆角
//   key437      437 号房钥匙：黄铜房门钥匙（环柄/颈环/杆/齿）+ 钥匙圈 + 椭圆银牌（蓝字「437」）
//   bagTag      行李牌：圆角黄铜牌（正面酒店花押、背面打号）+ 穿孔红绳
//   roomtea     客房茶：骨瓷茶杯（杯沿金线）+ 茶托 + 红茶液面
//   gentletter  绅士的情书：奶白信封（正面手写「致行李员」，无邮票）+ 背面封舌 + 暗红火漆（野兽爪印）
// 规范：一张 1024² 程序绘制颜色图集（4×4 分区、8 px 内缩），运行时 Canvas 生成一次、全部实例共享（renderer 不释放纹理）；
// 每件 ≤ 3 个材质批次（按材质合并非索引几何），≤ 1,200 三角面；模型原点在几何中心，正面朝 +Z，单位 m。
// 地面展示沿用其它物品的放大比例（小件约 2–3 倍实物），手持姿态见 viewmodel.buildHeldItem。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { litMaterial } from './shared'
import { heightToNormal } from './pbrCanvas' // [l5items v2]

export const L5_ITEM_TYPES = ['mahjongtile', 'key437', 'bagTag', 'roomtea', 'gentletter', 'roomcard', 'fatedie', 'brokendie', 'brokenrecord', 'diereceipt'] as const
export type L5ItemType = typeof L5_ITEM_TYPES[number]
export const isL5ItemType = (t: string): t is L5ItemType => (L5_ITEM_TYPES as readonly string[]).includes(t)

// ---------- 图集 ----------
const TILE = { tileFace: 0, tileBack: 1, tileSide: 2, brass: 3, tag437: 4, bagFront: 5, bagBack: 6, cord: 7, porcelain: 8, tea: 9, saucer: 10, envFront: 11, envBack: 12, wax: 13, steel: 14, paper: 15 } as const
type Rect = readonly [number, number, number, number]
const FULL: Rect = [0, 0, 1, 1]
const CJK = '"Noto Sans SC","Source Han Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
const SERIF = '"Noto Serif SC","Songti SC","SimSun",serif'
const HAND = '"KaiTi","STKaiti","Kaiti SC","Noto Serif SC",' + CJK

let atlasTex: THREE.CanvasTexture | null = null
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296) }

function drawAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024
  const x = c.getContext('2d')!
  const R = rng(20261101)
  // 每个分区在 (tx,ty) 起、256×256；内容区 8..248。绘制时整块铺满，内缩边界只保证采样不串色。
  const tile = (i: number, fn: (o: { x0: number; y0: number }) => void) => {
    const x0 = (i % 4) * 256, y0 = Math.floor(i / 4) * 256
    x.save(); x.beginPath(); x.rect(x0, y0, 256, 256); x.clip(); fn({ x0, y0 }); x.restore()
  }
  /** 分区被拉伸到非正方形表面上：先按表面宽高比 k=宽/高 横向预压缩，贴上后比例正常。 */
  const aspect = (x0: number, y0: number, k: number, fn: () => void) => {
    x.save(); x.translate(x0 + 128, y0 + 128); x.scale(1 / k, 1); x.translate(-(x0 + 128), -(y0 + 128)); fn(); x.restore()
  }
  const grain = (x0: number, y0: number, n: number, col: (r: number) => string, w = 2, h = 1) => {
    for (let i = 0; i < n; i++) { x.fillStyle = col(R()); x.fillRect(x0 + R() * 256, y0 + R() * 256, 1 + R() * w, h) }
  }
  const ivory = (x0: number, y0: number) => {
    const g = x.createLinearGradient(x0, y0, x0 + 256, y0 + 256); g.addColorStop(0, '#f4ecd6'); g.addColorStop(1, '#e6dab9')
    x.fillStyle = g; x.fillRect(x0, y0, 256, 256)
    grain(x0, y0, 900, r => `rgba(160,130,80,${.03 + r * .05})`, 6, 1)
  }
  const teal = (x0: number, y0: number) => {
    const g = x.createLinearGradient(x0, y0, x0, y0 + 256); g.addColorStop(0, '#2f7f74'); g.addColorStop(1, '#1f5f57')
    x.fillStyle = g; x.fillRect(x0, y0, 256, 256)
    grain(x0, y0, 700, r => `rgba(10,40,36,${.06 + r * .08})`, 3, 2)
  }
  const brass = (x0: number, y0: number, light = 0) => {
    const g = x.createLinearGradient(x0, y0, x0 + 256, y0 + 256)
    g.addColorStop(0, light ? '#f0d58a' : '#d9b45a'); g.addColorStop(.5, light ? '#d8b25a' : '#b88f3c'); g.addColorStop(1, light ? '#b98f3e' : '#8f6a28')
    x.fillStyle = g; x.fillRect(x0, y0, 256, 256)
    for (let i = 0; i < 160; i++) { // 细划痕
      x.strokeStyle = `rgba(${R() < .5 ? '255,240,200' : '70,45,10'},${.08 + R() * .12})`; x.lineWidth = .6
      const a = R() * Math.PI, l = 8 + R() * 40, px = x0 + R() * 256, py = y0 + R() * 256
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke()
    }
    grain(x0, y0, 500, r => `rgba(60,38,8,${.05 + r * .1})`, 2, 2)
  }
  const paperBase = (x0: number, y0: number, a: string, b: string) => {
    const g = x.createLinearGradient(x0, y0, x0 + 256, y0 + 256); g.addColorStop(0, a); g.addColorStop(1, b)
    x.fillStyle = g; x.fillRect(x0, y0, 256, 256)
    grain(x0, y0, 1600, r => `rgba(120,95,60,${.025 + r * .04})`, 3, 1)
  }

  // 0 麻将牌面：象牙 + 雕刻红「中」（带阴刻暗边）
  tile(TILE.tileFace, ({ x0, y0 }) => {
    ivory(x0, y0)
    aspect(x0, y0, .737, () => {
      x.textAlign = 'center'; x.textBaseline = 'middle'
      x.font = `bold 128px ${SERIF}`
      x.fillStyle = 'rgba(90,40,20,.45)'; x.fillText('中', x0 + 131, y0 + 134)
      x.fillStyle = '#b0201c'; x.fillText('中', x0 + 128, y0 + 131)
    })
    // 牌面边缘一圈淡淡的使用痕
    x.strokeStyle = 'rgba(150,120,70,.35)'; x.lineWidth = 6; x.strokeRect(x0 + 10, y0 + 10, 236, 236)
  })
  // 1 麻将牌背：青色 + 闭着的眼睛（象牙色线描）
  tile(TILE.tileBack, ({ x0, y0 }) => {
    teal(x0, y0)
    const cx = x0 + 128, cy = y0 + 128
    x.save(); x.translate(cx, cy); x.scale(1 / .737 * .7, 1); x.translate(-cx, -cy)
    x.strokeStyle = '#efe3c2'; x.lineCap = 'round'; x.lineWidth = 7
    x.beginPath(); x.moveTo(cx - 72, cy - 6); x.quadraticCurveTo(cx, cy + 46, cx + 72, cy - 6); x.stroke() // 闭合的眼睑
    x.lineWidth = 3.5; x.beginPath(); x.moveTo(cx - 64, cy - 14); x.quadraticCurveTo(cx, cy - 46, cx + 64, cy - 14); x.stroke() // 上眼睑轮廓
    for (let k = -3; k <= 3; k++) { // 睫毛
      const t = (k + 3) / 6, px = cx - 60 + t * 120, py = cy - 6 + Math.sin(t * Math.PI) * 26
      x.lineWidth = 4; x.beginPath(); x.moveTo(px, py); x.lineTo(px + k * 4, py + 20); x.stroke()
    }
    x.restore()
    x.strokeStyle = 'rgba(239,227,194,.5)'; x.lineWidth = 3; x.strokeRect(x0 + 22, y0 + 22, 212, 212)
  })
  // 2 麻将牌侧面：u=0 → 牌背（青），u=1 → 牌面（象牙），u≈0.38 分层线
  tile(TILE.tileSide, ({ x0, y0 }) => {
    ivory(x0, y0)
    teal(x0, y0); ivory(x0 + 97, y0) // 先铺青色，再从 38% 处铺象牙（ivory 只画 256 宽，被 clip）
    x.fillStyle = 'rgba(40,30,15,.35)'; x.fillRect(x0 + 95, y0, 3, 256)
  })
  // 3 黄铜（钥匙/牌边）
  tile(TILE.brass, ({ x0, y0 }) => brass(x0, y0))
  // 4 437 号房钥匙牌：椭圆银牌 + 蓝字「437」+ 酒店小字（正反同图，背面由投影翻转保证可读）
  tile(TILE.tag437, ({ x0, y0 }) => {
    const g = x.createLinearGradient(x0, y0, x0 + 256, y0 + 256); g.addColorStop(0, '#eef0f2'); g.addColorStop(.55, '#b9bec4'); g.addColorStop(1, '#8e949b')
    x.fillStyle = g; x.fillRect(x0, y0, 256, 256)
    grain(x0, y0, 400, r => `rgba(40,45,55,${.05 + r * .08})`, 10, 1)
    x.strokeStyle = 'rgba(60,66,76,.6)'; x.lineWidth = 4; x.beginPath(); x.ellipse(x0 + 128, y0 + 128, 108, 108, 0, 0, Math.PI * 2); x.stroke()
    aspect(x0, y0, .708, () => {
      x.textAlign = 'center'; x.textBaseline = 'middle'
      x.fillStyle = '#1d3f8f'; x.font = `bold 62px ${SERIF}`; x.fillText('437', x0 + 128, y0 + 142)
      x.font = `bold 16px ${SERIF}`; x.fillStyle = '#2b4a8a'; x.fillText('ROOM', x0 + 128, y0 + 86)
    })
    x.beginPath(); x.arc(x0 + 128, y0 + 30, 9, 0, Math.PI * 2); x.fillStyle = '#4a4f57'; x.fill() // 挂孔
  })
  // 5 行李牌正面：黄铜 + 压印酒店花押（双圈 + 交织字母）+ 边框
  tile(TILE.bagFront, ({ x0, y0 }) => {
    brass(x0, y0, 1)
    x.strokeStyle = 'rgba(80,52,12,.75)'; x.lineWidth = 4; x.strokeRect(x0 + 18, y0 + 30, 220, 196)
    x.strokeStyle = 'rgba(255,240,190,.5)'; x.lineWidth = 2; x.strokeRect(x0 + 22, y0 + 34, 212, 188)
    x.save(); x.translate(x0 + 128, y0 + 128); x.scale(1 / 1.625, 1); x.translate(-(x0 + 128), -(y0 + 128))
    const cx = x0 + 150, cy = y0 + 128
    x.strokeStyle = 'rgba(70,45,10,.85)'; x.lineWidth = 4; x.beginPath(); x.arc(cx, cy, 64, 0, Math.PI * 2); x.stroke()
    x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, 56, 0, Math.PI * 2); x.stroke()
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `italic bold 70px ${SERIF}`
    x.fillStyle = 'rgba(255,236,180,.55)'; x.fillText('H', cx - 12, cy + 3); x.fillText('L', cx + 16, cy + 9)
    x.fillStyle = 'rgba(70,45,10,.9)'; x.fillText('H', cx - 14, cy + 1); x.fillText('L', cx + 14, cy + 7)
    x.font = `bold 15px ${SERIF}`; x.fillText('HOTEL · LEVEL 5', cx, cy + 82)
    x.fillText('✦', cx, cy - 80)
    x.restore()
  })
  // 6 行李牌背面：打号（冲压数字）+「凭牌取物」
  tile(TILE.bagBack, ({ x0, y0 }) => {
    brass(x0, y0, 1)
    x.strokeStyle = 'rgba(80,52,12,.75)'; x.lineWidth = 4; x.strokeRect(x0 + 18, y0 + 30, 220, 196)
    x.save(); x.translate(x0 + 128, y0 + 128); x.scale(1 / 1.625, 1); x.translate(-(x0 + 128), -(y0 + 128))
    x.textAlign = 'center'; x.textBaseline = 'middle'
    x.font = `bold 26px ${CJK}`; x.fillStyle = 'rgba(70,45,10,.9)'; x.fillText('BAGGAGE · 行李', x0 + 140, y0 + 72)
    x.font = `bold 64px "Courier New",monospace`
    x.fillStyle = 'rgba(255,238,190,.5)'; x.fillText('No.', x0 + 142, y0 + 138)
    x.fillStyle = 'rgba(55,35,8,.95)'; x.fillText('No.', x0 + 140, y0 + 136)
    x.lineWidth = 3; x.strokeStyle = 'rgba(60,40,10,.8)'; x.beginPath(); x.moveTo(x0 + 70, y0 + 178); x.lineTo(x0 + 212, y0 + 178); x.stroke()
    x.font = `16px ${CJK}`; x.fillText('凭牌向行李员取回', x0 + 140, y0 + 202)
    x.restore()
  })
  // 7 红绳：斜向绞纹（沿 u 方向被拉长后仍像绞绳）
  tile(TILE.cord, ({ x0, y0 }) => {
    x.fillStyle = '#a3171c'; x.fillRect(x0, y0, 256, 256)
    for (let i = -16; i < 32; i++) {
      x.strokeStyle = i % 2 ? 'rgba(60,0,4,.55)' : 'rgba(255,120,110,.35)'; x.lineWidth = 7
      x.beginPath(); x.moveTo(x0 + i * 16, y0); x.lineTo(x0 + i * 16 + 256, y0 + 256); x.stroke()
    }
  })
  // 8 骨瓷杯身：白釉 + 上沿金线（v≥0.86）+ 下缘细金线 + 一枚小花押；左下角 (u<.25,v<.25) 留纯白区给内壁/把手
  tile(TILE.porcelain, ({ x0, y0 }) => {
    const g = x.createLinearGradient(x0, y0, x0, y0 + 256); g.addColorStop(0, '#fbf8f1'); g.addColorStop(1, '#ece6da')
    x.fillStyle = g; x.fillRect(x0, y0, 256, 256)
    grain(x0, y0, 300, r => `rgba(150,140,120,${.02 + r * .03})`, 4, 1)
    const gold = (y: number, h: number) => { const gg = x.createLinearGradient(x0, y0 + y, x0, y0 + y + h); gg.addColorStop(0, '#f3d27a'); gg.addColorStop(.5, '#c99a32'); gg.addColorStop(1, '#a57a20'); x.fillStyle = gg; x.fillRect(x0, y0 + y, 256, h) }
    gold(8, 22); gold(40, 5); gold(226, 6)
    // 小花押（杯身正中靠上），在 u≈0.5 处
    x.strokeStyle = '#c29a3a'; x.lineWidth = 2.5; x.beginPath(); x.arc(x0 + 128, y0 + 110, 20, 0, Math.PI * 2); x.stroke()
    x.fillStyle = '#b8902f'; x.font = `italic bold 22px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('HL', x0 + 128, y0 + 111)
  })
  // 9 红茶液面：深红棕 + 中心暗、边缘偏亮（茶汤与杯壁接触的亮圈）+ 高光
  tile(TILE.tea, ({ x0, y0 }) => {
    const g = x.createRadialGradient(x0 + 128, y0 + 128, 10, x0 + 128, y0 + 128, 128)
    g.addColorStop(0, '#4a1a08'); g.addColorStop(.75, '#7a2e10'); g.addColorStop(.95, '#b0602a'); g.addColorStop(1, '#c98a50')
    x.fillStyle = g; x.fillRect(x0, y0, 256, 256)
    x.fillStyle = 'rgba(255,230,200,.22)'; x.beginPath(); x.ellipse(x0 + 96, y0 + 92, 40, 14, -.5, 0, Math.PI * 2); x.fill()
  })
  // 10 茶托：白釉 + 两道金线（沿 v：外沿 v≈0.08、内圈 v≈0.7）
  tile(TILE.saucer, ({ x0, y0 }) => {
    const g = x.createLinearGradient(x0, y0, x0, y0 + 256); g.addColorStop(0, '#f8f4ec'); g.addColorStop(1, '#efe9de')
    x.fillStyle = g; x.fillRect(x0, y0, 256, 256)
    x.fillStyle = '#c99a32'; x.fillRect(x0, y0 + 226, 256, 18); x.fillRect(x0, y0 + 70, 256, 6)
  })
  // 11 信封正面：奶白纸 + 手写「致行李员」+ 右上角空着的邮票位（无邮票）
  tile(TILE.envFront, ({ x0, y0 }) => {
    paperBase(x0, y0, '#f3ead6', '#e4d7bb')
    x.strokeStyle = 'rgba(150,120,80,.35)'; x.setLineDash([6, 5]); x.lineWidth = 2; x.strokeRect(x0 + 186, y0 + 30, 50, 60); x.setLineDash([])
    x.save(); x.translate(x0 + 120, y0 + 150); x.scale(1 / 1.54, 1); x.rotate(-.06)
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#26202a'
    x.font = `italic 46px ${HAND}`; x.fillText('致行李员', 0, 0)
    x.strokeStyle = '#2a2430'; x.lineWidth = 2; x.beginPath(); x.moveTo(-92, 30); x.bezierCurveTo(-40, 38, 40, 22, 96, 32); x.stroke()
    x.restore()
  })
  // 12 信封背面：封舌 V 形折痕与阴影（火漆另作几何）
  tile(TILE.envBack, ({ x0, y0 }) => {
    paperBase(x0, y0, '#efe5cf', '#ddcfb1')
    x.fillStyle = 'rgba(120,95,60,.12)'
    x.beginPath(); x.moveTo(x0, y0 + 8); x.lineTo(x0 + 128, y0 + 150); x.lineTo(x0 + 256, y0 + 8); x.closePath(); x.fill()
    x.strokeStyle = 'rgba(110,85,50,.55)'; x.lineWidth = 2.5
    x.beginPath(); x.moveTo(x0 + 8, y0 + 12); x.lineTo(x0 + 128, y0 + 150); x.lineTo(x0 + 248, y0 + 12); x.stroke()
    x.beginPath(); x.moveTo(x0 + 8, y0 + 244); x.lineTo(x0 + 110, y0 + 150); x.moveTo(x0 + 248, y0 + 244); x.lineTo(x0 + 146, y0 + 150); x.stroke()
  })
  // 13 火漆：暗红蜡 + 压印野兽爪印（掌垫 + 四趾 + 弯爪），外圈一道压痕
  tile(TILE.wax, ({ x0, y0 }) => {
    const g = x.createRadialGradient(x0 + 110, y0 + 100, 20, x0 + 128, y0 + 128, 150)
    g.addColorStop(0, '#9e1b1b'); g.addColorStop(.7, '#6e0d10'); g.addColorStop(1, '#4a070a')
    x.fillStyle = g; x.fillRect(x0, y0, 256, 256)
    x.strokeStyle = 'rgba(30,0,0,.6)'; x.lineWidth = 5; x.beginPath(); x.arc(x0 + 128, y0 + 128, 92, 0, Math.PI * 2); x.stroke()
    const pressed = (draw: () => void) => { // 压印：先画下沿亮边，再画暗面
      x.save(); x.translate(2, 3); x.fillStyle = 'rgba(220,90,80,.45)'; draw(); x.fill(); x.restore()
      x.fillStyle = '#3a0306'; draw(); x.fill()
    }
    const cx = x0 + 128, cy = y0 + 140
    pressed(() => { x.beginPath(); x.ellipse(cx, cy + 22, 34, 26, 0, 0, Math.PI * 2) })
    for (const [dx, dy, r] of [[-46, -18, 13], [-18, -44, 14], [18, -44, 14], [46, -18, 13]] as const) {
      pressed(() => { x.beginPath(); x.ellipse(cx + dx, cy + dy, r * .8, r, dx * .01, 0, Math.PI * 2) })
      pressed(() => { // 弯爪
        x.beginPath(); const bx = cx + dx * 1.25, by = cy + dy - r - 6
        x.moveTo(bx - 5, by + 4); x.quadraticCurveTo(bx + dx * .08, by - 22, bx + dx * .22, by - 26); x.quadraticCurveTo(bx + dx * .02, by - 10, bx + 5, by + 4); x.closePath()
      })
    }
    x.fillStyle = 'rgba(255,170,150,.18)'; x.beginPath(); x.ellipse(x0 + 90, y0 + 74, 34, 12, -.6, 0, Math.PI * 2); x.fill()
  })
  // 14 钢（钥匙圈）
  tile(TILE.steel, ({ x0, y0 }) => {
    const g = x.createLinearGradient(x0, y0, x0 + 256, y0); g.addColorStop(0, '#9aa0a8'); g.addColorStop(.5, '#e2e5e8'); g.addColorStop(1, '#868c94')
    x.fillStyle = g; x.fillRect(x0, y0, 256, 256)
  })
  // 15 信封纸边（纸芯色）
  tile(TILE.paper, ({ x0, y0 }) => paperBase(x0, y0, '#e8dcc0', '#d6c7a6'))
  return c
}

function atlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex
  const t = new THREE.CanvasTexture(drawAtlas())
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter
  t.name = 'l5-items-atlas'
  atlasTex = t
  return t
}
const mat = (roughness: number, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  litMaterial({ color: '#ffffff', map: atlas(), roughness, metalness, envBase: metalness > .3 ? .38 : .14, ...(extra as object) })

// ---------- 几何收集器 ----------
type V3 = readonly [number, number, number]
interface Place { p?: V3; r?: V3; s?: V3 | number }
const tileUV = (tile: number, rect: Rect, u: number, v: number): [number, number] => {
  const tx = (tile % 4) * 256 + 8, ty = Math.floor(tile / 4) * 256 + 8
  const cu = Math.min(1, Math.max(0, u)), cv = Math.min(1, Math.max(0, v))
  const uu = rect[0] + cu * (rect[2] - rect[0]), vv = rect[1] + cv * (rect[3] - rect[1])
  return [(tx + uu * 240) / 1024, 1 - (ty + (1 - vv) * 240) / 1024]
}
/** 盒投影：+Z 面用 pz 分区、-Z 面用 nz 分区（u 翻转，背面文字可读），其余面用 side 分区（u 沿 z）。 */
export interface BoxTiles { pz: number; nz: number; side: number; pzRect?: Rect; nzRect?: Rect; sideRect?: Rect }

class Parts {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  private prep(geo: THREE.BufferGeometry) {
    const g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n)
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
    return g
  }
  private push(g: THREE.BufferGeometry, m: THREE.Material, place: Place) {
    // 剔除零面积三角形
    const pos = g.getAttribute('position'), keep: number[] = []
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1).sub(a); c.fromBufferAttribute(pos, i + 2).sub(a)
      if (b.cross(c).lengthSq() > 1e-16) keep.push(i, i + 1, i + 2)
    }
    if (keep.length !== pos.count) {
      const clean = new THREE.BufferGeometry()
      for (const n of Object.keys(g.attributes)) {
        const at = g.getAttribute(n), vals = new Float32Array(keep.length * at.itemSize)
        for (let i = 0; i < keep.length; i++) for (let k = 0; k < at.itemSize; k++) vals[i * at.itemSize + k] = at.array[keep[i] * at.itemSize + k]
        clean.setAttribute(n, new THREE.BufferAttribute(vals, at.itemSize))
      }
      g.dispose(); g = clean
    }
    g.clearGroups()
    const s = place.s ?? 1, sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s), r = place.r ?? [0, 0, 0]
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...(place.p ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), sc))
    const list = this.buckets.get(m) ?? []; list.push(g); this.buckets.set(m, list)
  }
  /** 用几何自带 UV（0..1）映射进分区子矩形；groupRects 按几何组分别指定（如圆柱侧面 / 顶盖 / 底盖）。 */
  own(geo: THREE.BufferGeometry, m: THREE.Material, tile: number, rect: Rect = FULL, place: Place = {}, groupRects?: (readonly [number, Rect])[]) {
    const groups = geo.groups.map(gr => ({ ...gr }))
    const g = this.prep(geo), uv = g.getAttribute('uv')
    const triTile = new Array(uv.count).fill(null) as (readonly [number, Rect] | null)[]
    if (groupRects && groups.length) for (const gr of groups) for (let i = gr.start; i < gr.start + gr.count && i < uv.count; i++) triTile[i] = groupRects[gr.materialIndex ?? 0] ?? null
    for (let i = 0; i < uv.count; i++) { const [t, rc] = triTile[i] ?? [tile, rect]; uv.setXY(i, ...tileUV(t, rc, uv.getX(i), uv.getY(i))) }
    this.push(g, m, place)
  }
  /** 盒投影（按三角形法线主轴选择分区）。 */
  box(geo: THREE.BufferGeometry, m: THREE.Material, tiles: BoxTiles, place: Place = {}) {
    const g = this.prep(geo)
    g.computeBoundingBox()
    const bb = g.boundingBox!, size = bb.getSize(new THREE.Vector3())
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv')
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3()
    const nx = (v: number) => (v - bb.min.x) / (size.x || 1), ny = (v: number) => (v - bb.min.y) / (size.y || 1), nz = (v: number) => (v - bb.min.z) / (size.z || 1)
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2)
      n.copy(b).sub(a).cross(c.clone().sub(a))
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z)
      for (let k = 0; k < 3; k++) {
        const px = pos.getX(i + k), py = pos.getY(i + k), pz = pos.getZ(i + k)
        let t: number, rc: Rect, u: number, v: number
        if (az >= ax && az >= ay) {
          if (n.z >= 0) { t = tiles.pz; rc = tiles.pzRect ?? FULL; u = nx(px) } else { t = tiles.nz; rc = tiles.nzRect ?? FULL; u = 1 - nx(px) }
          v = ny(py)
        } else { t = tiles.side; rc = tiles.sideRect ?? FULL; u = nz(pz); v = ax >= ay ? ny(py) : nx(px) }
        uv.setXY(i + k, ...tileUV(t, rc, u, v))
      }
    }
    this.push(g, m, place)
  }
  finish(name: string): THREE.Group {
    const root = new THREE.Group(); let i = 0
    for (const [m, parts] of this.buckets) {
      const geometry = mergeGeometries(parts, false)
      for (const p of parts) p.dispose()
      if (!geometry) throw new Error(`Cannot merge ${name}`)
      geometry.computeBoundingBox(); geometry.computeBoundingSphere()
      const mesh = new THREE.Mesh(geometry, m); mesh.name = `${name}-${i++}`
      root.add(mesh)
    }
    root.name = `${name}-l5-model`
    root.userData.l5ItemModel = name
    return root
  }
}
const PI = Math.PI
const lathe = (pts: readonly (readonly number[])[], seg = 20) => new THREE.LatheGeometry(pts.map(([px, py]) => new THREE.Vector2(px, py)), seg)
const tube = (pts: readonly V3[], r: number, seg = 24, sides = 6, closed = false) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), closed), seg, r, sides, closed)
function roundRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  return s
}
const extrude = (shape: THREE.Shape, depth: number, seg = 10) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: seg }).translate(0, 0, -depth / 2)

// ---------- 模型 ----------
/** 贝弗莉的麻将牌：立放，0.07 × 0.095 × 0.05 m（实物约 2.7 倍）；+Z 牌面「中」，-Z 牌背闭眼。 */
function buildMahjongTile() {
  const P = new Parts(), m = mat(.35, 0)
  P.box(new RoundedBoxGeometry(.07, .095, .05, 2, .007), m, { pz: TILE.tileFace, nz: TILE.tileBack, side: TILE.tileSide })
  return P.finish('mahjongtile')
}

/** 437 号房钥匙：竖放，钥匙长 0.15 m，银牌 0.07 × 0.1 m 挂在环柄旁。 */
function buildKey437() {
  const P = new Parts(), brassM = mat(.38, .85), tagM = mat(.32, .7)
  const BR = [TILE.brass, FULL] as const
  // 环柄（三叶形简化为圆环 + 两个小耳）
  P.own(new THREE.TorusGeometry(.022, .0055, 6, 18), brassM, ...BR, { p: [0, .052, 0] })
  for (const sx of [-1, 1]) P.own(new THREE.SphereGeometry(.0065, 8, 6), brassM, ...BR, { p: [sx * .026, .05, 0] })
  // 颈环 + 杆
  P.own(new THREE.CylinderGeometry(.0068, .0068, .01, 10), brassM, ...BR, { p: [0, .026, 0] })
  P.own(new THREE.CylinderGeometry(.0046, .0046, .085, 8), brassM, ...BR, { p: [0, -.025, 0] })
  P.own(new THREE.SphereGeometry(.005, 8, 6), brassM, ...BR, { p: [0, -.068, 0] })
  // 钥匙齿（两级台阶）
  P.box(new THREE.BoxGeometry(.022, .018, .004), brassM, { pz: TILE.brass, nz: TILE.brass, side: TILE.brass }, { p: [.012, -.056, 0] })
  P.box(new THREE.BoxGeometry(.01, .008, .004), brassM, { pz: TILE.brass, nz: TILE.brass, side: TILE.brass }, { p: [.027, -.06, 0] })
  // 钥匙圈（钢）穿过环柄，挂着椭圆银牌
  P.own(new THREE.TorusGeometry(.013, .0016, 5, 16), tagM, TILE.steel, FULL, { p: [0, .083, 0], r: [0, PI / 2, 0] })
  const oval = new THREE.Shape(); oval.absellipse(0, 0, .034, .048, 0, PI * 2, false, 0)
  const hole = new THREE.Path(); hole.absarc(0, .036, .0045, 0, PI * 2, true); oval.holes.push(hole)
  // 银牌挂点在钥匙圈前沿 (0, .083, .013)，向 -X 侧偏摆，牌面朝前
  P.box(extrude(oval, .0035, 20).translate(0, -.036, 0), tagM, { pz: TILE.tag437, nz: TILE.tag437, side: TILE.steel }, { p: [0, .083, .016], r: [0, .1, -.38] })
  return P.finish('key437')
}

/** 行李牌：立放，黄铜牌 0.13 × 0.08 m，左端穿孔系红绳圈。 */
function buildBagTag() {
  const P = new Parts(), brassM = mat(.4, .8), cordM = mat(.9, 0)
  const s = roundRectShape(.13, .08, .012)
  const hole = new THREE.Path(); hole.absarc(-.05, 0, .0065, 0, PI * 2, true); s.holes.push(hole)
  P.box(extrude(s, .004, 8), brassM, { pz: TILE.bagFront, nz: TILE.bagBack, side: TILE.brass })
  // 孔边铆圈
  P.own(new THREE.TorusGeometry(.0078, .0018, 5, 14), brassM, TILE.brass, FULL, { p: [-.05, 0, .0022] })
  P.own(new THREE.TorusGeometry(.0078, .0018, 5, 14), brassM, TILE.brass, FULL, { p: [-.05, 0, -.0022] })
  // 红绳：穿过孔向左上方绕成一个松散的圈并打结
  const loop: V3[] = [[-.05, -.004, .006], [-.062, .01, .012], [-.085, .035, .01], [-.098, .065, 0], [-.085, .085, -.012], [-.062, .07, -.012], [-.05, .02, -.008], [-.05, .004, -.006], [-.05, -.004, .006]]
  P.own(tube(loop, .0026, 40, 6, true), cordM, TILE.cord)
  P.own(new THREE.SphereGeometry(.0058, 8, 6), cordM, TILE.cord, FULL, { p: [-.093, .07, 0] })
  for (const [dx, dy] of [[-.006, -.02], [.004, -.022]]) P.own(tube([[-.093, .068, 0], [-.093 + dx * .6, .055, .002], [-.093 + dx, .068 + dy, .003]], .0018, 6, 5), cordM, TILE.cord)
  return P.finish('bagTag')
}

/** 客房茶：骨瓷茶杯（口径 0.1 m）放在茶托（直径 0.19 m）上，杯内红茶。原点在整体几何中心。 */
function buildRoomTea() {
  const P = new Parts(), porc = mat(.22, 0), tea = mat(.08, 0)
  const WHITE: Rect = [0, 0, .25, .25]
  // 茶托：底面（纯白）+ 上表面（外沿 / 内圈金线）
  P.own(lathe([[0, 0], [.05, 0], [.054, .004], [.088, .013], [.094, .016]], 28), porc, TILE.saucer, [0, .3, 1, .32])
  P.own(lathe([[.094, .016], [.09, .019], [.06, .011], [.042, .0085], [0, .0085]], 28), porc, TILE.saucer)
  // 杯：外壁（金线在上沿）+ 杯沿 + 内壁
  const y0 = .0085
  const outer = [[0, y0], [.024, y0], [.026, y0 + .004], [.024, y0 + .008], [.034, y0 + .018], [.044, y0 + .034], [.049, y0 + .052], [.051, y0 + .064]]
  P.own(lathe(outer, 24), porc, TILE.porcelain, [0, 0, 1, 1])
  P.own(lathe([[.051, y0 + .064], [.0505, y0 + .067], [.047, y0 + .066]], 24), porc, TILE.porcelain, [0, .9, 1, .97])
  P.own(lathe([[.047, y0 + .066], [.045, y0 + .05], [.04, y0 + .032], [.03, y0 + .016], [0, y0 + .012]], 24), porc, TILE.porcelain, WHITE)
  // 茶汤液面
  P.own(new THREE.CircleGeometry(.0445, 24), tea, TILE.tea, FULL, { p: [0, y0 + .052, 0], r: [-PI / 2, 0, 0] })
  // 把手：半环（在 +X 侧，环面竖直）
  P.own(new THREE.TorusGeometry(.017, .0045, 6, 14, PI * 1.25), porc, TILE.porcelain, WHITE, { p: [.056, y0 + .036, 0], r: [0, 0, -PI * .62] })
  const g = P.finish('roomtea')
  g.position.y = -(y0 + .067) / 2
  const root = new THREE.Group(); root.add(g); root.name = 'roomtea-l5-root'; root.userData.l5ItemModel = 'roomtea'
  return root
}

/** 绅士的情书：信封 0.2 × 0.13 × 0.006 m，背面封舌尖上一枚火漆（爪印）。返回竖立版（+Z 正面）。 */
function buildGentLetter() {
  const P = new Parts(), paper = mat(.85, 0), wax = mat(.3, 0)
  // 信封略微鼓起：中间厚、四边薄——用圆角盒近似
  P.box(new RoundedBoxGeometry(.2, .13, .006, 2, .0025), paper, { pz: TILE.envFront, nz: TILE.envBack, side: TILE.paper })
  // 火漆：不规则圆饼（半径带起伏），压在背面封舌尖（tile12 中封舌尖在 v≈0.42 → y≈-0.01）
  const seal = new THREE.Shape(), N = 22
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * PI * 2, r = .021 * (1 + .09 * Math.sin(a * 5 + 1.3) + .05 * Math.sin(a * 9))
    if (i === 0) seal.moveTo(Math.cos(a) * r, Math.sin(a) * r); else seal.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  // 盒投影的 -Z 面 u 翻转；火漆正面朝 -Z（贴在信封背面），翻转后爪印与绘制方向一致
  P.box(extrude(seal, .004, 4), wax, { pz: TILE.wax, nz: TILE.wax, side: TILE.wax, sideRect: [.05, .05, .15, .95] }, { p: [0, -.012, -.005] })
  return P.finish('gentletter')
}

// ---------- [l5items v2] 第三期：房卡 / 命运之骰 / 碎骰子 / 破唱片 / 购买凭证（第二张 4×4 图集，分区约定同上）----------
// v2：颜色 / 高度→法线 / 粗糙度三张同布局图集（PBR）；房卡卡面楼层房号随实际绑定动态重绘（syncRoomCardLabel）。
const T2 = { cardFront: 0, cardBack: 1, die: 2, dieCrack: 3, vinyl: 4, vinylEdge: 5, receipt: 6, gold: 7, receiptBack: 8, cardEdge: 9 } as const
let atlas2Tex: THREE.CanvasTexture | null = null, atlas2N: THREE.CanvasTexture | null = null, atlas2R: THREE.CanvasTexture | null = null
let atlas2Canvas: HTMLCanvasElement | null = null
let cardLabel = { floor: 0, no: 0 }
type Layer = 'c' | 'h' | 'r'
function tileOf(i: number) { return { x0: (i % 4) * 256, y0: Math.floor(i / 4) * 256 } }
/** 房卡正面（单独可重绘：楼层 / 房号随绑定变化）。卡面 0.085×0.054 → 横向预压缩 1/1.57 */
function drawCardFront(x: CanvasRenderingContext2D, L: Layer) {
  const { x0, y0 } = tileOf(T2.cardFront)
  x.save(); x.beginPath(); x.rect(x0, y0, 256, 256); x.clip()
  if (L === 'c') { const g = x.createLinearGradient(x0, y0, x0 + 256, y0 + 256); g.addColorStop(0, '#6e1420'); g.addColorStop(.6, '#4e0d17'); g.addColorStop(1, '#320810'); x.fillStyle = g }
  else x.fillStyle = L === 'h' ? '#808080' : '#5a5a5a'
  x.fillRect(x0, y0, 256, 256)
  const ink = L === 'c' ? '#e8c56a' : L === 'h' ? '#b0b0b0' : '#202020' // 烫金：高度凸起、粗糙度低
  x.translate(x0 + 128, y0 + 128); x.scale(1 / 1.57, 1)
  x.strokeStyle = ink; x.lineWidth = 5; x.strokeRect(-184, -104, 368, 208); x.lineWidth = 2; x.strokeRect(-176, -96, 352, 192)
  // HL 花押（左）：双圈 + 交织斜体
  x.lineWidth = 4; x.beginPath(); x.arc(-108, -10, 52, 0, Math.PI * 2); x.stroke(); x.lineWidth = 2; x.beginPath(); x.arc(-108, -10, 45, 0, Math.PI * 2); x.stroke()
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `italic bold 58px ${SERIF}`; x.fillText('H', -120, -12); x.fillText('L', -94, -2)
  x.font = `bold 15px ${SERIF}`; x.fillText('HOTEL · LEVEL 5', -108, 62)
  // 楼层 / 房号（右）
  x.font = `bold 22px ${CJK}`; x.fillText('恐怖旅馆', 76, -66)
  x.font = `14px ${CJK}`; x.fillText('楼层 FLOOR', 30, -24); x.fillText('房号 ROOM', 116, -24)
  const f = cardLabel.floor ? String(cardLabel.floor) : '—', n = cardLabel.no ? String(cardLabel.no).padStart(3, '0') : '———'
  x.font = `bold 40px "Courier New",${SERIF}`; x.fillText(f, 30, 20); x.fillText(n, 116, 20)
  x.lineWidth = 2; x.beginPath(); x.moveTo(-4, 54); x.lineTo(170, 54); x.stroke()
  x.font = `13px ${CJK}`; x.fillText('有着最好员工的旅馆', 82, 74)
  x.restore()
}
function drawAtlas2(L: Layer): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024
  const x = c.getContext('2d')!, R = rng(20261104)
  const tile = (i: number, fn: (x0: number, y0: number) => void) => { const { x0, y0 } = tileOf(i); x.save(); x.beginPath(); x.rect(x0, y0, 256, 256); x.clip(); fn(x0, y0); x.restore() }
  const fill = (x0: number, y0: number, a: string, b: string) => { if (L !== 'c') { x.fillStyle = L === 'h' ? '#808080' : a; x.fillRect(x0, y0, 256, 256); return } const g = x.createLinearGradient(x0, y0, x0 + 256, y0 + 256); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(x0, y0, 256, 256) }
  const pick = (c: string, h: string, r: string) => (L === 'c' ? c : L === 'h' ? h : r)
  const speck = (x0: number, y0: number, n: number, col: () => string, w = 2) => { for (let i = 0; i < n; i++) { x.fillStyle = col(); x.fillRect(x0 + R() * 256, y0 + R() * 256, w, w) } }
  x.fillStyle = pick('#000', '#808080', '#808080'); x.fillRect(0, 0, 1024, 1024)
  drawCardFront(x, L)
  tile(T2.cardBack, (x0, y0) => {
    fill(x0, y0, L === 'r' ? '#606060' : '#2a2226', '#1a1416')
    x.fillStyle = pick('#141212', '#9a9a9a', '#3a3a3a'); x.fillRect(x0, y0 + 44, 256, 46) // 磁条（略凸、光滑）
    x.fillStyle = pick('#e9e0c8', '#8a8a8a', '#d0d0d0'); x.fillRect(x0 + 24, y0 + 112, 150, 30) // 签名条
    x.save(); x.translate(x0 + 128, y0 + 128); x.scale(1 / 1.57, 1); x.fillStyle = pick('rgba(232,197,106,.85)', '#a0a0a0', '#303030'); x.textAlign = 'center'; x.font = `15px ${CJK}`
    x.fillText('请将此卡插入门锁 · 只开您自己的门', 0, 54); x.fillText('遗失请至一楼前台补办 · 本卡归旅馆所有', 0, 76); x.restore()
  })
  // 骰面：温白 + 橘皮细纹（高度）
  tile(T2.die, (x0, y0) => { fill(x0, y0, L === 'r' ? '#4a4a4a' : '#fbfaf4', '#e9e6dc'); speck(x0, y0, 1600, () => L === 'c' ? `rgba(150,140,120,${R() * .05})` : `rgba(${R() < .5 ? '0,0,0' : '255,255,255'},.12)`, 3) })
  tile(T2.dieCrack, (x0, y0) => {
    fill(x0, y0, L === 'r' ? '#4a4a4a' : '#f4f2ea', '#dcd8cc')
    x.strokeStyle = pick('#3a342e', '#000', '#fff'); x.lineWidth = L === 'c' ? 2.5 : 4
    x.beginPath(); x.moveTo(x0 + 16, y0 + 36); x.lineTo(x0 + 88, y0 + 104); x.lineTo(x0 + 116, y0 + 96); x.lineTo(x0 + 160, y0 + 150); x.lineTo(x0 + 150, y0 + 166); x.lineTo(x0 + 236, y0 + 236); x.moveTo(x0 + 116, y0 + 96); x.lineTo(x0 + 134, y0 + 40); x.moveTo(x0 + 160, y0 + 150); x.lineTo(x0 + 210, y0 + 138); x.stroke()
  })
  // 虫胶唱片面：同心沟纹（高度交替 → 法线）+ 标签残片
  tile(T2.vinyl, (x0, y0) => {
    x.fillStyle = pick('#121112', '#808080', '#505050'); x.fillRect(x0, y0, 256, 256)
    for (let r = 124; r > 40; r -= 1.6) { x.strokeStyle = L === 'c' ? `rgba(255,255,255,${(.025 + (Math.sin(r * 1.3) * .5 + .5) * .04).toFixed(3)})` : L === 'h' ? (Math.floor(r / 1.6) % 2 ? '#8a8a8a' : '#767676') : '#505050'; x.lineWidth = 1; x.beginPath(); x.arc(x0 + 128, y0 + 128, r, 0, Math.PI * 2); x.stroke() }
    x.fillStyle = pick('#7a1418', '#808080', '#909090'); x.beginPath(); x.arc(x0 + 128, y0 + 128, 38, 0, Math.PI * 2); x.fill()
    if (L === 'c') { x.strokeStyle = '#d8b25a'; x.lineWidth = 1.5; x.beginPath(); x.arc(x0 + 128, y0 + 128, 35, 0, Math.PI * 2); x.stroke(); x.fillStyle = '#e8c56a'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 11px ${SERIF}`; x.fillText('陌生又熟悉', x0 + 128, y0 + 120); x.font = `8px ${SERIF}`; x.fillText('无尽圆舞曲', x0 + 128, y0 + 136) }
    x.fillStyle = pick('#ddd', '#606060', '#808080'); x.beginPath(); x.arc(x0 + 128, y0 + 128, 3.5, 0, Math.PI * 2); x.fill()
  })
  // 断口：虫胶的贝壳状断面（暗棕灰、粗糙、细碎起伏）
  tile(T2.vinylEdge, (x0, y0) => { fill(x0, y0, L === 'r' ? '#c0c0c0' : '#2c2622', '#1a1614'); speck(x0, y0, 900, () => L === 'c' ? `rgba(${R() < .5 ? '90,80,70' : '0,0,0'},${R() * .5})` : `rgba(${R() < .5 ? '0,0,0' : '255,255,255'},.35)`, 4) })
  // 购买凭证正面：米色纸 + 烫金边 + 赌场花押（骰子 + 王冠）+ 编号 + 条款
  tile(T2.receipt, (x0, y0) => {
    fill(x0, y0, L === 'r' ? '#d8d8d8' : '#f3eee0', '#e2dac6'); speck(x0, y0, 1800, () => L === 'c' ? `rgba(120,95,60,${R() * .05})` : `rgba(${R() < .5 ? '0,0,0' : '255,255,255'},.1)`, 2)
    x.save(); x.translate(x0 + 128, y0 + 128); x.scale(1 / .6, 1)
    const foil = pick('#c9a24a', '#b8b8b8', '#303030'), ink = pick('#2b2420', '#707070', '#e0e0e0')
    x.strokeStyle = foil; x.lineWidth = 3; x.strokeRect(-70, -116, 140, 232); x.lineWidth = 1.2; x.strokeRect(-64, -110, 128, 220)
    x.beginPath(); x.arc(0, -70, 22, 0, Math.PI * 2); x.stroke(); x.strokeRect(-9, -79, 18, 18); x.fillStyle = foil; x.beginPath(); x.moveTo(-14, -94); x.lineTo(-8, -102); x.lineTo(0, -95); x.lineTo(8, -102); x.lineTo(14, -94); x.fill()
    x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle'
    x.font = `bold 18px ${CJK}`; x.fillText('购买凭证', 0, -30); x.font = `9px ${CJK}`; x.fillText('L5.1 · 寂静赌场 兑换台', 0, -12)
    x.font = `11px ${CJK}`; x.fillText('商品：白色骰子 ×1', 0, 12); x.fillText('损坏凭此免费更换', 0, 30)
    x.font = `bold 14px "Courier New",monospace`; x.fillStyle = pick('#8a1c22', '#909090', '#c0c0c0'); x.fillText('No. 0666-' + String(4000 + Math.floor(R() * 5999)), 0, 58)
    x.strokeStyle = ink; x.lineWidth = 1; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(-60, 84); x.lineTo(60, 84); x.stroke(); x.setLineDash([])
    x.restore()
  })
  tile(T2.gold, (x0, y0) => { fill(x0, y0, L === 'r' ? '#303030' : '#f0d27a', '#a07a2a'); speck(x0, y0, 400, () => L === 'c' ? `rgba(255,240,200,${R() * .2})` : 'rgba(255,255,255,.1)', 2) })
  tile(T2.receiptBack, (x0, y0) => {
    fill(x0, y0, L === 'r' ? '#d8d8d8' : '#efe9da', '#ddd4bf')
    x.save(); x.translate(x0 + 128, y0 + 128); x.scale(1 / .6, 1)
    x.strokeStyle = pick('rgba(150,120,70,.25)', '#909090', '#d8d8d8'); for (let i = -12; i < 12; i++) { x.beginPath(); x.moveTo(i * 14, -120); x.lineTo(i * 14 + 60, 120); x.stroke() }
    x.fillStyle = pick('rgba(60,50,40,.8)', '#787878', '#d8d8d8'); x.textAlign = 'center'; x.font = `8px ${CJK}`
    for (const [i, t] of ['本凭证仅限持有人使用', '不可兑换筹码 · 不可转让', '赌场保留最终解释权'].entries()) x.fillText(t, 0, -40 + i * 16)
    x.strokeStyle = pick('rgba(150,30,30,.6)', '#a0a0a0', '#c0c0c0'); x.lineWidth = 2; x.beginPath(); x.arc(20, 50, 22, 0, Math.PI * 2); x.stroke(); x.fillStyle = x.strokeStyle; x.font = `bold 9px ${CJK}`; x.fillText('已核验', 20, 53)
    x.restore()
  })
  tile(T2.cardEdge, (x0, y0) => fill(x0, y0, L === 'r' ? '#404040' : '#c9a24e', '#8a6a2a'))
  return c
}
function makeAtlas2Tex(c: HTMLCanvasElement, srgb: boolean, name: string) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.name = name; return t
}
function atlas2(): THREE.CanvasTexture {
  if (atlas2Tex) return atlas2Tex
  atlas2Canvas = drawAtlas2('c')
  atlas2Tex = makeAtlas2Tex(atlas2Canvas, true, 'l5-items-atlas2')
  atlas2N = makeAtlas2Tex(heightToNormal(drawAtlas2('h'), 2.2), false, 'l5-items-atlas2-normal')
  atlas2R = makeAtlas2Tex(drawAtlas2('r'), false, 'l5-items-atlas2-rough')
  return atlas2Tex
}
/** 房卡卡面随实际绑定的楼层 / 房号重绘（只在变化时画；未绑定房号显示「———」） */
export function syncRoomCardLabel(card?: { floor: number; no: number; dx?: number } | null) {
  const floor = card?.floor ?? 0, no = card && card.dx !== undefined ? card.no : 0
  if (floor === cardLabel.floor && no === cardLabel.no) return
  cardLabel = { floor, no }
  if (!atlas2Canvas || !atlas2Tex) return
  drawCardFront(atlas2Canvas.getContext('2d')!, 'c'); atlas2Tex.needsUpdate = true
}
export const roomCardLabel = () => ({ ...cardLabel })
const mat2 = (roughness: number, metalness = 0) => { const map = atlas2(); return mat(roughness, metalness, { map, normalMap: atlas2N!, roughnessMap: atlas2R! } as Partial<THREE.MeshStandardMaterialParameters>) }
const ATLAS2_SIZE = 1024
export const L5_ITEM_TEX = { atlas2: ATLAS2_SIZE, maps: ['color', 'normal', 'roughness'] } as const

/** 房卡：圆角塑料卡（倒边），0.085 × 0.054 × 0.0018 m；正面花押 + 楼层房号，背面磁条 + 小字；侧边金色 */
function buildRoomCard() {
  const P = new Parts(), m = mat2(.32, .15)
  const g = new THREE.ExtrudeGeometry(roundRectShape(.085, .054, .005), { depth: .0012, bevelEnabled: true, bevelThickness: .0003, bevelSize: .0003, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -.0006)
  P.box(g, m, { pz: T2.cardFront, nz: T2.cardBack, side: T2.cardEdge })
  return P.finish('roomcard')
}
function buildDie(cracked: boolean) {
  const P = new Parts(), t = cracked ? T2.dieCrack : T2.die
  P.box(new RoundedBoxGeometry(.03, .03, .03, 3, .0045), mat2(.26, 0), { pz: t, nz: cracked ? t : T2.die, side: cracked ? T2.dieCrack : T2.die })
  return P.finish(cracked ? 'brokendie' : 'fatedie')
}
/** 破唱片：三块锯齿断口的虫胶碎片（上下面按整张唱片坐标取 UV，沟纹连续；断面另一分区），标签残片在中心那块 */
function buildBrokenRecord() {
  const P = new Parts(), m = mat2(.34, .05), R = rng(18)
  const Rr = .15, cuts = [-.35, 1.7, 3.6, 5.93]
  for (let k = 0; k < 3; k++) {
    const a0 = cuts[k], a1 = cuts[k + 1], sh = new THREE.Shape()
    const jag = (ax: number, from: number, to: number, n: number) => { const pts: [number, number][] = []; for (let i = 0; i <= n; i++) { const r = from + (to - from) * (i / n), j = i && i < n ? (R() - .5) * .14 : 0; pts.push([Math.cos(ax + j) * r, Math.sin(ax + j) * r]) } return pts }
    const inner = .012 + R() * .01
    const p0 = jag(a0, inner, Rr, 6)
    sh.moveTo(...p0[0]); for (const p of p0.slice(1)) sh.lineTo(...p)
    for (let i = 1; i <= 14; i++) { const a = a0 + (a1 - a0) * (i / 14); sh.lineTo(Math.cos(a) * Rr, Math.sin(a) * Rr) }
    for (const p of jag(a1, Rr, inner, 6).slice(1)) sh.lineTo(...p)
    sh.closePath()
    const g = new THREE.ExtrudeGeometry(sh, { depth: .0018, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -.0009)
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv')
    const capCount = g.groups[0]?.count ?? 0
    for (let i = 0; i < pos.count; i++) if (i < capCount) uv.setXY(i, pos.getX(i) / (2 * Rr) + .5, pos.getY(i) / (2 * Rr) + .5); else uv.setXY(i, (uv.getX(i) * 7) % 1, uv.getY(i) * 200 % 1)
    const mid = (a0 + a1) / 2, gap = .012 + k * .004
    P.own(g, m, T2.vinyl, [.02, .02, .98, .98], { p: [Math.cos(mid) * gap, Math.sin(mid) * gap, k * .0006], r: [(R() - .5) * .08, (R() - .5) * .08, 0] }, [[T2.vinyl, [.02, .02, .98, .98]], [T2.vinylEdge, [.1, .1, .9, .9]]])
  }
  return P.finish('brokenrecord')
}
/** 购买凭证：0.06 × 0.1 m 纸片，正面烫金边 + 花押 + 编号，背面条款 + 核验章；底边齿孔撕边 */
function buildReceipt() {
  const P = new Parts(), w = .06, h = .1, s = new THREE.Shape()
  s.moveTo(-w / 2, h / 2); s.lineTo(w / 2, h / 2); s.lineTo(w / 2, -h / 2)
  const teeth = 12; for (let i = 1; i <= teeth * 2; i++) { const xx = w / 2 - (w * i) / (teeth * 2), yy = -h / 2 + (i % 2 ? .0022 : 0); s.lineTo(xx, yy) }
  s.closePath()
  P.box(extrude(s, .0005, 2), mat2(.9, 0), { pz: T2.receipt, nz: T2.receiptBack, side: T2.receiptBack })
  return P.finish('diereceipt')
}

const BUILDERS: Record<L5ItemType, () => THREE.Group> = {
  roomcard: buildRoomCard, fatedie: () => buildDie(false), brokendie: () => buildDie(true), brokenrecord: buildBrokenRecord, diereceipt: buildReceipt,
  mahjongtile: buildMahjongTile, key437: buildKey437, bagTag: buildBagTag, roomtea: buildRoomTea, gentletter: buildGentLetter,
}

/** 地面 / 投掷 / 远端手持共用模型。pose='ground'：信封平躺（火漆朝上，微倾）；其余竖立。 */
export function buildL5ItemMesh(type: L5ItemType, pose: 'ground' | 'upright' = 'ground'): THREE.Group {
  const model = BUILDERS[type]()
  if (pose === 'ground' && type === 'gentletter') { model.rotation.set(PI / 2 - .18, 0, .3); const g = new THREE.Group(); g.add(model); g.userData.l5ItemModel = type; return g }
  return model
}
