import { BNTG_MISSIONS } from './bntgMissions'
import { ARIANE_MISSIONS } from './arianeMissions'
import { JERRY_MISSIONS } from './jerryMissions'
export * from './factionMissionTypes'
export const FACTION_MISSIONS = [...BNTG_MISSIONS, ...ARIANE_MISSIONS, ...JERRY_MISSIONS]
export const FACTION_MISSION_BY_ID = Object.fromEntries(FACTION_MISSIONS.map(m => [m.id, m]))
export const FACTION_NPC_PLACES: Record<string, string> = {
  vesper: '商人之家 / EL3A · 兑换柜台', laozhangfang: '商人之家 · 保险库总账', shen: '商人之家 · 鉴定区', tang: '商人之家 · 杂货摊', kui: '商人之家 · 警备区',
  mccauley: 'Level 2 · EL3A 办公区', pidge: 'Level 2 · EL3A 办公区', boone: 'Level 2 · EL3A 办公区', whitfield: 'Level 2 · EL3A 办公区', kowalski: 'Level 2 · EL3A 办公区',
  dorian: '商人之家 / Level 3 储存区', gunter: 'Level 3 · 储存区', pippa: 'Level 3 · 储存区',
  lecomte: 'Level 1 · 希波克拉底 - 1 接待区', muller: '希波克拉底 - 1 · 研究区', dupont: '希波克拉底 - 1 · 医疗区', morel: '希波克拉底 - 1 · 医疗区', martin: '希波克拉底 - 1 · 护理区', lefevre: '希波克拉底 - 1 · 研究区',
  zeph: 'Level 274 · 杰瑞的房间', polly: 'Level 274 · 杰瑞的房间', bluebird: 'Level 274 · 杰瑞的房间', sinclair: 'Level 274 · 杰瑞的房间', theron: 'Level 3 · 蓝色救赎据点', aella: 'Level 3 · 蓝色救赎据点',
}
