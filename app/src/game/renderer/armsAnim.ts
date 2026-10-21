// 「手臂」（Entité 15-FR「Les Bras」）重制——第 2 阶段：程序化动画。
//
// 设计（与 nguithrAnim / jerryMesh 一致：AI/状态机只输出「姿态量」，渲染层据此摆骨骼）：
//   ArmsPose / ArmPose     纯数值姿态量。风口级：格栅开合 grate、格栅震动 rattle；每条臂一组 ArmPose（可独立驱动）
//   poseArms(rig, pose, t) 无状态：按姿态量 + 时间 t（只用于抽搐/痉挛/甩动等噪声）摆好所有骨骼、格栅、变细与烧焦
//   ArmsAnimator           有状态：target → pose 的逐字段指数平滑（所有过渡都是姿态量插值；波相位按增量积分）
//   armsClipPose(clip,t,o) 10 个片段 + loop / attack 串联，返回目标姿态
//   辅助：armsWorldToLocal / armsLocalToWorld、armsClawTip、armsGripPoint、armsExtension、armsCapsules、armsLightExposure
//
// ─── 核心思路：「沿路径滑动」的样条骨架 ────────────────────────────────────────────────
//   每条臂的中心线是一条路径 F(x)，x = 从管口量起的路径坐标（m）：
//     x < 0：管内路径——从该臂的管内位置竖直向上 1.3m（高出天花板 0.85m，手在弯头处转向时最低点仍在天花板以上），
//            再以 0.15m 半径弯成水平（藏进天花板里的风管）；
//     x ≥ 0：管外路径 S(x) = lerp( 悬垂/探寻形 H , 伸向目标形 R , reach ) + 抖动场 J(x, t)。
//       H：从管口竖直向下出发，按 yaw/lean/bow 转向，叠加以路径坐标为相位的正弦蛇行（相位不变时就是「跟随领头」的蛇行滑出）；
//       R：管口（切向 -Y）→ 腕目标 W（切向 = 指向目标）的 Hermite 曲线 + 两端为 0 的蛇形 S 弯（蓄力时加大）。
//   腕在路径上的位置 x_w = lerp(-1.6, Lb, out)，臂骨链 16 节按弧长等距排在 x_w 之前：
//     x_i = x_w − (16 − i)·(tubeLen/16)·k，k = max(1, Lb / 自然管外长) 为伸长系数（变细与贴图平铺也用它）。
//   于是：out 从 0→1 时爪尖先出管口、其余部分沿同一条路径滑出（emerge）；reach=1 且 out=1 时腕恰好在 W，
//   手按「效应点方向 → 指向目标」对齐，所以 抓握点/中爪尖 精确落在目标上（解析样条 IK，无需迭代；最长 5m）。
//   每节骨骼的朝向 = 当前路径在该处的平行移动标架 × 静止标架的逆（两者都从管口处 T=-Y、N=+Z 起算），不会糖纸扭转。
//
// ─── 坐标 ─────────────────────────────────────────────────────────────────────────
//   「臂空间」= buildArmsMesh 组的局部空间：原点 = 管口中心，+Y 向上（风口组旋转时跟着转）。目标点 tx/ty/tz 都在臂空间。
//   世界坐标换算用 armsWorldToLocal / armsLocalToWorld。
//
// CPU/GPU 蒙皮：本模块只写骨骼局部变换 + morphTargetInfluences（变细）+ 材质 uniform（烧焦、贴图平铺），
//   GPU 蒙皮由 three 每帧自动上传；QA 的 CPU 蒙皮替身（qaCpuSkin.ts，已支持 morph）每帧渲染前烘焙即可。
import * as THREE from 'three'
import { ARMS_CHAIN, ARMS_CLAW_CURL, ARMS_CLAW_SPREAD, ARMS_THIN_MIN, armsFrameQuat, armsTransport, armsTubeRadius, armsVent, type ArmsArm, type ArmsRig } from './armsMesh'

type V3 = THREE.Vector3
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const PI = Math.PI
const CH = ARMS_CHAIN
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const sm = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k) }
/** 在 [a,b] 内从 0 平滑升到 1 */
const ramp = (t: number, a: number, b: number) => sm((t - a) / (b - a))
/** a→b 升、c→d 降的平滑窗 */
const win = (t: number, a: number, b: number, c: number, d: number) => ramp(t, a, b) * (1 - ramp(t, c, d))
const easeIn = (x: number) => { const k = clamp01(x); return k * k * k }
const easeOut = (x: number) => { const k = 1 - clamp01(x); return 1 - k * k * k }
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
/** 平滑一维值噪声，∈[-1,1] */
const noise = (x: number) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1 }

/** 管口 → 爪尖 沿体最长距离（m） */
export const ARMS_MAX_REACH = 5.0
/** out=0 时腕所在的路径坐标（m）：腕在管口上方 1.75m（弯头里），爪尖也高出天花板 */
export const ARMS_HIDE_X = -1.75
const DUCT_UP = 1.3, DUCT_R = 0.15
const HSTEP = 0.04

// ============================================================================
// 姿态量
// ============================================================================
export interface ArmPose {
  // ---- 伸出 / 形状 ----
  /** 伸出量 0..1：0 = 整条臂（含手）缩在管内，1 = 腕到达路径终点（悬垂形的自然长度，或伸向目标时的目标处） */
  out: number
  /** 悬垂形的长度倍数（≥1 时整条臂被拉长、变细） */
  stretch: number
  /** 悬垂形：水平朝向（rad，臂空间，0 = +X，π/2 = +Z）、外探 0..1（0 竖直下垂，1 水平伸出）、末端上翘(+)/下垂(−) */
  yaw: number; lean: number; bow: number
  /** 蛇行：角幅（rad）、波长（m）、相位（rad；随时间增加 = 波沿臂传播，固定 = 沿同一条路径滑动） */
  wave: number; waveLen: number; phase: number
  // ---- 伸向目标（IK）----
  /** 伸向目标的权重 0..1（1 = 效应点精确落在目标上） */
  reach: number
  /** 目标点（臂空间，m） */
  tx: number; ty: number; tz: number
  /** 蓄力回缩 0..1：腕沿弦线收回、抬起，S 弯加大（负值 = 扑出时的过冲） */
  pull: number
  /** 效应点：0 = 抓握点（三爪合抱中心，抓人用），1 = 中爪尖（扑击用） */
  tipAim: number
  /** 伸向目标时手绕目标方向的滚转（rad）：0 = 爪向下钩，±π/2 = 爪横着环抱（抱住躯干） */
  hookRoll: number
  // ---- 手 ----
  /** 爪：-1 张开 … 0 静止弯钩 … 1 收拢扣住 */
  curl: number
  /** 爪的独立抽动 0..1 */
  clawTwitch: number
  /** 腕部俯仰 / 滚转（rad，叠加在自然姿态上；伸向目标时被对齐覆盖） */
  wristPitch: number; wristRoll: number
  // ---- 噪声 / 状态 ----
  /** 前臂抽搐 0..1（蓄力、受击） */
  twitch: number
  /** 痉挛扭动 0..1（被光烧） */
  spasm: number
  /** 甩动 + 撞击抖动 0..1（拖拽） */
  shake: number
  /** 烧焦 0..1 */
  burn: number
  /** 第 3 阶段：抓人合抱 0..1——两侧爪绕掌法线外张、各节加大收拢，尽量从两侧环住躯干（中爪略收） */
  wrap: number
}
export interface ArmsPose {
  /** 格栅开合 0..1（允许 −0.06..0 的回弹） */
  grate: number
  /** 格栅震动 0..1（管内刮擦时的轻颤；声音可以直接按它的大小播刮擦声） */
  rattle: number
  /** 每条臂一组（下标 = 臂号） */
  arms: ArmPose[]
}
export const ARM_POSE_DEFAULT: Readonly<ArmPose> = Object.freeze({
  out: 0, stretch: 1, yaw: PI / 2, lean: 0.35, bow: 0, wave: 0.3, waveLen: 0.85, phase: 0,
  reach: 0, tx: 0, ty: -1.3, tz: 2, pull: 0, tipAim: 0, hookRoll: 0,
  curl: 0, clawTwitch: 0, wristPitch: 0, wristRoll: 0,
  twitch: 0, spasm: 0, shake: 0, burn: 0, wrap: 0,
})
const ARM_KEYS = Object.keys(ARM_POSE_DEFAULT) as (keyof ArmPose)[]
export function armPose(p: Partial<ArmPose> = {}): ArmPose { return { ...ARM_POSE_DEFAULT, ...p } }
export function armsPose(count = 3, p: { grate?: number; rattle?: number; arms?: Partial<ArmPose>[] } = {}): ArmsPose {
  return { grate: p.grate ?? 0, rattle: p.rattle ?? 0, arms: Array.from({ length: count }, (_, a) => armPose(p.arms?.[a])) }
}
export function cloneArmsPose(p: ArmsPose): ArmsPose { return { grate: p.grate, rattle: p.rattle, arms: p.arms.map((a) => ({ ...a })) } }
/** out = a + (b−a)·k（逐字段） */
export function lerpArmsPose(a: ArmsPose, b: ArmsPose, k: number, out: ArmsPose = cloneArmsPose(a)): ArmsPose {
  out.grate = lerp(a.grate, b.grate, k); out.rattle = lerp(a.rattle, b.rattle, k)
  for (let i = 0; i < out.arms.length; i++) for (const key of ARM_KEYS) out.arms[i][key] = lerp(a.arms[i][key], b.arms[i][key], k)
  return out
}

