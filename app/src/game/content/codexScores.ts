// 图鉴评分数据表
// 层级：仿维基「新版层级等级组件」（component:nulevelclass）——逃离/环境/实体三个维度各 0–5 分，
// 等级取三者平均四舍五入；实体：仿 IETS 组件（component:iets）——威胁 0–5 + 智能 A–E。
import type { ItemDef } from './items'

export interface LevelScores {
  ext: number // 逃离难度 0–5
  env: number // 环境危险 0–5
  ent: number // 敌对实体存在 0–5
  cls?: string // 覆盖自动计算的等级文本（如「宜居」「待定」）
}

export const NLC_EXT_LABELS = ['确保逃离', '容易逃离', '略难逃离', '难以逃离', '极难逃离', '无路可逃']
export const NLC_ENV_LABELS = ['无环境风险', '低环境风险', '少量环境风险', '高环境风险', '极端环境风险', '死区']
export const NLC_ENT_LABELS = ['无敌对实体', '极少敌意存在', '少量敌意存在', '大量敌意存在', '极多敌意存在', '敌意侵袭']

/** 层级三维评分（键 = 玩家可见编号，即 displayId ?? id；101–105 为据点独立 id 空间） */
export const LEVEL_SCORES: Record<number, LevelScores> = {
  0: { ext: 1, env: 1, ent: 1 }, // 教学关卡
  1: { ext: 1, env: 1, ent: 2 }, // 宜居地带
  2: { ext: 3, env: 3, ent: 3 }, // 废弃公共带
  3: { ext: 3, env: 4, ent: 2 }, // 电站（电弧危险）
  4: { ext: 2, env: 2, ent: 1 }, // 废弃办公室
  5: { ext: 2, env: 2, ent: 3 }, // 恐怖酒店
  6: { ext: 5, env: 4, ent: 0, cls: '待定' }, // 零确认实体，却极少有人离开
  7: { ext: 4, env: 5, ent: 2 }, // 水域主导，极难离开
  8: { ext: 4, env: 4, ent: 4 }, // sd 原文：逃脱 4/5 · 环境 4/5 · 实体 4/5
  9: { ext: 5, env: 5, ent: 5 }, // 无任何已建立的基地或社区
  10: { ext: 2, env: 1, ent: 0 }, // sd 原文：逃脱 2/5 · 环境 1/5 · 敌对实体 0/5
  11: { ext: 2, env: 2, ent: 2 }, // 城市
  101: { ext: 0, env: 0, ent: 0, cls: '宜居' }, // Alpha 基地
  102: { ext: 0, env: 0, ent: 0, cls: '宜居' }, // B.N.T.G. 据点
  103: { ext: 0, env: 0, ent: 0, cls: '宜居' }, // 阿丽亚娜集团
  104: { ext: 0, env: 0, ent: 0, cls: '宜居' }, // 汤姆餐馆
  105: { ext: 0, env: 0, ent: 0, cls: '宜居' }, // EL3A 物流站
  274: { ext: 0, env: 0, ent: 1, cls: '宜居' }, // 杰瑞的房间（鹉主在上）
  601: { ext: 4, env: 3, ent: 3 }, // 终末（陷阱层）
}

/** 等级文本：缺省取三维平均四舍五入（与维基组件一致），可用 cls 覆盖 */
export function levelClassText(sc: LevelScores): string {
  return sc.cls ?? `${Math.round((sc.ext + sc.env + sc.ent) / 3)} 级`
}

/** nulevelclass 等级色板（class-0…5，源码原文数值） */
export const NLC_CLASS_COLORS = ['#f7e375', '#ffc90e', '#f59c00', '#f95a00', '#fe1701', '#af0606']

/** IETS 威胁等级（0–5）对应的边框/阴影色（与维基组件一致） */
export const IETS_CLASS_COLORS = ['#1b7a2c', '#58f846', '#d3ba00', '#ef9500', '#fe6e18', '#fd4545']

