// [beast stage 2] 第五层的野兽（Entity 18 / The Beast of Level 5）阶段 2 动画：程序化关键帧 / 曲线（不接 AI）。结构沿用行李员 bellhopAnim。
// 用法：
//   const an = createBeastAnimator(group)              // group = buildBeast() 的返回（userData.beast）
//   an.play('handshake')                               // 片段间 0.2 s 交叉混合（含形态 / 色素 / 淡出参数）
//   an.update(dt, { target: [x, y, z] })               // 每帧；target = 注视 / 抓取目标（root 空间）
//   an.flash(1)                                        // 叠加一次恼怒变色（变白 → 云纹 + 红褐斑块；任何片段上都可以叠）
//   an.fade                                            // 当前不透明度 0..1（vanish 淡出；动画器已经改了材质，渲染侧也可以自己用）
// 无状态入口（预览 / 截图 / AI 自己管时间）：
//   animateBeast(rig, clip, t, opts) / animateBeastPreroll(rig, clip, t, opts, pre)   // 后者先推进二阶（触须摆动 / 下摆 / 色素时间）
//   beastPose(clip, t, opts) → BeastPose（纯函数）；mixBeastPose(a, b, k)
// 结构：
//   · 姿态量都在 root 骨空间（+Z 正面、+Y 上、地面 y=0、+X = 角色左侧），可线性混合；躯干 / 颈 / 头为欧拉角（YXZ）。
//   · 每帧先 setBeastForm(rig, P.form)（它把腿 / 髋 / 脊 / 颈 / 腕 / 外套膜 / 触须骨复位并叠真身变换），再在上面叠姿态：
//     髋位置 = setBeastForm 之后的位置（真身抬高）+ hipsP；锁骨按 1/sS 抵消真身躯干的纵向拉伸（手臂不被剪切，IK 照常）。
//   · 手臂：两骨 IK（腕目标 / 捏合点 g / 掌心 pp + 肘极向），手朝向 = root / 胸空间四元数混合；手指按 curl 屈伸。
//     手持物（茶壶、钢笔）每帧按「实际解出的手」放置（壶把在拳心、笔在拇指 / 食指远节之间），够不到也不会脱手。
//   · 腿：脚掌点 + 两骨 IK（膝朝前）；坐姿 = 髋下沉到椅面 + 脚掌点前移，IK 自动屈膝。下摆骨 hemL/R 跟大腿屈伸（坐下时西装下摆落在腿上）+ 二阶滞后。
//   · 触须（10 条 × 9 节）：叠加在 setBeastForm 结果上（局部旋转）：
//       ① 重力补偿：根节按头的俯仰 / 侧倾反向转一部分 → 点头 / 歪头时触须仍大致下垂（不往衬衫里戳）；
//       ② 二阶滞后：口下 15 cm 的点在 root 空间的加速度（含转头）→ 每条一个弹簧（1.4–1.8 Hz、ζ 0.3），越到末端权重越大；
//       ③ 程序摆动：沿长度传播的慢波（只向前摆，不向后压进领带）+ 末端卷曲缓慢起伏 + 说话轻颤（tremble）；
//       ④ hold = 停摆（doubtFreeze），reach = 一起向前探（handshake），lift = 向前上翻卷（恼怒 / 真身）。
//       ⑤ 避让：摆完之后关节 / 节中点 / 尖映射回胸骨静止空间，查烘好的「身体 + 领口环」距离场，近于半径 + 4 mm 就转父节推出去
//         （转头 / 歪头 / 低头时触须不再扫进衬衫、领带、领口；头 v3 变大后根部位置变了也自动适应）。
//     tentacleGrab：左长触腕（i = 8）按「根 → 被抓物表面」二次曲线（弧长 = 柄长，柄可伸缩、自动拱起）+ 触腕穗沿被抓物表面（半径 grabR）从顶部缠下去。
//   · 坐姿桌面接触：P.desk > 0 时，手指尖 / 指根低于桌面 + 7 mm 就逐根松开手指、仍低就整手抬高重解（捏笔时拇指 / 食指不松）。
//   · 握持：钢笔放在拇指 / 食指指腹中点（CURL_PINCH 下两指腹中心距 2.5 cm = 笔径 + 两指厚，真正夹住）；茶壶把在拳心。
//   · 色素 v2（仿真实头足类，不整体染色）：每帧写 BEAST_CHROMA（全局共享 uniform；同屏多只野兽会同色——游戏里只有一只）。
//     着色器里每个色素细胞（约 3.4 mm，黄 / 橙 / 红褐 / 深褐）按局部「激活场」各自扩张 / 收缩；激活场 = expand（整体）+ amp（慢斑驳，speed 漂移）
//     + patch（大斑块 / 浅斑纹）+ cloud（流动云纹：从外套膜尖端经头流向触须，cloudSpeed m/s、cloudFreq rad/m）+ sweep / sweepK（单道云纹位置 / 强度）
//     + eyeRing（眼周深色环）+ edge（外套膜 / 鳍深色镶边）；blanch = 色素全收缩急速变白；hue + 红褐优先、dark 深褐优先；tentWave 触须色波加强；
//     irid 虹彩（收缩处更明显）。tint / tintK 旧版整体着色，保留兼容、各片段不用。
//   · 淡出：P.fade < 1 时把这只野兽的材质换成各自的克隆（共享 shader 补丁）并设透明度；beastVanishState(t) 给 AI / 渲染侧同步变暗、淡出、后退距离。
import * as THREE from 'three'
import { setBeastForm, BEAST_CHROMA, type BeastRig, type BeastArm } from './beastMesh'
import { BONES, B, BH_HAND, TENTS, warpBH, bhSdfW, add, scl, sub, nrm, cross, dot, lenv, type V3 } from './beastRig'
import { bodySdf, NECK_HOLE } from './beastBody'
import { tentR } from './beastHead'
import { buildBellhopTea } from './bellhopProps'
import { buildBeastTeapot, BEAST_TEAPOT } from './beastProps'
import { litMaterial } from './shared'

export type BeastClip = 'idle' | 'seatedIdle' | 'talk' | 'beckon' | 'handshake' | 'pourTea' | 'signContract' | 'peripheralStill' | 'vanish' | 'portraitGaze' | 'doubtFreeze' | 'reveal' | 'tentacleGrab' | 'colorFlash'
export interface BeastClipInfo { dur: number; loop: boolean; zh: string; seated?: boolean; form?: number }
export const BEAST_CLIPS: Record<BeastClip, BeastClipInfo> = {
  idle: { dur: 6.0, loop: true, zh: '站立待客' },
  seatedIdle: { dur: 6.0, loop: true, zh: '坐在书桌后', seated: true },
  talk: { dur: 4.0, loop: true, zh: '说话手势' },
  beckon: { dur: 2.6, loop: false, zh: '招手「进来，快进来」' },
  handshake: { dur: 3.6, loop: false, zh: '握手（触须前探 + 一道云纹）' },
  pourTea: { dur: 7.0, loop: false, zh: '倒茶并推杯', seated: true },
  signContract: { dur: 6.4, loop: false, zh: '推契约、递笔', seated: true },
  peripheralStill: { dur: 4.0, loop: true, zh: '余光里静立盯视' },
  vanish: { dur: 2.4, loop: false, zh: '后退隐入暗处' },
  portraitGaze: { dur: 6.0, loop: true, zh: '画像：头眼跟随' },
  doubtFreeze: { dur: 4.4, loop: false, zh: '被怀疑：僵住「哦。呃…？」' },
  reveal: { dur: 3.6, loop: false, zh: '变真身' },
  tentacleGrab: { dur: 3.6, loop: false, zh: '真身触腕缠抓', form: 1 },
  colorFlash: { dur: 2.4, loop: false, zh: '恼怒变色（变白 → 云纹 → 红褐）' },
}

type Q4 = [number, number, number, number]
export interface BArmPose {
  t: V3; tc: V3; cs: number; pole: V3
  hq: Q4; hqc: Q4; hw: number; wr: V3
  curl: number[]; clav: V3
  /** 捏合点（拇指 / 食指远节之间）目标（root 空间），gw 权重 */
  g: V3; gw: number
  /** 掌心 / 拳心目标（root 空间），pw 权重；pk 0 = 掌心、1 = 拳心 */
  pp: V3; pw: number; pk: number
}
export interface BLegPose { p: V3; ph: number; yw: number; tf: number }
export interface BeastChroma {
  amp: number; speed: number; expand: number; tint: V3; tintK: number; irid: number
  patch: number; cloud: number; cloudFreq: number; cloudSpeed: number; sweep: number; sweepK: number
  blanch: number; eyeRing: number; edge: number; hue: number; dark: number; tentWave: number
}
export interface BeastTentPose { sway: number; tremble: number; hold: number; reach: number; lift: number }
/** 长触腕缠抓：k 权重、目标（root 空间）、coil 触腕穗卷起 0..1、held 目标已被抓住（随触腕走） */
export interface BeastGrab { k: number; T: V3; coil: number; held: number; /** 被抓物半径（米）：柄停在表面、触腕穗沿表面缠绕 */ r: number }
export interface BeastProps {
  /** 茶壶：显隐、拿在右手（1）/ 放桌上（0）、桌上位置、倾倒角（rad，壶嘴朝下为正）、拿着时的目标位置（壶底中心）、茶流 */
  pot: number; potHold: number; potDesk: V3; potP: V3; potTilt: number; stream: number
  /** 茶杯 + 茶碟（桌上，碟底中心）*/
  cup: number; cupP: V3
  /** 契约（桌上，纸面中心）、偏航；钢笔：显隐、在右手（1）/ 桌上、桌上位置 */
  contract: number; contractP: V3; contractYaw: number
  pen: number; penHold: number; penDesk: V3
}
export interface BeastPose {
  root: V3; rootR: V3; hipsP: V3; hipsR: V3; spine: V3; chest: V3; neck: V3; head: V3
  L: BArmPose; R: BArmPose; legL: BLegPose; legR: BLegPose
  /** 眼球偏转（yaw, pitch；rad） */
  eyes: [number, number]
  form: number; fade: number
  /** 桌面高度（坐姿片段 = 0.75；0 = 没有桌子）：手指 / 手掌不许穿进桌面 */
  desk: number
  chroma: BeastChroma; tent: BeastTentPose; grab: BeastGrab; props: BeastProps
}
export interface BeastAnimOpts {
  /** 注视目标（root 空间）：portraitGaze / peripheralStill 用；也用作 tentacleGrab 的抓取点 */
  target?: V3
  /** tentacleGrab 抓取点（root 空间，覆盖 target）；默认身前 1.9 m、胸高 */
  grabTarget?: V3
  /** [beast stage 3] handshake 握点（root 空间，掌心目标）：AI 按玩家手的真实位置给；省略 = BEAST_SHAKE_P */
  shakeP?: V3
  /** tentacleGrab 被抓物半径（米，默认 0.11 = 预览球；玩家躯干约 0.16） */
  grabR?: number
  /** 叠加闪色强度（0..1，动画器 flash() 自动给） */
  flash?: number
  seed?: number
  /** 二阶步长（秒）；省略 = 不推进二阶 */
  dt?: number
  /** 全局时间（抖动 / 摆动相位） */
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
const v3 = (a: V3 | THREE.Vector3) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]))
const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z]
const qArr = (q: THREE.Quaternion): Q4 => [q.x, q.y, q.z, q.w]
const Q_ID: Q4 = [0, 0, 0, 1]
const hash1 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
function basisQuat(x0: V3, y0: V3, x1: V3, y1: V3): THREE.Quaternion {
  const mk = (x: V3, y: V3) => { const X = v3(x).normalize(), Y = v3(y); Y.addScaledVector(X, -Y.dot(X)).normalize(); const Z = new THREE.Vector3().crossVectors(X, Y); return new THREE.Matrix4().makeBasis(X, Y, Z) }
  const a = mk(x0, y0), b = mk(x1, y1)
  return new THREE.Quaternion().setFromRotationMatrix(b.multiply(a.transpose()))
}

