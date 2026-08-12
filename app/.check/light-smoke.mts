// L0 保底照明校验：非熄灯/非红室 chunk 的每个 8×8 网格格内（有地板处）至少 1 盏灯
;(globalThis as any).AudioContext = undefined
;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
;(globalThis as any).document = { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }
;(globalThis as any).localStorage = undefined
const { generateInfinite, CS } = await import('../src/game/world/infinite.ts')
const { LEVELS } = await import('../src/game/levels/index.ts')

let fail = 0
for (const seed of [1, 20260728, 777]) {
  const m = generateInfinite(LEVELS[0], seed)
  let cells = 0, litCells = 0, chunks = 0, totalLights = 0
  for (const c of m.inf!.chunks.values()) {
    if (c.variant === 'blackout' || c.variant === 'red') continue
    chunks++
    totalLights += c.lights.length
    for (let gy = 0; gy < 4; gy++)
      for (let gx = 0; gx < 4; gx++) {
        let hasFloor = false
        for (let y = gy * 8; y < gy * 8 + 8 && !hasFloor; y++)
          for (let x = gx * 8; x < gx * 8 + 8; x++) if (c.tiles[y * CS + x] === 1) { hasFloor = true; break }
        if (!hasFloor) continue
        cells++
        const hit = c.lights.some((l) => {
          const lx = Math.floor(l.x - (c.cx * CS - m.inf!.ox)), ly = Math.floor(l.y - (c.cy * CS - m.inf!.oy))
          return lx >= gx * 8 && lx < gx * 8 + 8 && ly >= gy * 8 && ly < gy * 8 + 8
        })
        if (hit) litCells++
      }
  }
  const avg = (totalLights / Math.max(1, chunks)).toFixed(1)
  if (litCells < cells) { console.log(`  ✗ seed ${seed}: ${cells - litCells}/${cells} 格无灯（平均每 chunk ${avg} 盏）`); fail++ }
  else console.log(`  ✓ seed ${seed}: ${cells} 个网格格全部有灯（${chunks} chunk，平均每 chunk ${avg} 盏）`)
}
console.log(fail === 0 ? '\n✓ 保底照明校验通过' : `\n✗ ${fail} 项失败`)
process.exit(fail ? 1 : 0)
