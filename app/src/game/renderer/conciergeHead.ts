// [concierge v3] 看门人（Entity 131）头 + 颈：真实感黑山羊头，整块 SDF 雕刻（无缝），对照 ZAN 附图。
// v3（10-30，头颈精修）：
//   · 眼：每只眼长在骨头里 —— 眶上眉弓遮挡、下睑下的颧骨隆起、泪沟、上睑沟；眼球大半没入，皮肤「睑套」只露杏仁形睑裂，
//     睑缘有厚度（睑套壳的圆角断面），眼窝空腔容纳可眨的眼睑骨片（睁开时藏在睑套里，lid 转到 0 时盖住睑裂）。
//   · 头型：颅顶 / 枕部更饱满；吻部收窄、罗马鼻拱更明显；下颌缘清楚；真正的嘴裂（贯通的口裂 + 口腔：腭、口底、舌；下门齿在 conciergeMesh 里做）。
//   · 耳：去掉耳内细波纹（减面疙瘩来源），耳郭边缘加厚卷起，内侧两道宽软骨褶，略下垂，耳根卷筒与头平滑相接。
//   · 颈：按高度放样的椭圆截面 —— 枕部后凸 → 颈背内凹 → 向肩部外展的 S 形颈背线；胸锁乳突肌 V 形、喉结；颈比头窄，下端收进衣领。
//   · 细节分区：眼区（每侧一块）、耳、吻部单独用细格提取（conciergeMesh 用重叠带拼接），粗格只管颅 / 颈 / 颊。
//   · 毛：顶点带毛流方向（沿鼻梁向下、脸颊向后、颈部向下、耳沿耳轴），着色器沿毛流画笔触；颈毛 / 颌下胡须 / 角根毛用发片（conciergeMesh）。
// v4（10-30）：眼球放大 ~1.36 倍、睑裂开大（露出约一半眼球）、球心只没入 0.6r、眉弓 / 颧隆起让开睑裂、睑套变薄；虹膜调色 + 自发光；
//   下颌铰点移到颞下颌关节（耳根下方），下颌权重沿「铰点 → 嘴角 → 口裂」线，喉部皮肤按到下颌缘距离渐变；颈毛短而黑、成簇；
//   口腔近口裂平面 / 侧壁压暗（闭嘴不透红）；颧骨嵴软化；下门齿略降（闭嘴不露白）。
// 规范坐标：x 横向 / u 沿脸（后脑 → 鼻尖）/ v 背侧（额头方向），原点 = 寰椎 head 骨；整头低头 HEAD_PITCH。
import * as THREE from 'three'
import { clamp, fbm, gauss, len2, len3, mix, sdEll, sdRoundCone, smax, smin, sstep, vnoise } from './conciergeSdf'
import { B, EAR_BASE, JAW_HINGE, HV, HU, J, W4, HEAD_OU, HEAD_OV, HEAD_SCALE, headToWorld, dirToHead, dirFromHead, dot, nrm, cross, sub, type V3 } from './conciergeRig'

/** 一只可眨的眼：g 为眼窝骨（固定），ball 为眼球骨（转动看人），lidU / lidL 绕局部 X 转（0 = 闭合，open 为睁开角）。局部 +Z 朝外、+X 沿眼裂。 */
export interface CEye { g: THREE.Object3D; ball: THREE.Object3D; lidU: THREE.Object3D; lidL: THREE.Object3D; open: [number, number]; r: number }
/** 眼的安装信息（模型空间） */
export interface EyeMount { c: V3; z: V3; x: V3; r: number; parent: string; open: [number, number]; skin: 'fur' | 'arm' }

// ---------- 剖面插值 ----------
function prof(knots: number[], vals: number[], u: number) {
  if (u <= knots[0]) return vals[0]
  for (let i = 1; i < knots.length; i++) if (u <= knots[i]) { const t = (u - knots[i - 1]) / (knots[i] - knots[i - 1]); const s = t * t * (3 - 2 * t); return mix(vals[i - 1], vals[i], mix(t, s, 0.6)) }
  return vals[vals.length - 1]
}
/** 椭圆近似距离 */
function sdEllipse(x: number, y: number, a: number, b: number) { const k0 = len2(x / a, y / b), k1 = len2(x / (a * a), y / (b * b)); return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1 }

/** 细节开关：LOD1 粗格表达不了眼窝空腔 / 口裂，关掉（眼退化为半嵌的珠子、嘴为刻线） */
let DETAIL = true
export function setHeadDetail(on: boolean) { DETAIL = on }

// 上颌 / 鼻：放样剖面（u 节点）——罗马鼻：鼻梁中段（u≈0.2）拱起，再落到钝鼻头
const MU = [0.085, 0.125, 0.165, 0.2, 0.235, 0.262, 0.282, 0.296, 0.305]
const M_TOP = [0.078, 0.068, 0.0645, 0.0675, 0.0645, 0.0555, 0.0445, 0.031, 0.01]
const M_BOT = [-0.032, -0.042, -0.047, -0.05, -0.053, -0.054, -0.053, -0.048, -0.038]
const M_W = [0.078, 0.069, 0.061, 0.056, 0.0535, 0.0515, 0.0495, 0.0445, 0.031]
// 下颌：下缘（下颌骨缘）清楚，下巴收
const DU = [0.02, 0.06, 0.11, 0.16, 0.21, 0.25, 0.275, 0.29, 0.298]
const D_TOP = [-0.03, -0.042, -0.05, -0.054, -0.056, -0.057, -0.057, -0.058, -0.06]
const D_BOT = [-0.112, -0.122, -0.111, -0.1, -0.093, -0.091, -0.089, -0.083, -0.074]
const D_W = [0.05, 0.05, 0.044, 0.038, 0.033, 0.03, 0.028, 0.023, 0.014]
/** 嘴裂线（v） */
export const mouthV = (u: number) => -0.055 - 0.003 * sstep(0.24, 0.3, u)
/** 嘴角（u） */
const MOUTH_C = 0.23
/** 口裂半宽（闭嘴时唇间的暗线） */
// v4：0.0016 → 0.002（细格 2.9 mm 下唇前端偶尔被连成一片，张嘴时拉出一条细膜）
const CLEFT_G = 0.002

function loft(x: number, u: number, v: number, K: number[], TOP: number[], BOT: number[], W: number[], ridge: number, box = 0) {
  const uc = clamp(u, K[0], K[K.length - 1])
  const top = prof(K, TOP, uc), bot = prof(K, BOT, uc), w = prof(K, W, uc)
  const vc = (top + bot) * 0.5, hh = Math.max(0.004, (top - bot) * 0.5)
  const vn = (v - vc) / hh
  const ww = w * (1 - ridge * sstep(0.15, 1.05, vn)) // 上缘收窄成鼻梁脊
  let d2 = sdEllipse(x, v - vc, Math.max(0.004, ww), hh)
  if (box > 0) { // 方一点的截面（下颌：侧面平、下缘成棱）
    const bx = Math.abs(x) - ww * 0.9, bv = Math.abs(v - vc) - hh * 0.9
    const db = len2(Math.max(bx, 0), Math.max(bv, 0)) + Math.min(Math.max(bx, bv), 0) - Math.min(ww, hh) * 0.1
    d2 = mix(d2, db, box)
  }
  const du = u - uc
  return du === 0 ? d2 : len2(Math.max(d2, 0), du) + Math.min(d2, 0)
}

