// Nguithr'xurh（Entity 16）重制——第 2 阶段：程序化动画。
//
// 设计（与 jerryMesh 的写法一致：AI/状态机只输出「姿态量」，渲染层据此摆骨骼）：
//   NguithrPose            一组纯数值的姿态量（翻转、下降、蹲伏、步态速度/转向、收腿、缩身、死亡、螯/须肢动作……）
//   poseNguithr(grp,p,t)   无状态：按姿态量 + 时间 t（只用于呼吸/抽腿/咀嚼等细节噪声）摆好全部 58 根骨骼和挂丝
//   NguithrAnimator        有状态：target → pose 的逐字段指数平滑（所有过渡都是姿态量插值），并积分步态相位
//   nguithrStepRoot        按 pose.speed/turn 推进外层组的世界位置/朝向（地面爬行与天花板爬行通用，第 3 阶段 AI 直接用）
//   nguithrClipPose        9 个演示片段（idle/cut/descend/crawl/feed/climb/sleep/cower/dead/spray）+ loop 串联，返回目标姿态
//
// 坐标约定（全部在「挂载系」= 模型空间：+Z 正面、+Y 背向（远离附着面）、y=0 为附着面；单位 m，未乘个体缩放）：
//   · 腿的「贴附」目标在挂载系里给出（足尖落在 y≈0 平面），所以身体蹲伏/俯仰/平移时足尖原地不动（IK 保证）。
//   · 「自由」目标（挂丝悬空、死亡蜷腿、须肢）在胸节骨（body）局部系里给出，随身体一起动。
//   · 翻转（flip）= 绕腹末纺器点俯仰：0 倒挂天花板 → 0.5 头朝下吊在丝上 → 1 正立着地。
//     flip=1 且 drop=nguithrFloorDrop(天花板高, 缩放) 时，倒挂外层组里的它恰好正立踩在地面上，
//     并且与「外层组正立放在地面（rotation.x=0, y=0）、flip=0、沿朝向前移 0.67×缩放 m」完全等价——第 3 阶段可以在落地后无缝换挂载。
//   · drop：沿丝下降距离（世界 m）。倒挂时外层组局部 +Y 指向地面。
//   · 挂丝：外层组内一根 LineSegments，从天花板锚点（纺器正上方）连到纺器当前位置，pose.thread 控制可见度。
//
// CPU/GPU 蒙皮：本模块只写骨骼局部变换，GPU 蒙皮由 three 每帧自动上传；QA 的 CPU 蒙皮替身（qaCpuSkin.ts）每帧渲染前烘焙即可。
import * as THREE from 'three'
import { buildNguithrMesh, NG_BODY_Y, NG_BONES, NG_BONE_REST, NG_LEGS, NG_PALPS, NG_SPINNERET, type NgLimb, type NguithrRig } from './nguithrMesh'

type V3 = THREE.Vector3
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const PI = Math.PI
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k) }
/** 在 [a,b] 区间内从 0 平滑升到 1 */
const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a))
/** a→b 升、c→d 降的平滑窗 */
const win = (t: number, a: number, b: number, c: number, d: number) => ramp(t, a, b) * (1 - ramp(t, c, d))
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
const frac = (x: number) => x - Math.floor(x)

// ============================================================================
// 姿态量
// ============================================================================
export interface NguithrPose {
  // ---- 挂载 / 根 ----
  /** 0 倒挂天花板 → 0.5 头朝下吊丝 → 1 正立（绕纺器点俯仰 180°） */
  flip: number
  /** 沿丝下降距离（世界 m，远离天花板方向） */
  drop: number
  /** 挂丝可见度 0..1 */
  thread: number
  /** 死亡翻倒 0..1（绕身体纵轴侧翻 180°，背部着地） */
  dead: number
  // ---- 身体 ----
  /** 蹲伏：身体向附着面压低 0..1（负值=抬高身体） */
  crouch: number
  /** 俯仰（rad，正=抬头）、侧滚、偏航（相对挂载系） */
  bodyPitch: number; bodyRoll: number; bodyYaw: number
  /** 身体在挂载系内平移（m，X=左、Z=前） */
  shiftX: number; shiftZ: number
  /** 呼吸幅度 0..1（腹部起伏、身体微动） */
  breath: number
  /** 颤抖 0..1（受击时） */
  tremble: number
  // ---- 步足 ----
  /** 足尖贴附权重：1 = 贴在附着面（IK），0 = 自由姿态（悬丝/死亡） */
  plant: number
  /** 爬行速度（世界 m/s，沿身体正前方）、转向角速度（rad/s，绕身体背向轴，正=向左） */
  speed: number; turn: number
  /** 步态相位（周期数，由 NguithrAnimator 按速度积分；手动驱动时自己累加） */
  gaitPhase: number
  /** 足尖径向伸展系数（1 = 静息） */
  spread: number
  /** 休眠收腿 0..1（足尖向身体轴收拢、膝高拱，贴身） */
  tuck: number
  /** 受击缩身 0..1（足尖强收、膝部合拢成笼、身体紧贴附着面） */
  cower: number
  /** 悬空时腿的半屈张开姿态 0..1（plant<1 时生效） */
  dangle: number
  /** 自由蜷腿 0..1（死亡：腿向腹面蜷起） */
  curl: number
  /** 后两对足操丝（垂降控速/爬升时交替收丝）0..1 */
  reel: number
  /** 偶发单腿抽动强度 0..1 */
  twitch: number
  // ---- 头 / 口器 / 须肢 ----
  headPitch: number; headYaw: number
  /** 螯指张开 0..1 */
  chelOpen: number
  /** 螯交替撕咬幅度 0..1 */
  chelBite: number
  /** 两螯外张 0..1 */
  chelSpread: number
  /** 须肢抱持（向螯下方合抱）0..1 */
  palpHold: number
  /** 须肢高举（威吓/喷射）0..1 */
  palpRaise: number
  /** 须肢收拢贴身 0..1 */
  palpTuck: number
  // ---- 动作 ----
  /** 切丝：前足伸向目标 0..1；目标点在挂载系（m，倒挂时 y>0 即天花板下方） */
  reach: number; reachX: number; reachY: number; reachZ: number
  /** 切丝时足尖锯动 0..1 */
  reachSaw: number
  /** 喷射脉冲 0..1（短促前冲 + 腹部收缩） */
  spray: number
  /** 腹部上翘 0..1（喷射/威吓） */
  abdLift: number
  /** 进食腹部起伏 0..1 */
  abdPulse: number
}

