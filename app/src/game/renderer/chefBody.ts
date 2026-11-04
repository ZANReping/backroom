// [chef] 厨师（Entity 800）身体 SDF 部件（厨师空间，静止姿态；+Z 正面、地面 y=0）。
//   coat   白色双排扣厨师服：极胖躯干（厚胸、下垂胸、啤酒肚、腰侧赘肉、厚背）+ 从肚子最凸处垂下的下摆（把肚子「撑成帐篷」）；
//          前片叠门（叠边在角色右侧 x≈−0.10）、两列布包扣（5 排）、肚子上扣子之间横向拉扯褶 + 最下两档叠边被撑开露出深灰内衫；
//          肩线 / 侧缝 / 后中缝；长袖 + 翻折袖口（袖口端掏空，手从里面伸出）；领口挖洞（立领是 chefMesh 里的薄壳）
//   apron  米白粗帆布半身围裙（系在肚子下沿、垂到膝下）+ 腰带
//   pants  深色细格纹厨裤（宽松直筒，格纹在着色器里按静止坐标生成）
//   shoe   黑色防滑厨鞋（圆头高鞋面 + 厚橡胶底 + 底纹）——鞋壳 = 脚的包络向外扩，权重与脚完全同骨（foot / toe），不会穿模
//   hand   肥厚人手（掌宽厚、手指短粗、指根肉垫、指节横纹、深色指甲、手背稀疏汗毛）
// 每个部件给出：sdf、颜色（Shade，fx = 材质号、fy = 沾血倾向、fur = 毛长）、蒙皮权重（W4）。
import { clamp, fbm, gauss, len2, len3, mix, sdCapsule, sdEll, sdRoundBox, sdRoundCone, smax, smin, sstep, vnoise } from './conciergeSdf'
import { B, HANDS, J, W4, add, chainWeights, cross, dot, lenv, nrm, scl, side, sub, type Finger, type HandFrame, type V3 } from './chefRig'
import type { Shade } from './conciergeHead'

const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
const mixc = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mulc = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]
function sdEllipse(x: number, y: number, a: number, b: number) { const k0 = len2(x / a, y / b), k1 = len2(x / (a * a), y / (b * b)); return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1 }
/** 材质号（顶点 aMat.x）：着色器按它选布纹 / 格纹 / 猪皮 / 湿鼻盘 / 人皮 / 橡胶 / 扣子 */
export const MAT = { plain: 0, cloth: 1, plaid: 2, pig: 3, wet: 4, hand: 5, rubber: 6, button: 7, apron: 8 } as const
/** 写一个 Shade：c 颜色、rough、mat 材质号、blood 沾血倾向（0..1）、fur 毛长（0..） */
export const setC = (o: Shade, c: number[], rough: number, mat: number, blood: number, fur = 0, metal = 0) => { o.r = c[0]; o.g = c[1]; o.b = c[2]; o.rough = rough; o.metal = metal; o.fur = fur; o.skin = 0; o.cloth = 0; o.wool = 0; o.fx = mat; o.fy = blood; o.fz = 0 }

// ======================================================================
// 手臂 / 腿段
// ======================================================================
interface ArmSeg { a: V3; e: V3; w: V3; du: V3; df: V3; Lu: number; Lf: number; end: V3 }
export const ARM: Record<number, ArmSeg> = {}
for (const s of [1, -1]) {
  const a = side(J.shoulder, s), e = side(J.elbow, s), w = side(J.wrist, s)
  const du = nrm(sub(e, a)), df = nrm(sub(w, e))
  ARM[s] = { a, e, w, du, df, Lu: lenv(sub(e, a)), Lf: lenv(sub(w, e)), end: add(w, scl(df, 0.004)) }
}
export const foreT = (s: number, X: number, Y: number, Z: number) => { const A = ARM[s]; return ((X - A.e[0]) * A.df[0] + (Y - A.e[1]) * A.df[1] + (Z - A.e[2]) * A.df[2]) / A.Lf }
interface LegSeg { hip: V3; knee: V3; ankle: V3; toe: V3; dT: V3; dS: V3; Lt: number; Ls: number }
export const LEG: Record<number, LegSeg> = {}
for (const s of [1, -1]) {
  const hip = side(J.hip, s), knee = side(J.knee, s), ankle = side(J.ankle, s), toe = side(J.toe, s)
  LEG[s] = { hip, knee, ankle, toe, dT: nrm(sub(knee, hip)), dS: nrm(sub(ankle, knee)), Lt: lenv(sub(knee, hip)), Ls: lenv(sub(ankle, knee)) }
}

