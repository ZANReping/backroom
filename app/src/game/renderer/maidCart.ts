// [maid] 管家清洁车（细化版）。爱德华时代酒店客房车：深色桃花心木搁板 + 黄铜立柱 / 弯把手 / 围栏，
// 万向脚轮（橡胶轮胎 + 铜轮毂 + 叉架），底层橡胶防撞条；附图风格的复古商品标签。
// 车上：镀锌拖把桶（箍圈、提梁、压水器）+ 棉线拖把、侧挂扫帚（稻草束 + 红线扎）、亚麻垃圾袋（麻绳扎口挂钩上）、
//       叠好的酒店毛巾（红条纹）、香皂、复古铁罐与玻璃瓶、失物招领木箱（铜包角、半开盖、珐琅铭牌）、服务铃、侧面挂帘 + 酒店徽记。
// 车长沿 X（1.0 m）、宽 Z（0.48 m），把手在 -X 端；userData.cart 与旧版一致（maidAnim / maidRender 依赖）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { litMaterial } from './shared'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const hasDOM = typeof document !== 'undefined'
const FONT = "'Noto Serif CJK SC','Songti SC','SimSun','Noto Sans SC','Noto Sans CJK SC',serif"
const LATIN = "Georgia,'Times New Roman',serif"
function hash(i: number) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }

