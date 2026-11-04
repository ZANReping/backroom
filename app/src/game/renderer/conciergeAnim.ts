// [concierge stage 2] 看门人（Entity 131 / The Concierge）阶段 2 动画：程序化关键帧 / 曲线（不接 AI）。
// 用法：
//   const an = createConciergeAnimator(group)          // group = buildConciergeMesh() 的返回（userData.concierge）
//   an.play('phone')                                   // 片段间 0.2 s 交叉混合（blinkTeleport 冻结当前姿态）
//   an.update(dt, { target: [x, y, z] })               // 每帧；opts 见 ConciergeAnimOpts
// 无状态入口（预览 / 截图 / AI 自己管时间）：
//   animateConcierge(rig, clip, t, opts)               // = applyConciergePose(rig, conciergePose(clip, t, opts), opts)
//   conciergePose(clip, t, opts) → ConciergePose        // 纯函数；mixConciergePose(a, b, k) 线性混合（手部四元数 nlerp）
// 结构：
//   · 姿态量全部在 root 骨空间（root 下、+Z 正面、+Y 上、地面 y=0、+X = 角色左侧），可线性混合。
//   · 躯干 / 颈 / 头 / 下颌 / 耳：欧拉角（YXZ）直接写骨骼（静止骨骼朝向都是单位旋转，所以局部角 = 相对静止的角）。
//   · 手臂：两骨 IK（腕目标 t + 肘极向 pole），上臂 / 前臂按「骨向 + 弯曲平面法线」成对旋转（肘是真铰链）；前臂扭转 tw，
//     可选 aim：自动扭前臂让前臂眼那一面朝向目标点；手的朝向 = 世界（root 空间）四元数 hq 与「跟随前臂 + 局部欧拉 wr」按 hw 混合；
//     hs 权重让目标 / 手朝向改用头骨空间（th / hqh：话筒贴耳、茶杯到嘴、捧金属啃，跟着点头走）。
//   · 腿（反关节羊腿）：蹄着地点 p + 蹄俯仰 ph（正 = 蹄尖朝下）+ 蹄偏航 yw；大腿 / 小腿 / 跖骨三段平面 IK，
//     跖骨角与大腿角联动（a3 = a3r + 0.85·(a1 − a1r)，跗关节始终向后弯），系部 + 蹄按 ph 定向、平贴地面；
//     步态的支撑相蹄点在 root 空间里以身体速度后移 → 世界里不动（脚锁定）。CONCIERGE_CLIPS[x].speed / stride 给 AI 对齐根位移。
//   · 眼：每只眼眼睑 = 组开度（头 / 左臂 / 右臂，>1 睁大）×（1 − 随机眨眼），眨眼按 seed 的确定性随机，头部四眼互不同步；
//     眼球朝 gaze 注视点转（限幅）。
//   · 二阶：耳朵（头部线加速度 + 角速度驱动弹簧）、领带（随胸口前倾自然下垂 + 摆动，不进衬衫）、颈毛发片（着色器按发梢权重位移）；
//     状态在 rig 上（__cdyn），dt 推进；预览用 preroll 先跑 0.6 s 得到确定的帧。
//   · 道具：handset（右手握把，贴耳时听筒朝耳）、key（捏在拇指 / 食指间，牌子下垂）、cup（右手捏把，杯口朝上可倾）+ saucer（拆到左手）、
//     rope（绳卷挂腰 / 捆人时到左手）+ strand（两手间的绳段）、rag（手帕，右手）、metal（银勺，右手）；全部按姿态里的 0/1 显隐。
import * as THREE from 'three'
import type { ConciergeRig, CArm, CLeg } from './conciergeMesh'
import { HANDS, J, side, type V3 } from './conciergeRig'
import { createCord, updateCord, type CordState, type CordCapsule } from './conciergeCord'

export type ConciergeClip = 'idle' | 'phone' | 'giveKey' | 'walk' | 'run' | 'armWatch' | 'blinkTeleport' | 'talk' | 'trip' | 'bind' | 'drag' | 'stuffLift' | 'pullRope' | 'wipeHands' | 'teaBreak' | 'gnawMetal'
export interface ConciergeClipInfo { dur: number; loop: boolean; zh: string; speed?: number; stride?: number }
export const CONCIERGE_CLIPS: Record<ConciergeClip, ConciergeClipInfo> = {
  idle: { dur: 6.0, loop: true, zh: '前台待机' },
  phone: { dur: 6.4, loop: false, zh: '接电话' },
  giveKey: { dur: 4.6, loop: false, zh: '取 437 钥匙递出' },
  walk: { dur: 0.92, loop: true, zh: '行走', speed: 1.35, stride: 1.242 },
  run: { dur: 0.6, loop: true, zh: '奔跑', speed: 4.33, stride: 2.6 },
  armWatch: { dur: 3.4, loop: false, zh: '抬前臂「看」' },
  blinkTeleport: { dur: 1.6, loop: false, zh: '眨眼瞬移' },
  talk: { dur: 3.2, loop: true, zh: '搭话' },
  trip: { dur: 4.4, loop: false, zh: '摔倒爬起' },
  bind: { dur: 4.2, loop: false, zh: '蹲下捆人' },
  drag: { dur: 1.4, loop: true, zh: '单手拖人倒退', speed: -0.64, stride: 0.9 },
  stuffLift: { dur: 3.6, loop: false, zh: '塞进送菜升降梯' },
  pullRope: { dur: 1.4, loop: true, zh: '拉升降梯绳' },
  wipeHands: { dur: 3.2, loop: false, zh: '擦手' },
  teaBreak: { dur: 6.0, loop: false, zh: '茶歇' },
  gnawMetal: { dur: 1.6, loop: true, zh: '啃金属' },
}
/** blinkTeleport：此刻之后 AI 把实体挪到新位置（全身眼闭着、姿态冻结的窗口 0.35–0.8 s 中点） */
export const CONCIERGE_TELEPORT_AT = 0.58
/** 预览默认的前台布局（root 空间）：柜台组 position、台式电话机座、钥匙墙上 437 号的挂钩（空格 r2 c3） */
export const CONCIERGE_DESK = { desk: [0.35, 0, 0.5] as V3, phone: [-0.25, 1.1, 0.55] as V3, top: 1.1, hook: [-0.315, 1.61, -0.43] as V3 }
/** 预览默认的送菜升降梯（root 空间，正对他）：stuffLift 时开口在前方；pullRope 时拉绳在正前方 */
/** 预览布局下的前台电话（柜台 2.4 × 0.6 m，见 conciergeProps.buildConciergeDeskMesh） */
export const CONCIERGE_PHONE_DESK: ConciergePhoneDesk = { base: [-0.25, 1.1, 0.55], top: 1.1, rect: [0.35 - 1.25, 0.35 + 1.25, 0.5 - 0.36, 0.5 + 0.36] }
/** 底座插口（底座中心 → 插口：后侧偏右，高 3 cm） */
const PHONE_SOCKET: V3 = [-0.06, 0.03, -0.07]
/** 话筒尾端出线点（handset 局部：话筒杯一端、握把下沿） */
const HANDSET_CORD_EXIT = new THREE.Vector3(0, -0.118, 0.012)
const PHONE_CLIPS = new Set<ConciergeClip>(['phone', 'giveKey'])
export const CONCIERGE_DUMBWAITER = { stuff: [0.0, 0, 0.92] as V3, pull: [0.675, 0, 0.42] as V3, rotY: Math.PI }

type Q4 = [number, number, number, number]
export interface CArmPose {
  t: V3; th: V3; hs: number; pole: V3; tw: number
  hq: Q4; hqh: Q4; hw: number; wr: V3
  curl: number[]; clav: V3; aim: V3; aimW: number
  /** 捏合点（拇指 / 食指之间）要到的位置：g = root 空间、gh = 头空间（按 hs 混合），gw 权重（需 hw=1） */
  g: V3; gh: V3; gw: number
}
export interface CLegPose { p: V3; ph: number; yw: number }
export interface ConciergePose {
  root: V3; rootR: V3; hipsP: V3; hipsR: V3; spine: V3; chest: V3; neck: V3; head: V3
  jaw: number; earL: V3; earR: V3; tie: V3
  L: CArmPose; R: CArmPose; legL: CLegPose; legR: CLegPose
  eyeH: number; eyeL: number; eyeR: number; blink: number; gaze: V3; gazeW: number
  handset: number; key: number; cup: number; saucer: number; rope: number; strand: number; rag: number; metal: number
  cupTilt: number; shake: number
  /** 茶杯放在左手茶碟上（右手捏杯把的捏合点自动对到杯把） */
  cupOn: number
  /** 茶杯在嘴前（杯沿贴下唇、按 cupTilt 朝脸倾；右手捏合点自动对到杯把） */
  cupMouth: number
}
export interface ConciergeAnimOpts {
  /** 目标点（root 空间）：giveKey 递出方向、armWatch / talk 注视与前臂眼对准点 */
  target?: V3
  /** armWatch 用哪条前臂（默认 R，5 只眼） */
  side?: 'L' | 'R'
  /** idle / talk 是否在柜台后（默认 idle 在、talk 不在） */
  desk?: boolean
  /** 随机种子（眨眼、耳抖） */
  seed?: number
  /** blinkTeleport：闭眼冻结的姿态（动画器自动给当前姿态） */
  from?: ConciergePose
  /** 全局时间（眨眼用；默认 = 片段时间） */
  time?: number
  /** 二阶摆动步长（秒）；0 / 省略 = 不推进二阶 */
  dt?: number
  /** 2.1：前台电话（模型空间 = face 组局部）：给出时画底座 → 话筒的螺旋线，话筒不在手里时画台上的话筒。null = 不画。
   *  animateConcierge / 动画器在 phone / giveKey / 柜台后 idle 下省略时默认用 CONCIERGE_PHONE_DESK（预览布局） */
  phoneDesk?: ConciergePhoneDesk | null
}
/** 前台电话：底座中心（台面上，模型空间）、台面高、台面矩形 [xmin, xmax, zmin, zmax] */
export interface ConciergePhoneDesk { base: V3; top: number; rect: [number, number, number, number] }

// ---------- 小工具 ----------
const TAU = Math.PI * 2
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
const c01 = (x: number) => clamp(x, 0, 1)
const ss = (x: number) => { const t = c01(x); return t * t * (3 - 2 * t) }
const ramp = (t: number, a: number, b: number) => ss((t - a) / (b - a))
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI))
const frac = (x: number) => x - Math.floor(x)
const hash = (n: number) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453)
const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2])
const nz = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

// ---------- 静止量 ----------
const REST_HAND_FLEX: Record<string, number[]> = { thumb: [0.05, 0.18, 0.22], index: [0.22, 0.38, 0.22], middle: [0.28, 0.44, 0.24], ring: [0.34, 0.48, 0.26], pinky: [0.4, 0.52, 0.28] }
const FIST: Record<string, number[]> = { thumb: [0.4, 0.6, 0.5], index: [1.4, 1.6, 1.0], middle: [1.45, 1.6, 1.0], ring: [1.45, 1.6, 1.0], pinky: [1.5, 1.6, 1.0] }
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const
const SH = (s: number) => side(J.shoulder, s), EL = (s: number) => side(J.elbow, s), WR = (s: number) => side(J.wrist, s)
const LU = Math.hypot(...(J.elbow.map((v, i) => v - J.shoulder[i]) as V3)), LF = Math.hypot(...(J.wrist.map((v, i) => v - J.elbow[i]) as V3))
/** 腿（矢状面 (z 前, y 下)）：段长 + 静止方向角（从竖直向下量起，向前为正） */
const LEG = (() => {
  const seg = (a: V3, b: V3) => { const dz = b[2] - a[2], dy = a[1] - b[1]; return { L: Math.hypot(dz, dy), a: Math.atan2(dz, dy) } }
  const contact: V3 = [J.fetlock[0], 0, 0.015]
  const s1 = seg(J.hip, J.knee), s2 = seg(J.knee, J.hock), s3 = seg(J.hock, J.fetlock), s4 = seg(J.fetlock, contact)
  return { L1: s1.L, a1: s1.a, L2: s2.L, a2: s2.a, L3: s3.L, a3: s3.a, L4: s4.L, a4: s4.a, c0: [0, contact[1] - J.fetlock[1], contact[2] - J.fetlock[2]] as V3, contactZ: contact[2], K: 0.85 }
})()
/** 大屈膝时大腿后侧垫骨的压扁比例（屈膝 ≥0.95 rad 时后侧厚度 × (1 − K)） */
const KNEE_IN_K = 0.5
export const CONCIERGE_FOOT_REST = (s: number): V3 => [J.fetlock[0] * s, 0, LEG.contactZ]

