// [beast] 第五层的野兽（Entity 18）身体 SDF 部件。坐标：**行李员空间**（= 野兽模型空间 / K，地面 y=0、+Z 正面），
// 这样可以只读复用行李员的人体部件（西裤 / 皮鞋 / 苍白细长手 / 手臂与腿的骨骼几何、躯干芯、权重函数），不改动行李员文件。
// beastMesh 烘焙时把顶点乘 K 放到野兽空间。
//   jacket  近黑带酒红底的单排扣西装：瘦削躯干 + 到臀下的短下摆（扣位以下前襟圆角分开）、V 领开口露出白衬衫、
//           枪驳领（领缘明线、驳头缺口、后领座）、左胸手巾袋（露一角暗红丝巾）、两侧袋盖、肩线 / 袖窿 / 后中缝 / 侧缝；
//           袖子到腕、袖口里露出约 1.2 cm 白衬衫袖口；扣子 / 袖扣是 beastMesh 里的小网格。
//   shirt   白衬衫（在西装 V 口里，躯干芯内缩 1.1 cm）+ 黑色细领带（领结 + 窄领带面，下端塞进扣位）。领子是 beastMesh 里的薄壳。
//   pants / shoe / hand：直接用行李员的（bellhopBody），颜色在这里重新着色（裤更黑、手更苍白）。
import { clamp, fbm, gauss, len2, len3, mix, sdCapsule, sdEll, sdRoundCone, smax, smin, sstep, vnoise } from './conciergeSdf'
import { ARM, foreT, torsoCore, trunkW, handShade, pantsShade, shoeShade, setS, onSurface } from './bellhopBody'
import { B, W4, add, dot, lenv, nrm, scl, sub, type V3 } from './beastRig'
import type { Shade } from './conciergeHead'

const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
const mixc = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mulc = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]
function sdEllipse(x: number, y: number, a: number, b: number) { const k0 = len2(x / a, y / b), k1 = len2(x / (a * a), y / (b * b)); return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1 }

// ======================================================================
// 西装版型参数（行李员空间）
// ======================================================================
/** 扣位（单排两粒扣：只扣上面那粒）；V 领从扣位开到领口 */
export const BTN_Y = [0.985, 0.9]
/** 下摆高度（前略高） */
export const JHEM = (z: number) => 0.845 + 0.012 * sstep(-0.05, 0.1, z)
/** 前襟开口半宽（|X| < w 处挖开）：扣位以上是 V 领，两粒扣之间合襟，下扣以下圆角分开 */
export function frontW(y: number) {
  if (y > BTN_Y[0]) return 0.076 * Math.pow(clamp((y - BTN_Y[0]) / (1.455 - BTN_Y[0]), 0, 1), 0.92)
  if (y < BTN_Y[1]) return 0.0015 + 0.9 * Math.pow(BTN_Y[1] - y, 1.25)
  return 0
}
/** 戗驳领（peak lapel，v2）：e = |x| − frontW(y)（V 边以外的距离）。返回到驳头外缘的近似有符号距离（<0 在驳头 / 领子上）。
 *  扣位 → 串口（NOTCH_Y）驳头渐宽到 LAP_MAX；串口以上：内侧是领子（宽 COLLAR_W），外侧是向上外挑的尖角（LAP_PEAK、高 PEAK_H），
 *  两者之间是一道窄 V 形领嘴（只在尖角上沿与领子外缘之间） */
