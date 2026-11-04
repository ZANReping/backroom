// [bellhop stage 2] 行李员（Entity 135 / The Bellhopper）阶段 2 动画：程序化关键帧 / 曲线（不接 AI）。结构沿用看门人 conciergeAnim。
// 用法：
//   const an = createBellhopAnimator(group)            // group = buildBellhopMesh() 的返回（userData.bellhop）
//   an.play('ringFriendly')                            // 片段间 0.2 s 交叉混合
//   an.update(dt, { turn: Math.PI, tilt: 0.3 })        // 每帧；turn / tilt = 叠加拧头 / 歪头（stillWatch + 拧头 = 被注视时定住、只有头转着看你）
// 无状态入口（预览 / 截图 / AI 自己管时间）：
//   animateBellhop(rig, clip, t, opts)                 // = applyBellhopPose(rig, bellhopPose(clip, t, opts), opts)
//   bellhopPose(clip, t, opts) → BellhopPose            // 纯函数；mixBellhopPose(a, b, k) 线性混合（手部四元数 nlerp）
// 结构：
//   · 姿态量全部在 root 骨空间（+Z 正面、+Y 上、地面 y=0、+X = 角色左侧），可线性混合。躯干 / 颈 / 头：欧拉角（YXZ）。
//   · 拧头：转角按 胸 5% / 颈 45% / 头 50% 分摊（颈皮权重 1.43–1.665 m 渐变，转 180° 也不拧成麻花），歪头绕头自身前向轴。
//   · 手臂：两骨 IK（腕目标 + 肘极向），手朝向 = root / 胸 / 头空间四元数按权重混合（鞠躬时按在腹前的手跟着胸走；茶杯到喙前跟着头走）；
//     捏合点目标 g（拇指 / 食指远节之间，捏杯把 / 行李牌系绳）与掌心目标 pp（双手捧箱 / 握车把 / 提箱把）覆盖腕目标。wr = 手的附加局部旋转（摇铃甩腕）。
//   · 腿（人腿）：脚掌点 p（趾关节正下方地面）+ 脚俯仰 ph（>0 绕趾关节抬脚跟、<0 绕脚跟翘脚尖）+ 偏航 yw → 踝目标；髋 → 膝 → 踝两骨 IK（膝朝脚尖方向）；
//     趾骨按 tf 反向压平（抬脚跟时脚趾仍平贴地面）。步态支撑相脚掌点在 root 空间里以身体速度后移 → 世界里不动（脚锁）。
//   · 下摆骨 hemL/R：跟大腿屈伸的一部分（前屈 0.7、下蹲到 0.9、后伸 0.45）+ 二阶滞后（opts.dt 推进），大步 / 弯腰不穿模。
//   · 道具：bell（右拳握柄，铃舌随甩腕滞后摆）、cup（右手捏把）+ saucer（左掌托）、tag（左手捏系绳，牌子下垂）、cart（行李车，root 空间）、
//     valise（手提箱：双手捧 / 单手提把 / 放在地上 / 车上）；按姿态里的 0/1 显隐。faceShift 中段 setBellhopFace 换脸。
import * as THREE from 'three'
import type { BellhopRig, BArm } from './bellhopMesh'
import { setBellhopFace } from './bellhopMesh'
import { HANDS, J, side, type V3 } from './bellhopRig'
import { CART_BAR } from './bellhopProps'
import { litMaterial } from './shared'

export type BellhopClip = 'idle' | 'headTurn' | 'ringFriendly' | 'ringAnnoyed' | 'bow' | 'walk' | 'pushCart' | 'takeItem' | 'giveBack' | 'tagHand' | 'teaSip' | 'faceShift' | 'pickUp' | 'stillWatch'
export interface BellhopClipInfo { dur: number; loop: boolean; zh: string; speed?: number; stride?: number }
export const BELLHOP_CLIPS: Record<BellhopClip, BellhopClipInfo> = {
  idle: { dur: 6.0, loop: true, zh: '侍立' },
  headTurn: { dur: 3.2, loop: false, zh: '猫头鹰拧头 + 歪头' },
  ringFriendly: { dur: 2.4, loop: false, zh: '友好摇铃（清脆两下）' },
  ringAnnoyed: { dur: 3.4, loop: false, zh: '恼怒摇铃（沉重长摇）' },
  bow: { dur: 3.0, loop: false, zh: '躬身行礼' },
  walk: { dur: 1.05, loop: true, zh: '行走', speed: 1.05, stride: 1.1025 },
  pushCart: { dur: 1.25, loop: true, zh: '推行李车', speed: 0.7, stride: 0.875 },
  takeItem: { dur: 3.2, loop: false, zh: '双手接物' },
  giveBack: { dur: 3.2, loop: false, zh: '双手递还' },
  tagHand: { dur: 3.0, loop: false, zh: '递行李牌' },
  teaSip: { dur: 6.0, loop: false, zh: '饮茶（附图）' },
  faceShift: { dur: 1.4, loop: false, zh: '抽搐换脸' },
  pickUp: { dur: 4.6, loop: false, zh: '弯腰拾物放上车' },
  stillWatch: { dur: 2.0, loop: true, zh: '被注视·定住' },
}
/** faceShift：此刻换脸（片段时间） */
export const BELLHOP_FACE_SWAP_AT = 0.68

type Q4 = [number, number, number, number]
export interface BArmPose {
  t: V3; tc: V3; th: V3; cs: number; hs: number; pole: V3
  hq: Q4; hqc: Q4; hqh: Q4; hw: number; wr: V3
  curl: number[]; clav: V3
  /** 捏合点（拇指 / 食指远节之间）目标（root 空间），gw 权重 */
  g: V3; gw: number
  /** 掌心 / 握拳中心目标（root 空间），pw 权重；pk 0 = 掌心（捧）、1 = 拳心（握把） */
  pp: V3; pw: number; pk: number
}
export interface BLegPose { p: V3; ph: number; yw: number; tf: number }
export interface BellhopPose {
  root: V3; rootR: V3; hipsP: V3; hipsR: V3; spine: V3; chest: V3; neck: V3; head: V3
  L: BArmPose; R: BArmPose; legL: BLegPose; legR: BLegPose
  bell: number; clap: number; cup: number; saucer: number; cupOn: number; cupMouth: number; cupTilt: number
  tag: number; cart: number; cartP: V3; cartYaw: number
  /** 手提箱：显隐、放置位姿（root 空间：底面中心 + 偏航）、hold 0 放着 / 1 双手捧（两掌心中点）/ 2 右手提把 */
  item: number; itemP: V3; itemYaw: number; itemHold: number
  faceSwap: number; twitch: number
}
export interface BellhopAnimOpts {
  /** 叠加拧头角（rad，+ = 向角色左转）；headTurn 片段里 = 最终停住的角度（默认 π） */
  turn?: number
  /** 叠加歪头（rad，+ = 向角色左歪）；headTurn 片段默认 0.32 */
  tilt?: number
  /** faceShift：换前 / 换后的脸（默认 0 → 1；动画器自动取当前脸 → 另一张） */
  faceFrom?: number; faceTo?: number
  /** 随机种子 */
  seed?: number
  /** 二阶摆动步长（秒）；0 / 省略 = 不推进二阶 */
  dt?: number
  /** 全局时间（抖动用；默认 = 片段时间） */
  time?: number
}

// ---------- 小工具 ----------
const TAU = Math.PI * 2
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
const c01 = (x: number) => clamp(x, 0, 1)
const ss = (x: number) => { const t = c01(x); return t * t * (3 - 2 * t) }
const ramp = (t: number, a: number, b: number) => ss((t - a) / (b - a))
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI))
const frac = (x: number) => x - Math.floor(x)
const v3 = (a: V3 | THREE.Vector3) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]))
const nz = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const qArr = (q: THREE.Quaternion): Q4 => [q.x, q.y, q.z, q.w]
const Q_ID: Q4 = [0, 0, 0, 1]
function basisQuat(x0: V3, y0: V3, x1: V3, y1: V3): THREE.Quaternion {
  const mk = (x: V3, y: V3) => { const X = v3(x).normalize(), Y = v3(y); Y.addScaledVector(X, -Y.dot(X)).normalize(); const Z = new THREE.Vector3().crossVectors(X, Y); return new THREE.Matrix4().makeBasis(X, Y, Z) }
  const a = mk(x0, y0), b = mk(x1, y1)
  return new THREE.Quaternion().setFromRotationMatrix(b.multiply(a.transpose()))
}
/** 手朝向：手指方向 aDir、手背方向 dDir（root / 胸 / 头空间）→ 手骨在该空间里的旋转 */
export function bellhopHandQuat(s: number, aDir: V3, dDir: V3): Q4 { const F = HANDS[s].F; return qArr(basisQuat(F.a, F.d, nz(aDir), nz(dDir))) }
const hQ = bellhopHandQuat
/** 绕 root 空间轴 ax 转 ang 后的手朝向 */
const qRot = (q: Q4, ax: V3, ang: number): Q4 => qArr(new THREE.Quaternion().setFromAxisAngle(v3(nz(ax)), ang).multiply(new THREE.Quaternion(...q)))

