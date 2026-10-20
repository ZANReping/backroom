// 鹉主杰瑞（Entity 7）重制模型——真实尺寸的紫蓝金刚鹦鹉（Hyacinth Macaw）。
// 依据中文维基新版重写与用户附图：全长约 0.95m（一半以上是长尾羽）；通体钴蓝，翼羽/尾羽更深，
// 飞羽与尾羽腹面偏黑灰；黄色裸皮眼圈、下喙基部一条黄色裸皮带；黑色巨大钩喙；深灰色对趾足（两前两后）。
// 结构：一个 SkinnedMesh（14 根骨骼）× 3 个材质组（羽毛 Canvas 贴图 / 裸露部位顶点色 / 光亮眼球）= 3 次绘制，约 2.6k 三角面。
// 折翼与展翼是两套几何：平时展翼骨骼缩到 0（不可见），扑跳/滑翔/扑击时切换（切换瞬间在一次振翅内完成）。
// 模型按 +Z 正面、脚爪抓握点为原点建造，内层组旋转到 +X（与其他实体同一朝向约定）。
// 羽毛贴图为运行时 Canvas 程序化生成（全部实例共享），无外部资源；Node 下（无 document）退化为纯顶点色。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { litMaterial } from './shared'
import type { Entity } from '../entities'
import type { JerryPose } from '../engine/jerryAI'

type V3 = THREE.Vector3
type RGB = [number, number, number]
/** 骨骼权重：[骨0, 骨1, 骨2, 骨3, 权0, 权1, 权2, 权3] */
type Wt = [number, number, number, number, number, number, number, number]
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const hex = (h: string, k = 1): RGB => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k] }
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const w1 = (b: number): Wt => [b, 0, 0, 0, 1, 0, 0, 0]
const w2 = (a: number, b: number, t: number): Wt => [a, b, 0, 0, 1 - t, t, 0, 0]

// ============================================================================
// 骨骼（静止位置，模型空间：+Z 前、+Y 上、原点=双爪抓握点）
// ============================================================================
export const JB = {
  root: 0, body: 1, chest: 2, neck: 3, head: 4, jaw: 5,
  wfL: 6, wfR: 7, wL1: 8, wL2: 9, wR1: 10, wR2: 11, tail0: 12, tail1: 13,
} as const
const TAIL_DIR = V(0, -0.86, -0.51).normalize() // 静止时尾羽下垂略向后
const REST: V3[] = [
  V(0, 0, 0), // root：抓握点
  V(0, 0.075, -0.035), // body：泄殖腔/髋（躯干俯仰支点）
  V(0, 0.2, 0.0), // chest
  V(0, 0.285, 0.035), // neck
  V(0, 0.345, 0.06), // head
  V(0, 0.331, 0.1), // jaw：下喙铰点
  V(0.066, 0.272, 0.022), V(-0.066, 0.272, 0.022), // 折翼（左/右）
  V(0.07, 0.268, 0.012), V(0.33, 0.29, 0.0), // 展翼左：肩/腕
  V(-0.07, 0.268, 0.012), V(-0.33, 0.29, 0.0), // 展翼右
  V(0, 0.07, -0.07), // tail0：尾基
  V(0, 0.07, -0.07).addScaledVector(TAIL_DIR, 0.24), // tail1：尾中段
]
const PARENT = [-1, 0, 1, 2, 3, 4, 2, 2, 2, 8, 2, 10, 1, 12]

// ============================================================================
// 几何累加器（按材质组）
// ============================================================================
interface Part { pos: number[]; nor?: number[]; uv: number[]; col: number[]; si: number[]; sw: number[]; idx: number[] }
class Acc {
  parts: THREE.BufferGeometry[][] = [[], [], []]
  add(group: number, p: Part) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(p.si, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(p.sw, 4))
    g.setIndex(p.idx)
    if (p.nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3))
    else g.computeVertexNormals()
    this.parts[group].push(g.toNonIndexed())
  }
  build(): THREE.BufferGeometry {
    const groups = this.parts.map((l) => mergeGeometries(l)!)
    const out = mergeGeometries(groups, true)!
    return out
  }
}

