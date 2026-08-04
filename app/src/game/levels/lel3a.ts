// 办公区EL3A（BNTG 据点层级：Level 2 的子层级——大开间仓库 + 南侧整片夹楼办公区的双层手工布局，
// 见 mapgenOutpost.ts genEl3aOutpost；设定：B.N.T.G. 存储/分配从 L2/L3 搜刮的物资，转运其他层级的居住地）
import type { LevelDef } from '../types'

export const LEL3A: LevelDef = {
  id: 105, // 据点独立 id 空间（100+）：Level 2 的子层级，不占 LEVELS 数字下标
  name: '办公区EL3A',
  label: '办公区EL3A',
  flavor: '木板与缠绕膜的气味。B.N.T.G. 的中转仓——第一层是堆满托盘的挑高仓库，南侧夹楼上是永不关灯的办公区。',
  // v46 灰绿工业风（配 l105_* 贴图：波纹钢墙/仓库混凝土/吊顶）：灰绿墙面 + 水泥灰地面 + BNTG 深绿点缀 + 暖白灯光
  palette: { floor: '#a9aca2', floorAlt: '#9da096', wall: '#a3b5a4', wallTop: '#c3ccbf', accent: '#566c5a', light: '#fff4e0', decal: '#7a8a7c' },
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
  entrance: '定居点地标（整洁的廊道）',
  lightDensity: 0,
  darkness: 0.08,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · B.N.T.G. 物流中转站',
  entryAnim: 'step',
}
