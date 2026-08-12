// 对比玩家设计 JSON 与当前提取的布局差异
import { readFileSync } from 'fs'
;(globalThis as any).AudioContext = undefined
;(globalThis as any).localStorage = undefined
const { extractLayouts } = await import('../src/game/design/extractLayouts.ts')
const d = JSON.parse(readFileSync('C:/Users/ZANRe/Downloads/backroom-design-2026-08-10T13-53-28-177Z.json', 'utf-8'))
const cur = new Map(extractLayouts().map((l) => [l.id, l]))
const key = (s: any) => `${s.kind}@${s.x},${s.y},${s.w}x${s.h}`
for (const l of d.layouts) {
  const c = cur.get(l.id) as any
  if (!c) { console.log(l.id, '当前不存在!'); continue }
  const cs = new Map(c.structures.map((s: any) => [key(s), s]))
  const ns = new Map(l.structures.map((s: any) => [key(s), s]))
  const added = [...ns.keys()].filter((k) => !cs.has(k))
  const removed = [...cs.keys()].filter((k) => !ns.has(k))
  console.log(`${l.id}: 当前${c.structures.length} → 设计${l.structures.length} | 新增 ${added.length} | 删除 ${removed.length}`)
  if (added.length) console.log('  +', added.slice(0, 20).join(' | '))
  if (removed.length) console.log('  -', removed.slice(0, 20).join(' | '))
  // npc/灯/出口差异
  console.log(`  npc 当前${c.npcs?.length ?? 0}→设计${l.npcs?.length ?? 0} | lights ${c.lights?.length ?? 0}→${l.lights?.length ?? 0} | exits ${c.exits?.length ?? 0}→${l.exits?.length ?? 0} | zones ${c.zones?.length ?? 0}→${l.zones?.length ?? 0}`)
  const ct = (c.tiles || []).join('\n'), nt = (l.tiles || []).join('\n')
  console.log('  tiles 一致:', ct === nt)
}
