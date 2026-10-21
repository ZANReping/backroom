// 死亡飞蛾（Entity 4）重制模型——第 1 阶段：静态建模（无动画、无 AI）。
// 依据中文维基 entity-4（DrAkimoto 重写版）与用户附图（卵 / 幼虫 / 普通飞蛾 / 禁卫级）。
//
// 四种形态共用一套构建器，各自一个 SkinnedMesh，最多 4 个材质组 = 最多 4 次绘制：
//   组 0 体表（胸/腹/头/足，Canvas 绒毛贴图 × 顶点色）
//   组 1 翅膀（Canvas 翅面图集：前翅=上半、后翅=下半；alphaTest 做出残破锯齿边缘与缘毛）
//   组 2 光泽件（复眼、单眼、颚、爪、幼虫头壳——低粗糙度）
//   组 3 毛（胸部绒毛、羽状触角的羽枝、幼虫中空刺毛：单三角形，双面）
//
// 尺寸（scale=1）：
//   雄性  翼展 0.34m，体长 0.10m（维基 40–50mm 在游戏里不可辨，放大约 2 倍；翼展按维基）
//   雌性  翼展 0.44m，体长 0.14m，胸腹粗壮、强颚 + 颚钳、腹末腐蚀腺与可伸缩产卵器
//   禁卫级 站姿约 0.75m（抬身威吓时触角顶约 1m），身体直径 0.17m，翼展 0.6m（半退化，竖举），8 条 0.73m 附肢
//   幼虫  体长 0.10m、直径 0.04m，背部 7cm 中空刺毛，银灰头壳 + 锯齿颚，3 对胸足 + 9 对腹足
//
// 朝向约定（与旧 mothMeshes 相同，renderer 的 facesX 列表不变）：+X 正面、+Y 向上。
//   飞行形态（雄/雌）原点 = 胸节中心；禁卫级与幼虫原点 = 地面投影点。
// 骨骼静止时全部为单位旋转，只有平移（第 2 阶段动画直接旋转骨骼）。骨骼名见 MOTH_BONE_NAMES。
//
// 贴图全部为运行时 Canvas 程序化生成（全部实例共享），无外部资源；Node 下（无 document）退化为纯顶点色。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { MothForm } from '../entities/types'
import { getMaterialMode, litMaterial, mulberry } from './shared'
import { installL0EnvironmentShader } from './l0EnvironmentShader'
import { installL1DynamicProbe } from './l1Probes'

type V3 = THREE.Vector3
type RGB = [number, number, number]
type Wt = [number, number, number, number, number, number, number, number]
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const smooth = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k) }
const hex = (h: string, k = 1): RGB => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k] }
const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const w1 = (b: number): Wt => [b, 0, 0, 0, 1, 0, 0, 0]
const w2 = (a: number, b: number, t: number): Wt => (t <= 0 ? w1(a) : t >= 1 ? w1(b) : [a, b, 0, 0, 1 - t, t, 0, 0])

// ============================================================================
// 几何累加器
// ============================================================================
interface Part { pos: number[]; nor: number[]; uv: number[]; col: number[]; si: number[]; sw: number[]; idx: number[] }
const newPart = (): Part => ({ pos: [], nor: [], uv: [], col: [], si: [], sw: [], idx: [] })
const GROUPS = 4
const G_BODY = 0, G_WING = 1, G_GLOSS = 2, G_HAIR = 3
class Acc {
  parts: Part[] = Array.from({ length: GROUPS }, newPart)
  add(group: number, src: Part) {
    const dst = this.parts[group], off = dst.pos.length / 3
    dst.pos.push(...src.pos); dst.nor.push(...src.nor); dst.uv.push(...src.uv); dst.col.push(...src.col); dst.si.push(...src.si); dst.sw.push(...src.sw)
    for (const k of src.idx) dst.idx.push(off + k)
  }
  build(): THREE.BufferGeometry {
    const geos: THREE.BufferGeometry[] = []
    for (const p of this.parts) {
      const g = new THREE.BufferGeometry()
      if (!p.pos.length) { // 空组也要占位，保持材质下标一致（一个退化三角形）
        p.pos.push(0, 0, 0, 0, 0, 0, 0, 0, 0); p.nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0); p.uv.push(0, 0, 0, 0, 0, 0); p.col.push(0, 0, 0, 0, 0, 0, 0, 0, 0)
        p.si.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); p.sw.push(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0); p.idx.push(0, 1, 2)
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2))
      g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3))
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(p.si, 4))
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(p.sw, 4))
      g.setIndex(p.idx)
      geos.push(g)
    }
    const merged = mergeGeometries(geos, true)!
    for (const g of geos) g.dispose()
    return merged
  }
}

interface Swept { part: Part; rings: number; cols: number; tan: V3[] }
/** 扫掠管体（平行移动标架），截面 sec(i, a) → [S 向, U 向] 偏移；a 从 -π/2（腹侧）开始一周。端点半径为 0 即闭合极点。 */
function sweep(path: V3[], cols: number, sec: (i: number, a: number) => [number, number], o: {
  uv?: (i: number, j: number) => [number, number]; col: (i: number, j: number, p: V3) => RGB; w: (i: number, j: number, p: V3) => Wt; up?: V3
}): Swept {
  const n = path.length - 1
  const T: V3[] = [], U: V3[] = [], S: V3[] = []
  for (let i = 0; i <= n; i++) T.push(path[Math.min(n, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize())
  const up = (o.up ?? V(0, 1, 0)).clone()
  let u = up.sub(T[0].clone().multiplyScalar(up.dot(T[0])))
  if (u.lengthSq() < 1e-8) u = V(1, 0, 0).sub(T[0].clone().multiplyScalar(T[0].x))
  u.normalize()
  for (let i = 0; i <= n; i++) {
    if (i > 0) { const ax = V(0, 0, 0).crossVectors(T[i - 1], T[i]); const s = ax.length(); if (s > 1e-6) u.applyAxisAngle(ax.normalize(), Math.atan2(s, T[i - 1].dot(T[i]))) }
    u.sub(T[i].clone().multiplyScalar(u.dot(T[i]))).normalize()
    U.push(u.clone()); S.push(V(0, 0, 0).crossVectors(u, T[i]).normalize())
  }
  const p = newPart(), radial: number[] = []
  for (let i = 0; i <= n; i++) for (let j = 0; j <= cols; j++) {
    const a = -Math.PI / 2 + (j / cols) * Math.PI * 2
    const [rs, ru] = sec(i, a)
    const q = path[i].clone().addScaledVector(S[i], rs).addScaledVector(U[i], ru)
    p.pos.push(q.x, q.y, q.z); radial.push(Math.hypot(rs, ru))
    const [uu, vv] = o.uv ? o.uv(i, j) : [j / cols, i / n]; p.uv.push(uu, vv)
    const c = o.col(i, j, q); p.col.push(c[0], c[1], c[2])
    const w = o.w(i, j, q); p.si.push(w[0], w[1], w[2], w[3]); p.sw.push(w[4], w[5], w[6], w[7])
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + cols + 1; p.idx.push(a, b, a + 1, b, b + 1, a + 1) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3)); g.setIndex(p.idx); g.computeVertexNormals()
  const nr = g.attributes.normal as THREE.BufferAttribute
  let dot = 0; const tmp = V(0, 0, 0)
  for (let i = 0; i <= n; i++) for (let j = 0; j <= cols; j++) {
    const k = i * (cols + 1) + j
    tmp.set(p.pos[k * 3], p.pos[k * 3 + 1], p.pos[k * 3 + 2]).sub(path[i])
    dot += tmp.x * nr.getX(k) + tmp.y * nr.getY(k) + tmp.z * nr.getZ(k)
  }
  if (dot < 0) {
    for (let k = 0; k < p.idx.length; k += 3) { const t = p.idx[k + 1]; p.idx[k + 1] = p.idx[k + 2]; p.idx[k + 2] = t }
    for (let k = 0; k < nr.count; k++) nr.setXYZ(k, -nr.getX(k), -nr.getY(k), -nr.getZ(k))
  }
  for (let i = 0; i <= n; i++) {
    const a = i * (cols + 1), b = a + cols
    let maxR = 0; for (let j = 0; j <= cols; j++) maxR = Math.max(maxR, radial[a + j])
    if (maxR < 1e-5) { const d = i === 0 ? T[0].clone().negate() : T[n].clone(); for (let j = 0; j <= cols; j++) nr.setXYZ(a + j, d.x, d.y, d.z); continue }
    tmp.set(nr.getX(a) + nr.getX(b), nr.getY(a) + nr.getY(b), nr.getZ(a) + nr.getZ(b)).normalize()
    nr.setXYZ(a, tmp.x, tmp.y, tmp.z); nr.setXYZ(b, tmp.x, tmp.y, tmp.z)
  }
  p.nor = Array.from(nr.array as Float32Array)
  return { part: p, rings: n + 1, cols, tan: T }
}

/** 沿扫掠体表面随机长毛（单三角形），复制附着点的顶点色与骨骼权重 */
function hairs(dst: Part, sw: Swept, R: () => number, count: number, i0: number, i1: number, len: [number, number], width: number, lean: number,
  color: (base: RGB, r: number) => RGB, filter?: (a: number, i: number) => boolean, curl = 0) {
  const p = sw.part, n = V(0, 0, 0), b = V(0, 0, 0), side = V(0, 0, 0), tip = V(0, 0, 0), mid = V(0, 0, 0)
  for (let k = 0; k < count; k++) {
    const i = Math.min(sw.rings - 1, Math.max(0, Math.floor(lerp(i0, i1 + 0.999, R()))))
    const j = Math.floor(R() * sw.cols), a = -Math.PI / 2 + (j / sw.cols) * Math.PI * 2
    if (filter && !filter(a, i)) continue
    const vi = i * (sw.cols + 1) + j
    b.set(p.pos[vi * 3], p.pos[vi * 3 + 1], p.pos[vi * 3 + 2]); n.set(p.nor[vi * 3], p.nor[vi * 3 + 1], p.nor[vi * 3 + 2])
    const t = sw.tan[i]
    side.crossVectors(n, t).normalize()
    const L = lerp(len[0], len[1], R())
    tip.copy(n).addScaledVector(t, lean + (R() - 0.5) * 0.45).addScaledVector(side, (R() - 0.5) * 0.6).normalize().multiplyScalar(L).add(b)
    const base = dst.pos.length / 3, c = color([p.col[vi * 3], p.col[vi * 3 + 1], p.col[vi * 3 + 2]], R())
    const wd = width * (0.7 + R() * 0.6)
    if (curl > 0) { // 两段式（中点外弯）：幼虫刺毛略弯
      mid.copy(b).lerp(tip, 0.5).addScaledVector(n, L * curl)
      const pts = [b.clone().addScaledVector(side, -wd), b.clone().addScaledVector(side, wd), mid.clone().addScaledVector(side, wd * 0.45), mid.clone().addScaledVector(side, -wd * 0.45), tip]
      for (const q of pts) pushV(dst, q, n, [p.uv[vi * 2], p.uv[vi * 2 + 1]], c, [p.si[vi * 4], p.si[vi * 4 + 1], p.si[vi * 4 + 2], p.si[vi * 4 + 3], p.sw[vi * 4], p.sw[vi * 4 + 1], p.sw[vi * 4 + 2], p.sw[vi * 4 + 3]])
      dst.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base + 3, base + 2, base + 4)
    } else {
      for (const q of [b.clone().addScaledVector(side, -wd), b.clone().addScaledVector(side, wd), tip])
        pushV(dst, q, n, [p.uv[vi * 2], p.uv[vi * 2 + 1]], c, [p.si[vi * 4], p.si[vi * 4 + 1], p.si[vi * 4 + 2], p.si[vi * 4 + 3], p.sw[vi * 4], p.sw[vi * 4 + 1], p.sw[vi * 4 + 2], p.sw[vi * 4 + 3]])
      dst.idx.push(base, base + 1, base + 2)
    }
  }
}
function pushV(p: Part, q: V3, n: V3, uv: [number, number], c: RGB, w: Wt) {
  p.pos.push(q.x, q.y, q.z); p.nor.push(n.x, n.y, n.z); p.uv.push(uv[0], uv[1]); p.col.push(c[0], c[1], c[2])
  p.si.push(w[0], w[1], w[2], w[3]); p.sw.push(w[4], w[5], w[6], w[7])
}
/** three 几何 → Part（单色、单骨骼） */
function fromGeo(src: THREE.BufferGeometry, m: THREE.Matrix4, color: RGB | ((p: V3, n: V3) => RGB), w: Wt): Part {
  const g = src.clone().applyMatrix4(m)
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute | undefined
  const p = newPart(), q = V(0, 0, 0), n = V(0, 0, 0)
  for (let i = 0; i < pos.count; i++) {
    q.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i)
    const c = typeof color === 'function' ? color(q, n) : color
    pushV(p, q, n, uv ? [uv.getX(i), uv.getY(i)] : [0.5, 0.5], c, w)
  }
  if (g.index) for (let i = 0; i < g.index.count; i++) p.idx.push(g.index.getX(i))
  else for (let i = 0; i < pos.count; i++) p.idx.push(i)
  g.dispose()
  return p
}
const ellipsoid = (c: V3, r: V3, q = new THREE.Quaternion(), ws = 12, hs = 8) => ({ geo: new THREE.SphereGeometry(1, ws, hs), m: new THREE.Matrix4().compose(c, q, r) })
/** 尖齿/爪（单三角形） */
function spike(p: Part, base: V3, dir: V3, side: V3, len: number, wid: number, c: RGB, w: Wt) {
  const tip = base.clone().addScaledVector(dir, len), nrm = V(0, 0, 0).crossVectors(side, dir).normalize(), k = p.pos.length / 3
  for (const q of [base.clone().addScaledVector(side, -wid), base.clone().addScaledVector(side, wid), tip]) pushV(p, q, nrm, [0.5, 0.5], c, w)
  p.idx.push(k, k + 1, k + 2)
}

