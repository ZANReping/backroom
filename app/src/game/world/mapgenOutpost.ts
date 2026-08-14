// 据点生成器（gen='outpost'）：完全手工设计的有限小层级——一切结构/灯光/出口/NPC 落位
// 都是设计好的，无随机物品与容器（需求：据点不会凭空出现物品）。
// 当前实现：M.E.G. Alpha 基地（布局参照 wikidot Base Alpha 构成图：
// 探险署/行政署/档案署/研究署 + 五个居民区 + 北/东/西三个入口；小随机性=民居开间与家具抖动）。
// 布局铁律：每个房间至少有一扇门接到走廊网，否则 BFS 连通回填会把房间内部填成墙。
// v35：K=1.25 放大区块（设计坐标 → 地图坐标，def.size 64→80）；民居暖木 tint=8；
// 明亮办公风（Plaster/Tiles/OfficeCeiling 贴图）+ 机柜/转椅/货架/双层床/投影幕精致家具。
import type { GameMap } from './mapgen'
import { FLOOR_H, stampStairRun } from './mapgen'
import type { LevelDef, StructKind, Structure, LightSource } from '../core/types'
import type { RNG } from '../core/rng'
import { genRandomNpcs, jerryFollowerDef } from '../content/npcs'
import { makeEntity } from '../entities'

const K = 1.25 // 区块放大系数（设计坐标 → 地图坐标）

export function genOutpost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  if (def.id === 102) return genBntgOutpost(m, rng, def)
  if (def.id === 103) return genArianeOutpost(m, rng, def)
  if (def.id === 104) return genTomOutpost(m, rng, def)
  if (def.id === 105) return genEl3aOutpost(m, rng, def)
  if (def.id === 274) return genJerryRoom(m, rng, def) // v45：Level 274「杰瑞的房间」
  if (def.id === 106) return genGammaOutpost(m, rng, def) // v54：Gemma 基地（真三层单图）
  if (def.id === 107) return genStorageOutpost(m, rng, def) // v54：B.N.T.G. 存储设施（L3）
  if (def.id === 108) return genBlueSalvation(m, rng, def) // v54：蓝色救赎（信众圣所，L3）
  if (def.id === 109) return genOmegaOutpost(m, rng, def) // v54：M.E.G. Omega 基地（L4）
  if (def.id === 110) return genHousekeepingPost(m, rng, def) // v55：M.E.G. 哨所「家政服务」（L5）
  if (def.id === 111) return genHomelyHotel(m, rng, def) // v55：家常酒店（L5）
  if (def.id === 112) return genOriginalsParlor(m, rng, def) // v55：原住民（L5）
  return genAlphaOutpost(m, rng, def)
}

// ============ v54：设计模式重制补丁（玩家设计 JSON → 生成器落地，DESIGN-GUIDE §2）============
// 玩家在设计模式编辑据点后导出的布局，经 .check/gen-patches.mts 生成数据表、由各 gen 函数
// 末尾调用本函数应用——与手写布局同为生成器的确定性代码；零差异校验见 .check/diff-verify.mts。
interface DesignPatch {
  tiles?: [number, number, number][] // (x, y, v)：v=2 墙 / 1 地板
  structDel?: string[] // 结构删除键 'kind@x,y,wxh'
  structAdd?: { kind: StructKind; x: number; y: number; w: number; h: number; solid: boolean; floor?: 0 | 1 | 2; deg?: number; data?: Structure['data'] }[] // deg 落地为 data.deg；其余 data 原样透传
  npcPos?: Record<string, [number, number, number]> // 固定 NPC id → (x, y, floor) 精确落位（绕过落位抖动）
  randSlots?: [number, number, number][] // 随机居民槽全量（按 npcDefs 顺序；多于已生成数=按 flavor 池增补）
  lightDel?: string[] // 灯删除键 'x,y,r,color'
  lightAdd?: { x: number; y: number; r: number; color: string }[]
  exitPos?: [number, number][] // 出口落位（按 def.exits 顺序）
  zones?: GameMap['zones'] // 区域名标注整体替换
}
function applyDesignPatch(m: GameMap, rng: RNG, flavor: 'meg' | 'bntg' | 'ariane' | 'mixed' | 'el3a', p: DesignPatch) {
  for (const [x, y, v] of p.tiles ?? []) m.tiles[y * m.w + x] = v as 0 | 1 | 2
  if (p.structDel?.length) {
    const del = new Set(p.structDel)
    m.structures = m.structures.filter((s) => !del.has(`${s.kind}@${s.x},${s.y},${s.w}x${s.h}`))
  }
  for (const s of p.structAdd ?? []) {
    const data = s.deg !== undefined ? { ...s.data, deg: s.deg } : s.data
    m.structures.push({ kind: s.kind, x: s.x, y: s.y, w: s.w, h: s.h, solid: s.solid, ...(s.floor !== undefined ? { floor: s.floor } : {}), ...(data ? { data } : {}) })
  }
  for (const [id, [x, y, fl]] of Object.entries(p.npcPos ?? {})) {
    const n = (m.npcs ?? []).find((q) => q.id === id)
    if (n) { n.x = x; n.y = y; n.floor = fl as 0 | 1 | 2 }
  }
  if (p.randSlots) {
    const randIds = new Set((m.npcDefs ?? []).map((d2) => d2.id))
    const slots = (m.npcs ??= []).filter((n) => randIds.has(n.id))
    // 设计槽位多于生成数：按 flavor 池增补定义（id 续号防撞）再落位
    if (p.randSlots.length > slots.length) {
      const base = slots.length // 续号基数（循环内 slots 会增长，先固定）
      const extra = genRandomNpcs(() => rng.next(), p.randSlots.length - slots.length, flavor)
      extra.forEach((d2, i) => {
        d2.id = `rand_${base + i}`
        ;(m.npcDefs ??= []).push(d2)
        const n = { id: d2.id, x: 0, y: 0 }
        m.npcs!.push(n)
        slots.push(n)
      })
    }
    slots.forEach((n, i) => {
      const t = p.randSlots![i]
      if (t) { n.x = t[0]; n.y = t[1]; n.floor = t[2] as 0 | 1 | 2 }
    })
  }
  if (p.lightDel?.length) {
    const del = new Set(p.lightDel)
    m.lights = m.lights.filter((l) => !del.has(`${Math.round(l.x * 100) / 100},${Math.round(l.y * 100) / 100},${l.r},${l.color}`))
  }
  for (const l of p.lightAdd ?? []) m.lights.push({ x: l.x, y: l.y, r: l.r, color: l.color, flickerSeed: rng.next() * 100 })
  p.exitPos?.forEach(([x, y], i) => { if (m.exits[i]) { m.exits[i].x = x; m.exits[i].y = y } })
  if (p.zones) m.zones = p.zones.map((z) => ({ ...z }))
}

function genAlphaOutpost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const X = (v: number) => Math.round(v * K)
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0); y <= X(y1); y++) for (let x = X(x0); x <= X(x1); x++) floor(x, y)
  }
  // 矩形房间：四周砌墙 + 内腔雕空；doors=墙上要开成地板的门洞瓦片（必须至少一扇通向走廊/已连通房间）
  // 门洞外再向外凿 ≤2 格门廊（坐标经 K 放大后相邻房间墙之间可能出现 1~2 格缝隙，门廊把它们接起来）
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], tint = 0) => {
    const [ax, ay, bx, by] = [X(x0), X(y0), X(x1), X(y1)]
    for (let x = ax; x <= bx; x++) { wall(x, ay); wall(x, by) }
    for (let y = ay; y <= by; y++) { wall(ax, y); wall(bx, y) }
    for (let y = ay + 1; y <= by - 1; y++) for (let x = ax + 1; x <= bx - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      const dx = X(odx), dy = X(ody)
      floor(dx, dy)
      const sx = dx === ax ? -1 : dx === bx ? 1 : 0
      const sy = dy === ay ? -1 : dy === by ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = dx + i * sx, ty = dy + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
    if (tint) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) m.tint[idx(x, y)] = tint
  }
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: X(x), y: X(y), w, h, solid, data })
  // 墙面装饰落点校验：必须在地板 + 有真墙相邻（防悬浮）；相对两侧均为墙的是门洞（装饰不堵门口）
  const deco = (kind: 'noticeboard' | 'megposter' | 'photo', x: number, y: number) => {
    const tx = X(x), ty = X(y)
    if (m.tiles[idx(tx, ty)] !== 1) return
    const w = (dx: number, dy: number) => m.tiles[idx(tx + dx, ty + dy)] === 2
    if (!w(1, 0) && !w(-1, 0) && !w(0, 1) && !w(0, -1)) return
    if ((w(1, 0) && w(-1, 0)) || (w(0, 1) && w(0, -1))) return
    S(kind, x, y, 1, 1, false)
  }
  const L = (x: number, y: number, r = 5, color = def.palette.light) =>
    m.lights.push({ x: X(x) + 0.5, y: X(y) + 0.5, r, color, flickerSeed: rng.next() * 100 })
  const NPC = (id: string, x: number, y: number) =>
    (m.npcs ??= []).push({ id, x: X(x) + rng.int(-1, 1) * 0.2, y: X(y) + rng.int(-1, 1) * 0.2 })
  // v54：墙体窗（整格内隔墙换窗，两房间互相可见；代墙模式=瓦片雕成地板 + 实心结构补位；严禁外壳墙）
  const WIN = (mx: number, my: number, deg: number, topH: number) => {
    m.tiles[my * m.w + mx] = 1 // 雕成地板（渲染层该格不再立墙盒）
    m.structures.push({ kind: 'wallwindow', x: mx, y: my, w: 1, h: 1, solid: true, data: { deg, topH } })
  }

  // ============ 走廊网（小径：基地在走廊之间扩建；每个房间的门都落到这些走廊上） ============
  carve(20, 1, 22, 50) // C1 主纵廊（北入口 → 南端；北门廊含在廊内）
  carve(4, 15, 56, 16) // C2 主横廊（西 → 东）
  carve(4, 31, 56, 32) // C3 南横廊
  carve(41, 4, 42, 32) // C4 东纵廊（行政署东 → C3）
  carve(4, 39, 38, 40) // C5 南连廊（先驱区南 → 西风区）
  carve(49, 23, 57, 24) // 东门廊引道（C4 东 → 东入口）
  carve(49, 25, 49, 32) // 东门廊纵段（引道 → C3）
  carve(1, 36, 7, 37) // 西门廊引道（西入口 → 先驱区）
  // 三个入口（出口实例；玩家从北部入口进入）
  m.exits.push({ def: def.exits[0], x: X(22), y: X(1), discovered: true })
  m.exits.push({ def: def.exits[1], x: X(57), y: X(23), discovered: false })
  m.exits.push({ def: def.exits[2], x: X(1), y: X(36), discovered: false })
  m.spawn = { x: X(21), y: X(4) }

  // ============ 探险署（西大块：救援/训练/勘探） ============
  room(4, 5, 13, 14, [[13, 10]]) // 中控室（无线电）——门东接会议室
  S('serverrack', 6, 6); S('serverrack', 8, 6); S('serverrack', 10, 6) // 机柜墙
  S('desk', 7, 10, 3, 1); S('officechair', 7, 11, 1, 1, false); S('officechair', 9, 11, 1, 1, false)
  S('gauge', 12, 6)
  L(9, 10, 5.5); NPC('nightingale', 9, 10)
  room(14, 5, 19, 14, [[14, 10], [19, 10]]) // 会议室——门西接中控室、门东接 C1
  S('screenboard', 16, 6, 1, 1, false) // 投影幕+黑板（门侧墙）
  S('table', 16, 9, 3, 1); S('officechair', 15, 10, 1, 1, false); S('officechair', 17, 10, 1, 1, false); S('officechair', 16, 8, 1, 1, false)
  L(17, 9, 5.5)
  room(4, 17, 13, 23, [[10, 17]]) // 贮存室——门北接 C2
  S('binshelf', 5, 18, 2, 1); S('binshelf', 8, 18, 2, 1); S('binshelf', 11, 18, 2, 1) // 货架与收纳箱
  S('desk', 11, 21)
  L(8, 20, 5.5)
  room(14, 17, 19, 23, [[17, 17], [19, 20]]) // 生活区——门北接 C2、门东接 C1
  S('bunkbed', 15, 18, 1, 2); S('bunkbed', 18, 18, 1, 2)
  S('table', 16, 21, 2, 1); S('officechair', 17, 22, 1, 1, false)
  S('walltv', 18, 21, 1, 1, false) // v54：挂式平板电视（居民区东墙面——v54e 审计：须贴终图墙且让开东门线，X 缩放下原北墙位浮空）
  L(17, 20, 5.5)
  room(4, 24, 19, 30, [[12, 30], [19, 27]]) // 训练厅——门南接 C3、门东接 C1
  S('screenboard', 8, 25, 1, 1, false)
  S('table', 8, 27, 2, 1); S('officechair', 9, 28, 1, 1, false); S('desk', 16, 27)
  S('pillar', 6, 26); S('pillar', 18, 26)
  L(12, 27, 5.5)

  // ============ 行政署（北中：监督/调配/贸易） ============
  room(23, 4, 34, 9, [[23, 7]]) // 大会厅——门西接 C1
  S('screenboard', 29, 5, 1, 1, false)
  S('table', 27, 6, 4, 1); S('officechair', 26, 7, 1, 1, false); S('officechair', 29, 7, 1, 1, false)
  S('pillar', 25, 5); S('pillar', 33, 5)
  L(29, 6, 6); NPC('justin', 30, 7)
  room(23, 10, 29, 14, [[23, 12]]) // 行政部门——门西接 C1
  S('desk', 25, 11); S('desk', 27, 11); S('officechair', 26, 12, 1, 1, false); S('table', 25, 13)
  L(27, 12)
  WIN(29, 16, 0, 2.99) // v54：行政部门西墙墙体窗（与 C1 主纵廊互视；面 ±x）
  room(30, 10, 36, 14, [[32, 14]]) // 贸易路线中转站——门南接 C2
  S('table', 31, 11, 2, 1); S('desk', 34, 12); S('binshelf', 32, 13, 2, 1)
  L(32, 11, 5.5); NPC('suanpan', 32, 12)
  room(35, 4, 40, 9, [[40, 6]]) // 监督者驻办——门东接 C4
  S('desk', 37, 6); S('officechair', 37, 7, 1, 1, false); S('libshelf', 36, 5); S('table', 38, 8)
  L(37, 7); NPC('kat', 38, 6)

  // ============ 档案署（中央：归档/技术支援/纸质档案馆） ============
  room(23, 17, 26, 21, [[23, 19]]) // 档案员办公室——门西接 C1
  S('desk', 24, 18); S('copier', 25, 18); S('libshelf', 24, 20)
  L(24, 19); NPC('river', 25, 19)
  room(23, 22, 26, 26, [[23, 24]]) // 技术支援部门——门西接 C1
  S('serverrack', 24, 23); S('serverrack', 25, 23); S('gauge', 24, 25); S('boiler', 25, 25)
  L(24, 24)
  room(23, 27, 26, 30, [[23, 29]]) // 纸质档案馆——门西接 C1（开门即见文档）
  S('libshelf', 24, 28); S('libshelf', 25, 28); S('megdoc', 24, 29, 1, 1, false, { doc: 'meg_levels' })
  L(24, 28)

  // ============ 研究署（中：实验室/办公室/贮藏间） ============
  room(27, 17, 34, 23, [[30, 17], [30, 23]]) // 实验室与检测室——门北接 C2、门南接贮藏间
  S('table', 28, 19, 2, 1); S('gauge', 32, 18); S('boiler', 28, 22); S('pipes', 33, 22, 1, 1, false)
  L(30, 20, 5.5); NPC('faust', 30, 20)
  room(35, 17, 40, 23, [[37, 17], [40, 20]]) // 办公室——门北接 C2、门东接 C4
  S('desk', 36, 18); S('officechair', 36, 19, 1, 1, false); S('copier', 38, 18); S('desk', 37, 21)
  L(37, 20)
  room(27, 24, 40, 26, [[30, 24]]) // 贮藏间（长条）——门北接实验室
  S('binshelf', 28, 25, 2, 1); S('binshelf', 31, 25, 2, 1); S('binshelf', 34, 25, 2, 1)
  L(33, 25)

  // ============ 居民区（五个分区，暖木 tint=8；小随机性：民居开间与家具抖动） ============
  const house = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], lite: boolean) => {
    room(x0, y0, x1, y1, doors, 8) // 民居：暖木墙壁/地板
    if (lite) { S('bunkbed', x0 + 1, y0 + 1, 1, 2); S('table', x0 + 2, y1 - 2); L(x0 + 2, y0 + 2, 3.5, '#ffd8a0') }
    else { S('desk', x0 + 1, y0 + 1); L(x0 + 2, y0 + 2, 3, '#ffd8a0') }
  }
  // 爱念陌异区（东北，C4 两侧）
  house(36, 4, 40, 8, [[40, 6]], rng.chance(0.7))
  house(43, 4, 48, 9, [[43, 6]], rng.chance(0.7))
  house(36, 10, 40, 14, [[38, 14]], rng.chance(0.6))
  // 莱沃区（东，C4/东门廊东侧）
  house(43, 17, 48, 21, [[45, 17]], rng.chance(0.7))
  house(50, 17, 54, 21, [[52, 17]], rng.chance(0.6))
  house(43, 24, 48, 28, [[43, 26]], rng.chance(0.7))
  house(50, 24, 54, 30, [[50, 26]], rng.chance(0.6))
  // 腥红区（C3 南）
  house(26, 33, 31, 36, [[28, 33]], rng.chance(0.7))
  house(34, 33, 40, 36, [[36, 33]], rng.chance(0.7))
  // 先驱区（西南，C3 南 + 西门廊）
  house(8, 33, 13, 38, [[10, 33], [8, 36]], rng.chance(0.7))
  house(15, 33, 20, 38, [[17, 33]], rng.chance(0.6))
  house(8, 41, 15, 45, [[11, 41]], rng.chance(0.7))
  // 西风区（南，仍在走廊间扩建）
  house(26, 41, 31, 45, [[28, 41], [29, 45]], rng.chance(0.7))
  house(33, 41, 38, 45, [[35, 41]], rng.chance(0.6))
  house(26, 46, 33, 50, [[29, 46]], rng.chance(0.6))

  // 走廊照明（紧凑、整齐的 4 格网格排列，暖白光常亮——据点各处充分照明）
  for (let y = 2; y < m.h - 1; y += 4)
    for (let x = 2; x < m.w - 1; x += 4)
      if (m.tiles[idx(x, y)] === 1)
        m.lights.push({ x: x + 0.5, y: y + 0.5, r: 5, color: def.palette.light, flickerSeed: rng.next() * 100 })

  // ============ 墙面装饰（公告栏/标语海报/相片，全部落在墙邻接瓦片上）与天花通风口 ============
  deco('megposter', 30, 5) // 大会厅北墙
  deco('photo', 33, 5) // 大会厅北墙
  deco('noticeboard', 5, 8) // 中控室西墙
  deco('noticeboard', 25, 20) // 档案员办公室南墙
  // v54e 审计删除：deco('megposter', 5, 27)——设计重制补丁拆掉了训练厅西墙，海报浮空且附近无 X 可达贴墙位
  deco('photo', 15, 21) // 生活区西墙
  deco('megposter', 20, 12) // C1 主纵廊西墙（北段）
  deco('megposter', 20, 27) // C1 主纵廊西墙（中段）
  deco('noticeboard', 20, 42) // C1 主纵廊西墙（南段）
  deco('megposter', 12, 15) // C2 主横廊北墙（西段）
  deco('noticeboard', 28, 15) // C2 主横廊北墙（中段）
  deco('megposter', 44, 15) // C2 主横廊北墙（东段）
  deco('photo', 12, 32) // C3 南横廊南墙（西段）
  deco('megposter', 36, 32) // C3 南横廊南墙（东段）
  deco('megposter', 42, 26) // C4 东纵廊东墙（莱沃区侧）
  // 天花板通风口格栅（仅风口，主走廊每隔 ~10 格）
  S('ventgrate', 21, 8, 1, 1, false); S('ventgrate', 21, 24, 1, 1, false); S('ventgrate', 21, 40, 1, 1, false)
  S('ventgrate', 10, 15, 1, 1, false); S('ventgrate', 28, 15, 1, 1, false); S('ventgrate', 46, 15, 1, 1, false)
  S('ventgrate', 24, 32, 1, 1, false); S('ventgrate', 44, 32, 1, 1, false)

  // ============ 随机 NPC（空旷无固定 NPC 区域的普通居民：名称/设定随机且不重叠，确定性随种子） ============
  {
    const defs = genRandomNpcs(() => rng.next(), 4)
    m.npcDefs = defs
    const spots: [number, number][] = [
      [46, 26], // 莱沃区（民居内）
      [28, 34], // 腥红区（民居内）
      [11, 35], // 先驱区（民居内）
      [28, 43], // 西风区（民居内）
      [45, 8], // 爱念陌异区（民居内）
      [22, 45], // C1 主纵廊南段
    ]
    const shuffled = [...spots].sort(() => rng.next() - 0.5)
    defs.forEach((d, i) => {
      const [sx, sy] = shuffled[i % shuffled.length]
      ;(m.npcs ??= []).push({ id: d.id, x: X(sx) + 0.5, y: X(sy) + 0.5 })
    })
  }

  // 区域名称标注（大地图用）
  m.zones = [
    { name: '北部入口', x: X(21), y: X(2) },
    { name: '探险署', x: X(11), y: X(18) },
    { name: '行政署', x: X(29), y: X(7) },
    { name: '监督者驻办', x: X(37), y: X(6) },
    { name: '档案署', x: X(24), y: X(23) },
    { name: '研究署', x: X(33), y: X(21) },
    { name: '爱念陌异区', x: X(45), y: X(7) },
    { name: '莱沃区', x: X(48), y: X(26) },
    { name: '东部入口', x: X(55), y: X(23) },
    { name: '腥红区', x: X(33), y: X(34) },
    { name: '先驱区', x: X(13), y: X(37) },
    { name: '西部入口', x: X(2), y: X(36) },
    { name: '西风区', x: X(31), y: X(44) },
  ]
  // ============ v54：设计模式重制（玩家导出 2026-08-10T13:53:28.172Z；零差异校验 .check/diff-verify.mts）============
  applyDesignPatch(m, rng, 'meg', {
    // tiles 开合（294 格；2=墙 1=地板）
    tiles: [[30,2,1],[31,2,1],[32,2,1],[33,2,1],[34,2,1],[35,2,1],[36,2,1],[37,2,1],[38,2,1],[39,2,1],[40,2,1],[41,2,1],[42,2,1],[30,3,1],[31,3,1],[32,3,1],[33,3,1],[34,3,1],[35,3,1],[36,3,1],[37,3,1],[38,3,1],[39,3,1],[40,3,1],[41,3,1],[42,3,1],[46,3,1],[47,3,1],[48,3,1],[49,3,1],[30,4,1],[31,4,1],[32,4,1],[33,4,1],[34,4,1],[35,4,1],[36,4,1],[37,4,1],[38,4,1],[39,4,1],[40,4,1],[41,4,1],[42,4,1],[46,4,1],[47,4,1],[48,4,1],[49,4,1],[30,5,1],[31,5,1],[32,5,1],[33,5,1],[34,5,1],[35,5,1],[36,5,1],[37,5,1],[38,5,1],[39,5,1],[40,5,1],[41,5,1],[42,5,1],[46,5,1],[47,5,1],[48,5,1],[49,5,1],[2,7,1],[3,7,1],[4,7,1],[5,7,1],[43,7,1],[44,7,1],[45,7,1],[50,7,1],[2,8,1],[3,8,1],[4,8,1],[5,8,1],[43,8,1],[44,8,1],[45,8,1],[2,9,1],[3,9,1],[4,9,1],[5,9,1],[2,10,1],[3,10,1],[4,10,1],[5,10,1],[2,11,1],[3,11,1],[4,11,1],[5,11,1],[41,11,1],[2,12,1],[3,12,1],[4,12,1],[5,12,1],[16,12,1],[17,12,1],[18,12,1],[41,12,1],[2,13,1],[3,13,1],[4,13,1],[5,13,1],[41,13,1],[2,14,1],[3,14,1],[4,14,1],[5,14,1],[16,14,1],[17,14,1],[18,14,1],[2,15,1],[3,15,1],[4,15,1],[5,15,1],[2,16,1],[3,16,1],[4,16,1],[5,16,1],[2,17,1],[3,17,1],[4,17,1],[5,17,1],[5,18,1],[21,18,1],[2,19,1],[3,19,1],[4,19,1],[68,19,2],[69,19,2],[70,19,2],[2,20,1],[3,20,1],[4,20,1],[68,20,2],[69,20,2],[70,20,2],[3,21,1],[4,21,1],[10,21,1],[11,21,1],[13,21,2],[2,22,1],[3,22,1],[4,22,1],[5,22,1],[13,22,2],[16,22,1],[17,22,1],[18,22,1],[33,22,1],[2,23,1],[3,23,1],[4,23,1],[5,23,1],[13,23,2],[16,23,1],[17,23,1],[18,23,1],[33,23,1],[2,24,1],[3,24,1],[4,24,1],[5,24,1],[13,24,2],[16,24,1],[17,24,1],[18,24,1],[33,24,1],[2,25,1],[3,25,1],[4,25,1],[5,25,1],[13,25,2],[16,25,1],[17,25,1],[18,25,1],[33,25,1],[2,26,1],[3,26,1],[4,26,1],[5,26,1],[13,26,2],[16,26,1],[17,26,1],[18,26,1],[30,26,1],[31,26,1],[32,26,1],[33,26,1],[2,27,1],[3,27,1],[4,27,1],[5,27,1],[13,27,2],[16,27,1],[17,27,1],[18,27,1],[2,28,1],[3,28,1],[4,28,1],[5,28,1],[13,28,2],[16,28,1],[17,28,1],[18,28,1],[30,28,1],[31,28,1],[32,28,1],[61,29,2],[62,29,2],[63,29,2],[64,29,2],[65,29,2],[66,29,2],[67,29,2],[68,29,2],[69,29,2],[70,29,2],[71,29,2],[69,30,2],[70,30,2],[71,30,2],[2,31,1],[3,31,1],[4,31,1],[5,31,1],[62,31,1],[2,32,1],[3,32,1],[4,32,1],[5,32,1],[62,32,1],[2,33,1],[3,33,1],[4,33,1],[5,33,1],[2,34,1],[3,34,1],[4,34,1],[5,34,1],[62,34,1],[2,35,1],[3,35,1],[4,35,1],[5,35,1],[62,35,1],[2,36,1],[3,36,1],[4,36,1],[5,36,1],[62,36,1],[2,37,1],[3,37,1],[4,37,1],[5,37,1],[62,37,1],[3,38,1],[4,38,1],[16,38,1],[62,38,1],[2,39,1],[3,39,1],[4,39,1],[69,39,2],[70,39,2],[2,40,1],[3,40,1],[4,40,1],[69,40,2],[70,40,2],[25,41,1],[19,42,1],[24,42,2],[25,42,1],[19,43,1],[24,43,2],[25,43,1],[19,44,1],[24,44,2],[25,44,1],[19,45,1],[24,45,2],[25,45,1],[19,46,1],[24,46,2],[25,46,1],[19,47,1],[24,47,2],[25,47,1],[25,48,1],[35,51,2],[37,51,1]],
    // 结构删除 ×56
    structDel: [
      'serverrack@8,8,1x1',
      'serverrack@10,8,1x1',
      'serverrack@13,8,1x1',
      'desk@9,13,3x1',
      'officechair@9,14,1x1',
      'officechair@11,14,1x1',
      'gauge@15,8,1x1',
      'screenboard@20,8,1x1',
      'table@20,11,3x1',
      'officechair@19,13,1x1',
      'officechair@21,13,1x1',
      'officechair@20,10,1x1',
      'binshelf@6,23,2x1',
      'binshelf@10,23,2x1',
      'binshelf@14,23,2x1',
      'desk@14,26,1x1',
      'bunkbed@19,23,1x2',
      'bunkbed@23,23,1x2',
      'table@20,26,2x1',
      'officechair@21,28,1x1',
      'pillar@8,33,1x1',
      'pillar@23,33,1x1',
      'screenboard@36,6,1x1',
      'pillar@31,6,1x1',
      'pillar@41,6,1x1',
      'desk@34,14,1x1',
      'officechair@33,15,1x1',
      'table@31,16,1x1',
      'desk@43,15,1x1',
      'binshelf@40,16,2x1',
      'desk@46,8,1x1',
      'officechair@46,9,1x1',
      'desk@30,23,1x1',
      'copier@31,23,1x1',
      'libshelf@30,25,1x1',
      'serverrack@30,29,1x1',
      'serverrack@31,29,1x1',
      'gauge@30,31,1x1',
      'boiler@31,31,1x1',
      'megdoc@30,36,1x1',
      'bunkbed@46,6,1x2',
      'table@48,8,1x1',
      'bunkbed@55,23,1x2',
      'table@56,24,1x1',
      'bunkbed@64,31,1x2',
      'bunkbed@34,43,1x2',
      'table@35,43,1x1',
      'bunkbed@44,43,1x2',
      'table@45,43,1x1',
      'table@13,45,1x1',
      'desk@20,43,1x1',
      'megposter@38,6,1x1',
      'photo@41,6,1x1',
      'noticeboard@6,10,1x1',
      'noticeboard@31,25,1x1',
      'photo@19,26,1x1',
    ],
    // 结构新增 ×77（deg 落地为 data.deg；其余 data 原样透传）
    structAdd: [
      {"kind":"serverrack","x":2,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":3,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":4,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"desk","x":8,"y":16,"w":3,"h":1,"solid":true},
      {"kind":"officechair","x":8,"y":15,"w":1,"h":1,"solid":false},
      {"kind":"officechair","x":10,"y":15,"w":1,"h":1,"solid":false},
      {"kind":"gauge","x":5,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"screenboard","x":22,"y":7,"w":1,"h":1,"solid":false},
      {"kind":"table","x":20,"y":10,"w":3,"h":1,"solid":true},
      {"kind":"officechair","x":20,"y":11,"w":1,"h":1,"solid":false},
      {"kind":"officechair","x":22,"y":11,"w":1,"h":1,"solid":false},
      {"kind":"officechair","x":21,"y":9,"w":1,"h":1,"solid":false},
      {"kind":"binshelf","x":2,"y":27,"w":2,"h":1,"solid":true},
      {"kind":"binshelf","x":9,"y":27,"w":2,"h":1,"solid":true},
      {"kind":"desk","x":7,"y":27,"w":1,"h":1,"solid":true},
      {"kind":"bunkbed","x":14,"y":23,"w":1,"h":2,"solid":true},
      {"kind":"bunkbed","x":16,"y":23,"w":1,"h":2,"solid":true},
      {"kind":"table","x":15,"y":27,"w":2,"h":1,"solid":true},
      {"kind":"officechair","x":16,"y":28,"w":1,"h":1,"solid":false},
      {"kind":"screenboard","x":36,"y":2,"w":1,"h":1,"solid":false},
      {"kind":"pillar","x":32,"y":5,"w":1,"h":1,"solid":true},
      {"kind":"pillar","x":40,"y":5,"w":1,"h":1,"solid":true},
      {"kind":"desk","x":34,"y":17,"w":1,"h":1,"solid":true},
      {"kind":"officechair","x":34,"y":16,"w":1,"h":1,"solid":false},
      {"kind":"table","x":31,"y":17,"w":1,"h":1,"solid":true},
      {"kind":"desk","x":42,"y":17,"w":1,"h":1,"solid":true},
      {"kind":"binshelf","x":43,"y":17,"w":2,"h":1,"solid":true},
      {"kind":"desk","x":46,"y":3,"w":1,"h":1,"solid":true},
      {"kind":"officechair","x":46,"y":4,"w":1,"h":1,"solid":false},
      {"kind":"desk","x":30,"y":22,"w":1,"h":1,"solid":true},
      {"kind":"copier","x":33,"y":22,"w":1,"h":1,"solid":true},
      {"kind":"libshelf","x":30,"y":26,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":30,"y":28,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":31,"y":28,"w":1,"h":1,"solid":true},
      {"kind":"gauge","x":31,"y":32,"w":1,"h":1,"solid":true},
      {"kind":"boiler","x":32,"y":32,"w":1,"h":1,"solid":true},
      {"kind":"megdoc","x":32,"y":35,"w":1,"h":1,"solid":false,"data":{"doc":"meg_levels"}},
      {"kind":"bunkbed","x":49,"y":3,"w":1,"h":2,"solid":true},
      {"kind":"table","x":47,"y":3,"w":1,"h":1,"solid":true},
      {"kind":"bunkbed","x":59,"y":24,"w":1,"h":2,"solid":true},
      {"kind":"table","x":58,"y":24,"w":1,"h":1,"solid":true},
      {"kind":"bunkbed","x":67,"y":31,"w":1,"h":2,"solid":true},
      {"kind":"bunkbed","x":38,"y":43,"w":1,"h":2,"solid":true},
      {"kind":"table","x":34,"y":43,"w":1,"h":1,"solid":true},
      {"kind":"bunkbed","x":49,"y":43,"w":1,"h":2,"solid":true},
      {"kind":"table","x":47,"y":43,"w":1,"h":1,"solid":true},
      {"kind":"table","x":13,"y":44,"w":1,"h":1,"solid":true},
      {"kind":"desk","x":19,"y":43,"w":1,"h":1,"solid":true},
      {"kind":"megposter","x":38,"y":2,"w":1,"h":1,"solid":false},
      {"kind":"photo","x":41,"y":2,"w":1,"h":1,"solid":false},
      {"kind":"noticeboard","x":15,"y":10,"w":1,"h":1,"solid":false},
      {"kind":"noticeboard","x":33,"y":24,"w":1,"h":1,"solid":false},
      {"kind":"photo","x":23,"y":27,"w":1,"h":1,"solid":false},
      {"kind":"binshelf","x":4,"y":27,"w":2,"h":1,"solid":true},
      {"kind":"binshelf","x":11,"y":27,"w":2,"h":1,"solid":true},
      {"kind":"binshelf","x":4,"y":24,"w":2,"h":1,"solid":true},
      {"kind":"binshelf","x":9,"y":24,"w":2,"h":1,"solid":true},
      {"kind":"binshelf","x":11,"y":24,"w":2,"h":1,"solid":true},
      {"kind":"binshelf","x":2,"y":24,"w":2,"h":1,"solid":true},
      {"kind":"bunkbed","x":18,"y":23,"w":1,"h":2,"solid":true},
      {"kind":"table","x":17,"y":27,"w":2,"h":1,"solid":true},
      {"kind":"serverrack","x":6,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":7,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":8,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"gauge","x":9,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":10,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":11,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":12,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"gauge","x":13,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":14,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"serverrack","x":15,"y":7,"w":1,"h":1,"solid":true},
      {"kind":"desk","x":12,"y":16,"w":3,"h":1,"solid":true},
      {"kind":"officechair","x":12,"y":15,"w":1,"h":1,"solid":false},
      {"kind":"officechair","x":14,"y":15,"w":1,"h":1,"solid":false},
      {"kind":"desk","x":8,"y":10,"w":3,"h":1,"solid":true},
      {"kind":"officechair","x":9,"y":9,"w":1,"h":1,"solid":false},
      {"kind":"libshelf","x":33,"y":26,"w":1,"h":1,"solid":true},
    ],
    npcPos: {"nightingale":[10.5,9.5,0],"justin":[38.5,8.5,0],"suanpan":[40.5,15.5,0],"kat":[47.5,5.5,0],"river":[32.5,24.5,0]},
    randSlots: [[56.5,10.5,0],[36.5,43.5,0],[36.5,53.5,0],[58.5,33.5,0],[19.5,23.5,0],[14.5,44.5,0]], // 随机居民槽（含新增；按 npcDefs 顺序）
    lightDel: ["11.5,13.5,5.5,#fff2d8","10.5,25.5,5.5,#fff2d8","40.5,14.5,5.5,#fff2d8","30.5,24.5,5,#fff2d8","48.5,8.5,3.5,#ffd8a0","56.5,24.5,3.5,#ffd8a0","21.5,44.5,3,#ffd8a0","26.5,2.5,5,#fff2d8","46.5,6.5,5,#fff2d8","6.5,10.5,5,#fff2d8","30.5,14.5,5,#fff2d8","34.5,14.5,5,#fff2d8","42.5,14.5,5,#fff2d8","46.5,14.5,5,#fff2d8","6.5,22.5,5,#fff2d8","10.5,22.5,5,#fff2d8","14.5,22.5,5,#fff2d8","30.5,22.5,5,#fff2d8","6.5,26.5,5,#fff2d8","10.5,26.5,5,#fff2d8","14.5,26.5,5,#fff2d8","62.5,30.5,5,#fff2d8","70.5,30.5,5,#fff2d8","22.5,42.5,5,#fff2d8","22.5,46.5,5,#fff2d8","71.5,29.5,3,#f5e37a"],
    lightAdd: [{"x":11.89,"y":13.28,"r":5.5,"color":"#fff2d8"},{"x":7.46,"y":25.81,"r":5.5,"color":"#fff2d8"},{"x":42.4,"y":15.54,"r":5.5,"color":"#fff2d8"},{"x":31.99,"y":25.79,"r":5,"color":"#fff2d8"},{"x":49.47,"y":7.69,"r":3.5,"color":"#ffd8a0"},{"x":56.41,"y":24.5,"r":3.5,"color":"#ffd8a0"},{"x":20.05,"y":44.45,"r":3,"color":"#ffd8a0"},{"x":26.72,"y":2.67,"r":5,"color":"#fff2d8"},{"x":46.43,"y":6.44,"r":5,"color":"#fff2d8"},{"x":6.72,"y":10.46,"r":5,"color":"#fff2d8"},{"x":30.34,"y":2.97,"r":5,"color":"#fff2d8"},{"x":34.38,"y":2.84,"r":5,"color":"#fff2d8"},{"x":38.21,"y":2.84,"r":5,"color":"#fff2d8"},{"x":41.89,"y":2.97,"r":5,"color":"#fff2d8"},{"x":3.5,"y":23.5,"r":5,"color":"#fff2d8"},{"x":7.5,"y":23.5,"r":5,"color":"#fff2d8"},{"x":11.5,"y":23.5,"r":5,"color":"#fff2d8"},{"x":31.91,"y":22.72,"r":5,"color":"#fff2d8"},{"x":3.5,"y":27.5,"r":5,"color":"#fff2d8"},{"x":7.5,"y":27.5,"r":5,"color":"#fff2d8"},{"x":11.5,"y":27.5,"r":5,"color":"#fff2d8"},{"x":59.32,"y":40.42,"r":5,"color":"#fff2d8"},{"x":65.69,"y":40.31,"r":5,"color":"#fff2d8"},{"x":21.88,"y":42.48,"r":5,"color":"#fff2d8"},{"x":21.88,"y":46.5,"r":5,"color":"#fff2d8"},{"x":68.57,"y":39.6,"r":3,"color":"#f5e37a"},{"x":18.13,"y":13.47,"r":5,"color":"#fff2d8"},{"x":2.5,"y":14.66,"r":5,"color":"#fff2d8"},{"x":2.5,"y":10.5,"r":5,"color":"#fff2d8"},{"x":15.5,"y":23.5,"r":5,"color":"#fff2d8"},{"x":15.33,"y":27.06,"r":5,"color":"#fff2d8"},{"x":18.15,"y":25.2,"r":5,"color":"#fff2d8"},{"x":46.5,"y":22.5,"r":5,"color":"#fff2d8"},{"x":50.5,"y":22.5,"r":5,"color":"#fff2d8"},{"x":54.5,"y":22.5,"r":5,"color":"#fff2d8"},{"x":58.5,"y":22.5,"r":5,"color":"#fff2d8"}],
    exitPos: [[28,1],[68,39],[1,45]], // 出口落位（按 def.exits 顺序）
    zones: [{"name":"北部入口","x":27,"y":3.5,"z":0,"x0":25,"y0":0,"x1":28,"y1":6},{"name":"探险署","x":13,"y":20,"z":0,"x0":1,"y0":1,"x1":24,"y1":38},{"name":"行政署","x":37,"y":10,"z":0,"x0":29,"y0":1,"x1":44,"y1":18},{"name":"监督者驻办","x":48,"y":6.5,"z":0,"x0":45,"y0":2,"x1":50,"y1":10},{"name":"档案署","x":30,"y":29,"z":0},{"name":"研究署","x":41,"y":26,"z":0},{"name":"爱念陌异区","x":56,"y":9,"z":0},{"name":"莱沃区","x":60,"y":33,"z":0},{"name":"东部入口","x":67.5,"y":40,"z":0,"x0":63,"y0":39,"x1":71,"y1":40},{"name":"腥红区","x":41,"y":43,"z":0},{"name":"先驱区","x":16,"y":46,"z":0},{"name":"西部入口","x":3,"y":45,"z":0},{"name":"西风区","x":39,"y":55,"z":0}], // 区域整体替换（含矩形范围）
  })
  return [{ cx: X(21), cy: X(4) }]
}