/** 实体智能等级（A 最高 … E 最低；缺省按 C 处理）。依据实体行为特性评估 */
export const ENTITY_INTEL: Record<string, string> = {
  faceling: 'C', // 无面灵
  smiler: 'C', // 笑魇
  hound: 'D', // 猎犬
  deathmoth: 'E', // 死亡飞蛾
  corpserat: 'D', // 尸鼠
  clump: 'D', // 团块
  carrier: 'D', // 运输车
  pipeworm: 'E', // 管道蠕虫
  soilworm: 'E', // 土壤蠕虫
  arms: 'E', // 手臂
  ferren: 'C', // 费伦
  jerry: 'B', // 鹉主杰瑞
  duller: 'C', // 钝人
  skinstealer: 'B', // 窃皮者（拟态成人）
  copierwraith: 'C', // 复印机幽灵
  seated: 'C', // 久坐者
  bellhop: 'B', // 侍者（假装中立、近身暴起）
  mirrorself: 'B', // 镜中人
  mimicry: 'B', // 模仿者（声音诱骗）
  tiny: 'D', // 微小
  thething: 'C', // 7 层之物
  wrangler: 'D', // 缠斗者
  camocrawler: 'D', // 迷彩爬行者
  lightguide: 'B', // 引路者（友善引路）
  wretch: 'C', // 残破者
  watcher: 'B', // 邻里守望·观察者
  strider: 'D', // 高个
  mangled: 'C', // 残破者众
  partygoer: 'B', // 派对客（设陷诱骗）
  windowent: 'D', // 窗口实体
  arcwraith: 'D', // 电弧体
  dryshrimp: 'E', // 旱虾（是否有智能可言都存疑）
  vendingmachine: 'C-', vmad: 'C-', // 人制品售货机
  nguithr: 'C', // Nguithr'xurh（精巧织网布陷阱）
  malady: 'E', // 疫疾（细菌本能传播，无智能可言）
}

// ---- IOTS 物品分类（完全对照 component:iots 的标准词汇与点数表；不渲染徽章组件本体） ----

/** IOTS 标准词汇（筛选器选项顺序即此顺序） */
export const IOTS_FREQ_VALUES = ['非常常见', '常见', '偶尔出现', '通常少见', '少见', '非常少见', '唯一', '未知'] as const
/** 罕见度配色（非常常见→唯一 由灰绿渐至紫，未知灰）——物品的显示稀有度即 IOTS 罕见度 */
export const IOTS_FREQ_COLORS: Record<string, string> = {
  非常常见: '#6f9a55', 常见: '#8fa04a', 偶尔出现: '#b8a03d', 通常少见: '#c98a3d',
  少见: '#c96a3d', 非常少见: '#b04a6a', 唯一: '#9a5fd0', 未知: '#8c887e',
}
export const IOTS_UTIL_VALUES = ['无实用性', '低实用性', '情境实用', '实用', '高实用性', '实用需监督', '高风险实用', '不建议使用', '未知'] as const
export const IOTS_ORIGIN_VALUES = ['层级限定', '多层级出现', '广泛分布', '极度分散', '交易流通', '人为制造', '实体相关', '事件相关', '前厅来源', '未知'] as const

