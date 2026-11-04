// [concierge v2] 看门人身体 SDF 部件（模型空间，静止姿态）：
//   torso  衬衫（胸廓 / 胸肌 / 肩胛 / 腰，掖进裤子的竖褶与腰上鼓起，腋下放射褶，门襟，左胸袋，袖子 + 肘上三圈卷边）
//   pants  西裤（骨盆 / 臀 / 山羊大腿 / 向后的小腿裤管，前裤线，膝窝褶，裤脚堆褶 + 裤口空腔，门襟 / 斜插袋 / 后袋嵌线）
//   arm    裸露前臂（桡侧 / 屈肌 / 伸肌肌腹、鹰嘴、腕部筋腱与尺骨头、浅静脉；长在皮里的眼：肿起泛红的皮肉褶 + 眼窝）
//   hand   人手（掌、鱼际 / 小鱼际、掌指关节隆起、五指三节、指甲、指腹）
//   leg    黑毛山羊小腿（跗关节 + 跟骨尖、细长跖骨 + 后侧屈腱、球节、悬蹄、系部、分趾蹄）
// 每个部件给出：sdf、颜色（Shade）、蒙皮权重（W4）。相邻部件在衣物边界（领口 / 卷袖 / 皮带 / 裤口）或重叠带处拼接。
import { clamp, fbm, gauss, len2, len3, mix, sdCapsule, sdEll, sdRoundBox, sdRoundCone, smax, smin, sstep, vnoise } from './conciergeSdf'
import { B, HANDS, J, W4, add, chainWeights, cross, dot, lenv, nrm, scl, side, sub, type Finger, type HandFrame, type V3 } from './conciergeRig'
import { NECK_AXIS as NECK_AX, NECK_BASE, type EyeMount, type Shade } from './conciergeHead'

const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
const setS = (o: Shade, c: number[], rough: number, metal: number, fur: number, skin: number, cloth: number, wool: number) => { o.r = c[0]; o.g = c[1]; o.b = c[2]; o.rough = rough; o.metal = metal; o.fur = fur; o.skin = skin; o.cloth = cloth; o.wool = wool }
const mixc = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mulc = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]