export const NG_POSE_DEFAULT: Readonly<NguithrPose> = Object.freeze({
  flip: 0, drop: 0, thread: 0, dead: 0,
  crouch: 0, bodyPitch: 0, bodyRoll: 0, bodyYaw: 0, shiftX: 0, shiftZ: 0, breath: 1, tremble: 0,
  plant: 1, speed: 0, turn: 0, gaitPhase: 0, spread: 1, tuck: 0, cower: 0, dangle: 0, curl: 0, reel: 0, twitch: 1,
  headPitch: 0, headYaw: 0, chelOpen: 0, chelBite: 0, chelSpread: 0, palpHold: 0, palpRaise: 0, palpTuck: 0,
  reach: 0, reachX: 0.6, reachY: 0.15, reachZ: 0.6, reachSaw: 0, spray: 0, abdLift: 0, abdPulse: 0,
})
const KEYS = Object.keys(NG_POSE_DEFAULT) as (keyof NguithrPose)[]

/** 默认姿态 + 覆盖 */
export function nguithrPose(p: Partial<NguithrPose> = {}): NguithrPose { return { ...NG_POSE_DEFAULT, ...p } }

/** out = a + (b-a)·k（逐字段；gaitPhase 也插值） */
export function lerpNguithrPose(a: NguithrPose, b: NguithrPose, k: number, out: NguithrPose = nguithrPose()): NguithrPose {
  for (const key of KEYS) out[key] = lerp(a[key], b[key], k)
  return out
}

/** 世界 m → 落地所需的 drop（倒挂外层组在天花板高 ceilH 处时） */
export function nguithrFloorDrop(ceilH: number, scale = 1) { return ceilH - 2 * NG_SPINNERET.y * scale }

/** 步态频率（周期/秒）：速度/转向（模型单位）越大越快，静止为 0 */
export function nguithrGaitFreq(speedModel: number, turn: number) { return Math.min(1.5, (Math.abs(speedModel) + Math.abs(turn) * 0.45) / 0.16) }

// ============================================================================
// 预计算的附肢数据（胸节骨局部系）
// ============================================================================
interface LimbData {
  L: NgLimb; hip: V3; coxaEnd: V3; tip: V3; d1: V3; d2: V3; L1: number; L2: number
  restAng: number; restDist: number; theta: number
  /** 模型空间髋点（贴附目标的参照） */
  hipM: V3
  bones: [number, number, number]
  /** 静息姿态的不对称微偏：外展角偏、径向偏、膝弯侧向偏 */
  jA: number; jR: number; jK: number
  phaseOff: number
}
const BODY_REST = V(0, NG_BODY_Y, 0)
let LIMBS: LimbData[] | null = null, PALPS: LimbData[] | null = null
function limbData(L: NgLimb, k: number): LimbData {
  const hip = L.hip.clone().sub(BODY_REST), coxaEnd = L.coxaEnd.clone().sub(BODY_REST), knee = L.knee.clone().sub(BODY_REST), tip = L.tip.clone().sub(BODY_REST)
  const d1 = knee.clone().sub(coxaEnd), d2 = tip.clone().sub(knee)
  const L1 = d1.length(), L2 = d2.length(); d1.normalize(); d2.normalize()
  const restAng = Math.atan2(tip.x - hip.x, tip.z - hip.z)
  const restDist = Math.hypot(tip.x - hip.x, tip.z - hip.z)
  // 波形步态：后足先迈、向前传递；左右反相
  const phaseOff = frac((6 - L.index) * 0.14 + (L.side > 0 ? 0 : 0.5))
  return {
    L, hip, coxaEnd, tip, d1, d2, L1, L2, restAng, restDist, theta: Math.abs(restAng), hipM: L.hip.clone(), bones: L.bones,
    jA: (hash(k * 3.1 + 1) - 0.5) * 0.22, jR: (hash(k * 5.7 + 2) - 0.5) * 0.12, jK: (hash(k * 2.3 + 3) - 0.5) * 0.5, phaseOff,
  }
}
function limbs() {
  if (!LIMBS) { LIMBS = NG_LEGS.map((L, k) => limbData(L, k)); PALPS = NG_PALPS.map((L, k) => limbData(L, k + 40)) }
  return { legs: LIMBS, palps: PALPS! }
}

