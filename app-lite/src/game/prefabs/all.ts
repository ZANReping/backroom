// 预制件总表：按层级汇总（固定结构生成器：以「预制房间/区域」为单位植入随机地图；
// 按层级概率规则生成（部分 100%）；融合策略：只在「纯墙/虚空」区域开洞造房，
// 通过门洞与现有地板连通 → 不重叠、不堵死原通路）
import type { PrefabDef } from './shared'
import { L0_PREFABS } from './l0'
import { L1_PREFABS } from './l1'
import { L2_PREFABS } from './l2'
import { L3_PREFABS } from './l3'
import { L4_PREFABS } from './l4'
import { L5_PREFABS } from './l5'

export const PREFABS: PrefabDef[] = [
  ...L0_PREFABS, ...L1_PREFABS, ...L2_PREFABS,
  ...L3_PREFABS, ...L4_PREFABS, ...L5_PREFABS,
]

// 预制件所属层级（按 id 前缀映射，避免在定义里重复写字段）
export function levelOf(p: PrefabDef): number {
  const map: Record<string, number> = {
    redroom: 0, archroom: 0,
    luxgarage: 1, maintcorridor: 1,
    boilernode: 2,
    maingenroom: 3,
    megoutpost: 4, blackwinroom: 4,
    guestroom: 5, beverlyhall: 5, hotelboiler: 5,
  }
  return map[p.id] ?? -1
}

// 某层级可能生成的固定结构（可选排除该层生成器跳过项）
export function prefabsForLevel(level: number, skip?: readonly string[]): PrefabDef[] {
  return PREFABS.filter((p) => levelOf(p) === level && !(skip && skip.includes(p.id)))
}

// 供冒烟断言：某层某预制件是否 100% 规则
export function prefabRule(id: string): { level: number; prob: number } | null {
  const p = PREFABS.find((x) => x.id === id)
  return p ? { level: levelOf(p), prob: p.prob } : null
}