// ======================================================================
// 衬衫
// ======================================================================
const SH: Record<number, { a: V3; e: V3; dir: V3; L: number; ref: V3; s2: V3; end: V3 }> = {}
for (const s of [1, -1]) {
  const a = side(J.shoulder, s), e = side(J.elbow, s), dir = nrm(sub(e, a))
  const ref = nrm(sub([0, 0, 1], scl(dir, dir[2])))
  const L = lenv(sub(e, a))
  SH[s] = { a, e, dir, L, ref, s2: cross(dir, ref), end: add(a, scl(dir, L * 0.97)) }
}
/** 卷袖：沿上臂轴的位置（0 肩 → 1 肘） */
const CUFF_T0 = 0.8, CUFF_T1 = 0.97
function armLocal(s: number, X: number, Y: number, Z: number) {
  const A = SH[s], px = X - A.a[0], py = Y - A.a[1], pz = Z - A.a[2]
  const t = (px * A.dir[0] + py * A.dir[1] + pz * A.dir[2]) / A.L
  const rx = px - A.dir[0] * t * A.L, ry = py - A.dir[1] * t * A.L, rz = pz - A.dir[2] * t * A.L
  const rho = len3(rx, ry, rz)
  const side2 = A.s2
  const th = Math.atan2(rx * side2[0] + ry * side2[1] + rz * side2[2], rx * A.ref[0] + ry * A.ref[1] + rz * A.ref[2])
  return { t, rho, th }
}
function sleeve(s: number, X: number, Y: number, Z: number) {
  const A = SH[s]
  const { t, rho, th } = armLocal(s, X, Y, Z)
  const end = A.end
  let d = sdRoundCone(X, Y, Z, A.a[0], A.a[1] + 0.002, A.a[2], end[0], end[1], end[2], 0.055, 0.05)
  // 三角肌顶起的袖山（v3：收窄、顶部更平，不再是圆球肩）
  d = smin(d, sdEll(X, Y, Z, A.a[0] - s * 0.004, A.a[1] - 0.02, A.a[2], 0.047, 0.056, 0.052), 0.03)
  // 袖褶：腋下斜褶 + 卷边上方几道规整的横向挤压褶
  const env = sstep(0.15, 0.4, t) * (1 - sstep(CUFF_T0 - 0.04, CUFF_T0, t))
  d -= 0.0028 * env * Math.sin(th * 3 + t * 24 + s) * (0.6 + 0.4 * Math.sin(th * 2 - t * 9))
  d -= 0.0013 * sstep(0.6, CUFF_T0 - 0.02, t) * (1 - sstep(CUFF_T0 - 0.01, CUFF_T0, t)) * Math.sin(t * A.L * 260 + 0.6 * Math.sin(th * 2))
  // 卷边（v3）：三层整齐的扁平折边，由内向外一层压一层（外层略大、略宽），层间一道清楚的折缝
  for (let k = 0; k < 3; k++) {
    const tc = mix(CUFF_T0 + 0.014, CUFF_T1 - 0.016, k / 2)
    const ax = (t - tc) * A.L
    if (Math.abs(ax) > 0.04) continue
    const R = 0.0505 + k * 0.0014 + 0.0007 * Math.sin(th * 2 + s)
    const rw = 0.0102 + k * 0.0006, rr = 0.0068
    d = smin(d, len2((rho - R) / rr, ax / rw) * Math.min(rr, rw) - Math.min(rr, rw), 0.0012)
  }
  // 袖口下沿：截平（前臂从里面伸出）
  d = smax(d, (t - CUFF_T1 - 0.01) * A.L, 0.006)
  return d
}
export function torsoCore(X: number, Y: number, Z: number) {
  const ax = Math.abs(X)
  let d = sdEll(X, Y, Z, 0, 1.385, -0.018, 0.15, 0.2, 0.106) // 胸廓
  d = smin(d, sdEll(ax, Y, Z, 0.062, 1.445, 0.022, 0.088, 0.072, 0.058), 0.045) // 胸肌
  d = smin(d, sdEll(X, Y, Z, 0, 1.185, -0.004, 0.14, 0.17, 0.1), 0.06) // 腹 / 腰
  d = smin(d, sdEll(X, Y, Z, 0, 1.105, 0.002, 0.152, 0.05, 0.11), 0.035) // 腰上鼓起（掖进去的衬衫）
  d = smin(d, sdRoundCone(ax, Y, Z, 0.03, 1.56, -0.024, 0.155, 1.537, -0.024, 0.048, 0.044), 0.05) // 肩 / 斜方肌（v3 略收窄）
  d = smin(d, sdEll(ax, Y, Z, 0.08, 1.44, -0.07, 0.075, 0.105, 0.05), 0.035) // 肩胛
  return d
}
/** 衬衫部件 SDF（不含领 / 扣 / 领带，它们是独立壳体） */
export function torsoSdf(X: number, Y: number, Z: number) {
  if (Y < 1.04 || Y > 1.7) return Math.max(1.04 - Y, Y - 1.7) + 0.05
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  let d = torsoCore(X, Y, Z)
  // 掖进裤子的竖褶（腰部，越往下越密）+ 前后的松量
  const phi = Math.atan2(X, Z)
  const tuck = sstep(1.22, 1.1, Y)
  d -= tuck * (0.0034 * Math.sin(phi * 13 + 1.3 * vnoise(X * 20, Y * 8, Z * 20)) + 0.0016 * Math.sin(phi * 29 + Y * 40))
  // 腋下放射褶（前后各一组）
  for (const sd of [1, -1]) {
    const A: V3 = [sd * 0.135, 1.46, 0]
    const dx = X - A[0], dy = Y - A[1]
    const r = len2(dx, dy)
    const ang = Math.atan2(dy, dx * sd)
    const env = gauss(r - 0.07, 0.05) * sstep(0.0, 0.03, r) * (sd === sx ? 1 : 0)
    d -= 0.0028 * env * Math.sin(ang * 9 + r * 30)
  }
  // 背部横褶（肩胛下）
  if (Z < 0) d -= 0.0018 * sstep(0.0, -0.06, Z) * gauss(Y - 1.3, 0.08) * Math.sin(Y * 140 + X * 25)
  // 布料低频起伏
  d += 0.0008 * fbm(X * 30, Y * 30, Z * 30, 2)
  if (Z > 0) {
    // 门襟：中线一条略鼓的布条 + 两道缝线
    const pk = sstep(0.0195, 0.0165, ax) * sstep(1.09, 1.11, Y)
    d -= 0.0016 * pk
    d += 0.0007 * gauss(ax - 0.0175, 0.0011)
    // 左胸袋（角色左 = +x）
    if (X > 0.03 && X < 0.14 && Y > 1.37 && Y < 1.5) {
      const m = sstep(0.046, 0.05, X) * sstep(0.126, 0.122, X) * sstep(1.383, 1.39, Y) * sstep(1.478, 1.472, Y)
      d -= 0.0019 * m
      d += 0.0007 * gauss(Y - 1.464, 0.0012) * m // 袋口折边
    }
  }
  // 侧缝
  d += 0.0005 * gauss(Math.abs(phi) - Math.PI / 2 - 0.05, 0.02) * sstep(1.12, 1.18, Y)
  // 袖
  for (const s of [1, -1]) if (sx === s || ax < 0.05) d = smin(d, sleeve(s, X, Y, Z), 0.028)
  // 领口：挖出颈洞（领子是独立壳体盖住边缘）
  {
    const px = X - NECK_BASE[0], py = Y - NECK_BASE[1], pz = Z - NECK_BASE[2]
    const t = px * NECK_AX[0] + py * NECK_AX[1] + pz * NECK_AX[2]
    const rr = len3(px - NECK_AX[0] * t, py - NECK_AX[1] * t, pz - NECK_AX[2] * t)
    d = smax(d, -(Math.max(rr - 0.05, -t + 0.006)), 0.008)
  }
  return d
}
/** v3：卷袖用细格单独提取（粗格 1.2 cm 表达不了层层折边），粗格在重叠带外让位 */
export const CUFF_BAND = 0.008
export function cuffRegion(s: number, X: number, Y: number, Z: number) {
  const A = SH[s], { t, rho } = armLocal(s, X, Y, Z)
  return Math.max((CUFF_T0 - 0.045 - t) * A.L, (t - CUFF_T1 - 0.03) * A.L, rho - 0.085)
}
export function cuffBox(s: number) {
  const A = SH[s], p0 = add(A.a, scl(A.dir, A.L * (CUFF_T0 - 0.08))), p1 = add(A.a, scl(A.dir, A.L * (CUFF_T1 + 0.06))), r = 0.08
  return { min: [Math.min(p0[0], p1[0]) - r, Math.min(p0[1], p1[1]) - r, Math.min(p0[2], p1[2]) - r] as [number, number, number], max: [Math.max(p0[0], p1[0]) + r, Math.max(p0[1], p1[1]) + r, Math.max(p0[2], p1[2]) + r] as [number, number, number] }
}
export const TORSO_BOX = { min: [-0.36, 1.03, -0.17] as [number, number, number], max: [0.36, 1.68, 0.17] as [number, number, number] }
/** 衬衫上找表面：从 p 沿 dir 反向往内收，返回表面点（给领带 / 扣子贴合用） */
export function onSurface(f: (x: number, y: number, z: number) => number, p: V3, off = 0): V3 {
  let x = p[0], y = p[1], z = p[2]
  for (let i = 0; i < 24; i++) {
    const d = f(x, y, z) - off, e = 0.001
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e)
    const gl = len3(gx, gy, gz) || 1
    x -= (gx / gl) * d * 0.8; y -= (gy / gl) * d * 0.8; z -= (gz / gl) * d * 0.8
    if (Math.abs(d) < 1e-5) break
  }
  return [x, y, z]
}
const SHIRT = C(0xe9e6df), SHIRT_SH = C(0xcfcac1), SEAM = C(0xbdb7ac)
export function torsoShade(X: number, Y: number, Z: number, o: Shade) {
  const ax = Math.abs(X)
  let c = SHIRT
  // 轻微的米白不均 + 褶底发暗交给 AO
  c = mulc(c, 0.97 + 0.03 * fbm(X * 12, Y * 12, Z * 12, 2))
  if (Z > 0 && ax < 0.021 && Y > 1.1) c = mixc(c, SEAM, 0.35 * gauss(ax - 0.0175, 0.0015) / 1)
  if (Z > 0 && X > 0.04 && X < 0.13 && Y > 1.38 && Y < 1.48) c = mixc(c, SEAM, 0.5 * (gauss(X - 0.048, 0.0015) + gauss(X - 0.124, 0.0015) + gauss(Y - 1.386, 0.0015) + gauss(Y - 1.464, 0.0012)))
  // 后背过肩缝
  if (Z < 0) c = mixc(c, SEAM, 0.4 * gauss(Y - (1.52 - 0.12 * ax * ax * 10), 0.002))
  // 卷袖内层略灰
  for (const s of [1, -1]) { const { t } = armLocal(s, X, Y, Z); if (Math.sign(X) === s && t > CUFF_T0 - 0.02) { const L = SH[s].L; let cr = 0; for (let k = 0; k < 4; k++) { const tk = mix(CUFF_T0 + 0.014, CUFF_T1 - 0.016, (k - 0.5) / 2); cr = Math.max(cr, gauss((t - tk) * L, 0.0028)) } c = mixc(c, SHIRT_SH, 0.55 * cr) } }
  setS(o, c, 0.92, 0, 0, 0, 1, 0)
}
export function torsoWeights(X: number, Y: number, Z: number, acc: W4) {
  const p: V3 = [X, Y, Z]
  for (const s of [1, -1]) {
    if (Math.sign(X) !== s) continue
    const S = s > 0 ? 'L' : 'R'
    const A = SH[s]
    // 手臂归属：到上臂轴的距离 vs 到躯干核心
    const dArm = sdCapsule(X, Y, Z, A.a[0], A.a[1], A.a[2], A.e[0], A.e[1], A.e[2], 0.06)
    const dTor = torsoCore(X, Y, Z)
    const along = dot(sub(p, A.a), A.dir)
    let armK = sstep(-0.02, 0.025, dTor - dArm) * sstep(-0.06, 0.02, along)
    // 肩头（袖山）一半跟锁骨
    const clavK = gauss(lenv(sub(p, A.a)), 0.06) * (1 - armK) * 0.8 + armK * gauss(along, 0.05) * 0.4
    armK = clamp(armK, 0, 1)
    acc.add(B['clav' + S], clavK)
    acc.add(B['upperArm' + S], armK * (1 - clavK * 0.5))
    const trunk = 1 - armK
    trunkW(Y, acc, trunk * (1 - clavK))
    return
  }
  trunkW(Y, acc, 1)
}
function trunkW(Y: number, acc: W4, k: number) {
  if (k <= 0) return
  const a = sstep(1.1, 1.22, Y), b = sstep(1.3, 1.44, Y)
  acc.add(B.hips, k * (1 - a)); acc.add(B.spine, k * a * (1 - b)); acc.add(B.chest, k * a * b)
}

