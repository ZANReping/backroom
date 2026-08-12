// 据点与 NPC 校验（v35）：
// 1) Alpha 基地生成稳定（同种子两构一致）+ 3 个 dest='back' 设计出口 + spawn 合法 + BFS 全连通
// 2) 据点无任何 loot 容器与地面物品（一切结构设计好）；NPC 落位 ≥6 且全部在地板
// 3) 定居点地标：L1 天鹰段低概率出现、data.outpost='alpha'；landmark 建模可构建
// 4) NPC 注册表：对话树 next 索引合法、交易物品存在且有定价
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
// v46：海报形地标等会走程序化贴图回退（levelTexture→noiseTexture），需要可用的 2D 上下文桩（同 mesh-smoke）
const ctx2d = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return { width: 128, height: 128 }
  if (k === 'fillStyle' || k === 'strokeStyle' || k === 'font' || k === 'lineWidth' || k === 'globalAlpha' || k === 'textAlign' || k === 'textBaseline' || k === 'lineCap' || k === 'lineJoin' || k === 'globalCompositeOperation' || k === 'filter' || k === 'shadowBlur' || k === 'shadowColor') return ''
  return (...a: unknown[]) => { void a; return k === 'measureText' ? { width: 10 } : k === 'createLinearGradient' || k === 'createRadialGradient' ? { addColorStop: () => {} } : k === 'getImageData' || k === 'createImageData' ? { data: new Uint8ClampedArray(4 * 128 * 128) } : undefined }
} }) as unknown as CanvasRenderingContext2D
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: (t: string) => t === 'canvas'
    ? { width: 128, height: 128, getContext: () => ctx2d, toDataURL: () => 'data:,' }
    : { width: 1, height: 1, getContext: () => null, style: {} },
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}