// ============================================================================
// 每条臂的运行状态（poseArms 写入，辅助函数读取）
// ============================================================================
export interface ArmsArmState {
  /** 管体伸长系数（1 = 自然长度） */
  k: number
  /** 腕的路径坐标（m，<0 在管内） */
  wristX: number
  /** 露在管口外的管体长度（m，不含手） */
  outLen: number
  /** 管口 → 中爪尖 沿体长度（m；手在管内时为 0） */
  tipArc: number
  /** 这条臂是否有任何部分露出管口 */
  visible: boolean
  /** 该臂各关节的路径坐标（chain 0..15 + 腕），armsCapsules 用 */
  jointX: number[]
}
interface Scratch {
  H: Float32Array; Hn: number
  R: Float32Array; Rarc: Float32Array; Rn: number; Lr: number; Rend: V3
}
interface RigAnim { scratch: Scratch[]; state: ArmsArmState[]; restInv: THREE.Quaternion[][]; lastTw: number[]; lastT: number[] }
const RIG = new WeakMap<ArmsRig, RigAnim>()
const NR = 48
function rigAnim(rig: ArmsRig): RigAnim {
  let r = RIG.get(rig)
  if (!r) {
    r = {
      scratch: rig.arms.map(() => ({ H: new Float32Array(3 * 256), Hn: 0, R: new Float32Array(3 * (NR + 1)), Rarc: new Float32Array(NR + 1), Rn: NR, Lr: 0, Rend: V() })),
      state: rig.arms.map(() => ({ k: 1, wristX: ARMS_HIDE_X, outLen: 0, tipArc: 0, visible: false, jointX: new Array(CH + 1).fill(0) })),
      restInv: rig.arms.map((A) => A.rest.frames.map((q) => q.clone().invert())),
      lastTw: rig.arms.map(() => 0), lastT: rig.arms.map(() => -1e9),
    }
    RIG.set(rig, r)
  }
  return r
}
export function armsState(rig: ArmsRig, a: number): ArmsArmState | null { return rigAnim(rig).state[a] ?? null }

// ============================================================================
// 路径
// ============================================================================
const _a = V(), _b = V(), _c = V(), _e = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4()
const Y = Object.freeze(V(0, 1, 0))

/** 管内路径（x<0）：管内位置 o 竖直向上 DUCT_UP，再以 DUCT_R 弯向 -X 水平（天花板以上的部分在房间里永远看不见） */
function ductPoint(o: V3, x: number, out: V3, up = DUCT_UP): V3 {
  const s = -x, arc = DUCT_R * PI / 2
  if (s <= up) return out.set(o.x, s, o.z)
  if (s <= up + arc) { const f = (s - up) / DUCT_R; return out.set(o.x - DUCT_R * (1 - Math.cos(f)), up + DUCT_R * Math.sin(f), o.z) }
  return out.set(o.x - DUCT_R - (s - up - arc), up + DUCT_R, o.z)
}
/** 第 3 阶段：按风口所在处设置管内竖直段长度（m，默认 1.3 = 高出天花板 0.85m）。附近天花板更高、
 *  可能从别处看见天花板以上时，AI 改用 0.6（只高出天花板 0.15m 就转水平）。管道水平段始终沿臂空间 −X。 */
export function setArmsDuct(rig: ArmsRig, up: number) { rig.mesh.userData.armsDuctUp = up }

/** 悬垂/探寻形：从 o 竖直向下出发，按切向场积分（步长 HSTEP）到长度 len */
function buildHang(sc: Scratch, o: V3, p: ArmPose, len: number) {
  const n = Math.min(255, Math.ceil(len / HSTEP) + 2)
  const H = sc.H
  H[0] = o.x; H[1] = o.y; H[2] = o.z
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw)
  const p1x = -sy, p1z = cy // 水平、垂直于朝向
  const thLean = p.lean * PI / 2
  for (let i = 1; i <= n; i++) {
    const x = (i - 0.5) * HSTEP
    const th = -PI / 2 + thLean * sm(x / 0.6) + p.bow * (PI / 2) * sm(x / 2.0)
    const ct = Math.cos(th), st = Math.sin(th)
    // 基准方向 b 与两条垂线 p1（水平）、p2 = b × p1
    const bx = ct * cy, by = st, bz = ct * sy
    const p2x = by * p1z, p2y = bz * p1x - bx * p1z, p2z = -by * p1x
    const env = sm(x / 0.35)
    const w = 2 * PI * x / Math.max(0.2, p.waveLen)
    const d1 = Math.tan(Math.max(-1.2, Math.min(1.2, p.wave * env * Math.sin(w - p.phase))))
    const d2 = Math.tan(Math.max(-1.2, Math.min(1.2, p.wave * 0.6 * env * Math.sin(w * 0.73 - p.phase * 0.8 + 1.3))))
    let dx = bx + p1x * d1 + p2x * d2, dy = by + p2y * d2, dz = bz + p1z * d1 + p2z * d2
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l
    H[i * 3] = H[i * 3 - 3] + dx * HSTEP; H[i * 3 + 1] = H[i * 3 - 2] + dy * HSTEP; H[i * 3 + 2] = H[i * 3 - 1] + dz * HSTEP
  }
  sc.Hn = n
}
function hangPoint(sc: Scratch, x: number, out: V3): V3 {
  const H = sc.H, n = sc.Hn
  const f = Math.max(0, x / HSTEP)
  if (f >= n) { // 超出表尾：沿末段方向外推
    const i = n * 3
    return out.set(H[i] + (H[i] - H[i - 3]) * (f - n), H[i + 1] + (H[i + 1] - H[i - 2]) * (f - n), H[i + 2] + (H[i + 2] - H[i - 1]) * (f - n))
  }
  const i = Math.floor(f), u = f - i, j = i * 3
  return out.set(lerp(H[j], H[j + 3], u), lerp(H[j + 1], H[j + 4], u), lerp(H[j + 2], H[j + 5], u))
}

/** 伸向目标形：o（切向 -Y）→ W（切向 D）的 Hermite 曲线 + 两端为 0 的蛇形 S 弯；按弧长建表，返回弧长 */
function buildReach(sc: Scratch, o: V3, W: V3, D: V3, amp: number, waveLen: number, phase: number): number {
  const chord = _a.copy(W).sub(o), m = chord.length()
  const m0 = 0.95 * m, m1 = 0.75 * m
  const pr = _b.crossVectors(chord, Y); if (pr.lengthSq() < 1e-8) pr.set(1, 0, 0); pr.normalize()
  const qr = _c.crossVectors(pr, chord).normalize()
  const nW = 0.6 + m / (2 * Math.max(0.3, waveLen))
  const R = sc.R
  for (let i = 0; i <= NR; i++) {
    const u = i / NR, u2 = u * u, u3 = u2 * u
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2
    const env = Math.pow(Math.sin(PI * u), 2) * amp * Math.min(1, m)
    const s1 = Math.sin(2 * PI * u * nW - phase) * env, s2 = 0.6 * Math.cos(2 * PI * u * nW * 0.8 - phase * 0.9) * env
    R[i * 3] = h00 * o.x + h01 * W.x + h11 * m1 * D.x + pr.x * s1 + qr.x * s2
    R[i * 3 + 1] = h00 * o.y + h10 * m0 * -1 + h01 * W.y + h11 * m1 * D.y + pr.y * s1 + qr.y * s2
    R[i * 3 + 2] = h00 * o.z + h01 * W.z + h11 * m1 * D.z + pr.z * s1 + qr.z * s2
  }
  const A = sc.Rarc; A[0] = 0
  for (let i = 1; i <= NR; i++) A[i] = A[i - 1] + Math.hypot(R[i * 3] - R[i * 3 - 3], R[i * 3 + 1] - R[i * 3 - 2], R[i * 3 + 2] - R[i * 3 - 1])
  sc.Lr = A[NR]; sc.Rend.copy(D)
  return sc.Lr
}
function reachPoint(sc: Scratch, s: number, out: V3): V3 {
  const R = sc.R, A = sc.Rarc
  if (s >= sc.Lr) { const j = NR * 3; return out.set(R[j], R[j + 1], R[j + 2]).addScaledVector(sc.Rend, s - sc.Lr) }
  if (s <= 0) return out.set(R[0], R[1], R[2])
  let lo = 0, hi = NR
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (A[mid] <= s) lo = mid; else hi = mid }
  const u = (s - A[lo]) / Math.max(1e-6, A[hi] - A[lo]), j = lo * 3
  return out.set(lerp(R[j], R[j + 3], u), lerp(R[j + 1], R[j + 4], u), lerp(R[j + 2], R[j + 5], u))
}

