// [thing] 七层之物（Entity 20）重制模型。参照：
//   · Fandom 中文 Entity_20：鳗形巨躯、头尾从未被同时观测；厚实皮革质、伤痕累累的皮；
//     鳃和鳍在身上随机错位、大小悬殊（尾鳍从未被观察到）；身体局部「故障」——看似断开的几段仍像连着一样游动；
//     体内是凝血与寄生虫的胶状物；会从皮里排出焦油。
//   · wikidot old:entity-20：黑色蛇状身体，巨口占脸的三分之一，里面是长而锋利的牙。
//   · ZAN 提供的两张附图（仅作造型参考）：黑巨口鱼照片（浑浊的大眼、眼下的乳白发光器、
//     透明獠牙、下颌远长于上颌、颏下长须、翻出来的红色鳃丝）与蓝色版画「THE THING ON LEVEL 7」
//     （鳞片密布的鳗身、龙鱼式的头、身上零散的细长鳍条）。
// 原创程序化建模，无外部素材。模型正面 +X、背 +Y；头部局部原点在后脑（颈接口），巨口铰链在眼后。
// 躯干是 THING.segs 节可独立摆放的体节（seg0 紧接头后），沿 -X 排列，节距 THING.spacing；
// 动画层（阶段 2）按拖链把每节放到世界里。末段保持粗壮、没入雾中——不做尾巴。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { rng, merge, V, gauss, sstep, sweep, canvasTex } from './houndMesh'
import { disposeL8Tree } from './l8ModelResources'

/** 建模在「单位空间」里进行（头长 5.2 单位），整体放大 S 倍进入世界：头约 17.7m 长、12m 高（约四层楼），颈部直径约 11m。 */
const S = 3.4
/** 单位空间节距 */
const SP = 2.4
export const THING = {
  /** 世界缩放（单位空间 → 米） */
  S,
  /** 头长（后脑 → 下颌尖，米） */
  headLen: 5.2 * S,
  /** 躯干体节数与节距（米）；可见长度 ≈ headLen + segs × spacing ≈ 240m */
  segs: 28,
  spacing: SP * S,
  /** 躯干半径（单位空间）：颈部 → 末段（缓慢收细但不收尖；末段仍有颈部的 85%） */
  r0: 1.6,
  r1: 1.36,
  /** LOD：精细版切换距离（米，带 15% 回差） */
  hiDistHead: 140,
  hiDistSeg: 60,
  /** 巨口铰链（头局部坐标），下颌绕 Z 轴向下掀开 */
  hinge: { x: 0.95, y: -0.62 },
  /** 「故障」体节：这几节前后断开，切面露出凝血胶质，但仍跟着整条身体一起动 */
  glitchSegs: [6, 7, 15, 22] as readonly number[],
  /** 体节上的错位鳍 / 鳃（[节号, 绕身角度, 尺度]），参照「大小差异极大、毫无功能目的」 */
  fins: [[1, 1.4, 1.0], [3, -2.2, 0.55], [5, 0.2, 2.1], [9, 2.6, 0.4], [11, -0.9, 1.5], [13, 1.9, 0.7], [17, -2.7, 2.6], [19, 0.6, 0.35], [21, -1.6, 1.1], [24, 2.3, 1.8], [26, -0.3, 0.6]] as const,
  gills: [[0, 1.2, 1], [0, -1.2, 1], [2, 2.3, 0.6], [8, -0.4, 1.3], [12, 2.9, 0.5], [16, -1.9, 0.9], [20, 1.0, 1.6], [25, -2.6, 0.7]] as const,
} as const

export interface ThingPose {
  /** 巨口张开 0..1（下颌掀开约 62°） */
  gape?: number
  /** 鳃盖外翻 0..1（呼吸 / 畏光收鳃时为负意味——这里只做张开量） */
  gill?: number
  /** 颏须饵球亮度 0..1 */
  lure?: number
}

