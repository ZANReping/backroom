// v23：Level 6–11 与 Level 601 的地形生成器
//
// 与 mapgen.ts 的关系：本文件只做「基础地形 + 层级标志物」，之后仍由 mapgen.ts 统一执行
// 预制件植入 → 高度档 → 室外改造 → 散点生成物 → 连通校验 → 出口/光源/实体/物品。
// 为避免运行时循环依赖，本文件对 mapgen 只做 **type-only** 引用（编译后被完全擦除），
// 需要的过程式辅助函数由 mapgen 以 GenHelpers 形式注入。
import { RNG } from '../core/rng'
import type { GameMap } from './mapgen'
import type { LevelDef, Structure, StructKind } from '../core/types'

export interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number }

export interface GenHelpers {
  idx: (m: { w: number }, x: number, y: number) => number
  carveRoom: (m: GameMap, x: number, y: number, w: number, h: number) => void
  carveH: (m: GameMap, x1: number, x2: number, y: number, wdt?: number) => void
  carveV: (m: GameMap, y1: number, y2: number, x: number, wdt?: number) => void
  place: (m: GameMap, rng: RNG, kind: StructKind, w: number, h: number, solid: boolean, data?: Structure['data']) => Structure | null
  placeWallHug: (m: GameMap, rng: RNG, kind: StructKind, data?: Structure['data']) => Structure | null
}

/** 生成器分发：返回 rooms（首个房间的中心用作出生点候选） */
export function genDeep(m: GameMap, rng: RNG, def: LevelDef, H: GenHelpers): Room[] {
  switch (def.gen) {
    case 'darkhall': return genDarkhall(m, rng, H)
    case 'ocean': return genOcean(m, rng, H)
    case 'caves': return genCaves(m, rng, H)
    case 'suburb': return genSuburb(m, rng, H)
    case 'field': return genField(m, rng, H)
    case 'city': return genCity(m, rng, H)
    case 'library': return genLibrary(m, rng, H)
    default: return []
  }
}

// 便捷：结构压入
const S = (m: GameMap, kind: StructKind, x: number, y: number, w: number, h: number, solid: boolean, data?: Structure['data']) => {
  m.structures.push({ kind, x, y, w, h, solid, data })
}

// ============================================================================
// Level 6「Lights Out」——狭窄走廊迷宫
// Wikidot：一系列极其狭窄的走廊，材质单一、光滑而冰冷（很可能是混凝土）；
// 彻底黑暗，任何外带光源都不发光；极端寂静，「如同消音室」。
// Fandom 补充：沿墙走的加热液体金属管道 —— 本层唯一的触觉导航线索。
// ============================================================================
function genDarkhall(m: GameMap, rng: RNG, H: GenHelpers): Room[] {
  const { idx } = H
  const size = m.w
  // 回溯法迷宫：奇数格为通道结点，1 格宽 = 「极其狭窄」
  const cw = 1 // 通道宽度
  const cell = cw + 1
  const gw = Math.floor((size - 3) / cell)
  const gh = Math.floor((size - 3) / cell)
  const visited = new Uint8Array(gw * gh)
  const carveCell = (gx: number, gy: number) => {
    const x0 = 2 + gx * cell, y0 = 2 + gy * cell
    for (let j = 0; j < cw; j++) for (let i = 0; i < cw; i++) m.tiles[idx(m, x0 + i, y0 + j)] = 1
  }
  const carveLink = (gx: number, gy: number, dx: number, dy: number) => {
    const x0 = 2 + gx * cell, y0 = 2 + gy * cell
    for (let k = cw; k < cell; k++)
      for (let t = 0; t < cw; t++)
        m.tiles[idx(m, x0 + dx * k + (dy ? t : 0), y0 + dy * k + (dx ? t : 0))] = 1
  }
  const stack: [number, number][] = [[gw >> 1, gh >> 1]]
  visited[(gh >> 1) * gw + (gw >> 1)] = 1
  carveCell(gw >> 1, gh >> 1)
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1]
    const dirs = rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][])
    let moved = false
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || visited[ny * gw + nx]) continue
      visited[ny * gw + nx] = 1
      carveLink(cx, cy, dx, dy)
      carveCell(nx, ny)
      stack.push([nx, ny])
      moved = true
      break
    }
    if (!moved) stack.pop()
  }
  // 打环：少量额外连接，避免纯树状死路太多（Wikidot 也提到走错方向会永久封路，保留大量死胡同）
  for (let i = 0; i < gw * gh * 0.06; i++) {
    const gx = rng.int(0, gw - 2), gy = rng.int(0, gh - 2)
    if (rng.chance(0.5)) carveLink(gx, gy, 1, 0)
    else carveLink(gx, gy, 0, 1)
  }
  // 少量小室（前人扎营处/交汇厅）
  const rooms: Room[] = []
  for (let i = 0; i < 7; i++) {
    const w = rng.int(3, 5), h = rng.int(3, 5)
    const x = 2 + rng.int(0, gw - 4) * cell, y = 2 + rng.int(0, gh - 4) * cell
    if (x + w >= size - 2 || y + h >= size - 2) continue
    H.carveRoom(m, x, y, w, h)
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) })
  }
  if (!rooms.length) rooms.push({ x: 2, y: 2, w: 3, h: 3, cx: 3, cy: 3 })

  // 「世界最安静的房间」：一条走廊尽头的小室，墙上有那个电灯开关。官方警告：不要拨。
  const q = rooms[rooms.length - 1]
  S(m, 'lightswitch', q.cx, q.cy, 1, 1, false, { warned: 1 })
  S(m, 'graffiti', q.x, q.y, 1, 1, false, { lore: 4 })

  // 加热液体金属管道：沿走廊贴墙铺设，是黑暗中唯一能摸着走的东西
  for (let t = 0; t < 26; t++) H.placeWallHug(m, rng, 'hotpipe', { warm: 1 })
  // 前人刻在墙上的方向记号
  for (let t = 0; t < 14; t++) H.placeWallHug(m, rng, 'braille', { mark: rng.int(0, 3) })
  // 绊线（绊到即切出 Level 6.1）
  for (let t = 0; t < 6; t++) H.place(m, rng, 'tripwire', 1, 1, false)
  // 前人留下的东西
  for (let t = 0; t < 7; t++) H.place(m, rng, 'crate', 1, 1, true, { loot: 1 })
  for (let t = 0; t < 5; t++) H.place(m, rng, 'corpse', 1, 1, false, { loot: 1 })
  return rooms
}

