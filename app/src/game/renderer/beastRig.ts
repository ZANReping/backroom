// [beast] 第五层的野兽（Entity 18 / The Beast of Level 5）骨架定义（阶段 1：只建模）。
// 模型空间：+Z 正面、+Y 向上、地面 y=0、+X = 角色左侧（与看门人 / 行李员同约定）。
//
// 身体骨骼直接沿用行李员的人体骨架（bellhopRig 的前 N_BODY_BONES 根：root/hips/spine/chest/neck/head、
// 两臂 clav→upperArm→foreArm→hand→五指×3、两腿 thigh→shin→foot→toe、两根下摆骨 hem），**顺序与名字完全一致**，
// 位置统一放大 K 倍（行李员 1.85 m 体型 → 野兽 1.95 m 瘦高绅士）。因此行李员身体部件的权重函数（按骨骼下标写的）
// 可以在「行李员空间」（模型坐标 / K）里直接求值复用——只读导入，不改动行李员文件。
//
// 在这之后追加野兽专有骨骼：
//   backBulge（挂 chest，真身时西装背部鼓起）
//   mantleL / mantleR（挂 head，墨鱼头沿中线裂开的两半；铰链轴 = 外套膜轴线，位于外套膜背侧）
//   finL / finR（挂 mantleL / mantleR，两片侧鳍，阶段 2 做波动）
//   eyeL / eyeR（挂 mantleL / mantleR，眼球刚性网格挂在上面）
//   beak → beakJaw（挂 head，喙上颚 / 下颚；平时藏在头里，真身时裂缝张开露出）
//   tent{i}_{k}：10 条触须 × 9 节骨链（i 0–7 = 8 条腕，8–9 = 2 条长触腕；k 0 根部 → 8 末端），tent{i}_0 挂 head。
//   触须骨的位置要等触须路径生成后才知道（beastHead.tentaclePaths），由 beastMesh 调 setTentacleBonePositions 填入。
import { BONES as BH_BONES, N_BODY_BONES as BH_N, HANDS as BH_HANDS, J as BH_J } from './bellhopRig'
import { add, cross, dot, nrm, scl, sub, lenv, rot, W4, chainWeights, type V3 } from './conciergeRig'

export { add, cross, dot, nrm, scl, sub, lenv, rot, W4, chainWeights, type V3 }

