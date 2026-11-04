// [bellhop] 行李员（Entity 135）身体 SDF 部件（模型空间，静止姿态）。照看门人 conciergeBody 的做法改写（不改动看门人文件）：
//   coat   藏青双排扣长制服（胸廓 / 方肩 / 收腰 + 下摆外展到大腿中段、后中开衩；门襟叠边、腰缝、口袋盖、肩线、后中缝；
//          全长袖 + 白色翻袖口（袖口端掏空，手从里面伸出））；领口挖洞（白立领是独立薄壳）
//   pants  深色西裤（人腿：大腿 / 膝 / 小腿，前裤线，裤脚压在皮鞋上的一道折）
//   shoe   黑皮鞋（牛津鞋：鞋头、鞋舌、鞋带区、沿条 + 鞋底 + 鞋跟）
//   hand   苍白细长人手（掌、鱼际 / 小鱼际、指节、五指三节、指甲）+ 一截藏进袖口的手腕
// 每个部件给出：sdf、颜色（Shade）、蒙皮权重（W4）。
import { clamp, fbm, gauss, len2, len3, mix, sdCapsule, sdEll, sdRoundBox, sdRoundCone, smax, smin, sstep, vnoise } from './conciergeSdf'
import { B, HANDS, J, W4, add, chainWeights, cross, dot, lenv, nrm, scl, side, sub, type Finger, type HandFrame, type V3 } from './bellhopRig'
import type { Shade } from './conciergeHead'

const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
export const setS = (o: Shade, c: number[], rough: number, metal: number, fur: number, skin: number, cloth: number, wool: number) => { o.r = c[0]; o.g = c[1]; o.b = c[2]; o.rough = rough; o.metal = metal; o.fur = fur; o.skin = skin; o.cloth = cloth; o.wool = wool; o.fx = 0; o.fy = 0; o.fz = 0 }
const mixc = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mulc = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]
/** 椭圆近似距离 */
function sdEllipse(x: number, y: number, a: number, b: number) { const k0 = len2(x / a, y / b), k1 = len2(x / (a * a), y / (b * b)); return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1 }

// ======================================================================
// 制服（躯干 + 下摆 + 袖）
// ======================================================================
/** 领口（颈洞）中心与半径：白立领薄壳盖住边缘 */
export const NECK_HOLE = { c: [0, 1.46, -0.018] as V3, r: 0.061 }
/** 下摆高度（前高后低） */
export const hemY = (_x: number, z: number) => 0.795 + 0.035 * sstep(-0.06, 0.1, z)
/** 双排扣：两列金扣（x 半距随高度略收）与行高 */
export const BUTTON_ROWS = [1.375, 1.29, 1.205, 1.12, 1.035, 0.95]
export const buttonX = (y: number) => 0.072 - 0.008 * sstep(1.38, 0.95, y)
/** 门襟叠边（角色右侧那片压在上面，边在 x = −0.1 附近） */
const EDGE_X = -0.1