/** 一次 poseArm 的路径上下文 */
interface PathCtx { sc: Scratch; o: V3; p: ArmPose; t: number; reachW: number; Lh: number; Lr: number; Lb: number; xw: number; jolt: V3; up: number }
const _sh = V(), _sr = V()
function pathPoint(c: PathCtx, x: number, out: V3): V3 {
  if (x < 0) return ductPoint(c.o, x, out, c.up)
  pathPointRaw(c, x, out)
  // 避让打开后垂在 -Z 侧的格栅（铰链 z=-0.275，向下垂 0.55m）：管外中心线在格栅前方 0.19m 以内时被柔和地推开
  if (out.z < -0.12 && out.y > -0.72 && Math.abs(out.x) < 0.42) {
    const w = sm((out.y + 0.72) / 0.12) * sm((0.42 - Math.abs(out.x)) / 0.08)
    const zc = -0.19, sf = 0.03 // 软最大值 z' = zc + sf·ln(1+e^((z−zc)/sf))：z 远小于 zc 时贴住 zc，远大于时不变，处处光滑
    if (out.z < zc + 0.15 && w > 0) out.z = lerp(out.z, zc + sf * Math.log1p(Math.exp((out.z - zc) / sf)), w)
  }
  return out
}
function pathPointRaw(c: PathCtx, x: number, out: V3): V3 {
  const u = x / c.Lb
  hangPoint(c.sc, u * c.Lh, _sh)
  if (c.reachW > 0) { reachPoint(c.sc, u * c.Lr, _sr); out.lerpVectors(_sh, _sr, c.reachW) } else out.copy(_sh)
  // 抖动场 J(x,t)：管口处为 0（不会把管口附近拽出管壁）
  const p = c.p, t = c.t
  const env = sm(x / 0.35)
  if (env <= 0) return out
  const uu = clamp01(x / Math.max(0.3, c.xw))
  if (p.twitch > 0) { // 前臂抽搐：高频小幅，空间上低频（整段前臂一起哆嗦，而不是皱成锯齿）
    const k = p.twitch * 0.03 * env * sm((uu - 0.4) / 0.35) * sm((c.xw - 0.2) / 0.6)
    out.x += k * noise(t * 13 + x * 1.6); out.y += k * noise(t * 11 + x * 1.3 + 3) * 0.7; out.z += k * noise(t * 14.5 + x * 1.5 + 5)
  }
  if (p.spasm > 0) { // 痉挛：多谐波大幅扭动，越往手越大（管口 0.7m 内收小，不去撞垂下的格栅）
    const k = p.spasm * 0.15 * env * sm(x / 0.7) * Math.pow(uu, 0.8)
    out.x += k * (Math.sin(7.3 * t + 3.1 * x) + 0.4 * Math.sin(11.3 * t - 4.2 * x + 1))
    out.y += k * 0.5 * Math.sin(9.7 * t + 3.4 * x + 2)
    out.z += k * (Math.cos(6.1 * t + 2.7 * x) + 0.4 * Math.sin(12.1 * t + 4.6 * x))
  }
  if (p.shake > 0) { // 甩动 + 撞击抖动（越往手越大）
    const k = p.shake * env * Math.pow(uu, 1.4)
    out.x += k * 0.12 * Math.sin(10.5 * t + 1.7 * x); out.y += k * 0.05 * Math.sin(14 * t + 1); out.z += k * 0.1 * Math.cos(7.7 * t + 2.1 * x)
    out.addScaledVector(c.jolt, k)
  }
  return out
}
const _pa = V(), _pb = V()
function pathTangent(c: PathCtx, x: number, out: V3): V3 {
  const h = 0.015
  pathPoint(c, x + h, _pa); pathPoint(c, x - h, _pb)
  out.subVectors(_pa, _pb)
  const l = out.length()
  return l > 1e-7 ? out.multiplyScalar(1 / l) : out.set(0, -1, 0)
}
/** 撞击抖动：每 ~0.6s 一次随机方向的急促位移（指数衰减） */
function jolt(t: number, out: V3): V3 {
  const P = 0.62, i = Math.floor(t / P), ph = t - i * P - hash(i * 3.1) * 0.25
  const e = ph > 0 ? Math.exp(-ph * 11) * (1 - Math.exp(-ph * 60)) : 0
  return out.set(hash(i + 0.7) - 0.5, -0.6 - hash(i + 1.9) * 0.4, hash(i + 2.3) - 0.5).normalize().multiplyScalar(0.2 * e)
}

// ============================================================================
// 爪 FK（效应点：中爪尖在当前收拢量下的静止空间位置）
// ============================================================================
function clawAngles(c: number, k: number) { return (c >= 0 ? ARMS_CLAW_CURL[k] : ARMS_CLAW_SPREAD[k]) * c }
const _fk = V(), _fr = new THREE.Quaternion(), _fq = new THREE.Quaternion()
/** 第 j 根爪在收拢量 c 下的爪尖位置（静止模型空间，手不动时） */
function clawTipRest(A: ArmsArm, j: number, c: number, out: V3): V3 {
  const C = A.rest.claws[j], ax = A.clawAxis[j]
  _fr.identity(); out.copy(C.joints[0])
  const pts = [C.joints[0], C.joints[1], C.joints[2], C.tip]
  for (let k = 0; k < 3; k++) {
    _fr.multiply(_fq.setFromAxisAngle(ax, clawAngles(c, k)))
    out.add(_fk.subVectors(pts[k + 1], pts[k]).applyQuaternion(_fr))
  }
  return out
}

// ============================================================================
// 无状态摆姿
// ============================================================================
const _jp: V3[] = Array.from({ length: CH + 1 }, () => V())
const _jq: THREE.Quaternion[] = Array.from({ length: CH + 1 }, () => new THREE.Quaternion())
const _jt: V3[] = Array.from({ length: CH + 1 }, () => V())
/** 合抱（wrap=1）时两侧爪的外张角与各节附加收拢角、中爪附加收拢角（rad） */
// 数值由 .cache/wraptest 网格搜索选出（3 个 seed、目标 = 胸口中心）：两侧爪尖落在躯干左右 ±0.15–0.18m、深度约在躯干中面（从两侧环住），
// 中爪尖停在胸口前表面（−0.11m）而不是扎穿躯干。合抱时手不再横转（HUG = 0），钩弯方向朝下、掌心贴住胸口。
export const ARMS_WRAP = { splay: 30 * PI / 180, side: [-10 * PI / 180, 30 * PI / 180, 40 * PI / 180], mid: [25 * PI / 180, 40 * PI / 180, 50 * PI / 180] }
const _ws = V(), _wd = V()
/** 两侧爪外张的转向符号：绕 hook 旋转时让该爪离中爪更远 */
function wrapSign(A: ArmsArm, j: number) {
  const C = A.rest.claws[j], M = A.rest.claws[1]
  const away = _ws.subVectors(C.tip, M.tip).dot(A.rest.palmSide) >= 0 ? 1 : -1
  _wd.subVectors(C.joints[1], C.joints[0]).normalize()
  const turn = _a.crossVectors(A.rest.hook, _wd).dot(A.rest.palmSide)
  return (turn >= 0 ? 1 : -1) * away
}
/** 前臂上分摊手腕扭转的关节数（从腕往回数） */
const TWIST_SPAN = 7
const _T0 = V(), _T1 = V(), _N = V(), _W = V(), _D = V(), _eR = V(), _tip = V(), _hd = V(), _ref = V(), _qd = V(), _ed = V(), _qp = V()
const _gi = new THREE.Quaternion()

