// [spokes] 迎宾女郎（Entity 28）身体 SDF 部件。坐标：**行李员空间**（spokesRig.warpBH 形变到迎宾女郎空间：女性体型）。
//   jacket  深棕细格纹女式双排扣西装外套：到胯的下摆、V 口 + 平驳领（驳头缺口、领缘折缝）、两列各两粒扣（左片压右片）、
//           胯部两侧袋盖、左胸嵌线袋；袖到腕，袖口外侧 4 粒袖扣（beastMesh 式小网格，在 spokesMesh 里）。
//           格纹不进顶点色：顶点色只给明暗（缝 / 折 / AO），格纹由着色器按静止姿态坐标程序生成（spokesMesh plaidPatch），抗锯齿不出摩尔纹。
//   shirt   白衬衫（V 口里，领口敞开露出一小片颈下皮肤）；大尖翻领是 spokesMesh 里的薄壳，翻在驳头上。
//   skirt   同格纹及膝铅笔裙（下摆在膝下 3 cm，后中一道开衩缝）。
//   legs    裸色丝袜腿（大腿 → 膝 → 小腿肚 → 踝）+ 脚背（鞋口里露出）。
//   shoe    深棕低跟船鞋（3.5 cm 方跟、尖圆头、鞋口低）。
//   hand    复用行李员的手（spokesRig 里以腕为中心 ×0.9），重新着色（暖肤色、裸粉指甲）。
import { clamp, fbm, gauss, len2, len3, mix, sdCapsule, sdEll, sdRoundCone, smax, smin, sstep, vnoise } from './conciergeSdf'
import { ARM, LEG, foreT, torsoCore, handShade, handSdf, setS, onSurface } from './bellhopBody'
import { HANDS as BH_HANDS } from './bellhopRig'
import { B, W4, add, dot, lenv, nrm, scl, sub, chainWeights, type V3 } from './spokesRig'
import type { Shade } from './conciergeHead'

const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
const mixc = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mulc = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]
function sdEllipse(x: number, y: number, a: number, b: number) { const k0 = len2(x / a, y / b), k1 = len2(x / (a * a), y / (b * b)); return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1 }
/** 材质标记（借用 Shade.fx）：0 普通顶点色；1 西装格纹；2 裙子格纹；4 丝袜腿 */
export const MAT_PLAID = 1, MAT_SKIRT = 2, MAT_LEG = 4
/** V 口带（aMat = (1, −1)）：顶点色只放明暗，西装 / 衬衫 / 皮肤三者的分界由着色器按静止坐标解析算（spokesMesh GLSL_VEDGE），不跟着网格边走 → 不出锯齿 */
export const MAT_VBAND = 1, VBAND_FLAG = -1
const setM = (o: Shade, m: number) => { o.fx = m }

// ======================================================================
// 西装版型（行李员空间）
// ======================================================================
/** 双排扣：两列（x = ±BTN_X）× 两行 */
export const BTN_Y = [1.072, 0.99], BTN_X = 0.058
/** V 口底（第一行扣以上） */
export const V0 = 1.118
/** 下摆（到胯，前略低：女式外套前片稍长） */
export const JHEM = (z: number) => 0.84 - 0.008 * sstep(-0.02, 0.1, z)
/** 叠门：左片（角色左 +X）压右片，压在上面那片的前边在 x = EDGE_X */
export const EDGE_X = -0.088
/** V 口半宽 */
export const FRONT_W = { w: 0.068, y1: 1.452, p: 0.85 }
export function frontW(y: number) { return y > V0 ? FRONT_W.w * Math.pow(clamp((y - V0) / (FRONT_W.y1 - V0), 0, 1), FRONT_W.p) : 0 }
/** 平驳领：e = |x| − frontW(y)。<0 在驳头 / 领子上 */
export const NOTCH_Y = 1.372
const LAP_MAX = 0.064, COLLAR_W = 0.03, NOTCH_H = 0.022
export function lapelD(e: number, y: number) {
  if (y < V0 || e < -0.006) return 1
  if (y < NOTCH_Y) return e - LAP_MAX * Math.pow(sstep(V0, NOTCH_Y - 0.008, y), 0.75)
  const dc = e - COLLAR_W
  // 驳头上段：外缘 LAP_MAX，上沿 NOTCH_Y + NOTCH_H 向内略下斜，内侧被缺口（领子与驳头之间的三角口）切开
  const top = NOTCH_Y + NOTCH_H - 0.12 * Math.max(0, LAP_MAX - e) * 0.15
  const dp = Math.max(e - LAP_MAX, y - top, (COLLAR_W + 0.012 - e) * 0.8 + (y - NOTCH_Y) * 0.6 - 0.004)
  return Math.min(dc, dp)
}
export const gorgeY = (e: number) => NOTCH_Y + 0.002 + 0.1 * Math.max(0, e)
/** 左胸嵌线袋 */
export const POCKET = { x: 0.118, y: 1.252 }
/** 颈洞 */
export const NECK_HOLE = { c: [0, 1.455, -0.018] as V3, r: 0.058 }