/** 网格：rows×cols 个四边形；P(i,j) 给点；seam=列首尾重合（法线平均） */
function grid(rows: number, cols: number, P: (i: number, j: number) => V3, o: {
  uv: (i: number, j: number) => [number, number]; col: (i: number, j: number, p: V3) => RGB; w: (i: number, j: number, p: V3) => Wt
  flip?: boolean; seam?: boolean
}): Part {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = []
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    const p = P(i, j); pos.push(p.x, p.y, p.z)
    const [u, v] = o.uv(i, j); uv.push(u, v)
    const c = o.col(i, j, p); col.push(c[0], c[1], c[2])
    const w = o.w(i, j, p); si.push(w[0], w[1], w[2], w[3]); sw.push(w[4], w[5], w[6], w[7])
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1
    if (o.flip) idx.push(a, a + 1, b, b, a + 1, b + 1)
    else idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  let nor: number[] | undefined
  if (o.seam) { // 首尾列法线平均，消除接缝
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
    const n = g.attributes.normal as THREE.BufferAttribute, t = V(0, 0, 0)
    for (let i = 0; i <= rows; i++) {
      const a = i * (cols + 1), b = a + cols
      t.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize()
      n.setXYZ(a, t.x, t.y, t.z); n.setXYZ(b, t.x, t.y, t.z)
    }
    nor = Array.from(n.array as Float32Array)
  }
  return { pos, nor, uv, col, si, sw, idx }
}

/** 管状放样：沿 YZ 平面内的路径，截面为椭圆（rx 横向；rzF/rzB 截面前/后半径）。截面轴：X 横向、F = X × T */
function loft(path: V3[], rx: number[], rzF: number[], rzB: number[], cols: number, o: {
  uv: (i: number, j: number) => [number, number]; col: (i: number, j: number, p: V3) => RGB; w: (i: number, j: number, p: V3) => Wt
  xOff?: number; flip?: boolean
}): Part {
  const X = V(1, 0, 0), T = V(0, 0, 0), F = V(0, 0, 0)
  const n = path.length - 1
  return grid(n, cols, (i, j) => {
    const a = (j / cols) * Math.PI * 2
    T.copy(path[Math.min(n, i + 1)]).sub(path[Math.max(0, i - 1)]).normalize()
    F.crossVectors(X, T).normalize()
    const s = Math.sin(a), c = Math.cos(a)
    const rz = s >= 0 ? rzF[i] : rzB[i]
    return path[i].clone().addScaledVector(X, c * rx[i] + (o.xOff ?? 0)).addScaledVector(F, s * rz)
  }, { uv: o.uv, col: o.col, w: o.w, flip: o.flip, seam: true })
}

