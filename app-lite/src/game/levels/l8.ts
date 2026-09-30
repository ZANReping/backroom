// Level 8「洞穴系统」层级定义
// 设定依据：The Backrooms Wiki（Wikidot）Level 8——该条目为 rewritten + featured，
// 拥有完整生态系统、5 个命名地标与 9 个组织，是本作 L6–L11 中素材最充足的一层。
import type { LevelDef } from '../core/types'

export const L8: LevelDef = {
  id: 8,
  name: '洞穴系统',
  sd: 'Survival Difficulty: Class 4 · 逃脱 4/5 · 环境 4/5 · 实体 4/5',
  flavor: '主体仍是近乎没有人工痕迹的天然喀斯特洞穴网络；只有第九大道路标和前段两处贴着岩层搭建的小型前哨打断黑暗。弯曲洞管、圆润洞肩、钟乳石与突兀裸岩在光束中显出潮湿而粗粝的层次。',
  lore: 'Level 8「洞穴系统」。一片没有已知边界、深度未知的封闭天然洞穴网络。纯天然喀斯特结构包含潜水管、渗流洞穴与断层室。钟乳石与石笋从洞顶、洞底和岩壁各个角度生长，化学检测证实其中的异常形状仍是天然矿物。温度多数区域 10–15°C，部分洞系可达 43°C 以上；氧气常常不足，部分区域含硫化氢、氯气、氨气。杏仁水在洞穴中自由流淌，在看不见的潮汐影响下混乱涨落，会造成突发性洪水。玩家抵达时会出现在一座深地下湖的南岸石滩，第九大道从这里开始，每五十米由 M.E.G. 路标指向下一段，最终抵达通往 Level 9 的整条洞口。大道前段固定分布着两个彼此邻近的小型据点：M.E.G.“空巢”前哨站负责庇护与指路，哈莫兹洞穴社群则提供洞穴经验、测绘与实验室分析；两个地标每层各只出现一次。四个命名生态地标：多维之路、罗特尼斯大丛林、新莫维勒窟与巨臂林地。——据 Backrooms Wikidot 整理。',
  palette: {
    floor: '#4a423a', floorAlt: '#413a33', wall: '#57503f', wallTop: '#665e4c',
    accent: '#7fd8c8', light: '#66e0d0', decal: '#2e2a24',
  },
  gen: 'caves',
  size: 160,
  infinite: true,
  lightMul: 1,      // L8 不再额外压暗手电与生态光源；黑暗来自无灯区本身
  lightSoft: 1.25,  // 发光菌/路标等有光区域获得足够的岩面漫反射层次
  entropy: 2.2,     // 熵效应：电池飞快耗尽、食物迅速腐败
  entryAnim: 'crawl',
  containerBias: 0.5,
  entities: [
    { type: 'wrangler', w: 6, min: 0, max: 1 },
    { type: 'camocrawler', w: 12, min: 1, max: 2 },
    { type: 'lightguide', w: 16, min: 2, max: 4 },
    { type: 'corpserat', w: 14, min: 2, max: 3 }, // v42：死亡鼠并入尸鼠（同一种群，成群 2~3）
    { type: 'arachnid', w: 13, min: 1, max: 4 },
    { type: 'deathmoth', w: 10, min: 1, max: 3 },
    { type: 'curabitur', w: 4, min: 1, max: 2 },
    { type: 'wretch', w: 9, min: 1, max: 2 },
    { type: 'smiler', w: 7, min: 0, max: 2 },
  ],
  items: [
    { type: 'cavingsuit', w: 6 },
    { type: 'driedfruit', w: 12 },
    { type: 'uvlamp', w: 8 },
    { type: 'stonekazoo', w: 5 },
    { type: 'fuyouyu', w: 1 }, // v32：福友玉——很小概率
  ],
  itemCount: [13, 18],
  structures: ['stalagspike', 'caveboulder', 'cavebank', 'caveglowpoints', 'cavebacteria', 'cavefern', 'cavemoss', 'fungalmat', 'handspike', 'bloodmoss', 'handweather', 'glowshroom', 'tarhands', 'roadsign', 'cavefloat', 'bonepile', 'crate', 'corpse'],
  exits: [
    { kind: 'ninthroad', name: '第九大道洞口', dest: 9, anim: 'collapse', cutIn: 'collapse' },
    { kind: 'l8vent', name: '罗特尼斯大丛林天顶通风口', dest: 2, anim: 'noclip', cutIn: 'crawl' },
  ],
  entrance: 'Level 6 地下廊道的天然洞口 / Level 7 午夜带海床的水下洞穴',
  exitDesc: '出口仅有两类：沿地下湖石岸开始的第九大道前进，每 50 米读取下一块 M.E.G. 路标，途中可在前段拜访“空巢”与哈莫兹洞穴社群，最终穿过末段收束的狭窄天然洞口抵达 Level 9；或攀入罗特尼斯大丛林天顶的锈蚀通风口返回 Level 2。',
  lightDensity: 0.006,
  darkness: 0.76,
}