const { LEVELS, levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel, tileAt, bfs3D, stairServesBand } = await import('../src/game/world/mapgen.ts')
const { CS } = await import('../src/game/world/infinite.ts')
const { CONTAINER_KINDS } = await import('../src/game/decorations/containers.ts')
const { NPCS } = await import('../src/game/content/npcs.ts')
const { ITEMS } = await import('../src/game/content/items.ts')
const { buildStructure } = await import('../src/game/renderer/structures.ts')
const { genL1ChunkRaw, l1VariantOf } = await import('../src/game/world/infiniteL1.ts')
const { genL2ChunkRaw, l2VariantOf } = await import('../src/game/world/infiniteL2.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

// 通用检查（Alpha 101 与各据点各跑一遍；opts：exits=设计出口数（缺省 3）、minNpc=NPC 落位下限（缺省 6））
function checkOutpost(id: number, fixedIds: string[], opts?: { exits?: number; minNpc?: number }) {
  const wantExits = opts?.exits ?? 3
  const minNpc = opts?.minNpc ?? 6
  const def = levelDefOf(id)!
  console.log(`— 据点「${def.name}」(id ${id}) —`)
  const m1 = generateLevel(def, 424242, true)
  const m2 = generateLevel(def, 424242, true)
  const s1 = JSON.stringify({ t: [...m1.tiles], s: m1.structures.length, e: m1.exits.length, l: m1.lights.length })
  const s2 = JSON.stringify({ t: [...m2.tiles], s: m2.structures.length, e: m2.exits.length, l: m2.lights.length })
  if (s1 !== s2) bad(`[${def.name}] 生成不稳定（同种子两构不一致）`)
  else ok(`[${def.name}] 生成确定（结构 ${m1.structures.length} · 灯 ${m1.lights.length}）`)
  const backs = m1.exits.filter((e) => e.def.dest === 'back')
  if (backs.length !== wantExits) bad(`[${def.name}] 出口数 ${backs.length} ≠ ${wantExits}`)
  else ok(`[${def.name}] ${wantExits} 个设计出口均 dest='back'`)
  // v55（任务8）：床类床头靠墙——deg 朝向端邻格必为对应楼层带的墙（bedHeadDeg 后处理保证）
  {
    const BEDS = ['bed', 'bunkbed', 'hospitalbed']
    let beds = 0, badBed = 0
    for (const s of m1.structures) {
      if (!BEDS.includes(s.kind) || s.data?.deg === undefined) continue
      beds++
      const deg = (((Number(s.data.deg) || 0) % 360) + 360) % 360
      const hx = s.x + (deg === 90 ? s.w : deg === 270 ? -1 : 0)
      const hy = s.y + (deg === 0 ? s.h : deg === 180 ? -1 : 0)
      const wa = s.floor === 1 ? m1.upWall : s.floor === 2 ? m1.upWall2 : null
      const wall = hx < 0 || hy < 0 || hx >= m1.w || hy >= m1.h ? false : wa ? wa[hy * m1.w + hx] === 1 : m1.tiles[hy * m1.w + hx] !== 1
      if (!wall) { badBed++; if (badBed <= 2) bad(`[${def.name}] 床(${s.x},${s.y}) deg=${deg} 朝向端非墙`) }
    }
    if (beds > 0 && !badBed) ok(`[${def.name}] 床类床头靠墙：${beds} 张床 deg 朝向端均为墙`)
    else if (badBed) bad(`[${def.name}] 床朝向违例 ×${badBed}`)
  }
  const sx = m1.spawn.x, sy = m1.spawn.y
  if (m1.tiles[sy * m1.w + sx] !== 1) { bad(`[${def.name}] 出生点不是地板`); return }
  const OPENABLE = ['hoteldoor', 'rollerdoor', 'glassdoor']
  if ((m1.floors ?? 1) > 1) {
    // v43：多层据点——跨层连通 BFS（bfs3D：主层地板 + 楼梯坡道 + up 层楼板全连通）；
    // v54：三层（Gamma 基地）——步长 S=3，band2 走 up2/upWall2
    const reach = bfs3D(m1)
    const S = (m1.floors ?? 1) >= 3 ? 3 : 2
    const solidF = (x: number, y: number, f: number) =>
      m1.structures.some((s) => s.solid && !OPENABLE.includes(s.kind) && (s.floor ?? 0) === f && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    let unreach = 0, total = 0
    for (let i = 0; i < m1.tiles.length; i++) {
      const tx = i % m1.w, ty = Math.floor(i / m1.w)
      // v54：不服务主层带的坡道格（悬梯段，如 Gamma B 段 2F→3F 坡道）不计入主层可走格——bfs3D 高差规则天然不可达
      if (m1.tiles[i] === 1 && !solidF(tx, ty, 0) && ((m1.stair[i] & 7) === 0 || stairServesBand(m1.stair[i], 0))) { total++; if (!reach[i * S]) unreach++ }
      if (m1.up[i] === 1 && m1.upWall[i] !== 1 && !solidF(tx, ty, 1) && ((m1.stair[i] & 7) === 0 || stairServesBand(m1.stair[i], 1))) { total++; if (!reach[i * S + 1]) unreach++ }
      // v54e：band2 同口径——不服务 3F 带的坡道格（如 Gamma A 段井，3F 板已填回但 bfs3D 不入格）不计入
      if (S === 3 && m1.up2[i] === 1 && m1.upWall2[i] !== 1 && !solidF(tx, ty, 2) && ((m1.stair[i] & 7) === 0 || stairServesBand(m1.stair[i], 2))) { total++; if (!reach[i * S + 2]) unreach++ }
    }
    if (unreach > 0) bad(`[${def.name}] 有 ${unreach}/${total} 可走格（${m1.floors} 层）不可达`)
    else ok(`[${def.name}] ${m1.floors === 3 ? '三层' : '双层'}全连通（${total} 可走格经楼梯全部可达）`)
    for (const e of m1.exits) if (!reach[(e.y * m1.w + e.x) * S]) bad(`[${def.name}] 出口「${e.def.name}」不可达`)
  } else {
  // BFS 连通（可交互门视为可通行——与 mapgen openableAt 语义一致：真门后的储藏室可达）
  const seen = new Uint8Array(m1.w * m1.h)
  const q = [sx + sy * m1.w]
  seen[q[0]] = 1
  const solid = (x: number, y: number) => m1.structures.some((s) => s.solid && !OPENABLE.includes(s.kind) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  while (q.length) {
    const cur = q.pop()!
    const cx = cur % m1.w, cy = Math.floor(cur / m1.w)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, ni = ny * m1.w + nx
      if (nx < 0 || ny < 0 || nx >= m1.w || ny >= m1.h || seen[ni] || m1.tiles[ni] !== 1 || solid(nx, ny)) continue
      seen[ni] = 1; q.push(ni)
    }
  }
  let unreach = 0, total = 0
  for (let i = 0; i < m1.tiles.length; i++) if (m1.tiles[i] === 1) {
    const tx = i % m1.w, ty = Math.floor(i / m1.w)
    if (solid(tx, ty)) continue
    total++; if (!seen[i]) unreach++
  }
  if (unreach > 0) bad(`[${def.name}] 有 ${unreach}/${total} 地板不可达`)
  else ok(`[${def.name}] 全连通（${total} 地板全部可达）`)
  for (const e of m1.exits) if (!seen[e.y * m1.w + e.x]) bad(`[${def.name}] 出口「${e.def.name}」不可达`)
  }
  // v54c：坡道楼梯起点/落点净空 + 服务楼层带（互不串层）——起点前一格与落点及其后一格必须是对应层带地板
  {
    const S3 = (m1.floors ?? 1) >= 3 ? 3 : 2
    void S3
    const floorAtBand = (x: number, y: number, band: number) => {
      if (x < 0 || y < 0 || x >= m1.w || y >= m1.h) return false
      const i2 = y * m1.w + x
      return band === 0 ? m1.tiles[i2] === 1 : band === 1 ? m1.up[i2] === 1 : m1.up2[i2] === 1
    }
    let stairBad = 0
    for (let y = 0; y < m1.h; y++)
      for (let x = 0; x < m1.w; x++) {
        const sv = m1.stair[y * m1.w + x]
        const d = sv & 7
        if (!d) continue
        const dx = d === 1 ? 1 : d === 2 ? -1 : 0, dy = d === 3 ? 1 : d === 4 ? -1 : 0
        const lo = ((sv >> 3) & 0x3fff) / 100, hi = ((sv >> 17) & 0x3fff) / 100
        const baseBand = lo >= 4.5 ? 2 : lo >= 1.5 ? 1 : 0
        // 串层断言：坡道不得服务低于其基带的层带（如 2F→3F 坡道服务 1F）
        for (let b2 = 0; b2 < baseBand; b2++)
          if (stairServesBand(sv, b2 as 0 | 1 | 2)) { stairBad++; bad(`[${def.name}] 坡道串层：(${x},${y}) lo=${lo} 服务 band${b2}`) }
        const pAt = (px2: number, py2: number) => (px2 < 0 || py2 < 0 || px2 >= m1.w || py2 >= m1.h ? 0 : m1.stair[py2 * m1.w + px2])
        const pv = pAt(x - dx, y - dy)
        const isStart = (pv & 7) !== d || Math.abs(((pv >> 17) & 0x3fff) / 100 - lo) > 0.01
        const nv = pAt(x + dx, y + dy)
        const isEnd = (nv & 7) !== d || Math.abs(((nv >> 3) & 0x3fff) / 100 - hi) > 0.01
        if (isStart && !floorAtBand(x - dx, y - dy, baseBand)) { stairBad++; bad(`[${def.name}] 坡道起点 (${x},${y}) 入梯前一格非 band${baseBand} 地板`) }
        if (isEnd) {
          const arrBand = hi >= 4.5 ? 2 : hi >= 1.5 ? 1 : 0
          if (!floorAtBand(x + dx, y + dy, arrBand)) { stairBad++; bad(`[${def.name}] 坡道落点 (${x + dx},${y + dy}) 非 band${arrBand} 地板`) }
          else if (!floorAtBand(x + 2 * dx, y + 2 * dy, arrBand)) { stairBad++; bad(`[${def.name}] 坡道落点 (${x + dx},${y + dy}) 出梯后一格非 band${arrBand} 地板（未留净空）`) }
        }
      }
    if (!stairBad && (m1.floors ?? 1) > 1) ok(`[${def.name}] 坡道起点/落点净空 ≥1 格且按服务楼层带互不串层`)
  }
  // 无 loot + NPC 落位
  const lootStructs = m1.structures.filter((s) => CONTAINER_KINDS.includes(s.kind) || s.data?.loot === 1)
  if (lootStructs.length) bad(`[${def.name}] 出现 loot 容器：${lootStructs.map((s) => s.kind).join('、')}`)
  else if (m1.items.length) bad(`[${def.name}] 出现地面物品 ×${m1.items.length}`)
  else ok(`[${def.name}] 无 loot 容器、无地面物品`)
  const npcs = m1.npcs ?? []
  if (npcs.length < minNpc) bad(`[${def.name}] NPC 落位 ${npcs.length} < ${minNpc}`)
  else {
    const offFloor = npcs.filter((n) => m1.tiles[Math.floor(n.y) * m1.w + Math.floor(n.x)] !== 1)
    if (offFloor.length) bad(`[${def.name}] NPC 落位不在地板：${offFloor.map((n) => n.id).join('、')}`)
    else ok(`[${def.name}] NPC 落位 ${npcs.length} 名且全部在地板（${npcs.map((n) => n.id).join('、')}）`)
  }
  const ids = new Set(npcs.map((n) => n.id))
  const missing = fixedIds.filter((id2) => !ids.has(id2))
  if (missing.length) bad(`[${def.name}] 固定 NPC 未落位：${missing.join('、')}`)
  // v54e：堵门/浮空装饰审计（任务4，全据点通用）——
  // (a) 门洞（hoteldoor 类结构 + 墙线开口格[一对侧为墙、另一对侧为地板的 1 宽扼流格]）正前方第一格不得有实心结构（可交互门除外）；
  // (b) 贴墙装饰（无显式 deg 的 megposter/photo/noticeboard/walltv/screenboard）必须落在本层带地板上且有本层带墙邻格
  {
    const PASSABLE = [...OPENABLE, 'bargate', 'wallwindow'] // wallwindow：墙体窗凹龛是有意的视窗（非通道），不算堵门
    const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < m1.w && y < m1.h
    const ii2 = (x: number, y: number) => y * m1.w + x
    const bandFloor = (x: number, y: number, f: number): boolean => {
      if (!inMap(x, y)) return false
      const ii = ii2(x, y)
      if (f === 0) return m1.tiles[ii] === 1
      if (f === 1) return m1.up[ii] === 1 && m1.upWall[ii] !== 1
      return m1.up2[ii] === 1 && m1.upWall2[ii] !== 1
    }
    const bandWall = (x: number, y: number, f: number): boolean => {
      if (!inMap(x, y)) return true // 图外视为墙
      const ii = ii2(x, y)
      if (f === 0) return m1.tiles[ii] !== 1
      if (f === 1) return m1.upWall[ii] === 1
      return m1.upWall2[ii] === 1
    }
    const solidAtF = (x: number, y: number, f: number) =>
      m1.structures.some((s) => s.solid && !PASSABLE.includes(s.kind) && (s.floor ?? 0) === f && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    const bands = (m1.floors ?? 1) >= 3 ? [0, 1, 2] : (m1.floors ?? 1) === 2 ? [0, 1] : [0]
    const doorBad: string[] = []
    // 墙线开口格（含门洞）正前方检查：扼流格两端的地板格不得有同层带实心结构
    for (const f of bands)
      for (let y = 1; y < m1.h - 1; y++)
        for (let x = 1; x < m1.w - 1; x++) {
          if (!bandFloor(x, y, f) || (m1.stair[ii2(x, y)] & 7) !== 0) continue
          const horiz = bandWall(x, y - 1, f) && bandWall(x, y + 1, f) && bandFloor(x - 1, y, f) && bandFloor(x + 1, y, f)
          const vert = bandWall(x - 1, y, f) && bandWall(x + 1, y, f) && bandFloor(x, y - 1, f) && bandFloor(x, y + 1, f)
          if (!horiz && !vert) continue
          for (const [fx2, fy2] of horiz ? [[x - 1, y], [x + 1, y]] as const : [[x, y - 1], [x, y + 1]] as const)
            if (solidAtF(fx2, fy2, f)) doorBad.push(`(${fx2},${fy2})@f${f}`)
        }
    if (doorBad.length) bad(`[${def.name}] 门洞/扼流格正前方有实心结构 ×${doorBad.length}：${[...new Set(doorBad)].slice(0, 6).join('、')}`)
    const WALL_DECOR = ['megposter', 'photo', 'noticeboard', 'walltv', 'screenboard']
    const decorBad = m1.structures.filter((s) => {
      if (!WALL_DECOR.includes(s.kind) || s.data?.deg !== undefined || s.data?.flat) return false // 显式朝向件人工摆位（另有专项断言）；flat=地面贴花（非贴墙件）
      const f = s.floor ?? 0
      if (!bandFloor(s.x, s.y, f)) return true // 浮空（本层带无地板）
      return ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => bandWall(s.x + dx, s.y + dy, f))
    })
    if (decorBad.length) bad(`[${def.name}] 贴墙装饰浮空/无墙邻 ×${decorBad.length}：${decorBad.slice(0, 6).map((s) => `${s.kind}(${s.x},${s.y})@f${s.floor ?? 0}`).join('、')}`)
    else if (!doorBad.length) ok(`[${def.name}] 门洞前方无实心阻挡 · 贴墙装饰均落本层地板且有墙邻`)
  }
  // 区域标注存在
  if (!m1.zones?.length) bad(`[${def.name}] 无区域名称标注`)
  else ok(`[${def.name}] 区域标注 ×${m1.zones.length}`)
}
checkOutpost(101, ['kat', 'justin', 'nightingale', 'river', 'faust', 'suanpan'])
checkOutpost(102, ['lan', 'laozhangfang', 'shen', 'tang', 'kui'])
checkOutpost(103, ['lecomte', 'muller', 'dupont', 'morel', 'martin', 'lefevre'])
checkOutpost(104, ['tom', 'aiko'])
checkOutpost(105, ['mccauley', 'vesper', 'pidge', 'boone', 'whitfield', 'kowalski'])

// 2e) v54：Gemma 基地（M.E.G.，Level 3 子层级）——真三层单图（楼层带 0|1|2 + up2/upWall2 + 两部坡道楼梯）
checkOutpost(106, ['brandt', 'meilin', 'harper', 'mateo', 'isaac', 'aurora'], { exits: 1, minNpc: 10 }) // 6 固定 NPC（三层各驻）+ 随机居民 ×4（v54 分层）

// 2f) v54：Omega 基地（M.E.G.，Level 4 子层级）——单层三区（居住区/仓储区 + 档案与数据中心）
checkOutpost(109, ['whitaker', 'irene', 'grove', 'hobbs', 'saira', 'voss'], { exits: 1, minNpc: 10 }) // 6 固定 + 随机 ×4
{
  const om = generateLevel(levelDefOf(109)!, 424242, true)
  const d5 = om.exits.find((e) => e.def.dest === 5), d6 = om.exits.find((e) => e.def.dest === 6)
  if (!d5 || !d6) bad(`[Omega 基地] 缺少固定出口（→L5 ${!!d5} · →L6 ${!!d6}）`)
  else ok(`[Omega 基地] 固定出口齐备：楼梯间→L5（${d5.def.kind}）+ 旧活板门→L6（${d6.def.kind}）`)
  // v54c：楼梯间改古典楼梯——oldstairs + 井口护栏 stairrail ×3（尽头横栏）+ 入梯侧净空
  if (d5) {
    if (d5.def.kind !== 'oldstairs') bad(`[Omega 基地] 楼梯间出口非古典楼梯（${d5.def.kind}）`)
    const rails = om.structures.filter((s) => s.kind === 'stairrail')
    if (rails.length !== 3 || !rails.some((s) => s.data?.end === 1)) bad(`[Omega 基地] 古典楼梯护栏异常（stairrail ×${rails.length}，end 标记 ${rails.filter((s) => s.data?.end === 1).length}）`)
    else {
      // 走向 3 格洞口（elev=4）与护栏同格；楼梯格邻墙（东墙）
      const holes = rails.every((s) => om.elev[s.y * om.w + s.x] === 4)
      const nearWall = om.tiles[d5.y * om.w + d5.x + 1] !== 1 || om.tiles[d5.y * om.w + d5.x - 1] !== 1 || om.tiles[(d5.y + 1) * om.w + d5.x] !== 1 || om.tiles[(d5.y - 1) * om.w + d5.x] !== 1
      if (!holes || !nearWall) bad(`[Omega 基地] 古典楼梯洞口/邻墙异常（洞口 ${holes} · 邻墙 ${nearWall}）`)
      else ok('[Omega 基地] 古典楼梯：oldstairs + 洞口 elev=4 ×3 + stairrail 护栏（尽头横栏）+ 楼梯格邻墙')
    }
  }
  // 数据中心内容密度（工位/服务器阵列/档案架齐备）+ v54c 工位二选一（desk 不与 bigcomputer 相邻）
  const nOf = (k: string) => om.structures.filter((s) => s.kind === k).length
  const stations = nOf('desk') + nOf('table')
  if (stations < 25 || nOf('serverrack') < 8 || nOf('libshelf') < 10) bad(`[Omega 基地] 数据中心密度不足（工位 ${stations} · serverrack ${nOf('serverrack')} · libshelf ${nOf('libshelf')}）`)
  else ok(`[Omega 基地] 数据中心：工位 ${stations}（desk ${nOf('desk')} + table ${nOf('table')}）· 服务器阵列 ${nOf('serverrack')} · 档案架 ${nOf('libshelf')}`)
  {
    let adjacent = 0
    for (const s of om.structures) {
      if (s.kind !== 'desk') continue
      if (om.structures.some((o) => o.kind === 'bigcomputer' && Math.abs(o.x - s.x) + Math.abs(o.y - s.y) <= 1)) adjacent++
    }
    if (adjacent) bad(`[Omega 基地] desk 与 bigcomputer 相邻工位 ×${adjacent}（应二选一）`)
    else ok('[Omega 基地] 工位二选一：desk 工位均不紧邻 bigcomputer')
  }
}
// Omega 海报地标率（infiniteL4，~2.5%/chunk 贴墙）
{
  const { genL4ChunkRaw } = await import('../src/game/world/infiniteL4.ts')
  const def4 = levelDefOf(4)!
  let n = 0, tot = 0, badSpot = 0
  for (const sd of [424242, 1337, 2026, 7, 987654])
    for (let cy = -3; cy <= 3; cy++)
      for (let cx = -3; cx <= 3; cx++) {
        const c = genL4ChunkRaw(def4, sd, cx, cy)
        tot++
        for (const s of c.structures) {
          if (s.kind !== 'landmark' || s.data?.outpost !== 'omega') continue
          n++
          const lx = s.x - cx * CS, ly = s.y - cy * CS
          const at = (x: number, y: number) => (x < 0 || y < 0 || x >= CS || y >= CS ? 0 : c.tiles[y * CS + x])
          const hasWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([wx2, wy2]) => at(lx + wx2, ly + wy2) !== 1)
          if (at(lx, ly) !== 1 || !hasWall) badSpot++
          if (s.data?.poster !== 1 || s.data?.tex !== 'omega_poster.png') badSpot++
        }
      }
  const rate = n / tot
  if (badSpot) bad(`[Omega 基地] 海报地标落点/标记异常 ×${badSpot}`)
  else if (rate < 0.01 || rate > 0.045) bad(`[Omega 基地] 海报地标率异常：${(rate * 100).toFixed(2)}%（期望 ~2.5%）`)
  else ok(`[Omega 基地] 海报地标率 ${(rate * 100).toFixed(2)}%（${n}/${tot} chunk，贴墙 + data.poster/tex 正确）`)
}
{
  const gm = generateLevel(levelDefOf(106)!, 424242, true)
  const { canOccupy, PLAYER_RADIUS } = await import('../src/game/core/player.ts')
  const { groundHeightAt, bandOfZ, ceilingHeightAt, wallBaseTopAt, FLOOR_H, ceilingSteps } = await import('../src/game/world/mapgen.ts')
  // 三层结构：floors=3；v54c 解耦断言——墙必在板上（upWall⊆up、upWall2⊆up2）；
  // 上层板不再要求下方有下层地板（up⊈tiles 允许：南向间墙/虚空上方也铺板）；
  // 中庭挑空：前厅内腔无 2F 板但有 3F 屋面板墙（up2/upWall2 独立于 up 成立的实证）
  if (gm.floors !== 3) bad(`[Gemma 基地] floors=${gm.floors} ≠ 3（三层未生效）`)
  let upN = 0, up2N = 0, subsetBad = 0
  for (let i = 0; i < gm.w * gm.h; i++) {
    if (gm.up[i] === 1) upN++
    if (gm.up2[i] === 1) up2N++
    if (gm.upWall[i] === 1 && gm.up[i] !== 1) subsetBad++
    if (gm.upWall2[i] === 1 && gm.up2[i] !== 1) subsetBad++
  }
  if (subsetBad) bad(`[Gemma 基地] 上层墙无楼板依托 ×${subsetBad}（upWall⊈up / upWall2⊈up2）`)
  else ok(`[Gemma 基地] 三层楼板：2F ${upN} 格 · 3F ${up2N} 格（墙必在板；解耦——上层板独立下层轮廓）`)
  {
    const atriumOk = gm.up[11 * gm.w + 39] === 0 && gm.upWall2[11 * gm.w + 39] === 1 && gm.up2[11 * gm.w + 39] === 1
    if (!atriumOk) bad('[Gemma 基地] 挑空中庭异常（前厅内腔应 up=0 + upWall2=1 屋面板墙）')
    else ok('[Gemma 基地] 挑空中庭：前厅双层挑高至 3F 板底（2F 无板、3F 屋面板墙封顶——解耦实证）')
  }
  // 出口：仅 1F 返回 L3 的 back 出口（层间走可行走楼梯，不再用 stairs 出口互链）
  if (gm.exits.length !== 1 || gm.exits[0].def.dest !== 'back') bad(`[Gemma 基地] 出口异常（${gm.exits.map((e) => `${e.def.kind}>${e.def.dest}`).join(',')}）`)
  else ok('[Gemma 基地] 出口仅 1F 北部入口（dest=back）')
  // 两部楼梯：A 段（1F→2F，x58..62 y36，0→3.0）+ B 段（2F→3F，x65..69 y11，3.0→6.0）——v54c 迁移后坐标
  const stairAt = (x: number, y: number) => gm.stair[y * gm.w + x]
  const aOk = [0, 1, 2, 3, 4].every((k) => (stairAt(58 + k, 36) & 7) === 1)
  const bOk = [0, 1, 2, 3, 4].every((k) => (stairAt(65 + k, 11) & 7) === 1
    && Math.abs((((stairAt(65 + k, 11) >> 3) & 0x3fff) / 100) - (FLOOR_H + 0.6 * k)) < 0.01)
  if (!aOk || !bOk) bad(`[Gemma 基地] 坡道楼梯异常（A ${aOk} · B ${bOk}）`)
  else ok('[Gemma 基地] 两部坡道楼梯：A 1F→2F（+x）· B 2F→3F（+x，base=3.0）')
  // 行走回归（同 EL3A 阶梯轨迹法）：A 段从 1F 走上 2F、B 段从 2F 走上 3F，各三条轨迹无卡死
  {
    const stuck: string[] = []
    for (const [label, yy] of [['A中', 36.5], ['A北', 36.34], ['A南', 36.66]] as const) { // A 段：从西端入梯格 (57.5,36) 向东爬
      let z = 0, ok2 = true
      for (let px = 57.5; px <= 63.55; px += 0.08) {
        const band = bandOfZ(z)
        if (!canOccupy(gm, px, yy, PLAYER_RADIUS, { z, band })) { stuck.push(`${label}@x=${px.toFixed(2)},z=${z.toFixed(2)},band=${band}`); ok2 = false; break }
        z = groundHeightAt(gm, px, yy, band)
      }
      if (ok2 && z < 2.9) stuck.push(`${label}落梯 z=${z.toFixed(2)} 未到 2F`)
    }
    for (const [label, yy] of [['B中', 11.5], ['B北', 11.34], ['B南', 11.66]] as const) { // B 段：从西端入梯格 (64.5,11) 向东爬（2F 起坡）
      let z = FLOOR_H, ok2 = true
      for (let px = 64.5; px <= 70.55; px += 0.08) {
        const band = bandOfZ(z)
        if (!canOccupy(gm, px, yy, PLAYER_RADIUS, { z, band })) { stuck.push(`${label}@x=${px.toFixed(2)},z=${z.toFixed(2)},band=${band}`); ok2 = false; break }
        z = groundHeightAt(gm, px, yy, band)
      }
      if (ok2 && z < 2 * FLOOR_H - 0.1) stuck.push(`${label}落梯 z=${z.toFixed(2)} 未到 3F`)
    }
    if (stuck.length) bad(`[Gemma 基地] 楼梯行走卡死：${stuck.join('；')}`)
    else ok('[Gemma 基地] 两部楼梯 ×3 轨迹行走无卡死（1F→2F→3F 连续可上；canOccupy 级）')
  }
  // 跌井守卫：3F 楼板踩不进 A 段坡道（中心在 3F 楼板、采样探入不到达 3F 的坡道段即拦截）；
  // 1F 走不进 B 段悬梯（实心梯体）；二者均以「楼板侧中心 + 探入采样」模拟真实跨入
  if (canOccupy(gm, 63.2, 36.5, PLAYER_RADIUS, { z: 2 * FLOOR_H, band: 2 })) bad('[Gemma 基地] 3F 可踩进 A 段坡道天井（跌井守卫失效）')
  else if (canOccupy(gm, 65.5, 11.5, PLAYER_RADIUS, { z: 0, band: 0 })) bad('[Gemma 基地] 1F 可走进 B 段悬梯（应被实心梯体拦截）')
  else ok('[Gemma 基地] 跌井守卫：3F 踩不进 A 段井 · 1F 走不进 B 段悬梯')
  // NPC 楼层：军需官 1F / 后勤官+住户老兵 2F（站 up 楼板）/ 主管+研究员+档案员 3F（站 up2 楼板）
  const npcFloor = (id: string) => (gm.npcs ?? []).find((n) => n.id === id)
  const nfB = npcFloor('brandt'), nfM = npcFloor('meilin'), nfH = npcFloor('harper')
  const nfMt = npcFloor('mateo'), nfI = npcFloor('isaac'), nfA = npcFloor('aurora')
  const onUp = (n: { x: number; y: number }) => gm.up[Math.floor(n.y) * gm.w + Math.floor(n.x)] === 1
  const onUp2 = (n: { x: number; y: number }) => gm.up2[Math.floor(n.y) * gm.w + Math.floor(n.x)] === 1
  if (!nfB || (nfB.floor ?? 0) !== 0 || !nfM || nfM.floor !== 1 || !onUp(nfM) || !nfH || nfH.floor !== 2 || !onUp2(nfH)
    || !nfMt || nfMt.floor !== 1 || !onUp(nfMt) || !nfI || nfI.floor !== 2 || !onUp2(nfI) || !nfA || nfA.floor !== 2 || !onUp2(nfA))
    bad('[Gemma 基地] NPC 楼层异常（2F 应有 meilin+mateo 站 up 楼板 · 3F 应有 harper+isaac+aurora 站 up2 楼板）')
  else ok('[Gemma 基地] NPC 楼层：brandt 1F · meilin+mateo 2F · harper+isaac+aurora 3F（站位均在对应层楼板）')
  // v54：随机居民分层（2F/3F 各一，floor 字段正确且站对应楼板）
  const randUp = (gm.npcs ?? []).filter((n) => n.id.startsWith('rand_') && n.floor === 1 && onUp(n))
  const randUp2 = (gm.npcs ?? []).filter((n) => n.id.startsWith('rand_') && n.floor === 2 && onUp2(n))
  if (randUp.length !== 1 || randUp2.length !== 1) bad(`[Gemma 基地] 随机居民分层异常（2F ×${randUp.length} · 3F ×${randUp2.length}，应各 1）`)
  else ok('[Gemma 基地] 随机居民 ×4 分层落位（1F×2 · 2F×1 · 3F×1）')
  // 层高契约：1F 天花=2F 板底 2.65 / 2F 天花=3F 板底 5.65 / 3F 天花=8.6；大厅墙顶=8.6（接到三层天花）
  {
    const c0 = ceilingHeightAt(gm, 39.5, 24.5, 3, 0)
    const c1 = ceilingHeightAt(gm, 39.5, 23.5, 3, 1)
    const c2 = ceilingHeightAt(gm, 39.5, 23.5, 3, 2)
    const wt = wallBaseTopAt(gm, 9, 24, 3) // 大厅西侧外墙（虚空瓦片，邻 2F/3F 楼板）
    if (Math.abs(c0 - 2.65) > 0.01 || Math.abs(c1 - 5.65) > 0.01 || Math.abs(c2 - 8.6) > 0.01)
      bad(`[Gemma 基地] 层高异常：1F ${c0.toFixed(2)}（应 2.65）· 2F ${c1.toFixed(2)}（应 5.65）· 3F ${c2.toFixed(2)}（应 8.6）`)
    else if (!wt || Math.abs(wt.top - 8.6) > 0.01) bad(`[Gemma 基地] 大厅外墙顶 ≠ 8.6（${wt?.top.toFixed(2)}——未接到三层天花）`)
    else ok('[Gemma 基地] 层高契约：1F 2.65 / 2F 5.65 / 3F 8.6 · 外墙接到三层天花')
  }
  // zones 三层区域名齐备
  const zset = new Set((gm.zones ?? []).map((z) => z.z ?? 0))
  if (!zset.has(0) || !zset.has(1) || !zset.has(2)) bad('[Gemma 基地] zones 未覆盖三层（z 字段缺失）')
  else ok(`[Gemma 基地] 区域标注 ×${(gm.zones ?? []).length}（三层区域名齐备）`)
  // v54e 二轮：2F 格上方有 3F 板时 band1 天花恒=3F 板底 5.65（2F 跳跃顶板拦截的取值依据——多格抽样）
  {
    const spots: [number, number][] = [[39, 23], [20, 19], [58, 19], [48, 39], [17, 38], [62, 38]]
    const badSpots = spots.filter(([x, y]) => {
      const i = y * gm.w + x
      return gm.up[i] === 1 && gm.upWall[i] !== 1 && gm.up2[i] === 1 && Math.abs(ceilingHeightAt(gm, x + 0.5, y + 0.5, 3, 1) - (2 * FLOOR_H - 0.35)) > 0.01
    })
    if (badSpots.length) bad(`[Gemma 基地] 2F 格 band1 天花非 5.65 ×${badSpots.length}（${badSpots.map(([x, y]) => `${x},${y}`).join('、')}）`)
    else ok('[Gemma 基地] 2F 顶板取值：上方有 3F 板的 2F 格 band1 天花恒=5.65（跳跃拦截依据，6 格抽样）')
  }
  // v54c/d：2F 电视娱乐室——挂墙电视 ×3（v54d 替换立式）+ 休闲椅 + 彩色隔断（floor=1、配色 data.color）
  {
    const tvs = gm.structures.filter((s) => s.kind === 'walltv' && (s.floor ?? 0) === 1)
    const chairs = gm.structures.filter((s) => s.kind === 'loungechair' && (s.floor ?? 0) === 1)
    const dividers = gm.structures.filter((s) => s.kind === 'cubicle' && (s.floor ?? 0) === 1 && s.data?.color)
    if (tvs.length !== 3 || chairs.length < 3 || dividers.length !== 4) bad(`[Gemma 基地] 电视娱乐室布置异常（walltv ×${tvs.length} · loungechair ×${chairs.length} · 彩色隔断 ×${dividers.length}）`)
    else {
      // v54c：挂墙电视必须贴 2F 南墙（deg 180 + 南邻格为 upWall）——此前一台 mountOnWall 认主层虚空贴错/浮空
      const offWall = tvs.filter((s) => s.data?.deg !== 180 || gm.upWall[(s.y + 1) * gm.w + s.x] !== 1)
      if (offWall.length) bad(`[Gemma 基地] 挂墙电视未贴 2F 南墙 ×${offWall.length}`)
      else ok('[Gemma 基地] 2F 电视娱乐室：挂墙电视 ×3（deg 180 贴 2F 南墙、屏朝北）+ 休闲椅 ×6 + 彩色隔断 ×4（floor=1）')
    }
  }
  // v54：mountOnWall 楼层带修复（渲染层语义对齐 v54e 审计口径）——floor≥1 贴墙装饰认对应层 upWall/upWall2：
  // 在 2F 楼板格（邻格为 upWall）合成无 deg 的 megposter 探针，buildStructure 后内层偏移方向须指向本层带墙
  {
    const ti2 = (x: number, y: number) => y * gm.w + x
    let probe: { x: number; y: number } | null = null
    for (let y = 1; y < gm.h - 1 && !probe; y++)
      for (let x = 1; x < gm.w - 1 && !probe; x++) {
        if (gm.up[ti2(x, y)] !== 1 || gm.upWall[ti2(x, y)] === 1) continue // 2F 楼板格（非墙）
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => gm.upWall[ti2(x + dx, y + dy)] === 1)) probe = { x, y }
      }
    const gs = probe && buildStructure({ kind: 'megposter', x: probe.x, y: probe.y, w: 1, h: 1, solid: false, floor: 1 }, levelDefOf(106)!, gm, 3.0)
    const inner = gs?.children.find((c) => Math.abs(c.position.x) > 0.05 || Math.abs(c.position.z) > 0.05)
    let mounted = false
    if (probe && gs && inner) {
      const th = gs.rotation.y // 世界偏移 = inner.position 逆旋 grp.rotation.y
      const wx = inner.position.x * Math.cos(th) + inner.position.z * Math.sin(th)
      const wz = -inner.position.x * Math.sin(th) + inner.position.z * Math.cos(th)
      const dx = Math.abs(wx) > Math.abs(wz) ? Math.sign(wx) : 0
      const dz = dx === 0 ? Math.sign(wz) : 0
      for (let rr = 1; rr <= 3 && !mounted; rr++) mounted = gm.upWall[ti2(probe.x + dx * rr, probe.y + dz * rr)] === 1
    }
    if (!probe || !gs || !mounted) bad('[Gemma 基地] mountOnWall 未把 floor1 贴墙装饰贴向 upWall（楼层带判定未生效）')
    else ok('[Gemma 基地] mountOnWall 楼层带：floor1 贴墙装饰认 upWall（旋转/贴合方向朝本层墙）')
  }
  // v54e：灯贴真实顶——灯须落在对应层带地板上（1F 灯=主层地板；2F/3F 灯=对应层楼板且非上层墙；
  // v54c 解耦后 2F/3F 楼板可架在 1F 墙/虚空上方，故不能一概要求主层地板）；
  // 中庭（2F 挑空）内的灯其瓦片须 up=0 + upWall2=1（渲染层规则：无 z 灯默认贴 2.65；up2/upWall2 格贴 5.65——中庭灯由此贴 3F 板底而非 1F 顶）
  {
    const ti = (x: number, y: number) => y * gm.w + x
    const onOwnFloor = (l: { x: number; y: number; z?: number }) => {
      const ii = ti(Math.floor(l.x), Math.floor(l.y))
      if (l.z === undefined) return gm.tiles[ii] === 1
      if (Math.abs(l.z - FLOOR_H) < 0.01) return gm.up[ii] === 1 && gm.upWall[ii] !== 1
      if (Math.abs(l.z - 2 * FLOOR_H) < 0.01) return gm.up2[ii] === 1 && gm.upWall2[ii] !== 1
      return false
    }
    const offFloor = gm.lights.filter((l) => !onOwnFloor(l))
    if (offFloor.length) bad(`[Gemma 基地] 灯光未落在本层地板 ×${offFloor.length}`)
    const inAtrium = (l: { x: number; y: number }) => {
      const lx = Math.floor(l.x), ly = Math.floor(l.y)
      return (lx >= 34 && lx <= 45 && ly >= 9 && ly <= 14) || (lx === 36 && (ly === 16 || ly === 17))
    }
    const atriumBad = gm.lights.filter((l) => inAtrium(l) && (gm.up[ti(Math.floor(l.x), Math.floor(l.y))] !== 0 || gm.upWall2[ti(Math.floor(l.x), Math.floor(l.y))] !== 1))
    if (atriumBad.length) bad(`[Gemma 基地] 中庭灯瓦片异常 ×${atriumBad.length}（须 up=0 + upWall2=1，灯贴 3F 板底）`)
    else if (!offFloor.length) ok(`[Gemma 基地] 灯贴真实顶：×${gm.lights.length} 各落本层地板 · 中庭灯瓦片均 up=0+upWall2=1（贴 3F 板底 5.65）`)
  }
  // v54e：楼梯间清理——东北走廊取消（前厅无东门）；A 井 3F 板填回；两间挑高取消；B 间 1F=资料室（南门接大厅）
  {
    const ti = (x: number, y: number) => y * gm.w + x
    const corridorGone = gm.tiles[ti(50, 13)] !== 1 && gm.tiles[ti(46, 14)] !== 1 && gm.tiles[ti(62, 13)] !== 1
    const aWellFilled = [58, 59, 60, 61, 62].every((x) => [35, 36, 37].every((y) => gm.up2[ti(x, y)] === 1))
    // v54e 修订：挑高仅余 B 井道上空 6 格（(65..66,10..12)——2F→3F 坡道井道封顶到屋面，封镂空黑洞）
    const ceilTiles: string[] = []
    for (let y = 0; y < gm.h; y++) for (let x = 0; x < gm.w; x++) if (gm.ceiling[y * gm.w + x] === 1) ceilTiles.push(`${x},${y}`)
    const wellSet = new Set(['65,10', '66,10', '65,11', '66,11', '65,12', '66,12'])
    const ceilOk = ceilTiles.length === 6 && ceilTiles.every((t) => wellSet.has(t))
    const libDoor = gm.tiles[ti(66, 17)] === 1 && gm.tiles[ti(66, 16)] === 1
    const libNpc = gm.structures.some((s) => s.kind === 'libshelf' && (s.floor ?? 0) === 0 && s.x >= 62 && s.x <= 73 && s.y >= 9 && s.y <= 17)
    if (!corridorGone) bad('[Gemma 基地] 东北走廊/前厅东门/B 间西门未拆除')
    else if (!aWellFilled) bad('[Gemma 基地] A 井 3F 板未填回（up2 仍有开口）')
    else if (!ceilOk) bad(`[Gemma 基地] 挑高格异常（ceiling=1：${ceilTiles.join(' ')}——应仅 B 井道 6 格）`)
    else if (!libDoor || !libNpc) bad('[Gemma 基地] 资料室异常（南门/书架缺失）')
    else ok('[Gemma 基地] 楼梯间清理：东北走廊已拆 · A 井 3F 板填回 · 挑高仅余 B 井道封顶 6 格 · 1F 资料室（南门+书架）')
  }
  // v54e 任务8：室内格头顶必有覆盖（天花格/楼板底/上层墙盒底/坡道顶板/挑高顶）——
  // 复算 geometry.ts 各层带绘制条件；低顶格邻挑空边界由 ceilingSteps 薄墙封边（另断言封边条数）
  {
    const sHi2 = (i: number) => ((gm.stair[i] >> 17) & 0x3fff) / 100
    const isSt2 = (i: number) => (gm.stair[i] & 7) !== 0
    const holes: string[] = []
    for (let y = 0; y < gm.h; y++)
      for (let x = 0; x < gm.w; x++) {
        const i = y * gm.w + x
        if (gm.tiles[i] !== 1 || gm.outdoor[i] === 1) continue
        // 1F 头顶：up2/up 板或墙盒底 / 坡道顶板（f1: sHi≤3.01 或 v54e 井道分支 sHi≤6.01 / f2: sHi≤6.01）/ 主层天花
        let covered = false
        if (gm.up2[i] === 1) covered = !isSt2(i) || sHi2(i) <= 2 * FLOOR_H + 0.01
        else if (gm.up[i] === 1) covered = !isSt2(i) || sHi2(i) <= 2 * FLOOR_H + 0.01 // v54e 井道分支覆盖到 6.01
        else covered = true // 主层天花（普通 H / 挑高 tallCeilH）
        if (!covered) holes.push(`1F(${x},${y})`)
        // 2F 头顶（站 up 板格）：up2 板/墙盒底或坡道顶板 / 本层天花（f1 平面）；坡道格 sHi>3.01 且 up2=0 = 井道未封口
        if (gm.up[i] === 1 && gm.upWall[i] !== 1) {
          let c1 = false
          if (gm.up2[i] === 1) c1 = !isSt2(i) || sHi2(i) <= 2 * FLOOR_H + 0.01
          else if (isSt2(i)) c1 = sHi2(i) <= 2 * FLOOR_H + 0.01 && gm.ceiling[i] === 1 // v54e 井道分支须配挑高标记（uwTop=tallH）
          else c1 = true // f1 本层天花平面
          if (!c1) holes.push(`2F(${x},${y})`)
        }
        // 3F 头顶（站 up2 板格）：f2 本层天花平面（坡道格须 sHi≤6.01）
        if (gm.up2[i] === 1 && gm.upWall2[i] !== 1) {
          const c2 = !isSt2(i) || sHi2(i) <= 2 * FLOOR_H + 0.01
          if (!c2) holes.push(`3F(${x},${y})`)
        }
      }
    if (holes.length) bad(`[Gemma 基地] 室内格头顶无覆盖 ×${holes.length}：${holes.slice(0, 8).join('、')}`)
    else {
      // 低顶格邻挑空中庭的封边薄墙（前厅北门洞 (39,8) / 南门洞 (39,15) / 墙体窗格 (36,15) → 3F 板底 5.65）
      const steps = ceilingSteps(gm, 3).filter((cs) => cs.hi > 3.5 && cs.hi < 6)
      if (steps.length < 3) bad(`[Gemma 基地] 挑空边界封边缺失（ceilingSteps 3F 板底段 ×${steps.length} < 3）`)
      else ok(`[Gemma 基地] 室内头顶全覆盖（1F/2F/3F 各格有天花/板底/顶板）· 挑空封边薄墙 ×${steps.length}（封到 3F 板底 5.65）`)
    }
  }
}

