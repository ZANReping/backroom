// 枪械第一人称（鎏金兵械库）：把 eng.gun（GunRun）+ 枪身弹仓翻译成画面——整枪站姿、枪内部件、双手、手里的弹、抛壳、枪口焰。
// 动作编排（关键帧）在 firearmAnim.ts；判定与时间表在 engine/firearms.ts。
//
// 约定：vmItem（枪根）在 vm 内恒为单位变换，vm 坐标 = 枪坐标；枪的整体动作 = vm 的变换。
// 两只手各挂在一个 carrier 上：carrier = H · L⁻¹，H 是手的目标变换（关键帧插值得到），L 是该握法在握持求解里的局部变换。
// 动作切换（含中断）时记下两只手 / 站姿 / 部件的当前值，新动作头 0.12 秒从这里平滑过渡，保证任何时候都不会跳。
import * as THREE from 'three'
import { buildCartMesh, setChambers, disposeFirearmPart, type GunRig } from './firearmMesh'
import { buildCapMesh } from './firearmGuns'
import { buildRetroHand, type RetroHand, type RetroHandLook } from './retroViewHand'
import { CHOREO, fdirFor, track, stepTrack, itemLen, type ActAnim, type AnimCtx, type HandKey, type PoseDef, type Stance } from './firearmAnim'
import { GUNS, MUZZLE_STAGES, isAmmo, type AmmoType, type Chamber, type GunType } from '../content/firearms'
import type { GunRun } from '../engine/firearms'

const easeK = (k: number) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** vm 的整体缩放：真实尺寸的长枪放在镜头前会顶到墙，按 0.8 缩一点（手跟着一起缩，比例不变） */
export const GUN_VM_SCALE = 0.8
const BLEND_IN = 0.12
/** 完全贴腮时手的不透明度 */
export const ADS_HAND_OPACITY = 0.38
const STANCE_KEYS = ['px', 'py', 'pz', 'rx', 'ry', 'rz'] as const
/** 前臂在镜头坐标系里的理想方向（手腕 → 手肘） */
const ARM_R: [number, number, number] = [0.32, -0.7, 0.64], ARM_L: [number, number, number] = [-0.36, -0.7, 0.6]

/** 贴腮：眼位落在照门 / 通风带延长线上，准星压在镜头中心 */
export function adsStance(rig: GunRig): Stance {
  const eye = rig.sight.eye, dir = rig.sight.target.clone().sub(eye).normalize()
  const rx = Math.atan2(dir.y, -dir.z)
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-rx, 0, 0, 'YXZ'))
  const e = eye.clone().multiplyScalar(GUN_VM_SCALE).applyQuaternion(q).negate()
  return { px: e.x, py: e.y, pz: e.z, rx: -rx, ry: 0, rz: 0 }
}

export interface GunFrameIn {
  run: GunRun; mag: readonly Chamber[]; sel: AmmoType; stage: number; cyl: number
  sprint: boolean; moving: boolean; time: number; bob: number; dt: number; camera: THREE.Camera; floorY: number
}
export interface GunFrameOut extends Stance { act: string; u: number }

interface HandSlot {
  hand: RetroHand; carrier: THREE.Group; held: THREE.Group; poseName: string
  H: THREE.Matrix4 // 本帧手的变换（vm 坐标）
  snap: THREE.Matrix4 // 动作切换时的手
  snapPose: string
  heldKey: string
}
interface FlyShell { o: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; t: number; rest: boolean; floor: number }

/** 下一发将要打的转轮膛（与 engine pickChamber 一致） */
function nextLoaded(mag: readonly Chamber[], c0: number) { for (let k = 0; k < mag.length; k++) { const b = (c0 + k) % mag.length; if (isAmmo(mag[b])) return b } return c0 % mag.length }

