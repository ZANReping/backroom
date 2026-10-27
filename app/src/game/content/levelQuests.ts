// 层级任务注册表：各层任务线与世界探针汇总于此（engine.levelQuests 读取）。
// 以后加 L1…L11 的任务线：新建 levelQuestsLn.ts，把定义与探针追加到下面两个数组即可。
import type { LevelQuestDef, LevelQuestState } from '../engine/levelQuests'
import type { Engine } from '../engine'
import { L0_QUESTS, probeL0 } from './levelQuestsL0'
import { takePhoto } from '../engine/phone'
import { redEntranceInShot, l0RegionAtPlayer, l0RegionsHere, l0RegionAtWorld } from '../engine/l0QuestProbe'

export const LEVEL_QUESTS: LevelQuestDef[] = [...L0_QUESTS]
export const LEVEL_QUEST_PROBES: ((eng: Engine, st: LevelQuestState) => void)[] = [probeL0]

// QA 入口（无头测试读取；与 __foyerQA 同一风格）
;(globalThis as unknown as { __questQA?: unknown }).__questQA = { takePhoto, redEntranceInShot, l0RegionAtPlayer, l0RegionsHere, l0RegionAtWorld }
