import type { SmilerKind } from './smilers'

/** Centre spacing: the face stays outside the camera while limbs close the gap. */
export const SMILER_STOP: Record<SmilerKind, number> = { common: 1.45, phantom: 1.4, starved: 1.95, canid: 1.7, great: 2.7 }
export const SMILER_STRIKE = { windup: .28, swing: .14, recovery: .32, hitAt: .38, duration: .74 }
/** The damage boundary is deliberately almost the same as the approach stop. */
export const smilerReach = (kind: SmilerKind) => SMILER_STOP[kind] + .12
export function smilerStrikePose(age?: number) {
  if (age === undefined || age < 0 || age >= SMILER_STRIKE.duration) return { charge: 0, thrust: 0, jaw: 0 }
  const ease = (t: number) => { t = Math.max(0, Math.min(1, t)); return t*t*(3-2*t) }
  if (age < SMILER_STRIKE.windup) { const charge=ease(age/SMILER_STRIKE.windup);return {charge,thrust:0,jaw:charge} }
  if (age < SMILER_STRIKE.windup+SMILER_STRIKE.swing) {
    const thrust=ease((age-SMILER_STRIKE.windup)/SMILER_STRIKE.swing)
    return {charge:1-thrust,thrust,jaw:1-.85*ease((age-SMILER_STRIKE.hitAt+.015)/.05)}
  }
  const rest=1-ease((age-SMILER_STRIKE.windup-SMILER_STRIKE.swing)/SMILER_STRIKE.recovery)
  return {charge:0,thrust:rest,jaw:.15*rest}
}
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
export function greatAttackBend(eyeAboveFeet: number, scale: number, mouthHeight = 1.32, forward = .4) {
  const mouthY = eyeAboveFeet / scale - .18
  let lo = .35, hi = GREAT_MAX_BEND
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2
    const y = GREAT_WAIST + (mouthHeight - GREAT_WAIST) * Math.cos(mid) - forward * Math.sin(mid)
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