// ---------- 贴图（全部实例共享，懒加载）----------
const TEX = new Map<string, THREE.Texture | null>()
function canvasTex(key: string, w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  if (TEX.has(key)) return TEX.get(key)!
  if (!hasDOM) { TEX.set(key, null); return null }
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d')!; draw(x, w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]) }
  TEX.set(key, t); return t
}
/** 桃花心木：木纹 + 年轮 + 木板接缝 + 清漆高光 */
function woodTex(key = 'wood', base = [74, 40, 24], planks = 3) {
  return canvasTex(key, 512, 256, (x, w, h) => {
    x.fillStyle = `rgb(${base})`; x.fillRect(0, 0, w, h)
    for (let p = 0; p < planks; p++) {
      const y0 = (p * h) / planks, ph = h / planks, tone = (hash(p + 3) - 0.5) * 18
      x.fillStyle = `rgba(${base[0] + tone + 10},${base[1] + tone + 4},${base[2] + tone},0.55)`; x.fillRect(0, y0, w, ph)
      for (let i = 0; i < 70; i++) {
        const yy = y0 + hash(i * 7 + p * 101) * ph, a = 0.08 + hash(i + p * 13) * 0.18
        x.strokeStyle = hash(i * 3 + p) > 0.5 ? `rgba(30,14,6,${a})` : `rgba(150,90,50,${a * 0.6})`
        x.lineWidth = 0.6 + hash(i * 5 + p) * 1.6; x.beginPath()
        for (let xx = 0; xx <= w; xx += 16) x.lineTo(xx, yy + Math.sin(xx * 0.012 + i + p) * (2 + hash(i) * 4) + Math.sin(xx * 0.05 + i * 2) * 0.8)
        x.stroke()
      }
      // 节疤
      if (hash(p * 17) > 0.4) { const kx = hash(p * 23) * w, ky = y0 + ph * (0.3 + hash(p * 29) * 0.4); for (let r = 14; r > 2; r -= 3) { x.strokeStyle = `rgba(35,16,8,${0.12 + (14 - r) * 0.02})`; x.beginPath(); x.ellipse(kx, ky, r * 1.8, r * 0.6, 0, 0, Math.PI * 2); x.stroke() } }
      x.fillStyle = 'rgba(15,6,2,0.85)'; x.fillRect(0, y0, w, 2) // 接缝
      x.fillStyle = 'rgba(255,220,180,0.06)'; x.fillRect(0, y0 + 2, w, 2)
    }
  })
}
const brushedBrass = () => canvasTex('brass', 64, 256, (x, w, h) => {
  x.fillStyle = '#b08f4c'; x.fillRect(0, 0, w, h)
  for (let i = 0; i < 260; i++) { x.fillStyle = hash(i) > 0.5 ? 'rgba(255,235,170,0.12)' : 'rgba(70,45,10,0.12)'; x.fillRect(0, hash(i * 3) * h, w, 1) }
  for (let i = 0; i < 18; i++) { x.fillStyle = `rgba(60,90,60,${0.05 + hash(i * 9) * 0.08})`; x.beginPath(); x.arc(hash(i * 5) * w, hash(i * 7) * h, 2 + hash(i) * 6, 0, Math.PI * 2); x.fill() } // 铜绿斑
}, [1, 2])
const zincTex = () => canvasTex('zinc', 256, 128, (x, w, h) => {
  x.fillStyle = '#9aa0a2'; x.fillRect(0, 0, w, h)
  for (let i = 0; i < 90; i++) { // 镀锌结晶斑
    const cx = hash(i) * w, cy = hash(i * 3) * h, r = 6 + hash(i * 5) * 16, l = 120 + hash(i * 7) * 70
    x.fillStyle = `rgba(${l},${l + 6},${l + 8},0.35)`; x.beginPath()
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; x.lineTo(cx + Math.cos(a) * r * (0.6 + hash(i + k) * 0.5), cy + Math.sin(a) * r * (0.6 + hash(i * 2 + k) * 0.5)) }
    x.fill()
  }
  for (let i = 0; i < 25; i++) { x.fillStyle = `rgba(90,60,30,${0.06 + hash(i * 11) * 0.1})`; x.fillRect(hash(i * 13) * w, h * 0.75 + hash(i) * h * 0.25, 2 + hash(i * 2) * 6, 3 + hash(i * 4) * 10) } // 下沿锈水痕
}, [3, 1])
const towelTex = (stripe: string) => canvasTex('towel' + stripe, 128, 128, (x, w, h) => {
  x.fillStyle = '#efeadf'; x.fillRect(0, 0, w, h)
  for (let i = 0; i < 1400; i++) { x.fillStyle = hash(i) > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(150,140,120,0.18)'; x.fillRect(hash(i * 3) * w, hash(i * 7) * h, 1.5, 1.5) } // 毛圈
  x.fillStyle = stripe; x.fillRect(0, h * 0.72, w, 7); x.fillRect(0, h * 0.72 + 10, w, 2)
  x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, 0, w, 3); x.fillRect(0, h - 3, w, 3) // 折边
})
const linenTex = () => canvasTex('linen', 128, 128, (x, w, h) => {
  x.fillStyle = '#5b574f'; x.fillRect(0, 0, w, h)
  for (let i = 0; i < w; i += 2) { x.fillStyle = `rgba(${hash(i) > 0.5 ? '200,190,170' : '20,18,14'},${0.025 + hash(i * 3) * 0.035})`; x.fillRect(i, 0, 1, h); x.fillRect(0, i, w, 1) }
  for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(30,24,16,${0.08 + hash(i * 5) * 0.12})`; x.beginPath(); x.ellipse(hash(i) * w, hash(i * 9) * h, 6 + hash(i * 2) * 12, 3 + hash(i * 4) * 6, hash(i * 6) * 3, 0, Math.PI * 2); x.fill() } // 污渍
}, [3, 3])
const strawTex = () => canvasTex('straw', 64, 128, (x, w, h) => {
  x.fillStyle = '#c2a565'; x.fillRect(0, 0, w, h)
  for (let i = 0; i < 160; i++) { const xx = hash(i) * w; x.strokeStyle = hash(i * 3) > 0.5 ? 'rgba(120,90,40,0.5)' : 'rgba(240,215,150,0.5)'; x.lineWidth = 0.8 + hash(i * 5); x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx + (hash(i * 7) - 0.5) * 6, h); x.stroke() }
  x.fillStyle = '#8a2a22'; for (const y of [10, 26]) x.fillRect(0, y, w, 4) // 红线扎带
}, [3, 1])
const leatherTex = () => canvasTex('grip', 128, 32, (x, w, h) => {
  x.fillStyle = '#3a2416'; x.fillRect(0, 0, w, h)
  for (let i = 0; i < w; i += 9) { x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 8, h); x.stroke(); x.strokeStyle = 'rgba(160,110,70,0.25)'; x.lineWidth = 1; x.beginPath(); x.moveTo(i + 2, 0); x.lineTo(i + 10, h); x.stroke() }
}, [6, 1])
/** 复古商品纸标签（附图里的 COTTOLENE 铁罐风格；品牌是虚构的） */
function tinLabel(key: string, bg: string, ink: string, title: string, sub: string) {
  return canvasTex('tin-' + key, 256, 96, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h)
    x.strokeStyle = ink; x.lineWidth = 3; x.strokeRect(5, 5, w - 10, h - 10); x.lineWidth = 1; x.strokeRect(10, 10, w - 20, h - 20)
    x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle'
    x.font = `bold 30px ${LATIN}`; x.fillText(title, w / 2, h * 0.44)
    x.font = `italic 13px ${LATIN}`; x.fillText(sub, w / 2, h * 0.75)
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(80,60,30,${hash(i) * 0.12})`; x.fillRect(hash(i * 3) * w, hash(i * 7) * h, 2, 2) } // 旧纸斑
  })
}
const plateTex = () => canvasTex('lostplate', 256, 96, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f3ecd8'); g.addColorStop(1, '#ddd2b6'); x.fillStyle = g; x.fillRect(0, 0, w, h)
  x.strokeStyle = '#1f3a5a'; x.lineWidth = 5; x.strokeRect(6, 6, w - 12, h - 12)
  x.fillStyle = '#1f3a5a'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 46px ${FONT}`; x.fillText('失物招领', w / 2, h * 0.47)
  x.font = `11px ${LATIN}`; x.fillText('LOST  &  FOUND', w / 2, h * 0.84)
})
const crestTex = () => canvasTex('crest', 192, 256, (x, w, h) => {
  x.fillStyle = '#5c1418'; x.fillRect(0, 0, w, h)
  for (let i = 0; i < w; i += 3) { x.fillStyle = `rgba(0,0,0,${0.08 + hash(i) * 0.08})`; x.fillRect(i, 0, 1, h) } // 天鹅绒竖纹
  x.strokeStyle = '#c9a54e'; x.lineWidth = 4; x.strokeRect(10, 10, w - 20, h - 40)
  x.beginPath(); x.ellipse(w / 2, h * 0.42, 52, 64, 0, 0, Math.PI * 2); x.lineWidth = 3; x.stroke()
  x.fillStyle = '#d8b65c'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 72px ${LATIN}`; x.fillText('H', w / 2, h * 0.43)
  x.font = `bold 12px ${LATIN}`; x.fillText('HOUSEKEEPING', w / 2, h * 0.7)
  for (let i = 0; i < w; i += 6) { x.fillStyle = '#c9a54e'; x.fillRect(i, h - 26, 3, 26) } // 金流苏
})
const soapTex = () => canvasTex('soap', 64, 64, (x, w, h) => { x.fillStyle = '#efe2c8'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(140,110,70,0.6)'; x.lineWidth = 2; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = 'rgba(140,110,70,0.7)'; x.font = `bold 20px ${LATIN}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', w / 2, h / 2 + 1) })

