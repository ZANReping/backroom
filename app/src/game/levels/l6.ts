// Level 6「Lights Out / 熄灯」层级定义
// 设定依据：The Backrooms Wiki（Wikidot）Level 6 为主结构；Fandom 版的加热液体金属管道
// 作为本层唯一的触觉导航线索被吸收进来（见 lore 标注）。
import type { LevelDef } from '../core/types'

export const L6: LevelDef = {
  id: 6,
  name: '熄灯',
  sd: 'Survival Difficulty: Class Pending · 零确认实体 · 却极少有人成功离开',
  flavor: '无尽延伸的狭窄走廊，墙是光滑冰冷的混凝土。这里不是「没有灯」——是光本身被禁止：手电、火柴、荧光棒进入本层后都不再产生任何光。安静得像一间消音室。',
  lore: 'Level 6「Lights Out」。一系列极其狭窄的走廊，材质单一、光滑而冰冷（很可能是混凝土）。彻底的黑暗：任何外带光源在本层都不发光。极端寂静，正文形容为「如同消音室」。官方记录没有在本层发现任何实体——但档案里有一名重伤幸存者，缺一只眼球、胸口有创伤、一条腿骨折，声称在黑暗中遭到「类人」袭击者攻击。已知社区两个：「世界最安静的房间」（一条走廊，据说只住着一个人，声称找到了电灯开关，会不断恳求来访者去拨动它——官方警告：不要拨），以及「Mimicry」（约四人，掌握包括人声在内的完美声音模仿能力；档案明确写着他们自己也清楚自身构成威胁，应当回避）。⚠ 走错方向可能永久封死通往 Level 7 的路，以及回 Level 5 的入口。——据 Backrooms Wikidot 整理；沿墙走的加热液体金属管道取自 Fandom 版本层。',
  palette: {
    floor: '#26262a', floorAlt: '#212125', wall: '#2f2f34', wallTop: '#3a3a40',
    accent: '#4a4a52', light: '#3d4a52', decal: '#1a1a1e',
  },
  gen: 'darkhall',
  size: 66,
  lightMul: 0,          // 外带光源全部失效——不是变暗，是根本不发光
  noFlashlight: true,
  entryAnim: 'dark',
  containerBias: 0.75,  // 本层几乎没有散落补给，能拿到的东西都在前人留下的东西里
  entities: [
    // Wikidot：零确认实体。此处只放「Mimicry」社区成员——它们在档案中被明确标注为威胁。
    { type: 'mimicry', w: 20, min: 2, max: 4 },
  ],
  items: [
    { type: 'chalkstub', w: 14 },
    { type: 'rope', w: 8 },
  ],
  itemCount: [5, 8],
  structures: ['hotpipe', 'braille', 'tripwire', 'corpse', 'crate', 'graffiti'],
  exits: [
    { kind: 'seastairs', name: '通向海浪声的楼梯井', dest: 7, anim: 'iris', cutIn: 'fall' },
    { kind: 'coldgate', name: '极冷的巨大金属门', dest: 'random', anim: 'shutter' },
    { kind: 'wiretrip', name: '绊线（Level 6.1）', dest: 'random', anim: 'noclip' },
  ],
  entrance: 'Level 5 的锅炉房 / Level 4 Base Omega 附近',
  exitDesc: '出口：向下走并倾听微弱的海浪声，找到楼梯井（→ Level 7）；罕见的、摸上去极度冰冷的巨大金属门（→ Level 129）；意外绊到线（→ Level 6.1）。⚠ 走错方向可能永久封死通往 Level 7 的路。',
  lightDensity: 0,
  darkness: 1,
}