/** 任意方向的小圆管（脚趾、跗跖、眼圈）：路径 + 半径表，平行移动标架 */
function tube(path: V3[], radius: number[], cols: number, color: (t: number) => RGB, w: (t: number) => Wt, group: number, acc: Acc) {
  const n = path.length - 1
  const T: V3[] = [], N: V3[] = [], B: V3[] = []
  for (let i = 0; i <= n; i++) T.push(path[Math.min(n, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize())
  let nn = Math.abs(T[0].y) < 0.9 ? V(0, 1, 0).cross(T[0]).normalize() : V(1, 0, 0).cross(T[0]).normalize()
  for (let i = 0; i <= n; i++) {
    if (i > 0) { const ax = V(0, 0, 0).crossVectors(T[i - 1], T[i]); const s = ax.length(); if (s > 1e-6) nn.applyAxisAngle(ax.normalize(), Math.asin(Math.min(1, s))) }
    nn = nn.sub(T[i].clone().multiplyScalar(nn.dot(T[i]))).normalize()
    N.push(nn.clone()); B.push(V(0, 0, 0).crossVectors(T[i], nn).normalize())
  }
  acc.add(group, grid(n, cols, (i, j) => {
    const a = (j / cols) * Math.PI * 2
    return path[i].clone().addScaledVector(N[i], Math.cos(a) * radius[i]).addScaledVector(B[i], Math.sin(a) * radius[i])
  }, { uv: (i, j) => [j / cols * 0.1, i / n * 0.1], col: (i) => color(i / n), w: (i) => w(i / n), seam: true, flip: true })) // flip：使法线朝外（N×B 标架下默认绕序朝内）
}

// ============================================================================
// 羽毛贴图（1024×512）：左半=覆羽鳞片（横向可平铺的 4×4 块），右半=飞羽/尾羽（8 根羽片，羽轴+斜向羽枝）
// 底色接近白色，由顶点色染成钴蓝/深蓝/黑灰。
// ============================================================================
let FEATHER: THREE.CanvasTexture | null | undefined
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function featherTexture(): THREE.CanvasTexture | null {
  if (FEATHER !== undefined) return FEATHER
  if (typeof document === 'undefined') { FEATHER = null; return null }
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512
  const c = cv.getContext('2d')
  if (!c) { FEATHER = null; return null }
  const R = rng(0x7e7)
  // ---- 左半：覆羽鳞片（小圆头羽片层层叠压；每片有羽轴细线与边缘暗线）----
  c.fillStyle = '#d9dde6'; c.fillRect(0, 0, 512, 512)
  const scale = (x: number, y: number, r: number, light: number) => {
    for (const ox of [-512, 0, 512]) {
      const cx = x + ox
      const g = c.createRadialGradient(cx, y - r * 0.55, r * 0.15, cx, y - r * 0.2, r * 1.15)
      g.addColorStop(0, `rgba(255,255,255,${0.55 * light})`); g.addColorStop(0.7, 'rgba(232,236,244,0.35)'); g.addColorStop(1, 'rgba(120,130,150,0.55)')
      c.fillStyle = g
      c.beginPath(); c.moveTo(cx - r, y - r * 1.4); c.lineTo(cx - r, y - r * 0.1); c.arc(cx, y - r * 0.1, r, Math.PI, 0, true); c.lineTo(cx + r, y - r * 1.4); c.closePath(); c.fill()
      c.strokeStyle = 'rgba(70,80,100,0.45)'; c.lineWidth = 1.4
      c.beginPath(); c.arc(cx, y - r * 0.1, r, Math.PI * 0.05, Math.PI * 0.95); c.stroke()
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1
      c.beginPath(); c.moveTo(cx, y - r * 1.3); c.lineTo(cx, y + r * 0.6); c.stroke()
    }
  }
  const rowH = 15
  for (let row = 0; row * rowH < 512 + 30; row++) {
    const y = row * rowH, off = row % 2 ? 16 : 0
    for (let x = off; x < 512; x += 32) scale(x + (R() - 0.5) * 4, y + (R() - 0.5) * 3, 15 + R() * 3, 0.6 + R() * 0.5)
  }
  // ---- 右半：8 根飞羽（羽轴 + 斜羽枝 + 末端略尖），每根 64px 宽 ----
  c.fillStyle = '#c9ced8'; c.fillRect(512, 0, 512, 512)
  for (let k = 0; k < 8; k++) {
    const x0 = 512 + k * 64, cx = x0 + 32
    const g = c.createLinearGradient(x0, 0, x0 + 64, 0)
    g.addColorStop(0, 'rgba(90,100,120,0.6)'); g.addColorStop(0.15, 'rgba(235,238,245,0.9)'); g.addColorStop(0.5, 'rgba(250,250,255,1)'); g.addColorStop(0.85, 'rgba(225,230,240,0.9)'); g.addColorStop(1, 'rgba(90,100,120,0.6)')
    c.fillStyle = g; c.fillRect(x0 + 2, 0, 60, 512)
    c.strokeStyle = 'rgba(150,158,175,0.5)'; c.lineWidth = 1
    for (let y = -40; y < 560; y += 5 + R() * 2) { // 羽枝（向尖端斜）
      c.beginPath(); c.moveTo(cx, y); c.lineTo(x0 + 3, y + 18); c.stroke()
      c.beginPath(); c.moveTo(cx, y); c.lineTo(x0 + 61, y + 18); c.stroke()
    }
    for (let i = 0; i < 6; i++) { const y = R() * 512; c.strokeStyle = 'rgba(80,90,110,0.35)'; c.beginPath(); c.moveTo(cx, y); c.lineTo(x0 + (R() < 0.5 ? 4 : 60), y + 14); c.stroke() } // 羽枝开叉
    c.strokeStyle = 'rgba(40,46,60,0.75)'; c.lineWidth = 2.4 // 羽轴
    c.beginPath(); c.moveTo(cx, 0); c.lineTo(cx, 512); c.stroke()
  }
  const img = c.getImageData(0, 0, 1024, 512), d = img.data
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n }
  c.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.userData.entityShared = true
  FEATHER = t
  return t
}
/** 覆羽区 UV（u∈[0,0.5)）与飞羽区 UV（第 k 根羽片，u 横跨 1/16 宽） */
const uvScale = (u: number, v: number): [number, number] => [0.5 * (((u % 1) + 1) % 1), v]
const uvFlight = (k: number, u: number, v: number): [number, number] => [0.5 + ((k % 8) + 0.06 + u * 0.88) / 16, v]

// ============================================================================
// 颜色（顶点色乘贴图）
// ============================================================================
const C = {
  cobalt: hex('#2f54c6'), cobaltLite: hex('#4268d6'), deep: hex('#1d3592'), deeper: hex('#15276e'),
  under: hex('#20263a'), yellow: hex('#f2c419'), yellowDeep: hex('#e0a90c'), beak: hex('#18181b'), beakHi: hex('#2c2c31'),
  foot: hex('#3d3e44'), claw: hex('#121214'), eye: hex('#0b0907'), tongue: hex('#2a2224'),
}

// ============================================================================
// 几何
// ============================================================================
interface Cached { geo: THREE.BufferGeometry; tris: number }
let CACHE: Cached | null = null

function buildGeometry(): Cached {
  const acc = new Acc()
  const B = JB

  // ---- 躯干 + 颈 + 头：一根连续放样（泄殖腔 → 腹 → 胸 → 颈 → 头 → 头顶）----
  const sp: [number, number, number, number, number, number][] = [
    // y, z, rx, rzF, rzB, 权重参数 s
    [0.042, -0.058, 0.004, 0.004, 0.004, 0.0],
    [0.05, -0.054, 0.034, 0.032, 0.026, 0.05],
    [0.078, -0.038, 0.058, 0.058, 0.046, 0.12],
    [0.125, -0.018, 0.071, 0.07, 0.056, 0.22],
    [0.175, -0.002, 0.074, 0.074, 0.058, 0.34],
    [0.225, 0.012, 0.072, 0.073, 0.056, 0.46],
    [0.262, 0.03, 0.062, 0.064, 0.05, 0.56],
    [0.292, 0.044, 0.049, 0.052, 0.044, 0.66],
    [0.318, 0.054, 0.047, 0.054, 0.045, 0.74],
    [0.343, 0.06, 0.052, 0.062, 0.05, 0.82],
    [0.366, 0.062, 0.054, 0.064, 0.05, 0.88],
    [0.389, 0.06, 0.049, 0.056, 0.046, 0.93],
    [0.405, 0.056, 0.036, 0.04, 0.034, 0.97],
    [0.414, 0.052, 0.018, 0.02, 0.017, 0.99],
    [0.417, 0.05, 0.002, 0.002, 0.002, 1.0],
  ]
  const path = sp.map((r) => V(0, r[0], r[1]))
  const bodyW = (s: number): Wt => {
    if (s < 0.3) return w1(B.body)
    if (s < 0.5) return w2(B.body, B.chest, sstep(0.3, 0.5, s))
    if (s < 0.64) return w2(B.chest, B.neck, sstep(0.52, 0.64, s))
    if (s < 0.78) return w2(B.neck, B.head, sstep(0.66, 0.78, s))
    return w1(B.head)
  }
  acc.add(0, loft(path, sp.map((r) => r[2]), sp.map((r) => r[3]), sp.map((r) => r[4]), 18, {
    uv: (i, j) => uvScale(j / 18 * 3, 0.02 + sp[i][5] * 0.96),
    col: (i, j) => {
      const s = sp[i][5], a = (j / 18) * Math.PI * 2, front = Math.sin(a) // 前胸略亮、背部略深
      const base = s > 0.72 ? mix(C.cobalt, C.cobaltLite, 0.35) : C.cobalt
      return mix(base, front > 0 ? C.cobaltLite : C.deep, Math.abs(front) * 0.25)
    },
    w: (i) => bodyW(sp[i][5]),
  }))

  // ---- 上喙：巨大黑色钩喙（沿弧线放样，截面窄高）----
  const up: [number, number, number, number][] = [ // y, z, 宽, 高
    [0.36, 0.09, 0.03, 0.04], [0.366, 0.107, 0.027, 0.037], [0.367, 0.125, 0.023, 0.032], [0.36, 0.143, 0.018, 0.026],
    [0.346, 0.157, 0.013, 0.019], [0.328, 0.164, 0.009, 0.013], [0.309, 0.161, 0.006, 0.008], [0.295, 0.152, 0.003, 0.004], [0.289, 0.144, 0.001, 0.001],
  ]
  acc.add(1, loft(up.map((r) => V(0, r[0], r[1])), up.map((r) => r[2]), up.map((r) => r[3]), up.map((r) => r[3] * 0.8), 12, {
    uv: () => [0, 0], col: (i, j) => mix(C.beak, C.beakHi, (Math.cos((j / 12) * Math.PI * 2) ** 2) * 0.6 * (1 - i / 8)), w: () => w1(B.head),
  }))
  // ---- 下喙（随 jaw 开合）+ 基部黄色裸皮带 ----
  const lo: [number, number, number, number][] = [
    [0.332, 0.094, 0.029, 0.021], [0.326, 0.11, 0.027, 0.021], [0.321, 0.126, 0.021, 0.017], [0.321, 0.138, 0.013, 0.011], [0.324, 0.146, 0.006, 0.005], [0.327, 0.15, 0.001, 0.001],
  ]
  acc.add(1, loft(lo.map((r) => V(0, r[0], r[1])), lo.map((r) => r[2]), lo.map((r) => r[3]), lo.map((r) => r[3]), 10, {
    uv: () => [0, 0], col: (i) => mix(C.beak, C.tongue, i === 0 ? 0.3 : 0), w: () => w1(B.jaw),
  }))
  // 下喙基部黄色裸皮带：沿下喙根部一圈的弧形条带（两侧最显眼）
  {
    const band = [V(0, 0.335, 0.097), V(0, 0.333, 0.105), V(0, 0.331, 0.113)]
    acc.add(1, loft(band, [0.032, 0.0335, 0.031], [0.024, 0.025, 0.022], [0.025, 0.026, 0.024], 14, {
      uv: () => [0, 0], col: (i) => i === 1 ? C.yellow : C.yellowDeep, w: () => w1(B.jaw),
    }))
  }
  // ---- 眼：黄色裸皮眼圈（环）+ 光亮黑眼球 ----
  for (const sx of [1, -1]) {
    const c0 = V(sx * 0.047, 0.372, 0.083)
    const nrm = V(sx * 0.82, 0.1, 0.56).normalize() // 眼朝侧前
    const t1 = V(0, 1, 0).cross(nrm).normalize(), t2 = V(0, 0, 0).crossVectors(nrm, t1)
    const ring: V3[] = []
    for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2; ring.push(c0.clone().addScaledVector(t1, Math.cos(a) * 0.0115).addScaledVector(t2, Math.sin(a) * 0.0125)) }
    tube(ring, ring.map(() => 0.0046), 6, () => C.yellow, () => w1(B.head), 1, acc)
    // 眼球（第 3 组：光亮材质）
    const eye = new THREE.SphereGeometry(0.0085, 10, 8)
    eye.translate(c0.x - sx * 0.002, c0.y, c0.z - 0.001)
    const n = eye.attributes.position.count, col: number[] = [], si: number[] = [], sw: number[] = []
    for (let i = 0; i < n; i++) { col.push(...C.eye); si.push(B.head, 0, 0, 0); sw.push(1, 0, 0, 0) }
    acc.add(2, { pos: Array.from(eye.attributes.position.array as Float32Array), nor: Array.from(eye.attributes.normal.array as Float32Array), uv: Array.from(eye.attributes.uv.array as Float32Array), col, si, sw, idx: Array.from(eye.index!.array as Uint16Array) })
  }

  // ---- 足：短粗跗跖 + 对趾足（两趾向前、两趾向后，环抱栖杆）----
  const BAR = 0.036 // 栖杆半径（与 L274 栖木横杆一致）
  for (const sx of [1, -1]) {
    const fx = sx * 0.034
    tube([V(fx, 0.004, -0.003), V(fx * 0.95, 0.028, -0.01), V(fx * 0.88, 0.058, -0.018)], [0.012, 0.012, 0.013], 7,
      () => C.foot, (t) => w2(B.root, B.body, sstep(0.3, 1, t)), 1, acc)
    for (const [dx, dir, len] of [[0.011, 1, 1.0], [-0.009, 1, 0.9], [0.012, -1, 0.75], [-0.008, -1, 0.85]] as const) {
      const pts: V3[] = [], rad: number[] = []
      const n = 7
      for (let k = 0; k <= n; k++) {
        const t = k / n, th = t * 2.0 * len // 绕栖杆的弧角
        pts.push(V(fx + dx * sx, -BAR + Math.cos(th) * (BAR + 0.009), dir * Math.sin(th) * (BAR + 0.009) - 0.004))
        rad.push(k === n ? 0.0015 : 0.0075 * (1 - t * 0.45))
      }
      tube(pts, rad, 6, (t) => t > 0.82 ? C.claw : C.foot, () => w1(B.root), 1, acc)
    }
  }

  // ---- 折翼（贴在体侧的泪滴形羽面；初级飞羽尖端交叠在尾基之上）----
  for (const sx of [1, -1]) {
    const U: V3[] = [V(0.05, 0.296, 0.012), V(0.066, 0.25, -0.04), V(0.064, 0.17, -0.083), V(0.044, 0.08, -0.118), V(0.02, 0.0, -0.148), V(0.008, -0.04, -0.162)]
    const D: V3[] = [V(0.07, 0.262, 0.046), V(0.077, 0.2, 0.024), V(0.075, 0.13, -0.02), V(0.058, 0.06, -0.076), V(0.028, 0.0, -0.136), V(0.008, -0.04, -0.162)] // 下缘贴着体侧（不留能透出背景的缝）
    const rows = 10, cols = 5
    const at = (L: V3[], t: number) => { const f = t * (L.length - 1), i = Math.min(L.length - 2, Math.floor(f)); return L[i].clone().lerp(L[i + 1], f - i) }
    acc.add(0, grid(rows, cols, (i, j) => {
      const t = i / rows, u = j / cols
      const p = at(U, t).lerp(at(D, t), u)
      p.x += 0.014 * Math.sin(Math.PI * u) * (1 - t * 0.7) // 外鼓
      p.x *= sx
      return p
    }, {
      uv: (i, j) => i > rows * 0.45 ? uvFlight(j, 0.5, 1 - i / rows) : uvScale(j / cols * 0.6, i / rows * 0.5),
      col: (i, j) => { const t = i / rows; return t < 0.35 ? mix(C.cobalt, C.deep, t * 1.4) : mix(C.deep, C.deeper, (t - 0.35) * 1.3 + (j % 2) * 0.08) },
      w: (i) => i / rows < 0.6 ? w1(sx > 0 ? B.wfL : B.wfR) : w2(sx > 0 ? B.wfL : B.wfR, B.tail0, sstep(0.6, 1, i / rows) * 0.5),
      flip: sx < 0,
    }))
  }

  // ---- 展翼（绑定姿态即水平展开；平时骨骼缩放为 0 不可见）----
  for (const sx of [1, -1]) {
    const rows = 14, cols = 5
    const b1 = sx > 0 ? B.wL1 : B.wR1, b2 = sx > 0 ? B.wL2 : B.wR2
    acc.add(0, grid(rows, cols, (i, j) => {
      const u = i / rows, v = j / cols // u：翼根→翼尖；v：前缘→后缘
      const x = 0.07 + u * 0.58
      const lead = 0.022 - u * 0.03 - sstep(0.55, 1, u) * 0.05
      const chord = 0.2 - u * 0.04 - sstep(0.6, 1, u) * 0.11
      let z = lead - v * chord
      if (u > 0.5 && v > 0.8) z -= 0.03 * Math.abs(Math.sin(u * Math.PI * 9)) * (v - 0.8) * 5 // 初级飞羽指状分叉
      const y = 0.268 + u * 0.03 - Math.sin(Math.PI * v) * 0.012
      return V(sx * x, y, z)
    }, {
      uv: (i, j) => uvFlight(i, j / cols, i / rows),
      col: (i, j) => { const u = i / rows, v = j / cols; return v < 0.35 ? mix(C.cobalt, C.deep, u) : mix(C.deep, C.deeper, u * 0.8 + v * 0.2) },
      w: (i) => { const u = i / rows; return u < 0.38 ? w1(b1) : u > 0.5 ? w1(b2) : w2(b1, b2, sstep(0.38, 0.5, u)) },
      flip: sx < 0,
    }))
  }

  // ---- 尾羽：6 根渐尖长羽（中央一对最长 0.5m），层层叠压 ----
  {
    const base = REST[B.tail0]
    const X = V(1, 0, 0), dorsal = V(0, 0, 0).crossVectors(X, TAIL_DIR).normalize() // 背面（朝后上）
    const feathers: [number, number, number][] = [ // 横向偏移、长度、层
      [0.034, 0.36, 0], [-0.034, 0.36, 0], [0.022, 0.43, 1], [-0.022, 0.43, 1], [0.008, 0.5, 2], [-0.008, 0.5, 2],
    ]
    feathers.forEach(([ox, len, layer], k) => {
      const rows = 9, cols = 2
      const spread = ox * 1.6 // 尾端略呈扇形
      acc.add(0, grid(rows, cols, (i, j) => {
        const t = i / rows, u = j / cols - 0.5
        const w = (0.048 - layer * 0.003) * (t < 0.75 ? 1 - t * 0.25 : (1 - t) * 3.25) // 末端渐尖
        const c = base.clone().addScaledVector(TAIL_DIR, t * len).add(V(ox + spread * t, 0, 0)).addScaledVector(dorsal, layer * 0.0035 - t * t * 0.02)
        return c.addScaledVector(X, u * w).addScaledVector(dorsal, -Math.abs(u) * w * 0.25)
      }, {
        uv: (i, j) => uvFlight(k + 2, j / cols, 1 - i / rows),
        col: (i, j) => mix(mix(C.deep, C.deeper, i / rows), C.under, j === 1 ? 0 : 0.08),
        w: (i) => { const t = i / rows; return t < 0.25 ? w1(B.tail0) : w2(B.tail0, B.tail1, sstep(0.25, 0.7, t)) },
      }))
    })
    // 尾下覆羽（尾羽腹面的黑灰底，单独一片稍短的羽面，避免从下方看穿）
    acc.add(0, grid(6, 2, (i, j) => {
      const t = i / 6, u = j / 2 - 0.5
      const w = 0.085 * (1 - t * 0.55)
      return base.clone().addScaledVector(TAIL_DIR, t * 0.36).addScaledVector(dorsal, -0.006 - Math.abs(u) * 0.01).addScaledVector(X, u * w)
    }, { uv: (i, j) => uvFlight(1, j / 2, i / 6), col: () => C.under, w: (i) => i < 3 ? w1(B.tail0) : w2(B.tail0, B.tail1, (i - 2) / 4), flip: true }))
  }

  const geo = acc.build()
  geo.computeBoundingSphere()
  const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3
  return { geo, tris }
}