// ======================================================================
// 衬衫 + 颈下皮肤
// ======================================================================
/** 衬衫领口敞开的半宽（第一粒扣解开） */
export const SHIRT_OPEN = { w: 0.03, y0: 1.392, y1: 1.47, p: 0.85 }
export const shirtOpen = (y: number) => y > SHIRT_OPEN.y0 ? SHIRT_OPEN.w * Math.pow(clamp((y - SHIRT_OPEN.y0) / (SHIRT_OPEN.y1 - SHIRT_OPEN.y0), 0, 1), SHIRT_OPEN.p) : 0
export function shirtSdf(X: number, Y: number, Z: number) {
  if (Y < 0.98 || Y > 1.56) return Math.max(0.98 - Y, Y - 1.56) + 0.03
  let d = torsoCore(X, Y, Z) + 0.0068
  d -= 0.0012 * gauss(X - 0.012, 0.0025) * sstep(1.35, 1.3, Y) // 门襟
  d -= 0.001 * Math.sin(X * 120 + Y * 25) * sstep(0.025, 0.05, Math.abs(X)) * gauss(Y - 1.22, 0.1)
  d += 0.0005 * fbm(X * 40, Y * 40, Z * 40, 2)
  d = smax(d, -(Math.max(len2(X - NECK_HOLE.c[0], Z - NECK_HOLE.c[2]) - NECK_HOLE.r + 0.006, 1.42 - Y)), 0.006)
  // 领口敞开（露出颈下皮肤）
  d = smax(d, -Math.max(Math.abs(X) - shirtOpen(Y), -Z), 0.003)
  return d
}
/** 颈下皮肤（衬衫开口里） */
function skinSdf(X: number, Y: number, Z: number) {
  if (Y < 1.3 || Y > 1.5) return 0.05
  return smin(torsoCore(X, Y, Z) + 0.0135, sdRoundCone(X, Y, Z, 0, 1.38, -0.02, 0, 1.52, -0.022, 0.05, 0.047), 0.02)
}
export const isSkin = (X: number, Y: number, Z: number) => Z > 0 && Y > 1.34 && Math.abs(X) < shirtOpen(Y) + 0.002

