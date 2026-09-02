// 哈莫兹洞穴社群：保留 Level 8 天然岩层、与“空巢”相邻的小型洞穴基地。
import type { LevelDef } from '../core/types'

export const LHAMMOZ: LevelDef = {
  id: 114,
  name: '哈莫兹洞穴社群',
  label: '哈莫兹洞穴社群',
  flavor: '防水帆布与测绘绳只占据洞室的一角，天然岩壁仍从实验台背后弯入低矮洞顶。这里既像一座维多利亚式岩洞考察营，也像一间塞进岩层里的现代实验室。',
  palette: { floor: '#4b4a43', floorAlt: '#373a36', wall: '#454944', wallTop: '#292d2b', accent: '#8ca38e', light: '#c8c7a1', decal: '#5b655d' },
  gen: 'outpost',
  size: 64,
  entities: [],
  items: [],
  itemCount: [0, 0],
  structures: [],
  exits: [{ kind: 'unlockeddoor', name: '洞穴社群入口', dest: 'back', anim: 'bloom' }],
  entrance: '哈莫兹洞穴社群地标（Level 8 · “空巢”邻近洞室）',
  exitDesc: '出口：洞穴社群入口（返回 Level 8）。',
  lightDensity: 0,
  darkness: 0.17,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · 洞穴研究基地',
  entryAnim: 'step',
}
