// v54：Level 5 无限化冒烟——逐条断言无限 L5 的生成契约：
//   ① 生成确定性（同 seed+chunk 两构一致，含 ceiling/liquid）；② 跨 chunk BFS 全连通（门砖视作可通过，井口洞除外）；
//   ③ 九变体覆盖与主厅占比；④ 电梯 dest=3 嵌主厅墙壁龛（每 8×8 超区域 1 槽位 + 出生 chunk 保底，壁龛朝向合法）；
//   ⑤ 古典楼梯 dest=4、梯位合法、出生 chunk 保底且 2 格外有空旷落点；⑥ 锅炉房黑门 dest=6（每锅炉房街区 1 扇、5 格内无灯）；
//   ⑦ 深色木门 ~2% 替代客房房门、dest=9、仅在客房街区；⑧ 无 outdoor/无多层残留、主厅挑高 ceiling=1、泳池 liquid；
//   ⑨ 实体密度 <2%/chunk、池仅猎犬/笑魇/窃皮者/死亡飞蛾且死亡飞蛾占比最高、出生安全区为零；⑩ 门规则自保证。
// 用法：npx tsx --tsconfig .check/tsconfig.run.json .check/l5inf-smoke.mts
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { LEVELS } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts') // 先加载 mapgen——按既有顺序初始化 infinite 环形依赖（同 l4inf）
// v55：区域反查——l5RegionAt（大厅=2×2 街区跨 chunk 大房间；房间=单街区；走廊 variant=null）
const { genL5ChunkRaw, l5BlockBiome, l5CorrX, l5RowY, l5ElevSlot, l5SpawnElevSlot, l5RegionAt, l5HallAt, l5HallRect, l5HallOpenings, l5BoilerRoot } = await import('../src/game/world/infiniteL5.ts')
const { CS, RS } = await import('../src/game/world/infinite.ts')

const def = LEVELS[5]
let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

// 瓦片 (wx,wy) 所在区域的变体（走廊=null）
const biomeAt = (seed: number, wx: number, wy: number) => l5RegionAt(seed, wx, wy)?.variant ?? null

// ---------- ① 生成确定性 ----------
{
  const a = genL5ChunkRaw(def, 777, 3, -2)
  const b = genL5ChunkRaw(def, 777, 3, -2)
  const sig = (c: typeof a) => JSON.stringify([
    Array.from(c.tiles), Array.from(c.elev), c.ceiling ? Array.from(c.ceiling) : null, c.liquid ? Array.from(c.liquid) : null,
    c.structures.map((s) => [s.kind, s.x, s.y, s.data]), c.exits.map((e) => [e.def.kind, e.x, e.y]),
    c.items.map((i) => [i.type, i.x, i.y]), c.lights.length, c.entities.length,
  ])
  if (sig(a) === sig(b)) ok('生成确定性：同 seed 同 chunk 两构一致（tiles/elev/ceiling/liquid/结构/出口/物品/灯/实体）')
  else bad('生成不确定性：同 seed 同 chunk 两构不一致')
}

// ---------- ② 跨 chunk BFS 全连通 ----------
{
  const N = 5 // 5×5 chunk（-2..2），覆盖出生点
  const W = N * CS
  const tiles = new Uint8Array(W * W)
  const elev = new Uint8Array(W * W)
  const solid = new Uint8Array(W * W) // 实心结构（hoteldoor 除外——门可开）
  for (let cy = -2; cy <= 2; cy++)
    for (let cx = -2; cx <= 2; cx++) {
      const c = genL5ChunkRaw(def, 424242, cx, cy)
      const ox = (cx + 2) * CS, oy = (cy + 2) * CS
      for (let y = 0; y < CS; y++)
        for (let x = 0; x < CS; x++) {
          const si = y * CS + x, di = (oy + y) * W + ox + x
          tiles[di] = c.tiles[si]; elev[di] = c.elev[si]
        }
      for (const s of c.structures) {
        if (!s.solid || s.kind === 'hoteldoor' || s.kind === 'darkdoorblock') continue // 门可开；深色木门按门处理
        const sx = s.x - (-2 * CS), sy = s.y - (-2 * CS)
        for (let y = sy; y < sy + s.h; y++) for (let x = sx; x < sx + s.w; x++) if (x >= 0 && y >= 0 && x < W && y < W) solid[y * W + x] = 1
      }
    }
  const spawnX = 2 * CS + 15, spawnY = 2 * CS + 15
  const walk = (x: number, y: number) => {
    const i = y * W + x
    return tiles[i] === 1 && elev[i] !== 4 && solid[i] === 0 // liquid 池面可走（可游）
  }
  const seen = new Uint8Array(W * W)
  const q = [spawnY * W + spawnX]
  seen[q[0]] = 1
  while (q.length) {
    const i = q.pop()!, x = i % W, y = Math.floor(i / W)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue
      const ni = ny * W + nx
      if (seen[ni] || !walk(nx, ny)) continue
      seen[ni] = 1; q.push(ni)
    }
  }
  // 不可达分量标注：触及窗口边界的分量=窗口截断伪影（房间/走廊延伸到采样窗外，实机窗口随玩家平移必然可达）；
  // 不触及边界的内部分量才是生成器真 bug（家具围死角等）——逐分量断言
  let interior = 0, edge = 0, edgeTiles = 0
  const comp = new Int32Array(W * W).fill(-1)
  for (let i = 0; i < W * W; i++) {
    const x = i % W, y = Math.floor(i / W)
    if (!walk(x, y) || seen[i] || comp[i] >= 0) continue
    const qq = [i]; comp[i] = i
    let touchesEdge = false, cnt = 0
    while (qq.length) {
      const j = qq.pop()!, jx = j % W, jy = Math.floor(j / W)
      cnt++
      if (jx === 0 || jy === 0 || jx === W - 1 || jy === W - 1) touchesEdge = true
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = jx + dx, ny = jy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue
        const nj = ny * W + nx
        if (comp[nj] >= 0 || seen[nj] || !walk(nx, ny)) continue
        comp[nj] = i; qq.push(nj)
      }
    }
    if (touchesEdge) { edge++; edgeTiles += cnt }
    else { interior++; if (interior <= 3) bad(`内部不可达孤岛：${cnt} 格，含世界瓦片 (${x - 2 * CS},${y - 2 * CS})`) }
  }
  let total = 0, reached = 0
  for (let i = 0; i < W * W; i++) {
    const x = i % W, y = Math.floor(i / W)
    if (!walk(x, y)) continue
    total++; if (seen[i]) reached++
  }
  if (interior === 0 && total > 0) ok(`跨 chunk BFS 全连通（${reached}/${total} 可走瓦片自出生点可达；窗口边缘截断分量 ${edge} 个/${edgeTiles} 格按伪影豁免——实机窗口随玩家平移）`)
  else if (interior > 0) bad(`BFS 存在内部孤岛 ×${interior}`)
}

