// Shared by simulation and presentation: contact is at the end of the windup.
export const HUMANOID_WINDUP = .32
export const HUMANOID_RECOVERY = .28
export function humanoidAttackPhase(windup = 0, recovery = 0): number | undefined {
  if (windup > 0) return Math.max(0, 1 - windup / HUMANOID_WINDUP) * .65
  if (recovery > 0) return .65 + (1 - Math.min(1, recovery / HUMANOID_RECOVERY)) * .35
  return undefined
}
