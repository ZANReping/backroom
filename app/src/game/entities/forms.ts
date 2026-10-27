import { MOTH_FORMS } from './moths'
import { SMILER_KINDS } from './smilers'
import { WRETCH_STATS } from './wretches'
import { ARACHNID_FORM_ROWS } from '../engine/arachnidStats' // [L8-arachnid]
import type { EntityDef, EntityForm, RefinedEntityForm } from './types'

/** Shared by the factory, codex and developer tools. Parent IDs never change. */
export interface EntitySubform {
  id: EntityForm
  name: string
  desc: string
  behavior: string
  initial?: boolean
  traits?: Partial<EntityDef>
}
const form = (id: RefinedEntityForm, name: string, desc: string, behavior: string, traits: Partial<EntityDef>, initial = false): EntitySubform =>
  ({ id, name, desc, behavior, traits, ...(initial ? { initial: true } : {}) })

export const ENTITY_FORMS: Readonly<Record<string, readonly EntitySubform[]>> = {
  wrangler:[
    form('wrangler-male','雄性牧蛇','灰黑褶皱躯体，白色斜眼与宽阔笑口。','循震动从岩壁切出；注视会被催眠，张嘴蓄力后前扑。',{wranglerKind:'male'}),
    form('wrangler-female','雌性牧蛇','体节躯体、圆眼和钳状口器，部分个体受孕。','通常啃食岩石，靠近或伤害幼体、卵枝后激怒。',{wranglerKind:'female'}),
    form('wrangler-juvenile','牧蛇幼体','短小半透明躯体，可见体内器官。','在卵枝附近活动，怕人；刀砍无效，受火焚伤害。',{wranglerKind:'juvenile',passive:true}),
  ],
  deathmoth: Object.entries(MOTH_FORMS).map(([id, v]) => ({ ...v, id: id as EntityForm })),
  smiler: Object.entries(SMILER_KINDS).map(([id, v]) => ({ id: id as EntityForm, name: id === 'common' ? '普通笑魇' : v.name, desc: v.desc, behavior: v.behavior })),
  hound: [
    form('hound-hostile', '普通猎犬', '低伏四足、长发垂落的敌对个体。', '嚎叫后两三只结群包抄、冲锋扑倒压制、拖走并啃食尸体；准星对准脸持续直视可短暂威慑，手电照脸更有效。', { houndKind: 'hostile' }),
    form('hound-neutral', '中立猎犬', 'Level 11 常见的中立形态，毛色浅、眼神柔和，坐下观察并摇尾。', '不结群、不扑人、不抢尸体；近处奔跑会使其逃开；被攻击后仍会转为敌对。', { houndKind: 'neutral' }),
    form('hound-ambusher', '高智能猎犬', 'Level 3 的伏击个体，更瘦长、伏得更低，爪更长。', '单独伏击与快速追击；被直视时僵住；扑倒后更难挣脱。', { houndKind: 'ambusher' }),
  ],
  faceling: [
    form('faceling-common', '普通种', '与人类高度相似，分幼年 / 成年 / 老年；衣着模仿所处环境的职业。脸部没有五官。', '中立：会招手、点头、指路；幼体会哭闹，可安抚；伤害幼体会激怒附近成体。', { passive: true, l3face: false, tool: false }),
    form('faceling-anomaly', '进化种（易怒）', 'Level 3 的进化个体：早期只长出独眼、独耳，晚期长出两只小眼、连在一起的鼻孔、没有嘴唇的嘴和扁平的耳朵；部分男性长胡须。', '易怒分支：对流浪者抱有敌意，暴起前先暴怒；约四成持石锤。', { passive: false, l3face: true }),
  ],
  skinstealer: [
    form('skinstealer-skinned', '人皮伪装', '披着人皮，以随机人物外观出现。', '伪装结束或受伤后显露真身，继续原有行为循环。', { skinPhase: 'skinned' }, true),
    form('skinstealer-docile', '温顺真身', '淡黄色真身，白色眼球与细长手臂。', '从温顺阶段开始，饥饿或被激怒后追猎。', { skinPhase: 'docile' }, true),
    form('skinstealer-hunt', '饥饿真身', '显露真身并开始搜寻猎物。', '从追猎阶段开始，沿用原有攻击与进食行为。', { skinPhase: 'hunt' }, true),
  ],
  clump: [
    form('clump-common', '普通肢团', '融合肉团与互相牵扯的肢体。', '从活动状态开始；追猎时存在混乱期。', { l3clump: false }),
    form('clump-intelligent', '高智能肢团', '更大的肉团与协调的肢体，随机持有原武器池中的武器。', '没有混乱期，可贴顶和俯扑。', { l3clump: true, scale: 1.5 }),
  ],
  wretch: [
    form('wretch-shambler', '蹒跚型', '驼背拖步、破衣与红褐皮肤。', '缓慢追猎、低沉叫声，可撞开普通门。', { wretchKind: 'shambler' }),
    form('wretch-sprinter', '疾行型', '更瘦的四肢，冲刺时压低身体。', '交替冲刺与喘息，近身扑击。', { wretchKind: 'sprinter' }),
    form('wretch-smart', '有智型', '较直立的个体，右手持锈铁管。', '绕路、躲光、拧门把手，举管攻击。', { wretchKind: 'smart' }),
    form('wretch-mutant', '突变型', '至少两种额外眼球、手臂、背部或下颌异常。', '体力更强，动作频繁抽搐。', { wretchKind: 'mutant' }),
  ],
  corpserat: [
    form('corpserat-brown', '常见尸鼠', '常见种黑色毛皮、棕色怪角，角尖泛红光。', '多数以飞蛾和霉菌为食，通常无害，但会捕猎并反击。', { ratMorph: 'common' }),
    form('corpserat-gray', '无毛尸鼠', 'Level 2 的无毛尸鼠，裸皮布满高温烫伤与皱褶。', '适应高温，以桶内液体和遗弃食物为食。', { ratMorph: 'hairless' }),
    form('corpserat-hotel', '旅馆尸鼠', 'Level 5 的尸鼠穿着正装，带有小西装与领结。', '保持尸鼠的趋食、捕猎与反击行为。', { ratMorph: 'hotel' }),
    form('corpserat-capybara', '水豚尸鼠', 'Level 3 的大型水豚体态，牙齿刻意磨尖，胸前绑着语音装置。', '磨牙、指挥尸鼠编队，并设置简陋陷阱与仿制炸弹。', { capybara: true, scale: 1.45, ratMorph: 'capybara' }),
    form('corpserat-ceiling', '罗特尼斯尸鼠', 'Level 8 穴顶的尸鼠，适应反向重力并倒挂在洞顶。', '沿洞顶倒挂爬行；需要有顶空间观察。', { ceilingCrawler: true, ratMorph: 'cave' }),
  ],
  // [L8-arachnid] 重制：17 个变种 + 旧「食草被动型」行为标志（engine/arachnidStats.ts）；旧 spider/scorpion/tick/mite 外形数据由 legacyArachnidKind 映射
  // [creeper] Entity 17：感染体宿主与爬菌人（阶段与数值见 engine/creeperAI.CR）
  creeper: [
    form('creeper-rat', '尸鼠感染体', '尸鼠的关节、背上长出亮白绒球，毛色灰白干瘪，高阶时几乎被白绒包住。', '1–3 阶僵直游荡、不主动攻击；4 阶主动追人。阶段越高越慢、出手间隔越长，但更狠更记仇。', { creepHost: 'rat' }),
    form('creeper-spider', '蛛形纲感染体', '蜘蛛的每个腿关节上一颗白绒球，腹部一大团白球，菌丝连到网上。', '同尸鼠感染体；腿僵直不协调，偶尔拖着一条后腿走。', { creepHost: 'arachnid' }),
    form('creeper-human', '爬菌人', '腰下断开、焦黑龟裂的人形，双手撑地爬行，白色增生团里余烬明灭。', '极罕见。听觉视觉增强，发现目标会尖叫，然后主动追击、扑击。', { creepHost: 'human', passive: false }),
  ],
  arachnid: ARACHNID_FORM_ROWS.map((r) => form(r.id, r.name, r.desc, r.behavior, { arachnidVariant: r.kind, ...(r.herbivore ? { herbivore: true, passive: true } : {}) })),
}
const EMPTY: readonly EntitySubform[] = []
export const entityForms = (type: string): readonly EntitySubform[] => ENTITY_FORMS[type] ?? EMPTY
export const entityForm = (type: string, id: unknown) => entityForms(type).find(v => v.id === id)

export function refinedDefinition(base: EntityDef, id?: EntityForm): EntityDef {
  const f = entityForm(base.type, id)
  if (!f) return base
  const def = { ...base, ...f.traits, entityForm: f.id }
  if (def.wretchKind) {
    const { hp, speed, damage, sight } = WRETCH_STATS[def.wretchKind]
    Object.assign(def, { hp, speed, damage, sight })
  }
  if (base.type === 'faceling' && f.traits?.tool) def.damage = base.damage + 6
  return def
}