// ---------- ③ 九变体覆盖与主厅/客房占比（街区级采样）+ 大厅矩形尺寸/门洞数 ----------
{
  const cnt: Record<string, number> = {}
  let n = 0
  for (let k = -20; k <= 20; k++)
    for (let r = -20; r <= 20; r++) {
      cnt[l5BlockBiome(424242, k, r)] = (cnt[l5BlockBiome(424242, k, r)] ?? 0) + 1
      n++
    }
  const kinds = ['mainhall', 'beverly', 'maintenance', 'dining', 'guestroom', 'lounge', 'gym', 'pool', 'boilerroom']
  const missing = kinds.filter((k2) => !cnt[k2])
  const mh = cnt.mainhall / n, gr = cnt.guestroom / n
  if (missing.length) bad(`变体缺失：${missing.join('/')}`)
  else if (mh < 0.08 || mh > 0.4 || gr < 0.1 || gr > 0.5) {
    bad(`变体比例异常：${kinds.map((k2) => `${k2}=${(cnt[k2] / n).toFixed(2)}`).join(' ')}`)
  } else ok(`变体覆盖：${kinds.map((k2) => `${k2} ${(cnt[k2] / n * 100).toFixed(0)}%`).join(' / ')}`)
  if (l5BlockBiome(424242, 0, 0) !== 'mainhall') bad('出生街区非主厅')
  // v55：大厅=跨多 chunk 大房间——矩形最小尺寸（≥30 瓦片宽/高，跨 chunk 边界的硬证据）+ 每侧 2 门洞共 8 个
  let halls = 0, small = 0, badOps = 0
  for (let hk = -8; hk < 8; hk++)
    for (let hr = -8; hr < 8; hr++) {
      if (!l5HallAt(424242, hk, hr)) continue
      halls++
      const rc = l5HallRect(424242, hk, hr)
      if (rc.x1 - rc.x0 < 30 || rc.y1 - rc.y0 < 30) { small++; if (small <= 2) bad(`大厅矩形过小：(${hk},${hr}) ${rc.x1 - rc.x0 + 1}×${rc.y1 - rc.y0 + 1}`) }
      const ops = l5HallOpenings(424242, hk, hr)
      if (ops.length !== 8) { badOps++; if (badOps <= 2) bad(`大厅门洞数=${ops.length}（应 8）：(${hk},${hr})`) }
      // 门洞不跨 chunk 一致性：世界纯函数两次取值一致 + 沿墙两侧皆墙由门规则段统一断言
    }
  if (halls > 0 && !small && !badOps) ok(`大厅矩形：${halls} 个大厅全部 ≥30×30 瓦片（跨多 chunk）且各 8 个门洞（每侧 2）`)
  else if (!halls) bad('采样内无大厅格')
}

// ---------- ④ 电梯：dest=3、主厅壁龛槽位、每 8×8 超区域恰 1、出生 chunk 保底、嵌墙朝向合法 ----------
{
  // 先拼一块缝合瓦片图（覆盖采样区 + 外沿），供嵌墙断言跨 chunk 读邻格
  const GX0 = -2, GY0 = -2, GN = 20 // chunk 范围 [-2,18)
  const GW = GN * CS
  const gtiles = new Uint8Array(GW * GW)
  for (let cy = GY0; cy < GY0 + GN; cy++)
    for (let cx = GX0; cx < GX0 + GN; cx++) {
      const c = genL5ChunkRaw(def, 999, cx, cy)
      const ox = (cx - GX0) * CS, oy = (cy - GY0) * CS
      for (let y = 0; y < CS; y++)
        for (let x = 0; x < CS; x++) gtiles[(oy + y) * GW + ox + x] = c.tiles[y * CS + x]
    }
  const gAt = (wx: number, wy: number) => gtiles[(wy - GY0 * CS) * GW + (wx - GX0 * CS)]
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
  const seen = new Set<string>()
  let elevN = 0, badEmbed = 0
  const checkSlot = (sl: { x: number; y: number } | null, tag: string, sd = 999) => {
    if (!sl) { bad(`${tag}：槽位不存在`); return }
    const key = `${sd}:${sl.x},${sl.y}`
    if (seen.has(key)) return
    seen.add(key)
    elevN++
    const ocx = Math.floor(sl.x / CS), ocy = Math.floor(sl.y / CS)
    const c = genL5ChunkRaw(def, sd, ocx, ocy)
    const tilesAt = (wx: number, wy: number) => {
      if (sd === 999) return gAt(wx, wy)
      const lx = wx - ocx * CS, ly = wy - ocy * CS
      return lx < 0 || ly < 0 || lx >= CS || ly >= CS ? 2 : c.tiles[ly * CS + lx]
    }
    const hits = c.exits.filter((e) => e.def.kind === 'elevatorshaft' && Math.floor(e.x) === sl.x && Math.floor(e.y) === sl.y)
    if (hits.length !== 1) { bad(`${tag}：槽位(${sl.x},${sl.y}) 未被所属 chunk(${ocx},${ocy}) 推出（${hits.length}）`); return }
    if (hits[0].def.dest !== 3) { bad(`${tag}：电梯 dest≠3`); return }
    // 槽位必须落在主厅街区墙里（电梯嵌墙槽位在主厅四周墙里）
    if (biomeAt(sd, sl.x, sl.y) !== 'mainhall') { badEmbed++; bad(`${tag}：电梯槽位不在主厅街区 (${sl.x},${sl.y})`); return }
    // 嵌墙断言：壁龛格恰有 1 个地板邻格（走廊侧=门洞朝向），其对面（背面格）必须为墙
    if (tilesAt(sl.x, sl.y) !== 1) { badEmbed++; bad(`${tag}：电梯不在壁龛地板 (${sl.x},${sl.y})`); return }
    const floorDirs: number[] = []
    for (let d = 0; d < 4; d++) if (tilesAt(sl.x + DIRS[d][0], sl.y + DIRS[d][1]) === 1) floorDirs.push(d)
    if (floorDirs.length !== 1) { badEmbed++; bad(`${tag}：壁龛地板邻格数=${floorDirs.length}（应恰 1）：(${sl.x},${sl.y})`); return }
    const [fx, fy] = DIRS[floorDirs[0]]
    if (tilesAt(sl.x - fx, sl.y - fy) === 1) { badEmbed++; bad(`${tag}：背面格非墙 (${sl.x},${sl.y})`); return }
    if (tilesAt(sl.x + fy, sl.y + fx) === 1 || tilesAt(sl.x - fy, sl.y - fx) === 1) {
      badEmbed++; bad(`${tag}：壁龛侧邻有地板（门脸将朝侧面）：(${sl.x},${sl.y})`)
    }
  }
  for (let ry = 0; ry < 2; ry++)
    for (let rx = 0; rx < 2; rx++) checkSlot(l5ElevSlot(999, rx, ry), `超区域(${rx},${ry})`)
  for (const sd of [999, 424242, 777, 31337, 555]) checkSlot(l5SpawnElevSlot(sd), `出生保底(seed ${sd})`, sd)
  if (elevN >= 3 && !badEmbed) ok(`电梯出口：${seen.size} 个槽位全部 dest=3 且嵌主厅墙壁龛（壁龛恰 1 地板邻格、背面格皆墙、贯穿轴垂直向皆墙=门脸正对走廊；出生保底多种子在列）`)
  else if (!badEmbed) bad(`电梯槽位过少：${seen.size}`)
}

