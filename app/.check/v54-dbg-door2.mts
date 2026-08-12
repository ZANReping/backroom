;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { LEVELS } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { genL4ChunkRaw } = await import('../src/game/world/infiniteL4.ts')
const def = LEVELS[4]
for (const [cx, cy, lx, ly] of [[3, 0, 9, 15], [-2, 3, 9, 20], [-1, 3, 16, 20]] as const) {
  const c = genL4ChunkRaw(def, 424242, cx, cy)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= 32 || y >= 32 ? 2 : c.tiles[y * 32 + x])
  const doors = c.structures.filter((s) => s.kind === 'hoteldoor' && s.x - cx * 32 === lx && s.y - cy * 32 === ly)
  console.log(`chunk(${cx},${cy}) 局部(${lx},${ly}) doors=${doors.length}`,
    'N', at(lx, ly - 1), 'S', at(lx, ly + 1), 'E', at(lx + 1, ly), 'W', at(lx - 1, ly), 'tile', at(lx, ly))
  // 打印周边 5x5
  for (let y = ly - 2; y <= ly + 2; y++) {
    let row = ''
    for (let x = lx - 4; x <= lx + 4; x++) row += at(x, y) === 1 ? '.' : '#'
    console.log('   ', row)
  }
}