export function prepareJerryGeometry() { if (!CACHE) CACHE = buildGeometry(); return CACHE }
export function jerryGeometryReady() { return !!CACHE }

// ============================================================================
// 实例
// ============================================================================
export interface JerryRig {
  inner: THREE.Group; pose: THREE.Group; body: THREE.SkinnedMesh; bones: THREE.Bone[]; rest: V3[]
  featherMat: THREE.Material; bareMat: THREE.Material; eyeMat: THREE.Material
  tris: number
}

export function buildJerryMesh(): THREE.Group {
  const C0 = prepareJerryGeometry()
  const grp = new THREE.Group()
  grp.userData.entityType = 'jerry'
  grp.userData.parts = {} // 不交给通用四肢动画
  const inner = new THREE.Group(); inner.rotation.y = Math.PI / 2; grp.add(inner)
  const pose = new THREE.Group(); inner.add(pose)
  const bones: THREE.Bone[] = []
  REST.forEach((p, i) => {
    const b = new THREE.Bone(); b.name = Object.keys(JB)[i]; const par = PARENT[i]
    b.position.copy(p).sub(par < 0 ? V(0, 0, 0) : REST[par])
    ;(par < 0 ? pose : bones[par]).add(b); bones.push(b)
  })
  const tex = featherTexture()
  const featherMat = litMaterial({ color: '#ffffff', vertexColors: true, ...(tex ? { map: tex, bumpMap: tex, bumpScale: 0.6 } : {}), roughness: 0.62, envBase: 0.22, side: THREE.DoubleSide })
  const bareMat = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.38, envBase: 0.35 })
  const eyeMat = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.08, envBase: 0.9 })
  if ((eyeMat as THREE.MeshLambertMaterial).emissive) (eyeMat as THREE.MeshLambertMaterial).emissive.set('#050403')
  // The live game and archive preview can coexist and retire independently.
  const body = new THREE.SkinnedMesh(C0.geo.clone(), [featherMat, bareMat, eyeMat])
  body.frustumCulled = false // 展翼/扑击时会超出包围球
  pose.add(body)
  pose.updateMatrixWorld(true)
  body.bind(new THREE.Skeleton(bones))
  const rig: JerryRig = { inner, pose, body, bones, rest: bones.map((b) => b.position.clone()), featherMat, bareMat, eyeMat, tris: C0.tris }
  grp.userData.jerryRig = rig
  poseJerry(rig, null, 0)
  return grp
}

