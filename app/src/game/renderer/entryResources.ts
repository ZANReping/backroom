import type { Engine } from '../engine'

/** Only currently available live shrimp block entry. Other Backrooms catches
 * keep their background prewarm without delaying an unrelated destination. */
export function needsShrimpHeldWarmup(engine: Pick<Engine, 'levelDef' | 'player' | 'map'>): boolean {
  const p = engine.player
  if ([...p.hotbar, ...p.backpack, ...p.equip.pockets, p.equip.offhand].some(s => s?.type === 'liveshrimp')) return true
  return !!engine.map?.items.some(i => i.type === 'liveshrimp') || !!engine.map?.entities.some(e => !e.dead && e.def.type === 'dryshrimp')
}
