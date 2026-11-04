// [spokes] 迎宾女郎（Entity 28）写实兔头：头 / 颈 SDF（迎宾女郎空间直接提取）、毛色 + 毛长、蒙皮权重、
// 兔耳参数曲面（每侧 3 节骨；内侧粉色带血管贴图，外侧灰白毛 + 壳层毛）、眼球（黑亮无眼白）、胡须（细三棱管）。
// 毛：头部底网格本身是「底绒」颜色，外面叠 N 层壳层（spokesMesh.furShells），壳层着色器在静止坐标里做 3D 细胞噪声毛丝，
//     不需要 UV；毛长 / 有无由顶点 aFur 控制（鼻垫 / 唇 / 眼睑短，颈部从下巴往下渐短到 0 → 人类皮肤）。
import * as THREE from 'three'
import { clamp, fbm, gauss, len3, mix, sdEll, sdRoundCone, smax, smin, sstep, vnoise } from './conciergeSdf'
import { K, warpBH, B, W4, EYE, EYE_L, EAR, EAR_T, NOSE, NOSE_L, WPAD_L, HS, headToAbs, headToLocal, eyeCL, earBaseL, add, cross, dot, nrm, scl, sub, lenv, eyeC, eyeDir, earBase, earDir, earPoint, type V3 } from './spokesRig'
import type { Shade } from './conciergeHead'
import { SKIN_HEX, jacketCore, NECK_HOLE } from './spokesBody'

const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
const mixc = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mulc = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]

