// [spokes stage 2] 迎宾女郎（Entity 28 / The Spokeslady）阶段 2 动画：程序化关键帧 / 曲线（不接 AI）。结构沿用行李员 bellhopAnim / 野兽 beastAnim。
// 用法：
//   const an = createSpokesAnimator(group)              // group = buildSpokes() 的返回（userData.spokes）
//   an.play('greetSpin')                                // 片段间按 SPOKES_CLIPS[clip].blend（默认 0.25 s）交叉混合
//   an.update(dt, { turn: 0.4 })                        // 每帧；an.rootDelta = 本帧根运动（root 空间，walk / guidePoint 由 AI 叠到世界位置上）
// 无状态入口（预览 / 截图 / AI 自己管时间）：
//   spokesPose(clip, t, opts) → SpokesPose（纯函数）；mixSpokesPose(a, b, k)；applySpokesPose(rig, P, opts)
//   animateSpokes(rig, clip, t, opts) / animateSpokesPreroll(rig, clip, t, opts, pre)   // 后者先推进二阶（耳朵惯性 / 裙摆）
//   spokesRootMotion(clip, t0, t1) → [dx, dz]（root 空间；walk / guidePoint 匀速前进）
// 发条兔：animateWindupRabbit(rabbitGroup, 'rabbitHop' | 'rabbitStop', t) → 姿态直接写到 buildWindupRabbit() 的关节组；WINDUP_CLIPS 片段表（含速度）。
// 结构：
//   · 姿态量都在 root 骨空间（+Z 正面、+Y 上、地面 y=0、+X = 角色左侧），可线性混合；躯干 / 颈 / 头为欧拉角（YXZ）。
//   · 手臂：两骨 IK（腕目标 / 捏合点 g / 掌心 pp + 肘极向），手朝向 = root / 胸空间四元数混合；手指 = 15 个绝对屈曲角（fl）+ 拇指外展 tab，
//     附图式双臂交叉（CROSS）直接复用阶段 1 定稿的腕位 / 肘极 / 手朝向 / 指形。
//   · 腿：脚掌点 + 两骨 IK（膝朝前）；步态支撑相脚掌点在 root 空间里以身体速度后移（脚锁，不滑步）；坐姿 = 髋下沉到椅面 + 脚掌点前移。
//   · 裙摆：及膝铅笔裙下段蒙在下摆骨 hemL/R（与大腿同枢轴，spokesBody.skirtWeights），动画里下摆骨跟大腿屈伸 0.92–1.0 + 二阶滞后，
//     前屈时不许落后大腿 90%（腿不从裙前片穿出）；中缝左右各半 → 迈步时裙前片在两腿间绷开、坐下时裙子包在大腿上。
//   · 兔耳：每侧 3 节；耳根姿态（后贴 / 外张 / 扭转 / 弯折）由片段给，叠加二阶惯性：耳中点在头局部系里的加速度 → 每耳 3 个弹簧
//     （俯仰 / 侧摆 / 弯折，约 2.4 Hz、ζ 0.22），越到耳尖权重越大；freeze 片段 stiff → 惯性压低（僵住时耳朵也不晃）。
//   · 鼻子翕动 / 胡须微颤：nose 骨小幅俯仰 + 上提（快速成串、间歇），胡须骨跟着抖；嘴（jaw）永远不动——她靠领口音箱说话。
//   · 手持道具（本文件自建、挂 root）：马克笔（右手捏）、海报叠（双手夹）、桌上海报纸、照片（双手捏下角）、发条兔（buildWindupRabbit，放地上 / 跳走）。
import * as THREE from 'three'
import type { SpokesRig, SpokesArm } from './spokesMesh'
import { BONES, B, BH_HAND, warpBH, type V3 } from './spokesRig'
import { buildWindupRabbit, posterTexture } from './spokesProps'
import { litMaterial } from './shared'

export type SpokesClip = 'idle' | 'greetSpin' | 'bowInvite' | 'speakerTalk' | 'innerFreeze' | 'drawPoster' | 'dropPoster' | 'windRabbit' | 'walk' | 'guidePoint' | 'sitDesk' | 'seatedIdle' | 'shoulderTap' | 'photoRecall'
export interface SpokesClipInfo { dur: number; loop: boolean; zh: string; blend: number; speed?: number; seated?: boolean }
export const SPOKES_CLIPS: Record<SpokesClip, SpokesClipInfo> = {
  idle: { dur: 6.0, loop: true, zh: '双臂交叉站立', blend: 0.3 },
  greetSpin: { dur: 4.6, loop: false, zh: '迎宾：脚尖旋转 + 轻跃', blend: 0.25 },
  bowInvite: { dur: 4.2, loop: false, zh: '鞠躬并伸手邀请', blend: 0.25 },
  speakerTalk: { dur: 5.0, loop: false, zh: '按领口音箱说话', blend: 0.25 },
  innerFreeze: { dur: 5.0, loop: false, zh: '心声爆发·僵住', blend: 0.12 },
  drawPoster: { dur: 6.0, loop: true, zh: '站在桌前画海报', blend: 0.4 },
  dropPoster: { dur: 5.0, loop: false, zh: '海报丢进地洞', blend: 0.3 },
  windRabbit: { dur: 7.0, loop: false, zh: '蹲下上发条、放兔子', blend: 0.3 },
  walk: { dur: 1.1, loop: true, zh: '行走（铅笔裙小步）', blend: 0.25, speed: 0.82 },
  guidePoint: { dur: 2.2, loop: true, zh: '引路：回头 + 指路', blend: 0.3, speed: 0.7 },
  sitDesk: { dur: 4.6, loop: false, zh: '走到桌后坐下', blend: 0.25, seated: true },
  seatedIdle: { dur: 6.0, loop: true, zh: '坐在桌后', blend: 0.3, seated: true },
  shoulderTap: { dur: 4.2, loop: false, zh: '被老板拍肩·僵硬强笑', blend: 0.1 },
  photoRecall: { dur: 7.4, loop: false, zh: '看照片·认出自己', blend: 0.3 },
}
/** 椅面高 / 桌面高 / 桌近边（root 空间，坐姿片段的家具约定；游戏里摆家具时对齐这几项） */
export const SPOKES_SEAT_Y = 0.44, SPOKES_DESK_Y = 0.74, SPOKES_DESK_Z = 0.24
/** dropPoster：墙上投递洞 A 的口（root 空间：洞口中心）；墙板 buildPosterDrops 摆在 z = 洞口 z、绕 Y 转 π、底边 y = 洞口 y − 0.31 */
export const SPOKES_DROP_HOLE: V3 = [0.02, 0.8, 0.5]
/** sitDesk 起点（root 空间偏移；片段末尾回到 [0,0,0] 正对桌子坐下） */
/** drawPoster 站着写字时桌子近边（root z；比坐姿桌近 0.1 m——站着俯身够得到纸） */
export const SPOKES_DRAW_DESK_Z = 0.2
export const SPOKES_SIT_FROM: V3 = [0.9, 0, -0.05]

type Q4 = [number, number, number, number]
export interface SArmPose {
  t: V3; tc: V3; cs: number; pole: V3
  hq: Q4; hqc: Q4; hw: number; wr: V3
  /** 手指绝对屈曲角（拇 / 食 / 中 / 无名 / 小 × 3 节，弧度；0 = 建模静止手形，负 = 伸直）+ 拇指外展 */
  fl: number[]; tab: number
  clav: V3
  g: V3; gw: number
  pp: V3; pw: number; pk: number
  /** 掌心按膝：kw 权重、ks 哪个膝（1 左 / −1 右）、ko 掌心相对膝关节的偏移（root 空间）——膝位置在腿 IK 之后求，蹲下时手跟着膝走 */
  kw: number; ks: number; ko: V3
}
export interface SLegPose { p: V3; ph: number; yw: number; tf: number }
export interface SEarPose { pitch: number; splay: number; twist: number; bend: number }
export interface SpokesProps {
  pen: number; stack: number; stackHold: number; stackP: V3; stackFall: number
  deskPoster: number; photo: number; photoHold: number
  /** 发条兔：显隐、地上位置（root 空间）、偏航、钥匙角、hop = 跳行时间（< 0 = 静止）、被左手按住 */
  rabbit: number; rabbitP: V3; rabbitYaw: number; rabbitKey: number; rabbitHop: number
}
export interface SpokesPose {
  root: V3; rootR: V3; hipsP: V3; hipsR: V3; spine: V3; chest: V3; neck: V3; head: V3
  L: SArmPose; R: SArmPose; legL: SLegPose; legR: SLegPose
  earL: SEarPose; earR: SEarPose
  /** 鼻子翕动幅度 0..1、胡须颤 0..1、头微颤 0..1、耳朵惯性 0..1（僵住时压低） */
  nose: number; whisk: number; tremor: number; earDyn: number
  /** 右手食指按领口音箱（0..1） */
  press: number
  props: SpokesProps
}
export interface SpokesAnimOpts {
  /** 叠加转头（rad，+ = 向角色左转）/ 歪头 */
  turn?: number; tilt?: number
  seed?: number
  /** 二阶步长（秒）；省略 = 不推进二阶 */
  dt?: number
  /** 全局时间（抖动 / 鼻子 / 耳朵抖的相位） */
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
const mix = (a: number, b: number, k: number) => a + (b - a) * k
const mixV = (a: V3, b: V3, k: number): V3 => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)]
const addV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const subV = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const sclV = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const nz = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const v3 = (a: V3 | THREE.Vector3) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]))
const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z]
const qArr = (q: THREE.Quaternion): Q4 => [q.x, q.y, q.z, q.w]
const Q_ID: Q4 = [0, 0, 0, 1]
const hash1 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
/** 平滑噪声（1D，值 −1..1） */
const noise1 = (x: number, seed = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return mix(hash1(i + seed * 17.3) * 2 - 1, hash1(i + 1 + seed * 17.3) * 2 - 1, u) }
function basisQuat(x0: V3, y0: V3, x1: V3, y1: V3): THREE.Quaternion {
  const mk = (x: V3, y: V3) => { const X = v3(x).normalize(), Y = v3(y); Y.addScaledVector(X, -Y.dot(X)).normalize(); const Z = new THREE.Vector3().crossVectors(X, Y); return new THREE.Matrix4().makeBasis(X, Y, Z) }
  const a = mk(x0, y0), b = mk(x1, y1)
  return new THREE.Quaternion().setFromRotationMatrix(b.multiply(a.transpose()))
}

// ---------- 静止量（迎宾女郎空间）----------
const JP = (n: string): V3 => BONES[B[n]].pos
const SN = (s: number) => (s > 0 ? 'L' : 'R')
const SH = (s: number) => JP('upperArm' + SN(s)), EL = (s: number) => JP('foreArm' + SN(s)), WR = (s: number) => JP('hand' + SN(s))
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const LU = dist(EL(1), SH(1)), LF = dist(WR(1), EL(1))
const LT = dist(JP('shinL'), JP('thighL')), LS = dist(JP('footL'), JP('shinL'))
const TOE = JP('toeL'), ANK = JP('footL'), TOE_H = TOE[1]
const FOOT_A: V3 = subV(ANK, TOE)
const FOOT_H: V3 = [ANK[0] - TOE[0], -TOE_H, ANK[2] - 0.05 - TOE[2]]
export const SPOKES_FOOT_REST = (s: number): V3 => [TOE[0] * s, 0, TOE[2]]
const HIP_Y = JP('thighL')[1], CHEST_J = JP('chest'), HEAD_J = JP('head')
/** 手朝向（与阶段 1 spokesHandAim 同一约定：行李员手坐标系 a 指尖 / d 手背 → 目标方向） */
export function spokesHandQuat(s: number, aDir: V3, dDir: V3): Q4 { const F = BH_HAND[s].F; return qArr(basisQuat(F.a, F.d, nz(aDir), nz(dDir))) }
const hQ = spokesHandQuat
const qRot = (q: Q4, ax: V3, ang: number): Q4 => qArr(new THREE.Quaternion().setFromAxisAngle(v3(nz(ax)), ang).multiply(new THREE.Quaternion(...q)))
/** 手的方向（hq 作用后，root 空间）：a 指尖、d 手背、r 拇指侧 */
function handDirs(s: number, hq: Q4) {
  const F = BH_HAND[s].F, q = new THREE.Quaternion(...hq)
  return { a: arr(v3(F.a).applyQuaternion(q)), d: arr(v3(F.d).applyQuaternion(q)), r: arr(v3(F.r).applyQuaternion(q)) }
}
/** 掌心 / 拳心（手骨局部，静止手形）：pk 0 掌心表面、1 拳心 */
const PALM_LOCAL: Record<number, THREE.Vector3[]> = {}
for (const s of [1, -1]) {
  const F = BH_HAND[s].F, o = WR(s)
  PALM_LOCAL[s] = [0, 1].map((pk) => v3(subV(warpBH(addV(addV(addV(F.o, sclV(F.a, mix(0.072, 0.075, pk))), sclV(F.d, mix(-0.024, -0.034, pk))), sclV(F.r, mix(0, 0.006, pk))), 'arm'), o)))
}
const palmLocal = (s: number, pk: number) => PALM_LOCAL[s][0].clone().lerp(PALM_LOCAL[s][1], c01(pk))
/** 捏合点（手骨局部，静止指形近似：拇指 / 食指远节骨原点中点 + 指尖向 8 mm）——只给关键帧「目标一致化」用，求解时用实际指形 */
const PINCH_APPROX: Record<number, THREE.Vector3> = {}
for (const s of [1, -1]) {
  const H = BH_HAND[s], th = H.fingers.find((f) => f.name === 'thumb')!.joints[2], ix = H.fingers.find((f) => f.name === 'index')!.joints[2]
  PINCH_APPROX[s] = v3(subV(warpBH(addV(sclV(addV(th, ix), 0.5), sclV(H.F.a, 0.008)), 'arm'), WR(s)))
}

