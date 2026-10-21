import type { EntityDef, MothForm } from './types'
import { CRITTER_ENTITIES } from './critters'

/** Subforms of Entity 4, not independently registered entities or codices. */
export const MOTH_FORMS: Record<MothForm, { name: string; desc: string; behavior: string; traits: Partial<EntityDef> }> = {
  male: {
    name: '雄性', desc: '翼展 30–35 厘米的黄褐色四翼成虫：宽大的羽状触角用于巢间远距离通讯，颚部退化为细长的针状口器，后翅拖着长尾突。',
    behavior: '温顺的食腐者：吸食任何液体（包括地上的杏仁水），只取食死亡或濒死的猎物——倒地或被麻痹时，成群的雄性会落在你身上把你吸干。会被强光吸引、扑灯耗电。远离巢穴侦察，发现你后可能飞回巢里报信。对准它喂一瓶杏仁水即可驯化：它会领你飞向最近的出口。',
    traits: {},
  },
  female: {
    name: '雌性', desc: '翼展 40–45 厘米的锈褐色成虫，胸腹粗壮，保留强颚与颚钳，腹末有分泌腐蚀液的腺体与可伸缩产卵器。',
    behavior: '越靠近巢心越凶。集群绕飞包抄、轮流扑咬，撕开的伤口会持续失血；中距离从腹末喷出腐蚀液，落地成一摊酸池。受惊时释放信息素召集附近的同类与禁卫级。被蛾群杀死的人会被溶成一团胶状球。',
    traits: { hp: 24, speed: 2.8, damage: 7, sight: 14, hearing: 5, passive: false, grudge: true,
      flying: true, flightMin: .85, flightMax: 1.35, flightClimb: 2, flightHeadroom: .55, hunts: undefined },
  },
  larva: {
    name: '幼虫', desc: '体长 5–10 厘米的分节幼体，背部覆盖约 7 厘米长的中空黑色刺毛，银灰色头壳下是锯齿状的颚；靠十几对附肢缓慢爬行。',
    behavior: '不主动伤人，整天啃食巢壁。靠近就蜷成刺球——刺毛分泌麻痹毒素，徒手或近战打它会被扎得浑身发麻。伤害任何一只幼虫都会激怒整个种群。',
    traits: { hp: 6, speed: .20, damage: 0, sight: 0, hearing: 0, passive: true, noRetaliate: true,
      flying: false, lightLure: false, drainsLight: false, hunts: undefined },
  },
  guard: {
    name: '禁卫级', desc: '直立近一米的半雌雄同体巢穴守卫：苍白多毛的身躯、垂向前下方的楔形长头与暗色复眼、交叉的镰刀状长颚，八条 70–75 厘米的黑色分节附肢里藏着麻痹毒腺，半退化的翅膀只用来散播信息素。',
    behavior: '每个巢至少一只，守在巢心。首次交战先立起威吓，随后在地面快速追击：前足连刺两下并注入麻痹毒素，也会喷腐蚀液。血量过半时释放狂暴信息素，附近所有飞蛾变快、变狠、开始乱咬。不飞行、不爬墙。',
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
