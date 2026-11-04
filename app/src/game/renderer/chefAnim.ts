// [chef stage 2] 厨师（Entity 800 / The Chef）阶段 2 动画：程序化关键帧 / 曲线（不接 AI）。结构沿用迎宾女郎 spokesAnim。
// 用法：
//   const an = createChefAnimator(group)                 // group = buildChef() 的返回（userData.chef）
//   an.play('potSwing')                                  // 片段间按 CHEF_CLIPS[clip].blend 交叉混合
//   an.update(dt, { turn: 0.4 })                         // 每帧；an.rootDelta = 本帧根运动（root 空间 [dx, dz]，AI 叠到世界位置上）
// 无状态入口（预览 / 截图 / AI 自己管时间）：
//   chefPose(clip, t, opts) → ChefAnimPose（纯函数）；mixChefPose(a, b, k)；applyChefPose(rig, P, opts)
//   animateChef(rig, clip, t, opts) / animateChefPreroll(rig, clip, t, opts, pre)   // 后者先推进二阶（肚子 / 双下巴 / 耳朵 / 帽 / 围裙）
//   chefRootMotion(clip, t0, t1) → [dx, dz]（root 空间；waddle / humWalk / grabDrag / stuffedStagger 匀速前进）
//
// ===== 摆放常量（厨师 root 空间：+Z 正面、+Y 上、地面 y = 0、+X = 角色左侧；阶段 3 摆家具按这些对齐）=====
//   CHEF_STOVE      灶台：台面高 y 0.90，前沿 z 0.50（肚子最凸处 z ≈ 0.44，留 6 cm），宽 1.0、深 0.6（x −0.5..0.5、z 0.50..1.10）
//   CHEF_CAULDRON   炖菜大锅：buildStewCauldron() 缩放 0.8（径 0.50、高 0.32）放在灶台上，底心 [0, 0.90, 0.78]；汤面 y ≈ 1.17、锅沿 y ≈ 1.22
//                   idle 搅锅 / vomitPot 都站在原点正对它（vomitPot 吐进这口锅）
//   CHEF_TABLE      餐桌：桌面高 y 0.74，近边 z 0.42（肚子悬在桌沿上方，围裙不碰桌）；serve 把盘子放在 CHEF_PLATE_AT，tapTable 敲 CHEF_TAP_AT
//   CHEF_SEAT       椅子：椅面高 y 0.46，椅面中心 [0, 0.46, −0.36]、椅背 z −0.60（standFromChair 开始时 root 骨在 z −0.30 坐着，结束时站在原点）
//   CHEF_DOOR       双开门：门面 z 0.60（朝 −Z），两只门把手高 y 1.00、x ±0.09、把手杆伸出到 z 0.53；门闩（横插销 0.3 m，拨钮在左端）高 y 1.22、拨钮从 x +0.22 推到 x −0.04（插销跨过门缝）
//   CHEF_KNIFE_WALL 刀墙：墙面 z 0.54（肚子前 10 cm），挂刀磁条（挂杆）高 y 1.55；他取的那把雕刻刀挂在 x −0.12（刀尖朝下、刀柄顶 y ≈ 1.67）
//   holdCabbage     附图：右手托紫甘蓝在右胸前（无家具）
// 结构：
//   · 姿态量都在 root 骨空间，可线性混合；躯干 / 颈 / 头为欧拉角（YXZ，x+ = 前屈、y+ = 向角色左转、z+ = 向角色右歪）。
//   · 锁骨 clav（欧拉 YXZ）：左 y− / 右 y+ = 肩往前探，左 z+ / 右 z− = 耸肩。
//   · 手臂：两骨 IK（腕目标 t / 捏合点 g / 掌心 pp / 拳心 pk=1 + 肘极向），手朝向 = root 空间四元数；手指 = 15 个绝对屈曲角（fl）+ 拇指外展 tab。
//     胖子手臂短（肩→腕 0.56 m）、肚子前凸到 z 0.44：手到肚子前方的目标都由上身前倾 / 降髋凑够，check:chef-anim 查手穿肚子。
//   · 腿：脚掌点 + 两骨 IK（膝朝前偏外）；步态支撑相脚掌点在 root 空间里以身体速度后移（脚锁，不滑步）；关键帧间重新站位自动抬脚迈小步。
//   · 二阶（所有片段都有，在 apply 里按加速度推进；预览 / 截图用 animateChefPreroll）：
//       啤酒肚 belly 骨：位移弹簧（约 2.1 Hz、ζ 0.16，驱动 = 肚子中心加速度，换到 spine 局部）+ 片段给的呼吸 / 收缩缩放；
//       双下巴 chin 骨：位移弹簧（约 3 Hz）；厨师帽 hat 骨：转动弹簧（约 2.6 Hz）；
//       猪耳每侧 3 节：耳根姿态（前后 / 外张 / 扭转 / 折耳尖）由片段给，叠加惯性弹簧（约 2.2 Hz、ζ 0.2，越到耳尖越大）；flashFreeze 僵住时压低；
//       衣摆后 / 侧（下摆骨 hemL/R）：跟大腿前屈 0.95–1.0 + 弹簧滞后，前屈时不许落后大腿 90%、也不许超前 0.04 rad。
//       [修订] 下腹托起（tuckL/R）+ 围裙前片两节（apU / apD，搭在大腿上 → 膝前下垂）：applyDrape 按腿胶囊逐帧求（非二阶，纯姿态函数）；围裙两侧跟大腿骨。
//   · 下颌 jaw：张嘴量由片段给（哼歌 / 喘气 / 舔刀 / 吐）；舔刀时伸出舌头（本文件自建，挂 jaw）。
//   · 道具：汤锅 / 雕刻刀 / 汤勺 / 紫甘蓝挂在手骨上（chefMesh 建好），这里只管显隐和「握持方向」（按片段把柄轴对准目标方向，绕拳眼轴转，
//     check 查柄轴与拳眼轴夹角）；本文件自建并挂 root 的：盘子（端盘）、绳子（绑门）、门闩、刀墙上的那把刀（取下前）、被拖的人（灰色假人）、
//     吐进锅里的浆液流（远景）、舌头（挂 jaw）。
import * as THREE from 'three'
import type { ChefRig, ChefArm } from './chefMesh'
import { BONES, B, HANDS, BELLY_C, CHIN_C, HAT, TUCK_C, AP_PIV, type V3 } from './chefRig'
import { coatCore, tuckShare, tuckSide, apronPoint } from './chefBody'
import { litMaterial } from './shared'
import { buildCarvingKnife } from './chefProps'

export type ChefClip = 'idle' | 'waddle' | 'humWalk' | 'serve' | 'earTwitch' | 'tapTable' | 'potSwing' | 'grabDrag' | 'sniffCrouch' | 'takeKnife' | 'barricade' | 'stuffedStagger' | 'stoveLean' | 'vomitPot' | 'flashFreeze' | 'standFromChair' | 'holdCabbage'
export interface ChefClipInfo { dur: number; loop: boolean; zh: string; blend: number; speed?: number; seated?: boolean }
export const CHEF_CLIPS: Record<ChefClip, ChefClipInfo> = {
  idle: { dur: 6.0, loop: true, zh: '灶前搅锅', blend: 0.4 },
  waddle: { dur: 1.4, loop: true, zh: '蹒跚走（肚子晃）', blend: 0.3, speed: 0.6 },
  humWalk: { dur: 2.0, loop: true, zh: '哼小调慢走', blend: 0.35, speed: 0.38 },
  serve: { dur: 5.6, loop: false, zh: '端盘上菜', blend: 0.35 },
  earTwitch: { dur: 3.6, loop: false, zh: '听见铃声·耳朵抽搐转头', blend: 0.15 },
  tapTable: { dur: 4.0, loop: false, zh: '胖手指敲桌三下', blend: 0.3 },
  potSwing: { dur: 3.4, loop: false, zh: '闪电抡锅砸人', blend: 0.25 },
  grabDrag: { dur: 2.2, loop: true, zh: '抓后领拖人', blend: 0.3, speed: 0.32 },
  sniffCrouch: { dur: 6.0, loop: false, zh: '蹲下嗅闻', blend: 0.35 },
  takeKnife: { dur: 6.4, loop: false, zh: '从刀墙取雕刻刀·舔刀', blend: 0.3 },
  barricade: { dur: 8.0, loop: false, zh: '打烊：绳绑门把·闩门', blend: 0.3 },
  stuffedStagger: { dur: 2.6, loop: true, zh: '吃撑了·踉跄', blend: 0.35, speed: 0.26 },
  stoveLean: { dur: 4.0, loop: true, zh: '扶灶喘气', blend: 0.4 },
  vomitPot: { dur: 6.0, loop: false, zh: '背身对锅吐（远景）', blend: 0.35 },
  flashFreeze: { dur: 4.0, loop: false, zh: '被闪光灯照到·僵住', blend: 0.08 },
  standFromChair: { dur: 5.0, loop: false, zh: '从椅子上吃力起身', blend: 0.3, seated: true },
  holdCabbage: { dur: 5.0, loop: true, zh: '捧紫甘蓝（附图）', blend: 0.35 },
}
// ---------- 摆放常量（root 空间；见文件头）----------
export const CHEF_STOVE = { y: 0.9, z: 0.5, w: 1.0, d: 0.6 }
export const CHEF_CAULDRON = { c: [0, 0.9, 0.78] as V3, scale: 0.8, surf: 1.172, rim: 1.22, rIn: 0.24 }
export const CHEF_TABLE = { y: 0.74, z: 0.42 }
export const CHEF_PLATE_AT: V3 = [-0.04, 0.74, 0.575]
export const CHEF_TAP_AT: V3 = [-0.3, 0.74, 0.52]
/** standFromChair：开始时 root 骨在 z −CHEF_STAND_FROM（坐着），结束时在原点；椅子（root 空间，按结束时的原点算）椅面中心 z −0.36、椅背 z −0.60 */
export const CHEF_STAND_FROM = 0.3
export const CHEF_SEAT = { y: 0.46, c: [0, 0.46, -0.36] as V3, backZ: -0.6 }
export const CHEF_DOOR = { z: 0.6, handleY: 1.0, handleX: 0.09, handleZ: 0.53, boltY: 1.22, boltFrom: 0.22, boltTo: -0.04 }
export const CHEF_KNIFE_WALL = { z: 0.54, railY: 1.55, knifeX: -0.12 }
export const CHEF_PLATE = { r: 0.135, h: 0.022 }

type Q4 = [number, number, number, number]
export interface CArmPose {
  t: V3; pole: V3
  hq: Q4; hw: number; wr: V3
  /** 手指绝对屈曲角（拇 / 食 / 中 / 无名 / 小 × 3 节，弧度；0 = 建模静止手形）+ 拇指外展 */
  fl: number[]; tab: number
  clav: V3
  g: V3; gw: number
  /** 掌心 / 拳心目标：pk 0 = 掌心表面、1 = 拳心（握柄点） */
  pp: V3; pw: number; pk: number
  /** 掌心按膝：kw 权重、ks 哪个膝（1 左 / −1 右）、ko 掌心相对膝关节的偏移（root 空间） */
  kw: number; ks: number; ko: V3
  /** 跟肚子：手贴在肚子上时，目标跟着肚子二阶位移走（0..1） */
  bk: number
}
export interface CLegPose { p: V3; ph: number; yw: number; tf: number }
export interface CEarPose { pitch: number; splay: number; twist: number; bend: number }
export interface ChefPropsPose {
  ladle: number; pot: number; knife: number; cabbage: number; meat: number
  /** 手持件柄轴目标方向（root 空间；w = 权重，0 = chefMesh 默认握法） */
  ladleAim: V3; ladleAimW: number; potAim: V3; potAimW: number; knifeAim: V3; knifeAimW: number
  /** 盘子：显隐、握持（1 = 双手捧着，0 = 放在 plateP） */
  plate: number; plateHold: number; plateP: V3
  /** 刀墙上的那把刀（取下前显示） */
  wallKnife: number
  /** 绳子：显隐、绕门把进度 0..1（绕两圈 + 拉紧）、打结 0..1、右手是否捏着绳头 */
  rope: number; ropeWrap: number; ropeKnot: number
  /** 门闩位置 x（root 空间） */
  boltX: number
  /** 被拖的人（假人）：显隐 */
  victim: number
  /** 浆液流 0..1（吐） */
  vomit: number
  /** 舌头伸出 0..1 */
  tongue: number
}
export interface ChefAnimPose {
  root: V3; rootR: V3; hipsP: V3; hipsR: V3; spine: V3; chest: V3; neck: V3; head: V3
  L: CArmPose; R: CArmPose; legL: CLegPose; legR: CLegPose
  earL: CEarPose; earR: CEarPose
  /** 下颌张开（rad）、头微颤 0..1、耳朵惯性 0..1、肚子：呼吸缩放（1 = 静止；< 1 收肚子）+ 位移、双下巴位移 */
  jaw: number; tremor: number; earDyn: number; bellyS: number; bellyP: V3; chinP: V3
  props: ChefPropsPose
}
export interface ChefAnimOpts {
  turn?: number; tilt?: number
  seed?: number
  /** 二阶步长（秒）；省略 = 不推进二阶 */
  dt?: number
  /** 全局时间（抖动 / 耳朵抖的相位） */
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
const crossV = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const nz = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const v3 = (a: V3 | THREE.Vector3) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]))
const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z]
const qArr = (q: THREE.Quaternion): Q4 => [q.x, q.y, q.z, q.w]
const Q_ID: Q4 = [0, 0, 0, 1]
const hash1 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
const noise1 = (x: number, seed = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return mix(hash1(i + seed * 17.3) * 2 - 1, hash1(i + 1 + seed * 17.3) * 2 - 1, u) }
function basisQuat(x0: V3, y0: V3, x1: V3, y1: V3): THREE.Quaternion {
  const mk = (x: V3, y: V3) => { const X = v3(x).normalize(), Y = v3(y); Y.addScaledVector(X, -Y.dot(X)).normalize(); const Z = new THREE.Vector3().crossVectors(X, Y); return new THREE.Matrix4().makeBasis(X, Y, Z) }
  const a = mk(x0, y0), b = mk(x1, y1)
  return new THREE.Quaternion().setFromRotationMatrix(b.multiply(a.transpose()))
}

// ---------- 静止量（厨师空间）----------
const JP = (n: string): V3 => BONES[B[n]].pos
const SN = (s: number) => (s > 0 ? 'L' : 'R')
const SH = (s: number) => JP('upperArm' + SN(s)), EL = (s: number) => JP('foreArm' + SN(s)), WR = (s: number) => JP('hand' + SN(s))
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const LU = dist(EL(1), SH(1)), LF = dist(WR(1), EL(1))
const LT = dist(JP('shinL'), JP('thighL')), LS = dist(JP('footL'), JP('shinL'))
const TOE = JP('toeL'), ANK = JP('footL'), TOE_H = TOE[1]
const FOOT_A: V3 = subV(ANK, TOE)
/** 脚跟着地点（相对脚掌关节，脚跟在踝后 6.5 cm） */
const FOOT_H: V3 = [ANK[0] - TOE[0], -TOE_H, ANK[2] - 0.065 - TOE[2]]
export const CHEF_FOOT_REST = (s: number): V3 => [TOE[0] * s, 0, TOE[2]]
const HIP_Y = JP('thighL')[1], HEAD_J = JP('head')
/** 手朝向：手坐标系 a 指尖 / d 手背 → 目标方向（root 空间） */
export function chefHandQuat(s: number, aDir: V3, dDir: V3): Q4 { const F = HANDS[s].F; return qArr(basisQuat(F.a, F.d, nz(aDir), nz(dDir))) }
const hQ = chefHandQuat
/** 手朝向：给拇指方向 r（握柄：柄沿 r 轴从拳眼伸出，严格对准）和大致的指尖方向 a（投到 r 的法平面） */
function hAR(s: number, a: V3, r: V3): Q4 {
  const R = nz(r); let A = nz(a); A = nz(subV(A, sclV(R, A[0] * R[0] + A[1] * R[1] + A[2] * R[2])))
  const d = s > 0 ? sclV(crossV(A, R), -1) : crossV(A, R)
  return hQ(s, A, d)
}
const qRot = (q: Q4, ax: V3, ang: number): Q4 => qArr(new THREE.Quaternion().setFromAxisAngle(v3(nz(ax)), ang).multiply(new THREE.Quaternion(...q)))
/** 掌心 / 拳心（手骨局部，静止手形）：pk 0 掌心表面、1 拳心（chefMesh 握点） */
const PALM_LOCAL: Record<number, THREE.Vector3[]> = {}
for (const s of [1, -1]) {
  const F = HANDS[s].F
  PALM_LOCAL[s] = [[0.062, 0.0, -0.03], [0.07, 0.0, -0.028]].map(([a, r, d]) => v3(addV(addV(sclV(F.a, a), sclV(F.r, r)), sclV(F.d, d))))
}
const palmLocal = (s: number, pk: number) => PALM_LOCAL[s][0].clone().lerp(PALM_LOCAL[s][1], c01(pk))
const PINCH_APPROX: Record<number, THREE.Vector3> = {}
for (const s of [1, -1]) {
  const H = HANDS[s], th = H.fingers.find((f) => f.name === 'thumb')!.joints[2], ix = H.fingers.find((f) => f.name === 'index')!.joints[2]
  PINCH_APPROX[s] = v3(subV(addV(sclV(addV(th, ix), 0.5), sclV(H.F.a, 0.008)), WR(s)))
}

