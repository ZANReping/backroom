// [beast] 第五层的野兽（Entity 18）头部：墨鱼头 + 触须。坐标：野兽模型空间（静止姿态，+Z 正面）。
//   脸团   两眼之间的头部主体（椭球），两侧鼓起的大眼包 + 杏仁形眼裂（眼球是 beastMesh 里的刚性网格，W 形瞳孔贴图）、眼上一道皮褶
//   外套膜 从脸团上后方向上后方拉长的子弹形（左右宽、背腹扁），表面纵向皱褶；两侧各一片波浪形侧鳍（肉质、带厚度）
//   口     脸团前下方的口球，10 条触须从口周一圈伸出（根部短桩在 SDF 里，与管状触须网格接上）
//   颈     从衬衫领口里伸出来的一截（大部分被触须挡住）
//   裂缝   v2：绅士形态的头部网格完全无缝（看不出任何中线）；真身另有一套头部网格（headVariant = 'true'）：外套膜下半 / 脸团沿中线
//          有一道窄缝（缝壁带横向肉褶），缝两侧分属 mantleL / mantleR 骨（往上渐归 head，像拉链只拉开下半），setBeastForm 时两套网格切换
//   触须   8 条腕 + 2 条长触腕：按「重力下垂 + 躲开衬衫 / 领带 / 驳头 + 末端卷曲」逐步模拟出路径，再扫掠成管（独立网格，带 UV：
//          u 绕一圈、口面（吸盘面）在 u = 0.5；v 沿长度、按半径归一，吸盘贴图大小随管径变）；口面上少量几何吸盘（LOD0）。
//          每条 9 节骨链 tent{i}_0..8，顶点按弧长在相邻两节间线性混合（阶段 2 做二阶摆动 / 真身时拉长触腕）。
//   喙     上下两片钩喙 + 一团暗红口肉（SDF 提取，刚性挂 beak / beakJaw 骨），静止时完全藏在脸团里。
import * as THREE from 'three'
import { clamp, extract, decimate, reproject, fbm, gauss, len2, len3, mix, sdEll, sdRoundCone, smax, smin, sstep, vnoise, sdfAO, type Sdf } from './conciergeSdf'
import { B, BEAK, EYE, HINGE, LOBE, bhSdfW, warpBH, MANTLE, MOUTH, N_TENT_BONES, SLIT, TENTS, W4, add, cross, dot, eyeC, eyeDir, lenv, nrm, scl, sub, tentBone, type TentSpec, type V3 } from './beastRig'
import { bodySdf, NECK_HOLE } from './beastBody'
import { setS } from './bellhopBody'
import type { Shade } from './conciergeHead'

const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
const mixc = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mulc = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]
function sdEllipse(x: number, y: number, a: number, b: number) { const k0 = len2(x / a, y / b), k1 = len2(x / (a * a), y / (b * b)); return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1 }

/** 当前 LOD（LOD1 鳍加厚，防粗格破洞） */
let LOD = 0
export function setHeadLod(l: number) { LOD = l }

