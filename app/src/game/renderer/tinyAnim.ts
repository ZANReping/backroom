// [tiny] 小小重制 阶段 2：动画。全部是刚性关节组的逐帧姿势，没有蒙皮。
// 小小生活在 L7 的水里：双腿末端是刀刃状尖鳍，靠并腿的海豚式打水推进；披在身上的鲨鱼皮（鲨尾、胸鳍）随身体波动滞后摆动。
// 身体整体绕重心（约 1.25 m）俯仰：悬停时近乎直立、踩水，巡游时前倾约 45°，冲刺时几乎水平、长矛顺着身体朝前。
// 动画片段：
//   hover 悬停：两腿交替剪水、双手划水、转头打量
//   cruise 巡游：前倾，并腿打水，长矛斜持
//   sprint 冲刺：身体放平，大幅打水，长矛朝前、左臂贴身
//   perch 盘踞：蹲伏在「小小的谎言」那扇门上方，单手扒住门沿，长矛竖着拄在身边，低头盯着下面
//   maw 张口：追击终段，甲壳左右分开露出巨口，头往前探
//   attack 刺击：长矛高举后收蓄力 → 拧身前刺 → 收回；甲壳同时张开
//   recoil 被巨响逼退：甲壳合死，双臂抱头，身体后仰，双腿猛蹬往后退，头左右甩
import * as THREE from 'three'
import { aimSpear } from './tinyMesh'

export interface TinyAnim {
  /** 片段内时间（秒）：驱动呼吸、转头等慢动作 */
  t: number
  /** 打水相位（弧度）：由调用方按打水频率累加，保证循环无缝、换挡不跳帧 */
  phase: number
  /** 0 悬停 / 1 巡游 / 2 冲刺，可取中间值 */
  swim: number
  /** 甲壳张开 0..1（同时放出巨口） */
  open: number
  /** 长矛：蓄力 0..1、前刺 0..1 */
  wind: number; strike: number
  /** 被巨响逼退 0..1 */
  recoil: number
  /** 盘踞门上 0..1 */
  perch: number
  headYaw: number; headPitch: number
  /** 眼睛与荧光点亮度倍率（深处更亮，浮出水面几乎不亮） */
  glow: number
}
export const TINY_REST: TinyAnim = { t: 0, phase: 0, swim: 0, open: 0, wind: 0, strike: 0, recoil: 0, perch: 0, headYaw: 0, headPitch: 0, glow: 1 }

const sst = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const fract = (x: number) => x - Math.floor(x)
/** 打水频率（Hz）随泳速 */
export const tinyKickHz = (swim: number) => 0.55 + swim * 0.62

// 手臂姿势：各关节欧拉角 [x, y, z]（XYZ 顺序：先按 z 前后摆，再按 x 外展。手臂朝下时右臂 x 取负往外张，举过水平后要取正才往外张） + 长矛方向（身体坐标系，后面再按整体俯仰转到模型坐标）
type V3 = [number, number, number]
interface ArmPose { armR: V3; elbowR: V3; handR: V3; armL: V3; elbowL: V3; handL: V3; dir: V3 }
const HOLD: ArmPose = { armR: [-0.25, 0, 0.75], elbowR: [0, 0, 1.15], handR: [0, 0, -0.1], armL: [0.05, 0, 0.55], elbowL: [0, 0, 0.55], handL: [0, 0, 0], dir: [0.86, 0.5, -0.1] }
const SPRINT: ArmPose = { armR: [0.6, 0, 2.7], elbowR: [0, 0, 0.35], handR: [0, 0, 0.1], armL: [0.15, 0, -0.45], elbowL: [0, 0, 0.3], handL: [0, 0, -0.2], dir: [0.12, 1, -0.04] }
// RAISE/THRUST 的 armR/elbowR 在 animateTiny 里按俯仰重算，这里只提供左手与默认值
const RAISE: ArmPose = { armR: [-0.3, 0, 2.5], elbowR: [0, 0, 0.5], handR: [0, 0, 0], armL: [0.3, 0, 0.9], elbowL: [0, 0, 0.6], handL: [0, 0, -0.1], dir: [0.92, -0.32, 0] }
const THRUST: ArmPose = { armR: [-0.12, 0, 1.5], elbowR: [0, 0, 0.12], handR: [0, 0, 0], armL: [0.2, 0, 1.0], elbowL: [0, 0, 0.5], handL: [0, 0, -0.2], dir: [1, -0.04, -0.12] }
const COVER: ArmPose = { armR: [0.2, 0, 1.5], elbowR: [0, 0, 1.9], handR: [0, 0, 0.3], armL: [-0.2, 0, 1.5], elbowL: [0, 0, 1.9], handL: [0, 0, 0.3], dir: [0.2, -0.8, 0.6] }
const PERCH: ArmPose = { armR: [-0.38, 0, 0.35], elbowR: [0, 0, 0.35], handR: [0, 0, 0], armL: [0.25, 0, 1.25], elbowL: [0, 0, 0.55], handL: [0, 0, 0.6], dir: [0.1, 1, -0.55] }
const KEYS = ['armR', 'elbowR', 'handR', 'armL', 'elbowL', 'handL', 'dir'] as const
function mix(a: ArmPose, b: ArmPose, k: number): ArmPose {
  if (k <= 0) return a
  const o = {} as ArmPose
  for (const key of KEYS) o[key] = [lerp(a[key][0], b[key][0], k), lerp(a[key][1], b[key][1], k), lerp(a[key][2], b[key][2], k)]
  return o
}