// ---------- 手指 ----------
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const
const REST_FLEX: Record<string, number[]> = { thumb: [0.05, 0.16, 0.2], index: [0.18, 0.3, 0.18], middle: [0.22, 0.34, 0.2], ring: [0.27, 0.38, 0.22], pinky: [0.32, 0.42, 0.24] }
const FIST: Record<string, number[]> = { thumb: [0.4, 0.55, 0.5], index: [1.3, 1.45, 0.95], middle: [1.35, 1.5, 0.95], ring: [1.35, 1.5, 0.95], pinky: [1.4, 1.5, 0.95] }
/** curl（每指一个数：0 静止、1 握拳、−1 伸直）→ 15 个绝对角 */
const C = (c: number[]): number[] => FINGERS.flatMap((f, i) => FIST[f].map((v, k) => (c[i] >= 0 ? c[i] * v : Math.max(c[i], -1) * REST_FLEX[f][k])))
const CURL_RELAX = C([0.1, 0.12, 0.15, 0.2, 0.25])
const CURL_SOFT = C([0.2, 0.3, 0.35, 0.42, 0.5])
const CURL_OPEN = C([-0.4, -0.6, -0.55, -0.5, -0.45])
const CURL_FLAT = C([-0.5, -0.9, -0.9, -0.85, -0.8])
const CURL_POINT = C([0.45, -0.9, 0.95, 1, 1])
const CURL_PRESS = C([0.35, -0.5, 0.85, 0.95, 1])
const CURL_PINCH = C([0.42, 0.55, 0.85, 0.95, 0.9])
const CURL_PEN = C([0.4, 0.5, 0.7, 0.9, 0.95])
const CURL_CHEST = C([0.0, -0.3, -0.25, -0.15, -0.05])

// ---------- 姿态：默认 / 克隆 / 混合 ----------
function restArm(s: number): SArmPose {
  const S = SH(s), E = EL(s), W = WR(s)
  const d = nz(subV(W, S)), e = subV(E, S), k = e[0] * d[0] + e[1] * d[1] + e[2] * d[2]
  const pole = nz(subV(e, sclV(d, k)))
  return { t: [...W], tc: [...W], cs: 0, pole, hq: [...Q_ID], hqc: [...Q_ID], hw: 0, wr: [0, 0, 0], fl: new Array(15).fill(0), tab: 0, clav: [0, 0, 0], g: [...W], gw: 0, pp: [...W], pw: 0, pk: 0, kw: 0, ks: s, ko: [0, 0.05, 0.02] }
}
const EAR0: SEarPose = { pitch: 0, splay: 0, twist: 0, bend: 0 }
export const SPOKES_REST: SpokesPose = {
  root: [0, 0, 0], rootR: [0, 0, 0], hipsP: [0, 0, 0], hipsR: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  L: restArm(1), R: restArm(-1), legL: { p: SPOKES_FOOT_REST(1), ph: 0, yw: 0, tf: 1 }, legR: { p: SPOKES_FOOT_REST(-1), ph: 0, yw: 0, tf: 1 },
  earL: { ...EAR0 }, earR: { ...EAR0 }, nose: 0.4, whisk: 0.4, tremor: 0, earDyn: 1, press: 0,
  props: { pen: 0, stack: 0, stackHold: 0, stackP: [0, 0.8, 0.3], stackFall: 0, deskPoster: 0, photo: 0, photoHold: 0, rabbit: 0, rabbitP: [0, 0, 0.45], rabbitYaw: 0, rabbitKey: 0, rabbitHop: -1 },
}
function deepClone<T>(x: T): T {
  if (Array.isArray(x)) return x.slice() as unknown as T
  if (x && typeof x === 'object') { const o: any = {}; for (const k in x) o[k] = deepClone((x as any)[k]); return o }
  return x
}
export const cloneSpokesPose = (p: SpokesPose) => deepClone(p)
const QKEYS = new Set(['hq', 'hqc'])
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
/** 膝关节位置近似（root 空间；姿态层用：髋按 hipsP / hipsR 摆、踝按脚掌点 + 脚偏航 / 俯仰，两骨 IK 膝朝前）——与 solveLeg 同一套几何 */
function kneeApprox(P: SpokesPose, s: number): THREE.Vector3 {
  const L = s > 0 ? P.legL : P.legR, hipsJ = v3(JP('hips'))
  const qh = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.hipsR[0], P.hipsR[1], P.hipsR[2], 'YXZ'))
  const H = v3(JP('thigh' + SN(s))).sub(hipsJ).applyQuaternion(qh).add(hipsJ).add(v3(P.hipsP))
  const qy = new THREE.Quaternion().setFromAxisAngle(_ay, L.yw), lat = _ax.clone().applyQuaternion(qy), qp = new THREE.Quaternion().setFromAxisAngle(lat, L.ph)
  const toeJ = v3(L.p).add(new THREE.Vector3(0, TOE_H, 0)), oA = v3([FOOT_A[0] * s, FOOT_A[1], FOOT_A[2]]).applyQuaternion(qy), oH = v3([FOOT_H[0] * s, FOOT_H[1], FOOT_H[2]]).applyQuaternion(qy)
  const ank = L.ph >= 0 ? toeJ.clone().add(oA.applyQuaternion(qp)) : toeJ.clone().add(oH).add(oA.clone().sub(oH).applyQuaternion(qp))
  const d = ank.clone().sub(H), D = clamp(d.length(), 0.2, LT + LS - 0.002), dh = d.normalize()
  const pole = new THREE.Vector3(0, 0, 1).applyQuaternion(qy).add(new THREE.Vector3(0, 0.15, 0)); pole.addScaledVector(dh, -pole.dot(dh)).normalize()
  const ca = clamp((LT * LT + D * D - LS * LS) / (2 * LT * D), -1, 1)
  return H.addScaledVector(dh, LT * ca).addScaledVector(pole, LT * Math.sqrt(1 - ca * ca))
}
/** 关键帧手臂「目标一致化」：把这一帧手腕实际要去的位置（t → 捏合点 g → 掌心 pp → 按膝，与 solveArm 同序）写回 t，
 *  并把没用上的 g / pp 也对齐到同一手腕位置。这样两帧之间无论权重怎么交叉，插值路径都在两个真实手位之间走直线，
 *  不会从某一帧遗留的陈旧 t（比如底子里双臂交叉的胸前位置）绕过去——过渡中手臂不再甩过头顶 / 胸前。 */
function settleArms(P: SpokesPose) {
  for (const [A, s] of [[P.L, 1], [P.R, -1]] as [SArmPose, number][]) {
    if (A.cs > 0.001) continue
    const q = new THREE.Quaternion(...A.hq), offG = PINCH_APPROX[s].clone().applyQuaternion(q), offP = palmLocal(s, A.pk).applyQuaternion(q)
    const T = v3(A.t)
    if (A.gw > 0) T.lerp(v3(A.g).sub(offG), c01(A.gw))
    if (A.pw > 0) T.lerp(v3(A.pp).sub(offP), c01(A.pw))
    if (A.kw > 0) T.lerp(kneeApprox(P, A.ks >= 0 ? 1 : -1).add(v3(A.ko)).sub(palmLocal(s, 0).applyQuaternion(q)), c01(A.kw))
    A.t = arr(T); A.g = arr(T.clone().add(offG)); A.pp = arr(T.clone().add(offP))
  }
  return P
}
export function mixSpokesPose(a: SpokesPose, b: SpokesPose, k: number): SpokesPose {
  if (k <= 0) return deepClone(a)
  if (k >= 1) return deepClone(b)
  a = settleArms(deepClone(a)); b = settleArms(deepClone(b))
  const o = mixAny(a, b, k) as SpokesPose
  // 道具显隐 / 发条兔跳行时间不插值（取主导一侧）
  o.props.rabbitHop = k < 0.5 ? a.props.rabbitHop : b.props.rabbitHop
  return o
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends number[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }
type Part = DeepPartial<SpokesPose>
function over(base: SpokesPose, p: Part): SpokesPose {
  const o = deepClone(base) as any
  const rec = (dst: any, src: any) => { for (const k in src) { const v = src[k]; if (v === undefined) continue; if (v && typeof v === 'object' && !Array.isArray(v)) rec(dst[k], v); else dst[k] = Array.isArray(v) ? v.slice() : v } }
  rec(o, p); return o
}
/** 关键帧：[[t, partial], ...]，每帧都是 base 上的覆盖；段间 smoothstep。
 *  重新站位（两关键帧间脚掌点水平移动 > 1.2 cm 或脚偏航变 > 0.15）自动做成「抬脚迈一小步」：脚在自己的时间窗里离地、
 *  水平移动只在离地时发生（两只脚都要挪时左脚先、右脚后，窗口错开），落地后不再滑；关键帧里显式给了脚高（y > 1 cm）的不处理。 */
function keys(t: number, base: SpokesPose, ks: [number, Part][]): SpokesPose {
  if (t <= ks[0][0]) return over(base, ks[0][1])
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const [t0, a] = ks[i - 1], [t1, b] = ks[i]
    const A = over(base, a), Bp = over(base, b), kl = (t - t0) / (t1 - t0)
    const P = mixSpokesPose(A, Bp, ss(kl))
    stepFeet(P, A, Bp, kl)
    return P
  }
  return over(base, ks[ks.length - 1][1])
}
const STEP_D = 0.012, STEP_YAW = 0.15
function needsStep(a: SLegPose, b: SLegPose) {
  if (a.p[1] > 0.01 || b.p[1] > 0.01) return false
  return Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2]) > STEP_D || Math.abs(a.yw - b.yw) > STEP_YAW
}
/** 一只脚在 [w0, w1] 窗口里迈一步（kl = 段内线性进度） */
function stepLeg(L: SLegPose, a: SLegPose, b: SLegPose, kl: number, w0: number, w1: number) {
  const u = c01((kl - w0) / (w1 - w0)), e = u * u * u * (u * (6 * u - 15) + 10)
  const d = Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2])
  L.p = [mix(a.p[0], b.p[0], e), 0, mix(a.p[2], b.p[2], e)]
  L.p[1] = Math.min(0.055, 0.022 + 0.3 * d) * Math.sin(Math.PI * u)
  L.yw = mix(a.yw, b.yw, e); L.ph = mix(a.ph, b.ph, e) + 0.28 * Math.sin(Math.PI * Math.min(1, u * 1.15)); L.tf = mix(a.tf, b.tf, e)
}
function stepFeet(P: SpokesPose, A: SpokesPose, B: SpokesPose, kl: number) {
  const sL = needsStep(A.legL, B.legL), sR = needsStep(A.legR, B.legR)
  if (sL) stepLeg(P.legL, A.legL, B.legL, kl, 0, sR ? 0.55 : 1)
  if (sR) stepLeg(P.legR, A.legR, B.legR, kl, sL ? 0.45 : 0, 1)
}
const merge = (...ps: Part[]): Part => { const o: any = {}; const rec = (dst: any, src: any) => { for (const k in src) { const v = src[k]; if (v && typeof v === 'object' && !Array.isArray(v)) { dst[k] ??= {}; rec(dst[k], v) } else dst[k] = Array.isArray(v) ? v.slice() : v } }; for (const p of ps) rec(o, p); return o }

// ---------- 常用姿势 ----------
/** 附图式双臂交叉（阶段 1 定稿 setSpokesPose('cross') 的同一组数） */
const CR = {
  rW: [0.093, 1.098, 0.12] as V3, rPole: [-0.582, 1.136, 0.177] as V3, rDir: [0.45, 0.35, -0.82] as V3, rBack: [0.85, -0.1, 0.5] as V3,
  lW: [-0.108, 1.194, 0.159] as V3, lPole: [2.667, 0.82, 0.134] as V3, lDir: [-0.989, 0.61, -0.803] as V3, lBack: [0.245, 1.468, 0.38] as V3, lThumb: 0.442,
  lFlex: [[-0.35, -0.3, 0], [0.48, 1.07, 0.51], [0.58, 1.16, 0.45], [0.79, 0.88, 0.74], [0.78, 1.18, 0.62]],
}
const CROSS: Part = {
  chest: [-0.03, 0, 0],
  L: { t: CR.lW, pole: nz(subV(CR.lPole, SH(1))), hq: hQ(1, CR.lDir, CR.lBack), hw: 1, fl: CR.lFlex.flat(), tab: CR.lThumb },
  R: { t: CR.rW, pole: nz(subV(CR.rPole, SH(-1))), hq: hQ(-1, CR.rDir, CR.rBack), hw: 1, fl: [0.15, 0.2, 0.15, 0.4, 0.5, 0.3, 0.4, 0.5, 0.3, 0.4, 0.5, 0.3, 0.4, 0.5, 0.3], tab: 0 },
}
/** 手自然下垂（走路 / 过渡） */
const HANG: Part = { L: { t: [0.215, 0.86, 0.03], pole: [0.4, -0.2, -1], hw: 0, fl: CURL_RELAX, tab: 0 }, R: { t: [-0.215, 0.86, 0.03], pole: [-0.4, -0.2, -1], hw: 0, fl: CURL_RELAX, tab: 0 } }
/** 双手在小腹前交叠（礼仪站姿：右手覆在左手上） */
const CLASP: Part = {
  L: { t: [0.045, 0.9, 0.13], pole: [1, -0.3, -0.5], hq: hQ(1, [-1, -0.35, 0.15], [0.05, 0.15, 1]), hw: 1, fl: CURL_RELAX, tab: 0 },
  R: { t: [-0.04, 0.915, 0.15], pole: [-1, -0.3, -0.5], hq: hQ(-1, [1, -0.3, 0.15], [-0.05, 0.15, 1]), hw: 1, fl: C([0.2, 0.05, 0.08, 0.12, 0.18]), tab: 0 },
}
const BASE = SPOKES_REST
/** 端正站立 + 双臂交叉（idle 的底子） */
const STAND: SpokesPose = over(BASE, { hipsP: [0, -0.003, 0], neck: [0.02, 0, 0], head: [0.03, 0, 0], ...CROSS, earL: { pitch: -0.04, splay: 0.03, twist: 0.05, bend: 0 }, earR: { pitch: -0.04, splay: 0.03, twist: 0.05, bend: 0 } })
const STAND_CLASP: SpokesPose = over(STAND, { chest: [-0.02, 0, 0], ...CLASP })
/** 女性站姿：重心在右腿，左脚略前、脚尖外开 */
const CONTRA: Part = { hipsP: [-0.012, -0.004, 0], hipsR: [0, 0.04, -0.03], spine: [0, -0.02, 0.02], chest: [-0.03, -0.02, 0.012], legL: { p: [0.07, 0, TOE[2] + 0.05], yw: 0.22, ph: 0.06 }, legR: { p: [-0.085, 0, TOE[2] - 0.01], yw: -0.12 } }
const ears = (pitch: number, splay: number, twist = 0, bend = 0): Part => ({ earL: { pitch, splay, twist, bend }, earR: { pitch, splay, twist, bend } })

