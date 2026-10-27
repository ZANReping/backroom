// 层级专属磁带（L0–L11 每层一种）：外观与文案按层级的数据表（levelTapes.json）。
// - 物品定义由此表生成并并入 ITEMS（content/items.ts），图标由 scripts/gen-item-icons.py 按 palette/motif 生成。
// - 这些磁带是关键收藏物（keyItem）：不可丢弃、不可寄存/交易。
// - 本轮只做 tape_l0；与旧的通用 'tape'（集 6 盘胜利条件、随机掉落、档案馆、售货机）暂时并存，互不影响。
import table from './levelTapes.json'
import type { ItemDef } from './items'

export interface LevelTapeLook {
  level: number
  item: string
  name: string
  desc: string
  /** 像素图标调色板（外壳/污渍/标签/窗口/卷盘等），gen-item-icons.py 读取。 */
  palette: Record<string, string>
  /** 标签花纹（如 l0_wallpaper = Level 0 单黄墙纸纹）。 */
  motif: string
}

export const LEVEL_TAPES: LevelTapeLook[] = (table as { tapes: LevelTapeLook[] }).tapes

/** 层级 → 磁带物品 id（无则 undefined）。 */
export function levelTapeItem(level: number): string | undefined {
  return LEVEL_TAPES.find((t) => t.level === level)?.item
}
/** 物品 id → 外观表条目（非层级磁带返回 undefined）。 */
export function levelTapeLook(type: string): LevelTapeLook | undefined {
  return LEVEL_TAPES.find((t) => t.item === type)
}
export function isLevelTape(type: string): boolean {
  return LEVEL_TAPES.some((t) => t.item === type)
}

/** 生成并入 ITEMS 的物品定义（不进入任何掉落池；glyph 复用磁带手绘兜底）。 */
export function levelTapeItemDefs(): Record<string, ItemDef> {
  const out: Record<string, ItemDef> = {}
  for (const t of LEVEL_TAPES) {
    out[t.item] = { type: t.item, name: t.name, desc: t.desc, stack: 1, rarity: 'epic', anomalous: true, keyItem: true, glyph: 'tape' }
  }
  return out
}