// ============ 商人之家（B.N.T.G.，id 102）：商场式布局——中央「交易保险库」（车库式储藏室+
// 卷帘门）+ 环厅市场街店铺 + 会议室/加工中心/公共生活区（设定：wikidot The B.N.T.G.） ============
function genBntgOutpost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const X = (v: number) => Math.round(v * K)
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0); y <= X(y1); y++) for (let x = X(x0); x <= X(x1); x++) floor(x, y)
  }
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], tint = 0) => {
    const [ax, ay, bx, by] = [X(x0), X(y0), X(x1), X(y1)]
    for (let x = ax; x <= bx; x++) { wall(x, ay); wall(x, by) }
    for (let y = ay; y <= by; y++) { wall(ax, y); wall(bx, y) }
    for (let y = ay + 1; y <= by - 1; y++) for (let x = ax + 1; x <= bx - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      const dx = X(odx), dy = X(ody)
      floor(dx, dy)
      const sx = dx === ax ? -1 : dx === bx ? 1 : 0
      const sy = dy === ay ? -1 : dy === by ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = dx + i * sx, ty = dy + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
    if (tint) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) m.tint[idx(x, y)] = tint
  }
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: X(x), y: X(y), w, h, solid, data })
  const deco = (kind: 'noticeboard' | 'megposter' | 'photo', x: number, y: number, tex?: string) => {
    const tx = X(x), ty = X(y)
    if (m.tiles[idx(tx, ty)] !== 1) return
    // 实心面（砌墙或虚空）皆可挂——未砌的虚空瓦片在渲染层同样立起墙盒
    const w = (dx: number, dy: number) => m.tiles[idx(tx + dx, ty + dy)] !== 1
    if (!w(1, 0) && !w(-1, 0) && !w(0, 1) && !w(0, -1)) return
    if ((w(1, 0) && w(-1, 0)) || (w(0, 1) && w(0, -1))) return
    S(kind, x, y, 1, 1, false, tex ? { tex } : undefined)
  }
  const L = (x: number, y: number, r = 5, color = def.palette.light) =>
    m.lights.push({ x: X(x) + 0.5, y: X(y) + 0.5, r, color, flickerSeed: rng.next() * 100 })
  const NPC = (id: string, x: number, y: number) =>
    (m.npcs ??= []).push({ id, x: X(x) + rng.int(-1, 1) * 0.2, y: X(y) + rng.int(-1, 1) * 0.2 })

  // ---- 主骨架：北入口迎宾廊 + 中央市场大厅（外圈为各区房间） ----
  carve(30, 1, 34, 14) // 迎宾廊（北入口 → 大厅）
  carve(8, 14, 56, 40) // 中央市场大厅（全部雕通）
  carve(22, 10, 44, 14) // 北连廊（会议室/加工中心 → 大厅）
  carve(8, 28, 8, 28) // 西门廊引道（西侧开一口）
  carve(56, 28, 56, 28) // 东门廊引道（占位，下方房间会绕开）
  m.exits.push({ def: def.exits[0], x: X(32), y: X(1), discovered: true })
  m.exits.push({ def: def.exits[1], x: X(57), y: X(28), discovered: false })
  m.exits.push({ def: def.exits[2], x: X(1), y: X(28), discovered: false })
  carve(55, 27, 57, 29) // 东门廊
  carve(1, 27, 8, 29) // 西门廊 → 大厅西缘
  m.spawn = { x: X(32), y: X(3) }
  NPC('lan', 32, 6) // 行商·蓝：入口迎宾

  // ---- 北区：会议室 + 加工中心 ----
  room(22, 5, 30, 9, [[26, 9]]) // 会议室——门南开向大厅
  S('screenboard', 23, 6, 1, 1, false); S('table', 24, 7, 4, 1) // v54e：投影幕移贴西墙（原位 K 缩放后与北墙错一格浮空）
  S('officechair', 24, 8, 1, 1, false); S('officechair', 27, 8, 1, 1, false)
  L(26, 7, 5.5)
  room(34, 5, 44, 9, [[38, 9]]) // 加工中心——门南开向大厅
  S('serverrack', 36, 6); S('serverrack', 38, 6); S('boiler', 42, 6); S('gauge', 40, 8); S('table', 36, 8, 2, 1)
  L(39, 7, 5.5)

  // ---- 中心：交易保险库（卷帘门墙立在房间内部——中央 3 宽狭窄走廊贯通南北两口，
  // 两侧 x=38 / x=42 各 14 扇 1 宽卷帘门无框相连成墙，各藏 1 扇真门通向墙后储藏区，
  // 其余 26 扇 locked 锁死；NPC 移至库外——账台在大厅北环，守卫在库北门外） ----
  room(26, 20, 38, 32, [[32, 20], [32, 32]], 9) // 保险库外壳（tint=9 白色金属）——地图坐标 x 33..48 × y 25..40，南北入口 x=40
  const SM = (kind: StructKind, mx: number, my: number, w: number, h: number, data?: Structure['data']) =>
    m.structures.push({ kind, x: mx, y: my, w, h, solid: true, data })
  // 两侧卷帘门墙（西墙 x=38 面朝东 / 东墙 x=42 面朝西，y 26..39 连续 14 扇；竖向链相邻门互认作墙、两端锚在外壳墙）
  for (let dy = 26; dy <= 39; dy++) {
    SM('rollerdoor', 38, dy, 1, 1, dy === 29 ? { open: 0 } : { open: 0, locked: 1 }) // 西墙 y=29 真门 → 西侧储藏区
    SM('rollerdoor', 42, dy, 1, 1, dy === 33 ? { open: 0 } : { open: 0, locked: 1 }) // 东墙 y=33 真门 → 东侧储藏区
  }
  // 墙后储藏区（西 x 34..37 设备+货架 / 东 x 43..47 高价值货架）
  SM('serverrack', 34, 27, 1, 1); SM('gauge', 35, 27, 1, 1)
  SM('binshelf', 34, 30, 2, 1); SM('binshelf', 36, 33, 2, 1); SM('binshelf', 34, 36, 2, 1)
  SM('binshelf', 43, 27, 2, 1); SM('binshelf', 45, 30, 2, 1); SM('binshelf', 43, 33, 2, 1); SM('binshelf', 45, 36, 2, 1)
  // 顶部长条灯（走廊中线 + 墙后储藏区）
  for (const ly of [27, 30.5, 34, 37.5]) m.lights.push({ x: 40.5, y: ly, r: 4.5, color: '#f2f4f0', flickerSeed: rng.next() * 100 })
  m.lights.push({ x: 35.5, y: 32, r: 3.5, color: '#e8ecef', flickerSeed: rng.next() * 100 })
  m.lights.push({ x: 45, y: 32, r: 3.5, color: '#e8ecef', flickerSeed: rng.next() * 100 })
  // 库外账台（大厅北环，面对保险库北门）
  S('desk', 27, 16); S('libshelf', 28, 16)
  NPC('laozhangfang', 27, 17) // 奥托·格雷在库外账台
  NPC('kui', 33, 18) // 布洛克·奎把守保险库北门（门外）

  // ---- 市场街店铺（西 3 + 东 3 + 南 2，柜台 + 摊主 + 招牌） ----
  const shop = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], npc: string | null, tex?: string) => {
    room(x0, y0, x1, y1, doors)
    S('table', x0 + 1, y0 + 1, 2, 1) // 柜台
    S('binshelf', x1 - 2, y1 - 2, 2, 1)
    if (tex) deco('megposter', x0 + 3, y0 + 1, tex)
    if (npc) NPC(npc, x0 + 2, y0 + 2)
    L(x0 + 2, y0 + 2, 4.5)
  }
  shop(11, 16, 17, 21, [[17, 18]], 'shen', 'bntg_poster.png') // 西一：鉴定师塞德里克·科尔曼
  shop(11, 23, 17, 28, [[17, 25]], 'tang', 'bntg_poster.png') // 西二：杂货商玛戈·坦恩
  shop(11, 30, 17, 35, [[17, 32]], null, 'bntg_poster.png') // 西三（随机 NPC 看摊）
  shop(47, 16, 53, 21, [[47, 18]], null, 'bntg_poster.png') // 东一（随机 NPC 看摊）
  shop(47, 23, 53, 28, [[47, 25]], null, 'bntg_poster.png') // 东二（随机 NPC 看摊）
  shop(47, 30, 53, 35, [[47, 32]], 'candyman', 'bntg_poster.png') // 东三：糖果贩「糖佬」希德（Object 5，替换原随机 NPC 摊位）
  // 南二店南北贯通（北门朝大厅 + 南门朝南连廊）——生活区经店铺与大厅相连（否则整片南区成孤岛被回填）
  shop(20, 41, 26, 46, [[23, 41], [23, 46]], null, 'bntg_poster.png') // 南一（随机 NPC 看摊）
  shop(28, 41, 34, 46, [[31, 41], [31, 46]], null, 'bntg_poster.png') // 南二（随机 NPC 看摊）
  // 悬挂店招（店前脸 + 大厅中央）
  S('shopsign', 18, 19, 1, 1, false); S('shopsign', 18, 26, 1, 1, false); S('shopsign', 18, 33, 1, 1, false)
  S('shopsign', 46, 19, 1, 1, false); S('shopsign', 46, 26, 1, 1, false); S('shopsign', 46, 33, 1, 1, false)
  S('shopsign', 23, 40, 1, 1, false); S('shopsign', 31, 40, 1, 1, false)
  S('shopsign', 32, 24, 1, 1, false)

  // ---- 大厅商场风点缀：休息长椅/花坛/垃圾桶 + 墙面海报公告栏 + 地面导引箭头 ----
  // 西环（西店铺墙外）
  S('bench', 21, 18); S('planter', 21, 26); S('trashbin', 21, 33)
  // 东环（东店铺墙外）
  S('planter', 43, 18); S('bench', 43, 26); S('trashbin', 43, 33)
  // 北环（北连廊与保险库之间）
  S('bench', 20, 16); S('planter', 24, 16); S('trashbin', 39, 16); S('planter', 42, 16)
  // 南环（保险库与南店铺之间）
  S('planter', 20, 36); S('bench', 24, 37); S('bench', 40, 37); S('trashbin', 44, 36)
  // 大厅四角花坛 + 迎宾廊垃圾桶
  S('planter', 10, 15); S('planter', 54, 15); S('planter', 10, 39); S('planter', 54, 39)
  S('trashbin', 30, 5); S('trashbin', 34, 10)
  // 墙面装饰（贴外圈墙/连廊墙，deco 自动校验不悬浮）
  deco('noticeboard', 8, 20); deco('photo', 8, 30)
  deco('megposter', 56, 22, 'bntg_poster.png'); deco('photo', 56, 34)
  deco('noticeboard', 20, 14); deco('megposter', 46, 14, 'bntg_poster.png')
  deco('noticeboard', 14, 48); deco('megposter', 36, 48, 'bntg_poster.png'); deco('photo', 52, 48)
  // 商业海报墙（大量多样广告：促销/杏仁水/美食/数码/服饰 + BNTG 标语 轮换；deco 自动校验贴墙）
  const ADS = ['poster_sale.png', 'poster_almond.png', 'poster_food.png', 'poster_tech.png', 'poster_fashion.png', 'bntg_poster.png']
  const adSpots: [number, number][] = [
    [8, 16], [8, 22], [8, 26], [8, 34], [8, 38], // 大厅西墙
    [56, 16], [56, 20], [56, 26], [56, 30], [56, 38], // 大厅东墙
    [10, 14], [14, 14], [18, 14], [48, 14], [52, 14], // 大厅北墙
    [21, 40], [24, 40], [29, 40], [32, 40], // 南店铺门脸（朝大厅）
    [10, 17], [10, 20], [10, 24], [10, 27], [10, 31], [10, 34], // 西店铺外墙（朝西环）
    [30, 2], [30, 4], [31, 8], [34, 2], [34, 4], // 迎宾廊两侧（中段被北区房间挤窄且与北连廊打通，只能贴北段）
    [10, 48], [18, 48], [24, 48], [30, 48], [40, 48], [46, 48], [56, 48], // 南连廊
    [27, 19], [29, 19], [33, 19], [35, 19], [37, 19], // 保险库北面（朝北环）
    [27, 33], [30, 33], [34, 33], [36, 33], // 保险库南面（朝南环）
  ]
  adSpots.forEach(([ax, ay], i) => deco('megposter', ax, ay, ADS[i % ADS.length]))
  // 休息桌椅
  S('table', 22, 34, 2, 1); S('officechair', 23, 35, 1, 1, false); S('officechair', 21, 35, 1, 1, false)
  // 地面导引箭头（中指路 → 保险库南北入口；北侧箭头转向指南）
  for (const ay of [17, 19]) S('photo', 32, ay, 1, 1, false, { flat: 1, tex: 'mall_arrow.png', deg: 180 })
  for (const ay of [34, 37]) S('photo', 32, ay, 1, 1, false, { flat: 1, tex: 'mall_arrow.png' })

  // ---- 雪貂笼（「切行」吉祥物 Ferren 的家：小围栏房 + 窝棚，两只在内漫游） ----
  room(44, 36, 48, 40, [[46, 36]])
  S('table', 45, 38) // 窝棚
  L(46, 38, 4, '#ffe8c0')
  m.entities.push(makeEntity('ferren', X(46) + 0.5, X(38) + 0.5))
  m.entities.push(makeEntity('ferren', X(45) + 0.5, X(39) + 0.5))

  // ---- 南区：公共生活区（ bunkbed 民居，暖木 tint=8） ----
  const house = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], lite: boolean) => {
    room(x0, y0, x1, y1, doors, 8)
    if (lite) { S('bunkbed', x0 + 1, y0 + 1, 1, 2); S('table', x0 + 2, y1 - 2); L(x0 + 2, y0 + 2, 3.5, '#ffd8a0') }
    else { S('desk', x0 + 1, y0 + 1); L(x0 + 2, y0 + 2, 3, '#ffd8a0') }
  }
  carve(8, 48, 56, 50) // 南连廊（南店铺/生活区）
  house(12, 50, 18, 55, [[15, 50]], rng.chance(0.7))
  house(20, 50, 26, 55, [[23, 50]], rng.chance(0.7))
  house(28, 50, 34, 55, [[31, 50]], rng.chance(0.6))
  house(40, 50, 46, 55, [[43, 50]], rng.chance(0.6))

  // ---- 灯光：紧凑 4 格网格 + 大厅吊灯 ----
  for (let y = 2; y < m.h - 1; y += 4)
    for (let x = 2; x < m.w - 1; x += 4)
      if (m.tiles[idx(x, y)] === 1)
        m.lights.push({ x: x + 0.5, y: y + 0.5, r: 5, color: def.palette.light, flickerSeed: rng.next() * 100 })
  for (let x = 14; x <= 50; x += 9) for (let y = 18; y <= 38; y += 10) L(x, y, 6, '#f0f0d8') // 大厅吊灯

  // ---- 随机 NPC（BNTG 风味：店员/押运员/信使等，看摊与游荡） ----
  {
    const defs = genRandomNpcs(() => rng.next(), 4, 'bntg')
    m.npcDefs = defs
    const spots: [number, number][] = [
      [14, 33], // 西三摊位
      [50, 19], // 东一摊位
      [50, 26], // 东二摊位
      [23, 43], // 南一摊位
    ]
    defs.forEach((d, i) => {
      const [sx, sy] = spots[i % spots.length]
      ;(m.npcs ??= []).push({ id: d.id, x: X(sx) + 0.5, y: X(sy) + 0.5 })
    })
  }

  // ---- 区域名称标注 ----
  m.zones = [
    { name: '北部入口', x: X(32), y: X(2) },
    { name: '迎宾廊', x: X(32), y: X(8) },
    { name: '会议室', x: X(26), y: X(7) },
    { name: '加工中心', x: X(39), y: X(7) },
    { name: '市场大厅', x: X(24), y: X(36) },
    { name: '交易保险库', x: X(32), y: X(26) },
    { name: '市场街（西）', x: X(14), y: X(26) },
    { name: '市场街（东）', x: X(50), y: X(26) },
    { name: '市场街（南）', x: X(27), y: X(44) },
    { name: '雪貂笼', x: X(46), y: X(38) },
    { name: '公共生活区', x: X(28), y: X(52) },
    { name: '东部入口', x: X(56), y: X(28) },
    { name: '西部入口', x: X(2), y: X(28) },
  ]
  return [{ cx: X(32), cy: X(3) }]
}