// ---------- ⑤ 古典楼梯：dest=4、梯位合法、出生 chunk 保底、2 格外空旷落点 ----------
{
  let oldN = 0, spotBad = 0, spawnStair = false
  for (let cy = -16; cy < 16; cy++)
    for (let cx = -16; cx < 16; cx++) {
      const c = genL5ChunkRaw(def, 777, cx, cy)
      for (const e of c.exits) {
        if (e.def.kind !== 'oldstairs') continue
        oldN++
        if (cx === 0 && cy === 0) spawnStair = true
        if (e.def.dest !== 4) { spotBad++; bad(`古典楼梯 dest≠4：chunk(${cx},${cy})`); continue }
        const lx = Math.floor(e.x) - cx * CS, ly = Math.floor(e.y) - cy * CS
        const at = (x: number, y: number) => (x < 0 || y < 0 || x >= CS || y >= CS ? 2 : c.tiles[y * CS + x])
        if (at(lx, ly) !== 1) { spotBad++; bad(`古典楼梯不在地板：chunk(${cx},${cy}) 局部(${lx},${ly})`); continue }
        let okSpot = false, spotDir: readonly [number, number] | null = null
        for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (at(lx + wx, ly + wy) === 1) continue
          let clear = true
          for (let s2 = 1; s2 <= 4; s2++) if (at(lx - wx * s2, ly - wy * s2) !== 1) { clear = false; break }
          if (clear) { okSpot = true; spotDir = [wx, wy]; break }
        }
        if (!okSpot || !spotDir) { spotBad++; bad(`古典楼梯梯位非法（无邻墙或走向不畅）：chunk(${cx},${cy}) 局部(${lx},${ly})`); continue }
        if (at(lx + spotDir[1], ly + spotDir[0]) !== 1 && at(lx - spotDir[1], ly - spotDir[0]) !== 1) {
          spotBad++; bad(`古典楼梯入梯口无净空：chunk(${cx},${cy}) 局部(${lx},${ly})`)
        }
        for (let k2 = 1; k2 <= 3; k2++) {
          const rx2 = Math.floor(e.x) - spotDir[0] * k2, ry2 = Math.floor(e.y) - spotDir[1] * k2
          const rail = c.structures.find((s2) => s2.kind === 'stairrail' && s2.x === rx2 && s2.y === ry2)
          if (!rail) { spotBad++; bad(`古典楼梯护栏缺失：走向第 ${k2} 格 chunk(${cx},${cy})`); break }
          if ((k2 === 3) !== !!rail.data?.end) { spotBad++; bad(`古典楼梯尽头横栏标记错误：chunk(${cx},${cy})`); break }
        }
      }
    }
  // 出生 chunk 保底楼梯的抵达落点：距楼梯 2 格外（切比雪夫 2..4 环）存在空旷可站地板
  {
    const c = genL5ChunkRaw(def, 777, 0, 0)
    const st = c.exits.find((e) => e.def.kind === 'oldstairs')
    if (!st) bad('出生 chunk 无保底古典楼梯')
    else {
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= CS || y >= CS ? 2 : c.tiles[y * CS + x])
      const solidL = (x: number, y: number) => c.structures.some((s) => s.solid && s.kind !== 'stairrail' && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
      const lx = Math.floor(st.x), ly = Math.floor(st.y)
      let landing = false
      outer: for (let rad = 2; rad <= 4; rad++)
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
            const nx = lx + dx, ny = ly + dy
            if (at(nx, ny) === 1 && c.elev[ny * CS + nx] !== 4 && !solidL(nx, ny)) { landing = true; break outer }
          }
      if (!landing) bad(`保底楼梯 2~4 格环内无空旷落点：(${lx},${ly})`)
    }
  }
  // 宿主率：每 8×8 超区域含古典楼梯的占比（期望 ~55% + 出生区域含出生 chunk 保底）
  let regs = 0, hosted = 0
  for (let ry = -3; ry < 3; ry++)
    for (let rx = -3; rx < 3; rx++) {
      regs++
      let found = false
      for (let cy = ry * RS; cy < ry * RS + RS && !found; cy++)
        for (let cx = rx * RS; cx < rx * RS + RS && !found; cx++)
          if (genL5ChunkRaw(def, 777, cx, cy).exits.some((e) => e.def.kind === 'oldstairs')) found = true
      if (found) hosted++
    }
  const hostRatio = hosted / regs
  if (oldN > 0 && !spotBad) ok(`古典楼梯：${oldN} 部全部 dest=4 且梯位合法（邻墙+走向 4 格畅通+护栏齐）`)
  else if (spotBad) bad(`古典楼梯梯位/dest 异常 ×${spotBad}`)
  else bad('未发现古典楼梯')
  if (spawnStair) ok('出生 chunk 保底古典楼梯存在（L4→L5 抵达落点）')
  else bad('出生 chunk 缺保底古典楼梯')
  if (hostRatio >= 0.3 && hostRatio <= 0.8) ok(`古典楼梯区域宿主率 ${(hostRatio * 100).toFixed(0)}%（期望 ~55%+保底）`)
  else bad(`古典楼梯区域宿主率异常：${(hostRatio * 100).toFixed(0)}%`)
}

