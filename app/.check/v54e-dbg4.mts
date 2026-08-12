;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const gm = generateLevel(levelDefOf(106)!, 424242, true)
// 终图：食堂一带 tiles / elev / step / crawl / stair / liquid
for (let y = 33; y <= 43; y++) {
  let t = '', e = '', s = ''
  for (let x = 10; x <= 25; x++) {
    const i = y * gm.w + x
    t += gm.tiles[i] === 1 ? '.' : '#'
    e += gm.elev[i] === 0 ? '.' : String(gm.elev[i])
    s += (gm.stair[i] & 7) ? 'R' : gm.step[i] ? 'S' : '.'
  }
  console.log(y, t, e, s)
}