// ============ 希波克拉底 - 1（阿丽亚娜集团，id 103）：大型医药研究所/生物实验室布局——
// 北入口迎宾廊 + 接待大厅，中央消毒走廊贯通南北；北翼手术室（西）与药房（东），
// 西翼病房区（3 间病房），东翼生物实验室（2 间），南翼研究办公与值班宿舍（设定：wikidot 阿丽亚娜集团） ============
function genArianeOutpost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const X = (v: number) => Math.round(v * K)
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0); y <= X(y1); y++) for (let x = X(x0); x <= X(x1); x++) floor(x, y)
  }
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], tint = 0) => {
    const [ax, ay, bx, by] = [X(x0), X(y0), X(x1), X(y1)]
    for (let x = ax; x <= bx; x++) { wall(x, ay); wall(x, by) }
    for (let y = ay; y <= by; y++) { wall(ax, y); wall(bx, y) }
    for (let y = ay + 1; y <= by - 1; y++) for (let x = ax + 1; x <= bx - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      const dx = X(odx), dy = X(ody)
      floor(dx, dy)
      const sx = dx === ax ? -1 : dx === bx ? 1 : 0
      const sy = dy === ay ? -1 : dy === by ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = dx + i * sx, ty = dy + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
    if (tint) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) m.tint[idx(x, y)] = tint
  }
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: X(x), y: X(y), w, h, solid, data })
  const deco = (kind: 'noticeboard' | 'megposter' | 'photo', x: number, y: number, tex?: string) => {
    const tx = X(x), ty = X(y)
    if (m.tiles[idx(tx, ty)] !== 1) return
    // 实心面（砌墙或虚空）皆可挂——未砌的虚空瓦片在渲染层同样立起墙盒
    const w = (dx: number, dy: number) => m.tiles[idx(tx + dx, ty + dy)] !== 1
    if (!w(1, 0) && !w(-1, 0) && !w(0, 1) && !w(0, -1)) return
    if ((w(1, 0) && w(-1, 0)) || (w(0, 1) && w(0, -1))) return
    S(kind, x, y, 1, 1, false, tex ? { tex } : undefined)
  }
  const L = (x: number, y: number, r = 5, color = def.palette.light) =>
    m.lights.push({ x: X(x) + 0.5, y: X(y) + 0.5, r, color, flickerSeed: rng.next() * 100 })
  const NPC = (id: string, x: number, y: number) =>
    (m.npcs ??= []).push({ id, x: X(x) + rng.int(-1, 1) * 0.2, y: X(y) + rng.int(-1, 1) * 0.2 })

  // ---- 走廊网（所有房间的门都落到这些走廊上；布局铁律见文件头注释） ----
  carve(30, 1, 33, 4) // 迎宾廊（北入口 → 北横廊）
  carve(8, 5, 56, 8) // 北横廊（手术室/药房/接待大厅的门前廊）
  carve(30, 8, 33, 46) // 中央消毒走廊（贯通南北主轴）
  carve(8, 22, 30, 25) // 西横廊（病房区）
  carve(33, 22, 56, 25) // 东横廊（实验室）
  carve(8, 40, 56, 43) // 南横廊（研究办公/值班宿舍）
  carve(1, 22, 8, 25) // 西门廊
  carve(56, 22, 62, 25) // 东门廊
  m.exits.push({ def: def.exits[0], x: X(31), y: X(1), discovered: true })
  m.exits.push({ def: def.exits[1], x: X(62), y: X(23), discovered: false })
  m.exits.push({ def: def.exits[2], x: X(1), y: X(23), discovered: false })
  m.spawn = { x: X(31), y: X(3) }

  // ---- 接待大厅（北中：接待柜台 + 长椅/花坛/公告栏/集团海报） ----
  room(24, 10, 39, 19, [[31, 10], [31, 19]]) // 北门接北横廊、南门接消毒走廊
  S('table', 28, 13, 4, 1) // 接待柜台
  S('bench', 26, 16); S('bench', 35, 16) // 候诊长椅
  S('planter', 25, 18); S('planter', 38, 18); S('trashbin', 38, 14)
  deco('noticeboard', 26, 11); deco('megposter', 30, 11, 'ariane_poster.png')
  deco('megposter', 33, 11, 'ariane_poster.png'); deco('photo', 37, 11)
  L(31, 14, 6); L(27, 12, 5); L(35, 12, 5)
  NPC('lecomte', 31, 14) // 通信主管勒孔特：接待大厅迎宾

  // ---- 北翼：手术室（西北）+ 药房（东北） ----
  room(8, 10, 20, 19, [[14, 10]]) // 手术室——门北接北横廊
  S('table', 12, 13, 2, 1) // 手术台案
  S('hanglight', 12, 13, 1, 1, false); S('hanglight', 13, 13, 1, 1, false) // 无影灯（吊线灯 + 下方强光）
  S('medcabinet', 18, 11); S('ivstand', 10, 16, 1, 1, false); S('hospitalbed', 9, 12, 1, 2) // 术后恢复床
  L(13, 14, 5.5, '#f6f8ff') // 手术区冷白光
  NPC('dupont', 15, 15) // 主任医师杜邦：手术室
  room(43, 10, 56, 19, [[49, 10]]) // 药房——门北接北横廊
  S('medcabinet', 44, 11); S('medcabinet', 46, 11); S('medcabinet', 48, 11) // 药品柜排
  S('binshelf', 51, 11, 2, 1); S('binshelf', 54, 11, 2, 1) // 物资货架排
  S('desk', 48, 15) // 配药台
  deco('megposter', 55, 11, 'ariane_poster.png')
  L(49, 14, 5.5)
  NPC('martin', 50, 15) // 护士长马丁：药房

  // ---- 西翼：病房区（3 间病房：病床 + 输液架 + 药品柜） ----
  room(8, 27, 16, 34, [[12, 27]]) // 病房一——门北接西横廊
  S('hospitalbed', 9, 28, 1, 2); S('hospitalbed', 13, 28, 1, 2)
  S('ivstand', 11, 29, 1, 1, false); S('medcabinet', 15, 33)
  deco('photo', 9, 33)
  L(12, 30, 5)
  NPC('morel', 12, 31) // 外科医生莫雷尔：病房区
  room(18, 27, 26, 34, [[22, 27]]) // 病房二——门北接西横廊
  S('hospitalbed', 19, 28, 1, 2); S('hospitalbed', 23, 28, 1, 2)
  S('ivstand', 21, 29, 1, 1, false); S('medcabinet', 25, 33)
  L(22, 30, 5)
  room(8, 35, 16, 39, [[12, 39]]) // 病房三——门南接南横廊
  S('hospitalbed', 9, 36, 1, 2); S('hospitalbed', 13, 36, 1, 2)
  S('ivstand', 11, 36, 1, 1, false); S('medcabinet', 15, 36)
  deco('photo', 9, 38)
  L(12, 37, 5)

  // ---- 东翼：生物实验室（2 间：实验台 + 标本罐 + 药品柜） ----
  room(34, 27, 44, 34, [[39, 27]]) // 实验室一——门北接东横廊
  S('labbench', 35, 28, 2, 1); S('labbench', 37, 28, 2, 1) // 实验台靠西墙——必须让开门线（门正前方的实心家具会堵死 BFS 入口，房间被孤岛回填成墙）
  S('specimentank', 43, 28); S('specimentank', 43, 30); S('medcabinet', 35, 33)
  deco('megposter', 37, 33, 'ariane_poster.png')
  L(39, 30, 5.5)
  NPC('lefevre', 39, 31) // 实验室技术员勒费弗尔：征集委托发放/交付
  room(46, 27, 56, 34, [[51, 27]]) // 实验室二——门北接东横廊
  S('labbench', 48, 28, 2, 1)
  S('specimentank', 52, 28); S('specimentank', 54, 28); S('specimentank', 54, 30)
  S('medcabinet', 47, 33)
  L(51, 30, 5.5)
  NPC('muller', 51, 31) // 编外昆虫学家穆勒：生物实验室

  // ---- 南翼：研究办公（西南）+ 值班宿舍（东南） ----
  room(30, 45, 40, 52, [[35, 45]]) // 研究办公——门北接南横廊
  S('desk', 32, 47); S('officechair', 32, 48, 1, 1, false)
  S('libshelf', 35, 46); S('libshelf', 37, 46); S('screenboard', 39, 46, 1, 1, false)
  S('copier', 31, 50); S('desk', 35, 50)
  deco('noticeboard', 31, 46)
  L(35, 48, 5.5)
  room(42, 45, 52, 52, [[47, 45]]) // 值班宿舍——门北接南横廊
  S('bunkbed', 43, 46, 1, 2); S('bunkbed', 46, 46, 1, 2); S('bunkbed', 49, 46, 1, 2)
  S('table', 45, 50, 2, 1); S('officechair', 46, 51, 1, 1, false)
  deco('photo', 51, 46)
  L(47, 48, 5, '#f0e8d8')

  // ---- 消毒走廊点缀：紫环海报/公告栏 + 天花通风口（洁白紧凑灯网见下） ----
  deco('megposter', 30, 28, 'ariane_poster.png'); deco('megposter', 33, 33, 'ariane_poster.png')
  deco('noticeboard', 30, 36); deco('photo', 33, 38)
  deco('megposter', 12, 5, 'ariane_poster.png'); deco('megposter', 50, 5, 'ariane_poster.png'); deco('photo', 36, 5)
  S('ventgrate', 31, 15, 1, 1, false); S('ventgrate', 31, 30, 1, 1, false); S('ventgrate', 31, 41, 1, 1, false)
  S('ventgrate', 15, 23, 1, 1, false); S('ventgrate', 45, 23, 1, 1, false)

  // ---- 灯光：紧凑 4 格网格（洁白冷白光，研究所各处充分照明） ----
  for (let y = 2; y < m.h - 1; y += 4)
    for (let x = 2; x < m.w - 1; x += 4)
      if (m.tiles[idx(x, y)] === 1)
        m.lights.push({ x: x + 0.5, y: y + 0.5, r: 5, color: def.palette.light, flickerSeed: rng.next() * 100 })

  // ---- 随机 NPC（希波克拉底团队普通成员：护工/药剂师/化验员等，白制服） ----
  {
    const defs = genRandomNpcs(() => rng.next(), 4, 'ariane')
    m.npcDefs = defs
    const spots: [number, number][] = [
      [12, 37], // 病房三
      [35, 48], // 研究办公
      [46, 49], // 值班宿舍
      [31, 33], // 消毒走廊
    ]
    const shuffled = [...spots].sort(() => rng.next() - 0.5)
    defs.forEach((d, i) => {
      const [sx, sy] = shuffled[i % shuffled.length]
      ;(m.npcs ??= []).push({ id: d.id, x: X(sx) + 0.5, y: X(sy) + 0.5 })
    })
  }

  // ---- 区域名称标注（大地图用） ----
  m.zones = [
    { name: '北部入口', x: X(31), y: X(2) },
    { name: '接待大厅', x: X(31), y: X(14) },
    { name: '手术室', x: X(14), y: X(14) },
    { name: '药房', x: X(49), y: X(14) },
    { name: '消毒走廊', x: X(31), y: X(30) },
    { name: '病房区', x: X(12), y: X(30) },
    { name: '生物实验室', x: X(45), y: X(30) },
    { name: '研究办公', x: X(35), y: X(48) },
    { name: '值班宿舍', x: X(47), y: X(49) },
    { name: '东部入口', x: X(60), y: X(23) },
    { name: '西部入口', x: X(3), y: X(23) },
  ]
  // ============ v54：设计模式重制（玩家导出 2026-08-10T13:53:28.172Z；零差异校验 .check/diff-verify.mts）============
  applyDesignPatch(m, rng, 'ariane', {
    // tiles 开合（4 格；2=墙 1=地板）
    tiles: [[38,55,2],[39,55,2],[40,55,2],[41,55,2]],
    randSlots: [[15.5,46.5,0],[39.5,41.5,0],[44.5,60.5,0],[58.5,61.5,0]], // 随机居民槽（含新增；按 npcDefs 顺序）
  })
  return [{ cx: X(31), cy: X(3) }]
}

