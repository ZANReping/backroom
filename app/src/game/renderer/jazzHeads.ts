// [jazz] 爵士脑（Entity 197）四个乐器头（乐器就是头，没有脸）+ 参数化几何小工具（管道扫掠 / 车削 / 圆盘 / 方块 / 挤出 / 参数曲面）。
//   leader 小号：喇叭口朝前当脸（内壁越深越暗、喉部封黑），号管绕成小号形（上沿喇叭管 + 后弯管 + 前面主调音管弯 + 三个活塞套管的小弯管），
//          三个活塞竖在头顶（顶键珠母贝面，按键骨 valve1..3），颈部 = 吹口接管从领口伸出
//   sax    中音萨克斯：脖管从领口出、琴身向上弯、喇叭口朝前上；正面 6 个按键垫盖（珠母贝键面，骨 key1..6）、八度键（octKey）、
//          侧面 3 个侧键（keyS）+ 金属护罩、低音键大垫盖 + 护罩、键杆 / 立柱、背带环
//   bass   低音提琴：琴身压在两肩上（宽于肩，下沿垫两块皮垫，尾柱插进领口 + 皮颈托 = 颈部的支撑感），f 孔 / 琴马像五官（f 孔在着色器里画），
//          云杉面板 + 枫木侧背板清漆木纹、镶线、乌木指板 / 拉弦板、琴颈、弦轴箱 + 金属弦轴、卷轴；四根弦（骨 str1..4，帐篷形权重）
//   drum   军鼓：鼓皮朝前（白色磨砂鼓皮，骨 drumHead）、镀铬鼓圈 + 爪钩、8 个张力座 + 16 根张力螺丝、响弦开关；
//          头顶两侧各一片镲（青铜车纹，骨 cymL / cymR，毛毡垫 + 蝶形螺母）、镲杆；颈部 = 镀铬支架 + 夹座
// 坐标：传入 head 骨原点 H（模型空间），所有部件 = H + 局部偏移；局部轴与模型轴同向（+Z 正面）。
import { add, cross, dot, lenv, nrm, rot, scl, sub, W4, type JazzRigDef, type V3, TRUMPET, SAX, BASS, BASS_TOPZ, SNARE, saxAxis, saxKeyPos, bassStringEnds } from './jazzRig'
import { MAT, C, mixc, mulc } from './jazzBody'
import * as THREE from 'three'

