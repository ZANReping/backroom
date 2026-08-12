// M.E.G. Omega 基地（据点层级：完全手工布局，见 mapgenOutpost.ts genOmegaOutpost；
// 设定依据 wikidot/Fandom Level 4 条目——Omega 是 M.E.G. 在 Level 4 的主要基地，
// 杏仁水补给枢纽 + 档案与数据中心）
import type { LevelDef } from '../core/types'

export const LOMEGA: LevelDef = {
  id: 109, // 据点独立 id 空间（100+）：Level 4 的子层级，不占 LEVELS 数字下标
  name: 'M.E.G. Omega 基地',
  label: 'M.E.G. Omega 基地', // v54c：游戏内显示全名（内部 id 不变）
  flavor: '灯网整齐的办公楼层深处，M.E.G. 的主要基地。档案柜与数据阵列一眼望不到头——这里是全后室杏仁水流转的中枢。',
  // 贴 L4 办公风（配 l109_* 贴图：净白粉刷墙/浅灰方块地毯/粉刷吊顶——v54c 现代办公净白向）：净白墙 + 浅灰地毯 + MEG 鲜黄点缀
  palette: { floor: '#989085', floorAlt: '#8d857a', wall: '#dedad0', wallTop: '#c4c0b4', accent: '#d9b13b', light: '#f5efe0', decal: '#5a544a' },
  gen: 'outpost',
  size: 80,
  entities: [], // 据点无敌对实体（居民是 NPC，不是实体）
  items: [],
  itemCount: [0, 0],
  structures: [], // 一切结构由生成器手工布置（无随机物品/容器）
  exits: [
    { kind: 'unlockeddoor', name: '北部入口', dest: 'back', anim: 'bloom' },
    { kind: 'oldstairs', name: '年久失修的古典楼梯', dest: 5, anim: 'bloom' }, // 固定通往 Level 5（v54c：与 L4 同款古典楼梯，井口护栏+stairrail 碰撞）
    { kind: 'trapdoor', name: '旧活板门', dest: 6, anim: 'fall', fallDamage: 10 }, // 固定通往 Level 6（库房角落）
  ],
  entrance: '定居点地标（Level 4）',
  exitDesc: '出口：北部入口（返回 Level 4）；古典楼梯（楼梯间下行 →Level 5）；旧活板门（库房角落 →Level 6）。',
  lightDensity: 0, // 灯光全部手工布置
  darkness: 0.08,
  fullMap: true, // 进入即获得完整地图
  sd: 'Survival Difficulty: Class 宜居 · 安全 · M.E.G. 主要基地',
  entryAnim: 'step',
}
