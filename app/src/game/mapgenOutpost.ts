// 据点生成器（gen='outpost'）：完全手工设计的有限小层级——一切结构/灯光/出口/NPC 落位
// 都是设计好的，无随机物品与容器（需求：据点不会凭空出现物品）。
// 当前实现：M.E.G. Alpha 基地（布局参照 wikidot Base Alpha 构成图：
// 探险署/行政署/档案署/研究署 + 五个居民区 + 北/东/西三个入口；小随机性=民居开间与家具抖动）。
// 布局铁律：每个房间至少有一扇门接到走廊网，否则 BFS 连通回填会把房间内部填成墙。
// v35：K=1.25 放大区块（设计坐标 → 地图坐标，def.size 64→80）；民居暖木 tint=8；
// 明亮办公风（Plaster/Tiles/OfficeCeiling 贴图）+ 机柜/转椅/货架/双层床/投影幕精致家具。
import type { GameMap } from './mapgen'
import { FLOOR_H, stampStairRun } from './mapgen'
import type { LevelDef, StructKind, Structure } from './types'
import type { RNG } from './rng'
import { genRandomNpcs, jerryFollowerDef } from './npcs'
import { makeEntity } from './entities'

const K = 1.25 // 区块放大系数（设计坐标 → 地图坐标）

export function genOutpost(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  if (def.id === 102) return genBntgOutpost(m, rng, def)
  if (def.id === 103) return genArianeOutpost(m, rng, def)
  if (def.id === 104) return genTomOutpost(m, rng, def)
  if (def.id === 105) return genEl3aOutpost(m, rng, def)
  if (def.id === 274) return genJerryRoom(m, rng, def) // v45：Level 274「杰瑞的房间」
  return genAlphaOutpost(m, rng, def)
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
  deco('megposter', 5, 27) // 训练厅西墙
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
  S('screenboard', 26, 6, 1, 1, false); S('table', 24, 7, 4, 1)
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
  NPC('kui', 33, 18) // 布洛克把守保险库北门（门外）

  // ---- 市场街店铺（西 3 + 东 3 + 南 2，柜台 + 摊主 + 招牌） ----
  const shop = (x0: number, y0: number, x1: number, y1: number, doors: [number, number][], npc: string | null, tex?: string) => {
    room(x0, y0, x1, y1, doors)
    S('table', x0 + 1, y0 + 1, 2, 1) // 柜台
    S('binshelf', x1 - 2, y1 - 2, 2, 1)
    if (tex) deco('megposter', x0 + 3, y0 + 1, tex)
    if (npc) NPC(npc, x0 + 2, y0 + 2)
    L(x0 + 2, y0 + 2, 4.5)
  }
  shop(11, 16, 17, 21, [[17, 18]], 'shen', 'bntg_poster.png') // 西一：鉴定师·塞德里克
  shop(11, 23, 17, 28, [[17, 25]], 'tang', 'bntg_poster.png') // 西二：杂货商·玛戈
  shop(11, 30, 17, 35, [[17, 32]], null, 'bntg_poster.png') // 西三（随机 NPC 看摊）
  shop(47, 16, 53, 21, [[47, 18]], null, 'bntg_poster.png') // 东一（随机 NPC 看摊）
  shop(47, 23, 53, 28, [[47, 25]], null, 'bntg_poster.png') // 东二（随机 NPC 看摊）
  shop(47, 30, 53, 35, [[47, 32]], null, 'bntg_poster.png') // 东三（随机 NPC 看摊）
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
  deco('megposter', 28, 3, 'bntg_poster.png'); deco('noticeboard', 24, 5)
  L(26, 4); NPC('mccauley', 26, 4)
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
  SU('megposter', 13, 48, 1, 1, false, { tex: 'bntg_poster.png' }); SU('noticeboard', 13, 52) // 西墙装饰（贴仓库外墙瓷砖面）
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
  SU('megposter', 68, 50, 1, 1, false, { tex: 'bntg_poster.png' })
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
  m.zones = [
    { name: '北部入口', x: X(32), y: X(2) },
    { name: '物流办公室', x: X(26), y: X(5) },
    { name: '兑换间', x: X(37), y: X(5) },
    { name: '歇脚区', x: 37, y: 13 },
    { name: '仓库中庭（1F）', x: 34, y: 24 },
    { name: '装卸区（1F·南侧夹楼下）', x: 40, y: 50 },
    { name: '东部入口', x: X(61), y: X(28) },
    { name: '西部入口', x: X(2), y: X(28) },
    { name: '夹楼走廊（2F）', x: 40, y: 42, z: 1 },
    { name: '档案室（2F）', x: 20, y: 52, z: 1 },
    { name: '休息室（2F）', x: 34, y: 52, z: 1 },
    { name: '主任办公室（2F）', x: 48, y: 52, z: 1 },
    { name: '值班办公区（2F）', x: 62, y: 52, z: 1 },
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
  return [{ cx: X(32), cy: X(3) }]
}
