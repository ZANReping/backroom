// Level 10「Bumper Crop / 丰裕」层级定义
// 设定依据：The Backrooms Wiki（Wikidot）Level 10。全 wiki 少见的 Class 1 安全层，
// 本作把它设计成 L8/L9 高压之后的喘息层。
import type { LevelDef } from '../core/types'

export const L10: LevelDef = {
  id: 10,
  name: '丰裕',
  sd: 'Survival Difficulty: Class 1 · 逃脱 2/5 · 环境 1/5 · 敌对实体 0/5',
  flavor: '向四面八方无限延伸的小麦与大麦田，被成行的树木与灌木分割成一块块地块。天空是阴沉的铅灰色，没有太阳的位置，也没有影子告诉你现在几点。',
  lore: 'Level 10「Bumper Crop」。向四面八方无限延伸的小麦与大麦田，由成行的树木与灌木分割成一块块地块；树木与灌木始终保持同一高度，不会长高。天空阴沉、铅灰，没有明显的昼夜循环，永远维持不变的白昼光照；有短暂而稀少的小雨与雾，偶有阵风打破单调。多处湖泊位于统一的低洼标高，水质清澈、无藻类、可安全饮用，带泥土味余韵；土壤具疏水性，无法灌溉。建筑为小型木质棚屋与附属建筑，以及较大的谷仓与马厩，内部基本空置，只有木材与钉子。土路由两道车辙组成，中间夹一条草带——车辙暗示有汽车或拖拉机定期通行，但从未观察到任何车辆，且车辙不会被植被重新覆盖。土路上播下的种子无法发芽。唯一的实体是栖息于地表以下约 1 米的小型蠕虫状实体：向更深处挖掘会引发它们大量快速涌出，并存在钻入皮肤的风险。M.E.G. 仅将本层视为过境地点，且已因营养价值疑虑停止小麦收割作业。——据 Backrooms Wikidot 整理。',
  palette: {
    floor: '#8a7a42', floorAlt: '#7d6f3c', wall: '#3f4a30', wallTop: '#4a5638',
    accent: '#e8d34a', light: '#c8c4b0', decal: '#5a4e2a',
  },
  gen: 'field',
  size: 84,
  infinite: true,
  sky: '#8d9195',
  entryAnim: 'step',
  containerBias: 0.6,
  entities: [],
  items: [
    { type: 'wheatgrain', w: 16 },
    { type: 'nails', w: 12 },
    { type: 'timber', w: 10 },
  ],
  itemCount: [10, 15],
  structures: ['wheatpatch', 'hedgerow', 'barn', 'crate', 'toolbox', 'l10tree', 'l10shed', 'l10stable', 'l10outhouse', 'l10worksite', 'l10digsite', 'l10haybale'],
  exits: [
    { kind: 'longroad', name: '与车辙上的 Level 11 路牌交互', dest: 11, anim: 'dawn', cutIn: 'step' },
    { kind: 'lakeswim', name: '在深湖中下潜', dest: 7, anim: 'sink' },
  ],
  entrance: 'Level 9 田野边缘步道 / Level 11 乡间小路',
  exitDesc: '出口：沿双车辙土路长距离行进（→ Level 11）；在罕见深湖中心持续下潜（→ Level 7）。',
  lightDensity: 0.0,
  darkness: 0.04,
}