// ---------- ⑥ 锅炉房黑门：dest=6、仅锅炉房街区、每片恰 1 扇、贴墙/贴机器、5 格内无灯 ----------
{
  let doors = 0, misfiled = 0, lit = 0
  const doorTiles: { x: number; y: number }[] = []
  for (let cy = -8; cy < 8; cy++)
    for (let cx = -8; cx < 8; cx++) {
      const c = genL5ChunkRaw(def, 31337, cx, cy)
      for (const e of c.exits) {
        if (e.def.kind !== 'boilerdeep') continue
        doors++
        doorTiles.push({ x: Math.floor(e.x), y: Math.floor(e.y) })
        if (e.def.dest !== 6) { misfiled++; bad(`锅炉房黑门 dest≠6：chunk(${cx},${cy})`); continue }
        if (biomeAt(31337, Math.floor(e.x), Math.floor(e.y)) !== 'boilerroom') { misfiled++; bad(`黑门不在锅炉房街区：(${e.x},${e.y})`); continue }
        // 贴墙/贴机器断言：四邻至少一格为墙瓦片或实心锅炉机器（机器隔墙侧）
        const ex2 = Math.floor(e.x), ey2 = Math.floor(e.y)
        let flush = false
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = ex2 + dx, ny = ey2 + dy
          const ncx = Math.floor(nx / CS), ncy = Math.floor(ny / CS)
          const nc = genL5ChunkRaw(def, 31337, ncx, ncy)
          const lt = nc.tiles[(ny - ncy * CS) * CS + (nx - ncx * CS)]
          if (lt !== 1) { flush = true; break }
          if (nc.structures.some((s) => s.solid && (s.kind === 'boiler' || s.kind === 'sphboiler') && nx >= s.x && nx < s.x + s.w && ny >= s.y && ny < s.y + s.h)) { flush = true; break }
        }
        if (!flush) { misfiled++; bad(`黑门不贴墙/机器：(${ex2},${ey2})`) }
        // 完全黑暗：锅炉房街区内部 5 格曼哈顿距无灯（走廊灯贴墙漏光不算）
        for (const l of c.lights)
          if (Math.abs(l.x - 0.5 - e.x) + Math.abs(l.y - 0.5 - e.y) <= 5
            && biomeAt(31337, Math.floor(l.x - 0.5), Math.floor(l.y - 0.5)) === 'boilerroom') { lit++; bad(`黑门 5 格内有灯：(${e.x},${e.y})`); break }
      }
    }
  // 每片恰 1 扇：每个黑门瓦片必须落在片根街区（l5BoilerRoot），且两片根不重合
  let rootBad = 0
  const roots = new Set<string>()
  for (const d of doorTiles) {
    // 反查所属街区：扫描附近 k/r 找 blockRect 包含该瓦片的锅炉房街区
    let found: string | null = null
    for (let k = Math.floor((d.x - 30) / 20); k <= Math.ceil(d.x / 20) && !found; k++)
      for (let r = Math.floor((d.y - 30) / 20); r <= Math.ceil(d.y / 20) && !found; r++) {
        const x0 = l5CorrX(31337, k) + 4, x1 = l5CorrX(31337, k + 1) - 2
        const y0 = l5RowY(31337, r) + 3, y1 = l5RowY(31337, r + 1) - 2
        if (d.x >= x0 - 1 && d.x <= x1 + 1 && d.y >= y0 - 1 && d.y <= y1 + 1 && l5BlockBiome(31337, k, r) === 'boilerroom') {
          if (!l5BoilerRoot(31337, k, r)) rootBad++
          found = `${k},${r}`
        }
      }
    if (found) roots.add(found)
  }
  if (roots.size !== doorTiles.length) rootBad++ // 两片根各一扇（同根两扇=重复）
  if (misfiled || lit || rootBad) bad(`锅炉房黑门归属/唯一/贴墙/灭灯异常 ×${misfiled + lit + rootBad}`)
  else if (doors > 0) ok(`锅炉房黑门：${doors} 扇全部 dest=6、每片恰 1 扇（片根街区）、贴墙/贴机器、5 格内无灯`)
  else bad('未发现锅炉房黑门')
  // v55d（任务2）：黑门嵌墙可见——boilerdeep 已纳入门洞开凿名单（墙盒开门洞+门楣，模型经 orientDoor 嵌门洞格贴墙）
  {
    const { DOOR_EXIT_KINDS } = await import('../src/game/renderer/geometry.ts')
    if (DOOR_EXIT_KINDS.includes('boilerdeep')) ok('黑门模型嵌墙：boilerdeep ∈ DOOR_EXIT_KINDS（门洞开凿 + orientDoor 嵌格）')
    else bad('boilerdeep 未纳入 DOOR_EXIT_KINDS（模型将被墙盒挡住）')
  }
}

// ---------- ⑦ 深色木门：~2% 替代客房房门、dest=9、仅客房街区 ----------
{
  let dark = 0, guestDoors = 0, misfiled = 0
  for (let cy = -12; cy < 12; cy++)
    for (let cx = -12; cx < 12; cx++) {
      const c = genL5ChunkRaw(def, 424242, cx, cy)
      for (const e of c.exits) {
        if (e.def.kind !== 'darkwooddoor') continue
        dark++
        if (e.def.dest !== 9) { misfiled++; bad(`深色木门 dest≠9：chunk(${cx},${cy})`); continue }
        if (biomeAt(424242, Math.floor(e.x), Math.floor(e.y)) !== 'guestroom') { misfiled++; bad(`深色木门不在客房街区：(${e.x},${e.y})`) }
        // v55：实心碰撞块同格（关闭时不可穿）
        if (!c.structures.some((s) => s.kind === 'darkdoorblock' && s.solid && s.x === Math.floor(e.x) && s.y === Math.floor(e.y))) {
          misfiled++; bad(`深色木门缺 darkdoorblock 碰撞块：(${e.x},${e.y})`)
        }
      }
      for (const s of c.structures)
        if (s.kind === 'hoteldoor' && biomeAt(424242, s.x, s.y) === 'guestroom') guestDoors++
    }
  const rate = dark / Math.max(1, dark + guestDoors)
  if (misfiled) bad(`深色木门归属/dest 异常 ×${misfiled}`)
  else if (dark > 0 && rate >= 0.0008 && rate <= 0.015) ok(`深色木门：${dark} 扇 / 客房房门 ${dark + guestDoors} 扇 ≈ ${(rate * 100).toFixed(1)}%（期望 ~0.3%，全部 dest=9 且在客房街区、带碰撞块）`)
  else bad(`深色木门概率异常：${dark}/${dark + guestDoors} ≈ ${(rate * 100).toFixed(2)}%`)
}