// ======================================================================
// 厨师服
// ======================================================================
/** 领口（颈洞）：立领薄壳盖住边缘 */
export const NECK_HOLE = { c: [0, 1.46, -0.035] as V3, r: 0.11 }
/** 下摆高度（前略低：被肚子顶出去后垂下来） */
export const JHEM = (z: number) => 0.835 + 0.012 * sstep(0.0, 0.2, z)
/** 叠门边（角色右侧那一列扣子外侧）x：从领口斜下来，胸以下竖直 */
export const edgeX = (y: number) => mix(-0.102, -0.05, sstep(1.36, 1.47, y))
/** 两列扣：x 半距 + 5 排高度 */
export const BTN_X = 0.074
export const BTN_Y = [1.372, 1.262, 1.152, 1.042, 0.932]
/** 被撑开的两档（扣位之间的叠边裂口）：中心 y、半高 */
export const GAPS = [{ y: (BTN_Y[2] + BTN_Y[3]) / 2, h: 0.036 }, { y: (BTN_Y[3] + BTN_Y[4]) / 2, h: 0.042 }]
/** 胖躯干芯（无布纹）：给权重 / AO / 围裙放样 */
export function torsoCore(X: number, Y: number, Z: number) {
  const ax = Math.abs(X)
  let d = sdEll(X, Y, Z, 0, 1.29, -0.025, 0.232, 0.2, 0.168) // 胸廓
  d = smin(d, sdEll(ax, Y, Z, 0.095, 1.255, 0.085, 0.11, 0.095, 0.085), 0.05) // 下垂的胸
  d = smin(d, sdEll(X, Y, Z, 0, 1.07, 0.035, 0.27, 0.235, 0.235), 0.08) // 腹
  d = smin(d, sdEll(X, Y, Z, 0, 1.0, 0.13, 0.225, 0.2, 0.215), 0.07) // 啤酒肚前凸（最凸处 z ≈ 0.35）
  d = smin(d, sdEll(X, Y, Z, 0, 0.915, 0.01, 0.238, 0.13, 0.18), 0.06) // 胯
  d = smin(d, sdEll(ax, Y, Z, 0.17, 1.04, -0.03, 0.1, 0.13, 0.145), 0.06) // 腰侧赘肉
  d = smin(d, sdEll(X, Y, Z, 0, 1.32, -0.095, 0.205, 0.17, 0.11), 0.05) // 厚背
  d = smin(d, sdRoundCone(ax, Y, Z, 0.04, 1.442, -0.04, 0.228, 1.422, -0.045, 0.092, 0.078), 0.06) // 溜肩
  d = smin(d, sdEll(X, Y, Z, 0, 1.4, -0.035, 0.152, 0.062, 0.128), 0.05) // 颈根（立领座，顶 ≈ 1.46）
  return d
}
/** 下摆：从肚子最凸处垂下（椭圆截面放样），腰以下包住胯 */
function jskirt(X: number, Y: number, Z: number) {
  const k = sstep(1.0, 0.84, Y)
  const a = mix(0.272, 0.262, k), bF = mix(0.33, 0.315, k), bB = mix(0.19, 0.196, k)
  const zc = 0.015, b = Z - zc > 0 ? bF : bB
  return smax(sdEllipse(X, Z - zc, a, b), Y - 1.0, 0.05)
}
/** 袖 */
const sleeveR = (t: number) => mix(0.07, 0.06, clamp(t, 0, 1))
export const CUFF_T0 = 0.83
function sleeve(s: number, X: number, Y: number, Z: number) {
  const A = ARM[s]
  let d = sdRoundCone(X, Y, Z, A.a[0] - s * 0.012, A.a[1] - 0.012, A.a[2], A.e[0], A.e[1], A.e[2], 0.083, 0.07)
  d = smin(d, sdEll(X, Y, Z, A.a[0] - s * 0.02, A.a[1] - 0.018, A.a[2], 0.074, 0.056, 0.078), 0.035) // 袖山（肉肩）
  d = smin(d, sdRoundCone(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], 0.07, 0.06), 0.022)
  const t = foreT(s, X, Y, Z)
  if (t > -0.3 && t < 0.3) d -= 0.0022 * gauss(t, 0.13) * Math.sin(t * 60 + 0.6 * Math.sin(X * 80)) // 肘弯横褶
  // 上臂内侧挤压褶（胖手臂贴着身体）
  { const tu = dot(sub([X, Y, Z], A.a), A.du) / A.Lu; if (tu > 0.3 && tu < 1.0) d -= 0.0014 * Math.sin(tu * 34) * sstep(0.0, -0.03, (X - A.e[0]) * s) }
  // 翻折袖口：比袖子粗一圈的筒（上沿圆润、下沿是袖口）
  if (t > CUFF_T0 - 0.08) {
    const p0 = add(A.e, scl(A.df, A.Lf * CUFF_T0))
    const cuff = sdRoundCone(X, Y, Z, p0[0], p0[1], p0[2], A.end[0], A.end[1], A.end[2], sleeveR(CUFF_T0) + 0.0062, sleeveR(1) + 0.0058)
    d = Math.min(d, smax(cuff, (CUFF_T0 + 0.01 - t) * A.Lf, 0.005))
  }
  // 袖口端：截平 + 掏空（手腕从里面出来）
  d = smax(d, (t - 1) * A.Lf - 0.004, 0.004)
  const cav = sdRoundCone(X, Y, Z, A.end[0] - A.df[0] * 0.06, A.end[1] - A.df[1] * 0.06, A.end[2] - A.df[2] * 0.06, A.end[0] + A.df[0] * 0.03, A.end[1] + A.df[1] * 0.03, A.end[2] + A.df[2] * 0.03, 0.04, 0.043)
  d = smax(d, -cav, 0.004)
  return d
}
/** 厨师服外形（未挖领口 / 裂口、不含袖）：给权重 / AO */
export function coatCore(X: number, Y: number, Z: number) { return smin(torsoCore(X, Y, Z) + 0.006, jskirt(X, Y, Z), 0.06) }
/** 叠边裂口处的躯干表面 z（初始化时二分求出） */
const GAP_Z = GAPS.map((g) => { let lo = 0.0, hi = 0.55; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (coatCore(edgeX(g.y) + 0.004, g.y, m) < 0) lo = m; else hi = m } return lo })
/** 裂口（叠边被撑开的梭形口）：<0 在口里 */
export function gapCut(X: number, Y: number, Z: number) {
  let d = 1
  for (let i = 0; i < GAPS.length; i++) { const g = GAPS[i]; d = Math.min(d, sdEll(X, Y, Z, edgeX(g.y) + 0.006, g.y, GAP_Z[i], 0.0095 * (i ? 1.15 : 0.9), g.h, 0.012)) }
  return d
}
export function coatSdf(X: number, Y: number, Z: number) {
  if (Y < 0.8 || Y > 1.6) return Math.max(0.8 - Y, Y - 1.6) + 0.05
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  let d = coatCore(X, Y, Z)
  d = smax(d, JHEM(Z) - Y, 0.005)
  // 下摆竖向松量 + 腋下斜褶 + 背部横向赘肉褶
  const phi = Math.atan2(X, Z)
  d -= 0.0022 * sstep(0.98, 0.86, Y) * Math.sin(phi * 7 + 0.6) * (0.6 + 0.4 * vnoise(X * 14, Y * 6, Z * 14))
  { const r = len2(X - sx * 0.16, Y - 1.38), ang = Math.atan2(Y - 1.38, (X - sx * 0.16) * sx); d -= 0.0018 * gauss(r - 0.06, 0.045) * sstep(0.0, 0.03, r) * Math.sin(ang * 8 + r * 30) }
  if (Z < -0.02) d -= 0.002 * Math.sin(Y * 52) * sstep(1.22, 1.12, Y) * sstep(0.98, 1.04, Y) * sstep(0.04, 0.12, ax)
  d += 0.0006 * fbm(X * 30, Y * 30, Z * 30, 2)
  if (Z > 0.02) {
    // 叠门：叠边以外（角色右侧）那片低一点 → 台阶
    const ex = edgeX(Y)
    d += 0.0021 * sstep(ex + 0.002, ex - 0.002, X) * sstep(1.48, 1.45, Y)
    // 肚子上的横向拉扯褶：从每粒扣往两侧放射（扣子被肚子撑开）
    for (const yb of BTN_Y) {
      if (yb > 1.2) continue
      for (const xb of [BTN_X, -BTN_X]) {
        const r = len2(X - xb, Y - yb)
        if (r > 0.13) continue
        const ang = Math.atan2(Y - yb, (X - xb) * Math.sign(xb))
        d -= 0.0024 * gauss(r - 0.055, 0.04) * sstep(0.012, 0.03, r) * Math.max(0, Math.cos(ang * 7)) * gauss(ang, 0.9)
      }
    }
  } else {
    d += 0.0022 * gauss(X, 0.0024) * sstep(1.42, 1.34, Y) // 后中缝
  }
  // 袖（肩部平滑融合；腰以下硬并）
  const kS = mix(0.003, 0.03, sstep(1.1, 1.3, Y))
  for (const s of [1, -1]) if (sx === s || ax < 0.05) d = smin(d, sleeve(s, X, Y, Z), kS)
  // 被撑开的叠边裂口
  if (Z > 0.1 && Y < 1.12 && Y > 0.86) d = smax(d, -gapCut(X, Y, Z), 0.0025)
  // 领口
  d = smax(d, -(Math.max(len2(X - NECK_HOLE.c[0], Z - NECK_HOLE.c[2]) - NECK_HOLE.r, 1.43 - Y)), 0.01)
  return d
}
export const COAT_BOX = { min: [-0.48, 0.8, -0.27] as [number, number, number], max: [0.48, 1.6, 0.4] as [number, number, number] }
/** 前臂袖细格区域：<0 归细格 */
export function foreSleeveRegion(s: number, X: number, Y: number, Z: number) {
  const A = ARM[s], t = foreT(s, X, Y, Z)
  const px = X - A.e[0] - A.df[0] * t * A.Lf, py = Y - A.e[1] - A.df[1] * t * A.Lf, pz = Z - A.e[2] - A.df[2] * t * A.Lf
  return Math.max((0.55 - t) * A.Lf, (t - 1.12) * A.Lf, len3(px, py, pz) - 0.095)
}
export const SLEEVE_BAND = 0.008
export function foreSleeveBox(s: number) {
  const A = ARM[s], p0 = add(A.e, scl(A.df, A.Lf * 0.5)), p1 = add(A.end, scl(A.df, 0.03)), r = 0.09
  return { min: [Math.min(p0[0], p1[0]) - r, Math.min(p0[1], p1[1]) - r, Math.min(p0[2], p1[2]) - r] as [number, number, number], max: [Math.max(p0[0], p1[0]) + r, Math.max(p0[1], p1[1]) + r, Math.max(p0[2], p1[2]) + r] as [number, number, number] }
}
// ---------- 颜色 ----------
const WHITE = C(0xe9e6df), SEAM = C(0xb7b1a6), UNDER = C(0x3a3836), CUFF_IN = C(0x8d877c)
export function coatShade(X: number, Y: number, Z: number, o: Shade) {
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  // 袖口里
  {
    const A = ARM[sx], t = foreT(sx, X, Y, Z)
    if (t > 0.95 && t < 1.08) {
      const px = X - A.e[0] - A.df[0] * t * A.Lf, py = Y - A.e[1] - A.df[1] * t * A.Lf, pz = Z - A.e[2] - A.df[2] * t * A.Lf
      if (len3(px, py, pz) < 0.047) { setC(o, mulc(CUFF_IN, 0.6), 0.9, MAT.cloth, 0.6); return }
    }
  }
  // 裂口里：深灰内衫（被撑开处露出来）
  if (Z > 0.1 && Y < 1.12 && Y > 0.86 && gapCut(X, Y, Z) < 0.0012) { setC(o, mulc(UNDER, 0.8 + 0.3 * sstep(-0.006, 0.001, gapCut(X, Y, Z))), 0.9, MAT.plain, 0.5); return }
  let c = mulc(WHITE, 0.97 + 0.05 * fbm(X * 9, Y * 9, Z * 9, 2))
  const seam = (k: number) => { c = mixc(c, SEAM, clamp(k, 0, 1)) }
  // 汗渍 / 油渍（腋下、领口、肚子下沿发黄）
  c = mixc(c, C(0xcbbd98), 0.35 * gauss(Y - 0.87, 0.05) * sstep(0.05, 0.15, Z) + 0.3 * gauss(len2(ax - 0.19, Y - 1.33), 0.06) + 0.25 * gauss(Y - 1.44, 0.03))
  if (Y < JHEM(Z) + 0.006) seam(0.6)
  { const ys = mix(1.468, 1.44, clamp((ax - 0.1) / 0.11, 0, 1)); if (ax > 0.1 && ax < 0.22) seam(0.55 * gauss(Y - ys, 0.003) * sstep(-0.08, -0.03, Z) * sstep(0.02, -0.02, Z + 0.04)) } // 肩线
  seam(0.5 * gauss(ax - 0.21, 0.003) * sstep(-0.02, 0.0, -Z) * sstep(1.3, 1.25, Y)) // 侧缝
  let mat: number = MAT.cloth, blood = 0.55
  if (Z > 0.02) {
    const ex = edgeX(Y)
    seam(0.9 * gauss(X - ex, 0.0018) * sstep(1.48, 1.45, Y)) // 叠边
    seam(0.5 * gauss(X - ex - 0.009, 0.0009) * sstep(1.48, 1.45, Y)) // 叠边明线
    // 叠边投下的暗
    c = mulc(c, 1 - 0.22 * sstep(ex + 0.0005, ex - 0.007, X) * sstep(ex - 0.025, ex - 0.007, X))
    blood = 0.95 + 0.05 * sstep(1.2, 1.0, Y)
  } else {
    seam(0.55 * gauss(X, 0.0022) * sstep(1.42, 1.34, Y))
    blood = 0.25
  }
  // 袖：翻折袖口上沿一道折线；袖口血更多
  {
    const A = ARM[sx], t = foreT(sx, X, Y, Z)
    if (t > CUFF_T0 - 0.02 && t < 1.02) { seam(0.7 * gauss(t - CUFF_T0 - 0.012, 0.012)); blood = Math.max(blood, 0.9) }
    const dA = Math.min(sdCapsule(X, Y, Z, A.a[0], A.a[1], A.a[2], A.e[0], A.e[1], A.e[2], 0.07), sdCapsule(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], 0.065))
    if (dA < 0.01) blood = Math.max(blood * 0.7, 0.45 + 0.5 * sstep(0.3, 0.9, t))
  }
  setC(o, c, 0.86, mat, blood)
}

