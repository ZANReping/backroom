// 预制件放置器：在「纯墙/虚空」区域开洞造房 / 植入既有开阔区域
import { RNG } from '../rng'
import type { GameMap } from '../mapgen'
import { idx, isFloor, type PrefabDef } from './shared'
import { PREFABS, levelOf } from './all'

// ---------- 放置器 ----------
interface Placement { x: number; y: number; doorX: number; doorY: number }

// 在「门洞候选墙瓦片」背后尝试放下 w×h 房间（房间区必须全为非地板 → 不与现有内容重叠）
function tryFit(m: GameMap, rng: RNG, w: number, h: number, fx: number, fy: number, dx: number, dy: number): Placement | null {
  const ix = fx + dx, iy = fy + dy // 门内侧瓦片（须在房间内）
  for (let t = 0; t < 28; t++) {
    const x0 = dx !== 0 ? (dx > 0 ? ix : ix - w + 1) : ix - rng.int(1, w - 2)
    const y0 = dy !== 0 ? (dy > 0 ? iy : iy - h + 1) : iy - rng.int(1, h - 2)
    if (x0 < 1 || y0 < 1 || x0 + w > m.w - 1 || y0 + h > m.h - 1) continue
    let ok = true
    for (let j = y0 - 1; j <= y0 + h && ok; j++) {
      for (let i = x0 - 1; i <= x0 + w && ok; i++) {
        // 门洞瓦片四邻允许是现有地板（门洞本来就贴着走廊）
        if (Math.abs(i - fx) + Math.abs(j - fy) <= 1) continue
        if (isFloor(m, i, j)) ok = false
      }
    }
    if (ok) return { x: x0, y: y0, doorX: fx, doorY: fy }
  }
  return null
}

// overlay 模式：在既有开阔地板区找 w×h 全地板矩形（避开实心结构）
function findOverlay(m: GameMap, rng: RNG, w: number, h: number): { x: number; y: number } | null {
  for (let t = 0; t < 300; t++) {
    const x = rng.int(1, m.w - w - 1)
    const y = rng.int(1, m.h - h - 1)
    let ok = true
    for (let j = y; j < y + h && ok; j++)
      for (let i = x; i < x + w && ok; i++)
        if (m.tiles[idx(m, i, j)] !== 1) ok = false
    if (!ok) continue
    if (m.structures.some((s) => s.solid && x - 1 < s.x + s.w && x + w + 1 > s.x && y - 1 < s.y + s.h && y + h + 1 > s.y)) continue
    return { x, y }
  }
  return null
}

// 候选门洞：墙瓦片且恰好一侧邻接地板（走廊边缘）
function computeFrontier(m: GameMap, rng: RNG): { x: number; y: number; dx: number; dy: number }[] {
  const frontier: { x: number; y: number; dx: number; dy: number }[] = []
  for (let y = 2; y < m.h - 2; y++) {
    for (let x = 2; x < m.w - 2; x++) {
      if (m.tiles[idx(m, x, y)] === 1) continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (isFloor(m, x - dx, y - dy) && !isFloor(m, x + dx, y + dy)) {
          frontier.push({ x, y, dx, dy })
        }
      }
    }
  }
  rng.shuffle(frontier)
  return frontier
}

// 放置单个预制件（overlay=植入开阔区 / carve=开洞造房并开门洞连通）
function placeOne(m: GameMap, rng: RNG, def: PrefabDef, frontier: { x: number; y: number; dx: number; dy: number }[]): boolean {
  if (def.mode === 'overlay') {
    // 植入既有开阔区域：不改地形，只摆固定内容
    const spot = findOverlay(m, rng, def.w, def.h)
    if (!spot) return false
    def.fill({ m, rng, x: spot.x, y: spot.y, w: def.w, h: def.h, doorX: -1, doorY: -1 })
    return true
  }
  if (!frontier.length) return false
  let placed: Placement | null = null
  for (const f of frontier) {
    placed = tryFit(m, rng, def.w, def.h, f.x, f.y, f.dx, f.dy)
    if (placed) break
  }
  if (!placed) return false
  // 开洞：房间内部 + 门洞 → 地板
  for (let j = placed.y; j < placed.y + def.h; j++)
    for (let i = placed.x; i < placed.x + def.w; i++)
      m.tiles[idx(m, i, j)] = 1
  m.tiles[idx(m, placed.doorX, placed.doorY)] = 1
  def.fill({ m, rng, x: placed.x, y: placed.y, w: def.w, h: def.h, doorX: placed.doorX, doorY: placed.doorY })
  // v8：门洞内侧瓦片不得被实心家具堵死（否则整间不可达）；移除挡住入口的实心非门结构
  {
    // 找门洞位于房间内的四邻瓦片
    let innerX = -1, innerY = -1
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = placed.doorX + dx, ny = placed.doorY + dy
      if (nx >= placed.x && nx < placed.x + def.w && ny >= placed.y && ny < placed.y + def.h) { innerX = nx; innerY = ny; break }
    }
    if (innerX >= 0) {
      const OPENABLE: readonly string[] = ['hoteldoor', 'rollerdoor', 'glassdoor']
      m.structures = m.structures.filter((s) => {
        if (!s.solid || OPENABLE.includes(s.kind)) return true
        const onInner = innerX >= s.x && innerX < s.x + s.w && innerY >= s.y && innerY < s.y + s.h
        const onDoor = placed.doorX >= s.x && placed.doorX < s.x + s.w && placed.doorY >= s.y && placed.doorY < s.y + s.h
        return !(onInner || onDoor) // 堵住门洞/入口瓦片的实心结构移除
      })
    }
  }
  return true
}

// 植入某层级的全部预制件（在基础地形之后、连通性校验之前调用）
export function placePrefabs(m: GameMap, rng: RNG, level: number, skip?: readonly string[]) {
  const defs = PREFABS.filter((p) => levelOf(p) === level && !(skip && skip.includes(p.id)))
  if (!defs.length) return
  const frontier = computeFrontier(m, rng)
  for (const def of defs) {
    const count = (def.prob >= 1 || rng.chance(def.prob)) ? rng.int(def.min, def.max) : 0
    for (let n = 0; n < count; n++) placeOne(m, rng, def, frontier)
  }
}

// 开发者工具：无视概率强制生成一个指定预制件（已生成地图上没有时使用；
// carve 模式在墙区开洞并与既有地板连通，overlay 模式植入开阔区）
export function placePrefabForced(m: GameMap, rng: RNG, id: string): boolean {
  const def = PREFABS.find((p) => p.id === id)
  if (!def) return false
  return placeOne(m, rng, def, computeFrontier(m, rng))
}