function poseArm(rig: ArmsRig, a: number, p: ArmPose, t: number) {
  const A = rig.arms[a], ra = rigAnim(rig), sc = ra.scratch[a], st = ra.state[a]
  const o = A.rest.duct
  const Xnat = A.tubeLen - A.inDuct
  const Lh = Xnat * Math.max(0.6, p.stretch)
  buildHang(sc, o, p, Lh + 0.2)
  // ---- 效应点（静止手空间，相对腕）与伸向目标 ----
  // 手进入管口附近时爪会自动收拢（见下方 curlEff），效应点也要按实际收拢量算：先按 p.curl 解一次，若腕落在自动收拢区再解一次
  const wrist0 = A.rest.joints[CH]
  const reachW = clamp01(p.reach)
  let eLen = 0, Lr = Lh, Lb = Lh, xw = 0
  const solve = (curl: number) => {
    clawTipRest(A, 1, curl, _tip)
    _eR.copy(A.rest.grip).lerp(_tip, clamp01(p.tipAim)).sub(wrist0)
    eLen = _eR.length()
    Lr = Lh
    if (reachW > 1e-4) {
      _D.set(p.tx - o.x, p.ty - o.y, p.tz - o.z)
      if (_D.lengthSq() < 1e-6) _D.set(0, -1, 0)
      _D.normalize()
      _W.set(p.tx, p.ty, p.tz).addScaledVector(_D, -eLen)
      const amp0 = 0.1 * p.wave
      // 最长 5m：管口→效应点沿体长度超限时沿弦线收回目标
      for (let it = 0; it < 3; it++) {
        const L = buildReach(sc, o, _W, _D, amp0, p.waveLen, p.phase)
        if (L + eLen <= ARMS_MAX_REACH + 1e-3) break
        _W.sub(o).multiplyScalar((ARMS_MAX_REACH - eLen) / L * 0.995).add(o)
      }
      // 蓄力回缩（负值 = 过冲）：腕沿弦线收回并抬起，S 弯加大
      if (Math.abs(p.pull) > 1e-4) {
        const ch = _a.copy(_W).sub(o), m = ch.length()
        _W.copy(o).addScaledVector(ch, 1 - 0.75 * p.pull)
        _W.y += 0.22 * Math.max(0, p.pull) * m
        _W.y = Math.min(_W.y, -0.3)
      }
      Lr = buildReach(sc, o, _W, _D, amp0 + 0.22 * Math.max(0, p.pull), p.waveLen, p.phase)
    }
    Lb = Math.max(0.1, lerp(Lh, Lr, reachW))
    xw = lerp(ARMS_HIDE_X, Lb, clamp01(p.out))
  }
  solve(p.curl)
  const curlEff = lerp(p.curl, Math.max(p.curl, 0.85), 1 - sm((xw - 0.05) / 0.5))
  if (reachW > 1e-4 && Math.abs(curlEff - p.curl) > 1e-4) solve(curlEff)
  const k = Math.max(1, Lb / Xnat)
  const ctx: PathCtx = { sc, o, p, t, reachW, Lh, Lr, Lb, xw, jolt: jolt(t, _e), up: (rig.mesh.userData.armsDuctUp as number | undefined) ?? DUCT_UP }
  // ---- 关节位置 + 平行移动标架 ----
  const seg = (A.tubeLen / CH) * k
  for (let i = 0; i <= CH; i++) st.jointX[i] = xw - (CH - i) * seg
  let j0 = st.jointX.findIndex((x) => x >= 0); if (j0 < 0) j0 = CH + 1
  // 前向（x ≥ 0）
  pathTangent(ctx, 0, _T0); armsTransport(_N.set(0, 0, 1), Y.clone().negate(), _T0)
  const N0 = _N.clone(), T00 = _T0.clone()
  let cx = 0
  for (let i = j0; i <= CH; i++) {
    const xi = st.jointX[i]
    const steps = Math.max(1, Math.ceil((xi - cx) / 0.04))
    for (let s = 1; s <= steps; s++) { const x = cx + (xi - cx) * (s / steps); pathTangent(ctx, x, _T1); armsTransport(_N, _T0, _T1); _T0.copy(_T1) }
    cx = xi
    pathPoint(ctx, xi, _jp[i]); armsFrameQuat(_N, _T0, _jq[i])
  }
  // 后向（x < 0）
  _N.copy(N0); _T0.copy(T00); cx = 0
  for (let i = j0 - 1; i >= 0; i--) {
    const xi = st.jointX[i]
    const steps = Math.max(1, Math.ceil((cx - xi) / 0.04))
    for (let s = 1; s <= steps; s++) { const x = cx + (xi - cx) * (s / steps); pathTangent(ctx, x, _T1); armsTransport(_N, _T0, _T1); _T0.copy(_T1) }
    cx = xi
    pathPoint(ctx, xi, _jp[i]); armsFrameQuat(_N, _T0, _jq[i])
  }
  // 全局旋转 G_i = 当前标架 · 静止标架⁻¹
  for (let i = 0; i <= CH; i++) { _jt[i].set(0, 1, 0).applyQuaternion(_jq[i]); _jq[i].multiply(ra.restInv[a][i]) }
  // ---- 手：自然姿态（腕标架 + 腕部俯仰/滚转）与「效应点对齐」混合 ----
  const Gh = _jq[CH]
  if (p.wristPitch || p.wristRoll) Gh.multiply(_q.setFromAxisAngle(A.rest.palmSide, p.wristPitch)).multiply(_q2.setFromAxisAngle(A.rest.palmDir, p.wristRoll))
  const ductW = 1 - sm(xw / 0.45)
  const alignW = Math.max(reachW, ductW)
  let twist = 0
  if (alignW > 1e-4) {
    pathTangent(ctx, xw, _hd)
    const wR = reachW * (1 - ductW)
    const De = wR > 0 ? _hd.lerp(_D, wR).normalize() : _hd
    // 钩弯方向参考：伸向目标时朝下（爪从上方钩住；hookRoll 可绕目标方向转成横抱）；竖直进出管口时朝该臂的水平朝向。
    // 「朝下」在 De 接近竖直时退化：补一个与 De 水平倾向同向的分量（与 -Y 投影的极限方向一致，不会相互抵消）
    // 竖直时用「指向管道中心」作为水平参考（爪向内钩、不顶管壁）；该臂在管中心时退回朝向 yaw
    { const ol = Math.hypot(o.x, o.z), cx = ol > 0.02 ? -o.x / ol : Math.cos(p.yaw), cz = ol > 0.02 ? -o.z / ol : Math.sin(p.yaw)
      const hx = De.x - 0.08 * cx, hz = De.z - 0.08 * cz, hl = Math.hypot(hx, hz) || 1, c = -0.6 * Math.pow(Math.abs(De.y), 3) / hl
      _ref.set(hx * c, -1, hz * c) }
    _qd.copy(_ref).addScaledVector(De, -_ref.dot(De))
    if (_qd.lengthSq() < 1e-6) _qd.set(Math.cos(p.yaw), 0, Math.sin(p.yaw)).addScaledVector(De, -De.dot(_qd))
    _qd.normalize()
    if (p.hookRoll) _qd.applyAxisAngle(De, p.hookRoll * sm((xw - 0.15) / 0.5)) // 接近管口时滚转回正
    // 对齐的「手轴」：管内用掌的伸出方向（掌顺着管道），伸向目标时用效应点方向（保证效应点精确落在目标上）
    _ed.copy(_eR).normalize().lerp(A.rest.palmDir, 1 - wR).normalize()
    _qp.copy(A.rest.hook).addScaledVector(_ed, -A.rest.hook.dot(_ed)).normalize()
    // 摆动（swing）：把手轴当前方向转到 De——最小旋转，按权重缩放，不会因为两端姿态相差接近 180° 而翻转；
    // 扭转（twist）：绕 De 把钩弯方向转向参考方向，转角接近 ±180° 时淡出，避免左右翻转的跳变。
    _a.copy(_ed).applyQuaternion(Gh).normalize()
    _q.setFromUnitVectors(_a, De)
    _q2.identity().slerp(_q, alignW)
    Gh.premultiply(_q2)
    _b.copy(_qp).applyQuaternion(Gh); _b.addScaledVector(De, -_b.dot(De)).normalize()
    const phi = Math.atan2(_c.crossVectors(_b, _qd).dot(De), _b.dot(_qd))
    // 扭转角解卷绕：连续调用（相邻时刻）时取与上一帧最接近的 2π 分支，避免 ±180° 处翻转；单次调用（确定性重绘）取主值
    let tw = phi
    if (Math.abs(t - ra.lastT[a]) < 0.25) { tw = phi + 2 * PI * Math.round((ra.lastTw[a] - phi) / (2 * PI)); if (Math.abs(tw) > 1.6 * PI) tw = phi }
    ra.lastTw[a] = tw; ra.lastT[a] = t
    twist = tw * alignW
    Gh.premultiply(_q.setFromAxisAngle(De, twist))
  }
  // ---- 腕部扭转分摊到前臂最后 TWIST_SPAN 节（绕各自切向逐节递增），而不是全压在腕上（避免糖纸扭曲塌陷）----
  if (twist !== 0) for (let n = 1; n < TWIST_SPAN; n++) {
    const i = CH - n
    _jq[i].premultiply(_q.setFromAxisAngle(_jt[i], twist * (1 - n / TWIST_SPAN)))
  }
  // ---- 手也避让垂下的格栅：掌末/爪尖若落进格栅前方的避让区，绕腕把手摆出来（只在格栅一侧、管口下方 0.75m 内） ----
  if (xw > 0) {
    let worst = 0
    for (const rp of [A.rest.claws[1].joints[0], A.rest.claws[0].tip, A.rest.claws[1].tip, A.rest.claws[2].tip]) {
      _a.copy(rp).sub(wrist0).applyQuaternion(Gh).add(_jp[CH])
      if (_a.y > -0.75 && Math.abs(_a.x) < 0.45 && _a.z < -0.17) {
        const w = sm((_a.y + 0.75) / 0.1) * sm((0.45 - Math.abs(_a.x)) / 0.08) * clamp01((-0.17 - _a.z) / 0.04)
        if (w > worst) { worst = w; _b.copy(_a) }
      }
    }
    if (worst > 0) {
      _a.copy(_b).sub(_jp[CH]); const L = _a.length()
      _c.copy(_a); _c.z = Math.max(_c.z, -0.17 - _jp[CH].z); _c.setLength(L)
      _q.setFromUnitVectors(_a.normalize(), _c.normalize())
      Gh.premultiply(_q2.identity().slerp(_q, worst))
    }
  }
  // ---- 写骨骼局部变换 ----
  const bones = [...A.chain, A.hand]
  for (let i = 0; i <= CH; i++) {
    const b = bones[i]
    if (i === 0) { b.position.copy(_jp[0]); b.quaternion.copy(_jq[0]); continue }
    _gi.copy(_jq[i - 1]).invert()
    b.position.copy(_jp[i]).sub(_jp[i - 1]).applyQuaternion(_gi)
    b.quaternion.copy(_gi).multiply(_jq[i])
  }
  // ---- 爪：手进入管口附近时自动收拢（≥0.85，curlEff 见上），免得张开的爪顶穿管壁 ----
  const wrap = clamp01(p.wrap) * sm((xw - 0.1) / 0.5)
  A.claws.forEach((cb, j) => cb.forEach((b, kk) => {
    const tw = p.clawTwitch * 0.22 * noise(t * 19 + j * 7.3 + kk * 2.1) * sm((xw - 0.1) / 0.5)
    const side = j !== 1
    // 合抱：两侧爪的各节角度从收拢量过渡到 ARMS_WRAP.side（绝对角），整根再绕掌法线（钩弯方向）向外张开——爪尖从躯干两侧绕到背后
    const ang = lerp(clawAngles(curlEff, kk), side ? ARMS_WRAP.side[kk] : ARMS_WRAP.mid[kk], wrap)
    b.quaternion.setFromAxisAngle(A.clawAxis[j], ang + tw)
    if (kk === 0 && side && wrap > 1e-4) b.quaternion.premultiply(_q.setFromAxisAngle(A.rest.hook, wrapSign(A, j) * ARMS_WRAP.splay * wrap))
  }))
  rig.setStretchLook(a, k)
  rig.setBurn(a, clamp01(p.burn))
  // ---- 状态 ----
  st.k = k; st.wristX = xw; st.outLen = Math.max(0, xw)
  st.tipArc = xw > 0 ? xw + eLen : Math.max(0, xw + 0.75)
  st.visible = xw + 0.8 > -0.7
}