// ======================================================================
// 围裙（米白粗帆布半身围裙，系在肚子下沿）
// ======================================================================
export const APRON = { y0: 0.86, y1: 0.885, bot: 0.44, th: 0.0042 }
/** 围裙截面（椭圆，中心 z）：顶部贴着下摆外侧，往下略收 */
const AP_TOP = (() => { // 求下摆在 y0 处的半宽 / 前后
  const f = (x: number, z: number) => coatCore(x, APRON.y0 + 0.01, z)
  let lo = 0, hi = 0.6; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (f(0, m) < 0) lo = m; else hi = m }
  const zf = lo; lo = 0; hi = 0.6; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (f(m, 0.015) < 0) lo = m; else hi = m }
  return { zf, xa: lo }
})()
export const apA = (y: number) => mix(AP_TOP.xa + 0.016, AP_TOP.xa + 0.004, sstep(APRON.y0, APRON.bot, y))
export const apB = (y: number) => mix(AP_TOP.zf - 0.015 + 0.014, AP_TOP.zf - 0.015 - 0.012, sstep(APRON.y0, APRON.bot, y))
/** 围裙面上一点（参数化薄壳用）：th 角度（0 = 正前，+ = 角色左）、y 高度；垂褶 + 下沿波浪 */
export const AP_ZC = 0.015
export const AP_THMAX = (y: number) => Math.acos(clamp((-0.006 + 0.01 * sstep(0.8, 0.5, y) - AP_ZC) / apB(y), -1, 1))
export function apronPoint(th: number, y: number): V3 {
  const a = apA(y), b = apB(y), k = sstep(APRON.y0 - 0.02, APRON.bot, y)
  const r = 1 + (0.0028 * Math.sin(th * 9 + 0.5) * k + 0.0015 * Math.sin(th * 23 + y * 40) * k) / Math.max(a, b)
  return [a * Math.sin(th) * r, y, AP_ZC + b * Math.cos(th) * r]
}
export function apronSdf(X: number, Y: number, Z: number) {
  if (Y > APRON.y1 + 0.03 || Y < APRON.bot - 0.03) return Math.max(Y - APRON.y1 - 0.03, APRON.bot - 0.03 - Y) + 0.02
  const zc = 0.015
  // 帆布面：垂下的椭圆柱面（只前半圈 + 两侧包一点）
  const a = apA(Y), b = apB(Y)
  let d = Math.abs(sdEllipse(X, Z - zc, a, b)) - APRON.th * 0.5
  d -= 0.0028 * Math.sin(Math.atan2(X, Z - zc) * 9 + 0.5) * sstep(APRON.y0 - 0.05, APRON.bot, Y) // 竖向垂褶
  d += 0.0004 * fbm(X * 40, Y * 40, Z * 40, 2)
  const sideCut = Z - zc + 0.02 - 0.01 * sstep(0.8, 0.5, Y) // 只要前面（两侧包到 z ≈ −0.005）
  d = smax(d, -sideCut, 0.004)
  d = smax(d, Y - APRON.y0, 0.003)
  d = smax(d, APRON.bot - Y + 0.004 * Math.sin(X * 60), 0.003)
  // 腰带：一圈贴在下摆外侧的布带（后面打结）
  const band = Math.max(Math.abs(coatCore(X, Y, Z) - 0.0085) - 0.0028, Math.abs(Y - (APRON.y0 + APRON.y1) / 2) - (APRON.y1 - APRON.y0) / 2)
  d = Math.min(d, band)
  // 后腰结 + 两根垂带
  const kb = sdEll(X, Y, Z, 0, APRON.y0 + 0.012, -0.2, 0.026, 0.016, 0.012)
  d = Math.min(d, kb)
  for (const s of [1, -1]) d = Math.min(d, sdRoundBox(X - s * 0.022, Y - (APRON.y0 - 0.07), Z + 0.185 + 0.004 * s, 0.009, 0.07, 0.0022, 0.0018))
  return d
}
export const APRON_BOX = { min: [-0.34, 0.4, -0.25] as [number, number, number], max: [0.34, 0.92, 0.4] as [number, number, number] }
const APRON_C = C(0xd6cfbf), APRON_SH = C(0xa9a08e)
export function apronShade(X: number, Y: number, Z: number, o: Shade) {
  let c = mulc(APRON_C, 0.94 + 0.1 * fbm(X * 12, Y * 12, Z * 12, 2))
  // 下沿 / 两侧锁边、腰带、污渍（擦手的地方）
  c = mixc(c, APRON_SH, 0.6 * gauss(Y - APRON.bot - 0.006, 0.004) + 0.5 * sstep(APRON.y0 - 0.004, APRON.y0 + 0.002, Y))
  c = mixc(c, C(0x7a6a52), 0.3 * gauss(len2(Math.abs(X) - 0.16, Y - 0.7), 0.07) * (0.5 + fbm(X * 20, Y * 20, Z * 20, 2)))
  setC(o, c, 0.92, MAT.apron, Z > 0 ? 1 : 0.3)
}
export function apronWeights(X: number, Y: number, Z: number, acc: W4) {
  // [chef stage 2 修订] 围裙分三块：
  //   · 腰带 / 围裙上沿：前面跟下腹托起骨 tuck（肚子被大腿托起时腰带一起上去），其余挂髋
  //   · 前片（|θ| < ~40°，θ = 绕围裙中心的方位角）：上节 apU（腰带 → 膝前，搭在大腿上）→ 下节 apD（膝前 → 下沿，按重力垂）
  //   · 两侧（|θ| > ~60°）：腰带下很快就全跟大腿骨（贴着大腿外侧刚性跟随）
  //   背后的结 / 垂带只挂髋
  const sheet = sstep(0.866, 0.835, Y), back = sstep(-0.03, -0.1, Z)
  const th = Math.abs(Math.atan2(X, Z - AP_ZC)), front = sstep(1.0, 0.62, th) * (1 - back)
  const sideK = (1 - front) * (1 - back) * sheet, frontK = front * sheet
  const top = 1 - sideK - frontK
  const tw = top * tuckShare(X, Y, Z), sl = tuckSide(X)
  acc.add(B.tuckL, tw * sl); acc.add(B.tuckR, tw * (1 - sl)); acc.add(B.hips, top - tw)
  const wl = sstep(-0.07, 0.07, X)
  if (sideK > 0) { const leg = sstep(0.87, 0.8, Y); acc.add(X > 0 ? B.thighL : B.thighR, sideK * leg); const tw2 = sideK * (1 - leg) * tuckShare(X, Y, Z); acc.add(X > 0 ? B.tuckL : B.tuckR, tw2); acc.add(B.hips, sideK * (1 - leg) - tw2) }
  if (frontK > 0) {
    const lo = sstep(0.62, 0.53, Y)
    acc.add(B.apUL, frontK * wl * (1 - lo)); acc.add(B.apUR, frontK * (1 - wl) * (1 - lo))
    acc.add(B.apDL, frontK * wl * lo); acc.add(B.apDR, frontK * (1 - wl) * lo)
  }
}
/** [chef stage 2 修订] 下腹托起骨（tuckL/R，挂 belly）的份额：下腹前片 / 腰带前沿（大腿抬起时被托起）；左右按 x 分 */
export const tuckShare = (X: number, Y: number, Z: number) => sstep(1.08, 0.95, Y) * sstep(0.0, 0.13, Z) * sstep(0.36, 0.24, Math.abs(X))
export const tuckSide = (X: number) => sstep(-0.08, 0.08, X)

