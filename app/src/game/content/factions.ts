// 团体（Faction）与声望/任务系统：
// 每个 NPC 与据点都有所属团体；玩家与各团体间有声望（流浪者自身不参与声望）。
// 声望档位：>=80 交易优惠 / <=-30 拒绝交易 / <=-60 拒绝交谈 / <=-90 禁止进入其据点。
// MEG 委派任务由探险署（中控室）发放与交付，类型：层级调查/现象调查/实体调查/提交物品。
import { PHENOMENA } from './phenomena'
import { ENTITIES } from '../entities'
import { ITEMS } from './items'
import { OUTPOSTS } from './outposts'

export interface FactionDef {
  id: string
  name: string // 中文名
  en: string // 英文名（缩写）
  desc: string
  hasRep: boolean // 是否有声望系统（流浪者没有）
  color: string // 主题色（图鉴边框、对话窗边框、选中项边框）
  sub?: string // 副主题色（图鉴/对话/HUD 的团体相关文字色；缺省=主题色）
  logo?: string // 图鉴团体页标志图（public/textures/ 下文件名；缺省不显示）
}

export const FACTIONS: Record<string, FactionDef> = {
  meg: {
    id: 'meg', name: '探险者总署', en: 'The M.E.G.',
    desc: '后室中最大的人类组织之一，致力于探索、记录与保护。Alpha 基地是其最古老的主要基地——训练新干员、救援新切入的流浪者，并试图找到出口。',
    hasRep: true, color: '#a5a45a', logo: 'faction_meg.png',
  },
  bntg: {
    id: 'bntg', name: '不结盟贸易集团', en: 'The B.N.T.G.',
    desc: '「繁荣缔造和平」。由商人和雇佣兵组成的松散贸易联盟：统一贸易渠道、恪守中立，构建了后室的伪经济系统。总部位于 Level 1 跃金地段的商人之家，中心是后室最大的集中式存储设施「交易保险库」。',
    hasRep: true, color: '#566c5a', sub: '#44754d', logo: 'faction_bntg.png',
  },
  ariane: {
    id: 'ariane', name: '阿丽亚娜集团', en: 'The Ariane Circle',
    desc: '由希波克拉底团队等八支专业团队联合而成的法语团体，各团队在细分领域具有极高专业水准，以团结一致的精神为流浪者的安全而奋斗。希波克拉底团队由外科医师与医学/生物学研究人员组成，致力于异常生物学研究与医疗救助，总部位于 Level 1 哥特段的洁白研究所「希波克拉底 - 1」。',
    hasRep: true, color: '#8676e2', sub: '#a29fb2', logo: 'faction_ariane.png',
  },
  brc: {
    id: 'brc', name: '后室装修公司', en: 'Backrooms Remodeling Co.',
    desc: '军事化的筑房/改造公司，员工是浑身漆黑、没有五官的人形实体——淡蓝搭扣风衣、红肩铠、白围裙、深灰军式贝雷帽（金属徽章按级别分铜/银/金）。他们旅行的唯一目的是「重塑」后室中的区域，而这些尝试往往以灾难告终：被「装修」完的部分会从层级上分裂出去成为子层。Level 1 的衔尾段是他们永不停工的施工现场。员工沉默、无害、从不停手——但请不要提醒他们「你的同事受伤了」。',
    hasRep: true, color: '#4f4c7a', sub: '#d3ae00', logo: 'faction_brc.png',
  },
  wanderer: {
    id: 'wanderer', name: '流浪者', en: 'Wanderers',
    desc: '切入后室、在各个层级间漂泊求生的人们。没有统一的组织，彼此之间靠地标、电台与口耳相传的档案维系微弱的联系。你属于他们。',
    hasRep: false, color: '#b8b8b8', logo: 'faction_wanderer.png',
  },
  jerry: {
    id: 'jerry', name: '杰瑞的信众', en: 'The Followers Of Jerry',
    desc: '崇拜鹉主「杰瑞」（Entity 7，一只蓝色鹦鹉）的宗教组织。信众相信杰瑞是后室中最伟大的存在，四处张贴海报传播教义，并试图「教化」每一位靠近的流浪者。他们在 Level 2 的废弃公共带里布置宣传间，而圣地「杰瑞的房间」（Level 274）只有足够虔诚的访客才被允许引路进入——在那里，鹉主本人就栖息于穹顶大厅的栖木之上。注意：非议杰瑞会立刻招来敌意。',
    hasRep: true, color: '#4142a5', sub: '#0071c9', logo: 'faction_jerry.png',
  },
  homely: {
    id: 'homely', name: '家常酒店', en: 'The Homely Hotel',
    desc: '藏在 Level 5 深处的一栋现代酒店——与周遭 1930 年代的装潢格格不入。前台灯常亮，入住规则只有一条：先登记。员工与长住客组成了这个安静的小团体，不问来路，只问房号。',
    hasRep: false, color: '#5a8a9a',
  },
  originals: {
    id: 'originals', name: '原住民', en: 'The Originals',
    desc: '一群在各自时代「失踪」的人——飞行员、船长、名媛与工会领袖。他们在 Level 5 的居所里继续着 1937 年的生活，不接受新成员、也无人可加入（无声望——他们不与外界计分）。凭烫金邀请函方可拜访。',
    hasRep: false, color: '#8a6d3a',
  },
}

