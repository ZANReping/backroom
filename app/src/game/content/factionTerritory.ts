import type { Engine } from '../engine'
import { FACTIONS } from './factions'
import { OUTPOSTS } from './outposts'
import { l1StyleAt } from '../world/l1Architecture'
import { L02_ID } from '../world/l02Layout'

export const TERROR_HOTEL_FACTION = 'terrorhotel'
export const TERROR_HOTEL_MARK = 'textures/faction_terrorhotel.svg'

const outpostFactions = new Map(Object.values(OUTPOSTS).map(o => [o.levelId, o.faction]))
const factionOrder = ['wanderer', ...Object.keys(FACTIONS).filter(id => id !== 'wanderer')]
factionOrder.splice(factionOrder.indexOf('homely'), 0, TERROR_HOTEL_FACTION)

export function currentFactionTerritory(engine: Engine): string | undefined {
  const { level, x, y } = engine.player
  if (level === 5) return TERROR_HOTEL_FACTION
  if (level === 115) return 'meg' // Beta 基地和琥珀营地
  if (level === L02_ID || level === 1 && engine.map && l1StyleAt(engine.map, x, y) === 'ouroboros') return 'brc'
  if (level === 2 && engine.jerryTerritory) return 'jerry'
  return outpostFactions.get(level)
}

export function factionPanelOrder(engine: Engine): readonly string[] {
  const active = currentFactionTerritory(engine)
  return active && factionOrder.includes(active) ? [active, ...factionOrder.filter(id => id !== active)] : factionOrder
}