// ======================================================================
// 厨裤（宽松直筒）
// ======================================================================
const cuffY = (z: number, ankZ: number) => 0.082 + 0.026 * sstep(0.06, -0.04, z - ankZ)
function pantsLeg(s: number, X: number, Y: number, Z: number) {
  const L = LEG[s]
  let d = sdRoundCone(X, Y, Z, L.hip[0] - s * 0.006, L.hip[1] + 0.02, L.hip[2] - 0.004, L.knee[0], L.knee[1], L.knee[2], 0.135, 0.098)
  d = smin(d, sdEll(X, Y, Z, L.hip[0] + s * 0.01, L.hip[1] - 0.17, L.hip[2] - 0.0, 0.126, 0.18, 0.13), 0.05) // 粗大腿
  const bot: V3 = [L.ankle[0], 0.08, L.ankle[2] + 0.014]
  d = smin(d, sdRoundCone(X, Y, Z, L.knee[0], L.knee[1], L.knee[2], bot[0], bot[1], bot[2], 0.098, 0.088), 0.035)
  // 宽松布料的斜褶（膝窝、裤脚堆褶）
  d -= 0.0026 * gauss(Y - L.knee[1] + 0.01, 0.04) * Math.sin(Y * 160 + X * 40) * sstep(0.01, -0.04, Z - L.knee[2])
  d -= 0.0035 * gauss(Y - 0.15, 0.04) * (0.6 + 0.4 * Math.sin(Math.atan2(X - L.ankle[0], Z - L.ankle[2]) * 5 + Y * 50))
  d = smax(d, cuffY(Z, L.ankle[2]) - Y, 0.004)
  d = smax(d, -sdRoundCone(X, Y, Z, bot[0], bot[1] - 0.05, bot[2], bot[0], bot[1] + 0.07, bot[2], 0.07, 0.068), 0.004)
  return d
}
export function pantsSdf(X: number, Y: number, Z: number) {
  if (Y > 1.08) return Y - 1.08 + 0.02
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  let d = sdEll(X, Y, Z, 0, 0.97, 0.0, 0.23, 0.13, 0.17) // 骨盆（被下摆盖住）
  for (const s of [1, -1]) if (s === sx || ax < 0.06) d = smin(d, pantsLeg(s, X, Y, Z), 0.05)
  d += 0.0006 * fbm(X * 25, Y * 25, Z * 25, 2)
  return d
}
export const PANTS_BOX = { min: [-0.34, 0.06, -0.22] as [number, number, number], max: [0.34, 1.0, 0.22] as [number, number, number] }
export function pantsShade(X: number, Y: number, Z: number, o: Shade) {
  const L = LEG[X >= 0 ? 1 : -1]
  let c = mulc([0.5, 0.5, 0.5], 0.95 + 0.1 * fbm(X * 14, Y * 14, Z * 14, 2))
  if (Y < cuffY(Z, L.ankle[2]) + 0.005) c = mulc(c, 0.25)
  setC(o, c, 0.85, MAT.plaid, Z > 0 ? 0.55 : 0.2)
}
export function legWeights(X: number, Y: number, Z: number, acc: W4) {
  const s = X >= 0 ? 1 : -1, S = s > 0 ? 'L' : 'R', L = LEG[s]
  const p: V3 = [X, Y, Z]
  const below = sstep(-0.07, 0.05, dot(sub(p, L.hip), L.dT) - 0.03)
  const mid = sstep(0.01, 0.06, Math.abs(X))
  const legK = clamp(below * mix(0.4, 1, mid), 0, 1) * (Y > 1.02 ? 0 : 1)
  acc.add(B.hips, 1 - legK)
  if (legK <= 0) return
  chainWeights(acc, p, [L.hip, L.knee, L.ankle, L.toe, add(L.toe, [0, 0, 0.08])], [B['thigh' + S], B['shin' + S], B['foot' + S], B['toe' + S]], [0.06, 0.035, 0.02], legK)
}