// ======================================================================
// 外套膜（局部坐标：t 沿轴 0..1、x 左右、v 背腹（+ = 上前方 / 裂缝侧））
// ======================================================================
const { M0, D, FH, L: ML } = MANTLE
// v3：胴更粗更饱满（宽 0.084 → 0.116、厚 0.07 → 0.08，尾段收得更慢）
export const mantleA = (t: number) => 0.116 * Math.sqrt(Math.max(0, 1 - Math.pow(clamp(t, 0, 1), 2.6))) * (1 - 0.16 * clamp(t, 0, 1)) + 0.0045
export const mantleB = (t: number) => 0.08 * Math.sqrt(Math.max(0, 1 - Math.pow(clamp(t, 0, 1), 2.4))) * (1 - 0.22 * clamp(t, 0, 1)) + 0.0045
/** 外套膜向背侧弯一点（尖端往后勾） */
const bendV = (t: number) => -0.05 * t * t // v3：尖端下垂更多（原 -0.024）
export function mantleLocal(X: number, Y: number, Z: number): [number, number, number] {
  const qx = X - M0[0], qy = Y - M0[1], qz = Z - M0[2]
  const ta = qy * D[1] + qz * D[2], v = qy * FH[1] + qz * FH[2]
  const t = ta / ML
  return [t, qx, v - bendV(clamp(t, 0, 1))]
}
/** 侧鳍外伸宽度（外套膜边缘以外） */
const finW = (t: number) => 0.036 * Math.pow(Math.sin(Math.PI * clamp((t - 0.03) / 0.95, 0, 1)), 0.75)
function mantleSdf(X: number, Y: number, Z: number, withFin = true) {
  const [t, x, v] = mantleLocal(X, Y, Z)
  const tc = clamp(t, 0, 1), a = mantleA(tc), b = mantleB(tc)
  let d = sdEllipse(x, v, a, b)
  const ax = (t - tc) * ML
  if (t > 1) d = len2(Math.max(d, 0), ax) + Math.min(d, 0)
  d = smax(d, -t * ML - 0.035, 0.02)
  // 纵向皱褶（背侧明显）+ 细碎起伏
  const ang = Math.atan2(v / b, x / a)
  d -= 0.0017 * sstep(0.08, 0.3, t) * sstep(1.0, 0.85, t) * Math.sin(ang * 9 + t * 5 + 1.5 * vnoise(X * 30, Y * 30, Z * 30)) * (0.6 + 0.4 * sstep(0.3, -0.5, Math.sin(ang)))
  d -= 0.0012 * (fbm(X * 45, Y * 45, Z * 45, 2) - 0.25)
  if (withFin && t > 0.0 && t < 1.02) {
    const e = Math.abs(x) - a, fw = finW(t)
    if (e > -0.02 && fw > 0.002) {
      const s = clamp(e / fw, 0, 1)
      const v0 = 0.0065 * Math.sin(t * 27 + (x > 0 ? 0 : 1.3)) * Math.pow(s, 1.3) // 波浪鳍缘
      const th = (LOD ? 0.0105 : 0.0068) * (1 - 0.45 * s) + 0.0008
      const fin = Math.max(Math.abs(v - v0) - th * 0.5, e - fw, -e - 0.015)
      d = smin(d, fin, 0.007)
    }
  }
  return d
}
// ======================================================================
// 脸团 + 眼包 + 口 + 颈
// ======================================================================
/** 眼局部坐标系：n 朝外、h 水平切向、u 竖直切向 */
function eyeFrame(s: number) {
  const n = eyeDir(s), u = nrm(sub([0, 1, 0], scl(n, n[1]))), h = cross(u, n)
  return { c: eyeC(s), n, u, h }
}
const EF = { 1: eyeFrame(1), [-1]: eyeFrame(-1) } as Record<number, ReturnType<typeof eyeFrame>>
/** 眼裂（咬掉眼包外侧的一块杏仁形）：<0 在裂口里 */
function eyeBite(s: number, X: number, Y: number, Z: number) {
  const F = EF[s], p: V3 = [X - F.c[0], Y - F.c[1], Z - F.c[2]]
  const ln = dot(p, F.n) - 0.0365, lh = dot(p, F.h), lu = dot(p, F.u) + 0.002
  return sdEll(ln, lh, lu, 0, 0, 0, 0.0275, 0.034, 0.023)
}
/** 头部芯（不含触须短桩 / 裂缝）：路径模拟避让用 */
export function headCore(X: number, Y: number, Z: number) {
  if (Y < 1.44) return 1.44 - Y + 0.05
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  let d = sdEll(X, Y, Z, LOBE.c[0], LOBE.c[1], LOBE.c[2], LOBE.r[0], LOBE.r[1], LOBE.r[2])
  // 两眼包
  const ec = eyeC(sx)
  d = smin(d, len3(X - ec[0], Y - ec[1], Z - ec[2]) - EYE.bulge, 0.026)
  // 眼上一道皮褶（墨鱼眼上的 W 形眼睑褶）
  {
    const F = EF[sx], p: V3 = [X - F.c[0], Y - F.c[1], Z - F.c[2]]
    d = smin(d, sdEll(dot(p, F.n), dot(p, F.h), dot(p, F.u), 0.0275, 0.0, 0.0255, 0.0145, 0.034, 0.0105), 0.008)
  }
  // 口球（触须根部那一团）
  d = smin(d, sdEll(X, Y, Z, 0, 1.648, 0.076, 0.072, 0.044, 0.06), 0.03)
  // 两眼之间额部略凹、口上方一道横褶
  d += 0.0045 * gauss(ax, 0.026) * gauss(Y - 1.748, 0.024) * sstep(0.02, 0.07, Z)
  d += 0.0018 * gauss(Y - 1.68, 0.004) * sstep(0.06, 0.09, Z) * sstep(0.078, 0.042, ax)
  // 外套膜
  d = smin(d, mantleSdf(X, Y, Z), 0.036)
  // 颈（从衬衫领口里出来）
  d = smin(d, sdRoundCone(X, Y, Z, 0, 1.49, -0.02, 0, 1.65, -0.006, 0.052, 0.058), 0.034)
  d += 0.0008 * (fbm(X * 70, Y * 70, Z * 70, 2) - 0.25)
  // 眼裂
  d = smax(d, -eyeBite(sx, X, Y, Z), 0.0025)
  return d
}
/** 头部网格变体：'gentleman' = 无缝（绅士形态）；'true' = 带中线裂缝（真身） */
let VARIANT: 'gentleman' | 'true' = 'gentleman'
export function setHeadVariant(v: 'gentleman' | 'true') { VARIANT = v }
/** 外套膜轴向参数（裂缝上端 / 拉链权重用） */
const mantleT = (X: number, Y: number, Z: number) => mantleLocal(X, Y, Z)[0]
/** 裂缝（沿中线、铰链面以前、口上方、外套膜下半）：<0 在缝里；缝壁带横向肉褶（张开后看得到） */
export function slitCut(X: number, Y: number, Z: number) {
  const f = (Y - HINGE[1]) * FH[1] + (Z - HINGE[2]) * FH[2]
  const rib = 0.0011 * (0.5 + 0.5 * Math.sin(f * 230 + Y * 90))
  return Math.max(Math.abs(X) - SLIT.halfW - rib, SLIT.f0 - f, SLIT.yBottom - Y, mantleT(X, Y, Z) - SLIT.tMax)
}
// ---------- 触须短桩（路径生成后填入） ----------
let STUBS: { a: V3; b: V3; r0: number; r1: number }[] = []
export function headPartSdf(X: number, Y: number, Z: number) {
  if (Y < 1.44) return 1.44 - Y + 0.05
  let d = headCore(X, Y, Z)
  if (Y < 1.69 && Z > -0.02) for (const s of STUBS) d = smin(d, sdRoundCone(X, Y, Z, s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2], s.r0, s.r1), 0.01)
  if (VARIANT === 'true') d = smax(d, -slitCut(X, Y, Z), 0.0012)
  return d
}
export const HEAD_BOX = { min: [-0.19, 1.45, -0.37] as [number, number, number], max: [0.19, 2.02, 0.2] as [number, number, number] }

