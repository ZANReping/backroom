// [casino] Level 5.1 赌场员工 阶段 3：动画（片段表 + 程序关键帧 + IK + 弹簧链二级动画）。
//   范式沿用 jazzAnim / chefAnim / spokesAnim：staffPose(who, clip, t, opts) 是纯函数（弹簧链状态放在 opts.dyn），
//   返回每根骨的「世界增量旋转」W（静止姿态全是单位四元数，局部 q = W_parent⁻¹ · W），applyStaffPose 写回 THREE.Bone。
//   · 两节 IK（ik2）：肘 / 膝按极向量（静止弯曲方向；直臂 / 直腿用后 / 前回退）求，上下两节用「方向 + 极向」基映射，扭转不翻。
//   · 步态（stepFoot）：每只脚 / 腿尖在支撑期锚定在「身体在支撑期中点时刻」的落脚点，摆动期在前后两锚点间插值 + 抬脚 ——
//     对任意根运动（直行 / 横移 / 原地转身）都不滑步；身体不动时锚点不变 → 不抬脚。
//   · 二级动画（spring）：Louie 头发 / 西装后摆 / 衣摆 / 杆顶三球，假肢人斗篷 4 片，Billy 舌头 3 节 + 蝴蝶结，E164 底部毛缕 4 片，背景员工衣摆。
//   · 道具：STAFF_PROPS 默认随骨；pose.props 给出覆盖位置（托盘 / 牌 / 筹码），check 用 pose.chk 记录「手-道具」对。
//   check:casino-staff-anim 逐帧检查 NaN / 关节限位 / 肘极 / 脚滑 / IK 残差 / 手-道具 / 主要部位穿模（关节胶囊近似）。
import * as THREE from 'three'
import { makeStaffRig, PROS_GRIP_OFF, BILLY_BALL_C, BILLY_BALL_R, type StaffWho, type StaffRigDef, type V3 } from './casinoStaffRig'

// ---------------- 片段表 ----------------
export interface StaffClipInfo { dur: number; loop: boolean; zh: string; walk?: boolean; air?: boolean }
const C = (dur: number, loop: boolean, zh: string, x: Partial<StaffClipInfo> = {}): StaffClipInfo => ({ dur, loop, zh, ...x })
const CREW_CLIPS = { idle: C(4, true, '待机'), walk: C(1.1, true, '行走', { walk: true }), work: C(3.2, true, '本职（发牌 / 转轮盘 / 巡逻）'), serve: C(3.6, false, '托盘送饮'), refuse: C(2.2, false, '摆手拒绝') }
export const STAFF_CLIPS: Record<StaffWho, Record<string, StaffClipInfo>> = {
  louie: {
    idle: C(4, true, '待机'), walk: C(1.3, true, '瘸行', { walk: true }), exchange: C(3.6, false, '兑换筹码'), warn: C(2.6, false, '杆臂指点 / 敲台警告'),
    stare: C(3, false, '转头盯玩家'), face: C(3, true, '球眼转动 / 嘴角抽动'), refuse: C(2.4, false, '拒绝（摇头 + 杆臂横挡）'), deal: C(3, true, '发牌（荷官）'),
  },
  prosthetic: {
    idle: C(4, true, '待机'), walk: C(0.8, true, '蜘蛛步', { walk: true }), sprint: C(0.42, true, '冲刺爬行', { walk: true }), track: C(2.4, false, '追踪转身', { walk: true }),
    smoke: C(4, false, '抽烟杆'), pounce: C(1.8, false, '扑抓'), hat: C(2.6, false, '举帽致意'),
  },
  billy: {
    idle: C(4, true, '待机'), walk: C(0.9, true, '半蹲行走', { walk: true }), hop: C(1.2, true, '蹦跳', { air: true }), deal: C(3.2, true, '洗牌 / 发牌'),
    knock: C(1.6, false, '敲桌'), tongue: C(2.4, false, '舌头舔 / 甩'), pounce: C(1.6, false, '扑抓'),
  },
  bartender: {
    idle: C(4, true, '待机'), side: C(0.9, true, '沿吧台横移', { walk: true }), shake: C(2.4, true, '摇酒'), pour: C(3, false, '倒酒'),
    wipe: C(2.4, true, '擦杯'), serve: C(2.6, false, '递酒'), stare: C(3, false, '盯视'), startle: C(1.8, false, '受惊竖毛'),
  },
  dealer: CREW_CLIPS, waiter: CREW_CLIPS, guard: CREW_CLIPS,
}
export const staffClips = (who: StaffWho) => Object.keys(STAFF_CLIPS[who])

// ---------------- 小工具 ----------------
const TAU = Math.PI * 2
const cl = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const sm = (x: number) => { x = cl(x); return x * x * (3 - 2 * x) }
const win = (t: number, a: number, b: number, c: number, d: number) => sm((t - a) / (b - a)) * (1 - sm((t - c) / (d - c)))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const tv = (a: V3) => new THREE.Vector3(a[0], a[1], a[2])
const qe = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'))
const qaa = (ax: THREE.Vector3, a: number) => new THREE.Quaternion().setFromAxisAngle(ax.clone().normalize(), a)
/** 关键帧（平滑插值），值可以是数或数组 */
function kf<T extends number | number[]>(t: number, ks: [number, T][]): T {
  if (t <= ks[0][0]) return ks[0][1]
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const k = sm((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])), a = ks[i - 1][1], b = ks[i][1]
    return (typeof a === 'number' ? lerp(a, b as number, k) : (a as number[]).map((x, j) => lerp(x, (b as number[])[j], k))) as T
  }
  return ks[ks.length - 1][1]
}
const orth = (v: THREE.Vector3, n: THREE.Vector3) => v.clone().addScaledVector(n, -v.dot(n)).normalize()
/** 把正交基 (x0, y0) 旋到 (x1, y1) 的四元数 */
export function basisQ(x0: THREE.Vector3, y0: THREE.Vector3, x1: THREE.Vector3, y1: THREE.Vector3) {
  const a = x0.clone().normalize(), b = orth(y0, a), c = new THREE.Vector3().crossVectors(a, b)
  const d = x1.clone().normalize(), e = orth(y1, d), f = new THREE.Vector3().crossVectors(d, e)
  const M0 = new THREE.Matrix4().makeBasis(a, b, c), M1 = new THREE.Matrix4().makeBasis(d, e, f)
  return new THREE.Quaternion().setFromRotationMatrix(M1.multiply(M0.transpose()))
}

// ---------------- 姿态 / 求解器 ----------------
export interface PropPose { p: V3; q: [number, number, number, number]; a: V3; vis?: number }
export interface ChkPair { name: string; a: V3; b: V3; tol: number }
export interface StaffPose { W: Float32Array; off: Record<string, V3>; sc: Record<string, number>; props: Record<string, PropPose>; chk: ChkPair[]; ik: { name: string; res: number }[]; ground: { name: string; p: V3; g: boolean }[] }
export interface StaffDyn { sp: Map<string, { x: THREE.Vector3; v: THREE.Vector3 }>; last?: number }
export interface StaffAnimOpts { dyn?: StaffDyn; dt?: number; look?: number; inPlace?: boolean; seed?: number }
export const newStaffDyn = (): StaffDyn => ({ sp: new Map() })

