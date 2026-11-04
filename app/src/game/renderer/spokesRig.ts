// [spokes] 迎宾女郎（Entity 28 / The Spokeslady）骨架定义（阶段 1：只建模）。
// 模型空间：+Z 正面、+Y 向上、地面 y=0、+X = 角色左侧（与看门人 / 行李员 / 野兽同约定）。
//
// 身体骨骼沿用行李员人体骨架（bellhopRig 前 N_BODY_BONES 根，名字 / 顺序一致），身体部件在「行李员空间」里求值，
// 提取后用 warpBH 正向形变到迎宾女郎空间（女性体型）：
//   · 整体 ×K（1.85 m 男体 → 约 1.63 m 女体到发顶的身高；头换成写实兔头，耳尖约 2.0 m）
//   · 躯干横向按高度缩放 S(y)：窄肩 0.88、收腰 0.78、臀部 1.06（|x| 小的躯干部分）
//   · 手臂整体内移（跟肩走）+ 绕臂轴变细 ×0.86；手以腕为中心 ×0.9（手指骨同步）
//   · 胸部前凸、腰部变薄、臀部后凸（只改 z）
// 在这之后追加迎宾女郎专有骨骼：
//   ear{L,R}{0,1,2}（兔耳每侧 3 节，0 挂 head）、nose（挂 head，鼻子抽动）、whisker{L,R}（挂 nose，胡须垫）、jaw（挂 head，下唇 / 下巴）
import { BONES as BH_BONES, N_BODY_BONES as BH_N, HANDS as BH_HANDS, J as BH_J } from './bellhopRig'
import { add, cross, dot, nrm, scl, sub, lenv, rot, W4, chainWeights, type V3 } from './conciergeRig'

export { add, cross, dot, nrm, scl, sub, lenv, rot, W4, chainWeights, type V3 }

/** 行李员空间 → 迎宾女郎空间的整体缩放 */
export const K = 0.925
const cl = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
const ss = (a: number, b: number, x: number) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const gs = (x: number, w: number) => Math.exp(-(x * x) / (w * w))
const pw = (y: number, pts: [number, number][]) => { if (y <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) { const [y0, v0] = pts[i - 1], [y1, v1] = pts[i]; const t = (y - y0) / (y1 - y0), u = t * t * (3 - 2 * t); return v0 + (v1 - v0) * u } return pts[pts.length - 1][1] }

/** 躯干横向缩放（行李员空间 y） */
export const SX_PTS: [number, number][] = [[0.55, 1.0], [0.78, 1.04], [0.88, 1.07], [0.97, 1.0], [1.07, 0.79], [1.15, 0.82], [1.27, 0.91], [1.38, 0.915], [1.46, 0.915], [1.6, 0.9]]
const SX = (y: number) => pw(y, SX_PTS)
/** 躯干纵深缩放 */
const SZ = (y: number) => pw(y, [[0.55, 1.0], [0.9, 1.0], [1.06, 0.88], [1.18, 0.9], [1.3, 0.95], [1.45, 0.95], [1.6, 0.92]])
/** 肩处的横向缩放 → 手臂整体内移量 */
const SH_X = BH_J.shoulder[0], ARM_SHIFT = SH_X * (1 - 0.915)
/** 胸 / 臀（z 向位移，行李员空间） */
const BUST = (x: number, y: number, z: number) => 0.044 * gs(Math.abs(x) - 0.068, 0.052) * gs(y - 1.285, 0.062) * ss(-0.02, 0.06, z)
const SEAT = (x: number, y: number, z: number) => -0.022 * gs(Math.abs(x) - 0.06, 0.075) * gs(y - 0.9, 0.08) * ss(0.0, -0.06, z)
/** 手臂变细 / 手缩小 */
export const ARM_THIN = 0.86, HAND_K = 0.9

