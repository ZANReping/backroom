import * as THREE from 'three'
import type { RetroNpc } from './retroNpc'
import { applyFacelingAge, applyFacelingGesture, type FacelingGesture } from './facelingAnim'
import type { FacelingAge } from '../entities/facelingTraits'
import { applyIdleUpper, idleStance, type IdleFrame, type IdleStance } from './npcIdlePose'

export interface HumanoidFrame {
  /** Simulation time and absolute world coordinates, unaffected by chunk rebasing. */
  time: number; x: number; y: number; z: number
  facing: number; scale?: number
  attack?: number
  tool?: boolean
  manner?: 'human' | 'faceling' | 'stolen'
  work?: 'shopkeeper' | 'office'
  /** Keep a special work/music pose in charge of the upper body. */
  special?: boolean
  /** v90 无面灵：年龄档（站姿/步态）与当前动作（片段内时间 gestureT，混合权重 gestureW） */
  age?: FacelingAge
  gesture?: FacelingGesture; gestureT?: number; gestureW?: number
  ground?: (x: number, y: number) => number
  /** NPC 待机层（重心转移/呼吸/视线/小动作/靠墙/闲聊）；缺省时保持原有站姿 */
  idle?: IdleFrame
}

interface Foot {
  point: THREE.Vector3; from: THREE.Vector3; target: THREE.Vector3
  swing: boolean; lift: number; phase: number
}
const clamp = THREE.MathUtils.clamp
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t) }
const TAU = Math.PI * 2, DUTY = .6
const cache = new WeakMap<THREE.Object3D, HumanoidMotion | null>()
const rigs = new WeakMap<RetroNpc, HumanoidMotion>()

/** Cached once per model; never allocate bones, meshes or materials in the frame loop. */
export function humanoidMotion(root: THREE.Object3D): HumanoidMotion | undefined {
  if (!cache.has(root)) {
    let rig: RetroNpc | undefined
    root.traverse(o => { if (!rig && o.userData.retro) rig = o.userData.retro as RetroNpc })
    if (rig && !rigs.has(rig)) rigs.set(rig, new HumanoidMotion(rig))
    cache.set(root, rig ? rigs.get(rig)! : null)
  }
  return cache.get(root) ?? undefined
}

/** Distance-driven footfalls with world-space stance locks and two-bone leg IK.
 * The rig faces +Z; callers supply the rendered heading (world +X = zero).
 * A stopped/blocked character settles its raised foot without cycling in place.
 */
export class HumanoidMotion {
  readonly feet: Foot[] = [0, 1].map(() => ({ point: new THREE.Vector3(), from: new THREE.Vector3(), target: new THREE.Vector3(), swing: false, lift: 0, phase: 0 }))
  readonly rig: RetroNpc
  phase = .25
  distance = 0
  speed = 0
  stride = .9
  resets = 0
  private last?: { time: number; x: number; y: number; z: number }
  private stillT = 0
  private settling = -1
  private settleT = 0
  private bones: THREE.Bone[]
  private hip = new THREE.Vector3()
  private target = new THREE.Vector3()
  private direction = new THREE.Vector3()
  private pole = new THREE.Vector3()
  private knee = new THREE.Vector3()
  private q = new THREE.Quaternion()
  private q2 = new THREE.Quaternion()
  private axis = new THREE.Vector3()
  private euler = new THREE.Euler()
  private idleSt: IdleStance | null = null
  private idleK = 0

  constructor(rig: RetroNpc) {
    this.rig = rig
    this.bones = Object.values(rig.bones)
    // Old rigid props lived on the thigh/upper arm. Preserve their rest position
    // but let boots follow the shin and held tools follow wrist/elbow articulation.
    rig.group.updateMatrixWorld(true)
    for (const side of ['L', 'R'] as const) {
      for (const [parent, child, cutoff] of [
        [rig.bones['upperArm' + side as 'upperArmL'], rig.bones['hand' + side as 'handL'], -.36],
        [rig.bones['thigh' + side as 'thighL'], rig.bones['shin' + side as 'shinL'], -.36],
      ] as const) for (const prop of [...parent.children]) {
        if (!(prop as THREE.Bone).isBone && prop.position.y < cutoff && !prop.userData.humanoidAttachment) {
          child.attach(prop); prop.userData.humanoidAttachment = true
        }
      }
    }
  }

