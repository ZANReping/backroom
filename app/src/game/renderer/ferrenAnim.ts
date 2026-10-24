// [ferren] Ferren（Entity 92）重制·阶段 2：程序化动画。animateFerren(parts, clip, t, w?) 无状态——每次调用都从建模姿势重新求值，
// 预览可任意顺序逐帧渲染，游戏里每帧按 AI 状态调用即可（w = 混合权重，0 = 建模/待机静止姿势，1 = 片段全量）。
// 刚性部件 + 两处 CPU 形变（每实例一份几何）：
//   脊柱：躯干网格按「弯曲场」形变——沿身体 z 积分俯仰曲率（弓背/前低/后低）与偏航曲率（侧弯/蜷成一团/左右扭），
//         并可沿身体拉长、截面压扁；头（颈根）、四肢（肩/髋）、尾根枢轴随同一弯曲场移动和转向，所以弓背时腿跟着身体走。
//   尾巴：尾巴网格同样按弯曲场卷曲（睡觉绕到身体前、兴奋时炸毛 puff）。
// 四肢：单节刚性腿，按「脚掌目标点」做 2D IK（绕肩/髋 rotation.x + 沿腿 scale.y 微伸缩），或在身体坐标系里直接给角度（收腿/伸展）。
// 地面：每帧量躯干/尾/头（及收起的爪）的最低点，防止穿地；趴卧类片段把最低点贴到 y=0（放进窝里时由调用方把整只抬到垫面高度）。
// 片段（参照雪貂真实行为）：
//   idle 呼吸、嗅动（鼻尖快速点动）、摆尾、左右张望 · walk 弓背小碎步（对角步态）· run 弓背弹跳式奔跑（半跳跃步态，脊柱一收一伸）
//   wardance 战舞：背弓得很高、尾巴炸毛、侧向连蹦 · sniff 低头贴地嗅、左右扫 · stand 后腿站立张望
//   sleep 蜷成一团、尾巴绕到身体前、闭眼慢呼吸（能放进 buildFerrenNestMesh 的窝）· eat 低头进食咀嚼 · pet 被摸：蹭手、眯眼、压低背
//   stretch 伸懒腰：前肢前伸、胸口压低、身体拉长 · noclip 切行：缩成一小团闪烁 → 缩到 0 + 光晕 → 反向出现 · roll 打滚（侧翻一整圈）
import * as THREE from 'three'
import { FERREN_DIM, type FerrenRig } from './ferrenMesh'

export type FerrenClip = 'idle' | 'walk' | 'run' | 'wardance' | 'sniff' | 'stand' | 'sleep' | 'eat' | 'pet' | 'stretch' | 'noclip' | 'roll'
/** dur：一个循环（或一次）的时长；loop：循环片段；speed：该片段对应的移动速度（m/s，原地片段为 0，供阶段 3 按速度选片段/同步步频） */
export const FERREN_CLIPS: Record<FerrenClip, { dur: number; loop: boolean; zh: string; speed: number }> = {
  idle: { dur: 4, loop: true, zh: '待机', speed: 0 },
  walk: { dur: 0.72, loop: true, zh: '弓背小碎步', speed: 0.45 },
  run: { dur: 0.4, loop: true, zh: '弹跳奔跑', speed: 2.2 },
  wardance: { dur: 1.3, loop: true, zh: '战舞', speed: 0 },
  sniff: { dur: 2.4, loop: true, zh: '低头嗅地', speed: 0 },
  stand: { dur: 3.2, loop: true, zh: '后腿站立', speed: 0 },
  sleep: { dur: 4, loop: true, zh: '蜷睡', speed: 0 },
  eat: { dur: 1.6, loop: true, zh: '进食', speed: 0 },
  pet: { dur: 2.4, loop: true, zh: '被摸', speed: 0 },
  stretch: { dur: 2.8, loop: false, zh: '伸懒腰', speed: 0 },
  noclip: { dur: 2.8, loop: false, zh: '切行', speed: 0 },
  roll: { dur: 1.8, loop: true, zh: '打滚', speed: 0 },
}