/** 行李员空间 → 野兽空间的整体放大倍数（1.85 m → ~1.95 m 含外套膜尖） */
export const K = 1.03
// ---------- 体型形变（v2：老板体型）----------
// 身体部件仍在「行李员空间」里求值 / 提取，提取后的顶点用 warpBH 正向映射到野兽空间（骨骼位置同样映射，蒙皮静止姿态一致）：
//   · 横向：x' = x·(1+A) + sign(x)·D(y)·s(|x|)——|x| > 0.15 的部分（肩 / 手臂 / 胯）整体外移 D、躯干中段被拉宽；颈口几乎不动
//   · 纵深：z' = z·(1+C(y)) + 胸挺 SH(y) + 将军肚 BELLY（前片腰 / 下腹略鼓）；颈以上渐回 1
//   · 手：以腕为中心整体放大 HAND_K（只对手 / 袖口 / 戒指 / 手指骨，按前臂参数在袖口处平滑过渡）
//   y 不变（身高仍 ×K），所以逆映射只要两次一维求解（触须避让 / 头部 AO 用 unwarpBH）。
const pw = (y: number, pts: [number, number][]) => { if (y <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) { const [y0, v0] = pts[i - 1], [y1, v1] = pts[i]; const t = (y - y0) / (y1 - y0), u = t * t * (3 - 2 * t); return v0 + (v1 - v0) * u } return pts[pts.length - 1][1] }
const WA = 0.05
const WD = (y: number) => pw(y, [[0.3, 0.004], [0.8, 0.012], [1.0, 0.016], [1.15, 0.02], [1.32, 0.03], [1.44, 0.036]])
const WC = (y: number) => pw(y, [[0.12, 0.02], [0.3, 0.06], [0.85, 0.07], [1.05, 0.09], [1.3, 0.13], [1.42, 0.09], [1.5, 0.015]])
const WSH = (y: number) => pw(y, [[1.0, 0], [1.3, 0.008], [1.42, 0.006], [1.5, 0]])
const ws = (ax: number) => { const t = Math.min(1, Math.max(0, (ax - 0.03) / 0.12)); return t * t * (3 - 2 * t) }
const BELLY = (x: number, y: number, z: number) => 0.026 * Math.exp(-(x * x) / (2 * 0.1 * 0.1)) * Math.exp(-((y - 1.02) ** 2) / (2 * 0.085 * 0.085)) * (() => { const t = Math.min(1, Math.max(0, (z + 0.04) / 0.1)); return t * t * (3 - 2 * t) })()
/** 手放大倍数（以腕为中心） */
export const HAND_K = 1.12
const WRIST: Record<number, { w: V3; df: V3; e: V3; Lf: number }> = {}
for (const s of [1, -1]) { const e: V3 = [BH_J.elbow[0] * s, BH_J.elbow[1], BH_J.elbow[2]], w: V3 = [BH_J.wrist[0] * s, BH_J.wrist[1], BH_J.wrist[2]]; WRIST[s] = { w, e, df: nrm(sub(w, e)), Lf: lenv(sub(w, e)) } }
/** 手放大的过渡（前臂参数 t：袖口 0.88 → 腕 1.0） */
const handBlend = (s: number, p: V3) => { const A = WRIST[s]; const t = dot(sub(p, A.e), A.df) / A.Lf; const u = Math.min(1, Math.max(0, (t - 0.88) / 0.12)); return u * u * (3 - 2 * u) }
/** 行李员空间 → 野兽空间（hs = ±1：该侧的手 / 袖口按 HAND_K 放大；0 = 不放大） */
export function warpBH(p: V3, hs = 0): V3 {
  let x = p[0], y = p[1], z = p[2]
  if (hs) { const k = 1 + (HAND_K - 1) * handBlend(hs, p), w = WRIST[hs].w; x = w[0] + (x - w[0]) * k; y = w[1] + (y - w[1]) * k; z = w[2] + (z - w[2]) * k }
  const ax = Math.abs(x), sx = x >= 0 ? 1 : -1
  // 腿：绕各自腿轴横向加粗（裆部 |x| < 4 cm 渐弱，避免左右交叉）
  const lk = 0.1 * pw(y, [[0.1, 0.25], [0.3, 0.75], [0.85, 1], [1.0, 0]]), lc = sx * 0.1
  const x2 = x * (1 + WA) + sx * WD(y) * ws(ax) + (x - lc) * lk * (() => { const t = Math.min(1, ax / 0.04), u = Math.min(1, Math.max(0, (0.225 - ax) / 0.05)); return t * t * (3 - 2 * t) * u * u * (3 - 2 * u) })()
  const z2 = z * (1 + WC(y)) + WSH(y) + BELLY(x, y, z)
  return [x2 * K, y * K, z2 * K]
}
/** 法线随形变（数值雅可比的逆转置） */
export function warpN(p: V3, n: V3, hs = 0): V3 {
  const e = 0.0015, f = (q: V3) => warpBH(q, hs)
  const c0 = sub(f([p[0] + e, p[1], p[2]]), f([p[0] - e, p[1], p[2]])), c1 = sub(f([p[0], p[1] + e, p[2]]), f([p[0], p[1] - e, p[2]])), c2 = sub(f([p[0], p[1], p[2] + e]), f([p[0], p[1], p[2] - e]))
  // J 的列 = c0,c1,c2；J^{-T} n ∝ (c1×c2)·n0 + (c2×c0)·n1 + (c0×c1)·n2
  const r = add(add(scl(cross(c1, c2), n[0]), scl(cross(c2, c0), n[1])), scl(cross(c0, c1), n[2]))
  return nrm(r)
}
/** 野兽空间 → 行李员空间（不含手放大；触须避让 / AO 用） */
export function unwarpBH(P: V3): V3 {
  const y = P[1] / K, X = P[0] / K, Z = P[2] / K
  const sx = X >= 0 ? 1 : -1, AX = Math.abs(X)
  let lo = 0, hi = AX + 0.01
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (warpBH([m, y, 0])[0] / K < AX) lo = m; else hi = m }
  const x = sx * (lo + hi) / 2
  let z = (Z - WSH(y)) / (1 + WC(y))
  for (let i = 0; i < 4; i++) z = (Z - WSH(y) - BELLY(x, y, z)) / (1 + WC(y))
  return [x, y, z]
}
/** 野兽空间里求值行李员空间 SDF（距离近似按 K 放大） */
export const bhSdfW = (f: (x: number, y: number, z: number) => number) => (X: number, Y: number, Z: number) => { const q = unwarpBH([X, Y, Z]); return f(q[0], q[1], q[2]) * K * 1.08 }
export const toBH = unwarpBH
export const fromBH = (p: V3): V3 => warpBH(p)
/** 身体主关节（野兽空间） */
export const J = Object.fromEntries(Object.entries(BH_J).map(([k, v]) => [k, fromBH(v as V3)])) as Record<keyof typeof BH_J, V3>
/** 手部坐标系 / 指节（行李员空间；身体部件在行李员空间里求值） */
export const BH_HAND = BH_HANDS

