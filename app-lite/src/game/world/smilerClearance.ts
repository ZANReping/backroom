import { bandOfZ, ceilingHeightAt, type GameMap } from './mapgen'

// Fixed, bounded footprint queries. Includes the forward upper body before it enters a lower roof.
const OFFSETS = [[-.35, 0], [0, -.4], [0, .4], [.65, -.4], [.65, 0], [.65, .4], [1.3, -.3], [1.3, 0], [1.3, .3]] as const
export function smilerHeadroom(m: GameMap, x: number, y: number, z: number, facing: number, wallH: number) {
  const c = Math.cos(facing), s = Math.sin(facing), band = bandOfZ(z)
  let roof = ceilingHeightAt(m, x, y, wallH, band)
  for (const [f, side] of OFFSETS) {
    const px = x + c * f - s * side, py = y + s * f + c * side
    const tx = Math.floor(px), ty = Math.floor(py)
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] !== 1) continue
    roof = Math.min(roof, ceilingHeightAt(m, px, py, wallH, band))
  }
  return roof - z
}
