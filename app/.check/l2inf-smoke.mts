// Level 2「废弃公共带」无限化校验（v41 + v42 十项修改）：
// 1) 四变体覆盖 + 群系聚集 + 出生 chunk 恒为整洁的廊道
// 2) 全 carved 地板 BFS 自出生点连通（跨 chunk 合并世界网格）
// 3) 廊道净空 ≤3 占比达标 + 中车道无实心 + 贴墙管排不两侧同堵（净宽 ≥1.5m）
// 4) 门规则（门两侧为墙/通行向两侧为地板；锁死门 data.sealed=1 不可开）+ 锁死门占多数
// 5) 出口：率在区间（对齐 L0/L1 每超区域约 1 个）+ 消防出口 dest back/3、办公走廊 dest 4 + 出生保底
// 6) 实体：确定性、窃皮者移除、死亡飞蛾 calm、密度低、无面灵仅卧室、尸鼠成群 2~3、deathrat 已并入
// 7) 生成确定性：同 seed 同 chunk 两构完全一致
// 8) 引擎行为：尸鼠猎杀飞蛾 / 受击反击 / grudge 记仇不平息；锁死门交互后仍纹丝不动
// 9) 墙面段：贴墙粗管/代墙管道/代墙机器（mv 五变体）存在、段端头有 endEl 弯头、代墙段旁无门、代墙不压净宽
// 10) 房间：≥3×3 最小开间、结构间 ≥1 净空、房内自门连通
// 11) 办公走廊：仅单一开口、L4 出口仅在走廊尽头
// 12) 天花板两缘管线装饰存在（非实心）+ 警示带贴墙不浮空
// 13) 特殊生成实体图鉴归属含 Level 2（pipeworm/windowent/smiler 事件生成 + deathmoth/corpserat 池）
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
// 画布桩：装饰/纹理用 document.createElement('canvas') 生成程序化贴图（警示带贴墙断言需要真跑 buildDecorations）
const ctx2d = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return { width: 128, height: 128 }
  if (k === 'fillStyle' || k === 'strokeStyle' || k === 'font' || k === 'lineWidth' || k === 'globalAlpha' || k === 'textAlign' || k === 'textBaseline' || k === 'lineCap' || k === 'lineJoin' || k === 'globalCompositeOperation' || k === 'filter' || k === 'shadowBlur' || k === 'shadowColor') return ''
  return (...a: unknown[]) => { void a; return k === 'measureText' ? { width: 10 } : k === 'createLinearGradient' || k === 'createRadialGradient' ? { addColorStop: () => {} } : k === 'getImageData' || k === 'createImageData' ? { data: new Uint8ClampedArray(4 * 128 * 128) } : undefined }
} })
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600 }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: (t: string) => t === 'canvas'
    ? { width: 128, height: 128, getContext: () => ctx2d, toDataURL: () => 'data:,' }
    : { style: {}, appendChild: () => {}, setAttribute: () => {} },
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
;(globalThis as unknown as Record<string, unknown>).performance = globalThis.performance ?? { now: () => Date.now() }

const { LEVELS } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/mapgen.ts')
const { genL2ChunkRaw, l2VariantOf, l2CorrX, l2RowY, l2CorridorFloorAt, l2WallSegsAt } = await import('../src/game/infiniteL2.ts')
const { CS } = await import('../src/game/infinite.ts')
const THREE = await import('three')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)
const def = LEVELS[2]

// 1) 变体覆盖 + 群系聚集 + 出生 chunk 恒 tidy
{
  const seen = new Set<string>()
  for (let cy = -40; cy <= 40; cy++) for (let cx = -40; cx <= 40; cx++) seen.add(l2VariantOf(20260804, cx, cy))
  const want = ['tidy', 'dim', 'dirty', 'warped']
  const missing = want.filter((v) => !seen.has(v))
  if (missing.length) bad(`变体覆盖缺失：${missing.join('、')}`)
  else ok(`四种廊道变体均会出现（${[...seen].join('、')}）`)
  let spawnOK = true
  for (const s of [1, 7, 99, 424242, 20260804]) if (l2VariantOf(s, 0, 0) !== 'tidy') spawnOK = false
  if (!spawnOK) bad('出生 chunk (0,0) 未恒为整洁的廊道（tidy）')
  else ok('出生 chunk (0,0) 在全部抽样种子下均为整洁的廊道')
  // 群系：纯函数 + 多数 chunk 与邻居同变体
  let pure = true
  for (const [cx, cy] of [[3, -7], [12, 25], [-30, 4], [0, 0], [-11, -19]])
    if (l2VariantOf(20260804, cx, cy) !== l2VariantOf(20260804, cx, cy)) pure = false
  if (!pure) bad('l2VariantOf 非纯函数（同 seed+坐标结果不一致）')
  let sameN = 0, total = 0
  for (let cy = -30; cy <= 30; cy += 2)
    for (let cx = -30; cx <= 30; cx += 2) {
      const v = l2VariantOf(20260804, cx, cy)
      const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([i, j]) => l2VariantOf(20260804, cx + i, cy + j))
      total++
      if (nbs.some((n) => n === v)) sameN++
    }
  const clusterPct = Math.round((sameN / total) * 100)
  if (!pure) bad('群系校验中止')
  else if (clusterPct < 60) bad(`廊道变体未成片聚集（仅 ${clusterPct}% chunk 与同变体相邻 < 60%）`)
  else ok(`相同变体聚成群系（${clusterPct}% chunk 至少与 1 个四邻居同变体）`)
}

