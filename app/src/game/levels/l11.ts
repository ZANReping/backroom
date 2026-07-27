// Level 11「The City That Never Sleeps / 不夜城」层级定义
// 设定依据：The Backrooms Wiki（Wikidot）现行版 Level 11（Class 2 / Safe / 约 129,500 人）。
// ⚠ 与已归档旧版「The Endless City」（Class 1、约 12,000 人）区分；本作采用现行版。
import type { LevelDef } from '../types'

export const L11: LevelDef = {
  id: 11,
  name: '不夜城',
  sd: 'Survival Difficulty: Class 2 · Safe / Unsecure / Low Entity Count · 人口约 129,500',
  flavor: '一座空荡的大都市。灯全亮着，暖气开着，水龙头有水——没有一个人。约三分之一的建筑不可摧毁、上锁、无法进入；大量窗户只是暗淡的黑色镀膜镜面，看不到室内。',
  lore: 'Level 11「The City That Never Sleeps」。一座空荡的大都市，建筑风格被明确描述为「极其平淡、毫不起眼」，道路呈街区方格排布。建筑高度从郊区的 3 层到高密度区的摩天楼，材质意象是「高耸的混凝土峭壁」；大量窗户不具功能性，呈暗淡的黑色镀膜镜面，看不到室内；约 1/3 的建筑不可摧毁、上锁、无法进入。可进入的建筑内部陈设稀疏，但电器完全可用——照明、暖气、水龙头至少可用。地铁系统沿地面路网无限延伸；运河与地铁布局平行，起止于工厂或船闸，从不通向海洋。停放的汽车全部没有燃料。街道外观会随时间改变，部分区域呈现比其他区域更旧的美学。整个 Level 11 完全自给自足：自行发电、供水、废物回收、生产食物；物资通过 no-clip 传送至工厂/仓库/商店/住宅，且只在无人观察时发生，无法被人眼或数字监控设备目击。「Level 11 Effect」使敌对实体更不倾向于攻击——但主动挑衅会解除这种被动状态。M.E.G. 研究总部 Base Beta 建于 2016 年初，经高架步道通往教学中心 Camp Amber；另有 The Capital（约 45,000 人，宽 5.5 英里，先民源自 Cahokia）、B.N.T.G. 的 New Times Square（使用专属货币 presses）、U.E.C. 的 Thebes（有围墙、仅一个重兵把守的入口）、The Lost 的 New New Amsterdam 等。——据 Backrooms Wikidot 整理。',
  palette: {
    floor: '#4a4d52', floorAlt: '#42454a', wall: '#6a6d72', wallTop: '#7b7e84',
    accent: '#c9d2da', light: '#ffe6b8', decal: '#2e3136',
  },
  gen: 'city',
  size: 88,
  sky: '#9aa2ab',
  pacify: 0.62,       // Level 11 Effect：敌对实体更不倾向于攻击（主动挑衅会解除）
  entryAnim: 'step',
  containerBias: 0.5,
  entities: [
    { type: 'faceling', w: 24, min: 3, max: 6 },   // 本层数量最多的实体
    { type: 'hound', w: 12, min: 1, max: 3 },
    { type: 'windowent', w: 8, min: 1, max: 2 },   // Entity 2：与通往 Level 12 的出口相关
    { type: 'duller', w: 6, min: 0, max: 2 },
    { type: 'deathmoth', w: 5, min: 0, max: 2 },
  ],
  items: [
    { type: 'presses', w: 14 },
    { type: 'pamphlet', w: 10 },
    { type: 'citywater', w: 14 },
  ],
  itemCount: [14, 19],
  structures: ['towerblock', 'blackwindow', 'shopfront', 'subwayent', 'arcadecab', 'megsign', 'streetlamp', 'car', 'vending', 'locker', 'crate', 'suitcase'],
  exits: [
    // 终局：把六盘磁带交给 Base Beta 的档案员 → 进入 Level 601
    {
      kind: 'basebeta', name: 'M.E.G. Base Beta（档案室）', dest: 12, anim: 'dawn', cutIn: 'step',
      req: { tapes: 6 }, reqText: '档案员要看齐六盘磁带才肯开门',
    },
    { kind: 'shopsign', name: '挂着陌生招牌的店面', dest: 'random', anim: 'iris' },
    { kind: 'groundclip', name: 'no-clip 穿过地面', dest: 'random', anim: 'noclip' },
  ],
  entrance: 'Level 9 的箭头路牌 / Level 10 的土路尽头',
  exitDesc: '出口密度接近无穷——原文称「清点无穷是不可能的任务」。可用：M.E.G. 标记与路牌的建筑（→ Level 115 / Base Beta 档案室）；各类店招（Mr. Holloway\'s Grand Exhibit → 126、Frivolous Frank\'s Fabulous Frozen Food → 55、Fun Zone → 20、Caspian\'s Antiques → 232、Papa Pedro\'s Pizza Palace of Pleasantries → 458）；霓虹密布的脏乱小巷（→ 138）；地面 no-clip（→ 178，常见）；街机柜（任何交互 → Level 25）；像窗户实体的窗户（→ Level 12）。',
  lightDensity: 0.012,
  darkness: 0.22,
}
