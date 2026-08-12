;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel, bfs3D } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
const reach = bfs3D(m)
for (let y = 8; y <= 22; y++) {
  let row = ''
  for (let x = 44; x <= 74; x++) {
    const i = y * m.w + x
    const has = m.up[i] === 1, wall = m.upWall[i] === 1
    row += !has ? ' ' : wall ? 'W' : reach[i * 3 + 1] ? '.' : '#'
  }
  console.log(String(y).padStart(2), row)
}