// ---------- 失物招领箱（ZAN 定：保持原版噪点纸盒，不改）----------
let noiseTex: THREE.Texture | null = null
/** 附图里那种「无法辨认的商品」：彩色噪点贴图（失物招领箱 / 推车上的纸盒） */
export function boxNoise() {
  if (noiseTex || !hasDOM) return noiseTex
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!
  for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) { const h = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1; x.fillStyle = `hsl(${(Math.abs(h) * 360) | 0},55%,${40 + ((Math.abs(h * 7) % 1) * 30) | 0}%)`; x.fillRect(i, j, 1, 1) }
  noiseTex = new THREE.CanvasTexture(c); noiseTex.magFilter = THREE.NearestFilter; noiseTex.minFilter = THREE.NearestFilter; noiseTex.colorSpace = THREE.SRGBColorSpace
  return noiseTex
}
let labelTex: THREE.Texture | null = null
export function lostLabel() {
  if (labelTex || !hasDOM) return labelTex
  const c = document.createElement('canvas'); c.width = 128; c.height = 48; const x = c.getContext('2d')!
  x.fillStyle = '#efe6cf'; x.fillRect(0, 0, 128, 48); x.strokeStyle = '#6a4a2a'; x.lineWidth = 3; x.strokeRect(3, 3, 122, 42)
  x.fillStyle = '#4a2e18'; x.font = "bold 24px 'Songti SC','SimSun','Noto Serif CJK SC','Noto Sans SC',serif"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('失物招领', 64, 25)
  labelTex = new THREE.CanvasTexture(c); labelTex.colorSpace = THREE.SRGBColorSpace; return labelTex
}

