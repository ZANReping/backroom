;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel, bfs3D } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
const reach = bfs3D(m)
for (let y = 0; y <= 20; y++) {
  let row = ''
  for (let x = 6; x <= 76; x++) {
    const i = y * m.w + x
    row += m.tiles[i] !== 1 ? ' ' : reach[i * 3] ? '.' : '#'
  }
  console.log(String(y).padStart(2), row)
}
