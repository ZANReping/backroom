;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { LEVELS, levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel, groundHeightAt, bandOfZ, stairServesBand } = await import('../src/game/world/mapgen.ts')
const { canOccupy, PLAYER_RADIUS } = await import('../src/game/core/player.ts')
const gm = generateLevel(levelDefOf(106)!, 424242, true)
// 复现 B 轨迹
let z = 3.0
for (let px = 64.5; px <= 70.6; px += 0.08) {
  const band = bandOfZ(z)
  if (!canOccupy(gm, px, 11.5, PLAYER_RADIUS, { z, band })) {
    console.log('FAIL at', px.toFixed(2), 'z', z.toFixed(2), 'band', band)
    // 逐采样点诊断
    const r = PLAYER_RADIUS
    for (const [ox, oy] of [[-r,-r],[r,-r],[-r,r],[r,r],[-r,0],[r,0],[0,-r],[0,r]] as const) {
      const sx = px + ox, sy = 11.5 + oy
      const tx = Math.floor(sx), ty = Math.floor(sy)
      const i = ty * gm.w + tx
      const sv = gm.stair[i]
      console.log(`  sample (${sx.toFixed(2)},${sy.toFixed(2)}) tile(${tx},${ty}) tiles=${gm.tiles[i]} stair=${sv & 7} lo=${((sv >> 3) & 0x3fff) / 100} hi=${((sv >> 17) & 0x3fff) / 100} up=${gm.up[i]} up2=${gm.up2[i]} serves1=${sv & 7 ? stairServesBand(sv, 1) : '-'} g=${groundHeightAt(gm, sx, sy, band).toFixed(2)}`)
    }
    break
  }
  z = groundHeightAt(gm, px, 11.5, band)
}
console.log('done, final z', z.toFixed(2))
