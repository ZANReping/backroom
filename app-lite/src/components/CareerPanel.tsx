import { MegCareerPanel } from './MegMissions'
import { FactionCareerPanel } from './FactionMissions'
import { isNewFaction } from '@/game/content/factionTerminals'

/** Only finished terminals expose a growth page; legacy world services remain available. */
export default function CareerPanel({ faction, readOnly = false }: { faction: string; readOnly?: boolean }) {
  if (faction === 'meg') return <MegCareerPanel readOnly={readOnly} />
  if (isNewFaction(faction)) return <FactionCareerPanel faction={faction} readOnly={readOnly} />
  return null
}
