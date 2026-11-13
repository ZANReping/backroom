import { inPolygon, type Polygon } from './l11Geometry'

export type SightRect = { x: number; y: number; w: number; h: number; polygon?: Polygon }
export type SightField = { w: number; h: number; walls: Uint8Array | null; bins: Map<number, SightRect[]> }
export type SightQuery = { ox: number; oy: number; offsetX: number; offsetY: number; yaw: number; range: number; fov: number; near: number }
export type MapSight = { points: { x: number; y: number }[]; cells: number[]; range: number }

function polygonRay(polygon: Polygon, x: number, y: number, dx: number, dy: number) {
  if (inPolygon(x, y, polygon)) return 0
  let best = Infinity
  for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-9) continue
    const ax = a[0] - x, ay = a[1] - y, t = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den
    if (t >= 0 && u >= 0 && u <= 1) best = Math.min(best, t)
  }
  return best
}

/** The same deterministic, occluded fan for synchronous maps and Worker exploration.
 * This module owns no Engine, DOM, live entities or exploration/save state. */
export function traceMapSight(field: SightField, q: SightQuery): MapSight {
  const { w, h, walls, bins } = field
  const { ox, oy, offsetX, offsetY, yaw, range, fov, near } = q
  const cells = new Set<number>(), points: MapSight['points'] = []
  const ray = (angle: number, reach: number) => {
    const dx = -Math.sin(angle), dy = -Math.cos(angle), sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1
    let x = Math.floor(ox), y = Math.floor(oy), t = 0
    let tx = Math.abs(dx) < 1e-8 ? Infinity : ((dx < 0 ? x : x + 1) - ox) / dx
    let ty = Math.abs(dy) < 1e-8 ? Infinity : ((dy < 0 ? y : y + 1) - oy) / dy
    while (t <= reach && x >= 0 && y >= 0 && x < w && y < h) {
      const i = y * w + x
      cells.add(i)
      if (walls?.[i]) return Math.min(t, reach)
      let hit = Infinity
      for (const b of bins.get(i) ?? []) {
        let lo = 0, hi = reach
        if (Math.abs(dx) < 1e-8) { if (ox < b.x || ox > b.x + b.w) continue }
        else { const a = (b.x - ox) / dx, c = (b.x + b.w - ox) / dx; lo = Math.max(lo, Math.min(a, c)); hi = Math.min(hi, Math.max(a, c)) }
        if (Math.abs(dy) < 1e-8) { if (oy < b.y || oy > b.y + b.h) continue }
        else { const a = (b.y - oy) / dy, c = (b.y + b.h - oy) / dy; lo = Math.max(lo, Math.min(a, c)); hi = Math.min(hi, Math.max(a, c)) }
        if (lo <= hi && hi > .001) {
          if (b.polygon) lo = polygonRay(b.polygon, ox, oy, dx, dy)
          if (lo <= hi && lo <= Math.min(tx, ty) + .0001) hit = Math.min(hit, lo)
        }
      }
      if (hit < Infinity) return Math.min(hit, reach)
      if (Math.abs(tx - ty) < 1e-7) { t = tx; x += sx; y += sy; tx += 1 / Math.abs(dx); ty += 1 / Math.abs(dy) }
      else if (tx < ty) { t = tx; x += sx; tx += 1 / Math.abs(dx) }
      else { t = ty; y += sy; ty += 1 / Math.abs(dy) }
    }
    return Math.min(t, reach)
  }
  const count = Math.max(24, Math.ceil(range * fov * 2.5))
  for (let i = 0; i <= count; i++) {
    const angle = yaw - fov / 2 + fov * i / count, distance = ray(angle, range)
    points.push({ x: offsetX - Math.sin(angle) * distance, y: offsetY - Math.cos(angle) * distance })
  }
  for (let i = 0; i < 32; i++) ray(i * Math.PI / 16, near)
  return { points, cells: [...cells], range }
}