// 2f) v54：存储设施（BNTG，Level 3 子层级，id 107）+ 蓝色救赎（信众圣所，id 108）
checkOutpost(107, ['dorian', 'gunter', 'pippa']) // 3 back 出口 + 3 固定 + 3 随机（minNpc 缺省 6）
checkOutpost(108, ['theron', 'aella'], { exits: 1, minNpc: 2 }) // 圣所仅北入口 back
// v55：L5 三处据点（全部单 back 出口；无 loot 铁律/连通/落位由 checkOutpost 统断）
checkOutpost(110, ['barclay', 'petra', 'otis'], { exits: 1, minNpc: 4 }) // 哨所：3 固定 + 随机 ×1
checkOutpost(111, ['vivian', 'margot', 'harold'], { exits: 1, minNpc: 5 }) // 酒店：3 固定 + 随机住客 ×2
checkOutpost(112, ['amelia', 'dorothy', 'astor', 'smith', 'hoffa', 'white', 'northup'], { exits: 1, minNpc: 7 }) // 原住民：7 固定失踪者（v55c 补怀特/诺瑟普）
{
  // 蓝色救赎（v54 休息室风）：沙发围合 + 祈祷角小件 + 满墙鹉主画像 + 居住区小室
  const mm = generateLevel(levelDefOf(108)!, 424242, true)
  const sofas = mm.structures.filter((s) => s.kind === 'sofa')
  const portraits = mm.structures.filter((s) => s.kind === 'megposter' && String(s.data?.tex ?? '').startsWith('parrot_portrait'))
  const pulpits = mm.structures.filter((s) => s.kind === 'pulpit')
  const candles = mm.structures.filter((s) => s.kind === 'candlestand')
  const fonts = mm.structures.filter((s) => s.kind === 'holyfont')
  const cells = mm.structures.filter((s) => s.kind === 'bed')
  if (sofas.length < 8 || portraits.length < 10)
    bad(`[蓝色救赎] 休息室布置不足（沙发 ×${sofas.length}（应 ≥8）· 鹉主画像 ×${portraits.length}（应 ≥10））`)
  else if (pulpits.length !== 1 || candles.length < 5 || fonts.length !== 2 || cells.length !== 3)
    bad(`[蓝色救赎] 祈祷角/居住区异常（讲坛 ${pulpits.length}/烛台 ${candles.length}/圣水盆 ${fonts.length}/小室床 ${cells.length}）`)
  else ok(`[蓝色救赎] 休息室风：沙发 ×${sofas.length}（围合 ×3）· 鹉主画像 ×${portraits.length} · 祈祷角（讲坛/烛台/圣水盆）· 居住区小室 ×3`)
  // 声望门槛：jerry 声望 ≤30 拦截、>30 放行；DevPanel 跳转（dev=true）不受限
  const { enterOutpost } = await import('../src/game/engine/level.ts')
  const mk = (rep: number) => ({ // 最小引擎桩——enterOutpost 只读 map/rep/player.level，写 outpostReturn/transition
    map: {}, rep: { jerry: rep }, player: { level: 3 }, outpostReturn: null as number | null,
    transition: null as unknown, msg() {}, emit() {},
  })
  const e30 = mk(30), e31 = mk(31), eDev = mk(0)
  const r30 = enterOutpost(e30 as never, 'bluesalvation')
  const r31 = enterOutpost(e31 as never, 'bluesalvation')
  const rDev = enterOutpost(eDev as never, 'bluesalvation', true)
  if (r30) bad('[蓝色救赎] 声望 30 未拦截（应 ≤30 拦截）')
  else if (!r31 || !e31.transition) bad('[蓝色救赎] 声望 31 未放行（应 >30 放行并进入过场）')
  else if (!rDev) bad('[蓝色救赎] DevPanel 跳转被门槛误拦（应不受限）')
  else ok('[蓝色救赎] 准入门槛：声望 30 拦截 / 31 放行（过场已触发）/ DevPanel 跳转不受限')
  // v54c：烛光贴附——每盏暖烛光必须落在烛台瓦片上（fixZ 烛火高 + noFix 不画默认灯盒，灯具=烛台模型）
  {
    const warm = mm.lights.filter((l) => l.color === '#ffd9a0')
    const badLight = warm.filter((l) => l.fixZ === undefined || l.noFix !== 1
      || !candles.some((c2) => Math.floor(c2.x + 0.5) === Math.floor(l.x) && Math.floor(c2.y + 0.5) === Math.floor(l.y)))
    if (warm.length < 5) bad(`[蓝色救赎] 烛光数量不足（${warm.length}/5）`)
    else if (badLight.length) bad(`[蓝色救赎] 烛光未贴烛台 ×${badLight.length}（fixZ/noFix/落位不符）`)
    else ok(`[蓝色救赎] 烛光 ×${warm.length} 全部贴附烛台（fixZ 烛火高 + noFix，灯具=烛台模型）`)
    // v54c：全部灯光必须落在地板瓦片上（灯光网格曾误用设计坐标过 X() 缩放——整体偏向右下 ×1.25）
    const offFloor = mm.lights.filter((l) => mm.tiles[Math.floor(l.y) * mm.w + Math.floor(l.x)] !== 1)
    if (offFloor.length) bad(`[蓝色救赎] 灯光落在非地板瓦片 ×${offFloor.length}（坐标缩放错位）`)
    else ok(`[蓝色救赎] 灯光 ×${mm.lights.length} 全部落在地板（无坐标缩放错位）`)
  }
}