// ---------- 颜色 ----------
const SK_DORS = C(0x35292a), SK_VENT = C(0x5f544d), SK_LOBE = C(0x6b5f57), SK_PALE = C(0xa29483), SK_NECK = C(0x4e443f), SK_MOUTH = C(0x76605a)
const FLESH = C(0x5a141b), FLESH_DK = C(0x22070a), SOCKET = C(0x15120f)
const hash1 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
/** 墨鱼皮：o.fur = 1 是「色素皮肤」标记（着色器在这里叠色素细胞斑点 / 湿润高光 / 虹彩） */
export function headShade(X: number, Y: number, Z: number, o: Shade) {
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  // 裂缝内壁（只在真身网格）：近黑的紫红湿肉，缝口一圈皮色，往里渐暗；横向肉褶的棱上略亮（不是一整片红）
  if (VARIANT === 'true' && slitCut(X, Y, Z) > -0.0035 && ax < SLIT.halfW + 0.003) {
    const f = (Y - HINGE[1]) * FH[1] + (Z - HINGE[2]) * FH[2]
    if (f > SLIT.f0 - 0.003 && Y > SLIT.yBottom - 0.004 && mantleT(X, Y, Z) < SLIT.tMax + 0.01) {
      const lip = sstep(-0.0005, -0.004, -Math.abs(Math.abs(X) - SLIT.halfW)) // 0 在壁上
      const ridge = 0.5 + 0.5 * Math.sin(f * 230 + Y * 90)
      let c = mixc(mulc(FLESH_DK, 0.8), mulc(FLESH, 0.55), 0.15 + 0.4 * ridge * sstep(0.05, 0.0, f - SLIT.f0))
      c = mixc(c, [0.07, 0.025, 0.06], 0.45 * vnoise(X * 200, Y * 120, Z * 120))
      setS(o, mixc(c, mulc(SK_LOBE, 0.5), 0.35 * lip), 0.55, 0, 0, 0.2, 0, 0); return
    }
  }
  // 眼窝里（眼裂内壁）
  const eb = eyeBite(sx, X, Y, Z)
  if (eb < 0.0015) { const c = mixc(SOCKET, [0.05, 0.12, 0.11], 0.4 * sstep(0.0015, -0.004, eb)); setS(o, c, 0.3, 0, 0.15, 0, 0, 0); return }
  const [t, x, v] = mantleLocal(X, Y, Z)
  const mDist = mantleSdf(X, Y, Z, false)
  let c: number[]
  let rough = 0.38
  if (Y < 1.625 && Z < 0.03 && headCore(X, Y, Z) < 0.01 && mDist > 0.05) {
    c = mulc(SK_NECK, 0.9 + 0.2 * fbm(X * 25, Y * 25, Z * 25, 2))
    // 领口内侧更暗
    c = mulc(c, mix(0.55, 1, sstep(1.5, 1.58, Y)))
    setS(o, c, 0.45, 0, 0.75, 0.3, 0, 0); return
  }
  if (t > 0.02 && mDist < 0.006 + 0.04 * sstep(0.0, 0.02, Math.abs(x) - mantleA(t))) {
    // 外套膜：背侧深、腹侧浅；背上一道道横向虎纹（墨鱼的「斑马纹」，很淡）；鳍：浅、半透明感，鳍根一道白线
    const dors = sstep(0.02, -0.03, v)
    c = mixc(SK_VENT, SK_DORS, dors)
    c = mulc(c, 1 - 0.22 * dors * sstep(0.2, 0.9, Math.sin(t * 46 + Math.sin(x * 60) * 0.8)) * sstep(0.08, 0.2, t))
    const e = Math.abs(x) - mantleA(t)
    if (e > 0.001) {
      c = mixc(c, SK_PALE, 0.45 * sstep(0.0, 0.025, e))
      c = mixc(c, [0.86, 0.84, 0.8], 0.6 * gauss(e - 0.003, 0.0022))
      rough = 0.32
    }
    // 外套膜边缘一圈浅色细点（白色素）
    c = mixc(c, SK_PALE, 0.35 * gauss(Math.abs(x) / mantleA(t) - 0.92, 0.05))
  } else {
    // 脸团 / 口
    c = mulc(SK_LOBE, 0.95 + 0.1 * fbm(X * 20, Y * 20, Z * 20, 2))
    const F = EF[sx], p: V3 = [X - F.c[0], Y - F.c[1], Z - F.c[2]]
    const re = lenv(p)
    c = mulc(c, 1 - 0.35 * gauss(re - 0.0365, 0.0066)) // 眼周一圈暗
    c = mixc(c, SK_PALE, 0.5 * gauss(dot(p, F.u) + 0.0375, 0.009) * gauss(dot(p, F.h), 0.022)) // 眼下浅斑
    c = mixc(c, SK_PALE, 0.4 * gauss(ax - 0.04, 0.012) * gauss(Y - 1.775, 0.014)) // 额上两道浅纹
    if (Y < 1.674 && Z > 0.02) { c = mixc(c, SK_MOUTH, sstep(1.674, 1.66, Y)); rough = 0.3 }
  }
  // 斑块（较大尺度的明暗，配合着色器里的色素细胞点）
  c = mulc(c, 0.8 + 0.36 * fbm(X * 14 + 2, Y * 14, Z * 14, 3))
  setS(o, c, rough, 0, 1, 0.3, 0, 0)
}
export function headWeights(X: number, Y: number, Z: number, acc: W4) {
  // 颈：领口内归胸，往上渐变到颈、再到头
  const c = sstep(1.535, 1.48, Y), h = sstep(1.55, 1.64, Y)
  const neckish = Y < 1.65 && sdRoundCone(X, Y, Z, 0, 1.49, -0.02, 0, 1.65, -0.004, 0.052, 0.05) < 0.004
  if (Y < 1.58 || (neckish && Z < 0.012)) { acc.add(B.chest, c); acc.add(B.neck, (1 - c) * (1 - h)); acc.add(B.head, (1 - c) * h); return }
  // 口 / 触须短桩：头骨；其上（裂缝以上）分左右两半
  // 拉链：外套膜上部（裂缝上端以上）归 head，往下渐归两半
  const half = sstep(SLIT.yBottom - 0.014, SLIT.yBottom + 0.004, Y) * sstep(1.63, 1.655, Y) * sstep(SLIT.tMax + 0.05, SLIT.tMax - 0.25, mantleT(X, Y, Z))
  const wl = sstep(-0.0025, 0.0025, X)
  // 鳍：鳍面归 fin 骨
  const [t, x] = mantleLocal(X, Y, Z)
  const e = Math.abs(x) - mantleA(t)
  const fk = t > 0 && t < 1.05 ? sstep(0.002, 0.012, e) : 0
  acc.add(B.head, 1 - half)
  acc.add(B.mantleL, half * wl * (1 - fk)); acc.add(B.mantleR, half * (1 - wl) * (1 - fk))
  acc.add(B.finL, half * wl * fk); acc.add(B.finR, half * (1 - wl) * fk)
}

