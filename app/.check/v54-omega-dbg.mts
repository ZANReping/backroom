// 快速验证 Omega 生成：连通/出口/NPC
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { levelDefOf } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const m = generateLevel(levelDefOf(109)!, 424242, true)
console.log('exits', m.exits.map((e) => `${e.def.kind}→${e.def.dest}@(${e.x},${e.y})`))
console.log('npcs', (m.npcs ?? []).map((n) => n.id).join(','))
console.log('structs', m.structures.length, 'lights', m.lights.length, 'zones', (m.zones ?? []).length)
// 简易 BFS（结构视为阻挡，门可通）
const OPENABLE = ['hoteldoor', 'rollerdoor', 'glassdoor']
const solid = (x: number, y: number) => m.structures.some((s) => s.solid && !OPENABLE.includes(s.kind) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
const seen = new Uint8Array(m.w * m.h)
const q = [m.spawn.x + m.spawn.y * m.w]; seen[q[0]] = 1
while (q.length) {
  const c = q.pop()!, cx = c % m.w, cy = Math.floor(c / m.w)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = cx + dx, ny = cy + dy, ni = ny * m.w + nx
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || seen[ni] || m.tiles[ni] !== 1 || solid(nx, ny)) continue
    seen[ni] = 1; q.push(ni)
  }
}
let un = 0, tot = 0
for (let i = 0; i < m.w * m.h; i++) if (m.tiles[i] === 1 && !solid(i % m.w, Math.floor(i / m.w))) { tot++; if (!seen[i]) un++ }
console.log('unreached', un, '/', tot)
for (const e of m.exits) console.log('exit reach', e.def.kind, !!seen[e.y * m.w + e.x])
