import * as THREE from 'three'
import { HOME_STAIR_DOOR } from '../world/foyerStreetLayout'
import * as TX from './foyerStreetTextures'
import { Ctx, type Batch, type Mats } from './foyerHome'

/** Static stairwell fire door visible from the foyer side of the east wall. */
export function buildFoyerStairDoor(batch: Batch, root: THREE.Object3D, mats: Mats) {
  const D = HOME_STAIR_DOOR
  const c = new Ctx(batch, root, new THREE.Matrix4().compose(
    new THREE.Vector3(D.x - 0.01, 0, D.y),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 270 * Math.PI / 180, 0, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  ), mats)
  const steel = mats.lit('foyer-home-fire-door', { color: '#6f7a72', roughness: 0.55, metalness: 0.4 })
  steel.name = 'foyer-home-fire-door'
  c.box(mats.lit('foyer-home-fire-frame', { color: '#3f4542', roughness: 0.5 }), D.w + 0.14, 2.17, 0.06, 0, 0, 0)
  c.box(steel, D.w, 2.08, 0.05, 0, 0.02, 0.035)
  c.box(mats.lit('foyer-home-fire-pushbar', { color: '#bfc4c1', roughness: 0.25, metalness: 0.8 }), 0.6, 0.04, 0.06, 0, 1.0, 0.07)
  c.plane(mats.basic('foyer-home-exit-sign', { map: TX.exitSignTex() }), 0.42, 0.16, 0, 2.32, 0.03)
  c.plane(mats.lit('foyer-home-door-label', { map: TX.labelTex('STAIRS · 3F', '#f0f0f0', '#3f4542', 512, 96, 'bold 50px Arial'), roughness: 0.7 }), 0.4, 0.075, 0, 1.75, 0.063)
}
