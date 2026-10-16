import * as THREE from 'three'
import type { Engine } from '../engine'
import { getAvatar } from '../core/avatar'
import { buildAvatarModel } from './retroAvatar'
import type { RetroNpc } from './retroNpc'
import { look } from './shared'

export interface SeatedPose {
  blend: number
  seatHeight: number
  relaxed: boolean
  time: number
  turn?: number
  pitch?: number
  transition?: number
}

/** Keep torso/legs for the local view; bone scaling would stretch weighted sleeve vertices. */
export function seatedFirstPersonGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const result = source.clone(), skin = source.getAttribute('skinIndex'), weight = source.getAttribute('skinWeight')
  const indices: number[] = [], index = source.index
  result.clearGroups()
  for (const group of source.groups) {
    const start = indices.length
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const triangle = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k)
      const visibleBody = triangle.every(v => {
        let upper = 0
        for (let k = 0; k < 4; k++) if (skin.array[v * 4 + k] >= 3 && skin.array[v * 4 + k] < 13) upper += weight.array[v * 4 + k]
        return upper < .001 // Even a small sleeve influence creates pointed seams next to the local camera.
      })
      if (visibleBody) indices.push(...triangle)
    }
    if (indices.length > start) result.addGroup(start, indices.length - start, group.materialIndex)
  }
  result.setIndex(indices)
  return result
}

/** Bend hips/knees with a two-link leg solve, keeping shoes on the floor at different cushion heights. */
export function applySeatedPose(model: THREE.Group, pose: SeatedPose) {
  const rig = model.userData.retro as RetroNpc, b = rig.bones
  rig.update(pose.time)
  const k = Math.max(0, Math.min(1, pose.blend)), scale = rig.group.scale.y
  for (const bone of Object.values(b)) {
    bone.rotation.set(0, 0, 0); bone.scale.set(1, 1, 1)
    bone.position.copy(bone.userData.bind as THREE.Vector3)
  }
  const transition = Math.max(0, pose.transition ?? 0)
  const hipHeight = pose.seatHeight + .10
  b.hips.position.y += (hipHeight / scale - b.hips.position.y) * k
  // Tall bar stools need naturally hanging feet rather than almost straight legs.
  const hip = (b.hips.position.y - .05) * scale
  const foot = .085 * scale + (Math.max(.085 * scale, pose.seatHeight - .50) - .085 * scale) * k
  const forward = .01 + (Math.max(.36, Math.min(.58, .46 + (.48 - pose.seatHeight) * .6)) - .01) * k
  const upper = .4 * scale, lower = .415 * scale
  const down = hip - foot, distance = Math.min(upper + lower - .005, Math.hypot(down, forward))
  const clamp = (v: number) => Math.max(-1, Math.min(1, v))
  const thigh = -(Math.atan2(forward, down) + Math.acos(clamp((upper * upper + distance * distance - lower * lower) / (2 * upper * distance))))
  const knee = Math.PI - Math.acos(clamp((upper * upper + lower * lower - distance * distance) / (2 * upper * lower)))
  for (const side of ['L', 'R'] as const) {
    b[`thigh${side}`].rotation.x = thigh
    b[`shin${side}`].rotation.x = knee
    b[`foot${side}`].rotation.x = -(thigh + knee)
    b[`thigh${side}`].rotation.z = (side === 'L' ? .035 : -.035) * k
    b[`upperArm${side}`].rotation.x = -.30 * k - transition * .12
    b[`upperArm${side}`].rotation.z = (side === 'L' ? .075 : -.075) * k
    b[`foreArm${side}`].rotation.x = -.78 * k
    b[`hand${side}`].rotation.x = .20 * k
  }
  b.spine.rotation.x = (pose.relaxed ? -.055 : .035) * k + transition * .16
  b.chest.scale.z = 1 + Math.sin(pose.time * 1.65) * .007 * k
  b.head.rotation.y = Math.max(-1.15, Math.min(1.15, pose.turn ?? 0))
  b.head.rotation.x = -(pose.pitch ?? 0) * .5
  model.updateMatrixWorld(true)
  rig.mesh.skeleton.update()
}

/** One cached local avatar. World-space thighs/torso complement the existing first-person hands. */
export class SeatedPlayer {
  readonly root = new THREE.Group()
  model: THREE.Group | null = null
  private signature = ''
  private fullGeometry: THREE.BufferGeometry | null = null
  private firstPersonGeometry: THREE.BufferGeometry | null = null
  // External cameras / verifiers may show the complete production rig, without constructing another model.
  firstPerson = true

  constructor() { this.root.name = 'Local seated player'; this.root.visible = false }

  update(eng: Engine, time: number) {
    const state = eng.seating
    this.root.visible = !!state && !eng.over && !eng.handsHidden
    if (!state && eng.interactTarget?.kind !== 'sit') return
    const p = eng.player, cfg = getAvatar()
    const ev = { gloves: p.hasGloves, suit: p.hasSuit, cavingsuit: p.equip.body?.type === 'cavingsuit', divemask: p.equip.head?.type === 'divemask', headlamp: p.equip.head?.type === 'headlamp', nightvision: p.equip.head?.type === 'nightvision' }
    const signature = JSON.stringify([cfg, ev])
    if (!this.model || this.signature !== signature) {
      this.clearModel()
      this.model = buildAvatarModel(cfg, { ev, driven: true })
      this.model.name = 'Seated player avatar'
      this.root.add(this.model); this.signature = signature
      const mesh = (this.model.userData.retro as RetroNpc).mesh
      this.fullGeometry = mesh.geometry
      this.firstPersonGeometry = seatedFirstPersonGeometry(mesh.geometry)
      mesh.castShadow = true; mesh.receiveShadow = true
    }
    if (!state) return
    this.root.position.set(p.x, p.z, p.y)
    this.root.rotation.y = state.anchor.yaw
    applySeatedPose(this.model, {
      blend: state.blend, seatHeight: state.anchor.z - p.z, relaxed: state.anchor.relaxed, time,
      turn: Math.atan2(Math.sin(look.yaw - state.anchor.yaw - Math.PI), Math.cos(look.yaw - state.anchor.yaw - Math.PI)), pitch: look.pitch,
      transition: state.phase === 'seated' ? 0 : Math.sin(Math.PI * Math.min(1, state.t / state.duration)),
    })
    const rig = this.model.userData.retro as RetroNpc
    rig.mesh.geometry = (this.firstPerson ? this.firstPersonGeometry : this.fullGeometry)!
  }

  private clearModel() {
    if (!this.model) return
    ;(this.model.userData.retro as RetroNpc).dispose() // Shared atlas textures deliberately remain alive.
    this.firstPersonGeometry?.dispose(); this.firstPersonGeometry = null; this.fullGeometry = null
    this.model.removeFromParent(); this.model = null
  }
  dispose() { this.clearModel(); this.root.removeFromParent(); this.signature = '' }
}
