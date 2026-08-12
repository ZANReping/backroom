;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
for (const s of m.structures.filter((s2) => s2.kind === 'walltv')) {
  const t = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? -1 : m.tiles[y * m.w + x])
  const nb = [[0, -1, 'N'], [1, 0, 'E'], [0, 1, 'S'], [-1, 0, 'W']].map(([dx, dy, n]) => `${n}=${t(s.x + (dx as number), s.y + (dy as number))}`)
  console.log(`walltv (${s.x},${s.y}) floor=${s.floor ?? 0}`, nb.join(' '))
}
