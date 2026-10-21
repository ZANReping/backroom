// 牧蛇（Entity 75「Wrangler」）重制模型——依据中文维基 Entity 75 与 Level 8「岩洞系统」条目，外形参照 ZAN 提供的两张附图
// （图一雄性、图二雌性，只取黑色躯体与眼形，不取红色嘴）。
//  · 雄性：灰黑、粗糙起皱、湿滑的巨蛇；类人的头颅，白色发光的斜眼，一道裂到耳根的笑口（下颌可整片脱开吞咽）。
//  · 雌性：更粗、更像巨虫——一环环体节、腹面横板；节肢动物般的头，两只圆而大的白色发光眼，下颚伸出一对口器钳。
//    受孕个体腹部鼓胀，绷薄的腹皮下透出一颗颗种子状的卵。
//  · 幼体：3–5m，表皮半透明，可以看见脊柱、肠管、心囊与血管；头的比例偏大。
//  · 卵枝：卵像种子一样扎进岩壁后发芽分枝，枝梢鼓起的囊里蜷着幼体（buildEggBranch）。
//  · 钻孔：岩壁上带碎石的洞口环（buildBurrowHole）。
//
// 躯体不是骨骼蒙皮，而是「脊线空间」几何：position = (s 沿脊线米数, 上偏移, 侧偏移)，
// 顶点着色器从一张 2×N 的浮点脊线纹理（行 0 = 位置，行 1 = 法向）取标架后摆到世界里。
// 这样 30 多米的身体能沿任意路径蜿蜒、钻进岩壁（埋进去的部分自然被岩石挡住），钻地时整段螺旋自转也只是改标架滚转。
// 头部是刚体，由 JS 每帧摆到 s=0 处的标架上。模型正面 +X（头朝向 = 脊线反方向）。
import * as THREE from 'three'
import { litMaterial } from './shared'

export type WranglerKind = 'male' | 'female' | 'juvenile'
export type WranglerLod = 0 | 1 | 2
type RGB = [number, number, number]
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k) }
const gray = (v: number, tint: RGB = [1, 1, 1]): RGB => [v * tint[0], v * tint[1], v * tint[2]]
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

// ---------------------------------------------------------------------------
// 尺寸（米）。ZAN 2026-10-21 定：雄性粗 1.6m、雌性粗 2m，可见约 30m，两头没在岩石里；幼体 3–5m 全身可见。
// ---------------------------------------------------------------------------
export const WRANGLER_DIM: Record<WranglerKind, { len: number; r: number; head: number }> = {
  male: { len: 32, r: 0.8, head: 0.98 },
  female: { len: 30, r: 1.0, head: 1.08 },
  juvenile: { len: 4.2, r: 0.17, head: 0.3 },
}
/** 脊线采样数（纹理宽度） */
export const SPINE_N = 96

// ---------------------------------------------------------------------------
// 噪声
// ---------------------------------------------------------------------------
function hash3(x: number, y: number, z: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
function vnoise(x: number, y: number, z: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf)
  let r = 0
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1
    r += hash3(xi + dx, yi + dy, zi + dz, seed) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w)
  }
  return r * 2 - 1
}
const fbm = (x: number, y: number, z: number, seed = 0) => vnoise(x, y, z, seed) * 0.6 + vnoise(x * 2.1, y * 2.1, z * 2.1, seed + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, z * 4.3, seed + 13) * 0.12
function rng(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// ---------------------------------------------------------------------------
// 几何累加
// ---------------------------------------------------------------------------
class Geo {
  pos: number[] = []; nor: number[] = []; col: number[] = []; uv: number[] = []; idx: number[] = []
  get n() { return this.pos.length / 3 }
  v(p: THREE.Vector3, n: THREE.Vector3, c: RGB, uv: [number, number] = [0, 0]) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.col.push(c[0], c[1], c[2]); this.uv.push(uv[0], uv[1]); return this.n - 1 }
  add(o: Geo) { const off = this.n; this.pos.push(...o.pos); this.nor.push(...o.nor); this.col.push(...o.col); this.uv.push(...o.uv); for (const k of o.idx) this.idx.push(k + off) }
  addThree(g: THREE.BufferGeometry, m: THREE.Matrix4, c: RGB | ((p: THREE.Vector3, n: THREE.Vector3) => RGB)) {
    const src = g.index ? g : g
    const P = src.attributes.position, N = src.attributes.normal, off = this.n
    const nm = new THREE.Matrix3().getNormalMatrix(m), p = V(0, 0, 0), n = V(0, 0, 0)
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i).applyMatrix4(m); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize()
      this.v(p, n, typeof c === 'function' ? c(p, n) : c, src.attributes.uv ? [src.attributes.uv.getX(i), src.attributes.uv.getY(i)] : [0, 0])
    }
    if (src.index) for (let i = 0; i < src.index.count; i++) this.idx.push(src.index.getX(i) + off)
    else for (let i = 0; i < P.count; i++) this.idx.push(i + off)
    g.dispose()
  }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setIndex(this.idx)
    return g
  }
}

/**
 * 脊线空间管体：s∈[s0,s1]，截面极角 a 从腹侧（-up）起一周。
 * rad(s,a) 返回半径，col(s,a,r) 返回顶点色。position = (s, r·sinish 上, r·cos 侧)。法向数值求导。
 */
function* spineTubeJob(s0: number, s1: number, ds: number, cols: number, rad: (s: number, a: number) => number, col: (s: number, a: number) => RGB, capEnds = true, tile = 1.5) {
  const g = new Geo()
  const rings = Math.max(2, Math.ceil((s1 - s0) / ds) + 1)
  const P = (s: number, a: number) => { const r = rad(s, a); return V(s, -Math.cos(a) * r, Math.sin(a) * r) }
  const e = 1e-3
  for (let i = 0; i < rings; i++) {
    if(i % 4 === 0) yield
    const s = lerp(s0, s1, i / (rings - 1))
    for (let j = 0; j <= cols; j++) {
      const a = (j / cols) * Math.PI * 2
      const p = P(s, a)
      const ts = P(s + e, a).sub(P(s - e, a)), ta = P(s, a + e).sub(P(s, a - e))
      const n = ta.cross(ts).normalize()
      if (!Number.isFinite(n.x) || n.lengthSq() < 0.5) n.set(0, -Math.cos(a), Math.sin(a))
      g.v(p, n, col(s, a), [s / tile, (j / cols) * Math.max(1, Math.round(Math.PI * 2 * rad(s, 0) / tile))])
    }
  }
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1
    g.idx.push(a, a + 1, b, a + 1, b + 1, b)
  }
  if (capEnds) for (const [s, ring, dir] of [[s0, 0, -1], [s1, rings - 1, 1]] as [number, number, number][]) {
    const c = g.v(V(s + dir * 0.02, 0, 0), V(dir, 0, 0), col(s, 0))
    for (let j = 0; j < cols; j++) { const a = ring * (cols + 1) + j; if (dir < 0) g.idx.push(c, a + 1, a); else g.idx.push(c, a, a + 1) }
  }
  return g
}

// ---------------------------------------------------------------------------
// 躯体轮廓与皮肤
// ---------------------------------------------------------------------------
function spineTube(...args:Parameters<typeof spineTubeJob>):Geo {const job=spineTubeJob(...args);let step=job.next();while(!step.done)step=job.next();return step.value}
interface BodyOpts { kind: WranglerKind; pregnant: boolean; seed: number; lod: WranglerLod }
/** 受孕雌性鼓胀段（s 米） */
export const BELLY = { s0: 6.5, s1: 15.5 }
/** 卵在鼓胀段里的位置（s, 极角, 大小），确定性 */
function eggSpots(seed: number) {
  const R = rng(seed * 31 + 5), out: { s: number; a: number; k: number }[] = []
  for (let i = 0; i < 26; i++) out.push({ s: lerp(BELLY.s0 + 1.2, BELLY.s1 - 1.2, R()), a: (R() - 0.5) * 2.3, k: 0.7 + R() * 0.5 })
  return out
}
function bellyK(s: number) { return smooth(BELLY.s0, BELLY.s0 + 2.5, s) * (1 - smooth(BELLY.s1 - 2.5, BELLY.s1, s)) }