// ======================================================================
// 触须路径
// ======================================================================
/** 领口（衬衫领 + 后领座）的近似：绕颈的圆环 */
const NECK_C: V3 = (() => { const w = warpBH(NECK_HOLE.c); return [w[0], 1.535, w[2]] as V3 })()
function collarRing(X: number, Y: number, Z: number) { return len2(len2(X - NECK_C[0], Z - NECK_C[2]) - 0.07, (Y - NECK_C[1]) * 0.7) - 0.016 }
/** 避让场（野兽空间）：身体（西装 / 衬衫 / 领带）+ 领子 + 头 */
const BODY_W = bhSdfW(bodySdf)
export function clearSdf(X: number, Y: number, Z: number) {
  const b = BODY_W(X, Y, Z)
  return Math.min(b, collarRing(X, Y, Z), headCore(X, Y, Z))
}
const gradOf = (f: Sdf, p: V3, e = 0.0015): V3 => nrm([f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e)])
/** 触须半径（u = 0 根 → 1 尖）：v2 根部粗壮（口环上互相挤在一起），前三成快速收细，之后缓慢渐细 */
export function tentR(t: TentSpec, u: number) {
  if (t.kind === 'arm') return mix(t.r0, 0.0034, Math.pow(u, 0.72)) * (1 + 0.12 * sstep(0.25, 0.0, u))
  // 长触腕：较细的柄 + 末端触腕穗（加宽）+ 尖
  const stalk = mix(t.r0, 0.006, sstep(0, 0.6, u))
  const club = 0.0112 * gauss(u - 0.84, 0.085) * sstep(0.98, 0.9, u)
  return Math.max(stalk * sstep(1.02, 0.88, u) + 0.0024 * sstep(0.86, 1.0, u), club, mix(stalk, 0.0024, sstep(0.9, 1.0, u)))
}
export interface TentPath { spec: TentSpec; pts: V3[]; s: number[]; L: number; oral: V3[]; curlU: number }
let PATHS: TentPath[] | null = null
const rotAbout = (v: V3, ax: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a); return add(add(scl(v, c), scl(cross(ax, v), s)), scl(ax, dot(ax, v) * (1 - c))) }
/** 模拟 10 条触须的静止路径（缓存）。也会填好头部 SDF 里的根部短桩。
 *  v2：先模拟背侧（靠颈）的、再模拟腹侧的，后者躲开前者（触须之间不穿插）；下垂段带一点 S 形摆，末端卷曲 =
 *  曲率从小到大（螺线，不是等径弹簧圈）+ 卷轴随长度扭转（每条的卷曲角度 / 方向 / 圈数 / 扭转都不同） */