// ============ Tom 的餐馆（独立餐馆，id 104）：家庭餐馆布局——北入口迎宾廊 + 前厅（前台），
// 中央餐厅（白桌布餐桌阵）贯通南北；东翼厨房（灶台/料理台/水槽）→ 冷库（冷冻柜+货架）→ 员工区，
// 西北储藏间；食客是来自各团体的流浪者（设定：wikidot 佐藤爱子——汤姆餐厅） ============
function genTomOutpost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const X = (v: number) => Math.round(v * K)
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0); y <= X(y1); y++) for (let x = X(x0); x <= X(x1); x++) floor(x, y)
  }
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], tint = 0) => {
    const [ax, ay, bx, by] = [X(x0), X(y0), X(x1), X(y1)]
    for (let x = ax; x <= bx; x++) { wall(x, ay); wall(x, by) }
    for (let y = ay; y <= by; y++) { wall(ax, y); wall(bx, y) }
    for (let y = ay + 1; y <= by - 1; y++) for (let x = ax + 1; x <= bx - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      const dx = X(odx), dy = X(ody)
      floor(dx, dy)
      const sx = dx === ax ? -1 : dx === bx ? 1 : 0
      const sy = dy === ay ? -1 : dy === by ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = dx + i * sx, ty = dy + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
    if (tint) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) m.tint[idx(x, y)] = tint
  }
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: X(x), y: X(y), w, h, solid, data })
  const deco = (kind: 'noticeboard' | 'megposter' | 'photo', x: number, y: number, tex?: string) => {
    const tx = X(x), ty = X(y)
    if (m.tiles[idx(tx, ty)] !== 1) return
    // 实心面（砌墙或虚空）皆可挂——未砌的虚空瓦片在渲染层同样立起墙盒
    const w = (dx: number, dy: number) => m.tiles[idx(tx + dx, ty + dy)] !== 1
    if (!w(1, 0) && !w(-1, 0) && !w(0, 1) && !w(0, -1)) return
    if ((w(1, 0) && w(-1, 0)) || (w(0, 1) && w(0, -1))) return
    S(kind, x, y, 1, 1, false, tex ? { tex } : undefined)
  }
  const L = (x: number, y: number, r = 5, color = def.palette.light) =>
    m.lights.push({ x: X(x) + 0.5, y: X(y) + 0.5, r, color, flickerSeed: rng.next() * 100 })
  const NPC = (id: string, x: number, y: number) =>
    (m.npcs ??= []).push({ id, x: X(x) + rng.int(-1, 1) * 0.2, y: X(y) + rng.int(-1, 1) * 0.2 })

  // ---- 走廊网（所有房间的门都落到这些走廊上；布局铁律见文件头注释） ----
  carve(30, 1, 33, 4) // 迎宾廊（北入口 → 北横廊）
  carve(6, 5, 56, 8) // 北横廊（前台/厨房/储藏间的门前廊）
  carve(6, 36, 56, 39) // 南横廊（餐厅南门/员工区）
  carve(6, 8, 9, 36) // 西纵廊（连北/南横廊）
  carve(54, 8, 57, 36) // 东纵廊（厨房东 → 冷库/员工区东门）
  carve(1, 20, 9, 23) // 西门廊（西入口 → 西纵廊）
  carve(54, 20, 62, 23) // 东门廊（东纵廊 → 东入口）
  m.exits.push({ def: def.exits[0], x: X(31), y: X(1), discovered: true })
  m.exits.push({ def: def.exits[1], x: X(62), y: X(21), discovered: false })
  m.exits.push({ def: def.exits[2], x: X(1), y: X(21), discovered: false })
  m.spawn = { x: X(31), y: X(3) }

  // ---- 前厅/前台（北中：前台柜台 + 菜单黑板 + 招牌海报 + 等位长椅） ----
  room(22, 10, 39, 17, [[26, 10], [34, 10], [31, 17]]) // 双北门接北横廊、南门接餐厅
  S('table', 28, 12, 4, 1) // 前台柜台
  deco('noticeboard', 24, 11, 'tom_menu.png') // 菜单黑板（粉笔字今日菜单）
  deco('megposter', 30, 11, 'tom_poster.png') // 前台上方暖红招牌海报
  S('shopsign', 31, 14, 1, 1, false, { tex: 'tom_poster.png' }) // 悬挂招牌
  S('bench', 24, 15); S('planter', 37, 15); S('trashbin', 37, 11)
  L(31, 14, 6); L(26, 12, 5); L(36, 12, 5)
  NPC('aiko', 29, 13) // 佐藤爱子：前台（来料加工）

  // ---- 餐厅（中央大厅：白桌布餐桌阵；大量餐桌椅） ----
  room(10, 19, 39, 34, [[31, 19], [10, 26], [24, 34], [34, 34]]) // 北门接前厅、西门接西纵廊、双南门接南横廊
  // 餐桌阵（1×1 圆桌含对侧餐椅；门线通道留空——北门 x31 / 西门 (11,26) / 南门 x24,x34）
  const TABLES: [number, number][] = [
    [13, 21], [17, 21], [21, 21], [26, 21], [34, 21],
    [13, 25], [17, 25], [21, 25], [26, 25], [30, 25], [34, 25],
    [13, 29], [17, 29], [21, 29], [26, 29], [30, 29], [34, 29],
    [14, 32], [18, 32], [30, 32],
  ]
  for (const [tx, ty] of TABLES) S('dtable', tx, ty)
  S('planter', 11, 20); S('planter', 37, 32); S('trashbin', 37, 21); S('bench', 12, 32)
  deco('noticeboard', 11, 22, 'tom_menu.png') // 餐厅西墙菜单黑板
  deco('megposter', 38, 24, 'tom_poster.png'); deco('photo', 11, 30); deco('photo', 38, 28)
  L(16, 23, 5.5); L(28, 23, 5.5); L(22, 28, 5.5); L(34, 28, 5.5); L(16, 31, 5.5)
  NPC('joey', 37, 24) // v56：驻店乐手乔伊（餐厅东墙边，弹吉他）

  // ---- 厨房（东北翼：灶台排 + 料理台岛 + 水槽；Tom 掌勺） ----
  room(42, 10, 52, 19, [[46, 10], [46, 19]]) // 北门接北横廊、南门接冷库
  S('stove', 44, 11); S('stove', 45, 11); S('stove', 47, 11); S('stove', 48, 11) // 灶台排（让开北门线 x46）
  S('sink', 50, 11); S('sink', 51, 11) // 水槽
  S('kcounter', 44, 14, 2, 1); S('kcounter', 48, 15, 2, 1) // 料理台岛
  S('binshelf', 43, 17, 2, 1)
  L(46, 13, 5.5); L(49, 16, 5)
  NPC('tom', 46, 15) // Tom：厨房掌勺（食材换菜）

  // ---- 冷库（东翼：冷冻柜排 + 货架；非容器） ----
  room(42, 21, 52, 30, [[46, 21], [52, 26]]) // 北门接厨房、东门接东纵廊
  S('freezer', 44, 23); S('freezer', 46, 23); S('freezer', 48, 23); S('freezer', 50, 23)
  S('binshelf', 44, 27, 2, 1); S('binshelf', 48, 27, 2, 1)
  L(47, 25, 5, '#d0e0f0') // 冷库冷色灯

  // ---- 员工区（东南翼：上下铺 + 桌椅 + 货架） ----
  room(42, 31, 52, 35, [[47, 35], [52, 33]]) // 南门接南横廊、东门接东纵廊
  S('bunkbed', 43, 32, 1, 2); S('table', 46, 32, 2, 1); S('officechair', 47, 33, 1, 1, false)
  S('binshelf', 50, 32)
  L(47, 33, 4, '#ffd8a0')

  // ---- 储藏间（西北：干货货架 + 一台冷冻柜） ----
  room(10, 10, 20, 17, [[15, 10]]) // 北门接北横廊（让开门线 x15）
  S('binshelf', 12, 11, 2, 1); S('binshelf', 17, 11, 2, 1)
  S('binshelf', 12, 14, 2, 1); S('binshelf', 17, 14, 2, 1)
  S('freezer', 15, 15)
  L(15, 13, 4.5)

  // ---- 走廊点缀：海报/公告栏 + 天花通风口 ----
  deco('megposter', 20, 5, 'tom_poster.png'); deco('megposter', 44, 5, 'tom_poster.png'); deco('photo', 50, 8)
  deco('noticeboard', 6, 30); deco('photo', 9, 17)
  deco('megposter', 57, 18, 'tom_poster.png'); deco('noticeboard', 57, 28)
  S('ventgrate', 31, 6, 1, 1, false); S('ventgrate', 31, 37, 1, 1, false); S('ventgrate', 7, 22, 1, 1, false)

  // ---- 灯光：紧凑 4 格网格（暖白光常亮——餐馆各处充分照明） ----
  for (let y = 2; y < m.h - 1; y += 4)
    for (let x = 2; x < m.w - 1; x += 4)
      if (m.tiles[idx(x, y)] === 1)
        m.lights.push({ x: x + 0.5, y: y + 0.5, r: 5, color: def.palette.light, flickerSeed: rng.next() * 100 })

  // ---- 随机 NPC（食客 ×5：来自不同团体的流浪者，mixed flavor——避难/社交） ----
  {
    const defs = genRandomNpcs(() => rng.next(), 5, 'mixed')
    m.npcDefs = defs
    const spots: [number, number][] = [
      [14, 22], // 餐厅西北桌旁
      [27, 22], // 餐厅北桌旁
      [33, 26], // 餐厅东桌旁
      [15, 30], // 餐厅西南桌旁
      [31, 30], // 餐厅南桌旁
    ]
    const shuffled = [...spots].sort(() => rng.next() - 0.5)
    defs.forEach((d, i) => {
      const [sx, sy] = shuffled[i % shuffled.length]
      ;(m.npcs ??= []).push({ id: d.id, x: X(sx) + 0.5, y: X(sy) + 0.5 })
    })
  }

  // ---- 区域名称标注（大地图用） ----
  m.zones = [
    { name: '北部入口', x: X(31), y: X(2) },
    { name: '前台', x: X(30), y: X(13) },
    { name: '餐厅', x: X(24), y: X(26) },
    { name: '厨房', x: X(47), y: X(14) },
    { name: '冷库', x: X(47), y: X(26) },
    { name: '员工区', x: X(47), y: X(33) },
    { name: '储藏间', x: X(15), y: X(13) },
    { name: '东部入口', x: X(60), y: X(21) },
    { name: '西部入口', x: X(2), y: X(21) },
  ]
  // ============ v54：设计模式重制（玩家导出 2026-08-10T13:53:28.172Z；零差异校验 .check/diff-verify.mts）============
  applyDesignPatch(m, rng, 'mixed', {
    // tiles 开合（63 格；2=墙 1=地板）
    tiles: [[8,6,2],[71,7,1],[71,8,1],[71,9,1],[19,11,2],[34,11,1],[42,11,1],[57,11,1],[19,12,2],[34,12,1],[42,12,1],[57,12,1],[19,13,2],[34,13,1],[42,13,1],[57,13,1],[49,15,1],[50,15,1],[51,15,1],[52,15,1],[53,15,1],[49,16,1],[50,16,1],[51,16,1],[52,16,1],[53,16,1],[25,18,1],[26,18,1],[27,18,1],[28,18,1],[65,19,1],[66,19,1],[67,19,1],[65,20,1],[66,20,1],[67,20,1],[37,21,1],[38,21,1],[37,22,1],[38,22,1],[37,23,1],[38,23,1],[37,24,1],[38,24,1],[12,31,1],[13,31,1],[12,32,1],[13,32,1],[12,34,1],[13,34,1],[49,42,1],[50,42,1],[51,42,1],[52,42,1],[53,42,1],[29,43,1],[31,43,1],[29,44,1],[31,44,1],[71,46,1],[71,47,1],[71,48,1],[8,49,2]],
    // 结构删除 ×4
    structDel: [
      'dtable@18,40,1x1',
      'dtable@23,40,1x1',
      'planter@46,40,1x1',
      'bench@15,40,1x1',
    ],
    // 结构新增 ×4（deg 落地为 data.deg；其余 data 原样透传）
    structAdd: [
      {"kind":"dtable","x":21,"y":40,"w":1,"h":1,"solid":true},
      {"kind":"dtable","x":26,"y":40,"w":1,"h":1,"solid":true},
      {"kind":"planter","x":43,"y":40,"w":1,"h":1,"solid":true},
      {"kind":"bench","x":16,"y":40,"w":1,"h":1,"solid":true},
    ],
    randSlots: [[34.5,28.5,0],[39.5,38.5,0],[18.5,28.5,0],[41.5,33.5,0],[19.5,38.5,0]], // 随机居民槽（含新增；按 npcDefs 顺序）
  })
  return [{ cx: X(31), cy: X(3) }]
}


// ============ 办公区EL3A（BNTG 物流中转站，id 105）：真多层双层据点（v46 重排）——
// 第一层=大开间仓库：西侧约 60% 为无楼板挑高中庭（托盘/货架/壁挂斜照灯），
// 东侧约 40% 被夹楼覆盖（夹楼下=装卸区）；第二层=东侧一整片夹楼办公区
// （临中庭走廊 + 档案室/休息室/主任办公室/南办公区，up 楼板单侧整铺约 40%，不再环带绕中庭），
// 两部带实心扶手的真阶梯（踏步 + 落地平滑斜面）上下。多层为手工铺设：
// up 楼板东侧整块、upWall 办公室隔墙、stair 坡道（stampStairRun）；跨层连通由 outpost-smoke 的 bfs3D 校验。
// v46 真多层规则：灯具全部贴天花/楼板底/墙（无悬空灯）；柱子只在夹楼下且顶到楼板底；
// 挑高顶与夹楼天花拉平（5.6m，不再错层漂浮）；楼板底面独立吊顶纹理。 ============
function genEl3aOutpost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const X = (v: number) => Math.round(v * K)
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0); y <= X(y1); y++) for (let x = X(x0); x <= X(x1); x++) floor(x, y)
  }
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], tint = 0) => {
    const [ax, ay, bx, by] = [X(x0), X(y0), X(x1), X(y1)]
    for (let x = ax; x <= bx; x++) { wall(x, ay); wall(x, by) }
    for (let y = ay; y <= by; y++) { wall(ax, y); wall(bx, y) }
    for (let y = ay + 1; y <= by - 1; y++) for (let x = ax + 1; x <= bx - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      const dx = X(odx), dy = X(ody)
      floor(dx, dy)
      const sx = dx === ax ? -1 : dx === bx ? 1 : 0
      const sy = dy === ay ? -1 : dy === by ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = dx + i * sx, ty = dy + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
    if (tint) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) m.tint[idx(x, y)] = tint
  }
  // v46：多层部分全部直接以地图坐标书写（S/SU/L/LU/LW/NPC 的 M 后缀族），避免设计坐标×K 与 map 坐标混用
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: X(x), y: X(y), w, h, solid, data })
  const SM = (kind: StructKind, mx: number, my: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: mx, y: my, w, h, solid, data })
  // 上层结构（夹楼家具/栏杆）：floor=1，渲染层抬升 FLOOR_H，碰撞只挡上层
  const SU = (kind: StructKind, mx: number, my: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: mx, y: my, w, h, solid, floor: 1, data })
  const deco = (kind: 'noticeboard' | 'megposter' | 'photo', x: number, y: number, tex?: string) => {
    const tx = X(x), ty = X(y)
    if (m.tiles[idx(tx, ty)] !== 1) return
    // 实心面（砌墙或虚空）皆可挂——未砌的虚空瓦片在渲染层同样立起墙盒
    const w = (dx: number, dy: number) => m.tiles[idx(tx + dx, ty + dy)] !== 1
    if (!w(1, 0) && !w(-1, 0) && !w(0, 1) && !w(0, -1)) return
    if ((w(1, 0) && w(-1, 0)) || (w(0, 1) && w(0, -1))) return
    S(kind, x, y, 1, 1, false, tex ? { tex } : undefined)
  }
  const L = (x: number, y: number, r = 5, color = def.palette.light) =>
    m.lights.push({ x: X(x) + 0.5, y: X(y) + 0.5, r, color, flickerSeed: rng.next() * 100 })
  const LM = (mx: number, my: number, r = 5, color = def.palette.light) =>
    m.lights.push({ x: mx + 0.5, y: my + 0.5, r, color, flickerSeed: rng.next() * 100 })
  // 上层灯（z=FLOOR_H：灯具挂在夹楼天花板 5.55，贴上层顶）
  const LU = (mx: number, my: number, r = 4.5, color = def.palette.light) =>
    m.lights.push({ x: mx + 0.5, y: my + 0.5, r, color, flickerSeed: rng.next() * 100, z: FLOOR_H })
  // 壁灯配套光源（fixZ=2.35 贴墙、noFix=灯具模型由 walllamp 结构提供——挑高区不用悬空吊灯）
  const LW = (mx: number, my: number, r = 6.5, color = '#f4eede') =>
    m.lights.push({ x: mx + 0.5, y: my + 0.5, r, color, flickerSeed: rng.next() * 100, fixZ: 2.35, noFix: 1 })
  const NPC = (id: string, x: number, y: number) =>
    (m.npcs ??= []).push({ id, x: X(x) + rng.int(-1, 1) * 0.2, y: X(y) + rng.int(-1, 1) * 0.2 })
  const NPCM = (id: string, mx: number, my: number, fl: 0 | 1 = 0) =>
    (m.npcs ??= []).push({ id, x: mx + 0.5 + rng.int(-1, 1) * 0.2, y: my + 0.5 + rng.int(-1, 1) * 0.2, floor: fl })

  // ---- 地面层骨架：北迎宾廊 + 两侧办公间 + 大开间仓库 + 东/西门廊 ----
  carve(30, 1, 34, 9) // 迎宾廊（北入口 → 仓库北缘）
  room(24, 2, 29, 7, [[29, 4]]) // 物流办公室——门东接迎宾廊
  room(35, 2, 40, 7, [[35, 4]]) // 兑换间——门西接迎宾廊
  carve(10, 9, 54, 48) // 仓库大厅（大开间；地图坐标 x13..68 × y11..60）
  carve(54, 26, 62, 30) // 东门廊
  carve(1, 26, 10, 30) // 西门廊
  m.exits.push({ def: def.exits[0], x: X(32), y: X(1), discovered: true })
  m.exits.push({ def: def.exits[1], x: X(62), y: X(28), discovered: false })
  m.exits.push({ def: def.exits[2], x: X(1), y: X(28), discovered: false })
  m.spawn = { x: X(32), y: X(3) }

  // ---- 物流办公室（主管麦考利：运单登记簿 + 档案架） ----
  S('desk', 25, 3); S('libshelf', 27, 3); S('officechair', 25, 4, 1, 1, false); S('table', 26, 5, 2, 1)
  S('walltv', 25, 4, 1, 1, false) // v54：挂式平板电视（西墙——贴面=办公室西墙）
  deco('megposter', 28, 3, 'bntg_poster.png'); deco('noticeboard', 24, 5)
  L(26, 4); NPC('mccauley', 26, 4)
  // v54：墙体窗（物流办公室南墙——与挑高仓库互视；内隔墙，顶高=挑高顶 5.6）
  m.tiles[9 * m.w + 33] = 1 // 雕成地板（渲染层该格不再立墙盒）
  SM('wallwindow', 33, 9, 1, 1, true, { deg: 90, topH: 5.6 })
  // ---- 兑换间（维斯珀：柜台 + 货架；直销价兑换 + 免费救济；门线 y5 留空——正前方放实心桌会被孤岛回填成墙） ----
  S('desk', 36, 3); S('binshelf', 38, 3, 2, 1); S('table', 37, 5, 2, 1)
  deco('megposter', 39, 3, 'bntg_poster.png')
  L(37, 5); NPC('vesper', 37, 6)

  // ================= 多层骨架（全部地图坐标） =================
  const WX0 = X(10), WX1 = X(54), WY0 = X(9), WY1 = X(48) // 仓库矩形 x13..68 × y11..60
  const MY0 = 41 // 夹楼北缘（v48：南侧整片 x13..68 × y41..60 = 56×20 = 仓库的 40%，单侧）
  // ---- 夹楼（第二层）：南侧整片楼板（x13..68 × y41..60），北/中约 60% 留作挑高中庭 ----
  for (let y = MY0; y <= WY1; y++)
    for (let x = WX0; x <= WX1; x++) m.up[idx(x, y)] = 1
  // 两部扶手阶梯（中庭南缘 +y 上坡，落夹楼北缘走廊；坡道上半段自动并入上层可站面）
  stampStairRun(m, 20, 36, 3, 5) // A：西段 (20,36..40) 爬 5 格，落走廊 (20,41)
  stampStairRun(m, 60, 36, 3, 5) // B：东段 (60,36..40) 爬 5 格，落走廊 (60,41)
  // 办公室隔墙（upWall）：北走廊 y41..43 贯通东西；房间带 y45..60 以纵墙 x27/x41/x55 分四区，
  // 横墙 y44 作各区北墙——档案室(门 x20) / 休息室(门 x34) / 主任办公室(门 x48) / 值班办公区(门 x61)
  const UW = (x: number, y: number) => { m.upWall[idx(x, y)] = 1 }
  for (let x = WX0; x <= WX1; x++) if (![20, 34, 48, 61].includes(x)) UW(x, 44)
  for (const wx of [27, 41, 55]) for (let y = 44; y <= WY1; y++) UW(wx, y)
  // ---- 阶梯扶手（v46 实心化——细条碰撞盒真实阻挡；v49 斜扶手——随坡道倾斜，让开坡道与落梯口） ----
  // 坡道常量：两部阶梯 dir=3（+y 上坡）各 5 格（y36..40），每格爬升 FLOOR_H/5=0.6；落夹楼北缘 (20,41)/(60,41)。
  // data.h0/h1=坡道面在扶手瓦片局部 -x/+x 端的高度（相对结构底座：floor=0 → 地面 0，floor=1 → 上层地板 3.0，可为负）：
  // 西排 deg=90（面东）：本地 -x 端=世界南=坡道高端；东排 deg=270（面西）：本地 +x 端=世界南=高端
  const STAIR_RISE = FLOOR_H / 5 // 阶梯每格爬升 0.6（stampStairRun stepCm=60）
  const railS = (mx: number, my: number, deg: number, fl: 0 | 1, lo: number, hi: number) => {
    const base = fl === 1 ? FLOOR_H : 0
    const [h0, h1] = deg === 90 ? [hi - base, lo - base] : [lo - base, hi - base]
    m.structures.push({
      kind: 'handrail', x: mx, y: my, w: 1, h: 1, solid: true,
      ...(fl === 1 ? { floor: 1 } : {}),
      data: { deg, h0: +h0.toFixed(2), h1: +h1.toFixed(2) },
    })
  }
  for (let k = 0; k < 5; k++) {
    const sy = 36 + k, lo = STAIR_RISE * k, hi = STAIR_RISE * (k + 1)
    const fl = (sy >= 39 ? 1 : 0) as 0 | 1 // 1F 坡道段 y36..38（贴坡道外缘）/ 2F 楼梯口侧挡段 y39..40（碰撞只挡上层）
    railS(19, sy, 90, fl, lo, hi); railS(21, sy, 270, fl, lo, hi) // A 西阶梯两侧（deg 指向坡道）
    railS(59, sy, 90, fl, lo, hi); railS(61, sy, 270, fl, lo, hi) // B 东阶梯两侧
  }
  // （夹楼北缘 y41 的临中庭栏杆由渲染层自动临边栏杆 + 碰撞层 up=0 拦截共同保证，不另铺实心扶手；
  // 落梯口 (20,41)/(60,41) 两侧已被楼梯口侧挡护住；斜扶手逐级衔接——底端 1.0m 平接地面、顶端 1.0m 平接夹楼栏杆）

  // ---- 夹楼房间（2F；SU=floor=1 上层家具，门线正前方留空） ----
  // 档案室（x13..26 × y45..60，门 (20,44)）：书架墙 + 储物架 + 登记桌
  for (const ly of [46, 48, 50, 52, 54, 56]) SU('libshelf', 13, ly)
  for (const lx of [16, 17, 18, 19, 20, 21]) SU('libshelf', lx, 59)
  SU('binshelf', 15, 46, 2, 1); SU('desk', 23, 50); SU('officechair', 23, 51, 1, 1, false)
  SU('megposter', 26, 48, 1, 1, false, { tex: 'bntg_poster.png' }); SU('noticeboard', 26, 52) // v54e：贴东隔断墙（原贴西缘——2F 板边无墙浮空）
  LU(17, 50); LU(23, 55)
  // 休息室（x28..40 × y45..60，门 (34,44)）：桌椅多套 + 自动售货机 + 长椅（全部面朝公共区——
  // 售货机/长椅贴南墙、deg 180 面朝北，不再正面对着墙；老会计科瓦尔斯基常驻）
  SU('table', 30, 47, 2, 1); SU('officechair', 30, 48, 1, 1, false); SU('officechair', 31, 46, 1, 1, false)
  SU('table', 36, 53, 2, 1); SU('officechair', 36, 54, 1, 1, false); SU('officechair', 37, 52, 1, 1, false)
  SU('vending', 29, 60, 1, 1, true, { deg: 180 }); SU('bench', 33, 60, 1, 1, true, { deg: 180 }); SU('bench', 35, 60, 1, 1, true, { deg: 180 })
  LU(31, 50, 5); LU(37, 50, 5)
  NPCM('kowalski', 34, 50, 1)
  // 主任办公室（x42..54 × y45..60，门 (48,44)）：运营主任惠特菲尔德（调度台 + 会议角）
  SU('desk', 51, 58); SU('officechair', 51, 59, 1, 1, false)
  SU('libshelf', 53, 46); SU('libshelf', 53, 48)
  SU('table', 44, 58, 2, 1); SU('officechair', 44, 57, 1, 1, false); SU('officechair', 45, 57, 1, 1, false)
  LU(48, 50); LU(51, 55)
  NPCM('whitfield', 48, 52, 1)
  // 值班办公区（x56..68 × y45..60，门 (61,44)）：开放工位 ×3 + 值班铺（床完全在室内，不嵌墙不悬空）
  SU('desk', 58, 47); SU('desk', 62, 47); SU('desk', 66, 47)
  SU('officechair', 58, 48, 1, 1, false); SU('officechair', 62, 48, 1, 1, false); SU('officechair', 66, 48, 1, 1, false)
  SU('bunkbed', 66, 58, 1, 2)
  SU('megposter', 56, 50, 1, 1, false, { tex: 'bntg_poster.png' }) // v54e：贴西隔断墙（原贴东缘——2F 板边无墙浮空）
  LU(58, 53); LU(64, 53)
  // 走廊灯（上层天花）
  LU(17, 42, 4); LU(32, 42, 4); LU(48, 42, 4); LU(63, 42, 4)

  // ---- 仓库（第一层）：全部装饰，非 loot——据点铁律 ----
  // 承重柱只在夹楼下方（顶到楼板底 2.65，真支撑柱；挑高中庭一根不立）
  for (const px of [21, 33, 45, 57]) for (const py of [46, 54]) SM('pillar', px, py)
  // 装卸区（南侧夹楼下 y41..60）：货架排 + 托盘堆（中央南北通道 x34..44 与楼梯通道留空）
  SM('binshelf', 15, 43, 2, 1); SM('binshelf', 19, 43, 2, 1); SM('binshelf', 24, 43, 2, 1)
  SM('binshelf', 49, 43, 2, 1); SM('binshelf', 53, 43, 2, 1)
  SM('binshelf', 15, 57, 2, 1); SM('binshelf', 19, 57, 2, 1); SM('binshelf', 52, 57, 2, 1); SM('binshelf', 56, 57, 2, 1)
  SM('pallet', 17, 48); SM('pallet', 22, 52); SM('pallet', 28, 58); SM('pallet', 50, 48); SM('pallet', 55, 52); SM('pallet', 60, 58)
  SM('debrispile', 30, 50, 1, 1, false); SM('debrispile', 45, 58, 1, 1, false)
  // 中庭（y11..40 挑高大开间）：货架块 + 托盘堆（主通道 x38..44 与两部楼梯通道 x19..21/x59..61 留空；
  // 北排歇脚区旁一列让开，by=33 排只放中央两列避开楼梯接近段）
  for (const bx of [15, 24, 46, 55])
    for (const by of [14]) {
      SM('binshelf', bx, by, 2, 1); SM('binshelf', bx + 3, by, 2, 1)
      SM('pallet', bx, by + 2); SM('pallet', bx + 2, by + 3); SM('pallet', bx + 4, by + 2)
      SM('debrispile', bx + 5, by + 2, 1, 1, false)
    }
  for (const bx of [15, 24, 33, 46, 55])
    for (const by of [24]) {
      SM('binshelf', bx, by, 2, 1); SM('binshelf', bx + 3, by, 2, 1) // 顶排货架
      SM('pallet', bx, by + 2); SM('pallet', bx + 2, by + 3); SM('pallet', bx + 4, by + 2) // 木托盘堆
      SM('debrispile', bx + 5, by + 2, 1, 1, false) // 建材碎料堆
    }
  for (const bx of [26, 33]) { // 南排（楼梯通道 x19..21 / x59..61 与安全线 x40 留空）
    SM('binshelf', bx, 33, 2, 1); SM('binshelf', bx + 3, 33, 2, 1)
    SM('pallet', bx, 35); SM('pallet', bx + 2, 36); SM('pallet', bx + 4, 35)
    SM('debrispile', bx + 5, 35, 1, 1, false)
  }
  // 歇脚区（迎宾廊口西侧：长椅面东朝廊道 + 桌子，跑单的在此喘口气）
  SM('bench', 36, 12, 1, 1, true, { deg: 90 }); SM('table', 34, 14, 2, 1); SM('trashbin', 35, 12)
  deco('megposter', 20, 9, 'bntg_poster.png'); deco('noticeboard', 36, 9); deco('megposter', 48, 9, 'el3a_poster.png')
  // 地面黄色安全线（主通道导引贴花，自迎宾廊口一路铺向夹楼北缘）
  for (let y = 13; y <= 39; y++) SM('photo', 40, y, 1, 1, false, { flat: 1, tex: 'el3a_safeline.png', deg: 90 })
  // 仓库工作人员
  NPCM('pidge', 28, 20) // 分拣员皮奇（中庭分拣区）
  NPCM('boone', 40, 50) // 搬运工布恩（装卸区中央通道）

  // ---- 灯光（v46 贴附规则：每盏灯都有实体灯具贴着天花/楼板底/墙） ----
  // 挑高中庭：壁挂斜照大灯（walllamp 结构 + fixZ 光源）洗墙 + v49 挑高顶高顶灯直照地面（见下方挑高标记后）
  for (const [wx, wy] of [[13, 16], [13, 26], [13, 32], [68, 16], [68, 26], [68, 32], [24, 11], [32, 11], [56, 11]] as const) {
    SM('walllamp', wx, wy, 1, 1, false) // 壁挂斜照大灯（贴墙灯箱向下投光）
    LW(wx, wy)
  }
  // 装卸区（南侧夹楼下）：网格灯贴楼板底 2.65（渲染层缺省贴附规则自动落到 slab 底）
  for (const [lx, ly] of [[17, 45], [28, 45], [38, 45], [49, 45], [59, 45], [17, 52], [28, 52], [38, 52], [49, 52], [59, 52], [17, 58], [26, 58], [38, 58], [49, 58], [59, 58]] as const)
    LM(lx, ly, 5)
  // 迎宾廊/东西门廊（L 走设计坐标）
  L(32, 6, 5); L(58, 28, 5); L(6, 28, 5)

  // ---- 随机 NPC（仓储物流风味 ×3，v46 'el3a' flavor——不再与 Tom 餐馆的 mixed 共用） ----
  {
    const defs = genRandomNpcs(() => rng.next(), 3, 'el3a')
    m.npcDefs = defs
    const spots: [number, number][] = [
      [37, 13], // 歇脚区旁
      [26, 20], // 中庭货架区
      [44, 50], // 装卸区中央通道
    ]
    const shuffled = [...spots].sort(() => rng.next() - 0.5)
    defs.forEach((d, i) => {
      const [sx, sy] = shuffled[i % shuffled.length]
      ;(m.npcs ??= []).push({ id: d.id, x: sx + 0.5, y: sy + 0.5 }) // spots 为地图坐标（不再乘 K）
    })
  }

  // ---- 中庭挑高（仓库内无楼板区域顶部拉高——v46 起与夹楼天花拉平 5.6m，不再错层漂浮） ----
  for (let y = WY0; y <= WY1; y++)
    for (let x = WX0; x <= WX1; x++)
      if (m.up[idx(x, y)] === 0) m.ceiling[idx(x, y)] = 1

  // ---- v49 挑高顶高顶灯（仓库太暗补光）：大半径暖白灯（r=9）挂挑高顶 5.6——
  // hanglight 吊线灯具贴挑高真实顶（hangingCeil 取 tallCeilH），配套光源 fixZ=5.32（灯管高度）+ noFix
  // （灯具模型由结构提供，不悬空）；网格 5×3 覆盖中庭，让 1F 挑高仓库地面/货架清晰可读 ----
  for (const hy of [16, 25, 34])
    for (const hx of [20, 30, 40, 50, 60]) {
      const hti = idx(hx, hy)
      if (m.tiles[hti] !== 1 || m.ceiling[hti] !== 1 || m.up[hti] === 1 || (m.stair[hti] & 7) !== 0) continue
      SM('hanglight', hx, hy, 1, 1, false) // 高顶灯灯具（吊线贴挑高顶，非实心——悬在 5.1m 不挡路）
      m.lights.push({ x: hx + 0.5, y: hy + 0.5, r: 9, color: '#fff2d8', flickerSeed: rng.next() * 100, fixZ: 5.32, noFix: 1 })
    }

  // ---- 区域名称标注（z=1 的标注只在上层视图显示） ----
  // v54：顺势补矩形范围（x0/y0/x1/y1=房间实际边界，HUD 矩形内优先显示；不改任何生成逻辑）
  m.zones = [
    { name: '北部入口', x: X(32), y: X(2), x0: 38, y0: 1, x1: 43, y1: 11 }, // 迎宾廊
    { name: '物流办公室', x: X(26), y: X(5), x0: 30, y0: 3, x1: 36, y1: 9 },
    { name: '兑换间', x: X(37), y: X(5), x0: 44, y0: 3, x1: 50, y1: 9 },
    { name: '歇脚区', x: 37, y: 13, x0: 30, y0: 12, x1: 45, y1: 16 }, // 仓库北缘一带
    { name: '仓库中庭（1F）', x: 34, y: 24, x0: 13, y0: 17, x1: 68, y1: 40 },
    { name: '装卸区（1F·南侧夹楼下）', x: 40, y: 50, x0: 13, y0: 41, x1: 68, y1: 60 },
    { name: '东部入口', x: X(61), y: X(28), x0: 68, y0: 33, x1: 78, y1: 38 }, // 东门廊
    { name: '西部入口', x: X(2), y: X(28), x0: 1, y0: 33, x1: 13, y1: 38 }, // 西门廊
    { name: '夹楼走廊（2F）', x: 40, y: 42, z: 1, x0: 13, y0: 41, x1: 68, y1: 44 },
    { name: '档案室（2F）', x: 20, y: 52, z: 1, x0: 13, y0: 45, x1: 26, y1: 60 },
    { name: '休息室（2F）', x: 34, y: 52, z: 1, x0: 28, y0: 45, x1: 40, y1: 60 },
    { name: '主任办公室（2F）', x: 48, y: 52, z: 1, x0: 42, y0: 45, x1: 54, y1: 60 },
    { name: '值班办公区（2F）', x: 62, y: 52, z: 1, x0: 56, y0: 45, x1: 68, y1: 60 },
  ]
  m.floors = 2 // 双层据点（跳过 applyMultiFloor 的自动多层——这里全部手工铺好）
  return [{ cx: X(32), cy: X(3) }]
}