// ---------- 手指 ----------
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const
const REST_FLEX: Record<string, number[]> = { thumb: [0.05, 0.16, 0.2], index: [0.2, 0.3, 0.18], middle: [0.24, 0.34, 0.2], ring: [0.29, 0.38, 0.22], pinky: [0.34, 0.42, 0.24] }
const FIST: Record<string, number[]> = { thumb: [0.3, 0.6, 0.5], index: [1.2, 1.3, 0.9], middle: [1.25, 1.35, 0.9], ring: [1.25, 1.35, 0.9], pinky: [1.3, 1.35, 0.9] }
/** curl（每指一个数：0 静止、1 握拳、−1 伸直）→ 15 个绝对角 */
const C = (c: number[]): number[] => FINGERS.flatMap((f, i) => FIST[f].map((v, k) => (c[i] >= 0 ? c[i] * v : Math.max(c[i], -1) * REST_FLEX[f][k])))
const CURL_RELAX = C([0.1, 0.12, 0.15, 0.2, 0.25])
const CURL_SOFT = C([0.2, 0.3, 0.35, 0.42, 0.5])
const CURL_OPEN = C([-0.4, -0.6, -0.55, -0.5, -0.45])
const CURL_FLAT = C([-0.3, -0.8, -0.8, -0.75, -0.7])
const CURL_GRIP = C([0.85, 0.95, 1, 1, 1])
const CURL_PINCH = C([0.42, 0.55, 0.85, 0.95, 0.9])
const CURL_TAP = C([0.3, -0.6, 0.6, 0.8, 0.9])
const CURL_PLATE = C([-0.2, -0.3, -0.25, -0.2, -0.15])
const CURL_CUP = C([0.0, 0.05, 0.08, 0.1, 0.12])
/** 贴肚子：手指顺着肚皮微弯（不往里抠） */
const CURL_BELLY = C([-0.1, -0.35, -0.3, -0.25, -0.2])

// ---------- 姿态：默认 / 克隆 / 混合 ----------
function restArm(s: number): CArmPose {
  const S = SH(s), E = EL(s), W = WR(s)
  const d = nz(subV(W, S)), e = subV(E, S), k = e[0] * d[0] + e[1] * d[1] + e[2] * d[2]
  const pole = nz(subV(e, sclV(d, k)))
  return { t: [...W], pole, hq: [...Q_ID], hw: 0, wr: [0, 0, 0], fl: new Array(15).fill(0), tab: 0, clav: [0, 0, 0], g: [...W], gw: 0, pp: [...W], pw: 0, pk: 0, kw: 0, ks: s, ko: [0, 0.06, 0.03], bk: 0 }
}
const EAR0: CEarPose = { pitch: 0, splay: 0, twist: 0, bend: 0 }
const PROPS0: ChefPropsPose = {
  ladle: 0, pot: 0, knife: 0, cabbage: 0, meat: 0, ladleAim: [0, -1, 0], ladleAimW: 0, potAim: [0, -1, 0], potAimW: 0, knifeAim: [0, 1, 0], knifeAimW: 0,
  plate: 0, plateHold: 0, plateP: [...CHEF_PLATE_AT], wallKnife: 0, rope: 0, ropeWrap: 0, ropeKnot: 0, boltX: CHEF_DOOR.boltFrom, victim: 0, vomit: 0, tongue: 0,
}
export const CHEF_REST: ChefAnimPose = {
  root: [0, 0, 0], rootR: [0, 0, 0], hipsP: [0, 0, 0], hipsR: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  L: restArm(1), R: restArm(-1), legL: { p: CHEF_FOOT_REST(1), ph: 0, yw: 0, tf: 1 }, legR: { p: CHEF_FOOT_REST(-1), ph: 0, yw: 0, tf: 1 },
  earL: { ...EAR0 }, earR: { ...EAR0 }, jaw: 0, tremor: 0, earDyn: 1, bellyS: 1, bellyP: [0, 0, 0], chinP: [0, 0, 0],
  props: { ...PROPS0, plateP: [...CHEF_PLATE_AT] },
}
function deepClone<T>(x: T): T {
  if (Array.isArray(x)) return x.slice() as unknown as T
  if (x && typeof x === 'object') { const o: any = {}; for (const k in x) o[k] = deepClone((x as any)[k]); return o }
  return x
}
export const cloneChefPose = (p: ChefAnimPose) => deepClone(p)
const QKEYS = new Set(['hq'])
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
/** 膝关节位置近似（root 空间；与 solveLeg 同一套几何） */
function kneeApprox(P: ChefAnimPose, s: number): THREE.Vector3 {
  const L = s > 0 ? P.legL : P.legR, hipsJ = v3(JP('hips'))
  const qh = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.hipsR[0], P.hipsR[1], P.hipsR[2], 'YXZ'))
  const H = v3(JP('thigh' + SN(s))).sub(hipsJ).applyQuaternion(qh).add(hipsJ).add(v3(P.hipsP))
  const ank = ankleOf(L, s)
  const d = ank.clone().sub(H), D = clamp(d.length(), 0.2, LT + LS - 0.002), dh = d.normalize()
  const pole = legPole(L, s); pole.addScaledVector(dh, -pole.dot(dh)).normalize()
  const ca = clamp((LT * LT + D * D - LS * LS) / (2 * LT * D), -1, 1)
  return H.addScaledVector(dh, LT * ca).addScaledVector(pole, LT * Math.sqrt(1 - ca * ca))
}
/** 关键帧手臂「目标一致化」（同迎宾女郎）：把这一帧手腕实际要去的位置写回 t，g / pp 对齐到同一手腕位置 */
function settleArms(P: ChefAnimPose) {
  for (const [A, s] of [[P.L, 1], [P.R, -1]] as [CArmPose, number][]) {
    const q = new THREE.Quaternion(...A.hq), offG = PINCH_APPROX[s].clone().applyQuaternion(q), offP = palmLocal(s, A.pk).applyQuaternion(q)
    const T = v3(A.t)
    if (A.gw > 0) T.lerp(v3(A.g).sub(offG), c01(A.gw))
    if (A.pw > 0) T.lerp(v3(A.pp).sub(offP), c01(A.pw))
    if (A.kw > 0) T.lerp(kneeApprox(P, A.ks >= 0 ? 1 : -1).add(v3(A.ko)).sub(palmLocal(s, 0).applyQuaternion(q)), c01(A.kw))
    A.t = arr(T); A.g = arr(T.clone().add(offG)); A.pp = arr(T.clone().add(offP))
  }
  return P
}
export function mixChefPose(a: ChefAnimPose, b: ChefAnimPose, k: number): ChefAnimPose {
  if (k <= 0) return deepClone(a)
  if (k >= 1) return deepClone(b)
  a = settleArms(deepClone(a)); b = settleArms(deepClone(b))
  const o = mixAny(a, b, k) as ChefAnimPose
  // 道具显隐不插值（取主导一侧）
  for (const key of ['ladle', 'pot', 'knife', 'cabbage', 'meat', 'plate', 'plateHold', 'wallKnife', 'rope', 'victim'] as const) o.props[key] = k < 0.5 ? a.props[key] : b.props[key]
  return o
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends number[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }
type Part = DeepPartial<ChefAnimPose>
function over(base: ChefAnimPose, p: Part): ChefAnimPose {
  const o = deepClone(base) as any
  const rec = (dst: any, src: any) => { for (const k in src) { const v = src[k]; if (v === undefined) continue; if (v && typeof v === 'object' && !Array.isArray(v)) rec(dst[k], v); else dst[k] = Array.isArray(v) ? v.slice() : v } }
  rec(o, p); return o
}
/** 关键帧：[[t, partial], ...]，每帧都是 base 上的覆盖；段间 smoothstep（ease 可换）。重新站位自动抬脚迈小步（同迎宾女郎） */
function keys(t: number, base: ChefAnimPose, ks: [number, Part, ((x: number) => number)?][]): ChefAnimPose {
  if (t <= ks[0][0]) return over(base, ks[0][1])
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const [t0, a] = ks[i - 1], [t1, b, ez] = ks[i]
    const A = over(base, a), Bp = over(base, b), kl = (t - t0) / (t1 - t0)
    const P = mixChefPose(A, Bp, (ez ?? ss)(kl))
    stepFeet(P, A, Bp, kl)
    return P
  }
  return over(base, ks[ks.length - 1][1])
}
const STEP_D = 0.012, STEP_YAW = 0.15
function needsStep(a: CLegPose, b: CLegPose) {
  if (a.p[1] > 0.01 || b.p[1] > 0.01) return false
  return Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2]) > STEP_D || Math.abs(a.yw - b.yw) > STEP_YAW
}
function stepLeg(L: CLegPose, a: CLegPose, b: CLegPose, kl: number, w0: number, w1: number) {
  const u = c01((kl - w0) / (w1 - w0)), e = u * u * u * (u * (6 * u - 15) + 10)
  const d = Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2])
  L.p = [mix(a.p[0], b.p[0], e), 0, mix(a.p[2], b.p[2], e)]
  L.p[1] = Math.min(0.05, 0.02 + 0.3 * d) * Math.sin(Math.PI * u)
  L.yw = mix(a.yw, b.yw, e); L.ph = mix(a.ph, b.ph, e) + 0.2 * Math.sin(Math.PI * Math.min(1, u * 1.15)); L.tf = mix(a.tf, b.tf, e)
}
function stepFeet(P: ChefAnimPose, A: ChefAnimPose, B: ChefAnimPose, kl: number) {
  const sL = needsStep(A.legL, B.legL), sR = needsStep(A.legR, B.legR)
  if (sL) stepLeg(P.legL, A.legL, B.legL, kl, 0, sR ? 0.55 : 1)
  if (sR) stepLeg(P.legR, A.legR, B.legR, kl, sL ? 0.45 : 0, 1)
}
const merge = (...ps: Part[]): Part => { const o: any = {}; const rec = (dst: any, src: any) => { for (const k in src) { const v = src[k]; if (v && typeof v === 'object' && !Array.isArray(v)) { dst[k] ??= {}; rec(dst[k], v) } else dst[k] = Array.isArray(v) ? v.slice() : v } }; for (const p of ps) rec(o, p); return o }
const ears = (pitch: number, splay: number, twist = 0, bend = 0): Part => ({ earL: { pitch, splay, twist, bend }, earR: { pitch, splay, twist, bend } })
const EXP_OUT = (x: number) => 1 - Math.pow(1 - c01(x), 3)
const EXP_IN = (x: number) => Math.pow(c01(x), 2.2)
const LIN = (x: number) => c01(x)

// ---------- 肚子表面（手贴肚子用：静止 coatCore 求表面点 + 法线）----------
/** 静止躯干（衣服芯）表面上 (x, y) 处的前表面点、外法线（root 空间） */
function bellySurf(x: number, y: number): { p: V3; n: V3 } {
  let lo = 0, hi = 0.7
  for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; if (coatCore(x, y, m) < 0) lo = m; else hi = m }
  const z = lo, e = 0.004
  const n = nz([coatCore(x + e, y, z) - coatCore(x - e, y, z), coatCore(x, y + e, z) - coatCore(x, y - e, z), coatCore(x, y, z + e) - coatCore(x, y, z - e)])
  return { p: [x, y, z], n }
}
/** 掌心贴在肚子上：掌心离衣面 off（含掌厚），指尖朝 along（会被投到切平面上），手背 = 法线 */
function palmOnBelly(s: number, x: number, y: number, along: V3, off = 0.016, fl = CURL_BELLY): Partial<CArmPose> {
  const { p, n } = bellySurf(x, y)
  const a = nz(subV(along, sclV(n, n[0] * along[0] + n[1] * along[1] + n[2] * along[2])))
  return { pp: addV(p, sclV(n, off)), pw: 1, pk: 0, gw: 0, kw: 0, bk: 1, hq: hQ(s, a, n), hw: 1, fl, tab: 0, pole: [s * 1, 0.1, -0.35] }
}
const armPart = (s: number, a: Partial<CArmPose>): Part => (s > 0 ? { L: a } : { R: a }) as Part

// ---------- 常用姿势 ----------
/** 胖子站姿：两脚分开、脚尖外开；肩微前扣；猪头前探略低；手臂外张垂在肚子两侧 */
const HANG: Part = {
  L: { t: [0.385, 0.92, 0.07], pole: [0.6, -0.1, -1], hw: 0, fl: CURL_RELAX, tab: 0, pw: 0, gw: 0, kw: 0, bk: 0 },
  R: { t: [-0.385, 0.92, 0.07], pole: [-0.6, -0.1, -1], hw: 0, fl: CURL_RELAX, tab: 0, pw: 0, gw: 0, kw: 0, bk: 0 },
}
const STANCE: Part = { legL: { p: [0.165, 0, TOE[2] + 0.01], yw: 0.22 }, legR: { p: [-0.165, 0, TOE[2] - 0.005], yw: -0.2 } }
const BASE = CHEF_REST
const STAND: ChefAnimPose = over(BASE, merge(HANG, STANCE, { hipsP: [0, -0.006, 0], chest: [0.02, 0, 0], neck: [0.05, 0, 0], head: [0.06, 0, 0] }, ears(0.05, 0.12, 0, 0.1)))
const breathe = (P: ChefAnimPose, u: number, cycles: number, k = 1) => {
  const br = Math.sin(u * TAU * cycles) * k
  P.chest[0] -= 0.012 * br; P.spine[0] -= 0.005 * br; P.hipsP[1] += 0.0015 * br
  P.L.clav = addV(P.L.clav, [0, 0, 0.008 * br]); P.R.clav = addV(P.R.clav, [0, 0, -0.008 * br])
  P.bellyS += 0.018 * br; P.chinP = addV(P.chinP, [0, -0.002 * br, 0])
}
/** 单侧耳朵抽搐一下（片段时间 t 在 [a, a+0.45]）：快速外转 / 后甩 + 回弹抖 */
function earFlick(E: CEarPose, t: number, a: number, k = 1) {
  const x = t - a
  if (x <= 0 || x > 0.6) return
  const w = Math.sin(Math.min(1, x / 0.1) * Math.PI) * Math.exp(-6 * x) + 0.3 * Math.sin(x * 52) * Math.exp(-8 * x)
  E.twist += 0.5 * w * k; E.splay -= 0.18 * w * k; E.pitch -= 0.2 * w * k; E.bend -= 0.2 * w * k
}

// ---------- 步态（胖子：步宽大、步幅短、脚尖外开、左右摇摆大）----------
interface GaitSpec { D: number; duty: number; lift: number; center: number; width: number; heelOff: number; toeOff: number; strike: number; toeOut: number; warp: number }
function gaitLegs(P: ChefAnimPose, u: number, G: GaitSpec) {
  for (const [leg, s, off] of [[P.legL, 1, 0], [P.legR, -1, 0.5]] as [CLegPose, number, number][]) {
    // warp：踉跄（一侧迈得快、一侧拖）——相位非均匀，但每只脚自己的支撑 / 摆动仍满足「着地世界速度 0」
    const ph0 = frac(u + off), ph = frac(ph0 + G.warp * Math.sin(TAU * ph0) / TAU * s), sweep = G.D * G.duty
    let z: number, y = 0, pitch = 0
    if (ph < G.duty) {
      const k = ph / G.duty
      z = sweep * (0.5 - k)
      pitch = -G.strike * (1 - ss(k / 0.16)) + G.heelOff * ss((k - 0.65) / 0.35)
    } else {
      const k = (ph - G.duty) / (1 - G.duty)
      const e = k * k * k * (k * (6 * k - 15) + 10)
      z = -0.5 * sweep + G.D * (e - (1 - G.duty) * k)
      y = G.lift * Math.sin(Math.PI * k) * (k < 0.15 ? 0.6 + 0.4 * (k / 0.15) : 1)
      pitch = G.toeOff * (1 - ss(k / 0.45)) - G.strike * ss((k - 0.6) / 0.4)
    }
    // 摆动相：脚绕支撑腿向外画弧（胖大腿内侧会碰），sin² 起落
    const x = s * (G.width + (ph < G.duty ? 0 : 0.03 * Math.sin(Math.PI * (ph - G.duty) / (1 - G.duty)) ** 2))
    leg.p = [x, y, TOE[2] + G.center + z]; leg.ph = pitch; leg.tf = ph < G.duty ? 1 : 1 - 0.6 * ss((ph - G.duty) / (1 - G.duty) / 0.35); leg.yw = s * G.toeOut
  }
}
/** 胖子走路身体：髋左右大摆（重心移到支撑脚）、滚转、上下颠（双支撑最低）、肩反向；arms = 手臂外张小摆 */
function walkBody(P: ChefAnimPose, u: number, G: GaitSpec, sway: number, arms: boolean) {
  gaitLegs(P, u, G)
  const s1 = Math.sin(u * TAU), c2 = Math.cos(u * TAU * 2)
  const dip = Math.pow(0.5 + 0.5 * c2, 4)
  // 左脚支撑（u ∈ [0, duty]）时重心移向左（+X）
  const lat = sway * Math.sin((u + 0.2) * TAU)
  P.hipsP = [lat, -0.022 + 0.012 * Math.cos((u - 0.25) * TAU * 2) - 0.014 * dip, 0.0]
  P.hipsR = [0.04, 0.07 * s1, -1.6 * lat]
  P.spine = [0.02, -0.03 * s1, 0.9 * lat]; P.chest = [0.02, -0.05 * s1, 0.6 * lat]
  P.neck = [0.05, 0.03 * s1, 0.2 * lat]; P.head = [0.06, 0.02 * s1, 0.1 * lat]
  if (arms) for (const [A, s] of [[P.L, 1], [P.R, -1]] as [CArmPose, number][]) {
    const k = -s * s1
    A.t = [s * 0.43, 0.95 + 0.01 * Math.max(0, k), 0.08 + 0.06 * k]; A.pole = [s * 0.8, -0.1, -1]
    A.hw = 0; A.wr = [0.06 + 0.05 * Math.max(0, k), 0, 0]; A.fl = CURL_SOFT; A.tab = 0; A.pw = 0; A.gw = 0; A.kw = 0; A.bk = 0
  }
}
const WADDLE_G = (D: number): GaitSpec => ({ D, duty: 0.63, lift: 0.036, center: 0.0, width: 0.17, heelOff: 0.3, toeOff: 0.3, strike: 0.1, toeOut: 0.22, warp: 0 })

