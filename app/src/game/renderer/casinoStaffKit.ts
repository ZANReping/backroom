// [casino] 赌场员工建模小工具：参数曲面（surf）、椭球块（blob）、放样（loft 用 surf 写）、管道 / 车削（复用 jazzHeads）、自动蒙皮权重。
// 所有部件写进同一个 Chunk（jazzHeads.Chunk：位置 / 法线 / 颜色 / 材质号 / UV / 4 骨权重），最后按材质号分组成一个 SkinnedMesh。
// LOD：每个部件的分段数都乘 q（LOD0 1 / LOD1 0.56 / LOD2 0.3），三角形数约按 q² 缩放（≈ 1 : 1/3 : 1/10）。
import { Chunk, tube, lathe, disc, box, extrude, catmull, type VOpt, type WFn } from './jazzHeads'
import { W4 } from './conciergeRig'
import { add, cross, dot, nrm, rot, scl, sub, lenv, type V3 } from './conciergeRig'
import type { StaffRigDef } from './casinoStaffRig'
export { Chunk, tube, lathe, disc, box, extrude, catmull, W4, add, cross, dot, nrm, rot, scl, sub, lenv, type V3, type VOpt, type WFn }

/** 全局材质号（每个角色只用其中一部分；check 统计每人材质数） */
export const SM = { skin: 0, cloth: 1, patch: 2, wood: 3, metal: 4, ball: 5, dark: 6, fur: 7, velvet: 8, screen: 9, leather: 10, shell: 11, face: 12 } as const
export const SM_NAMES = ['skin', 'cloth', 'patch', 'wood', 'metal', 'ball', 'dark', 'fur', 'velvet', 'screen', 'leather', 'shell', 'face']
export const LOD_Q = [1, 0.55, 0.28]
/** 当前构建的 LOD（seam 等细节在 LOD1 去十字针脚、LOD2 整个省掉） */
export const KIT = { lod: 0 }

export const hx = (h: number | string): number[] => { const v = typeof h === 'string' ? parseInt(h.replace('#', ''), 16) : h; return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255] }
export const mixc = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
export const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
export const hash3 = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s) }
/** 3D 值噪声（0..1） */
export function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz)
  const L = (a: number, b: number, t: number) => a + (b - a) * t
  const h = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k)
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w)
}

// ---------- 自动蒙皮：到骨线段的距离，指数衰减（blend 越大关节越软），保留 4 根 ----------
export class Skin {
  R: StaffRigDef
  constructor(R: StaffRigDef) { this.R = R }
  idx(n: string) { const i = this.R.B[n]; if (i === undefined) throw new Error('no bone ' + n); return i }
  /** 刚性绑到一根骨 */
  rigid(n: string): WFn { const i = this.idx(n); return (_p, acc) => { acc.add(i, 1) } }
  /** 在候选骨之间按距离自动分配 */
  auto(names: string[], blend = 0.03): WFn {
    const ids = names.map((n) => this.idx(n)), segs = ids.map((i) => this.R.seg[i])
    return (p, acc) => {
      const d = segs.map((s) => { const ab = sub(s.b, s.a), L2 = dot(ab, ab) || 1e-9, t = clamp(dot(sub(p, s.a), ab) / L2); return lenv(sub(p, add(s.a, scl(ab, t)))) })
      const m = Math.min(...d)
      ids.forEach((i, k) => acc.add(i, Math.exp(-(d[k] - m) / blend)))
    }
  }
  fallback(n: string) { return this.idx(n) }
}

