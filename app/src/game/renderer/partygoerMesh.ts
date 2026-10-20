// 派对客（Entity 67）重制模型——依据中文维基附图：
//  图2（Daniel Kebab 的首张素描）：头与躯干是一根连续的圆角高长柱（没有脖子），脸上两道竖切口作眼、一道上翘弧作嘴，
//  都是血红刻痕，脸颊有血迹；两条细长下垂的面条臂，末端是带牙的红色圆形吸盘口；下半身是两条宽裤管般的粗块腿，脚是斜切的块。
//  图1（Myra Oberlyn 画的狂战士形态）：胸甲像两扇门向两侧打开，露出青绿色人脸、恐惧蜈蚣（灰色多足）和粉色甲壳类肉；
//  一条灰白色蜈蚣臂向上伸、带长钩爪，另一条从身侧往下绕成尾巴，末端也是钩爪。
// 结构：一个 SkinnedMesh（两个材质组：金黄皮革 skin / 血肉 flesh）+ 血刻笑脸贴花 + （递蛋糕时）蛋糕 + （实习生）红气球与细线。
// 单只最多 6 次绘制、≤8,000 三角面；几何按形态只生成一次并缓存，实例只克隆几何、各自持有骨骼与材质。
// 皮革、笑脸贴图均为运行时 Canvas 程序化生成（全部派对客共享），无外部资源。模型按 +Z 正面建造，内层组旋转到 +X。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { litMaterial } from './shared'
import { canvasTex } from './houndMesh'
import type { Entity } from '../entities'
import { PARTYGOER_SKIN, partygoerLook, type PartygoerColor } from '../entities/partygoerLook'
import type { PartyState } from '../engine/partygoerAI'

type V3 = THREE.Vector3
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const lerpTab = (tab: [number, number][], y: number) => {
  if (y <= tab[0][0]) return tab[0][1]
  for (let i = 1; i < tab.length; i++) if (y <= tab[i][0]) { const [y0, v0] = tab[i - 1], [y1, v1] = tab[i]; const t = (y - y0) / (y1 - y0); return v0 + (v1 - v0) * (t * t * (3 - 2 * t)) }
  return tab[tab.length - 1][1]
}

// ============================================================================
// 程序化贴图（全部派对客共享）
// ============================================================================
let LEATHER: THREE.Texture | null | undefined
/** 光滑的皮革：浅色底（由材质 color 染成金黄/红/蓝/绿/白），长而软的褶皱、光泽斑与细毛孔 */
function leatherTexture() {
  if (LEATHER !== undefined) return LEATHER
  LEATHER = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#f1ebdd'; c.fillRect(0, 0, 256, 256)
    const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(ox, oy) }
    for (let i = 0; i < 90; i++) { // 大块明暗（皮革不均匀的鞣色）
      const x = R() * 256, y = R() * 256, r = 14 + R() * 40, a = 0.035 + R() * 0.05
      const col = R() < 0.5 ? `rgba(150,128,96,${a})` : `rgba(255,252,240,${a})`
      tile((ox, oy) => { c.fillStyle = col; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
    }
    for (let i = 0; i < 22; i++) { // 长而软的褶皱：暗沟 + 一侧高光
      let x = R() * 256, y = R() * 256, a = (R() < 0.7 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.6
      const pts: [number, number][] = [[x, y]]
      for (let k = 0; k < 12; k++) { a += (R() - 0.5) * 0.22; x += Math.cos(a) * 7; y += Math.sin(a) * 7; pts.push([x, y]) }
      const lw = 1.6 + R() * 2.2
      tile((ox, oy) => {
        c.lineCap = 'round'
        c.strokeStyle = 'rgba(110,86,54,0.13)'; c.lineWidth = lw; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke()
        c.strokeStyle = 'rgba(255,255,250,0.2)'; c.lineWidth = lw * 0.7; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox + 1.6, py + oy + 1.2) : c.moveTo(px + ox + 1.6, py + oy + 1.2)); c.stroke()
      })
    }
    for (let i = 0; i < 70; i++) { // 光泽斑
      const x = R() * 256, y = R() * 256, r = 2 + R() * 6, rot = R() * 3
      tile((ox, oy) => { c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(x + ox, y + oy, r, r * 0.45, rot, 0, Math.PI * 2); c.fill() })
    }
    const img = c.getImageData(0, 0, 256, 256), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n } // 细毛孔
    c.putImageData(img, 0, 0)
  }, true)
  if (LEATHER) { LEATHER.userData.entityShared = true; LEATHER.repeat.set(1, 1) }
  return LEATHER
}

let FACE: THREE.Texture | null | undefined
/** 血刻笑脸贴花（透明底）：两道竖切口作眼、一道上翘弧作嘴，刻痕里是凝血，下淌血滴；脸颊抹着血迹 */
function faceTexture() {
  if (FACE !== undefined) return FACE
  FACE = canvasTex(256, 256, (c, R) => {
    c.clearRect(0, 0, 256, 256)
    c.lineCap = 'round'; c.lineJoin = 'round'
    const smear = (x: number, y: number, rx: number, ry: number, a: number) => { // 脸颊上抹开的血
      for (let i = 0; i < 26; i++) {
        const px = x + (R() - 0.5) * rx * 1.6, py = y + (R() - 0.5) * ry * 1.6, r = 3 + R() * 9
        const g = c.createRadialGradient(px, py, 0, px, py, r)
        g.addColorStop(0, `rgba(150,20,18,${a * (0.5 + R() * 0.5)})`); g.addColorStop(1, 'rgba(150,20,18,0)')
        c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill()
      }
      for (let i = 0; i < 5; i++) { // 手指抹过的条痕
        const px = x + (R() - 0.5) * rx, py = y + (R() - 0.5) * ry * 0.6
        c.strokeStyle = `rgba(120,14,14,${a * 0.6})`; c.lineWidth = 2 + R() * 3
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + (R() - 0.5) * 10, py + 8 + R() * 14); c.stroke()
      }
    }
    smear(60, 168, 34, 26, 0.55); smear(194, 172, 30, 24, 0.5); smear(78, 200, 18, 14, 0.4)
    const groove = (path: () => void, w: number) => { // 刻痕：暗褐外缘 → 鲜红 → 凝血暗芯
      c.strokeStyle = 'rgba(70,22,10,0.85)'; c.lineWidth = w + 7; path(); c.stroke()
      c.strokeStyle = '#a3121a'; c.lineWidth = w + 2; path(); c.stroke()
      c.strokeStyle = '#3e0406'; c.lineWidth = w * 0.45; path(); c.stroke()
      c.strokeStyle = 'rgba(255,170,150,0.35)'; c.lineWidth = 1.4; c.save(); c.translate(-w * 0.35, -w * 0.25); path(); c.stroke(); c.restore()
    }
    const drip = (x: number, y: number, len: number) => {
      c.strokeStyle = '#8f0f14'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (R() - 0.5) * 3, y + len * 0.6, x + (R() - 0.5) * 2, y + len); c.stroke()
      c.fillStyle = '#7a0a0e'; c.beginPath(); c.arc(x, y + len, 2.4, 0, Math.PI * 2); c.fill()
    }
    // 竖切口眼睛（上端略宽、下端收尖）
    for (const x of [100, 156]) {
      groove(() => { c.beginPath(); c.moveTo(x - 1, 36); c.quadraticCurveTo(x + 3, 62, x, 92) }, 8)
      drip(x, 92, 10 + R() * 12)
    }
    // 上翘的弧形嘴
    groove(() => { c.beginPath(); c.moveTo(62, 128); c.bezierCurveTo(84, 176, 172, 178, 196, 124) }, 9)
    drip(84, 158, 14); drip(128, 166, 22); drip(176, 152, 12)
    c.strokeStyle = '#a3121a'; c.lineWidth = 6; // 嘴角上挑的短勾
    c.beginPath(); c.moveTo(62, 128); c.lineTo(56, 118); c.stroke()
    c.beginPath(); c.moveTo(196, 124); c.lineTo(202, 113); c.stroke()
  }, false)
  if (FACE) FACE.userData.entityShared = true
  return FACE
}