// ---------- 静止量 ----------
const SH = (s: number) => side(J.shoulder, s), EL = (s: number) => side(J.elbow, s), WR = (s: number) => side(J.wrist, s)
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const LU = dist(J.elbow, J.shoulder), LF = dist(J.wrist, J.elbow)
const LT = dist(J.knee, J.hip), LS = dist(J.ankle, J.knee)
/** 静止时手指已经有的屈曲（bellhopRig.handFingers），负 curl = 伸直 */
const REST_FLEX: Record<string, number[]> = { thumb: [0.05, 0.16, 0.2], index: [0.18, 0.3, 0.18], middle: [0.22, 0.34, 0.2], ring: [0.27, 0.38, 0.22], pinky: [0.32, 0.42, 0.24] }
const FIST: Record<string, number[]> = { thumb: [0.4, 0.55, 0.5], index: [1.3, 1.45, 0.95], middle: [1.35, 1.5, 0.95], ring: [1.35, 1.5, 0.95], pinky: [1.4, 1.5, 0.95] }
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const
/** 脚：趾关节离地高、踝 / 脚跟着地点相对趾关节（静止，左脚；右脚 x 镜像） */
const TOE_H = J.toe[1]
const FOOT_A: V3 = [J.ankle[0] - J.toe[0], J.ankle[1] - J.toe[1], J.ankle[2] - J.toe[2]]
const FOOT_H: V3 = [J.ankle[0] - J.toe[0], -TOE_H, J.ankle[2] - 0.042 - J.toe[2]]
export const BELLHOP_FOOT_REST = (s: number): V3 => [J.toe[0] * s, 0, J.toe[2]]

// ---------- 姿态：默认 / 克隆 / 混合 ----------
function restArm(s: number): BArmPose {
  const S = SH(s), E = EL(s), W = WR(s)
  const d = nz([W[0] - S[0], W[1] - S[1], W[2] - S[2]]), e: V3 = [E[0] - S[0], E[1] - S[1], E[2] - S[2]]
  const k = e[0] * d[0] + e[1] * d[1] + e[2] * d[2]
  const pole = nz([e[0] - d[0] * k, e[1] - d[1] * k, e[2] - d[2] * k])
  return { t: [...W], tc: [...W], th: [...W], cs: 0, hs: 0, pole, hq: [...Q_ID], hqc: [...Q_ID], hqh: [...Q_ID], hw: 0, wr: [0, 0, 0], curl: [0, 0, 0, 0, 0], clav: [0, 0, 0], g: [...W], gw: 0, pp: [...W], pw: 0, pk: 0 }
}
export const BELLHOP_REST: BellhopPose = {
  root: [0, 0, 0], rootR: [0, 0, 0], hipsP: [0, 0, 0], hipsR: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  L: restArm(1), R: restArm(-1), legL: { p: BELLHOP_FOOT_REST(1), ph: 0, yw: 0, tf: 1 }, legR: { p: BELLHOP_FOOT_REST(-1), ph: 0, yw: 0, tf: 1 },
  bell: 0, clap: 0, cup: 0, saucer: 0, cupOn: 0, cupMouth: 0, cupTilt: 0, tag: 0, cart: 0, cartP: [0, 0, 1], cartYaw: 0,
  item: 0, itemP: [0, 0, 0.5], itemYaw: 0, itemHold: 0, faceSwap: 0, twitch: 0,
}
function deepClone<T>(x: T): T {
  if (Array.isArray(x)) return x.slice() as unknown as T
  if (x && typeof x === 'object') { const o: any = {}; for (const k in x) o[k] = deepClone((x as any)[k]); return o }
  return x
}
export const cloneBellhopPose = (p: BellhopPose) => deepClone(p)
const QKEYS = new Set(['hq', 'hqc', 'hqh'])
function mixAny(a: any, b: any, k: number, key = ''): any {
  if (typeof a === 'number') return a + (b - a) * k
  if (Array.isArray(a)) {
    if (QKEYS.has(key) && a.length === 4) {
      const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], sg = d < 0 ? -1 : 1
      const o = a.map((v: number, i: number) => v + (b[i] * sg - v) * k), l = Math.hypot(o[0], o[1], o[2], o[3]) || 1
      return o.map((v: number) => v / l)
    }
    return a.map((v: number, i: number) => v + (b[i] - v) * k)
  }
  const o: any = {}; for (const kk in a) o[kk] = mixAny(a[kk], b[kk], k, kk); return o
}
export function mixBellhopPose(a: BellhopPose, b: BellhopPose, k: number): BellhopPose {
  if (k <= 0) return deepClone(a)
  if (k >= 1) return deepClone(b)
  return mixAny(a, b, k)
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends number[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }
type Part = DeepPartial<BellhopPose>
function over(base: BellhopPose, p: Part): BellhopPose {
  const o = deepClone(base) as any
  const rec = (dst: any, src: any) => { for (const k in src) { const v = src[k]; if (v === undefined) continue; if (v && typeof v === 'object' && !Array.isArray(v)) rec(dst[k], v); else dst[k] = Array.isArray(v) ? v.slice() : v } }
  rec(o, p); return o
}
/** 关键帧：[[t, partial], ...]，每帧都是 base 上的覆盖；段间 smoothstep */
function keys(t: number, base: BellhopPose, ks: [number, Part][]): BellhopPose {
  if (t <= ks[0][0]) return over(base, ks[0][1])
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const [t0, a] = ks[i - 1], [t1, b] = ks[i]
    return mixBellhopPose(over(base, a), over(base, b), ss((t - t0) / (t1 - t0)))
  }
  return over(base, ks[ks.length - 1][1])
}

// ---------- 常用手型 / 手朝向 ----------
const CURL_RELAX = [0.1, 0.12, 0.15, 0.2, 0.25]
const CURL_FIST = [0.9, 1, 1, 1, 1]
const BELL_FIST = [0.45, 1, 1, 1, 1] // 拇指伸直贴着铃柄（不从拳前戳出来）
const CURL_GRIP = [0.6, 0.78, 0.82, 0.84, 0.86] // 握把（车把 / 箱把）
const CURL_HOLD = [0.15, -0.35, -0.3, -0.25, -0.2] // 捧（手指略伸、并拢）
const CURL_FLAT = [0.0, -0.8, -0.8, -0.75, -0.7]
/** 掌心朝上、手指朝前（略内收）：托茶碟 */
const HQ_PALMUP = (s: number) => hQ(s, [-s * 0.25, 0.04, 1], [s * 0.12, -1, 0.04])
/** 侍者站姿：双手在小腹前交叠（左手在下、右手覆在上）。手背朝前，手指朝对侧略下 */
const CROSS: Part = {
  L: { t: [0.072, 0.985, 0.142], pole: [1, -0.25, -0.5], hq: hQ(1, [-1, -0.3, 0.12], [0.05, 0.15, 1]), hw: 1, curl: [0.15, 0.12, 0.15, 0.2, 0.25] },
  R: { t: [-0.062, 0.995, 0.162], pole: [-1, -0.25, -0.5], hq: hQ(-1, [1, -0.25, 0.12], [-0.05, 0.15, 1]), hw: 1, curl: [0.2, 0.05, 0.08, 0.12, 0.18] },
}
/** 手自然下垂（走路） */
const HANG: Part = { L: { t: [0.245, 0.93, 0.03], pole: [0.4, -0.2, -1], hw: 0, curl: CURL_RELAX }, R: { t: [-0.245, 0.93, 0.03], pole: [-0.4, -0.2, -1], hw: 0, curl: CURL_RELAX } }

// ---------- 姿态底子 ----------
const BASE = BELLHOP_REST
/** 端正站立：胸略挺、下巴微收、双手交叠 */
const STAND: BellhopPose = over(BASE, { hipsP: [0, -0.004, 0], chest: [-0.025, 0, 0], neck: [0.02, 0, 0], head: [0.03, 0, 0], ...CROSS })

// ---------- 步态（人腿）----------
interface GaitSpec { D: number; duty: number; lift: number; center: number; width: number; heelOff: number; toeOff: number; strike: number }
/** u 0..1；左脚相位 0、右脚 0.5；支撑相脚掌点以身体速度后移（D·duty 在 duty 时间内）→ 世界不动 */
function gaitLegs(P: BellhopPose, u: number, G: GaitSpec) {
  for (const [leg, s, off] of [[P.legL, 1, 0], [P.legR, -1, 0.5]] as [BLegPose, number, number][]) {
    const ph = frac(u + off), sweep = G.D * G.duty
    let z: number, y = 0, pitch = 0
    if (ph < G.duty) {
      const k = ph / G.duty
      z = sweep * (0.5 - k)
      // 触地脚尖翘（绕脚跟）→ 放平 → 支撑末段抬脚跟（绕趾关节，脚掌点锁地）
      pitch = -G.strike * (1 - ss(k / 0.18)) + G.heelOff * ss((k - 0.55) / 0.45)
    } else {
      const k = (ph - G.duty) / (1 - G.duty)
      const e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k)
      z = sweep * (-0.5 + e)
      y = G.lift * Math.sin(Math.PI * Math.min(1, k * 1.08)) * (k < 0.15 ? 0.6 + 0.4 * (k / 0.15) : 1)
      // 离地：脚尖蹬地（脚继续前倾）→ 摆动中放平 → 落地前脚尖翘起
      pitch = G.toeOff * (1 - ss(k / 0.45)) - G.strike * ss((k - 0.6) / 0.4)
    }
    leg.p = [s * G.width, y, J.toe[2] + G.center + z]; leg.ph = pitch; leg.tf = ph < G.duty ? 1 : 0.4; leg.yw = s * 0.04
  }
}
const W_HIP = -0.026

