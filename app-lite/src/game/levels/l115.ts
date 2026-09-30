import type { LevelDef } from '../core/types'

export const LBETA: LevelDef = {
  id: 115,
  name: 'M.E.G. Beta基地',
  label: 'M.E.G. Beta基地',
  flavor: 'Camp Amber 的档案与研究总部，安静地守在高架步道尽头。',
  palette: { floor: '#8b8980', floorAlt: '#777873', wall: '#d8d2c0', wallTop: '#b7c5cc', accent: '#a6b8c1', light: '#e9e4d5', decal: '#59666d' },
  gen: 'outpost',
  size: 96,
  fullMap: true,
  pacify: 1,
  darkness: 0.09,
  entities: [],
  items: [],
  structures: [],
  itemCount: [0, 0],
  allExits: true,
  exits: [
    { kind: 'unlockeddoor', name: '返回不夜城', dest: 'back', anim: 'bloom' },
    { kind: 'basebeta', name: '返回 Level 601', dest: 12, anim: 'dawn', cutIn: 'step', req: { tapes: 6 }, reqText: '档案员要看齐六盘磁带才肯开门' },
  ],
  entrance: 'Level 11 M.E.G. 标记与高架步道',
  exitDesc: '出口：返回不夜城；档案员确认六盘磁带后通往 Level 601。',
  lightDensity: 0,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · M.E.G. 研究档案基地',
  entryAnim: 'step',
}