// ---------- 四元数工具（Q4 = [x, y, z, w]）----------
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _m4 = new THREE.Matrix4()
const qArr = (q: THREE.Quaternion): Q4 => [q.x, q.y, q.z, q.w]
const Q_ID: Q4 = [0, 0, 0, 1]
/** 把一组正交基 (x0, y0) 旋到 (x1, y1) 的四元数（y 先对 x 正交化） */
function basisQuat(x0: V3, y0: V3, x1: V3, y1: V3): THREE.Quaternion {
  const mk = (x: V3, y: V3) => {
    const X = v3(x).normalize(), Y = v3(y); Y.addScaledVector(X, -Y.dot(X)).normalize(); const Z = new THREE.Vector3().crossVectors(X, Y)
    return new THREE.Matrix4().makeBasis(X, Y, Z)
  }
  const a = mk(x0, y0), b = mk(x1, y1)
  return new THREE.Quaternion().setFromRotationMatrix(b.multiply(a.transpose()))
}
/** 手朝向：手指方向 aDir、手背方向 dDir（root 或头空间）→ 手骨在该空间里的旋转 */
export function handQuat(s: number, aDir: V3, dDir: V3): Q4 {
  const F = HANDS[s].F
  return qArr(basisQuat(F.a, F.d, nz(aDir), nz(dDir)))
}
const eul = (x: number, y: number, z: number, o: THREE.EulerOrder = 'YXZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o))

// ---------- 姿态：默认 / 克隆 / 混合 ----------
function restArm(s: number): CArmPose {
  const S = SH(s), E = EL(s), W = WR(s)
  const d = nz([W[0] - S[0], W[1] - S[1], W[2] - S[2]]), e: V3 = [E[0] - S[0], E[1] - S[1], E[2] - S[2]]
  const k = e[0] * d[0] + e[1] * d[1] + e[2] * d[2]
  const pole = nz([e[0] - d[0] * k, e[1] - d[1] * k, e[2] - d[2] * k])
  return { t: [...W], th: [s * 0.12, -0.1, 0.1], hs: 0, pole, tw: 0, hq: [...Q_ID], hqh: [...Q_ID], hw: 0, wr: [0, 0, 0], curl: [0, 0, 0, 0, 0], clav: [0, 0, 0], aim: [0, 1.5, 2], aimW: 0, g: [...W], gh: [s * 0.1, -0.2, 0.2], gw: 0 }
}
export const CONCIERGE_REST: ConciergePose = {
  root: [0, 0, 0], rootR: [0, 0, 0], hipsP: [0, 0, 0], hipsR: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  jaw: 0, earL: [0, 0, 0], earR: [0, 0, 0], tie: [0, 0, 0],
  L: restArm(1), R: restArm(-1), legL: { p: CONCIERGE_FOOT_REST(1), ph: 0, yw: 0 }, legR: { p: CONCIERGE_FOOT_REST(-1), ph: 0, yw: 0 },
  eyeH: 1, eyeL: 1, eyeR: 1, blink: 1, gaze: [0, 1.6, 3], gazeW: 0,
  handset: 0, key: 0, cup: 0, saucer: 0, rope: 1, strand: 0, rag: 0, metal: 0, cupTilt: 0, shake: 0, cupOn: 0, cupMouth: 0,
}
function deepClone<T>(x: T): T {
  if (Array.isArray(x)) return x.slice() as unknown as T
  if (x && typeof x === 'object') { const o: any = {}; for (const k in x) o[k] = deepClone((x as any)[k]); return o }
  return x
}
export const cloneConciergePose = (p: ConciergePose) => deepClone(p)
function mixAny(a: any, b: any, k: number, key = ''): any {
  if (typeof a === 'number') return a + (b - a) * k
  if (Array.isArray(a)) {
    if ((key === 'hq' || key === 'hqh') && a.length === 4) {
      const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], sg = d < 0 ? -1 : 1
      const o = a.map((v: number, i: number) => v + (b[i] * sg - v) * k), l = Math.hypot(o[0], o[1], o[2], o[3]) || 1
      return o.map((v: number) => v / l)
    }
    return a.map((v: number, i: number) => v + (b[i] - v) * k)
  }
  const o: any = {}; for (const kk in a) o[kk] = mixAny(a[kk], b[kk], k, kk); return o
}
/** 两个姿态线性混合（k=0 → a，1 → b） */
export function mixConciergePose(a: ConciergePose, b: ConciergePose, k: number): ConciergePose {
  if (k <= 0) return deepClone(a)
  if (k >= 1) return deepClone(b)
  return mixAny(a, b, k)
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends number[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }
type Part = DeepPartial<ConciergePose>
function over(base: ConciergePose, p: Part): ConciergePose {
  const o = deepClone(base) as any
  const rec = (dst: any, src: any) => { for (const k in src) { const v = src[k]; if (v === undefined) continue; if (v && typeof v === 'object' && !Array.isArray(v)) rec(dst[k], v); else dst[k] = Array.isArray(v) ? v.slice() : v } }
  rec(o, p); return o
}
/** 关键帧：[[t, partial], ...]，每帧都是 base 上的覆盖；段间 smoothstep */
function keys(t: number, base: ConciergePose, ks: [number, Part][]): ConciergePose {
  if (t <= ks[0][0]) return over(base, ks[0][1])
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const [t0, a] = ks[i - 1], [t1, b] = ks[i]
    return mixConciergePose(over(base, a), over(base, b), ss((t - t0) / (t1 - t0)))
  }
  return over(base, ks[ks.length - 1][1])
}
/** 同上，但每一帧给完整姿态（已经算好的） */
function keysP(t: number, ks: [number, ConciergePose][]): ConciergePose {
  if (t <= ks[0][0]) return deepClone(ks[0][1])
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) { const [t0, a] = ks[i - 1], [t1, b] = ks[i]; return mixConciergePose(a, b, ss((t - t0) / (t1 - t0))) }
  return deepClone(ks[ks.length - 1][1])
}

// ---------- 常用手型 / 手朝向 ----------
const CURL_RELAX = [0.1, 0.15, 0.15, 0.2, 0.25]
const CURL_FIST = [0.85, 1, 1, 1, 1]
const CURL_FLAT = [-0.2, -0.75, -0.75, -0.7, -0.6]
const CURL_GRIP = [0.55, 0.85, 0.9, 0.9, 0.9] // 握把（话筒 / 绳）
const CURL_PINCH = [0.45, 0.62, 0.5, 0.55, 0.6] // 拇指 + 食指捏
const CURL_SPREAD = [-0.6, -0.9, -0.9, -0.9, -0.9]
/** 手掌朝下、手指朝前（略内收），用于按台面 */
const HQ_DESK = (s: number) => handQuat(s, [-s * 0.18, -0.16, 1], [s * 0.12, 1, 0.12])
/** 掌心朝上、手指朝前（托茶碟 / 递东西） */
const HQ_PALMUP = (s: number) => handQuat(s, [-s * 0.2, 0.02, 1], [s * 0.15, -1, 0.0])

// ---------- 头空间里的几个点（头骨原点、静止头朝向；单位 m）----------
/** 右耳侧（话筒听筒中心应到的位置；头骨空间） */
const HEAD_EAR_R: V3 = [-0.125, 0.015, 0.035]
/** 嘴前（门齿前方） */
const HEAD_MOUTH: V3 = [0, -0.272, 0.18]
/** 话筒的握法：右手掌中握把，听筒端在拇指侧、听筒朝掌心外（handset 局部 → 手骨局部） */
const HS_GRIP = (() => { const F = HANDS[-1].F; return v3(F.o).addScaledVector(v3(F.a), 0.068).addScaledVector(v3(F.d), -0.028).sub(v3(side(J.wrist, -1))) })()
const HS_Q = (() => { const F = HANDS[-1].F; return basisQuat([0, 1, 0], [0, 0, 1], F.r, [-F.d[0], -F.d[1], -F.d[2]]) })()
/** 贴耳：手指朝前上、手背朝外、掌心朝头 → 听筒（拇指侧）朝上后方贴在耳侧 */
const PHONE_HQH = handQuat(-1, [0.12, 0.62, 0.78], [-1, 0.12, 0.08])
const PHONE_TH: V3 = (() => {
  const q = new THREE.Quaternion(...PHONE_HQH), ear = HS_Q.clone()
  const off = new THREE.Vector3(0, 0.112, 0.055).applyQuaternion(ear).add(HS_GRIP).applyQuaternion(q)
  return [HEAD_EAR_R[0] - off.x, HEAD_EAR_R[1] - off.y, HEAD_EAR_R[2] - off.z]
})()

// ---------- 姿态底子 ----------
const BASE = CONCIERGE_REST
/** 自由站立：双手自然垂、略向前，手指放松 */
const STAND: ConciergePose = over(BASE, {
  hipsP: [0, -0.008, 0], chest: [-0.02, 0, 0], neck: [0.04, 0, 0], head: [0.02, 0, 0],
  L: { t: [0.27, 0.975, 0.05], curl: CURL_RELAX }, R: { t: [-0.27, 0.975, 0.05], curl: CURL_RELAX },
})
/** 柜台后：双手按在台面（腕高 = 台面 + 掌厚）、肩略前、头微低看向前方 */
const deskHands = (dz = 0): Part => ({
  L: { t: [0.19, CONCIERGE_DESK.top + 0.032, 0.28 + dz], pole: [0.75, -0.25, -0.6], hq: HQ_DESK(1), hw: 1, curl: [0.1, -0.15, -0.1, -0.05, 0.0] },
  R: { t: [-0.19, CONCIERGE_DESK.top + 0.032, 0.28 + dz], pole: [-0.75, -0.25, -0.6], hq: HQ_DESK(-1), hw: 1, curl: [0.1, -0.15, -0.1, -0.05, 0.0] },
})
const DESK: ConciergePose = over(STAND, { hipsP: [0, -0.012, 0.01], hipsR: [0.05, 0, 0], spine: [0.03, 0, 0], chest: [0.03, 0, 0], neck: [0.0, 0, 0], head: [-0.05, 0, 0], ...deskHands() })

// ---------- 步态 ----------
interface GaitSpec { D: number; duty: number; lift: number; liftPeak?: number; center: number; width: number; phSwing: number; dir?: number; heel?: number }
/** walk / run 的平均髋高偏移（2.1：原 −0.05 / −0.105） */
const W_HIP = -0.015, R_HIP = -0.05
/** 蹄尖在着地点前方的距离（抬蹄跟时绕蹄尖转） */
const HOOF_TIP = 0.03
/** u 0..1；左脚相位 0、右脚 0.5；支撑相蹄点以身体速度后移（D·duty 在 duty 时间内）→ 世界不动 */
function gaitLegs(P: ConciergePose, u: number, G: GaitSpec) {
  const dir = G.dir ?? 1
  for (const [leg, s, off] of [[P.legL, 1, 0], [P.legR, -1, 0.5]] as [CLegPose, number, number][]) {
    const ph = frac(u + off), sweep = G.D * G.duty
    let z: number, y = 0, pitch = 0
    if (ph < G.duty) { const k = ph / G.duty; z = dir * sweep * (0.5 - k); if (G.heel) { pitch = G.heel * ss((k - 0.55) / 0.45); y = HOOF_TIP * Math.sin(pitch); z += dir * HOOF_TIP * (1 - Math.cos(pitch)) } } // 支撑末段蹄跟抬起（绕蹄尖转，蹄尖不动）
    else {
      const k = (ph - G.duty) / (1 - G.duty), pk = G.liftPeak ?? 0.5
      const e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k) // 摆动：加减速
      z = dir * sweep * (-0.5 + e)
      const kk = k < pk ? 0.5 * (k / pk) : 0.5 + 0.5 * ((k - pk) / (1 - pk)) // 峰值前移
      y = G.lift * Math.sin(Math.PI * kk)
      const carry = (G.heel ?? 0) * (1 - ss(k / 0.3))
      pitch = Math.max(G.phSwing * Math.sin(Math.PI * Math.min(1, kk * 1.15)), carry)
      y += HOOF_TIP * Math.sin(carry); z += dir * HOOF_TIP * (1 - Math.cos(carry))
    }
    leg.p = [s * G.width, y, LEG.contactZ + G.center + z]; leg.ph = pitch
  }
}

// ---------- 片段 ----------
const AIM_L: V3 = nz([0.85, 0.05, 0.4]), AIM_R: V3 = nz([-0.9, 0.0, 0.15]) // 前臂眼那一面的法线（静止姿态，root 空间）

export function conciergePose(clip: ConciergeClip, t: number, o: ConciergeAnimOpts = {}): ConciergePose {
  const C = CONCIERGE_CLIPS[clip]
  t = C.loop ? frac(t / C.dur) * C.dur : clamp(t, 0, C.dur)
  const u = t / C.dur, seed = o.seed ?? 1
  switch (clip) {
    case 'idle': return idlePose(t, u, seed, o.desk !== false)
    case 'phone': return phonePose(t, seed)
    case 'giveKey': return giveKeyPose(t, o.target)
    case 'walk': return walkPose(u)
    case 'run': return runPose(u)
    case 'armWatch': return armWatchPose(t, o.side ?? 'R', o.target ?? [0.35, 1.45, 2.4])
    case 'blinkTeleport': return blinkTeleportPose(t, o.from ?? idlePose(0, 0, seed, false))
    case 'talk': return talkPose(t, u, o.desk === true, o.target)
    case 'trip': return tripPose(t)
    case 'bind': return bindPose(t)
    case 'drag': return dragPose(u)
    case 'stuffLift': return stuffPose(t)
    case 'pullRope': return pullPose(u)
    case 'wipeHands': return wipePose(t)
    case 'teaBreak': return teaPose(t)
    case 'gnawMetal': return gnawPose(t, u)
  }
}

// 1. idle：柜台后；呼吸、重心轻换、手指轻敲台面、耳抖、头轻转
function idlePose(t: number, u: number, seed: number, desk: boolean): ConciergePose {
  const P = deepClone(desk ? DESK : over(STAND, { L: { t: [0.07, 1.06, 0.2], pole: [1, -0.3, -0.4], hq: handQuat(1, [-1, -0.1, 0.25], [0, 0.2, 1]), hw: 1, curl: [0.2, 0.3, 0.35, 0.4, 0.45] }, R: { t: [-0.04, 1.03, 0.22], pole: [-1, -0.3, -0.4], hq: handQuat(-1, [1, -0.15, 0.25], [0, 0.2, 1]), hw: 1, curl: [0.2, 0.3, 0.35, 0.4, 0.45] } }))
  const br = Math.sin(u * TAU * 2) // 呼吸：3 s 一次
  P.chest[0] -= 0.014 * br; P.spine[0] -= 0.006 * br; P.hipsP[1] += 0.002 * br
  P.L.clav = [0, 0, 0.012 * br]; P.R.clav = [0, 0, -0.012 * br]
  const sh = Math.sin(u * TAU) // 重心：6 s 左右各一次
  P.hipsP[0] += 0.022 * sh; P.hipsR[2] += -0.025 * sh; P.spine[2] += 0.018 * sh; P.chest[2] += 0.012 * sh; P.neck[2] -= 0.02 * sh
  P.legL.p = [0.11, 0, LEG.contactZ + 0.02]; P.legR.p = [-0.1, 0, LEG.contactZ - 0.03]
  // 头：慢扫 + 一次轻歪头
  const look = bump(u, 0.32, 0.6)
  P.head[1] += 0.22 * look * Math.sin(u * TAU * 2.2) + 0.05 * Math.sin(u * TAU)
  P.head[2] += 0.12 * bump(u, 0.7, 0.9)
  // 耳抖（种子决定时刻）：左耳一次，右耳一次
  const fl = (a: number) => Math.sin(Math.max(0, Math.min(1, (t - a) / 0.32)) * Math.PI * 3) * Math.exp(-3 * Math.max(0, t - a)) * (t > a ? 1 : 0)
  const fa = 1.4 + hash(seed) * 0.8, fb = 4.0 + hash(seed + 3) * 0.9
  P.earL = [0.25 * fl(fa), 0, 0.35 * fl(fa)]; P.earR = [0.25 * fl(fb), 0, -0.35 * fl(fb)]
  if (desk) {
    // 右手手指轻敲：食指 → 小指依次抬落，两轮（2.2–3.0 s、4.6–5.4 s）
    for (const w0 of [2.2, 4.6]) for (let f = 1; f <= 4; f++) {
      const a = w0 + (f - 1) * 0.12, k = bump(t, a, a + 0.2)
      P.R.curl[f] -= 0.7 * k
    }
    P.L.curl[1] -= 0.5 * bump(t, 0.6, 0.85)
  }
  P.gaze = [0, 1.55, 3]; P.gazeW = 0.4
  return P
}

