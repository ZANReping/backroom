// 图鉴遇见次数（渐进解锁）持久化
import { storage } from '../core/storage'
import type { Entity } from './types'
import { LEGACY_MOTH_FORMS } from './moths'

/** Merge old per-form entries once; repeated loads must not multiply encounter counts. */
export function mergeMothCodex<T extends number | boolean>(entries: Record<string, T>): Record<string, T> {
  for (const key of Object.keys(LEGACY_MOTH_FORMS)) {
    if (!(key in entries)) continue
    const value = entries[key]
    entries.deathmoth = (typeof value === 'number'
      ? (Number(entries.deathmoth) || 0) + (Number.isFinite(value) ? Math.max(0, value) : 0)
      : !!entries.deathmoth || value) as T
    delete entries[key]
  }
  return entries
}

export function loadSeen(): Record<string, number> {
  try {
    const raw = storage.get('br_codex_seen') ?? '{}'
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const seen = mergeMothCodex<number>(parsed)
    const migrated = JSON.stringify(seen)
    if (migrated !== raw) storage.set('br_codex_seen', migrated)
    return seen
  } catch { return {} }
}
export function recordEncounter(type: string): number {
  if (Object.hasOwn(LEGACY_MOTH_FORMS, type)) type = 'deathmoth'
  const s = loadSeen()
  s[type] = (s[type] ?? 0) + 1
  try { storage.set('br_codex_seen', JSON.stringify(s)) } catch { /* ignore */ }
  return s[type]
}
/** v54：遭遇计数按个体去重——玩家看见 / 实体察觉玩家 / 攻击命中 / 特殊交互（接触杰瑞）等
 *  触发都走这里：同一个体只在首次触发时计数（encountered 置位），之后不再重复计。 */
export function recordEntityEncounter(e: Entity): void {
  if (e.encountered) return
  e.encountered = true
  recordEncounter(e.def.type)
}
// 解锁档位：0 未见 / 1 初见（名称+外形）/ 3 行为 / 6 完整
export function unlockTier(type: string): number {
  const n = loadSeen()[type] ?? 0
  return n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0
}
