// B.N.T.G. 存储设施（据点层级：完全手工布局，见 mapgenOutpost.ts genStorageOutpost；
// 设定依据 wikidot Level 3 条目——B.N.T.G. 在 Level 3 设有存储设施，存放从该层搜集的物资）
import type { LevelDef } from '../core/types'

export const LSTORAGE: LevelDef = {
  id: 107, // 据点独立 id 空间（100+）：Level 3 的子层级，不占 LEVELS 数字下标
  name: 'B.N.T.G. 存储设施',
  label: '存储设施',
  flavor: '波纹钢墙后面是成排的货架。B.N.T.G. 的 Level 3 物资仓——每一只托盘都点过两遍数。',
  // 灰绿工业风（配 l107_* 贴图：波纹钢墙/仓库混凝土/涂装粉刷吊顶）：灰绿墙面 + 水泥灰地面 + BNTG 深绿点缀
  palette: { floor: '#a9aca2', floorAlt: '#9da096', wall: '#a3b5a4', wallTop: '#c3ccbf', accent: '#566c5a', light: '#fff4e0', decal: '#7a8a7c' },
  gen: 'outpost',
  size: 80,
  entities: [], // 据点无敌对实体（居民是 NPC，不是实体）
  items: [],
  itemCount: [0, 0],
  structures: [], // 一切结构由生成器手工布置（无随机物品/容器）
  exits: [
    { kind: 'unlockeddoor', name: '北部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '东部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '西部入口', dest: 'back', anim: 'bloom' },
  ],
  entrance: '定居点地标（Level 3）',
  lightDensity: 0, // 灯光全部手工布置
  darkness: 0.08,
  fullMap: true, // 进入即获得完整地图
  sd: 'Survival Difficulty: Class 宜居 · 安全 · B.N.T.G. 存储设施',
  entryAnim: 'step',
}
