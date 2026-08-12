;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
for (const [x, y] of [[66, 16], [66, 17], [66, 18], [66, 19], [65, 11], [67, 11], [70, 11]] as const) {
  const i = y * m.w + x
  console.log(`(${x},${y}) tiles=${m.tiles[i]} up=${m.up[i]} upWall=${m.upWall[i]} up2=${m.up2[i]} upWall2=${m.upWall2[i]} stair=${m.stair[i] & 7}`)
}