// 2c-2) v55：L5 三据点专项——准入门槛（申请/邀请函）、L5 地标生成率、邀请函生成率、阵营注册
{
  const { enterOutpost } = await import('../src/game/engine/level.ts')
  // 家常酒店：未申请拦截 / 申请后放行 / dev 跳转不受限
  const mkH = (applied: boolean) => ({
    map: {}, rep: {}, player: { level: 5 }, outpostReturn: null as number | null,
    transition: null as unknown, msg() {}, emit() {}, homelyApplied: applied,
    hasItem: () => false,
  })
  const h0 = mkH(false), h1 = mkH(true), hDev = mkH(false)
  const rH0 = enterOutpost(h0 as never, 'homely')
  const rH1 = enterOutpost(h1 as never, 'homely')
  const rHDev = enterOutpost(hDev as never, 'homely', true)
  if (rH0) bad('[家常酒店] 未申请未拦截')
  else if (!rH1 || !h1.transition) bad('[家常酒店] 已申请未放行')
  else if (!rHDev) bad('[家常酒店] DevPanel 跳转被误拦')
  else ok('[家常酒店] 准入：未申请拦截 / 申请后放行（过场已触发）/ DevPanel 不受限')
  // 原住民：v55b 起邀请函为可交互装饰（贝弗莉室散落的 invitation 结构，阅读即弹地标卡可前往）——准入无物品门槛，直达放行；dev 同径
  const mkO = () => ({
    map: {}, rep: {}, player: { level: 5 }, outpostReturn: null as number | null,
    transition: null as unknown, msg() {}, emit() {}, homelyApplied: false,
    hasItem: () => false,
  })
  const o0 = mkO(), oDev = mkO()
  const rO0 = enterOutpost(o0 as never, 'originals')
  const rODev = enterOutpost(oDev as never, 'originals', true)
  if (!rO0 || !o0.transition) bad('[原住民] 无物品门槛未放行（v55b 起邀请函为交互装饰，阅读即可前往）')
  else if (!rODev) bad('[原住民] DevPanel 跳转被误拦')
  else ok('[原住民] 准入：无门槛直达（邀请函=可交互装饰，阅读地标卡前往）/ DevPanel 不受限')
  // 阵营注册：homely/originals 合法且无声望（无法加入语义）
  const { FACTIONS } = await import('../src/game/content/factions.ts')
  if (!FACTIONS.homely || !FACTIONS.originals) bad('factions 缺 homely/originals')
  else if (FACTIONS.homely.hasRep || FACTIONS.originals.hasRep) bad('homely/originals 不应有声望（hasRep=false）')
  else ok('阵营注册：homely（家常酒店）+ originals（原住民）均 hasRep=false')
}
// L5 地标与邀请函生成率（infiniteL5：告示 ~1.5%/chunk 走廊贴墙；酒店标志主厅 ~30%/厅；邀请函贝弗莉 ~30%/厅）
{
  const { genL5ChunkRaw, l5RegionAt } = await import('../src/game/world/infiniteL5.ts')
  const def5 = levelDefOf(5)!
  let notice = 0, sign = 0, inv = 0, tot = 0, badSpot = 0
  for (const sd of [424242, 1337, 2026, 7, 987654])
    for (let cy = -4; cy <= 4; cy++)
      for (let cx = -4; cx <= 4; cx++) {
        const c = genL5ChunkRaw(def5, sd, cx, cy)
        tot++
        for (const s of c.structures) {
          if (s.kind !== 'landmark') continue
          const lx = s.x - cx * CS, ly = s.y - cy * CS
          const at = (x: number, y: number) => (x < 0 || y < 0 || x >= CS || y >= CS ? 0 : c.tiles[y * CS + x])
          const hasWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([wx2, wy2]) => at(lx + wx2, ly + wy2) !== 1)
          if (at(lx, ly) !== 1 || !hasWall) badSpot++
          if (s.data?.outpost === 'housekeeping') {
            notice++
            if (s.data?.poster !== 1 || s.data?.tex !== 'l5_notice.png') badSpot++
            if (l5RegionAt(sd, s.x, s.y)?.variant != null) badSpot++ // 告示只贴走廊
          } else if (s.data?.outpost === 'homely') {
            sign++
            if (s.data?.poster !== 1 || s.data?.tex !== 'l5_homelysign.png') badSpot++
            if (l5RegionAt(sd, s.x, s.y)?.variant !== 'mainhall') badSpot++ // 标志只在主厅
          } else badSpot++ // L5 不应有其他据点地标
        }
        for (const it of c.items) if (it.type === 'invitation') bad('[L5 据点] 邀请函物品形式残留（v55b 起为结构）')
        for (const s of c.structures) if (s.kind === 'invitation') {
          inv++
          if (s.solid) badSpot++ // 非实心、不挡路
          if (s.data?.outpost !== 'originals') badSpot++
          if (l5RegionAt(sd, s.x, s.y)?.variant !== 'beverly') badSpot++ // 只在贝弗莉室
        }
      }
  const rate = notice / tot
  if (badSpot) bad(`[L5 据点] 地标落点/标记异常 ×${badSpot}`)
  else if (rate < 0.005 || rate > 0.035) bad(`[L5 据点] 告示地标率异常：${(rate * 100).toFixed(2)}%（期望 ~1.5%）`)
  else if (!sign || !inv) bad(`[L5 据点] 酒店标志/邀请函缺失（sign ${sign} · inv ${inv}）`)
  else ok(`[L5 据点] 告示 ${(rate * 100).toFixed(2)}%（${notice}/${tot} chunk 走廊贴墙）· 酒店标志 ×${sign}（主厅）· 邀请函 ×${inv}（贝弗莉室）`)
}

