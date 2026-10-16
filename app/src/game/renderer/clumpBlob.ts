// v67：肢团中心团块——SDF 平滑并集（肢段 capsule + 躯干碎块 + 压扁内核）→ surface nets 网格。
// 中心是一整块连续的肉；表面由 15–20 段真人粗细的胳膊/腿（2 节 round cone 串成带肘/膝的肢体）顺着团块表面
// 平行挤压或斜交，彼此用多项式 smooth-min 融合，交界处是平滑的肉褶而不是管子穿插。纯 TS，Node / 浏览器通用。
// 每种 (L3, 形态) 只算一次并缓存（3 种形态复用），实例只克隆几何、重映射骨骼索引。
import * as THREE from 'three'
import { rng, V, sstep } from './houndMesh'

type V3 = THREE.Vector3
const UP = V(0, 1, 0)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
export const dirOf = (az: number, el: number) => V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
export const azEl = (d: V3): [number, number] => [Math.atan2(d.z, d.x), Math.asin(Math.max(-1, Math.min(1, d.y)))]
const TONES = ['#d99b55', '#c9853f', '#b97238', '#e0aa66', '#c47c48', '#d2914d', '#bd8a52']

// ---------- SDF 基元 ----------
interface Piece {
  t: 0 | 1 // 0 round cone；1 椭球
  ax: number; ay: number; az: number
  bx: number; by: number; bz: number; l2: number; rr: number; a2: number; il2: number; r1: number; r2: number
  u: V3; v: V3; w: V3; ex: number; ey: number; ez: number
  lo: V3; hi: V3
}
function cone(a: V3, b: V3, r1: number, r2: number): Piece {
  const ba = b.clone().sub(a)
  let l2 = ba.lengthSq(), rr = r1 - r2
  if (l2 < rr * rr * 1.05 + 1e-6) { l2 = rr * rr * 1.05 + 1e-6; rr = r1 - r2 }
  const rm = Math.max(r1, r2)
  return {
    t: 0, ax: a.x, ay: a.y, az: a.z, bx: ba.x, by: ba.y, bz: ba.z, l2, rr, a2: l2 - rr * rr, il2: 1 / l2, r1, r2,
    u: UP, v: UP, w: UP, ex: 0, ey: 0, ez: 0,
    lo: V(Math.min(a.x, b.x) - rm, Math.min(a.y, b.y) - rm, Math.min(a.z, b.z) - rm),
    hi: V(Math.max(a.x, b.x) + rm, Math.max(a.y, b.y) + rm, Math.max(a.z, b.z) + rm),
  }
}
/** 椭球：中心 c，三个正交轴 u/v/w 上的半径 e */
function ellip(c: V3, u: V3, v: V3, e: V3): Piece {
  const w = V(0, 0, 0).crossVectors(u, v).normalize(), m = Math.max(e.x, e.y, e.z)
  return {
    t: 1, ax: c.x, ay: c.y, az: c.z, bx: 0, by: 0, bz: 0, l2: 0, rr: 0, a2: 0, il2: 0, r1: 0, r2: 0,
    u: u.clone().normalize(), v: v.clone().normalize(), w, ex: e.x, ey: e.y, ez: e.z,
    lo: V(c.x - m, c.y - m, c.z - m), hi: V(c.x + m, c.y + m, c.z + m),
  }
}
function pd(p: Piece, x: number, y: number, z: number): number {
  const px = x - p.ax, py = y - p.ay, pz = z - p.az
  if (p.t === 0) { // iq sdRoundCone
    const yy = px * p.bx + py * p.by + pz * p.bz, zz = yy - p.l2
    const qx = px * p.l2 - p.bx * yy, qy = py * p.l2 - p.by * yy, qz = pz * p.l2 - p.bz * yy
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * p.l2, z2 = zz * zz * p.l2
    const k = Math.sign(p.rr) * p.rr * p.rr * x2
    if (Math.sign(zz) * p.a2 * z2 > k) return Math.sqrt(x2 + z2) * p.il2 - p.r2
    if (Math.sign(yy) * p.a2 * y2 < k) return Math.sqrt(x2 + y2) * p.il2 - p.r1
    return (Math.sqrt(x2 * p.a2 * p.il2) + yy * p.rr) * p.il2 - p.r1
  }
  const lx = px * p.u.x + py * p.u.y + pz * p.u.z, ly = px * p.v.x + py * p.v.y + pz * p.v.z, lz = px * p.w.x + py * p.w.y + pz * p.w.z
  const k0 = Math.sqrt((lx / p.ex) ** 2 + (ly / p.ey) ** 2 + (lz / p.ez) ** 2)
  const k1 = Math.sqrt((lx / (p.ex * p.ex)) ** 2 + (ly / (p.ey * p.ey)) ** 2 + (lz / (p.ez * p.ez)) ** 2)
  return k1 < 1e-9 ? -Math.min(p.ex, p.ey, p.ez) : (k0 * (k0 - 1)) / k1
}
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25 }
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k)

interface Group { ps: Piece[]; k: number; tone: THREE.Color; lo: V3; hi: V3; tw: number; el?: V3; fd?: V3; fl?: number; wob?: number }
const mkGroup = (ps: Piece[], k: number, tone: THREE.Color, tw = -1): Group => {
  const lo = V(1e9, 1e9, 1e9), hi = V(-1e9, -1e9, -1e9)
  for (const p of ps) { lo.min(p.lo); hi.max(p.hi) }
  return { ps, k, tone, lo, hi, tw }
}

