;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel, bfs3D } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
const reach = bfs3D(m)
for (const [x, y] of [[34, 19], [34, 20], [33, 19], [33, 20], [35, 19], [35, 20]] as const) {
  const i = (y * m.w + x) * 3 + 1
  console.log(`(${x},${y}) band1 reach=${reach[i]} stair=${m.stair[y * m.w + x] & 7} elev=${m.elev[y * m.w + x]} wet=${m.wet[y * m.w + x]}`)
}