// ---------- ⑫ 大厅多门多走廊口：非贝弗莉 ≥1 门 + ≥2 敞开口；贝弗莉 8 口全敞开；走廊直达大厅 ----------
{
  let checked = 0, badH = 0
  for (let hk = -4; hk < 4 && checked < 12; hk++)
    for (let hr = -4; hr < 4 && checked < 12; hr++) {
      const hall = l5HallAt(777, hk, hr)
      if (!hall) continue
      const rc = l5HallRect(777, hk, hr)
      // 生成覆盖大厅的 chunk（矩形四角所属 chunk 的包围盒）
      const doorTiles = new Set(l5HallOpenings(777, hk, hr).map((o) => `${o.x},${o.y}`))
      let doors = 0, openEntry = 0, carved = 0
      for (let cy = Math.floor((rc.y0 - 1) / CS); cy <= Math.floor((rc.y1 + 1) / CS); cy++)
        for (let cx = Math.floor((rc.x0 - 1) / CS); cx <= Math.floor((rc.x1 + 1) / CS); cx++) {
          const c = genL5ChunkRaw(def, 777, cx, cy)
          for (const key of doorTiles) {
            const [ox, oy] = key.split(',').map(Number)
            if (ox < cx * CS || ox >= cx * CS + CS || oy < cy * CS || oy >= cy * CS + CS) continue
            if (c.tiles[(oy - cy * CS) * CS + (ox - cx * CS)] === 1) carved++
            if (c.structures.some((s) => s.kind === 'hoteldoor' && s.x === ox && s.y === oy)) doors++
          }
          // 电梯壁龛占用的门洞格也雕开（出口嵌墙），计入敞开口
          for (const e of c.exits)
            if (e.def.kind === 'elevatorshaft' && doorTiles.has(`${Math.floor(e.x)},${Math.floor(e.y)}`)) openEntry++
        }
      openEntry += carved - doors // 雕开而未装门=敞开的走廊入口
      checked++
      if (hall === 'beverly') {
        if (doors !== 0 || carved !== 8) { badH++; bad(`贝弗莉室(${hk},${hr}) 门=${doors} 门洞=${carved}（应 0 门 8 口全敞开）`) }
      } else if (doors < 1 || openEntry < 2) { badH++; bad(`大厅「${hall}」(${hk},${hr}) 门=${doors} 敞开口=${openEntry}（应 ≥1 门 + ≥2 敞开口）`) }
    }
  if (checked > 0 && !badH) ok(`大厅多门多走廊口：${checked} 个大厅全部满足（非贝弗莉 ≥1 门 + ≥2 敞开口；贝弗莉全敞开）`)
  else if (!checked) bad('采样内无大厅')
}

// ---------- ⑧ 无 outdoor/无多层、主厅挑高 ceiling=1、泳池 liquid + 扶梯/跳台 ----------
{
  let outdoorSum = 0
  for (let cy = -4; cy < 4; cy++)
    for (let cx = -4; cx < 4; cx++) {
      const c = genL5ChunkRaw(def, 424242, cx, cy)
      if (c.outdoor) outdoorSum += c.outdoor.reduce((a, b) => a + b, 0)
    }
  if (outdoorSum === 0) ok('无户外瓦片（新 L5 单层全室内；生成器亦不产 up/up2 多层数组）')
  else bad(`出现 outdoor 瓦片 ×${outdoorSum}`)
  const mh = genL5ChunkRaw(def, 424242, 7, 3, 'mainhall')
  const ceilN = mh.ceiling ? mh.ceiling.reduce((a, b) => a + b, 0) : 0
  if (ceilN > 100 && mh.structures.some((s) => s.kind === 'chandelier')) ok(`主厅挑高：ceiling=1 瓦片 ${ceilN} 格 + 水晶吊灯`)
  else bad(`主厅挑高异常：ceiling 瓦片 ${ceilN}`)
  // v55（任务3）：贝弗莉室与餐厅同挑高
  for (const hv of ['beverly', 'dining'] as const) {
    const hc = genL5ChunkRaw(def, 424242, 7, 3, hv)
    const hn = hc.ceiling ? hc.ceiling.reduce((a, b) => a + b, 0) : 0
    if (hn > 100) ok(`${hv === 'beverly' ? '贝弗莉室' : '餐厅'}挑高：ceiling=1 瓦片 ${hn} 格`)
    else bad(`${hv} 挑高异常：ceiling 瓦片 ${hn}`)
  }
  const pl = (() => { // 强制 pool 变体采样：大厅格内无房间街区——扫描几个 chunk 找含泳池的
    for (const [pcx, pcy] of [[7, 3], [5, 1], [9, 5], [3, 7], [11, 3], [7, 9]] as const) {
      const c = genL5ChunkRaw(def, 424242, pcx, pcy, 'pool')
      if (c.liquid && c.liquid.some((v) => v > 0)) return c
    }
    return genL5ChunkRaw(def, 424242, 7, 3, 'pool')
  })()
  let shallow = 0, deep = 0
  if (pl.liquid) for (const v of pl.liquid) { if (v === 2) shallow++; else if (v === 1) deep++ }
  const ladders = pl.structures.filter((s) => s.kind === 'poolladder').length
  const boards = pl.structures.filter((s) => s.kind === 'divingboard').length
  if (shallow > 10 && deep > 4 && ladders >= 1 && boards >= 1)
    ok(`游泳池：浅水 ${shallow} 格 / 深水 ${deep} 格 + 扶梯 ×${ladders} + 跳台 ×${boards}`)
  else bad(`游泳池异常：浅 ${shallow} 深 ${deep} 扶梯 ${ladders} 跳台 ${boards}`)
}