// ---------- 步态（铅笔裙：步幅短、两脚落在中线附近）----------
interface GaitSpec { D: number; duty: number; lift: number; center: number; width: number; heelOff: number; toeOff: number; strike: number; cross: number }
function gaitLegs(P: SpokesPose, u: number, G: GaitSpec) {
  for (const [leg, s, off] of [[P.legL, 1, 0], [P.legR, -1, 0.5]] as [SLegPose, number, number][]) {
    const ph = frac(u + off), sweep = G.D * G.duty
    let z: number, y = 0, pitch = 0
    if (ph < G.duty) {
      const k = ph / G.duty
      z = sweep * (0.5 - k)
      pitch = -G.strike * (1 - ss(k / 0.16)) + G.heelOff * ss((k - 0.6) / 0.4)
    } else {
      // 摆动相：脚在「世界」里按 smootherstep 从后落点走到前落点（起落两端世界速度 = 0，落地不滑），换回 root 空间要减去身体同期前进量
      const k = (ph - G.duty) / (1 - G.duty)
      const e = k * k * k * (k * (6 * k - 15) + 10)
      z = -0.5 * sweep + G.D * (e - (1 - G.duty) * k)
      y = G.lift * Math.sin(Math.PI * k) * (k < 0.15 ? 0.6 + 0.4 * (k / 0.15) : 1)
      pitch = G.toeOff * (1 - ss(k / 0.45)) - G.strike * ss((k - 0.6) / 0.4)
    }
    // 落脚点靠中线（女性步态：脚落在中线附近）；支撑相 x 不变（不横滑），摆动相绕支撑腿向外画一点弧
    // [E28 鞋修] 摆动弧 1.2 → 3.2 cm（sin² 起落，离地 / 着地瞬间横向速度 0，不算滑步）：两脚落点只差 6 cm，鞋最宽处约 3.4 cm，原来摆动脚的鞋擦过支撑脚的鞋时互穿约 1.5 cm
    const x = s * (G.width - G.cross + (ph < G.duty ? 0 : 0.032 * Math.sin(Math.PI * (ph - G.duty) / (1 - G.duty)) ** 2))
    // [E28 鞋修] 摆动相脚趾放松 tf 1 → 0.4 随抬脚渐变（原来离地瞬间 tf 直接跳到 0.4：脚还带 0.36 俯仰，鞋头被压进地面约 6 mm）
    leg.p = [x, y, TOE[2] + G.center + z]; leg.ph = pitch; leg.tf = ph < G.duty ? 1 : 1 - 0.6 * ss((ph - G.duty) / (1 - G.duty) / 0.35); leg.yw = s * 0.1
  }
}
const W_HIP = -0.02
/** 走路身体（髋左右摆 + 滚转更明显，肩反向）；arms = 是否摆臂 */
function walkBody(P: SpokesPose, u: number, G: GaitSpec, arms: boolean) {
  gaitLegs(P, u, G)
  const s1 = Math.sin(u * TAU), bob = Math.cos((u - 0.3) * TAU * 2)
  // [E28 鞋修] 脚跟着地（u = 0 / 0.5，双支撑）时髋再低 9 mm：原来前腿伸直也够不到地（腿 IK 差 5～8 mm → 落地瞬间鞋悬空）
  const dip = Math.pow(0.5 + 0.5 * Math.cos(u * TAU * 2), 6)
  P.hipsP = [0.016 * Math.sin((u - 0.06) * TAU), W_HIP + 0.011 * bob - 0.009 * dip, 0.0]
  P.hipsR = [0.02, 0.1 * s1, -0.05 * Math.sin((u - 0.08) * TAU)]
  P.spine = [0.0, -0.05 * s1, 0.025 * Math.sin((u - 0.08) * TAU)]; P.chest = [-0.03, -0.06 * s1, 0.012 * Math.sin((u - 0.1) * TAU)]
  P.neck = [0.02, 0.04 * s1, -0.01 * Math.sin((u - 0.1) * TAU)]; P.head = [0.03 - 0.006 * bob, 0.025 * s1, 0.012 * Math.sin((u - 0.1) * TAU)]
  if (arms) for (const [A, s] of [[P.L, 1], [P.R, -1]] as [SArmPose, number][]) {
    const k = -s * s1
    A.t = [s * 0.205, 0.87 + 0.012 * Math.max(0, k), 0.04 + 0.075 * k]; A.pole = [s * 0.4, -0.2, -1]
    A.hw = 0; A.wr = [0.08 + 0.06 * Math.max(0, k), 0, 0]; A.fl = CURL_SOFT; A.tab = 0
  }
}
const WALK_G = (D: number): GaitSpec => ({ D, duty: 0.6, lift: 0.042, center: 0.0, width: 0.05, heelOff: 0.36, toeOff: 0.36, strike: 0.12, cross: 0.02 })

// ---------- 片段 ----------
export function spokesPose(clip: SpokesClip, t: number, o: SpokesAnimOpts = {}): SpokesPose {
  const C0 = SPOKES_CLIPS[clip]
  t = C0.loop ? frac(t / C0.dur) * C0.dur : clamp(t, 0, C0.dur)
  const u = t / C0.dur, seed = o.seed ?? 1, tm = o.time ?? t
  let P: SpokesPose
  switch (clip) {
    case 'idle': P = idlePose(t, u, seed); break
    case 'greetSpin': P = greetPose(t); break
    case 'bowInvite': P = bowPose(t); break
    case 'speakerTalk': P = talkPose(t, seed); break
    case 'innerFreeze': P = freezePose(t, tm); break
    case 'drawPoster': P = drawPose(t, u); break
    case 'dropPoster': P = dropPose(t); break
    case 'windRabbit': P = windPose(t); break
    case 'walk': P = walkPose(u); break
    case 'guidePoint': P = guidePose(u); break
    case 'sitDesk': P = sitPose(t); break
    case 'seatedIdle': P = seatedIdlePose(t, u); break
    case 'shoulderTap': P = tapPose(t, tm); break
    case 'photoRecall': P = photoPose(t, tm); break
  }
  if (o.turn || o.tilt) { P.neck[1] += 0.4 * (o.turn ?? 0); P.head[1] += 0.6 * (o.turn ?? 0); P.head[2] += 0.8 * (o.tilt ?? 0) }
  return P
}
/** 根运动（root 空间 +Z 前进）：walk / guidePoint 匀速；其余 0 */
export function spokesRootMotion(clip: SpokesClip, t0: number, t1: number): [number, number] {
  const sp = SPOKES_CLIPS[clip].speed ?? 0
  return [0, sp * (t1 - t0)]
}
const breathe = (P: SpokesPose, u: number, cycles: number, k = 1) => {
  const br = Math.sin(u * TAU * cycles) * k
  P.chest[0] -= 0.01 * br; P.spine[0] -= 0.004 * br; P.hipsP[1] += 0.0012 * br
  P.L.clav = addV(P.L.clav, [0, 0, 0.007 * br]); P.R.clav = addV(P.R.clav, [0, 0, -0.007 * br])
}
/** 单侧耳朵抖一下（片段时间 t 在 [a, a+0.35]）：快速外转 + 回弹 */
function earFlick(E: SEarPose, t: number, a: number, k = 1) {
  const x = t - a
  if (x <= 0 || x > 0.5) return
  const w = Math.sin(Math.min(1, x / 0.12) * Math.PI) * Math.exp(-6 * x) + 0.25 * Math.sin(x * 48) * Math.exp(-9 * x)
  E.twist += 0.45 * w * k; E.splay += 0.12 * w * k; E.pitch -= 0.06 * w * k
}

// 1. idle：附图式双臂交叉；呼吸（5 s 两次）、重心微换、一次转头打量；耳朵偶尔各自转一下 / 抖一下；鼻子翕动
function idlePose(t: number, u: number, seed: number): SpokesPose {
  const P = over(STAND, CONTRA)
  breathe(P, u, 2)
  const sh = Math.sin(u * TAU)
  P.hipsP[0] += 0.005 * sh; P.hipsR[2] -= 0.008 * sh; P.chest[2] += 0.004 * sh
  // 转头打量（看向她左侧，再回来）
  const look = bump(u, 0.45, 0.8)
  P.neck[1] += 0.12 * look; P.head[1] += 0.2 * look; P.head[2] += 0.06 * look
  // 耳朵：左耳 1.2 s 转向侧方（跟着声音）、右耳 3.4 s 抖一下；转头时两耳朝向不同
  P.earL.twist += 0.5 * bump(t, 1.0, 2.6); P.earL.splay += 0.08 * bump(t, 1.0, 2.6)
  earFlick(P.earR, t, 3.4 + 0.2 * hash1(seed), 1)
  earFlick(P.earL, t, 5.1, 0.7)
  P.earR.twist -= 0.25 * look
  P.nose = 0.8; P.whisk = 0.6
  return P
}

// 2. greetSpin：两手先在胸前圆起（芭蕾一位手）→ 双脚并拢屈膝 → 起踵（relevé）→ 左脚收到右脚踝前（coupé），只用右脚脚掌原地转一圈
//    （0.95–2.0 s；根绕右脚掌点转，脚掌不动、脚跟悬空，不在地上画圈）→ 左脚落回、落踵屈膝 → 轻轻一跃（2.42–2.78 s 离地约 6 cm）
//    → 落地屈膝缓冲，双臂向两侧打开（掌心向前上，「欢迎光临！」），停住 → 收回交叉
const ARMS_ROUND: Part = {
  L: { t: [0.1, 1.06, 0.3], pole: [1, 0.2, -0.3], hq: hQ(1, [-0.85, -0.05, 0.4], [0.05, -0.3, 1]), hw: 1, fl: CURL_SOFT, tab: 0 },
  R: { t: [-0.1, 1.06, 0.3], pole: [-1, 0.2, -0.3], hq: hQ(-1, [0.85, -0.05, 0.4], [-0.05, -0.3, 1]), hw: 1, fl: CURL_SOFT, tab: 0 },
}
const ARMS_OPEN: Part = {
  L: { t: [0.53, 1.24, 0.17], pole: [0.2, -1, -0.4], hq: hQ(1, [1, 0.2, 0.35], [0.0, -0.7, -0.7]), hw: 1, fl: CURL_OPEN, tab: 0 },
  R: { t: [-0.53, 1.24, 0.17], pole: [-0.2, -1, -0.4], hq: hQ(-1, [-1, 0.2, 0.35], [0.0, -0.7, -0.7]), hw: 1, fl: CURL_OPEN, tab: 0 },
}
const ARMS_UP: Part = {
  L: { t: [0.25, 1.74, 0.21], pole: [1, -0.2, -0.3], hq: hQ(1, [-0.45, 0.75, 0.2], [0.15, 0.1, 1]), hw: 1, fl: CURL_SOFT, tab: 0 },
  R: { t: [-0.25, 1.74, 0.21], pole: [-1, -0.2, -0.3], hq: hQ(-1, [0.45, 0.75, 0.2], [-0.15, 0.1, 1]), hw: 1, fl: CURL_SOFT, tab: 0 },
}
// [E28 鞋修] 并脚（芭蕾一位）两脚掌点 x ±4.5 → ±TOG_X：脚尖外开 0.18 rad 时两只鞋跟原来互相插进约 1.9 cm
const TOG_X = 0.062
const FEET_TOG = (ph: number): Part => ({ legL: { p: [TOG_X, 0, TOE[2] + 0.01], ph, yw: 0.18, tf: 1 }, legR: { p: [-TOG_X, 0, TOE[2] + 0.01], ph, yw: -0.18, tf: 1 } })
/** 旋转支点：右脚脚掌（root 空间，FEET_TOG 的右脚） */
const SPIN_PIVOT: V3 = [-TOG_X, 0, TOE[2] + 0.01]
/** 左脚 coupé：脚尖绷直、收在右脚踝前（离地约 11 cm） */
const COUPE: Part = { legL: { p: [-0.02, 0.11, TOE[2] + 0.035], ph: 1.0, yw: 0.5, tf: 0.2 } }
function greetPose(t: number): SpokesPose {
  const plie: Part = { hipsP: [0, -0.045, 0.0], hipsR: [0.05, 0, 0], spine: [0.02, 0, 0] }
  const releve: Part = { hipsP: [0, 0.05, 0], chest: [-0.06, 0, 0], head: [-0.04, 0, 0] }
  const onR: Part = { hipsP: [-0.035, 0.05, 0], hipsR: [0, 0, 0.03] }
  const P = keys(t, STAND, [
    [0, {}],
    [0.45, merge(ARMS_ROUND, FEET_TOG(0), plie, ears(0.05, 0.0))],
    [0.8, merge(ARMS_ROUND, FEET_TOG(0.85), releve, ears(-0.08, -0.05))],
    [0.95, merge(ARMS_ROUND, FEET_TOG(0.85), releve, onR, COUPE, ears(-0.1, -0.05))],
    [1.45, merge(ARMS_UP, FEET_TOG(0.85), releve, onR, COUPE, ears(-0.16, -0.08))],
    [1.8, merge(ARMS_UP, FEET_TOG(0.85), releve, onR, COUPE, ears(-0.18, -0.08))],
    [1.97, merge(ARMS_ROUND, FEET_TOG(0.85), releve, onR, COUPE, { L: { t: [0.2, 1.42, 0.27] }, R: { t: [-0.2, 1.42, 0.27] } }, ears(-0.14, -0.06))],
    // 左脚先悬到落点正上方再垂直落下（不在地上蹭）
    [2.05, merge(ARMS_ROUND, { L: { t: [0.16, 1.3, 0.285] }, R: { t: [-0.16, 1.3, 0.285] } }, FEET_TOG(0.85), releve, onR, { legL: { p: [TOG_X, 0.03, TOE[2] + 0.01], ph: 0.9 } }, ears(-0.12, -0.05))],
    [2.15, merge(ARMS_ROUND, FEET_TOG(0.85), releve, ears(-0.1, -0.05))],
    [2.35, merge(ARMS_ROUND, FEET_TOG(0.0), { hipsP: [0, -0.07, 0.0], hipsR: [0.08, 0, 0], spine: [0.04, 0, 0], head: [0.05, 0, 0] }, ears(0.05, 0.05))],
    [2.58, merge(ARMS_OPEN, FEET_TOG(0.3), { hipsP: [0, 0.06, 0], chest: [-0.08, 0, 0], head: [-0.08, 0, 0] }, ears(-0.1, -0.05))],
    [2.85, merge(ARMS_OPEN, FEET_TOG(0), { hipsP: [0, -0.06, 0.0], hipsR: [0.07, 0, 0], spine: [0.03, 0, 0], head: [0.04, 0, 0] }, ears(0.08, 0.08, 0, 0.1))],
    [3.5, merge(ARMS_OPEN, CONTRA, { chest: [-0.05, 0, 0], head: [-0.03, 0, 0.12] }, ears(-0.06, 0.12, 0.15))],
    [4.6, {}],
  ])
  // 旋转：根偏航一圈；根位置同时绕右脚掌点转（root = pivot − R(yaw)·pivot），右脚掌在世界里不动
  const spin = TAU * ss((t - 0.97) / 1.03), c = Math.cos(spin), sn = Math.sin(spin)
  P.rootR[1] = spin
  P.root = [SPIN_PIVOT[0] - (c * SPIN_PIVOT[0] + sn * SPIN_PIVOT[2]), 0, SPIN_PIVOT[2] - (-sn * SPIN_PIVOT[0] + c * SPIN_PIVOT[2])]
  // 跃起：两脚离地
  const air = bump(t, 2.42, 2.78)
  P.legL.p[1] += 0.06 * air; P.legR.p[1] += 0.06 * air; P.hipsP[1] += 0.06 * air
  P.nose = 0.5
  return P
}