// ---------- 片段 ----------
export function bellhopPose(clip: BellhopClip, t: number, o: BellhopAnimOpts = {}): BellhopPose {
  const C = BELLHOP_CLIPS[clip]
  t = C.loop ? frac(t / C.dur) * C.dur : clamp(t, 0, C.dur)
  const u = t / C.dur
  let P: BellhopPose
  switch (clip) {
    case 'idle': P = idlePose(t, u); break
    case 'headTurn': P = headTurnPose(t, o.turn ?? Math.PI, o.tilt ?? 0.32); return P
    case 'ringFriendly': P = ringFriendlyPose(t); break
    case 'ringAnnoyed': P = ringAnnoyedPose(t); break
    case 'bow': P = bowPose(t); break
    case 'walk': P = walkPose(u); break
    case 'pushCart': P = pushPose(u); break
    case 'takeItem': P = takePose(t, false); break
    case 'giveBack': P = takePose(C.dur - t, true); break
    case 'tagHand': P = tagPose(t); break
    case 'teaSip': P = teaPose(t); break
    case 'faceShift': P = faceShiftPose(t, o.seed ?? 1); break
    case 'pickUp': P = pickPose(t); break
    case 'stillWatch': P = deepClone(STAND); break
  }
  if (o.turn || o.tilt) turnHead(P, o.turn ?? 0, o.tilt ?? 0)
  return P
}
/** 拧头分摊：胸 5% / 颈 45% / 头 50%；歪头绕头自身前向轴（YXZ 的 Z） */
function turnHead(P: BellhopPose, yaw: number, tilt: number) {
  P.chest[1] += 0.05 * yaw; P.neck[1] += 0.45 * yaw; P.head[1] += 0.5 * yaw
  P.head[2] += tilt * 0.8; P.neck[2] += tilt * 0.2
}

// 1. idle：几乎静止；极轻呼吸（4 s 一次）+ 一次极轻的重心换脚
function idlePose(_t: number, u: number): BellhopPose {
  const P = deepClone(STAND)
  const br = Math.sin(u * TAU * 1.5)
  P.chest[0] -= 0.008 * br; P.spine[0] -= 0.003 * br; P.hipsP[1] += 0.0012 * br
  P.L.clav = [0, 0, 0.006 * br]; P.R.clav = [0, 0, -0.006 * br]
  const sh = Math.sin(u * TAU)
  P.hipsP[0] += 0.006 * sh; P.hipsR[2] -= 0.008 * sh; P.chest[2] += 0.004 * sh
  P.head[1] += 0.03 * bump(u, 0.55, 0.85)
  return P
}

// 2. headTurn：猫头鹰式拧头——0.25 s 起，0.55 s 内甩到目标角（略过冲回弹），停住；1.5 s 起慢慢歪头
function headTurnPose(t: number, turn: number, tilt: number): BellhopPose {
  const P = deepClone(STAND)
  const k = ramp(t, 0.25, 0.8), over_ = 0.06 * bump(t, 0.7, 1.15)
  const yaw = turn * (k + over_ * Math.sign(turn) * (Math.abs(turn) > 0.3 ? 1 : 0) / Math.max(0.3, Math.abs(turn)) * 0.3)
  const tl = tilt * ramp(t, 1.5, 2.3)
  turnHead(P, yaw, tl)
  // 拧头时身体完全不动；头先微微抬一下（猫头鹰拧头前的一顿）
  P.head[0] -= 0.05 * bump(t, 0.1, 0.4)
  return P
}

// 3. 摇铃：右拳握铃柄（拇指朝上、铃口朝下），举到胸前右侧；甩腕 = 手绕 root X 轴前后甩；铃舌滞后
const BELL_UP: Part = { R: { t: [-0.15, 1.3, 0.3], pole: [-1, -0.6, -0.2], hq: hQ(-1, [0.25, 0.0, 1], [-1, 0.05, 0.2]), hw: 1, curl: BELL_FIST, clav: [0, 0, -0.04] } }
const BELL_LOW: Part = { R: { t: [-0.2, 1.02, 0.2], pole: [-1, -0.4, -0.4], hq: hQ(-1, [0.25, -0.3, 1], [-1, 0.0, 0.2]), hw: 1, curl: BELL_FIST } }
function ringShake(P: BellhopPose, ang: number) { P.R.hq = qRot(P.R.hq, [1, 0, 0], ang) }
function ringFriendlyPose(t: number): BellhopPose {
  // 0–0.55 举铃；0.7 / 1.1 两下清脆（快甩：前 0.12 s、回 0.1 s）；1.6 起放下
  const P = keys(t, STAND, [[0, { bell: 1, ...BELL_LOW }], [0.55, { bell: 1, ...BELL_UP, head: [0.06, -0.08, 0] }], [1.6, { bell: 1, ...BELL_UP, head: [0.04, -0.06, 0] }], [2.4, { bell: 1, ...BELL_LOW }]])
  let a = 0, cl = 0
  for (const t0 of [0.72, 1.12]) {
    const x = t - t0
    if (x > 0 && x < 0.32) { a += -0.55 * Math.sin(Math.PI * Math.min(1, x / 0.22)) * Math.exp(-4 * x); cl += 0.9 * Math.sin(Math.min(x / 0.32, 1) * TAU * 1.5) * Math.exp(-6 * x) }
    if (x >= 0.32) cl += 0.15 * Math.sin(x * 40) * Math.exp(-10 * x)
  }
  ringShake(P, a); P.clap = cl
  P.R.wr = [0.4 * a, 0, 0]
  return P
}
function ringAnnoyedPose(t: number): BellhopPose {
  // 身体前压（胸 / 头前探），高举铃；1.0 s 一下沉重的大甩（慢抬 → 猛落），接着 1.3–2.6 s 长摇（快速小幅），2.8 起放下
  const lean: Part = { hipsP: [0, -0.01, 0.02], hipsR: [0.06, 0, 0], spine: [0.08, 0, 0], chest: [0.1, 0, 0], neck: [0.06, 0, 0], head: [0.1, -0.05, 0] }
  const P = keys(t, STAND, [[0, { bell: 1, ...BELL_LOW }], [0.6, { bell: 1, ...BELL_UP, ...lean, R: { t: [-0.14, 1.4, 0.34] } }], [2.6, { bell: 1, ...BELL_UP, ...lean, R: { t: [-0.14, 1.38, 0.36] } }], [3.4, { bell: 1, ...BELL_LOW }]])
  const wind = -0.5 * ramp(t, 0.6, 0.95) * (1 - ramp(t, 0.95, 1.08)), slam = 0.75 * ramp(t, 0.95, 1.08) * (1 - ramp(t, 1.15, 1.45))
  const long = t > 1.25 && t < 2.7 ? 0.22 * Math.sin((t - 1.25) * TAU * 7) * (1 - ramp(t, 2.3, 2.7)) : 0
  const a = wind + slam + long
  ringShake(P, a); P.R.wr = [0.3 * a, 0, 0]
  P.clap = (t > 1.0 ? 1.1 * Math.sin((t - 1.0) * TAU * 3.2) * Math.exp(-2.2 * (t - 1.0)) : 0) + (t > 1.25 && t < 2.8 ? 0.6 * Math.sin((t - 1.25) * TAU * 7 - 1.2) : 0) - 0.4 * wind
  // 前压时肩跟着落一下
  P.chest[0] += 0.05 * bump(t, 0.95, 1.4); P.head[0] += 0.06 * bump(t, 0.95, 1.4)
  return P
}

// 4. bow：右手按在腹前（胸空间）、左手背到身后（胸空间），以髋为轴躬身 ~35°，停一拍，直起
const BOW_HANDS: Part = {
  R: { cs: 1, tc: [-0.02, 1.05, 0.165], pole: [-1, -0.3, -0.2], hqc: hQ(-1, [1, 0.12, 0.05], [0, 0.05, 1]), hw: 1, curl: [0.1, -0.1, -0.05, 0.0, 0.05] },
  L: { cs: 1, tc: [0.08, 0.98, -0.2], pole: [1, -0.4, 0.4], hqc: hQ(1, [-1, -0.05, -0.2], [0.1, 0.1, -1]), hw: 1, curl: [0.2, 0.1, 0.15, 0.2, 0.25] },
}
function bowPose(t: number): BellhopPose {
  const down: Part = { ...BOW_HANDS, hipsP: [0, -0.012, -0.055], hipsR: [0.36, 0, 0], spine: [0.12, 0, 0], chest: [0.06, 0, 0], neck: [0.04, 0, 0], head: [0.12, 0, 0] }
  return keys(t, STAND, [[0, {}], [0.25, {}], [0.85, BOW_HANDS], [1.5, down], [2.05, down], [2.7, BOW_HANDS], [3.0, {}]])
}