export const NOTCH_Y = 1.368
const LAP_MAX = 0.068, LAP_PEAK = 0.088, PEAK_H = 0.044, COLLAR_W = 0.033
export function lapelD(e: number, y: number) {
  if (y < BTN_Y[0] || e < -0.006) return 1
  if (y < NOTCH_Y) return e - LAP_MAX * Math.pow(sstep(BTN_Y[0], NOTCH_Y - 0.01, y), 0.8)
  const dc = e - COLLAR_W
  const u = clamp((y - NOTCH_Y) / PEAK_H, 0, 1)
  const outer = mix(LAP_MAX, LAP_PEAK, Math.pow(u, 0.8))
  const yTop = NOTCH_Y + 0.004 + (PEAK_H - 0.004) * clamp((e - COLLAR_W + 0.004) / (LAP_PEAK - COLLAR_W), 0, 1)
  const dp = Math.max(e - outer, (y - yTop) * 0.9, y - NOTCH_Y - PEAK_H)
  return Math.min(dc, dp)
}
/** 串口线（领子与驳头的接缝，从 V 边斜向上到领嘴） */
export const gorgeY = (e: number) => NOTCH_Y + 0.003 + 0.12 * Math.max(0, e)
/** 兼容旧接口：驳头是否存在 */
export function lapelW(y: number) { return y < BTN_Y[0] ? 0 : y < NOTCH_Y ? LAP_MAX * Math.pow(sstep(BTN_Y[0], NOTCH_Y - 0.01, y), 0.8) : COLLAR_W }
/** 马甲（v2 可选三件套；默认关：马甲会把附图里那片白衬衫 + 黑领带挡掉大半，老板感改由宽肩厚胸 + 戗驳领 + 口袋巾 + 粗手戒指来给）。
 *  VEST_ON = true 时：V 口半宽（深 V，下到 VEST_V0）+ 两粒马甲扣 */
export const VEST_ON = false
export const VEST_V0 = 1.1
export const frontWv = (y: number) => 0.062 * Math.pow(clamp((y - VEST_V0) / (1.45 - VEST_V0), 0, 1), 0.8)
export const VEST_BTN_Y = [1.075, 1.022]
/** 手巾袋（左胸，角色左 = +X）位置 */
export const POCKET = { x: 0.128, y: 1.262 }
/** 领口（颈洞）：衬衫领薄壳盖住边缘 */
export const NECK_HOLE = { c: [0, 1.455, -0.018] as V3, r: 0.06 }

// ======================================================================
// 白衬衫 + 领带
// ======================================================================
/** 衬衫：躯干芯内缩（V 口里看到的那一层） */
export function shirtSdf(X: number, Y: number, Z: number) {
  if (Y < 0.88 || Y > 1.56) return Math.max(0.88 - Y, Y - 1.56) + 0.03
  let d = torsoCore(X, Y, Z) + 0.0075
  // 衬衫前襟（门襟）一道细棱 + 胸前几道松量褶
  d -= 0.0012 * gauss(X - 0.013, 0.0025) * sstep(1.47, 1.4, Y)
  d -= 0.0012 * Math.sin(X * 140 + Y * 18) * sstep(0.03, 0.06, Math.abs(X)) * gauss(Y - 1.2, 0.12)
  d += 0.0005 * fbm(X * 40, Y * 40, Z * 40, 2)
  // 颈洞
  d = smax(d, -(Math.max(len2(X - NECK_HOLE.c[0], Z - NECK_HOLE.c[2]) - NECK_HOLE.r + 0.004, 1.42 - Y)), 0.006)
  return d
}
/** 衬衫前表面 Z（沿 +Z 二分），给领带 / 领结定位 */
export function shirtFrontZ(x: number, y: number) { let lo = -0.05, hi = 0.2; for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; if (shirtSdf(x, y, m) < 0) lo = m; else hi = m } return lo }
const KNOT = (() => { const y = 1.433; return { c: [0, y, shirtFrontZ(0, y) + 0.004] as V3 } })()
/** 领带半宽：上窄下略宽（窄领带） */
const tieW = (y: number) => mix(0.022, 0.0165, sstep(1.0, 1.42, y))
export function tieSdf(X: number, Y: number, Z: number) {
  if (Y < 0.95 || Y > 1.47 || Math.abs(X) > 0.06) return 0.02
  const s = shirtSdf(X, Y, Z)
  let d = Math.max(s - 0.0032, Math.abs(X) - tieW(Y), Y - 1.43, 0.955 - Y)
  // 领带面中间微微鼓起（不是一张纸）
  d -= 0.0012 * (1 - (X / tieW(Y)) ** 2) * sstep(0.97, 1.02, Y)
  // 领结：小倒梯形团（窄领带打的四手结）
  const k = KNOT.c
  const kn = sdEll(X, Y, Z, k[0], k[1], k[2], 0.0165 - 0.004 * sstep(k[1] - 0.012, k[1] + 0.014, Y) * 0 + 0.002 * sstep(k[1] - 0.014, k[1] + 0.012, Y), 0.018, 0.0105)
  d = smin(d, kn, 0.004)
  return d
}
export const isTie = (X: number, Y: number, Z: number) => tieSdf(X, Y, Z) < shirtSdf(X, Y, Z) + 0.0006

