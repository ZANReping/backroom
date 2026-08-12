;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel, FLOOR_H } = await import('../src/game/world/mapgen.ts')
const gm = generateLevel(levelDefOf(106)!, 424242, true)
for (const l of gm.lights) {
  const ii = Math.floor(l.y) * gm.w + Math.floor(l.x)
  const okk = l.z === undefined ? gm.tiles[ii] === 1
    : Math.abs(l.z - FLOOR_H) < 0.01 ? gm.up[ii] === 1 && gm.upWall[ii] !== 1
    : Math.abs(l.z - 2 * FLOOR_H) < 0.01 ? gm.up2[ii] === 1 && gm.upWall2[ii] !== 1 : false
  if (!okk) console.log(`light (${l.x},${l.y}) z=${l.z} tile=${gm.tiles[ii]} up=${gm.up[ii]} upWall=${gm.upWall[ii]} up2=${gm.up2[ii]} upWall2=${gm.upWall2[ii]} stair=${gm.stair[ii] & 7}`)
}
