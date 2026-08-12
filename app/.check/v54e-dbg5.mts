;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const gm = generateLevel(levelDefOf(106)!, 424242, true)
for (const s of gm.structures)
  if (s.x >= 10 && s.x <= 26 && s.y >= 33 && s.y <= 44)
    console.log(s.kind, s.x, s.y, s.w, s.h, 'solid=' + s.solid, s.data ? JSON.stringify(s.data) : '')
