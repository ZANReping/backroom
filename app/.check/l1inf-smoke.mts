// Level 1 无限化校验（v29/v30）：
// 1) 变体覆盖：多个 chunk 坐标范围内 7 种区段变体均出现；出生 chunk (0,0) 恒为天鹰段
// 2) 维护通廊/花园段/衔尾段灯全部 keep（闪烁/停电不熄）
// 3) 出口保底：每超区域恰 1 个出口，类型按区域哈希轮换（多种 kind 出现）
// 4) 出生点合法（地板且无实心结构遮挡）；L1 首访不散出生物资；窗口缝合后 m.lights 停电过滤生效；chunk 边界已打通
// 5) 维护通廊：迷宫走廊 + 墨黑金属门（inkdoor）落在边缘开口
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600 }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
;(globalThis as unknown as Record<string, unknown>).performance = globalThis.performance ?? { now: () => Date.now() }

const { LEVELS } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/mapgen.ts')
const { genL1ChunkRaw, l1VariantOf } = await import('../src/game/infiniteL1.ts')
const { regionHost, CS, RS, GEN_ITEM_BASE } = await import('../src/game/infinite.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)
const def = LEVELS[1]

// 1) 变体覆盖 + 出生 chunk 恒为天鹰段
{
  const seen = new Set<string>()
  for (let cy = -40; cy <= 40; cy++) for (let cx = -40; cx <= 40; cx++) seen.add(l1VariantOf(20260728, cx, cy))
  const want = ['aisle', 'parking', 'storage', 'gothic', 'ouroboros', 'garden', 'maintenance']
  const missing = want.filter((v) => !seen.has(v))
  if (missing.length) bad(`变体覆盖缺失：${missing.join('、')}`)
  else ok(`7 种区段变体均会出现（${[...seen].join('、')}）`)
  if (seen.has('mist') || seen.has('blackout')) bad('已删除的浓雾区/停电区仍会出现')
  let spawnOK = true
  for (const s of [1, 7, 99, 424242, 20260728]) if (l1VariantOf(s, 0, 0) !== 'parking') spawnOK = false
  if (!spawnOK) bad('出生 chunk (0,0) 未恒为天鹰段（parking）')
  else ok('出生 chunk (0,0) 在全部抽样种子下均为天鹰段')
}

// 2) 维护通廊·花园段·衔尾段全 keep
{
  let mtTotal = 0, mtKeep = 0, gdTotal = 0, gdKeep = 0, ouTotal = 0, ouKeep = 0
  for (let cy = -30; cy <= 30 && (mtTotal === 0 || gdTotal === 0 || ouTotal === 0); cy++)
    for (let cx = -30; cx <= 30 && (mtTotal === 0 || gdTotal === 0 || ouTotal === 0); cx++) {
      const v = l1VariantOf(7, cx, cy)
      if (v === 'maintenance' && mtTotal === 0) {
        const ls = genL1ChunkRaw(def, 7, cx, cy).lights
        mtTotal = ls.length
        mtKeep = ls.filter((l) => l.keep === 1).length
      }
      if (v === 'garden' && gdTotal === 0) {
        const ls = genL1ChunkRaw(def, 7, cx, cy).lights
        gdTotal = ls.length
        gdKeep = ls.filter((l) => l.keep === 1).length
      }
      if (v === 'ouroboros' && ouTotal === 0) {
        const ls = genL1ChunkRaw(def, 7, cx, cy).lights
        ouTotal = ls.length
        ouKeep = ls.filter((l) => l.keep === 1).length
      }
    }
  if (mtTotal === 0 || mtKeep !== mtTotal) bad(`维护通廊灯 keep 覆盖 ${mtKeep}/${mtTotal}`)
  else ok(`维护通廊 ${mtTotal} 盏灯全部 keep（闪烁不熄）`)
  if (gdTotal === 0 || gdKeep !== gdTotal) bad(`花园段灯 keep 覆盖 ${gdKeep}/${gdTotal}`)
  else ok(`花园段 ${gdTotal} 盏阳光灯全部 keep`)
  if (ouTotal === 0 || ouKeep !== ouTotal) bad(`衔尾段灯 keep 覆盖 ${ouKeep}/${ouTotal}`)
  else ok(`衔尾段 ${ouTotal} 盏施工灯全部 keep`)
}

// 3) 出口保底 + 类型轮换
{
  const kinds = new Set<string>()
  let checked = 0
  for (let ry = -2; ry <= 2; ry++)
    for (let rx = -2; rx <= 2; rx++) {
      const host = regionHost(99, rx, ry)
      const raw = genL1ChunkRaw(def, 99, host.cx, host.cy)
      if (raw.exits.length !== 1) { bad(`区域(${rx},${ry}) 出口数=${raw.exits.length}（应为 1）`); continue }
      checked++
      kinds.add(raw.exits[0].def.kind)
    }
  if (checked !== 25) fail++
  else if (kinds.size < 2) bad(`25 个区域出口类型只有 ${kinds.size} 种（轮换失效）`)
  else ok(`25 个超区域各 1 个出口，类型轮换覆盖 ${kinds.size} 种（${[...kinds].join('、')}）`)
}

// 3b) 实体极少（v29b：Class 1 安全稳定——常规区段稀疏偶发，维护通廊/花园段几无可遇）
{
  let total = 0, chunks = 0
  for (let cy = -20; cy <= 20; cy++)
    for (let cx = -20; cx <= 20; cx++) {
      const n = genL1ChunkRaw(def, 55, cx, cy).entities.length
      chunks++
      total += n
    }
  const avg = total / chunks
  if (avg > 0.3) bad(`实体密度过高：平均 ${avg.toFixed(2)} 个/chunk（应 ≤0.3）`)
  else ok(`实体极少：平均 ${avg.toFixed(2)} 个/chunk`)
}

// 4) 出生点合法（地板 + 无实心结构遮挡）+ L1 首访不散物资 + 停电 stitch 过滤
{
  const m = generateLevel(def, 424242, true)
  if (!m.inf) { bad('L1 未走无限生成'); process.exit(1) }
  const W = m.w
  const sx = Math.floor(m.spawn.x), sy = Math.floor(m.spawn.y)
  if (m.tiles[sy * W + sx] !== 1) bad('出生点不是地板')
  else if (m.structures.some((s) => s.solid && sx >= s.x && sx < s.x + s.w && sy >= s.y && sy < s.y + s.h)) bad('出生点被实心结构遮挡')
  else ok('出生点合法（地板且无遮挡物）')
  const scatter = m.items.filter((it) => it.id < GEN_ITEM_BASE).length
  if (scatter !== 0) bad(`L1 首访仍散落 ${scatter} 件出生物资（应为 0）`)
  else ok('L1 首访不散出生物资（手电筒等仅 L0 发放）')
  const total = m.lights.length
  m.inf.blackout = true
  // 触发一次窗口平移强制 stitch：直接调用导出的 restitch
  const { restitch } = await import('../src/game/infinite.ts')
  restitch(m)
  const left = m.lights.length
  const keeps = m.lights.filter((l) => l.keep === 1).length
  if (left !== keeps) bad(`停电 stitch 后残留非 keep 灯（${left - keeps} 盏）`)
  else ok(`停电 stitch 过滤生效（${total} → ${left}，仅剩 keep 灯）`)
  m.inf.blackout = false
  restitch(m)
  if (m.lights.length !== total) bad(`恢复供电后灯数 ${m.lights.length} ≠ ${total}`)
  else ok('恢复供电后灯光全部回归')
}

// 5) v31：边界规则（非维护通廊无缝衔接 / 维护通廊单门）+ 变体聚集
{
  const m = generateLevel(def, 424242)
  const W = m.w
  let seamOpen = 0
  for (const seamX of [31, 32, 63, 64, 95, 96, 127, 128])
    for (let y = 0; y < W; y++) if (m.tiles[y * W + seamX] === 1) seamOpen++
  if (seamOpen === 0) bad('chunk 竖直缝合列无开口（玩家无法走出出生 chunk）')
  else ok(`chunk 边界已打通（缝合列共 ${seamOpen} 个开口瓦片）`)
  // 变体聚集：存在对齐 2×2 区块 ≥3 个 chunk 同变体
  let clustered = false
  for (let by = -8; by <= 8 && !clustered; by++)
    for (let bx = -8; bx <= 8 && !clustered; bx++) {
      const vs = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => l1VariantOf(20260728, bx * 2 + i, by * 2 + j))
      const same = Math.max(...[...new Set(vs)].map((v) => vs.filter((q) => q === v).length))
      if (same >= 3) clustered = true
    }
  if (!clustered) bad('变体未聚集（无任何 2×2 区块 ≥3 同变体）')
  else ok('相同区段更易相连（存在 2×2 同变体区块）')
  // 维护通廊：每个非维护通廊邻边恰 1 扇门；门实心且初始关闭；走廊狭窄
  let found = false
  for (let cy = -30; cy <= 30 && !found; cy++)
    for (let cx = -30; cx <= 30 && !found; cx++) {
      if (l1VariantOf(13, cx, cy) !== 'maintenance') continue
      const raw = genL1ChunkRaw(def, 13, cx, cy)
      const doors = raw.structures.filter((s) => s.kind === 'inkdoor')
      const expect = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([i, j]) => l1VariantOf(13, cx + i, cy + j) !== 'maintenance').length
      if (doors.length !== expect) { bad(`维护通廊门数 ${doors.length} ≠ 非维护通廊邻边数 ${expect}`); found = true; break }
      if (doors.some((d) => !d.solid || d.data?.open !== 0)) { bad('墨黑门应为实心且初始关闭'); found = true; break }
      let floor = 0
      for (let i = 0; i < raw.tiles.length; i++) if (raw.tiles[i] === 1) floor++
      const pct = ((floor / raw.tiles.length) * 100).toFixed(0)
      if (floor / raw.tiles.length > 0.4) bad(`维护通廊走廊过宽（地板占比 ${pct}% > 40%）`)
      else ok(`维护通廊：每个非维护通廊邻边恰 1 扇门（本块 ${doors.length} 扇，实心初始关闭），走廊狭窄（地板占比 ${pct}%）`)
      found = true
    }
  if (!found) bad('抽样范围内未找到维护通廊 chunk')
  // 非维护通廊之间：共享边大部分开放（无缝衔接）
  let seamless = -1
  for (let cy = -20; cy <= 20 && seamless < 0; cy++)
    for (let cx = -20; cx <= 20 && seamless < 0; cx++) {
      const v0 = l1VariantOf(7, cx, cy), v1 = l1VariantOf(7, cx + 1, cy)
      if (v0 === 'maintenance' || v1 === 'maintenance') continue
      const a = genL1ChunkRaw(def, 7, cx, cy), b = genL1ChunkRaw(def, 7, cx + 1, cy)
      seamless = 0
      for (let t = 0; t < CS; t++) if (a.tiles[t * CS + CS - 1] === 1 && b.tiles[t * CS] === 1) seamless++
    }
  if (seamless < 12) bad(`非维护通廊间边界开放度不足（${seamless} 格双向打通 < 12）`)
  else ok(`房间无缝衔接（非维护通廊间共享边 ${seamless}/32 格完全开放）`)
}

console.log(fail === 0 ? '\n✓ L1 无限化校验全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