// ============================================================================
// 姿势参数（全部数值，可线性混合）
// ============================================================================
/** 腿：IK（dz 脚掌相对肩/髋正下方的前后偏移，lift 抬脚高度）与 FK（身体坐标系里的摆角 ang、长度倍率 len），fk 0..1 混合 */
export interface FerrenLimb { dz: number; lift: number; fk: number; ang: number; len: number }
export interface FerrenPose {
  // 脊柱弯曲场：arch 中段弓背（rad，+ 更弓）· front/rear 前/后半身下弯 · curl 整体侧弯（rad，+ 向模型 +X 侧）
  // sway/swayPh 左右扭动（S 形）· stretch 沿身体拉长 · sqx/sqy 截面宽/高倍率
  arch: number; front: number; rear: number; curl: number; sway: number; swayPh: number; stretch: number; sqx: number; sqy: number
  // 整体：绕铰点 (0, hy, hz) 的旋转 rx（+ 前低）、ry、rz（+ 向 +X 侧翻）、缩放 s，再平移 x/y/z
  rx: number; ry: number; rz: number; s: number; hy: number; hz: number; x: number; y: number; z: number
  // 头（颈根枢轴）：hYaw/hPitch（+ 低头）/hRoll；头骨（颈端）：kPitch/kYaw/kRoll
  hYaw: number; hPitch: number; hRoll: number; kPitch: number; kYaw: number; kRoll: number
  // 尾：根部 tPitch（+ 下垂）/tYaw；沿尾卷曲 tCurl（侧向）/tLift（+ 上翘）；摆动波 tWave/tWavePh；炸毛 tPuff
  tPitch: number; tYaw: number; tCurl: number; tLift: number; tWave: number; tWavePh: number; tPuff: number
  armL: FerrenLimb; armR: FerrenLimb; legL: FerrenLimb; legR: FerrenLimb
  /** 眼睛睁开 0..1 · 光晕强度 0..1 与大小 · 可见 0/1（闪烁）· ground：1 = 最低点贴地（趴卧/打滚），0 = 只防穿地 */
  eyes: number; glow: number; glowS: number; vis: number; ground: number
}
const L0 = (): FerrenLimb => ({ dz: 0, lift: 0, fk: 0, ang: 0, len: 1 })
export const FERREN_REST: FerrenPose = {
  arch: 0, front: 0, rear: 0, curl: 0, sway: 0, swayPh: 0, stretch: 1, sqx: 1, sqy: 1,
  rx: 0, ry: 0, rz: 0, s: 1, hy: 0.13, hz: -0.03, x: 0, y: 0, z: 0,
  hYaw: 0, hPitch: 0, hRoll: 0, kPitch: 0, kYaw: 0, kRoll: 0,
  tPitch: 0, tYaw: 0, tCurl: 0, tLift: 0, tWave: 0, tWavePh: 0, tPuff: 1,
  armL: L0(), armR: L0(), legL: L0(), legR: L0(),
  eyes: 1, glow: 0, glowS: 1, vis: 1, ground: 0,
}
const LIMBS = ['armL', 'armR', 'legL', 'legR'] as const
type LimbKey = (typeof LIMBS)[number]
const clonePose = (p: FerrenPose): FerrenPose => ({ ...p, armL: { ...p.armL }, armR: { ...p.armR }, legL: { ...p.legL }, legR: { ...p.legR } })
/** 两个姿势线性混合（k=0 → a，k=1 → b）；vis 取较近的一侧 */
export function mixFerrenPose(a: FerrenPose, b: FerrenPose, k: number): FerrenPose {
  const o = clonePose(a)
  for (const key of Object.keys(a) as (keyof FerrenPose)[]) {
    const va = a[key], vb = b[key]
    if (typeof va === 'number' && typeof vb === 'number') (o as any)[key] = va + (vb - va) * k
  }
  for (const l of LIMBS) for (const f of ['dz', 'lift', 'fk', 'ang', 'len'] as const) o[l][f] = a[l][f] + (b[l][f] - a[l][f]) * k
  o.vis = k < 0.5 ? a.vis : b.vis
  return o
}

// ============================================================================
// 小工具
// ============================================================================
const TAU = Math.PI * 2
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t) }
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const fract = (x: number) => x - Math.floor(x)
const gaussN = (s: number, m: number, sg: number) => Math.exp(-((s - m) ** 2) / (2 * sg * sg)) / (sg * 2.5066)
/** 步态：相位 p∈[0,1)，前 duty 段支撑（脚掌从 +A 匀速退到 -A），其余摆动（抬起前送） */
function gait(p: number, A: number, H: number, duty = 0.6): { dz: number; lift: number } {
  const u = fract(p)
  if (u < duty) return { dz: A * (1 - (2 * u) / duty), lift: 0 }
  const v = (u - duty) / (1 - duty)
  return { dz: A * (-1 + 2 * ease(v)), lift: Math.sin(Math.PI * v) * H }
}

