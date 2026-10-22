// 迷彩爬行者（Entity 31）重制——第 2 阶段：骨骼动画库（只做动画，不接 AI）。
// 驱动 camoCrawlerMesh 的刚性关节组（userData.camoRig）。每个片段是 t（秒）→ 姿态的纯函数：不读也不改网格当前姿态，
// 只读骨架的静止数据（关节位置、手脚几何的触地高度），所以可以任意时刻采样、两两混合。
//
// 片段（模型正面 +X，地面 y=0）：
//   idle_camo  背贴岩壁、四臂张开的伪装静止，只有极轻的呼吸；uCamo=0.95
//   reveal     听到声音后现身（1.2s）：伪装褪去、身体从岩壁上展开站起，头猛地歪向声源
//   listen     歪头听声（循环）：头左右小幅转动，颚须抖动
//   walk       佝偻双足行走，下臂对角撑地（循环，脚/手解析 IK 锁地，根位移 = CAMO_WALK_SPEED）
//   run        四肢着地冲刺：双腿 + 下臂奔跳步态，上臂收在胸前（循环，根位移 = CAMO_RUN_SPEED）
//   call       群体互援的召唤：挺身仰头、张颚嘶鸣、胸腔鼓动（2.0s）
//   lift       上臂从地上抓起巨石举过头顶（1.0s；CAMO_LIFT_GRAB_T 时手合上巨石）
//   slam       举石砸地（0.8s；CAMO_SLAM_IMPACT_T=0.45s 触地，触地点 CAMO_SLAM_IMPACT_POINT）
//   distracted 被投掷物引开：转身朝向一点，低头嗅探、下臂轮流拨弄（循环）
//   hit        受击后仰（0.55s）
//   death      膝盖一软、侧倒、蜷缩（1.8s）
//
// API：
//   sampleCamo(grp, clip, t, opts) → CamoPose     采样（纯函数）
//   applyCamoPose(grp, pose, boulder?)            写回关节、uCamo、胸腔鼓动；给了巨石就把它放到 pose.boulder
//   poseCamo(grp, clip, t, opts, boulder?)        = 采样 + 写回
//   mixCamoPose(a, b, w)                          两个姿态混合（四元数 slerp、位移 lerp）
//   camoBoulderAttach(grp, pose, out)             巨石附着点（两只上手握点的中点，模型空间）
//   CAMO_CLIPS                                    片段表（时长、是否循环、根位移速度）
import * as THREE from 'three'
import type { CamoRig } from './camoCrawlerMesh'

type V3 = THREE.Vector3
type Quat = THREE.Quaternion
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const smooth = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const bell = (t: number, c: number, w: number) => Math.exp(-(((t - c) / w) ** 2))

export type CamoClip = 'idle_camo' | 'reveal' | 'listen' | 'walk' | 'run' | 'call' | 'lift' | 'slam' | 'distracted' | 'hit' | 'death'
export interface CamoClipInfo { len: number; loop: boolean; /** 根位移速度（m/s，沿模型 +X）；机制阶段按它移动实体，脚才不会打滑 */ speed?: number }

// ---------- 步态参数（步幅与根位移对齐：支撑相内脚在模型空间里后移一个步幅，正好抵消根前进） ----------
const WALK = { cycle: 1.2, duty: 0.62, stride: 0.42, lift: 0.12, handLift: 0.1 }
const RUN = { cycle: 0.6, duty: 0.4, stride: 0.84, lift: 0.17, handLift: 0.15 }
export const CAMO_WALK_SPEED = WALK.stride / (WALK.duty * WALK.cycle)
export const CAMO_RUN_SPEED = RUN.stride / (RUN.duty * RUN.cycle)

export const CAMO_CLIPS: Record<CamoClip, CamoClipInfo> = {
  idle_camo: { len: 4, loop: true },
  reveal: { len: 1.2, loop: false },
  listen: { len: 2.4, loop: true },
  walk: { len: WALK.cycle, loop: true, speed: CAMO_WALK_SPEED },
  run: { len: RUN.cycle, loop: true, speed: CAMO_RUN_SPEED },
  call: { len: 2.0, loop: false },
  lift: { len: 1.0, loop: false },
  slam: { len: 0.8, loop: false },
  distracted: { len: 2.4, loop: true },
  hit: { len: 0.55, loop: false },
  death: { len: 1.8, loop: false },
}

// ---------- 机制阶段要用的常量 ----------
/** 伪装静止时的 uCamo */
export const CAMO_IDLE_LEVEL = 0.95
/** idle_camo / reveal 假设背后岩壁所在的平面 x（模型空间，墙面法线朝 +X）。机制阶段把实体放在离墙这么远处 */
export const CAMO_CLING_WALL_X = -0.34
/** 巨石默认半尺寸（与 buildCamoBoulder(seed, 0.32) 的包围盒相当）；实际巨石不同可经 opts.boulderHalf 传入 */
export const CAMO_BOULDER_HALF = { y: 0.27, z: 0.3 }
/** lift：巨石起始位置（地上，模型空间中心；y 取巨石半高） */
export const CAMO_LIFT_BOULDER_GROUND = V(0.86, CAMO_BOULDER_HALF.y, 0)
/** lift：两只上手合上巨石的时刻（之前巨石在地上，之后挂在手上） */
export const CAMO_LIFT_GRAB_T = 0.36
/** lift：巨石到达头顶的时刻（之后保持举起，可直接接 slam） */
export const CAMO_LIFT_UP_T = 0.86
/** 举过头顶时的巨石中心（模型空间）；lift 的终点 = slam 的起点 */
export const CAMO_BOULDER_OVERHEAD = V(0.16, 2.02, 0)
/** slam：巨石触地时刻（秒）。机制阶段在这一刻生成范围震伤 */
export const CAMO_SLAM_IMPACT_T = 0.45
/** slam：巨石中心在触地时的位置（模型空间，y = 巨石半高） */
export const CAMO_SLAM_BOULDER_IMPACT = V(0.92, CAMO_BOULDER_HALF.y, 0)
/** slam：震源（巨石底部的触地点，模型空间，地面 y=0） */
export const CAMO_SLAM_IMPACT_POINT = V(0.92, 0, 0)
/**
 * 巨石附着点：上臂两只手各有一个握点（rig.grips[0/1]，挂在手掌组下）。巨石中心 = 两握点中点。
 * lift 在 [GRAB_T, len]、slam 在 [0, IMPACT_T] 期间巨石挂在手上；之外巨石在地上（pose.boulder.held=false）。
 */
export const CAMO_BOULDER_ATTACH = { grips: [0, 1] as const, rule: 'midpoint' as const }