// ======================================================================
// 西装
// ======================================================================
const sleeveR = (t: number) => mix(0.044, 0.036, clamp(t, 0, 1))
/** 袖口（前臂参数） */
export const JCUFF_T = 0.965
function sleeve(s: number, X: number, Y: number, Z: number) {
  const A = ARM[s]
  let d = sdRoundCone(X, Y, Z, A.a[0] - s * 0.01, A.a[1] - 0.018, A.a[2], A.e[0], A.e[1], A.e[2], 0.046, 0.044)
  d = smin(d, sdEll(X, Y, Z, A.a[0] - s * 0.022, A.a[1] - 0.02, A.a[2], 0.04, 0.03, 0.043), 0.03) // 袖山（女装：略带垫肩）
  d = smin(d, sdRoundCone(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], 0.044, 0.036), 0.02)
  const t = foreT(s, X, Y, Z)
  if (t > -0.25 && t < 0.3) d -= 0.0016 * gauss(t, 0.12) * Math.sin(t * 70 + 0.5 * Math.sin(X * 90))
  // 袖口截平 + 掏空（手从里面伸出）
  d = smax(d, (t - JCUFF_T) * A.Lf, 0.003)
  const cav = sdRoundCone(X, Y, Z, A.end[0] - A.df[0] * 0.08, A.end[1] - A.df[1] * 0.08, A.end[2] - A.df[2] * 0.08, A.end[0] + A.df[0] * 0.03, A.end[1] + A.df[1] * 0.03, A.end[2] + A.df[2] * 0.03, 0.03, 0.03)
  d = smax(d, -cav, 0.003)
  return d
}
/** 下摆放样（腰 → 胯，女装下摆外展包住臀） */
function jskirt(X: number, Y: number, Z: number) {
  const k = sstep(1.1, 0.86, Y)
  const a = mix(0.13, 0.168, k), bF = mix(0.09, 0.114, k), bB = mix(0.094, 0.128, k)
  return smax(sdEllipse(X, Z + 0.006, a, Z + 0.006 > 0 ? bF : bB), Y - 1.12, 0.03)
}
export function jacketCore(X: number, Y: number, Z: number) {
  let d = smin(torsoCore(X, Y, Z) - 0.0015, jskirt(X, Y, Z), 0.05)
  d = smin(d, smax(sdRoundCone(X, Y, Z, 0, 1.43, -0.022, 0, 1.5, -0.03, 0.075, 0.066), Z - 0.01, 0.02), 0.012) // 后领座
  return d
}
function vCut(X: number, Y: number, Z: number) { return Math.max(Math.abs(X) - frontW(Y), 0.0 - Z) }
export function jacketSdf(X: number, Y: number, Z: number) {
  if (Y < 0.8 || Y > 1.6) return Math.max(0.8 - Y, Y - 1.6) + 0.05
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  let d = jacketCore(X, Y, Z)
  d = smax(d, JHEM(Z) - Y, 0.004)
  d += 0.0011 * gauss(Y - 1.075, 0.004) * sstep(0.0, 0.03, -Z) // 后腰线
  d -= 0.0008 * sstep(1.0, 0.88, Y) * Math.sin(Math.atan2(X, Z) * 6 + 0.4) * (0.6 + 0.4 * vnoise(X * 14, Y * 6, Z * 14))
  { const r = len2(X - sx * 0.13, Y - 1.4), ang = Math.atan2(Y - 1.4, (X - sx * 0.13) * sx); d -= 0.0006 * gauss(r - 0.065, 0.045) * sstep(0.0, 0.03, r) * Math.sin(ang * 8 + r * 30) }
  d += 0.0003 * fbm(X * 30, Y * 30, Z * 30, 2)
  if (Z > 0) {
    const e = ax - frontW(Y), ld = lapelD(e, Y)
    if (ld < 0.008 && e > -0.006) {
      const k = sstep(0.002, -0.002, ld)
      d -= k * (0.0042 + 0.0016 * Math.sin(Math.PI * clamp(e / LAP_MAX, 0, 1)))
      d += 0.0016 * gauss(ld, 0.0022)
      if (Y > NOTCH_Y - 0.01) d += 0.0011 * gauss(Y - gorgeY(e), 0.0016) * sstep(COLLAR_W + 0.006, COLLAR_W - 0.004, e)
    }
    // 叠门：压在上面的左片前边（V 底以下）一道台阶；下层右片在它后面
    if (Y < V0 + 0.01) d += 0.0016 * sstep(EDGE_X + 0.0015, EDGE_X - 0.0015, X)
    // 左胸嵌线袋
    { const px = X - POCKET.x, py = Y - POCKET.y; d -= 0.0014 * sstep(0.026, 0.023, Math.abs(px + 0.05 * py)) * sstep(0.006, 0.0045, Math.abs(py)) }
    // 胯部两侧袋盖
    for (const sd of [1, -1]) { const cx = sd * 0.112, cy = 0.928; d -= 0.002 * sstep(0.05, 0.046, Math.abs(X - cx)) * sstep(0.02, 0.016, Math.abs(Y - cy)) }
  } else {
    d += 0.002 * gauss(X, 0.0024) * sstep(1.4, 1.3, Y) // 后中缝
  }
  const kS = mix(0.003, 0.026, sstep(1.08, 1.28, Y))
  for (const s of [1, -1]) if (sx === s || ax < 0.05) d = smin(d, sleeve(s, X, Y, Z), kS)
  d = smax(d, -vCut(X, Y, Z), 0.0065)
  d = smax(d, -(Math.max(len2(X - NECK_HOLE.c[0], Z - NECK_HOLE.c[2]) - NECK_HOLE.r - 0.006, 1.42 - Y)), 0.008)
  return d
}
/** 身体（西装 + 衬衫 + 颈下皮肤） */
export function bodySdf(X: number, Y: number, Z: number) {
  const j = jacketSdf(X, Y, Z)
  if (Y < 1.08 || Y > 1.56 || Z < -0.02 || Math.abs(X) > 0.2) return j
  const ax = Math.abs(X)
  // 衬衫贴着 V 边往外鼓（真衬衫把 V 口填满）：台阶从 1.4 cm 降到约 4 mm，圆角提取得出来，V 边不出锯齿
  const eV = ax - frontW(Y)
  const sh = Math.max(Math.min(shirtSdf(X, Y, Z) - 0.0095 * sstep(-0.032, -0.003, eV) * sstep(V0 - 0.02, V0 + 0.02, Y), skinSdf(X, Y, Z)), eV - 0.022, 0.004 - Z, V0 - 0.03 - Y)
  return smin(j, sh, 0.006)
}
export const BODY_BOX = { min: [-0.34, 0.8, -0.2] as [number, number, number], max: [0.34, 1.6, 0.18] as [number, number, number] }
export function foreSleeveRegion(s: number, X: number, Y: number, Z: number) {
  const A = ARM[s], t = foreT(s, X, Y, Z)
  const px = X - A.e[0] - A.df[0] * t * A.Lf, py = Y - A.e[1] - A.df[1] * t * A.Lf, pz = Z - A.e[2] - A.df[2] * t * A.Lf
  return Math.max((0.3 - t) * A.Lf, (t - 1.12) * A.Lf, len3(px, py, pz) - 0.075)
}
export const SLEEVE_BAND = 0.008
export function foreSleeveBox(s: number) {
  const A = ARM[s], p0 = add(A.e, scl(A.df, A.Lf * 0.2)), p1 = add(A.end, scl(A.df, 0.03)), r = 0.07
  return { min: [Math.min(p0[0], p1[0]) - r, Math.min(p0[1], p1[1]) - r, Math.min(p0[2], p1[2]) - r] as [number, number, number], max: [Math.max(p0[0], p1[0]) + r, Math.max(p0[1], p1[1]) + r, Math.max(p0[2], p1[2]) + r] as [number, number, number] }
}
/** 领口细格区域（V 口 + 驳头缺口） */
export function collarRegion(X: number, Y: number, Z: number) { return Math.max(Math.abs(X) - frontW(Y) - 0.03 - 0.03 * sstep(1.3, 1.4, Y), Math.abs(Y - 1.29) - 0.19, 0.01 - Z) }
export const COLLAR_BOX = { min: [-0.18, 1.09, -0.0] as [number, number, number], max: [0.18, 1.49, 0.14] as [number, number, number] }