// ============================================================================
// 弯曲场：s = 沿身体 z（相对形变原点），积分出每个采样点的位置 C(s) 与标架 X/Y/Z
// ============================================================================
interface BendTable { s0: number; ds: number; n: number; C: Float32Array; X: Float32Array; Y: Float32Array; Z: Float32Array }
function makeTable(s0: number, s1: number, ds: number): BendTable {
  const n = Math.round((s1 - s0) / ds) + 1
  return { s0, ds, n, C: new Float32Array(n * 3), X: new Float32Array(n * 3), Y: new Float32Array(n * 3), Z: new Float32Array(n * 3) }
}
/** kp(s)：俯仰曲率（+ 往前越来越朝下 = 弓起）；ky(s)：偏航曲率（+ 往前越来越偏向 +X）；st：沿身体拉长 */
function fillTable(tb: BendTable, kp: (s: number) => number, ky: (s: number) => number, st: number) {
  const { s0, ds, n, C, X, Y, Z } = tb
  const i0 = Math.round(-s0 / ds)
  const th = new Float32Array(n), ph = new Float32Array(n)
  for (let i = i0 + 1; i < n; i++) { const s = s0 + (i - 0.5) * ds; th[i] = th[i - 1] + kp(s) * ds; ph[i] = ph[i - 1] + ky(s) * ds }
  for (let i = i0 - 1; i >= 0; i--) { const s = s0 + (i + 0.5) * ds; th[i] = th[i + 1] - kp(s) * ds; ph[i] = ph[i + 1] - ky(s) * ds }
  for (let i = 0; i < n; i++) {
    const ct = Math.cos(th[i]), sth = Math.sin(th[i]), cp = Math.cos(ph[i]), sp = Math.sin(ph[i]), o = i * 3
    // R = Ry(φ)·Rx(θ)：X = R·x̂，Y = R·ŷ，Z = R·ẑ
    X[o] = cp; X[o + 1] = 0; X[o + 2] = -sp
    Y[o] = sp * sth; Y[o + 1] = ct; Y[o + 2] = cp * sth
    Z[o] = sp * ct; Z[o + 1] = -sth; Z[o + 2] = cp * ct
  }
  C[i0 * 3] = C[i0 * 3 + 1] = C[i0 * 3 + 2] = 0
  for (let i = i0 + 1; i < n; i++) for (let k = 0; k < 3; k++) C[i * 3 + k] = C[(i - 1) * 3 + k] + (Z[(i - 1) * 3 + k] + Z[i * 3 + k]) * 0.5 * ds * st
  for (let i = i0 - 1; i >= 0; i--) for (let k = 0; k < 3; k++) C[i * 3 + k] = C[(i + 1) * 3 + k] - (Z[(i + 1) * 3 + k] + Z[i * 3 + k]) * 0.5 * ds * st
}
const _f = { c: [0, 0, 0], x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] }
function frameAt(tb: BendTable, s: number) {
  let u = (s - tb.s0) / tb.ds
  // 超出采样范围：沿端点切线外推
  const lo = u < 0, hi = u > tb.n - 1
  const uc = clamp(u, 0, tb.n - 1.0001), i = Math.floor(uc), f = uc - i, o = i * 3, p = o + 3
  for (let k = 0; k < 3; k++) {
    _f.c[k] = tb.C[o + k] + (tb.C[p + k] - tb.C[o + k]) * f
    _f.x[k] = tb.X[o + k] + (tb.X[p + k] - tb.X[o + k]) * f
    _f.y[k] = tb.Y[o + k] + (tb.Y[p + k] - tb.Y[o + k]) * f
    _f.z[k] = tb.Z[o + k] + (tb.Z[p + k] - tb.Z[o + k]) * f
  }
  if (lo || hi) { const ex = lo ? u * tb.ds : (u - (tb.n - 1)) * tb.ds; for (let k = 0; k < 3; k++) _f.c[k] += _f.z[k] * ex }
  return _f
}
/** 弯曲场下的点：p 为形变坐标（x, y, s） */
function warpPoint(tb: BendTable, x: number, y: number, s: number, out: THREE.Vector3, sqx = 1, sqy = 1) {
  const F = frameAt(tb, s)
  return out.set(F.c[0] + F.x[0] * x * sqx + F.y[0] * y * sqy, F.c[1] + F.x[1] * x * sqx + F.y[1] * y * sqy, F.c[2] + F.x[2] * x * sqx + F.y[2] * y * sqy)
}
const _m4 = new THREE.Matrix4(), _vx = new THREE.Vector3(), _vy = new THREE.Vector3(), _vz = new THREE.Vector3()
function frameQuat(tb: BendTable, s: number, out: THREE.Quaternion) {
  const F = frameAt(tb, s)
  _vx.set(F.x[0], F.x[1], F.x[2]).normalize(); _vy.set(F.y[0], F.y[1], F.y[2]).normalize(); _vz.crossVectors(_vx, _vy)
  return out.setFromRotationMatrix(_m4.makeBasis(_vx, _vy, _vz))
}
/** 按弯曲场形变一份几何（首次调用记下静止位置/法线） */
function deform(geo: THREE.BufferGeometry, tb: BendTable, sqx: number, sqy: number, puffX = 1, puffY = 1) {
  const pa = geo.attributes.position as THREE.BufferAttribute, na = geo.attributes.normal as THREE.BufferAttribute
  let rp = geo.userData.restP as Float32Array | undefined, rn = geo.userData.restN as Float32Array | undefined
  if (!rp || !rn) { rp = geo.userData.restP = Float32Array.from(pa.array as Float32Array); rn = geo.userData.restN = Float32Array.from(na.array as Float32Array) }
  const P = pa.array as Float32Array, N = na.array as Float32Array
  for (let i = 0; i < pa.count; i++) {
    const o = i * 3, x = rp[o] * sqx * puffX, y = rp[o + 1] * sqy * puffY, s = rp[o + 2]
    const F = frameAt(tb, s)
    P[o] = F.c[0] + F.x[0] * x + F.y[0] * y; P[o + 1] = F.c[1] + F.x[1] * x + F.y[1] * y; P[o + 2] = F.c[2] + F.x[2] * x + F.y[2] * y
    const nx = rn[o], ny = rn[o + 1], nz = rn[o + 2]
    N[o] = F.x[0] * nx + F.y[0] * ny + F.z[0] * nz; N[o + 1] = F.x[1] * nx + F.y[1] * ny + F.z[1] * nz; N[o + 2] = F.x[2] * nx + F.y[2] * ny + F.z[2] * nz
  }
  pa.needsUpdate = true; na.needsUpdate = true
  geo.boundingSphere = null; geo.boundingBox = null
}

