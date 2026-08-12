import { readFileSync } from 'fs'
;(globalThis as any).AudioContext = undefined
;(globalThis as any).localStorage = undefined
const { extractLayouts } = await import('../src/game/design/extractLayouts.ts')
const d = JSON.parse(readFileSync('C:/Users/ZANRe/Downloads/backroom-design-2026-08-10T13-53-28-177Z.json', 'utf-8'))
const cur = new Map(extractLayouts().map((l) => [l.id, l]))
for (const l of d.layouts) {
  const c = cur.get(l.id) as any
  console.log('===', l.id)
  // tiles 差异明细
  let diff = 0
  for (let y = 0; y < l.tiles.length && diff < 8; y++)
    for (let x = 0; x < l.tiles[y].length && diff < 8; x++) {
      const a = c.tiles[y]?.[x], b = l.tiles[y][x]
      if (a !== b) { console.log(`  tile (${x},${y}): 当前 '${a}' → 设计 '${b}'`); diff++ }
    }
  if (!diff) console.log('  tiles 无字符差异（可能行长/行数不同）', c.tiles.length, l.tiles.length, c.tiles[0]?.length, l.tiles[0]?.length)
  // npc 差异
  const cn = new Set((c.npcs ?? []).map((n: any) => n.id))
  const nn = new Set((l.npcs ?? []).map((n: any) => n.id))
  console.log('  npc 新增:', [...nn].filter((x) => !cn.has(x)), '删除:', [...cn].filter((x) => !nn.has(x)))
  for (const n of l.npcs ?? []) {
    const m = (c.npcs ?? []).find((q: any) => q.id === n.id)
    if (m && (m.x !== n.x || m.y !== n.y)) console.log(`  npc 移动: ${n.id} (${m.x},${m.y}) → (${n.x},${n.y})`)
  }
  // lights 差异
  const cl = (c.lights ?? []).length, nl = (l.lights ?? []).length
  if (cl !== nl) console.log(`  lights ${cl}→${nl}`)
}