export function tentaclePaths(): TentPath[] {
  if (PATHS) return PATHS
  const out: TentPath[] = []
  const e1: V3 = [1, 0, 0], e2 = nrm(cross(MOUTH.n, e1))
  const obst: { p: V3; r: number }[] = []
  const order = [...TENTS].sort((a, b) => Math.sin(a.phi) - Math.sin(b.phi) || a.i - b.i)
  for (const sp of order) {
    const cphi = Math.cos(sp.phi), sphi = Math.sin(sp.phi)
    const radial = nrm(add(scl(e1, cphi), scl(e2, sphi)))
    const ringR = sp.kind === 'club' ? MOUTH.r * 0.45 : MOUTH.r * 0.86 // v3：根部收进口球（管口不外露）
    const root = add(MOUTH.c, scl(radial, ringR))
    const front = (sphi + 1) / 2, back = 1 - front
    const hv = hash1(sp.i * 3.1 + 0.7), hv2 = hash1(sp.i * 7.3 + 2.1), hv3 = hash1(sp.i * 5.7 + 4.4)
    const club = sp.kind === 'club'
    // 横向落点：背侧的往两边分开（落在两侧驳头 / 领尖上），腹侧的垂在衬衫 / 领带前；长触腕在中线两侧
    const xT = club ? sp.side * (0.012 + 0.012 * hv) : cphi * (0.03 + 0.042 * back) + (hv - 0.5) * 0.016
    const zBias = club ? 0.06 : 0.02 + 0.07 * front
    const curlStart = club ? 0.8 : 0.56 + 0.14 * hv - 0.05 * back
    const curlTot = (club ? 0.85 : 0.7 + 0.85 * hv2) * Math.PI
    // 卷轴：大体在额状面里卷（轴 ≈ ±Z），按每条的随机量前后 / 上下倾斜；背侧外缘的向外卷（八字胡），其余方向随机
    const outward = !club && (back > 0.55 || Math.abs(cphi) > 0.75)
    const csign = outward ? sp.side : hv3 > 0.5 ? 1 : -1
    let axis: V3 = nrm([(hv3 - 0.5) * 0.9, (hv - 0.5) * 0.7, 1])
    const tors = (hv2 - 0.5) * 16 // rad/m
    const step = 0.004, n = Math.ceil(sp.len / step)
    const Lc = sp.len * (1 - curlStart), K0 = curlTot / (Lc * (0.25 + 1 / 2.4))
    let d = nrm(add(scl(MOUTH.n, 1), scl(radial, club ? 0.12 : 0.38)))
    let p: V3 = root
    const pts: V3[] = [p]
    const myR = (u: number) => tentR(sp, u) + 0.0025
    const clear = (q: V3) => { let c = clearSdf(q[0], q[1], q[2]); for (const o of obst) { const dx = q[0] - o.p[0], dy = q[1] - o.p[1], dz = q[2] - o.p[2]; if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && Math.abs(dz) < 0.05) c = Math.min(c, Math.sqrt(dx * dx + dy * dy + dz * dz) - o.r) } return c }
    const clear3: Sdf = (x, y, z) => clear([x, y, z])
    for (let k = 1; k <= n; k++) {
      const u = k / n
      if (u < curlStart) {
        const cl = clearSdf(p[0], p[1], p[2])
        const wig = 0.45 * Math.sin(u * 11 + hv * 6.28) * sstep(0.12, 0.35, u)
        const g = nrm([(xT - p[0]) * (u < 0.15 ? 2 : 6) + wig, -1, zBias * (1 - u) - 0.55 * sstep(0.012, 0.04, cl) * sstep(0.12, 0.3, u)])
        d = nrm(add(scl(d, 0.88), scl(g, 0.12)))
      } else {
        const w = (u - curlStart) / (1 - curlStart)
        const kap = K0 * (0.25 + Math.pow(w, 1.4)) * (1 + 0.3 * Math.sin(w * 6 + hv * 9))
        axis = nrm(rotAbout(axis, d, tors * step))
        axis = nrm(sub(axis, scl(d, dot(axis, d))))
        d = nrm(rotAbout(d, axis, csign * kap * step))
        // 卷曲段也有一点重量（尖端微微下坠）
        d = nrm(add(d, [0, -0.02 * (1 - w), 0]))
      }
      let q = add(p, scl(d, step))
      if (k * step > 0.026) {
        const r = myR(u)
        for (let it = 0; it < 4; it++) { const c = clear(q) - r; if (c >= 0) break; q = add(q, scl(gradOf(clear3, q), -c + 0.0004)) }
      }
      d = nrm(sub(q, p)); p = q; pts.push(p)
    }
    const s: number[] = [0]
    for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + lenv(sub(pts[k], pts[k - 1])))
    const L = s[s.length - 1]
    // 口面（吸盘面）：从口环中心方向（向内）平行移动；进入卷曲段渐转向卷曲内侧（曲率法线），吸盘在卷里看得见
    const oral: V3[] = []
    let o = nrm(scl(radial, -1))
    for (let k = 0; k < pts.length; k++) {
      const a0 = pts[Math.max(0, k - 2)], a1 = pts[k], a2 = pts[Math.min(pts.length - 1, k + 2)]
      const tk = nrm(sub(a2, a0))
      o = nrm(sub(o, scl(tk, dot(o, tk))))
      const u = s[k] / L, bl = sstep(curlStart - 0.2, curlStart + 0.06, u)
      if (bl > 0 && k > 1 && k < pts.length - 2) {
        const cv = sub(add(a0, a2), scl(a1, 2))
        if (lenv(cv) > 1e-7) { const nn = nrm(sub(cv, scl(tk, dot(cv, tk)))); o = nrm(add(scl(o, 1 - 0.18 * bl), scl(nn, 0.18 * bl))) }
      }
      o = nrm(sub(o, scl(tk, dot(o, tk))))
      oral.push(o)
    }
    out.push({ spec: sp, pts, s, L, oral, curlU: curlStart })
    for (let k = 0; k < pts.length; k += 2) obst.push({ p: pts[k], r: tentR(sp, s[k] / L) })
  }
  out.sort((a, b) => a.spec.i - b.spec.i)
  // 根部短桩（头 SDF 里）：前 3.5 cm，半径略小于管
  STUBS = out.map((P) => {
    const k1 = P.s.findIndex((v) => v > 0.035)
    const a = sub(P.pts[0], scl(nrm(sub(P.pts[3], P.pts[0])), 0.02))
    return { a, b: P.pts[k1], r0: P.spec.r0 * 1.2, r1: tentR(P.spec, P.s[k1] / P.L) * 0.9 }
  })
  return (PATHS = out)
}
/** 沿弧长取路径点 / 口面方向 */
function sampleAt(P: TentPath, s: number): { p: V3; t: V3; o: V3 } {
  let k = 0
  while (k < P.s.length - 2 && P.s[k + 1] < s) k++
  const f = clamp((s - P.s[k]) / Math.max(1e-6, P.s[k + 1] - P.s[k]), 0, 1)
  const p = add(scl(P.pts[k], 1 - f), scl(P.pts[k + 1], f))
  const t = nrm(sub(P.pts[Math.min(P.pts.length - 1, k + 2)], P.pts[Math.max(0, k - 1)]))
  let o = nrm(add(scl(P.oral[k], 1 - f), scl(P.oral[k + 1], f)))
  o = nrm(sub(o, scl(t, dot(o, t))))
  return { p, t, o }
}
/** 9 节骨的位置（等弧长） */
export function tentacleBonePts(): V3[][] {
  return tentaclePaths().map((P) => Array.from({ length: N_TENT_BONES }, (_, k) => sampleAt(P, (k / N_TENT_BONES) * P.L).p))
}
/** 弧长 → 两节骨权重 */
function tentW(P: TentPath, s: number, acc: W4) {
  const f = clamp(s / P.L, 0, 1) * N_TENT_BONES
  const k = Math.min(N_TENT_BONES - 1, Math.floor(f)), fr = f - k
  // 每节骨原点在本节起点：本节内从 k 平滑过渡到 k+1（末节全归最后一节）
  const w = k < N_TENT_BONES - 1 ? sstep(0.0, 1.0, fr) : 0
  acc.add(B[tentBone(P.spec.i, k)], 1 - w)
  if (w > 0) acc.add(B[tentBone(P.spec.i, k + 1)], w)
}