export interface SOpt {
  col: number[] | ((p: V3, u: number, v: number, n: V3) => number[]); mat: number; w: WFn; fb: number
  rough?: number; metal?: number; ao?: (p: V3, u: number, v: number) => number
  /** UV：默认 (u·su, v·sv)（米制尺度由调用方给） */
  su?: number; sv?: number; uv?: (u: number, v: number, p: V3) => [number, number]
  flip?: boolean; wrapU?: boolean; offset?: number
  /** 附加通道（aEx 属性）：壳体毛的层号 0..1 */
  ex?: number
}
const _w = new W4()
function push(ch: Chunk, p: V3, n: V3, o: SOpt, u: number, v: number) {
  o.w(p, _w.reset(), u); _w.finish(o.fb)
  const c = typeof o.col === 'function' ? o.col(p, u, v, n) : o.col
  const uv = o.uv ? o.uv(u, v, p) : [u * (o.su ?? 1), v * (o.sv ?? 1)]
  ch.vert(p, n, c, o.rough ?? 0.7, o.metal ?? 0, o.mat, o.ex ?? 0, _w, o.ao ? o.ao(p, u, v) : 1, uv[0], uv[1])
}
export type PS = (u: number, v: number) => V3
/** 参数曲面网格：u∈[0,1]（默认绕一圈闭合）、v∈[0,1]；法线 = ∂u × ∂v（flip 反向）；offset 沿法线外推 */
export function surf(ch: Chunk, S: PS, nu: number, nv: number, o: SOpt) {
  nu = Math.max(3, Math.round(nu)); nv = Math.max(1, Math.round(nv))
  const base = ch.n, e = 1e-3
  for (let j = 0; j <= nv; j++) {
    const v = j / nv
    for (let i = 0; i <= nu; i++) {
      const u = i / nu
      const p = S(u, v)
      const vv = clamp(v, e * 2, 1 - e * 2)
      const du = sub(S(u + e, vv), S(u - e, vv)), dv = sub(S(u, vv + e), S(u, vv - e))
      let n = cross(du, dv)
      if (lenv(n) < 1e-12) n = [0, 1, 0]
      n = nrm(n); if (o.flip) n = scl(n, -1)
      push(ch, o.offset ? add(p, scl(n, o.offset)) : p, n, o, u, v)
    }
  }
  const W = nu + 1
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = base + j * W + i, b = a + 1, c = a + W, d = c + 1
    if (!o.flip) ch.idx.push(a, b, c, b, d, c); else ch.idx.push(a, c, b, b, c, d)
  }
}
/** 椭球方向：lon a = 2πu（0 在 +Z、向 +X 转），lat 从 −π/2（v=0 底）到 +π/2（v=1 顶） */
export const sph = (u: number, v: number): V3 => { const a = u * Math.PI * 2, l = (v - 0.5) * Math.PI; return [Math.cos(l) * Math.sin(a), Math.sin(l), Math.cos(l) * Math.cos(a)] }
/** 局部基（ex,ey,ez）把局部向量转到模型空间 */
export interface Basis { x: V3; y: V3; z: V3 }
export const IB: Basis = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
export const toB = (B: Basis, d: V3): V3 => add(add(scl(B.x, d[0]), scl(B.y, d[1])), scl(B.z, d[2]))
export function basisFromZ(z: V3, up: V3 = [0, 1, 0]): Basis { z = nrm(z); let x = cross(up, z); if (lenv(x) < 1e-6) x = [1, 0, 0]; x = nrm(x); const y = cross(z, x); return { x, y, z } }
/** 椭球块：中心 c、半径 r、位移函数 disp(d 单位方向局部, u, v) → 半径倍数 */
export function blob(ch: Chunk, c: V3, r: V3, nu: number, nv: number, o: SOpt, disp?: (d: V3, u: number, v: number) => number, B: Basis = IB, v0 = 0, v1 = 1) {
  surf(ch, (u, v) => { const vv = v0 + (v1 - v0) * v, d = sph(u, vv), k = disp ? disp(d, u, vv) : 1; return add(c, toB(B, [d[0] * r[0] * k, d[1] * r[1] * k, d[2] * r[2] * k])) }, nu, nv, o)
}
/** 球（台球 / 眼球）：图集 UV（经纬展开到 tile），正面朝 B.z */
export function ballSphere(ch: Chunk, c: V3, r: number, nu: number, nv: number, o: SOpt, tile: [number, number, number, number], B: Basis = IB) {
  surf(ch, (u, v) => add(c, scl(toB(B, sph(u, v)), r)), nu, nv, { ...o, uv: (u, v) => [tile[0] + ((u + 0.5) % 1) * tile[2], tile[1] + v * tile[3]] })
}
/** 沿折线的管（半径数组可变），复用 jazzHeads.tube；每段采样按 q 缩放 */
export function pipe(ch: Chunk, P: V3[], R: number[], perSeg: number, seg: number, o: VOpt, caps = true) {
  const pts = catmull(P, Math.max(1, Math.round(perSeg)))
  const rad = pts.map((_, k) => { const f = (k / (pts.length - 1)) * (R.length - 1), i = Math.min(R.length - 2, Math.floor(f)); return R[i] + (R[i + 1] - R[i]) * (f - i) })
  tube(ch, pts, rad, Math.max(3, Math.round(seg)), o, caps)
}
/** SOpt → VOpt（jazzHeads 工具用） */
export const vo = (o: SOpt): VOpt => ({ col: typeof o.col === 'function' ? (p: V3, u: number, v: number) => (o.col as (p: V3, u: number, v: number, n: V3) => number[])(p, u, v, [0, 1, 0]) : o.col, rough: o.rough ?? 0.7, metal: o.metal ?? 0, mat: o.mat, w: o.w, fallback: o.fb })
/** 缝线：沿曲线每隔 step 放一个十字针脚（两根短管），曲面法线 nrmAt 决定针脚抬起方向 */
export function stitches(ch: Chunk, P: V3[], nrmAt: (p: V3) => V3, step: number, len: number, rad: number, o: VOpt, cross2 = true) {
  const pts = catmull(P, 8)
  let acc = 0
  for (let k = 1; k < pts.length; k++) {
    const d = lenv(sub(pts[k], pts[k - 1])); acc += d
    if (acc < step) continue
    acc = 0
    const p = pts[k], t = nrm(sub(pts[k], pts[k - 1])), n = nrmAt(p), b = nrm(cross(n, t))
    const lift = scl(n, rad * 0.6)
    const a1 = add(add(p, scl(b, len * 0.5)), lift), a2 = add(add(p, scl(b, -len * 0.5)), lift)
    tube(ch, [a1, add(scl(add(a1, a2), 0.5), scl(n, rad)), a2], rad, 3, o, false)
    if (cross2) { const c1 = add(add(p, scl(t, len * 0.3)), lift), c2 = add(add(p, scl(t, -len * 0.3)), lift); tube(ch, [c1, c2], rad * 0.9, 3, o, false) }
  }
  // 连续缝线主线（细）
  tube(ch, pts.map((p) => add(p, scl(nrmAt(p), rad * 0.4))), rad * 0.45, 3, o, false)
}

