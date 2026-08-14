// Level 6「Lights Out / 熄灯」：Wikidot 的无限黑暗走廊与 Fandom 的苔原/地下网络合并为双层无限地图。
import type { LevelDef } from '../core/types'

export const L6: LevelDef = {
  id: 6,
  name: '熄灯',
  sd: 'Survival Difficulty: Class Pending · 零确认实体 · 双层无限空间',
  flavor: '近黑天空压着无边苔原；冻土之下则是同样无边的发霉廊道。所有电子设备和非自然光源都会失灵，偶发的鸟鸣与风声也未必真实。',
  lore: 'Level 6 的地表是一片辽阔、贫瘠的苔原：枯灌木、巨石、晶簇、恶臭草地、塌陷深坑与刻着难辨字词的方尖碑散落在近黑天空下。脆弱冻土会把人送入地下——一张庞大的廊道网络，霉菌爬满墙面，锈蚀金属管道像 Level 2 一样整齐覆盖四壁。任何外带光源都不会在此产生光；官方记录没有确认实体。废弃楼梯井可以在两层间往返。',
  palette: {
    floor: '#26262a', floorAlt: '#212125', wall: '#2f2f34', wallTop: '#3a3a40',
    accent: '#4a4a52', light: '#3d4a52', decal: '#1a1a1e',
  },
  gen: 'darkhall',
  size: 160,
  infinite: true,
  lightMul: 0,          // 外带光源全部失效——不是变暗，是根本不发光
  noFlashlight: true,
  entryAnim: 'dark',
  containerBias: 0,
  sky: '#020305',
  entities: [],
  items: [
    { type: 'chalkstub', w: 14 },
    { type: 'rope', w: 8 },
  ],
  itemCount: [0, 1],
  structures: ['hotpipe', 'braille', 'deadshrub', 'tundrarock', 'crystalcluster', 'stinkgrass', 'obelisk', 'l6stairwell', 'l6cave'],
  exits: [
    { kind: 'seahatch', name: '传出微弱海浪声的深海锈蚀活板门', dest: 7, anim: 'iris', cutIn: 'fall' },
    { kind: 'cave8', name: '更像天然洞穴的地下洞口', dest: 8, anim: 'collapse', cutIn: 'crawl' },
  ],
  entrance: 'Level 5 黑门（地下）/ Level 4 活板门与 M.E.G. Omega 基地（地表废弃楼梯井旁）',
  exitDesc: '地表罕见传出海浪声的深海锈蚀活板门（→ Level 7）；地下罕见的自然洞穴（→ Level 8）。废弃楼梯井只负责地表与地下往返。',
  lightDensity: 0,
  darkness: 1,
}