// ---------- 眼位（规范坐标；每侧上 / 下）----------
// v4：眼球放大约 1.36 倍，两眼间距拉开一点（上眼略后上、下眼略前下）
const EYES_C: { u: number; v: number; r: number }[] = [{ u: 0.108, v: 0.047, r: 0.0198 }, { u: 0.158, v: 0.0165, r: 0.0186 }]
/** 睑裂（角度）：沿眼裂 ±A，上缘 / 下缘仰角 */
// v4：睑裂开大（v3 0.57 / 0.41 → 只剩细缝），睁眼露出约一半眼球
const EYE_A = 1.06, EYE_UP = 0.68, EYE_DN = 0.5
/** 眼窝空腔 / 睑套半径（× 眼球半径）；眼睑骨片在 1.025–1.075r 之间转动 */
const CAV = 1.14, MANT_R = 1.21, MANT_T = 0.085
/** 球心没入骨面的深度（× r）：v3 0.92 → v4 0.6（眼球更外凸，不再被眉弓吞掉） */
const EYE_SINK = 0.6
interface EyeC { c: V3; n: V3; ex: V3; ey: V3; r: number; s: number; nas: number }
let eyeCache: EyeC[] | null = null

/** 头骨基础形（不含眼窝 / 鼻孔等刻画），用于定位眼睛 */
function skull(x: number, u: number, v: number) {
  const ax = Math.abs(x)
  // 颅顶（后部饱满）+ 宽平额板 + 枕部后凸 + 颅顶穹隆
  let d = sdEll(x, u, v, 0, 0.05, 0.028, 0.069, 0.077, 0.068)
  d = smin(d, sdEll(x, u, v, 0, 0.105, 0.048, 0.08, 0.072, 0.042), 0.03)
  d = smin(d, sdEll(x, u, v, 0, -0.012, -0.018, 0.055, 0.05, 0.055), 0.035)
  d = smin(d, sdEll(x, u, v, 0, 0.03, 0.055, 0.066, 0.058, 0.042), 0.03)
  // 长鼻梁 + 上颌
  d = smin(d, loft(x, u, v, MU, M_TOP, M_BOT, M_W, 0.1), 0.03)
  // 咬肌 / 颊
  d = smin(d, sdEll(ax, u, v, 0.046, 0.083, -0.05, 0.032, 0.058, 0.048), 0.03)
  // 下颌（放样，方截面 → 下颌骨缘成棱）
  d = smin(d, loft(x, u, v, DU, D_TOP, D_BOT, D_W, 0.0, 0.45), 0.014)
  // 颧骨嵴（眼下向前的骨棱）
  // v4：颧骨嵴加粗、软接（v3 是一道硬嵴线）
  d = smin(d, sdEll(ax, u, v, 0.05, 0.168, -0.01, 0.012, 0.045, 0.015), 0.028)
  // 眼区骨架：额两侧到颧骨的一整块宽骨面（两只眼都长在它的外侧面上）
  d = smin(d, sdEll(ax, u, v, 0.046, 0.134, 0.026, 0.034, 0.06, 0.042), 0.03)
  // 鼻头（圆钝、略鼓）+ 下巴
  d = smin(d, sdEll(x, u, v, 0, 0.291, -0.012, 0.042, 0.018, 0.032), 0.016)
  d = smin(d, sdEll(x, u, v, 0, 0.272, -0.072, 0.022, 0.021, 0.015), 0.012)
  return d
}
function eyes(): EyeC[] {
  if (eyeCache) return eyeCache
  const out: EyeC[] = []
  for (const s of [1, -1]) for (const e of EYES_C) {
    let lo = 0, hi = 0.16
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (skull(s * m, e.u, e.v) < 0) lo = m; else hi = m }
    const P: V3 = [s * lo, e.u, e.v], k = 0.002
    let n = nrm([skull(P[0] + k, P[1], P[2]) - skull(P[0] - k, P[1], P[2]), skull(P[0], P[1] + k, P[2]) - skull(P[0], P[1] - k, P[2]), skull(P[0], P[1], P[2] + k) - skull(P[0], P[1], P[2] - k)])
    // 山羊眼朝侧前：法线偏向世界前方，正面能看到每只眼的一部分
    const fwd = dirToHead([0, 0.2, 1])
    n = nrm([n[0] * 1.0 + fwd[0] * 1.05, n[1] + fwd[1] * 1.05, n[2] + fwd[2] * 1.05])
    // 球心在骨面以内 EYE_SINK·r
    const c: V3 = [P[0] - n[0] * e.r * EYE_SINK, P[1] - n[1] * e.r * EYE_SINK, P[2] - n[2] * e.r * EYE_SINK]
    // 眼裂方向：与世界地面平行（横瞳）
    const up = dirToHead([0, 1, 0])
    const ex = nrm(cross(up, n)), ey = cross(n, ex)
    out.push({ c, n, ex, ey: ey as V3, r: e.r, s, nas: ex[1] >= 0 ? 1 : -1 })
  }
  return (eyeCache = out)
}
/** 眼局部坐标 → 睑裂几何：az（沿眼裂方位）、el（仰角）、o（到睑裂开口的近似距离，开口内为负） */
function lidGeo(lx: number, ly: number, lz: number, R: number) {
  const L = len3(lx, ly, lz)
  const az = Math.atan2(lx, lz), el = Math.atan2(ly, len2(lx, lz))
  const k = Math.max(0, 1 - (az / EYE_A) * (az / EYE_A)), kk = Math.pow(k, 0.75)
  // 内眼角（鼻侧）略低、外眼角略高
  const tilt = 0.06 * az / EYE_A
  const o = Math.max(el - EYE_UP * kk - tilt, -EYE_DN * kk - tilt - el, Math.abs(az) - EYE_A) * R * MANT_R
  return { L, az, el, k, o }
}
/** 眼窝 + 眉弓 + 颧骨隆起 + 睑套（加到头骨上） */
function eyeSockets(d: number, x: number, u: number, v: number) {
  const E = eyes()
  for (let i = 0; i < E.length; i++) {
    const e = E[i]
    const px = x - e.c[0], pu = u - e.c[1], pv = v - e.c[2]
    const R = e.r
    if (px * px + pu * pu + pv * pv > 11 * R * R) continue // v4：眼放大后收紧影响半径（3.3r 外眉弓 / 颧隆起 / 睑套都已为 0）
    const lx = px * e.ex[0] + pu * e.ex[1] + pv * e.ex[2], ly = px * e.ey[0] + pu * e.ey[1] + pv * e.ey[2], lz = px * e.n[0] + pu * e.n[1] + pv * e.n[2]
    // 眶上眉弓：压在睑裂上方、向外挑出，形成遮挡
    // v4：眉弓上移、压低，留出开大的睑裂（仍有骨缘的嵌入感，但不再盖住眼）
    d = smin(d, sdEll(lx, ly, lz, e.nas * 0.15 * R, 1.52 * R, 0.18 * R, 1.6 * R, 0.5 * R, 0.62 * R), 0.65 * R)
    // 下睑下的颧骨隆起（向鼻侧延伸）
    d = smin(d, sdEll(lx, ly, lz, e.nas * 0.4 * R, -1.5 * R, 0.08 * R, 1.75 * R, 0.6 * R, 0.55 * R), 0.8 * R)
    if (!DETAIL) continue
    const g = lidGeo(lx, ly, lz, R)
    // 睑套：包住眼球的皮肉壳，只留杏仁形睑裂；断面圆角 = 睑缘厚度
    const shell = Math.abs(g.L - MANT_R * R) - MANT_T * R
    const mantle = smax(shell, -g.o, 0.11 * R)
    d = smin(d, mantle, 0.42 * R)
    // 上睑沟（睑缘上方一道浅沟）
    d += 0.05 * R * gauss(g.el - EYE_UP * Math.pow(g.k, 0.75) - 0.36, 0.1) * g.k * sstep(0.2, 0.8, lz / R)
    // 泪沟：内眼角斜向下前方
    {
      const ax0 = e.nas * 1.05 * R, ay0 = -0.35 * R, az0 = 0.95 * R, bx = e.nas * 1.75 * R, by = -1.6 * R, bz = 0.75 * R
      const ex = bx - ax0, ey = by - ay0, ez = bz - az0, L2 = ex * ex + ey * ey + ez * ez
      const t = clamp(((lx - ax0) * ex + (ly - ay0) * ey + (lz - az0) * ez) / L2, 0, 1)
      d += 0.12 * R * gauss(len3(lx - ax0 - ex * t, ly - ay0 - ey * t, lz - az0 - ez * t), 0.28 * R) * (1 - 0.6 * t)
    }
  }
  if (DETAIL) for (let i = 0; i < E.length; i++) {
    const e = E[i], R = e.r
    const px = x - e.c[0], pu = u - e.c[1], pv = v - e.c[2]
    if (px * px + pu * pu + pv * pv > 4 * R * R) continue
    const lz = px * e.n[0] + pu * e.n[1] + pv * e.n[2]
    // 眼窝空腔（只要前半，后面藏在骨里）
    const cav = Math.max(len3(px, pu, pv) - CAV * R, -lz - 0.45 * R)
    d = Math.max(d, -cav)
  }
  return d
}