interface ArmBH { a: V3; e: V3; w: V3 }
const ARMBH: Record<number, ArmBH> = {}
for (const s of [1, -1]) ARMBH[s] = { a: [BH_J.shoulder[0] * s, BH_J.shoulder[1], BH_J.shoulder[2]], e: [BH_J.elbow[0] * s, BH_J.elbow[1], BH_J.elbow[2]], w: [BH_J.wrist[0] * s, BH_J.wrist[1], BH_J.wrist[2]] }
const segClosest = (p: V3, a: V3, b: V3): [V3, number] => { const ab = sub(b, a), t = cl(dot(sub(p, a), ab) / dot(ab, ab), 0, 1); return [add(a, scl(ab, t)), t] }
const capD = (p: V3, a: V3, b: V3, r: number) => lenv(sub(p, segClosest(p, a, b)[0])) - r
/** 躯干近似（行李员空间，和 bellhop torsoCore 同量级；只用来判定「属于手臂」的程度） */
function torsoApprox(p: V3) {
  const [x, y, z] = p
  const e = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) => { const k = Math.hypot((x - cx) / rx, (y - cy) / ry, (z - cz) / rz); return (k - 1) * Math.min(rx, ry, rz) }
  return Math.min(e(0, 1.3, -0.014, 0.15, 0.21, 0.1), e(0, 1.08, -0.006, 0.135, 0.17, 0.095), e(0, 0.9, 0, 0.17, 0.12, 0.11))
}
/** 属于手臂的程度（0 躯干 … 1 手臂 / 手），行李员空间 */
export function armness(p: V3, s?: number) {
  const sx = s ?? (p[0] >= 0 ? 1 : -1), A = ARMBH[sx]
  const dArm = Math.min(capD(p, A.a, A.e, 0.052), capD(p, A.e, A.w, 0.046), lenv(sub(p, A.w)) - 0.07)
  const dTor = torsoApprox(p)
  const along = dot(sub(p, A.a), nrm(sub(A.e, A.a)))
  const lateral = (p[0] * sx - 0.11) / 0.06
  return cl(ss(-0.025, 0.02, dTor - dArm) * ss(-0.07, 0.0, along) * ss(-0.6, 0.6, lateral), 0, 1)
}
/** 手臂部分的形变（行李员空间点 → 行李员空间点，仍未 ×K）：变细 + 手缩小 + 整体内移 */
function armWarp(p: V3, s: number, hand: number): V3 {
  const A = ARMBH[s]
  // 手：以腕为中心缩小
  let q = p
  if (hand > 0) { const k = 1 + (HAND_K - 1) * hand; q = add(A.w, scl(sub(q, A.w), k)) }
  // 绕臂轴变细（上臂 / 前臂分段取最近点；腕以外渐弱）
  const [c1] = segClosest(q, A.a, A.e), [c2, t2] = segClosest(q, A.e, A.w)
  const useFore = lenv(sub(q, c2)) < lenv(sub(q, c1))
  const c = useFore ? c2 : c1
  const past = useFore ? ss(0.92, 1.0, t2 + dot(sub(q, A.w), nrm(sub(A.w, A.e))) / lenv(sub(A.w, A.e))) : 0
  const thin = 1 + (ARM_THIN - 1) * (1 - hand) * (1 - 0.3 * past)
  q = add(c, scl(sub(q, c), thin))
  return [q[0] - s * ARM_SHIFT, q[1], q[2]]
}
/** 手的混合量（前臂参数：0.9 → 1.0 腕） */
function handBlend(p: V3, s: number) { const A = ARMBH[s], d = nrm(sub(A.w, A.e)), L = lenv(sub(A.w, A.e)); return ss(0.9, 1.0, dot(sub(p, A.e), d) / L) }
/**
 * 行李员空间 → 迎宾女郎空间。
 * mode：'auto' 按 armness 混合（衣服 / 身体部件）；'arm' 强制按手臂（手 / 袖口小件 / 手臂骨）；'trunk' 强制按躯干（腿 / 躯干骨）
 */