interface ArmSeg { a: V3; e: V3; w: V3; du: V3; df: V3; Lu: number; Lf: number; end: V3 }
const ARM: Record<number, ArmSeg> = {}
for (const s of [1, -1]) {
  const a = side(J.shoulder, s), e = side(J.elbow, s), w = side(J.wrist, s)
  const du = nrm(sub(e, a)), df = nrm(sub(w, e))
  ARM[s] = { a, e, w, du, df, Lu: lenv(sub(e, a)), Lf: lenv(sub(w, e)), end: add(w, scl(df, 0.006)) }
}
/** 前臂袖：沿前臂参数（0 肘 → 1 腕） */
export const foreT = (s: number, X: number, Y: number, Z: number) => { const A = ARM[s]; return ((X - A.e[0]) * A.df[0] + (Y - A.e[1]) * A.df[1] + (Z - A.e[2]) * A.df[2]) / A.Lf }
/** 翻袖口起点（前臂参数） */
export const CUFF_T = 0.75
const sleeveR = (t: number) => mix(0.0445, 0.0385, clamp(t, 0, 1))
function sleeve(s: number, X: number, Y: number, Z: number) {
  const A = ARM[s]
  let d = sdRoundCone(X, Y, Z, A.a[0] - s * 0.01, A.a[1] - 0.018, A.a[2], A.e[0], A.e[1], A.e[2], 0.046, 0.0445)
  // 方肩垫 + 袖山
  d = smin(d, sdEll(X, Y, Z, A.a[0] - s * 0.024, A.a[1] - 0.024, A.a[2], 0.041, 0.03, 0.043), 0.032) // 收小：肩头不鼓
  const lower = sdRoundCone(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], 0.0445, 0.0385)
  d = smin(d, lower, 0.02)
  const t = foreT(s, X, Y, Z)
  // 肘弯的几道横褶（内侧）
  if (t > -0.25 && t < 0.3) d -= 0.0016 * gauss(t, 0.12) * Math.sin(t * 70 + 0.5 * Math.sin(X * 90))
  // 白色翻袖口：比袖子粗一圈的筒，上沿圆润
  if (t > CUFF_T - 0.1) {
    const p0 = add(A.e, scl(A.df, A.Lf * CUFF_T)), r0 = sleeveR(CUFF_T) + 0.0052, r1 = sleeveR(1) + 0.0048
    const cuff = sdRoundCone(X, Y, Z, p0[0], p0[1], p0[2], A.end[0], A.end[1], A.end[2], r0, r1)
    d = Math.min(d, smax(cuff, (CUFF_T + 0.012 - t) * A.Lf - 0.0, 0.004))
  }
  // 袖口端：截平 + 掏空（手腕从里面伸出）
  const tt = (t - 1) * A.Lf
  d = smax(d, tt - 0.006, 0.004)
  const cav = sdRoundCone(X, Y, Z, A.end[0] - A.df[0] * 0.05, A.end[1] - A.df[1] * 0.05, A.end[2] - A.df[2] * 0.05, A.end[0] + A.df[0] * 0.03, A.end[1] + A.df[1] * 0.03, A.end[2] + A.df[2] * 0.03, 0.028, 0.031)
  d = smax(d, -cav, 0.004)
  return d
}
/** 躯干芯（无布纹），给 AO / 权重用 */
export function torsoCore(X: number, Y: number, Z: number) {
  const ax = Math.abs(X)
  let d = sdEll(X, Y, Z, 0, 1.3, -0.014, 0.142, 0.2, 0.098) // 胸廓
  d = smin(d, sdEll(ax, Y, Z, 0.056, 1.35, 0.016, 0.08, 0.075, 0.056), 0.05) // 胸
  d = smin(d, sdEll(X, Y, Z, 0, 1.11, -0.006, 0.128, 0.15, 0.09), 0.06) // 腰（收）
  d = smin(d, sdRoundCone(ax, Y, Z, 0.03, 1.45, -0.024, 0.165, 1.448, -0.024, 0.046, 0.046), 0.06) // 方肩（垫肩）
  d = smin(d, sdEll(ax, Y, Z, 0.075, 1.36, -0.064, 0.072, 0.1, 0.048), 0.035) // 肩胛
  d = smin(d, sdRoundCone(X, Y, Z, 0, 1.39, -0.018, 0, 1.468, -0.018, 0.092, 0.077), 0.06) // 领座（制服在颈根处收成一圈，立领坐在上面）
  return d
}
/** 下摆（放样椭圆截面：腰 → 大腿中段外展） */
function skirt(X: number, Y: number, Z: number) {
  const k = sstep(1.1, 0.82, Y)
  const a = mix(0.13, 0.192, k), bF = mix(0.09, 0.122, k), bB = mix(0.092, 0.13, k)
  const zc = -0.006
  const b = Z - zc > 0 ? bF : bB
  let d = sdEllipse(X, Z - zc, a, b)
  d = smax(d, Y - 1.12, 0.03)
  return d
}
export function coatSdf(X: number, Y: number, Z: number) {
  if (Y < 0.74 || Y > 1.62) return Math.max(0.74 - Y, Y - 1.62) + 0.05
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  let d = torsoCore(X, Y, Z)
  d = smin(d, skirt(X, Y, Z), 0.05)
  // 下摆截平（前高后低）
  d = smax(d, hemY(X, Z) - Y, 0.005)
  // 腰缝（一圈浅凹）+ 下摆前后的几道竖向松量褶
  d += 0.0014 * gauss(Y - 1.06, 0.004)
  const phi = Math.atan2(X, Z)
  d -= 0.0022 * sstep(1.0, 0.84, Y) * Math.sin(phi * 7 + 0.8) * (0.6 + 0.4 * vnoise(X * 14, Y * 6, Z * 14))
  // 腋下斜褶
  for (const sd of [1, -1]) {
    if (sd !== sx) continue
    const r = len2(X - sd * 0.13, Y - 1.4), ang = Math.atan2(Y - 1.4, (X - sd * 0.13) * sd)
    d -= 0.0018 * gauss(r - 0.065, 0.045) * sstep(0.0, 0.03, r) * Math.sin(ang * 8 + r * 30)
  }
  d += 0.0006 * fbm(X * 30, Y * 30, Z * 30, 2)
  if (Z > 0) {
    // 门襟叠边：x < EDGE_X 的那片在下（低一点），叠边一道台阶
    d += 0.0016 * sstep(EDGE_X + 0.002, EDGE_X - 0.002, X) * sstep(1.5, 1.44, Y)
    // 口袋盖（两侧、腰缝下）
    for (const sd of [1, -1]) {
      const cx = sd * 0.115, cy = 0.99
      const m = sstep(0.05, 0.046, Math.abs(X - cx)) * sstep(0.022, 0.018, Math.abs(Y - cy - 0.004))
      d -= 0.0024 * m
    }
  } else {
    // 后中开衩
    d += 0.0026 * gauss(X, 0.0025) * sstep(0.97, 0.93, Y)
  }
  // 袖
  // 袖与躯干：肩部平滑融合；腰以下（手垂在下摆旁）硬并，免得下摆和袖口粘连
  const kS = mix(0.003, 0.026, sstep(1.08, 1.28, Y))
  for (const s of [1, -1]) if (sx === s || ax < 0.05) d = smin(d, sleeve(s, X, Y, Z), kS)
  // 领口：挖出颈洞（白立领盖住）
  {
    const px = X - NECK_HOLE.c[0], pz = Z - NECK_HOLE.c[2]
    d = smax(d, -(Math.max(len2(px, pz) - NECK_HOLE.r, NECK_HOLE.c[1] - Y)), 0.008)
  }
  return d
}
export const COAT_BOX = { min: [-0.34, 0.75, -0.2] as [number, number, number], max: [0.34, 1.6, 0.18] as [number, number, number] }
/** 前臂袖细格区域：<0 归细格 */
export function foreSleeveRegion(s: number, X: number, Y: number, Z: number) {
  const A = ARM[s], t = foreT(s, X, Y, Z)
  const px = X - A.e[0] - A.df[0] * t * A.Lf, py = Y - A.e[1] - A.df[1] * t * A.Lf, pz = Z - A.e[2] - A.df[2] * t * A.Lf
  return Math.max((0.2 - t) * A.Lf, (t - 1.12) * A.Lf, len3(px, py, pz) - 0.075)
}
export const SLEEVE_BAND = 0.008
export function foreSleeveBox(s: number) {
  const A = ARM[s], p0 = add(A.e, scl(A.df, A.Lf * 0.12)), p1 = add(A.end, scl(A.df, 0.03)), r = 0.07
  return { min: [Math.min(p0[0], p1[0]) - r, Math.min(p0[1], p1[1]) - r, Math.min(p0[2], p1[2]) - r] as [number, number, number], max: [Math.max(p0[0], p1[0]) + r, Math.max(p0[1], p1[1]) + r, Math.max(p0[2], p1[2]) + r] as [number, number, number] }
}
/** 表面吸附：从 p 沿梯度收到 f = off */
export function onSurface(f: (x: number, y: number, z: number) => number, p: V3, off = 0): V3 {
  let x = p[0], y = p[1], z = p[2]
  for (let i = 0; i < 30; i++) {
    const d = f(x, y, z) - off, e = 0.001
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e)
    const gl = len3(gx, gy, gz) || 1
    x -= (gx / gl) * d * 0.8; y -= (gy / gl) * d * 0.8; z -= (gz / gl) * d * 0.8
    if (Math.abs(d) < 1e-5) break
  }
  return [x, y, z]
}
export const NAVY = C(0x1f2147), NAVY_DK = C(0x121329), NAVY_SEAM = C(0x0d0e1f), CUFF_W = C(0xe9e3d2), CUFF_SH = C(0xc9c1ad)
export function coatShade(X: number, Y: number, Z: number, o: Shade) {
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  // 翻袖口（白）
  const A = ARM[sx], t = foreT(sx, X, Y, Z)
  const px = X - A.e[0] - A.df[0] * t * A.Lf, py = Y - A.e[1] - A.df[1] * t * A.Lf, pz = Z - A.e[2] - A.df[2] * t * A.Lf
  const rho = len3(px, py, pz)
  if (t > CUFF_T + 0.004 && t < 1.06 && rho > sleeveR(t) + 0.0012 && rho < sleeveR(t) + 0.0105) {
    let c = mulc(CUFF_W, 0.96 + 0.04 * fbm(X * 40, Y * 40, Z * 40, 2))
    c = mixc(c, CUFF_SH, 0.5 * gauss((t - CUFF_T - 0.012) * A.Lf, 0.004)) // 上沿折线
    setS(o, c, 0.85, 0, 0, 0, 1, 0); return
  }
  if (t > 0.97 && t < 1.06 && rho < sleeveR(t) + 0.0012) { setS(o, mulc(NAVY_DK, 0.4), 0.9, 0, 0, 0, 0, 1); return } // 袖口里
  let c = mulc(NAVY, 0.93 + 0.12 * fbm(X * 9, Y * 9, Z * 9, 2))
  // 水彩笔触般的明暗块
  c = mulc(c, 0.94 + 0.08 * vnoise(X * 26 + 3, Y * 18, Z * 26))
  // 下摆底面（从下往上看）
  if (Y < hemY(X, Z) + 0.006) c = mixc(c, NAVY_SEAM, 0.75)
  const seam = (k: number) => { c = mixc(c, NAVY_SEAM, k) }
  // 肩线（领口 → 肩头）
  { const ys = mix(1.492, 1.468, clamp((ax - 0.06) / 0.11, 0, 1)); if (ax > 0.05 && ax < 0.2) seam(0.7 * gauss(Y - ys, 0.0028) * sstep(-0.05, 0.0, Z + 0.035) * sstep(0.03, -0.0, Z - 0.03)) }
  // 袖窿缝
  { const r = len3(X - sx * 0.168, (Y - 1.42) * 0.85, Z + 0.02); seam(0.55 * gauss(r - 0.06, 0.0025) * sstep(1.33, 1.37, Y)) }
  seam(0.6 * gauss(Y - 1.06, 0.002)) // 腰缝
  if (Z > 0) {
    seam(0.85 * gauss(X - EDGE_X, 0.0022) * sstep(1.5, 1.44, Y)) // 门襟叠边
    for (const sd of [1, -1]) { const cx = sd * 0.115; if (Math.abs(X - cx) < 0.056 && Math.abs(Y - 0.99) < 0.03) seam(0.75 * (gauss(Y - 0.971, 0.0022) * sstep(0.052, 0.046, Math.abs(X - cx)) + gauss(Math.abs(X - cx) - 0.048, 0.0018) * sstep(0.026, 0.02, Math.abs(Y - 0.993)))) }
  } else {
    seam(0.6 * gauss(X, 0.0022) * sstep(0.9, 0.96, Y)) // 后中缝
    seam(0.5 * gauss(Math.abs(X) - 0.07, 0.0022) * sstep(1.08, 1.12, Y) * sstep(1.42, 1.36, Y)) // 后背公主线
  }
  // 袖缝（袖内侧一条）
  setS(o, c, 0.78, 0, 0, 0, 0, 1)
}
export function coatWeights(X: number, Y: number, Z: number, acc: W4) {
  const p: V3 = [X, Y, Z], s = X >= 0 ? 1 : -1, S = s > 0 ? 'L' : 'R', A = ARM[s]
  const dArm = Math.min(sdCapsule(X, Y, Z, A.a[0], A.a[1], A.a[2], A.e[0], A.e[1], A.e[2], 0.055), sdCapsule(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], 0.05))
  const dTor = Math.min(torsoCore(X, Y, Z), skirt(X, Y, Z))
  const along = dot(sub(p, A.a), A.du)
  let armK = sstep(-0.02, 0.025, dTor - dArm) * sstep(-0.06, 0.02, along)
  // 下摆表面（离下摆 < 1 cm）不归手臂
  armK = clamp(armK * sstep(0.006, 0.016, skirt(X, Y, Z)), 0, 1)
  const clavK = gauss(lenv(sub(p, A.a)), 0.06) * (1 - armK) * 0.8 + armK * gauss(along, 0.05) * 0.4
  acc.add(B['clav' + S], clavK)
  if (armK > 0) {
    const fE = sstep(-0.03, 0.03, dot(sub(p, A.e), nrm(add(A.du, A.df))))
    const k = armK * (1 - clavK * 0.5)
    acc.add(B['upperArm' + S], k * (1 - fE)); acc.add(B['foreArm' + S], k * fE)
  }
  trunkW(X, Y, acc, (1 - armK) * (1 - clavK))
}
/** 躯干链 + 下摆随大腿 */
export function trunkW(X: number, Y: number, acc: W4, k: number) {
  if (k <= 0) return
  const a = sstep(1.06, 1.18, Y), b = sstep(1.24, 1.38, Y)
  // 下摆：腰线以下渐归下摆骨（阶段 2 动画按大腿屈伸的一部分 + 滞后摆动驱动），前中 / 后中开衩处两侧分开
  const leg = sstep(0.99, 0.82, Y) * 0.9 * sstep(0.004, 0.05, Math.abs(X))
  const S = X >= 0 ? 'L' : 'R'
  acc.add(B['hem' + S], k * leg)
  const kk = k * (1 - leg)
  acc.add(B.hips, kk * (1 - a)); acc.add(B.spine, kk * a * (1 - b)); acc.add(B.chest, kk * a * b)
}