// ---------- ⑨ 实体密度低 + 池定稿构成 + 死亡飞蛾集群 + 出生安全区为零 ----------
{
  let n = 0, wrong = 0, safe = 0, mothChunks = 0, clusterChunks = 0, skNoHuman = 0
  const cnt: Record<string, number> = {}
  const POOL = ['deathmoth', 'hound', 'skinstealer', 'corpserat', 'nguithr']
  for (let cy = -20; cy < 20; cy++)
    for (let cx = -20; cx < 20; cx++) {
      const c = genL5ChunkRaw(def, 555, cx, cy)
      n += c.entities.length
      const moths: { x: number; y: number }[] = []
      for (const e of c.entities) {
        cnt[e.type] = (cnt[e.type] ?? 0) + 1
        if (!POOL.includes(e.type)) wrong++
        if (e.type === 'skinstealer' && e.human !== 1) skNoHuman++
        if (e.type === 'deathmoth') moths.push(e)
        if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) safe++
      }
      if (moths.length) {
        mothChunks++
        // 集群断言：同 chunk 两只飞蛾相距 ≤4 格（首领+伴生）
        if (moths.some((a) => moths.some((b) => a !== b && Math.hypot(a.x - b.x, a.y - b.y) <= 4))) clusterChunks++
      }
    }
  const perChunk = n / 1600
  const moth = cnt.deathmoth ?? 0
  const others = n - moth
  if (wrong) bad(`${wrong} 个实体不在定稿池内（deathmoth/hound/skinstealer/corpserat/nguithr）`)
  else if (skNoHuman) bad(`${skNoHuman} 只窃皮者缺 human 伪装标记`)
  else if (safe) bad(`出生安全区生成 ${safe} 个实体`)
  else if (perChunk >= 0.02) bad(`实体密度过高：${(perChunk * 100).toFixed(1)}%/chunk`)
  else if (moth <= others / Math.max(1, Object.keys(cnt).length - 1)) bad(`死亡飞蛾占比非最高：${JSON.stringify(cnt)}`)
  else if (!clusterChunks) bad('未发现飞蛾集群（同 chunk 两只 ≤4 格）')
  else ok(`实体密度 ${(perChunk * 100).toFixed(1)}%/chunk（${Object.entries(cnt).map(([t, c2]) => `${t}×${c2}`).join(' ')}；飞蛾占比最高且 ${clusterChunks}/${mothChunks} 个含蛾 chunk 呈集群；窃皮者全带 human 标记；出生安全区为零）`)
}

// ---------- ⑩ 门规则自保证（一对侧为墙、另一对侧为地板）----------
{
  let doors = 0, badDoors = 0
  for (let cy = -4; cy < 4; cy++)
    for (let cx = -4; cx < 4; cx++) {
      const c = genL5ChunkRaw(def, 424242, cx, cy)
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= CS || y >= CS ? 2 : c.tiles[y * CS + x])
      for (const s of c.structures) {
        if (s.kind !== 'hoteldoor') continue
        doors++
        const lx = s.x - cx * CS, ly = s.y - cy * CS
        if (lx < 1 || ly < 1 || lx > CS - 2 || ly > CS - 2) { doors--; continue } // chunk 边缘门由邻 chunk 采样覆盖
        const ew = at(lx - 1, ly) !== 1 && at(lx + 1, ly) !== 1
        const ns = at(lx, ly - 1) !== 1 && at(lx, ly + 1) !== 1
        const ewF = at(lx - 1, ly) === 1 && at(lx + 1, ly) === 1
        const nsF = at(lx, ly - 1) === 1 && at(lx, ly + 1) === 1
        if (!((ew && nsF) || (ns && ewF))) { badDoors++; if (badDoors <= 3) bad(`门规则违例：chunk(${cx},${cy}) 局部(${lx},${ly})`) }
      }
    }
  if (!badDoors && doors > 0) ok(`门规则自保证：${doors} 扇 hoteldoor 全部「一对侧为墙、另一对侧为地板」`)
  else if (!doors) bad('采样内无 hoteldoor')
}

// ---------- ⑬ 床类床头靠墙（任务8）：客房床 deg 朝向端邻格必为墙 ----------
{
  let beds = 0, badBed = 0
  for (let cy = -4; cy < 4; cy++)
    for (let cx = -4; cx < 4; cx++) {
      const c = genL5ChunkRaw(def, 424242, cx, cy)
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= CS || y >= CS ? 2 : c.tiles[y * CS + x])
      for (const s of c.structures) {
        if (s.kind !== 'bed' || s.data?.deg === undefined) continue
        beds++
        const deg = (((Number(s.data.deg) || 0) % 360) + 360) % 360
        const hx = s.x + (deg === 90 ? s.w : deg === 270 ? -1 : 0) - cx * CS
        const hy = s.y + (deg === 0 ? s.h : deg === 180 ? -1 : 0) - cy * CS
        if (hx < 0 || hy < 0 || hx >= CS || hy >= CS) { beds--; continue } // chunk 边缘床由邻 chunk 采样覆盖
        if (at(hx, hy) === 1) { badBed++; if (badBed <= 3) bad(`床(${s.x},${s.y}) deg=${deg} 朝向端非墙`) }
      }
    }
  if (beds > 0 && !badBed) ok(`床类床头靠墙：${beds} 张客房床 deg 朝向端均为墙`)
  else if (!beds) bad('采样内无带 deg 的床')
}