// ======================================================================
// 顶点块 + 几何小工具
// ======================================================================
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
export class Chunk {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; mat: number[] = []; rm: number[] = []; uv: number[] = []; si: number[] = []; sw: number[] = []; idx: number[] = []
  get n() { return this.pos.length / 3 }
  /** c = sRGB 颜色；mat 材质号；ex 附加（木纹：离边距离 / 编织：股数）；u,v 材质坐标 */
  vert(p: ArrayLike<number>, n: ArrayLike<number>, c: number[], rough: number, metal: number, mat: number, ex: number, w: W4, ao = 1, u = 0, v = 0) {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2])
    this.col.push(lin(c[0]) * ao, lin(c[1]) * ao, lin(c[2]) * ao); this.mat.push(mat, ex); this.rm.push(rough, metal); this.uv.push(u, v)
    this.si.push(w.i[0], w.i[1], w.i[2], w.i[3]); this.sw.push(w.w[0], w.w[1], w.w[2], w.w[3])
  }
}
export type WFn = (p: V3, acc: W4, u: number) => void
export interface VOpt { col: number[] | ((p: V3, u: number, v: number) => number[]); rough: number; metal?: number; mat: number; ex?: number; w: WFn; fallback: number; ao?: number }
const colOf = (o: VOpt, p: V3, u: number, v: number) => (typeof o.col === 'function' ? o.col(p, u, v) : o.col)
const _w = new W4()
function V(ch: Chunk, p: V3, n: V3, o: VOpt, u: number, v: number, ao = 1) {
  o.w(p, _w.reset(), u); _w.finish(o.fallback)
  ch.vert(p, n, colOf(o, p, u, v), o.rough, o.metal ?? 0, o.mat, o.ex ?? 0, _w, ao * (o.ao ?? 1), u, v)
}
/** 穿过控制点的平滑曲线（Catmull-Rom，每段 n 个采样） */
export function catmull(P: V3[], n: number): V3[] {
  const out: V3[] = []
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)]
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t
      out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)) as V3)
    }
  }
  out.push(P[P.length - 1])
  return out
}
/** 半径同时插值的平滑曲线 */
export function catmullR(P: V3[], R: number[], n: number): { pts: V3[]; r: number[] } {
  const pts = catmull(P, n), r: number[] = []
  for (let i = 0; i < pts.length; i++) { const f = i / n, k = Math.min(R.length - 2, Math.floor(f)), t = f - k; r.push(R[k] + (R[k + 1] - R[k]) * (Math.min(1, t))) }
  return { pts, r }
}
/** 管道扫掠（平行移动标架）。rad 可逐点；caps 封口；ring 闭合曲线 */
export function tube(ch: Chunk, pts: V3[], rad: number | number[], seg: number, o: VOpt, caps = true, ring = false) {
  const N = pts.length, base = ch.n
  const R = (k: number) => (typeof rad === 'number' ? rad : rad[k])
  const T: V3[] = pts.map((_, k) => nrm(ring ? sub(pts[(k + 1) % N], pts[(k - 1 + N) % N]) : sub(pts[Math.min(N - 1, k + 1)], pts[Math.max(0, k - 1)])))
  let ref: V3 = Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  let U = nrm(cross(T[0], ref))
  let len = 0
  for (let k = 0; k < N; k++) {
    if (k > 0) {
      len += lenv(sub(pts[k], pts[k - 1]))
      const ax = cross(T[k - 1], T[k]), s = lenv(ax)
      if (s > 1e-6) U = nrm(rot(U, scl(ax, 1 / s), Math.asin(Math.min(1, s)) * (dot(T[k - 1], T[k]) < 0 ? -1 : 1)))
      U = nrm(sub(U, scl(T[k], dot(U, T[k]))))
    }
    const W = cross(T[k], U)
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, d = add(scl(U, Math.cos(a)), scl(W, Math.sin(a)))
      V(ch, add(pts[k], scl(d, R(k))), d, o, len, j / seg)
    }
  }
  const rows = ring ? N : N - 1
  for (let k = 0; k < rows; k++) for (let j = 0; j < seg; j++) {
    const k2 = (k + 1) % N
    const a = base + k * (seg + 1) + j, b = base + k2 * (seg + 1) + j
    ch.idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  if (caps && !ring) for (const [k, sg] of [[0, -1], [N - 1, 1]] as const) {
    const c = ch.n, n = scl(T[k], sg)
    V(ch, pts[k], n, o, 0, 0)
    for (let j = 0; j <= seg; j++) V(ch, ch.pos.slice((base + k * (seg + 1) + j) * 3, (base + k * (seg + 1) + j) * 3 + 3) as unknown as V3, n, o, 0, j / seg)
    for (let j = 0; j < seg; j++) { if (sg > 0) ch.idx.push(c, c + 1 + j, c + 2 + j); else ch.idx.push(c, c + 2 + j, c + 1 + j) }
  }
}
/** 车削：轴原点 O、轴向 A，profile [r, h]（h 沿轴），法线朝外（inward 则朝内并反绕向） */
export function lathe(ch: Chunk, O: V3, A: V3, prof: [number, number][], seg: number, o: VOpt, inward = false, ref0?: V3) {
  A = nrm(A)
  const ref: V3 = ref0 ?? (Math.abs(A[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1])
  const U = nrm(cross(A, ref)), W = cross(A, U), base = ch.n
  const M = prof.length
  for (let i = 0; i < M; i++) {
    const [r, h] = prof[i], [r0, h0] = prof[Math.max(0, i - 1)], [r1, h1] = prof[Math.min(M - 1, i + 1)]
    const dr = r1 - r0, dh = h1 - h0, L = Math.hypot(dr, dh) || 1
    const nr = dh / L, nh = -dr / L // 外法线（径向 / 轴向分量）
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, d = add(scl(U, Math.cos(a)), scl(W, Math.sin(a)))
      const p = add(O, add(scl(d, r), scl(A, h)))
      let n = nrm(add(scl(d, nr), scl(A, nh)))
      if (inward) n = scl(n, -1)
      V(ch, p, n, o, r, j / seg)
    }
  }
  for (let i = 0; i < M - 1; i++) for (let j = 0; j < seg; j++) {
    const a = base + i * (seg + 1) + j, b = a + seg + 1
    if (!inward) ch.idx.push(a, a + 1, b, b, a + 1, b + 1); else ch.idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
}
/** 圆盘 / 圆环（法线 n） */
export function disc(ch: Chunk, c: V3, n: V3, r: number, seg: number, o: VOpt, r0 = 0) {
  n = nrm(n)
  const U = nrm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), W = cross(n, U), base = ch.n
  for (const rr of [r0, r]) for (let j = 0; j <= seg; j++) { const a = (j / seg) * Math.PI * 2; V(ch, add(c, add(scl(U, Math.cos(a) * rr), scl(W, Math.sin(a) * rr))), n, o, rr, j / seg) }
  for (let j = 0; j < seg; j++) { const a = base + j, b = base + seg + 1 + j; ch.idx.push(a, b, a + 1, a + 1, b, b + 1) }
}
/** 方块（中心 c、三根单位轴 + 半尺寸） */
export function box(ch: Chunk, c: V3, ax: V3, ay: V3, az: V3, hx: number, hy: number, hz: number, o: VOpt) {
  const F: [V3, V3, V3, number, number, number][] = [[ax, ay, az, hx, hy, hz], [scl(ax, -1), az, ay, hx, hz, hy], [ay, az, ax, hy, hz, hx], [scl(ay, -1), ax, az, hy, hx, hz], [az, ax, ay, hz, hx, hy], [scl(az, -1), ay, ax, hz, hy, hx]]
  for (const [n, u, v, hn, hu, hv] of F) {
    const b = ch.n, pc = add(c, scl(n, hn))
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) V(ch, add(pc, add(scl(u, su * hu), scl(v, sv * hv))), n, o, su, sv)
    const nn = cross(u, v)
    if (dot(nn, n) > 0) ch.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else ch.idx.push(b, b + 2, b + 1, b, b + 3, b + 2)
  }
}
/** 挤出多边形（局部 2D 坐标 → O + x·ex + y·ey，厚度沿 ez 对称） */
export function extrude(ch: Chunk, poly: [number, number][], O: V3, ex: V3, ey: V3, ez: V3, th: number, o: VOpt) {
  const P = (x: number, y: number, s: number) => add(O, add(add(scl(ex, x), scl(ey, y)), scl(ez, s * th * 0.5)))
  const tri = THREE.ShapeUtils.triangulateShape(poly.map(([x, y]) => new THREE.Vector2(x, y)), [])
  for (const s of [1, -1]) {
    const b = ch.n, n = scl(ez, s)
    for (const [x, y] of poly) V(ch, P(x, y, s), n, o, x, y)
    const flip = (s > 0) !== (dot(cross(ex, ey), ez) > 0)
    for (const t of tri) { if (!flip) ch.idx.push(b + t[0], b + t[1], b + t[2]); else ch.idx.push(b + t[0], b + t[2], b + t[1]) }
  }
  const M = poly.length
  const area = poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % M]; return s + x * y2 - x2 * y }, 0)
  for (let i = 0; i < M; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % M]
    const ex2 = nrm(sub(P(x1, y1, 0), P(x0, y0, 0)))
    let n = nrm(cross(ex2, ez)); if (area < 0) n = scl(n, -1)
    const b = ch.n
    for (const [x, y, s] of [[x0, y0, 1], [x1, y1, 1], [x1, y1, -1], [x0, y0, -1]] as const) V(ch, P(x, y, s), n, o, x, y)
    const nn = cross(sub(P(x1, y1, 1), P(x0, y0, 1)), sub(P(x0, y0, -1), P(x0, y0, 1)))
    if (dot(nn, n) > 0) ch.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else ch.idx.push(b, b + 2, b + 1, b, b + 3, b + 2)
  }
}
/** 参数曲面（u, v ∈ [0,1]），数值法线；flip 反向 */
export function surf(ch: Chunk, P: (u: number, v: number) => V3, nu: number, nv: number, o: VOpt, flip = false, uvF?: (u: number, v: number, p: V3) => [number, number, number]) {
  const base = ch.n, e = 1e-3
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv, p = P(u, v)
    const du = sub(P(Math.min(1, u + e), v), P(Math.max(0, u - e), v)), dv = sub(P(u, Math.min(1, v + e)), P(u, Math.max(0, v - e)))
    let n = nrm(cross(du, dv)); if (flip) n = scl(n, -1)
    if (uvF) { const [a, b, ex] = uvF(u, v, p); const o2 = { ...o, ex }; V(ch, p, n, o2, a, b) } else V(ch, p, n, o, u, v)
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = base + j * (nu + 1) + i, b = a + nu + 1
    if (!flip) ch.idx.push(a, a + 1, b, b, a + 1, b + 1); else ch.idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
}
/** 球 / 椭球（局部轴） */
export function ellipsoid(ch: Chunk, c: V3, ax: V3, ay: V3, az: V3, rx: number, ry: number, rz: number, nu: number, nv: number, o: VOpt) {
  surf(ch, (u, v) => { const th = u * Math.PI * 2, ph = (v - 0.5) * Math.PI; return add(c, add(add(scl(ax, rx * Math.cos(ph) * Math.cos(th)), scl(ay, ry * Math.sin(ph))), scl(az, rz * Math.cos(ph) * Math.sin(th)))) }, nu, nv, o, true)
}
/** 金绳编织（3 股绞在一起）：沿 pts 扫掠，每股绕中心螺旋 */
export function braid(ch: Chunk, pts: V3[], r: number, strands: number, pitch: number, seg: number, o: VOpt, normalHint?: (k: number) => V3) {
  const N = pts.length
  const T: V3[] = pts.map((_, k) => nrm(sub(pts[Math.min(N - 1, k + 1)], pts[Math.max(0, k - 1)])))
  let len = 0
  const L: number[] = [0]; for (let k = 1; k < N; k++) L.push((len += lenv(sub(pts[k], pts[k - 1]))))
  for (let s = 0; s < strands; s++) {
    const out: V3[] = []
    for (let k = 0; k < N; k++) {
      const h = normalHint ? normalHint(k) : (Math.abs(T[k][1]) < 0.9 ? [0, 1, 0] as V3 : [1, 0, 0] as V3)
      const U = nrm(sub(h, scl(T[k], dot(h, T[k])))), W = cross(T[k], U)
      const a = (L[k] / pitch) * Math.PI * 2 + (s / strands) * Math.PI * 2
      out.push(add(pts[k], add(scl(U, Math.cos(a) * r * 0.62), scl(W, Math.sin(a) * r * 0.62))))
    }
    tube(ch, out, r * 0.55, seg, { ...o, ex: strands }, true)
  }
}