/** MEG 对玩家的初始声望（默认友好） */
export const REP_START = 30
/** 声望档位阈值 */
export const REP_TIER = { discount: 80, noTrade: -30, noTalk: -60, banned: -90 } as const

// ---------- 任务（MEG 探险署委托） ----------
export type QuestKind = 'level' | 'phen' | 'entity' | 'item' | 'deliver' | 'deliverGoods' | 'preach'
/** 委托方团体（奖励按此发放：声望与该方货币；阿丽亚娜/信众无货币，只发声望与物资） */
export type QuestFaction = 'meg' | 'bntg' | 'ariane' | 'jerry'
export interface QuestDef {
  id: string
  kind: QuestKind
  faction: QuestFaction // 委托方（奖励按此发放：声望与该方货币）
  target: string // 层级 id（数字串）/ 现象 id / 实体 type / 物品 type / 押运目标 NPC id
  n: number // 秒数/米数（level 类）或件数（item 类）
  unit: 'time' | 'dist' | 'count'
  hard: boolean // 困难任务：接取赠迁跃浆果
  title: string
  desc: string
  rewardRep: number
  rewardCoin: number // 奖励货币数量（meg=天鹰币 / bntg=压印币）
  rewardItems: string[] // 额外物资
}

let questSeq = 1

/** 随机生成一个委托（同 rand 序列确定；hard≈30%） */
export function genQuest(rand: () => number): QuestDef {
  const hard = rand() < 0.3
  const kind = (['level', 'phen', 'entity', 'item'] as const)[Math.floor(rand() * 4)]
  const id = `q${questSeq++}`
  const rewardRep = hard ? 14 : 8
  const rewardCoin = hard ? 10 : 5
  const supply = ['canned', 'bandage', 'battery', 'glowstick', 'almond']
  const rewardItems = hard ? [supply[Math.floor(rand() * supply.length)], supply[Math.floor(rand() * supply.length)]] : [supply[Math.floor(rand() * supply.length)]]
  if (kind === 'level') {
    const target = hard ? '6' : String([2, 3, 4, 5][Math.floor(rand() * 4)])
    const timeMode = rand() < 0.5
    const n = timeMode ? 45 : 60
    return {
      id, kind, faction: 'meg', target, n, unit: timeMode ? 'time' : 'dist', hard,
      title: `调查 Level ${target}`,
      desc: `前往 Level ${target}${timeMode ? ` 并逗留至少 ${n} 秒` : ` 并行走至少 ${n} 米`}，随后回探险署报告情况。`,
      rewardRep, rewardCoin, rewardItems,
    }
  }
  if (kind === 'phen') {
    const target = hard ? 'plantcancer' : ['isolation', 'flicker'][Math.floor(rand() * 2)]
    const name = PHENOMENA[target]?.name ?? target
    return {
      id, kind, faction: 'meg', target, n: 1, unit: 'count', hard,
      title: `调查现象「${name}」`,
      desc: `亲身遭遇现象「${name}」一次（无需触发后果），随后回探险署报告感受。`,
      rewardRep, rewardCoin, rewardItems,
    }
  }
  if (kind === 'entity') {
    const target = hard ? 'smiler' : ['duller', 'hound', 'clump', 'wretch'][Math.floor(rand() * 4)]
    const name = ENTITIES[target]?.name ?? target
    return {
      id, kind, faction: 'meg', target, n: 1, unit: 'count', hard,
      title: `调查实体「${name}」`,
      desc: `在外出时新遭遇一次实体「${name}」（此前遭遇记录不算数），随后回探险署报告。`,
      rewardRep, rewardCoin, rewardItems,
    }
  }
  const pool: [string, number][] = hard ? [['tape', 1]] : [['battery', 3], ['almond', 2], ['bandage', 2], ['fuse', 1]]
  const [target, n] = pool[Math.floor(rand() * pool.length)]
  return {
    id, kind, faction: 'meg', target, n, unit: 'count', hard,
    title: `征集物资：${ITEMS[target]?.name ?? target} ×${n}`,
    desc: `探险署物资吃紧。收集 ${ITEMS[target]?.name ?? target} ×${n} 并带回交付（交付时扣除）。`,
    rewardRep, rewardCoin, rewardItems,
  }
}

