import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { DEFAULT_AVATAR } from '../src/game/core/avatar'
import { buildAvatarModel, buildRetroNamedNpc } from '../src/game/renderer/retroAvatar'
import { humanoidMotion, type HumanoidFrame } from '../src/game/renderer/humanoidMotion'
import { humanoidAttackPhase, HUMANOID_WINDUP, HUMANOID_RECOVERY } from '../src/game/core/humanoidMelee'
import { disposeCharacterModel } from '../src/game/renderer/retroResources'
import { buildCharacterModel } from '../src/game/renderer/characterModel'
import { brcWorkerDef, npcAvatar } from '../src/game/content/npcs'
import { batchNpcParts } from '../src/game/renderer/npcBatches'

let checks = 0
const ok = (v: unknown, label: string) => { assert(v, label); checks++ }
const results: object[] = []
function subject(gender = 0, scale = 1, named?: string) {
  const root = new THREE.Group(), model = named ? buildRetroNamedNpc(named)! : buildAvatarModel({ ...DEFAULT_AVATAR, gender }, { faceless: true, seed: 37 })
  model.rotation.y = Math.PI / 2; root.add(model); root.scale.setScalar(scale)
  const motion = humanoidMotion(root)!, rig = motion.rig, s = scale * rig.group.scale.y
  function frame(f: HumanoidFrame) {
    root.position.set(f.x, f.z, f.y); root.rotation.y = -f.facing
    motion.update({ ...f, scale }); root.updateMatrixWorld(true); rig.mesh.skeleton.update()
    ok(Array.from(rig.mesh.skeleton.boneMatrices).every(Number.isFinite), 'finite skinned pose')
    return [rig.bones.footL, rig.bones.footR].map(b => b.getWorldPosition(new THREE.Vector3()))
  }
  return { root, motion, rig, s, frame }
}