export function tris(ch: Chunk) { return ch.idx.length / 3 }

// ---------- 肢体管（surf 版：米制 UV，适合布料贴图）----------
export interface LimbOpt { ref?: V3; dens?: number }
/** 沿控制点平滑曲线扫掠；rad(u,v) 给半径（u 绕圈 0..1、v 沿长 0..1）。u=0 的缝在 ref 方向（默认身后 −Z） */
export function limb(ch: Chunk, P: V3[], rad: (u: number, v: number) => number, nA: number, nL: number, o: SOpt, lo: LimbOpt = {}) {
  const pts = catmull(P, 12), L: number[] = [0]
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + lenv(sub(pts[i], pts[i - 1])))
  const total = L[L.length - 1]
  const T = pts.map((_, k) => nrm(sub(pts[Math.min(pts.length - 1, k + 1)], pts[Math.max(0, k - 1)])))
  let ref = lo.ref ?? [0, 0, -1]
  if (Math.abs(dot(ref, T[0])) > 0.95) ref = [0, 1, 0]
  let N = nrm(sub(ref, scl(T[0], dot(ref, T[0]))))
  const Ns: V3[] = [N]
  for (let k = 1; k < pts.length; k++) {
    const ax = cross(T[k - 1], T[k]), s = lenv(ax)
    if (s > 1e-7) N = nrm(rot(N, scl(ax, 1 / s), Math.asin(Math.min(1, s))))
    N = nrm(sub(N, scl(T[k], dot(N, T[k])))); Ns.push(N)
  }
  const at = (v: number) => {
    const d = clamp(v) * total
    let i = 1; while (i < L.length - 1 && L[i] < d) i++
    const f = (d - L[i - 1]) / (L[i] - L[i - 1] || 1)
    const p = add(pts[i - 1], scl(sub(pts[i], pts[i - 1]), f)), t = nrm(add(scl(T[i - 1], 1 - f), scl(T[i], f))), n = nrm(add(scl(Ns[i - 1], 1 - f), scl(Ns[i], f)))
    return { p, t, n, b: cross(t, n) }
  }
  let rAvg = 0; for (let k = 0; k <= 8; k++) rAvg += rad(0.25, k / 8) / 9
  const S: PS = (u, v) => { const f = at(v), a = u * Math.PI * 2, r = rad(((u % 1) + 1) % 1, v); return add(f.p, scl(add(scl(f.n, Math.cos(a)), scl(f.b, Math.sin(a))), r)) }
  if (nA > 0) surf(ch, S, nA, nL, { su: Math.PI * 2 * rAvg, sv: total, ...o })
  return { total, at, S }
}
/** 端头圆角：v 在两端 e 长度内把半径按圆弧收到 0（e 为 v 比例） */
export const roundEnds = (v: number, e0: number, e1 = e0) => { if (v < e0) { const t = 1 - v / e0; return Math.sqrt(Math.max(0, 1 - t * t)) } if (v > 1 - e1) { const t = (v - 1 + e1) / e1; return Math.sqrt(Math.max(0, 1 - t * t)) } return 1 }