// ============================================================================
// 姿态
// ============================================================================
const E = new THREE.Euler()
const Q = new THREE.Quaternion()
function rot(b: THREE.Bone, x: number, y: number, z: number) { E.set(x, y, z, 'YXZ'); Q.setFromEuler(E); b.quaternion.multiply(Q) }

/** 按 AI 姿态量摆骨骼（time=秒） */
export function poseJerry(r: JerryRig, s: Partial<JerryPose> | null, time: number) {
  const bn = r.bones, B = JB
  for (let i = 0; i < bn.length; i++) { bn[i].position.copy(r.rest[i]); bn[i].quaternion.identity(); bn[i].scale.setScalar(1) }
  const gazeYaw = s?.gazeYaw ?? 0, gazePitch = s?.gazePitch ?? 0, tilt = s?.tilt ?? 0
  const talk = s?.talk ?? 0, preen = s?.preen ?? 0, shake = s?.shake ?? 0, spread = s?.spread ?? 0
  const flap = s?.flap ?? 0, glide = s?.glide ?? 0, pounce = s?.pounce ?? 0, crouch = s?.crouch ?? 0, scream = s?.scream ?? 0
  const preenSide = s?.preenSide ?? 1
  // 呼吸
  const br = Math.sin(time * 2.1) * 0.012
  bn[B.chest].scale.set(1 + br, 1 + br * 0.5, 1 + br)
  // 蹲伏（扑跳蓄力）：躯干下沉，跗跖随之压缩
  bn[B.body].position.y -= crouch * 0.028
  rot(bn[B.body], crouch * 0.25, 0, 0)
  // 滑翔/扑击：躯干前倾成水平，尾羽向后伸直
  const lean = Math.max(glide, pounce)
  rot(bn[B.body], lean * 1.05, 0, 0)
  rot(bn[B.tail0], lean * 0.08 + Math.sin(time * 1.3) * 0.03 * (1 - lean), 0, 0) // 前倾时躯干转动已把尾羽带成水平后伸
  rot(bn[B.tail1], -lean * 0.25, 0, Math.sin(time * 0.9) * 0.02)
  // 抖羽：全身快速左右甩动 + 羽毛蓬起
  if (shake > 0) {
    const sh = Math.sin(time * 42) * shake
    rot(bn[B.body], 0, sh * 0.06, sh * 0.16)
    bn[B.body].scale.setScalar(1 + shake * 0.07)
    rot(bn[B.tail0], 0, sh * 0.25, 0)
  }
  // 头颈：注视（偏航分给颈/头）、歪头（绕前向轴）、俯仰；扑击/前倾时抬头保持视线
  const yaw = Math.max(-1.9, Math.min(1.9, gazeYaw))
  rot(bn[B.neck], -gazePitch * 0.4 - lean * 0.5, yaw * 0.4, 0)
  rot(bn[B.head], -gazePitch * 0.6 - lean * 0.45, yaw * 0.6, tilt)
  // 梳理羽毛：头转向身侧折翼并低下，喙啄梳
  if (preen > 0) {
    rot(bn[B.neck], preen * 0.55, preenSide * preen * 1.15, 0)
    rot(bn[B.head], preen * 0.55, preenSide * preen * 1.25, preenSide * preen * 0.3)
    rot(bn[preenSide > 0 ? B.wfL : B.wfR], 0, 0, preenSide * preen * 0.12)
  }
  // 喙开合：说话（有节奏地开合）、尖啸（张大）、梳羽（细碎啄动）
  const jaw = talk * (0.12 + 0.18 * Math.abs(Math.sin(time * 13))) + scream * 0.42 + preen * 0.08 * Math.abs(Math.sin(time * 9))
  rot(bn[B.jaw], jaw, 0, 0)
  // 翅膀：折翼 ↔ 展翼切换（展开度 > 0.15 即切到展翼几何）
  const open = spread > 0.15
  for (const [bf, b1, b2, sx] of [[B.wfL, B.wL1, B.wL2, 1], [B.wfR, B.wR1, B.wR2, -1]] as const) {
    if (!open) {
      bn[b1].scale.setScalar(0.0001)
      rot(bn[bf], 0, 0, sx * (spread * 0.6 + shake * 0.1 * Math.sin(time * 40)))
      continue
    }
    bn[bf].scale.setScalar(0.0001)
    const k = sstep(0.15, 1, spread)
    // 未完全展开：翼向后收拢下垂；振翅：上下拍动，外段滞后
    const ph = time * 11
    const beat = Math.sin(ph) * flap
    const raise = Math.max(0, 1 - flap * 1.6 - glide * 2 - pounce * 2) * 0.95 // 停栖时伸展：双翼上扬成 V 字，正面也看得见翼面
    rot(bn[b1], -raise * 0.25, sx * ((1 - k) * 1.1 - raise * 0.35), sx * ((1 - k) * -0.9 + beat * 0.85 + pounce * 0.35 + glide * 0.05 + raise))
    rot(bn[b2], 0, sx * (1 - k) * 1.4, sx * (Math.sin(ph - 0.7) * flap * 0.5 - (1 - k) * 0.4))
  }
}

