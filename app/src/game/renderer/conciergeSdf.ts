// [concierge v2] 有向距离场（SDF）雕刻工具 + 窄带 Surface Nets 等值面提取。
// 用法：把一个部件写成 f(x,y,z)→有向距离（内负外正），extract() 在包围盒里取等值面，得到整块无缝网格：
//   1) 粗网格（4h）先求值，只在表面附近的粗格里细分求值（窄带），远处按粗格符号填充 —— 求值量 ~ 表面积/h²；
//   2) Surface Nets：每个跨表面的体素放一个顶点（边交点平均），每条跨表面的格边出一个四边形（按短对角线剖分）；
//   3) 顶点沿梯度投影回零等值面（1–2 步牛顿），法线取 SDF 梯度（解析细节：布褶、毛簇、筋腱在着色里体现）；
//   4) keep(x,y,z) 按面心裁掉不要的部分（相邻部件在衣物边界 / 重叠带处拼接，同一个 SDF 所以表面重合）。
// 所有原语都是纯数字参数的小函数（V8 内联），避免每次求值分配对象。

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
export const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
export const gauss = (x: number, w: number) => Math.exp(-(x * x) / (w * w))
/** 多项式平滑并（k 为过渡宽度，米） */
export function smin(a: number, b: number, k: number) { if (k <= 0) return a < b ? a : b; const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h) }
export function smax(a: number, b: number, k: number) { return -smin(-a, -b, k) }
export const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z)
export const len2 = (x: number, y: number) => Math.sqrt(x * x + y * y)
export function sdSphere(x: number, y: number, z: number, cx: number, cy: number, cz: number, r: number) { return len3(x - cx, y - cy, z - cz) - r }
/** 近似椭球距离（iq） */
export function sdEll(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) {
  const px = x - cx, py = y - cy, pz = z - cz
  const k0 = len3(px / rx, py / ry, pz / rz), k1 = len3(px / (rx * rx), py / (ry * ry), pz / (rz * rz))
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1
}
/** 线段参数（0..1） */
export function segT(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const ex = bx - ax, ey = by - ay, ez = bz - az, L2 = ex * ex + ey * ey + ez * ez
  return L2 < 1e-12 ? 0 : clamp(((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / L2, 0, 1)
}
export function sdCapsule(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) {
  const t = segT(x, y, z, ax, ay, az, bx, by, bz)
  return len3(x - ax - (bx - ax) * t, y - ay - (by - ay) * t, z - az - (bz - az) * t) - r
}
/** 锥形胶囊（两端半径 r1→r2，iq round cone 的任意方向版本） */
export function sdRoundCone(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r1: number, r2: number) {
  const bax = bx - ax, bay = by - ay, baz = bz - az
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2
  const pax = x - ax, pay = y - ay, paz = z - az
  const yv = pax * bax + pay * bay + paz * baz, zv = yv - l2
  const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv
  const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * l2, z2 = zv * zv * l2
  const k = Math.sign(rr) * rr * rr * x2
  if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2
  if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1
  return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1
}
export function sdRoundBox(px: number, py: number, pz: number, bx: number, by: number, bz: number, r: number) {
  const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r, qz = Math.abs(pz) - bz + r
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r
}
export function sdTorusY(px: number, py: number, pz: number, R: number, r: number) { return len2(len2(px, pz) - R, py) - r }

// ---------- 值噪声（布纹 / 毛簇 / 皮肤起伏）----------
const PERM = new Uint8Array(512)
{ let s = 1234567; for (let i = 0; i < 256; i++) PERM[i] = i; for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); const t = PERM[i]; PERM[i] = PERM[j]; PERM[j] = t } for (let i = 0; i < 256; i++) PERM[i + 256] = PERM[i] }
const hv = (i: number, j: number, k: number) => PERM[(PERM[(PERM[i & 255] + j) & 255] + k) & 255] / 127.5 - 1
/** 3D 值噪声，约 [-1,1] */
export function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz)
  const a = mix(mix(hv(ix, iy, iz), hv(ix + 1, iy, iz), ux), mix(hv(ix, iy + 1, iz), hv(ix + 1, iy + 1, iz), ux), uy)
  const b = mix(mix(hv(ix, iy, iz + 1), hv(ix + 1, iy, iz + 1), ux), mix(hv(ix, iy + 1, iz + 1), hv(ix + 1, iy + 1, iz + 1), ux), uy)
  return mix(a, b, uz)
}
export function fbm(x: number, y: number, z: number, oct = 3) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5 } return s }

