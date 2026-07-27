// 实体定义汇总与工厂（游荡→调查→追击→攻击 状态机）
import { HUMANOID_ENTITIES } from './humanoid'
import { CRITTER_ENTITIES } from './critters'
import { SPECIAL_ENTITIES } from './special'
import { DEEP_ENTITIES } from './deep'
import type { Entity, EntityDef } from './types'

export type { AIState, EntityCodex, EntityDef, Entity } from './types'
export { loadSeen, recordEncounter, unlockTier } from './codex'

export const ENTITIES: Record<string, EntityDef> = {
  // 通用实体（设定依据 Backrooms Wikidot / Fandom 官方条目，M.E.G. 档案风格）
  ...SPECIAL_ENTITIES,
  ...HUMANOID_ENTITIES,
  ...CRITTER_ENTITIES,
  ...DEEP_ENTITIES, // v23：Level 6–11 / Level 601
}

let eid = 1
export function makeEntity(type: string, x: number, y: number, z = 0): Entity {
  const def = ENTITIES[type]
  return {
    id: eid++, def, x, y, z, hp: def.hp,
    state: def.stationary ? 'idle' : 'wander',
    targetX: x, targetY: y,
    stateT: 0, attackCd: 0, stunT: 0,
    facing: Math.random() * Math.PI * 2,
    lungeT: 0, dead: false, deathT: 0, animT: Math.random() * 10,
    hidden: def.ambusher ? true : undefined,
    disguised: type === 'skinstealer' ? 'bandage' : undefined,
  }
}
