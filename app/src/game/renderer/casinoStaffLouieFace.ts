// [casino] Louie 面部贴图（第四轮）：2048² 程序皮肤 + 照片细节。
//   头曲面 UV：U = u + 0.5（u = 头曲面绕一圈参数，0 = 正前）→ θ = (U − 0.5)·2π、s = sin θ；V = v → t = −0.06 + 1.06V（与 buildLouieHead 的 headS / feat 同一 (s, t)），
//   所以五官分区、缝线针孔、球眼包边都能按几何精确落位。
//   albedo：额头偏黄、鼻 / 颊偏红、下巴 / 上唇胡茬青灰 + 胡茬点、眼周偏暗、唇色 + 唇线 + 唇纹、雀斑 / 色斑 / 鼻翼颊上细血丝、眉下底色细毛；
//          球眼周围红肿 / 湿润 / 结痂 / 外圈淤青，嘴角缝线沿线红肿 + 针孔（暗红点 + 发白凸圈）+ 痂。
//   height → normal：按区域密度不同的毛孔（鼻头粗大密、颊中等、额细）、抬头纹、眉间纹、鱼尾纹、眼袋下缘、鼻唇沟、唇纵纹、胡茬点。
//   roughness（G 通道）：T 区（额中 / 鼻 / 下巴）油光低粗糙度，脸颊高；唇 / 湿润包边低、痂高。
//   照片细节：public/textures/casino/louie-skin-detail.webp（scripts/bake-louie-skin-detail.py 由 retroNpc 照片脸 kat-face 高通 + 五官定位重映射到本 UV），
//   浏览器里异步叠加进 albedo / height（正面半圈），不可用时只用程序部分。
import * as THREE from 'three'

/** [自下巴起高度比例 t, 脸半宽, 前凸, 后脑深, 后脑宽系数]（retroNpc：kat 五官定位下的 8 行；补颈根 / 颅顶两行） */
export const HEAD_ROWS: number[][] = [
  [-0.06, 0.046, 0.036, 0.036, 0.9], [0.04, 0.036, 0.074, 0.04, 0.8], [0.121, 0.058, 0.082, 0.066, 0.86], [0.202, 0.067, 0.088, 0.088, 0.95], [0.355, 0.071, 0.088, 0.097, 1.02],
  [0.56, 0.075, 0.08, 0.107, 1.06], [0.66, 0.076, 0.087, 0.11, 1.07], [0.8, 0.072, 0.079, 0.1, 1.06], [0.94, 0.057, 0.055, 0.074, 1.04], [0.985, 0.032, 0.03, 0.04, 1.0], [1.0, 0.0, 0.0, 0.0, 1.0],
]
export const rowAt = (t: number, k: number) => {
  const T = HEAD_ROWS
  if (t <= T[0][0]) return T[0][k]
  for (let i = 1; i < T.length; i++) if (t <= T[i][0]) {
    const i0 = Math.max(0, i - 2), i3 = Math.min(T.length - 1, i + 1), f = (t - T[i - 1][0]) / (T[i][0] - T[i - 1][0])
    const p0 = T[i0][k], p1 = T[i - 1][k], p2 = T[i][k], p3 = T[i3][k]
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
  }
  return T[T.length - 1][k]
}
export const LOUIE_HEAD = { chinY: 1.556, HH: 0.235, z0: 0.004 }
export const LOUIE_HW = 1.05, LOUIE_HD = 1.03
export const LOUIE_EYE = { s: 0.44, t: 0.555 }
/** 闭着的右眼：眼裂半宽（s 单位；头宽 w≈0.0787 m → 眼裂宽 ≈ 0.38·w ≈ 3.0 cm，与正常成人一致）与相对上一版（半宽 0.15）的放大倍数 */
export const LOUIE_LID_HW = 0.19, LOUIE_LID_K = LOUIE_LID_HW / 0.15
/** 嘴角缝线（每侧，(s, t) 未加笑弧）与球眼下竖缝；几何（stitches）与贴图（针孔 / 红肿）共用 */
export const LOUIE_STITCH: [number, number][] = [[0.3, 0.21], [0.42, 0.25], [0.55, 0.3], [0.66, 0.36]]
export const LOUIE_STITCH_EYE: [number, number][] = [[0.42, 0.46], [0.45, 0.4]]
export const LOUIE_STITCH_STEP = 0.0085, LOUIE_STITCH_LEN = 0.011
export const LOUIE_FACE_SIZE = 2048