// ======================================================================
// 西裤（人腿）
// ======================================================================
interface LegSeg { hip: V3; knee: V3; ankle: V3; toe: V3; dT: V3; dS: V3; Lt: number; Ls: number }
const LEG: Record<number, LegSeg> = {}
for (const s of [1, -1]) {
  const hip = side(J.hip, s), knee = side(J.knee, s), ankle = side(J.ankle, s), toe = side(J.toe, s)
  LEG[s] = { hip, knee, ankle, toe, dT: nrm(sub(knee, hip)), dS: nrm(sub(ankle, knee)), Lt: lenv(sub(knee, hip)), Ls: lenv(sub(ankle, knee)) }
}
/** 裤脚口高度（前高后低，压在鞋面上） */
const cuffY = (z: number, ankZ: number) => 0.062 + 0.03 * sstep(0.06, -0.04, z - ankZ)
function pantsLeg(s: number, X: number, Y: number, Z: number) {
  const L = LEG[s]
  let d = sdRoundCone(X, Y, Z, L.hip[0] - s * 0.004, L.hip[1] + 0.03, L.hip[2] - 0.004, L.knee[0], L.knee[1], L.knee[2], 0.079, 0.054)
  d = smin(d, sdEll(X, Y, Z, L.hip[0] + s * 0.006, L.hip[1] - 0.14, L.hip[2] - 0.012, 0.068, 0.15, 0.072), 0.04)
  d = smin(d, sdEll(X, Y, Z, L.knee[0], L.knee[1] + 0.01, L.knee[2] + 0.002, 0.05, 0.06, 0.05), 0.04)
  // 小腿裤管：直筒略收，裤脚盖住鞋面
  const bot: V3 = [L.ankle[0], 0.06, L.ankle[2] + 0.012]
  d = smin(d, sdRoundCone(X, Y, Z, L.knee[0], L.knee[1], L.knee[2], bot[0], bot[1], bot[2], 0.052, 0.049), 0.03)
  // 前裤线（细棱）
  const fr = Z - mix(L.knee[2], bot[2], clamp((L.knee[1] - Y) / (L.knee[1] - bot[1]), 0, 1))
  const tx = X - mix(L.hip[0], bot[0], clamp((L.hip[1] - Y) / (L.hip[1] - bot[1]), 0, 1))
  d -= 0.0022 * gauss(tx, 0.006) * sstep(0.0, 0.03, fr) * sstep(0.1, 0.18, Y)
  // 裤脚压在鞋面上的一道折（break）
  d -= 0.004 * gauss(Y - 0.115, 0.018) * sstep(-0.01, 0.03, Z - L.ankle[2]) * (0.7 + 0.3 * Math.sin(tx * 120))
  // 膝后挤压褶
  d -= 0.0016 * gauss(Y - L.knee[1] + 0.02, 0.03) * sstep(0.01, -0.03, Z - L.knee[2]) * Math.sin(Y * 220)
  // 裤口：按前高后低截平 + 掏空
  d = smax(d, cuffY(Z, L.ankle[2]) - Y, 0.004)
  d = smax(d, -sdRoundCone(X, Y, Z, bot[0], bot[1] - 0.04, bot[2], bot[0], bot[1] + 0.06, bot[2], 0.04, 0.038), 0.004)
  return d
}
export function pantsSdf(X: number, Y: number, Z: number) {
  if (Y > 1.05) return Y - 1.05 + 0.02
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  let d = sdEll(X, Y, Z, 0, 0.98, -0.006, 0.15, 0.1, 0.105) // 骨盆
  for (const s of [1, -1]) if (s === sx || ax < 0.05) d = smin(d, pantsLeg(s, X, Y, Z), 0.045)
  d += 0.0006 * fbm(X * 25, Y * 25, Z * 25, 2)
  return d
}
export const PANTS_BOX = { min: [-0.26, 0.04, -0.16] as [number, number, number], max: [0.26, 0.9, 0.16] as [number, number, number] }
const PANTS = C(0x1c1d24), PANTS_IN = C(0x08080a)
export function pantsShade(X: number, Y: number, Z: number, o: Shade) {
  let c = mulc(PANTS, 0.95 + 0.1 * fbm(X * 14, Y * 14, Z * 14, 2))
  const L = LEG[X >= 0 ? 1 : -1]
  if (Y < cuffY(Z, L.ankle[2]) + 0.004) c = mixc(c, PANTS_IN, 0.85)
  setS(o, c, 0.8, 0, 0, 0, 0, 1)
}
export function legWeights(X: number, Y: number, Z: number, acc: W4) {
  const s = X >= 0 ? 1 : -1, S = s > 0 ? 'L' : 'R', L = LEG[s]
  const p: V3 = [X, Y, Z]
  const below = sstep(-0.06, 0.05, dot(sub(p, L.hip), L.dT) - 0.03)
  const mid = sstep(0.01, 0.05, Math.abs(X))
  const legK = clamp(below * mix(0.4, 1, mid), 0, 1) * (Y > 1.0 ? 0 : 1)
  acc.add(B.hips, 1 - legK)
  if (legK <= 0) return
  chainWeights(acc, p, [L.hip, L.knee, L.ankle, L.toe, add(L.toe, [0, 0, 0.08])], [B['thigh' + S], B['shin' + S], B['foot' + S], B['toe' + S]], [0.055, 0.03, 0.02], legK)
}

