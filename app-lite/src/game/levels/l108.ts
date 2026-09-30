// 蓝色救赎（杰瑞的信众圣所据点：完全手工布局，见 mapgenOutpost.ts genBlueSalvation；
// v54；蓝白教堂风——信众在 Level 3 的圣所。准入门槛：jerry 声望 >30，见 engine/level.ts enterOutpost）
import type { LevelDef } from '../core/types'

export const LBLUE: LevelDef = {
  id: 108, // 据点独立 id 空间（100+）：Level 3 的子层级，不占 LEVELS 数字下标
  name: '蓝色救赎',
  label: '蓝色救赎',
  flavor: '蓝石墙把电站的嗡鸣挡在外面。白墙被蓝灯浸染，沙发上散落着抄经——这里更像一间安静的休息室。',
  // v54 休息室风：白色干墙观感（l108_wall 贴图不动，palette 近白高亮乘色拉回浅色调）+ 蓝色灯光（房间显蓝由灯光承担，不再用 tint 17）
  palette: { floor: '#9aa2c4', floorAlt: '#8e96b8', wall: '#f2efe8', wallTop: '#eef0f4', accent: '#4142a5', light: '#8ab0e8', decal: '#5a5f8a' },
  gen: 'outpost',
  size: 80,
  entities: [], // 据点无敌对实体（居民是 NPC，不是实体）
  items: [],
  itemCount: [0, 0],
  structures: [], // 一切结构由生成器手工布置（无随机物品/容器）
  exits: [
    { kind: 'unlockeddoor', name: '北部入口', dest: 'back', anim: 'bloom' }, // 返回 Level 3（outpostReturn）
  ],
  entrance: '定居点地标（Level 3）',
  lightDensity: 0, // 灯光全部手工布置
  darkness: 0.06,
  fullMap: true, // 进入即获得完整地图
  sd: 'Survival Difficulty: Class 宜居 · 安全 · 信众圣所',
  entryAnim: 'step',
}