// 3. bowInvite：双手交叠腹前 → 以髋为轴深鞠躬（约 40°，头更低）停一拍 → 直起一半，右手向身体右前方伸出、掌心朝上「请这边走」，左手留在腹前；头随手看过去，再回看客人
function bowPose(t: number): SpokesPose {
  const down: Part = { ...CLASP, hipsP: [0, -0.01, -0.06], hipsR: [0.42, 0, 0], spine: [0.16, 0, 0], chest: [0.08, 0, 0], neck: [0.06, 0, 0], head: [0.22, 0, 0], ...ears(0.18, 0.06, 0, 0.12) }
  const inviteR: Part = { R: { t: [-0.39, 1.0, 0.33], pole: [-0.6, -1, -0.2], hq: hQ(-1, [-0.75, -0.08, 0.66], [0.05, -1, 0.05]), hw: 1, fl: CURL_OPEN, tab: 0, clav: [0, 0.02, 0] } }
  const inviteBody: Part = { hipsR: [0.16, -0.1, 0], spine: [0.06, -0.06, 0], chest: [0.02, -0.1, 0], neck: [0.0, -0.15, 0], head: [0.1, -0.25, 0.06] }
  return keys(t, STAND, [
    [0, {}],
    [0.5, merge(CLASP, { chest: [-0.02, 0, 0] })],
    [1.2, down],
    [1.8, down],
    [2.5, merge(CLASP, inviteR, inviteBody, ears(0.0, 0.05, -0.15))],
    [3.0, merge(CLASP, inviteR, inviteBody, { head: [0.08, 0.05, 0.1], neck: [0, 0.02, 0] }, ears(-0.04, 0.05, 0.1))],
    [3.5, merge(CLASP, inviteR, inviteBody, { head: [0.06, 0.08, 0.12], neck: [0, 0.03, 0] }, ears(-0.04, 0.05, 0.1))],
    [4.2, merge(STAND_CLASP)],
  ])
}

// 4. speakerTalk：左臂横在腰前（托右肘），右手抬起、食指按住左驳头上的领口音箱（apply 时捏合点对到音箱面）；
//    说话：头随语调点动 / 侧点、两耳跟着一起点（嘴不动）；末尾松开放回交叉
const TALK_L: Part = { L: { t: [-0.04, 1.02, 0.17], pole: [1, -0.4, -0.3], hq: hQ(1, [-1, 0.05, 0.1], [0.0, 0.2, 1]), hw: 1, fl: CURL_RELAX, tab: 0 } }
const PRESS_R: Part = { R: { t: [0.02, 1.2, 0.2], pole: [-1, -0.7, -0.1], hq: hQ(-1, [0.55, 0.45, -0.7], [0.1, 0.85, 0.5]), hw: 1, fl: CURL_PRESS, tab: 0 } }
function talkPose(t: number, seed: number): SpokesPose {
  const P = keys(t, STAND, [
    [0, {}],
    [0.6, merge(TALK_L, PRESS_R, { head: [0.08, 0.1, 0.05] })],
    [4.3, merge(TALK_L, PRESS_R, { head: [0.04, 0.05, 0.04] })],
    [5.0, {}],
  ])
  P.press = ramp(t, 0.35, 0.6) * (1 - ramp(t, 4.25, 4.5))
  // 语调：几个短语（点头 + 侧点），耳朵同相点动、句尾上扬时耳朵外张
  const env = ramp(t, 0.6, 0.8) * (1 - ramp(t, 4.0, 4.3))
  const syl = Math.sin(t * TAU * 2.6 + seed) * (0.6 + 0.4 * noise1(t * 3, seed)), phr = Math.sin(t * TAU * 0.55)
  P.head[0] += env * (0.06 * syl + 0.03 * phr); P.head[2] += env * 0.07 * Math.sin(t * TAU * 0.8 + 1); P.neck[0] += env * 0.02 * syl
  P.head[1] += env * 0.05 * Math.sin(t * TAU * 0.4)
  for (const E of [P.earL, P.earR]) { E.pitch += env * (0.08 * syl - 0.04); E.splay += env * 0.08 * Math.max(0, phr) }
  P.chest[0] += 0.015 * env * syl
  P.nose = 0.3; P.whisk = 0.5
  return P
}

// 5. innerFreeze：心声爆发（0.3 s）——身体瞬间僵直（停呼吸），头高频微颤，两耳贴向后背，眼不眨；
//    3.6 s 起恢复：耳朵慢慢立起，头微歪，回到笑意姿态（双手交叠）
function freezePose(t: number, tm: number): SpokesPose {
  const frozen: Part = { ...CROSS, chest: [-0.06, 0, 0], neck: [-0.03, 0, 0], head: [-0.04, 0, 0], L: { clav: [0, 0, 0.03] }, R: { clav: [0, 0, -0.03] }, ...ears(-1.55, -0.35, 0.0, 0.3) }
  const P = keys(t, STAND, [
    [0, {}],
    [0.3, {}],
    [0.45, frozen],
    [3.5, frozen],
    [4.3, merge(CLASP, { chest: [-0.02, 0, 0], head: [0.06, 0.04, 0.16], neck: [0, 0, 0.04] }, ears(-0.02, 0.1, 0.1))],
    [5.0, merge(CLASP, { chest: [-0.02, 0, 0], head: [0.05, 0.03, 0.12] }, ears(-0.04, 0.06, 0.06))],
  ])
  const hold = ramp(t, 0.35, 0.5) * (1 - ramp(t, 3.4, 3.8))
  P.tremor = hold
  P.earDyn = 1 - 0.85 * hold
  P.nose = 1 - hold; P.whisk = 0.3 + 0.7 * hold * (0.5 + 0.5 * Math.sin(tm * 47))
  if (t > 4.0) P.nose = 0.6
  return P
}

// 6. drawPoster：站在桌前（桌面 0.74 m、近边 z 0.3），俯身，左手平按海报纸，右手捏马克笔写字 / 描边（笔尖在纸面上走字），
//    偶尔直起看一眼，耳朵前倾（专注）
const PAPER_C: V3 = [0.0, SPOKES_DESK_Y + 0.002, 0.42]
const PEN_TIP = 0.06
/** 写字手：手背朝上外、指尖朝前下（捏笔）；笔沿食指方向朝下前 */
const PEN_HQ = hQ(-1, [0.45, -0.75, 0.5], [-0.35, 0.55, 0.6])
export function spokesPenDir(hq: Q4): V3 { const h = handDirs(-1, hq); return nz(addV(sclV(h.a, 0.7), addV(sclV(h.d, -0.55), sclV(h.r, -0.15)))) }
function drawPose(_t: number, u: number): SpokesPose {
  const lean: Part = { hipsP: [0, -0.02, -0.06], hipsR: [0.36, 0.05, 0], spine: [0.19, 0.04, 0], chest: [0.12, 0.05, 0], neck: [0.12, 0, 0], head: [0.3, 0.02, 0], legL: { p: [0.085, 0, TOE[2] + 0.04], yw: 0.12 }, legR: { p: [-0.09, 0, TOE[2] - 0.04], yw: -0.1 } }
  const handL: Part = { L: { pp: [PAPER_C[0] + 0.16, PAPER_C[1] + 0.012, PAPER_C[2] - 0.11], pw: 1, pk: 0, pole: [1, 0.1, -0.6], hq: hQ(1, [-0.3, -0.12, 1], [0.0, 1, 0.12]), hw: 1, fl: C([0.1, -0.4, -0.35, -0.3, -0.2]), tab: 0 } }
  const P = over(STAND, merge(lean, handL, ears(0.22, -0.02, -0.1, 0.05)))
  // 写字：每行 2 s——前 85 % 笔尖在纸上从右往左走一行字（锯齿 + 回钩），后 15 % 抬笔、平滑回到下一行行首（第 3 行回到第 1 行）；
  //   4.2–5.1 s 抬头看一眼时笔提起、手往回收一点（身体直起，手不硬够纸面）
  const look = bump(u, 0.7, 0.85)
  const row = Math.floor(u * 3) % 3, w = frac(u * 3), wr = Math.min(1, w / 0.85), rr = ss((w - 0.85) / 0.15)
  const zRow = (r: number) => PAPER_C[2] + 0.02 - 0.06 * r
  const wig = w < 0.85 ? 1 : 0
  const tip: V3 = [
    mix(PAPER_C[0] + 0.1 - 0.2 * wr, PAPER_C[0] + 0.1, rr),
    PAPER_C[1] + 0.003 + 0.022 * Math.sin(Math.PI * rr) + (0.006 * Math.max(0, Math.sin(wr * TAU * 9 + 1.3)) * (wr > 0.92 ? 1 : 0.3)) * wig + 0.05 * look,
    mix(zRow(row), zRow((row + 1) % 3), rr) + 0.022 * Math.sin(wr * TAU * 7) * Math.sin(wr * TAU * 1.7) * wig - 0.06 * look,
  ]
  const pd = spokesPenDir(PEN_HQ)
  P.R = { ...P.R, g: subV(tip, sclV(pd, PEN_TIP)), gw: 1, pole: [-1, 0.05, -0.5], hq: PEN_HQ, hw: 1, fl: CURL_PEN, tab: 0 }
  P.head[0] -= 0.25 * look; P.chest[0] -= 0.04 * look; P.neck[0] -= 0.06 * look
  P.head[1] += 0.04 * Math.sin(u * TAU * 3)
  P.props.pen = 1; P.props.deskPoster = 1
  P.nose = 0.7
  return P
}

// 7. dropPoster：双手夹着一叠折好的海报（胸前）→ 走近墙上投递洞 A 一步 → 俯身把整叠平推进洞口 → 松手（海报滑进黑洞里不见）→ 拍拍手、直起
export const SPOKES_STACK = { w: 0.14, h: 0.03, d: 0.2 }
function stackHands(c: V3, k: number): Part {
  const hx = SPOKES_STACK.w / 2 + 0.006
  const f = C([mix(0.1, 0.3, k), mix(-0.4, -0.1, k), mix(-0.35, -0.05, k), mix(-0.3, 0, k), mix(-0.25, 0.05, k)])
  return {
    L: { pp: [c[0] + hx, c[1], c[2] - 0.03], pw: 1, pk: 0, pole: [1, -0.7, -0.2], hq: hQ(1, [-0.1, -0.15, 1], [1, 0.1, 0.05]), hw: 1, fl: f, tab: 0 },
    R: { pp: [c[0] - hx, c[1], c[2] - 0.03], pw: 1, pk: 0, pole: [-1, -0.7, -0.2], hq: hQ(-1, [0.1, -0.15, 1], [-1, 0.1, 0.05]), hw: 1, fl: f, tab: 0 },
  }
}
function dropPose(t: number): SpokesPose {
  const H = SPOKES_DROP_HOLE
  const CH: V3 = [0.0, 1.0, 0.26], NEAR: V3 = [H[0], H[1] + 0.01, H[2] - 0.2], IN: V3 = [H[0], H[1] - 0.005, H[2] - 0.06]
  const bend: Part = { hipsP: [0, -0.04, -0.04], hipsR: [0.26, 0, 0], spine: [0.14, 0, 0], chest: [0.06, 0, 0], neck: [0.06, 0, 0], head: [0.2, 0, 0] }
  const step: Part = { legL: { p: [0.07, 0, TOE[2] + 0.1], yw: 0.15 }, legR: { p: [-0.08, 0, TOE[2] - 0.02], yw: -0.1 } }
  const P = keys(t, STAND, [
    [0, merge(stackHands(CH, 1), { head: [0.12, 0, 0] })],
    [0.8, merge(stackHands(CH, 1), { head: [0.12, 0.2, 0] }, ears(0.05, 0, 0.2))],
    [1.5, merge(stackHands(NEAR, 1), step, bend, ears(0.15, 0, 0))],
    [2.2, merge(stackHands(IN, 1), step, bend, { hipsP: [0, -0.05, -0.02], hipsR: [0.32, 0, 0] }, ears(0.15, 0, 0))],
    [2.4, merge(stackHands(IN, 0), step, bend, { hipsP: [0, -0.05, -0.02], hipsR: [0.32, 0, 0] })],
    [2.9, merge(stackHands([IN[0], IN[1] + 0.02, IN[2] - 0.12], 0), step, bend)],
    [3.5, merge(CLASP, { head: [0.1, 0, 0] }, ears(0, 0.05))],
    [3.75, merge(CLASP, { L: { t: [0.03, 0.94, 0.16] }, R: { t: [-0.02, 0.96, 0.18] } })],
    [4.0, merge(CLASP, { head: [0.05, -0.05, 0.08] }, ears(-0.05, 0.08, 0.12))],
    [5.0, {}],
  ])
  P.props.stack = t < 3.0 ? 1 : 0
  P.props.stackHold = t < 2.3 ? 1 : 0
  // 松手后：海报在洞口里往后滑落（0 → 1）
  P.props.stackFall = ramp(t, 2.3, 3.0)
  P.props.stackP = IN
  // 拍拍手（3.5–4.0 s 两下）
  const clap = Math.max(0, Math.sin((t - 3.5) * TAU * 4)) * (t > 3.5 && t < 4.0 ? 1 : 0)
  P.L.t = addV(P.L.t, [0, 0.015 * clap, 0]); P.R.t = addV(P.R.t, [0, -0.012 * clap, 0])
  return P
}