const PIVOT = 1.25 // 整体俯仰的支点高度（重心）
const _d = new THREE.Vector3(), _v = new THREE.Vector3()

export function animateTiny(grp: THREE.Group, a: TinyAnim) {
  const P = grp.userData.parts as Record<string, THREE.Object3D> | undefined
  if (!P?.root) return
  const sw = Math.min(2, Math.max(0, a.swim)), s1 = Math.min(1, sw), s2 = Math.max(0, sw - 1)
  const rc = a.recoil, pc = a.perch, ph = a.phase
  const kick = Math.sin(ph), kickL = Math.sin(ph - 1.0), kickT = Math.sin(ph - 1.7)

  // ---------- 整体俯仰与前冲 ----------
  let pitch = lerp(lerp(0.12, 0.72, s1), 1.38, s2)
  pitch += a.strike * 0.18 - rc * 0.85 // 刺击时扑出去；逼退时往后仰
  pitch = lerp(pitch, 0.3, pc)
  pitch += kick * 0.035 * (0.3 + sw) * (1 - pc) // 打水时整个身体跟着上下点
  const lunge = a.strike * 0.45 * (1 - pc) - rc * 0.3 * Math.sin(Math.min(1, rc) * Math.PI * 0.5)
  P.root.rotation.set(0, 0, -pitch)
  P.root.position.set(-PIVOT * Math.sin(pitch) + lunge, PIVOT - PIVOT * Math.cos(pitch) - pc * 0.34, 0)

  // ---------- 躯干：随打水反向起伏，驼背；盘踞时更弓 ----------
  P.torso.scale.set(1, 1, 1)
  P.torso.rotation.set(Math.sin(ph * 0.5) * 0.03 * (1 - pc), 0, -0.12 - kickL * 0.06 * (0.25 + sw * 0.5) * (1 - pc) - pc * 0.28 + rc * 0.1 + s2 * 0.1)

  // ---------- 腿 ----------
  // 悬停：两腿交替剪水（相位差 π）；巡游起并腿海豚式打水（相位差 → 0），幅度随泳速增大
  const amp = lerp(0.22, 0.42, s1) + s2 * 0.2 + rc * 0.3
  const split = Math.PI * (1 - s1) * (1 - rc)
  const legBase = lerp(0.12, -0.02, s1) - s2 * 0.08
  for (const [L, off, bias] of [['L', 0, 0.12], ['R', split, -0.06]] as const) {
    const k = Math.sin(ph + off), kk = Math.sin(ph + off - 1.0)
    let hip = legBase + bias * (1 - s1) + k * amp
    let knee = -0.18 - (0.5 + 0.5 * kk) * (0.28 + sw * 0.12) - rc * 0.2
    // 盘踞：大腿抬到身前、小腿折回去收在身下，鳍尖朝后
    hip = lerp(hip, L === 'L' ? 1.85 : 1.6, pc); knee = lerp(knee, L === 'L' ? -2.55 : -2.35, pc)
    P['leg' + L].rotation.set(0, 0, hip)
    P['knee' + L].rotation.set(0, 0, knee)
  }

  // ---------- 鲨鱼皮：尾巴、胸鳍、背鳍滞后摆动 ----------
  if (P.tail) P.tail.rotation.set(Math.sin(ph * 0.5 - 0.6) * 0.06, 0, kickT * (0.16 + sw * 0.1) * (1 - pc * 0.7) + pc * 0.5)
  for (const [k, zs] of [['pectL', -1], ['pectR', 1]] as const) {
    const m = P[k]; if (!m) continue
    m.rotation.set(zs * (0.5 + Math.sin(ph - 0.4) * 0.12 * (0.4 + sw) + rc * 0.25), 0, 0.15 + kickL * 0.05)
  }

  // ---------- 手臂与长矛 ----------
  // 悬停时两手在身侧慢慢划水（右手仍握矛，只做小幅度）
  const scull = Math.sin(a.t * 2.1) * (1 - s1) * (1 - rc) * (1 - pc)
  let pose = mix(HOLD, SPRINT, sst(0.35, 1.6, sw))
  // 刺击：手臂角度要按整体俯仰换算成「在水里朝正前方」，否则身体前倾时矛会往下扎
  const fwd = Math.PI / 2 + pitch
  const raise: ArmPose = { ...RAISE, armR: [0.5, 0, fwd + 0.75], elbowR: [0, 0, 1.35], handR: [0, 0, -0.15] }
  const thrust: ArmPose = { ...THRUST, armR: [0.3, 0, fwd - 0.08], elbowR: [0, 0, 0.08] }
  pose = mix(pose, raise, a.wind * (1 - a.strike))
  pose = mix(pose, thrust, a.strike)
  pose = mix(pose, COVER, sst(0, 0.35, rc))
  pose = mix(pose, PERCH, pc)
  const set = (k: string, v: V3) => P[k].rotation.set(v[0], v[1], v[2])
  set('armR', [pose.armR[0], pose.armR[1], pose.armR[2] + scull * 0.06]); set('elbowR', pose.elbowR); set('handR', pose.handR)
  set('armL', [pose.armL[0] - scull * 0.25, pose.armL[1], pose.armL[2] + scull * 0.35]); set('elbowL', [pose.elbowL[0], pose.elbowL[1], pose.elbowL[2] + scull * 0.2]); set('handL', pose.handL)
  // 盘踞：左手往下伸、爪子扣住门沿，随呼吸微动
  if (pc > 0) P.armL.rotation.z += Math.sin(a.t * 1.3) * 0.03 * pc
  // 长矛方向：身体坐标 → 模型坐标（绕 z 转 -pitch，再加躯干弯曲的一半）
  const bend = pitch + 0.12 + pc * 0.2
  const cs = Math.cos(bend), sn = Math.sin(bend), [dx, dy, dz] = pose.dir
  _d.set(dx * cs + dy * sn, -dx * sn + dy * cs, dz).normalize()
  // 刺击时矛的方向直接给模型坐标：蓄力时矛尖略抬、朝前；前刺时水平朝前
  const atk = Math.max(a.wind, a.strike)
  if (atk > 0) {
    const ws = a.strike, tx = lerp(0.95, 1, ws), ty = lerp(0.2, -0.03, ws), tz = lerp(-0.05, -0.08, ws)
    _d.lerp(_v.set(tx, ty, tz).normalize(), sst(0, 0.5, atk)).normalize()
  }
  aimSpear(grp, _d)
  P.spear.userData.gripX = P.spear.position.x

  // ---------- 头 ----------
  // 头的 rotation.z 为正是抬头。身体放平时头要抬起来看前方；盘踞时低头往下盯；逼退时埋头、左右甩
  const shake = rc > 0 ? Math.sin(a.t * 17) * 0.28 * Math.sin(Math.min(1, rc) * Math.PI) : 0
  const lookUp = Math.max(0, pitch - 0.25) * 0.95
  P.head.rotation.set(shake * 0.3, a.headYaw + shake, 0.18 + lookUp + a.headPitch + a.open * 0.12 - pc * 0.4 - rc * 0.3)

  // ---------- 甲壳、巨口、鲨下颚 ----------
  const open = a.open * (1 - sst(0, 0.15, rc))
  const flutter = open > 0.5 ? Math.sin(a.t * 23) * 0.04 * (open - 0.5) : 0
  P.carL.rotation.set(0, open * 1.15 + flutter, 0); P.carR.rotation.set(0, -open * 1.15 - flutter, 0)
  P.seam.visible = open < 0.05
  P.mouth.scale.setScalar(0.01 + open * 0.99)
  P.sharkJaw.rotation.set(0, 0, -0.08 - open * 0.3 - kick * 0.02)

  // ---------- 发光 ----------
  const eyeMat = (grp.userData.eyeMats as THREE.MeshLambertMaterial[] | undefined)?.[0]
  const flick = 0.9 + Math.sin(a.t * 2.3) * 0.1
  if (eyeMat) eyeMat.emissiveIntensity = 1.2 * a.glow * flick * (1 + open * 0.4)
  const halo = grp.userData.eyeHalo as THREE.MeshBasicMaterial | undefined
  if (halo && halo.map) halo.opacity = Math.min(1, a.glow) * flick
  const spot = grp.userData.spotMat as THREE.MeshLambertMaterial | undefined
  if (spot) spot.emissiveIntensity = (0.6 + Math.sin(a.t * 3.1 + 1) * 0.15) * a.glow
}

