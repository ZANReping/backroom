// Level 11「The City That Never Sleeps / 不夜城」层级定义
// 设定依据：The Backrooms Wiki（Wikidot）现行版 Level 11（Class 2 / Safe）。
// ⚠ 与已归档旧版「The Endless City」（Class 1、约 12,000 人）区分；本作采用现行版。
import type { LevelDef } from '../core/types'

export const L11: LevelDef = {
  id: 11,
  infinite: true,
  name: '不夜城',
  sd: 'Survival Difficulty: Class 2 · Safe / Unsecure / Low Entity Count · 无人城市，实体生态稀疏',
  flavor: '始终是白天，晴朗、多云、阴雨或薄雾天气在无限街道间变化。灯光、暖气与供水仍在运行；混合路网穿过多中心街区、运河与公园。约三分之一建筑始终封闭，深色镀膜窗后看不到室内。',
  lore: 'Level 11「The City That Never Sleeps」是一座平淡、空荡而无限延伸的现代都市：不同朝向的街区、混凝土高楼、可用的灯光暖气与自来水构成了近乎正常的城市幻觉。地铁、运河、道路和公园彼此连接，城市设施仍在运转，物资只在无人观察时悄然补入；Level 11 Effect 使实体较少主动攻击。',
  palette: {
    floor: '#4a4d52', floorAlt: '#42454a', wall: '#6a6d72', wallTop: '#7b7e84',
    accent: '#c9d2da', light: '#ffe6b8', decal: '#2e3136',
  },
  gen: 'city',
  size: 160,
  sky: '#9aa2ab',
  pacify: 0.9,
  entryAnim: 'step',
  containerBias: 0.5,
  entities: [
    { type: 'faceling', w: 24, min: 3, max: 6 },   // 本层数量最多的实体
    { type: 'hound', w: 12, min: 1, max: 3 },
    { type: 'duller', w: 3, min: 0, max: 1 },
    { type: 'deathmoth', w: 2, min: 0, max: 1 },
  ],
  items: [
    { type: 'presses', w: 14 },
    { type: 'pamphlet', w: 10 },
    { type: 'citywater', w: 14 },
  ],
  itemCount: [0, 0],
  structures: ['l11building', 'l11prop', 'l11landmark', 'streetlamp', 'car', 'vending', 'locker'],
  exits: [
    { kind: 'l11roadback', name: '郊区回程公路', dest: 9, anim: 'bloom', cutIn: 'step' },
    { kind: 'countrypath', name: '城市边缘乡间小路', dest: 10, anim: 'bloom', cutIn: 'step' },
    { kind: 'basebeta', name: '公共档案馆的封条木门', dest: 12, anim: 'bloom', cutIn: 'step' },
    { kind: 'l11unfinisheddoor', name: '未完工混凝土楼门', dest: 1, anim: 'bloom', cutIn: 'step' },
    { kind: 'l11liftshaft', name: '未完工楼体电梯井', dest: 2, anim: 'fall', cutIn: 'fall' },
    { kind: 'l11brickdoor', name: '铁栅窗砖楼门', dest: 3, anim: 'bloom', cutIn: 'step' },
    { kind: 'l11officedoor', name: '上层办公间门', dest: 4, anim: 'bloom', cutIn: 'step' },
  ],
  entrance: 'Level 9 箭头公路 / Level 10 乡间小路',
  exitDesc: '郊区回程公路通往 Level 9；城市边缘乡间小路通往 Level 10。在未完工混凝土楼、铁栅窗砖楼和上层办公间可发现通往其他层级的罕见出口，未完工楼体电梯井可能坠入另一层。起始城区的无人公共档案馆内有一扇封条木门，提交六盘磁带后拆封，第二次交互可通往 Level 601。在运河深处停留较久可能被带往 Level 7；可寻找岸边登岸梯返回步道。',
  lightDensity: 0.012,
  darkness: 0.12,
}
