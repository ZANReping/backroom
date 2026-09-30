import type { FloorBand, Structure } from '../core/types'

type Bounds = { x0: number; y0: number; x1: number; y1: number }
const OPENABLE = new Set(['hoteldoor', 'rollerdoor', 'glassdoor', 'bargate'])

/** Snapshot only for one synchronous generation flood. Rebuild after any map
 * edit: door orientation and analytic colliders can depend on nearby tiles.
 * Samples are integer grid coordinates, matching the generation BFS exactly.
 */
export function generationObstacles(
  width: number, height: number, structures: readonly Structure[], band: FloorBand,
  colliders: (structure: Structure) => readonly Bounds[],
): Uint8Array {
  const blocked = new Uint8Array(width * height)
  for (const structure of structures) {
    if (!structure.solid || (structure.floor ?? 0) !== band) continue
    for (const box of colliders(structure)) {
      // Collision boxes include BOTH end points in solidStructAtFloor.
      const x0 = Math.max(0, Math.ceil(box.x0)), x1 = Math.min(width - 1, Math.floor(box.x1))
      const y0 = Math.max(0, Math.ceil(box.y0)), y1 = Math.min(height - 1, Math.floor(box.y1))
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * width + x] = 1
    }
  }
  for (const structure of structures) {
    if (!structure.solid || (structure.floor ?? 0) !== band || !OPENABLE.has(structure.kind)) continue
    // Openable footprints have EXCLUSIVE upper bounds, unlike collider boxes.
    // The old predicate allows a door even when another solid overlaps it.
    const x0 = Math.max(0, Math.ceil(structure.x)), x1 = Math.min(width - 1, Math.ceil(structure.x + structure.w) - 1)
    const y0 = Math.max(0, Math.ceil(structure.y)), y1 = Math.min(height - 1, Math.ceil(structure.y + structure.h) - 1)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * width + x] = 0
  }
  return blocked
}