// 2d) Level 274「杰瑞的房间」（v45/v47）：教堂手工小层级——连通/出口/NPC 落位/zones/结构件/实体
checkOutpost(274, ['zeph', 'polly', 'bluebird', 'sinclair'], { exits: 1, minNpc: 7 })
{
  const mm = generateLevel(levelDefOf(274)!, 424242, true)
  // 杰瑞实体：主间栖木上（stationary、无害不攻击、passive+noRetaliate）
  const j = mm.entities.find((e) => e.def.type === 'jerry')
  if (!j) bad('[L274] 杰瑞实体未生成')
  else if (!j.def.stationary || !j.def.passive || !j.def.noRetaliate || j.def.damage > 0) bad('[L274] 杰瑞实体行为标记异常（应 stationary+passive+noRetaliate+0 伤害）')
  else ok(`[L274] 鹉主杰瑞栖息于主间栖木（z=${j.z} · stationary 无害）`)
  // 穹顶结构件 + 栖木 + 挑高
  const dome = mm.structures.find((s) => s.kind === 'domering')
  const perch = mm.structures.find((s) => s.kind === 'perch')
  if (!dome || dome.solid) bad('[L274] 穹顶结构件（domering）缺失或被标实心')
  else if (!perch) bad('[L274] 杰瑞栖木（perch）缺失')
  else ok(`[L274] 穹顶结构件（r=${dome.data?.r} · apex=${dome.data?.apex}）与栖木在位`)
  let ceilN = 0
  for (let i = 0; i < mm.w * mm.h; i++) if (mm.ceiling[i] === 1) ceilN++
  if (ceilN < 400) bad(`[L274] 挑高天花板 ${ceilN} 格过少（主间穹顶应 ≥400）`)
  else ok(`[L274] 教堂风挑高：ceiling=1 共 ${ceilN} 格（主间巨大穹顶）`)
  // zones（v47：前厅/主间/穹顶下/告解室/祭衣间/居住区同步）
  const zn = new Set((mm.zones ?? []).map((z) => z.name))
  const zNeed = ['主间', '前厅', '穹顶下', '告解室', '祭衣间·圣器室', '信徒居住区']
  if (zNeed.some((z) => !zn.has(z))) bad(`[L274] 区域标注缺失：${zNeed.filter((z) => !zn.has(z)).join('、')}`)
  else ok(`[L274] 区域标注齐备（${[...zn].join('、')}）`)
  // 蓝白圣辉 tint=17 + 信众海报 + 建模可构建
  let tintN = 0
  for (let i = 0; i < mm.w * mm.h; i++) if (mm.tint[i] === 17) tintN++
  const posters = mm.structures.filter((s) => s.kind === 'megposter' && s.data?.tex === 'jerry_poster.png')
  if (tintN === 0) bad('[L274] 蓝白圣辉 tint=17 未盖章')
  else if (posters.length < 4) bad(`[L274] 信众宣传海报 ${posters.length} 过少（前厅+主间应 ≥4）`)
  else ok(`[L274] 蓝白圣辉 tint ×${tintN} · 信众海报 ×${posters.length}`)
  // v47 教堂细化：讲坛/烛台/圣水盆/长椅排/蓝色彩玻窗/居住区小间（床+小桌+烛灯）
  const pulpits = mm.structures.filter((s) => s.kind === 'pulpit')
  const candles = mm.structures.filter((s) => s.kind === 'candlestand')
  const fonts = mm.structures.filter((s) => s.kind === 'holyfont')
  const pews = mm.structures.filter((s) => s.kind === 'bench' && typeof s.data?.deg === 'number')
  const stains = mm.structures.filter((s) => s.kind === 'glasswin' && s.data?.stain === 'blue')
  const beds = mm.structures.filter((s) => s.kind === 'bed')
  const tables = mm.structures.filter((s) => s.kind === 'table')
  if (pulpits.length !== 1) bad(`[L274] 讲坛 ${pulpits.length} ≠ 1`)
  else if (candles.length < 5) bad(`[L274] 烛台 ${candles.length} 过少（栖木两侧+告解室+祭衣间应 ≥5）`)
  else if (fonts.length < 3) bad(`[L274] 圣水盆 ${fonts.length} 过少（主间入口一对+告解室应 ≥3）`)
  else if (pews.length < 24) bad(`[L274] 长椅排 ${pews.length} 过少（东西两区条凳应 ≥24）`)
  else if (stains.length !== 10) bad(`[L274] 蓝色彩玻窗 ${stains.length} ≠ 10（东西墙各五扇）`)
  else if (beds.length !== 5 || tables.length < 5) bad(`[L274] 居住区小间家具不足（床 ×${beds.length} / 小桌 ×${tables.length}，应各 5）`)
  else ok(`[L274] 教堂细化：讲坛/烛台 ×${candles.length}/圣水盆 ×${fonts.length}/长椅排 ×${pews.length}/彩玻窗 ×${stains.length}/居住区小间 ×${beds.length}`)
  // v47 灯光：栖木聚光挂穹顶圣辉盘真实高度（fixZ 5.1 + noFix 灯具由结构件提供）；环绕圣辉在挑高瓦片上
  const perchLight = mm.lights.find((l) => l.noFix === 1)
  const ringLights = mm.lights.filter((l) => l.noFix !== 1 && l.fixZ === undefined)
  const ringOnTall = ringLights.filter((l) => mm.ceiling[Math.floor(l.y) * mm.w + Math.floor(l.x)] === 1)
  if (!perchLight || perchLight.fixZ !== 5.1) bad('[L274] 栖木聚光未挂穹顶圣辉盘真实高度（应 fixZ=5.1 + noFix）')
  else if (ringOnTall.length < 7) bad(`[L274] 挑高穹顶下的环绕圣辉灯 ${ringOnTall.length} 过少（应 ≥7 盏贴挑高顶）`)
  else ok(`[L274] 灯光适配穹顶：栖木聚光 fixZ=${perchLight.fixZ}（圣辉盘真实高度）· 挑高区环绕圣辉 ×${ringOnTall.length}`)
  // v47 双图鉴：层级页（Level 274 · 杰瑞的房间）与据点页（杰瑞的房间）各出现一次；HUD label 不受据点改名影响
  const { OUTPOSTS: OPS } = await import('../src/game/content/outposts.ts')
  const lv274 = levelDefOf(274)!
  if (lv274.label !== 'Level 274 · 杰瑞的房间') bad(`[L274] 层级 label 异常：${lv274.label}`)
  else if (OPS.jerry?.name !== '杰瑞的房间' || OPS.jerry.levelId !== 274) bad(`[L274] 据点条目异常：${OPS.jerry?.name}（levelId ${OPS.jerry?.levelId}）`)
  else if ((LEVELS as { id: number }[]).some((l) => l.id === 274)) bad('[L274] 不应混入 LEVELS 下标（双图鉴重复计数）')
  else ok('[L274] 双图鉴：层级页「Level 274 · 杰瑞的房间」+ 据点页「杰瑞的房间」（不占 LEVELS 下标，无重复计数）')
  // 结构建模可构建（含 v47 新增讲坛/烛台/圣水盆/彩玻窗）
  const g1 = buildStructure({ kind: 'domering', x: 0, y: 0, w: 1, h: 1, solid: false, data: { r: 12, apex: 5 } }, levelDefOf(274)!, mm, 3.0)
  const g2 = buildStructure({ kind: 'perch', x: 0, y: 0, w: 1, h: 1, solid: true }, levelDefOf(274)!, mm, 3.0)
  const g3 = buildStructure({ kind: 'pulpit', x: 0, y: 0, w: 1, h: 1, solid: true, data: { deg: 90 } }, levelDefOf(274)!, mm, 3.0)
  const g4 = buildStructure({ kind: 'candlestand', x: 0, y: 0, w: 1, h: 1, solid: false }, levelDefOf(274)!, mm, 3.0)
  const g5 = buildStructure({ kind: 'holyfont', x: 0, y: 0, w: 1, h: 1, solid: true }, levelDefOf(274)!, mm, 3.0)
  const g6 = buildStructure({ kind: 'glasswin', x: 0, y: 0, w: 1, h: 1, solid: true, data: { stain: 'blue' } }, levelDefOf(274)!, mm, 3.0)
  if (!g1 || !g2 || !g3 || !g4 || !g5 || !g6) bad('[L274] domering/perch/pulpit/candlestand/holyfont/彩玻窗 建模返回 null')
  else ok('[L274] domering/perch/pulpit/candlestand/holyfont/彩玻窗 建模可构建')
}