  private resetPose() {
    for (const bone of this.bones) {
      bone.position.copy(bone.userData.bind as THREE.Vector3)
      bone.quaternion.identity(); bone.scale.setScalar(1)
    }
  }

  private landing(f: HumanoidFrame, i: number, forward: number, out: THREE.Vector3) {
    const s = this.rig.group.scale.y * (f.scale ?? 1)
    const st = this.idleSt, bx = this.rig.bones[i ? 'thighR' : 'thighL'].position.x
    const side = (bx + (st ? Math.sign(bx) * st.lat[i] * this.idleK : 0)) * s
    if (st) forward += st.fwd[i] * this.idleK * s
    out.set(f.x + Math.cos(f.facing) * forward + Math.sin(f.facing) * side,
      f.z, f.y + Math.sin(f.facing) * forward - Math.cos(f.facing) * side)
    const ground = f.ground?.(out.x, out.z)
    if (ground !== undefined && Number.isFinite(ground) && Math.abs(ground - f.z) < .42 * s) out.y = ground
  }

  update(f: HumanoidFrame) {
    const previous = this.last, elapsed = previous ? f.time - previous.time : 0
    const travel = previous ? Math.hypot(f.x - previous.x, f.y - previous.y) : 0
    const s = this.rig.group.scale.y * (f.scale ?? 1)
    // Hidden actors, teleports, level changes and clock resets must not turn into giant steps.
    const reset = !previous || elapsed < 0 || elapsed > .5 || travel > Math.max(.65 * s, Math.max(0, elapsed) * 7)
      || Math.abs(f.z - previous.z) > .65 * s
    const dt = clamp(elapsed, 0, .1)
    this.resetPose()
    if (reset) {
      this.resets++; this.speed = 0; this.phase = .25
      this.stillT = 0; this.settling = -1
      for (let i = 0; i < 2; i++) {
        const foot = this.feet[i]
        this.landing(f, i, 0, foot.point); foot.from.copy(foot.point)
        foot.swing = false; foot.lift = 0; foot.phase = (this.phase + i * .5) % 1
      }
    }
    const moved = !reset && elapsed > 0 && travel > 1e-5
    const velocity = moved ? travel / elapsed : 0
    if (moved && this.stillT > .2) {
      this.phase = Math.floor(this.phase) + .25
      for (let i = 0; i < 2; i++) { this.feet[i].phase = (this.phase + i * .5) % 1; this.feet[i].swing = false }
    }
    this.stillT = moved ? 0 : this.stillT + dt
    // 待机站姿：只在站定后生效（行走落脚不受影响）；换重心由下方「单脚挪步」自然完成
    this.idleK = f.idle && !moved && f.attack === undefined ? Math.min(1, this.idleK + dt / .5) : 0
    this.idleSt = f.idle && this.idleK > 0 ? idleStance(f.idle, f.time) : null
    if (moved) this.settling = -1
    this.speed += (velocity - this.speed) * (1 - Math.exp(-dt * (moved ? 12 : 18)))
    this.stride = clamp(.72 + this.speed / s * .24, .74, 1.28) * s
    if (moved) { this.phase += travel / this.stride; this.distance += travel }
    const motion = clamp(this.speed / (s * .55), 0, 1), run = ease((this.speed / s - 1.25) / 1.8)
    for (let i = 0; i < 2; i++) {
      const foot = this.feet[i], phase = (this.phase + i * .5) % 1
      if (moved) {
        const swing = phase >= DUTY
        if (swing && !foot.swing) foot.from.copy(foot.point)
        if (swing) {
          const u = (phase - DUTY) / (1 - DUTY)
          this.landing(f, i, this.stride * DUTY * .5, foot.target)
          foot.point.lerpVectors(foot.from, foot.target, ease(u))
          foot.lift = Math.sin(Math.PI * u) ** 2 * (.075 + run * .07) * s
        } else {
          if (foot.swing || phase < foot.phase) this.landing(f, i, (DUTY * .5 - phase) * this.stride, foot.point)
          foot.lift = 0
        }
        foot.swing = swing
      } else {
        // Finish lowering a swing foot; stance feet remain fixed even when an AI target persists.
        foot.lift = Math.max(0, foot.lift - dt * .6 * s)
        if (!foot.lift) foot.swing = false
      }
      foot.phase = phase
    }
    // After braking (or turning on the spot), recover a comfortable standing
    // stance one foot at a time. The other foot remains planted throughout.
    if (!moved && this.stillT > .2 && f.attack === undefined) {
      if (this.settling < 0) for (let i = 0; i < 2; i++) {
        const foot = this.feet[i]
        this.landing(f, i, 0, foot.target)
        if (foot.point.distanceTo(foot.target) > .045 * s) {
          this.settling = i; this.settleT = 0; foot.from.copy(foot.point); break
        }
      }
      if (this.settling >= 0) {
        const foot = this.feet[this.settling]
        this.settleT = Math.min(1, this.settleT + dt / .22)
        foot.point.lerpVectors(foot.from, foot.target, ease(this.settleT))
        foot.lift = Math.sin(Math.PI * this.settleT) ** 2 * .045 * s
        if (this.settleT === 1) { foot.lift = 0; this.settling = -1 }
      }
    } else if (f.attack !== undefined) this.settling = -1
    const b = this.rig.bones, wave = Math.sin(this.phase * TAU)
    let reach = 0
    for (let i = 0; i < 2; i++) {
      const foot = this.feet[i], dx = foot.point.x - f.x, dy = foot.point.z - f.y
      const lateral = (Math.sin(f.facing) * dx - Math.cos(f.facing) * dy) / s - b[i ? 'thighR' : 'thighL'].position.x
      reach = Math.max(reach, Math.hypot(lateral, (Math.cos(f.facing) * dx + Math.sin(f.facing) * dy) / s))
    }
    b.hips.position.y -= Math.min(.15, .001 * motion + reach * reach * .7)
    b.hips.position.x += wave * .008 * motion
    if (this.idleSt) {
      const k = ease(this.idleK)
      b.hips.position.x += this.idleSt.hipX * k; b.hips.position.y += this.idleSt.hipY * k; b.hips.position.z += this.idleSt.hipZ * k
    }
    // Hip lowering maintains reach while ankle orientation keeps the soles level during stance.
    for (let i = 0; i < 2; i++) this.legIK(f, i, s)
    const br = Math.sin(f.time * 1.65)
    b.chest.scale.set(1 + br * .004, 1, 1 + br * .008)
    b.spine.rotation.set(.025 + run * .12, -wave * .045 * motion, wave * .018 * motion)
    b.chest.rotation.y = wave * .065 * motion
    b.head.rotation.set(-.02 - run * .045, Math.sin(f.time * .43) * .1 * (1 - motion), 0)
    for (const side of ['L', 'R'] as const) {
      const sign = side === 'L' ? 1 : -1
      const arm = b['upperArm' + side as 'upperArmL'], fore = b['foreArm' + side as 'foreArmL']
      const restraint = f.manner === 'stolen' ? .28 : 1
      arm.rotation.set(wave * sign * (.22 + run * .28) * motion * restraint - .04,
        0, sign * (.055 + run * .035))
      fore.rotation.x = -.12 - run * .65 - Math.max(0, -wave * sign) * motion * .16
    }
    // Occupational gestures belong to indoor residents, not every faceling walking down a street.
    if (f.manner === 'faceling') {
      applyFacelingAge(this.rig, f.age, motion, f.time)
      // 职业动作由动作层接管：白领敲键盘、店员收银（停下来时才做）
      const work = !f.gesture && f.work && motion < .15 && f.attack === undefined ? (f.work === 'office' ? 'type' : 'cashier') : undefined
      if (f.gesture) applyFacelingGesture(this.rig, f.gesture, f.gestureT ?? f.time, f.gestureW ?? 1)
      else if (work) applyFacelingGesture(this.rig, work, f.time, 1 - motion / .15)
    } else if (f.work && motion < .15 && f.attack === undefined) {
      const k = 1 - motion / .15
      b.upperArmL.rotation.x -= k * .45; b.upperArmR.rotation.x -= k * .35
      b.foreArmL.rotation.x -= k * (.55 + Math.sin(f.time * 2.2) * .035)
      b.foreArmR.rotation.x -= k * (.5 + Math.sin(f.time * 2.2 + 1.8) * .035)
      b.head.rotation.x += .08 * k
    }
    if (f.idle && !f.special && f.attack === undefined)
      applyIdleUpper(this.rig, f.idle, { time: f.time, x: f.x, y: f.y, z: f.z, facing: f.facing, scale: s }, Math.max(motion, 1 - ease(Math.min(1, this.stillT / .45))), this.idleSt ?? undefined)
    if (f.attack !== undefined && !f.special) this.attack(clamp(f.attack, 0, 1), !!f.tool)
    this.last = { time: f.time, x: f.x, y: f.y, z: f.z }
  }

