import type { SmilerKind } from './smilers'

/** Centre distances include the muzzle / forward reach of the bent giant. */
export const SMILER_STOP: Record<SmilerKind, number> = { common: 1.9, phantom: 1.8, starved: 2.7, canid: 2.5, great: 3.4 }
export const GREAT_WAIST = .72
export const GREAT_MAX_BEND = 1.48
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Conservative upper silhouette, including horns, seed variation and flame motion. */
export function greatPoseHeight(bend: number, scale: number) {
  return (GREAT_WAIST + 1.71 * Math.cos(bend) + .55 * Math.sin(bend)) * scale + .2
}
export function greatCeilingBend(headroom: number, scale: number) {
  if (headroom >= greatPoseHeight(0, scale) + .08) return 0
  let lo = .36, hi = GREAT_MAX_BEND
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2
    if (greatPoseHeight(mid, scale) + .08 > headroom) lo = mid
    else hi = mid
  }
  return hi
}
export function greatAttackBend(eyeAboveFeet: number, scale: number) {
  const mouthY = eyeAboveFeet / scale - .18
  let lo = .35, hi = GREAT_MAX_BEND
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2
    const y = GREAT_WAIST + (1.32 - GREAT_WAIST) * Math.cos(mid) - .4 * Math.sin(mid)
    if (y > mouthY) lo = mid
    else hi = mid
  }
  return hi
}
export function greatWalkFactor(ceilingBend: number) {
  return 1 - .18 * clamp(ceilingBend / GREAT_MAX_BEND, 0, 1)
}

/** Limit a proposed step at the first intersection with the player's stand-off circle. */
export function smilerApproachLimit(rx: number, ry: number, dx: number, dy: number, distance: number, stop: number) {
  const len = Math.hypot(dx, dy)
  if (!len || distance <= 0) return 0
  const b = (rx * dx + ry * dy) / len, c = rx * rx + ry * ry - stop * stop
  if (b >= 0) return distance
  if (c <= 0) return 0
  const disc = b * b - c
  return disc <= 0 ? distance : Math.min(distance, Math.max(0, -b - Math.sqrt(disc)))
}