// ---------- 静止量（野兽空间）----------
const JP = (n: string): V3 => BONES[B[n]].pos
const SN = (s: number) => (s > 0 ? 'L' : 'R')
const SH = (s: number) => JP('upperArm' + SN(s)), EL = (s: number) => JP('foreArm' + SN(s)), WR = (s: number) => JP('hand' + SN(s))
const LU = lenv(sub(EL(1), SH(1))), LF = lenv(sub(WR(1), EL(1)))
const LT = lenv(sub(JP('shinL'), JP('thighL'))), LS = lenv(sub(JP('footL'), JP('shinL')))
const TOE = JP('toeL'), ANK = JP('footL')
const TOE_H = TOE[1]
const FOOT_A: V3 = sub(ANK, TOE)
const FOOT_H: V3 = [ANK[0] - TOE[0], -TOE_H, ANK[2] - 0.045 - TOE[2]]
export const BEAST_FOOT_REST = (s: number): V3 => [TOE[0] * s, 0, TOE[2]]
/** 手部坐标系（野兽空间）：行李员手坐标系经 warpBH（含手放大）映射；a 指尖、d 手背、r 拇指侧 */
const HF: Record<number, { o: V3; a: V3; d: V3; r: V3 }> = {}
for (const s of [1, -1]) {
  const F = BH_HAND[s].F, o = warpBH(F.o, s)
  const dir = (v: V3) => nrm(sub(warpBH(add(F.o, scl(v, 0.02)), s), o))
  HF[s] = { o, a: dir(F.a), d: dir(F.d), r: dir(F.r) }
}
/** 手朝向：手指方向 aDir、手背方向 dDir（root / 胸空间）→ 手骨旋转 */
export function beastHandQuat(s: number, aDir: V3, dDir: V3): Q4 { return qArr(basisQuat(HF[s].a, HF[s].d, nrm(aDir), nrm(dDir))) }
const hQ = beastHandQuat
/** 掌心 / 拳心（手骨局部，静止手形）：pk 0 掌心表面、1 拳心（握把处） */
const PALM_LOCAL: Record<number, THREE.Vector3[]> = {}
for (const s of [1, -1]) {
  const F = BH_HAND[s].F, o = warpBH(F.o, s)
  PALM_LOCAL[s] = [0, 1].map((pk) => v3(sub(warpBH(add(add(add(F.o, scl(F.a, mix(0.072, 0.075, pk))), scl(F.d, mix(-0.024, -0.034, pk))), scl(F.r, mix(0, 0.006, pk))), s), o)))
}
const palmLocal = (s: number, pk: number) => PALM_LOCAL[s][0].clone().lerp(PALM_LOCAL[s][1], c01(pk))
const REST_FLEX: Record<string, number[]> = { thumb: [0.05, 0.16, 0.2], index: [0.18, 0.3, 0.18], middle: [0.22, 0.34, 0.2], ring: [0.27, 0.38, 0.22], pinky: [0.32, 0.42, 0.24] }
const FIST: Record<string, number[]> = { thumb: [0.4, 0.55, 0.5], index: [1.3, 1.45, 0.95], middle: [1.35, 1.5, 0.95], ring: [1.35, 1.5, 0.95], pinky: [1.4, 1.5, 0.95] }
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const
const CURL_RELAX = [0.12, 0.14, 0.17, 0.22, 0.27]
const CURL_FLAT = [-0.3, -0.85, -0.85, -0.8, -0.75]
const CURL_OPEN = [-0.1, -0.5, -0.45, -0.4, -0.35]
const CURL_GRIP = [0.62, 0.78, 0.82, 0.84, 0.86]
const CURL_PINCH = [0.42, 0.55, 0.85, 0.95, 0.9]
const CURL_CLAW = [0.3, 0.55, 0.6, 0.62, 0.65]

// ---------- 姿态：默认 / 克隆 / 混合 ----------
function restArm(s: number): BArmPose {
  const S = SH(s), E = EL(s), W = WR(s)
  const d = nrm(sub(W, S)), e = sub(E, S), k = dot(e, d)
  const pole = nrm(sub(e, scl(d, k)))
  return { t: [...W], tc: [...W], cs: 0, pole, hq: [...Q_ID], hqc: [...Q_ID], hw: 0, wr: [0, 0, 0], curl: [0, 0, 0, 0, 0], clav: [0, 0, 0], g: [...W], gw: 0, pp: [...W], pw: 0, pk: 0 }
}
const CH_CALM: BeastChroma = {
  amp: 0.3, speed: 1.0, expand: 0, tint: [0.69, 0.13, 0.11], tintK: 0, irid: 0.55,
  patch: 0.08, cloud: 0, cloudFreq: 57, cloudSpeed: 0.15, sweep: -1, sweepK: 0, blanch: 0, eyeRing: 0, edge: 0.15, hue: 0, dark: 0, tentWave: 0,
}
/** 色素姿态：平静底子上覆盖 */
const CH = (p: Partial<BeastChroma> = {}): BeastChroma => ({ ...CH_CALM, tint: [...CH_CALM.tint], ...p })
const DESK_Y = 0.75
export const BEAST_REST: BeastPose = {
  root: [0, 0, 0], rootR: [0, 0, 0], hipsP: [0, 0, 0], hipsR: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  L: restArm(1), R: restArm(-1), legL: { p: BEAST_FOOT_REST(1), ph: 0, yw: 0, tf: 1 }, legR: { p: BEAST_FOOT_REST(-1), ph: 0, yw: 0, tf: 1 },
  eyes: [0, 0], form: 0, fade: 1, desk: 0,
  chroma: { ...CH_CALM, tint: [...CH_CALM.tint] }, tent: { sway: 1, tremble: 0, hold: 0, reach: 0, lift: 0 }, grab: { k: 0, T: [0.15, 1.25, 1.9], coil: 0, held: 0, r: 0.11 },
  props: { pot: 0, potHold: 0, potDesk: [-0.2, DESK_Y, 0.37], potP: [-0.2, DESK_Y, 0.37], potTilt: 0, stream: 0, cup: 0, cupP: [0.02, DESK_Y, 0.47], contract: 0, contractP: [0.13, DESK_Y + 0.002, 0.32], contractYaw: Math.PI, pen: 0, penHold: 0, penDesk: [-0.21, DESK_Y + 0.006, 0.35] },
}
function deepClone<T>(x: T): T {
  if (Array.isArray(x)) return x.slice() as unknown as T
  if (x && typeof x === 'object') { const o: any = {}; for (const k in x) o[k] = deepClone((x as any)[k]); return o }
  return x
}
export const cloneBeastPose = (p: BeastPose) => deepClone(p)
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
export function mixBeastPose(a: BeastPose, b: BeastPose, k: number): BeastPose {
  if (k <= 0) return deepClone(a)
  if (k >= 1) return deepClone(b)
  const o = mixAny(a, b, k) as BeastPose
  // 手持状态是开关量：混合时取后者（避免道具在两处之间滑）
  o.props.potHold = b.props.potHold; o.props.penHold = b.props.penHold; o.grab.held = b.grab.held
  return o
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends number[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }
type Part = DeepPartial<BeastPose>
function over(base: BeastPose, p: Part): BeastPose {
  const o = deepClone(base) as any
  const rec = (dst: any, src: any) => { for (const k in src) { const v = src[k]; if (v === undefined) continue; if (v && typeof v === 'object' && !Array.isArray(v)) rec(dst[k], v); else dst[k] = Array.isArray(v) ? v.slice() : v } }
  rec(o, p); return o
}
/** 关键帧：[[t, partial], ...]，每帧都是 base 上的覆盖；段间 smoothstep */
function keys(t: number, base: BeastPose, ks: [number, Part][]): BeastPose {
  if (t <= ks[0][0]) return over(base, ks[0][1])
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const [t0, a] = ks[i - 1], [t1, b] = ks[i]
    return mixBeastPose(over(base, a), over(base, b), ss((t - t0) / (t1 - t0)))
  }
  return over(base, ks[ks.length - 1][1])
}

// ---------- 姿态底子 ----------
/** 站立待客：胸略挺、下巴微收；双手在腹前（将军肚上方）交叠：左手在下托住、右手覆在上 */
const CROSS: Part = {
  L: { t: [0.078, 1.06, 0.215], pole: [1, -0.35, -0.55], hq: hQ(1, [-1, -0.28, 0.2], [0.05, 0.2, 1]), hw: 1, curl: [0.15, 0.12, 0.15, 0.2, 0.25] },
  R: { t: [-0.066, 1.075, 0.242], pole: [-1, -0.35, -0.55], hq: hQ(-1, [1, -0.22, 0.22], [-0.05, 0.2, 1]), hw: 1, curl: [0.2, 0.05, 0.08, 0.12, 0.18] },
}
/** 把手臂腕目标改成胸空间（真身躯干拉长后手跟着胸走） */
const chestArms = (p: Part): Part => { const o = deepClone(p) as any; for (const S of ['L', 'R']) if (o[S] && o[S].t) { o[S].tc = o[S].t; o[S].cs = 1 } return o }
const HANG: Part = { L: { t: [0.258, 0.955, 0.035], pole: [0.3, -0.2, -1], hw: 0, curl: CURL_RELAX }, R: { t: [-0.258, 0.955, 0.035], pole: [-0.3, -0.2, -1], hw: 0, curl: CURL_RELAX } }
const STAND: BeastPose = over(BEAST_REST, { hipsP: [0, -0.004, 0], chest: [-0.03, 0, 0], neck: [0.02, 0, 0], head: [0.04, 0, 0], ...CROSS })
/** 坐姿：髋下沉到椅面（大腿近水平）、脚掌前移 → IK 屈膝；上身略前倾；双手交叠平放在桌上（左手在下、右手搭在左手背上） */
const SEAT_HIPS: Part = { hipsP: [0, -0.38, -0.075], spine: [0.05, 0, 0], chest: [0.03, 0, 0], neck: [0.0, 0, 0], head: [0.06, 0, 0], legL: { p: [0.135, 0, 0.47], ph: 0 }, legR: { p: [-0.135, 0, 0.47], ph: 0 } }
const DESK_L: Part = { L: { t: [0.085, DESK_Y + 0.035, 0.33], pole: [1, -0.6, -0.4], hq: hQ(1, [-0.9, -0.04, 0.45], [0.02, 1, 0.05]), hw: 1, curl: [0.1, -0.2, -0.15, -0.1, -0.05] } }
const DESK_R: Part = { R: { t: [-0.05, DESK_Y + 0.062, 0.355], pole: [-1, -0.6, -0.4], hq: hQ(-1, [0.9, -0.12, 0.42], [-0.02, 1, 0.05]), hw: 1, curl: [0.15, 0.0, 0.05, 0.1, 0.15] } }
const SEAT: BeastPose = over(BEAST_REST, { ...SEAT_HIPS, ...DESK_L, ...DESK_R, desk: DESK_Y })

// ---------- 片段 ----------
export function beastPose(clip: BeastClip, t: number, o: BeastAnimOpts = {}): BeastPose {
  const C = BEAST_CLIPS[clip]
  t = C.loop ? frac(t / C.dur) * C.dur : clamp(t, 0, C.dur)
  const u = t / C.dur
  let P: BeastPose
  switch (clip) {
    case 'idle': P = idlePose(u); break
    case 'seatedIdle': P = seatedIdlePose(u); break
    case 'talk': P = talkPose(t, u); break
    case 'beckon': P = beckonPose(t); break
    case 'handshake': P = handshakePose(t, o.shakeP); break
    case 'pourTea': P = pourPose(t); break
    case 'signContract': P = signPose(t); break
    case 'peripheralStill': P = peripheralPose(u, o); break
    case 'vanish': P = vanishPose(t); break
    case 'portraitGaze': P = portraitPose(u, o); break
    case 'doubtFreeze': P = doubtPose(t); break
    case 'reveal': P = revealPose(t); break
    case 'tentacleGrab': P = grabPose(t, o); break
    case 'colorFlash': P = flashPose(t); break
  }
  if (o.flash) addFlash(P, o.flash, o.time ?? t)
  return P
}
/** 叠加一次恼怒变色（k 从 1 衰减到 0，约 1.2 s）：开头约 0.15 s 急速变白 → 快速云纹 + 红褐斑块 + 眼环 / 镶边 → 回落；触须一阵上翻 */
function addFlash(P: BeastPose, k: number, time: number) {
  void time
  const c = P.chroma, ang = c01((k - 0.15) / 0.55)
  c.blanch = Math.max(c.blanch, c01((k - 0.87) / 0.13))
  c.cloud = Math.max(c.cloud, 0.85 * ang); c.cloudSpeed = Math.max(c.cloudSpeed, 0.15 + 0.35 * ang)
  c.expand = Math.max(c.expand, 0.65 * ang); c.patch = Math.max(c.patch, 0.6 * ang); c.hue = Math.max(c.hue, ang)
  c.eyeRing = Math.max(c.eyeRing, 1.1 * ang); c.edge = Math.max(c.edge, 0.9 * ang); c.tentWave = Math.max(c.tentWave, 0.6 * ang)
  P.tent.lift = Math.max(P.tent.lift, 0.4 * k); P.tent.tremble = Math.max(P.tent.tremble, 0.6 * k)
}
const mixV = (a: V3, b: V3, k: number): V3 => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)]
const breathe = (P: BeastPose, u: number, cycles: number, k = 1) => {
  const br = Math.sin(u * TAU * cycles) * k
  P.chest[0] -= 0.008 * br; P.spine[0] -= 0.003 * br; P.hipsP[1] += 0.0012 * br
  P.L.clav = [0, 0, 0.006 * br]; P.R.clav = [0, 0, -0.006 * br]
}