// 2c) 办公区EL3A（v48 南侧夹楼重排）：夹楼南侧单侧 ~40% / 真阶梯 / 实心扶手 / 灯具贴附 / 柱子规则 / 2F NPC
{
  const mm = generateLevel(levelDefOf(105)!, 424242, true)
  const { canOccupy, PLAYER_RADIUS } = await import('../src/game/core/player.ts')
  const { groundHeightAt, bandOfZ, ceilingHeightAt, structColliders } = await import('../src/game/world/mapgen.ts')
  if (mm.floors !== 2) bad(`[EL3A] floors=${mm.floors} ≠ 2（双层未生效）`)
  // 夹楼=南侧整片（x13..68 × y41..60）+ 两部阶梯坡道上半段（y39..40），面积占仓库矩形 36%~44%
  let upN = 0, stairN = 0, upMinY = 1e9, upOutBlock = 0, hole = 0
  for (let i = 0; i < mm.w * mm.h; i++) {
    if (mm.up[i] === 1) {
      upN++
      const uy = Math.floor(i / mm.w)
      upMinY = Math.min(upMinY, uy)
      if (uy < 41 && (mm.stair[i] & 7) === 0) upOutBlock++ // 非阶梯的块外楼板 = 不是单侧整片
    }
    if (mm.stair[i] !== 0) stairN++
  }
  for (let y = 41; y <= 60; y++) for (let x = 13; x <= 68; x++) if (mm.up[y * mm.w + x] !== 1) hole++
  const ratio = upN / (56 * 50)
  if (upOutBlock > 0 || hole > 0 || upMinY !== 38) bad(`[EL3A] 夹楼非南侧单侧整片（块外楼板 ${upOutBlock} 格 / 片内空洞 ${hole} 格，up 最小 y=${upMinY} 应=38：阶梯坡道上段 3 格并入上层）`)
  else if (ratio < 0.36 || ratio > 0.44) bad(`[EL3A] 夹楼面积占比 ${(ratio * 100).toFixed(1)}% 偏离 ~40%（up ${upN} 格）`)
  else if (stairN !== 10) bad(`[EL3A] 楼梯坡道 ${stairN} 格 ≠ 10（两部 5 格阶梯）`)
  else ok(`[EL3A] 夹楼南侧单侧整片：up ${upN} 格 = 仓库 ${(ratio * 100).toFixed(1)}%（≈40%）· 楼梯坡道 ${stairN} 格（两部）`)
  // 仓储家具：托盘 + 实心斜扶手（v46 实心化[细条碰撞盒]；v49 斜扶手——h0/h1 随坡道倾斜；落梯口 (20,41)/(60,41) 不得有扶手）
  const pallets = mm.structures.filter((s) => s.kind === 'pallet')
  const rails = mm.structures.filter((s) => s.kind === 'handrail')
  const railsBad = rails.filter((s) => !s.solid || s.data?.deg === undefined
    || (Math.floor(s.y) === 41 && (Math.floor(s.x) === 20 || Math.floor(s.x) === 60)))
  // v49 斜扶手贴坡校验：全部带 h0/h1（坡道面在瓦片局部 -x/+x 端高度，相对结构底座）；每格坡度 |h0-h1|=0.6
  // （=坡道每格爬升 FLOOR_H/5）；朝向正确（西排 deg90 → h0>h1；东排 deg270 → h0<h1）
  const railSlopeBad = rails.filter((s) => {
    if (s.data?.h0 === undefined || s.data?.h1 === undefined) return true
    const h0 = Number(s.data.h0), h1 = Number(s.data.h1)
    if (Number.isNaN(h0) || Number.isNaN(h1) || Math.abs(Math.abs(h0 - h1) - 0.6) > 0.02) return true
    const deg = Number(s.data?.deg)
    return (deg === 90 && h0 <= h1) || (deg === 270 && h0 >= h1)
  })
  // 相邻格绝对高度连续（南端 vs 下一格北端；底座：floor=1 → 3.0，floor=0 → 0）——逐级衔接无断茬
  let railGap = 0
  for (const rx of [19, 21, 59, 61]) {
    const col = rails.filter((s) => Math.floor(s.x) === rx).sort((a, b) => a.y - b.y)
    for (let i = 0; i + 1 < col.length; i++) {
      const baseA = (col[i].floor ?? 0) === 1 ? 3 : 0, baseB = (col[i + 1].floor ?? 0) === 1 ? 3 : 0
      const southA = baseA + Number(Number(col[i].data?.deg) === 90 ? col[i].data?.h0 : col[i].data?.h1)
      const northB = baseB + Number(Number(col[i + 1].data?.deg) === 90 ? col[i + 1].data?.h1 : col[i + 1].data?.h0)
      if (Math.abs(southA - northB) > 0.02) railGap++
    }
  }
  if (pallets.length < 20) bad(`[EL3A] 木托盘堆 ${pallets.length} 过少（仓库应 ≥20）`)
  else if (rails.length !== 20 || railsBad.length > 0) bad(`[EL3A] 扶手栏杆 ${rails.length} 根（应 20；非实心/缺朝向/堵住落梯口 ×${railsBad.length}）`)
  else if (railSlopeBad.length > 0 || railGap > 0) bad(`[EL3A] 斜扶手未贴坡（坡度/朝向异常 ×${railSlopeBad.length} · 相邻格断茬 ×${railGap}）`)
  else ok(`[EL3A] 仓储家具：木托盘堆 ×${pallets.length} · 实心斜扶手 ×${rails.length}（h0/h1 随坡道倾斜，坡度 0.6/格贴坡道，逐级衔接无断茬）`)
  // 扶手碰撞盒真实（细条 FULL_BLOCK）
  {
    const r0 = rails.find((s) => (s.floor ?? 0) === 0)
    const boxes = r0 ? structColliders(r0) : []
    if (!boxes.length || boxes[0].top < 1e8) bad('[EL3A] 扶手碰撞盒不是全高阻挡（实心化未生效）')
  }
  // 夹楼家具（floor=1）：休息室售货机/长椅朝向（deg 180 面朝北·公共区）+ 值班床完全在室内（不嵌墙不悬空）
  const upFurn = mm.structures.filter((s) => (s.floor ?? 0) === 1)
  const vend = upFurn.find((s) => s.kind === 'vending')
  const benches = upFurn.filter((s) => s.kind === 'bench')
  const bunks = upFurn.filter((s) => s.kind === 'bunkbed')
  const bunkBad = bunks.some((s) => {
    for (let ty = Math.floor(s.y); ty < Math.floor(s.y + s.h); ty++)
      for (let tx = Math.floor(s.x); tx < Math.floor(s.x + s.w); tx++)
        if (mm.up[ty * mm.w + tx] !== 1 || mm.upWall[ty * mm.w + tx] === 1) return true
    return false
  })
  if (!upFurn.length) bad('[EL3A] 夹楼无上层家具')
  else if (!vend || Number(vend.data?.deg) !== 180 || benches.some((b) => Number(b.data?.deg) !== 180))
    bad('[EL3A] 休息室售货机/长椅朝向未面朝公共区（deg 应=180）')
  else if (bunkBad) bad('[EL3A] 值班床嵌入上层墙或悬在中庭上空')
  else ok(`[EL3A] 夹楼家具 ${upFurn.length} 件（售货机/长椅面朝公共区 ✓ · 值班床完全在室内 ✓）`)
  // 灯具贴附规则：每盏灯都有 z/fixZ/所在瓦片顶面依据；挑高中庭（ceiling=1 且无楼板）不得有默认吊灯
  let badLight = 0, wallLampLight = 0
  for (const l of mm.lights) {
    const li = Math.floor(l.y) * mm.w + Math.floor(l.x)
    const indoor = mm.tiles[li] === 1 && mm.outdoor[li] !== 1
    if (l.z === undefined && l.fixZ === undefined && !indoor) badLight++
    if (indoor && mm.ceiling[li] === 1 && mm.up[li] !== 1 && l.z === undefined && l.fixZ === undefined) badLight++ // 挑高区悬空吊灯
    if (l.fixZ !== undefined && l.noFix === 1 && l.fixZ < 5) wallLampLight++
  }
  const wallLamps = mm.structures.filter((s) => s.kind === 'walllamp')
  const lampNoWall = wallLamps.filter((s) => {
    const tx = Math.floor(s.x), ty = Math.floor(s.y)
    return mm.tiles[ty * mm.w + tx - 1] === 1 && mm.tiles[ty * mm.w + tx + 1] === 1
      && mm.tiles[(ty - 1) * mm.w + tx] === 1 && mm.tiles[(ty + 1) * mm.w + tx] === 1
  })
  // v49 挑高顶高顶灯（仓库太暗补光）：hanglight 灯具贴挑高顶 5.6（必须在挑高瓦片、非实心、不在坡道/楼板格），
  // 配套大半径暖白光源（fixZ≥5 贴灯具真实高度、r≥8、noFix=灯具模型由结构提供——不悬空）
  const bayLamps = mm.structures.filter((s) => s.kind === 'hanglight')
  const bayBad = bayLamps.filter((s) => {
    const ti = Math.floor(s.y) * mm.w + Math.floor(s.x)
    return s.solid || mm.ceiling[ti] !== 1 || mm.up[ti] === 1 || (mm.stair[ti] & 7) !== 0
  })
  const bayLights = mm.lights.filter((l) => l.noFix === 1 && l.fixZ !== undefined && l.fixZ >= 5 && l.r >= 8)
  if (badLight) bad(`[EL3A] 悬空灯/挑高吊灯 ×${badLight}（灯具必须贴天花/楼板底/墙/地）`)
  else if (wallLamps.length < 4 || wallLampLight < wallLamps.length || lampNoWall.length)
    bad(`[EL3A] 壁挂斜照灯异常（结构 ×${wallLamps.length} · 配套光源 ×${wallLampLight} · 不贴墙 ×${lampNoWall.length}）`)
  else if (bayLamps.length < 10 || bayBad.length > 0 || bayLights.length < bayLamps.length)
    bad(`[EL3A] 挑高顶高顶灯异常（灯具 ×${bayLamps.length}（非挑高顶/实心/坡道格 ×${bayBad.length}）· 大半径配套光源 ×${bayLights.length}）`)
  else ok(`[EL3A] 灯具全部贴附：壁灯 ×${wallLamps.length}（结构贴墙 + fixZ 光源）· 挑高顶高顶灯 ×${bayLamps.length}（hanglight 贴 5.6 顶 + fixZ r≥8 暖白大半径）· 楼板底/上层天花/普通天花灯 ${mm.lights.length - wallLampLight - bayLights.length} 盏`)
  // 柱子只在夹楼下方（瓦片有楼板）且顶到楼板底
  const pillars = mm.structures.filter((s) => s.kind === 'pillar')
  const pillarBad = pillars.filter((s) => mm.up[Math.floor(s.y) * mm.w + Math.floor(s.x)] !== 1)
  if (pillars.length < 6 || pillarBad.length) bad(`[EL3A] 柱子规则违反（×${pillars.length}，其中 ${pillarBad.length} 根不在夹楼下方）`)
  else ok(`[EL3A] 承重柱 ×${pillars.length} 全部在夹楼下方（顶到楼板底 2.65）`)
  // 挑高顶与夹楼天花拉平（5.6m；消除错层漂浮）+ 楼板底=一层天花 2.65
  {
    const atrium = ceilingHeightAt(mm, 34.5, 24.5, 3, 0)
    const under = ceilingHeightAt(mm, 40.5, 50.5, 3, 0)
    const upTop = ceilingHeightAt(mm, 40.5, 50.5, 3, 1)
    if (Math.abs(atrium - 5.6) > 0.01 || Math.abs(under - 2.65) > 0.01 || Math.abs(upTop - 5.6) > 0.01)
      bad(`[EL3A] 顶高异常：中庭 ${atrium.toFixed(2)}（应 5.6）· 夹楼下 ${under.toFixed(2)}（应 2.65）· 2F 顶 ${upTop.toFixed(2)}（应 5.6）`)
    else ok('[EL3A] 挑高顶=夹楼天花 5.6m（一层区域的顶只有一层）· 夹下楼板底=2.65m')
  }
  // v49 低顶上方填墙：①挑高区邻低顶房间的外墙顶=挑高顶（物流办公室/兑换间顶 3.0，
  // 其挑高侧 y=10 墙排邻挑高地板 → wallBaseTopAt 顶 5.6）；②低顶↔挑高地板直接相邻的檐口填墙
  // （迎宾廊口 x38..43 y10/11、东西门廊口——低层屋顶上方的虚空由 geometry 按 ceilingSteps 填薄墙封闭）
  {
    const { wallBaseTopAt, ceilingSteps } = await import('../src/game/world/mapgen.ts')
    const wallTopOk = [30, 33, 36, 44, 47, 50].every((wx) => {
      const bt = wallBaseTopAt(mm, wx, 10, 3)
      return !!bt && Math.abs(bt.top - 5.6) < 0.01
    })
    const steps = ceilingSteps(mm, 3)
    const mouthOk = [38, 39, 40, 41, 42, 43].every((sx) =>
      steps.some((cs) => cs.x === sx && cs.y === 10 && cs.dir === 2 && Math.abs(cs.lo - 3) < 0.01 && Math.abs(cs.hi - 5.6) < 0.01))
    const eastOk = [33, 34, 35, 36, 37, 38].every((sy) => steps.some((cs) => cs.x === 69 && cs.y === sy && cs.dir === 3))
    const westOk = [33, 34, 35, 36, 37, 38].every((sy) => steps.some((cs) => cs.x === 12 && cs.y === sy && cs.dir === 1))
    if (!wallTopOk) bad('[EL3A] 挑高区邻低顶房间的外墙顶 ≠ 挑高顶 5.6（低层屋顶上方虚空未封）')
    else if (!mouthOk || !eastOk || !westOk) bad(`[EL3A] 低顶檐口填墙缺失（迎宾廊口 ${mouthOk} · 东门廊 ${eastOk} · 西门廊 ${westOk}）`)
    else ok(`[EL3A] 低顶上方填墙：低顶房间挑高侧外墙顶=5.6 · 檐口薄墙 ×${steps.length}（迎宾廊口/东西门廊口 3.0→5.6 封虚空）`)
  }
  // 真阶梯行走回归（v46 楼梯换带卡死）：两部阶梯各三条轨迹（中线+两侧偏）从坡道底走上 2F
  {
    let stuck: string[] = []
    for (const [label, xx] of [['A中', 20.5], ['A西', 20.34], ['A东', 20.66], ['B中', 60.5], ['B西', 60.34], ['B东', 60.66]] as const) {
      let z = 0, ok2 = true
      for (let y = 35.5; y <= 41.55; y += 0.08) {
        const band = bandOfZ(z)
        if (!canOccupy(mm, xx, y, PLAYER_RADIUS, { z, band })) { stuck.push(`${label}@y=${y.toFixed(2)},z=${z.toFixed(2)},band=${band}`); ok2 = false; break }
        z = groundHeightAt(mm, xx, y, band)
      }
      if (ok2 && z < 2.9) stuck.push(`${label}落梯 z=${z.toFixed(2)} 未到 2F`)
    }
    if (stuck.length) bad(`[EL3A] 阶梯行走卡死：${stuck.join('；')}`)
    else ok('[EL3A] 两部阶梯 ×3 轨迹行走无卡死（含 z≥1.5 换带与侧向偏移；canOccupy 级）')
  }
  // 2F 固定 NPC（运营主任/老会计）：floor=1 且站位在上层楼板
  const upNpcs = (mm.npcs ?? []).filter((n) => n.floor === 1)
  const upNpcBad = upNpcs.filter((n) => mm.up[Math.floor(n.y) * mm.w + Math.floor(n.x)] !== 1)
  if (upNpcs.length < 2 || upNpcBad.length) bad(`[EL3A] 2F NPC 异常（${upNpcs.length} 名，站位不在楼板 ×${upNpcBad.length}）`)
  else ok(`[EL3A] 2F 固定 NPC ×${upNpcs.length}（${upNpcs.map((n) => n.id).join('、')}，floor=1 站位夹楼楼板）`)
  // 随机 NPC 用专属 el3a flavor（不再与 Tom 餐馆的 mixed 共用）
  const randFac = new Set((mm.npcDefs ?? []).map((d) => `${d.faction}:${d.role}`))
  const isEl3aPool = (mm.npcDefs ?? []).every((d) => d.faction === 'bntg'
    && ['叉车司机', '盘点员', '质检员', '装卸学徒', '仓管文员', '押运护卫'].includes(d.role))
  if (!isEl3aPool) bad(`[EL3A] 随机 NPC 池不是 el3a 仓储物流风味（${[...randFac].join('、')}）`)
  else ok(`[EL3A] 随机 NPC ×${(mm.npcDefs ?? []).length} 为专属 el3a 池（BNTG 灰绿制服 · 仓储物流职业）`)
  // 无 loot 铁律在 checkOutpost 已验；仓库箱子必须是 pallet/binshelf/debrispile 装饰件
  const looty = mm.structures.filter((s) => s.data?.loot === 1)
  if (looty.length) bad(`[EL3A] 出现 loot 结构：${looty.map((s) => s.kind).join('、')}`)
}

