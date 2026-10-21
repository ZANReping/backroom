// 邻里守望（观察者 / 挺进者）与残缺者——第 2 阶段：骨骼动画。
// 全部程序化：正弦波 + FABRIK 腿/触须 IK（求得关节位置后换算成骨骼局部旋转，骨长保持不变）。
// 接口：poseWatch(grp, clip, t, opt) —— grp 为 buildWatchMesh / buildMangledMesh 的返回值，按 userData 识别种类。
//   opt.speed    行走速度（m/s，挺进者 walk/run、残缺者 stride 的步频随之变化）
//   opt.target   手/触须目标（模型局部空间，+X 正面）：挺进者 reach/grab/slam/present、残缺者 snatch
//   opt.yaw/pitch 视线（弧度），观察者 lock/charge/beam、挺进者各片段的眼球朝向
// 片段表 WATCH_CLIPS（len 秒、loop 是否循环）。
import * as THREE from 'three'
import type { WatchRig } from './neighborhoodWatchMesh'
import { setPupil, setPupilGlow, striderLegRest, STRIDER_STAND, STRIDER_LEG_AZ } from './neighborhoodWatchMesh'
import type { MangledRig } from './mangledMesh'
import { mangledLegRest, MANGLED_BODY, MANGLED_TENTACLES } from './mangledMesh'

