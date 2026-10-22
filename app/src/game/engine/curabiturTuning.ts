// 受眷鸟（Entity 37）重制 阶段 3：全部机制数值集中在这里。
// 纯常量文件，不引入任何模块：AI（engine/curabiturAI.ts）、生成（world/curabiturSpawn.ts，在 chunk worker 里运行）、
// 物品定义（content/curabiturItems.ts）、渲染（renderer/curabiturRender.ts）与验收脚本共用同一张表。

/** 游戏没有昼夜时钟：1 游戏小时按 30 秒实时折算（受眷胶「约 12 小时」= 6 分钟） */
export const GAME_HOUR_S = 30

export const CURABITUR = {
  // ---------- 悬浮 ----------
  /** 身体中心距洞顶的距离（米，乘个体缩放）——浮囊顶端约在身体中心上方 0.53m */
  hoverGap: 0.95,
  /** 身体中心距地面的最低高度（矮洞也不会贴地飞） */
  hoverMinAboveGround: 1.9,
  /** 受惊上升时距洞顶的距离 */
  fleeGap: 0.62,
  /** 垂直速度上限（米/秒） */
  climb: 0.9,
  /** 受惊上升的垂直速度上限 */
  fleeClimb: 2.2,
  /** 巡游：围绕栖点漫游的半径（米）与速度系数 */
  roamR: 3.2,
  roamSpeed: 0.22,

  // ---------- 对人类 ----------
  /** 玩家进入这个水平距离就受惊逃离（米） */
  avoidR: 4,
  /** 玩家在这个水平距离内时缓慢后退保持距离 */
  keepR: 7,
  /** 逃离：水平逃开的距离、最长持续时间、速度系数（×def.speed） */
  fleeDist: 9,
  fleeTime: 4.5,
  fleeSpeed: 1,
  /** 受击：hit 片段时长后转入逃离 */
  hitTime: 0.5,

  // ---------- 雌性：舌光诱捕 ----------
  /** 舌光吸引雄性死亡飞蛾的半径（米，三维距离，需要视线） */
  lureR: 7.5,
  /** 舌尖相对身体中心的位置（米，模型空间 +X 前 / +Y 上；乘个体缩放）——取自 curabiturMesh 的头/舌/肉球组 */
  lureTipFwd: 0.275,
  lureTipDown: 0.335,
  /** 飞蛾进入舌尖这个距离（= 动画 REACH 0.26m + 飞蛾半身 0.14m）就发动 strike */
  strikeSlack: 0.14,
  /** strike 咬合时刻仍需在这个距离内才算咬中（容许飞蛾在 0.38s 内小幅挣扎） */
  biteSlack: 0.3,
  /** 一次诱捕最长坚持（秒），之后休息 */
  lureMax: 45,
  /** 吞食时长（eat 片段 1.6s × 3 次） */
  eatTime: 4.8,
  /** 两次诱捕之间的间隔（秒） */
  lureCooldown: 14,
  /** 飞蛾被舌光吸引时绕舌尖盘旋的初始半径与收缩速度（米、米/秒） */
  lureOrbitR: 1.1,
  lureOrbitShrink: 0.22,
  /** 被诱飞蛾的垂直速度 */
  mothClimb: 1.7,

  // ---------- 雄性：散播孢子 ----------
  /** 散播间隔（秒，首轮随机 0–1 倍） */
  sporeInterval: 75,
  sporeJitter: 30,
  /** 每次散播真正落地成「受眷孢子」的数量（其余孢子是纯视觉粒子） */
  sporeDrop: 2,
  /** 孢子下落速度（米/秒）与水平漂移 */
  sporeFall: 0.45,
  sporeDrift: 0.12,
  /** 附近已有这么多落地孢子（8m 内）就不再新增可拾取孢子，避免堆积 */
  sporeLocalCap: 8,

  // ---------- 死亡 ----------
  /** 尸体在地上停留的秒数（death 片段 1.55s 落地） */
  corpseTime: 9,
  /** 击杀必掉受眷胶数量 */
  gelDrop: 1,

  // ---------- 生成 ----------
  /** 只在洞顶足够高（洞顶-地面）的空间生成（米） */
  minClearance: 4.4,
  /** 栖点下方地面以这个概率放一罐受眷胶（每个普通生成组判定一次） */
  roostGelChance: 0.12,
  /** 星群：每个 L8 区块的生成概率与数量 */
  swarmChance: 0.005,
  swarmMin: 12,
  swarmMax: 16,
  /** 星群成员散布半径（米） */
  swarmR: 3.2,
  /** 运行时判定「星群」：这个半径内同类数量 ≥ swarmDetect */
  swarmDetectR: 6,
  swarmDetect: 6,

  // ---------- 渲染/性能 ----------
  /** 全场最多给几只受眷鸟挂实时光源（按离玩家距离取最近） */
  maxBirdLights: 3,
  /** 超过这个距离停止动画；介于 animFullR 与 animStopR 之间降频 */
  animFullR: 16,
  animStopR: 34,
} as const

/** 受眷胶（光源） */
export const CURABITUR_GEL = {
  /** 一罐打开后的照明时长：12 游戏小时 */
  life: 12 * GAME_HOUR_S,
  /** 涂在近战武器上的发光时长：6 游戏小时（一罐涂一次） */
  coatLife: 6 * GAME_HOUR_S,
  /** 手持/放置时的光：参考荧光棒（r 1.8 / 强度 0.25 / #61ff67），略亮略大，黄绿色 */
  light: { r: 2.3, intensityMul: 0.32, color: '#b8ff60' },
  /** 涂层武器的光 */
  coatLight: { r: 1.7, intensityMul: 0.22, color: '#b8ff60' },
  /** 未开封（尸体掉落 / 巢下拾得 / 直接丢下）的罐子只发微光，不消耗 */
  sealedLight: { r: 1.0, intensityMul: 0.08, color: '#b8ff60' },
  /** 吸引雄性死亡飞蛾的半径（代价） */
  attractR: 5.5,
} as const

/** 受眷孢子 / 孢子驱蛾剂 */
export const CURABITUR_SPORE = {
  /** 设定：放置约 80 小时后腐解 */
  rotHours: 80,
  /** 折算：80 游戏小时再压缩 1/6（=400 秒，约 6.7 分钟），否则一局里几乎看不到腐解 */
  rotCompress: 1 / 6,
  /** 泼洒/腐解形成的腐液滩：驱蛾半径与持续时间（6 游戏小时） */
  puddleR: 6,
  puddleLife: 6 * GAME_HOUR_S,
  /** 腐液滩模型半径（米） */
  puddleMeshR: 0.38,
  /** 随身携带驱蛾剂时的小范围驱避 */
  carryR: 2,
  /** 地上未开封的驱蛾剂瓶的驱避半径（封口，只渗出一点气味） */
  bottleR: 2,
} as const

/** 孢子腐解所需秒数 */
export const SPORE_ROT_S = CURABITUR_SPORE.rotHours * GAME_HOUR_S * CURABITUR_SPORE.rotCompress

/** 物品 id */
export const CB_ITEM = {
  gel: 'curabiturgel',
  spore: 'curabiturspore',
  repellent: 'curabiturrepellent',
} as const