/** 找到臂组所挂的风口（沿父链找 userData.armsVent） */
function findVent(rig: ArmsRig): THREE.Object3D | null {
  for (let o: THREE.Object3D | null = rig.mesh.parent; o; o = o.parent) if (o.userData?.armsVent) return o
  return null
}

/**
 * 无状态：按姿态量摆好全部骨骼、格栅（若臂组挂在风口 anchor 上，或传入 vent）、变细、烧焦。
 * t 只用于噪声（抽搐/痉挛/甩动/格栅震动）。pose.arms 少于臂数时，缺的臂用默认姿态（缩在管内）。
 */
export function poseArms(rig: ArmsRig, pose: ArmsPose, t: number, vent: THREE.Object3D | null = findVent(rig)) {
  let any = false
  for (let a = 0; a < rig.count; a++) {
    poseArm(rig, a, pose.arms[a] ?? ARM_POSE_DEFAULT, t)
    if (rigAnim(rig).state[a].visible) any = true
  }
  // 全部缩回时隐藏网格（省一次绘制）；CPU 蒙皮替身接管时改写替身的可见性
  if (rig.mesh.userData.cpuProxy) rig.mesh.userData.cpuWantVisible = any
  else rig.mesh.visible = any
  if (vent) {
    const v = armsVent(vent)
    if (v) {
      const g = Math.max(-0.06, Math.min(1, pose.grate))
      const r = clamp01(pose.rattle) * (1 - 0.7 * sm(g / 0.3))
      const jit = r * (1.9 * noise(t * 23) + 0.8 * Math.sin(t * 61) + 0.5 * noise(t * 47 + 9)) * (PI / 180)
      v.hinge.rotation.x = g * 95 * (PI / 180) + jit
      v.hinge.position.y = v.hinge.userData.baseY ?? (v.hinge.userData.baseY = v.hinge.position.y)
      v.hinge.position.y += r * 0.002 * noise(t * 37 + 3)
      v.open = clamp01(g)
    }
  }
}

// ============================================================================
// 动画器
// ============================================================================
/** 各字段平滑时间常数（秒）；未列出的用 0.18 */
const TAU: Partial<Record<keyof ArmPose, number>> = {
  out: 0.1, reach: 0.08, hookRoll: 0.12, tx: 0.05, ty: 0.05, tz: 0.05, pull: 0.04, tipAim: 0.08, curl: 0.05, clawTwitch: 0.1,
  twitch: 0.08, spasm: 0.08, shake: 0.1, burn: 0.2, yaw: 0.3, lean: 0.25, bow: 0.25, wave: 0.2, waveLen: 0.3, stretch: 0.15,
  wristPitch: 0.12, wristRoll: 0.12,
}
const TAU_GRATE = 0.035, TAU_RATTLE = 0.05
export class ArmsAnimator {
  pose: ArmsPose
  target: ArmsPose
  private lastPhase: number[]
  constructor(count = 3, init?: ArmsPose) {
    this.pose = init ? cloneArmsPose(init) : armsPose(count)
    this.target = cloneArmsPose(this.pose)
    this.lastPhase = this.target.arms.map((a) => a.phase)
  }
  /** 设置目标（整份 ArmsPose，或只覆盖部分字段：{ grate, rattle, arms: [{...}, undefined, {...}] }） */
  set(p: Partial<Omit<ArmsPose, 'arms'>> & { arms?: (Partial<ArmPose> | undefined)[] }) {
    if (p.grate !== undefined) this.target.grate = p.grate
    if (p.rattle !== undefined) this.target.rattle = p.rattle
    p.arms?.forEach((ap, a) => { if (ap && this.target.arms[a]) Object.assign(this.target.arms[a], ap) })
    return this
  }
  /** 只设置一条臂 */
  setArm(a: number, p: Partial<ArmPose>) { if (this.target.arms[a]) Object.assign(this.target.arms[a], p); return this }
  /** 立即跳到目标 */
  snap() { this.pose = cloneArmsPose(this.target); this.lastPhase = this.target.arms.map((a) => a.phase); return this }
  update(dt: number) {
    const p = this.pose, g = this.target
    p.grate += (g.grate - p.grate) * (1 - Math.exp(-dt / TAU_GRATE))
    p.rattle += (g.rattle - p.rattle) * (1 - Math.exp(-dt / TAU_RATTLE))
    for (let a = 0; a < p.arms.length; a++) {
      const pa = p.arms[a], ga = g.arms[a]
      for (const key of ARM_KEYS) {
        if (key === 'phase') continue
        pa[key] += (ga[key] - pa[key]) * (1 - Math.exp(-dt / (TAU[key] ?? 0.18)))
      }
      // 波相位：按目标的增量积分（片段切换时目标相位跳变不会让波倒着跑）
      const d = ga.phase - this.lastPhase[a]
      if (Math.abs(d) < 2.5) pa.phase += d
      this.lastPhase[a] = ga.phase
    }
    return p
  }
}

