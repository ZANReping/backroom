// v54：L3 出口密度校验——RS3=6 超区域，24×24 chunk 应得 ~(24/6)^2=16 个出口（RS=8 时代 ~9）
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { LEVELS } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { genL3ChunkRaw } = await import('../src/game/world/infiniteL3.ts')
const def = LEVELS[3]
let n = 0
for (let cy = 0; cy < 24; cy++) for (let cx = 0; cx < 24; cx++) n += genL3ChunkRaw(def, 12345, cx, cy).exits.length
console.log('L3 exits in 24x24 chunks:', n, '(RS=8 期望 ~9 / RS3=6 期望 ~16)')
if (n < 13 || n > 20) { console.error('FAIL'); process.exit(1) }
console.log('✓ L3 出口加密生效')