// ---------- 触须网格（管 + 吸盘） ----------
export interface TentGeo { geo: THREE.BufferGeometry; tris: number }
export function buildTentacleGeometry(lod: number): TentGeo {
  const paths = tentaclePaths()
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = []
  const w = new W4()
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const vert = (p: V3, n: V3, u: number, v: number, c: number[], P: TentPath, s: number, ao = 1) => {
    pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uv.push(u, v); col.push(lin(c[0]) * ao, lin(c[1]) * ao, lin(c[2]) * ao)
    tentW(P, s, w.reset()); w.finish(B.head)
    si.push(w.i[0], w.i[1], w.i[2], w.i[3]); sw.push(w.w[0], w.w[1], w.w[2], w.w[3])
  }
  const DORS = C(0x5e4e48), ORAL = C(0xc7aea2), TIPC = C(0x8e7a70)
  for (const P of paths) {
    const sp = P.spec
    const nL = lod ? (sp.kind === 'club' ? 24 : 20) : (sp.kind === 'club' ? 62 : 52), nR = lod ? 6 : 10
    const base = pos.length / 3
    // v3：根部 4 cm（口球 / 短桩里、弯出来那段）v 固定在两排吸盘之间（v = 0.5 没有吸盘），避免根部弯折处露出一个大吸盘读成黑鼻孔
    let vAcc = 0.5, sPrev = 0
    for (let i = 0; i <= nL; i++) {
      const u = i / nL, s = u * P.L
      const { p, t, o } = sampleAt(P, s)
      const r = tentR(sp, u)
      vAcc += Math.max(0, s - Math.max(sPrev, 0.04)) / (2.3 * Math.max(r, 0.0025)); sPrev = s
      const bn = cross(t, o)
      for (let j = 0; j <= nR; j++) {
        const a = (j / nR) * Math.PI * 2 // a = 0 → 口面中心在 u = 0.5（见下）
        const ang = a - Math.PI
        const ca = Math.cos(ang), sa = Math.sin(ang)
        // 截面：口面略平（吸盘面），背面圆
        const flat = ca > 0 ? 1 - 0.18 * ca * ca : 1
        const dir = nrm(add(scl(o, ca), scl(bn, sa)))
        const q = add(p, scl(dir, r * flat))
        const oralK = sstep(0.2, 0.75, ca)
        const c = mixc(mixc(DORS, TIPC, sstep(0.6, 1.0, u)), ORAL, oralK)
        // 根部在口球里，略暗
        // 根部接口球：颜色向头皮过渡、不压暗（否则根部弯折处读成两个黑鼻孔）
        vert(q, dir, j / nR, vAcc, mixc(c, mulc(SK_LOBE, 0.95), Math.max(0.6 * sstep(0.12, 0.0, u) * (1 - oralK), 0.9 * sstep(0.065, 0.03, s))), P, s, 0.9 + 0.1 * sstep(0.0, 0.08, u)) // v3：根部 3–6.5 cm 内口面也过渡成头皮色
      }
    }
    const R = nR + 1
    for (let i = 0; i < nL; i++) for (let j = 0; j < nR; j++) { const a = base + i * R + j, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1) }
    // 尖端封口
    { const tip = sampleAt(P, P.L), ct = pos.length / 3; vert(add(tip.p, scl(tip.t, tentR(sp, 1) * 0.8)), tip.t, 0.5, vAcc + 0.5, TIPC, P, P.L); for (let j = 0; j < nR; j++) idx.push(base + nL * R + j, base + nL * R + j + 1, ct) }
    // 几何吸盘（LOD0）：口面上两排交错的小杯，近端大、远端小；长触腕只在触腕穗上
    if (!lod) {
      let s = sp.kind === 'club' ? P.L * 0.72 : 0.075, row = 0 // v3：从 7.5 cm 起（原 4 cm：根部弯折处的大吸盘杯正对前方，读成两个黑洞）
      while (s < P.L * (sp.kind === 'club' ? 0.95 : 0.9)) {
        const u = s / P.L, r = tentR(sp, u), rs = r * (sp.kind === 'club' ? 0.44 : 0.4)
        if (rs < 0.0014) break
        const { p, t, o } = sampleAt(P, s)
        const bn = cross(t, o), off = (row % 2 ? 1 : -1) * 0.42
        const n = nrm(add(scl(o, Math.cos(off)), scl(bn, Math.sin(off))))
        const c0 = add(p, scl(n, r * (1 - 0.18 * Math.cos(off) ** 2) * 0.93))
        const tg = t, bt = cross(n, tg), seg = 6, h = rs * 0.6
        const b0 = pos.length / 3
        const SC = C(0xd8c3b6), SI = C(0x6d4a44)
        for (let ring = 0; ring < 3; ring++) {
          const rr = [rs, rs * 0.92, rs * 0.55][ring], hh = [0, h, h * 0.7][ring]
          for (let j = 0; j < seg; j++) {
            const a = (j / seg) * Math.PI * 2, d2 = add(scl(tg, Math.cos(a)), scl(bt, Math.sin(a)))
            const q = add(add(c0, scl(d2, rr)), scl(n, hh))
            const nn = ring === 0 ? nrm(add(d2, scl(n, 0.6))) : ring === 1 ? nrm(add(n, scl(d2, 0.3))) : nrm(sub(n, scl(d2, 0.7)))
            vert(q, nn, 0.5, 0, ring === 2 ? SI : SC, P, s)
          }
        }
        const cc = pos.length / 3; vert(add(c0, scl(n, h * 0.25)), n, 0.5, 0, mulc(SI, 0.6), P, s)
        for (let ring = 0; ring < 2; ring++) for (let j = 0; j < seg; j++) { const a = b0 + ring * seg + j, b = b0 + ring * seg + ((j + 1) % seg); idx.push(a, b, b + seg, a, b + seg, a + seg) }
        for (let j = 0; j < seg; j++) idx.push(b0 + 2 * seg + j, b0 + 2 * seg + ((j + 1) % seg), cc)
        s += r * 1.7; row++
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  g.setIndex(idx)
  return { geo: g, tris: idx.length / 3 }
}

// ======================================================================
// 眼球（刚性，挂 eyeL / eyeR）：局部原点 = 球心，+Z = 眼朝向；uv 为正面平行投影（贴图上画 W 形瞳孔）
// ======================================================================
export function buildEyeGeometry(lod: number) {
  const g = new THREE.SphereGeometry(EYE.r, lod ? 12 : 24, lod ? 8 : 16)
  g.rotateX(Math.PI / 2) // 极轴转到 Z
  const p = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + 0.5 * p.getX(i) / EYE.r, 0.5 + 0.5 * p.getY(i) / EYE.r)
  return g
}
/** 眼球朝向四元数（局部 +Z → 眼朝向，局部 +Y 尽量朝上） */
export function eyeQuat(s: number) {
  const F = EF[s]
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...F.h).multiplyScalar(-1), new THREE.Vector3(...F.u), new THREE.Vector3(...F.n))
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