/** 姿态：关节表里每个节点的局部旋转 + 相对静止位置的位移，外加伪装度、胸腔鼓动量、巨石状态 */
export interface CamoPose {
  q: Quat[]; dp: V3[]
  /** uCamo 0–1 */
  camo: number
  /** 胸腔鼓动（0 正常，0.05 ≈ 胸廓横向鼓起 5%） */
  breath: number
  /** 巨石：模型空间中心 + 是否挂在手上；不涉及巨石的片段为 null */
  boulder: { pos: V3; held: boolean } | null
  /** 调试：本帧 IK 最大伸展比（>1 说明够不着，被夹到 0.9995） */
  stretch: number
}
export interface CamoAnimOpts {
  /** 个体相位偏移（秒；群体不同步） */
  phase?: number
  /** 声源方位（弧度，绕 Y；正值 = 模型左侧 -Z→ 实际为绕 +Y 逆时针），reveal/listen 头会歪向它。默认 0.6 */
  soundYaw?: number
  /** distracted：投掷物落点（模型空间，地面点），默认 (0.62, 0, 0.42) */
  target?: V3
  /** idle_camo 的伪装度（默认 CAMO_IDLE_LEVEL） */
  camo?: number
  /** 实际巨石的半尺寸（默认 CAMO_BOULDER_HALF） */
  boulderHalf?: { y: number; z: number }
}

// ---------------------------------------------------------------------------
// 静止数据：关节表（按父子顺序），每条肢体的长度/静止弯曲面，手脚触地高度
// ---------------------------------------------------------------------------
interface RestNode { name: string; obj: THREE.Object3D; parent: number; pos: V3; quat: Quat }
interface LimbRest {
  j: [number, number, number]; parent: number; side: number; upper: boolean
  a: number; b: number
  /** 静止时第一段方向、弯曲面法线、肘/膝偏离方向（都在肢根父空间） */
  a0: V3; n0: V3; pole: V3
}
interface Rest {
  nodes: RestNode[]; idx: Record<string, number>
  arms: LimbRest[]; legs: LimbRest[]
  /** 脚平放时，踝关节离地高度 */
  footDrop: number
  /** 手掌心朝下、手指朝前时，腕关节离地高度（每条手臂） */
  handDrop: number[]
  /** 腕空间里：掌心法线、手指方向；上臂另有握点偏移 */
  palm: V3[]; finger: V3[]; gripOff: (V3 | null)[]
  /** 静止时两踝的模型空间位置 */
  ankle0: V3[]
  torso: THREE.Object3D | null
}
const PELVIS = V(0, 0.9, 0)
const REST = new WeakMap<CamoRig, Rest>()
function rigOf(grp: THREE.Object3D): CamoRig { const r = grp.userData.camoRig as CamoRig | undefined; if (!r) throw Error('not a camo crawler mesh'); return r }

function restOf(rig: CamoRig): Rest {
  const hit = REST.get(rig); if (hit) return hit
  const nodes: RestNode[] = [], idx: Record<string, number> = {}, byObj = new Map<THREE.Object3D, number>()
  const add = (name: string, obj: THREE.Object3D, posed: boolean) => {
    const parent = obj.parent && byObj.has(obj.parent) ? byObj.get(obj.parent)! : -1
    const pos = name === 'root' ? PELVIS.clone() : obj.position.clone()
    nodes.push({ name, obj, parent, pos, quat: posed ? new THREE.Quaternion() : obj.quaternion.clone() })
    idx[name] = nodes.length - 1; byObj.set(obj, nodes.length - 1)
  }
  add('root', rig.root, true); add('waist', rig.waist, true)
  const chest = rig.chest, hips = rig.legs[0].j[0].parent!
  add('chest', chest, false); add('hips', hips, false)
  add('head', rig.head, true)
  rig.mand.forEach((m, i) => add('mand' + i, m, true)); rig.palps.forEach((p, i) => add('palp' + i, p, true))
  const arms: LimbRest[] = [], legs: LimbRest[] = []
  const palm: V3[] = [], finger: V3[] = [], gripOff: (V3 | null)[] = [], handDrop: number[] = []
  let gi = 0
  rig.arms.forEach((A, i) => {
    A.j.forEach((j, k) => add(`a${i}_${k}`, j, true))
    const hw = A.j[2].children.find((c) => (c as THREE.Group).isGroup) as THREE.Group
    add(`hw${i}`, hw, false)
    const hq = hw.quaternion
    palm.push(V(0, -1, 0).applyQuaternion(hq)); finger.push(V(1, 0, 0).applyQuaternion(hq))
    // 手掌心朝下：腕的世界旋转 = hq⁻¹，此时手几何的最低点
    let minY = Infinity
    for (const c of hw.children) { const m = c as THREE.Mesh; if (!m.isMesh) continue; m.geometry.computeBoundingBox(); minY = Math.min(minY, m.geometry.boundingBox!.min.y) }
    const off = hw.position.clone().applyQuaternion(hq.clone().invert())
    handDrop.push(-(minY + off.y))
    if (A.upper) {
      const g = rig.grips[gi++]; add(`grip${gi - 1}`, g, false)
      gripOff.push(hw.position.clone().add(g.position.clone().applyQuaternion(hq)))
    } else gripOff.push(null)
    arms.push(limbRest(nodes, idx, `a${i}`, A.side, A.upper))
  })
  let footDrop = 0
  rig.legs.forEach((G, i) => {
    G.j.forEach((j, k) => add(`g${i}_${k}`, j, true))
    legs.push(limbRest(nodes, idx, `g${i}`, G.side, false))
    let minY = Infinity
    for (const c of G.j[2].children) { const m = c as THREE.Mesh; if (!m.isMesh) continue; m.geometry.computeBoundingBox(); minY = Math.min(minY, m.geometry.boundingBox!.min.y) }
    footDrop = Math.max(footDrop, -minY)
  })
  const torso = chest.children.find((c) => (c as THREE.Mesh).isMesh) ?? null
  const R: Rest = { nodes, idx, arms, legs, footDrop, handDrop, palm, finger, gripOff, ankle0: [], torso }
  const P0 = new Poser(R)
  R.ankle0 = legs.map((L) => fkPos(R, P0, L.j[2]))
  REST.set(rig, R)
  return R
}
function limbRest(nodes: RestNode[], idx: Record<string, number>, pre: string, side: number, upper: boolean): LimbRest {
  const j: [number, number, number] = [idx[pre + '_0'], idx[pre + '_1'], idx[pre + '_2']]
  const A = nodes[j[1]].pos, B = nodes[j[2]].pos
  const dn = A.clone().add(B).normalize()
  const pole = A.clone().addScaledVector(dn, -A.dot(dn)).normalize()
  return { j, parent: nodes[j[0]].parent, side, upper, a: A.length(), b: B.length(), a0: A.clone().normalize(), n0: pole.clone().cross(dn).normalize(), pole }
}