// ---------- 片段 ----------
export function chefPose(clip: ChefClip, t: number, o: ChefAnimOpts = {}): ChefAnimPose {
  const C0 = CHEF_CLIPS[clip]
  t = C0.loop ? frac(t / C0.dur) * C0.dur : clamp(t, 0, C0.dur)
  const u = t / C0.dur, seed = o.seed ?? 1, tm = o.time ?? t
  let P: ChefAnimPose
  switch (clip) {
    case 'idle': P = idlePose(t, u, seed); break
    case 'waddle': P = waddlePose(u, tm); break
    case 'humWalk': P = humPose(t, u); break
    case 'serve': P = servePose(t); break
    case 'earTwitch': P = twitchPose(t); break
    case 'tapTable': P = tapPose(t); break
    case 'potSwing': P = swingPose(t); break
    case 'grabDrag': P = dragPose(u); break
    case 'sniffCrouch': P = sniffPose(t, tm); break
    case 'takeKnife': P = knifePose(t); break
    case 'barricade': P = barricadePose(t); break
    case 'stuffedStagger': P = staggerPose(t, u); break
    case 'stoveLean': P = leanPose(t, u); break
    case 'vomitPot': P = vomitPose(t); break
    case 'flashFreeze': P = freezePose(t, tm); break
    case 'standFromChair': P = standPose(t); break
    case 'holdCabbage': P = cabbagePose(t, u); break
  }
  if (o.turn || o.tilt) { P.neck[1] += 0.4 * (o.turn ?? 0); P.head[1] += 0.6 * (o.turn ?? 0); P.head[2] += 0.8 * (o.tilt ?? 0) }
  return P
}
/** 根运动（root 空间 +Z 前进）：走路类片段匀速；其余 0 */
export function chefRootMotion(clip: ChefClip, t0: number, t1: number): [number, number] {
  const sp = CHEF_CLIPS[clip].speed ?? 0
  return [0, sp * (t1 - t0)]
}

// 1. idle：站在灶前（台面 0.9、前沿 z 0.5），上身前倾、低头看锅；右手锤握汤勺（勺从小指侧伸出、斜插进锅里）慢慢画圈搅（3 s 一圈）；
//    左手掌心搭在肚子左上侧；呼吸、肚子起伏；中途凑近闻一下（头一抖一抖）；两耳各自转 / 抽一下
const LADLE_L = 0.274
const IDLE_LEAN: Part = { hipsP: [0, -0.02, -0.03], hipsR: [0.16, 0, 0], spine: [0.08, 0, 0], chest: [0.08, 0.06, 0], neck: [0.06, 0, 0], head: [0.3, 0.02, 0], R: { clav: [0, 0.08, 0] } }
/** 汤勺搅锅：勺头目标 B → 拳心 = B − 柄向 × LADLE_L；锤握（拇指朝上、勺从小指侧朝下伸） */
function stirArm(B: V3, H0: V3): { arm: Partial<CArmPose>; dir: V3 } {
  const dir = nz(subV(B, H0)), H = subV(B, sclV(dir, LADLE_L))
  const r = sclV(dir, -1)
  return { arm: { pp: H, pw: 1, pk: 1, gw: 0, kw: 0, pole: [-1, -0.4, -0.6], hq: hAR(-1, [0.35, -0.05, 1], r), hw: 1, fl: CURL_GRIP, tab: 0 }, dir }
}
function idlePose(t: number, u: number, seed: number): ChefAnimPose {
  const P = over(STAND, merge(IDLE_LEAN, armPart(1, palmOnBelly(1, 0.17, 1.13, [-0.6, -0.5, 0.2])), ears(0.18, 0.14, 0, 0.15)))
  breathe(P, u, 2)
  const w = u * TAU * 2
  const Bp: V3 = [CHEF_CAULDRON.c[0] - 0.04 + 0.07 * Math.cos(w), 1.1 + 0.008 * Math.sin(w * 2), CHEF_CAULDRON.c[2] - 0.1 + 0.055 * Math.sin(w)]
  const st = stirArm(Bp, [-0.14, 1.36, 0.44])
  Object.assign(P.R, st.arm)
  P.props.ladle = 1; P.props.ladleAim = st.dir; P.props.ladleAimW = 1
  // 身体跟着搅动微微转
  P.chest[1] += 0.03 * Math.sin(w); P.spine[1] += 0.015 * Math.sin(w)
  // 凑近闻（3.6–4.6 s）：头下探、鼻子抽两下
  const sn = bump(t, 3.5, 4.7)
  P.neck[0] += 0.08 * sn; P.head[0] += 0.06 * sn + 0.035 * sn * Math.max(0, Math.sin((t - 3.5) * TAU * 4))
  P.jaw = 0.02 + 0.03 * sn
  earFlick(P.earL, t, 1.3 + 0.2 * hash1(seed), 0.8)
  earFlick(P.earR, t, 2.6, 1)
  P.earR.twist += 0.35 * bump(t, 4.8, 5.8)
  return P
}

// 2. waddle：蹒跚走（0.6 m/s，1.4 s 两步）：步宽大、脚尖外开、髋左右大摆 + 滚转，肩反向；手臂外张小摆；上下颠 → 肚子 / 双下巴二阶抖
function waddlePose(u: number, tm: number): ChefAnimPose {
  const P = over(STAND, {})
  const Ci = CHEF_CLIPS.waddle
  walkBody(P, u, WADDLE_G(Ci.speed! * Ci.dur), 0.042, true)
  P.head[0] += 0.04; P.neck[0] += 0.03
  P.earL.pitch = 0.08; P.earR.pitch = 0.08
  P.jaw = 0.03 + 0.015 * Math.sin(tm * 3)
  return P
}

// 3. humWalk：哼小调慢走（0.38 m/s、2 s 两步）：两手搭在肚子两侧、手指跟着拍子轻拍；头随调子左右晃、下巴一张一合（哼）；耳朵松垂
function humPose(t: number, u: number): ChefAnimPose {
  const P = over(STAND, {})
  const Ci = CHEF_CLIPS.humWalk
  walkBody(P, u, { ...WADDLE_G(Ci.speed! * Ci.dur), lift: 0.03, duty: 0.66 }, 0.034, false)
  const beat = Math.max(0, Math.sin(t * TAU * 2))
  for (const s of [1, -1]) {
    // [修订] 掌心离衣面 3.4 cm（含掌厚）、肘往外撑：前臂 / 掌根不贴进肚子；跟肚子抖一半（手搭着、不是粘着）
    const a = palmOnBelly(s, s * 0.15, 1.14, [-s * 0.3, -0.8, 0.2], 0.034, C([-0.1, -0.35 - 0.3 * beat, -0.3, -0.25, -0.2]))
    Object.assign(s > 0 ? P.L : P.R, a, { pole: [s, 0.45, -0.3], bk: 0.5 })
  }
  const sw = Math.sin(u * TAU)
  P.head[1] += 0.12 * sw; P.head[2] += 0.1 * Math.sin(u * TAU + 0.6); P.neck[1] += 0.05 * sw
  P.head[0] -= 0.04
  P.jaw = 0.03 + 0.04 * Math.max(0, Math.sin(t * TAU * 1.5)) * (0.6 + 0.4 * Math.sin(t * 2.3))
  P.earL.splay += 0.18; P.earR.splay += 0.18; P.earL.bend += 0.15; P.earR.bend += 0.15
  P.earL.pitch += 0.06 * Math.sin(t * TAU * 1 + 1); P.earR.pitch += 0.06 * Math.sin(t * TAU * 1)
  return P
}

// 4. serve：双手捧盘（盘沿托在掌上）站在桌前（近边 z 0.42，肚子悬在桌沿上）→ 前倾、屈膝降髋把盘子放到 CHEF_PLATE_AT → 松手、手收回
//    → 直起身，右手在胸前一摊「请用」，头歪一下 → 收手
const plateHands = (c: V3, open = 0): Part => {
  const hx = CHEF_PLATE.r + 0.004, y = c[1] - 0.004
  return {
    L: { pp: [c[0] + hx, y, c[2] - 0.03], pw: 1, pk: 0, gw: 0, kw: 0, pole: [1, -0.5, -0.4], hq: hQ(1, [-0.15, -0.1 + 0.2 * open, 1], [0.95, 0.1, 0.05]), hw: 1, fl: open ? CURL_OPEN : CURL_PLATE, tab: 0 },
    R: { pp: [c[0] - hx, y, c[2] - 0.03], pw: 1, pk: 0, gw: 0, kw: 0, pole: [-1, -0.5, -0.4], hq: hQ(-1, [0.15, -0.1 + 0.2 * open, 1], [-0.95, 0.1, 0.05]), hw: 1, fl: open ? CURL_OPEN : CURL_PLATE, tab: 0 },
  }
}
const SERVE_LEAN: Part = { hipsP: [0, -0.1, -0.06], hipsR: [0.45, 0, 0], spine: [0.24, 0, 0], chest: [0.16, 0, 0], neck: [-0.12, 0, 0], head: [0.1, 0, 0], L: { clav: [0, -0.12, 0] }, R: { clav: [0, 0.12, 0] } }
function servePose(t: number): ChefAnimPose {
  const HOLD: V3 = [0, 1.19, 0.5], PUT: V3 = [CHEF_PLATE_AT[0], CHEF_PLATE_AT[1] + CHEF_PLATE.h / 2 + 0.002, CHEF_PLATE_AT[2]]
  const up: Part = { hipsR: [0.04, 0, 0], spine: [0.04, 0, 0], chest: [0.1, 0, 0], neck: [-0.06, 0, 0], head: [0.14, 0, 0], L: { clav: [0, -0.12, 0] }, R: { clav: [0, 0.12, 0] } }
  const P = keys(t, STAND, [
    [0, merge(plateHands(HOLD), up)],
    [0.7, merge(plateHands(HOLD), up, ears(0.1, 0.1))],
    [2.0, merge(plateHands([PUT[0], PUT[1] + 0.03, PUT[2]]), SERVE_LEAN, ears(0.22, 0.08, 0, 0.1))],
    [2.4, merge(plateHands(PUT), SERVE_LEAN, ears(0.22, 0.08, 0, 0.1))],
    [2.8, merge(plateHands([PUT[0], PUT[1] + 0.02, PUT[2] - 0.05], 1), SERVE_LEAN)],
    [3.6, merge({ ...HANG }, { chest: [0.03, 0, 0], head: [0.12, -0.05, 0.05] })],
    [4.3, merge({ L: HANG.L, R: { t: [-0.27, 1.12, 0.4], pole: [-1, -0.6, -0.3], hq: hQ(-1, [-0.5, -0.05, 0.86], [0.05, -1, 0.1]), hw: 1, fl: CURL_OPEN, tab: 0, pw: 0 } }, { chest: [0.0, -0.08, 0], head: [0.1, -0.12, 0.14], neck: [0, -0.05, 0] }, ears(-0.05, 0.16, 0.2))],
    [4.9, merge({ L: HANG.L, R: { t: [-0.27, 1.12, 0.4], pole: [-1, -0.6, -0.3], hq: hQ(-1, [-0.5, -0.05, 0.86], [0.05, -1, 0.1]), hw: 1, fl: CURL_OPEN, tab: 0, pw: 0 } }, { chest: [0.0, -0.08, 0], head: [0.1, -0.1, 0.1] }, ears(-0.05, 0.16, 0.2))],
    [5.6, {}],
  ])
  P.props.plate = 1; P.props.plateHold = t < 2.5 ? 1 : 0; P.props.plateP = [...PUT]
  breathe(P, t / 5.6, 2, 0.6)
  return P
}

// 5. earTwitch：铃声（0.4 s）——右耳先猛抽两下、左耳跟着；0.7 s 头猛地转向他左侧（约 55°，0.25 s 内），耳朵前竖对着声源，
//    停住听（身体不动、耳尖细抖）；1.9 s 再抽一下；2.6 s 起慢慢转回
function twitchPose(t: number): ChefAnimPose {
  const look: Part = { chest: [0.02, 0.12, 0], neck: [0.0, 0.3, 0.02], head: [-0.04, 0.55, 0.06] }
  const P = keys(t, STAND, [
    [0, {}],
    [0.68, ears(0.05, 0.12, 0, 0.1)],
    [0.95, merge(look, ears(-0.25, -0.12, 0.3, -0.2)), EXP_OUT],
    [2.6, merge(look, { head: [-0.06, 0.6, 0.04] }, ears(-0.22, -0.1, 0.35, -0.15))],
    [3.6, {}],
  ])
  earFlick(P.earR, t, 0.4, 1.4); earFlick(P.earR, t, 0.62, 1.0); earFlick(P.earL, t, 0.5, 1.2); earFlick(P.earL, t, 1.9, 1.0); earFlick(P.earR, t, 2.0, 0.8)
  P.earL.bend += 0.04 * bump(t, 1.0, 2.5) * Math.sin(t * 40); P.earR.bend += 0.04 * bump(t, 1.0, 2.5) * Math.sin(t * 37 + 1)
  // 头一顿（转到位时的过冲）
  P.head[1] += 0.06 * bump(t, 0.9, 1.15)
  breathe(P, t / 3.6, 1.5, 0.6)
  return P
}

// 6. tapTable：站在桌前（近边 0.42），右肩下沉、上身前倾右侧；胖手掌心朝下悬在桌面上方，食指伸出，慢慢敲三下（1.4 / 2.0 / 2.6 s），
//    头低下来盯着（桌边坐着的人）、耳朵前倾；敲完停一拍，收手
const TAP_LEAN: Part = { hipsP: [-0.02, -0.04, -0.05], hipsR: [0.24, -0.08, 0.04], spine: [0.12, -0.06, 0.04], chest: [0.08, -0.12, 0.05], neck: [0.12, 0.12, 0], head: [0.24, 0.16, -0.04] }
function tapArm(lift: number): Part {
  const P0 = CHEF_TAP_AT
  return { R: { pp: [P0[0] + 0.03, P0[1] + 0.065 + lift * 0.4, P0[2] - 0.06], pw: 1, pk: 0, gw: 0, kw: 0, pole: [-1, -0.5, -0.5], hq: hQ(-1, [0.2, -0.32 - 0.2 * lift, 1], [0.0, 1, 0.3]), hw: 1, fl: C([0.25, -0.5 + 0.6 * lift, 0.55, 0.75, 0.85]), tab: 0, clav: [0, 0.1, 0.03] } }
}
function tapPose(t: number): ChefAnimPose {
  const P = keys(t, STAND, [
    [0, {}],
    [1.0, merge(TAP_LEAN, tapArm(0.6), ears(0.25, 0.08, 0, 0.12))],
    [3.2, merge(TAP_LEAN, tapArm(0.6), ears(0.25, 0.08, 0, 0.12))],
    [4.0, {}],
  ])
  // 敲：食指（第 1 节为主）抬起 → 落下打在桌面，三下
  let tap = 0
  for (const a of [1.35, 1.95, 2.55]) tap += bump(t, a, a + 0.42) * (t - a < 0.3 ? 1 : 1)
  const fi = 3 // 食指 3 节在 fl 中的起点
  if (t > 1.0 && t < 3.2) {
    const lift = c01(tap)
    P.R.fl[fi] -= 0.55 * lift; P.R.fl[fi + 1] -= 0.1 * lift
    P.R.pp = addV(P.R.pp, [0, 0.008 * lift, 0])
  }
  breathe(P, t / 4, 1.5, 0.7)
  return P
}

