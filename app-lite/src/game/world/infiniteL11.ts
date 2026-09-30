import { registerInfiniteLevel } from './infiniteRegistry'
import { genL11ChunkRaw } from './l11Raw'
import { L11_SPAWNS, L11_VARIANT_NAMES, L11_VARIANT_LORE, l11VariantOf } from './l11Layout'
export * from './l11Layout'
export { genL11ChunkRaw } from './l11Raw'
registerInfiniteLevel(11, { genRaw:genL11ChunkRaw, variantOf:l11VariantOf, rareVariants:Object.keys(L11_VARIANT_NAMES),
  variantNames:L11_VARIANT_NAMES, variantLore:L11_VARIANT_LORE, spawnWorld:L11_SPAWNS.default,
  regionExitPos:(_seed,rx,ry)=>rx===0&&ry===0?{x:47,y:26}:null })