// ============================================================================
// 几何构建工具：按材质组收集带蒙皮权重的部件
// ============================================================================
type Wt = [number, number, number, number, number, number, number, number] // 4 个骨骼索引 + 4 个权重
const W1 = (b: number): Wt => [b, 0, 0, 0, 1, 0, 0, 0]
const W2 = (a: number, b: number, t: number): Wt => [a, b, 0, 0, 1 - t, t, 0, 0]
class Group {
  parts: THREE.BufferGeometry[] = []
  add(g: THREE.BufferGeometry) { this.parts.push(g.index ? g.toNonIndexed() : g) }
  merged() { return this.parts.length ? mergeGeometries(this.parts)! : new THREE.BufferGeometry() }
}
/** 网格部件：rows×cols 个点（行 i、列 j），keep 可剔除部分四边形；seam=列首尾重合（法线平均） */
function grid(rows: number, cols: number, P: (i: number, j: number) => V3, o: {
  uv: (i: number, j: number) => [number, number]; col: (i: number, j: number, p: V3) => [number, number, number]; w: (i: number, j: number, p: V3) => Wt
  keep?: (i: number, j: number) => boolean; seam?: boolean; flip?: boolean
}): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = []
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    const p = P(i, j); pos.push(p.x, p.y, p.z)
    const [u, v] = o.uv(i, j); uv.push(u, v)
    const c = o.col(i, j, p); col.push(c[0], c[1], c[2])
    const w = o.w(i, j, p); si.push(w[0], w[1], w[2], w[3]); sw.push(w[4], w[5], w[6], w[7])
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    if (o.keep && !o.keep(i, j)) continue
    const a = i * (cols + 1) + j, b = a + cols + 1
    if (o.flip) idx.push(a, a + 1, b, b, a + 1, b + 1)
    else idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  g.setIndex(idx); g.computeVertexNormals()
  if (o.seam) { // 首尾列法线平均，消除接缝
    const n = g.attributes.normal as THREE.BufferAttribute, t = V(0, 0, 0)
    for (let i = 0; i <= rows; i++) {
      const a = i * (cols + 1), b = a + cols
      t.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize()
      n.setXYZ(a, t.x, t.y, t.z); n.setXYZ(b, t.x, t.y, t.z)
    }
  }
  return g
}
/** 刚体小件（牙/爪/腿节/器官）：给现成几何补上顶点色、UV 与单骨骼权重 */
function rigid(g: THREE.BufferGeometry, color: string | ((p: V3) => THREE.Color), w: Wt): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g
  const n = ng.attributes.position.count, col: number[] = [], si: number[] = [], sw: number[] = [], p = V(0, 0, 0)
  const fixed = typeof color === 'string' ? new THREE.Color(color) : null
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(ng.attributes.position as THREE.BufferAttribute, i)
    const c = fixed ?? (color as (p: V3) => THREE.Color)(p)
    col.push(c.r, c.g, c.b); si.push(w[0], w[1], w[2], w[3]); sw.push(w[4], w[5], w[6], w[7])
  }
  ng.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  ng.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
  ng.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n * 2).fill(0), 2))
  if (!ng.attributes.normal) ng.computeVertexNormals()
  return ng
}
const rgb = (hex: string, k = 1): [number, number, number] => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k] }
const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
/** 沿曲线的正交标架（平行移动，避免扭转） */
function frames(curve: THREE.Curve<V3>, n: number) {
  const P: V3[] = [], T: V3[] = [], N: V3[] = [], B: V3[] = []
  for (let i = 0; i <= n; i++) { const t = i / n; P.push(curve.getPointAt(t)); T.push(curve.getTangentAt(t).normalize()) }
  let nn = Math.abs(T[0].y) < 0.9 ? V(0, 1, 0).cross(T[0]).normalize() : V(1, 0, 0).cross(T[0]).normalize()
  for (let i = 0; i <= n; i++) {
    if (i > 0) { const ax = V(0, 0, 0).crossVectors(T[i - 1], T[i]); const s = ax.length(); if (s > 1e-6) nn.applyAxisAngle(ax.normalize(), Math.asin(Math.min(1, s))) }
    nn = nn.sub(T[i].clone().multiplyScalar(nn.dot(T[i]))).normalize()
    N.push(nn.clone()); B.push(V(0, 0, 0).crossVectors(T[i], nn).normalize())
  }
  return { P, T, N, B }
}

// ============================================================================
// 形体尺寸（米）：总高约 2.2m
// ============================================================================
const COL_BOT = 0.93, DOME = 2.06, COL_TOP = 2.22
const HALF_W: [number, number][] = [[0.93, 0.19], [1.0, 0.215], [1.1, 0.245], [1.35, 0.255], [1.6, 0.272], [1.82, 0.282], [2.0, 0.278], [2.1, 0.27]]
const HALF_D: [number, number][] = [[0.93, 0.1], [1.0, 0.128], [1.1, 0.162], [1.2, 0.174], [1.6, 0.184], [1.9, 0.186], [2.1, 0.18]]
const SE = 3.2 // 截面超椭圆指数（圆角长方）
const COLS = 28 // 柱体周向分段
const DTH = (Math.PI * 2) / COLS
const DOOR_W = 3 * DTH // 胸甲半宽（弧度，正好落在网格线上）
const DOOR_Y0 = 1.1, DOOR_Y1 = 1.56, DOOR_GAP = 0.0025, CAVITY = 0.11
/** 柱体表面：θ=π/2 为正前（+Z），θ=-π/2 为背后（接缝放在背后） */
function colSurf(y: number, th: number): V3 {
  let a = lerpTab(HALF_W, y), b = lerpTab(HALF_D, y)
  if (y > DOME) { const k = Math.sqrt(Math.max(0, 1 - ((y - DOME) / (COL_TOP - DOME)) ** 2)); a *= k; b *= k }
  if (y < 0.99) { const k = Math.sqrt(Math.max(0, 1 - ((0.99 - y) / (0.99 - COL_BOT)) ** 2)); a *= k; b *= k }
  const c = Math.cos(th), s = Math.sin(th), e = 2 / SE
  return V(a * Math.sign(c) * Math.abs(c) ** e, y, b * Math.sign(s) * Math.abs(s) ** e)
}
function colNormal(y: number, th: number): V3 {
  const p = colSurf(y, th), py = colSurf(y + 0.004, th), pt = colSurf(y, th + 0.004)
  return V(0, 0, 0).crossVectors(py.sub(p), pt.sub(p)).normalize() // 外法线
}
/** 柱体行高：底部极点、主段（含胸甲上下沿与脸部下沿）、顶部穹顶 */
function columnRows(): number[] {
  const ys = [COL_BOT, 0.95, 0.97, 0.99]
  const keys = [DOOR_Y0, DOOR_Y1, 1.62, 1.8]
  for (let y = 1.03; y < DOME - 1e-6; y += 0.038) ys.push(y)
  for (const k of keys) ys.push(k)
  for (let k = 1; k <= 5; k++) ys.push(DOME + (COL_TOP - DOME) * Math.sin((k / 5) * Math.PI / 2))
  ys.sort((a, b) => a - b)
  // Always keep the pole. Dropping it as a close row leaves an open crown,
  // especially visible when the body falls forward or crawls face-down.
  return ys.filter((y, i) => i === 0 || y === COL_TOP || y - ys[i - 1] > 0.012)
}