// 1. idle：站立待客；极轻呼吸 + 一次重心换脚 + 偶尔慢慢转头打量；触须慢摆、色素慢波
function idlePose(u: number): BeastPose {
  const P = deepClone(STAND)
  breathe(P, u, 1.5)
  const sh = Math.sin(u * TAU)
  P.hipsP[0] += 0.006 * sh; P.hipsR[2] -= 0.008 * sh; P.chest[2] += 0.004 * sh
  P.head[1] += 0.14 * bump(u, 0.5, 0.9); P.head[2] += 0.05 * bump(u, 0.55, 0.85); P.eyes = [0.12 * bump(u, 0.45, 0.88), 0]
  return P
}
// 2. seatedIdle：坐在书桌后，双手交叠桌上，头慢慢偏一下（打量来客），呼吸
function seatedIdlePose(u: number): BeastPose {
  const P = deepClone(SEAT)
  breathe(P, u, 1.5)
  P.head[1] += 0.1 * Math.sin(u * TAU); P.head[2] += 0.06 * bump(u, 0.2, 0.6); P.eyes = [0.1 * Math.sin(u * TAU + 0.6), 0]
  P.R.curl = [0.15, 0.05 * bump(u, 0.6, 0.75), 0.05 + 0.18 * bump(u, 0.62, 0.78), 0.1 + 0.15 * bump(u, 0.66, 0.82), 0.15] // 右手手指在左手背上轻敲一下
  return P
}
// 3. talk：两手轮流摊掌比划（掌心朝上、手指略张），头随语气小幅点动；触须随说话轻颤，色素波纹加快
const GEST = (s: number, k: number): Part => {
  const S = s > 0 ? 'L' : 'R'
  return { [S]: { t: [s * mix(0.2, 0.17, k), mix(1.0, 1.13, k), mix(0.16, 0.36, k)], pole: [s * 0.8, -1, -0.45], hq: hQ(s, [s * -0.25, 0.1, 1], [s * 0.15, -1, 0.15]), hw: 1, curl: CURL_OPEN, clav: [0, 0, s * 0.01 * k] } } as Part
}
function talkPose(t: number, u: number): BeastPose {
  const kR = bump(t, 0.25, 1.9) ** 0.7, kL = bump(t, 2.0, 3.7) ** 0.7
  const P = over(STAND, { ...GEST(-1, kR), ...GEST(1, kL) })
  breathe(P, u, 2)
  P.head[0] += 0.04 * Math.sin(t * TAU / 0.8) * (0.5 + 0.5 * Math.max(kR, kL)); P.head[1] += 0.08 * (kL - kR); P.head[2] += 0.03 * Math.sin(t * 2.3)
  P.chest[1] += 0.04 * (kL - kR)
  P.tent.tremble = 1; P.chroma = CH({ amp: 0.4, speed: 1.6, patch: 0.12, cloud: 0.2, cloudSpeed: 0.16 }) // 说话：轻微云纹
  return P
}
// 4. beckon：右手在胸前掌心朝上、四指连勾两下（「进来，快进来」），腕一抖一抖；左手往身侧一引；身体略后仰、头歪
function beckonPose(t: number): BeastPose {
  const UP: Part = { R: { t: [-0.15, 1.17, 0.4], pole: [-0.5, -1, -0.35], hq: hQ(-1, [0.15, 0.3, 1], [0.05, -1, 0.25]), hw: 1, curl: CURL_OPEN }, L: { t: [0.33, 1.02, 0.22], pole: [0.6, -1, -0.3], hq: hQ(1, [0.5, -0.05, 1], [0.7, -1, 0.1]), hw: 1, curl: CURL_OPEN } }
  const lean: Part = { hipsR: [-0.02, 0, 0], chest: [-0.06, 0.06, 0], head: [0.02, 0.04, 0.14] }
  const P = keys(t, STAND, [[0, {}], [0.45, { ...UP, ...lean }], [2.1, { ...UP, ...lean }], [2.6, {}]])
  // 两下勾指（0.6–1.05、1.15–1.6）
  let c = 0
  for (const t0 of [0.6, 1.15, 1.7]) c = Math.max(c, bump(t, t0, t0 + 0.45) * (t0 > 1.6 ? 0.7 : 1))
  const on = ramp(t, 0.35, 0.5) * (1 - ramp(t, 2.05, 2.3))
  P.R.curl = [-0.1, mix(-0.5, 1.15, c * on), mix(-0.45, 1.2, c * on), mix(-0.4, 1.2, c * on), mix(-0.35, 1.15, c * on)]
  P.R.wr = [-0.28 * c * on, 0, 0] // 勾指时手腕向身体一带
  P.head[0] += 0.05 * c * on; P.chest[0] += 0.015 * c * on
  P.chroma = CH({ amp: 0.38, speed: 1.5, patch: 0.1, cloud: 0.14, cloudSpeed: 0.16 })
  return P
}
// 5. handshake：伸右手（掌心朝左、拇指朝上）→ 握住（四指合拢）→ 上下摇两下 → 停 → 松开收回；触须同时一起向前探；握住瞬间一道云纹从外套膜扫到触须
export const BEAST_SHAKE_P: V3 = [-0.12, 1.08, 0.4]
function handshakePose(t: number, SP: V3 = BEAST_SHAKE_P): BeastPose {
  const out = (k: number): Part => ({ R: { pp: [SP[0], SP[1], SP[2]], pw: 1, pk: 0.3, pole: [-0.55, -1, -0.25], hq: hQ(-1, [0.18, -0.12, 1], [-1, 0.12, 0.05]), hw: 1, curl: k ? [0.55, 0.62, 0.66, 0.7, 0.72] : CURL_OPEN }, L: { t: [0.2, 1.04, 0.2], pole: [1, -0.4, -0.5], hq: hQ(1, [-0.6, -0.4, 0.6], [0.1, 0.2, 1]), hw: 1, curl: CURL_RELAX }, chest: [0.04, 0.05, 0], head: [0.1, 0.04, 0], hipsR: [0.03, 0, 0] })
  const P = keys(t, STAND, [[0, {}], [0.3, {}], [1.05, out(0)], [1.3, out(1)], [2.6, out(1)], [2.85, out(0)], [3.6, {}]])
  const pump = t > 1.3 && t < 2.5 ? 0.034 * Math.sin((t - 1.3) / 1.2 * TAU * 2) : 0
  P.R.pp = [P.R.pp[0], P.R.pp[1] + pump, P.R.pp[2]]
  P.tent.reach = ramp(t, 0.5, 1.3) * (1 - ramp(t, 2.7, 3.4))
  // 握住瞬间：一道深色云纹从外套膜尖端扫过头、顺触须流到末端（约 1 s）+ 一阵局部斑块，不整头变色
  const sw = (t - 1.28) / 1.0, swK = sw > 0 && sw < 1.15 ? Math.sin(Math.min(1, sw / 0.12) * Math.PI / 2) * (1 - ramp(sw, 0.85, 1.15)) : 0
  const lp = bump(t, 1.3, 2.4)
  P.chroma = CH({ sweep: -0.05 + 1.0 * c01(sw), sweepK: 2.0 * swK, patch: 0.08 + 0.35 * lp, hue: 0.25 * lp, amp: 0.3 + 0.15 * lp, irid: 0.55 + 0.2 * lp, tentWave: 0.6 })
  return P
}
// 6. pourTea（坐）：右手握壶把把茶壶从桌右侧提起 → 壶嘴对准茶杯倾倒（茶流）→ 放回 → 指尖把茶碟推向来客；左手一直平放桌上；头看杯再抬头看客人
const POT_HQ = hQ(-1, [0.22, -0.18, 1], [-1, 0.12, -0.05]) // 握壶把：手背朝外（-X）、拇指在上、四指从前面绕过竖把
const POUR_P: V3 = [-0.135, DESK_Y + 0.105, 0.47] // 倾倒时壶底中心
const PUSH_HQ = hQ(-1, [0.12, -0.9, 0.45], [-0.05, 0.45, 1]) // 指尖朝下抵住碟沿
/** 倒茶时的坐姿底子：两手分开平放桌上（左手在左前、右手在右前），中间留给茶杯 */
const POUR_BASE: BeastPose = over(SEAT, { L: { t: [0.2, DESK_Y + 0.034, 0.28], pole: [0.6, -1, -0.3], hq: hQ(1, [-0.3, -0.05, 1], [0.02, 1, 0.05]), hw: 1, curl: [0.1, -0.15, -0.1, -0.05, 0.0] }, R: { t: [-0.17, DESK_Y + 0.034, 0.27], pole: [-0.6, -1, -0.3], hq: hQ(-1, [0.3, -0.05, 1], [-0.02, 1, 0.05]), hw: 1, curl: [0.1, -0.15, -0.1, -0.05, 0.0] } })
export const BEAST_CUP_PUSH = 0.07
function pourPose(t: number): BeastPose {
  const PD = BEAST_REST.props.potDesk, CP = BEAST_REST.props.cupP
  const hold = (p: V3, curl: number[]): Part => ({ R: { pp: [p[0] + BEAST_TEAPOT.grip[0], p[1] + BEAST_TEAPOT.grip[1], p[2] + BEAST_TEAPOT.grip[2]], pw: 1, pk: 1, pole: [-0.35, -1, -0.25], hq: POT_HQ, hw: 1, curl } })
  const lift: V3 = [PD[0] + 0.02, DESK_Y + 0.07, PD[2] + 0.04]
  // 推杯：指尖抵住碟沿右后方（不压到杯上）
  const pushAt = (k: number): Part => ({ R: { g: [CP[0] - 0.058, CP[1] + 0.04, CP[2] - 0.058 + BEAST_CUP_PUSH * k], gw: 1, pole: [-0.35, -1, -0.25], hq: PUSH_HQ, hw: 1, curl: [0.3, 0.25, 0.3, 0.38, 0.45] } })
  const look = (y: number, p: number): Part => ({ head: [0.06 + p, y, 0], eyes: [0, p * 0.6] })
  const P = keys(t, POUR_BASE, [
    [0, { ...look(0, 0) }],
    [0.6, { ...look(-0.15, 0.12) }],
    [1.35, { ...hold(PD, CURL_OPEN), ...look(-0.25, 0.22) }],
    [1.6, { ...hold(PD, CURL_GRIP), ...look(-0.25, 0.22) }],
    [2.3, { ...hold(lift, CURL_GRIP), ...look(-0.12, 0.25), chest: [0.06, -0.04, 0] }],
    [2.75, { ...hold(POUR_P, CURL_GRIP), ...look(-0.05, 0.3), chest: [0.08, -0.04, 0] }],
    [4.15, { ...hold(POUR_P, CURL_GRIP), ...look(-0.05, 0.3), chest: [0.08, -0.04, 0] }],
    [4.75, { ...hold(lift, CURL_GRIP), ...look(-0.15, 0.25), chest: [0.05, -0.03, 0] }],
    [5.2, { ...hold(PD, CURL_GRIP), ...look(-0.2, 0.22) }],
    [5.4, { ...hold(PD, CURL_OPEN), ...look(-0.1, 0.18) }],
    [5.85, { ...pushAt(0), ...look(0.0, 0.18), chest: [0.07, 0, 0] }],
    [6.4, { ...pushAt(1), ...look(0.0, -0.02), chest: [0.13, 0, 0] }],
    [7.0, { ...look(0, -0.02) }],
  ])
  const pr = P.props
  pr.pot = 1; pr.cup = 1
  pr.potHold = t > 1.55 && t < 5.25 ? 1 : 0
  // 拿着时壶的目标位姿（实际按解出的手放置）：沿 lift → POUR_P 走，倾倒角 2.75–4.15 s 内起落
  pr.potP = [P.R.pp[0] - BEAST_TEAPOT.grip[0], P.R.pp[1] - BEAST_TEAPOT.grip[1], P.R.pp[2] - BEAST_TEAPOT.grip[2]]
  pr.potTilt = 0.72 * ramp(t, 2.75, 3.2) * (1 - ramp(t, 3.85, 4.2))
  pr.stream = t > 3.0 && t < 3.9 ? 1 : 0
  const push = ramp(t, 5.85, 6.4)
  pr.cupP = [CP[0], CP[1], CP[2] + BEAST_CUP_PUSH * push]
  return P
}
// 7. signContract（坐）：左手按住契约推到来客面前 → 收回；右手从桌上捏起钢笔（拇指 + 食指真正捏住）递出、停住微微点头 → 放回
const PEN_PICK_HQ = hQ(-1, [0.05, -0.75, 0.66], [0.0, 0.66, 0.75]) // 从上方捏：手背朝上前、指尖朝前下；笔沿手的拇指侧（±X）横放
const PEN_OFFER_HQ = hQ(-1, [0.1, -0.15, 1], [0.0, 1, 0.15])
const CONTRACT_PUSH = 0.18
function signPose(t: number): BeastPose {
  const CT = BEAST_REST.props.contractP, PN = BEAST_REST.props.penDesk
  const onC = (dz: number): Part => ({ L: { pp: [CT[0] - 0.01, CT[1] + 0.012, CT[2] - 0.1 + dz], pw: 1, pk: 0, pole: [0.45, -1, -0.3], hq: hQ(1, [-0.15, -0.08, 1], [0.05, 1, 0.08]), hw: 1, curl: CURL_FLAT } })
  const pick = (k: number, lift = 0): Part => ({ R: { g: [PN[0], PN[1] + 0.004 + lift, PN[2]], gw: 1, pole: [-0.35, -1, -0.3], hq: PEN_PICK_HQ, hw: 1, curl: k ? CURL_PINCH : [0.15, -0.15, 0.1, 0.25, 0.35] } })
  const offer: Part = { R: { g: [-0.06, 1.0, 0.47], gw: 1, pole: [-0.4, -1, -0.3], hq: PEN_OFFER_HQ, hw: 1, curl: CURL_PINCH }, chest: [0.12, 0.03, 0], head: [0.06, 0.05, 0.08] }
  const P = keys(t, SEAT, [
    [0, {}],
    [0.5, { head: [0.16, 0, 0] }],
    [1.0, { ...onC(0), head: [0.18, 0, 0] }],
    [1.9, { ...onC(CONTRACT_PUSH), chest: [0.1, 0, 0], head: [0.14, 0, 0] }],
    [2.4, { ...DESK_L, head: [0.1, -0.06, 0] }],
    [3.0, { ...pick(0), head: [0.2, -0.1, 0] }],
    [3.25, { ...pick(1), head: [0.2, -0.1, 0] }],
    [3.55, { ...pick(1, 0.05), head: [0.12, -0.05, 0] }],
    [4.25, offer],
    [5.1, { ...offer, head: [0.14, 0.05, 0.1] }],
    [5.65, { ...pick(1, 0.05), head: [0.16, -0.08, 0] }],
    [5.85, { ...pick(1), head: [0.18, -0.08, 0] }],
    [6.05, { ...pick(0), head: [0.16, -0.05, 0] }],
    [6.4, {}],
  ])
  const pr = P.props
  pr.contract = 1; pr.pen = 1
  pr.contractP = [CT[0], CT[1], CT[2] + CONTRACT_PUSH * ramp(t, 1.0, 1.9)]
  pr.penHold = t > 3.2 && t < 5.9 ? 1 : 0
  // 递笔停住时点一下头（「请」）
  P.head[0] += 0.06 * bump(t, 4.3, 4.8)
  return P
}
// 8. peripheralStill：余光里静立——双手垂在身侧，微微歪头、头和眼盯着目标；几乎不动（触须只有极慢的摆），色素略暗、波纹很慢
function lookAngles(target: V3 | undefined, from: V3, fallback: [number, number]): [number, number] {
  if (!target) return fallback
  const d = sub(target, from)
  return [Math.atan2(d[0], d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))]
}
const HEAD_EYE: V3 = [0, 1.73, 0.05]
function peripheralPose(u: number, o: BeastAnimOpts): BeastPose {
  const P = over(STAND, { ...HANG, chest: [-0.02, 0, 0] })
  breathe(P, u, 1, 0.4)
  const [yw, pt] = lookAngles(o.target, HEAD_EYE, [0.35, -0.04])
  const y = clamp(yw, -1.1, 1.1), p = clamp(pt, -0.4, 0.4)
  P.neck[1] += 0.4 * y; P.head[1] += 0.45 * y; P.head[0] -= 0.7 * p; P.head[2] += 0.2 + 0.015 * Math.sin(u * TAU)
  P.eyes = [clamp(y * 0.4, -0.35, 0.35), clamp(-p * 0.3, -0.2, 0.2)]
  P.tent.sway = 0.25; P.chroma = CH({ amp: 0.22, speed: 0.5, expand: 0.3, patch: 0.25, eyeRing: 0.3, edge: 0.3, irid: 0.4 }) // 盯视：略深、几乎不动
  return P
}
// 9. vanish：微微欠身 → 右脚后撤一步、左脚跟上（整体后退 0.45 m）→ 色素变暗（扩张 + 近黑着色、虹彩熄灭）→ 淡出（P.fade 1 → 0）
export const BEAST_VANISH_BACK = 0.45
/** vanish 参数（给 AI / 渲染侧同步用，比如同时压暗附近灯光、关掉他的阴影、在 fade = 0 时移除实体）：
 *  back 已后退距离（米，root 空间 −Z）、dark 变暗 0..1（色素扩张 + 近黑着色 + 虹彩熄灭）、fade 不透明度 1..0、done 结束 */