// 2) 跨 chunk 合并世界网格 + BFS 连通 + 宽度/净空 + 门规则（一次合并多处复用）
{
  const R = 4 // 合并范围 [-R..R]²；断言限内圈 RI=3（外圈仅作连接通道，避免区域截断 artifact）
  const RI = 3
  const X0 = -R * CS, Y0 = -R * CS, W = 2 * R * CS + CS
  const grid = new Uint8Array(W * W).fill(2)
  const crawlg = new Uint8Array(W * W)
  const tintg = new Uint8Array(W * W) // v42：识别办公走廊（tint 16）/ 变体色
  const allStructs: { kind: string; x: number; y: number; w: number; h: number; solid: boolean; data?: Record<string, number | string | boolean | string[]> }[] = []
  const allExits: { kind: string; dest: number | string; x: number; y: number }[] = []
  let exitsN = 0
  for (let cy = -R; cy <= R; cy++)
    for (let cx = -R; cx <= R; cx++) {
      const raw = genL2ChunkRaw(def, 424242, cx, cy)
      for (let y = 0; y < CS; y++)
        for (let x = 0; x < CS; x++) {
          grid[(cy * CS + y - Y0) * W + (cx * CS + x - X0)] = raw.tiles[y * CS + x]
          crawlg[(cy * CS + y - Y0) * W + (cx * CS + x - X0)] = raw.crawl[y * CS + x]
          tintg[(cy * CS + y - Y0) * W + (cx * CS + x - X0)] = raw.tint[y * CS + x]
        }
      allStructs.push(...raw.structures)
      for (const e of raw.exits) allExits.push({ kind: e.def.kind, dest: e.def.dest, x: e.x, y: e.y })
      exitsN += raw.exits.length
    }
  const gAt = (x: number, y: number) => (x < X0 || y < Y0 || x >= X0 + W || y >= Y0 + W ? 2 : grid[(y - Y0) * W + (x - X0)])
  const tAt = (x: number, y: number) => (x < X0 || y < Y0 || x >= X0 + W || y >= Y0 + W ? 0 : tintg[(y - Y0) * W + (x - X0)])
  const inInner = (x: number, y: number) => x >= -RI * CS && x < RI * CS + CS && y >= -RI * CS && y < RI * CS + CS
  // 实心结构占用集（含多格足迹展开；后续廊道/房间断言共用）
  const solidSet = new Set<string>()
  for (const s of allStructs)
    if (s.solid)
      for (let j = Math.floor(s.y); j < s.y + s.h; j++)
        for (let i = Math.floor(s.x); i < s.x + s.w; i++) solidSet.add(`${i},${j}`)
  const solidAt2 = (x: number, y: number) => solidSet.has(`${x},${y}`)
  // BFS 自出生点（世界 15,15）
  const reach = new Uint8Array(W * W)
  const q: number[] = []
  const si = (15 - Y0) * W + (15 - X0)
  if (grid[si] !== 1) bad('出生点世界 (15,15) 不是地板（出生廊道缺失）')
  else {
    reach[si] = 1; q.push(si)
    while (q.length) {
      const i = q.pop()!
      const x = i % W, y = Math.floor(i / W)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = (y + dy) * W + (x + dx)
        if (grid[ni] === 1 && !reach[ni]) { reach[ni] = 1; q.push(ni) }
      }
    }
    let floor = 0, unreached = 0
    for (let y = Y0; y < Y0 + W; y++)
      for (let x = X0; x < X0 + W; x++) {
        const i = (y - Y0) * W + (x - X0)
        if (grid[i] !== 1 || !inInner(x, y)) continue
        floor++
        if (!reach[i]) unreached++
      }
    if (unreached > 0) bad(`存在 ${unreached} 格不可达 carved 地板（无尽头孤廊/房间失联）`)
    else ok(`全 carved 地板自出生点连通（内圈 ${floor} 格，跨 ${(2 * RI + 1) ** 2} chunk）`)
  }
  // 3) 廊道净空：每格地板的水平/竖直连续地板长度，min ≤ 3 的占比（房间例外；内圈统计）
  {
    const run = (dx: number, dy: number, x: number, y: number) => {
      let n = 1
      for (const s of [1, -1]) {
        let k = 1
        while (gAt(x + dx * k * s, y + dy * k * s) === 1) { n++; k++ }
      }
      return n
    }
    let floor = 0, narrow = 0
    for (let y = -RI * CS + 1; y < RI * CS + CS - 1; y++)
      for (let x = -RI * CS + 1; x < RI * CS + CS - 1; x++) {
        if (gAt(x, y) !== 1) continue
        floor++
        if (Math.min(run(1, 0, x, y), run(0, 1, x, y)) <= 3) narrow++
      }
    const pct = Math.round((narrow / floor) * 100)
    if (pct < 65) bad(`廊道净空 ≤3 占比不足（${pct}% < 65%）`)
    else ok(`廊道净空 ≤3 占比 ${pct}%（房间/连廊交汇为例外）`)
    // v42：廊道车道断言——中车道（X+1）永无实心；贴墙管排（fpipes）只占单侧车道边，永不两侧同堵（净宽 ≥2 瓦 ≥1.5m）
    let blocked = 0, bothSides = 0, pipesSeen = 0
    for (const k of [-3, -1, 0, 1, 3]) {
      const X = l2CorrX(424242, k)
      for (let y = -RI * CS + 2; y < RI * CS + CS - 2; y++) {
        if (!l2CorridorFloorAt(424242, k, y)) continue
        if (solidAt2(X + 1, y)) blocked++
        if (solidAt2(X, y) && solidAt2(X + 2, y)) bothSides++
        if (solidAt2(X, y) || solidAt2(X + 2, y)) pipesSeen++
      }
    }
    if (blocked > 0) bad(`廊道中车道被实心结构侵占 ×${blocked}（中车道必须保持可走）`)
    else if (bothSides > 0) bad(`贴墙管排同时堵住两侧车道边 ×${bothSides}（净宽会 <1.5m）`)
    else if (pipesSeen === 0) bad('抽样廊道未见贴墙平行粗管（fpipes 应常见）')
    else ok(`廊道中车道无实心侵占；贴墙管排仅单侧收窄（${pipesSeen} 行段，净宽保持 ≥2）`)
  }
  // 4) 门规则 + 锁死门占多数（内圈门：四邻地形都在合并网格内）
  {
    const doors = allStructs.filter((s) => s.kind === 'hoteldoor' && inInner(s.x, s.y))
    if (!doors.length) bad('合并网格内没有任何 hoteldoor')
    let badDoor = 0, sealed = 0
    const doorAt = (x: number, y: number) => doors.some((d) => d.data?.dbl && Math.floor(d.x + d.w / 2) === x && Math.floor(d.y + d.h / 2) === y)
    for (const d of doors) {
      const ax = Math.floor(d.x + d.w / 2), ay = Math.floor(d.y + d.h / 2)
      const wallish = (x: number, y: number) => gAt(x, y) !== 1 || (!!d.data?.dbl && doorAt(x, y))
      const we = wallish(ax - 1, ay) && wallish(ax + 1, ay)
      const ns = wallish(ax, ay - 1) && wallish(ax, ay + 1)
      const weF = gAt(ax - 1, ay) === 1 && gAt(ax + 1, ay) === 1
      const nsF = gAt(ax, ay - 1) === 1 && gAt(ax, ay + 1) === 1
      if (!((we && nsF) || (ns && weF))) badDoor++
      if (d.data?.sealed === 1) {
        sealed++
        if (d.data?.locked !== 1 || d.data?.open !== 0) bad('锁死门 data 标记异常（应 locked=1 open=0）')
      }
    }
    const pct = doors.length ? Math.round((sealed / doors.length) * 100) : 0
    if (badDoor > 0) bad(`门规则违规 ×${badDoor}（门两侧必须为墙、通行向两侧为地板）`)
    else if (pct < 50) bad(`锁死门占比 ${pct}% < 50%（大多数门应锁死）`)
    else ok(`门规则全部合规（${doors.length} 扇；锁死 ${pct}% 占多数，data.sealed=1 任何方式打不开）`)
  }
  // 窗户：存在的 windowtrap 均在地板且邻墙（走廊尽头的墙上；内圈判定）
  {
    const wins = allStructs.filter((s) => s.kind === 'windowtrap' && inInner(s.x, s.y))
    let badWin = 0
    for (const w of wins) {
      const ax = Math.floor(w.x), ay = Math.floor(w.y)
      if (gAt(ax, ay) !== 1) badWin++
      else if (gAt(ax + 1, ay) === 1 && gAt(ax - 1, ay) === 1 && gAt(ax, ay + 1) === 1 && gAt(ax, ay - 1) === 1) badWin++
    }
    if (wins.length === 0) console.log('  · 本 seed 合并网格内未刷出窗户（走廊尽头 10% 概率），跳过')
    else if (badWin > 0) bad(`窗户落点异常 ×${badWin}（须在走廊尽头地板上且邻墙）`)
    else ok(`窗户（windowtrap）${wins.length} 扇全部落在尽头墙上（地板且邻墙）`)
  }
  // 9) 墙面段（task 2/8/9）：贴墙粗管/代墙管道/代墙机器/顶缘管线存在 + 端头弯头 + 代墙旁无门 + 代墙不压净宽
  {
    const runPipes = allStructs.filter((s) => s.kind === 'pipes' && s.data?.run && inInner(s.x, s.y))
    const wallPipes = allStructs.filter((s) => s.kind === 'pipes' && s.data?.wall && inInner(s.x, s.y))
    const ceilPipes = allStructs.filter((s) => s.kind === 'pipes' && s.data?.ceil && inInner(s.x, s.y))
    const machWalls = allStructs.filter((s) => s.kind === 'machinewall' && inInner(s.x, s.y))
    const mvs = new Set(machWalls.map((s) => Number(s.data?.mv)))
    if (!runPipes.length) bad('未见贴墙平行粗管群（pipes data.run）')
    if (!wallPipes.length) bad('未见代墙平行管道（pipes data.wall）')
    if (!ceilPipes.length) bad('未见天花板两缘管线装饰（pipes data.ceil）')
    if (!machWalls.length) bad('未见代墙大型机器（machinewall）')
    else if (mvs.size < 4) bad(`代墙机器种类过少（${mvs.size} < 4：锅炉/发电机组/主发电机/机柜排/变压器应扩充）`)
    if (runPipes.length && wallPipes.length && ceilPipes.length && machWalls.length && mvs.size >= 4)
      ok(`墙面段齐备：贴墙粗管 ×${runPipes.length}、代墙管道 ×${wallPipes.length}、顶缘管线 ×${ceilPipes.length}、代墙机器 ×${machWalls.length}（${mvs.size} 种变体）`)
    // 端头弯头：抽样 (k,r,side) 段——平行管道段（fpipes/wpipes）两端瓦片必须带 endEl（1=入顶 2=入地）
    const elbowOK = (list: typeof allStructs, key: string) => {
      let segsN = 0, badN = 0
      for (let k = -4; k <= 4; k++)
        for (let r = -4; r <= 4; r++)
          for (const side of [0, 1] as const) {
            const X = l2CorrX(424242, k)
            const tx = key === 'run' ? (side === 0 ? X : X + 2) : (side === 0 ? X - 1 : X + 3)
            for (const seg of l2WallSegsAt(424242, k, r)[side === 0 ? 'west' : 'east']) {
              if ((key === 'run' && seg.mode !== 'fpipes') || (key === 'wall' && seg.mode !== 'wpipes')) continue
              if (!inInner(tx, seg.y0) || !inInner(tx, seg.y1)) continue
              segsN++
              const at = (yy: number) => list.find((s) => Math.floor(s.x) === tx && Math.floor(s.y) === yy)
              const e0 = Number(at(seg.y0)?.data?.endEl ?? 0), e1 = Number(at(seg.y1)?.data?.endEl ?? 0)
              if (![1, 2].includes(e0) || ![1, 2].includes(e1)) badN++
              for (let yy = seg.y0 + 1; yy < seg.y1; yy++) if (Number(at(yy)?.data?.endEl ?? 0) !== 0) badN++
            }
          }
      return { segsN, badN }
    }
    const el1 = elbowOK(runPipes, 'run'), el2 = elbowOK(wallPipes, 'wall')
    if (el1.badN + el2.badN > 0) bad(`平行管道段端头缺弯头 ×${el1.badN + el2.badN}（尽头必须弧形拐弯接入天花板或地板）`)
    else ok(`平行管道段端头全部带 endEl 弯头（贴墙 ${el1.segsN} 段 + 代墙 ${el2.segsN} 段）`)
    // 代墙不压净宽：facade 瓦片在合并网格中仍是墙（tiles=2）；段旁 ±1 无门
    let badWall = 0, badDoor = 0
    for (const s of [...wallPipes, ...machWalls]) {
      const ax = Math.floor(s.x), ay = Math.floor(s.y)
      if (gAt(ax, ay) === 1) badWall++ // 代墙结构落在地板上=占了净空
      for (let dy = -1; dy <= 1; dy++)
        if (allStructs.some((d) => d.kind === 'hoteldoor' && Math.floor(d.x) === ax && Math.floor(d.y) === ay + dy)) badDoor++
    }
    if (badWall > 0) bad(`代墙管道/机器落在地板瓦片 ×${badWall}（应在墙线上，不压缩净宽）`)
    else if (badDoor > 0) bad(`代墙段旁 ±1 内发现门 ×${badDoor}（代替墙面的段旁禁止生成门）`)
    else ok('代墙管道/机器全部落在墙线（净宽不变）且段旁 ±1 无门')
    // 顶缘管线非实心
    if (ceilPipes.some((s) => s.solid)) bad('顶缘管线装饰被标成实心（应纯装饰非实心）')
    // 顶缘管线端头：按 (x,连续段) 分组，两端必须 endEl
    {
      const groups = new Map<string, number[]>()
      for (const s of ceilPipes) {
        const key = `${Math.floor(s.x)}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(Math.floor(s.y))
      }
      let badEnd = 0, checked = 0
      const at = (x: number, y: number) => ceilPipes.find((s) => Math.floor(s.x) === x && Math.floor(s.y) === y)
      for (const [key, ys] of groups) {
        ys.sort((a, b) => a - b)
        const x = Number(key)
        let i = 0
        while (i < ys.length) {
          let j = i
          while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j++
          checked++
          if (![1, 2].includes(Number(at(x, ys[i])?.data?.endEl ?? 0))) badEnd++
          if (![1, 2].includes(Number(at(x, ys[j])?.data?.endEl ?? 0))) badEnd++
          i = j + 1
        }
      }
      if (badEnd > 0) bad(`顶缘管线端头缺弯头 ×${badEnd}`)
      else ok(`顶缘管线 ${checked} 个连续段端头全部带弯头（非实心纯装饰）`)
    }
  }
  // 10) 房间（task 5）：≥3×3 最小开间、结构间 ≥1 净空、房内非实心瓦片自门连通
  {
    const doors = allStructs.filter((s) => s.kind === 'hoteldoor' && !s.data?.sealed && !s.data?.dbl && inInner(s.x, s.y))
    let rooms = 0, small = 0, blocked = 0, crowded = 0
    for (const d of doors) {
      const ax = Math.floor(d.x), ay = Math.floor(d.y)
      // 门内側=地板邻居中小洪泛的一侧（大洪泛=廊道网）；办公走廊（tint 16）跳过
      const flood = (sx: number, sy: number, cap: number) => {
        const seen = new Set<string>(), q: [number, number][] = [[sx, sy]]
        seen.add(`${sx},${sy}`)
        while (q.length && seen.size < cap) {
          const [x, y] = q.pop()!
          if (x === ax && y === ay) continue // 不穿过门回廊道
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x + dx, ny = y + dy, k2 = `${nx},${ny}`
            if (seen.has(k2) || gAt(nx, ny) !== 1) continue
            seen.add(k2); q.push([nx, ny])
          }
        }
        return seen
      }
      const sides2 = [[ax + 1, ay], [ax - 1, ay]].filter(([x, y]) => gAt(x, y) === 1)
      if (sides2.length !== 2) continue // 不是东西向房间门（连廊/凹龛已排除）
      const f0 = flood(sides2[0][0], sides2[0][1], 400), f1 = flood(sides2[1][0], sides2[1][1], 400)
      const room = f0.size < f1.size ? f0 : f1
      if (room.size >= 400) continue // 两侧都是廊道网：不是房间门
      const rt = [...room].map((k2) => k2.split(',').map(Number))
      if (rt.some(([x, y]) => tAt(x, y) === 16)) continue // 办公走廊
      rooms++
      // 最小开间：房内存在 3×3 全地板块
      let has33 = false
      for (const [x, y] of rt) {
        let ok2 = true
        for (let j = y - 1; j <= y + 1 && ok2; j++) for (let i = x - 1; i <= x + 1 && ok2; i++) if (gAt(i, j) !== 1) ok2 = false
        if (ok2) { has33 = true; break }
      }
      if (!has33) small++
      // 房内非实心瓦片自门连通（房间洪泛不结实心：另跑一次绕实心的洪泛）
      const solidIn = rt.filter(([x, y]) => solidAt2(x, y))
      const seen = new Set<string>(), q: [number, number][] = []
      const doorIn = rt.find(([x, y]) => Math.max(Math.abs(x - ax), Math.abs(y - ay)) <= 1)
      if (doorIn) { seen.add(`${doorIn[0]},${doorIn[1]}`); q.push(doorIn) }
      while (q.length) {
        const [x, y] = q.pop()!
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, ny = y + dy, k2 = `${nx},${ny}`
          if (seen.has(k2) || !room.has(k2) || solidAt2(nx, ny)) continue
          seen.add(k2); q.push([nx, ny])
        }
      }
      const freeTiles = rt.filter(([x, y]) => !solidAt2(x, y))
      if (freeTiles.some(([x, y]) => !seen.has(`${x},${y}`))) blocked++
      // 结构间 ≥1 净空（房内实心足迹两两不相邻）
      const roomSolids = allStructs.filter((s) => s.solid && s.kind !== 'hoteldoor' && rt.some(([x, y]) => x >= Math.floor(s.x) && x < s.x + s.w && y >= Math.floor(s.y) && y < s.y + s.h))
      for (let a = 0; a < roomSolids.length; a++)
        for (let b = a + 1; b < roomSolids.length; b++) {
          const A = roomSolids[a], B = roomSolids[b]
          if (A.x - 1 < B.x + B.w && A.x + A.w + 1 > B.x && A.y - 1 < B.y + B.h && A.y + A.h + 1 > B.y) crowded++
        }
      void solidIn
    }
    if (rooms === 0) bad('合并网格内未找到任何门后房间')
    else {
      if (small > 0) bad(`房间开间 <3×3 ×${small}`)
      if (blocked > 0) bad(`房间内存在自门不可达的非实心瓦片 ×${blocked}（生成物挤死通道）`)
      if (crowded > 0) bad(`房间内结构间距 <1 格净空 ×${crowded}`)
      if (!small && !blocked && !crowded) ok(`房间 ${rooms} 间：全部 ≥3×3 开间、结构间 ≥1 净空、房内自门连通`)
    }
  }
  void exitsN
  void crawlg
}

// 11) 办公走廊（task 7）：仅单一开口 + L4 出口仅在走廊尽头（跨 seed 搜寻——门控后较稀有）
{
  const R2 = 3
  let hallsChecked = 0, badHall = 0
  for (const seed of [424242, 1, 7, 13, 99, 20260804]) {
    if (hallsChecked >= 3) break // 验满 3 条即可
    // 先找含办公出口的 chunk，再以其为中心合并 7×7 chunk 网格做几何断言
    let center: { cx: number; cy: number } | null = null
    for (let cy = -8; cy <= 8 && !center; cy++)
      for (let cx = -8; cx <= 8 && !center; cx++)
        if (genL2ChunkRaw(def, seed, cx, cy).exits.some((e) => e.def.kind === 'officedoor')) center = { cx, cy }
    if (!center) continue
    const X0 = (center.cx - R2) * CS, Y0 = (center.cy - R2) * CS, W = (2 * R2 + 1) * CS
    const grid = new Uint8Array(W * W).fill(2)
    const structs: { kind: string; x: number; y: number; w: number; h: number; solid: boolean; data?: Record<string, number | string | boolean | string[]> }[] = []
    const exits2: { kind: string; x: number; y: number }[] = []
    for (let cy = center.cy - R2; cy <= center.cy + R2; cy++)
      for (let cx = center.cx - R2; cx <= center.cx + R2; cx++) {
        const raw = genL2ChunkRaw(def, seed, cx, cy)
        for (let y = 0; y < CS; y++)
          for (let x = 0; x < CS; x++) grid[(cy * CS + y - Y0) * W + (cx * CS + x - X0)] = raw.tiles[y * CS + x]
        structs.push(...raw.structures)
        for (const e of raw.exits) exits2.push({ kind: e.def.kind, x: e.x, y: e.y })
      }
    const gAt = (x: number, y: number) => (x < X0 || y < Y0 || x >= X0 + W || y >= Y0 + W ? 2 : grid[(y - Y0) * W + (x - X0)])
    for (const e of exits2.filter((e2) => e2.kind === 'officedoor')) {
      hallsChecked++
      const ex = Math.floor(e.x), ey = Math.floor(e.y)
      // 尽头：水平方向只有回走廊一侧是地板（出口钉在最里端；上下为走廊宽度，可为地板）
      const hNb = [[1, 0], [-1, 0]].filter(([dx]) => gAt(ex + dx, ey) === 1)
      if (hNb.length !== 1) { badHall++; continue }
      const sdx = hNb[0][0]
      // 沿走廊走回入口门：整条 3 宽走廊侧壁不得有第二个开口，尽头之前不得有别的出口
      let x = ex, doorX: number | null = null, sideOpen = 0, len = 0
      while (gAt(x, ey) === 1 && len < 24) {
        const dHere = structs.find((d) => d.kind === 'hoteldoor' && Math.floor(d.x) === x && Math.floor(d.y) === ey)
        if (dHere && !dHere.data?.sealed) { doorX = x; break } // 走到唯一入口门为止（门洞仅 1 高，门柱不做侧壁检查）
        len++
        for (const yy of [ey - 1, ey + 1]) if (gAt(x, yy) !== 1) sideOpen++ // 走廊应 3 宽全地板
        if (gAt(x, ey - 2) === 1 || gAt(x, ey + 2) === 1) sideOpen++ // 侧墙被雕开=第二开口
        x += sdx
      }
      let extraExit = 0
      if (doorX !== null)
        for (const e2 of exits2)
          if (e2 !== e && Math.abs(e2.y - ey) <= 1 && e2.x >= Math.min(doorX, ex) && e2.x <= Math.max(doorX, ex)) extraExit++
      if (doorX === null || sideOpen > 0 || extraExit > 0 || len < 6) badHall++
    }
  }
  if (hallsChecked === 0) bad('多 seed 扫描未找到任何办公走廊（officedoor 应稀有但存在）')
  else if (badHall > 0) bad(`办公走廊违规 ×${badHall}/${hallsChecked}（应仅单一开口、尽头唯一 L4 出口、侧壁无开口）`)
  else ok(`办公走廊 ×${hallsChecked}：全部仅一个入口门、侧壁无开口、L4 出口仅在最里端`)
}

// 5) 出口：率在区间（对齐 L0/L1 每超区域约 1 个）+ 消防出口 dest back/3 + 办公走廊 dest 4 + 出生保底
{
  const dests = new Set<string>()
  let fire = 0, office = 0, chunksN = 0
  for (const seed of [1, 7, 13, 99, 424242, 20260804]) {
    let foundOffice = false
    for (let cy = -14; cy <= 14; cy++)
      for (let cx = -14; cx <= 14; cx++) {
        const raw = genL2ChunkRaw(def, seed, cx, cy)
        chunksN++
        for (const e of raw.exits) {
          if (e.def.kind === 'fireexit') { fire++; dests.add(`${e.def.kind}:${e.def.dest}`) }
          if (e.def.kind === 'officedoor') { office++; foundOffice = true; dests.add(`${e.def.kind}:${e.def.dest}`) }
        }
      }
    void foundOffice
  }
  // v42：出口出现率区间——L0/L1 为每 8×8 chunk 超区域恰 1 个出口（=1/64 chunk）；
  // L2 门控后应同量级（每 64 chunk 0.5~2.5 个，不再随地可见）
  const per64 = (fire + office) / chunksN * 64
  if (per64 < 0.5 || per64 > 2.5) bad(`出口率 ${per64.toFixed(2)} 个/64chunk 超出区间 [0.5, 2.5]（L1 参照=1.0）`)
  else ok(`出口率 ${per64.toFixed(2)} 个/64chunk（对齐 L0/L1 超区域约 1 个出口）`)
  if (!dests.has('fireexit:back')) bad('消防出口（→返回 Level 1，dest back）未出现')
  if (!dests.has('fireexit:3')) bad('消防出口（→Level 3，dest 3）未出现')
  if (!dests.has('officedoor:4')) bad('办公走廊尽头出口（→Level 4，dest 4）未出现')
  if (dests.has('fireexit:back') && dests.has('fireexit:3') && dests.has('officedoor:4'))
    ok(`出口齐备：消防出口 ×${fire}（back/3 均有）、办公走廊尽头 ×${office}（dest 4）——多 seed 扫描`)
  // 出生 chunk 保底：主廊道 + 出口
  for (const seed of [1, 7, 424242]) {
    const raw = genL2ChunkRaw(def, seed, 0, 0)
    const corridorOK = raw.tiles[15 * CS + 13] === 1 && raw.tiles[15 * CS + 14] === 1 && raw.tiles[15 * CS + 15] === 1
    if (!corridorOK) bad(`seed=${seed} 出生 chunk 缺失主廊道（世界 13..15,15）`)
    if (!raw.exits.length) bad(`seed=${seed} 出生 chunk 无保底出口`)
  }
  ok('出生 chunk 恒含 3 宽主廊道与 1 个消防出口（多 seed）')
  // 出生点合法（窗口缝合后）
  const m = generateLevel(def, 424242, true)
  if (!m.inf) { bad('L2 未走无限生成'); process.exit(1) }
  const Wm = m.w
  const sx = Math.floor(m.spawn.x), sy = Math.floor(m.spawn.y)
  if (m.tiles[sy * Wm + sx] !== 1) bad('出生点不是地板')
  else if (m.structures.some((s) => s.solid && sx >= s.x && sx < s.x + s.w && sy >= s.y && sy < s.y + s.h)) bad('出生点被实心结构遮挡')
  else ok('窗口缝合后出生点合法（地板且无遮挡物）')
}

// 6) 实体：确定性 / 窃皮者移除 / 死亡飞蛾 calm / 密度低 / 无面灵仅卧室 / 尸鼠成群 2~3 / deathrat 并入
{
  if (def.entities.some((e) => e.type === 'skinstealer')) bad('窃皮者仍在 L2 生成池（「大停电」后应移除）')
  else ok('窃皮者已从 L2 生成池移除（「大停电」事件 lore）')
  let total = 0, chunks = 0, moth = 0, mothCalm = 0, mothScaled = 0, faceling = 0, pipeworm = 0
  let detBad = 0, faceNoBed = 0
  const ratGroups: number[] = []
  const faceChecks: { seed: number; x: number; y: number }[] = []
  for (const seed of [55, 424242]) {
    for (let cy = -20; cy <= 20; cy++)
      for (let cx = -20; cx <= 20; cx++) {
        const raw = genL2ChunkRaw(def, seed, cx, cy)
        chunks++
        total += raw.entities.length
        let rats = 0
        for (const e of raw.entities) {
          if (e.type === 'deathmoth') { moth++; if (e.calm) mothCalm++; if (e.scale === 0.6) mothScaled++ }
          if (e.type === 'faceling') { faceling++; faceChecks.push({ seed, x: e.x, y: e.y }) }
          if (e.type === 'pipeworm') pipeworm++
          if (e.type === 'corpserat') rats++
        }
        if (rats > 0) ratGroups.push(rats)
        if (chunks % 97 === 0) {
          const raw2 = genL2ChunkRaw(def, seed, cx, cy)
          if (JSON.stringify(raw2.entities) !== JSON.stringify(raw.entities)) detBad++
        }
      }
  }
  // 无面灵仅卧室：近旁 8 格内必须有床（卧室=床+桌+椅+充足灯光；床可落在相邻 chunk，按 3×3 邻域查）
  for (const f of faceChecks) {
    const fcx = Math.floor(f.x / CS), fcy = Math.floor(f.y / CS)
    let found = false
    for (let cy = fcy - 1; cy <= fcy + 1 && !found; cy++)
      for (let cx = fcx - 1; cx <= fcx + 1 && !found; cx++) {
        const raw = genL2ChunkRaw(def, f.seed, cx, cy)
        if (raw.structures.some((s) => s.kind === 'bed' && Math.abs(s.x + 0.5 - f.x) <= 8 && Math.abs(s.y + 1 - f.y) <= 8)) found = true
      }
    if (!found) faceNoBed++
  }
  const avg = total / chunks
  if (avg > 0.35) bad(`实体密度过高：平均 ${avg.toFixed(2)} 个/chunk（应 ≤0.35，少量实体）`)
  else ok(`实体低密度：平均 ${avg.toFixed(2)} 个/chunk`)
  if (detBad > 0) bad(`实体生成不确定 ×${detBad}（同 seed 两构不一致）`)
  if (moth > 0 && mothCalm !== moth) bad(`死亡飞蛾 calm 覆盖 ${mothCalm}/${moth}（L2 应全部被动实例）`)
  else if (moth > 0 && mothScaled !== moth) bad(`死亡飞蛾 scale 覆盖 ${mothScaled}/${moth}（L2 温顺飞蛾体型应全部 0.6）`)
  else if (moth > 0) ok(`死亡飞蛾全部 calm 被动 + scale 0.6 小体型（${moth} 只；通常不主动攻击玩家）`)
  else console.log('  · 抽样内未刷出死亡飞蛾（极稀有），跳过 calm 断言')
  if (faceling === 0) console.log('  · 抽样内未刷出无面灵（卧室 40%），跳过')
  else if (faceNoBed > 0) bad(`无面灵生成在无床房间 ×${faceNoBed}（应仅卧室类房间：床+桌+椅+充足灯光）`)
  else ok(`无面灵仅随卧室生成（抽样 ${faceling} 只，近旁均有床）`)
  if (ratGroups.length === 0) bad('抽样内未刷出尸鼠（池权重 12，应常见）')
  else {
    const badG = ratGroups.filter((n) => n < 2 || n > 3)
    if (badG.length > 0) bad(`尸鼠组大小异常 ×${badG.length}（应 2~3 只一组：${badG.slice(0, 5).join(',')}）`)
    else ok(`尸鼠全部成群生成（${ratGroups.length} 组，均 2~3 只）`)
  }
  if (pipeworm > 0) ok(`管道蠕虫伪装生成在位（抽样 ${pipeworm} 只，附 pipes 拟态结构）`)
  // 死亡鼠已并入尸鼠：注册表无 deathrat；尸鼠归属 L2/L8/L9
  const { ENTITIES, entitySpawnLevels } = await import('../src/game/entities/index.ts')
  if ('deathrat' in ENTITIES) bad('deathrat 仍在实体注册表（应并入 corpserat 或标 alias）')
  else ok('死亡鼠已从实体注册表移除（并入尸鼠 corpserat）')
  const ratLv = entitySpawnLevels('corpserat').map((s) => s.id).sort()
  for (const id of [2, 8, 9]) if (!ratLv.includes(id)) bad(`尸鼠图鉴归属缺 Level ${id}`)
  if (ratLv.includes(2) && ratLv.includes(8) && ratLv.includes(9)) ok(`尸鼠图鉴归属 Level ${ratLv.join(' / ')}（L2 池 + L8/L9 原死亡鼠池）`)
  // task 10：特殊生成实体的图鉴层级归属含 Level 2（事件生成表 ENTITY_EVENT_SPAWNS + 生成池）
  let spawnBad = 0
  if (!entitySpawnLevels('pipeworm').some((s) => s.id === 2 && s.event)) { bad('管道蠕虫图鉴归属缺 Level 2（pipes 拟态特殊生成）'); spawnBad++ }
  if (!entitySpawnLevels('windowent').some((s) => s.id === 2 && s.event)) { bad('窗户图鉴归属缺 Level 2（走廊尽头 windowtrap 特殊生成）'); spawnBad++ }
  if (!entitySpawnLevels('smiler').some((s) => s.id === 2 && s.event)) { bad('笑魇图鉴归属缺 Level 2（黑暗廊道特殊生成）'); spawnBad++ }
  if (!entitySpawnLevels('deathmoth').some((s) => s.id === 2)) { bad('死亡飞蛾图鉴归属缺 Level 2（calm 实例生成池）'); spawnBad++ }
  if (spawnBad === 0) ok('特殊生成实体图鉴归属均含 Level 2（pipeworm/windowent/smiler 事件生成；deathmoth 生成池）')
}

// 7) 生成确定性（同 seed 同 chunk 两构完全一致：地形/结构/物品/灯/出口/实体）
{
  let badN = 0
  for (const [cx, cy] of [[0, 0], [3, -7], [-12, 25], [30, 4], [-11, -19], [7, 7]])
    for (const seed of [1, 424242]) {
      const a = genL2ChunkRaw(def, seed, cx, cy)
      const b = genL2ChunkRaw(def, seed, cx, cy)
      const ser = (r: typeof a) => JSON.stringify({
        t: [...r.tiles], w: [...r.wet], e: [...r.elev], c: [...r.crawl], ti: [...r.tint],
        s: r.structures, i: r.items, l: r.lights.map((l) => ({ ...l, flickerSeed: Math.round(l.flickerSeed * 1e6) })), x: r.exits.map((e) => [e.def.kind, e.x, e.y]), en: r.entities, n: r.npcs,
      })
      if (ser(a) !== ser(b)) badN++
    }
  if (badN > 0) bad(`chunk 生成不确定 ×${badN}（同 seed 同坐标两构不一致）`)
  else ok('生成确定性：12 组同 seed 同坐标两构完全一致（含 crawl/elev/tint）')
}

// 8) 引擎行为：尸鼠猎杀死亡飞蛾 / 受击反击；锁死门交互后仍纹丝不动
{
  const { engine } = await import('../src/game/engine.ts')
  const { makeEntity } = await import('../src/game/entities/index.ts')
  engine.newRun(20260804, 'normal'); engine.paused = false
  engine.devJump(2)
  const m = engine.map!
  const p = engine.player
  p.hp = 100000; p.sanity = 100; p.hunger = 100
  // 尸鼠 vs 死亡飞蛾：放在出生廊道（南北向车道）同一直线，鼠在后；飞蛾按 L2 规则为 calm 被动实例
  const rat = makeEntity('corpserat', p.x, p.y + 2)
  const moth = makeEntity('deathmoth', p.x, p.y + 5)
  moth.def = { ...moth.def, passive: true }
  m.entities.push(rat, moth)
  let frames = 0, sawRetaliate = false
  while (!moth.dead && frames < 2000) {
    engine.update(0.02); frames++
    if (moth.targetEnt === rat && moth.state === 'chase') sawRetaliate = true // v44：飞蛾被攻击后仇恨转向该尸鼠
  }
  if (!moth.dead) bad('尸鼠 40s 内未猎杀附近的死亡飞蛾（hunts 失效）')
  else ok(`尸鼠主动猎杀死亡飞蛾（${(frames * 0.02).toFixed(1)}s 内得手；鼠未攻击玩家：HP 满）`)
  if (p.hp < 100000) bad('尸鼠主动攻击了玩家（应为被动实体）')
  // v44：飞蛾受尸鼠攻击会反击该尸鼠（实体对实体仇恨；targetEnt 指向伤害者并造成过伤害）
  if (!sawRetaliate) bad('飞蛾被尸鼠攻击后未将仇恨转向该尸鼠（targetEnt 失效）')
  else if (rat.hp >= 26) bad('飞蛾反击未命中尸鼠（rat.hp 未减少）')
  else ok(`飞蛾被尸鼠攻击后反击该尸鼠（targetEnt 锁定伤害者，尸鼠 HP 26→${Math.round(rat.hp)}）`)
  // 受击反击：玩家近战挥击尸鼠 → provoked 反击（chase/attack）
  p.x = rat.x - 1.0; p.y = rat.y
  p.facing = 0
  engine.input.attack = true
  engine.update(0.02)
  engine.input.attack = false
  for (let f = 0; f < 50; f++) engine.update(0.02)
  if (!rat.provoked || (rat.state !== 'chase' && rat.state !== 'attack')) bad(`尸鼠受击未反击（provoked=${!!rat.provoked} state=${rat.state}）`)
  else ok('尸鼠受玩家攻击后激怒反击（provoked → chase/attack）')
  // grudge 记仇（v42 合并死亡鼠）：玩家远遁 40 格，12 秒后尸鼠仍追击不放（普通被动实体 8 秒即平息）
  p.x = rat.x + 40; p.y = rat.y
  for (let f = 0; f < 600; f++) engine.update(0.02)
  if (!rat.provoked || (rat.state !== 'chase' && rat.state !== 'attack')) bad(`尸鼠记仇失效：12s 后 provoked=${!!rat.provoked} state=${rat.state}（grudge 应持续仇恨不平息）`)
  else ok('尸鼠受击后持续记仇（grudge：玩家远遁 12s 仍在 chase/attack，绝不平息）')
  m.entities = m.entities.filter((e) => e !== rat)
  // 锁死门：交互（含撬棍/万能钥匙/斧头）后仍关闭且实心
  const sealed = m.structures.find((s) => s.kind === 'hoteldoor' && s.data?.sealed === 1)
  if (!sealed) bad('窗口内未找到锁死门（应普遍存在）')
  else {
    p.x = sealed.x + 0.5; p.y = sealed.y + 1.2
    p.backpack.push({ type: 'crowbar', count: 1 })
    p.equip.pockets[0] = { type: 'skeleton', count: 1 }
    for (let f = 0; f < 10; f++) { engine.input.interact = true; engine.update(0.02); engine.input.interact = false }
    if (sealed.data?.open === 1 || !sealed.solid || sealed.data?.locked !== 1) bad('锁死门被打开了（任何方式都应打不开）')
    else ok('锁死门交互后仍纹丝不动（撬棍/万能钥匙均无效，提示「锁的结构闻所未闻」）')
  }
  // v44：尸鼠群体激怒——攻击一只，6m 内同伴同怒；之后 4m 内注意到激怒同伴的加入围殴
  {
    p.hotbar[p.selected] = null // 空手（8 伤），确保被攻击的尸鼠存活以观察激怒
    const rA = makeEntity('corpserat', p.x + 1.2, p.y)
    const rB = makeEntity('corpserat', p.x + 5.5, p.y) // 距 A ~4.3m（<6：应同怒）
    const rC = makeEntity('corpserat', p.x + 12.5, p.y) // 距 A ~11m（>6：暂不应怒）
    m.entities.push(rA, rB, rC)
    p.facing = 0
    engine.input.attack = true
    engine.update(0.02)
    engine.input.attack = false
    if (!rA.provoked || rA.dead) bad(`群体激怒前置失败：被击尸鼠 provoked=${!!rA.provoked} dead=${rA.dead}`)
    else if (!rB.provoked) bad('群体激怒失效：6m 内同伴未一同激怒')
    else if (rC.provoked) bad('群体激怒过界：11m 外同伴也被激怒（应仅 6m 内）')
    else {
      rC.x = rA.x + 3.5; rC.y = rA.y // 移到激怒同伴 4m 内
      engine.update(0.02)
      if (!rC.provoked) bad('激怒传染失效：4m 内注意到激怒同伴未加入围殴')
      else ok('尸鼠群体激怒：6m 内同怒、4m 内后加入（围殴同一目标）')
    }
    m.entities = m.entities.filter((e) => e !== rA && e !== rB && e !== rC)
  }
  engine.newRun(20260804, 'normal') // 复位，避免影响后续冒烟
}

// 12) 警示带贴墙（task 4：装饰性警告条不得浮空——贴到最近墙面，离墙 0.02m）
{
  const { buildDecorations } = await import('../src/game/renderer/decorations.ts')
  const m = generateLevel(def, 424242, true)
  const g = new THREE.Group()
  const fixtures: { mat: unknown; seed: number }[] = []
  for (let cy = 0; cy < 5; cy++)
    for (let cx = 0; cx < 5; cx++)
      buildDecorations(m, def, 3, g as never, fixtures as never, { x0: cx * CS, y0: cy * CS, x1: cx * CS + CS, y1: cy * CS + CS, variant: 'tidy' })
  const tapes: { x: number; y: number; d: number; px: number; pz: number }[] = []
  g.traverse((o) => {
    const ct = (o.userData as Record<string, unknown>)?.cautionTape as { x: number; y: number; d: number } | undefined
    if (ct) tapes.push({ ...ct, px: o.position.x, pz: o.position.z })
  })
  if (!tapes.length) bad('装饰层未生成任何警示带')
  let floating = 0
  for (const t of tapes) {
    // 锚点瓦片必须是地板、对应方向邻居必须是墙，且网格位置贴墙（离墙面 0.02）
    const onFloor = m.tiles[t.y * m.w + t.x] === 1
    const [dx, dy] = t.d === 0 ? [0, -1] : t.d === 1 ? [1, 0] : t.d === 2 ? [0, 1] : [-1, 0]
    const wallOK = m.tiles[(t.y + dy) * m.w + (t.x + dx)] !== 1
    const flush = t.d === 0 ? Math.abs(t.pz - (t.y + 0.02)) < 1e-6 && Math.abs(t.px - (t.x + 0.5)) < 1e-6
      : t.d === 2 ? Math.abs(t.pz - (t.y + 1 - 0.02)) < 1e-6 && Math.abs(t.px - (t.x + 0.5)) < 1e-6
      : t.d === 3 ? Math.abs(t.px - (t.x + 0.02)) < 1e-6 && Math.abs(t.pz - (t.y + 0.5)) < 1e-6
      : Math.abs(t.px - (t.x + 1 - 0.02)) < 1e-6 && Math.abs(t.pz - (t.y + 0.5)) < 1e-6
    if (!onFloor || !wallOK || !flush) floating++
  }
  if (floating > 0) bad(`警示带浮空/未贴墙 ×${floating}（应贴到最近墙面，离墙 0.02m）`)
  else if (tapes.length) ok(`警示带 ${tapes.length} 条全部贴墙（黄黑条纹警告条，离墙 0.02m，无浮空）`)
}

// 14) v45：信众宣传间（卧室房型 ~8% 改生成：无无面灵 / 1 名信众 NPC / 满墙海报 / 领地矩形）
{
  const { l2IsJerryRoom, l2JerryRoomRectAt, l2RoomLayoutAt } = await import('../src/game/infiniteL2.ts')
  let bedrooms = 0, jerryRooms = 0, posterBad = 0, npcBad = 0
  for (const seed of [424242, 1, 7, 13, 99, 20260804, 55, 777]) {
    for (let k = -6; k <= 6; k++)
      for (let r = -6; r <= 6; r++)
        for (const side of [0, 1] as const)
          for (const t of [0, 1, 2]) {
            const lay = l2RoomLayoutAt(seed, k, r, side, t)
            if (!lay || lay.roll < 0.8 || lay.roll >= 0.9) continue
            bedrooms++
            if (!l2IsJerryRoom(seed, k, r, side, t)) continue
            jerryRooms++
            // 房间内校验（跨 chunk 合并 3×3）：海报 ≥6 + 信众 NPC ×1（faction=jerry · 主题色制服）
            const ccx = Math.floor(lay.doorX / CS), ccy = Math.floor(lay.doorY / CS)
            let posters = 0
            const followers: { def: { faction?: string; uniform?: { top?: string; badge?: string } } }[] = []
            for (let yy = ccy - 1; yy <= ccy + 1; yy++)
              for (let xx = ccx - 1; xx <= ccx + 1; xx++) {
                const raw = genL2ChunkRaw(def, seed, xx, yy)
                for (const s of raw.structures)
                  if (s.kind === 'megposter' && s.data?.tex === 'jerry_poster.png' && s.x >= lay.x0 && s.x <= lay.x1 && s.y >= lay.y0 && s.y <= lay.y1) posters++
                for (const n of raw.npcs ?? [])
                  if (n.x >= lay.x0 && n.x <= lay.x1 + 1 && n.y >= lay.y0 && n.y <= lay.y1 + 1) followers.push(n)
              }
            if (posters < 6) posterBad++
            const f0 = followers[0]
            if (followers.length !== 1 || f0.def.faction !== 'jerry' || f0.def.uniform?.top !== '#4142a5' || f0.def.uniform?.badge !== '#0071c9') npcBad++
            // 领地矩形：房间中心在矩形内、门外 2 格廊道不在矩形内（仿衔尾段按区域显示声望）
            if (!l2JerryRoomRectAt(seed, (lay.x0 + lay.x1) / 2 + 0.5, (lay.y0 + lay.y1) / 2 + 0.5)) npcBad++
            if (l2JerryRoomRectAt(seed, lay.doorX + (side === 1 ? -2 : 2) + 0.5, lay.doorY + 0.5)) npcBad++
          }
  }
  const pct = bedrooms ? (jerryRooms / bedrooms) * 100 : 0
  if (jerryRooms === 0) bad('多 seed 扫描未找到任何信众宣传间')
  else if (pct < 3 || pct > 18) bad(`信众宣传间出现率异常：${pct.toFixed(1)}%（应 ~8% 卧室）`)
  else ok(`信众宣传间出现率：${jerryRooms}/${bedrooms} 间卧室（${pct.toFixed(1)}% ≈ 8%）`)
  if (posterBad > 0) bad(`信众宣传间海报密度不足 ×${posterBad}（应 ≥6 张 jerry_poster.png 贴一圈）`)
  else ok('信众宣传间满墙海报（每间 ≥6 张 megposter data.tex=jerry_poster.png）')
  if (npcBad > 0) bad(`信众宣传间 NPC/领地异常 ×${npcBad}（应恰 1 名 jerry 信众 + 领地矩形内/外判定正确）`)
  else ok('信众宣传间恰 1 名信众 NPC（jerry 主题色制服）+ 领地矩形内/外判定正确')
}

console.log(fail === 0 ? '\n✓ L2 无限化校验全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
