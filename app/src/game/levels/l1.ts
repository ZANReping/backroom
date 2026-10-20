// Level 1「宜居地带」层级定义（v29：无限 chunk 生成；设定对齐 wikidot「宜居地带」与 Fandom）
import type { LevelDef } from '../core/types'

export const L1: LevelDef = {
  id: 1,
  name: '宜居地带',
  flavor: '无尽的地下空间由五个区段缝合而成。天鹰段像空旷的停车层却没有车辆，跃金段白色工业大厅堆放着板条箱，哥特段拱廊幽深，衔尾段永不停工，花园段阳光正好——千万别久留。各区段的门后还分布着白刷砖墙的窄廊与侧室，普通时有照明，却并不永亮。',
  lore: 'Level 1「Habitable Zone」。闷热（30–35°C）的非欧几里得空间，由五个区段缝合而成：天鹰段是最常见的开阔停车层，从 Level 0 切入总会落在这里；跃金段是挑高的工业仓储厅，白墙与裸露风管间点缀着彩色标识，照明充足、板条箱成群；哥特段的粗圆柱向上展开，连成绵延的曲面拱顶；衔尾段永无止境地施工；花园段的混凝土柱林缠满藤蔓，地被青翠、日光斑驳，却会让进入者患上「植殖癌」——约 300 秒后异变致命，离开花园段后症状才逐渐消退。各区段之间由有方向的过道衔接，距离会被空间拉长或压缩；区段门后分布着相对安全的白刷砖墙窄廊与侧室，普通时有中性白照明但并非永亮，门外实体仍可能追入。停电会影响花园、衔尾与这些小径，持续约 45–90 秒，之后以随机 5–10 分钟间隔重现并有短暂预警；入口保留微弱绿色应急标识，携带或投掷的光源仍有效，小径本身不会直接生成停电追猎实体。距离异常会减弱，过道约为正常的 0.72–1.35 倍，小径维持正常尺度。板条箱在视野外会低频变化，停电后变化更明显；正在交互或存有玩家物品的箱子受保护，同一箱搜刮后不会刷新。确认实体：钝人、猎犬、肢团、悲尸、窃皮者、笑魇、手臂。——据 Backrooms Wikidot/Fandom 整理',
  palette: { floor: '#5e5e62', floorAlt: '#545458', wall: '#78787c', wallTop: '#8a8a8e', accent: '#e8e8e0', light: '#d9c39a', decal: '#2e2e30' },
  gen: 'garage',
  size: 72, // 有限模式忽略；无限模式仅作兼容占位
  infinite: true, // v29：无边界无限 chunk 流式生成
  entities: [
    // v33：L1 限定实体——钝人/猎犬/肢团/悲尸/窃皮者（v77）（笑魇为停电专属生成、手臂随天花板通风管生成，均不入池）
    { type: 'duller', w: 14, min: 2, max: 3 },
    { type: 'hound', w: 12, min: 1, max: 2 },
    { type: 'wretch', w: 10, min: 1, max: 2 },
    { type: 'clump', w: 8, min: 0, max: 2 },
    { type: 'skinstealer', w: 6, min: 0, max: 1 }, // v77：wikidot Entity 10 最常见层级之一；权重低于猎犬
  ],
  items: [
    { type: 'carkey', w: 12 },
    { type: 'gas', w: 3 }, // 火油桶：比火盐晶体更稀有（经角落生成的火盐更易得）
    { type: 'jerryflyer', w: 2 }, // 重制杰瑞：信众把传单撒到 Level 1，引新人下到 Level 2 的宣传间
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
  exitDesc: '出口：楼梯井或未上锁的门——每个区域轮换出现其中一种，均通往 Level 2。各区段门后分布着白刷砖墙的窄廊与侧室，普通时有照明但并非永亮；停电时入口仍留有微弱绿色应急标识，携带或投掷的光源依旧有效。小径相对安全，不会直接生成停电追猎实体，但门外的实体可能追入。',
  lightDensity: 0.008,
  darkness: 0.7,
  lightSoft: 1.6, // v29：无限化后保底密排灯 + 深色调色板补偿（palette 偏暗，亮度系数上调）
}