// ======================================================================
// 颜色
// ======================================================================
export const BRASS = C(0xd9aa48), BRASS_D = C(0xa77a26), CHROME = C(0xc9ced3), PEARL = C(0xeee6d8), DEEP = C(0x0b0806), FELT = C(0x7a2a24), EBONY = C(0x17110e)
const SPRUCE = C(0xb06a2a), MAPLE = C(0x7a3214), MAPLE_D = C(0x4e1e0b), LEATHER_B = C(0x3a2416), DRUMHEAD = C(0xf4f1ea), SHELL_RED = C(0x6e1418), BRONZE = C(0xc8913c)

export interface HeadCtx { ch: Chunk; R: JazzRigDef; lod: number; H: V3; q: number; seg: (n: number) => number; stats: Record<string, number> }
const L = (H: V3, p: V3): V3 => add(H, p)

// ======================================================================
// 小号头（头儿）
// ======================================================================
function trumpetHead(c: HeadCtx) {
  const { ch, R, H, seg, lod } = c, B = R.B, T = TRUMPET
  const headW: WFn = (_p, a) => { a.add(B.head, 1) }
  const brass: VOpt = { col: BRASS, rough: 0.25, metal: 1, mat: MAT.brass, w: headW, fallback: B.head }
  const brassD: VOpt = { ...brass, col: BRASS_D }
  const ts = seg(14)
  // —— 喇叭口：外壁（黄铜）+ 内壁（越深越暗）+ 卷边 ——
  const z0 = T.bellZ0, z1 = T.bellC[2], ax: V3 = nrm([0, 0.08, 1])
  const O = L(H, [0, T.tubeY, z0])
  const rings = Math.max(5, Math.round(20 * c.q))
  const prof: [number, number][] = [], profIn: [number, number][] = []
  for (let i = 0; i <= rings; i++) {
    const u = i / rings, h = (z1 - z0) * u
    const r = T.tubeR + (T.bellR - T.tubeR) * Math.pow(u, 3.6)
    prof.push([r, h]); profIn.push([Math.max(0.004, r - 0.0016), h])
  }
  const bs = seg(32)
  lathe(ch, O, ax, prof, bs, brass)
  lathe(ch, O, ax, profIn, bs, { ...brass, mat: MAT.deep, col: (p) => { const d = Math.max(0, z1 + H[2] - p[2]); return mixc(mulc(BRASS, 0.8), DEEP, Math.min(1, Math.pow(d / 0.1, 0.7))) } }, true)
  const mouth = add(O, scl(ax, z1 - z0))
  { const ring: V3[] = []; const U = nrm(cross(ax, [0, 1, 0])), W = cross(ax, U); for (let j = 0; j < bs; j++) { const a = (j / bs) * Math.PI * 2; ring.push(add(mouth, add(scl(U, Math.cos(a) * (T.bellR + 0.0012)), scl(W, Math.sin(a) * (T.bellR + 0.0012))))) } tube(ch, ring, 0.0036, seg(8), brass, false, true) }
  { const k = Math.round(rings * 0.5); disc(ch, add(O, scl(ax, prof[k][1])), scl(ax, 1), prof[k][0] - 0.0005, seg(16), { ...brass, col: DEEP, mat: MAT.deep }) } // 喉部封黑
  c.stats.bell = ch.idx.length / 3
  // —— 喇叭管（上沿，接到后弯管）+ 后弯管 + 下沿管（进第 1 活塞）——
  const zb = -0.13, yU = T.tubeY, yD = 0.078, rb = (yU - yD) / 2
  const bow: V3[] = [[0, yU, z0 + 0.004], [0, yU, -0.04], [0, yU, zb + 0.01]]
  for (let k = 1; k < 10; k++) { const a = (k / 10) * Math.PI; bow.push([0, yU - rb + rb * Math.cos(a), zb - rb * Math.sin(a) + 0.0]) }
  bow.push([0, yD, zb + 0.01], [0, yD, -0.05], [0, yD, T.valveZ[0]])
  tube(ch, catmull(bow.map((p) => L(H, p)), 2), T.tubeR, ts, brass, false)
  // —— 颈 = 吹口接管：从领口伸出，向前上弯进前面的主调音管弯，再回第 3 活塞 ——
  const lp = catmullR([[0, -0.075, 0.006], [0, -0.03, 0.008], [0, 0.012, 0.018], [0, 0.048, 0.06], [0, 0.074, 0.112], [0, 0.088, 0.146], [0, 0.104, 0.156], [0, 0.112, 0.14], [0, 0.112, 0.1], [0, 0.11, T.valveZ[2]]].map((p) => L(H, p as V3)),
    [0.03, 0.026, 0.016, 0.0118, 0.0115, 0.0115, 0.0115, 0.0115, 0.0115, 0.0115], 4)
  tube(ch, lp.pts, lp.r, ts, brass)
  // 领口里的法兰（颈托圈）
  lathe(ch, L(H, [0, -0.06, 0.006]), [0, 1, 0], [[0.03, -0.006], [0.044, -0.004], [0.046, 0.0], [0.04, 0.006], [0.031, 0.01]], seg(24), brassD)
  // 吹口接管上的装饰箍
  if (lod < 2) for (const y of [-0.035, 0.0]) lathe(ch, L(H, [0, y, 0.008 + 0.01 * (y + 0.035) / 0.035]), [0, 1, 0], [[0.029, -0.005], [0.032, -0.002], [0.032, 0.002], [0.029, 0.005]], seg(20), brass)
  // 调音管弯上的放水键
  if (lod < 2) box(ch, L(H, [0.0, 0.094, 0.162]), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.004, 0.003, 0.012, brassD)
  // —— 三个活塞套管 + 上下帽 ——
  for (let i = 0; i < 3; i++) {
    const z = T.valveZ[i]
    lathe(ch, L(H, [0, T.valveY0, z]), [0, 1, 0], [[0.0, -0.014], [0.012, -0.0135], [0.019, -0.01], [T.valveR + 0.0016, -0.006], [T.valveR + 0.0016, 0.0], [T.valveR, 0.002], [T.valveR, T.valveY1 - T.valveY0 - 0.002], [T.valveR + 0.0022, T.valveY1 - T.valveY0], [T.valveR + 0.0022, T.valveY1 - T.valveY0 + 0.01], [0.012, T.valveY1 - T.valveY0 + 0.012], [0.006, T.capY - T.valveY0]], seg(20), brass)
    // 活塞杆 + 顶键（珠母贝面）：挂 valve 骨
    const vb = B['valve' + (i + 1)]
    const vW: WFn = (_p, a) => { a.add(vb, 1) }
    const btnO: VOpt = { ...brass, w: vW, fallback: vb }
    tube(ch, [L(H, [0, T.capY - 0.004, z]), L(H, [0, T.btnY - 0.008, z])], 0.0042, seg(10), btnO)
    lathe(ch, L(H, [0, T.btnY - 0.009, z]), [0, 1, 0], [[0.004, 0], [0.0128, 0.001], [0.0136, 0.004], [0.0136, 0.0075], [0.0118, 0.008]], seg(20), btnO)
    disc(ch, L(H, [0, T.btnY - 0.0008, z]), [0, 1, 0], 0.0118, seg(20), { ...btnO, col: PEARL, mat: MAT.pearl, rough: 0.2, metal: 0 })
  }
  // —— 活塞套管的小弯管：第 1（左后）/ 第 2（左下短）/ 第 3（右前，带指环）——
  const slide = (pts: V3[], r = 0.0098) => tube(ch, catmull(pts.map((p) => L(H, p)), 4), r, seg(12), brass, true)
  slide([[0.0, 0.09, T.valveZ[0]], [0.026, 0.09, T.valveZ[0] - 0.01], [0.034, 0.09, -0.06], [0.034, 0.075, -0.082], [0.034, 0.06, -0.06], [0.026, 0.06, T.valveZ[0] - 0.01], [0.0, 0.065, T.valveZ[0]]])
  if (lod < 2) slide([[0.0, 0.07, T.valveZ[1]], [0.0, 0.035, T.valveZ[1] - 0.004], [0.0, 0.02, T.valveZ[1] + 0.012], [0.0, 0.035, T.valveZ[1] + 0.03], [0.0, 0.07, T.valveZ[2] - 0.012]], 0.0085)
  slide([[-0.0, 0.088, T.valveZ[2]], [-0.026, 0.088, T.valveZ[2] + 0.01], [-0.032, 0.088, 0.13], [-0.032, 0.07, 0.15], [-0.032, 0.054, 0.13], [-0.026, 0.06, T.valveZ[2] + 0.01], [0.0, 0.062, T.valveZ[2]]])
  // 第 3 弯管指环 + 吹口管上的小指钩
  if (lod < 2) { const ringP: V3[] = []; for (let j = 0; j < 16; j++) { const a = (j / 16) * Math.PI * 2; ringP.push(L(H, [-0.042 - 0.008 * Math.cos(a), 0.06 + 0.008 * Math.sin(a), 0.11])) } tube(ch, ringP, 0.0018, seg(6), brassD, false, true) }
  if (lod < 2) tube(ch, catmull([[0.0, 0.112, 0.12], [0.012, 0.124, 0.12], [0.02, 0.122, 0.108], [0.016, 0.114, 0.104]].map((p) => L(H, p as V3)), 3), 0.0022, seg(6), brassD)
  // 撑杆（喇叭管 ↔ 主调音管、上下管之间）
  if (lod < 2) for (const z of [0.115, -0.07]) tube(ch, [L(H, [0, yU - T.tubeR, z]), L(H, [0, z > 0 ? 0.112 : yD, z])], 0.0028, seg(6), brassD, true)
  // 套管之间的连接节（活塞之间的小管）
  if (lod < 2) for (let i = 0; i < 2; i++) tube(ch, [L(H, [0, 0.122, T.valveZ[i]]), L(H, [0, 0.122, T.valveZ[i + 1]])], 0.006, seg(8), brass, false)
}