// ============================================================================
// Level 7「Thalassophobia」——入口房间 + 无限海洋
// Wikidot：入口房间侧向嵌在海洋空间的天花板里（书柜/咖啡桌/椅子/荧光吸顶灯/地毯积水），
// 站到门前重力会被强制切换，直接坠落约 4.5 米到水面；海洋无限延伸，上方高悬混凝土天花板；
// 没有固定光源却有弥漫的昏暗自然光；散布着未知岩石构成的岛，多数无人。
// v57：Level 7 已切换为 infiniteL7.ts 无限生成；本函数仅保留为有限 genOcean 的旧路径/死代码。
// ============================================================================
function genOcean(m: GameMap, rng: RNG, H: GenHelpers): Room[] {
  const { idx } = H
  const size = m.w
  // 整片开凿为海洋
  H.carveRoom(m, 2, 2, size - 4, size - 4)
  for (let y = 2; y < size - 2; y++)
    for (let x = 2; x < size - 2; x++) {
      const i = idx(m, x, y)
      m.liquid[i] = 1 // 深水：可下沉游泳
      m.wet[i] = 1
    }

  // ---- 入口房间：地图西北角，抬升为高台（elev=2），与海面之间是那道致命的门槛 ----
  const ex = 4, ey = 4, ew = 8, eh = 6
  for (let y = ey; y < ey + eh; y++)
    for (let x = ex; x < ex + ew; x++) {
      const i = idx(m, x, y)
      m.tiles[i] = 1; m.liquid[i] = 0; m.wet[i] = 1; m.elev[i] = 2 // 高台 +1.2m
    }
  // 房间四壁（只在南缘留门口——门口之外就是海）
  for (let x = ex - 1; x <= ex + ew; x++) {
    m.tiles[idx(m, x, ey - 1)] = 2
    if (x !== ex + 3 && x !== ex + 4) m.tiles[idx(m, x, ey + eh)] = 2
  }
  for (let y = ey - 1; y <= ey + eh; y++) { m.tiles[idx(m, ex - 1, y)] = 2; m.tiles[idx(m, ex + ew, y)] = 2 }
  // 陈设：左墙书柜、小咖啡桌、一把椅子、荧光吸顶灯
  S(m, 'bookcase', ex, ey + 1, 1, 3, true, { loot: 1 })
  S(m, 'table', ex + 3, ey + 2, 1, 1, true)
  S(m, 'lightgrid', ex + 3, ey + 1, 2, 1, false)
  m.lights.push({ x: ex + 4, y: ey + 2, r: 5.5, color: '#eae2c4', flickerSeed: rng.next() * 100 })
  S(m, 'graffiti', ex + 1, ey, 1, 1, false, { lore: 1 })

  const rooms: Room[] = [{ x: ex, y: ey, w: ew, h: eh, cx: ex + 3, cy: ey + 2 }]

  // ---- 岩石岛：由未知岩石构成，多数无人 ----
  const isles: { x: number; y: number; r: number }[] = []
  for (let t = 0; t < 26; t++) {
    const r = rng.int(2, 4)
    const cx = rng.int(8, size - 9), cy = rng.int(8, size - 9)
    if (Math.hypot(cx - (ex + 4), cy - (ey + 3)) < 10) continue
    if (isles.some((s) => Math.hypot(s.x - cx, s.y - cy) < s.r + r + 4)) continue
    isles.push({ x: cx, y: cy, r })
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 3 || y < 3 || x >= size - 3 || y >= size - 3) continue
        if (Math.hypot(x - cx, y - cy) > r + 0.2) continue
        const i = idx(m, x, y)
        m.tiles[i] = 1; m.liquid[i] = 0; m.wet[i] = 0
        m.elev[i] = Math.hypot(x - cx, y - cy) < r - 1.1 ? 2 : 0 // 岛心抬高，岸线平齐水面
      }
    S(m, 'rockisle', cx, cy, 1, 1, false)
    rooms.push({ x: cx - r, y: cy - r, w: r * 2 + 1, h: r * 2 + 1, cx, cy })
  }

  // ---- 深度带遗骸：Twilight 的锈铁与骨头、Midnight 的巨鱼骨架、Abyss 的焦油堆 ----
  for (let t = 0; t < 12; t++) H.place(m, rng, 'bonepile', 1, 1, false, { loot: 1 })
  for (let t = 0; t < 4; t++) H.place(m, rng, 'fishbones', 3, 2, false)
  for (let t = 0; t < 5; t++) H.place(m, rng, 'seatarpit', 2, 2, false, { bubbles: 1 })
  for (let t = 0; t < 8; t++) H.place(m, rng, 'barrel', 1, 1, true, { loot: 1 })
  for (let t = 0; t < 4; t++) H.place(m, rng, 'corpse', 1, 1, false, { loot: 1 })

  // 弥漫的、来源不明的昏暗自然光——不是灯，所以铺得很开、很弱
  for (let t = 0; t < 16; t++) {
    m.lights.push({
      x: rng.int(5, size - 6) + 0.5, y: rng.int(5, size - 6) + 0.5,
      r: rng.range(7, 11), color: '#8fb6c4', flickerSeed: rng.next() * 100,
    })
  }
  return rooms
}