/** 曲面法线（数值） */
export function snrm(S: PS, u: number, v: number): V3 { const e = 1e-3, vv = clamp(v, 2e-3, 1 - 2e-3); return nrm(cross(sub(S(u + e, vv), S(u - e, vv)), sub(S(u, vv + e), S(u, vv - e)))) }
/** 贴在曲面 S 的 (u0..u1, v0..v1) 窗口上的补丁 / 贴花（沿法线外推 off）；UV 按底面参数 × (su, sv)，与底面贴图连续 */
export function patch(ch: Chunk, S: PS, u0: number, u1: number, v0: number, v1: number, nu: number, nv: number, o: SOpt, off: number, wob = 0) {
  const W = (u: number, v: number) => (wob ? wob * (Math.sin(u * 23.1 + v * 7.3) * 0.5 + Math.sin(u * 51.7 - v * 19.9) * 0.5) : 0)
  surf(ch, (u, v) => S(u0 + (u1 - u0) * (u + (v === 0 || v === 1 ? W(u, v) : 0)), v0 + (v1 - v0) * (v + (u <= 0 || u >= 1 ? W(v, u) : 0))), nu, nv, { ...o, offset: off, uv: (u, v) => [(u0 + (u1 - u0) * u) * (o.su ?? 1), (v0 + (v1 - v0) * v) * (o.sv ?? 1)] })
}
/** 沿曲面上一串 (u,v) 的缝线：主线 + 横跨针脚（十字） */
export function seam(ch: Chunk, S: PS, uvs: [number, number][], off: number, step: number, len: number, rad: number, o: VOpt, crossSt = true, mainLine = true) {
  if (KIT.lod >= 2) return
  if (KIT.lod === 1) { crossSt = false; step *= 1.6 }
  const P: V3[] = [], N: V3[] = []
  const dense: [number, number][] = []
  for (let i = 0; i < uvs.length - 1; i++) for (let k = 0; k < 10; k++) { const t = k / 10; dense.push([uvs[i][0] + (uvs[i + 1][0] - uvs[i][0]) * t, uvs[i][1] + (uvs[i + 1][1] - uvs[i][1]) * t]) }
  dense.push(uvs[uvs.length - 1])
  for (const [u, v] of dense) { const n = snrm(S, u, v); N.push(n); P.push(add(S(u, v), scl(n, off))) }
  if (mainLine) tube(ch, P, rad * 0.5, 3, o, false)
  let acc = step * 0.5
  for (let k = 1; k < P.length; k++) {
    acc += lenv(sub(P[k], P[k - 1])); if (acc < step) continue
    acc = 0
    const t = nrm(sub(P[k], P[k - 1])), n = N[k], b = nrm(cross(n, t)), p = add(P[k], scl(n, rad * 0.4))
    const a1 = add(p, scl(b, len * 0.5)), a2 = add(p, scl(b, -len * 0.5))
    tube(ch, [add(a1, scl(n, -rad)), add(scl(add(a1, a2), 0.5), scl(n, rad * 0.8)), add(a2, scl(n, -rad))], rad, 3, o, false)
    if (crossSt) { const c = scl(add(b, scl(t, 0.9)), 0.5); tube(ch, [add(p, scl(c, len * 0.45)), add(p, scl(c, -len * 0.45))], rad * 0.85, 3, o, false) }
  }
}

// ---------- 壳体毛 / 发片（shell fur）：底面 S 沿法线外推 layers 层，每层 ex = 层号（着色器按毛丝高度贴图逐层 alpha 裁剪）----------
//   len(u,v) 毛长（米）；droop 重力下垂（毛尖沿 −Y 偏移 droop×len×f²）；comb 可选梳理方向（模型空间，按 f² 偏移）
export function shellFur(ch: Chunk, S: PS, nu: number, nv: number, o: SOpt, layers: number, len: (u: number, v: number) => number, droop = 0.35, comb?: (p: V3, u: number, v: number) => V3) {
  if (KIT.lod >= 2) layers = Math.max(2, Math.round(layers * 0.4)); else if (KIT.lod === 1) layers = Math.max(3, Math.round(layers * 0.6))
  for (let i = 1; i <= layers; i++) {
    const f = i / layers
    surf(ch, (u, v) => {
      const p = S(u, v), n = snrm(S, u, v), L = len(((u % 1) + 1) % 1, v)
      let q = add(p, scl(n, L * f))
      q = add(q, [0, -droop * L * f * f, 0])
      if (comb) q = add(q, scl(comb(p, u, v), L * f * f))
      return q
    }, nu, nv, { ...o, mat: SM.shell, ex: f })
  }
}
/** 一组胡须 / 毛刺：沿方向的细锥管 */
export function bristle(ch: Chunk, base: V3, dir: V3, L: number, r0: number, sag: number, o: VOpt) {
  const d = nrm(dir), P: V3[] = []
  for (let k = 0; k <= 6; k++) { const t = k / 6; P.push(add(add(base, scl(d, L * t)), [0, -sag * L * t * t, 0])) }
  tube(ch, P, P.map((_, k) => r0 * (1 - 0.85 * (k / 6))), 4, o, false)
}