// ======================================================================
// 萨克斯头
// ======================================================================
function saxHead(c: HeadCtx) {
  const { ch, R, H, seg, lod } = c, B = R.B
  const headW: WFn = (_p, a) => { a.add(B.head, 1) }
  const brass: VOpt = { col: BRASS, rough: 0.3, metal: 1, mat: MAT.brass, w: headW, fallback: B.head }
  const brassD: VOpt = { ...brass, col: BRASS_D }
  // 琴身：脖管 → 琴身锥管 → 向前上弯 → 喇叭口
  const P = SAX.path.map((p) => L(H, p))
  const body = catmullR(P, SAX.r, Math.max(3, Math.round(7 * c.q)))
  tube(ch, body.pts, body.r, seg(22), brass, false)
  const N = SAX.bellN, last = body.pts[body.pts.length - 1], r0 = body.r[body.r.length - 1]
  const prof: [number, number][] = [], profIn: [number, number][] = []
  const fr = Math.max(5, Math.round(10 * c.q))
  for (let i = 0; i <= fr; i++) { const u = i / fr, r = r0 + (SAX.bellR - r0) * Math.pow(u, 2.2), h = 0.03 * u; prof.push([r, h]); profIn.push([r - 0.0016, h]) }
  lathe(ch, last, N, prof, seg(36), brass)
  lathe(ch, last, N, profIn, seg(36), { ...brass, mat: MAT.deep, col: (p) => mixc(mulc(BRASS, 0.75), DEEP, Math.min(1, Math.max(0, 0.03 - dot(sub(p, last), N)) / 0.03 + 0.25)) }, true)
  const mouth = add(last, scl(N, 0.03))
  { const ring: V3[] = [], U = nrm(cross(N, [1, 0, 0])), W = cross(N, U), bs = seg(36); for (let j = 0; j < bs; j++) { const a = (j / bs) * Math.PI * 2; ring.push(add(mouth, add(scl(U, Math.cos(a) * (SAX.bellR + 0.0012)), scl(W, Math.sin(a) * (SAX.bellR + 0.0012))))) } tube(ch, ring, 0.0036, seg(8), brass, false, true) }
  disc(ch, sub(last, scl(N, 0.02)), N, r0 + 0.004, seg(16), { ...brass, col: DEEP, mat: MAT.deep })
  // 喇叭口上的雕花（着色器不做，几何上一圈细凸线）
  // 领口法兰 + 脖管箍
  lathe(ch, L(H, [0, -0.06, -0.012]), [0, 1, 0], [[0.016, -0.006], [0.042, -0.004], [0.044, 0.0], [0.036, 0.006], [0.016, 0.01]], seg(22), brassD)
  for (const t of [0.13, 0.2]) { const a = saxAxis(t); lathe(ch, L(H, a.p), a.tan, [[a.r + 0.0005, -0.004], [a.r + 0.0026, -0.002], [a.r + 0.0026, 0.002], [a.r + 0.0005, 0.004]], seg(18), brass) }
  // 八度键（脖管背面一根细杆 + 小垫盖）：挂 octKey
  {
    const ob = B.octKey, oW: WFn = (_p, a) => { a.add(ob, 1) }, oO: VOpt = { ...brass, w: oW, fallback: ob }
    const a0 = saxAxis(0.12), a1 = saxAxis(0.28)
    tube(ch, catmull([L(H, add(a0.p, [0, 0, -a0.r - 0.006])), L(H, add(saxAxis(0.2).p, [0, 0, -saxAxis(0.2).r - 0.008])), L(H, add(a1.p, [0, 0, -a1.r - 0.007]))], 4), 0.0022, seg(6), oO)
    disc(ch, L(H, add(a0.p, [0, 0, -a0.r - 0.0075])), [0, 0, -1], 0.0062, seg(12), oO)
    lathe(ch, L(H, add(a0.p, [0, 0, -a0.r - 0.002])), [0, 0, -1], [[0.0065, 0], [0.0065, 0.005]], seg(12), oO)
  }
  // 主按键 6 个：音孔烟囱 + 垫盖 + 珠母贝键面（挂 key1..6）
  for (let i = 0; i < 6; i++) {
    const kb = B['key' + (i + 1)], kW: WFn = (_p, a) => { a.add(kb, 1) }, kO: VOpt = { ...brass, w: kW, fallback: kb }
    const p = L(H, saxKeyPos(i)), a = saxAxis(0.3 + i * 0.075)
    const n: V3 = [0, 0, 1], base = add(L(H, a.p), [0, 0, a.r - 0.002])
    lathe(ch, base, n, [[0.0115, 0], [0.0115, 0.006]], seg(14), brassD) // 音孔烟囱
    const cupR = 0.0145 + i * 0.0006
    lathe(ch, sub(p, [0, 0, 0.0035]), n, [[cupR - 0.001, -0.002], [cupR, 0], [cupR, 0.004], [cupR - 0.0015, 0.0055], [0.006, 0.0062], [0, 0.0063]], seg(16), kO)
    // 键臂 → 侧面键杆
    tube(ch, [add(p, [0.0, 0, 0.002]), add(p, [0.022 + a.r * 0.4, 0, -a.r * 0.5])], 0.0021, seg(6), kO)
    // 珠母贝键面（拇 / 食 / 中 / 无名指按的位置：偏在垫盖上方）
    if (i !== 2 && i !== 5) { lathe(ch, add(p, [0, 0.0, 0.0035]), n, [[0.0075, 0], [0.0082, 0.0015], [0.0078, 0.0035]], seg(14), kO); disc(ch, add(p, [0, 0, 0.0071]), n, 0.0072, seg(14), { ...kO, col: PEARL, mat: MAT.pearl, rough: 0.2, metal: 0 }) }
  }
  // 侧面键杆 + 立柱（x+ 侧）
  {
    const pts: V3[] = []
    for (let t = 0.27; t <= 0.73; t += 0.04) { const a = saxAxis(t); pts.push(L(H, add(a.p, [a.r + 0.012, 0, a.r * 0.3]))) }
    tube(ch, pts, 0.0026, seg(8), brass, true)
    for (const t of [0.28, 0.5, 0.72]) { const a = saxAxis(t); tube(ch, [L(H, add(a.p, [a.r * 0.8, 0, a.r * 0.2])), L(H, add(a.p, [a.r + 0.012, 0, a.r * 0.3]))], 0.0032, seg(8), brassD, true) }
  }
  // 侧键 3 个（x+ 侧平键，挂 keyS）+ 护罩（弯金属条，挂头）
  {
    const sb = B.keyS, sW: WFn = (_p, a) => { a.add(sb, 1) }, sO: VOpt = { ...brass, w: sW, fallback: sb }
    for (let k = 0; k < 3; k++) {
      const a = saxAxis(0.36 + k * 0.06), p = L(H, add(a.p, [a.r + 0.006, 0, -0.004]))
      lathe(ch, p, [1, 0, 0], [[0.0105, 0], [0.0105, 0.004], [0.007, 0.0055], [0, 0.0058]], seg(12), sO)
      tube(ch, [add(p, [0.004, 0.0, 0]), add(p, [0.016, 0.004, 0.012])], 0.0024, seg(6), sO)
      box(ch, add(p, [0.018, 0.005, 0.016]), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.0022, 0.009, 0.006, { ...sO, col: PEARL, mat: MAT.pearl, metal: 0 })
    }
    if (lod < 2) {
      const a0 = saxAxis(0.33), a1 = saxAxis(0.5)
      const g: V3[] = [L(H, add(a0.p, [a0.r + 0.002, -0.004, -0.018])), L(H, add(a0.p, [a0.r + 0.026, 0.0, -0.012])), L(H, add(saxAxis(0.42).p, [saxAxis(0.42).r + 0.03, 0, -0.01])), L(H, add(a1.p, [a1.r + 0.026, 0, -0.012])), L(H, add(a1.p, [a1.r + 0.002, 0.004, -0.018]))]
      tube(ch, catmull(g, 5), 0.0022, seg(6), brass, true)
      for (const t of [0.39, 0.45]) { const a = saxAxis(t); tube(ch, [L(H, add(a.p, [a.r + 0.028, 0, -0.011])), L(H, add(a.p, [a.r + 0.028, 0, 0.008]))], 0.0016, seg(5), brass, true) }
    }
  }
  // 低音键大垫盖（x− 侧、喇叭口下方）+ 护罩
  for (let k = 0; k < 2; k++) {
    const a = saxAxis(0.8 + k * 0.08), n = nrm([-1, 0, 0.2]), p = L(H, add(a.p, scl(n, a.r + 0.004)))
    lathe(ch, sub(p, scl(n, 0.004)), n, [[0.0195, -0.002], [0.02, 0.0], [0.02, 0.004], [0.018, 0.0055], [0.008, 0.0063], [0, 0.0064]], seg(18), brass)
    if (lod < 2) {
      const g: V3[] = []; for (let j = 0; j <= 10; j++) { const t = (j / 10) * Math.PI, d = rot(nrm(cross(n, a.tan)), n, 0); g.push(add(add(p, scl(n, 0.016)), add(scl(d, Math.cos(t) * 0.026), scl(a.tan, Math.sin(t) * 0.014 - 0.007)))) }
      tube(ch, g, 0.0018, seg(5), brass, true)
    }
  }
  // 背带环（背面）
  { const a = saxAxis(0.42), ringP: V3[] = []; for (let j = 0; j < 14; j++) { const t = (j / 14) * Math.PI * 2; ringP.push(L(H, add(a.p, [0, 0.008 * Math.sin(t), -a.r - 0.012 - 0.006 * Math.cos(t)]))) } tube(ch, ringP, 0.0016, seg(5), brassD, false, true) }
}