type V3 = THREE.Vector3
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const ease = (t: number) => { const k = clamp01(t); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const frac = (x: number) => x - Math.floor(x)
const Qid = new THREE.Quaternion()
const qe = (x: number, y: number, z: number, order: THREE.EulerOrder = 'YXZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order))

export const WATCH_CLIPS = {
  watcher: {
    hover: { len: 5.7, loop: true }, scan: { len: 10.5, loop: true }, drift: { len: 5.7, loop: true },
    lock: { len: 0.6, loop: false }, charge: { len: 1.5, loop: false }, beam: { len: 0.5, loop: true }, cooldown: { len: 1.2, loop: false },
  },
  strider: {
    idle: { len: 4, loop: true }, walk: { len: 1.1, loop: true }, run: { len: 0.5, loop: true }, climb: { len: 1.6, loop: true },
    reach: { len: 2.4, loop: true }, grab: { len: 0.8, loop: false }, slam: { len: 0.9, loop: true }, present: { len: 2, loop: true }, death: { len: 1.8, loop: false },
  },
  mangled: {
    idle: { len: 8, loop: true }, stride: { len: 7, loop: true }, snatch: { len: 2.6, loop: false }, hold: { len: 3, loop: true }, roar: { len: 3, loop: false },
  },
} as const
export type WatchKindAnim = keyof typeof WATCH_CLIPS
export type WatchClipName = { [K in WatchKindAnim]: keyof (typeof WATCH_CLIPS)[K] }[WatchKindAnim]
export interface WatchPoseOpt { speed?: number; target?: V3; yaw?: number; pitch?: number; glow?: number }

// ============================================================================
// IK 工具
// ============================================================================
/** FABRIK：J 为初始关节（会被就地修改，决定弯曲方向），base 固定，tip 追 target。 */
export function fabrik(J: V3[], target: V3, iters = 10) {
  const n = J.length - 1, L: number[] = [], base = J[0].clone()
  for (let i = 0; i < n; i++) L.push(J[i].distanceTo(J[i + 1]))
  const total = L.reduce((a, b) => a + b, 0)
  if (base.distanceTo(target) >= total * 0.999) { // 够不到：拉直指向目标
    const d = target.clone().sub(base).normalize()
    for (let i = 1; i <= n; i++) J[i].copy(J[i - 1]).addScaledVector(d, L[i - 1])
    return
  }
  const tmp = V(0, 0, 0)
  for (let k = 0; k < iters; k++) {
    J[n].copy(target)
    for (let i = n - 1; i >= 0; i--) { tmp.subVectors(J[i], J[i + 1]).normalize(); J[i].copy(J[i + 1]).addScaledVector(tmp, L[i]) }
    J[0].copy(base)
    for (let i = 1; i <= n; i++) { tmp.subVectors(J[i], J[i - 1]).normalize(); J[i].copy(J[i - 1]).addScaledVector(tmp, L[i - 1]) }
    if (J[n].distanceToSquared(target) < 1e-6) break
  }
}
/**
 * 把求得的关节 Q（模型局部空间）换成骨骼局部旋转。P 为静止关节；parentQ 为链首骨骼父级（到模型局部）的累计旋转。
 * bones[i] 位于 P[i]；最后一根骨骼（末端）沿用上一节的朝向，tipQ 可额外叠加（足端卷曲等）。
 */
export function chainToBones(bones: THREE.Bone[], P: V3[], Q: V3[], parentQ: THREE.Quaternion, tipQ?: THREE.Quaternion) {
  let Wprev = parentQ.clone()
  const a = V(0, 0, 0), b = V(0, 0, 0)
  for (let i = 0; i < bones.length; i++) {
    let W: THREE.Quaternion
    if (i < P.length - 1) {
      a.subVectors(P[i + 1], P[i]).normalize().applyQuaternion(Qid); b.subVectors(Q[i + 1], Q[i]).normalize()
      W = new THREE.Quaternion().setFromUnitVectors(a, b)
    } else W = Wprev.clone().multiply(tipQ ?? Qid)
    bones[i].quaternion.copy(Wprev.clone().invert().multiply(W))
    Wprev = W
  }
}
function resetRig(r: { bones: THREE.Bone[]; rest: V3[] }) {
  r.bones.forEach((b, i) => { b.quaternion.identity(); b.position.copy(r.rest[i]); b.scale.set(1, 1, 1) })
}
/** 骨骼在模型局部空间的位置（rest 平移累加；仅用于静止关节表） */
const bonesOf = (byName: Record<string, THREE.Bone>, names: string[]) => names.map((n) => byName[n])

// ============================================================================
// 观察者
// ============================================================================
function poseWatcher(g: THREE.Object3D, rig: WatchRig, clip: string, t: number, o: WatchPoseOpt) {
  resetRig(rig)
  const B = rig.byName, root = B.root, eye = B.eye
  const bob = Math.sin(t * 1.1) * 0.08 + Math.sin(t * 2.3) * 0.02
  root.position.y += bob
  root.quaternion.copy(qe(Math.sin(t * 0.7) * 0.04, 0, Math.sin(t * 0.9) * 0.03))
  let yaw = o.yaw ?? 0, pitch = o.pitch ?? 0, pupil = 1, glow = 0, jitter = 0, trail = 0, stiff = 0
  switch (clip) {
    case 'scan': yaw = Math.sin(t * 0.6) * 0.75 + Math.sin(t * 1.7) * 0.08; pitch = Math.sin(t * 0.37) * 0.22 - 0.05; pupil = 1 + Math.sin(t * 0.9) * 0.08; break
    case 'drift': trail = 1; root.quaternion.multiply(qe(0, 0, -0.12)); yaw = Math.sin(t * 0.4) * 0.3; break // 前倾滑行，须向后拖
    case 'lock': { const k = ease(t / 0.35); yaw *= k; pitch *= k; pupil = lerp(1, 0.55, ease(t / 0.5)); jitter = 0.004 * (1 - k); break }
    case 'charge': { // 1.5s 蓄力：瞳孔从收缩到放大、深处辉光脉动加强、全身颤抖、垂须后掠绷直
      const k = clamp01(t / 1.5)
      pupil = lerp(0.55, 1.55, ease(k)); glow = (0.15 + 0.85 * k * k) * (0.75 + 0.25 * Math.sin(t * (10 + 25 * k)))
      jitter = 0.012 * k; stiff = k; break
    }
    case 'beam': pupil = 1.6 + Math.sin(t * 40) * 0.04; glow = 0.92 + 0.08 * Math.sin(t * 57); jitter = 0.01; stiff = 1; root.position.x -= 0.03 + 0.01 * Math.sin(t * 31); break // 后坐
    case 'cooldown': { const k = ease(t / 1.2); pupil = lerp(1.6, 1, k); glow = (1 - k) * 0.6; stiff = 1 - k; jitter = 0.006 * (1 - k); break }
    default: yaw = Math.sin(t * 0.25) * 0.15; pitch = Math.sin(t * 0.33) * 0.06
  }
  if (jitter) root.position.add(V(Math.sin(t * 73) * jitter, Math.sin(t * 89 + 1) * jitter, Math.sin(t * 61 + 2) * jitter))
  eye.quaternion.copy(qe(0, yaw, pitch, 'YZX'))
  setPupil(g, pupil); setPupilGlow(g, o.glow ?? glow)
  // 6 条垂须：相位递进的摆动；trail = 向后拖曳；stiff = 绷直后掠
  for (let k = 0; k < 6; k++) for (let s = 0; s < 3; s++) {
    const b = B[`ten${k}_${s}`]; if (!b) continue
    const ph = t * 1.6 + k * 1.1 + s * 0.7, amp = (0.18 + s * 0.12) * (1 - stiff * 0.8)
    b.quaternion.copy(qe(Math.sin(ph) * amp, Math.sin(ph * 0.7 + 1) * amp * 0.6, Math.cos(ph * 0.8) * amp * 0.5 + trail * 0.18 * (s + 1) + stiff * (s === 0 ? 0.35 : 0.1)))
  }
}

// ============================================================================
// 挺进者
// ============================================================================
const STRIDER_REST = Array.from({ length: 6 }, (_, i) => striderLegRest(i))
/** 三角步态分组：A = 右前、左中、右后；B = 左前、右中、左后 */
const TRIPOD = [0, 1, 0, 1, 0, 1]
const S_C = V(0, STRIDER_STAND, 0)
function poseStrider(_g: THREE.Object3D, rig: WatchRig, clip: string, t: number, o: WatchPoseOpt) {
  resetRig(rig)
  const B = rig.byName, body = B.body
  // —— 躯体姿态
  let bodyOff = V(0, 0, 0), bodyQ = new THREE.Quaternion(), eyeYaw = o.yaw ?? 0, eyePitch = o.pitch ?? 0
  const feet: V3[] = STRIDER_REST.map((J) => J[4].clone())
  const tipCurl: (THREE.Quaternion | undefined)[] = new Array(6).fill(undefined)
  const gait = (freq: number, stride: number, lift: number, duty = 0.5) => {
    const ph = t * freq
    for (let i = 0; i < 6; i++) {
      const p = frac(ph + TRIPOD[i] * 0.5), f = feet[i]
      if (p < 1 - duty) { const k = p / (1 - duty); f.x += lerp(-stride, stride, ease(k)); f.y += Math.sin(k * Math.PI) * lift } // 摆动相：抬起前送
      else { const k = (p - (1 - duty)) / duty; f.x += lerp(stride, -stride, k) } // 支撑相：贴地后推
    }
    return ph
  }
  const hand = (i: number, target: V3, curl = 0) => { feet[i].copy(target); tipCurl[i] = qe(0, 0, -curl) }
  const tgt = o.target ?? V(2.4, 1.0, 0.25)
  switch (clip) {
    case 'walk': { const sp = o.speed ?? 2.2, freq = sp / 1.2; const ph = gait(freq, 0.32, 0.38); bodyOff.y = -0.06 + Math.sin(ph * Math.PI * 4) * 0.035; bodyQ = qe(Math.sin(ph * Math.PI * 2) * 0.04, 0, -0.05); eyeYaw += Math.sin(t * 0.9) * 0.25; break }
    case 'run': { const sp = o.speed ?? 9, freq = Math.min(3.2, sp / 2.6); const ph = gait(freq, 0.62, 0.55, 0.42); bodyOff.y = -0.35 + Math.sin(ph * Math.PI * 4) * 0.06; bodyOff.x = 0.15; bodyQ = qe(Math.sin(ph * Math.PI * 2) * 0.05, 0, -0.18); break }
    case 'climb': { // 攀屋顶：躯体前倾抬高，前两足搭在前上方的屋檐，其余交替上蹬
      const ph = t / 1.6; bodyOff.set(0.3, 0.55 + Math.sin(ph * Math.PI * 2) * 0.1, 0); bodyQ = qe(0, 0, 0.45)
      hand(0, V(1.9, 3.2 + Math.sin(ph * Math.PI * 2) * 0.25, 0.9)); hand(3, V(1.9, 3.2 + Math.cos(ph * Math.PI * 2) * 0.25, -0.9))
      for (const i of [1, 2, 4, 5]) { const p = frac(ph + (i % 2) * 0.5); feet[i].y += Math.max(0, Math.sin(p * Math.PI * 2)) * 0.5; feet[i].x += Math.sin(p * Math.PI * 2) * 0.25 }
      eyePitch += 0.4; break
    }
    case 'reach': { // 一条前足伸进门窗摸索：其余足撑地，躯体侧倾靠近
      bodyOff.set(0.35, -0.25, 0.12); bodyQ = qe(0.08, 0, -0.12)
      const wig = V(Math.sin(t * 2.6) * 0.18, Math.sin(t * 3.7) * 0.12, Math.sin(t * 2.1 + 1) * 0.22)
      const k = ease(clamp01(t / 0.6)) * (1 - ease(clamp01((t - 2.0) / 0.4)))
      const p0 = STRIDER_REST[0][4]
      hand(0, p0.clone().lerp(tgt.clone().add(wig), k), 0.4 + Math.sin(t * 5) * 0.3)
      eyeYaw += 0.25; eyePitch -= 0.25; break
    }
    case 'grab': { // 0.8s：两条前足合拢卷住目标（目标即被抓物体中心），足端卷曲
      const k = ease(t / 0.5), at = tgt.clone()
      bodyOff.set(0.2 * k, -0.15 * k, 0)
      hand(0, STRIDER_REST[0][4].clone().lerp(at.clone().add(V(0, 0, 0.12)), k), 1.4 * k)
      hand(3, STRIDER_REST[3][4].clone().lerp(at.clone().add(V(0, 0, -0.12)), k), 1.4 * k)
      eyePitch -= 0.35 * k; break
    }
    case 'slam': { // 抡起 → 砸向地面（0.9s 周期）：前两足抱着猎物
      const p = frac(t / 0.9), up = p < 0.55 ? ease(p / 0.55) : 1 - ease((p - 0.55) / 0.12)
      const at = V(lerp(2.0, 0.9, up), lerp(0.25, 3.9, up), 0)
      bodyOff.set(0.2, lerp(-0.35, 0.25, up), 0); bodyQ = qe(0, 0, lerp(-0.25, 0.25, up))
      hand(0, at.clone().add(V(0, 0, 0.13)), 1.5); hand(3, at.clone().add(V(0, 0, -0.13)), 1.5)
      eyePitch += lerp(-0.6, 0.2, up); break
    }
    case 'present': { // 把猎物举到身前晃给观察者看
      const at = (o.target ?? V(1.5, 3.1, 0)).clone().add(V(0, Math.sin(t * 3.1) * 0.15, Math.sin(t * 2.2) * 0.25))
      bodyOff.set(0, 0.2, 0); bodyQ = qe(0, Math.sin(t * 1.1) * 0.1, 0.1)
      hand(0, at.clone().add(V(0, 0, 0.13)), 1.5); hand(3, at.clone().add(V(0, 0, -0.13)), 1.5)
      eyePitch -= 0.3; break
    }
    case 'death': { // 腿软塌、躯体砸地、眼球上翻
      const k = ease(t / 1.2)
      bodyOff.set(0, lerp(0, -(STRIDER_STAND - 0.55), k), 0); bodyQ = qe(0.3 * k, 0, 0.15 * k)
      for (let i = 0; i < 6; i++) { const d = V(Math.cos(STRIDER_LEG_AZ[i]), 0, Math.sin(STRIDER_LEG_AZ[i])); feet[i].addScaledVector(d, 0.5 * k) }
      eyePitch += 0.9 * k; eyeYaw += 0.4 * k; break
    }
    default: { // idle：呼吸般起伏，偶尔挪一下脚，眼球张望
      bodyOff.y = Math.sin(t * 1.4) * 0.04; bodyQ = qe(Math.sin(t * 0.8) * 0.02, 0, Math.sin(t * 1.1) * 0.02)
      const shift = Math.floor(t / 1.3) % 6, p = frac(t / 1.3)
      feet[shift].y += Math.sin(p * Math.PI) * 0.18; feet[shift].x += Math.sin(p * Math.PI) * 0.1
      eyeYaw += Math.sin(t * 0.5) * 0.5; eyePitch += Math.sin(t * 0.7) * 0.12
    }
  }
  body.position.add(bodyOff); body.quaternion.copy(bodyQ)
  B.eye.quaternion.copy(qe(0, eyeYaw, eyePitch, 'YZX'))
  // —— 6 条腿 IK
  for (let i = 0; i < 6; i++) {
    const P = STRIDER_REST[i]
    const J = P.map((p) => p.clone().sub(S_C).applyQuaternion(bodyQ).add(S_C).add(bodyOff))
    fabrik(J, feet[i])
    chainToBones(bonesOf(B, [0, 1, 2, 3, 4].map((s) => `L${i}_${s}`)), P, J, bodyQ, tipCurl[i])
  }
}

// ============================================================================
// 残缺者
// ============================================================================
const M_LEG_REST = Array.from({ length: 8 }, (_, i) => mangledLegRest(i))
/** 波浪步态顺序（一次只抬一条腿，两侧交替） */
const M_ORDER = [0, 5, 2, 7, 4, 1, 6, 3]
function tentRest(rig: MangledRig, k: number): V3[] {
  void 0
  // 从骨骼静止平移累加出模型局部关节位置
  const out: V3[] = []
  for (let s = 0; s < 8; s++) {
    const b = rig.byName[`ten${k}_${s}`]
    out.push(b.parent ? b.parent.localToWorld(b.position.clone()) : b.position.clone())
  }
  return out
}
function poseMangled(g: THREE.Object3D, rig: MangledRig, clip: string, t: number, o: WatchPoseOpt) {
  resetRig(rig)
  const B = rig.byName, body = B.body, core = B.core
  const C = MANGLED_BODY
  let bodyOff = V(0, 0, 0), bodyQ = new THREE.Quaternion(), coreQ = new THREE.Quaternion(), coreS = 1
  const feet = M_LEG_REST.map((J) => J[3].clone())
  let flare = 0, snatchK = -1
  switch (clip) {
    case 'stride': { // 分节步态：每条腿依次 抬起(直上) → 前跨(悬停) → 砸下(加速下落) → 落地顿挫；骨段刚性，只在关节折
      const cyc = t / 7
      let thud = 0
      for (let n = 0; n < 8; n++) {
        const i = M_ORDER[n], p = frac(cyc - n / 8), f = feet[i], W = 1 / 8
        if (p < W) {
          const k = p / W
          if (k < 0.28) { f.x -= 3.5; f.y += 8.5 * ease(k / 0.28) } // 抬：竖直提起
          else if (k < 0.72) { f.x += lerp(-3.5, 4, ease((k - 0.28) / 0.44)); f.y += 8.5 + Math.sin(((k - 0.28) / 0.44) * Math.PI) * 1.2 } // 跨：膝顶带着骨段整体平移
          else if (k < 0.86) { const d = (k - 0.72) / 0.14; f.x += 4; f.y += 8.5 * (1 - d * d) } // 砸：加速落下
          else { f.x += 4; thud = Math.max(thud, 1 - (k - 0.86) / 0.14) } // 落地顿挫
        } else f.x += lerp(4, -3.5, (p - W) / (1 - W))
      }
      bodyOff.set(Math.sin(cyc * Math.PI * 16) * 0.25, Math.sin(cyc * Math.PI * 8) * 0.5 - 0.7 * thud * thud, Math.sin(cyc * Math.PI * 4) * 1.0)
      bodyQ = qe(Math.sin(cyc * Math.PI * 4) * 0.04 + 0.015 * thud, Math.sin(cyc * Math.PI * 2) * 0.03, Math.sin(cyc * Math.PI * 8) * 0.025)
      coreS = 1 + 0.02 * thud; break
    }
    case 'roar': { // 3s：躯体抬升后仰、人脸团块收缩后猛胀、触须向外炸开
      const up = ease(t / 0.8) * (1 - ease((t - 2.2) / 0.8)), burst = ease((t - 0.7) / 0.3) * (1 - ease((t - 2.4) / 0.6))
      bodyOff.y = 2.2 * up; bodyQ = qe(0, 0, 0.12 * up)
      coreS = 1 - 0.05 * up + 0.12 * burst + 0.03 * Math.sin(t * 25) * burst; coreQ = qe(Math.sin(t * 9) * 0.05 * burst, 0, 0)
      flare = burst; break
    }
    case 'snatch': { snatchK = t; const k = t < 1.4 ? ease(t / 0.9) : 1 - ease((t - 1.4) / 1.2) * 0.6; bodyOff.y = -6 * k; bodyQ = qe(0, 0, -0.08 * k); break } // 下蹲探身
    case 'hold': snatchK = 99; bodyOff.y = -2.4; break
    default: { // idle：人脸团块缓慢脉动、躯体随呼吸起伏
      bodyOff.y = Math.sin(t * 0.6) * 0.5; bodyQ = qe(Math.sin(t * 0.3) * 0.02, 0, Math.sin(t * 0.4) * 0.02)
      coreS = 1 + Math.sin(t * 0.9) * 0.025; coreQ = qe(Math.sin(t * 0.5) * 0.03, Math.sin(t * 0.35) * 0.04, 0)
    }
  }
  body.position.add(bodyOff); body.quaternion.copy(bodyQ)
  core.quaternion.copy(coreQ); core.scale.setScalar(coreS)
  // —— 8 条腿 IK
  for (let i = 0; i < 8; i++) {
    const P = M_LEG_REST[i]
    const J = P.map((p) => p.clone().sub(C).applyQuaternion(bodyQ).add(C).add(bodyOff))
    fabrik(J, feet[i])
    chainToBones(bonesOf(B, [0, 1, 2, 3].map((s) => `leg${i}_${s}`)), P, J, bodyQ)
  }
  // —— 触须：正弦摆动；roar 时外翻；snatch/hold 时 0 号触须 IK 下探捕人再收回半空
  g.updateMatrixWorld(true)
  for (let k = 0; k < MANGLED_TENTACLES; k++) {
    const bones = bonesOf(B, Array.from({ length: 8 }, (_, s) => `ten${k}_${s}`))
    if (k === 0 && snatchK >= 0) continue
    for (let s = 0; s < 8; s++) {
      const ph = t * 0.7 + k * 1.3 + s * 0.45, amp = 0.05 + s * 0.012
      const a = V(Math.cos(k * 0.9), 0, Math.sin(k * 0.9))
      bones[s].quaternion.copy(qe(Math.sin(ph) * amp + a.z * flare * (s === 0 ? 0.6 : 0.08), 0, Math.cos(ph * 0.8) * amp - a.x * flare * (s === 0 ? 0.6 : 0.08)))
    }
  }
  if (snatchK >= 0) {
    // 先求静止关节（模型局部），再按片段把末端从静止位置 → 目标（下探 1.0s）→ 卷住（0.4s）→ 拉回腹下（1.2s）
    const bones = bonesOf(B, Array.from({ length: 8 }, (_, s) => `ten0_${s}`))
    bones.forEach((b) => b.quaternion.identity())
    const parentQ = new THREE.Quaternion(); core.getWorldQuaternion(parentQ)
    const gq = new THREE.Quaternion(); g.getWorldQuaternion(gq); parentQ.premultiply(gq.invert())
    g.updateMatrixWorld(true)
    const toLocal = (b: THREE.Bone) => g.worldToLocal(b.getWorldPosition(V(0, 0, 0)))
    const P = bones.map(toLocal)
    const L0 = P[7].clone().sub(P[6]); P.push(P[7].clone().add(L0)) // 末端虚拟关节
    const target = (o.target ?? V(10, 1.2, 6)).clone()
    const tip0 = P[8].clone(), lifted = V(target.x * 0.4, C.y - 12, target.z * 0.4)
    const tt = snatchK
    const tip = tt < 1.0 ? tip0.clone().lerp(target, ease(tt / 1.0)) : tt < 1.4 ? target.clone() : target.clone().lerp(lifted, ease((tt - 1.4) / 1.2))
    // 够不到时触须整体拉长（最多 1.9 倍）：骨骼子级平移按比例放大，蒙皮随之拉伸
    let total = 0; for (let s = 0; s < 8; s++) total += P[s].distanceTo(P[s + 1])
    const need = tip.distanceTo(P[0]) * 1.03, stretch = Math.min(1.9, Math.max(1, need / total))
    if (stretch > 1) { for (let s = 1; s < 8; s++) bones[s].position.multiplyScalar(stretch); for (let s = 1; s <= 8; s++) P[s].copy(P[0]).addScaledVector(P[s].clone().sub(P[0]), stretch) }
    const J = P.map((p) => p.clone())
    // 初始弯曲：中段先向外鼓，避免直线穿过躯体
    for (let s = 1; s < 8; s++) J[s].add(V(target.x, 0, target.z).normalize().multiplyScalar(Math.sin((s / 8) * Math.PI) * 3))
    fabrik(J, tip, 14)
    const curl = tt < 1.0 ? 0 : ease((tt - 1.0) / 0.4)
    chainToBones(bones, P.slice(0, 9), J, parentQ, qe(0, 0, -1.2 * curl))
    // 末两节卷曲包住猎物
    if (curl > 0) { bones[6].quaternion.multiply(qe(0, 0, -0.5 * curl)); bones[7].quaternion.multiply(qe(0, 0, -0.9 * curl)) }
  }
}

// ============================================================================
// 入口
// ============================================================================
export function poseWatch(g: THREE.Object3D, clip: string, t: number, o: WatchPoseOpt = {}) {
  const wr = g.userData.watchRig as WatchRig | undefined
  if (wr) { if (wr.kind === 'watcher') poseWatcher(g, wr, clip, t, o); else poseStrider(g, wr, clip, t, o); return }
  const mr = g.userData.mangledRig as MangledRig | undefined
  if (mr) poseMangled(g, mr, clip, t, o)
}
/** 触须 0 末端（捕获点）在模型局部空间的位置：机制层据此把被抓的玩家吊在半空 */
export function mangledGripPoint(g: THREE.Object3D): V3 {
  const mr = g.userData.mangledRig as MangledRig | undefined
  if (!mr) return V(0, 0, 0)
  g.updateMatrixWorld(true)
  const b = mr.byName.ten0_7
  return g.worldToLocal(b.localToWorld(V(0, 0, 0)).clone())
}
/** 挺进者两条前足之间的抓握点（模型局部） */
export function striderGripPoint(g: THREE.Object3D): V3 {
  const wr = g.userData.watchRig as WatchRig | undefined
  if (!wr || wr.kind !== 'strider') return V(0, 0, 0)
  g.updateMatrixWorld(true)
  const a = wr.byName.L0_4.getWorldPosition(V(0, 0, 0)), b = wr.byName.L3_4.getWorldPosition(V(0, 0, 0))
  return g.worldToLocal(a.add(b).multiplyScalar(0.5))
}
export { tentRest }