// ============================================================================
// 骨骼索引
// ============================================================================
interface Bones {
  root: number; spine: number; chest: number; head: number
  thigh: [number, number]; shin: [number, number]; foot: [number, number]
  arm: [number[], number[]] // 面条臂 7 节（[0]=肩，[6]=吸盘口）
  door: [number, number]
  cent: [number[], number[]] // 恐惧蜈蚣臂：[0]=上伸钩爪臂，[1]=绕成尾巴
}
/** 面条臂的静止中心线（+X 为左臂；镜像得右臂） */
const ARM_PTS: [number, number, number][] = [[0.3, 1.8, 0.02], [0.41, 1.71, 0.03], [0.466, 1.53, 0.045], [0.478, 1.33, 0.055], [0.47, 1.13, 0.065], [0.452, 0.94, 0.075], [0.43, 0.77, 0.085]]
const CENT_UP: [number, number, number][] = [[0.07, 1.4, 0.08], [0.26, 1.52, 0.2], [0.44, 1.74, 0.2], [0.54, 1.98, 0.14], [0.52, 2.22, 0.09], [0.42, 2.38, 0.07]]
const CENT_TAIL: [number, number, number][] = [[-0.07, 1.24, 0.08], [-0.27, 1.17, 0.2], [-0.47, 1.0, 0.2], [-0.58, 0.74, 0.16], [-0.56, 0.48, 0.15], [-0.44, 0.3, 0.18], [-0.3, 0.27, 0.24]]

interface Cached { geo: THREE.BufferGeometry; face: THREE.BufferGeometry; cake: THREE.BufferGeometry; balloon: THREE.BufferGeometry; rest: V3[]; parent: number[]; B: Bones; tris: number }
let CACHE: Cached | null = null

/** 「丝绒蛋糕」几何（顶点色）：纸托 + 深红蛋糕胚 + 两层奶油夹心 + 奶油顶 + 一根蜡烛。直径约 0.2m，原点在底面中心 */
export function velvetCakeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const paint = (g: THREE.BufferGeometry, f: (p: V3) => THREE.Color) => {
    const n = g.index ? g.toNonIndexed() : g, c: number[] = [], p = V(0, 0, 0)
    for (let i = 0; i < n.attributes.position.count; i++) { p.fromBufferAttribute(n.attributes.position as THREE.BufferAttribute, i); const k = f(p); c.push(k.r, k.g, k.b) }
    n.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); n.deleteAttribute('uv'); return n
  }
  const red = new THREE.Color('#8e1424'), cream = new THREE.Color('#f3e7d6'), paper = new THREE.Color('#e9e2d4')
  parts.push(paint(new THREE.CylinderGeometry(0.118, 0.104, 0.03, 16, 1).translate(0, 0.015, 0), (p) => paper.clone().offsetHSL(0, 0, Math.sin(Math.atan2(p.z, p.x) * 16) * 0.04))) // 带褶纸托
  parts.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.105, 14, 4).translate(0, 0.0825, 0), (p) => { // 夹心蛋糕：红-白-红-白
    const y = p.y, band = (y > 0.062 && y < 0.074) || (y > 0.1 && y < 0.11)
    return (band ? cream : red).clone().offsetHSL(0, 0, (Math.sin(p.x * 160 + p.z * 90) * 0.02))
  }))
  parts.push(paint(new THREE.SphereGeometry(0.102, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.22, 1).translate(0, 0.134, 0), () => cream)) // 奶油顶
  for (let i = 0; i < 8; i++) { // 一圈奶油花
    const a = (i / 8) * Math.PI * 2
    parts.push(paint(new THREE.SphereGeometry(0.016, 5, 3).translate(Math.cos(a) * 0.082, 0.142, Math.sin(a) * 0.082), () => cream))
  }
  parts.push(paint(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6).translate(0.02, 0.19, -0.01), (p) => (Math.floor(p.y * 90) % 2 ? new THREE.Color('#d8323c') : new THREE.Color('#f6f1e6'))))
  parts.push(paint(new THREE.SphereGeometry(0.03, 7, 5).scale(0.5, 0.35, 0.5).translate(-0.03, 0.15, 0.03), () => new THREE.Color('#5a0a12'))) // 一滴深红「糖霜」
  return mergeGeometries(parts)!
}

