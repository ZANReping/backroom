// v29 出口机制校验：
// 1) devSummonExit：仅本层可生成的出口种类（L0 可召唤闪烁的墙壁/灰色阶梯，拒绝其他 kind）
// 2) L0 灰色阶梯稀疏保底：每 2×2 超区域恰 1 个（比闪烁的墙壁稀有 4 倍）
// 3) 经灰色阶梯下行 → L1 出生点附近出现「向上的灰色阶梯」，且窗口平移 stitch 后仍被重新注入
// 4) 初始物资仅首次进 L0 刷新（重访不再散落）
// 5) L1 出口仅「楼梯井 / 未上锁的门」且均 → L2
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600 }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
;(globalThis as unknown as Record<string, unknown>).performance = globalThis.performance ?? { now: () => Date.now() }

const { engine } = await import('../src/game/engine.ts')
const { LEVELS } = await import('../src/game/levels/index.ts')
const { regionHost, CS, RS, h32, GEN_ITEM_BASE } = await import('../src/game/world/infinite.ts')
const { infiniteImplFor } = await import('../src/game/world/infiniteRegistry.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

engine.newRun(20260729, 'normal')
engine.paused = false
engine.dev.god = true
engine.introT = 0
engine.devJump(0)

// 1) devSummonExit
{
  const before = engine.map!.exits.length
  if (!engine.devSummonExit('flickerdoor')) bad('召唤闪烁的墙壁失败')
  if (!engine.devSummonExit('graystairs')) bad('召唤灰色阶梯失败')
  if (engine.map!.exits.length !== before + 2) bad(`召唤后出口数异常（${engine.map!.exits.length - before}）`)
  else ok('devSummonExit：本层两种出口均可召唤')
  if (engine.devSummonExit('stairs')) bad('非本层出口（stairs）被错误召唤')
  else ok('非本层出口种类被拒绝')
}

// 2) 灰色阶梯稀疏保底（2×2 超区域 = 16×16 chunk 恰 1 个）
{
  const R2 = RS * 2
  let good = 0
  for (let ry2 = -1; ry2 <= 1; ry2++)
    for (let rx2 = -1; rx2 <= 1; rx2++) {
      const host = { cx: rx2 * R2 + (h32(20260729, 0xe51, rx2, ry2) % R2), cy: ry2 * R2 + (h32(20260729, 0xe52, rx2, ry2) % R2) }
      const raw = infiniteImplFor(0).genRaw(LEVELS[0], 20260729, host.cx, host.cy)
      const gs = raw.exits.filter((e) => e.def.kind === 'graystairs')
      if (gs.length === 1) good++
      else bad(`2×2 超区域(${rx2},${ry2}) 灰色阶梯数=${gs.length}`)
    }
  if (good === 9) ok('每个 2×2 超区域恰 1 个灰色阶梯（比闪烁的墙壁稀有 4 倍）')
}

// 3) 走灰色阶梯下行 → L1 返程阶梯（走上自动返回 L0）+ stitch 重注入
{
  engine.devJump(0)
  engine.dev.god = true
  engine.introT = 0
  if (!engine.devSummonExit('graystairs')) { bad('无法召唤灰色阶梯（用例失效）'); process.exit(1) }
  const m0 = engine.map!
  const e = m0.exits.find((x) => x.def.kind === 'graystairs')!
  const p = engine.player
  // 找走向（第一面「反侧 4 格畅通」的墙，与引擎同优先级）
  const at = (x: number, y: number) => m0.tiles[y * m0.w + x]
  const tx = Math.floor(e.x), ty = Math.floor(e.y)
  let dx = 0, dy = 0
  for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (at(tx + wx, ty + wy) === 1) continue
    let clear = true
    for (let k = 1; k <= 4; k++) if (at(tx - wx * k, ty - wy * k) !== 1) { clear = false; break }
    if (clear) { dx = -wx; dy = -wy; break }
    if (!dx && !dy) { dx = -wx; dy = -wy } // 兜底第一面墙
  }
  p.x = tx + 0.5; p.y = ty + 0.5; p.z = 0
  // 走上阶梯往前走：z 应逐渐变为负，走到底自动换层（无需按 E）
  engine.input.mx = dx; engine.input.my = dy
  let minZ = 0
  for (let f = 0; f < 900 && engine.player.level !== 1; f++) { engine.update(0.02); minZ = Math.min(minZ, engine.player.z) }
  engine.input.mx = 0; engine.input.my = 0
  if (minZ > -1.5) bad(`下行过程 z 未明显下降（minZ=${minZ.toFixed(2)}）`)
  else ok(`走阶梯下行：z 降至 ${minZ.toFixed(2)}m 后自动换层`)
  if (engine.player.level !== 1) bad('走灰色阶梯未到达 Level 1')
  else {
    const m1 = engine.map!
    const back = m1.exits.find((x) => x.def.kind === 'graystairsup' && x.def.dest === 0)
    if (!back) bad('L1 出生点附近没有「向上的灰色阶梯」')
    else {
      const d = Math.hypot(back.x - m1.spawn.x, back.y - m1.spawn.y)
      if (d > 8) bad(`返程阶梯距出生点 ${d.toFixed(1)}m（应 ≤8）`)
      else ok(`返程阶梯出现在 L1 出生点周边（${d.toFixed(1)}m）`)
      // 渲染可见性：必须同时存在于所属 LiveChunk 的出口列表（修复模型隐形）
      const inf = m1.inf!
      const inChunk = [...inf.chunks.values()].some((c) => c.exits.some((x) => x.def.kind === 'graystairsup'))
      if (!inChunk) bad('返程阶梯未注入 LiveChunk（模型不可见）')
      else ok('返程阶梯已注入所属 chunk（可被渲染）')
      // 强制窗口平移 → stitch 后应重新注入
      p.x += 64
      for (let f = 0; f < 5; f++) engine.update(0.02)
      if (!engine.map!.exits.some((x) => x.def.kind === 'graystairsup' && x.def.dest === 0)) bad('窗口平移 stitch 后返程阶梯丢失')
      else ok('窗口平移 stitch 后返程阶梯被重新注入')
      // 走上返程阶梯：z 应上升，走上去自动返回 L0（平移后重取出口对象与窗口坐标）
      const back2 = engine.map!.exits.find((x) => x.def.kind === 'graystairsup' && x.def.dest === 0)!
      const m2 = engine.map!
      const bx = Math.floor(back2.x), by = Math.floor(back2.y)
      const at1 = (x: number, y: number) => m2.tiles[y * m2.w + x]
      let ux = 0, uy = 0
      for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (at1(bx + wx, by + wy) === 1) continue
        let clear = true
        for (let k = 1; k <= 4; k++) if (at1(bx - wx * k, by - wy * k) !== 1) { clear = false; break }
        if (clear) { ux = -wx; uy = -wy; break }
        if (!ux && !uy) { ux = -wx; uy = -wy }
      }
      p.x = bx + 0.5; p.y = by + 0.5; p.z = 0
      engine.input.mx = ux; engine.input.my = uy
      let maxZ = 0
      for (let f = 0; f < 900 && engine.player.level !== 0; f++) { engine.update(0.02); maxZ = Math.max(maxZ, engine.player.z) }
      engine.input.mx = 0; engine.input.my = 0
      if (engine.player.level !== 0) bad(`走返程阶梯未返回 L0（maxZ=${maxZ.toFixed(2)}）`)
      else ok(`走返程阶梯上行：z 升至 ${maxZ.toFixed(2)}m 后自动返回 L0`)
    }
  }
}

// 4) 初始物资仅首次进 L0
{
  engine.newRun(31337, 'normal')
  engine.paused = false
  engine.dev.god = true
  engine.introT = 0
  const nearSpawn = () => {
    const m = engine.map!
    return m.items.filter((it) => it.id < GEN_ITEM_BASE && Math.hypot(it.x - m.spawn.x, it.y - m.spawn.y) < 7).length
  }
  if (nearSpawn() === 0) bad('首次进 L0 出生点没有散落物资')
  else ok('首次进 L0 出生点散落物资正常')
  engine.devJump(1)
  engine.devJump(0) // 重访
  if (nearSpawn() > 0) bad('重访 L0 出生点再次散落物资')
  else ok('重访 L0 不再散落初始物资')
}

// 5) L1 出口仅 楼梯井/未上锁的门 → L2
{
  const exs = LEVELS[1].exits
  const kinds = exs.map((e) => e.kind).sort()
  if (kinds.join() !== 'stairs,unlockeddoor' || exs.some((e) => e.dest !== 2)) bad(`L1 出口配置异常：${JSON.stringify(kinds)}`)
  else ok('L1 出口仅 楼梯井/未上锁的门，均 → Level 2')
}

console.log(fail === 0 ? '\n✓ 出口机制校验全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