// ======================================================================
// 喙（上颚挂 beak 骨，下颚挂 beakJaw 骨；局部原点 = 各自骨原点）
// ======================================================================
/** 上颚：一把向前下勾的角质钩（左右收窄、中脊），根部一团暗红口肉 */
function beakUpperSdf(x: number, y: number, z: number) {
  // 中脊曲线：根 (0, 0.004, -0.004) → 前上 → 向下勾到尖 (0, -0.024, 0.044)
  let d = 1
  const N = 10
  let prev: V3 = [0, 0.004, -0.006]
  for (let k = 1; k <= N; k++) {
    const t = k / N, a = t * 1.9
    const cur: V3 = [0, 0.004 + 0.022 * Math.sin(a) - 0.03 * t * t * t, -0.006 + 0.04 * Math.sin(a * 0.75)]
    const r0 = mix(0.016, 0.0018, Math.pow((k - 1) / N, 0.9)), r1 = mix(0.016, 0.0018, Math.pow(t, 0.9))
    d = Math.min(d, sdRoundCone(x * 1.25, y, z, prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], r0, r1))
    prev = cur
  }
  d -= 0.001 * gauss(x, 0.002) // 中脊
  d = smin(d, sdEll(x, y, z, 0, 0.0, -0.016, 0.022, 0.02, 0.018), 0.008) // 口肉
  return d
}
function beakLowerSdf(x: number, y: number, z: number) {
  // 局部原点 = 下颚铰点；向前上勾，比上颚短、藏在上颚里
  let d = 1
  let prev: V3 = [0, -0.002, -0.008]
  for (let k = 1; k <= 8; k++) {
    const t = k / 8
    const cur: V3 = [0, -0.002 - 0.012 * Math.sin(t * 2.2) + 0.016 * t * t, -0.008 + 0.034 * t]
    d = Math.min(d, sdRoundCone(x * 1.3, y, z, prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], mix(0.012, 0.0016, (k - 1) / 8), mix(0.012, 0.0016, t)))
    prev = cur
  }
  return d
}
const BK_TIP = C(0x0e0806), BK_MID = C(0x3a2214), BK_BASE = C(0x7a5434)
function beakGeo(f: Sdf, box: [V3, V3], lod: number, upper: boolean) {
  let s = extract(f, { min: box[0] as [number, number, number], max: box[1] as [number, number, number], h: lod ? 0.0026 : 0.0013, project: 1 })
  const target = lod ? 300 : (upper ? 900 : 600)
  if (s.idx.length / 3 > target) { s = decimate(s, target); reproject(f, s, 0, lod ? 0.002 : 0.0008) } // 减面后法线要重新取 SDF 梯度
  const g = new THREE.BufferGeometry()
  const col = new Float32Array(s.vcount * 3), lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  for (let i = 0; i < s.vcount; i++) {
    const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2]
    let c: number[]
    const flesh = upper && sdEll(x, y, z, 0, 0.0, -0.016, 0.022, 0.02, 0.018) < 0.001 && z < 0.002
    if (flesh) c = mixc(FLESH, FLESH_DK, 0.4 + 0.4 * vnoise(x * 300, y * 300, z * 300))
    else { const tt = clamp((z + 0.004) / 0.045, 0, 1); c = mixc(BK_BASE, BK_MID, sstep(0, 0.35, tt)); c = mixc(c, BK_TIP, sstep(0.3, 0.8, tt)) }
    const ao = sdfAO(f, x, y, z, s.nrm[i * 3], s.nrm[i * 3 + 1], s.nrm[i * 3 + 2], 0.004, 1.6)
    col[i * 3] = lin(c[0]) * (0.5 + 0.5 * ao); col[i * 3 + 1] = lin(c[1]) * (0.5 + 0.5 * ao); col[i * 3 + 2] = lin(c[2]) * (0.5 + 0.5 * ao)
  }
  g.setAttribute('position', new THREE.BufferAttribute(s.pos.slice(0, s.vcount * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(s.nrm.slice(0, s.vcount * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setIndex(new THREE.BufferAttribute(s.idx, 1))
  return g
}
export function buildBeakGeometry(lod: number) {
  return {
    upper: beakGeo(beakUpperSdf, [[-0.03, -0.035, -0.04], [0.03, 0.035, 0.06]], lod, true),
    lower: beakGeo(beakLowerSdf, [[-0.025, -0.03, -0.025], [0.025, 0.025, 0.04]], lod, false),
  }
}
/** 检查用：喙在静止姿态下的世界点（上颚 SDF 内部离头表面的最小余量） */
export const beakUpperSdfW = (X: number, Y: number, Z: number) => beakUpperSdf(X - BEAK.c[0], Y - BEAK.c[1], Z - BEAK.c[2])
void fbm
