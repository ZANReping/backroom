import type { Point } from './l11Geometry'
export const L11_ECOLOGY_VERSION=1

/** Stable world coordinates survive infinite-window rebasing and Worker transfer. */
export interface L11FacelingHome {
  id: string
  role: 'pedestrian' | 'shopkeeper' | 'office'
  seed: number
  position: Point
  facing: number
  floor: 0 | 1 | 2
  buildingId?: string
  roomId?: string
  fixtureId?: string
  /** A few clear, connected places in the assigned room, including the post. */
  stops?: Point[]
}
