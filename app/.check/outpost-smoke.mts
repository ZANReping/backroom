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
const { generateLevel, tileAt, bfs3D } = await import('../src/game/mapgen.ts')
const { CONTAINER_KINDS } = await import('../src/game/containers.ts')
const { NPCS } = await import('../src/game/npcs.ts')
const { ITEMS } = await import('../src/game/items.ts')
const { buildStructure } = await import('../src/game/renderer/structures.ts')
const { genL1ChunkRaw, l1VariantOf } = await import('../src/game/infiniteL1.ts')
const { genL2ChunkRaw, l2VariantOf } = await import('../src/game/infiniteL2.ts')

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
  const sx = m1.spawn.x, sy = m1.spawn.y
  if (m1.tiles[sy * m1.w + sx] !== 1) { bad(`[${def.name}] 出生点不是地板`); return }
  const OPENABLE = ['hoteldoor', 'rollerdoor', 'glassdoor']
  if ((m1.floors ?? 1) > 1) {
    // v43：多层据点——跨层连通 BFS（bfs3D：主层地板 + 楼梯坡道 + up 层楼板全连通）
    const reach = bfs3D(m1)
    const solidF = (x: number, y: number, f: number) =>
      m1.structures.some((s) => s.solid && !OPENABLE.includes(s.kind) && (s.floor ?? 0) === f && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    let unreach = 0, total = 0
    for (let i = 0; i < m1.tiles.length; i++) {
      const tx = i % m1.w, ty = Math.floor(i / m1.w)
      if (m1.tiles[i] === 1 && !solidF(tx, ty, 0)) { total++; if (!reach[i * 2]) unreach++ }
      if (m1.up[i] === 1 && m1.upWall[i] !== 1 && !solidF(tx, ty, 1)) { total++; if (!reach[i * 2 + 1]) unreach++ }
    }
    if (unreach > 0) bad(`[${def.name}] 有 ${unreach}/${total} 可走格（双层）不可达`)
    else ok(`[${def.name}] 双层全连通（${total} 可走格经楼梯全部可达）`)
    for (const e of m1.exits) if (!reach[(e.y * m1.w + e.x) * 2]) bad(`[${def.name}] 出口「${e.def.name}」不可达`)
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
  // 区域标注存在
  if (!m1.zones?.length) bad(`[${def.name}] 无区域名称标注`)
  else ok(`[${def.name}] 区域标注 ×${m1.zones.length}`)
}
checkOutpost(101, ['kat', 'justin', 'nightingale', 'river', 'faust', 'suanpan'])
checkOutpost(102, ['lan', 'laozhangfang', 'shen', 'tang', 'kui'])
checkOutpost(103, ['lecomte', 'muller', 'dupont', 'morel', 'martin', 'lefevre'])
checkOutpost(104, ['tom', 'aiko'])
checkOutpost(105, ['mccauley', 'vesper', 'pidge', 'boone', 'whitfield', 'kowalski'])

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
  const { OUTPOSTS: OPS } = await import('../src/game/outposts.ts')
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
  const { canOccupy, PLAYER_RADIUS } = await import('../src/game/player.ts')
  const { groundHeightAt, bandOfZ, ceilingHeightAt, structColliders } = await import('../src/game/mapgen.ts')
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
    const { wallBaseTopAt, ceilingSteps } = await import('../src/game/mapgen.ts')
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
  const { FACTIONS } = await import('../src/game/factions.ts')
  const { brcWorkerDef, BRC_WORKER_NAMES, BRC_WORK_LOOPS, BRC_BADGE } = await import('../src/game/npcs.ts')
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
  const { jerryFollowerDef, JERRY_PREACH_LINES, JERRY_CHANT_LINES } = await import('../src/game/npcs.ts')
  const { FACTIONS } = await import('../src/game/factions.ts')
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
}

console.log(fail === 0 ? '\n✓ 据点与 NPC 校验全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
