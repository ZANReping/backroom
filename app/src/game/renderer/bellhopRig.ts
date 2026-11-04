// [bellhop] 行李员（Entity 135 / The Bellhopper）骨架定义（静止姿态 = 建模姿态；模型空间：+Z 正面、+Y 向上、地面 y=0、+X = 角色左侧）。
// 只放「数」：关节位置、骨骼表、手部局部坐标系与指节位置。网格（SDF 部件）与骨骼都从这里取。
// 人类体型：约 1.85 m（头顶 1.80 + 帽 ~7 cm），瘦高男体；人腿（髋 → 膝 → 踝 → 趾）。
// 数学 / 权重工具（V3、W4、chainWeights …）直接复用看门人的 conciergeRig（只读导入，不改动看门人）。
import { add, cross, dot, nrm, rot, scl, sub, side, type V3 } from './conciergeRig'

export { add, cross, dot, nrm, rot, scl, sub, side, lenv, W4, chainWeights, jointF, segDist, segParam, type V3 } from './conciergeRig'

// ---------- 主关节（左侧 s=+1；右侧镜像 x）----------
export const J = {
  hips: [0, 0.99, 0] as V3,
  spine: [0, 1.13, -0.008] as V3,
  chest: [0, 1.3, -0.012] as V3,
  neck: [0, 1.5, -0.022] as V3,
  /** 头骨 = 寰椎（颈顶）。头拧 180° 时绕它转 */
  head: [0, 1.6, -0.018] as V3,
  clav: [0.028, 1.475, -0.012] as V3,
  shoulder: [0.178, 1.455, -0.022] as V3,
  elbow: [0.222, 1.168, -0.05] as V3,
  wrist: [0.238, 0.912, 0.012] as V3,
  hip: [0.088, 0.935, 0.0] as V3,
  knee: [0.098, 0.51, 0.012] as V3,
  ankle: [0.104, 0.088, -0.03] as V3,
  toe: [0.11, 0.022, 0.1] as V3,
}

// ---------- 头部（直立，无俯仰）：面盘中心 / 帽 ----------
/** 面盘中心（模型空间）：面盘网格的局部原点；局部 +Z 朝前 */
export const FACE_C: V3 = [0, 1.68, 0.086]
/** 头顶（发顶）高度 */
export const HEAD_TOP = 1.84
/** 帽：底面中心（模型空间）+ 倾角。端正戴在头顶正中、略前倾（tiltX > 0 帽顶朝前），帽底压进头发约 3 cm（帽口一圈头发被压扁）。
 *  尺寸按附图：帽径 ≈ 面盘宽的 0.72，帽高 ≈ 帽径的一半 */
export const HAT = { c: [0, 1.808, -0.026] as V3, tiltZ: -0.03, tiltX: 0.11, r0: 0.061, r1: 0.058, h: 0.058 }

// ---------- 手：局部坐标系（原点在腕；a 指尖方向，r 桡侧/拇指侧，d 手背）----------
export interface HandFrame { o: V3; a: V3; r: V3; d: V3; s: number }
export function handFrame(s: number): HandFrame {
  const el = side(J.elbow, s), wr = side(J.wrist, s)
  const fore = nrm(sub(wr, el))
  const a = nrm(add(scl(fore, 0.75), [0, -0.25, 0]))
  let r = nrm(sub([0, 0, 1], scl(a, a[2])))
  r = nrm(rot(r, a, -s * 0.15))
  const d = nrm(cross(a, r))
  return { o: wr, a, r, d: s > 0 ? scl(d, -1) : d, s }
}
export const hp = (F: HandFrame, ta: number, tr: number, td: number): V3 => [
  F.o[0] + F.a[0] * ta + F.r[0] * tr + F.d[0] * td,
  F.o[1] + F.a[1] * ta + F.r[1] * tr + F.d[1] * td,
  F.o[2] + F.a[2] * ta + F.r[2] * tr + F.d[2] * td,
]
export const hdir = (F: HandFrame, ta: number, tr: number, td: number): V3 => nrm([
  F.a[0] * ta + F.r[0] * tr + F.d[0] * td, F.a[1] * ta + F.r[1] * tr + F.d[1] * td, F.a[2] * ta + F.r[2] * tr + F.d[2] * td])

