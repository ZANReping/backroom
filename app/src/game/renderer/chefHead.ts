// [chef] 厨师（Entity 800）头部：写实灰黑猪头 + 猪耳（3 节骨）+ 小黑眼 + 短獠牙 + 高褶厨师帽。坐标：厨师模型空间（静止姿态，+Z 正面）。
//   颅     耳后到额的椭球；额头平直，经鼻梁一路直线下到鼻盘（猪头侧面：长直吻部、额头平）
//   吻部   粗圆锥（根粗、末端略细），末端圆盘鼻：粉褐湿润，盘缘一圈、两个鼻孔（深）
//   颊 / 下颌   两颊厚肉垂到口角，下颌在吻部下方（挂 jaw 骨），口线一道深褶；口角上方露两颗短獠牙
//   眼     小、深陷：眼窝挖进、上睑 / 下睑肉褶厚（脸肥），眼球是刚性小网格（黑亮、细褐虹膜环）
//   颈     粗短，两层双下巴肉褶（挂 chin 骨），坐进立领
//   耳     参数曲面（内凹面 + 外凸面 + 耳缘），三角宽耳、根部竖起、外半段向前下折（半折竖耳），从帽沿下两侧伸出
//   帽     高褶厨师帽（帽箍 + 18 道竖褶的蓬松帽身 + 略塌的帽顶），刚性挂 hat 骨，SDF 提取
// 颜色：灰黑底色，额头到鼻梁一道灰白鬃毛（壳层毛更长），眼周 / 吻侧更深；鼻盘粉褐。毛长写在 Shade.fur（壳层毛按它伸长）。
import * as THREE from 'three'
import { clamp, fbm, gauss, len2, len3, mix, sdEll, sdRoundCone, smax, smin, sstep, vnoise } from './conciergeSdf'
import { B, CHIN_C, DISC, EAR, EAR_T, EYE, HAT, JAW_P, SKULL, SNOUT, TUSK, W4, add, cross, dot, earBase, earDir, earOpen, eyeC, eyeDir, lenv, nrm, scl, sub, type V3 } from './chefRig'
import { MAT, setC } from './chefBody'
import type { Shade } from './conciergeHead'

const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
const mixc = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mulc = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]
/** 绕 X 轴斜置的椭球（a = 长轴在 YZ 平面里的仰角，前高后低为正） */
function sdEllYZ(X: number, Y: number, Z: number, c: V3, r: V3, a: number) {
  const ca = Math.cos(a), sa = Math.sin(a), y = Y - c[1], z = Z - c[2]
  return sdEll(X, y * ca - z * sa, z * ca + y * sa, c[0], 0, 0, r[0], r[1], r[2])
}
/** 额头肉（前沿陡、和吻背 smin 出凹弧） */
const FORE = { c: [0, 1.728, 0.035] as V3, r: [0.098, 0.088, 0.115] as V3, k: 0.085 }
/** 颌下肉垂（斜置椭球）：中心、半轴（x / 垂直于长轴 / 长轴）、仰角、融合半径 */
const JOWL = { c: [0, 1.565, 0.16] as V3, r: [0.088, 0.05, 0.16] as V3, a: 0.42, k: 0.045 }
function sdEllipse(x: number, y: number, a: number, b: number) { const k0 = len2(x / a, y / b), k1 = len2(x / (a * a), y / (b * b)); return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1 }

// ---------- 鼻盘局部坐标 ----------
const DN = DISC.n, DU = nrm(sub([0, 1, 0], scl(DN, DN[1]))) // 盘面「上」方向
/** 鼻盘局部：x（左右）、v（盘面上下）、a（沿吻轴，盘面 = th/2） */
const toDisc = (X: number, Y: number, Z: number): V3 => { const q: V3 = [X - DISC.c[0], Y - DISC.c[1], Z - DISC.c[2]]; return [q[0], dot(q, DU), dot(q, DN)] }
/** 吻轴参数（0 根 → 1 鼻盘）与离轴距离 */
const snoutT = (X: number, Y: number, Z: number) => dot(sub([X, Y, Z], SNOUT.A), SNOUT.ax) / SNOUT.L
/** 口线（小嘴：从鼻盘下沿往后只到吻长约 2/5 处，口角微上翘）：y = mouthY(z)，|x| 处的口线；MOUTH_Z = 口角 */
const MOUTH_Z = 0.236
const mouthY = (z: number) => mix(1.5565, 1.5505, sstep(0.245, 0.295, z)) + 0.0028 * sstep(0.252, 0.236, z)
const mouthX = (z: number) => mix(0.05, 0.022, sstep(0.24, 0.3, z))
/** 口线强度：口角往后 1 cm 内收尖到 0 */
const mouthK = (z: number) => sstep(MOUTH_Z - 0.006, MOUTH_Z + 0.014, z) * sstep(0.335, 0.31, z)
/** 眼局部坐标系 */
function eyeFrame(s: number) { const n = eyeDir(s), u = nrm(sub([0, 1, 0], scl(n, n[1]))), h = cross(u, n); return { c: eyeC(s), n, u, h } }
const EF = { 1: eyeFrame(1), [-1]: eyeFrame(-1) } as Record<number, ReturnType<typeof eyeFrame>>