// 5. walk：端正步态，手臂小幅摆
function walkPose(u: number): BellhopPose {
  const P = over(STAND, HANG)
  const C = BELLHOP_CLIPS.walk
  gaitLegs(P, u, { D: C.stride!, duty: 0.6, lift: 0.07, center: 0.0, width: 0.09, heelOff: 0.5, toeOff: 0.55, strike: 0.22 })
  const s1 = Math.sin(u * TAU), bob = Math.cos((u - 0.3) * TAU * 2) // 单脚支撑中段最高、双脚支撑最低
  P.hipsP = [0.012 * Math.sin((u - 0.06) * TAU), W_HIP + 0.013 * bob, 0.0]
  P.hipsR = [0.02, 0.07 * s1, -0.025 * Math.sin((u - 0.1) * TAU)]
  P.spine = [0.0, -0.035 * s1, 0.012 * Math.sin((u - 0.1) * TAU)]; P.chest = [-0.03, -0.05 * s1, 0.0]
  P.neck = [0.02, 0.03 * s1, 0]; P.head = [0.02 - 0.008 * bob, 0.015 * s1, 0]
  for (const [A, s] of [[P.L, 1], [P.R, -1]] as [BArmPose, number][]) {
    const k = -s * s1 // 左腿前 → 右臂前
    A.t = [s * 0.24, 0.94 + 0.012 * Math.max(0, k), 0.035 + 0.09 * k]; A.pole = [s * 0.4, -0.2, -1]
    A.wr = [0.06 + 0.06 * Math.max(0, k), 0, 0]; A.curl = [0.25, 0.3, 0.35, 0.4, 0.45]
  }
  return P
}

// 6. pushCart：双手握车把（车在身前，随根移动），身体略前倾，步幅小
export const BELLHOP_CART_PUSH = { p: [0, 0, 0.93] as V3, yaw: -Math.PI / 2 }
/** 推把在 root 空间（推车姿态）：车局部 (x, y, z) → 绕 Y 转 yaw → 平移 */
const cartToRoot = (cp: V3, yaw: number, l: V3): V3 => { const c = Math.cos(yaw), s = Math.sin(yaw); return [cp[0] + c * l[0] + s * l[2], cp[1] + l[1], cp[2] - s * l[0] + c * l[2]] }
const GRIP_BAR = (s: number): V3 => cartToRoot(BELLHOP_CART_PUSH.p, BELLHOP_CART_PUSH.yaw, [CART_BAR.x, CART_BAR.y, -s * 0.17])
function pushPose(u: number): BellhopPose {
  const P = deepClone(STAND)
  const C = BELLHOP_CLIPS.pushCart
  gaitLegs(P, u, { D: C.stride!, duty: 0.64, lift: 0.055, center: -0.01, width: 0.095, heelOff: 0.42, toeOff: 0.4, strike: 0.15 })
  const s1 = Math.sin(u * TAU), bob = Math.cos((u - 0.3) * TAU * 2)
  P.hipsP = [0.008 * Math.sin((u - 0.06) * TAU), W_HIP - 0.006 + 0.009 * bob, -0.01]
  P.hipsR = [0.08, 0.04 * s1, -0.02 * Math.sin((u - 0.1) * TAU)]
  P.spine = [0.06, -0.02 * s1, 0]; P.chest = [0.04, -0.02 * s1, 0]; P.neck = [-0.04, 0, 0]; P.head = [-0.02, 0.01 * s1, 0]
  for (const [A, s] of [[P.L, 1], [P.R, -1]] as [BArmPose, number][]) {
    A.pp = GRIP_BAR(s); A.pw = 1; A.pk = 1; A.pole = [s * 0.7, -0.7, -0.3]
    A.hq = hQ(s, [-s * 0.15, -0.55, 1], [0, 1, 0.5]); A.hw = 1; A.curl = CURL_GRIP
  }
  P.cart = 1; P.cartP = [...BELLHOP_CART_PUSH.p]; P.cartYaw = BELLHOP_CART_PUSH.yaw
  return P
}

// 7. takeItem / giveBack：双手捧手提箱两侧（掌心相对），从「客人手里」（身前 0.62 m）接到胸前；giveBack 倒放
const VALISE = { w: 0.4, h: 0.28, d: 0.12, handle: 0.032 }
function holdHands(c: V3, k: number): Part {
  // 掌心贴箱子两侧（箱中心 c，宽 w），手指朝前略上；k 握紧程度
  const hx = VALISE.w / 2 + 0.008
  return {
    L: { pp: [c[0] + hx, c[1] + 0.01, c[2] + 0.0], pw: 1, pk: 0, pole: [1, -0.6, -0.2], hq: hQ(1, [-0.05, 0.12, 1], [1, 0.05, 0.05]), hw: 1, curl: [mix(0.1, 0.3, k), mix(-0.4, -0.15, k), mix(-0.35, -0.1, k), mix(-0.3, -0.05, k), mix(-0.25, 0, k)] },
    R: { pp: [c[0] - hx, c[1] + 0.01, c[2] + 0.0], pw: 1, pk: 0, pole: [-1, -0.6, -0.2], hq: hQ(-1, [0.05, 0.12, 1], [-1, 0.05, 0.05]), hw: 1, curl: [mix(0.1, 0.3, k), mix(-0.4, -0.15, k), mix(-0.35, -0.1, k), mix(-0.3, -0.05, k), mix(-0.25, 0, k)] },
  }
}
const mix = (a: number, b: number, k: number) => a + (b - a) * k
const GUEST_C: V3 = [0, 1.06, 0.5], CHEST_C: V3 = [0, 1.1, 0.29]
function takePose(t: number, give: boolean): BellhopPose {
  // （giveBack 用倒放时间：从胸前递出去，松手，收回交叠）
  const P = keys(t, STAND, [
    [0, { item: 1 }],
    [0.45, { item: 1 }],
    [1.15, { item: 1, ...holdHands(GUEST_C, 0), hipsR: [0.06, 0, 0], spine: [0.04, 0, 0], chest: [0.08, 0, 0], head: [0.12, 0, 0] }],
    [1.45, { item: 1, ...holdHands(GUEST_C, 1), hipsR: [0.06, 0, 0], spine: [0.04, 0, 0], chest: [0.08, 0, 0], head: [0.12, 0, 0] }],
    [2.35, { item: 1, ...holdHands(CHEST_C, 1), head: [0.12, 0, 0] }],
    [3.2, { item: 1, ...holdHands(CHEST_C, 1), head: [0.04, 0, 0] }],
  ])
  // 箱子：1.45 s 之前在客人手里（悬在身前 GUEST_C），之后在两掌心之间
  const held = t >= 1.4
  P.itemHold = held ? 1 : 0
  P.itemP = [GUEST_C[0], GUEST_C[1] - VALISE.h / 2, GUEST_C[2]]
  // 收到胸前时微微点头致意（giveBack 递出时也点一下）
  P.head[0] += 0.08 * bump(t, give ? 1.0 : 1.5, give ? 1.6 : 2.1)
  return P
}

// 8. tagHand：左手到左侧下摆口袋取出行李牌（捏住系绳），伸到身前递出，停住，收回；右手保持交叠在腹前
const POCKET: V3 = [0.13, 0.9, 0.11]
function tagPose(t: number): BellhopPose {
  const pinchQ = hQ(1, [-0.35, -0.3, 1], [0.35, 0.9, 0.2]) // 手背朝上略外，手指朝前内
  const P = keys(t, STAND, [
    [0, {}],
    [0.35, {}],
    [0.8, { L: { g: POCKET, gw: 1, hq: hQ(1, [0, -1, 0.3], [1, 0, 0.1]), hw: 1, pole: [1, -0.2, -0.6], curl: [0.4, 0.5, 0.4, 0.45, 0.5] } }],
    [1.0, { tag: 1, L: { g: [POCKET[0], POCKET[1] + 0.02, POCKET[2] + 0.01], gw: 1, hq: hQ(1, [0, -1, 0.3], [1, 0, 0.1]), hw: 1, pole: [1, -0.2, -0.6], curl: [0.45, 0.62, 0.7, 0.75, 0.8] } }],
    [1.6, { tag: 1, L: { g: [0.07, 1.22, 0.5], gw: 1, hq: pinchQ, hw: 1, pole: [1, -0.5, -0.3], curl: [0.45, 0.62, 0.7, 0.75, 0.8] }, chest: [0.04, 0.06, 0], head: [0.08, 0.05, 0] }],
    [2.3, { tag: 1, L: { g: [0.07, 1.22, 0.52], gw: 1, hq: pinchQ, hw: 1, pole: [1, -0.5, -0.3], curl: [0.45, 0.62, 0.7, 0.75, 0.8] }, chest: [0.04, 0.06, 0], head: [0.12, 0.05, 0] }],
    [3.0, { tag: 0 }],
  ])
  P.tag = t > 0.92 && t < 2.6 ? 1 : 0
  return P
}