/** 姿态写入器 */
class Poser {
  q: Quat[]; dp: V3[]; camo = 0; breath = 0; boulder: CamoPose['boulder'] = null; stretch = 0
  R: Rest
  constructor(R: Rest) { this.R = R; this.q = R.nodes.map((n) => n.quat.clone()); this.dp = R.nodes.map(() => V(0, 0, 0)) }
  eul(name: string, x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ') { const i = this.R.idx[name]; this.q[i].setFromEuler(_e.set(x, y, z, order)) }
  pose(): CamoPose { return { q: this.q, dp: this.dp, camo: this.camo, breath: this.breath, boulder: this.boulder, stretch: this.stretch } }
}
const _e = new THREE.Euler(), ONE = V(1, 1, 1)

// ---------- 正向运动学（模型空间） ----------
function fk(R: Rest, P: Poser, i: number): THREE.Matrix4 {
  const n = R.nodes[i]
  const m = new THREE.Matrix4().compose(n.pos.clone().add(P.dp[i]), P.q[i], ONE)
  return n.parent >= 0 ? m.premultiply(fk(R, P, n.parent)) : m
}
const fkPos = (R: Rest, P: Poser, i: number) => V(0, 0, 0).setFromMatrixPosition(fk(R, P, i))
const fkQuat = (R: Rest, P: Poser, i: number) => new THREE.Quaternion().setFromRotationMatrix(fk(R, P, i))

/** 把局部正交基 (a0, n0) 转到 (a1, n1) 的旋转 */
function basisQ(a0: V3, n0: V3, a1: V3, n1: V3) {
  const m0 = new THREE.Matrix4().makeBasis(a0, n0, a0.clone().cross(n0))
  const m1 = new THREE.Matrix4().makeBasis(a1, n1, a1.clone().cross(n1))
  return new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.transpose()))
}
/** 局部两个方向 (la, lb) 对到世界方向 (wa, wb)（wb 只取与 wa 正交的分量） */
function rotFrom2(la: V3, lb: V3, wa: V3, wb: V3) {
  const a0 = la.clone().normalize(), n0 = lb.clone().addScaledVector(a0, -lb.dot(a0)).normalize()
  const a1 = wa.clone().normalize(), n1 = wb.clone().addScaledVector(a1, -wb.dot(a1)).normalize()
  return basisQ(a0, n0, a1, n1)
}

/**
 * 两段式解析 IK：把肢体末端关节（腕/踝）送到 target（模型空间）。
 * pole 为模型空间的肘/膝朝向（缺省用静止时的弯曲方向，跟随躯干转动）；endRot 为末端关节的模型空间旋转（脚掌/手掌朝向）。
 * 第一段的扭转由「静止弯曲面 → 目标弯曲面」决定，所以肢体不会自己拧麻花。
 */
function ik(R: Rest, P: Poser, L: LimbRest, target: V3, endRot?: Quat | null, pole?: V3 | null) {
  const Mp = fk(R, P, L.parent), inv = Mp.clone().invert()
  const S = R.nodes[L.j[0]].pos, B = R.nodes[L.j[2]].pos
  const t = target.clone().applyMatrix4(inv)
  const d = t.clone().sub(S), len = d.length()
  P.stretch = Math.max(P.stretch, len / (L.a + L.b))
  const lc = THREE.MathUtils.clamp(len, Math.abs(L.a - L.b) + 1e-4, (L.a + L.b) * 0.9995)
  const dn = len > 1e-6 ? d.multiplyScalar(1 / len) : V(0, -1, 0)
  const p = pole ? pole.clone().transformDirection(inv) : L.pole.clone()
  p.addScaledVector(dn, -p.dot(dn))
  if (p.lengthSq() < 1e-6) p.copy(L.pole).addScaledVector(dn, -L.pole.dot(dn))
  p.normalize()
  const along = (L.a * L.a - L.b * L.b + lc * lc) / (2 * lc), h = Math.sqrt(Math.max(0, L.a * L.a - along * along))
  const K = S.clone().addScaledVector(dn, along).addScaledVector(p, h)
  const E = S.clone().addScaledVector(dn, lc)
  const q0 = basisQ(L.a0, L.n0, K.clone().sub(S).normalize(), p.clone().cross(dn).normalize())
  const v = E.clone().sub(K).applyQuaternion(q0.clone().invert()).normalize()
  const q1 = new THREE.Quaternion().setFromUnitVectors(B.clone().normalize(), v)
  P.q[L.j[0]].copy(q0); P.q[L.j[1]].copy(q1)
  if (endRot) {
    const qw = new THREE.Quaternion().setFromRotationMatrix(Mp).multiply(q0).multiply(q1)
    P.q[L.j[2]].copy(qw.invert().multiply(endRot))
  }
}
/** 把当前肢体姿态读成 IK 形式（末端位置、末端旋转、肘/膝朝向），用于跨 FK/IK 的混合 */
interface LimbIK { end: V3; rot: Quat; pole: V3 }
function extract(R: Rest, P: Poser, L: LimbRest): LimbIK {
  const S = fkPos(R, P, L.j[0]), K = fkPos(R, P, L.j[1]), E = fkPos(R, P, L.j[2])
  const dn = E.clone().sub(S).normalize(), k = K.clone().sub(S)
  const pole = k.addScaledVector(dn, -k.dot(dn))
  return { end: E, rot: fkQuat(R, P, L.j[2]), pole: pole.lengthSq() > 1e-8 ? pole.normalize() : V(0, 1, 0) }
}
function mixIK(a: LimbIK, b: LimbIK, w: number): LimbIK {
  return { end: a.end.clone().lerp(b.end, w), rot: a.rot.clone().slerp(b.rot, w), pole: a.pole.clone().lerp(b.pole, w).normalize() }
}
const ikFrom = (R: Rest, P: Poser, L: LimbRest, s: LimbIK) => ik(R, P, L, s.end, s.rot, s.pole)

// ---------------------------------------------------------------------------
// 躯干 / 头 / 颚
// ---------------------------------------------------------------------------
interface Body {
  x?: number; y?: number; z?: number; yaw?: number; pitch?: number; roll?: number
  wPitch?: number; wYaw?: number; wRoll?: number
  hYaw?: number; hPitch?: number; hRoll?: number
  mand?: number; palp?: number
}
function body(P: Poser, b: Body) {
  const i = P.R.idx
  P.dp[i.root].set(b.x ?? 0, b.y ?? 0, b.z ?? 0)
  P.eul('root', b.roll ?? 0, b.yaw ?? 0, b.pitch ?? 0, 'YZX')
  P.eul('waist', b.wRoll ?? 0, b.wYaw ?? 0, b.wPitch ?? 0, 'YZX')
  P.eul('head', b.hRoll ?? 0, b.hYaw ?? 0, b.hPitch ?? 0, 'YZX')
  const mo = b.mand ?? 0, pj = b.palp ?? 0
  for (let k = 0; k < 2; k++) {
    const s = k === 0 ? -1 : 1
    P.eul('mand' + k, 0, s * (-0.05 + mo * 0.62), -mo * 0.12)
    P.eul('palp' + k, s * (mo * 0.4 + pj * 0.5), 0, mo * 0.3 + pj * (k ? 0.8 : -0.6))
  }
}