export function beastVanishState(t: number) {
  const fR = BEAST_VANISH_BACK * ramp(t, 0.35, 0.9), fL = BEAST_VANISH_BACK * ramp(t, 0.85, 1.4)
  return { back: (fR + fL) / 2, dark: ramp(t, 0.3, 1.4), fade: 1 - ramp(t, 1.0, 2.25), done: t >= BEAST_CLIPS.vanish.dur }
}
function vanishPose(t: number): BeastPose {
  const P = keys(t, STAND, [[0, {}], [0.35, { head: [0.14, 0, 0], chest: [0.03, 0, 0] }], [1.0, { ...HANG, head: [0.06, 0, 0] }], [2.4, { ...HANG, head: [0.04, 0, 0] }]])
  const B_ = BEAST_VANISH_BACK
  const fR = -B_ * ramp(t, 0.35, 0.9), fL = -B_ * ramp(t, 0.85, 1.4), rz = (fR + fL) / 2
  P.root = [0, 0, rz]
  P.legR.p = [P.legR.p[0], 0.06 * bump(t, 0.35, 0.9), P.legR.p[2] + fR - rz]; P.legR.ph = 0.25 * bump(t, 0.35, 0.9)
  P.legL.p = [P.legL.p[0], 0.06 * bump(t, 0.85, 1.4), P.legL.p[2] + fL - rz]; P.legL.ph = 0.25 * bump(t, 0.85, 1.4)
  P.hipsP[1] -= 0.015 * (bump(t, 0.35, 0.9) + bump(t, 0.85, 1.4))
  const VS = beastVanishState(t), dk = VS.dark
  // 隐入暗处：全身色素细胞扩张到近乎连成一片（深褐优先）→ 近黑斑驳，虹彩熄灭，再淡出
  P.chroma = CH({ amp: mix(0.3, 0.5, dk), speed: 0.6, expand: mix(0, 1.9, dk), patch: 0.35 * dk, dark: dk, hue: 0, edge: 0.15 + 0.3 * dk, irid: mix(0.55, 0.03, dk) })
  P.fade = VS.fade
  return P
}
// 10. portraitGaze：画像——身体完全不动，只有头（≤ 0.6 rad）和眼（其余角度）跟随目标；无目标时左右慢扫
function portraitPose(u: number, o: BeastAnimOpts): BeastPose {
  const P = deepClone(STAND)
  const [yw, pt] = lookAngles(o.target, HEAD_EYE, [0.75 * Math.sin(u * TAU), -0.12 + 0.12 * Math.sin(u * TAU * 2 + 0.7)])
  const hy = clamp(yw * 0.75, -0.6, 0.6), hp = clamp(pt * 0.7, -0.35, 0.35)
  P.neck[1] += 0.35 * hy; P.head[1] += 0.65 * hy; P.head[0] -= hp
  P.eyes = [clamp(yw - hy, -0.4, 0.4), clamp(-(pt - hp), -0.25, 0.25)]
  P.tent.sway = 0.12; P.chroma = CH({ amp: 0.15, speed: 0.4 })
  return P
}
// 11. doubtFreeze：正说着话（右手摊掌）→ 0.5 s 被怀疑，瞬间僵住（姿态冻结、触须停摆、色素点瞬间全收缩急速变白）→ 1.6 s 一下歪头「哦。」→ 2.8 s 反向小歪头 + 前探「呃…？」→ 1.4 s 起慢慢回色、末尾泛一点红褐
function doubtPose(t: number): BeastPose {
  const tf = Math.min(t, 0.5) // 冻结后手势时间停住
  const kR = bump(tf, 0.0, 1.3) ** 0.6
  const P = over(STAND, GEST(-1, kR))
  P.head[0] += 0.04 * Math.sin(tf * TAU / 0.8); P.head[1] -= 0.06 * kR
  // 「哦。」：0.12 s 甩到 0.36 rad 歪头；「呃…？」：反向 0.2 + 头前探
  const oh = ramp(t, 1.6, 1.72) * (1 - ramp(t, 2.8, 3.05)), uh = ramp(t, 2.8, 3.05)
  P.head[2] += 0.36 * oh - 0.2 * uh; P.head[0] += 0.04 * oh + 0.1 * uh; P.neck[0] += 0.06 * uh; P.chest[0] += 0.03 * uh
  P.eyes = [0, -0.05 * oh]
  const fz = ramp(t, 0.5, 0.58)
  P.tent.hold = fz * (1 - ramp(t, 3.6, 4.4))
  // 被怀疑：0.5 s 色素点瞬间全收缩（急速变白、发亮）→ 1.4 s 起慢慢回色 → 末尾泛一点红褐斑
  const back = ramp(t, 1.4, 4.3), red = ramp(t, 3.3, 4.4)
  P.chroma = CH({ amp: mix(0.4, 0.05, fz) + 0.25 * back, speed: mix(1.6, 0.05, fz), blanch: fz * (1 - back) ** 1.4, patch: 0.08 + 0.25 * red, hue: 0.35 * red, eyeRing: 0.3 * red, irid: 0.55 + 0.35 * fz * (1 - back) })
  P.tent.tremble = 1 - fz
  return P
}
// 12. reveal：绷紧（耸肩、低头）→ 0.5–2.4 s 形态 0 → 1（外套膜裂开露喙、长触腕伸出、身形拔高）伴随云纹加速、整体加深、虹彩闪动→ 抬头后仰 → 压下来俯视
function revealPose(t: number): BeastPose {
  const tense: Part = { chest: [0.08, 0, 0], head: [0.22, 0, 0], L: { clav: [0, 0, 0.05] }, R: { clav: [0, 0, -0.05] } }
  const spread: Part = chestArms({ L: { t: [0.38, 1.02, 0.2], pole: [1, -0.6, -0.3], hq: hQ(1, [0.35, -0.6, 0.7], [0.6, 0.3, 0.7]), hw: 1, curl: CURL_CLAW }, R: { t: [-0.38, 1.02, 0.2], pole: [-1, -0.6, -0.3], hq: hQ(-1, [-0.35, -0.6, 0.7], [-0.6, 0.3, 0.7]), hw: 1, curl: CURL_CLAW } })
  const P = keys(t, STAND, [
    [0, {}], [0.5, tense],
    [2.0, { ...spread, chest: [-0.12, 0, 0], head: [-0.3, 0, 0], neck: [-0.06, 0, 0] }],
    [2.7, { ...spread, chest: [-0.05, 0, 0], head: [-0.12, 0, 0] }],
    [3.6, { ...spread, chest: [0.06, 0, 0], head: [0.2, 0, 0], neck: [0.06, 0, 0] }],
  ])
  const k = ramp(t, 0.5, 2.4)
  P.form = Math.min(1, k + 0.015 * Math.sin(t * 50) * bump(t, 0.6, 2.3)) // 变形中带一点抽搐
  // 变真身：开头一下变白（绷紧）→ 云纹越流越快、整体逐步加深成红褐、斑块 + 眼环 + 镶边，虹彩一闪一闪
  const fl = bump(t, 0.45, 3.0), dk = ramp(t, 0.6, 2.6), acc = ramp(t, 0.5, 2.4)
  const bl = Math.exp(-((t - 0.5) ** 2) / (2 * 0.09 * 0.09))
  P.chroma = CH({ blanch: 0.85 * bl, cloud: 0.35 + 0.6 * acc, cloudSpeed: 0.18 + 0.5 * acc, expand: 0.75 * dk, patch: 0.15 + 0.5 * dk, hue: 0.75 * dk, eyeRing: 1.1 * dk, edge: 0.9 * dk,
    amp: 0.3 + 0.3 * fl, speed: 1.0 + 2 * fl, tentWave: 0.8 * acc, irid: 0.55 + 0.45 * fl * (0.5 + 0.5 * Math.sin(t * TAU * 4.5)) })
  P.tent.sway = 1 + 0.6 * fl; P.tent.lift = 0.5 * fl; P.tent.tremble = 0.8 * fl
  return P
}
// 13. tentacleGrab（真身）：左长触腕先向侧上方扬起蓄力 → 抽向目标（默认身前 1.9 m）→ 触腕穗绕目标卷住 → 收回拖到身前 → 松开回位
export const BEAST_GRAB_DEFAULT: V3 = [0.15, 1.2, 1.9]
const GRAB_NEAR: V3 = [0.1, 1.42, 0.62]
function grabPose(t: number, o: BeastAnimOpts): BeastPose {
  const T = o.grabTarget ?? o.target ?? BEAST_GRAB_DEFAULT
  const base = over(STAND, { ...chestArms({ L: { ...HANG.L, t: [0.32, 1.0, 0.1], hw: 0, curl: CURL_CLAW }, R: { ...HANG.R, t: [-0.32, 1.0, 0.1], hw: 0, curl: CURL_CLAW } }), form: 1 })
  const lunge: Part = { hipsR: [0.06, 0.1, 0], chest: [0.08, 0.12, 0], head: [0.1, 0.08, 0], R: { tc: [-0.3, 1.08, 0.32], cs: 1, pole: [-1, -0.6, -0.3], hq: hQ(-1, [-0.2, -0.3, 1], [-0.4, 0.8, 0.3]), hw: 1, curl: CURL_CLAW } }
  const P = keys(t, base, [[0, {}], [0.5, { chest: [-0.04, -0.15, 0], head: [-0.05, -0.05, 0] }], [0.95, lunge], [1.6, lunge], [2.6, { chest: [0.02, 0.04, 0], head: [0.16, 0.02, 0.12] }], [3.6, {}]])
  P.form = 1
  const wind: V3 = [0.55, 2.35, 0.2]
  let tg: V3
  if (t < 0.5) tg = wind
  else if (t < 0.95) tg = mixV(wind, T, ss((t - 0.5) / 0.45))
  else if (t < 1.35) tg = T
  else tg = mixV(T, GRAB_NEAR, ss((t - 1.35) / 1.15))
  P.grab = { k: ramp(t, 0.0, 0.45) * (1 - ramp(t, 3.0, 3.55)), T: tg, coil: ramp(t, 0.92, 1.3) * (1 - ramp(t, 2.95, 3.3)), held: t > 1.2 && t < 3.0 ? 1 : 0, r: o.grabR ?? 0.11 }
  // 威胁色：深红褐 + 斑块 + 眼环 / 镶边；云纹快速流动，抽击时触腕上的色波加强
  const hit = bump(t, 0.45, 1.6)
  P.chroma = CH({ expand: 0.8 + 0.2 * hit, hue: 0.9, dark: 0.25, patch: 0.6, cloud: 0.7, cloudSpeed: 0.45 + 0.25 * hit, eyeRing: 1.2, edge: 1.0, tentWave: 0.8 + 1.4 * hit, amp: 0.4, speed: 2, irid: 0.45 })
  P.tent.sway = 1.4; P.tent.lift = 0.3
  return P
}
// 14. colorFlash：恼怒——双拳攥紧、肩一耸；色素先急速变白，再快速云纹 + 红褐斑块 + 眼环，每下头一顿；触须上翻、发颤
function flashPose(t: number): BeastPose {
  const fists: Part = { ...HANG, L: { ...HANG.L, curl: [0.9, 1, 1, 1, 1] }, R: { ...HANG.R, curl: [0.9, 1, 1, 1, 1] } }
  const P = keys(t, STAND, [[0, {}], [0.25, { ...fists, chest: [0.04, 0, 0], L: { clav: [0, 0, 0.035] }, R: { clav: [0, 0, -0.035] } }], [2.0, { ...fists, chest: [0.04, 0, 0], L: { clav: [0, 0, 0.035] }, R: { clav: [0, 0, -0.035] } }], [2.4, {}]])
  let pulse = 0
  for (const t0 of [0.3, 0.95, 1.6]) pulse = Math.max(pulse, Math.exp(-((t - t0 - 0.12) ** 2) / (2 * 0.13 * 0.13)))
  const env = bump(t, 0.15, 2.35)
  P.head[0] += 0.05 * pulse; P.chest[0] += 0.02 * pulse
  // 恼怒：0.15–0.3 s 急速变白 → 快速云纹（三下顿头时更深）+ 逐步加深的红褐斑块 + 眼环 / 外套膜镶边 → 2.0 s 起回落
  const bl = ramp(t, 0.12, 0.2) * (1 - ramp(t, 0.27, 0.42))
  const ang = ramp(t, 0.28, 0.75) * (1 - 0.65 * ramp(t, 1.95, 2.4)), deep = ramp(t, 0.4, 1.5) * (1 - 0.7 * ramp(t, 1.95, 2.4))
  P.chroma = CH({ blanch: bl, cloud: 0.9 * ang, cloudSpeed: 0.2 + 0.32 * ang, expand: 0.85 * deep + 0.3 * pulse * ang, patch: 0.1 + 0.6 * ang, hue: ang, dark: 0.2 * deep, eyeRing: 1.2 * ang, edge: 0.9 * ang,
    amp: 0.3 + 0.2 * ang, speed: 1 + 1.5 * ang, tentWave: 0.6 * ang, irid: 0.55 - 0.15 * ang })
  P.tent.lift = 0.45 * env; P.tent.tremble = 0.9 * env; P.tent.sway = 1.2
  return P
}