// 9. teaSip（附图）：左手掌心朝上托茶碟、右手拇指 + 食指捏住杯把；举杯到喙前、杯口朝面盘倾，停一下，放回碟上
// [修正 10-31] 旧版问题：举杯 / 放杯过渡段里右手目标在「root 空间 t」和「头空间 th（未设，默认值落到头顶上方 0.9 m）」之间插值
//   → 1.45 s / 3.2 s 前后手腕冲到 1.83 m、肘外翻高过肩；托碟 / 捏杯时肘向外横张、右手指尖朝后（手腕在杯前方，前臂从前面伸过来）；
//   杯贴得离喙太近（倾斜后杯沿压进面盘下缘）。
// 新做法：杯子始终在右手里，杯位姿 = 碟上 → 喙前 一条带弧度的路径（P.cupMouth 0..1 连续），右手捏合点每帧对到杯把（gw = 1），
//   手朝向 / 肘极向按同一个进度插值（都在 root 空间），不再经过头空间目标。参照附图：肘自然下垂贴近身侧，右手在胸前捏杯把、
//   手背朝前、手指朝左；举杯时肘向前下方抬起（不外张），前臂斜向内上、手指斜朝左上。
/** 捏杯（杯在碟上）：手在杯右侧，手指朝左略前下、手背朝前上（附图） */
const CUP_HQ_ON = hQ(-1, [0.8, -0.25, 0.5], [-0.3, 0.62, 0.72])
/** 喙前饮：手指斜朝左上、手背朝前（拇指压在杯把上沿） */
const CUP_HQ_SIP = hQ(-1, [0.62, 0.72, 0.12], [0.08, -0.2, 1])
const CUP_POLE_ON: V3 = [-0.42, -1, -0.38], CUP_POLE_SIP: V3 = [-0.3, -1, 0.55]
const SAUCER_L: Part = { L: { t: [0.13, 1.075, 0.225], pole: [0.38, -1, -0.55], hq: hQ(1, [-0.28, 0.04, 1], [0.1, -1, 0.04]), hw: 1, curl: [-0.9, -0.25, -0.2, -0.12, -0.05] } } // 肘贴身侧下垂，前臂水平向前；拇指伸平（不戳进茶碟）
/** 举杯进度（0 碟上 → 1 喙前）、杯倾角 */
export const teaCupK = (t: number) => ss((t - 1.0) / 0.8) * (1 - ss((t - 3.05) / 0.8))
function teaPose(t: number): BellhopPose {
  const PINCH = [0.42, 0.55, 0.85, 0.95, 0.9]
  const k = teaCupK(t)
  const P = keys(t, STAND, [
    [0, { cup: 1, saucer: 1, ...SAUCER_L }],
    [0.8, { cup: 1, saucer: 1, ...SAUCER_L, head: [0.16, 0, 0] }],
    [1.4, { cup: 1, saucer: 1, ...SAUCER_L, head: [0.04, 0, 0] }],
    [1.9, { cup: 1, saucer: 1, ...SAUCER_L, head: [-0.1, 0, 0] }],
    [3.0, { cup: 1, saucer: 1, ...SAUCER_L, head: [-0.17, 0, 0], neck: [-0.04, 0, 0] }],
    [3.5, { cup: 1, saucer: 1, ...SAUCER_L, head: [0.04, 0, 0] }],
    [3.95, { cup: 1, saucer: 1, ...SAUCER_L, head: [0.14, 0, 0] }],
    [4.9, { cup: 1, saucer: 1, ...SAUCER_L, head: [0.04, 0.2, 0.08] }],
    [6.0, { cup: 1, saucer: 1, ...SAUCER_L, head: [0.06, 0, 0] }],
  ])
  const qh = new THREE.Quaternion(...CUP_HQ_ON).slerp(new THREE.Quaternion(...CUP_HQ_SIP), k)
  const pl: V3 = [mix(CUP_POLE_ON[0], CUP_POLE_SIP[0], k), mix(CUP_POLE_ON[1], CUP_POLE_SIP[1], k), mix(CUP_POLE_ON[2], CUP_POLE_SIP[2], k)]
  P.R = { ...P.R, hs: 0, cs: 0, hq: qArr(qh), hw: 1, pole: pl, curl: PINCH, clav: [0, 0, -0.012 * k] }
  P.cupOn = 1; P.cupMouth = k
  P.cupTilt = 0.45 * ramp(t, 1.75, 2.25) * (1 - ramp(t, 2.85, 3.15))
  return P
}

// 10. faceShift：面盘抽搐（头高频抖 + 面盘前后弹）→ 中段换脸 → 一下回弹定住
function faceShiftPose(t: number, seed: number): BellhopPose {
  const P = deepClone(STAND)
  const env = ramp(t, 0.25, 0.4) * (1 - ramp(t, 0.95, 1.15))
  const j = (f: number, ph: number) => Math.sin(t * f + ph + seed) + 0.6 * Math.sin(t * f * 1.73 + ph * 2.1)
  P.head[0] += env * 0.09 * j(53, 0.3); P.head[1] += env * 0.13 * j(61, 1.7); P.head[2] += env * 0.1 * j(47, 2.9)
  P.neck[1] += env * 0.04 * j(39, 0.9)
  P.chest[0] += 0.03 * env; P.L.clav = [0, 0, 0.03 * env]; P.R.clav = [0, 0, -0.03 * env] // 耸肩
  P.head[0] += 0.08 * bump(t, 0.6, 0.8) - 0.05 * bump(t, 1.05, 1.35)
  P.twitch = env
  P.faceSwap = t >= BELLHOP_FACE_SWAP_AT ? 1 : 0
  return P
}

// 11. pickUp：屈膝弯腰，右手握住地上手提箱的提把（左手扶膝），提起直身，右转身把箱子放到右侧行李车顶的箱垛上，松手，回到侍立
export const BELLHOP_CART_SIDE = { p: [-0.5, 0, 0.32] as V3, yaw: -Math.PI / 2 }
const FLOOR_ITEM: V3 = [0.03, 0, 0.44]
/** 车顶箱垛上的放置点（root 空间，箱底中心）：车局部 (−0.12, 0.612, 0) */
const CART_TOP: V3 = cartToRoot(BELLHOP_CART_SIDE.p, BELLHOP_CART_SIDE.yaw, [-0.12, 0.614, -0.13])
const HANDLE_Y = VALISE.h + VALISE.handle * 0.8
function pickPose(t: number): BellhopPose {
  const gripQ = (yaw: number) => qRot(hQ(-1, [0, -0.35, 1], [-0.15, 1, 0.2]), [0, 1, 0], yaw) // 手背朝上、手指朝前下，握住横向提把
  const handle = (c: V3): V3 => [c[0], c[1] + HANDLE_Y, c[2]]
  const crouch: Part = {
    hipsP: [0, -0.36, -0.15], hipsR: [0.62, 0, 0], spine: [0.3, 0, 0.02], chest: [0.18, 0, 0], neck: [0.1, 0, 0], head: [0.15, 0, 0],
    L: { t: [0.15, 0.6, 0.33], pole: [1, 0, -0.3], hq: hQ(1, [-0.3, -0.75, 0.6], [0.6, 0.2, 0.75]), hw: 1, curl: [0.2, 0.3, 0.35, 0.4, 0.45] },
    legL: { p: [0.11, 0, J.toe[2] + 0.02] }, legR: { p: [-0.13, 0, J.toe[2] - 0.08] },
  }
  const reach = (k: number): Part => ({ ...crouch, R: { pp: handle(FLOOR_ITEM), pw: 1, pk: 1, pole: [-1, 0.2, -0.3], hq: gripQ(0), hw: 1, curl: k > 0 ? CURL_GRIP : [0.1, -0.2, -0.15, -0.1, -0.05] } })
  const up: Part = { hipsP: [0, -0.02, 0], chest: [0.02, -0.15, 0], R: { pp: [-0.2, 0.84, 0.24], pw: 1, pk: 1, pole: [-1, -0.3, -0.2], hq: gripQ(0.2), hw: 1, curl: CURL_GRIP }, L: { ...HANG.L } }
  const twist: Part = { hipsP: [-0.035, -0.04, 0], hipsR: [0.06, -0.28, -0.06], spine: [0.12, -0.25, -0.12], chest: [0.1, -0.3, -0.1], head: [0.2, -0.3, 0.08], legL: { p: [0.1, 0, J.toe[2] + 0.02] }, legR: { p: [-0.13, 0, J.toe[2] - 0.08] } }
  const place = (dy: number, k: number): Part => ({ ...twist, R: { pp: handle([CART_TOP[0], CART_TOP[1] + dy, CART_TOP[2]]), pw: 1, pk: 1, pole: [-0.6, -0.6, -0.4], hq: gripQ(Math.PI / 2 - 0.25), hw: 1, curl: k > 0 ? CURL_GRIP : [0.1, -0.2, -0.15, -0.1, -0.05] }, L: { ...HANG.L, t: [0.22, 0.95, 0.08] } })
  const P = keys(t, STAND, [
    [0, { item: 1, cart: 1 }],
    [0.3, { item: 1, cart: 1 }],
    [1.3, { item: 1, cart: 1, ...reach(0) }],
    [1.55, { item: 1, cart: 1, ...reach(1) }],
    [2.4, { item: 1, cart: 1, ...up }],
    [3.2, { item: 1, cart: 1, ...place(0.05, 1) }],
    [3.45, { item: 1, cart: 1, ...place(0, 1) }],
    [3.7, { item: 1, cart: 1, ...place(0.02, 0) }],
    [4.6, { item: 1, cart: 1 }],
  ])
  P.cartP = [...BELLHOP_CART_SIDE.p]; P.cartYaw = BELLHOP_CART_SIDE.yaw
  const held = t >= 1.5 && t < 3.5
  P.itemHold = held ? 2 : 0
  P.itemP = t < 2 ? [...FLOOR_ITEM] : [...CART_TOP]; P.itemYaw = t < 2 ? 0 : Math.PI / 2 - 0.25
  return P
}