// ---------- 肢体小工具 ----------
/** 绕 Y 的朝向四元数 */
const yawQ = (yaw: number, pitch = 0, roll = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YZX'))
const rotY = (v: V3, yaw: number) => v.clone().applyAxisAngle(V(0, 1, 0), yaw)
/** 一只脚踩在 pos（踝点位置，y 用触地高度；lift>0 时抬起），脚掌朝 yaw，pitch 为脚尖下压 */
function foot(R: Rest, P: Poser, gi: number, x: number, z: number, lift = 0, yaw = 0, pitch = 0, pole?: V3) {
  const pos = V(x, R.footDrop + lift, z)
  ik(R, P, R.legs[gi], pos, yawQ(yaw, pitch), pole ?? rotY(V(1, 0, R.legs[gi].side * 0.12), yaw))
}
/** 站姿时的落脚点（静止踝点，脚平放） */
function standFeet(R: Rest, P: Poser, yaw = 0, spread = 0) {
  R.legs.forEach((L, gi) => { const a = rotY(V(R.ankle0[gi].x, 0, R.ankle0[gi].z + L.side * spread), yaw); foot(R, P, gi, a.x, a.z, 0, yaw) })
}
/** 手腕旋转：手指朝 F、掌心朝 Pm（模型空间） */
const handRot = (R: Rest, ai: number, F: V3, Pm: V3) => rotFrom2(R.finger[ai], R.palm[ai], F, Pm)
/** 一只下手撑地：腕点 (x,z)，掌心朝下、手指朝 yaw 方向（略外撇）；lift 抬起，curl 抬起时手指下垂 */
function handPlant(R: Rest, P: Poser, ai: number, x: number, z: number, lift = 0, yaw = 0, curl = 0, pole?: V3) {
  const s = R.arms[ai].side
  const F = rotY(V(Math.cos(curl), -Math.sin(curl), s * 0.25), yaw)
  const rot = handRot(R, ai, F, V(Math.sin(curl) * 0.3, -1, 0))
  ik(R, P, R.arms[ai], V(x, R.handDrop[ai] + 0.004 + lift, z), rot, pole ?? rotY(V(-0.6, 0.5, s * 0.6), yaw))
}
/** 正向设置一条手臂/腿（欧拉角，单位弧度；x 已按侧别镜像的由调用方处理） */
function fkLimb(P: Poser, L: LimbRest, e: [number, number, number][]) { L.j.forEach((j, k) => P.q[j].setFromEuler(_e.set(e[k][0], e[k][1], e[k][2]))) }
/** 上手握住巨石的一侧：握点 = 巨石中心 ± z·半宽；手指方向 F，掌心朝巨石中心 */
function gripBoulder(R: Rest, P: Poser, ai: number, c: V3, half: { y: number; z: number }, F: V3, pole: V3) {
  const s = R.arms[ai].side
  const grip = c.clone().add(V(0, 0, s * half.z * 0.9))
  const rot = handRot(R, ai, F, V(0, 0, -s))
  const wrist = grip.clone().sub(R.gripOff[ai]!.clone().applyQuaternion(rot))
  ik(R, P, R.arms[ai], wrist, rot, pole)
}

// 步态：phase∈[0,1)，支撑相内脚从 +stride/2 匀速退到 -stride/2；摆动相平滑前移并抬起
function gait(ph: number, duty: number, stride: number, lift: number) {
  const p = ((ph % 1) + 1) % 1
  if (p < duty) return { dx: stride * (0.5 - p / duty), up: 0, sw: 0 }
  const k = (p - duty) / (1 - duty), e = k * k * (3 - 2 * k)
  return { dx: stride * (-0.5 + e), up: lift * Math.sin(Math.PI * k) ** 0.8, sw: Math.sin(Math.PI * k) }
}

// ---------------------------------------------------------------------------
// 片段
// ---------------------------------------------------------------------------
type ClipFn = (R: Rest, P: Poser, t: number, o: CamoAnimOpts) => void
const arms = (R: Rest, upper: boolean) => R.arms.map((L, i) => ({ L, i })).filter((a) => a.L.upper === upper)

/** 背贴岩壁的伪装姿势（idle_camo 与 reveal 起点共用） */
const cling: ClipFn = (R, P, t) => {
  const WX = CAMO_CLING_WALL_X, br = Math.sin(t / 4 * TAU)
  body(P, { x: -0.07, y: -0.02 + br * 0.002, pitch: 0.2, wPitch: 0.34 + br * 0.006, hPitch: -0.3, mand: 0.02 })
  P.breath = 0.006 + br * 0.006
  for (const { L, i } of arms(R, true)) ik(R, P, L, V(WX + 0.07, 1.72, L.side * 0.74), handRot(R, i, V(0, 0.75, L.side * 0.65), V(-1, 0, 0)), V(0.15, -1, 0))
  for (const { L, i } of arms(R, false)) ik(R, P, L, V(WX + 0.07, 0.9, L.side * 0.8), handRot(R, i, V(0.1, -0.65, L.side * 0.75), V(-1, 0, 0)), V(0.1, 0.7, L.side * 0.4))
  R.legs.forEach((L, gi) => foot(R, P, gi, -0.06, L.side * 0.3, 0, L.side * -0.35, 0, V(1, 0, L.side * 0.9)))
}
const idleCamo: ClipFn = (R, P, t, o) => { cling(R, P, t, o); P.camo = o.camo ?? CAMO_IDLE_LEVEL }

const listen: ClipFn = (R, P, t, o) => {
  const sy = o.soundYaw ?? 0.6, ph = t / 2.4 * TAU
  const twitch = Math.max(0, Math.sin(ph * 3 + 1)) ** 8 // 偶发的一下急转
  body(P, {
    y: -0.02, pitch: 0.02, wPitch: 0.1 + Math.sin(ph) * 0.012, wYaw: sy * 0.22,
    hYaw: sy * 0.6 + Math.sin(ph) * 0.22 + twitch * 0.08, hRoll: 0.34 + Math.sin(ph * 2) * 0.06, hPitch: 0.06 + Math.sin(ph * 2 + 0.5) * 0.03,
    mand: 0.16 + Math.sin(ph * 5) * 0.05, palp: Math.sin(t * TAU * 11) * (0.25 + 0.15 * Math.sin(ph * 2)),
  })
  P.breath = 0.012 + 0.012 * Math.sin(ph * 2)
  for (const { L } of arms(R, true)) fkLimb(P, L, [[-L.side * 0.06, 0, 0.14 + Math.sin(ph + L.side) * 0.02], [0, 0, 0.28], [0, 0, 0.12]])
  for (const { L } of arms(R, false)) fkLimb(P, L, [[-L.side * 0.05, 0, 0.1], [0, 0, 0.08], [0, 0, 0.05]])
  standFeet(R, P)
}

const reveal: ClipFn = (R, P, t, o) => {
  const sy = o.soundYaw ?? 0.6
  const A = new Poser(R), B = new Poser(R)
  cling(R, A, 0, o); listen(R, B, Math.max(0, t - 0.6), o)
  const k = smooth(0.12, 1.05, t) // 身体展开
  // 躯干与颚：两端 slerp；头部单独做「猛地歪向声源」
  for (const n of ['root', 'waist', 'mand0', 'mand1', 'palp0', 'palp1']) { const i = R.idx[n]; P.q[i].copy(A.q[i]).slerp(B.q[i], k); P.dp[i].copy(A.dp[i]).lerp(B.dp[i], k) }
  // 头：0.18s 起 0.12s 内甩向声源并略过冲，再回落到 listen 的歪头
  const snap = smooth(0.18, 0.3, t), over = bell(t, 0.36, 0.08) * 0.18
  const hq = yawQ(sy * 0.6 * snap + sy * over, -0.3 * (1 - k) + 0.06 * k, (0.34 + over) * snap)
  P.q[R.idx.head].copy(hq).slerp(B.q[R.idx.head], smooth(0.75, 1.2, t))
  // 四肢：IK 形式混合；手离墙时略向外弧出，脚分两拍收回（抬起一点，不在地上滑）
  R.arms.forEach((L) => {
    const w = smooth(0.15 + (L.upper ? 0 : 0.1), 0.95 + (L.upper ? 0 : 0.1), t)
    const m = mixIK(extract(R, A, L), extract(R, B, L), w)
    m.end.x += Math.sin(Math.PI * w) * 0.12
    ikFrom(R, P, L, m)
  })
  R.legs.forEach((L, gi) => {
    const s0 = gi === 0 ? 0.3 : 0.55, w = smooth(s0, s0 + 0.3, t)
    const a = extract(R, A, L), b = extract(R, B, L), m = mixIK(a, b, w)
    m.end.y = R.footDrop + Math.sin(Math.PI * w) * 0.07
    m.rot.copy(yawQ(lerp(L.side * -0.35, 0, w)))
    ikFrom(R, P, L, m)
  })
  P.camo = CAMO_IDLE_LEVEL * (1 - smooth(0.08, 0.9, t))
  P.breath = lerp(A.breath, B.breath, k) + bell(t, 0.3, 0.1) * 0.03 // 受惊时吸一口气
}

const walk: ClipFn = (R, P, t, o) => {
  const ph = (t + (o.phase ?? 0)) / WALK.cycle, c = ph * TAU
  body(P, {
    y: -0.17 - 0.018 * Math.cos(c * 2), pitch: -0.22, wPitch: -0.3 + 0.02 * Math.cos(c * 2), roll: 0.035 * Math.sin(c), wYaw: 0.05 * Math.sin(c),
    hPitch: 0.5, hYaw: -0.06 * Math.sin(c), hRoll: 0.04, mand: 0.08,
  })
  P.breath = 0.01
  R.legs.forEach((L, gi) => {
    const g = gait(ph + (L.side > 0 ? 0.5 : 0), WALK.duty, WALK.stride, WALK.lift)
    foot(R, P, gi, 0.04 + g.dx, L.side * 0.19, g.up, 0, -0.15 * g.sw)
  })
  // 下臂对角撑地：右手与左腿同相（略滞后），掌心朝下
  for (const { L, i } of arms(R, false)) {
    const g = gait(ph + (L.side > 0 ? 0 : 0.5) + 0.06, WALK.duty, WALK.stride, WALK.handLift)
    handPlant(R, P, i, 0.46 + g.dx, L.side * 0.31, g.up, 0, 0.25 * g.sw)
  }
  for (const { L } of arms(R, true)) {
    const sw = Math.sin(c + (L.side > 0 ? 0 : Math.PI))
    fkLimb(P, L, [[-L.side * 0.12, 0, 0.5 + 0.16 * sw], [0, 0, 0.55 - 0.1 * sw], [0, 0, 0.25]])
  }
}

const run: ClipFn = (R, P, t, o) => {
  const ph = (t + (o.phase ?? 0)) / RUN.cycle, c = ph * TAU
  // 奔跳：后腿蹬地后身体腾空，前肢落地；脊柱随步伐屈伸
  body(P, {
    y: -0.3 - 0.035 * Math.cos(c * 2 - 0.6), pitch: -0.74 + 0.05 * Math.sin(c), wPitch: -0.2 + 0.12 * Math.sin(c + 0.4), roll: 0.03 * Math.sin(c),
    hPitch: 1.0 - 0.08 * Math.sin(c + 0.4), mand: 0.3 + 0.1 * Math.sin(c * 2),
  })
  P.breath = 0.02 + 0.015 * Math.sin(c * 2)
  R.legs.forEach((L, gi) => {
    const g = gait(ph + (L.side > 0 ? 0.1 : 0), RUN.duty, RUN.stride, RUN.lift)
    foot(R, P, gi, -0.14 + g.dx, L.side * 0.17, g.up, 0, -0.25 * g.sw)
  })
  for (const { L, i } of arms(R, false)) {
    const g = gait(ph + 0.5 + (L.side > 0 ? 0.1 : 0), RUN.duty, RUN.stride, RUN.handLift)
    handPlant(R, P, i, 0.56 + g.dx, L.side * 0.28, g.up, 0, 0.45 * g.sw, V(-0.9, 0.3, L.side * 0.4))
  }
  // 上臂收在胸前（胸腔坐标里定目标），随步伐轻摆
  const Mc = fk(R, P, R.idx.chest)
  for (const { L, i } of arms(R, true)) {
    const tgt = V(0.42 + 0.03 * Math.sin(c), 1.0, L.side * 0.2).applyMatrix4(Mc)
    const pole = V(-1, 0.3, L.side * 0.7).transformDirection(Mc)
    const F = V(0.4, 0.6, -L.side * 0.4).transformDirection(Mc), Pm = V(0.3, 0, -L.side).transformDirection(Mc)
    ik(R, P, L, tgt, handRot(R, i, F, Pm), pole)
  }
}

const call: ClipFn = (R, P, t) => {
  const k = smooth(0, 0.35, t) * (1 - smooth(1.6, 2.0, t))
  const pulse = Math.max(0, Math.sin(t * TAU * 2.2)) ** 2 // 胸腔鼓动 ≈ 2.2 次/秒
  const tr = Math.sin(t * TAU * 9) // 嘶鸣时的高频震颤
  body(P, {
    y: 0.02 * k, pitch: 0.05 * k, wPitch: 0.1 + 0.26 * k - 0.04 * pulse * k,
    hPitch: 0.06 + 0.55 * k + 0.03 * tr * k, hRoll: 0.08 * k, hYaw: 0.12 * Math.sin(t * 2.4) * k,
    mand: 0.16 + k * (0.84 + 0.12 * tr), palp: k * 0.45 * Math.sin(t * TAU * 13),
  })
  P.breath = 0.012 + k * (0.025 + 0.05 * pulse)
  for (const { L } of arms(R, true)) fkLimb(P, L, [[-L.side * 0.85 * k, 0, 0.14 - 0.05 * k], [0, 0, 0.28 + 0.65 * k], [0, 0, 0.12 + 0.3 * k * (0.7 + 0.3 * tr)]])
  for (const { L } of arms(R, false)) fkLimb(P, L, [[-L.side * 0.25 * k, 0, 0.1 + 0.2 * k], [0, 0, 0.08 + 0.45 * k], [0, 0, 0.05]])
  standFeet(R, P)
}

/** 站立时上臂/下臂自然下垂（lift/slam 起止时用来做 IK 混合的一端） */
function hangArms(R: Rest, P: Poser) {
  for (const { L } of arms(R, true)) fkLimb(P, L, [[-L.side * 0.06, 0, 0.14], [0, 0, 0.28], [0, 0, 0.12]])
  // 下臂屈肘前抬，护在胸腹前（下蹲时也离地）
  for (const { L } of arms(R, false)) fkLimb(P, L, [[-L.side * 0.12, 0, 0.25], [0, 0, 1.45], [0, 0, 0.3]])
}
const crouchBody = (c: number, up: number): Body => ({
  y: -0.28 * c + 0.01 * up, pitch: -0.3 * c + 0.03 * up, wPitch: 0.06 - 0.48 * c + 0.12 * up,
})

const lift: ClipFn = (R, P, t, o) => {
  const half = o.boulderHalf ?? CAMO_BOULDER_HALF, G = CAMO_LIFT_GRAB_T, U = CAMO_LIFT_UP_T
  const down = smooth(0, G, t), up = smooth(G + 0.02, G + 0.3, t), c = down * (1 - up)
  const k = smooth(G, U, t)
  const dodge = bell(k, 0.46, 0.17) // 巨石经过面前时上身后仰、头往后缩
  const cb = crouchBody(c, up)
  body(P, { ...cb, wPitch: (cb.wPitch ?? 0) + 0.3 * dodge * up + 0.12 * smooth(0, 0.3, k) * (1 - up), hPitch: 0.06 + 0.4 * c + 0.3 * up - 0.25 * dodge, mand: 0.16 + 0.5 * up, hYaw: 0 })
  P.breath = 0.015 + 0.03 * up
  standFeet(R, P, 0, 0.03 * c)
  // 巨石轨迹：先竖直离地贴着身前上提，再越过头顶
  const g0 = CAMO_LIFT_BOULDER_GROUND.clone(); g0.y = half.y
  // 先往外上方拉离身体（避免贴着胸口穿过），过了头顶高度再收回头顶
  const bc = t < G ? g0 : V(lerp(g0.x, 0.9, smooth(0, 0.3, k)), lerp(half.y, CAMO_BOULDER_OVERHEAD.y + 0.06, smooth(0.05, 0.7, k)), 0)
  if (t >= G) { const b2 = smooth(0.38, 0.9, k); bc.x = lerp(bc.x, CAMO_BOULDER_OVERHEAD.x, b2); bc.y -= 0.06 * b2 }
  P.boulder = { pos: bc, held: t >= G }
  // 手臂：先算自然下垂的 IK 形式，再混到「握石」
  hangArms(R, P)
  const hang = R.arms.map((L) => extract(R, P, L))
  const reach = smooth(0.04, G, t), turn = smooth(G, U, t)
  for (const { L, i } of arms(R, true)) {
    // 手指方向：抓石时朝下 → 举过头顶时朝上（中途朝前翻过去）
    const F = V(0.15 + 0.6 * Math.sin(Math.PI * turn), -Math.cos(Math.PI * turn), 0).normalize()
    const pole = V(-0.4, -0.2 + 0.6 * turn, L.side).normalize()
    if (reach < 1) {
      const T = new Poser(R); T.q = P.q.map((q) => q.clone()); T.dp = P.dp.map((d) => d.clone())
      gripBoulder(R, T, i, bc, half, F, pole)
      ikFrom(R, P, L, mixIK(hang[i], extract(R, T, L), reach))
    } else gripBoulder(R, P, i, bc, half, F, pole)
  }
  // 下臂：下蹲时撑在巨石两侧的地上，起身后离地收回
  const plant = smooth(0.1, G, t) * (1 - smooth(G + 0.06, G + 0.3, t))
  for (const { L, i } of arms(R, false)) {
    const T = new Poser(R); T.q = P.q.map((q) => q.clone()); T.dp = P.dp.map((d) => d.clone())
    handPlant(R, T, i, 0.5, L.side * 0.44, 0, L.side * -0.3)
    ikFrom(R, P, L, mixIK(hang[i], extract(R, T, L), plant))
  }
}

const slam: ClipFn = (R, P, t, o) => {
  const half = o.boulderHalf ?? CAMO_BOULDER_HALF, I = CAMO_SLAM_IMPACT_T
  const wind = smooth(0, 0.25, t), sw = clamp01((t - 0.25) / (I - 0.25)), e = sw * sw // 下砸加速
  const post = smooth(I, 0.8, t)
  const c = t < 0.25 ? 0 : t < I ? smooth(0, 1, sw) : 1 - 0.25 * post
  const back = 0.14 * wind * (1 - smooth(0, 1, sw)) // 起点与 lift 末帧一致
  const cb = crouchBody(c, 1 - c)
  body(P, {
    ...cb, y: (cb.y ?? 0) - 0.045 * bell(t, I + 0.06, 0.05) + 0.02 * wind * (1 - c), wPitch: (cb.wPitch ?? 0) + back,
    hPitch: 0.36 + 0.08 * wind - 0.05 * c, mand: 0.66 + 0.34 * bell(t, I, 0.1) - 0.2 * post,
  })
  P.breath = 0.04 + 0.03 * bell(t, I - 0.15, 0.1)
  standFeet(R, P, 0, 0.03 * c)
  // 巨石：头顶 → 后拉蓄力 → 二次贝塞尔弧线砸到身前地面；触地后留在原地
  const O = CAMO_BOULDER_OVERHEAD, W = V(-0.02, 2.16, 0), C = V(1.0, 2.2, 0), Ip = CAMO_SLAM_BOULDER_IMPACT.clone(); Ip.y = half.y
  let bc: V3
  if (t < 0.25) bc = O.clone().lerp(W, wind)
  else if (t < I) { const u = e, a = W.clone().multiplyScalar((1 - u) ** 2), b = C.clone().multiplyScalar(2 * u * (1 - u)); bc = a.add(b).addScaledVector(Ip, u * u) }
  else bc = Ip
  P.boulder = { pos: bc, held: t < I }
  const turn = t < 0.25 ? 0 : smooth(0, 1, sw)
  hangArms(R, P)
  const hang = R.arms.map((L) => extract(R, P, L))
  const rel = smooth(0.58, 0.8, t)
  for (const { L, i } of arms(R, true)) {
    const F = V(0.15 + 0.6 * Math.sin(Math.PI * turn), Math.cos(Math.PI * turn), 0).normalize() // 头顶朝上 → 触地朝下
    const pole = V(-0.4, 0.4 - 0.6 * turn, L.side).normalize()
    const T = new Poser(R); T.q = P.q.map((q) => q.clone()); T.dp = P.dp.map((d) => d.clone())
    gripBoulder(R, T, i, bc, half, F, pole)
    const g = extract(R, T, L)
    // 松手：手离开石面向外上方抬起一点，向下垂姿态过渡
    if (rel > 0) { g.end.add(V(-0.04, 0.14, L.side * 0.08).multiplyScalar(rel)); ikFrom(R, P, L, mixIK(g, hang[i], rel * 0.35)) }
    else ikFrom(R, P, L, g)
  }
  const plant = smooth(0.3, I, t)
  for (const { L, i } of arms(R, false)) {
    const T = new Poser(R); T.q = P.q.map((q) => q.clone()); T.dp = P.dp.map((d) => d.clone())
    handPlant(R, T, i, 0.52, L.side * 0.46, 0, L.side * -0.3)
    ikFrom(R, P, L, mixIK(hang[i], extract(R, T, L), plant))
  }
}

const distracted: ClipFn = (R, P, t, o) => {
  const tg = o.target ?? V(0.62, 0, 0.42)
  const yaw = Math.atan2(-tg.z, tg.x), fwd = rotY(V(1, 0, 0), yaw), side = rotY(V(0, 0, 1), yaw)
  const tt = t + (o.phase ?? 0), half = ((tt % 2.4) + 2.4) % 2.4, act = half < 1.2 ? 1 : -1, lt = half % 1.2
  const e = smooth(0.05, 0.35, lt) * (1 - smooth(0.85, 1.15, lt))
  const sniff = Math.sin(tt * TAU * 4.5) * (1 - e * 0.6)
  body(P, {
    yaw, y: -0.24, pitch: -0.3, wPitch: -0.44 + 0.03 * Math.sin(tt * 2.6), wYaw: 0.08 * act * e, wRoll: -0.04 * act * e,
    hPitch: -0.12 + 0.06 * sniff, hYaw: 0.1 * act * e + 0.05 * Math.sin(tt * 1.3), hRoll: 0.12 * Math.sin(tt * 0.8),
    mand: 0.12 + 0.06 * Math.max(0, sniff), palp: 0.3 * Math.sin(tt * TAU * 9),
  })
  P.breath = 0.01 + 0.008 * sniff
  standFeet(R, P, yaw, 0.02)
  // 一只下手撑地，另一只伸向落点用爪尖拨弄（左右来回划），每 1.2s 换手
  for (const { L, i } of arms(R, false)) {
    const base = tg.clone().addScaledVector(fwd, -0.45).addScaledVector(side, L.side * 0.34)
    const T = new Poser(R); T.q = P.q.map((q) => q.clone()); T.dp = P.dp.map((d) => d.clone())
    handPlant(R, T, i, base.x, base.z, 0, yaw)
    const planted = extract(R, T, L)
    if (L.side === act) {
      const strokeAmt = Math.sin(lt * TAU * 2.2) * 0.07 * smooth(0.3, 0.45, lt)
      const tip = tg.clone().addScaledVector(side, strokeAmt + L.side * 0.04).addScaledVector(fwd, -0.15)
      const U = new Poser(R); U.q = P.q.map((q) => q.clone()); U.dp = P.dp.map((d) => d.clone())
      handPlant(R, U, i, tip.x, tip.z, 0.072 + 0.03 * Math.abs(Math.sin(lt * TAU * 2.2)), yaw, 0.35)
      ikFrom(R, P, L, mixIK(planted, extract(R, U, L), e))
    } else ikFrom(R, P, L, planted)
  }
  for (const { L } of arms(R, true)) fkLimb(P, L, [[-L.side * 0.08, 0, 0.42], [0, 0, 0.6], [0, 0, 0.2]])
}

const hit: ClipFn = (R, P, t) => {
  const k = t < 0.07 ? smooth(0, 0.07, t) : 1 - smooth(0.07, 0.55, t)
  const sh = Math.sin(t * TAU * 6) * k * 0.3 // 余震抖动
  body(P, {
    x: -0.06 * k, y: -0.03 * k, pitch: 0.16 * k, wPitch: 0.06 + 0.2 * k, hPitch: 0.06 + 0.42 * k + 0.05 * sh, hRoll: -0.14 * k, hYaw: 0.1 * k,
    mand: 0.16 + 0.6 * k,
  })
  P.breath = 0.012 + 0.03 * k
  for (const { L } of arms(R, true)) fkLimb(P, L, [[-L.side * (0.06 + 0.4 * k), 0, 0.14 + 0.5 * k], [0, 0, 0.28 + 0.45 * k + 0.1 * sh], [0, 0, 0.12 + 0.3 * k]])
  for (const { L } of arms(R, false)) fkLimb(P, L, [[-L.side * (0.05 + 0.6 * k), 0, 0.1 + 0.3 * k], [0, 0, 0.08 + 0.4 * k], [0, 0, 0.05]])
  standFeet(R, P)
}

/** death 终态的根高度（侧躺时躯干最低点贴地；由 verify 的穿地检查标定） */
const DEATH_REST_Y = 0.46
const death: ClipFn = (R, P, t) => {
  const b = smooth(0, 0.4, t), f = smooth(0.32, 1.05, t), fall = f * f * (3 - 2 * f), cu = smooth(0.5, 1.5, t)
  const tw = t > 1.1 ? Math.sin(t * TAU * 7) * (1 - smooth(1.1, 1.7, t)) * 0.06 : 0 // 临死抽搐
  const y0 = -0.2 * b
  body(P, {
    x: -0.12 * fall, y: lerp(y0, DEATH_REST_Y - PELVIS.y, fall), roll: 1.42 * fall, pitch: -0.22 * b - 0.12 * fall,
    wPitch: -0.12 * b - 0.75 * cu, hPitch: -0.2 * b - 0.4 * cu + tw, hRoll: 0.2 * cu,
    mand: 0.16 + 0.8 * bell(t, 0.6, 0.25) + 0.15 * cu,
  })
  P.breath = 0.03 * bell(t, 0.5, 0.2)
  // 腿：先踩地屈膝（IK），倒下时转成蜷向胸口（FK）
  const T = new Poser(R); T.q = P.q.map((q) => q.clone()); T.dp = P.dp.map((d) => d.clone())
  standFeet(R, T, 0, 0.02 * b)
  const curlW = smooth(0.38, 1.25, t)
  R.legs.forEach((L) => {
    const U = new Poser(R); U.q = T.q.map((q) => q.clone()); U.dp = T.dp.map((d) => d.clone())
    fkLimb(U, L, [[L.side * 0.15, 0, 0.2 + 1.45 * cu], [0, 0, -0.5 - 1.75 * cu + tw], [0, 0, 0.3 + 0.4 * cu]])
    const m = mixIK(extract(R, T, L), extract(R, U, L), curlW)
    m.end.y = Math.max(m.end.y, R.footDrop) + 0.07 * Math.sin(Math.PI * curlW) // 收腿时先把脚抬离地面，脚尖不戳地
    ikFrom(R, P, L, m)
  })
  const fl = bell(t, 0.55, 0.2) // 倒下时手臂下意识张开
  const cuD = smooth(0.3, 0.85, t) // 贴地一侧的手臂要赶在身体落地前伸到前面
  // 侧倒后 +Z 一侧贴地：贴地的两臂顺着地面前伸垫在头下（绕 Y 内收，免得往地下戳），朝上的两臂抱胸
  for (const { L } of arms(R, true)) {
    if (L.side > 0) fkLimb(P, L, [[-L.side * 0.4 * fl * (1 - cuD), L.side * 0.75 * cuD, 0.14 + 0.6 * fl * (1 - cuD) + 1.3 * cuD], [0, 0, 0.28 + 0.2 * cuD + tw], [0, 0, 0.12]])
    else fkLimb(P, L, [[L.side * 0.5 * cu - L.side * 0.4 * fl, 0, 0.14 + 0.6 * fl + 1.0 * cu], [0, 0, 0.28 + 1.5 * cu + tw], [0, 0, 0.12 + 0.6 * cu]])
  }
  // 下臂：先撑地接住身体（IK），侧倒时收成抱胸
  const catchW = smooth(0.0, 0.2, t) * (1 - smooth(0.55, 1.2, t))
  for (const { L, i } of arms(R, false)) {
    const U = new Poser(R); U.q = P.q.map((q) => q.clone()); U.dp = P.dp.map((d) => d.clone())
    if (L.side > 0) fkLimb(U, L, [[-L.side * 0.3 * fl * (1 - cuD), L.side * 0.7 * cuD, 0.1 + 0.3 * fl * (1 - cuD) + 1.1 * cuD], [0, 0, 0.08 + 0.5 * cuD], [0, 0, 0.05]])
    else fkLimb(U, L, [[L.side * 0.55 * cu - L.side * 0.3 * fl, 0, 0.1 + 0.3 * fl + 0.85 * cu], [0, 0, 0.08 + 1.3 * cu], [0, 0, 0.05 + 0.5 * cu]])
    const curl = extract(R, U, L)
    if (catchW > 0) {
      const W = new Poser(R); W.q = P.q.map((q) => q.clone()); W.dp = P.dp.map((d) => d.clone())
      handPlant(R, W, i, 0.5, L.side * 0.36, 0, 0)
      ikFrom(R, P, L, mixIK(curl, extract(R, W, L), catchW))
    } else ikFrom(R, P, L, curl)
  }
}

const CLIP_FN: Record<CamoClip, ClipFn> = { idle_camo: idleCamo, reveal, listen, walk, run, call, lift, slam, distracted, hit, death }

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------
export function sampleCamo(grp: THREE.Object3D, clip: CamoClip, t: number, opts: CamoAnimOpts = {}): CamoPose {
  const R = restOf(rigOf(grp)), P = new Poser(R), info = CAMO_CLIPS[clip]
  const tt = info.loop ? ((t % info.len) + info.len) % info.len : THREE.MathUtils.clamp(t, 0, info.len)
  CLIP_FN[clip](R, P, tt, opts)
  return P.pose()
}
const _c = V(0.1, 1.15, 0)
export function applyCamoPose(grp: THREE.Object3D, pose: CamoPose, boulder?: THREE.Object3D | null) {
  const rig = rigOf(grp), R = restOf(rig)
  R.nodes.forEach((n, i) => { n.obj.quaternion.copy(pose.q[i]); n.obj.position.copy(n.pos).add(pose.dp[i]) })
  rig.camo.uCamo.value = clamp01(pose.camo)
  // 胸腔鼓动：只缩放躯干网格（绕胸腔中心），不影响挂在 chest 上的四臂与头
  if (R.torso) {
    const b = pose.breath, s = V(1 + b * 0.7, 1 + b * 0.12, 1 + b)
    R.torso.scale.copy(s); R.torso.position.copy(_c).sub(_c.clone().multiply(s))
  }
  if (boulder) {
    if (pose.boulder) { boulder.visible = true; boulder.position.copy(pose.boulder.pos); if (boulder.parent !== grp) grp.add(boulder) }
    else boulder.visible = false
  }
}
export function poseCamo(grp: THREE.Object3D, clip: CamoClip, t: number, opts: CamoAnimOpts = {}, boulder?: THREE.Object3D | null) {
  const p = sampleCamo(grp, clip, t, opts); applyCamoPose(grp, p, boulder); return p
}
export function mixCamoPose(a: CamoPose, b: CamoPose, w: number): CamoPose {
  const bo = a.boulder && b.boulder ? { pos: a.boulder.pos.clone().lerp(b.boulder.pos, w), held: w < 0.5 ? a.boulder.held : b.boulder.held } : (w < 0.5 ? a.boulder : b.boulder)
  return {
    q: a.q.map((q, i) => q.clone().slerp(b.q[i], w)), dp: a.dp.map((d, i) => d.clone().lerp(b.dp[i], w)),
    camo: lerp(a.camo, b.camo, w), breath: lerp(a.breath, b.breath, w), boulder: bo, stretch: Math.max(a.stretch, b.stretch),
  }
}
/** 巨石附着点（模型空间）：给定姿态下两只上手握点的中点 */
export function camoBoulderAttach(grp: THREE.Object3D, pose: CamoPose, out = V(0, 0, 0)) {
  const R = restOf(rigOf(grp)), P = new Poser(R); P.q = pose.q; P.dp = pose.dp
  return out.copy(fkPos(R, P, R.idx.grip0)).add(fkPos(R, P, R.idx.grip1)).multiplyScalar(0.5)
}
/** 某个关节在给定姿态下的模型空间位置（验收用：踝 g{0,1}_2、腕 a{0..3}_2、head、grip0/1 等） */
export function camoJointPos(grp: THREE.Object3D, pose: CamoPose, name: string, out = V(0, 0, 0)) {
  const R = restOf(rigOf(grp)), P = new Poser(R); P.q = pose.q; P.dp = pose.dp
  const i = R.idx[name]; if (i === undefined) return null
  return out.copy(fkPos(R, P, i))
}
/** 触地高度（验收用） */
export function camoContactInfo(grp: THREE.Object3D) { const R = restOf(rigOf(grp)); return { footDrop: R.footDrop, handDrop: R.handDrop.slice() } }