  private legIK(f: HumanoidFrame, i: number, scale: number) {
    const b = this.rig.bones, thigh = b[i ? 'thighR' : 'thighL'], shin = b[i ? 'shinR' : 'shinL'], ankle = b[i ? 'footR' : 'footL']
    const foot = this.feet[i], dx = foot.point.x - f.x, dy = foot.point.z - f.y
    this.hip.copy(b.hips.position).add(thigh.position)
    this.target.set((Math.sin(f.facing) * dx - Math.cos(f.facing) * dy) / scale,
      .085 + (foot.point.y + foot.lift - f.z) / scale,
      (Math.cos(f.facing) * dx + Math.sin(f.facing) * dy) / scale - .01)
    const l1 = shin.position.length(), l2 = ankle.position.length()
    this.direction.copy(this.target).sub(this.hip)
    const dist = clamp(this.direction.length(), .1, l1 + l2 - .0001)
    this.direction.normalize()
    this.pole.set(0, 0, 1).addScaledVector(this.direction, -this.direction.z).normalize()
    const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    this.knee.copy(this.hip).addScaledVector(this.direction, along).addScaledVector(this.pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)))
    this.axis.copy(shin.position).normalize()
    this.target.copy(this.knee).sub(this.hip).normalize()
    thigh.quaternion.setFromUnitVectors(this.axis, this.target)
    this.target.copy(this.hip).addScaledVector(this.direction, dist).sub(this.knee).normalize()
    this.axis.copy(ankle.position).normalize()
    this.q.setFromUnitVectors(this.axis, this.target)
    shin.quaternion.copy(thigh.quaternion).invert().multiply(this.q)
    ankle.quaternion.copy(this.q).invert()
    if (foot.lift > 0) ankle.quaternion.multiply(this.q2.setFromEuler(this.euler.set(-.12 * foot.lift / (.15 * scale), 0, 0)))
  }

  private attack(p: number, tool: boolean) {
    const b = this.rig.bones
    const wind = ease(p / .42), strike = ease((p - .42) / .23), recover = 1 - ease((p - .65) / .35)
    const load = wind * (1 - strike) * recover, hit = strike * recover
    const weight = Math.min(1, load + hit)
    // A guarded off hand, elbow-led strike and torso counterrotation replace the two-arm flail.
    b.spine.rotation.x += -.09 * load + .2 * hit
    b.spine.rotation.y += .23 * load - .24 * hit
    b.chest.rotation.y += .12 * load - .17 * hit
    b.head.rotation.y = b.head.rotation.y * (1 - weight) - b.spine.rotation.y * .5 * weight
    b.upperArmL.rotation.set(b.upperArmL.rotation.x * (1 - weight) + (tool ? -2.1 : .2) * load - 1.43 * hit, -.08 * weight, .16 * weight + .055)
    b.foreArmL.rotation.x = b.foreArmL.rotation.x * (1 - weight) - (.12 * weight + (tool ? .7 : 1.7) * load + .08 * hit)
    b.handL.rotation.x = -.12 * load + .08 * hit
    b.upperArmR.rotation.x = b.upperArmR.rotation.x * (1 - weight) - .6 * weight
    b.foreArmR.rotation.x = b.foreArmR.rotation.x * (1 - weight) - 1.12 * weight
  }
}