// ============================================================================
// 骨架描述
// ============================================================================
class RigDesc {
  names: string[] = []; rest: V3[] = []; parent: number[] = []
  bone(name: string, p: V3, parent: number) { this.names.push(name); this.rest.push(p.clone()); this.parent.push(parent); return this.names.length - 1 }
}

// ============================================================================
// 程序贴图
// ============================================================================
let WING_TEX: THREE.CanvasTexture | null | undefined
/**
 * 翅面图集 512²：u = 翅基→翅尖（展向），v = 前缘→后缘（弦向）。上半 v∈[0,.5] = 前翅，下半 = 后翅。
 * 依附图：锈橙褐底色、波状暗褐中横带、浅黄褐亚缘带、翅基绒毛、暗色翅脉、眼斑；外缘 alpha 做出不规则缺刻与缘毛。
 */
function wingTexture(): THREE.CanvasTexture | null {
  if (WING_TEX !== undefined) return WING_TEX
  if (typeof document === 'undefined') return (WING_TEX = null)
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d'); if (!g) return (WING_TEX = null)
  const R = mulberry(0x4d07)
  const img = g.createImageData(S, S), d = img.data
  const nz = (x: number, y: number) => ((Math.imul(x + 17, 73856093) ^ Math.imul(y + 51, 19349663)) >>> 0) % 1021 / 1021
  const vnoise = (x: number, y: number) => { // 平滑值噪声
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
    const s = (t: number) => t * t * (3 - 2 * t)
    const a = nz(xi, yi), b = nz(xi + 1, yi), c = nz(xi, yi + 1), e = nz(xi + 1, yi + 1)
    return lerp(lerp(a, b, s(xf)), lerp(c, e, s(xf)), s(yf))
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hind = y >= S / 2, u = x / S, v = (y % (S / 2)) / (S / 2)
    // 底色：锈橙 → 翅基更暗、更褐
    const base = mixc(hex('#8c5630'), hex('#5e3820'), smooth(0.25, 0, u) * 0.8)
    let col = base
    // 鳞片颗粒 + 大尺度斑驳
    const grain = nz(x, y) * 0.16 + vnoise(x / 9, y / 9) * 0.2 + vnoise(x / 40, y / 40) * 0.22
    col = col.map((c) => c * (0.72 + grain)) as RGB
    // 波状中横带（暗褐），亚缘浅带（黄褐），外缘暗带
    const wav = Math.sin(v * 22 + (hind ? 1.3 : 0)) * 0.018 + Math.sin(v * 7) * 0.03
    const band = Math.exp(-Math.pow((u - 0.5 - wav) / 0.035, 2))
    const band2 = Math.exp(-Math.pow((u - 0.34 + wav * 0.6) / 0.022, 2)) * 0.6
    const pale = Math.exp(-Math.pow((u - 0.66 - wav * 1.4) / 0.05, 2))
    const outer = smooth(0.82, 0.97, Math.max(u, v * 0.98))
    col = mixc(col, hex('#3b1f10'), Math.max(band, band2) * 0.85)
    col = mixc(col, hex('#d6a865'), pale * 0.55)
    col = mixc(col, hex('#4a2a17'), outer * 0.6)
    // 翅基绒毛（浅黄褐细纹）
    const fluff = smooth(0.16, 0, u) * (0.5 + 0.5 * Math.sin(y * 1.7 + nz(x, y) * 3))
    col = mixc(col, hex('#c49a62'), fluff * 0.5)
    // 后翅内缘（v 大、u 小）更浅更绒
    if (hind) col = mixc(col, hex('#b98656'), smooth(0.55, 1, v) * smooth(0.5, 0, u) * 0.45)
    // alpha：外缘（u→1）与后缘（v→1）不规则缺刻 + 细缘毛
    const ragged = vnoise(x / 6, y / 3) * 0.035 + vnoise(x / 23, y / 15) * 0.05 + (nz(x, y >> 1) > 0.93 ? 0.012 : 0)
    const nick = vnoise(x / 30 + 7, y / 30) > 0.78 ? 0.06 : 0
    const edgeV = v - (0.955 - ragged - nick), edgeU = u - (0.965 - ragged * 0.8 - nick * 0.6)
    let a = 1
    if (edgeV > 0 || edgeU > 0) a = (nz(x * 3, y) > 0.6 && Math.max(edgeV, edgeU) < 0.02) ? 1 : 0 // 缘毛：稀疏细丝
    if (edgeV > -0.012 && edgeV <= 0) col = mixc(col, hex('#2c170c'), 0.6)
    const i = (y * S + x) * 4
    d[i] = Math.min(255, col[0] * 255); d[i + 1] = Math.min(255, col[1] * 255); d[i + 2] = Math.min(255, col[2] * 255); d[i + 3] = a * 255
  }
  g.putImageData(img, 0, 0)
  // 翅脉：自翅基放射，暗色主线 + 一侧细浅棱
  for (const half of [0, 1]) {
    const y0 = half * S / 2, H = S / 2
    for (let k = 0; k < 9; k++) {
      const vy = 0.06 + k * 0.105, ex = S * (0.86 + R() * 0.06)
      for (const [c, lw, dy] of [['rgba(48,24,12,0.75)', 2.2, 0], ['rgba(214,170,110,0.35)', 0.8, 2.2]] as const) {
        g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); g.moveTo(0, y0 + H * 0.12 + dy)
        g.bezierCurveTo(S * 0.18, y0 + H * (0.1 + vy * 0.35) + dy, S * 0.45, y0 + H * vy + dy, ex, y0 + H * Math.min(0.94, vy * 1.04) + dy)
        g.stroke()
      }
    }
    // 中室横脉
    g.strokeStyle = 'rgba(48,24,12,0.7)'; g.lineWidth = 2
    g.beginPath(); g.moveTo(S * 0.3, y0 + H * 0.12); g.quadraticCurveTo(S * 0.35, y0 + H * 0.4, S * 0.29, y0 + H * 0.66); g.stroke()
    // 眼斑：暗环 + 浅黄内环 + 半透亮斑（天蚕蛾式；禁卫级靠顶点色变灰）
    const ex = S * (half ? 0.4 : 0.36), ey = y0 + H * (half ? 0.48 : 0.42), r = S * (half ? 0.05 : 0.022)
    const rg = g.createRadialGradient(ex, ey, 0, ex, ey, r)
    rg.addColorStop(0, 'rgba(236,214,170,1)'); rg.addColorStop(0.28, 'rgba(236,214,170,1)'); rg.addColorStop(0.36, 'rgba(32,16,8,1)')
    rg.addColorStop(0.7, 'rgba(80,36,16,1)'); rg.addColorStop(0.82, 'rgba(214,170,104,1)'); rg.addColorStop(1, 'rgba(214,170,104,0)')
    g.fillStyle = rg; g.beginPath(); g.ellipse(ex, ey, r, r * 1.25, 0.3, 0, Math.PI * 2); g.fill()
    // 前翅顶角斑（白色楔斑）
    if (!half) { g.fillStyle = 'rgba(236,224,200,0.8)'; g.beginPath(); g.moveTo(S * 0.86, y0 + H * 0.05); g.lineTo(S * 0.93, y0 + H * 0.1); g.lineTo(S * 0.84, y0 + H * 0.16); g.fill() }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  return (WING_TEX = tex)
}