const REST_POLE: Record<string, V3> = {}
export class Solver {
  R: StaffRigDef; n: number; W: (THREE.Quaternion | null)[]; offs: (THREE.Vector3 | null)[]
  pose: StaffPose; who: StaffWho
  constructor(who: StaffWho) {
    this.who = who
    this.R = makeStaffRig(who); this.n = this.R.BONES.length; this.W = new Array(this.n).fill(null); this.offs = new Array(this.n).fill(null)
    this.pose = { W: new Float32Array(this.n * 4), off: {}, sc: {}, props: {}, chk: [], ik: [], ground: [] }
  }
  i(b: string) { const i = this.R.B[b]; if (i === undefined) throw new Error(`${this.who}: no bone ${b}`); return i }
  has(b: string) { return this.R.B[b] !== undefined }
  rest(b: string | number) { return tv(this.R.BONES[typeof b === 'number' ? b : this.i(b)].pos) }
  Wi(i: number): THREE.Quaternion { const w = this.W[i]; if (w) return w; const pa = this.R.BONES[i].parent; return pa < 0 ? new THREE.Quaternion() : this.Wi(pa) }
  Wb(b: string) { return this.Wi(this.i(b)).clone() }
  Pi(i: number): THREE.Vector3 {
    const d = this.R.BONES[i], o = this.offs[i]
    if (d.parent < 0) return tv(d.pos).add(o ?? v3(0, 0, 0))
    const p = this.Pi(d.parent).add(tv(d.pos).sub(tv(this.R.BONES[d.parent].pos)).applyQuaternion(this.Wi(d.parent)))
    return o ? p.add(o) : p
  }
  P(b: string) { return this.Pi(this.i(b)) }
  /** 骨内一点（静止坐标）当前的世界位置 */
  pt(b: string, restPt: V3 | THREE.Vector3) { const r = restPt instanceof THREE.Vector3 ? restPt : tv(restPt); return this.P(b).add(r.clone().sub(this.rest(b)).applyQuaternion(this.Wb(b))) }
  /** 骨尾（主子骨 / 权重线段尾）当前的世界位置 */
  tail(b: string) { return this.pt(b, this.R.seg[this.i(b)].b) }
  set(b: string, q: THREE.Quaternion) { this.W[this.i(b)] = q.clone() }
  /** 相对父骨的局部旋转（静止轴） */
  loc(b: string, q: THREE.Quaternion) { const i = this.i(b), pa = this.R.BONES[i].parent; this.W[i] = (pa < 0 ? new THREE.Quaternion() : this.Wi(pa)).clone().multiply(q) }
  rot(b: string, x: number, y: number, z: number) { this.loc(b, qe(x, y, z)) }
  /** 在继承旋转之上再加一个世界旋转 */
  wrot(b: string, q: THREE.Quaternion) { const i = this.i(b); this.W[i] = q.clone().multiply(this.Wi(i)) }
  off(b: string, v: THREE.Vector3 | V3) { this.offs[this.i(b)] = v instanceof THREE.Vector3 ? v.clone() : tv(v) }
  root(p: THREE.Vector3 | V3, yaw: number) { this.off('root', p); this.set('root', qe(0, yaw, 0)) }
  /** 把骨的静止方向（自身 → 尾）摆到 dir（最小摆动，保留扭转） */
  swing(b: string, dir: THREE.Vector3) {
    const i = this.i(b), s = this.R.seg[i], r = tv(s.b).sub(tv(s.a)).normalize().applyQuaternion(this.Wi(i))
    this.W[i] = new THREE.Quaternion().setFromUnitVectors(r, dir.clone().normalize()).multiply(this.Wi(i))
  }
  restPole(up: string, lo: string, end: string, fb: V3) {
    const key = this.who + up
    if (!REST_POLE[key]) {
      const a = this.rest(up), b = this.rest(lo), c = this.rest(end), d = c.clone().sub(a).normalize(), off = b.clone().sub(a).addScaledVector(d, -b.clone().sub(a).dot(d))
      REST_POLE[key] = (off.length() > 0.02 ? off.normalize() : orth(tv(fb), d)).toArray() as V3
    }
    return tv(REST_POLE[key])
  }
  /** 两节 IK：up → lo → end 骨（end 的根 = 末端），极向 pole（世界），fb = 静止直肢时的极向回退 */
  ik(up: string, lo: string, end: string, target: THREE.Vector3, pole: THREE.Vector3, fb: V3 = [0, 0, -1], name = up, clampReach = false) {
    const a = this.P(up)
    if (clampReach) { const L = this.rest(lo).distanceTo(this.rest(up)) + this.rest(end).distanceTo(this.rest(lo)), d = target.clone().sub(a); if (d.length() > L * 0.995) target = a.clone().addScaledVector(d.normalize(), L * 0.995) }
    const rU = this.rest(up), rL = this.rest(lo), rE = this.rest(end)
    const L1 = rL.distanceTo(rU), L2 = rE.distanceTo(rL), dv = target.clone().sub(a), D0 = dv.length(), dh = dv.clone().normalize()
    const D = cl(D0, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.9995)
    const along = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - along * along))
    const p = orth(pole, dh), elbow = a.clone().addScaledVector(dh, along).addScaledVector(p, h), wrist = a.clone().addScaledVector(dh, D)
    const rp = this.restPole(up, lo, end, fb), pu = this.Wi(this.R.BONES[this.i(up)].parent)
    const rpw = rp.clone().applyQuaternion(pu), dU0 = rL.clone().sub(rU).normalize().applyQuaternion(pu), dL0 = rE.clone().sub(rL).normalize().applyQuaternion(pu)
    const dU = elbow.clone().sub(a).normalize(), dL = wrist.clone().sub(elbow).normalize()
    this.set(up, basisQ(dU0, rpw, dU, p).multiply(pu)); this.set(lo, basisQ(dL0, rpw, dL, p).multiply(pu))
    this.pose.ik.push({ name, res: Math.max(0, D0 - D, Math.abs(L1 - L2) + 1e-3 - D0) })
  }
  prop(name: string, p: THREE.Vector3, q: THREE.Quaternion, anchor: V3, vis = 1) { this.pose.props[name] = { p: p.toArray() as V3, q: q.toArray() as [number, number, number, number], a: anchor, vis } }
  chk(name: string, a: THREE.Vector3, b: THREE.Vector3, tol = 0.015) { this.pose.chk.push({ name, a: a.toArray() as V3, b: b.toArray() as V3, tol }) }
  gnd(name: string, p: THREE.Vector3, g: boolean) { this.pose.ground.push({ name, p: p.toArray() as V3, g }) }
  /** 弹簧骨：尾端质点追随「继承姿态下的尾端」（刚度 k、阻尼 c、重力 g、最大偏角 max） */
  spring(b: string, o: StaffAnimOpts, k = 90, c = 9, g = 2, max = 0.6, extra?: THREE.Quaternion, avoid?: { c: THREE.Vector3; r: number }) {
    const i = this.i(b); if (extra) this.loc(b, extra)
    const h = this.Pi(i), s = this.R.seg[i], L = tv(s.b).distanceTo(tv(s.a)) || 0.05, tq = this.Wi(i).clone()
    const dirT = tv(s.b).sub(tv(s.a)).normalize().applyQuaternion(tq), tgt = h.clone().addScaledVector(dirT, L)
    if (!o.dyn) return
    const key = this.who + ':' + b, dt = Math.min(0.05, o.dt ?? 1 / 60)
    let st = o.dyn.sp.get(key)
    if (!st || st.x.distanceTo(tgt) > 0.5) { st = { x: tgt.clone(), v: v3(0, 0, 0) }; o.dyn.sp.set(key, st) }
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), hdt = dt / n
    for (let it = 0; it < n; it++) {
      const acc = tgt.clone().sub(st.x).multiplyScalar(k).addScaledVector(st.v, -c).add(v3(0, -g, 0))
      st.v.addScaledVector(acc, hdt); st.x.addScaledVector(st.v, hdt)
      const d = st.x.clone().sub(h); st.x.copy(h).addScaledVector(d.normalize(), L)
    }
    let dir = st.x.clone().sub(h).normalize()
    const ang = dir.angleTo(dirT)
    if (ang > max) { const ax = new THREE.Vector3().crossVectors(dirT, dir).normalize(); dir = dirT.clone().applyAxisAngle(ax, max); st.x.copy(h).addScaledVector(dir, L) }
    if (avoid) { const e = h.clone().addScaledVector(dir, L), dd = e.clone().sub(avoid.c); if (dd.length() < avoid.r) { e.copy(avoid.c).addScaledVector(dd.normalize(), avoid.r); dir = e.sub(h).normalize(); st.x.copy(h).addScaledVector(dir, L) } }
    this.W[i] = new THREE.Quaternion().setFromUnitVectors(dirT, dir).multiply(tq)
  }
  finish(o: StaffAnimOpts, rootFwd?: THREE.Vector3): StaffPose {
    const P = this.pose
    for (let i = 0; i < this.n; i++) { const q = this.Wi(i); P.W[i * 4] = q.x; P.W[i * 4 + 1] = q.y; P.W[i * 4 + 2] = q.z; P.W[i * 4 + 3] = q.w }
    this.offs.forEach((v, i) => { if (v) P.off[this.R.BONES[i].name] = v.toArray() as V3 })
    if (o.inPlace && rootFwd && P.off.root) {
      P.off.root = [P.off.root[0] - rootFwd.x, P.off.root[1], P.off.root[2] - rootFwd.z]
      for (const pp of Object.values(P.props)) { pp.p = [pp.p[0] - rootFwd.x, pp.p[1], pp.p[2] - rootFwd.z] } // 道具位置同样去掉根运动
    }
    return P
  }
}

// ---------------- 步态 ----------------
type BodyFn = (t: number) => { p: THREE.Vector3; yaw: number }
const place = (b: { p: THREE.Vector3; yaw: number }, home: THREE.Vector3) => home.clone().applyAxisAngle(v3(0, 1, 0), b.yaw).add(b.p)
/** 一只脚（腿尖）：支撑期锚在支撑期中点的落脚点，摆动期两锚点间插值 + 抬脚；返回位置 / 朝向 / 是否着地 / 摆动进度 */
export function stepFoot(t: number, B: BodyFn, T: number, duty: number, ph: number, home: THREE.Vector3, lift: number, arc = 0) {
  const x = t / T + ph, c = Math.floor(x), u = x - c, tm = (c - ph) * T + (duty * T) / 2
  const b0 = B(tm), A = place(b0, home)
  if (u < duty) return { p: A, yaw: b0.yaw, g: true, s: -1, k: u / duty }
  const s = (u - duty) / (1 - duty), b1 = B(tm + T), An = place(b1, home), e = sm(s), d = A.distanceTo(An), m = cl(d / 0.04)
  const p = A.clone().lerp(An, e); p.y += lift * Math.sin(Math.PI * s) * m
  if (arc) p.add(v3(arc * Math.sin(Math.PI * s) * m, 0, 0).applyAxisAngle(v3(0, 1, 0), b0.yaw))
  return { p, yaw: lerp(b0.yaw, b1.yaw, e), g: m < 0.05, s, k: 0 }
}

// ---------------- 人形公用 ----------------
interface HumanBody { bob?: number; sway?: number; lean?: number; twist?: number; roll?: number; hy?: number; hp?: number; hr?: number; breathe?: number }
function humanTorso(S: Solver, H: HumanBody, t: number) {
  const br = (H.breathe ?? 1) * Math.sin(t * TAU / 3.6)
  S.rot('hips', (H.lean ?? 0) * 0.3, (H.twist ?? 0) * 0.4, (H.roll ?? 0) + (H.sway ?? 0) * 0.05)
  S.rot('spine', (H.lean ?? 0) * 0.35 - 0.012 * br, (H.twist ?? 0) * 0.3, -(H.roll ?? 0) * 0.5)
  S.rot('chest', (H.lean ?? 0) * 0.35 - 0.02 * br, (H.twist ?? 0) * 0.3, -(H.roll ?? 0) * 0.4)
  S.rot('neck', (H.hp ?? 0) * 0.4 + 0.012 * br, (H.hy ?? 0) * 0.4, (H.hr ?? 0) * 0.4)
  S.rot('head', (H.hp ?? 0) * 0.6, (H.hy ?? 0) * 0.6, (H.hr ?? 0) * 0.6)
}
/** 人形双腿：脚按步态 / 原地锚定，heel-off 绕脚尖抬跟；返回着地信息 */
function humanLegs(S: Solver, t: number, B: BodyFn, G: { T: number; duty: number[]; ph: number[]; lift: number[]; arc?: number[]; toeOff?: number; spread?: number }) {
  ;['L', 'R'].forEach((Sd, k) => {
    const s = k === 0 ? 1 : -1, toe = S.rest('toe' + Sd), ank = S.rest('foot' + Sd)
    const home = v3(toe.x + s * (G.spread ?? 0), toe.y, toe.z)
    const F = stepFoot(t, B, G.T, G.duty[k], G.ph[k], home, G.lift[k], (G.arc?.[k] ?? 0) * s)
    // heel-off：支撑末 35% 绕脚尖抬跟；摆动期脚尖略朝下
    const pitch = F.s < 0 ? -(G.toeOff ?? 0) * sm((F.k - 0.62) / 0.38) : -(G.toeOff ?? 0) * (1 - sm(F.s * 1.6)) * 0.8
    const fq = qe(0, F.yaw, 0).multiply(qe(pitch, 0, 0))
    const ankT = F.p.clone().add(ank.clone().sub(toe).applyQuaternion(fq))
    S.ik('thigh' + Sd, 'shin' + Sd, 'foot' + Sd, ankT, v3(0, 0, 1).applyAxisAngle(v3(0, 1, 0), F.yaw).add(v3(s * 0.12, 0, 0)), [0, 0, 1], 'leg' + Sd)
    S.set('foot' + Sd, fq)
    S.gnd('toe' + Sd, S.P('toe' + Sd), F.g)
    S.gnd('heel' + Sd, S.P('foot' + Sd), F.g && pitch > -0.02)
  })
}
const still = (p: V3 = [0, 0, 0], yaw = 0): BodyFn => () => ({ p: tv(p), yaw })
const STAND = { T: 1, duty: [0.6, 0.6], ph: [0, 0.5], lift: [0.05, 0.05] }