// ======================================================================
// 黑皮鞋
// ======================================================================
/** 鞋的平面轮廓半宽（沿脚长 z）与鞋面高度 */
const shoeW = (z: number) => z < 0.1 ? mix(0.034, 0.045, sstep(-0.07, 0.1, z)) : mix(0.045, 0.014, sstep(0.1, 0.205, z) ** 0.8)
const shoeH = (z: number) => z < 0.0 ? mix(0.082, 0.098, sstep(-0.07, -0.01, z)) : mix(0.098, 0.034, sstep(-0.005, 0.17, z)) - 0.008 * sstep(0.17, 0.205, z)
export function shoeSdf(s: number) {
  const L = LEG[s], cx = L.ankle[0] + s * 0.004, az = L.ankle[2]
  return (X: number, Y: number, Z: number) => {
    const x = X - cx, z = Z - az
    if (Y > 0.16 || Math.abs(x) > 0.08 || z < -0.11 || z > 0.24) return Math.max(Y - 0.16, Math.abs(x) - 0.08, -0.11 - z, z - 0.24) + 0.03
    const zc = clamp(z, -0.068, 0.2), w = shoeW(zc), hh = shoeH(zc)
    // 鞋面：半椭圆截面（底在鞋底上沿），沿脚长放样；两端圆头
    let d = sdEllipse(x * (1 + 0.15 * s * sstep(0.12, 0.2, zc) * Math.sign(x || 1)), Y - 0.014, w, hh - 0.014)
    d = len2(Math.max(d, 0), z - zc) + Math.min(d, 0)
    // 鞋口（脚踝处挖开，裤脚盖住）
    d = smax(d, -sdEll(x, Y, z, 0, 0.12, -0.03, 0.03, 0.04, 0.042), 0.008)
    // 鞋底（比鞋面宽 2.5 mm 的沿条，厚 1.4 cm）+ 鞋跟
    const zs = clamp(z, -0.071, 0.203), ws = shoeW(zs) + 0.0025
    const rr = 0.0035, qx = Math.abs(x) - ws + rr, qy = Math.abs(Y - 0.007) - 0.007 + rr
    let sole = len2(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr
    sole = len2(Math.max(sole, 0), z - zs) + Math.min(sole, 0)
    const heel = Math.max(Math.abs(x) - shoeW(-0.05) - 0.002, Math.abs(Y - 0.013) - 0.013, Math.max(-0.07 - z, z + 0.005))
    sole = Math.min(sole, heel)
    d = smin(d, sole, 0.003)
    d = smax(d, -Y, 0.002)
    // 鞋头接缝 / 鞋带区刻线
    d += 0.0008 * gauss(z - 0.13 - 0.25 * x * x / 0.002, 0.0016) * sstep(0.025, 0.035, Y)
    if (Math.abs(x) < 0.026 && z > -0.0 && z < 0.08 && Y > 0.06) d += 0.0007 * gauss(Math.abs(x) - 0.021, 0.0012)
    return d
  }
}
export const shoeBox = (s: number) => { const L = LEG[s]; return { min: [L.ankle[0] - 0.07, -0.006, L.ankle[2] - 0.1] as [number, number, number], max: [L.ankle[0] + 0.07, 0.14, L.ankle[2] + 0.23] as [number, number, number] } }
const SHOE = C(0x121112), SOLE = C(0x1e1915), LACE = C(0x0a0a0a)
export function shoeShade(s: number, X: number, Y: number, Z: number, o: Shade) {
  const L = LEG[s], x = X - L.ankle[0] - s * 0.004, z = Z - L.ankle[2]
  let c = mulc(SHOE, 0.9 + 0.2 * fbm(X * 40, Y * 40, Z * 40, 2)), rough = 0.28
  if (Y < 0.0145) { c = SOLE; rough = 0.7 }
  if (Math.abs(x) < 0.022 && z > 0.0 && z < 0.08 && Y > 0.06) { const k = Math.abs(Math.sin(z * 260)); c = mixc(c, LACE, 0.7 * k) }
  c = mixc(c, mulc(SHOE, 0.45), 0.6 * gauss(z - 0.13 - 0.25 * x * x / 0.002, 0.002) * sstep(0.025, 0.035, Y))
  setS(o, c, rough, 0, 0, 0, 0, 0)
}
export function shoeWeights(s: number, X: number, Y: number, Z: number, acc: W4) {
  const S = s > 0 ? 'L' : 'R', L = LEG[s]
  const f = sstep(-0.02, 0.02, Z - L.toe[2])
  acc.add(B['foot' + S], 1 - f); acc.add(B['toe' + S], f)
  void X; void Y
}

// ======================================================================
// 手（苍白细长）
// ======================================================================
const toHand = (F: HandFrame, X: number, Y: number, Z: number): V3 => { const px = X - F.o[0], py = Y - F.o[1], pz = Z - F.o[2]; return [px * F.a[0] + py * F.a[1] + pz * F.a[2], px * F.r[0] + py * F.r[1] + pz * F.r[2], px * F.d[0] + py * F.d[1] + pz * F.d[2]] }
const fingerSeg = (f: Finger, k: number, X: number, Y: number, Z: number) => sdRoundCone(X, Y, Z, f.joints[k][0], f.joints[k][1], f.joints[k][2], f.joints[k + 1][0], f.joints[k + 1][1], f.joints[k + 1][2], f.radii[k], f.radii[k + 1])
export function handSdf(s: number) {
  const { F, fingers } = HANDS[s], A = ARM[s]
  const w0 = sub(A.w, scl(A.df, 0.06))
  return (X: number, Y: number, Z: number) => {
    const [ta, tr, td] = toHand(F, X, Y, Z)
    // 手腕（藏进袖口的一截）
    let wrist = sdRoundCone(X, Y, Z, w0[0], w0[1], w0[2], A.w[0], A.w[1], A.w[2], 0.023, 0.0225)
    wrist = smin(wrist, sdEll(ta, tr, td, 0.004, 0, 0, 0.022, 0.027, 0.016), 0.012)
    { const bd = len3(ta - 0.1, tr, td) - 0.15; if (bd > 0.02) return Math.min(bd, wrist) }
    let d = sdRoundBox(ta - 0.06, tr + 0.001, td + 0.0005, 0.045, 0.036, 0.0105, 0.01)
    d = smin(d, sdEll(ta, tr, td, 0.014, 0.0, 0.0, 0.03, 0.027, 0.017), 0.02)
    d = smin(d, sdEll(ta, tr, td, 0.064, 0.0, 0.004, 0.05, 0.038, 0.0102), 0.01)
    d = smin(d, sdEll(ta, tr, td, 0.036, 0.02, -0.008, 0.033, 0.017, 0.014), 0.012) // 鱼际
    d = smin(d, sdEll(ta, tr, td, 0.054, -0.027, -0.005, 0.042, 0.012, 0.012), 0.012) // 小鱼际
    d = smax(d, -sdEll(ta, tr, td, 0.066, 0.002, -0.025, 0.03, 0.02, 0.012), 0.008) // 掌心凹
    if (td > 0) for (const f of fingers) if (f.name !== 'thumb') {
      const b = toHand(F, f.joints[0][0], f.joints[0][1], f.joints[0][2])
      d = smin(d, sdCapsule(ta, tr, td, 0.022, b[1] * 0.3, 0.0105, b[0] - 0.006, b[1], 0.0098, 0.0019), 0.005)
    }
    let df = 1
    for (const f of fingers) {
      let g = 1
      for (let k = 0; k < 3; k++) g = Math.min(g, fingerSeg(f, k, X, Y, Z))
      for (let k = 1; k < 3; k++) { const j = f.joints[k], r = f.radii[k]; g = smin(g, len3(X - j[0] - F.d[0] * r * 0.25, Y - j[1] - F.d[1] * r * 0.25, Z - j[2] - F.d[2] * r * 0.25) - r * 0.97, 0.003) }
      const tip = f.joints[3], dj = f.joints[2]
      const ex = tip[0] - dj[0], ey = tip[1] - dj[1], ez = tip[2] - dj[2], L2 = ex * ex + ey * ey + ez * ez
      const tn = ((X - dj[0]) * ex + (Y - dj[1]) * ey + (Z - dj[2]) * ez) / L2
      if (tn > 0.2 && tn < 1.4) {
        const tc = Math.min(tn, 1)
        const back = (X - dj[0] - ex * tc) * F.d[0] + (Y - dj[1] - ey * tc) * F.d[1] + (Z - dj[2] - ez * tc) * F.d[2]
        g = smax(g, back - f.radii[3] * 0.8, 0.002)
      }
      df = Math.min(df, g)
    }
    for (const f of fingers) if (f.name !== 'thumb') { const j = f.joints[0]; d = smin(d, len3(X - j[0] - F.d[0] * 0.004, Y - j[1] - F.d[1] * 0.004, Z - j[2] - F.d[2] * 0.004) - f.radii[0] * 1.06, 0.008) }
    d = smin(d, df, 0.008)
    d = smin(d, wrist, 0.012)
    d += 0.0002 * vnoise(X * 700, Y * 700, Z * 700)
    return d
  }
}
export const handBox = (s: number) => {
  const { fingers, F } = HANDS[s], A = ARM[s]
  let mn: V3 = [...F.o], mx: V3 = [...F.o]
  const w0 = sub(A.w, scl(A.df, 0.07))
  for (const p of [w0, ...fingers.flatMap((f) => f.joints)]) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]) }
  mn = mn.map((v) => v - 0.035) as V3; mx = mx.map((v) => v + 0.035) as V3
  return { min: mn as [number, number, number], max: mx as [number, number, number] }
}
/** 手部件只保留袖口以外（藏在袖口空腔里的一截不要） */
export const handKeep = (s: number) => (X: number, Y: number, Z: number) => foreT(s, X, Y, Z) > 0.86
export const SKIN = C(0xe7dccb), SKIN_SH = C(0xcdbca6), SKIN_PALM = C(0xeed9cb), NAIL = C(0xe9cfc6), KNUCK = C(0xb9a28e)
export function handShade(s: number, X: number, Y: number, Z: number, o: Shade) {
  const { F, fingers } = HANDS[s]
  const [ta, , td] = toHand(F, X, Y, Z)
  let c = mulc(SKIN, 0.95 + 0.08 * fbm(X * 40, Y * 40, Z * 40, 2))
  c = mixc(c, SKIN_SH, sstep(0.02, -0.01, ta) * 0.5) // 手腕（袖口阴影）
  const palmK = sstep(0.0, -0.011, td)
  c = mixc(c, SKIN_PALM, palmK * 0.7)
  let rough = 0.58
  for (const f of fingers) {
    const dj = f.joints[2], tip = f.joints[3]
    const L = lenv(sub(tip, dj)), dir = nrm(sub(tip, dj))
    const tn = dot(sub([X, Y, Z], dj), dir) / L
    const q = sub([X, Y, Z], add(dj, scl(dir, clamp(tn, 0, 1) * L)))
    const back = dot(q, F.d), rad = lenv(q)
    if (rad < f.radii[2] * 1.4 && tn > 0.28 && tn < 1.05 && back > f.radii[3] * 0.45) {
      const k = sstep(f.radii[3] * 0.45, f.radii[3] * 0.7, back) * sstep(0.28, 0.38, tn)
      c = mixc(c, NAIL, k); rough = mix(rough, 0.3, k)
    }
    for (let j = 0; j < 3; j++) { const jp = f.joints[j]; const dd = lenv(sub([X, Y, Z], jp)); if (dd < f.radii[j] * 1.6) c = mixc(c, KNUCK, 0.35 * gauss(dd - f.radii[j], 0.0035) * sstep(-0.002, 0.004, dot(sub([X, Y, Z], jp), F.d))) }
  }
  setS(o, c, rough, 0, 0, 1, 0, 0)
}
export function handWeights(s: number, X: number, Y: number, Z: number, acc: W4) {
  const S = s > 0 ? 'L' : 'R', p: V3 = [X, Y, Z]
  const { F, fingers } = HANDS[s], A = ARM[s]
  const fWrist = sstep(-0.018, 0.02, dot(sub(p, A.w), nrm(add(A.df, F.a))))
  acc.add(B['foreArm' + S], 1 - fWrist)
  if (fWrist <= 0) return
  let best = 1, bf: Finger | null = null
  for (const f of fingers) { let g = 1; for (let k = 0; k < 3; k++) g = Math.min(g, fingerSeg(f, k, X, Y, Z)); if (g < best) { best = g; bf = f } }
  if (!bf) { acc.add(B['hand' + S], fWrist); return }
  const thumb = bf.name === 'thumb'
  const j0 = bf.joints[0], j1 = bf.joints[1], dir0 = nrm(sub(j1, j0))
  const fBase = thumb ? sstep(-0.012, 0.018, dot(sub(p, j0), dir0)) * sstep(0.012, 0.0, best) : sstep(-0.008, 0.008, dot(sub(p, j0), dir0)) * sstep(0.006, 0.0, best)
  acc.add(B['hand' + S], fWrist * (1 - fBase))
  if (fBase > 0) chainWeights(acc, p, bf.joints, [B[bf.name + '1' + S], B[bf.name + '2' + S], B[bf.name + '3' + S]], [0.006, 0.005], fWrist * fBase)
}

/** 翻袖口外侧的金扣位置（模型空间）+ 法线 */
export function cuffButton(s: number): { p: V3; n: V3 } {
  const A = ARM[s]
  const t = 0.885, c = add(A.e, scl(A.df, A.Lf * t))
  const out = nrm(sub([s, 0, 0.25], scl(A.df, dot([s, 0, 0.25], A.df))))
  const p = onSurface(coatSdf, add(c, scl(out, 0.06)), 0)
  return { p, n: out }
}
export { ARM, LEG, cross }