// 2. phone：伸手拿话筒 → 贴耳 → 低头听、点头 → 放回
function phonePose(t: number, seed: number): ConciergePose {
  const ph = CONCIERGE_DESK.phone
  const cradle: V3 = [ph[0], ph[1] + 0.105, ph[2]]
  const reachHq = handQuat(-1, [0.15, -0.35, 1], [0, 1, -0.3])
  const reachT: V3 = [cradle[0] + 0.0, cradle[1] + 0.035, cradle[2] - 0.085]
  // 贴耳：手背朝外（-x），手指朝后上方绕过耳侧；听筒朝头
  const ear: Part = { R: { hs: 1, th: PHONE_TH, hqh: PHONE_HQH, hw: 1, pole: [-0.5, -1, -0.2], curl: CURL_GRIP, clav: [0, 0.05, -0.08] } }
  const lean: Part = { hipsR: [0.17, 0, 0], spine: [0.06, 0.05, 0], chest: [0.04, 0.08, 0], head: [0.05, 0.1, 0] }
  const P = keys(t, DESK, [
    [0, {}],
    [0.6, { ...lean, R: { t: reachT, hq: reachHq, hw: 1, pole: [-0.9, -0.3, -0.4], curl: [-0.1, -0.2, -0.2, -0.2, -0.2] } }],
    [0.78, { ...lean, R: { t: reachT, hq: reachHq, hw: 1, pole: [-0.9, -0.3, -0.4], curl: CURL_GRIP }, handset: 1 }],
    [1.05, { hipsR: [0.08, 0, 0], R: { t: [-0.28, 1.45, 0.25], hq: handQuat(-1, [0.2, 0.5, 0.8], [-1, 0.2, 0.2]), hw: 1, pole: [-0.6, -1, -0.2], curl: CURL_GRIP }, handset: 1 }],
    [1.5, { ...ear, head: [0.12, 0.1, 0.1], neck: [0.08, 0, 0.05], handset: 1 }],
    [4.5, { ...ear, head: [0.16, 0.12, 0.14], neck: [0.1, 0, 0.06], handset: 1 }],
    [4.95, { hipsR: [0.08, 0, 0], R: { t: [-0.28, 1.45, 0.25], hq: handQuat(-1, [0.2, 0.5, 0.8], [-1, 0.2, 0.2]), hw: 1, pole: [-0.6, -1, -0.2], curl: CURL_GRIP }, handset: 1 }],
    [5.4, { ...lean, R: { t: reachT, hq: reachHq, hw: 1, pole: [-0.9, -0.3, -0.4], curl: CURL_GRIP }, handset: 1 }],
    [5.55, { ...lean, R: { t: reachT, hq: reachHq, hw: 1, pole: [-0.9, -0.3, -0.4], curl: [-0.1, -0.2, -0.2, -0.2, -0.2] }, handset: 0 }],
    [6.4, {}],
  ])
  // 听：偶尔点头 + 下颌轻动（「嗯」），耳朵朝话筒那侧动一下
  const listen = ramp(t, 1.5, 1.8) * (1 - ramp(t, 4.4, 4.7))
  const nod = bump(t, 2.2, 2.55) + bump(t, 3.35, 3.65) + 0.7 * bump(t, 3.75, 4.0)
  P.head[0] += 0.13 * nod * listen; P.neck[0] += 0.04 * nod * listen
  P.jaw = 0.07 * listen * Math.max(0, Math.sin(t * 7.3 + seed)) * bump(t, 2.8, 3.3)
  P.earR = [0.15 * listen, 0, -0.25 * listen]
  // 左手：听电话时手指轻敲两下
  P.L.curl[1] -= 0.6 * (bump(t, 2.9, 3.05) + bump(t, 3.15, 3.3)); P.L.curl[2] -= 0.5 * (bump(t, 3.0, 3.15) + bump(t, 3.25, 3.4))
  P.gaze = [0.2, 1.3, 1.5]; P.gazeW = 0.5 * listen
  return P
}

// 3. giveKey：转身面向钥匙墙 → 左手取 437 → 转回 → 越过柜台递出 → 松手
function turnFeet(P: ConciergePose, yawRoot: number, yL: number, yR: number, liftL: number, liftR: number) {
  // 每只脚的世界偏航 yX；位置 = 绕原点转 yX 的静止脚点，再换回 root 空间（root 偏航 yawRoot）
  for (const [leg, s, yf, lf] of [[P.legL, 1, yL, liftL], [P.legR, -1, yR, liftR]] as [CLegPose, number, number, number][]) {
    const r = CONCIERGE_FOOT_REST(s), a = yf - yawRoot, c = Math.cos(a), sn = Math.sin(a)
    leg.p = [r[0] * c + r[2] * sn, 0.09 * lf, -r[0] * sn + r[2] * c]; leg.yw = a; leg.ph = 0.5 * lf
  }
}
function giveKeyPose(t: number, target?: V3): ConciergePose {
  const PI = Math.PI
  const yaw = PI * (ramp(t, 0.35, 1.05) - ramp(t, 2.0, 2.7))
  // 437 钥匙挂钩：转身后在左前上方
  const hk = CONCIERGE_DESK.hook
  const hookL: V3 = [-hk[0], hk[1], -hk[2]] // 偏航 π 后的 root 空间
  const give: V3 = target ?? [0.1, 1.3, 0.64]
  const hookHq = handQuat(1, [-0.15, 0.55, 1], [0.9, 0.35, -0.1])
  const reach = (k: number): Part => ({ L: { t: [0.25, 1.35, 0.25], g: [hookL[0], hookL[1] - 0.005 * k, hookL[2] - 0.015], gw: 1, hq: hookHq, hw: 1, pole: [1, -0.7, -0.4], curl: k ? CURL_PINCH : [-0.3, -0.4, -0.25, 0.1, 0.3], clav: [0, -0.07, 0.12] }, chest: [-0.06, 0.06, 0], head: [-0.3, 0.06, 0], spine: [-0.02, 0.04, 0] })
  // 递出：掌心朝上偏内、拇指捏着钥匙圈，牌子垂在手下
  const giveHq = handQuat(1, [-0.25, 0.1, 1], [0.6, -0.75, 0.0])
  const giving = (open: number): Part => ({
    hipsR: [0.13, 0.06, 0], spine: [0.05, 0.06, 0], chest: [0.05, 0.1, 0], head: [0.04, -0.12, 0.06],
    L: { g: [give[0], give[1], give[2]], gw: 1, hq: giveHq, hw: 1, pole: [1, -0.6, -0.4], curl: open ? [-0.45, -0.7, -0.5, -0.3, -0.2] : CURL_PINCH, clav: [0, -0.1, 0] },
    R: { t: [-0.2, CONCIERGE_DESK.top + 0.032, 0.27], hq: HQ_DESK(-1), hw: 1, pole: [-0.75, -0.25, -0.6], curl: [0.1, -0.15, -0.1, -0.05, 0.0] },
  })
  const P = keys(t, DESK, [
    [0, {}],
    [0.35, { L: { t: [0.25, 1.05, 0.12], hw: 0, curl: CURL_RELAX }, R: { t: [-0.26, 1.0, 0.08], hw: 0, curl: CURL_RELAX } }],
    [1.05, { L: { t: [0.27, 1.12, 0.12], hw: 0, curl: CURL_RELAX }, R: { t: [-0.27, 0.98, 0.05], hw: 0, curl: CURL_RELAX }, head: [-0.2, 0, 0] }],
    [1.45, { ...reach(0) }],
    [1.62, { ...reach(1), key: 1 }],
    [2.0, { L: { t: [0.22, 1.32, 0.24], hq: handQuat(1, [-0.3, 0.4, 1], [0.85, 0.4, 0]), hw: 1, pole: [1, -0.6, -0.3], curl: CURL_PINCH }, key: 1, head: [-0.05, 0, 0] }],
    [2.7, { L: { t: [0.18, 1.25, 0.25], hq: handQuat(1, [-0.4, 0.2, 1], [0.8, -0.2, -0.1]), hw: 1, pole: [1, -0.6, -0.3], curl: CURL_PINCH }, R: { t: [-0.27, 0.98, 0.05], hw: 0, curl: CURL_RELAX }, key: 1, head: [0.0, 0.1, 0] }],
    [3.3, { ...giving(0), key: 1 }],
    [3.6, { ...giving(0), key: 1 }],
    [3.8, { ...giving(1), key: 0 }],
    [4.6, {}],
  ])
  P.rootR = [0, yaw, 0]
  // 转身脚步：右脚先迈、左脚跟上（转回时反过来）
  const st = (a: number, b: number) => ramp(t, a, b) * PI
  const yR = st(0.35, 0.7) * 0.55 + st(0.75, 1.05) * 0.45 - (st(2.0, 2.35) * 0.55 + st(2.4, 2.7) * 0.45)
  const yL = st(0.55, 0.95) - st(2.2, 2.6)
  turnFeet(P, yaw, yL, yR, bump(t, 0.55, 0.95) + bump(t, 2.2, 2.6), bump(t, 0.35, 0.7) + bump(t, 0.75, 1.05) + bump(t, 2.0, 2.35) + bump(t, 2.4, 2.7))
  P.gaze = t < 2.2 ? [hookL[0], hookL[1], hookL[2]] : [give[0], give[1] + 0.2, give[2] + 1]; P.gazeW = 0.6
  return P
}

// 4. walk / run：反关节步态；身体前倾；跑时屈肘摆臂
function walkPose(u: number): ConciergePose {
  const P = deepClone(STAND)
  // 2.1：腿接近伸直、身体挺拔（体面的前台）——步频略快、步幅略短，支撑末段抬蹄跟（蹄尖锁地，跖骨伸展），髋只压 ~1.5 cm
  gaitLegs(P, u, { D: CONCIERGE_CLIPS.walk.stride!, duty: 0.6, lift: 0.085, liftPeak: 0.42, center: 0.03, width: 0.09, phSwing: 0.7, heel: 0.45 })
  const s1 = Math.sin(u * TAU), bob = Math.cos((u - 0.31) * TAU * 2)
  P.hipsP = [0.01 * Math.sin((u - 0.06) * TAU), W_HIP + 0.01 * bob, 0.0]
  P.hipsR = [0.04, 0.08 * s1, -0.03 * Math.sin((u - 0.1) * TAU)]
  P.spine = [0.0, -0.045 * s1, 0.018 * Math.sin((u - 0.1) * TAU)]; P.chest = [-0.03, -0.08 * s1, 0.01]
  P.neck = [0.0, 0.03 * s1, 0]; P.head = [-0.04 - 0.01 * bob, 0.02 * s1, 0]
  const sw = (s: number) => -s * s1 // 左腿前 → 右臂前
  for (const [A, s] of [[P.L, 1], [P.R, -1]] as [CArmPose, number][]) {
    const k = sw(s)
    A.t = [s * 0.26, 0.985 + 0.03 * Math.max(0, k), 0.04 + 0.17 * k]; A.pole = [s * 0.4, -0.2, -1]
    A.wr = [0.1 + 0.12 * Math.max(0, k), 0, 0]; A.curl = [0.2, 0.25, 0.3, 0.35, 0.4]
  }
  P.tie = [0, 0, 0.02 * s1]; P.earL = [0, 0, 0.06 * bob]; P.earR = [0, 0, -0.06 * bob]
  return P
}
function runPose(u: number): ConciergePose {
  const P = deepClone(STAND)
  // 2.1：髋平均只压 ~5 cm（原 10.5），支撑末段蹄跟抬起蹬地；前倾收一点，不蹲伏
  gaitLegs(P, u, { D: CONCIERGE_CLIPS.run.stride!, duty: 0.32, lift: 0.28, liftPeak: 0.4, center: 0.0, width: 0.07, phSwing: 1.0, heel: 0.6 })
  const s1 = Math.sin(u * TAU), bob = -Math.cos((u - 0.16) * TAU * 2) // 支撑中段最低
  P.hipsP = [0.008 * s1, R_HIP + 0.025 * bob, 0.02]
  P.hipsR = [0.2, 0.14 * s1, -0.03 * Math.sin((u - 0.1) * TAU)]
  P.spine = [0.06, -0.07 * s1, 0]; P.chest = [0.05, -0.15 * s1, 0]
  P.neck = [-0.08, 0.05 * s1, 0]; P.head = [-0.26 - 0.03 * bob, 0.03 * s1, 0]
  for (const [A, s] of [[P.L, 1], [P.R, -1]] as [CArmPose, number][]) {
    const k = -s * s1
    // 屈肘约 90°：前摆时手到胸前高，后摆时手到臀后
    A.t = [s * (0.2 - 0.03 * Math.max(0, k)), 1.08 + 0.13 * k, 0.07 + 0.3 * k]
    A.pole = [s * 0.3, -0.6, -1]; A.wr = [0.15, 0, 0]; A.curl = CURL_FIST; A.clav = [0, 0.04 * k, 0]
  }
  P.tie = [-0.25 - 0.06 * bob, 0, 0.05 * s1]; P.earL = [0, 0.25, 0.1 * bob]; P.earR = [0, -0.25, -0.1 * bob]
  P.jaw = 0.06
  return P
}

// 5. armWatch：抬起前臂横在胸前，前臂眼那一面朝目标，前臂眼睁大、头部四眼闭上
function armWatchPose(t: number, sd: 'L' | 'R', target: V3): ConciergePose {
  const s = sd === 'L' ? 1 : -1
  const A = sd === 'L' ? 'L' : 'R'
  // 前臂横在胸前偏外：腕在对侧（内侧）、肘在外侧，前臂高度 ~1.38
  const raised: Part = {
    [A]: { t: [-s * 0.02, 1.52, 0.47], pole: [s * 1, -0.45, 0.05], hw: 0, wr: [0.0, 0, s * 0.15], curl: [0.3, 0.45, 0.5, 0.55, 0.6], aim: target, aimW: 1, clav: [0, -s * 0.08, s * 0.12] },
    chest: [-0.02, -s * 0.12, 0], head: [0.1, s * 0.35, 0.05], neck: [0.05, s * 0.1, 0],
  }
  const P = keys(t, STAND, [[0, {}], [0.5, raised], [2.75, raised], [3.4, {}]])
  // 跟踪小修正
  const hold = ramp(t, 0.4, 0.6) * (1 - ramp(t, 2.7, 2.9))
  P[A].t[1] += 0.012 * Math.sin(t * 3.1) * hold; P[A].t[0] += 0.01 * Math.sin(t * 2.3) * hold
  P.eyeH = 1 - ramp(t, 0.35, 0.55) * (1 - ramp(t, 2.75, 2.95))
  if (A === 'L') P.eyeL = 1 + 0.28 * hold; else P.eyeR = 1 + 0.28 * hold
  P.gaze = target; P.gazeW = hold
  return P
}