// ============================================================================
// Level 8「Cave Systems」——喀斯特洞穴网络（元胞自动机）
// Wikidot：纯天然喀斯特结构，没有任何人工工程痕迹；岩刺从墙壁各角度混乱突出；
// 杏仁水自由流淌并混乱涨落；本层特征性地黑暗且会主动削弱光。
// ============================================================================
function genCaves(m: GameMap, rng: RNG, H: GenHelpers): Room[] {
  const { idx } = H
  const size = m.w
  // --- 元胞自动机 ---
  let grid = new Uint8Array(size * size) // 1=岩石
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      grid[y * size + x] = (x < 3 || y < 3 || x >= size - 3 || y >= size - 3 || rng.chance(0.45)) ? 1 : 0
  const wallsAround = (g: Uint8Array, x: number, y: number) => {
    let n = 0
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        if (i === 0 && j === 0) continue
        const nx = x + i, ny = y + j
        n += (nx < 0 || ny < 0 || nx >= size || ny >= size) ? 1 : g[ny * size + nx]
      }
    return n
  }
  for (let pass = 0; pass < 5; pass++) {
    const next = new Uint8Array(size * size)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) { next[y * size + x] = 1; continue }
        const n = wallsAround(grid, x, y)
        next[y * size + x] = n > 4 ? 1 : n < 4 ? 0 : grid[y * size + x]
      }
    grid = next
  }
  // 取最大连通洞腔，其余填实（避免大量孤岛）
  const label = new Int32Array(size * size).fill(-1)
  let best = -1, bestN = 0, lab = 0
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i0 = y * size + x
      if (grid[i0] === 1 || label[i0] >= 0) continue
      const q: number[] = [i0]; label[i0] = lab
      let n = 0
      while (q.length) {
        const i = q.pop()!
        n++
        const cx = i % size, cy = (i / size) | 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, ny = cy + dy, ni = ny * size + nx
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || grid[ni] === 1 || label[ni] >= 0) continue
          label[ni] = lab; q.push(ni)
        }
      }
      if (n > bestN) { bestN = n; best = lab }
      lab++
    }
  for (let i = 0; i < size * size; i++) m.tiles[i] = (grid[i] === 0 && label[i] === best) ? 1 : 2

  // --- 洞厅（地标）：在洞腔里找几处宽阔区域 ---
  const rooms: Room[] = []
  const openAt = (x: number, y: number, r: number) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const nx = x + i, ny = y + j
      if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) return false
      if (m.tiles[idx(m, nx, ny)] !== 1) return false
    }
    return true
  }
  const findHall = (r: number): { x: number; y: number } | null => {
    for (let t = 0; t < 900; t++) {
      const x = rng.int(r + 2, size - r - 3), y = rng.int(r + 2, size - r - 3)
      if (openAt(x, y, r)) return { x, y }
    }
    return null
  }
  // 第一处宽阔洞厅 = 出生点（Hollow Nest 前哨的方向）
  const hub = findHall(3) ?? { x: size >> 1, y: size >> 1 }
  rooms.push({ x: hub.x - 3, y: hub.y - 3, w: 7, h: 7, cx: hub.x, cy: hub.y })
  S(m, 'campstall', hub.x, hub.y - 2, 2, 1, true, { loot: 1, trade: 1 })
  S(m, 'roadsign', hub.x + 2, hub.y + 1, 1, 1, false, { meg: 1 })
  m.lights.push({ x: hub.x + 0.5, y: hub.y + 0.5, r: 5, color: '#ffd9a0', flickerSeed: rng.next() * 100 })

  // Handyland：手形岩刺群 + 血红色生物发光苔藓（官方定级：最应回避）
  const hand = findHall(4)
  if (hand) {
    rooms.push({ x: hand.x - 4, y: hand.y - 4, w: 9, h: 9, cx: hand.x, cy: hand.y })
    for (let t = 0; t < 16; t++) {
      const x = hand.x + rng.int(-4, 4), y = hand.y + rng.int(-4, 4)
      if (m.tiles[idx(m, x, y)] !== 1) continue
      S(m, 'handspike', x, y, 1, 1, rng.chance(0.4), { moss: 1 })
    }
    m.lights.push({ x: hand.x + 0.5, y: hand.y + 0.5, r: 6, color: '#c0231c', flickerSeed: rng.next() * 100 })
  }
  // Rottnest Jungle：多彩生物发光蘑菇森林（部分能长到小树大小）
  const jungle = findHall(4)
  if (jungle) {
    rooms.push({ x: jungle.x - 4, y: jungle.y - 4, w: 9, h: 9, cx: jungle.x, cy: jungle.y })
    for (let t = 0; t < 18; t++) {
      const x = jungle.x + rng.int(-4, 4), y = jungle.y + rng.int(-4, 4)
      if (m.tiles[idx(m, x, y)] !== 1) continue
      const tall = rng.chance(0.3)
      S(m, 'glowshroom', x, y, 1, 1, tall, { tall: tall ? 1 : 0, hue: rng.int(0, 5) })
      if (rng.chance(0.35)) m.lights.push({ x: x + 0.5, y: y + 0.5, r: 3, color: ['#66e0d0', '#e066c8', '#c8e066', '#66a8e0'][rng.int(0, 3)], flickerSeed: rng.next() * 100 })
    }
  }
  // Hyperspace Lane：发光细菌照亮的窄道 + 淡水溪（浅水）+ 溪底的氙气玻璃珠
  const lane = findHall(2)
  if (lane) {
    for (let t = -6; t <= 6; t++) {
      const x = lane.x + t, y = lane.y
      if (x < 2 || x >= size - 2 || m.tiles[idx(m, x, y)] !== 1) continue
      m.liquid[idx(m, x, y)] = 2 // 浅水：冰冷清澈的淡水溪
      m.wet[idx(m, x, y)] = 1
      if (rng.chance(0.35)) m.lights.push({ x: x + 0.5, y: y + 0.5, r: 2.6, color: '#66e0d0', flickerSeed: rng.next() * 100 })
    }
    m.items.push({ id: 870000 + rng.int(1, 999), type: 'xenonmarble', x: lane.x + 0.5, y: lane.y + 0.5 })
  }
  // New Movile Cave：硫化氢洞厅（微生物席）
  const movile = findHall(3)
  if (movile) {
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const x = movile.x + i, y = movile.y + j
      if (m.tiles[idx(m, x, y)] === 1) m.wet[idx(m, x, y)] = 1
    }
    S(m, 'graffiti', movile.x, movile.y, 1, 1, false, { lore: 2 })
    m.lights.push({ x: movile.x + 0.5, y: movile.y + 0.5, r: 4, color: '#b8d84a', flickerSeed: rng.next() * 100 })
  }

  // --- 岩刺：从墙壁的各个角度混乱地向外突出 ---
  for (let t = 0; t < 70; t++) H.placeWallHug(m, rng, 'stalagspike', { knot: rng.int(0, 3) })
  for (let t = 0; t < 22; t++) H.place(m, rng, 'stalagspike', 1, 1, rng.chance(0.35), { knot: rng.int(0, 3) })
  // --- 焦油之手：靠近就会有覆满焦油的手臂伸出来 ---
  for (let t = 0; t < 6; t++) H.place(m, rng, 'tarhands', 2, 2, false, { hot: 1 })
  // --- 第九之路路标：每约 50 米一个，带 M.E.G. 标志 ---
  for (let t = 0; t < 12; t++) H.place(m, rng, 'roadsign', 1, 1, false, { meg: 1 })
  // --- 杏仁水在洞穴中自由流淌 ---
  for (let t = 0; t < 10; t++) {
    const x = rng.int(4, size - 5), y = rng.int(4, size - 5)
    for (let j = 0; j < 5; j++) {
      const nx = x + rng.int(-2, 2), ny = y + rng.int(-2, 2)
      if (m.tiles[idx(m, nx, ny)] === 1) { m.liquid[idx(m, nx, ny)] = 2; m.wet[idx(m, nx, ny)] = 1 }
    }
  }
  for (let t = 0; t < 10; t++) H.place(m, rng, 'crate', 1, 1, true, { loot: 1 })
  for (let t = 0; t < 8; t++) H.place(m, rng, 'bonepile', 1, 1, false, { loot: 1 })
  for (let t = 0; t < 6; t++) H.place(m, rng, 'corpse', 1, 1, false, { loot: 1 })
  return rooms
}