// ============ Level 274「杰瑞的房间」（v45，id 274；设定：wikidot trimmed:level-274） ============
// 布局：北入口廊 → 前厅（信众海报）→ 教堂风巨大穹顶主间（挑高 ceiling=1 + domering 穹顶结构件，
// 杰瑞栖木居中立 perch，鹉主 Entity 7 栖息其上）；两名侍立信众在主间迎候。
// v47 教堂细化：主间长椅排/讲坛/烛台/圣水盆/蓝色彩玻窗（glasswin data.stain='blue'）；
// 西侧告解室（双隔间）、东侧祭衣间·圣器室、南侧信徒居住区（一排小间：床/小桌/烛灯）；
// 固定 NPC 增青鸟神父/辛克莱·贝克特 + 3 名随机信众（jerryFollowerDef 池，不主动传教——
// 主动传教仅野外 L2 宣传间信众，见 engine）。
// 全层 tint=17 蓝白圣辉；唯一出口=北入口「返回」（dest back；教化规则见 engine.takeExit）。
function genJerryRoom(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const X = (v: number) => Math.round(v * K)
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0); y <= X(y1); y++) for (let x = X(x0); x <= X(x1); x++) floor(x, y)
  }
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], tint = 0) => {
    const [ax, ay, bx, by] = [X(x0), X(y0), X(x1), X(y1)]
    for (let x = ax; x <= bx; x++) { wall(x, ay); wall(x, by) }
    for (let y = ay; y <= by; y++) { wall(ax, y); wall(bx, y) }
    for (let y = ay + 1; y <= by - 1; y++) for (let x = ax + 1; x <= bx - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      const dx = X(odx), dy = X(ody)
      floor(dx, dy)
      const sx = dx === ax ? -1 : dx === bx ? 1 : 0
      const sy = dy === ay ? -1 : dy === by ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = dx + i * sx, ty = dy + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
    if (tint) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) m.tint[idx(x, y)] = tint
  }
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: X(x), y: X(y), w, h, solid, data })
  const deco = (kind: 'noticeboard' | 'megposter' | 'photo', x: number, y: number, tex?: string) => {
    const tx = X(x), ty = X(y)
    if (m.tiles[idx(tx, ty)] !== 1) return
    const w = (dx: number, dy: number) => m.tiles[idx(tx + dx, ty + dy)] !== 1
    if (!w(1, 0) && !w(-1, 0) && !w(0, 1) && !w(0, -1)) return
    if ((w(1, 0) && w(-1, 0)) || (w(0, 1) && w(0, -1))) return
    S(kind, x, y, 1, 1, false, tex ? { tex } : undefined)
  }
  // v47：灯具可选 fixZ/noFix（穹顶圣辉盘等高位灯具——贴真实安装高度，灯具模型由结构件提供）
  const L = (x: number, y: number, r = 5, color = def.palette.light, opts?: { fixZ?: number; noFix?: 1 }) =>
    m.lights.push({ x: X(x) + 0.5, y: X(y) + 0.5, r, color, flickerSeed: rng.next() * 100, ...opts })
  const NPC = (id: string, x: number, y: number) =>
    (m.npcs ??= []).push({ id, x: X(x) + rng.int(-1, 1) * 0.2, y: X(y) + rng.int(-1, 1) * 0.2 })

  // ---- 骨架：北入口廊 → 前厅 → 主间（教堂大厅）；西翼告解室、东翼祭衣间、南侧信徒居住区 ----
  carve(30, 1, 33, 9) // 入口廊（北入口 → 前厅）
  room(22, 9, 41, 17, [[32, 9], [32, 17]]) // 前厅——北门接入口廊、南门接主间
  room(12, 18, 51, 47, [[32, 18], [20, 47], [44, 47]]) // 主间——北门接前厅、两南门接居住区走廊
  m.exits.push({ def: def.exits[0], x: X(32), y: X(1), discovered: true })
  m.spawn = { x: X(32), y: X(3) }

  // ---- 主间：挑高穹顶 + 杰瑞栖木 + 侍立信众 ----
  // 挑高（ceiling=1）：主间全部地板——教堂风巨大穹顶（渲染层 wallH×1.75）
  for (let y = X(18); y <= X(47); y++)
    for (let x = X(12); x <= X(51); x++)
      if (m.tiles[idx(x, y)] === 1) m.ceiling[idx(x, y)] = 1
  // 穹顶结构件：同心环形肋 + 放射拱肋 + 顶心圣辉盘（非实心，整体一件置于大厅中央）
  S('domering', 32, 32, 1, 1, false, { r: 16, apex: 5.1 })
  // 杰瑞的栖木（居中立 perch；鹉主 Entity 7 栖息于横杆上）
  S('perch', 32, 32)
  m.entities.push(makeEntity('jerry', X(32) + 0.5, X(32) + 0.5, 0.55)) // 鹉主：stationary 栖木上，无害
  // 讲坛（栖木北侧，面向长椅会众）+ 栖木两侧烛台 + 入口处圣水盆一对
  S('pulpit', 32, 26)
  S('candlestand', 30, 31, 1, 1, false); S('candlestand', 34, 31, 1, 1, false)
  S('candlestand', 30, 33, 1, 1, false); S('candlestand', 34, 33, 1, 1, false)
  S('holyfont', 28, 20, 1, 1, true); S('holyfont', 36, 20, 1, 1, true)
  // 长椅排（教堂条凳，东西两区面向栖木；中央走道留空直通讲坛与栖木）
  for (const py of [30, 33, 36, 39, 42, 45]) {
    S('bench', 20, py, 1, 1, true, { deg: 90 }); S('bench', 24, py, 1, 1, true, { deg: 90 })
    S('bench', 40, py, 1, 1, true, { deg: 270 }); S('bench', 44, py, 1, 1, true, { deg: 270 })
  }
  // 蓝色彩玻窗（东西墙各五扇，蓝白彩玻透圣辉）+ jerry 圣像/海报墙
  for (const wy of [21, 27, 33, 39, 45]) {
    S('glasswin', 13, wy, 1, 1, true, { stain: 'blue' })
    S('glasswin', 50, wy, 1, 1, true, { stain: 'blue' })
  }
  deco('megposter', 26, 19, 'jerry_poster.png'); deco('megposter', 38, 19, 'jerry_poster.png')
  deco('megposter', 13, 24, 'jerry_poster.png'); deco('megposter', 13, 40, 'jerry_poster.png')
  deco('megposter', 50, 24, 'jerry_poster.png'); deco('megposter', 50, 40, 'jerry_poster.png')
  deco('megposter', 24, 46, 'jerry_poster.png'); deco('megposter', 40, 46, 'jerry_poster.png')
  // 侍立信众（主间两侧迎候；传教委托发放/交付人）+ 青鸟神父（讲坛旁）+ 辛克莱（长椅区静修）
  NPC('zeph', 29, 30)
  NPC('polly', 35, 30)
  NPC('bluebird', 32, 29)
  NPC('sinclair', 38, 43)

  // ---- 前厅：宣传海报 + 告示 ----
  deco('megposter', 23, 11, 'jerry_poster.png'); deco('megposter', 40, 11, 'jerry_poster.png')
  deco('megposter', 23, 15, 'jerry_poster.png'); deco('megposter', 40, 15, 'jerry_poster.png')
  deco('noticeboard', 32, 16)
  S('bench', 24, 15); S('planter', 39, 15)

  // ---- 西翼：告解室（忏悔位 + 神父位双隔间，各自开门入主间）----
  room(3, 20, 11, 23, [[11, 22]]) // 忏悔位
  room(3, 25, 11, 28, [[11, 26]]) // 神父位
  S('bench', 5, 21, 1, 1, true, { deg: 90 }); S('holyfont', 9, 21)
  S('bench', 5, 26, 1, 1, true, { deg: 90 }); S('candlestand', 9, 27, 1, 1, false)
  deco('megposter', 4, 22, 'jerry_poster.png'); deco('noticeboard', 9, 27)

  // ---- 东翼：祭衣间·圣器室（祭衣台/圣器架/长桌；据点铁律——禁用 loot 容器）----
  room(52, 38, 59, 45, [[52, 41]])
  S('kcounter', 58, 39); S('kcounter', 58, 40) // 祭衣台（叠放礼服的橱柜长台）
  S('binshelf', 58, 42); S('binshelf', 58, 43) // 圣器架
  S('table', 54, 40, 1, 2); S('bench', 53, 43, 1, 1, true, { deg: 270 })
  S('candlestand', 56, 44, 1, 1, false)
  deco('megposter', 57, 44, 'jerry_poster.png')

  // ---- 南侧：信徒居住区（走廊 + 一排小间——每间床/小桌/烛灯）----
  carve(14, 49, 49, 50) // 居住区走廊（接主间两南门）
  const CELL_DOORS: [number, number, number][] = [[14, 19, 17], [21, 26, 24], [28, 33, 31], [35, 40, 38], [42, 47, 45]]
  for (const [cx0, cx1, cdoor] of CELL_DOORS) {
    room(cx0, 52, cx1, 57, [[cdoor, 52]])
    S('bed', cx0 + 1, 53, 1, 2) // 小床
    S('table', cx1 - 1, 53) // 小桌
    L(cx0 + 2, 55, 3, '#ffd9a0') // 烛灯（暖光）
  }

  // ---- 随机信众（jerryFollowerDef 池：主间与居住区活动的普通信徒，不主动传教）----
  {
    const defs = [jerryFollowerDef(274, 274, 1), jerryFollowerDef(274, 274, 2), jerryFollowerDef(274, 274, 3)]
    m.npcDefs = defs
    const fspots: [number, number][] = [[22, 36], [24, 49], [44, 55]] // 主间西侧 / 居住区走廊 / 居住区小间
    defs.forEach((d, i) => { const [sx, sy] = fspots[i]; (m.npcs ??= []).push({ id: d.id, x: X(sx) + 0.5, y: X(sy) + 0.5 }) })
  }

  // ---- 灯光：圣洁蓝白——主间环绕圣辉贴挑高顶（渲染层挑高贴附规则）+ 栖木聚光在穹顶圣辉盘真实高度 ----
  L(32, 13, 5.5, '#f0ecff') // 前厅
  L(25, 13, 4.5, '#e8e4ff'); L(39, 13, 4.5, '#e8e4ff')
  // 栖木聚光：光源点取穹顶顶心圣辉盘真实高度（fixZ 5.1 → 4.9m）；灯具模型由 domering 圣辉盘提供（noFix 不画默认灯盒）
  L(32, 32, 5, '#f8f4ff', { fixZ: 5.1, noFix: 1 })
  for (const [lx, ly] of [[18, 24], [32, 22], [46, 24], [18, 40], [46, 40], [24, 44], [40, 44]] as const)
    L(lx, ly, 6, '#dfe4ff') // 主间环绕圣辉（挑高瓦片——挂到穹顶真实高度，不按普通层高悬空）
  L(32, 5, 4.5, '#f0ecff') // 入口廊
  L(7, 22, 3, '#ffd9a0'); L(7, 26, 3, '#ffd9a0') // 告解室烛灯
  L(56, 41, 4, '#f0ecff') // 祭衣间
  L(20, 49, 4, '#e8e4ff'); L(31, 49, 4, '#e8e4ff'); L(43, 49, 4, '#e8e4ff') // 居住区走廊

  // ---- 全层 tint=17（蓝白圣辉） ----
  for (let y = 1; y < m.h - 1; y++)
    for (let x = 1; x < m.w - 1; x++)
      if (m.tiles[idx(x, y)] === 1) m.tint[idx(x, y)] = 17

  // ---- 区域名称标注（大地图用） ----
  m.zones = [
    { name: '入口', x: X(32), y: X(2) },
    { name: '前厅', x: X(32), y: X(13) },
    { name: '主间', x: X(32), y: X(24) },
    { name: '穹顶下', x: X(32), y: X(36) },
    { name: '告解室', x: X(7), y: X(24) },
    { name: '祭衣间·圣器室', x: X(56), y: X(42) },
    { name: '信徒居住区', x: X(31), y: X(49) },
  ]
  // ============ v54：设计模式重制（玩家导出 2026-08-10T13:53:28.172Z；零差异校验 .check/diff-verify.mts）============
  applyDesignPatch(m, rng, 'meg', {
    // tiles 开合（8 格；2=墙 1=地板）
    tiles: [[39,11,1],[39,21,1],[39,22,1],[39,23,1],[26,59,1],[54,59,1],[26,60,1],[54,60,1]],
  })
  return [{ cx: X(32), cy: X(3) }]
}


