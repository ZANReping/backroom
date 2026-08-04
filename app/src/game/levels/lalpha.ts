// M.E.G. Alpha 基地（据点层级：完全手工布局，见 mapgenOutpost.ts；设定依据 wikidot Base Alpha）
import type { LevelDef } from '../types'

export const LALPHA: LevelDef = {
  id: 101, // 据点独立 id 空间（100+）：Level 1 的子层级，不占 LEVELS 数字下标
  name: 'M.E.G. Alpha 基地',
  label: 'Alpha 基地',
  flavor: '小径深处的一座城镇。灯光是暖的，门后有说话声——你有多久没听过人说话了？',
  palette: { floor: '#9a968c', floorAlt: '#8f8b82', wall: '#cfc8b8', wallTop: '#ddd6c6', accent: '#c9a03a', light: '#fff2d8', decal: '#6a6258' },
  gen: 'outpost',
  size: 80, // v35：布局坐标经 K=1.25 放大（见 mapgenOutpost.ts）
  entities: [], // 据点无敌对实体（居民是 NPC，不是实体）
  items: [],
  itemCount: [0, 0],
  structures: [], // 一切结构由生成器手工布置（无随机物品/容器）
  exits: [
    { kind: 'unlockeddoor', name: '北部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '东部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '西部入口', dest: 'back', anim: 'bloom' },
  ],
  entrance: '定居点地标',
  lightDensity: 0, // 灯光全部手工布置
  darkness: 0.06, // 明亮的室内基地（v35 提亮）
  fullMap: true, // 进入即获得完整地图（基地对居民完全开放）
  sd: 'Survival Difficulty: Class 宜居 · 安全 · M.E.G. 主要基地',
  entryAnim: 'step',
}