function buildGeometry(): Cached {
  const rest: V3[] = [], parent: number[] = []
  const bone = (par: number, p: V3) => { rest.push(p.clone()); parent.push(par); return rest.length - 1 }
  const root = bone(-1, V(0, 1.0, 0)), spine = bone(root, V(0, 1.35, 0)), chest = bone(spine, V(0, 1.62, 0)), head = bone(chest, V(0, 1.95, 0))
  const thigh: [number, number] = [0, 0], shin: [number, number] = [0, 0], foot: [number, number] = [0, 0]
  for (const [i, s] of [[0, 1], [1, -1]] as const) {
    thigh[i] = bone(root, V(s * 0.135, 1.02, 0)); shin[i] = bone(thigh[i], V(s * 0.14, 0.56, 0.01)); foot[i] = bone(shin[i], V(s * 0.145, 0.1, 0.015))
  }
  const arm: [number[], number[]] = [[], []]
  for (const [i, s] of [[0, 1], [1, -1]] as const) {
    let par = chest
    for (const q of ARM_PTS) { const b = bone(par, V(q[0] * s, q[1], q[2])); arm[i].push(b); par = b }
  }
  const hingeL = colSurf(1.33, Math.PI / 2 - DOOR_W), hingeR = colSurf(1.33, Math.PI / 2 + DOOR_W)
  const door: [number, number] = [bone(spine, hingeL), bone(spine, hingeR)]
  const cent: [number[], number[]] = [[], []]
  for (const [i, pts] of [[0, CENT_UP], [1, CENT_TAIL]] as const) {
    let par = spine
    for (const q of pts) { const b = bone(par, V(q[0], q[1], q[2])); cent[i].push(b); par = b }
  }
  const B: Bones = { root, spine, chest, head, thigh, shin, foot, arm, door, cent }

  const skin = new Group(), flesh = new Group()
  const skinC = (k: number): [number, number, number] => [k, k, k] // skin 组顶点色 = 明度/AO（色相由材质 color 给）
  // ---------- 柱体：头与躯干一体，没有脖子 ----------
  const ys = columnRows()
  const colW = (y: number): Wt => {
    if (y >= 1.8) return W1(head)
    if (y >= 1.62) return W2(chest, head, sstep(1.62, 1.8, y))
    if (y >= 1.35) return W2(spine, chest, (y - 1.35) / 0.27)
    if (y >= 1.0) return W2(root, spine, (y - 1.0) / 0.35)
    return W1(root)
  }
  const inDoorJ = (j: number) => j > COLS / 2 - 3 && j < COLS / 2 + 3 // 柱体列 j：θ = -π/2 + j·Δ，正前方 j=COLS/2
  const inDoorY = (y: number) => y > DOOR_Y0 + 1e-6 && y < DOOR_Y1 - 1e-6
  const inset = (i: number, j: number) => inDoorJ(j) && inDoorY(ys[i])
  const colP = (i: number, j: number) => {
    const th = -Math.PI / 2 + j * DTH, p = colSurf(ys[i], th)
    if (inset(i, j)) { p.z -= CAVITY; p.x *= 0.86 }
    return p
  }
  const colAO = (y: number, th: number) => {
    const front = Math.max(0, Math.sin(th))
    let k = 0.92 + 0.08 * front
    k *= 1 - 0.28 * sstep(1.1, 0.93, y) // 胯下压暗
    k *= 1 - 0.12 * Math.max(0, Math.abs(Math.cos(th)) - 0.6) * sstep(1.55, 1.75, y) * sstep(1.95, 1.8, y) // 腋下
    return k
  }
  const quadInset = (i: number, j: number) => inset(i, j) || inset(i + 1, j) || inset(i, j + 1) || inset(i + 1, j + 1)
  skin.add(grid(ys.length - 1, COLS, colP, {
    uv: (i, j) => [(j / COLS) * 3, ys[i] * 1.6], col: (i, j) => skinC(colAO(ys[i], -Math.PI / 2 + j * DTH)), w: (i) => colW(ys[i]),
    keep: (i, j) => !quadInset(i, j), seam: true,
  }))
  // 胸腔凹槽：血肉组（暗红肉壁，越深越暗）
  flesh.add(grid(ys.length - 1, COLS, colP, {
    uv: (i, j) => [(j / COLS) * 3, ys[i] * 1.6],
    col: (i, j) => inset(i, j) ? mix3(rgb('#6a1a1e'), rgb('#2a0709'), 0.4 + 0.3 * Math.sin(ys[i] * 40 + j)) : rgb('#7e2a26'),
    w: (i) => colW(ys[i]), keep: (i, j) => quadInset(i, j),
  }))

  // ---------- 腿：两条宽裤管般的粗块腿，脚是斜切的块 ----------
  for (const [i, s] of [[0, 1], [1, -1]] as const) {
    const LY0 = 1.16, LY1 = 0.06, ROWS = 13, LC = 16
    const ly = (r: number) => LY0 + (LY1 - LY0) * (r / ROWS)
    skin.add(grid(ROWS, LC, (r, j) => {
      const y = ly(r), th = (j / LC) * Math.PI * 2 - Math.PI / 2
      const t = (LY0 - y) / (LY0 - LY1)
      const a = 0.114 + 0.02 * t * t, b = 0.152 + 0.006 * t
      const c = Math.cos(th), sn = Math.sin(th), e = 2 / 3.4
      return V(s * (0.135 + 0.008 * t) + a * Math.sign(c) * Math.abs(c) ** e, y, 0.012 * t + b * Math.sign(sn) * Math.abs(sn) ** e)
    }, {
      uv: (r, j) => [(j / LC) * 1.5, ly(r) * 1.6],
      col: (r, j) => { const th = (j / LC) * Math.PI * 2 - Math.PI / 2, inner = Math.max(0, -s * Math.cos(th)); return skinC((0.95 - 0.16 * inner * sstep(0.6, 1.0, ly(r))) * (1 - 0.1 * sstep(0.25, 0.06, ly(r)))) },
      w: (r) => { const y = ly(r); return y >= 0.72 ? W1(thigh[i]) : y >= 0.42 ? W2(thigh[i], shin[i], sstep(0.72, 0.42, y)) : W1(shin[i]) },
      seam: true, flip: true, // 行自上而下，翻转绕序使法线朝外
    }))
    // 斜切的块状脚：前上棱削低成斜面
    const fb = new THREE.BoxGeometry(0.27, 0.14, 0.44, 2, 1, 3)
    const fp = fb.attributes.position as THREE.BufferAttribute
    for (let k = 0; k < fp.count; k++) {
      const x = fp.getX(k), y = fp.getY(k), z = fp.getZ(k)
      const ny = y > 0 ? 0.07 - 0.13 * clamp01((z + 0.05) / 0.27) : -0.07
      fp.setXYZ(k, s * 0.142 + x, ny + 0.07, z + 0.07)
    }
    fb.computeVertexNormals()
    const fg = rigid(fb, () => new THREE.Color(0.86, 0.86, 0.86), W1(foot[i]))
    const uvs: number[] = []; const pp = fg.attributes.position as THREE.BufferAttribute
    for (let k = 0; k < pp.count; k++) uvs.push(pp.getX(k) * 2 + pp.getY(k), pp.getZ(k) * 2)
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    skin.add(fg)
  }

  // ---------- 面条臂：多节骨骼蒙皮，末端七鳃鳗式吸盘口 ----------
  for (const [ai, s] of [[0, 1], [1, -1]] as const) {
    const pts = ARM_PTS.map((q) => V(q[0] * s, q[1], q[2]))
    const curve = new THREE.CatmullRomCurve3([V(0.18 * s, 1.83, 0.01), ...pts], false, 'centripetal')
    const ROWS = 22, RAD = 10
    const F = frames(curve, ROWS)
    const len = curve.getLength()
    const radius = (t: number) => (0.058 - 0.022 * t + 0.008 * Math.sin(t * 9)) * (t < 0.06 ? 1.1 : 1)
    const armW = (t: number): Wt => { // 弧长参数 → 相邻两节骨骼
      const u = Math.max(0, t * len - 0.12) / (len - 0.12) * 6
      const k = Math.min(5, Math.floor(u)), f = u - k
      return W2(B.arm[ai][k], B.arm[ai][k + 1], f)
    }
    skin.add(grid(ROWS, RAD, (i, j) => {
      const a = (j / RAD) * Math.PI * 2, r = radius(i / ROWS)
      return F.P[i].clone().addScaledVector(F.N[i], Math.cos(a) * r).addScaledVector(F.B[i], Math.sin(a) * r)
    }, { uv: (i, j) => [j / RAD, (i / ROWS) * len * 2.2], col: (_i, j) => skinC(0.9 + 0.08 * Math.cos((j / RAD) * Math.PI * 2)), w: (i) => armW(i / ROWS), seam: true, flip: true }))
    // 吸盘口：外沿外翻成喇叭口（皮肤），唇内是一圈红肉与钩牙，正中是暗色咽喉
    const T = F.T[ROWS], N = F.N[ROWS], Bn = F.B[ROWS], O = F.P[ROWS]
    const mouthB = W1(B.arm[ai][6])
    const lathe = (prof: [number, number][], colf: (k: number) => [number, number, number], into: Group, flip = true) => {
      const RC = 14
      into.add(grid(prof.length - 1, RC, (i, j) => {
        const a = (j / RC) * Math.PI * 2, [ax, r] = prof[i]
        return O.clone().addScaledVector(T, ax).addScaledVector(N, Math.cos(a) * r).addScaledVector(Bn, Math.sin(a) * r)
      }, { uv: (i, j) => [j / RC, i / prof.length], col: (i) => colf(i), w: () => mouthB, seam: true, flip }))
    }
    lathe([[-0.005, 0.036], [0.025, 0.056], [0.055, 0.088], [0.08, 0.112]], (k) => skinC(0.92 - k * 0.05), skin)
    lathe([[0.08, 0.112], [0.095, 0.11], [0.1, 0.092], [0.09, 0.074], [0.076, 0.052], [0.062, 0.028], [0.046, 0.0]],
      (k) => k < 2 ? rgb('#b51d24') : k < 4 ? rgb('#8e1219') : rgb('#2a0406'), flesh)
    // 内圈钩牙：两圈，向咽喉弯
    const tooth = new THREE.ConeGeometry(0.009, 0.032, 4)
    for (const [ring, n, rr, ax] of [[0, 12, 0.084, 0.092], [1, 8, 0.058, 0.078]] as const) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.3
        const radial = V(0, 0, 0).addScaledVector(N, Math.cos(a)).addScaledVector(Bn, Math.sin(a))
        const base = O.clone().addScaledVector(T, ax).addScaledVector(radial, rr)
        const dir = radial.clone().multiplyScalar(-1).addScaledVector(T, -0.55).normalize() // 指向轴心并向里钩
        const m = new THREE.Matrix4().makeBasis(V(0, 0, 0).crossVectors(dir, T).normalize(), dir, V(0, 0, 0).crossVectors(V(0, 0, 0).crossVectors(dir, T).normalize(), dir))
        m.setPosition(base.clone().addScaledVector(dir, 0.012))
        flesh.add(rigid(tooth.clone().applyMatrix4(m), (p) => new THREE.Color('#efe6cf').lerp(new THREE.Color('#9a2a22'), clamp01(1 - p.distanceTo(base) / 0.018)), mouthB))
      }
    }
  }

  // ---------- 胸甲：两扇门，平时只看得到中间一道细缝 ----------
  for (const [di, side] of [[0, 1], [1, -1]] as const) {
    const th0 = Math.PI / 2 - side * DOOR_W, th1 = Math.PI / 2 - side * DOOR_GAP
    const R = 10, C = 6
    const yAt = (i: number) => DOOR_Y0 + (DOOR_Y1 - DOOR_Y0) * (i / R)
    const thAt = (j: number) => th0 + (th1 - th0) * (j / C)
    const outer = (i: number, j: number) => colSurf(yAt(i), thAt(j)).addScaledVector(colNormal(yAt(i), thAt(j)), 0.0025)
    const inner = (i: number, j: number) => colSurf(yAt(i), thAt(j)).addScaledVector(colNormal(yAt(i), thAt(j)), -0.022)
    const dw = W1(B.door[di])
    const flip = side < 0
    skin.add(grid(R, C, outer, { uv: (i, j) => [thAt(j) * 0.48, yAt(i) * 1.6], col: (i, j) => skinC(colAO(yAt(i), thAt(j)) * (j === C ? 0.8 : 1)), w: () => dw, flip }))
    // 门的内侧：发黄的肉，带一道道血红的短刻痕（图1 左门）
    flesh.add(grid(R, C, inner, {
      uv: (i, j) => [j / C, i / R], w: () => dw, flip: !flip,
      col: (i, j) => { const mark = Math.sin(i * 2.7 + j * 1.3) > 0.55 && j > 0 && j < C; return mark ? rgb('#a3141c') : (j === C || i === 0 || i === R ? rgb('#b12a26') : rgb('#d8b072', 0.95 - 0.08 * Math.sin(i + j * 2))) },
    }))
    // 门边：四周封边（外皮颜色）
    const edge = (pts: (k: number) => [V3, V3], n: number, fl: boolean) => skin.add(grid(1, n, (i, k) => pts(k)[i], { uv: (i, k) => [k / n, i * 0.05], col: () => skinC(0.55), w: () => dw, flip: fl }))
    edge((k) => [outer(0, k), inner(0, k)], C, !flip)
    edge((k) => [outer(R, k), inner(R, k)], C, flip)
    edge((k) => [outer(k, C), inner(k, C)], R, !flip)
    edge((k) => [outer(k, 0), inner(k, 0)], R, flip)
  }

  // ---------- 胸腔里的东西：青绿色人脸、恐惧蜈蚣、粉色甲壳类肉 ----------
  {
    const sw = W1(B.spine)
    const fc = V(0.0, 1.45, 0.085)
    const face = new THREE.SphereGeometry(1, 12, 9).scale(0.072, 0.085, 0.05).translate(fc.x, fc.y, fc.z)
    flesh.add(rigid(face, (p) => {
      const dx = p.x - fc.x, dy = p.y - fc.y, front = p.z - fc.z
      const teal = new THREE.Color('#4fa592'), dark = new THREE.Color('#132620')
      if (front > 0.02) {
        if (Math.hypot(Math.abs(dx) - 0.028, dy - 0.022) < 0.014) return dark // 眼窝
        if (Math.abs(dy + 0.03) < 0.006 && Math.abs(dx) < 0.03 + Math.abs(dy + 0.03)) return new THREE.Color('#1f1612') // 下撇的嘴
        if (Math.abs(dy - 0.045) < 0.005 && Math.abs(dx) < 0.045) return new THREE.Color('#2b4a40') // 眉
      }
      return teal.clone().offsetHSL(0, 0, -0.08 * (1 - front / 0.05))
    }, sw))
    // 恐惧蜈蚣：灰色分节，斜穿胸腔，两侧一排细足
    const cc = new THREE.CatmullRomCurve3([V(0.14, 1.53, 0.1), V(0.1, 1.38, 0.115), V(0.04, 1.25, 0.11), V(-0.03, 1.13, 0.1)])
    const F = frames(cc, 10)
    flesh.add(grid(10, 7, (i, j) => {
      const a = (j / 7) * Math.PI * 2, r = 0.03 * (1 + 0.15 * Math.max(0, Math.sin(i * Math.PI))) * (i === 0 || i === 10 ? 0.6 : 1)
      return F.P[i].clone().addScaledVector(F.N[i], Math.cos(a) * r).addScaledVector(F.B[i], Math.sin(a) * r)
    }, { uv: (i, j) => [j / 7, i / 10], col: (i) => rgb(i % 2 ? '#8e9094' : '#5d6064'), w: () => sw, seam: true }))
    const leg = new THREE.ConeGeometry(0.004, 0.036, 3)
    for (let i = 1; i < 10; i++) for (const sd of [1, -1]) {
      const dir = F.B[i].clone().multiplyScalar(sd).addScaledVector(F.T[i], -0.4).normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir)
      const m = new THREE.Matrix4().compose(F.P[i].clone().addScaledVector(dir, 0.04), q, V(1, 1, 1))
      flesh.add(rigid(leg.clone().applyMatrix4(m), '#6f7276', sw))
    }
    // 粉色甲壳类肉：几团带红斑的鼓包
    const blobs: [number, number, number, number][] = [[-0.11, 1.22, 0.09, 0.05], [-0.08, 1.33, 0.1, 0.04], [-0.13, 1.42, 0.085, 0.038], [-0.03, 1.19, 0.095, 0.034], [0.1, 1.18, 0.085, 0.036]]
    for (const [x, y, z, r] of blobs) {
      const g = new THREE.SphereGeometry(r, 7, 5).scale(1, 0.85, 0.8).translate(x, y, z)
      flesh.add(rigid(g, (p) => (Math.sin(p.x * 140 + p.y * 90) > 0.7 ? new THREE.Color('#b8384a') : new THREE.Color('#e49aac').offsetHSL(0, 0, (p.z - z) * 2)), sw))
    }
  }

  // ---------- 恐惧蜈蚣爪臂：一条上伸带长钩爪，一条往下绕成尾巴（狂战士形态才弹出） ----------
  for (const [ci, ptsRaw] of [[0, CENT_UP], [1, CENT_TAIL]] as const) {
    const pts = ptsRaw.map((q) => V(q[0], q[1], q[2]))
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    const ROWS = 18, RAD = 7, nb = pts.length
    const F = frames(curve, ROWS)
    const segs = ci === 0 ? 9 : 11
    const cw = (t: number): Wt => { const u = t * (nb - 1), k = Math.min(nb - 2, Math.floor(u)); return W2(B.cent[ci][k], B.cent[ci][k + 1], u - k) }
    flesh.add(grid(ROWS, RAD, (i, j) => {
      const t = i / ROWS, a = (j / RAD) * Math.PI * 2
      const r = (0.04 - 0.012 * t) * (1 + 0.14 * Math.max(0, Math.sin(t * segs * Math.PI * 2))) * (i === 0 ? 0.7 : 1)
      return F.P[i].clone().addScaledVector(F.N[i], Math.cos(a) * r).addScaledVector(F.B[i], Math.sin(a) * r * 0.85)
    }, {
      uv: (i, j) => [j / RAD, i / ROWS], w: (i) => cw(i / ROWS), seam: true,
      col: (i) => { const t = i / ROWS, band = Math.sin(t * segs * Math.PI * 2); return mix3(rgb('#c9c8c2'), rgb('#7b7a78'), band > 0.4 ? 0.65 : 0.1) },
    }))
    // 每节两侧的步足
    const leg = new THREE.ConeGeometry(0.0055, 0.05, 3)
    for (let k = 1; k < ROWS - 1; k += 2) {
      const t = k / ROWS
      for (const sd of [1, -1]) {
        const dir = F.N[k].clone().multiplyScalar(sd).addScaledVector(F.T[k], -0.5).normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir)
        const m = new THREE.Matrix4().compose(F.P[k].clone().addScaledVector(dir, 0.055 - 0.01 * t), q, V(1, 1, 1))
        flesh.add(rigid(leg.clone().applyMatrix4(m), '#8a8884', cw(t)))
      }
    }
    // 末端三根长钩爪（灰白 → 品红 → 暗红尖）
    const tipW = W1(B.cent[ci][nb - 1]), O = F.P[ROWS], T = F.T[ROWS], N = F.N[ROWS], Bn = F.B[ROWS]
    for (let k = 0; k < 3; k++) {
      const spread = (k - 1) * 0.55
      const side = N.clone().multiplyScalar(Math.cos(spread)).addScaledVector(Bn, Math.sin(spread))
      const cp = [0, 1, 2, 3, 4].map((q) => { const u = q / 4, hook = Math.sin(u * Math.PI * 0.95); return O.clone().addScaledVector(T, 0.02 + u * 0.15).addScaledVector(side, 0.02 + hook * 0.07 - u * u * 0.05) })
      const ccv = new THREE.CatmullRomCurve3(cp)
      const FF = frames(ccv, 6)
      flesh.add(grid(6, 4, (i, j) => {
        const a = (j / 4) * Math.PI * 2, r = 0.013 * (1 - i / 6.3)
        return FF.P[i].clone().addScaledVector(FF.N[i], Math.cos(a) * r).addScaledVector(FF.B[i], Math.sin(a) * r)
      }, { uv: (i, j) => [j / 4, i / 6], col: (i) => i < 2 ? rgb('#d9d4cc') : i < 5 ? rgb('#b8226a') : rgb('#4a0c1e'), w: () => tipW, seam: true }))
    }
  }

  // ---------- 合并成两个材质组 ----------
  const gs = skin.merged(), gf = flesh.merged()
  const geo = mergeGeometries([gs, gf], true)!
  // ---------- 血刻笑脸贴花：贴在头部正面（绑头骨） ----------
  const hr = rest[head]
  const fy0 = 1.78, fy1 = 2.15, fth = 0.98
  const faceG = new THREE.BufferGeometry()
  {
    const R = 10, C = 12, pos: number[] = [], uv: number[] = [], idx: number[] = []
    for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
      const y = fy0 + (fy1 - fy0) * (i / R), th = Math.PI / 2 + fth * (j / C - 0.5) * 2
      const p = colSurf(y, th).addScaledVector(colNormal(y, th), 0.0035).sub(hr)
      pos.push(p.x, p.y, p.z); uv.push(1 - j / C, i / R)
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const a = i * (C + 1) + j, b = a + C + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
    faceG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); faceG.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); faceG.setIndex(idx); faceG.computeVertexNormals()
  }
  // ---------- 红气球（顶点色）：原点在气球底部的结 ----------
  const balloonG = (() => {
    const s = new THREE.SphereGeometry(0.16, 11, 8).scale(1, 1.18, 1).translate(0, 0.2, 0)
    const knot = new THREE.ConeGeometry(0.018, 0.035, 6).rotateX(Math.PI).translate(0, 0.012, 0)
    const parts = [s, knot].map((g) => { const n = g.toNonIndexed(); const c: number[] = []; const p = V(0, 0, 0); for (let i = 0; i < n.attributes.position.count; i++) { p.fromBufferAttribute(n.attributes.position as THREE.BufferAttribute, i); const k = new THREE.Color('#d8141e').offsetHSL(0, 0, 0.12 * clamp01((p.y - 0.25) / 0.15) - 0.1 * clamp01((0.12 - p.y) / 0.1)); c.push(k.r, k.g, k.b) } n.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); n.deleteAttribute('uv'); return n })
    return mergeGeometries(parts)!
  })()
  const cake = velvetCakeGeometry()
  const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3 + (faceG.index!.count / 3)
  return { geo, face: faceG, cake, balloon: balloonG, rest, parent, B, tris }
}

