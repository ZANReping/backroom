// 「玩过前厅」全局持久标记（不随存档槽）：从未完成前厅 → 新游戏进入前厅；
// 完成后新游戏默认直接进入 Level 0，除非设置里开启「启用前厅」。
import { storage } from './storage'

const KEY = 'br_foyer_done'

export function foyerCompleted(): boolean { return storage.get(KEY) === '1' }
export function markFoyerCompleted(): void { storage.set(KEY, '1') }
/** 新游戏是否从前厅开始。 */
export function shouldStartInFoyer(enableFoyerSetting: boolean): boolean { return enableFoyerSetting || !foyerCompleted() }