// ============================================================================
// 片段 → 姿势
// ============================================================================
const limb = (dz = 0, lift = 0, fk = 0, ang = 0, len = 1): FerrenLimb => ({ dz, lift, fk, ang, len })
/** 一次性片段的进出包络：in 段淡入、out 段淡出 */
const envelope = (u: number, a: number, b: number) => seg(u, 0, a) * (1 - seg(u, b, 1))

export function ferrenPose(clip: FerrenClip, t: number): FerrenPose {
  const C = FERREN_CLIPS[clip]
  const u = C.loop ? fract(t / C.dur) : clamp(t / C.dur)
  const P = clonePose(FERREN_REST)
  switch (clip) {
    case 'idle': {
      const br = Math.sin(u * TAU * 5) // 呼吸（约 0.8 s 一次）
      P.sqy = 1 + br * 0.018; P.sqx = 1 + br * 0.012; P.arch = 0.04 + br * 0.03
      // 张望：慢慢转头（两次），间隙快速嗅（鼻尖点动）
      P.hYaw = Math.sin(u * TAU) * 0.42 + Math.sin(u * TAU * 3 + 1) * 0.08
      P.hPitch = -0.08 + Math.sin(u * TAU * 2 + 0.6) * 0.1
      const sniff = Math.max(0, Math.sin(u * TAU * 2 - 1)) // 嗅的阵发
      P.kPitch = Math.sin(t * 34) * 0.035 * sniff - 0.05; P.kRoll = Math.sin(u * TAU) * 0.12
      P.tYaw = Math.sin(u * TAU * 2) * 0.32; P.tWave = 0.35; P.tWavePh = u * TAU * 2; P.tPitch = 0.05; P.tLift = 0.25
      P.eyes = u > 0.62 && u < 0.645 ? 0.1 : 1 // 眨一下眼
      break
    }
    case 'walk': {
      // 对角小碎步：左前+右后同相、右前+左后差半周；弓背随步点上下（每周两次），整体轻微左右扭
      const p = u
      const A = 0.032, H = 0.024
      P.armL = { ...limb(), ...gait(p, A, H) }; P.legR = { ...limb(), ...gait(p + 0.04, A * 1.15, H * 1.1) }
      P.armR = { ...limb(), ...gait(p + 0.5, A, H) }; P.legL = { ...limb(), ...gait(p + 0.54, A * 1.15, H * 1.1) }
      P.arch = 0.32 + Math.sin(p * TAU * 2) * 0.06
      P.sway = 0.07; P.swayPh = p * TAU
      P.y = 0.004 + Math.abs(Math.sin(p * TAU)) * 0.006
      P.hPitch = 0.08 + Math.sin(p * TAU * 2 + 0.5) * 0.04; P.hYaw = Math.sin(p * TAU) * 0.08
      P.tPitch = 0.08; P.tWave = 0.4; P.tWavePh = p * TAU; P.tYaw = Math.sin(p * TAU + 1.2) * 0.12; P.tLift = 0.15
      break
    }
    case 'run': {
      // 半跳跃步态：后腿几乎同步蹬地（脊柱伸展、身体拉长腾空），前腿接着落地、后腿收到身下（脊柱弓起收短）
      const p = u
      const flex = 0.5 + 0.5 * Math.cos(p * TAU) // 1 = 收（弓起） · 0 = 伸
      P.arch = lerp(-0.05, 0.95, flex); P.stretch = lerp(1.06, 0.92, flex)
      P.front = lerp(0, 0.18, flex)
      const hop = Math.max(0, Math.sin(p * TAU - 0.4)) // 伸展后的腾空
      P.y = 0.012 + hop * 0.05
      P.rx = Math.sin(p * TAU + 0.6) * 0.12; P.hy = 0.12; P.hz = -0.03
      const A = 0.06, H = 0.035
      P.legL = { ...limb(), ...gait(p + 0.02, A, H, 0.42) }; P.legR = { ...limb(), ...gait(p + 0.07, A, H, 0.42) }
      P.armL = { ...limb(), ...gait(p + 0.47, A * 0.9, H, 0.42) }; P.armR = { ...limb(), ...gait(p + 0.53, A * 0.9, H, 0.42) }
      for (const l of LIMBS) P[l].lift += hop * 0.03 // 腾空时脚掌跟着身体离地
      P.hPitch = -P.rx * 0.8 + 0.02; P.kPitch = -0.05
      P.tPitch = -0.12 + Math.sin(p * TAU + 2) * 0.12; P.tLift = 0.2; P.tWave = 0.2; P.tWavePh = p * TAU
      break
    }
    case 'wardance': {
      // 战舞：背弓到最高、尾巴炸毛，侧向连蹦（左一下右一下），落地时头甩向跳的方向，张嘴似的仰头
      const k = Math.sin(u * TAU) // 横向位置 -1..1
      const hops = Math.abs(Math.sin(u * TAU * 2)) // 每周期两跳
      P.arch = 1.25 + hops * 0.1; P.front = 0.25; P.rear = 0.15; P.stretch = 0.9; P.sqy = 1.04
      P.x = k * 0.07; P.y = hops * 0.05 + 0.01
      P.rz = -Math.cos(u * TAU) * 0.22 // 侧身：起跳时向外倾
      P.ry = Math.cos(u * TAU) * 0.35; P.curl = -Math.cos(u * TAU) * 0.5
      P.hYaw = Math.cos(u * TAU) * 0.55; P.hPitch = -0.15 - hops * 0.15; P.kRoll = Math.cos(u * TAU) * 0.25
      P.tPuff = 1.55; P.tPitch = -0.35; P.tLift = 0.45; P.tYaw = -Math.cos(u * TAU) * 0.4; P.tWave = 0.2; P.tWavePh = u * TAU * 2
      for (const l of LIMBS) { P[l].lift = hops * 0.05 + 0.005; P[l].dz = (l.startsWith('arm') ? 0.012 : -0.012) * (1 - hops) }
      P.armL.lift += hops * 0.02; P.armR.lift += hops * 0.02
      break
    }
    case 'sniff': {
      // 低头贴地：前半身下沉（前腿弯——IK 自动缩短），鼻尖扫地左右移动，鼻头高频点动
      const sweep = Math.sin(u * TAU)
      P.front = 0.55; P.arch = 0.25; P.rx = 0.16; P.hy = 0.11; P.hz = -0.17
      P.hPitch = 0.62; P.hYaw = sweep * 0.45; P.kPitch = 0.32 + Math.sin(t * 30) * 0.05; P.kRoll = sweep * 0.12
      P.curl = sweep * 0.25
      P.armL.dz = 0.01 + sweep * 0.012; P.armR.dz = 0.01 - sweep * 0.012
      P.tPitch = -0.1; P.tLift = 0.3; P.tWave = 0.25; P.tWavePh = u * TAU * 2
      break
    }
    case 'stand': {
      // 后腿站立：以髋为铰点整个身子竖起（约 62°），前爪垂在胸前，抬头左右张望，尾巴贴地撑着
      const lk = Math.sin(u * TAU)
      const br = Math.sin(u * TAU * 4)
      P.rx = -1.05 + br * 0.015; P.hy = 0.115; P.hz = FERREN_DIM.legL.z
      P.arch = -0.45; P.rear = -0.35; P.sqy = 1 + br * 0.015
      P.legL = limb(0.03, 0); P.legR = limb(0.03, 0)
      P.armL = limb(0, 0, 1, 0.75 + br * 0.04, 0.95); P.armR = limb(0, 0, 1, 0.65 - br * 0.04, 0.95)
      P.hPitch = 0.92; P.kPitch = 0.18 + Math.sin(t * 28) * 0.025; P.hYaw = lk * 0.55; P.kRoll = lk * 0.15
      P.tPitch = 1.15; P.tLift = -0.35; P.tYaw = Math.sin(u * TAU * 2) * 0.12
      break
    }
    case 'sleep': {
      // 蜷成一团：身体侧弯近一整圈（截面略压扁），四肢收在身下，头顺着圈埋到后腿边，尾巴从后面绕到身前搭在鼻子前；闭眼慢呼吸
      // 弯曲半径 = stretch·Lb/curl ≈ 0.08 m；把圈心平移到原点（窝中心），整团外径约 0.16 m，落在窝垫（内径 0.13 m）上、只轻靠边圈内坡
      const br = Math.sin(u * TAU * 2)
      P.curl = 4.7; P.arch = -0.15; P.stretch = 0.8; P.sqx = 0.82; P.sqy = 0.82 + br * 0.02
      const rr = (P.stretch * 0.46) / P.curl
      P.x = -rr; P.z = 0.03; P.hy = 0.1; P.hz = -0.03; P.ry = 0
      P.ground = 1
      P.hYaw = 1.2; P.hPitch = 0.3; P.hRoll = 0.4; P.kPitch = 0.12; P.kRoll = 0.35
      P.tCurl = -4.2; P.tPitch = 0.3; P.tYaw = 0.9; P.tLift = 0
      P.armL = limb(0, 0, 1, 1.3, 0.8); P.armR = limb(0, 0, 1, 1.3, 0.8)
      P.legL = limb(0, 0, 1, -1.25, 0.82); P.legR = limb(0, 0, 1, -1.25, 0.82)
      P.eyes = 0
      break
    }
    case 'eat': {
      // 进食：低头到碗口高度，咀嚼（头骨小幅快速点动 + 下颌抬落），偶尔抬头嚼两下
      const up = seg(u, 0.55, 0.65) * (1 - seg(u, 0.85, 0.95))
      const chew = Math.sin(t * TAU * 4.5)
      P.front = 0.4; P.arch = 0.2; P.rx = 0.08; P.hy = 0.11; P.hz = -0.17
      P.hPitch = lerp(0.62, 0.15, up); P.kPitch = lerp(0.3, 0.05, up) + chew * 0.06; P.kRoll = chew * 0.03
      P.hYaw = Math.sin(u * TAU) * 0.06
      P.armL.dz = 0.012; P.armR.dz = 0.012
      P.tPitch = 0.1; P.tWave = 0.15; P.tWavePh = u * TAU
      break
    }
    case 'pet': {
      // 被摸：背压低迎着手，头往上顶、左右蹭，歪头，眯眼，尾巴慢摇
      const rub = Math.sin(u * TAU)
      P.arch = -0.2; P.sqy = 0.94; P.y = -0.004
      P.hPitch = -0.3 + Math.abs(rub) * 0.08; P.hYaw = rub * 0.35; P.hRoll = rub * 0.3; P.kRoll = rub * 0.25; P.kPitch = -0.1
      P.rz = rub * 0.07; P.curl = rub * 0.25
      P.eyes = 0.2
      P.tYaw = Math.sin(u * TAU * 2) * 0.4; P.tWave = 0.3; P.tWavePh = u * TAU * 2; P.tPitch = 0.05
      break
    }
    case 'stretch': {
      // 伸懒腰：前爪尽量往前伸、胸口压低、屁股留在后面，身体拉长；顶点停住，接着回正
      const e = envelope(u, 0.32, 0.72), hold = seg(u, 0.32, 0.5) * (1 - seg(u, 0.6, 0.72))
      P.stretch = 1 + 0.14 * e; P.front = 0.25 * e; P.arch = -0.35 * e; P.sqy = 1 - 0.08 * e; P.sqx = 1 - 0.05 * e
      P.rx = 0.2 * e; P.hy = 0.115; P.hz = FERREN_DIM.legL.z
      P.armL = limb(0.11 * e, 0, e, -1.15 * e, 1 + 0.12 * e); P.armR = limb(0.1 * e, 0, e, -1.05 * e, 1 + 0.12 * e) // 前爪顺着身体往前伸（FK）
      P.legL = limb(-0.03 * e, 0); P.legR = limb(-0.03 * e, 0)
      P.hPitch = -0.35 * e; P.kPitch = -0.15 * e - hold * 0.1
      P.eyes = 1 - 0.85 * hold
      P.tLift = 0.6 * e; P.tPitch = -0.3 * e
      break
    }
    case 'noclip': {
      // 切行：对称时间线 q = 0→1→0（中点 = 完全消失）
      const q = u < 0.5 ? u * 2 : (1 - u) * 2
      const ball = seg(q, 0, 0.4)
      P.curl = 3.2 * ball; P.arch = 0.9 * ball; P.stretch = 1 - 0.18 * ball; P.sqy = 1 - 0.05 * ball
      P.hYaw = 1.0 * ball; P.hPitch = 0.6 * ball; P.tCurl = 3 * ball; P.tYaw = 0.7 * ball
      for (const l of LIMBS) P[l] = limb(0, 0, ball, l.startsWith('arm') ? 1.2 : -1.2, 1 - 0.2 * ball)
      P.ground = ball
      P.eyes = 1 - ball
      const shrink = seg(q, 0.78, 0.94)
      P.s = lerp(1, 0.62, ball) * (1 - shrink) + 0.001
      P.hy = 0.12; P.hz = -0.02
      // 闪烁：缩团后开始，越接近消失越密
      const fl = q > 0.42 && q < 0.95 ? (fract(t * lerp(9, 22, seg(q, 0.42, 0.9))) < 0.55 ? 1 : 0) : 1
      P.vis = q >= 0.95 ? 0 : fl
      P.x = q > 0.42 ? Math.sin(t * 97) * 0.006 * seg(q, 0.42, 0.9) : 0 // 位置抖动
      P.glow = seg(q, 0.7, 0.92) * (1 - seg(q, 0.97, 1) * 0.5); P.glowS = lerp(0.35, 1.05, seg(q, 0.7, 1))
      break
    }
    case 'roll': {
      // 打滚：四肢收起，绕身体长轴侧翻一整圈（中段在背上停一下乱蹬），身体略弯成 C 形
      const ang = TAU * (seg(u, 0, 0.42) * 0.5 + seg(u, 0.58, 1) * 0.5)
      const back = Math.sin(ang / 2) ** 2 // 0 → 1（仰面）→ 0
      P.rz = ang; P.hy = 0.12; P.ground = 1
      P.curl = 0.45 * back; P.arch = -0.2 * back
      const kick = Math.sin(t * TAU * 3) * back
      P.armL = limb(0, 0, 1, -0.6 + kick * 0.4, 0.9); P.armR = limb(0, 0, 1, -0.6 - kick * 0.4, 0.9)
      P.legL = limb(0, 0, 1, 0.5 - kick * 0.4, 0.9); P.legR = limb(0, 0, 1, 0.5 + kick * 0.4, 0.9)
      P.hYaw = 0.3 * back; P.hPitch = -0.2 * back; P.kRoll = -0.3 * back
      P.tCurl = 0.9 * back; P.tWave = 0.3; P.tWavePh = u * TAU * 3
      P.eyes = 1 - 0.4 * back
      break
    }
  }
  return P
}