// ============================================================================
// 辅助函数（第 3 阶段用）
// ============================================================================
/** 世界坐标 → 臂空间（原点 = 管口中心） */
export function armsWorldToLocal(rig: ArmsRig, world: V3, out: V3 = V()): V3 {
  rig.mesh.updateWorldMatrix(true, false)
  return out.copy(world).applyMatrix4(_m.copy(rig.mesh.matrixWorld).invert())
}
/** 臂空间 → 世界坐标 */
export function armsLocalToWorld(rig: ArmsRig, local: V3, out: V3 = V()): V3 {
  rig.mesh.updateWorldMatrix(true, false)
  return out.copy(local).applyMatrix4(rig.mesh.matrixWorld)
}
/** 骨骼上一点（静止模型空间 restPt，骨骼静止位置 restBone）当前的世界坐标 */
function boneWorld(b: THREE.Bone, restBone: V3, restPt: V3, out: V3) {
  b.updateWorldMatrix(true, false)
  return out.copy(restPt).sub(restBone).applyMatrix4(b.matrixWorld)
}
/** 爪尖世界坐标（j = 0/2 两侧，1 居中；默认中爪） */
export function armsClawTip(rig: ArmsRig, a: number, j = 1, out: V3 = V()): V3 {
  const A = rig.arms[a], C = A.rest.claws[j]
  return boneWorld(A.claws[j][2], C.joints[2], C.tip, out)
}
/** 抓握点世界坐标（三爪合抱中心，随手移动）：第 3 阶段把玩家的胸口挂在这里 */
export function armsGripPoint(rig: ArmsRig, a: number, out: V3 = V()): V3 {
  const A = rig.arms[a]
  return boneWorld(A.hand, A.rest.joints[CH], A.rest.grip, out)
}
/** 手掌朝向（世界）：抓握点处的「掌心 → 爪」方向与钩弯方向，用于给被抓的玩家定朝向 */
export function armsGripFrame(rig: ArmsRig, a: number, dir: V3, hook: V3) {
  const A = rig.arms[a]; A.hand.updateWorldMatrix(true, false)
  dir.copy(A.rest.palmDir).transformDirection(A.hand.matrixWorld)
  hook.copy(A.rest.hook).transformDirection(A.hand.matrixWorld)
}
/** 当前伸长量：k = 伸长系数，outLen = 管口外管体长（m），tipArc = 管口→中爪尖沿体长（m），worldDist = 管口到中爪尖直线距离（m） */
export function armsExtension(rig: ArmsRig, a: number) {
  const st = armsState(rig, a)!
  const tip = armsClawTip(rig, a, 1, V()), mouth = armsLocalToWorld(rig, V(0, 0, 0))
  return { k: st.k, outLen: st.outLen, tipArc: st.tipArc, worldDist: tip.distanceTo(mouth), visible: st.visible }
}

export interface ArmsCapsule { a: V3; b: V3; r: number; arm: number; seg: number }
/**
 * 光照/命中检测几何：每条臂露出管口的部分，按臂骨链每节一个胶囊（世界坐标），外加手掌一个、每根爪一个。
 * 半径已含伸长变细。管口以上（管内）的节不输出。seg：0..15 臂骨节，16 手掌，17..19 爪。
 */
export function armsCapsules(rig: ArmsRig, out: ArmsCapsule[] = []): ArmsCapsule[] {
  out.length = 0
  rig.mesh.updateWorldMatrix(true, true)
  for (let a = 0; a < rig.count; a++) {
    const A = rig.arms[a], st = armsState(rig, a)!
    if (!st.visible) continue
    const thin = Math.max(ARMS_THIN_MIN, 1 / Math.sqrt(st.k))
    const bones = [...A.chain, A.hand]
    for (let i = 0; i < CH; i++) {
      if (st.jointX[i + 1] < 0) continue
      const pa = bones[i].getWorldPosition(V()), pb = bones[i + 1].getWorldPosition(V())
      if (st.jointX[i] < 0) { const f = -st.jointX[i] / (st.jointX[i + 1] - st.jointX[i]); pa.lerp(pb, f) }
      out.push({ a: pa, b: pb, r: armsTubeRadius((i + 0.5) / CH) * 1.12 * thin, arm: a, seg: i })
    }
    if (st.wristX > -0.3) {
      const w = A.hand.getWorldPosition(V()), pe = boneWorld(A.hand, A.rest.joints[CH], A.rest.claws[1].joints[0], V())
      out.push({ a: w, b: pe, r: 0.055, arm: a, seg: CH })
      for (let j = 0; j < 3; j++) out.push({ a: boneWorld(A.claws[j][0], A.rest.claws[j].joints[0], A.rest.claws[j].joints[0], V()), b: armsClawTip(rig, a, j, V()), r: 0.02, arm: a, seg: CH + 1 + j })
    }
  }
  return out
}
/**
 * 简易光锥照射量：每条臂的胶囊中有多少比例（按长度）落在光锥内（不做遮挡，遮挡由第 3 阶段用场景射线补）。
 * origin/dir：光源位置与朝向（世界，dir 需单位化），halfAngle：半锥角（rad），range：照射距离（m）。返回每臂 0..1。
 */
export function armsLightExposure(rig: ArmsRig, origin: V3, dir: V3, halfAngle: number, range: number, caps: ArmsCapsule[] = armsCapsules(rig)): number[] {
  const tot = new Array(rig.count).fill(0), hit = new Array(rig.count).fill(0)
  const cosA = Math.cos(halfAngle), p = V(), d = V()
  for (const c of caps) {
    const L = c.a.distanceTo(c.b)
    for (let s = 0; s < 3; s++) {
      p.lerpVectors(c.a, c.b, (s + 0.5) / 3)
      d.subVectors(p, origin); const dist = d.length()
      tot[c.arm] += L / 3
      if (dist < range + c.r && dist > 1e-4) {
        const cosP = d.dot(dir) / dist
        // 胶囊半径换算成角度余量
        const ang = Math.acos(Math.max(-1, Math.min(1, cosP))) - Math.atan2(c.r, dist)
        if (ang < Math.acos(cosA)) hit[c.arm] += L / 3
      }
    }
  }
  return tot.map((x, i) => (x > 0 ? hit[i] / x : 0))
}

// ============================================================================
// 片段
// ============================================================================
export type ArmsClip = 'lurk' | 'emerge' | 'search' | 'lunge' | 'grab' | 'drag' | 'swallow' | 'flinch' | 'burnRetreat' | 'spit'
export type ArmsClipName = ArmsClip | 'loop' | 'attack'
export interface ArmsClipInfo {
  dur: number; loop: boolean; label: string
  /** 给第 3 阶段同步音效/机制用的时刻（秒，片段内） */
  events: Record<string, number>
}
export const ARMS_CLIPS: Record<ArmsClip, ArmsClipInfo> = {
  lurk: { dur: 4.6, loop: true, label: '潜伏：管内不可见，格栅轻颤（刮擦声）', events: {} },
  emerge: { dur: 5.4, loop: false, label: '出动：先推开格栅，再蛇行钻出（爪尖先出）', events: { scrape: 0, grateOpen: 0.8, grateOpened: 1.35, clawsOut: 1.95 } },
  search: { dur: 6, loop: true, label: '探寻：悬空左右摆动，爪一开一合', events: {} },
  lunge: { dur: 2.2, loop: false, label: '蓄力 0.8s（回缩 + 前臂抽搐）→ 扑抓', events: { windup: 0.15, strike: 1.0, hit: 1.2 } },
  grab: { dur: 1.6, loop: false, label: '抓住：爪收拢扣住（armsGripPoint）', events: { close: 0.12, closed: 0.3 } },
  drag: { dur: 3.6, loop: false, label: '拖回风口：缩短 + 甩动 + 撞击抖动', events: {} },
  swallow: { dur: 2.6, loop: false, label: '吞入：缩进管内，格栅猛地关上', events: { inside: 1.3, slam: 1.45, shut: 1.6 } },
  flinch: { dur: 1.8, loop: false, label: '受击：吃痛蜷缩，松开爪子', events: { hit: 0, release: 0.15 } },
  burnRetreat: { dur: 3.0, loop: false, label: '被光照：痉挛哀嚎、烧焦，迅速缩回', events: { scream: 0.05, debris: 1.5, inside: 1.9, slam: 1.95 } },
  spit: { dur: 3.2, loop: false, label: '吐出：从另一个风口探出一推，再缩回', events: { grateOpen: 0.12, push: 0.95, release: 1.22, slam: 2.5 } },
}
export interface ArmsClipOpts {
  /** 臂数（默认 3） */
  count?: number
  /** 主攻臂（默认 0） */
  lead?: number
  /** 玩家胸口（臂空间，m）：lunge 扑向它的前表面，grab/flinch 抓住它 */
  target?: V3
  /** 拖拽终点（臂空间，风口正下方） */
  dragTo?: V3
  /** spit：吐出时手先停在 hold，再推向 push（臂空间） */
  spitHold?: V3; spitPush?: V3
}
/** 抓人时手的滚转。第 2 阶段是 π/2（爪横着扣进胸口）；第 3 阶段改为 0 + 合抱爪形（wrap），两侧爪从左右环住躯干 */
const HUG = 0
const DEF_TARGET = V(0, -1.32, 2.1), DEF_DRAG = V(0, -1.0, 0.32), DEF_SPIT_HOLD = V(0, -1.05, 0.55), DEF_SPIT_PUSH = V(0, -1.45, 1.35)