const cl = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const ss = (a: number, b: number, x: number) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const G2 = (x: number, sx: number, y: number, sy: number) => Math.exp(-((x / sx) ** 2) - (y / sy) ** 2)
const hh = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
function vn(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = hh(xi, yi, s), b = hh(xi + 1, yi, s), c = hh(xi, yi + 1, s), d = hh(xi + 1, yi + 1, s)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
const fbm2 = (x: number, y: number, s: number, o = 4) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { v += a * vn(x * f, y * f, s + i * 17); a *= 0.5; f *= 2.03 } return v / (1 - 0.5 ** o) }
type C3 = [number, number, number]
const mx = (a: C3, b: C3, t: number): C3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** 头前表面近似（不含 feat 起伏）：(s, t) → 米制 3D，用于缝线弧长 */
function front3(s: number, t: number): C3 { const w = rowAt(t, 1) * LOUIE_HW, zf = rowAt(t, 2) * LOUIE_HD; return [w * s, LOUIE_HEAD.HH * t, zf * (1 - 0.5 * s * s - 0.27 * s ** 4)] }
function catmull2(P: [number, number][], n: number) {
  const out: [number, number][] = []
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)]
    for (let k = 0; k < n; k++) { const f = k / n, f2 = f * f, f3 = f2 * f; out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * f + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * f2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * f3)) as [number, number]) }
  }
  out.push(P[P.length - 1]); return out
}
/** 缝线在 (s, t) 上：主线采样 + 每针两端针孔 */
export function louieStitchMarks() {
  const lines: [number, number][][] = [], holes: [number, number][] = []
  const paths: [number, number][][] = []
  for (const sd of [1, -1]) paths.push(LOUIE_STITCH.map(([s, t]) => [sd * s, t + 0.035 * s * s]))
  paths.push(LOUIE_STITCH_EYE)
  for (const P of paths) {
    const pts = catmull2(P, 8); lines.push(pts)
    let acc = 0
    for (let k = 1; k < pts.length; k++) {
      const a = front3(...pts[k - 1]), b = front3(...pts[k]); acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      if (acc < LOUIE_STITCH_STEP) continue
      acc = 0
      // 切向（米制 x, y）→ 垂直方向 ±len/2
      const tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1, bx = -ty / L, by = tx / L
      for (const sg of [1, -1]) { const X = b[0] + bx * sg * LOUIE_STITCH_LEN * 0.5, Y = b[1] + by * sg * LOUIE_STITCH_LEN * 0.5, t = Y / LOUIE_HEAD.HH; holes.push([X / (rowAt(t, 1) * LOUIE_HW), t]) }
    }
  }
  return { lines, holes }
}

export interface LouieFaceBake { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement; H: Float32Array; A: Float32Array; size: number }
const mk = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