/** 罕见度：游戏稀有度 → IOTS 标准词汇（默认映射；个例见覆盖表） */
const IOTS_FREQ_MAP: Record<string, string> = {
  common: '常见', uncommon: '偶尔出现', rare: '少见', epic: '非常少见',
}
/** 罕见度个例 */
const IOTS_FREQ_OVERRIDE: Record<string, string> = {
  almond: '常见', // 杏仁水：后室最流通的补给
  canned: '非常常见', bandage: '非常常见', battery: '非常常见', // 基础三件套
  tape: '非常少见', // 磁带：散落各层的胜利物品
}
/** 实用性个例（缺省按规则推导） */
const IOTS_UTILITY_OVERRIDE: Record<string, string> = {
  royalration: '高风险实用', // 成瘾 + 理智崩塌
  warpberry: '高风险实用', // 不可控传送
  thingmeat: '不建议使用', // 7 层之物的肉
  liquidpain: '不建议使用', // 液态痛苦：饮用致命（仅作武器使用）
  manmade: '不建议使用', // 人制品：高多巴胺成瘾食品
  tape: '情境实用', // 集齐 6 盘揭示真相（胜利条件）
  notebook: '低实用性', // 书写记录
  pamphlet: '不建议使用', // 信众宣传册——读了可能招来「教化」
  megfolder: '低实用性', welcomenote: '低实用性', endnote: '低实用性', // 文书类
  squirtgun: '情境实用', uvlamp: '情境实用', // 特殊场景装备
  friedshrimp: '高实用性',
}
/** 产地来源个例 */
const IOTS_ORIGIN_OVERRIDE: Record<string, string> = {
  thingmeat: '实体相关', // 7 层之物身上割下
  manmade: '实体相关', // 人制品售货机（Entity 36）的产品
  pamphlet: '实体相关', // 杰瑞的信众张贴（鹉主教义）
  candysilver: '交易流通', candybullet: '交易流通', candygun: '交易流通',
  candystanley: '交易流通', candywaste: '交易流通', candygenius: '交易流通', candymint: '交易流通', // Object 5：B.N.T.G. 糖果矿
  presses: '交易流通', eaglecoin: '交易流通', // BNTG 压印币 / MEG 天鹰币
  megfolder: '人为制造', welcomenote: '人为制造', endnote: '人为制造',
  friedshrimp: '人为制造', // Tom 餐厅加工
}

/** 物品的 IOTS 三栏分类：罕见度 / 实用性 / 产地来源（均为 IOTS 建议标准用语） */
export function itemIOTS(it: ItemDef): { frequency: string; utility: string; origin: string } {
  const frequency = IOTS_FREQ_OVERRIDE[it.type] ?? IOTS_FREQ_MAP[it.rarity ?? 'common'] ?? '未知'
  const utility = IOTS_UTILITY_OVERRIDE[it.type]
    ?? (it.throw === 'explode' || it.throw === 'shock' ? '高风险实用'
      : it.throw ? '情境实用'
      : it.use && ['eat', 'heal', 'sanity', 'bigsanity', 'cure'].includes(it.use) ? '高实用性'
      : it.use && it.use !== 'none' ? '实用'
      : it.equip || it.weapon ? '实用'
      : it.passive ? '低实用性'
      : '无实用性')
  const origin = IOTS_ORIGIN_OVERRIDE[it.type]
    ?? (it.unique !== undefined ? '层级限定' : it.anomalous ? '多层级出现' : '前厅来源')
  return { frequency, utility, origin }
}

/** IOTS 点数表（component:iots 原版） */
const IOTS_POINTS: Record<string, Record<string, number>> = {
  frequency: { 非常常见: 0, 常见: 0, 偶尔出现: 1, 通常少见: 1, 少见: 2, 非常少见: 2, 唯一: 3, 未知: 3 },
  utility: { 无实用性: 0, 低实用性: 0, 情境实用: 1, 实用: 1, 高实用性: 2, 实用需监督: 2, 高风险实用: 3, 不建议使用: 3, 未知: 3 },
  origin: { 前厅来源: 0, 人为制造: 0, 层级限定: 0, 多层级出现: 1, 广泛分布: 1, 交易流通: 1, 极度分散: 2, 实体相关: 2, 事件相关: 2, 未知: 3 },
}
/** IOTS 等级（1–5）：总点数 0–1→1 / 2→2 / 3–4→3 / 5–6→4 / 7–9→5 */
export function itemIOTSLevel(it: ItemDef): number {
  const c = itemIOTS(it)
  const pts = (IOTS_POINTS.frequency[c.frequency] ?? 3) + (IOTS_POINTS.utility[c.utility] ?? 3) + (IOTS_POINTS.origin[c.origin] ?? 3)
  return pts <= 1 ? 1 : pts === 2 ? 2 : pts <= 4 ? 3 : pts <= 6 ? 4 : 5
}