/** 非主攻臂的朝向：与主攻方向错开 ±89°，并尽量避开格栅铰链一侧（-Z） */
function sideYaw(lead: number, a: number, leadYaw: number, count: number) {
  if (a === lead) return leadYaw
  const order = (a - lead + count) % count
  return leadYaw + (order === 1 ? 1.55 : -1.55)
}
/** 探寻形（search 及其它片段里的陪衬臂） */
function searchArm(p: ArmPose, t: number, yaw: number, s: number, amt = 1) {
  p.out = 1
  p.lean = 0.48 + 0.07 * Math.sin(0.7 * t + s)
  p.yaw = yaw + 0.5 * amt * Math.sin(2 * PI * t / 5.2 + s)
  p.bow = 0.1 + 0.12 * Math.sin(0.9 * t + s * 1.7)
  p.wave = 0.3; p.waveLen = 0.85; p.phase = 1.5 * t + s * 2
  p.curl = -0.25 + 0.55 * Math.sin(2 * PI * t / 1.9 + s)
  p.wristPitch = 0.3 * Math.sin(1.1 * t + s); p.wristRoll = 0.2 * Math.sin(0.6 * t + s * 0.5)
  p.twitch = 0.12; p.clawTwitch = 0.3
}

export function armsClipPose(clip: ArmsClipName, t: number, o: ArmsClipOpts = {}): ArmsPose {
  if (clip === 'loop' || clip === 'attack') { const s = armsSequenceSegment(clip, t); return armsClipPose(s.clip, s.local, o) }
  const info = ARMS_CLIPS[clip]
  if (info.loop) t = ((t % info.dur) + info.dur) % info.dur
  const count = o.count ?? 3, lead = Math.min(count - 1, o.lead ?? 0)
  const T = o.target ?? DEF_TARGET
  const P = armsPose(count)
  const leadYaw = Math.atan2(T.z, T.x)
  const seedOf = (a: number) => a * 2.1 + 0.4
  const L = P.arms[lead]
  const setT = (p: ArmPose, v: V3) => { p.tx = v.x; p.ty = v.y; p.tz = v.z }
  const others = P.arms.map((_, a) => a).filter((a) => a !== lead)
  switch (clip) {
    case 'lurk': {
      P.grate = 0
      const burst = Math.pow(Math.max(0, Math.sin(2 * PI * t / 2.3)), 4) * (0.65 + 0.35 * Math.sin(1.3 * t))
      P.rattle = 0.12 + 0.75 * burst
      P.arms.forEach((p, a) => { p.out = 0; p.yaw = sideYaw(lead, a, leadYaw, count); p.curl = 0.85 })
      break
    }
    case 'emerge': {
      P.rattle = 0.2 + 0.65 * win(t, 0, 0.15, 0.65, 1.0)
      P.grate = easeOut(ramp(t, 0.8, 1.35))
      const order = [lead, ...others]
      order.forEach((a, n) => {
        const p = P.arms[a], s0 = 1.1 + 0.45 * n, outMax = [1, 0.82, 0.68][n]
        const yaw = sideYaw(lead, a, leadYaw, count)
        p.out = outMax * sm((t - s0) / 2.7)
        p.yaw = yaw
        const settle = ramp(t, s0 + 1.8, s0 + 3.4)
        p.lean = lerp(0.16, 0.46, settle); p.bow = lerp(0.05, 0.12, settle)
        p.wave = lerp(0.55, 0.32, settle); p.waveLen = 0.8; p.phase = 0.35 * t + seedOf(a)
        p.curl = lerp(0.9, -0.1, ramp(t, s0 + 1.1, s0 + 2.4))
        p.clawTwitch = 0.25 * ramp(t, s0 + 1, s0 + 2)
        p.wristPitch = 0.2 * settle * Math.sin(t * 1.3 + a)
      })
      break
    }
    case 'search': {
      P.grate = 1
      P.arms.forEach((p, a) => searchArm(p, t, sideYaw(lead, a, leadYaw, count), seedOf(a), a === lead ? 1 : 0.7))
      break
    }
    case 'lunge': {
      P.grate = 1
      others.forEach((a) => { const p = P.arms[a]; searchArm(p, t, sideYaw(lead, a, leadYaw, count) + 0.25 * Math.sign(a - lead || 1), seedOf(a), 0.4); p.out = 0.92; p.lean = 0.4 })
      searchArm(L, t, leadYaw, seedOf(lead), 0.6)
      const strike = _c.set(0, 0, 0).sub(T).normalize().multiplyScalar(0.16).add(T) // 胸口前表面
      setT(L, strike)
      L.reach = easeOut(ramp(t, 0, 0.4)); L.tipAim = 1
      const wind = easeOut(ramp(t, 0.05, 0.6))
      const go = ramp(t, 0.98, 1.24)
      L.pull = lerp(0.55 * wind, -0.07, go) + 0.07 * ramp(t, 1.22, 1.6)
      L.twitch = win(t, 0.3, 0.42, 0.95, 1.05)
      L.wave = 0.35
      L.curl = lerp(lerp(L.curl, -0.25, ramp(t, 0, 0.4)), -1, ramp(t, 0.92, 1.1))
      L.clawTwitch = 0.7 * win(t, 0.3, 0.4, 0.9, 1.0)
      L.wristPitch = lerp(L.wristPitch, 0, ramp(t, 0, 0.3))
      L.wristRoll = lerp(L.wristRoll, 0, ramp(t, 0, 0.3))
      break
    }
    case 'grab': {
      P.grate = 1
      others.forEach((a) => { const p = P.arms[a]; searchArm(p, t + 2, sideYaw(lead, a, leadYaw, count) + 0.25 * Math.sign(a - lead || 1), seedOf(a), 0.4); p.out = 0.92; p.lean = 0.4 })
      setT(L, T); L.out = 1; L.reach = 1; L.wave = 0.35
      L.tipAim = 1 - easeOut(ramp(t, 0, 0.28)); L.hookRoll = HUG * easeOut(ramp(t, 0, 0.25))
      L.curl = lerp(-1, 1, easeOut(ramp(t, 0.05, 0.3)))
      L.clawTwitch = 0.25 * ramp(t, 0.3, 0.5); L.twitch = 0.25
      L.pull = -0.02 + 0.05 * win(t, 0.3, 0.45, 0.7, 1.0)
      L.shake = 0.12 * ramp(t, 0.8, 1.6)
      L.wrap = easeOut(ramp(t, 0.05, 0.32))
      break
    }
    case 'drag': {
      P.grate = 1
      others.forEach((a) => { const p = P.arms[a]; searchArm(p, t + 4, sideYaw(lead, a, leadYaw, count) + 0.3 * Math.sign(a - lead || 1), seedOf(a), 0.6); p.out = 0.9; p.lean = 0.42; p.shake = 0.18 })
      const D = o.dragTo ?? DEF_DRAG, u = sm((t - 0.15) / 3.25)
      _a.lerpVectors(T, D, u); _a.y += 0.18 * Math.sin(PI * u) // 先向上提起再拖回
      setT(L, _a); L.out = 1; L.reach = 1; L.tipAim = 0; L.curl = 1; L.wave = 0.3; L.hookRoll = HUG
      L.shake = 0.55 * ramp(t, 0, 0.3); L.twitch = 0.2; L.clawTwitch = 0.15; L.wrap = 1
      break
    }
    case 'swallow': {
      const D = o.dragTo ?? DEF_DRAG
      _a.copy(D); _a.y = lerp(D.y, -0.55, ramp(t, 0, 0.5)); _a.z = lerp(D.z, 0.15, ramp(t, 0, 0.5))
      setT(L, _a); L.reach = 1 - ramp(t, 0.35, 1.0); L.tipAim = 0; L.curl = 1; L.hookRoll = HUG
      L.out = 1 - ramp(t, 0.3, 1.3)
      L.shake = 0.4 * (1 - ramp(t, 0, 1.0)); L.wave = 0.3; L.wrap = 1 - ramp(t, 0.8, 1.2)
      others.forEach((a) => { const p = P.arms[a]; searchArm(p, t + 7, sideYaw(lead, a, leadYaw, count), seedOf(a), 0.4); p.out = 0.9 * (1 - ramp(t, 0.05, 1.1)); p.curl = lerp(p.curl, 0.9, ramp(t, 0.4, 1.0)); p.lean = lerp(0.42, 0.15, ramp(t, 0, 1)) })
      L.yaw = leadYaw; L.lean = 0.3
      // 格栅：先保持全开，等所有爪都缩过管口之后猛地关上（带回弹）
      const sl = ramp(t, 1.45, 1.58), tt = t - 1.58
      P.grate = t < 1.58 ? 1 - easeIn(sl) : -0.05 * Math.exp(-tt * 9) * Math.sin(tt * 38)
      P.rattle = win(t, 1.55, 1.6, 1.9, 2.5)
      break
    }
    case 'flinch': {
      P.grate = 1
      const r = easeOut(ramp(t, 0, 0.1)) * (1 - 0.65 * ramp(t, 0.45, 1.6))
      _a.copy(T); _b.set(0, 0.3, 0).sub(T).normalize()
      _a.addScaledVector(_b, 0.5 * r)
      setT(L, _a); L.out = 1; L.reach = 1; L.wave = 0.35; L.hookRoll = HUG * (1 - ramp(t, 0.2, 1.0))
      L.tipAim = 0.4 * ramp(t, 0.2, 0.8)
      L.curl = t < 0.25 ? lerp(1, -1, easeOut(ramp(t, 0.04, 0.25))) : lerp(-1, -0.3, ramp(t, 0.4, 1.5))
      L.spasm = 0.65 * win(t, 0, 0.04, 0.22, 0.6)
      L.wrap = 1 - ramp(t, 0.02, 0.15)
      L.twitch = 1 - ramp(t, 0.2, 1.5)
      L.pull = 0.28 * r
      L.wristPitch = -0.55 * r
      L.clawTwitch = 0.8 * (1 - ramp(t, 0.3, 1.2))
      others.forEach((a) => { const p = P.arms[a]; searchArm(p, t + 2, sideYaw(lead, a, leadYaw, count) + 0.25 * Math.sign(a - lead || 1), seedOf(a), 0.4); p.out = 0.92 - 0.15 * win(t, 0, 0.1, 0.3, 1.0); p.lean = 0.4; p.twitch = 0.6 * (1 - ramp(t, 0.1, 1.0)) })
      break
    }
    case 'burnRetreat': {
      P.arms.forEach((p, a) => {
        const n = a === lead ? 0 : (a - lead + count) % count
        searchArm(p, 0.2 * t, sideYaw(lead, a, leadYaw, count), seedOf(a), 0.6)
        const r0 = 0.95 + 0.12 * n
        const sp = ramp(t, 0, 0.1) * (1 - 0.3 * ramp(t, 0.6, 1.0)) * (1 - ramp(t, r0 - 0.05, r0 + 0.35)) // 缩回时痉挛收住（贴着管口扭会撞到格栅）
        p.spasm = sp * (a === lead ? 1 : 0.8)
        p.burn = (a === lead ? 0.85 : 0.65) * easeOut(ramp(t, 0.02, 1.4))
        p.twitch = 1 - ramp(t, r0, r0 + 0.3); p.wave = 0.3 + 0.4 * sp; p.phase = 9 * t + seedOf(a)
        p.curl = lerp(0.55 * Math.sin(17 * t + a * 2) * sp + 0.25, 0.9, ramp(t, r0, r0 + 0.3))
        p.clawTwitch = 1
        p.wristPitch = 0.5 * Math.sin(8 * t + a) * sp
        p.out = 1 - ramp(t, r0, r0 + 0.75)
        p.lean = lerp(p.lean, 0.2, ramp(t, 1.0, 1.6))
      })
      const tt = t - 2.08
      P.grate = t < 2.08 ? 1 - easeIn(ramp(t, 1.95, 2.08)) : -0.05 * Math.exp(-tt * 9) * Math.sin(tt * 38)
      P.rattle = win(t, 2.05, 2.1, 2.3, 2.9)
      break
    }
    case 'spit': {
      others.forEach((a) => { P.arms[a].out = 0 })
      P.rattle = win(t, 0, 0.04, 0.18, 0.35)
      const H = o.spitHold ?? DEF_SPIT_HOLD, S = o.spitPush ?? DEF_SPIT_PUSH
      _a.lerpVectors(H, S, easeOut(ramp(t, 0.95, 1.25)))
      setT(L, _a); L.reach = 1; L.tipAim = 0; L.wave = 0.25; L.yaw = Math.atan2(S.z, S.x); L.hookRoll = HUG
      L.out = t < 1.6 ? easeOut(ramp(t, 0.3, 0.95)) : 1 - ramp(t, 1.6, 2.4)
      L.curl = t < 1.18 ? 1 : lerp(1, -1, easeOut(ramp(t, 1.18, 1.32)))
      if (t > 1.6) L.curl = lerp(-1, 0.9, ramp(t, 1.65, 2.1))
      L.shake = 0.25 * win(t, 0.35, 0.5, 0.8, 0.95); L.twitch = 0.3
      L.wrap = t < 1.18 ? ramp(t, 0.3, 0.6) : 1 - ramp(t, 1.18, 1.3)
      L.pull = -0.06 * win(t, 1.0, 1.2, 1.3, 1.5)
      const tt = t - 2.66
      P.grate = t < 2.5 ? easeOut(ramp(t, 0.12, 0.35)) : t < 2.66 ? 1 - easeIn(ramp(t, 2.5, 2.66)) : -0.05 * Math.exp(-tt * 9) * Math.sin(tt * 38)
      if (t > 2.6) P.rattle = Math.max(P.rattle, win(t, 2.62, 2.66, 2.85, 3.2))
      break
    }
  }
  return P
}