// ---------- 包络（外壳半径表，平滑后）：排布伸出的肢体、主臂绕行、收拢姿态 ----------
export interface Env { C: V3; r: (d: V3) => number; pt: (d: V3, f?: number) => V3; nrm: (d: V3) => V3 }
const NAZ = 48, NEL = 25
function envFromTable(C: V3, tab: Float32Array): Env {
  const g = (a: number, e: number) => tab[e * NAZ + (((a % NAZ) + NAZ) % NAZ)]
  const r = (d: V3) => {
    const [az, el] = azEl(d)
    const fa = (((az / (Math.PI * 2)) % 1) + 1) % 1 * NAZ, fe = (el / Math.PI + 0.5) * (NEL - 1)
    const a0 = Math.floor(fa), ta = fa - a0, e0 = Math.min(NEL - 2, Math.max(0, Math.floor(fe))), te = clamp01(fe - e0)
    const r0 = g(a0, e0) + (g(a0 + 1, e0) - g(a0, e0)) * ta, r1 = g(a0, e0 + 1) + (g(a0 + 1, e0 + 1) - g(a0, e0 + 1)) * ta
    return r0 + (r1 - r0) * te
  }
  const pt = (d: V3, f = 1) => C.clone().addScaledVector(d, r(d) * f)
  const nrm = (d: V3) => {
    const t1 = V(0, 0, 0).crossVectors(d, Math.abs(d.y) < 0.95 ? UP : V(1, 0, 0)).normalize(), t2 = V(0, 0, 0).crossVectors(d, t1)
    const p0 = pt(d), p1 = pt(d.clone().addScaledVector(t1, 0.07).normalize()), p2 = pt(d.clone().addScaledVector(t2, 0.07).normalize())
    const n = V(0, 0, 0).crossVectors(p1.sub(p0), p2.sub(p0)).normalize()
    return n.dot(d) < 0 ? n.negate() : n
  }
  return { C, r, pt, nrm }
}

export interface Blob {
  geo: THREE.BufferGeometry // skinIndex 为符号索引：0 核心，1–5 蠕动骨，6+ 抽动骨
  env: Env
  tris: number
  ms: number
  lobes: { d: V3; p: V3 }[]
  twitch: { pivot: V3; axis: V3 }[]
  hands: { W: V3; fw: V3; n: V3; tw: number; tone: THREE.Color; foot: boolean }[]
  eyes: { p: V3; n: V3 }[]
  ears: { p: V3; n: V3; tone: THREE.Color }[]
  mouth: V3
  field: (p: V3) => number
  toneAt: (p: V3) => THREE.Color
}

const CULL_BOTTOM = false
const CACHE = new Map<string, Blob>()
/** 取团块（按 L3 / 形态缓存）。CORE 为核心骨位置（团块包络的中心） */
export function getBlob(l3: boolean, variant: number, CORE: V3): Blob {
  const job = loadBlob(l3, variant, CORE)
  let step = job.next()
  while (!step.done) step = job.next()
  return step.value
}

export const clumpBlobReady = (l3: boolean, seed: number) => CACHE.has(`${l3 ? 1 : 0}:${((seed % 3) + 3) % 3}`)
/** Same exact geometry, but the expensive field/vertex work can yield between frames. */
export function* prepareClumpBlob(l3: boolean, seed: number): Generator<void, void> {
  yield* loadBlob(l3, ((seed % 3) + 3) % 3, V(0, 0.38 * (l3 ? 1.1 : 1), 0))
}
function* loadBlob(l3: boolean, variant: number, CORE: V3): Generator<void, Blob> {
  const key = `${l3 ? 1 : 0}:${variant}`
  let b = CACHE.get(key)
  if (!b) {
    b = yield* buildBlob(l3, variant, CORE, l3 ? 32 : 35)
    if (b.tris > (l3 ? 7200 : 7900)) {
      b.geo.dispose()
      b = yield* buildBlob(l3, variant, CORE, l3 ? 29 : 32)
    }
    CACHE.set(key, b)
  }
  return b
}

