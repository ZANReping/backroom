// M.E.G. 哨所「家政服务」（据点层级：完全手工布局，见 mapgenOutpost.ts genHousekeepingPost；
// 设定依据 wikidot Level 5 条目——M.E.G. Outpost「Housekeeping」驻扎于此）
import type { LevelDef } from '../core/types'

export const LHOUSEKEEPING: LevelDef = {
  id: 110, // 据点独立 id 空间（100+）：Level 5 的子层级，不占 LEVELS 数字下标
  name: 'M.E.G. 哨所「家政服务」',
  label: 'M.E.G. 哨所「家政服务」',
  flavor: '酒店综合楼深处一间亮着灯的小前哨：补给架、行军床与一张总被擦得很干净的桌子。M.E.G. 的前哨人员在这里登记死亡飞蛾的巢位。',
  palette: { floor: '#5e2f33', floorAlt: '#522a2e', wall: '#5a2e30', wallTop: '#402224', accent: '#d9b13b', light: '#ffd9a0', decal: '#462427' }, // v55c：与 L5 主层级统一（红金酒店调；accent 留 MEG 鲜黄点缀）
  gen: 'outpost',
  size: 80,
  entities: [], // 据点无敌对实体（居民是 NPC，不是实体）
  items: [],
  itemCount: [0, 0],
  structures: [], // 一切结构由生成器手工布置（无随机物品/容器）
  exits: [
    { kind: 'unlockeddoor', name: '哨所入口', dest: 'back', anim: 'bloom' },
  ],
  entrance: '走廊告示地标（Level 5）',
  exitDesc: '出口：哨所入口（返回 Level 5）。',
  lightDensity: 0,
  darkness: 0.1,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · M.E.G. 前哨',
  entryAnim: 'step',
}