// ======================================================================
// 及膝铅笔裙
// ======================================================================
export const SKIRT_HEM = 0.468
function skirtProf(Y: number) {
  const P: [number, number, number, number][] = [[1.05, 0.13, 0.094, 0.098], [0.95, 0.163, 0.112, 0.122], [0.82, 0.172, 0.118, 0.13], [0.65, 0.17, 0.116, 0.126], [SKIRT_HEM, 0.166, 0.115, 0.122]]
  if (Y >= P[0][0]) return P[0]
  for (let i = 1; i < P.length; i++) if (Y >= P[i][0]) { const t = sstep(P[i - 1][0], P[i][0], Y); return [Y, mix(P[i - 1][1], P[i][1], t), mix(P[i - 1][2], P[i][2], t), mix(P[i - 1][3], P[i][3], t)] }
  return P[P.length - 1]
}
export function skirtSdf(X: number, Y: number, Z: number) {
  if (Y > 1.1 || Y < SKIRT_HEM - 0.03 || Math.abs(X) > 0.24) return Math.max(Y - 1.1, SKIRT_HEM - 0.03 - Y, Math.abs(X) - 0.24) + 0.02
  const [, a, bF, bB] = skirtProf(Y), z = Z + 0.004
  const outer = sdEllipse(X, z, a, z > 0 ? bF : bB)
  let d = smax(outer, SKIRT_HEM - Y, 0.003)
  d = smax(d, Y - 1.06, 0.01)
  // 竖向细褶 + 坐皱（前片胯下几道横向浅褶）
  d -= 0.0009 * Math.sin(Math.atan2(X, z) * 9 + 1.3) * sstep(0.8, 0.55, Y)
  d -= 0.0012 * gauss(Y - 0.78, 0.06) * Math.sin(Y * 160 + X * 30) * sstep(0.02, 0.06, z) * gauss(X, 0.08)
  d += 0.0004 * fbm(X * 30, Y * 30, Z * 30, 2)
  return d
}
export const SKIRT_BOX = { min: [-0.21, SKIRT_HEM - 0.02, -0.16] as [number, number, number], max: [0.21, 1.07, 0.15] as [number, number, number] }

// ======================================================================
// 腿 + 脚背（丝袜）
// ======================================================================
/** 脚的局部坐标（相对踝，行李员空间）：低跟船鞋里脚跟抬起约 3.5 cm */
const HEEL_H = 0.034
export function footSdf(s: number, X: number, Y: number, Z: number) {
  const L = LEG[s], x = (X - L.ankle[0] - s * 0.002) * 1.12, z = Z - L.ankle[2]
  let d = sdRoundCone(x, Y, z, 0, 0.1, 0.0, 0, HEEL_H + 0.03, -0.022, 0.027, 0.026) // 踝 → 脚跟
  d = smin(d, sdEll(x, Y, z, 0, HEEL_H + 0.024, -0.03, 0.024, 0.026, 0.03), 0.015)
  d = smin(d, sdRoundCone(x, Y, z, 0, HEEL_H + 0.03, -0.012, s * 0.004, 0.022, 0.1, 0.026, 0.021), 0.02) // 足弓 → 跖骨
  d = smin(d, sdEll(x, Y, z, s * 0.004, 0.018, 0.118, 0.028, 0.013, 0.036), 0.015) // 脚趾
  return d
}
export function legSdf(s: number) {
  const L = LEG[s]
  return (X: number, Y: number, Z: number) => {
    if (Y > 0.72) return Y - 0.72 + 0.02
    const kx = L.knee[0], kz = L.knee[2]
    let d = sdRoundCone(X, Y, Z, L.hip[0] - s * 0.004, L.hip[1] + 0.02, L.hip[2], kx, L.knee[1], kz, 0.07, 0.042)
    d = smin(d, sdEll(X, Y, Z, kx, L.knee[1] + 0.004, kz + 0.006, 0.04, 0.046, 0.04), 0.025) // 膝
    d = smin(d, sdRoundCone(X, Y, Z, kx, L.knee[1], kz, L.ankle[0], L.ankle[1] + 0.02, L.ankle[2], 0.038, 0.021), 0.03) // 小腿
    d = smin(d, sdEll(X, Y, Z, kx + s * 0.003, 0.35, kz - 0.016, 0.034, 0.09, 0.036), 0.035) // 小腿肚
    d = smin(d, sdEll(X, Y, Z, kx - s * 0.005, 0.31, kz - 0.01, 0.03, 0.075, 0.031), 0.03) // 内侧小腿肚
    d -= 0.0015 * gauss(Y - L.knee[1] + 0.015, 0.012) * sstep(0.0, -0.03, Z - kz) // 膝后窝
    d = smin(d, footSdf(s, X, Y, Z), 0.02)
    return d
  }
}
export const legBox = (s: number) => { const L = LEG[s]; return { min: [L.hip[0] - 0.1, -0.005, -0.12] as [number, number, number], max: [L.hip[0] + 0.1, 0.72, 0.2] as [number, number, number] } }
/** 丝袜腿颜色 */
const LEG_COL = C(0xd8b29a), LEG_SH = C(0xb88f78)
export function legShade(s: number, X: number, Y: number, Z: number, o: Shade) {
  // 裸色丝袜：皮肤色压暗一点 + 膝 / 踝处略深（丝袜拉伸处更透）
  const L = LEG[s]
  let c = mulc(LEG_COL, 0.94 + 0.06 * fbm(X * 20, Y * 20, Z * 20, 2))
  c = mixc(c, LEG_SH, 0.35 * gauss(Y - L.knee[1], 0.03) + 0.25 * sstep(0.14, 0.08, Y))
  c = mixc(c, mulc(LEG_SH, 0.8), 0.3 * sstep(-0.0, -0.05, Z - L.knee[2]) * sstep(0.62, 0.4, Y))
  setS(o, c, 0.45, 0, 0, 1, 0, 0); setM(o, MAT_LEG)
}
export function legWeightsS(s: number, X: number, Y: number, Z: number, acc: W4) {
  const S = s > 0 ? 'L' : 'R', L = LEG[s], p: V3 = [X, Y, Z]
  const below = sstep(-0.06, 0.05, dot(sub(p, L.hip), nrm(sub(L.knee, L.hip))) - 0.03)
  acc.add(B.hips, 1 - below)
  if (below <= 0) return
  // [E28 鞋修] 鞋口以下 / 鞋口上方 2.5 cm 内的脚部皮肤与鞋用同一组权重（footBoneW：foot / toe），鞋口处皮肤和鞋一起动，
  //   不会出现「皮肤跟小腿走、鞋跟脚走」在鞋口错开 → 皮肤穿出鞋帮 / 鞋口露缝；再往上才渐变回 小腿 / 踝 链式权重
  const z = Z - L.ankle[2], m = Y < 0.16 && z > -0.1 ? sstep(pumpTop(z) + 0.026, pumpTop(z) + 0.004, Y) : 0
  if (m < 1) chainWeights(acc, p, [L.hip, L.knee, L.ankle, L.toe, add(L.toe, [0, 0, 0.08])], [B['thigh' + S], B['shin' + S], B['foot' + S], B['toe' + S]], [0.055, 0.03, 0.02], below * (1 - m))
  if (m > 0) { const f = footToeF(s, Z); acc.add(B['foot' + S], below * m * (1 - f)); acc.add(B['toe' + S], below * m * f) }
}

