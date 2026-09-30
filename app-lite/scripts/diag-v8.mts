// v8 诊断：定位玩家报告的生成缺陷（只报告，不断言）
import { generateLevel, structWallClip, structBBox, tileH, JUMP_REACH, type GameMap } from '../src/game/mapgen'
import { LEVELS } from '../src/game/levels'

const idx = (m: GameMap, x: number, y: number) => y * m.w + x
const fl = (m: GameMap, x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[idx(m, x, y)] === 1
const solidAt = (m: GameMap, x: number, y: number) =>
  m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
const OPENABLE = ['hoteldoor', 'rollerdoor', 'glassdoor']
const openableAt = (m: GameMap, x: number, y: number) =>
  m.structures.some((s) => s.solid && OPENABLE.includes(s.kind) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)

function bfs(m: GameMap): Uint8Array {
  const reach = new Uint8Array(m.w * m.h)
  const q: [number, number][] = [[m.spawn.x, m.spawn.y]]
  reach[idx(m, m.spawn.x, m.spawn.y)] = 1
  while (q.length) {
    const [x, y] = q.pop()!
    const h0 = tileH(m, x, y)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy, ii = idx(m, nx, ny)
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || reach[ii]) continue
      if (!fl(m, nx, ny)) continue
      if (solidAt(m, nx, ny) && !openableAt(m, nx, ny)) continue
      if (tileH(m, nx, ny) - h0 > JUMP_REACH) continue
      reach[ii] = 1; q.push([nx, ny])
    }
  }
  return reach
}

const clipStat = new Map<string, number>()
const doorBad: string[] = []
let prefabUnreach = 0
let solidFallback = 0

for (const seed of [42, 7, 1234, 999, 555, 31337, 2024, 88]) {
  for (let lvl = 0; lvl <= 5; lvl++) {
    const m = generateLevel(LEVELS[lvl], seed)
    const reach = bfs(m)
    // 1. 结构卡墙（所有有 3D 模型的结构，含 prefab 内部件）
    for (const s of m.structures) {
      if (s.kind === 'prefabmark' || s.kind === 'wet') continue
      if (structWallClip(m, s)) {
        const k = `L${lvl} ${s.kind}${s.solid ? '' : '(非实心)'}`
        clipStat.set(k, (clipStat.get(k) ?? 0) + 1)
        if (!s.solid) solidFallback++
      }
    }
    // 2. 门依附墙校验（1×1 门：两对侧墙/两对侧地板）
    for (const s of m.structures) {
      if (s.kind === 'door') {
        // L5 客房门模型锚点 (x+w-0.5, y+h/2)：所在瓦片与其东西邻
        const ax = Math.floor(s.x + s.w - 0.5), ay = Math.floor(s.y + s.h / 2)
        const inWallLine = !fl(m, ax, ay) // 门模型应嵌在墙线上
        if (inWallLine) continue
        // 在地板上：两侧（东西）必须是非地板墙，另两侧（南北）是地板 —— 或反之
        const we = !fl(m, ax - 1, ay) && !fl(m, ax + 1, ay)
        const ns = !fl(m, ax, ay - 1) && !fl(m, ax, ay + 1)
        const weF = fl(m, ax - 1, ay) && fl(m, ax + 1, ay)
        const nsF = fl(m, ax, ay - 1) && fl(m, ax, ay + 1)
        if (!((we && nsF) || (ns && weF))) doorBad.push(`[${seed}] L${lvl} door@(${s.x},${s.y},${s.w}x${s.h}) 锚点(${ax},${ay}) 浮空 we=${we} ns=${ns} weF=${weF} nsF=${nsF}`)
      }
      if (s.kind === 'hoteldoor' || s.kind === 'rollerdoor' || s.kind === 'glassdoor') {
        const ax = Math.round(s.x), ay = Math.round(s.y)
        const we = !fl(m, ax - 1, ay) && !fl(m, ax + 1, ay)
        const ns = !fl(m, ax, ay - 1) && !fl(m, ax, ay + 1)
        const weF = fl(m, ax - 1, ay) && fl(m, ax + 1, ay)
        const nsF = fl(m, ax, ay - 1) && fl(m, ax, ay + 1)
        if (!((we && nsF) || (ns && weF))) doorBad.push(`[${seed}] L${lvl} ${s.kind}@(${ax},${ay}) 浮空 we=${we} ns=${ns} weF=${weF} nsF=${nsF}`)
      }
    }
    // 3. prefab 可达性（矩形内必须存在可达开放地板，且 mark 瓦片是地板）
    for (const s of m.structures) {
      if (s.kind !== 'prefabmark' || typeof s.data?.rw !== 'number') continue
      const rx = s.data.rx as number, ry = s.data.ry as number, rw = s.data.rw as number, rh = s.data.rh as number
      let ok = false
      for (let j = ry; j < ry + rh && !ok; j++)
        for (let i = rx; i < rx + rw && !ok; i++) {
          const ii = idx(m, i, j)
          if (m.tiles[ii] === 1 && reach[ii] && !solidAt(m, i, j)) ok = true
        }
      const markTile = m.tiles[idx(m, Math.floor(s.x), Math.floor(s.y))]
      if (!ok || markTile !== 1) {
        prefabUnreach++
        console.log(`  ✗ [${seed}] L${lvl} prefab ${s.data?.prefab} 不可达/mark压墙 open=${ok} markTile=${markTile}`)
      }
    }
  }
}

console.log('\n== 结构卡墙统计 ==')
for (const [k, v] of [...clipStat.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)
if (!clipStat.size) console.log('  （无）')
console.log(`  其中被 fixStructEmbedding 降级为非实心但视觉仍嵌墙: ${solidFallback}`)
console.log('\n== 门浮空 ==')
if (doorBad.length) for (const d of doorBad.slice(0, 40)) console.log(' ', d)
else console.log('  （无）')
console.log(`  共 ${doorBad.length}`)
console.log(`\n== prefab 不可达: ${prefabUnreach} ==`)