function profile(o: BodyOpts) {
  const D = WRANGLER_DIM[o.kind], L = D.len, R = D.r
  const eggs = o.pregnant ? eggSpots(o.seed) : []
  // 半径（不含皮肤细节）：颈部从头后收进，尾端 5m（幼体按比例）收尖
  const tailL = o.kind === 'juvenile' ? 1.6 : 6
  const base = (s: number) => {
    const neck = o.kind === 'juvenile' ? lerp(0.82, 1, smooth(0, 0.5, s)) : lerp(0.9, 1, smooth(0, 2.2, s))
    const tail = lerp(0.12, 1, smooth(L, L - tailL, s))
    return R * neck * tail
  }
  const rad = (s: number, a: number) => {
    let r = base(s)
    // 腹面略平
    const ventral = Math.max(0, Math.cos(a))
    r *= 1 - 0.07 * ventral * ventral
    if (o.kind === 'male') {
      // 粗糙起皱：横向褶皱 + 纵向松皮 + 细疙瘩
      const crease = Math.pow(Math.abs(Math.sin(s * Math.PI / 0.42 + fbm(s * 0.6, a, 0, o.seed) * 1.6)), 6)
      const fold = fbm(s * 0.35, Math.cos(a) * 1.2, Math.sin(a) * 1.2, o.seed + 3)
      const grain = fbm(s * 3.1, Math.cos(a) * 3.5, Math.sin(a) * 3.5, o.seed + 9)
      r *= 1 - 0.045 * crease + 0.05 * fold + 0.02 * grain
    } else if (o.kind === 'female') {
      // 体节：每 0.62m 一道隆起环，节间收缩
      const seg = s / 0.62, f = seg - Math.floor(seg)
      const ridge = Math.pow(Math.sin(f * Math.PI), 0.6)
      r *= 0.955 + 0.06 * ridge + 0.012 * fbm(s * 2, Math.cos(a) * 2, Math.sin(a) * 2, o.seed)
      // 腹面横板：腹侧更平、略凸起的板缘
      if (ventral > 0.55) r *= 1 - 0.03 * (ventral - 0.55)
      if (o.pregnant) {
        const b = bellyK(s)
        r *= 1 + b * (0.22 + 0.42 * Math.pow(ventral, 1.3))
        for (const e of eggs) {
          const d2 = Math.pow((s - e.s) / (0.42 * e.k), 2) + Math.pow((a - e.a) / (0.3 * e.k), 2)
          if (d2 < 4) r *= 1 + 0.1 * e.k * Math.exp(-d2) * b
        }
      }
    } else {
      // 幼体：光滑、软，轻微体节
      r *= 1 + 0.03 * Math.sin(s * Math.PI / 0.12) + 0.02 * fbm(s * 4, Math.cos(a), Math.sin(a), o.seed)
    }
    return r
  }
  const col = (s: number, a: number): RGB => {
    const ventral = Math.cos(a) // 1 = 腹面
    if (o.kind === 'male') {
      const crease = Math.pow(Math.abs(Math.sin(s * Math.PI / 0.42 + fbm(s * 0.6, a, 0, o.seed) * 1.6)), 6)
      const mott = fbm(s * 0.9, Math.cos(a) * 1.5, Math.sin(a) * 1.5, o.seed + 21)
      let v = 0.055 + 0.025 * mott - 0.035 * crease + 0.035 * smooth(0.3, 0.95, ventral)
      v *= lerp(1, 0.75, smooth(L - 4, L, s))
      return gray(Math.max(0.02, v), [0.96, 0.98, 1.04])
    }
    if (o.kind === 'female') {
      const seg = s / 0.62, f = seg - Math.floor(seg)
      const gap = Math.pow(1 - Math.sin(f * Math.PI), 4)
      const mott = fbm(s * 0.7, Math.cos(a) * 1.4, Math.sin(a) * 1.4, o.seed + 21)
      let c: RGB = gray(0.045 + 0.018 * mott - 0.025 * gap, [1.05, 1, 0.95])
      if (ventral > 0.5) c = mix(c, gray(0.11 - 0.04 * gap, [1.06, 1.0, 0.92]), smooth(0.5, 0.8, ventral))
      if (o.pregnant) {
        const b = bellyK(s)
        // 腹皮绷薄发灰、透出卵的浅色
        let egg = 0
        for (const e of eggs) { const d2 = Math.pow((s - e.s) / (0.42 * e.k), 2) + Math.pow((a - e.a) / (0.3 * e.k), 2); egg = Math.max(egg, Math.exp(-d2 * 1.3)) }
        c = mix(c, gray(0.15, [1.05, 1.02, 0.9]), b * 0.45 * smooth(0.0, 0.8, ventral + 0.4))
        c = mix(c, [0.36, 0.33, 0.25], b * egg * 0.7)
      }
      return c
    }
    // 幼体外皮：近白的灰，透明材质下显出体内
    const vein = Math.pow(Math.abs(vnoise(s * 6, Math.cos(a) * 4, Math.sin(a) * 4, o.seed + 5)), 0.25) < 0.35 ? 1 : 0
    return mix(gray(0.78, [0.98, 0.99, 1.03]), [0.46, 0.4, 0.44], vein * 0.6)
  }
  return { rad, col, base, L }
}

const LOD_DS: Record<WranglerKind, number[]> = { male: [0.1, 0.32, 1.0], female: [0.1, 0.32, 1.0], juvenile: [0.025, 0.07, 0.2] }
const LOD_COLS = [40, 20, 10]

function bodyGeometry(o: BodyOpts) {
  const P = profile(o)
  return spineTube(0, P.L, LOD_DS[o.kind][o.lod], LOD_COLS[o.lod], P.rad, P.col).build()
}

/** 幼体体内：脊柱珠链、肠管、心囊、两侧血管（全部在脊线空间，跟着身体弯） */
function juvenileOrgans(o: BodyOpts) {
  const P = profile(o), g = new Geo(), L = P.L
  const lod = o.lod
  // 脊柱：一节节椎骨（背侧）
  const step = lod ? 0.09 : 0.045
  for (let s = 0.05; s < L - 0.3; s += step) {
    const r = P.base(s) * 0.17
    const sp = new THREE.SphereGeometry(1, lod ? 5 : 8, lod ? 4 : 6)
    g.addThree(sp, new THREE.Matrix4().compose(V(s, P.base(s) * 0.48, 0), new THREE.Quaternion(), V(step * 0.42, r, r * 1.2)), gray(0.86, [1, 0.98, 0.92]))
  }
  // 肠管：偏腹侧、轻微盘绕
  g.add(spineTube(0.25, L - 0.5, lod ? 0.06 : 0.025, lod ? 6 : 10, (s) => P.base(s) * (0.3 + 0.06 * Math.sin(s * 9)), () => [0.42, 0.34, 0.3]))
  // 两条侧血管
  for (const side of [-1, 1]) {
    const vein = spineTube(0.15, L - 0.4, lod ? 0.08 : 0.03, 5, (s) => P.base(s) * 0.07, () => [0.36, 0.3, 0.42])
    for (let i = 1; i < vein.pos.length; i += 3) vein.pos[i] += 0 // y 不动
    for (let i = 0; i < vein.pos.length; i += 3) vein.pos[i + 2] += side * 0
    // 平移到侧面
    for (let i = 0; i < vein.pos.length; i += 3) { const s = vein.pos[i]; vein.pos[i + 2] += side * P.base(s) * 0.62; vein.pos[i + 1] += P.base(s) * 0.05 }
    g.add(vein)
  }
  // 心囊（颈后）与两枚肝叶
  g.addThree(new THREE.SphereGeometry(1, 12, 9), new THREE.Matrix4().compose(V(0.42, -0.02, 0), new THREE.Quaternion(), V(0.11, 0.08, 0.08)), [0.5, 0.36, 0.38])
  for (const side of [-1, 1]) g.addThree(new THREE.SphereGeometry(1, 10, 7), new THREE.Matrix4().compose(V(0.95, -0.04, side * 0.05), new THREE.Quaternion(), V(0.2, 0.06, 0.07)), [0.4, 0.32, 0.3])
  return g.build()
}

