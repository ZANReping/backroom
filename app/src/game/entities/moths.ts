import type { EntityDef, MothForm } from './types'
import { CRITTER_ENTITIES } from './critters'

/** Subforms of Entity 4, not independently registered entities or codices. */
export const MOTH_FORMS: Record<MothForm, { name: string; desc: string; behavior: string; traits: Partial<EntityDef> }> = {
  male: {
    name: '雄性', desc: '体型较小的四翼成虫，双复眼与双单眼、宽大的羽状触角、六条关节足，以及细长的刺吸口器。',
    behavior: 'Level 5 巢外的雄性通常保持中立；被攻击或接收到幼虫的警报后会持续反击。其他层级的个体仍需谨慎对待。',
    traits: {},
  },
  female: {
    name: '雌性', desc: '比雄性更大的四翼成虫，胸腹粗壮，保留强颚与颚钳，腹部带有分泌腐蚀液的器官。',
    behavior: '聚集在巢穴中育幼和防卫。开启巢门或惊扰种群后，雌性会飞出巢穴攻击入侵者。',
    traits: { hp: 24, speed: 2.8, damage: 7, sight: 14, hearing: 5, passive: false, grudge: true,
      flying: true, flightMin: .85, flightMax: 1.35, flightClimb: 2, flightHeadroom: .55, hunts: undefined },
  },
  larva: {
    name: '幼虫', desc: '分节、覆有长刚毛的幼体，苍白的头壳布满细纹；依靠腹足与躯干的收缩波缓慢爬行。',
    behavior: '不会伤害玩家。伤害任何一只幼虫都会使整个 Level 5 的死亡飞蛾种群愤怒。',
    traits: { hp: 6, speed: .20, damage: 0, sight: 0, hearing: 0, passive: true, noRetaliate: true,
      flying: false, lightLure: false, drainsLight: false, hunts: undefined },
  },
  guard: {
    name: '禁卫级', desc: '半雌雄同体的巢穴守卫，八条细长分节附肢支撑高耸的身躯，半退化翅膀用于散播信息素。',
    behavior: '在地面追击，用附肢内的麻痹毒素使受伤者短暂失去行动能力；不飞行、不爬墙。',
    traits: { hp: 95, speed: 2.1, damage: 16, sight: 15, hearing: 5, passive: false, grudge: true,
      flying: false, lightLure: false, drainsLight: false, hunts: undefined },
  },
}

// Read-only compatibility with pre-consolidation saves/snapshots. Never added to ENTITIES.
export const LEGACY_MOTH_FORMS: Readonly<Record<string, MothForm>> = {
  deathmoth_larva: 'larva', deathmoth_female: 'female', deathmoth_guard: 'guard',
}
export function mothFormOf(type: string, form?: MothForm): MothForm {
  return form && Object.hasOwn(MOTH_FORMS, form) ? form : LEGACY_MOTH_FORMS[type] ?? 'male'
}
export function mothDefinition(form: MothForm): EntityDef {
  return { ...CRITTER_ENTITIES.deathmoth, ...MOTH_FORMS[form].traits, mothForm: form }
}