// ================= Louie =================
// 左臂：下垂的台球杆（hand 骨 = 杆，腕 → 杆尖 0.28 m）；右臂：前臂朝上、杆顶三颗球；右腿膝下台球杆假肢。
const LOUIE_COUNTER = { y: 1.0, z: 0.42 }
function louieTip(S: Solver) { return S.tail('handL') }
const LOUIE_CUE = 0.2866
/** 杆尖放到 tip、杆朝 dir：腕目标 = tip − dir·杆长 */
const cueTo = (tip: THREE.Vector3, dir: THREE.Vector3) => { const d = dir.clone().normalize(); return { lw: tip.clone().addScaledVector(d, -LOUIE_CUE), ldir: d } }
function louieArms(S: Solver, _t: number, o: { lw?: THREE.Vector3; ldir?: THREE.Vector3; rw?: THREE.Vector3; swing?: number; rbob?: number }) {
  const sh = S.P('upperArmL')
  const lw = o.lw ?? sh.clone().add(v3(0.07, -0.53, 0.03 + 0.12 * (o.swing ?? 0)))
  S.ik('upperArmL', 'foreArmL', 'handL', lw, v3(0.25, -0.1, -1), [0, 0, -1], 'armL')
  if (o.ldir) S.swing('handL', o.ldir)
  else S.swing('handL', S.P('handL').sub(S.P('foreArmL')).normalize().add(v3(0, 0, 0.1 * (o.swing ?? 0))))
  const shR = S.P('upperArmR'), rw = o.rw ?? shR.clone().add(v3(-0.13, -0.02 + (o.rbob ?? 0), 0.16))
  S.ik('upperArmR', 'foreArmR', 'handR', rw, v3(-0.5, -1, 0), [0, -1, 0], 'armR')
  S.swing('handR', v3(0, 1, 0.03))
}
function louieSecondary(S: Solver, o: StaffAnimOpts) {
  for (const h of ['hairL', 'hairR', 'hairB']) S.spring(h, o, 60, 7, 3, 0.45)
  for (const h of ['tailL', 'tailR']) S.spring(h, o, 50, 6, 3, 0.35)
  for (const h of ['hemL', 'hemR']) S.spring(h, o, 80, 9, 2, 0.25)
  for (const h of ['cueBall1', 'cueBall2', 'cueBall3']) S.spring(h, o, 140, 10, 0.5, 0.12)
}
function louiePose(clip: string, t: number, o: StaffAnimOpts): StaffPose {
  const S = new Solver('louie'), look = o.look ?? 0
  let B: BodyFn = still(), gait = STAND, H: HumanBody = {}, arms: Parameters<typeof louieArms>[2] = {}
  const ct = LOUIE_COUNTER
  const chips = (p: THREE.Vector3, vis = 1) => S.prop('chips', p, new THREE.Quaternion(), [0, 0, 0], vis)
  const plan = () => {
  switch (clip) {
    case 'idle': {
      H = { bob: -0.012, sway: Math.sin(t * TAU / 4), hy: 0.12 * Math.sin(t * TAU / 4 + 1), hp: 0.03 * Math.sin(t * TAU / 2), roll: 0.015 * Math.sin(t * TAU / 4) }
      arms = { swing: 0.12 * Math.sin(t * TAU / 4), rbob: 0.01 * Math.sin(t * TAU / 2) }
      break
    }
    case 'walk': {
      const T = 1.3, v = 0.55, u = (t / T) % 1
      B = (tt) => ({ p: v3(0, 0, v * tt), yaw: 0 })
      gait = { T, duty: [0.68, 0.56], ph: [0, 0.5], lift: [0.06, 0.035], arc: [0, 0.06], toeOff: 0.3 } as typeof gait
      // 一瘸一拐：踩假肢（R 支撑）时身体下沉、向右倾；假肢摆动时提髋
      const onPeg = win(u, 0.42, 0.52, 0.86, 0.98), pegSwing = win(u, 0.0, 0.08, 0.36, 0.48)
      H = { bob: -0.06 - 0.02 * onPeg + 0.012 * pegSwing, roll: -0.06 * onPeg + 0.05 * pegSwing, lean: 0.06, hr: 0.04 * onPeg, twist: 0.08 * Math.sin(u * TAU) }
      arms = { swing: -0.9 * Math.sin(u * TAU), rbob: -0.02 * onPeg }
      break
    }
    case 'exchange': {
      // 杆尖把柜台上的筹码推向玩家，再把玩家的筹码钩回来
      const push = kf(t, [[0, 0], [0.5, 0], [1.4, 1], [1.8, 1], [2.8, 0], [3.6, 0]])
      const reach = win(t, 0.2, 0.6, 3.0, 3.5)
      const chip = v3(0.12, ct.y + 0.012, ct.z - 0.08 + 0.3 * push)
      H = { lean: 0.22 * reach, hp: 0.25 * reach, bob: -0.02, hy: 0.1 * reach }
      const tipT = chip.clone().add(v3(0, 0.015, -0.035)), c = cueTo(tipT, v3(-0.05, -0.38, 1)), sh = S.P('upperArmL'), rest = sh.clone().add(v3(0.07, -0.53, 0.03))
      arms = reach > 0.999 ? c : { lw: c.lw.clone().lerp(rest, 1 - reach), ldir: c.ldir.clone().lerp(v3(0.05, -1, 0.1), 1 - reach).normalize() }
      chips(chip)
      ;(S as unknown as { _chip: THREE.Vector3; _cw: number })._chip = chip; (S as unknown as { _cw: number })._cw = reach > 0.95 ? 1 : 0
      break
    }
    case 'warn': {
      const raise = win(t, 0.1, 0.5, 2.1, 2.5), tap = win(t, 1.0, 1.1, 1.7, 1.8) * Math.max(0, Math.sin((t - 1.0) * TAU * 3.2))
      H = { lean: 0.1 * raise, hp: -0.1 * raise, hy: 0.08 * raise }
      const sh = S.P('upperArmL'), w = sh.clone().add(v3(0.05, -0.18 - 0.1 * tap, 0.3)), d = v3(0.02, -0.25 - 0.9 * tap, 1).normalize()
      arms = { lw: w.clone().lerp(sh.clone().add(v3(0.07, -0.53, 0.03)), 1 - raise), ldir: d.lerp(v3(0.05, -1, 0.1), 1 - raise).normalize() }
      break
    }
    case 'stare': {
      const k = win(t, 0.2, 0.9, 2.4, 3.0), yaw = (look || 0.9) * k
      H = { hy: yaw * 0.85, twist: yaw * 0.25, hp: -0.06 * k, lean: 0.04 * k }
      S.rot('ballEye', 0, yaw * 0.25, 0)
      arms = { swing: 0.05 * Math.sin(t * 3) }
      break
    }
    case 'face': {
      H = { hy: 0.06 * Math.sin(t * TAU / 3), hr: 0.04 * Math.sin(t * TAU / 1.5) + 0.03 * Math.max(0, Math.sin(t * 17)) * win(t % 1.5, 0.6, 0.65, 0.8, 0.9) }
      arms = { swing: 0.06 * Math.sin(t * TAU / 3) }
      break
    }
    case 'refuse': {
      const k = win(t, 0.1, 0.45, 1.8, 2.3), shake = Math.sin((t - 0.3) * TAU * 2.4) * win(t, 0.3, 0.5, 1.5, 1.9)
      H = { hy: 0.35 * shake, lean: -0.05 * k, hp: 0.05 * k }
      const sh = S.P('upperArmL'), w = sh.clone().add(v3(0.0, -0.3, 0.28))
      arms = { lw: w.lerp(sh.clone().add(v3(0.07, -0.53, 0.03)), 1 - k), ldir: v3(-1, 0.05, 0.12).normalize().lerp(v3(0.05, -1, 0.1), 1 - k).normalize() }
      break
    }
    case 'deal': {
      // 荷官：杆尖把一张牌从牌靴推出、沿台面滑到玩家位
      const u = t % 3, k = 1, slide = kf(u, [[0, 0], [0.6, 0], [1.6, 1], [3, 1]]), back = win(u, 1.6, 2.0, 2.6, 3)
      const card = v3(0.18 - 0.12 * slide, 0.92 + 0.004, 0.35 + 0.32 * slide)
      H = { lean: 0.2, hp: 0.3, bob: -0.03, hy: -0.15 * slide }
      const tipT = card.clone().add(v3(0, 0.015, -0.035)), c = cueTo(tipT, v3(-0.1, -0.45, 1)), up = cueTo(v3(0.2, 1.05, 0.32), v3(0, -0.2, 1))
      arms = { lw: c.lw.clone().lerp(up.lw, back), ldir: c.ldir.clone().lerp(up.ldir, back).normalize() }
      S.prop('card', card, qe(0, 0.4 - 0.5 * slide, 0), [0, 0, 0], u < 2.9 ? 1 : 0)
      ;(S as unknown as { _card: THREE.Vector3; _cw: number })._card = card; (S as unknown as { _cw: number })._cw = back < 0.05 && u > 0.65 && u < 1.55 ? k : 0
      break
    }
  }
  }
  plan()
  const b0 = B(t)
  S.root(b0.p.clone().add(v3(0, H.bob ?? -0.02, 0)), b0.yaw)
  humanTorso(S, H, t)
  plan()
  humanLegs(S, t, B, gait)
  louieArms(S, t, arms)
  // 面部：球眼转动（滚动 + 偶尔整圈）、下颌 / 嘴角缝线抽动
  if (clip === 'face') {
    const r = t * 1.2, flick = win(t % 1.5, 0.6, 0.65, 0.8, 0.9)
    S.rot('ballEye', 0.35 * Math.sin(r * 1.7), 0.5 * Math.sin(r), r * 2)
    S.rot('jaw', 0.06 * flick + 0.02 * Math.sin(t * 9) * flick, 0.03 * flick, 0.05 * flick)
  } else if (clip !== 'stare') S.rot('ballEye', 0.08 * Math.sin(t * 0.9), 0.15 * Math.sin(t * 0.6), 0.2 * Math.sin(t * 0.3))
  if (clip === 'refuse') S.rot('jaw', 0.05 * win(t, 0.3, 0.5, 1.5, 1.8), 0, 0)
  // 手-道具：杆尖贴住筹码 / 牌
  const X = S as unknown as { _chip?: THREE.Vector3; _card?: THREE.Vector3; _cw?: number }
  if (X._cw) { const tip = louieTip(S), obj = X._chip ?? X._card!; S.chk('杆尖-' + (X._chip ? '筹码' : '牌'), tip, obj.clone().add(v3(0, 0.015, -0.035)), 0.03) }
  louieSecondary(S, o)
  return S.finish(o, b0.p)
}

