// NPC 待机姿势层（活人气息）——由 HumanoidMotion.update 调用，只改骨骼旋转/位置，不分配网格。
// 第一层（常驻）：重心转移（对立式站姿，脚由腿 IK 钉地并以单脚挪步完成换重心）、胸肩呼吸、「扫视-停留」视线、放松手臂。
// 第二层：小动作（engine/npcIdle.ts 选择与计时），手部目标用双骨 IK 求解（目标挂在胸/头骨骼坐标系，随躯干/头部运动）。
// 第三层：注视玩家/闲聊对象、点头/挥手、听者点头、说话者手势、靠墙站姿。
import * as THREE from 'three'
import type { RetroNpc } from './retroNpc'

export interface IdleFrame {
  seed: number
  act: string; actT: number; actDur: number
  /** 注视点（世界坐标：x/y 为地图平面，z 为高度） */
  look?: { x: number; y: number; z: number } | null
  lookK: number
  avoid?: boolean
  chat?: boolean; talking?: boolean
  lean?: number
  leanArms?: 'cross' | 'back' | 'front'
  temper?: string
  /** 坐姿：腿/躯干已由 applySeatedPose 摆好，只叠加头部与手臂动作 */
  seated?: boolean
}

type B = RetroNpc['bones']
type Side = 'L' | 'R'
const clamp = THREE.MathUtils.clamp
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t) }
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const hash = (a: number, b: number) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); return ((h ^ (h >>> 13)) >>> 0) / 4294967296 }

/** 动作包络：0.4 s 淡入、0.45 s 淡出 */
export const actEnvelope = (t: number, dur: number) => ease(t / .4) * ease((dur - t) / .45)

// ---------------------------------------------------------------- 第一层：站姿（腿 IK 之前）
export interface IdleStance { fwd: [number, number]; lat: [number, number]; hipX: number; hipY: number; hipZ: number; support: number; shift: number }
const STANCE: IdleStance = { fwd: [0, 0], lat: [0, 0], hipX: 0, hipY: 0, hipZ: 0, support: 0, shift: 0 }

/** 本帧落脚偏移（前/外侧，米，未乘体型缩放）与髋部偏移。i=0 左脚，i=1 右脚。 */
export function idleStance(f: IdleFrame, time: number): IdleStance {
  const s = STANCE, seed = f.seed
  const period = 6.5 + (seed % 9) * .9, off = (seed % 13) * .77
  const k = Math.floor((time + off) / period), r = hash(seed, k)
  let support = r < .15 ? -1 : (k + seed) % 2 // 左右交替换重心；偶尔双脚均匀站
  if (f.act === 'shuffle') { const u = f.actT / Math.max(.1, f.actDur); support = u < .33 ? 0 : u < .66 ? 1 : 0 }
  const lean = clamp(f.lean ?? 0, 0, 1)
  s.fwd[0] = s.fwd[1] = .3 * lean; s.lat[0] = s.lat[1] = .03 * lean
  s.hipX = 0; s.hipY = 0; s.hipZ = -.035 * lean; s.support = support; s.shift = 0
  if (support >= 0 && lean < .5) {
    const free = 1 - support, amp = f.temper === 'loud' ? 1.25 : f.temper === 'calm' ? .8 : 1
    s.fwd[free] += .075 * amp; s.lat[free] += .03 * amp; s.lat[support] -= .015
    s.hipX = (support === 0 ? 1 : -1) * .032 * amp; s.hipY = -.008; s.shift = support === 0 ? 1 : -1
  }
  if (f.act === 'crouch') { const w = actEnvelope(f.actT, f.actDur); s.hipY -= .36 * w; s.fwd[0] += .12 * w; s.fwd[1] -= .06 * w; s.lat[0] += .05 * w; s.lat[1] += .05 * w }
  return s
}