// 8. windRabbit：发条兔在她脚前地上（root [0.02, 0, 0.42]）→ 并膝侧蹲（淑女蹲：两膝并拢、裙摆压在大腿上）
//    → 左手按住兔背、右手捏住发条钥匙拧 3 下（手腕拧 + 回手，钥匙只往一个方向转）→ 松手，兔子跳着往前走 → 起身目送、回到交叉
export const SPOKES_RABBIT_AT: V3 = [-0.17, 0, 0.36]
/** 发条兔钥匙蝶翼中心（兔局部，钥匙轴向） */
const RB_KEY_BASE: V3 = [0, 0.115, -0.028], RB_KEY_AX: V3 = nz([0, Math.cos(0.9), -Math.sin(0.9)])
const rabbitToRoot = (p: V3, at: V3, yaw: number): V3 => { const c = Math.cos(yaw), s = Math.sin(yaw); return [at[0] + c * p[0] + s * p[2], at[1] + p[1], at[2] - s * p[0] + c * p[2]] }
function windPose(t: number): SpokesPose {
  const R0 = SPOKES_RABBIT_AT, yaw = 0
  const keyP = rabbitToRoot(addV(RB_KEY_BASE, sclV(RB_KEY_AX, 0.03)), R0, yaw)
  const back = rabbitToRoot([0, 0.13, 0.02], R0, yaw)
  // 侧蹲：右膝低、左膝高（两膝并拢，向她右侧倒），髋下沉
  const squat: Part = {
    hipsP: [0.02, -0.55, -0.1], hipsR: [0.56, -0.34, 0.0], spine: [0.3, -0.18, 0.0], chest: [0.18, -0.1, 0], neck: [0.08, 0.05, 0], head: [0.28, 0.08, 0],
    legL: { p: [0.1, 0, TOE[2] + 0.06], ph: 0.15, yw: 0.2 }, legR: { p: [-0.04, 0, TOE[2] - 0.12], ph: 1.1, yw: 0.05, tf: 1 },
  }
  const holdL: Part = { L: { pp: back, pw: 1, pk: 0, pole: [1, 0.3, -0.4], hq: hQ(1, [-0.2, -0.35, 1], [0.15, 1, 0.3]), hw: 1, fl: C([0.2, 0.15, 0.2, 0.3, 0.35]), tab: 0 } }
  // 捏钥匙：手背朝后上、指尖朝前下（从她这边伸过兔背去捏）
  const kq0 = hQ(-1, [0.1, -0.85, 0.5], [-0.75, 0.35, 0.4])
  const pinch = (ang: number): Part => ({ R: { g: keyP, gw: 1, pole: [-1, 0.0, -0.4], hq: qRot(kq0, RB_KEY_AX, ang), hw: 1, fl: CURL_PINCH, tab: 0 } })
  // 蹲下 / 起身时双手掌心按在膝盖上（左手左膝、右手右膝；指尖朝前下搭过膝头），膝位置由腿 IK 求出
  const KNEES: Part = {
    L: { kw: 1, ks: 1, ko: [0.0, 0.055, 0.03], pw: 0, gw: 0, pole: [1, -0.2, -0.6], hq: hQ(1, [-0.15, -0.55, 1], [0.05, 1, 0.45]), hw: 1, fl: C([0.15, 0.15, 0.2, 0.25, 0.3]), tab: 0 },
    R: { kw: 1, ks: -1, ko: [0.0, 0.055, 0.03], pw: 0, gw: 0, pole: [-1, -0.2, -0.6], hq: hQ(-1, [0.15, -0.55, 1], [-0.05, 1, 0.45]), hw: 1, fl: C([0.15, 0.15, 0.2, 0.25, 0.3]), tab: 0 },
  }
  const offK: Part = { L: { kw: 0 }, R: { kw: 0 } }
  const P = keys(t, STAND, [
    [0, {}],
    [0.4, merge(CLASP, { head: [0.25, 0, 0] })],
    [1.4, merge(squat, KNEES, ears(0.2, 0.0, 0, 0.08))],
    [1.9, merge(squat, holdL, pinch(0), offK, ears(0.2, 0.0, 0, 0.08))],
    [4.6, merge(squat, holdL, pinch(0), offK, ears(0.2, 0.0, 0, 0.08))],
    // 放手：双手张开、停在兔子上方低处（掌心朝下，离兔背约 10 cm），目送它跳出去
    [5.0, merge(squat, { L: { pw: 0, t: [-0.06, 0.27, 0.36], pole: [1, 0.2, -0.4], hq: hQ(1, [-0.25, -0.35, 1], [0.1, 1, 0.25]), hw: 1, fl: CURL_OPEN }, R: { gw: 0, t: [-0.25, 0.27, 0.33], pole: [-1, 0, -0.4], hq: hQ(-1, [0.15, -0.35, 1], [-0.1, 1, 0.25]), hw: 1, fl: CURL_OPEN } }, ears(0.1, 0.05, 0, 0.0))],
    [5.5, merge(squat, KNEES, ears(0.1, 0.05, 0, 0.0))],
    [6.25, merge(CLASP, { head: [0.3, 0.0, 0], chest: [0.02, 0, 0] }, ears(0.05, 0.05, 0.1))],
    [7.0, merge(CLASP, { head: [0.22, 0.12, 0.06] }, ears(0.0, 0.05, 0.15))],
  ])
  // 拧发条：1.9–4.5 s 三下，每下 0.85 s：0.45 s 拧（手 + 钥匙一起转 1.6 rad）、0.4 s 回手（钥匙不动）
  let key = 0, hand = 0
  for (let i = 0; i < 3; i++) {
    const a = 1.95 + i * 0.85
    key += 1.6 * ramp(t, a, a + 0.45)
    hand += 1.6 * (ramp(t, a, a + 0.45) - ramp(t, a + 0.47, a + 0.82))
  }
  if (t > 1.85 && t < 4.7) { P.R.hq = qRot(P.R.hq, RB_KEY_AX, hand); P.R.g = keyP }
  P.props.rabbit = 1; P.props.rabbitYaw = yaw; P.props.rabbitKey = key
  // 4.8 s 放手 → 跳走（钥匙边跳边倒转）
  const tr = t - 4.8
  P.props.rabbitHop = tr > 0 ? tr : -1
  P.props.rabbitP = tr > 0 ? rabbitToRoot([0, 0, WINDUP_CLIPS.rabbitHop.speed * tr], R0, yaw) : [...R0]
  if (tr > 0) P.props.rabbitKey = key - 6 * tr
  // 目送：头跟着兔子
  const look = ramp(t, 5.0, 6.2)
  P.head[0] += 0.05 * look
  P.nose = 0.8
  return P
}

// 9. walk：铅笔裙小步（单步 ≈ 0.45 m）、脚落中线、髋左右摆 + 滚转、肩反向、手臂小幅摆；低跟鞋脚跟先着地但不重
function walkPose(u: number): SpokesPose {
  const P = over(STAND, HANG)
  const Ci = SPOKES_CLIPS.walk
  walkBody(P, u, WALK_G(Ci.speed! * Ci.dur), true)
  P.earL.pitch = -0.06; P.earR.pitch = -0.06
  return P
}

// 10. guidePoint：边走边回头看客人——胸 / 颈 / 头向她左后方拧约 105°（越过左肩，脸朝跟在左后方的客人），大部分时间保持回头、
//     周期中段短暂转回看一眼前方；右手前伸略外、食指指向前进方向「这边请」（肘微屈、手腕跟着步子轻晃）；左手轻贴腹前；耳朵朝后（听着客人）
function guidePose(u: number): SpokesPose {
  const P = over(STAND, HANG)
  const Ci = SPOKES_CLIPS.guidePoint
  // 一个周期两步态循环（2.2 s = 2 × 1.1 s）
  walkBody(P, frac(u * 2), { ...WALK_G(Ci.speed! * Ci.dur / 2), lift: 0.05 }, true)
  // 回头量：0.25–0.55 周期看一眼前方（0.35），其余时间回头（1.0）
  const look = 1 - 0.65 * bump(u, 0.22, 0.6)
  P.spine[1] += 0.12 * look; P.chest[1] += 0.3 * look; P.neck[1] += 0.55 * look; P.head[1] += 0.92 * look
  P.head[2] += 0.1 * look; P.head[0] += 0.03 - 0.04 * look; P.neck[0] -= 0.02 * look
  // 右手：指路（root 空间目标；胸向左拧时右肩前移，目标随回头量略前移，手臂始终指向前进方向）
  const sw = 0.012 * Math.sin(frac(u * 2) * TAU)
  P.R = { ...P.R, t: [-0.27, 1.13 + sw, 0.36 + 0.03 * look], pole: [-1, -0.9, -0.2], hq: hQ(-1, [-0.25, 0.04, 1], [-0.25, 1, -0.05]), hw: 1, fl: CURL_POINT, tab: 0.1, wr: [0, 0, 0] }
  P.L = { ...P.L, t: [0.06, 0.93, 0.15], pole: [1, -0.3, -0.5], hq: hQ(1, [-1, -0.3, 0.15], [0.05, 0.15, 1]), hw: 1, fl: CURL_RELAX, tab: 0, wr: [0, 0, 0] }
  P.earR.twist = -0.3 * look; P.earL.twist = 0.5 * look; P.earL.pitch = -0.12; P.earR.pitch = -0.1; P.earL.splay = 0.08 * look
  return P
}

// 11. sitDesk：从她左侧（root +X 0.9 m）走两步到椅前（朝 −X）→ 原地两小步转身正对桌子 → 手扶桌沿、慢慢坐下（髋落到椅面 0.44 m）→ 双手交叠放桌上
//     坐姿：大腿水平压在椅面、小腿竖直、两膝并拢（裙摆包在大腿上，下摆骨跟大腿）
// 坐好后上身前倾向桌（髋前倾 + 脊 / 胸前屈，头抬回平视），手前移到桌面上
const SEAT_HIPS: Part = { hipsP: [0, SPOKES_SEAT_Y + 0.088 - HIP_Y, -0.07], hipsR: [0.12, 0, 0], spine: [0.13, 0, 0], chest: [0.09, 0, 0], neck: [-0.04, 0, 0], head: [-0.05, 0, 0], legL: { p: [0.06, 0, TOE[2] + 0.34], ph: 0.12, yw: 0.03 }, legR: { p: [-0.06, 0, TOE[2] + 0.34], ph: 0.12, yw: -0.03 } }
const DESK_HANDS: Part = {
  L: { t: [0.07, SPOKES_DESK_Y + 0.045, 0.42], pole: [1, -0.6, -0.4], hq: hQ(1, [-0.9, -0.05, 0.42], [0.02, 1, 0.05]), hw: 1, fl: C([0.1, -0.2, -0.15, -0.1, -0.05]), tab: 0 },
  R: { t: [-0.04, SPOKES_DESK_Y + 0.065, 0.44], pole: [-1, -0.6, -0.4], hq: hQ(-1, [0.9, -0.12, 0.42], [-0.02, 1, 0.05]), hw: 1, fl: C([0.15, 0.0, 0.05, 0.1, 0.15]), tab: 0 },
}
const SEAT: SpokesPose = over(STAND, merge(SEAT_HIPS, DESK_HANDS, ears(0, 0.04, 0.05)))
function sitPose(t: number): SpokesPose {
  const F0 = SPOKES_SIT_FROM
  // 段 A（0–1.1 s）：走一个步态周期（两步）沿 −X 走到椅前
  const TA = 1.1, D = Math.abs(F0[0])
  let P: SpokesPose
  if (t < TA) {
    P = over(STAND, HANG)
    walkBody(P, t / TA, { ...WALK_G(D), center: 0 }, true)
    P.root = [F0[0] - D * (t / TA), 0, F0[2]]; P.rootR = [0, -Math.PI / 2, 0]
    return P
  }
  // 段 B（1.1–1.8 s）：转身 —— 脚掌点按世界位置给（右脚先、左脚后各迈一小步），根偏航从 −π/2 转到 0
  const walkEnd = over(STAND, HANG); walkBody(walkEnd, 0, { ...WALK_G(D), center: 0 }, true)
  const yaw = -Math.PI / 2 * (1 - ramp(t, 1.1, 1.8))
  const rootP: V3 = [0, 0, F0[2] * (1 - ramp(t, 1.1, 1.8))]
  const toWorld = (p: V3, ry: number, rp: V3): V3 => { const c = Math.cos(ry), s = Math.sin(ry); return [rp[0] + c * p[0] + s * p[2], p[1], rp[2] - s * p[0] + c * p[2]] }
  const toRoot = (w: V3, ry: number, rp: V3): V3 => { const c = Math.cos(ry), s = Math.sin(ry), x = w[0] - rp[0], z = w[2] - rp[2]; return [c * x - s * z, w[1], s * x + c * z] }
  const startW = (s: number) => toWorld(s > 0 ? walkEnd.legL.p : walkEnd.legR.p, -Math.PI / 2, [0, 0, F0[2]])
  // [E28 鞋修] 转身改成左脚先、右脚后（向左转先迈左脚）：原来右脚先落到终点，左脚再从 36 cm 外横穿过来，
  //   正好从右鞋上扫过（两鞋互穿约 1.6 cm），且左脚撑地时根已转身、左腿够不到地（鞋悬空约 4 cm）。
  //   左脚：先往前（+Z）再往右、早转脚尖；右脚：先往 −X 平移（脚尖仍朝 −X，鞋跟避开左鞋）再转身前移。左脚终点略外、略前
  const endW = (s: number): V3 => (s > 0 ? [0.09, 0, TOE[2] + 0.07] : [-0.075, 0, TOE[2] + 0.02])
  const stepK = (s: number) => (s > 0 ? ramp(t, 1.1, 1.45) : ramp(t, 1.4, 1.8))
  const lift = (s: number) => (s > 0 ? bump(t, 1.1, 1.45) : bump(t, 1.4, 1.8))
  const lead = (k: number) => 1 - (1 - k) ** 2.2, lag = (k: number) => k ** 1.7
  const sitK = ramp(t, 2.0, 3.1)
  P = keys(t, STAND, [
    // [E28 鞋修] 1.1 s 接上走路末帧的髋（含落地下沉）；转身时屈膝降髋、髋移向撑地脚（原来撑地脚够不到地 → 鞋悬空 2～4 cm）
    [1.1, merge(HANG, { hipsP: [-0.006, W_HIP - 0.018, 0] })],
    [1.3, merge(HANG, { hipsP: [0.02, -0.055, -0.035] })],
    [1.6, merge(HANG, { hipsP: [0.0, -0.045, 0.0] })],
    [1.8, merge(HANG, { head: [0.1, 0, 0] })],
    [2.0, merge({ hipsR: [0.46, 0, 0], spine: [0.17, 0, 0], chest: [0.06, 0, 0], hipsP: [0, -0.015, -0.04] }, { L: { t: [0.2, SPOKES_DESK_Y + 0.03, 0.3], pole: [1, -0.4, -0.5], hq: hQ(1, [0, -0.2, 1], [0, 1, 0.1]), hw: 1, fl: C([0.1, -0.3, -0.25, -0.2, -0.1]), tab: 0 }, R: { t: [-0.2, SPOKES_DESK_Y + 0.03, 0.3], pole: [-1, -0.4, -0.5], hq: hQ(-1, [0, -0.2, 1], [0, 1, 0.1]), hw: 1, fl: C([0.1, -0.3, -0.25, -0.2, -0.1]), tab: 0 } }, { head: [0.15, 0, 0] })],
    [2.6, merge(SEAT_HIPS, { hipsP: [0, (SPOKES_SEAT_Y + 0.088 - HIP_Y) * 0.55, -0.05], hipsR: [0.25, 0, 0], spine: [0.12, 0, 0], head: [0.12, 0, 0] }, { L: { t: [0.2, SPOKES_DESK_Y + 0.03, 0.4], pole: [1, -0.4, -0.5], hq: hQ(1, [0, -0.2, 1], [0, 1, 0.1]), hw: 1, fl: C([0.1, -0.3, -0.25, -0.2, -0.1]), tab: 0 }, R: { t: [-0.2, SPOKES_DESK_Y + 0.03, 0.4], pole: [-1, -0.4, -0.5], hq: hQ(-1, [0, -0.2, 1], [0, 1, 0.1]), hw: 1, fl: C([0.1, -0.3, -0.25, -0.2, -0.1]), tab: 0 } })],
    [3.2, merge(SEAT_HIPS, DESK_HANDS, ears(0.05, 0.04, 0, 0.05))],
    [4.6, merge(SEAT_HIPS, DESK_HANDS, ears(0, 0.04, 0.05))],
  ])
  P.root = rootP; P.rootR = [0, yaw, 0]
  if (t < 2.0) {
    for (const s of [1, -1]) {
      const k = stepK(s), a = startW(s), b = endW(s)
      const kx = s > 0 ? lag(k) : lead(k), kz = s > 0 ? lead(k) : lag(k), ky = s > 0 ? lead(k) : lag(k)
      const w: V3 = [mix(a[0], b[0], kx), 0.05 * lift(s), mix(a[2], b[2], kz)]
      const L = s > 0 ? P.legL : P.legR
      // 脚的世界偏航：着地时不变（不绕脚掌拧），迈步时从走路朝向转到正对桌子
      const wy = mix(-Math.PI / 2 + s * 0.1, s * 0.08, ky)
      L.p = toRoot(w, yaw, rootP); L.ph = 0.3 * lift(s); L.yw = wy - yaw; L.tf = 1
    }
  } else {
    // 坐好后（3.1 s 起）两只脚各自迈一小步把小腿收成竖直：左脚 3.1–3.4 s、右脚 3.35–3.65 s，脚只在离地时水平移动
    for (const s of [1, -1]) {
      const L = s > 0 ? P.legL : P.legR, a = s > 0 ? 3.1 : 3.35, u = c01((t - a) / 0.3), e = u * u * u * (u * (6 * u - 15) + 10)
      const p0 = endW(s), p1: V3 = [s * 0.06, 0, TOE[2] + 0.34]
      L.p = mixV(p0, p1, e); L.p[1] = 0.035 * Math.sin(Math.PI * u); L.ph = mix(0.0, 0.12, e) + 0.25 * Math.sin(Math.PI * u); L.yw = mix(s * 0.08, s * 0.03, e); L.tf = 1
    }
    // 坐下过程中髋后移（屁股找椅面）
    P.hipsP[2] = mix(0, SEAT_HIPS.hipsP![2], sitK)
  }
  return P
}
function seatedIdlePose(t: number, u: number): SpokesPose {
  const P = deepClone(SEAT)
  breathe(P, u, 2)
  const look = bump(u, 0.3, 0.6)
  P.neck[1] += 0.1 * look; P.head[1] += 0.18 * look; P.head[0] -= 0.05 * look
  // 右手指尖轻点桌面
  const tap = Math.max(0, Math.sin(t * TAU * 2.2)) * bump(u, 0.65, 0.9)
  P.R.fl = P.R.fl.map((v, i) => (i >= 3 && i < 6 ? v - 0.25 * tap : v))
  earFlick(P.earL, t, 1.2, 0.8); earFlick(P.earR, t, 4.4, 1)
  P.nose = 0.7
  return P
}