// ======================================================================
// 西装
// ======================================================================
const sleeveR = (t: number) => mix(0.0455, 0.0375, clamp(t, 0, 1))
/** 西装袖口（前臂参数）：再往外是衬衫袖口 */
export const JCUFF_T = 0.935
function sleeve(s: number, X: number, Y: number, Z: number) {
  const A = ARM[s]
  let d = sdRoundCone(X, Y, Z, A.a[0] - s * 0.01, A.a[1] - 0.018, A.a[2], A.e[0], A.e[1], A.e[2], 0.047, 0.0455)
  d = smin(d, sdEll(X, Y, Z, A.a[0] - s * 0.022, A.a[1] - 0.022, A.a[2], 0.042, 0.03, 0.044), 0.03) // 袖山（窄肩、略方）
  d = smin(d, sdRoundCone(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], 0.0455, 0.0375), 0.02)
  const t = foreT(s, X, Y, Z)
  if (t > -0.25 && t < 0.3) d -= 0.0016 * gauss(t, 0.12) * Math.sin(t * 70 + 0.5 * Math.sin(X * 90)) // 肘弯横褶
  // 西装袖口截平 + 掏空
  const tt = (t - JCUFF_T) * A.Lf
  d = smax(d, tt, 0.003)
  const cav = sdRoundCone(X, Y, Z, A.end[0] - A.df[0] * 0.08, A.end[1] - A.df[1] * 0.08, A.end[2] - A.df[2] * 0.08, A.end[0] + A.df[0] * 0.03, A.end[1] + A.df[1] * 0.03, A.end[2] + A.df[2] * 0.03, 0.0305, 0.0305)
  d = smax(d, -cav, 0.003)
  // 衬衫袖口：西装袖里伸出约 1.2 cm 的白筒（端口掏空，手从里面出来）
  const p0 = add(A.e, scl(A.df, A.Lf * (JCUFF_T - 0.08)))
  let cuff = sdRoundCone(X, Y, Z, p0[0], p0[1], p0[2], A.end[0], A.end[1], A.end[2], 0.0345, 0.0322)
  cuff = smax(cuff, (t - 1) * A.Lf - 0.004, 0.003)
  cuff = smax(cuff, -sdRoundCone(X, Y, Z, A.end[0] - A.df[0] * 0.04, A.end[1] - A.df[1] * 0.04, A.end[2] - A.df[2] * 0.04, A.end[0] + A.df[0] * 0.03, A.end[1] + A.df[1] * 0.03, A.end[2] + A.df[2] * 0.03, 0.0262, 0.028), 0.003)
  return Math.min(d, cuff)
}
/** 西装下摆放样（腰 → 臀下，外展很小） */
function jskirt(X: number, Y: number, Z: number) {
  const k = sstep(1.1, 0.86, Y)
  const a = mix(0.13, 0.172, k), bF = mix(0.09, 0.112, k), bB = mix(0.092, 0.118, k)
  const b = Z + 0.006 > 0 ? bF : bB
  return smax(sdEllipse(X, Z + 0.006, a, b), Y - 1.12, 0.03)
}
/** 西装外形（未挖 V 口 / 颈洞，不含袖）：给权重 / AO */
export function jacketCore(X: number, Y: number, Z: number) {
  let d = smin(torsoCore(X, Y, Z) + 0.002, jskirt(X, Y, Z), 0.05)
  // 后领座：颈后一圈立起来的领子（前面接驳头）
  d = smin(d, smax(sdRoundCone(X, Y, Z, 0, 1.43, -0.022, 0, 1.5, -0.03, 0.079, 0.07), Z - 0.01, 0.02), 0.012)
  return d
}
/** 口袋巾外形（袋口局部坐标，<0 在巾上）：三个尖 */
function pocketSquare(px: number, py: number) {
  const q = (px + 0.021) / 0.014, i = Math.max(0, Math.min(2, Math.floor(q))), f = q - i
  const hgt = [0.015, 0.023, 0.012][i], tri = 1 - Math.abs(f * 2 - 1)
  return Math.max(Math.abs(px) - 0.021, py - 0.003 - hgt * Math.pow(tri, 0.9), -py - 0.002)
}
function vCut(X: number, Y: number, Z: number) { return Math.max(Math.abs(X) - frontW(Y), 0.0 - Z) }
export function jacketSdf(X: number, Y: number, Z: number) {
  if (Y < 0.8 || Y > 1.6) return Math.max(0.8 - Y, Y - 1.6) + 0.05
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  let d = jacketCore(X, Y, Z)
  d = smax(d, JHEM(Z) - Y, 0.004)
  d += 0.0012 * gauss(Y - 1.08, 0.004) // 腰线（暗）
  // 前片一道收省 + 下摆竖向松量 + 腋下斜褶
  d -= 0.0016 * sstep(1.0, 0.88, Y) * Math.sin(Math.atan2(X, Z) * 6 + 0.4) * (0.6 + 0.4 * vnoise(X * 14, Y * 6, Z * 14))
  {
    const r = len2(X - sx * 0.13, Y - 1.4), ang = Math.atan2(Y - 1.4, (X - sx * 0.13) * sx)
    d -= 0.0016 * gauss(r - 0.065, 0.045) * sstep(0.0, 0.03, r) * Math.sin(ang * 8 + r * 30)
  }
  d += 0.0005 * fbm(X * 30, Y * 30, Z * 30, 2)
  if (Z > 0) {
    // 戗驳领：V 边外一条略高、略向外翻的带（尖角处更厚）；外缘一道折缝
    const e = ax - frontW(Y), ld = lapelD(e, Y)
    if (ld < 0.008 && e > -0.006) {
      const k = sstep(0.002, -0.002, ld)
      d -= k * (0.0032 + 0.0022 * Math.sin(Math.PI * clamp(e / LAP_MAX, 0, 1)))
      d += 0.0013 * gauss(ld, 0.0014)
      if (Y > NOTCH_Y - 0.01) d += 0.0012 * gauss(Y - gorgeY(e), 0.0016) * sstep(COLLAR_W + 0.006, COLLAR_W - 0.004, e) // 串口
    }
    // 合襟（两粒扣之间）：左片压右片的叠边台阶
    if (Y < BTN_Y[0] + 0.01 && Y > BTN_Y[1] - 0.06) d += 0.0014 * sstep(0.0015, -0.0015, X + 0.004)
    // 左胸手巾袋（角色左 = +X）：袋口一道嵌线 + 露出的象牙白口袋巾（三个尖，高低不一）
    {
      const px = X - POCKET.x, py = Y - POCKET.y
      const w = sstep(0.028, 0.025, Math.abs(px + 0.06 * py)) * sstep(0.0075, 0.0055, Math.abs(py))
      d -= 0.0016 * w
      const sq = pocketSquare(px, py)
      if (sq < 0.003) d = Math.min(d, smax(d - 0.0048, sq, 0.002))
    }
    // 两侧袋盖（腰线下）
    for (const sd of [1, -1]) {
      const cx = sd * 0.118, cy = 0.958
      d -= 0.0022 * sstep(0.052, 0.048, Math.abs(X - cx)) * sstep(0.022, 0.018, Math.abs(Y - cy))
    }
  } else {
    d += 0.0022 * gauss(X, 0.0024) * sstep(1.4, 1.3, Y) // 后中缝
  }
  // 袖
  const kS = mix(0.003, 0.026, sstep(1.08, 1.28, Y))
  for (const s of [1, -1]) if (sx === s || ax < 0.05) d = smin(d, sleeve(s, X, Y, Z), kS)
  // V 口挖开（露出衬衫）+ 颈洞
  d = smax(d, -vCut(X, Y, Z), 0.004)
  d = smax(d, -(Math.max(len2(X - NECK_HOLE.c[0], Z - NECK_HOLE.c[2]) - NECK_HOLE.r - 0.006, 1.42 - Y)), 0.008)
  return d
}
/** 身体（西装 + 衬衫 + 领带）：一个部件里一起提取 */
export function bodySdf(X: number, Y: number, Z: number) {
  const j = jacketSdf(X, Y, Z)
  if (Y < 0.86 || Y > 1.57 || Z < -0.02 || Math.abs(X) > 0.2) return j
  // 衬衫只在 V 口附近存在（别处它离西装表面只有几毫米，粗格下会从西装里透出来）；V 边与衬衫之间一道小圆角（免得凹角锯齿）
  const shirt = shirtSdf(X, Y, Z), ax = Math.abs(X)
  // 马甲：衬衫外 5.2 mm 的一层，挖出深 V（领带 + 衬衫从 V 里露出），领带下段压在马甲里
  const vest = VEST_ON ? smax(shirt - 0.0052, frontWv(Y) - ax, 0.0015) : 1
  const sh = Math.max(Math.min(shirt, vest), ax - frontW(Y) - 0.022, 0.004 - Z, BTN_Y[1] - 0.04 - Y)
  return Math.min(smin(j, sh, 0.0045), tieSdf(X, Y, Z))
}
export const BODY_BOX = { min: [-0.34, 0.8, -0.2] as [number, number, number], max: [0.34, 1.6, 0.18] as [number, number, number] }
/** 前臂袖细格区域：<0 归细格 */
export function foreSleeveRegion(s: number, X: number, Y: number, Z: number) {
  const A = ARM[s], t = foreT(s, X, Y, Z)
  const px = X - A.e[0] - A.df[0] * t * A.Lf, py = Y - A.e[1] - A.df[1] * t * A.Lf, pz = Z - A.e[2] - A.df[2] * t * A.Lf
  return Math.max((0.25 - t) * A.Lf, (t - 1.12) * A.Lf, len3(px, py, pz) - 0.075)
}
export const SLEEVE_BAND = 0.008
export function foreSleeveBox(s: number) {
  const A = ARM[s], p0 = add(A.e, scl(A.df, A.Lf * 0.17)), p1 = add(A.end, scl(A.df, 0.03)), r = 0.07
  return { min: [Math.min(p0[0], p1[0]) - r, Math.min(p0[1], p1[1]) - r, Math.min(p0[2], p1[2]) - r] as [number, number, number], max: [Math.max(p0[0], p1[0]) + r, Math.max(p0[1], p1[1]) + r, Math.max(p0[2], p1[2]) + r] as [number, number, number] }
}
/** 领口细格区域（衬衫 V 口上段 + 领带结 + 驳头缺口）：<0 归细格 */
export function collarRegion(X: number, Y: number, Z: number) { return Math.max(Math.abs(X) - 0.06 - 0.115 * sstep(1.0, 1.12, Y), Math.abs(Y - 1.215) - 0.265, 0.01 - Z) } // 宽度连续变化（台阶处粗 / 细格会都不要那一圈面 → 漏洞）
export const COLLAR_BOX = { min: [-0.195, 0.94, -0.0] as [number, number, number], max: [0.195, 1.49, 0.14] as [number, number, number] }