export function warpBH(p: V3, mode: 'auto' | 'arm' | 'trunk' | number = 'auto'): V3 {
  const [x, y, z] = p, sx = x >= 0 ? 1 : -1
  const a = mode === 'arm' ? 1 : mode === 'trunk' ? 0 : typeof mode === 'number' ? mode : armness(p, sx)
  // 躯干部分
  let tx = x * SX(y), tz = z * SZ(y) + BUST(x, y, z) + SEAT(x, y, z)
  // 腿（y < 0.9）：只按 SX 移动腿轴，不压扁腿（腿轴附近按腿中心平移）
  if (y < 0.97) { const legC = sx * 0.09, kk = ss(0.97, 0.82, y); tx = mix2(tx, legC * SX(y) + (x - legC) * 0.89, kk) }
  if (a <= 0) return [tx * K, y * K, tz * K]
  const h = handBlend(p, sx)
  const q = armWarp(p, sx, h)
  const ax = q[0], az = q[2] + BUST(x, y, z) * (1 - a) * 0
  return [mix2(tx, ax, a) * K, mix2(y, q[1], a) * K, mix2(tz, az, a) * K]
}
const mix2 = (a: number, b: number, t: number) => a + (b - a) * t
/** 法线随形变（数值雅可比的逆转置） */
export function warpN(p: V3, n: V3, mode: 'auto' | 'arm' | 'trunk' | number = 'auto'): V3 {
  const e = 0.0015, m = mode === 'auto' ? armness(p) : mode
  const f = (q: V3) => warpBH(q, m)
  const c0 = sub(f([p[0] + e, p[1], p[2]]), f([p[0] - e, p[1], p[2]])), c1 = sub(f([p[0], p[1] + e, p[2]]), f([p[0], p[1] - e, p[2]])), c2 = sub(f([p[0], p[1], p[2] + e]), f([p[0], p[1], p[2] - e]))
  const r = add(add(scl(cross(c1, c2), n[0]), scl(cross(c2, c0), n[1])), scl(cross(c0, c1), n[2]))
  return nrm(r)
}
/** 迎宾女郎空间 → 行李员空间（牛顿迭代；AO / 头部避让用） */
export function unwarpBH(P: V3): V3 {
  let p: V3 = [P[0] / K, P[1] / K, P[2] / K]
  for (let it = 0; it < 6; it++) {
    const w = warpBH(p), r = sub(w, P)
    if (lenv(r) < 1e-5) break
    p = sub(p, scl(r, 1 / K))
  }
  return p
}
export const fromBH = (p: V3): V3 => warpBH(p)
/** 身体主关节（迎宾女郎空间） */
const ARM_J = new Set(['shoulder', 'elbow', 'wrist'])
export const J = Object.fromEntries(Object.entries(BH_J).map(([k, v]) => [k, warpBH(v as V3, ARM_J.has(k) ? 'arm' : 'trunk')])) as Record<keyof typeof BH_J, V3>
export const BH_HAND = BH_HANDS
export { BH_J }

