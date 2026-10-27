// Level 0 任务线（用户设计，2026-10-25）：
//   任务「教学」：进入 Level 0 即出现
//     1. 探索“后室”（0/5）：黄室、拱门、柱厅、深坑、熄灯区各进入一次（区域判定 = l0Map.ts L0_MAP_KEY + 区域栅格）
//     2. 找到马尼拉房间：进入区域 6
//     3. 拍摄红室入口（可选）：在红室外、入口几米内、大致面向入口时用手机拍照（engine/l0QuestProbe.ts）
//     4. 找到出口：完成第 2 项后才显示；以任意方式离开 Level 0（死亡不算）
//   任务「阈限之外」：已完成「教学」第 1 项，并进入任意 Level 0 子层级时出现
//     发现「天顶站」「重塑的混乱」「冰室」（子层级表 content/l0Sublevels.ts；L0.2 已实现，另两项为占位）
//     完成奖励：Level 0 专属磁带 tape_l0
import type { LevelQuestDef, QuestCtx } from '../engine/levelQuests'
import type { Engine } from '../engine'
import type { LevelQuestState } from '../engine/levelQuests'
import { L0_SUBLEVELS } from './l0Sublevels'
import { L0R, l0RegionsHere } from '../engine/l0QuestProbe'

/** 「探索后室」计入的五类常规区域（顺序即面板提示顺序）。 */
export const L0_EXPLORE_REGIONS = [L0R.yellow, L0R.arch, L0R.pillars, L0R.pit, L0R.blackout]

const exploredCount = (c: QuestCtx) => L0_EXPLORE_REGIONS.filter((r) => c.st.l0Regions.includes(r)).length
const objDone = (c: QuestCtx, quest: string, obj: string) => !!c.st.quests[quest]?.obj[obj]

export const L0_QUESTS: LevelQuestDef[] = [
  {
    id: 'l0_tutorial',
    level: 0,
    title: 'Level 0 · 教学',
    objectives: [
      { id: 'explore', text: '探索“后室”', target: L0_EXPLORE_REGIONS.length, progress: exploredCount },
      { id: 'manila', text: '找到马尼拉房间', check: (c) => c.st.l0Regions.includes(L0R.manila) },
      {
        id: 'photo_red', optional: true, text: '用手机拍摄红室入口（不必进入）',
        onEvent: (ev) => ev.t === 'photo' && ev.subject === 'l0_red_entrance',
      },
      {
        id: 'exit', text: '找到出口',
        visible: (c) => !!c.rec.obj.manila,
        // 只认「完成马尼拉之后」的离开：事件到来时目标已可见才会被调用
        onEvent: (ev) => ev.t === 'leaveLevel' && ev.from === 0 && ev.to !== 0,
      },
    ],
  },
  {
    id: 'l0_beyond',
    level: 0,
    title: 'Level 0 · 阈限之外',
    // 进入过任意子层级后即显示（经施工门进入 L0.2 时事件发生在 Level 0，返回后仍保持可见）
    visible: (c) => objDone(c, 'l0_tutorial', 'explore') && c.eng.player.level === 0 && (!!c.st.sublevel || c.st.sublevelsSeen.length > 0),
    objectives: L0_SUBLEVELS.map((s) => ({
      id: 'find_' + s.id,
      text: `发现「${s.name}」`,
      check: (c: QuestCtx) => c.st.sublevelsSeen.includes(s.id),
    })),
    reward: { item: 'tape_l0', text: '获得 Level 0 磁带——它在背包里微微发潮。' },
  },
]

/** Level 0 探针：记录玩家到过的区域类型（只在 Level 0、且不在子层级时）。 */
export function probeL0(eng: Engine, st: LevelQuestState) {
  if (eng.player.level !== 0) { st.sublevel = null; return }
  if (st.sublevel) return
  for (const r of l0RegionsHere(eng)) if (!st.l0Regions.includes(r)) st.l0Regions.push(r)
}
