// [concierge v2] 看门人骨架定义（静止姿态 = 建模姿态；模型空间：+Z 正面、+Y 向上、地面 y=0、+X = 角色左侧）。
// 只放「数」：关节位置、骨骼表、手部局部坐标系与指节位置、链式权重工具。网格（SDF 部件）与骨骼都从这里取。
// 阶段 2 动画：每根指骨 userData.flexAxis 给出局部屈曲轴（绕它转正角 = 向掌心弯）。
import { clamp, sstep } from './conciergeSdf'

export type V3 = [number, number, number]
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const lenv = (a: V3) => Math.hypot(a[0], a[1], a[2])
/** 绕单位轴 k 旋转 v 角 a（Rodrigues） */
export function rot(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v)
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)]
}

// ---------- 主关节（左侧 s=+1；右侧镜像 x）----------
export const J = {
  hips: [0, 1.04, 0] as V3,
  spine: [0, 1.2, -0.01] as V3,
  chest: [0, 1.38, -0.015] as V3,
  neck: [0, 1.585, -0.03] as V3,
  head: [0, 1.9, -0.035] as V3,
  tie: [0, 1.578, 0.098] as V3,
  clav: [0.03, 1.565, -0.01] as V3,
  shoulder: [0.188, 1.532, -0.02] as V3,
  elbow: [0.268, 1.226, -0.05] as V3,
  wrist: [0.288, 0.968, 0.022] as V3,
  hip: [0.1, 1.0, 0.0] as V3,
  knee: [0.112, 0.6, 0.12] as V3,
  hock: [0.104, 0.285, -0.112] as V3,
  fetlock: [0.1, 0.078, -0.036] as V3,
}
export const side = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]]

// ---------- 头部规范坐标系：x 横向、u 沿脸（后脑 → 鼻尖）、v 背侧（额头方向）；原点 = head 骨（寰椎）----------
/** 低头角（脸轴在水平面下的角度） */
export const HEAD_PITCH = 0.95
/** 头整体缩放（规范坐标按 1:1 写，世界里放大） */
export const HEAD_SCALE = 1.1
/** 寰椎（head 骨）在规范坐标里的位置：颅后下方 */
export const HEAD_OU = 0.0, HEAD_OV = -0.035
export const HU: V3 = [0, -Math.sin(HEAD_PITCH), Math.cos(HEAD_PITCH)]
export const HV: V3 = [0, Math.cos(HEAD_PITCH), Math.sin(HEAD_PITCH)]
export const headToWorld = (x: number, u: number, v: number): V3 => {
  const du = (u - HEAD_OU) * HEAD_SCALE, dv = (v - HEAD_OV) * HEAD_SCALE
  return [J.head[0] + x * HEAD_SCALE, J.head[1] + HU[1] * du + HV[1] * dv, J.head[2] + HU[2] * du + HV[2] * dv]
}
/** 世界方向 → 规范方向 */
export const dirToHead = (d: V3): V3 => [d[0], dot(d, HU), dot(d, HV)]
export const dirFromHead = (d: V3): V3 => [d[0], HU[1] * d[1] + HV[1] * d[2], HU[2] * d[1] + HV[2] * d[2]]
/** 下颌铰点（规范坐标） */
// v4：移到耳根下方、颞下颌关节处（v3 在 u=0.07 v=-0.03，偏前偏低 → 下颌后段反向转、整体像转进喉部）
export const JAW_HINGE: V3 = [0, 0.036, -0.012]
/** 耳根（规范坐标，左） */
export const EAR_BASE: V3 = [0.05, 0.03, 0.05]