// 7. potSwing：右手提着锅（锅柄在拳里、锅垂在身侧）→ 慢慢抬到右肩后上方（0.3–1.35 s，慢、蓄力，身体右拧后仰、头盯前方）
//    → 闪电般一抡（1.35–1.47 s，0.12 s）斜劈到左前方头高（打破慢节奏）→ 收势跟随到左下（1.47–1.75）→ 停住喘一下 → 慢慢收回垂下
const POT_HANG: Part = { R: { pp: [-0.39, 0.9, 0.08], pw: 1, pk: 1, gw: 0, kw: 0, pole: [-0.6, -0.1, -1], hq: hAR(-1, [0, -0.3, 1], [0, -1, 0.1]), hw: 1, fl: CURL_GRIP, tab: 0 } }
const POT_UP: Part = {
  R: { pp: [-0.36, 1.58, -0.1], pw: 1, pk: 1, pole: [-1, 0.2, -0.5], hq: hAR(-1, [0.1, 0.6, 0.6], [0.2, 0.55, -0.85]), hw: 1, fl: CURL_GRIP, tab: 0, clav: [0, -0.08, -0.06] },
  L: { t: [0.34, 1.05, 0.28], pole: [1, -0.4, -0.5], hq: hQ(1, [-0.3, 0.2, 1], [0.9, 0.2, 0.2]), hw: 1, fl: CURL_SOFT, tab: 0 },
  hipsR: [-0.04, -0.18, 0.03], spine: [-0.04, -0.15, 0.03], chest: [-0.06, -0.25, 0.04], neck: [0.0, 0.18, 0], head: [0.05, 0.22, 0.0], hipsP: [0.01, -0.02, -0.02],
}
const POT_HIT: Part = {
  R: { pp: [0.06, 1.34, 0.6], pw: 1, pk: 1, pole: [-1, -0.2, -0.3], hq: hAR(-1, [0.6, -0.2, 0.75], [0.45, 0.15, 0.88]), hw: 1, fl: CURL_GRIP, tab: 0, clav: [0, 0.12, 0] },
  L: { t: [0.46, 1.0, 0.02], pole: [1, -0.2, -0.6], hq: hQ(1, [0.1, -0.6, -0.4], [0.9, 0.2, -0.2]), hw: 1, fl: CURL_SOFT, tab: 0 },
  hipsR: [0.12, 0.16, -0.02], spine: [0.08, 0.14, -0.02], chest: [0.1, 0.24, -0.03], neck: [0.05, -0.12, 0], head: [0.08, -0.16, 0.0], hipsP: [0.0, -0.035, 0.02],
}
const POT_FOLLOW: Part = {
  R: { pp: [0.08, 1.04, 0.55], pw: 1, pk: 1, pole: [-1, -0.4, 0.2], hq: hAR(-1, [0.8, -0.45, 0.2], [0.55, -0.7, 0.45]), hw: 1, fl: CURL_GRIP, tab: 0 },
  L: { t: [0.47, 1.0, 0.02], pole: [1, -0.2, -0.6], hw: 0, fl: CURL_SOFT, tab: 0 },
  hipsR: [0.14, 0.12, -0.03], spine: [0.1, 0.12, -0.03], chest: [0.12, 0.2, -0.03], neck: [0.06, -0.16, 0], head: [0.14, -0.2, 0.05], hipsP: [0.0, -0.045, 0.03],
}
function swingPose(t: number): ChefAnimPose {
  const P = keys(t, STAND, [
    [0, merge(POT_HANG, ears(0.05, 0.12, 0, 0.1))],
    [0.3, merge(POT_HANG, { head: [0.0, 0.0, 0] }, ears(-0.05, 0.05, 0, 0))],
    [1.35, merge(POT_UP, ears(-0.18, -0.05, 0, -0.05)), EXP_IN],
    [1.47, merge(POT_HIT, ears(-0.1, 0.0, 0, 0)), LIN],
    [1.75, merge(POT_FOLLOW, ears(0.1, 0.1, 0, 0.1)), EXP_OUT],
    [2.3, merge(POT_FOLLOW, { chest: [0.1, 0.18, -0.03], head: [0.1, -0.14, 0.05] }, ears(0.12, 0.12, 0, 0.12))],
    [2.75, merge({ R: { pp: [-0.17, 1.1, 0.5], pw: 1, pk: 1, pole: [-1, -0.5, -0.2], hq: hAR(-1, [0.2, -0.5, 0.8], [0.2, -0.85, 0.5]), hw: 1, fl: CURL_GRIP, tab: 0 } }, { L: HANG.L, chest: [0.06, 0.08, 0], hipsR: [0.06, 0.05, 0], head: [0.08, -0.04, 0.02] }, ears(0.1, 0.12, 0, 0.1))],
    [3.05, merge({ R: { pp: [-0.42, 0.98, 0.22], pw: 1, pk: 1, pole: [-0.8, -0.2, -0.8], hq: hAR(-1, [0, -0.4, 1], [0, -1, 0.3]), hw: 1, fl: CURL_GRIP, tab: 0 } }, { L: HANG.L }, ears(0.06, 0.12, 0, 0.1))],
    [3.4, merge(POT_HANG, ears(0.05, 0.12, 0, 0.1))],
  ])
  P.props.pot = 1
  // 喘：抡完胸口起伏
  const pant = ramp(t, 1.7, 2.0) * (1 - ramp(t, 3.0, 3.4))
  P.chest[0] -= 0.02 * pant * Math.sin(t * TAU * 1.8); P.bellyS += 0.03 * pant * Math.sin(t * TAU * 1.8); P.jaw = 0.12 * pant * (0.5 + 0.5 * Math.sin(t * TAU * 1.8))
  return P
}

// 8. grabDrag：往前蹒跚走（0.32 m/s），上身前倾使劲；右手在身后右侧攥着被拖者的后领（衬衫领 / 头发），左臂前后摆着借力；
//    被拖的人（灰色假人）上半身被提起、屁股和腿在地上拖；头低、耳朵向后
export const CHEF_DRAG_GRIP: V3 = [-0.37, 0.99, -0.2]
function dragPose(u: number): ChefAnimPose {
  const P = over(STAND, {})
  const Ci = CHEF_CLIPS.grabDrag
  walkBody(P, u, { ...WADDLE_G(Ci.speed! * Ci.dur), lift: 0.03, duty: 0.68, D: Ci.speed! * Ci.dur }, 0.03, true)
  P.hipsR[0] += 0.16; P.spine[0] += 0.08; P.chest[0] += 0.04; P.chest[1] -= 0.08; P.neck[0] += 0.05; P.head[0] += 0.08
  // 每步一拽：身体前冲时手被拖住
  const tug = Math.sin(u * TAU * 2)
  P.R = { ...P.R, pp: addV(CHEF_DRAG_GRIP, [0, 0.01 * tug, -0.015 * tug]), pw: 1, pk: 1, pole: [-0.6, -0.4, 0.8], hq: hAR(-1, [-0.2, -0.3, -0.9], [0.95, 0.2, -0.1]), hw: 1, fl: CURL_GRIP, tab: 0, clav: [0, -0.08, 0] }
  P.L.t = addV(P.L.t, [0, 0.02, 0.05])
  P.earL.pitch = -0.2; P.earR.pitch = -0.2; P.earL.splay = -0.05; P.earR.splay = -0.05
  P.jaw = 0.06 + 0.04 * Math.max(0, tug)
  P.props.victim = 1
  return P
}

// 9. sniffCrouch：两脚往外迈开、脚尖大外开 → 肥胖地蹲下（膝盖分得很开，肚子落在两膝之间），双手按膝 → 头低下去、
//    猪鼻贴近地面左右嗅（头一抽一抽、成串）→ 停住听一下 → 双手撑膝吃力站起（[修订] 蹲到底双手按膝盖；下蹲 / 起身途中先按大腿下段）
const CROUCH: Part = {
  hipsP: [0, -0.22, -0.1], hipsR: [0.62, 0, 0], spine: [0.22, 0, 0], chest: [0.14, 0, 0], neck: [0.18, 0, 0], head: [0.2, 0, 0],
  legL: { p: [0.3, 0, TOE[2] + 0.06], yw: 0.6, ph: 0.0 }, legR: { p: [-0.3, 0, TOE[2] + 0.06], yw: -0.6, ph: 0.0 },
}
const KNEES: Part = {
  L: { kw: 1, ks: 1, ko: [-0.01, 0.07, 0.03], pw: 0, gw: 0, pole: [1, -0.1, -0.5], hq: hQ(1, [-0.25, -0.5, 1], [0.15, 1, 0.4]), hw: 1, fl: C([0.15, 0.25, 0.3, 0.35, 0.4]), tab: 0 },
  R: { kw: 1, ks: -1, ko: [0.01, 0.07, 0.03], pw: 0, gw: 0, pole: [-1, -0.1, -0.5], hq: hQ(-1, [0.25, -0.5, 1], [-0.15, 1, 0.4]), hw: 1, fl: C([0.15, 0.25, 0.3, 0.35, 0.4]), tab: 0 },
}
/** 坐着：掌心按在大腿中段（膝后 12 cm） */
const THIGHS: Part = merge(KNEES, { L: { ko: [-0.02, 0.1, -0.13] }, R: { ko: [0.02, 0.1, -0.13] } })
/** 蹲到一半：上身先前倾、手先伸到大腿上段前面，蹲到底再按膝（手臂短，从垂手直接插值到膝会够不着） */
const HALF_CROUCH: Part = { hipsP: [0, -0.1, -0.06], hipsR: [0.5, 0, 0], spine: [0.2, 0, 0], chest: [0.12, 0, 0], neck: [0.12, 0, 0], head: [0.18, 0, 0], legL: { p: [0.3, 0, TOE[2] + 0.06], yw: 0.6, ph: 0.0 }, legR: { p: [-0.3, 0, TOE[2] + 0.06], yw: -0.6, ph: 0.0 } }
/** 蹲到一半的手：悬在大腿上段前面（不按，手腕目标直接给；肩够得着），蹲到底再落到膝上 */
const HALF_HANDS: Part = merge(KNEES, { L: { kw: 0, t: [0.31, 0.8, 0.2] }, R: { kw: 0, t: [-0.31, 0.8, 0.2] } })
const WIDE: Part = { legL: { p: [0.3, 0, TOE[2] + 0.06], yw: 0.6 }, legR: { p: [-0.3, 0, TOE[2] + 0.06], yw: -0.6 } }
function sniffPose(t: number, tm: number): ChefAnimPose {
  const P = keys(t, STAND, [
    [0, {}],
    [0.7, merge(WIDE, { head: [0.15, 0, 0] })],
    [1.3, merge(HALF_CROUCH, HALF_HANDS, ears(0.18, 0.1, 0, 0.12))],
    [1.9, merge(CROUCH, KNEES, ears(0.25, 0.1, 0, 0.15))],
    [4.4, merge(CROUCH, KNEES, ears(0.25, 0.1, 0, 0.15))],
    [4.95, merge(HALF_CROUCH, HALF_HANDS, ears(0.18, 0.1, 0, 0.12))],
    [5.5, merge(WIDE, { hipsR: [0.06, 0, 0], head: [0.1, 0, 0] }, ears(0.1, 0.12, 0, 0.1))],
    [6.0, merge(WIDE, ears(0.05, 0.12, 0, 0.1))],
  ])
  // 嗅：2.0–4.3 s 头左右扫，鼻子一抽一抽
  const on = ramp(t, 1.9, 2.1) * (1 - ramp(t, 4.2, 4.4))
  const scan = Math.sin((t - 2.0) * TAU * 0.45)
  P.head[1] += on * 0.32 * scan; P.neck[1] += on * 0.12 * scan
  const burst = Math.max(0, Math.sin(tm * TAU * 5.5)) * (0.5 + 0.5 * Math.sin(tm * 2.1))
  P.head[0] += on * (0.05 * burst + 0.04); P.jaw = on * 0.02 * burst
  P.earL.pitch += on * 0.15; P.earR.pitch += on * 0.15
  earFlick(P.earL, t, 3.4, 0.8)
  // 吃力：起身时喘
  const eff = bump(t, 4.4, 5.6)
  P.jaw += 0.1 * eff; P.bellyS -= 0.02 * eff
  return P
}

// 10. takeKnife：面向刀墙（墙 z 0.54、挂杆 y 1.55）→ 抬头看刀 → 右手往上伸（掌心朝墙、拇指朝下）握住刀柄、从磁条上取下
//     → 手腕翻过来、刀尖朝上，举到猪鼻前 → 下颌张开、舌头伸出，头顺着刀身从下往上舔两下 → 舌收回、刀放低握在身侧（刀尖朝前下）
export const CHEF_WALL_KNIFE_GRIP: V3 = [CHEF_KNIFE_WALL.knifeX, 1.63, 0.525]
function knifePose(t: number): ChefAnimPose {
  const W = CHEF_WALL_KNIFE_GRIP
  const reach = (k: number): Part => ({
    R: { pp: [W[0], W[1], W[2] - 0.004], pw: 1, pk: 1, gw: 0, kw: 0, pole: [-1, -0.5, -0.2], hq: hAR(-1, [0.0, 0.1, 1], [0, -1, 0]), hw: 1, fl: k ? CURL_GRIP : CURL_OPEN, tab: 0, clav: [0, 0.06, -0.06] },
    hipsP: [0, 0, 0.01], chest: [-0.06, -0.05, 0], neck: [-0.1, 0, 0], head: [-0.16, 0.0, 0],
  })
  const LICK_H: V3 = [-0.045, 1.33, 0.44]
  const lick = (dy: number, tilt: number): Part => ({
    R: { pp: [LICK_H[0], LICK_H[1] + dy, LICK_H[2]], pw: 1, pk: 1, gw: 0, kw: 0, pole: [-1, -0.6, -0.3], hq: hAR(-1, [0.55, 0, 0.83], [0.05, 1, -0.12]), hw: 1, fl: CURL_GRIP, tab: 0, clav: [0, 0.01, 0] },
    neck: [0.12, 0.0, 0], head: [0.22 + tilt, -0.05, 0.08], chest: [0.02, 0.05, 0],
  })
  const LOW: Part = { R: { pp: [-0.39, 0.95, 0.2], pw: 1, pk: 1, gw: 0, kw: 0, pole: [-0.7, -0.1, -1], hq: hAR(-1, [0, -0.9, 0.3], [0, -0.3, 0.95]), hw: 1, fl: CURL_GRIP, tab: 0 } }
  const P = keys(t, STAND, [
    [0, {}],
    [0.6, merge({ neck: [-0.08, 0, 0], head: [-0.15, -0.05, 0] }, ears(-0.1, 0.05))],
    [1.6, merge(reach(0), ears(-0.12, 0.05))],
    [1.95, merge(reach(1), ears(-0.12, 0.05))],
    [2.2, merge(reach(1), { R: { pp: [W[0], W[1] + 0.03, W[2] - 0.06] } })],
    [3.1, merge(lick(-0.04, 0.2), ears(0.15, 0.1, 0, 0.1))],
    [3.5, merge(lick(-0.04, 0.2), ears(0.15, 0.1, 0, 0.1))],
    [4.1, merge(lick(0.02, -0.1), ears(0.1, 0.15, 0, 0.1))],
    [4.4, merge(lick(-0.05, 0.22), ears(0.15, 0.1, 0, 0.1))],
    [5.0, merge(lick(0.02, -0.1), ears(0.1, 0.15, 0, 0.1))],
    [5.7, merge(LOW, { head: [0.12, -0.05, 0] }, ears(0.05, 0.12, 0, 0.1))],
    [6.4, merge(LOW, ears(0.05, 0.12, 0, 0.1))],
  ])
  const held = t >= 1.95
  P.props.wallKnife = held ? 0 : 1; P.props.knife = held ? 1 : 0
  // 刀向 = 拳眼轴（手朝向里给）：取下时刀尖朝下（拇指朝下握）→ 翻腕后朝上（略朝脸）→ 放低后朝前下
  breathe(P, t / 6.4, 3, 0.8)
  const tg = bump(t, 3.1, 5.15)
  P.props.tongue = c01(tg * 1.6); P.jaw = 0.22 * c01(tg * 1.5) + 0.02
  return P
}