// ================= 蜘蛛腿公用（假肢人 / E164）=================
/** 一条蜘蛛腿 n（如 legL2）：腿尖放到 tip；c / d 两节按水平朝向 ψ 保持静止形状（qcd 可再加倾斜），a / b 两节 IK 到踝 */
function spiderLeg(S: Solver, n: string, tip: THREE.Vector3, extra?: THREE.Quaternion) {
  const hipR = S.rest(n + 'a'), tR = tv(S.R.J[n + 'Tip']), fR = S.rest(n + 'd'), aR = S.rest(n + 'c')
  const hip = S.P(n + 'a'), rd = tR.clone().sub(hipR), cd = tip.clone().sub(hip)
  let psi = Math.atan2(cd.x, cd.z) - Math.atan2(rd.x, rd.z); psi = Math.atan2(Math.sin(psi), Math.cos(psi))
  const qy = qe(0, psi, 0), qcd = extra ? qy.clone().multiply(extra) : qy
  const foot = tip.clone().add(fR.clone().sub(tR).applyQuaternion(qcd)), ank = foot.clone().add(aR.clone().sub(fR).applyQuaternion(qcd))
  const pole = S.restPole(n + 'a', n + 'b', n + 'c', [0, 1, 0]).applyQuaternion(qy).add(v3(cd.x, 0, cd.z).normalize().multiplyScalar(0.6))
  S.ik(n + 'a', n + 'b', n + 'c', ank, pole, [0, 1, 0], n)
  S.set(n + 'c', qcd); S.set(n + 'd', qcd)
}
function spiderGait(S: Solver, t: number, B: BodyFn, legs: string[], G: { T: number; duty: number; ph: Record<string, number>; lift: number; reach?: number }) {
  for (const n of legs) {
    const home = tv(S.R.J[n + 'Tip']); if (G.reach) home.multiply(v3(G.reach, 1, G.reach))
    const F = stepFoot(t, B, G.T, G.duty, G.ph[n] ?? 0, home, G.lift)
    spiderLeg(S, n, F.p); S.gnd(n, S.tail(n + 'd'), F.g)
  }
}
const PROS_LEGS_ALL = ['L', 'R'].flatMap((s) => [1, 2, 3, 4].map((i) => `leg${s}${i}`))
/** 交替四足组：L1 R2 L3 R4 / R1 L2 R3 L4（每条再加 0.04 波相） */
const TETRA: Record<string, number> = Object.fromEntries(PROS_LEGS_ALL.map((n) => { const s = n[3] === 'L' ? 0 : 1, i = Number(n[4]); return [n, ((s + i) % 2) * 0.5 + 0.04 * (i - 1)] }))

// ================= 假肢人 =================
function prosArm(S: Solver, o: { w?: THREE.Vector3; hq?: THREE.Quaternion } = {}) {
  const w = o.w ?? S.pt('chest', S.rest('handR'))
  S.ik('upperArmR', 'foreArmR', 'handR', w, v3(-0.6, -0.8, 0.2), [0, -1, 0], 'armR', true)
  S.set('handR', o.hq ?? S.Wb('chest'))
  S.ik('upperArmL', 'foreArmL', 'handL', S.pt('chest', S.rest('handL')), v3(0.5, -0.2, -1), [0, 0, -1], 'armL')
}
const HAT_BRIM: V3 = [-0.01, 1.87, 0.11]
const prosGrip = (S: Solver) => S.pt('handR', tv(S.R.J.wristR).add(tv(PROS_GRIP_OFF)))
function prosPose(clip: string, t: number, o: StaffAnimOpts): StaffPose {
  const S = new Solver('prosthetic'), look = o.look ?? 1.6
  let B: BodyFn = still(), y = 0, tilt = [0, 0, 0], head = [0, 0, 0], jaw = 0
  let arm: Parameters<typeof prosArm>[1] = {}, gaitG: Parameters<typeof spiderGait>[4] | null = { T: 0.8, duty: 0.55, ph: TETRA, lift: 0.07 }
  let legOverride: ((n: string) => THREE.Vector3 | null) | null = null, hatK: number[] | null = null
  const plan = () => {
  switch (clip) {
    case 'idle': {
      y = -0.01 + 0.006 * Math.sin(t * TAU / 4); tilt = [0.02 * Math.sin(t * TAU / 4), 0.05 * Math.sin(t * TAU / 4 + 0.7), 0.025 * Math.sin(t * TAU / 4)]
      head = [0.04 * Math.sin(t * TAU / 4 + 2), 0.15 * Math.sin(t * TAU / 8), 0.16 + 0.06 * Math.sin(t * TAU / 4)]
      break
    }
    case 'walk': case 'sprint': {
      const sp = clip === 'sprint', T = sp ? 0.42 : 0.8, v = sp ? 1.6 : 0.6, u = (t / T) % 1
      B = (tt) => ({ p: v3(0, 0, v * tt), yaw: 0 })
      gaitG = { T, duty: sp ? 0.5 : 0.55, ph: TETRA, lift: sp ? 0.1 : 0.07, reach: sp ? 0.8 : 0.92 }
      y = (sp ? -0.07 : -0.05) + (sp ? 0.015 : 0.01) * Math.cos(u * TAU * 2); tilt = [sp ? 0.18 : 0.04, 0.04 * Math.sin(u * TAU), 0.03 * Math.sin(u * TAU)]
      head = [sp ? -0.2 : -0.03, 0, 0.05]
      if (sp) arm = { w: S.pt('chest', S.rest('handR')).add(v3(0.03, -0.1, 0.05)) }
      break
    }
    case 'track': {
      const k = sm((t - 0.15) / 1.9), yaw = look * k
      B = () => ({ p: v3(0, 0, 0), yaw: 0 })
      B = (tt) => ({ p: v3(0, 0, 0), yaw: look * sm((tt - 0.15) / 1.9) })
      gaitG = { T: 0.6, duty: 0.55, ph: TETRA, lift: 0.07 }
      y = -0.02; head = [-0.05, cl(look * sm((t - 0.0) / 1.2) - yaw, -0.9, 0.9) * 0.9, 0]
      break
    }
    case 'smoke': {
      const away = win(t, 0.9, 1.5, 2.9, 3.6), exh = win(t, 1.5, 1.8, 2.5, 2.9), inh = win(t, 0.15, 0.35, 0.65, 0.85)
      y = -0.01; head = [-0.12 * exh + 0.04 * inh, 0.1 * exh, 0.12]; jaw = 0.1 * inh + 0.35 * exh
      tilt = [-0.04 * exh, 0, 0]
      const w0 = S.pt('chest', S.rest('handR'))
      arm = { w: w0.clone().add(v3(-0.05, -0.16, 0.12).multiplyScalar(away)), hq: S.Wb('chest').multiply(qe(0.0, 0.25 * away, -0.5 * away)) }
      break
    }
    case 'pounce': {
      // 0–0.5 蓄力（压低、后坐）→ 0.5–0.9 扑出（前两腿抬起前伸、右臂前抓、张嘴）→ 0.9–1.3 落地 → 复位
      const crouch = win(t, 0, 0.45, 0.55, 0.7), air = win(t, 0.5, 0.65, 0.85, 1.0), dz = 0.9 * sm((t - 0.5) / 0.45)
      B = (tt) => ({ p: v3(0, 0, 0.9 * sm((tt - 0.5) / 0.45)), yaw: 0 })
      y = -0.07 * crouch + 0.06 * air - 0.06 * win(t, 0.95, 1.05, 1.15, 1.5)
      tilt = [-0.12 * crouch + 0.12 * air, 0, 0]; head = [-0.3 * air, 0, 0]; jaw = 0.5 * air + 0.1 * crouch
      arm = { w: S.pt('chest', S.rest('handR')).lerp(S.P('upperArmR').add(v3(0.03, 0.0, 0.36)), air) }
      gaitG = null
      legOverride = (n) => {
        const i = Number(n[4]), home = tv(S.R.J[n + 'Tip']), st = 0.5 + (4 - i) * 0.015, k = sm((t - st) / 0.45)
        const p = home.clone().add(v3(0, 0, dz * 0 + 0.9 * k)); p.y += 0.09 * Math.sin(Math.PI * cl((t - st) / 0.4))
        if (i === 1) { const r = win(t, 0.5, 0.65, 0.85, 1.0); p.add(v3(0, 0.08 * r, 0.2 * r)) }
        return p
      }
      void dz
      break
    }
    case 'hat': {
      const reach = win(t, 0.1, 0.6, 1.9, 2.4), lift = win(t, 0.6, 0.9, 1.5, 1.9), bow = win(t, 0.6, 0.95, 1.5, 1.9)
      const dip = Math.max(reach, bow)
      tilt = [0.55 * dip, 0, 0]; head = [0.55 * dip, 0, 0.1 * (1 - dip)]
      S.root(v3(0, 0, 0), 0); S.rot('hips', tilt[0] * 0.3, 0, 0); S.rot('spine', tilt[0] * 0.35, 0, 0); S.rot('chest', tilt[0] * 0.35, 0, 0); S.rot('neck', head[0] * 0.4, 0, head[2] * 0.4); S.rot('head', head[0] * 0.6, 0, head[2] * 0.6)
      const brim = S.pt('head', HAT_BRIM), up = v3(0, 0.09, 0.02).multiplyScalar(lift)
      const hq = S.Wb('chest').multiply(qe(0, 0, -0.6 * reach)), g = brim.clone().add(up), w = g.clone().sub(tv(PROS_GRIP_OFF).applyQuaternion(hq))
      arm = { w: S.pt('chest', S.rest('handR')).lerp(w, reach), hq }; hatK = [reach, lift]
      break
    }
  }
  }
  plan()
  const b0 = B(t)
  if (clip !== 'hat') {
    S.root(b0.p.clone().add(v3(0, y, 0)), b0.yaw)
    S.rot('hips', tilt[0] * 0.5, tilt[1], tilt[2]); S.rot('spine', tilt[0] * 0.3, 0, -tilt[2] * 0.5); S.rot('chest', tilt[0] * 0.2, 0, 0)
    S.rot('neck', head[0] * 0.4, head[1] * 0.4, head[2] * 0.4); S.rot('head', head[0] * 0.6, head[1] * 0.6, head[2] * 0.6)
  } else S.off('root', v3(0, y, 0))
  plan()
  if (gaitG) spiderGait(S, t, B, PROS_LEGS_ALL, gaitG)
  else for (const n of PROS_LEGS_ALL) { const p = legOverride!(n)!; spiderLeg(S, n, p); S.gnd(n, S.tail(n + 'd'), p.y < 0.002) }
  prosArm(S, arm)
  if (hatK) {
    // 臂短（≈0.4 m）够不到帽顶：手到可达极限，帽子随手的握点被「拿」下来（握住后帽檐 = 握点）
    const k = sm(hatK[0] * 1.15 - 0.15), g = prosGrip(S), brim = S.pt('head', HAT_BRIM)
    S.off('hat', g.clone().sub(brim).multiplyScalar(k)); S.rot('hat', -0.3 * hatK[1], 0, 0.12 * hatK[1])
    if (hatK[0] > 0.99) S.chk('手-帽檐', g, S.pt('hat', HAT_BRIM), 0.02)
  }
  S.rot('jaw', jaw, 0, 0)
  for (let i = 0; i < 4; i++) S.spring('skirt' + i, o, 45, 5, 2.5, 0.35)
  if (clip !== 'hat') S.spring('hat', o, 160, 12, 0.5, 0.08)
  return S.finish(o, b0.p)
}