// ---------- 耳 ----------
interface EarF { o: V3; a: V3; b: V3; c: V3; s: number }
let earCache: EarF[] | null = null
function earFrames(): EarF[] {
  if (earCache) return earCache
  earCache = [1, -1].map((s) => {
    const o: V3 = [s * EAR_BASE[0], EAR_BASE[1], EAR_BASE[2]]
    const a = nrm(dirToHead([s * 1, -0.13, -0.2])) // 略下垂
    const c0 = dirToHead(nrm([0, 0.35, 1])) // 内侧朝前上
    const c = nrm(sub(c0, [a[0] * dot(c0, a), a[1] * dot(c0, a), a[2] * dot(c0, a)]))
    const b = nrm(cross(c, a))
    return { o, a, b, c, s }
  })
  return earCache
}
const EAR_L = 0.152
const earW = (t: number) => { const k = clamp(t / EAR_L, 0, 1); return (0.012 + 0.026 * Math.pow(Math.sin(Math.PI * Math.pow(k, 0.72)), 0.85) * (1 - 0.15 * k)) * Math.sqrt(Math.max(0.02, 1 - Math.pow(k, 7))) }
/** 耳中面偏移（杯形 + 末端下卷 + 内侧两道宽软骨褶）*/
const earMidW = (ta: number, tb: number, w: number) => {
  const k = clamp(ta / EAR_L, 0, 1), q = clamp(tb / w, -1, 1)
  const cup = -0.0105 * (1 - q * q) * Math.sin(Math.PI * Math.min(1, k * 1.15)) - 0.01 * k * k
  const fold = (0.0016 * gauss(q + 0.3, 0.24) + 0.001 * gauss(q - 0.25, 0.22)) * sstep(0.03, 0.15, k) * (1 - sstep(0.35, 0.65, k))
  return cup + fold
}
/** 半厚：根部厚、向末端变薄，耳缘卷起加厚 */
const earTh = (ta: number, q: number) => (0.0031 - 0.0011 * clamp(ta / EAR_L, 0, 1)) * (1 + 0.6 * sstep(0.7, 0.98, Math.abs(q))) * (DETAIL ? 1 : 3)
function earSdf(e: EarF, x: number, u: number, v: number) {
  const px = x - e.o[0], pu = u - e.o[1], pv = v - e.o[2]
  const ta = px * e.a[0] + pu * e.a[1] + pv * e.a[2], tb = px * e.b[0] + pu * e.b[1] + pv * e.b[2], tc = px * e.c[0] + pu * e.c[1] + pv * e.c[2]
  { const bd = len3(ta - 0.07, tb, tc) - 0.115; if (bd > 0.025) return bd }
  const tac = clamp(ta, 0, EAR_L)
  const w = earW(tac), q = tb / w, th = earTh(tac, q)
  const dw = Math.abs(tb) - w, dt = Math.abs(tc - earMidW(tac, tb, w)) - th
  let d = smax(smax(dw, dt, th * 0.9), Math.max(-ta, ta - EAR_L - 0.004), 0.006)
  // 耳根卷筒
  d = smin(d, sdRoundCone(ta, tb, tc, -0.022, 0, -0.004, 0.045, 0, -0.006, 0.017, 0.0085), 0.014)
  return d
}

// ---------- 角根 ----------
const HORN = [1, -1].map((s) => { const o: V3 = [s * 0.033, 0.068, 0.083]; const dir = nrm(dirToHead([s * 0.45, 0.8, -0.45])); return { o, dir, s } })
const HORN_L = 0.05
function hornT(x: number, u: number, v: number) { let t = 0; for (const h of HORN) t = Math.max(t, clamp(((x - h.o[0]) * h.dir[0] + (u - h.o[1]) * h.dir[1] + (v - h.o[2]) * h.dir[2]) / HORN_L, 0, 1)); return t }
function hornSdf(x: number, u: number, v: number) {
  let d = 1
  for (const h of HORN) {
    const L = HORN_L
    const t = clamp(((x - h.o[0]) * h.dir[0] + (u - h.o[1]) * h.dir[1] + (v - h.o[2]) * h.dir[2]) / L, 0, 1)
    // 环纹：根部密而深、向尖端变浅
    d = Math.min(d, sdRoundCone(x, u, v, h.o[0], h.o[1], h.o[2], h.o[0] + h.dir[0] * L, h.o[1] + h.dir[1] * L, h.o[2] + h.dir[2] * L, 0.0165, 0.0075) - 0.0019 * Math.pow(Math.abs(Math.sin(t * 19)), 0.6) * (1 - 0.65 * t))
  }
  return d
}

// ---------- 山羊胡（SDF 芯；外层是发片）----------
export const HANG: V3 = dirToHead([0, -1, 0.12])
const BEARD = [[0, 0.266, -0.082, 0.042, 0.011], [0.01, 0.256, -0.084, 0.034, 0.009], [-0.01, 0.258, -0.084, 0.036, 0.009], [0.004, 0.276, -0.078, 0.028, 0.0075], [-0.005, 0.247, -0.088, 0.032, 0.0085]]
function beardSdf(x: number, u: number, v: number) {
  let d = 1
  for (let i = 0; i < BEARD.length; i++) {
    const bx = BEARD[i][0], bu = BEARD[i][1], bv = BEARD[i][2], L = BEARD[i][3], r = BEARD[i][4]
    const ex = bx + HANG[0] * L + bx * 0.5, eu = bu + HANG[1] * L, ev = bv + HANG[2] * L
    d = smin(d, sdRoundCone(x, u, v, bx, bu, bv, ex, eu, ev, r, 0.0032), 0.008)
  }
  return d + 0.0012 * vnoise(x * 400, u * 400 + v * 150, v * 400)
}