// ======================================================================
// 头 + 颈 SDF（迎宾女郎空间）
// ======================================================================
/** 眼局部坐标系：n 朝外、u 朝上、h 水平 */
const EF: Record<number, { n: V3; u: V3; h: V3 }> = {}
for (const s of [1, -1]) { const n = eyeDir(s), h = nrm(cross([0, 1, 0], n)), u = cross(n, h); EF[s] = { n, u, h } }
/** 眼局部坐标（输入为头局部坐标） */
const toEye = (s: number, x: number, y: number, z: number): V3 => { const c = eyeCL(s), F = EF[s], p: V3 = [x - c[0], y - c[1], z - c[2]]; return [dot(p, F.h), dot(p, F.u), dot(p, F.n)] }
function neckSdf(x: number, y: number, z: number) {
  // 人类颈（女性，略扁）+ 兔喉：下巴下方的喉部毛团往下收进人颈
  let d = sdRoundCone(x * 1.08, y, z, 0, 1.31, -0.017, 0, 1.49, -0.019, 0.05, 0.048)
  d = smin(d, sdRoundCone(x, y, z, 0, 1.47, -0.018, 0, 1.57, -0.016, 0.05, 0.05), 0.02)
  return d
}
export function headSdf(X: number, Y: number, Z: number) {
  const [x, y, z] = headToLocal([X, Y, Z])
  let d = headSdfL(x, y, z) * HS
  // 颈背收进西装后领：领座（躯干 warp 后）外表面 + 7 mm 以内的头部挖掉 → 颈背毛从领口里长出来、在领上沿之上才鼓向枕部，不穿领
  if (Y > COLLAR_TUCK.y0 && Y < COLLAR_TUCK.y1 && Z < -0.02 && Math.abs(X) < 0.1 && d < 0.014) {
    if (Y !== tuckY) { tuckY = Y; const yb = Y / K; tuckSx = warpBH([1, yb, 0], 'trunk')[0] / K; tuckSz = -warpBH([0, yb, -1], 'trunk')[2] / K }
    const yb = Y / K, sx = tuckSx, sz = tuckSz
    const xb = X / (sx * K), zb = Z / (sz * K)
    // 只要后领这一圈：西装主体（含后领座）减去领口（与 jacketSdf 同一刀），不算袖子 / 驳头（快）
    const j = smax(jacketCore(xb, yb, zb), -(Math.max(Math.hypot(xb - NECK_HOLE.c[0], zb - NECK_HOLE.c[2]) - NECK_HOLE.r - 0.006, 1.42 - yb)), 0.008) * K * Math.min(sx, sz)
    // 只挖领座外侧（领口内圈以外）：领口里面的人颈不动，不留缝
    const rin = Math.hypot(X / sx, (Z + 0.018 * sz * K) / sz) / K - COLLAR_TUCK.rIn
    d = smax(d, -Math.max(j - COLLAR_TUCK.m, -rin), 0.004)
  }
  return d
}
/** 西装后领座让位区（迎宾女郎空间 y 范围、外扩余量、领口内圈半径（躯干 warp 前）） */
let tuckY = NaN, tuckSx = 1, tuckSz = 1
const COLLAR_TUCK = { y0: 1.35, y1: 1.45, m: 0.007, rIn: 0.068 }
/** 头部主体形状参数（头局部坐标：[y, z]、半径 [x, y, z]、倾角 = 绕 x 轴把长轴往前下压） */
export const HD = {
  cr: [1.664, -0.03], crR: [0.067, 0.069, 0.066],
  fh: [1.662, 0.032], fhR: [0.056, 0.056, 0.08], fhA: 0.34,
  mz: [1.594, 0.09], mzR: [0.043, 0.052, 0.036], mzA: 0.05,
  ck: [0.04, 1.586, 0.042], ckR: [0.05, 0.058, 0.062],
  chin: [1.561, 0.092], jaw: [1.58, -0.006], jawR: [0.057, 0.052, 0.064],
  // 枕部（耳根之后的后脑勺）：真家兔耳根在头长 ~60% 处，耳后还有一大块圆隆枕骨，从背面看宽圆、把两侧耳根包住
  // E28 v3：后脑缩小（不再膨大成灯泡），整体呈上窄下宽：耳根间窄，往下到腮 / 下颌支后缘最宽
  oc: [1.668, -0.078], ocR: [0.054, 0.054, 0.056], ocA: -0.25,
  // 下颌支后缘 / 腮后（左右一对）+ 枕下项部：补后脑以下、颈背以上的头骨体积，侧面从头顶到颈背一条连续圆弧
  rm: [0.042, 1.59, -0.056], rmR: [0.044, 0.052, 0.05],
  tpK: 0.16,
  nu: [1.6, -0.092], nuR: [0.048, 0.062, 0.048], nuA: -0.35,
  // 颈背：枕部往下圆滑收进人颈（颈背毛压在西装领上方，不穿领）
  np0: [1.555, -0.04], np1: [1.655, -0.088], npR: [0.04, 0.054], npX: 1.0, npK: 0.03,
}
/** 嘴（Y 形）：人中竖沟 + 两道唇裂，返回 0..1 沟深 */
const MOUTH_Y = NOSE_L[1] - 0.021
const mouthArm = (ax: number) => MOUTH_Y - 0.7 * ax - 22 * ax * ax
function mouthK(ax: number, y: number) {
  const ph = gauss(ax, 0.0015) * sstep(MOUTH_Y - 0.001, MOUTH_Y + 0.003, y) * sstep(NOSE_L[1] - 0.006, NOSE_L[1] - 0.01, y)
  const arm = gauss(y - mouthArm(ax), 0.0014) * sstep(0.017, 0.011, ax) * sstep(MOUTH_Y + 0.002, MOUTH_Y - 0.0005, y)
  return Math.max(ph, arm)
}
/** 鼻孔：两道向外上斜的逗号形缝 */
function nostrilK(ax: number, y: number) {
  const t = clamp((ax - 0.002) / 0.01, 0, 1), yc = NOSE_L[1] - 0.003 + 0.008 * t
  return gauss(y - yc, 0.0011) * sstep(0.0, 0.003, ax) * sstep(0.014, 0.01, ax)
}
/** 绕 x 轴倾斜的椭球（a > 0：长轴 z 往前下压） */
function sdEllT(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, a: number) {
  const py = y - cy, pz = z - cz, c = Math.cos(a), s = Math.sin(a)
  return sdEll(x - cx, py * c + pz * s, -py * s + pz * c, 0, 0, 0, rx, ry, rz)
}
function headSdfL(x: number, y: number, z: number) {
  if (y < 1.3 || y > 1.76 || Math.abs(x) > 0.13 || z < -0.17 || z > 0.2) return Math.max(1.3 - y, y - 1.76, Math.abs(x) - 0.13, -0.17 - z, z - 0.2) + 0.02
  const ax = Math.abs(x), sx = x >= 0 ? 1 : -1
  // 真家兔侧面：头像竖放的蛋（后脑圆、额 → 鼻梁一条平缓凸弧 = 罗马鼻），吻部短而钝、鼻端圆润往下收，
  // 两颊 / 腮饱满圆鼓（兔脸最宽处在眼下偏后），下巴短小缩在鼻下。
  // 后上方收窄（背面上窄下宽）：颅 / 枕在耳根以上、脸以后横向压窄
  const xt = x * (1 + HD.tpK * sstep(1.64, 1.72, y) * sstep(-0.01, -0.07, z))
  let d = sdEll(xt, y, z, 0, HD.cr[0], HD.cr[1], HD.crR[0], HD.crR[1], HD.crR[2]) // 颅（圆，略竖）
  d = smin(d, sdEllT(xt, y, z, 0, HD.oc[0], HD.oc[1], HD.ocR[0], HD.ocR[1], HD.ocR[2], HD.ocA), 0.05) // 枕部（后脑勺圆隆，收小）
  d = smin(d, sdEll(ax, y, z, HD.rm[0], HD.rm[1], HD.rm[2], HD.rmR[0], HD.rmR[1], HD.rmR[2]), 0.04) // 下颌支后缘 / 腮后（背面看下宽）
  d = smin(d, sdEllT(x, y, z, 0, HD.nu[0], HD.nu[1], HD.nuR[0], HD.nuR[1], HD.nuR[2], HD.nuA), 0.045) // 枕下项部（后脑 → 颈背连续圆弧）
  d = smin(d, sdEllT(x, y, z, 0, HD.fh[0], HD.fh[1], HD.fhR[0], HD.fhR[1], HD.fhR[2], HD.fhA), 0.04) // 额 → 鼻梁（斜向前下的长椭球：罗马鼻弧）
  d = smin(d, sdEllT(x, y, z, 0, HD.mz[0], HD.mz[1], HD.mzR[0], HD.mzR[1], HD.mzR[2], HD.mzA), 0.03) // 吻部（短、高、钝）
  d = smin(d, sdEll(x, y, z, 0, NOSE_L[1] - 0.003, NOSE_L[2] - 0.016, 0.021, 0.02, 0.017), 0.014) // 鼻端（圆润，往下收）
  d = smin(d, sdEll(ax, y, z, HD.ck[0], HD.ck[1], HD.ck[2], HD.ckR[0], HD.ckR[1], HD.ckR[2]), 0.035) // 颊 / 腮（饱满圆鼓）
  d = smin(d, sdEll(ax, y, z, WPAD_L[0], WPAD_L[1], WPAD_L[2], 0.025, 0.025, 0.022), 0.016) // 胡须垫（鼓）
  d = smin(d, sdEll(x, y, z, 0, HD.chin[0], HD.chin[1], 0.02, 0.014, 0.02), 0.014) // 下巴（短小）
  d = smin(d, sdEll(x, y, z, 0, HD.jaw[0], HD.jaw[1], HD.jawR[0], HD.jawR[1], HD.jawR[2]), 0.034) // 喉 / 下颌
  d = smin(d, sdRoundCone(x * HD.npX, y, z, 0, HD.np0[0], HD.np0[1], 0, HD.np1[0], HD.np1[1], HD.npR[0], HD.npR[1]), HD.npK) // 颈背：从领口斜向后上接到枕部（毛顺滑过渡，不是一个球扣在颈上）
  d = smin(d, neckSdf(x, y, z), 0.03)
  // 耳根两团（耳朵从这里插进去）
  {
    // 耳根毛套：沿耳朵自身坐标系（长 D / 宽 Lt / 厚 O）的扁椭球，把耳根整圈包住（头部壳层毛在这里加长）→ 侧后方看不出插接
    const b = earBaseL(sx), F = (EARF[sx] ??= earFrame(sx)), c = add(b, scl(F.D, 0.014)), p = sub([x, y, z], c)
    d = smin(d, sdEll(dot(p, F.Lt), dot(p, F.D), dot(p, F.O), 0, 0, 0, 0.036, 0.034, 0.02), 0.022)
  }
  // 眼睑：眼周一圈毛肉（沿眼朝向扁），中间开口露眼球
  {
    const [h, u, n] = toEye(sx, x, y, z), R = EYE_L.r
    const lid = sdEll(h, u, n, 0, 0.0008, -0.004, R + 0.0062, R + 0.0052, R * 0.82)
    d = smin(d, lid, 0.008)
    d = smax(d, -sdEll(h, u, n, 0, 0.0006, 0.006, R * 0.93, R * 0.82, R * 0.9), 0.0025)
    // 眉骨（眼上方一道略鼓）
    d = smin(d, sdEll(h, u, n, -0.002, R * 0.95, -0.009, R * 1.2, R * 0.55, R * 0.9), 0.008)
  }
  // 人中（鼻下到唇的竖沟）+ 上唇分瓣 + 口裂
  // 兔嘴：鼻下一道人中竖沟，到 MOUTH_Y 分成两道向外下弯的唇裂（Y 形）
  if (z > NOSE_L[2] - 0.04 && y > NOSE_L[1] - 0.05 && y < NOSE_L[1]) d += 0.0024 * mouthK(ax, y)
  // 鼻孔（两道向外上斜的缝）
  if (z > NOSE_L[2] - 0.016 && y > NOSE_L[1] - 0.012 && y < NOSE_L[1] + 0.014) d += 0.0016 * nostrilK(ax, y)
  d += 0.0004 * vnoise(x * 300, y * 300, z * 300)
  return d
}
export const HEAD_BOX = { min: [-0.13, 1.3, -0.2] as [number, number, number], max: [0.13, 1.72, 0.19] as [number, number, number] }
export const headKeep = (_x: number, y: number) => y > 1.372

