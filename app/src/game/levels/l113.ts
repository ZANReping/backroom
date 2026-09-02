// M.E.G.“空巢”前哨站：嵌在 Level 8 岩层中的小型第九大道庇护点。
import type { LevelDef } from '../core/types'

export const LEMPTYNEST: LevelDef = {
  id: 113,
  name: 'M.E.G.“空巢”前哨站',
  label: 'M.E.G.“空巢”前哨站',
  flavor: '第九大道前段的一道岩缝后亮着几盏低功率营灯。天然洞壁间只有防潮铺板、行军床和路线图；这里的全部布置都为了让下一个流浪者活着走到下一块路标。',
  palette: { floor: '#504b42', floorAlt: '#3f3c36', wall: '#4b4943', wallTop: '#302f2d', accent: '#d5ad36', light: '#e7c486', decal: '#626056' },
  gen: 'outpost',
  size: 64,
  entities: [],
  items: [],
  itemCount: [0, 0],
  structures: [],
  exits: [{ kind: 'unlockeddoor', name: '第九大道入口', dest: 'back', anim: 'bloom' }],
  entrance: '“空巢”前哨站地标（Level 8 · 第九大道前段）',
  exitDesc: '出口：第九大道入口（返回 Level 8）。',
  lightDensity: 0,
  darkness: 0.19,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · M.E.G. 小型前哨',
  entryAnim: 'step',
}