// 12. shoulderTap：0.5 s 老板的手落在她右肩 → 一下耸肩缩颈（肩耸起、头前缩、两耳瞬间贴后），身体僵住；
//     1.3 s 起强笑：头歪向一侧、略点头、双手在腹前绞紧，耳朵仍半贴着（抖）
function tapPose(t: number, tm: number): SpokesPose {
  const flinch: Part = { ...CLASP, L: { clav: [0, 0, 0.15], t: [0.04, 0.95, 0.13] }, R: { clav: [0, 0, -0.15], t: [-0.03, 0.965, 0.15] }, chest: [0.06, 0, 0], neck: [0.2, 0, 0], head: [-0.1, 0, 0], hipsP: [0, -0.01, 0], ...ears(-1.4, -0.12, 0, 0.25) }
  const smile: Part = merge(flinch, { L: { clav: [0, 0, 0.08], fl: C([0.4, 0.5, 0.55, 0.6, 0.65]) }, R: { clav: [0, 0, -0.08], fl: C([0.5, 0.6, 0.6, 0.65, 0.7]) }, neck: [0.06, 0.05, 0.05], head: [0.08, 0.08, 0.2] }, ears(-0.85, -0.05, 0, 0.1))
  const P = keys(t, STAND_CLASP, [
    [0, {}],
    [0.5, {}],
    [0.62, flinch],
    [1.3, flinch],
    [1.9, smile],
    [3.4, merge(smile, { head: [0.12, 0.06, 0.22] })],
    [4.2, merge(smile, { head: [0.1, 0.06, 0.2] }, ears(-0.6, -0.05, 0, -0.1))],
  ])
  const k = ramp(t, 0.5, 0.62)
  P.tremor = 0.5 * k * (1 - ramp(t, 1.3, 2.0)) + 0.25 * ramp(t, 1.9, 2.4)
  P.earDyn = 1 - 0.6 * k
  // 强笑的「点头」两下
  P.head[0] += 0.06 * (bump(t, 2.2, 2.55) + bump(t, 2.7, 3.05))
  // 耳尖细抖
  P.earL.bend += 0.04 * k * Math.sin(tm * 31); P.earR.bend += 0.04 * k * Math.sin(tm * 29 + 1)
  P.nose = 1 - 0.7 * k
  return P
}

// 13. photoRecall：双手捏着照片下角举到胸前，低头看（耳朵半垂）→ 耳朵慢慢立起、头一点点歪，手微抖 → 5.0 s 一瞬「认出」：
//     后退半步（右脚后撤、重心后移）、右手松开照片捂到胸口，左手垂着仍捏着照片；耳朵完全立起、外张
export const SPOKES_PHOTO = { w: 0.1, h: 0.14 }
const PHOTO_C: V3 = [0.0, 1.2, 0.33]
function photoHands(c: V3, tr: number): Part {
  const dx = SPOKES_PHOTO.w / 2 - 0.006, y = c[1] - SPOKES_PHOTO.h / 2 + 0.012, z = c[2] - 0.015
  return {
    L: { g: [c[0] + dx, y + tr, z], gw: 1, pole: [1, -0.6, -0.4], hq: hQ(1, [-0.35, 0.6, 0.6], [0.2, -0.45, 0.85]), hw: 1, fl: CURL_PINCH, tab: 0 },
    R: { g: [c[0] - dx, y - tr, z], gw: 1, pole: [-1, -0.6, -0.4], hq: hQ(-1, [0.35, 0.6, 0.6], [-0.2, -0.45, 0.85]), hw: 1, fl: CURL_PINCH, tab: 0 },
  }
}
function photoPose(t: number, tm: number): SpokesPose {
  const look: Part = { neck: [0.12, 0, 0], head: [0.42, 0, 0], chest: [0.04, 0, 0] }
  const tremA = 0.003 * ramp(t, 2.0, 3.5) * (1 - ramp(t, 4.9, 5.1))
  const tr = tremA * Math.sin(tm * 53) + 0.6 * tremA * Math.sin(tm * 37 + 1)
  const recog: Part = {
    hipsP: [0, -0.012, -0.06], hipsR: [-0.06, 0, 0], chest: [-0.1, 0, 0], neck: [-0.02, 0, 0], head: [0.1, 0.05, 0.08],
    legR: { p: [-0.085, 0, TOE[2] - 0.16], ph: 0.25, yw: -0.12 }, legL: { p: [0.07, 0, TOE[2] + 0.02], yw: 0.15 },
    R: { pp: [-0.02, 1.2, 0.16], pw: 1, pk: 0, gw: 0, pole: [-1, -0.5, -0.4], hq: hQ(-1, [0.85, 0.25, 0.1], [-0.1, 0.05, 1]), hw: 1, fl: CURL_CHEST, tab: 0 },
    L: { g: [0.14, 0.93, 0.18], gw: 1, pole: [1, -0.4, -0.5], hq: hQ(1, [-0.2, -0.7, 0.6], [0.6, 0.1, 0.6]), hw: 1, fl: CURL_PINCH, tab: 0 },
  }
  const P = keys(t, STAND, [
    [0, merge(photoHands(PHOTO_C, 0), look, ears(0.55, 0.2, 0, 0.25))],
    [2.0, merge(photoHands(PHOTO_C, 0), look, { head: [0.44, 0.0, 0.1] }, ears(0.4, 0.15, 0, 0.18))],
    [4.6, merge(photoHands([0, 1.23, 0.32], 0), look, { head: [0.36, 0.0, 0.28], neck: [0.1, 0, 0.05] }, ears(-0.02, 0.05, 0.1, 0.0))],
    [5.0, merge(photoHands([0, 1.23, 0.32], 0), look, { head: [0.3, 0.0, 0.22] }, ears(-0.05, 0.05, 0.1, 0.0))],
    [5.45, merge(recog, ears(-0.22, -0.18, 0.15, -0.05))],
    [7.4, merge(recog, { head: [0.18, 0.02, 0.1] }, ears(-0.15, -0.08, 0.1, 0.0))],
  ])
  P.L.g = addV(P.L.g, [0, tr, 0]); P.R.g = addV(P.R.g, [0, -tr, 0])
  P.props.photo = 1; P.props.photoHold = t < 5.1 ? 2 : 1
  P.nose = t > 5.0 && t < 5.8 ? 1 : 0.3
  P.earDyn = 1
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
const LEG_REST: Record<number, ChainRest> = { 1: chainRest(JP('thighL'), JP('shinL'), JP('footL')), [-1]: chainRest(JP('thighR'), JP('shinR'), JP('footR')) }
const _res = { arm: 0, leg: 0 }
/** 最近一次 apply 的 IK 残差（米）：手腕 / 踝没够到的距离（验收用） */
export const spokesIkResidual = () => ({ ..._res })
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
  const Ru = new THREE.Quaternion().setFromRotationMatrix(frameM(u1, n1).multiply(frameM(R.u0, R.n0).transpose()))
  const Rf = new THREE.Quaternion().setFromRotationMatrix(frameM(f1, n1).multiply(frameM(R.f0, R.n0).transpose()))
  return { Ru, Rf, miss: Math.max(0, miss) }
}
function setFingers(A: SpokesArm, fl: number[], tab: number) {
  FINGERS.forEach((f, i) => A.fingers[f].forEach((b, k) => b.quaternion.setFromAxisAngle(b.userData.flexAxis as THREE.Vector3, fl[i * 3 + k] ?? 0)))
  if (tab) { const d = BH_HAND[A.side].F.d; A.fingers.thumb[0].quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...d), tab)) }
}
function fkRel(b: THREE.Object3D, stop: THREE.Object3D): THREE.Vector3 {
  if (b === stop) return new THREE.Vector3()
  const chain: THREE.Object3D[] = []; for (let x: THREE.Object3D | null = b; x && x !== stop; x = x.parent) chain.push(x)
  const p = new THREE.Vector3(), q = new THREE.Quaternion()
  for (let i = chain.length - 1; i >= 0; i--) { p.add(chain[i].position.clone().applyQuaternion(q)); q.multiply(chain[i].quaternion) }
  return p
}
/** 捏合点（手骨局部）：拇指远节 / 食指远节骨原点中点，再向指尖方向推 8 mm */
function pinchLocal(A: SpokesArm) {
  const th = fkRel(A.fingers.thumb[2], A.wrist), ix = fkRel(A.fingers.index[2], A.wrist)
  return th.lerp(ix, 0.5).addScaledVector(v3(BH_HAND[A.side].F.a), 0.008)
}
function solveArm(rig: SpokesRig, A: SpokesArm, s: number, P: SArmPose, chest: Xf) {
  const root = rig.root
  setE(A.clav, P.clav)
  setFingers(A, P.fl, P.tab)
  const S = fk(A.shoulder, root).p
  const qR = new THREE.Quaternion(...P.hq), qC = chest.q.clone().multiply(new THREE.Quaternion(...P.hqc))
  const qWorld = qR.slerp(qC, c01(P.cs))
  const tR = v3(P.t), tC = v3(P.tc).sub(v3(CHEST_J)).applyQuaternion(chest.q).add(chest.p)
  const T = tR.lerp(tC, c01(P.cs))
  if (P.gw > 0) T.lerp(v3(P.g).sub(pinchLocal(A).applyQuaternion(qWorld)), c01(P.gw))
  if (P.pw > 0) T.lerp(v3(P.pp).sub(palmLocal(s, P.pk).applyQuaternion(qWorld)), c01(P.pw))
  if (P.kw > 0) { const knee = fk(rig.bones['shin' + SN(P.ks >= 0 ? 1 : -1)], root).p.add(v3(P.ko)); T.lerp(knee.sub(palmLocal(s, 0).applyQuaternion(qWorld)), c01(P.kw)) }
  const { Ru, Rf, miss } = twoBone(S, T, LU, LF, P.pole, ARM_REST[s], 0.1)
  _res.arm = Math.max(_res.arm, miss)
  setRootQ(A.shoulder, root, Ru)
  A.elbow.quaternion.copy(Ru.clone().invert().multiply(Rf))
  const qW = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.wr[0], P.wr[1], P.wr[2], 'YXZ'))
  const qHand = qWorld.multiply(qW), qFollow = Rf.clone().multiply(qW)
  const qFinal = P.hw >= 1 ? qHand : qFollow.slerp(qHand, c01(P.hw))
  A.wrist.quaternion.copy(Rf.clone().invert().multiply(qFinal))
}
const _ax = new THREE.Vector3(1, 0, 0), _ay = new THREE.Vector3(0, 1, 0)
function solveLeg(rig: SpokesRig, s: number, P: SLegPose) {
  const root = rig.root, S = SN(s), bn = rig.bones
  const thigh = bn['thigh' + S], shin = bn['shin' + S], foot = bn['foot' + S], toe = bn['toe' + S]
  const qy = new THREE.Quaternion().setFromAxisAngle(_ay, P.yw)
  const toeJ = v3(P.p).add(new THREE.Vector3(0, TOE_H, 0))
  const oA = v3([FOOT_A[0] * s, FOOT_A[1], FOOT_A[2]]).applyQuaternion(qy), oH = v3([FOOT_H[0] * s, FOOT_H[1], FOOT_H[2]]).applyQuaternion(qy)
  const lat = _ax.clone().applyQuaternion(qy)
  const qp = new THREE.Quaternion().setFromAxisAngle(lat, P.ph)
  let ankle: THREE.Vector3
  if (P.ph >= 0) ankle = toeJ.clone().add(oA.clone().applyQuaternion(qp))
  else { const heel = toeJ.clone().add(oH); ankle = heel.clone().add(oA.clone().sub(oH).applyQuaternion(qp)) }
  const H = fk(thigh, root).p
  const pole = new THREE.Vector3(0, 0, 1).applyQuaternion(qy).add(new THREE.Vector3(0, 0.15, 0))
  const { Ru, Rf, miss } = twoBone(H, ankle, LT, LS, [pole.x, pole.y, pole.z], LEG_REST[s], 0.2)
  _res.leg = Math.max(_res.leg, miss)
  setRootQ(thigh, root, Ru)
  shin.quaternion.copy(Ru.clone().invert().multiply(Rf))
  const qFoot = qp.clone().multiply(qy)
  foot.quaternion.copy(Rf.clone().invert().multiply(qFoot))
  toe.quaternion.setFromAxisAngle(_ax, -Math.max(0, P.ph) * P.tf)
}