let FUR_TEX: THREE.CanvasTexture | null | undefined
/** 体表 256² 可平铺：细密绒毛笔触 + 环节暗沟（v 方向）+ 颗粒；灰阶，由顶点色上色 */
function furTexture(): THREE.CanvasTexture | null {
  if (FUR_TEX !== undefined) return FUR_TEX
  if (typeof document === 'undefined') return (FUR_TEX = null)
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d'); if (!g) return (FUR_TEX = null)
  const R = mulberry(0x4f0a)
  g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 2600; i++) {
    const x = R() * S, y = R() * S, l = 3 + R() * 7, a = Math.PI / 2 + (R() - 0.5) * 0.7, v = 120 + R() * 135
    g.strokeStyle = `rgba(${v},${v},${v},${0.35 + R() * 0.4})`; g.lineWidth = 0.6 + R() * 0.8
    for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke() }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return (FUR_TEX = tex)
}

// ============================================================================
// 形态构建
// ============================================================================
export interface MothGeometry { geo: THREE.BufferGeometry; tris: number; rig: RigDesc; form: MothForm }
const CACHE: Partial<Record<MothForm, MothGeometry>> = {}

/** 前/后翅平面（局部：翅基在原点，+Z 展向；x 前缘为正）。返回 [前缘 x, 后缘 x]（展向参数 u∈[0,1]） */
function forePlan(u: number, chord: number): [number, number] {
  const lead = chord * (0.18 + 0.35 * u - 0.06 * u * u) // 前缘外伸（镰刀形顶角向前）
  const trail = lead - chord * (0.42 + 0.62 * Math.sin(Math.PI * Math.min(1, u * 0.92 + 0.08)) ** 0.7) * (1 - 0.82 * smooth(0.82, 1, u))
  return [lead, trail]
}
function hindPlan(u: number, chord: number): [number, number] {
  const lead = chord * (0.05 + 0.18 * u - 0.15 * u * u)
  const trail = lead - chord * (0.55 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.05)) ** 0.6) * (1 - 0.85 * smooth(0.8, 1, u))
  return [lead, trail]
}

interface WingSpec { pitch?: number; hinge: V3; span: number; chord: number; hind: boolean; side: 1 | -1; root: number; tip: number; lift: number; sweepBack: number; tint: RGB; tail: number }
/** 翅膀网格：行=展向，列=弦向；绕翅基先「后掠」（绕 Y）再「上举」（绕 X）摆到静止姿态。权重自翅根骨 → 翅尖骨渐变。 */
function wing(acc: Acc, s: WingSpec) {
  const p = newPart(), rows = 16, cols = 8
  const plan = s.hind ? hindPlan : forePlan
  const qs = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -s.side * s.sweepBack)
  const ql = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -s.side * s.lift)
  const qp = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), s.pitch ?? 0)
  const q = ql.multiply(qs).multiply(qp)
  const pt = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(q).add(s.hinge)
  const pts: V3[] = []
  for (let r = 0; r <= rows; r++) {
    const u = r / rows, [le, te] = plan(u, s.chord)
    for (let c = 0; c <= cols; c++) {
      const v = c / cols, x = lerp(le, te, v)
      const y = Math.sin(v * Math.PI) * s.chord * 0.035 * (1 - u) - u * u * s.span * 0.04 // 弦向拱起 + 展向下垂
      const z = s.side * s.span * u
      const P = pt(x, y, z); pts.push(P)
      pushV(p, P, V(0, 1, 0), [u * 0.995 + 0.002, (s.hind ? 0.5 : 0) + v * 0.497], s.tint, w2(s.root, s.tip, smooth(0.25, 0.9, u)))
    }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const a = r * (cols + 1) + c, b = a + cols + 1; if (s.side > 0) p.idx.push(a, b, a + 1, b, b + 1, a + 1); else p.idx.push(a, a + 1, b, b, a + 1, b + 1) }
  // 后翅尾突（附图：后翅向后拖出的长尾）
  if (s.hind && s.tail > 0) {
    const u0 = 0.72, [, te] = plan(u0, s.chord), base = p.pos.length / 3, n = 12
    for (let k = 0; k <= n; k++) {
      const t = k / n, wid = s.chord * 0.13 * (1 - t * 0.55) * (t > 0.85 ? (1 - t) / 0.15 * 0.8 + 0.2 : 1)
      const cx = te + s.chord * 0.12 - s.tail * t, cz = s.side * (s.span * u0 + s.tail * (0.85 * t + 0.25 * t * t))
      const y = -t * t * s.tail * 0.12
      for (const side of [-1, 1]) pushV(p, pt(cx, y, cz + side * wid * 0.5 * s.side), V(0, 1, 0), [0.9 + t * 0.06, 0.5 + (side < 0 ? 0.62 : 0.8) * 0.497], s.tint, w1(s.tip))
    }
    for (let k = 0; k < n; k++) { const a = base + k * 2; if (s.side > 0) p.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else p.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  }
  // 法线
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3)); g.setIndex(p.idx); g.computeVertexNormals()
  p.nor = Array.from((g.attributes.normal as THREE.BufferAttribute).array as Float32Array)
  acc.add(G_WING, p)
  void pts
}

/** 分节附肢（足）：沿关节点折线扫掠，每段渐细，关节处略鼓；权重按段分配到对应骨骼 */
function limb(acc: Acc, R: () => number, joints: V3[], bones: number[], radius: number[], col: (t: number) => RGB, hairN = 0, hairLen = 0.01, hairCol?: RGB) {
  const path: V3[] = [], seg: number[] = [], tt: number[] = []
  const per = 5
  for (let k = 0; k < joints.length - 1; k++) for (let j = 0; j < per; j++) {
    const t = j / per; path.push(joints[k].clone().lerp(joints[k + 1], t)); seg.push(k); tt.push(t)
  }
  path.push(joints[joints.length - 1].clone()); seg.push(joints.length - 2); tt.push(1)
  const N = path.length - 1
  const sw = sweep(path, 6, (i, a) => {
    const k = seg[i], t = tt[i], r0 = radius[k], r1 = radius[k + 1] ?? radius[k] * 0.5
    let r = lerp(r0, r1, t) * (1 + 0.22 * Math.exp(-Math.pow(t / 0.12, 2)) + 0.12 * Math.exp(-Math.pow((t - 0.95) / 0.08, 2)))
    if (i === N) r = 0
    return [Math.cos(a) * r, Math.sin(a) * r]
  }, { col: (i) => col(i / N), w: (i) => { const k = seg[i], t = tt[i]; return t < 0.12 && k > 0 ? w2(bones[k - 1], bones[k], 0.5 + t / 0.24) : w1(bones[k]) }, uv: (i, j) => [j / 6, i / N * 3] })
  acc.add(G_BODY, sw.part)
  if (hairN > 0) { const hp = newPart(); hairs(hp, sw, R, hairN, 1, N - 2, [hairLen * 0.5, hairLen], hairLen * 0.06, 0.9, () => hairCol ?? [0.1, 0.08, 0.06]); acc.add(G_HAIR, hp) }
  return sw
}

