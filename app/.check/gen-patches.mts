// 由玩家设计 JSON 生成 mapgenOutpost.ts 的落地补丁代码（.check/patch-<id>.txt）。
// 补丁=各据点 gen 函数末尾的一段确定性数据表调用（applyDesignPatch），
// 与手写布局同为生成器代码的一部分；落地后跑 diff-verify.mts 零差异校验。
// 用法：npx tsx --tsconfig .check/tsconfig.run.json .check/gen-patches.mts
import { readFileSync, writeFileSync } from 'fs'
;(globalThis as any).AudioContext = undefined
;(globalThis as any).localStorage = undefined
const { extractLayouts } = await import('../src/game/design/extractLayouts.ts')
const d = JSON.parse(readFileSync('.check/player-design.json', 'utf-8'))
const cur = new Map(extractLayouts().map((l) => [l.id, l]))
const skey = (s: any) => `${s.kind}@${s.x},${s.y},${s.w}x${s.h}`
const lkey = (l: any) => `${l.x},${l.y},${l.r},${l.color}`

for (const l of d.layouts) {
  const c = cur.get(l.id) as any
  // tiles 逐格差异
  const tiles: [number, number, number][] = []
  for (let y = 0; y < l.tiles.length; y++)
    for (let x = 0; x < l.tiles[y].length; x++)
      // 注意：提取器 tiles 编码为 '#'=地板(1) '.'=墙/虚空(2)（与 DESIGN-GUIDE 注释相反，见 diff-verify 头注）
      if (c.tiles[y]?.[x] !== l.tiles[y][x]) tiles.push([x, y, l.tiles[y][x] === '#' ? 1 : 2])
  // 结构增删（多重集合差）
  const cm = new Map<string, number>()
  for (const s of c.structures ?? []) cm.set(skey(s), (cm.get(skey(s)) ?? 0) + 1)
  const structAdd: any[] = []
  for (const s of l.structures ?? []) { const k = skey(s); if ((cm.get(k) ?? 0) > 0) cm.set(k, cm.get(k)! - 1); else structAdd.push(s) }
  const nm = new Map<string, number>()
  for (const s of l.structures ?? []) nm.set(skey(s), (nm.get(skey(s)) ?? 0) + 1)
  const structDel: string[] = []
  for (const s of c.structures ?? []) { const k = skey(s); if ((nm.get(k) ?? 0) > 0) nm.set(k, nm.get(k)! - 1); else structDel.push(k) }
  // NPC：固定 id 移位 + random 槽全量（按顺序）
  const npcPos: Record<string, [number, number, number]> = {}
  for (const n of l.npcs ?? []) {
    if (n.id === 'random') continue
    const m2 = (c.npcs ?? []).find((q: any) => q.id === n.id)
    if (!m2 || m2.x !== n.x || m2.y !== n.y || (m2.floor ?? 0) !== (n.floor ?? 0)) npcPos[n.id] = [n.x, n.y, n.floor ?? 0]
  }
  const randSlots = (l.npcs ?? []).filter((n: any) => n.id === 'random').map((n: any) => [n.x, n.y, n.floor ?? 0])
  const curRand = (c.npcs ?? []).filter((n: any) => n.id === 'random').map((n: any) => [n.x, n.y, n.floor ?? 0])
  const randSame = JSON.stringify(randSlots) === JSON.stringify(curRand)
  // 灯增删
  const clm = new Map<string, number>()
  for (const li of c.lights ?? []) clm.set(lkey(li), (clm.get(lkey(li)) ?? 0) + 1)
  const lightAdd: any[] = []
  for (const li of l.lights ?? []) { const k = lkey(li); if ((clm.get(k) ?? 0) > 0) clm.set(k, clm.get(k)! - 1); else lightAdd.push(li) }
  const nlm = new Map<string, number>()
  for (const li of l.lights ?? []) nlm.set(lkey(li), (nlm.get(lkey(li)) ?? 0) + 1)
  const lightDel: string[] = []
  for (const li of c.lights ?? []) { const k = lkey(li); if ((nlm.get(k) ?? 0) > 0) nlm.set(k, nlm.get(k)! - 1); else lightDel.push(k) }
  // 出口落位（按 def.exits 顺序）与区域（整体替换）
  const exits = (l.exits ?? []).map((e: any) => [e.x, e.y])
  const curExits = (c.exits ?? []).map((e: any) => [e.x, e.y])
  const exitsSame = JSON.stringify(exits) === JSON.stringify(curExits)
  const zonesSame = JSON.stringify(c.zones ?? []) === JSON.stringify(l.zones ?? [])

  // ---- 生成补丁代码 ----
  const lines: string[] = []
  lines.push(`  // ============ v54：设计模式重制（玩家导出 ${d.exportedAt}；零差异校验 .check/diff-verify.mts）============`)
  lines.push(`  applyDesignPatch(m, rng, {`)
  if (tiles.length) {
    lines.push(`    // tiles 开合（${tiles.length} 格；2=墙 1=地板）`)
    lines.push(`    tiles: [${tiles.map((t) => `[${t.join(',')}]`).join(',')}],`)
  }
  if (structDel.length) {
    lines.push(`    // 结构删除 ×${structDel.length}`)
    lines.push(`    structDel: [`)
    for (const k of structDel) lines.push(`      '${k}',`)
    lines.push(`    ],`)
  }
  if (structAdd.length) {
    lines.push(`    // 结构新增 ×${structAdd.length}（deg 落地为 data.deg；其余 data 原样透传）`)
    lines.push(`    structAdd: [`)
    for (const s of structAdd) {
      const o: any = { kind: s.kind, x: s.x, y: s.y, w: s.w, h: s.h, solid: s.solid }
      if (s.floor !== undefined) o.floor = s.floor
      if (s.deg !== undefined) o.deg = s.deg
      if (s.data) o.data = s.data
      lines.push(`      ${JSON.stringify(o)},`)
    }
    lines.push(`    ],`)
  }
  if (Object.keys(npcPos).length) lines.push(`    npcPos: ${JSON.stringify(npcPos)},`)
  if (!randSame) lines.push(`    randSlots: ${JSON.stringify(randSlots)}, // 随机居民槽（含新增；按 npcDefs 顺序）`)
  if (lightDel.length) lines.push(`    lightDel: ${JSON.stringify(lightDel)},`)
  if (lightAdd.length) lines.push(`    lightAdd: ${JSON.stringify(lightAdd)},`)
  if (!exitsSame) lines.push(`    exitPos: ${JSON.stringify(exits)}, // 出口落位（按 def.exits 顺序）`)
  if (!zonesSame) lines.push(`    zones: ${JSON.stringify(l.zones)}, // 区域整体替换（含矩形范围）`)
  lines.push(`  })`)
  writeFileSync(`.check/patch-${l.id}.txt`, lines.join('\n') + '\n')
  console.log(`${l.id}: tiles×${tiles.length} struct+${structAdd.length}/-${structDel.length} npc移位×${Object.keys(npcPos).length} rand${randSame ? '=' : '≠'} light+${lightAdd.length}/-${lightDel.length} exits${exitsSame ? '=' : '≠'} zones${zonesSame ? '=' : '≠'}`)
}
