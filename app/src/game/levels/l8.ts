// Level 8「Cave Systems / 洞穴系统」层级定义
// 设定依据：The Backrooms Wiki（Wikidot）Level 8——该条目为 rewritten + featured，
// 拥有完整生态系统、5 个命名地标与 9 个组织，是本作 L6–L11 中素材最充足的一层。
import type { LevelDef } from '../types'

export const L8: LevelDef = {
  id: 8,
  name: '洞穴系统',
  sd: 'Survival Difficulty: Class 4 · 逃脱 4/5 · 环境 4/5 · 实体 4/5',
  flavor: '纯天然的喀斯特洞穴网络，没有一处人工工程痕迹。岩刺从墙壁的各个角度混乱突出，有的打结、有的锯齿状扭折、有的末端分叉。你的百流明手电在这里只亮成一支蜡烛。',
  lore: 'Level 8「Cave Systems」。最初十二层中最后一个环境完全封闭的层级，约 60 英里长、2.5 英里半径，深度未知。纯天然喀斯特结构：潜流管道、渗流带洞穴、塌陷厅。岩刺（Stalagspikes）从墙壁各个角度混乱突出、向所有方向不规则倾斜，罕见的岩刺群会自然形成极精细的形状——八角柱、郁金香花苞、订书机，以及人手（连独一无二的指纹都有），化学检测证实纯属天然矿物。温度多数区域 10–15°C，部分洞系可达 43°C 以上；氧气常常不足，部分区域含硫化氢、氯气、氨气。杏仁水在洞穴中自由流淌，在看不见的潮汐影响下混乱涨落，会造成突发性洪水。本层特征性地黑暗且会主动削弱光：一支 100 流明的标准手电在这里只能发出约 12 流明。非欧几里得几何——同一条路走两遍会到达不同的地方；重力在洞厅之间乃至同一洞内变化。熵效应：时间流速不变，但食物迅速腐败、电池飞快耗尽、声音回响得更响、灯具比应有的更暗、路标以极快的速度风化。五个命名地标：Hyperspace Lane（23 条狭窄通道，发光细菌与真菌以杏仁水沉积物为食，引路者的原生栖息地，溪底有氙气玻璃珠）、Rottnest Jungle（独特的双向重力，天顶的尸鼠[旧称死亡鼠]群落，多彩生物发光蘑菇森林，中心有 Amor Incrementum 神庙）、New Movile Cave（足球场大小，化能合成生态，硫化氢浓度极高，停留上限约 1 小时）、Handyland（最大的单一洞穴网络，形似人类手臂与手掌的岩刺全部被血红色生物发光苔藓包裹，天顶极光投下昏暗暮色辉光，官方定级：最应回避）、The Hive（生存指南只给了一个词的建议：Pray）。M.E.G. Outpost「Hollow Nest」设于此，提供庇护与向导。——据 Backrooms Wikidot 整理。',
  palette: {
    floor: '#4a423a', floorAlt: '#413a33', wall: '#57503f', wallTop: '#665e4c',
    accent: '#7fd8c8', light: '#66e0d0', decal: '#2e2a24',
  },
  gen: 'caves',
  size: 86,
  lightMul: 0.12,   // 100 流明的手电在这里只有约 12 流明
  entropy: 2.2,     // 熵效应：电池飞快耗尽、食物迅速腐败
  entryAnim: 'crawl',
  containerBias: 0.5,
  entities: [
    { type: 'wrangler', w: 6, min: 0, max: 1 },
    { type: 'camocrawler', w: 12, min: 1, max: 2 },
    { type: 'lightguide', w: 16, min: 2, max: 4 },
    { type: 'corpserat', w: 14, min: 2, max: 3 }, // v42：死亡鼠并入尸鼠（同一种群，成群 2~3）
    { type: 'deathmoth', w: 10, min: 1, max: 3 },
    { type: 'wretch', w: 9, min: 1, max: 2 },
    { type: 'smiler', w: 7, min: 0, max: 2 },
    { type: 'clump', w: 6, min: 0, max: 2 },
  ],
  items: [
    { type: 'cavingsuit', w: 6 },
    { type: 'xenonmarble', w: 12 },
    { type: 'driedfruit', w: 12 },
    { type: 'uvlamp', w: 8 },
    { type: 'stonekazoo', w: 5 },
    { type: 'fuyouyu', w: 1 }, // v32：福友玉——很小概率
  ],
  itemCount: [13, 18],
  structures: ['stalagspike', 'handspike', 'glowshroom', 'tarhands', 'roadsign', 'campstall', 'bonepile', 'crate', 'corpse', 'ladder'],
  exits: [
    { kind: 'ninthroad', name: '第九之路（M.E.G. 标记路径）', dest: 9, anim: 'collapse', cutIn: 'collapse', fallDamage: 8 },
    { kind: 'tarpool', name: '焦油池', dest: 'random', anim: 'sink', fallDamage: 14 },
    { kind: 'ceilclip', name: '刻意向天顶 no-clip', dest: 'random', anim: 'noclip' },
  ],
  entrance: 'Level 7 Midnight Zone 边界的水下洞穴 / Level 4.1 的小型隧道',
  exitDesc: '出口：第九之路——一条有标记的路径，从来自 Level 6 的入口水池一路通到 Level 9 的出口，沿途穿过一系列「稳定之岛」，每约 50 米有一个带 M.E.G. 标志的路标，被认为是最安全的穿越方式；焦油池（→ Level 41 / 91，不可靠且不建议）；刻意向天顶 no-clip（→ Level 205）。另经 Rottnest Jungle 天顶的通风口可回 Level 2，但尸鼠（旧称死亡鼠）数量众多。',
  lightDensity: 0.006,
  darkness: 0.88,
}