/** 羽状触角：主干细管 + 两侧羽枝（毛组），权重 基部骨 → 端部骨 */
function antenna(acc: Acc, base: V3, dir: V3, upBend: V3, len: number, r0: number, barb: number, b0: number, b1: number, col: RGB, barbCol: RGB) {
  const N = 14, path: V3[] = []
  for (let i = 0; i <= N; i++) { const t = i / N; path.push(base.clone().addScaledVector(dir, len * t).addScaledVector(upBend, len * 0.28 * Math.sin(t * Math.PI * 0.8))) }
  const sw = sweep(path, 4, (i, a) => { const r = i === N ? 0 : r0 * (1 - 0.7 * i / N); return [Math.cos(a) * r, Math.sin(a) * r] }, { col: () => col, w: (i) => w2(b0, b1, i / N) })
  acc.add(G_BODY, sw.part)
  const hp = newPart(), side = V(0, 0, 0)
  for (let i = 1; i < N; i++) {
    const t = i / N, T = sw.tan[i], P = path[i]
    side.crossVectors(T, upBend).normalize()
    const L = barb * Math.sin(Math.PI * Math.min(1, t * 1.08)) * (1 - t * 0.25)
    for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) {
      const Q = P.clone().addScaledVector(T, (k / 3) * len / N)
      const tip = Q.clone().addScaledVector(side, sd * L).addScaledVector(T, L * 0.55).addScaledVector(upBend, -L * 0.2)
      const base0 = hp.pos.length / 3, wd = 0.0009, w = w2(b0, b1, t)
      pushV(hp, Q.clone().addScaledVector(T, -wd), upBend, [0.5, 0.5], barbCol, w)
      pushV(hp, Q.clone().addScaledVector(T, wd), upBend, [0.5, 0.5], barbCol, w)
      pushV(hp, tip, upBend, [0.5, 0.5], barbCol, w)
      hp.idx.push(base0, base0 + 1, base0 + 2)
    }
  }
  acc.add(G_HAIR, hp)
}

/** 复眼：半球 + 单眼。颜色深褐黑带暗红反光 */
function eyes(acc: Acc, head: V3, r: number, bHead: number, fwd: V3, up: V3, eyeR: number, spread = 0.75) {
  const side = V(0, 0, 0).crossVectors(fwd, up).normalize()
  const gl = newPart()
  const add = (p: Part) => { const off = gl.pos.length / 3; gl.pos.push(...p.pos); gl.nor.push(...p.nor); gl.uv.push(...p.uv); gl.col.push(...p.col); gl.si.push(...p.si); gl.sw.push(...p.sw); for (const k of p.idx) gl.idx.push(off + k) }
  for (const s of [1, -1]) {
    const c = head.clone().addScaledVector(side, s * r * spread).addScaledVector(fwd, r * 0.35).addScaledVector(up, r * 0.1)
    const e = ellipsoid(c, V(eyeR, eyeR * 1.1, eyeR), new THREE.Quaternion(), 14, 10)
    add(fromGeo(e.geo, e.m, (_q, n) => { const k = 0.5 + 0.5 * n.dot(up); return mixc(hex('#170a07'), hex('#5a2216'), k * 0.5) }, w1(bHead)))
    const oc = head.clone().addScaledVector(side, s * r * 0.32).addScaledVector(up, r * 0.86).addScaledVector(fwd, r * 0.15)
    const o = ellipsoid(oc, V(eyeR * 0.22, eyeR * 0.22, eyeR * 0.22), new THREE.Quaternion(), 6, 4)
    add(fromGeo(o.geo, o.m, hex('#0c0605'), w1(bHead)))
  }
  acc.add(G_GLOSS, gl)
}

// ---------------------------------------------------------------------------
// 雄 / 雌（飞行形态）
// ---------------------------------------------------------------------------
function buildFlyer(form: 'male' | 'female'): MothGeometry {
  const fem = form === 'female', K = fem ? 1.3 : 1 // 体型
  const R = mulberry(fem ? 0x4f11 : 0x4f12)
  const rig = new RigDesc(), acc = new Acc()
  const body = rig.bone('body', V(0, 0, 0), -1)
  const thorax = rig.bone('thorax', V(0, 0, 0), body)
  const head = rig.bone('head', V(0.032 * K, 0.003, 0), thorax)
  const abd0 = rig.bone('abd0', V(-0.024 * K, -0.002, 0), thorax)
  const abd1 = rig.bone('abd1', V(-0.046 * K, -0.006 * K, 0), abd0)
  const abd2 = rig.bone('abd2', V(-0.068 * K, -0.011 * K, 0), abd1)
  // 体色：雄性黄褐、雌性更深的锈褐（附图）
  const furA = fem ? hex('#8a5a32') : hex('#a37b4c'), furB = fem ? hex('#5a3620') : hex('#6e5030'), chit = hex('#2e1d12')
  // 胸：毛茸茸的卵形
  {
    const N = 14, x0 = -0.026 * K, x1 = 0.026 * K, path: V3[] = []
    for (let i = 0; i <= N; i++) path.push(V(lerp(x0, x1, i / N), 0.002 * Math.sin(i / N * Math.PI), 0))
    const sw = sweep(path, 14, (i, a) => { const t = i / N, r = Math.sin(Math.PI * t) ** 0.6 * 0.02 * K * (fem ? 1.08 : 1); return [Math.cos(a) * r * 1.05, Math.sin(a) * r * (Math.sin(a) > 0 ? 1.08 : 0.92)] },
      { col: (_i, j) => mixc(furB, furA, 0.5 + 0.5 * Math.sin(-Math.PI / 2 + j / 14 * Math.PI * 2)), w: (i) => w1(i / N > 0.8 ? head : thorax), uv: (i, j) => [j / 14 * 2, i / N] })
    acc.add(G_BODY, sw.part)
    const hp = newPart(); hairs(hp, sw, R, 1400, 1, N - 1, [0.004 * K, 0.009 * K], 0.0007 * K, -0.6, (c, r) => mixc(c, hex('#d8b47e'), r * 0.45)); acc.add(G_HAIR, hp)
  }
  // 腹：7 节，雌性更粗；节间暗沟
  {
    const N = 28, len = 0.072 * K, path: V3[] = []
    for (let i = 0; i <= N; i++) { const t = i / N; path.push(V(-0.018 * K - len * t, -0.004 * K - t * t * 0.012 * K, 0)) }
    const segs = 7
    const sw = sweep(path, 12, (i, a) => {
      const t = i / N, ridge = 1 - 0.1 * Math.pow(Math.abs(Math.sin(t * segs * Math.PI)), 0.4) * (t > 0.05 ? 1 : 0)
      const r = (t < 0.08 ? lerp(0.012, 0.016, t / 0.08) : lerp(0.016, 0.004, (t - 0.08) / 0.92) ** 0.9) * K * (fem ? 1.25 : 1) * ridge * (i === N ? 0 : 1)
      return [Math.cos(a) * r, Math.sin(a) * r * 0.92]
    }, { col: (i, j) => { const t = i / N, groove = Math.pow(Math.abs(Math.cos(t * segs * Math.PI)), 6); return mixc(mixc(furA, furB, 0.3 + 0.5 * Math.sin(-Math.PI / 2 + j / 12 * Math.PI * 2) * -0.5), hex('#2a1a10'), groove * 0.4) },
      w: (i) => { const t = i / N; return t < 0.33 ? w2(abd0, abd1, smooth(0.2, 0.33, t)) : t < 0.66 ? w2(abd1, abd2, smooth(0.55, 0.66, t)) : w1(abd2) }, uv: (i, j) => [j / 12 * 2, i / N * 2] })
    acc.add(G_BODY, sw.part)
    const hp = newPart(); hairs(hp, sw, R, 260, 0, N - 3, [0.004 * K, 0.008 * K], 0.0009 * K, -0.7, (c, r) => mixc(c, hex('#caa070'), r * 0.3)); acc.add(G_HAIR, hp)
    if (fem) {
      // 腹末：腐蚀腺（苍黄半透明球）+ 可伸缩产卵器
      const tip = path[N].clone()
      const gland = ellipsoid(tip.clone().add(V(0.004, -0.006 * K, 0)), V(0.009 * K, 0.007 * K, 0.008 * K))
      acc.add(G_GLOSS, fromGeo(gland.geo, gland.m, hex('#7d6a34'), w1(abd2)))
      const ov = [tip.clone(), tip.clone().add(V(-0.012 * K, -0.002, 0)), tip.clone().add(V(-0.02 * K, -0.005, 0))]
      acc.add(G_GLOSS, sweep(ov, 5, (i, a) => { const r = [0.0022, 0.0016, 0] [i] * K; return [Math.cos(a) * r, Math.sin(a) * r] }, { col: () => hex('#3b2618'), w: () => w1(abd2) }).part)
    }
  }
  // 头
  const hc = V(0.034 * K, 0.002, 0), hr = 0.012 * K
  {
    const e = ellipsoid(hc, V(hr * 0.9, hr, hr * 1.05))
    acc.add(G_BODY, fromGeo(e.geo, e.m, furB, w1(head)))
    // 头顶绒毛
    const N = 6, path: V3[] = []; for (let i = 0; i <= N; i++) path.push(V(hc.x - hr + 2 * hr * i / N, hc.y, 0))
    const ghost = sweep(path, 10, (i, a) => { const r = Math.sin(Math.PI * i / N) * hr * 0.95; return [Math.cos(a) * r, Math.sin(a) * r] }, { col: () => furA, w: () => w1(head) })
    const hp = newPart(); hairs(hp, ghost, R, 200, 1, N - 1, [0.0025 * K, 0.005 * K], 0.0006 * K, -0.5, (c, r) => mixc(c, hex('#d6b07a'), r * 0.4), (a) => Math.sin(a) > -0.2); acc.add(G_HAIR, hp)
    eyes(acc, hc, hr, head, V(1, 0, 0), V(0, 1, 0), hr * 0.62)
  }
  // 触角（羽状；雄性羽枝宽大，用于远距离通讯）
  for (const s of [1, -1] as const) {
    const a0 = rig.bone(`ant${s > 0 ? 'L' : 'R'}`, hc.clone().add(V(hr * 0.5, hr * 0.75, s * hr * 0.4)), head)
    const a1 = rig.bone(`ant${s > 0 ? 'L' : 'R'}1`, hc.clone().add(V(hr * 0.5 + 0.03 * K, hr * 0.75 + 0.02 * K, s * (hr * 0.4 + 0.02 * K))), a0)
    const dir = V(0.72, 0.45, s * 0.5).normalize()
    antenna(acc, rig.rest[a0], dir, V(0, 1, 0), (fem ? 0.05 : 0.064) * K, 0.0011 * K, (fem ? 0.0045 : 0.011) * K, a0, a1, hex('#5a3a22'), fem ? hex('#7a5232') : hex('#9a7044'))
  }
  // 口器：雄性细长针状口器（盘卷后半伸）；雌性强颚 + 颚钳
  if (!fem) {
    const pb = rig.bone('proboscis', hc.clone().add(V(hr * 0.7, -hr * 0.6, 0)), head)
    const path: V3[] = []
    for (let i = 0; i <= 10; i++) { const t = i / 10, ang = -0.4 - t * 1.4; path.push(rig.rest[pb].clone().add(V(Math.cos(ang) * 0.004 + t * 0.026, Math.sin(ang) * 0.004 - t * 0.012 - t * t * 0.006, 0))) }
    acc.add(G_GLOSS, sweep(path, 5, (i, a) => { const r = i === 10 ? 0 : 0.0012 * (1 - i / 14); return [Math.cos(a) * r, Math.sin(a) * r] }, { col: () => hex('#2a1a12'), w: () => w1(pb) }).part)
  } else {
    for (const s of [1, -1] as const) {
      const jb = rig.bone(`jaw${s > 0 ? 'L' : 'R'}`, hc.clone().add(V(hr * 0.75, -hr * 0.55, s * hr * 0.42)), head)
      const J = rig.rest[jb], path = [J.clone(), J.clone().add(V(0.008 * K, -0.004 * K, s * 0.003 * K)), J.clone().add(V(0.014 * K, -0.004 * K, -s * 0.001 * K)), J.clone().add(V(0.017 * K, -0.001 * K, -s * 0.006 * K))]
      const sw = sweep(path, 6, (i, a) => { const r = [0.0032, 0.0026, 0.0016, 0][i] * K; return [Math.cos(a) * r, Math.sin(a) * r * 0.75] }, { col: (i) => mixc(hex('#3a2416'), hex('#0e0806'), i / 3), w: () => w1(jb) })
      acc.add(G_GLOSS, sw.part)
      for (let k = 0; k < 3; k++) spike(acc.parts[G_GLOSS], path[1].clone().lerp(path[2], k / 3), V(0, 0, -s), V(1, 0, 0), 0.0035 * K, 0.0009 * K, hex('#0a0605'), w1(jb))
    }
  }
  // 足：3 对，飞行时收拢下垂、跗节带爪（附图里垂在胸下）
  for (const s of [1, -1] as const) for (let i = 0; i < 3; i++) {
    const nm = `leg${s > 0 ? 'L' : 'R'}${i}`
    const hip = V((0.012 - i * 0.012) * K, -0.016 * K, s * 0.008 * K)
    const knee = hip.clone().add(V((0.016 - i * 0.012) * K, -0.012 * K, s * 0.022 * K))
    const ankle = knee.clone().add(V((0.002 - i * 0.01) * K, -0.03 * K, s * 0.006 * K))
    const foot = ankle.clone().add(V((0.008 - i * 0.004) * K, -0.016 * K, s * 0.002 * K))
    const bf = rig.bone(nm + '_f', hip, thorax), bt = rig.bone(nm + '_t', knee, bf), bs = rig.bone(nm + '_s', ankle, bt)
    limb(acc, R, [hip, knee, ankle, foot], [bf, bt, bs], [0.0028 * K, 0.0021 * K, 0.0013 * K, 0.0007 * K], (t) => mixc(furB, chit, t), 30, 0.004 * K, hex('#3a2616'))
    for (const sd of [-1, 1]) spike(acc.parts[G_GLOSS], foot, V(0.6, -0.5, sd * 0.4).normalize(), V(0, 0, 1), 0.003 * K, 0.0005 * K, hex('#120a06'), w1(bs))
  }
  // 翅：前翅 + 后翅（带尾突）；静止 = 展翅滑翔姿态
  for (const s of [1, -1] as const) {
    const L = s > 0 ? 'L' : 'R'
    const fh = V(0.008 * K, 0.014 * K, s * 0.011 * K), hh = V(-0.008 * K, 0.012 * K, s * 0.010 * K)
    const span = (fem ? 0.2 : 0.155), chord = (fem ? 0.115 : 0.088)
    const f0 = rig.bone(`wingF${L}`, fh, thorax), f1 = rig.bone(`wingF${L}1`, fh.clone().add(V(0, 0, s * span * 0.5)), f0)
    const h0 = rig.bone(`wingH${L}`, hh, thorax), h1 = rig.bone(`wingH${L}1`, hh.clone().add(V(-0.02 * K, 0, s * span * 0.38)), h0)
    const tint: RGB = fem ? [0.95, 0.88, 0.84] : [1.08, 1.04, 0.94]
    wing(acc, { hinge: fh, span, chord, hind: false, side: s, root: f0, tip: f1, lift: 0.12, sweepBack: 0.18, tint, tail: 0 })
    wing(acc, { hinge: hh, span: span * 0.78, chord: chord * 1.05, hind: true, side: s, root: h0, tip: h1, lift: 0.08, sweepBack: 0.62, tint, tail: (fem ? 0.12 : 0.085) })
  }
  return finish(acc, rig, form)
}

