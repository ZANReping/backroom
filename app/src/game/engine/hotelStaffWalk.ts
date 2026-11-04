import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { canOccupy, type Vec2 } from '../core/player'
import { floorHeight } from '../world/mapgen'

const RADIUS = .34
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
interface Route {
  map: Engine['map']; rev: number; infRev: number; goal: number; retry: number; points: Vec2[]; next: number
}
const routes = new WeakMap<Entity, Route>()

function clear(from: Vec2, to: Vec2, fits: (x: number, y: number) => boolean) {
  const dx = to.x - from.x, dy = to.y - from.y
  const steps = Math.ceil(Math.hypot(dx, dy) / .1)
  for (let i = 1; i <= steps; i++) if (!fits(from.x + dx * i / steps, from.y + dy * i / steps)) return false
  return true
}

function findRoute(w: number, h: number, from: Vec2, goal: Vec2, fits: (x: number, y: number) => boolean) {
  const idx = (x: number, y: number) => Math.floor(y) * w + Math.floor(x)
  const center = (i: number) => ({ x: i % w + .5, y: Math.floor(i / w) + .5 })
  const start = idx(from.x, from.y), target = idx(goal.x, goal.y)
  const queue: number[] = [], parent = new Map<number, number>()
  for (let y = Math.floor(from.y) - 1; y <= Math.floor(from.y) + 1; y++) {
    for (let x = Math.floor(from.x) - 1; x <= Math.floor(from.x) + 1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const i = y * w + x
      if (clear(from, center(i), fits)) { queue.push(i); parent.set(i, -1) }
    }
  }
  let best = -1, distance = Math.hypot(from.x - goal.x, from.y - goal.y) - .1
  for (let read = 0; read < queue.length && read < 1500; read++) {
    const i = queue[read], p = center(i)
    const d = Math.hypot(p.x - goal.x, p.y - goal.y)
    if (i === target) { best = i; break }
    if (d < distance && i !== start) { best = i; distance = d }
    for (const [dx, dy] of DIRS) {
      const x = p.x + dx, y = p.y + dy
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const n = idx(x, y)
      if (parent.has(n) || !clear(p, { x, y }, fits)) continue
      parent.set(n, i); queue.push(n)
    }
  }
  const route: Vec2[] = []
  for (let i = best; i >= 0; i = parent.get(i)!) route.push(center(i))
  return route.reverse()
}

/** Level 5 staff walk on the loaded floor and validate each step against their full body radius. */
export function walkHotelStaff(eng: Engine, e: Entity, goal: Vec2, speed: number, dt: number, stopAt = .1): number {
  const m = eng.map!
  const fits = (x: number, y: number, radius = RADIUS) => {
    if (x < radius || y < radius || x >= m.w - radius || y >= m.h - radius) return false
    const i = Math.floor(y) * m.w + Math.floor(x)
    return m.liquid[i] !== 1 && m.elev[i] !== 4 && canOccupy(m, x, y, radius, { z: e.z, band: 0 })
  }
  // Leave a margin between swept samples so a route cannot clip a diagonal corner.
  const routeFits = (x: number, y: number) => fits(x, y, RADIUS + .055)
  const distance = Math.hypot(goal.x - e.x, goal.y - e.y)
  if (distance <= stopAt || speed <= 0 || dt <= 0) return 0
  const infRev = m.inf?.rev ?? 0
  let route = routes.get(e), next = goal
  if (route) route.retry = Math.max(0, route.retry - dt)
  if (distance > 7 || !clear(e, goal, routeFits)) {
    const goalTile = Math.floor(goal.y) * m.w + Math.floor(goal.x)
    if (!route || route.map !== m || route.rev !== eng.mapRev || route.infRev !== infRev ||
        (route.retry <= 0 && (route.goal !== goalTile || route.next === route.points.length))) {
      route = { map: m, rev: eng.mapRev, infRev, goal: goalTile, retry: .55, points: findRoute(m.w, m.h, e, goal, routeFits), next: 0 }
      routes.set(e, route)
    }
    while (route.next < route.points.length && Math.hypot(route.points[route.next].x - e.x, route.points[route.next].y - e.y) < .025) route.next++
    if (route.next === route.points.length) return 0
    for (let i = Math.min(route.points.length - 1, route.next + 4); i >= route.next; i--) {
      if (clear(e, route.points[i], routeFits)) { route.next = i; break }
      if (i === route.next) { if (route.retry <= 0) routes.delete(e); return 0 }
    }
    next = route.points[route.next]
  } else routes.delete(e)
  const dx = next.x - e.x, dy = next.y - e.y, length = Math.hypot(dx, dy)
  const step = Math.min(length, speed * dt, distance - stopAt)
  if (step <= 0) return 0
  const to = { x: e.x + dx * step / length, y: e.y + dy * step / length }
  if (!clear(e, to, fits)) return 0
  e.x = to.x; e.y = to.y; e.z = floorHeight(m, to.x, to.y)
  e.facing = Math.atan2(dy, dx)
  return step / dt
}