type Clip = { dur: number; loop: boolean; sample: (t: number) => Partial<TinyAnim> }
// 循环片段的打水相位按「片段时长内整数个周期」给出，首尾帧严格相接
const cyc = (t: number, dur: number, n: number) => (t / dur) * Math.PI * 2 * n
export const TINY_CLIPS: Record<string, Clip> = {
  hover: { dur: 3.6, loop: true, sample: (t) => ({ swim: 0, phase: cyc(t, 3.6, 2), headYaw: Math.sin((t / 3.6) * Math.PI * 2) * 0.45, headPitch: Math.sin((t / 3.6) * Math.PI * 4) * 0.06 }) },
  cruise: { dur: 1 / tinyKickHz(1) * 2, loop: true, sample: (t) => ({ swim: 1, phase: cyc(t, 2 / tinyKickHz(1), 2) }) },
  sprint: { dur: 1 / tinyKickHz(2) * 2, loop: true, sample: (t) => ({ swim: 2, phase: cyc(t, 2 / tinyKickHz(2), 2) }) },
  perch: { dur: 4, loop: true, sample: (t) => ({ perch: 1, phase: 0, headYaw: Math.sin((t / 4) * Math.PI * 2) * 0.35, headPitch: Math.sin((t / 4) * Math.PI * 4) * 0.05 }) },
  maw: { dur: 1.6, loop: false, sample: (t) => ({ swim: 1.6, phase: t * Math.PI * 2 * tinyKickHz(1.6), open: sst(0.1, 0.7, t / 1.6), headPitch: 0.1 * sst(0.1, 0.7, t / 1.6) }) },
  attack: {
    dur: 1.2, loop: false, sample: (t) => {
      const k = t / 1.2
      const wind = sst(0, 0.4, k), strike = sst(0.45, 0.6, k) * (1 - sst(0.75, 1, k))
      return { swim: 1, phase: t * Math.PI * 2 * tinyKickHz(1), wind: wind * (1 - sst(0.75, 1, k)), strike, open: sst(0.05, 0.4, k) }
    },
  },
  recoil: {
    dur: 1.8, loop: false, sample: (t) => {
      const k = t / 1.8
      return { swim: 1.2, phase: t * Math.PI * 2 * 1.9, recoil: sst(0, 0.12, k) * (1 - sst(0.75, 1, k) * 0.6), glow: 1 - 0.5 * sst(0, 0.2, k) * (1 - sst(0.7, 1, k)) }
    },
  },
}
/** 采样一个片段：片段内时间 t（秒）→ 完整动画参数 */
export function sampleTiny(name: string, t: number): TinyAnim {
  const c = TINY_CLIPS[name]
  const tt = c.loop ? fract(t / c.dur) * c.dur : Math.min(t, c.dur)
  return { ...TINY_REST, ...c.sample(tt), t: tt }
}