// ======================================================================
// 西裤 + 皮带
// ======================================================================
interface LegSeg { hip: V3; knee: V3; hock: V3; fet: V3; dThigh: V3; dShin: V3; Lt: number; Ls: number; cuff: V3; cuffEnd: V3; drapeA: V3; drapeB: V3; cavA: V3; cavB: V3; fT: V3; sT: V3; fS: V3; sS: V3 }
const LEG: Record<number, LegSeg> = {}
for (const s of [1, -1]) {
  const hip = side(J.hip, s), knee = side(J.knee, s), hock = side(J.hock, s), fet = side(J.fetlock, s)
  const dThigh = nrm(sub(knee, hip)), dShin = nrm(sub(hock, knee))
  const cuffEnd = add(knee, scl(sub(hock, knee), 0.92))
  const fr = (dir: V3) => { const f = nrm(sub([0, 0, 1], scl(dir, dir[2]))); return [f, cross(dir, f)] }
  const [fT, sT] = fr(dThigh), [fS, sS] = fr(dShin)
  LEG[s] = { hip, knee, hock, fet, dThigh, dShin, Lt: lenv(sub(knee, hip)), Ls: lenv(sub(hock, knee)), cuff: add(knee, scl(sub(hock, knee), 0.9)), cuffEnd,
    drapeA: add(knee, [0, -0.06, 0.01]), drapeB: add(cuffEnd, [0, 0.025, 0.04]), cavA: add(cuffEnd, scl(dShin, -0.05)), cavB: add(cuffEnd, scl(dShin, 0.03)), fT, sT, fS, sS }
}
/** 裤管上某点：沿腿段的参数与绕轴角（0 = 前） */
function legAngle(dir: V3, f: V3, sd: V3, px: number, py: number, pz: number) {
  const t = px * dir[0] + py * dir[1] + pz * dir[2]
  const rx = px - dir[0] * t, ry = py - dir[1] * t, rz = pz - dir[2] * t
  return { t, th: Math.atan2(rx * sd[0] + ry * sd[1] + rz * sd[2], rx * f[0] + ry * f[1] + rz * f[2]) }
}
function pantsLeg(s: number, X: number, Y: number, Z: number) {
  const L = LEG[s]
  // 大腿：山羊腿肌肉在后上方鼓
  let d = sdRoundCone(X, Y, Z, L.hip[0], L.hip[1] + 0.02, L.hip[2] - 0.01, L.knee[0], L.knee[1], L.knee[2], 0.092, 0.064)
  d = smin(d, sdEll(X, Y, Z, L.hip[0] + s * 0.008, L.hip[1] - 0.15, L.hip[2] - 0.035, 0.074, 0.15, 0.078), 0.04)
  // 膝（向前顶）
  d = smin(d, sdEll(X, Y, Z, L.knee[0], L.knee[1] + 0.01, L.knee[2] + 0.004, 0.056, 0.07, 0.056), 0.03)
  // 小腿裤管：顺着向后的小腿，前面垂下一点布
  const cuffEnd = L.cuffEnd
  d = smin(d, sdRoundCone(X, Y, Z, L.knee[0], L.knee[1], L.knee[2], cuffEnd[0], cuffEnd[1], cuffEnd[2], 0.057, 0.052), 0.03)
  const drapeA = L.drapeA, drapeB = L.drapeB
  d = smin(d, sdCapsule(X, Y, Z, drapeA[0], drapeA[1], drapeA[2], drapeB[0], drapeB[1], drapeB[2], 0.034), 0.035)
  // 褶：前裤线（大腿前、小腿前）、膝后挤压褶、裤脚堆褶
  const pt = legAngle(L.dThigh, L.fT, L.sT, X - L.hip[0], Y - L.hip[1], Z - L.hip[2])
  const ps = legAngle(L.dShin, L.fS, L.sS, X - L.knee[0], Y - L.knee[1], Z - L.knee[2])
  const tt = pt.t / L.Lt, ts = ps.t / L.Ls
  const onThigh = sstep(1.05, 0.95, tt), onShin = 1 - onThigh
  d -= 0.0026 * Math.max(0, 1 - Math.abs(pt.th) / 0.22) * sstep(0.15, 0.3, tt) * onThigh
  d -= 0.0022 * Math.max(0, 1 - Math.abs(ps.th) / 0.25) * sstep(0.1, 0.3, ts) * (1 - sstep(0.75, 0.85, ts)) * onShin
  const kneeBack = sstep(-0.3, 0.6, -Math.cos(ps.th)) * gauss(ts - 0.08, 0.14)
  d -= 0.0034 * kneeBack * Math.sin(ts * 60 + ps.th * 2)
  const stack = sstep(0.58, 0.88, ts) * onShin
  d -= stack * (0.0036 * Math.sin(ts * 95 + 1.6 * Math.sin(ps.th * 2 + s)) + 0.0018 * Math.sin(ps.th * 3 + ts * 40))
  // 裤口：截平 + 掏空（看得见内衬的暗口）
  const cut = (X - cuffEnd[0]) * L.dShin[0] + (Y - cuffEnd[1]) * L.dShin[1] + (Z - cuffEnd[2]) * L.dShin[2]
  d = smax(d, cut - 0.004, 0.006)
  const cav = sdRoundCone(X, Y, Z, L.cavA[0], L.cavA[1], L.cavA[2], L.cavB[0], L.cavB[1], L.cavB[2], 0.04, 0.045)
  d = smax(d, -cav, 0.004)
  return d
}
export function pantsSdf(X: number, Y: number, Z: number) {
  if (Y > 1.15) return Y - 1.15 + 0.02
  const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
  let d = sdEll(X, Y, Z, 0, 1.03, -0.006, 0.158, 0.11, 0.11) // 骨盆
  d = smin(d, sdEll(ax, Y, Z, 0.066, 0.965, -0.046, 0.086, 0.095, 0.082), 0.04) // 臀
  d = smin(d, sdEll(X, Y, Z, 0, 1.098, 0.0, 0.15, 0.04, 0.108), 0.025) // 裤腰
  d = smax(d, Y - 1.128, 0.006) // 裤腰上沿
  for (const s of [1, -1]) if (s === sx || ax < 0.06) d = smin(d, pantsLeg(s, X, Y, Z), 0.05)
  // 门襟 / 斜插袋 / 后袋
  if (Z > 0) {
    d += 0.0009 * gauss(X - 0.012 - 0.04 * sstep(1.0, 0.94, Y) * 0.2, 0.0014) * sstep(0.93, 0.96, Y) * sstep(1.09, 1.07, Y)
    const pk = (ax - 0.118) - (1.085 - Y) * 0.32
    d += 0.0016 * gauss(pk, 0.0018) * sstep(0.97, 0.99, Y) * sstep(1.09, 1.07, Y)
  } else {
    d += 0.0012 * gauss(Y - 1.02, 0.0015) * sstep(0.035, 0.045, ax) * sstep(0.125, 0.115, ax)
  }
  d += 0.0006 * fbm(X * 25, Y * 25, Z * 25, 2)
  return d
}
export const PANTS_BOX = { min: [-0.28, 0.25, -0.22] as [number, number, number], max: [0.28, 1.15, 0.24] as [number, number, number] }
/** 上下两段裤子的分界（小腿中段，垂直于小腿） */
export const pantsSplit = (X: number, Y: number, Z: number) => { const L = LEG[X >= 0 ? 1 : -1]; return ((X - L.knee[0]) * L.dShin[0] + (Y - L.knee[1]) * L.dShin[1] + (Z - L.knee[2]) * L.dShin[2]) / L.Ls - 0.42 }
const PANTS = C(0x26262b), PANTS_IN = C(0x0e0e10)
export function pantsShade(X: number, Y: number, Z: number, o: Shade) {
  let c = mulc(PANTS, 0.95 + 0.08 * fbm(X * 14, Y * 14, Z * 14, 2))
  const L = LEG[X >= 0 ? 1 : -1]
  const ts = dot(sub([X, Y, Z], L.knee), L.dShin) / L.Ls
  if (ts > 0.86) c = mixc(c, PANTS_IN, sstep(0.88, 0.92, ts))
  setS(o, c, 0.82, 0, 0, 0, 0, 1)
}
export function legWeights(X: number, Y: number, Z: number, acc: W4) {
  const s = X >= 0 ? 1 : -1, S = s > 0 ? 'L' : 'R', L = LEG[s]
  // 骨盆 vs 腿：腿根平面以下归腿；裆部两腿之间留给骨盆
  const p: V3 = [X, Y, Z]
  const below = sstep(-0.06, 0.05, dot(sub(p, L.hip), L.dThigh) - 0.03)
  const mid = sstep(0.012, 0.05, Math.abs(X))
  const legK = clamp(below * mix(0.4, 1, mid), 0, 1) * (Y > 1.09 ? 0 : 1)
  acc.add(B.hips, 1 - legK)
  if (legK <= 0) return
  // 2.1 膝：膝窝一侧（膝角内侧 = 后方）过渡带加宽 0.045 → 0.085，并用半角辅助骨做二次混合（替代线性两骨混合 → 去掉大屈膝时西裤膝窝的鼓包）
  const toe = add(L.fet, [0, -0.08, 0.06])
  const inner = nrm(add(nrm(sub(L.hip, L.knee)), nrm(sub(L.hock, L.knee))))
  const kin = sstep(-0.02, 0.05, dot(sub(p, L.knee), inner))
  const nK = nrm(add(L.dThigh, L.dShin))
  const Rk = mix(0.05, 0.085, kin)
  const f = sstep(-Rk, Rk, dot(sub(p, L.knee), nK))
  // 大腿后侧下半段（膝上 0–20 cm、后方）一部分权重给垫骨（屈膝时沿后侧方向压扁）
  const tt = dot(sub(p, L.hip), L.dThigh) / L.Lt
  const bk0 = sub(inner, scl(L.dThigh, dot(inner, L.dThigh))), rr = sub(sub(p, L.hip), scl(L.dThigh, dot(sub(p, L.hip), L.dThigh)))
  const back = sstep(-0.01, 0.035, dot(rr, nrm(bk0)))
  const pad = 0.92 * back * sstep(0.42, 0.78, tt)
  acc.add(B['thigh' + S], legK * (1 - f) * (1 - f) * (1 - pad))
  acc.add(B['kneeIn' + S], legK * (1 - f) * (1 - f) * pad)
  acc.add(B['kneeFix' + S], legK * 2 * f * (1 - f))
  if (f * f > 1e-4) chainWeights(acc, p, [L.knee, L.hock, L.fet, toe], [B['shin' + S], B['hock' + S], B['pastern' + S]], [0.045, 0.025], legK * f * f)
}