/** 逐像素：返回 [r, g, b, height, rough]（线性 0–1 前的 sRGB 值） */
function facePx(U: number, V: number, mk2: { holes: [number, number][]; lines: [number, number][][] }, w: number): [number, number, number, number, number] {
  const th = (U - 0.5) * Math.PI * 2, s = Math.sin(th), cs = Math.cos(th), t = -0.06 + 1.06 * V, as = Math.abs(s)
  const X = w * th * 0.92, Y = LOUIE_HEAD.HH * t
  const fr = ss(-0.05, 0.25, cs) // 正面权重（后脑在头发下，只给底色 + 毛孔）
  // ---------- 区域
  const wNose = G2(s, 0.17, t - 0.43, 0.13) * fr, wTip = G2(s, 0.16, t - 0.375, 0.05) * fr
  const wCheek = G2(as - 0.56, 0.24, t - 0.36, 0.13) * fr
  const wFore = ss(0.6, 0.72, t) * fr, wT = wFore * ss(0.45, 0.2, as) + wNose + G2(s, 0.25, t - 0.08, 0.07) * fr
  const smile = 0.035 * s * s
  const lipU = G2(s, 0.27, t - 0.232 - smile, 0.017) * fr, lipL = G2(s, 0.25, t - 0.185 - smile * 0.6, 0.02) * fr
  const lip = cl((lipU + lipL) * 1.3), slit = G2(s, 0.33, t - 0.208 - smile, 0.0042) * ss(0.36, 0.28, as) * fr
  const beard = ss(0.33, 0.25, t) * ss(-0.02, 0.06, t) * ss(0.96, 0.72, as) * (1 - cl(lip * 1.6)) * fr
  const eyeR = Math.hypot((as - 0.44) / 0.3, (t - 0.548) / 0.085)
  const periorb = Math.exp(-eyeR * eyeR * 1.4) * fr
  const ballR = Math.hypot(s - 0.44, (t - 0.552) * 2.1), ballSide = s > 0 ? fr : 0
  // ---------- 高度
  let h = 0
  const pFine = Math.pow(vn(X * 1150, Y * 1150, 3), 6), pMid = Math.pow(vn(X * 760, Y * 760, 4), 7), pBig = Math.pow(vn(X * 520, Y * 520, 5), 8)
  const poreW = (1 - cl(lip * 1.5)) * (1 - 0.6 * periorb)
  h -= 0.6 * poreW * (pFine * (0.35 + 0.35 * wFore + 0.3 * wCheek) + pMid * (0.5 * wCheek + 0.9 * wNose + 0.25 * beard) + pBig * (1.4 * wTip + 0.5 * wNose))
  h += 0.06 * fbm2(X * 90, Y * 90, 6, 3)
  if (fr > 0.01 && t > 0.1) {
    // 抬头纹（4 道微波浪）
    for (let i = 0; i < 4; i++) { const ti = 0.71 + i * 0.038, dt = t - ti - 0.005 * Math.sin(s * 6 + i * 1.7) + 0.012 * s * s; h -= 0.9 * fr * Math.exp(-((dt / 0.0035) ** 2)) * ss(0.62, 0.15, as) * (0.6 + 0.4 * vn(s * 8, i, 9)) }
    // 眉间纹
    for (const sg of [1, -1]) h -= 0.7 * G2(s - sg * 0.055, 0.008, t - 0.635, 0.03) * fr
    // 鱼尾纹（眼外角放射）
    for (const sg of [1, -1]) {
      const cx = sg * 0.74, ox = (s - cx) * w, oy = (t - 0.55) * LOUIE_HEAD.HH
      if (sg * ox > -0.002) for (const ph of [-0.55, -0.2, 0.15, 0.45]) {
        const dx = Math.cos(ph) * sg, dy = Math.sin(ph), along = ox * dx + oy * dy, perp = -ox * dy + oy * dx
        if (along > 0 && along < 0.02) h -= 0.35 * fr * Math.exp(-((perp / 0.0006) ** 2)) * ss(0, 0.003, along) * ss(0.02, 0.01, along)
      }
    }
    // 眼袋：下缘一道沟 + 沟上微鼓
    { const r = Math.hypot((as - 0.44) / 0.2, (t - 0.54) / 0.06); const low = t < 0.545 ? 1 : 0; h += low * fr * (-0.9 * Math.exp(-(((r - 1) / 0.09) ** 2)) + 0.35 * Math.exp(-(((r - 0.75) / 0.2) ** 2))) }
    // 鼻唇沟（鼻翼外 → 嘴角外，向外弓）
    { let dm = 1; const P0 = [0.25, 0.355], P1 = [0.44, 0.27], P2 = [0.41, 0.17]
      for (let k = 0; k <= 14; k++) { const f = k / 14, bx = (1 - f) ** 2 * P0[0] + 2 * f * (1 - f) * P1[0] + f * f * P2[0], by = (1 - f) ** 2 * P0[1] + 2 * f * (1 - f) * P1[1] + f * f * P2[1]; dm = Math.min(dm, Math.hypot((as - bx) * w, (t - by) * LOUIE_HEAD.HH)) }
      h -= 1.2 * fr * Math.exp(-((dm / 0.0016) ** 2)); h += 0.35 * fr * Math.exp(-(((dm - 0.004) / 0.003) ** 2)) * (as > 0.33 ? 1 : 0) }
    // 唇纵纹 + 唇线（唇红缘微凸）
    h -= lip * 0.5 * Math.pow(Math.abs(Math.sin(s * 70 + vn(s * 20, t * 60, 7) * 2)), 6)
    { const eU = Math.abs(t - 0.232 - smile - 0.017), eL = Math.abs(t - 0.185 - smile * 0.6 + 0.021); h += 0.4 * fr * ss(0.3, 0.2, as) * (Math.exp(-((eU / 0.002) ** 2)) + Math.exp(-((eL / 0.0025) ** 2))) }
  }
  // ---------- 底色
  let rgh = 0.56
  let c: C3 = [0.85, 0.665, 0.56]
  c = mx(c, [0.79, 0.62, 0.54], 0.35 * fbm2(X * 30, Y * 30, 11, 3))
  c = mx(c, [0.86, 0.71, 0.52], 0.55 * wFore)                         // 额头偏黄
  c = mx(c, [0.84, 0.5, 0.45], cl(0.5 * wNose + 0.5 * wTip + 0.42 * wCheek))  // 鼻 / 颊偏红
  c = mx(c, [0.5, 0.5, 0.57], 0.32 * beard)                            // 胡茬青灰底
  c = mx(c, [0.6, 0.44, 0.43], 0.42 * periorb)                         // 眼周偏暗
  c = mx(c, [0.52, 0.38, 0.42], 0.22 * fr * G2(as - 0.44, 0.17, t - 0.505, 0.022))    // 眼下青紫
  // 雀斑 / 色斑 / 细血丝
  if (fr > 0.01) {
    const frk = Math.pow(vn(X * 260, Y * 260, 13), 18) * fr, spot = ss(0.7, 0.82, fbm2(X * 60, Y * 60, 14, 3)) * fr
    c = mx(c, [0.62, 0.43, 0.33], cl(frk * 0.8 + spot * 0.22))
    const cap = Math.pow(1 - Math.abs(fbm2(X * 160, Y * 160, 15, 3) - 0.5) * 2, 22) * (0.8 * wNose + 0.7 * wCheek) * (1 - lip)
    c = mx(c, [0.72, 0.25, 0.26], cl(cap * 0.9))
  }
  // 胡茬点（毛囊 + 刚冒的短须）
  const stub = beard > 0.001 ? ss(0.62, 0.8, vn(X * 2300, Y * 2300, 16)) * beard : 0, stub2 = beard > 0.001 ? ss(0.7, 0.85, vn(X * 1500 + 3.1, Y * 1500, 17)) * beard : 0
  c = mx(c, [0.11, 0.1, 0.12], cl(0.7 * stub + 0.5 * stub2)); h -= 0.04 * (stub + stub2); rgh += 0.1 * stub
  // 唇：底色 + 唇红缘 + 嘴缝 + 鼻孔
  c = mx(c, [0.71, 0.4, 0.39], cl(lip * 0.85)); c = mx(c, [0.6, 0.3, 0.3], cl(lipL * 0.25 * vn(s * 60, t * 200, 18)))
  c = mx(c, [0.23, 0.08, 0.08], slit)
  c = mx(c, [0.17, 0.08, 0.07], fr * G2(as - 0.13, 0.05, t - 0.33, 0.012))
  // 眉下底色细毛（几何细毛下面的皮肤可见毛根 / 短毛）
  for (const sd of [1, -1]) {
    if (s * sd < 0.1 || s * sd > 0.74 || fr < 0.05) continue
    const k = cl((s * sd - 0.18) / 0.5), tc = 0.64 + 0.022 * Math.sin(k * Math.PI * 0.9) - 0.01 * k, thk = 0.016 + 0.01 * (1 - k)
    const m = ss(1, 0.4, Math.abs(t - tc) / thk) * ss(0.1, 0.2, s * sd) * ss(0.74, 0.66, s * sd)
    const ang = -0.35 * sd + k * 0.5 * sd, ux = Math.cos(ang) * X + Math.sin(ang) * Y, uy = -Math.sin(ang) * X + Math.cos(ang) * Y
    const hair = ss(0.55, 0.85, vn(ux * 300, uy * 3200, 19 + (sd > 0 ? 1 : 0)))
    c = mx(c, [0.22, 0.14, 0.09], cl(m * (0.25 + 0.6 * hair))); h += m * hair * 0.4
  }
  // 闭着的右眼（s<0）：睑缘线 + 上睑微粉 + 睑褶阴影
  if (s < 0) {
    const K = LOUIE_LID_K, k = (-s - 0.44) / LOUIE_LID_HW, lidT = 0.555 - 0.004 * K - 0.012 * K * Math.cos(cl(k, -1, 1) * Math.PI / 2)
    c = mx(c, [0.78, 0.55, 0.52], 0.3 * fr * G2(-s - 0.44, 0.14 * K, t - 0.565, 0.02 * K)) // 上睑微粉
    c = mx(c, [0.74, 0.54, 0.5], 0.18 * fr * G2(-s - 0.44, 0.12 * K, t - 0.528, 0.012 * K)) // 下睑微粉
    c = mx(c, [0.2, 0.12, 0.1], 0.85 * fr * Math.exp(-(((t - lidT) / (0.0035 * K)) ** 2)) * ss(1.05, 0.85, Math.abs(k)))
    c = mx(c, [0.55, 0.4, 0.37], 0.4 * fr * Math.exp(-(((t - 0.555 - 0.02 * K - 0.006 * K * Math.cos(k * 1.4)) / (0.005 * K)) ** 2)) * ss(1.1, 0.8, Math.abs(k)))
    h += 0.35 * fr * Math.exp(-(((t - lidT) / (0.003 * K)) ** 2)) * ss(1.05, 0.85, Math.abs(k)) // 睑缘线凹
    rgh += 0.35 * fr * G2(-s - 0.44, 0.17 * K, t - 0.562, 0.024 * K) // 上睑去镜面高光（原来睑上一道白色反光）
  }
  // 球眼：外圈淤青（青紫→黄）、红肿圈、内圈湿润暗红、下缘结痂
  if (ballSide > 0.01 && ballR < 0.55) {
    const bru = Math.exp(-(((ballR - 0.38) / 0.09) ** 2)), sw = Math.exp(-(((ballR - 0.26) / 0.07) ** 2)), wet = ss(0.25, 0.18, ballR)
    c = mx(c, mx([0.5, 0.42, 0.5], [0.72, 0.62, 0.38], ss(0.35, 0.48, ballR)), 0.38 * bru * ballSide)
    c = mx(c, [0.66, 0.3, 0.29], 0.6 * sw * ballSide); c = mx(c, [0.42, 0.13, 0.13], 0.75 * wet * ballSide)
    const scab = ss(0.62, 0.7, fbm2(X * 140, Y * 140, 21, 3)) * Math.exp(-(((ballR - 0.22) / 0.035) ** 2)) * (t < 0.55 ? 1 : 0.25)
    c = mx(c, [0.28, 0.1, 0.07], cl(scab * 1.2) * ballSide); h += 0.6 * scab + 0.25 * sw - 0.2 * wet; rgh += 0.3 * scab - 0.22 * wet - 0.1 * sw
  }
  // 缝线：沿线红肿 + 针孔（暗红孔 + 发白凸圈）+ 小痂
  if (fr > 0.05 && t > 0.15 && t < 0.52 && as > 0.18) {
    let dl = 1
    for (const L of mk2.lines) for (const p of L) { if (Math.abs(t - p[1]) > 0.06 || Math.abs(s - p[0]) > 0.15) continue; dl = Math.min(dl, Math.hypot((s - p[0]) * w, (t - p[1]) * LOUIE_HEAD.HH)) }
    const inf = Math.exp(-((dl / 0.0045) ** 2))
    c = mx(c, [0.72, 0.33, 0.31], 0.55 * inf * fr); h += 0.5 * inf
    let dh = 1; if (dl < 0.012) for (const p of mk2.holes) { if (Math.abs(t - p[1]) > 0.03) continue; dh = Math.min(dh, Math.hypot((s - p[0]) * w, (t - p[1]) * LOUIE_HEAD.HH)) }
    const hole = ss(0.0007, 0.0003, dh), ring = Math.exp(-(((dh - 0.0011) / 0.0004) ** 2))
    c = mx(c, [0.85, 0.7, 0.62], 0.35 * ring); c = mx(c, [0.25, 0.04, 0.05], 0.9 * hole); h += 0.5 * ring - 1.2 * hole; rgh -= 0.2 * hole
    const scab = ss(0.62, 0.75, vn(X * 900, Y * 900, 23)) * Math.exp(-((dl / 0.0022) ** 2))
    c = mx(c, [0.3, 0.1, 0.07], cl(scab)); h += 0.6 * scab; rgh += 0.25 * scab
  }
  // ---------- 粗糙度：T 区油光、颊干、唇湿
  rgh += -0.2 * cl(wT) + 0.08 * wCheek + 0.06 * beard - 0.24 * lip - 0.3 * slit + 0.1 * (pFine + pMid) * poreW
  return [c[0], c[1], c[2], h, cl(rgh, 0.15, 0.95)]
}

