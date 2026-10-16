import type { Engine } from '../engine'
import type { Structure } from '../core/types'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { floorHeight, ceilingHeightAt, structColliders, type GameMap } from '../world/mapgen'
import { seatsFor, type SeatAnchor } from '../world/seating'
import { look, WALL_H } from '../renderer/shared'

type Point = { x: number; y: number; z: number }
export interface SittingState {
  map: GameMap
  structure: Structure
  anchor: SeatAnchor // world coordinates (x/y) so streaming origin changes are harmless
  from: Point
  exit: Point
  last: Point
  startYaw: number
  phase: 'sitting-down' | 'seated' | 'standing-up'
  t: number
  blend: number
  duration: number
  startBlend: number
  inputReleased: boolean
}
const smooth = (v: number) => { const k = Math.max(0, Math.min(1, v)); return k * k * (3 - 2 * k) }
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v))
const origin = (m: GameMap) => ({ x: m.inf?.ox ?? 0, y: m.inf?.oy ?? 0 })
const toWorld = (m: GameMap, p: Point): Point => { const o = origin(m); return { x: p.x + o.x, y: p.y + o.y, z: p.z } }
const toLocal = (m: GameMap, p: Point): Point => { const o = origin(m); return { x: p.x - o.x, y: p.y - o.y, z: p.z } }

function safeFloor(eng: Engine, x: number, y: number, floor: SeatAnchor['floor'], reference: number, ignore?: Structure): Point | null {
  const m = eng.map!, z = floorHeight(m, x, y, floor)
  const i = Math.floor(y) * m.w + Math.floor(x)
  if (!Number.isFinite(z) || Math.abs(z - reference) > .32 || m.liquid[i] === 1) return null
  if (!canOccupy(m, x, y, PLAYER_RADIUS, { z, band: floor, ignoreStructure: ignore })) return null
  if (ceilingHeightAt(m, x, y, WALL_H[eng.levelDef.gen] ?? 3, floor) - z < 1.75) return null
  return { x, y, z }
}

/** Check the whole short approach, not just its endpoints, so sitting cannot cross walls/tables. */
function clearPath(eng: Engine, s: Structure, from: Point, to: Point, floor: SeatAnchor['floor']): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / .10))
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    const x = from.x + (to.x - from.x) * k, y = from.y + (to.y - from.y) * k
    if (!safeFloor(eng, x, y, floor, from.z, s)) return false
    // Combined picnic/dining-table meshes own both seats and a tabletop. The
    // furniture exemption covers the low seat only, never a path through that table.
    if (s.kind === 'alpha_home_table' || s.kind === 'l11_picnic_table') {
      for (const b of structColliders(s, eng.map!)) {
        if (b.top < (s.kind === 'l11_picnic_table' ? .40 : .60)) continue
        const dx = x - Math.max(b.x0, Math.min(b.x1, x)), dy = y - Math.max(b.y0, Math.min(b.y1, y))
        if (dx * dx + dy * dy < .13 * .13) return false
      }
    }
  }
  return true
}

export function pickSeat(eng: Engine, s: Structure): SeatAnchor | null {
  if (!eng.map || eng.seating || eng.climb || eng.ride || eng.porchDrop || eng.inLiquid === 1 || eng.introT > 0 || eng.dev.fly || Math.abs(eng.player.vz) > .2) return null
  const p = eng.player, m = eng.map
  const choices = seatsFor(s, m, eng.levelDef.id).filter(a => {
    const dx = p.x - a.x, dy = p.y - a.y
    const ground = floorHeight(m, a.x, a.y, a.floor)
    // The backrest is not an entrance. Side approaches remain available.
    return a.floor === (p.floor ?? 0) && Math.hypot(dx, dy) <= 2.2
      && dx * Math.sin(a.yaw) + dy * Math.cos(a.yaw) >= -.08
      && a.z - ground >= .24 && a.z - ground <= .95
      && Math.abs(p.z - ground) <= .22
  }).sort((a, b) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - b.x, p.y - b.y))
  return choices.find(a => clearPath(eng, s, p, { x: a.x, y: a.y, z: p.z }, a.floor)) ?? null
}

export function beginSitting(eng: Engine, s: Structure): boolean {
  const a = pickSeat(eng, s)
  if (!a || !eng.map) { eng.msg('座椅前方没有足够空间，请从正面或侧面靠近。', 'system'); return false }
  const p = eng.player, from = toWorld(eng.map, p), world = toWorld(eng.map, a)
  eng.seating = { map: eng.map, structure: s, anchor: { ...a, ...world }, from, exit: { ...from }, last: { ...from }, startYaw: look.yaw, phase: 'sitting-down', t: 0, blend: 0, duration: .65, startBlend: 0, inputReleased: false }
  p.crouching = false; p.vz = 0
  eng.moveIt.acc = 0; eng.stepAcc = 0; eng.slipVx = 0; eng.slipVy = 0
  eng.searching = null
  eng.msg(`坐在${a.label}上。移动、跳跃或再次交互可起身。`, 'system')
  return true
}

