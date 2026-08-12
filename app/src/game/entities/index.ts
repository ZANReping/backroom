// 实体定义汇总与工厂（游荡→调查→追击→攻击 状态机）
import { HUMANOID_ENTITIES } from './humanoid'
import { CRITTER_ENTITIES } from './critters'
import { SPECIAL_ENTITIES } from './special'
import { DEEP_ENTITIES } from './deep'
import type { Entity, EntityDef } from './types'

export type { AIState, EntityCodex, EntityDef, Entity } from './types'
export { loadSeen, recordEncounter, recordEntityEncounter, unlockTier } from './codex'
export { entitySpawnLevels, entityThreat, entityRarity, ENTITY_RARITY_LABEL, type EntitySpawn, type EntityRarity } from './spawns'

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
    hidden: def.ambusher || type === 'arms' ? true : undefined,
    disguised: type === 'skinstealer' ? 'bandage' : undefined,
  }
}

// v53：L3 高智能实体变体（wikidot Level 3）——dev 召唤/运行时直接生成的实体，
// 应用与 infiniteL3 chunk raw 标记（instantiate 浅拷贝）等价的实例变体；
// 猎犬伏击/笑魇恒主动/飞蛾集群/悲尸罕见由 AI 与生成器按层级负责，无需实例标记
export function applyL3Variant(e: Entity, rand: () => number = Math.random): void {
  switch (e.def.type) {
    case 'faceling': // 敌意 + 错位面部器官；~40% 持石器
      e.def = { ...e.def, passive: false, l3face: true, ...(rand() < 0.4 ? { tool: true, damage: e.def.damage + 6 } : {}) }
      break
    case 'skinstealer': e.disguised = 'human'; break // 伪装成流浪者
    case 'corpserat': e.def = { ...e.def, capybara: true, scale: 1.45 }; break // 水豚形态、体型变大
    case 'clump': e.def = { ...e.def, scale: 1.2 }; break // 体型变大一点
    default: break
  }
}