function normalsInto(B: LouieFaceBake, x0: number, x1: number) {
  const S = B.size, H = B.H, ctx = B.normal.getContext('2d')!, img = ctx.getImageData(x0, 0, x1 - x0, S), D = img.data, k = 0.9 * S / 256
  for (let y = 0; y < S; y++) for (let x = x0; x < x1; x++) {
    const at = (xx: number, yy: number) => H[Math.min(S - 1, Math.max(0, yy)) * S + ((xx + S) % S)]
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), o = (y * (x1 - x0) + (x - x0)) * 4
    D[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); D[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); D[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); D[o + 3] = 255
  }
  ctx.putImageData(img, x0, 0)
}

/** 程序烘焙（同步，按尺寸缓存）——[casino 阶段 4] 游戏里只同步烘 256² 预览；2048² 走 bakeLouieFaceAsync */
const BAKES = new Map<number, LouieFaceBake>()
function* bakeRows(size: number): Generator<number, LouieFaceBake, void> {
  const marks = louieStitchMarks()
  const A = mk(size, size), N = mk(size, size), R = mk(size, size)
  const H = new Float32Array(size * size), AL = new Float32Array(size * size * 3)
  const ai = A.getContext('2d')!.createImageData(size, size), ri = R.getContext('2d')!.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    const V = 1 - (y + 0.5) / size, wRow = rowAt(-0.06 + 1.06 * V, 1) * LOUIE_HW
    for (let x = 0; x < size; x++) {
      const p = facePx((x + 0.5) / size, V, marks, wRow), o = y * size + x
      H[o] = p[3]; AL[o * 3] = p[0]; AL[o * 3 + 1] = p[1]; AL[o * 3 + 2] = p[2]
      ai.data[o * 4] = Math.round(cl(p[0]) * 255); ai.data[o * 4 + 1] = Math.round(cl(p[1]) * 255); ai.data[o * 4 + 2] = Math.round(cl(p[2]) * 255); ai.data[o * 4 + 3] = 255
      const r = Math.round(p[4] * 255); ri.data[o * 4] = r; ri.data[o * 4 + 1] = r; ri.data[o * 4 + 2] = r; ri.data[o * 4 + 3] = 255
    }
    yield y
  }
  A.getContext('2d')!.putImageData(ai, 0, 0); R.getContext('2d')!.putImageData(ri, 0, 0)
  const B: LouieFaceBake = { albedo: A, normal: N, rough: R, H, A: AL, size }
  const step = 128
  for (let x0 = 0; x0 < size; x0 += step) { normalsInto(B, x0, Math.min(size, x0 + step)); yield size + x0 }
  return B
}
export function bakeLouieFace(size = LOUIE_FACE_SIZE): LouieFaceBake {
  const hit = BAKES.get(size); if (hit) return hit
  const g = bakeRows(size); let r = g.next(); while (!r.done) r = g.next()
  BAKES.set(size, r.value); return r.value
}
export const louieFaceCached = (size = LOUIE_FACE_SIZE) => BAKES.get(size) ?? null
/** 统计：最近一次异步烘焙的分片数 / 最长单片耗时（check 用） */
export const LOUIE_ASYNC_STATS = { slices: 0, maxSliceMs: 0, totalMs: 0, done: false }
type Sched = (f: (deadline?: { timeRemaining: () => number }) => void) => void
const defaultSched: Sched = (f) => {
  const ric = (globalThis as unknown as { requestIdleCallback?: (cb: (d: { timeRemaining: () => number }) => void, o?: { timeout: number }) => void }).requestIdleCallback
  if (ric) ric(f, { timeout: 200 }); else setTimeout(() => f(), 16)
}
/** 分块异步烘焙：每片最多 budgetMs（默认 8 ms）——idle 回调里做，不阻塞主线程；结果进 BAKES 缓存 */
let ASYNC: Promise<LouieFaceBake> | null = null
export function bakeLouieFaceAsync(size = LOUIE_FACE_SIZE, budgetMs = 8, sched: Sched = defaultSched): Promise<LouieFaceBake> {
  const hit = BAKES.get(size); if (hit) return Promise.resolve(hit)
  if (ASYNC) return ASYNC
  const g = bakeRows(size)
  LOUIE_ASYNC_STATS.slices = 0; LOUIE_ASYNC_STATS.maxSliceMs = 0; LOUIE_ASYNC_STATS.totalMs = 0; LOUIE_ASYNC_STATS.done = false
  ASYNC = new Promise((res) => {
    const slice = () => {
      const t0 = performance.now()
      let r = g.next()
      while (!r.done && performance.now() - t0 < budgetMs) r = g.next()
      const ms = performance.now() - t0
      LOUIE_ASYNC_STATS.slices++; LOUIE_ASYNC_STATS.totalMs += ms; LOUIE_ASYNC_STATS.maxSliceMs = Math.max(LOUIE_ASYNC_STATS.maxSliceMs, ms)
      if (r.done) { BAKES.set(size, r.value); LOUIE_ASYNC_STATS.done = true; ASYNC = null; res(r.value) } else sched(slice)
    }
    sched(slice)
  })
  return ASYNC
}
export const LOUIE_PREVIEW_SIZE = 256