// ============================================================================
// 姿势 → 部件
// ============================================================================
interface Rest { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }
const restOf = (o: THREE.Object3D): Rest => (o.userData.ferrenRest ??= { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() })
const BODY_TB = makeTable(-0.3, 0.32, 0.01), TAIL_TB = makeTable(-0.28, 0.04, 0.01)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler()
const _mC = new THREE.Matrix4(), _mH = new THREE.Matrix4(), _qr = new THREE.Quaternion(), _qri = new THREE.Quaternion()
const LIMB_LEN: Record<LimbKey, number> = { armL: FERREN_DIM.armL.y, armR: FERREN_DIM.armR.y, legL: FERREN_DIM.legL.y, legR: FERREN_DIM.legR.y }

function rigOf(parts: THREE.Object3D | FerrenRig): FerrenRig | undefined {
  return (parts as THREE.Object3D).isObject3D ? ((parts as THREE.Object3D).userData.ferren as FerrenRig | undefined) : (parts as FerrenRig)
}

/** 一条腿（枢轴组 + 腿网格）在 face 空间（地面 y = 0）的最低点 */
function limbMinY(root: THREE.Object3D, o: THREE.Object3D) {
  const mesh = o.children[0] as THREE.Mesh
  o.updateMatrix(); mesh.updateMatrix()
  _mC.multiplyMatrices(root.matrix, o.matrix).multiply(mesh.matrix)
  const pa = mesh.geometry.attributes.position.array as Float32Array, e = _mC.elements
  let minY = Infinity
  for (let i = 0; i < pa.length; i += 3) { const y = e[1] * pa[i] + e[5] * pa[i + 1] + e[9] * pa[i + 2] + e[13]; if (y < minY) minY = y }
  return minY
}