// ================= Billy =================
const BILLY_TABLE = { y: 0.92, z: 0.42 }
const FING4 = ['thumb', 'index', 'middle', 'ring']
const FING5 = ['thumb', 'index', 'middle', 'ring', 'pinky']
/** 手指屈曲：c[i] = 每节屈曲角（rad），绕「指向 × 掌心法线」轴 */
function curl(S: Solver, Sd: string, c: number[]) {
  const s = Sd === 'L' ? 1 : -1, F = S.who === 'billy' ? FING4 : FING5, palm = v3(-s, 0, 0.3).normalize()
  F.forEach((f, i) => { for (let k = 1; k <= 3; k++) { const b = `${f}${k}${Sd}`; if (!S.has(b)) continue; const sg = S.R.seg[S.i(b)], d = tv(sg.b).sub(tv(sg.a)).normalize(), ax = new THREE.Vector3().crossVectors(d, f === 'thumb' ? v3(0, 0, -1) : palm).normalize(); S.loc(b, qaa(ax, (c[i] ?? 0) * (k === 1 ? 0.8 : 1))) } })
}
function restHandFrame(S: Solver, Sd: string) { const s = Sd === 'L' ? 1 : -1, w = S.rest('hand' + Sd), tip = tv(S.R.J['handTip' + Sd]); return { dir: tip.clone().sub(w).normalize(), palm: v3(-s, 0, 0.3).normalize() } }
/** 手掌朝向：指向 dir、掌心 palm（世界） */
function orientHand(S: Solver, Sd: string, dir: THREE.Vector3, palm: THREE.Vector3) { const r = restHandFrame(S, Sd); S.set('hand' + Sd, basisQ(r.dir, r.palm, dir, palm)) }
function handInfo(S: Solver, Sd: string) {
  const r = restHandFrame(S, Sd), q = S.Wb('hand' + Sd), w = S.P('hand' + Sd), tip = tv(S.R.J['handTip' + Sd]), wr = S.rest('hand' + Sd)
  const dir = r.dir.clone().applyQuaternion(q), palm = r.palm.clone().applyQuaternion(q), L = tip.distanceTo(wr)
  return { w, dir, palm, pc: w.clone().addScaledVector(dir, L * 0.45).addScaledVector(palm, 0.016), q }
}
const pinchPt = (S: Solver, Sd: string) => S.tail('thumb3' + Sd).lerp(S.tail('index3' + Sd), 0.5)
function billyPose(clip: string, t: number, o: StaffAnimOpts): StaffPose {
  const S = new Solver('billy'), tb = BILLY_TABLE
  let B: BodyFn = still(), y = 0, rot = [0, 0, 0], gait = { T: 1, duty: [0.6, 0.6], ph: [0, 0.5], lift: [0.06, 0.06], spread: 0 } as Parameters<typeof humanLegs>[3]
  let lw: THREE.Vector3 | null = null, lDir: THREE.Vector3 | null = null, lPalm: THREE.Vector3 | null = null, lc = [0.2, 0.3, 0.3, 0.3], rBob = 0, tongue: THREE.Quaternion[] = [], air = 0
  let deck: { on: boolean; card?: THREE.Vector3; cardVis?: number } | null = null, dz = 0
  const plan = () => {
  switch (clip) {
    case 'idle': y = -0.008 * (1 + Math.sin(t * TAU / 4)); rot = [0.02 * Math.sin(t * TAU / 4), 0.06 * Math.sin(t * TAU / 8), 0.035 * Math.sin(t * TAU / 4 + 1)]; rBob = 0.015 * Math.sin(t * TAU / 2); lc = [0.2, 0.3 + 0.1 * Math.sin(t * 2), 0.3, 0.3]; break
    case 'walk': {
      const T = 0.9, v = 0.55, u = (t / T) % 1
      B = (tt) => ({ p: v3(0, 0, v * tt), yaw: 0 }); gait = { T, duty: [0.6, 0.6], ph: [0, 0.5], lift: [0.07, 0.07], toeOff: 0.15 }
      y = -0.03 + 0.02 * Math.cos(u * TAU * 2); rot = [0.05, 0.06 * Math.sin(u * TAU), -0.07 * Math.sin(u * TAU)]; rBob = 0.02 * Math.cos(u * TAU * 2)
      break
    }
    case 'hop': {
      const u = t % 1.2, cr = win(u, 0, 0.22, 0.28, 0.32), h = u > 0.3 && u < 0.78 ? 0.26 * Math.sin(Math.PI * (u - 0.3) / 0.48) : 0, land = win(u, 0.76, 0.84, 0.92, 1.15)
      y = -0.09 * cr + h - 0.08 * land; air = h; rot = [0.08 * cr - 0.06 * (h / 0.26) + 0.06 * land, 0, 0]; rBob = 0.04 * (h / 0.26)
      lw = S.pt('hips', S.rest('handL').add(v3(0.05, -0.04 * (h / 0.26), 0.05)))
      break
    }
    case 'deal': {
      const u = t % 3.2, shuffle = u < 1.3 ? win(u, 0, 0.2, 1.1, 1.3) : 0, deal = sm((u - 1.4) / 0.6), back = win(u, 2.0, 2.3, 2.9, 3.2)
      rot = [0.12, -0.1 * deal * (1 - back), 0]; y = -0.02
      lw = v3(0.32, 1.0 + 0.02 * Math.sin(u * 30) * shuffle, 0.36).lerp(v3(0.2, 0.98, 0.5), deal * (1 - back))
      lDir = v3(-0.3, -0.2, 1).normalize(); lPalm = v3(0, -1, 0.15).normalize()
      lc = [0.6, 0.55 + 0.35 * Math.max(0, Math.sin(u * 30)) * shuffle, 0.8, 0.9]
      const card = u > 1.4 && u < 3.1 ? v3(0.2 - 0.25 * deal, tb.y + 0.002, 0.55 + 0.35 * deal) : null
      deck = { on: true, card: card ?? undefined, cardVis: card ? 1 : 0 }
      break
    }
    case 'knock': {
      const k = win(t, 0.1, 0.4, 1.2, 1.55), knock = Math.max(0, Math.sin((t - 0.45) * TAU * 3.6)) * win(t, 0.4, 0.45, 1.1, 1.2)
      rot = [0.1 * k, -0.1 * k, 0]
      lw = S.rest('handL').lerp(v3(0.3, tb.y + 0.1 + 0.08 * (1 - knock), 0.45), k); lDir = v3(-0.2, -0.75, 0.6).normalize(); lPalm = v3(-0.3, -0.2, -0.9).normalize(); lc = [0.9, 1.2, 1.25, 1.3]
      if (t > 0.45 && t < 1.15 && knock > 0.97) { (S as unknown as { _knock: boolean })._knock = true }
      break
    }
    case 'tongue': {
      const lick = win(t, 0.1, 0.4, 1.0, 1.3), flick = win(t, 1.3, 1.4, 2.0, 2.3), sw = Math.sin(t * TAU * 1.5)
      tongue = [qe(-0.9 * lick, 0.3 * sw * lick + 0.5 * Math.sin(t * 40) * flick, 0), qe(-0.7 * lick, 0.2 * sw * lick, 0.3 * Math.sin(t * 40 + 1) * flick), qe(-0.6 * lick, 0, 0)]
      rot = [-0.08 * lick, 0.08 * sw * lick, 0]
      break
    }
    case 'pounce': {
      const cr = win(t, 0, 0.35, 0.42, 0.55), lun = win(t, 0.42, 0.6, 0.9, 1.3)
      y = -0.1 * cr + 0.08 * lun; rot = [-0.12 * cr + 0.3 * lun, 0, 0]
      lw = S.rest('handL').lerp(v3(0.4, 1.25, 0.55), lun); lDir = v3(0, 0.3, 1).normalize(); lPalm = v3(-0.2, -1, 0.1).normalize(); lc = [-0.2 + 1.1 * (t > 0.85 ? 1 : 0), -0.4 + 1.3 * (t > 0.85 ? 1 : 0), -0.4 + 1.3 * (t > 0.85 ? 1 : 0), -0.4 + 1.3 * (t > 0.85 ? 1 : 0)]
      B = still(); dz = 0.14 * lun
      rBob = 0.05 * lun
      break
    }
  }
  }
  plan()
  const b0 = B(t)
  S.root(b0.p.clone().add(v3(0, y, dz)), b0.yaw)
  S.rot('hips', rot[0], rot[1], rot[2]) // Billy：球即躯干，只转 hips（spine / chest 空骨不动，四肢根部不脱离球面）
  plan()
  if (air > 0.002) {
    // 空中：脚随身体离地并收起
    ;['L', 'R'].forEach((Sd) => { const toe = S.rest('toe' + Sd), ank = S.rest('foot' + Sd), p = toe.clone().add(v3(0, air * 0.75, 0)); S.ik('thigh' + Sd, 'shin' + Sd, 'foot' + Sd, p.clone().add(ank.clone().sub(toe)), v3(Sd === 'L' ? 0.5 : -0.5, 0, 1), [0, 0, 1], 'leg' + Sd); S.set('foot' + Sd, qe(0.25 * air, 0, 0)); S.gnd('toe' + Sd, S.P('toe' + Sd), false) })
  } else humanLegs(S, t, B, gait)
  // 左爪：默认搭在左膝上（随膝走）
  const kneeL = S.P('shinL')
  const lwT = lw ?? kneeL.clone().add(S.rest('handL').sub(S.rest('shinL')))
  S.ik('upperArmL', 'foreArmL', 'handL', lwT, v3(0.6, 0.3, -0.4), [0, 0, -1], 'armL')
  if (lDir && lPalm) orientHand(S, 'L', lDir, lPalm)
  curl(S, 'L', lc); curl(S, 'R', [0.5, 0.55, 0.6, 0.65])
  if (!lw) S.chk('左爪-左膝', S.P('handL'), lwT, 0.01)
  S.ik('upperArmR', 'foreArmR', 'handR', S.rest('handR').add(v3(0, rBob, 0)).sub(S.rest('hips')).applyQuaternion(S.Wb('hips')).add(S.P('hips')), v3(-0.6, -0.6, 0), [0, -1, 0], 'armR')
  S.set('handR', S.Wb('hips'))
  const dk = deck as { on: boolean; card?: THREE.Vector3; cardVis?: number } | null
  if (dk) {
    const h = handInfo(S, 'L'), dq = basisQ(v3(0, 1, 0), v3(0, 0, 1), h.palm.clone().negate(), h.dir)
    const dp = pinchPt(S, 'L').addScaledVector(h.palm, 0.012)
    S.prop('deck', dp, dq, [0, 0, 0]); S.chk('爪-牌堆', pinchPt(S, 'L'), dp, 0.025)
    if (dk.card) S.prop('card', dk.card, qe(0, 0.3, 0), [0, 0, 0], dk.cardVis)
    else S.prop('card', dp, dq, [0, 0, 0], 0)
  }
  if ((S as unknown as { _knock?: boolean })._knock) { const kn = S.tail('index2L'); S.chk('指节-台面', kn, v3(kn.x, tb.y, kn.z), 0.02) }
  // 舌头：弹簧 + 动作叠加，舌尖不进球
  const ball = { c: S.P('ball'), r: BILLY_BALL_R + 0.02 }
  ;['tongue1', 'tongue2', 'tongue3'].forEach((b, i) => S.spring(b, o, 70 - i * 15, 6, 3, 0.5, tongue[i], ball))
  S.spring('bow', o, 120, 8, 1, 0.2)
  return S.finish(o, b0.p)
}