// 11. barricade：打烊——左手攥着绳头、右手拿绳子走到双开门前（门面 z 0.6，把手 y 1.0、x ±0.09）→ 右手绕着两只门把手缠两圈
//     （手绕把手画圈）→ 两手向外一拉勒紧（身体后仰）→ 在把手中间打结（两手小幅快搓）→ 右手抬起去推门闩（y 1.22，从 x 0.22 推到 −0.04）
//     → 拍一下门、退半步站好
const DOOR_LEAN: Part = { hipsP: [0, -0.03, -0.06], hipsR: [0.2, 0, 0], spine: [0.1, 0, 0], chest: [0.06, 0, 0], neck: [0.0, 0, 0], head: [0.12, 0, 0] }
const doorHand = (s: number, p: V3, fl = CURL_PINCH, open = 0): Part => armPart(s, { g: p, gw: 1, pw: 0, kw: 0, pole: [s, -0.5, -0.5], hq: hQ(s, [-s * 0.4, -0.2 + 0.2 * open, 1], [s * 0.3, 1, 0.1]), hw: 1, fl, tab: 0 })
/** 门闩拨钮的捏合目标 */
const BOLT_G = (x: number): V3 => [x, CHEF_DOOR.boltY + 0.004, CHEF_DOOR.z - 0.07]
const HDL = (s: number): V3 => [s * CHEF_DOOR.handleX, CHEF_DOOR.handleY, CHEF_DOOR.handleZ]
/** 缠把手：右手绕左把手（x +0.09）在 x-y 平面里画圈（半径 7 cm），k = 圈数进度 */
const wrapAt = (k: number): V3 => { const a = TAU * k - Math.PI / 2, H = HDL(1); return [H[0] + 0.055 * Math.cos(a) - 0.04, H[1] + 0.05 + 0.055 * Math.sin(a), H[2] - 0.03] }
function barricadePose(t: number): ChefAnimPose {
  const coil: Part = merge(doorHand(1, [0.2, 1.05, 0.4]), doorHand(-1, [-0.2, 1.06, 0.41]))
  const ks: [number, Part, ((x: number) => number)?][] = [
    [0, merge(coil, { head: [0.1, 0, 0] })],
    [0.8, merge(coil, DOOR_LEAN, { head: [0.2, 0, 0] }, ears(0.1, 0.1, 0, 0.1))],
    [1.2, merge(DOOR_LEAN, doorHand(-1, [HDL(-1)[0] + 0.02, 0.98, 0.5]), doorHand(1, wrapAt(0)))],
  ]
  // 缠两圈：1.2–3.4 s，每 0.1 s 一个关键帧（手绕圈）
  for (let i = 1; i <= 22; i++) ks.push([1.2 + i * 0.1, merge(DOOR_LEAN, doorHand(-1, [HDL(-1)[0] + 0.02, 0.98, 0.5]), doorHand(1, wrapAt(i / 11))), LIN])
  ks.push(
    [3.6, merge(DOOR_LEAN, doorHand(-1, [-0.2, 0.98, 0.44]), doorHand(1, [0.22, 0.99, 0.44]), { hipsR: [0.04, 0, 0], hipsP: [0, -0.03, -0.06] }, ears(-0.05, 0.05))],
    [4.1, merge(DOOR_LEAN, doorHand(-1, [-0.24, 0.98, 0.4]), doorHand(1, [0.26, 0.99, 0.4]), { hipsR: [-0.02, 0, 0], hipsP: [0, -0.035, -0.08], chest: [-0.04, 0, 0] }, ears(-0.1, 0.0))],
    [4.5, merge(DOOR_LEAN, doorHand(-1, [-0.03, 0.99, 0.5]), doorHand(1, [0.03, 0.99, 0.5]), ears(0.15, 0.1, 0, 0.1))],
    [5.4, merge(DOOR_LEAN, doorHand(-1, [-0.03, 0.99, 0.5]), doorHand(1, [0.03, 0.99, 0.5]), ears(0.15, 0.1, 0, 0.1))],
    [5.9, merge(DOOR_LEAN, { R: { ...HANG.R } }, doorHand(1, BOLT_G(CHEF_DOOR.boltFrom)), { head: [0.0, 0.12, 0] })],
    [6.7, merge(DOOR_LEAN, { R: { ...HANG.R } }, doorHand(1, BOLT_G(CHEF_DOOR.boltTo)), { head: [0.02, 0.05, 0] })],
    [7.2, merge({ R: { ...HANG.R } }, doorHand(1, BOLT_G(CHEF_DOOR.boltTo)), DOOR_LEAN)],
    [8.0, merge(HANG, { legL: { p: [0.165, 0, TOE[2] - 0.06], yw: 0.22 }, legR: { p: [-0.165, 0, TOE[2] - 0.075], yw: -0.2 } }, { head: [0.1, 0.1, 0.05] }, ears(0.05, 0.12, 0, 0.1))],
  )
  const P = keys(t, STAND, ks)
  // 打结：两手小幅快搓（4.5–5.4 s）
  const kn = bump(t, 4.5, 5.4)
  if (kn > 0) { const w = Math.sin((t - 4.5) * TAU * 3.2); P.L.g = addV(P.L.g, [0.012 * w * kn, 0.015 * Math.cos((t - 4.5) * TAU * 3.2) * kn, 0]); P.R.g = addV(P.R.g, [-0.012 * w * kn, -0.015 * Math.cos((t - 4.5) * TAU * 3.2) * kn, 0]) }
  P.props.rope = t < 7.0 ? 1 : 1
  P.props.ropeWrap = ramp(t, 1.2, 3.4); P.props.ropeKnot = ramp(t, 4.5, 5.4)
  P.props.boltX = mix(CHEF_DOOR.boltFrom, CHEF_DOOR.boltTo, ramp(t, 5.9, 6.7))
  breathe(P, t / 8, 3, 0.6)
  return P
}

// 12. stuffedStagger：吃撑了——踉跄蹒跚（0.26 m/s，2.6 s 两步，一步急一步拖），身体左右大晃、头耷拉着晃；
//     左手捂着肚子、右臂向外张开找平衡；1.5 s 打个嗝（下巴一张、头一仰）；肚子晃得最厉害
function staggerPose(t: number, u: number): ChefAnimPose {
  const P = over(STAND, {})
  const Ci = CHEF_CLIPS.stuffedStagger
  walkBody(P, u, { ...WADDLE_G(Ci.speed! * Ci.dur), lift: 0.028, duty: 0.66, width: 0.18, warp: 0.35, toeOut: 0.28 }, 0.06, false)
  const lol = Math.sin(u * TAU + 0.8)
  P.hipsR[2] *= 1.3; P.chest[2] += 0.06 * lol; P.head[2] += 0.15 * lol + 0.06 * noise1(t * 1.3, 3); P.neck[0] += 0.08; P.head[0] += 0.1 + 0.05 * Math.sin(u * TAU * 2)
  P.hipsR[0] -= 0.06; P.chest[0] -= 0.04
  Object.assign(P.L, palmOnBelly(1, 0.13, 1.12, [-0.6, -0.5, 0.2], 0.026), { pole: [1, 0.55, -0.05] })
  const bal = Math.sin(u * TAU + 1.6)
  Object.assign(P.R, { t: [-0.5, 1.02 + 0.06 * bal, 0.14 + 0.04 * bal], pole: [-0.5, -0.8, -0.6], hq: hQ(-1, [-1, -0.1, 0.25], [0, 1, 0.15]), hw: 0.7, fl: CURL_OPEN, tab: 0, pw: 0, gw: 0, kw: 0, clav: [0, 0, -0.03] })
  const burp = bump(t, 1.45, 1.95)
  P.jaw = 0.06 + 0.3 * burp; P.head[0] -= 0.22 * burp; P.neck[0] -= 0.08 * burp; P.bellyS -= 0.04 * burp
  P.earL.splay += 0.2; P.earR.splay += 0.2; P.earL.bend += 0.2; P.earR.bend += 0.2
  return P
}

// 13. stoveLean：两手撑在灶台前沿（台面 0.9）、胳膊撑直，上身前倾压在手上，头耷拉着喘粗气（1.6 Hz：胸 / 肚子起伏、下巴一张一合、肩一耸一耸），
//     中间抬头看一眼锅，再低下
const LEAN_BODY: Part = { hipsP: [0, -0.05, -0.06], hipsR: [0.42, 0, 0], spine: [0.2, 0, 0], chest: [0.14, 0, 0], neck: [0.12, 0, 0], head: [0.16, 0, 0], L: { clav: [0, -0.1, 0] }, R: { clav: [0, 0.1, 0] } }
const stoveHand = (s: number, x: number): Part => armPart(s, { pp: [s * x, CHEF_STOVE.y + 0.004, CHEF_STOVE.z + 0.05], pw: 1, pk: 0, gw: 0, kw: 0, pole: [s * 1, 0.1, -0.4], hq: hQ(s, [-s * 0.25, -0.25, 1], [0, 1, 0.12]), hw: 1, fl: C([0.1, 0.1, 0.12, 0.15, 0.2]), tab: 0 })
function leanPose(t: number, u: number): ChefAnimPose {
  const P = over(STAND, merge(LEAN_BODY, stoveHand(1, 0.34), stoveHand(-1, 0.34), ears(0.25, 0.18, 0, 0.2)))
  const f = 1.6, ph = Math.sin(t * TAU * f)
  P.chest[0] -= 0.025 * ph; P.spine[0] -= 0.01 * ph; P.bellyS += 0.035 * ph; P.chinP = [0, -0.003 * ph, 0]
  P.L.clav = [0, 0, 0.02 * ph]; P.R.clav = [0, 0, -0.02 * ph]
  P.jaw = 0.12 + 0.08 * ph
  const look = bump(u, 0.45, 0.8)
  P.neck[0] -= 0.25 * look; P.head[0] -= 0.2 * look; P.head[1] += 0.08 * look
  earFlick(P.earL, t, 1.1, 0.7)
  return P
}

// 14. vomitPot（远景背身演出，不做特写）：两手撑灶台，上身探到锅上方；三次干呕（1.3 / 2.6 / 3.9 s）：
//     肚子猛收（缩放 + 后缩）、肩耸起、头颈前探下压、下巴大张，一股暗红浆液流进锅里；之后头耷拉、喘，慢慢直起一点
const VOMIT_BODY: Part = { hipsP: [0, -0.05, -0.06], hipsR: [0.44, 0, 0], spine: [0.22, 0, 0], chest: [0.16, 0, 0], neck: [0.26, 0, 0], head: [0.22, 0, 0], L: { clav: [0, -0.1, 0] }, R: { clav: [0, 0.1, 0] } }
function vomitPose(t: number): ChefAnimPose {
  const P = keys(t, STAND, [
    [0, {}],
    [1.0, merge(VOMIT_BODY, stoveHand(1, 0.34), stoveHand(-1, 0.34), ears(0.3, 0.15, 0, 0.25))],
    [5.0, merge(VOMIT_BODY, stoveHand(1, 0.34), stoveHand(-1, 0.34), ears(0.3, 0.15, 0, 0.25))],
    [6.0, merge(LEAN_BODY, stoveHand(1, 0.34), stoveHand(-1, 0.34), { neck: [0.1, 0, 0], head: [0.1, 0, 0] }, ears(0.2, 0.18, 0, 0.2))],
  ])
  let h = 0
  for (const a of [1.3, 2.6, 3.9]) h = Math.max(h, bump(t, a, a + 0.85) ** 0.7)
  P.bellyS -= 0.12 * h; P.bellyP = [0, 0.015 * h, -0.035 * h]
  P.L.clav = [0, 0.02 * h, 0.06 * h]; P.R.clav = [0, 0.02 * h, -0.06 * h]
  P.neck[0] += 0.12 * h; P.head[0] += 0.12 * h; P.chest[0] += 0.05 * h; P.spine[0] -= 0.03 * h
  P.jaw = 0.05 + 0.5 * h
  let v = 0
  for (const a of [1.45, 2.75, 4.05]) v = Math.max(v, bump(t, a, a + 0.6))
  P.props.vomit = v
  const pant = ramp(t, 4.6, 5.0)
  P.jaw += 0.08 * pant * (0.5 + 0.5 * Math.sin(t * TAU * 1.6))
  return P
}

// 15. flashFreeze：0.3 s 闪光灯——身体一顿往后一缩（头后仰、胸后缩、两手半抬），两耳猛地竖直后张、僵住；
//     之后整个人僵住不动（停呼吸、头高频细颤、耳朵不晃）→ 2.4 s 起头慢慢转向光源（他左前方）、低下来盯住，手攥成拳，耳朵前倾
function freezePose(t: number, tm: number): ChefAnimPose {
  const flinch: Part = {
    hipsP: [0, -0.01, -0.025], chest: [-0.08, 0, 0], neck: [-0.1, 0, 0], head: [-0.16, 0, 0],
    L: { t: [0.36, 1.08, 0.2], pole: [1, -0.4, -0.6], hq: hQ(1, [-0.2, 0.6, 0.6], [0.9, 0.1, -0.2]), hw: 1, fl: CURL_OPEN, tab: 0 },
    R: { t: [-0.36, 1.08, 0.2], pole: [-1, -0.4, -0.6], hq: hQ(-1, [0.2, 0.6, 0.6], [-0.9, 0.1, -0.2]), hw: 1, fl: CURL_OPEN, tab: 0 },
    ...ears(-0.55, -0.15, 0, -0.35),
  }
  const stare: Part = merge(flinch, {
    chest: [0.04, 0.12, 0], neck: [0.1, 0.18, 0], head: [0.2, 0.25, -0.05],
    L: { t: [0.38, 0.96, 0.14], pole: [1, -0.2, -0.8], fl: CURL_GRIP }, R: { t: [-0.38, 0.96, 0.14], pole: [-1, -0.2, -0.8], fl: CURL_GRIP },
  }, ears(0.25, -0.05, 0, 0.0))
  const P = keys(t, STAND, [
    [0, {}],
    [0.3, {}],
    [0.47, flinch, EXP_OUT],
    [2.4, flinch],
    [3.4, stare],
    [4.0, merge(stare, { head: [0.22, 0.25, -0.06] })],
  ])
  const hold = ramp(t, 0.3, 0.42) * (1 - ramp(t, 2.3, 2.8))
  P.tremor = hold
  P.earDyn = 1 - 0.85 * hold
  P.jaw = 0.02 + 0.06 * bump(t, 0.3, 0.6)
  if (t > 2.6) breathe(P, t / 4, 2.5, 0.8 * ramp(t, 2.6, 3.0))
  void tm
  return P
}

// 16. standFromChair：坐在椅子上（椅面 0.46），双手按膝、膝盖分开 → 往前晃第一下没起来（坐回去）→ 第二下更猛、双手撑膝把肥胖的身体从椅子上抬起
//     （3.4 s 站直，髋移到脚上方，脚不动）→ 左脚往前挪一小步站稳 → 喘口气、右手扶肚子。
//     片段结束时 root 骨在原点（站着）；开始时 root 骨在 z −STAND_Z（坐在 CHEF_SEAT 上）——同迎宾女郎 sitDesk 的约定，AI 播完不用挪实体
const SEAT_HIP_DY = CHEF_SEAT.y + 0.13 - HIP_Y
const STAND_Z = CHEF_STAND_FROM
/** 关键帧编写用「椅子空间」（椅面中心 z −0.06）；站起后的姿势写在最终 root 空间再整体前移 STAND_Z */
const SEATED: Part = {
  hipsP: [0, SEAT_HIP_DY, -0.04], hipsR: [-0.08, 0, 0], spine: [0.02, 0, 0], chest: [0.06, 0, 0], neck: [0.12, 0, 0], head: [0.1, 0, 0],
  legL: { p: [0.3, 0, 0.42], yw: 0.5, ph: 0 }, legR: { p: [-0.3, 0, 0.42], yw: -0.5, ph: 0 }, bellyP: [0, 0.035, 0.015], bellyS: 0.96,
}
/** Part 里所有 root 空间位置（髋、脚、手臂 t / g / pp）沿 z 平移 */
function fwd(p: Part, dz: number): Part {
  const o = merge(p) as any, sh = (v?: number[]) => (v ? [v[0], v[1], v[2] + dz] : v)
  if (o.hipsP) o.hipsP = sh(o.hipsP)
  for (const k of ['legL', 'legR']) if (o[k]?.p) o[k].p = sh(o[k].p)
  for (const k of ['L', 'R']) if (o[k]) for (const f of ['t', 'g', 'pp']) if (o[k][f]) o[k][f] = sh(o[k][f])
  return o
}
/** 起身途中：双手从膝上推离，悬在大腿前（手腕目标直接给，椅子空间） */
const RISE_HANDS: Part = merge(KNEES, { L: { kw: 0, t: [0.34, 0.8, 0.5] }, R: { kw: 0, t: [-0.34, 0.8, 0.5] } })
function standPose(t: number): ChefAnimPose {
  const rock = (k: number): Part => ({ hipsR: [-0.08 + 0.5 * k, 0, 0], spine: [0.02 + 0.12 * k, 0, 0], chest: [0.06 + 0.06 * k, 0, 0], neck: [0.12 - 0.05 * k, 0, 0], hipsP: [0, SEAT_HIP_DY, -0.04 + 0.04 * k] })
  const RFOOT: Part = { legR: { p: [-0.3, 0, 0.42 - STAND_Z], yw: -0.5 } }
  const up1 = fwd(merge({ hipsP: [0, -0.03, 0.02], hipsR: [0.18, 0, 0], spine: [0.06, 0, 0], chest: [0.02, 0, 0] }, HANG, { legL: { p: [0.3, 0, 0.42 - STAND_Z], yw: 0.5 } }, RFOOT, ears(0.1, 0.12, 0, 0.1)), STAND_Z)
  const up2 = fwd(merge({ hipsP: [0.0, -0.01, 0], hipsR: [0.02, 0, 0] }, HANG, { legL: { p: [0.18, 0, TOE[2] + 0.05], yw: 0.25 } }, RFOOT, ears(0.05, 0.12, 0, 0.1)), STAND_Z)
  const up3 = fwd(merge({ hipsP: [0.0, -0.006, 0], hipsR: [0.02, 0, 0] }, HANG, armPart(-1, palmOnBelly(-1, -0.14, 1.0, [0.6, -0.5, 0.2], 0.022, CURL_BELLY)), { legL: { p: [0.18, 0, TOE[2] + 0.05], yw: 0.25 } }, RFOOT, { neck: [0.05, 0, 0], head: [0.08, 0, 0] }, ears(0.05, 0.12, 0, 0.1)), STAND_Z)
  const P = keys(t, BASE, [
    [0, merge(SEATED, THIGHS, ears(0.12, 0.15, 0, 0.15))],
    [0.9, merge(SEATED, THIGHS, ears(0.12, 0.15, 0, 0.15))],
    [1.45, merge(SEATED, THIGHS, rock(0.7), ears(0.2, 0.1, 0, 0.1))],
    [1.95, merge(SEATED, THIGHS, rock(0.05), ears(0.05, 0.15, 0, 0.2))],
    [2.4, merge(SEATED, KNEES, rock(1.0), ears(0.22, 0.08, 0, 0.1))],
    [2.9, merge(SEATED, KNEES, { hipsP: [0, SEAT_HIP_DY * 0.45, 0.16], hipsR: [0.78, 0, 0], spine: [0.26, 0, 0], chest: [0.16, 0, 0], neck: [-0.08, 0, 0], head: [0.06, 0, 0] }, ears(0.22, 0.08, 0, 0.1))],
    [3.15, merge(SEATED, RISE_HANDS, { hipsP: [0, SEAT_HIP_DY * 0.18, 0.24], hipsR: [0.5, 0, 0], spine: [0.14, 0, 0], chest: [0.08, 0, 0], neck: [-0.02, 0, 0], head: [0.08, 0, 0] }, { legL: { p: [0.3, 0, 0.42], yw: 0.5 }, legR: { p: [-0.3, 0, 0.42], yw: -0.5 } }, ears(0.15, 0.1, 0, 0.1))],
    [3.4, up1],
    [3.9, up2],
    [5.0, up3],
  ])
  // 椅子空间 → 根空间：root 骨从 −STAND_Z 走到 0（随起身），所有 root 空间位置同步减去（世界位置不变，脚不滑）
  const k = ramp(t, 2.5, 3.6), R = -STAND_Z * (1 - k)
  P.root = [0, 0, R]
  const dz = -STAND_Z - R
  P.hipsP[2] += dz; P.legL.p[2] += dz; P.legR.p[2] += dz
  for (const A of [P.L, P.R]) { A.t[2] += dz; A.g[2] += dz; A.pp[2] += dz }
  // 喘
  const pant = ramp(t, 3.3, 3.8)
  P.chest[0] -= 0.02 * pant * Math.sin(t * TAU * 1.5); P.bellyS += 0.03 * pant * Math.sin(t * TAU * 1.5); P.jaw = 0.02 + 0.1 * pant * (0.5 + 0.5 * Math.sin(t * TAU * 1.5))
  const eff = bump(t, 2.3, 3.3); P.jaw += 0.12 * eff
  if (t < 2.4) breathe(P, t / 2.4, 2, 0.8)
  return P
}

