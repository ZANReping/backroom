import assert from 'node:assert/strict'
import * as THREE from 'three'
import { DEFAULT_AVATAR } from '../src/game/core/avatar'
import { buildAvatarModel } from '../src/game/renderer/retroAvatar'
import { applySeatedPose, seatedFirstPersonGeometry } from '../src/game/renderer/seatedPlayer'
import { furnitureSeats } from '../src/game/content/furnitureSeats'
import type { Structure } from '../src/game/core/types'

let checks = 0
const check = (condition: unknown, text: string) => { assert(condition, text); checks++ }
const configs = [DEFAULT_AVATAR, { ...DEFAULT_AVATAR, gender: 1 as const, pantsStyle: 1 }, { ...DEFAULT_AVATAR, topStyle: 7, pantsStyle: 5, shoes: 2 }]
for (const cfg of configs) {
  const model = buildAvatarModel(cfg), rig = model.userData.retro, mesh = rig.mesh as THREE.SkinnedMesh
  for (const height of [.3075, .43, .475, .52, .58, .89]) for (const blend of [0, .25, .5, .75, 1]) {
    applySeatedPose(model, { blend, seatHeight: height, relaxed: false, time: 1.1 })
    check(Array.from(mesh.skeleton.boneMatrices).every(Number.isFinite), 'finite skeletal pose')
    if (blend === 1) {
      check(Math.abs(rig.bones.thighL.rotation.x) > .9 && rig.bones.shinL.rotation.x > .8, 'sitting bends both hips and knees')
    }
    for (const side of ['L', 'R']) {
      const foot = rig.bones[`foot${side}`].getWorldPosition(new THREE.Vector3())
      const target = .085 + (Math.max(.085, height - .50) - .085) * blend
      check(Math.abs(foot.y - target) < .055, `feet stay supported throughout sit/stand: ${height}, blend ${blend}, foot ${foot.y}`)
    }
  }
  const lower = seatedFirstPersonGeometry(mesh.geometry)
  check(!!lower.index && lower.index.count > 300 && lower.index.count < mesh.geometry.getAttribute('position').count, 'first-person keeps a proper subset of visible body')
  check(lower.groups.every(g => g.count % 3 === 0 && g.start + g.count <= lower.index!.count), 'valid first-person draw groups')
  check(Array.from(lower.index!.array).every(i => Number.isFinite(i) && i >= 0 && i < lower.getAttribute('position').count), 'valid first-person indices')
  let disposed = 0; lower.addEventListener('dispose', () => disposed++); lower.dispose(); rig.dispose()
  check(disposed === 1, 'first-person geometry disposed once')
}
const s = (kind: string, data = {}): Structure => ({ kind: kind as Structure['kind'], x: 0, y: 0, w: 1, h: 1, solid: true, data })
check(furnitureSeats(s('table'), 0).length === 0, 'tables are not seats')
check(furnitureSeats(s('table', { chair: 1 }), 0).length === 1, 'legacy chair metadata is recognized')
check(furnitureSeats(s('table', { chair: 1, fallen: 1 }), 0).length === 0, 'fallen chairs are excluded')
check(furnitureSeats(s('labbench'), 0).length === 0, 'lab workbench is not a stool')
check(furnitureSeats(s('officechair'), 4)[0].yaw === Math.PI, 'L4 replacement faces opposite the legacy office chair')
const barberSeat = furnitureSeats(s('barberchair'), 1)[0]
check(barberSeat.y === .5125, 'barber chair seat surface is 0.5125m high')
check(barberSeat.x === 0 && barberSeat.z === .02 && barberSeat.yaw === 0, 'barber chair seat is centered, slightly forward on +Z, and faces the model front')
check(furnitureSeats(s('sofa'), 5).length === 3 && furnitureSeats(s('sofa'), 108).length === 2, 'sofa cushions retain distinct seat positions')
check(furnitureSeats(s('settlementprop', { height: 1 }), 103).length === 0, 'generic props need explicit seat metadata')
check(furnitureSeats(s('settlementprop', { seatHeight: .58, seatCount: 3 }), 103).length === 3, 'batched settlement furniture has explicit cushions')
console.log(`Seating: ${checks} checks passed (3 avatar configurations, 6 seat heights, 5 animation stages).`)