// ============================================================================
// IK：基节偏航 + 腿节/胫跗节两骨解析解（全部在胸节骨局部系）
// ============================================================================
const _Y = V(0, 1, 0)
const _qc = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qd = new THREE.Quaternion()
const _c = V(), _u = V(), _p = V(), _k = V(), _f = V(), _D1 = V(), _D2 = V(), _tmp = V()
function solveLimb(bones: THREE.Bone[], d: LimbData, T: V3, pole: V3) {
  const ang = Math.atan2(T.x - d.hip.x, T.z - d.hip.z)
  let da = ang - d.restAng; while (da > PI) da -= 2 * PI; while (da < -PI) da += 2 * PI
  // 基节偏航限幅（避免腿横扫穿过身体）
  da = Math.max(-1.25, Math.min(1.25, da))
  _qc.setFromAxisAngle(_Y, da)
  _c.copy(d.coxaEnd).sub(d.hip).applyQuaternion(_qc).add(d.hip)
  _u.copy(T).sub(_c)
  let dist = _u.length()
  if (dist < 1e-5) { _u.set(0, -1, 0); dist = 1e-5 } else _u.divideScalar(dist)
  dist = Math.max(Math.abs(d.L1 - d.L2) + 0.004, Math.min(d.L1 + d.L2 - 0.002, dist))
  const a = (d.L1 * d.L1 - d.L2 * d.L2 + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, d.L1 * d.L1 - a * a))
  _p.copy(pole).addScaledVector(_u, -pole.dot(_u))
  if (_p.lengthSq() < 1e-8) _p.set(0, 1, 0).addScaledVector(_u, -_u.y)
  _p.normalize()
  _k.copy(_c).addScaledVector(_u, a).addScaledVector(_p, h)
  _f.copy(_c).addScaledVector(_u, dist)
  _D1.copy(_k).sub(_c).normalize(); _D2.copy(_f).sub(_k).normalize()
  _qf.setFromUnitVectors(_tmp.copy(d.d1).applyQuaternion(_qc), _D1).multiply(_qc)
  _qt.setFromUnitVectors(_tmp.copy(d.d2).applyQuaternion(_qf), _D2).multiply(_qf)
  bones[d.bones[0]].quaternion.copy(_qc)
  bones[d.bones[1]].quaternion.copy(_qi.copy(_qc).invert().multiply(_qf))
  bones[d.bones[2]].quaternion.copy(_qd.copy(_qf).invert().multiply(_qt))
}

// ============================================================================
// 姿态求解
// ============================================================================
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _mb = new THREE.Matrix4(), _mbi = new THREE.Matrix4(), _mm = new THREE.Matrix4()
const _e = new THREE.Euler(), _s1 = V(1, 1, 1)
const _plant = V(), _free = V(), _tgt = V(), _pole = V(), _v = V(), _dir = V()
const SPIN = NG_SPINNERET
const DEAD_PIVOT_Y = 0.112
const B = NG_BONES

interface ThreadState { line: THREE.LineSegments; mat: THREE.LineBasicMaterial; anchor: V3 }
let THREAD_MAT: THREE.LineBasicMaterial | null = null
function threadOf(rig: NguithrRig): ThreadState {
  const ud = rig.inner.userData as { ngThread?: ThreadState }
  if (ud.ngThread) return ud.ngThread
  if (!THREAD_MAT) THREAD_MAT = new THREE.LineBasicMaterial({ color: '#8f8a80', transparent: true, opacity: 0.55, depthWrite: false })
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3))
  const line = new THREE.LineSegments(g, THREAD_MAT.clone()); line.frustumCulled = false; line.name = 'nguithrDragline'; line.visible = false
  rig.inner.add(line)
  return (ud.ngThread = { line, mat: line.material as THREE.LineBasicMaterial, anchor: V(SPIN.x, 0, SPIN.z) })
}

/** 挂载系矩阵（inner 内）：drop 平移 · 绕纺器俯仰 flip · 绕身体纵轴侧翻 dead */
function mountMatrix(p: NguithrPose, sc: number, out: THREE.Matrix4) {
  out.makeTranslation(0, p.drop / sc, 0)
  out.multiply(_m.makeTranslation(SPIN.x, SPIN.y, SPIN.z)).multiply(_m.makeRotationX(-PI * p.flip)).multiply(_m.makeTranslation(-SPIN.x, -SPIN.y, -SPIN.z))
  // 侧翻途中整体抬起（翻滚时下侧的腿不扫穿地面）
  if (p.dead > 1e-4) out.multiply(_m.makeTranslation(0, DEAD_PIVOT_Y + Math.sin(PI * smooth(p.dead)) * 0.42, 0)).multiply(_m.makeRotationZ(PI * smooth(p.dead))).multiply(_m.makeTranslation(0, -DEAD_PIVOT_Y, 0))
  return out
}

/**
 * 摆姿态。grp：buildNguithrMesh / buildNguithrAnimated 返回的外层组；t：秒（只驱动呼吸、抽腿、咀嚼、颤抖等细节）。
 * 无状态、可每帧调用；平滑过渡请用 NguithrAnimator 产生 pose。
 */
