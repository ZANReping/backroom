;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
for (const id of [106, 101, 105, 107]) {
  const m = generateLevel(levelDefOf(id)!, 424242, true)
  const ws = m.structures.filter((s) => s.kind === 'wallwindow')
  const wt = m.structures.filter((s) => s.kind === 'walltv')
  console.log(id, 'wallwindow:', ws.map((s) => `(${s.x},${s.y}) tile=${m.tiles[Math.floor(s.y) * m.w + Math.floor(s.x)]} deg=${s.data?.deg} topH=${s.data?.topH}`).join(' ') || '无',
    '| walltv:', wt.map((s) => `(${s.x},${s.y})`).join(' ') || '无')
}