/** 皮带环（模型空间）：返回沿腰一圈的点（按 pants 表面外推） */
export function beltRing(n: number, y: number): V3[] {
  const out: V3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a)
    let lo = 0, hi = 0.3
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (pantsSdf(dx * m, y, dz * m) < 0) lo = m; else hi = m }
    out.push([dx * lo, y, dz * lo])
  }
  return out
}

// ======================================================================
// 前臂（裸露，长眼）
// ======================================================================
interface ArmF { o: V3; a: V3; r: V3; d: V3; L: number; s: number }
const ARM: Record<number, ArmF> = {}
for (const s of [1, -1]) {
  const o = side(J.elbow, s), w = side(J.wrist, s), a = nrm(sub(w, o)), F = HANDS[s].F
  const r = nrm(sub(F.r, scl(a, dot(F.r, a)))), d0 = cross(a, r)
  ARM[s] = { o, a, r, d: dot(d0, F.d) > 0 ? d0 : scl(d0, -1), L: lenv(sub(w, o)), s }
}
const toArm = (A: ArmF, X: number, Y: number, Z: number): V3 => { const px = X - A.o[0], py = Y - A.o[1], pz = Z - A.o[2]; return [px * A.a[0] + py * A.a[1] + pz * A.a[2], px * A.r[0] + py * A.r[1] + pz * A.r[2], px * A.d[0] + py * A.d[1] + pz * A.d[2]] }
const fromArm = (A: ArmF, t: number, u: number, w: number): V3 => [A.o[0] + A.a[0] * t + A.r[0] * u + A.d[0] * w, A.o[1] + A.a[1] * t + A.r[1] * u + A.d[1] * w, A.o[2] + A.a[2] * t + A.r[2] * u + A.d[2] * w]
/** 前臂基础形（局部 t 沿臂、u 桡侧（拇指 / 前）、w 手背侧） */
function foreBase(t: number, u: number, w: number, L: number) {
  const k = clamp(t / L, 0, 1)
  // 横截面：近肘宽厚，近腕扁
  const ru = mix(0.045, 0.03, sstep(0.05, 0.95, k)), rw = mix(0.039, 0.02, sstep(0.1, 1, k))
  const tc = clamp(t, -0.03, L + 0.03)
  let d = len2(Math.max(len2(u / ru, w / rw) - 1, 0) * Math.min(ru, rw), t - tc) + Math.min(len2(u / ru, w / rw) - 1, 0) * Math.min(ru, rw)
  // 肌腹：肱桡肌（桡侧上段）、屈肌群（掌侧尺侧）、伸肌群（背侧）
  d = smin(d, sdEll(t, u, w, 0.07, 0.024, 0.008, 0.085, 0.022, 0.026), 0.02)
  d = smin(d, sdEll(t, u, w, 0.085, -0.012, -0.018, 0.1, 0.026, 0.022), 0.02)
  d = smin(d, sdEll(t, u, w, 0.095, 0.004, 0.02, 0.1, 0.024, 0.018), 0.02)
  // 鹰嘴（肘尖，在后 = 尺侧）与肱骨内外上髁
  d = smin(d, sdEll(t, u, w, -0.012, -0.03, 0.006, 0.022, 0.017, 0.02), 0.014)
  d = smin(d, sdEll(t, u, w, -0.02, 0.0, -0.03, 0.02, 0.022, 0.012), 0.014)
  // 腕：尺骨头（背尺侧小鼓包）、桡骨茎突
  d = smin(d, sdSphere3(t, u, w, L - 0.012, -0.021, 0.01, 0.0075), 0.006)
  d = smin(d, sdSphere3(t, u, w, L - 0.004, 0.026, 0.002, 0.008), 0.006)
  // 掌侧三条筋腱（下三分之一）
  if (k > 0.45) for (const uu of [-0.011, 0.0, 0.012]) d = smin(d, sdCapsule(t, u, w, L * 0.5, uu * 1.3, -0.022, L + 0.01, uu, -0.0165, 0.0032), 0.006)
  // 背侧浅静脉（蜿蜒）
  if (w > 0.005) { const vu = 0.008 * Math.sin(t * 38) + 0.006; d = smin(d, len2(u - vu, w - (rwAt(k) + 0.0)) - 0.0022 + (k < 0.15 || k > 0.92 ? 0.004 : 0), 0.004) }
  return d
}
const rwAt = (k: number) => mix(0.039, 0.02, sstep(0.1, 1, k)) - 0.001
const sdSphere3 = (x: number, y: number, z: number, cx: number, cy: number, cz: number, r: number) => len3(x - cx, y - cy, z - cz) - r
/** 前臂的眼：[t 比例, 绕臂角（0 = 桡侧/前，+π/2 = 手背/外，π = 尺侧/后，−π/2 = 掌侧/内）, 半径]；左 4 右 5（原文） */
const ARM_EYES: Record<number, [number, number, number][]> = {
  1: [[0.22, 1.2, 0.0128], [0.43, 0.35, 0.0122], [0.6, 1.95, 0.0125], [0.79, 0.95, 0.0112]],
  [-1]: [[0.17, 0.75, 0.0124], [0.33, 1.95, 0.0122], [0.5, 0.15, 0.0128], [0.66, 1.25, 0.012], [0.83, 2.35, 0.011]],
}
interface ArmEye { t: number; u: number; w: number; n: V3; ex: V3; ey: V3; r: number }
const armEyeCache: Record<number, ArmEye[]> = {}
function armEyes(s: number): ArmEye[] {
  if (armEyeCache[s]) return armEyeCache[s]
  const A = ARM[s]
  armEyeCache[s] = ARM_EYES[s].map(([k, ang, r]) => {
    const t = k * A.L, du = Math.cos(ang), dw = Math.sin(ang)
    let lo = 0, hi = 0.08
    for (let i = 0; i < 36; i++) { const m = (lo + hi) / 2; if (foreBase(t, du * m, dw * m, A.L) < 0) lo = m; else hi = m }
    const P: V3 = [t, du * lo, dw * lo], e = 0.0015
    const g = (a: number, b: number, c: number) => foreBase(a, b, c, A.L)
    const n = nrm([g(P[0] + e, P[1], P[2]) - g(P[0] - e, P[1], P[2]), g(P[0], P[1] + e, P[2]) - g(P[0], P[1] - e, P[2]), g(P[0], P[1], P[2] + e) - g(P[0], P[1], P[2] - e)])
    const ex = nrm(sub([1, 0, 0], scl(n, n[0]))) // 眼裂沿手臂
    const ey = cross(n, ex)
    const c: V3 = [P[0] - n[0] * r * 0.3, P[1] - n[1] * r * 0.3, P[2] - n[2] * r * 0.3]
    return { t: c[0], u: c[1], w: c[2], n, ex, ey, r }
  })
  return armEyeCache[s]
}
function foreArmLocal(s: number, t: number, u: number, w: number) {
  const A = ARM[s]
  let d = foreBase(t, u, w, A.L)
  for (const e of armEyes(s)) {
    const pt = t - e.t, pu = u - e.u, pw = w - e.w
    if (pt * pt + pu * pu + pw * pw > 0.0025) continue
    const lx = pt * e.ex[0] + pu * e.ex[1] + pw * e.ex[2], ly = pt * e.ey[0] + pu * e.ey[1] + pw * e.ey[2], lz = pt * e.n[0] + pu * e.n[1] + pw * e.n[2]
    const R = e.r
    // 周围肿起的皮肉（长圆形垫）+ 睑缘肉褶
    d = smin(d, sdEll(lx, ly, lz, 0, 0, -R * 0.2, R * 2.5, R * 1.7, R * 0.9), 0.012)
    d = smin(d, len2(len2(lx / 1.45, ly) - R * 1.0, lz - R * 0.45) - R * 0.38, 0.005)
    // 外围几道细褶
    d += 0.0009 * Math.sin(len2(lx / 1.5, ly) * 900) * gauss(len2(lx / 1.5, ly) - R * 2.1, R * 0.5)
    d = smax(d, -(len3(lx / 1.25, ly, lz - R * 0.1) - R * 1.08), 0.003)
  }
  // 皮肤细纹
  d += 0.0003 * vnoise(t * 500, u * 500, w * 500)
  return d
}
export function armSdf(s: number) {
  const A = ARM[s]
  return (X: number, Y: number, Z: number) => {
    const [t, u, w] = toArm(A, X, Y, Z)
    if (t > A.L + 0.04) return handLocalSdf(s, X, Y, Z)
    const f = foreArmLocal(s, t, u, w)
    if (t < A.L - 0.035) return f
    return smin(f, handLocalSdf(s, X, Y, Z), 0.012)
  }
}
export const armBox = (s: number) => {
  const e = side(J.elbow, s), w = side(J.wrist, s)
  return { min: [Math.min(e[0], w[0]) - 0.075, w[1] - 0.04, Math.min(e[2], w[2]) - 0.075] as [number, number, number], max: [Math.max(e[0], w[0]) + 0.075, e[1] + 0.07, Math.max(e[2], w[2]) + 0.075] as [number, number, number] }
}
export const armT = (s: number, X: number, Y: number, Z: number) => toArm(ARM[s], X, Y, Z)[0] / ARM[s].L
const SKIN = C(0x6a4430), SKIN_DK = C(0x4e3021), SKIN_RED = C(0x8e3f35), SKIN_RAW = C(0xa8534a), PALM = C(0x9a6a52), NAIL = C(0xb08a78), KNUCK = C(0x523424)
export function armShade(s: number, X: number, Y: number, Z: number, o: Shade) {
  const A = ARM[s]
  const [t, u, w] = toArm(A, X, Y, Z)
  if (t > A.L - 0.005) return handShade(s, X, Y, Z, o)
  let c = mulc(SKIN, 0.92 + 0.12 * fbm(X * 30, Y * 30, Z * 30, 2))
  // 掌侧略浅、背侧略深
  c = mixc(c, mulc(SKIN, 1.18), sstep(0, -0.03, w) * 0.5)
  c = mixc(c, SKIN_DK, sstep(0.01, 0.035, w) * 0.35)
  // 靠近卷袖处暗一些（袖口阴影交给 AO，这里补一点汗渍般的暗色）
  let rough = 0.62
  for (const e of armEyes(s)) {
    const dd = len3(t - e.t, u - e.u, w - e.w)
    if (dd > 0.05) continue
    const pt = t - e.t, pu = u - e.u, pw = w - e.w
    const lx = pt * e.ex[0] + pu * e.ex[1] + pw * e.ex[2], ly = pt * e.ey[0] + pu * e.ey[1] + pw * e.ey[2]
    const q = len2(lx / 1.45, ly)
    c = mixc(c, SKIN_RED, 0.75 * gauss(q - e.r * 1.4, e.r * 1.3))
    c = mixc(c, SKIN_RAW, 0.8 * sstep(e.r * 1.35, e.r * 1.05, q))
    if (q < e.r * 1.6) rough = 0.4
  }
  setS(o, c, rough, 0, 0, 1, 0, 0)
}

