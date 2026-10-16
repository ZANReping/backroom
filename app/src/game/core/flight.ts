import { bandOfPlayerZ, caveVolumeFieldAt, ceilingHeightAt, floorHeight, FLOOR_H, l11MapSpace, structBlocksCircle, UNDER_CEIL, UNDER_FLOOR, type GameMap } from '../world/mapgen'
import type { FloorBand } from './types'
import { FIXED_STEP, PLAYER_RADIUS, type MoveIntegrator } from './player'

// Standing eye is 1.55 m; reserve head/near-plane space so hovering below a
// ceiling cannot reveal its back face through camera bob or the near plane.
export const FLIGHT_BODY_HEIGHT = 1.7
type FlightPosition = { x: number; y: number; z: number }
const overlaps = (z: number, lo: number, hi: number) => z + FLIGHT_BODY_HEIGHT > lo + .0001 && z < hi - .0001

/** Flight must not reuse grounded canOccupy: missing upper floors are air, not walls. */
export function canFlyOccupy(m: GameMap, x: number, y: number, z: number, wallH: number): boolean {
  const r = PLAYER_RADIUS
  if (!Number.isFinite(x + y + z) || x-r < 0 || y-r < 0 || x+r >= m.w || y+r >= m.h) return false
  const band = bandOfPlayerZ(m,z,x,y)
  if (structBlocksCircle(m,x,y,r,z,band,FLIGHT_BODY_HEIGHT,wallH)) return false
  // Circle/tile intersections include very small edge contacts without square-corner overreach.
  for (let ty = Math.floor(y-r); ty <= Math.floor(y+r); ty++) for (let tx = Math.floor(x-r); tx <= Math.floor(x+r); tx++) {
    const sx = Math.max(tx+.00001,Math.min(tx+.99999,x)), sy = Math.max(ty+.00001,Math.min(ty+.99999,y))
    if ((sx-x)**2+(sy-y)**2 > r*r) continue
    const i = ty*m.w+tx
    const city = l11MapSpace(m,sx,sy,band,z)
    if (city) {
      if (z < city.height-.0001 || !city.walkable && z <= city.height+.1) return false
      continue // Building walls, slabs, stairs and bridges were tested as real volumes above.
    }
    if (m.caveVolumeId !== undefined) continue // Continuous cave shell is sampled below.
    const underground = m.hasUnderground && z < UNDER_CEIL
    if (underground) {
      if (m.dn[i] !== 1 || m.dnWall[i] === 1 || z < UNDER_FLOOR || z+FLIGHT_BODY_HEIGHT > UNDER_CEIL) return false
      continue
    }
    const ground = floorHeight(m,sx,sy,0)
    if (z < ground-.0001) return false
    if (m.tiles[i] !== 1 && overlaps(z,ground,Math.max(wallH,ground+wallH))) return false
    const stair = (m.stair[i]&7) !== 0
    for (const f of [1,2] as const) {
      const floor = f === 1 ? m.up : m.up2, walls = f === 1 ? m.upWall : m.upWall2
      if (!stair && floor[i] === 1 && overlaps(z,f*FLOOR_H-.35,f*FLOOR_H)) return false
      if (walls[i] === 1 && overlaps(z,f*FLOOR_H,ceilingHeightAt(m,sx,sy,wallH,f))) return false
    }
    const support: FloorBand = m.up2[i] === 1 && z >= 2*FLOOR_H-.0001 ? 2 : m.up[i] === 1 && z >= FLOOR_H-.0001 ? 1 : 0
    if (z+FLIGHT_BODY_HEIGHT > ceilingHeightAt(m,sx,sy,wallH,support)+.0001) return false
  }
  // Sample curved terrain / cave rock at the body's actual height, including the circle edge.
  for (let a = -1; a < 8; a++) {
    const sx = x+(a<0?0:Math.cos(a*Math.PI/4)*r), sy = y+(a<0?0:Math.sin(a*Math.PI/4)*r)
    if (m.caveVolumeId !== undefined) {
      for (const h of [.04,.78,FLIGHT_BODY_HEIGHT]) if (caveVolumeFieldAt(m,sx,z+h,sy) <= .025) return false
    } else if (m.terrain || m.organicCave || m.l7SeaTerrain || m.l10LakeTerrain) {
      if (!m.hasUnderground && z < floorHeight(m,sx,sy,0)-.0001) return false
    }
  }
  return true
}

/** Fixed substeps and independent axes keep thin walls solid and allow sliding. */
export function integrateFlight(m: GameMap, p: FlightPosition, dx: number, dy: number, dz: number, speed: number, dt: number, it: MoveIntegrator, wallH: number, noclip = false) {
  it.acc = Math.min(it.acc+Math.max(0,dt),FIXED_STEP*16)
  while (it.acc >= FIXED_STEP-1e-9) {
    it.acc = Math.max(0,it.acc-FIXED_STEP)
    for (const [axis,delta] of [['x',dx],['y',dy],['z',dz]] as const) {
      if (!delta) continue
      const step = delta*speed*FIXED_STEP, target = p[axis]+step
      if (noclip || canFlyOccupy(m,axis==='x'?target:p.x,axis==='y'?target:p.y,axis==='z'?target:p.z,wallH)) p[axis] = target
    }
  }
}