// ---------- 骨骼求解（root 空间；带缩放：用矩阵）----------
interface Xf { p: THREE.Vector3; q: THREE.Quaternion }
const _mi = new THREE.Matrix4(), _s = new THREE.Vector3()
function rel(b: THREE.Object3D, root: THREE.Object3D): THREE.Matrix4 {
  b.updateWorldMatrix(true, false)
  return _mi.copy(root.matrixWorld).invert().multiply(b.matrixWorld)
}
function fk(b: THREE.Object3D, root: THREE.Object3D): Xf {
  const p = new THREE.Vector3(), q = new THREE.Quaternion()
  rel(b, root).decompose(p, q, _s)
  return { p, q }
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
export const beastIkResidual = () => ({ ..._res })
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
  return { Ru, Rf, miss: Math.max(0, miss), E }
}
function setFingers(A: BeastArm, curl: number[]) {
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
/** 捏合点在手骨局部：拇指 / 食指指腹（远节骨原点再往指尖 0.6 节）的中点（随手指屈伸变，所以每帧算）；CURL_PINCH 下两指腹中心距 ≈ 2.5 cm = 笔径 1.2 cm + 两指厚 */
function padLocal(A: BeastArm, f: 'thumb' | 'index') { const b2 = fkRel(A.fingers[f][1], A.wrist), b3 = fkRel(A.fingers[f][2], A.wrist); return b3.clone().addScaledVector(b3.clone().sub(b2), 0.6) }
function pinchLocal(A: BeastArm) { return padLocal(A, 'thumb').lerp(padLocal(A, 'index'), 0.5) }
/** 手臂：elbow 记下（自检：肘高 / 肘外翻） */
const _elbow: Record<number, THREE.Vector3> = { 1: new THREE.Vector3(), [-1]: new THREE.Vector3() }
export const beastElbows = () => ({ L: _elbow[1].clone(), R: _elbow[-1].clone() })
function solveArm(rig: BeastRig, A: BeastArm, s: number, P: BArmPose, chest: Xf, lift = 0) {
  const root = rig.root
  setE(A.clav, P.clav)
  setFingers(A, P.curl)
  const S = fk(A.shoulder, root).p
  const qR = new THREE.Quaternion(...P.hq), qC = chest.q.clone().multiply(new THREE.Quaternion(...P.hqc))
  const qWorld = qR.slerp(qC, c01(P.cs))
  const tR = v3(P.t), tC = v3(P.tc).sub(v3(JP('chest'))).applyQuaternion(chest.q).add(chest.p)
  const T = tR.lerp(tC, c01(P.cs))
  const qW = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.wr[0], P.wr[1], P.wr[2], 'YXZ'))
  const qHand = qWorld.clone().multiply(qW)
  if (P.gw > 0) T.lerp(v3(P.g).sub(pinchLocal(A).applyQuaternion(qHand)), c01(P.gw))
  if (P.pw > 0) T.lerp(v3(P.pp).sub(palmLocal(s, P.pk).applyQuaternion(qHand)), c01(P.pw))
  T.y += lift
  const { Ru, Rf, miss, E } = twoBone(S, T, LU, LF, P.pole, ARM_REST[s], 0.12)
  _res.arm = Math.max(_res.arm, miss); _elbow[s].copy(E)
  setRootQ(A.shoulder, root, Ru)
  A.elbow.quaternion.copy(Ru.clone().invert().multiply(Rf))
  const qFollow = Rf.clone().multiply(qW)
  const qFinal = P.hw >= 1 ? qHand : qFollow.slerp(qHand, c01(P.hw))
  A.wrist.quaternion.copy(Rf.clone().invert().multiply(qFinal))
}
/** 桌面接触（坐姿）：先把戳进桌面的手指逐根松开（屈曲按比例减小，最多伸直到静止弯度的一半反向），
 *  还低就把整只手抬起来重解一次。只管桌面范围内（z > 桌沿 0.17）的指尖 / 指根。 */
