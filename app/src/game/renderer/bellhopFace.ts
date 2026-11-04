import { shareHotelRigAssets } from './shared'
// [bellhop] 行李员的面盘（8 张脸，「每张都更美、细节精致」）：同一套手绘水彩 / 上釉面具画风的不同猫头鹰。
// 面盘是独立网格（挂 head 骨，局部原点 = FACE_C，+Z 朝前）：
//   · 盘面 = 极坐标网格（中心 → 轮廓），轮廓按物种多边形（心形 / 圆盘 / 带耳簇…）；表面 = 包脸的弧 + 每眼一个浅凹盘 + 中线浮起的脊 + 圆润卷边；
//     背面 + 侧壁给厚度（面具感）。钩喙 = 沿中线的扫掠体（龙骨截面、尖端下钩）。耳簇（角鸮 / 长耳鸮）= 两片扫掠羽簇。
//   · UV = 正面平面投影（±0.15 m），每张脸一张 512² 手绘贴图：奶白釉底 + 水彩斑 + 羽毛细线刻纹 + 墨线轮廓 + 眉纹 / 同心环 / 斑点。
//   · 眼 = 半嵌在凹盘里的黑圆珠（8 张一律黑眼，不用彩色虹膜）。喙 = 额中线细脊 → 龙骨截面钩喙（侧面凸出面盘 1.7–2.1 cm，钩尖离开面盘），UV 走贴图左侧的喙条。
// setBellhopFace(group, i)（在 bellhopMesh）换几何 + 材质。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { clamp, gauss, mix, sstep } from './conciergeSdf'