// ---------- 二阶：裙摆（下摆骨）/ 兔耳 ----------
interface EarDyn { th: number[]; v: number[]; last: THREE.Vector3[]; lastV: THREE.Vector3[] }
interface Dyn { init: boolean; hem: number[]; hemV: number[]; ear: Record<number, EarDyn> }
function dynOf(rig: SpokesRig): Dyn {
  const R = rig as SpokesRig & { __sdyn?: Dyn }
  const ed = (): EarDyn => ({ th: [0, 0, 0], v: [0, 0, 0], last: [new THREE.Vector3(), new THREE.Vector3()], lastV: [new THREE.Vector3(), new THREE.Vector3()] })
  return (R.__sdyn ??= { init: false, hem: [0, 0, 0, 0], hemV: [0, 0, 0, 0], ear: { 1: ed(), [-1]: ed() } })
}
export function resetSpokesDynamics(rig: SpokesRig) {
  const d = dynOf(rig); d.init = false; d.hem.fill(0); d.hemV.fill(0)
  for (const s of [1, -1]) { const e = d.ear[s]; e.th.fill(0); e.v.fill(0) }
}
/** 下摆骨目标：大腿方向（hips 空间）的前屈 / 外展 → 裙摆跟随（前屈 0.94–1.0、后伸 0.85、外展 0.8） */
function hemTarget(rig: SpokesRig, s: number): [number, number] {
  const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(rig.bones['thigh' + SN(s)].quaternion)
  const flex = Math.atan2(dir.z, -dir.y), abd = Math.atan2(dir.x, Math.hypot(dir.y, dir.z))
  const k = flex > 0 ? mix(0.99, 1.02, ss((flex - 0.3) / 0.8)) : 1.0
  return [flex * k, abd * 0.8]
}
function applyHem(rig: SpokesRig, dt: number | undefined) {
  const D = dynOf(rig)
  for (const s of [1, -1]) {
    const i = s > 0 ? 0 : 2, [fx, ab] = hemTarget(rig, s)
    if (dt === undefined || !D.init) { D.hem[i] = fx; D.hem[i + 1] = ab; D.hemV[i] = 0; D.hemV[i + 1] = 0 }
    else if (dt > 0) {
      const h = Math.min(dt, 0.05), K = 220, Cd = 18
      for (const [j, tg] of [[i, fx], [i + 1, ab]] as [number, number][]) { D.hemV[j] += (K * (tg - D.hem[j]) - Cd * D.hemV[j]) * h; D.hem[j] += D.hemV[j] * h }
      // 前屈时不许落后大腿 90%（腿不从裙前片穿出）
      if (fx > 0) D.hem[i] = Math.max(D.hem[i], fx * 0.9)
      else D.hem[i] = Math.min(D.hem[i], fx * 0.9)
    }
    const b = rig.bones['hem' + SN(s)]
    b.rotation.order = 'XYZ'; b.rotation.set(-D.hem[i], 0, D.hem[i + 1])
    // 裙摆骨：大腿抬高（坐 / 蹲）时裙筒沿腿轴横向收窄
    //   站着屈膝（鞠躬 / 弯腰 / 走路）时膝盖前顶 → 裙下段前后略撑开，膝盖不从下摆前片顶出来
    const sq = ss((D.hem[i] - 0.45) / 0.8), sk = rig.bones['skirt' + SN(s)]
    const kq = rig.bones['shin' + SN(s)].quaternion, knee = Math.min(1, 2 * Math.acos(Math.min(1, Math.abs(kq.w))))
    if (sk) sk.scale.set(mix(1 + 0.12 * knee, 0.66, sq), 1, mix(1 + 0.8 * knee, 0.6, sq))
  }
}
/** 兔耳：耳根姿态 + 惯性。弹簧 th = [俯仰, 侧摆, 弯折]，驱动 = 耳中点加速度（头局部系） */
const EAR_K = (2 * Math.PI * 2.4) ** 2, EAR_C = 2 * 0.22 * Math.sqrt(EAR_K)
const EAR_MID_LOCAL: Record<number, THREE.Vector3> = {}
function applyEars(rig: SpokesRig, P: SpokesPose, head: Xf, dt: number | undefined) {
  const D = dynOf(rig)
  for (const s of [1, -1]) {
    const E = s > 0 ? P.earL : P.earR, bones = s > 0 ? rig.earL : rig.earR, ed = D.ear[s]
    // 耳根（ear0）：外张绕前向轴、后贴绕横轴、扭转绕耳轴（头局部系，骨静止旋转 = 单位）
    const b0 = BONES[B['ear' + SN(s) + '0']].pos, b2 = BONES[B['ear' + SN(s) + '2']].pos
    const axis = v3(nz(subV(b2, b0)))
    EAR_MID_LOCAL[s] ??= v3(b2).sub(v3(HEAD_J))
    // 惯性：耳中点（头系）的世界加速度 → 头局部
    const mid = EAR_MID_LOCAL[s].clone().applyQuaternion(head.q).add(head.p).add(v3(P.root))
    if (dt && dt > 0 && D.init) {
      const vel = mid.clone().sub(ed.last[0]).divideScalar(dt)
      const acc = vel.clone().sub(ed.lastV[0]).divideScalar(dt).clampLength(0, 40)
      const al = acc.applyQuaternion(head.q.clone().invert())
      const g = 9 * c01(P.earDyn)
      const drive = [-g * al.z - 0.4 * g * al.y, g * al.x, -0.6 * g * al.y]
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n
      const Kk = EAR_K * (P.earDyn < 0.5 ? 3 : 1)
      for (let it = 0; it < n; it++) for (let j = 0; j < 3; j++) { ed.v[j] += (-Kk * ed.th[j] - EAR_C * ed.v[j] + drive[j]) * h; ed.th[j] = clamp(ed.th[j] + ed.v[j] * h, -0.6, 0.6) }
      ed.lastV[0].copy(vel)
    } else if (!D.init || dt === undefined) { ed.th.fill(0); ed.v.fill(0); ed.lastV[0].set(0, 0, 0) }
    ed.last[0].copy(mid)
    const th = ed.th
    const q0 = new THREE.Quaternion().setFromAxisAngle(_ax, E.pitch + 0.35 * th[0])
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -s * E.splay + 0.35 * th[1]))
      .multiply(new THREE.Quaternion().setFromAxisAngle(axis, s * E.twist))
    bones[0].quaternion.copy(q0)
    // 中段 / 耳尖：弯折（+ = 向后弯）+ 惯性（越到耳尖越大）
    const b1 = new THREE.Quaternion().setFromAxisAngle(_ax, -E.bend * 0.5 + 0.6 * (th[0] + th[2])).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5 * th[1]))
    const b2q = new THREE.Quaternion().setFromAxisAngle(_ax, -E.bend * 0.7 + 0.9 * (th[0] + th[2])).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.8 * th[1]))
    bones[1].quaternion.copy(b1); bones[2].quaternion.copy(b2q)
  }
}
/** 鼻子翕动（成串快抽 + 间歇）、胡须颤；jaw 不动 */
function applyNose(rig: SpokesRig, P: SpokesPose, tm: number) {
  const burst = 0.5 + 0.5 * Math.sin(tm * 1.7) * Math.sin(tm * 0.63 + 1)
  const tw = Math.max(0, Math.sin(tm * TAU * 6.5)) * ss(burst * 1.6 - 0.3) * P.nose
  rig.nose.rotation.set(-0.12 * tw, 0, 0)
  const r = rig.nose.userData.rest as { p: THREE.Vector3 }
  rig.nose.position.copy(r.p).add(new THREE.Vector3(0, 0.0025 * tw, -0.0015 * tw))
  const wk = 0.04 * P.whisk * (Math.sin(tm * 23) * 0.6 + Math.sin(tm * 37 + 1) * 0.4) + 0.05 * tw
  rig.whiskerL.rotation.set(wk * 0.5, 0, wk); rig.whiskerR.rotation.set(wk * 0.5, 0, -wk)
  rig.jaw.quaternion.identity()
}