// 6. blinkTeleport：全身眼同时闭上 → 姿态冻结（0.35–0.8 s，AI 在 CONCIERGE_TELEPORT_AT 挪位置）→ 睁眼时已是新姿态，带微小抖动
const ARRIVE: ConciergePose = over(STAND, {
  hipsP: [0, 0.005, 0], hipsR: [0.04, 0, 0], chest: [0.03, 0, -0.03], neck: [0.12, 0, 0.1], head: [-0.06, 0.08, 0.32],
  L: { t: [0.25, 1.0, 0.16], pole: [0.6, -0.2, -0.8], curl: CURL_SPREAD, wr: [0.25, 0, 0] }, R: { t: [-0.25, 1.0, 0.16], pole: [-0.6, -0.2, -0.8], curl: CURL_SPREAD, wr: [0.25, 0, 0] },
  legL: { p: [0.09, 0, LEG.contactZ - 0.02] }, legR: { p: [-0.09, 0, LEG.contactZ + 0.03] }, earL: [0, 0.2, 0.25], earR: [0, -0.2, -0.25],
})
function blinkTeleportPose(t: number, from: ConciergePose): ConciergePose {
  const close = ramp(t, 0.0, 0.3)
  let P: ConciergePose
  if (t < 0.8) {
    P = deepClone(from)
    // 闭眼时的一下「僵住」：肩微耸、头微收
    const k = ramp(t, 0.05, 0.3)
    P.L.clav = [P.L.clav[0], P.L.clav[1], P.L.clav[2] + 0.04 * k]; P.R.clav = [P.R.clav[0], P.R.clav[1], P.R.clav[2] - 0.04 * k]; P.neck[0] += 0.04 * k
    P.eyeH = P.eyeL = P.eyeR = 1 - close; P.blink = 0
  } else {
    P = deepClone(ARRIVE)
    const op = ramp(t, 0.82, 1.05)
    P.eyeH = P.eyeL = P.eyeR = op * 1.12; P.blink = 0
    P.shake = 1 - ramp(t, 0.85, 1.6)
  }
  return P
}

// 7. talk：搭话；下颌开合（jaw ≥ 0.3 时抬头 0.25–0.3 rad），右手摊掌指方向、左手轻抬
const jawLift = (j: number) => -0.29 * ss((j - 0.08) / 0.22)
function talkPose(t: number, u: number, desk: boolean, target?: V3): ConciergePose {
  const base = desk ? DESK : STAND
  // 摊掌指向「宴会」方向（右前方）：手到胸高、掌心朝上、手指朝外前
  const gest: Part = { R: { t: [-0.4, 1.24, 0.3], pole: [-1, -0.5, -0.4], hq: handQuat(-1, [-0.75, 0.12, 0.65], [0.05, -1, 0.1]), hw: 1, curl: [-0.4, -0.7, -0.55, -0.4, -0.3], clav: [0, 0.05, -0.05] }, chest: [0, 0.12, 0], head: [0, -0.25, 0.06], neck: [0, -0.08, 0] }
  const mid: Part = { R: { t: [-0.2, 1.13, 0.3], pole: [-1, -0.6, -0.3], hq: handQuat(-1, [0.4, 0.15, 1], [0.15, -1, 0.3]), hw: 1, curl: [-0.1, -0.3, -0.2, -0.1, 0.0] }, L: { t: [0.21, 1.1, 0.3], pole: [1, -0.6, -0.3], hq: handQuat(1, [-0.35, 0.15, 1], [-0.15, -1, 0.3]), hw: 1, curl: [0, -0.2, -0.1, 0, 0.1] } }
  const P = desk ? deepClone(base) : keys(t, base, [[0, mid], [0.5, mid], [1.0, gest], [1.9, gest], [2.5, mid], [3.2, mid]])
  // 音节：几段开合，包络在句间收住
  const env = bump(u, 0.02, 0.48) + bump(u, 0.55, 0.95) * 0.9
  const syl = Math.max(0, Math.sin(t * 13.5)) * (0.55 + 0.45 * Math.sin(t * 3.7 + 1)) ** 2
  P.jaw = 0.02 + 0.36 * env * syl
  P.head[0] += jawLift(P.jaw); P.neck[0] -= 0.04 * env
  P.head[2] += 0.06 * Math.sin(u * TAU)
  P.earL = [0, -0.1, 0.12]; P.earR = [0, 0.1, -0.12] // 耳朵向前竖一点（专注）
  P.gaze = target ?? [0, 1.6, 2.2]; P.gazeW = 0.7
  return P
}

// 8. trip：被绊 → 向右侧倒地 → 躺一下 → 撑起 → 跪起 → 站起整理领带
function tripPose(t: number): ConciergePose {
  const lieHips: V3 = [-0.42, -0.8, 0.42]
  const lying: Part = {
    hipsP: lieHips, hipsR: [0.12, 0.25, 1.3], spine: [0.08, 0.1, 0.12], chest: [0.05, 0.1, 0.08], neck: [0.1, 0, -0.25], head: [-0.05, 0.1, -0.35],
    L: { t: [-0.55, 0.08, 0.86], pole: [0.2, 1, 0.2], hq: handQuat(1, [-0.5, -0.1, 0.8], [0, 1, 0]), hw: 1, curl: [0.2, 0.3, 0.35, 0.4, 0.45] },
    R: { t: [-1.22, 0.092, 0.72], pole: [-0.3, 0.6, 0.8], hq: handQuat(-1, [-1, -0.05, 0.25], [0, 1, 0]), hw: 1, curl: CURL_RELAX }, // 2.1：腕抬 1.7 cm，手指不入地
    legL: { p: [-0.42, 0.24, 0.68], ph: 0.35 }, legR: { p: [-0.55, 0.06, 0.52], ph: 0.2 },
    earL: [0, 0.2, 0.4], earR: [0, -0.4, 0.3],
  }
  const knees: Part = { // 四肢着地：跗关节着地、双手撑地
    hipsP: [0, -0.56, 0.0], hipsR: [1.2, 0, 0], spine: [0.3, 0, 0], chest: [0.1, 0, 0], neck: [-0.3, 0, 0], head: [-0.65, 0, 0],
    L: { t: [0.21, 0.058, 0.52], pole: [0.3, 0, -1], hq: handQuat(1, [-0.1, -0.05, 1], [0.1, 1, 0]), hw: 1, curl: [0, -0.4, -0.4, -0.4, -0.4] },
    R: { t: [-0.21, 0.058, 0.52], pole: [-0.3, 0, -1], hq: handQuat(-1, [0.1, -0.05, 1], [-0.1, 1, 0]), hw: 1, curl: [0, -0.4, -0.4, -0.4, -0.4] },
    legL: { p: [0.16, 0.0, -0.12], ph: 0.0, yw: 0.2 }, legR: { p: [-0.16, 0.0, -0.12], ph: 0.0, yw: -0.2 },
  }
  const crouch: Part = { // 单膝起：右脚踩前
    hipsP: [0, -0.42, 0.05], hipsR: [0.55, 0, 0], spine: [0.12, 0, 0], chest: [0.05, 0, 0], head: [-0.3, 0, 0],
    L: { t: [0.24, 0.62, 0.42], pole: [0.5, 0, -1], curl: CURL_RELAX }, R: { t: [-0.24, 0.62, 0.42], pole: [-0.5, 0, -1], curl: CURL_RELAX },
    legL: { p: [0.13, 0.02, -0.18], ph: 0.55 }, legR: { p: [-0.12, 0, 0.32], ph: 0 },
  }
  const P = keys(t, STAND, [
    [0, {}],
    [0.18, { hipsR: [0.25, 0, 0.12], chest: [-0.15, 0, 0], head: [-0.3, 0, 0], L: { t: [0.38, 1.25, 0.25], pole: [1, -0.4, 0], curl: CURL_SPREAD }, R: { t: [-0.38, 1.2, 0.3], pole: [-1, -0.4, 0], curl: CURL_SPREAD }, legR: { p: [-0.1, 0.1, -0.25], ph: 0.8 }, legL: { p: [0.1, 0, 0.12] } }],
    [0.42, { hipsP: [-0.18, -0.38, 0.22], hipsR: [0.45, 0.15, 0.7], chest: [-0.05, 0, 0.1], head: [-0.25, 0, -0.2], L: { t: [0.15, 0.9, 0.55], pole: [1, 0.3, 0], curl: CURL_SPREAD }, R: { t: [-0.65, 0.45, 0.45], pole: [-0.5, 0.5, 0.4], curl: CURL_SPREAD }, legL: { p: [0.05, 0.15, 0.35], ph: 0.6 }, legR: { p: [-0.3, 0.12, 0.05], ph: 0.6 } }],
    [0.7, lying],
    [1.6, { ...lying, head: [-0.02, 0.12, -0.42] }],
    [1.78, { ...lying, hipsP: [-0.32, -0.6, 0.3], hipsR: [0.42, 0.18, 0.85], legR: { p: [-0.45, 0.12, 0.2], ph: 0.3 }, legL: { p: [-0.25, 0.16, 0.25], ph: 0.4 }, head: [-0.2, 0.06, -0.3] }], // 2.1：翻身中间帧（右腿抬离地面）
    [1.95, { hipsP: [-0.22, -0.47, 0.18], hipsR: [0.75, 0.1, 0.42], spine: [0.2, 0.05, 0.05], chest: [0.08, 0, 0], neck: [-0.1, 0, -0.1], head: [-0.4, 0, -0.15],
      L: { t: [-0.12, 0.3, 0.6], pole: [0.3, 0.2, -1], hq: handQuat(1, [-0.3, -0.05, 1], [0.05, 1, 0]), hw: 1, curl: [0, -0.4, -0.4, -0.4, -0.4] },
      R: { t: [-0.5, 0.065, 0.5], pole: [-0.5, 0.2, -1], hq: handQuat(-1, [0.2, -0.05, 1], [-0.05, 1, 0]), hw: 1, curl: [0, -0.4, -0.4, -0.4, -0.4] },
      legL: { p: [-0.02, 0.04, -0.22], ph: 0.5 }, legR: { p: [-0.3, 0.07, -0.18], ph: 0.4 } }], // 2.1：髋 / 右蹄抬高，过渡帧右腿不入地
    [2.3, knees],
    [2.6, knees],
    [3.25, crouch],
    [3.85, { hipsR: [0.06, 0, 0], L: { t: [0.06, 1.42, 0.17], pole: [1, -0.4, -0.2], hq: handQuat(1, [-1, 0.3, 0.1], [0, 0.2, 1]), hw: 1, curl: CURL_PINCH }, head: [0.12, 0, 0] }],
    [4.1, { L: { t: [0.05, 1.47, 0.16], pole: [1, -0.4, -0.2], hq: handQuat(1, [-1, 0.3, 0.1], [0, 0.2, 1]), hw: 1, curl: CURL_PINCH }, head: [0.1, 0, 0] }],
    [4.4, {}],
  ])
  P.eyeH = 1 - 0.7 * bump(t, 0.5, 1.2)
  return P
}

// 9. bind：蹲下，左手绳卷，双手绕着地上的人缠绳，最后左右一拉收紧
const CROUCH: Part = {
  hipsP: [0, -0.45, -0.06], hipsR: [0.74, 0, 0], spine: [0.28, 0, 0], chest: [0.12, 0, 0], neck: [-0.12, 0, 0], head: [0.05, 0, 0],
  legL: { p: [0.2, 0, 0.12], ph: 0, yw: 0.25 }, legR: { p: [-0.2, 0, 0.12], ph: 0, yw: -0.25 },
}
function bindPose(t: number): ConciergePose {
  const c: V3 = [0, 0.36, 0.56]
  const wind = ramp(t, 0.9, 1.1) * (1 - ramp(t, 3.1, 3.3))
  const P = keys(t, STAND, [
    [0, { rope: 1 }],
    [0.4, { L: { t: [0.2, 1.0, 0.12], curl: CURL_GRIP }, rope: 2 }],
    [1.0, { ...CROUCH, L: { t: [c[0] + 0.08, c[1] + 0.05, c[2] - 0.02], pole: [1, 0.2, -0.6], curl: CURL_GRIP, hw: 0, wr: [0.6, 0, 0.3] }, R: { t: [c[0] - 0.08, c[1] + 0.05, c[2] - 0.02], pole: [-1, 0.2, -0.6], curl: CURL_PINCH, hw: 0, wr: [0.6, 0, -0.3] }, rope: 2, strand: 1 }],
    [3.1, { ...CROUCH, L: { t: [c[0] + 0.08, c[1] + 0.05, c[2] - 0.02], pole: [1, 0.2, -0.6], curl: CURL_GRIP, hw: 0, wr: [0.6, 0, 0.3] }, R: { t: [c[0] - 0.08, c[1] + 0.05, c[2] - 0.02], pole: [-1, 0.2, -0.6], curl: CURL_PINCH, hw: 0, wr: [0.6, 0, -0.3] }, rope: 2, strand: 1 }],
    [3.45, { ...CROUCH, hipsR: [0.55, 0, 0], L: { t: [c[0] + 0.3, c[1] + 0.12, c[2] - 0.1], pole: [1, 0.2, -0.6], curl: CURL_FIST, hw: 0, wr: [0.3, 0, 0.3] }, R: { t: [c[0] - 0.3, c[1] + 0.12, c[2] - 0.1], pole: [-1, 0.2, -0.6], curl: CURL_FIST, hw: 0, wr: [0.3, 0, -0.3] }, rope: 2, strand: 1 }],
    [3.65, { ...CROUCH, L: { t: [c[0] + 0.26, c[1] + 0.1, c[2] - 0.08], pole: [1, 0.2, -0.6], curl: CURL_FIST, hw: 0, wr: [0.3, 0, 0.3] }, R: { t: [c[0] - 0.26, c[1] + 0.1, c[2] - 0.08], pole: [-1, 0.2, -0.6], curl: CURL_FIST, hw: 0, wr: [0.3, 0, -0.3] }, rope: 2, strand: 1 }],
    [4.2, { ...CROUCH, L: { t: [c[0] + 0.12, c[1] + 0.1, c[2] - 0.08], pole: [1, 0.2, -0.6], curl: CURL_GRIP, hw: 0, wr: [0.4, 0, 0.3] }, R: { t: [c[0] - 0.12, c[1] + 0.1, c[2] - 0.08], pole: [-1, 0.2, -0.6], curl: CURL_RELAX, hw: 0, wr: [0.4, 0, -0.3] }, rope: 2, strand: 0 }],
  ])
  // 缠绕：两手绕中心反相画竖圈（绕过人的身体），每圈 0.7 s
  if (wind > 0) {
    const a = (t - 1.0) / 0.7 * TAU
    P.L.t[1] += 0.075 * Math.sin(a) * wind; P.L.t[2] += 0.07 * Math.cos(a) * wind
    P.R.t[1] -= 0.075 * Math.sin(a) * wind; P.R.t[2] -= 0.07 * Math.cos(a) * wind
    P.chest[1] += 0.04 * Math.sin(a) * wind; P.head[1] -= 0.03 * Math.sin(a) * wind
  }
  P.gaze = c; P.gazeW = 0.8; P.earL = [0, 0.15, 0]; P.earR = [0, -0.15, 0]
  return P
}