/** 猪头 + 颈（不含耳 / 帽） */
export function headCore(X: number, Y: number, Z: number) {
  if (Y < 1.36) return 1.36 - Y + 0.05
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  let d = sdEll(X, Y, Z, SKULL.c[0], SKULL.c[1], SKULL.c[2], SKULL.r[0], SKULL.r[1], SKULL.r[2])
  // 额（眼上方的额头肉，前沿陡）：和低平的吻背 smin 出鞍形内凹圆弧（家猪「碟形脸」）
  d = smin(d, sdEll(X, Y, Z, 0, FORE.c[1], FORE.c[2], FORE.r[0], FORE.r[1], FORE.r[2]), 0.04)
  // 吻部（截面略扁：宽 ×1.06；吻背近水平）
  d = smin(d, sdRoundCone(X / 1.06, Y, Z, SNOUT.A[0], SNOUT.A[1], SNOUT.A[2], SNOUT.E[0], SNOUT.E[1], SNOUT.E[2], SNOUT.rA, SNOUT.rE), FORE.k)
  // 两颊厚肉
  d = smin(d, sdEll(ax, Y, Z, 0.062, 1.603, 0.035, 0.072, 0.08, 0.098), 0.05)
  // 颌下肉垂（斜置椭球：下沿从鼻盘下方一路外凸圆弧到喉部）
  d = smin(d, sdEllYZ(X, Y, Z, JOWL.c, JOWL.r, JOWL.a), JOWL.k)
  // 颈（粗短，下粗上细，后颈一道肥肉）+ 双下巴
  d = smin(d, sdRoundCone(X, Y, Z, 0, 1.4, -0.03, 0, 1.62, -0.04, 0.118, 0.098), 0.06)
  d = smin(d, sdEll(X, Y, Z, 0, 1.53, -0.045, 0.118, 0.05, 0.112), 0.04)
  // 后颈肥肉：一道横肉褶鼓出、压在立领后沿上（侧 / 背面不再是一根直筒）
  d = smin(d, sdEll(X, Y, Z, 0, 1.566, -0.05, 0.128, 0.036, 0.12), 0.03)
  d = smin(d, sdEll(X, Y, Z, 0, 1.63, -0.06, 0.112, 0.07, 0.104), 0.05)
  if (Z < -0.04) d += 0.003 * sstep(-0.04, -0.1, Z) * gauss(Y - 1.598 + 0.4 * X * X, 0.006) // 后颈肉褶
  d = smin(d, sdEll(X, Y, Z, 0, 1.505, 0.04, 0.1, 0.045, 0.09), 0.035)
  // 喉 / 双下巴之间一道浅褶
  if (Z > 0.0) {
    const k = sstep(0.0, 0.06, Z)
    d += 0.0025 * k * gauss(Y - 1.488 - 1.2 * X * X, 0.006)
  }
  // 鼻盘（扁圆柱，圆角）
  {
    const [x, v, a] = toDisc(X, Y, Z)
    const rr = 0.009, e2 = sdEllipse(x, v, DISC.rx, DISC.ry), e1 = Math.abs(a + DISC.th * 0.3) - DISC.th * 0.5
    const disc = len2(Math.max(e2 + rr, 0), Math.max(e1 + rr, 0)) + Math.min(Math.max(e2 + rr, e1 + rr), 0) - rr
    // 吻部圆头被鼻盘面截平（否则球形端盖凸出盘面、盘缘看起来像喇叭口）
    d = smax(d, a - DISC.th * 0.2, 0.004)
    d = smin(d, disc, 0.012)
    // 盘面微凹 + 盘缘一圈肉棱
    const face = a - DISC.th * 0.2
    if (face > -0.02) {
      const rn = len2(x / DISC.rx, v / DISC.ry)
      d -= 0.0018 * sstep(0.95, 0.2, rn) * sstep(-0.01, 0.0, face) // 盘面微鼓
      d -= 0.0014 * gauss(rn - 0.9, 0.08) * sstep(-0.012, 0.0, face)
      // 两个鼻孔（斜向内下的深孔）
      for (const s of [1, -1]) d = smax(d, -sdEll(x, v, a, s * 0.0205, -0.004, DISC.th * 0.2, 0.0085, 0.0132, 0.024), 0.009)
    }
    // 盘根后一圈横向皱纹（吻部末端）
    const t = snoutT(X, Y, Z)
    if (t > 0.6 && t < 1.05) d += 0.0014 * Math.pow(0.5 + 0.5 * Math.sin(t * 64), 3) * sstep(0.6, 0.85, t) * sstep(1.02, 0.95, t) * sstep(1.6, 1.64, Y) // 只刻浅沟（不鼓棱，侧面轮廓不出锯齿）
  }
  // 口线（侧面一道深褶，口角处更深）
  if (Z > MOUTH_Z - 0.01 && Z < 0.335 && Y < 1.585 && Y > 1.52) {
    const my = mouthY(Z), mx = mouthX(Z)
    d += 0.0045 * gauss(Y - my, 0.0034) * sstep(mx - 0.03, mx + 0.006, ax) * mouthK(Z)
  }
  // 眼窝（深陷）+ 上睑厚褶 + 下睑肉
  {
    const F = EF[sx], p: V3 = [X - F.c[0], Y - F.c[1], Z - F.c[2]]
    const ln = dot(p, F.n), lh = dot(p, F.h), lu = dot(p, F.u)
    d = smin(d, sdEll(ln, lh, lu, 0.0, 0.0, 0.014, 0.012, 0.022, 0.01), 0.008) // 上睑 / 眉肉
    d = smin(d, sdEll(ln, lh, lu, 0.004, 0.0, -0.016, 0.014, 0.024, 0.011), 0.008) // 下睑肉
    d = smax(d, -sdEll(ln, lh, lu, 0.006, 0.0, 0.0, 0.014, 0.019, 0.0105), 0.003) // 眼裂
  }
  // 额头 / 鼻梁上的横纹（很浅）
  d -= 0.001 * Math.sin(Z * 140 + X * 10) * sstep(0.04, 0.2, Z) * gauss(ax, 0.05) * sstep(1.64, 1.7, Y)
  d += 0.0007 * (fbm(X * 60, Y * 60, Z * 60, 2) - 0.25)
  return d
}
export const headSdf = headCore
/** 鼻盘细格区域（离盘面 3.5 cm 以内）：<0 归细格（鼻孔边缘在粗格减面后会成锯齿） */
export function discRegion(X: number, Y: number, Z: number) { return -(toDisc(X, Y, Z)[2] + 0.035) }
export const DISC_BOX = { min: [DISC.c[0] - 0.085, DISC.c[1] - 0.09, DISC.c[2] - 0.075] as [number, number, number], max: [DISC.c[0] + 0.085, DISC.c[1] + 0.085, DISC.c[2] + 0.03] as [number, number, number] }
export const HEAD_BOX = { min: [-0.17, 1.38, -0.2] as [number, number, number], max: [0.17, 1.83, 0.34] as [number, number, number] }
/** 立领以下归身体：头部件只要 y > HEAD_KEEP_Y */
export const HEAD_KEEP_Y = 1.415