// ---------- 鼻孔：逗号形刻槽 ----------
const NOS = [[0.006, -0.026], [0.012, -0.016], [0.019, -0.006], [0.022, 0.003], [0.018, 0.009]]
function nostrilCarve(x: number, _u: number, v: number) {
  const ax = Math.abs(x)
  let best = 1, bt = 0
  for (let i = 0; i < NOS.length - 1; i++) {
    const ax0 = NOS[i][0], av0 = NOS[i][1], ax1 = NOS[i + 1][0], av1 = NOS[i + 1][1]
    const ex = ax1 - ax0, ev = av1 - av0, L2 = ex * ex + ev * ev
    const t = clamp(((ax - ax0) * ex + (v - av0) * ev) / L2, 0, 1)
    const dd = len2(ax - ax0 - ex * t, v - av0 - ev * t)
    if (dd < best) { best = dd; bt = (i + t) / (NOS.length - 1) }
  }
  return best - (0.0047 * (1 - 0.5 * bt) + 0.0009)
}

// ---------- 口腔 ----------
/** 口腔空腔（主腔 + 门齿后的前庭） */
function mouthCavity(x: number, u: number, v: number) {
  return smin(sdEll(x, u, v, 0, 0.188, -0.058, 0.025, 0.078, 0.0128), sdEll(x, u, v, 0, 0.252, -0.0595, 0.023, 0.021, 0.0085), 0.008)
}
/** 舌（贴在口底，舌尖到门齿后） */
function tongueSdf(x: number, u: number, v: number) {
  return sdEll(x, u, v, 0, 0.196, -0.0652, 0.0165, 0.057, 0.006) + 0.0006 * vnoise(x * 600, u * 600, v * 600)
}
/** 口裂：从嘴角贯通到唇前（全宽），嘴角圆头 */
function cleftSdf(u: number, v: number) {
  const dv = Math.abs(v - mouthV(u)) - CLEFT_G
  if (u >= MOUTH_C) return dv
  return len2(MOUTH_C - u, Math.max(dv, 0)) + Math.min(dv, 0)
}
/** 下排门齿（规范坐标）：8 颗铲形齿，沿弓排列，齿尖前倾 */
export function lowerIncisorsCanon() {
  const out: { base: V3; tip: V3; w: number; t: number }[] = []
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * 0.0049, a = Math.abs(x)
    const u = 0.262 - 22 * x * x
    out.push({ base: [x * 0.96, u - 0.003, -0.0728], tip: [x * 1.06, u + 0.0035, -0.0632], w: 0.0047 - 0.0006 * (a / 0.018), t: 0.0021 })
  }
  return out
}

/** 头部（规范坐标）完整 SDF */
export function headCanon(x: number, u: number, v: number) {
  if (len3(x, u - 0.13, v + 0.02) > 0.36) return len3(x, u - 0.13, v + 0.02) - 0.3
  let d = skull(x, u, v)
  const ax = Math.abs(x)
  // 骨感：额板中线微凹、鼻梁两侧的浅沟、下颌骨缘上方的浅凹（让下颌线清楚）
  d += 0.0018 * gauss(x, 0.012) * sstep(0.06, 0.1, u) * (1 - sstep(0.14, 0.18, u)) * sstep(0.03, 0.06, v)
  d += 0.0018 * gauss(ax - 0.03, 0.007) * sstep(0.15, 0.19, u) * (1 - sstep(0.25, 0.28, u)) * sstep(0.0, 0.04, v)
  { const db = prof(DU, D_BOT, clamp(u, DU[0], DU[DU.length - 1])); d += 0.0022 * gauss(v - db - 0.017, 0.007) * sstep(0.04, 0.09, u) * (1 - sstep(0.2, 0.26, u)) * sstep(0.015, 0.03, ax) }
  // 唇：上唇两瓣 + 下唇（唇缘略外翻）
  d = smin(d, sdEll(ax, u, v, 0.012, 0.284, -0.047, 0.014, 0.014, 0.01), 0.008)
  d = smin(d, sdEll(x, u, v, 0, 0.281, -0.0635, 0.017, 0.014, 0.0088), 0.008)
  // 唇线沿口裂两侧微微鼓起（唇缘），让嘴裂更清楚
  if (u > 0.17) d -= 0.0011 * gauss(Math.abs(v - mouthV(u)) - 0.0035, 0.0025) * sstep(0.19, 0.23, u)
  // 鼻翼（鼻孔外侧鼓起）
  d = smin(d, sdEll(ax, u, v, 0.021, 0.29, -0.006, 0.009, 0.01, 0.013), 0.007)
  if (u > 0.17) {
    if (DETAIL) {
      // 口裂 + 口腔（贯通），再放回舌
      const cut = Math.min(mouthCavity(x, u, v), cleftSdf(u, v))
      d = smax(d, -cut, 0.0012)
      d = smin(d, tongueSdf(x, u, v), 0.004)
    } else if (u > 0.2) {
      const g = Math.abs(v - mouthV(u)) - 0.001 - 0.001 * sstep(0.26, 0.3, u)
      d = smax(d, -Math.max(g, -(d + 0.007 * sstep(0.225, 0.255, u))), 0.0025)
    }
    // 人中沟（上唇分裂）
    if (u > 0.262) { const gp = Math.max(ax - 0.0019, v + 0.021, mouthV(u) - v); d = smax(d, -Math.max(gp, -(d + 0.005)), 0.002) }
    // 鼻孔
    if (u > 0.255) { const n = nostrilCarve(x, u, v); d = smax(d, -Math.max(n, -(d + 0.013)), 0.0022) }
  }
  // 角根、耳、胡子
  if (len3(ax - 0.035, u - 0.07, v - 0.1) < 0.08) {
    const hd = hornSdf(x, u, v)
    // 角根周围一圈蓬起的毛（角从毛里长出来）
    d -= 0.0022 * gauss(hd, 0.006) * (0.6 + 0.4 * vnoise(x * 500, u * 500, v * 500))
    d = smin(d, hd, 0.005)
  }
  if (ax > 0.02) for (const e of earFrames()) if (e.s * x > 0) d = smin(d, earSdf(e, x, u, v), 0.014)
  if (len3(x, u - 0.262, v + 0.11) < 0.09) d = smin(d, beardSdf(x, u, v), 0.008)
  // 眼
  d = eyeSockets(d, x, u, v)
  return d
}