// ============================================================================
// Level 9「The Suburbs」——午夜郊区
// Wikidot：无限延伸的郊区，湿沥青、未画路标线、落叶与水洼；房屋各不相同、有家具但没有电；
// 多数路灯熄灭，部分闪烁；两栋房子会诡异地互相「卡模」嵌套。
// ============================================================================
function genSuburb(m: GameMap, rng: RNG, H: GenHelpers): Room[] {
  const { idx } = H
  const size = m.w
  H.carveRoom(m, 2, 2, size - 4, size - 4)
  // 全境室外：湿沥青与草地
  for (let y = 2; y < size - 2; y++)
    for (let x = 2; x < size - 2; x++) {
      const i = idx(m, x, y)
      m.outdoor[i] = 1; m.elev[i] = 3
    }

  const rooms: Room[] = []
  const BLOCK = 16 // 街区尺寸
  const ROAD = 3   // 路宽
  // 街道网格（湿沥青，水洼）
  for (let g = 4; g < size - 4; g += BLOCK) {
    for (let t = 0; t < ROAD; t++) {
      for (let x = 3; x < size - 3; x++) {
        const i = idx(m, x, g + t)
        if (rng.chance(0.12)) m.wet[i] = 1 // 水洼
      }
      for (let y = 3; y < size - 3; y++) {
        const i = idx(m, g + t, y)
        if (rng.chance(0.12)) m.wet[i] = 1
      }
    }
  }

  // 房屋：每个街区放 1–2 栋，各不相同（尺寸随机、朝向随机、带后院栅栏）
  const houseAt = (bx: number, by: number, bw: number, bh: number) => {
    const w = rng.int(6, Math.min(9, bw - 2)), h = rng.int(5, Math.min(8, bh - 2))
    const x = bx + rng.int(1, Math.max(1, bw - w - 1)), y = by + rng.int(1, Math.max(1, bh - h - 1))
    if (x + w >= size - 3 || y + h >= size - 3) return
    // 室内：取消室外标记，砌墙
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        const ii = idx(m, i, j)
        m.outdoor[ii] = 0; m.elev[ii] = 0; m.tiles[ii] = 1
      }
    for (let i = x - 1; i <= x + w; i++) { m.tiles[idx(m, i, y - 1)] = 2; m.tiles[idx(m, i, y + h)] = 2 }
    for (let j = y - 1; j <= y + h; j++) { m.tiles[idx(m, x - 1, j)] = 2; m.tiles[idx(m, x + w, j)] = 2 }
    // 前门（朝南）
    const dx = x + (w >> 1)
    m.tiles[idx(m, dx, y + h)] = 1
    S(m, 'hoteldoor', dx, y + h, 1, 1, true, { open: 0, locked: rng.chance(0.35) ? 1 : 0 })
    // 家具：沙发桌、床、冰箱、柜子——都在，只是永远没有电
    S(m, 'house', x, y, w, h, false, { mark: 1 })
    S(m, 'table', x + 1, y + 1, 1, 1, true)
    S(m, 'bed', x + w - 2, y + 1, 1, 2, true)
    S(m, 'fridge', x + 1, y + h - 2, 1, 1, true, { loot: 1 })
    if (rng.chance(0.7)) S(m, 'dresser', x + w - 2, y + h - 2, 1, 1, true, { loot: 1 })
    if (rng.chance(0.5)) S(m, 'suitcase', x + 2, y + h - 2, 1, 1, true, { loot: 1 })
    if (rng.chance(0.45)) S(m, 'windowblack', x + 2, y - 1, 1, 1, false)
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) })
    // 信箱与栅栏
    S(m, 'mailbox', dx + 1, Math.min(size - 4, y + h + 2), 1, 1, true, { loot: 1 })
    for (let i = x - 1; i <= x + w; i += 2) {
      const fy = Math.min(size - 4, y + h + 3)
      if (m.tiles[idx(m, i, fy)] === 1) S(m, 'picketfence', i, fy, 1, 1, false)
    }
  }
  for (let by = 4; by < size - BLOCK; by += BLOCK)
    for (let bx = 4; bx < size - BLOCK; bx += BLOCK) {
      houseAt(bx + ROAD, by + ROAD, BLOCK - ROAD - 2, BLOCK - ROAD - 2)
      if (rng.chance(0.45)) houseAt(bx + ROAD, by + ROAD, BLOCK - ROAD - 2, BLOCK - ROAD - 2)
    }
  if (!rooms.length) rooms.push({ x: 5, y: 5, w: 4, h: 4, cx: 7, cy: 7 })

  // 「卡模」双子屋：两栋房子诡异地互相嵌套（本层最标志性的空间异常）
  if (rooms.length > 2) {
    const r = rooms[rng.int(1, rooms.length - 1)]
    S(m, 'clipfuse', r.cx, r.cy, 2, 2, false, { anomaly: 1 })
  }

  // 路灯：多数熄灭，部分闪烁，少数正常亮着（电源来源不明）
  for (let g = 4; g < size - 4; g += BLOCK)
    for (let t = 6; t < size - 6; t += 9) {
      for (const [lx, ly] of [[g + 1, t], [t, g + 1]] as const) {
        if (lx < 3 || ly < 3 || lx >= size - 3 || ly >= size - 3) continue
        if (m.tiles[idx(m, lx, ly)] !== 1 || m.outdoor[idx(m, lx, ly)] !== 1) continue
        const state = rng.next()
        const mode = state < 0.62 ? 0 : state < 0.88 ? 1 : 2 // 0=熄灭 1=闪烁 2=常亮
        S(m, 'streetlamp', lx, ly, 1, 1, true, { mode })
        if (mode > 0) m.lights.push({ x: lx + 0.5, y: ly + 0.5, r: mode === 2 ? 5.5 : 4.5, color: '#ffcf8a', flickerSeed: mode === 1 ? rng.next() * 100 : 0 })
      }
    }
  // 游乐场管道结构（内部发白光 → Level 283）
  for (let t = 0; t < 2; t++) H.place(m, rng, 'playpipe', 2, 2, true, { glow: 1 })
  // 街上的车（无燃料）与散落物
  for (let t = 0; t < 10; t++) H.place(m, rng, 'car', rng.chance(0.5) ? 2 : 1, rng.chance(0.5) ? 1 : 2, true, { loot: 1 })
  for (let t = 0; t < 8; t++) H.place(m, rng, 'crate', 1, 1, true, { loot: 1 })
  for (let t = 0; t < 6; t++) H.place(m, rng, 'corpse', 1, 1, false, { loot: 1 })
  return rooms
}