// ---------- 颜色 ----------
const SK = C(0x423d3a), SK_DK = C(0x1d1a19), SK_GR = C(0x77716a), MANE = C(0xe2ded6), MANE_DK = C(0xa49d95),
  DISC_C = C(0x92706a), DISC_RIM = C(0x5e4640), NOSTRIL = C(0x120b0a), LIP = C(0x221a18), SOCKET = C(0x0c0909), CREASE = C(0x4a3633)
const hgrad = (X: number, Y: number, Z: number): V3 => { const e = 0.0015; return nrm([headCore(X + e, Y, Z) - headCore(X - e, Y, Z), headCore(X, Y + e, Z) - headCore(X, Y - e, Z), headCore(X, Y, Z + e) - headCore(X, Y, Z - e)]) }
/** 鬃毛遮罩（额头 → 鼻梁一道灰白，往两侧渐散成灰色细纹） */
export function maneK(X: number, Y: number, Z: number, n?: V3) {
  const nn = n ?? hgrad(X, Y, Z)
  const ax = Math.abs(X)
  const top = sstep(0.15, 0.6, nn[1] + 0.25 * nn[2])
  const along = sstep(-0.12, -0.04, Z) * sstep(0.31, 0.24, Z)
  const w = mix(0.06, 0.04, sstep(0.0, 0.25, Z))
  const streak = 0.65 + 0.35 * Math.sin(X * 260 + 3 * vnoise(X * 40, Y * 40, Z * 20))
  return clamp(top * along * gauss(ax, w) * (0.8 + 0.4 * streak) + 0.35 * top * along * gauss(ax - 0.06, 0.03) * streak, 0, 1)
}
export function headShade(X: number, Y: number, Z: number, o: Shade) {
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  // 鼻盘
  const [x, v, a] = toDisc(X, Y, Z)
  const rn = len2(x / DISC.rx, v / DISC.ry)
  if (a > -0.02 && rn < 1.25) {
    const face = a - DISC.th * 0.2
    let nost = 1
    for (const s of [1, -1]) nost = Math.min(nost, sdEll(x, v, face, s * 0.0205, -0.004, 0, 0.0098, 0.015, 0.022))
    const onFace = sstep(-0.012, -0.002, face)
    let c = mixc(DISC_RIM, DISC_C, onFace * sstep(1.08, 0.86, rn))
    c = mulc(c, 0.85 + 0.25 * fbm(X * 120, Y * 120, Z * 120, 2)) // 鼻盘细纹
    c = mixc(c, C(0x5a3b37), 0.25 * gauss(rn - 0.92, 0.07) * onFace)
    // 鼻孔：软过渡（粗网格上不出锯齿边）
    const nk = face > -0.03 ? sstep(0.006, -0.004, nost) : 0
    c = mixc(c, NOSTRIL, nk)
    if (rn < 1.12 && a > -0.016) { setC(o, c, mix(0.22, 0.8, nk), nk > 0.5 ? MAT.plain : MAT.wet, 0.75); return }
  }
  // 眼窝
  {
    const F = EF[sx], p: V3 = [X - F.c[0], Y - F.c[1], Z - F.c[2]]
    const ln = dot(p, F.n), lh = dot(p, F.h), lu = dot(p, F.u)
    const eb = sdEll(ln, lh, lu, 0.006, 0.0, 0.0, 0.014, 0.019, 0.0105)
    if (eb < 0.0015) { setC(o, mixc(SOCKET, C(0x3b2421), 0.5 * sstep(-0.004, 0.0015, eb)), 0.4, MAT.plain, 0.1); return }
  }
  const n = hgrad(X, Y, Z)
  let c = mulc(SK, 0.88 + 0.26 * fbm(X * 22, Y * 22, Z * 22, 3))
  let fur = 1.0, rough = 0.7, blood = 0.3
  // 吻侧 / 眼周更深，颊 / 颈略灰
  c = mixc(c, SK_DK, 0.5 * gauss(len3(X - sx * EYE.c[0], Y - EYE.c[1], Z - EYE.c[2]), 0.028))
  c = mixc(c, SK_GR, 0.45 * sstep(0.04, 0.09, ax) * sstep(1.68, 1.6, Y) * sstep(-0.02, 0.06, Z) * fbm(X * 30, Y * 30, Z * 30, 2))
  // 吻部两侧 / 额侧灰白细纹（附图：灰黑底上一道道灰白鬃）
  c = mixc(c, MANE_DK, 0.35 * sstep(0.55, 0.85, 0.5 + 0.5 * Math.sin(X * 180 + Z * 40 + 4 * vnoise(X * 30, Y * 30, Z * 30))) * sstep(1.6, 1.68, Y) * sstep(0.0, 0.1, Z))
  { const tt = snoutT(X, Y, Z); if (tt > 0.6 && tt < 1.0) c = mulc(c, 1 - 0.25 * Math.pow(0.5 + 0.5 * Math.sin(tt * 64), 3) * sstep(0.6, 0.85, tt)) } // 吻端横皱纹的暗
  // 鬃毛
  const mk = maneK(X, Y, Z, n)
  c = mixc(c, mixc(MANE_DK, MANE, 0.5 + 0.5 * fbm(X * 50, Y * 30, Z * 50, 2)), mk)
  fur = mix(fur, 1.55, mk)
  // 吻部：毛短；鼻盘根部一圈粉褐渐变
  const t = snoutT(X, Y, Z)
  if (t > 0.2) fur *= mix(1, 0.45, sstep(0.2, 0.9, t))
  if (t > 0.86) { c = mixc(c, DISC_RIM, 0.55 * sstep(0.88, 1.0, t)); fur *= 0.5 * sstep(0.97, 0.89, t) } // 盘根前毛收到 0（壳层边缘不出锯齿）
  // 口线 / 唇
  if (Z > MOUTH_Z - 0.01 && Z < 0.335 && Y < 1.585 && Y > 1.52) {
    const my = mouthY(Z), mx = mouthX(Z)
    const lk = gauss(Y - my, 0.0034) * sstep(mx - 0.03, mx + 0.006, ax) * mouthK(Z)
    c = mixc(c, LIP, 0.85 * clamp(lk, 0, 1)); fur *= 1 - clamp(lk, 0, 1); blood = Math.max(blood, 0.9 * lk + 0.5 * sstep(0.18, 0.3, Z))
  }
  // 颌下肉垂 / 双下巴 / 颈：和头同一张灰黑皮（不另换颈色），喉部略灰；褶里偏红
  if (Y < 1.58) {
    c = mixc(c, SK_GR, 0.3 * sstep(1.56, 1.48, Y) * (0.6 + 0.4 * fbm(X * 26, Y * 26, Z * 26, 2)))
    if (Z > 0.0) { const cr = gauss(Y - 1.488 - 1.2 * X * X, 0.006); c = mixc(c, CREASE, 0.45 * clamp(cr, 0, 1)); fur *= 1 - 0.6 * clamp(cr, 0, 1) }
    blood = Math.max(blood, 0.55 * sstep(0.0, 0.08, Z))
  }
  // 颌下 / 喉部朝下的面：白厨师服往上反的光（烘进底色），不让下巴底下一整块死黑
  c = mixc(c, C(0x7d746c), 0.42 * sstep(-0.15, -0.75, n[1]) * sstep(1.62, 1.52, Y))
  // 后颈 / 颈侧：灰一些、夹灰白鬃纹（附图颈侧灰白鬃），不让帽下这一截发黑像面具边
  {
    const nk = sstep(0.06, -0.06, Z) * sstep(1.72, 1.64, Y)
    c = mixc(c, SK_GR, 0.38 * nk)
    c = mixc(c, MANE_DK, 0.3 * nk * sstep(0.5, 0.85, 0.5 + 0.5 * Math.sin(X * 150 + Y * 60 + 4 * vnoise(X * 30, Y * 30, Z * 30))))
    fur = mix(fur, 1.25, nk)
    if (Z < -0.04) { const cr = gauss(Y - 1.598 + 0.4 * X * X, 0.006) * sstep(-0.04, -0.1, Z); c = mixc(c, CREASE, 0.4 * cr) }
  }
  // 眼下泪痕（猪常见的深色泪斑）
  c = mixc(c, SK_DK, 0.45 * gauss(ax - EYE.c[0] + 0.004, 0.009) * sstep(EYE.c[1] - 0.004, EYE.c[1] - 0.04, Y) * sstep(EYE.c[1] - 0.07, EYE.c[1] - 0.04, Y) * gauss(Z - EYE.c[2], 0.02))
  // 吻尖、嘴附近的血
  if (t > 0.6) blood = Math.max(blood, 0.75)
  if (Y < 1.47) fur *= sstep(HEAD_KEEP_Y + 0.01, 1.47, Y)
  setC(o, c, rough, MAT.pig, blood, fur)
}
/** 梳毛方向（切平面内）：猪鬃从吻部往后、往颈后下方倒 */
export function furComb(p: V3, n: V3): V3 {
  const [x, y, z] = p
  let g: V3 = [x * 1.5, -0.35, -1]
  if (y < 1.6) g = [x * 0.5, -1, -0.4 * sstep(0.0, 0.05, z)]
  const t = sub(g, scl(n, dot(g, n)))
  const L = lenv(t)
  return L < 1e-6 ? [0, -1, 0] : scl(t, 1 / L)
}
// ---------- 权重 ----------
export function headWeights(X: number, Y: number, Z: number, acc: W4) {
  const hk = sstep(1.47, 1.56, Y), nk = sstep(1.4, 1.46, Y)
  // 下颌（口线以下、吻部前段）
  const my = mouthY(clamp(Z, MOUTH_Z, 0.3))
  const jawK = hk * sstep(my + 0.004, my - 0.01, Y) * sstep(MOUTH_Z - 0.04, MOUTH_Z + 0.01, Z) * sstep(1.49, 1.52, Y)
  // 双下巴 / 颈肉
  const chinK = (1 - jawK) * gauss(len3(X / 1.6, Y - CHIN_C[1], (Z - CHIN_C[2]) * 1.2), 0.065) * sstep(-0.01, 0.05, Z) * 0.95
  acc.add(B.jaw, jawK); acc.add(B.chin, chinK)
  const rest = 1 - jawK - chinK
  acc.add(B.head, rest * hk); acc.add(B.neck, rest * (1 - hk) * nk); acc.add(B.chest, rest * (1 - hk) * (1 - nk))
}