export type Sdf = (x: number, y: number, z: number) => number
export interface Surf { pos: Float32Array; nrm: Float32Array; idx: Uint32Array; vcount: number; sample?: Sdf }
export interface ExtractOpts {
  min: [number, number, number]; max: [number, number, number]; h: number
  /** 面保留判定（面心坐标）；不传则全留 */
  keep?: (x: number, y: number, z: number) => boolean
  /** 粗格倍数（默认 6；只需每个连通表面至少有一处被粗格捕到）*/
  coarse?: number
  /** 投影步数（默认 1） */
  project?: number
  /** 梯度差分步长（默认 0.0012 m；越小法线越能体现细节） */
  eps?: number
  /** 表面追踪的范围（格心坐标）：返回 false 的格不进入广度优先队列（分区细格只追踪自己那一块） */
  within?: (x: number, y: number, z: number) => boolean
}

/** 窄带 Surface Nets */
export function extract(f: Sdf, o: ExtractOpts): Surf {
  const h = o.h, C = o.coarse ?? 6
  const [x0, y0, z0] = o.min
  const nx = Math.ceil((o.max[0] - x0) / h) + 1, ny = Math.ceil((o.max[1] - y0) / h) + 1, nz = Math.ceil((o.max[2] - z0) / h) + 1
  const cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1
  const T0 = performance.now()
  const cv = new Float32Array(cx * cy * cz)
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) cv[i + cx * (j + cy * k)] = f(x0 + i * C * h, y0 + j * C * h, z0 + k * C * h)
  const N = nx * ny * nz, v = new Float32Array(N), done = new Uint8Array(N)
  const sx = 1, sy = nx, sz = nx * ny
  const corner = [0, sx, sy, sx + sy, sz, sx + sz, sy + sz, sx + sy + sz]
  const val = (id: number) => {
    if (!done[id]) { done[id] = 1; const i = id % nx, j = ((id / nx) | 0) % ny, k = (id / sz) | 0; v[id] = f(x0 + i * h, y0 + j * h, z0 + k * h) }
    return v[id]
  }
  // 表面追踪：从粗格的变号边找到种子细格，再沿「共享面有变号」的相邻格广度优先扩散 —— 只求值表面两侧一两层点
  const vid = new Int32Array(N).fill(-1), seen = new Uint8Array(N)
  let queue = new Int32Array(1 << 16), qh = 0, qt = 0
  const within = o.within
  const enq = (c: number) => { if (seen[c]) return; seen[c] = 1; if (within) { const i = c % nx, j = ((c / nx) | 0) % ny, k = (c / sz) | 0; if (!within(x0 + (i + 0.5) * h, y0 + (j + 0.5) * h, z0 + (k + 0.5) * h)) return } if (qt >= queue.length) { const q2 = new Int32Array(queue.length * 2); q2.set(queue); queue = q2 } queue[qt++] = c }
  const cellOk = (i: number, j: number, k: number) => i >= 0 && j >= 0 && k >= 0 && i < nx - 1 && j < ny - 1 && k < nz - 1
  const ccx = cx - 1, ccy = cy - 1, ccz = cz - 1
  for (let k = 0; k < ccz; k++) for (let j = 0; j < ccy; j++) for (let i = 0; i < ccx; i++) {
    // 粗格三条棱（x/y/z 方向，从 (i,j,k) 出发）若变号，沿棱细查
    const c0 = cv[i + cx * (j + cy * k)]
    for (let dd = 0; dd < 3; dd++) {
      const di = dd === 0 ? 1 : 0, dj = dd === 1 ? 1 : 0, dk = dd === 2 ? 1 : 0
      const c1 = cv[i + di + cx * (j + dj + cy * (k + dk))]
      if ((c0 < 0) === (c1 < 0)) continue
      const gi = i * C, gj = j * C, gk = k * C
      for (let t = 0; t < C; t++) {
        const ai = gi + di * t, aj = gj + dj * t, ak = gk + dk * t, bi = ai + di, bj = aj + dj, bk = ak + dk
        if (bi >= nx || bj >= ny || bk >= nz) break
        const va = val(ai + nx * (aj + ny * ak)), vb = val(bi + nx * (bj + ny * bk))
        if ((va < 0) === (vb < 0)) continue
        for (let q = 0; q < 4; q++) {
          const oi = di ? 0 : -(q & 1), oj = dj ? 0 : -((di ? q & 1 : q >> 1) & 1), ok = dk ? 0 : -(q >> 1)
          const ci = ai + oi, cj = aj + oj, ck = ak + ok
          if (cellOk(ci, cj, ck)) enq(ci + nx * (cj + ny * ck))
        }
        break
      }
    }
  }
  const T1 = performance.now()
  const EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7]
  // 六个面：邻格偏移 + 面上 4 个角
  const FD = [-1, 1, -sy, sy, -sz, sz], FC = [0, 2, 4, 6, 1, 3, 5, 7, 0, 1, 4, 5, 2, 3, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7]
  const g = new Float64Array(8)
  const P: number[] = [], CELL: number[] = []
  while (qh < qt) {
    const id = queue[qh++]
    const i = id % nx, j = ((id / nx) | 0) % ny, k = (id / sz) | 0
    let mask = 0
    for (let c = 0; c < 8; c++) { const q = val(id + corner[c]); g[c] = q; if (q < 0) mask |= 1 << c }
    if (mask === 0 || mask === 255) continue
    let px = 0, py = 0, pz = 0, n = 0
    for (let e = 0; e < 12; e++) {
      const a = EA[e], b = EB[e], ga = g[a], gb = g[b]
      if ((ga < 0) === (gb < 0)) continue
      const t = ga / (ga - gb)
      const ax = a & 1, ay = (a >> 1) & 1, az = a >> 2
      px += ax + ((b & 1) - ax) * t; py += ay + (((b >> 1) & 1) - ay) * t; pz += az + ((b >> 2) - az) * t; n++
    }
    vid[id] = P.length / 3
    P.push(x0 + (i + px / n) * h, y0 + (j + py / n) * h, z0 + (k + pz / n) * h)
    CELL.push(id)
    for (let fi = 0; fi < 6; fi++) {
      const m0 = (mask >> FC[fi * 4]) & 1
      if (((mask >> FC[fi * 4 + 1]) & 1) === m0 && ((mask >> FC[fi * 4 + 2]) & 1) === m0 && ((mask >> FC[fi * 4 + 3]) & 1) === m0) continue
      const ni = i + (fi === 0 ? -1 : fi === 1 ? 1 : 0), nj = j + (fi === 2 ? -1 : fi === 3 ? 1 : 0), nk = k + (fi === 4 ? -1 : fi === 5 ? 1 : 0)
      if (cellOk(ni, nj, nk)) enq(id + FD[fi])
    }
  }
  const T2 = performance.now()
  // ---- 面 ----
  const I: number[] = []
  const keep = o.keep
  const quad = (a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (keep) { const mx = (P[a * 3] + P[c * 3]) * 0.5, my = (P[a * 3 + 1] + P[c * 3 + 1]) * 0.5, mz = (P[a * 3 + 2] + P[c * 3 + 2]) * 0.5; if (!keep(mx, my, mz)) return }
    const dac = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2
    const dbd = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2
    if (dac < dbd) I.push(a, b, c, a, c, d); else I.push(a, b, d, b, c, d)
  }
  for (const id of CELL) {
    const i = id % nx, j = ((id / nx) | 0) % ny, k = (id / (nx * ny)) | 0
    if (i < 1 || j < 1 || k < 1) continue
    const a0 = v[id] < 0
    if (a0 !== (v[id + sx] < 0)) { const c0 = id, c1 = id - sy, c2 = id - sy - sz, c3 = id - sz
      if (a0) quad(vid[c0], vid[c1], vid[c2], vid[c3]); else quad(vid[c0], vid[c3], vid[c2], vid[c1]) }
    if (a0 !== (v[id + sy] < 0)) { const c0 = id, c1 = id - sz, c2 = id - sx - sz, c3 = id - sx
      if (a0) quad(vid[c0], vid[c1], vid[c2], vid[c3]); else quad(vid[c0], vid[c3], vid[c2], vid[c1]) }
    if (a0 !== (v[id + sz] < 0)) { const c0 = id, c1 = id - sx, c2 = id - sx - sy, c3 = id - sy
      if (a0) quad(vid[c0], vid[c1], vid[c2], vid[c3]); else quad(vid[c0], vid[c3], vid[c2], vid[c1]) }
  }
  // 边界格（i/j/k = 0）在包围盒留足边距时不会跨表面；这里不处理
  const T3 = performance.now()
  // ---- 压缩顶点 ----
  const remap = new Int32Array(P.length / 3).fill(-1); let vc = 0
  for (const a of I) if (remap[a] < 0) remap[a] = vc++
  const pos = new Float32Array(vc * 3), nrm = new Float32Array(vc * 3), idx = new Uint32Array(I.length)
  for (let i = 0; i < I.length; i++) idx[i] = remap[I[i]]
  for (let i = 0; i < remap.length; i++) if (remap[i] >= 0) { const r = remap[i]; pos[r * 3] = P[i * 3]; pos[r * 3 + 1] = P[i * 3 + 1]; pos[r * 3 + 2] = P[i * 3 + 2] }
  // ---- 投影 + 法线：都用格点值的三线性插值（不再额外求值）----
  const ix = 1 / h
  const tri = (x: number, y: number, z: number, out: Float64Array) => {
    // 返回 out = [值, dx, dy, dz]；用包含该点的细格（8 角都已求值时），否则退到粗格
    const fx = (x - x0) * ix, fy = (y - y0) * ix, fz = (z - z0) * ix
    let i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz)
    if (i >= 0 && j >= 0 && k >= 0 && i < nx - 1 && j < ny - 1 && k < nz - 1) {
      const id = i + nx * (j + ny * k)
      let ok = true; for (let c = 0; c < 8; c++) if (!done[id + corner[c]]) { ok = false; break }
      if (ok) { triCell(v, id, corner, fx - i, fy - j, fz - k, out, ix); return }
    }
    const cxx = (x - x0) * ix / C, cyy = (y - y0) * ix / C, czz = (z - z0) * ix / C
    i = clamp(Math.floor(cxx), 0, cx - 2); j = clamp(Math.floor(cyy), 0, cy - 2); k = clamp(Math.floor(czz), 0, cz - 2)
    const ccorner = [0, 1, cx, cx + 1, cx * cy, cx * cy + 1, cx * cy + cx, cx * cy + cx + 1]
    triCell(cv, i + cx * (j + cy * k), ccorner, clamp(cxx - i, 0, 1), clamp(cyy - j, 0, 1), clamp(czz - k, 0, 1), out, ix / C)
    if (cxx < 0 || cyy < 0 || czz < 0 || cxx > cx - 1 || cyy > cy - 1 || czz > cz - 1) out[0] = 1
  }
  const o4 = new Float64Array(4)
  for (let i = 0; i < vc; i++) {
    let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
    tri(x, y, z, o4)
    let gl = len3(o4[1], o4[2], o4[3]) || 1
    if ((o.project ?? 1) > 0) {
      const d = clamp(o4[0] / gl, -h * 0.4, h * 0.4)
      x -= (o4[1] / gl) * d; y -= (o4[2] / gl) * d; z -= (o4[3] / gl) * d
      tri(x, y, z, o4); gl = len3(o4[1], o4[2], o4[3]) || 1
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
    nrm[i * 3] = o4[1] / gl; nrm[i * 3 + 1] = o4[2] / gl; nrm[i * 3 + 2] = o4[3] / gl
  }
  if ((globalThis as any).__sdfProf) console.log('eval', (T1 - T0).toFixed(1), 'verts', (T2 - T1).toFixed(1), 'faces', (T3 - T2).toFixed(1), 'proj', (performance.now() - T3).toFixed(1))
  const sample: Sdf = (x, y, z) => { tri(x, y, z, o4); return o4[0] }
  return { pos, nrm, idx, vcount: vc, sample }
}
function triCell(g: Float32Array, id: number, corner: number[], tx: number, ty: number, tz: number, out: Float64Array, inv: number) {
  const c000 = g[id + corner[0]], c100 = g[id + corner[1]], c010 = g[id + corner[2]], c110 = g[id + corner[3]]
  const c001 = g[id + corner[4]], c101 = g[id + corner[5]], c011 = g[id + corner[6]], c111 = g[id + corner[7]]
  const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx, x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx
  const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty
  out[0] = y0 + (y1 - y0) * tz
  const dx0 = (c100 - c000) + ((c110 - c010) - (c100 - c000)) * ty, dx1 = (c101 - c001) + ((c111 - c011) - (c101 - c001)) * ty
  out[1] = (dx0 + (dx1 - dx0) * tz) * inv
  const dy0 = x10 - x00, dy1 = x11 - x01
  out[2] = (dy0 + (dy1 - dy0) * tz) * inv
  out[3] = (y1 - y0) * inv
}