// ======================================================================
// 低音提琴头
// ======================================================================
/** 琴身外形半宽（v ∈ [0,1] 自下而上）：下圆肩 / 中腰（C 形腰）/ 上斜肩（低音提琴特征） */
export function bassHalfW(v: number) {
  const se = (t: number, p: number) => (Math.abs(t) >= 1 ? 0 : Math.pow(1 - Math.pow(Math.abs(t), p), 1 / p))
  const lo = BASS.wLow * se((v - 0.27) / 0.27, 2.5)
  const upT = v < 0.79 ? (v - 0.79) / 0.21 : (v - 0.79) / 0.21
  let up = BASS.wUp * se(upT, v < 0.79 ? 2.4 : 1.55) // 上斜肩：顶部收得更尖（斜肩）
  up = Math.max(up, v > 0.9 ? 0.05 * (1 - (v - 0.9) / 0.1) + 0.03 : 0)
  const mid = v > 0.36 && v < 0.7 ? BASS.wWaist * (1 - 0.18 * Math.pow((v - 0.53) / 0.17, 2)) : 0
  const k = 0.012, smx = (a: number, b: number) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (a - b) / k)); return b + (a - b) * h + k * h * (1 - h) }
  return Math.max(0.0, smx(smx(lo, up), mid))
}
function bassHead(c: HeadCtx) {
  const { ch, R, H, seg, lod } = c, B = R.B, Bs = BASS
  const headW: WFn = (_p, a) => { a.add(B.head, 1) }
  const wood: VOpt = { col: MAPLE, rough: 0.35, mat: MAT.wood, w: headW, fallback: B.head }
  const ebony: VOpt = { col: EBONY, rough: 0.3, mat: MAT.ebony, w: headW, fallback: B.head }
  const chrome: VOpt = { col: CHROME, rough: 0.2, metal: 1, mat: MAT.chrome, w: headW, fallback: B.head }
  const y0 = Bs.y0, h = Bs.h, zc = Bs.z0
  const ribH = (v: number) => (Bs.rib * (1 - 0.35 * Math.pow(Math.max(0, v - 0.7) / 0.3, 1.2))) / 2
  const archF = (u: number, v: number) => Bs.arch * (1 - u * u) * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, v))), 0.6)
  const nu = Math.max(8, Math.round(22 * c.q)), nv = Math.max(12, Math.round(40 * c.q))
  const W = (v: number) => bassHalfW(v) + 0.004 // 面板比侧板宽 4 mm（出边）
  // 面板（云杉，f 孔 / 镶线在着色器里按 aUv = 面板坐标画）
  const topP = (u: number, v: number): V3 => { const uu = u * 2 - 1, vv = Math.min(1, Math.max(0, v)); return L(H, [uu * W(vv), y0 + vv * h, zc + ribH(vv) + 0.003 + archF(uu, vv)]) }
  const edgeD = (u: number, v: number) => { const uu = Math.abs(u * 2 - 1), vv = v; const dx = (1 - uu) * W(vv); const dy = Math.min(vv, 1 - vv) * h; return Math.min(dx, dy * 2.5) }
  surf(ch, topP, nu, nv, { ...wood, col: SPRUCE, mat: 16 }, false, (u, v, p) => [p[0] - H[0], p[1] - H[1] - y0, edgeD(u, v)])
  // 背板（枫木，近平）
  const backP = (u: number, v: number): V3 => { const uu = u * 2 - 1, vv = v; return L(H, [uu * W(vv), y0 + vv * h, zc - ribH(vv) - 0.003 - archF(uu, vv) * 0.3]) }
  surf(ch, backP, nu, nv, wood, true, (u, v, p) => [p[0] - H[0], p[1] - H[1] - y0, edgeD(u, v) + 0.02])
  // 面板 / 背板出边厚（边沿一圈）+ 侧板
  const ns = Math.max(24, Math.round(80 * c.q))
  const rimP = (side: number, t: number, z01: number): V3 => {
    // t ∈ [0,1] 绕一圈（自底中逆时针），z01 ∈ [0,1] 背 → 面
    const a = t * 2, sg = a < 1 ? 1 : -1, vv = a < 1 ? a : 2 - a
    const v = Math.min(0.999, Math.max(0.001, vv))
    const x = sg * bassHalfW(v) * side, z = zc + (z01 * 2 - 1) * ribH(v)
    return L(H, [x, y0 + v * h, z])
  }
  surf(ch, (u, v) => rimP(1, u, v), ns, 3, { ...wood, col: MAPLE_D }, false, (u, v, p) => [p[1] - H[1], p[2], 0.03 + 0 * u * v])
  // 面板 / 背板外沿（出边）封边：沿外形一圈薄带
  for (const front of [1, -1]) {
    surf(ch, (u, v) => {
      const a = u * 2, sg = a < 1 ? 1 : -1, vv = Math.min(0.999, Math.max(0.001, a < 1 ? a : 2 - a))
      const x = sg * (bassHalfW(vv) + 0.004 * v), z = zc + front * (ribH(vv) + 0.003 * (1 - v) + 0.0005)
      return L(H, [x, y0 + vv * h, z])
    }, ns, 1, { ...wood, col: front > 0 ? mulc(SPRUCE, 0.75) : MAPLE_D }, front < 0)
  }
  c.stats.bassBody = ch.idx.length / 3
  // 琴颈（枫木）+ 指板（乌木，从琴颈一直伸到面板中段上方）
  const neckY0 = y0 + h, neckY1 = neckY0 + Bs.neckL
  const topZ = BASS_TOPZ
  const fbZ = (y: number) => topZ + 0.03 + 0.018 * Math.max(0, Math.min(1, (neckY0 - y) / (h * 0.45)))
  const fbW = (y: number) => 0.018 + 0.016 * Math.max(0, Math.min(1, (neckY1 - y) / (Bs.neckL + h * 0.45)))
  // 琴颈：半圆截面，平面贴在指板底下，圆背朝后（根部加厚的琴踵接进琴身上沿）
  surf(ch, (u, v) => { const a = (u - 0.5) * Math.PI, y = neckY0 - 0.04 + v * (Bs.neckL + 0.04), w = fbW(y) * 0.92, dep = 0.03 + 0.03 * Math.pow(1 - v, 3); return L(H, [Math.sin(a) * w, y, fbZ(y) - 0.006 - Math.cos(a) * dep]) }, seg(12), 8, wood, true)
  const fbY0 = y0 + h * 0.55
  box(ch, L(H, [0, (fbY0 + neckY1) / 2, (fbZ(fbY0) + fbZ(neckY1)) / 2]), [1, 0, 0], nrm([0, neckY1 - fbY0, fbZ(neckY1) - fbZ(fbY0)]), nrm(cross([1, 0, 0], nrm([0, neckY1 - fbY0, fbZ(neckY1) - fbZ(fbY0)]))), (fbW(fbY0) + fbW(neckY1)) / 2, (neckY1 - fbY0) / 2, 0.006, ebony)
  // 上枕
  box(ch, L(H, [0, neckY1 + 0.002, fbZ(neckY1) + 0.006]), [1, 0, 0], [0, 1, 0], [0, 0, 1], fbW(neckY1), 0.003, 0.006, ebony)
  // 弦轴箱（开口箱）+ 金属弦轴（每侧 2 个，钥匙伸到两侧）+ 卷轴
  const pbY0 = neckY1, pbY1 = pbY0 + Bs.scrollH * 0.62, pbZ = topZ + 0.008
  for (const sg of [1, -1]) box(ch, L(H, [sg * 0.024, (pbY0 + pbY1) / 2, pbZ]), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.006, (pbY1 - pbY0) / 2, 0.026, wood)
  box(ch, L(H, [0, (pbY0 + pbY1) / 2, pbZ - 0.022]), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.03, (pbY1 - pbY0) / 2, 0.005, wood)
  box(ch, L(H, [0, (pbY0 + pbY1) / 2 - 0.004, pbZ - 0.005]), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.018, (pbY1 - pbY0) / 2 - 0.004, 0.012, { ...wood, col: mulc(MAPLE_D, 0.3) })
  for (let k = 0; k < 4; k++) {
    const sg = k % 2 ? -1 : 1, y = pbY0 + 0.022 + Math.floor(k / 2) * 0.042 + (sg < 0 ? 0.021 : 0)
    // 轴（穿过箱）+ 齿轮板 + 钥匙
    tube(ch, [L(H, [-0.03, y, pbZ]), L(H, [0.03, y, pbZ])], 0.0035, seg(8), chrome, true)
    box(ch, L(H, [sg * 0.034, y, pbZ - 0.004]), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.002, 0.02, 0.014, chrome)
    tube(ch, [L(H, [sg * 0.034, y, pbZ - 0.012]), L(H, [sg * 0.05, y, pbZ - 0.024])], 0.0025, seg(6), chrome, true)
    ellipsoid(ch, L(H, [sg * 0.058, y, pbZ - 0.03]), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.008, 0.012, 0.004, seg(10), seg(6), chrome)
  }
  // 卷轴：两侧涡卷（螺线管，半径渐小）+ 中脊
  {
    const sc0: V3 = [0, pbY1 + 0.02, pbZ - 0.004], turns = 1.6, n = Math.max(16, Math.round(40 * c.q))
    for (const sg of [1, -1]) {
      const pts: V3[] = [], rr: number[] = []
      for (let i = 0; i <= n; i++) { const t = i / n, a = -Math.PI / 2 + t * turns * Math.PI * 2, r = 0.032 * Math.pow(1 - t * 0.8, 1.2); pts.push(L(H, [sg * (0.016 - 0.006 * t), sc0[1] + Math.sin(a) * r * 0.9, sc0[2] + Math.cos(a) * r])); rr.push(0.009 * (1 - 0.55 * t)) }
      tube(ch, pts, rr, seg(10), wood, true)
    }
    ellipsoid(ch, L(H, sc0), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.012, 0.028, 0.03, seg(12), seg(8), wood)
    tube(ch, [L(H, [0, pbY1 - 0.01, pbZ - 0.005]), L(H, [0, sc0[1] - 0.012, sc0[2] - 0.015])], 0.014, seg(10), wood, true)
  }
  // 琴马（「鼻子」）：挤出的拱形（两脚 + 心形镂空简化为两个小窗）
  const bridgeY = y0 + h * 0.38
  {
    const poly: [number, number][] = [[-0.07, 0], [-0.05, 0], [-0.045, 0.012], [-0.02, 0.016], [-0.012, 0.004], [0.012, 0.004], [0.02, 0.016], [0.045, 0.012], [0.05, 0], [0.07, 0], [0.06, 0.02], [0.04, 0.05], [0.042, 0.072], [0.02, 0.078], [0, 0.079], [-0.02, 0.078], [-0.042, 0.072], [-0.04, 0.05], [-0.06, 0.02]]
    extrude(ch, poly, L(H, [0, bridgeY, topZ - 0.002]), [1, 0, 0], [0, 0.18, 0.984], [0, -0.984, 0.18], 0.007, { ...wood, col: C(0xd8b27a), mat: MAT.wood })
  }
  // 拉弦板（乌木）+ 尾绳 + 尾柱扣
  const tpY0 = y0 + h * 0.08, tpY1 = y0 + h * 0.27
  extrude(ch, [[-0.022, 0], [0.022, 0], [0.042, tpY1 - tpY0 - 0.01], [0.035, tpY1 - tpY0], [-0.035, tpY1 - tpY0], [-0.042, tpY1 - tpY0 - 0.01]], L(H, [0, tpY0, topZ + 0.03]), [1, 0, 0], nrm([0, 1, 0.12]), nrm([0, -0.12, 1]), 0.008, ebony)
  tube(ch, [L(H, [0, tpY0 + 0.004, topZ + 0.028]), L(H, [0, y0 + 0.02, topZ - 0.004]), L(H, [0, y0 + 0.004, zc + 0.01])], 0.003, seg(6), ebony, true)
  // 四根弦：拉弦板 → 琴马 → 上枕 → 弦轴；琴马到上枕之间按帐篷形挂 str 骨
  for (let i = 0; i < 4; i++) {
    const { a, b } = bassStringEnds(i), A = L(H, a), Bp = L(H, b)
    const sb = B['str' + (i + 1)], gauge = 0.0016 + 0.0004 * (3 - i)
    const tail = L(H, [(i - 1.5) * 0.016, tpY1 - 0.004, topZ + 0.036])
    const peg = L(H, [0, pbY0 + 0.022 + Math.floor(i / 2) * 0.042 + (i % 2 ? 0.021 : 0), pbZ])
    const ns2 = Math.max(6, Math.round(24 * c.q)), pts: V3[] = []
    for (let k = 0; k <= ns2; k++) pts.push(add(A, scl(sub(Bp, A), k / ns2)))
    const sW: WFn = (p, acc) => { const t = Math.max(0, Math.min(1, dot(sub(p, A), sub(Bp, A)) / dot(sub(Bp, A), sub(Bp, A)))); const k = Math.sin(Math.PI * t); acc.add(sb, k); acc.add(B.head, 1 - k) }
    const strO: VOpt = { col: i < 2 ? C(0xb9b2a5) : C(0x8f8a82), rough: 0.3, metal: 1, mat: MAT.chrome, w: sW, fallback: B.head }
    tube(ch, [tail, ...pts, peg], gauge, lod >= 2 ? 3 : 5, strO, false)
  }
  // 尾柱插进领口 + 皮颈托（支撑）+ 两块垫肩皮垫
  tube(ch, [L(H, [0, y0 + 0.01, zc]), L(H, [0, -0.11, zc])], 0.0065, seg(10), chrome, true)
  lathe(ch, L(H, [0, y0 - 0.012, zc]), [0, 1, 0], [[0.006, -0.002], [0.016, 0.0], [0.019, 0.01], [0.015, 0.016]], seg(14), ebony)
  const leather: VOpt = { col: LEATHER_B, rough: 0.55, mat: MAT.leather, w: headW, fallback: B.head }
  lathe(ch, L(H, [0, -0.09, zc - 0.004]), [0, 1, 0], [[0.04, 0.0], [0.05, 0.004], [0.052, 0.02], [0.05, 0.04], [0.044, 0.052], [0.03, 0.056], [0.008, 0.058]], seg(22), leather)
  for (const sg of [1, -1]) ellipsoid(ch, L(H, [sg * 0.17, y0 + 0.022 + 0.016, zc - 0.004]), nrm([1, sg * 0.3, 0]), nrm([-sg * 0.3, 1, 0]), [0, 0, 1], 0.075, 0.016, 0.07, seg(14), seg(8), leather)
}

