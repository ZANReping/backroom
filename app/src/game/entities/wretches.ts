// Shared pure definitions: factory, AI and model use the same explicit or natural form.
export type WretchKind = 'shambler' | 'sprinter' | 'smart' | 'mutant'
export interface WretchStats { hp: number; speed: number; damage: number; sight: number; reach: number; windup: number; cd: number; voice: [number, number] }
/** 四种变体的数值（voice = [音高, 节奏]：音高 < 1 低沉、> 1 尖利） */
export const WRETCH_STATS: Record<WretchKind, WretchStats> = {
  shambler: { hp: 75, speed: 1.6, damage: 20, sight: 7, reach: 1.35, windup: 0.42, cd: 1.6, voice: [0.55, 0.6] },
  sprinter: { hp: 50, speed: 4.6, damage: 15, sight: 12, reach: 1.9, windup: 0.22, cd: 1.0, voice: [1.9, 1.6] },
  smart: { hp: 85, speed: 2.5, damage: 26, sight: 12, reach: 1.75, windup: 0.5, cd: 1.5, voice: [1.4, 2.2] },
  mutant: { hp: 110, speed: 1.9, damage: 24, sight: 9, reach: 1.5, windup: 0.45, cd: 1.5, voice: [0.8, 1.0] },
}
export const WRETCH_KIND_NAME: Record<WretchKind, string> = { shambler: '蹒跚型', sprinter: '疾行型', smart: '有智型', mutant: '突变型' }
export const wretchHash = (n: number) => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
/** 实体 id → 变体：蹒跚 70% / 疾行 20% / 有智 5% / 突变 5%（渲染层同样调用，模型与行为一致） */
export function wretchKind(id: number): WretchKind {
  const r = wretchHash(id * 13 + 15)
  return r < 0.7 ? 'shambler' : r < 0.9 ? 'sprinter' : r < 0.95 ? 'smart' : 'mutant'
}
/** 模型细节（由 id 决定）：颅顶溶穿、突变部位、有智个体的铁管 */
export function wretchLook(id: number, kind: WretchKind = wretchKind(id)) {
  const r = (k: number) => wretchHash(id * 31 + k)
  const mutant = kind === 'mutant' ? (() => {
    const m = { eyes: r(1) < 0.75 ? 2 + Math.floor(r(2) * 3) : 0, arm: r(3) < 0.5, wings: r(4) < 0.45, jaw: r(5) < 0.5 }
    if ((m.eyes ? 1 : 0) + (m.arm ? 1 : 0) + (m.wings ? 1 : 0) + (m.jaw ? 1 : 0) < 2) { m.eyes = Math.max(m.eyes, 3); if (!m.arm && !m.wings) m.wings = true }
    return m
  })() : undefined
  return { kind, brain: r(6) < (kind === 'mutant' ? 0.7 : 0.4), mutant, pipe: kind === 'smart' }
}