const DESK_EDGE_Z = 0.17, DESK_CLEAR = 0.007
function fingerTip(A: BeastArm, f: typeof FINGERS[number], root: THREE.Object3D) {
  const b2 = fk(A.fingers[f][1], root).p, b3 = fk(A.fingers[f][2], root).p
  return b3.clone().addScaledVector(b3.clone().sub(b2), 0.85)
}
function deskFix(rig: BeastRig, A: BeastArm, s: number, P: BArmPose, chest: Xf, deskY: number) {
  const root = rig.root, top = deskY + DESK_CLEAR
  const low = (p: THREE.Vector3) => (p.z > DESK_EDGE_Z ? top - p.y : -1)
  const curl = P.curl.slice()
  // 正在捏东西（gw）时拇指 / 食指不松开（捏桌上的笔，指尖本来就贴着桌面），只管其余三指 + 整手高度
  const pinching = P.gw > 0.5
  FINGERS.forEach((f, i) => {
    if (pinching && i < 2) return
    if (low(fingerTip(A, f, root)) <= 0) return
    for (const k of [0.75, 0.5, 0.25, 0, -0.25, -0.5]) {
      const c = curl[i] >= 0 ? curl[i] * k : Math.min(curl[i], -0.5 * (1 - k))
      A.fingers[f].forEach((b, j) => b.quaternion.setFromAxisAngle(b.userData.flexAxis as THREE.Vector3, c >= 0 ? c * FIST[f][j] : Math.max(c, -1) * REST_FLEX[f][j]))
      curl[i] = c
      if (low(fingerTip(A, f, root)) <= 0) break
    }
  })
  let need = 0
  FINGERS.forEach((f, i) => { need = Math.max(need, low(fingerTip(A, f, root)) - (pinching && i < 2 ? 0.011 : 0), low(fk(A.fingers[f][0], root).p) - 0.004) })
  if (need > 0) { solveArm(rig, A, s, { ...P, curl }, chest, need) }
}
const _ax = new THREE.Vector3(1, 0, 0), _ay = new THREE.Vector3(0, 1, 0)
function solveLeg(rig: BeastRig, s: number, P: BLegPose, kL: number) {
  const root = rig.root, S = s > 0 ? 'L' : 'R', bn = rig.bones
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
  const { Ru, Rf, miss } = twoBone(H, ankle, LT * kL, LS * kL, [pole.x, pole.y, pole.z], LEG_REST[s], 0.25)
  _res.leg = Math.max(_res.leg, miss)
  setRootQ(thigh, root, Ru)
  shin.quaternion.copy(Ru.clone().invert().multiply(Rf))
  const qFoot = qp.clone().multiply(qy)
  foot.quaternion.copy(Rf.clone().invert().multiply(qFoot))
  toe.quaternion.setFromAxisAngle(_ax, -Math.max(0, P.ph) * P.tf)
}

// ---------- 二阶状态（每个 rig 一份）----------
interface Dyn {
  init: boolean; hem: number[]; hemV: number[]
  /** 触须：每条一个 2D 弹簧（x = 前后、z = 左右，rad）+ 速度；摆动相位（停摆时不走）；测速点上一帧位置 / 速度 */
  sp: number[]; spV: number[]; phase: number; lastP: THREE.Vector3; lastV: THREE.Vector3
  chromaT: number
  cloudPh: number
}
function dynOf(rig: BeastRig): Dyn {
  const R = rig as BeastRig & { __bdyn?: Dyn }
  return (R.__bdyn ??= { init: false, hem: [0, 0, 0, 0], hemV: [0, 0, 0, 0], sp: new Array(20).fill(0), spV: new Array(20).fill(0), phase: 0, lastP: new THREE.Vector3(), lastV: new THREE.Vector3(), chromaT: 0, cloudPh: 0 })
}
export function resetBeastDynamics(rig: BeastRig, phase = 0) { const d = dynOf(rig); d.init = false; d.hem.fill(0); d.hemV.fill(0); d.sp.fill(0); d.spV.fill(0); d.phase = phase; d.chromaT = phase; d.cloudPh = phase * 2 }
function hemTarget(rig: BeastRig, s: number): [number, number] {
  const S = s > 0 ? 'L' : 'R'
  const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(rig.bones['thigh' + S].quaternion)
  const flex = Math.atan2(dir.z, -dir.y), abd = Math.atan2(dir.x, -dir.y)
  const k = flex > 0 ? mix(0.7, 0.92, ss((flex - 0.4) / 0.8)) : 0.45
  return [flex * k, abd * 0.6]
}
function applyHem(rig: BeastRig, dt: number | undefined) {
  const D = dynOf(rig)
  for (const s of [1, -1]) {
    const i = s > 0 ? 0 : 2, [fx, ab] = hemTarget(rig, s)
    if (dt === undefined || !D.init) { D.hem[i] = fx; D.hem[i + 1] = ab; D.hemV[i] = 0; D.hemV[i + 1] = 0 }
    else if (dt > 0) {
      const h = Math.min(dt, 0.05), K = 160, C = 15
      for (const [j, tg] of [[i, fx], [i + 1, ab]] as [number, number][]) { D.hemV[j] += (K * (tg - D.hem[j]) - C * D.hemV[j]) * h; D.hem[j] += D.hemV[j] * h }
      if (fx > 0) D.hem[i] = Math.max(D.hem[i], fx * 0.8)
    }
    const b = rig.bones['hem' + (s > 0 ? 'L' : 'R')]
    b.rotation.order = 'XYZ'; b.rotation.set(-D.hem[i], 0, D.hem[i + 1])
  }
}