// ---------- 骨骼求解（root 空间 FK）----------
interface Xf { p: THREE.Vector3; q: THREE.Quaternion }
function fk(b: THREE.Object3D, root: THREE.Object3D): Xf {
  if (b === root) return { p: new THREE.Vector3(), q: new THREE.Quaternion() }
  const P = fk(b.parent!, root)
  return { p: P.p.clone().add(b.position.clone().applyQuaternion(P.q)), q: P.q.clone().multiply(b.quaternion) }
}
function setRootQ(b: THREE.Object3D, root: THREE.Object3D, q: THREE.Quaternion) { const pq = fk(b.parent!, root).q; b.quaternion.copy(pq.invert().multiply(q)) }
function setE(b: THREE.Object3D, e: V3) { b.rotation.order = 'YXZ'; b.rotation.set(e[0], e[1], e[2]) }
const frameM = (a: THREE.Vector3, n: THREE.Vector3) => { const c = new THREE.Vector3().crossVectors(a, n); return new THREE.Matrix4().makeBasis(a, n, c) }
interface ChainRest { u0: THREE.Vector3; f0: THREE.Vector3; n0: THREE.Vector3 }
const chainRest = (a: V3, b: V3, c: V3): ChainRest => {
  const u0 = v3(b).sub(v3(a)).normalize(), f0 = v3(c).sub(v3(b)).normalize()
  return { u0, f0, n0: new THREE.Vector3().crossVectors(u0, f0).normalize() }
}
const ARM_REST: Record<number, ChainRest> = { 1: chainRest(SH(1), EL(1), WR(1)), [-1]: chainRest(SH(-1), EL(-1), WR(-1)) }
const LEG_REST: Record<number, ChainRest> = { 1: chainRest(side(J.hip, 1), side(J.knee, 1), side(J.ankle, 1)), [-1]: chainRest(side(J.hip, -1), side(J.knee, -1), side(J.ankle, -1)) }
const _res = { arm: 0, leg: 0 }
/** 最近一次 apply 的 IK 残差（米）：手腕 / 踝没够到的距离（验收用） */
export const bellhopIkResidual = () => ({ ..._res })
/** 两骨 IK：根 S、目标 T、段长 L1/L2、极向 pole → 两段的 root 空间旋转 */
function twoBone(S: THREE.Vector3, T: THREE.Vector3, L1: number, L2: number, poleV: V3, R: ChainRest, minD: number) {
  const d = T.clone().sub(S); let D = d.length(); const dh = d.clone().normalize()
  const Dc = clamp(D, minD, L1 + L2 - 0.002), miss = D - Dc; D = Dc
  const pole = v3(poleV); pole.addScaledVector(dh, -pole.dot(dh)); if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1); pole.normalize()
  const ca = clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1), sa = Math.sqrt(1 - ca * ca)
  const E = S.clone().addScaledVector(dh, L1 * ca).addScaledVector(pole, L1 * sa), W = S.clone().addScaledVector(dh, D)
  const u1 = E.clone().sub(S).normalize(), f1 = W.clone().sub(E).normalize()
  let n1 = new THREE.Vector3().crossVectors(u1, f1)
  if (n1.lengthSq() < 1e-6) n1 = new THREE.Vector3().crossVectors(dh, pole).multiplyScalar(-1)
  n1.normalize()
  // 静止链的弯曲平面法线方向与 n1 一致（同号）
  if (n1.dot(R.n0) < -0.2 && R.n0.lengthSq() > 0) { /* 允许翻转：极向决定 */ }
  const Ru = new THREE.Quaternion().setFromRotationMatrix(frameM(u1, n1).multiply(frameM(R.u0, R.n0).transpose()))
  const Rf = new THREE.Quaternion().setFromRotationMatrix(frameM(f1, n1).multiply(frameM(R.f0, R.n0).transpose()))
  return { Ru, Rf, miss: Math.max(0, miss), f1 }
}
function setFingers(A: BArm, curl: number[]) {
  FINGERS.forEach((f, i) => {
    const c = curl[i] ?? 0
    A.fingers[f].forEach((b, k) => {
      const ang = c >= 0 ? c * FIST[f][k] : Math.max(c, -1) * REST_FLEX[f][k]
      b.quaternion.setFromAxisAngle(b.userData.flexAxis as THREE.Vector3, ang)
    })
  })
}
function fkRel(b: THREE.Object3D, stop: THREE.Object3D): THREE.Vector3 {
  if (b === stop) return new THREE.Vector3()
  const chain: THREE.Object3D[] = []; for (let x: THREE.Object3D | null = b; x && x !== stop; x = x.parent) chain.push(x)
  const p = new THREE.Vector3(), q = new THREE.Quaternion()
  for (let i = chain.length - 1; i >= 0; i--) { p.add(chain[i].position.clone().applyQuaternion(q)); q.multiply(chain[i].quaternion) }
  return p
}
/** 捏合点在手骨局部（拇指远节 / 食指远节骨原点的中点 → 两指中节末端之间） */
function pinchLocal(A: BArm) { return fkRel(A.fingers.thumb[2], A.wrist).lerp(fkRel(A.fingers.index[2], A.wrist), 0.5) }
/** 掌心 / 拳心在手骨局部（静止手形坐标系，不随手指屈伸）：pk 0 掌心表面、1 拳心（握把处） */
function palmLocal(s: number, pk: number) {
  const F = HANDS[s].F
  return v3(F.o).addScaledVector(v3(F.a), mix(0.072, 0.075, pk)).addScaledVector(v3(F.d), mix(-0.024, -0.034, pk)).addScaledVector(v3(F.r), mix(0, 0.006, pk)).sub(v3(side(J.wrist, s)))
}
function solveArm(rig: BellhopRig, A: BArm, s: number, P: BArmPose, chest: Xf, head: Xf) {
  const root = rig.root
  setE(A.clav, P.clav)
  setFingers(A, P.curl)
  const S = fk(A.shoulder, root).p
  const qR = new THREE.Quaternion(...P.hq), qC = chest.q.clone().multiply(new THREE.Quaternion(...P.hqc)), qH = head.q.clone().multiply(new THREE.Quaternion(...P.hqh))
  const qWorld = qR.slerp(qC, c01(P.cs)).slerp(qH, c01(P.hs))
  const tR = v3(P.t), tC = v3(P.tc).sub(v3(J.chest)).applyQuaternion(chest.q).add(chest.p), tH = v3(P.th).applyQuaternion(head.q).add(head.p)
  const T = tR.lerp(tC, c01(P.cs)).lerp(tH, c01(P.hs))
  if (P.gw > 0) T.lerp(v3(P.g).sub(pinchLocal(A).applyQuaternion(qWorld)), c01(P.gw))
  if (P.pw > 0) T.lerp(v3(P.pp).sub(palmLocal(s, P.pk).applyQuaternion(qWorld)), c01(P.pw))
  const { Ru, Rf, miss } = twoBone(S, T, LU, LF, P.pole, ARM_REST[s], 0.12)
  _res.arm = Math.max(_res.arm, miss)
  setRootQ(A.shoulder, root, Ru)
  A.elbow.quaternion.copy(Ru.clone().invert().multiply(Rf))
  const qW = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.wr[0], P.wr[1], P.wr[2], 'YXZ'))
  const qHand = qWorld.multiply(qW), qFollow = Rf.clone().multiply(qW)
  const qFinal = P.hw >= 1 ? qHand : qFollow.slerp(qHand, c01(P.hw))
  A.wrist.quaternion.copy(Rf.clone().invert().multiply(qFinal))
}
const _ax = new THREE.Vector3(1, 0, 0), _ay = new THREE.Vector3(0, 1, 0)
function solveLeg(rig: BellhopRig, s: number, P: BLegPose) {
  const root = rig.root, S = s > 0 ? 'L' : 'R', bn = rig.bones
  const thigh = bn['thigh' + S], shin = bn['shin' + S], foot = bn['foot' + S], toe = bn['toe' + S]
  const qy = new THREE.Quaternion().setFromAxisAngle(_ay, P.yw)
  const toeJ = v3(P.p).add(new THREE.Vector3(0, TOE_H, 0))
  const oA = v3([FOOT_A[0] * s, FOOT_A[1], FOOT_A[2]]).applyQuaternion(qy), oH = v3([FOOT_H[0] * s, FOOT_H[1], FOOT_H[2]]).applyQuaternion(qy)
  const lat = _ax.clone().applyQuaternion(qy)
  const qp = new THREE.Quaternion().setFromAxisAngle(lat, P.ph)
  let ankle: THREE.Vector3
  if (P.ph >= 0) ankle = toeJ.clone().add(oA.clone().applyQuaternion(qp)) // 绕趾关节抬脚跟
  else { const heel = toeJ.clone().add(oH); ankle = heel.clone().add(oA.clone().sub(oH).applyQuaternion(qp)) } // 绕脚跟翘脚尖
  const H = fk(thigh, root).p
  const pole = new THREE.Vector3(0, 0, 1).applyQuaternion(qy).add(new THREE.Vector3(0, 0.15, 0))
  const { Ru, Rf, miss } = twoBone(H, ankle, LT, LS, [pole.x, pole.y, pole.z], LEG_REST[s], 0.25)
  _res.leg = Math.max(_res.leg, miss)
  setRootQ(thigh, root, Ru)
  shin.quaternion.copy(Ru.clone().invert().multiply(Rf))
  const qFoot = qp.clone().multiply(qy)
  foot.quaternion.copy(Rf.clone().invert().multiply(qFoot))
  toe.quaternion.setFromAxisAngle(_ax, -Math.max(0, P.ph) * P.tf)
}