export function poseNguithr(grp: THREE.Object3D, p: NguithrPose, t: number) {
  const rig = grp.userData.nguithrRig as NguithrRig | undefined
  if (!rig) return
  const bones = rig.bones, rest = rig.rest, sc = rig.scale
  const { legs, palps } = limbs()

  // ---- 挂载（翻转/下降/死亡侧翻）----
  mountMatrix(p, sc, _mm)
  _mm.decompose(rig.mount.position, rig.mount.quaternion, rig.mount.scale)

  // ---- 胸节 ----
  const vModel = p.speed / sc
  const fG = nguithrGaitFreq(vModel, p.turn)
  const moving = clamp01((Math.abs(vModel) + Math.abs(p.turn) * 0.45) / 0.03)
  const br = Math.sin(t * 1.15) * p.breath
  const tr = p.tremble
  const trem = (k: number) => (Math.sin(t * 41 + k * 1.7) * 0.6 + Math.sin(t * 67 + k * 2.9) * 0.4) * tr
  const sprayJ = p.spray
  const body = bones[B.body]
  body.position.set(
    rest[B.body].x + p.shiftX + trem(1) * 0.003,
    rest[B.body].y - p.crouch * 0.07 + br * 0.0025 + Math.sin(p.gaitPhase * 4 * PI) * 0.006 * moving + trem(2) * 0.003 - p.cower * 0.035 - p.tuck * 0.02,
    rest[B.body].z + p.shiftZ + sprayJ * 0.035,
  )
  const gaitRoll = Math.sin(p.gaitPhase * 2 * PI) * 0.025 * moving
  body.quaternion.setFromEuler(_e.set(-(p.bodyPitch + sprayJ * 0.06), p.bodyYaw + p.turn * 0.12, p.bodyRoll + gaitRoll + trem(3) * 0.02, 'YXZ'))

  // ---- 头胸 / 螯 ----
  bones[B.head].quaternion.setFromEuler(_e.set(-(p.headPitch + sprayJ * 0.12) + p.cower * 0.12, p.headYaw, 0, 'YXZ'))
  for (const s of [1, -1] as const) {
    const tag = s > 0 ? 'L' : 'R'
    const chel = bones[B[`chel${tag}`]], fing = bones[B[`chelFinger${tag}`]]
    const bite = p.chelBite * Math.sin(t * 7.5 + (s > 0 ? 0 : PI)) // 左右交替
    chel.position.set(rest[B[`chel${tag}`]].x + s * p.chelSpread * 0.008, rest[B[`chel${tag}`]].y, rest[B[`chel${tag}`]].z + bite * 0.022 - p.cower * 0.01)
    chel.quaternion.setFromEuler(_e.set(-p.chelOpen * 0.22 + bite * 0.12 + p.chelBite * 0.08, s * (p.chelSpread * 0.22 - Math.max(0, bite) * 0.04), 0, 'YXZ'))
    const open = clamp01(p.chelOpen * 0.85 + p.chelBite * (0.35 + 0.35 * Math.sin(t * 15 + (s > 0 ? 1 : 2.4))))
    fing.quaternion.setFromAxisAngle(_v.set(1, 0, 0), open * 0.75)
  }
  // ---- 腹部：呼吸/进食起伏/上翘 ----
  const pulse = p.abdPulse * (0.5 + 0.5 * Math.sin(t * 3.2))
  const lift = p.abdLift - p.tuck * 0.05 + p.cower * 0.15 - p.curl * 0.2
  // 绕 X 轴正转 = 腹末向背侧翘起（腹部在原点后方，z<0）
  bones[B.abd0].quaternion.setFromAxisAngle(_v.set(1, 0, 0), lift * 0.32 + br * 0.012 + sprayJ * 0.1)
  bones[B.abd1].quaternion.setFromAxisAngle(_v.set(1, 0, 0), lift * 0.14 + pulse * 0.05)
  bones[B.abd2].quaternion.setFromAxisAngle(_v.set(1, 0, 0), lift * 0.1 - p.curl * 0.2 + pulse * 0.04)
  const swell = 1 + br * 0.018 + pulse * 0.05 - sprayJ * 0.06
  bones[B.abd1].scale.set(swell, swell, 1 + (swell - 1) * 0.4)

  // 胸节在挂载系里的矩阵（root 骨保持静止）
  bones[B.root].position.copy(rest[B.root]); bones[B.root].quaternion.identity()
  _mb.compose(body.position, body.quaternion, _s1)
  _mbi.copy(_mb).invert()

  // ---- 偶发单腿抽动（每 3.7s 一个时段，约半数时段抽一次）----
  const seg = Math.floor(t / 3.7), hs = hash(seg + 0.37)
  const twLeg = hs < 0.6 ? Math.floor(hash(seg + 7.1) * legs.length) : -1
  const tw0 = seg * 3.7 + hash(seg + 3.3) * 2.6
  const twEnv = twLeg >= 0 ? Math.sin(PI * clamp01((t - tw0) / 0.42)) * p.twitch * p.plant * (1 - p.cower) : 0

  // 丝线方向（挂载→胸节局部）：用于操丝
  const reel = p.reel * (1 - p.plant)

  // ---- 步足 ----
  const reachSide = p.reachX >= 0 ? 1 : -1
  const beta = 0.75
  const stride = fG > 1e-4 ? beta / fG : 0
  for (let k = 0; k < legs.length; k++) {
    const d = legs[k], s = d.L.side, i = d.L.index
    // 贴附目标（挂载系）：静息外展角 + 不对称微偏，收腿/缩身时向身体轴压缩
    let th = d.theta + d.jA, r = d.restDist * p.spread * (0.85 + d.jR)
    const thT = th < PI / 2 ? th * 0.42 : PI - (PI - th) * 0.42
    th = lerp(th, thT, p.tuck); r = lerp(r, d.restDist * 0.58, p.tuck)
    const thC = th < PI / 2 ? th * 0.65 : PI - (PI - th) * 0.65
    th = lerp(th, thC, p.cower); r = lerp(r, d.restDist * 0.4, p.cower)
    _plant.set(d.hipM.x + s * Math.sin(th) * r, 0.006, d.hipM.z + Math.cos(th) * r)
    // 步态：支撑期足尖相对身体后移、摆动期抬起前送；转向时按 ω×r 的切向速度
    if (stride > 0 && moving > 0.001) {
      const ph = frac(p.gaitPhase + d.phaseOff)
      let off: number, liftH = 0
      if (ph < beta) off = 0.5 - ph / beta
      else { const u = (ph - beta) / (1 - beta); off = -0.5 + smooth(u); liftH = Math.sin(PI * u) }
      const vx = p.turn * _plant.z, vz = vModel - p.turn * _plant.x
      _plant.x += vx * stride * off * moving; _plant.z += vz * stride * off * moving
      _plant.y += liftH * 0.075 * moving
    }
    // 抽腿
    if (k === twLeg && twEnv > 0) { _plant.y += twEnv * 0.09; _plant.x -= s * twEnv * 0.04 }
    // 颤抖
    if (tr > 0) _plant.y += Math.max(0, trem(k + 5)) * 0.012
    // 切丝：一侧最前足伸向目标并锯动
    if (i === 0 && s === reachSide && p.reach > 1e-3) {
      _tgt.set(p.reachX, p.reachY, p.reachZ)
      const saw = Math.sin(t * 16) * p.reachSaw
      _tgt.y += saw * 0.035; _tgt.x += saw * 0.02 * -s
      // 限制在可达范围内
      _v.copy(_tgt).sub(d.hipM); const maxR = (d.L1 + d.L2) * 0.97 + 0.04
      if (_v.length() > maxR) _tgt.copy(d.hipM).addScaledVector(_v.normalize(), maxR)
      const rk = smooth(p.reach)
      _plant.lerp(_tgt, rk); _plant.y += Math.sin(PI * rk) * 0.12 * (1 - p.reachSaw)
    }
    _plant.applyMatrix4(_mbi) // → 胸节局部
    // 自由目标（胸节局部）：悬空半屈张开 / 死亡向腹面蜷起 / 操丝
    // 悬空：腿向外张开、较舒展（中段足更偏侧向），各腿高低/角度错落，避免整齐的「肋骨」排列
    const da = d.restAng + s * (d.jA * 2.2 + (PI / 2 - d.theta) * -0.22) * p.dangle
    const cth = Math.cos(da), sth = Math.sin(da)
    const dr = d.restDist * (0.62 + (0.34 + d.jR * 1.5) * p.dangle)
    _free.set(d.hip.x + sth * dr, d.hip.y + 0.01 - (0.03 + 0.09 * hash(k * 9.7)) * p.dangle, d.hip.z + cth * dr)
    if (p.curl > 0) {
      // 足尖蜷到腹面下方（离基节端 ≥0.45m，两骨 IK 才能正常屈膝，否则膝会被顶到背侧）
      _tgt.set(d.hip.x + sth * 0.1, d.hip.y - 0.42, d.hip.z * 0.7 + cth * 0.06)
      _free.lerp(_tgt, smooth(p.curl))
    }
    if (reel > 0 && i >= 5) {
      // 后两对足抓丝：纺器上方丝线上的一点，左右交替上下收放
      const cyc = Math.sin(t * 5 + (s > 0 ? 0 : PI) + i)
      _tgt.set(SPIN.x, SPIN.y, SPIN.z).applyMatrix4(_m2.copy(_mm).invert().multiply(_m.makeTranslation(0, -0.13 - 0.06 * cyc, 0)).multiply(_mm)) // 挂载系内沿丝方向（inner -Y）
      _tgt.applyMatrix4(_mbi); _tgt.x += s * 0.03
      _free.lerp(_tgt, reel)
    }
    const pl = p.plant
    _tgt.copy(_free).lerp(_plant, pl)
    // 极向量：膝向背侧拱起，前足膝外偏、后足膝外偏（俯视时腿呈折线而非直线），带个体微偏
    const kLat = 0.5 * Math.cos(d.theta) + d.jK * 0.4
    _pole.set(s * Math.cos(d.restAng * s) * kLat, 1, -Math.sin(Math.abs(d.restAng)) * kLat)
    if (p.curl > 0) _pole.lerp(_dir.set(Math.sin(d.restAng), -0.05, Math.cos(d.restAng) * 0.5), p.curl * (1 - pl)) // 死亡蜷腿：膝向外、向腹面折（翻倒后朝上）
    solveLimb(bones, d, _tgt, _pole)
  }

  // ---- 须肢（胸节局部，自由）----
  for (const d of palps) {
    const s = d.L.side
    const sway = Math.sin(t * 0.9 + s * 1.3) * p.breath
    _tgt.copy(d.tip); _tgt.y += 0.012 * sway; _tgt.x += s * 0.008 * Math.sin(t * 0.6 + s)
    _v.set(s * 0.075, -0.115, 0.43); _tgt.lerp(_v, smooth(p.palpHold))
    if (p.palpHold > 0.01) _tgt.z += Math.sin(t * 3.4 + s) * 0.012 * p.palpHold
    _v.set(s * 0.21, 0.13, 0.43); _tgt.lerp(_v, smooth(p.palpRaise))
    _v.set(s * 0.11, -0.07, 0.3); _tgt.lerp(_v, smooth(Math.max(p.palpTuck, p.cower, p.curl, p.tuck * 0.7)))
    if (tr > 0) _tgt.y += trem(s + 30) * 0.006
    _pole.set(s * 0.3, 1, 0.2)
    if (p.curl > 0) _pole.lerp(_dir.set(s * 0.5, -1, 0.3), p.curl)
    solveLimb(bones, d, _tgt, _pole)
  }

  // ---- 挂丝 ----
  const th = threadOf(rig)
  th.line.visible = p.thread > 0.01
  if (th.line.visible) {
    th.mat.opacity = 0.5 * clamp01(p.thread)
    // 纺器当前位置（inner 系）= 挂载 · 胸节 · abd0 · abd1 · abd2 · 局部偏移
    _m2.copy(_mm).multiply(_mb)
    for (const nm of ['abd0', 'abd1', 'abd2']) { const b = bones[B[nm]]; _m2.multiply(_m.compose(b.position, b.quaternion, b.scale)) }
    _v.copy(SPIN).sub(NG_BONE_REST[B.abd2]).applyMatrix4(_m2)
    const arr = (th.line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
    arr[0] = th.anchor.x; arr[1] = th.anchor.y; arr[2] = th.anchor.z; arr[3] = _v.x; arr[4] = _v.y; arr[5] = _v.z
    th.line.geometry.attributes.position.needsUpdate = true
  }
}

// ============================================================================
// 动画器：逐字段平滑 + 步态相位积分
// ============================================================================
/** 各字段的平滑时间常数（秒）；未列出的用 0.28 */
const TAU: Partial<Record<keyof NguithrPose, number>> = {
  drop: 0.05, flip: 0.12, spray: 0.04, chelBite: 0.15, chelOpen: 0.12, tremble: 0.1, cower: 0.12, speed: 0.4, turn: 0.4,
  reachX: 0.25, reachY: 0.25, reachZ: 0.25, reach: 0.2, dead: 0.2, curl: 0.3, plant: 0.12, thread: 0.15, reachSaw: 0.12,
}
export class NguithrAnimator {
  pose: NguithrPose
  target: NguithrPose
  scale: number
  constructor(scale = 1, init: Partial<NguithrPose> = {}) { this.scale = scale; this.pose = nguithrPose(init); this.target = nguithrPose(init) }
  /** 设置目标姿态（只覆盖给出的字段） */
  set(p: Partial<NguithrPose>) { Object.assign(this.target, p); return this }
  /** 立即跳到目标（不插值） */
  snap() { const ph = this.pose.gaitPhase; Object.assign(this.pose, this.target); this.pose.gaitPhase = ph; return this }
  update(dt: number) {
    const p = this.pose, g = this.target
    for (const key of KEYS) {
      if (key === 'gaitPhase') continue
      const k = 1 - Math.exp(-dt / (TAU[key] ?? 0.28))
      p[key] += (g[key] - p[key]) * k
    }
    p.gaitPhase += nguithrGaitFreq(p.speed / this.scale, p.turn) * dt
    return p
  }
}

// ============================================================================
// 根运动与坐标换算（第 3 阶段 AI 用）
// ============================================================================
const _w = V(), _w2 = V()
/** 身体正前方（世界，单位向量）与背向（世界）——考虑翻转/倒挂 */
export function nguithrWorldAxes(grp: THREE.Object3D, fwd: V3, up?: V3) {
  const rig = grp.userData.nguithrRig as NguithrRig
  rig.mount.updateWorldMatrix(true, false)
  fwd.set(0, 0, 1).transformDirection(rig.mount.matrixWorld)
  if (up) up.set(0, 1, 0).transformDirection(rig.mount.matrixWorld)
}
/** 按 pose.speed/turn 推进外层组（地面正立或天花板倒挂都适用） */
export function nguithrStepRoot(grp: THREE.Object3D, p: NguithrPose, dt: number) {
  if (Math.abs(p.speed) < 1e-5 && Math.abs(p.turn) < 1e-5) return
  nguithrWorldAxes(grp, _w, _w2)
  _w.y = 0; if (_w.lengthSq() > 1e-8) grp.position.addScaledVector(_w.normalize(), p.speed * dt)
  grp.rotateOnWorldAxis(_Y, p.turn * dt * Math.sign(_w2.y || 1))
}
/** 世界点 → 挂载系（模型空间）坐标，用于切丝目标等 */
export function nguithrToMount(grp: THREE.Object3D, world: V3, out: V3 = V()) {
  const rig = grp.userData.nguithrRig as NguithrRig
  rig.mount.updateWorldMatrix(true, false)
  return out.copy(world).applyMatrix4(_m2.copy(rig.mount.matrixWorld).invert())
}
/** 螯尖中点（世界）：喷液/撕咬的发射点 */
export function nguithrMouthPoint(grp: THREE.Object3D, out: V3 = V()) {
  const rig = grp.userData.nguithrRig as NguithrRig
  const b = rig.bones[B.head]; b.updateWorldMatrix(true, false)
  return out.set(0, 0.14, 0.4).sub(NG_BONE_REST[B.head]).applyMatrix4(b.matrixWorld)
}

/** 构建并摆好静息姿态（天花板静伏：膝部拱起、足尖内收、不对称微偏），附带动画器 */
export function buildNguithrAnimated(scale = 1, init: Partial<NguithrPose> = {}): THREE.Group {
  const grp = buildNguithrMesh(scale)
  const rig = grp.userData.nguithrRig as NguithrRig
  const anim = new NguithrAnimator(rig.scale, init)
  grp.userData.nguithrAnimator = anim
  poseNguithr(grp, anim.pose, 0)
  return grp
}
export function nguithrAnimator(grp: THREE.Object3D) { return grp.userData.nguithrAnimator as NguithrAnimator | undefined }

// ============================================================================
// 演示片段（目标姿态时间线）
// ============================================================================
export type NguithrClip = 'idle' | 'cut' | 'descend' | 'crawl' | 'feed' | 'climb' | 'sleep' | 'cower' | 'dead' | 'spray' | 'loop'
export interface NguithrClipInfo { dur: number; loop: boolean; mount: 'ceiling' | 'floor'; label: string }
export const NG_CLIPS: Record<NguithrClip, NguithrClipInfo> = {
  idle: { dur: 8, loop: true, mount: 'ceiling', label: '天花板静伏' },
  cut: { dur: 6, loop: false, mount: 'ceiling', label: '切丝（配合网囊 pop）' },
  descend: { dur: 7.5, loop: false, mount: 'ceiling', label: '顺丝垂降' },
  crawl: { dur: 12, loop: true, mount: 'floor', label: '地面缓慢爬行 + 转向' },
  feed: { dur: 6, loop: true, mount: 'floor', label: '进食' },
  climb: { dur: 7.5, loop: false, mount: 'ceiling', label: '爬回天花板' },
  sleep: { dur: 8, loop: true, mount: 'ceiling', label: '休眠' },
  cower: { dur: 4, loop: false, mount: 'ceiling', label: '受击缩身' },
  dead: { dur: 4, loop: false, mount: 'floor', label: '死亡蜷腿翻倒' },
  spray: { dur: 4, loop: false, mount: 'floor', label: '喷液捕食' },
  loop: { dur: 0, loop: true, mount: 'ceiling', label: '循环演示' },
}
/** 切丝片段里网囊应 pop 的时刻（秒） */
export const NG_CUT_POP_T = 2.7
export interface NguithrClipOpts {
  /** 天花板高（世界 m），垂降/爬升用 */
  ceil?: number
  scale?: number
  /** 切丝目标（挂载系） */
  reach?: V3
  /** 地面片段在倒挂挂载下播放（loop 演示用）：自动加 flip=1、drop=落地值 */
  onFloorFromCeiling?: boolean
}

/** 天花板 ↔ 地面过渡时，纺器离地高度随翻转的曲线（保证头/螯不穿地） */
function landDrop(ceil: number, sc: number, f: number) {
  // f∈[0.5,1]：纺器离地 = Sy·sc + 1.3·sc·sin(πf)（头朝下时螯尖与前足最远约 1.25m）
  const ys = SPIN.y * sc + 1.3 * sc * Math.sin(PI * f)
  return ceil - SPIN.y * sc - ys
}

export function nguithrClipPose(clip: NguithrClip, t: number, o: NguithrClipOpts = {}): NguithrPose {
  const ceil = o.ceil ?? 2.7, sc = o.scale ?? 1
  const info = NG_CLIPS[clip]
  if (clip === 'loop') return loopPose(t, o)
  if (info.loop && info.dur > 0) t = ((t % info.dur) + info.dur) % info.dur
  const p = nguithrPose()
  const floorDrop = nguithrFloorDrop(ceil, sc)
  switch (clip) {
    case 'idle': break
    case 'cut': {
      const r = o.reach ?? V(0.55, 0.16, 0.75)
      const up = ramp(t, 0.6, 1.7), down = ramp(t, 3.4, 4.5)
      p.reach = up * (1 - down); p.reachX = r.x; p.reachY = r.y; p.reachZ = r.z
      p.reachSaw = win(t, 1.8, 2.0, 2.9, 3.2)
      // 身体朝目标偏转、微微前探
      const yaw = Math.atan2(r.x, r.z)
      p.bodyYaw = Math.max(-0.35, Math.min(0.35, yaw * 0.35)) * p.reach
      p.shiftX = Math.sign(r.x) * 0.03 * p.reach; p.shiftZ = 0.04 * p.reach; p.crouch = -0.15 * p.reach
      p.chelOpen = 0.35 * p.reach; p.headYaw = yaw * 0.15 * p.reach
      p.twitch = 0.3
      break
    }
    case 'descend': {
      const bunch = win(t, 0, 0.6, 0.9, 1.5)
      p.crouch = 0.35 * bunch; p.spread = 1 - 0.1 * bunch
      const rel = ramp(t, 0.9, 2.3)
      p.plant = 1 - rel; p.dangle = rel; p.thread = ramp(t, 0.7, 1.0)
      p.flip = 0.5 * rel
      const D1 = landDrop(ceil, sc, 0.5)
      const land = ramp(t, 4.6, 6.0) // flip 0.5→1
      p.drop = lerp(0.55 * sc * rel, D1, ramp(t, 2.3, 4.6)) // 翻身的同时就往下掉，后足不会戳进天花板
      if (t > 4.6) { const f = 0.5 + 0.5 * land; p.flip = f; p.drop = landDrop(ceil, sc, f) }
      p.plant = Math.max(p.plant, ramp(t, 5.2, 6.0))
      p.dangle = rel * (1 - ramp(t, 5.2, 6.0))
      p.reel = rel * (1 - ramp(t, 4.4, 5.0)) * 0.7
      p.crouch += 0.45 * win(t, 5.8, 6.1, 6.3, 7.3) // 落地缓冲
      p.palpRaise = 0.4 * win(t, 4.6, 5.2, 5.8, 6.4)
      p.twitch = 1 - rel
      break
    }
    case 'climb': {
      p.thread = ramp(t, 0, 0.4)
      const D1 = landDrop(ceil, sc, 0.5)
      const lift = ramp(t, 0.8, 2.2) // flip 1→0.5
      p.crouch = 0.35 * win(t, 0, 0.5, 0.7, 1.2)
      const f = 1 - 0.5 * lift
      p.flip = f; p.drop = landDrop(ceil, sc, Math.max(0.5, f))
      p.plant = 1 - ramp(t, 0.8, 1.6)
      p.dangle = ramp(t, 0.8, 1.6)
      const up = ramp(t, 2.2, 4.9)
      if (t > 2.2) p.drop = lerp(D1, 0.55 * sc, up)
      const top = ramp(t, 4.9, 6.2)
      if (t > 4.9) { p.flip = 0.5 * (1 - top); p.drop = 0.55 * sc * (1 - ramp(t, 5.3, 6.3)) } // 先翻正再贴上去，翘起的后足不戳穿天花板
      p.plant = Math.max(p.plant, ramp(t, 5.6, 6.3))
      p.dangle *= 1 - ramp(t, 5.6, 6.3)
      p.reel = ramp(t, 1.4, 2.2) * (1 - ramp(t, 4.9, 5.4))
      p.thread *= 1 - ramp(t, 6.6, 7.4)
      p.twitch = 0.4
      if (t < 0.8) { p.flip = 1; p.drop = floorDrop }
      break
    }
    case 'crawl': {
      p.speed = 0.12 * sc * ramp(t, 0, 1) * (1 - ramp(t, 10.8, 11.8))
      p.turn = 0.4 * win(t, 4, 5, 6.5, 7.5)
      p.bodyPitch = 0.02; p.crouch = 0.05; p.twitch = 0
      p.palpRaise = 0.15
      break
    }
    case 'feed': {
      p.crouch = 0.12; p.bodyPitch = -0.1; p.headPitch = -0.1
      p.chelBite = 1; p.chelOpen = 0.2; p.palpHold = 1; p.abdPulse = 1; p.spread = 0.95; p.twitch = 0.2
      p.bodyRoll = Math.sin(t * 1.3) * 0.03
      break
    }
    case 'sleep': {
      p.tuck = 1; p.crouch = 0.5; p.breath = 0.45; p.twitch = 0; p.palpTuck = 1; p.headPitch = -0.05
      break
    }
    case 'cower': {
      const c = ramp(t, 0.05, 0.35)
      p.cower = c; p.crouch = 0.4 * c; p.tremble = c * (1 - 0.5 * ramp(t, 2, 4)); p.twitch = 0; p.palpTuck = c; p.chelOpen = 0
      break
    }
    case 'dead': {
      const fall = ramp(t, 0.6, 1.7)
      p.cower = 0.6 * win(t, 0, 0.2, 0.5, 1.0); p.tremble = win(t, 0, 0.2, 0.6, 1.4)
      p.dead = fall; p.plant = 1 - ramp(t, 0.4, 0.9); p.curl = ramp(t, 0.4, 1.1); p.dangle = 0
      p.breath = 1 - fall; p.twitch = 0; p.palpTuck = fall; p.chelOpen = 0.3 * fall
      break
    }
    case 'spray': {
      const rear = win(t, 0.2, 1.0, 2.6, 3.6)
      p.bodyPitch = 0.3 * rear; p.crouch = -0.45 * rear; p.headPitch = 0.18 * rear; p.shiftZ = -0.03 * rear
      p.palpRaise = rear; p.chelOpen = rear; p.chelSpread = rear; p.abdLift = 0.5 * rear
      p.spray = win(t, 1.55, 1.62, 1.75, 1.95)
      p.twitch = 0
      break
    }
  }
  if (o.onFloorFromCeiling && info.mount === 'floor') { p.flip = 1; p.drop = floorDrop }
  return p
}

/** 循环演示时间线：idle → cut → descend → crawl → spray → feed → climb → sleep → cower */
export const NG_LOOP: { clip: NguithrClip; dur: number }[] = [
  { clip: 'idle', dur: 4 }, { clip: 'cut', dur: 5 }, { clip: 'descend', dur: 7.5 }, { clip: 'crawl', dur: 12 },
  { clip: 'spray', dur: 4 }, { clip: 'feed', dur: 5 }, { clip: 'climb', dur: 7.5 }, { clip: 'sleep', dur: 5 }, { clip: 'cower', dur: 3.5 },
]
export const NG_LOOP_DUR = NG_LOOP.reduce((a, s) => a + s.dur, 0)
export function nguithrLoopSegment(t: number) {
  let u = ((t % NG_LOOP_DUR) + NG_LOOP_DUR) % NG_LOOP_DUR
  for (const s of NG_LOOP) { if (u < s.dur) return { clip: s.clip, local: u, dur: s.dur }; u -= s.dur }
  return { clip: NG_LOOP[0].clip, local: 0, dur: NG_LOOP[0].dur }
}
function loopPose(t: number, o: NguithrClipOpts) {
  const s = nguithrLoopSegment(t)
  const p = nguithrClipPose(s.clip, s.local, { ...o, onFloorFromCeiling: true })
  if (s.clip === 'crawl') { // 出去、掉头、回来（回到丝下方附近再爬升）
    const u = s.local, sc = o.scale ?? 1
    p.speed = 0.12 * sc * (ramp(u, 0, 0.8) * (1 - ramp(u, 3.6, 4.2)) + 0.3 * win(u, 4, 4.4, 7.6, 8) + ramp(u, 7.8, 8.6) * (1 - ramp(u, 11, 11.8)))
    p.turn = (PI / 3.6) * win(u, 4.1, 4.4, 7.6, 7.9)
  }
  return p
}