// ======================================================================
// 黑色防滑厨鞋：鞋壳 = 脚的包络外扩（脚本身不出网格），权重与脚同骨
// ======================================================================
/** 脚（踝局部 x / z）：平面半宽、脚背高 */
const footW = (z: number) => z < 0.1 ? mix(0.036, 0.048, sstep(-0.07, 0.1, z)) : mix(0.048, 0.02, Math.pow(sstep(0.1, 0.2, z), 0.8))
const footH = (z: number) => z < 0 ? mix(0.086, 0.094, sstep(-0.07, -0.01, z)) : mix(0.094, 0.05, sstep(-0.005, 0.16, z)) - 0.006 * sstep(0.16, 0.2, z)
/** 脚的 SDF（踝坐标系），鞋壳在它外面扩 SHOE_E */
export const SHOE_E = 0.011
function footLocal(x: number, y: number, z: number) {
  const zc = clamp(z, -0.064, 0.198), w = footW(zc), hh = footH(zc)
  let d = sdEllipse(x, y - 0.026, w, hh - 0.026)
  d = len2(Math.max(d, 0), z - zc) + Math.min(d, 0)
  return smax(d, 0.026 - y, 0.004)
}
export function shoeSdf(s: number) {
  const L = LEG[s], cx = L.ankle[0] + s * 0.004, az = L.ankle[2]
  return (X: number, Y: number, Z: number) => {
    const x = X - cx, z = Z - az
    if (Y > 0.17 || Math.abs(x) > 0.1 || z < -0.13 || z > 0.26) return Math.max(Y - 0.17, Math.abs(x) - 0.1, -0.13 - z, z - 0.26) + 0.03
    // 鞋面 = 脚外扩（鞋头更圆更高：防砸圆头）
    let d = footLocal(x, Y, z) - SHOE_E - 0.006 * sstep(0.08, 0.17, z)
    // 鞋口（踝处挖开，裤脚盖住）
    d = smax(d, -sdEll(x, Y, z, 0, 0.13, -0.025, 0.036, 0.045, 0.048), 0.008)
    // 厚橡胶底（比鞋面宽 4 mm，厚 2.4 cm，前翘）+ 底纹
    const zs = clamp(z, -0.075, 0.214), ws = footW(clamp(zs, -0.064, 0.198)) + SHOE_E + 0.004
    const lift = 0.012 * sstep(0.15, 0.22, z)
    const rr = 0.005, qx = Math.abs(x) - ws + rr, qy = Math.abs(Y - 0.012 - lift) - 0.012 + rr
    let sole = len2(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr
    sole = len2(Math.max(sole, 0), z - zs) + Math.min(sole, 0)
    sole += 0.0016 * sstep(0.006, 0.0, Y) * (Math.sin(z * 260) > 0.2 ? 1 : 0) // 底纹（防滑横纹）
    d = smin(d, sole, 0.004)
    d = smax(d, -Y, 0.002)
    return d
  }
}
export const shoeBox = (s: number) => { const L = LEG[s]; return { min: [L.ankle[0] - 0.085, -0.008, L.ankle[2] - 0.11] as [number, number, number], max: [L.ankle[0] + 0.085, 0.16, L.ankle[2] + 0.25] as [number, number, number] } }
const SHOE = C(0x141414), SOLE = C(0x2a2a29)
export function shoeShade(s: number, X: number, Y: number, Z: number, o: Shade) {
  const L = LEG[s], z = Z - L.ankle[2]
  let c = mulc(SHOE, 0.9 + 0.2 * fbm(X * 40, Y * 40, Z * 40, 2)), rough = 0.42
  if (Y < 0.024 + 0.012 * sstep(0.15, 0.22, z)) { c = SOLE; rough = 0.8 }
  // 鞋面油污 / 血点由着色器加；鞋口内暗
  if (Y > 0.1) c = mulc(c, 0.6)
  setC(o, c, rough, MAT.rubber, 0.5)
}
/** 鞋权重：与脚 / 脚趾骨同一套（按脚趾关节分界）——鞋壳就是外扩的脚 */
export function shoeWeights(s: number, X: number, Y: number, Z: number, acc: W4) {
  const S = s > 0 ? 'L' : 'R', L = LEG[s]
  const f = sstep(-0.025, 0.025, Z - L.toe[2])
  acc.add(B['foot' + S], 1 - f); acc.add(B['toe' + S], f)
  void X; void Y
}

// ======================================================================
// 肥厚人手
// ======================================================================
const toHand = (F: HandFrame, X: number, Y: number, Z: number): V3 => { const px = X - F.o[0], py = Y - F.o[1], pz = Z - F.o[2]; return [px * F.a[0] + py * F.a[1] + pz * F.a[2], px * F.r[0] + py * F.r[1] + pz * F.r[2], px * F.d[0] + py * F.d[1] + pz * F.d[2]] }
const fingerSeg = (f: Finger, k: number, X: number, Y: number, Z: number) => sdRoundCone(X, Y, Z, f.joints[k][0], f.joints[k][1], f.joints[k][2], f.joints[k + 1][0], f.joints[k + 1][1], f.joints[k + 1][2], f.radii[k], f.radii[k + 1])
export function handSdf(s: number) {
  const { F, fingers } = HANDS[s], A = ARM[s]
  const w0 = sub(A.w, scl(A.df, 0.07))
  return (X: number, Y: number, Z: number) => {
    const [ta, tr, td] = toHand(F, X, Y, Z)
    // 粗手腕（藏进袖口一截）+ 腕部肉褶
    let wrist = sdRoundCone(X, Y, Z, w0[0], w0[1], w0[2], A.w[0], A.w[1], A.w[2], 0.04, 0.039)
    wrist = smin(wrist, sdEll(ta, tr, td, 0.006, 0, 0, 0.032, 0.042, 0.027), 0.014)
    wrist -= 0.0016 * gauss(ta + 0.012, 0.004)
    { const bd = len3(ta - 0.09, tr, td) - 0.16; if (bd > 0.02) return Math.min(bd, wrist) }
    // 厚掌
    let d = sdRoundBox(ta - 0.058, tr + 0.001, td + 0.002, 0.047, 0.053, 0.0188, 0.016)
    d = smin(d, sdEll(ta, tr, td, 0.016, 0.0, 0.0, 0.038, 0.04, 0.026), 0.022)
    d = smin(d, sdEll(ta, tr, td, 0.058, 0.0, 0.008, 0.052, 0.05, 0.02), 0.014) // 手背肉（厚）
    d = smin(d, sdEll(ta, tr, td, 0.036, 0.028, -0.012, 0.04, 0.026, 0.023), 0.014) // 鱼际（肥厚）
    d = smin(d, sdEll(ta, tr, td, 0.054, -0.036, -0.008, 0.046, 0.019, 0.021), 0.014) // 小鱼际
    d = smax(d, -sdEll(ta, tr, td, 0.066, 0.002, -0.034, 0.026, 0.018, 0.012), 0.01) // 掌心凹（浅）
    // 指根肉垫（掌侧）
    for (const f of fingers) if (f.name !== 'thumb') { const j = toHand(F, f.joints[0][0], f.joints[0][1], f.joints[0][2]); d = smin(d, sdEll(ta, tr, td, j[0] - 0.006, j[1], -0.01, 0.016, 0.0135, 0.013), 0.008) }
    let df = 1
    for (const f of fingers) {
      let g = 1
      for (let k = 0; k < 3; k++) g = Math.min(g, fingerSeg(f, k, X, Y, Z))
      // 指节鼓（关节处略粗）+ 指节横纹（背侧）
      for (let k = 1; k < 3; k++) { const j = f.joints[k], r = f.radii[k]; g = smin(g, len3(X - j[0] - F.d[0] * r * 0.2, Y - j[1] - F.d[1] * r * 0.2, Z - j[2] - F.d[2] * r * 0.2) - r * 1.02, 0.004) }
      // 指尖：甲床平、指腹圆
      const tip = f.joints[3], dj = f.joints[2]
      const ex = tip[0] - dj[0], ey = tip[1] - dj[1], ez = tip[2] - dj[2], L2 = ex * ex + ey * ey + ez * ez
      const tn = ((X - dj[0]) * ex + (Y - dj[1]) * ey + (Z - dj[2]) * ez) / L2
      if (tn > 0.25 && tn < 1.4) {
        const tc = Math.min(tn, 1)
        const back = (X - dj[0] - ex * tc) * F.d[0] + (Y - dj[1] - ey * tc) * F.d[1] + (Z - dj[2] - ez * tc) * F.d[2]
        g = smax(g, back - f.radii[3] * 0.82, 0.002)
      }
      df = Math.min(df, g)
    }
    for (const f of fingers) if (f.name !== 'thumb') { const j = f.joints[0]; d = smin(d, len3(X - j[0] - F.d[0] * 0.004, Y - j[1] - F.d[1] * 0.004, Z - j[2] - F.d[2] * 0.004) - f.radii[0] * 1.1, 0.01) }
    d = smin(d, df, 0.009)
    d = smin(d, wrist, 0.014)
    d += 0.00025 * vnoise(X * 600, Y * 600, Z * 600)
    return d
  }
}
export const handBox = (s: number) => {
  const { fingers, F } = HANDS[s], A = ARM[s]
  let mn: V3 = [...F.o], mx: V3 = [...F.o]
  const w0 = sub(A.w, scl(A.df, 0.08))
  for (const p of [w0, ...fingers.flatMap((f) => f.joints)]) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]) }
  mn = mn.map((v) => v - 0.045) as V3; mx = mx.map((v) => v + 0.045) as V3
  return { min: mn as [number, number, number], max: mx as [number, number, number] }
}
/** 手部件只保留袖口以外 */
export const handKeep = (s: number) => (X: number, Y: number, Z: number) => foreT(s, X, Y, Z) > 0.9
const SKIN = C(0xc7a59a), SKIN_SH = C(0xa98479), SKIN_PALM = C(0xd3aea2), NAIL = C(0x3b2a24), NAIL_TIP = C(0x1c1512), KNUCK = C(0x9a7368)
export function handShade(s: number, X: number, Y: number, Z: number, o: Shade) {
  const { F, fingers } = HANDS[s]
  const [ta, , td] = toHand(F, X, Y, Z)
  // 粗糙泛红的皮肤（偏灰粉，像猪皮）
  let c = mulc(SKIN, 0.92 + 0.12 * fbm(X * 40, Y * 40, Z * 40, 2))
  c = mixc(c, C(0xb07a72), 0.25 * fbm(X * 18 + 3, Y * 18, Z * 18, 2))
  c = mixc(c, SKIN_SH, sstep(0.02, -0.01, ta) * 0.5)
  const palmK = sstep(0.0, -0.013, td)
  c = mixc(c, SKIN_PALM, palmK * 0.6)
  let rough = 0.55, fur = 0
  // 手背 / 腕背稀疏粗汗毛
  if (td > 0.004 && ta < 0.08) fur = 0.35 * sstep(0.004, 0.012, td)
  for (const f of fingers) {
    const dj = f.joints[2], tip = f.joints[3]
    const L = lenv(sub(tip, dj)), dir = nrm(sub(tip, dj))
    const tn = dot(sub([X, Y, Z], dj), dir) / L
    const q = sub([X, Y, Z], add(dj, scl(dir, clamp(tn, 0, 1) * L)))
    const back = dot(q, F.d), rad = lenv(q)
    if (rad < f.radii[2] * 1.4 && tn > 0.3 && tn < 1.08 && back > f.radii[3] * 0.4) {
      // 深色指甲（指甲缝黑）
      const k = sstep(f.radii[3] * 0.4, f.radii[3] * 0.62, back) * sstep(0.3, 0.4, tn)
      c = mixc(c, mixc(NAIL, NAIL_TIP, sstep(0.75, 1.02, tn)), k); rough = mix(rough, 0.35, k); fur = 0
    }
    for (let j = 0; j < 3; j++) { const jp = f.joints[j]; const dd = lenv(sub([X, Y, Z], jp)); if (dd < f.radii[j] * 1.7) c = mixc(c, KNUCK, 0.45 * gauss(dd - f.radii[j], 0.004) * sstep(-0.002, 0.004, dot(sub([X, Y, Z], jp), F.d))) }
  }
  setC(o, c, rough, MAT.hand, 0.85, fur)
}
export function handWeights(s: number, X: number, Y: number, Z: number, acc: W4) {
  const S = s > 0 ? 'L' : 'R', p: V3 = [X, Y, Z]
  const { F, fingers } = HANDS[s], A = ARM[s]
  const fWrist = sstep(-0.02, 0.022, dot(sub(p, A.w), nrm(add(A.df, F.a))))
  acc.add(B['foreArm' + S], 1 - fWrist)
  if (fWrist <= 0) return
  let best = 1, bf: Finger | null = null
  for (const f of fingers) { let g = 1; for (let k = 0; k < 3; k++) g = Math.min(g, fingerSeg(f, k, X, Y, Z)); if (g < best) { best = g; bf = f } }
  if (!bf) { acc.add(B['hand' + S], fWrist); return }
  const thumb = bf.name === 'thumb'
  const j0 = bf.joints[0], j1 = bf.joints[1], dir0 = nrm(sub(j1, j0))
  const fBase = thumb ? sstep(-0.014, 0.02, dot(sub(p, j0), dir0)) * sstep(0.014, 0.0, best) : sstep(-0.009, 0.009, dot(sub(p, j0), dir0)) * sstep(0.007, 0.0, best)
  acc.add(B['hand' + S], fWrist * (1 - fBase))
  if (fBase > 0) chainWeights(acc, p, bf.joints, [B[bf.name + '1' + S], B[bf.name + '2' + S], B[bf.name + '3' + S]], [0.007, 0.006], fWrist * fBase)
}

