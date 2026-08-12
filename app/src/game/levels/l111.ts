// 家常酒店（据点层级：完全手工布局，见 mapgenOutpost.ts genHomelyHotel；
// v55：现代酒店风小团体据点——入住需先在地标卡提交「流浪者信息申请」）
import type { LevelDef } from '../core/types'

export const LHOMELY: LevelDef = {
  id: 111, // 据点独立 id 空间（100+）：Level 5 的子层级
  name: '家常酒店',
  label: '家常酒店',
  flavor: '一栋与周遭年代格格不入的现代酒店：前台灯常亮、房卡整齐、地毯有吸尘器的纹路。入住规则只有一条——先登记。',
  palette: { floor: '#5e2f33', floorAlt: '#522a2e', wall: '#5a2e30', wallTop: '#402224', accent: '#5a8a9a', light: '#ffd9a0', decal: '#462427' }, // v55c：与 L5 主层级统一（红金酒店调；accent 留酒店青灰点缀）
  gen: 'outpost',
  size: 80,
  entities: [],
  items: [],
  itemCount: [0, 0],
  structures: [],
  exits: [
    { kind: 'unlockeddoor', name: '酒店正门', dest: 'back', anim: 'bloom' },
  ],
  entrance: '主厅标志地标（Level 5）',
  exitDesc: '出口：酒店正门（返回 Level 5）。',
  lightDensity: 0,
  darkness: 0.08,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · 需登记入住',
  entryAnim: 'step',
}
