// Level 9「The Suburbs / 郊区」层级定义
// 设定依据：The Backrooms Wiki（Wikidot）Level 9 + Entity 96 / Entity 63 条目。
import type { LevelDef } from '../core/types'

export const L9: LevelDef = {
  id: 9,
  name: '郊区',
  sd: 'Survival Difficulty: Class 5 · 无任何已建立的基地或社区',
  flavor: '一片无限延伸的、处于午夜时分的郊区。湿沥青上没有画路标线，落叶和水洼说明这里刚下过雨。房子看上去有家具而且相当新——只是永远没有电。',
  lore: 'Level 9「The Suburbs」。一片无限延伸的、处于午夜时分的郊区，黑暗程度与 Level 6 相似但危险性不及。房屋设计与尺寸各不相同、每一栋都完全不同，看上去有家具且相当新，但没有任何电源让照明系统工作；许多房屋带完整布置的后院。道路是湿的沥青路面，未画路标线，部分区域覆盖落叶，有水洼。多数路灯断电熄灭，部分会忽明忽暗地闪烁，少数甚至正常亮着（电源来源不明）。走得太远时会发现两栋房子诡异地互相「卡模」嵌套在一起。⚠ 起雾时立即离开当前街区——雾是 Entity 63「The Mangled」的生成机制。⚠ 避免使用电子设备；切勿把 Pockets（Object 51）带入本层，会立即引来 Entity 96「The Neighborhood Watch」。——据 Backrooms Wikidot 整理。',
  palette: {
    floor: '#1b1d22', floorAlt: '#212429', wall: '#2a2c31', wallTop: '#33363c',
    accent: '#e8b96a', light: '#ffcf8a', decal: '#12131a',
  },
  gen: 'suburb',
  infinite: true,
  size: 82,
  sky: '#05070f',
  entryAnim: 'collapse',
  containerBias: 0.55,
  entities: [
    { type: 'watcher', w: 10, min: 1, max: 2 },
    { type: 'strider', w: 9, min: 1, max: 2 },
    { type: 'skinstealer', w: 10, min: 1, max: 2 },
    { type: 'hound', w: 12, min: 1, max: 3 },
    { type: 'deathmoth', w: 8, min: 0, max: 2 },
    { type: 'wretch', w: 9, min: 1, max: 2 },
    { type: 'corpserat', w: 8, min: 0, max: 3 }, // v42：死亡鼠并入尸鼠
    { type: 'faceling', w: 6, min: 0, max: 2 },
  ],
  items: [
    { type: 'housekey', w: 12 },
    { type: 'battery', w: 10 },
  ],
  itemCount: [12, 17],
  structures: ['house', 'streetlamp', 'mailbox', 'picketfence', 'clipfuse', 'playpipe', 'l9watchsign', 'l9directionsign', 'l9tree', 'l9shrub', 'car', 'corpse', 'crate', 'fridge', 'suitcase'],
  exits: [
    { kind: 'arrowsign', name: '第九大道终点箭头路牌', dest: 11, anim: 'dawn', cutIn: 'step' },
    { kind: 'grasspath', name: '通往草地的步道', dest: 10, anim: 'bloom', cutIn: 'step' },
    { kind: 'l9caveback', name: '返回第九大道的石质洞口', dest: 8, anim: 'collapse', cutIn: 'step' },
  ],
  entrance: 'Level 5 深色木门（住宅门口） / Level 7 水域切出（后院泳池） / Level 8 第九大道洞口（道路尽头）',
  exitDesc: '出口：依次追踪 6～10 块箭头路牌，最后一块通往 Level 11；田野边缘道路尽头的小径通往 Level 10；道路尽头的石质洞口返回 Level 8 第九大道出口。',
  lightDensity: 0.0035,
  darkness: 0.86,
}