// ---------- 颈（世界坐标）：按高度放样的椭圆截面 ----------
const NECK_A: V3 = [0, 1.57, -0.042], NECK_B: V3 = [0, 1.79, 0.0]
//             Y:    1.52    1.58    1.64    1.70    1.76    1.81    1.86    1.9
// 颈背线：接着枕部的斜线一路外凸下行到肩（没有「兜帽」式的直柱）；颈前：下颌后 → 喉 → 领口
const NK_Y = [1.52, 1.58, 1.64, 1.7, 1.76, 1.81, 1.86, 1.91, 1.95]
const NK_BACK = [-0.108, -0.106, -0.1045, -0.102, -0.098, -0.092, -0.083, -0.07, -0.052]
const NK_FRONT = [0.03, 0.03, 0.034, 0.036, 0.03, 0.022, 0.012, 0.0, -0.01]
const NK_RX = [0.059, 0.056, 0.052, 0.05, 0.05, 0.052, 0.055, 0.056, 0.05]
function neckWorld(X: number, Y: number, Z: number) {
  const Yc = clamp(Y, NK_Y[0], NK_Y[NK_Y.length - 1])
  const back = prof(NK_Y, NK_BACK, Yc), front = prof(NK_Y, NK_FRONT, Yc), rx = prof(NK_Y, NK_RX, Yc)
  const zc = (back + front) * 0.5, rz = (front - back) * 0.5
  // 截面：后侧更宽（斜方肌 / 项韧带）、前侧收窄（喉）
  const zn = (Z - zc) / rz
  const rxx = rx * (1 - 0.14 * sstep(0.1, 1.0, zn))
  let d = sdEllipse(X, Z - zc, rxx, rz) * 0.92
  d = smax(d, Y - 1.95, 0.03)
  // 胸锁乳突肌：耳后乳突 → 胸骨柄，颈前成 V
  for (const s of [1, -1]) d = smin(d, sdRoundCone(X, Y, Z, s * 0.044, 1.84, -0.045, s * 0.012, 1.575, 0.028, 0.0125, 0.011), 0.022)
  // 喉结（小）
  d = smin(d, sdEll(X, Y, Z, 0, 1.665, 0.036, 0.013, 0.02, 0.01), 0.014)
  // 颈毛：竖向成簇（y 方向拉长的噪声），越往下越蓬、后颈更长
  const shag = sstep(1.86, 1.68, Y) * (0.6 + 0.4 * sstep(0.0, -0.07, Z))
  if (shag > 0) d -= shag * (0.0008 + 0.0018 * fbm(X * 140, Y * 30, Z * 140, 2) + 0.0007 * vnoise(X * 380, Y * 80, Z * 380))
  return d
}

/** 世界坐标 → 规范坐标 */
const IS = 1 / HEAD_SCALE
/** 吻部缩短：设计坐标里 u>0.13 的部分在真实空间压短到 1/MW（世界 → 设计用 warpU，反之 unwarpU） */
// v3：斜率在 u∈[MU0, MU1] 内平滑地从 1 过渡到 MW（v2 是 u=0.13 处的折线 → 颊上一道硬折痕）
const MW = 1.19, MU0 = 0.095, MU1 = 0.17, MWW = MU1 - MU0
const warpSlope = (u: number) => 1 + (MW - 1) * sstep(MU0, MU1, u)
const warpU = (u: number) => {
  if (u <= MU0) return u
  const t = Math.min(1, (u - MU0) / MWW)
  return u + (MW - 1) * (MWW * (t * t * t - 0.5 * t * t * t * t) + Math.max(0, u - MU1))
}
const unwarpU = (w: number) => { let u = w; for (let i = 0; i < 8; i++) u -= (warpU(u) - w) / warpSlope(u); return u }
export function toHead(X: number, Y: number, Z: number): V3 {
  const dx = X - J.head[0], dy = Y - J.head[1], dz = Z - J.head[2]
  return [dx * IS, warpU((dy * HU[1] + dz * HU[2]) * IS + HEAD_OU), (dy * HV[1] + dz * HV[2]) * IS + HEAD_OV]
}
/** 规范（设计）坐标 → 世界 */
export const canonToWorld = (p: V3): V3 => headToWorld(p[0], unwarpU(p[1]), p[2])
/** 头 + 颈 部件（世界坐标） */
export function headPartSdf(X: number, Y: number, Z: number) {
  const dy = Y - J.head[1], dz = Z - J.head[2]
  const tu = (dy * HU[1] + dz * HU[2]) * IS + HEAD_OU
  const h = headCanon((X - J.head[0]) * IS, warpU(tu), (dy * HV[1] + dz * HV[2]) * IS + HEAD_OV) * HEAD_SCALE / warpSlope(tu)
  // 颈的包围盒下界（远离颈部时不算颈的噪声毛簇）
  const bx = Math.max(Math.abs(X) - 0.075, Y - 1.97, Z - 0.06, -0.125 - Z, 1.5 - Y)
  const n = bx > 0.05 ? bx : neckWorld(X, Y, Z)
  return smin(h, n, 0.028)
}
export const NECK_AXIS: V3 = nrm(sub(NECK_B, NECK_A))
export const NECK_BASE = NECK_A
export const HEAD_BOX = { min: [-0.24, 1.53, -0.2] as [number, number, number], max: [0.24, 2.02, 0.26] as [number, number, number] }

// ---------- 细格分区（眼区 / 耳 / 吻部），粗格在重叠带外让位 ----------
type Box = { min: [number, number, number]; max: [number, number, number] }
const boxOf = (pts: V3[], pad: number): Box => {
  const mn: [number, number, number] = [1e9, 1e9, 1e9], mx: [number, number, number] = [-1e9, -1e9, -1e9]
  for (const p of pts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k] - pad); mx[k] = Math.max(mx[k], p[k] + pad) }
  return { min: mn, max: mx }
}
/** 重叠带宽（米）：细格保留 region<0，粗格保留 region>-BAND */
export const FINE_BAND = 0.0075
export interface FineRegion { name: string; box: Box; region: (X: number, Y: number, Z: number) => number }
let fineCache: FineRegion[] | null = null
export function headFineRegions(): FineRegion[] {
  if (fineCache) return fineCache
  const out: FineRegion[] = []
  // 眼区：每侧两只眼的连线胶囊
  for (const s of [1, -1]) {
    const E = eyes().filter((e) => e.s === s)
    const a = canonToWorld(E[0].c), b = canonToWorld(E[1].c), R = 0.056
    const ab = sub(b, a), L2 = dot(ab, ab)
    out.push({
      name: 'eyes' + (s > 0 ? 'L' : 'R'), box: boxOf([a, b], R + 0.012),
      region: (X, Y, Z) => { const t = clamp(((X - a[0]) * ab[0] + (Y - a[1]) * ab[1] + (Z - a[2]) * ab[2]) / L2, 0, 1); return len3(X - a[0] - ab[0] * t, Y - a[1] - ab[1] * t, Z - a[2] - ab[2] * t) - R },
    })
  }
  // 耳：耳根卷筒外侧（ta > 0.014）
  for (const e of earFrames()) {
    const pts: V3[] = []
    for (const ta of [0, EAR_L + 0.01]) for (const tb of [-0.045, 0.045]) for (const tc of [-0.03, 0.02]) pts.push(canonToWorld([e.o[0] + e.a[0] * ta + e.b[0] * tb + e.c[0] * tc, e.o[1] + e.a[1] * ta + e.b[1] * tb + e.c[1] * tc, e.o[2] + e.a[2] * ta + e.b[2] * tb + e.c[2] * tc]))
    out.push({
      name: 'ear' + (e.s > 0 ? 'L' : 'R'), box: boxOf(pts, 0.012),
      region: (X, Y, Z) => {
        const [x, u, v] = toHead(X, Y, Z), px = x - e.o[0], pu = u - e.o[1], pv = v - e.o[2]
        const ta = px * e.a[0] + pu * e.a[1] + pv * e.a[2], tb = px * e.b[0] + pu * e.b[1] + pv * e.b[2], tc = px * e.c[0] + pu * e.c[1] + pv * e.c[2]
        return Math.max(0.016 - ta, len2(tb, tc + 0.008) - 0.052, ta - EAR_L - 0.02) * HEAD_SCALE
      },
    })
  }
  // 吻部（鼻、唇、口裂、口腔、下巴、胡子芯）
  {
    const pts: V3[] = []
    for (const x of [-0.072, 0.072]) for (const u of [0.168, 0.345]) for (const v of [-0.155, 0.082]) pts.push(canonToWorld([x, u, v]))
    out.push({ name: 'muzzle', box: boxOf(pts, 0.006), region: (X, Y, Z) => { const [, u, v] = toHead(X, Y, Z); return Math.max(0.186 - u, -0.138 - v) * HEAD_SCALE } })
  }
  return (fineCache = out)
}
/** 粗格保留：在所有细格分区之外（含重叠带） */
export function headCoarseKeep(X: number, Y: number, Z: number, slack = 0) {
  for (const r of headFineRegions()) if (r.region(X, Y, Z) < -FINE_BAND - slack) return false
  return true
}

