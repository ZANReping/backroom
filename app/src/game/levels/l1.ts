// Level 1「宜居地带」层级定义（v29：无限 chunk 生成；设定对齐 wikidot「宜居地带」与 Fandom）
import type { LevelDef } from '../types'

export const L1: LevelDef = {
  id: 1,
  name: '宜居地带',
  flavor: '地下停车场与废弃仓库的无尽缝合体。天鹰段的漏水水管滴个不停，跃金段彩灯落在板条箱上，哥特段拱廊幽深，衔尾段永不停工，花园段阳光正好——千万别久留。',
  lore: 'Level 1「Habitable Zone」。闷热（30–35°C）的非欧几里得空间，由诸多区段缝合而成：最常见的天鹰段形似停车场，从 Level 0 切入总会落在这里；跃金段更像仓库，照明斑斓、板条箱成群；哥特段充斥圆形拱门与圆柱；衔尾段永无止境地施工；花园段青翠明媚，却会让进入者患上「植殖癌」——行为僵硬、视野变绿，最终化为一株植物。狭窄如迷宫的维护通廊灯火通明，墨黑色金属门通往各个区段。天鹰、跃金、哥特三段不时发生「闪烁」：所有光源随机切断，实体倾巢而出——笑魇在黑暗中现身扑向光源，天花板通风管里的手臂也悄然垂下。确认实体：钝人、猎犬、肢团、悲尸、笑魇、手臂。——据 Backrooms Wikidot/Fandom 整理',
  palette: { floor: '#5e5e62', floorAlt: '#545458', wall: '#78787c', wallTop: '#8a8a8e', accent: '#e8e8e0', light: '#d9c39a', decal: '#2e2e30' },
  gen: 'garage',
  size: 72, // 有限模式忽略；无限模式仅作兼容占位
  infinite: true, // v29：无边界无限 chunk 流式生成
  entities: [
    // v33：L1 限定实体——钝人/猎犬/肢团/悲尸（笑魇为停电专属生成、手臂随天花板通风管生成，均不入池）
    { type: 'duller', w: 14, min: 2, max: 3 },
    { type: 'hound', w: 12, min: 1, max: 2 },
    { type: 'wretch', w: 10, min: 1, max: 2 },
    { type: 'clump', w: 8, min: 0, max: 2 },
  ],
  items: [
    { type: 'carkey', w: 12 },
    { type: 'gas', w: 10 },
  ],
  itemCount: [10, 14], // 有限模式忽略；无限模式按 chunk 生成
  structures: ['pillar', 'car', 'booth', 'graffiti', 'crate', 'corpse', 'vent', 'ceilvent', 'toolbox', 'locker', 'suitcase', 'rebar', 'pipes', 'vaultcol', 'scaffold', 'roadblock', 'inkdoor', 'wheatpatch', 'hedgerow', 'glowshroom'],
  containerBias: 0.5,
  sd: 'Survival Difficulty: Class 1 · 安全稳定 · 存在异常资源',
  exits: [
    // 仅两种出口，均通往 Level 2（v29：取消货运电梯与返回 L0 的楼梯间；
    // 每个超区域轮换出现其中一种——返程 L0 只走「向上的灰色阶梯」，见 L0 罕见出口机制）
    { kind: 'stairs', name: '楼梯井', dest: 2, anim: 'bloom' },
    { kind: 'unlockeddoor', name: '未上锁的门', dest: 2, anim: 'bloom' },
  ],
  entrance: '闪烁的墙壁',
  exitDesc: '出口：楼梯井或未上锁的门——每个区域轮换出现其中一种，均通往 Level 2。停电或「闪烁」发生时可退入维护通廊避难：狭窄如迷宫的白色走廊灯火通明，墨黑色金属门通往各个区段。',
  lightDensity: 0.008,
  darkness: 0.7,
  lightSoft: 1.6, // v29：无限化后保底密排灯 + 深色调色板补偿（palette 偏暗，亮度系数上调）
}