// ---------------------------------------------------------------- IK 工具（身体空间 = hips 父节点空间，绑定尺度）
const Mp = new THREE.Matrix4(), Mu = new THREE.Matrix4(), Mf = new THREE.Matrix4(), Mt = new THREE.Matrix4()
const vS = new THREE.Vector3(), vE = new THREE.Vector3(), vH = new THREE.Vector3(), vD = new THREE.Vector3(), vB = new THREE.Vector3(), vA = new THREE.Vector3(), vT = new THREE.Vector3(), vP = new THREE.Vector3(), vScl = new THREE.Vector3()
const qP = new THREE.Quaternion(), qU = new THREE.Quaternion(), qX = new THREE.Quaternion(), qL = new THREE.Quaternion()
const chain: THREE.Bone[] = []
function bodyMatrix(b: THREE.Object3D, out: THREE.Matrix4) {
  chain.length = 0
  let o: THREE.Object3D | null = b
  while (o && (o as THREE.Bone).isBone) { chain.push(o as THREE.Bone); o = o.parent }
  out.identity()
  for (let i = chain.length - 1; i >= 0; i--) { chain[i].updateMatrix(); out.multiply(chain[i].matrix) }
  return out
}
const bindCache = new WeakMap<THREE.Bone, THREE.Vector3>()
function bindBody(b: THREE.Bone) {
  let v = bindCache.get(b)
  if (!v) {
    v = new THREE.Vector3()
    let o: THREE.Object3D | null = b
    while (o && (o as THREE.Bone).isBone) { v.add((o.userData.bind as THREE.Vector3) ?? o.position); o = o.parent }
    bindCache.set(b, v)
  }
  return v
}
/** 胸/髋骨骼系中的点：以绑定姿势下的身体坐标给出，随该骨骼当前变换移动 */
function inFrame(bone: THREE.Bone, x: number, y: number, z: number, out: THREE.Vector3) {
  const bb = bindBody(bone)
  return out.set(x - bb.x, y - bb.y, z - bb.z).applyMatrix4(bodyMatrix(bone, Mt))
}
function inHead(b: B, x: number, y: number, z: number, out: THREE.Vector3) { return out.set(x, y, z).applyMatrix4(bodyMatrix(b.head, Mt)) }
function dirFrame(bone: THREE.Bone, x: number, y: number, z: number, out: THREE.Vector3) {
  bodyMatrix(bone, Mt).decompose(vScl, qX, vScl); return out.set(x, y, z).applyQuaternion(qX).normalize()
}

/** 双骨手臂 IK：hand → target（身体空间），pole 为肘部朝向；w 为与当前 FK 姿势的混合权重 */
export function armIK(b: B, side: Side, target: THREE.Vector3, pole: THREE.Vector3, w: number) {
  if (w <= .001) return
  const ua = b[('upperArm' + side) as 'upperArmL'], fa = b[('foreArm' + side) as 'foreArmL'], hd = b[('hand' + side) as 'handL']
  bodyMatrix(ua.parent!, Mp); Mu.multiplyMatrices(Mp, (ua.updateMatrix(), ua.matrix))
  vS.setFromMatrixPosition(Mu)
  // 混合在「手的位置 + 肘部朝向」上做（而不是两段骨骼各自 slerp），过渡时手走直线、肘部不乱甩
  Mf.multiplyMatrices(Mu, (fa.updateMatrix(), fa.matrix)); vP.setFromMatrixPosition(Mf)
  Mt.multiplyMatrices(Mf, (hd.updateMatrix(), hd.matrix)); vH.setFromMatrixPosition(Mt)
  vD.copy(vH).sub(vS).normalize()
  vA.copy(vP).sub(vS).addScaledVector(vD, -vP.clone().sub(vS).dot(vD)) // FK 肘部朝向
  if (vA.lengthSq() < 1e-8) vA.copy(pole)
  vA.normalize()
  const k = clamp(w, 0, 1)
  vT.copy(vH).lerp(target, k)
  const l1 = fa.position.length(), l2 = hd.position.length()
  vD.copy(vT).sub(vS)
  const dist = clamp(vD.length(), .05, l1 + l2 - .002); vD.normalize()
  vB.copy(pole).normalize().lerp(vA, 1 - k)
  vB.addScaledVector(vD, -vB.dot(vD))
  if (vB.lengthSq() < 1e-6) vB.set(0, -1, 0)
  vB.normalize()
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  vE.copy(vS).addScaledVector(vD, along).addScaledVector(vB, h)
  vH.copy(vS).addScaledVector(vD, dist)
  // 上臂
  Mu.decompose(vScl, qU, vScl); Mp.decompose(vScl, qP, vScl)
  vA.copy(fa.position).normalize().applyQuaternion(qU)
  vT.copy(vE).sub(vS).normalize()
  qX.setFromUnitVectors(vA, vT).multiply(qU)
  qL.copy(qP).invert().multiply(qX)
  ua.quaternion.copy(qL)
  // 前臂
  Mu.multiplyMatrices(Mp, (ua.updateMatrix(), ua.matrix))
  Mf.multiplyMatrices(Mu, (fa.updateMatrix(), fa.matrix))
  vP.setFromMatrixPosition(Mf)
  Mf.decompose(vScl, qU, vScl); Mu.decompose(vScl, qP, vScl)
  vA.copy(hd.position).normalize().applyQuaternion(qU)
  vT.copy(vH).sub(vP).normalize()
  qX.setFromUnitVectors(vA, vT).multiply(qU)
  qL.copy(qP).invert().multiply(qX)
  fa.quaternion.copy(qL)
}