// ============================================================================
// Level 10「Bumper Crop」——无限麦田
// Wikidot：小麦与大麦田向四面八方无限延伸，由成行的树木与灌木分割成一块块地块；
// 阴沉铅灰的天空，没有明显的昼夜循环；土路由两道车辙组成，中间夹一条草带。
// ============================================================================
function genField(m: GameMap, rng: RNG, H: GenHelpers): Room[] {
  const { idx } = H
  const size = m.w
  H.carveRoom(m, 2, 2, size - 4, size - 4)
  for (let y = 2; y < size - 2; y++)
    for (let x = 2; x < size - 2; x++) {
      const i = idx(m, x, y)
      m.outdoor[i] = 1; m.elev[i] = 3
    }

  const rooms: Room[] = []
  // 树篱：把田地切成一块块 plot（始终保持同一高度，不会长高 → 一律做成实心矮墙结构）
  const PLOT = 18
  for (let g = 3 + PLOT; g < size - 4; g += PLOT) {
    const gap1 = rng.int(6, size - 8), gap2 = rng.int(6, size - 8)
    for (let x = 3; x < size - 3; x++) {
      if (Math.abs(x - gap1) < 3 || Math.abs(x - gap2) < 3) continue
      S(m, 'hedgerow', x, g, 1, 1, true)
    }
    for (let y = 3; y < size - 3; y++) {
      if (Math.abs(y - gap1) < 3 || Math.abs(y - gap2) < 3) continue
      S(m, 'hedgerow', g, y, 1, 1, true)
    }
  }
  // 双车辙土路（中间夹一条草带）——本层唯一的人造导航线
  const roadY = 3 + PLOT * (rng.int(0, 1) + 1) - Math.floor(PLOT / 2)
  for (let x = 3; x < size - 3; x++) {
    for (const dy of [-1, 1]) {
      const i = idx(m, x, roadY + dy)
      if (i >= 0 && i < size * size) m.wet[i] = 1 // 深湿褐的车辙
    }
    // 车辙不会被植被重新覆盖：清掉压在路上的树篱
    for (let dy = -1; dy <= 1; dy++) {
      const s = m.structures.findIndex((st) => st.kind === 'hedgerow' && st.x === x && st.y === roadY + dy)
      if (s >= 0) m.structures.splice(s, 1)
    }
  }

  // 麦丛：成片铺开（非实心，只减速与遮挡视野）
  for (let t = 0; t < 260; t++) {
    const x = rng.int(3, size - 4), y = rng.int(3, size - 4)
    if (Math.abs(y - roadY) < 3) continue
    if (m.tiles[idx(m, x, y)] !== 1) continue
    S(m, 'wheatpatch', x, y, 1, 1, false, { barley: rng.chance(0.35) ? 1 : 0 })
  }

  // 谷仓与马厩（较大的木质建筑，内部基本空置，只有木材与钉子）
  const barnAt = () => {
    for (let t = 0; t < 300; t++) {
      const w = rng.int(7, 10), h = rng.int(6, 8)
      const x = rng.int(4, size - w - 5), y = rng.int(4, size - h - 5)
      let ok = true
      for (let j = y - 1; j < y + h + 1 && ok; j++)
        for (let i = x - 1; i < x + w + 1 && ok; i++)
          if (m.structures.some((s) => s.kind !== 'wheatpatch' && i >= s.x && i < s.x + s.w && j >= s.y && j < s.y + s.h)) ok = false
      if (!ok) continue
      // 清掉麦丛，砌木墙
      m.structures = m.structures.filter((s) => !(s.kind === 'wheatpatch' && s.x >= x - 1 && s.x <= x + w && s.y >= y - 1 && s.y <= y + h))
      for (let j = y; j < y + h; j++)
        for (let i = x; i < x + w; i++) { const ii = idx(m, i, j); m.outdoor[ii] = 0; m.elev[ii] = 0; m.tiles[ii] = 1 }
      for (let i = x - 1; i <= x + w; i++) { m.tiles[idx(m, i, y - 1)] = 2; m.tiles[idx(m, i, y + h)] = 2 }
      for (let j = y - 1; j <= y + h; j++) { m.tiles[idx(m, x - 1, j)] = 2; m.tiles[idx(m, x + w, j)] = 2 }
      const dx = x + (w >> 1)
      m.tiles[idx(m, dx, y + h)] = 1
      m.tiles[idx(m, dx + 1, y + h)] = 1
      S(m, 'barn', x, y, w, h, false, { mark: 1 })
      S(m, 'toolbox', x + 1, y + 1, 1, 1, true, { loot: 1 })
      S(m, 'crate', x + w - 2, y + 1, 1, 1, true, { loot: 1 })
      if (rng.chance(0.6)) S(m, 'crate', x + 1, y + h - 2, 1, 1, true, { loot: 1 })
      // v54：谷仓装饰梯删除（纯装饰不可交互——只保留 data.climb 攀爬梯）
      m.lights.push({ x: dx + 0.5, y: y + h - 1.5, r: 4, color: '#c8c4b0', flickerSeed: 0 })
      rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) })
      return true
    }
    return false
  }
  barnAt(); barnAt()
  if (rng.chance(0.6)) barnAt()
  if (!rooms.length) rooms.push({ x: 6, y: roadY - 4, w: 4, h: 3, cx: 8, cy: roadY - 3 })

  // 湖泊（清澈、可安全饮用、位于统一的低洼标高）
  for (let t = 0; t < 2; t++) {
    const r = rng.int(4, 6)
    const cx = rng.int(r + 5, size - r - 6), cy = rng.int(r + 5, size - r - 6)
    if (Math.abs(cy - roadY) < r + 3) continue
    for (let j = cy - r; j <= cy + r; j++)
      for (let i = cx - r; i <= cx + r; i++) {
        if (i < 3 || j < 3 || i >= size - 3 || j >= size - 3) continue
        if (Math.hypot(i - cx, j - cy) > r) continue
        const ii = idx(m, i, j)
        if (m.tiles[ii] !== 1 || m.outdoor[ii] !== 1) continue
        m.liquid[ii] = Math.hypot(i - cx, j - cy) < r - 1.5 ? 1 : 2
        m.wet[ii] = 1
      }
    m.structures = m.structures.filter((s) => !(s.kind === 'wheatpatch' && Math.hypot(s.x - cx, s.y - cy) <= r))
  }

  // 罕见的油菜地块（刺眼的黄——它不属于这里的调色板，它是一扇门）
  for (let t = 0; t < 260; t++) {
    const x = rng.int(6, size - 8), y = rng.int(6, size - 8)
    if (m.tiles[idx(m, x, y)] !== 1 || m.liquid[idx(m, x, y)]) continue
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) S(m, 'canolaplot', x + i, y + j, 1, 1, false)
    break
  }
  for (let t = 0; t < 6; t++) H.place(m, rng, 'crate', 1, 1, true, { loot: 1 })
  for (let t = 0; t < 3; t++) H.place(m, rng, 'corpse', 1, 1, false, { loot: 1 })
  return rooms
}

