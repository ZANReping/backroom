;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { LEVELS } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { genL4ChunkRaw, l4CorrX, l4RowY, l4BlockBiome } = await import('../src/game/world/infiniteL4.ts')
const def = LEVELS[4]
// 组合 chunk (2,0),(3,0),(4,0),(2,1),(3,1),(4,1) 拼世界瓦片，检查 world (105,15) 周边
const W = 96 * 2
const m = new Map<string, number>()
for (const [cx, cy] of [[2, -1], [3, -1], [4, -1], [2, 0], [3, 0], [4, 0], [2, 1], [3, 1], [4, 1]] as const) {
  const c = genL4ChunkRaw(def, 424242, cx, cy)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) m.set(`${cx * 32 + x},${cy * 32 + y}`, c.tiles[y * 32 + x])
  for (const s of c.structures) if (s.kind === 'hoteldoor' && Math.abs(s.x - 105) <= 3 && Math.abs(s.y - 15) <= 3) console.log('door at', s.x, s.y, 'data', s.data)
}
for (let y = 10; y <= 20; y++) {
  let row = ''
  for (let x = 98; x <= 112; x++) row += m.get(`${x},${y}`) === 1 ? '.' : '#'
  console.log(y, row)
}
// 该处街区归属
for (let k = 4; k <= 6; k++) console.log('corrX', k, l4CorrX(424242, k))
for (let r = -1; r <= 1; r++) console.log('rowY', r, l4RowY(424242, r))
console.log('biome(5,0)=', l4BlockBiome(424242, 5, 0), 'biome(5,-1)=', l4BlockBiome(424242, 5, -1))