// ---------------------------------------------------------------- 第一层 + 第二层 + 第三层（上身）
const T1 = new THREE.Vector3(), T2 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3()
const hand = (b: B, side: Side, frame: 'chest' | 'hips' | 'head', x: number, y: number, z: number, px: number, py: number, pz: number, w: number) => {
  if (w <= .001) return
  const T = side === 'L' ? T1 : T2, P = side === 'L' ? P1 : P2
  if (frame === 'head') inHead(b, x, y, z, T); else inFrame(frame === 'chest' ? b.chest : b.hips, x, y, z, T)
  dirFrame(b.chest, px, py, pz, P)
  armIK(b, side, T, P, w)
}

export interface HeadFrameLite { chinY: number; topY: number; faceZ: number; halfW: number; eyeY: number }

/**
 * 上身待机层。motion：0 静止 … 1 行走；facing/x/y/z 与 HumanoidFrame 一致（世界坐标，facing=渲染朝向）。
 * 必须在 FK 手臂摆好之后、攻击姿势之前调用。
 */
export function applyIdleUpper(rig: RetroNpc, f: IdleFrame, frame: { time: number; x: number; y: number; z: number; facing: number; scale: number }, motion: number, stance?: IdleStance) {
  const b = rig.bones, still = 1 - clamp(motion, 0, 1), t = frame.time, seed = f.seed
  if (still <= .001) return
  const hf = rig.headFrame as HeadFrameLite
  const lean = clamp(f.lean ?? 0, 0, 1)
  // ---- 呼吸（胸廓 + 锁骨/肩）
  const rate = 1.35 + (seed % 5) * .09, br = Math.sin(t * rate + seed)
  if (!f.seated) {
    b.chest.scale.set(1 + br * .007 * still, 1 + br * .004 * still, 1 + br * .014 * still)
    b.clavicleL.rotation.z += br * .022 * still; b.clavicleR.rotation.z -= br * .022 * still
  }
  // ---- 重心转移的上身补偿 + 靠墙
  if (stance && !f.seated) {
    b.spine.rotation.z += -stance.shift * .035 * still
    b.chest.rotation.z += stance.shift * .018 * still
    b.spine.rotation.x -= .13 * lean; b.chest.rotation.x -= .03 * lean; b.head.rotation.x += .1 * lean
  }
  // ---- 放松手臂（肘部微弯 + 手腕偶尔小动）
  if (!f.seated) for (const side of ['L', 'R'] as const) {
    const sg = side === 'L' ? 1 : -1, ph = seed * .37 + (side === 'L' ? 0 : 2.1)
    b[('foreArm' + side) as 'foreArmL'].rotation.x -= .1 * still
    b[('upperArm' + side) as 'upperArmL'].rotation.z += sg * .025 * still
    b[('hand' + side) as 'handL'].rotation.x += (Math.sin(t * .7 + ph) * .06 + Math.max(0, Math.sin(t * 2.3 + ph)) ** 12 * .25) * still
    b[('hand' + side) as 'handL'].rotation.z += sg * .08 * still
  }

  // ---- 视线：扫视-停留；有注视对象时看过去（头分担 ~70%，胸 ~30%）
  const D = 1.7 + (seed % 5) * .3, gk = (t + (seed % 11) * .9) / D, gi = Math.floor(gk), gu = ease((gk - gi) * D / .3)
  const amp = f.temper === 'wary' ? 1.25 : f.temper === 'calm' ? .7 : 1
  const g = (i: number) => (hash(seed + 7, i) - .5) * 1.0 * amp
  const gp = (i: number) => (hash(seed + 13, i) - .5) * .22 + .03
  let yaw = g(gi - 1) + (g(gi) - g(gi - 1)) * gu, pitch = gp(gi - 1) + (gp(gi) - gp(gi - 1)) * gu
  const lk = clamp(f.lookK, 0, 1)
  if (f.look && lk > 0) {
    const s = frame.scale, dx = f.look.x - frame.x, dy = f.look.y - frame.y, dz = f.look.z - (frame.z + (f.seated ? 1.1 : 1.55) * s)
    const rel = wrap(Math.atan2(dy, dx) - frame.facing)
    let ly = clamp(-rel, -1.35, 1.35), lp = clamp(Math.atan2(dz, Math.hypot(dx, dy)), -.5, .45)
    if (f.avoid) { ly = -Math.sign(ly || 1) * .75; lp = -.2 }
    yaw += (ly - yaw) * lk; pitch += (lp - pitch) * lk
  }
  // 慢漂移：停留期间头也不是完全定住
  yaw += (Math.sin(t * .31 + seed) * .035 + Math.sin(t * .83 + seed * .7) * .015) * (1 - lk * .6)
  pitch += Math.sin(t * .23 + seed * 1.3) * .02
  const headYaw = clamp(yaw, -.8, .8), chestYaw = clamp(yaw - headYaw, -.5, .5)
  b.head.rotation.y = b.head.rotation.y * (1 - still) + headYaw * still
  b.head.rotation.x += -pitch * still
  b.chest.rotation.y += chestYaw * .75 * still; b.spine.rotation.y += chestYaw * .25 * still

  // ---- 闲聊
  if (f.chat && !f.act) {
    if (f.talking) {
      const g1 = clamp(Math.sin(t * .9 + seed) * 1.6 + .6, 0, 1), g2 = clamp(Math.sin(t * .63 + seed * 2) * 1.6 - .2, 0, 1)
      hand(b, 'R', 'chest', -.1 + Math.sin(t * 2.3) * .05, 1.07 + Math.sin(t * 3.1) * .05, .27 + Math.sin(t * 1.7) * .03, -1, -1, -.2, .85 * g1 * still)
      hand(b, 'L', 'chest', .1 + Math.sin(t * 1.9 + 1) * .04, 1.05 + Math.sin(t * 2.6) * .04, .24, 1, -1, -.2, .7 * g2 * still)
      b.head.rotation.x += Math.sin(t * 4.2) * .035 * still
      b.head.rotation.z += Math.sin(t * 1.3 + seed) * .05 * still
    } else {
      b.head.rotation.x += Math.max(0, Math.sin(t * 1.8 + seed)) ** 6 * .16 * still
      b.head.rotation.z += .06 * Math.sin(seed) * still
      if (seed % 3 === 0) armsCross(b, .9 * still)
      else if (seed % 3 === 1) armsBack(b, .85 * still)
    }
  }
  // ---- 靠墙双臂
  if (lean > .01 && !f.act) {
    const la = f.leanArms ?? 'cross'
    if (la === 'cross') armsCross(b, lean * still); else if (la === 'back') armsBack(b, lean * still); else armsFront(b, lean * still)
  }
  // ---- 小动作
  if (f.act) actPose(b, hf, f, still)
}