// ---------- 手：局部坐标系（原点在腕；a 指尖方向，r 桡侧/拇指侧，d 手背）----------
export interface HandFrame { o: V3; a: V3; r: V3; d: V3; s: number }
export function handFrame(s: number): HandFrame {
  const el = side(J.elbow, s), wr = side(J.wrist, s)
  const fore = nrm(sub(wr, el))
  // 手掌顺着前臂再略向下垂；掌心朝大腿（-x·s），拇指朝前
  const a = nrm(add(scl(fore, 0.7), [0, -0.3, 0]))
  let r = nrm(sub([0, 0, 1], scl(a, a[2])))
  r = nrm(rot(r, a, -s * 0.12)) // 掌心略转向后
  const d = nrm(cross(a, r)) // a≈-y, r≈+z → a×r ≈ -x：右手手背朝外（-x），左手取反（+x）
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
/** 五指：每指 4 个点（基节根、近节间、远节间、指尖）+ 每点半径。拇指从腕掌关节起。静止姿态：自然微屈 */
export function handFingers(F: HandFrame): Finger[] {
  const out: Finger[] = []
  // 四指：掌指关节在掌远端，略成弧；[名字, 桡向偏移, 关节 ta, 三节长, 根半径, 张开角, 屈曲角×3]
  const spec: [string, number, number, number[], number, number, number[]][] = [
    ['index', 0.029, 0.097, [0.046, 0.028, 0.022], 0.0096, 0.08, [0.22, 0.38, 0.22]],
    ['middle', 0.009, 0.101, [0.05, 0.032, 0.024], 0.0099, 0.02, [0.28, 0.44, 0.24]],
    ['ring', -0.011, 0.098, [0.047, 0.03, 0.023], 0.0094, -0.05, [0.34, 0.48, 0.26]],
    ['pinky', -0.029, 0.09, [0.037, 0.023, 0.02], 0.0083, -0.13, [0.4, 0.52, 0.28]],
  ]
  for (const [name, tr, ta, L, r0, spread, flex] of spec) {
    let p: V3 = hp(F, ta, tr, 0.002)
    let dir = hdir(F, Math.cos(spread), Math.sin(spread), 0)
    const flexAxis = nrm(cross(dir, scl(F.d, -1))) // dir 绕它转 → 朝掌心
    const joints: V3[] = [p], radii = [r0]
    for (let k = 0; k < 3; k++) {
      dir = rot(dir, flexAxis, flex[k])
      p = add(p, scl(dir, L[k])); joints.push(p); radii.push(r0 * [0.88, 0.8, 0.66][k])
    }
    out.push({ name, joints, radii, flex: flexAxis })
  }
  // 拇指：腕掌关节在掌根桡侧偏掌面，指向前下方、略向掌心
  {
    let p: V3 = hp(F, 0.022, 0.026, -0.011)
    let dir = hdir(F, 0.9, 0.4, -0.16)
    const flexAxis = nrm(cross(dir, hdir(F, 0, -0.3, -0.95)))
    const L = [0.042, 0.031, 0.026], fl = [0.05, 0.18, 0.22]
    const joints: V3[] = [p], radii = [0.0135]
    for (let k = 0; k < 3; k++) { dir = rot(dir, flexAxis, fl[k]); p = add(p, scl(dir, L[k])); joints.push(p); radii.push([0.0118, 0.0105, 0.0088][k]) }
    out.unshift({ name: 'thumb', joints, radii, flex: flexAxis })
  }
  return out
}

// ---------- 骨骼表 ----------
export interface BoneDef { name: string; parent: number; pos: V3; flex?: V3; q?: [number, number, number, number] }
/** 膝角内侧（膝窝）平分线方向（静止，模型空间，左腿 s=+1） */
export const kneeInner = (s: number): V3 => { const k = side(J.knee, s); return nrm(add(nrm(sub(side(J.hip, s), k)), nrm(sub(side(J.hock, s), k)))) }
export const B: Record<string, number> = {}
export const BONES: BoneDef[] = []
function addBone(name: string, parent: string | null, pos: V3, flex?: V3) { B[name] = BONES.length; BONES.push({ name, parent: parent === null ? -1 : B[parent], pos, flex }) }
addBone('root', null, [0, 0, 0])
addBone('hips', 'root', J.hips)
addBone('spine', 'hips', J.spine)
addBone('chest', 'spine', J.chest)
addBone('neck', 'chest', J.neck)
addBone('head', 'neck', J.head)
addBone('jaw', 'head', headToWorld(...JAW_HINGE))
addBone('earL', 'head', headToWorld(EAR_BASE[0], EAR_BASE[1], EAR_BASE[2]))
addBone('earR', 'head', headToWorld(-EAR_BASE[0], EAR_BASE[1], EAR_BASE[2]))
addBone('tie', 'chest', J.tie)
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
  addBone('hock' + S, 'shin' + S, side(J.hock, s))
  addBone('pastern' + S, 'hock' + S, side(J.fetlock, s))
  // 2.1：膝部辅助骨（挂大腿、在膝点）：动画里取膝角的一半 → 膝前 / 膝窝顶点用 (1−f)²·大腿 + 2f(1−f)·辅助 + f²·小腿 的二次混合，大屈膝时不塌不鼓
  addBone('kneeFix' + S, 'thigh' + S, side(J.knee, s))
  // 大腿后侧垫骨（挂大腿，局部 Z = 大腿后侧方向）：屈膝时 scale.z 收小 —— 大屈膝时大腿后侧肌肉不再堆成鼓包压到小腿上
  { const k = side(J.knee, s), h = side(J.hip, s), dT = nrm(sub(k, h)), bk0 = kneeInner(s), bk = nrm(sub(bk0, scl(dT, dot(bk0, dT)))), X = nrm(cross(dT, bk))
    const m = [X, dT, bk] // 列：X、Y、Z
    const tr = m[0][0] + m[1][1] + m[2][2]
    let q: [number, number, number, number]
    if (tr > 0) { const S2 = Math.sqrt(tr + 1) * 2; q = [(m[1][2] - m[2][1]) / S2, (m[2][0] - m[0][2]) / S2, (m[0][1] - m[1][0]) / S2, 0.25 * S2] }
    else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const S2 = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; q = [0.25 * S2, (m[1][0] + m[0][1]) / S2, (m[2][0] + m[0][2]) / S2, (m[1][2] - m[2][1]) / S2] }
    else if (m[1][1] > m[2][2]) { const S2 = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; q = [(m[1][0] + m[0][1]) / S2, 0.25 * S2, (m[2][1] + m[1][2]) / S2, (m[2][0] - m[0][2]) / S2] }
    else { const S2 = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; q = [(m[2][0] + m[0][2]) / S2, (m[2][1] + m[1][2]) / S2, 0.25 * S2, (m[0][1] - m[1][0]) / S2] }
    addBone('kneeIn' + S, 'thigh' + S, add(h, scl(sub(k, h), 0.8)))
    BONES[BONES.length - 1].q = q
  }
}
export const N_BODY_BONES = BONES.length

