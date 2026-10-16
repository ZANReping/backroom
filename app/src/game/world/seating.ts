import type { FloorBand, Structure } from '../core/types'
import { furnitureSeats, type FurnitureSeat } from '../content/furnitureSeats'
import { floorHeight, type GameMap } from './mapgen'

export interface SeatAnchor {
  x: number
  y: number
  z: number // seat surface, absolute elevation
  yaw: number
  index: number
  label: string
  relaxed: boolean
  floor: FloorBand
}
interface ModelSeat extends FurnitureSeat { index: number }
// Offsets from the logical structure centre survive infinite-window rebasing.
const modeledSeats = new WeakMap<Structure, ModelSeat[]>()
export function setModelSeats(s: Structure, seats: ModelSeat[]) { modeledSeats.set(s, seats) }

export function seatsFor(s: Structure, m: GameMap, level: number): SeatAnchor[] {
  if (s.data?.fallen || s.data?.hidden || s.data?.noSit) return []
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2
  const floor = s.floor ?? 0, base = floorHeight(m, cx, cy, floor)
  const cached = modeledSeats.get(s)
  if (cached) return cached.map(p => ({ x: cx + p.x, y: cy + p.z, z: base + p.y, yaw: p.yaw, index: p.index, label: p.label, relaxed: !!p.relaxed, floor }))
  const a = Number(s.data?.deg ?? 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a)
  return furnitureSeats(s, level).map((p, index) => ({
    x: cx + c * p.x + sn * p.z, y: cy - sn * p.x + c * p.z,
    z: base + p.y * (s.data?.l0Furniture ? 1.17 : 1) + Number(s.data?.z ?? 0) + Number(s.data?.mount ?? 0),
    yaw: a + p.yaw, index, label: p.label, relaxed: !!p.relaxed, floor,
  }))
}