// ---------------------------------------------------------------------------
// 禁卫级（地面形态，原点在地面）
// ---------------------------------------------------------------------------
export const GUARD_THORAX = V(0, 0.5, 0)
function buildGuard(): MothGeometry {
  const R = mulberry(0x4f13)
  const rig = new RigDesc(), acc = new Acc()
  const root = rig.bone('body', V(0, 0, 0), -1)
  const T0 = GUARD_THORAX.clone(), up = V(0.5, 0.866, 0).normalize() // 体轴：前上方抬起约 60°
  const thorax = rig.bone('thorax', T0, root)
  const headP = T0.clone().addScaledVector(up, 0.13)
  const head = rig.bone('head', headP, thorax)
  const back = V(-0.93, -0.36, 0).normalize()
  const abd0 = rig.bone('abd0', T0.clone().addScaledVector(back, 0.07), thorax)
  const abd1 = rig.bone('abd1', T0.clone().addScaledVector(back, 0.15), abd0)
  const abd2 = rig.bone('abd2', T0.clone().addScaledVector(back, 0.23), abd1)
  // 附图：苍白（骨白偏灰）身体、暗色翅基、黑色长附肢
  const paleA = hex('#d9d2c2'), paleB = hex('#9c9283'), dark = hex('#16110d')
  // 胸：粗壮，直径约 0.17m
  {
    const N = 14, path: V3[] = []
    for (let i = 0; i <= N; i++) path.push(T0.clone().addScaledVector(up, lerp(-0.075, 0.09, i / N)))
    const sw = sweep(path, 16, (i, a) => { const t = i / N, r = Math.sin(Math.PI * t) ** 0.55 * 0.085; return [Math.cos(a) * r, Math.sin(a) * r * 0.95] },
      { up: V(-0.866, 0.5, 0), col: (_i, j) => mixc(paleB, paleA, 0.4 + 0.6 * Math.max(0, Math.sin(-Math.PI / 2 + j / 16 * Math.PI * 2))), w: (i) => w1(i / N > 0.85 ? head : thorax), uv: (i, j) => [j / 16 * 3, i / N * 2] })
    acc.add(G_BODY, sw.part)
    const hp = newPart(); hairs(hp, sw, R, 1800, 1, N - 1, [0.01, 0.022], 0.0014, -0.5, (c, r) => mixc(c, hex('#f0ebe0'), r * 0.5)); acc.add(G_HAIR, hp)
  }
  // 腹：垂向后下方，分节，末端腐蚀腺
  {
    const N = 24, path: V3[] = []
    for (let i = 0; i <= N; i++) { const t = i / N; path.push(T0.clone().addScaledVector(back, 0.04 + 0.26 * t).add(V(0, -t * t * 0.05, 0))) }
    const sw = sweep(path, 14, (i, a) => {
      const t = i / N, ridge = 1 - 0.09 * Math.pow(Math.abs(Math.sin(t * 6 * Math.PI)), 0.4)
      const r = (t < 0.15 ? lerp(0.06, 0.075, t / 0.15) : lerp(0.075, 0.018, (t - 0.15) / 0.85)) * ridge * (i === N ? 0 : 1)
      return [Math.cos(a) * r, Math.sin(a) * r]
    }, { col: (i, j) => { const t = i / N, g = Math.pow(Math.abs(Math.cos(t * 6 * Math.PI)), 6); return mixc(mixc(paleA, paleB, 0.3 + 0.3 * -Math.sin(-Math.PI / 2 + j / 14 * Math.PI * 2)), hex('#5e5448'), g * 0.55) },
      w: (i) => { const t = i / N; return t < 0.33 ? w2(abd0, abd1, smooth(0.22, 0.33, t)) : t < 0.66 ? w2(abd1, abd2, smooth(0.55, 0.66, t)) : w1(abd2) }, uv: (i, j) => [j / 14 * 3, i / N * 2] })
    acc.add(G_BODY, sw.part)
    const hp = newPart(); hairs(hp, sw, R, 500, 0, N - 3, [0.007, 0.015], 0.0013, -0.7, (c, r) => mixc(c, hex('#ece6da'), r * 0.4)); acc.add(G_HAIR, hp)
    const gl = ellipsoid(path[N].clone().add(V(0.01, 0.0, 0)), V(0.022, 0.018, 0.02))
    acc.add(G_GLOSS, fromGeo(gl.geo, gl.m, hex('#857238'), w1(abd2)))
  }
  // 头：楔形长头（向前下方伸出），贴头的肾形暗色复眼，交叉长颚 + 下颚须，颈部一圈苍白绒毛领
  const hr = 0.045
  {
    const fwd = V(0.866, -0.5, 0) // 头朝前下方（垂头逼视）
    const hc = headP.clone().addScaledVector(up, 0.02).addScaledVector(fwd, 0.012)
    // 头壳：沿 fwd 扫掠，后宽前窄、上平下凹；额面压平
    {
      const N = 12, path: V3[] = []
      for (let i = 0; i <= N; i++) path.push(hc.clone().addScaledVector(fwd, lerp(-0.035, 0.06, i / N)))
      const sw = sweep(path, 14, (i, a) => {
        const t = i / N, prof = Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)) ** 0.5 * (1 - 0.45 * t)
        const wz = 0.044 * prof, hy = 0.036 * prof * (Math.sin(a) > 0 ? 0.85 : 1.05)
        const brow = Math.sin(a) > 0.2 ? 1 + 0.12 * Math.exp(-Math.pow((t - 0.45) / 0.12, 2)) : 1 // 眉脊
        return [Math.cos(a) * wz * brow, Math.sin(a) * hy * (i === N ? 0 : 1)]
      }, { up, col: (i, j) => { const t = i / N; return mixc(mixc(hex('#7d7366'), hex('#b5ab9a'), Math.max(0, Math.sin(-Math.PI / 2 + j / 14 * Math.PI * 2))), hex('#2a221c'), smooth(0.7, 1, t) * 0.7) },
        w: () => w1(head), uv: (i, j) => [j / 14 * 2, i / N] })
      acc.add(G_BODY, sw.part)
      const hp = newPart(); hairs(hp, sw, R, 260, 0, N - 4, [0.008, 0.016], 0.0012, -0.6, (c, r) => mixc(c, hex('#e6dfd2'), r * 0.4), (a) => Math.sin(a) > -0.1); acc.add(G_HAIR, hp)
    }
    // 颈部绒毛领：一圈长而乱的苍白毛，遮住头胸交界
    {
      const N = 4, base = headP.clone().addScaledVector(up, -0.03), path: V3[] = []
      for (let i = 0; i <= N; i++) path.push(base.clone().addScaledVector(up, 0.012 * i))
      const ring = sweep(path, 18, (_i, a) => [Math.cos(a) * 0.058, Math.sin(a) * 0.055], { up: V(-0.866, 0.5, 0), col: () => hex('#d8d0c0'), w: () => w2(thorax, head, 0.5) })
      const hp = newPart(); hairs(hp, ring, R, 700, 0, N, [0.025, 0.05], 0.0011, 0.6, (_c, r) => mixc(hex('#cfc6b4'), hex('#f2ede2'), r)); acc.add(G_HAIR, hp)
    }
    // 复眼：肾形，紧贴头侧、半埋，哑光近黑带暗红深处；顶点色做出六角小眼颗粒（不再是圆球高光）
    const side = V(0, 0, 1)
    for (const s of [1, -1] as const) {
      const c = hc.clone().addScaledVector(fwd, 0.006).addScaledVector(side, s * 0.032).addScaledVector(up, 0.01)
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), fwd.clone().multiplyScalar(0.55).addScaledVector(up, 0.84).normalize())
      const e = ellipsoid(c, V(0.026, 0.046, 0.019), q, 26, 20)
      // 小眼六角颗粒：沿法线的细小起伏（灯光下出现蜂窝闪点）；颜色暗红褐，正对外侧有一块更黑的「伪瞳孔」——无论从哪看都像在盯着你
      const outward = side.clone().multiplyScalar(s).addScaledVector(fwd, 0.6).normalize()
      const part = fromGeo(e.geo, e.m, (qq, n) => {
        const facet = 0.5 + 0.5 * Math.cos(qq.x * 520) * Math.cos(qq.y * 520 + qq.z * 300)
        const pupil = Math.pow(Math.max(0, n.dot(outward)), 6)
        return mixc(mixc(hex('#3e1a10'), hex('#6a2c18'), facet * 0.5), hex('#040202'), Math.min(1, pupil * 1.2 + 0.25))
      }, w1(head))
      for (let k = 0; k < part.pos.length; k += 3) {
        const P = V(part.pos[k], part.pos[k + 1], part.pos[k + 2]), N0 = V(part.nor[k], part.nor[k + 1], part.nor[k + 2]), d = P.clone().sub(c)
        const along = d.dot(fwd), lat = d.dot(side) * s
        if (along > 0.004 && lat < 0.004) P.addScaledVector(side, -s * (along - 0.004) * 0.5) // 肾形：靠颚一侧内凹
        P.addScaledVector(N0, 0.0007 * Math.cos(P.x * 520) * Math.cos(P.y * 520 + P.z * 300))
        part.pos[k] = P.x; part.pos[k + 1] = P.y; part.pos[k + 2] = P.z
      }
      { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3)); g.setIndex(part.idx); g.computeVertexNormals(); part.nor = Array.from((g.attributes.normal as THREE.BufferAttribute).array as Float32Array) }
      acc.add(G_BODY, part) // 进体表组：哑光，不出卡通高光
    }
    { // 额中脊（一道纵棱把脸劈开）+ 湿润口腔（颚根之间，暗红）+ 口内细齿
      const k0 = hc.clone().addScaledVector(up, 0.034).addScaledVector(fwd, 0.012), k1 = hc.clone().addScaledVector(fwd, 0.055).addScaledVector(up, -0.006)
      acc.add(G_BODY, sweep([k0, k0.clone().lerp(k1, 0.5).addScaledVector(up, 0.006), k1], 5, (i, a) => { const r = [0.004, 0.0045, 0.002][i]; return [Math.cos(a) * r * 0.6, Math.sin(a) * r] }, { up: fwd, col: () => hex('#3a3028'), w: () => w1(head) }).part)
      const mc = hc.clone().addScaledVector(fwd, 0.058).addScaledVector(up, -0.024)
      const mo = ellipsoid(mc.clone().addScaledVector(fwd, -0.006), V(0.008, 0.007, 0.012), new THREE.Quaternion(), 10, 8)
      acc.add(G_GLOSS, fromGeo(mo.geo, mo.m, (_q, n) => mixc(hex('#0e0202'), hex('#3a0c0a'), Math.max(0, n.dot(fwd))), w1(head)))
      for (let k = 0; k < 7; k++) { const t = k / 6 - 0.5; spike(acc.parts[G_GLOSS], mc.clone().addScaledVector(side, t * 0.022).addScaledVector(up, 0.006).addScaledVector(fwd, 0.008), V(0, 0, 0).addScaledVector(up, -1).addScaledVector(fwd, 0.4).normalize(), side, 0.008, 0.0012, hex('#c8bca0'), w1(head)) }
    }
    for (const s of [1, -1] as const) {
      const L = s > 0 ? 'L' : 'R'
      // 长颚：镰刀形，向前下方伸出后向内交叉，内缘一排锯齿
      const jb = rig.bone(`jaw${L}`, hc.clone().addScaledVector(fwd, 0.05).addScaledVector(up, -0.018).addScaledVector(side, s * 0.02), head)
      const J = rig.rest[jb]
      const path = [0, 1, 2, 3, 4, 5].map((k) => { const t = k / 5; return J.clone().addScaledVector(fwd, 0.075 * t).addScaledVector(up, -0.03 * t + 0.012 * t * t).addScaledVector(side, s * (0.012 * Math.sin(t * Math.PI * 0.6) - 0.042 * t * t)) })
      acc.add(G_GLOSS, sweep(path, 6, (i, a) => { const r = [0.011, 0.0095, 0.0075, 0.0055, 0.003, 0][i]; return [Math.cos(a) * r, Math.sin(a) * r * 0.65] }, { col: (i) => mixc(hex('#1c120c'), hex('#020101'), i / 5), w: () => w1(jb) }).part)
      for (let k = 0; k < 6; k++) spike(acc.parts[G_GLOSS], path[1].clone().lerp(path[4], k / 6), V(0, 0, -s).addScaledVector(fwd, 0.25).normalize(), fwd, 0.011 - k * 0.001, 0.0022, hex('#020101'), w1(jb))
      // 下颚须：两节、有毛，垂在颚下
      const pb = hc.clone().addScaledVector(fwd, 0.045).addScaledVector(up, -0.028).addScaledVector(side, s * 0.03)
      const pk = pb.clone().addScaledVector(fwd, 0.025).addScaledVector(up, -0.035).addScaledVector(side, s * 0.01)
      const pt = pk.clone().addScaledVector(fwd, 0.03).addScaledVector(up, -0.01).addScaledVector(side, -s * 0.004)
      limb(acc, R, [pb, pk, pt], [head, head], [0.005, 0.004, 0.0025], () => hex('#4a3c30'), 24, 0.008, hex('#8a7c6a'))
      // 长触角（羽状，向上后弯，顶端约 0.95m）
      const a0 = rig.bone(`ant${L}`, hc.clone().addScaledVector(up, 0.035).addScaledVector(fwd, 0.02).addScaledVector(side, s * 0.016), head)
      const dir = V(0.15, 0.82, s * 0.55).normalize()
      const a1 = rig.bone(`ant${L}1`, rig.rest[a0].clone().addScaledVector(dir, 0.12), a0)
      antenna(acc, rig.rest[a0], dir, V(-0.4, 0.15, 0).normalize(), 0.27, 0.003, 0.018, a0, a1, hex('#2e241a'), hex('#6e604e'))
    }
    void hr
  }
  // 半退化翅：竖举在背后（附图），翼展约 0.6m，色调偏灰褐 + 眼斑
  for (const s of [1, -1] as const) {
    const L = s > 0 ? 'L' : 'R'
    const fh = T0.clone().addScaledVector(up, 0.03).add(V(-0.04, 0.03, s * 0.05)), hh = T0.clone().addScaledVector(up, -0.03).add(V(-0.045, 0.02, s * 0.05))
    const f0 = rig.bone(`wingF${L}`, fh, thorax), f1 = rig.bone(`wingF${L}1`, fh.clone().add(V(0, 0.1, s * 0.1)), f0)
    const h0 = rig.bone(`wingH${L}`, hh, thorax), h1 = rig.bone(`wingH${L}1`, hh.clone().add(V(-0.03, 0.06, s * 0.08)), h0)
    const tint: RGB = [0.7, 0.7, 0.72]
    wing(acc, { hinge: fh, span: 0.25, chord: 0.13, hind: false, side: s, root: f0, tip: f1, lift: 0.55, sweepBack: 0.35, pitch: 1.15, tint, tail: 0 })
    wing(acc, { hinge: hh, span: 0.18, chord: 0.12, hind: true, side: s, root: h0, tip: h1, lift: 0.3, sweepBack: 0.7, pitch: 1.0, tint, tail: 0.05 })
  }
  // 8 条附肢：自胸侧伸出，先上扬到膝（高于身体）再折向地面，足尖落在半径约 0.5–0.62m 的圆上
  const LEG_ANG = [38, 72, 112, 148] // 水平方位角（度，0=正前）
  for (const s of [1, -1] as const) for (let i = 0; i < 4; i++) {
    const L = s > 0 ? 'L' : 'R', nm = `leg${L}${i}`
    const ang = LEG_ANG[i] * Math.PI / 180, dir = V(Math.cos(ang), 0, s * Math.sin(ang))
    const hip = T0.clone().addScaledVector(up, 0.035 - i * 0.03).addScaledVector(dir, 0.06)
    const reach = [0.5, 0.56, 0.55, 0.48][i]
    const foot = V(dir.x * reach, 0.005, dir.z * reach)
    // 两骨解析 IK：股节 0.31、胫节 0.31、跗节 0.11（共 0.73m），膝向上外
    const a = 0.34, b = 0.28, c = 0.11
    const ankle = foot.clone().add(V(-dir.x * 0.035, 0.1, -dir.z * 0.035))
    const d = ankle.clone().sub(hip), dl = Math.min(d.length(), a + b - 1e-3)
    const along = (a * a - b * b + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, a * a - along * along))
    const dn = d.clone().normalize(), bend = V(0, 1, 0).addScaledVector(dir, 0.1)
    bend.addScaledVector(dn, -bend.dot(dn)).normalize()
    const knee = hip.clone().addScaledVector(dn, along).addScaledVector(bend, h)
    void c
    const bf = rig.bone(nm + '_f', hip, thorax), bt = rig.bone(nm + '_t', knee, bf), bs = rig.bone(nm + '_s', ankle, bt)
    rig.bone(nm + '_e', foot, bs)
    limb(acc, R, [hip, knee, ankle, foot], [bf, bt, bs], [0.016, 0.011, 0.006, 0.003], (t) => mixc(hex('#2b231c'), dark, smooth(0, 0.3, t)), 70, 0.016, hex('#0e0a08'))
    // 股节毒腺（附肢内的麻痹毒素器官）：股节中段一道暗红鼓包
    const gp = hip.clone().lerp(knee, 0.55)
    const gq = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), knee.clone().sub(hip).normalize())
    const ge = ellipsoid(gp, V(0.017, 0.06, 0.017), gq, 8, 6)
    acc.add(G_BODY, fromGeo(ge.geo, ge.m, hex('#3e1a14'), w1(bf)))
    for (const sd of [-1, 1]) spike(acc.parts[G_GLOSS], foot, V(dir.x * 0.6, -0.4, dir.z * 0.6 + sd * 0.3).normalize(), V(-dir.z, 0, dir.x), 0.016, 0.003, hex('#050302'), w1(bs))
  }
  return finish(acc, rig, 'guard')
}