// ======================================================================
// 低跟船鞋
// ======================================================================
// [E28 鞋修] 原来的鞋 = 放样鞋身 − 脚（内腔正好等于脚，壁厚 0），而脚在鞋头 / 鞋面处比放样还高 / 宽 → 内腔把鞋面挖穿，
//   露出里面的脚皮（鞋面上一块块肤色）、鞋口边缘只剩 0 厚的锯齿。现在：
//   · 鞋壳 shoeHull = 放样鞋身 ∪ (脚 外扩 SHOE_WALL)：鞋处处把脚包住，壁厚 ≥ 3.5 mm
//   · 鞋口线以上切开；鞋口里挖一圈浅袋（脚外 1.2 mm、深 POCKET_D），露出鞋里衬，脚从袋里伸出来
//   · 腿网格在鞋壳实体里的部分全部不要（只留袋里一截，袋底以下 3 mm 截断，截口藏在鞋实体里）
//   · 鞋 / 脚皮共用 footBoneW 权重；toe 弯折带放在跖趾关节后方（关节前的鞋头整块跟 toe 走，踮脚时鞋头平贴地、鞋底在关节后弯）
const pumpW = (z: number) => z < 0.08 ? mix(0.027, 0.039, sstep(-0.07, 0.08, z)) : mix(0.039, 0.016, sstep(0.08, 0.172, z) ** 1.3)
/** 船鞋放样：鞋底线 yb、鞋面顶线 yt（沿脚长 z，相对踝） */
const pumpYb = (z: number) => (z > 0.06 ? 0.0 : mix(HEEL_H, 0.0, sstep(-0.035, 0.06, z)))
const pumpYt = (z: number) => z < -0.03 ? mix(0.075, 0.085, sstep(-0.07, -0.03, z)) : z < 0.05 ? mix(0.085, 0.062, sstep(-0.03, 0.05, z)) : mix(0.062, 0.016, sstep(0.05, 0.168, z) ** 0.9)
/** 鞋口线（以上露出脚背 / 脚跟）：后跟高、两侧低、鞋头全包 */
export const pumpTop = (z: number) => (z < -0.035 ? mix(0.079, 0.07, sstep(-0.07, -0.035, z)) : z < 0.045 ? mix(0.07, 0.036, sstep(-0.035, 0.045, z)) : mix(0.036, 0.2, sstep(0.045, 0.062, z)))
export const SHOE_WALL = 0.0048, POCKET_D = 0.009, POCKET_GAP = 0.0017
/** foot → toe 的混合比（鞋 / 脚皮共用）：弯折带在跖趾关节后 3.5 cm 内 */
export const footToeF = (s: number, Z: number) => sstep(-0.035, -0.002, Z - LEG[s].toe[2])
/** 鞋壳（不开口、不挖袋）：放样鞋身 ∪ 外扩的脚 + 鞋底 + 方跟，y < 0 切平 */
export function shoeHull(s: number) {
  const L = LEG[s]
  return (X: number, Y: number, Z: number) => {
    const x = X - L.ankle[0] - s * 0.002, z = Z - L.ankle[2]
    if (Y > 0.15 || Math.abs(x) > 0.075 || z < -0.105 || z > 0.225) return Math.max(Y - 0.15, Math.abs(x) - 0.075, -0.105 - z, z - 0.225) + 0.02
    const zc = clamp(z, -0.062, 0.168), w = pumpW(zc), yb = pumpYb(zc), yt = pumpYt(zc), hh = (yt - yb) * 0.5, yc = yb + hh
    const xx = x * (1 + 0.12 * s * sstep(0.1, 0.17, zc) * Math.sign(x || 1))
    let d = sdEllipse(xx, (Y - yc) * (Y < yc ? 2.2 : 1), w, hh * (Y < yc ? 2.2 : 1)) // 下半截面压平（平底）
    // 两端封口（拉伸体的标准写法；原来 + min(d, 0) 让截面内部的深度把鞋身从两端顶出去一截 → 鞋跟后上方一片尖翅）
    const dzc = Math.abs(z - zc) * 1.4
    d = len2(Math.max(d, 0), dzc) + Math.min(Math.max(d, dzc), 0)
    // 鞋口附近放样鞋身（比脚宽）圆角收掉，鞋帮上沿只剩贴脚的一圈 → 鞋口不出宽平台
    d = smax(d, Y - pumpTop(z) + 0.022, 0.018)
    // 脚外扩一层鞋壁（只取踝以下：鞋帮高度以上不需要）
    const foot = Math.max(footSdf(s, X, Y, Z) - SHOE_WALL, Y - 0.1)
    d = smin(d, foot, 0.012)
    // 鞋底（厚 4 mm，略宽出鞋身）+ 方跟
    const ws = pumpW(zc) + 0.0012
    let sole = Math.max(Math.abs(xx) - ws, Math.abs(Y - yb - 0.003) - 0.003)
    sole = len2(Math.max(sole, 0), dzc) + Math.min(Math.max(sole, dzc), 0)
    const hz = z + 0.047, heelW = mix(0.016, 0.012, sstep(HEEL_H, 0.0, Y))
    const heel = Math.max(Math.abs(x) - heelW, Math.abs(hz) - mix(0.019, 0.013, sstep(HEEL_H, 0.0, Y)), Y - HEEL_H - 0.004, -Y)
    sole = smin(sole, heel, 0.003)
    d = smin(d, sole, 0.002)
    return smax(d, -Y, 0.001)
  }
}
/** 鞋口切面（> 0 = 鞋口线以上） */
const collarCut = (_x: number, Y: number, z: number) => Y - pumpTop(z)
/** 鞋实体（开口、不挖袋）：腿网格据此剔除藏在鞋里的脚 */
export function shoeSolid(s: number) {
  const hull = shoeHull(s), L = LEG[s]
  return (X: number, Y: number, Z: number) => smax(hull(X, Y, Z), collarCut(X - L.ankle[0], Y, Z - L.ankle[2]), 0.0025)
}
/** 鞋口里的袋（脚外 POCKET_GAP、鞋口线下 POCKET_D 深） */
function pocketSdf(s: number, X: number, Y: number, Z: number) {
  const L = LEG[s], z = Z - L.ankle[2]
  return Math.max(footSdf(s, X, Y, Z) - POCKET_GAP, pumpTop(z) - POCKET_D - Y)
}
export function shoeSdf(s: number) {
  const solid = shoeSolid(s)
  return (X: number, Y: number, Z: number) => {
    const d = solid(X, Y, Z)
    if (d > 0.02) return d
    return smax(d, -pocketSdf(s, X, Y, Z), 0.0012)
  }
}
/** 腿网格保留：鞋实体外，或在鞋口袋里（袋底以下 3 mm 截断） */
export function legKeepShoe(s: number) {
  const solid = shoeSolid(s), L = LEG[s]
  return (X: number, Y: number, Z: number) => solid(X, Y, Z) > 0.0006 || Y > pumpTop(Z - L.ankle[2]) - POCKET_D - 0.003
}
export const shoeBox = (s: number) => { const L = LEG[s]; return { min: [L.ankle[0] - 0.065, -0.004, L.ankle[2] - 0.1] as [number, number, number], max: [L.ankle[0] + 0.065, 0.125, L.ankle[2] + 0.215] as [number, number, number] } }
const SHOE = C(0x2a1a13), SHOE_HI = C(0x4a2e20), SOLE = C(0x15100c), LINING = C(0x6b4a33)
export function shoeShade(s: number, X: number, Y: number, Z: number, o: Shade) {
  const L = LEG[s], z = Z - L.ankle[2]
  const yb = pumpYb(z)
  let c = mixc(mulc(SHOE, 0.96 + 0.06 * fbm(X * 40, Y * 40, Z * 40, 2)), SHOE_HI, 0.15)
  let rough = 0.3
  if (Y < yb + 0.0062 || (z < -0.025 && Y < HEEL_H + 0.003)) { c = SOLE; rough = 0.6 }
  const tc = pumpTop(z)
  if (Y > tc - 0.004 && z < 0.062) c = mulc(c, 0.75) // 鞋口滚边
  // 鞋里衬（袋壁 / 袋底）
  if (z < 0.062 && Y > tc - POCKET_D - 0.002 && footSdf(s, X, Y, Z) < POCKET_GAP + 0.0015) { c = mulc(LINING, 0.55 + 0.45 * sstep(tc - POCKET_D, tc, Y)); rough = 0.7 }
  setS(o, c, rough, 0, 0, 0, 0, 0)
}
export function shoeWeights(s: number, X: number, Y: number, Z: number, acc: W4) {
  const S = s > 0 ? 'L' : 'R', f = footToeF(s, Z)
  acc.add(B['foot' + S], 1 - f); acc.add(B['toe' + S], f)
  void X; void Y
}