// ---------- 颜色 ----------
export interface Shade { r: number; g: number; b: number; rough: number; metal: number; fur: number; skin: number; cloth: number; wool: number; fx?: number; fy?: number; fz?: number }
const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
const FUR = C(0x211c1b), FUR_HI = C(0x3b322e), FUR_WARM = C(0x34261f), FUR_BRONZE = C(0x4a3628), NOSE = C(0x4a4041), LIP = C(0x1b1514), LID_SKIN = C(0x2a1d1b), EAR_IN = C(0x6d5853), EAR_IN_HAIR = C(0x9e8d87),
  HORN_C = C(0x3a322c), HORN_TIP = C(0x221d1a), NOSTRIL = C(0x0c0808), CONJ = C(0x2b1210), MOUTH_IN = C(0x261011), PALATE = C(0x3a1b1c), PAD = C(0x4a2e2d), TONGUE = C(0x7c4a4d), TONGUE_D = C(0x452729), MOUTH_SLIT = C(0x110a0a)
/** 规范方向 → 世界方向 */
const flowSet = (o: Shade, d: V3) => { const w = dirFromHead(d); const l = Math.hypot(w[0], w[1], w[2]) || 1; o.fx = w[0] / l; o.fy = w[1] / l; o.fz = w[2] / l }
export function headShade(X: number, Y: number, Z: number, o: Shade) {
  const [x, u, v] = toHead(X, Y, Z)
  const ax = Math.abs(x)
  let r = FUR[0], g = FUR[1], b = FUR[2]
  const to = (c: number[], k: number) => { if (k <= 0) return; if (k > 1) k = 1; r += (c[0] - r) * k; g += (c[1] - g) * k; b += (c[2] - b) * k }
  // 毛色：额与鼻梁略亮（光泽短毛），颊下更深、暖褐斑驳（附图）；低频斑驳
  const nz = fbm(x * 40, u * 40, v * 40, 2), nz2 = vnoise(x * 120, u * 120, v * 120)
  to(FUR_HI, 0.35 * sstep(0.02, 0.06, v) * sstep(0.05, 0.2, u) + 0.22 * nz)
  to(FUR_WARM, 0.35 * sstep(0.0, 0.5, nz2 + nz) * sstep(0.04, 0.07, ax))
  let rough = 0.78, fur = 1, skin = 0
  // 毛流（规范方向）：鼻梁 / 额前沿 +u 向下，脸颊向后下，颅顶向后，颈部向下
  {
    const front = sstep(0.025, 0.0, ax - 0.02 - 0.5 * Math.max(0, v - 0.0)) * sstep(0.08, 0.13, u)
    const cheek = sstep(0.03, 0.055, ax) * (1 - sstep(0.24, 0.29, u))
    const crown = sstep(0.09, 0.03, u) * sstep(0.0, 0.05, v)
    const neck = sstep(1.84, 1.74, Y)
    const wd = dirToHead([0, -1, 0])
    let fx = 0, fu = front * 1 - cheek * 0.75 - crown * 0.9, fv = -cheek * 0.55 + crown * 0.3 - front * 0.12
    fx += x * 2 * cheek
    const nl = Math.hypot(fx, fu, fv)
    let d: V3 = nl > 0.05 ? [fx / nl, fu / nl, fv / nl] : [0, 1, 0]
    d = [mix(d[0], wd[0], neck), mix(d[1], wd[1], neck), mix(d[2], wd[2], neck)]
    flowSet(o, d)
  }
  // 眼：眼窝内结膜暗红、睑缘无毛深色皮、眼周一圈暖褐（附图）
  for (const e of eyes()) {
    const px = x - e.c[0], pu = u - e.c[1], pv = v - e.c[2]
    const dd = len3(px, pu, pv)
    if (dd > e.r * 4) continue
    const R = e.r
    to(FUR_BRONZE, 0.5 * gauss(dd - R * 1.75, R * 0.8))
    if (!DETAIL) { if (dd < R * 1.45) { to(LIP, sstep(R * 1.45, R * 1.15, dd) * 0.8); rough = Math.min(rough, 0.5) } continue }
    const lx = px * e.ex[0] + pu * e.ex[1] + pv * e.ex[2], ly = px * e.ey[0] + pu * e.ey[1] + pv * e.ey[2], lz = px * e.n[0] + pu * e.n[1] + pv * e.n[2]
    const lg = lidGeo(lx, ly, lz, R)
    // 睑缘：开口边 ~0.35r 内无毛
    const rim = sstep(0.42 * R, 0.08 * R, lg.o) * sstep(0.5 * R, 1.0 * R, lz + 0.3 * R)
    if (rim > 0) { to(LID_SKIN, rim); fur *= 1 - rim; skin = Math.max(skin, rim); rough = mix(rough, 0.45, rim) }
    const inner = sstep(MANT_R * R - 0.02 * R, CAV * R + 0.02 * R, dd) * sstep(0.02 * R, -0.1 * R, lg.o)
    if (inner > 0) { to(CONJ, inner); fur *= 1 - inner; rough = mix(rough, 0.3, inner) }
  }
  // 鼻头（无毛湿亮区）
  const noseK = sstep(0.266, 0.29, u) * sstep(-0.047, -0.037, v) * (1 - sstep(0.013, 0.03, v))
  if (noseK > 0) { to(NOSE, noseK); rough = mix(rough, 0.16, noseK); fur *= 1 - noseK; skin = noseK }
  if (u > 0.255) { const n = nostrilCarve(x, u, v); const k = sstep(0.0025, -0.001, n) * sstep(0.27, 0.285, u); to(NOSTRIL, k); fur *= 1 - k; rough = mix(rough, 0.3, k) }
  // 唇与嘴裂（唇缘无毛）
  if (u > 0.19) {
    const k = sstep(0.0065, 0.0015, Math.abs(v - mouthV(u)) - CLEFT_G) * sstep(0.2, 0.235, u)
    to(LIP, k); rough = mix(rough, 0.32, k * 0.8); fur *= 1 - k; skin = Math.max(skin, k)
  }
  // 口腔：腔壁暗红、腭 / 齿垫偏粉、舌粉灰带暗斑
  if (DETAIL && u > 0.1) {
    const mc = mouthCavity(x, u, v)
    if (mc < 0.004) {
      const k = sstep(0.004, 0.0005, mc)
      const up = v > mouthV(u)
      to(up ? (u > 0.245 ? PAD : PALATE) : MOUTH_IN, k)
      const tg = tongueSdf(x, u, v)
      if (tg < 0.002) to(nz2 > 0.35 ? TONGUE_D : TONGUE, sstep(0.002, 0.0, tg) * k)
      // v4：口裂平面附近（闭嘴时从唇缝看进去的那一层）压成近黑，暗红只留在更深处 —— 闭嘴不再透出一线暗红
      // 侧壁（颊内侧）也压暗：闭嘴时从斜下方顺着嘴裂看进去只见暗色；张嘴时正面仍能看到中间的舌、腭
      const band = Math.max(sstep(0.0085, 0.003, Math.abs(v - mouthV(u))), sstep(0.01, 0.018, ax), sstep(0.215, 0.2, u) * 0.6) * k
      if (band > 0) to(MOUTH_SLIT, band * 0.92)
      fur *= 1 - k; skin = Math.max(skin, k); rough = mix(rough, 0.28, k)
    }
    if (cleftSdf(u, v) < 0.0015 && u > MOUTH_C - 0.004) { const k = sstep(0.0015, -0.0005, cleftSdf(u, v)); to(LIP, k); fur *= 1 - k; rough = mix(rough, 0.35, k) }
  }
  // 角
  if (len3(ax - 0.035, u - 0.07, v - 0.1) < 0.08) {
    const hd = hornSdf(x, u, v)
    if (hd < 0.004) {
      const k = sstep(0.004, 0.0, hd), t = hornT(x, u, v)
      const ring = 0.8 + 0.32 * Math.pow(Math.abs(Math.cos(t * 19)), 3)
      to([mix(HORN_C[0], HORN_TIP[0], t * t) * ring, mix(HORN_C[1], HORN_TIP[1], t * t) * ring, mix(HORN_C[2], HORN_TIP[2], t * t) * ring], k)
      rough = mix(rough, 0.5, k); fur *= 1 - k
    }
  }
  // 耳：内侧浅色（带浅色细毛 + 软骨褶阴影）、外侧黑；耳缘深；毛流沿耳轴
  if (ax > 0.03) for (const e of earFrames()) {
    if (e.s * x <= 0) continue
    const px = x - e.o[0], pu = u - e.o[1], pv = v - e.o[2]
    const ta = px * e.a[0] + pu * e.a[1] + pv * e.a[2]
    if (ta < 0.006 || ta > EAR_L + 0.012) continue
    const tb = px * e.b[0] + pu * e.b[1] + pv * e.b[2], tc = px * e.c[0] + pu * e.c[1] + pv * e.c[2]
    const w = earW(ta), q = tb / w
    if (Math.abs(q) > 1.15 || Math.abs(tc - earMidW(ta, tb, w)) > 0.012) continue
    const inner = sstep(-0.001, 0.0015, tc - earMidW(ta, tb, w))
    const rim = sstep(0.66, 0.9, Math.abs(q))
    const k = inner * (1 - rim) * sstep(0.014, 0.04, ta)
    const hair = (0.5 + 0.5 * Math.sin(tb * 700 + ta * 90 + 3 * vnoise(ta * 300, tb * 300, 0))) * 0.5 * sstep(0.03, 0.08, ta) * sstep(0.15, 0.55, Math.abs(q))
    const foldSh = 1 - 0.25 * (gauss(q + 0.18, 0.09) + gauss(q - 0.08, 0.08)) * sstep(0.04, 0.16, ta / EAR_L) * (1 - sstep(0.4, 0.62, ta / EAR_L))
    to([mix(EAR_IN[0], EAR_IN_HAIR[0], hair) * foldSh, mix(EAR_IN[1], EAR_IN_HAIR[1], hair) * foldSh, mix(EAR_IN[2], EAR_IN_HAIR[2], hair) * foldSh], k)
    if (k > 0.3) { skin = Math.max(skin, k * 0.5); fur = mix(fur, 0.22, k) }
    const fl = sstep(0.0, 0.02, ta)
    if (fl > 0) { const cur = dirToHead([o.fx ?? 0, o.fy ?? 0, o.fz ?? 0]); flowSet(o, [mix(cur[0], e.a[0], fl), mix(cur[1], e.a[1], fl), mix(cur[2], e.a[2], fl)]) }
  }
  // 颈毛：簇间暗缝
  if (Y < 1.86) { const k = sstep(1.86, 1.68, Y); const n = fbm(X * 140, Y * 30, Z * 140, 2); const m = (1 - k * 0.35 * clamp(-n * 2, 0, 1)) * (1 + k * 0.25 * clamp(n * 2, 0, 1)); r *= m; g *= m; b *= m }
  // 山羊胡
  if (len3(x, u - 0.262, v + 0.11) < 0.09 && beardSdf(x, u, v) < 0.002) { r *= 0.8; g *= 0.8; b *= 0.8; flowSet(o, HANG) }
  if (fur < 0.05) { o.fx = 0; o.fy = 0; o.fz = 0 }
  o.r = r; o.g = g; o.b = b; o.rough = rough; o.metal = 0; o.fur = fur; o.skin = skin; o.cloth = 0; o.wool = 0
}