function* buildBlob(l3: boolean, variant: number, CORE: V3, RES: number): Generator<void, Blob> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const R = rng(0x5eb1 + variant * 7919 + (l3 ? 101 : 0))
  const jit = () => R() - 0.5
  const bs = l3 ? 1.1 : 1 // L3 团块更大
  const mt = l3 ? 1.14 : 1 // L3 肢段更粗
  const K = (l3 ? 0.052 : 0.046) // 肢段之间的平滑并集系数（米）
  const tone = () => new THREE.Color(TONES[Math.floor(R() * TONES.length)]).offsetHSL(jit() * 0.04, jit() * 0.18, jit() * 0.14)
  const groups: Group[] = []

  // ---------- 压扁的内核（≈ v65 肉团的 70%）+ 贴地外摊的底 ----------
  const Cc = V(0, 0.31 * bs, 0), Ec = V(0.43, 0.28, 0.39).multiplyScalar(bs)
  const rc = (d: V3) => 1 / Math.sqrt((d.x / Ec.x) ** 2 + (d.y / Ec.y) ** 2 + (d.z / Ec.z) ** 2)
  const nc = (d: V3) => { const k = rc(d); return V((d.x * k) / (Ec.x * Ec.x), (d.y * k) / (Ec.y * Ec.y), (d.z * k) / (Ec.z * Ec.z)).normalize() }
  const onCore = (d: V3, off: number) => Cc.clone().addScaledVector(d, rc(d)).addScaledVector(nc(d), off)
  const coreTone = new THREE.Color('#985532')
  groups.push(mkGroup([ellip(Cc, V(1, 0, 0), UP, Ec)], K, coreTone))
  groups[0].wob = 0.02 * bs // 内核表面低频起伏（不是光滑椭球）

  // ---------- 器官方位（相对核心骨）与留给它们的缝 ----------
  const mouthDir = dirOf(0, -0.04)
  const eyeDirs = [dirOf(0.5, 0.36), dirOf(-0.42, 0.22), dirOf(0.1, 0.78), dirOf(2.75, 0.9), dirOf(-2.5, 0.8), dirOf(1.65, 0.75)].slice(0, l3 ? 6 : 5)
  const earDirs = [dirOf(1.4, 0.1), dirOf(-2.05, 0.3), dirOf(-1.2, 0.55)].slice(0, l3 ? 3 : 2)
  const headDirs = l3 ? [dirOf(-2.75, 0.5), dirOf(1.95, 0.55)] : [dirOf(-2.75, 0.5)]
  const gaps: { d: V3; w: number; h: number }[] = [
    { d: mouthDir, w: 0.3, h: 0.1 },
    ...eyeDirs.map((d) => ({ d, w: 0.075 / Math.max(0.35, Math.cos(azEl(d)[1])), h: 0.07 })),
    ...headDirs.map((d) => ({ d, w: 0.2 / Math.max(0.35, Math.cos(azEl(d)[1])), h: 0.17 })),
  ]
  const inGap = (P: V3) => {
    const [a, e] = azEl(P.clone().sub(CORE).normalize())
    for (const g of gaps) {
      const [ga, ge] = azEl(g.d)
      let da = a - ga; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2
      if ((da / g.w) ** 2 + ((e - ge) / g.h) ** 2 < 1) return true
    }
    return false
  }
  /** 核心骨方向 → 内核椭球（相对 Cc）上的方向 */
  const toCc = (d: V3) => { const P = CORE.clone().addScaledVector(d, 0.5); return P.sub(Cc).normalize() }
  // 已占用的球（避免肢段全叠在一处）
  const occ: { c: V3; r: number }[] = []

  // ---------- 躯干碎块：臀（两瓣，中间一条沟）、背部碎块、肩；头颅半融 ----------
  const frame = (d: V3, spin: number) => {
    const n = nc(d), t1 = V(0, 0, 0).crossVectors(n, Math.abs(n.y) < 0.9 ? UP : V(1, 0, 0)).normalize().applyAxisAngle(n, spin)
    return { n, t1, t2: V(0, 0, 0).crossVectors(t1, n) }
  }
  {
    const d = dirOf(2.55 + jit() * 0.4, 0.12 + jit() * 0.1), { n, t1 } = frame(d, Math.PI / 2 + jit() * 0.3)
    const c = onCore(d, 0.01 * bs)
    const e = V(0.1, 0.07, 0.095).multiplyScalar(bs)
    const tn = tone()
    groups.push(mkGroup([ellip(c.clone().addScaledVector(t1, 0.08 * bs), t1, n, e), ellip(c.clone().addScaledVector(t1, -0.08 * bs), t1, n, e)], K * 1.2, tn))
    occ.push({ c: c.clone().addScaledVector(t1, 0.09), r: 0.1 }, { c: c.clone().addScaledVector(t1, -0.09), r: 0.1 })
  }
  {
    const d = dirOf(-2.0 + jit() * 0.4, 0.78), { n, t1 } = frame(d, R() * 3), c = onCore(d, 0.015 * bs)
    groups.push(mkGroup([ellip(c, t1, n, V(0.2, 0.07, 0.14).multiplyScalar(bs))], K, tone()))
    occ.push({ c, r: 0.14 })
  }
  const shoulderAz = -1.05 + jit() * 0.3, shoulderD = dirOf(shoulderAz, 0.5)
  {
    const { n, t1 } = frame(shoulderD, R() * 3), c = onCore(shoulderD, 0.02 * bs)
    groups.push(mkGroup([ellip(c, t1, n, V(0.1, 0.075, 0.09).multiplyScalar(bs * mt))], K, tone()))
    occ.push({ c, r: 0.09 })
  }
  for (const hd of headDirs) {
    const d = toCc(hd), { n, t1 } = frame(d, R() * 6), c = onCore(d, 0.03 * bs)
    const tn = tone()
    groups.push(mkGroup([
      ellip(c, t1, n, V(0.1, 0.088, 0.095).multiplyScalar(mt)),
      ellip(c.clone().addScaledVector(t1, 0.05 * mt).addScaledVector(n, -0.02), t1, n, V(0.06, 0.05, 0.07).multiplyScalar(mt)), // 下颌一侧塌进肉里
    ], 0.03, tn))
    occ.push({ c, r: 0.1 })
  }

  // ---------- 肢段：顺着内核表面「走」出带一点弯曲的中心线，2 节 round cone 串成带肘/膝的肢体 ----------
  type LimbK = 'arm' | 'leg' | 'thigh' | 'upper'
  // 半径（米，真人粗细）：上臂 ~0.05、前臂 ~0.04→0.03、大腿 ~0.075、小腿 ~0.055→0.04
  const PRO: Record<LimbK, { L: number[]; r: number[] }> = {
    arm: { L: [0.28, 0.25], r: [0.05, 0.053, 0.04, 0.037, 0.03] },
    leg: { L: [0.4, 0.36], r: [0.075, 0.074, 0.055, 0.052, 0.038] },
    thigh: { L: [0.36], r: [0.075, 0.072, 0.06] },
    upper: { L: [0.3], r: [0.05, 0.052, 0.043] },
  }
  const twitch: Blob['twitch'] = [], hands: Blob['hands'] = []
  /** 走一条肢体；返回关节/中点（每节起点、中点、终点）及其法向、前进方向；穿过器官缝隙时返回 null */
  const walk = (d0: V3, h0: V3, Ls: number[], bends: number[], curve: number, off: (u: number) => number, free: boolean) => {
    const marks: number[] = [0]
    let acc = 0
    for (const L of Ls) { marks.push(acc + L / 2, acc + L); acc += L }
    const Lt = acc, step = 0.02
    const d = d0.clone().normalize(), h = h0.clone().addScaledVector(d, -h0.dot(d)).normalize()
    const out: { P: V3; n: V3; h: V3 }[] = []
    let s = 0, mi = 0, ji = 0
    for (let guard = 0; mi < marks.length && guard < 400; guard++) {
      if (s >= marks[mi] - 1e-6) {
        const u = marks[mi] / Lt, n = nc(d)
        out.push({ P: Cc.clone().addScaledVector(d, rc(d)).addScaledVector(n, off(u)), n, h: h.clone() })
        mi++; continue
      }
      const a = step / rc(d)
      const dn = d.clone().multiplyScalar(Math.cos(a)).addScaledVector(h, Math.sin(a)).normalize()
      h.multiplyScalar(Math.cos(a)).addScaledVector(d, -Math.sin(a)).normalize()
      d.copy(dn)
      s += step
      let turn = curve * step + jit() * 0.05
      if (ji < bends.length && s >= marks[2 + ji * 2]) { turn += bends[ji]; ji++ } // 肘/膝处折一次
      h.applyAxisAngle(d, turn).addScaledVector(d, -h.dot(d)).normalize()
    }
    if (!free) for (let i = 1; i < out.length - 1; i++) if (inGap(out[i].P)) return null
    return out
  }
  const overlapBad = (pts: { P: V3 }[], r: number) => {
    let bad = 0, n = 0
    for (let i = 0; i < pts.length - 1; i++) for (const f of [0, 0.5]) {
      const P = pts[i].P.clone().lerp(pts[i + 1].P, f); n++
      for (const o of occ) if (P.distanceTo(o.c) < (o.r + r) * 0.62) { bad++; break }
    }
    return bad / n
  }
  const addLimb = (kind: LimbK, d0: V3, h0: V3, end: 'sink' | 'hand' | 'foot', layer: number, free = false, Lk = 1, loose = false): boolean => {
    const P0 = PRO[kind]
    const Ls = P0.L.map((L) => L * bs * Lk), rs = P0.r.map((r) => r * mt)
    const rAvg = rs.reduce((a, b) => a + b, 0) / rs.length
    const sb = (layer ? 0.85 : 0.58) * rAvg
    const off = (u: number) => {
      let o = -0.75 * rs[0] + (sb + 0.75 * rs[0]) * sstep(0, 0.2, u)
      if (end === 'sink') o += (-0.75 * rs[rs.length - 1] - sb) * sstep(0.8, 1, u)
      else o += 0.15 * rAvg * sstep(0.7, 1, u)
      return o
    }
    const bends = Ls.length > 1 ? [(0.45 + R() * 0.5) * (R() < 0.5 ? 1 : -1)] : []
    const path = walk(d0, h0, Ls, bends, jit() * 1.2, off, free)
    if (!path) return false
    if (!free && overlapBad(path, rAvg) > (loose ? 0.6 : 0.34)) return false
    for (let i = 0; i < path.length; i++) { const rr = rs[i] ?? rs[rs.length - 1]; if (path[i].P.y < rr * 0.9 + 0.012) path[i].P.y = rr * 0.9 + 0.012 } // 贴地压平
    if (Ls.length > 1) path[2].P.addScaledVector(path[2].n, 0.014 * bs) // 肘/膝顶出来
    const ps: Piece[] = []
    for (let i = 0; i < path.length - 1; i++) ps.push(cone(path[i].P, path[i + 1].P, rs[i], rs[i + 1]))
    if (Ls.length > 1) ps.push(ellip(path[2].P.clone().addScaledVector(path[2].n, 0.006), path[2].h, path[2].n, V(rs[2] * 1.12, rs[2] * 1.05, rs[2] * 1.18))) // 骨节
    const tn = tone()
    let tw = -1
    if (end !== 'sink') {
      const J = path[path.length - 3], E = path[path.length - 1]
      const fd = E.P.clone().sub(J.P), fl = fd.length(); fd.normalize()
      tw = twitch.length
      twitch.push({ pivot: J.P.clone(), axis: V(0, 0, 0).crossVectors(J.n, fd).normalize() })
      const fw = E.h.clone().addScaledVector(E.n, -E.h.dot(E.n)).normalize()
      hands.push({ W: E.P.clone().addScaledVector(E.n, rs[rs.length - 1] * 0.25), fw, n: E.n.clone(), tw, tone: tn, foot: end === 'foot' })
      const g = mkGroup(ps, K, tn, tw); g.el = J.P.clone(); g.fd = fd; g.fl = fl
      groups.push(g)
    } else groups.push(mkGroup(ps, K, tn))
    for (let i = 0; i < path.length; i++) occ.push({ c: path[i].P.clone(), r: rs[i] ?? rAvg })
    for (let i = 0; i < path.length - 1; i++) occ.push({ c: path[i].P.clone().lerp(path[i + 1].P, 0.5), r: rAvg })
    return true
  }
  // 齿口上下两条横贯正面的「唇」肢段：齿口就是它们之间的一条缝
  {
    const [, me] = azEl(mouthDir)
    addLimb('thigh', toCc(dirOf(-0.5, me + 0.2)), V(0, 0, 1), 'sink', 0, true, 1.55)
    addLimb('thigh', toCc(dirOf(-0.52, me - 0.21)), V(0, 0, 1), 'sink', 0, true, 1.65)
  }
  // 从肩上长出的一条胳膊
  addLimb('arm', shoulderD, V(0, -0.35, 0).add(dirOf(shoulderAz - Math.PI / 2, 0)), 'hand', 0, true)
  // 分三圈排布：贴地一圈（顺着团块下缘横躺，撑出贴地外摊的底）、腰部一圈、顶上一圈；同一圈内方位均分（不扎堆），
  // 多数顺着圈平行挤压，少数斜交
  type Spec = { k: LimbK; end: 'sink' | 'hand' | 'foot'; el: number; tilt: number; layer: number; band: number }
  const specs: Spec[] = [
    { k: 'leg', end: 'sink', el: -0.34, tilt: 0.15, layer: 0, band: 0 },
    { k: 'leg', end: 'foot', el: -0.32, tilt: 0.2, layer: 0, band: 0 },
    { k: 'leg', end: 'sink', el: -0.3, tilt: 0.2, layer: 0, band: 0 },
    { k: 'arm', end: 'hand', el: 0.25, tilt: 0.55, layer: 0, band: 1 },
    { k: 'arm', end: 'sink', el: 0.3, tilt: 0.5, layer: 0, band: 1 },
    { k: 'thigh', end: 'sink', el: 0.3, tilt: 1.1, layer: 1, band: 1 },
    { k: 'leg', end: 'sink', el: 0.78, tilt: 0.6, layer: 0, band: 2 },
    { k: 'arm', end: l3 ? 'hand' : 'sink', el: 0.85, tilt: 0.7, layer: 0, band: 2 },
  ]
  const az0 = variant * 2.1 + R() * 6.28
  const bandN = [0, 0, 0], bandI = [0, 0, 0]
  for (const sp of specs) bandN[sp.band]++
  specs.forEach((sp) => {
    const bi = bandI[sp.band]++
    const azc = az0 + sp.band * 1.05 + (bi / bandN[sp.band]) * Math.PI * 2
    for (let tr = 0; tr < 48; tr++) {
      const el = sp.el + jit() * (0.14 + tr * 0.01), az = azc + jit() * (0.35 + tr * 0.12)
      const d0 = dirOf(az, el)
      const east = V(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(R() < 0.5 ? 1 : -1)
      const h0 = east.applyAxisAngle(nc(d0), jit() * 2 * sp.tilt)
      if (addLimb(sp.k, d0, h0, sp.end, sp.layer, false, 1, tr > 36)) break
    }
  })
  // 顶上再压一段斜着的上臂
  for (let tr = 0; tr < 30; tr++) { const az = az0 + 2.6 + jit() * 2, d0 = dirOf(az, 1.1 + jit() * 0.3); if (addLimb('upper', d0, V(R() - 0.5, 0, R() - 0.5), 'sink', 1, false, 1, tr > 20)) break }

  // ---------- 场 ----------
  const subs: { p: Piece; k: number; kind: 'mouth' | 'eye' }[] = []
  const G0 = 0.014
  const kMax = Math.max(...groups.map((g) => g.k))
  const lo = V(1e9, 1e9, 1e9), hi = V(-1e9, -1e9, -1e9)
  for (const g of groups) { lo.min(g.lo); hi.max(g.hi) }
  const ext = Math.max(hi.x - lo.x, hi.z - lo.z, hi.y - lo.y)
  const h = (ext + 0.08) / RES
  const MARGIN = kMax + 2.2 * h
  lo.subScalar(2 * h); hi.addScalar(2 * h); lo.y = -1.5 * h
  const nx = Math.ceil((hi.x - lo.x) / h) + 1, ny = Math.ceil((hi.y - lo.y) / h) + 1, nz = Math.ceil((hi.z - lo.z) / h) + 1
  const val = new Float32Array(nx * ny * nz).fill(MARGIN)
  const gd = (g: Group, x: number, y: number, z: number) => {
    let d = 1e9; for (const p of g.ps) { const q = pd(p, x, y, z); if (q < d) d = q }
    if (g.wob) d += g.wob * (Math.sin(x * 17 + 1.3 + variant) * Math.sin(y * 19 + 0.7) * Math.sin(z * 15 + 2.1) + 0.5 * Math.sin(x * 9 - z * 11 + y * 7))
    return d
  }
  const outside = (lo2: V3, hi2: V3, x: number, y: number, z: number) => x < lo2.x - MARGIN || y < lo2.y - MARGIN || z < lo2.z - MARGIN || x > hi2.x + MARGIN || y > hi2.y + MARGIN || z > hi2.z + MARGIN
  const fieldAt = (x: number, y: number, z: number, withSubs = true) => {
    let v = MARGIN
    for (const g of groups) { if (outside(g.lo, g.hi, x, y, z)) continue; v = smin(v, gd(g, x, y, z), g.k) }
    v = smax(v, G0 - y, 0.02)
    if (withSubs) for (const s of subs) { if (outside(s.p.lo, s.p.hi, x, y, z)) continue; v = smax(v, -pd(s.p, x, y, z), s.k) }
    return v
  }
  const range = (a: number, b: number, o: number, n: number) => [Math.max(0, Math.ceil((a - MARGIN - o) / h - 1e-9)), Math.min(n - 1, Math.floor((b + MARGIN - o) / h + 1e-9))]
  const pass = (lo2: V3, hi2: V3, f: (v: number, x: number, y: number, z: number) => number) => {
    const [i0, i1] = range(lo2.x, hi2.x, lo.x, nx), [j0, j1] = range(lo2.y, hi2.y, lo.y, ny), [k0, k1] = range(lo2.z, hi2.z, lo.z, nz)
    for (let k = k0; k <= k1; k++) {
      const z = lo.z + k * h
      for (let j = j0; j <= j1; j++) {
        const y = lo.y + j * h, row = nx * (j + ny * k)
        for (let i = i0; i <= i1; i++) { const x = lo.x + i * h; if (outside(lo2, hi2, x, y, z)) continue; val[row + i] = f(val[row + i], x, y, z) }
      }
    }
  }
  for (const g of groups) { yield; pass(g.lo, g.hi, (v, x, y, z) => smin(v, gd(g, x, y, z), g.k)) }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const y = lo.y + j * h, row = nx * (j + ny * k); for (let i = 0; i < nx; i++) val[row + i] = smax(val[row + i], G0 - y, 0.02) }
  const sample = (x: number, y: number, z: number) => {
    const fx = (x - lo.x) / h, fy = (y - lo.y) / h, fz = (z - lo.z) / h
    if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return MARGIN
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz), tx = fx - i, ty = fy - j, tz = fz - k
    const id = i + nx * (j + ny * k), sx = 1, sy = nx, sz = nx * ny
    const c00 = val[id] + (val[id + sx] - val[id]) * tx, c10 = val[id + sy] + (val[id + sy + sx] - val[id + sy]) * tx
    const c01 = val[id + sz] + (val[id + sz + sx] - val[id + sz]) * tx, c11 = val[id + sz + sy] + (val[id + sz + sy + sx] - val[id + sz + sy]) * tx
    const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty
    return c0 + (c1 - c0) * tz
  }
  /** 从核心骨沿 d 射出，返回外表面半径（在网格上三线性插值） */
  const hit = (d: V3) => {
    let r = 1.5 * bs
    for (; r > 0.02; r -= h * 0.5) {
      const v = sample(CORE.x + d.x * r, CORE.y + d.y * r, CORE.z + d.z * r)
      if (v < 0) {
        let a = r, b = r + h * 0.5
        for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (sample(CORE.x + d.x * m, CORE.y + d.y * m, CORE.z + d.z * m) < 0) a = m; else b = m }
        return (a + b) / 2
      }
    }
    return 0.2
  }
  const gradAt = (P: V3, eps = h * 0.3, subsOn = true) => V(
    fieldAt(P.x + eps, P.y, P.z, subsOn) - fieldAt(P.x - eps, P.y, P.z, subsOn),
    fieldAt(P.x, P.y + eps, P.z, subsOn) - fieldAt(P.x, P.y - eps, P.z, subsOn),
    fieldAt(P.x, P.y, P.z + eps, subsOn) - fieldAt(P.x, P.y, P.z - eps, subsOn)).normalize()

  // ---------- 器官凹缝：齿口一条横缝、眼窝 ----------
  const M0 = CORE.clone().addScaledVector(mouthDir, hit(mouthDir))
  subs.push({ p: ellip(M0.clone().add(V(0.012, 0, 0)), V(1, 0, 0), UP, V(0.075, 0.03, 0.19 * mt)), k: 0.025, kind: 'mouth' })
  const eyeBase: { H: V3; n: V3 }[] = []
  for (const ed of [...eyeDirs, ...headDirs.map((hd) => hd.clone().add(V(0.12, -0.08, 0)).normalize())]) {
    const H = CORE.clone().addScaledVector(ed, hit(ed)), n = gradAt(H, h * 0.3, false)
    eyeBase.push({ H, n })
    subs.push({ p: ellip(H.clone().addScaledVector(n, 0.014), n, V(0, 0, 0).crossVectors(n, Math.abs(n.y) < 0.9 ? UP : V(1, 0, 0)).normalize(), V(0.04, 0.04, 0.04).multiplyScalar(mt)), k: 0.018, kind: 'eye' })
  }
  for (const s of subs) pass(s.p.lo, s.p.hi, (v, x, y, z) => smax(v, -pd(s.p, x, y, z), s.k))
  const mouth = CORE.clone().addScaledVector(mouthDir, hit(mouthDir))
  const eyes = eyeBase.map(({ H, n }) => ({ p: H.clone().addScaledVector(n, -0.016 * mt), n }))
  const ears = earDirs.map((ed) => { const p = CORE.clone().addScaledVector(ed, hit(ed) - 0.01); return { p, n: gradAt(p), tone: tone() } })

  // ---------- 外壳半径表 → 平滑包络 ----------
  const tab = new Float32Array(NAZ * NEL)
  for (let e = 0; e < NEL; e++) {
    yield
    for (let a = 0; a < NAZ; a++) tab[e * NAZ + a] = hit(dirOf((a / NAZ) * Math.PI * 2, -Math.PI / 2 + (e / (NEL - 1)) * Math.PI))
  }
  for (let it = 0; it < 3; it++) { // 低通：去掉肢段的起伏，留下团块整体轮廓
    const src = tab.slice()
    for (let e = 0; e < NEL; e++) for (let a = 0; a < NAZ; a++) {
      let s = 0, c = 0
      for (let de = -1; de <= 1; de++) for (let da = -1; da <= 1; da++) { const ee = e + de; if (ee < 0 || ee >= NEL) continue; s += src[ee * NAZ + (((a + da) % NAZ) + NAZ) % NAZ]; c++ }
      tab[e * NAZ + a] = s / c
    }
  }
  const env = envFromTable(CORE.clone(), tab)
  const lobeDirs = [dirOf(0.3, 0.95), dirOf(0.6, 0.25), dirOf(2.3, 0.3), dirOf(-2.3, 0.25), dirOf(-0.8, 0.35)]
  const lobes = lobeDirs.map((d) => ({ d, p: env.pt(d, 0.78) }))

  // ---------- surface nets ----------
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const vp: number[] = []
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
  const cv = new Float32Array(8)
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (i === 0 && j === 0) yield
    let mask = 0
    for (let c = 0; c < 8; c++) { const v = val[(i + (c & 1)) + nx * ((j + ((c >> 1) & 1)) + ny * (k + (c >> 2)))]; cv[c] = v; if (v < 0) mask |= 1 << c }
    if (mask === 0 || mask === 255) continue
    let sx = 0, sy = 0, sz = 0, n = 0
    for (const [a, b] of EDGES) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue
      const t = cv[a] / (cv[a] - cv[b])
      sx += (a & 1) + (((b & 1) - (a & 1)) * t); sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t); sz += (a >> 2) + (((b >> 2) - (a >> 2)) * t); n++
    }
    cellV[i + (nx - 1) * (j + (ny - 1) * k)] = vp.length / 3
    vp.push(lo.x + (i + sx / n) * h, lo.y + (j + sy / n) * h, lo.z + (k + sz / n) * h)
  }
  const quads: number[] = []
  const cid = (i: number, j: number, k: number) => cellV[i + (nx - 1) * (j + (ny - 1) * k)]
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i === 0 && j === 0) yield
    const v0 = val[i + nx * (j + ny * k)]
    if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1) { // x 向边：四个相邻格 (j,k)
      const v1 = val[i + 1 + nx * (j + ny * k)]
      if ((v0 < 0) !== (v1 < 0)) { const q = [cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k)]; quads.push(...(v0 < 0 ? q : q.reverse())) }
    }
    if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) { // y 向边：平面 (k,i)
      const v1 = val[i + nx * (j + 1 + ny * k)]
      if ((v0 < 0) !== (v1 < 0)) { const q = [cid(i - 1, j, k - 1), cid(i - 1, j, k), cid(i, j, k), cid(i, j, k - 1)]; quads.push(...(v0 < 0 ? q : q.reverse())) }
    }
    if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) { // z 向边：平面 (i,j)
      const v1 = val[i + nx * (j + ny * (k + 1))]
      if ((v0 < 0) !== (v1 < 0)) { const q = [cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k)]; quads.push(...(v0 < 0 ? q : q.reverse())) }
    }
  }

  // ---------- 顶点：投影到表面、场梯度法线、凹度 AO、按最近肢段取色、蒙皮权重 ----------
  const nv = vp.length / 3
  const P = V(0, 0, 0), N = V(0, 0, 0)
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4)
  const mouthRed = new THREE.Color('#6c241c'), tmpC = new THREE.Color()
  const AOH = [0.025, 0.05, 0.085, 0.13].map((x) => x * bs), AOW = [0.32, 0.3, 0.23, 0.15]
  const softTone = (x: number, y: number, z: number, out: THREE.Color) => {
    let dmin = 1e9
    const ds: number[] = []
    for (const g of groups) { const d = outside(g.lo, g.hi, x, y, z) ? 1e9 : gd(g, x, y, z); ds.push(d); if (d < dmin) dmin = d }
    let ws = 0, tw = 0, twi = -1, twv = 0
    out.setRGB(0, 0, 0)
    groups.forEach((g, gi) => {
      const w = Math.exp(-(ds[gi] - dmin) / 0.016)
      if (w < 1e-3) return
      out.r += g.tone.r * w; out.g += g.tone.g * w; out.b += g.tone.b * w; ws += w
      if (g.tw >= 0 && g.el && g.fd && g.fl) {
        const t = ((x - g.el.x) * g.fd.x + (y - g.el.y) * g.fd.y + (z - g.el.z) * g.fd.z) / g.fl
        const v = w * sstep(0.08, 0.5, t)
        if (v > twv) { twv = v; twi = g.tw }
      }
    })
    out.multiplyScalar(1 / ws)
    tw = twi >= 0 ? twv / ws : 0
    return { tw, twi }
  }
  for (let i = 0; i < nv; i++) {
    if (i % 96 === 0) yield
    P.set(vp[i * 3], vp[i * 3 + 1], vp[i * 3 + 2])
    // 法线：网格上的场梯度（三线性）；一步牛顿把顶点投影到精确等值面
    const e = h * 0.5
    N.set(sample(P.x + e, P.y, P.z) - sample(P.x - e, P.y, P.z), sample(P.x, P.y + e, P.z) - sample(P.x, P.y - e, P.z), sample(P.x, P.y, P.z + e) - sample(P.x, P.y, P.z - e)).divideScalar(2 * e)
    const gl = N.length()
    if (gl > 1e-4) { N.divideScalar(gl); const f = fieldAt(P.x, P.y, P.z); P.addScaledVector(N, -Math.max(-0.5 * h, Math.min(0.5 * h, f / gl))) } else N.set(0, 1, 0)
    pos[i * 3] = P.x; pos[i * 3 + 1] = P.y; pos[i * 3 + 2] = P.z
    nor[i * 3] = N.x; nor[i * 3 + 1] = N.y; nor[i * 3 + 2] = N.z
    // 凹度 AO：沿法线外推若干距离，场值小于外推距离说明被周围的肉包住（肉褶、深缝）
    let oc = 0
    for (let a = 0; a < 4; a++) { const s = AOH[a]; oc += AOW[a] * Math.max(0, s - sample(P.x + N.x * s, P.y + N.y * s, P.z + N.z * s)) / s }
    const ao = Math.max(0.16, 1 - Math.min(0.84, oc * 1.9))
    const { tw, twi } = softTone(P.x, P.y, P.z, tmpC)
    // 齿口缝里是暗红的口腔肉；眼窝更暗
    for (const s of subs) {
      if (outside(s.p.lo, s.p.hi, P.x, P.y, P.z)) continue
      const k = sstep(0.022, 0.002, pd(s.p, P.x, P.y, P.z))
      if (s.kind === 'mouth') tmpC.lerp(mouthRed, k)
      else tmpC.multiplyScalar(1 - 0.35 * k)
    }
    const gnd = 0.7 + 0.3 * sstep(0.0, 0.12, P.y)
    const s = ao * gnd * (0.93 + 0.07 * N.y)
    col[i * 3] = tmpC.r * s; col[i * 3 + 1] = tmpC.g * s; col[i * 3 + 2] = tmpC.b * s
    // 蒙皮：核心 + 最近的蠕动骨（距离权重）+ 抽动骨（带手/脚的前臂/小腿）
    let bi = 0, bw = 0
    lobes.forEach((lb, kk) => { const w = Math.exp(-P.distanceToSquared(lb.p) / (2 * 0.24 * 0.24 * bs * bs)); if (w > bw) { bw = w; bi = kk } })
    const wl = 0.85 * bw * (1 - tw)
    si[i * 4] = 0; si[i * 4 + 1] = 1 + bi; si[i * 4 + 2] = twi >= 0 ? 6 + twi : 0; si[i * 4 + 3] = 0
    sw[i * 4] = 1 - wl - tw; sw[i * 4 + 1] = wl; sw[i * 4 + 2] = twi >= 0 ? tw : 0; sw[i * 4 + 3] = 0
  }

  // ---------- 三角形（非索引，盒式投影 UV；贴地朝下的底面剔除） ----------
  const tp: number[] = [], tn: number[] = [], tc: number[] = [], tu: number[] = [], ti: number[] = [], tw: number[] = []
  const A = V(0, 0, 0), B = V(0, 0, 0), Cv = V(0, 0, 0), F = V(0, 0, 0)
  const tri = (a: number, b: number, c: number) => {
    if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) return
    A.fromArray(pos, a * 3); B.fromArray(pos, b * 3); Cv.fromArray(pos, c * 3)
    F.subVectors(B, A).cross(Cv.clone().sub(A))
    if (F.lengthSq() < 1e-14) return
    F.normalize()
    if (CULL_BOTTOM && A.y < 0.04 && B.y < 0.04 && Cv.y < 0.04 && F.y < -0.4) return
    const ax = Math.abs(F.x), ay = Math.abs(F.y), az = Math.abs(F.z), S = 2.4
    for (const v of [a, b, c]) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]
      tp.push(x, y, z); tn.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]); tc.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2])
      if (ax >= ay && ax >= az) tu.push(z * S, y * S); else if (ay >= az) tu.push(x * S, z * S); else tu.push(x * S, y * S)
      ti.push(si[v * 4], si[v * 4 + 1], si[v * 4 + 2], si[v * 4 + 3]); tw.push(sw[v * 4], sw[v * 4 + 1], sw[v * 4 + 2], sw[v * 4 + 3])
    }
  }
  for (let q = 0; q < quads.length; q += 4) {
    if (q % 512 === 0) yield
    const a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3]
    const dac = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2
    const dbd = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2
    if (dac <= dbd) { tri(a, b, c); tri(a, c, d) } else { tri(a, b, d); tri(b, c, d) }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3))
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ti, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(tw, 4))

  const field = (p: V3) => fieldAt(p.x, p.y, p.z)
  const toneAt = (p: V3) => { const c = new THREE.Color(); softTone(p.x, p.y, p.z, c); return c }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return { geo, env, tris: tp.length / 9, ms: t1 - t0, lobes, twitch, hands, eyes, ears, mouth, field, toneAt }
}
