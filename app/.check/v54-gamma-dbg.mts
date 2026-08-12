;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel, bfs3D } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
const reach = bfs3D(m)
const S = 3
for (const band of [0, 1, 2]) {
  let un = 0, tot = 0
  const samples: string[] = []
  for (let i = 0; i < m.w * m.h; i++) {
    const walk = band === 0 ? m.tiles[i] === 1 : band === 1 ? (m.up[i] === 1 && m.upWall[i] !== 1) : (m.up2[i] === 1 && m.upWall2[i] !== 1)
    if (!walk) continue
    tot++
    if (!reach[i * S + band]) { un++; if (samples.length < 12) samples.push(`${i % m.w},${Math.floor(i / m.w)}`) }
  }
  console.log(`band${band}: ${un}/${tot} 不可达`, samples.join(' '))
}