/** 照片细节叠加（正面半圈 U∈[0.25, 0.75]）；返回是否成功 */
export function applyLouieDetail(B: LouieFaceBake, img: CanvasImageSource & { width: number; height: number }) {
  const S = B.size, x0 = Math.round(S * 0.25), x1 = Math.round(S * 0.75), W = x1 - x0
  const c = mk(W, S), cx = c.getContext('2d')!; cx.drawImage(img, 0, 0, W, S)
  const d = cx.getImageData(0, 0, W, S).data
  const actx = B.albedo.getContext('2d')!, ai = actx.getImageData(x0, 0, W, S)
  for (let y = 0; y < S; y++) for (let x = 0; x < W; x++) {
    const o = y * S + x + x0
    // 闭着的右眼（3 cm 眼裂）周围不叠照片细节（照片眼白 / 眼线会从放大的眼睑下透出）
    const es = Math.sin(((x + x0 + 0.5) / S - 0.5) * Math.PI * 2), et = -0.06 + 1.06 * (1 - (y + 0.5) / S)
    const eyeM = es < 0 ? ss(0.75, 1.15, Math.hypot((es + 0.44) / (LOUIE_LID_HW * 1.25), (et - 0.556) / 0.042)) : 1
    const dv = ((d[(y * W + x) * 4] - 128) / 128) * eyeM
    if (dv === 0) continue
    B.H[o] += 0.9 * dv
    const f = 1 + 0.55 * dv, q = (y * W + x) * 4
    for (let k = 0; k < 3; k++) ai.data[q + k] = Math.round(cl(B.A[o * 3 + k] * f) * 255)
  }
  actx.putImageData(ai, x0, 0)
  normalsInto(B, x0, x1)
  return true
}

let READY: Promise<boolean> | null = null
/** 浏览器：加载照片细节并叠加到已烘焙的贴图（tex 列表在叠加后标记更新）。node 下直接 resolve(false) */
export function louieFaceDetail(texs: THREE.Texture[] = []): Promise<boolean> {
  if (READY) return READY
  if (typeof document === 'undefined' || typeof Image === 'undefined') return (READY = Promise.resolve(false))
  READY = new Promise((res) => {
    const im = new Image()
    im.onload = () => { void bakeLouieFaceAsync().then((B) => { try { applyLouieDetail(B, im); texs.forEach((t) => (t.needsUpdate = true)); res(true) } catch (e) { console.warn('louie detail', e); res(false) } }) }
    im.onerror = () => res(false)
    im.src = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ? `${(import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL}textures/casino/louie-skin-detail.webp` : '/textures/casino/louie-skin-detail.webp'
  })
  return READY
}