// 17. holdCabbage（附图姿势，循环）：右手掌心朝上托着紫甘蓝举在右胸前，低头看它、吻部朝前下；左手垂在肚子旁；
//     2.0–3.4 s 把甘蓝凑近猪鼻闻一下（头前探、鼻子抽），耳朵各自抖
const CAB_R: Part = { R: { t: [-0.2, 1.2, 0.36], pole: [-0.8, 0.7, -0.3], hq: hQ(-1, [0.5, 0.15, 0.85], [-0.1, -0.95, 0.2]), hw: 1, fl: CURL_CUP, tab: 0.05, pw: 0, gw: 0 } }
const CAB_HEAD: Part = { neck: [0.16, -0.06, 0], head: [0.3, -0.18, 0.05], chest: [0.0, -0.06, 0] }
function cabbagePose(t: number, u: number): ChefAnimPose {
  const near: Part = { R: { t: [-0.14, 1.32, 0.36] }, neck: [0.2, -0.08, 0], head: [0.22, -0.22, 0.05] }
  const P = keys(t, STAND, [
    [0, merge(CAB_R, CAB_HEAD, ears(0.12, 0.12, 0, 0.12))],
    [1.9, merge(CAB_R, CAB_HEAD, ears(0.12, 0.12, 0, 0.12))],
    [2.6, merge(CAB_R, CAB_HEAD, near, ears(0.2, 0.08, 0, 0.1))],
    [3.3, merge(CAB_R, CAB_HEAD, near, ears(0.2, 0.08, 0, 0.1))],
    [4.1, merge(CAB_R, CAB_HEAD, ears(0.12, 0.12, 0, 0.12))],
    [5.0, merge(CAB_R, CAB_HEAD, ears(0.12, 0.12, 0, 0.12))],
  ])
  breathe(P, u, 2)
  const sn = bump(t, 2.6, 3.3)
  P.head[0] += 0.03 * sn * Math.max(0, Math.sin((t - 2.6) * TAU * 5)); P.jaw = 0.02 + 0.02 * sn
  earFlick(P.earL, t, 0.8, 0.8); earFlick(P.earR, t, 4.2, 0.9)
  P.props.cabbage = 1
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
export const chefIkResidual = () => ({ ..._res })
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
function setFingers(A: ChefArm, fl: number[], tab: number) {
  FINGERS.forEach((f, i) => A.fingers[f].forEach((b, k) => b.quaternion.setFromAxisAngle(b.userData.flexAxis as THREE.Vector3, fl[i * 3 + k] ?? 0)))
  if (tab) { const d = HANDS[A.side].F.d; A.fingers.thumb[0].quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...d), tab)) }
}
function fkRel(b: THREE.Object3D, stop: THREE.Object3D): THREE.Vector3 {
  if (b === stop) return new THREE.Vector3()
  const chain: THREE.Object3D[] = []; for (let x: THREE.Object3D | null = b; x && x !== stop; x = x.parent) chain.push(x)
  const p = new THREE.Vector3(), q = new THREE.Quaternion()
  for (let i = chain.length - 1; i >= 0; i--) { p.add(chain[i].position.clone().applyQuaternion(q)); q.multiply(chain[i].quaternion) }
  return p
}
/** 捏合点（手骨局部）：拇指远节 / 食指远节骨原点中点，再向指尖方向推 8 mm */
function pinchLocal(A: ChefArm) {
  const th = fkRel(A.fingers.thumb[2], A.wrist), ix = fkRel(A.fingers.index[2], A.wrist)
  return th.lerp(ix, 0.5).addScaledVector(v3(HANDS[A.side].F.a), 0.008)
}
/** 肚子二阶位移（root 空间，当前帧；applySoft 之后有效） */
const _bellyOff = new THREE.Vector3()
function solveArm(rig: ChefRig, A: ChefArm, s: number, P: CArmPose) {
  const root = rig.root
  setE(A.clav, P.clav)
  setFingers(A, P.fl, P.tab)
  const S = fk(A.shoulder, root).p
  const qWorld = new THREE.Quaternion(...P.hq)
  const T = v3(P.t)
  if (P.gw > 0) T.lerp(v3(P.g).sub(pinchLocal(A).applyQuaternion(qWorld)), c01(P.gw))
  if (P.pw > 0) T.lerp(v3(P.pp).sub(palmLocal(s, P.pk).applyQuaternion(qWorld)), c01(P.pw))
  if (P.kw > 0) { const knee = fk(rig.bones['shin' + SN(P.ks >= 0 ? 1 : -1)], root).p.add(v3(P.ko)); T.lerp(knee.sub(palmLocal(s, 0).applyQuaternion(qWorld)), c01(P.kw)) }
  if (P.bk > 0) T.addScaledVector(_bellyOff, c01(P.bk))
  const { Ru, Rf, miss } = twoBone(S, T, LU, LF, P.pole, ARM_REST[s], 0.1)
  _res.arm = Math.max(_res.arm, miss)
  setRootQ(A.shoulder, root, Ru)
  A.elbow.quaternion.copy(Ru.clone().invert().multiply(Rf))
  const qW = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.wr[0], P.wr[1], P.wr[2], 'YXZ'))
  const qHand = qWorld.multiply(qW), qFollow = Rf.clone().multiply(qW)
  const qFinal = P.hw >= 1 ? qHand : qFollow.slerp(qHand, c01(P.hw))
  A.wrist.quaternion.copy(Rf.clone().invert().multiply(qFinal))
}
const _ax = new THREE.Vector3(1, 0, 0), _ay = new THREE.Vector3(0, 1, 0), _az = new THREE.Vector3(0, 0, 1)
/** 踝位置（root 空间）：脚掌点 + 偏航 + 俯仰（ph > 0 绕脚掌、< 0 绕脚跟） */
function ankleOf(L: CLegPose, s: number): THREE.Vector3 {
  const qy = new THREE.Quaternion().setFromAxisAngle(_ay, L.yw)
  const toeJ = v3(L.p).add(new THREE.Vector3(0, TOE_H, 0))
  const oA = v3([FOOT_A[0] * s, FOOT_A[1], FOOT_A[2]]).applyQuaternion(qy), oH = v3([FOOT_H[0] * s, FOOT_H[1], FOOT_H[2]]).applyQuaternion(qy)
  const qp = new THREE.Quaternion().setFromAxisAngle(_ax.clone().applyQuaternion(qy), L.ph)
  return L.ph >= 0 ? toeJ.clone().add(oA.applyQuaternion(qp)) : toeJ.clone().add(oH).add(oA.clone().sub(oH).applyQuaternion(qp))
}
/** 膝极向：沿脚尖方向（脚尖外开 → 膝也外开，胖子蹲 / 坐时膝分开）、略向上 */
function legPole(L: CLegPose, s: number): THREE.Vector3 {
  const qy = new THREE.Quaternion().setFromAxisAngle(_ay, L.yw * 1.15 + s * 0.08)
  return new THREE.Vector3(0, 0, 1).applyQuaternion(qy).add(new THREE.Vector3(0, 0.15, 0))
}
function solveLeg(rig: ChefRig, s: number, P: CLegPose) {
  const root = rig.root, S = SN(s), bn = rig.bones
  const thigh = bn['thigh' + S], shin = bn['shin' + S], foot = bn['foot' + S], toe = bn['toe' + S]
  const qy = new THREE.Quaternion().setFromAxisAngle(_ay, P.yw)
  const qp = new THREE.Quaternion().setFromAxisAngle(_ax.clone().applyQuaternion(qy), P.ph)
  const ankle = ankleOf(P, s)
  const H = fk(thigh, root).p
  const pole = legPole(P, s)
  const { Ru, Rf, miss } = twoBone(H, ankle, LT, LS, [pole.x, pole.y, pole.z], LEG_REST[s], 0.2)
  _res.leg = Math.max(_res.leg, miss)
  setRootQ(thigh, root, Ru)
  shin.quaternion.copy(Ru.clone().invert().multiply(Rf))
  const qFoot = qp.clone().multiply(qy)
  foot.quaternion.copy(Rf.clone().invert().multiply(qFoot))
  toe.quaternion.setFromAxisAngle(_ax, -Math.max(0, P.ph) * P.tf)
}

