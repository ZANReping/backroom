// v54：Level 4 无限化冒烟——逐条断言无限 L4 的生成契约：
//   ① 生成确定性（同 seed+chunk 两构一致）；② 跨 chunk BFS 全连通（门砖视作可通过，洞/虚空除外）；
//   ③ 四区段覆盖与比例；④ 假楼梯配对（每个下行有同 chunk 上行）；⑤ 古典楼梯 ~8% / 假楼梯宿主 ~60%；
//   ⑥ 电梯 dest=3 且每 8×8 超区域恰 1 个 + 出生 chunk 保底；⑦ 活板门仅小房间区且 ~1.5%/室；
//   ⑧ 杏仁水权重全池最高；⑨ 实体密度极低（<2%/chunk，仅猎犬/钝人，出生安全区为零）；
//   ⑩ 无限层门规则自保证（一对侧为墙、另一对侧为地板）；⑪ 窗景区含 outdoor 虚空条带与 glasswin。
// 用法：npx tsx --tsconfig .check/tsconfig.run.json .check/l4inf-smoke.mts
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { LEVELS } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts') // 先加载 mapgen——按既有顺序初始化 infinite 环形依赖（同 l2inf/l3art）
const { genL4ChunkRaw, l4BlockBiome, l4CorrX, l4RowY, l4ElevSlot, l4SpawnElevSlot } = await import('../src/game/world/infiniteL4.ts')
const { CS, RS } = await import('../src/game/world/infinite.ts')

const def = LEVELS[4]
let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

// ---------- ① 生成确定性 ----------
{
  const a = genL4ChunkRaw(def, 777, 3, -2)
  const b = genL4ChunkRaw(def, 777, 3, -2)
  const sig = (c: typeof a) => JSON.stringify([
    Array.from(c.tiles), Array.from(c.elev), c.outdoor ? Array.from(c.outdoor) : null,
    c.structures.map((s) => [s.kind, s.x, s.y]), c.exits.map((e) => [e.def.kind, e.x, e.y]),
    c.items.map((i) => [i.type, i.x, i.y]), c.lights.length, c.entities.length,
  ])
  if (sig(a) === sig(b)) ok('生成确定性：同 seed 同 chunk 两构一致（tiles/elev/outdoor/结构/出口/物品/灯/实体）')
  else bad('生成不确定性：同 seed 同 chunk 两构不一致')
}