// 10. drag：倒退走，右手揪住人（低处），身体前倾后坐，左手平衡
function dragPose(u: number): ConciergePose {
  const P = deepClone(STAND)
  gaitLegs(P, u, { D: CONCIERGE_CLIPS.drag.stride!, duty: 0.7, lift: 0.07, liftPeak: 0.55, center: -0.04, width: 0.11, phSwing: 0.5, dir: -1 })
  const s1 = Math.sin(u * TAU), bob = Math.cos((u - 0.35) * TAU * 2)
  P.hipsP = [0.015 * s1, -0.27 + 0.012 * bob, -0.06]
  P.hipsR = [0.72, -0.18 + 0.05 * s1, 0.05]; P.spine = [0.14, -0.1, 0]; P.chest = [0.02, -0.14, 0.04]
  P.neck = [-0.15, 0.12, 0]; P.head = [-0.3, 0.2, 0]
  // 右手：每步一拽（拉向身体）
  const tug = Math.max(0, Math.sin((u - 0.1) * TAU * 2))
  P.R = { ...P.R, t: [-0.2, 0.66 + 0.035 * tug, 0.52 - 0.07 * tug], pole: [-0.7, 0.2, -1], hw: 0, wr: [0.35, 0, -0.2], curl: CURL_FIST, clav: [0, 0.12, 0.02] }
  P.L = { ...P.L, t: [0.3, 0.92 + 0.03 * s1, 0.18 - 0.08 * s1], pole: [0.6, -0.2, -1], curl: CURL_RELAX }
  P.earL = [0, 0.15, 0]; P.earR = [0, -0.15, 0]
  return P
}

// 11a. stuffLift：弯腰托起 → 抬到升降梯开口 → 双手往里推 → 直身
function stuffPose(t: number): ConciergePose {
  const lift = (z: number, y: number, open: number): Part => ({
    L: { t: [0.17, y, z], pole: [1, -0.3, -0.5], hq: handQuat(1, [-0.15, -0.2 + open * 0.9, 1], [0.95, 0.1 + open * 0.2, -open * 0.5]), hw: 1, curl: open > 0.5 ? CURL_FLAT : [0.1, 0.3, 0.35, 0.4, 0.45] },
    R: { t: [-0.17, y, z], pole: [-1, -0.3, -0.5], hq: handQuat(-1, [0.15, -0.2 + open * 0.9, 1], [-0.95, 0.1 + open * 0.2, -open * 0.5]), hw: 1, curl: open > 0.5 ? CURL_FLAT : [0.1, 0.3, 0.35, 0.4, 0.45] },
  })
  const P = keys(t, STAND, [
    [0, {}],
    [0.6, { ...lift(0.45, 0.72, 0), hipsP: [0, -0.2, -0.05], hipsR: [0.62, 0, 0], spine: [0.15, 0, 0], head: [-0.3, 0, 0] }],
    [0.8, { ...lift(0.45, 0.74, 0), hipsP: [0, -0.2, -0.05], hipsR: [0.6, 0, 0], spine: [0.15, 0, 0], head: [-0.3, 0, 0] }],
    [1.5, { ...lift(0.42, 0.96, 0), hipsP: [0, -0.07, 0.0], hipsR: [0.25, 0, 0], spine: [0.05, 0, 0], head: [-0.15, 0, 0] }],
    [2.3, { ...lift(0.62, 0.92, 1), hipsP: [0, -0.1, 0.12], hipsR: [0.38, 0, 0], spine: [0.08, 0, 0], head: [-0.15, 0, 0], legL: { p: [0.1, 0, LEG.contactZ + 0.28] } }],
    [2.75, { ...lift(0.72, 0.9, 1), hipsP: [0, -0.12, 0.17], hipsR: [0.45, 0, 0], spine: [0.1, 0, 0], head: [-0.12, 0, 0], legL: { p: [0.1, 0, LEG.contactZ + 0.28] } }],
    [3.6, { legL: { p: [0.1, 0, LEG.contactZ + 0.28] }, hipsP: [0, -0.01, 0.14] }],
  ])
  // 跨步的那只脚：1.6–2.1 s 抬起前移
  const st = bump(t, 1.6, 2.1)
  P.legL.p[1] += 0.1 * st; P.legL.ph += 0.6 * st
  if (t > 1.6 && t < 2.1) P.legL.p[2] = LEG.contactZ + 0.28 * ramp(t, 1.6, 2.1)
  P.gaze = [0, 0.9, 1.2]; P.gazeW = 0.6
  return P
}

// 11b. pullRope：双手交替拉升降梯绳（手到顶握紧 → 拉到胸下 → 松开 → 外侧回到顶）
function pullPose(u: number): ConciergePose {
  const P = deepClone(STAND)
  const rope: V3 = [0, 0, 0.3] // 绳在正前方 0.3 m（腕点比绳近一点）
  for (const [A, s, off] of [[P.L, 1, 0], [P.R, -1, 0.5]] as [CArmPose, number, number][]) {
    const ph = frac(u + off)
    let y: number, z: number, x: number, grip: number
    if (ph < 0.5) { const k = ss(ph / 0.5); y = 1.88 - 0.62 * k; z = rope[2]; x = s * 0.03; grip = 1 }
    else { const k = (ph - 0.5) / 0.5, e = ss(k); y = 1.26 + 0.62 * e; z = rope[2] - 0.08 * Math.sin(Math.PI * k); x = s * (0.03 + 0.07 * Math.sin(Math.PI * k)); grip = 1 - bump(k, 0.0, 0.95) }
    A.t = [x, y, z]; A.pole = [s * 1, -0.6, -0.3]
    A.hq = handQuat(s, [-s * 0.05, 1, 0.12], [s * 0.15, -0.05, -1]); A.hw = 1
    A.curl = CURL_GRIP.map((c, i) => c * grip + CURL_RELAX[i] * (1 - grip) - (1 - grip) * 0.4)
    A.clav = [0, 0, s * 0.08 * (y - 1.4)]
  }
  const pull = Math.abs(Math.sin(u * TAU * 2))
  P.hipsP = [0, -0.03 - 0.025 * pull, 0]; P.hipsR = [0.04 + 0.04 * pull, 0, 0]; P.chest = [0.05 * pull, 0.06 * Math.sin(u * TAU), 0]
  P.neck = [-0.1, 0, 0]; P.head = [-0.35, 0, 0]
  P.legL.p = [0.13, 0, LEG.contactZ + 0.05]; P.legR.p = [-0.12, 0, LEG.contactZ - 0.08]
  P.gaze = [0, 2.3, 0.4]; P.gazeW = 0.6; P.earL = [0, 0.1, 0.15]; P.earR = [0, -0.1, -0.15]
  return P
}

// 12. wipeHands：右手拿手帕擦左手掌心和手指，翻过来擦手背，折起收进口袋
function wipePose(t: number): ConciergePose {
  const Lpalm: Part = { L: { t: [0.08, 1.13, 0.33], pole: [1, -0.4, -0.3], hq: handQuat(1, [-0.55, 0.05, 1], [0.1, -1, 0.05]), hw: 1, curl: [-0.2, -0.4, -0.35, -0.3, -0.2] } }
  const Lback: Part = { L: { t: [0.08, 1.15, 0.33], pole: [1, -0.4, -0.3], hq: handQuat(1, [-0.55, 0.05, 1], [-0.1, 1, 0.05]), hw: 1, curl: [-0.1, -0.2, -0.15, -0.1, 0.0] } }
  const Rw = (dz: number, dy: number, back: boolean): Part => ({ R: { t: [-0.05 - dz * 0.4, 1.16 + dy + (back ? 0.04 : 0), 0.3 + dz], pole: [-1, -0.4, -0.3], hq: handQuat(-1, [0.6, -0.2, 1], [0.1, 1, 0.1]), hw: 1, curl: [0.3, 0.4, 0.45, 0.5, 0.55] } })
  const P = keys(t, STAND, [
    [0, { rag: 1 }],
    [0.45, { ...Lpalm, ...Rw(-0.05, 0.03, false), rag: 1, head: [0.2, 0, 0] }],
    [0.75, { ...Lpalm, ...Rw(0.1, 0.02, false), rag: 1, head: [0.22, 0, 0] }],
    [1.05, { ...Lpalm, ...Rw(-0.06, 0.03, false), rag: 1, head: [0.22, 0, 0] }],
    [1.35, { ...Lpalm, ...Rw(0.12, 0.02, false), rag: 1, head: [0.22, 0, 0] }],
    [1.65, { ...Lback, ...Rw(-0.04, 0.02, true), rag: 1, head: [0.2, 0, 0] }],
    [1.95, { ...Lback, ...Rw(0.11, 0.02, true), rag: 1, head: [0.2, 0, 0] }],
    [2.3, { L: { t: [0.06, 1.15, 0.3], pole: [1, -0.4, -0.3], hq: handQuat(1, [-0.6, 0.2, 1], [0, 0.2, 1]), hw: 1, curl: CURL_PINCH }, R: { t: [-0.05, 1.15, 0.3], pole: [-1, -0.4, -0.3], hq: handQuat(-1, [0.6, 0.2, 1], [0, 0.2, 1]), hw: 1, curl: CURL_PINCH }, rag: 1, head: [0.15, 0, 0] }],
    [2.75, { R: { t: [-0.21, 0.98, 0.1], pole: [-1, -0.3, -0.6], hw: 0, wr: [0.3, 0, 0], curl: CURL_PINCH }, rag: 1 }],
    [2.85, { R: { t: [-0.21, 0.98, 0.1], pole: [-1, -0.3, -0.6], hw: 0, wr: [0.3, 0, 0], curl: CURL_PINCH }, rag: 0 }],
    [3.2, {}],
  ])
  P.gaze = [0, 1.05, 0.4]; P.gazeW = 0.7 * (1 - ramp(t, 2.5, 3.0))
  return P
}

// 13. teaBreak：左手托碟、右手捏杯把（小指翘），举杯到嘴边喝（头部眼闭上），放回碟上
function teaPose(t: number): ConciergePose {
  const sauc: V3 = [0.07, 1.17, 0.31]
  const Lsauc: Part = { L: { t: [sauc[0] + 0.035, sauc[1] - 0.045, sauc[2] - 0.11], pole: [1, -0.5, -0.4], hq: HQ_PALMUP(1), hw: 1, curl: [0.1, -0.35, -0.3, -0.25, -0.2] } }
  const cupHq = handQuat(-1, [-0.4, -0.12, 0.9], [-1, 0.15, 0.1]) // 食指穿过杯把、拇指压在把上
  const PINKY = -1.5
  const Ron: Part = { R: { t: [-0.12, 1.2, 0.25], pole: [-1, -0.5, -0.4], hq: cupHq, hw: 1, curl: [0.42, 0.6, 0.62, 0.45, PINKY] }, cupOn: 1 }
  // 喝：杯把（捏合点）到嘴右侧前方，杯身在嘴前、朝嘴倾
  // 2.1：肘自然下垂贴近体侧，前臂从下往上、手腕内旋把杯送到嘴边（手指朝左前上穿过杯把，手背朝右外）
  const drinkHq = handQuat(-1, [0.62, 0.5, 0.6], [-0.75, 0.2, 0.45])
  const Rdrink: Part = { R: { hs: 1, hqh: drinkHq, hw: 1, pole: [-0.25, -1, -0.2], curl: [0.42, 0.6, 0.62, 0.45, PINKY], clav: [0, 0, 0.02] }, cupOn: 0, cupMouth: 1 }
  const lift: Part = { R: { t: [-0.12, 1.36, 0.33], pole: [-0.3, -1, -0.15], hq: cupHq, hw: 1, curl: [0.42, 0.6, 0.62, 0.45, PINKY] }, cupOn: 0 }
  const P = keys(t, STAND, [
    [0, { cup: 1, saucer: 1, ...Lsauc, ...Ron }],
    [0.8, { cup: 1, saucer: 1, ...Lsauc, ...Ron, head: [0.18, 0, 0] }],
    [1.15, { cup: 1, saucer: 1, ...Lsauc, ...lift, head: [0.05, 0, 0] }],
    [1.6, { cup: 1, saucer: 1, ...Lsauc, ...Rdrink, head: [-0.12, 0, 0], neck: [-0.02, 0, 0] }],
    [2.9, { cup: 1, saucer: 1, ...Lsauc, ...Rdrink, head: [-0.24, 0, 0], neck: [-0.06, 0, 0] }],
    [3.3, { cup: 1, saucer: 1, ...Lsauc, ...lift, head: [0.05, 0, 0] }],
    [3.7, { cup: 1, saucer: 1, ...Lsauc, ...Ron, head: [0.14, 0, 0] }],
    [4.7, { cup: 1, saucer: 1, ...Lsauc, ...Ron, head: [0.0, 0.25, 0.08] }],
    [6.0, { cup: 1, saucer: 1, ...Lsauc, ...Ron, head: [0.06, 0, 0] }],
  ])
  P.cupOn = t < 0.95 || t > 3.55 ? 1 : 0
  P.cupMouth = t > 1.45 && t < 3.05 ? 1 : 0
  const sip = ramp(t, 1.45, 1.75) * (1 - ramp(t, 2.85, 3.1))
  P.cupTilt = 0.85 * ramp(t, 1.5, 2.1) * (1 - ramp(t, 2.85, 3.15))
  P.eyeH = 1 - 0.97 * sip; P.jaw = 0.03 * sip + 0.04 * sip * Math.max(0, Math.sin(t * 6))
  P.earL = [0, 0.15 * sip, -0.18 * sip]; P.earR = [0, -0.15 * sip, 0.18 * sip]
  P.gaze = [0.05, 1.15, 0.35]; P.gazeW = 0.5 * (1 - sip)
  return P
}

// 14. gnawMetal：双手捧银勺在嘴边快速啃咬，下颌开合配合抬头，耳朵后压，前臂眼兴奋睁大
function gnawPose(t: number, u: number): ConciergePose {
  // 银勺横咬在门齿间：两手捏住两端（头空间，跟着抬头走）
  const M = HEAD_MOUTH
  const P = over(STAND, {
    hipsR: [0.05, 0, 0], spine: [0.05, 0, 0], chest: [0.06, 0, 0], neck: [0.02, 0, 0], head: [0.0, 0, 0],
    L: { hs: 1, gh: [M[0] + 0.095, M[1] + 0.012, M[2] + 0.0], gw: 1, hqh: handQuat(1, [-0.45, 0.55, 0.7], [0.85, 0.1, 0.1]), hw: 1, pole: [1, -0.8, -0.3], curl: [0.55, 0.62, 0.7, 0.75, 0.8], clav: [0, 0, 0.07] },
    R: { hs: 1, gh: [M[0] - 0.095, M[1] + 0.012, M[2] + 0.0], gw: 1, hqh: handQuat(-1, [0.45, 0.55, 0.7], [-0.85, 0.1, 0.1]), hw: 1, pole: [-1, -0.8, -0.3], curl: [0.55, 0.62, 0.7, 0.75, 0.8], clav: [0, 0, -0.07] },
    metal: 1, earL: [0, 0.85, -0.25], earR: [0, -0.85, 0.25], eyeL: 1.28, eyeR: 1.28,
  })
  const bite = Math.max(0, Math.sin(u * TAU * 4 - 0.3)) ** 0.8 // 4 口 / 1.6 s
  P.jaw = 0.05 + 0.32 * bite
  P.head[0] += jawLift(P.jaw) - 0.04
  // 手跟着「咬」往外扯
  const tug = Math.sin(u * TAU * 4 - 1.3) * 0.01
  P.L.gh[2] -= tug; P.R.gh[2] -= tug
  P.chest[0] += 0.015 * bite; P.shake = 0.15
  P.gaze = [0, 1.5, 0.6]; P.gazeW = 0.3
  void t
  return P
}

