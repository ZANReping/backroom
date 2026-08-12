// Tom 的餐馆（不属于任何团体的独立餐馆据点：家庭餐馆式手工布局，见 mapgenOutpost.ts genTomOutpost；
// 设定依据 wikidot 佐藤爱子——汤姆餐厅：Tom 主厨、爱子跑堂，食客来自各团体与散人）
import type { LevelDef } from '../core/types'

export const LTOM: LevelDef = {
  id: 104, // 据点独立 id 空间（100+）：Level 1 天鹰段的子层级，不占 LEVELS 数字下标
  name: 'Tom 的餐馆',
  label: 'Tom 的餐馆',
  flavor: '暖木地板、白桌布与锅里的咕嘟声。一家不属于任何团体的小餐馆——在这里，热汤就是硬通货。',
  palette: { floor: '#9a7a56', floorAlt: '#8f6f4e', wall: '#d9c6a6', wallTop: '#e4d4b6', accent: '#b04030', light: '#ffedd0', decal: '#7a6248' },
  gen: 'outpost',
  size: 80,
  entities: [], // 据点无敌对实体（居民与食客是 NPC）
  items: [],
  itemCount: [0, 0],
  structures: [],
  exits: [
    { kind: 'unlockeddoor', name: '北部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '东部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '西部入口', dest: 'back', anim: 'bloom' },
  ],
  entrance: '定居点地标（天鹰段）',
  lightDensity: 0,
  darkness: 0.08,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · 独立餐馆（不属于任何团体）',
  entryAnim: 'step',
}