// ============================================================================
// Level 11「The City That Never Sleeps」——空荡的大都市
// Wikidot：道路呈街区方格排布；建筑高度从 3 层到摩天楼；大量窗户呈暗淡的黑色镀膜镜面；
// 约 1/3 的建筑不可摧毁、上锁、无法进入；可进入的建筑内部陈设稀疏但电器完全可用。
// ============================================================================
function genCity(m: GameMap, rng: RNG, H: GenHelpers): Room[] {
  const { idx } = H
  const size = m.w
  H.carveRoom(m, 2, 2, size - 4, size - 4)
  for (let y = 2; y < size - 2; y++)
    for (let x = 2; x < size - 2; x++) {
      const i = idx(m, x, y)
      m.outdoor[i] = 1; m.elev[i] = 3
    }

  const rooms: Room[] = []
  const BLOCK = 15, ROAD = 4
  const blocks: { x: number; y: number; w: number; h: number }[] = []
  for (let by = 3; by + BLOCK < size - 3; by += BLOCK + ROAD)
    for (let bx = 3; bx + BLOCK < size - 3; bx += BLOCK + ROAD)
      blocks.push({ x: bx, y: by, w: BLOCK, h: BLOCK })

  let opened = 0
  for (const b of blocks) {
    // 约 1/3 建筑不可进入：整块砌成实心楼体
    const enterable = rng.chance(0.62)
    if (!enterable) {
      for (let j = b.y; j < b.y + b.h; j++)
        for (let i = b.x; i < b.x + b.w; i++) { const ii = idx(m, i, j); m.tiles[ii] = 2; m.outdoor[ii] = 0 }
      S(m, 'towerblock', b.x, b.y, b.w, b.h, false, { floors: rng.int(3, 12), sealed: 1 })
      // 沿街立面的黑色镀膜镜面窗
      for (let i = b.x + 1; i < b.x + b.w - 1; i += 3) {
        S(m, 'blackwindow', i, b.y - 1, 1, 1, false)
        S(m, 'blackwindow', i, b.y + b.h, 1, 1, false)
      }
      continue
    }
    // 可进入建筑：外墙 + 沿街店面门 + 稀疏内部（电器可用）
    for (let i = b.x; i < b.x + b.w; i++) { m.tiles[idx(m, i, b.y)] = 2; m.tiles[idx(m, i, b.y + b.h - 1)] = 2 }
    for (let j = b.y; j < b.y + b.h; j++) { m.tiles[idx(m, b.x, j)] = 2; m.tiles[idx(m, b.x + b.w - 1, j)] = 2 }
    for (let j = b.y + 1; j < b.y + b.h - 1; j++)
      for (let i = b.x + 1; i < b.x + b.w - 1; i++) { const ii = idx(m, i, j); m.tiles[ii] = 1; m.outdoor[ii] = 0; m.elev[ii] = 0 }
    // 内部隔断：把街区切成 2–3 间铺面
    const cut = b.x + rng.int(5, b.w - 6)
    for (let j = b.y + 1; j < b.y + b.h - 1; j++) if (rng.chance(0.85)) m.tiles[idx(m, cut, j)] = 2
    m.tiles[idx(m, cut, b.y + (b.h >> 1))] = 1
    // 沿街的门与店招
    const dxs = [b.x + rng.int(2, cut - b.x - 1), cut + rng.int(2, b.x + b.w - cut - 3)]
    for (const dx of dxs) {
      if (dx <= b.x || dx >= b.x + b.w - 1) continue
      m.tiles[idx(m, dx, b.y + b.h - 1)] = 1
      S(m, 'hoteldoor', dx, b.y + b.h - 1, 1, 1, true, { open: 0, locked: rng.chance(0.2) ? 1 : 0 })
      S(m, 'shopfront', dx, b.y + b.h, 1, 1, false, { sign: rng.int(0, 6) })
    }
    // 立面黑窗
    for (let i = b.x + 1; i < b.x + b.w - 1; i += 3) {
      if (rng.chance(0.7)) S(m, 'blackwindow', i, b.y, 1, 1, false)
      if (rng.chance(0.5)) S(m, 'blackwindow', i, b.y + b.h - 1, 1, 1, false)
    }
    // 陈设稀疏，但电器完全可用（照明、暖气、水龙头）
    S(m, 'towerblock', b.x, b.y, b.w, b.h, false, { floors: rng.int(3, 9) })
    const inner: [StructKind, number][] = [['vending', 0.6], ['locker', 0.6], ['crate', 0.5], ['suitcase', 0.4], ['desk', 0.5], ['table', 0.6], ['fridge', 0.4]]
    for (const [k, p] of inner) {
      if (!rng.chance(p)) continue
      const x = b.x + rng.int(1, b.w - 2), y = b.y + rng.int(1, b.h - 2)
      if (m.tiles[idx(m, x, y)] !== 1) continue
      S(m, k, x, y, 1, 1, true, k === 'vending' ? { trade: 1 } : { loot: 1 })
    }
    m.lights.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, r: 6, color: '#ffe6b8', flickerSeed: 0 })
    rooms.push({ x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2, cx: b.x + (b.w >> 1), cy: b.y + (b.h >> 1) })
    opened++
  }
  if (!opened) rooms.push({ x: 5, y: 5, w: 4, h: 4, cx: 7, cy: 7 })

  // 地铁入口（沿地面路网无限延伸）
  for (let t = 0; t < 4; t++) H.place(m, rng, 'subwayent', 2, 1, true, { line: rng.int(0, 4) })
  // 位置不合常理的街机柜（任何交互都会送你去 Level 25）
  for (let t = 0; t < 3; t++) H.place(m, rng, 'arcadecab', 1, 1, true, { l25: 1 })
  // M.E.G. 标记与路牌
  for (let t = 0; t < 5; t++) H.place(m, rng, 'megsign', 1, 1, false, { meg: 1 })
  // 路灯：整座城市的灯都亮着
  for (let t = 0; t < 24; t++) {
    const s = H.place(m, rng, 'streetlamp', 1, 1, true, { mode: 2 })
    if (s) m.lights.push({ x: s.x + 0.5, y: s.y + 0.5, r: 6, color: '#ffe6b8', flickerSeed: 0 })
  }
  // 停放的汽车（全部没有燃料）
  for (let t = 0; t < 14; t++) H.place(m, rng, 'car', rng.chance(0.5) ? 2 : 1, rng.chance(0.5) ? 1 : 2, true, { loot: 1, nofuel: 1 })
  for (let t = 0; t < 8; t++) H.place(m, rng, 'crate', 1, 1, true, { loot: 1 })
  for (let t = 0; t < 4; t++) H.place(m, rng, 'corpse', 1, 1, false, { loot: 1 })
  return rooms
}