// ======================================================================
// 猪耳（参数曲面：内凹面 + 外凸面 + 耳缘；每侧 3 节骨，折线处第 3 节）
// ======================================================================
function earFrame(s: number) {
  const D = earDir(s), O0 = earOpen(s)
  const O = nrm(sub(O0, scl(D, dot(O0, D)))), Lt = nrm(cross(D, O))
  return { D, O, Lt }
}
/** 耳半宽：根部宽、三角形收到尖 */
const earW = (t: number) => EAR.w * (0.74 + 0.26 * sstep(0.0, 0.3, t)) * Math.pow(Math.max(0, 1 - t), 0.78) + 0.0015
const rotAbout = (v: V3, ax: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a); return add(add(scl(v, c), scl(cross(ax, v), s)), scl(ax, dot(ax, v) * (1 - c))) }
/** 耳中面上一点（t 沿耳长、v 横向 −1..1）：未折时的点 → 折线以外绕横轴向前下卷 */
function earMid(s: number, t: number, v: number): V3 {
  const { D, O, Lt } = earFrame(s)
  const w = earW(t)
  const cup = 0.012 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.7) * (1 - v * v)
  const p = add(add(add(earBase(s), scl(D, EAR.len * t)), scl(Lt, w * v * s)), scl(O, -cup))
  if (t <= EAR.fold - 0.08) return p
  // 折：绕过折线点、轴 = 横向 Lt 的轴向前（O 侧）卷；角度在折线前后 0.25 内渐增
  const piv = add(earBase(s), scl(D, EAR.len * (EAR.fold - 0.04)))
  const ang = EAR.foldA * sstep(EAR.fold - 0.08, EAR.fold + 0.2, t)
  return add(piv, rotAbout(sub(p, piv), scl(Lt, -s), ang))
}
export function earThick(t: number, v: number) { return (0.0052 * (1 - 0.6 * t) + 0.0016) * Math.sqrt(Math.max(0.05, 1 - v * v)) + 0.004 * (1 - v * v) * (1 - t) * (1 - t) }
export interface EarVert { p: V3; n: V3; t: number; v: number; inner: boolean; rim?: boolean }
/** 生成两只耳的三角网格（顶点回调写进 Chunk）：nt × nv 分段 */
export function buildEars(lod: number, emit: (verts: EarVert[], s: number, tri: number[]) => void) {
  const nt = [22, 11, 6][lod], nv = [12, 6, 3][lod]
  for (const s of [1, -1]) {
    const { O } = earFrame(s)
    const P = (t: number, v: number, side: number): V3 => { const m = earMid(s, t, v); if (side > 0) return m; const e = 0.003; const n = nrm(cross(sub(earMid(s, Math.min(1, t + e), v), earMid(s, Math.max(0, t - e), v)), sub(earMid(s, t, Math.min(1, v + e)), earMid(s, t, Math.max(-1, v - e))))); const nn = dot(n, foldO(s, t)) < 0 ? scl(n, -1) : n; return add(m, scl(nn, -earThick(t, v))) }
    const foldO = (_s: number, t: number): V3 => t <= EAR.fold - 0.08 ? O : rotAbout(O, scl(earFrame(s).Lt, -s), EAR.foldA * sstep(EAR.fold - 0.08, EAR.fold + 0.2, t))
    const verts: EarVert[] = [], tri: number[] = []
    const grid = (side: number) => {
      const base = verts.length, pts: V3[][] = []
      for (let i = 0; i <= nt; i++) { pts.push([]); for (let j = 0; j <= nv; j++) pts[i].push(P(i / nt, (-1 + 2 * j / nv) * 0.999, side)) }
      for (let i = 0; i <= nt; i++) for (let j = 0; j <= nv; j++) {
        const a = pts[Math.min(nt, i + 1)][j], b = pts[Math.max(0, i - 1)][j], c = pts[i][Math.min(nv, j + 1)], d = pts[i][Math.max(0, j - 1)]
        let n = nrm(cross(sub(c, d), sub(a, b)))
        if (dot(n, foldO(s, i / nt)) * side < 0) n = scl(n, -1)
        verts.push({ p: pts[i][j], n, t: i / nt, v: -1 + 2 * j / nv, inner: side > 0 })
      }
      for (let i = 0; i < nt; i++) for (let j = 0; j < nv; j++) {
        const a = base + i * (nv + 1) + j, b = a + nv + 1
        // 朝向：按法线选环绕
        const pa = verts[a].p, pb = verts[b].p, pc = verts[a + 1].p, fn = cross(sub(pb, pa), sub(pc, pa))
        if (dot(fn, verts[a].n) > 0) tri.push(a, b, a + 1, b, b + 1, a + 1); else tri.push(a, a + 1, b, b, a + 1, b + 1)
      }
      return pts
    }
    const pi = grid(1), po = grid(-1)
    const rim = (ij: [number, number][]) => {
      for (let k = 0; k < ij.length - 1; k++) {
        const [i0, j0] = ij[k], [i1, j1] = ij[k + 1]
        const q = [pi[i0][j0], pi[i1][j1], po[i1][j1], po[i0][j0]]
        let en = nrm(cross(sub(q[1], q[0]), sub(q[3], q[0])))
        const mid = scl(add(add(q[0], q[1]), add(q[2], q[3])), 0.25), ctr = earMid(s, Math.max(0, i0 / nt - 0.08), 0)
        if (dot(en, sub(mid, ctr)) < 0) en = scl(en, -1)
        const base = verts.length
        for (let m = 0; m < 4; m++) { const [ii, jj] = m === 0 || m === 3 ? [i0, j0] : [i1, j1]; verts.push({ p: q[m], n: en, t: ii / nt, v: -1 + 2 * jj / nv, inner: false, rim: true }) }
        const nn = nrm(cross(sub(q[1], q[0]), sub(q[3], q[0])))
        if (dot(nn, en) > 0) tri.push(base, base + 1, base + 2, base, base + 2, base + 3); else tri.push(base, base + 2, base + 1, base, base + 3, base + 2)
      }
    }
    const e1: [number, number][] = [], e2: [number, number][] = [], e3: [number, number][] = []
    for (let i = 0; i <= nt; i++) { e1.push([i, 0]); e2.push([nt - i, nv]) }
    for (let j = 0; j <= nv; j++) e3.push([nt, j])
    rim(e1); rim(e3); rim(e2)
    emit(verts, s, tri)
  }
}
const EAR_IN = C(0x7d625d), EAR_IN_DK = C(0x3e2e2b), EAR_OUT = C(0x4a4541), EAR_EDGE = C(0x6a635d)
/** 耳色：内侧灰粉（耳根深、中段浅、边缘一圈灰）+ 少量血管；外侧灰黑（壳层毛） */
export function earShade(ev: EarVert, o: Shade) {
  const { t, v } = ev
  if (ev.inner) {
    let c = mixc(EAR_IN_DK, EAR_IN, sstep(0.0, 0.35, t) * (1 - 0.6 * Math.abs(v) ** 6))
    c = mixc(c, EAR_EDGE, 0.5 * sstep(0.72, 0.98, Math.abs(v)))
    c = mulc(c, 0.9 + 0.2 * fbm(ev.p[0] * 90, ev.p[1] * 90, ev.p[2] * 90, 2))
    c = mixc(c, C(0x5a2e2c), 0.35 * gauss(Math.sin(v * 7 + t * 9), 0.15) * sstep(0.2, 0.5, t)) // 细血管
    setC(o, c, 0.6, MAT.pig, 0.35, 0.25 * sstep(0.7, 0.95, Math.abs(v)))
    return
  }
  let c = mulc(EAR_OUT, 0.9 + 0.25 * fbm(ev.p[0] * 40, ev.p[1] * 40, ev.p[2] * 40, 2))
  if (ev.rim) c = mixc(c, EAR_EDGE, 0.4)
  setC(o, c, 0.7, MAT.pig, 0.3, mix(0.9, 0.5, t))
}
export function earWeights(s: number, t: number, acc: W4) {
  const S = s > 0 ? 'L' : 'R', bones = [0, 1, 2].map((k) => B[`ear${S}${k}`])
  const k1 = sstep(EAR_T[1] - 0.1, EAR_T[1] + 0.06, t), k2 = sstep(EAR_T[2] - 0.08, EAR_T[2] + 0.08, t)
  acc.add(bones[0], 1 - k1); acc.add(bones[1], k1 * (1 - k2)); acc.add(bones[2], k2)
}