// ---------- 墨鱼头的几何锚点（野兽空间，静止姿态）----------
/** 头部主体（两眼之间的「脸」团）：椭球中心 + 半径 */
// v3（ZAN 10-31 20:38）：胴部明显加大——脸团宽 ×1.34、高 ×1.08、厚 ×0.98（原 r [0.082, 0.08, 0.096]、c [0, 1.708, 0.02]）
export const LOBE = { c: [0, 1.715, 0.012] as V3, r: [0.11, 0.086, 0.094] as V3 }
/** 外套膜：根部 M0、轴向 D（向上后方）、长度、背腹方向 FH（垂直于 D、指向上前方 = 裂缝那一侧） */
export const MANTLE = (() => {
  // v3：外套膜根部后移、轴更向后倒（原 D (0, 0.74, -0.67)、L 0.265），配合 beastHead 的粗胴 + 尖端下垂，有重量感
  const M0: V3 = [0, 1.745, -0.042]
  const D = nrm([0, 0.68, -0.73])
  const FH = nrm([0, 0.73, 0.68])
  return { M0, D, FH, L: 0.27 }
})()
/** 裂缝铰链：外套膜轴线向背侧偏 5 cm 的一条线（两半绕它向两侧掀开）；裂缝只在铰链面之前 SLIT_F 以外 */
export const HINGE: V3 = sub(MANTLE.M0, scl(MANTLE.FH, 0.064))
/** 裂缝只属于真身头部网格（v2：绅士头部网格无缝）；tMax = 裂缝沿外套膜轴向的上端（以上外套膜连成一体，像拉链只拉开下半） */
export const SLIT = { halfW: 0.0024, f0: 0.02, yBottom: 1.672, tMax: 0.62 }
/** 两只大眼：球心（左眼 x>0）、朝向（向外、略向前）、眼球半径、眼包半径 */
// v3：眼随头放大 ×1.1，眼距 11.4 → 13.2 cm（头宽 ×1.29，眼距 / 头宽 0.70 → 0.62，更偏前偏近）
export const EYE = { c: [0.066, 1.73, 0.07] as V3, dir: nrm([0.82, 0.06, 0.78]), r: 0.031, bulge: 0.041 }
export const eyeC = (s: number): V3 => [EYE.c[0] * s, EYE.c[1], EYE.c[2]]
export const eyeDir = (s: number): V3 => [EYE.dir[0] * s, EYE.dir[1], EYE.dir[2]]
/** 口（触须根部一圈）：中心、口面法线（朝下前）、环半径 */
export const MOUTH = { c: [0, 1.638, 0.078] as V3, n: nrm([0, -0.9, 0.44]), r: 0.047 }
/** 喙：根部（喙骨原点，藏在脸团里）、下颚铰点（相对喙骨） */
export const BEAK = { c: [0, 1.69, 0.056] as V3, jaw: [0, -0.008, 0.004] as V3 }
/** 侧鳍中点（左），鳍骨原点 */
export const FIN_C: V3 = add(add(MANTLE.M0, scl(MANTLE.D, 0.13)), [0.084, 0, 0])
/** 西装背部鼓包骨（真身） */
export const BULGE_C: V3 = fromBH([0, 1.3, -0.04])