for (const hz of [30, 60, 144]) for (const speed of [.48, .7, .88, 1.7, 2.3, 3.6]) {
  const q = subject(speed < 1 ? 1 : 0), previous = [new THREE.Vector3(), new THREE.Vector3()]
  let maxSlip = 0, maxLift = 0, minSole = Infinity, samples = 0
  for (let i = 0; i <= hz * 8; i++) {
    const t = i / hz, oldPhase = q.motion.feet.map(f => f.phase), oldSwing = q.motion.feet.map(f => f.swing)
    const feet = q.frame({ time: t, x: speed * t, y: 0, z: 0, facing: 0 })
    for (let j = 0; j < 2; j++) {
      const f = q.motion.feet[j], sole = feet[j].y - .085 * q.s
      minSole = Math.min(minSole, sole); maxLift = Math.max(maxLift, sole)
      if (i > 1 && !oldSwing[j] && !f.swing && f.phase >= oldPhase[j]) {
        maxSlip = Math.max(maxSlip, feet[j].distanceTo(previous[j])); samples++
      }
      previous[j].copy(feet[j])
    }
  }
  ok(maxSlip < .003, `stance slip ${speed}m/s @${hz}Hz: ${maxSlip}`)
  ok(minSole > -.012 && maxLift > .04, `ground contact and toe clearance: ${minSole}/${maxLift}`)
  ok(Math.abs(q.motion.distance - speed * 8) < .00001, 'cycles integrate actual distance')
  const phase = q.motion.phase, walkingStride = q.motion.stride
  for (let i = 1; i <= hz; i++) q.frame({ time: 8 + i / hz, x: speed * 8, y: 0, z: 0, facing: 0 })
  ok(q.motion.phase === phase, 'blocked/idle does not continue cycling')
  ok(q.motion.feet.every(f => f.lift === 0), 'raised foot settles after stopping')
  results.push({ hz, speed, maxStanceSlipM: maxSlip, minSole, maxLift, samples, stride: walkingStride })
  disposeCharacterModel(q.root)
}
// Accelerating, braking and starting again must keep the supporting foot planted.
{
  const q = subject(), prior = [new THREE.Vector3(), new THREE.Vector3()]
  let x = 0, maxSlip = 0
  for (let i = 0; i < 720; i++) {
    const speed = [0, .48, 3.6, 1.7, 0, .88][Math.floor(i / 120)]
    x += speed / 60
    const prev = q.motion.feet.map(f => ({ phase: f.phase, swing: f.swing, lift: f.lift }))
    const points = q.frame({ time: i / 60, x, y: 0, z: 0, facing: 0 })
    for (let j = 0; j < 2; j++) {
      const f = q.motion.feet[j]
      if (i > 1 && speed > 0 && !prev[j].swing && !f.swing && !prev[j].lift && !f.lift && f.phase >= prev[j].phase)
        maxSlip = Math.max(maxSlip, points[j].distanceTo(prior[j]))
      prior[j].copy(points[j])
    }
  }
  ok(maxSlip < .003, 'acceleration and restart stance slip: ' + maxSlip)
  results.push({ scenario: 'acceleration / braking / restart', maxStanceSlipM: maxSlip })
  disposeCharacterModel(q.root)
}
for (const scale of [.65, 1, 1.4]) {
  const q = subject(0, scale, 'tom')
  let t = 0
  const f = { time: t, x: 0, y: 0, z: 0, facing: 0 }
  q.frame(f)
  for (let i = 1; i <= 600; i++) { t = i / 60; q.frame({ time: t, x: 3 * Math.sin(t * .3), y: 3 * (1 - Math.cos(t * .3)), z: .08 * t, facing: t * .3 }) }
  const phase = q.motion.phase, resets = q.motion.resets
  // Same absolute position after a window rebase, duplicate screenshot render, and paused clock.
  q.frame({ time: t, x: 3 * Math.sin(t * .3), y: 3 * (1 - Math.cos(t * .3)), z: .08 * t, facing: t * .3 })
  ok(q.motion.phase === phase && q.motion.resets === resets, 'rebase/duplicate frame stable')
  q.frame({ time: t + 1 / 60, x: 10000, y: -10000, z: .8, facing: 0 })
  ok(q.motion.resets === resets + 1 && q.motion.feet.every(f => Math.hypot(f.point.x - 10000, f.point.z + 10000) < scale), 'teleport clears old planted anchors')
  const rest = q.frame({ time: t + 2 / 60, x: 10000, y: -10000, z: .8, facing: 0 })
  for (const tool of [false, true]) {
    const hands: number[] = []
    for (let i = 0; i <= 60; i++) {
      q.frame({ time: t + .1 + i / 60, x: 10000, y: -10000, z: .8, facing: 0, attack: i / 60, tool })
      const hand = q.rig.bones.handL.getWorldPosition(new THREE.Vector3())
      hands.push(hand.x - 10000)
      ok(q.rig.bones.footL.getWorldPosition(new THREE.Vector3()).distanceTo(rest[0]) < .003, 'attack maintains foot support')
    }
    ok(hands[39] > hands[25] + .1 * scale, `strike reaches forward at contact: scale=${scale} tool=${tool} wind=${hands[25]} hit=${hands[39]}`)
    ok(Math.abs(hands[60] - hands[0]) < .015 * scale, 'recovery returns continuously')
  }
  disposeCharacterModel(q.root)
}
for (const workLoop of ['hammer', 'saw', 'paint', 'mop'] as const) {
  const def = { ...brcWorkerDef(37, 0, 0, 0), workLoop }
  const model = buildCharacterModel(npcAvatar(def), {npcId:def.id,npcDef:def,driven:true})
  const movement = humanoidMotion(model)!, b = movement.rig.bones
  const gear=movement.rig.group.children.find(c=>c.userData.npcGear) as THREE.SkinnedMesh
  let offset=0,toolStart=0,toolCount=0
  for(const item of model.userData.npcGear.items){if(item.kind==='tool'){toolStart=offset;toolCount=item.triangles*3}offset+=item.triangles*3}
  ok(toolCount>0,workLoop+' has tool geometry')
  const handIndex=gear.skeleton.bones.indexOf(b.handL)
  for(let i=toolStart;i<toolStart+toolCount;i++)ok(gear.geometry.attributes.skinIndex.getX(i)===handIndex&&gear.geometry.attributes.skinWeight.getX(i)===1,workLoop+' bound to wrist')
  batchNpcParts(model, { ...model.userData.parts, ...b })
  for (const side of ['L', 'R'] as const) ok(!b[`upperArm${side}`].children.some(c => c.name === 'npc-rigid-color-batch'), workLoop + ' no tool batch on upper arm')
  const wrapper = new THREE.Group(); wrapper.add(model)
  ok(humanoidMotion(wrapper) === movement, 'wrapper shares one controller per skeleton')
  movement.update({time: 0, x:0, y:0, z:0, facing:0, tool:true, attack:.42})
  wrapper.updateMatrixWorld(true)
  for(let i=toolStart;i<toolStart+toolCount;i+=Math.max(1,Math.floor(toolCount/12))){
    const p=new THREE.Vector3().fromBufferAttribute(gear.geometry.attributes.position,i)
    gear.applyBoneTransform(i,p);ok(p.toArray().every(Number.isFinite),workLoop+' deformed tool pose finite')
  }
  disposeCharacterModel(wrapper)
}
ok(humanoidAttackPhase(HUMANOID_WINDUP, 0) === 0, 'windup starts at zero')
ok(humanoidAttackPhase(0, HUMANOID_RECOVERY) === .65, 'impact shared with simulation')
ok(humanoidAttackPhase(0, 0) === undefined, 'no attack at rest')
mkdirSync('reports/humanoid-motion', { recursive: true })
writeFileSync('reports/humanoid-motion/kinematics.json', JSON.stringify({ checks, results }, null, 2))
console.log(`Humanoid motion: ${checks} checks passed`)
