// 商人之家（B.N.T.G. 据点层级：商场式手工布局，见 mapgenOutpost.ts genBntgOutpost；
// 设定依据 wikidot The B.N.T.G. / 商人之家 / 交易保险库）
import type { LevelDef } from '../core/types'

export const LBNTG: LevelDef = {
  id: 102, // 据点独立 id 空间（100+）：Level 1 跃金段的子层级，不占 LEVELS 数字下标
  name: '商人之家',
  label: '商人之家',
  flavor: '霓虹、招牌与算盘声。后室最大的「活市场」——一切明码标价。',
  palette: { floor: '#a8a49a', floorAlt: '#9a968c', wall: '#cfcbc2', wallTop: '#dcd8ce', accent: '#5c6d5e', light: '#f2f4f0', decal: '#6a726a' },
  gen: 'outpost',
  size: 80,
  entities: [], // 据点无敌对实体（居民是 NPC）
  items: [],
  itemCount: [0, 0],
  structures: [],
  exits: [
    { kind: 'unlockeddoor', name: '北部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '东部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '西部入口', dest: 'back', anim: 'bloom' },
  ],
  entrance: '定居点地标（跃金段）',
  lightDensity: 0,
  darkness: 0.08,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · B.N.T.G. 主要基地',
  entryAnim: 'step',
}
