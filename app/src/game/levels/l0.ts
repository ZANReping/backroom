// Level 0「教学关卡」层级定义（v17：无限 chunk 生成；内部 id 仍为 0）
import type { LevelDef } from '../types'

export const L0: LevelDef = {
  id: 0,
  name: '教学关卡',
  flavor: '病态黄的墙纸，潮湿地毯，荧光灯持续嗡鸣。这里一望无际、没有实体——学会活下去，然后找到那扇闪烁的门。',
  lore: 'Level 0「Threshold」。无限延伸的办公后间式迷宫：黄色墙纸、浸水的 Berber 地毯与嗡鸣荧光灯。存在拱门房、柱厅、深坑、停电区、马尼拉室与红房间等异常区域；「孤立效应」使同行者失散。实体未经官方确认——本层绝迹。出口只有罕见的闪烁的门。——据 Backrooms Wikidot/Fandom 整理',
  palette: { floor: '#b8a548', floorAlt: '#a9973f', wall: '#c9b458', wallTop: '#8a7a33', accent: '#8a7a33', light: '#fff6d8', decal: '#9c8c3c' },
  gen: 'rooms',
  size: 64, // 有限模式忽略；无限模式仅作兼容占位
  infinite: true, // v17：无边界无限 chunk 流式生成
  entities: [], // 官方设定：实体未经确认——本层实体绝迹（低理智幻影=幻觉，非实体）
  items: [
    { type: 'wallpaper', w: 14 },
    { type: 'glowstick', w: 12 },
  ],
  containerBias: 0.35,
  sd: 'Survival Difficulty: Class 1 · Safe / Secure / Unconfirmed Entities',
  itemCount: [10, 14], // 有限模式忽略；无限模式按 chunk 生成
  structures: ['lightgrid', 'wet', 'graffiti', 'crate', 'corpse', 'ladder'],
  exits: [
    // 唯一出口：墙壁上罕见地闪烁的门（灯光/门框闪烁），进入 → L1
    { kind: 'flickerdoor', name: '闪烁的门', dest: 1, anim: 'bloom' },
  ],
  entrance: '天花板坠落',
  exitDesc: '出口：罕见的「闪烁的门」——灯光与门框疯狂闪烁，穿过即达 Level 1。在无限迷宫中它以较大区域为保底稀有刷新；远处跟着电流声与气流走。马尼拉室常在出口附近作为喘息点。',
  lightDensity: 0.012,
  darkness: 0.55,
}
