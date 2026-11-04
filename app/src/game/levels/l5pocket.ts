// L5 恐怖旅馆 1c：两间口袋房间（只经 levelDefOf 解析，不进 ALL_LEVEL_DEFS——图鉴与路线审计不列出）。
// 117 野兽办公室：灯光同时闪烁后墙上浮出的木门（员工期把野兽与交易接到这里）。
// 118 大堂：极稀有的隐藏前厅；离开后迷雾重置、日志改写（见 engine/l5Hotel.ts hotelPocketAfterReturn）。
import type { LevelDef } from '../core/types'

const PAL = { floor: '#5e2f33', floorAlt: '#522a2e', wall: '#5a2e30', wallTop: '#402224', accent: '#b8924a', light: '#ffd9a0', decal: '#462427' }
const base = {
  gen: 'outpost' as const, size: 40, entities: [], items: [], itemCount: [0, 0] as [number, number], structures: [],
  lightDensity: 0, fullMap: true, entryAnim: 'step' as const,
}
export const LBEASTOFFICE: LevelDef = {
  ...base,
  id: 117,
  displayId: 5, // HUD 仍显示 Level 5（口袋房间是酒店的一部分）
  name: '办公室',
  label: '恐怖旅馆 · 办公室',
  flavor: '一间不在任何楼层平面图上的办公室：胡桃木书桌、一杯还冒着热气的茶。书桌后面坐着这里的主人；墙上他的画像比走廊里的都要清楚，而且会转眼睛。', // [beast] 阶段 3：不再是空椅
  palette: { ...PAL, floor: '#4a2e26', floorAlt: '#42291f', wall: '#4e5e48', wallTop: '#33402f' }, // 墨绿护墙 + 胡桃地板
  exits: [{ kind: 'unlockeddoor', name: '木门', dest: 'back', anim: 'bloom' }],
  entrance: '灯光同时闪烁时墙上浮出的木门（Level 5）',
  exitDesc: '出口：来时的木门（返回 Level 5）。',
  darkness: 0.25,
  sd: 'Survival Difficulty: Class ？ · 主人在', // [beast]
}
export const LLOBBY: LevelDef = {
  ...base,
  id: 118,
  displayId: 5,
  name: '大堂',
  label: '恐怖旅馆 · 大堂',
  flavor: '一尘不染的前厅。服务铃擦得发亮，前台后面的椅子空着。',
  palette: { ...PAL, floor: '#8a3a3e', floorAlt: '#7a3236', wall: '#e8dcc0', wallTop: '#c9b892' },
  exits: [{ kind: 'unlockeddoor', name: '大堂正门', dest: 'back', anim: 'bloom' }],
  entrance: '走廊里一扇门牌写着「大堂」的门（Level 5，极稀有）',
  exitDesc: '出口：大堂正门（返回 Level 5）。',
  darkness: 0,
  sd: 'Survival Difficulty: Class ？',
}