// 2b) 商人之家交易保险库：房内两侧卷帘门墙经完整管线（validateDoors/fixStructEmbedding）后存活——
// x=38 / x=42 各 14 扇 1 宽连续无框相连（真门 2 + 锁死 26），脚下全为地板（否则门体被墙盒吞没不可见）；
// 南区（南连廊 + 公共生活区）必须经南店铺与大厅连通——否则孤岛回填把整片填成墙、只剩家具脚下孤岛
{
  const def = levelDefOf(102)!
  const mm = generateLevel(def, 424242, true)
  const doors = mm.structures.filter((s) => s.kind === 'rollerdoor')
  const locked = doors.filter((s) => s.data?.locked === 1).length
  const onFloor = doors.every((s) => mm.tiles[Math.floor(s.y + s.h / 2) * mm.w + Math.floor(s.x + s.w / 2)] === 1)
  if (doors.length !== 28 || locked !== 26) bad(`[商人之家] 保险库卷帘门 ${doors.length}/28 扇（锁死 ${locked}/26）——被门校验吞了？`)
  else if (!onFloor) bad(`[商人之家] 卷帘门脚下不是地板——门体将被合并墙盒吞没`)
  else ok(`[商人之家] 保险库房内卷帘门墙 2×14 扇存活（真门 2 + 锁死 26，脚下全为地板可见）`)
  const OPENABLE2 = ['hoteldoor', 'rollerdoor', 'glassdoor']
  const solid2 = (x: number, y: number) => mm.structures.some((s) => s.solid && !OPENABLE2.includes(s.kind) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  const seen2 = new Uint8Array(mm.w * mm.h)
  const q2 = [mm.spawn.x + mm.spawn.y * mm.w]
  seen2[q2[0]] = 1
  while (q2.length) {
    const cur = q2.pop()!
    const cx = cur % mm.w, cy = Math.floor(cur / mm.w)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, ni = ny * mm.w + nx
      if (nx < 0 || ny < 0 || nx >= mm.w || ny >= mm.h || seen2[ni] || mm.tiles[ni] !== 1 || solid2(nx, ny)) continue
      seen2[ni] = 1; q2.push(ni)
    }
  }
  const southSpots: [string, number, number][] = [['南连廊', 40, 61], ['生活区民居内部', 19, 66]]
  const off = southSpots.filter(([, x, y]) => mm.tiles[y * mm.w + x] !== 1 || !seen2[y * mm.w + x])
  if (off.length) bad(`[商人之家] 南区未连通：${off.map(([n]) => n).join('、')}（被孤岛回填？南店铺需南北门贯通）`)
  else ok('[商人之家] 南连廊与公共生活区经南店铺与大厅连通')
  // 商业海报墙：大量多样（促销/杏仁水/美食/数码/服饰/BNTG 标语）——deco 落位不合格会静默跳过
  const posters = mm.structures.filter((s) => s.kind === 'megposter')
  const texs = new Set(posters.map((s) => String(s.data?.tex ?? '')))
  if (posters.length < 40 || texs.size < 5) bad(`[商人之家] 商业海报仅 ${posters.length} 张 / ${texs.size} 种（要求 ≥40 张 ≥5 种）`)
  else ok(`[商人之家] 商业海报墙 ${posters.length} 张 / ${texs.size} 种贴图`)
}

// 3) 定居点地标（天鹰段低概率 + data.outpost）+ 建模
{
  let parkingChunks = 0, landmarks = 0, badData = 0, tomLm = 0
  for (let cy = -30; cy <= 30; cy++)
    for (let cx = -30; cx <= 30; cx++) {
      if (l1VariantOf(7, cx, cy) !== 'parking') continue
      parkingChunks++
      const raw = genL1ChunkRaw(LEVELS[1], 7, cx, cy)
      const lm = raw.structures.filter((s) => s.kind === 'landmark')
      for (const s of lm) {
        if (s.data?.outpost === 'alpha') landmarks++
        else if (s.data?.outpost === 'tom') tomLm++
        else badData++
      }
    }
  const pct = ((landmarks / parkingChunks) * 100).toFixed(1)
  if (landmarks === 0) bad('抽样天鹰段 chunk 未出现定居点地标')
  else if (badData) bad(`地标 data.outpost 异常 ×${badData}`)
  else ok(`定居点地标：${parkingChunks} 个天鹰段 chunk 出 ${landmarks} 个（${pct}%），data.outpost='alpha'`)
  // v38：Tom 的餐馆地标——同为天鹰段但概率明显更低（0.015 vs 0.04，容差放宽）
  const tomPct = (tomLm / parkingChunks) * 100
  if (tomLm === 0) bad('抽样天鹰段 chunk 未出现 Tom 的餐馆地标')
  else if (!(tomPct > 0 && tomPct < 0.04 * 100 * 0.9)) bad(`Tom 地标概率异常：${tomPct.toFixed(2)}%（应明显低于 alpha 的 4%）`)
  else ok(`Tom 的餐馆地标：${tomLm} 个（${tomPct.toFixed(2)}%），data.outpost='tom'，明显低于 alpha（${pct}%）`)
  // BNTG 地标：跃金段小概率 + data.outpost='bntg'
  let storageChunks = 0, lm2 = 0, bad2 = 0
  for (let cy = -30; cy <= 30; cy++)
    for (let cx = -30; cx <= 30; cx++) {
      if (l1VariantOf(7, cx, cy) !== 'storage') continue
      storageChunks++
      const raw = genL1ChunkRaw(LEVELS[1], 7, cx, cy)
      const lm = raw.structures.filter((s) => s.kind === 'landmark')
      lm2 += lm.length
      for (const s of lm) if (s.data?.outpost !== 'bntg') bad2++
    }
  if (lm2 === 0) bad('抽样跃金段 chunk 未出现 BNTG 地标')
  else if (bad2) bad(`BNTG 地标 data.outpost 异常 ×${bad2}`)
  else ok(`BNTG 地标：${storageChunks} 个跃金段 chunk 出 ${lm2} 个，data.outpost='bntg'`)
  // 阿丽亚娜地标：哥特段小概率 + data.outpost='ariane'
  let gothicChunks = 0, lm3 = 0, bad3 = 0
  for (let cy = -30; cy <= 30; cy++)
    for (let cx = -30; cx <= 30; cx++) {
      if (l1VariantOf(7, cx, cy) !== 'gothic') continue
      gothicChunks++
      const raw = genL1ChunkRaw(LEVELS[1], 7, cx, cy)
      const lm = raw.structures.filter((s) => s.kind === 'landmark')
      lm3 += lm.length
      for (const s of lm) if (s.data?.outpost !== 'ariane') bad3++
    }
  if (lm3 === 0) bad('抽样哥特段 chunk 未出现阿丽亚娜地标')
  else if (bad3) bad(`阿丽亚娜地标 data.outpost 异常 ×${bad3}`)
  else ok(`阿丽亚娜地标：${gothicChunks} 个哥特段 chunk 出 ${lm3} 个，data.outpost='ariane'`)
  // v46：办公区EL3A 地标改为贴墙海报——L2 整洁的廊道（tidy 变体）小概率 + data.outpost='el3a' + data.poster=1
  let tidyChunks = 0, lm4 = 0, bad4 = 0
  for (let cy = -30; cy <= 30; cy++)
    for (let cx = -30; cx <= 30; cx++) {
      if (l2VariantOf(424242, cx, cy) !== 'tidy') continue
      tidyChunks++
      const raw = genL2ChunkRaw(LEVELS[2], 424242, cx, cy)
      const lm = raw.structures.filter((s) => s.kind === 'landmark')
      lm4 += lm.length
      for (const s of lm) if (s.data?.outpost !== 'el3a' || s.data?.poster !== 1 || s.data?.tex !== 'el3a_poster.png') bad4++
    }
  if (lm4 === 0) bad('抽样整洁的廊道 chunk 未出现 EL3A 海报地标')
  else if (bad4) bad(`EL3A 海报地标 data 异常 ×${bad4}（应 outpost=el3a + poster=1 + tex=el3a_poster.png）`)
  else ok(`EL3A 海报地标：${tidyChunks} 个整洁的廊道 chunk 出 ${lm4} 个，data.outpost='el3a' + poster=1（贴墙海报）`)
  // v54：L3 三据点定居点地标全部贴墙海报形——Gemma/存储设施 ~3% 独立判定，蓝色救赎 ~1% 显著更低
  {
    const { genL3ChunkRaw, l3VariantOf } = await import('../src/game/world/infiniteL3.ts')
    let l3chunks = 0
    const cnt: Record<string, number> = { gamma: 0, storage: 0, bluesalvation: 0 }
    let badG = 0, offFloor = 0
    for (const sd of [7, 424242, 20260804])
      for (let cy = -14; cy <= 14; cy++)
        for (let cx = -14; cx <= 14; cx++) {
          const v = l3VariantOf(sd, cx, cy)
          if (v !== 'lit' && v !== 'dark') continue // 只统计廊道 chunk（特征房间/圣所/出生 chunk 在生成器内跳过）
          l3chunks++
          const raw = genL3ChunkRaw(LEVELS[3], sd, cx, cy)
          for (const s of raw.structures.filter((s2) => s2.kind === 'landmark')) {
            const op = String(s.data?.outpost ?? '')
            if (!(op in cnt) || s.data?.poster !== 1 || !String(s.data?.tex ?? '').endsWith('_poster.png')) { badG++; continue }
            cnt[op]++
            const lx = s.x - cx * 32, ly = s.y - cy * 32 // 世界坐标 → chunk 局部（CS=32）
            if (lx < 0 || ly < 0 || lx >= 32 || ly >= 32 || raw.tiles[ly * 32 + lx] !== 1) { offFloor++; continue }
            // 贴墙校验：至少一侧为非地板（海报贴墙不浮空）
            const isF2 = (x2: number, y2: number) => x2 >= 0 && y2 >= 0 && x2 < 32 && y2 < 32 && raw.tiles[y2 * 32 + x2] === 1
            if (isF2(lx + 1, ly) && isF2(lx - 1, ly) && isF2(lx, ly + 1) && isF2(lx, ly - 1)) offFloor++
          }
        }
    const pctG = (cnt.gamma / l3chunks) * 100, pctS = (cnt.storage / l3chunks) * 100, pctB = (cnt.bluesalvation / l3chunks) * 100
    if (cnt.gamma === 0 || cnt.storage === 0 || cnt.bluesalvation === 0)
      bad(`L3 海报地标缺失（gamma ${cnt.gamma} · storage ${cnt.storage} · bluesalvation ${cnt.bluesalvation}）`)
    else if (badG || offFloor) bad(`L3 海报地标异常：data/poster/tex ×${badG} · 落点非地板或不贴墙 ×${offFloor}`)
    else if (!(pctB > 0 && pctB < pctG * 0.6 && pctB < pctS * 0.6)) bad(`蓝色救赎海报应显著更稀有：${pctB.toFixed(2)}%（gamma ${pctG.toFixed(2)}% · storage ${pctS.toFixed(2)}%）`)
    else ok(`L3 三据点海报地标：${l3chunks} 个廊道 chunk（3 种子）出 Gemma ${cnt.gamma}（${pctG.toFixed(2)}%）· 存储设施 ${cnt.storage}（${pctS.toFixed(2)}%）· 蓝色救赎 ${cnt.bluesalvation}（${pctB.toFixed(2)}%，显著更低），poster=1 贴墙`)
    // 圣所与出生 chunk 永不放地标
    const sanct = genL3ChunkRaw(LEVELS[3], 7, 8, 8, 'sanct')
    const home = genL3ChunkRaw(LEVELS[3], 7, 0, 0)
    if (sanct.structures.some((s) => s.kind === 'landmark') || home.structures.some((s) => s.kind === 'landmark'))
      bad('圣所/出生 chunk 出现 L3 据点地标（应跳过）')
    else ok('圣所与出生 chunk 无 L3 据点地标（跳过规则生效）')
  }
  const g = buildStructure({ kind: 'landmark', x: 0, y: 0, w: 1, h: 1, solid: false }, LEVELS[1], generateLevel(levelDefOf(101)!, 424242, true), 3.6)
  if (!g) bad('landmark 建模返回 null')
  else ok('landmark 建模可构建')
  // v46：海报形 landmark（EL3A）+ 壁挂斜照灯建模
  const g2 = buildStructure({ kind: 'landmark', x: 5, y: 5, w: 1, h: 1, solid: false, data: { poster: 1, tex: 'el3a_poster.png' } }, LEVELS[1], generateLevel(levelDefOf(101)!, 424242, true), 3.6)
  const g3 = buildStructure({ kind: 'walllamp', x: 5, y: 5, w: 1, h: 1, solid: false }, LEVELS[1], generateLevel(levelDefOf(101)!, 424242, true), 3.6)
  if (!g2 || !g3) bad('海报形 landmark / walllamp 建模返回 null')
  else ok('海报形 landmark 与 walllamp 建模可构建')
  // v49：斜扶手建模（h0/h1 随坡道倾斜；含 floor=1 负值下探段）+ 挑高顶高顶灯 hanglight
  const mm105 = generateLevel(levelDefOf(105)!, 424242, true)
  const g4 = buildStructure({ kind: 'handrail', x: 19, y: 37, w: 1, h: 1, solid: true, data: { deg: 90, h0: 1.2, h1: 0.6 } }, levelDefOf(105)!, mm105, 3.0)
  const g5 = buildStructure({ kind: 'handrail', x: 19, y: 39, w: 1, h: 1, solid: true, floor: 1, data: { deg: 90, h0: -0.6, h1: -1.2 } }, levelDefOf(105)!, mm105, 3.0)
  const g6 = buildStructure({ kind: 'hanglight', x: 30, y: 25, w: 1, h: 1, solid: false }, levelDefOf(105)!, mm105, 3.0)
  if (!g4 || !g5 || !g6) bad('斜扶手（h0/h1）/ 挑高顶 hanglight 建模返回 null')
  else ok('斜扶手（h0/h1 含负值下探段）与挑高顶 hanglight 建模可构建')
}