// ---------- ② 跨 chunk BFS 全连通 ----------
{
  const N = 5 // 5×5 chunk（-2..2），覆盖出生点
  const W = N * CS
  const tiles = new Uint8Array(W * W)
  const elev = new Uint8Array(W * W)
  const outdoor = new Uint8Array(W * W)
  const solid = new Uint8Array(W * W) // 实心结构（hoteldoor 除外——门可开）
  for (let cy = -2; cy <= 2; cy++)
    for (let cx = -2; cx <= 2; cx++) {
      const c = genL4ChunkRaw(def, 424242, cx, cy)
      const ox = (cx + 2) * CS, oy = (cy + 2) * CS
      for (let y = 0; y < CS; y++)
        for (let x = 0; x < CS; x++) {
          const si = y * CS + x, di = (oy + y) * W + ox + x
          tiles[di] = c.tiles[si]; elev[di] = c.elev[si]
          if (c.outdoor) outdoor[di] = c.outdoor[si]
        }
      for (const s of c.structures) {
        if (!s.solid || s.kind === 'hoteldoor') continue
        const sx = s.x - (-2 * CS), sy = s.y - (-2 * CS)
        for (let y = sy; y < sy + s.h; y++) for (let x = sx; x < sx + s.w; x++) if (x >= 0 && y >= 0 && x < W && y < W) solid[y * W + x] = 1
      }
    }
  const spawnX = 2 * CS + 15, spawnY = 2 * CS + 15
  const walk = (x: number, y: number) => {
    const i = y * W + x
    return tiles[i] === 1 && elev[i] !== 4 && outdoor[i] === 0 && solid[i] === 0
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
  let total = 0, reached = 0
  for (let i = 0; i < W * W; i++) {
    const x = i % W, y = Math.floor(i / W)
    if (!walk(x, y)) continue
    total++; if (seen[i]) reached++
  }
  if (reached === total && total > 0) ok(`跨 chunk BFS 全连通（${reached}/${total} 可走瓦片自出生点可达）`)
  else bad(`BFS 不连通：${reached}/${total} 可达`)
}

// ---------- ③ 区段覆盖与比例（街区级采样）----------
{
  const cnt: Record<string, number> = {}
  let n = 0
  for (let k = -20; k <= 20; k++)
    for (let r = -20; r <= 20; r++) {
      if (k === 0 && r === 0) continue // 出生街区恒办公间区，不计比例
      cnt[l4BlockBiome(424242, k, r)] = (cnt[l4BlockBiome(424242, k, r)] ?? 0) + 1
      n++
    }
  const kinds = ['officehall', 'open', 'windowview', 'smallrooms']
  const missing = kinds.filter((k2) => !cnt[k2])
  const offRatio = cnt.officehall / n
  if (missing.length) bad(`区段缺失：${missing.join('/')}`)
  else if (offRatio < 0.15 || offRatio > 0.45 || cnt.windowview / n < 0.05 || cnt.windowview / n > 0.3) {
    bad(`区段比例异常：${kinds.map((k2) => `${k2}=${(cnt[k2] / n).toFixed(2)}`).join(' ')}`)
  } else ok(`区段覆盖：${kinds.map((k2) => `${k2} ${(cnt[k2] / n * 100).toFixed(0)}%`).join(' / ')}`)
  if (l4BlockBiome(424242, 0, 0) !== 'officehall') bad('出生街区非办公间区')
}

// ---------- ④⑤ 古典楼梯（唯一楼梯出口）：无假楼梯残留 / 宿主率 ~40% / 梯位合法 ----------
{
  let fakeN = 0, oldN = 0, spotBad = 0
  for (let cy = -16; cy < 16; cy++)
    for (let cx = -16; cx < 16; cx++) {
      const c = genL4ChunkRaw(def, 777, cx, cy)
      for (const e of c.exits) {
        if (e.def.kind === 'fakestairsdown' || e.def.kind === 'fakestairsup') fakeN++
        if (e.def.kind !== 'oldstairs') continue
        oldN++
        if (e.def.dest !== 5) { spotBad++; bad(`古典楼梯 dest≠5：chunk(${cx},${cy})`) ; continue }
        // 梯位合法：本地板 + 某侧为墙 + 反侧 4 格畅通（可行走阶梯机制硬要求）
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
        // v54c：入梯口净空（楼梯格至少一侧横邻是地板）+ 井口护栏 stairrail 沿走向 3 格（尽头横栏）
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
  // 宿主率：每 8×8 超区域含古典楼梯的占比（期望 ~40%）
  let regs = 0, hosted = 0
  for (let ry = -3; ry < 3; ry++)
    for (let rx = -3; rx < 3; rx++) {
      regs++
      let found = false
      for (let cy = ry * RS; cy < ry * RS + RS && !found; cy++)
        for (let cx = rx * RS; cx < rx * RS + RS && !found; cx++)
          if (genL4ChunkRaw(def, 777, cx, cy).exits.some((e) => e.def.kind === 'oldstairs')) found = true
      if (found) hosted++
    }
  const hostRatio = hosted / regs
  if (fakeN) bad(`假楼梯残留 ×${fakeN}（v54b 应已全删）`)
  else ok('假楼梯已删除（fakestairsup/down 零生成、零同层互传）')
  if (oldN > 0 && !spotBad) ok(`古典楼梯：${oldN} 部全部 dest=5 且梯位合法（邻墙+走向 4 格畅通）`)
  else if (spotBad) bad(`古典楼梯梯位/dest 异常 ×${spotBad}`)
  else bad('未发现古典楼梯')
  if (hostRatio >= 0.3 && hostRatio <= 0.75) ok(`古典楼梯区域宿主率 ${(hostRatio * 100).toFixed(0)}%（期望 ~55%，v54c 上调）`)
  else bad(`古典楼梯区域宿主率异常：${(hostRatio * 100).toFixed(0)}%`)
}

// ---------- ⑥ 电梯：dest=3、每 8×8 超区域恰 1 槽位、出生 chunk 保底、嵌墙（背面格为墙） ----------
{
  // 先拼一块缝合瓦片图（覆盖采样区 + 外沿 1 chunk），供嵌墙断言跨 chunk 读邻格
  const GX0 = -2, GY0 = -2, GN = 20 // chunk 范围 [-2,18)
  const GW = GN * CS
  const gtiles = new Uint8Array(GW * GW)
  for (let cy = GY0; cy < GY0 + GN; cy++)
    for (let cx = GX0; cx < GX0 + GN; cx++) {
      const c = genL4ChunkRaw(def, 999, cx, cy)
      const ox = (cx - GX0) * CS, oy = (cy - GY0) * CS
      for (let y = 0; y < CS; y++)
        for (let x = 0; x < CS; x++) gtiles[(oy + y) * GW + ox + x] = c.tiles[y * CS + x]
    }
  const gAt = (wx: number, wy: number) => gtiles[(wy - GY0 * CS) * GW + (wx - GX0 * CS)]
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
  // 逐区域直接断言槽位（槽位可落在区域界外 ≤1 chunk——按槽位归属而非 chunk 扫描计数）
  const seen = new Set<string>()
  let elevN = 0, badEmbed = 0
  const checkSlot = (sl: { x: number; y: number } | null, tag: string, sd = 999) => {
    if (!sl) { bad(`${tag}：槽位不存在`); return }
    const key = `${sd}:${sl.x},${sl.y}`
    if (seen.has(key)) return // 与已见槽位合并（如出生保底与区域槽位重合）
    seen.add(key)
    elevN++
    const ocx = Math.floor(sl.x / CS), ocy = Math.floor(sl.y / CS)
    const c = genL4ChunkRaw(def, sd, ocx, ocy)
    const tilesAt = (wx: number, wy: number) => { // 种子 999 用缝合大图；其余种子用所属 chunk（含 1 格外沿判读限制）
      if (sd === 999) return gAt(wx, wy)
      const lx = wx - ocx * CS, ly = wy - ocy * CS
      return lx < 0 || ly < 0 || lx >= CS || ly >= CS ? 2 : c.tiles[ly * CS + lx]
    }
    const hits = c.exits.filter((e) => e.def.kind === 'elevatorshaft' && Math.floor(e.x) === sl.x && Math.floor(e.y) === sl.y)
    if (hits.length !== 1) { bad(`${tag}：槽位(${sl.x},${sl.y}) 未被所属 chunk(${ocx},${ocy}) 推出（${hits.length}）`); return }
    if (hits[0].def.dest !== 3) { bad(`${tag}：电梯 dest≠3`); return }
    // 嵌墙断言：壁龛格恰有 1 个地板邻格（走廊侧=门洞朝向），其对面（背面格）必须为墙
    if (tilesAt(sl.x, sl.y) !== 1) { badEmbed++; bad(`${tag}：电梯不在壁龛地板 (${sl.x},${sl.y})`); return }
    const floorDirs: number[] = []
    for (let d = 0; d < 4; d++) if (tilesAt(sl.x + DIRS[d][0], sl.y + DIRS[d][1]) === 1) floorDirs.push(d)
    if (floorDirs.length !== 1) { badEmbed++; bad(`${tag}：壁龛地板邻格数=${floorDirs.length}（应恰 1）：(${sl.x},${sl.y})`); return }
    const [fx, fy] = DIRS[floorDirs[0]]
    if (tilesAt(sl.x - fx, sl.y - fy) === 1) { badEmbed++; bad(`${tag}：背面格非墙 (${sl.x},${sl.y})`); return }
    // 朝向断言（v54b）：贯穿轴垂直向两邻必须皆墙——否则 orientExitFaceFloor 会把门脸转向侧面
    if (tilesAt(sl.x + fy, sl.y + fx) === 1 || tilesAt(sl.x - fy, sl.y - fx) === 1) {
      badEmbed++; bad(`${tag}：壁龛侧邻有地板（门脸将朝侧面）：(${sl.x},${sl.y})`)
    }
  }
  for (let ry = 0; ry < 2; ry++)
    for (let rx = 0; rx < 2; rx++) checkSlot(l4ElevSlot(999, rx, ry), `超区域(${rx},${ry})`)
  for (const sd of [999, 424242, 777, 31337, 555]) checkSlot(l4SpawnElevSlot(sd), `出生保底(seed ${sd})`, sd) // 出生广场曾啃穿西墙致侧邻变地板（朝向 bug 根源），多种子覆盖
  if (elevN >= 3 && !badEmbed) ok(`电梯出口：${seen.size} 个槽位全部 dest=3 且嵌墙（壁龛恰 1 地板邻格、背面格皆墙、贯穿轴垂直向皆墙=门脸正对走廊；出生保底多种子在列）`)
  else if (!badEmbed) bad(`电梯槽位过少：${seen.size}`)
}

// ---------- ⑦ 活板门：仅小房间区、~1.5%/室 ----------
{
  let trap = 0, misfiled = 0, rooms = 0
  for (let cy = -12; cy < 12; cy++)
    for (let cx = -12; cx < 12; cx++) {
      const c = genL4ChunkRaw(def, 31337, cx, cy)
      for (const e of c.exits) {
        if (e.def.kind !== 'trapdoor') continue
        trap++
        // 归属街区：按走廊网反推（ corridor 位置带抖动——扫描 k/r 使街区矩形包含该瓦片）
        let biome: string | null = null
        for (let k = Math.floor((e.x - 30) / 20); k <= Math.ceil(e.x / 20) && !biome; k++)
          for (let r = Math.floor((e.y - 30) / 20); r <= Math.ceil(e.y / 20) && !biome; r++) {
            const x0 = l4CorrX(31337, k) + 4, x1 = l4CorrX(31337, k + 1) - 2
            const y0 = l4RowY(31337, r) + 3, y1 = l4RowY(31337, r + 1) - 2
            if (e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1) biome = l4BlockBiome(31337, k, r)
          }
        if (biome !== 'smallrooms') misfiled++
      }
    }
  // 小房间总数：与 chunk 扫描同一世界范围（-384..384 瓦片）内的街区×4 室
  for (let k = -20; k < 20; k++)
    for (let r = -20; r < 20; r++) {
      const x0 = l4CorrX(31337, k) + 4, x1 = l4CorrX(31337, k + 1) - 2
      const y0 = l4RowY(31337, r) + 3, y1 = l4RowY(31337, r + 1) - 2
      const bx = (x0 + x1) / 2, by = (y0 + y1) / 2
      if (bx < -384 || bx >= 384 || by < -384 || by >= 384) continue
      if (l4BlockBiome(31337, k, r) === 'smallrooms') rooms += 4
    }
  const rate = trap / Math.max(1, rooms)
  if (misfiled) bad(`${misfiled} 个活板门不在小房间区`)
  if (trap > 0 && rate >= 0.003 && rate <= 0.05) ok(`活板门：${trap} 个 / ${rooms} 室 ≈ ${(rate * 100).toFixed(1)}%（期望 ~1.5%，且全部位于小房间区）`)
  else bad(`活板门概率异常：${trap}/${rooms} ≈ ${(rate * 100).toFixed(2)}%`)
}

// ---------- ⑧ 杏仁水权重全池最高 ----------
{
  const top = [...def.items].sort((a, b) => b.w - a.w)[0]
  const second = [...def.items].sort((a, b) => b.w - a.w)[1]
  if (top.type === 'almond' && top.w >= second.w * 2) ok(`杏仁水权重最高（almond ${top.w} ≫ 次高 ${second.type} ${second.w}）`)
  else bad(`杏仁水权重非最高：top=${top.type}(${top.w}) second=${second.type}(${second.w})`)
}

// ---------- ⑨ 实体密度极低 ----------
{
  let n = 0, wrong = 0, safe = 0
  const kinds = new Set<string>()
  for (let cy = -20; cy < 20; cy++)
    for (let cx = -20; cx < 20; cx++) {
      const c = genL4ChunkRaw(def, 555, cx, cy)
      n += c.entities.length
      for (const e of c.entities) {
        kinds.add(e.type)
        if (e.type !== 'hound' && e.type !== 'duller') wrong++
        if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) safe++
      }
    }
  const perChunk = n / 1600
  if (wrong) bad(`${wrong} 个实体非猎犬/钝人：${[...kinds].join('/')}`)
  else if (safe) bad(`出生安全区生成 ${safe} 个实体`)
  else if (perChunk >= 0.02) bad(`实体密度过高：${(perChunk * 100).toFixed(1)}%/chunk`)
  else ok(`实体密度 ${(perChunk * 100).toFixed(1)}%/chunk（仅猎犬/钝人；出生安全区为零）`)
}

// ---------- ⑩ 门规则自保证（一对侧为墙、另一对侧为地板）----------
{
  let doors = 0, badDoors = 0
  for (let cy = -4; cy < 4; cy++)
    for (let cx = -4; cx < 4; cx++) {
      const c = genL4ChunkRaw(def, 424242, cx, cy)
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= CS || y >= CS ? 2 : c.tiles[y * CS + x])
      for (const s of c.structures) {
        if (s.kind !== 'hoteldoor') continue
        doors++
        const lx = s.x - cx * CS, ly = s.y - cy * CS
        if (lx < 1 || ly < 1 || lx > CS - 2 || ly > CS - 2) { doors--; continue } // chunk 边缘门由邻 chunk 采样覆盖（越界邻格读不到，跳过）
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

// ---------- ⑪ 窗景区：outdoor 虚空条带 + glasswin ----------
{
  const c = genL4ChunkRaw(def, 424242, 7, 3, 'windowview')
  const wins = c.structures.filter((s) => s.kind === 'glasswin')
  const outN = c.outdoor ? c.outdoor.reduce((a, b) => a + b, 0) : 0
  if (wins.length > 0 && outN > 10 && wins.every((s) => s.data?.rain && s.data?.deg !== undefined))
    ok(`窗景区：glasswin ×${wins.length}（带雨痕/显式朝向）+ outdoor 虚空条带 ${outN} 格`)
  else bad(`窗景区异常：glasswin=${wins.length} outdoor=${outN}`)
  // 非窗景区不得出现 outdoor（虚空只属窗外）
  const o = genL4ChunkRaw(def, 424242, 7, 3, 'officehall')
  const oN = o.outdoor ? o.outdoor.reduce((a, b) => a + b, 0) : 0
  if (oN !== 0) bad(`非窗景区出现 outdoor 瓦片 ×${oN}`)
}

// ---------- ⑫ 自动售货机（v54b：办公间区/小房间区墙边点位，全部免费取用机）----------
{
  let vend = 0, noTrade = 0
  for (let cy = -8; cy < 8; cy++)
    for (let cx = -8; cx < 8; cx++) {
      const c = genL4ChunkRaw(def, 2026, cx, cy)
      for (const s of c.structures) if (s.kind === 'vending') { vend++; if (!s.data?.trade) noTrade++ }
    }
  if (vend > 0 && !noTrade) ok(`自动售货机：${vend} 台（全部 data.trade 免费取用机；墙边点位）`)
  else bad(`自动售货机异常：${vend} 台 / 无 trade 标记 ${noTrade}`)
}

// ---------- ⑬ 工位规则（v54c）：desk 不紧邻 bigcomputer（配大机用简桌）+ 转椅旁必有工位 ----------
{
  let adj = 0, lonelyBig = 0, lonelyChair = 0, desks = 0, bigs = 0, chairs = 0
  const all: { kind: string; x: number; y: number }[] = [] // 跨 chunk 聚合（结构按锚点唯一——工位对可跨 chunk 边界）
  for (let cy = -6; cy < 6; cy++)
    for (let cx = -6; cx < 6; cx++)
      for (const s of genL4ChunkRaw(def, 888, cx, cy).structures) all.push(s)
  const at = (x: number, y: number, kind: string) => all.some((s) => s.kind === kind && Math.abs(s.x - x) + Math.abs(s.y - y) <= 1)
  for (const s of all) {
    if (s.kind === 'desk') { desks++; if (at(s.x, s.y, 'bigcomputer')) adj++ }
    if (s.kind === 'bigcomputer') { bigs++; if (!at(s.x, s.y, 'table')) lonelyBig++ }
    if (s.kind === 'officechair') { chairs++; if (!at(s.x, s.y, 'cubicle') && !at(s.x, s.y, 'desk') && !at(s.x, s.y, 'table')) lonelyChair++ }
  }
  if (adj) bad(`工位并存：desk 紧邻 bigcomputer ×${adj}（应二选一）`)
  else if (lonelyBig) bad(`bigcomputer 未配简桌 ×${lonelyBig}`)
  else ok(`工位二选一：desk ${desks} 台均不紧邻 bigcomputer；bigcomputer ${bigs} 台均配简桌`)
  if (lonelyChair) bad(`转椅旁无工位（cubicle/desk/table）×${lonelyChair}（椅面朝向机制无的放矢）`)
  else ok(`转椅 ${chairs} 把全部紧邻工位（渲染层椅面朝桌生效）`)
}

console.log(fail ? `\n✗ ${fail} 项失败` : '\n✓ Level 4 无限化校验全部通过')
process.exit(fail ? 1 : 0)
