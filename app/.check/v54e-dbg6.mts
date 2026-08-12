;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const dump = (id: number, spots: [number, number, number][]) => { // [x,y,floor]
  const m = generateLevel(levelDefOf(id)!, 424242, true)
  console.log(`== id ${id} ==`)
  for (const [sx, sy, f] of spots) {
    console.log(`-- (${sx},${sy})@f${f}`)
    for (let y = sy - 2; y <= sy + 2; y++) {
      let r = ''
      for (let x = sx - 3; x <= sx + 3; x++) {
        const i = y * m.w + x
        const fl = f === 0 ? m.tiles[i] === 1 : f === 1 ? m.up[i] === 1 && m.upWall[i] !== 1 : m.up2[i] === 1 && m.upWall2[i] !== 1
        const wl = f === 0 ? m.tiles[i] !== 1 : f === 1 ? m.upWall[i] === 1 : m.upWall2[i] === 1
        r += x === sx && y === sy ? 'T' : wl ? '#' : fl ? '.' : '~' // ~=该层带无板（虚空/洞）
      }
      console.log('   ', r)
    }
  }
}
dump(101, [[20, 23, 0], [6, 34, 0]])
dump(102, [[33, 8, 0]])
dump(105, [[13, 48, 1], [13, 52, 1], [68, 50, 1]])
dump(106, [[36, 15, 0], [40, 26, 2], [59, 26, 2], [14, 18, 2], [36, 18, 2], [39, 18, 2]])