// ======================================================================
// 手
// ======================================================================
const toHand = (F: HandFrame, X: number, Y: number, Z: number): V3 => { const px = X - F.o[0], py = Y - F.o[1], pz = Z - F.o[2]; return [px * F.a[0] + py * F.a[1] + pz * F.a[2], px * F.r[0] + py * F.r[1] + pz * F.r[2], px * F.d[0] + py * F.d[1] + pz * F.d[2]] }
const fingerSeg = (f: Finger, k: number, X: number, Y: number, Z: number) => sdRoundCone(X, Y, Z, f.joints[k][0], f.joints[k][1], f.joints[k][2], f.joints[k + 1][0], f.joints[k + 1][1], f.joints[k + 1][2], f.radii[k], f.radii[k + 1])
function handLocalSdf(s: number, X: number, Y: number, Z: number) {
  const { F, fingers } = HANDS[s]
  const [ta, tr, td] = toHand(F, X, Y, Z)
  { const bd = len3(ta - 0.09, tr, td) - 0.135; if (bd > 0.02) return bd }
  // 掌：圆角盒 + 手背弧 + 掌心凹；腕部收窄
  let d = sdRoundBox(ta - 0.058, tr + 0.001, td + 0.0005, 0.044, 0.041, 0.0118, 0.011)
  d = smin(d, sdEll(ta, tr, td, 0.012, 0.0, 0.0, 0.03, 0.03, 0.019), 0.02)
  d = smin(d, sdEll(ta, tr, td, 0.062, 0.0, 0.004, 0.05, 0.043, 0.0115), 0.01)
  d = smin(d, sdEll(ta, tr, td, 0.036, 0.022, -0.009, 0.033, 0.019, 0.016), 0.012) // 鱼际
  d = smin(d, sdEll(ta, tr, td, 0.052, -0.03, -0.006, 0.042, 0.013, 0.013), 0.012) // 小鱼际
  d = smax(d, -sdEll(ta, tr, td, 0.064, 0.002, -0.027, 0.03, 0.022, 0.014), 0.008) // 掌心凹
  // 手背伸肌腱（四条，从腕散到指根）
  if (td > 0) for (const f of fingers) if (f.name !== 'thumb') {
    const b = toHand(F, f.joints[0][0], f.joints[0][1], f.joints[0][2])
    d = smin(d, sdCapsule(ta, tr, td, 0.02, b[1] * 0.3, 0.012, b[0] - 0.006, b[1], 0.011, 0.0022), 0.005)
  }
  // 手指（硬并，指与指之间不糊在一起）
  let df = 1
  for (const f of fingers) {
    let g = 1
    for (let k = 0; k < 3; k++) g = Math.min(g, fingerSeg(f, k, X, Y, Z))
    // 指节：背侧关节隆起
    for (let k = 1; k < 3; k++) { const j = f.joints[k], r = f.radii[k]; g = smin(g, len3(X - j[0] - F.d[0] * r * 0.25, Y - j[1] - F.d[1] * r * 0.25, Z - j[2] - F.d[2] * r * 0.25) - r * 0.98, 0.003) }
    // 指甲：远节背侧略平
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
  // 掌指关节（指根背侧隆起）
  for (const f of fingers) if (f.name !== 'thumb') { const j = f.joints[0]; d = smin(d, len3(X - j[0] - F.d[0] * 0.004, Y - j[1] - F.d[1] * 0.004, Z - j[2] - F.d[2] * 0.004) - f.radii[0] * 1.08, 0.008) }
  d = smin(d, df, 0.009)
  d += 0.00025 * vnoise(X * 700, Y * 700, Z * 700)
  return d
}
export const handBox = (s: number) => {
  const { fingers, F } = HANDS[s]
  let mn: V3 = [...F.o], mx: V3 = [...F.o]
  for (const f of fingers) for (const j of f.joints) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], j[k]); mx[k] = Math.max(mx[k], j[k]) }
  mn = mn.map((v) => v - 0.035) as V3; mx = mx.map((v) => v + 0.035) as V3
  return { min: mn as [number, number, number], max: mx as [number, number, number] }
}
export const handSdf = (s: number) => armSdf(s)
function handShade(s: number, X: number, Y: number, Z: number, o: Shade) {
  const { F, fingers } = HANDS[s]
  const [ta, , td] = toHand(F, X, Y, Z)
  let c = mulc(SKIN, 0.94 + 0.1 * fbm(X * 40, Y * 40, Z * 40, 2))
  // 掌面浅（掌垫）
  const palmK = sstep(0.0, -0.012, td)
  c = mixc(c, PALM, palmK * 0.85)
  let rough = 0.6
  for (const f of fingers) {
    const dj = f.joints[2], tip = f.joints[3]
    const L = lenv(sub(tip, dj)), dir = nrm(sub(tip, dj))
    const tn = dot(sub([X, Y, Z], dj), dir) / L
    if (tn < -0.6 || tn > 1.3) {
      // 指关节褶（背侧深色）
    }
    const q = sub([X, Y, Z], add(dj, scl(dir, clamp(tn, 0, 1) * L)))
    const back = dot(q, F.d), rad = lenv(q)
    if (rad < f.radii[2] * 1.4 && tn > 0.28 && tn < 1.05 && back > f.radii[3] * 0.45) {
      const k = sstep(f.radii[3] * 0.45, f.radii[3] * 0.7, back) * sstep(0.28, 0.38, tn)
      c = mixc(c, NAIL, k); rough = mix(rough, 0.3, k)
    }
    // 关节横纹（背侧深）
    for (let j = 0; j < 3; j++) { const jp = f.joints[j]; const dd = lenv(sub([X, Y, Z], jp)); if (dd < f.radii[j] * 1.6) c = mixc(c, KNUCK, 0.35 * gauss(dd - f.radii[j], 0.004) * sstep(-0.002, 0.004, dot(sub([X, Y, Z], jp), F.d))) }
  }
  // 掌纹（掌面几道深线）
  if (palmK > 0.5) { const l1 = Math.abs(ta - 0.075 - 0.08 * (dot(sub([X, Y, Z], F.o), F.r))), l2 = Math.abs(ta - 0.055 + 0.1 * dot(sub([X, Y, Z], F.o), F.r)); c = mulc(c, 1 - 0.25 * (gauss(l1, 0.0015) + gauss(l2, 0.0015))) }
  setS(o, c, rough, 0, 0, 1, 0, 0)
}
export function armWeights(s: number, X: number, Y: number, Z: number, acc: W4) {
  const S = s > 0 ? 'L' : 'R', p: V3 = [X, Y, Z]
  const { F, fingers } = HANDS[s]
  const el = side(J.elbow, s), wr = side(J.wrist, s), sh = side(J.shoulder, s)
  // 肘 → 前臂；腕 → 手
  const fElbow = sstep(-0.035, 0.03, dot(sub(p, el), nrm(add(nrm(sub(el, sh)), nrm(sub(wr, el))))))
  acc.add(B['upperArm' + S], 1 - fElbow)
  if (fElbow <= 0) return
  const fWrist = sstep(-0.02, 0.022, dot(sub(p, wr), nrm(add(nrm(sub(wr, el)), F.a))))
  acc.add(B['foreArm' + S], fElbow * (1 - fWrist))
  const kh = fElbow * fWrist
  if (kh <= 0) return
  // 手内：找最近的手指
  let best = 1, bf: Finger | null = null
  for (const f of fingers) { let g = 1; for (let k = 0; k < 3; k++) g = Math.min(g, fingerSeg(f, k, X, Y, Z)); if (g < best) { best = g; bf = f } }
  if (!bf) { acc.add(B['hand' + S], kh); return }
  const thumb = bf.name === 'thumb'
  const j0 = bf.joints[0], j1 = bf.joints[1], dir0 = nrm(sub(j1, j0))
  // 掌指关节平面：指根之后才归手指（拇指的第一节是掌骨，在鱼际里渐变）
  const fBase = thumb ? sstep(-0.012, 0.018, dot(sub(p, j0), dir0)) * sstep(0.012, 0.0, best) : sstep(-0.008, 0.008, dot(sub(p, j0), dir0)) * sstep(0.006, 0.0, best)
  acc.add(B['hand' + S], kh * (1 - fBase))
  if (fBase > 0) chainWeights(acc, p, bf.joints, [B[bf.name + '1' + S], B[bf.name + '2' + S], B[bf.name + '3' + S]], [0.006, 0.005], kh * fBase)
}