// ---------------------------------------------------------------------------
// 头部（刚体，原点 = 脊线 s=0，+X 向前）
// ---------------------------------------------------------------------------
/** 极坐标雕刻球：dir → 半径倍率 */
function sculptSphere(ws: number, hs: number, scale: THREE.Vector3, shape: (d: THREE.Vector3) => number, color: (d: THREE.Vector3) => RGB, keep?: (d: THREE.Vector3) => boolean, warp?: (p: THREE.Vector3) => THREE.Vector3) {
  const g = new Geo(), grid: number[][] = [], dl: THREE.Vector3[] = []
  const P = (u: number, v: number) => {
    const th = u * Math.PI * 2, ph = v * Math.PI
    const d = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th))
    const p = d.clone().multiply(scale).multiplyScalar(shape(d))
    return { d, p: warp ? warp(p) : p }
  }
  const e = 1e-3
  for (let j = 0; j <= hs; j++) {
    grid.push([])
    for (let i = 0; i <= ws; i++) {
      const u = i / ws, v = j / hs
      const { d, p } = P(u, v)
      const pu = P(u + e, v).p.sub(P(u - e, v).p), pv = P(u, Math.min(1, v + e)).p.sub(P(u, Math.max(0, v - e)).p)
      const n = pu.cross(pv).normalize()
      if (n.dot(d) < 0) n.negate()
      if (!Number.isFinite(n.x) || n.lengthSq() < 0.5) n.copy(d)
      grid[j].push(g.v(p, n, color(d), [u * 4, v * 2])); dl.push(d)
    }
  }
  const dirs = (k: number) => dl[k].clone()
  for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) {
    const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1]
    if (keep) { const m = dirs(a).add(dirs(b)).add(dirs(c)).add(dirs(d)).normalize(); if (!keep(m)) continue }
    g.idx.push(a, b, c, b, d, c)
  }
  return g
}
const gauss = (d: THREE.Vector3, c: THREE.Vector3, w: number) => Math.exp(-d.distanceToSquared(c) / (w * w))

/** 雄性笑口线：头部方位角 az（0 = 正前方）对应的嘴线仰角 el。|az| > AZ_MOUTH 之后迅速下坠，并入颈部 */
const AZ_MOUTH = 1.2
function grinEl(az: number) {
  const t = Math.abs(az) / AZ_MOUTH
  if (t <= 1) return -0.24 + 0.3 * Math.pow(t, 1.7)
  return 0.06 - (t - 1) * 3.2
}
const dirAz = (d: THREE.Vector3) => Math.atan2(d.z, d.x)
const dirEl = (d: THREE.Vector3) => Math.asin(Math.max(-1, Math.min(1, d.y)))
const g1 = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2))
const AE = (az: number, el: number) => V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))

export interface WranglerHeadRig {
  head: THREE.Group
  /** 雄性下颌（绕 z 轴转，负值张嘴） */
  jaw?: THREE.Group
  /** 雌性口器钳（绕 y 轴向外张） */
  pincers?: THREE.Group[]
  eyes: THREE.Mesh[]
  light?: THREE.PointLight
}

/** 通用扫掠管（平行移动标架），半径 r(t)，截面按 flat 压扁（侧向） */
function sweepTube(pts: THREE.Vector3[], seg: number, radial: number, r: (t: number) => number, col: (t: number, a: number) => RGB, flat = 1, up = V(0, 1, 0)) {
  const curve = new THREE.CatmullRomCurve3(pts), g = new Geo()
  let n = up.clone()
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t), T = curve.getTangentAt(t)
    n.addScaledVector(T, -n.dot(T)).normalize()
    const b = T.clone().cross(n).normalize()
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, rr = r(t)
      const off = n.clone().multiplyScalar(Math.cos(a) * rr).addScaledVector(b, Math.sin(a) * rr * flat)
      const nn = n.clone().multiplyScalar(Math.cos(a) * flat).addScaledVector(b, Math.sin(a)).normalize()
      g.v(c.clone().add(off), nn, col(t, a), [t * 2, j / radial])
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; g.idx.push(a, b, a + 1, a + 1, b, b + 1) }
  const tip = g.v(curve.getPointAt(1).addScaledVector(curve.getTangentAt(1), r(1) * 0.8), curve.getTangentAt(1), col(1, 0), [2, 0])
  for (let j = 0; j < radial; j++) { const a = seg * (radial + 1) + j; g.idx.push(a, tip, a + 1) }
  return g
}

/** 发光眼：中心炽白、边缘转灰蓝的眼球（不是平涂白片），外加一圈加色光晕 */
let haloTex: THREE.Texture | null = null
function eyeHalo() {
  if (haloTex) return haloTex
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(235,240,255,0.55)'); gr.addColorStop(0.35, 'rgba(200,215,255,0.18)'); gr.addColorStop(1, 'rgba(180,200,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  haloTex = new THREE.CanvasTexture(cv); haloTex.colorSpace = THREE.SRGBColorSpace; haloTex.userData.shared = true
  return haloTex
}
function glowEye(M: Mats, pos: THREE.Vector3, dir: THREE.Vector3, size: [number, number, number], tilt: number, haloK: number, lod: WranglerLod) {
  const geo = new THREE.SphereGeometry(1, [24, 14, 8][lod], [16, 10, 6][lod])
  const P = geo.attributes.position, cols: number[] = []
  for (let i = 0; i < P.count; i++) {
    // 本地 -z 朝外：中心最亮
    const k = smooth(0.1, 0.98, -P.getZ(i)), rim = Math.hypot(P.getX(i), P.getY(i))
    const v = 0.04 + 0.96 * Math.pow(1 - smooth(0.0, 0.97, rim), 1.6) * lerp(0.7, 1, k)
    cols.push(v * 0.93, v * 0.96, v)
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  const e = new THREE.Mesh(geo, M.eye)
  e.position.copy(pos)
  e.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(V(0, 0, 0), dir, V(0, 1, 0)))
  e.rotateZ(tilt)
  e.scale.set(size[0], size[1], size[2]); e.name = 'wranglerEye'
  if (lod < 2 && haloK > 0) {
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeHalo(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }))
    h.scale.setScalar(Math.max(size[0], size[1]) * haloK / Math.max(size[0], size[1], size[2]))
    // sprite 挂在头上而不是被压扁的眼球上
    h.position.copy(pos).addScaledVector(dir, 0.05); h.scale.setScalar(Math.max(size[0], size[1]) * haloK)
    h.renderOrder = 3; e.userData.halo = h
  }
  return e
}