// ---------- 材质 ----------
let MAT: ReturnType<typeof makeMats> | null = null
function makeMats() {
  const wt = woodTex(), wd = woodTex('woodDark', [52, 28, 16], 4)
  const bt = brushedBrass(), zt = zincTex(), lt = linenTex(), st = strawTex(), gt = leatherTex()
  const tex = (t: THREE.Texture | null, o: Parameters<typeof litMaterial>[0]) => litMaterial(t ? { ...o, color: '#ffffff', map: t } : o)
  return {
    wood: tex(wt, { color: '#4a2f1e', roughness: 0.42, metalness: 0.05 }),
    woodDark: tex(wd, { color: '#34200f', roughness: 0.5 }),
    brass: tex(bt, { color: '#b08f4c', roughness: 0.32, metalness: 0.85 }),
    brassDark: litMaterial({ color: '#7a6234', roughness: 0.4, metalness: 0.8 }),
    iron: litMaterial({ color: '#2a2826', roughness: 0.55, metalness: 0.6 }),
    rubber: litMaterial({ color: '#1a1918', roughness: 0.85 }),
    zinc: tex(zt, { color: '#9aa0a2', roughness: 0.45, metalness: 0.7 }),
    water: litMaterial({ color: '#56634f', roughness: 0.08, metalness: 0.1 }),
    mop: litMaterial({ color: '#d9d1bd', roughness: 1 }),
    mopDirty: litMaterial({ color: '#a69d84', roughness: 1 }),
    linen: tex(lt, { color: '#5b574f', roughness: 0.95 }),
    twine: litMaterial({ color: '#9c8250', roughness: 1 }),
    straw: tex(st, { color: '#c2a565', roughness: 1 }),
    grip: tex(gt, { color: '#3a2416', roughness: 0.7 }),
    towelR: tex(towelTex('#8a2a2a'), { color: '#efeadf', roughness: 1 }),
    towelB: tex(towelTex('#2a3f6a'), { color: '#e6dfcf', roughness: 1 }),
    soap: tex(soapTex(), { color: '#efe2c8', roughness: 0.6 }),
    plate: tex(plateTex(), { color: '#efe6cf', roughness: 0.35, metalness: 0.1 }),
    crest: tex(crestTex(), { color: '#5c1418', roughness: 0.9 }),
    velvet: litMaterial({ color: '#4e1014', roughness: 0.95 }),
    glassBrown: litMaterial({ color: '#5a3212', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85 }),
    glassGreen: litMaterial({ color: '#3a5a3a', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85 }),
    cork: litMaterial({ color: '#a8835a', roughness: 0.9 }),
    tinTop: litMaterial({ color: '#8d8a82', roughness: 0.35, metalness: 0.75 }),
    paper: litMaterial({ color: '#d9cdb0', roughness: 0.95 }),
    tins: [
      tex(tinLabel('soap', '#e8dcc0', '#7a2a1c', 'SUNLIGHT', 'Hotel Laundry Soap'), { color: '#e8dcc0', roughness: 0.5, metalness: 0.2 }),
      tex(tinLabel('polish', '#23324a', '#d9c48a', 'BRASSO', 'Metal Polish · Est. 1905'), { color: '#23324a', roughness: 0.5, metalness: 0.3 }),
      tex(tinLabel('lye', '#c7a248', '#3a2210', 'LYE', 'Pure Granulated'), { color: '#c7a248', roughness: 0.5, metalness: 0.2 }),
    ],
  }
}

function mk(g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Vector3, parent: THREE.Object3D, rot?: [number, number, number]) {
  const o = new THREE.Mesh(g, m); o.position.copy(p); if (rot) o.rotation.set(rot[0], rot[1], rot[2]); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o
}
/** 圆角木板（BoxGeometry 的 UV 按尺寸缩放，木纹不被拉伸） */
function plank(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1); const uv = g.attributes.uv as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); const su = ay > 0.5 || ax < 0.5 ? w : d, sv = ay > 0.5 ? d : h; uv.setXY(i, uv.getX(i) * su * 1.6, uv.getY(i) * sv * 1.6) }
  return g
}
function pipe(pts: THREE.Vector3[], r: number, seg = 10, rows = 0) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2), rows || Math.max(16, pts.length * 10), r, seg, false) }