// ================= 酒保 E164 =================
const E164_WALK = ['L', 'R'].flatMap((s) => [2, 3, 4].map((i) => `leg${s}${i}`))
const TRI: Record<string, number> = { legL2: 0, legR3: 0, legL4: 0, legR2: 0.5, legL3: 0.5, legR4: 0.5 }
const E164_BAR = { y: 0.95, z: 0.66 }
/** 前腿（1 号）当手：爪尖到 tip，末两节朝向 = 水平朝向 + extra 倾斜 */
function e164Arm(S: Solver, Sd: string, tip: THREE.Vector3, extra?: THREE.Quaternion) { spiderLeg(S, `leg${Sd}1`, tip, extra) }
function e164Pose(clip: string, t: number, o: StaffAnimOpts): StaffPose {
  const S = new Solver('bartender'), bar = E164_BAR, look = o.look ?? 0.6
  let B: BodyFn = still(), y = 0, rot = [0, 0, 0], eye = [0, 0], puff = 1, eyeS = 1
  const tL0 = tv(S.R.J.legL1Tip), tR0 = tv(S.R.J.legR1Tip)
  let tL = tL0.clone(), tR = tR0.clone(), xL: THREE.Quaternion | undefined, xR: THREE.Quaternion | undefined
  let gait: Parameters<typeof spiderGait>[4] = { T: 0.9, duty: 0.6, ph: TRI, lift: 0.08 }, kick = 0
  const glassAnchor = tR0.clone().add(v3(0, -0.075, 0.02)), shakerAnchor = tL0.clone().add(v3(-0.02, -0.07, 0.03))
  let glassOn: THREE.Vector3 | null = null, rag = false, shakerOn: THREE.Vector3 | null = null, stream = 0
  const plan = () => {
  switch (clip) {
    case 'idle': {
      y = 0.008 * Math.sin(t * TAU / 3.6); rot = [0, 0.05 * Math.sin(t * TAU / 8), 0.02 * Math.sin(t * TAU / 4)]; puff = 1 + 0.015 * Math.sin(t * TAU / 3.6)
      const j = Math.floor(t / 0.9), r1 = Math.sin(j * 12.9898) * 43758.5453, r2 = Math.sin(j * 78.233) * 43758.5453
      eye = [0.25 * ((r1 - Math.floor(r1)) - 0.5), 0.6 * ((r2 - Math.floor(r2)) - 0.5)]
      tL.y += 0.01 * Math.sin(t * 2); tR.y += 0.01 * Math.sin(t * 2 + 1)
      break
    }
    case 'side': {
      const T = 0.9, v = 0.45, u = (t / T) % 1
      B = (tt) => ({ p: v3(v * tt, 0, 0), yaw: 0 }); y = 0.015 * Math.cos(u * TAU * 2); rot = [0, 0, 0.04 * Math.sin(u * TAU)]
      tL.y += 0.02 * Math.sin(u * TAU); tR.y += 0.02 * Math.sin(u * TAU + Math.PI)
      eye = [0, -0.3]
      break
    }
    case 'shake': {
      const s = Math.sin(t * TAU * 4)
      tL = tL0.clone().add(v3(0.04, 0.22 + 0.07 * s, -0.02)); xL = qe(0.3 * s, 0, 0.15)
      rot = [0, 0.05 * s, 0.03 * s]; y = 0.01 * s; eye = [-0.2, 0.1 * s]
      break
    }
    case 'pour': {
      const lift = win(t, 0.2, 0.7, 2.3, 2.8), tilt = win(t, 0.8, 1.2, 1.9, 2.3)
      const glass = tR0.clone().add(v3(0.03, 0, 0.04))
      tR = glass
      tL = tL0.clone().lerp(glass.clone().add(v3(0.12, 0.2, 0.0)), lift); xL = qe(0, 0, 1.6 * tilt)
      stream = tilt > 0.6 ? 1 : 0; eye = [-0.45 * lift, -0.15 * lift]; rot = [0.06 * lift, -0.06 * lift, 0]
      break
    }
    case 'wipe': {
      // 摇酒壶放上吧台；左爪拿抹布伸进右爪的杯里转圈擦
      const c = t * TAU / 1.2, g = tR0.clone().add(v3(0.06, 0.08, 0.02))
      tR = g; xR = qe(0, 0, 0.25 * Math.sin(c))
      shakerOn = v3(0.32, bar.y, 0.5)
      tL = g.clone().add(v3(0.03 * Math.cos(c) + 0.02, 0.1 + 0.015 * Math.sin(c * 2), 0.03 * Math.sin(c))); xL = qe(0.4, 0, 0.3)
      rag = true; eye = [-0.4, -0.1]
      break
    }
    case 'serve': {
      const out = win(t, 0.2, 0.9, 1.6, 2.3), rel = t > 1.15 && t < 1.65
      const put = v3(-0.08, bar.y + 0.006, bar.z + 0.02)
      tR = tR0.clone().lerp(put.clone().sub(v3(0, -0.075, 0.02)).add(v3(0, 0.0, 0)), out)
      if (t >= 1.15) glassOn = t < 2.55 ? put : null
      rot = [0.12 * out, 0, 0]; eye = [-0.2 * out, 0]
      void rel
      break
    }
    case 'stare': {
      const k = win(t, 0.3, 1.0, 2.3, 3.0)
      rot = [0.1 * k, look * 0.5 * k, 0]; eye = [-0.05 * k, look * 0.5 * k]; eyeS = 1 + 0.06 * k; y = 0.02 * k
      break
    }
    case 'startle': {
      const j = win(t, 0.02, 0.15, 0.6, 1.4)
      y = 0.13 * j; puff = 1 + 0.16 * j; eyeS = 1 + 0.18 * j; kick = j; rot = [-0.12 * j, 0, 0]
      tL = tL0.clone().add(v3(0.08, 0.12, -0.08).multiplyScalar(j)); tR = tR0.clone().add(v3(-0.08, 0.12, -0.08).multiplyScalar(j))
      gait = { T: 0.9, duty: 0.6, ph: TRI, lift: 0.08 }
      break
    }
  }
  }
  plan()
  const b0 = B(t)
  S.root(b0.p.clone().add(v3(0, y, 0)), b0.yaw)
  S.rot('hips', rot[0], rot[1], rot[2]); S.rot('spine', rot[0] * 0.5, rot[1] * 0.5, 0)
  S.pose.sc.spine = puff
  plan()
  spiderGait(S, t, B, E164_WALK, gait)
  // 前腿跟身体走（爪目标在身体坐标里给）
  const toBody = (p: THREE.Vector3) => S.pt('root', p)
  e164Arm(S, 'L', toBody(tL), xL); e164Arm(S, 'R', toBody(tR), xR)
  S.rot('eye', eye[0], eye[1], 0); S.pose.sc.eye = eyeS / puff
  S.rot('mouth', 0.15 * kick + 0.04 * Math.max(0, Math.sin(t * 1.3)), 0, 0)
  for (let i = 0; i < 4; i++) S.spring('tuft' + i, o, 40, 4, 3, 0.55, kick > 0.01 ? qe(-0.6 * kick * Math.cos((i / 4) * TAU), 0, 0.6 * kick * Math.sin((i / 4) * TAU)) : undefined)
  // 道具：杯 / 摇酒壶 / 抹布 / 酒液
  const clawPt = (Sd: string) => S.tail(`leg${Sd}1d`)
  const gOn = glassOn as THREE.Vector3 | null, sOn = shakerOn as THREE.Vector3 | null
  if (gOn) S.prop('glass', gOn.clone(), qe(0, b0.yaw, 0), glassAnchor.toArray() as V3)
  else S.chk('右爪-杯', clawPt('R'), S.pt('legR1d', glassAnchor.clone().add(v3(0, 0.075, -0.02))), 0.02)
  if (sOn) S.prop('shaker', sOn, new THREE.Quaternion(), shakerAnchor.toArray() as V3)
  else S.chk('左爪-摇酒壶', clawPt('L'), S.pt('legL1d', shakerAnchor.clone().add(v3(0.02, 0.07, -0.03))), 0.02)
  if (rag) { const rA = tv(S.R.J.legR1Knee).add(v3(0.09, 0, 0)), c = clawPt('L'); S.prop('rag', c.clone().add(v3(0, -0.02, 0)), S.Wb('legL1d'), rA.toArray() as V3) }
  if (stream) { const top = S.pt('legL1d', shakerAnchor.clone().add(v3(0, 0.19, 0))); S.prop('stream', top, new THREE.Quaternion(), [0, 0, 0], 1) } else S.prop('stream', v3(0, 0, 0), new THREE.Quaternion(), [0, 0, 0], 0)
  return S.finish(o, b0.p)
}