// ============================================================================
// Level 601「The End」——近乎无限的现代图书馆
// Wikidot：中央有金属字母拼出 "the end is near"；它会为闯入者制造个人化的假现实，
// 复刻其熟悉的环境，让人以为自己已经安全到家。实为死循环，栖息着 Partygoers。
// ============================================================================
function genLibrary(m: GameMap, rng: RNG, H: GenHelpers): Room[] {
  const { idx } = H
  const size = m.w
  H.carveRoom(m, 3, 3, size - 6, size - 6)
  const rooms: Room[] = []

  // 中央广场：金属字母 the end is near
  const cx = size >> 1, cy = size >> 1
  rooms.push({ x: cx - 4, y: cy - 4, w: 9, h: 9, cx, cy })
  S(m, 'endletters', cx - 3, cy, 7, 1, false, { text: 1 })
  m.lights.push({ x: cx + 0.5, y: cy + 0.5, r: 7, color: '#fff0cc', flickerSeed: 0 })

  // 书架阵列：一排排整齐的现代图书馆书架，中间留出通道
  for (let y = 6; y < size - 6; y += 4) {
    for (let x = 6; x < size - 6; x++) {
      if (Math.abs(x - cx) < 6 && Math.abs(y - cy) < 6) continue
      if (x % 13 === 0 || (x + 6) % 13 === 0) continue // 纵向通道
      S(m, 'libshelf', x, y, 1, 1, true, { row: (y / 4) | 0 })
    }
  }
  // 阅览桌与壁灯
  for (let t = 0; t < 10; t++) H.place(m, rng, 'table', 1, 1, true)
  for (let t = 0; t < 12; t++) {
    const s = H.placeWallHug(m, rng, 'sconce')
    if (s) m.lights.push({ x: s.x + 0.5, y: s.y + 0.5, r: 4, color: '#fff0cc', flickerSeed: 0 })
  }
  // 「你家的前门」：走廊尽头一扇门，门缝底下透着暖黄的光
  for (let t = 0; t < 400; t++) {
    const x = rng.int(6, size - 7), y = rng.int(6, size - 7)
    if (Math.hypot(x - cx, y - cy) < 12) continue
    if (m.tiles[idx(m, x, y)] !== 1) continue
    if (m.structures.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) continue
    S(m, 'homedoor', x, y, 1, 1, false, { warm: 1 })
    m.lights.push({ x: x + 0.5, y: y + 0.5, r: 3.5, color: '#ffcf8a', flickerSeed: 0 })
    break
  }
  for (let t = 0; t < 8; t++) H.place(m, rng, 'locker', 1, 1, true, { loot: 1 })
  for (let t = 0; t < 6; t++) H.place(m, rng, 'crate', 1, 1, true, { loot: 1 })
  for (let t = 0; t < 5; t++) H.place(m, rng, 'corpse', 1, 1, false, { loot: 1 })
  return rooms
}
