// 原住民（据点层级：完全手工布局，见 mapgenOutpost.ts genOriginalsParlor；
// v55：历史著名失踪者的小团体——1930 年代风格居所，凭贝弗莉室的邀请函拜访）
import type { LevelDef } from '../core/types'

export const LORIGINALS: LevelDef = {
  id: 112, // 据点独立 id 空间（100+）：Level 5 的子层级
  name: '原住民',
  label: '原住民',
  flavor: '贝弗莉室附近一间接不通任何走廊的居所：老式客厅、藏书角与停在 1937 年的钟。住民们不谈论自己「进来」的那一夜。',
  palette: { floor: '#5e2f33', floorAlt: '#522a2e', wall: '#5a2e30', wallTop: '#402224', accent: '#b8924a', light: '#ffd9a0', decal: '#462427' }, // 与 L5 主层级一致（红金酒店调）
  gen: 'outpost',
  size: 80,
  entities: [],
  items: [],
  itemCount: [0, 0],
  structures: [],
  exits: [
    { kind: 'unlockeddoor', name: '居所正门', dest: 'back', anim: 'bloom' },
  ],
  entrance: '贝弗莉室的邀请函（Level 5）',
  exitDesc: '出口：居所正门（返回 Level 5）。',
  lightDensity: 0,
  darkness: 0.15,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · 凭邀请函拜访',
  entryAnim: 'step',
}
