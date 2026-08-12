;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const gm = generateLevel(levelDefOf(106)!, 424242, true)
for (let y = 34; y <= 42; y++) {
  let row = ''
  for (let x = 10; x <= 25; x++) row += gm.tiles[y * gm.w + x] === 1 ? '.' : '#'
  console.log(y, row)
}
const l = gm.lights.find((l2) => Math.abs(l2.x - 14.5) < 0.01 && Math.abs(l2.y - 38.5) < 0.01)
console.log('light:', JSON.stringify(l))
// 同位置灯在生成早期是否存在？检查 structures 是否 sconce/lightgrid
console.log(gm.structures.filter((s) => (s.kind === 'sconce' || s.kind === 'lightgrid') && Math.abs(s.x + s.w / 2 - 14.5) < 0.6 && Math.abs(s.y + s.h / 2 - 38.5) < 0.6))