// ================= 背景员工（荷官 / 侍应 / 保安，共用人形片段）=================
function crewPose(who: StaffWho) {
  return (clip: string, t: number, o: StaffAnimOpts): StaffPose => {
    const S = new Solver(who), waiter = who === 'waiter', dealer = who === 'dealer', guard = who === 'guard'
    let B: BodyFn = still(), H: HumanBody = {}, gait = STAND, swing = 0
    let lw: THREE.Vector3 | null = null, rw: THREE.Vector3 | null = null, lO: [THREE.Vector3, THREE.Vector3] | null = null, rO: [THREE.Vector3, THREE.Vector3] | null = null
    let lc = [0.15, 0.2, 0.25, 0.3, 0.35], rc = [0.15, 0.2, 0.25, 0.3, 0.35], tray = waiter ? 1 : 0, tray2 = false, wheel = 0, reels = 0, lever = 0
    let card: THREE.Vector3 | null = null, cardHeld = false
    const trayHand = () => { const sh = S.P('upperArmL'); return sh.clone().add(v3(0.05, -0.36, 0.3)) }
  const plan = () => {
    switch (clip) {
      case 'idle': H = { sway: Math.sin(t * TAU / 4), hy: 0.25 * Math.sin(t * TAU / 8), hp: 0.03 * Math.sin(t * TAU / 4), roll: 0.02 * Math.sin(t * TAU / 4) }; swing = 0.05 * Math.sin(t * TAU / 4); break
      case 'walk': {
        const T = 1.05, v = 0.66, u = (t / T) % 1
        B = (tt) => ({ p: v3(0, 0, v * tt), yaw: 0 }); gait = { T, duty: [0.62, 0.62], ph: [0, 0.5], lift: [0.06, 0.06], toeOff: 0.3 } as typeof gait
        H = { bob: -0.078 + 0.012 * Math.cos(u * TAU * 2), twist: 0.1 * Math.sin(u * TAU), roll: 0.02 * Math.sin(u * TAU), lean: 0.03 }
        swing = -Math.sin(u * TAU)
        break
      }
      case 'work': {
        if (dealer) {
          const u = t % 3.2, take = win(u, 0.2, 0.6, 0.6, 0.8), fl = sm((u - 0.8) / 0.5), ret = win(u, 1.5, 1.9, 2.8, 3.2)
          H = { lean: 0.12, hp: 0.25, hy: -0.1 * fl }
          rw = S.P('upperArmR').add(v3(0.06, -0.38, 0.3)); rO = [v3(0.2, 0, 1), v3(0, 1, 0)]; rc = [0.5, 0.25, 0.3, 0.35, 0.4]
          const deckTop = () => { const h = handInfo(S, 'R'); return h.pc.clone().addScaledVector(h.palm, 0.012) }
          const tgt = v3(-0.05 - 0.15 * fl, 0.92, 0.45 + 0.35 * fl)
          lw = S.P('upperArmL').add(v3(-0.12, -0.33, 0.33)).lerp(S.P('upperArmL').add(v3(-0.08 - 0.05 * fl, -0.33, 0.3 + 0.06 * fl)), Math.max(fl * (1 - ret), 0)); lO = [v3(-0.4, -0.3, 1), v3(-0.2, -1, 0)]; lc = [0.55, 0.6, 0.9, 1.0, 1.0]
          cardHeld = u > 0.55 && u < 1.25; card = cardHeld ? null : (u >= 1.25 ? tgt : null)
          void deckTop; void take
        } else if (waiter) {
          const u = t % 3.2, reach = win(u, 0.1, 0.5, 0.9, 1.3), flick = sm((u - 0.7) / 0.2)
          H = { hp: -0.05 * reach, hr: 0.08 * reach }
          wheel = u < 0.8 ? 0 : 7 * (1 - Math.exp(-(u - 0.8) * 1.2)) / 1.2
          rw = S.pt('head', S.rest('head').add(v3(-0.17, 0.1 - 0.08 * flick, 0.17))).lerp(S.P('upperArmR').add(v3(-0.05, -0.53, 0.03)), 1 - reach); rO = [v3(0.3, 0.6 - 1.2 * flick, 0.6), v3(0.9, 0, -0.3)]; rc = [0.2, 0.15, 0.2, 0.25, 0.3]
        } else if (guard) {
          const scan = Math.sin(t * TAU / 3.2), pull = win(t, 1.0, 1.25, 1.45, 1.8)
          H = { hy: 0.6 * scan, twist: 0.2 * scan, hp: -0.03 }
          rw = S.pt('head', S.rest('head').add(v3(0.17, 0.32 - 0.12 * pull, 0.04))).lerp(S.P('upperArmR').add(v3(-0.1, -0.5, -0.12)), 1 - win(t, 0.7, 1.0, 1.8, 2.1)); rc = [0.8, 1.1, 1.2, 1.25, 1.3]
          lw = S.P('upperArmL').add(v3(-0.1, -0.5, -0.14)); lc = [0.8, 1.1, 1.2, 1.25, 1.3]
          lever = pull; reels = t > 1.3 ? (t - 1.3) * 18 * Math.exp(-(t - 1.3) * 0.8) : 0
          rO = null
          if (win(t, 0.7, 1.0, 1.8, 2.1) < 0.99) rw = rw!.clone(); else rO = [v3(0, 1, 0.2), v3(-1, 0, 0)]
        }
        break
      }
      case 'serve': {
        const up = win(t, 0.2, 0.8, 2.8, 3.4), pres = win(t, 1.0, 1.5, 2.2, 2.8)
        tray = 1; tray2 = !waiter
        H = { lean: 0.08 * pres, hp: 0.12 * pres, hy: 0.1 * pres }
        lw = trayHand().add(v3(0, 0.18 * up, 0.15 * pres))
        rw = S.P('upperArmR').add(v3(-0.05, -0.53, 0.03)).lerp(S.P('upperArmR').add(v3(0.0, -0.32, 0.35)), pres); rO = pres > 0.01 ? [v3(0.3, -0.1, 1), v3(0.2, 1, 0)] : null; rc = [-0.2, -0.3, -0.25, -0.2, -0.15]
        break
      }
      case 'refuse': {
        const k = win(t, 0.1, 0.4, 1.7, 2.1), wv = Math.sin((t - 0.4) * TAU * 2.2) * win(t, 0.4, 0.5, 1.4, 1.7)
        H = { hy: 0.3 * Math.sin((t - 0.3) * TAU * 2) * win(t, 0.3, 0.5, 1.3, 1.6), lean: -0.06 * k }
        rw = S.P('upperArmR').add(v3(-0.05, -0.53, 0.03)).lerp(S.P('upperArmR').add(v3(-0.08 + 0.06 * wv, -0.12, 0.3)), k)
        rO = k > 0.01 ? [v3(0.15 * wv, 1, 0.15).normalize().lerp(v3(0, -1, 0), 1 - k), v3(0, 0.1, 1).lerp(v3(1, 0, 0.3), 1 - k)] : null; rc = [-0.3, -0.4, -0.35, -0.3, -0.25]
        break
      }
    }
  }
  plan()
    const b0 = B(t)
    S.root(b0.p.clone().add(v3(0, H.bob ?? -0.015, 0)), b0.yaw)
    humanTorso(S, H, t)
    lw = rw = null; plan(); if (waiter && !lw) lw = trayHand()
    humanLegs(S, t, B, gait)
    const shL = S.P('upperArmL'), shR = S.P('upperArmR')
    const restW = (sh: THREE.Vector3, s: number, sw: number) => sh.clone().add(v3(s * 0.04, -0.495, -0.04 + 0.13 * sw))
    S.ik('upperArmL', 'foreArmL', 'handL', lw ?? restW(shL, 1, swing), v3(0.3, -0.3, -1), [0, 0, -1], 'armL')
    S.ik('upperArmR', 'foreArmR', 'handR', rw ?? restW(shR, -1, dealer && clip !== 'refuse' ? 0 : -swing), v3(-0.3, -0.3, -1), [0, 0, -1], 'armR')
    const fwd = v3(0, 0, 1).applyAxisAngle(v3(0, 1, 0), b0.yaw)
    if (tray) orientHand(S, 'L', fwd.clone().add(v3(0.25, 0, 0)).normalize(), v3(0, 1, 0)); else if (lO) orientHand(S, 'L', lO[0], lO[1])
    if (rO) orientHand(S, 'R', rO[0], rO[1])
    else if (dealer && !rw) orientHand(S, 'R', v3(0.15, -0.6, 0.8).normalize(), v3(0.3, 0.8, 0.1).normalize())
    if (tray) lc = [0.05, -0.15, -0.15, -0.15, -0.1]
    curl(S, 'L', lc); curl(S, 'R', rc)
    // 道具
    if (tray) {
      const h = handInfo(S, 'L'), c = h.pc.clone().add(v3(0, 0.025, 0)).addScaledVector(h.dir, 0.03)
      const anchor = tv(makeStaffRig('waiter').J.handTipL).add(v3(0.02, 0.02, 0.12))
      S.prop(tray2 ? 'tray2' : 'tray', c, qe(0, b0.yaw, 0), tray2 ? [0, 0, 0] : anchor.toArray() as V3)
      S.chk('掌心-托盘', h.pc, c.clone().add(v3(0, -0.025, 0)).addScaledVector(h.dir, -0.03), 0.01)
    }
    if (dealer) {
      const h = handInfo(S, 'R'), dq = basisQ(v3(0, 1, 0), v3(0, 0, 1), h.palm, h.dir), dp = h.pc.clone().addScaledVector(h.palm, 0.012)
      const anchor = tv(S.R.J.handTipR).add(v3(0, 0.03, 0.035))
      S.prop('cards', dp, dq, anchor.toArray() as V3); S.chk('掌心-牌堆', h.pc, dp, 0.02)
      if (clip === 'work') {
        if (cardHeld) { const pp = pinchPt(S, 'L'); S.prop('card', pp, basisQ(v3(0, 1, 0), v3(0, 0, 1), handInfo(S, 'L').palm, handInfo(S, 'L').dir), [0, 0, 0]) }
        else S.prop('card', card ?? dp, qe(0, 0.3, 0), [0, 0, 0], card ? 1 : 0)
      }
    }
    if (waiter) S.rot('wheel', 0, 0, wheel)
    if (guard) { for (let i = 1; i <= 3; i++) S.rot('reel' + i, reels * (1 + 0.2 * i), 0, 0); S.rot('lever', 0.9 * lever, 0, 0) }
    for (const h of ['hemL', 'hemR']) S.spring(h, o, 80, 9, 2, 0.25)
    return S.finish(o, b0.p)
  }
}