// ---------------------------------------------------------------------------
// 幼虫（地面形态）
// ---------------------------------------------------------------------------
export const LARVA_SEGMENTS = 11
function buildLarva(): MothGeometry {
  const R = mulberry(0x4f14)
  const rig = new RigDesc(), acc = new Acc()
  const root = rig.bone('body', V(0, 0, 0), -1)
  const L = 0.1, rad = 0.02, y0 = 0.021
  const segB: number[] = []
  // 体节骨链：头 → 尾（-X），每节一根骨骼
  for (let k = 0; k < LARVA_SEGMENTS; k++) segB.push(rig.bone(`seg${k}`, V(0.04 - k * (L / (LARVA_SEGMENTS - 1)), y0, 0), k ? segB[k - 1] : root))
  const head = rig.bone('head', V(0.052, y0 + 0.002, 0), segB[0])
  const dark = hex('#1c1611'), mid = hex('#3a2e24')
  // 躯干：分节波状管，每节鼓起，腹面稍平
  const N = (LARVA_SEGMENTS - 1) * 4, path: V3[] = []
  for (let i = 0; i <= N; i++) { const t = i / N; path.push(V(0.042 - t * (L + 0.006), y0 + Math.sin(t * Math.PI * 2.2) * 0.002, Math.sin(t * Math.PI * 1.4) * 0.003)) }
  const segOf = (i: number) => Math.min(LARVA_SEGMENTS - 1, Math.floor(i / 4))
  const body = sweep(path, 14, (i, a) => {
    const t = i / N, bulge = 1 + 0.12 * Math.sin((i % 4) / 4 * Math.PI)
    let r = rad * bulge * (t < 0.06 ? lerp(0.8, 1, t / 0.06) : t > 0.85 ? lerp(1, 0.35, (t - 0.85) / 0.15) : 1)
    if (i === N) r = 0
    const flat = Math.sin(a) < 0 ? 0.78 : 1
    return [Math.cos(a) * r, Math.sin(a) * r * flat]
  }, { col: (i, j) => { const g = Math.pow(Math.abs(Math.cos((i % 4) / 4 * Math.PI)), 5); return mixc(mixc(mid, dark, 0.4 + 0.3 * Math.sin(j)), hex('#0b0907'), g * 0.5) },
    w: (i) => { const s = segOf(i), f = (i % 4) / 4; return s < LARVA_SEGMENTS - 1 ? w2(segB[s], segB[s + 1], smooth(0.5, 1, f) * 0.5) : w1(segB[s]) }, uv: (i, j) => [j / 14 * 2, i / N * 6] })
  acc.add(G_BODY, body.part)
  // 背部 7cm 中空刺毛（附图：极密的长黑刺，向四周放射），侧面略短；腹面不长
  {
    const hp = newPart()
    hairs(hp, body, R, 1500, 2, N - 2, [0.045, 0.072], 0.0009, -0.15, (_c, r) => mixc(hex('#120d0a'), hex('#4a3a2c'), r * 0.5), (a) => Math.sin(a) > -0.35, 0.06)
    hairs(hp, body, R, 500, 1, N - 1, [0.012, 0.025], 0.0006, 0, (_c, r) => mixc(hex('#2a2018'), hex('#6a5640'), r), (a) => Math.sin(a) > -0.6) // 短绒
    acc.add(G_HAIR, hp)
  }
  // 头壳：银灰金属光泽的大头盔（宽于身体），前缘一道棱，额区倒 Y 缝线，侧面单眼群
  {
    const hc = V(0.05, y0 + 0.003, 0)
    // 双叶头壳：左右两片银灰半球（中缝深色），额区三角板夹在两叶之间的前下方
    const silver = (q: V3, n: V3, c: V3) => {
      const k = 0.5 + 0.38 * Math.max(0, n.y) + 0.12 * Math.max(0, n.x)
      const seam = Math.exp(-Math.pow(q.z / 0.0016, 2))
      const rim = Math.exp(-Math.pow((q.x - (c.x + 0.011)) / 0.0018, 2)) * (q.y < c.y ? 1 : 0.4)
      return mixc(mixc(hex('#55585c'), hex('#d4d8dc'), k), hex('#26272a'), Math.min(1, seam * 0.8 + rim * 0.5))
    }
    { // 单片头壳（只在顶部画一道深色蜕裂线，不做几何凹槽——正面看成一整块银色头盔）
      const c = hc.clone().add(V(0, 0.002, 0))
      const e = ellipsoid(c, V(0.016, 0.0205, 0.0215), new THREE.Quaternion(), 20, 14)
      acc.add(G_GLOSS, fromGeo(e.geo, e.m, (q, n) => silver(q, n, c), w1(head)))
    }
    const fr = ellipsoid(hc.clone().add(V(0.0118, -0.005, 0)), V(0.0045, 0.0105, 0.0085), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.25), 10, 8)
    acc.add(G_GLOSS, fromGeo(fr.geo, fr.m, (_q, n) => mixc(hex('#3c3e42'), hex('#9a9ea4'), 0.4 + 0.5 * Math.max(0, n.x)), w1(head)))
    // 唇基 + 锯齿颚（附图：头壳下方中央的暗色口器）
    const lab = ellipsoid(hc.clone().add(V(0.014, -0.01, 0)), V(0.006, 0.006, 0.01))
    acc.add(G_GLOSS, fromGeo(lab.geo, lab.m, hex('#26201c'), w1(head)))
    for (const s of [1, -1]) {
      const jb = hc.clone().add(V(0.016, -0.013, s * 0.006))
      const path = [jb, jb.clone().add(V(0.006, -0.002, -s * 0.002)), jb.clone().add(V(0.009, -0.001, -s * 0.006))]
      acc.add(G_GLOSS, sweep(path, 5, (i, a) => { const r = [0.0028, 0.002, 0][i]; return [Math.cos(a) * r, Math.sin(a) * r] }, { col: () => hex('#0e0b09'), w: () => w1(head) }).part)
      for (let k = 0; k < 3; k++) spike(acc.parts[G_GLOSS], path[0].clone().lerp(path[1], k / 3), V(0, 0, -s), V(1, 0, 0), 0.002, 0.0006, hex('#060403'), w1(head))
      for (let k = 0; k < 5; k++) { // 单眼群（6 个小黑点的弧）
        const oc = hc.clone().add(V(0.01 + Math.cos(k * 0.6) * 0.003, -0.004 + k * 0.002, s * 0.019))
        const o = ellipsoid(oc, V(0.0013, 0.0013, 0.0013), new THREE.Quaternion(), 5, 4)
        acc.add(G_GLOSS, fromGeo(o.geo, o.m, hex('#050403'), w1(head)))
      }
      // 头壳边缘白斑（附图左上的浅色斑块）
      const sp = ellipsoid(hc.clone().add(V(-0.004, 0.016, s * 0.012)), V(0.003, 0.002, 0.004), new THREE.Quaternion(), 6, 4)
      acc.add(G_GLOSS, fromGeo(sp.geo, sp.m, hex('#e6dcc4'), w1(head)))
    }
  }
  // 足：前 3 节各一对分节胸足（尖爪），第 3–11 节各一对短粗腹足（共 12 对）
  for (const s of [1, -1] as const) for (let k = 0; k < LARVA_SEGMENTS; k++) {
    if (k === 0 || k === LARVA_SEGMENTS - 1) continue
    const cx = rig.rest[segB[k]].x, hip = V(cx, y0 - 0.012, s * 0.01)
    if (k <= 3) {
      const knee = hip.clone().add(V(0.004, -0.004, s * 0.008)), foot = knee.clone().add(V(0.004, -0.006, s * 0.002))
      limb(acc, R, [hip, knee, foot], [segB[k], segB[k]], [0.0026, 0.0018, 0.0006], () => hex('#2a2420'))
      spike(acc.parts[G_GLOSS], foot, V(0.7, -0.3, 0).normalize(), V(0, 0, 1), 0.002, 0.0005, hex('#0a0806'), w1(segB[k]))
    } else {
      const foot = hip.clone().add(V(0, -0.0085, s * 0.004))
      limb(acc, R, [hip, foot], [segB[k]], [0.0042, 0.0034], () => hex('#2c2520'))
      // 腹足钩（趾钩环）
      const ring = ellipsoid(foot, V(0.0034, 0.001, 0.0034), new THREE.Quaternion(), 8, 3)
      acc.add(G_GLOSS, fromGeo(ring.geo, ring.m, hex('#0c0a08'), w1(segB[k])))
    }
  }
  return finish(acc, rig, 'larva')
}

