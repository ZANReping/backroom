;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const { canOccupy, PLAYER_RADIUS } = await import('../src/game/core/player.ts')
const gm = generateLevel(levelDefOf(106)!, 424242, true)
for (const band of [0, 1, 2] as const)
  console.log('band', band, canOccupy(gm, 66.74, 11.5, PLAYER_RADIUS, { z: 4.04, band }))
// 各采样点逐个查（半径 0）
for (const [ox, oy] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32], [0.32, 0]] as const)
  console.log(`pt(${66.74 + ox},${11.5 + oy})`, canOccupy(gm, 66.74 + ox, 11.5 + oy, 0.01, { z: 4.04, band: 1 }))
// 结构 near
for (const s of gm.structures) if (s.solid && s.x < 69 && s.x + s.w > 64 && s.y < 14 && s.y + s.h > 10) console.log('struct', s.kind, s.x, s.y, s.floor)