// ---------- 骨骼求解（root 空间 FK）----------
const _p = new THREE.Vector3(), _q = new THREE.Quaternion()
interface Xf { p: THREE.Vector3; q: THREE.Quaternion }
/** 骨在 root 空间的位置 / 朝向（递归到 root；root 自身 = 单位） */
function fk(b: THREE.Object3D, root: THREE.Object3D): Xf {
  if (b === root) return { p: new THREE.Vector3(), q: new THREE.Quaternion() }
  const P = fk(b.parent!, root)
  return { p: P.p.clone().add(b.position.clone().applyQuaternion(P.q)), q: P.q.clone().multiply(b.quaternion) }
}
function setRootQ(b: THREE.Object3D, root: THREE.Object3D, q: THREE.Quaternion) {
  const pq = fk(b.parent!, root).q
  b.quaternion.copy(pq.invert().multiply(q))
}
function setE(b: THREE.Object3D, e: V3) { b.rotation.order = 'YXZ'; b.rotation.set(e[0], e[1], e[2]) }
const frameM = (a: THREE.Vector3, n: THREE.Vector3) => { const c = new THREE.Vector3().crossVectors(a, n); return new THREE.Matrix4().makeBasis(a, n, c) }

interface ArmRest { u0: THREE.Vector3; f0: THREE.Vector3; n0: THREE.Vector3 }
const ARM_REST: Record<number, ArmRest> = {}
for (const s of [1, -1]) {
  const S = v3(SH(s)), E = v3(EL(s)), W = v3(WR(s))
  const u0 = E.clone().sub(S).normalize(), f0 = W.clone().sub(E).normalize(), n0 = new THREE.Vector3().crossVectors(u0, f0).normalize()
  ARM_REST[s] = { u0, f0, n0 }
}
const _res = { arm: 0, leg: 0 }
/** 最近一次 apply 的 IK 残差（米）：手腕 / 系部没够到的距离（验收用） */
export const conciergeIkResidual = () => ({ ..._res })

function setFingers(A: CArm, curl: number[]) {
  FINGERS.forEach((f, i) => {
    const c = curl[i] ?? 0
    A.fingers[f].forEach((b, k) => {
      let ang: number
      if (c >= 0) ang = c * FIST[f][k]
      else { ang = Math.max(c, -1) * REST_HAND_FLEX[f][k]; if (k === 0 && c < -1) ang += (c + 1) * 0.45 }
      b.quaternion.setFromAxisAngle(b.userData.flexAxis as THREE.Vector3, ang)
    })
  })
}
/** 骨相对某个祖先骨的位置（在祖先局部坐标里） */
function fkRel(b: THREE.Object3D, stop: THREE.Object3D): THREE.Vector3 {
  if (b === stop) return new THREE.Vector3()
  const chain: THREE.Object3D[] = []; for (let x: THREE.Object3D | null = b; x && x !== stop; x = x.parent) chain.push(x)
  const p = new THREE.Vector3(), q = new THREE.Quaternion()
  for (let i = chain.length - 1; i >= 0; i--) { p.add(chain[i].position.clone().applyQuaternion(q)); q.multiply(chain[i].quaternion) }
  return p
}
/** 捏合点在手骨局部的位置（拇指远节 / 食指远节根部的中点，略向指腹） */
function pinchLocal(A: CArm) { return fkRel(A.fingers.thumb[2], A.wrist).lerp(fkRel(A.fingers.index[2], A.wrist), 0.5) }

function solveArm(rig: ConciergeRig, A: CArm, s: number, P: CArmPose, head: Xf) {
  const root = rig.root
  setE(A.clav, P.clav)
  setFingers(A, P.curl)
  const S = fk(A.shoulder, root).p
  // 手的世界朝向（root / 头空间按 hs 混合）
  const qR = new THREE.Quaternion(...P.hq), qH = head.q.clone().multiply(new THREE.Quaternion(...P.hqh))
  const qWorld = qR.slerp(qH, c01(P.hs))
  // 目标：root 空间与头空间按 hs 混合；捏合目标 g/gh 按 gw 覆盖
  const tR = v3(P.t), tH = v3(P.th).applyQuaternion(head.q).add(head.p)
  const T = tR.lerp(tH, c01(P.hs))
  if (P.gw > 0) {
    const G = v3(P.g).lerp(v3(P.gh).applyQuaternion(head.q).add(head.p), c01(P.hs))
    T.lerp(G.sub(pinchLocal(A).applyQuaternion(qWorld)), c01(P.gw))
  }
  const d = T.clone().sub(S); let D = d.length(); const dh = d.clone().normalize()
  const Dc = clamp(D, 0.12, LU + LF - 0.002); _res.arm = Math.max(_res.arm, D - Dc); D = Dc
  const pole = v3(P.pole); pole.addScaledVector(dh, -pole.dot(dh)); if (pole.lengthSq() < 1e-8) pole.set(s, 0, -1); pole.normalize()
  const ca = clamp((LU * LU + D * D - LF * LF) / (2 * LU * D), -1, 1), sa = Math.sqrt(1 - ca * ca)
  const E = S.clone().addScaledVector(dh, LU * ca).addScaledVector(pole, LU * sa), W = S.clone().addScaledVector(dh, D)
  const u1 = E.clone().sub(S).normalize(), f1 = W.clone().sub(E).normalize()
  let n1 = new THREE.Vector3().crossVectors(u1, f1); if (n1.lengthSq() < 1e-6) n1.crossVectors(pole, dh); n1.normalize()
  const R = ARM_REST[s]
  const Ru = new THREE.Quaternion().setFromRotationMatrix(frameM(u1, n1).multiply(frameM(R.u0, R.n0).transpose()))
  const Rf = new THREE.Quaternion().setFromRotationMatrix(frameM(f1, n1).multiply(frameM(R.f0, R.n0).transpose()))
  let tw = P.tw
  if (P.aimW > 0) { // 扭前臂，让前臂眼那面朝 aim 点
    const n = v3(s > 0 ? AIM_L : AIM_R).applyQuaternion(Rf); n.addScaledVector(f1, -n.dot(f1))
    const g = v3(P.aim).sub(E.clone().lerp(W, 0.5)); g.addScaledVector(f1, -g.dot(f1))
    if (n.lengthSq() > 1e-8 && g.lengthSq() > 1e-8) { n.normalize(); g.normalize(); tw += P.aimW * Math.atan2(new THREE.Vector3().crossVectors(n, g).dot(f1), n.dot(g)) }
  }
  Rf.premultiply(new THREE.Quaternion().setFromAxisAngle(f1, tw))
  setRootQ(A.shoulder, root, Ru)
  A.elbow.quaternion.copy(Ru.clone().invert().multiply(Rf))
  const qFollow = Rf.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(P.wr[0], P.wr[1], P.wr[2], 'YXZ')))
  const qHand = qFollow.slerp(qWorld, c01(P.hw))
  A.wrist.quaternion.copy(Rf.clone().invert().multiply(qHand))
}

function solveLeg(rig: ConciergeRig, Lg: CLeg, s: number, P: CLegPose) {
  const root = rig.root
  const H = fk(Lg.hip, root).p
  const yw = P.yw, cy = Math.cos(yw), sy = Math.sin(yw)
  // 腿平面坐标：绕髋点按蹄偏航转（膝盖朝蹄尖方向）
  const toLeg = (v: THREE.Vector3) => new THREE.Vector3(v.x * cy - v.z * sy, v.y, v.x * sy + v.z * cy)
  const c0 = v3(LEG.c0).applyAxisAngle(new THREE.Vector3(1, 0, 0), P.ph)
  const C = v3(P.p).sub(H), Cl = toLeg(C)
  const F = Cl.clone().sub(c0) // 系部关节（腿平面里，相对髋点）
  const dx = F.x - (J.fetlock[0] - J.hip[0]) * s, dy = -F.y
  const th = Math.atan2(dx, dy), v = Math.hypot(dx, dy), h = F.z
  // 2.1：跖骨联动系数 K 自适应——K=0.85 够得着就用（反关节味道）；够不着时二分找最大可达 K（跗关节伸开、跖骨更竖），腿接近伸直才有残差
  const solveK = (K: number) => {
    let a1 = LEG.a1, a2 = LEG.a2, a3 = LEG.a3, miss = 0
    for (let it = 0; it < 8; it++) {
      a3 = LEG.a3 + K * (a1 - LEG.a1)
      const kh = h - LEG.L3 * Math.sin(a3), kv = v - LEG.L3 * Math.cos(a3)
      let D = Math.hypot(kh, kv); const Dc = clamp(D, Math.abs(LEG.L1 - LEG.L2) + 0.01, LEG.L1 + LEG.L2 - 0.002); miss = D - Dc; D = Dc
      const be = Math.atan2(kh, kv), al = Math.acos(clamp((LEG.L1 * LEG.L1 + D * D - LEG.L2 * LEG.L2) / (2 * LEG.L1 * D), -1, 1))
      a1 = be + al
      const knh = LEG.L1 * Math.sin(a1), knv = LEG.L1 * Math.cos(a1)
      const hh = Math.sin(be) * D, hv = Math.cos(be) * D
      a2 = Math.atan2(hh - knh, hv - knv)
    }
    return { a1, a2, a3, miss }
  }
  let sol = solveK(LEG.K)
  if (sol.miss > 1e-5) {
    let lo = 0.15, hi = LEG.K, best = solveK(lo)
    if (best.miss <= 1e-5) { for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2, r = solveK(m); if (r.miss <= 1e-5) { lo = m; best = r } else hi = m } }
    sol = best
  }
  const { a1, a2, a3 } = sol, miss = sol.miss
  _res.leg = Math.max(_res.leg, Math.max(0, miss))
  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yw)
  const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), th)
  const segQ = (a: number, ar: number) => qYaw.clone().multiply(qRoll).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -(a - ar)))
  setRootQ(Lg.hip, root, segQ(a1, LEG.a1))
  Lg.knee.quaternion.copy(segQ(a1, LEG.a1).invert().multiply(segQ(a2, LEG.a2)))
  if (Lg.kneeFix) Lg.kneeFix.quaternion.identity().slerp(Lg.knee.quaternion, 0.5) // 半角辅助骨
  if (Lg.kneeIn) { // 大腿后侧垫骨：屈膝量（相对静止）越大，沿后侧方向（局部 Z）压得越扁
    const kq = Lg.knee.quaternion, flex = 2 * Math.acos(clamp(Math.abs(kq.w), 0, 1)) * (Math.sign(kq.x * (kq.w < 0 ? -1 : 1)) || 1)
    Lg.kneeIn.scale.set(1, 1, 1 - KNEE_IN_K * ss(flex / 0.95))
  }
  Lg.hock.quaternion.copy(segQ(a2, LEG.a2).invert().multiply(segQ(a3, LEG.a3)))
  const qp = qYaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), P.ph))
  Lg.pastern.quaternion.copy(segQ(a3, LEG.a3).invert().multiply(qp))
}

// ---------- 眨眼 ----------
/** 0..1 闭合量：每只眼按 seed 的确定性随机间隔眨（快闭慢睁），period 秒级 */
function blinkAt(t: number, seed: number, period: number) {
  const P = period, sl = Math.floor(t / P), sum = (k: number) => {
    const st = k * P + hash(k * 13.1 + seed * 7.7) * (P - 0.4), x = t - st
    if (x < 0 || x > 0.34) return 0
    return x < 0.09 ? x / 0.09 : 1 - ss((x - 0.09) / 0.25)
  }
  return Math.max(sum(sl), sum(sl - 1))
}