// ---------- 下摆骨 + 二阶 ----------
interface Dyn { init: boolean; hem: number[]; hemV: number[]; clap: number; clapV: number; tag: number; tagV: number; lastHand: THREE.Vector3 }
function dynOf(rig: BellhopRig): Dyn {
  const R = rig as BellhopRig & { __bdyn?: Dyn }
  return (R.__bdyn ??= { init: false, hem: [0, 0, 0, 0], hemV: [0, 0, 0, 0], clap: 0, clapV: 0, tag: 0, tagV: 0, lastHand: new THREE.Vector3() })
}
export function resetBellhopDynamics(rig: BellhopRig) { const d = dynOf(rig); d.init = false; d.hem.fill(0); d.hemV.fill(0); d.clap = 0; d.clapV = 0; d.tag = 0; d.tagV = 0 }
/** 下摆目标角：大腿方向（hips 空间）的前屈 / 外展 → 下摆跟随一部分 */
function hemTarget(rig: BellhopRig, s: number): [number, number] {
  const S = s > 0 ? 'L' : 'R'
  const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(rig.bones['thigh' + S].quaternion)
  const flex = Math.atan2(dir.z, -dir.y), abd = Math.atan2(dir.x, -dir.y)
  const k = flex > 0 ? mix(0.7, 0.92, ss((flex - 0.4) / 0.8)) : 0.45
  return [flex * k, abd * 0.6]
}
function applyHem(rig: BellhopRig, dt: number | undefined) {
  const D = dynOf(rig)
  for (const s of [1, -1]) {
    const i = s > 0 ? 0 : 2, [fx, ab] = hemTarget(rig, s)
    if (dt === undefined || !D.init) { D.hem[i] = fx; D.hem[i + 1] = ab; D.hemV[i] = 0; D.hemV[i + 1] = 0 }
    else if (dt > 0) {
      const h = Math.min(dt, 0.05), K = 160, C = 15
      for (const [j, tg] of [[i, fx], [i + 1, ab]] as [number, number][]) { D.hemV[j] += (K * (tg - D.hem[j]) - C * D.hemV[j]) * h; D.hem[j] += D.hemV[j] * h }
      // 下摆前片不许落后大腿太多（穿模）：前屈时至少跟到目标的 80%
      if (fx > 0) D.hem[i] = Math.max(D.hem[i], fx * 0.8)
    }
    const b = rig.bones['hem' + (s > 0 ? 'L' : 'R')]
    b.rotation.order = 'XYZ'; b.rotation.set(-D.hem[i], 0, D.hem[i + 1])
  }
}

// ---------- 道具 ----------
interface PropState { valise: THREE.Group; cupBase: { p: THREE.Vector3; q: THREE.Quaternion }; tagBase: { p: THREE.Vector3; q: THREE.Quaternion } }
const VM = {
  leather: litMaterial({ color: '#6b3d22', roughness: 0.65 }),
  strap: litMaterial({ color: '#2a1a10', roughness: 0.6 }),
  brass: litMaterial({ color: '#c09a4e', roughness: 0.3, metalness: 0.8 }),
}
/** 手提箱（原点 = 底面中心；宽沿 X、高 Y、厚 Z；提把在顶上沿 X） */
function buildValise(): THREE.Group {
  const g = new THREE.Group(); g.name = 'valise'
  const { w, h, d } = VALISE
  const m = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o }
  m(new THREE.BoxGeometry(w, h, d), VM.leather, 0, h / 2, 0)
  for (const k of [-1, 1]) m(new THREE.BoxGeometry(0.026, h + 0.004, d + 0.004), VM.strap, k * w * 0.3, h / 2, 0)
  for (const a of [-1, 1]) for (const b of [0, 1]) m(new THREE.BoxGeometry(0.03, 0.03, d + 0.006), VM.brass, a * (w / 2 - 0.012), b ? h - 0.012 : 0.012, 0)
  const hd = m(new THREE.TorusGeometry(VALISE.handle, 0.008, 8, 16, Math.PI), VM.strap, 0, h + 0.002, 0); void hd
  for (const k of [-1, 1]) m(new THREE.BoxGeometry(0.018, 0.012, 0.03), VM.brass, k * VALISE.handle, h + 0.004, 0)
  return g
}
function props(rig: BellhopRig): PropState {
  const R = rig as BellhopRig & { __bprops?: PropState }
  if (R.__bprops) return R.__bprops
  const valise = buildValise(); valise.visible = false; rig.root.add(valise)
  const st: PropState = { valise, cupBase: { p: rig.cup.position.clone(), q: rig.cup.quaternion.clone() }, tagBase: { p: rig.tag.position.clone(), q: rig.tag.quaternion.clone() } }
  R.__bprops = st
  return st
}
function pinchPoint(rig: BellhopRig, A: BArm): THREE.Vector3 { const hx = fk(A.wrist, rig.root); return pinchLocal(A).applyQuaternion(hx.q).add(hx.p) }
function palmPoint(rig: BellhopRig, A: BArm, s: number, pk: number): THREE.Vector3 { const hx = fk(A.wrist, rig.root); return palmLocal(s, pk).applyQuaternion(hx.q).add(hx.p) }
function placeInHand(obj: THREE.Object3D, rig: BellhopRig, A: BArm, pRoot: THREE.Vector3, qRoot: THREE.Quaternion, pivotLocal: THREE.Vector3) {
  const hx = fk(A.wrist, rig.root), iq = hx.q.clone().invert()
  obj.quaternion.copy(iq.clone().multiply(qRoot))
  const off = pivotLocal.clone().applyQuaternion(qRoot)
  obj.position.copy(pRoot.clone().sub(off).sub(hx.p).applyQuaternion(iq))
}
/** 茶碟在左掌上（root 空间：碟底中心） */
function saucerPos(rig: BellhopRig) { const hx = fk(rig.armL.wrist, rig.root), a = v3(HANDS[1].F.a).applyQuaternion(hx.q); a.y = 0; return palmPoint(rig, rig.armL, 1, 0).addScaledVector(a, 0.012).add(new THREE.Vector3(0, 0.012, 0)) }
/** 杯把上的捏合点（杯局部）：杯把圈外缘（拇指压在把上、食指穿进圈） */
const CUP_GRIP = new THREE.Vector3(0.05, 0.031, 0.0)
/** 杯把朝向（杯局部 +x → 角色右前：手从右侧捏把，不挡在杯与身体之间） */
const CUP_YAW = Math.PI + 0.35
/** 杯在碟上：杯底贴碟面、杯把朝右（略朝身体） */
function cupOnSaucer(rig: BellhopRig) {
  const p = saucerPos(rig).add(new THREE.Vector3(0, 0.004, 0))
  const q = new THREE.Quaternion().setFromAxisAngle(_ay, CUP_YAW)
  return { p, q, grip: CUP_GRIP.clone().applyQuaternion(q).add(p) }
}
/** 杯在喙前：杯沿后缘贴到喙钩下方，按 tilt 朝面盘倾（头空间 → root 空间）。
 *  [修正] 旧 HEAD_BEAK z = 0.17 比实测喙尖（头空间 [0, 0.054, 0.122]，钩尖约 y 0.03）靠前 5 cm，杯子悬在脸前；现贴到喙钩、杯沿离面盘 ≥ 1 cm */