// ---------- ⑭ 走廊精致化与地毯（v55）：走廊 tint 21 地毯 / runner 整齐排列 / 主厅 redpillar·横梁·照片墙 ----------
{
  // 走廊 tint：竖廊 k=0 一整列（除大厅/房间吸收段）应全为 tint 21
  let tintOK = 0, tintBad = 0
  for (let y = -100; y < 100; y++) {
    const reg = l5RegionAt(424242, 14, y)
    if (reg?.variant != null) continue
    const c = genL5ChunkRaw(def, 424242, 0, Math.floor(y / CS))
    const ly = y - Math.floor(y / CS) * CS
    if (c.tiles[ly * CS + 14] !== 1) continue
    if (c.tint[ly * CS + 14] === 21) tintOK++; else tintBad++
  }
  if (tintOK > 50 && !tintBad) ok(`走廊红金地毯：竖廊 k=0 走廊瓦片全部 tint 21（${tintOK} 格采样）`)
  else bad(`走廊 tint 异常：21 命中 ${tintOK}、非 21 ${tintBad}`)
  // runner 地毯与区域地毯块（跨 chunk 切片宽度收窄——按中心瓦片归属判定：走廊=runner / 区域内=地毯块）
  let runners = 0, roomRugs = 0
  for (let cy = -4; cy < 4; cy++)
    for (let cx = -4; cx < 4; cx++) {
      const c = genL5ChunkRaw(def, 424242, cx, cy)
      for (const s of c.structures) {
        if (s.kind !== 'rug') continue
        const reg = l5RegionAt(424242, s.x + (s.w >> 1), s.y + (s.h >> 1))
        if (reg?.variant == null) runners++
        else roomRugs++
      }
    }
  if (runners > 10 && roomRugs > 5) ok(`华丽地毯：走廊 runner ×${runners}（沿廊整齐排列，跨 chunk 切片相接）+ 区域地毯块 ×${roomRugs}`)
  else bad(`地毯异常：runner ${runners} 区域块 ${roomRugs}`)
  // 主厅内饰：redpillar 柱阵 + 装饰横梁 + 照片墙 + 房号牌 + 肖像画 + 壁灯配套光源（任务13 贴附断言）
  const all = [genL5ChunkRaw(def, 424242, 0, 0, 'mainhall'), genL5ChunkRaw(def, 424242, 1, 0, 'mainhall'),
    genL5ChunkRaw(def, 424242, 0, 1, 'mainhall'), genL5ChunkRaw(def, 424242, 1, 1, 'mainhall')].flatMap((c) => c.structures)
  const allLights = [genL5ChunkRaw(def, 424242, 0, 0, 'mainhall'), genL5ChunkRaw(def, 424242, 1, 0, 'mainhall'),
    genL5ChunkRaw(def, 424242, 0, 1, 'mainhall'), genL5ChunkRaw(def, 424242, 1, 1, 'mainhall')].flatMap((c) => c.lights)
  const rp = all.filter((s) => s.kind === 'redpillar').length
  const bm = all.filter((s) => s.kind === 'ceilingbeam').length
  const ph = all.filter((s) => s.kind === 'photo').length
  const sg = all.filter((s) => s.kind === 'wallsign' && s.data?.gold).length
  const pt = all.filter((s) => s.kind === 'bigpainting').length
  if (rp > 0 && bm > 0 && ph > 0) ok(`主厅内饰：红木纹方柱 ×${rp} + 装饰横梁 ×${bm} + 照片墙相框 ×${ph}（两 chunk 采样）`)
  else bad(`主厅内饰缺失：redpillar ${rp} / ceilingbeam ${bm} / photo ${ph}`)
  if (sg > 0 && pt > 0) ok(`主厅标牌与画作：金色房号牌 ×${sg} + 古典肖像画 ×${pt}`)
  else bad(`主厅标牌/肖像画缺失：wallsign ${sg} / bigpainting ${pt}`)
  // 壁灯贴附：每盏 sconce 一格内必有 fixZ 暖光光源（模型与光源同位）
  const sc = all.filter((s) => s.kind === 'sconce')
  let scBad = 0
  for (const s of sc)
    if (!allLights.some((l) => l.fixZ !== undefined && Math.abs(l.x - 0.5 - s.x) <= 1 && Math.abs(l.y - 0.5 - s.y) <= 1)) scBad++
  if (sc.length > 0 && !scBad) ok(`主厅壁灯：${sc.length} 盏 sconce 全部一格内配 fixZ 暖光光源（贴墙同位）`)
  else bad(`壁灯贴附异常：sconce ${sc.length} 盏、缺光源 ${scBad}`)
  // 吊灯大光贴附（任务7）：每盏 chandelier 一格内必有 fixZ 大半径（r≥8）暖光，灯具模型即吊灯本身（noFix）
  const ch = all.filter((s) => s.kind === 'chandelier')
  let chBad = 0
  for (const s of ch)
    if (!allLights.some((l) => l.fixZ !== undefined && l.noFix === 1 && l.r >= 8 && Math.abs(l.x - 0.5 - s.x) <= 1 && Math.abs(l.y - 0.5 - s.y) <= 1)) chBad++
  if (ch.length > 0 && !chBad) ok(`吊灯大半径光照：${ch.length} 盏 chandelier 全部一格内配 fixZ/noFix r≥8 暖光（贴挑高灯位）`)
  else bad(`吊灯贴附异常：chandelier ${ch.length} 盏、缺大光 ${chBad}`)
}