// 4) NPC 注册表合法性
{
  for (const n of Object.values(NPCS)) {
    if (!n.lines.length || !n.lines[0].opts.length) bad(`NPC ${n.id} 对话树为空`)
    for (const [i, node] of n.lines.entries())
      for (const o of node.opts)
        if (o.next !== undefined && (o.next < 0 || o.next >= n.lines.length)) bad(`NPC ${n.id} 节点 ${i} 的 next=${o.next} 越界`)
    if (!n.idle.length) bad(`NPC ${n.id} 无自言自语内容`)
    for (const t of n.trade ?? []) {
      if (!ITEMS[t.item]) bad(`NPC ${n.id} 交易物品不存在：${t.item}`)
      if (!(t.price > 0)) bad(`NPC ${n.id} 交易物品 ${t.item} 定价异常`)
    }
    for (const b of n.barter ?? []) {
      if (!ITEMS[b.give]) bad(`NPC ${n.id} 以物易物收方物品不存在：${b.give}`)
      if (!ITEMS[b.get]) bad(`NPC ${n.id} 以物易物付方物品不存在：${b.get}`)
      if (!(b.giveN > 0 && b.getN > 0)) bad(`NPC ${n.id} 以物易物数量异常：${b.give}×${b.giveN}→${b.get}×${b.getN}`)
      if (b.give2 !== undefined) { // v38：第二种食材（Tom 的餐馆复合菜谱）
        if (!ITEMS[b.give2]) bad(`NPC ${n.id} 以物易物第二收方物品不存在：${b.give2}`)
        if (!(b.give2N && b.give2N > 0)) bad(`NPC ${n.id} 以物易物第二数量异常：${b.give2}×${b.give2N}`)
      }
    }
  }
  ok(`NPC 注册表合法（${Object.keys(NPCS).length} 名；对话树/自言自语/交易均有效）`)
  void tileAt
}

// 4b) v39：BRC（后室装修公司）——团体注册 + 员工定义生成器合法性（覆盖 brc 动态注册表）
{
  const { FACTIONS } = await import('../src/game/content/factions.ts')
  const { brcWorkerDef, BRC_WORKER_NAMES, BRC_WORK_LOOPS, BRC_BADGE } = await import('../src/game/content/npcs.ts')
  const f = FACTIONS.brc
  if (!f) bad('FACTIONS 缺少 brc')
  else if (f.name !== '后室装修公司' || f.en !== 'Backrooms Remodeling Co.' || !f.hasRep || f.color !== '#4f4c7a') bad(`brc 团体字段异常：${JSON.stringify(f)}`)
  else ok(`brc 团体注册合法（${f.name} / ${f.en} / ${f.color} / hasRep）`)
  let badDef = 0, checked = 0
  for (let cy = -12; cy <= 12; cy++)
    for (let cx = -12; cx <= 12; cx++) {
      const a = brcWorkerDef(424242, cx, cy, 0), b = brcWorkerDef(424242, cx, cy, 1)
      for (const d of [a, b]) {
        checked++
        if (!BRC_WORKER_NAMES.includes(d.name)) badDef++ // 名称来自家用物品/果蔬池
        if (d.faction !== 'brc') badDef++
        if (!d.workLoop || !BRC_WORK_LOOPS.includes(d.workLoop)) badDef++ // 工作循环动作存在且合法
        if (d.trade || d.barter) badDef++ // 不能交易
        if (d.idle.length !== 0) badDef++ // 沉默：无自言自语
        if (!d.lines.length || d.lines[0].opts.length !== 0) badDef++ // 沉默：不回应任何问题
        if (!Object.values(BRC_BADGE).some((t) => t.color === d.uniform?.badge)) badDef++ // 级别徽章色合法
        if (JSON.stringify(d) !== JSON.stringify(brcWorkerDef(424242, cx, cy, d.id.endsWith('_0') ? 0 : 1))) badDef++ // 确定性
      }
      if (a.name === b.name) badDef++ // 同 chunk 两名员工不重名
    }
  if (badDef) bad(`BRC 员工定义异常 ×${badDef}`)
  else ok(`BRC 员工定义合法（${checked} 个样本：家用物品名称不重名/faction=brc/workLoop/铜银金徽章/无交易/沉默/确定性）`)
}

// 4c) v45：杰瑞的信众——团体注册 + 信众生成器/侍立信众合法性
{
  const { jerryFollowerDef, JERRY_PREACH_LINES, JERRY_CHANT_LINES } = await import('../src/game/content/npcs.ts')
  const { FACTIONS } = await import('../src/game/content/factions.ts')
  const f = FACTIONS.jerry
  if (!f) bad('FACTIONS 缺少 jerry')
  else if (f.name !== '杰瑞的信众' || f.en !== 'The Followers Of Jerry' || !f.hasRep || f.color !== '#4142a5' || f.sub !== '#0071c9' || f.logo !== 'faction_jerry.png')
    bad(`jerry 团体字段异常：${JSON.stringify(f)}`)
  else ok(`jerry 团体注册合法（${f.name} / ${f.en} / ${f.color} / sub ${f.sub} / ${f.logo} / hasRep）`)
  let badDef = 0, checked = 0
  const names = new Set<string>()
  for (let i = 0; i < 40; i++) {
    const args = [424242, i % 7, ((i / 7) | 0) - 3, i % 2, i % 3]
    const d = jerryFollowerDef(...args)
    checked++
    names.add(d.name)
    if (d.faction !== 'jerry') badDef++
    if (d.uniform?.top !== '#4142a5' || d.uniform?.badge !== '#0071c9') badDef++ // jerry 主题色制服
    if (!d.name || !d.lines.length || !d.idle.length) badDef++
    if (d.trade || d.barter) badDef++ // 信众不交易
    if (JSON.stringify(d) !== JSON.stringify(jerryFollowerDef(...args))) badDef++ // 确定性
  }
  if (badDef) bad(`信众定义异常 ×${badDef}`)
  else ok(`信众定义合法（${checked} 个样本 / ${names.size} 个音译名：faction=jerry · 主题色制服 · 确定性）`)
  if (JERRY_PREACH_LINES.length < 6 || JERRY_CHANT_LINES.length < 4) bad('传教/诵咏词池过小')
  else ok(`传教词池 ×${JERRY_PREACH_LINES.length} · 诵咏词池 ×${JERRY_CHANT_LINES.length}`)
  for (const id of ['zeph', 'polly', 'bluebird', 'sinclair']) {
    const n = NPCS[id]
    if (!n || n.faction !== 'jerry' || !n.lines.length || !n.idle.length) bad(`信众固定 NPC ${id} 缺失或字段异常`)
    // v47：jerry 系 NPC 对话树/自言自语不得含「（……）」式舞台指示（风味正文）
    else if (n.lines.some((l) => /（[^）]*）/.test(l.npc) || l.opts.some((o) => /（[^）]*）/.test(o.text))) || n.idle.some((s) => /（[^）]*）/.test(s)))
      bad(`信众固定 NPC ${id} 对话/自言自语含括号舞台指示`)
  }
  ok('信众固定 NPC zeph/polly/bluebird/sinclair 注册合法（faction=jerry · 无括号舞台指示）')
  // v47：jerry 系固定 NPC 整体位于注册表末尾（图鉴「人士」页按注册表序显示，信众排最后）
  {
    const keys = Object.keys(NPCS)
    const jIdx = ['zeph', 'polly', 'bluebird', 'sinclair'].map((id) => keys.indexOf(id))
    const nonJerryAfter = keys.slice(Math.min(...jIdx)).filter((k) => NPCS[k].faction !== 'jerry')
    if (jIdx.some((i) => i < 0) || nonJerryAfter.length) bad(`信众固定 NPC 未整体位于注册表末尾（其后仍有非信众：${nonJerryAfter.join('、') || '无'}）`)
    else ok(`信众固定 NPC 整体位于注册表末尾（${keys.length} 名注册 NPC 中排最后 4 位）`)
  }
  // v48：杰瑞对话规则——特殊选项追加式（正常对话树选项在前，特殊选项一律追加其后，不得覆盖）；
  // 「认同」仅野外信众可选（L274 内不显示——引擎层 agreeJerry 同步拦截，见 engine-smoke）
  {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../src/components/DialogOverlay.tsx', import.meta.url), 'utf8')
    const jb = src.slice(src.indexOf("fac?.id === 'jerry'"), src.indexOf(') : isRand'))
    if (!jb.includes('cur.opts.map')) bad('jerry 对话分支未渲染正常对话树选项（特殊选项应为追加式，不得覆盖）')
    else if (jb.indexOf('cur.opts.map') > jb.indexOf('agreeJerry')) bad('jerry 特殊选项排在正常对话树选项之前（应为追加式：树选项在前）')
    else if (!jb.includes('level !== 274')) bad('jerry 认同选项缺「仅野外」门槛（应 level !== 274 才显示）')
    else ok('jerry 对话：正常树选项在前 + 特殊选项追加其后 · 认同仅野外（level !== 274 门槛）')
  }
  // v55：NPC 名称规范——名称不得含职位词（代号「」可保留）；真名统一「名·姓」（含 ·）或纯拉丁名/代号
  {
    const ROLE_WORDS = ['监督者', '主管', '档案员', '技师', '仓管', '医护', '守卫', '经理', '雇员', '住户', '军需官', '后勤官',
      '研究员', '医师', '医生', '护士长', '技术员', '队长', '兑换员', '分拣员', '搬运工', '主任', '会计', '盘点员', '厨师', '店主',
      '前台', '跑堂', '接待', '服务员', '维修工', '补给员', '哨所长', '飞行员', '名媛', '实业家', '船长', '总督', '作家', '领袖',
      '大使', '鉴定师', '摊主', '警备', '护士', '护工', '博士', '司事', '静修者', '狂热者', '向导', '哨兵', '总督']
    const badNames: string[] = []
    for (const [id, d] of Object.entries(NPCS)) {
      if (d.faction === 'jerry') continue // jerry 系特殊名（修士/神父等宗教称谓）豁免
      const nm = d.name
      if (ROLE_WORDS.some((w) => nm.includes(w))) { badNames.push(`${id}(${nm} 含职位词)`); continue }
      const isCode = nm.includes('「') || /^[A-Za-z][A-Za-z ]*$/.test(nm) // 代号或纯拉丁名
      const isCjkFull = /^[\u4e00-\u9fff]{2,4}$/.test(nm) // 纯中文姓名（佐藤爱子式姓名齐全）
      if (!isCode && !isCjkFull && !nm.includes('·')) badNames.push(`${id}(${nm} 真名缺「·」)`)
    }
    if (badNames.length) bad(`NPC 名称规范违例：${badNames.join('、')}`)
    else ok('NPC 名称规范：全部固定 NPC 无职位词、真名均为「名·姓」（jerry 系特殊名豁免）')
  }
}

console.log(fail === 0 ? '\n✓ 据点与 NPC 校验全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