// ---------- 触须规格 ----------
export interface TentSpec { i: number; kind: 'arm' | 'club'; phi: number; len: number; r0: number; side: number }
/** 口环上的角度 phi（0 = 角色左侧 +X，π/2 = 正前方 / 腹侧，-π/2 = 颈侧）。腕 8 条均布，2 条长触腕在腹侧两腕之间 */
export const TENTS: TentSpec[] = (() => {
  const out: TentSpec[] = []
  // v2：加长加粗——8 条腕垂到胸口中部（衬衫第二、三颗扣子一带），根部粗壮、渐细；背侧（靠颈）两对略短、往两边分；腹侧略长
  const L = [0.38, 0.4, 0.42, 0.35, 0.35, 0.42, 0.4, 0.38]
  for (let k = 0; k < 8; k++) {
    const phi = -Math.PI / 2 + ((k + 0.5) / 8) * Math.PI * 2
    out.push({ i: k, kind: 'arm', phi, len: L[k], r0: 0.0215, side: Math.cos(phi) >= 0 ? 1 : -1 })
  }
  // 2 条长触腕：在腹侧两腕之间、口环略内，静止时收在腕群里、略长于其他
  for (const s of [1, -1]) out.push({ i: out.length, kind: 'club', phi: Math.PI / 2 - s * 0.24, len: 0.47, r0: 0.013, side: s })
  return out
})()
export const N_TENT_BONES = 9
export const tentBone = (i: number, k: number) => `tent${i}_${k}`

// ---------- 骨骼表 ----------
export interface BoneDef { name: string; parent: number; pos: V3; flex?: V3 }
export const B: Record<string, number> = {}
export const BONES: BoneDef[] = []
const HAND_BONE = /^(hand|thumb|index|middle|ring|pinky)\d?([LR])$/
for (const d of BH_BONES) {
  const m = HAND_BONE.exec(d.name), hs = m ? (m[2] === 'L' ? 1 : -1) : 0
  B[d.name] = BONES.length; BONES.push({ name: d.name, parent: d.parent, pos: warpBH(d.pos, hs), flex: d.flex })
}
export const N_BODY_BONES = BH_N
function addBone(name: string, parent: string, pos: V3) { B[name] = BONES.length; BONES.push({ name, parent: B[parent], pos }) }
addBone('backBulge', 'chest', BULGE_C)
addBone('mantleL', 'head', HINGE)
addBone('mantleR', 'head', HINGE)
addBone('finL', 'mantleL', FIN_C)
addBone('finR', 'mantleR', [-FIN_C[0], FIN_C[1], FIN_C[2]])
addBone('eyeL', 'mantleL', eyeC(1))
addBone('eyeR', 'mantleR', eyeC(-1))
addBone('beak', 'head', BEAK.c)
addBone('beakJaw', 'beak', add(BEAK.c, BEAK.jaw))
export const TENT_BONE0 = BONES.length
for (const t of TENTS) for (let k = 0; k < N_TENT_BONES; k++) addBone(tentBone(t.i, k), k === 0 ? 'head' : tentBone(t.i, k - 1), MOUTH.c)
/** 触须路径生成后填入骨骼位置（pts[i][k] = 第 i 条第 k 节骨的模型空间位置） */
export function setTentacleBonePositions(pts: V3[][]) {
  for (const t of TENTS) for (let k = 0; k < N_TENT_BONES; k++) BONES[B[tentBone(t.i, k)]].pos = pts[t.i][k]
}
void cross; void dot; void lenv; void rot