// ============ M.E.G. Gamma 基地（id 106，v54）：真三层单图——首个三层据点 ============
// 设定：wikidot Level 3 条目——M.E.G. 在 Level 3 的主要根据地，位于该层最大开阔区域，持续运作中，
// 约数百名成员常年驻防。v54 引擎多层机制升级为楼层带 0|1|2（bandOfZ/up2/upWall2，见 mapgen.ts），
// Gamma 基地是首个三层地图：1F 公共部（前厅/大厅/食堂/医疗角/补给兑换处）/ 2F 住宅部（宿舍×4/
// 洗漱间/公共休息角）/ 3F 行政部（主管办公室/会议室/办公室/档案室/机房/行政办公），
// 两部 stampStairRun 坡道楼梯上下（A：东南楼梯间 1F→2F；B：东北楼梯间 2F→3F，base=FLOOR_H）。
// 布局铁律同其他据点（每个房间至少一扇门/门线正前方无实心家具/无 loot 容器与物品——禁用
// cabinet/locker/dresser 等 CONTAINER_KINDS 注册容器，一律 binshelf/libshelf 替代）；
// 多层规则（v46/v49 惯例）：坡道下段邻格不得有上一层楼板（跌井）；楼板整板覆盖=1F 天花全部
// 贴 2F 板底 2.65，2F/3F 灯挂对应层天花（z=FLOOR_H / 2×FLOOR_H）；楼梯间挑高通到屋面 8.6。
// 全部以地图坐标书写（三层对齐需要精确坐标，不做 K 放大）。
function genGammaOutpost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) floor(x, y)
  }
  // 矩形房间：四周砌墙 + 内腔雕空 + 门洞（外凿 ≤2 格门廊接上既有地板）
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], tint = 0) => {
    for (let x = x0; x <= x1; x++) { wall(x, y0); wall(x, y1) }
    for (let y = y0; y <= y1; y++) { wall(x0, y); wall(x1, y) }
    for (let y = y0 + 1; y <= y1 - 1; y++) for (let x = x0 + 1; x <= x1 - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      floor(odx, ody)
      const sx = odx === x0 ? -1 : odx === x1 ? 1 : 0
      const sy = ody === y0 ? -1 : ody === y1 ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = odx + i * sx, ty = ody + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
    if (tint) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.tint[idx(x, y)] = tint
  }
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x, y, w, h, solid, data })
  // 2F/3F 结构（floor=1/2：渲染层抬升 f×FLOOR_H，碰撞只挡对应层带）
  const SU = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x, y, w, h, solid, floor: 1, data })
  const SU2 = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x, y, w, h, solid, floor: 2, data })
  // 墙面装饰落点校验（1F）：地板 + 有实心面相邻（砌墙或虚空皆可），门洞不挂；tex 可换现有贴图
  const deco = (kind: 'noticeboard' | 'megposter' | 'photo', x: number, y: number, tex?: string) => {
    if (m.tiles[idx(x, y)] !== 1) return
    const w = (dx: number, dy: number) => m.tiles[idx(x + dx, y + dy)] !== 1
    if (!w(1, 0) && !w(-1, 0) && !w(0, 1) && !w(0, -1)) return
    if ((w(1, 0) && w(-1, 0)) || (w(0, 1) && w(0, -1))) return
    S(kind, x, y, 1, 1, false, tex ? { tex } : undefined)
  }
  const L = (x: number, y: number, r = 5, color = def.palette.light) =>
    m.lights.push({ x: x + 0.5, y: y + 0.5, r, color, flickerSeed: rng.next() * 100 })
  const L2 = (x: number, y: number, r = 4.5) => // 2F 灯：z=FLOOR_H（灯具挂 2F 天花 5.55）
    m.lights.push({ x: x + 0.5, y: y + 0.5, r, color: def.palette.light, flickerSeed: rng.next() * 100, z: FLOOR_H })
  const L3 = (x: number, y: number, r = 4.5) => // 3F 灯：z=2×FLOOR_H（灯具挂 3F 天花 8.55）
    m.lights.push({ x: x + 0.5, y: y + 0.5, r, color: def.palette.light, flickerSeed: rng.next() * 100, z: 2 * FLOOR_H })
  const NPC = (id: string, x: number, y: number, fl: 0 | 1 | 2 = 0) =>
    (m.npcs ??= []).push({ id, x: x + 0.5 + rng.int(-1, 1) * 0.2, y: y + 0.5 + rng.int(-1, 1) * 0.2, floor: fl })
  // 斜扶手（v49 随坡道倾斜）：deg=栏杆侧（0=+z 90=+x 180=-z 270=-x，贴坡道一侧），
  // lo/hi=坡道面在本瓦片低端/高端的高度（绝对值，函数内换算相对结构底座）
  const rail = (x: number, y: number, deg: number, fl: 0 | 1 | 2, lo: number, hi: number) => {
    const base = fl * FLOOR_H
    // deg 90/180 的本地 -x 端对应世界坡道高端（旋转镜像），h0/h1 按朝向换算
    const [h0, h1] = deg === 90 || deg === 180 ? [hi - base, lo - base] : [lo - base, hi - base]
    m.structures.push({
      kind: 'handrail', x, y, w: 1, h: 1, solid: true,
      ...(fl ? { floor: fl } : {}),
      data: { deg, h0: +h0.toFixed(2), h1: +h1.toFixed(2) },
    })
  }

  // ================= 地面层（1F 公共部）骨架 =================
  carve(38, 1, 41, 6) // 迎宾廊（北入口 → 前厅）
  m.exits.push({ def: def.exits[0], x: 39, y: 1, discovered: true }) // 北部入口（返回 Level 3）——全图唯一出口
  m.spawn = { x: 39, y: 4 }
  room(33, 8, 46, 15, [[39, 8], [39, 15]]) // 入口前厅——北接迎宾廊、南接大厅（v54e：东门/东北走廊取消）
  { // v54：墙体窗（前厅南墙——前厅与大厅互视；内隔墙，顶高=2F 板底；窗前凿 1 宽凹龛接通大厅）
    m.tiles[idx(36, 15)] = 1 // 雕成地板（渲染层该格不再立墙盒）
    m.tiles[idx(36, 16)] = 1; m.tiles[idx(36, 17)] = 1 // 窗前凹龛（南接大厅）
    S('wallwindow', 36, 15, 1, 1, true, { deg: 90, topH: 2.64 })
  }
  carve(10, 18, 69, 30) // 大厅（大开间）
  room(62, 9, 73, 17, [[66, 17]]) // 资料室（v54e：原楼梯间B 的 1F 改普通房间，南门接大厅；2F→3F 坡道仍悬于本间上空 3.0 以上，由 2F 平台进出）
  room(10, 33, 25, 43, [[18, 33], [15, 43]]) // 食堂——北接大厅、南接南横廊
  room(29, 36, 40, 44, [[34, 44]]) // 医疗角——南接南横廊
  room(43, 36, 54, 44, [[48, 44]]) // 补给兑换处——南接南横廊
  room(56, 32, 65, 40, [[59, 32]]) // 楼梯间A（1F→2F 坡道；北接大厅）——v54 扩大：8×7 内腔，落梯缓冲更宽
  carve(10, 45, 54, 46) // 南横廊

  // ---- 1F 家具：入口前厅（前台/长椅/公告栏/饮水机） ----
  S('frontdesk', 34, 9, 3, 1) // 前台（让开北门线 x39）
  S('bench', 44, 11); S('planter', 34, 14)
  S('vending', 34, 13) // 饮水机（西墙边，非容器）
  deco('noticeboard', 34, 11); deco('megposter', 45, 11)
  L(39, 11, 5.5)
  // ---- 大厅点缀（接待等候区长椅排/花坛/公告栏墙/标语海报/自动售货机） ----
  S('bench', 13, 20); S('bench', 13, 25); S('bench', 66, 20); S('bench', 66, 25)
  S('bench', 20, 22); S('bench', 21, 22); S('bench', 22, 22) // 等候区成排长椅 ×2 排
  S('bench', 20, 24); S('bench', 21, 24); S('bench', 22, 24)
  S('planter', 11, 19); S('planter', 68, 19); S('planter', 11, 29); S('planter', 68, 29)
  S('trashbin', 39, 21)
  S('vending', 69, 22) // 大厅东墙自动售货机（非容器装饰）
  deco('megposter', 15, 18); deco('megposter', 38, 18); deco('noticeboard', 60, 18)
  deco('megposter', 20, 18); deco('megposter', 25, 18); deco('noticeboard', 28, 18); deco('megposter', 33, 18) // 公告栏墙（北墙多幅）
  deco('megposter', 10, 24); deco('photo', 69, 24); deco('megposter', 10, 28); deco('noticeboard', 69, 28)
  // ---- 食堂（西南：餐桌 ×4 + 打饭柜台动线 + 杏仁水海报） ----
  S('dtable', 14, 35); S('dtable', 19, 35); S('dtable', 14, 39); S('dtable', 19, 39)
  S('kcounter', 15, 34, 2, 1) // 打饭柜台（让开北门线 x18）
  S('kcounter', 20, 34, 2, 1) // 第二柜台（排队动线沿北墙向东）
  S('trashbin', 23, 42) // 收残处（南墙边）
  deco('noticeboard', 11, 36); deco('megposter', 13, 36, 'poster_almond.png') // 杏仁水海报
  L(16, 38, 5.5)
  // ---- 医疗角（南翼西：病床 ×2 + 输液架 + 药品柜 + 货架隔断[隔帘感]） ----
  S('hospitalbed', 30, 38, 1, 2); S('hospitalbed', 34, 38, 1, 2) // 让开南门线 x34 前方 y43
  S('binshelf', 32, 40, 1, 2) // 货架隔断（病床区与门口的视线隔断）
  S('ivstand', 38, 40, 1, 1, false); S('medcabinet', 39, 38)
  L(34, 39, 5, '#f6f8ff') // 医疗区冷白灯
  // ---- 补给兑换处（南翼东：货架 + 柜台 + 军需官布兰特） ----
  S('binshelf', 44, 38, 2, 1); S('binshelf', 44, 40, 2, 1) // 物资货架（装饰非 loot）
  S('desk', 51, 38); S('table', 46, 40, 2, 1) // 账台与兑换柜台（让开南门线 x48 前方 y43）
  deco('megposter', 53, 38)
  L(48, 39, 5.5)
  NPC('brandt', 49, 40) // 军需官：补给兑换处（v54：杏仁水计价）
  // ---- 楼梯间A 1F 点缀 ----
  S('bench', 60, 34) // 楼梯间A（让开坡道行 y36）
  deco('megposter', 57, 33) // 楼梯间A 北墙
  L(60, 34, 4.5)
  // ---- 资料室（东北，原楼梯间B 的 1F；B 坡道悬于 3.0 以上，下方正常布置。让开南门线 x66 前方 y16） ----
  S('libshelf', 63, 10); S('libshelf', 64, 10); S('libshelf', 71, 10); S('libshelf', 72, 10) // 北墙书架（x65..70 上方是 3F 井口/坡道段，留视线）
  S('libshelf', 63, 12, 1, 3) // 西墙立架
  S('table', 68, 14, 2, 1); S('officechair', 68, 15, 1, 1, false); S('officechair', 69, 15, 1, 1, false) // 阅览桌椅
  S('desk', 63, 16) // 登记台（西南角）
  deco('noticeboard', 70, 16) // 南墙公告栏

  // ================= 三层楼板（v54c 解耦重排：上层平面独立于 1F 轮廓） =================
  // 解耦要点：楼板填充不再限于 1F 地板正上方（矩形带内 1F 间墙/虚空格上方一样铺板——
  // 1F 间墙在板下止于板底[wallBaseTopAt v54c]、不再穿过上层地板）；2F/3F 房间各自独立划分。
  for (let i = 0; i < m.w * m.h; i++) if (m.tiles[i] === 1) { m.up[i] = 1; m.up2[i] = 1 }
  for (let y = 18; y <= 44; y++) for (let x = 10; x <= 69; x++) { m.up[idx(x, y)] = 1; m.up2[idx(x, y)] = 1 } // 矩形带铺满（含 1F 间墙/虚空上方）
  // 两部坡道楼梯（stampStairRun；v54c 位址：A 东移 1 格、B 东西向——起点/落点离墙净空）
  stampStairRun(m, 58, 36, 1, 5) // A：井廊（住宅部侧）内 +x 向爬 5 格（0→3.0），落 2F (63,36)
  stampStairRun(m, 65, 11, 1, 5, FLOOR_H) // B：楼梯间B 内 +x 向爬 5 格（3.0→6.0），落 3F (70,11)
  // 跌井（v46 规则：坡道下段邻格不得有上一层楼板——否则从上层直踩下段会跌落）
  for (const [wx, wy] of [[58, 35], [59, 35], [58, 37], [59, 37]] as const) m.up[idx(wx, wy)] = 0 // A 井（2F 开口）
  // v54e：A 井不再贯通 3F——3F 板填回（井道上方封顶=3F 板底，消除挑空黑洞）；2F 开口保留
  for (const [wx, wy] of [[65, 10], [66, 10], [65, 12], [66, 12]] as const) m.up2[idx(wx, wy)] = 0 // B 井（3F 开口）
  // v54e：B 井道上空封顶——井道 6 格（含坡道下段 2 格）标挑高：周墙接到屋面 8.6、井口上空画 8.6 顶板
  // （否则 2F 平台/坡道下段抬头见镂空黑洞——任务8；geometry 坡道格 v54e 分支画顶板）
  for (let y = 10; y <= 12; y++) for (let x = 65; x <= 66; x++) m.ceiling[idx(x, y)] = 1
  // v54e：楼梯间挑高取消——A 间 1F 顶=2F 板底、井口上方=3F 板底（3F 板已填回）；B 间 1F 顶=2F 平台板底（资料室正常层高）
  // v54c 挑空中庭：前厅内腔（x34..45 y9..14）上方 2F 楼板取消——1F 前厅双层挑高到 3F 板底；
  // 3F 屋面板墙（upWall2）封顶：3F 板/板墙独立于 2F 存在（解耦实证：up2/upWall2 不依赖 up）
  for (let y = 9; y <= 14; y++) for (let x = 34; x <= 45; x++) { m.up[idx(x, y)] = 0; m.upWall2[idx(x, y)] = 1 }
  for (const [ax, ay] of [[36, 16], [36, 17]] as const) { m.up[idx(ax, ay)] = 0; m.upWall2[idx(ax, ay)] = 1 } // 凹龛上方同处理（中庭延伸到窗前）
  m.up2[idx(66, 17)] = 1 // v54c：3F 板桥——B 落梯厅（楼梯间B 上方）向南接到 3F 主平面（1F 墙在板下止于板底；2F 无此板）
  m.up[idx(66, 17)] = 1 // 2F 同位板桥——B 间 2F 平台（坡道起步段）南接 2F 主平面
  // 孤岛板清理（不入上层房间计划的区域不铺板——否则成 bfs3D 不可达岛）：迎宾廊上方 + 南横廊上方 + 前厅门/窗格上方
  for (const [cx0, cy0, cx1, cy1] of [[38, 1, 41, 6], [10, 45, 54, 46]] as const)
    for (let yy = cy0; yy <= cy1; yy++) for (let xx = cx0; xx <= cx1; xx++) { m.up[idx(xx, yy)] = 0; m.up2[idx(xx, yy)] = 0 }
  for (const [ix, iy] of [[39, 7], [39, 8], [39, 15], [36, 15], [39, 16], [39, 17]] as const) { m.up[idx(ix, iy)] = 0; m.up2[idx(ix, iy)] = 0 }

  // ---- 2F/3F 墙体（各自独立划分：同网格不同功能；门洞对齐走廊） ----
  // 共用墙线：北外墙 y18 / 分带墙 y21·y25·y30·y33 / 南外墙 y44 / 东西外墙 x10·x69
  const wallRow = (a: Uint8Array, y: number, x0: number, x1: number, gaps: number[]) => {
    for (let x = x0; x <= x1; x++) if (!gaps.includes(x)) a[idx(x, y)] = 1
  }
  const wallCol = (a: Uint8Array, x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) a[idx(x, y)] = 1
  }
  for (const W of [m.upWall, m.upWall2]) { // 2F/3F 同网格墙线（各层独立划分，同格不同用）
    wallRow(W, 18, 10, 69, []); wallRow(W, 44, 10, 69, [])
    wallCol(W, 10, 18, 44); wallCol(W, 69, 18, 44)
    wallRow(W, 21, 10, 69, [17, 40, 59]) // 北带/中带间墙（门 ×3）
    wallRow(W, 25, 10, 69, [17, 40, 59])
    wallRow(W, 30, 10, 69, [20, 45, 60]) // 中带/南走廊间墙
    wallRow(W, 33, 10, 69, [17, 37, 52, 62]) // 南走廊/南带间墙（门 ×4）
    wallCol(W, 32, 19, 20); wallCol(W, 47, 19, 20) // 北带隔断
    wallCol(W, 32, 26, 29); wallCol(W, 47, 26, 29) // 中带隔断
    wallCol(W, 25, 34, 43); wallCol(W, 41, 34, 43); wallCol(W, 55, 34, 43) // 南带隔断
  }
  // 3F 墙线与 2F 同网格（上方循环一次写两层）；中庭屋面板墙已在上面设置
  m.upWall[idx(66, 18)] = 0; m.upWall2[idx(66, 18)] = 0 // 北外墙 y18 留缺：B 平台/落梯厅经板桥南接（2F/3F 各一）

  // ---- 2F 住宅部家具（SU=floor=1） ----
  // 宿舍A（x11..31 y19..20，门 (17,21)）——双层床贴北墙一排（1×1，两排房不再形成整列密封）
  SU('bunkbed', 12, 19); SU('bunkbed', 15, 19); SU('bunkbed', 19, 19); SU('bunkbed', 24, 19); SU('bunkbed', 28, 19)
  SU('libshelf', 30, 19)
  // 观景廊（x33..46 y19..20，门 (40,21)；北缘=中庭护墙，南望大厅）
  SU('bench', 35, 19); SU('bench', 44, 19); SU('trashbin', 45, 23) // 观景廊（垃圾桶放走廊——勿堵房内角落，会围出死口袋）
  // 宿舍B（x48..69 y19..20，门 (59,21)）
  SU('bunkbed', 49, 19); SU('bunkbed', 52, 19); SU('bunkbed', 55, 19); SU('bunkbed', 61, 19); SU('bunkbed', 64, 19)
  SU('desk', 67, 19); SU('officechair', 67, 20, 1, 1, false)
  NPC('mateo', 54, 19, 1) // 住户老兵马特奥（2F 宿舍B）
  // 洗漱间（x11..31 y26..29，门 (17,25)）
  SU('sink', 12, 26); SU('sink', 14, 26); SU('sink', 16, 26)
  SU('binshelf', 28, 26, 2, 1); SU('binshelf', 30, 26, 2, 1) // 晾衣/储物架
  SU('bench', 22, 28)
  // 储物间（x33..46 y26..29，门 (40,25)）
  for (const rx of [35, 37, 39, 41, 43]) SU('binshelf', rx, 26)
  SU('pallet', 36, 28); SU('pallet', 42, 28)
  // 电视娱乐室（x48..69 y26..29，门 (59,25)；v54d 挂墙电视贴南墙[deg 180]+休闲椅面向电视）
  {
    const BOOTHS: { x: number; chair: string }[] = [
      { x: 49, chair: '#b85a62' }, { x: 54, chair: '#6aa87c' }, { x: 59, chair: '#6f8cc9' },
    ]
    for (const b of BOOTHS) {
      SU('walltv', b.x, 29, 1, 1, false, { deg: 180 }) // 挂墙电视（贴南墙、屏朝北——v54c walltv 支持显式朝向）
      SU('loungechair', b.x, 26, 1, 1, false, { deg: 0, color: b.chair })
      SU('loungechair', b.x + 1, 27, 1, 1, false, { deg: 0, color: b.chair })
    }
    for (const [px, pc] of [[51, '#8a4a52'], [52, '#8a4a52'], [56, '#5a8a6a'], [57, '#5a76b8']] as const)
      SU('cubicle', px, 27, 1, 1, true, { deg: 90, color: pc }) // 彩色隔断（deg 固定朝向）
    SU('trashbin', 66, 28)
    SU('megposter', 68, 26, 1, 1, false) // 东墙 MEG 海报
  }
  NPC('meilin', 55, 23, 1) // 后勤官：2F 走廊（娱乐室门口）
  // 休闲区（x11..24 y34..43，门 (17,33)）：沙发围合 ×2 + 茶几
  SU('sofa', 14, 36, 1, 1, true, { deg: 0, color: '#5a76b8' }); SU('sofa', 14, 39, 1, 1, true, { deg: 180, color: '#5a8a6a' })
  SU('sofa', 11, 37, 1, 1, true, { deg: 90, color: '#8a4a52' }); SU('table', 14, 37)
  SU('sofa', 20, 36, 1, 1, true, { deg: 0, color: '#7a7a80' }); SU('sofa', 20, 39, 1, 1, true, { deg: 180, color: '#5a76b8' })
  SU('sofa', 23, 37, 1, 1, true, { deg: 270, color: '#5a8a6a' }); SU('table', 20, 37)
  SU('bench', 14, 42)
  // 阅览角（x26..40 y34..43，门 (37,33)）：书架阵列 + 借阅台
  for (const ry of [35, 38]) for (let rx = 27; rx <= 39; rx += 2) SU('libshelf', rx, ry, 1, 1, true, { row: 1 })
  SU('table', 30, 41, 2, 1); SU('officechair', 30, 42, 1, 1, false)
  SU('megdoc', 32, 41, 1, 1, false, { doc: 'meg_levels' })
  // 储备角（x42..54 y34..43，门 (52,33)）
  for (let rx = 43; rx <= 53; rx += 2) SU('binshelf', rx, 35)
  SU('pallet', 44, 40); SU('pallet', 50, 40)
  // 井廊（x56..68 y34..43，门 (62,33)；A 坡道落梯厅——留空坡道行 y36）
  SU('bench', 66, 34); SU('photo', 68, 34, 1, 1, false)

  // ---- 3F 行政部家具（SU2=floor=2） ----
  // 会议A（x11..31 y19..20，门 (17,21)）
  SU2('table', 13, 19, 4, 1); SU2('officechair', 13, 20, 1, 1, false); SU2('officechair', 15, 20, 1, 1, false); SU2('officechair', 16, 20, 1, 1, false)
  SU2('screenboard', 12, 19, 1, 1, false) // 投影幕（北墙——v54e：从墙行 y18 下移一格，装饰须落地板贴墙）
  // 主管办公室（x33..46 y19..20，门 (40,21)）
  SU2('desk', 38, 19); SU2('officechair', 38, 20, 1, 1, false)
  SU2('libshelf', 34, 19); SU2('libshelf', 44, 19)
  SU2('megdoc', 42, 19, 1, 1, false, { doc: 'meg_levels' }) // 层级档案
  SU2('photo', 36, 19, 1, 1, false); SU2('megposter', 39, 19, 1, 1, false) // 北墙奖牌/地图（v54e：从墙行 y18 下移一格，落地板贴墙）
  NPC('harper', 40, 19, 2) // 基地主管：3F 主管办公室
  // 会议B（x48..69 y19..20，门 (59,21)）
  SU2('table', 52, 19, 4, 1); SU2('officechair', 52, 20, 1, 1, false); SU2('officechair', 54, 20, 1, 1, false); SU2('officechair', 55, 20, 1, 1, false)
  SU2('noticeboard', 66, 18, 1, 1, false) // 白板（北墙）
  // 办公室（x11..31 y26..29，门 (17,25)）：开放工位 ×3
  SU2('desk', 12, 26); SU2('desk', 18, 26); SU2('desk', 24, 26)
  SU2('officechair', 12, 27, 1, 1, false); SU2('officechair', 18, 27, 1, 1, false); SU2('officechair', 24, 27, 1, 1, false)
  SU2('copier', 29, 26)
  // 资料室（x33..46 y26..29，门 (40,25)）
  for (const rx of [34, 36, 38, 42, 44]) SU2('libshelf', rx, 26) // v54e：跳过 x40——门 (40,25) 正前方留空
  SU2('table', 38, 28, 2, 1); SU2('officechair', 38, 29, 1, 1, false)
  // 机房（x48..69 y26..29，门 (59,25)）
  for (const rx of [49, 51, 53, 55]) SU2('serverrack', rx, 26)
  SU2('switchboard', 57, 26); SU2('switchboard', 61, 26) // v54e：x61 让开门 (59,25) 正前方
  SU2('servercase', 50, 29); SU2('servercase', 53, 29); SU2('servercase', 56, 29) // 塔式机箱沿南墙成排
  NPC('isaac', 55, 28, 2) // 研究员艾萨克（3F 机房）
  // 大档案室（x11..24 y34..43，门 (17,33)）：书架阵列 + 查找台
  for (const ry of [35, 38]) for (let rx = 11; rx <= 23; rx += 2) SU2('libshelf', rx, ry, 1, 1, true, { row: 1 })
  SU2('table', 14, 41, 2, 1); SU2('officechair', 14, 42, 1, 1, false)
  SU2('megdoc', 16, 41, 1, 1, false, { doc: 'meg_levels' })
  NPC('aurora', 16, 37, 2) // 档案员奥萝拉（3F 大档案室）
  // 档案二室（x26..40 y34..43，门 (37,33)）
  for (const ry of [35, 38]) for (let rx = 27; rx <= 39; rx += 2) SU2('libshelf', rx, ry, 1, 1, true, { row: 1 })
  // 样品库（x42..54 y34..43，门 (52,33)）
  for (let rx = 43; rx <= 53; rx += 2) SU2('binshelf', rx, 35)
  SU2('pallet', 44, 40); SU2('pallet', 50, 40)
  // 井廊（x56..68 y34..43，门 (62,33)）
  SU2('bench', 66, 34)

  // ---- 斜扶手（v49 随坡道倾斜；贴坡道两侧，让开落梯口与进坡口） ----
  // 坡道 A（+x 向，x58..62，0→3.0；v54c 东移 1 格）：两侧栏杆 y35（deg 0）/ y37（deg 180），x59..62——
  // x58 不设栏杆=1F 进坡口（从 (57,36) 入梯格踏上坡道起点）；下段（x59）floor=0、上段 floor=1
  for (let k = 1; k < 5; k++) {
    const lo = 0.6 * k, hi = 0.6 * (k + 1), fl = (k >= 2 ? 1 : 0) as 0 | 1
    rail(58 + k, 35, 0, fl, lo, hi); rail(58 + k, 37, 180, fl, lo, hi)
  }
  // 坡道 B（v54c 改 +x 向，x65..69，3.0→6.0）：两侧栏杆 y10（deg 0）/ y12（deg 180），x66..69——
  // x65 不设栏杆=2F 进坡口（从 (64,11) 入梯格踏上）；下段 floor=1、上段 floor=2
  for (let k = 1; k < 5; k++) {
    const lo = FLOOR_H + 0.6 * k, hi = FLOOR_H + 0.6 * (k + 1), fl = (k >= 2 ? 2 : 1) as 1 | 2
    rail(65 + k, 10, 0, fl, lo, hi); rail(65 + k, 12, 180, fl, lo, hi)
  }

  // ---- 随机居民 ×4（v54 扩容并分层：1F 大厅/食堂 + 2F 走廊 + 3F 走廊，meg 风味） ----
  {
    const defs = genRandomNpcs(() => rng.next(), 4)
    m.npcDefs = defs
    const spots: [number, number, 0 | 1 | 2][] = [[25, 23, 0], [16, 38, 0], [55, 23, 1], [39, 23, 2]] // 大厅西 / 食堂 / 2F 走廊 / 3F 走廊
    defs.forEach((d, i) => {
      const [sx, sy, sf] = spots[i % spots.length]
      ;(m.npcs ??= []).push({ id: d.id, x: sx + 0.5, y: sy + 0.5, floor: sf })
    })
  }

  // ---- 灯光：1F 紧凑 4 格网格（贴 2F 板底 2.65，渲染层缺省贴附规则自动落位）；
  // 2F/3F 各自 5 格网格挂对应层天花（z=FLOOR_H / 2×FLOOR_H）----
  for (let y = 2; y < m.h - 1; y += 4)
    for (let x = 2; x < m.w - 1; x += 4)
      if (m.tiles[idx(x, y)] === 1) L(x, y, 5)
  for (let y = 2; y < m.h - 1; y += 5)
    for (let x = 2; x < m.w - 1; x += 5) {
      const ii = idx(x, y)
      if ((m.stair[ii] & 7) !== 0) continue // 坡道格不挂灯（井道由邻格灯光覆盖）
      if (m.up[ii] === 1 && m.upWall[ii] !== 1) L2(x, y)
      if (m.up2[ii] === 1 && m.upWall2[ii] !== 1) L3(x, y)
    }

  // ---- 区域名称标注（z=楼层带：0=1F 1=2F 2=3F；大地图/小地图按层过滤） ----
  // v54c：2F/3F 房间重排（矩形范围=新房间实际边界）
  m.zones = [
    { name: '北部入口', x: 39, y: 2, x0: 38, y0: 1, x1: 41, y1: 6 }, // 迎宾廊
    { name: '入口前厅', x: 39, y: 11, x0: 33, y0: 8, x1: 46, y1: 15 }, // v54c：双层挑空中庭
    { name: '大厅', x: 39, y: 24, x0: 10, y0: 18, x1: 69, y1: 30 },
    { name: '食堂', x: 17, y: 38, x0: 10, y0: 33, x1: 25, y1: 43 },
    { name: '医疗角', x: 34, y: 40, x0: 29, y0: 36, x1: 40, y1: 44 },
    { name: '补给兑换处', x: 48, y: 40, x0: 43, y0: 36, x1: 54, y1: 44 },
    { name: '楼梯间（上·住宅部）', x: 59, y: 36, x0: 56, y0: 32, x1: 65, y1: 40 },
    { name: '资料室', x: 66, y: 13, x0: 62, y0: 9, x1: 73, y1: 17 }, // v54e：原楼梯间B 的 1F（B 坡道腾空在 3.0 以上，由 2F 平台进出）
    { name: '南走廊', x: 30, y: 45, x0: 10, y0: 45, x1: 54, y1: 46 },
    { name: '住宅部 · 走廊', x: 39, y: 23, z: 1, x0: 11, y0: 22, x1: 68, y1: 24 },
    { name: '宿舍A', x: 20, y: 19, z: 1, x0: 11, y0: 19, x1: 31, y1: 20 },
    { name: '观景廊', x: 39, y: 19, z: 1, x0: 33, y0: 19, x1: 46, y1: 20 },
    { name: '宿舍B', x: 58, y: 19, z: 1, x0: 48, y0: 19, x1: 68, y1: 20 },
    { name: '洗漱间', x: 20, y: 27, z: 1, x0: 11, y0: 26, x1: 31, y1: 29 },
    { name: '储物间', x: 39, y: 27, z: 1, x0: 33, y0: 26, x1: 46, y1: 29 },
    { name: '电视娱乐室', x: 57, y: 27, z: 1, x0: 48, y0: 26, x1: 68, y1: 29 },
    { name: '住宅部 · 南走廊', x: 39, y: 31, z: 1, x0: 11, y0: 31, x1: 68, y1: 32 },
    { name: '休闲区', x: 17, y: 38, z: 1, x0: 11, y0: 34, x1: 24, y1: 43 },
    { name: '阅览角', x: 33, y: 38, z: 1, x0: 26, y0: 34, x1: 40, y1: 43 },
    { name: '储备角', x: 48, y: 38, z: 1, x0: 42, y0: 34, x1: 54, y1: 43 },
    { name: '井廊（住宅部）', x: 62, y: 38, z: 1, x0: 56, y0: 34, x1: 68, y1: 43 },
    { name: '行政部 · 走廊', x: 39, y: 23, z: 2, x0: 11, y0: 22, x1: 68, y1: 24 },
    { name: '会议A', x: 20, y: 19, z: 2, x0: 11, y0: 19, x1: 31, y1: 20 },
    { name: '主管办公室', x: 39, y: 19, z: 2, x0: 33, y0: 19, x1: 46, y1: 20 },
    { name: '会议B', x: 58, y: 19, z: 2, x0: 48, y0: 19, x1: 68, y1: 20 },
    { name: '办公室', x: 20, y: 27, z: 2, x0: 11, y0: 26, x1: 31, y1: 29 },
    { name: '资料室', x: 39, y: 27, z: 2, x0: 33, y0: 26, x1: 46, y1: 29 },
    { name: '机房', x: 57, y: 27, z: 2, x0: 48, y0: 26, x1: 68, y1: 29 },
    { name: '行政部 · 南走廊', x: 39, y: 31, z: 2, x0: 11, y0: 31, x1: 68, y1: 32 },
    { name: '大档案室', x: 17, y: 38, z: 2, x0: 11, y0: 34, x1: 24, y1: 43 },
    { name: '档案二室', x: 33, y: 38, z: 2, x0: 26, y0: 34, x1: 40, y1: 43 },
    { name: '样品库', x: 48, y: 38, z: 2, x0: 42, y0: 34, x1: 54, y1: 43 },
    { name: '井廊（行政部）', x: 62, y: 38, z: 2, x0: 56, y0: 34, x1: 68, y1: 43 },
  ]
  m.floors = 3 // v54：三层据点（跳过 applyMultiFloor 的自动多层——这里全部手工铺好）
  return [{ cx: 39, cy: 4 }]
}

