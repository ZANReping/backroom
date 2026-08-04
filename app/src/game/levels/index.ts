// 层级定义汇总（严格按 Backrooms Wikidot / Fandom 设定）
// 索引 0–11 = Level 0–11；索引 12 = Level 601「The End」结局层（displayId 601）。
// 据点（outpost 层级）不占本数组下标——它们是入口层级的子层级，走独立 id 空间（100+），
// 经 levelDefOf 解析（OUTPOST_LEVEL_DEFS）。
import type { LevelDef } from '../types'
import { L0 } from './l0'
import { L1 } from './l1'
import { L2 } from './l2'
import { L3 } from './l3'
import { L4 } from './l4'
import { L5 } from './l5'
import { L6 } from './l6'
import { L7 } from './l7'
import { L8 } from './l8'
import { L9 } from './l9'
import { L10 } from './l10'
import { L11 } from './l11'
import { L601 } from './l601'
import { LALPHA } from './lalpha'
import { LBNTG } from './lbntg'
import { LARIANE } from './lariane'
import { LTOM } from './ltom'
import { LEL3A } from './lel3a'
import { L274 } from './l274'

export const LEVELS: LevelDef[] = [L0, L1, L2, L3, L4, L5, L6, L7, L8, L9, L10, L11, L601]

/** 据点层级定义（独立 id 空间 100+，不占 LEVELS 下标；v45：Level 274 亦走此空间） */
const OUTPOST_LEVEL_DEFS: Record<number, LevelDef> = { [LALPHA.id]: LALPHA, [LBNTG.id]: LBNTG, [LARIANE.id]: LARIANE, [LTOM.id]: LTOM, [LEL3A.id]: LEL3A, [L274.id]: L274 }

/** 按 id 解析层级定义（普通层级走 LEVELS 下标；据点走独立 id 空间） */
export function levelDefOf(id: number): LevelDef | undefined {
  return OUTPOST_LEVEL_DEFS[id] ?? LEVELS[id]
}

/** 常规层级数量（不含结局层）——「random」出口只在这个区间内落点 */
export const NORMAL_LEVELS = 12
/** 结局层在 LEVELS 中的索引 */
export const END_LEVEL = 12

/** 玩家可见的层级编号（Level 601 显示 601，其余同索引；据点显示其独立 id） */
export function levelNo(id: number): number {
  return LEVELS[id]?.displayId ?? id
}
/** 玩家可见的层级标签，如「Level 8」「Level 601」；据点等专名层级用 label 覆盖（如「Alpha 基地」） */
export function levelLabel(id: number): string {
  return levelDefOf(id)?.label ?? `Level ${levelNo(id)}`
}

export { WIN_TAPES, LEVEL_EVENTS } from './shared'
