// 零差异验收：重新 extractLayouts 后与玩家设计 JSON 逐字段对比（tiles/structures/npcs/lights/exits/zones）。
// 用法：npx tsx --tsconfig .check/tsconfig.run.json .check/diff-verify.mts
import { readFileSync } from 'fs'
;(globalThis as any).AudioContext = undefined
;(globalThis as any).localStorage = undefined
const { extractLayouts } = await import('../src/game/design/extractLayouts.ts')
const d = JSON.parse(readFileSync('.check/player-design.json', 'utf-8'))
const cur = new Map(extractLayouts().map((l) => [l.id, l]))

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }

/** 多重集合序列化（排序后逐元素 JSON 比对） */
const canon = (arr: any[], keyFn: (o: any) => string) => arr.map(keyFn).sort()
const sKey = (s: any) => JSON.stringify([s.kind, s.x, s.y, s.w, s.h, s.solid, s.floor ?? 0, s.deg ?? null, s.data ?? null])
const nKey = (n: any) => JSON.stringify([n.id, n.x, n.y, n.floor ?? 0, n.flavor ?? null])
const lKey = (l: any) => JSON.stringify([l.x, l.y, l.r, l.color])
const eKey = (e: any) => JSON.stringify([e.kind, e.name, e.dest, e.x, e.y])
const zKey = (z: any) => JSON.stringify([z.name, z.x, z.y, z.z ?? 0, z.x0 ?? null, z.y0 ?? null, z.x1 ?? null, z.y1 ?? null])

const cmp = (id: string, label: string, a: any[], b: any[], keyFn: (o: any) => string) => {
  const ca = canon(a, keyFn), cb = canon(b, keyFn)
  if (ca.length !== cb.length) { bad(`${id} ${label} 数量 ${ca.length} ≠ ${cb.length}`); return }
  for (let i = 0; i < ca.length; i++)
    if (ca[i] !== cb[i]) bad(`${id} ${label} 差异：当前 ${ca[i]} ↔ 设计 ${cb[i]}`)
}

for (const l of d.layouts) {
  const c = cur.get(l.id) as any
  if (!c) { bad(`${l.id} 当前不存在`); continue }
  // tiles 逐行字符串
  if (c.tiles.join('\n') !== l.tiles.join('\n')) {
    let n = 0
    for (let y = 0; y < l.tiles.length; y++)
      for (let x = 0; x < l.tiles[y].length; x++)
        if (c.tiles[y]?.[x] !== l.tiles[y][x] && n++ < 10) bad(`${l.id} tile (${x},${y}) 当前 '${c.tiles[y]?.[x]}' ≠ 设计 '${l.tiles[y][x]}'`)
    bad(`${l.id} tiles 共 ${n} 格差异`)
  }
  cmp(l.id, 'structures', c.structures ?? [], l.structures ?? [], sKey)
  cmp(l.id, 'npcs', c.npcs ?? [], l.npcs ?? [], nKey)
  cmp(l.id, 'lights', c.lights ?? [], l.lights ?? [], lKey)
  cmp(l.id, 'exits', c.exits ?? [], l.exits ?? [], eKey)
  cmp(l.id, 'zones', c.zones ?? [], l.zones ?? [], zKey)
  console.log(`${l.id} 比对完成`)
}

if (fail) { console.log(`\n✗ ${fail} 项差异`); process.exit(1) }
console.log('\n✓ 4 个据点布局与玩家设计零差异')