// ============ B.N.T.G. 存储设施（id 107，v54）：Level 3 物资仓——单层手工布局 ============
// 设定：wikidot Level 3 条目——B.N.T.G. 在 Level 3 设有存储设施（存放该层搜集的物资）。
// 布局：北迎宾廊 → 存储大厅（货架排/托盘堆/碎料堆——全部装饰非 loot，据点铁律）+ 西北仓管办公角
// （兑换柜台：压印币平价基础物资）+ 东北守卫室 + 东/西入口；黄色安全线地面导引（同 EL3A 惯例）。
// 布局铁律同其他据点：每个房间至少一扇门接走廊网；门线正前方不得放实心家具；无 loot 容器/物品。
function genStorageOutpost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const X = (v: number) => Math.round(v * K)
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0); y <= X(y1); y++) for (let x = X(x0); x <= X(x1); x++) floor(x, y)
  }
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], tint = 0) => {
    const [ax, ay, bx, by] = [X(x0), X(y0), X(x1), X(y1)]
    for (let x = ax; x <= bx; x++) { wall(x, ay); wall(x, by) }
    for (let y = ay; y <= by; y++) { wall(ax, y); wall(bx, y) }
    for (let y = ay + 1; y <= by - 1; y++) for (let x = ax + 1; x <= bx - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      const dx = X(odx), dy = X(ody)
      floor(dx, dy)
      const sx = dx === ax ? -1 : dx === bx ? 1 : 0
      const sy = dy === ay ? -1 : dy === by ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = dx + i * sx, ty = dy + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
    if (tint) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) m.tint[idx(x, y)] = tint
  }
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: X(x), y: X(y), w, h, solid, data })
  const deco = (kind: 'noticeboard' | 'megposter' | 'photo', x: number, y: number, tex?: string) => {
    const tx = X(x), ty = X(y)
    if (m.tiles[idx(tx, ty)] !== 1) return
    const w = (dx: number, dy: number) => m.tiles[idx(tx + dx, ty + dy)] !== 1
    if (!w(1, 0) && !w(-1, 0) && !w(0, 1) && !w(0, -1)) return
    if ((w(1, 0) && w(-1, 0)) || (w(0, 1) && w(0, -1))) return
    S(kind, x, y, 1, 1, false, tex ? { tex } : undefined)
  }
  const L = (x: number, y: number, r = 5, color = def.palette.light) =>
    m.lights.push({ x: X(x) + 0.5, y: X(y) + 0.5, r, color, flickerSeed: rng.next() * 100 })
  const NPC = (id: string, x: number, y: number) =>
    (m.npcs ??= []).push({ id, x: X(x) + rng.int(-1, 1) * 0.2, y: X(y) + rng.int(-1, 1) * 0.2 })

  // ---- 骨架：北迎宾廊 + 存储大厅 + 东/西门廊 ----
  carve(30, 1, 33, 8) // 迎宾廊（北入口 → 大厅；南沿与大厅北缘相接——留 1 格虚空缝会被孤岛回填整片填墙）
  carve(8, 8, 56, 42) // 存储大厅（大开间）
  carve(56, 24, 62, 26) // 东门廊
  carve(1, 24, 8, 26) // 西门廊
  m.exits.push({ def: def.exits[0], x: X(31), y: X(1), discovered: true })
  m.exits.push({ def: def.exits[1], x: X(62), y: X(25), discovered: false })
  m.exits.push({ def: def.exits[2], x: X(1), y: X(25), discovered: false })
  m.spawn = { x: X(31), y: X(3) }
  NPC('gunter', 31, 8) // 守卫冈特：迎宾廊口岗哨（仓里的灯永远全开）

  // ---- 仓管办公角（西北：兑换柜台——压印币平价基础物资；门东接大厅） ----
  room(10, 10, 18, 16, [[18, 13]])
  S('table', 11, 11, 2, 1) // 兑换柜台（让开门线 (19,16) 前方）
  S('desk', 15, 11); S('libshelf', 17, 11)
  S('officechair', 12, 12, 1, 1, false)
  S('walltv', 11, 13, 1, 1, false) // v54：挂式平板电视（西墙）
  deco('noticeboard', 11, 12); deco('megposter', 11, 14, 'bntg_poster.png') // 西墙
  // v54：墙体窗（办公角东墙——与存储大厅互视；内隔墙，面 ±x）
  m.tiles[18 * m.w + 23] = 1 // 雕成地板（渲染层该格不再立墙盒）
  m.structures.push({ kind: 'wallwindow', x: 23, y: 18, w: 1, h: 1, solid: true, data: { deg: 0, topH: 2.99 } })
  L(14, 12, 5.5)
  NPC('dorian', 13, 12) // 仓管主管多莉安：兑换柜台

  // ---- 守卫室（东北：歇脚铺 + 桌椅；门西接大厅） ----
  room(46, 10, 54, 16, [[46, 13]])
  S('bunkbed', 52, 11, 1, 2); S('table', 48, 11, 2, 1); S('officechair', 48, 12, 1, 1, false)
  deco('megposter', 53, 15, 'bntg_poster.png') // 南墙
  L(50, 12, 5)

  // ---- 存储大厅：货架双排 + 托盘堆 + 碎料堆（全部装饰非 loot） ----
  // 货架排南北向六列（2 宽货架 + 1 格纵隙可穿行；东西向排间巷道通畅）
  for (const ry of [20, 24, 28, 32, 36, 40])
    for (const rx of [12, 16, 20, 24, 40, 44, 48]) {
      S('binshelf', rx, ry, 2, 1)
    }
  // 托盘堆与建材碎料堆散落巷道（避开迎宾廊主通道 x30..34 与东西门廊 y24..26 动线）
  for (const [px, py] of [[13, 22], [26, 22], [45, 22], [14, 30], [50, 30], [22, 38], [42, 38], [54, 38]] as const)
    S('pallet', px, py)
  for (const [dx2, dy2] of [[18, 26], [36, 26], [47, 34], [12, 38]] as const)
    S('debrispile', dx2, dy2, 1, 1, false)
  // 歇脚区（大厅东南角：长椅 + 桌子 + 垃圾桶）
  S('bench', 52, 40); S('table', 49, 40, 2, 1); S('trashbin', 54, 41)
  // 盘点员琵帕在货架巷道盘点
  NPC('pippa', 28, 25)
  // 墙面装饰（BNTG 海报/公告栏）+ 地面黄色安全线导引（迎宾廊口 → 大厅中轴）
  deco('megposter', 9, 12, 'bntg_poster.png'); deco('megposter', 9, 34, 'bntg_poster.png')
  deco('megposter', 55, 16, 'bntg_poster.png'); deco('megposter', 55, 32, 'l3storage_poster.png')
  deco('noticeboard', 30, 9); deco('megposter', 33, 9, 'l3storage_poster.png')
  for (let ay = 10; ay <= 40; ay += 2) S('photo', 32, ay, 1, 1, false, { flat: 1, tex: 'el3a_safeline.png', deg: 90 })

  // ---- 随机 NPC（BNTG 风味 ×3：店员/押运员/信使等） ----
  {
    const defs = genRandomNpcs(() => rng.next(), 3, 'bntg')
    m.npcDefs = defs
    const spots: [number, number][] = [
      [52, 20], // 大厅东巷道
      [14, 30], // 大厅西巷道
      [50, 39], // 歇脚区
    ]
    defs.forEach((d, i) => {
      const [sx, sy] = spots[i % spots.length]
      ;(m.npcs ??= []).push({ id: d.id, x: X(sx) + 0.5, y: X(sy) + 0.5 })
    })
  }

  // ---- 灯光：紧凑 4 格网格（暖白光常亮——仓里的灯永远全开） ----
  for (let y = 2; y < m.h - 1; y += 4)
    for (let x = 2; x < m.w - 1; x += 4)
      if (m.tiles[idx(x, y)] === 1)
        m.lights.push({ x: x + 0.5, y: y + 0.5, r: 5, color: def.palette.light, flickerSeed: rng.next() * 100 })

  // ---- 区域名称标注 ----
  m.zones = [
    { name: '北部入口', x: X(31), y: X(2) },
    { name: '仓管办公角', x: X(14), y: X(13) },
    { name: '守卫室', x: X(50), y: X(13) },
    { name: '存储大厅', x: X(28), y: X(28) },
    { name: '歇脚区', x: X(51), y: X(40) },
    { name: '东部入口', x: X(61), y: X(25) },
    { name: '西部入口', x: X(2), y: X(25) },
  ]
  return [{ cx: X(31), cy: X(3) }]
}

// ============ 蓝色救赎（id 108，v54 休息室风重排）：杰瑞的信众 Level 3 圣所 ============
// 参考图：一间休息室——白色干墙、蓝色灯光使房间显蓝、各色沙发围合、墙上大量鹉主画像。
// 布局：入口廊 → 门厅 → 休息室主间（沙发围合 ×3 + 茶几 + 东端小型祈祷角[讲坛/烛台/圣水盆]，
// 墙上挂满鹦鹉画像）+ 南侧信众居住区三间小室。白色干墙观感=贴图去色灰底 × palette 近白墙面；
// 蓝色灯光（palette.light 偏蓝）打在白墙上使房间显蓝。全层 tint=17 取消（v54 起由蓝灯承担色调）。
// 准入门槛 jerry 声望 >30（enterOutpost 拦截）；圣所内信众不主动传教（同 L274 规则，引擎按 level 108 拦截）。
function genBlueSalvation(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const X = (v: number) => Math.round(v * K)
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0); y <= X(y1); y++) for (let x = X(x0); x <= X(x1); x++) floor(x, y)
  }
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], tint = 0) => {
    const [ax, ay, bx, by] = [X(x0), X(y0), X(x1), X(y1)]
    for (let x = ax; x <= bx; x++) { wall(x, ay); wall(x, by) }
    for (let y = ay; y <= by; y++) { wall(ax, y); wall(bx, y) }
    for (let y = ay + 1; y <= by - 1; y++) for (let x = ax + 1; x <= bx - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      const dx = X(odx), dy = X(ody)
      floor(dx, dy)
      const sx = dx === ax ? -1 : dx === bx ? 1 : 0
      const sy = dy === ay ? -1 : dy === by ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = dx + i * sx, ty = dy + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
    if (tint) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) m.tint[idx(x, y)] = tint
  }
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: X(x), y: X(y), w, h, solid, data })
  const deco = (kind: 'noticeboard' | 'megposter' | 'photo', x: number, y: number, tex?: string) => {
    const tx = X(x), ty = X(y)
    if (m.tiles[idx(tx, ty)] !== 1) return
    const w = (dx: number, dy: number) => m.tiles[idx(tx + dx, ty + dy)] !== 1
    if (!w(1, 0) && !w(-1, 0) && !w(0, 1) && !w(0, -1)) return
    if ((w(1, 0) && w(-1, 0)) || (w(0, 1) && w(0, -1))) return
    S(kind, x, y, 1, 1, false, tex ? { tex } : undefined)
  }
  const L = (x: number, y: number, r = 5, color = def.palette.light, extra?: Partial<LightSource>) =>
    m.lights.push({ x: X(x) + 0.5, y: X(y) + 0.5, r, color, flickerSeed: rng.next() * 100, ...extra })
  const NPC = (id: string, x: number, y: number) =>
    (m.npcs ??= []).push({ id, x: X(x) + rng.int(-1, 1) * 0.2, y: X(y) + rng.int(-1, 1) * 0.2 })

  // ---- 骨架：北入口廊 → 门厅 → 休息室主间；南侧居住区 ----
  carve(30, 1, 33, 8) // 入口廊
  m.exits.push({ def: def.exits[0], x: X(31), y: X(1), discovered: true }) // 唯一出口（返回 Level 3）
  m.spawn = { x: X(31), y: X(3) }
  room(26, 8, 37, 13, [[31, 8], [31, 13]]) // 门厅——北接入口廊、南接休息室
  room(14, 14, 49, 34, [[31, 14], [20, 34], [44, 34]]) // 休息室主间——北接门厅、两南门接居住区走廊

  // ---- 门厅：公告栏 + 鹉主画像 ----
  deco('noticeboard', 27, 9)
  deco('megposter', 36, 9, 'bluesalvation_poster.png')
  S('planter', 27, 12); S('planter', 36, 12)

  // ---- 休息室主间：各色沙发围合 ×3（配茶几）+ 祈祷角 + 满墙鹉主画像 ----
  // 沙发围合 A（西区）：南北对坐 + 西侧单人位，中间茶几
  S('sofa', 20, 20, 1, 1, true, { deg: 0, color: '#5a76b8' }) // 蓝（面朝南）
  S('sofa', 20, 24, 1, 1, true, { deg: 180, color: '#5a8a6a' }) // 绿（面朝北）
  S('sofa', 17, 22, 1, 1, true, { deg: 90, color: '#8a4a52' }) // 酒红（面朝东）
  S('table', 20, 22) // 茶几
  // 沙发围合 B（中区）
  S('sofa', 32, 18, 1, 1, true, { deg: 0, color: '#7a7a80' }) // 灰
  S('sofa', 32, 22, 1, 1, true, { deg: 180, color: '#5a76b8' })
  S('sofa', 35, 20, 1, 1, true, { deg: 270, color: '#8a4a52' })
  S('table', 32, 20)
  // 沙发围合 C（南区，让开南门线 x25/x55）
  S('sofa', 30, 29, 1, 1, true, { deg: 90, color: '#5a8a6a' })
  S('sofa', 34, 29, 1, 1, true, { deg: 270, color: '#7a7a80' })
  S('table', 32, 29)
  S('officechair', 32, 31, 1, 1, false)
  // 祈祷角（东端：讲坛 + 烛台 + 圣水盆 + 条凳——比教堂小得多，只是个角）
  S('pulpit', 45, 17)
  S('candlestand', 43, 16, 1, 1, false); S('candlestand', 47, 16, 1, 1, false)
  S('holyfont', 44, 20); S('holyfont', 46, 20)
  S('bench', 42, 23, 1, 1, true, { deg: 270 }); S('bench', 42, 26, 1, 1, true, { deg: 270 })
  // 满墙鹉主画像（鹦鹉画像三幅轮换 + 信众海报；西/北/南墙）
  const PORTRAITS = ['parrot_portrait1.png', 'parrot_portrait2.png', 'parrot_portrait3.png']
  const WALL_SPOTS: [number, number][] = [
    [15, 18], [15, 23], [15, 28], [15, 33], // 西墙
    [18, 15], [26, 15], [38, 15], // 北墙（让开门线 x39）
    [48, 25], [48, 28], [48, 32], // 东墙（让开祈祷角）
  ]
  WALL_SPOTS.forEach(([px, py], i) => deco('megposter', px, py, PORTRAITS[i % PORTRAITS.length]))
  deco('megposter', 48, 19, 'jerry_poster.png') // 祈祷角东侧信众海报
  // 司事塞隆在祈祷角旁；艾拉修女在西区沙发静修
  NPC('theron', 44, 22)
  NPC('aella', 18, 23)

  // ---- 南侧：信众居住区（走廊 + 三间小室：床/小桌/烛灯） ----
  carve(16, 36, 47, 37) // 居住区走廊（接休息室两南门）
  const CELLS: [number, number, number][] = [[16, 24, 20], [26, 34, 31], [36, 47, 44]] // [x0, x1, 门 x]
  for (const [cx0, cx1, cdoor] of CELLS) {
    room(cx0, 39, cx1, 44, [[cdoor, 39]])
    S('bed', cx0 + 1, 40, 1, 2) // 小床
    S('table', cx1 - 1, 40) // 小桌
    S('candlestand', cx1 - 1, 42, 1, 1, false) // 烛灯
    deco('megposter', cx0 + 2, 40, PORTRAITS[cx0 % 3]) // 小室画像
  }

  // ---- 灯光：蓝色调常亮（白墙被蓝灯打蓝）+ 祈祷角暖烛光 + 居住区烛灯 ----
  // v54c 修复：网格灯循环用的是地图坐标——不得再过 L() 的 X() 缩放（否则整体偏向右下 ×1.25）
  for (let y = 2; y < m.h - 1; y += 4)
    for (let x = 2; x < m.w - 1; x += 4)
      if (m.tiles[idx(x, y)] === 1)
        m.lights.push({ x: x + 0.5, y: y + 0.5, r: 5, color: def.palette.light, flickerSeed: rng.next() * 100 })
  // v54c：烛光点与烛台模型对齐（此前悬在半空/错格）——光源落在烛台瓦片、烛火真实高度（fixZ 1.3）、
  // 不画默认灯盒（noFix：烛台模型即灯具）
  L(43, 16, 3.5, '#ffd9a0', { fixZ: 1.3, noFix: 1 }) // 祈祷角烛台（左）
  L(47, 16, 3.5, '#ffd9a0', { fixZ: 1.3, noFix: 1 }) // 祈祷角烛台（右）
  L(23, 42, 3, '#ffd9a0', { fixZ: 1.3, noFix: 1 }) // 居住区小室烛灯（西）
  L(33, 42, 3, '#ffd9a0', { fixZ: 1.3, noFix: 1 }) // 居住区小室烛灯（中）
  L(46, 42, 3, '#ffd9a0', { fixZ: 1.3, noFix: 1 }) // 居住区小室烛灯（东）

  // ---- 区域名称标注 ----
  m.zones = [
    { name: '入口', x: X(31), y: X(2) },
    { name: '门厅', x: X(31), y: X(10) },
    { name: '休息室', x: X(31), y: X(24) },
    { name: '祈祷角', x: X(45), y: X(20) },
    { name: '信众居住区', x: X(31), y: X(41) },
  ]
  return [{ cx: X(31), cy: X(3) }]
}