function maleHead(lod: WranglerLod, M: Mats): WranglerHeadRig {
  const R = WRANGLER_DIM.male.head
  const head = new THREE.Group()
  // 拉长的头骨：前端是一张人脸，后脑收进颈部（宽度与躯干相当，不再是套在管子上的球）
  const hc = V(0.86, 0.06, 0)
  const scale = V(R * 1.42, R * 0.86, R * 0.82)
  const ws = [96, 48, 20][lod], hs = [72, 36, 14][lod]
  const shape = (d: THREE.Vector3) => {
    const az = dirAz(d), el = dirEl(d), aa = Math.abs(az)
    let k = 1
    k -= 0.1 * smooth(0.72, 1, d.x) // 面部前平
    k += 0.075 * g1(el, 0.3, 0.07) * g1(az, 0, 0.5) // 眉弓
    for (const s of [-1, 1]) {
      k -= 0.13 * gauss(d, AE(s * 0.3, 0.17), 0.12) // 深眼窝
      k += 0.05 * gauss(d, AE(s * 0.62, 0.04), 0.15) // 颧骨
      k -= 0.06 * gauss(d, AE(s * 0.58, -0.17), 0.15) // 凹陷的两颊
      k -= 0.04 * gauss(d, AE(s * 0.95, 0.42), 0.3) // 太阳穴
      k -= 0.035 * gauss(d, AE(s * 0.075, -0.06), 0.035) // 鼻孔
      // 鼻唇沟：从鼻翼斜拉到嘴角
      if (el > grinEl(az) && el < 0.06) k -= 0.022 * g1(aa, 0.18 + (0.06 - el) * 1.6, 0.035)
    }
    k += 0.06 * g1(az, 0, 0.065) * smooth(-0.06, 0.04, el) * (1 - smooth(0.2, 0.3, el)) // 鼻梁
    k += 0.07 * gauss(d, AE(0, -0.03), 0.075) // 鼻头
    k += 0.05 * gauss(d, AE(0, -0.5), 0.2) // 下巴
    for (const fe of [0.45, 0.53, 0.61]) k -= 0.007 * g1(el, fe, 0.012) * g1(az, 0, 0.45) // 抬头纹
    // 笑口：深沟 + 上下唇的隆起
    if (aa < AZ_MOUTH + 0.12) {
      const ge = grinEl(az), fade = smooth(AZ_MOUTH + 0.12, AZ_MOUTH - 0.1, aa)
      k -= 0.13 * g1(el, ge, 0.03) * fade
      k += 0.028 * (g1(el, ge + 0.065, 0.035) + g1(el, ge - 0.06, 0.035)) * fade
    }
    k += 0.012 * fbm(d.x * 7, d.y * 7, d.z * 7, 41) + 0.005 * fbm(d.x * 25, d.y * 25, d.z * 25, 43)
    return k
  }
  const color = (d: THREE.Vector3): RGB => {
    const az = dirAz(d), el = dirEl(d)
    let v = 0.058 + 0.018 * fbm(d.x * 3, d.y * 3, d.z * 3, 17)
    for (const s of [-1, 1]) v -= 0.035 * gauss(d, AE(s * 0.3, 0.17), 0.11)
    if (Math.abs(az) < AZ_MOUTH + 0.1) v -= 0.045 * g1(el, grinEl(az), 0.035)
    v += 0.012 * g1(el, 0.3, 0.06) * g1(az, 0, 0.5) + 0.01 * gauss(d, AE(0, -0.03), 0.07) // 骨突处略亮
    return gray(Math.max(0.012, v), [0.97, 0.98, 1.03])
  }
  const inJaw = (d: THREE.Vector3) => { const az = dirAz(d); return Math.abs(az) < AZ_MOUTH + 0.45 && dirEl(d) < grinEl(az) }
  // 颅骨轮廓：面部比后脑窄，下颌向下巴收窄，后脑略高——正面看是一张窄长的脸，不再是一颗球
  const warp = (p: THREE.Vector3) => {
    const fx = p.x / scale.x, fy = p.y / scale.y
    const zk = lerp(1, 0.7, smooth(-0.1, 1, fx)) * (1 - 0.2 * smooth(0, -1, fy) * smooth(-0.2, 0.8, fx))
    return V(p.x, p.y * (1 + 0.1 * smooth(-0.6, 0.3, fx) * Math.max(0, fy)) - 0.06 * smooth(0.3, 1, fx) * Math.max(0, -fy) * scale.y, p.z * zk)
  }
  const skull = sculptSphere(ws, hs, scale, shape, color, (d) => !inJaw(d), warp).build()
  const jawG = sculptSphere(ws, hs, scale, shape, color, inJaw, warp).build()
  skull.translate(hc.x, hc.y, hc.z); jawG.translate(hc.x, hc.y, hc.z)
  const skullM = new THREE.Mesh(skull, M.headSkinDS); skullM.name = 'wranglerSkull'; head.add(skullM)
  const cav = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), M.void) // 黑色口腔
  cav.scale.copy(scale).multiplyScalar(0.8); cav.scale.z *= 0.8; cav.position.copy(hc); head.add(cav)
  const hinge = V(hc.x - R * 0.62, hc.y - R * 0.08, 0)
  const jaw = new THREE.Group(); jaw.position.copy(hinge); head.add(jaw)
  jawG.translate(-hinge.x, -hinge.y, -hinge.z)
  const jawM = new THREE.Mesh(jawG, M.headSkinDS); jawM.name = 'wranglerJaw'; jaw.add(jawM)
  // 牙龈：沿嘴线、藏在唇后的深灰肉条（不做红色）
  const gum = (sgn: number) => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 24; i++) { const az = (i / 24 - 0.5) * 2 * (AZ_MOUTH - 0.08), el = grinEl(az) + sgn * 0.022; pts.push(warp(AE(az, el).multiply(scale).multiplyScalar(0.885)).add(hc)) }
    return sweepTube(pts, [40, 20, 8][lod], 5, () => 0.03, () => [0.085, 0.07, 0.072], 1)
  }
  // 牙：大小不一、发黄、有缺有断
  const up = gum(1), lo = gum(-1), nT = [36, 20, 0][lod], RT = rng(77)
  for (let i = 0; i < nT; i++) {
    if (RT() < 0.1) continue
    const az = (i / (nT - 1) - 0.5) * 2 * (AZ_MOUTH - 0.12) + (RT() - 0.5) * 0.03
    for (const [dst, sgn] of [[up, -1], [lo, 1]] as [Geo, number][]) {
      const el = grinEl(az), d = AE(az, el)
      const p = warp(d.clone().multiply(scale).multiplyScalar(0.875)).add(hc)
      const center = 1 - 0.5 * Math.abs(az) / AZ_MOUTH
      const len = (0.03 + 0.045 * center) * (0.6 + 0.7 * RT()) * (RT() < 0.08 ? 0.45 : 1)
      const wid = 0.014 + 0.012 * RT() + 0.008 * center
      const cone = new THREE.CylinderGeometry(wid * 0.25, wid, len, 7, 2); cone.translate(0, len / 2, 0)
      const dirT = V(0, sgn, 0).addScaledVector(d, 0.3 + RT() * 0.25).add(V(RT() - 0.5, 0, RT() - 0.5).multiplyScalar(0.25)).normalize()
      const m = new THREE.Matrix4().compose(p.clone().addScaledVector(V(0, -sgn, 0), 0.03), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dirT), V(1, 1, 0.8))
      const tint = 0.75 + 0.3 * RT()
      dst.addThree(cone, m, (q) => { const tipK = Math.abs(q.y - p.y) / len; return [0.3 * tint * (1 + 0.25 * tipK), 0.27 * tint * (1 + 0.25 * tipK), 0.2 * tint * (1 + 0.15 * tipK)] })
    }
  }
  const gm = (g: Geo) => new THREE.Mesh(g.build(), M.teeth)
  head.add(gm(up))
  for (let i = 0; i < lo.pos.length; i += 3) { lo.pos[i] -= hinge.x; lo.pos[i + 1] -= hinge.y; lo.pos[i + 2] -= hinge.z }
  jaw.add(gm(lo))
  // 眼：深陷在眼窝里的细长斜眼（内眼角低、外眼角高），中心炽白
  const eyes: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    const d = AE(s * 0.3, 0.17)
    const e = glowEye(M, warp(d.clone().multiply(scale).multiplyScalar(0.855)).add(hc), d, [0.09, 0.028, 0.04], -s * 0.3, 0.5, lod)
    head.add(e); if (e.userData.halo) head.add(e.userData.halo); eyes.push(e)
  }
  return { head, jaw, eyes }
}