// ---------- 兔头几何锚点 ----------
// 头部 SDF / 锚点按「头局部坐标」写（数值是在原始比例下雕的），实际坐标 = HC + (局部 − HC)·HS + (0, HY, 0)：
//   HS 整体放大（兔头比人头大，附图头宽 ≈ 肩宽的一半）、HY 整体下移（下巴贴近衬衫领，人颈只露一小截）
export const HS = 1.16, HY = -0.078
export const HC: V3 = [0, 1.62, 0.02]
export const headToAbs = (p: V3): V3 => [HC[0] + (p[0] - HC[0]) * HS, HC[1] + (p[1] - HC[1]) * HS + HY, HC[2] + (p[2] - HC[2]) * HS]
export const headToLocal = (p: V3): V3 => [HC[0] + (p[0] - HC[0]) / HS, HC[1] + (p[1] - HY - HC[1]) / HS, HC[2] + (p[2] - HC[2]) / HS]
/** 颅顶（不含耳）/ 下巴（局部）：头高 ≈ 0.178 × HS */
export const HEAD_L = { crown: 1.722, chin: 1.544 }
export const HEAD = { crown: headToAbs([0, 1.722, 0])[1], chin: headToAbs([0, 1.544, 0])[1] }
/** 眼（局部）：球心（左眼 x>0）、朝向（主要朝侧面，略向前上）、眼球半径——兔眼大、长在头侧偏上 */
export const EYE_L = { c: [0.062, 1.66, 0.03] as V3, dir: nrm([0.93, 0.14, 0.32]), r: 0.0196 }
export const EYE = { c: headToAbs(EYE_L.c), dir: EYE_L.dir, r: EYE_L.r * HS }
export const eyeC = (s: number): V3 => [EYE.c[0] * s, EYE.c[1], EYE.c[2]]
export const eyeCL = (s: number): V3 => [EYE_L.c[0] * s, EYE_L.c[1], EYE_L.c[2]]
export const eyeDir = (s: number): V3 => [EYE.dir[0] * s, EYE.dir[1], EYE.dir[2]]
/** 鼻尖、胡须垫中心（左）（局部 / 实际） */
export const NOSE_L: V3 = [0, 1.604, 0.134], WPAD_L: V3 = [0.02, 1.583, 0.112]
export const NOSE = headToAbs(NOSE_L), WPAD = headToAbs(WPAD_L)
/** 兔耳（实际坐标）：根部（左）、主轴方向、长度（耳长 ≈ 头高 × 1.35，含埋进毛里的一截）、最大半宽、内侧朝向 */
export const EAR_L = { base: [0.03, 1.71, -0.044] as V3 }
export const EAR = { base: headToAbs(EAR_L.base), dir: nrm([0.24, 1, -0.27]), len: 0.232 * HS, w: 0.056 * HS, open: nrm([0.55, 0.0, 0.84]) }
export const earBase = (s: number): V3 => [EAR.base[0] * s, EAR.base[1], EAR.base[2]]
export const earBaseL = (s: number): V3 => [EAR_L.base[0] * s, EAR_L.base[1], EAR_L.base[2]]
export const earDir = (s: number): V3 => [EAR.dir[0] * s, EAR.dir[1], EAR.dir[2]]
/** 耳骨沿耳长的位置（比例） */
export const EAR_T = [0, 0.34, 0.68]

// ---------- 骨骼表 ----------
export interface BoneDef { name: string; parent: number; pos: V3; flex?: V3 }
export const B: Record<string, number> = {}
export const BONES: BoneDef[] = []
const HAND_BONE = /^(hand|thumb|index|middle|ring|pinky)\d?([LR])$/
const ARM_BONE = /^(upperArm|foreArm)([LR])$/
for (const d of BH_BONES) {
  const isArm = HAND_BONE.test(d.name) || ARM_BONE.test(d.name)
  B[d.name] = BONES.length; BONES.push({ name: d.name, parent: d.parent, pos: warpBH(d.pos, isArm ? 'arm' : 'trunk'), flex: d.flex })
}
export const N_BODY_BONES = BH_N
function addBone(name: string, parent: string, pos: V3) { B[name] = BONES.length; BONES.push({ name, parent: B[parent], pos }) }
export const earPoint = (s: number, t: number): V3 => add(earBase(s), scl(earDir(s), EAR.len * t))
for (const s of [1, -1]) { const S = s > 0 ? 'L' : 'R'; for (let k = 0; k < 3; k++) addBone(`ear${S}${k}`, k === 0 ? 'head' : `ear${S}${k - 1}`, earPoint(s, EAR_T[k])) }
addBone('nose', 'head', headToAbs([NOSE_L[0], NOSE_L[1] - 0.006, NOSE_L[2] - 0.02]))
addBone('whiskerL', 'nose', WPAD)
addBone('whiskerR', 'nose', [-WPAD[0], WPAD[1], WPAD[2]])
addBone('jaw', 'head', headToAbs([0, 1.585, 0.02]))
// [stage 2] 裙摆骨：挂下摆骨 hemL/R、在膝高的腿轴上；裙下段（膝上 ~15 cm 到下摆）蒙在它上面，动画里大腿抬高（坐 / 蹲）时
//   沿腿轴横向收窄（scale X / Z），裙筒口贴到腿上，不露出裙子里面
for (const s of [1, -1]) addBone('skirt' + (s > 0 ? 'L' : 'R'), 'hem' + (s > 0 ? 'L' : 'R'), warpBH([s * 0.095, 0.5, 0.005], 'trunk'))
void rot
