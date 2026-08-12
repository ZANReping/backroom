// v55c（任务3）：L5 卡顿优化离线计时——对 L5 无限窗口实测：
//   ① updateStructs 逐帧过滤：旧「逐结构复合判定」vs 新「animTrack 预登记一次读」；
//   ② structBlocksPoint：旧全表线性扫描 vs 新瓦片桶索引（随机点查询 3 万次）；
//   ③ 窗口生成耗时参考（L4/L5 对比）。
// 用法：npx tsx --tsconfig .check/tsconfig.run.json .check/v55-perf.mts
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { LEVELS } = await import('../src/game/levels/index.ts')
const { generateLevel, structBlocksPoint, structColliders, STEP_UP } = await import('../src/game/world/mapgen.ts')

const m5 = generateLevel(LEVELS[5], 424242)
const m4 = generateLevel(LEVELS[4], 424242)
const solid5 = m5.structures.filter((s) => s.solid).length
console.log(`L5 窗口结构：总 ${m5.structures.length} / 实心 ${solid5}（L4 对照：总 ${m4.structures.length} / 实心 ${m4.structures.filter((s) => s.solid).length}）`)

// ---- ① updateStructs 过滤路径 ----
const CONTAINER_ANIM: Record<string, number> = { crate: 6, corpse: 6, car: 6, cabinet: 6, dresser: 6, megcrate: 6, locker: 11, toolbox: 6, suitcase: 6, fridge: 5, safebox: 2.6, mailbox: 8, barrel: 6, bookcase: 6, bonepile: 5, campstall: 6, elecbox: 6, binshelf: 6 }
const structs = m5.structures
// 预登记（与新渲染路径一致）
const flagged = structs.map((s) => s.kind === 'lift' || s.kind === 'phonograph' || s.kind in CONTAINER_ANIM
  || ['hoteldoor', 'rollerdoor', 'glassdoor', 'inkdoor', 'bargate'].includes(s.kind) || (s.kind === 'table' && !!s.data?.drink))
const N1 = 2000 // 帧数（每帧全量遍历）
let t0 = performance.now()
let hitOld = 0
for (let f = 0; f < N1; f++)
  for (const s of structs) {
    // 旧路径：逐结构复合判定（kind 比较 + 两个 Record/数组查询）
    const isDoor = s.kind === 'hoteldoor' || s.kind === 'rollerdoor' || s.kind === 'glassdoor' || s.kind === 'inkdoor' || s.kind === 'bargate'
    const anim = s.kind === 'lift' || s.kind === 'phonograph' || isDoor || s.kind in CONTAINER_ANIM || (s.kind === 'table' && !!s.data?.drink)
    if (anim) hitOld++
  }
const oldMs = performance.now() - t0
t0 = performance.now()
let hitNew = 0
for (let f = 0; f < N1; f++)
  for (let i = 0; i < structs.length; i++) if (flagged[i]) hitNew++
const newMs = performance.now() - t0
console.log(`① updateStructs 过滤（${N1} 帧 × ${structs.length} 结构）：旧 ${oldMs.toFixed(1)}ms → 新 ${newMs.toFixed(1)}ms`
  + `（每帧 ${(oldMs / N1 * 1000).toFixed(1)}µs → ${(newMs / N1 * 1000).toFixed(1)}µs；进动画循环 ${hitNew / N1 | 0} 件/帧）`)

// ---- ② structBlocksPoint：旧线性扫描 vs 新瓦片桶 ----
const N2 = 30000
const rng = (() => { let s2 = 12345; return () => (s2 = (s2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff })()
const pts: [number, number][] = []
for (let i = 0; i < N2; i++) pts.push([rng() * m5.w, rng() * m5.h])
// 旧实现（全表线性扫描，逐语句等价）
const oldScan = (x: number, y: number) => {
  for (const s of m5.structures) {
    if (!s.solid || (s.floor ?? 0) !== 0) continue
    if (x < s.x - 0.6 || x > s.x + s.w + 0.6 || y < s.y - 0.6 || y > s.y + s.h + 0.6) continue
    for (const b of structColliders(s, m5)) {
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue
      if (b.top - 0 > STEP_UP) return true
    }
  }
  return false
}
t0 = performance.now()
let a = 0
for (const [x, y] of pts) if (oldScan(x, y)) a++
const scanOldMs = performance.now() - t0
t0 = performance.now()
let b = 0
for (const [x, y] of pts) if (structBlocksPoint(m5, x, y, 0, 0)) b++
const scanNewMs = performance.now() - t0
console.log(`② structBlocksPoint（${N2} 次随机点查询）：旧线性 ${scanOldMs.toFixed(1)}ms → 新桶索引 ${scanNewMs.toFixed(1)}ms`
  + `（单次 ${(scanOldMs / N2 * 1000).toFixed(2)}µs → ${(scanNewMs / N2 * 1000).toFixed(2)}µs，提速 ${(scanOldMs / Math.max(0.01, scanNewMs)).toFixed(1)}×）`)
if (a !== b) { console.log(`  ✗ 新旧结果不一致：旧 ${a} 次阻挡 vs 新 ${b} 次`); process.exit(1) }
console.log(`  ✓ 新旧实现查询结果一致（${a} 次阻挡）`)

// ---- ③ 窗口生成耗时参考 ----
for (const [id, name] of [[4, 'L4'], [5, 'L5']] as const) {
  const t1 = performance.now()
  generateLevel(LEVELS[id], 777)
  console.log(`③ generateLevel ${name} 单窗生成 ${(performance.now() - t1).toFixed(1)}ms（参考）`)
}
console.log('\n✓ 性能计时完成')