// ============================================================================
// 实例
// ============================================================================
export interface PartygoerRig {
  inner: THREE.Group; pose: THREE.Group; body: THREE.SkinnedMesh; bones: THREE.Bone[]; rest: V3[]; B: Bones
  face: THREE.Mesh; cake: THREE.Mesh; balloon: THREE.Mesh | null; string: THREE.Line | null
  skinMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial; fleshMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial
  faceMat: THREE.Material; baseColor: THREE.Color; color: PartygoerColor; intern: boolean; balloonArm: 0 | 1
  bal: { p: V3; v: V3; init: boolean }
  tris: number
  /** 仅 ?cpu=1：CPU 蒙皮替身（静态 Mesh，每帧写回顶点）；GPU 蒙皮体保持隐藏 */
  cpuMesh: THREE.Mesh | null
}

// ============================================================================
// ?cpu=1：CPU 蒙皮（仅 QA 用的显式开关，默认关闭）
// 无头 Chromium 的 SwiftShader（ANGLE/Vulkan）一画 GPU 蒙皮网格 GPU 进程就以 exit_code=4 崩溃——
// 4 骨 MeshBasicMaterial 方盒也一样，与本模型无关。随后上下文丢失/恢复期间所有程序报 1282。
// 打开后：SkinnedMesh 只当骨架用（不可见，不编译蒙皮程序），同一套权重与骨骼矩阵在 CPU 上算出静态网格。
// 真实 GPU 不需要也不应开启（每帧每只约 4 万次骨骼变换）。
// ============================================================================
export const PARTYGOER_CPU_SKIN = typeof location !== 'undefined' && new URLSearchParams(location.search).get('cpu') === '1'
const _cv = new THREE.Vector3(), _ca = new THREE.Vector3(), _cn = new THREE.Vector3()
function bakeCpuSkin(r: PartygoerRig, root: THREE.Object3D) {
  const m = r.cpuMesh
  if (!m) return
  root.updateMatrixWorld(true)
  const sk = r.body
  sk.skeleton.update()
  const src = sk.geometry, sp = src.attributes.position as THREE.BufferAttribute, sn = src.attributes.normal as THREE.BufferAttribute
  const dp = m.geometry.attributes.position as THREE.BufferAttribute, dn = m.geometry.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < sp.count; i++) {
    _cv.fromBufferAttribute(sp, i); _cn.fromBufferAttribute(sn, i)
    _ca.copy(_cv).addScaledVector(_cn, 0.01)
    sk.applyBoneTransform(i, _cv); sk.applyBoneTransform(i, _ca)
    dp.setXYZ(i, _cv.x, _cv.y, _cv.z)
    _ca.sub(_cv).normalize(); dn.setXYZ(i, _ca.x, _ca.y, _ca.z)
  }
  dp.needsUpdate = true; dn.needsUpdate = true
  m.geometry.computeBoundingSphere()
}