function femaleHead(lod: WranglerLod, M: Mats): WranglerHeadRig {
  const R = WRANGLER_DIM.female.head
  const head = new THREE.Group()
  // 楔形头壳：背面隆起分块，腹面平，前端收窄成口区
  const hc = V(0.78, 0.02, 0)
  const scale = V(R * 1.22, R * 0.78, R * 0.95)
  const ws = [96, 48, 20][lod], hs = [72, 36, 14][lod]
  const EYE = [-1, 1].map((s) => AE(s * 0.5, 0.3))
  const MOUTH = AE(0, -0.42)
  const shape = (d: THREE.Vector3) => {
    const az = dirAz(d), el = dirEl(d), aa = Math.abs(az)
    let k = 1
    k -= 0.1 * smooth(0.1, -0.9, d.y) * smooth(-0.2, -0.9, d.y) // 腹面压平
    k -= 0.12 * smooth(0.55, 1, d.x) * smooth(0.1, -0.5, el) // 前下方收成口区
    // 头壳骨片：背中缝 + 两道横沟 + 两侧颊片边
    k -= 0.03 * g1(az, 0, 0.025) * smooth(0.05, 0.3, el)
    for (const cx of [0.15, 0.55]) k -= 0.035 * g1(d.x, cx, 0.028) * smooth(-0.15, 0.1, el)
    k += 0.02 * smooth(0.15, 0.2, d.x) * (1 - smooth(0.5, 0.55, d.x)) * smooth(0, 0.3, el) // 中间那块隆起
    for (const s of [-1, 1]) k -= 0.03 * g1(az, s * 1.05, 0.04) * smooth(-0.6, -0.1, el) * (1 - smooth(0.2, 0.5, el))
    // 唇基板：口区上方一块凸起的板
    k += 0.05 * gauss(d, AE(0, -0.16), 0.17) * smooth(0.6, 0.9, d.x)
    // 眼：凸起的眼眶环 + 深眼窝
    for (const e of EYE) { const r = Math.sqrt(d.distanceToSquared(e)); k += 0.04 * g1(r, 0.12, 0.03) - 0.045 * g1(r, 0, 0.09) }
    k -= 0.1 * gauss(d, MOUTH, 0.13)
    // 甲面细密凹坑
    k -= 0.006 * Math.max(0, vnoise(d.x * 30, d.y * 30, d.z * 30, 61))
    k += 0.008 * fbm(d.x * 6, d.y * 6, d.z * 6, 77)
    return k + 0 * aa
  }
  const color = (d: THREE.Vector3): RGB => {
    const az = dirAz(d), el = dirEl(d)
    let v = 0.048 + 0.016 * fbm(d.x * 3, d.y * 3, d.z * 3, 5)
    v -= 0.025 * g1(az, 0, 0.03) * smooth(0.05, 0.3, el)
    for (const cx of [0.15, 0.55]) { v -= 0.025 * g1(d.x, cx, 0.025); v += 0.02 * g1(d.x, cx + 0.05, 0.03) * smooth(-0.15, 0.1, el) } // 沟暗、骨片边缘磨亮
    v -= 0.04 * gauss(d, MOUTH, 0.15)
    for (const e of EYE) { const r = Math.sqrt(d.distanceToSquared(e)); v += 0.025 * g1(r, 0.14, 0.03) - 0.03 * g1(r, 0, 0.1) }
    return gray(Math.max(0.012, v), [1.08, 1.0, 0.9])
  }
  // 楔形：前端收窄
  const warp = (p: THREE.Vector3) => { const fx = p.x / scale.x; return V(p.x, p.y, p.z * lerp(1, 0.72, smooth(-0.2, 1, fx))) }
  const W = (d: THREE.Vector3, k: number) => warp(d.clone().multiply(scale).multiplyScalar(k)).add(hc)
  const g = sculptSphere(ws, hs, scale, shape, color, undefined, warp).build(); g.translate(hc.x, hc.y, hc.z)
  head.add(new THREE.Mesh(g, M.chitin))
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.void)
  mouth.scale.set(0.14, 0.09, 0.15); mouth.position.copy(W(MOUTH, 0.8)); mouth.scale.z *= 0.75; head.add(mouth)
  // 口器钳：粗壮的基节 + 关节环 + 向前再向内弯的刃，刃内缘一排锯齿，尖端磨亮
  const pincers: THREE.Group[] = []
  const seg = [28, 14, 6][lod], radial = [10, 7, 4][lod]
  const chit = (t: number, a: number): RGB => { const edge = Math.pow(Math.max(0, Math.sin(a)), 6); return gray(0.05 + 0.05 * t * t + 0.03 * edge, [1.1, 1.0, 0.86]) }
  for (const sd of [-1, 1]) {
    const root = W(AE(sd * 0.24, -0.34), 0.9)
    const pg = new THREE.Group(); pg.position.copy(root); head.add(pg)
    const geo = new Geo()
    const base = [V(-0.08, 0.02, -sd * 0.06), V(0.12, -0.03, sd * 0.03), V(0.3, -0.06, sd * 0.06)]
    geo.add(sweepTube(base, Math.max(4, seg / 3), radial, (t) => 0.14 - 0.035 * t + 0.02 * g1(t, 0.95, 0.08), chit, 0.75))
    const blade = [V(0.28, -0.06, sd * 0.06), V(0.46, -0.1, sd * 0.1), V(0.62, -0.13, sd * 0.04), V(0.72, -0.13, -sd * 0.08), V(0.75, -0.12, -sd * 0.2)]
    geo.add(sweepTube(blade, seg, radial, (t) => 0.09 * (1 - t) ** 0.8 + 0.004, chit, 0.55))
    const bc = new THREE.CatmullRomCurve3(blade)
    if (lod < 2) for (let i = 1; i < 9; i++) {
      const t = 0.1 + i * 0.075, c = bc.getPointAt(t), tg = bc.getTangentAt(t)
      const inward = V(0, 0, -sd).addScaledVector(tg, -V(0, 0, -sd).dot(tg)).normalize()
      const len = 0.06 * (1 - t * 0.6) * (i % 2 ? 1 : 0.6)
      const cone = new THREE.ConeGeometry(0.02 * (1 - t * 0.5), len, 4); cone.translate(0, len / 2 + 0.03 * (1 - t), 0)
      geo.addThree(cone, new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), inward), V(1, 1, 1)), [0.13, 0.12, 0.1])
    }
    pg.add(new THREE.Mesh(geo.build(), M.chitin)); pincers.push(pg)
  }
  // 分三节的须肢
  if (lod < 2) for (const sd of [-1, 1]) {
    const pts = [V(0, 0, 0), V(0.16, -0.08, sd * 0.06), V(0.3, -0.2, sd * 0.1), V(0.42, -0.26, sd * 0.08)]
    const t = sweepTube(pts, 12, 6, (u) => 0.03 * (1 - u * 0.5) * (1 + 0.35 * Math.max(0, Math.sin(u * Math.PI * 3)) ** 8), (u) => gray(0.06 + 0.03 * u, [1.1, 1, 0.86]))
    const m = new THREE.Mesh(t.build(), M.chitin); m.position.copy(W(AE(sd * 0.2, -0.32), 0.92)); head.add(m)
  }
  // 眼：凹进眼眶的两只圆眼，中心炽白
  const eyes: THREE.Mesh[] = []
  for (const e of EYE) {
    const ge = glowEye(M, W(e, 0.95), e, [0.085, 0.075, 0.05], 0, 0.4, lod)
    head.add(ge); if (ge.userData.halo) head.add(ge.userData.halo); eyes.push(ge)
  }
  return { head, pincers, eyes }
}

function juvenileHead(lod: WranglerLod, M: Mats): WranglerHeadRig {
  const R = WRANGLER_DIM.juvenile.head
  const head = new THREE.Group()
  const hc = V(0.2, 0.02, 0), scale = V(R * 1.3, R * 0.78, R * 0.8)
  const ws = [48, 24, 12][lod], hs = [32, 16, 8][lod]
  const EYE = [-1, 1].map((s) => AE(s * 0.36, 0.22)), MOUTH = AE(0, -0.28)
  const g = sculptSphere(ws, hs, scale, (d) => {
    let k = 1 - 0.08 * smooth(0.75, 1, d.x)
    for (const e of EYE) k -= 0.07 * gauss(d, e, 0.12)
    k -= 0.08 * g1(dirEl(d), -0.26, 0.03) * g1(dirAz(d), 0, 0.5) // 口裂
    return k
  }, () => gray(0.8, [0.98, 0.99, 1.03])).build()
  g.translate(hc.x, hc.y, hc.z)
  const hm = new THREE.Mesh(g, M.headSkin); hm.renderOrder = 1; head.add(hm)
  const brain = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), M.headOrgan); brain.scale.set(R * 0.4, R * 0.24, R * 0.3); brain.position.set(hc.x - R * 0.25, hc.y + R * 0.12, 0); head.add(brain)
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), M.void); mouth.scale.set(0.03, 0.012, 0.09); mouth.position.copy(MOUTH.clone().multiply(scale).multiplyScalar(0.9).add(hc)); head.add(mouth)
  const eyes: THREE.Mesh[] = []
  for (const e of EYE) { const ge = glowEye(M, e.clone().multiply(scale).multiplyScalar(0.94).add(hc), e, [0.04, 0.032, 0.02], 0, 0.14, lod); head.add(ge); if (ge.userData.halo) head.add(ge.userData.halo); eyes.push(ge) }
  return { head, eyes }
}