// ---------- 毛色 + 毛长 ----------
const FUR_LT = C(0xdfdbd5), FUR_MID = C(0xbab3ab), FUR_DK = C(0x8e857d), FUR_WH = C(0xf0ede8), RING_DK = C(0x2e2826), NOSE_C = C(0xc39d97), NOSTRIL = C(0x6a4342), MOUTH = C(0x5a3a36), SKIN = C(SKIN_HEX)
/** 颈部毛 → 皮肤过渡线（带噪声的不规则边，下巴下方前面高、后颈低） */
export const neckFurLine = (x: number, y: number, z: number) => {
  const base = 1.502 - 0.022 * sstep(0.0, -0.05, z) + 0.006 * Math.abs(x) / 0.05
  return y - base - 0.007 * fbm(x * 60, y * 20, z * 60, 2)
}
export function headShade(X: number, Y: number, Z: number, o: Shade) {
  const [x, y, z] = headToLocal([X, Y, Z])
  const ax = Math.abs(x), sx = x >= 0 ? 1 : -1
  const n1 = fbm(x * 25, y * 25, z * 25, 3), n2 = vnoise(x * 90, y * 90, z * 90)
  let c = mixc(FUR_LT, FUR_MID, clamp(0.35 + 0.5 * n1, 0, 1))
  let fur = 1, rough = 0.85
  // 头顶 / 后脑 / 颈背偏深灰褐
  // 枕部 / 颈背：随离脸越远越深，一整片渐变（不分上下两截色块）
  c = mixc(c, FUR_DK, clamp(0.5 * sstep(1.66, 1.72, y) * sstep(0.06, -0.02, z) + 0.42 * sstep(-0.03, -0.13, z) * sstep(1.47, 1.56, y), 0, 0.6))
  // 鼻梁一道深色
  c = mixc(c, FUR_DK, 0.45 * gauss(ax, 0.018) * sstep(0.04, 0.07, z) * sstep(NOSE_L[1] + 0.006, NOSE_L[1] + 0.024, y) * sstep(NOSE_L[2] - 0.002, NOSE_L[2] - 0.016, z))
  // 颊 / 吻部下方 / 胡须垫偏白
  c = mixc(c, FUR_WH, 0.55 * sstep(1.61, 1.585, y) * sstep(0.02, 0.07, z) + 0.6 * sstep(0.1, 0.12, z) * sstep(1.597, 1.586, y))
  // 下巴 / 喉前白
  c = mixc(c, FUR_WH, 0.75 * sstep(1.585, 1.56, y) * sstep(-0.02, 0.03, z))
  // 眼周：外圈一道浅色眼圈 + 贴着眼球的深色眼睑边
  {
    const [h, u, n] = toEye(sx, x, y, z), r = len3(h, u * 1.1, 0), EYEr = EYE_L.r
    if (n > -0.012) {
      c = mixc(c, FUR_WH, 0.55 * gauss(r - EYEr - 0.009, 0.0045))
      const rim = sstep(EYEr + 0.0035, EYEr + 0.0008, r)
      c = mixc(c, RING_DK, rim); fur = Math.min(fur, mix(1, 0.08, rim)); if (rim > 0.5) rough = 0.5
      fur = Math.min(fur, mix(1, 0.45, gauss(r - EYEr - 0.004, 0.004)))
    }
  }
  // 耳根后面一圈略深；耳根毛加长（壳层毛把耳朵插进头里的接缝包住）
  let earRoot = 0
  { const b = earBaseL(sx); earRoot = gauss(len3(x - b[0], y - b[1] - 0.006, z - b[2]), 0.03); c = mixc(c, FUR_DK, 0.3 * gauss(len3(x - b[0], y - b[1], z - b[2] + 0.01), 0.025)) }
  // 鼻：粉色裸皮（倒三角），鼻孔深
  {
    const dx = ax, dy = y - NOSE_L[1], inNose = z > NOSE_L[2] - 0.018 && dy > -0.01 && dy < 0.014 && dx < 0.011 + 0.45 * Math.max(0, dy)
    if (inNose) {
      const k = sstep(NOSE_L[2] - 0.016, NOSE_L[2] - 0.007, z) * sstep(-0.01, -0.006, dy)
      c = mixc(c, mulc(NOSE_C, 0.92 + 0.12 * n2), k); fur = Math.min(fur, 1 - k); rough = mix(rough, 0.35, k)
      c = mixc(c, NOSTRIL, k * 0.85 * nostrilK(ax, y))
    }
  }
  // 人中 / 口裂：粉灰的短毛皮
  if (z > NOSE_L[2] - 0.04 && y > NOSE_L[1] - 0.05 && y < NOSE_L[1] - 0.004) {
    const k = clamp(1.15 * mouthK(ax, y), 0, 1)
    c = mixc(c, MOUTH, k * 0.85); fur = Math.min(fur, 1 - 0.7 * k)
  }
  // 吻部 / 鼻周毛短
  fur *= mix(1, 0.55, sstep(0.075, 0.125, z))
  // 颈：下巴往下渐短到人类皮肤
  const nl = neckFurLine(x, y, z)
  const furK = sstep(-0.004, 0.022, nl)
  if (furK < 1) {
    const sk = mulc(SKIN, 0.97 + 0.04 * n1)
    c = mixc(sk, c, sstep(-0.006, 0.01, nl)); fur *= furK
    rough = mix(0.55, rough, furK)
  }
  // 颈背靠领口一段毛缩短变密（领口处不再长短参差、毛边乱翘）
  fur *= mix(1, mix(0.22, 1, sstep(0.0, 0.05, nl)), sstep(0.0, -0.03, z))
  fur *= 1 + 0.7 * earRoot
  o.r = c[0]; o.g = c[1]; o.b = c[2]; o.rough = rough; o.metal = 0; o.fur = fur; o.skin = 1 - fur; o.cloth = 0; o.wool = 0; o.fx = 0; o.fy = 0; o.fz = 0
}
/** 梳毛方向（切平面内）：从鼻尖往后、颊往后下、颈往下 */
export function furComb(p: V3, n: V3): V3 {
  const [x, y, z] = headToLocal(p)
  let g: V3 = [x * 1.2, -0.3 - 1.5 * sstep(1.6, 1.52, y), -1]
  if (y < 1.56) g = [x * 0.6, -1, -0.3 * sstep(0.0, 0.05, z)]
  const t = sub(g, scl(n, dot(g, n)))
  const L = lenv(t)
  return L < 1e-6 ? [0, -1, 0] : scl(t, 1 / L)
}
// ---------- 权重 ----------
export function headWeights(X: number, Y: number, Z: number, acc: W4) {
  const [x, y, z] = headToLocal([X, Y, Z])
  const hk = sstep(1.43, 1.52, y), nk = sstep(1.33, 1.4, y)
  const p: V3 = [x, y, z]
  // 鼻 / 胡须垫 / 下巴
  const noseK = hk * gauss(len3(x, y - NOSE_L[1] + 0.002, z - NOSE_L[2] + 0.006), 0.016)
  const padK = hk * gauss(len3(Math.abs(x) - WPAD_L[0], y - WPAD_L[1], z - WPAD_L[2]), 0.016) * (1 - noseK)
  const jawK = hk * gauss(len3(x, y - HD.chin[0], z - HD.chin[1]), 0.02) * (1 - noseK - padK)
  acc.add(B.nose, noseK); acc.add(B[x >= 0 ? 'whiskerL' : 'whiskerR'], padK); acc.add(B.jaw, jawK)
  const rest = 1 - noseK - padK - jawK
  acc.add(B.head, rest * hk); acc.add(B.neck, rest * (1 - hk) * nk); acc.add(B.chest, rest * (1 - hk) * (1 - nk))
  void p
}