// ---------- 道具 ----------
interface PropState {
  saucer: THREE.Object3D; rag: THREE.Mesh; metal: THREE.Group; strand: THREE.Mesh
  ropeHome: { parent: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion }
  handsetGrip: THREE.Vector3; handsetQ: THREE.Quaternion
  furU?: { value: THREE.Vector3 }
  cord?: CordState; cradle?: THREE.Object3D
}
const PROP_MAT = {
  rag: new THREE.MeshStandardMaterial({ color: '#efece4', roughness: 0.95, side: THREE.DoubleSide }),
  silver: new THREE.MeshStandardMaterial({ color: '#d6d8dc', roughness: 0.22, metalness: 0.9 }),
  rope: new THREE.MeshStandardMaterial({ color: '#a88a5a', roughness: 1 }),
}
function props(rig: ConciergeRig): PropState {
  const R = rig as ConciergeRig & { __cprops?: PropState }
  if (R.__cprops) return R.__cprops
  const grip = HS_GRIP.clone(), hsQ = HS_Q.clone()
  rig.handset.position.copy(grip); rig.handset.quaternion.copy(hsQ)
  // 茶碟拆到左手
  const saucer = rig.cup.children[rig.cup.children.length - 1]
  const sg = new THREE.Group(); sg.name = 'saucer'; sg.visible = false; rig.bones.handL.add(sg); sg.add(saucer); saucer.position.set(0, 0, 0)
  // 手帕：一块垂下的布（右手）
  // 从中间捏起的方巾：两半向下垂，带几道褶
  const rg = new THREE.PlaneGeometry(0.24, 0.24, 10, 10), ps = rg.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < ps.count; i++) {
    const x = ps.getX(i), y = ps.getY(i), a = Math.abs(y), sg = Math.sign(y) || 1
    ps.setXYZ(i, x * (1 - 0.45 * Math.exp(-a * 25)) + 0.012 * Math.sin(y * 40), -a * 0.95 + 0.01 * Math.cos(x * 35), sg * (0.02 + a * 0.28) + 0.012 * Math.sin(x * 30 + y * 9))
  }
  rg.computeVertexNormals()
  const rag = new THREE.Mesh(rg, PROP_MAT.rag); rag.name = 'rag'; rag.visible = false; rig.bones.handR.add(rag)
  // 银勺（右手）
  const metal = new THREE.Group(); metal.name = 'metal'; metal.visible = false; rig.bones.handR.add(metal)
  // 银餐叉（啃得弯弯扭扭）：柄 + 叉颈 + 四齿，沿 +x，原点在中段
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.004, 0.013), PROP_MAT.silver); handle.position.x = -0.045; handle.rotation.z = 0.04; metal.add(handle)
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.009), PROP_MAT.silver); neck.position.x = 0.05; neck.rotation.z = -0.12; metal.add(neck)
  for (let k = 0; k < 4; k++) { const tine = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.003, 0.0028), PROP_MAT.silver); tine.position.set(0.096, -0.006 + (k === 1 ? 0.004 : 0), (k - 1.5) * 0.0065); tine.rotation.z = -0.15 + (k === 2 ? 0.25 : 0); metal.add(tine) }
  // 两手之间的绳段
  const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 1, 6, 1), PROP_MAT.rope); strand.name = 'ropeStrand'; strand.visible = false; rig.root.add(strand)
  const st: PropState = { saucer: sg, rag, metal, strand, ropeHome: { parent: rig.rope.parent!, p: rig.rope.position.clone(), q: rig.rope.quaternion.clone() }, handsetGrip: grip, handsetQ: hsQ }
  R.__cprops = st
  return st
}
/** 手指捏合点（拇指尖与食指中节之间），root 空间 */
function pinchPoint(rig: ConciergeRig, A: CArm): THREE.Vector3 {
  const root = rig.root
  const hx = fk(A.wrist, root)
  return pinchLocal(A).applyQuaternion(hx.q).add(hx.p)
}
function placeInHand(obj: THREE.Object3D, rig: ConciergeRig, A: CArm, pRoot: THREE.Vector3, qRoot: THREE.Quaternion, pivotLocal: THREE.Vector3) {
  const hx = fk(A.wrist, rig.root), iq = hx.q.clone().invert()
  obj.quaternion.copy(iq.clone().multiply(qRoot))
  const off = pivotLocal.clone().applyQuaternion(qRoot)
  obj.position.copy(pRoot.clone().sub(off).sub(hx.p).applyQuaternion(iq))
}
/** 茶碟在左掌上的位置（root 空间） */
function saucerPos(rig: ConciergeRig) {
  const FL = HANDS[1].F, hx = fk(rig.armL.wrist, rig.root)
  const palm = v3(FL.o).addScaledVector(v3(FL.a), 0.075).addScaledVector(v3(FL.d), -0.03).sub(v3(side(J.wrist, 1)))
  return palm.applyQuaternion(hx.q).add(hx.p)
}
/** 杯放在碟上的位姿（root 空间）：杯底贴碟面、杯把朝右前 */
const CUP_GRIP = new THREE.Vector3(0.079, 0.033, 0) // 杯把外缘外侧（捏合点在两指远节根部，指尖伸进把圈；2.1 外移 7 mm，拇指不贴杯沿）
function cupOnSaucer(rig: ConciergeRig) {
  const p = saucerPos(rig).add(new THREE.Vector3(0, 0.004, 0))
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI - 0.45) // 杯把朝右（略朝身体）
  return { p, q, grip: CUP_GRIP.clone().applyQuaternion(q).add(p) }
}
/** 杯在嘴前：杯沿近侧贴在下唇，杯把朝右，杯口按 tilt 朝脸倾（root 空间） */
function cupAtMouth(head: Xf, tilt: number) {
  const M = v3(HEAD_MOUTH).applyQuaternion(head.q).add(head.p)
  const f = new THREE.Vector3(0, -0.81, 0.58).applyQuaternion(head.q); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, 1); f.normalize()
  const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(f, up).normalize()
  const upT = up.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(f, -Math.sin(tilt))
  const fT = new THREE.Vector3().crossVectors(up, right).normalize().applyAxisAngle(right, tilt) // 杯局部「朝外」（远离脸）
  const p = M.clone().addScaledVector(upT, -0.054).addScaledVector(fT, 0.04).addScaledVector(f, 0.012)
  const q = basisQuat([1, 0, 0], [0, 1, 0], [right.x, right.y, right.z], [upT.x, upT.y, upT.z])
  return { p, q, grip: CUP_GRIP.clone().applyQuaternion(q).add(p) }
}
// ---------- 2.1 电话线 + 台上的话筒 ----------
/** 话筒放在机座上时的位姿（相对底座中心，模型空间）：取 phone 片段 0.78 s 抓起瞬间手里话筒的位姿 → 放回 / 拿起都不跳 */
let _calib = false
/** 话筒在机座上的位姿（相对底座中心，模型空间）——台上静置话筒 / 静态电话线用 */
export function conciergeCradlePose(rig: ConciergeRig): THREE.Matrix4 { return cradlePose(rig) }
export const CONCIERGE_HANDSET_EXIT = new THREE.Vector3(0, -0.118, 0.012)
export const CONCIERGE_PHONE_SOCKET: V3 = [-0.06, 0.03, -0.07]
function cradlePose(rig: ConciergeRig): THREE.Matrix4 {
  const R = rig as ConciergeRig & { __ccradle?: THREE.Matrix4 }
  if (R.__ccradle) return R.__ccradle
  _calib = true
  const top = rig.root.parent!
  const save = top.matrixWorld.clone()
  applyConciergePose(rig, conciergePose('phone', 0.78), {})
  top.updateWorldMatrix(false, true)
  const m = new THREE.Matrix4().copy(top.matrixWorld).invert().multiply(rig.handset.matrixWorld)
  const b = CONCIERGE_PHONE_DESK.base
  m.premultiply(new THREE.Matrix4().makeTranslation(-b[0], -b[1], -b[2]))
  // 摆平：握把轴（局部 Y）取水平投影、话筒杯（局部 +Z）朝下；位置拉向叉簧中心（底座上方 10.5 cm）
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); m.decompose(p, q, sc)
  const y = new THREE.Vector3(0, 1, 0).applyQuaternion(q); y.y = 0; if (y.lengthSq() < 1e-6) y.set(1, 0, 0); y.normalize()
  const z = new THREE.Vector3(0, -1, 0), x = new THREE.Vector3().crossVectors(y, z)
  q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  p.lerp(new THREE.Vector3(0, 0.105, 0), 0.75); p.y = 0.103
  m.compose(p, q, sc)
  void save
  _calib = false
  R.__ccradle = m
  return m
}
const _mi = new THREE.Matrix4()
function phoneCord(rig: ConciergeRig, st: PropState, P: ConciergePose, desk: ConciergePhoneDesk | null) {
  if (_calib) return
  if (!desk || rig.lod > 0) { if (st.cord) st.cord.mesh.visible = false; if (st.cradle) st.cradle.visible = false; return }
  const top = rig.root.parent!
  if (!st.cord) { st.cord = createCord(); top.add(st.cord.mesh) }
  if (!st.cradle) { const c = rig.handset.clone(true); c.name = 'handsetCradle'; c.traverse((x) => { if (x.name === 'cord') x.visible = false }); c.visible = false; top.add(c); st.cradle = c }
  const cm = cradlePose(rig)
  const inHand = P.handset > 0.5
  st.cradle.visible = !inHand
  st.cradle.matrixAutoUpdate = true
  const M = new THREE.Matrix4().makeTranslation(desk.base[0], desk.base[1], desk.base[2]).multiply(cm)
  M.decompose(st.cradle.position, st.cradle.quaternion, st.cradle.scale)
  // 话筒尾端（模型空间）
  top.updateWorldMatrix(true, true)
  _mi.copy(top.matrixWorld).invert()
  const B = HANDSET_CORD_EXIT.clone()
  if (inHand) B.applyMatrix4(rig.handset.matrixWorld).applyMatrix4(_mi); else B.applyMatrix4(M)
  const A = new THREE.Vector3(desk.base[0] + PHONE_SOCKET[0], desk.base[1] + PHONE_SOCKET[1], desk.base[2] + PHONE_SOCKET[2])
  // 身体胶囊（模型空间）
  const bp = (b: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(_mi)
  const hips = bp(rig.hips), spine = bp(rig.spine), neck = bp(rig.neck), head = bp(rig.head)
  const caps: CordCapsule[] = [
    { a: hips, b: spine, r: 0.15 }, { a: spine, b: neck, r: 0.165 }, { a: neck, b: head, r: 0.08 },
    { a: head, b: head.clone().add(new THREE.Vector3(0, -0.2, 0.14).applyQuaternion(rig.head.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromRotationMatrix(_mi)))), r: 0.07 },
  ]
  for (const A2 of [rig.armL, rig.armR]) { const sh = bp(A2.shoulder), el = bp(A2.elbow), wr = bp(A2.wrist); caps.push({ a: sh, b: el, r: 0.062 }, { a: el, b: wr, r: 0.048 }) }
  st.cord.mesh.visible = true
  updateCord(st.cord, A, B, caps, { socket: [A.x, A.y, A.z], base: desk.base, top: desk.top, rect: desk.rect })
}
function applyProps(rig: ConciergeRig, P: ConciergePose, head: Xf, o: ConciergeAnimOpts) {
  const st = props(rig), root = rig.root
  phoneCord(rig, st, P, o.phoneDesk ?? null)
  rig.handset.visible = P.handset > 0.5
  rig.cord.visible = false // 2.1：旧的挂在话筒上的静态线不用了（改为 conciergeCord 动态线）
  rig.key.visible = P.key > 0.5
  rig.cup.visible = P.cup > 0.5
  st.saucer.visible = P.saucer > 0.5
  st.rag.visible = P.rag > 0.5
  st.metal.visible = P.metal > 0.5
  // 绳卷：0 藏、1 挂腰、2 在左手
  const ropeHand = P.rope > 1.5
  rig.rope.visible = P.rope > 0.5
  if (ropeHand && rig.rope.parent !== rig.bones.handL) { rig.bones.handL.add(rig.rope) }
  if (!ropeHand && rig.rope.parent !== st.ropeHome.parent) { st.ropeHome.parent.add(rig.rope); rig.rope.position.copy(st.ropeHome.p); rig.rope.quaternion.copy(st.ropeHome.q) }
  if (ropeHand) { // 绳卷挂在左手虎口：卷轴朝前
    const FL = HANDS[1].F
    rig.rope.position.copy(v3(FL.o).addScaledVector(v3(FL.a), 0.07).addScaledVector(v3(FL.d), -0.045).sub(v3(side(J.wrist, 1))))
    rig.rope.quaternion.copy(basisQuat([0, 1, 0], [1, 0, 0], FL.r, FL.a))
  }
  if (rig.key.visible) { // 钥匙：圈在指间，牌子下垂（+x 朝下），正面朝前
    const pp = pinchPoint(rig, rig.armL)
    placeInHand(rig.key, rig, rig.armL, pp, basisQuat([1, 0, 0], [0, 0, 1], [0.08, -1, 0.1], [0.25, 0.1, 1]), new THREE.Vector3(-0.044, -0.004, 0.0015))
  }
  if (rig.cup.visible && (P.cupOn > 0.5 || P.cupMouth > 0.5)) { const cp = P.cupMouth > P.cupOn ? cupAtMouth(head, P.cupTilt) : cupOnSaucer(rig); placeInHand(rig.cup, rig, rig.armR, cp.p, cp.q, new THREE.Vector3()) }
  else if (rig.cup.visible) { // 杯把在右手指间；杯口朝上，按 cupTilt 朝嘴的方向倾
    const pp = pinchPoint(rig, rig.armR)
    const hx = fk(rig.armR.wrist, root)
    const toward = new THREE.Vector3(1, 0, 0).applyQuaternion(hx.q); toward.y = 0; if (toward.lengthSq() < 1e-6) toward.set(1, 0, 0); toward.normalize()
    // 杯把（局部 +x）朝手、杯身在手指外侧
    const xAxis = toward.clone().negate()
    const up = new THREE.Vector3(0, 1, 0)
    const tiltAxis = new THREE.Vector3().crossVectors(up, xAxis).normalize()
    const upT = up.clone().applyAxisAngle(tiltAxis, -P.cupTilt * 1.0)
    const xT = xAxis.clone().applyAxisAngle(tiltAxis, -P.cupTilt * 1.0)
    placeInHand(rig.cup, rig, rig.armR, pp, basisQuat([0, 1, 0], [1, 0, 0], [upT.x, upT.y, upT.z], [xT.x, xT.y, xT.z]), new THREE.Vector3(0.05, 0.03, 0))
  }
  if (st.saucer.visible) placeInHand(st.saucer, rig, rig.armL, saucerPos(rig), new THREE.Quaternion(), new THREE.Vector3(0, -0.002, 0)) // 茶碟平托在左掌上
  if (st.rag.visible) {
    const pp = pinchPoint(rig, rig.armR)
    placeInHand(st.rag, rig, rig.armR, pp, basisQuat([1, 0, 0], [0, 1, 0], [0.9, 0, 0.45], [0, 1, 0]), new THREE.Vector3(0, -0.005, 0))
  }
  if (st.metal.visible) { // 银勺：横在两手之间（右手捏柄、勺头朝左手），过嘴前
    const pl = pinchPoint(rig, rig.armL), pr = pinchPoint(rig, rig.armR)
    const ax = pl.clone().sub(pr).normalize()
    const upv = new THREE.Vector3(0, 0, 1).applyQuaternion(head.q)
    placeInHand(st.metal, rig, rig.armR, pr.clone().lerp(pl, 0.5), basisQuat([1, 0, 0], [0, 1, 0], [ax.x, ax.y, ax.z], [upv.x, upv.y, upv.z]), new THREE.Vector3(0.0, 0, 0))
  }
  st.strand.visible = P.strand > 0.5
  if (st.strand.visible) {
    const a = pinchPoint(rig, rig.armL), b = pinchPoint(rig, rig.armR)
    const d = b.clone().sub(a), L = d.length()
    st.strand.position.copy(a).addScaledVector(d, 0.5); st.strand.scale.set(1, Math.max(0.01, L), 1)
    st.strand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  }
}
/** 右手 / 左手握持点（世界坐标）：AI 拖人、捆人时挂玩家用 */
export function conciergeHandPoint(rig: ConciergeRig, s: 'L' | 'R', out = new THREE.Vector3()) {
  const A = s === 'L' ? rig.armL : rig.armR, F = HANDS[s === 'L' ? 1 : -1].F
  const loc = v3(F.o).addScaledVector(v3(F.a), 0.07).addScaledVector(v3(F.d), -0.03).sub(v3(side(J.wrist, s === 'L' ? 1 : -1)))
  A.wrist.updateWorldMatrix(true, false)
  return out.copy(loc).applyMatrix4(A.wrist.matrixWorld)
}