// ---------- 权重：neck / head / jaw / earL / earR（领口内的颈根带一点 chest）----------
// v4：下颌 = 「铰点（颞下颌关节）→ 嘴角 → 口裂」这条线以下、铰点以前；喉部皮肤按到下颌缘的距离渐变随 jaw（平滑拉伸，不再整块转进喉部）
export function headWeights(X: number, Y: number, Z: number, acc: W4) {
  const [x, u, v] = toHead(X, Y, Z)
  const ax: V3 = nrm(sub(NECK_B, NECK_A))
  const s = (X - NECK_B[0]) * ax[0] + (Y - NECK_B[1]) * ax[1] + (Z - NECK_B[2]) * ax[2]
  // 头 / 颈分界：低头姿态下吻部和下颌在颈轴参数上很低，按规范坐标判定（吻、颌 → 头；喉部 v 更低 → 颈）
  const inHead = clamp(Math.max(sstep(-0.045, 0.01, s), sstep(0.03, 0.08, u) * sstep(-0.152, -0.118, v)), 0, 1)
  const chestK = sstep(1.63, 1.575, Y) * (1 - inHead)
  acc.add(B.chest, chestK)
  // 喉部：下颌缘以下，离下颌缘越近越随 jaw，4.5 cm 外归颈；只算颈前半、领口以上
  const db = prof(DU, D_BOT, clamp(u, DU[0], DU[DU.length - 1]))
  const throatK = 0.95 * sstep(0.075, 0.01, db - v) * sstep(-0.012, 0.004, db - v) * sstep(0.035, 0.085, u) * sstep(-0.06, 0.0, Z) * sstep(1.6, 1.64, Y)
  const neckW = (1 - inHead) * (1 - chestK), throat = neckW * throatK
  acc.add(B.jaw, throat)
  acc.add(B.neck, neckW - throat)
  if (inHead <= 0) return
  // 耳
  let earK = 0, earB = B.earL
  for (const e of earFrames()) {
    const ta = (x - e.o[0]) * e.a[0] + (u - e.o[1]) * e.a[1] + (v - e.o[2]) * e.a[2]
    const tb = (x - e.o[0]) * e.b[0] + (u - e.o[1]) * e.b[1] + (v - e.o[2]) * e.b[2], tc = (x - e.o[0]) * e.c[0] + (u - e.o[1]) * e.c[1] + (v - e.o[2]) * e.c[2]
    const k = sstep(-0.004, 0.028, ta) * sstep(0.075, 0.05, Math.abs(tb)) * sstep(0.045, 0.03, Math.abs(tc))
    if (k > earK && Math.sign(x) === e.s) { earK = k; earB = e.s > 0 ? B.earL : B.earR }
  }
  // 下颌：嘴角以前沿口裂（上下 1 mm 内切换 → 张嘴时上下唇干净分开）；嘴角以后沿「嘴角 → 铰点」斜线，越靠铰点过渡越宽（颊皮拉伸）
  const hu = JAW_HINGE[1], hv = JAW_HINGE[2], mc = mouthV(MOUTH_C)
  const lineV = u >= MOUTH_C ? mouthV(u) : mix(hv, mc, Math.pow(clamp((u - hu) / (MOUTH_C - hu), 0, 1), 0.8))
  const wv = DETAIL ? mix(0.018, 0.001, sstep(MOUTH_C - 0.07, MOUTH_C - 0.004, u)) : 0.005
  const below = sstep(lineV + wv, lineV - wv, v)
  const fwd = sstep(hu - 0.012, hu + 0.03, u)
  const jawK = clamp(Math.max(below * fwd, throatK), 0, 1) * (1 - earK)
  acc.add(earB, inHead * earK)
  acc.add(B.jaw, inHead * jawK)
  acc.add(B.head, inHead * (1 - earK - jawK))
}

