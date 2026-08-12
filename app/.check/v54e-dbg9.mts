;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(105)!, 424242, true)
console.log('    ' + Array.from({ length: 62 }, (_, i) => (10 + i) % 10).join(''))
for (let y = 42; y <= 62; y++) {
  let r = ''
  for (let x = 10; x <= 71; x++) {
    const i = y * m.w + x
    r += m.upWall[i] === 1 ? '#' : m.up[i] === 1 ? '.' : '~'
  }
  console.log(String(y).padStart(3) + ' ' + r)
}