// ---------- 二阶：围裙（下摆骨）/ 肚子 / 双下巴 / 帽 / 猪耳 ----------
interface Spring3 { x: THREE.Vector3; v: THREE.Vector3; last: THREE.Vector3; lastV: THREE.Vector3 }
interface EarDyn { th: number[]; v: number[]; last: THREE.Vector3; lastV: THREE.Vector3 }
interface Dyn { init: boolean; hem: number[]; hemV: number[]; belly: Spring3; chin: Spring3; hat: Spring3; ear: Record<number, EarDyn> }
const sp3 = (): Spring3 => ({ x: new THREE.Vector3(), v: new THREE.Vector3(), last: new THREE.Vector3(), lastV: new THREE.Vector3() })
function dynOf(rig: ChefRig): Dyn {
  const R = rig as ChefRig & { __cdyn?: Dyn }
  const ed = (): EarDyn => ({ th: [0, 0, 0], v: [0, 0, 0], last: new THREE.Vector3(), lastV: new THREE.Vector3() })
  return (R.__cdyn ??= { init: false, hem: [0, 0, 0, 0], hemV: [0, 0, 0, 0], belly: sp3(), chin: sp3(), hat: sp3(), ear: { 1: ed(), [-1]: ed() } })
}
export function resetChefDynamics(rig: ChefRig) {
  const d = dynOf(rig); d.init = false; d.hem.fill(0); d.hemV.fill(0)
  for (const S of [d.belly, d.chin, d.hat]) { S.x.set(0, 0, 0); S.v.set(0, 0, 0); S.lastV.set(0, 0, 0) }
  for (const s of [1, -1]) { const e = d.ear[s]; e.th.fill(0); e.v.fill(0); e.lastV.set(0, 0, 0) }
}
/** 下摆骨目标（围裙 + 衣摆后 / 侧下沿）：大腿方向（hips 空间）的前屈 / 外展 → 跟随（前屈 0.97–1.02、后伸 0.9、外展 0.7） */
function hemTarget(rig: ChefRig, s: number): [number, number] {
  const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(rig.bones['thigh' + SN(s)].quaternion)
  const flex = Math.atan2(dir.z, -dir.y), abd = Math.atan2(dir.x, Math.hypot(dir.y, dir.z))
  const k = flex > 0 ? mix(0.97, 1.02, ss((flex - 0.3) / 0.8)) : 0.9
  return [flex * k, abd * 0.7]
}
function applyHem(rig: ChefRig, dt: number | undefined) {
  const D = dynOf(rig)
  for (const s of [1, -1]) {
    const i = s > 0 ? 0 : 2, [fx, ab] = hemTarget(rig, s)
    if (dt === undefined || !D.init) { D.hem[i] = fx; D.hem[i + 1] = ab; D.hemV[i] = 0; D.hemV[i + 1] = 0 }
    else if (dt > 0) {
      const h = Math.min(dt, 0.05), K = 200, Cd = 16
      for (const [j, tg] of [[i, fx], [i + 1, ab]] as [number, number][]) { D.hemV[j] += (K * (tg - D.hem[j]) - Cd * D.hemV[j]) * h; D.hem[j] += D.hemV[j] * h }
      if (fx > 0) D.hem[i] = clamp(D.hem[i], fx * 0.9, fx + 0.04) // [修订] 起身伸髋时也不许超前大腿太多（后摆不压进大腿后侧）
      else D.hem[i] = Math.min(D.hem[i], fx * 0.8)
    }
    const b = rig.bones['hem' + SN(s)]
    b.rotation.order = 'XYZ'; b.rotation.set(-D.hem[i], 0, D.hem[i + 1])
  }
}
/** 位移弹簧：点 pt（root 空间）的加速度 → 换到父骨局部（qParent）→ 惯性位移（滞后、回弹） */
function stepSpring(S: Spring3, pt: THREE.Vector3, qParent: THREE.Quaternion, dt: number | undefined, init: boolean, f: number, zeta: number, gain: number, lim: number) {
  if (dt && dt > 0 && init) {
    const vel = pt.clone().sub(S.last).divideScalar(dt)
    const acc = vel.clone().sub(S.lastV).divideScalar(dt).clampLength(0, 60).applyQuaternion(qParent.clone().invert())
    const K = (TAU * f) ** 2, Cd = 2 * zeta * Math.sqrt(K)
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n
    for (let it = 0; it < n; it++) { S.v.addScaledVector(S.x, -K * h).addScaledVector(S.v, -Cd * h).addScaledVector(acc, -gain * h); S.x.addScaledVector(S.v, h); S.x.clampLength(0, lim) }
    S.lastV.copy(vel)
  } else if (!init || dt === undefined) { S.x.set(0, 0, 0); S.v.set(0, 0, 0); S.lastV.set(0, 0, 0) }
  S.last.copy(pt)
}
const BELLY_REST = new THREE.Vector3(...subV(BELLY_C, JP('spine'))), CHIN_REST = new THREE.Vector3(...subV(CHIN_C, JP('neck')))
const HAT_TOP_LOCAL = new THREE.Vector3(0, HAT.band + HAT.h, 0)
function applySoft(rig: ChefRig, P: ChefAnimPose, dt: number | undefined) {
  const D = dynOf(rig), root = rig.root
  // 肚子：重（低频、阻尼小、幅度大）；对竖直加速度更敏感（颠）
  const sp = fk(rig.spine, root), bc = v3(BELLY_C).sub(v3(JP('spine'))).applyQuaternion(sp.q).add(sp.p).add(v3(P.root))
  stepSpring(D.belly, bc, sp.q, dt, D.init, 2.1, 0.16, 1.0, 0.04)
  const bx = D.belly.x
  rig.belly.position.copy(BELLY_REST).add(v3(P.bellyP)).add(new THREE.Vector3(bx.x * 0.8, bx.y * 1.2, bx.z * 0.9))
  { const sq0 = fk(rig.spine, root).q; _bellyOff.copy(rig.belly.position).sub(BELLY_REST).applyQuaternion(sq0) }
  const bs = P.bellyS
  // 往下坠时肚子略扁宽，往上抛时略收（体积感）
  const sq = clamp(-bx.y * 4, -0.06, 0.06)
  rig.belly.scale.set(1 + (bs - 1) * 0.6 + sq * 0.5, 1 + (bs - 1) * 0.5 - sq, bs + sq * 0.3)
  // 双下巴
  const nk = fk(rig.neck, root), cc = CHIN_REST.clone().applyQuaternion(nk.q).add(nk.p).add(v3(P.root))
  stepSpring(D.chin, cc, nk.q, dt, D.init, 3.0, 0.2, 0.8, 0.018)
  rig.chin.position.copy(CHIN_REST).add(v3(P.chinP)).add(D.chin.x)
  // 帽：帽顶点的惯性 → 绕帽箍转（小角度）
  const hd = fk(rig.head, root), ht = HAT_TOP_LOCAL.clone().add(v3(subV(HAT.c, HEAD_J))).applyQuaternion(hd.q).add(hd.p).add(v3(P.root))
  stepSpring(D.hat, ht, hd.q, dt, D.init, 2.6, 0.15, 1.0, 0.05)
  const hl = HAT.band + HAT.h
  rig.hat.rotation.set(clamp(D.hat.x.z / hl, -0.2, 0.2), 0, clamp(-D.hat.x.x / hl, -0.2, 0.2))
  rig.jaw.rotation.set(clamp(P.jaw, 0, 0.6), 0, 0)
}
// ---------- [chef stage 2 修订] 下腹托起 + 围裙两节下摆（深蹲 / 坐下不互穿）----------
//   全在 hips 局部坐标里算（原点 = 髋骨原点）。腿胶囊与 check:chef-anim 同一套（大腿 0.12 → 0.095、小腿 0.095 → 0.08），外加 DR_M 余量。
const HIPS_J = v3(JP('hips')), DR_M = 0.012
const THIGH_J: Record<number, THREE.Vector3> = { 1: v3(JP('thighL')), [-1]: v3(JP('thighR')) }
const KNEE_OFF = v3(JP('shinL')).sub(v3(JP('thighL'))), ANK_OFF = v3(JP('footL')).sub(v3(JP('shinL')))
/** 下腹 / 腰带前沿采样点（静止，厨师空间）+ tuck 份额：托起量按「最深的那个点刚好离开大腿」求 */
const TUCK_SMP: Record<number, { p: THREE.Vector3; w: number }[]> = { 1: [], [-1]: [] }
{
  for (let y = 0.85; y <= 1.03; y += 0.025) for (let x = -0.26; x <= 0.261; x += 0.026) {
    if (coatCore(x, y, 0) > 0) continue
    let lo = 0, hi = 0.7
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (coatCore(x, y, m) < 0) lo = m; else hi = m }
    for (const dz of [0.006, 0.02]) { // 衣面 + 腰带 / 围裙上沿（在衣面外 ~1–2 cm）
      const p = new THREE.Vector3(x, y, lo + dz), w = tuckShare(x, y, lo)
      for (const s of [1, -1]) { const ws = w * (s > 0 ? tuckSide(x) : 1 - tuckSide(x)); if (ws > 0.2) TUCK_SMP[s].push({ p, w: ws }) }
    }
  }
}
const coneDepth = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number) => {
  const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1)
  return ra + (rb - ra) * t - p.distanceTo(a.clone().addScaledVector(ab, t))
}
interface LegG { H: THREE.Vector3; H2: THREE.Vector3; K: THREE.Vector3; A: THREE.Vector3; d: THREE.Vector3; nf: THREE.Vector3; qT: THREE.Quaternion; flex: number }
function legGeom(rig: ChefRig, s: number): LegG {
  const th = rig.bones['thigh' + SN(s)], sh = rig.bones['shin' + SN(s)]
  const H = th.position.clone(), qT = th.quaternion.clone(), qS = qT.clone().multiply(sh.quaternion)
  const K = H.clone().add(KNEE_OFF.clone().applyQuaternion(qT)), A = K.clone().add(ANK_OFF.clone().applyQuaternion(qS))
  const d = K.clone().sub(H).normalize()
  const nf = new THREE.Vector3(0, 0, 1).applyQuaternion(qT); nf.addScaledVector(d, -nf.dot(d)).normalize()
  return { H, H2: H.clone().lerp(K, 0.14), K, A, d, nf, qT, flex: Math.atan2(d.z, -d.y) }
}
const legDepthH = (p: THREE.Vector3, g: LegG) => Math.max(coneDepth(p, g.H2, g.K, 0.12, 0.095), coneDepth(p, g.K, g.A, 0.095, 0.08))
const _drD0: Record<number, number[]> = { 1: [], [-1]: [] }
function applyDrape(rig: ChefRig) {
  const sp = rig.spine, be = rig.belly
  const qSB = sp.quaternion.clone().multiply(be.quaternion), qSBi = qSB.clone().invert()
  /** 跟肚子走（spine → belly，含缩放）后的位置（hips 局部） */
  const Mb = (p: THREE.Vector3) => p.clone().sub(v3(BELLY_C)).multiply(be.scale).applyQuaternion(be.quaternion).add(be.position).applyQuaternion(sp.quaternion).add(sp.position)
  const Mh = (p: THREE.Vector3) => p.clone().sub(HIPS_J)
  const G: Record<number, LegG> = { 1: legGeom(rig, 1), [-1]: legGeom(rig, -1) }
  const T: Record<number, THREE.Vector3> = { 1: new THREE.Vector3(), [-1]: new THREE.Vector3() }
  for (const s of [1, -1]) {
    const g = G[s], u = g.nf.clone()
    // 静止时已有的深度（腰带侧沿本来就贴着大腿根），扣掉
    const D0 = _drD0[s].length ? _drD0[s] : (_drD0[s] = TUCK_SMP[s].map(({ p }) => Math.max(0, legDepthH(Mh(p), legGeom0(s)))))
    let a = 0
    TUCK_SMP[s].forEach(({ p, w }, i) => {
      const lim = D0[i] - DR_M
      for (const q of [Mh(p), Mb(p)]) {
        if (legDepthH(q.clone().addScaledVector(u, a * w), g) <= lim) continue
        let lo = a, hi = 0.3
        if (legDepthH(q.clone().addScaledVector(u, hi * w), g) > lim) { a = hi; continue }
        for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (legDepthH(q.clone().addScaledVector(u, m * w), g) > lim) lo = m; else hi = m }
        a = hi
      }
    })
    T[s].copy(u).multiplyScalar(a)
    const tb = rig.bones['tuck' + SN(s)]
    tb.position.copy(v3(TUCK_C(s)).sub(v3(BELLY_C))).add(T[s].clone().applyQuaternion(qSBi).divide(be.scale))
  }
  // 围裙前片两节：上节终点（膝上）离大腿的高度、下节往前翻的程度都按围裙真实采样点逐步试到不碰腿为止
  const gDown = new THREE.Vector3(0, -1, 0).applyQuaternion(rig.root.quaternion.clone().multiply(rig.hips.quaternion).invert())
  for (const s of [1, -1]) {
    const g = G[s], S = SN(s), sm = AP_SMP[s]
    const A0 = new THREE.Vector3(s * AP_PIV.x, AP_PIV.yU, AP_PIV.z), D0 = new THREE.Vector3(s * AP_PIV.x, AP_PIV.yD, AP_PIV.z)
    const tw = tuckShare(A0.x, A0.y, A0.z - 0.02) * (s > 0 ? tuckSide(A0.x) : 1 - tuckSide(A0.x))
    const A = Mh(A0).multiplyScalar(1 - tw).add(Mb(A0).add(T[s]).multiplyScalar(tw))
    const Kr = g.H.clone().add(D0.clone().sub(THIGH_J[s]).applyQuaternion(g.qT))
    const fk2 = ss((g.flex - 0.3) / 0.6)
    const lat = new THREE.Vector3().crossVectors(g.nf, g.d).normalize()
    const bu = rig.bones['apU' + S], bd = rig.bones['apD' + S], Lu = AP_PIV.yU - AP_PIV.yD
    const sc = new THREE.Vector3(1 + 0.2 * fk2, 1, 1 - 0.5 * fk2) // 屈髋时前片绷平、略展宽（两侧不往下卷进大腿）
    const bad = (pts: THREE.Vector3[], d0: number[], o: THREE.Vector3, P0: THREE.Vector3, q: THREE.Quaternion, scl: THREE.Vector3) => {
      let m = -1; pts.forEach((p, i) => { m = Math.max(m, legDepthH(p.clone().sub(P0).multiply(scl).applyQuaternion(q).add(o), g) - d0[i]) }); return m
    }
    let K = Kr.clone(), A1 = A.clone()
    search: for (let e = 0; e <= 0.1001; e += 0.02) { // 腰带附近（前片两侧往后卷）还碰：枢轴再沿大腿「前」方向抬
      A1 = A.clone().addScaledVector(g.nf, e * fk2)
      for (let c = 0.11; c <= 0.26; c += 0.015) {
        K = Kr.clone().lerp(g.K.clone().addScaledVector(g.nf, c).addScaledVector(g.d, 0.02), fk2)
        const ab = K.clone().sub(A1), L = ab.length()
        sc.y = clamp(L / Lu, 0.4, 1.3); alignSeg(bu.quaternion, ab.normalize(), lat, fk2)
        if (fk2 <= 0 || bad(sm.up, sm.up0, A1, A0, bu.quaternion, sc) <= 0) break search
      }
    }
    A.copy(A1)
    bu.position.copy(A); bu.scale.copy(sc)
    // 下节：刚性跟大腿 → 按重力垂（屈髋越大越垂）；碰到膝 / 小腿就往大腿方向（前）翻
    const dG = new THREE.Vector3(0, -1, 0).applyQuaternion(g.qT).lerp(gDown, fk2).normalize()
    const sd = new THREE.Vector3(sc.x, 1, sc.z), dD = dG.clone()
    for (let t = 0; t <= 1.001; t += 0.08) {
      dD.copy(dG).lerp(g.d, t).normalize()
      alignSeg(bd.quaternion, dD, lat, fk2)
      if (fk2 <= 0 || bad(sm.lo, sm.lo0, K, D0, bd.quaternion, sd) <= 0) break
    }
    bd.position.copy(K); bd.scale.copy(sd)
  }
}
/** 围裙前片采样点（静止，厨师空间）：上节 / 下节各一组 + 静止时离腿的深度 */
const AP_SMP: Record<number, { up: THREE.Vector3[]; lo: THREE.Vector3[]; up0: number[]; lo0: number[] }> = {} as any
for (const s of [1, -1]) {
  const up: THREE.Vector3[] = [], lo: THREE.Vector3[] = []
  for (const th of [-0.2, 0, 0.2, 0.4, 0.6, 0.75]) {
    for (const y of [0.845, 0.8, 0.75, 0.7, 0.65]) up.push(v3(apronPoint(s * th, y)))
    for (const y of [0.53, 0.5, 0.47, 0.44]) lo.push(v3(apronPoint(s * th, y)))
  }
  const g0 = legGeom0(s), d0 = (p: THREE.Vector3) => Math.max(0, legDepthH(p.clone().sub(HIPS_J), g0))
  AP_SMP[s] = { up, lo, up0: up.map(d0), lo0: lo.map(d0) }
}
/** 节骨朝向：局部 −y → v；屈髋（k）时再绕节轴扭到「围裙宽度方向 = 大腿横向 lat」（腿外开时前片跟着转，不斜压在大腿内侧） */
function alignSeg(q: THREE.Quaternion, v: THREE.Vector3, lat: THREE.Vector3, k: number) {
  q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), v)
  if (k <= 0) return
  const y = v.clone().negate(), x = lat.clone().addScaledVector(y, -lat.dot(y))
  if (x.lengthSq() < 1e-6) return
  x.normalize()
  const qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)))
  q.slerp(qb, k)
}
/** 静止腿（hips 局部） */
function legGeom0(s: number): LegG {
  const H = THIGH_J[s].clone().sub(HIPS_J), K = H.clone().add(KNEE_OFF), A = K.clone().add(ANK_OFF), d = K.clone().sub(H).normalize()
  return { H, H2: H.clone().lerp(K, 0.14), K, A, d, nf: new THREE.Vector3(0, 0, 1), qT: new THREE.Quaternion(), flex: 0 }
}
/** 猪耳：耳根姿态 + 惯性。弹簧 th = [前后, 侧摆, 折耳尖]，驱动 = 耳中点加速度（头局部） */
const EAR_K = (TAU * 2.2) ** 2, EAR_C = 2 * 0.2 * Math.sqrt(EAR_K)
const EAR_MID_LOCAL: Record<number, THREE.Vector3> = {}
function applyEars(rig: ChefRig, P: ChefAnimPose, head: Xf, dt: number | undefined) {
  const D = dynOf(rig)
  for (const s of [1, -1]) {
    const E = s > 0 ? P.earL : P.earR, bones = s > 0 ? rig.earL : rig.earR, ed = D.ear[s]
    const b0 = BONES[B['ear' + SN(s) + '0']].pos, b2 = BONES[B['ear' + SN(s) + '2']].pos
    const axis = v3(nz(subV(b2, b0)))
    EAR_MID_LOCAL[s] ??= v3(b2).sub(v3(HEAD_J))
    const mid = EAR_MID_LOCAL[s].clone().applyQuaternion(head.q).add(head.p).add(v3(P.root))
    if (dt && dt > 0 && D.init) {
      const vel = mid.clone().sub(ed.last).divideScalar(dt)
      const acc = vel.clone().sub(ed.lastV).divideScalar(dt).clampLength(0, 60)
      const al = acc.applyQuaternion(head.q.clone().invert())
      const g = 8 * c01(P.earDyn)
      const drive = [-g * al.z - 0.4 * g * al.y, s * g * al.x, -0.7 * g * al.y]
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n
      const Kk = EAR_K * (P.earDyn < 0.5 ? 3 : 1)
      for (let it = 0; it < n; it++) for (let j = 0; j < 3; j++) { ed.v[j] += (-Kk * ed.th[j] - EAR_C * ed.v[j] + drive[j]) * h; ed.th[j] = clamp(ed.th[j] + ed.v[j] * h, -0.6, 0.6) }
      ed.lastV.copy(vel)
    } else if (!D.init || dt === undefined) { ed.th.fill(0); ed.v.fill(0); ed.lastV.set(0, 0, 0) }
    ed.last.copy(mid)
    const th = ed.th
    // 耳根（ear0）：前后（绕横轴，+ = 耳朵往前扣）、外张（绕前后轴，+ = 向外下耷拉）、扭转（绕耳轴）
    const q0 = new THREE.Quaternion().setFromAxisAngle(_ax, E.pitch + 0.35 * th[0])
      .multiply(new THREE.Quaternion().setFromAxisAngle(_az, -s * (E.splay + 0.35 * th[1])))
      .multiply(new THREE.Quaternion().setFromAxisAngle(axis, s * E.twist))
    bones[0].quaternion.copy(q0)
    // 中段 / 折下的耳尖：bend（+ = 耳尖再往前下折）+ 惯性（越到耳尖越大）
    const b1 = new THREE.Quaternion().setFromAxisAngle(_ax, E.bend * 0.4 + 0.5 * (th[0] + th[2])).multiply(new THREE.Quaternion().setFromAxisAngle(_az, -s * 0.5 * th[1]))
    const b2q = new THREE.Quaternion().setFromAxisAngle(_ax, E.bend * 0.8 + 0.9 * (th[0] + th[2])).multiply(new THREE.Quaternion().setFromAxisAngle(_az, -s * 0.8 * th[1]))
    bones[1].quaternion.copy(b1); bones[2].quaternion.copy(b2q)
  }
}

