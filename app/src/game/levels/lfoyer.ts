// 前厅（序章）：后室世界观中的「入口之前」——玩家自己的家（P1：第 0、1 幕）。
// 独立 id 900（据点独立 id 空间之外的序章编号，不占 LEVELS 下标、不进入图鉴/路线审计）；
// 手工布局见 world/foyerLayout.ts genFoyer；渲染见 renderer/foyerHome.ts；剧情/教程见 engine/foyer.ts。
import type { LevelDef } from '../core/types'
import { FOYER_ID } from '../world/foyerLayout'
import { FOYER_MAP_SIZE } from '../world/foyerStreetLayout'

export const LFOYER: LevelDef = {
  id: FOYER_ID,
  name: '前厅',
  label: '前厅',
  flavor: '23:40。屏幕的光照着你的脸。窗外的城市还亮着，所有东西都在它们该在的位置上——暂时。',
  lore: '「前厅」不是一个层级。它是你还在门的这一边时，最后看见的那个房间。',
  palette: { floor: '#9a8466', floorAlt: '#8e7a5e', wall: '#e6e0d2', wallTop: '#f2eee6', accent: '#d9a441', light: '#ffe6c4', decal: '#7a6a52' },
  gen: 'outpost',
  size: FOYER_MAP_SIZE, // M3：家 + 街区同一张有限地图
  entities: [],
  items: [],
  itemCount: [0, 0],
  structures: [],
  exits: [
    // 回程异常终点由 engine/foyerStreet.ts 调用本出口；M4 起为 RealityBreak 过场（components/RealityBreak.tsx），落地扣少量 HP。
    { kind: 'unlockeddoor', name: '坠落（回程异常终点）', dest: 0, anim: 'realitybreak', fallDamage: 6 },
  ],
  entrance: '新游戏',
  lightDensity: 0,
  darkness: 0.02,
  fullMap: true,
  sd: '前厅 · 23:40 · 安全',
  entryAnim: 'step',
}
