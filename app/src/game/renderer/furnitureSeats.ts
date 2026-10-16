import * as THREE from 'three'
import type { Structure } from '../core/types'
import { furnitureSeats } from '../content/furnitureSeats'
import { setModelSeats } from '../world/seating'

/** Capture the actual built model transform, including wall flush, scale and nested chair rotation. */
export function syncFurnitureSeats(s: Structure, root: THREE.Object3D, ground: number, level: number) {
  if (s.kind.startsWith('alpha_')) return // Alpha's instanced parts already use world coordinates.
  const defs = furnitureSeats(s, level)
  if (!defs.length) return
  const owner = s.kind === 'table' && s.data?.chair && !s.data?.l0Furniture ? root.children.find(o => o.type === 'Group') ?? root : root
  root.updateWorldMatrix(true, true)
  setModelSeats(s, defs.map((seat, index) => {
    const p = owner.localToWorld(new THREE.Vector3(seat.x, seat.y, seat.z))
    const dir = new THREE.Vector3(Math.sin(seat.yaw), 0, Math.cos(seat.yaw)).transformDirection(owner.matrixWorld)
    return { ...seat, index, x: p.x - s.x - s.w / 2, y: p.y - ground, z: p.z - s.y - s.h / 2, yaw: Math.atan2(dir.x, dir.z) }
  }))
}
