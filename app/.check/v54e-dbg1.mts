;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { LEVELS, levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel, FLOOR_H } = await import('../src/game/world/mapgen.ts')
const { canOccupy, PLAYER_RADIUS } = await import('../src/game/core/player.ts')
const gm = generateLevel(levelDefOf(106)!, 424242, true)
// 3F 带（z=6, band=2）在 A 坡道行及落梯格的可站立性
for (const [px, py] of [[63.5, 36.5], [62.5, 36.5], [60.5, 36.5], [58.5, 36.5], [60.5, 35.5], [60.5, 37.5]] as const)
  console.log(`band2 (${px},${py}) canOccupy=${canOccupy(gm, px, py, PLAYER_RADIUS, { z: 2 * FLOOR_H, band: 2 })} up2=${gm.up2[Math.floor(py) * gm.w + Math.floor(px)]} stair=${gm.stair[Math.floor(py) * gm.w + Math.floor(px)] & 7}`)