/** 站在人物左肩上的落脚点：肩关节（upperArmL）向锁骨（clavicleL）内收 35%，再抬到肩面之上 4.5cm */
export function jerryShoulderPoint(upperArm: THREE.Object3D, clavicle: THREE.Object3D | undefined, out: THREE.Vector3) {
  upperArm.getWorldPosition(out)
  if (clavicle) { const c = clavicle.getWorldPosition(new THREE.Vector3()); out.lerp(c, 0.35) }
  out.y += 0.045
  return out
}

export function animateJerry(grp: THREE.Group, e: Entity, time: number) {
  const r = grp.userData.jerryRig as JerryRig | undefined
  if (!r) return
  poseJerry(r, e.jy ?? null, time)
}

/** 验收用：网格数、可见绘制次数（材质组计入）、三角面、骨骼数 */
export function jerryBudget(grp: THREE.Group) {
  let meshes = 0, draws = 0, tris = 0, bones = 0
  grp.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    if (m.userData.cpuSkin) return
    meshes++
    const g = m.geometry as THREE.BufferGeometry
    draws += Array.isArray(m.material) ? Math.max(1, g.groups.length) : 1
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) bones += (m as THREE.SkinnedMesh).skeleton.bones.length
  })
  return { meshes, draws, tris, bones }
}

// ============================================================================
// 信众投石索的飞石（共享一个 InstancedMesh；最多 24 颗）
// ============================================================================
export function buildStonePool(): THREE.InstancedMesh {
  const g = new THREE.IcosahedronGeometry(0.045, 0)
  const m = new THREE.MeshLambertMaterial({ color: '#8d877c' })
  const im = new THREE.InstancedMesh(g, m, 24)
  im.count = 0
  im.frustumCulled = false
  im.userData.jerryStones = true
  return im
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1)
export function syncStonePool(im: THREE.InstancedMesh, stones: readonly { x: number; y: number; z: number; spin: number }[]) {
  const n = Math.min(24, stones.length)
  for (let i = 0; i < n; i++) {
    const s = stones[i]
    _q.setFromEuler(new THREE.Euler(s.spin, s.spin * 0.7, 0))
    _p.set(s.x, s.z, s.y)
    _m4.compose(_p, _q, _s)
    im.setMatrixAt(i, _m4)
  }
  im.count = n
  im.instanceMatrix.needsUpdate = true
}