// ---------- BNTG 委托（商人之家「行商·蓝」发放）：征集稀有商品 / 押运包裹 ----------
// 奖励为 BNTG 声望 + 压印币（rewardCoin 字段在此按「压印币」计）
export function genBntgQuest(rand: () => number): QuestDef {
  const id = `qb${questSeq++}`
  const hard = rand() < 0.35
  if (rand() < 0.55) {
    // 征集稀有商品（越稀有奖励越高）
    const pool: [string, number, boolean][] = [
      ['fuyouyu', 1, false], ['squirtgun', 1, false], ['skeleton', 2, false],
      ['uvlamp', 1, false], ['royalration', 1, true], ['warpberry', 1, true],
    ]
    const [target, n, isHard] = pool[Math.floor(rand() * pool.length)]
    const h = hard || isHard
    return {
      id, kind: 'item', faction: 'bntg', target, n, unit: 'count', hard: h,
      title: `稀有商品：${ITEMS[target]?.name ?? target} ×${n}`,
      desc: `商人之家高价征集「${ITEMS[target]?.name ?? target}」×${n}。商人重利——交货时扣除，报酬从优。`,
      rewardRep: h ? 12 : 7, rewardCoin: h ? 14 : 8, rewardItems: h ? ['almond', 'canned'] : ['almond'],
    }
  }
  // 押运包裹：把货物带给 M.E.G. 的特定 NPC（跨团体友好贸易）
  const targets: [string, string][] = [
    ['kat', '监督者 Kat'], ['nightingale', '「夜莺」'], ['justin', 'Justin Zimals'],
  ]
  const [target, name] = targets[Math.floor(rand() * targets.length)]
  return {
    id, kind: 'deliver', faction: 'bntg', target, n: 1, unit: 'count', hard,
    title: `押运包裹：送给${name}`,
    desc: `把一件密封货物亲手交给 Alpha 基地的 ${name}（当面交付）。路上小心，别弄丢了——虽然丢不了，它缝在你背包里。`,
    rewardRep: hard ? 14 : 8, rewardCoin: hard ? 16 : 9, rewardItems: hard ? ['almond', 'battery'] : ['canned'],
  }
}

// ---------- EL3A 物流委托（办公区EL3A「物流主管」发放，v43）：把物流包裹当面送往其他据点的固定 NPC ----------
// 接取时玩家获得实体物品「物流包裹」（占背包格、不可堆叠；接取/交付/丢失认定失败见 engine.acceptQuest /
// deliverGoodsTo / failGoodsQuest）。奖励为 BNTG 声望 + 压印币。
/** 物流包裹收件人池：[NPC id, 收件人称谓, 目的地]（全是各据点的固定 NPC） */
export const GOODS_TARGETS: readonly [string, string, string][] = [
  ['kat', '监督者 Kat', 'Alpha 基地'],
  ['nightingale', '「夜莺」', 'Alpha 基地'],
  ['justin', 'Justin Zimals', 'Alpha 基地'],
  ['lan', '莱恩·卡特', '商人之家'],
  ['laozhangfang', '奥托·格雷', '商人之家'],
  ['dupont', '杜邦医师', '希波克拉底 - 1'],
  ['martin', '马丁护士长', '希波克拉底 - 1'],
  ['tom', 'Tom', 'Tom 的餐馆'],
  ['aiko', '佐藤爱子', 'Tom 的餐馆'],
]
export function genEl3aQuest(rand: () => number): QuestDef {
  const id = `qg${questSeq++}`
  const hard = rand() < 0.35
  const [target, name, where] = GOODS_TARGETS[Math.floor(rand() * GOODS_TARGETS.length)]
  return {
    id, kind: 'deliverGoods', faction: 'bntg', target, n: 1, unit: 'count', hard,
    title: `物流包裹：送往${where}`,
    desc: `把一件物流包裹亲手交给${where}的 ${name}（当面交付）。包裹占一格背包——弄丢了就回 EL3A 找物流主管认栽，别硬撑。`,
    rewardRep: hard ? 13 : 8, rewardCoin: hard ? 15 : 9, rewardItems: hard ? ['almond', 'canned'] : ['canned'],
  }
}