// ---- 阵营主题字体（参考后室中文维基各团体版式的字体设定；GF 不可得的字体名列前、已装则生效，否则回落） ----
export interface FactionFonts {
  header?: string // 版头
  title?: string // 标题
  body?: string // 正文
  mono?: string // 等宽
}
export const FACTION_FONTS: Record<string, FactionFonts> = {
  brc: { // 后室装修公司
    header: "'Share Tech Mono', '字魂扁桃体', 'Noto Sans SC', sans-serif",
    title: "'Anonymous Pro', '未来荧黑 Extended', 'Glow Sans SC Extended', 'Noto Sans SC', sans-serif",
    body: "'Anonymous Pro', '未来荧黑 Extended', 'Glow Sans SC Extended', 'Noto Sans SC', sans-serif",
    mono: "'PT Mono', 'Noto Sans SC', monospace",
  },
  bntg: { // 不结盟贸易集团
    header: "'Staatliches', 'ChillGSans', 'Noto Sans SC', sans-serif",
    title: "'Staatliches', 'ChillGSans', 'Noto Sans SC', sans-serif",
    body: "'PT Serif', 'Noto Serif SC', serif",
  },
  jerry: { // 杰瑞的信众
    header: "'Fantasque Sans Mono', 'Noto Sans SC', monospace",
    title: "'Fantasque Sans Mono', 'Noto Sans SC', monospace",
    body: "Metropolis, 'Proxima Nova', 'Noto Sans SC', sans-serif", // Proxima Nova 为商业字体，用风格相近的免费字体 Metropolis 代替
  },
}

/** 实体 → 所属阵营（图鉴实体页应用阵营主题：配色 + 字体 + 标志水印） */
export const ENTITY_FACTION: Record<string, string> = {
  jerry: 'jerry', // 鹉主杰瑞 → 杰瑞的信众
  ferren: 'bntg', // Ferren → 不结盟贸易集团
}

// ---- CECS 统合实体分类系统（component:cecs） ----
// 顺序与代码集与维基组件一致；全名来自 Pantheon/俄站官方文档（PSY 为中站新增，无官方全称）
export const CECS_ORDER = [
  'HVM', 'VRL-A', 'VRL-B', 'NCR', 'MCH', 'CBR', 'SYN', 'DMN', 'SSV', 'CVL',
  'RAD', 'NRO', 'TXC', 'PYR', 'RLA', 'UNQ', 'AGR', 'BNV', 'PSY',
] as const
export const CECS_NAMES: Record<string, string> = {
  'HVM': '蜂巢思维', 'VRL-A': 'A型病毒', 'VRL-B': 'B型病毒',
  'NCR': '坏死', 'MCH': '机械', 'CBR': '存在于电子系统',
  'SYN': '合成', 'DMN': '支配', 'SSV': '卑顺',
  'CVL': '开化', 'RAD': '放射性', 'NRO': '神经损害',
  'TXC': '毒性', 'PYR': '烧灼', 'RLA': '现实扭曲',
  'UNQ': '独特', 'AGR': '敌意', 'BNV': '善意',
  'PSY': '精神',
}