// ============ M.E.G. Omega 基地（id 109，v54）：Level 4 主要基地——单层多房间 ============
// 设定依据 wikidot/Fandom Level 4 条目（Omega 是 M.E.G. 在 L4 的主要基地）。
// v54c 多房间化（参照 Alpha 手工分区）：走廊网（北横廊+中纵廊+南横廊）串联——
// 档案与数据中心拆为 数据厅A/B（成排工位）+ 机房（服务器阵列）+ 档案室（独立成间）+
// 会议室/主管办公室；居住区拆 宿舍间 + 医护盥洗室；仓储区独立库房；楼梯间（东南）→L5，
// 库房角落旧活板门 →L6。据点铁律：每房间有门、门线前方留空、无 loot。
function genOmegaOutpost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const X = (v: number) => Math.round(v * K)
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0); y <= X(y1); y++) for (let x = X(x0); x <= X(x1); x++) floor(x, y)
  }
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][]) => {
    const [ax, ay, bx, by] = [X(x0), X(y0), X(x1), X(y1)]
    for (let x = ax; x <= bx; x++) { wall(x, ay); wall(x, by) }
    for (let y = ay; y <= by; y++) { wall(ax, y); wall(bx, y) }
    for (let y = ay + 1; y <= by - 1; y++) for (let x = ax + 1; x <= bx - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      const dx = X(odx), dy = X(ody)
      floor(dx, dy)
      const sx = dx === ax ? -1 : dx === bx ? 1 : 0
      const sy = dy === ay ? -1 : dy === by ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = dx + i * sx, ty = dy + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
  }
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: X(x), y: X(y), w, h, solid, data })
  const deco = (kind: 'noticeboard' | 'megposter' | 'photo', x: number, y: number, tex?: string) => {
    const tx = X(x), ty = X(y)
    if (m.tiles[idx(tx, ty)] !== 1) return
    const w = (dx: number, dy: number) => m.tiles[idx(tx + dx, ty + dy)] !== 1
    if (!w(1, 0) && !w(-1, 0) && !w(0, 1) && !w(0, -1)) return
    if ((w(1, 0) && w(-1, 0)) || (w(0, 1) && w(0, -1))) return
    S(kind, x, y, 1, 1, false, tex ? { tex } : undefined)
  }
  const L = (x: number, y: number, r = 5.5, color = def.palette.light) =>
    m.lights.push({ x: X(x) + 0.5, y: X(y) + 0.5, r, color, flickerSeed: rng.next() * 100 })
  const NPC = (id: string, x: number, y: number) =>
    (m.npcs ??= []).push({ id, x: X(x) + rng.int(-1, 1) * 0.2, y: X(y) + rng.int(-1, 1) * 0.2 })
  // 房间灯网（照明充足：房内 4 格网格 r5.5）
  const roomLights = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0) + 2; y <= X(y1) - 1; y += 4)
      for (let x = X(x0) + 2; x <= X(x1) - 1; x += 4)
        if (m.tiles[idx(x, y)] === 1)
          m.lights.push({ x: x + 0.5, y: y + 0.5, r: 5.5, color: def.palette.light, flickerSeed: rng.next() * 100 })
  }
  // 工位排（v54c 二选一：desk 工位不紧邻 bigcomputer；配大机的工位用简桌 table）
  const workRow = (y: number, x0: number, x1: number) => {
    for (let wx = x0; wx <= x1; wx += 3) {
      if (((wx + y) % 2) === 0) { S('table', wx, y); S('bigcomputer', wx + 1, y) }
      else S('desk', wx, y)
      S('officechair', wx, y + 1, 1, 1, false)
    }
  }

  // ---- 骨架：北迎宾廊 + 门厅 + 走廊网（北横廊/中纵廊/南横廊） ----
  carve(30, 1, 33, 7) // 迎宾廊（北入口 → 门厅）
  carve(27, 8, 36, 11) // 门厅
  carve(6, 12, 57, 13) // 北横廊
  carve(29, 13, 32, 43) // 中纵廊（北接北横廊、南接南横廊——K=1.25 缩放后须真正相接/门洞 2 格外延可达）
  carve(6, 43, 57, 43) // 南横廊
  m.exits.push({ def: def.exits[0], x: X(31), y: X(1), discovered: true }) // 北部入口（返回 Level 4）
  m.spawn = { x: X(31), y: X(3) }
  NPC('voss', 31, 6) // 守卫迪特·沃斯：迎宾廊口岗哨（出入登记）
  deco('noticeboard', 29, 9); deco('megposter', 33, 9, 'gamma_poster.png')
  for (const [lx, ly] of [[31, 5], [31, 10], [20, 12], [44, 12], [31, 22], [31, 34], [20, 43], [44, 43]] as const) L(lx, ly) // 走廊灯

  // ---- 会议室（北横廊北，门南） ----
  room(36, 3, 44, 10, [[40, 10]])
  S('table', 38, 5, 4, 1) // 长桌
  S('officechair', 38, 6, 1, 1, false); S('officechair', 40, 6, 1, 1, false); S('officechair', 42, 6, 1, 1, false)
  S('screenboard', 40, 4, 1, 1, false) // 投影幕（北墙）
  deco('noticeboard', 37, 4)
  roomLights(36, 3, 44, 10)

  // ---- 主管办公室（东北角，门南） ----
  room(46, 3, 58, 10, [[52, 10]])
  S('desk', 50, 5); S('officechair', 50, 6, 1, 1, false)
  S('libshelf', 48, 4); S('libshelf', 56, 4)
  deco('photo', 56, 6)
  NPC('whitaker', 52, 6) // 主管艾略特·惠特克
  roomLights(46, 3, 58, 10)

  // ---- 数据厅A（中纵廊西上段，门东；成排工位） ----
  room(6, 15, 28, 30, [[28, 22]])
  for (const wy of [18, 22, 26]) workRow(wy, 9, 24)
  deco('megposter', 7, 20, 'omega_poster.png'); deco('photo', 7, 28)
  roomLights(6, 15, 28, 30)

  // ---- 数据厅B（中纵廊西下段，门东；成排工位） ----
  room(6, 32, 28, 42, [[28, 37]])
  for (const wy of [35, 39]) workRow(wy, 9, 24)
  deco('noticeboard', 7, 36)
  roomLights(6, 32, 28, 42)

  // ---- 机房（中纵廊东上段，门西；服务器阵列） ----
  room(33, 15, 57, 30, [[33, 22]])
  for (const ry of [17, 21]) for (let rx = 46; rx <= 54; rx += 2) S('serverrack', rx, ry)
  S('switchboard', 56, 17); S('switchboard', 56, 19) // 配电盘（东墙）
  for (let rx = 46; rx <= 54; rx += 2) S('servercase', rx, 24) // 塔式机箱排
  S('table', 44, 17, 2, 1); S('bigcomputer', 44, 19) // 监控台（简桌+大机）
  S('officechair', 45, 18, 1, 1, false)
  S('warningsign', 56, 21, 1, 1, false) // 警示牌（东墙）
  NPC('grove', 51, 19) // 数据技师德温·格罗夫
  roomLights(35, 15, 57, 30)

  // ---- 档案室（中纵廊东下段，门西；独立成间） ----
  room(33, 32, 57, 42, [[33, 37]])
  for (const ry of [34, 36]) for (let rx = 37; rx <= 55; rx += 2) S('libshelf', rx, ry, 1, 1, true, { row: 1 })
  S('table', 46, 39, 2, 1); S('officechair', 46, 40, 1, 1, false) // 查找台
  S('megdoc', 48, 39, 1, 1, false, { doc: 'meg_levels' }) // 层级档案
  NPC('irene', 46, 35) // 档案员艾琳·福斯特
  roomLights(35, 32, 57, 42)

  // ---- 宿舍间（南横廊南西一，门北） ----
  room(6, 45, 18, 61, [[12, 45]])
  S('bunkbed', 8, 47, 1, 2); S('bunkbed', 12, 47, 1, 2); S('bunkbed', 16, 47, 1, 2)
  S('table', 8, 58, 2, 1); S('officechair', 8, 59, 1, 1, false); S('bench', 15, 58)
  roomLights(6, 45, 18, 61)

  // ---- 医护盥洗室（南横廊南西二，门北） ----
  room(20, 45, 30, 61, [[25, 45]])
  S('sink', 22, 47); S('sink', 24, 47)
  S('table', 22, 58, 2, 1); S('officechair', 22, 59, 1, 1, false) // 检查台
  S('vending', 28, 47, 1, 1, true, { trade: 1 }) // 自动售货机（免费取用；v54b 机制）
  NPC('saira', 25, 55) // 医护萨伊拉·昆恩
  roomLights(20, 45, 30, 61)

  // ---- 库房（南横廊南中，门北；全部装饰非 loot） ----
  room(32, 45, 44, 61, [[38, 45]])
  for (const ry of [48, 52, 56]) for (let rx = 34; rx <= 42; rx += 3) S('binshelf', rx, ry, 2, 1)
  for (const [px, py] of [[35, 50], [41, 50], [37, 54]] as const) S('pallet', px, py)
  S('debrispile', 34, 58, 1, 1, false)
  m.exits.push({ def: def.exits[2], x: X(42), y: X(59), discovered: false }) // 旧活板门（→Level 6，库房角落）
  NPC('hobbs', 38, 53) // 仓管厄尔·霍布斯
  roomLights(32, 45, 44, 61)

  // ---- 楼梯间（南横廊南东，门北；v54c 缩小——只留井道与缓冲；固定出口 →Level 5 古典楼梯） ----
  room(46, 45, 53, 53, [[50, 45]])
  {
    // 古典楼梯（可行走下行；同 infiniteL4 落位规则：邻墙 + 走向 4 格畅通 + 入梯侧净空）
    const sx = X(52), sy = X(49) // 楼梯格（东墙 (66,·) 邻格；走向 -x）
    m.exits.push({ def: def.exits[1], x: sx, y: sy, discovered: false })
    const railDeg = 90 // 墙在 +x（东墙）→ 走向 -x（同 orientStairs 的 rotation.y 角度制）
    for (let k2 = 1; k2 <= 3; k2++) {
      m.elev[idx(sx - k2, sy)] = 4 // 走向 3 格深渊洞口（视觉开洞；同 L0 灰色阶梯先例）
      m.structures.push({ kind: 'stairrail', x: sx - k2, y: sy, w: 1, h: 1, solid: true, data: { deg: railDeg, end: k2 === 3 ? 1 : 0 } }) // 井口护栏碰撞（模型在 buildExit oldstairs）
    }
  }
  S('warningsign', 47, 46, 1, 1, false) // 警示牌（北墙）
  S('debrispile', 52, 51, 1, 1, false) // 角落废木料（年久失修感）
  roomLights(46, 45, 53, 53)

  // ---- 随机居民 ×4（MEG 风味：两数据厅 + 机房 + 北横廊） ----
  {
    const defs = genRandomNpcs(() => rng.next(), 4, 'meg')
    m.npcDefs = defs
    const spots: [number, number][] = [[14, 22], [14, 37], [48, 26], [20, 12]]
    defs.forEach((d, i) => {
      const [sx, sy] = spots[i % spots.length]
      ;(m.npcs ??= []).push({ id: d.id, x: X(sx) + 0.5, y: X(sy) + 0.5 })
    })
  }

  // ---- 区域名称标注 ----
  m.zones = [
    { name: '北部入口', x: X(31), y: X(2) },
    { name: '门厅', x: X(31), y: X(9) },
    { name: '会议室', x: X(40), y: X(6) },
    { name: '主管办公室', x: X(52), y: X(6) },
    { name: '数据厅A', x: X(17), y: X(22) },
    { name: '数据厅B', x: X(17), y: X(37) },
    { name: '机房', x: X(46), y: X(22) },
    { name: '档案室', x: X(46), y: X(37) },
    { name: '宿舍间', x: X(12), y: X(53) },
    { name: '医护盥洗室', x: X(25), y: X(53) },
    { name: '库房', x: X(38), y: X(53) },
    { name: '楼梯间', x: X(50), y: X(49) },
  ]
  return [{ cx: X(31), cy: X(3) }]
}

// ============ v55：Level 5 三处据点（小型单层手工布局；无 loot 铁律——无 loot 容器、无地面物品） ============
// 共用小型工具集（同 Omega 惯例：设计坐标经 K 放大；room() 的 doors 自动外凿 2 格走廊口）
function mkL5Helpers(m: GameMap, rng: RNG, def: LevelDef) {
  const idx = (x: number, y: number) => y * m.w + x
  const X = (v: number) => Math.round(v * K)
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2 }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0); y <= X(y1); y++) for (let x = X(x0); x <= X(x1); x++) floor(x, y)
  }
  const room = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][]) => {
    const [ax, ay, bx, by] = [X(x0), X(y0), X(x1), X(y1)]
    for (let x = ax; x <= bx; x++) { wall(x, ay); wall(x, by) }
    for (let y = ay; y <= by; y++) { wall(ax, y); wall(bx, y) }
    for (let y = ay + 1; y <= by - 1; y++) for (let x = ax + 1; x <= bx - 1; x++) floor(x, y)
    for (const [odx, ody] of doors) {
      const dx = X(odx), dy = X(ody)
      floor(dx, dy)
      const sx = dx === ax ? -1 : dx === bx ? 1 : 0
      const sy = dy === ay ? -1 : dy === by ? 1 : 0
      for (let i = 1; i <= 2 && (sx || sy); i++) {
        const tx = dx + i * sx, ty = dy + i * sy
        if (m.tiles[idx(tx, ty)] === 1) break
        floor(tx, ty)
      }
    }
  }
  const S = (kind: StructKind, x: number, y: number, w = 1, h = 1, solid = true, data?: Structure['data']) =>
    m.structures.push({ kind, x: X(x), y: X(y), w, h, solid, data })
  const L = (x: number, y: number, r = 5.5, color = def.palette.light) =>
    m.lights.push({ x: X(x) + 0.5, y: X(y) + 0.5, r, color, flickerSeed: rng.next() * 100 })
  const NPC = (id: string, x: number, y: number) =>
    (m.npcs ??= []).push({ id, x: X(x) + rng.int(-1, 1) * 0.2, y: X(y) + rng.int(-1, 1) * 0.2 })
  const roomLights = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = X(y0) + 2; y <= X(y1) - 1; y += 4)
      for (let x = X(x0) + 2; x <= X(x1) - 1; x += 4)
        if (m.tiles[idx(x, y)] === 1)
          m.lights.push({ x: x + 0.5, y: y + 0.5, r: 5.5, color: def.palette.light, flickerSeed: rng.next() * 100 })
  }
  return { X, carve, room, S, L, NPC, roomLights }
}

// ---- M.E.G. 哨所「家政服务」（id 110）：前厅 + 补给间 + 宿舍 + 门房 ----
function genHousekeepingPost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const { X, carve, room, S, L, NPC, roomLights } = mkL5Helpers(m, rng, def)
  carve(20, 1, 23, 6) // 入口廊（南门 → 前厅）
  m.exits.push({ def: def.exits[0], x: X(21), y: X(1), discovered: true }) // 哨所入口（返回 Level 5）
  m.spawn = { x: X(21), y: X(3) }
  // 前厅（登记桌 + 休息角）
  room(16, 7, 28, 15, [[21, 7]])
  S('frontdesk', 18, 8, 2, 1) // 登记台（装饰——交易走 NPC）
  S('table', 25, 9); S('officechair', 25, 10, 1, 1, false)
  S('sofa', 17, 13, 1, 1, true, { deg: 90, color: '#5a76b8' }) // 休息角
  S('table', 19, 13)
  S('megposter', 27, 8, 1, 1, false, { tex: 'gamma_poster.png' })
  S('noticeboard', 17, 8, 1, 1, false)
  NPC('barclay', 20, 10) // 哨所长巴克利
  roomLights(16, 7, 28, 15)
  // 补给间（东，门西——横廊穿前厅东墙接通门洞外凿段；补给架 + 工作台）
  room(30, 7, 40, 15, [[30, 11]])
  carve(27, 10, 29, 12) // 前厅东墙门廊（穿墙接补给间门洞）
  for (const ry of [8, 11]) for (let rx = 33; rx <= 38; rx += 2) S('binshelf', rx, ry, 1, 1)
  S('worktable', 32, 14); S('table', 34, 14)
  NPC('petra', 36, 12) // 补给员佩特拉（货架排之间通道）
  roomLights(30, 7, 40, 15)
  // 宿舍（西，门东；两张行军床 + 储物柜）
  room(4, 7, 14, 15, [[14, 11]])
  S('bed', 5, 8, 1, 2, true, { deg: 180 }); S('bed', 8, 8, 1, 2, true, { deg: 180 })
  S('binshelf', 13, 8, 1, 1) // 置物架（非容器）
  S('pallet', 6, 14) // 行李托盘堆（装饰，非容器）
  roomLights(4, 7, 14, 15)
  // 门房/维修角（前厅南西，门北）
  room(4, 17, 14, 24, [[9, 17]])
  S('worktable', 6, 18, 1, 1, true, { vise: 1 })
  S('pallet', 12, 18) // 物料托盘（装饰，非容器）
  S('foldladder', 5, 22, 1, 1, false, { deg: 90 })
  NPC('otis', 9, 20) // 维修工奥蒂斯
  roomLights(4, 17, 14, 24)
  for (const [lx, ly] of [[21, 4], [21, 8], [28, 11], [16, 11]] as const) L(lx, ly) // 走廊灯
  // 随机居民 ×1（MEG 风味，前厅）
  {
    const defs = genRandomNpcs(() => rng.next(), 1, 'meg')
    m.npcDefs = defs
    ;(m.npcs ??= []).push({ id: defs[0].id, x: X(24) + 0.5, y: X(12) + 0.5 })
  }
  m.zones = [
    { name: '哨所入口', x: X(21), y: X(2) },
    { name: '前厅', x: X(22), y: X(11) },
    { name: '补给间', x: X(35), y: X(11) },
    { name: '宿舍', x: X(9), y: X(11) },
    { name: '门房', x: X(9), y: X(20) },
  ]
  return [{ cx: X(21), cy: X(3) }]
}

// ---- 家常酒店（id 111）：大堂（前台 + 休息区）+ 餐厅角 + 客房两间 ----
function genHomelyHotel(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const { X, carve, room, S, L, NPC, roomLights } = mkL5Helpers(m, rng, def)
  carve(20, 1, 23, 5) // 正门廊
  m.exits.push({ def: def.exits[0], x: X(21), y: X(1), discovered: true }) // 酒店正门（返回 Level 5）
  m.spawn = { x: X(21), y: X(3) }
  // 大堂（前台 + 休息区 + 大堂灯；西门洞接客房翼走廊）
  room(14, 6, 30, 16, [[21, 6], [14, 11]])
  S('frontdesk', 16, 7, 2, 1) // 前台（装饰——无交易）
  S('walltv', 28, 7, 1, 1, false) // 大堂电视
  S('sofa', 17, 12, 1, 1, true, { deg: 90, color: '#5a8a9a' }); S('sofa', 17, 14, 1, 1, true, { deg: 90, color: '#7a7a80' })
  S('table', 19, 13) // 茶几
  S('tvset', 24, 12, 1, 1, true, { deg: 270 }) // 立式电视（对休息区）
  S('planter', 15, 15); S('planter', 29, 15)
  S('chandelier', 22, 11, 1, 1, false)
  NPC('vivian', 17, 9) // 前台维维安
  NPC('harold', 20, 13) // 长住客哈罗德（大堂读书）
  roomLights(14, 6, 30, 16)
  // 餐厅角（东，门西）
  room(32, 6, 42, 16, [[32, 11]])
  S('dtable', 34, 8); S('dtable', 38, 8); S('dtable', 34, 13); S('dtable', 38, 13)
  S('kcounter', 41, 7); S('freezer', 41, 9) // 备餐台 + 卧式冷柜（装饰，非容器）
  NPC('margot', 36, 10) // 服务员玛戈
  roomLights(32, 6, 42, 16)
  // 客房两间（西翼，门东；v55c：西翼走廊连接大堂西门洞——客房门洞外凿 2 格入廊）
  carve(12, 8, 13.5, 15.5) // 西翼走廊（竖向，连接两客房门洞与大堂西门洞）
  room(4, 6, 12, 11, [[12, 8]])
  S('bed', 5, 7, 1, 2, true, { deg: 270 }); S('table', 10, 7) // 床头桌（非容器）
  S('rug', 6, 8, 2, 2, false, { tex: 'l5_carpet.jpg' })
  roomLights(4, 6, 12, 11)
  room(4, 13, 12, 18, [[12, 15]])
  S('bed', 5, 17, 1, 2, true, { deg: 0 }); S('table', 10, 16) // 床贴南墙（床头朝南）+ 床头桌（非容器）
  S('rug', 6, 14, 2, 2, false, { tex: 'l5_carpet.jpg' })
  roomLights(4, 13, 12, 18)
  for (const [lx, ly] of [[21, 4], [13, 11], [31, 11]] as const) L(lx, ly)
  // 随机住客 ×2（mixed 风味，大堂/餐厅角）
  {
    const defs = genRandomNpcs(() => rng.next(), 2, 'mixed')
    m.npcDefs = defs
    const spots: [number, number][] = [[26, 14], [36, 14]]
    defs.forEach((d, i) => (m.npcs ??= []).push({ id: d.id, x: X(spots[i][0]) + 0.5, y: X(spots[i][1]) + 0.5 }))
  }
  m.zones = [
    { name: '酒店正门', x: X(21), y: X(2) },
    { name: '大堂', x: X(22), y: X(11) },
    { name: '餐厅角', x: X(37), y: X(11) },
    { name: '客房 201', x: X(8), y: X(8) },
    { name: '客房 202', x: X(8), y: X(15) },
  ]
  return [{ cx: X(21), cy: X(3) }]
}

// ---- 原住民（id 112）：老式客厅 + 藏书角 + 卧室（1930 前风格；贝弗莉室附近的居所感） ----
function genOriginalsParlor(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const { X, carve, room, S, L, NPC, roomLights } = mkL5Helpers(m, rng, def)
  carve(20, 1, 23, 5) // 正门廊
  m.exits.push({ def: def.exits[0], x: X(21), y: X(1), discovered: true }) // 居所正门（返回 Level 5）
  m.spawn = { x: X(21), y: X(3) }
  // 老式客厅（沙发围炉 + 留声机 + 烛台 + 地毯；1920 风）
  room(12, 6, 32, 18, [[21, 6]])
  // 壁炉感（烛台一对 + 矮桌拼出台位——现有件拼，不新增结构；无 loot 铁律不用容器）
  S('table', 22, 7, 2, 1) // 壁炉台位
  S('candlestand', 21, 7, 1, 1, false); S('candlestand', 24, 7, 1, 1, false)
  S('sofa', 18, 10, 1, 1, true, { deg: 90, color: '#8a4a52' }) // 酒红古董沙发
  S('sofa', 24, 10, 1, 1, true, { deg: 270, color: '#5a8a6a' })
  S('loungechair', 18, 13, 1, 1, false, { color: '#7a5a3a' }); S('loungechair', 24, 13, 1, 1, false, { color: '#5a4a5e' })
  S('table', 21, 11) // 茶几
  S('phonograph', 13, 7, 1, 1, true, { on: 1 }) // 留声机（播放中——原住民的客厅从不缺爵士乐）
  S('candlestand', 13, 16, 1, 1, false); S('candlestand', 31, 16, 1, 1, false)
  S('planter', 13, 10)
  S('rug', 19, 9, 6, 7, false) // 红金大地毯
  S('bigpainting', 18, 7, 1, 1, false, { tex: 'l5_portrait2.png', pw: 1.12, ph: 1.4 }) // 夫妇像（避开北门洞正对面）
  S('sconce', 13, 13, 1, 1, false); S('sconce', 31, 16, 1, 1, false) // 东墙烛台避开卧室门廊（y 13 段已凿通）
  NPC('dorothy', 19, 12) // 多萝西（客厅主人姿态）
  NPC('smith', 26, 12) // 史密斯船长（巡视路线中点）
  NPC('amelia', 27, 8) // 阿梅莉亚（窗边）
  NPC('white', 15, 8) // 怀特总督（客厅西侧客座）
  roomLights(12, 6, 32, 18)
  // 藏书角（西，门东——门洞外凿穿客厅西墙）
  room(4, 6, 10, 18, [[10, 12]])
  S('libshelf', 5, 7); S('libshelf', 7, 7); S('libshelf', 5, 9)
  S('table', 7, 14); S('loungechair', 8, 14, 1, 1, false, { color: '#5a4a5e' })
  NPC('astor', 7, 11) // 阿斯特（账房）
  NPC('northup', 8, 15) // 诺瑟普（藏书角阅读位）
  roomLights(4, 6, 10, 18)
  // 卧室（东，门西；门洞外凿 2 格 + 横廊穿客厅东墙接通）
  room(34, 6, 42, 18, [[34, 12]])
  carve(31, 11, 33, 13) // 客厅东墙门廊（穿墙接卧室门洞外凿段）
  S('bed', 41, 7, 1, 2, true, { deg: 180 }); S('table', 35, 7) // 床头桌（非容器）
  S('candlestand', 41, 16, 1, 1, false)
  S('rug', 37, 13, 3, 3, false, { tex: 'l5_carpet.jpg' })
  NPC('hoffa', 37, 10) // 霍法（配给桌旁）
  S('table', 37, 8) // 配给桌
  roomLights(34, 6, 42, 18)
  for (const [lx, ly] of [[21, 4], [11, 12], [33, 12]] as const) L(lx, ly, 5, '#ffd9a0')
  m.zones = [
    { name: '居所正门', x: X(21), y: X(2) },
    { name: '老式客厅', x: X(22), y: X(12) },
    { name: '藏书角', x: X(7), y: X(12) },
    { name: '卧室', x: X(38), y: X(12) },
  ]
  return [{ cx: X(21), cy: X(3) }]
}
