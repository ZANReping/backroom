// 玩家设计 JSON ↔ 当前提取的完整差异明细（tiles 逐格 / 结构增删 / NPC 移位 / 灯增删 / 出口 / 区域）
// 用法：npx tsx --tsconfig .check/tsconfig.run.json .check/diff-full.mts
import { readFileSync } from 'fs'
;(globalThis as any).AudioContext = undefined
;(globalThis as any).localStorage = undefined
const { extractLayouts } = await import('../src/game/design/extractLayouts.ts')
const d = JSON.parse(readFileSync('.check/player-design.json', 'utf-8')) // 玩家设计（已从 Downloads 复制到项目内）
const cur = new Map(extractLayouts().map((l) => [l.id, l]))
const skey = (s: any) => `${s.kind}@${s.x},${s.y},${s.w}x${s.h}`
const lkey = (l: any) => `${l.x},${l.y},${l.r},${l.color}`
const fmtS = (s: any) => skey(s) + (s.deg !== undefined ? ` deg=${s.deg}` : '') + (s.data ? ` data=${JSON.stringify(s.data)}` : '') + (s.solid ? '' : ' 非实心')
for (const l of d.layouts) {
  const c = cur.get(l.id) as any
  console.log(`\n===== ${l.id} =====`)
  // tiles 逐格
  const td: string[] = []
  for (let y = 0; y < l.tiles.length; y++)
    for (let x = 0; x < l.tiles[y].length; x++) {
      const a = c.tiles[y]?.[x], b = l.tiles[y][x]
      if (a !== b) td.push(`(${x},${y}) '${a}'→'${b}'`)
    }
  console.log(`tiles 差异 ×${td.length}${td.length > 40 ? '（前 40）' : ''}:`)
  console.log(' ', td.slice(0, 40).join(' '))
  // 结构增删（同 key 多重集合）
  const cm = new Map<string, number>(), nm = new Map<string, number>()
  for (const s of c.structures ?? []) cm.set(skey(s), (cm.get(skey(s)) ?? 0) + 1)
  for (const s of l.structures ?? []) nm.set(skey(s), (nm.get(skey(s)) ?? 0) + 1)
  const added: any[] = [], removed: any[] = []
  for (const s of l.structures ?? []) { const k = skey(s); if ((cm.get(k) ?? 0) > 0) cm.set(k, cm.get(k)! - 1); else added.push(s) }
  const cm2 = new Map<string, number>(), nm2 = new Map<string, number>()
  for (const s of l.structures ?? []) nm2.set(skey(s), (nm2.get(skey(s)) ?? 0) + 1)
  for (const s of c.structures ?? []) { const k = skey(s); if ((nm2.get(k) ?? 0) > 0) nm2.set(k, nm2.get(k)! - 1); else removed.push(s) }
  console.log(`结构 +${added.length} −${removed.length}`)
  for (const s of added) console.log('  +', fmtS(s))
  for (const s of removed) console.log('  −', fmtS(s))
  // NPC
  for (const n of l.npcs ?? []) {
    const m2 = (c.npcs ?? []).find((q: any) => q.id === n.id && q.id !== 'random')
    if (n.id !== 'random' && m2 && (m2.x !== n.x || m2.y !== n.y)) console.log(`  NPC 移动: ${n.id} (${m2.x},${m2.y}) → (${n.x},${n.y}) floor ${m2.floor}→${n.floor}`)
    if (n.id !== 'random' && !m2) console.log(`  NPC 新增固定: ${n.id} (${n.x},${n.y})`)
  }
  const cr = (c.npcs ?? []).filter((n: any) => n.id === 'random')
  const nr = (l.npcs ?? []).filter((n: any) => n.id === 'random')
  console.log(`  random 居民槽 ${cr.length}→${nr.length}: 当前 [${cr.map((n: any) => `${n.x},${n.y}`).join(' | ')}] → 设计 [${nr.map((n: any) => `${n.x},${n.y}`).join(' | ')}]`)
  const cn = new Set((c.npcs ?? []).map((n: any) => n.id)), nn = new Set((l.npcs ?? []).map((n: any) => n.id))
  const npcDel = [...cn].filter((x) => !nn.has(x) && x !== 'random')
  if (npcDel.length) console.log('  NPC 删除:', npcDel)
  // 灯
  const clm = new Map<string, number>(), nlm = new Map<string, number>()
  for (const li of c.lights ?? []) clm.set(lkey(li), (clm.get(lkey(li)) ?? 0) + 1)
  const ladd: any[] = [], ldel: any[] = []
  for (const li of l.lights ?? []) { const k = lkey(li); if ((clm.get(k) ?? 0) > 0) clm.set(k, clm.get(k)! - 1); else ladd.push(li) }
  const nlm2 = new Map<string, number>()
  for (const li of l.lights ?? []) nlm2.set(lkey(li), (nlm2.get(lkey(li)) ?? 0) + 1)
  for (const li of c.lights ?? []) { const k = lkey(li); if ((nlm2.get(k) ?? 0) > 0) nlm2.set(k, nlm2.get(k)! - 1); else ldel.push(li) }
  console.log(`灯 +${ladd.length} −${ldel.length}`)
  for (const li of ladd.slice(0, 30)) console.log('  +', lkey(li))
  for (const li of ldel.slice(0, 30)) console.log('  −', lkey(li))
  if (ladd.length > 30 || ldel.length > 30) console.log('  …（截断）')
  // 出口/区域
  console.log('  exits:', JSON.stringify(c.exits?.map((e: any) => [e.kind, e.x, e.y])), '→', JSON.stringify(l.exits?.map((e: any) => [e.kind, e.x, e.y])))
  const cz = JSON.stringify(c.zones ?? []), nz = JSON.stringify(l.zones ?? [])
  if (cz !== nz) {
    console.log('  zones 差异:')
    for (const z of l.zones ?? []) {
      const m2 = (c.zones ?? []).find((q: any) => q.name === z.name && (q.z ?? 0) === (z.z ?? 0))
      if (!m2) console.log('    +', JSON.stringify(z))
      else if (JSON.stringify(m2) !== JSON.stringify(z)) console.log('    ~', JSON.stringify(m2), '→', JSON.stringify(z))
    }
    for (const z of c.zones ?? []) if (!(l.zones ?? []).some((q: any) => q.name === z.name && (q.z ?? 0) === (z.z ?? 0))) console.log('    −', JSON.stringify(z))
  } else console.log('  zones 一致')
}