export type P2 = [number, number]
export interface FaceSpec {
  id: string; zh: string
  /** 半轮廓（x ≥ 0，从顶部中线顺时针到底部中线），米 */
  half: P2[]
  eyes: { x: number; y: number; r: number; iris: string; ring?: string }
  bowl: { depth: number; R: number }
  ridge: number
  /** 喙：y = 喙根（额中线细脊在其上方，从面盘顶一路下来）；len 喙长；w 喙根宽；out = 喙在侧面凸出面盘的最大高度；钩尖离开面盘 */
  beak: { y: number; len: number; w: number; color: string; out: number }
  tufts?: { x: number; y: number; len: number; w: number; ang: number }
  wrap?: number
}
const mirror = (half: P2[]): P2[] => { const out = [...half]; for (let i = half.length - 2; i >= 1; i--) out.push([-half[i][0], half[i][1]]); return out }
const ellHalf = (a: number, top: number, bot: number, sq = 2.2, n = 14, notch = 0): P2[] => {
  const out: P2[] = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI, c = Math.cos(t), s = Math.sin(t)
    const r = 1 / Math.pow(Math.pow(Math.abs(c), sq) + Math.pow(Math.abs(s), sq), 1 / sq)
    out.push([a * s * r, (c > 0 ? top : -bot) * Math.abs(c) * r - (i === 0 ? notch : 0)])
  }
  return out
}
export const FACES: FaceSpec[] = [
  // 8 张脸同一画风（仓鸮 / 草鸮那套）：奶白素色上釉面具 + 手绘细线羽纹 + 黑圆眼；只靠面盘轮廓、耳簇、细纹排布、淡色调与斑点区分品种
  { id: 'barn', zh: '仓鸮', // 附图原样：高窄心形、顶部中线小 V 缺口、尖下巴；小黑眼；长细钩喙从额中线下来
    half: [[0, 0.098], [0.012, 0.106], [0.03, 0.112], [0.051, 0.112], [0.069, 0.104], [0.079, 0.087], [0.084, 0.06], [0.085, 0.027], [0.082, -0.008], [0.075, -0.043], [0.063, -0.073], [0.046, -0.097], [0.027, -0.114], [0.01, -0.125], [0, -0.128]],
    eyes: { x: 0.034, y: 0.032, r: 0.0118, iris: '#0b0908' }, bowl: { depth: 0.009, R: 0.044 }, ridge: 0.0052, beak: { y: 0.016, len: 0.056, w: 0.0135, color: '#e2d3b2', out: 0.021 } },
  { id: 'snowy', zh: '雪鸮', half: ellHalf(0.087, 0.098, 0.104, 2.4), eyes: { x: 0.034, y: 0.026, r: 0.0122, iris: '#0b0908' }, bowl: { depth: 0.007, R: 0.04 }, ridge: 0.003, beak: { y: 0.008, len: 0.032, w: 0.0115, color: '#ddd6c8', out: 0.018 } },
  { id: 'scops', zh: '角鸮', half: ellHalf(0.083, 0.094, 0.1, 2.6, 14, 0.008), eyes: { x: 0.034, y: 0.03, r: 0.0124, iris: '#0b0908' }, bowl: { depth: 0.008, R: 0.038 }, ridge: 0.004, beak: { y: 0.01, len: 0.032, w: 0.0115, color: '#d9ccb4', out: 0.018 }, tufts: { x: 0.056, y: 0.082, len: 0.05, w: 0.026, ang: 0.42 } },
  { id: 'longeared', zh: '长耳鸮', half: ellHalf(0.079, 0.1, 0.11, 2.1, 14, 0.006), eyes: { x: 0.032, y: 0.03, r: 0.0122, iris: '#0b0908' }, bowl: { depth: 0.009, R: 0.038 }, ridge: 0.0045, beak: { y: 0.01, len: 0.036, w: 0.011, color: '#dccaa6', out: 0.019 }, tufts: { x: 0.032, y: 0.088, len: 0.08, w: 0.032, ang: 0.2 } },
  { id: 'grass', zh: '草鸮', // 比仓鸮略宽、顶部更圆的心形，下巴钝一点；眼前一块深褐「泪滴」
    half: [[0, 0.094], [0.014, 0.104], [0.034, 0.112], [0.056, 0.112], [0.074, 0.102], [0.084, 0.082], [0.088, 0.054], [0.088, 0.02], [0.084, -0.015], [0.075, -0.048], [0.06, -0.077], [0.042, -0.098], [0.022, -0.112], [0.008, -0.118], [0, -0.12]],
    eyes: { x: 0.035, y: 0.03, r: 0.0128, iris: '#120c08' }, bowl: { depth: 0.0095, R: 0.045 }, ridge: 0.005, beak: { y: 0.012, len: 0.05, w: 0.011, color: '#e8d2c0', out: 0.019 } },
  { id: 'greatgrey', zh: '乌林鸮', half: ellHalf(0.09, 0.104, 0.12, 2.0, 16), eyes: { x: 0.027, y: 0.026, r: 0.0108, iris: '#0b0908' }, bowl: { depth: 0.006, R: 0.05 }, ridge: 0.0035, beak: { y: 0.006, len: 0.032, w: 0.0105, color: '#ddd5b8', out: 0.018 } },
  { id: 'tawny', zh: '灰林鸮', half: ellHalf(0.085, 0.1, 0.102, 2.2), eyes: { x: 0.033, y: 0.028, r: 0.0132, iris: '#0b0908' }, bowl: { depth: 0.009, R: 0.04 }, ridge: 0.005, beak: { y: 0.008, len: 0.034, w: 0.0115, color: '#ddd0b0', out: 0.019 } },
  { id: 'little', zh: '纵纹腹小鸮', half: ellHalf(0.08, 0.084, 0.092, 2.8, 14, 0.004), eyes: { x: 0.033, y: 0.024, r: 0.0128, iris: '#0b0908' }, bowl: { depth: 0.007, R: 0.036 }, ridge: 0.003, beak: { y: 0.004, len: 0.028, w: 0.0105, color: '#d8cfa8', out: 0.017 }, wrap: 3.2 },
]
export const N_FACES = FACES.length
export const facePoly = (i: number) => mirror(FACES[i].half)
/** 二维多边形有向距离（内负外正） */
export function sdPoly(P: P2[], x: number, y: number) {
  let d = 1e9, s = 1
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const ex = P[j][0] - P[i][0], ey = P[j][1] - P[i][1], wx = x - P[i][0], wy = y - P[i][1]
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1)
    const bx = wx - ex * t, by = wy - ey * t
    d = Math.min(d, bx * bx + by * by)
    const c1 = y >= P[i][1], c2 = y < P[j][1], c3 = ex * wy > ey * wx
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s
  }
  return s * Math.sqrt(d)
}
/** 从中心沿角 th 到轮廓的距离（星形多边形） */
function rayR(P: P2[], th: number) {
  const dx = Math.cos(th), dy = Math.sin(th)
  let best = 1e9
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const ax = P[j][0], ay = P[j][1], bx = P[i][0], by = P[i][1]
    const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-12) continue
    const t = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t)
  }
  return best
}
/** 面盘正面高度（局部 z）：包脸弧 + 凹盘 + 中线脊 + 卷边 */
export function faceZ(f: FaceSpec, x: number, y: number, rho: number) {
  const k = f.wrap ?? 4.1
  let z = -k * x * x - 0.9 * Math.min(0, y) * Math.min(0, y) - 0.6 * Math.max(0, y - 0.06) ** 2
  const { x: ex, y: ey } = f.eyes
  for (const s of [1, -1]) { const dx = x - s * ex, dy = y - ey; z -= f.bowl.depth * Math.exp(-(dx * dx + dy * dy) / (f.bowl.R * f.bowl.R)) }
  z += f.ridge * Math.exp(-(x * x) / (0.0075 * 0.0075)) * sstep(ey - 0.035, ey - 0.005, y)
  z += 0.0026 * gauss(rho - 0.9, 0.05)
  z -= 0.0075 * Math.max(0, (rho - 0.9) / 0.1) ** 2
  return z
}
const THICK = 0.011
/** 贴图里的专用区：喙条（左侧竖条）/ 面具侧壁（右下角素色釉边） */
const BEAK_U0 = 0.006, BEAK_DU = 0.068, WALL_U0 = 0.86, WALL_DU = 0.12, WALL_V0 = 0.012, WALL_V1 = 0.07
export interface FaceGeo { disc: THREE.BufferGeometry; eyes: THREE.BufferGeometry; tris: number }
const geoCache: Record<string, FaceGeo> = {}
export function buildFaceGeometry(i: number, lod = 0): FaceGeo {
  const key = i + ':' + lod
  if (geoCache[key]) return geoCache[key]
  const f = FACES[i], P = facePoly(i)
  const nA = lod ? 44 : 84, nR = lod ? 7 : 14
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  const UVS = 0.3
  const vtx = (x: number, y: number, z: number, u?: number, v?: number) => { pos.push(x, y, z); uv.push(u ?? 0.5 + x / UVS, v ?? 0.5 + y / UVS); return pos.length / 3 - 1 }
  const R: number[] = []; for (let a = 0; a < nA; a++) R.push(rayR(P, Math.PI / 2 - (a / nA) * Math.PI * 2))
  // 正面
  const ring = (rho: number, back: boolean, wallV = -1) => {
    const out: number[] = []
    for (let a = 0; a < nA; a++) {
      const th = Math.PI / 2 - (a / nA) * Math.PI * 2, x = Math.cos(th) * R[a] * rho, y = Math.sin(th) * R[a] * rho
      const zf = faceZ(f, x, y, rho)
      const zb = -(f.wrap ?? 4.1) * x * x - 0.9 * Math.min(0, y) ** 2 - THICK - 0.004 * rho * rho
      out.push(wallV < 0 ? vtx(x, y, back ? Math.min(zb, zf - 0.003) : zf) : vtx(x, y, back ? Math.min(zb, zf - 0.003) : zf, WALL_U0 + WALL_DU * ((a * 7) % nA) / nA, wallV))
    }
    return out
  }
  for (const back of [false, true]) {
    const c = vtx(0, 0, back ? -THICK : faceZ(f, 0, 0, 0))
    let prev = ring(1 / nR * 0.6, back)
    for (let a = 0; a < nA; a++) { const b = (a + 1) % nA; if (!back) idx.push(c, prev[b], prev[a]); else idx.push(c, prev[a], prev[b]) }
    for (let k = 1; k <= nR; k++) {
      const t = k / nR, rho = 1 - Math.pow(1 - t, 1.55)
      const cur = ring(Math.max(rho, 0.6 / nR + 0.01), back)
      for (let a = 0; a < nA; a++) { const b = (a + 1) % nA; if (!back) idx.push(prev[a], prev[b], cur[b], prev[a], cur[b], cur[a]); else idx.push(prev[a], cur[b], prev[b], prev[a], cur[a], cur[b]) }
      prev = cur
    }
    if (back) {
      // 侧壁：正面外圈 → 背面外圈（独立顶点，硬边；UV 指到贴图角上一块素色釉边，免得正面投影被拉成竖条）
      const fr = ring(1, false, WALL_V1), br = ring(1, true, WALL_V0)
      for (let a = 0; a < nA; a++) { const b = (a + 1) % nA; idx.push(fr[a], fr[b], br[b], fr[a], br[b], br[a]) }
    }
  }
  // 喙：额中线细脊（从面盘顶缺口下来）→ 龙骨截面的钩喙（侧面明显凸出面盘）→ 钩尖下弯回勾、离开面盘。
  //   每圈截面在 (x, z) 平面：前缘高 F、后缘 Bk（相对面盘表面），半宽 W；前缘收窄成棱（龙骨）。
  //   UV 指到贴图左侧的竖条（喙条：两侧墨线 + 喙色 + 尖端角质深色），不用正面投影（侧面不拉丝）。
  {
    const B = f.beak, top = rayR(P, Math.PI / 2) - 0.004, botR = rayR(P, -Math.PI / 2)
    const sZ = (y: number) => faceZ(f, 0, y, y >= 0 ? clamp(y / (top + 0.004), 0, 1) : clamp(-y / botR, 0, 1))
    const nr = lod ? 3 : 6, nb = lod ? 8 : 18, nc = lod ? 8 : 12
    const rh = f.id === 'barn' || f.id === 'grass' ? 0.0032 : 0.0024, rw = 0.0028
    const Ftip = B.out * 0.7, tipDrop = B.len * 0.12
    const span = (top - B.y) + B.len + tipDrop
    type Sec = { y: number; F: number; Bk: number; W: number; v: number }
    const secs: Sec[] = []
    for (let k = 0; k < nr; k++) { const t = k / nr, y = mix(top, B.y, t); secs.push({ y, F: rh * sstep(0, 0.35, t) + 0.0006, Bk: -0.0025, W: mix(rw * 0.6, B.w * 0.5, sstep(0.3, 1, t)), v: (top - y) / span }) }
    for (let k = 0; k < nb; k++) {
      const u = k / nb, y = B.y - B.len * u - (u > 0.72 ? tipDrop * ((u - 0.72) / 0.28) ** 1.6 : 0)
      const F = u <= 0.7 ? rh + (B.out - rh) * Math.sin((Math.PI / 2) * (u / 0.7)) : B.out - (B.out - Ftip) * ((u - 0.7) / 0.3) ** 1.5
      const Bk = -0.0025 + (Ftip - 0.0012 + 0.0025) * Math.pow(sstep(0.42, 1, u), 1.25)
      const W = (B.w * 0.5) * Math.pow(Math.max(0.02, 1 - 0.93 * u), 0.8)
      secs.push({ y, F, Bk, W, v: (top - y) / span })
    }
    const tipY = B.y - B.len - tipDrop - 0.0025
    const rings: number[][] = []
    for (const S of secs) {
      const zs = sZ(S.y), zc = zs + (S.F + S.Bk) / 2, hd = Math.max(0.0008, (S.F - S.Bk) / 2)
      const r: number[] = []
      for (let j = 0; j <= nc; j++) {
        const a = (j / nc) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a)
        const pinch = sa > 0 ? 1 - 0.62 * sa : 1 - 0.15 * -sa
        r.push(vtx(ca * S.W * pinch, S.y, zc + sa * hd, BEAK_U0 + BEAK_DU * (j / nc), 0.985 - 0.97 * S.v))
      }
      rings.push(r)
    }
    for (let k = 0; k < rings.length - 1; k++) for (let j = 0; j < nc; j++) { const a = rings[k][j], b = rings[k][j + 1], c = rings[k + 1][j + 1], d = rings[k + 1][j]; idx.push(a, c, d, a, b, c) }
    const tip = vtx(0, tipY, sZ(tipY) + Ftip - 0.001, BEAK_U0 + BEAK_DU * 0.25, 0.015)
    const L = rings[rings.length - 1]
    for (let j = 0; j < nc; j++) idx.push(L[j], L[j + 1], tip)
    const cap = vtx(0, top + 0.002, sZ(top) - 0.001, BEAK_U0 + BEAK_DU * 0.25, 0.985)
    for (let j = 0; j < nc; j++) idx.push(rings[0][j], cap, rings[0][j + 1])
  }
  // 耳簇（两片扁平羽簇，从面盘上角后方向上外翘）
  if (f.tufts) {
    const T = f.tufts, ns = lod ? 4 : 8, nc = lod ? 6 : 8
    for (const s of [1, -1]) {
      const rings: number[][] = []
      for (let k = 0; k <= ns; k++) {
        const t = k / ns
        const ang = T.ang * s
        const x = s * T.x + Math.sin(ang) * T.len * t + s * 0.004 * Math.sin(t * Math.PI)
        const y = T.y + Math.cos(ang) * T.len * t
        const z = -(f.wrap ?? 4.1) * x * x - 0.006 - 0.022 * t
        const hw = T.w * 0.5 * Math.pow(1 - t, 0.85) * (t < 0.15 ? 0.7 + 2 * t : 1), hd = 0.004 * (1 - t) + 0.0012
        const r: number[] = []
        for (let j = 0; j < nc; j++) { const a = (j / nc) * Math.PI * 2; r.push(vtx(x + Math.cos(a) * hw * Math.cos(ang), y - Math.cos(a) * hw * Math.sin(ang), z + Math.sin(a) * hd)) }
        rings.push(r)
      }
      for (let k = 0; k < ns; k++) for (let j = 0; j < nc; j++) { const a = rings[k][j], b = rings[k][(j + 1) % nc], c = rings[k + 1][(j + 1) % nc], d = rings[k + 1][j]; idx.push(a, c, b, a, d, c) }
      const c0 = vtx(s * T.x, T.y - 0.004, -(f.wrap ?? 4.1) * T.x * T.x - 0.008)
      for (let j = 0; j < nc; j++) idx.push(rings[0][j], rings[0][(j + 1) % nc], c0)
    }
  }
  const disc = new THREE.BufferGeometry()
  disc.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); disc.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); disc.setIndex(idx)
  disc.computeVertexNormals()
  // 眼：半嵌的圆珠（球心在凹盘表面下 0.45r）
  const epos: number[] = [], enor: number[] = [], euv: number[] = [], eidx: number[] = []
  for (const s of [1, -1]) {
    const r = f.eyes.r, ex = s * f.eyes.x, ey = f.eyes.y, ez = faceZ(f, ex, ey, 0.4) - r * 0.42
    const g = new THREE.SphereGeometry(r, lod ? 10 : 18, lod ? 8 : 12).rotateX(Math.PI / 2)
    const pa = g.attributes.position as THREE.BufferAttribute, base = epos.length / 3
    for (let k = 0; k < pa.count; k++) {
      const x = pa.getX(k), y = pa.getY(k), z = pa.getZ(k)
      epos.push(ex + x, ey + y, ez + z); const l = Math.hypot(x, y, z) || 1; enor.push(x / l, y / l, z / l); euv.push(0.5 + x / (2 * r) * 0.98, 0.5 + y / (2 * r) * 0.98)
    }
    const ix = g.index!.array; for (let k = 0; k < ix.length; k++) eidx.push(base + ix[k])
  }
  const eyes = new THREE.BufferGeometry()
  eyes.setAttribute('position', new THREE.Float32BufferAttribute(epos, 3)); eyes.setAttribute('normal', new THREE.Float32BufferAttribute(enor, 3)); eyes.setAttribute('uv', new THREE.Float32BufferAttribute(euv, 2)); eyes.setIndex(eidx)
  shareHotelRigAssets({ disc, eyes })
  return (geoCache[key] = { disc, eyes, tris: idx.length / 3 + eidx.length / 3 })
}

