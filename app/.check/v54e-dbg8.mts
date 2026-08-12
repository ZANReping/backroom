;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const dump = (id: number, x0: number, y0: number, x1: number, y1: number) => {
  const m = generateLevel(levelDefOf(id)!, 424242, true)
  console.log(`== ${id} (${x0},${y0})-(${x1},${y1}) ==`)
  console.log('    ' + Array.from({ length: x1 - x0 + 1 }, (_, i) => (x0 + i) % 10).join(''))
  for (let y = y0; y <= y1; y++) {
    let r = ''
    for (let x = x0; x <= x1; x++) r += m.tiles[y * m.w + x] === 1 ? '.' : '#'
    console.log(String(y).padStart(3) + ' ' + r)
  }
  for (const s of m.structures)
    if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1 && (s.floor ?? 0) === 0)
      console.log(`   ${s.kind}@${s.x},${s.y}${s.solid ? ' solid' : ''}`)
}
dump(101, 15, 20, 27, 30) // 生活区（walltv 20,23）
dump(101, 2, 31, 14, 40) // 训练厅西（megposter 6,34）
dump(102, 28, 3, 40, 12) // screenboard 33,8