const HEAD_BEAK: V3 = [0.0, 0.03, 0.122]
function cupAtBeak(head: Xf, tilt: number) {
  const M = v3(HEAD_BEAK).applyQuaternion(head.q).add(head.p)
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(head.q); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, 1); f.normalize()
  const right = new THREE.Vector3().crossVectors(f, _ay).normalize() // 角色右侧（−X）
  const upT = _ay.clone().applyAxisAngle(right, tilt)
  const xT = right.clone().addScaledVector(f, 0.25).normalize() // 杯把（局部 +x）朝角色右前方（手在杯右前侧，不挡脸）
  const p = M.clone().addScaledVector(upT, -0.05).addScaledVector(f, 0.058)
  const q = basisQuat([1, 0, 0], [0, 1, 0], [xT.x, xT.y, xT.z], [upT.x, upT.y, upT.z])
  return { p, q, grip: CUP_GRIP.clone().applyQuaternion(q).add(p) }
}
/** 杯在手中的位姿：k 0 = 碟上、1 = 喙前；中间走弧线（先竖直离碟、途中向前上拱起，不在胸前平移穿模） */
function cupPath(rig: BellhopRig, head: Xf, k: number, tilt: number) {
  const A = cupOnSaucer(rig)
  if (k <= 0.0005) return A
  const Bc = cupAtBeak(head, tilt)
  if (k >= 0.9995) return Bc
  const kk = ss(k), arc = Math.sin(Math.PI * k)
  const p = A.p.clone().lerp(Bc.p, kk).add(new THREE.Vector3(0, 0.035 * arc + 0.03 * Math.sin(Math.PI * Math.min(1, k * 2)) * (1 - kk), 0.045 * arc))
  const q = A.q.clone().slerp(Bc.q, kk)
  return { p, q, grip: CUP_GRIP.clone().applyQuaternion(q).add(p) }
}
function applyProps(rig: BellhopRig, P: BellhopPose, head: Xf, dt: number | undefined) {
  const st = props(rig), D = dynOf(rig)
  rig.bell.visible = P.bell > 0.5
  if (rig.bell.visible) {
    const clap = rig.bell.userData.clapper as THREE.Object3D | undefined
    if (clap) clap.rotation.set(clamp(P.clap, -0.7, 0.7) * 0.6, 0, 0)
  }
  rig.cup.visible = P.cup > 0.5
  rig.saucer.visible = P.saucer > 0.5
  if (rig.saucer.visible) placeInHand(rig.saucer, rig, rig.armL, saucerPos(rig), new THREE.Quaternion(), new THREE.Vector3())
  if (rig.cup.visible) {
    if (P.cupOn > 0.5 || P.cupMouth > 0.5) { const cp = cupPath(rig, head, P.cupMouth, P.cupTilt); placeInHand(rig.cup, rig, rig.armR, cp.p, cp.q, new THREE.Vector3()) }
    else { // 捏着杯把：杯口朝上，杯把在捏合点
      // 杯把朝向 = 手指方向的反向（水平投影）：杯身在指尖那一侧
      const hx = fk(rig.armR.wrist, rig.root), a = v3(HANDS[-1].F.a).applyQuaternion(hx.q); a.y = 0
      const yaw = a.lengthSq() > 1e-6 ? Math.atan2(a.z, -a.x) : CUP_YAW
      const pp = pinchPoint(rig, rig.armR), q = new THREE.Quaternion().setFromAxisAngle(_ay, yaw)
      placeInHand(rig.cup, rig, rig.armR, pp, q, CUP_GRIP)
    }
  }
  // 行李牌：系绳顶端在左手捏合点，牌子竖直下垂、正面朝前，带一点摆
  rig.tag.visible = P.tag > 0.5
  if (rig.tag.visible) {
    const pp = pinchPoint(rig, rig.armL)
    if (dt !== undefined && dt > 0 && D.init) { const v = pp.clone().sub(D.lastHand); D.tagV += (-v.z / Math.max(dt, 1e-3) * 2.5 - 60 * D.tag - 4 * D.tagV) * dt; D.tag = clamp(D.tag + D.tagV * dt, -0.6, 0.6) }
    D.lastHand.copy(pp)
    const q = new THREE.Quaternion().setFromAxisAngle(_ax, D.tag).multiply(new THREE.Quaternion().setFromAxisAngle(_ay, 0.15))
    placeInHand(rig.tag, rig, rig.armL, pp, q, new THREE.Vector3(0, -0.004, 0))
  }
  // 行李车（root 空间）
  rig.cart.visible = P.cart > 0.5
  if (rig.cart.visible) { rig.cart.position.set(P.cartP[0], P.cartP[1], P.cartP[2]); rig.cart.rotation.set(0, P.cartYaw, 0) }
  // 手提箱
  const V = st.valise
  V.visible = P.item > 0.5
  if (V.visible) {
    if (P.itemHold > 1.5) { // 右手提把：箱子竖直挂在拳心下，宽面朝前（随手偏航）
      const hx = fk(rig.armR.wrist, rig.root), g = palmPoint(rig, rig.armR, -1, 1)
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(hx.q); fwd.y = 0
      const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(hx.q); ax.y = 0
      // 提把沿手的「拇指侧」方向：箱宽轴 = 手 r 轴的水平投影
      const F = HANDS[-1].F, r = v3(F.r).applyQuaternion(hx.q); r.y = 0; if (r.lengthSq() < 1e-6) r.set(1, 0, 0); r.normalize()
      V.position.set(g.x, g.y - HANDLE_Y, g.z); V.quaternion.setFromAxisAngle(_ay, Math.atan2(-r.z, r.x)); void fwd; void ax
    } else if (P.itemHold > 0.5) { // 双手捧：两掌心中点
      const a = palmPoint(rig, rig.armL, 1, 0), b = palmPoint(rig, rig.armR, -1, 0), c = a.clone().add(b).multiplyScalar(0.5)
      const d = a.clone().sub(b); d.y = 0
      V.position.set(c.x, c.y - VALISE.h / 2 - 0.01, c.z); V.quaternion.setFromAxisAngle(_ay, Math.atan2(-d.z, d.x))
    } else { V.position.set(P.itemP[0], P.itemP[1], P.itemP[2]); V.quaternion.setFromAxisAngle(_ay, P.itemYaw) }
  }
}

// ---------- 应用 ----------
export function applyBellhopPose(rig: BellhopRig, P: BellhopPose, o: BellhopAnimOpts = {}) {
  const root = rig.root
  _res.arm = 0; _res.leg = 0
  root.position.set(P.root[0], P.root[1], P.root[2]); setE(root, P.rootR)
  const hr = rig.hips.userData.rest as { p: THREE.Vector3 }
  rig.hips.position.set(hr.p.x + P.hipsP[0], hr.p.y + P.hipsP[1], hr.p.z + P.hipsP[2]); setE(rig.hips, P.hipsR)
  setE(rig.spine, P.spine); setE(rig.chest, P.chest); setE(rig.neck, P.neck); setE(rig.head, P.head)
  solveLeg(rig, 1, P.legL); solveLeg(rig, -1, P.legR)
  applyHem(rig, o.dt)
  const chest = fk(rig.chest, root), head = fk(rig.head, root)
  solveArm(rig, rig.armL, 1, P.L, chest, head)
  let Rp = P.R
  if (P.cupOn > 0.5 || P.cupMouth > 0.5) { // 杯在手中（碟上 → 喙前路径）：右手捏合点对到杯把
    const cp = cupPath(rig, head, P.cupMouth, P.cupTilt)
    const qh = new THREE.Quaternion(...P.R.hq).slerp(head.q.clone().multiply(new THREE.Quaternion(...P.R.hqh)), c01(P.R.hs))
    Rp = { ...P.R, hs: 0, hq: [qh.x, qh.y, qh.z, qh.w], g: [cp.grip.x, cp.grip.y, cp.grip.z], gw: 1 }
  }
  solveArm(rig, rig.armR, -1, Rp, chest, head)
  // 面盘抽搐：面盘组前后弹 + 微转（相对头骨）
  const fr = rig.face.userData.rest0 ??= rig.face.position.clone()
  const tm = o.time ?? 0
  if (P.twitch > 0.001) {
    rig.face.position.copy(fr).add(new THREE.Vector3(0.002 * Math.sin(tm * 71), 0.002 * Math.sin(tm * 59 + 1), 0.006 * Math.abs(Math.sin(tm * 43))).multiplyScalar(P.twitch))
    rig.face.rotation.set(0.06 * P.twitch * Math.sin(tm * 37), 0.05 * P.twitch * Math.sin(tm * 53 + 2), 0.08 * P.twitch * Math.sin(tm * 29 + 1))
  } else { rig.face.position.copy(fr); rig.face.rotation.set(0, 0, 0) }
  if (o.faceFrom !== undefined || o.faceTo !== undefined || P.faceSwap > 0.5) {
    const want = P.faceSwap > 0.5 ? (o.faceTo ?? ((o.faceFrom ?? 0) + 1)) : (o.faceFrom ?? 0)
    if (rig.faceIndex !== ((want % 8) + 8) % 8) setBellhopFace(rig, want)
  }
  applyProps(rig, P, head, o.dt)
  dynOf(rig).init = true
}
export function animateBellhop(rig: BellhopRig, clip: BellhopClip, t: number, opts: BellhopAnimOpts = {}) {
  const P = bellhopPose(clip, t, opts)
  applyBellhopPose(rig, P, { ...opts, time: opts.time ?? t })
  return P
}
/** 预览 / 截图：先从 t − pre 起按 1/60 s 推进二阶，得到与连续播放一致的确定帧 */
export function animateBellhopPreroll(rig: BellhopRig, clip: BellhopClip, t: number, opts: BellhopAnimOpts = {}, pre = 0.5) {
  resetBellhopDynamics(rig)
  const C = BELLHOP_CLIPS[clip], h = 1 / 60
  let t0 = t - pre; if (!C.loop) t0 = Math.max(0, t0)
  let P: BellhopPose | null = null
  for (let x = t0; x <= t + 1e-6; x += h) P = animateBellhop(rig, clip, x, { ...opts, time: x, dt: x === t0 ? undefined : h })
  return P!
}

// ---------- 运行时动画器 ----------
export interface BellhopAnimator {
  play(clip: BellhopClip, fade?: number): void
  update(dt: number, opts?: BellhopAnimOpts): void
  readonly clip: BellhopClip; readonly time: number; readonly done: boolean; readonly pose: BellhopPose
}
/** 片段间 0.2 s 混合；faceShift 播放时自动从当前脸换到另一张（种子决定） */
export function createBellhopAnimator(obj: THREE.Object3D, seed = 1): BellhopAnimator {
  const rig = obj.userData.bellhop as BellhopRig
  let clip: BellhopClip = 'idle', time = 0, gt = 0, fadeT = 1, fadeDur = 0, n = 0
  let prev = bellhopPose('idle', 0, { seed }), last = deepClone(prev)
  let faceFrom = rig.faceIndex, faceTo = rig.faceIndex
  return {
    get clip() { return clip }, get time() { return time }, get pose() { return last },
    get done() { const C = BELLHOP_CLIPS[clip]; return !C.loop && time >= C.dur },
    play(c, fade = 0.2) {
      if (c === clip && BELLHOP_CLIPS[c].loop) return
      prev = deepClone(last); clip = c; time = 0; fadeT = 0; fadeDur = fade
      if (c === 'faceShift') { faceFrom = rig.faceIndex; n++; faceTo = (faceFrom + 1 + Math.floor(frac(Math.sin((seed + n) * 91.7) * 4375.5) * 7)) % 8 }
    },
    update(dt, opts = {}) {
      time += dt; gt += dt; fadeT += dt
      let P = bellhopPose(clip, time, { seed, ...opts })
      if (fadeT < fadeDur) P = mixBellhopPose(prev, P, ss(fadeT / fadeDur))
      last = P
      const fo = clip === 'faceShift' ? { faceFrom, faceTo } : {}
      applyBellhopPose(rig, P, { seed, ...opts, ...fo, time: gt, dt })
    },
  }
}
void Q_ID; void CURL_HOLD; void CURL_FLAT; void CURL_FIST; void HQ_PALMUP