// ======================================================================
// 鼓头（军鼓 + 两片镲）
// ======================================================================
function drumHead(c: HeadCtx) {
  const { ch, R, H, seg, lod } = c, B = R.B, S = SNARE
  const headW: WFn = (_p, a) => { a.add(B.head, 1) }
  const chrome: VOpt = { col: CHROME, rough: 0.18, metal: 1, mat: MAT.chrome, w: headW, fallback: B.head }
  const cen = L(H, S.c), Z: V3 = [0, 0, 1], zf = S.depth / 2
  // 鼓腔（酒红烤漆木腔，内壁暗）
  const ss = seg(48)
  lathe(ch, sub(cen, [0, 0, zf]), Z, [[S.r - 0.004, 0.006], [S.r, 0.012], [S.r, S.depth - 0.012], [S.r - 0.004, S.depth - 0.006]], ss, { col: SHELL_RED, rough: 0.15, mat: MAT.wood, ex: 1, w: headW, fallback: B.head })
  // 鼓皮（正面，白色磨砂；中心挂 drumHead 骨）+ 背面底皮
  const db = B.drumHead
  const dW: WFn = (p, a) => { const r = Math.hypot(p[0] - cen[0], p[1] - cen[1]) / S.r; const k = Math.max(0, 1 - r * r) ; a.add(db, k); a.add(B.head, 1 - k) }
  const rings = Math.max(3, Math.round(8 * c.q))
  for (let i = 0; i < rings; i++) disc(ch, add(cen, [0, 0, zf + 0.002]), Z, S.r * (i + 1) / rings, ss, { col: DRUMHEAD, rough: 0.7, mat: MAT.drumhead, w: dW, fallback: B.head }, S.r * i / rings)
  disc(ch, sub(cen, [0, 0, zf + 0.002]), [0, 0, -1], S.r, ss, { col: mulc(DRUMHEAD, 0.85), rough: 0.6, mat: MAT.drumhead, w: headW, fallback: B.head })
  // 鼓皮边圈（翻边）
  lathe(ch, add(cen, [0, 0, zf - 0.006]), Z, [[S.r + 0.001, 0], [S.r + 0.004, 0.004], [S.r + 0.003, 0.009], [S.r - 0.002, 0.009]], ss, { col: mulc(DRUMHEAD, 0.9), rough: 0.6, mat: MAT.drumhead, w: headW, fallback: B.head })
  // 前后鼓圈（镀铬，压边 + 爪钩）
  for (const sg of [1, -1]) {
    const ring: V3[] = []; for (let j = 0; j < ss; j++) { const a = (j / ss) * Math.PI * 2; ring.push(add(cen, [Math.cos(a) * (S.r + 0.008), Math.sin(a) * (S.r + 0.008), sg * (zf + 0.004)])) }
    tube(ch, ring, 0.0055, seg(8), chrome, false, true)
    lathe(ch, add(cen, [0, 0, sg * (zf - 0.006)]), Z, [[S.r + 0.004, 0], [S.r + 0.009, 0.0], [S.r + 0.009, 0.012], [S.r + 0.004, 0.012]], ss, chrome)
  }
  // 张力座 8 个 + 张力螺丝 16 根
  const nL = 8
  for (let k = 0; k < nL; k++) {
    const a = (k / nL) * Math.PI * 2 + Math.PI / nL, dir: V3 = [Math.cos(a), Math.sin(a), 0]
    const p = add(cen, scl(dir, S.r + 0.008))
    // 张力座：短胶囊
    tube(ch, catmullR([add(p, [0, 0, -0.03]), add(add(p, scl(dir, 0.008)), [0, 0, -0.018]), add(add(p, scl(dir, 0.01)), [0, 0, 0]), add(add(p, scl(dir, 0.008)), [0, 0, 0.018]), add(p, [0, 0, 0.03])], [0.004, 0.0075, 0.009, 0.0075, 0.004], 2).pts, catmullR([add(p, [0, 0, -0.03]), add(p, [0, 0, -0.018]), p, add(p, [0, 0, 0.018]), add(p, [0, 0, 0.03])], [0.004, 0.0075, 0.009, 0.0075, 0.004], 2).r, seg(10), chrome, true)
    if (lod < 2) for (const sg of [1, -1]) {
      const q0 = add(add(p, scl(dir, 0.012)), [0, 0, sg * 0.03]), q1 = add(add(p, scl(dir, 0.012)), [0, 0, sg * (zf + 0.012)])
      tube(ch, [q0, q1], 0.0022, seg(6), chrome, true)
      lathe(ch, q1, [0, 0, sg], [[0.0045, 0], [0.0045, 0.005], [0.002, 0.007]], seg(6), chrome)
    }
  }
  // 响弦开关（右侧）+ 背面响弦（几根细线）
  box(ch, add(cen, [-(S.r + 0.022), 0.0, 0.0]), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.01, 0.022, 0.016, chrome)
  box(ch, add(cen, [-(S.r + 0.034), 0.018, 0.004]), [1, 0, 0], nrm([0, 1, 0.4]), nrm([0, -0.4, 1]), 0.004, 0.02, 0.004, chrome)
  if (lod < 2) for (let k = -5; k <= 5; k++) tube(ch, [add(cen, [k * 0.008, -S.r * 0.8, -zf - 0.004]), add(cen, [k * 0.008, S.r * 0.8, -zf - 0.004])], 0.0009, 3, chrome, false)
  // 颈 = 镀铬支架：领口法兰 → 立杆 → 夹座（鼓腔底）
  lathe(ch, L(H, [0, -0.06, 0.0]), [0, 1, 0], [[0.012, -0.006], [0.042, -0.004], [0.044, 0.0], [0.034, 0.006], [0.012, 0.01]], seg(22), chrome)
  tube(ch, [L(H, [0, -0.08, 0.0]), L(H, [0, S.c[1] - S.r - 0.012, S.c[2] - 0.01])], 0.012, seg(12), chrome, true)
  box(ch, L(H, [0, S.c[1] - S.r - 0.004, S.c[2]]), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.03, 0.01, 0.04, chrome)
  lathe(ch, L(H, [0, 0.0, 0.0]), [0, 1, 0], [[0.016, -0.012], [0.019, -0.008], [0.019, 0.012], [0.016, 0.016]], seg(14), chrome)
  // 两片镲（挂 cymL / cymR）：杆从鼓腔顶两侧斜上，毛毡垫 + 蝶形螺母
  for (const sg of [1, -1]) {
    const cb = B[sg > 0 ? 'cymL' : 'cymR'], cW: WFn = (_p, a) => { a.add(cb, 1) }
    const cc = L(H, [sg * S.cymX, S.cymY, S.c[2] - 0.01])
    const n = nrm([sg * 0.42, 1, 0.28])
    const base = add(cen, [sg * S.r * 0.62, S.r * 0.78, -0.01])
    tube(ch, [base, sub(cc, scl(n, 0.006))], 0.0055, seg(8), chrome, true)
    box(ch, base, [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.012, 0.012, 0.02, chrome)
    const cr = S.cymR, nr = Math.max(4, Math.round(12 * c.q))
    const prof: [number, number][] = [], profB: [number, number][] = []
    for (let i = 0; i <= nr; i++) { const u = i / nr, r = 0.004 + (cr - 0.004) * u; const hh = u < 0.22 ? 0.018 * (1 - Math.pow(u / 0.22, 2)) + 0.006 : 0.006 * (1 - (u - 0.22) / 0.78) * 0.9 - 0.0006; prof.push([r, hh + 0.0008]); profB.push([r, hh - 0.0008]) }
    const cymO: VOpt = { col: BRONZE, rough: 0.3, metal: 1, mat: MAT.bronze, w: cW, fallback: cb }
    lathe(ch, cc, n, prof, seg(44), cymO)
    lathe(ch, cc, n, profB, seg(44), { ...cymO, col: mulc(BRONZE, 0.85) }, true)
    // 毛毡 + 螺母
    lathe(ch, add(cc, scl(n, 0.025)), n, [[0.004, 0], [0.013, 0.0], [0.013, 0.008], [0.004, 0.008]], seg(12), { col: FELT, rough: 0.95, mat: MAT.felt, w: cW, fallback: cb })
    lathe(ch, add(cc, scl(n, 0.033)), n, [[0.004, 0], [0.007, 0.0], [0.007, 0.007], [0.003, 0.009]], seg(8), { ...chrome, w: cW, fallback: cb })
    box(ch, add(cc, scl(n, 0.038)), nrm(cross(n, [0, 0, 1])), n, nrm(cross(nrm(cross(n, [0, 0, 1])), n)), 0.014, 0.004, 0.002, { ...chrome, w: cW, fallback: cb })
    tube(ch, [sub(cc, scl(n, 0.004)), add(cc, scl(n, 0.04))], 0.003, seg(6), { ...chrome, w: cW, fallback: cb }, true)
  }
}

/** 造某成员的乐器头，写进 ch；返回三角数 */
export function buildHead(ch: Chunk, R: JazzRigDef, lod: number, stats: Record<string, number>) {
  const q = [1, 0.5, 0.24][lod]
  const ctx: HeadCtx = { ch, R, lod, H: R.J.head, q, seg: (n: number) => Math.max(lod >= 2 ? 4 : 5, Math.round(n * q)), stats }
  const i0 = ch.idx.length
  if (R.who === 'leader') trumpetHead(ctx)
  else if (R.who === 'sax') saxHead(ctx)
  else if (R.who === 'bass') bassHead(ctx)
  else drumHead(ctx)
  return (ch.idx.length - i0) / 3
}