export class FirearmView {
  private rig: GunRig | null = null
  private type: GunType = 'dbshotgun'
  private hands: Record<'L' | 'R', HandSlot>
  private rightParent: THREE.Object3D | null = null
  private poseL = new Map<string, THREE.Matrix4>() // 握法局部变换 L
  private nodeRest = new Map<string, THREE.Matrix4>() // 部件静止位（枪坐标）
  private dummies = new Map<string, THREE.Group>()
  // Contact-only clones borrow gun/hand resources; never dispose their geometry or materials.
  private aroundSolids = new Map<string, THREE.Group>()
  private effPoses = new Map<string, PoseDef>()
  /** local 握法在主要使用时刻的镜头坐标朝向：腰间 / 嘴边这些镜头挂点沿用它，手在路上不打转、前臂方向也一致 */
  private useRot = new Map<string, THREE.Quaternion>()
  private fdirs = new Map<string, [number, number, number]>()
  private actKey = ''
  private changeT = 0
  private snapStance: Stance = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 }
  private snapCh: Record<string, number> = {}
  private lastStance: Stance = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 }
  private lastCh: Record<string, number> = {}
  private lastBarrel = 0
  private shotSeen = 0
  private ejectSeen = 0
  private flash: THREE.Sprite
  flashK = 0
  readonly muzzleWorld = new THREE.Vector3()
  private fly: FlyShell[] = []
  private scene: THREE.Scene
  private vm: THREE.Group
  private ads: Stance | null = null
  private _m = new THREE.Matrix4(); private _m3 = new THREE.Matrix4(); private _m2 = new THREE.Matrix4(); private _vmM = new THREE.Matrix4(); private _vmInv = new THREE.Matrix4()

  constructor(vm: THREE.Group, scene: THREE.Scene) {
    this.scene = scene; this.vm = vm
    const mk = (hand: RetroHand): HandSlot => { const carrier = new THREE.Group(); carrier.matrixAutoUpdate = false; const held = new THREE.Group(); carrier.add(held); return { hand, carrier, held, poseName: '', H: new THREE.Matrix4(), snap: new THREE.Matrix4(), snapPose: '', heldKey: '' } }
    this.hands = { L: mk(buildRetroHand({ left: true })), R: mk(null as unknown as RetroHand) }
    this.hands.L.carrier.add(this.hands.L.hand.group)
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex(), color: '#ffe2a8', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    this.flash.visible = false
  }

  get active() { return !!this.rig }
  get gunType() { return this.type }
  /** 接管：rig = 手里的枪；right = renderer 的右手（挂到右 carrier 上，卸下时还回去） */
  attach(rig: GunRig, right: RetroHand, look: RetroHandLook | null) {
    if (this.rig) this.detach()
    this.rig = rig; this.type = rig.type
    this.ads = null // Recompute sight alignment for this gun when reusing the view.
    const R = this.hands.R
    R.hand = right; this.rightParent = right.group.parent
    R.carrier.add(right.group)
    this.vm.add(this.hands.L.carrier); this.vm.add(R.carrier)
    if (look) this.hands.L.hand.setLook(look)
    // 部件静止位 + 握法求解
    rig.apply({})
    rig.root.updateMatrixWorld(true)
    this.nodeRest.clear(); this.poseL.clear(); this.effPoses.clear(); this.useRot.clear()
    this.clearAroundSolids()
    const inv = new THREE.Matrix4().copy(rig.root.matrixWorld).invert()
    for (const [n, o] of Object.entries(rig.parts)) this.nodeRest.set(n, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))
    const ch = CHOREO[this.type]
    for (const [name, pd] of Object.entries(ch.poses)) { const e = pd.use || pd.frame === 'gun' ? this.armFor(name, pd) : pd; this.effPoses.set(name, e); this.preparePose(name, e) }
    this.hands.L.poseName = ''; R.poseName = ''
    this.actKey = '#'
    rig.muzzles[0].add(this.flash)
  }
  detach() {
    const R = this.hands.R
    if (this.rig) {
      this.flash.removeFromParent()
      this.hands.L.hand.setOpacity(1); R.hand.setOpacity(1)
      // 右手还给 renderer（它会按新物品重设握法）
      if (this.rightParent) this.rightParent.add(R.hand.group)
      R.hand.group.matrixAutoUpdate = true
      this.hands.L.carrier.removeFromParent(); R.carrier.removeFromParent()
      for (const h of [this.hands.L, R]) { for (const o of [...h.held.children]) disposeFirearmPart(o); h.heldKey = '' }
    }
    this.clearAroundSolids()
    this.rig = null; this.flashK = 0
  }
  setLook(l: RetroHandLook) { this.hands.L.hand.setLook(l) }
  /** 调试：两只手前臂在镜头坐标系里的方向 */
  /** 预览 / 检查用：两只手（含手里的弹）的挂载节点 */
  handNodes(): THREE.Object3D[] { return [this.hands.L.carrier, this.hands.R.carrier] }

  debugArms(camera: THREE.Camera): string {
    const ci = new THREE.Matrix4().copy(camera.matrixWorld).invert()
    return (['L', 'R'] as const).map((k) => {
      const h = this.hands[k], f = this.fdirs.get(h.poseName) ?? [0, 0, 1]
      const m = new THREE.Matrix4().multiplyMatrices(ci, h.hand.group.matrixWorld)
      const d = new THREE.Vector3(k === 'L' ? -f[0] : f[0], f[1], f[2]).transformDirection(m)
      return `${k}:${h.poseName}(${d.x.toFixed(2)},${d.y.toFixed(2)},${d.z.toFixed(2)})`
    }).join(' ')
  }

  /** 前臂方向：镜头坐标系里的理想方向 → 握法坐标系（见 PoseDef.use） */
  private armFor(name: string, pd: PoseDef): PoseDef {
    const ch = CHOREO[this.type], st = ch.stances[pd.use?.stance ?? 'hip'] ?? ch.stances.hip
    const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(st.rx, st.ry, st.rz, this.vm.rotation.order))
    if (pd.frame === 'local' && pd.use?.att) {
      const ctx: AnimCtx = { barrel: 0, cyl: 0, nextCyl: 0, lastBarrel: 0, loaded: false, stepNo: 0 }
      const H = this.keyH(this.hands[pd.hand], { t: 0, att: pd.use!.att, pose: name }, ctx, new THREE.Matrix4(), new THREE.Matrix4())
      R.multiply(new THREE.Matrix4().extractRotation(H))
    } else if (pd.node && this.nodeRest.has(pd.node)) R.multiply(new THREE.Matrix4().extractRotation(this.nodeRest.get(pd.node)!))
    if (pd.frame === 'local') this.useRot.set(name, new THREE.Quaternion().setFromRotationMatrix(R))
    const want = new THREE.Vector3(...(pd.use?.arm ?? (pd.hand === 'R' ? ARM_R : ARM_L))).normalize()
    const d = want.applyMatrix4(R.invert())
    return { ...pd, pose: { ...pd.pose, fdir: fdirFor(pd.pose.ax!, pd.pose.ay!, [d.x, d.y, d.z], pd.hand === 'L') } }
  }
  private dummy(item: string): THREE.Group {
    let d = this.dummies.get(item)
    if (!d) { d = new THREE.Group(); d.add(item === 'cap' ? buildCapMesh() : buildCartMesh(item as AmmoType)); this.dummies.set(item, d) }
    return d
  }
  private clearAroundSolids() {
    for (const solid of this.aroundSolids.values()) solid.clear()
    this.aroundSolids.clear()
  }
  /** 握法求解的实体：枪（around = 枪 + 另一只手的那个握法） / 捏着的弹 */
  private solidFor(name: string, pd: PoseDef): THREE.Object3D {
    if (pd.frame !== 'gun') return this.dummy(pd.item ?? 'shell_buck')
    if (!pd.around) return this.rig!.root
    const key = `around:${this.type}:${name}`
    let c = this.aroundSolids.get(key)
    if (!c) {
      c = new THREE.Group()
      // Same gun and grip produce the same contact shape across repeated attachments.
      c.userData.handContactCacheKey = `${this.rig!.root.uuid}:around:${pd.around}`
      const src = this.rig!.root, ud = src.userData; src.userData = {} // userData 里挂着 gunRig（循环引用），clone 会 JSON 拷贝它
      let g: THREE.Group
      try { g = src.clone(true) } finally { src.userData = ud }
      g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.set(1, 1, 1); c.add(g)
      const od = this.effPoses.get(pd.around) ?? CHOREO[this.type].poses[pd.around]
      c.add(this.hands[od.hand].hand.preparePose(od.pose, this.rig!.root))
      c.updateMatrixWorld(true)
      this.aroundSolids.set(key, c)
    }
    return c
  }
  private preparePose(name: string, pd: PoseDef) {
    const hand = this.hands[pd.hand].hand
    const item = this.solidFor(name, pd)
    this.fdirs.set(name, pd.pose.fdir ?? [0.3, -0.35, 1])
    const root = hand.preparePose(pd.pose, item)
    root.updateMatrix()
    this.poseL.set(name, root.matrix.clone())
  }
  private setHandPose(slot: HandSlot, name: string) {
    if (slot.poseName === name) return
    slot.poseName = name
    const pd = this.effPoses.get(name) ?? CHOREO[this.type].poses[name]
    slot.hand.setPose(pd.pose, this.solidFor(name, pd))
  }

  /** 一个关键帧的手目标变换 H（vm 坐标） */
  private keyH(slot: HandSlot, k: HandKey, ctx: AnimCtx, out: THREE.Matrix4, Lover?: THREE.Matrix4): THREE.Matrix4 {
    const rig = this.rig!, ch = CHOREO[this.type], pd = ch.poses[k.pose], L = Lover ?? this.poseL.get(k.pose)!
    const T = this._m
    switch (k.att) {
      case 'prev': return out.copy(slot.snap)
      case '@': {
        const node = pd.node ? rig.parts[pd.node] : null
        if (!node) T.identity()
        else {
          node.updateWorldMatrix(true, false)
          T.copy(rig.root.matrixWorld).invert().multiply(node.matrixWorld).multiply(this._m2.copy(this.nodeRest.get(pd.node!)!).invert())
          const fk = pd.follow ?? 1
          if (fk < 1) {
            // 只跟一部分转动：握点位置照跟，朝向在「不转」和「全转」之间插值
            const at = new THREE.Vector3(...pd.pose.at), now = at.clone().applyMatrix4(T)
            const q = new THREE.Quaternion().setFromRotationMatrix(T), q0 = new THREE.Quaternion().slerp(q, fk)
            T.makeRotationFromQuaternion(q0); const rot = at.clone().applyQuaternion(q0)
            T.setPosition(now.sub(rot))
          }
        }
        break
      }
      case 'belt': case 'face': {
        const cp = k.att === 'face' ? ch.cam.face : pd.hand === 'L' ? ch.cam.beltL : ch.cam.beltR
        T.compose(new THREE.Vector3(...cp.p), this.useRot.get(k.pose) ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...cp.r, 'YXZ')), new THREE.Vector3(1, 1, 1))
        T.premultiply(this._vmInv).multiply(this._m2.makeScale(GUN_VM_SCALE, GUN_VM_SCALE, GUN_VM_SCALE)) // 手与枪同一缩放
        break
      }
      default: {
        const name = k.att
        let o: THREE.Object3D | undefined, back = 0, up = 0
        const len = pd.item && pd.item !== 'cap' ? itemLen(pd.item) : 0.01
        if (name === 'mouth' || name === 'seat') { o = rig.chambers[ctx.barrel] ?? rig.chambers[0]; back = name === 'mouth' ? len + 0.012 : 0 }
        else if (name === 'gateIn' || name === 'gateSeat') { o = rig.anchors.gate; back = name === 'gateIn' ? len + 0.01 : 0 }
        else if (name === 'muzIn' || name === 'muzSeat') { o = rig.anchors.mouth; back = name === 'muzIn' ? len + 0.008 : -0.02 }
        else if (name === 'nipIn' || name === 'nipSeat') { o = rig.anchors.nipple; up = name === 'nipIn' ? 0.022 : 0 }
        else o = rig.anchors[name]
        if (!o) T.identity()
        else { o.updateWorldMatrix(true, false); T.copy(rig.root.matrixWorld).invert().multiply(o.matrixWorld); if (back || up) T.multiply(this._m2.makeTranslation(0, up, back)) }
      }
    }
    if (k.off) T.multiply(this._m2.makeTranslation(...k.off))
    return out.multiplyMatrices(T, L)
  }

  update(f: GunFrameIn): GunFrameOut {
    const rig = this.rig!, ch = CHOREO[this.type], run = f.run, def = GUNS[this.type]
    // ---- 上下文
    const step = run.step
    const barrel = step?.barrel ?? this.lastBarrel
    if (step) this.lastBarrel = step.barrel
    const loaded = def.reload.kind === 'muzzle' ? f.stage >= MUZZLE_STAGES.length && isAmmo(f.mag[0]) : isAmmo(f.mag[0])
    const ctx: AnimCtx = { barrel, stage: step?.stage, cyl: f.cyl, nextCyl: nextLoaded(f.mag, f.cyl), lastBarrel: run.lastBarrel, loaded, stepNo: run.stepNo, more: run.steps.length > 0 }
    const act = run.act
    const u = run.dur > 0 ? Math.min(1, run.t / run.dur) : 1
    let anim: ActAnim | null = act === 'idle' ? null : ch.act(act, ctx)
    if (!anim) anim = { vm: [[0, 'hip']], L: [{ t: 0, att: '@', pose: ch.idleHands.L }], R: [{ t: 0, att: '@', pose: ch.idleHands.R }] }
    // ---- 动作切换：记下当前值
    const key = `${act}:${run.stepNo}:${step?.stage ?? ''}:${run.shotN}`
    const first = this.actKey === '#'
    if (key !== this.actKey) {
      this.actKey = key; this.changeT = first ? f.time - BLEND_IN : f.time
      this.snapStance = { ...this.lastStance }; this.snapCh = { ...this.lastCh }
      for (const h of [this.hands.L, this.hands.R]) { h.snap.copy(h.H); h.snapPose = h.poseName }
    }
    const blend = easeK((f.time - this.changeT) / BLEND_IN)
    // ---- 站姿
    const st = this.stanceAt(anim.vm, u)
    this.ads ??= adsStance(rig)
    const a = easeK(run.aim)
    for (const k of STANCE_KEYS) st[k] = lerp(st[k], this.ads[k], a)
    // 贴腮瞄准：两只手（含前臂）渐变成半透明，枪和目标从手后面透出来
    const op = 1 - (1 - ADS_HAND_OPACITY) * a
    this.hands.L.hand.setOpacity(op); this.hands.R.hand.setOpacity(op)
    const sw = f.moving ? Math.sin(f.bob) : 0, sw2 = f.moving ? Math.abs(Math.cos(f.bob)) : 0, mk = 1 - a * 0.85
    st.px += sw * 0.012 * mk; st.py -= sw2 * 0.014 * mk; st.rz += sw * 0.015 * mk
    st.py += Math.sin(f.time * 1.3) * 0.0016 * (1 - a * 0.6); st.rx += Math.sin(f.time * 1.1) * 0.003
    if (f.sprint) { st.rx -= 0.5; st.ry += 0.55; st.px -= 0.05; st.py -= 0.03; st.rz += 0.25 }
    const w = 1 - Math.max(0, Math.min(1, (run.wall - 0.35) / 0.65))
    if (w > 0 && act === 'idle' || w > 0 && act === 'fire') { st.pz += w * 0.08; st.rx -= w * 0.42; st.py -= w * 0.015 }
    const r = run.recoil, rk = r * r * (1 - a * 0.35) * (this.type === 'revolver' ? 1.3 : 1)
    st.pz += rk * 0.07; st.rx += rk * (this.type === 'revolver' ? 0.28 : 0.16); st.py += rk * 0.012; st.rz -= rk * 0.03
    if (blend < 1) for (const k of STANCE_KEYS) st[k] = lerp(this.snapStance[k], st[k], blend)
    this.lastStance = { ...st }
    this._vmM.compose(new THREE.Vector3(st.px, st.py, st.pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(st.rx, st.ry, st.rz, this.vm.rotation.order)), new THREE.Vector3(GUN_VM_SCALE, GUN_VM_SCALE, GUN_VM_SCALE))
    this._vmInv.copy(this._vmM).invert()
    // ---- 部件
    const chv: Record<string, number> = { ...ch.idle(ctx) }
    for (const [n, t] of Object.entries(anim.ch ?? {})) if (t) chv[n] = track(t, u, chv[n] ?? 0)
    if (blend < 1) for (const n of Object.keys(chv)) if (this.snapCh[n] !== undefined && n !== 'cyl' && n !== 'trig') chv[n] = lerp(this.snapCh[n], chv[n], blend)
    if (blend < 1 && this.snapCh.cyl !== undefined && chv.cyl !== undefined) chv.cyl = lerp(this.snapCh.cyl, chv.cyl, blend)
    this.lastCh = chv
    rig.apply(chv)
    rig.root.updateMatrixWorld(true)
    // ---- 膛内弹（插入 / 拔出到位时提前变化）
    let shown: Chamber[] = [...f.mag]
    if (step && anim.seat !== undefined && u >= anim.seat) shown[step.barrel] = act === 'insert' ? (step.ammo ?? '') : ''
    if (this.type === 'leverrifle') shown = [shown[0]] // 管式弹仓只显示膛里那一发
    setChambers(rig, shown, f.sel)
    // ---- 两只手
    for (const hk of ['L', 'R'] as const) {
      const slot = this.hands[hk], keys = anim[hk].map((k) => (k.att === 'prev' && slot.snapPose ? { ...k, pose: slot.snapPose } : k)) // 「上一动作结束处」沿用当时的握法
      let i = 0
      while (i < keys.length - 1 && u > keys[i + 1].t) i++
      const k0 = keys[i], k1 = keys[Math.min(i + 1, keys.length - 1)]
      const lin = k1 === k0 || u <= k0.t ? 0 : Math.min(1, (u - k0.t) / Math.max(1e-6, k1.t - k0.t))
      const kk = easeK(lin)
      const H0 = this.keyH(slot, k0, ctx, new THREE.Matrix4())
      const H1 = k1 === k0 ? H0 : this.keyH(slot, k1, ctx, new THREE.Matrix4())
      const H = lerpMat(H0, H1, kk, slot.H)
      if (k1 !== k0 && (PASS[k0.att] || PASS[k1.att])) {
        // 途经点（腰间、膛口、装弹口前……）不停顿：位置走 Catmull-Rom 样条，到接触点（到位 / 握回部件）再减速停下
        const pos = (k: HandKey) => new THREE.Vector3().setFromMatrixPosition(this.keyH(slot, k, ctx, this._m3))
        const P0 = _pa2.setFromMatrixPosition(H0), P1 = _pb2.setFromMatrixPosition(H1), dt = k1.t - k0.t
        const tan = (j: number, P: THREE.Vector3) => {
          const k = keys[j], w = PASS[k.att] ?? 0
          if (!w || j === 0 || j === keys.length - 1) return new THREE.Vector3()
          return pos(keys[j + 1]).sub(pos(keys[j - 1])).multiplyScalar(w / Math.max(1e-6, keys[j + 1].t - keys[j - 1].t)).multiplyScalar(dt).add(P).sub(P)
        }
        const m0 = tan(i, P0), m1 = tan(i + 1, P1), x = lin, x2 = x * x, x3 = x2 * x
        const p = P0.clone().multiplyScalar(2 * x3 - 3 * x2 + 1).addScaledVector(m0, x3 - 2 * x2 + x).addScaledVector(P1, -2 * x3 + 3 * x2).addScaledVector(m1, x3 - x2)
        H.setPosition(p)
      }
      if (blend < 1) lerpMat(slot.snap, H.clone(), blend, slot.H)
      const poseName = kk < 0.5 ? k0.pose : k1.pose
      this.setHandPose(slot, poseName)
      // carrier = H · L⁻¹
      slot.carrier.matrix.copy(slot.H).multiply(this._m.copy(this.poseL.get(poseName)!).invert())
      slot.carrier.matrixWorldNeedsUpdate = true
      // 手里的东西（只在捏物握法里显示）
      const pd = ch.poses[poseName]
      const h = stepTrack(anim[hk === 'L' ? 'heldL' : 'heldR'], u, '')
      const item = pd.frame !== 'local' || !h ? '' : h === 'cap' ? 'cap' : h === 'chamber' ? (isAmmo(f.mag[barrel]) ? f.mag[barrel] : f.sel) : (step?.ammo ?? f.sel)
      if (item !== slot.heldKey) {
        slot.heldKey = item; for (const o of [...slot.held.children]) disposeFirearmPart(o)
        if (item) slot.held.add(item === 'cap' ? buildCapMesh() : buildCartMesh(item as AmmoType))
      }
    }
    // ---- 抛壳
    if (run.ejectN > this.ejectSeen) {
      this.ejectSeen = run.ejectN
      for (const b of run.ejectBarrels) this.spawnFly(rig.anchors.eject ?? rig.chambers[b] ?? rig.chambers[0]!, run.ejectAmmo ?? f.sel, f.camera, f.floorY, rig.anchors.eject ? 'top' : 'back')
    }
    this.ejectSeen = run.ejectN
    // ---- 枪口焰
    if (run.shotN > this.shotSeen) {
      this.shotSeen = run.shotN
      ;(rig.muzzles[run.lastBarrel] ?? rig.muzzles[0]).add(this.flash)
      this.flashK = 1
      this.flash.material.rotation = Math.random() * 6.28
    }
    this.shotSeen = run.shotN
    this.flashK = Math.max(0, this.flashK - f.dt / 0.06)
    this.flash.visible = this.flashK > 0
    this.flash.scale.setScalar((this.type === 'revolver' ? 0.07 : 0.09) + 0.12 * this.flashK * (this.type === 'musket' ? 1.5 : 1))
    this.flash.position.set(0, 0, -0.05)
    this.flash.material.opacity = Math.min(1, this.flashK * 1.4)
    ;(rig.muzzles[run.lastBarrel] ?? rig.muzzles[0]).getWorldPosition(this.muzzleWorld)
    this.updateFly(f.dt)
    return { ...st, act, u }
  }

  private stanceAt(keys: [number, string][], u: number): Stance {
    const S = CHOREO[this.type].stances
    const get = (n: string) => S[n] ?? S.hip
    if (u <= keys[0][0] || keys.length === 1) return { ...get(keys[0][1]) }
    for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) {
      const a = get(keys[i - 1][1]), b = get(keys[i][1]), k = easeK((u - keys[i - 1][0]) / Math.max(1e-6, keys[i][0] - keys[i - 1][0]))
      const o = { ...a }; for (const key of STANCE_KEYS) o[key] = lerp(a[key], b[key], k); return o
    }
    return { ...get(keys[keys.length - 1][1]) }
  }

  private spawnFly(from: THREE.Object3D, ammo: AmmoType, camera: THREE.Camera, floorY: number, dir: 'top' | 'back') {
    if (ammo === 'cart_paper') return
    from.updateWorldMatrix(true, false)
    const o = buildCartMesh(ammo, true)
    this.scene.add(o)
    from.matrixWorld.decompose(o.position, o.quaternion, new THREE.Vector3())
    const q = camera.getWorldQuaternion(new THREE.Quaternion())
    const v = (dir === 'top' ? new THREE.Vector3(0.8 + Math.random() * 0.5, 2.2 + Math.random() * 0.6, 0.25 + Math.random() * 0.3) : new THREE.Vector3(0.7 + Math.random() * 0.4, 1.9 + Math.random() * 0.5, 0.35 + Math.random() * 0.3)).applyQuaternion(q)
    const w = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 14)
    this.fly.push({ o, v, w, t: 0, rest: false, floor: floorY + 0.006 })
    while (this.fly.length > 16) { const f = this.fly.shift()!; disposeFirearmPart(f.o) }
  }
  private updateFly(dt: number) {
    for (let i = this.fly.length - 1; i >= 0; i--) {
      const f = this.fly[i]
      f.t += dt
      if (!f.rest) {
        f.v.y -= 9.8 * dt
        f.o.position.addScaledVector(f.v, dt)
        f.o.rotateX(f.w.x * dt); f.o.rotateY(f.w.y * dt); f.o.rotateZ(f.w.z * dt)
        if (f.o.position.y <= f.floor) {
          f.o.position.y = f.floor
          if (Math.abs(f.v.y) < 1.2) { f.rest = true; f.o.rotation.set(0, Math.random() * 6.28, 0); f.o.rotateX(Math.PI / 2) } // 躺倒在地
          else { f.v.y *= -0.32; f.v.x *= 0.5; f.v.z *= 0.5; f.w.multiplyScalar(0.5) }
        }
      }
      if (f.t > 40) { disposeFirearmPart(f.o); this.fly.splice(i, 1) }
    }
  }
  shiftWorld(dx: number, dz: number) { for (const f of this.fly) { f.o.position.x += dx; f.o.position.z += dz } }
  clearWorld() { for (const f of this.fly) disposeFirearmPart(f.o); this.fly = [] }
  dispose() { this.detach(); this.clearWorld(); this.hands.L.hand.dispose(); for (const o of this.dummies.values()) disposeFirearmPart(o); this.dummies.clear(); this.flash.material.dispose() }
}