// ======================================================================
// 颜色
// ======================================================================
/** 格纹区的顶点色只放明暗（着色器乘上格纹底色）：1 = 正常 */
export function bodyShade(X: number, Y: number, Z: number, o: Shade) {
  const ax = Math.abs(X), eV = ax - frontW(Y)
  const inV = Z > 0.0 && Y > V0 - 0.02 && eV < 0.014 && Y < 1.5
  if (!inV) { shadeJacket(X, Y, Z, o); return }
  // V 口带：顶点只给明暗（西装侧取西装明暗、里侧取衬衫 / 皮肤明暗，两者都≈1，插值不显），颜色分界交给着色器
  const dj = Math.abs(jacketSdf(X, Y, Z))
  if (eV > 0.0005 && dj < 0.003) { shadeJacket(X, Y, Z, o); const k = o.r; setS(o, [k, k, k], o.rough, 0, VBAND_FLAG, 0, 0, 1); setM(o, MAT_VBAND); return }
  if (isSkin(X, Y, Z) && ax < shirtOpen(Y) - 0.0005) {
    const k = 0.96 + 0.04 * fbm(X * 30, Y * 30, Z * 30, 2)
    setS(o, [k, k, k], 0.55, 0, VBAND_FLAG, 1, 0, 0); setM(o, MAT_VBAND); return
  }
  let k = 0.97 + 0.04 * fbm(X * 30, Y * 30, Z * 30, 2)
  k *= 1 - 0.12 * gauss(eV, 0.008) * sstep(V0 + 0.04, V0 + 0.1, Y) // 驳头下的一点阴影（V 底不压暗 → 最窄处不出暗缝）
  k *= 1 - 0.18 * gauss(X - 0.012, 0.0016) * sstep(1.35, 1.3, Y) * sstep(V0 + 0.02, V0 + 0.05, Y) // 门襟
  setS(o, [k, k, k], 0.82, 0, VBAND_FLAG, 0, 1, 0); setM(o, MAT_VBAND)
}
/** 皮肤 / 衬衫底色（sRGB），着色器 V 口带和兔头颈部共用同一个皮肤色 → 颈前两块皮肤不分色 */
export const SKIN_HEX = 0xe0bea5, SHIRT_HEX = 0xeeece8
function shadeJacket(X: number, Y: number, Z: number, o: Shade) {
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  // 袖口里
  { const A = ARM[sx], t = foreT(sx, X, Y, Z); if (t > JCUFF_T - 0.02 && t < 1.08) { const px = X - A.e[0] - A.df[0] * t * A.Lf, py = Y - A.e[1] - A.df[1] * t * A.Lf, pz = Z - A.e[2] - A.df[2] * t * A.Lf; if (len3(px, py, pz) < sleeveR(t) - 0.006) { setS(o, [0.08, 0.06, 0.05], 0.9, 0, 0, 0, 0, 1); setM(o, 0); return } } }
  let k = 0.97 + 0.06 * fbm(X * 9, Y * 9, Z * 9, 2)
  const seam = (v: number) => { k *= 1 - 0.55 * clamp(v, 0, 1) }
  if (Y < JHEM(Z) + 0.004) seam(0.6)
  { const ys = mix(1.492, 1.466, clamp((ax - 0.06) / 0.11, 0, 1)); if (ax > 0.06 && ax < 0.2) seam(0.7 * gauss(Y - ys, 0.0026) * sstep(-0.05, 0.0, Z + 0.035) * sstep(0.03, -0.0, Z - 0.03)) }
  { const r = len3(X - sx * 0.166, (Y - 1.42) * 0.85, Z + 0.02); seam(0.5 * gauss(r - 0.06, 0.0024) * sstep(1.33, 1.37, Y)) }
  seam(0.45 * gauss(ax - 0.128, 0.0026) * sstep(-0.04, -0.01, Z) * sstep(1.32, 1.28, Y) * sstep(JHEM(Z), JHEM(Z) + 0.02, Y))
  // 前片公主线（女装收腰）
  if (Z > 0) seam(0.35 * gauss(ax - mix(0.085, 0.1, sstep(1.0, 1.25, Y)) - 0.012 * gauss(Y - 1.08, 0.06), 0.0022) * sstep(1.3, 1.24, Y) * sstep(JHEM(Z) + 0.01, JHEM(Z) + 0.03, Y) * (ax - frontW(Y) > 0.03 ? 1 : 0))
  let rough = 0.82
  if (Z > 0) {
    const e = ax - frontW(Y), ld = lapelD(e, Y)
    if (ld < 0.005 && e > -0.006) {
      const kk = sstep(0.002, -0.002, ld)
      k *= 1 + 0.05 * kk; rough = mix(rough, 0.65, kk)
      seam(0.75 * gauss(ld, 0.003))
      if (Y > NOTCH_Y - 0.01) seam(0.7 * gauss(Y - gorgeY(e), 0.0028) * sstep(COLLAR_W + 0.006, COLLAR_W - 0.004, e))
    }
    if (Y < V0 + 0.01) seam(0.8 * gauss(X - EDGE_X, 0.0016))
    { const px = X - POCKET.x, py = Y - POCKET.y; seam(0.7 * gauss(Math.abs(py) - 0.0055, 0.0012) * sstep(0.028, 0.024, Math.abs(px + 0.05 * py))) }
    for (const sd of [1, -1]) { const cx = sd * 0.112; if (Math.abs(X - cx) < 0.055 && Math.abs(Y - 0.928) < 0.028) seam(0.7 * (gauss(Y - 0.912, 0.002) * sstep(0.05, 0.044, Math.abs(X - cx)) + gauss(Math.abs(X - cx) - 0.048, 0.0016) * sstep(0.022, 0.016, Math.abs(Y - 0.93)))) }
  } else {
    seam(0.55 * gauss(X, 0.0022) * sstep(1.42, 1.36, Y))
    seam(0.55 * gauss(Y - 1.505, 0.003) * sstep(-0.02, -0.05, Z))
  }
  setS(o, [k, k, k], rough, 0, 0, 0, 0, 1); setM(o, MAT_PLAID)
}
export function skirtShade(X: number, Y: number, Z: number, o: Shade) {
  let k = 0.97 + 0.06 * fbm(X * 9, Y * 9, Z * 9, 2)
  if (Y < SKIRT_HEM + 0.006) k *= 0.6
  if (Z < 0) k *= 1 - 0.55 * gauss(X, 0.0018) * sstep(SKIRT_HEM + 0.14, SKIRT_HEM + 0.12, Y) // 后中开衩
  k *= 1 - 0.4 * gauss(Math.abs(X) - 0.162, 0.003) * sstep(0.0, 0.02, Math.abs(Z) - 0.06) * 0 // （侧缝隐藏）
  const [, a, bF, bB] = skirtProf(Y), z = Z + 0.004
  if (sdEllipse(X, z, a, z > 0 ? bF : bB) < -0.003) k *= 0.35 // 裙里
  setS(o, [k, k, k], 0.82, 0, 0, 0, 0, 1); setM(o, MAT_SKIRT)
}
/** 手：行李员的手（男）→ 女性纤细手指：手指（含拇指）一圈收细 ≈1.7 mm（半径 8.4 → 6.7 mm），指节球随之变小；掌根不动 */
const FINGER_THIN = 0.0017
export function handSdfS(s: number) {
  const base = handSdf(s), fingers = BH_HANDS[s].fingers
  return (X: number, Y: number, Z: number) => {
    const d = base(X, Y, Z)
    if (d > 0.02) return d
    let m = 0
    for (const f of fingers) for (let k = 0; k < 3; k++) {
      const a = f.joints[k], b = f.joints[k + 1], ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2]
      const t = clamp(((X - a[0]) * ex + (Y - a[1]) * ey + (Z - a[2]) * ez) / (ex * ex + ey * ey + ez * ez), 0, 1)
      const dd = len3(X - a[0] - ex * t, Y - a[1] - ey * t, Z - a[2] - ez * t)
      const ramp = k === 0 ? sstep(0.0, f.name === 'thumb' ? 0.5 : 0.35, t) : 1
      m = Math.max(m, ramp * sstep(0.022, 0.013, dd))
    }
    return d + FINGER_THIN * m
  }
}
/** 手：暖肤色、裸粉指甲 */
const NAIL = C(0xd9a39b)
export function handShadeS(s: number, X: number, Y: number, Z: number, o: Shade) {
  handShade(s, X, Y, Z, o)
  const isNail = o.rough < 0.4
  o.r = o.r * 0.97; o.g = o.g * 0.86; o.b = o.b * 0.76
  if (isNail) { o.r = mix(o.r, NAIL[0], 0.6); o.g = mix(o.g, NAIL[1], 0.6); o.b = mix(o.b, NAIL[2], 0.6); o.rough = 0.22 }
  setM(o, 0)
}

