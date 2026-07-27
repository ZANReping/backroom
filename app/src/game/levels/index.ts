// 层级定义汇总（严格按 Backrooms Wikidot / Fandom 设定）
// 索引 0–11 = Level 0–11；索引 12 = Level 601「The End」结局层（displayId 601）
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

export const LEVELS: LevelDef[] = [L0, L1, L2, L3, L4, L5, L6, L7, L8, L9, L10, L11, L601]

/** 常规层级数量（不含结局层）——「random」出口只在这个区间内落点 */
export const NORMAL_LEVELS = 12
/** 结局层在 LEVELS 中的索引 */
export const END_LEVEL = 12

/** 玩家可见的层级编号（Level 601 显示 601，其余同索引） */
export function levelNo(id: number): number {
  return LEVELS[id]?.displayId ?? id
}
/** 玩家可见的层级标签，如「Level 8」「Level 601」 */
export function levelLabel(id: number): string {
  return `Level ${levelNo(id)}`
}

export { WIN_TAPES, LEVEL_EVENTS } from './shared'