/** 两个刚体变换之间插值（位置线性、朝向球面），结果写进 out */
const _pa2 = new THREE.Vector3(), _pb2 = new THREE.Vector3()
/** 途经点挂点 → 切线权重（0 = 停靠点） */
const PASS: Record<string, number> = { belt: 0.75, mouth: 0.8, gateIn: 0.8, muzIn: 0.6, nipIn: 0.8, face: 0.5 }
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3()
function lerpMat(a: THREE.Matrix4, b: THREE.Matrix4, k: number, out: THREE.Matrix4): THREE.Matrix4 {
  a.decompose(_pa, _qa, _sa); b.decompose(_pb, _qb, _sb)
  _pa.lerp(_pb, k); _qa.slerp(_qb, k); _sa.lerp(_sb, k)
  return out.compose(_pa, _qa, _sa)
}

// ---------------------------------------------------------------- 世界特效：弹孔 / 尘土火星 / 硝烟 / 爆团弹爆点
const fxTex = new Map<string, THREE.CanvasTexture>()
function canvasTex(key: string, n: number, paint: (c: CanvasRenderingContext2D, n: number) => void) {
  let t = fxTex.get(key); if (t) return t
  const cv = document.createElement('canvas'); cv.width = cv.height = n
  paint(cv.getContext('2d')!, n)
  t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.userData.shared = true
  fxTex.set(key, t); return t
}
export const flashTex = () => canvasTex('fa-flash', 128, (c, n) => {
  const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
  g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(.18, 'rgba(255,220,140,.95)'); g.addColorStop(.45, 'rgba(255,140,40,.45)'); g.addColorStop(1, 'rgba(255,90,20,0)')
  c.fillStyle = g; c.fillRect(0, 0, n, n)
  c.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + Math.random() * .4, L = n * (.28 + Math.random() * .2)
    const gg = c.createLinearGradient(n / 2, n / 2, n / 2 + Math.cos(a) * L, n / 2 + Math.sin(a) * L)
    gg.addColorStop(0, 'rgba(255,230,160,.9)'); gg.addColorStop(1, 'rgba(255,140,40,0)')
    c.strokeStyle = gg; c.lineWidth = 5; c.beginPath(); c.moveTo(n / 2, n / 2); c.lineTo(n / 2 + Math.cos(a) * L, n / 2 + Math.sin(a) * L); c.stroke()
  }
})
const smokeTex = () => canvasTex('fa-smoke', 128, (c, n) => {
  for (let i = 0; i < 26; i++) {
    const x = n / 2 + (Math.random() - .5) * n * .4, y = n / 2 + (Math.random() - .5) * n * .4, r = n * (.12 + Math.random() * .22)
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(220,216,206,.28)'); g.addColorStop(1, 'rgba(220,216,206,0)')
    c.fillStyle = g; c.fillRect(0, 0, n, n)
  }
})
const holeTex = () => canvasTex('fa-hole', 64, (c, n) => {
  const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
  g.addColorStop(0, 'rgba(8,6,4,1)'); g.addColorStop(.28, 'rgba(14,10,8,.95)'); g.addColorStop(.42, 'rgba(60,48,36,.55)'); g.addColorStop(.7, 'rgba(40,32,24,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g; c.fillRect(0, 0, n, n)
  c.strokeStyle = 'rgba(20,14,10,.5)'; c.lineWidth = 1.2
  for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28; c.beginPath(); c.moveTo(n / 2 + Math.cos(a) * n * .14, n / 2 + Math.sin(a) * n * .14); c.lineTo(n / 2 + Math.cos(a) * n * (.25 + Math.random() * .2), n / 2 + Math.sin(a) * n * (.25 + Math.random() * .2)); c.stroke() }
})

