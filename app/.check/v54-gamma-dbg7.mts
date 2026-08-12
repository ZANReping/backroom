;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
for (const [x, y] of [[39, 16], [39, 17], [39, 18], [33, 19], [34, 19], [33, 20], [32, 19], [35, 19]] as const) {
  const i = y * m.w + x
  const s = m.structures.filter((q) => q.solid && q.x <= x && x < q.x + q.w && q.y <= y && y < q.y + q.h).map((q) => `${q.kind}@${q.floor ?? 0}`)
  console.log(`(${x},${y}) tiles=${m.tiles[i]} up=${m.up[i]} upW=${m.upWall[i]} up2=${m.up2[i]} upW2=${m.upWall2[i]} structs=${s.join(',')}`)
}