// ---------- 触须 ----------
/** 测速点（头空间）：口下 15 cm、略靠前（大致是触须中段） */
const TENT_MID = new THREE.Vector3(0, 1.49 - JP('head')[1], 0.1 - JP('head')[2])
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _e = new THREE.Euler()
function applyTentacles(rig: BeastRig, P: BeastPose, head: Xf, dt: number | undefined) {
  const D = dynOf(rig), T = P.tent
  // 二阶输入：测速点加速度（root 空间 → 头空间）
  const mp = TENT_MID.clone().applyQuaternion(head.q).add(head.p)
  const acc = new THREE.Vector3()
  if (dt && dt > 0 && D.init) {
    const v = mp.clone().sub(D.lastP).divideScalar(dt)
    acc.copy(v).sub(D.lastV).divideScalar(dt); D.lastV.copy(v)
    if (acc.length() > 60) acc.setLength(60)
  } else D.lastV.set(0, 0, 0)
  D.lastP.copy(mp)
  const iq = head.q.clone().invert(), aL = acc.applyQuaternion(iq)
  const hold = c01(T.hold)
  if (dt && dt > 0) D.phase += dt * (1 - hold)
  const ph = D.phase
  // 重力补偿：头空间的「下」
  const gL = new THREE.Vector3(0, -1, 0).applyQuaternion(iq)
  // 低头时 gL 指向头的前方（gL.z > 0）：补偿把触须往前带离胸口，给足 0.8；仰头时补偿会把触须往胸口带，只给 0.5
  const wComp = (gL.z < 0 ? 0.5 : 0.8) * (1 - hold)
  for (const Tn of rig.tentacles) {
    const i = Tn.i, isClub = Tn.kind === 'club'
    const grabbed = isClub && Tn.side > 0 && P.grab.k > 0.001
    // 弹簧（每条频率略不同）
    const f = 1.4 + 0.4 * hash1(i * 3.7), w = TAU * f, z = 0.3
    const tgx = clamp(aL.z * 0.011, -0.45, 0.45) * (1 - hold), tgz = clamp(-aL.x * 0.011, -0.45, 0.45) * (1 - hold)
    if (dt && dt > 0) {
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n
      for (let k = 0; k < n; k++) for (const [j, tg] of [[2 * i, tgx], [2 * i + 1, tgz]] as [number, number][]) {
        D.spV[j] += (w * w * (tg - D.sp[j]) - 2 * z * w * D.spV[j]) * h * (1 - hold); D.sp[j] += D.spV[j] * h * (1 - hold)
      }
    }
    if (grabbed) continue
    const b0 = Tn.bones[0]
    if (isClub && P.form > 0.001) {
      // 真身长触腕（CLUB_DIRS 是按头正立设计的走向）：按头相对 root 的旋转整体反转回去 → 抬头 / 低头时长触腕在世界里不跟着甩
      _qb.identity().slerp(iq, c01(P.form)); b0.quaternion.premultiply(_qb)
    } else if (wComp > 0) {
      _qa.setFromUnitVectors(_ay.clone().negate(), gL); _qb.identity().slerp(_qa, wComp)
      b0.quaternion.premultiply(_qb)
    }
    const amp = T.sway * (isClub && P.form > 0.3 ? 0.5 : 1)
    const cs = hash1(i * 5.3) > 0.5 ? 1 : -1, ofs = hash1(i * 1.9) * TAU
    for (let k = 0; k < Tn.bones.length; k++) {
      const wk = (k + 1) / Tn.bones.length
      let thX = wk * D.sp[2 * i] - amp * 0.045 * (0.5 + 0.5 * Math.sin(ph * 0.9 + ofs - k * 0.55)) * wk
      let thZ = wk * D.sp[2 * i + 1] + amp * 0.045 * Math.sin(ph * 0.7 + ofs * 1.3 - k * 0.5) * wk
      if (k >= 5) thZ += cs * amp * 0.085 * Math.sin(ph * 0.55 + ofs) // 末端卷曲缓慢起伏（卷大多在额状面里，绕 Z 转 = 卷紧 / 松开）
      const tr = T.tremble * 0.018 * Math.sin(ph * 23 + i * 3.1 + k * 1.3)
      thX += tr; thZ += 0.7 * T.tremble * 0.018 * Math.sin(ph * 19 + i * 2.3 + k * 0.9)
      thX -= T.reach * (k < 6 ? 0.15 : 0.06) // 一起向前探
      thZ += T.reach * Tn.side * 0.03 * (k < 3 ? 1 : 0) // 前探时略张开
      thX -= T.lift * (k < 3 ? 0.06 : 0.16) // 恼怒 / 真身：往前上翻卷
      thX = Math.min(thX, 0.004) // 不往回压进领带 / 衬衫
      Tn.bones[k].quaternion.multiply(_qa.setFromEuler(_e.set(thX, 0, thZ, 'XYZ')))
    }
  }
  tentCollide(rig, P)
  if (P.grab.k > 0.001) applyGrab(rig, P.grab)
}
// ---------- 触须避让（衬衫 / 领带 / 西装 / 领口）----------
// 转头、歪头、低头时触须跟着头整体转，会扫进胸口 / 领口。每帧在摆动之后做一遍：关节点（和节中点）映射回胸骨的静止空间，
// 查「身体 + 领口环」距离场（启动后第一次用时在胸前一块区域烘成 1.2 cm 网格，约 7 万次求值，之后三线性插值），
// 距离 < 该处触须半径 + 4 mm 就把父节转一下，把关节推出表面（沿梯度）；只改有接触的那几节，摆动 / 二阶照旧。
const CG = { o: [-0.24, 0.98, -0.12], h: 0.012, n: [41, 55, 33] }
let CGRID: Float32Array | null = null
function clearGrid() {
  if (CGRID) return CGRID
  const BW = bhSdfW(bodySdf), w = warpBH(NECK_HOLE.c), NC = [w[0], 1.535, w[2]]
  const ring = (X: number, Y: number, Z: number) => Math.hypot(Math.hypot(X - NC[0], Z - NC[2]) - 0.07, (Y - NC[1]) * 0.7) - 0.016
  const [nx, ny, nz] = CG.n, g = new Float32Array(nx * ny * nz)
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const X = CG.o[0] + i * CG.h, Y = CG.o[1] + j * CG.h, Z = CG.o[2] + k * CG.h
    g[i + nx * (j + ny * k)] = Math.min(BW(X, Y, Z), ring(X, Y, Z))
  }
  return (CGRID = g)
}
function clearAt(p: THREE.Vector3) {
  const g = CGRID!, [nx, ny, nz] = CG.n
  const fx = (p.x - CG.o[0]) / CG.h, fy = (p.y - CG.o[1]) / CG.h, fz = (p.z - CG.o[2]) / CG.h
  if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return 1
  const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz), a = fx - i, b = fy - j, c = fz - k
  const at = (x: number, y: number, z: number) => g[x + nx * (y + ny * z)]
  const l = (x: number, y: number, z: number) => mix(mix(mix(at(x, y, z), at(x + 1, y, z), a), mix(at(x, y + 1, z), at(x + 1, y + 1, z), a), b), mix(mix(at(x, y, z + 1), at(x + 1, y, z + 1), a), mix(at(x, y + 1, z + 1), at(x + 1, y + 1, z + 1), a), b), c)
  return l(i, j, k)
}
const _cv = new THREE.Vector3()
function clearGrad(p: THREE.Vector3, out: THREE.Vector3) {
  const e = 0.004
  out.set(clearAt(_cv.copy(p).setX(p.x + e)) - clearAt(_cv.copy(p).setX(p.x - e)), clearAt(_cv.copy(p).setY(p.y + e)) - clearAt(_cv.copy(p).setY(p.y - e)), clearAt(_cv.copy(p).setZ(p.z + e)) - clearAt(_cv.copy(p).setZ(p.z - e)))
  if (out.lengthSq() < 1e-12) out.set(0, 0, 1)
  return out.normalize()
}
const CHEST_REST_W = new THREE.Vector3(...JP('chest'))
/** 最近一帧触须避让推开的最大量（米，验收用） */
let _tentPush = 0
export const beastTentPush = () => _tentPush
function tentCollide(rig: BeastRig, P: BeastPose) {
  clearGrid(); _tentPush = 0
  const root = rig.root, Mc = rel(rig.chest, root).clone(), McInv = Mc.clone().invert()
  const qc = new THREE.Quaternion(); Mc.decompose(new THREE.Vector3(), qc, new THREE.Vector3())
  const toRest = (p: THREE.Vector3) => p.clone().applyMatrix4(McInv).add(CHEST_REST_W)
  const Mh = rel(rig.head, root).clone()
  const lm = new THREE.Matrix4(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), push = new THREE.Vector3(), ts = new THREE.Vector3(), tp = new THREE.Vector3()
  const deficit = (pRoot: THREE.Vector3, r: number, out: THREE.Vector3) => {
    const pr = toRest(pRoot), d = clearAt(pr), need = r + 0.002 - d
    if (need <= 0) return 0
    clearGrad(pr, out).applyQuaternion(qc)
    return need
  }
  for (const Tn of rig.tentacles) {
    const isClub = Tn.kind === 'club'
    if (isClub && (P.form > 0.3 || (Tn.side > 0 && P.grab.k > 0.001))) continue
    const spec = TENTS[Tn.i], n = Tn.bones.length
    const M: THREE.Matrix4[] = []
    let prev = Mh
    // 骨 k 在弧长 k/9 处（末节 8/9 → 尖由骨 8 刚性带动）；尖 = 骨 8 + 静止时第 7 → 8 节的偏移（近似）
    const tipOfs = Tn.bones[n - 1].position
    for (let k = 0; k <= n; k++) {
      const b = Tn.bones[Math.min(k, n - 1)]
      M.push(k < n ? prev.clone().multiply(lm.compose(b.position, b.quaternion, b.scale)) : prev.clone().multiply(lm.makeTranslation(tipOfs.x, tipOfs.y, tipOfs.z))); prev = M[k]
      if (k === 0) continue
      // 关节 k = M[k] 原点；节中点 = (关节 k−1 + 关节 k) / 2
      pa.setFromMatrixPosition(M[k - 1]); pb.setFromMatrixPosition(M[k])
      const r = tentR(spec, k / n)
      let need = deficit(pb, r, push)
      const mid = pa.clone().add(pb).multiplyScalar(0.5), nm = new THREE.Vector3()
      const needM = deficit(mid, tentR(spec, (k - 0.5) / n), nm) * 2
      if (needM > need) { need = needM; push.copy(nm) }
      if (need <= 0) continue
      need = Math.min(need, 0.06); _tentPush = Math.max(_tentPush, need)
      const target = pb.clone().addScaledVector(push, need)
      const q = new THREE.Quaternion().setFromUnitVectors(pb.clone().sub(pa).normalize(), target.sub(pa).normalize())
      // 父节（k−1）世界旋转左乘 q → 写回局部
      const parentM = k - 1 === 0 ? Mh : M[k - 2]
      const qp = new THREE.Quaternion(); parentM.decompose(tp, qp, ts)
      const qw = new THREE.Quaternion(); M[k - 1].decompose(tp, qw, ts)
      const b1 = Tn.bones[k - 1]
      b1.quaternion.copy(qp.clone().invert().multiply(q.multiply(qw)))
      M[k - 1] = parentM.clone().multiply(lm.compose(b1.position, b1.quaternion, b1.scale))
      M[k] = k < n ? M[k - 1].clone().multiply(lm.compose(b.position, b.quaternion, b.scale)) : M[k - 1].clone().multiply(lm.makeTranslation(tipOfs.x, tipOfs.y, tipOfs.z)); prev = M[k]
    }
  }
}
/** 长触腕缠抓（i = 8，左侧）：柄段沿二次曲线（弧长 = 柄长，自动拱起）到目标，触腕穗绕目标向下卷 */
function applyGrab(rig: BeastRig, G: BeastGrab) {
  const Tn = rig.tentacles.find((x) => x.kind === 'club' && x.side > 0)
  if (!Tn) return
  const bs = Tn.bones, n = bs.length
  // 头空间（触须根骨的父 = head）
  const headM = rel(rig.head, rig.root).clone(), inv = headM.clone().invert()
  const Th = v3(G.T).applyMatrix4(inv)
  // 当前（setBeastForm 后）各节在头空间的累计旋转 / 缩放、节长、绑定方向
  const Qc: THREE.Quaternion[] = [], len: number[] = [], bdir: THREE.Vector3[] = []
  let q = new THREE.Quaternion(), sc = 1
  for (let k = 0; k < n; k++) {
    q = q.clone().multiply(bs[k].quaternion); sc *= bs[k].scale.x; Qc.push(q)
    const nx = k < n - 1 ? bs[k + 1].position : bs[k].position
    bdir.push(nx.clone().normalize()); len.push(k < n - 1 ? nx.length() * sc : 0.03)
  }
  const p0 = bs[0].position.clone()
  // 柄停在被抓物表面（朝野兽一侧），触腕穗从这里沿表面绕过顶部缠下去；缠绕时触腕穗拉长到 2.2 倍（墨鱼触腕穗能伸展）
  const Rw = (G.r ?? 0.11) + 0.012, C0 = Th.clone()
  const cd0 = Th.clone().sub(p0).normalize()
  Th.addScaledVector(cd0, -Rw * c01(G.k))
  for (let k = 7; k < n; k++) bs[k].position.multiplyScalar(1 + 1.2 * G.coil)
  for (let k = 6; k < n - 1; k++) len[k] *= 1 + 1.2 * G.coil
  // 柄可伸缩（墨鱼触腕本来就能弹射 / 回缩）：柄长 = 弦长 × 1.1（不短于 35%、不长于原长），按 k 与原长混合；
  // 这样蓄力时缩回、抽出时弹长、拖回时回缩，柄段只轻轻拱起，不会出现大鱼竿一样的高拱
  const Ls0 = len.slice(0, 6).reduce((a, b) => a + b, 0)
  const chord = Th.clone().sub(p0), Dl = chord.length(), cd = chord.clone().normalize()
  const fl = mix(1, clamp((Dl * 1.1) / Ls0, 0.35, 1), c01(G.k))
  for (let k = 1; k <= 6; k++) bs[k].position.multiplyScalar(fl)
  for (let k = 0; k < 6; k++) len[k] *= fl
  const Ls = Ls0 * fl
  // 柄 0..5：二次 Bézier p0 → Th，控制点沿「上（略偏外）」拱起 h，使弧长 ≈ 柄长
  let up = new THREE.Vector3(0.25, 1, 0); up.addScaledVector(cd, -up.dot(cd)); if (up.lengthSq() < 1e-6) up.set(1, 0, 0); up.normalize()
  const bez = (h: number, u: number) => { const C = p0.clone().add(Th).multiplyScalar(0.5).addScaledVector(up, h); const a = 1 - u; return p0.clone().multiplyScalar(a * a).addScaledVector(C, 2 * a * u).addScaledVector(Th, u * u) }
  const arcLen = (h: number) => { let L = 0, pr = p0.clone(); for (let j = 1; j <= 48; j++) { const pt = bez(h, j / 48); L += pt.distanceTo(pr); pr = pt } return L }
  let h = 0
  if (Dl < Ls) { let lo = 0, hi = 4; for (let it = 0; it < 26; it++) { const m = (lo + hi) / 2; if (arcLen(m) < Ls) lo = m; else hi = m } h = (lo + hi) / 2 }
  // 按弧长取节点
  const pts: THREE.Vector3[] = []; { let L = 0, pr = p0.clone(); const tab: [number, THREE.Vector3][] = [[0, p0.clone()]]; for (let j = 1; j <= 96; j++) { const pt = bez(h, j / 96); L += pt.distanceTo(pr); pr = pt; tab.push([L, pt]) }
    let acc = 0; for (let k = 0; k <= 6; k++) { const target = Math.min(acc, L); let j = 1; while (j < tab.length - 1 && tab[j][0] < target) j++; const [l0, a0] = tab[j - 1], [l1, a1] = tab[j]; pts.push(a0.clone().lerp(a1, (target - l0) / Math.max(1e-6, l1 - l0))); acc += len[k] ?? 0 } }
  const dirs: THREE.Vector3[] = []
  for (let k = 0; k < 6; k++) { const d = pts[k + 1].clone().sub(pts[k]); dirs.push(d.lengthSq() > 1e-10 ? d.normalize() : cd.clone()) }
  // 触腕穗：沿被抓物表面（中心 C0、半径 Rw；平面 = 来向 cd0 × 上）从柄端绕过顶部向远侧缠；coil 0 时顺着柄的方向伸直
  const a = dirs[5].clone()
  let wu = up.clone().addScaledVector(cd0, -up.dot(cd0)); if (wu.lengthSq() < 1e-6) wu.set(0, 1, 0); wu.normalize()
  const back = cd0.clone().negate()
  const tan = (th: number) => back.clone().multiplyScalar(-Math.sin(th)).addScaledVector(wu, Math.cos(th)).normalize()
  let th = 0
  for (let k = 6; k < n; k++) {
    const L = len[k] || 0.03, dth = L / Rw
    dirs.push(a.clone().lerp(tan(th + 0.5 * dth), c01(G.coil)).normalize())
    th += dth * c01(G.coil)
  }
  void C0
  // 目标累计旋转 → 与当前混合 → 写回局部旋转
  const Qt: THREE.Quaternion[] = []
  for (let k = 0; k < n; k++) {
    const want = new THREE.Quaternion().setFromUnitVectors(bdir[k].clone().applyQuaternion(Qc[k]).normalize(), dirs[k]).multiply(Qc[k])
    Qt.push(Qc[k].clone().slerp(want, c01(G.k)))
  }
  for (let k = 0; k < n; k++) bs[k].quaternion.copy(k === 0 ? Qt[0] : Qt[k - 1].clone().invert().multiply(Qt[k]))
}

