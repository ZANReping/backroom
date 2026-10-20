// v29a 冒烟断言：L7（海洋层）生成分布均匀（不再堆叠出生点）+ 水中生成物 z 高度（漂浮贴水面/致密沉底）
// 运行：npx tsx verifier/v1/smoke-v29-l7.mts
import { LEVELS } from '../../src/game/levels'
import { generateLevel, liquidSurfaceH, POOL_DEPTH, ELEV_H } from '../../src/game/mapgen'

let failures = 0
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else { console.error(`  ✗ ${msg}`); failures++ }
}

console.log('== v29a L7 生成分布 + 水面高度冒烟 ==')
const def = LEVELS.find((l) => l.id === 7)!
const SEEDS = [11, 222, 3333, 44444, 555555]

const SINK = new Set(['canned', 'thingmeat', 'battery', 'wrench', 'crowbar', 'silverware', 'skeleton', 'housekey', 'gas', 'nails', 'presses', 'uvlamp', 'stapler'])

for (const seed of SEEDS) {
  const m = generateLevel(def, seed)
  const W = m.w
  const at = (x: number, y: number) => y * W + x
  const isWater = (x: number, y: number) => m.liquid[at(Math.floor(x), Math.floor(y))] === 1

  // ---- a. 分布：任意两物品不堆叠（同格/近距），整体散布开 ----
  const pts = m.items.map((it) => [it.x, it.y] as const)
  let minNN = Infinity, maxNN = 0
  for (const p of pts) {
    let nn = Infinity
    for (const q of pts) if (q !== p) nn = Math.min(nn, Math.hypot(q[0] - p[0], q[1] - p[1]))
    if (pts.length > 1) { minNN = Math.min(minNN, nn); maxNN = Math.max(maxNN, nn) }
  }
  ok(minNN > 1.0, `seed=${seed} 无物品堆叠（最近邻 min=${minNN.toFixed(2)}m > 1m）`)
  ok(maxNN > 5, `seed=${seed} 物品散布开（最近邻 max=${maxNN.toFixed(2)}m > 5m）`)
  // 出生点兜底检测：不得有多个内容精确压在出生格
  const atSpawn = m.items.filter((it) => Math.floor(it.x) === m.spawn.x && Math.floor(it.y) === m.spawn.y).length
  ok(atSpawn <= 1, `seed=${seed} 出生格物品 ≤1（${atSpawn}）`)
  // 出口远离出生点（margin 12）且不互相堆叠
  for (const e of m.exits) {
    const d = Math.hypot(e.x - m.spawn.x, e.y - m.spawn.y)
    ok(d >= 12, `seed=${seed} 出口「${e.def.name}」距出生点 ${d.toFixed(1)}m ≥12`)
  }

  // ---- b. 水中生成物 z 高度：漂浮物贴水面、致密物沉底 ----
  let waterItems = 0, floatOk = 0, sinkOk = 0
  for (const it of m.items) {
    const tx = Math.floor(it.x), ty = Math.floor(it.y)
    const surface = liquidSurfaceH(m, tx, ty)
    if (surface === null) continue
    waterItems++
    ok((it.z ?? Infinity) <= surface + 1e-6, `seed=${seed} 水中物 ${it.type} z=${it.z?.toFixed(2)} ≤ 水面 ${surface.toFixed(2)}`)
    if (SINK.has(it.type) && m.liquid[at(tx, ty)] === 1) {
      if (Math.abs((it.z ?? 0) - (ELEV_H[m.elev[at(tx, ty)]] - POOL_DEPTH)) < 1e-6) sinkOk++
      else ok(false, `seed=${seed} 致密物 ${it.type} 未沉底（z=${it.z}）`)
    } else {
      if (Math.abs((it.z ?? 0) - surface) < 1e-6) floatOk++
      else ok(false, `seed=${seed} 漂浮物 ${it.type} 未贴水面（z=${it.z}，水面=${surface}）`)
    }
  }
  ok(waterItems > 0, `seed=${seed} 水面有生成物（${waterItems} 件：漂浮 ${floatOk} 沉底 ${sinkOk}）`)

  // ---- c. 栖息地：水生实体在水域/室外，不得压出生格 ----
  for (const e of m.entities) {
    const tx = Math.floor(e.x), ty = Math.floor(e.y)
    const hab = e.def.habitat ?? 'any'
    if (e.def.aquatic) ok(isWater(e.x, e.y) || m.outdoor[at(tx, ty)] === 1, `seed=${seed} 水生实体 ${e.def.type} 在水域/室外`)
    else if (hab === 'any') ok(m.tiles[at(tx, ty)] === 1, `seed=${seed} 实体 ${e.def.type} 在地板瓦片`)
  }

  // ---- d. 水中残骸结构分布（bonepile/barrel 等散在海床）----
  const wrecks = m.structures.filter((s) => ['bonepile', 'fishbones', 'seatarpit', 'barrel'].includes(s.kind))
  const wreckWater = wrecks.filter((s) => m.liquid[at(Math.floor(s.x + s.w / 2), Math.floor(s.y + s.h / 2))] === 1)
  ok(wreckWater.length >= wrecks.length * 0.7, `seed=${seed} 残骸结构大多散于海床（${wreckWater.length}/${wrecks.length}）`)
}

// 多种子分布方差：物品质心不应总是挤在同一区域
{
  const centroids = SEEDS.map((seed) => {
    const m = generateLevel(def, seed)
    const n = m.items.length || 1
    return [m.items.reduce((a, it) => a + it.x, 0) / n, m.items.reduce((a, it) => a + it.y, 0) / n]
  })
  const cx = centroids.map((c) => c[0]), cy = centroids.map((c) => c[1])
  const varX = Math.max(...cx) - Math.min(...cx), varY = Math.max(...cy) - Math.min(...cy)
  ok(varX > 10 && varY > 10, `多种子物品质心分布有方差（Δx=${varX.toFixed(1)} Δy=${varY.toFixed(1)}）`)
}

if (failures > 0) { console.error(`\n${failures} 项断言失败`); process.exit(1) }
console.log('\n全部断言通过')
