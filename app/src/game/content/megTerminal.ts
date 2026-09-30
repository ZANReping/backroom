import type { Engine } from '../engine'
import { CAREERS } from './careers'
import { REP_TIER, type QuestDef } from './factions'

export function megRelationship(rep: number): string {
  if (rep <= REP_TIER.noTalk) return '敌人'
  if (rep <= REP_TIER.noTrade) return '不受信任的流浪者'
  if (rep >= REP_TIER.discount) return 'MEG 信赖的合作人员'
  if (rep >= 20) return 'MEG 合作人员'
  return '流浪者'
}

export function megPosition(engine: Engine): string {
  const career = engine.career.routes.meg
  if (!career?.joined) return megRelationship(engine.rep.meg ?? 0)
  const rank = Math.min(career.rank, 4)
  return rank > 0 ? CAREERS.meg.ranks[rank - 1] : '登记协作员 · 待完成任务线'
}

/** 发起人的团体在接取时固定；旧档尚未记录来源时沿用委托方。 */
export function isMegQuest(quest: QuestDef): boolean {
  return (quest.issuer?.faction ?? quest.faction) === 'meg'
}

export function megQuestProgress(engine: Engine, quest: Engine['quests'][number]) {
  const d = quest.def
  const value = Math.max(0, Math.min(d.n, d.kind === 'item' ? engine.countItem(d.target) : quest.done ? d.n : quest.progress))
  const done = d.kind === 'item' ? value >= d.n : quest.done
  const unit = d.unit === 'time' ? '秒' : d.unit === 'dist' ? '米' : d.kind === 'item' ? '件' : '项'
  return { value, done, percent: d.n > 0 ? Math.min(100, value / d.n * 100) : 0, label: `${Math.floor(value)} / ${d.n} ${unit}` }
}