// ---------- 道具 ----------
interface PropState { group: THREE.Group; pot: THREE.Group; cup: THREE.Group; saucer: THREE.Group; stream: THREE.Mesh; penRel: THREE.Quaternion; potRel: THREE.Quaternion }
const STREAM_MAT = litMaterial({ color: '#7a3d14', roughness: 0.15, transparent: true, opacity: 0.85 })
function props(rig: BeastRig): PropState {
  const R = rig as BeastRig & { __bprops?: PropState }
  if (R.__bprops) return R.__bprops
  const group = new THREE.Group(); group.name = 'beastAnimProps'; rig.root.add(group)
  const pot = buildBeastTeapot(); pot.visible = false; group.add(pot)
  const { cup, saucer } = buildBellhopTea(); cup.visible = false; saucer.visible = false; group.add(cup, saucer)
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0028, 1, 8, 1, true).translate(0, -0.5, 0), STREAM_MAT); stream.visible = false; group.add(stream)
  // 契约 / 钢笔：从手骨挪到 root（放桌上时不跟手；拿着时按手放置）
  for (const o of [rig.contract, rig.pen]) { o.removeFromParent(); group.add(o); o.visible = false }
  // 手持物相对手的固定旋转：壶 = POT_HQ 下壶正立（壶嘴 +X）；笔 = 笔轴（+Y）沿手的拇指侧
  const potRel = new THREE.Quaternion(...POT_HQ).invert()
  const penWorld = new THREE.Quaternion().setFromUnitVectors(_ay, new THREE.Vector3(1, 0, 0))
  const penRel = new THREE.Quaternion(...PEN_PICK_HQ).invert().multiply(penWorld)
  return (R.__bprops = { group, pot, cup, saucer, stream, penRel, potRel })
}
function palmPoint(rig: BeastRig, A: BeastArm, s: number, pk: number) { const hx = fk(A.wrist, rig.root); return palmLocal(s, pk).applyQuaternion(hx.q).add(hx.p) }
function pinchPoint(rig: BeastRig, A: BeastArm) { const hx = fk(A.wrist, rig.root); return pinchLocal(A).applyQuaternion(hx.q).add(hx.p) }
/** 右手掌心 / 拳心（root 空间；预览放握手对象用） */
export function beastPalmPoint(rig: BeastRig, s = -1, pk = 0) { return palmPoint(rig, s > 0 ? rig.armL : rig.armR, s, pk) }
const POT_GRIP = new THREE.Vector3(...BEAST_TEAPOT.grip), POT_SPOUT = new THREE.Vector3(...BEAST_TEAPOT.spout)
function applyProps(rig: BeastRig, P: BeastPose) {
  const pr = P.props
  if (!pr.pot && !pr.cup && !pr.contract && !pr.pen && !(rig as any).__bprops) return
  const st = props(rig)
  // 茶杯 + 碟
  st.cup.visible = st.saucer.visible = pr.cup > 0.5
  if (pr.cup > 0.5) { st.saucer.position.set(pr.cupP[0], pr.cupP[1], pr.cupP[2]); st.cup.position.set(pr.cupP[0], pr.cupP[1] + 0.004, pr.cupP[2]); st.cup.rotation.set(0, -2.4, 0) }
  // 茶壶：拿着 = 按实际右手拳心 + 固定相对旋转；否则在桌上
  st.pot.visible = pr.pot > 0.5; st.stream.visible = false
  if (pr.pot > 0.5) {
    if (pr.potHold > 0.5) {
      const hx = fk(rig.armR.wrist, rig.root), g = palmPoint(rig, rig.armR, -1, 1)
      const q = hx.q.clone().multiply(st.potRel)
      st.pot.quaternion.copy(q); st.pot.position.copy(g.sub(POT_GRIP.clone().applyQuaternion(q)))
    } else { st.pot.quaternion.identity(); st.pot.position.set(pr.potDesk[0], pr.potDesk[1], pr.potDesk[2]) }
    if (pr.stream > 0.5) { // 茶流：壶嘴口竖直落到杯里的茶面
      const tip = POT_SPOUT.clone().applyQuaternion(st.pot.quaternion).add(st.pot.position)
      const L = Math.max(0.01, tip.y - (pr.cupP[1] + 0.048))
      st.stream.visible = true; st.stream.position.copy(tip); st.stream.scale.set(1, L, 1)
    }
  }
  // 契约（桌上，纸面朝上，偏航）
  rig.contract.visible = pr.contract > 0.5
  if (rig.contract.visible) { rig.contract.position.set(pr.contractP[0], pr.contractP[1], pr.contractP[2]); rig.contract.quaternion.setFromAxisAngle(_ay, pr.contractYaw) }
  // 钢笔：拿着 = 捏合点 + 固定相对旋转；否则横放桌上（笔尖朝 +X）
  rig.pen.visible = pr.pen > 0.5
  if (rig.pen.visible) {
    if (pr.penHold > 0.5) { const hx = fk(rig.armR.wrist, rig.root); rig.pen.quaternion.copy(hx.q.clone().multiply(st.penRel)); rig.pen.position.copy(pinchPoint(rig, rig.armR)) }
    else { rig.pen.quaternion.setFromUnitVectors(_ay, new THREE.Vector3(1, 0, 0)); rig.pen.position.set(pr.penDesk[0], pr.penDesk[1], pr.penDesk[2]) }
  }
}

// ---------- 淡出 / 色素 ----------
/** 这只野兽的不透明度（0..1）：第一次 < 1 时把它的材质换成各自的克隆（shader 补丁 / uniform 共享），CPU 蒙皮替身同步换 */
export function setBeastFade(rig: BeastRig, k: number) {
  const meshes: THREE.Mesh[] = [rig.body, rig.headMesh, rig.headTrueMesh, rig.tentMesh, ...rig.eyes, rig.beakUpper, rig.beakLower]
  const R = rig as BeastRig & { __fadeK?: number }
  if (R.__fadeK === undefined && k >= 0.999) return
  for (const m of meshes) {
    let mat = m.userData.fadeMat as THREE.Material | undefined
    if (!mat) {
      const src = m.material as THREE.Material
      mat = src.clone(); mat.onBeforeCompile = src.onBeforeCompile; mat.customProgramCacheKey = src.customProgramCacheKey
      m.userData.fadeMat = mat; m.material = mat
      const px = m.userData.cpuProxy as THREE.Mesh | undefined; if (px) px.material = mat
    }
    const px = m.userData.cpuProxy as THREE.Mesh | undefined; if (px && px.material !== mat) px.material = mat
    const tr = k < 0.999
    if (mat.transparent !== tr) { mat.transparent = tr; mat.needsUpdate = true }
    mat.opacity = k; mat.depthWrite = k > 0.6
  }
  R.__fadeK = k
  rig.contract.visible &&= k > 0.02; rig.pen.visible &&= k > 0.02
}
function applyChroma(P: BeastPose, D: Dyn, dt: number | undefined) {
  const c = P.chroma, U = BEAST_CHROMA
  if (dt && dt > 0) { D.chromaT += dt * c.speed; D.cloudPh += dt * c.cloudSpeed * c.cloudFreq }
  U.uChromaTime.value = D.chromaT; U.uChromaAmp.value = c.amp; U.uChromaExpand.value = clamp(c.expand, -1.5, 2.2)
  U.uChromaTint.value.setRGB(c.tint[0], c.tint[1], c.tint[2]); U.uChromaTintK.value = c01(c.tintK); U.uIrid.value = c.irid
  U.uPatch.value = c.patch; U.uCloud.value.set(c.cloud, c.cloudFreq, D.cloudPh); U.uSweep.value.set(c.sweep, c.sweepK)
  U.uBlanch.value = c01(c.blanch); U.uEyeRing.value = c.eyeRing; U.uEdge.value = c.edge; U.uHue.value = c.hue; U.uDark.value = c01(c.dark); U.uTentWave.value = c.tentWave
}
/** setBeastForm 切换头部网格显隐后，CPU 蒙皮替身（QA）记住的「应显示」也要跟着改 */
function syncCpuVis(rig: BeastRig) {
  for (const m of [rig.headMesh, rig.headTrueMesh]) if (m.userData.cpuWantVisible !== undefined) { m.userData.cpuWantVisible = m.visible; if (m.userData.cpuProxy) (m.userData.cpuProxy as THREE.Mesh).visible = m.visible }
}

// ---------- 应用 ----------
export function applyBeastPose(rig: BeastRig, P: BeastPose, o: BeastAnimOpts = {}) {
  const root = rig.root
  _res.arm = 0; _res.leg = 0
  // 形态（复位并叠真身骨骼变换）
  setBeastForm(rig, P.form); syncCpuVis(rig)
  const k = rig.form, sS = 1 + 0.22 * k, sL = 1 + 0.34 * k
  for (const A of [rig.armL, rig.armR]) { A.clav.scale.set(1, 1 / sS, 1); A.wrist.scale.set(1, 1 + 0.12 * k, 1) }
  root.position.set(P.root[0], P.root[1], P.root[2]); setE(root, P.rootR)
  rig.hips.position.add(v3(P.hipsP)); setE(rig.hips, P.hipsR)
  setE(rig.spine, P.spine); setE(rig.chest, P.chest); setE(rig.neck, P.neck); setE(rig.head, P.head)
  solveLeg(rig, 1, P.legL, sL); solveLeg(rig, -1, P.legR, sL)
  applyHem(rig, o.dt)
  const chest = fk(rig.chest, root), head = fk(rig.head, root)
  solveArm(rig, rig.armL, 1, P.L, chest)
  if (P.desk > 0.7) deskFix(rig, rig.armL, 1, P.L, chest, P.desk)
  // 拿着茶壶：右手拳心目标 = 壶目标位姿上的壶把（倾倒角绕 root Z 轴，壶嘴朝 +X 向下）、手朝向随壶转
  let Rp = P.R
  if (P.props.pot > 0.5 && P.props.potHold > 0.5) {
    const qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -P.props.potTilt)
    const g = POT_GRIP.clone().applyQuaternion(qt).add(v3(P.props.potP))
    Rp = { ...P.R, pp: arr(g), pw: 1, pk: 1, hq: qArr(qt.clone().multiply(new THREE.Quaternion(...POT_HQ))) }
  }
  solveArm(rig, rig.armR, -1, Rp, chest)
  if (P.desk > 0.7 && !(P.props.pot > 0.5 && P.props.potHold > 0.5)) deskFix(rig, rig.armR, -1, Rp, chest, P.desk)
  // 眼
  for (const [b, s] of [[rig.eyeL, 1], [rig.eyeR, -1]] as [THREE.Bone, number][]) { b.rotation.order = 'YXZ'; b.rotation.set(P.eyes[1], P.eyes[0], 0); void s }
  applyTentacles(rig, P, head, o.dt)
  applyProps(rig, P)
  const D = dynOf(rig)
  applyChroma(P, D, o.dt)
  setBeastFade(rig, c01(P.fade))
  D.init = true
}
export function animateBeast(rig: BeastRig, clip: BeastClip, t: number, opts: BeastAnimOpts = {}) {
  const P = beastPose(clip, t, opts)
  applyBeastPose(rig, P, { ...opts, time: opts.time ?? t })
  return P
}
/** 预览 / 截图：从 t − pre 起按 1/60 s 推进二阶，得到与连续播放一致的确定帧（非循环片段最早从 0 起；触须相位 = 起点时间） */
export function animateBeastPreroll(rig: BeastRig, clip: BeastClip, t: number, opts: BeastAnimOpts = {}, pre = 1.0) {
  const C = BEAST_CLIPS[clip], h = 1 / 60
  let t0 = t - pre; if (!C.loop) t0 = Math.max(0, t0)
  resetBeastDynamics(rig, t0)
  let P: BeastPose | null = null
  for (let x = t0; x <= t + 1e-6; x += h) P = animateBeast(rig, clip, x, { ...opts, time: x, dt: x === t0 ? undefined : h })
  return P!
}

// ---------- 运行时动画器 ----------
export interface BeastAnimator {
  play(clip: BeastClip, fade?: number): void
  update(dt: number, opts?: BeastAnimOpts): void
  /** 叠加一次恼怒闪色（strength 0..1，约 1.2 s 衰减） */
  flash(strength?: number): void
  readonly clip: BeastClip; readonly time: number; readonly done: boolean; readonly pose: BeastPose
  /** 当前不透明度（vanish 淡出） */
  readonly fade: number
}
export function createBeastAnimator(obj: THREE.Object3D, seed = 1): BeastAnimator {
  const rig = obj.userData.beast as BeastRig
  let clip: BeastClip = 'idle', time = 0, gt = 0, fadeT = 1, fadeDur = 0, fl = 0
  let prev = beastPose('idle', 0, { seed }), last = deepClone(prev)
  return {
    get clip() { return clip }, get time() { return time }, get pose() { return last }, get fade() { return last.fade },
    get done() { const C = BEAST_CLIPS[clip]; return !C.loop && time >= C.dur },
    play(c, fade = 0.2) {
      if (c === clip && BEAST_CLIPS[c].loop) return
      prev = deepClone(last); clip = c; time = 0; fadeT = 0; fadeDur = fade
    },
    flash(strength = 1) { fl = Math.max(fl, strength) },
    update(dt, opts = {}) {
      time += dt; gt += dt; fadeT += dt; fl = Math.max(0, fl - dt / 1.2)
      let P = beastPose(clip, time, { seed, ...opts, flash: Math.max(opts.flash ?? 0, fl), time: gt })
      if (fadeT < fadeDur) P = mixBeastPose(prev, P, ss(fadeT / fadeDur))
      last = P
      applyBeastPose(rig, P, { seed, ...opts, time: gt, dt })
    },
  }
}
void cross