/** 预热/验收：生成并缓存形态几何（首次约数十毫秒） */
export function preparePartygoerGeometry() { if (!CACHE) CACHE = buildGeometry(); return CACHE }
export function partygoerGeometryReady() { return !!CACHE }
/** 渲染器 CPU 预热队列用的生成器版本（一步生成） */
export function* preparePartygoerJob(): Generator<void, void> { if (!CACHE) { yield; CACHE = buildGeometry() } }

export function buildPartygoerMesh(seed = 0, overrides?: Partial<import('../entities/partygoerLook').PartygoerLook>): THREE.Group {
  const C = preparePartygoerGeometry()
  const base = partygoerLook(seed)
  const look = { color: overrides?.color ?? base.color, intern: overrides?.intern ?? base.intern, balloonArm: overrides?.balloonArm ?? base.balloonArm }
  const grp = new THREE.Group()
  grp.userData.entityType = 'partygoer'
  grp.userData.parts = {}
  grp.userData.facesZ = 1
  const inner = new THREE.Group(); inner.rotation.y = Math.PI / 2; grp.add(inner)
  const pose = new THREE.Group(); inner.add(pose)
  const bones: THREE.Bone[] = []
  C.rest.forEach((p, i) => {
    const b = new THREE.Bone(); const par = C.parent[i]
    b.position.copy(p).sub(par < 0 ? V(0, 0, 0) : C.rest[par])
    ;(par < 0 ? pose : bones[par]).add(b); bones.push(b)
  })
  const baseColor = new THREE.Color(PARTYGOER_SKIN[look.color])
  const lt = leatherTexture()
  const skinMat = litMaterial({ color: baseColor.clone(), vertexColors: true, ...(lt ? { map: lt, bumpMap: lt, bumpScale: 1.4 } : {}), roughness: 0.34, envBase: 0.38 })
  const fleshMat = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.42, envBase: 0.3, side: THREE.DoubleSide }) // 胸腔/门内侧/牙/蜈蚣：双面
  const body = new THREE.SkinnedMesh(C.geo.clone(), [skinMat, fleshMat])
  body.frustumCulled = false // 面条臂与蜈蚣臂可甩出包围球
  pose.add(body)
  pose.updateMatrixWorld(true)
  body.bind(new THREE.Skeleton(bones))
  let cpuMesh: THREE.Mesh | null = null
  if (PARTYGOER_CPU_SKIN) {
    const g = body.geometry.clone(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight')
    cpuMesh = new THREE.Mesh(g, [skinMat, fleshMat]); cpuMesh.frustumCulled = false; cpuMesh.userData.cpuSkin = true
    pose.add(cpuMesh); body.visible = false
  }
  // 笑脸贴花
  const faceTex = faceTexture()
  const faceMat = litMaterial({ ...(faceTex ? { map: faceTex } : {}), color: faceTex ? '#ffffff' : '#8a1018', transparent: true, alphaTest: 0.04, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.28 })
  const face = new THREE.Mesh(C.face.clone(), faceMat)
  face.userData.face = 1
  face.renderOrder = 2
  bones[C.B.head].add(face)
  // 递过来的蛋糕（只在假装友善时显示）
  const cake = new THREE.Mesh(C.cake.clone(), litMaterial({ vertexColors: true, roughness: 0.5 }))
  cake.position.set(0, 1.08 - 1.35, 0.44); cake.visible = false
  bones[C.B.spine].add(cake)
  // 实习生的红气球 + 细线
  let balloon: THREE.Mesh | null = null, string: THREE.Line | null = null
  if (look.intern) {
    balloon = new THREE.Mesh(C.balloon.clone(), litMaterial({ vertexColors: true, roughness: 0.18, envBase: 0.5 }))
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(new Array(9 * 3).fill(0), 3))
    string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: '#e8e2d8' }))
    string.frustumCulled = false; balloon.frustumCulled = false
    inner.add(balloon, string)
  }
  const rig: PartygoerRig = {
    inner, pose, body, bones, rest: bones.map((b) => b.position.clone()), B: C.B, face, cake, balloon, string,
    skinMat, fleshMat, faceMat, baseColor, color: look.color, intern: look.intern, balloonArm: look.balloonArm,
    bal: { p: V(0, 0, 0), v: V(0, 0, 0), init: false }, tris: C.tris + (look.intern ? C.balloon.attributes.position.count / 3 : 0),
    cpuMesh,
  }
  grp.userData.pgRig = rig
  posePartygoer(rig, null, 0, 0)
  bakeCpuSkin(rig, grp)
  return grp
}