/** 万向脚轮：顶板 + 转轴 + 叉架 + 橡胶轮胎 + 铜轮毂 */
function caster(M: NonNullable<typeof MAT>, parent: THREE.Object3D, x: number, z: number, yaw: number) {
  const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = yaw; parent.add(c)
  mk(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16), M.iron, V(0, 0.118, 0), c)
  mk(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), M.iron, V(0, 0.105, 0), c)
  for (const s of [-1, 1]) mk(new THREE.BoxGeometry(0.05, 0.06, 0.005), M.iron, V(-0.012, 0.07, s * 0.016), c)
  mk(new THREE.BoxGeometry(0.03, 0.006, 0.037), M.iron, V(0, 0.096, 0), c)
  mk(new THREE.TorusGeometry(0.036, 0.011, 10, 24), M.rubber, V(-0.022, 0.047, 0), c)
  mk(new THREE.CylinderGeometry(0.027, 0.027, 0.018, 16).rotateX(Math.PI / 2), M.brassDark, V(-0.022, 0.047, 0), c)
  mk(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8).rotateX(Math.PI / 2), M.brass, V(-0.022, 0.047, 0), c)
}

export function buildMaidCartMeshV2(): THREE.Group {
  const M = (MAT ??= makeMats())
  const g = new THREE.Group(); g.name = 'maidCart'
  const L = 1.0, W = 0.48, half = L / 2, hw = W / 2
  // —— 脚轮（前两只转个角度，看着是真的万向轮）——
  caster(M, g, -half + 0.04, -hw + 0.04, 0); caster(M, g, -half + 0.04, hw - 0.04, 0)
  caster(M, g, half - 0.04, -hw + 0.04, 0.5); caster(M, g, half - 0.04, hw - 0.04, -0.35)
  // —— 立柱：黄铜管，上端铜球顶饰，与搁板交接处的铜箍 ——
  const shelves = [0.14, 0.52, 0.88, 1.09]
  for (const [x, z] of [[-half, -hw], [half, -hw], [-half, hw], [half, hw]]) {
    mk(new THREE.CylinderGeometry(0.014, 0.014, 1.0, 12), M.brass, V(x, 0.62, z), g)
    mk(new THREE.SphereGeometry(0.024, 14, 10), M.brass, V(x, 1.135, z), g)
    mk(new THREE.CylinderGeometry(0.006, 0.014, 0.025, 10), M.brass, V(x, 1.11, z), g)
    for (const y of shelves) mk(new THREE.CylinderGeometry(0.019, 0.019, 0.03, 12), M.brassDark, V(x, y, z), g)
  }
  // —— 搁板：木板 + 前后黄铜包边条 + 底层的橡胶防撞条 ——
  for (const [i, y] of shelves.entries()) {
    const th = i === 3 ? 0.022 : 0.026
    mk(plank(L + 0.04, th, W + 0.04), i === 0 ? M.woodDark : M.wood, V(0, y, 0), g)
    for (const s of [-1, 1]) mk(new THREE.BoxGeometry(L + 0.05, 0.008, 0.006), M.brass, V(0, y + th / 2 - 0.004, s * (hw + 0.023)), g)
    if (i === 0) {
      for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(0.016, 0.016, L + 0.06, 10).rotateZ(Math.PI / 2), M.rubber, V(0, y, s * (hw + 0.035)), g)
      for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(0.016, 0.016, W + 0.06, 10).rotateX(Math.PI / 2), M.rubber, V(s * (half + 0.035), y, 0), g)
    }
  }
  // —— 顶层围栏：三面细铜栏 + 小立柱（推把那一侧敞开）——
  const ry = 1.16
  mk(pipe([V(-half, ry, -hw), V(half, ry, -hw)], 0.006), M.brass, V(0, 0, 0), g)
  mk(pipe([V(-half, ry, hw), V(half, ry, hw)], 0.006), M.brass, V(0, 0, 0), g)
  mk(pipe([V(half, ry, -hw), V(half, ry, hw)], 0.006), M.brass, V(0, 0, 0), g)
  for (let i = 1; i < 8; i++) for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), M.brass, V(-half + (L * i) / 8, ry - 0.035, s * hw), g)
  // —— 弯把手：两侧立柱上弯出去的黄铜管 + 皮革握把 ——
  const hx = -half - 0.08, hy = 0.98
  for (const s of [-1, 1]) mk(pipe([V(-half, 0.86, s * hw), V(-half - 0.02, 0.93, s * hw), V(-half - 0.07, 0.975, s * hw), V(hx, hy, s * (hw - 0.03))], 0.012), M.brass, V(0, 0, 0), g)
  mk(new THREE.CylinderGeometry(0.0125, 0.0125, W - 0.06, 12).rotateX(Math.PI / 2), M.brass, V(hx, hy, 0), g)
  mk(new THREE.CylinderGeometry(0.017, 0.017, W - 0.16, 14).rotateX(Math.PI / 2), M.grip, V(hx, hy, 0), g)
  for (const s of [-1, 1]) mk(new THREE.TorusGeometry(0.017, 0.004, 6, 16), M.brassDark, V(hx, hy, s * (W - 0.16) / 2), g, [0, 0, 0])
  // —— 侧面挂帘：天鹅绒 + 酒店徽记（中层下沿，挡住下层的杂物，两侧各一）——
  for (const s of [-1, 1]) {
    const cg = new THREE.PlaneGeometry(0.42, 0.36, 8, 6); const p = cg.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) { const xx = p.getX(i), yy = p.getY(i); p.setZ(i, Math.sin(xx * 46) * 0.006 * (0.6 - yy)) } cg.computeVertexNormals()
    mk(cg, M.crest, V(-0.18, 0.33, s * (hw + 0.026)), g, [0, s > 0 ? 0 : Math.PI, 0])
    mk(new THREE.CylinderGeometry(0.005, 0.005, 0.46, 8).rotateZ(Math.PI / 2), M.brass, V(-0.18, 0.51, s * (hw + 0.028)), g)
  }
  // —— 底层：镀锌拖把桶（箍圈、提梁、压水器）+ 棉线拖把 ——
  const bx = 0.24, by = shelves[0] + 0.013
  mk(new THREE.CylinderGeometry(0.155, 0.13, 0.26, 28, 1, true), M.zinc, V(bx, by + 0.13, 0), g).material = M.zinc
  mk(new THREE.CircleGeometry(0.13, 28).rotateX(-Math.PI / 2), M.zinc, V(bx, by + 0.002, 0), g)
  for (const yy of [0.02, 0.13, 0.25]) mk(new THREE.TorusGeometry(0.133 + yy * 0.087, 0.006, 6, 30).rotateX(Math.PI / 2), M.zinc, V(bx, by + yy, 0), g)
  mk(new THREE.TorusGeometry(0.157, 0.008, 6, 30).rotateX(Math.PI / 2), M.zinc, V(bx, by + 0.26, 0), g)
  mk(new THREE.CircleGeometry(0.148, 28).rotateX(-Math.PI / 2), M.water, V(bx, by + 0.215, 0), g)
  mk(new THREE.TorusGeometry(0.15, 0.004, 6, 24, Math.PI), M.iron, V(bx, by + 0.26, 0), g, [0, 0, 0.35]) // 提梁
  // 压水器：桶沿上的铁箱 + 压杆
  mk(new THREE.BoxGeometry(0.1, 0.09, 0.2), M.iron, V(bx - 0.09, by + 0.3, 0), g)
  mk(pipe([V(bx - 0.14, by + 0.33, 0.06), V(bx - 0.2, by + 0.55, 0.06), V(bx - 0.22, by + 0.68, 0.04)], 0.008), M.iron, V(0, 0, 0), g)
  // 拖把：木杆 + 铜箍 + 垂进桶里的棉线头
  const mop = new THREE.Group(); mop.position.set(bx + 0.04, by + 0.22, -0.05); mop.rotation.set(0.12, 0, -0.16); g.add(mop)
  mk(new THREE.CylinderGeometry(0.012, 0.013, 1.3, 10), M.wood, V(0, 0.62, 0), mop)
  mk(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), M.brassDark, V(0, -0.02, 0), mop)
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, r = 0.012 + hash(i) * 0.012, len = 0.12 + hash(i * 3) * 0.08
    mk(pipe([V(Math.cos(a) * r, -0.03, Math.sin(a) * r), V(Math.cos(a) * (r + 0.03), -0.03 - len * 0.5, Math.sin(a) * (r + 0.03)), V(Math.cos(a + 0.4) * (r + 0.05), -0.03 - len, Math.sin(a + 0.4) * (r + 0.05))], 0.005, 4, 6), i % 3 ? M.mop : M.mopDirty, V(0, 0, 0), mop)
  }
  // 底层另一侧：两只玻璃瓶 + 一只铁罐
  for (const [x, z, m, h] of [[-0.12, 0.13, M.glassBrown, 0.2], [-0.04, 0.15, M.glassGreen, 0.17]] as const) {
    mk(new THREE.CylinderGeometry(0.034, 0.036, h * 0.68, 16), m, V(x, by + h * 0.34, z), g)
    mk(new THREE.CylinderGeometry(0.012, 0.034, h * 0.2, 16), m, V(x, by + h * 0.78, z), g)
    mk(new THREE.CylinderGeometry(0.011, 0.011, h * 0.12, 10), M.cork, V(x, by + h * 0.94, z), g)
    mk(new THREE.CylinderGeometry(0.0365, 0.0365, h * 0.3, 16, 1, true, -1.2, 2.4), M.paper, V(x, by + h * 0.34, z), g)
  }
  // —— 中层：两摞酒店毛巾 + 香皂 + 复古铁罐 ——
  const my = shelves[1] + 0.013
  for (const [x, n, m] of [[0.12, 5, M.towelR], [0.36, 4, M.towelB]] as const) for (let i = 0; i < n; i++) {
    const t = mk(new THREE.BoxGeometry(0.24, 0.045, 0.34, 2, 1, 2), m, V(x + (hash(i * 9 + x * 10) - 0.5) * 0.012, my + 0.0225 + i * 0.046, (hash(i * 5) - 0.5) * 0.01), g)
    t.rotation.y = (hash(i * 3 + x * 7) - 0.5) * 0.08
  }
  for (const [i, [x, z]] of ([[-0.12, -0.12], [-0.22, -0.1], [-0.17, 0.12]] as const).entries()) {
    const tin = M.tins[i]
    mk(new THREE.CylinderGeometry(0.048, 0.048, 0.12, 22), tin, V(x, my + 0.06, z), g, [0, 1.3 + i, 0])
    mk(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 22), M.tinTop, V(x, my + 0.124, z), g)
  }
  for (let i = 0; i < 3; i++) mk(new THREE.BoxGeometry(0.07, 0.025, 0.045), M.soap, V(-0.36 + i * 0.012, my + 0.0125 + i * 0.026, 0.12), g, [0, i * 0.3, 0])
  // —— 上层：服务铃 + 纸巾卷 ——
  const ty = shelves[2] + 0.013
  for (let i = 0; i < 3; i++) mk(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 18), M.towelR, V(-0.32 + i * 0.1, ty + 0.05, -0.08), g)
  mk(new THREE.CylinderGeometry(0.035, 0.038, 0.012, 20), M.woodDark, V(0.33, ty + 0.006, 0.12), g)
  mk(new THREE.SphereGeometry(0.03, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.brass, V(0.33, ty + 0.012, 0.12), g)
  mk(new THREE.CylinderGeometry(0.003, 0.003, 0.016, 6), M.brass, V(0.33, ty + 0.05, 0.12), g)
  mk(new THREE.SphereGeometry(0.006, 8, 6), M.brass, V(0.33, ty + 0.06, 0.12), g)
  // —— 顶板：失物招领箱（原版：木箱 + 标签 + 噪点纸盒，保持不变，只是坐到新顶板上）——
  const top = shelves[3] + 0.011, dy = top - 1.095
  const oldWood = litMaterial({ color: '#4a2f1e', roughness: 0.7 })
  const nt = boxNoise()
  const nm = litMaterial(nt ? { color: '#ffffff', map: nt, roughness: 0.9 } : { color: '#8a6a5a', roughness: 0.9 })
  mk(new THREE.BoxGeometry(0.42, 0.24, 0.34), oldWood, V(-0.2, 1.215 + dy, 0), g).name = 'lostBox'
  const lt = lostLabel(); if (lt) mk(new THREE.PlaneGeometry(0.2, 0.075), litMaterial({ color: '#ffffff', map: lt }), V(-0.2, 1.22 + dy, 0.172), g)
  mk(new THREE.BoxGeometry(0.38, 0.02, 0.3), litMaterial({ color: '#2a1a10', roughness: 1 }), V(-0.2, 1.33 + dy, 0), g)
  for (const [x, y, z, sz] of [[-0.28, 1.36, -0.05, 0.11], [-0.12, 1.37, 0.06, 0.13], [0.22, 1.16, -0.05, 0.12]] as const) mk(new THREE.BoxGeometry(sz, sz * 1.2, sz * 0.6), nm, V(x, y + dy, z), g, [0, x * 2, 0])
  // —— 扫帚：车侧铜夹固定，稻草束 + 红线扎 ——
  const broom = new THREE.Group(); broom.position.set(-0.3, 0.62, hw + 0.045); broom.rotation.set(-0.06, 0, 0.05); g.add(broom)
  mk(new THREE.CylinderGeometry(0.011, 0.011, 1.12, 10), M.wood, V(0, 0.16, 0), broom)
  mk(new THREE.CylinderGeometry(0.03, 0.095, 0.24, 18, 3), M.straw, V(0, -0.47, 0), broom)
  mk(new THREE.CylinderGeometry(0.096, 0.1, 0.02, 18, 1, true), M.straw, V(0, -0.6, 0), broom)
  for (const yy of [0.3, -0.05]) mk(new THREE.BoxGeometry(0.02, 0.02, 0.03), M.brass, V(0, yy, -0.022), broom)
  // —— +X 端：铁钩横杆 + 亚麻垃圾袋（麻绳扎口）——
  mk(new THREE.CylinderGeometry(0.008, 0.008, W, 10).rotateX(Math.PI / 2), M.brass, V(half + 0.035, 0.98, 0), g)
  for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8).rotateZ(Math.PI / 2), M.brass, V(half + 0.015, 0.98, s * hw), g)
  mk(pipe([V(half + 0.035, 0.98, 0), V(half + 0.06, 0.95, 0), V(half + 0.07, 0.92, 0)], 0.004), M.iron, V(0, 0, 0), g)
  {
    const sg = new THREE.SphereGeometry(1, 28, 20); const p = sg.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const neck = y > 0.55 ? 1 - (y - 0.55) * 1.9 : 1 // 收口
      const sag = y < 0 ? 1 + y * y * 0.15 : 1
      const k = (1 + 0.07 * Math.sin(x * 9 + y * 6) * Math.cos(z * 8) + 0.05 * Math.sin(y * 17 + x * 3)) * Math.max(0.12, neck) * sag
      p.setXYZ(i, x * 0.15 * k, y * 0.3, z * 0.18 * k)
    }
    sg.computeVertexNormals()
    mk(sg, M.linen, V(half + 0.12, 0.64, 0), g)
    mk(new THREE.TorusGeometry(0.028, 0.006, 6, 16).rotateX(Math.PI / 2), M.twine, V(half + 0.12, 0.87, 0), g)
    mk(new THREE.ConeGeometry(0.04, 0.07, 10, 1, true), M.linen, V(half + 0.12, 0.905, 0), g, [Math.PI, 0, 0]) // 扎口上方的布头
    mk(pipe([V(half + 0.12, 0.87, 0), V(half + 0.1, 0.9, 0), V(half + 0.07, 0.92, 0)], 0.003, 5), M.twine, V(0, 0, 0), g)
  }
  g.userData.cart = { handleX: hx, handleY: hy, length: L, width: W }
  return mergeByMaterial(g)
}

/** 静态车身：按材质合并成少量网格（200+ 个小件 → 约 30 个 draw call） */
function mergeByMaterial(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert()
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>()
  g.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const geo = (m.geometry.index ? m.geometry : m.geometry).clone(); geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k); if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2)); const list = by.get(m.material as THREE.Material) ?? []; list.push(geo.index ? geo : geo); by.set(m.material as THREE.Material, list) })
  const out = new THREE.Group(); out.name = g.name; out.userData = g.userData
  for (const [mat, list] of by) {
    const idx = list.filter((x) => x.index), non = list.filter((x) => !x.index).map((x) => x)
    for (const part of [idx, non]) { if (!part.length) continue; const merged = mergeGeometries(part, false); if (!merged) continue; const mm = new THREE.Mesh(merged, mat); mm.castShadow = true; mm.receiveShadow = true; out.add(mm) }
    for (const x of list) x.dispose()
  }
  return out
}