// ======================================================================
// 兔耳（参数曲面，每侧一张；内侧 UV 给血管贴图）
// ======================================================================
const EARF: Record<number, ReturnType<typeof earFrame>> = {}
function earFrame(s: number) {
  const D = earDir(s), O0: V3 = [EAR.open[0] * s, EAR.open[1], EAR.open[2]]
  const O = nrm(sub(O0, scl(D, dot(O0, D)))), Lt = nrm(cross(D, O))
  return { D, O, Lt }
}
/** 耳半宽：根部收窄、中段最宽（家兔耳像一片宽叶）、耳尖圆钝 */
const earW = (t: number) => EAR.w * (0.56 + 0.44 * Math.sin(Math.PI * 0.5 * Math.min(1, t / 0.5))) * Math.max(0.08, Math.pow(Math.max(0, 1 - t ** 3.6), 0.5))
/** 耳中面上一点（t 沿耳长、v 横向 −1..1）+ 内侧法线 */
function earMid(s: number, t: number, v: number) {
  const { D, O, Lt } = earFrame(s)
  const w = earW(t)
  const cup = 0.013 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) * (1 - v * v)
  const back = 0.034 * t * t // 耳尖向后倒
  const roll = 0.004 * v ** 4 * sstep(0.1, 0.4, t) // 耳缘向前微卷
  const p = add(add(add(earBase(s), scl(D, EAR.len * t)), scl(Lt, w * v * s)), scl(O, -cup - back + roll))
  return p
}
export interface EarGeo { inner: THREE.BufferGeometry; outer: THREE.BufferGeometry }
/** 兔耳网格：inner（内侧凹面，UV = 血管贴图）、outer（外侧凸面 + 耳缘，毛色顶点色）。nt × nv 分段 */
export function buildEarGeometry(lod: number, shadeOuter: (p: V3, t: number, v: number) => number[]): EarGeo {
  const nt = lod >= 2 ? 8 : lod ? 14 : 26, nv = lod >= 2 ? 4 : lod ? 8 : 14
  const mk = () => ({ pos: [] as number[], nrm: [] as number[], uv: [] as number[], col: [] as number[], si: [] as number[], sw: [] as number[], idx: [] as number[], aux: [] as number[] })
  const inner = mk(), outer = mk()
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', bones = [0, 1, 2].map((k) => B[`ear${S}${k}`])
    const { O } = earFrame(s)
    const thick = (t: number, v: number) => (0.0042 * (1 - 0.55 * t) + 0.0012) * Math.sqrt(Math.max(0.04, 1 - v * v)) + 0.0045 * (1 - v * v) * (1 - t)
    const P = (t: number, v: number, side: number): V3 => { const m = earMid(s, t, v); return side > 0 ? m : add(m, scl(O, -thick(t, v))) }
    const wts = (t: number): [number[], number[]] => {
      const T = EAR_T
      if (t <= T[1]) { const k = sstep(T[1] - 0.1, T[1] + 0.06, t); return [[bones[0], bones[1]], [1 - k, k]] }
      const k = sstep(T[2] - 0.1, T[2] + 0.06, t), k1 = sstep(T[1] - 0.1, T[1] + 0.06, t)
      return [[bones[0], bones[1], bones[2]], [1 - k1, k1 * (1 - k), k]]
    }
    const grid = (dst: ReturnType<typeof mk>, side: number) => {
      const base = dst.pos.length / 3
      const pts: V3[][] = []
      for (let i = 0; i <= nt; i++) { pts.push([]); const t = i / nt; for (let j = 0; j <= nv; j++) { const v = -1 + 2 * j / nv; pts[i].push(P(t, v * 0.999, side)) } }
      for (let i = 0; i <= nt; i++) for (let j = 0; j <= nv; j++) {
        const a = pts[Math.min(nt, i + 1)][j], b = pts[Math.max(0, i - 1)][j], c = pts[i][Math.min(nv, j + 1)], d = pts[i][Math.max(0, j - 1)]
        let n = nrm(cross(sub(c, d), sub(a, b)))
        if (dot(n, O) * side < 0) n = scl(n, -1)
        const p = pts[i][j], t = i / nt, v = -1 + 2 * j / nv
        dst.pos.push(...p); dst.nrm.push(...n); dst.uv.push(0.5 + 0.5 * v * s, t)
        const col = side > 0 ? [1, 1, 1] : shadeOuter(p, t, v)
        dst.col.push(col[0], col[1], col[2])
        dst.aux.push(t, v)
        const [bi, bw] = wts(t); dst.si.push(bi[0], bi[1] ?? 0, bi[2] ?? 0, 0); dst.sw.push(bw[0], bw[1] ?? 0, bw[2] ?? 0, 0)
      }
      for (let i = 0; i < nt; i++) for (let j = 0; j < nv; j++) {
        const a = base + i * (nv + 1) + j, b = a + nv + 1
        const flip = (side > 0) === (s > 0)
        if (!flip) dst.idx.push(a, b, a + 1, b, b + 1, a + 1); else dst.idx.push(a, a + 1, b, b, a + 1, b + 1)
      }
      return pts
    }
    const pi = grid(inner, 1), po = grid(outer, -1)
    // 耳缘（两侧 + 耳尖）：内外两圈连起来，归 outer（毛色）
    const rim = (ij: [number, number][]) => {
      for (let k = 0; k < ij.length - 1; k++) {
        const [i0, j0] = ij[k], [i1, j1] = ij[k + 1]
        const q = [pi[i0][j0], pi[i1][j1], po[i1][j1], po[i0][j0]]
        let en = nrm(cross(sub(q[1], q[0]), sub(q[3], q[0])))
        const mid = scl(add(add(q[0], q[1]), add(q[2], q[3])), 0.25), ctr = earMid(s, Math.max(0, i0 / nt - 0.08), 0) // 往耳根方向退一点取中心：耳尖那排缘面的外向不再随机翻（之前耳尖一个暗点）
        if (dot(en, sub(mid, ctr)) < 0) en = scl(en, -1)
        const base = outer.pos.length / 3
        for (let m = 0; m < 4; m++) {
          const [ii, jj] = m === 0 || m === 3 ? [i0, j0] : [i1, j1], t = ii / nt, v = -1 + 2 * jj / nv
          outer.pos.push(...q[m]); outer.nrm.push(...en); outer.uv.push(0.5 + 0.5 * v * s, t)
          const col = shadeOuter(q[m], t, v); outer.col.push(col[0] * 1.05, col[1] * 1.05, col[2] * 1.05); outer.aux.push(t, v)
          const [bi, bw] = wts(t); outer.si.push(bi[0], bi[1] ?? 0, bi[2] ?? 0, 0); outer.sw.push(bw[0], bw[1] ?? 0, bw[2] ?? 0, 0)
        }
        // 朝外：按外法线选环绕方向
        const nn = nrm(cross(sub(q[1], q[0]), sub(q[3], q[0])))
        if (dot(nn, en) > 0) outer.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); else outer.idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
      }
    }
    const e1: [number, number][] = [], e2: [number, number][] = [], e3: [number, number][] = []
    for (let i = 0; i <= nt; i++) { e1.push([i, 0]); e2.push([nt - i, nv]) }
    for (let j = 0; j <= nv; j++) e3.push([nt, j])
    rim(e1); rim(e3); rim(e2)
  }
  const toG = (c: ReturnType<typeof mk>) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(c.nrm, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(c.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 3))
    g.setAttribute('aEar', new THREE.Float32BufferAttribute(c.aux, 2))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(c.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(c.sw, 4))
    g.setIndex(c.idx); g.computeBoundingSphere()
    return g
  }
  return { inner: toG(inner), outer: toG(outer) }
}
/** 耳外侧毛色（sRGB 0..1）：灰白，耳尖 / 耳缘一圈更深 */
const EAR_EDGE = C(0x5e5752)
export function earOuterColor(p: V3, t: number, v: number) {
  const n = fbm(p[0] * 30, p[1] * 30, p[2] * 30, 2)
  let c = mixc(FUR_LT, FUR_MID, clamp(0.45 + 0.5 * n, 0, 1))
  // 耳缘一圈深灰毛边（附图）；耳尖只略深一点（不再是一个暗点）
  c = mixc(c, FUR_DK, 0.22 * sstep(0.8, 1.0, t))
  c = mixc(c, EAR_EDGE, 0.75 * sstep(0.72, 0.97, Math.abs(v)) * sstep(0.08, 0.25, t) * sstep(0.97, 0.86, t)) // 耳尖处收掉（几何收拢处不聚成暗点）
  return c
}
let earTex: THREE.CanvasTexture | null = null
/** 耳内贴图：粉色半透明感 + 中央主血管分叉 + 耳缘白色细毛 + 外圈灰白毛边 */
export function earInnerTexture() {
  if (earTex || typeof document === 'undefined') return earTex
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!
  let seed = 28; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // 底：中间粉红（薄、透光），往边缘偏肉粉，耳根偏暗
  const gr = g.createLinearGradient(0, 0, W, 0)
  // 偏灰米 / 淡肉色（附图耳内不是粉红）：中间略暖，往边缘偏灰米
  gr.addColorStop(0, '#bfb7b0'); gr.addColorStop(0.2, '#c9b9af'); gr.addColorStop(0.5, '#d0b8ac'); gr.addColorStop(0.8, '#c9b9af'); gr.addColorStop(1, '#bfb7b0')
  g.fillStyle = gr; g.fillRect(0, 0, W, H)
  const gv = g.createLinearGradient(0, 0, 0, H); gv.addColorStop(0, 'rgba(110,85,75,0.45)'); gv.addColorStop(0.15, 'rgba(110,85,75,0)'); gv.addColorStop(0.85, 'rgba(225,215,205,0)'); gv.addColorStop(1, 'rgba(205,198,190,0.35)')
  g.fillStyle = gv; g.fillRect(0, 0, W, H)
  // 皮肤斑驳
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '245,235,225' : '150,110,100'},${0.03 + 0.04 * R()})`; g.beginPath(); g.arc(R() * W, R() * H, 2 + R() * 6, 0, Math.PI * 2); g.fill() }
  // 血管：中央主干从耳根往上，沿途向两侧分叉，越往上越细
  const vessel = (x: number, y: number, ang: number, w: number, len: number, depth: number) => {
    let px = x, py = y, a = ang
    g.lineCap = 'round'
    for (let k = 0; k < len; k++) {
      const nx = px + Math.cos(a) * 6, ny = py + Math.sin(a) * 6
      const ww = w * (1 - k / len * 0.7)
      g.strokeStyle = `rgba(160,70,70,${0.26 * (depth ? 0.75 : 1)})`; g.lineWidth = ww * 0.8; g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke()
      g.strokeStyle = `rgba(200,120,110,0.14)`; g.lineWidth = ww * 2.2; g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke()
      px = nx; py = ny; a += (R() - 0.5) * 0.35
      if (depth < 2 && R() < 0.16) vessel(px, py, a + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.5), ww * 0.6, Math.floor(len * 0.45), depth + 1)
      if (px < 10 || px > W - 10 || py < 4 || py > H - 4) break
    }
  }
  // 贴图 v（y）= 0 在耳根：画布 y 0 = 耳根
  vessel(W * 0.5, 10, Math.PI / 2, 4.2, 80, 0)
  vessel(W * 0.36, 30, Math.PI / 2 + 0.12, 2.4, 60, 1)
  vessel(W * 0.64, 30, Math.PI / 2 - 0.12, 2.4, 60, 1)
  // 耳缘：最外一圈深灰毛边（附图），往里一道灰白细毛（向内渐少）
  for (const sd of [0, 1]) { const ge = g.createLinearGradient(sd ? W : 0, 0, sd ? W - W * 0.09 : W * 0.09, 0); ge.addColorStop(0, 'rgba(78,72,68,0.95)'); ge.addColorStop(0.55, 'rgba(110,102,96,0.55)'); ge.addColorStop(1, 'rgba(120,110,104,0)'); g.fillStyle = ge; g.fillRect(sd ? W - W * 0.09 : 0, 0, W * 0.09, H * 0.86) }
  { // 耳尖段：毛边渐淡（贴图横向在耳尖被压缩，深色边会聚成一个暗点）
    for (let k = 0; k < 14; k++) { const y0 = H * (0.86 + 0.01 * k), a = 0.95 * (1 - k / 14); for (const sd of [0, 1]) { const ge = g.createLinearGradient(sd ? W : 0, 0, sd ? W - W * 0.09 : W * 0.09, 0); ge.addColorStop(0, `rgba(78,72,68,${a})`); ge.addColorStop(1, 'rgba(120,110,104,0)'); g.fillStyle = ge; g.fillRect(sd ? W - W * 0.09 : 0, y0, W * 0.09, H * 0.01 + 1) } }
  }
  for (let i = 0; i < 2600; i++) {
    const side = R() < 0.5 ? 0 : 1, y = R() * H, e = W * 0.03 + Math.pow(R(), 2.2) * W * 0.18
    const x = side ? W - e : e, len = 6 + R() * 10, ang = (side ? Math.PI : 0) + (R() - 0.5) * 0.8 - 0.6 * (side ? -1 : 1)
    const dk = e < W * 0.07 && y < H * 0.88, tone = dk ? 85 + R() * 40 : 185 + R() * 55
    g.strokeStyle = `rgba(${tone},${tone - 4},${tone - 8},${0.45 + 0.4 * (1 - e / (W * 0.21))})`; g.lineWidth = 1 + R()
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke()
  }
  // 耳尖：浅灰毛（淡，不成暗点）
  const gt = g.createLinearGradient(0, H * 0.88, 0, H); gt.addColorStop(0, 'rgba(150,142,136,0)'); gt.addColorStop(1, 'rgba(140,132,126,0.5)')
  g.fillStyle = gt; g.fillRect(0, H * 0.88, W, H * 0.12)
  // 中部稀疏白色细毛（顺耳长方向）
  for (let i = 0; i < 500; i++) { const x = W * (0.2 + 0.6 * R()), y = H * (0.1 + 0.8 * R()); g.strokeStyle = 'rgba(250,240,235,0.3)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 4, y + 6 + R() * 6); g.stroke() }
  earTex = new THREE.CanvasTexture(c); earTex.colorSpace = THREE.SRGBColorSpace; earTex.anisotropy = 4; earTex.flipY = false
  return earTex
}

// ======================================================================
// 眼球（黑亮无眼白：深褐近黑虹膜 + 更黑的瞳孔 + 角膜高光）
// ======================================================================
export function buildEyeGeometry(lod: number) {
  const g = new THREE.SphereGeometry(EYE.r, lod >= 2 ? 10 : lod ? 14 : 24, lod >= 2 ? 6 : lod ? 10 : 16)
  g.rotateX(Math.PI / 2)
  const p = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + 0.5 * p.getX(i) / EYE.r, 0.5 + 0.5 * p.getY(i) / EYE.r)
  return g
}
export function eyeQuat(s: number) {
  const F = EF[s]
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...F.h).multiplyScalar(-1), new THREE.Vector3(...F.u), new THREE.Vector3(...F.n))
  return new THREE.Quaternion().setFromRotationMatrix(m)
}
let eyeTex: THREE.CanvasTexture | null = null
export function eyeTexture() {
  if (eyeTex || typeof document === 'undefined') return eyeTex
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!
  g.fillStyle = '#070505'; g.fillRect(0, 0, S, S)
  const cx = S / 2, cy = S / 2, R = S * 0.42
  const gr = g.createRadialGradient(cx, cy, R * 0.3, cx, cy, R)
  gr.addColorStop(0, '#0a0706'); gr.addColorStop(0.55, '#1c120d'); gr.addColorStop(0.85, '#2a1b13'); gr.addColorStop(1, '#0c0807')
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill()
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 120; k++) { const a = rnd() * Math.PI * 2, r0 = R * (0.4 + 0.2 * rnd()), r1 = R * (0.8 + 0.2 * rnd()); g.strokeStyle = 'rgba(70,45,30,0.25)'; g.lineWidth = 1 + rnd(); g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke() }
  g.fillStyle = '#020101'; g.beginPath(); g.arc(cx, cy, R * 0.42, 0, Math.PI * 2); g.fill()
  // 角膜反射：一块窗形高光 + 一个小点（湿润感）
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(cx - R * 0.32, cy - R * 0.36, R * 0.13, R * 0.09, -0.5, 0, Math.PI * 2); g.fill()
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(cx + R * 0.3, cy + R * 0.3, R * 0.05, 0, Math.PI * 2); g.fill()
  g.fillStyle = 'rgba(160,170,190,0.12)'; g.beginPath(); g.ellipse(cx + R * 0.1, cy + R * 0.45, R * 0.5, R * 0.18, 0, 0, Math.PI * 2); g.fill()
  eyeTex = new THREE.CanvasTexture(c); eyeTex.colorSpace = THREE.SRGBColorSpace; eyeTex.anisotropy = 4
  return eyeTex
}

// ======================================================================
// 胡须：胡须垫上 4 排 + 眉上 3 根，每根一条细三棱管（下垂弧线，根粗尖细）
// ======================================================================
/** 投影到头部表面（沿梯度二分） */
export function onHead(p: V3): V3 {
  let q = p
  for (let k = 0; k < 6; k++) {
    const d = headSdf(q[0], q[1], q[2]), e = 0.0008
    const gx = headSdf(q[0] + e, q[1], q[2]) - headSdf(q[0] - e, q[1], q[2]), gy = headSdf(q[0], q[1] + e, q[2]) - headSdf(q[0], q[1] - e, q[2]), gz = headSdf(q[0], q[1], q[2] + e) - headSdf(q[0], q[1], q[2] - e)
    const g = nrm([gx, gy, gz]); q = sub(q, scl(g, d))
  }
  return q
}
export function buildWhiskerGeometry(lod: number) {
  const pos: number[] = [], nrmA: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = []
  let seed = 77; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const segs = lod >= 2 ? 3 : lod ? 5 : 7, sides = 3
  const add1 = (root: V3, dir: V3, len: number, droop: number, r0: number, bone: number, tone: number) => {
    const pts: V3[] = []
    for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push(add(add(root, scl(dir, len * t)), [0, -droop * len * t * t, 0])) }
    const base = pos.length / 3
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, T = nrm(sub(pts[Math.min(segs, i + 1)], pts[Math.max(0, i - 1)]))
      const N0 = nrm(cross(T, [0, 1, 0])), B0 = cross(T, N0), r = r0 * (1 - 0.92 * t)
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2, n = add(scl(N0, Math.cos(a)), scl(B0, Math.sin(a)))
        pos.push(...add(pts[i], scl(n, r))); nrmA.push(...n)
        const c = tone * (0.85 + 0.15 * t); col.push(c, c, c * 0.98)
        si.push(bone, 0, 0, 0); sw.push(1, 0, 0, 0)
      }
    }
    for (let i = 0; i < segs; i++) for (let k = 0; k < sides; k++) { const a = base + i * sides + k, b = base + i * sides + (k + 1) % sides; idx.push(a, b, a + sides, b, b + sides, a + sides) }
  }
  const nPer = lod >= 2 ? 5 : lod ? 9 : 15
  for (const s of [1, -1]) {
    const bone = B[s > 0 ? 'whiskerL' : 'whiskerR']
    for (let k = 0; k < nPer; k++) {
      const row = k % 4, col = Math.floor(k / 4)
      const raw: V3 = headToAbs([s * (0.014 + 0.009 * col + 0.003 * R()), WPAD_L[1] + 0.008 - row * 0.0048 + 0.002 * R(), NOSE_L[2] - 0.004 - col * 0.007])
      const root = onHead(raw)
      const out = nrm([s * (0.85 + 0.2 * R()), -0.05 + 0.25 * (1.5 - row) * 0.4 + 0.1 * R(), 0.45 + 0.25 * R() - col * 0.1])
      const len = 0.075 + 0.075 * R() * (row < 3 ? 1 : 0.6)
      add1(root, out, len, 0.28 + 0.25 * R(), 0.00042, bone, R() < 0.12 ? 0.55 : 0.95)
    }
    if (lod < 2) for (let k = 0; k < 3; k++) {
      const e = eyeC(s), raw: V3 = [e[0] - s * 0.008, e[1] + EYE.r + 0.004, e[2] - 0.004 + k * 0.006]
      const root = onHead(raw)
      add1(root, nrm([s * 0.5, 0.75, 0.3 + 0.2 * k]), 0.035 + 0.012 * R(), 0.15, 0.00028, B.head, 0.92)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrmA, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  g.setIndex(idx); g.computeBoundingSphere()
  return g
}
export { NOSE, earPoint }