function finish(acc: Acc, rig: RigDesc, form: MothForm): MothGeometry {
  const geo = acc.build()
  geo.computeBoundingSphere()
  const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3
  return { geo, tris, rig, form }
}

export function prepareMothGeometry(form: MothForm): MothGeometry {
  const hit = CACHE[form]; if (hit) return hit
  const g = form === 'guard' ? buildGuard() : form === 'larva' ? buildLarva() : buildFlyer(form)
  return (CACHE[form] = g)
}
export const mothGeometryReady = (form: MothForm) => !!CACHE[form]

export function* prepareDeathmothJob(form: MothForm): Generator<void, void> {
  furTexture(); wingTexture()
  yield
  prepareMothGeometry(form)
  yield
}

export const deathmothResourcesReady = (form: MothForm) =>
  FUR_TEX !== undefined && WING_TEX !== undefined && !!CACHE[form]

// ============================================================================
// 材质（按实例创建；程序贴图仍共享）
// ============================================================================
/** 光泽材质：经典模式的 Lambert 没有高光，湿亮的卵/复眼/头壳改用 Phong（同样挂上关卡环境与 L1 探针着色）；真实模式走 litMaterial。 */
export function glossMaterial(p: { roughness: number; metalness?: number; envBase?: number; shininess?: number; specular?: string; emissive?: string; color?: string; transparent?: boolean; opacity?: number }): THREE.Material {
  if (getMaterialMode() === 'realistic') {
    const m = litMaterial({ color: p.color ?? '#ffffff', vertexColors: true, roughness: p.roughness, metalness: p.metalness ?? 0, envBase: p.envBase ?? 0.8, ...(p.emissive ? { emissive: p.emissive } : {}), ...(p.transparent ? { transparent: true, opacity: p.opacity ?? 1 } : {}) })
    return m
  }
  const m = new THREE.MeshPhongMaterial({ color: p.color ?? '#ffffff', vertexColors: true, shininess: p.shininess ?? 60, specular: p.specular ?? '#6a6460', ...(p.emissive ? { emissive: p.emissive } : {}), ...(p.transparent ? { transparent: true, opacity: p.opacity ?? 1 } : {}) })
  installL0EnvironmentShader(m); installL1DynamicProbe(m)
  return m
}
interface MothMats { body: THREE.Material; wing: THREE.Material; gloss: THREE.Material; hair: THREE.Material }
export function mothMaterials(): MothMats {
  const fur = furTexture(), wt = wingTexture()
  const body = litMaterial({ color: '#ffffff', vertexColors: true, ...(fur ? { map: fur, bumpMap: fur, bumpScale: 0.9 } : {}), roughness: 0.9, envBase: 0.08 })
  const wing = litMaterial({ color: '#ffffff', vertexColors: true, ...(wt ? { map: wt, alphaTest: 0.5 } : {}), side: THREE.DoubleSide, roughness: 0.92, envBase: 0.05 })
  const gloss = glossMaterial({ roughness: 0.3, metalness: 0.1, envBase: 0.7, shininess: 45, specular: '#55514e' })
  const hair = litMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, roughness: 0.75, envBase: 0.1 })
  if (fur) fur.userData.entityShared = true
  if (wt) wt.userData.entityShared = true
  return { body, wing, gloss, hair }
}