// ======================================================================
// 身体权重：手臂 / 躯干链 / 啤酒肚 / 下摆
// ======================================================================
export function trunkW(_X: number, Y: number, acc: W4, k: number) {
  if (k <= 0) return
  const a = sstep(1.06, 1.2, Y), b = sstep(1.24, 1.38, Y)
  acc.add(B.hips, k * (1 - a)); acc.add(B.spine, k * a * (1 - b)); acc.add(B.chest, k * a * b)
}
export function coatWeights(X: number, Y: number, Z: number, acc: W4) {
  const p: V3 = [X, Y, Z], s = X >= 0 ? 1 : -1, S = s > 0 ? 'L' : 'R', A = ARM[s]
  const dArm = Math.min(sdCapsule(X, Y, Z, A.a[0], A.a[1], A.a[2], A.e[0], A.e[1], A.e[2], 0.07), sdCapsule(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], 0.062))
  const dTor = coatCore(X, Y, Z)
  const along = dot(sub(p, A.a), A.du)
  const armK = clamp(sstep(-0.02, 0.03, dTor - dArm) * sstep(-0.07, 0.02, along), 0, 1)
  const clavK = gauss(lenv(sub(p, A.a)), 0.07) * (1 - armK) * 0.8 + armK * gauss(along, 0.055) * 0.4
  acc.add(B['clav' + S], clavK)
  if (armK > 0) {
    const fE = sstep(-0.035, 0.035, dot(sub(p, A.e), nrm(add(A.du, A.df))))
    const k = armK * (1 - clavK * 0.5)
    acc.add(B['upperArm' + S], k * (1 - fE)); acc.add(B['foreArm' + S], k * fE)
  }
  const tk0 = (1 - armK) * (1 - clavK)
  // [chef stage 2 修订] 下腹前片：一部分跟 tuck（大腿抬起时托起，挂 belly → 也跟肚子抖）
  const tw = tk0 * tuckShare(X, Y, Z), sl = tuckSide(X)
  acc.add(B.tuckL, tw * sl); acc.add(B.tuckR, tw * (1 - sl))
  const tk = tk0 - tw
  // 啤酒肚：前腹一大片随 belly 骨（中心最强、往两侧 / 上下渐弱）
  const bk = tk * 0.9 * gauss(len3(X / 1.2, Y - 1.01, (Z - 0.2) * 0.8), 0.18) * sstep(0.02, 0.14, Z)
  acc.add(B.belly, bk)
  // [chef stage 2] 下摆后 / 侧（围裙挡不到的地方）贴着大腿根：部分跟下摆骨（腿往后摆时衣摆被顶起，不让厨裤从衣摆里穿出）
  const hk = (tk - bk) * sstep(0.93, 0.845, Y) * 0.75 * sstep(0.03, 0.09, Math.abs(X)) * sstep(0.18, 0.02, Z)
  acc.add(B['hem' + S], hk)
  trunkW(X, Y, acc, tk - bk - hk)
}
export { onSurface }
/** 沿梯度把点投到 f 的等值面（off 外偏） */
function onSurface(f: (x: number, y: number, z: number) => number, p: V3, off = 0): V3 {
  let x = p[0], y = p[1], z = p[2]
  for (let i = 0; i < 40; i++) {
    const d = f(x, y, z) - off, e = 0.001
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e)
    const gl = len3(gx, gy, gz) || 1
    x -= (gx / gl) * d * 0.8; y -= (gy / gl) * d * 0.8; z -= (gz / gl) * d * 0.8
    if (Math.abs(d) < 1e-5) break
  }
  return [x, y, z]
}
void cross
