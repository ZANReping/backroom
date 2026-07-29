// 现象（Phenomena）：发生于后室内的种种怪诞而超自然的事件——违反物理定律、
// 突破时间与欧式几何的限制、扭曲现实。本文件是现象注册表；
// 当前生效的现象由 Engine.step 每帧写入 engine.activePhenomena，
// HUD 左上角（状态面板下方）与物品栏「状态」页读取展示。

// 现象罕见度
export type PhenomenonRarity =
  | 'unknown'        // 未知：已确认存在，但影响范围未知
  | 'level'          // 楼层：仅存在于某一特定楼层内
  | 'majority-main'  // 主要于：可影响大多数楼层，但有一个主要发生地
  | 'neutralized'    // 失效：已不再发生
  | 'rare'           // 罕有：不超过 5 个楼层
  | 'uncommon'       // 少见：至少 12 个楼层
  | 'common'         // 常见：超过 20 个楼层
  | 'majority'       // 大量：半数楼层可受其影响
  | 'many'           // 频繁：可发生于绝大多数楼层
  | 'backrooms'      // 全室：可于全后室发生

export const RARITY_LABEL: Record<PhenomenonRarity, string> = {
  unknown: '未知',
  level: '楼层',
  'majority-main': '主要于',
  neutralized: '失效',
  rare: '罕有',
  uncommon: '少见',
  common: '常见',
  majority: '大量',
  many: '频繁',
  backrooms: '全室',
}

export interface PhenomenonDef {
  id: string
  name: string
  rarity: PhenomenonRarity
  rarityNote?: string // 罕见度补充说明（如具体楼层）
  desc: string
  icon: 'isolation' | 'plant' | 'flicker' // 图标 key，HUD 侧映射到具体 SVG 组件
  levels?: number[] // 可触发层级（缺省=全层通用；开发者面板据此过滤「当前层可触发」列表）
}

export const PHENOMENA: Record<string, PhenomenonDef> = {
  // 孤立效应：Level 0（马尼拉室除外）全域发生。玩家缓慢失去理智，红室内速率加倍；
  // 每次进入 Level 0 画面色调/饱和度/对比度/亮度发生极轻微变化（engine.colorGrade）。
  isolation: {
    id: 'isolation',
    name: '孤立效应',
    rarity: 'level',
    rarityNote: 'Level 0',
    levels: [0],
    desc: '在 Level 0（马尼拉室除外），任何同行者都会被无形地分开：呼喊无人应答，留下的记号凭空消失。独自置身其中时，理智会缓慢流失；红室之中，流失速率加倍。',
    icon: 'isolation',
  },
  // 植殖癌：Level 1 花园段。逗留者行为逐渐僵硬、视野逐渐变绿，最终原地生根化为一株植物
  // （进展度 engine.plantK：花园段内 ~75 秒涨满，离开后 2 倍速消退）
  plantcancer: {
    id: 'plantcancer',
    name: '植殖癌',
    rarity: 'level',
    rarityNote: 'Level 1（花园段）',
    levels: [1],
    desc: '在 Level 1 的花园段，逗留者的关节会逐渐僵硬，视野边缘泛起新绿，皮肤下浮现叶脉般的纹路——若不尽快离开，最终将原地生根，成为花园里又一株安静的植物。离开花园段后，症状会逐渐消退。',
    icon: 'plant',
  },
  // 闪烁：Level 1 的天鹰/跃金/哥特段不定期发生——所有光源先快速闪烁数秒（预警期），
  // 随即随机切断（完全停电）；花园/衔尾段与维护通廊电源独立，不受影响（keep 灯）
  flicker: {
    id: 'flicker',
    name: '闪烁',
    rarity: 'level',
    rarityNote: 'Level 1',
    levels: [1],
    desc: 'Level 1 的天鹰段、跃金段与哥特段会不定期发生「闪烁」：所有灯光先剧烈闪烁数秒，随即一排排熄灭，主区域陷入完全黑暗，实体在黑暗中肆意孳生。花园段、衔尾段与维护通廊的电源独立，永不熄灭——停电期间，退入白墙的维护通廊是唯一安全的避难方式。',
    icon: 'flicker',
  },
}

// 罕见度展示文本（含楼层/主要发生地补充）
export function rarityText(d: PhenomenonDef): string {
  if (d.rarity === 'level') return `楼层（${d.rarityNote ?? '?'}）`
  if (d.rarity === 'majority-main') return `主要于${d.rarityNote ?? '?'}`
  return RARITY_LABEL[d.rarity]
}