export interface Finger { name: string; joints: V3[]; radii: number[]; flex: V3 }
/** 五指（附图：苍白、细长）：每指 4 个点（基节根、近节间、远节间、指尖）+ 每点半径。静止姿态：自然微屈 */
export function handFingers(F: HandFrame): Finger[] {
  const out: Finger[] = []
  const spec: [string, number, number, number[], number, number, number[]][] = [
    ['index', 0.026, 0.1, [0.052, 0.032, 0.025], 0.0084, 0.07, [0.18, 0.3, 0.18]],
    ['middle', 0.008, 0.104, [0.057, 0.036, 0.027], 0.0087, 0.015, [0.22, 0.34, 0.2]],
    ['ring', -0.01, 0.101, [0.053, 0.034, 0.026], 0.0082, -0.045, [0.27, 0.38, 0.22]],
    ['pinky', -0.026, 0.093, [0.042, 0.026, 0.022], 0.0072, -0.12, [0.32, 0.42, 0.24]],
  ]
  for (const [name, tr, ta, L, r0, spread, flex] of spec) {
    let p: V3 = hp(F, ta, tr, 0.002)
    let dir = hdir(F, Math.cos(spread), Math.sin(spread), 0)
    const flexAxis = nrm(cross(dir, scl(F.d, -1)))
    const joints: V3[] = [p], radii = [r0]
    for (let k = 0; k < 3; k++) {
      dir = rot(dir, flexAxis, flex[k])
      p = add(p, scl(dir, L[k])); joints.push(p); radii.push(r0 * [0.88, 0.8, 0.66][k])
    }
    out.push({ name, joints, radii, flex: flexAxis })
  }
  {
    let p: V3 = hp(F, 0.022, 0.024, -0.01)
    let dir = hdir(F, 0.95, 0.26, -0.24)
    const flexAxis = nrm(cross(dir, hdir(F, 0, -0.3, -0.95)))
    const L = [0.044, 0.034, 0.028], fl = [0.05, 0.16, 0.2]
    const joints: V3[] = [p], radii = [0.012]
    for (let k = 0; k < 3; k++) { dir = rot(dir, flexAxis, fl[k]); p = add(p, scl(dir, L[k])); joints.push(p); radii.push([0.0104, 0.0093, 0.0078][k]) }
    out.unshift({ name: 'thumb', joints, radii, flex: flexAxis })
  }
  return out
}

// ---------- 骨骼表 ----------
export interface BoneDef { name: string; parent: number; pos: V3; flex?: V3 }
export const B: Record<string, number> = {}
export const BONES: BoneDef[] = []
function addBone(name: string, parent: string | null, pos: V3, flex?: V3) { B[name] = BONES.length; BONES.push({ name, parent: parent === null ? -1 : B[parent], pos, flex }) }
addBone('root', null, [0, 0, 0])
addBone('hips', 'root', J.hips)
addBone('spine', 'hips', J.spine)
addBone('chest', 'spine', J.chest)
addBone('neck', 'chest', J.neck)
addBone('head', 'neck', J.head)
export const HANDS: Record<number, { F: HandFrame; fingers: Finger[] }> = {}
for (const s of [1, -1]) {
  const S = s > 0 ? 'L' : 'R'
  addBone('clav' + S, 'chest', side(J.clav, s))
  addBone('upperArm' + S, 'clav' + S, side(J.shoulder, s))
  addBone('foreArm' + S, 'upperArm' + S, side(J.elbow, s))
  addBone('hand' + S, 'foreArm' + S, side(J.wrist, s))
  const F = handFrame(s), fingers = handFingers(F)
  HANDS[s] = { F, fingers }
  for (const f of fingers) for (let k = 0; k < 3; k++) addBone(`${f.name}${k + 1}${S}`, k === 0 ? 'hand' + S : `${f.name}${k}${S}`, f.joints[k], f.flex)
}
for (const s of [1, -1]) {
  const S = s > 0 ? 'L' : 'R'
  addBone('thigh' + S, 'hips', side(J.hip, s))
  addBone('shin' + S, 'thigh' + S, side(J.knee, s))
  addBone('foot' + S, 'shin' + S, side(J.ankle, s))
  addBone('toe' + S, 'foot' + S, side(J.toe, s))
}
// 下摆骨（阶段 2）：与大腿同一枢轴、挂 hips；动画里按大腿屈伸的一部分 + 二阶滞后摆动（长制服下摆不再直接蒙在大腿上，大步 / 下蹲时不穿模）
for (const s of [1, -1]) addBone('hem' + (s > 0 ? 'L' : 'R'), 'hips', side(J.hip, s))
export const N_BODY_BONES = BONES.length
void dot