// ======================================================================
// 眼球（刚性，挂 head）：黑亮小眼，一圈深褐虹膜
// ======================================================================
export function buildEyeGeometry(lod: number) {
  const g = new THREE.SphereGeometry(EYE.r, [16, 10, 6][lod], [12, 8, 5][lod])
  g.rotateX(Math.PI / 2)
  const p = g.attributes.position, col = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) / EYE.r, rr = Math.hypot(p.getX(i), p.getY(i)) / EYE.r
    const iris = z > 0 ? sstep(0.62, 0.42, rr) : 0, pupil = z > 0 ? sstep(0.36, 0.28, rr) : 0
    const c = mixc(mixc([0.05, 0.035, 0.03], [0.16, 0.08, 0.04], iris), [0.008, 0.006, 0.006], pupil)
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
    col[i * 3] = lin(c[0]); col[i * 3 + 1] = lin(c[1]); col[i * 3 + 2] = lin(c[2])
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
export function eyeQuat(s: number) {
  const F = EF[s]
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...F.h).multiplyScalar(-1), new THREE.Vector3(...F.u), new THREE.Vector3(...F.n))
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

// ======================================================================
// 獠牙（左右各一，从下唇口角前方向上外翘出 2.6 cm；挂 jaw）
// ======================================================================
export function tuskPath(s: number): { pts: V3[]; r: number[] } {
  const b: V3 = [TUSK.base[0] * s, TUSK.base[1], TUSK.base[2]], d0: V3 = [TUSK.dir[0] * s, TUSK.dir[1], TUSK.dir[2]]
  const pts: V3[] = [], r: number[] = []
  let p = sub(b, scl(d0, 0.008)), d = d0
  const n = 7
  for (let k = 0; k <= n; k++) {
    pts.push(p); r.push(TUSK.r * Math.pow(1 - k / n, 0.75) + 0.0006)
    d = nrm(add(d, [-0.06 * s, -0.04, -0.1])) // 往后内弯
    p = add(p, scl(d, (TUSK.len + 0.008) / n))
  }
  return { pts, r }
}

