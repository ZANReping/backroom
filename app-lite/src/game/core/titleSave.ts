import type { SlotInfo } from '../engine/save'
import { levelDefOf } from '../levels'

/** Same choice for the Continue summary and the title scene; ties keep slot order. */
export function latestSaveSlot(slots: readonly SlotInfo[]): SlotInfo | undefined {
  let latest: SlotInfo | undefined
  const time = (slot: SlotInfo) => Number.isFinite(slot.snap?.savedAt) ? slot.snap!.savedAt! : 0
  for (const slot of slots) if (slot.snap && (!latest || time(slot) > time(latest))) latest = slot
  return latest
}

export function titleBackgroundSource(slots: readonly SlotInfo[]) {
  const latest = latestSaveSlot(slots), snap = latest?.snap
  const level = snap && levelDefOf(snap.level) ? snap.level : 0
  const seed = snap && Number.isFinite(snap.mapSeed) ? snap.mapSeed : snap && Number.isFinite(snap.seed) ? snap.seed : 1337
  return { level, seed, key: `${latest?.id ?? 'empty'}:${level}:${seed}:${snap?.savedAt ?? 0}` }
}
