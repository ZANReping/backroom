// 实体生成分布派生表：层级归属 / 威胁程度 / 稀有度
// 数据源：levels/lX.ts 各层 entities 生成池（w=池内权重）+ 实体定义的 codex.danger。
// 纯派生模块（只读 LEVELS，不依赖 UI）：DevPanel 召唤分组与图鉴实体筛选共用。
import { LEVELS } from '../levels'
import type { EntityDef } from './types'

/** 实体在某层级生成池中的条目（id=LEVELS 索引/层级 id，w=池内权重；event=true=特殊事件生成） */
export interface EntitySpawn { id: number; w: number; event?: boolean }

// 特殊事件生成归属（v34）：不在任何生成池、但在特定层级经事件生成的实体——
// 笑魇=L1 停电期间于黑暗处生成；手臂=L1 天花板通风管在灯光熄灭时伸出。
// v42 补 Level 2 特殊生成（infiniteL2 生成器内追加，均不在生成池）：
// 笑魇=L2 黑暗廊道区概率替代池中抽取；管道蠕虫=L2 伪装成 pipes 拟态生成；
// 窗户=L2 走廊尽头墙上的未涂黑窗户（windowtrap）。
// 这些实体在 DevPanel 分页与图鉴层级筛选中计入对应层级（稀有度仍保持「特殊（事件）」）
export const ENTITY_EVENT_SPAWNS: Record<string, number[]> = {
  smiler: [1, 2],
  arms: [1],
  ferren: [102], // Ferren：仅商人之家的雪貂笼出没（非生成池，生成器定点放置）
  jerry: [274], // 鹉主杰瑞：仅 Level 274 主间栖木（生成器定点放置）
  pipeworm: [2],
  windowent: [2],
  vendingmachine: [2], // 人制品售货机：L2 走廊尽头（生成器定点放置）
  nguithr: [1, 2], // Nguithr'xurh：L1/L2 天花板结囊（生成器定点放置）
}

let cache: Record<string, EntitySpawn[]> | null = null

/** 实体 → 可生成的层级列表（生成池 + 特殊事件归属）；完全无生成路径返回空数组 */
export function entitySpawnLevels(type: string): EntitySpawn[] {
  if (!cache) {
    cache = {}
    for (const lv of LEVELS)
      for (const e of lv.entities)
        (cache[e.type] ??= []).push({ id: lv.id, w: e.w })
    for (const [t, ids] of Object.entries(ENTITY_EVENT_SPAWNS))
      for (const id of ids) (cache[t] ??= []).push({ id, w: 0, event: true })
  }
  return cache[type] ?? []
}

/** 威胁程度（0–5 级）：解析 codex.danger 的首位数字（如「4 级（高威胁）」→ 4） */
export function entityThreat(def: EntityDef): number {
  const m = /^\s*(\d)/.exec(def.codex.danger)
  return m ? Number(m[1]) : 0
}

// 稀有度：按实体在其「最容易遇见的层级」生成池中的权重占比分档——
// ≥25% 常见 / ≥12% 少见 / <12% 稀有 / 不在任何生成池 特殊（事件生成，如笑魇/手臂）
export type EntityRarity = 'common' | 'uncommon' | 'rare' | 'event'
export const ENTITY_RARITY_LABEL: Record<EntityRarity, string> = {
  common: '常见', uncommon: '少见', rare: '稀有', event: '特殊',
}

export function entityRarity(type: string): EntityRarity {
  const pooled = entitySpawnLevels(type).filter((s) => !s.event)
  if (pooled.length === 0) return 'event'
  let best = 0
  for (const s of pooled) {
    const pool = LEVELS[s.id]?.entities ?? []
    const total = pool.reduce((a, e) => a + e.w, 0)
    if (total > 0) best = Math.max(best, s.w / total)
  }
  return best >= 0.25 ? 'common' : best >= 0.12 ? 'uncommon' : 'rare'
}