// ---------- 二阶：耳 / 领带 / 颈毛 ----------
interface Dyn { init: boolean; hp: THREE.Vector3; hv: THREE.Vector3; hq: THREE.Quaternion; ear: number[]; earV: number[]; tie: number[]; tieV: number[]; fur: THREE.Vector3; furV: THREE.Vector3 }
function dynOf(rig: ConciergeRig): Dyn {
  const R = rig as ConciergeRig & { __cdyn?: Dyn }
  return (R.__cdyn ??= { init: false, hp: new THREE.Vector3(), hv: new THREE.Vector3(), hq: new THREE.Quaternion(), ear: [0, 0, 0, 0], earV: [0, 0, 0, 0], tie: [0, 0], tieV: [0, 0], fur: new THREE.Vector3(), furV: new THREE.Vector3() })
}
export function resetConciergeDynamics(rig: ConciergeRig) { const d = dynOf(rig); d.init = false; d.ear.fill(0); d.earV.fill(0); d.tie.fill(0); d.tieV.fill(0); d.fur.set(0, 0, 0); d.furV.set(0, 0, 0) }
function furUniform(rig: ConciergeRig): { value: THREE.Vector3 } {
  const st = props(rig)
  if (st.furU) {
    const px = rig.furMesh.userData.cpuProxy as THREE.Mesh | undefined
    if (px && px.material !== rig.furMesh.material) px.material = rig.furMesh.material
    return st.furU
  }
  const u = { value: new THREE.Vector3() }
  const base = rig.furMesh.material as THREE.Material
  const m = base.clone(); const prev = base.onBeforeCompile, key = base.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev.call(base, sh, r)
    sh.uniforms.uFurSway = u
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uFurSway;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n#ifdef USE_MAP\n  transformed += uFurSway * pow(clamp(MAP_UV.y, 0.0, 1.0), 1.5);\n#endif')
  }
  m.customProgramCacheKey = () => key + '|cfur'
  rig.furMesh.material = m
  st.furU = u
  return u
}
const _wq = new THREE.Quaternion(), _wp = new THREE.Vector3(), _ws = new THREE.Vector3(), _iq = new THREE.Quaternion()
function stepDyn(rig: ConciergeRig, P: ConciergePose, dt: number) {
  const D = dynOf(rig)
  const fu = furUniform(rig)
  const top = rig.root.parent ?? rig.root
  top.updateWorldMatrix(true, true)
  rig.head.matrixWorld.decompose(_wp, _wq, _ws)
  dt = Math.min(0.05, dt)
  if (!D.init || dt <= 0) { D.hp.copy(_wp); D.hv.set(0, 0, 0); D.hq.copy(_wq); D.init = true }
  let acc = new THREE.Vector3(), wy = 0, wx = 0
  if (dt > 0) {
    const v = _wp.clone().sub(D.hp).divideScalar(dt)
    acc = v.clone().sub(D.hv).divideScalar(dt); if (acc.lengthSq() > 900) acc.setLength(30)
    D.hv.copy(v); D.hp.copy(_wp)
    const dq = D.hq.clone().invert().multiply(_wq); const e = new THREE.Euler().setFromQuaternion(dq, 'YXZ'); wy = e.y / dt; wx = e.x / dt
    D.hq.copy(_wq)
  }
  // 头局部的加速度（g 为单位）
  _iq.copy(_wq).invert(); const aL = acc.clone().applyQuaternion(_iq).multiplyScalar(1 / 9.8)
  const K = 70, Cd = 6.5
  const spring = (i: number, f: number, arr: number[], vel: number[], k = K, c = Cd, lim = 0.6) => {
    vel[i] += (f * k - k * arr[i] - c * vel[i]) * dt; arr[i] = clamp(arr[i] + vel[i] * dt, -lim, lim)
  }
  if (dt > 0) {
    // 耳：上下（绕 z，左正右负 = 抬）受竖直加速度；前后（绕 y）受前向加速度与转头角速度
    spring(0, -aL.y * 0.5 - wx * 0.03, D.ear, D.earV); spring(1, -aL.z * 0.6 + wy * 0.05, D.ear, D.earV)
    spring(2, -aL.y * 0.5 - wx * 0.03, D.ear, D.earV); spring(3, aL.z * 0.6 + wy * 0.05, D.ear, D.earV)
    if (P.shake > 0) { const tt = performance.now() * 0.001; for (let i = 0; i < 4; i++) D.earV[i] += Math.sin(tt * 47 + i * 2.1) * P.shake * 6 * dt }
    // 领带：前后摆受胸口前向加速度，左右摆受横向加速度
    rig.chest.matrixWorld.decompose(_wp, _wq, _ws); _iq.copy(_wq).invert(); const aC = acc.clone().applyQuaternion(_iq).multiplyScalar(1 / 9.8)
    spring(0, aC.z * 0.5, D.tie, D.tieV, 40, 5, 0.5); spring(1, -aC.x * 0.5, D.tie, D.tieV, 40, 5, 0.5)
    // 颈毛：发梢位移（米，模型空间）
    const top2 = (rig.root.parent ?? rig.root); top2.matrixWorld.decompose(_wp, _wq, _ws); _iq.copy(_wq).invert()
    const aM = acc.clone().applyQuaternion(_iq).multiplyScalar(-0.0012)
    D.furV.addScaledVector(aM.sub(D.fur).multiplyScalar(90), dt).multiplyScalar(Math.max(0, 1 - 9 * dt)); D.fur.addScaledVector(D.furV, dt)
    if (D.fur.length() > 0.006) D.fur.setLength(0.006)
  }
  rig.earL.rotation.z += D.ear[0]; rig.earL.rotation.y += D.ear[1]
  rig.earR.rotation.z -= D.ear[2]; rig.earR.rotation.y += D.ear[3]
  rig.tie.rotation.x = Math.min(rig.tie.rotation.x + D.tie[0], 0); rig.tie.rotation.z += D.tie[1]
  fu.value.copy(D.fur)
}

// ---------- 应用 ----------
const _shk = [0, 0, 0]
export function applyConciergePose(rig: ConciergeRig, P: ConciergePose, o: ConciergeAnimOpts = {}) {
  const root = rig.root
  if (o.phoneDesk && !_calib && rig.lod === 0) cradlePose(rig) // 先标定（内部会摆一次 phone 姿态），再摆本帧
  _res.arm = 0; _res.leg = 0
  root.position.set(P.root[0], P.root[1], P.root[2]); setE(root, P.rootR)
  const hr = rig.hips.userData.rest as { p: THREE.Vector3 }
  rig.hips.position.set(hr.p.x + P.hipsP[0], hr.p.y + P.hipsP[1], hr.p.z + P.hipsP[2]); setE(rig.hips, P.hipsR)
  setE(rig.spine, P.spine); setE(rig.chest, P.chest); setE(rig.neck, P.neck)
  // 微抖动（blinkTeleport 落地 / 啃金属兴奋）：头颈胸高频小幅
  const tm = o.time ?? 0
  if (P.shake > 0) { for (let i = 0; i < 3; i++) _shk[i] = (Math.sin(tm * (53 + i * 11) + i * 1.7) + Math.sin(tm * (71 + i * 7))) * 0.5 * P.shake }
  else _shk[0] = _shk[1] = _shk[2] = 0
  setE(rig.head, [P.head[0] + 0.03 * _shk[0], P.head[1] + 0.035 * _shk[1], P.head[2] + 0.03 * _shk[2]])
  rig.neck.rotation.x += 0.012 * _shk[1]; rig.chest.rotation.z += 0.008 * _shk[2]
  rig.jaw.rotation.set(clamp(P.jaw, -0.02, 0.45), 0, 0)
  setE(rig.earL, P.earL); setE(rig.earR, P.earR)
  // 领带：胸口前倾时自然下垂（只往外摆，不进衬衫）
  const chestQ = fk(rig.chest, root).q.premultiply(_qa.setFromEuler(root.rotation))
  const fwd = new THREE.Vector3(0, -1, 0).applyQuaternion(chestQ)
  const lean = Math.atan2(-fwd.z, -fwd.y) // 胸口「下」方向偏后的角度（前倾为正）
  rig.tie.rotation.set(Math.min(0, -Math.max(0, lean) * 0.85 + P.tie[0]), 0, P.tie[2])
  solveLeg(rig, rig.legL, 1, P.legL)
  solveLeg(rig, rig.legR, -1, P.legR)
  // 2.1 地面保护：髋 / 膝 / 跗关节（按裤管半径）不得低于地面，否则整体抬髋重解腿（trip 翻身过渡帧）
  for (let pass = 0; pass < 5; pass++) {
    let def = 0
    for (const Lg of [rig.legL, rig.legR]) {
      const h = fk(Lg.hip, root).p, k = fk(Lg.knee, root).p, c = fk(Lg.hock, root).p
      for (const [y, r] of [[h.y, 0.085], [k.y, 0.062], [c.y, 0.045], [(h.y + k.y) / 2, 0.075], [(k.y + c.y) / 2, 0.058], [k.y * 0.25 + c.y * 0.75, 0.052]]) def = Math.max(def, r - y)
    }
    if (def <= 0.001) break
    rig.hips.position.y += def
    solveLeg(rig, rig.legL, 1, P.legL); solveLeg(rig, rig.legR, -1, P.legR)
  }
  const head = fk(rig.head, root)
  solveArm(rig, rig.armL, 1, P.L, head)
  let Rp = P.R
  if (P.cupOn > 0.001 || P.cupMouth > 0.001) { // 杯在碟上 / 嘴前：右手捏合点对到杯把
    const cp = P.cupMouth > P.cupOn ? cupAtMouth(head, P.cupTilt) : cupOnSaucer(rig)
    // 2.1：hs 归零前先把头空间的手朝向换成 root 空间（之前直接丢掉 hqh → 手回到静止朝向，肘被迫抬高外张）
    const qh = new THREE.Quaternion(...P.R.hq).slerp(head.q.clone().multiply(new THREE.Quaternion(...P.R.hqh)), c01(P.R.hs))
    Rp = { ...P.R, hs: 0, hq: [qh.x, qh.y, qh.z, qh.w], g: [cp.grip.x, cp.grip.y, cp.grip.z], gw: Math.max(P.R.gw, c01(Math.max(P.cupOn, P.cupMouth))) }
  }
  solveArm(rig, rig.armR, -1, Rp, head)
  // 眼睑：组开度 × (1 − 眨眼)；眼球朝注视点
  const seed = o.seed ?? 1, bt = o.time ?? 0
  const lid = (e: { lidU: THREE.Object3D; lidL: THREE.Object3D; open: [number, number] }, k: number) => { k = clamp(k, 0, 1.32); e.lidU.rotation.x = e.open[0] * k; e.lidL.rotation.x = e.open[1] * Math.min(k, 1.15) }
  rig.headEyes.forEach((e, i) => lid(e, P.eyeH * (1 - P.blink * blinkAt(bt + i * 0.37, seed * 3 + i, 3.4 + hash(seed + i) * 2.2))))
  rig.armL.eyes.forEach((e, i) => lid(e, P.eyeL * (1 - P.blink * blinkAt(bt + i * 0.9, seed * 5 + 11 + i, 5.5 + hash(seed + 20 + i) * 3.5))))
  rig.armR.eyes.forEach((e, i) => lid(e, P.eyeR * (1 - P.blink * blinkAt(bt + i * 0.7, seed * 5 + 31 + i, 5.5 + hash(seed + 40 + i) * 3.5))))
  const gz = v3(P.gaze)
  for (const e of [...rig.headEyes, ...rig.armL.eyes, ...rig.armR.eyes]) {
    if (P.gazeW <= 0.001) { e.ball.rotation.set(0, 0, 0); continue }
    const x = fk(e.g, root), d = gz.clone().sub(x.p).applyQuaternion(x.q.clone().invert())
    if (d.z <= 0.01) { e.ball.rotation.set(0, 0, 0); continue }
    const yaw = clamp(Math.atan2(d.x, d.z), -0.32, 0.32), pit = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.25, 0.25)
    e.ball.rotation.set(pit * P.gazeW, yaw * P.gazeW, 0)
  }
  applyProps(rig, P, head, o)
  if (o.dt !== undefined) stepDyn(rig, P, o.dt)
}

/** 无状态入口：片段 + 时间 → 骨骼。opts.dt 给出时推进二阶摆动。 */
/** 片段默认是否在前台（画电话线 / 台上话筒） */
const defaultPhoneDesk = (clip: ConciergeClip, o: ConciergeAnimOpts) => o.phoneDesk !== undefined ? o.phoneDesk : PHONE_CLIPS.has(clip) || (clip === 'idle' && o.desk !== false) || (clip === 'talk' && o.desk === true) ? CONCIERGE_PHONE_DESK : null
export function animateConcierge(rig: ConciergeRig, clip: ConciergeClip, t: number, opts: ConciergeAnimOpts = {}) {
  const P = conciergePose(clip, t, opts)
  applyConciergePose(rig, P, { ...opts, time: opts.time ?? t, phoneDesk: defaultPhoneDesk(clip, opts) })
  return P
}
/** 预览 / 截图：先从 t − pre 起按 1/60 s 推进二阶，得到与连续播放一致的确定帧 */
export function animateConciergePreroll(rig: ConciergeRig, clip: ConciergeClip, t: number, opts: ConciergeAnimOpts = {}, pre = 0.6) {
  resetConciergeDynamics(rig)
  const C = CONCIERGE_CLIPS[clip], h = 1 / 60
  let t0 = t - pre; if (!C.loop) t0 = Math.max(0, t0)
  let P: ConciergePose | null = null
  for (let x = t0; x <= t + 1e-6; x += h) P = animateConcierge(rig, clip, x, { ...opts, time: x, dt: x === t0 ? 0 : h })
  return P!
}

// ---------- 运行时动画器 ----------
export interface ConciergeAnimator {
  play(clip: ConciergeClip, fade?: number): void
  update(dt: number, opts?: ConciergeAnimOpts): void
  readonly clip: ConciergeClip; readonly time: number; readonly done: boolean; readonly pose: ConciergePose
}
/** 片段间 0.2 s 混合；blinkTeleport 播放时冻结切换瞬间的姿态（from）。移动片段可传 opts.dt 外的距离推进：update 的 dt 已经按速度推进时间 */
export function createConciergeAnimator(obj: THREE.Object3D, seed = 1): ConciergeAnimator {
  const rig = obj.userData.concierge as ConciergeRig
  let clip: ConciergeClip = 'idle', time = 0, gt = 0, fadeT = 1, fadeDur = 0
  let prev = conciergePose('idle', 0, { seed }), last = deepClone(prev), frozen: ConciergePose | null = null
  return {
    get clip() { return clip }, get time() { return time }, get pose() { return last },
    get done() { const C = CONCIERGE_CLIPS[clip]; return !C.loop && time >= C.dur },
    play(c, fade = 0.2) {
      if (c === clip && CONCIERGE_CLIPS[c].loop) return
      prev = deepClone(last); frozen = c === 'blinkTeleport' ? deepClone(last) : null
      clip = c; time = 0; fadeT = 0; fadeDur = c === 'blinkTeleport' ? 0 : fade
    },
    update(dt, opts = {}) {
      time += dt; gt += dt; fadeT += dt
      let P = conciergePose(clip, time, { seed, ...opts, from: frozen ?? opts.from })
      if (fadeT < fadeDur) P = mixConciergePose(prev, P, ss(fadeT / fadeDur))
      last = P
      applyConciergePose(rig, P, { seed, ...opts, time: gt, dt, phoneDesk: defaultPhoneDesk(clip, opts) })
    },
  }
}
void Q_ID; void eul; void _qb; void _qc; void _m4; void _p; void _q; void keysP