/** 把姿势写到部件上（无状态：所有相关部件都从建模姿势重新求值） */
export function applyFerrenPose(parts: THREE.Object3D | FerrenRig, P: FerrenPose) {
  const R = rigOf(parts)
  if (!R) return
  const tc = R.torsoOrigin
  // ---------- 脊柱弯曲场（躯干局部 s = z - tc.z）----------
  const Lb = 0.46
  const win = (s: number) => clamp((s + 0.26) / 0.05) * clamp((0.3 - s) / 0.05)
  const kw = TAU / Lb
  fillTable(BODY_TB,
    (s) => P.arch * gaussN(s, 0, 0.085) + P.front * gaussN(s, 0.13, 0.055) + P.rear * gaussN(s, -0.13, 0.055),
    (s) => (P.curl / Lb) * win(s) + P.sway * kw * Math.cos(kw * s + P.swayPh),
    P.stretch)
  deform(R.torso.geometry, BODY_TB, P.sqx, P.sqy)
  R.torso.position.copy(tc); R.torso.quaternion.identity(); R.torso.scale.set(1, 1, 1)
  /** 模型空间点 → 弯曲后的 root 空间点 */
  const warpM = (p: THREE.Vector3, out: THREE.Vector3) => warpPoint(BODY_TB, p.x, p.y - tc.y, p.z - tc.z, out, P.sqx, P.sqy).add(tc)
  const bendQ = (z: number, out: THREE.Quaternion) => frameQuat(BODY_TB, z - tc.z, out)

  // ---------- 头 ----------
  const hr = restOf(R.head)
  warpM(hr.p, R.head.position)
  bendQ(hr.p.z, R.head.quaternion).multiply(_q.setFromEuler(_e.set(P.hPitch, P.hYaw, P.hRoll, 'YXZ')))
  const kr = restOf(R.skull)
  R.skull.quaternion.copy(kr.q).multiply(_q.setFromEuler(_e.set(P.kPitch, P.kYaw, P.kRoll, 'YXZ')))
  for (const e of R.eyes) { const r = restOf(e); e.scale.set(r.s.x, r.s.y * (0.12 + 0.88 * clamp(P.eyes)), r.s.z) }
  for (const g of R.glints) g.visible = P.eyes > 0.45

  // ---------- 尾 ----------
  const tr = restOf(R.tail)
  warpM(tr.p, R.tail.position)
  bendQ(tr.p.z, R.tail.quaternion).multiply(_q.setFromEuler(_e.set(P.tPitch, P.tYaw, 0, 'YXZ'))).multiply(tr.q)
  const Lt = 0.24, tw = TAU / 0.3
  fillTable(TAIL_TB,
    (s) => -(P.tLift / Lt) * clamp(-s / 0.04),
    (s) => -(P.tCurl / Lt) * clamp(-s / 0.03) + P.tWave * tw * Math.cos(tw * s + P.tWavePh) * clamp(-s / 0.08),
    1)
  deform(R.tailMesh.geometry, TAIL_TB, 1, 1, P.tPuff, P.tPuff)

  // ---------- 整体 root：绕铰点 H 旋转、缩放，再平移 ----------
  const root = R.root
  _qr.setFromEuler(_e.set(P.rx, P.ry, P.rz, 'YXZ'))
  const H = _w.set(0, P.hy, P.hz)
  _v.copy(H).multiplyScalar(P.s).applyQuaternion(_qr)
  root.quaternion.copy(_qr); root.scale.setScalar(P.s)
  root.position.set(P.x, P.y, P.z).add(H).sub(_v)
  root.visible = P.vis > 0.5

  // ---------- 四肢：先摆 FK，IK 等定好高度再解 ----------
  const pivots: Record<LimbKey, THREE.Group> = { armL: R.armL, armR: R.armR, legL: R.legL, legR: R.legR }
  for (const l of LIMBS) {
    const o = pivots[l], r = restOf(o)
    warpM(r.p, o.position)
    o.scale.set(r.s.x, r.s.y, r.s.z)
  }
  const fkLimb = (l: LimbKey, lp: FerrenLimb, out: THREE.Quaternion) => bendQ(restOf(pivots[l]).p.z, out).multiply(_q2.setFromAxisAngle(_vx.set(1, 0, 0), lp.ang))
  for (const l of LIMBS) if (P[l].fk >= 0.999) { const o = pivots[l]; fkLimb(l, P[l], o.quaternion); o.scale.y = P[l].len }

  // ---------- 地面：躯干/尾/头/（FK）爪的最低点 ----------
  root.updateMatrix()
  let minY = Infinity
  const scan = (obj: THREE.Object3D, M: THREE.Matrix4, stride: number) => {
    const g = (obj as THREE.Mesh).geometry, pa = g.attributes.position.array as Float32Array, e = M.elements
    for (let i = 0; i < pa.length; i += 3 * stride) { const y = e[1] * pa[i] + e[5] * pa[i + 1] + e[9] * pa[i + 2] + e[13]; if (y < minY) minY = y }
  }
  R.torso.updateMatrix(); scan(R.torso, _mC.multiplyMatrices(root.matrix, R.torso.matrix), 1) // [ferren] 阶段 3：逐顶点（隔点采样在打滚时漏掉最低点 ~6 mm）
  R.tail.updateMatrix(); scan(R.tailMesh, _mC.multiplyMatrices(root.matrix, R.tail.matrix), 1)
  R.head.updateMatrix(); R.skull.updateMatrix()
  _mC.multiplyMatrices(root.matrix, R.head.matrix).multiply(R.skull.matrix)
  // [ferren] 阶段 3：头骨上的网格（头、耳、眼、鼻）逐顶点量——原 8 个采样点漏掉耳尖（打滚时耳朵扎进地里 ~6 mm）
  _mH.copy(_mC)
  for (const c of R.skull.children) { const mm = c as THREE.Mesh; if (!mm.isMesh) continue; mm.updateMatrix(); scan(mm, _mC.multiplyMatrices(_mH, mm.matrix), 1) }
  for (const l of LIMBS) if (P[l].fk >= 0.999) { const y = limbMinY(root, pivots[l]); if (y < minY) minY = y } // [ferren] 阶段 3：收起的爪按整条腿网格量（原 4 个采样点漏掉爪尖/脚掌侧缘）
  const lift = minY < 0 ? -minY : -minY * clamp(P.ground)
  if (Number.isFinite(lift)) { root.position.y += lift; root.updateMatrix() }

  // ---------- IK：脚掌目标（face 空间）→ root 空间里的摆角与伸缩 ----------
  _qri.copy(_qr).invert()
  const solve = (l: LimbKey, lp: FerrenLimb, extra: number) => {
    const o = pivots[l]
    const hip = _v.copy(o.position).applyMatrix4(root.matrix)
    const d = _w.set(0, lp.lift + 0.005 + extra - hip.y, lp.dz).applyQuaternion(_qri).divideScalar(P.s) // +5 mm：脚掌底/爪尖在枢轴长度之下
    const ang = Math.atan2(-d.z, -d.y)
    const len = clamp(Math.hypot(d.y, d.z) / LIMB_LEN[l], 0.7, 1.22)
    o.quaternion.setFromAxisAngle(_vx.set(1, 0, 0), ang)
    o.scale.y = len
    if (lp.fk > 0.001) { fkLimb(l, lp, _q); o.quaternion.slerp(_q, lp.fk); o.scale.y = lerp(len, lp.len, lp.fk) }
  }
  let rootLift = 0
  for (const l of LIMBS) {
    const lp = P[l]
    if (lp.fk >= 0.999) continue
    solve(l, lp, 0)
    // [ferren] 阶段 3：防穿地——解完量这条腿网格的最低点，低于地面就把目标抬高差值再解（脚掌倾斜/爪尖前探/FK 混合时
    // 「枢轴下 5 mm」的近似不够，walk/run/stretch 原来会扎进地里 1–2 cm）；IK 收不回来（长度夹到下限）的剩余量由整只抬高兜底
    let extra = 0
    for (let k = 0; k < 4; k++) {
      const y = limbMinY(root, pivots[l])
      if (y >= -0.0005) break
      extra += -y / Math.max(0.25, 1 - lp.fk); solve(l, lp, extra)
      if (k === 3) { const y2 = limbMinY(root, pivots[l]); if (y2 < 0) rootLift = Math.max(rootLift, -y2) }
    }
  }
  if (rootLift > 0) { root.position.y += rootLift; root.updateMatrix() }

  // ---------- 切行光晕 ----------
  const g = R.glow, gm = g.material as THREE.SpriteMaterial
  g.visible = P.glow > 0.01
  gm.opacity = 0.9 * clamp(P.glow)
  g.scale.setScalar(Math.max(0.01, 0.4 * P.glowS))
}

/** 播放片段：t = 片段内时间（秒）；w = 混合权重（0 = 静止建模姿势，1 = 片段全量） */
export function animateFerren(parts: THREE.Object3D | FerrenRig, clip: FerrenClip, t: number, w = 1) {
  const P = ferrenPose(clip, t)
  applyFerrenPose(parts, w >= 1 ? P : mixFerrenPose(FERREN_REST, P, clamp(w)))
}
