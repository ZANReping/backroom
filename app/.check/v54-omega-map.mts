;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(109)!, 424242, true)
for (let y = 0; y < m.h; y += 1) {
  let row = ''
  for (let x = 0; x < m.w; x++) row += m.tiles[y * m.w + x] === 1 ? '.' : '#'
  console.log(String(y).padStart(2), row)
}
