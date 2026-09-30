import type { MegObjective } from './megMissions'
import type { NewFaction } from './factionTerminals'
export type FactionObjective = MegObjective
  | { kind: 'station'; level: number; service: string; actions: string[]; manifest?: boolean }
  | { kind: 'vault'; level: 102; mode: 'baseline' | 'migrated'; n: 3 }
  | { kind: 'rite'; npc: string; influence: number }
export interface FactionStage { title: string; story: string; objective: FactionObjective }
export interface FactionMission {
  id: string; faction: NewFaction; title: string; tier: 1 | 2 | 3 | 4; issuer: string; requires: string[]
  brief: string; ending: string; stages: FactionStage[]; rep: number; coins: number; items: string[]
}
export const stage = (title: string, story: string, objective: FactionObjective): FactionStage => ({ title, story, objective })
export const walk = (level: number, n: number): FactionObjective => ({ kind: 'walk', level, n })
export const record = (level: number, n: number): FactionObjective => ({ kind: 'record', level, n })
export const talk = (npc: string): FactionObjective => ({ kind: 'talk', npc })
export const deliver = (npc: string, item: string, n = 1): FactionObjective => ({ kind: 'deliver', npc, item, n })
export const station = (level: number, service: string, actions: string[], manifest = false): FactionObjective => ({ kind: 'station', level, service, actions, manifest })
export function mission(faction: NewFaction, id: string, title: string, tier: FactionMission['tier'], issuer: string, requires: string[], brief: string, ending: string, stages: FactionStage[]): FactionMission {
  return { faction, id: `${faction}-${id}`, title, tier, issuer, requires: requires.map(k => `${faction}-${k}`), brief, ending, stages, rep: 6 + tier * 2, coins: faction === 'bntg' ? tier + 1 : 0, items: faction === 'ariane' ? ['bandage', 'almond'] : ['almond'] }
}
