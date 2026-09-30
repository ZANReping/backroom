// 丰饶角（阿尔戈斯之眼据点；Level 1 子层级）
import type { LevelDef } from '../core/types'

export const LCORNUCOPIA: LevelDef = {
  id: 116,
  name: '丰饶角',
  label: '丰饶角',
  flavor: '旧贸易大厅被改造成巡逻与问责据点。黄铜眼徽记下，任何证词都要留下记录。',
  palette: { floor: '#918d82', floorAlt: '#817d73', wall: '#bcb6a7', wallTop: '#d0c8b4', accent: '#9d9065', light: '#f2eee2', decal: '#665f50' },
  gen: 'outpost',
  size: 80,
  entities: [],
  items: [],
  itemCount: [0, 0],
  structures: [],
  exits: [
    { kind: 'unlockeddoor', name: '北部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '东部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '西部入口', dest: 'back', anim: 'bloom' },
  ],
  entrance: '定居点地标（丰饶角）',
  lightDensity: 0,
  darkness: 0.1,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · 阿尔戈斯之眼据点',
  entryAnim: 'step',
}