function standPoint(eng: Engine, state: SittingState): Point | null {
  const m = eng.map!, a = toLocal(m, state.anchor), old = toLocal(m, state.from)
  const front = state.anchor.yaw, points: Point[] = []
  // Prefer a step in front, then either side, finally the exact safe approach point.
  for (const r of [.65, .85, 1.05]) for (const offset of [0, .7, -.7, Math.PI / 2, -Math.PI / 2]) {
    points.push({ x: a.x + Math.sin(front + offset) * r, y: a.y + Math.cos(front + offset) * r, z: old.z })
  }
  points.push(old)
  for (const p of points) {
    const safe = safeFloor(eng, p.x, p.y, state.anchor.floor, old.z)
    if (safe && clearPath(eng, state.structure, { ...a, z: old.z }, safe, state.anchor.floor)) return safe
  }
  return null
}

export function standUp(eng: Engine): boolean {
  const state = eng.seating
  if (!state || !eng.map || state.phase === 'standing-up') return false
  const exit = standPoint(eng, state)
  if (!exit) { eng.msg('起身处被挡住了，请先移开障碍。', 'system'); return false }
  state.exit = toWorld(eng.map, exit)
  state.from = toWorld(eng.map, eng.player)
  state.phase = 'standing-up'; state.t = 0; state.duration = .52
  state.startBlend = state.blend
  eng.input.jump = false
  return true
}

export function seatedEyeHeight(eng: Engine): number {
  const s = eng.seating
  if (!s) return eng.player.crouching ? 1 : 1.55
  const height = s.anchor.z - eng.player.z + .77
  const dip = s.phase === 'seated' ? 0 : Math.sin(Math.PI * Math.min(1, s.t / s.duration)) * .045
  return 1.55 + (height - 1.55) * s.blend - dip
}

/** Eyes sit in front of the pelvis, outside the local avatar's shirt surface. */
export function seatedEyeOffset(eng: Engine): { x: number; y: number } {
  const s = eng.seating, distance = (s?.blend ?? 0) * .26
  return { x: Math.sin(s?.anchor.yaw ?? 0) * distance, y: Math.cos(s?.anchor.yaw ?? 0) * distance }
}

/** Saves use a checked standing point, avoiding a resumed player trapped inside the chair. */
export function sittingSafePosition(eng: Engine): Point | null {
  if (!eng.seating || !eng.map) return null
  return standPoint(eng, eng.seating) ?? toLocal(eng.map, eng.seating.exit)
}

export function updateSitting(eng: Engine, dt: number): boolean {
  const s = eng.seating, m = eng.map
  if (!s || !m) return false
  const p = eng.player, now = toWorld(m, p)
  // Teleports, level changes, death and scripted entity movement take ownership immediately.
  if (m !== s.map || eng.over || eng.dev.fly || Math.hypot(now.x - s.last.x, now.y - s.last.y, now.z - s.last.z) > .45) { eng.seating = null; return false }
  if (!m.structures.includes(s.structure)) {
    Object.assign(p, toLocal(m, s.exit), { vz: 0, crouching: false }); eng.seating = null; return false
  }
  const wantsOut = Math.hypot(eng.input.mx, eng.input.my) > .1 || eng.input.jump || eng.input.crouch
  if (!wantsOut) s.inputReleased = true
  if (s.phase !== 'standing-up' && wantsOut && s.inputReleased) standUp(eng)
  s.t += dt
  const k = smooth(s.t / s.duration)
  if (s.phase === 'sitting-down') {
    const target = toLocal(m, { x: s.anchor.x, y: s.anchor.y, z: s.from.z })
    const from = toLocal(m, s.from)
    // A door can move after E was pressed. Pause the approach instead of crossing
    // its new collider; movement / E can still cancel into a checked standing path.
    if (!clearPath(eng, s.structure, p, target, s.anchor.floor)) {
      s.t = Math.max(0, s.t - dt); p.vz = 0; eng.input.jump = false
      return true
    }
    s.blend = k
    p.x = from.x + (target.x - from.x) * k; p.y = from.y + (target.y - from.y) * k; p.z = from.z
    look.yaw = s.startYaw + angle(s.anchor.yaw + Math.PI - s.startYaw) * smooth(Math.min(1, s.t / .45))
    if (k >= 1) { s.phase = 'seated'; s.t = 0 }
  } else if (s.phase === 'standing-up') {
    const from = toLocal(m, s.from), to = toLocal(m, s.exit)
    // Revalidate a moving door/obstacle before advancing. Never push through it.
    if (!safeFloor(eng, to.x, to.y, s.anchor.floor, to.z) || !clearPath(eng, s.structure, p, to, s.anchor.floor)) {
      s.phase = 'seated'; s.blend = 1; s.t = 0; s.inputReleased = false
      const a = toLocal(m, s.anchor); p.x = a.x; p.y = a.y
    } else {
      s.blend = s.startBlend * (1 - k)
      p.x = from.x + (to.x - from.x) * k; p.y = from.y + (to.y - from.y) * k; p.z = from.z + (to.z - from.z) * k
      if (k >= 1) eng.seating = null
    }
  }
  if (s.phase === 'seated') {
    const center = s.anchor.yaw + Math.PI
    look.yaw = center + Math.max(-1.75, Math.min(1.75, angle(look.yaw - center)))
  }
  p.vz = 0; p.crouching = false; eng.input.jump = false; eng.stepAcc = 0; eng.moveIt.acc = 0
  s.last = toWorld(m, p)
  return true
}