// ======================================================================
// 山羊小腿 + 蹄（黑毛）+ 下段裤管
// ======================================================================
function hoofClaw(s: number, k: number, X: number, Y: number, Z: number) {
  const L = LEG[s]
  const cx = L.fet[0] + k * 0.0135 + s * 0.002
  let d = sdRoundCone(X, Y, Z, cx, 0.03, L.fet[2] + 0.028, cx + k * 0.006, 0.006, L.fet[2] + 0.088, 0.0185, 0.004)
  d = smin(d, sdEll(X, Y, Z, cx, 0.016, L.fet[2] + 0.04, 0.0135, 0.016, 0.03), 0.01)
  d = smax(d, -Y + 0.001, 0.003) // 蹄底平
  d = smax(d, -(k * (X - L.fet[0] - s * 0.002)) + 0.0009, 0.0015) // 两瓣中缝
  return d
}
export function lowerLegSdf(s: number) {
  const L = LEG[s]
  const toe: V3 = [L.fet[0], 0.036, L.fet[2] + 0.04]
  return (X: number, Y: number, Z: number) => {
    let d = pantsSdf(X, Y, Z)
    if (Y > 0.42) return d
    // 跗关节 + 跟骨尖（向后）
    let f = sdEll(X, Y, Z, L.hock[0], L.hock[1], L.hock[2], 0.028, 0.035, 0.032)
    f = smin(f, sdRoundCone(X, Y, Z, L.hock[0], L.hock[1] + 0.07, L.hock[2] + 0.04, L.hock[0], L.hock[1] + 0.005, L.hock[2] - 0.022, 0.03, 0.017), 0.012)
    // 跖骨（细长）+ 后侧屈腱
    f = smin(f, sdRoundCone(X, Y, Z, L.hock[0], L.hock[1] - 0.01, L.hock[2] + 0.004, L.fet[0], L.fet[1] + 0.01, L.fet[2] + 0.004, 0.024, 0.0175), 0.014)
    f = smin(f, sdRoundCone(X, Y, Z, L.hock[0], L.hock[1] - 0.02, L.hock[2] - 0.016, L.fet[0], L.fet[1] + 0.02, L.fet[2] - 0.015, 0.012, 0.01), 0.01)
    // 球节
    f = smin(f, sdEll(X, Y, Z, L.fet[0], L.fet[1], L.fet[2], 0.022, 0.026, 0.026), 0.012)
    // 悬蹄（球节后下方两个小角质）
    for (const k of [-1, 1]) f = smin(f, sdRoundCone(X, Y, Z, L.fet[0] + k * 0.012, L.fet[1] - 0.01, L.fet[2] - 0.02, L.fet[0] + k * 0.015, L.fet[1] - 0.034, L.fet[2] - 0.034, 0.0065, 0.003), 0.006)
    // 系部
    f = smin(f, sdRoundCone(X, Y, Z, L.fet[0], L.fet[1], L.fet[2] + 0.005, toe[0], toe[1], toe[2], 0.021, 0.02), 0.012)
    // 蹄（两瓣）
    for (const k of [-1, 1]) f = smin(f, hoofClaw(s, k, X, Y, Z), 0.006)
    // 毛：跖骨后侧略长（羽状），整体顺毛
    const along = clamp((L.hock[1] - Y) / (L.hock[1] - L.fet[1]), 0, 1)
    const backK = sstep(0.0, -0.02, Z - mix(L.hock[2], L.fet[2], along) + 0.0)
    if (Y > 0.045) f -= (0.0012 + 0.0026 * backK) * (0.5 + 0.5 * vnoise(X * 260, Y * 70, Z * 260)) * sstep(0.04, 0.06, Y)
    return Math.min(d, f)
  }
}
export const lowerLegBox = (s: number) => ({ min: [s * 0.1 - 0.1, -0.004, -0.2] as [number, number, number], max: [s * 0.1 + 0.1, 0.62, 0.22] as [number, number, number] })
const FURL = C(0x1c1918), HOOF = C(0x161313), HOOF_RIM = C(0x2e2826), DEW = C(0x221d1b)
export function lowerLegShade(s: number, X: number, Y: number, Z: number, o: Shade) {
  const p = pantsSdf(X, Y, Z)
  if (p < 0.0015) return pantsShade(X, Y, Z, o)
  const L = LEG[s]
  // 蹄
  const hc = Math.min(hoofClaw(s, -1, X, Y, Z), hoofClaw(s, 1, X, Y, Z))
  if (hc < 0.002 && Y < 0.045) { const rim = sstep(0.034, 0.042, Y); setS(o, mixc(mulc(HOOF, 0.9 + 0.2 * Math.sin(Y * 900) * 0.3), HOOF_RIM, rim), 0.3, 0, 0, 0, 0, 0); return }
  const dew = Y < L.fet[1] - 0.01 && Z < L.fet[2] - 0.022
  let c = mulc(FURL, 0.9 + 0.25 * fbm(X * 120, Y * 30, Z * 120, 2))
  if (dew) c = DEW
  setS(o, c, 0.8, 0, 1, 0, 0, 0)
}

// ======================================================================
// 前臂眼的安装信息
// ======================================================================
export function armEyeMounts(): EyeMount[] {
  const out: EyeMount[] = []
  for (const s of [1, -1]) {
    const A = ARM[s]
    for (const e of armEyes(s)) {
      const c = fromArm(A, e.t, e.u, e.w)
      const dw = (v: V3): V3 => [A.a[0] * v[0] + A.r[0] * v[1] + A.d[0] * v[2], A.a[1] * v[0] + A.r[1] * v[1] + A.d[1] * v[2], A.a[2] * v[0] + A.r[2] * v[1] + A.d[2] * v[2]]
      out.push({ c, z: nrm(dw(e.n)), x: nrm(dw(e.ex)), r: e.r, parent: 'foreArm' + (s > 0 ? 'L' : 'R'), open: [-1.0, 0.72], skin: 'arm' })
    }
  }
  return out
}
export { ARM, LEG }
