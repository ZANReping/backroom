;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
for (const id of [101, 102]) {
  const m = generateLevel(levelDefOf(id)!, 424242, true)
  console.log(`== ${id} ==`)
  for (const s of m.structures)
    if (['walltv', 'megposter', 'photo', 'screenboard', 'noticeboard'].includes(s.kind))
      console.log(s.kind, s.x, s.y, 'f' + (s.floor ?? 0), JSON.stringify(s.data ?? {}))
}