// ---------- 权重工具 ----------
/** 权重累加器：最多保留 4 个最大的（无分配） */
export class W4 {
  i = [0, 0, 0, 0]; w = [0, 0, 0, 0]
  private bi = new Int32Array(16); private bw = new Float64Array(16); private n = 0
  reset() { this.n = 0; return this }
  add(b: number, w: number) {
    if (!(w > 1e-4)) return this
    for (let k = 0; k < this.n; k++) if (this.bi[k] === b) { this.bw[k] += w; return this }
    if (this.n < 16) { this.bi[this.n] = b; this.bw[this.n++] = w }
    return this
  }
  finish(fallback: number) {
    if (this.n === 0) { this.bi[0] = fallback; this.bw[0] = 1; this.n = 1 }
    let s = 0
    for (let k = 0; k < 4; k++) {
      let m = -1
      for (let j = 0; j < this.n; j++) if (this.bw[j] >= 0 && (m < 0 || this.bw[j] > this.bw[m])) m = j
      if (m < 0) { this.i[k] = 0; this.w[k] = 0; continue }
      this.i[k] = this.bi[m]; this.w[k] = this.bw[m]; s += this.bw[m]; this.bw[m] = -1
    }
    for (let k = 0; k < 4; k++) this.w[k] = s > 0 ? this.w[k] / s : k === 0 ? 1 : 0
    return this
  }
}
/** 关节分界：返回 0..1（过关节平面后 → 1）。平面过 j，法向 = 两段方向的平分线 */
export function jointF(p: V3, prev: V3, j: V3, next: V3, R: number) {
  const n = nrm(add(nrm(sub(j, prev)), nrm(sub(next, j))))
  return sstep(-R, R, dot(sub(p, j), n))
}
/** 链式权重：pts 为关节链（n+1 个点）、bones 为 n 段骨（bones[k] 管 pts[k]→pts[k+1]）、R 为每个内部关节的过渡半宽。乘到 scale 上加入 acc */
export function chainWeights(acc: W4, p: V3, pts: V3[], bones: number[], R: number[], scale = 1) {
  let carry = scale
  for (let k = 0; k < bones.length; k++) {
    const f = k < bones.length - 1 ? jointF(p, pts[k], pts[k + 1], pts[k + 2], R[k]) : 0
    acc.add(bones[k], carry * (1 - f))
    carry *= f
    if (carry < 1e-4) break
  }
}
export const segDist = (p: V3, a: V3, b: V3) => { const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / dot(ab, ab), 0, 1); return lenv(sub(p, add(a, scl(ab, t)))) }
export const segParam = (p: V3, a: V3, b: V3) => { const ab = sub(b, a); return dot(sub(p, a), ab) / dot(ab, ab) }