// ---------- 阿丽亚娜委托（希波克拉底 - 1 实验室技术员发放）：提交具有超自然性质的物品 ----------
// 目标全部取自 ItemDef.anomalous 异常物品池（医学研究样本）；阿丽亚娜无货币——rewardCoin 恒 0，
// 酬谢只发声望 + 医疗/基础物资（交付结算见 engine.turnInQuest）
export function genArianeQuest(rand: () => number): QuestDef {
  const id = `qa${questSeq++}`
  const hard = rand() < 0.35
  const pool: [string, number, boolean][] = [
    ['almond', 2, false], ['xenonmarble', 2, false], ['cashew', 1, false],
    ['rabbit', 1, true], ['skeleton', 1, true], ['fuyouyu', 1, true], ['warpberry', 1, true], ['thingmeat', 1, true],
  ]
  const [target, n, isHard] = pool[Math.floor(rand() * pool.length)]
  const h = hard || isHard
  const supply = ['bandage', 'disinfectant', 'almond', 'canned']
  const rewardItems = h
    ? [supply[Math.floor(rand() * supply.length)], supply[Math.floor(rand() * supply.length)]]
    : [supply[Math.floor(rand() * supply.length)]]
  return {
    id, kind: 'item', faction: 'ariane', target, n, unit: 'count', hard: h,
    title: `异常样本征集：${ITEMS[target]?.name ?? target} ×${n}`,
    desc: `希波克拉底团队正在收集具有超自然性质的物品用于医学与异常生物学研究。提交「${ITEMS[target]?.name ?? target}」×${n}（交付时扣除），团队必有酬谢。`,
    rewardRep: h ? 14 : 7, rewardCoin: 0, rewardItems,
  }
}

// ---------- 杰瑞的信众委托（Level 274 侍立信众发放，v47）：向其他团体 NPC 布道 ----------
// 传教使命的标准委托形式（v45 的专属按钮已委托化）：三选一接取 → 前往目标据点（或任意地点的
// 其他团体 NPC）布道 → 回 L274 侍立信众处交付。信众无货币——rewardCoin 恒 0，酬谢为 jerry 声望
// + 小物资。进行中的传教委托可让玩家离开 L274 时免于声望惩罚（engine.takeExit）。
// v54 修复：排除信众自家据点（蓝色救赎全是 jerry 信众，没有可布道对象——抽到即无法完成）；
// v55 修复：排除无声望团体的据点（Tom 的餐馆/原住民居所——传教代价是声望 -5，无声望团体无从结算）
export function genJerryQuest(rand: () => number): QuestDef {
  const id = `qj${questSeq++}`
  const pool = Object.values(OUTPOSTS).filter((o) => o.id !== 'jerry' && o.faction !== 'jerry' && !!FACTIONS[o.faction]?.hasRep)
  const o = pool[Math.floor(rand() * pool.length)]
  const supply = ['almond', 'canned', 'bandage', 'glowstick']
  return {
    id, kind: 'preach', faction: 'jerry', target: o.id, n: 1, unit: 'count', hard: false,
    title: `传教使命：前往${o.name}`,
    desc: `鹉主的教义当传遍后室。前往「${o.name}」向那里的人传播鹉主的教义（或向任何其他团体的成员布道），随后回 Level 274 向侍立信众复命。听道者所属团体会嫌你烦（声望 -5）——信众自会记你的好。`,
    rewardRep: 10, rewardCoin: 0, rewardItems: [supply[Math.floor(rand() * supply.length)]],
  }
}
