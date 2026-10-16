export type RatMorph = 'common' | 'hairless' | 'capybara' | 'hotel' | 'cave'
export const RAT_MORPH_NAME: Record<RatMorph, string> = { common: '常见种', hairless: '无毛种', capybara: '水豚种', hotel: '酒店正装种', cave: '穴顶种' }
/** 层级 → 种群（渲染层同样调用，模型与行为一致） */
export function ratMorphFor(levelId: number, def: { capybara?: boolean; ceilingCrawler?: boolean; ratMorph?: RatMorph | 'brown' | 'gray' }): RatMorph {
  if (def.ratMorph) return def.ratMorph === 'brown' ? 'common' : def.ratMorph === 'gray' ? 'hairless' : def.ratMorph
  if (def.capybara) return 'capybara'
  if (levelId === 2) return 'hairless'
  if (levelId === 5) return 'hotel'
  if (levelId === 8 || def.ceilingCrawler) return 'cave'
  return 'common'
}
export const CAPY_HP = 45, CAPY_DMG = 10, CAPY_SPEED = 2.8, CAPY_SIGHT = 11

const hash = (n: number) => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
/** 个体外观差异（由 id 决定）：体型、缺耳、断尾、伤疤、水豚种的配件 */
export function ratLook(id: number) {
  const r = (k: number) => hash(id * 29 + k)
  return {
    size: 0.9 + r(1) * 0.22,
    torn: r(2) < 0.3 ? (r(3) < 0.5 ? -1 : 1) : 0, // 缺一只耳朵
    stub: r(4) < 0.18, // 断尾
    scar: r(5) < 0.45,
    horn: 0.8 + r(6) * 0.45, // 常见种角长
    lamp: r(7) < 0.45, // 水豚种：抢来的头灯
    band: r(8) < 0.5, // 水豚种：M.E.G. 臂章
    pack: r(9) < 0.6, // 水豚种：工具包
  }
}