// ---------- 颜色 ----------
export const JK = C(0x0f0709), JK_HI = C(0x261015), JK_SEAM = C(0x0b0507), JK_STITCH = C(0x2e1a1e), SHIRT = C(0xe9e7e2), SHIRT_SH = C(0xc6c3bd), TIE = C(0x0c0b0e), SILK = C(0xe4dccb), SILK_SH = C(0xa89a86), VEST = C(0x2c0c13), VEST_HI = C(0x47141f)
export function bodyShade(X: number, Y: number, Z: number, o: Shade) {
  const ax = Math.abs(X)
  // 区域按几何判定（V 口里 = 衬衫 / 领带，边上的台阶壁归西装）：比较 SDF 大小会在台阶上得到锯齿状的颜色边
  const eV = ax - frontW(Y)
  const inV = Z > 0.005 && Y > BTN_Y[0] - 0.01 && eV < 0 && Y < 1.5
  if (inV && eV > -0.0045) {
    // V 边 4.5 mm 内：衬衫色与西装色软过渡（顶点在凹角上前后交错，硬切会出锯齿状的白刺）
    const o2 = { ...o }
    shadeInV(X, Y, Z, o2); shadeJacket(X, Y, Z, o)
    const k = sstep(-0.0045, -0.0005, eV)
    o.r = mix(o2.r, o.r, k); o.g = mix(o2.g, o.g, k); o.b = mix(o2.b, o.b, k); o.rough = mix(o2.rough, o.rough, k); o.cloth = mix(o2.cloth, o.cloth, k); o.wool = mix(o2.wool, o.wool, k)
    return
  }
  if (inV) { shadeInV(X, Y, Z, o); return }
  shadeJacket(X, Y, Z, o)
}
function shadeInV(X: number, Y: number, Z: number, o: Shade) {
  const ax = Math.abs(X)
  {
    const tie = tieSdf(X, Y, Z), sh = shirtSdf(X, Y, Z)
    const k = KNOT.c, inKnot = sdEll(X, Y, Z, k[0], k[1], k[2], 0.02, 0.021, 0.014) < 0
    if ((ax < tieW(Y) + 0.0006 && Y < 1.432 && tie < sh + 0.0012 && (!VEST_ON || frontWv(Y) > ax - 0.0005)) || inKnot) {
      // 领带：近黑缎面，领结更暗，斜纹细光
      let c = mulc(TIE, 0.9 + 0.25 * (0.5 + 0.5 * Math.sin((X + Y) * 900)))
      if (Y > KNOT.c[1] - 0.02) c = mulc(c, 0.85)
      setS(o, c, 0.34, 0, 0, 0, 1, 0); return
    }
    if (VEST_ON && ax > frontWv(Y) + 0.0006 && Y < 1.455) {
      // 马甲：深酒红毛呢（比西装亮一档），V 边一道明线
      const tw = 0.5 + 0.5 * Math.sin((X * 0.7 + Y) * 1400 + 3 * vnoise(X * 60, Y * 60, Z * 60))
      let c = mixc(mulc(VEST, 0.92 + 0.14 * fbm(X * 9, Y * 9, Z * 9, 2)), VEST_HI, 0.15 + 0.12 * tw)
      c = mixc(c, mulc(VEST, 0.5), 0.6 * gauss(ax - frontWv(Y) - 0.004, 0.0009) * sstep(VEST_V0, VEST_V0 + 0.03, Y))
      c = mulc(c, 1 - 0.3 * gauss(ax - frontW(Y), 0.01)) // 驳头边投下的暗
      setS(o, c, 0.7, 0, 0, 0, 0, 1); return
    }
    {
      let c = mulc(SHIRT, 0.96 + 0.05 * fbm(X * 30, Y * 30, Z * 30, 2))
      c = mixc(c, SHIRT_SH, 0.6 * gauss(ax - frontW(Y), 0.012) * sstep(BTN_Y[0], BTN_Y[0] + 0.05, Y)) // 驳头边投下的暗
      c = mixc(c, SHIRT_SH, 0.5 * gauss(X - 0.013, 0.0016) * sstep(1.47, 1.4, Y)) // 门襟线
      setS(o, c, 0.82, 0, 0, 0, 1, 0); return
    }
  }
}
function shadeJacket(X: number, Y: number, Z: number, o: Shade) {
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  // 衬衫袖口
  {
    const A = ARM[sx], t = foreT(sx, X, Y, Z)
    if (t > JCUFF_T - 0.01 && t < 1.08) {
      const px = X - A.e[0] - A.df[0] * t * A.Lf, py = Y - A.e[1] - A.df[1] * t * A.Lf, pz = Z - A.e[2] - A.df[2] * t * A.Lf
      const rho = len3(px, py, pz)
      if (t > JCUFF_T + 0.004 && rho < sleeveR(t) - 0.0045 || (t > JCUFF_T - 0.01 && rho < 0.0345 && t > 0.99)) {
        const inner = rho < 0.0285
        setS(o, inner ? mulc(SHIRT_SH, 0.5) : mulc(SHIRT, 0.95), 0.85, 0, 0, 0, 1, 0); return
      }
      if (t > JCUFF_T - 0.004 && rho < 0.0345) { setS(o, mulc(JK, 0.4), 0.9, 0, 0, 0, 0, 1); return } // 西装袖口里
    }
  }
  // 西装：近黑底 + 酒红斜纹光
  const tw = 0.5 + 0.5 * Math.sin((X * 0.7 + Y) * 1400 + 3 * vnoise(X * 60, Y * 60, Z * 60))
  let c = mixc(mulc(JK, 0.9 + 0.15 * fbm(X * 9, Y * 9, Z * 9, 2)), JK_HI, 0.12 + 0.2 * fbm(X * 5 + 7, Y * 4, Z * 5, 2) + 0.08 * tw)
  if (Y < JHEM(Z) + 0.005) c = mixc(c, JK_SEAM, 0.7)
  const seam = (k: number) => { c = mixc(c, JK_SEAM, clamp(k, 0, 1)) }
  const stitch = (k: number) => { c = mixc(c, JK_STITCH, clamp(k, 0, 1)) }
  { const ys = mix(1.492, 1.466, clamp((ax - 0.06) / 0.11, 0, 1)); if (ax > 0.06 && ax < 0.2) seam(0.7 * gauss(Y - ys, 0.0026) * sstep(-0.05, 0.0, Z + 0.035) * sstep(0.03, -0.0, Z - 0.03)) } // 肩线
  { const r = len3(X - sx * 0.166, (Y - 1.42) * 0.85, Z + 0.02); seam(0.55 * gauss(r - 0.06, 0.0024) * sstep(1.33, 1.37, Y)) } // 袖窿缝
  seam(0.5 * gauss(Math.abs(X) - 0.128, 0.0026) * sstep(-0.04, -0.01, Z) * sstep(1.32, 1.28, Y) * sstep(JHEM(Z), JHEM(Z) + 0.02, Y)) // 侧缝
  let rough = 0.8
  if (Z > 0) {
    const e = ax - frontW(Y), ld = lapelD(e, Y)
    if (ld < 0.005 && e > -0.006) {
      // 戗驳领：略亮的缎感、外缘内 4 mm 一道点状明线、外缘折缝、串口线
      const k = sstep(0.002, -0.002, ld)
      c = mixc(c, mulc(JK_HI, 0.95), 0.3 * k); rough = mix(rough, 0.5, k)
      stitch(0.6 * gauss(ld + 0.004, 0.0009) * (0.5 + 0.5 * Math.sign(Math.sin(Y * 1400 + e * 900))) * sstep(BTN_Y[0] + 0.03, BTN_Y[0] + 0.06, Y))
      seam(0.9 * gauss(ld, 0.0016))
      if (Y > NOTCH_Y - 0.01) seam(0.7 * gauss(Y - gorgeY(e), 0.0018) * sstep(COLLAR_W + 0.006, COLLAR_W - 0.004, e))
    }
    seam(0.8 * gauss(e, 0.0016) * sstep(BTN_Y[1] - 0.08, BTN_Y[1] - 0.06, Y)) // 前襟边
    if (Y < BTN_Y[0] + 0.01 && Y > BTN_Y[1] - 0.06) seam(0.8 * gauss(X + 0.004, 0.0016))
    // 手巾袋 + 丝巾
    {
      const px = X - POCKET.x, py = Y - POCKET.y
      seam(0.8 * gauss(Math.abs(py) - 0.0065, 0.0012) * sstep(0.03, 0.026, Math.abs(px + 0.06 * py)))
      const sq = pocketSquare(px, py)
      if (sq < 0.0008 && py > -0.004) { c = mixc(mulc(SILK, 0.9 + 0.12 * (0.5 + 0.5 * Math.sin((px - py) * 600))), SILK_SH, 0.5 * sstep(0.01, -0.002, py)); rough = 0.45 }
    }
    for (const sd of [1, -1]) { const cx = sd * 0.118; if (Math.abs(X - cx) < 0.056 && Math.abs(Y - 0.958) < 0.03) seam(0.7 * (gauss(Y - 0.94, 0.002) * sstep(0.052, 0.046, Math.abs(X - cx)) + gauss(Math.abs(X - cx) - 0.05, 0.0016) * sstep(0.024, 0.018, Math.abs(Y - 0.96)))) }
  } else {
    seam(0.6 * gauss(X, 0.0022) * sstep(1.42, 1.36, Y)) // 后中缝
    seam(0.6 * gauss(Y - 1.505, 0.003) * sstep(-0.02, -0.05, Z)) // 后领座上沿
  }
  setS(o, c, rough, 0, 0, 0, 0, 1)
}
/** 西裤 / 皮鞋：用行李员的形，颜色压得更黑 */
export function pantsShadeB(X: number, Y: number, Z: number, o: Shade) { pantsShade(X, Y, Z, o); o.r *= 0.55; o.g *= 0.52; o.b *= 0.55 }
export function shoeShadeB(s: number, X: number, Y: number, Z: number, o: Shade) { shoeShade(s, X, Y, Z, o); o.r *= 0.8; o.g *= 0.8; o.b *= 0.8; o.rough = Math.min(o.rough, 0.24) }
/** 手：苍白（偏冷、近乎无血色），指节略带灰紫 */
export function handShadeB(s: number, X: number, Y: number, Z: number, o: Shade) {
  handShade(s, X, Y, Z, o)
  const l = 0.3 * o.r + 0.55 * o.g + 0.15 * o.b
  o.r = mix(o.r, l, 0.6) * 1.0; o.g = mix(o.g, l, 0.6) * 0.995; o.b = mix(o.b, l, 0.6) * 1.025
}

// ---------- 权重 ----------
const BULGE_BH: V3 = [0, 1.3, -0.04]
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
  // 背部鼓包（真身）：背上一大片随 backBulge 骨
  const bk = tk * 0.92 * gauss(lenv(sub(p, BULGE_BH)) , 0.17) * sstep(0.0, -0.06, Z) * sstep(1.0, 1.12, Y)
  acc.add(B.backBulge, bk)
  trunkW(X, Y, acc, tk - bk)
}
export { onSurface, ARM }
void sstep