// ---------- 权重 ----------
export function bodyWeights(X: number, Y: number, Z: number, acc: W4) {
  const p: V3 = [X, Y, Z], s = X >= 0 ? 1 : -1, S = s > 0 ? 'L' : 'R', A = ARM[s]
  const dArm = Math.min(sdCapsule(X, Y, Z, A.a[0], A.a[1], A.a[2], A.e[0], A.e[1], A.e[2], 0.055), sdCapsule(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], 0.05))
  const dTor = Math.min(torsoCore(X, Y, Z), jskirt(X, Y, Z))
  const along = dot(sub(p, A.a), A.du)
  let armK = sstep(-0.02, 0.025, dTor - dArm) * sstep(-0.06, 0.02, along)
  armK = clamp(armK * sstep(0.006, 0.016, jskirt(X, Y, Z)), 0, 1)
  const clavK = gauss(lenv(sub(p, A.a)), 0.06) * (1 - armK) * 0.8 + armK * gauss(along, 0.05) * 0.4
  acc.add(B['clav' + S], clavK)
  if (armK > 0) {
    const fE = sstep(-0.03, 0.03, dot(sub(p, A.e), nrm(add(A.du, A.df))))
    const k = armK * (1 - clavK * 0.5)
    acc.add(B['upperArm' + S], k * (1 - fE)); acc.add(B['foreArm' + S], k * fE)
  }
  const tk = (1 - armK) * (1 - clavK)
  const a = sstep(1.06, 1.18, Y), b = sstep(1.24, 1.38, Y)
  const leg = sstep(0.99, 0.84, Y) * 0.7 * sstep(0.004, 0.05, Math.abs(X))
  acc.add(B['hem' + S], tk * leg)
  const kk = tk * (1 - leg)
  acc.add(B.hips, kk * (1 - a)); acc.add(B.spine, kk * a * (1 - b)); acc.add(B.chest, kk * a * b)
}
export function skirtWeights(X: number, Y: number, Z: number, acc: W4) {
  // [stage 2] 裙下段跟腿：上段 hemL/R（与大腿同枢轴；动画里跟大腿屈伸 + 二阶滞后）→ 膝上起 skirtL/R（膝高腿轴上，坐 / 蹲时横向收窄）
  //   → 下摆后片一部分跟小腿（屈膝时小腿肚不从裙后片穿出）；中缝左右各半；臀部以上全归 hips
  const k = sstep(0.97, 0.66, Y), kk = sstep(0.68, 0.52, Y), ksh = sstep(0.56, 0.47, Y) * sstep(0.02, -0.05, Z) * 0.85
  const wl = sstep(-0.045, 0.045, X)
  for (const [S, w] of [['L', wl], ['R', 1 - wl]] as [string, number][]) {
    if (w <= 0) continue
    acc.add(B['hem' + S], k * (1 - kk) * w); acc.add(B['skirt' + S], k * kk * (1 - ksh) * w); acc.add(B['shin' + S], k * kk * ksh * w)
  }
  acc.add(B.hips, 1 - k)
}
/** 手臂权重的「属于手臂」判定（给衣领 / 小件用） */
export { onSurface, ARM, LEG, torsoCore }
export { jacketCore as jacketSmooth }
