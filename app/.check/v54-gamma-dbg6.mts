;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel, bfs3D } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
const reach = bfs3D(m)
const OPENABLE = ['hoteldoor', 'rollerdoor', 'glassdoor', 'bargate']
const solidF = (x: number, y: number, f: number) =>
  m.structures.some((s) => s.solid && !OPENABLE.includes(s.kind) && (s.floor ?? 0) === f && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
for (const band of [0, 1, 2]) {
  let un = 0, tot = 0
  const samples: string[] = []
  for (let i = 0; i < m.w * m.h; i++) {
    const tx = i % m.w, ty = Math.floor(i / m.w)
    let walk = false
    if (band === 0) walk = m.tiles[i] === 1 && !solidF(tx, ty, 0) && ((m.stair[i] & 7) === 0 || true)
    else if (band === 1) walk = m.up[i] === 1 && m.upWall[i] !== 1 && !solidF(tx, ty, 1)
    else walk = m.up2[i] === 1 && m.upWall2[i] !== 1 && !solidF(tx, ty, 2)
    if (!walk) continue
    tot++
    if (!reach[i * 3 + band]) { un++; if (samples.length < 16) samples.push(`${tx},${ty}`) }
  }
  console.log(`band${band}: ${un}/${tot}`, samples.join(' '))
}