// ============================================================================
// 姿态
// ============================================================================
type PoseIn = Partial<PartyState> | null
const E = new THREE.Euler()
function setRot(b: THREE.Bone, x: number, y: number, z: number) { E.set(x, y, z, 'XYZ'); b.quaternion.setFromEuler(E) }
const _tip = V(0, 0, 0)

/** 按 AI 姿态量摆骨骼（time=秒；dt 用于气球的弹簧） */
export function posePartygoer(r: PartygoerRig, s: PoseIn, time: number, dt: number) {
  const B = r.B, bn = r.bones
  for (let i = 0; i < bn.length; i++) { bn[i].position.copy(r.rest[i]); bn[i].quaternion.identity(); bn[i].scale.setScalar(1) }
  const g = s?.gait ?? 0, sp = s?.speed ?? 0
  const walk = clamp01(sp / 1.4), run = clamp01((sp - 1.6) / 3)
  const wave = s?.wave ?? 0, offer = s?.offer ?? 0, reach = s?.reach ?? 0, bite = s?.bite ?? 0
  const open = s?.open ?? 0, claw = s?.claw ?? 0, down = s?.down ?? 0, crawl = s?.crawl ?? 0
  const windup = s?.phase === 'windup' ? 1 : 0
  const hit = s?.hitT !== undefined && s.hitT < 0.3 ? 1 - s.hitT / 0.3 : 0
  const cut = s?.armCut ?? [0, 0], arms = s?.armHp ?? [1, 1]

  // 腿：笨重的块状步伐
  const amp = 0.38 * walk + 0.22 * run
  for (const i of [0, 1] as const) {
    const ph = g + (i ? Math.PI : 0)
    setRot(bn[B.thigh[i]], Math.sin(ph) * amp, 0, 0)
    setRot(bn[B.shin[i]], Math.max(0, -Math.cos(ph)) * amp * 1.1, 0, 0)
    setRot(bn[B.foot[i]], -Math.max(0, Math.sin(ph)) * amp * 0.5, 0, 0)
  }
  const bob = Math.abs(Math.sin(g)) * 0.03 * (walk + run)
  bn[B.root].position.y += bob - 0.02 * run
  // 柱体：轻微摇摆、跑动前倾、受击后仰
  setRot(bn[B.root], 0.12 * run, Math.sin(g) * 0.06 * walk, Math.sin(g) * 0.035 * walk)
  setRot(bn[B.spine], -0.12 * hit + 0.05 * windup + Math.sin(time * 1.3) * 0.015, 0, Math.sin(time * 0.9) * 0.012)
  setRot(bn[B.chest], 0.04 * offer - 0.06 * windup, 0, 0)
  const shareTurn = s?.shareT !== undefined && s.shareT < 1.2 ? Math.sin(s.shareT / 1.2 * Math.PI) * 0.35 : 0
  setRot(bn[B.head], Math.sin(time * 0.7) * 0.03 - 0.05 * hit, Math.sin(time * 0.45) * 0.12 * (1 - walk) + shareTurn, 0)

  // 面条臂：沿链传播的软摆动；挥手 / 递蛋糕 / 甩出抓咬
  for (const ai of [0, 1] as const) {
    const sd = ai === 0 ? 1 : -1, ch = B.arm[ai]
    const waving = ai === 0 ? wave : 0
    const swing = Math.sin(g + (ai ? 0 : Math.PI)) * 0.3 * walk
    for (let k = 0; k < ch.length; k++) {
      const f = k / (ch.length - 1)
      const wob = Math.sin(time * 2.1 - k * 0.8 + ai * 1.7) * (0.05 + 0.1 * f) * (1 - reach)
      let rx = wob + (k > 0 ? swing * 0.25 * f : swing)
      let rz = Math.cos(time * 1.7 - k * 0.7 + ai) * 0.05 * f * (1 - reach)
      let ry = 0
      if (k === 0) {
        rz += sd * (2.35 * waving) // 挥手：这条胳膊举过头顶
        rx += -0.95 * offer - 1.5 * reach + 0.55 * windup
        rz += -sd * 0.55 * offer - sd * 0.2 * reach
        ry += sd * 0.2 * reach
      } else {
        rz += sd * waving * Math.sin(time * 7 - k * 0.9) * 0.32
        rx += 0.05 * offer * (k > 2 ? 1 : 0) + 0.06 * reach * (k > 3 ? -1 : 0)
        rz += -sd * 0.16 * offer * (k > 1 ? 1 : 0)
      }
      setRot(bn[ch[k]], rx, ry, rz)
    }
    const mouth = bn[ch[ch.length - 1]]
    mouth.scale.setScalar(1 + 0.3 * bite + 0.06 * Math.sin(time * 3 + ai))
    // 断臂：第二节塌缩成肩上的残桩
    if ((arms[ai] ?? 1) <= 0) { const k = 1 - 0.999 * cut[ai]; bn[ch[1]].scale.setScalar(Math.max(0.001, k)); bn[ch[0]].scale.setScalar(1 - 0.72 * cut[ai]) }
  }

  // 胸甲两扇门：狂战士时向两侧弹开（倒地时被地面挡住，只开一半）
  const doorA = open * (1.85 - 1.2 * down) + Math.sin(time * 9) * 0.04 * open * (1 - down)
  setRot(bn[B.door[0]], 0, doorA, 0)
  setRot(bn[B.door[1]], 0, -doorA, 0)
  // 恐惧蜈蚣爪臂：从胸腔弹出；平时缩成一点藏在胸腔里
  const pop = sstep(0.15, 0.85, open)
  for (const ci of [0, 1] as const) {
    const ch = B.cent[ci]
    bn[ch[0]].scale.setScalar(Math.max(0.001, pop))
    for (let k = 0; k < ch.length; k++) {
      const f = k / (ch.length - 1)
      const writhe = Math.sin(time * (ci ? 3.1 : 2.6) - k * 1.1) * 0.12 * (0.4 + f)
      const slash = claw > 0 ? Math.sin(claw * Math.PI * 3 + ci * 1.4) : 0 // 连续抓挠：三次往复
      const scrabble = crawl * Math.sin(time * 11 + k * 1.6) * 0.3 // 爬走时当成步足乱扒
      // 抓挠：上伸的钩爪臂向前下劈（绕 X 正转），尾巴那条从下往前上撩（绕 X 反转）
      const sl = Math.max(0, slash)
      let rx = writhe * 0.5 + (ci === 0 ? (k === 0 ? 1.15 * sl : 0.22 * sl) : (k === 0 ? -0.85 * sl : -0.12 * sl))
      const rz = writhe + scrabble + (k === 0 ? (ci ? 0.3 : -0.3) * Math.max(0, -slash) : 0)
      if (k === 0 && ci === 1) rx += 0.2 * Math.sin(time * 1.3)
      setRot(bn[ch[k]], rx, 0, rz)
    }
  }

  // 倒地 / 爬走：面朝下趴在地上（以脚底为轴向前扑倒）
  r.pose.rotation.set(down * Math.PI / 2, 0, crawl * Math.sin(time * 2.4) * 0.05)
  r.pose.position.set(crawl * Math.sin(time * 4.8) * 0.015, down * 0.19, -down * 1.05)

  // 蛋糕（只在假装友善地递蛋糕时显示）
  r.cake.visible = offer > 0.08 && down < 0.1
  r.cake.scale.setScalar(Math.max(0.001, sstep(0.08, 0.6, offer)))
  r.inner.updateMatrixWorld(true)
  if (r.cake.visible) { // 蛋糕托在两只吸盘口之间
    const live = [0, 1].filter((i) => (arms[i] ?? 1) > 0)
    const mid = V(0, 0, 0)
    for (const i of live) mid.add(bn[B.arm[i][6]].getWorldPosition(_tip))
    if (live.length) {
      mid.multiplyScalar(1 / live.length)
      bn[B.spine].worldToLocal(mid)
      r.cake.position.set(mid.x, mid.y - 0.05, mid.z)
    }
  }

  // 气球：拴在面条臂吸盘口附近，飘在上方；细线断了就飞走
  if (r.balloon && r.string) {
    const attached = s ? !!s.balloon : true
    const fly = s?.balloonFly ?? 0
    bn[B.arm[r.balloonArm][5]].getWorldPosition(_tip)
    r.inner.worldToLocal(_tip)
    const want = attached ? V(_tip.x + Math.sin(time * 0.8) * 0.12, Math.max(_tip.y + 1.05, 2.0), _tip.z + Math.cos(time * 0.6) * 0.1) : null
    const st = r.bal
    if (!st.init) { st.p.copy(want ?? V(0, 2.6, 0)); st.init = true }
    const h = Math.min(0.05, Math.max(0, dt))
    if (want) {
      if (h === 0) { st.p.copy(want); st.v.set(0, 0, 0) }
      else { st.v.addScaledVector(want.clone().sub(st.p), 18 * h); st.v.multiplyScalar(Math.max(0, 1 - 4 * h)); st.p.addScaledVector(st.v, h) }
    }
    else { st.p.y += 0.7 * h; st.p.x += Math.sin(time * 0.9) * 0.2 * h }
    r.balloon.position.copy(st.p)
    r.balloon.rotation.set(Math.sin(time * 0.7) * 0.12, 0, Math.cos(time * 0.8) * 0.12)
    r.balloon.visible = attached || fly < 7
    const pa = r.string.geometry.attributes.position as THREE.BufferAttribute
    r.string.visible = attached
    if (attached) for (let k = 0; k < 9; k++) {
      const u = k / 8, sag = Math.sin(u * Math.PI) * 0.06
      pa.setXYZ(k, _tip.x + (st.p.x - _tip.x) * u + sag, _tip.y + (st.p.y - _tip.y) * u, _tip.z + (st.p.z - _tip.z) * u)
    }
    pa.needsUpdate = true
  }
}