// ============================================================================
// 实例
// ============================================================================
export interface MothRig {
  form: MothForm; mount: THREE.Group; mesh: THREE.SkinnedMesh; bones: THREE.Bone[]; byName: Record<string, THREE.Bone>; rest: V3[]; tris: number
}
/** 构建一只死亡飞蛾（形态 form，个体缩放 scale）。返回外层组（+X 正面）；userData.mothRig 为骨架句柄。 */
export function buildDeathmothMesh(form: MothForm = 'male', scale = 1): THREE.Group {
  const G = prepareMothGeometry(form)
  const grp = new THREE.Group()
  grp.userData.entityType = 'deathmoth'; grp.userData.mothForm = form
  const mount = new THREE.Group(); mount.scale.setScalar(scale); grp.add(mount)
  const bones: THREE.Bone[] = [], byName: Record<string, THREE.Bone> = {}
  G.rig.rest.forEach((p, i) => {
    const b = new THREE.Bone(); b.name = G.rig.names[i]; const par = G.rig.parent[i]
    b.position.copy(p).sub(par < 0 ? V(0, 0, 0) : G.rig.rest[par])
    ;(par < 0 ? mount : bones[par]).add(b); bones.push(b); byName[b.name] = b
  })
  const m = mothMaterials()
  const mesh = new THREE.SkinnedMesh(G.geo.clone(), [m.body, m.wing, m.gloss, m.hair])
  mesh.frustumCulled = false
  mesh.castShadow = true
  mount.add(mesh)
  mount.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(bones))
  const rig: MothRig = { form, mount, mesh, bones, byName, rest: bones.map((b) => b.position.clone()), tris: G.tris }
  grp.userData.mothRig = rig
  return grp
}
export const MOTH_BONE_NAMES = (form: MothForm) => prepareMothGeometry(form).rig.names

/** 验收用：网格数、绘制次数（材质组计入）、三角面、骨骼数 */
export function mothBudget(grp: THREE.Object3D) {
  let meshes = 0, draws = 0, tris = 0, bones = 0
  grp.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.cpuSkin) return
    meshes++
    const g = m.geometry as THREE.BufferGeometry
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1
    draws += Array.isArray(m.material) ? Math.max(1, g.groups.length) : 1
    tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * inst
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) bones += (m as THREE.SkinnedMesh).skeleton.bones.length
  })
  return { meshes, draws, tris, bones }
}