// ---------------- 贴图 ----------------
interface ThingTextures { skin: THREE.Texture | null; skinBump: THREE.Texture | null; flesh: THREE.Texture | null; head: THREE.Texture | null }
let TEX: ThingTextures | null = null
function* createTexturesJob(): Generator<void, ThingTextures, unknown> {
  if (TEX) return TEX
  // 躯干皮：版画那种菱形/六角鳞片排成斜列，鳞缘发灰；之上叠旧疤、剥落的白斑、焦油流痕。
  const drawSkin = (c: CanvasRenderingContext2D, R: () => number, bump: boolean) => {
    const S = 512
    c.fillStyle = bump ? '#5a5a5a' : '#17171a'; c.fillRect(0, 0, S, S)
    const cols = 12, rows = 16, w = S / cols, h = S / rows
    for (let r = -1; r <= rows; r++) for (let q = -1; q <= cols; q++) {
      const cx = (q + (r & 1) * 0.5) * w, cy = r * h
      const jit = (R() - 0.5) * 0.18
      const g = c.createLinearGradient(cx, cy - h, cx, cy + h * 0.8)
      if (bump) { g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.55, '#6c6c6c'); g.addColorStop(1, '#2a2a2a') }
      else {
        const b = 26 + R() * 18
        g.addColorStop(0, `rgb(${b + 18},${b + 18},${b + 22})`); g.addColorStop(0.6, `rgb(${b},${b},${b + 3})`); g.addColorStop(1, `rgb(${b * 0.45},${b * 0.45},${b * 0.5})`)
      }
      c.fillStyle = g
      c.beginPath()
      c.moveTo(cx, cy - h * (1.05 + jit)); c.lineTo(cx + w * 0.52, cy - h * 0.2); c.lineTo(cx + w * 0.4, cy + h * 0.62)
      c.lineTo(cx, cy + h * 0.82); c.lineTo(cx - w * 0.4, cy + h * 0.62); c.lineTo(cx - w * 0.52, cy - h * 0.2); c.closePath(); c.fill()
      c.strokeStyle = bump ? '#202020' : 'rgba(150,150,140,0.22)'; c.lineWidth = 1.2; c.stroke()
    }
    // 掉鳞斑：露出底下灰白的皮革
    for (let i = 0; i < 14; i++) {
      const x = R() * S, y = R() * S, rx = 10 + R() * 34, ry = 6 + R() * 18
      c.fillStyle = bump ? '#3c3c3c' : `rgba(${52 + R() * 16},${50 + R() * 14},${46 + R() * 12},0.45)`
      c.beginPath(); c.ellipse(x, y, rx, ry, R() * 3, 0, Math.PI * 2); c.fill()
    }
    // 旧疤：长条隆起的划痕（鱼叉、钩子、刀）
    for (let i = 0; i < 26; i++) {
      const x = R() * S, y = R() * S, l = 30 + R() * 140, a = (R() - 0.5) * 1.2
      c.strokeStyle = bump ? '#c8c8c8' : `rgba(${78 + R() * 26},${70 + R() * 20},${64 + R() * 18},0.38)`
      c.lineWidth = 1.5 + R() * 3.5; c.lineCap = 'round'
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (R() - 0.5) * 20, y + Math.sin(a) * l * 0.5 + (R() - 0.5) * 20, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke()
    }
    // 焦油流痕：从鳞缝里往下淌（贴图 v 向下=身体下方）
    for (let i = 0; i < 9; i++) {
      const x = R() * S, y = R() * S, l = 50 + R() * 120, w = 3 + R() * 5
      for (let k = 0; k < l; k += 2) {
        const f = 1 - k / l, ww = w * (0.5 + 0.5 * f) * (1 + 0.3 * Math.sin(k * 0.3))
        c.fillStyle = bump ? `rgba(128,128,128,${0.5 * f})` : `rgba(4,3,2,${0.55 * f})`
        c.beginPath(); c.ellipse(x + Math.sin(k * 0.07) * 3, y + k, ww, 2.2, 0, 0, Math.PI * 2); c.fill()
      }
    }
  }
  const skin = canvasTex(512, 512, (c, R) => drawSkin(c, R, false), true)
  yield
  const skinBump = canvasTex(512, 512, (c, R) => drawSkin(c, R, true), true)
  yield
  // 切面胶质：凝血的暗红、发黑的血块、白色线状寄生虫
  const flesh = canvasTex(256, 256, (c, R) => {
    const g = c.createRadialGradient(128, 128, 10, 128, 128, 128)
    g.addColorStop(0, '#4a0b10'); g.addColorStop(0.7, '#2a0608'); g.addColorStop(1, '#120304')
    c.fillStyle = g; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(${10 + R() * 30},0,${R() * 6},0.6)`; c.beginPath(); c.arc(R() * 256, R() * 256, 4 + R() * 18, 0, Math.PI * 2); c.fill() }
    for (let i = 0; i < 70; i++) {
      const x = R() * 256, y = R() * 256, a = R() * 6.28
      c.strokeStyle = `rgba(${210 + R() * 40},${200 + R() * 30},${170 + R() * 30},0.85)`; c.lineWidth = 1 + R() * 1.2
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8, x + Math.cos(a + 1.5) * 12, y + Math.sin(a + 1.5) * 12, x + Math.cos(a + 0.7) * 18, y + Math.sin(a + 0.7) * 18); c.stroke()
    }
    // 软骨环（脊椎残迹）
    c.strokeStyle = 'rgba(160,140,110,0.5)'; c.lineWidth = 7; c.beginPath(); c.arc(128, 150, 26, 0, Math.PI * 2); c.stroke()
  }, false)
  yield
  // 头皮：更细的鳞 + 骨板纹，眼周一圈发灰
  // 头皮：照片里是无鳞、湿滑的黑皮——细碎的明暗斑驳 + 皱褶细纹 + 几道发白的旧疤
  const head = canvasTex(512, 256, (c, R) => {
    c.fillStyle = '#141416'; c.fillRect(0, 0, 512, 256)
    for (let i = 0; i < 2600; i++) { const x = R() * 512, y = R() * 256, g0 = 14 + R() * 22; c.fillStyle = `rgba(${g0},${g0},${g0 + 2},0.35)`; c.fillRect(x, y, 1 + R() * 3, 1 + R() * 2) }
    for (let i = 0; i < 160; i++) {
      const x = R() * 512, y = R() * 256, l = 8 + R() * 30
      c.strokeStyle = `rgba(0,0,0,${0.25 + R() * 0.3})`; c.lineWidth = 0.6 + R()
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l * 0.5, y + (R() - 0.5) * 6, x + l, y + (R() - 0.5) * 4); c.stroke()
    }
    for (let i = 0; i < 9; i++) {
      const x = R() * 512, y = R() * 256, l = 30 + R() * 70, a = (R() - 0.5) * 0.8
      c.strokeStyle = `rgba(96,92,84,${0.3 + R() * 0.25})`; c.lineWidth = 1.5 + R() * 2; c.lineCap = 'round'
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke()
    }
  }, true)
  yield
  if (skinBump) skinBump.colorSpace = THREE.NoColorSpace
  for (const t of [skin, skinBump, flesh, head]) if (t) t.userData.entityShared = true
  TEX = { skin, skinBump, flesh, head }
  return TEX
}

let textureJob: Generator<void, ThingTextures, unknown> | null = null
export function* prepareThingTextures(): Generator<void, void, unknown> {
  while (!TEX) { textureJob ??= createTexturesJob(); if (textureJob.next().done) textureJob = null; else yield }
}
function textures(): ThingTextures { for (const _ of prepareThingTextures()) void _; return TEX! }

// ---------------- 材质 ----------------
type ThingMats = ReturnType<typeof makeMats>
function makeMats() {
  const T = textures()
  const skin = litMaterial({ color: '#c9c7c0', map: T.skin ?? undefined, bumpMap: T.skinBump ?? undefined, bumpScale: 2.2, vertexColors: true, roughness: 0.58, metalness: 0.04, envBase: 0.16, emissive: '#0d0e10', emissiveIntensity: 0.18, side: THREE.DoubleSide })
  const head = litMaterial({ color: '#c4c2bc', map: T.head ?? undefined, bumpMap: T.head ?? undefined, bumpScale: 0.9, vertexColors: true, roughness: 0.3, metalness: 0.06, envBase: 0.45, emissive: '#0c0c0e', emissiveIntensity: 0.18, side: THREE.DoubleSide })
  const tar = litMaterial({ color: '#050403', roughness: 0.12, metalness: 0.1, envBase: 0.85, emissive: '#000000' })
  const mouth = litMaterial({ color: '#100607', roughness: 0.85, emissive: '#050102', emissiveIntensity: 0.05, side: THREE.DoubleSide })
  const gum = litMaterial({ color: '#3a0d12', roughness: 0.55, emissive: '#0a0103', emissiveIntensity: 0.06 })
  // 獠牙：照片里是半透明的玻璃质，根部泛黄
  const tooth = litMaterial({ color: '#dfe6e6', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.62, emissive: '#1d2224', emissiveIntensity: 0.2 })
  const eye = litMaterial({ color: '#020304', roughness: 0.08, metalness: 0, emissive: '#05090c', emissiveIntensity: 0.15, envBase: 0.3 })
  // 照膜反光：照片里瞳孔深处那团发白的蓝光
  const tapetum = litMaterial({ color: '#1e2a30', roughness: 0.3, emissive: '#3c5c6c', emissiveIntensity: 0.25, transparent: true, opacity: 0.6, depthWrite: false })
  const bone = litMaterial({ color: '#1e1310', roughness: 0.7, envBase: 0.12, emissive: '#050101', emissiveIntensity: 0.08 })
  const dots = litMaterial({ color: '#7f97a3', roughness: 0.3, emissive: '#4f6f80', emissiveIntensity: 0.45 })
  const eyeFilm = litMaterial({ color: '#8fa0a6', roughness: 0.02, transparent: true, opacity: 0.07, depthWrite: false, emissive: '#2a3438', emissiveIntensity: 0.2 })
  const photophore = litMaterial({ color: '#5e584a', roughness: 0.45, emissive: '#5a5236', emissiveIntensity: 0.28 })
  const gillRed = litMaterial({ color: '#34141a', roughness: 0.92, emissive: '#0c0104', emissiveIntensity: 0.15, side: THREE.DoubleSide })
  const membrane = litMaterial({ color: '#1d1512', roughness: 0.35, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, emissive: '#0c0a08', emissiveIntensity: 0.2 })
  const ray = litMaterial({ color: '#8e8a7c', roughness: 0.7, emissive: '#121110', emissiveIntensity: 0.1 })
  const barbel = litMaterial({ color: '#a9b8be', roughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false, emissive: '#2c3438', emissiveIntensity: 0.3 })
  const lure = litMaterial({ color: '#d4bb5c', roughness: 0.35, emissive: '#c5a646', emissiveIntensity: 1.2 })
  const flesh = litMaterial({ color: '#ffffff', map: T.flesh ?? undefined, roughness: 0.3, envBase: 0.5, emissive: '#2a0507', emissiveIntensity: 0.25, side: THREE.DoubleSide })
  const worm = litMaterial({ color: '#ddd3b8', roughness: 0.4, emissive: '#2a2620', emissiveIntensity: 0.2 })
  const hole = litMaterial({ color: '#030202', roughness: 1, emissive: '#000000' })
  return { skin, head, tar, mouth, gum, tooth, eye, eyeFilm, photophore, gillRed, membrane, ray, barbel, lure, flesh, worm, hole, tapetum, bone, dots }
}


// ---------------- 部件 ----------------
/** 弯曲獠牙：根部粗、尖端细，向 dir 方向伸、末端朝 curl 方向勾 */
function fang(len: number, root: number, curl: number, R: () => number, q = 6): THREE.BufferGeometry {
  const pts = [V(0, 0, 0), V(curl * 0.12 * len, len * 0.45, 0), V(curl * 0.38 * len, len * 0.86, (R() - 0.5) * 0.08 * len), V(curl * 0.55 * len, len, 0)]
  return sweep(pts, (t) => root * (1 - t * 0.94) * (q > 6 ? 1 + 0.06 * Math.sin(t * 40) * (1 - t) : 1), { radial: q, seg: q }) // 精细版：牙根有细微的生长环
}

/** 细长鳍条扇（三脚鱼那种长丝状鳍条 + 半透明鳍膜），沿 +Y 伸出，后掠 */
function rayFin(size: number, R: () => number, M: ThingMats): THREE.Group {
  const g = new THREE.Group()
  const n = 5 + Math.floor(R() * 4)
  const rays: THREE.BufferGeometry[] = []
  const tips: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const len = size * (0.7 + 0.6 * Math.sin(u * Math.PI * 0.9 + 0.2)) * (0.75 + R() * 0.5)
    const back = -size * (0.25 + u * 0.55)
    const tip = V(back, len, (u - 0.5) * size * 0.2)
    tips.push(tip)
    rays.push(sweep([V((u - 0.5) * size * 0.3, 0, 0), V(back * 0.45 + (u - 0.5) * size * 0.15, len * 0.55, tip.z * 0.5), tip], (t) => size * 0.03 * (1 - t * 0.85) + 0.006, { radial: 4, seg: 6 }))
  }
  g.add(new THREE.Mesh(merge(rays), M.ray))
  // 鳍膜：只连到鳍条长度的 55%，边缘破烂
  const pos: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const a0 = V((i / (n - 1) - 0.5) * size * 0.3, 0, 0), b0 = V(((i + 1) / (n - 1) - 0.5) * size * 0.3, 0, 0)
    const k1 = 0.35 + R() * 0.25, k2 = 0.35 + R() * 0.25
    const a1 = a0.clone().lerp(tips[i], k1), b1 = b0.clone().lerp(tips[i + 1], k2)
    pos.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, a1.x, a1.y, a1.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z)
  }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((_, i) => i % 3 === 0 ? [pos[i] / Math.max(.001, size), pos[i + 1] / Math.max(.001, size)] : []), 2)); mg.computeVertexNormals()
  g.add(new THREE.Mesh(mg, M.membrane))
  return g
}

/** 伤口：黑洞 + 外翻的肉缘 + 探出来的寄生虫 */
function wound(r: number, R: () => number, M: ThingMats): THREE.Group {
  const g = new THREE.Group()
  const holeM = new THREE.Mesh(new THREE.CircleGeometry(r * 0.62, 14), M.hole); holeM.position.z = 0.01; g.add(holeM)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, r * 0.2, 6, 16), M.flesh); rim.scale.z = 0.5; g.add(rim)
  for (let i = 0; i < 3 + Math.floor(R() * 4); i++) {
    const a = R() * 6.28, rr = R() * r * 0.45
    const l = r * (0.5 + R() * 0.9)
    const w = sweep([V(Math.cos(a) * rr, Math.sin(a) * rr, -0.05), V(Math.cos(a) * rr + (R() - 0.5) * l * 0.4, Math.sin(a) * rr + (R() - 0.5) * l * 0.4, l * 0.5), V(Math.cos(a) * rr + (R() - 0.5) * l * 0.8, Math.sin(a) * rr + (R() - 0.5) * l * 0.8, l)], (t) => 0.018 + 0.012 * Math.sin(t * Math.PI), { radial: 5, seg: 6 })
    g.add(new THREE.Mesh(w, M.worm))
  }
  return g
}

/** 皮上的焦油：鼓起的油亮团块 + 往下淌的一条 */
function tarSeep(s: number, R: () => number): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = []
  const blob = new THREE.SphereGeometry(s, 10, 7); blob.scale(1.3, 1, 0.32); gs.push(blob)
  const l = s * (2 + R() * 3)
  gs.push(sweep([V(0, 0, 0.02), V((R() - 0.5) * s, -l * 0.5, 0.03), V((R() - 0.5) * s, -l, 0.02)], (t) => s * 0.35 * (1 - t * 0.6) * (t > 0.92 ? 1.6 : 1), { radial: 6, seg: 8 }))
  return merge(gs.map((g) => g.index ? g.toNonIndexed() : g).map((g) => { if (g.getAttribute('color')) g.deleteAttribute('color'); return g }))
}

/** 躯干半径（体节 i 的局部 t=0..1 处） */
export function thingRadius(i: number, t = 0.5): number {
  const u = (i + t) / THING.segs
  return THING.r0 + (THING.r1 - THING.r0) * sstep(0, 1, u)
}

export type ThingLod = 'hi' | 'lo'
/** 平滑值噪声（几何细节用；确定性） */
function vnoise(x: number, y: number, seed = 0): number {
  const h = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453; return v - Math.floor(v) }
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v
}
const fbm = (x: number, y: number, seed = 0) => vnoise(x, y, seed) * 0.55 + vnoise(x * 2.1, y * 2.1, seed + 1) * 0.28 + vnoise(x * 4.3, y * 4.3, seed + 2) * 0.17

type RF = (t: number, d: THREE.Vector3, cs: number, sn: number) => number
/** 沿样条扫掠的管体（含 UV 与顶点色）。rf 给半径，shade 给顶点色明度（AO/骨突）。 */
function* thingSweepJob(pts: THREE.Vector3[], rf: RF, o: { radial?: number; seg?: number; vRep?: number; uRep?: number; shade?: RF } = {}): Generator<void, THREE.BufferGeometry, unknown> {
  const radial = o.radial ?? 10, seg = o.seg ?? 12
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
  const T = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), d = new THREE.Vector3(), P = new THREE.Vector3()
  const Z = V(0, 0, 1), X = V(1, 0, 0)
  for (let i = 0; i <= seg; i++) {
    if ((i & 1) === 0) yield
    const t = i / seg
    curve.getPointAt(t, P); curve.getTangentAt(t, T)
    n1.crossVectors(T, Math.abs(T.z) < 0.9 ? Z : X).normalize(); n2.crossVectors(n1, T).normalize()
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      d.copy(n1).multiplyScalar(Math.cos(a)).addScaledVector(n2, Math.sin(a))
      const cs = Math.cos(a), sn = Math.sin(a)
      const r = rf(t, d, cs, sn)
      pos.push(P.x + d.x * r, P.y + d.y * r, P.z + d.z * r)
      uv.push((j / radial) * (o.uRep ?? 1), t * (o.vRep ?? 1))
      const c = o.shade ? o.shade(t, d, cs, sn) : 1
      col.push(c, c, c)
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx); g.computeVertexNormals()
  return g
}

/** 一节躯干管：沿 -X 从 x0（与前一节重叠）到 x1；截面背圆腹平。
 *  hi：144×72 网格，鳞片是真几何——覆瓦状鳞板（后缘翘起、鳞缝下陷），大片掉鳞处露出起皱的皮革，叠旧疤沟与瘤。 */
function* segmentTube(i: number, lod: ThingLod, x0 = 0.45, x1 = -SP - 0.45, capFront = false, capBack = false): Generator<void, THREE.BufferGeometry, unknown> {
  const R = rng(0x7e5 + i * 31)
  const hi = lod === 'hi'
  const bumps = Array.from({ length: 5 }, () => [R(), R() * 6.28, 0.04 + R() * 0.08, 0.1 + R() * 0.15] as const)
  const scars = Array.from({ length: 3 }, () => [R(), R() * 6.28, (R() - 0.5) * 1.6, 0.25 + R() * 0.5] as const)
  const L = x0 - x1
  const pts = [V(x0, 0, 0), V(x0 - L * 0.5, 0, 0), V(x1, 0, 0)]
  const NA = 40 // 一圈鳞片数（整数，绕一圈无缝）
  const relief = (t: number, d: THREE.Vector3) => {
    const th = Math.atan2(d.z, d.y), xw = x0 - L * t + i * SP // 沿体长的连续坐标（跨体节连续）
    const cu = (th / (Math.PI * 2) + 0.5) * NA, v = -xw / 0.36
    const row = Math.floor(v), uu = cu + (row & 1) * 0.5, fu = uu - Math.floor(uu) - 0.5, fv = v - row
    // 覆瓦鳞：前缘埋进上一片下面，后缘（fv→1）翘起，鳞缝处下陷
    let h = 0.016 * Math.pow(fv, 1.6) * (1 - Math.pow(Math.abs(fu) * 2, 3)) - 0.006 * Math.pow(Math.max(0, Math.abs(fu) * 2 - 0.85) / 0.15, 2)
    // 掉鳞斑：低频噪声阈值，露出起皱皮革
    const bald = sstep(0.58, 0.66, fbm(xw * 0.55, th * 1.2, i * 0.1 + 7))
    const wrinkle = 0.007 * Math.sin(xw * 22 + Math.sin(th * 6) * 2.4) * fbm(xw * 2, th * 3, 3)
    h = h * (1 - bald) + bald * (wrinkle - 0.006)
    // 旧疤：一条下陷的沟，沟沿微隆
    for (const [st, sa, slope, len] of scars) {
      const along = (t - st) / len
      if (Math.abs(along) > 0.5) continue
      const dist = ((th - sa - along * slope + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      h += -0.035 * Math.exp(-(dist * dist) / 0.0016) + 0.012 * Math.exp(-(dist * dist) / 0.008)
    }
    return h + 0.008 * (fbm(xw * 1.3, th * 2.0, 11) - 0.5)
  }
  return yield* thingSweepJob(pts, (t, d) => {
    const tt = (x0 - (x0 - L * t)) / SP
    let r = thingRadius(i, Math.min(1, Math.max(0, tt)))
    // 截面：背侧圆、腹侧略平、两侧略收（竖椭圆，侧扁的深海鱼身）；随机隆起（旧伤愈合的瘤）
    r *= 1 - 0.1 * Math.max(0, -d.y) ** 2 + 0.05 * Math.max(0, d.y) - 0.06 * d.z * d.z
    for (const [bt, ba, bh, bw] of bumps) r *= 1 + bh * gauss(t, bt, bw) * Math.max(0, Math.cos(Math.atan2(d.z, d.y) - ba)) ** 6
    if (hi) r *= 1 + relief(t, d)
    if (capFront) r *= Math.sqrt(Math.min(1, t / 0.06 + 0.15))
    if (capBack) r *= Math.sqrt(Math.min(1, (1 - t) / 0.06 + 0.15))
    return r
  }, {
    radial: hi ? 144 : 22, seg: hi ? Math.round(72 * L / (SP + 0.9)) : 10, uRep: 2, vRep: 1.2,
    shade: (t, d) => {
      let c = 0.55 + 0.45 * (0.5 + 0.5 * d.y) // 腹侧暗、背侧亮的假 AO
      if (hi) c *= 0.82 + 7 * Math.max(-0.02, Math.min(0.025, relief(t, d))) // 鳞缝与疤沟压暗
      return c
    },
  })
}

/** 切面圆盘：凝血胶质 + 软骨环（故障体节断口） */
function cutFace(r: number, q: number, M: ThingMats): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, q), M.flesh)
  m.rotation.y = Math.PI / 2
  return m
}

// ---------------- 头 ----------------
// 按黑巨口鱼照片的比例：吻极短，大眼几乎贴在吻端、正好在嘴角上方；嘴裂一直开到鳃后（约头长 80%），
// 下颌是两根细长骨杆，比上颌更长、尖端带钩；牙稀疏、长短悬殊、玻璃般半透明；
// 眼后一条乳白发光条；颏下一根苍白的长须向前下方伸出；鳃后翻出一大片粉红鳃丝。
// 头皮无鳞、湿滑发亮（版画的鳞只从颈后开始）。
/** 颅部轮廓（头局部 x → 上缘 y、下缘 y＝嘴裂、半宽 z） */
const HEAD_PROFILE = {
  // 颅顶明显隆起（照片里头比身体还高一截），侧面收窄成竖椭圆，不再是扁平的
  top: [[0, 1.6], [0.8, 2.05], [1.7, 2.12], [2.6, 1.85], [3.3, 1.42], [3.8, 1.08], [4.2, 0.66], [4.5, 0.05]] as const,
  bot: [[0, -1.6], [0.6, -1.12], [1.1, -0.66], [2.4, -0.52], [3.6, -0.36], [4.35, -0.18], [4.5, -0.05]] as const,
  half: [[0, 1.5], [1.2, 1.36], [2.4, 1.12], [3.4, 0.88], [4.1, 0.6], [4.5, 0.12]] as const,
}
function lerpTab(tab: readonly (readonly [number, number])[], x: number): number {
  if (x <= tab[0][0]) return tab[0][1]
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; const t = sstep(0, 1, (x - x0) / (x1 - x0)); return y0 + (y1 - y0) * t }
  return tab[tab.length - 1][1]
}
/** 头皮精细起伏（单位：相对半径）：鳃盖缝沟、眼后的放射状皱褶、侧线孔、颅顶骨板棱、细碎皮肤噪声、两道旧疤 */
function headRelief(x: number, a: number, dy: number, dz: number, top: number, bot: number): number {
  const yN = dy // -1 腹 … 1 背（截面方向）
  let h = 0
  // 鳃盖后缘：一条从颅顶后方斜着落到铰链后的深沟，沟前缘微微翻起
  const ox = 1.0 + 0.32 * yN
  h += -0.045 * Math.exp(-((x - ox) ** 2) / 0.0035) + 0.018 * Math.exp(-((x - ox - 0.09) ** 2) / 0.006)
  // 前鳃盖：第二道浅沟
  const px = 1.9 + 0.18 * yN
  h += -0.02 * Math.exp(-((x - px) ** 2) / 0.003) * (yN < 0.6 ? 1 : 0.3)
  // 眼后放射皱褶（从眼眶往后散开的皮褶）
  const ex = 3.72, ey = 0.36, rr = Math.hypot(x - ex, (yN * (top - bot) / 2 + (top + bot) / 2) - ey)
  if (rr > 0.55 && rr < 1.6) {
    const ang = Math.atan2(yN, x - ex)
    h += 0.012 * Math.sin(ang * 26) * sstep(0.55, 0.75, rr) * (1 - sstep(1.0, 1.6, rr)) * Math.abs(dz)
  }
  // 侧线：一排下陷的小孔，沿体侧中线
  if (Math.abs(dz) > 0.6) {
    const lineY = 0.15 - 0.1 * x / 4.5
    const ph = (x * 9) % 1, dist = Math.abs(yN - lineY)
    h += -0.02 * Math.exp(-((ph - 0.5) ** 2) / 0.01) * Math.exp(-(dist * dist) / 0.002) * sstep(0.2, 0.5, x) * (1 - sstep(3.0, 3.3, x))
  }
  // 颅顶：几道纵向骨板棱
  if (yN > 0.5) h += 0.012 * Math.max(0, Math.sin(a * 22)) * (yN - 0.5) * 2 * sstep(0.3, 1.2, x) * (1 - sstep(3.3, 3.9, x))
  // 皮肤：细皱 + 粗糙噪声
  h += 0.009 * (fbm(x * 5, a * 3, 21) - 0.5) + 0.004 * Math.sin(x * 70 + Math.sin(a * 9) * 3) * fbm(x * 3, a * 4, 4)
  // 两道旧疤（鱼叉 / 撕咬）
  const s1 = Math.abs(yN - (0.55 - (x - 1.4) * 0.35)), s2 = Math.abs(yN - (-0.1 + (x - 2.2) * 0.5))
  if (dz > 0 && x > 1.2 && x < 2.6) h += -0.03 * Math.exp(-(s1 * s1) / 0.0012) + 0.01 * Math.exp(-(s1 * s1) / 0.006)
  if (dz < 0 && x > 1.8 && x < 3.0) h += -0.025 * Math.exp(-(s2 * s2) / 0.001)
  return h
}

export interface ThingHeadContent { base: THREE.Group; jaw: THREE.Group; gillL: THREE.Group; gillR: THREE.Group; eyeL: THREE.Object3D; eyeR: THREE.Object3D; photoL: THREE.Object3D; photoR: THREE.Object3D }
/** 头部一个精度级别的全部几何：base（颅、上颌、眼）挂在 head 节点下，jaw 挂在下颌铰链节点下，gillL/R 挂在鳃盖节点下。 */
function* buildHeadContent(lod: ThingLod, M: ThingMats): Generator<void, ThingHeadContent, unknown> {
  const R = rng(0x20e7), hi = lod === 'hi'
  const head = new THREE.Group(); head.name = `thingHead_${lod}`
  const FQ = hi ? 12 : 6
  const eyes: THREE.Object3D[] = [], photos: THREE.Object3D[] = [], gills: THREE.Group[] = []
  const HX = THING.hinge.x, HY = THING.hinge.y
  // 颅：逐截面椭圆（中心线随上下缘移动），比球体拼接更像一整块头骨上蒙的皮
  {
    const X0 = -0.3, X1 = 4.5, NX = hi ? 180 : 40, NR = hi ? 144 : 30
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
    for (let i = 0; i <= NX; i++) {
      if ((i & 1) === 0) yield
      const x = X0 + (X1 - X0) * i / NX
      const top = lerpTab(HEAD_PROFILE.top, x), bot = lerpTab(HEAD_PROFILE.bot, x), hw = lerpTab(HEAD_PROFILE.half, x)
      const cy = (top + bot) / 2, ry = (top - bot) / 2
      for (let j = 0; j <= NR; j++) {
        const a = j / NR * Math.PI * 2
        let dy = Math.cos(a), dz = Math.sin(a)
        // 截面：背侧略收成钝脊，腹侧（嘴线）压平
        const flatK = dy < 0 ? 0.55 + 0.45 * (1 - sstep(0.5, 3, x)) : 1
        dy *= flatK
        // 眼眶处的骨突与眼后凹陷
        const bump = 0.06 * gauss(x, 3.62, 0.35) * Math.max(0, dz * dz) - 0.05 * gauss(x, 2.9, 0.3) * Math.abs(dz)
        let k = 1 + bump + 0.012 * Math.sin(a * 7 + x * 3)
        if (hi) k += headRelief(x, a, dy, dz, top, bot)
        pos.push(x, cy + dy * ry * k, dz * hw * k)
        uv.push(j / NR * 2, x / 4.5)
        col.push(...Array(3).fill((0.45 + 0.55 * (0.5 + 0.5 * Math.cos(a)) - 0.1 * gauss(x, 2.95, 0.25)) * (hi ? 0.85 + 6 * Math.max(-0.025, Math.min(0.02, headRelief(x, a, dy, dz, top, bot))) : 1)))
      }
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NR; j++) { const a = i * (NR + 1) + j, b = a + NR + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setIndex(idx); g.computeVertexNormals()
    head.add(new THREE.Mesh(g, M.head))
  }
  // 上颌骨（嘴裂上沿）：细骨条，挂稀疏的玻璃獠牙；前端两颗前颌大牙
  const upper: [number, number, number][] = [[HX, HY + 0.02, 1.0], [2.2, -0.48, 0.98], [3.2, -0.36, 0.8], [4.0, -0.24, 0.5], [4.42, -0.12, 0.12]]
  for (const side of [-1, 1]) {
    const pts = upper.map(([x, y, z]) => V(x, y, side * z))
    head.add(new THREE.Mesh(sweep(pts, (t, d) => (0.05 - t * 0.022) * (hi ? 1 + 0.12 * fbm(t * 30, Math.atan2(d.z, d.y), 5) : 1), { radial: hi ? 12 : 6, seg: hi ? 48 : 14 }), M.bone))
    const curve = new THREE.CatmullRomCurve3(pts)
    const teeth: THREE.BufferGeometry[] = []
    const n = 9
    for (let k = 0; k < n; k++) {
      const u = 0.18 + k / n * 0.8 + (R() - 0.5) * 0.04
      const P = curve.getPointAt(Math.min(0.99, u))
      const big = k === n - 1 ? 2.4 : k === n - 3 ? 1.7 : R() < 0.3 ? 1.4 : 0.75 + R() * 0.4
      const len = 0.22 * big
      const f = fang(len, 0.022 * big + 0.008, -0.35 - R() * 0.3, R, FQ)
      f.rotateZ(Math.PI + 0.25) // 向下、略后勾
      f.rotateX(side * (0.1 + R() * 0.15))
      f.translate(P.x, P.y - 0.03, P.z)
      teeth.push(f)
    }
    head.add(new THREE.Mesh(merge(teeth), M.tooth))
  }
  // 口腔：深处只是一团黑（喉咙），上颚是暗色湿肉
  const ps = new THREE.Shape(); ps.moveTo(HX, -0.98); ps.quadraticCurveTo(3.4, -0.75, 4.35, 0); ps.quadraticCurveTo(3.4, 0.75, HX, 0.98); ps.closePath()
  const palate = new THREE.Mesh(new THREE.ShapeGeometry(ps, hi ? 40 : 10), M.mouth)
  palate.rotation.x = Math.PI / 2; palate.position.set(0, HY + 0.1, 0); head.add(palate)
  const throatBack = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), M.hole); throatBack.rotation.y = Math.PI / 2; throatBack.position.set(HX - 0.08, HY - 0.3, 0); head.add(throatBack)

  // 下颌：两根细骨杆，前端在中线合拢成钩状颏，比吻端长约 0.5m；中间只有一层半透明薄膜
  const jaw = new THREE.Group(); jaw.name = `thingJaw_${lod}`
  const ram: [number, number, number][] = [[0, -0.02, 1.02], [1.2, -0.1, 0.96], [2.3, -0.08, 0.72], [3.2, 0.0, 0.36], [3.6, 0.1, 0.06]]
  for (const side of [-1, 1]) {
    const pts = ram.map(([x, y, z]) => V(x, y, side * z))
    jaw.add(new THREE.Mesh(sweep(pts, (t, d) => (0.12 - t * 0.06) * (d.y < 0 ? 1.15 : 0.85) * (hi ? 1 + 0.1 * fbm(t * 26, Math.atan2(d.z, d.y) * 1.5, 9) + 0.05 * Math.max(0, Math.sin(t * 60)) : 1), { radial: hi ? 16 : 8, seg: hi ? 64 : 16, shade: (_t, d) => 0.55 + 0.35 * (0.5 + 0.5 * d.y) }), M.bone))
    const curve = new THREE.CatmullRomCurve3(pts)
    const teeth: THREE.BufferGeometry[] = []
    const n = 8
    for (let k = 0; k < n; k++) {
      const u = 0.22 + k / n * 0.76 + (R() - 0.5) * 0.04
      const P = curve.getPointAt(Math.min(0.99, u))
      const front = sstep(0.55, 1, u)
      const big = k === n - 1 ? 3.4 : k === n - 2 ? 2.2 : k === 3 ? 1.9 : 0.7 + R() * 0.5
      const len = 0.22 * big
      const f = fang(len, 0.022 * big + 0.008, 0.25 + front * 0.6, R, FQ)
      f.rotateZ(-0.25 - front * 0.35) // 前端獠牙前倾
      f.rotateX(-side * (0.08 + R() * 0.12))
      f.translate(P.x, P.y + 0.1, P.z)
      teeth.push(f)
    }
    jaw.add(new THREE.Mesh(merge(teeth), M.tooth))
  }
  // 颏钩
  jaw.add(new THREE.Mesh(sweep([V(3.5, 0.08, 0), V(3.78, 0.18, 0), V(3.92, 0.42, 0)], (t) => 0.1 * (1 - t * 0.8), { radial: 6, seg: 6 }), M.bone))
  // 下颌间的半透明皮膜 + 一列小发光点（龙鱼腹侧的发光器）
  const ms = new THREE.Shape(); ms.moveTo(0, -1.0); ms.quadraticCurveTo(2.3, -0.75, 3.6, -0.04); ms.lineTo(3.6, 0.04); ms.quadraticCurveTo(2.3, 0.75, 0, 1.0); ms.closePath()
  const mem = new THREE.Mesh(new THREE.ShapeGeometry(ms, 10), M.membrane); mem.rotation.x = -Math.PI / 2; mem.position.y = -0.16; jaw.add(mem)
  const dotG: THREE.BufferGeometry[] = []
  for (const side of [-1, 1]) for (let k = 0; k < 14; k++) {
    const u = k / 14, P = new THREE.CatmullRomCurve3(ram.map(([x, y, z]) => V(x, y - 0.16, side * z * 0.92))).getPointAt(u)
    if (R() < 0.25) continue; const d = new THREE.SphereGeometry(0.018 + R() * 0.014, hi ? 10 : 6, hi ? 8 : 4); d.translate(P.x + (R() - 0.5) * 0.08, P.y - 0.02, P.z); dotG.push(d)
  }
  jaw.add(new THREE.Mesh(merge(dotG), M.dots))
  // 颏须：从颏下伸出，先向前下、再下垂；苍白半透明，末端是发「肮脏黄光」的饵球和几缕细丝
  const bp = [V(3.25, -0.12, 0), V(3.7, -0.75, 0.04), V(3.95, -1.6, -0.06), V(3.8, -2.5, 0.08), V(3.55, -3.1, 0.02)]
  jaw.add(new THREE.Mesh(sweep(bp, (t) => 0.036 - t * 0.018, { radial: hi ? 12 : 7, seg: hi ? 48 : 18 }), M.barbel))
  const lure = new THREE.Mesh(new THREE.SphereGeometry(0.15, hi ? 32 : 14, hi ? 24 : 10), M.lure); lure.position.copy(bp[4]); lure.scale.set(0.9, 1.35, 0.9)
  jaw.add(lure)
  const fil: THREE.BufferGeometry[] = []
  for (let k = 0, nf = hi ? 18 : 7; k < nf; k++) { const a = k / nf * 6.28; const p = bp[4]; fil.push(sweep([p.clone(), V(p.x + Math.cos(a) * 0.12, p.y - 0.3, p.z + Math.sin(a) * 0.12), V(p.x + Math.cos(a) * 0.22, p.y - 0.6 - R() * 0.4, p.z + Math.sin(a) * 0.22)], () => 0.01, { radial: 4, seg: 5 })) }
  jaw.add(new THREE.Mesh(merge(fil), M.barbel))

  // 眼：几乎贴在吻端、嘴角上方；黑色玻璃体 + 深处发白的照膜反光 + 一层浑浊薄翳 + 骨质眼眶
  for (const side of [-1, 1]) {
    const ex = 3.72, ey = 0.36, ez = side * 0.62
    const socket = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, hi ? 16 : 8, hi ? 72 : 26), M.head)
    socket.position.set(ex, ey, side * 0.8); socket.rotation.y = side * 0.38; socket.scale.set(1, 1, 0.6); head.add(socket)

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.5, hi ? 64 : 24, hi ? 48 : 16), M.eye)
    eye.position.set(ex, ey, ez); eye.scale.set(1, 1, 0.7); head.add(eye)
    const tap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), M.tapetum)
    tap.position.set(ex + 0.06, ey + 0.03, side * 0.968); tap.scale.set(1, 1, 0.1); head.add(tap)
    const film = new THREE.Mesh(new THREE.SphereGeometry(0.51, hi ? 64 : 24, hi ? 32 : 16, 0, Math.PI * 2, 0, Math.PI * 0.45), M.eyeFilm)
    film.position.copy(eye.position); film.scale.copy(eye.scale); film.rotation.x = side * Math.PI / 2; head.add(film)
    // 眼后发光条：照片里那条乳白的横条
    const ph = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.5, 4, 10), M.photophore)
    ph.rotation.z = Math.PI / 2 + 0.06; ph.position.set(3.0, 0.24, side * 0.93); ph.scale.set(1, 1, 0.45); ph.rotation.y = side * 0.32; head.add(ph)
    eyes.push(eye); photos.push(ph)
  }
  // 鳃：铰链后下方一大片粉红鳃丝（绒毛般成束外翻），外面是一层半透明鳃盖膜
  for (let gi = 0; gi < 2; gi++) {
    const op = new THREE.Group(); op.name = `opercle_${lod}`
    const strands: THREE.BufferGeometry[] = []
    for (let k = 0, ns = hi ? 420 : 150; k < ns; k++) {
      if ((k & 15) === 0) yield
      const u = R(), along = u * 1.6 // 沿鳃弓从上（后上）到下（前下）
      const bx = -0.15 + along * 0.35, by = 0.55 - along * 1.05
      const l = (0.35 + 0.45 * Math.sin(u * Math.PI)) * (0.7 + R() * 0.6)
      const ox = -0.45 - R() * 0.4, oy = (R() - 0.6) * 0.5
      const droop = -0.25 - R() * 0.35, cz = 0.06 + R() * 0.1
      strands.push(sweep([V(bx, by, 0), V(bx + ox * l * 0.4, by + oy * l * 0.4, cz), V(bx + ox * l * 0.8, by + (oy + droop * 0.5) * l, cz * 1.8), V(bx + ox * l * 0.95, by + (oy + droop) * l, cz * 2.2 + (R() - 0.5) * 0.1)], (t) => (hi ? 0.016 : 0.024) * (1 - t * 0.7) * (hi ? 1 + 0.25 * Math.sin(t * 30 + k) : 1), { radial: hi ? 6 : 4, seg: hi ? 10 : 5 }))
    }
    op.add(new THREE.Mesh(merge(strands), M.gillRed))
    // （鳃盖膜去掉：在大尺度下是一块突兀的平板；鳃丝直接从鳃盖缝沟里翻出）
    gills.push(op)
  }
  // 头上几道旧伤与焦油
  for (const [x, y, z, s0] of [[1.2, 1.3, 0.6, 0.2], [2.1, 1.15, -0.7, 0.14]] as const) {
    const t = new THREE.Mesh(tarSeep(s0, R), M.tar); t.position.set(x, y, z); t.lookAt(x, y + 3, z * 3); head.add(t)
  }
  return { base: head, jaw, gillL: gills[0], gillR: gills[1], eyeL: eyes[0], eyeR: eyes[1], photoL: photos[0], photoR: photos[1] }
}

// ---------------- 组装 ----------------
/** 一节躯干一个精度级别的几何：main 挂在 seg 节点下；故障断节另有 b（后半截，挂在可漂移的 seg{i}b 节点下）。 */
function* buildSegContent(i: number, lod: ThingLod, M: ThingMats): Generator<void, { main: THREE.Group; b: THREE.Group | null }, unknown> {
  const R = rng(0x5e9 + i * 101)
  const main = new THREE.Group(); main.name = `seg${i}_${lod}`
  let b: THREE.Group | null = null
  const fq = lod === 'hi' ? 64 : 24
  if (THING.glitchSegs.includes(i)) {
    // 断口：本节在 40% 处断开（两截各自封口、露出切面），中间空 0.7 单位——动画层会让两截错位漂浮
    const cut = -SP * 0.4
    main.add(new THREE.Mesh(yield* segmentTube(i, lod, 0.15, cut + 0.35, false, true), M.skin))
    b = new THREE.Group(); b.name = `seg${i}b_${lod}`
    b.add(new THREE.Mesh(yield* segmentTube(i, lod, cut - 0.35, -SP - 0.15, true, false), M.skin))
    const f1 = cutFace(thingRadius(i, 0.4), fq, M); f1.position.x = cut + 0.36; f1.rotation.y = -Math.PI / 2
    const f2 = cutFace(thingRadius(i, 0.4), fq, M); f2.position.x = cut - 0.36
    main.add(f1); b.add(f2)
  } else {
    main.add(new THREE.Mesh(yield* segmentTube(i, lod), M.skin))
  }
  // 伤口与焦油（两级用同一随机序列，位置一致）
  const nW = R() < 0.55 ? 1 + Math.floor(R() * 2) : 0
  for (let k = 0; k < nW; k++) {
    const a = (R() - 0.5) * 3.6
    const x = -SP * (0.15 + R() * 0.7)
    const r = thingRadius(i)
    const w = wound(0.18 + R() * 0.3, R, M)
    w.position.set(x, Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98)
    w.lookAt(V(x, Math.cos(a) * r * 3, Math.sin(a) * r * 3))
    main.add(w)
  }
  const nT = 1 + Math.floor(R() * 3)
  const tg: THREE.BufferGeometry[] = []
  for (let k = 0; k < nT; k++) {
    const a = (R() - 0.5) * 2.8
    const x = -SP * (0.1 + R() * 0.8)
    const r = thingRadius(i)
    const g = tarSeep(0.12 + R() * 0.22, R)
    // 局部 Z=表面法线，局部 -Y=沿表面朝下（重力在切面上的投影），X=Y×Z 保证右手系
    const Zb = V(0, Math.cos(a), Math.sin(a))
    const Db = V(0, -1, 0).addScaledVector(Zb, Zb.y)
    if (Db.lengthSq() < 1e-4) Db.set(0, 0, 1)
    const Yb = Db.normalize().negate(), Xb = new THREE.Vector3().crossVectors(Yb, Zb)
    g.applyMatrix4(new THREE.Matrix4().makeBasis(Xb, Yb, Zb))
    g.translate(x, Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97)
    tg.push(g)
  }
  if (tg.length) main.add(new THREE.Mesh(merge(tg), M.tar))
  return { main, b }
}

// ---------------- 分部位 LOD ----------------
// 参照残缺者：每个部位（头 / 每一节躯干）各有精细、远景两级。远景级在建模时就建好；
// 精细级只在镜头靠近时按需构建（每帧最多建 budget 个部位），建好后与远景级按距离切换。
interface LodUnit { node: THREE.Object3D; nodes: Record<ThingLod, THREE.Object3D[]>; build: () => Generator<void, THREE.Object3D[], unknown>; job?: Generator<void, THREE.Object3D[], unknown>; hiOn: boolean; dist: number }
function tagLod(objs: THREE.Object3D[], lod: ThingLod) { for (const o of objs) { o.userData.lod = lod; o.visible = lod === 'lo' } }

function* attachHead(parts: Record<string, THREE.Object3D>, lod: ThingLod, M: ThingMats): Generator<void, THREE.Object3D[], unknown> {
  const c = yield* buildHeadContent(lod, M)
  const objs = [c.base, c.jaw, c.gillL, c.gillR]
  tagLod(objs, lod)
  parts.head.add(c.base); parts.jaw.add(c.jaw); parts.gillL.add(c.gillL); parts.gillR.add(c.gillR)
  if (lod === 'lo') { parts.eyeL = c.eyeL; parts.eyeR = c.eyeR; parts.photoL = c.photoL; parts.photoR = c.photoR }
  return objs
}
function* attachSeg(parts: Record<string, THREE.Object3D>, i: number, lod: ThingLod, M: ThingMats): Generator<void, THREE.Object3D[], unknown> {
  const c = yield* buildSegContent(i, lod, M)
  const objs: THREE.Object3D[] = [c.main]
  parts[`seg${i}`].add(c.main)
  if (c.b) { parts[`seg${i}b`].add(c.b); objs.push(c.b) }
  tagLod(objs, lod)
  return objs
}

/** 七层之物完整模型（远景级；精细级由 updateThingLod 按需构建）。
 *  userData.parts 含 head / jaw / eyeL·R / photoL·R / gillL·R / seg{i} / seg{i}b / fin{i}* / gill{i}*。 */
export function* buildThingJob(): Generator<void, THREE.Group, unknown> {
  yield* prepareThingTextures()
  const M = makeMats()
  const grp = new THREE.Group(); grp.name = 'thething'; grp.userData.entityType = 'thething'
  let complete = false
  try {
  const parts: Record<string, THREE.Object3D> = {}
  const units: LodUnit[] = []
  // 头部骨架：head（缩放 S）→ 下颌铰链 jaw、左右鳃盖 gillL/R
  const head = new THREE.Group(); head.name = 'thingHead'; head.scale.setScalar(S)
  grp.add(head); parts.head = head
  const jaw = new THREE.Group(); jaw.name = 'thingJaw'; jaw.position.set(THING.hinge.x, THING.hinge.y, 0); head.add(jaw); parts.jaw = jaw
  for (const side of [-1, 1]) {
    const op = new THREE.Group(); op.name = 'opercle'
    op.position.set(0.7, -0.62, side * 1.12); op.rotation.y = side > 0 ? 0 : Math.PI
    head.add(op); parts[side < 0 ? 'gillL' : 'gillR'] = op
  }
  {
    const u: LodUnit = { node: head, nodes: { lo: yield* attachHead(parts, 'lo', M), hi: [] }, build: () => attachHead(parts, 'hi', M), hiOn: false, dist: Infinity }
    units.push(u)
  }
  for (let i = 0; i < THING.segs; i++) {
    const seg = new THREE.Group(); seg.name = `seg${i}`
    seg.position.set(-i * THING.spacing - 0.1 * S, 0, 0); seg.scale.setScalar(S)
    grp.add(seg); parts[`seg${i}`] = seg
    if (THING.glitchSegs.includes(i)) { const b = new THREE.Group(); b.name = `seg${i}b`; seg.add(b); parts[`seg${i}b`] = b; seg.userData.glitch = true }
    const u: LodUnit = { node: seg, nodes: { lo: yield* attachSeg(parts, i, 'lo', M), hi: [] }, build: () => attachSeg(parts, i, 'hi', M), hiOn: false, dist: Infinity }
    units.push(u)
  }
  grp.userData.thingLod = units
  grp.userData.releasePending = () => { for (const u of units) { u.job?.return(undefined as never); u.job = undefined } }
  // 错位的鳍（大小悬殊、方向随机）
  THING.fins.forEach(([si, ang, size], k) => {
    const seg = parts[`seg${si}`]; if (!seg) return
    const R = rng(0xf1 + k * 7)
    const fin = rayFin(size, R, M)
    const r = thingRadius(si)
    const holder = new THREE.Group(); holder.name = `fin${si}_${k}`
    holder.position.set(-SP * (0.3 + R() * 0.4), 0, 0)
    holder.rotation.x = ang
    fin.position.y = r * 0.95
    holder.add(fin); seg.add(holder); parts[`fin${si}_${k}`] = holder
  })
  // 错位的鳃裂：一列 3~5 道发红的裂口
  THING.gills.forEach(([si, ang, size], k) => {
    const seg = parts[`seg${si}`]; if (!seg) return
    const R = rng(0x9a + k * 13)
    const holder = new THREE.Group(); holder.name = `gill${si}_${k}`
    holder.position.set(-SP * (si === 0 ? 0.2 : 0.3 + R() * 0.4), 0, 0)
    holder.rotation.x = ang
    const r = thingRadius(si)
    const n = 3 + Math.floor(R() * 3)
    for (let j = 0; j < n; j++) {
      const slit = new THREE.Group()
      slit.position.set(-j * 0.32 * size, r * 0.985, 0)
      slit.rotation.z = 0.25 // 鳃裂略斜
      const dark = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), M.hole); dark.rotation.x = -Math.PI / 2; dark.scale.set(0.12 * size, 0.9 * size, 1); dark.position.y = 0.012
      slit.add(dark)
      // 鳃丝：从裂口后缘往外翻出的一排短红丝
      const strands: THREE.BufferGeometry[] = []
      for (let q = 0; q < 9; q++) {
        const zq = (q / 8 - 0.5) * 0.8 * size, l = (0.1 + R() * 0.12) * size * (1 - Math.abs(zq / size))
        strands.push(sweep([V(-0.05 * size, 0, zq), V(-0.09 * size, l * 0.6, zq + (R() - 0.5) * 0.04), V(-0.16 * size, l, zq + (R() - 0.5) * 0.06)], (t) => 0.022 * size * (1 - t * 0.6), { radial: 4, seg: 3 }))
      }
      slit.add(new THREE.Mesh(merge(strands), M.gillRed))
      holder.add(slit)
    }
    seg.add(holder); parts[`gill${si}_${k}`] = holder
  })
  grp.userData.parts = parts
  grp.userData.thingSegmentCount = THING.segs
  grp.userData.thingSegmentSpacing = THING.spacing
  grp.userData.thingLureMat = M.lure
  grp.userData.eyeMats = [M.photophore]
  complete = true
  return grp
  } finally { if (!complete) { disposeL8Tree(grp); for (const m of Object.values(M)) m.dispose() } }
}

export function buildThingMesh(): THREE.Group {
  const job = buildThingJob(); for (;;) { const s = job.next(); if (s.done) return s.value }
}

/** 静态姿态（预览与阶段 2 动画共用的基础件） */
export function poseThing(grp: THREE.Group, p: ThingPose): void {
  const parts = grp.userData.parts as Record<string, THREE.Object3D>
  if (parts.jaw) parts.jaw.rotation.z = -(p.gape ?? 0) * 1.08
  for (const k of ['gillL', 'gillR']) {
    const g = parts[k]; if (g) g.rotation.x = (k === 'gillL' ? -1 : 1) * (p.gill ?? 0.2) * 0.5
  }
  const lm = grp.userData.thingLureMat as THREE.MeshStandardMaterial | undefined
  if (lm) lm.emissiveIntensity = 0.3 + (p.lure ?? 0.8) * 1.2
}

const _lw = new THREE.Vector3()
/** 按镜头距离切换每个部位的精细 / 远景级；需要精细级但还没建的部位，按由近到远每次最多建 budget 个。
 *  mode：'auto' 按距离；'hi' / 'lo' 强制（预览与验收用，'hi' 会一次建完所有部位）。返回本次新建的部位数。 */
export function updateThingLod(grp: THREE.Group, cam: THREE.Vector3, budget = 1, mode: 'auto' | ThingLod = 'auto'): number {
  const units = grp.userData.thingLod as LodUnit[] | undefined
  if (!units) return 0
  let built = 0
  const end = performance.now() + Math.max(0, budget) * 1.5
  for (const u of units) { u.node.getWorldPosition(_lw); u.dist = _lw.distanceTo(cam) }
  const want = (u: LodUnit, k: number) => {
    if (mode !== 'auto') return mode === 'hi'
    const lim = (k === 0 ? THING.hiDistHead : THING.hiDistSeg) * (u.hiOn ? 1.15 : 1)
    return u.dist < lim
  }
  const order = units.map((u, k) => [u, k] as const).sort((a, b) => a[0].dist - b[0].dist)
  for (const [u, k] of order) {
    let on = want(u, k)
    if (on && !u.nodes.hi.length) {
      if ((built < budget && performance.now() < end) || mode === 'hi') {
        u.job ??= u.build()
        do { const step = u.job.next(); if (step.done) { u.nodes.hi = step.value; u.job = undefined; built++; break } } while (mode === 'hi' || performance.now() < end)
      }
      if (!u.nodes.hi.length) on = false
    }
    u.hiOn = on
    for (const o of u.nodes.hi) o.visible = on
    for (const o of u.nodes.lo) o.visible = !on
  }
  return built
}
/** 统计当前显示的三角形（验收用） */
export function thingVisibleTris(grp: THREE.Group): number {
  let tri = 0
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return
    const m = o as THREE.Mesh
    if (m.isMesh) { const g = m.geometry; tri += (g.index ? g.index.count : g.attributes.position.count) / 3 }
    for (const c of o.children) walk(c)
  }
  walk(grp)
  return Math.round(tri)
}