/** 燃烧：皮肤与血肉烧焦发黑，内部透出橘红火光 */
function setBurn(r: PartygoerRig, k: number, time: number) {
  const char = new THREE.Color('#1c1612')
  r.skinMat.color.copy(r.baseColor).lerp(char, clamp01(k * 1.7))
  r.fleshMat.color.set('#ffffff').lerp(char, clamp01(k * 1.8))
  const fl = k > 0 && k < 1.2 ? (0.55 + 0.45 * Math.sin(time * 23) * Math.sin(time * 7.3)) * Math.min(1, k * 3) * (1.2 - Math.min(1.2, k)) : 0
  for (const m of [r.skinMat, r.fleshMat]) { (m as THREE.MeshLambertMaterial).emissive?.setRGB(1.0 * fl, 0.38 * fl, 0.08 * fl) }
}

export function animatePartygoer(grp: THREE.Group, e: Entity, time: number, _gz: number, dt = 1 / 60) {
  const r = grp.userData.pgRig as PartygoerRig | undefined
  if (!r) return
  const s = e.pg
  posePartygoer(r, s ?? null, time, dt)
  setBurn(r, s?.burn ?? 0, time)
  bakeCpuSkin(r, grp)
}

/** 死亡（只会发生在被烧尽之后）：焦黑的躯壳塌成一摊灰 */
export function animatePartygoerDeath(grp: THREE.Group, e: Entity, d: number, time: number) {
  const r = grp.userData.pgRig as PartygoerRig | undefined
  if (!r) return
  posePartygoer(r, { ...(e.pg ?? {}), down: 1, crawl: 0, speed: 0, claw: 0, open: 1 }, time, 0)
  setBurn(r, 1 + d, time)
  r.pose.scale.set(1 + d * 0.15, Math.max(0.05, 1 - d * 0.85), 1 + d * 0.15)
  bakeCpuSkin(r, grp)
}

/** 验收用：单只网格数、三角面与可见绘制次数（材质组计入绘制次数） */
export function partygoerBudget(grp: THREE.Group) {
  let meshes = 0, draws = 0, tris = 0
  grp.traverse((o) => {
    const m = o as THREE.Mesh
    if (!(m.isMesh || (o as THREE.Line).isLine)) return
    meshes++
    if (!o.visible) return
    const g = m.geometry as THREE.BufferGeometry
    draws += Array.isArray(m.material) ? Math.max(1, g.groups.length) : 1
    if (m.isMesh) tris += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  return { meshes, draws, tris }
}