interface Puff { s: THREE.Sprite; v: THREE.Vector3; t: number; life: number; grow: number; a0: number }
export class GunWorldFx {
  private decals: THREE.Mesh[] = []
  private decalGeo = new THREE.PlaneGeometry(1, 1)
  private decalMat = new THREE.MeshBasicMaterial({ map: holeTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
  private puffs: Puff[] = []
  private smokeMat = new THREE.SpriteMaterial({ map: smokeTex(), color: '#cfc9bd', transparent: true, depthWrite: false })
  private sparkMat = new THREE.SpriteMaterial({ map: flashTex(), color: '#ffcf8a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
  private burstMat = new THREE.SpriteMaterial({ map: flashTex(), color: '#ff9a4a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
  private goreMat = new THREE.SpriteMaterial({ map: smokeTex(), color: '#7a2a1c', transparent: true, depthWrite: false })
  burstK = 0
  readonly burstAt = new THREE.Vector3()
  private scene: THREE.Scene
  constructor(scene: THREE.Scene) { this.scene = scene }

  muzzleSmoke(at: THREE.Vector3, dir: THREE.Vector3, heavy = 1) {
    for (let i = 0; i < 5 * heavy; i++) {
      const v = dir.clone().multiplyScalar(0.6 + Math.random() * 1.6).add(new THREE.Vector3((Math.random() - .5) * .3, .12 + Math.random() * .25, (Math.random() - .5) * .3))
      this.puff(this.smokeMat, at.clone().addScaledVector(dir, 0.05 + i * 0.06), v, 1.8 + Math.random() * 1.6, 0.12, 0.9 + Math.random() * .6, 0.55)
    }
  }
  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, ent: boolean, big: boolean) {
    const p = new THREE.Vector3(x, z, y), n = new THREE.Vector3(nx, nz, ny).normalize()
    if (!ent) {
      const d = new THREE.Mesh(this.decalGeo, this.decalMat)
      d.position.copy(p).addScaledVector(n, 0.004)
      d.lookAt(p.clone().add(n))
      d.rotateZ(Math.random() * 6.28)
      d.scale.setScalar(big ? 0.032 : 0.016 + Math.random() * 0.008)
      this.scene.add(d); this.decals.push(d)
      while (this.decals.length > 90) this.decals.shift()!.removeFromParent()
      this.puff(this.sparkMat, p.clone().addScaledVector(n, 0.02), n.clone().multiplyScalar(0.4), 0.07, 0.04, 0, 1)
      this.puff(this.smokeMat, p.clone().addScaledVector(n, 0.03), n.clone().multiplyScalar(0.35).add(new THREE.Vector3(0, .05, 0)), 0.9, 0.05, 0.35, 0.5)
    } else {
      this.puff(this.goreMat, p, n.clone().multiplyScalar(0.5), 0.5, 0.06, 0.3, 0.6)
    }
  }
  burst(x: number, y: number, z: number) {
    const p = new THREE.Vector3(x, z, y)
    this.burstAt.copy(p); this.burstK = 1
    this.puff(this.burstMat, p, new THREE.Vector3(), 0.16, 0.35, 1.2, 1)
    for (let i = 0; i < 6; i++) this.puff(this.goreMat, p, new THREE.Vector3((Math.random() - .5) * 2.4, Math.random() * 1.8, (Math.random() - .5) * 2.4), 0.9 + Math.random() * .5, 0.12, 0.6, 0.75)
    for (let i = 0; i < 4; i++) this.puff(this.smokeMat, p, new THREE.Vector3((Math.random() - .5) * .8, .4 + Math.random() * .4, (Math.random() - .5) * .8), 2.4, 0.25, 0.9, 0.5)
  }
  private puff(mat: THREE.SpriteMaterial, at: THREE.Vector3, v: THREE.Vector3, life: number, size: number, grow: number, a0: number) {
    const s = new THREE.Sprite(mat.clone()); s.position.copy(at); s.scale.setScalar(size); s.material.rotation = Math.random() * 6.28
    s.renderOrder = 3
    this.scene.add(s); this.puffs.push({ s, v, t: 0, life, grow, a0 })
    while (this.puffs.length > 70) { const p = this.puffs.shift()!; p.s.removeFromParent(); p.s.material.dispose() }
  }
  update(dt: number) {
    this.burstK = Math.max(0, this.burstK - dt / 0.12)
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]
      p.t += dt
      const k = p.t / p.life
      if (k >= 1) { p.s.removeFromParent(); p.s.material.dispose(); this.puffs.splice(i, 1); continue }
      p.v.multiplyScalar(Math.max(0, 1 - dt * 2.2)); p.v.y += dt * 0.06
      p.s.position.addScaledVector(p.v, dt)
      p.s.scale.addScalar(p.grow * dt)
      p.s.material.opacity = p.a0 * (1 - k) * (k < 0.08 ? k / 0.08 : 1)
    }
  }
  shiftWorld(dx: number, dz: number) {
    for (const d of this.decals) { d.position.x += dx; d.position.z += dz }
    for (const p of this.puffs) { p.s.position.x += dx; p.s.position.z += dz }
    this.burstAt.x += dx; this.burstAt.z += dz
  }
  clear() {
    for (const d of this.decals) d.removeFromParent()
    for (const p of this.puffs) { p.s.removeFromParent(); p.s.material.dispose() }
    this.decals = []; this.puffs = []; this.burstK = 0
  }
  dispose() { this.clear(); this.decalGeo.dispose(); for (const m of [this.decalMat, this.smokeMat, this.sparkMat, this.burstMat, this.goreMat]) m.dispose() }
}