// ---------------------------------------------------------------------------
// 皮肤纹理（程序化；颜色贴图接近白色只做细节，明暗仍由顶点色决定；同一张图兼作凹凸贴图）
// ---------------------------------------------------------------------------
const skinTex = new Map<string, THREE.CanvasTexture>()
function* skinTextureJob(kind: 'wrinkle' | 'chitin' | 'membrane'):Generator<void,THREE.CanvasTexture> {
  let t = skinTex.get(kind)
  if (t) return t
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d')!, img = g.createImageData(S, S), R = rng(kind.length * 97)
  const h = new Float32Array(S * S)
  const wrap = (x: number) => ((x % S) + S) % S
  for (let y = 0; y < S; y++) {
    if(y % 16 === 0) yield
    for (let x = 0; x < S; x++) {
    const u = x / S * 8, v = y / S * 8
    // 可平铺噪声：周期 8
    const n = (a: number, b: number, f: number, sd: number) => { const p = 8 * f; return vnoise((a * f) % p, (b * f) % p, 0, sd) }
    let val = 0
    if (kind === 'wrinkle') {
      // 粗糙起皱的湿皮：交错褶皱 + 毛孔
      const w1 = 1 - Math.abs(n(u, v * 0.35, 1, 3)), w2 = 1 - Math.abs(n(u * 0.4, v, 2, 5))
      val = 0.55 + 0.25 * Math.pow(w1, 6) + 0.15 * Math.pow(w2, 8) + 0.1 * n(u, v, 4, 9)
    } else if (kind === 'chitin') {
      val = 0.62 + 0.12 * n(u, v, 2, 11) + 0.06 * n(u, v, 8, 13)
    } else {
      val = 0.7 + 0.08 * n(u, v, 2, 17) + 0.12 * Math.pow(1 - Math.abs(n(u, v, 1.5, 19)), 12)
    }
    h[y * S + x] = val
  }}
  // 毛孔 / 凹坑
  const pits = kind === 'wrinkle' ? 2600 : kind === 'chitin' ? 4000 : 600
  for (let k = 0; k < pits; k++) { const cx = R() * S, cy = R() * S, r = 1 + R() * (kind === 'chitin' ? 1.5 : 2.2); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const d = Math.hypot(dx, dy); if (d < r) h[wrap(Math.round(cy) + dy) * S + wrap(Math.round(cx) + dx)] -= 0.18 * (1 - d / r) } }
  for (let i = 0; i < S * S; i++) { const c = Math.max(0, Math.min(255, h[i] * 255 + 60)); img.data[i * 4] = c; img.data[i * 4 + 1] = c; img.data[i * 4 + 2] = c; img.data[i * 4 + 3] = 255 }
  g.putImageData(img, 0, 0)
  t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.shared = true
  skinTex.set(kind, t)
  return t
}

// ---------------------------------------------------------------------------
// 材质与脊线着色器
// ---------------------------------------------------------------------------
function skinTexture(kind:'wrinkle'|'chitin'|'membrane'):THREE.CanvasTexture {const job=skinTextureJob(kind);let step=job.next();while(!step.done)step=job.next();return step.value}
interface Mats { skin: THREE.Material; headSkin: THREE.Material; headSkinDS: THREE.Material; headOrgan: THREE.Material; chitin: THREE.Material; teeth: THREE.Material; eye: THREE.Material; void: THREE.Material; organ: THREE.Material }
export interface SpineUniforms { wSpine: { value: THREE.DataTexture }; wDs: { value: number }; wN: { value: number }; wBulge: { value: THREE.Vector2 } }