/** 发片分区（世界坐标的面心 + 法线 + 发根顶点的 neck/chest 权重和）：颈毛 / 颌下短须 / 山羊胡（角根毛用 SDF 的蓬起 + 毛流着色）；密度为每平方米发片数 */
export function furZone(m: V3, n: V3, neckish: number): { kind: 'neck' | 'jaw' | 'beard'; density: number; len: number } | null {
  const [x, u, v] = toHead(m[0], m[1], m[2]), ax = Math.abs(x)
  if (ax < 0.024 && u > 0.232 && u < 0.29 && v < -0.068 && v > -0.13) {
    const onStrand = beardSdf(x, u, v) < 0.0015 && v < -0.088
    return { kind: 'beard', density: onStrand ? 9000 : 26000, len: 1 - 0.5 * sstep(0.27, 0.29, u) }
  }
  if (len3(ax - 0.035, u - 0.07, v - 0.1) < 0.08) return null
  if (u > 0.06 && u < 0.255 && n[1] < -0.2 && v > -0.15 && m[2] > -0.03) {
    const db = prof(DU, D_BOT, clamp(u, DU[0], DU[DU.length - 1]))
    if (v < db + 0.012 && ax < 0.045) return { kind: 'jaw', density: 4600 * sstep(0.06, 0.1, u), len: 0.6 + 0.3 * sstep(0.12, 0.22, u) }
  }
  const Y = m[1]
  // v4：颈毛从颈部开始（不再从后脑 y≈1.9 起垂下一片帘子），短而成簇；颈背（后）与喉下（前、低处）略长
  if (Y < 1.85 && Y > 1.585 && neckish > 0.25) {
    const back = sstep(-0.02, -0.08, m[2]), throat = sstep(0.0, 0.03, m[2]) * sstep(1.75, 1.68, Y)
    return { kind: 'neck', density: 5200 * sstep(1.85, 1.77, Y) * sstep(1.63, 1.66, Y) * (0.7 + 0.3 * back), len: (0.85 + 0.35 * back + 0.3 * throat) * (0.75 + 0.25 * sstep(1.85, 1.78, Y)) }
  }
  return null
}

/** 头上四只眼（模型空间） */
export function headEyeMounts(): EyeMount[] {
  return eyes().map((e) => {
    const dw = (d: V3): V3 => [d[0], HU[1] * d[1] + HV[1] * d[2], HU[2] * d[1] + HV[2] * d[2]]
    return { c: canonToWorld(e.c), z: dw(e.n), x: dw(e.ex), r: e.r * HEAD_SCALE, parent: 'head', open: [-0.94, 0.72] as [number, number], skin: 'fur' as const }
  })
}

// ---------- 贴图 ----------
let irisTex: THREE.Texture | null = null
/** 虹膜贴图（平面投影：u = 0.5 + x/2r, v = 0.5 + y/2r）：橙色放射纹 + 横向长方瞳孔 */
export function irisTexture() {
  if (irisTex || typeof document === 'undefined') return irisTex
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d')!
  g.fillStyle = '#1a0d06'; g.fillRect(0, 0, S, S)
  const cx = S / 2, cy = S / 2, R = S * 0.47
  const rg = g.createRadialGradient(cx, cy, R * 0.12, cx, cy, R)
  // v4：琥珀黄 → 橙 → 深色角膜缘（附图），纤维对比压低（v3 白纤维太亮，像橙子切片）
  rg.addColorStop(0, '#f6c95a'); rg.addColorStop(0.35, '#eaa032'); rg.addColorStop(0.72, '#cf7a1e'); rg.addColorStop(0.88, '#8a3e10'); rg.addColorStop(1, '#2a1006')
  g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill()
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 520; i++) { // 放射纤维
    const a = rnd() * Math.PI * 2, r0 = R * (0.15 + rnd() * 0.3), r1 = R * (0.6 + rnd() * 0.38)
    g.strokeStyle = rnd() < 0.55 ? `rgba(120,50,10,${0.12 + rnd() * 0.2})` : `rgba(255,215,130,${0.05 + rnd() * 0.1})`
    g.lineWidth = 0.6 + rnd() * 1.2; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a + (rnd() - 0.5) * 0.08) * r1, cy + Math.sin(a) * r1); g.stroke()
  }
  // 横向长方瞳孔（圆角矩形，两端略宽 —— 山羊瞳）
  g.fillStyle = '#050302'; g.beginPath()
  const pw = R * 0.62, ph = R * 0.2
  g.moveTo(cx - pw, cy - ph * 0.8); g.quadraticCurveTo(cx, cy - ph * 0.55, cx + pw, cy - ph * 0.8); g.quadraticCurveTo(cx + pw * 1.12, cy, cx + pw, cy + ph * 0.8)
  g.quadraticCurveTo(cx, cy + ph * 0.55, cx - pw, cy + ph * 0.8); g.quadraticCurveTo(cx - pw * 1.12, cy, cx - pw, cy - ph * 0.8); g.fill()
  // 角膜高光
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(cx - R * 0.32, cy - R * 0.36, R * 0.09, R * 0.06, -0.5, 0, Math.PI * 2); g.fill()
  irisTex = new THREE.CanvasTexture(c); irisTex.colorSpace = THREE.SRGBColorSpace; irisTex.anisotropy = 4
  return irisTex
}
let tagTex: THREE.Texture | null = null
/** 钥匙牌「437」贴图（道具用） */
export function keyTagTexture() {
  if (tagTex || typeof document === 'undefined') return tagTex
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#e8e8ea'); gr.addColorStop(0.5, '#b9bbc0'); gr.addColorStop(1, '#d7d8dc')
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128)
  g.fillStyle = '#1d2a55'; g.font = 'bold 74px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('437', 140, 68)
  g.strokeStyle = '#555'; g.lineWidth = 3; g.beginPath(); g.arc(34, 64, 12, 0, Math.PI * 2); g.stroke()
  tagTex = new THREE.CanvasTexture(c); tagTex.colorSpace = THREE.SRGBColorSpace
  return tagTex
}