// ======================================================================
// 高褶厨师帽（帽局部坐标：原点 = 帽箍底面中心，+Y = 帽轴）
// ======================================================================
const ca = Math.cos(HAT.tiltX), sa = Math.sin(HAT.tiltX), cb = Math.cos(HAT.tiltZ), sb = Math.sin(HAT.tiltZ)
/** 模型空间 → 帽局部（R = Rz(b)·Rx(a)，逆 = Rx(−a)·Rz(−b)） */
export function toHat(X: number, Y: number, Z: number): V3 {
  const x0 = X - HAT.c[0], y0 = Y - HAT.c[1], z0 = Z - HAT.c[2]
  const x1 = x0 * cb + y0 * sb, y1 = -x0 * sb + y0 * cb, z1 = z0
  return [x1, y1 * ca + z1 * sa, -y1 * sa + z1 * ca]
}
export function fromHat(p: V3): V3 {
  const [x1, y1l, z1l] = p
  const y1 = y1l * ca - z1l * sa, z1 = y1l * sa + z1l * ca
  return [HAT.c[0] + x1 * cb - y1 * sb, HAT.c[1] + x1 * sb + y1 * cb, HAT.c[2] + z1]
}
const HB = HAT.band, HTOP = HAT.band + HAT.h, RZK = HAT.rx / HAT.rz
/** 帽身半径（x 单位）随帽高 */
const hatR = (y: number) => y < HB ? HAT.rx * (1 + 0.045 * y / HB) : mix(HAT.rx * 1.05, HAT.rTop, Math.pow(sstep(HB, HB + HAT.h * 0.78, y), 0.7))
export function hatLocalSdf(x: number, y: number, z: number) {
  const rho = len2(x, z * RZK), phi = Math.atan2(x, z)
  let R = hatR(clamp(y, 0, HTOP))
  // 竖褶（帽身，帽箍以上）
  const pk = sstep(HB + 0.002, HB + 0.03, y)
  R *= 1 + pk * (0.032 * Math.sin(phi * 18 + 0.25 * Math.sin(y * 30)) + 0.008 * Math.sin(phi * 7 + 1.3))
  // 帽箍与帽身接缝（帽身略鼓出盖住帽箍上沿）
  R -= 0.003 * gauss(y - HB, 0.004)
  const side = rho - R
  // 帽顶：中间略塌的蓬顶，外缘圆鼓
  const u = clamp(rho / HAT.rTop, 0, 1.2)
  const yTop = HTOP - 0.05 * Math.pow(u, 2.4) - 0.012 * gauss(u, 0.35) + 0.006 * Math.sin(phi * 18) * sstep(0.3, 0.9, u)
  let d = smax(side, y - yTop, 0.035)
  d = smax(d, -y, 0.003)
  d += 0.0005 * fbm(x * 50, y * 50, z * 50, 2)
  return d
}
export function hatSdf(X: number, Y: number, Z: number) { const [x, y, z] = toHat(X, Y, Z); return hatLocalSdf(x, y, z) }
export const HAT_BOX = (() => {
  const r = HAT.rTop * 1.12 + 0.03
  return { min: [-r, HAT.c[1] - 0.04, HAT.c[2] - r - 0.05] as [number, number, number], max: [r, HAT.c[1] + HTOP + 0.06, HAT.c[2] + r + 0.03] as [number, number, number] }
})()
const HAT_W = C(0xedeae4), HAT_SH = C(0xc3beb4)
export function hatShade(X: number, Y: number, Z: number, o: Shade) {
  const [x, y, z] = toHat(X, Y, Z)
  const phi = Math.atan2(x, z)
  let c = mulc(HAT_W, 0.96 + 0.05 * fbm(X * 10, Y * 10, Z * 10, 2))
  // 褶谷略暗、帽箍上沿接缝线、帽箍里侧（底面）暗、帽箍下沿汗渍
  if (y > HB) c = mixc(c, HAT_SH, 0.35 * sstep(0.2, -0.8, Math.sin(phi * 18 + 0.25 * Math.sin(y * 30))) * sstep(HB, HB + 0.04, y))
  c = mixc(c, HAT_SH, 0.7 * gauss(y - HB, 0.003))
  if (y < 0.003) c = mulc(c, 0.45)
  c = mixc(c, C(0xc9b58c), 0.4 * sstep(0.02, 0.0, y))
  // 正面沾血多（附图：帽前一道往下流的血）
  const front = sstep(-0.3, 0.6, Math.cos(phi))
  setC(o, c, 0.88, MAT.cloth, 0.35 + 0.65 * front)
}
export const hatWeights = (_X: number, _Y: number, _Z: number, acc: W4) => { acc.add(B.hat, 1) }
export { mouthX, mouthY, JAW_P }
void smax; void sdRoundCone