// ---------- 道具 ----------
interface PropState { plate: THREE.Group; wallKnife: THREE.Group; rope: THREE.Mesh; bolt: THREE.Group; victim: THREE.Group; vomit: THREE.Group; tongue: THREE.Mesh }
const PM = {
  plate: litMaterial({ color: '#efe9dc', roughness: 0.25 }), stew: litMaterial({ color: '#5a1a12', roughness: 0.2 }), meat: litMaterial({ color: '#7a2c22', roughness: 0.5 }),
  rope: litMaterial({ color: '#9c8558', roughness: 0.9 }), iron: litMaterial({ color: '#3a3836', roughness: 0.5, metalness: 0.7 } as THREE.MeshLambertMaterialParameters),
  cloth: litMaterial({ color: '#4b5560', roughness: 0.9 }), skin: litMaterial({ color: '#b89a86', roughness: 0.7 }), hair: litMaterial({ color: '#2a201a', roughness: 0.9 }), jeans: litMaterial({ color: '#2b3442', roughness: 0.9 }),
  vomit: litMaterial({ color: '#4a0e0a', roughness: 0.15, transparent: true, opacity: 0.88 } as THREE.MeshLambertMaterialParameters),
  tongue: litMaterial({ color: '#b65a64', roughness: 0.3 }),
}
function props(rig: ChefRig): PropState {
  const R = rig as ChefRig & { __cprops?: PropState }
  if (R.__cprops) return R.__cprops
  const mk = (g: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o }
  // 盘子（原点 = 盘底中心）：浅瓷盘 + 一勺炖菜 + 两块肉
  const plate = new THREE.Group(); plate.name = 'chefPlate'
  { const pts = [[0, 0], [CHEF_PLATE.r * 0.62, 0], [CHEF_PLATE.r * 0.7, 0.006], [CHEF_PLATE.r, CHEF_PLATE.h], [CHEF_PLATE.r - 0.004, CHEF_PLATE.h + 0.002], [CHEF_PLATE.r * 0.66, 0.009], [0, 0.009]].map(([x, y]) => new THREE.Vector2(x, y))
    plate.add(mk(new THREE.LatheGeometry(pts, 36), PM.plate))
    const st = mk(new THREE.SphereGeometry(0.075, 20, 8, 0, TAU, 0, 0.5), PM.stew); st.scale.set(1, 0.35, 1); st.position.y = -0.008; plate.add(st)
    for (const [x, z] of [[0.025, 0.01], [-0.02, -0.02]]) { const m = mk(new THREE.DodecahedronGeometry(0.022, 0), PM.meat); m.position.set(x, 0.022, z); m.scale.set(1, 0.7, 1); plate.add(m) } }
  // 刀墙上的那把雕刻刀（刀尖朝下、刀面贴墙）
  const wallKnife = buildCarvingKnife(); wallKnife.name = 'chefWallKnife'
  wallKnife.position.set(...CHEF_WALL_KNIFE_GRIP); wallKnife.rotation.set(0, 0, Math.PI)
  // 绳子（每帧重建管）
  const rope = mk(new THREE.BufferGeometry(), PM.rope); rope.name = 'chefRope'
  // 门闩（横插销 0.3 m + 拨钮），原点 = 拨钮
  const bolt = new THREE.Group(); bolt.name = 'chefBolt'
  { const bar = mk(new THREE.BoxGeometry(0.3, 0.028, 0.022), PM.iron); bar.position.set(0.1, 0, 0.022); bolt.add(bar)
    const kn = mk(new THREE.CylinderGeometry(0.009, 0.009, 0.035, 10), PM.iron); kn.rotation.x = Math.PI / 2; kn.position.set(0, 0, 0.0); bolt.add(kn) }
  // 被拖的人（灰色假人，低模）：原点 = 后领（被攥住的点）；躯干 / 头 / 两条腿每帧摆
  const victim = new THREE.Group(); victim.name = 'chefVictim'
  { const torso = mk(new THREE.CapsuleGeometry(0.15, 0.42, 4, 12), PM.cloth); torso.name = 'torso'; torso.scale.set(1, 1, 0.65); victim.add(torso)
    const head = mk(new THREE.SphereGeometry(0.1, 16, 12), PM.hair); head.name = 'head'; victim.add(head)
    for (const n of ['legL', 'legR']) { const l = mk(new THREE.CapsuleGeometry(0.065, 0.7, 4, 10), PM.jeans); l.name = n; victim.add(l) }
    for (const n of ['armL', 'armR']) { const a = mk(new THREE.CapsuleGeometry(0.045, 0.45, 4, 8), PM.cloth); a.name = n; victim.add(a) } }
  // 浆液流：一根管 + 锅面上的涟漪
  const vomit = new THREE.Group(); vomit.name = 'chefVomit'
  { const st = mk(new THREE.CylinderGeometry(1, 0.7, 1, 12, 1, true), PM.vomit); st.name = 'stream'; vomit.add(st)
    const sp = mk(new THREE.CircleGeometry(1, 20), PM.vomit); sp.name = 'splash'; sp.rotation.x = -Math.PI / 2; vomit.add(sp) }
  // 舌头（挂 jaw）：粉色扁胶囊，从口里朝前伸
  const tongue = mk(new THREE.CapsuleGeometry(0.016, 0.05, 4, 10), PM.tongue); tongue.name = 'chefTongue'; tongue.scale.set(1.3, 1, 0.55)
  for (const o of [plate, wallKnife, rope, bolt, victim, vomit]) { o.visible = false; rig.root.add(o) }
  tongue.visible = false; rig.jaw.add(tongue)
  R.__cprops = { plate, wallKnife, rope, bolt, victim, vomit, tongue }
  return R.__cprops
}
function palmPoint(rig: ChefRig, A: ChefArm, s: number, pk: number): THREE.Vector3 { const hx = fk(A.wrist, rig.root); return palmLocal(s, pk).applyQuaternion(hx.q).add(hx.p) }
function pinchPoint(rig: ChefRig, A: ChefArm): THREE.Vector3 { const hx = fk(A.wrist, rig.root); return pinchLocal(A).applyQuaternion(hx.q).add(hx.p) }
export function chefPalmPoint(rig: ChefRig, s = -1, pk = 0) { return palmPoint(rig, s > 0 ? rig.armL : rig.armR, s, pk) }
export function chefPinchPoint(rig: ChefRig, s = -1) { return pinchPoint(rig, s > 0 ? rig.armL : rig.armR) }
/** 手持件柄轴（root 空间单位向量）与该手拳眼轴 r 的夹角（弧度；验收用）——柄要从拳眼穿出 */
export function chefGripAngle(rig: ChefRig, name: 'pot' | 'knife' | 'ladle'): number {
  const g = rig.props[name], hand = g.parent as THREE.Object3D
  const hx = fk(hand, rig.root), s = hand === rig.armL.wrist ? 1 : -1
  const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(hx.q.clone().multiply(g.quaternion)), r = v3(HANDS[s].F.r).applyQuaternion(hx.q)
  return Math.acos(Math.min(1, Math.abs(ax.dot(r))))
}
/** 把手持件柄轴转向 aim（root 空间），w 权重；保持 chefMesh 默认握点 */
function aimProp(rig: ChefRig, g: THREE.Object3D, aim: V3, w: number) {
  g.userData.gq0 ??= g.quaternion.clone()
  const q0 = g.userData.gq0 as THREE.Quaternion
  if (w <= 0.001) { g.quaternion.copy(q0); return }
  const hq = fk(g.parent!, rig.root).q
  const d0 = new THREE.Vector3(0, 1, 0).applyQuaternion(q0), d1 = v3(nz(aim)).applyQuaternion(hq.clone().invert())
  const qa = new THREE.Quaternion().setFromUnitVectors(d0, d1).multiply(q0)
  g.quaternion.copy(q0).slerp(qa, c01(w))
}
const _ropeCache: { key: string } = { key: '' }
function ropePath(rig: ChefRig, pr: ChefPropsPose): THREE.Vector3[] {
  const L = pinchPoint(rig, rig.armL), Rr = pinchPoint(rig, rig.armR)
  const H = (s: number) => v3(HDL(s)), pts: THREE.Vector3[] = []
  // 绳头在左手 → 右把手（绕半圈）→ 左把手（按进度绕 0–2 圈）→ 右手
  // 打完结：两头绳尾从结上垂下来（不再连着手）
  const tied = pr.ropeKnot > 0.98, kc = H(-1).lerp(H(1), 0.5).add(new THREE.Vector3(0, -0.01, -0.02))
  pts.push(tied ? kc.clone().add(new THREE.Vector3(-0.03, -0.17, -0.01)) : L)
  const ring = (c: THREE.Vector3, a0: number, a1: number, r: number, n: number) => { for (let i = 0; i <= n; i++) { const a = mix(a0, a1, i / n); pts.push(new THREE.Vector3(c.x + r * Math.cos(a), c.y + r * Math.sin(a), c.z - 0.005 + 0.006 * i)) } }
  const wrapN = pr.ropeWrap * 2, knot = pr.ropeKnot
  ring(H(-1), Math.PI * 0.5, -Math.PI * 0.5, 0.02, 6)
  if (wrapN > 0.05) ring(H(1), -Math.PI * 0.5, -Math.PI * 0.5 + TAU * wrapN, 0.02 + 0.004 * pr.ropeWrap, Math.max(4, Math.round(16 * wrapN)))
  if (knot > 0.05) { const c = H(-1).lerp(H(1), 0.5).add(new THREE.Vector3(0, -0.01, -0.02)); ring(c, 0, TAU * knot, 0.018, 10) }
  pts.push(tied ? kc.clone().add(new THREE.Vector3(0.035, -0.14, -0.012)) : Rr)
  return pts
}
function applyProps(rig: ChefRig, P: ChefAnimPose) {
  const st = props(rig), pr = P.props
  // 手持件（chefMesh 挂手）
  rig.props.ladle.visible = pr.ladle > 0.5; rig.props.pot.visible = pr.pot > 0.5; rig.props.knife.visible = pr.knife > 0.5
  rig.props.cabbage.visible = pr.cabbage > 0.5; rig.props.meat.visible = pr.meat > 0.5
  aimProp(rig, rig.props.ladle, pr.ladleAim, pr.ladle > 0.5 ? pr.ladleAimW : 0)
  aimProp(rig, rig.props.pot, pr.potAim, pr.pot > 0.5 ? pr.potAimW : 0)
  aimProp(rig, rig.props.knife, pr.knifeAim, pr.knife > 0.5 ? pr.knifeAimW : 0)
  // 盘子：双手托着 = 两掌心中点（盘底在掌心高度）；放下后在 plateP
  st.plate.visible = pr.plate > 0.5
  if (st.plate.visible) {
    if (pr.plateHold > 0.5) {
      const a = palmPoint(rig, rig.armL, 1, 0), b = palmPoint(rig, rig.armR, -1, 0), c = a.clone().add(b).multiplyScalar(0.5)
      const d = a.clone().sub(b); d.y = 0
      st.plate.position.set(c.x, c.y - CHEF_PLATE.h / 2 + 0.002, c.z + 0.03); st.plate.quaternion.setFromAxisAngle(_ay, Math.atan2(-d.z, d.x))
    } else { st.plate.position.set(pr.plateP[0], pr.plateP[1] - CHEF_PLATE.h / 2, pr.plateP[2]); st.plate.quaternion.identity() }
  }
  st.wallKnife.visible = pr.wallKnife > 0.5
  // 绳子
  st.rope.visible = pr.rope > 0.5
  if (st.rope.visible) {
    const pts = ropePath(rig, pr)
    const key = pts.map((p) => p.toArray().map((x) => x.toFixed(4)).join(',')).join(';')
    if (key !== _ropeCache.key) {
      _ropeCache.key = key
      st.rope.geometry.dispose()
      st.rope.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Math.min(160, pts.length * 4), 0.009, 6, false)
    }
  }
  // 门闩（只在绑门片段里出现）
  st.bolt.visible = pr.rope > 0.5
  if (st.bolt.visible) st.bolt.position.set(pr.boltX, CHEF_DOOR.boltY, CHEF_DOOR.z - 0.045)
  // 被拖的人：后领 = 右手拳心；上半身被提起、屁股和腿拖在地上（身后）
  st.victim.visible = pr.victim > 0.5
  if (st.victim.visible) {
    const C0 = palmPoint(rig, rig.armR, -1, 1), hip = new THREE.Vector3(C0.x + 0.06, 0.13, C0.z - 0.62)
    st.victim.position.set(0, 0, 0)
    const seg = (o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, L: number) => { o.position.copy(a).lerp(b, 0.5); o.quaternion.setFromUnitVectors(_ay, b.clone().sub(a).normalize()); o.scale.y = a.distanceTo(b) / L }
    const shoulder = C0.clone().add(new THREE.Vector3(0, -0.06, -0.04))
    seg(st.victim.getObjectByName('torso')!, shoulder, hip, 0.72)
    st.victim.getObjectByName('head')!.position.copy(C0).add(new THREE.Vector3(0.0, 0.0, 0.1))
    const dirB = hip.clone().sub(shoulder).normalize()
    for (const [n, x] of [['legL', 0.09], ['legR', -0.09]] as [string, number][]) seg(st.victim.getObjectByName(n)!, hip.clone().add(new THREE.Vector3(x, -0.04, 0)), hip.clone().add(new THREE.Vector3(x * 1.4, -0.06, -0.82)), 0.83)
    for (const [n, x] of [['armL', 0.17], ['armR', -0.17]] as [string, number][]) seg(st.victim.getObjectByName(n)!, shoulder.clone().add(new THREE.Vector3(x, -0.02, 0)).addScaledVector(dirB, 0.05), shoulder.clone().add(new THREE.Vector3(x * 1.8, -0.12, -0.1)).addScaledVector(dirB, 0.4), 0.54)
  }
  // 浆液流：嘴（下颌口缝）→ 锅面
  st.vomit.visible = pr.vomit > 0.02
  if (st.vomit.visible) {
    const jx = fk(rig.jaw, rig.root), m = MOUTH_LOCAL.clone().applyQuaternion(jx.q).add(jx.p)
    const R0 = CHEF_CAULDRON.c, rr = Math.min(CHEF_CAULDRON.rIn - 0.04, Math.hypot(m.x - R0[0], m.z - R0[2]))
    const a = Math.atan2(m.z - R0[2], m.x - R0[0]), hit = new THREE.Vector3(R0[0] + rr * Math.cos(a), CHEF_CAULDRON.surf + 0.002, R0[2] + rr * Math.sin(a))
    const sm = st.vomit.getObjectByName('stream')!, sp = st.vomit.getObjectByName('splash')!
    const L = m.distanceTo(hit), r = 0.016 * Math.sqrt(pr.vomit)
    sm.position.copy(m).lerp(hit, 0.5); sm.quaternion.setFromUnitVectors(_ay, m.clone().sub(hit).normalize()); sm.scale.set(r, L, r)
    sp.position.copy(hit); sp.scale.setScalar(0.03 + 0.05 * pr.vomit)
  }
  // 舌头：口缝前沿往前伸（挂 jaw）
  st.tongue.visible = pr.tongue > 0.05
  if (st.tongue.visible) {
    const k = pr.tongue, base = MOUTH_LOCAL.clone().add(new THREE.Vector3(0, 0.004, -0.02))
    st.tongue.position.copy(base).add(new THREE.Vector3(0, -0.006 * k, 0.032 * k)); st.tongue.rotation.set(Math.PI / 2 + 0.25, 0, 0)
    st.tongue.scale.set(1.3, 0.4 + 0.8 * k, 0.55)
  }
}
/** 口缝前沿（jaw 骨局部）：吻部下方、鼻盘后 */
const MOUTH_LOCAL = new THREE.Vector3(0, 1.548 - 1.585, 0.27 - 0.17)

// ---------- 应用 ----------
export function applyChefPose(rig: ChefRig, P: ChefAnimPose, o: ChefAnimOpts = {}) {
  const root = rig.root
  _res.arm = 0; _res.leg = 0
  root.position.set(P.root[0], P.root[1], P.root[2]); setE(root, P.rootR)
  const hr = rig.hips.userData.rest as { p: THREE.Vector3 }
  rig.hips.position.set(hr.p.x + P.hipsP[0], hr.p.y + P.hipsP[1], hr.p.z + P.hipsP[2]); setE(rig.hips, P.hipsR)
  setE(rig.spine, P.spine); setE(rig.chest, P.chest); setE(rig.neck, P.neck)
  const tm = o.time ?? 0, tr = P.tremor
  setE(rig.head, tr > 0.001 ? addV(P.head, [0.012 * tr * Math.sin(tm * 61), 0.015 * tr * Math.sin(tm * 47 + 1.3), 0.01 * tr * Math.sin(tm * 53 + 2.1)]) : P.head)
  solveLeg(rig, 1, P.legL); solveLeg(rig, -1, P.legR)
  applyHem(rig, o.dt)
  applySoft(rig, P, o.dt)
  applyDrape(rig)
  solveArm(rig, rig.armL, 1, P.L)
  solveArm(rig, rig.armR, -1, P.R)
  const head = fk(rig.head, root)
  applyEars(rig, P, head, o.dt)
  applyProps(rig, P)
  dynOf(rig).init = true
}
export function animateChef(rig: ChefRig, clip: ChefClip, t: number, opts: ChefAnimOpts = {}) {
  const P = chefPose(clip, t, opts)
  applyChefPose(rig, P, { ...opts, time: opts.time ?? t })
  return P
}
/** 预览 / 截图：从 t − pre 起按 1/60 s 推进二阶，得到与连续播放一致的确定帧（非循环片段最早从 0 起） */
export function animateChefPreroll(rig: ChefRig, clip: ChefClip, t: number, opts: ChefAnimOpts = {}, pre = 1.0) {
  const C0 = CHEF_CLIPS[clip], h = 1 / 60
  let t0 = t - pre; if (!C0.loop) t0 = Math.max(0, t0)
  resetChefDynamics(rig)
  let P: ChefAnimPose | null = null
  for (let x = t0; x <= t + 1e-6; x += h) P = animateChef(rig, clip, x, { ...opts, time: x, dt: x === t0 ? undefined : h })
  return P!
}

// ---------- 运行时动画器 ----------
export interface ChefAnimator {
  play(clip: ChefClip, fade?: number): void
  update(dt: number, opts?: ChefAnimOpts): void
  readonly clip: ChefClip; readonly time: number; readonly done: boolean; readonly pose: ChefAnimPose
  /** 本帧根运动（root 空间 [dx, dz]）：AI 把它转到世界、加到实体位置上 */
  readonly rootDelta: [number, number]
}
export function createChefAnimator(obj: THREE.Object3D, seed = 1): ChefAnimator {
  const rig = obj.userData.chef as ChefRig
  let clip: ChefClip = 'idle', time = 0, gt = 0, fadeT = 1, fadeDur = 0
  let prev = chefPose('idle', 0, { seed }), last = deepClone(prev), rd: [number, number] = [0, 0]
  return {
    get clip() { return clip }, get time() { return time }, get pose() { return last }, get rootDelta() { return rd },
    get done() { const C0 = CHEF_CLIPS[clip]; return !C0.loop && time >= C0.dur },
    play(c, fade) {
      if (c === clip && CHEF_CLIPS[c].loop) return
      prev = deepClone(last); clip = c; time = 0; fadeT = 0; fadeDur = fade ?? CHEF_CLIPS[c].blend
    },
    update(dt, opts = {}) {
      rd = chefRootMotion(clip, time, time + dt)
      time += dt; gt += dt; fadeT += dt
      let P = chefPose(clip, time, { seed, ...opts, time: gt })
      if (fadeT < fadeDur) P = mixChefPose(prev, P, ss(fadeT / fadeDur))
      last = P
      applyChefPose(rig, P, { seed, ...opts, time: gt, dt })
    },
  }
}
void CURL_FLAT; void noise1; void mixV; void qRot; void CURL_TAP