/** 串联演示：loop（全部片段）与 attack（emerge → search → lunge → grab → drag，GIF 用） */
export const ARMS_SEQUENCES: Record<'loop' | 'attack', { clip: ArmsClip; dur: number; from?: number }[]> = {
  loop: [
    { clip: 'lurk', dur: 2.6 }, { clip: 'emerge', dur: 5.4 }, { clip: 'search', dur: 4 }, { clip: 'lunge', dur: 2.2 }, { clip: 'grab', dur: 1.4 },
    { clip: 'drag', dur: 3.6 }, { clip: 'swallow', dur: 2.6 }, { clip: 'lurk', dur: 1.8 }, { clip: 'spit', dur: 3.2 }, { clip: 'lurk', dur: 1.6 },
    { clip: 'emerge', dur: 5.4 }, { clip: 'search', dur: 3 }, { clip: 'lunge', dur: 2.2 }, { clip: 'grab', dur: 1.2 }, { clip: 'flinch', dur: 1.8 },
    { clip: 'search', dur: 2.4 }, { clip: 'burnRetreat', dur: 3.0 }, { clip: 'lurk', dur: 1.4 },
  ],
  attack: [{ clip: 'emerge', dur: 4.6, from: 0.8 }, { clip: 'search', dur: 2.4 }, { clip: 'lunge', dur: 2.2 }, { clip: 'grab', dur: 1.2 }, { clip: 'drag', dur: 3.6 }],
}
export function armsSequenceDur(name: 'loop' | 'attack') { return ARMS_SEQUENCES[name].reduce((s, x) => s + x.dur, 0) }
export function armsSequenceSegment(name: 'loop' | 'attack', t: number) {
  const seq = ARMS_SEQUENCES[name], dur = armsSequenceDur(name)
  let u = name === 'loop' ? ((t % dur) + dur) % dur : Math.max(0, Math.min(dur - 1e-6, t))
  for (let i = 0; i < seq.length; i++) { const s = seq[i]; if (u < s.dur) return { clip: s.clip, local: u + (s.from ?? 0), index: i, start: t - u }; u -= s.dur }
  const s = seq[seq.length - 1]; return { clip: s.clip, local: s.dur + (s.from ?? 0), index: seq.length - 1, start: 0 }
}
export function armsClipDur(clip: ArmsClipName) { return clip === 'loop' || clip === 'attack' ? armsSequenceDur(clip) : ARMS_CLIPS[clip].dur }

/**
 * 确定性回放：动画器从 0 起以固定步长 dt 追目标片段到时刻 t，返回平滑后的姿态（原型页 __render 与数值自检用）。
 * 片段内 t=0 时直接 snap 到片段起始姿态。
 */
export function armsReplay(clip: ArmsClipName, t: number, o: ArmsClipOpts = {}, dt = 1 / 60): ArmsPose {
  const an = new ArmsAnimator(o.count ?? 3, armsClipPose(clip, 0, o))
  const n = Math.round(Math.max(0, t) / dt)
  for (let i = 1; i <= n; i++) { an.target = armsClipPose(clip, i * dt, o); an.update(dt) }
  return an.pose
}