function installSpine(mat: THREE.Material, u: SpineUniforms) {
  const prev = mat.onBeforeCompile.bind(mat)
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r)
    Object.assign(shader.uniforms, u)
    shader.vertexShader = `uniform highp sampler2D wSpine; uniform float wDs; uniform float wN; uniform vec2 wBulge;
      vec3 wP; vec3 wT; vec3 wNn; vec3 wB;
      void wFrame(float s) {
        float u = clamp(s / wDs, 0.0, wN - 1.001);
        int i = int(floor(u)); float f = u - float(i);
        vec3 p0 = texelFetch(wSpine, ivec2(i, 0), 0).xyz, p1 = texelFetch(wSpine, ivec2(i + 1, 0), 0).xyz;
        vec3 n0 = texelFetch(wSpine, ivec2(i, 1), 0).xyz, n1 = texelFetch(wSpine, ivec2(i + 1, 1), 0).xyz;
        wT = normalize(p1 - p0);
        wP = mix(p0, p1, f) + wT * min(s, 0.0);
        wNn = normalize(mix(n0, n1, f));
        wB = normalize(cross(wNn, wT));
        wNn = cross(wT, wB);
      }
    ` + shader.vertexShader
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', `wFrame(position.x);
        vec3 objectNormal = normalize(wT * normal.x + wNn * normal.y + wB * normal.z);
        #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `float wK = 1.0 + wBulge.y * exp(-pow((position.x - wBulge.x) / 1.3, 2.0));
        vec3 transformed = wP + (wNn * position.y + wB * position.z) * wK;`)
  }
  const prevKey = mat.customProgramCacheKey.bind(mat)
  mat.customProgramCacheKey = () => prevKey() + '|wranglerSpine'
}

function makeMats(kind: WranglerKind): Mats {
  const juvenile = kind === 'juvenile'
  const sk = skinTexture(juvenile ? 'membrane' : kind === 'male' ? 'wrinkle' : 'chitin')
  const ch = skinTexture('chitin')
  const tex = (t: THREE.Texture, bump: number) => ({ map: t, bumpMap: t, bumpScale: bump })
  const flesh = (o: number) => juvenile
    ? litMaterial({ color: '#ffffff', vertexColors: true, transparent: true, opacity: o, depthWrite: false, roughness: 0.22, envBase: 0.7, ...tex(sk, 0.6) })
    : litMaterial({ color: '#ffffff', vertexColors: true, roughness: kind === 'male' ? 0.5 : 0.36, envBase: 0.35, ...tex(sk, kind === 'male' ? 2.4 : 1.2) })
  const skin = flesh(0.38), headSkin = flesh(0.42), headSkinDS = flesh(0.42)
  headSkinDS.side = THREE.DoubleSide // 张嘴时能看见下颌与上颚内面
  const chitin = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.32, envBase: 0.45, ...tex(ch, 1.0) })
  const teeth = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.45, envBase: 0.4 })
  const eye = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, toneMapped: false })
  const voidM = new THREE.MeshBasicMaterial({ color: '#000000' })
  const organ = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.45, emissive: '#2a2224', emissiveIntensity: 0.6 })
  const headOrgan = litMaterial({ color: '#8a8282', roughness: 0.45, emissive: '#2a2224', emissiveIntensity: 0.6 })
  return { skin, headSkin, headSkinDS, headOrgan, chitin, teeth, eye, void: voidM, organ }
}

// ---------------------------------------------------------------------------
// 几何缓存
// ---------------------------------------------------------------------------
const geoCache = new Map<string, { body: THREE.BufferGeometry; organs?: THREE.BufferGeometry }>()
function bodyGeo(kind: WranglerKind, pregnant: boolean, lod: WranglerLod) {
  const key = `${kind}|${pregnant}|${lod}`
  let g = geoCache.get(key)
  if (!g) {
    const o: BodyOpts = { kind, pregnant, seed: kind === 'male' ? 3 : kind === 'female' ? 5 : 8, lod }
    g = { body: bodyGeometry(o), organs: kind === 'juvenile' ? juvenileOrgans(o) : undefined }
    geoCache.set(key, g)
  }
  return g
}
/** 预先生成某变种几何（分帧准备用） */
export function prepareWranglerGeometry(kind: WranglerKind, pregnant = false, lod: WranglerLod = 0) { bodyGeo(kind, pregnant, lod) }
export function wranglerGeometryReady(kind: WranglerKind, pregnant = false, lod: WranglerLod = 0) { return geoCache.has(`${kind}|${pregnant}|${lod}`) }

// ---------------------------------------------------------------------------
// 构建与脊线
// ---------------------------------------------------------------------------
/** Cooperative preparation keeps procedural texture/body generation out of the first visible encounter. */
export function* prepareWranglerJob(kind:WranglerKind,pregnant=false,lod:WranglerLod=0):Generator<void,void> {
  const skin=kind==='male'?'wrinkle':kind==='female'?'chitin':'membrane'
  yield* skinTextureJob(skin); yield* skinTextureJob('chitin'); eyeHalo(); yield
  const key=kind+'|'+(kind==='female'&&pregnant)+'|'+lod
  if(geoCache.has(key))return
  const o:BodyOpts={kind,pregnant:kind==='female'&&pregnant,lod,seed:kind==='male'?3:kind==='female'?5:8},P=profile(o)
  const tube=yield* spineTubeJob(0,P.L,LOD_DS[kind][lod],LOD_COLS[lod],P.rad,P.col)
  let body:THREE.BufferGeometry|undefined
  try {body=tube.build();yield;const organs=kind==='juvenile'?juvenileOrgans(o):undefined;geoCache.set(key,{body,organs});body=undefined} finally {body?.dispose()}
}
export function wranglerResourcesReady(kind:WranglerKind,pregnant=false,lod:WranglerLod=0){return wranglerGeometryReady(kind,kind==='female'&&pregnant,lod)&&skinTex.has(kind==='male'?'wrinkle':kind==='female'?'chitin':'membrane')&&skinTex.has('chitin')&&!!haloTex}

export interface WranglerRig {
  kind: WranglerKind; pregnant: boolean; len: number
  u: SpineUniforms; data: Float32Array
  body: THREE.Mesh; organs?: THREE.Mesh
  headRig: WranglerHeadRig
  /** 最近一次 setSpine 的脊线点（本地坐标，SPINE_N 个，间距 len/(N-1)）与法向 */
  pts: THREE.Vector3[]; nrm: THREE.Vector3[]
}

export function buildWranglerMesh(kind: WranglerKind, o: { pregnant?: boolean; lod?: WranglerLod; light?: boolean } = {}): THREE.Group {
  const pregnant = kind === 'female' && !!o.pregnant, lod = o.lod ?? 0
  const M = makeMats(kind)
  const D = WRANGLER_DIM[kind]
  const data = new Float32Array(SPINE_N * 2 * 4)
  const tex = new THREE.DataTexture(data, SPINE_N, 2, THREE.RGBAFormat, THREE.FloatType)
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true
  let spineDisposed = false
  M.skin.addEventListener('dispose', () => { if (spineDisposed) return; spineDisposed = true; tex.dispose() })
  const u: SpineUniforms = { wSpine: { value: tex }, wDs: { value: D.len / (SPINE_N - 1) }, wN: { value: SPINE_N }, wBulge: { value: new THREE.Vector2(-100, 0) } }
  installSpine(M.skin, u)
  const G = bodyGeo(kind, pregnant, lod)
  const grp = new THREE.Group()
  const body = new THREE.Mesh(G.body.clone(), M.skin); body.frustumCulled = false; body.name = 'wranglerBody'
  body.userData.noCastShadow = true // 着色器摆位，影子深度材质没有同样的形变
  let organs: THREE.Mesh | undefined
  if (G.organs) {
    installSpine(M.organ, u)
    organs = new THREE.Mesh(G.organs.clone(), M.organ); organs.frustumCulled = false; organs.userData.noCastShadow = true; organs.renderOrder = 0
    body.renderOrder = 1
    grp.add(organs)
  }
  grp.add(body)
  const headRig = kind === 'male' ? maleHead(lod, M) : kind === 'female' ? femaleHead(lod, M) : juvenileHead(lod, M)
  if (o.light && kind !== 'juvenile') {
    const l = new THREE.PointLight('#e8eeff', kind === 'male' ? 2.2 : 2.6, 9, 1.6)
    l.position.set(D.head * 1.6, D.head * 0.35, 0); headRig.head.add(l); headRig.light = l
  }
  grp.add(headRig.head)
  const rig: WranglerRig = { kind, pregnant, len: D.len, u, data, body, organs, headRig, pts: [], nrm: [] }
  grp.userData.wranglerRig = rig
  grp.userData.entType = 'wrangler'
  // 默认姿态：沿 -X 平伸（头在原点朝 +X）
  setWranglerSpine(rig, [V(0, 0, 0), V(-D.len, 0, 0)])
  return grp
}

const _m = new THREE.Matrix4()
/**
 * 设定脊线：path 为本地坐标折线（从头后颈 s=0 往尾巴），按弧长重采样成 SPINE_N 点；不够长则沿末段方向延伸。
 * roll(s) 返回绕切线的滚转角（钻地螺旋用）。up 为初始法向参考。
 */
export function setWranglerSpine(rig: WranglerRig, path: THREE.Vector3[], roll?: (s: number) => number, up = V(0, 1, 0)) {
  const N = SPINE_N, ds = rig.len / (N - 1)
  // 弧长重采样
  const pts: THREE.Vector3[] = [path[0].clone()]
  let seg = 0, acc = 0
  const segLen = (k: number) => path[k + 1].distanceTo(path[k])
  for (let i = 1; i < N; i++) {
    let need = ds
    let cur = pts[i - 1].clone()
    while (need > 1e-9) {
      if (seg >= path.length - 1) { // 延伸
        const d = path.length > 1 ? path[path.length - 1].clone().sub(path[path.length - 2]).normalize() : V(-1, 0, 0)
        cur.addScaledVector(d, need); need = 0; break
      }
      const left = segLen(seg) - acc
      if (left >= need) { acc += need; cur = path[seg].clone().lerp(path[seg + 1], acc / segLen(seg)); need = 0 }
      else { need -= left; seg++; acc = 0; cur = path[Math.min(seg, path.length - 1)].clone() }
    }
    pts.push(cur)
  }
  // 平行移动标架
  const nrm: THREE.Vector3[] = []
  let n = up.clone()
  for (let i = 0; i < N; i++) {
    const t = pts[Math.min(N - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize()
    n.addScaledVector(t, -n.dot(t))
    if (n.lengthSq() < 1e-6) n = Math.abs(t.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)
    n.addScaledVector(t, -n.dot(t)).normalize()
    const r = roll ? roll(i * ds) : 0
    nrm.push(r ? n.clone().applyAxisAngle(t, r) : n.clone())
  }
  for (let i = 0; i < N; i++) {
    rig.data.set([pts[i].x, pts[i].y, pts[i].z, 1], i * 4)
    rig.data.set([nrm[i].x, nrm[i].y, nrm[i].z, 0], (N + i) * 4)
  }
  rig.u.wSpine.value.needsUpdate = true
  rig.pts = pts; rig.nrm = nrm
  // 头：摆到 s=0 标架（前 = -T）
  const T = pts[1].clone().sub(pts[0]).normalize().negate()
  const Nn = nrm[0].clone(), B = T.clone().cross(Nn).normalize()
  Nn.copy(B.clone().cross(T)).normalize()
  _m.makeBasis(T, Nn, B).setPosition(pts[0])
  rig.headRig.head.matrixAutoUpdate = true
  rig.headRig.head.position.setFromMatrixPosition(_m)
  rig.headRig.head.quaternion.setFromRotationMatrix(_m)
}

/** 张嘴：雄性下颌 0–1（1 ≈ 100° 脱臼式吞咽），雌性口器钳 0–1 外张 */
export function setWranglerMouth(rig: WranglerRig, k: number) {
  if (rig.headRig.jaw) rig.headRig.jaw.rotation.z = -k * 1.75
  if (rig.headRig.pincers) rig.headRig.pincers.forEach((p, i) => { p.rotation.y = (i === 0 ? -1 : 1) * -k * 0.7 })
}

/** 吞咽鼓包：s 米处（<0 关闭）的身体被撑粗约 40% */
export function setWranglerBulge(rig: WranglerRig, s: number, amp = 0.4) { rig.u.wBulge.value.set(s < 0 ? -100 : s, s < 0 ? 0 : amp) }

export function wranglerBudget(grp: THREE.Object3D) {
  let draws = 0, tris = 0
  grp.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; draws++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 })
  return { draws, tris: Math.round(tris) }
}

// ---------------------------------------------------------------------------
// 卵枝与钻孔（岩壁装饰；本地 XY = 壁面，+Z = 壁面法向朝外）
// ---------------------------------------------------------------------------
function deco(_name: string, make: () => THREE.Material) { return make() }

/** 卵枝：种子状卵半埋进岩壁，向外发出树根般的枝条，枝梢鼓起的囊里蜷着幼体。maturity 0–1 */
export function buildEggBranch(seed: number, maturity = 1, lod: WranglerLod = 0): THREE.Group {
  const R = rng(seed * 977 + 1), g = new THREE.Group()
  const wood = deco('eggWood', () => litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.6 }))
  const pod = deco('eggPod', () => litMaterial({ color: '#d8d8d2', transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.2, envBase: 0.7 }))
  const inner = deco('eggInner', () => litMaterial({ color: '#3a3634', roughness: 0.5 }))
  const geo = new Geo()
  // 种子本体：带纵棱的扁卵，半埋
  geo.addThree(new THREE.SphereGeometry(1, [22, 12, 8][lod], [14, 8, 6][lod]), new THREE.Matrix4().compose(V(0, 0, 0.05), new THREE.Quaternion(), V(0.62, 0.38, 0.3)), (p) => {
    const ridge = Math.pow(Math.abs(Math.sin(Math.atan2(p.y, p.z) * 5)), 6)
    return gray(0.16 - 0.06 * ridge, [1.1, 1.0, 0.85])
  })
  const nB = 6 + Math.floor(R() * 3)
  const tips: THREE.Vector3[] = []
  for (let b = 0; b < nB; b++) {
    const a0 = (b / nB) * Math.PI * 2 + R() * 0.5
    const len = (1.2 + R() * 1.4) * lerp(0.35, 1, maturity)
    const pts: THREE.Vector3[] = []
    let x = Math.cos(a0) * 0.4, y = Math.sin(a0) * 0.25, a = a0
    for (let k = 0; k <= 8; k++) { pts.push(V(x, y, 0.04 + 0.08 * Math.sin(k * 0.7 + b))); a += (R() - 0.5) * 0.7; x += Math.cos(a) * len / 8; y += Math.sin(a) * len / 8 }
    const curve = new THREE.CatmullRomCurve3(pts)
    const segs = [24, 10, 6][lod], radial = [7, 5, 4][lod]
    const tube = new THREE.TubeGeometry(curve, segs, 1, radial, false)
    const P = tube.attributes.position, Nm = tube.attributes.normal
    for (let i = 0; i < P.count; i++) { const t = Math.floor(i / (radial + 1)) / segs, c = curve.getPointAt(t); const r = 0.075 * (1 - t * 0.7) * lerp(0.6, 1, maturity); P.setXYZ(i, c.x + Nm.getX(i) * r, c.y + Nm.getY(i) * r, c.z + Nm.getZ(i) * r) }
    geo.addThree(tube, new THREE.Matrix4(), (p) => gray(0.13 + 0.03 * vnoise(p.x * 9, p.y * 9, 0, 3), [1.1, 1.02, 0.86]))
    tips.push(pts[pts.length - 1])
    // 细须根
    if (lod < 2) for (let k = 0; k < 2; k++) {
      const t0 = 0.3 + R() * 0.5, c0 = curve.getPointAt(t0), aa = a0 + (R() - 0.5) * 2.4
      const sub = new THREE.CatmullRomCurve3([c0, c0.clone().add(V(Math.cos(aa) * 0.25, Math.sin(aa) * 0.25, 0.02)), c0.clone().add(V(Math.cos(aa + 0.4) * 0.45, Math.sin(aa + 0.4) * 0.45, 0))])
      geo.addThree(new THREE.TubeGeometry(sub, 6, 0.018, 4, false), new THREE.Matrix4(), gray(0.12, [1.1, 1.02, 0.86]))
    }
  }
  g.add(new THREE.Mesh(geo.build(), wood))
  // 枝梢囊：成熟度越高越大，里面蜷着一条深色幼体
  const ps = lerp(0.12, 0.42, maturity)
  for (const t of tips) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(1, [18, 10, 6][lod], [12, 8, 5][lod]), pod)
    p.scale.set(ps, ps * 0.75, ps * 0.6); p.position.copy(t).setZ(ps * 0.4); p.renderOrder = 2
    if (maturity > 0.3) {
      const coil: THREE.Vector3[] = []
      for (let k = 0; k <= 20; k++) { const a = k * 0.55; const rr = 0.55 - k * 0.02; coil.push(V(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, (k / 20 - 0.5) * 0.4)) }
      const c = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 24, 0.16, 5, false), inner)
      c.scale.set(ps, ps * 0.75, ps * 0.6).multiplyScalar(0.8); c.position.copy(p.position); g.add(c)
    }
    g.add(p)
  }
  return g
}

/** 钻孔：岩壁上的洞口——黑洞 + 外翻的碎岩环 + 散落碎石。r = 洞口半径 */
export function buildBurrowHole(r: number, seed = 1, lod: WranglerLod = 0): THREE.Group {
  const R = rng(seed * 131 + 7), g = new THREE.Group()
  const rock = deco('burrowRock', () => litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9 }))
  const dark = deco('burrowVoid', () => new THREE.MeshBasicMaterial({ color: '#000000' }))
  const hole = new THREE.Mesh(new THREE.CircleGeometry(r, 32), dark); hole.position.z = 0.02; g.add(hole)
  // 洞壁（向里收的漏斗）
  const funnel = new THREE.CylinderGeometry(r, r * 0.8, r * 1.2, 32, 1, true); funnel.rotateX(Math.PI / 2); funnel.translate(0, 0, -r * 0.6)
  g.add(new THREE.Mesh(funnel, deco('burrowWall', () => litMaterial({ color: '#141210', side: THREE.BackSide, roughness: 0.95 }))))
  const geo = new Geo()
  // 外翻唇：环形扭曲的岩唇
  const seg = [64, 32, 16][lod], rings = [6, 4, 3][lod]
  const grid: number[][] = []
  for (let i = 0; i <= rings; i++) {
    grid.push([])
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, t = i / rings
      const rr = r * (1 + t * 0.55) + 0.12 * r * vnoise(Math.cos(a) * 3, Math.sin(a) * 3, t * 2, seed)
      const h = r * 0.28 * Math.sin(t * Math.PI) * (0.7 + 0.6 * vnoise(Math.cos(a) * 5, Math.sin(a) * 5, 1, seed + 2))
      const p = V(Math.cos(a) * rr, Math.sin(a) * rr, h)
      grid[i].push(geo.v(p, V(Math.cos(a) * (0.5 - t), Math.sin(a) * (0.5 - t), 1).normalize(), gray(0.17 + 0.06 * vnoise(p.x * 4, p.y * 4, 0, 9), [1.04, 1, 0.92])))
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j], d = grid[i + 1][j + 1]; geo.idx.push(a, b, c, b, d, c) }
  // 碎石
  const nRub = [26, 12, 5][lod]
  for (let k = 0; k < nRub; k++) {
    const a = R() * Math.PI * 2, rr = r * (1.25 + R() * 1.1), s = r * (0.06 + R() * 0.12)
    const ic = new THREE.IcosahedronGeometry(1, 0)
    geo.addThree(ic, new THREE.Matrix4().compose(V(Math.cos(a) * rr, Math.sin(a) * rr, s * 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)), V(s, s * 0.8, s * 0.7)), gray(0.2 + R() * 0.08, [1.04, 1, 0.92]))
  }
  g.add(new THREE.Mesh(geo.build(), rock))
  return g
}