// ---------------- 入口 ----------------
type PoseFn = (clip: string, t: number, o: StaffAnimOpts) => StaffPose
const POSE: Partial<Record<StaffWho, PoseFn>> = { louie: louiePose, prosthetic: prosPose, billy: billyPose, bartender: e164Pose, dealer: crewPose('dealer'), waiter: crewPose('waiter'), guard: crewPose('guard') }
export function registerStaffPose(who: StaffWho, f: PoseFn) { POSE[who] = f }
export function staffPose(who: StaffWho, clip: string, t: number, o: StaffAnimOpts = {}): StaffPose {
  const f = POSE[who]; if (!f) throw new Error('no anim for ' + who)
  const info = STAFF_CLIPS[who][clip]; if (!info) throw new Error(`no clip ${who}.${clip}`)
  return f(clip, info.loop ? t : Math.min(t, info.dur), o)
}

// ---------------- 写回骨骼（浏览器 / check 共用）----------------
interface RigLike { who: StaffWho; def: StaffRigDef; bones: Record<string, THREE.Bone>; body: THREE.SkinnedMesh }
const PROP_GEO: Record<string, () => THREE.Object3D> = {
  chips: () => { const g = new THREE.Group(); const cols = ['#c8261e', '#1f4fb8', '#e8b818', '#1d7a3a']; for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.0034, 18), new THREE.MeshStandardMaterial({ color: j % 2 ? cols[i] : '#efe6d4', roughness: 0.45 })); m.position.set((i - 1.5) * 0.042, 0.0017 + j * 0.0034, 0); g.add(m) } return g },
  card: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.063, 0.0012, 0.088), [new THREE.MeshStandardMaterial({ color: '#f2ece0', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#f2ece0', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#b0142a', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#f2ece0', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#f2ece0', roughness: 0.5 })]); m.position.y = 0.0006; const g = new THREE.Group(); g.add(m); return g },
  deck: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.063, 0.02, 0.088), new THREE.MeshStandardMaterial({ color: '#b0142a', roughness: 0.5 })); const g = new THREE.Group(); g.add(m); return g },
  stream: () => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.14, 8), new THREE.MeshStandardMaterial({ color: '#c0183a', roughness: 0.1 })); m.position.y = -0.07; g.add(m); return g },
  tray2: () => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.18, 0.012, 32), new THREE.MeshStandardMaterial({ color: '#d0a24c', metalness: 1, roughness: 0.25 })); m.position.y = 0.006; g.add(m); const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.038, 0.09, 18), new THREE.MeshPhysicalMaterial({ color: '#f2fbff', roughness: 0.05, transparent: true, opacity: 0.35 })); gl.position.set(0.06, 0.057, 0); g.add(gl); return g },
}
/** 把姿态写回骨骼；道具：pose.props 里有的覆盖到 face 组坐标，否则仍随骨 */
export function applyStaffPose(group: THREE.Object3D, P: StaffPose) {
  const rig = (group.userData.staff ?? group.children.map((c) => c.userData.staff).find(Boolean)) as RigLike
  const def = rig.def, qs: THREE.Quaternion[] = []
  def.BONES.forEach((d, i) => {
    qs[i] = new THREE.Quaternion(P.W[i * 4], P.W[i * 4 + 1], P.W[i * 4 + 2], P.W[i * 4 + 3])
    const b = rig.bones[d.name], rest = b.userData.rest as { p: THREE.Vector3 }
    const qp = d.parent >= 0 ? qs[d.parent] : new THREE.Quaternion()
    b.quaternion.copy(qp.clone().invert().multiply(qs[i]))
    b.position.copy(rest.p)
    const o = P.off[d.name]; if (o) b.position.add(tv(o).applyQuaternion(qp.clone().invert()))
    b.scale.setScalar(P.sc[d.name] ?? 1)
  })
  const face = rig.body.parent!
  const st = (face.userData.animProps ??= {}) as Record<string, THREE.Object3D>
  for (const [name, pp] of Object.entries(P.props)) {
    let m = st[name]
    if (!m) {
      const attached = face.getObjectByName('prop-' + name)
      if (attached) { m = attached; m.userData.home = { parent: attached.parent, pos: attached.position.clone() } } else if (PROP_GEO[name]) m = PROP_GEO[name](); else continue
      st[name] = m
    }
    if (m.parent !== face) { m.parent?.remove(m); face.add(m) }
    m.matrixAutoUpdate = false
    const anchor = tv(pp.a), q = new THREE.Quaternion(...pp.q)
    // 网格顶点在静止模型坐标（已挂道具）或以原点为锚（动画道具）；矩阵 = T(p) · R(q) · T(−anchor)
    m.matrix.compose(tv(pp.p), q, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z))
    m.visible = (pp.vis ?? 1) > 0.5; m.matrixWorldNeedsUpdate = true
  }
  for (const [name, m] of Object.entries(st)) if (!P.props[name]) {
    const home = m.userData.home as { parent: THREE.Object3D; pos: THREE.Vector3 } | undefined
    if (home) { if (m.parent !== home.parent) { m.parent?.remove(m); home.parent.add(m) } m.position.copy(home.pos); m.quaternion.identity(); m.matrixAutoUpdate = true; m.visible = true } // 挂骨道具回到骨上
    else m.visible = false
  }
}
const DYN = new WeakMap<object, { dyn: StaffDyn; t: number; clip: string }>()
/** 便捷：按时间推进（自动维护弹簧状态；换片段 / 回跳时重置） */
export function animateStaff(group: THREE.Object3D, clip: string, t: number, opts: StaffAnimOpts = {}) {
  const rig = (group.userData.staff ?? group.children.map((c) => c.userData.staff).find(Boolean)) as RigLike
  let d = DYN.get(group); if (!d || d.clip !== clip || t < d.t) { d = { dyn: newStaffDyn(), t, clip }; DYN.set(group, d) }
  const dt = Math.max(1 / 240, Math.min(0.05, t - d.t || 1 / 60)); d.t = t
  const P = staffPose(rig.who, clip, t, { ...opts, dyn: d.dyn, dt }); applyStaffPose(group, P); return P
}
/** 预跑 pre 秒（30 fps）再取 t 帧（截图 / 关键帧用：弹簧进入稳态） */
export function animateStaffPreroll(group: THREE.Object3D, clip: string, t: number, opts: StaffAnimOpts = {}, pre = 0.8) {
  DYN.delete(group); const t0 = Math.max(0, t - pre)
  const loop = STAFF_CLIPS[((group.userData.staff ?? group.children.map((c) => c.userData.staff).find(Boolean)) as RigLike).who][clip].loop
  const start = loop ? t - pre : t0
  for (let x = start; x < t; x += 1 / 30) animateStaff(group, clip, x, opts)
  return animateStaff(group, clip, t, opts)
}
export const staffRootMotion = (who: StaffWho, clip: string, t0: number, t1: number) => { const a = staffPose(who, clip, t0).off.root ?? [0, 0, 0], b = staffPose(who, clip, t1).off.root ?? [0, 0, 0]; return [b[0] - a[0], b[2] - a[2]] }
export { cl as _cl, sm as _sm, win as _win, kf as _kf, v3 as _v3, qe as _qe, qaa as _qaa, humanTorso as _humanTorso, humanLegs as _humanLegs, still as _still, STAND as _STAND, place as _place }
export type { BodyFn, HumanBody }
export const _BALL = { c: BILLY_BALL_C, r: BILLY_BALL_R }, _GRIP = PROS_GRIP_OFF