function armsCross(b: B, w: number) {
  hand(b, 'L', 'chest', -.1, 1.19, .135, .7, -1, .1, w)
  hand(b, 'R', 'chest', .11, 1.215, .12, -.7, -1, .1, w)
  b.handL.rotation.z += .3 * w; b.handR.rotation.z -= .3 * w
}
function armsBack(b: B, w: number) {
  hand(b, 'L', 'hips', .05, .99, -.15, 1, 0, -.35, w); hand(b, 'R', 'hips', -.05, .99, -.15, -1, 0, -.35, w)
}
function armsFront(b: B, w: number) {
  hand(b, 'L', 'hips', .035, .97, .16, 1, -.3, -.5, w); hand(b, 'R', 'hips', -.035, .955, .165, -1, -.3, -.5, w)
}
function armsHips(b: B, w: number) {
  hand(b, 'L', 'hips', .2, 1.03, 0, 1, .1, -.6, w); hand(b, 'R', 'hips', -.2, 1.03, 0, -1, .1, -.6, w)
  b.handL.rotation.z += .6 * w; b.handR.rotation.z -= .6 * w
}

function actPose(b: B, hf: HeadFrameLite, f: IdleFrame, still: number) {
  const T = f.actT, D = Math.max(.2, f.actDur), u = T / D, w = actEnvelope(T, D) * still
  if (w <= .001) return
  const sw = (hz: number, ph = 0) => Math.sin(T * hz * Math.PI * 2 + ph)
  switch (f.act) {
    case 'look': { // 环顾：左-右-回正
      const k = u < .33 ? ease(u / .2) : u < .7 ? 1 - 2 * ease((u - .33) / .2) : -1 + ease((u - .7) / .25)
      const s = (f.seed & 1 ? 1 : -1) * k
      b.head.rotation.y += s * .55 * w; b.chest.rotation.y += s * .3 * w; b.spine.rotation.y += s * .1 * w
      break
    }
    case 'scan': { // 警戒环顾：缓慢大幅扫视 + 双手身前
      const s = Math.sin(T * .9 + f.seed)
      b.head.rotation.y += s * .6 * w; b.chest.rotation.y += s * .3 * w; b.head.rotation.x -= .04 * w
      armsFront(b, w)
      break
    }
    case 'stretch': { // 伸懒腰：双臂上举 + 后仰
      const up = ease(u / .35) * (1 - ease((u - .7) / .25)) * w
      b.spine.rotation.x -= .12 * up; b.chest.rotation.x -= .08 * up; b.head.rotation.x -= .25 * up
      hand(b, 'L', 'chest', .16, 2.0, .02, 1, 0, -.4, up); hand(b, 'R', 'chest', -.16, 2.0, .02, -1, 0, -.4, up)
      b.chest.scale.z *= 1 + .03 * up
      break
    }
    case 'neck': { // 揉后颈 + 歪头
      b.head.rotation.x += .12 * w; b.head.rotation.z += Math.sin(T * 2.2) * .12 * w
      hand(b, 'R', 'head', -.02 + sw(1.6) * .015, hf.chinY - .01, -.075, -1, .2, 0, w)
      break
    }
    case 'watch': { // 看手表：左前臂横抬，低头看
      hand(b, 'L', 'chest', -.02, 1.2, .27, 1, -1, 0, w)
      b.handL.rotation.z -= .9 * w; b.handL.rotation.x -= .2 * w
      b.head.rotation.x += .38 * w; b.head.rotation.y += .22 * w
      break
    }
    case 'scratch': { // 挠头
      hand(b, 'R', 'head', -.03 + sw(4) * .02, hf.topY - .03, -.01, -1, .4, -.2, w)
      b.head.rotation.z -= .08 * w; b.head.rotation.x += .05 * w
      break
    }
    case 'cross': armsCross(b, w); break
    case 'hips': armsHips(b, w); b.chest.rotation.x -= .03 * w; break
    case 'back': armsBack(b, w); b.chest.rotation.x -= .025 * w; break
    case 'yawn': { // 打哈欠：手掩嘴，仰头，胸廓扩张
      const k = ease(u / .3) * (1 - ease((u - .65) / .3)) * w
      b.head.rotation.x -= .28 * k; b.chest.scale.z *= 1 + .04 * k; b.spine.rotation.x -= .04 * k
      hand(b, 'R', 'head', 0, hf.chinY + .04, hf.faceZ + .06, -1, -.7, .2, k)
      break
    }
    case 'shuffle': b.head.rotation.x += .12 * w; break // 换脚（落脚由 idleStance 驱动）
    case 'wipe': { // 擦汗：手背从额头一侧抹到另一侧
      const x = .06 - ease(u) * .12
      hand(b, 'R', 'head', x, hf.eyeY + .055, hf.faceZ + .045, -1, -.4, .1, w)
      b.head.rotation.x -= .06 * w
      break
    }
    case 'dust': { // 弯腰拍裤腿
      b.spine.rotation.x += .42 * w; b.chest.rotation.x += .12 * w; b.head.rotation.x += .1 * w
      const pat = Math.abs(sw(2.6)) * .05
      hand(b, 'L', 'hips', .1, .72 + pat, .13, 1, -.2, -.5, w); hand(b, 'R', 'hips', -.1, .72 + Math.abs(sw(2.6, 1.2)) * .05, .13, -1, -.2, -.5, w)
      break
    }
    case 'clipboard': case 'book': { // 翻看手里的本子/夹板
      hand(b, 'L', 'chest', .07, 1.12, .27, 1, -1, -.1, w)
      const flip = Math.max(0, Math.sin(T * 1.3)) ** 4
      hand(b, 'R', 'chest', -.06, 1.13 + flip * .06, .28 - flip * .02, -1, -1, -.1, w)
      b.head.rotation.x += .42 * w; b.head.rotation.y += .05 * w
      break
    }
    case 'radio': { // 对讲机凑到嘴边
      hand(b, 'R', 'head', -hf.halfW - .03, hf.chinY + .015, hf.faceZ * .55, -1, -1, 0, w)
      b.head.rotation.z -= .1 * w; b.head.rotation.x += .1 * w
      break
    }
    case 'hardhat': // 扶安全帽
      hand(b, 'R', 'head', -.04, hf.topY + .03, hf.faceZ * .6, -1, 0, .3, w); b.head.rotation.x += .05 * w; break
    case 'headphones': // 双手扶耳机
      hand(b, 'L', 'head', hf.halfW + .035, hf.eyeY, -.005, 1, -.3, -.2, w); hand(b, 'R', 'head', -hf.halfW - .035, hf.eyeY, -.005, -1, -.3, -.2, w)
      b.head.rotation.z += Math.sin(T * 2.4) * .05 * w; b.head.rotation.x += .08 * w
      break
    case 'satchel': { // 整理挎包背带：右手抓左肩背带往下捋
      const y = 1.4 - ease(u) * .2
      hand(b, 'R', 'chest', .11, y, .1, -1, -1, 0, w); b.head.rotation.y += .25 * w; b.head.rotation.x += .2 * w
      break
    }
    case 'tools': case 'apron': { // 低头擦手 / 清点工具
      const r = sw(1.8) * .04
      hand(b, 'L', 'hips', .05 + r, .99, .2, 1, -.6, -.3, w); hand(b, 'R', 'hips', -.05 + r, 1.0, .2, -1, -.6, -.3, w)
      b.head.rotation.x += .35 * w; b.spine.rotation.x += .06 * w
      break
    }
    case 'medic': // 检查腰侧医疗包
      hand(b, 'L', 'hips', .17, .98, .08, 1, -.4, -.4, w); hand(b, 'R', 'hips', .07, 1.0, .17, -1, -.6, -.2, w)
      b.head.rotation.x += .4 * w; b.head.rotation.y += .3 * w; b.spine.rotation.x += .05 * w
      break
    case 'crouch': // 蹲下看地面（髋部下沉由 idleStance 驱动，腿 IK 自动屈膝）
      b.spine.rotation.x += .45 * w; b.head.rotation.x += .25 * w
      hand(b, 'R', 'hips', -.1, .42, .42, -1, -.4, -.2, w * .9); hand(b, 'L', 'hips', .14, .7, .28, 1, -.4, -.4, w * .8)
      break
    case 'count': { // 清点：右手指向前方并逐个点过去
      const x = -.18 + Math.floor(u * 6) / 6 * .3
      hand(b, 'R', 'chest', x, 1.33, .52, -1, -1, 0, w); b.head.rotation.y -= (x + .03) * .8 * w; b.head.rotation.x += .05 * w
      armsBackOne(b, 'L', w)
      break
    }
    case 'wave': { // 挥手打招呼
      const k = ease(u / .25) * (1 - ease((u - .75) / .25)) * w
      hand(b, 'R', 'chest', -.3 + sw(2.4) * .06, 1.66, .14, -1, -1, -.3, k)
      b.handR.rotation.z += sw(2.4) * .2 * k
      break
    }
    case 'nod': b.head.rotation.x += Math.max(0, Math.sin(u * Math.PI * 2)) * .22 * w; break
    case 'glare': armsHips(b, w); b.head.rotation.x -= .05 * w; break
    case 'avert': b.head.rotation.x += .1 * w; break
  }
}
function armsBackOne(b: B, side: Side, w: number) { hand(b, side, 'hips', side === 'L' ? .05 : -.05, .99, -.15, side === 'L' ? 1 : -1, 0, -.35, w) }