/** CECS 形态分级：中文名 + 图标键（CodexWidgets 按图标键画 SVG） */
export const CECS_CLASS_INFO: Record<string, { zh: string; icon: string }> = {
  Zoophoid: { zh: '动物', icon: 'paw' },
  Anthropoid: { zh: '类人', icon: 'person' },
  Spectrous: { zh: '虚灵', icon: 'ghost' },
  Chimeric: { zh: '诞妄', icon: 'merge' },
  Leviathan: { zh: '巨型', icon: 'mountain' },
  Itemic: { zh: '物品', icon: 'box' },
  MCH: { zh: '机械', icon: 'gear' },
  Enigmatic: { zh: '神秘', icon: 'question' },
  Floral: { zh: '植物', icon: 'leaf' },
  Bactal: { zh: '微生物', icon: 'cell' },
  Astronomical: { zh: '天体', icon: 'planet' },
  Godlike: { zh: '神性', icon: 'crown' },
  Endangered: { zh: '濒危', icon: 'shield' },
  Extinct: { zh: '灭绝', icon: 'skull' },
}
/** 危害类标签（矩阵中区别配色） */
export const CECS_HAZARD = new Set(['RAD', 'NRO', 'TXC', 'PYR'])

/** 实体形态分级（CECS class）：Zoophoid 动物型 / Anthropoid 类人 / Spectrous 无形体 /
 *  Chimeric 混合 / Leviathan 巨型 / Itemic 物品型 / Enigmatic 隐秘 */
export const ENTITY_CECS_CLASS: Record<string, string> = {
  hound: 'Anthropoid', deathmoth: 'Zoophoid', corpserat: 'Zoophoid', pipeworm: 'Zoophoid',
  soilworm: 'Zoophoid', tiny: 'Zoophoid', camocrawler: 'Zoophoid', ferren: 'Zoophoid', jerry: 'Zoophoid',
  dryshrimp: 'Zoophoid',
  faceling: 'Anthropoid', duller: 'Anthropoid', skinstealer: 'Anthropoid', bellhop: 'Anthropoid',
  mimicry: 'Anthropoid', seated: 'Anthropoid', wretch: 'Anthropoid', strider: 'Anthropoid',
  mangled: 'Anthropoid', partygoer: 'Anthropoid', wrangler: 'Anthropoid',
  smiler: 'Spectrous', arms: 'Spectrous', arcwraith: 'Spectrous', copierwraith: 'Spectrous',
  clump: 'Chimeric', thething: 'Leviathan',
  carrier: 'MCH', watcher: 'MCH', windowent: 'Itemic',
  mirrorself: 'Enigmatic', lightguide: 'Enigmatic',
  vendingmachine: 'Itemic', vmad: 'Itemic',
  nguithr: 'Zoophoid',
  malady: 'Enigmatic', // v55：疫疾（无形体的传染疾病）
}

/** 实体具备的 CECS 性质（键=实体 type） */
export const ENTITY_CECS: Record<string, string[]> = {
  faceling: ['BNV'], smiler: ['AGR'], hound: ['AGR'], deathmoth: ['AGR', 'HVM'], corpserat: ['NCR', 'AGR'],
  clump: ['AGR'], carrier: ['AGR'], pipeworm: ['AGR'], soilworm: ['AGR'], arms: ['AGR'],
  ferren: ['BNV'], jerry: ['PSY', 'DMN'], dryshrimp: ['BNV'], duller: ['AGR'], skinstealer: ['AGR'],
  copierwraith: ['AGR'], seated: ['BNV'], bellhop: ['AGR'],
  mirrorself: ['AGR', 'RLA'], mimicry: ['AGR', 'PSY'], tiny: ['AGR'], thething: ['AGR'],
  wrangler: ['AGR', 'RLA'], camocrawler: ['AGR'], lightguide: ['BNV'], wretch: ['AGR'],
  watcher: ['AGR'], strider: ['AGR'], mangled: ['AGR'], partygoer: ['AGR', 'VRL-A'],
  windowent: ['AGR'], arcwraith: ['AGR'],
  vendingmachine: ['NCR', 'MCH', 'NRO'], vmad: ['NCR', 'MCH', 'NRO'],
  nguithr: ['AGR', 'TXC'],
  malady: ['NCR', 'TXC'], // v55：疫疾（隐秘传播 · 毒性危害）
}
