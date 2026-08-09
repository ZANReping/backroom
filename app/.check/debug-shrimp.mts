// 调试：L0 chunk 变体/湿地/旱虾生成路径
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
;(globalThis as unknown as Record<string, unknown>).document = { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, body: { appendChild() {} } }
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
;(globalThis as unknown as Record<string, unknown>).__shrimpDbg = true
const { engine } = await import('../src/game/engine.ts')
const { generateInfinite, CS } = await import('../src/game/infinite.ts')
const { LEVELS } = await import('../src/game/levels/index.ts')
const m = generateInfinite(LEVELS[0], 1)
const variants: Record<string, number> = {}
let wetChunks = 0, entTotal = 0, shrimp = 0
for (const c of m.inf!.chunks.values()) {
  variants[c.variant] = (variants[c.variant] ?? 0) + 1
  if (c.wet.some((w) => w === 1)) wetChunks++
  entTotal += c.entities.length
  shrimp += c.entities.filter((e) => e.type === 'dryshrimp').length
}
console.log('variants:', variants)
console.log('wetChunks:', wetChunks, 'entities:', entTotal, 'dryshrimp:', shrimp)
// 细看每个 chunk 的实体类型与原始 dryshrimp 数量
for (const c of m.inf!.chunks.values()) {
  const types = c.entities.map((e) => e.def.type)
  if (types.length) console.log(c.key, types.join(','))
}
