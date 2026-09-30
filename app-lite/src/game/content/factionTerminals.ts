import type { QuestDef } from './factions'

export const NEW_FACTIONS = ['bntg', 'ariane', 'jerry'] as const
export type NewFaction = typeof NEW_FACTIONS[number]
export const isNewFaction = (id: string): id is NewFaction => (NEW_FACTIONS as readonly string[]).includes(id)
export const isEnhancedFaction = (id: string) => id === 'meg' || isNewFaction(id)
export const questFaction = (q: QuestDef) => q.issuer?.faction ?? q.faction
export const FACTION_TERMINALS = {
  bntg: { short: 'B.N.T.G.', code: 'TRADE / OPERATIONS', title: '商贸业务终端', motto: '繁荣缔造和平', color: '#7db591', paper: '#15231c', ink: '#e1eee4', muted: '#b2c9b9', record: '承运人凭证', journal: '每一笔交付，都有回执', registration: '登记承运协作身份', rank: '雇佣履历', tiers: ['试用委托', '仓储业务', '跨层联运', '合同复核'], description: '商人之家 · 中立贸易网络。清点实物、保留封签、逐站签收；货位会改变，责任记录必须留下。', relations: ['拒绝往来', '信用受限', '独立行商', '签约合作商', '优先贸易伙伴'], coin: 'presses' },
  ariane: { short: 'ARIANE', code: 'CERCLE / HIPPOCRATE', title: '希波克拉底协作档案', motto: '循线而行，保留未知', color: '#8676e2', paper: '#f0edf8', ink: '#322747', muted: '#665875', record: '研究协作证', journal: '一份观察，不是一项诊断', registration: '登记医疗研究协作身份', rank: '协作履历', tiers: ['接待与护理', '环境研究', '跨层协作', '研究复核'], description: '阿丽亚娜之圈 · 希波克拉底团队。医疗接待与异常研究并行，记录匿名化；将环境观察与临床结论分开归档。', relations: ['拒绝接洽', '待核实访客', '来访流浪者', '研究合作人员', '受信任协作者'], coin: null },
  jerry: { short: 'JERRY', code: 'THE BLUE / SANCTUARY', title: '蓝羽圣所名册', motto: '一切归于鹉主', color: '#737de0', paper: '#101533', ink: '#e3e6ff', muted: '#b8bde4', record: '圣所访客像', journal: '蓝色的声音，沿走廊回响', registration: '登记信众身份', rank: '圣所侍奉录', tiers: ['叩门者', '蓝色救赎', '外出传道', '圣所内圈'], description: '杰瑞的信众 · 蓝羽名册。补给、传道与仪式服务于同一个名字。名册上的身份与实际教化程度分别记录。', relations: ['圣所敌人', '受到怀疑', '未受召的访客', '圣所同行者', '鹉主的亲近者'], coin: null },
} as const
export function factionRelationship(id: NewFaction, rep: number) {
  const r = FACTION_TERMINALS[id].relations
  return r[rep <= (id === 'jerry' ? -10 : -60) ? 0 : rep <= (id === 'jerry' ? -1 : -30) ? 1 : rep >= 80 ? 4 : rep >= 20 ? 3 : 2]
}