// ---------------------------------------------------------------------------------------------------------------
// 贴图（手绘水彩）
// ---------------------------------------------------------------------------------------------------------------
const TS = 512
const px = (x: number) => (0.5 + x / 0.3) * TS, py = (y: number) => (0.5 - y / 0.3) * TS
type G = CanvasRenderingContext2D
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }
function polyPath(g: G, P: P2[], inset = 0) {
  g.beginPath()
  P.forEach(([x, y], k) => { const l = Math.hypot(x, y) || 1, xx = x - (x / l) * inset, yy = y - (y / l) * inset; if (k) g.lineTo(px(xx), py(yy)); else g.moveTo(px(xx), py(yy)) })
  g.closePath()
}
/** 平滑轮廓上的点（按弧长参数） */
function outlinePts(P: P2[], n: number): P2[] {
  const L: number[] = [0]
  for (let i = 1; i <= P.length; i++) { const a = P[i - 1], b = P[i % P.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])) }
  const tot = L[L.length - 1], out: P2[] = []
  for (let k = 0; k < n; k++) { const s = (k / n) * tot; let i = 1; while (L[i] < s) i++; const a = P[i - 1], b = P[i % P.length], t = (s - L[i - 1]) / (L[i] - L[i - 1]); out.push([mix(a[0], b[0], t), mix(a[1], b[1], t)]) }
  return out
}
function stroke(g: G, x0: number, y0: number, x1: number, y1: number, w: number, col: string, bend = 0) {
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'
  g.beginPath(); g.moveTo(px(x0), py(y0)); g.quadraticCurveTo(px((x0 + x1) / 2 - (y1 - y0) * bend), py((y0 + y1) / 2 + (x1 - x0) * bend), px(x1), py(y1)); g.stroke()
}
function wash(g: G, r: () => number, n: number, cols: string[], rad: [number, number]) {
  for (let k = 0; k < n; k++) {
    const x = (r() - 0.5) * 0.24, y = (r() - 0.5) * 0.28, rr = mix(rad[0], rad[1], r())
    const gr = g.createRadialGradient(px(x), py(y), 0, px(x), py(y), rr / 0.3 * TS)
    const c = cols[Math.floor(r() * cols.length)]
    gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(0, 0, TS, TS)
  }
}
/** 围绕一点的放射细线（羽毛刻纹） */
function radial(g: G, r: () => number, cx: number, cy: number, r0: number, r1: number, n: number, col: string, w = 1, a0 = 0, a1 = Math.PI * 2) {
  for (let k = 0; k < n; k++) { const a = mix(a0, a1, (k + r() * 0.6) / n), rr0 = r0 * (0.9 + r() * 0.3), rr1 = r1 * (0.75 + r() * 0.35); stroke(g, cx + Math.cos(a) * rr0, cy + Math.sin(a) * rr0, cx + Math.cos(a) * rr1, cy + Math.sin(a) * rr1, w, col, (r() - 0.5) * 0.3) }
}
/** 一张脸的贴图 */
function paintFace(i: number) {
  const c = document.createElement('canvas'); c.width = c.height = TS
  const g = c.getContext('2d')!, f = FACES[i], P = facePoly(i), r = rng(1000 + i * 77)
  const E = f.eyes
  const pal: Record<string, { base: string; edge: string; ink: string; out: string; wash: string[]; line: string }> = {
    barn: { base: '#f1e8d2', edge: '#e2d2ae', ink: '#33261b', out: '#c98c43', wash: ['rgba(214,196,156,0.35)', 'rgba(250,244,228,0.45)', 'rgba(205,182,140,0.25)'], line: 'rgba(120,92,60,0.55)' },
    grass: { base: '#dcc193', edge: '#b98e58', ink: '#2e1a0c', out: '#8a5e30', wash: ['rgba(206,170,110,0.45)', 'rgba(240,226,196,0.4)', 'rgba(160,112,60,0.35)'], line: 'rgba(100,64,30,0.6)' },
    // 其余 6 张：同一套奶白素色釉底，只在色调上略偏（雪白 / 灰褐 / 暖赭 / 冷灰 / 浅褐 / 黄褐）
    snowy: { base: '#f6f3eb', edge: '#e2ddd0', ink: '#2f2a24', out: '#e4dfd2', wash: ['rgba(226,222,212,0.35)', 'rgba(255,253,248,0.45)'], line: 'rgba(116,108,96,0.45)' },
    scops: { base: '#e6ddcc', edge: '#c4b294', ink: '#30251b', out: '#cdbb9a', wash: ['rgba(206,192,166,0.35)', 'rgba(248,240,226,0.4)', 'rgba(180,162,132,0.22)'], line: 'rgba(98,78,56,0.5)' },
    longeared: { base: '#f0dcb6', edge: '#d6ae74', ink: '#31210f', out: '#d8b27a', wash: ['rgba(226,190,130,0.3)', 'rgba(250,240,220,0.4)', 'rgba(206,160,96,0.22)'], line: 'rgba(118,80,38,0.5)' },
    greatgrey: { base: '#e8e6e0', edge: '#c2beb4', ink: '#2c2a27', out: '#cfcbc2', wash: ['rgba(210,206,198,0.35)', 'rgba(250,248,244,0.4)'], line: 'rgba(78,76,70,0.45)' },
    tawny: { base: '#ecdcc0', edge: '#c9ac80', ink: '#2f2216', out: '#cdb48e', wash: ['rgba(214,196,164,0.35)', 'rgba(250,244,232,0.4)', 'rgba(190,166,128,0.22)'], line: 'rgba(100,74,48,0.5)' },
    little: { base: '#e9d8b8', edge: '#c8aa78', ink: '#2e2114', out: '#cfb68a', wash: ['rgba(214,192,150,0.35)', 'rgba(250,242,226,0.4)', 'rgba(186,160,116,0.22)'], line: 'rgba(100,72,42,0.5)' },
  }
  const C = pal[f.id]
  // 底（面盘外：羽色，给耳簇 / 边缘用）
  g.fillStyle = C.out; g.fillRect(0, 0, TS, TS)
  for (let k = 0; k < 900; k++) { const x = (r() - 0.5) * 0.3, y = (r() - 0.5) * 0.3, a = Math.atan2(y, x) + (r() - 0.5) * 0.6; stroke(g, x, y, x + Math.cos(a) * 0.012, y + Math.sin(a) * 0.012, 1.4, r() < 0.5 ? 'rgba(40,24,10,0.25)' : 'rgba(255,240,210,0.18)') }
  // 盘面：中心 → 边缘渐变
  g.save(); polyPath(g, P); g.clip()
  const gr = g.createRadialGradient(px(0), py(0.01), 4, px(0), py(0.01), 0.12 / 0.3 * TS); gr.addColorStop(0, C.base); gr.addColorStop(0.7, C.base); gr.addColorStop(1, C.edge)
  g.fillStyle = gr; g.fillRect(0, 0, TS, TS)
  wash(g, r, 26, C.wash, [0.01, 0.04])
  // 纸纹 / 颗粒
  const img = g.getImageData(0, 0, TS, TS), D = img.data
  for (let k = 0; k < D.length; k += 4) { const n = (r() - 0.5) * 10; D[k] += n; D[k + 1] += n; D[k + 2] += n }
  g.putImageData(img, 0, 0)
  g.restore()
  g.save(); polyPath(g, P); g.clip()
  // ---- 物种纹样 ----
  const both = (fn: (s: number) => void) => { fn(1); fn(-1) }
  if (f.id === 'barn' || f.id === 'grass') {
    // 眼前（内眼角 → 喙侧）一抹暖色阴影；颊上放射羽线；眼下一组弧形细线（附图）
    both((s) => {
      const gr2 = g.createRadialGradient(px(s * (E.x - 0.012)), py(E.y + 0.004), 2, px(s * (E.x - 0.012)), py(E.y + 0.004), (f.id === 'grass' ? 0.036 : 0.026) / 0.3 * TS)
      gr2.addColorStop(0, f.id === 'grass' ? 'rgba(78,44,18,0.9)' : 'rgba(170,132,86,0.45)'); gr2.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr2; g.fillRect(0, 0, TS, TS)
      radial(g, r, s * E.x, E.y, E.r * 1.6, 0.05, 40, C.line, 1.1, s > 0 ? -1.9 : Math.PI - 1.25, s > 0 ? 1.25 : Math.PI + 1.9)
      for (let k = 0; k < 6; k++) { const yy = E.y - 0.02 - k * 0.0065; stroke(g, s * (E.x - 0.012), yy, s * (E.x + 0.014), yy - 0.004, 1.2, C.line, -0.25 * s) }
    })
  } else {
    // 其余 6 张：和仓鸮同一套笔触——眼周放射细羽线、眼下几道弧形细线、眼前一抹极淡的暖影；只换细纹排布 / 斑点 / 淡色调
    const tint: Record<string, string> = { snowy: 'rgba(170,170,166,0.22)', scops: 'rgba(140,116,84,0.3)', longeared: 'rgba(196,134,62,0.34)', greatgrey: 'rgba(120,118,112,0.24)', tawny: 'rgba(150,118,80,0.3)', little: 'rgba(150,118,74,0.3)' }
    both((s) => {
      const gr2 = g.createRadialGradient(px(s * (E.x - 0.01)), py(E.y + 0.003), 2, px(s * (E.x - 0.01)), py(E.y + 0.003), 0.03 / 0.3 * TS)
      gr2.addColorStop(0, tint[f.id]); gr2.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr2; g.fillRect(0, 0, TS, TS)
    })
    if (f.id === 'greatgrey') {
      // 乌林鸮：每眼一圈圈同心细环（略抖的手绘细线）
      both((s) => { for (let k = 0; k < 9; k++) { const rr = E.r * 1.9 + k * 0.0068; g.strokeStyle = `rgba(70,68,62,${0.42 - k * 0.025})`; g.lineWidth = 1; g.beginPath(); for (let q = 0; q <= 60; q++) { const a = (q / 60) * Math.PI * 2, j = rr + 0.0007 * Math.sin(q * 1.7 + k), X = s * E.x + Math.cos(a) * j, Y = E.y + Math.sin(a) * j * 1.06; if (q) g.lineTo(px(X), py(Y)); else g.moveTo(px(X), py(Y)) } g.stroke() } })
      both((s) => radial(g, r, s * E.x, E.y, E.r * 1.5, E.r * 2.6, 26, C.line, 0.9))
    } else {
      both((s) => radial(g, r, s * E.x, E.y, E.r * 1.6, f.id === 'little' ? 0.042 : 0.05, 40, C.line, 1.05, s > 0 ? -1.9 : Math.PI - 1.25, s > 0 ? 1.25 : Math.PI + 1.9))
      both((s) => { for (let k = 0; k < 5; k++) { const yy = E.y - 0.02 - k * 0.0065; stroke(g, s * (E.x - 0.011), yy, s * (E.x + 0.013), yy - 0.004, 1.1, C.line, -0.25 * s) } })
    }
    if (f.id === 'snowy') {
      // 雪鸮：额顶与眼上方零星的小黑点（细小、手点的墨点，不成块）
      for (let k = 0; k < 34; k++) { const x = (r() - 0.5) * 0.13, y = 0.05 + r() * 0.04; if (Math.abs(x) < 0.01) continue; g.fillStyle = `rgba(40,34,28,${0.45 + r() * 0.25})`; g.beginPath(); g.ellipse(px(x), py(y), 1.6 + r() * 1.3, 1.0 + r() * 0.7, (r() - 0.5) * 0.6, 0, Math.PI * 2); g.fill() }
    } else if (f.id === 'scops') {
      // 角鸮：盘外圈细密的竖向蠹纹（短而抖的细线），中间留白
      for (let k = 0; k < 220; k++) { const x = (r() - 0.5) * 0.17, y = (r() - 0.5) * 0.2, rr = Math.hypot(x / 0.083, y / 0.097); if (rr < 0.55) continue; stroke(g, x, y, x + (r() - 0.5) * 0.002, y - 0.005 - r() * 0.006, 0.9, C.line, (r() - 0.5) * 0.8) }
      // 眉：几道极细的斜线从额中线向外上扬（淡）
      both((s) => { for (let k = 0; k < 4; k++) stroke(g, s * 0.008, 0.052 + k * 0.004, s * (E.x + 0.018), E.y + E.r + 0.016 + k * 0.005, 0.9, C.line, 0.12 * s) })
    } else if (f.id === 'longeared') {
      // 长耳鸮：眼周一圈淡赭色晕（不压暗），盘缘一圈较密的细羽线
      both((s) => { const gr4 = g.createRadialGradient(px(s * E.x), py(E.y), E.r * 1.3 / 0.3 * TS, px(s * E.x), py(E.y), 0.04 / 0.3 * TS); gr4.addColorStop(0, 'rgba(206,146,74,0.42)'); gr4.addColorStop(1, 'rgba(206,150,82,0)'); g.fillStyle = gr4; g.fillRect(0, 0, TS, TS) })
      both((s) => { for (let k = 0; k < 4; k++) stroke(g, s * 0.006, 0.02 + k * 0.006, s * (E.x - 0.008), E.y + E.r + 0.024 + k * 0.006, 0.9, C.line, 0.1 * s) })
    } else if (f.id === 'tawny') {
      // 灰林鸮：沿盘缘内侧两道细的深色缘线 + 额上几道细竖纹
      const op2 = outlinePts(P, 160)
      for (const k of [0.9, 0.86]) { g.strokeStyle = 'rgba(92,66,40,0.45)'; g.lineWidth = 1.1; g.beginPath(); op2.forEach(([x, y], q) => { const X = px(x * k), Y = py(y * k + 0.002); if (q) g.lineTo(X, Y); else g.moveTo(X, Y) }); g.closePath(); g.stroke() }
      for (let k = 0; k < 26; k++) { const x = (r() - 0.5) * 0.05, y = 0.05 + r() * 0.035; stroke(g, x, y, x + (r() - 0.5) * 0.002, y - 0.008, 0.9, C.line) }
    } else if (f.id === 'little') {
      // 纵纹腹小鸮：额顶一片细小的褐色斑点 + 下颊几道纵向细纹
      for (let k = 0; k < 70; k++) { const x = (r() - 0.5) * 0.14, y = 0.045 + r() * 0.035; if (Math.abs(x) < 0.008) continue; g.fillStyle = `rgba(96,66,36,${0.45 + r() * 0.2})`; g.beginPath(); g.arc(px(x), py(y), 1.2 + r() * 1.0, 0, Math.PI * 2); g.fill() }
      both((s) => { for (let k = 0; k < 7; k++) { const x = s * (0.03 + k * 0.006); stroke(g, x, -0.025 - (k % 2) * 0.006, x + s * 0.002, -0.055 - (k % 3) * 0.004, 0.9, C.line, 0.1) } })
    }
  }
  // 眼窝：一圈深色描边（附图：黑眼外一道墨圈）
  both((s) => {
    const ring = E.ring ?? C.ink
    g.strokeStyle = ring; g.lineWidth = 3.2; g.beginPath(); g.arc(px(s * E.x), py(E.y), (E.r * 1.18) / 0.3 * TS, 0, Math.PI * 2); g.stroke()
    const gr3 = g.createRadialGradient(px(s * E.x), py(E.y), (E.r * 1.1) / 0.3 * TS, px(s * E.x), py(E.y), (E.r * 2.0) / 0.3 * TS); gr3.addColorStop(0, 'rgba(40,28,18,0.25)'); gr3.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr3; g.fillRect(0, 0, TS, TS)
  })
  // 喙（中线 V）：喙色 + 墨线（仓鸮 / 草鸮从额顶缺口一路画下来）
  {
    const B = f.beak, top = f.half[0][1] - 0.004, tipY = B.y - B.len * 1.06
    g.fillStyle = B.color; g.beginPath(); g.moveTo(px(-B.w * 0.55), py(B.y + 0.002)); g.lineTo(px(0), py(top)); g.lineTo(px(B.w * 0.55), py(B.y + 0.002)); g.lineTo(px(0), py(tipY)); g.closePath(); g.fill()
    g.strokeStyle = C.ink; g.lineWidth = 2.2; g.lineJoin = 'round'
    g.beginPath(); g.moveTo(px(0), py(top)); g.quadraticCurveTo(px(-B.w * 0.62), py(B.y - B.len * 0.2), px(0), py(tipY)); g.stroke()
    g.beginPath(); g.moveTo(px(0), py(top)); g.quadraticCurveTo(px(B.w * 0.62), py(B.y - B.len * 0.2), px(0), py(tipY)); g.stroke()
    // 鼻孔一点
    both((s) => { g.fillStyle = 'rgba(30,20,14,0.6)'; g.beginPath(); g.ellipse(px(s * B.w * 0.18), py(B.y - B.len * 0.12), 1.6, 2.6, 0, 0, Math.PI * 2); g.fill() })
  }
  g.restore()
  // 轮廓墨线（手绘：略抖、粗细变化）
  const op = outlinePts(P, 220)
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? 'rgba(20,14,10,0.35)' : C.ink; g.lineWidth = pass ? 1.6 : 3.4; g.lineJoin = 'round'
    g.beginPath()
    op.forEach(([x, y], k) => { const l = Math.hypot(x, y) || 1, j = (pass ? 0.0016 : 0.0006) * Math.sin(k * 0.7 + pass) - 0.0016; const X = px(x + (x / l) * j), Y = py(y + (y / l) * j); if (k) g.lineTo(X, Y); else g.moveTo(X, Y) })
    g.closePath(); g.stroke()
  }
  // 边缘内侧一圈短羽纹（皱领）
  for (let k = 0; k < op.length; k += 2) { const [x, y] = op[k]; stroke(g, x * (1 - 0.06), y * (1 - 0.06), x * (1 - 0.025), y * (1 - 0.025), 1, C.line) }
  // 耳簇羽纹（盘外上角）
  if (f.tufts) both((s) => { const T = f.tufts!; for (let k = 0; k < 40; k++) { const t = r(), x = s * (T.x + Math.sin(T.ang) * T.len * t) + (r() - 0.5) * T.w * 0.7 * (1 - t), y = T.y + Math.cos(T.ang) * T.len * t; stroke(g, x, y, x + s * Math.sin(T.ang) * 0.012, y + 0.014, 1.1, r() < 0.55 ? C.line : 'rgba(255,248,232,0.35)') } })
  // 喙条（左侧竖条，u = 截面角 0→2π：0 / 0.5 = 两侧最宽处画墨线，0.25 = 前棱、0.75 = 贴面的背面；v = 额顶 → 钩尖）
  {
    const B = f.beak, x0 = BEAK_U0 * TS - 2, w = BEAK_DU * TS + 4
    const gb = g.createLinearGradient(0, 0, 0, TS); gb.addColorStop(0, C.base); gb.addColorStop(0.35, B.color); gb.addColorStop(0.82, B.color); gb.addColorStop(1, '#8a7a62')
    g.fillStyle = gb; g.fillRect(x0, 0, w, TS)
    const col = (t: number) => BEAK_U0 * TS + BEAK_DU * TS * t
    // 背面（钩尖下面、贴面一侧）略暗
    const gs = g.createLinearGradient(col(0.5), 0, col(1), 0); gs.addColorStop(0, 'rgba(60,44,28,0)'); gs.addColorStop(0.5, 'rgba(60,44,28,0.3)'); gs.addColorStop(1, 'rgba(60,44,28,0)'); g.fillStyle = gs; g.fillRect(col(0.5), 0, col(1) - col(0.5), TS)
    for (let k = 0; k < 60; k++) { const yy = r() * TS; g.strokeStyle = 'rgba(120,96,64,0.18)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + w, yy + (r() - 0.5) * 4); g.stroke() }
    g.strokeStyle = C.ink; g.lineWidth = 2.2
    for (const t of [0, 0.5, 1]) { g.beginPath(); g.moveTo(col(t), 0); g.lineTo(col(t), TS); g.stroke() }
    g.strokeStyle = 'rgba(255,250,236,0.55)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(col(0.25), TS * 0.25); g.lineTo(col(0.25), TS); g.stroke()
  }
  // 侧壁（右下角素色釉边：比盘缘略深 + 几道横向细纹）
  {
    const x0 = WALL_U0 * TS - 3, y0 = (1 - WALL_V1) * TS - 3, w = WALL_DU * TS + 6, h = (WALL_V1 - WALL_V0) * TS + 6
    const gw = g.createLinearGradient(0, y0, 0, y0 + h); gw.addColorStop(0, C.edge); gw.addColorStop(1, '#a8957a'); g.fillStyle = gw; g.fillRect(x0, y0, w, h)
    for (let k = 0; k < 6; k++) { const yy = y0 + (k + 0.5) * h / 6; g.strokeStyle = 'rgba(110,88,62,0.25)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + w, yy); g.stroke() }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  return tex
}
function paintIris(i: number) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!, f = FACES[i]
  g.fillStyle = '#050404'; g.fillRect(0, 0, S, S)
  const dark = f.eyes.iris.toLowerCase() < '#200000'
  if (!dark) {
    const gr = g.createRadialGradient(S / 2, S / 2, S * 0.12, S / 2, S / 2, S * 0.36); gr.addColorStop(0, f.eyes.iris); gr.addColorStop(0.8, f.eyes.iris); gr.addColorStop(1, '#3a2408')
    g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); g.fill()
    for (let k = 0; k < 60; k++) { const a = (k / 60) * Math.PI * 2; g.strokeStyle = 'rgba(80,40,0,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * S * 0.18, S / 2 + Math.sin(a) * S * 0.18); g.lineTo(S / 2 + Math.cos(a) * S * 0.35, S / 2 + Math.sin(a) * S * 0.35); g.stroke() }
    g.fillStyle = '#050404'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.17, 0, Math.PI * 2); g.fill()
  } else {
    const gr = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.5); gr.addColorStop(0, '#0a0807'); gr.addColorStop(1, '#2a1d14'); g.fillStyle = gr; g.fillRect(0, 0, S, S)
  }
  // 高光
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(S * 0.38, S * 0.36, S * 0.07, S * 0.05, -0.5, 0, Math.PI * 2); g.fill()
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
// ---------- 材质（每张脸一套，懒加载缓存）----------
const matCache: Record<number, { disc: THREE.Material; eyes: THREE.Material }> = {}
/** 上釉感：在漫反射材质上加一道随视角的假高光（经典 Lambert 模式也有） */
function glaze(m: THREE.Material, k: number, pw: number) {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(normalize(vec3(0.35, 0.62, 0.7)) + Vv); float sp = pow(max(dot(normal, Hh), 0.0), ${pw.toFixed(1)}); totalEmissiveRadiance += ${k.toFixed(3)} * sp * vec3(1.0, 0.97, 0.9); }`)
  }
  m.customProgramCacheKey = () => key + '|bellhop-glaze-' + k + '-' + pw
  return m
}
export function faceMaterials(i: number) {
  if (matCache[i]) return matCache[i]
  const tex = typeof document !== 'undefined' ? paintFace(i) : null, it = typeof document !== 'undefined' ? paintIris(i) : null
  const disc = glaze(litMaterial({ color: '#ffffff', map: tex ?? undefined, roughness: 0.32 }), 0.22, 28)
  const eyes = glaze(litMaterial({ color: '#ffffff', map: it ?? undefined, roughness: 0.08 }), 0.9, 60)
  shareHotelRigAssets({ disc, eyes })
  return (matCache[i] = { disc, eyes })
}