/** SDF 环境光遮蔽（沿法线采样）：返回 0..1（1=无遮蔽） */
export function sdfAO(f: Sdf, x: number, y: number, z: number, nx: number, ny: number, nz: number, scale = 0.012, k = 1.6) {
  let occ = 0, w = 1
  for (let i = 1; i <= 4; i++) { const d = scale * i; occ += w * Math.max(0, d - f(x + nx * d, y + ny * d, z + nz * d)) / d; w *= 0.6 }
  return clamp(1 - occ * k * 0.45, 0, 1)
}

/**
 * 二次误差度量（QEM）边折叠减面：只动几何（位置 + 索引），颜色 / 法线 / 权重之后按 SDF 在最终顶点上重算。
 * 开放边界（部件裁切处）的顶点锁定不动，保证相邻部件的重叠带仍然贴合。带翻面检查与连接条件，防折叠 / 非流形。
 */
export function decimate(s: Surf, target: number): Surf {
  const nv = s.vcount, P = Float64Array.from(s.pos)
  let nf = s.idx.length / 3
  if (nf <= target) return s
  const NF = nf, F = Int32Array.from(s.idx), alive = new Uint8Array(NF).fill(1)
  const Q = new Float64Array(nv * 10)
  // 顶点 → 面角链表（typed array）：vh[v] 为首个面角，nx2[corner] 为下一个；面角 = f*3+k
  const vh = new Int32Array(nv).fill(-1), vt = new Int32Array(nv).fill(-1), nxt = new Int32Array(NF * 3).fill(-1)
  for (let c = 0; c < NF * 3; c++) { const v = F[c]; if (vh[v] < 0) vh[v] = c; else nxt[vt[v]] = c; vt[v] = c }
  for (let f = 0; f < NF; f++) {
    const a = F[f * 3] * 3, b = F[f * 3 + 1] * 3, c = F[f * 3 + 2] * 3
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const L = Math.hypot(nx, ny, nz) || 1e-12; nx /= L; ny /= L; nz /= L
    const d = -(nx * P[a] + ny * P[a + 1] + nz * P[a + 2]), w = L * 0.5
    for (let k = 0; k < 3; k++) {
      const q = F[f * 3 + k] * 10
      Q[q] += w * nx * nx; Q[q + 1] += w * nx * ny; Q[q + 2] += w * nx * nz; Q[q + 3] += w * nx * d; Q[q + 4] += w * ny * ny
      Q[q + 5] += w * ny * nz; Q[q + 6] += w * ny * d; Q[q + 7] += w * nz * nz; Q[q + 8] += w * nz * d; Q[q + 9] += w * d * d
    }
  }
  // 边界顶点：邻点数 ≠ 邻面数（闭合扇面二者相等）
  const lock = new Uint8Array(nv)
  {
    const mk = new Int32Array(nv).fill(-1)
    for (let v = 0; v < nv; v++) { let c = 0, nfv = 0; for (let cc = vh[v]; cc >= 0; cc = nxt[cc]) { nfv++; const f = (cc / 3) | 0; for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== v && mk[w] !== v) { mk[w] = v; c++ } } } if (c !== nfv) lock[v] = 1 }
  }
  const ver = new Uint32Array(nv), dead = new Uint8Array(nv)
  // 堆（并行数组）
  let cap = 1 << 16
  let hc = new Float64Array(cap), ha = new Int32Array(cap), hb = new Int32Array(cap), hva = new Uint32Array(cap), hvb = new Uint32Array(cap), hx = new Float64Array(cap), hy = new Float64Array(cap), hz = new Float64Array(cap)
  let hn = 0
  let heap = new Int32Array(1 << 18), hk = new Float64Array(1 << 18), hl = 0
  const push = (id: number) => {
    if (hl >= heap.length) { const h2 = new Int32Array(heap.length * 2); h2.set(heap); heap = h2; const k2 = new Float64Array(hk.length * 2); k2.set(hk); hk = k2 }
    let i = hl++; const c = hc[id]
    while (i > 0) { const p = (i - 1) >> 1; if (c < hk[p]) { heap[i] = heap[p]; hk[i] = hk[p]; i = p } else break }
    heap[i] = id; hk[i] = c
  }
  const pop = () => {
    const top = heap[0]; hl--
    if (hl > 0) {
      const id = heap[hl], c = hk[hl]; let i = 0
      for (;;) { const l = i * 2 + 1; if (l >= hl) break; const r = l + 1; const m = r < hl && hk[r] < hk[l] ? r : l; if (hk[m] < c) { heap[i] = heap[m]; hk[i] = hk[m]; i = m } else break }
      heap[i] = id; hk[i] = c
    }
    return top
  }
  const grow = () => {
    cap *= 2
    const g64 = (a: Float64Array) => { const n = new Float64Array(cap); n.set(a); return n }, g32 = (a: Int32Array) => { const n = new Int32Array(cap); n.set(a); return n }, gu = (a: Uint32Array) => { const n = new Uint32Array(cap); n.set(a); return n }
    hc = g64(hc); hx = g64(hx); hy = g64(hy); hz = g64(hz); ha = g32(ha); hb = g32(hb); hva = gu(hva); hvb = gu(hvb)
  }
  const qs = new Float64Array(10)
  const err = (x: number, y: number, z: number) => qs[0] * x * x + 2 * qs[1] * x * y + 2 * qs[2] * x * z + 2 * qs[3] * x + qs[4] * y * y + 2 * qs[5] * y * z + 2 * qs[6] * y + qs[7] * z * z + 2 * qs[8] * z + qs[9]
  const evalEdge = (a: number, b: number) => {
    if (lock[a] && lock[b]) return
    for (let k = 0; k < 10; k++) qs[k] = Q[a * 10 + k] + Q[b * 10 + k]
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2]
    const elen2 = (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2
    let x: number, y: number, z: number, best: number
    if (lock[a]) { x = ax; y = ay; z = az; best = err(x, y, z) }
    else if (lock[b]) { x = bx; y = by; z = bz; best = err(x, y, z) }
    else {
      x = (ax + bx) / 2; y = (ay + by) / 2; z = (az + bz) / 2; best = err(x, y, z)
      const A = qs[0], Bq = qs[1], Cq = qs[2], D = qs[4], E = qs[5], G = qs[7]
      const det = A * (D * G - E * E) - Bq * (Bq * G - E * Cq) + Cq * (Bq * E - D * Cq)
      if (Math.abs(det) > 1e-16) {
        const r0 = -qs[3], r1 = -qs[6], r2 = -qs[8]
        const sx = (r0 * (D * G - E * E) - Bq * (r1 * G - E * r2) + Cq * (r1 * E - D * r2)) / det
        const sy = (A * (r1 * G - E * r2) - r0 * (Bq * G - E * Cq) + Cq * (Bq * r2 - r1 * Cq)) / det
        const sz = (A * (D * r2 - r1 * E) - Bq * (Bq * r2 - r1 * Cq) + r0 * (Bq * E - D * Cq)) / det
        if ((sx - x) ** 2 + (sy - y) ** 2 + (sz - z) ** 2 < elen2) { const e = err(sx, sy, sz); if (e < best) { best = e; x = sx; y = sy; z = sz } }
      }
      const ea = err(ax, ay, az), eb = err(bx, by, bz)
      if (ea < best) { best = ea; x = ax; y = ay; z = az }
      if (eb < best) { best = eb; x = bx; y = by; z = bz }
    }
    if (hn >= cap) grow()
    const id = hn++
    hc[id] = Math.max(0, best) + elen2 * 1e-4; ha[id] = a; hb[id] = b; hva[id] = ver[a]; hvb[id] = ver[b]; hx[id] = x; hy[id] = y; hz[id] = z
    if (bulk) { if (hl >= heap.length) { const h2 = new Int32Array(heap.length * 2); h2.set(heap); heap = h2; const k2 = new Float64Array(hk.length * 2); k2.set(hk); hk = k2 } heap[hl] = id; hk[hl++] = hc[id] } else push(id)
  }
  let bulk = true
  for (let f = 0; f < NF; f++) for (let k = 0; k < 3; k++) { const a = F[f * 3 + k], b = F[f * 3 + (k + 1) % 3]; if (a < b) evalEdge(a, b) }
  bulk = false
  // Floyd 建堆
  for (let i = (hl >> 1) - 1; i >= 0; i--) {
    const id = heap[i], c = hk[i]; let j = i
    for (;;) { const l = j * 2 + 1; if (l >= hl) break; const r = l + 1; const m = r < hl && hk[r] < hk[l] ? r : l; if (hk[m] < c) { heap[j] = heap[m]; hk[j] = hk[m]; j = m } else break }
    heap[j] = id; hk[j] = c
  }
  const mark = new Uint32Array(nv); let stamp = 1
  const nb = new Int32Array(4096); let nbn = 0
  const neighbours = (v: number) => { stamp++; nbn = 0; mark[v] = stamp; for (let cc = vh[v]; cc >= 0; cc = nxt[cc]) { const f = (cc / 3) | 0; if (!alive[f]) continue; for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (mark[w] !== stamp) { mark[w] = stamp; if (nbn < nb.length) nb[nbn++] = w } } } }
  const flips = (v: number, other: number, x: number, y: number, z: number) => {
    for (let cc = vh[v]; cc >= 0; cc = nxt[cc]) {
      const f = (cc / 3) | 0
      if (!alive[f]) continue
      const i0 = F[f * 3], i1 = F[f * 3 + 1], i2 = F[f * 3 + 2]
      if (i0 === other || i1 === other || i2 === other) continue
      let ax = P[i0 * 3], ay = P[i0 * 3 + 1], az = P[i0 * 3 + 2], bx = P[i1 * 3], by = P[i1 * 3 + 1], bz = P[i1 * 3 + 2], cx = P[i2 * 3], cy = P[i2 * 3 + 1], cz = P[i2 * 3 + 2]
      const ox = (by - ay) * (cz - az) - (bz - az) * (cy - ay), oy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), oz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      if (i0 === v) { ax = x; ay = y; az = z } else if (i1 === v) { bx = x; by = y; bz = z } else { cx = x; cy = y; cz = z }
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      const ol = Math.hypot(ox, oy, oz), nl = Math.hypot(nx, ny, nz)
      if (nl < 1e-14) return true
      if ((ox * nx + oy * ny + oz * nz) / (ol * nl + 1e-30) < 0.3) return true
    }
    return false
  }
  while (nf > target && hl > 0) {
    const id = pop(), a = ha[id], b = hb[id]
    if (dead[a] || dead[b] || hva[id] !== ver[a] || hvb[id] !== ver[b]) continue
    // 连接条件：内部边两端共享邻点恰为 2
    neighbours(a)
    const sa = stamp
    let common = 0, adj = false
    for (let cc = vh[b]; cc >= 0; cc = nxt[cc]) { const f = (cc / 3) | 0; if (!alive[f]) continue; for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w === a) adj = true; else if (w !== b && mark[w] === sa) { mark[w] = sa + 1; common++ } } }
    stamp += 2
    if (!adj || common !== 2) continue
    const x = hx[id], y = hy[id], z = hz[id]
    if (flips(a, b, x, y, z) || flips(b, a, x, y, z)) continue
    P[a * 3] = x; P[a * 3 + 1] = y; P[a * 3 + 2] = z
    for (let k = 0; k < 10; k++) Q[a * 10 + k] += Q[b * 10 + k]
    if (lock[b]) lock[a] = 1
    for (let cc = vh[b]; cc >= 0; cc = nxt[cc]) {
      const f = (cc / 3) | 0
      if (!alive[f]) continue
      const i0 = F[f * 3], i1 = F[f * 3 + 1], i2 = F[f * 3 + 2]
      if (i0 === a || i1 === a || i2 === a) { alive[f] = 0; nf--; continue }
      F[cc] = a
    }
    // b 的面角链接到 a 的链尾；顺手剔掉 a 链里的死面
    if (vh[b] >= 0) { if (vh[a] < 0) vh[a] = vh[b]; else nxt[vt[a]] = vh[b]; vt[a] = vt[b] }
    { let prev = -1; for (let cc = vh[a]; cc >= 0; cc = nxt[cc]) { if (alive[(cc / 3) | 0] && F[cc] === a) { if (prev < 0) vh[a] = cc; else nxt[prev] = cc; prev = cc } } if (prev < 0) vh[a] = -1; else { nxt[prev] = -1; vt[a] = prev } }
    dead[b] = 1; ver[a]++; vh[b] = -1
    neighbours(a); for (let i = 0; i < nbn; i++) { const w = nb[i]; if (w !== a) evalEdge(Math.min(a, w), Math.max(a, w)) }
  }
  const remap = new Int32Array(nv).fill(-1); let vc = 0
  const I: number[] = []
  for (let f = 0; f < NF; f++) if (alive[f]) for (let k = 0; k < 3; k++) { const v = F[f * 3 + k]; if (remap[v] < 0) remap[v] = vc++; I.push(remap[v]) }
  const pos = new Float32Array(vc * 3)
  for (let v = 0; v < nv; v++) if (remap[v] >= 0) { pos[remap[v] * 3] = P[v * 3]; pos[remap[v] * 3 + 1] = P[v * 3 + 1]; pos[remap[v] * 3 + 2] = P[v * 3 + 2] }
  return { pos, nrm: new Float32Array(vc * 3), idx: Uint32Array.from(I), vcount: vc, sample: s.sample }
}

/** 减面后：可选投影回等值面，再用四面体差分（4 次求值）取 SDF 梯度法线（保留细节起伏） */
export function reproject(f: Sdf, s: Surf, steps = 0, eps = 0.0012, maxStep = 0.003) {
  const p = s.pos, n = s.nrm
  for (let i = 0; i < s.vcount; i++) {
    let x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2], gx = 0, gy = 0, gz = 0
    for (let k = 0; k <= steps; k++) {
      const e = k < steps ? 0.002 : eps
      const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e)
      gx = a - b - c + d; gy = -a - b + c + d; gz = -a + b - c + d
      const gl = len3(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl
      if (k < steps) { const dd = clamp((a + b + c + d) * 0.25, -maxStep, maxStep) * 0.9; x -= gx * dd; y -= gy * dd; z -= gz * dd }
    }
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; n[i * 3] = gx; n[i * 3 + 1] = gy; n[i * 3 + 2] = gz
  }
  return s
}
