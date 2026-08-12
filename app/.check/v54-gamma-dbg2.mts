;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel, bfs3D } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
const reach = bfs3D(m)
for (const band of [1, 2]) {
  console.log(`--- band${band}（.=可达板 #=不可达板 空=无板/墙）---`)
  for (let y = 6; y <= 46; y++) {
    let row = ''
    for (let x = 6; x <= 76; x++) {
      const i = y * m.w + x
      const has = band === 1 ? m.up[i] === 1 : m.up2[i] === 1
      const wall = band === 1 ? m.upWall[i] === 1 : m.upWall2[i] === 1
      row += !has ? ' ' : wall ? 'W' : reach[i * 3 + band] ? '.' : '#'
    }
    console.log(String(y).padStart(2), row)
  }
}