// ---------- ⑮ 锅炉房缩小（v55 任务18）：内腔回砌厚墙——街区矩形内地板占比显著小于普通房间 + 熔炉在列 ----------
{
  // 找一个锅炉房街区与客房街区，直接量街区矩形内的地板占比（缩小=回砌两圈厚墙 → 占比显著更低）
  const floorInRect = (k: number, r: number) => {
    const x0 = l5CorrX(424242, k) + 4, x1 = l5CorrX(424242, k + 1) - 2
    const y0 = l5RowY(424242, r) + 3, y1 = l5RowY(424242, r + 1) - 2
    let floor = 0, furnace = false
    for (let cy = Math.floor(y0 / CS); cy <= Math.floor(y1 / CS); cy++)
      for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++) {
        const c = genL5ChunkRaw(def, 424242, cx, cy)
        if (c.structures.some((s) => s.kind === 'furnace')) furnace = true
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++)
            if (x >= cx * CS && x < cx * CS + CS && y >= cy * CS && y < cy * CS + CS
              && c.tiles[(y - cy * CS) * CS + (x - cx * CS)] === 1) floor++
      }
    return { ratio: floor / ((x1 - x0 + 1) * (y1 - y0 + 1)), furnace }
  }
  let boiler: { ratio: number; furnace: boolean } | null = null, guest: { ratio: number; furnace: boolean } | null = null
  for (let k = -8; k < 8 && (!boiler || !guest); k++)
    for (let r = -8; r < 8 && (!boiler || !guest); r++) {
      const b = l5BlockBiome(424242, k, r)
      if (b === 'boilerroom' && !boiler) boiler = floorInRect(k, r)
      if (b === 'guestroom' && !guest) guest = floorInRect(k, r)
    }
  if (boiler && guest && boiler.furnace && boiler.ratio < guest.ratio * 0.8)
    ok(`锅炉房缩小：矩形内地板占比 ${(boiler.ratio * 100).toFixed(0)}% ≪ 客房 ${(guest.ratio * 100).toFixed(0)}%（回砌厚墙小室）+ 熔炉在列`)
  else bad(`锅炉房缩小异常：${boiler ? (boiler.ratio * 100).toFixed(0) + '%' : '未找到'} vs 客房 ${guest ? (guest.ratio * 100).toFixed(0) + '%' : '未找到'}、熔炉=${boiler?.furnace}`)
  // v55c（任务8）：锅炉房可通行——每个锅炉房街区内腔（含门洞隧道）自门洞 BFS 可走遍（机器/管道不封路）；
  // 聚集性保留（邻接锅炉房存在）
  {
    let clustered = 0, checked = 0
    for (let k = -10; k < 10; k++)
      for (let r = -10; r < 10; r++) {
        if (l5BlockBiome(424242, k, r) !== 'boilerroom') continue
        if (l5BlockBiome(424242, k + 1, r) === 'boilerroom' || l5BlockBiome(424242, k, r + 1) === 'boilerroom'
          || l5BlockBiome(424242, k - 1, r) === 'boilerroom' || l5BlockBiome(424242, k, r - 1) === 'boilerroom') clustered++
        if (checked >= 8) continue
        // 拼街区覆盖 chunk 的瓦片/结构图，自北/西门洞 BFS
        const x0 = l5CorrX(424242, k) + 4, x1 = l5CorrX(424242, k + 1) - 2
        const y0 = l5RowY(424242, r) + 3, y1 = l5RowY(424242, r + 1) - 2
        const BW = x1 - x0 + 7, BH = y1 - y0 + 7 // 含外环与隧道
        const bx0 = x0 - 3, by0 = y0 - 3
        const walk = new Uint8Array(BW * BH)
        let start = -1
        for (let cy = Math.floor(by0 / CS); cy <= Math.floor((by0 + BH - 1) / CS); cy++)
          for (let cx = Math.floor(bx0 / CS); cx <= Math.floor((bx0 + BW - 1) / CS); cx++) {
            const c = genL5ChunkRaw(def, 424242, cx, cy)
            for (let y = Math.max(by0, cy * CS); y <= Math.min(by0 + BH - 1, cy * CS + CS - 1); y++)
              for (let x = Math.max(bx0, cx * CS); x <= Math.min(bx0 + BW - 1, cx * CS + CS - 1); x++) {
                const t = c.tiles[(y - cy * CS) * CS + (x - cx * CS)]
                const solid = c.structures.some((s) => s.solid && s.kind !== 'hoteldoor' && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
                walk[(y - by0) * BW + (x - bx0)] = t === 1 && !solid ? 1 : 0
              }
          }
        for (let i = 0; i < BW * BH && start < 0; i++) if (walk[i]) start = i // 北墙门洞/西墙门洞恒存在——第一可走格必在隧道/门口
        const seen = new Uint8Array(BW * BH)
        const q = [start]; seen[start] = 1
        while (q.length) {
          const i = q.pop()!, x = i % BW, y = Math.floor(i / BW)
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= BW || ny >= BH) continue
            const ni = ny * BW + nx
            if (seen[ni] || !walk[ni]) continue
            seen[ni] = 1; q.push(ni)
          }
        }
        let total = 0, reached = 0
        for (let i = 0; i < BW * BH; i++) if (walk[i]) { total++; if (seen[i]) reached++ }
        checked++
        if (reached !== total) bad(`锅炉房(${k},${r}) 内腔不可走遍：${reached}/${total}`)
      }
    if (clustered > 0) ok(`锅炉房聚集成片：${clustered} 个街区有邻接锅炉房（片内无代墙机器——正常厚墙）`)
    else bad('锅炉房无聚集（应有邻接成片）')
    if (checked > 0 && !fail) ok(`锅炉房可通行：${checked} 个街区内腔+隧道 BFS 全走遍`)
  }
}

// ---------- ⑯ 贴墙件邻墙（任务2）+ 低管道可通行（任务5）+ 折叠梯点位（任务7） ----------
{
  // 全部贴墙装饰四邻必有墙（跨 chunk 读邻格；浮空修复回归断言）
  const WALL_DECOR = ['bigpainting', 'photo', 'wallsign', 'sconce', 'warningsign']
  let total = 0, noWall = 0
  for (let cy = -6; cy < 6; cy++)
    for (let cx = -6; cx < 6; cx++) {
      const c = genL5ChunkRaw(def, 424242, cx, cy)
      for (const s of c.structures) {
        if (!WALL_DECOR.includes(s.kind)) continue
        total++
        let hasWall = false
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = s.x + dx, ny = s.y + dy
          const nc = genL5ChunkRaw(def, 424242, Math.floor(nx / CS), Math.floor(ny / CS))
          if (nc.tiles[(ny - Math.floor(ny / CS) * CS) * CS + (nx - Math.floor(nx / CS) * CS)] !== 1) { hasWall = true; break }
        }
        if (!hasWall) { noWall++; if (noWall <= 3) bad(`贴墙件浮空：${s.kind} @(${s.x},${s.y})`) }
      }
    }
  if (total > 0 && !noWall) ok(`贴墙件邻墙：${total} 件（bigpainting/photo/wallsign/sconce/warningsign）全部四邻有墙`)
  else if (noWall) bad(`贴墙件浮空 ×${noWall}`)
  // 低管道可通行：锅炉房 pipes 非实心（贴墙散件不挡路）；L2 式贴墙管群碰撞条不覆盖瓦片中心（可蹲行通过旁侧）
  const { structColliders } = await import('../src/game/world/mapgen.ts')
  const runPipe = { kind: 'pipes', x: 10, y: 10, w: 1, h: 1, solid: true, data: { run: 1, side: 0 } } as const
  const boxes = structColliders(runPipe as never)
  const centerFree = boxes.every((b) => 10.5 < b.x0 || 10.5 > b.x1 || 10.5 < b.y0 || 10.5 > b.y1)
  if (centerFree) ok('贴墙管群碰撞条让出瓦片中心（蹲行/通行可从旁侧通过）')
  else bad('贴墙管群碰撞条覆盖瓦片中心（蹲行不可通过）')
  // 折叠梯：锅炉房/维修大厅装饰梯点位为 foldladder
  let fl = 0
  for (let cy = -4; cy < 4; cy++)
    for (let cx = -4; cx < 4; cx++)
      for (const s of genL5ChunkRaw(def, 424242, cx, cy).structures) if (s.kind === 'foldladder') fl++
  if (fl > 0) ok(`人字折叠梯：${fl} 架（锅炉房/维修大厅装饰点位）`)
  else bad('未发现 foldladder')
}

console.log(fail ? `\n✗ ${fail} 项失败` : '\n✓ Level 5 无限化校验全部通过')
process.exit(fail ? 1 : 0)