// ---------- 道具 ----------
interface PropState { pen: THREE.Group; stack: THREE.Group; paper: THREE.Mesh; photo: THREE.Group; rabbit: THREE.Group }
const PM = {
  pen: litMaterial({ color: '#c8203a', roughness: 0.4 }), penCap: litMaterial({ color: '#1c1c1c', roughness: 0.5 }), penTip: litMaterial({ color: '#7a0f1e', roughness: 0.6 }),
  paperEdge: litMaterial({ color: '#efe6cf', roughness: 0.9 }), photoBack: litMaterial({ color: '#e8e0cc', roughness: 0.9 }),
}
function photoTexture() {
  if (typeof document === 'undefined') return undefined
  const c = document.createElement('canvas'); c.width = 160; c.height = 224
  const g = c.getContext('2d')!
  g.fillStyle = '#f2ead6'; g.fillRect(0, 0, 160, 224)
  const gr = g.createLinearGradient(0, 0, 0, 190); gr.addColorStop(0, '#8f7a5e'); gr.addColorStop(1, '#4e3f2c'); g.fillStyle = gr; g.fillRect(10, 10, 140, 180)
  // 棕发棕眼的女人（侦探照片）：棕色长发、肤色脸、棕眼
  g.fillStyle = '#5a3a22'; g.beginPath(); g.ellipse(80, 92, 44, 56, 0, 0, Math.PI * 2); g.fill(); g.fillRect(36, 92, 88, 80)
  g.fillStyle = '#d9b08c'; g.beginPath(); g.ellipse(80, 96, 30, 38, 0, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#5a3a22'; g.beginPath(); g.ellipse(80, 66, 34, 16, 0, Math.PI, 0); g.fill()
  for (const x of [68, 92]) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, 92, 6, 3.5, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#6b4224'; g.beginPath(); g.arc(x, 92, 3, 0, Math.PI * 2); g.fill() }
  g.strokeStyle = '#9a5a4a'; g.lineWidth = 2; g.beginPath(); g.arc(80, 112, 9, 0.2, Math.PI - 0.2); g.stroke()
  g.fillStyle = '#6a4a3a'; g.fillRect(44, 150, 72, 40)
  g.fillStyle = 'rgba(120,90,50,0.25)'; g.fillRect(0, 0, 160, 224)
  g.fillStyle = '#3a2a1a'; g.font = 'italic 14px Georgia, serif'; g.fillText('— 1987', 96, 212)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function props(rig: SpokesRig): PropState {
  const R = rig as SpokesRig & { __sprops?: PropState }
  if (R.__sprops) return R.__sprops
  const mk = (g: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o }
  // 马克笔（局部 +Y = 笔尖方向，原点 = 笔尖）
  const pen = new THREE.Group(); pen.name = 'spokesPen'
  { const body = mk(new THREE.CylinderGeometry(0.0062, 0.0062, 0.12, 12), PM.pen); body.position.y = -0.075; pen.add(body)
    const cap = mk(new THREE.CylinderGeometry(0.0066, 0.0066, 0.03, 12), PM.penCap); cap.position.y = -0.135; pen.add(cap)
    const tip = mk(new THREE.ConeGeometry(0.004, 0.015, 10), PM.penTip); tip.position.y = -0.0075; pen.add(tip) }
  // 海报叠（折好的几张，局部原点 = 中心；宽 X、厚 Y、长 Z）
  const pt = posterTexture()
  const face = pt ? litMaterial({ color: '#ffffff', map: pt.map }) : PM.paperEdge
  const stack = new THREE.Group(); stack.name = 'spokesPosterStack'
  { const { w, h, d } = SPOKES_STACK; const b = mk(new THREE.BoxGeometry(w, h, d), [PM.paperEdge, PM.paperEdge, face, PM.paperEdge, PM.paperEdge, PM.paperEdge] as unknown as THREE.Material); stack.add(b)
    for (let i = 0; i < 3; i++) { const sh = mk(new THREE.BoxGeometry(w - 0.004, 0.002, d - 0.004), PM.paperEdge); sh.position.set((i - 1) * 0.004, h / 2 + 0.001 + i * 0.0001, (i - 1) * 0.005); sh.rotation.y = (i - 1) * 0.04; sh.visible = false; stack.add(sh) } }
  // 桌上海报纸（平放，A2：0.42 × 0.594，原点 = 中心，正面朝 +Y）
  const paper = mk(new THREE.PlaneGeometry(0.42, 0.594), face); paper.name = 'spokesDeskPoster'; paper.rotation.set(-Math.PI / 2, 0, Math.PI / 2)
  // 照片（原点 = 中心，正面 +Z）
  const photo = new THREE.Group(); photo.name = 'spokesPhoto'
  { const { w, h } = SPOKES_PHOTO; const fr = mk(new THREE.PlaneGeometry(w, h), litMaterial({ color: '#ffffff', map: photoTexture() })); photo.add(fr)
    const bk = mk(new THREE.PlaneGeometry(w, h), PM.photoBack); bk.rotation.y = Math.PI; bk.position.z = -0.0005; photo.add(bk) }
  const rabbit = buildWindupRabbit()
  for (const o of [pen, stack, paper, photo, rabbit]) { o.visible = false; rig.root.add(o) }
  R.__sprops = { pen, stack, paper, photo, rabbit }
  return R.__sprops
}
function pinchPoint(rig: SpokesRig, A: SpokesArm): THREE.Vector3 { const hx = fk(A.wrist, rig.root); return pinchLocal(A).applyQuaternion(hx.q).add(hx.p) }
function palmPoint(rig: SpokesRig, A: SpokesArm, s: number, pk: number): THREE.Vector3 { const hx = fk(A.wrist, rig.root); return palmLocal(s, pk).applyQuaternion(hx.q).add(hx.p) }
export function spokesPalmPoint(rig: SpokesRig, s = -1, pk = 0) { return palmPoint(rig, s > 0 ? rig.armL : rig.armR, s, pk) }
export function spokesPinchPoint(rig: SpokesRig, s = -1) { return pinchPoint(rig, s > 0 ? rig.armL : rig.armR) }
function applyProps(rig: SpokesRig, P: SpokesPose) {
  const st = props(rig), pr = P.props
  // 笔：笔尖 = 捏合点 + 笔向 × PEN_TIP（笔向由实际手朝向求）
  st.pen.visible = pr.pen > 0.5
  if (st.pen.visible) {
    const hx = fk(rig.armR.wrist, rig.root), pp = pinchPoint(rig, rig.armR)
    const pd = v3(spokesPenDir(qArr(hx.q)))
    st.pen.position.copy(pp).addScaledVector(pd, PEN_TIP)
    st.pen.quaternion.setFromUnitVectors(_ay, pd)
  }
  st.paper.visible = pr.deskPoster > 0.5
  if (st.paper.visible) st.paper.position.set(PAPER_C[0], PAPER_C[1], PAPER_C[2])
  // 海报叠：双手夹着 = 两掌心中点；松手后从洞口往里滑落
  st.stack.visible = pr.stack > 0.5
  if (st.stack.visible) {
    if (pr.stackHold > 0.5) {
      const a = palmPoint(rig, rig.armL, 1, 0), b = palmPoint(rig, rig.armR, -1, 0), c = a.clone().add(b).multiplyScalar(0.5)
      const d = a.clone().sub(b); d.y = 0
      st.stack.position.copy(c).add(new THREE.Vector3(0, 0, 0.03)); st.stack.quaternion.setFromAxisAngle(_ay, Math.atan2(-d.z, d.x))
    } else {
      const f = pr.stackFall
      st.stack.position.set(pr.stackP[0], pr.stackP[1] - 0.12 * f * f, pr.stackP[2] + 0.03 + 0.28 * f); st.stack.quaternion.setFromAxisAngle(_ax, 0.5 * f)
      st.stack.visible = f < 0.98
    }
  }
  // 照片：双手捏下角（photoHold 2）/ 左手捏一角垂着（1）
  st.photo.visible = pr.photo > 0.5
  if (st.photo.visible) {
    const { w, h } = SPOKES_PHOTO
    if (pr.photoHold > 1.5) {
      const a = pinchPoint(rig, rig.armL), b = pinchPoint(rig, rig.armR), c = a.clone().add(b).multiplyScalar(0.5)
      const xA = b.clone().sub(a).normalize(), n = new THREE.Vector3(0, 0.55, -1).applyQuaternion(fk(rig.chest, rig.root).q).normalize(), up = new THREE.Vector3().crossVectors(n, xA).normalize()
      const nn = new THREE.Vector3().crossVectors(xA, up)
      st.photo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, up, nn))
      st.photo.position.copy(c).addScaledVector(up, h / 2 - 0.012)
    } else {
      const a = pinchPoint(rig, rig.armL), hx = fk(rig.armL.wrist, rig.root)
      const dn = new THREE.Vector3(0, -1, 0), fw = v3(BH_HAND[1].F.d).applyQuaternion(hx.q); fw.y = 0; if (fw.lengthSq() < 1e-6) fw.set(0, 0, 1); fw.normalize()
      const xA = new THREE.Vector3().crossVectors(dn, fw).normalize()
      st.photo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, dn.clone().negate(), new THREE.Vector3().crossVectors(xA, dn.clone().negate())))
      st.photo.position.copy(a).addScaledVector(xA, -(w / 2 - 0.008)).add(new THREE.Vector3(0, -h / 2 + 0.01, 0))
    }
  }
  // 发条兔
  st.rabbit.visible = pr.rabbit > 0.5
  if (st.rabbit.visible) {
    st.rabbit.position.set(pr.rabbitP[0], pr.rabbitP[1], pr.rabbitP[2]); st.rabbit.rotation.set(0, pr.rabbitYaw, 0)
    if (pr.rabbitHop >= 0) animateWindupRabbit(st.rabbit, 'rabbitHop', pr.rabbitHop)
    else resetWindupRabbit(st.rabbit)
    const W = st.rabbit.userData.windup as WindupParts
    W.key.rotation.set(-0.9, pr.rabbitKey, 0)
  }
}

// ---------- 应用 ----------
export function applySpokesPose(rig: SpokesRig, P: SpokesPose, o: SpokesAnimOpts = {}) {
  const root = rig.root
  _res.arm = 0; _res.leg = 0
  root.position.set(P.root[0], P.root[1], P.root[2]); setE(root, P.rootR)
  const hr = rig.hips.userData.rest as { p: THREE.Vector3 }
  rig.hips.position.set(hr.p.x + P.hipsP[0], hr.p.y + P.hipsP[1], hr.p.z + P.hipsP[2]); setE(rig.hips, P.hipsR)
  setE(rig.spine, P.spine); setE(rig.chest, P.chest); setE(rig.neck, P.neck)
  // 头微颤（僵住 / 被拍肩）：高频小幅三轴
  const tm = o.time ?? 0, tr = P.tremor
  setE(rig.head, tr > 0.001 ? addV(P.head, [0.012 * tr * Math.sin(tm * 61), 0.015 * tr * Math.sin(tm * 47 + 1.3), 0.01 * tr * Math.sin(tm * 53 + 2.1)]) : P.head)
  solveLeg(rig, 1, P.legL); solveLeg(rig, -1, P.legR)
  applyHem(rig, o.dt)
  const chest = fk(rig.chest, root), head = fk(rig.head, root)
  solveArm(rig, rig.armL, 1, P.L, chest)
  let Rp = P.R
  if (P.press > 0.001) {
    // 食指按音箱：捏合点（≈ 食指远节）对到音箱面中心外 6 mm
    const sp = rig.speaker, sq = chest.q.clone().multiply(sp.quaternion)
    const face = v3([0, 0, 0.012]).applyQuaternion(sq).add(sp.position.clone().applyQuaternion(chest.q).add(chest.p))
    Rp = { ...P.R, g: arr(face), gw: c01(P.press) }
  }
  solveArm(rig, rig.armR, -1, Rp, chest)
  applyEars(rig, P, head, o.dt)
  applyNose(rig, P, tm)
  applyProps(rig, P)
  dynOf(rig).init = true
}
export function animateSpokes(rig: SpokesRig, clip: SpokesClip, t: number, opts: SpokesAnimOpts = {}) {
  const P = spokesPose(clip, t, opts)
  applySpokesPose(rig, P, { ...opts, time: opts.time ?? t })
  return P
}
/** 预览 / 截图：从 t − pre 起按 1/60 s 推进二阶，得到与连续播放一致的确定帧（非循环片段最早从 0 起） */
export function animateSpokesPreroll(rig: SpokesRig, clip: SpokesClip, t: number, opts: SpokesAnimOpts = {}, pre = 1.0) {
  const C0 = SPOKES_CLIPS[clip], h = 1 / 60
  let t0 = t - pre; if (!C0.loop) t0 = Math.max(0, t0)
  resetSpokesDynamics(rig)
  let P: SpokesPose | null = null
  for (let x = t0; x <= t + 1e-6; x += h) P = animateSpokes(rig, clip, x, { ...opts, time: x, dt: x === t0 ? undefined : h })
  return P!
}

// ---------- 运行时动画器 ----------
export interface SpokesAnimator {
  play(clip: SpokesClip, fade?: number): void
  update(dt: number, opts?: SpokesAnimOpts): void
  readonly clip: SpokesClip; readonly time: number; readonly done: boolean; readonly pose: SpokesPose
  /** 本帧根运动（root 空间 [dx, dz]）：AI 把它转到世界、加到实体位置上 */
  readonly rootDelta: [number, number]
}
export function createSpokesAnimator(obj: THREE.Object3D, seed = 1): SpokesAnimator {
  const rig = obj.userData.spokes as SpokesRig
  let clip: SpokesClip = 'idle', time = 0, gt = 0, fadeT = 1, fadeDur = 0
  let prev = spokesPose('idle', 0, { seed }), last = deepClone(prev), rd: [number, number] = [0, 0]
  return {
    get clip() { return clip }, get time() { return time }, get pose() { return last }, get rootDelta() { return rd },
    get done() { const C0 = SPOKES_CLIPS[clip]; return !C0.loop && time >= C0.dur },
    play(c, fade) {
      if (c === clip && SPOKES_CLIPS[c].loop) return
      prev = deepClone(last); clip = c; time = 0; fadeT = 0; fadeDur = fade ?? SPOKES_CLIPS[c].blend
    },
    update(dt, opts = {}) {
      rd = spokesRootMotion(clip, time, time + dt)
      time += dt; gt += dt; fadeT += dt
      let P = spokesPose(clip, time, { seed, ...opts, time: gt })
      if (fadeT < fadeDur) P = mixSpokesPose(prev, P, ss(fadeT / fadeDur))
      last = P
      applySpokesPose(rig, P, { seed, ...opts, time: gt, dt })
    },
  }
}

// ======================================================================
// 发条兔（spokesProps.buildWindupRabbit 的关节组）：rabbitHop 跳行循环、rabbitStop 停下回头看
// ======================================================================
export type WindupClip = 'rabbitHop' | 'rabbitStop'
export const WINDUP_CLIPS: Record<WindupClip, { dur: number; loop: boolean; zh: string; speed: number }> = {
  rabbitHop: { dur: 0.42, loop: true, zh: '发条兔·跳行', speed: 0.36 },
  rabbitStop: { dur: 2.4, loop: false, zh: '发条兔·停下回头', speed: 0 },
}
interface WindupParts { body: THREE.Group; head: THREE.Group; earL: THREE.Object3D; earR: THREE.Object3D; legFL: THREE.Group; legFR: THREE.Group; legBL: THREE.Group; legBR: THREE.Group; key: THREE.Group; tail: THREE.Mesh }
function wRest(W: WindupParts) {
  for (const o of [W.body, W.head, W.earL, W.earR, W.legFL, W.legFR, W.legBL, W.legBR, W.key, W.tail]) {
    o.userData.wrest ??= { p: o.position.clone(), r: o.rotation.clone() }
    const r = o.userData.wrest as { p: THREE.Vector3; r: THREE.Euler }
    o.position.copy(r.p); o.rotation.copy(r.r)
  }
}
export function resetWindupRabbit(g: THREE.Object3D) { const W = g.userData.windup as WindupParts; if (W) wRest(W) }
/** 发条兔姿态（t = 片段时间；跳行的前进量由调用方按 WINDUP_CLIPS.rabbitHop.speed 移动整只兔子） */
export function animateWindupRabbit(g: THREE.Object3D, clip: WindupClip, t: number) {
  const W = g.userData.windup as WindupParts
  if (!W) return
  wRest(W)
  const C0 = WINDUP_CLIPS[clip]
  if (clip === 'rabbitHop') {
    const u = frac(t / C0.dur)
    // 一跳：后腿蹬（0–0.3）→ 腾空（0.3–0.7，身体抛物线、前倾 → 后仰）→ 前腿先着地（0.7–0.85）→ 后腿收回（0.85–1）
    const air = bump(u, 0.22, 0.78), push = bump(u, 0.05, 0.35), land = bump(u, 0.65, 0.95)
    W.body.position.y += 0.028 * air + 0.004 * push
    W.body.rotation.x += 0.22 * push - 0.18 * bump(u, 0.45, 0.8) + 0.08 * land
    W.legBL.rotation.x += -0.9 * push + 0.6 * bump(u, 0.55, 1.0); W.legBR.rotation.x = W.legBL.rotation.x
    W.legFL.rotation.x += 0.7 * bump(u, 0.2, 0.6) - 0.35 * land; W.legFR.rotation.x = W.legFL.rotation.x
    W.head.rotation.x += -0.12 * air + 0.1 * land
    W.earL.rotation.x += -0.35 * air + 0.25 * land; W.earR.rotation.x += -0.35 * air + 0.25 * land
    W.tail.position.y += 0.004 * air
    // 机械感：每跳一顿，身体微侧晃
    W.body.rotation.z += 0.04 * Math.sin(u * TAU)
    W.key.rotation.y -= t * 6
  } else {
    // 停下：最后一跳落地（0–0.35）→ 静止 → 头向后转（0.7–1.3 s 转到 110°，往回看跟着的人）→ 停住 → 耳朵一抖 → 1.9 s 起头转回
    const lastHop = bump(t, 0.0, 0.35)
    W.body.position.y += 0.02 * lastHop; W.body.rotation.x += -0.1 * lastHop + 0.06 * bump(t, 0.3, 0.5)
    const turn = ramp(t, 0.7, 1.25) * (1 - ramp(t, 1.9, 2.35))
    W.head.rotation.y += 1.9 * turn; W.head.rotation.z += 0.12 * turn
    W.body.rotation.y += 0.35 * turn
    W.legFL.rotation.y += 0.1 * turn
    const fl = bump(t, 1.4, 1.6) * Math.sin((t - 1.4) * 60)
    W.earL.rotation.z += 0.25 * fl; W.earR.rotation.z -= 0.15 * fl
    W.key.rotation.y -= 1.5 * (1 - Math.exp(-3 * t))
  }
}
void Q_ID; void CURL_FLAT; void hash1; void HEAD_J
