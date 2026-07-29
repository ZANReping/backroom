// 程序化地图生成：房间+走廊/迷宫混合，按层级 motif 放置结构
import { RNG } from './rng'
import type { LevelDef, Structure, GroundItem, LightSource, ExitInstance } from './types'
import { UNIVERSAL_ITEMS } from './items'
import { makeEntity, ENTITIES, type Entity } from './entities'
import { placePrefabs, scatterFeatures } from './prefabs'
import { generateInfinite, type InfiniteState } from './infinite'
import './infiniteL1' // v29：注册 Level 1 无限 chunk 生成器（副作用导入）
import { genDeep } from './mapgenDeep'

export interface GameMap {
  w: number
  h: number
  tiles: Uint8Array // 0虚空 1地板 2墙
  structures: Structure[]
  items: GroundItem[]
  lights: LightSource[]
  exits: ExitInstance[]
  entities: Entity[]
  spawn: { x: number; y: number }
  wet: Uint8Array // 减速区
  // ---- v7 数据契约：高度与室外 ----
  elev: Uint8Array // 每瓦片：0=正常 1=低洼(-1.2m) 2=高台(+1.2m) 3=室外地面 4=深渊（坠入即死）
  outdoor: Uint8Array // 0=室内 1=室外（无天花板/天空/环境光提高）
  step: Uint8Array // 台阶/坡道：bit0-2=上坡方向(1+x 2-x 3+y 4-y)，bit3-4=低侧 elev，bit5-6=高侧 elev
  crawl: Uint8Array // 1=蹲伏低通道（头顶风道，未蹲伏不可进入）
  ceiling: Uint8Array // 0=正常层高 1=挑高（L5 大堂）
  // ---- v13 数据契约：多层结构与液体 ----
  up: Uint8Array // 1=该瓦片存在上层地板（z=FLOOR_H）；下层 tiles=1 仍可走（楼上楼下双层）
  upWall: Uint8Array // 1=上层墙体（仅阻挡上层通行；下层不受影响）
  stair: Int32Array // 楼梯坡道：0=无；否则 dir(低3位:1+x 2-x 3+y 4-y) | loCm<<3 | hiCm<<17（任意高度连续爬升）
  liquid: Uint8Array // 0=无 1=深水（下沉至 -POOL_DEPTH，可游泳） 2=浅水（仅减速+涟漪）
  floors: number // 可行走楼层总数（1=单层，2=双层）
  // ---- v17 数据契约：无限模式（L0）与墙面/地面 tint ----
  tint: Uint8Array // 0=无 1=马尼拉墙纸 2=红室 3=熄灯区（几何着色/雾氛围用）
  inf?: InfiniteState // 无限 chunk 模式状态（仅 L0；有限层级缺省）
  // ---- v25：栖息地降级计数（`${type}:${habitat}` → 次数；无符合瓦片时降级 any 的告警计数）----
  habitatFallback?: Record<string, number>
}

// ---- v7 高度系统 ----
export const ELEV_H = [0, -1.2, 1.2, 0, -10] as const // elev → 地面高度（米）；3=室外地面=0；4=深渊（深坑洞底，看不见底）
export const STEP_UP = 0.65 // 步行可直接踏上的最大高差（坡道连续过渡，高台需跳）
export const JUMP_REACH = 1.35 // 跳跃可逾越的最大高差（连通性 BFS 通行规则用）

// ---- v13 多层/液体常量 ----
export const FLOOR_H = 3.0 // 上层地板高度（米）
export const BAND_MID = FLOOR_H / 2 // 楼层高度带分界：z ≥ 1.5 视为上层
export const POOL_DEPTH = 1.7 // 深水池深（玩家沉入水下，眼高没入水面）
export const SHALLOW_DEPTH = 0.25 // 浅水洼深（仅减速，不沉没）
export const bandOfZ = (z: number): 0 | 1 => (z >= BAND_MID ? 1 : 0)

// 楼梯编码：dir(1+x 2-x 3+y 4-y) | loCm<<3 | hiCm<<17（厘米整数，支持 0..3m 任意爬升）
export const encStair = (dir: number, loCm: number, hiCm: number) => dir | (loCm << 3) | (hiCm << 17)
const stairLo = (v: number) => ((v >> 3) & 0x3fff) / 100
const stairHi = (v: number) => ((v >> 17) & 0x3fff) / 100

// 瓦片代表高度（台阶/楼梯取中位；连通性/实体规则用）
export function tileH(m: GameMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 0
  const i = ty * m.w + tx
  const s2 = m.stair[i]
  if (s2 & 7) return (stairLo(s2) + stairHi(s2)) / 2
  const st = m.step[i]
  if (st & 7) return (ELEV_H[(st >> 3) & 3] + ELEV_H[(st >> 5) & 3]) / 2
  if (m.liquid[i] === 1) return -POOL_DEPTH
  if (m.liquid[i] === 2) return -SHALLOW_DEPTH
  return ELEV_H[m.elev[i]]
}

// 连续地面高度（世界坐标，坡道 smoothstep 平滑插值；玩家脚底/相机/实体站立用）
// band：楼层高度带（0=主层 1=上层），上层非楼梯瓦片地面=FLOOR_H
export function groundHeightAt(m: GameMap, x: number, y: number, band?: 0 | 1): number {
  const tx = Math.floor(x), ty = Math.floor(y)
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 0
  const i = ty * m.w + tx
  const s2 = m.stair[i]
  if (s2 & 7) { // 楼梯：跨层连续坡道（与 band 无关）
    const dir = s2 & 7
    const low = stairLo(s2), high = stairHi(s2)
    const fx = x - tx, fy = y - ty
    const t0 = dir === 1 ? fx : dir === 2 ? 1 - fx : dir === 3 ? fy : 1 - fy
    const t = t0 * t0 * (3 - 2 * t0)
    return low + (high - low) * t
  }
  if (band === 1) return m.up[i] === 1 ? FLOOR_H : FLOOR_H // 上层：楼板高度（无楼板格由碰撞层拦截）
  const st = m.step[i]
  if (st & 7) {
    const dir = st & 7
    const low = ELEV_H[(st >> 3) & 3], high = ELEV_H[(st >> 5) & 3]
    const fx = x - tx, fy = y - ty
    const t0 = dir === 1 ? fx : dir === 2 ? 1 - fx : dir === 3 ? fy : 1 - fy
    const t = t0 * t0 * (3 - 2 * t0)
    return low + (high - low) * t
  }
  if (m.liquid[i] === 1) return -POOL_DEPTH
  if (m.liquid[i] === 2) return -SHALLOW_DEPTH
  return ELEV_H[m.elev[i]]
}

const idx = (m: { w: number }, x: number, y: number) => y * m.w + x

// v23：可搜索容器（物品生成容器化的目标）
export const CONTAINER_KINDS: readonly string[] = [
  'crate', 'corpse', 'car', 'cabinet', 'dresser', 'megcrate',
  'locker', 'toolbox', 'suitcase', 'fridge', 'safebox', 'mailbox', 'barrel', 'bookcase', 'bonepile', 'campstall',
]

function isSolidStruct(m: GameMap, x: number, y: number): boolean {
  return m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
}

// v13：楼层过滤的实心结构判定（碰撞/AI 按所在楼层高度带过滤；lift 跨层不算实心）
export function solidStructAtFloor(m: GameMap, x: number, y: number, floor: 0 | 1): boolean {
  return m.structures.some((s) => s.solid && (s.floor ?? 0) === floor && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
}

// ================= v26：精细碰撞体积 =================
// 结构碰撞盒（世界坐标 AABB）。top=碰撞顶面高度；stand=true 时顶面可作为站立平台（接入 z 物理）。
// FULL_BLOCK 表示全高阻挡（不可跳上/翻越）；缺省类型 = 整个 w×h 外接范围全高阻挡（旧行为）。
export interface ColliderBox { x0: number; y0: number; x1: number; y1: number; top: number; stand: boolean }
export const FULL_BLOCK = 9e9

// 按类型定义精确碰撞（与 renderer/structures.ts 的低模外观尺寸逐一核对）：
// - table 桌：顶板 s.w*0.85 × s.h*0.8 @0.75m → 桌面可跳上；chair 椅：座面 0.42×0.42 @0.45m
// - bed 床：垫面 s.w*0.95 × s.h*0.95 @≈0.47m → 0.5m 可跳上
// - frontdesk 前台：视觉仅 s.w×0.7m 台面（原 w×h=4×2 外接方块 → 空气墙）→ 真实轮廓全高阻挡
// - ladder 装饰梯：双立柱+横档仅 0.56×0.14m 薄片（原 1×2 整瓦阻挡 → 空气墙）→ 细柱不挡路
// - desk 书桌：顶板 s.w*0.9×0.7 @0.77m；crate 木箱：0.84×0.84 @0.70m
export function structColliders(s: Structure): ColliderBox[] {
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2
  switch (s.kind) {
    case 'table':
      if (s.data?.chair) return [{ x0: cx - 0.23, y0: cy - 0.23, x1: cx + 0.23, y1: cy + 0.23, top: 0.47, stand: true }]
      return [{ x0: cx - s.w * 0.425, y0: cy - s.h * 0.4, x1: cx + s.w * 0.425, y1: cy + s.h * 0.4, top: 0.75, stand: true }]
    case 'bed':
      return [{ x0: cx - s.w * 0.475, y0: cy - s.h * 0.475, x1: cx + s.w * 0.475, y1: cy + s.h * 0.475, top: 0.5, stand: true }]
    case 'frontdesk':
      return [{ x0: s.x + 0.02, y0: cy - 0.36, x1: s.x + s.w - 0.02, y1: cy + 0.36, top: FULL_BLOCK, stand: false }]
    case 'ladder':
      return [{ x0: cx - 0.28, y0: cy - 0.07, x1: cx + 0.28, y1: cy + 0.07, top: FULL_BLOCK, stand: false }]
    case 'desk':
      return [{ x0: cx - s.w * 0.45, y0: cy - 0.35, x1: cx + s.w * 0.45, y1: cy + 0.35, top: 0.77, stand: true }]
    case 'crate':
      return [{ x0: cx - 0.42, y0: cy - 0.42, x1: cx + 0.42, y1: cy + 0.42, top: 0.7, stand: true }]
    default:
      return [{ x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h, top: FULL_BLOCK, stand: false }]
  }
}

// 世界点 (x,y) 在脚底高度 z 处是否被实心结构碰撞盒阻挡（精细亚瓦片判定）
export function structBlocksPoint(m: GameMap, x: number, y: number, z: number, band: 0 | 1): boolean {
  for (const s of m.structures) {
    if (!s.solid || (s.floor ?? 0) !== band) continue
    if (x < s.x - 0.6 || x > s.x + s.w + 0.6 || y < s.y - 0.6 || y > s.y + s.h + 0.6) continue
    for (const b of structColliders(s)) {
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue
      // 顶面高差超过步行可踏上的 STEP_UP 才阻挡（跳跃抬高 z 后可通过低矮家具）
      if (b.top - z > STEP_UP) return true
    }
  }
  return false
}

// 世界点 (x,y) 处可站立的结构顶面高度（无则 -Infinity；仅当玩家 z 已接近/高于顶面时生效，
// 与 structBlocksPoint 的放行条件衔接：能进入 footprint 即可落在顶面上，不会卡进家具内部）
export function structStandTopAt(m: GameMap, x: number, y: number, z: number, band: 0 | 1): number {
  let best = -Infinity
  for (const s of m.structures) {
    if (!s.solid || (s.floor ?? 0) !== band) continue
    if (x < s.x - 0.6 || x > s.x + s.w + 0.6 || y < s.y - 0.6 || y > s.y + s.h + 0.6) continue
    for (const b of structColliders(s)) {
      if (!b.stand) continue
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue
      if (b.top <= z + STEP_UP - 0.1) best = Math.max(best, b.top)
    }
  }
  return best
}

// ================= v26：天花板碰撞 + 悬挂物依附 =================
// 瓦片是否有天花板（室内地板即有顶；室外/虚空/边界无顶）
export function hasCeiling(m: GameMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false
  const i = ty * m.w + tx
  return m.tiles[i] === 1 && m.outdoor[i] !== 1
}

// 世界点 (x,y) 的天花板底面高度（米；无天花板 = Infinity）
// wallH=本层层高；挑高区（ceiling=1）= wallH*1.75；上层楼板下 = 楼板底 FLOOR_H-0.35；
// 蹲伏风道 = 风道底 1.15m；上层走band=1 的上层天花板
export function ceilingHeightAt(m: GameMap, x: number, y: number, wallH: number, band: 0 | 1 = 0): number {
  const tx = Math.floor(x), ty = Math.floor(y)
  if (!hasCeiling(m, tx, ty)) return Infinity
  const i = ty * m.w + tx
  if (band === 1) return m.ceiling[i] === 1 ? wallH * 1.75 : FLOOR_H + 2.6
  if (m.up[i] === 1) return FLOOR_H - 0.35 // 上层楼板底面即本层天花板
  if (m.crawl[i] === 1) return 1.15 // 头顶风道（蹲伏通道）
  return m.ceiling[i] === 1 ? wallH * 1.75 : wallH
}

// 悬挂生成物（吊灯/荧光灯/指示灯排）——必须依附天花板放置；sconce 壁灯贴墙不在此列
export const HANGING_KINDS: readonly string[] = ['chandelier', 'hanglight', 'lightgrid']

// 悬挂物放置校验（生成后调用）：
// 1) 占据的每块瓦片都必须有天花板（非室外/非虚空）——否则尝试就近移位（2 格内有顶空位），失败则移除
// 2) 同一块天花板瓦片不重叠放置多个悬挂物——后放的就近移位，失败则移除
export function fixHanging(m: GameMap) {
  const taken = new Set<number>()
  const kept: Structure[] = []
  const fits = (s: Structure, nx: number, ny: number): boolean => {
    for (let ty = Math.floor(ny); ty < Math.floor(ny + s.h); ty++)
      for (let tx = Math.floor(nx); tx < Math.floor(nx + s.w); tx++) {
        if (!hasCeiling(m, tx, ty)) return false
        if (taken.has(ty * m.w + tx)) return false
      }
    return true
  }
  const occupy = (s: Structure) => {
    for (let ty = Math.floor(s.y); ty < Math.floor(s.y + s.h); ty++)
      for (let tx = Math.floor(s.x); tx < Math.floor(s.x + s.w); tx++) taken.add(ty * m.w + tx)
  }
  for (const s of m.structures) {
    if (!HANGING_KINDS.includes(s.kind)) { kept.push(s); continue }
    if (fits(s, s.x, s.y)) { occupy(s); kept.push(s); continue }
    // 就近移位：以原中心为圆心 2 格内找有顶且不冲突的位置
    let moved = false
    for (let r = 1; r <= 2 && !moved; r++) {
      for (let dy = -r; dy <= r && !moved; dy++)
        for (let dx = -r; dx <= r && !moved; dx++) {
          const nx = s.x + dx, ny = s.y + dy
          if (!fits(s, nx, ny)) continue
          s.x = nx; s.y = ny
          occupy(s); kept.push(s); moved = true
        }
    }
    // 移位失败：取消该悬挂物（不再悬空/嵌入/重叠）
  }
  m.structures = kept
}

// 任意结构（含非实心装饰/prefabmark）占据判定：室外改造挖区/砌墙时避让，防止压坏既有内容
function anyStructAt(m: GameMap, x: number, y: number): boolean {
  return m.structures.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
}

export function tileAt(m: GameMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 0
  const t = m.tiles[y * m.w + x]
  if (t !== 1) return t
  return isSolidStruct(m, x, y) ? 2 : 1
}

function carveRoom(m: GameMap, x: number, y: number, w: number, h: number) {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++)
      if (i > 0 && j > 0 && i < m.w - 1 && j < m.h - 1) m.tiles[j * m.w + i] = 1
}

function carveH(m: GameMap, x1: number, x2: number, y: number, wdt = 1) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
    for (let k = 0; k < wdt; k++) if (m.tiles[(y + k) * m.w + x] !== undefined) m.tiles[(y + k) * m.w + x] = 1
}
function carveV(m: GameMap, y1: number, y2: number, x: number, wdt = 1) {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
    for (let k = 0; k < wdt; k++) if (m.tiles[y * m.w + x + k] !== undefined) m.tiles[y * m.w + x + k] = 1
}

interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number }

function genRooms(m: GameMap, rng: RNG, nRooms: number, minS: number, maxS: number, corrW = 1): Room[] {
  const rooms: Room[] = []
  for (let t = 0; t < nRooms * 4 && rooms.length < nRooms; t++) {
    const w = rng.int(minS, maxS)
    const h = rng.int(minS, maxS)
    const x = rng.int(1, m.w - w - 2)
    const y = rng.int(1, m.h - h - 2)
    if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue
    carveRoom(m, x, y, w, h)
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) })
  }
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1]
    const b = rooms[i]
    if (rng.chance(0.5)) {
      carveH(m, a.cx, b.cx, a.cy, corrW)
      carveV(m, a.cy, b.cy, b.cx, corrW)
    } else {
      carveV(m, a.cy, b.cy, a.cx, corrW)
      carveH(m, a.cx, b.cx, b.cy, corrW)
    }
  }
  return rooms
}

// 宽走廊迷宫（L0）：格子间距 3、通路宽 2、墙厚 1，保持迷宫感但避免一格窄道
function wideMaze(m: GameMap, rng: RNG) {
  const step = 3
  const carve2 = (cx: number, cy: number) => {
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        const xx = cx + i, yy = cy + j
        if (xx > 0 && yy > 0 && xx < m.w - 1 && yy < m.h - 1) m.tiles[idx(m, xx, yy)] = 1
      }
  }
  for (let y = 1; y + 1 < m.h - 1; y += step)
    for (let x = 1; x + 1 < m.w - 1; x += step) {
      if (m.tiles[idx(m, x, y)] === 1) continue
      carve2(x, y)
      let cx = x, cy = y
      for (let s = 0; s < 50; s++) {
        const dirs = [[step, 0], [-step, 0], [0, step], [0, -step]].filter(([dx, dy]) => {
          const nx = cx + dx, ny = cy + dy
          return nx > 0 && ny > 0 && nx + 1 < m.w - 1 && ny + 1 < m.h - 1 && m.tiles[idx(m, nx, ny)] === 0
        })
        if (!dirs.length) break
        const [dx, dy] = rng.pick(dirs)
        if (dx !== 0) carve2(cx + Math.sign(dx), cy) // 中间连接格（2 宽）
        else carve2(cx, cy + Math.sign(dy))
        cx += dx; cy += dy
        carve2(cx, cy)
      }
    }
}



function randomFloor(m: GameMap, rng: RNG, margin = 0): { x: number; y: number } {
  for (let t = 0; t < 400; t++) {
    const x = rng.int(2, m.w - 3)
    const y = rng.int(2, m.h - 3)
    if (m.tiles[idx(m, x, y)] === 1 && !isSolidStruct(m, x, y)) {
      if (margin && m.spawn && Math.hypot(x - m.spawn.x, y - m.spawn.y) < margin) continue
      return { x, y }
    }
  }
  return { x: 2, y: 2 }
}

function place(m: GameMap, rng: RNG, kind: Structure['kind'], w: number, h: number, solid: boolean, data?: Structure['data']): Structure | null {
  for (let t = 0; t < 200; t++) {
    const x = rng.int(1, m.w - w - 1)
    const y = rng.int(1, m.h - h - 1)
    let ok = true
    for (let j = y - 1; j <= y + h && ok; j++)
      for (let i = x - 1; i <= x + w && ok; i++)
        if (m.tiles[idx(m, i, j)] !== 1 || isSolidStruct(m, i, j)) ok = false
    for (let j = y; j < y + h && ok; j++)
      for (let i = x; i < x + w && ok; i++)
        if (m.outdoor[idx(m, i, j)] === 1) ok = false // v8：室内家具不进室外
    if (!ok) continue
    const s: Structure = { kind, x, y, w, h, solid, data }
    m.structures.push(s)
    return s
  }
  return null
}

// 贴墙装饰放置：地板瓦片且至少一侧紧邻非地板（墙/虚空），供涂鸦/通风口等贴墙结构使用
function placeWallHug(m: GameMap, rng: RNG, kind: Structure['kind'], data?: Structure['data']): Structure | null {
  for (let t = 0; t < 400; t++) {
    const x = rng.int(1, m.w - 2)
    const y = rng.int(1, m.h - 2)
    if (m.tiles[idx(m, x, y)] !== 1 || m.outdoor[idx(m, x, y)] === 1 || isSolidStruct(m, x, y)) continue
    let hasWall = false
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && m.tiles[idx(m, nx, ny)] !== 1) { hasWall = true; break }
    }
    if (!hasWall) continue
    const s: Structure = { kind, x, y, w: 1, h: 1, solid: false, data }
    m.structures.push(s)
    return s
  }
  return null
}

// ---------- v9：门朝向约定 ----------
// 门板平面与所在墙线平行：水平墙线（东西走向，W/E 邻为墙）→ 门板跨 X、面朝南北（默认构建，不旋转）；
// 垂直墙线（南北走向，N/S 邻为墙）→ 整体旋转 90°（门板跨 Z、面朝东西）。
// 双开门相邻的另一扇门视作墙。返回应施加在门组上的 rotation.y（0 或 π/2）。
export function doorNeedsRotate(m: GameMap, s: Structure): number {
  const f = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
  const DOORS: readonly string[] = ['hoteldoor', 'rollerdoor', 'glassdoor']
  const ax = Math.floor(s.x + s.w / 2), ay = Math.floor(s.y + s.h / 2)
  const doorAt = (x: number, y: number) =>
    m.structures.some((o) => o !== s && DOORS.includes(o.kind) && Math.floor(o.x + o.w / 2) === x && Math.floor(o.y + o.h / 2) === y)
  const wallish = (x: number, y: number) => !f(x, y) || doorAt(x, y)
  const we = wallish(ax - 1, ay) && wallish(ax + 1, ay)
  const ns = wallish(ax, ay - 1) && wallish(ax, ay + 1)
  if (we && !ns) return 0 // 水平墙线：门板跨 X（面朝南北），法线沿 Z ⟂ 墙线
  if (ns && !we) return Math.PI / 2 // 垂直墙线：旋转后门板跨 Z（面朝东西），法线沿 X ⟂ 墙线
  // 退化情形（开阔门洞）：按通行方向推断——东西可通行 ⇒ 墙线南北走向 ⇒ 旋转
  return f(ax - 1, ay) && f(ax + 1, ay) ? Math.PI / 2 : 0
}

// ---------- 结构包围盒-墙体碰撞检查（防模型卡墙）----------
// 结构 3D 模型的世界轴对齐包围盒（米，瓦片坐标系）
export function structBBox(s: Structure): { x0: number; y0: number; x1: number; y1: number } {
  if (s.kind === 'door') {
    // 客房门模型锚点在房间东缘（renderer3d 特判）
    return { x0: s.x + s.w - 0.56, y0: s.y + s.h / 2 - 0.55, x1: s.x + s.w - 0.44, y1: s.y + s.h / 2 + 0.55 }
  }
  const inset = 0.06 // 模型相对瓦片矩形的标准内缩
  return { x0: s.x + inset, y0: s.y + inset, x1: s.x + s.w - inset, y1: s.y + s.h - inset }
}

// 包围盒是否与墙/虚空瓦片相交（卡墙判定）
export function structWallClip(m: GameMap, s: Structure): boolean {
  const b = structBBox(s)
  for (let y = Math.floor(b.y0); y <= Math.floor(b.y1 - 1e-6); y++)
    for (let x = Math.floor(b.x0); x <= Math.floor(b.x1 - 1e-6); x++)
      if (x < 0 || y < 0 || x >= m.w || y >= m.h || m.tiles[y * m.w + x] !== 1) return true
  return false
}

// 生成后修正：结构若卡墙（包围盒与墙/虚空瓦片相交），先在瓦片内微移（多档偏移），
// 仍卡墙则整体移除（视觉嵌墙比少一件装饰更糟）；门/窗类结构瓦片必为地板，不会走到移除。
function fixStructEmbedding(m: GameMap) {
  const KEEP: readonly string[] = ['hoteldoor', 'rollerdoor', 'glassdoor', 'glasswin', 'prefabmark']
  const removed: Structure[] = []
  for (const s of m.structures) {
    if (KEEP.includes(s.kind)) continue
    if (!structWallClip(m, s)) continue
    let fixed = false
    for (const [dx, dy] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12], [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22], [0.12, 0.12], [-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12]] as const) {
      s.x += dx; s.y += dy
      // 微移后不得与其他实心结构重叠
      const overlap = m.structures.some((o) => o !== s && o.solid && s.x < o.x + o.w && s.x + s.w > o.x && s.y < o.y + o.h && s.y + s.h > o.y)
      if (!overlap && !structWallClip(m, s)) { fixed = true; break }
      s.x -= dx; s.y -= dy
    }
    if (!fixed) removed.push(s)
  }
  if (removed.length) m.structures = m.structures.filter((s) => !removed.includes(s))
}

// 门依附墙线校验：1×1 门结构（hoteldoor/rollerdoor/glassdoor）与客房门锚点（door）
// 必须满足「一对侧是墙/虚空、另一对侧是地板」；不满足则移除门结构（保留门洞可通行）
function validateDoors(m: GameMap) {
  const f = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
  // 双开门配对：data.dbl 的门允许一侧为另一扇 dbl 门（共享门框，视作墙）
  const dblAt = (x: number, y: number) =>
    m.structures.some((o) => (o.kind === 'hoteldoor' || o.kind === 'glassdoor') && o.data?.dbl && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h)
  m.structures = m.structures.filter((s) => {
    let ax: number, ay: number
    if (s.kind === 'door') { ax = Math.floor(s.x + s.w - 0.5); ay = Math.floor(s.y + s.h / 2) }
    else if (s.kind === 'hoteldoor' || s.kind === 'rollerdoor' || s.kind === 'glassdoor') { ax = Math.floor(s.x + s.w / 2); ay = Math.floor(s.y + s.h / 2) }
    else return true
    if (s.kind === 'door' && !f(ax, ay)) return true // 门模型嵌在非地板（墙线）内：合规
    const wallish = (x: number, y: number) => !f(x, y) || (!!s.data?.dbl && dblAt(x, y))
    const we = wallish(ax - 1, ay) && wallish(ax + 1, ay)
    const ns = wallish(ax, ay - 1) && wallish(ax, ay + 1)
    const weF = f(ax - 1, ay) && f(ax + 1, ay) && !dblAt(ax - 1, ay) && !dblAt(ax + 1, ay)
    const nsF = f(ax, ay - 1) && f(ax, ay + 1) && !dblAt(ax, ay - 1) && !dblAt(ax, ay + 1)
    return (we && nsF) || (ns && weF)
  })
}

// prefab 可达性校验：每个 prefabmark 记录的矩形内必须存在可达的开放地板；
// 不可达则先挖 2 宽走廊接入最近可达地板，仍失败则移除该 prefab 全部内容（结构/物品/灯）
function ensurePrefabsReachable(m: GameMap, reach: Uint8Array, bfs: () => void) {
  const size = m.w
  const marks = m.structures.filter((s) => s.kind === 'prefabmark' && typeof s.data?.rw === 'number')
  for (const mark of marks) {
    const rx = mark.data!.rx as number, ry = mark.data!.ry as number
    const rw = mark.data!.rw as number, rh = mark.data!.rh as number
    const openReachable = () => {
      for (let j = ry; j < ry + rh; j++)
        for (let i = rx; i < rx + rw; i++) {
          const ii = j * size + i
          if (m.tiles[ii] === 1 && reach[ii] && !isSolidStruct(m, i, j)) return true
        }
      return false
    }
    if (openReachable()) continue
    // 挖走廊：从矩形内地板（优先开放瓦片）向四方向找最近可达地板，挖 2 宽通道接入
    let best: { x: number; y: number; dx: number; dy: number; d: number } | null = null
    for (const needOpen of [true, false] as const) {
      if (best) break
      for (let j = ry; j < ry + rh; j++)
        for (let i = rx; i < rx + rw; i++) {
          if (m.tiles[j * size + i] !== 1) continue
          if (needOpen && isSolidStruct(m, i, j)) continue
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            for (let d = 1; d <= 24; d++) {
              const nx = i + dx * d, ny = j + dy * d
              if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) break
              const ni = ny * size + nx
              if (m.tiles[ni] === 1 && reach[ni]) {
                if (!best || d < best.d) best = { x: i, y: j, dx, dy, d }
                break
              }
              if (m.tiles[ni] === 1 && !reach[ni]) break // 另一孤岛：穿过无意义
            }
          }
        }
    }
    if (best) {
      const { x, y, dx, dy, d } = best
      for (let k = 0; k <= d; k++) {
        const cx = x + dx * k, cy = y + dy * k
        m.tiles[cy * size + cx] = 1
        const px = dy !== 0 ? cx + 1 : cx, py = dx !== 0 ? cy + 1 : cy
        if (px < size - 1 && py < size - 1) m.tiles[py * size + px] = 1
      }
      bfs()
      if (openReachable()) continue
    }
    // 仍不可达：移除 prefab 内容（含标记本身），避免不可达孤岛
    m.structures = m.structures.filter((s) =>
      !(s.x + s.w > rx && s.x < rx + rw && s.y + s.h > ry && s.y < ry + rh))
    m.items = m.items.filter((it) => !(it.x >= rx && it.x < rx + rw && it.y >= ry && it.y < ry + rh))
    m.lights = m.lights.filter((l) => !(l.x >= rx && l.x < rx + rw && l.y >= ry && l.y < ry + rh))
  }
}

// 生成质量校验：狭窄通道比例 + 出生区开阔度，不达标则换种子重 roll（外部限次）
function validate(m: GameMap, def: LevelDef): boolean {
  // 出生区 5×5 内至少 13 格可走（合理开阔空间）
  let open = 0
  for (let j = -2; j <= 2; j++)
    for (let i = -2; i <= 2; i++)
      if (tileAt(m, m.spawn.x + i, m.spawn.y + j) === 1) open++
  if (open < 13) return false
  // 一格窄通道比例（某轴两侧均非地板即视为瓶颈点）
  let floor = 0, narrow = 0
  for (let y = 1; y < m.h - 1; y++)
    for (let x = 1; x < m.w - 1; x++) {
      if (m.tiles[idx(m, x, y)] !== 1) continue
      floor++
      const h = m.tiles[idx(m, x - 1, y)] === 1 || m.tiles[idx(m, x + 1, y)] === 1
      const v = m.tiles[idx(m, x, y - 1)] === 1 || m.tiles[idx(m, x, y + 1)] === 1
      if (!h || !v) narrow++
    }
  const ratio = floor ? narrow / floor : 1
  const limit: Record<string, number> = { rooms: 0.4, garage: 0.12, pipes: 0.3, grid: 0.3, office: 0.3, hotel: 0.3 }
  return ratio <= (limit[def.gen] ?? 0.3)
}

export function generateLevel(def: LevelDef, seed: number, firstVisit = true): GameMap {
  // v17：无限模式层级（L0/L1）走 chunk 流式生成路径，不做有限地图质量校验
  // v29：firstVisit=false 时跳过出生点物资散落（初始物资仅首次到层刷新）
  if (def.infinite) return generateInfinite(def, seed, firstVisit)
  // 质量校验重 roll（限 6 次，兜底返回最后一次结果）
  for (let attempt = 0; attempt < 6; attempt++) {
    const m = genOnce(def, seed + attempt * 10007)
    if (attempt === 5 || validate(m, def)) return m
  }
  return genOnce(def, seed)
}

function genOnce(def: LevelDef, seed: number): GameMap {
  const rng = new RNG(seed ^ (def.id * 0x9e3779b9))
  const size = def.size
  const m: GameMap = {
    w: size, h: size,
    tiles: new Uint8Array(size * size), // 全 0
    structures: [], items: [], lights: [], exits: [], entities: [],
    spawn: { x: 2, y: 2 },
    wet: new Uint8Array(size * size),
    elev: new Uint8Array(size * size),
    outdoor: new Uint8Array(size * size),
    step: new Uint8Array(size * size),
    crawl: new Uint8Array(size * size),
    ceiling: new Uint8Array(size * size),
    up: new Uint8Array(size * size),
    upWall: new Uint8Array(size * size),
    stair: new Int32Array(size * size),
    liquid: new Uint8Array(size * size),
    floors: 1,
    tint: new Uint8Array(size * size),
  }
  // 初始化为墙
  m.tiles.fill(2)
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) m.tiles[idx(m, x, y)] = 0

  let rooms: Room[] = []
  switch (def.gen) {
    case 'rooms': {
      rooms = genRooms(m, rng, 12, 5, 10, 2) // 2 格宽连通走廊
      wideMaze(m, rng) // 宽走廊迷宫混合（通路宽 ≥2）
      break
    }
    case 'garage': {
      // 开阔大厅 + 规则柱网（房间化/方正布局）
      carveRoom(m, 3, 3, size - 6, size - 6)
      rooms = [{ x: 3, y: 3, w: size - 6, h: size - 6, cx: size >> 1, cy: size >> 1 }]
      // 分隔墙（带 3 格宽门洞），把大厅切分为方正停车区
      for (const wx of [size * 0.33 | 0, size * 0.66 | 0]) {
        const gap1 = rng.int(8, size - 12), gap2 = rng.int(8, size - 12)
        for (let y = 3; y < size - 3; y++) {
          if (Math.abs(y - gap1) < 2 || Math.abs(y - gap2) < 2) continue
          if (rng.chance(0.9)) m.tiles[idx(m, wx, y)] = 2
        }
      }
      // 柱网（避开分隔墙）
      for (let y = 8; y < size - 8; y += 7)
        for (let x = 8; x < size - 8; x += 7)
          if (m.tiles[idx(m, x, y)] === 1) m.structures.push({ kind: 'pillar', x, y, w: 1, h: 1, solid: true })
      // 车位线
      for (let y = 5; y < size - 5; y += 7)
        for (let x = 4; x < size - 6; x += 3)
          if (rng.chance(0.7)) m.tiles[idx(m, x, y)] = 1
      // 车辆集群
      for (let i = 0; i < 14; i++) {
        const horiz = rng.chance(0.5)
        place(m, rng, 'car', horiz ? 2 : 1, horiz ? 1 : 2, true, { loot: 1 })
      }
      place(m, rng, 'booth', 2, 2, true, { shelter: 1 })
      break
    }
    case 'pipes': {
      // 走廊网：主通道全部 ≥2 格宽
      rooms = genRooms(m, rng, 6, 4, 7, 2)
      let y = 4
      while (y < size - 6) {
        carveH(m, 3, size - 4, y, 2)
        y += rng.int(7, 12)
      }
      let x = 4
      while (x < size - 6) {
        carveV(m, 3, size - 4, x, 2)
        x += rng.int(8, 14)
      }
      // 阀门室
      for (let i = 0; i < 5; i++) place(m, rng, 'valve', 1, 1, false, { on: rng.chance(0.5) ? 1 : 0 })
      for (let i = 0; i < 8; i++) place(m, rng, 'gauge', 1, 1, false)
      for (let i = 0; i < 10; i++) place(m, rng, 'pipes', 1, 1, true)
      place(m, rng, 'boiler', 4, 4, true, { boss: 1 })
      break
    }
    case 'grid': {
      // 发电大厅网格：方正大房间 + 2 宽直连走廊 + 电缆沟
      rooms = genRooms(m, rng, 8, 7, 11, 2)
      for (let i = 0; i < 6; i++) {
        const x = rng.int(4, size - 6)
        carveV(m, 3, size - 4, x, 1)
        for (let yy = 3; yy < size - 4; yy++) if (rng.chance(0.15)) m.structures.push({ kind: 'trench', x, y: yy, w: 1, h: 1, solid: false })
      }
      for (let i = 0; i < 5; i++) place(m, rng, 'generator', 3, 2, true)
      for (let i = 0; i < 7; i++) place(m, rng, 'cabinet', 1, 1, true)
      break
    }
    case 'office': {
      // ===== v8 现实办公室布局 =====
      // 入口接待区（西）→ 开放式工位区（隔间矩阵，朝向一致）→ 沿墙独立办公室/会议室（带门）
      // → 茶水间/复印区角落；走廊笔直成网格（北/中/南横廊 × 西/中/东纵廊）
      // 网格：横廊 y 11..13 / 33..36 / 55..57；纵廊 x 11..13 / 33..36 / 55..57
      const wallRow = (yy: number, x0: number, x1: number) => { for (let x = x0; x <= x1; x++) m.tiles[idx(m, x, yy)] = 2 }
      const wallCol = (xx: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) m.tiles[idx(m, xx, y)] = 2 }
      const doorAt = (x: number, y: number, locked = 0) => {
        m.tiles[idx(m, x, y)] = 1
        m.structures.push({ kind: 'hoteldoor', x, y, w: 1, h: 1, solid: true, data: { open: 0, locked } })
      }
      const solidFree = (x: number, y: number, w: number, h: number) =>
        !m.structures.some((s) => s.solid && x < s.x + s.w && x + w > s.x && y < s.y + s.h && y + h > s.y)
      carveRoom(m, 4, 4, size - 8, size - 8) // 整体开凿
      rooms = [{ x: 4, y: 25, w: 7, h: 19, cx: 7, cy: 34 }] // 出生=接待区

      // ---- 预制件预留虚空袋（两个随机象限中央不挖，供 megoutpost/blackwinroom 贴墙开洞）----
      const quads = [
        { x: 14, y: 14, w: 19, h: 19 }, { x: 37, y: 14, w: 18, h: 19 },
        { x: 14, y: 37, w: 19, h: 18 }, { x: 37, y: 37, w: 18, h: 18 },
      ]
      const pocketIdx = new Set<number>()
      while (pocketIdx.size < 2) pocketIdx.add(rng.int(0, 3))
      for (const pi of pocketIdx) {
        const q = quads[pi]
        const pw = rng.int(8, 11), ph = rng.int(7, 9)
        const px = q.x + ((q.w - pw) >> 1), py = q.y + ((q.h - ph) >> 1)
        for (let j = py; j < py + ph; j++)
          for (let i = px; i < px + pw; i++) m.tiles[idx(m, i, j)] = 0
      }

      // ---- 开放式工位区：整齐行列的隔间矩阵（2×1，朝向一致，行/列距 3）----
      for (let qi = 0; qi < 4; qi++) {
        const q = quads[qi]
        const density = rng.next() * 0.25 + 0.68
        for (let y = q.y + 1; y + 1 < q.y + q.h - 1; y += 3)
          for (let x = q.x + 1; x + 2 < q.x + q.w - 1; x += 3) {
            if (m.tiles[idx(m, x, y)] !== 1 || m.tiles[idx(m, x + 1, y)] !== 1) continue
            if (!rng.chance(density)) continue
            m.structures.push({ kind: 'cubicle', x, y, w: 2, h: 1, solid: true, data: { farm: 1 } })
          }
      }

      // ---- 沿墙独立办公室（北墙行 y=10 房深 4..9 / 南墙行 y=58 房深 59..65，带门）----
      const officeRow = (wallY: number, roomY0: number, roomY1: number) => {
        wallRow(wallY, 4, 65)
        let x = 4
        while (x < 62) {
          const w = rng.int(8, 12)
          const x1 = Math.min(x + w - 1, 65)
          const dx = x + ((x1 - x) >> 1)
          doorAt(dx, wallY)
          if (x1 + 1 <= 65) wallCol(x1 + 1, Math.min(roomY0, wallY), Math.max(roomY1, wallY))
          // 办公室家具：办公桌 + 概率文件柜/箱子（防重叠、避开门洞纵线）
          const deskX = x + rng.int(1, Math.max(1, x1 - x - 2))
          const deskY = roomY0 < wallY ? roomY0 + rng.int(1, 2) : roomY1 - rng.int(1, 2)
          if (Math.abs(deskX - dx) > 1 && solidFree(deskX, deskY, 2, 1)) {
            m.structures.push({ kind: 'desk', x: deskX, y: deskY, w: 2, h: 1, solid: true })
          }
          for (const [kind, chance, dy2] of [['cabinet', 0.5, roomY0 < wallY ? roomY1 - 1 : roomY0 + 1], ['crate', 0.3, roomY0 < wallY ? roomY0 + 1 : roomY1 - 1]] as const) {
            if (!rng.chance(chance)) continue
            for (let tr = 0; tr < 4; tr++) {
              const fx = x + rng.int(0, Math.max(0, x1 - x - 1))
              if (Math.abs(fx - dx) <= 1 || !solidFree(fx, dy2, 1, 1)) continue
              m.structures.push({ kind, x: fx, y: dy2, w: 1, h: 1, solid: true, data: kind === 'crate' ? { loot: 1 } : undefined })
              break
            }
          }
          x = x1 + 2
        }
      }
      officeRow(10, 4, 9)   // 北办公室排
      officeRow(58, 59, 65) // 南办公室排

      // ---- 西侧功能块：茶水间(北) / 接待区(中) / 复印区(南)，墙列 x=10，门朝纵廊 ----
      wallCol(10, 14, 54)
      wallRow(24, 4, 10); wallRow(44, 4, 10)
      doorAt(10, 19); doorAt(10, 34); doorAt(10, 49)
      // 茶水间 y 14..23
      m.structures.push({ kind: 'vending', x: 4, y: 15, w: 1, h: 2, solid: true, data: { trade: 1 } })
      m.structures.push({ kind: 'vending', x: 4, y: 18, w: 1, h: 2, solid: true, data: { trade: 1 } })
      m.structures.push({ kind: 'table', x: 6, y: 20, w: 1, h: 1, solid: true })
      if (rng.chance(0.7)) m.structures.push({ kind: 'table', x: 8, y: 16, w: 1, h: 1, solid: true })
      m.structures.push({ kind: 'crate', x: 8, y: 22, w: 1, h: 1, solid: true, data: { loot: 1 } })
      // 接待区 y 25..43：前台桌列 + 等候桌 + 售卖机
      m.structures.push({ kind: 'desk', x: 4, y: 31, w: 2, h: 1, solid: true })
      m.structures.push({ kind: 'desk', x: 4, y: 33, w: 2, h: 1, solid: true })
      m.structures.push({ kind: 'desk', x: 4, y: 35, w: 2, h: 1, solid: true })
      m.structures.push({ kind: 'table', x: 7, y: 29, w: 1, h: 1, solid: true })
      m.structures.push({ kind: 'table', x: 7, y: 39, w: 1, h: 1, solid: true })
      m.structures.push({ kind: 'vending', x: 4, y: 41, w: 1, h: 2, solid: true, data: { trade: 1 } })
      // 复印区 y 45..54
      m.structures.push({ kind: 'copier', x: 5, y: 47, w: 2, h: 2, solid: true, data: { loot: 1 } })
      m.structures.push({ kind: 'crate', x: 8, y: 52, w: 1, h: 1, solid: true, data: { loot: 1 } })
      m.structures.push({ kind: 'cabinet', x: 4, y: 52, w: 1, h: 1, solid: true })
      if (rng.chance(0.6)) m.structures.push({ kind: 'crate', x: 7, y: 45, w: 1, h: 1, solid: true, data: { loot: 1 } })

      // ---- 东侧功能块：会议室(北) / 机房(中,门禁) / 经理办公室(南)，墙列 x=58 ----
      wallCol(58, 14, 54)
      wallRow(24, 58, 65); wallRow(40, 58, 65)
      doorAt(58, 19); doorAt(58, 32, 1); doorAt(58, 47)
      // 会议室 y 14..23：长桌 + 白柜
      m.structures.push({ kind: 'table', x: 61, y: 17, w: 2, h: 1, solid: true })
      m.structures.push({ kind: 'table', x: 61, y: 19, w: 2, h: 1, solid: true })
      m.structures.push({ kind: 'cabinet', x: 64, y: 15, w: 1, h: 1, solid: true })
      // 机房 y 25..39：服务器阵列 + 机柜
      m.structures.push({ kind: 'server', x: 61, y: 30, w: 3, h: 3, solid: true, data: { locked: 1 } })
      m.structures.push({ kind: 'cabinet', x: 59, y: 26, w: 1, h: 1, solid: true })
      m.structures.push({ kind: 'cabinet', x: 59, y: 28, w: 1, h: 1, solid: true })
      if (rng.chance(0.7)) m.structures.push({ kind: 'cabinet', x: 59, y: 36, w: 1, h: 1, solid: true })
      // 经理办公室 y 41..54
      m.structures.push({ kind: 'desk', x: 60, y: 46, w: 2, h: 1, solid: true })
      m.structures.push({ kind: 'desk', x: 63, y: 50, w: 2, h: 1, solid: true })
      m.structures.push({ kind: 'dresser', x: 64, y: 42, w: 1, h: 1, solid: true, data: { loot: 1 } })
      if (rng.chance(0.5)) m.structures.push({ kind: 'crate', x: 59, y: 53, w: 1, h: 1, solid: true, data: { loot: 1 } })
      break
    }
    case 'hotel': {
      // ===== v8 现实酒店布局 =====
      // 中央大堂（前台/吊灯/休息区）→ 东侧笔直客房走廊（客房门等距相对排列 door stacks）
      // → 走廊尽头楼梯/电梯间 + 布草间；宴会厅独立区域带双开门（大堂南侧）；庭院在中部（玻璃门可达）
      const wallRow = (yy: number, x0: number, x1: number) => { for (let x = x0; x <= x1; x++) m.tiles[idx(m, x, yy)] = 2 }
      const wallCol = (xx: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) m.tiles[idx(m, xx, y)] = 2 }

      // ---- 中央大堂 x4..21 y4..17（挑高由 applyElevation 加盖）----
      carveRoom(m, 4, 4, 18, 14)
      rooms = [{ x: 4, y: 4, w: 18, h: 14, cx: 13, cy: 11 }]
      m.structures.push({ kind: 'frontdesk', x: 6, y: 6, w: 4, h: 2, solid: true, data: { trade: 1 } })
      m.structures.push({ kind: 'chandelier', x: 13, y: 11, w: 1, h: 1, solid: false })
      // 休息区：沙发桌 + 镜子 + 壁灯
      m.structures.push({ kind: 'table', x: 17, y: 14, w: 1, h: 1, solid: true })
      m.structures.push({ kind: 'table', x: 19, y: 14, w: 1, h: 1, solid: true })
      m.structures.push({ kind: 'dresser', x: 5, y: 15, w: 1, h: 1, solid: true, data: { loot: 1 } })
      m.structures.push({ kind: 'mirror', x: 20, y: 5, w: 1, h: 2, solid: true })
      for (const [sx, sy] of [[4, 8], [4, 13], [21, 8], [21, 13]] as const)
        m.structures.push({ kind: 'sconce', x: sx, y: sy, w: 1, h: 1, solid: false })

      // ---- 东翼客房走廊 y10..11 x21..70（笔直）----
      carveRoom(m, 21, 10, 50, 2)
      wallRow(9, 22, 70)  // 北侧客房墙线
      wallRow(12, 22, 70) // 南侧客房墙线
      // 客房：宽 5、间距 6（1 格实墙相隔），北排 y4..8 门在 y=9，南排 y13..17 门在 y=12，门两两相对
      const guestRoom = (rx: number, ry2: number, doorX: number, doorY: number, side: 'n' | 's') => {
        carveRoom(m, rx, ry2, 5, 5)
        m.tiles[idx(m, doorX, doorY)] = 1 // 门洞瓦片开为地板
        m.structures.push({
          kind: 'hoteldoor', x: doorX, y: doorY, w: 1, h: 1, solid: true,
          data: { open: 0, stack: 1, locked: rng.chance(0.25) ? 1 : 0 },
        })
        // 客房布置：床(里侧) + 梳妆台 + 概率桌椅/窗
        const bedY = side === 'n' ? ry2 : ry2 + 3
        m.structures.push({ kind: 'bed', x: rx + rng.int(0, 1), y: bedY, w: 1, h: 2, solid: true })
        m.structures.push({ kind: 'dresser', x: rx + 4, y: bedY, w: 1, h: 1, solid: true, data: { loot: 1 } })
        if (rng.chance(0.5)) m.structures.push({ kind: 'table', x: rx + 3, y: side === 'n' ? ry2 + 3 : ry2 + 1, w: 1, h: 1, solid: true })
        if (rng.chance(0.4)) m.structures.push({ kind: 'hotelwindow', x: rx + 2, y: side === 'n' ? ry2 : ry2 + 4, w: 1, h: 1, solid: false })
        if (rng.chance(0.6)) m.structures.push({ kind: 'sconce', x: rx + 2, y: side === 'n' ? ry2 + 2 : ry2 + 2, w: 1, h: 1, solid: false })
      }
      // 南排在 x47..51 留 6 格缺口（庭院竖廊穿过），北排客房 9 间、南排 8 间随机 ±1
      for (let k = 0; k < 8; k++) {
        const rx = 23 + k * 6
        if (rx + 4 > 69) break
        const cx = rx + 2
        guestRoom(rx, 4, cx, 9, 'n')
        if (rx === 47) continue // 庭院竖廊缺口
        if (rng.chance(0.92)) guestRoom(rx, 13, cx, 12, 's')
        // 8% 概率缺一间南排房（墙线保持实墙，增加随机性）
      }

      // ---- 走廊尽头：楼梯/电梯间(北半) + 布草间(南半) x71..74 y4..17，双开门朝走廊 ----
      carveRoom(m, 71, 4, 4, 14)
      wallCol(70, 4, 17)
      m.tiles[idx(m, 70, 10)] = 1; m.tiles[idx(m, 70, 11)] = 1
      m.structures.push({ kind: 'hoteldoor', x: 70, y: 10, w: 1, h: 1, solid: true, data: { open: 0, dbl: 1 } })
      m.structures.push({ kind: 'hoteldoor', x: 70, y: 11, w: 1, h: 1, solid: true, data: { open: 0, dbl: 1 } })
      wallRow(9, 71, 74) // 内部分隔：北=楼梯间(y4..8) 南=布草间(y10..17)
      m.tiles[idx(m, 72, 9)] = 1 // 内部连通门洞
      m.structures.push({ kind: 'ladder', x: 72, y: 5, w: 1, h: 2, solid: true })
      m.structures.push({ kind: 'sconce', x: 71, y: 7, w: 1, h: 1, solid: false })
      m.structures.push({ kind: 'dresser', x: 71, y: 13, w: 1, h: 1, solid: true, data: { loot: 1 } })
      m.structures.push({ kind: 'dresser', x: 73, y: 13, w: 1, h: 1, solid: true, data: { loot: 1 } })
      m.structures.push({ kind: 'crate', x: 72, y: 16, w: 1, h: 1, solid: true, data: { loot: 1 } })
      m.structures.push({ kind: 'table', x: 71, y: 16, w: 1, h: 1, solid: true })

      // ---- 宴会厅：大堂南侧独立区域 x4..21 y21..36，双开门经 2 宽门厅连通 ----
      carveRoom(m, 11, 18, 2, 3) // 门厅 y18..20
      carveRoom(m, 4, 21, 18, 16)
      m.structures.push({ kind: 'hoteldoor', x: 11, y: 20, w: 1, h: 1, solid: true, data: { open: 0, dbl: 1 } })
      m.structures.push({ kind: 'hoteldoor', x: 12, y: 20, w: 1, h: 1, solid: true, data: { open: 0, dbl: 1 } })
      m.structures.push({ kind: 'ballroom', x: 13, y: 29, w: 1, h: 1, solid: false, data: { horde: 1, rx: 4, ry: 21, rw: 18, rh: 16 } })
      m.structures.push({ kind: 'chandelier', x: 9, y: 27, w: 1, h: 1, solid: false })
      m.structures.push({ kind: 'chandelier', x: 17, y: 27, w: 1, h: 1, solid: false })
      // 宴会长桌沿墙 + 镜墙
      m.structures.push({ kind: 'table', x: 6, y: 22, w: 2, h: 1, solid: true })
      m.structures.push({ kind: 'table', x: 10, y: 22, w: 2, h: 1, solid: true })
      m.structures.push({ kind: 'table', x: 14, y: 22, w: 2, h: 1, solid: true })
      m.structures.push({ kind: 'mirror', x: 5, y: 35, w: 1, h: 2, solid: true })
      m.structures.push({ kind: 'mirror', x: 20, y: 35, w: 1, h: 2, solid: true })
      for (const [sx, sy] of [[4, 25], [4, 31], [21, 25], [21, 31]] as const)
        m.structures.push({ kind: 'sconce', x: sx, y: sy, w: 1, h: 1, solid: false })

      // ---- 中部庭院 x42..57 y21..34（户外泳池，玻璃门经竖廊 x48..49 可达）----
      carveRoom(m, 48, 12, 2, 9) // 竖廊 y12..20 接主廊 y10..11
      // 围墙环
      wallRow(21, 42, 57); wallRow(34, 42, 57); wallCol(42, 21, 34); wallCol(57, 21, 34)
      m.tiles[idx(m, 48, 21)] = 1 // 玻璃门洞
      m.structures.push({ kind: 'glassdoor', x: 48, y: 21, w: 1, h: 1, solid: true, data: { open: 0 } })
      for (let j = 22; j <= 33; j++)
        for (let i = 43; i <= 56; i++) {
          const ii = idx(m, i, j)
          m.tiles[ii] = 1; m.outdoor[ii] = 1; m.elev[ii] = 3
        }
      // 泳池（中央湿区）+ 庭院灯；v13：深水液体（可下沉游泳）
      for (let j = 25; j <= 29; j++)
        for (let i = 46; i <= 52; i++) { m.wet[idx(m, i, j)] = 1; m.liquid[idx(m, i, j)] = 1 }
      m.lights.push({ x: 44.5, y: 23.5, r: 6, color: '#ffd9a0', flickerSeed: rng.int(1, 999) })
      m.lights.push({ x: 55.5, y: 23.5, r: 6, color: '#ffd9a0', flickerSeed: rng.int(1, 999) })
      m.lights.push({ x: 49.5, y: 32.5, r: 6, color: '#8fb7ff', flickerSeed: rng.int(1, 999) })
      break
    }
    default: {
      // v23：Level 6–11 / Level 601 的地形生成器（mapgenDeep.ts）
      rooms = genDeep(m, rng, def, { idx, carveRoom, carveH, carveV, place, placeWallHug })
      break
    }
  }

  // ---- 预制结构（固定房间/区域，按层级概率植入；只向墙区开洞，不破坏既有通路）----
  placePrefabs(m, rng, def.id, def.skipPrefabs)

  // ---- v7：高度档/台阶/蹲伏通道（地形之后、连通校验之前执行）----
  applyElevation(m, rng, def, rooms.length ? { x: rooms[0].cx, y: rooms[0].cy } : { x: 2, y: 2 })
  // ---- v7：室外场景（小巷/通风井/窗景/庭院，同样在连通校验之前）----
  // v8：室外改造先于散点生成物执行——挖区/砌墙避让既有结构，散点随后避让室外瓦片
  applyOutdoor(m, rng, def, rooms.length ? { x: rooms[0].cx, y: rooms[0].cy } : { x: 2, y: 2 })

  // ---- 层级特色散点生成物（门/窗/桌/吊灯/柜等）----
  scatterFeatures(m, rng, def.id)

  // 通用结构（涂鸦/通风口贴墙放置，避免悬浮；v8：避让室外瓦片）
  // v23：Level 6–11 与 Level 601 的通用散点已由 genDeep 按层级铺设，这里只补少量涂鸦
  const DEEP_GENS: readonly string[] = ['darkhall', 'ocean', 'caves', 'suburb', 'field', 'city', 'library']
  const uniCount = DEEP_GENS.includes(def.gen)
    ? { graffiti: 5, crate: 0, corpse: 0, ladder: 1, vent: 0 }
    : { graffiti: 8, crate: 4, corpse: 3, ladder: 2, vent: 3 }
  for (const [k, n] of Object.entries(uniCount)) {
    for (let i = 0; i < n; i++) {
      if (k === 'graffiti') placeWallHug(m, rng, 'graffiti', { lore: rng.int(0, 5) })
      else if (k === 'crate') place(m, rng, 'crate', 1, 1, true, { loot: 1 })
      else if (k === 'corpse') place(m, rng, 'corpse', 1, 1, false, { loot: 1 })
      else if (k === 'ladder') place(m, rng, 'ladder', 1, 2, true)
      else placeWallHug(m, rng, 'vent')
    }
  }
  // L0 荧光灯阵列 + 湿地毯
  if (def.gen === 'rooms') {
    for (let i = 0; i < 10; i++) place(m, rng, 'lightgrid', 2, 1, false)
    for (let i = 0; i < 14; i++) {
      const p = randomFloor(m, rng)
      for (let j = 0; j < 4; j++) {
        const wx = p.x + rng.int(-1, 1), wy = p.y + rng.int(-1, 1)
        if (m.tiles[idx(m, wx, wy)] === 1) m.wet[idx(m, wx, wy)] = 1
      }
    }
  }

  // 出生点（强制正常高度室内可达区）
  const sp = rooms.length ? { x: rooms[0].cx, y: rooms[0].cy } : randomFloor(m, rng)
  m.spawn = sp
  let guard = 0
  while (tileAt(m, m.spawn.x, m.spawn.y) !== 1 && guard++ < 50) {
    m.spawn.x++
    if (m.spawn.x >= m.w - 2) { m.spawn = randomFloor(m, rng); break }
  }
  if (tileAt(m, m.spawn.x, m.spawn.y) !== 1) m.spawn = randomFloor(m, rng)
  // 出生瓦片必须是正常高度室内地板；不满足则螺旋外扩找最近合规瓦片
  if (m.elev[idx(m, m.spawn.x, m.spawn.y)] !== 0 || m.outdoor[idx(m, m.spawn.x, m.spawn.y)] !== 0 || tileAt(m, m.spawn.x, m.spawn.y) !== 1) {
    let found = false
    for (let r = 1; r < 14 && !found; r++)
      for (let j = -r; j <= r && !found; j++)
        for (let i = -r; i <= r && !found; i++) {
          const x = m.spawn.x + i, y = m.spawn.y + j
          if (x < 1 || y < 1 || x >= m.w - 1 || y >= m.h - 1) continue
          const ii = idx(m, x, y)
          if (m.tiles[ii] === 1 && m.elev[ii] === 0 && m.outdoor[ii] === 0 && !isSolidStruct(m, x, y)) {
            m.spawn = { x, y }; found = true
          }
        }
    if (!found) { m.elev[idx(m, m.spawn.x, m.spawn.y)] = 0; m.outdoor[idx(m, m.spawn.x, m.spawn.y)] = 0; m.step[idx(m, m.spawn.x, m.spawn.y)] = 0 }
  }

  // 可交互门（BFS 视为可通行：开门后可达）
  const OPENABLE: readonly string[] = ['hoteldoor', 'rollerdoor', 'glassdoor']
  const openableAt = (x: number, y: number) =>
    m.structures.some((s) => s.solid && OPENABLE.includes(s.kind) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  const passFloor = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false
    if (m.tiles[y * size + x] !== 1) return false
    return !isSolidStruct(m, x, y) || openableAt(x, y)
  }
  // 连通性：从出生点 BFS（含台阶/跳跃通行规则：上行 ≤1.35m 可达，下行任意）
  const reach = new Uint8Array(size * size)
  const bfs = () => {
    reach.fill(0)
    const q: [number, number][] = [[m.spawn.x, m.spawn.y]]
    reach[m.spawn.y * size + m.spawn.x] = 1
    while (q.length) {
      const [x, y] = q.pop()!
      const h0 = tileH(m, x, y)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy, ii = ny * size + nx
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || reach[ii]) continue
        if (!passFloor(nx, ny)) continue
        if (tileH(m, nx, ny) - h0 > JUMP_REACH) continue // 高差>跳跃能力 不可达
        reach[ii] = 1; q.push([nx, ny])
      }
    }
  }
  bfs()
  // 高台/低洼孤岛回填：不可达的非正常高度瓦片压平为正常高度后重算连通
  {
    let flattened = false
    for (let i = 0; i < size * size; i++) {
      if (m.tiles[i] === 1 && !reach[i] && (m.elev[i] === 1 || m.elev[i] === 2 || m.step[i] !== 0)) {
        m.elev[i] = 0; m.step[i] = 0; m.crawl[i] = 0; flattened = true
      }
    }
    if (flattened) bfs()
  }
  // v25：返回 null 版本（供栖息地过滤判定「无符合瓦片」），reachFloor 保留出生点兜底
  const reachFloorTry = (margin = 0, opts: { indoor?: boolean; outdoor?: boolean; anyHabitat?: boolean; waterOk?: boolean } = {}): { x: number; y: number } | null => {
    for (let t = 0; t < 600; t++) {
      const x = rng.int(1, size - 2), y = rng.int(1, size - 2)
      const ii = y * size + x
      if (reach[ii] && tileAt(m, x, y) === 1) {
        if (m.stair[ii] !== 0 || (m.liquid[ii] !== 0 && !opts.waterOk)) continue // v13：楼梯坡道/液体上不放置出口/实体/物品（v25：水生实体豁免水域）
        if (opts.indoor && (m.elev[ii] !== 0 || m.outdoor[ii] !== 0 || m.crawl[ii] !== 0)) continue
        // v25：室外栖息地（小巷/街道/田野，outdoor=1）；水生实体额外接受水域（liquid≠0，如 L7 海面）
        if (opts.outdoor && m.outdoor[ii] !== 1 && !(opts.waterOk && m.liquid[ii] !== 0)) continue
        // v25：any 栖息地=室内正常高度 + 室外地面皆可，但不上高台/低洼/蹲伏通道
        if (opts.anyHabitat && ((m.elev[ii] !== 0 && m.elev[ii] !== 3) || m.crawl[ii] !== 0)) continue
        if (margin && Math.hypot(x - m.spawn.x, y - m.spawn.y) < margin) continue
        return { x, y }
      }
    }
    return null
  }
  const reachFloor = (margin = 0, opts: { indoor?: boolean; outdoor?: boolean; anyHabitat?: boolean; waterOk?: boolean } = {}): { x: number; y: number } =>
    reachFloorTry(margin, opts) ?? { ...m.spawn }
  // v8：先校验 prefab 可达性（此时房间开放地板仍在，走廊补救有效），再做孤岛回填
  ensurePrefabsReachable(m, reach, bfs)

  // 未能连通的孤立地板填成墙，避免误生成内容（室外景观保留）；
  // v8 修复：任何结构占据的瓦片一律跳过——BFS 不会踏入实心结构瓦片（reach=0），
  // 若回填会把箱子/前台/立柱等脚下地板变成墙，造成视觉嵌墙与 prefab 孤岛。
  const structMark = new Uint8Array(size * size)
  for (const s of m.structures) {
    for (let j = Math.max(0, Math.floor(s.y)); j <= Math.min(size - 1, Math.floor(s.y + s.h - 1e-6)); j++)
      for (let i = Math.max(0, Math.floor(s.x)); i <= Math.min(size - 1, Math.floor(s.x + s.w - 1e-6)); i++)
        structMark[j * size + i] = 1
  }
  for (let i = 0; i < size * size; i++) {
    if (m.tiles[i] === 1 && !reach[i] && m.outdoor[i] === 0 && !structMark[i]) m.tiles[i] = 2
  }
  // 回填后重算连通（结构瓦片已保全），供出口/实体/物品选址
  bfs()

  // 结构包围盒-墙体碰撞修正（防容器/收纳箱卡墙；v8：微移失败则移除）
  fixStructEmbedding(m)

  // 门必须依附墙线（两侧墙/两侧地板）；不满足的门结构移除（保留门洞通行）
  validateDoors(m)

  // ---- v13：多层结构（楼梯/电梯/梯子/上层房间）+ 浅水洼；含跨层连通校验与回滚 ----
  applyMultiFloor(m, rng, def)

  // 出口（随机选 1 个主要出口 + 偶尔第二个）
  const exitDefs = def.allExits ? [...def.exits] : rng.shuffle([...def.exits])
  // v23：结局层（Level 601）必须真假两扇门同时存在
  const nExits = def.allExits ? def.exits.length : (rng.chance(0.35) ? 2 : 1)
  for (let i = 0; i < nExits; i++) {
    const p = reachFloor(12, { indoor: true }) // 出口强制正常高度室内可达区
    m.exits.push({ def: exitDefs[i], x: p.x, y: p.y, discovered: false })
  }

  // 光源
  const lightCount = Math.floor(size * size * def.lightDensity * (1 + rng.next()))
  for (let i = 0; i < lightCount; i++) {
    const p = reachFloor()
    m.lights.push({ x: p.x + 0.5, y: p.y + 0.5, r: rng.range(3, 5.5), color: def.palette.light, flickerSeed: rng.next() * 100 })
  }
  // 出口光源
  for (const e of m.exits) m.lights.push({ x: e.x + 0.5, y: e.y + 0.5, r: 3, color: '#f5e37a', flickerSeed: rng.next() * 100 })
  // 壁灯/灯阵附加光
  for (const s of m.structures) {
    if (s.kind === 'sconce' || s.kind === 'lightgrid')
      m.lights.push({ x: s.x + s.w / 2, y: s.y + s.h / 2, r: 3.5, color: def.palette.light, flickerSeed: rng.next() * 100 })
  }

  // L0 特殊房间：停电区（抹除区域灯光）+ 红房间（灯光染红）
  if (def.gen === 'rooms') {
    const bc = reachFloor(6)
    m.lights = m.lights.filter((l) => Math.hypot(l.x - bc.x, l.y - bc.y) > 5.5)
    const rc = reachFloor(8)
    let touched = false
    for (const l of m.lights) if (Math.hypot(l.x - rc.x, l.y - rc.y) < 4.5) { l.color = '#ff2a1a'; touched = true }
    if (!touched) m.lights.push({ x: rc.x + 0.5, y: rc.y + 0.5, r: 4, color: '#ff2a1a', flickerSeed: rng.next() * 100 })
  }

  // 实体（黑暗伏击者优先生成在无光角落；趋光者生成在远离光源处）
  // v25：按 EntityDef.habitat 过滤候选瓦片——indoor=室内（outdoor=0 且正常高度）、outdoor=室外（outdoor=1）、
  // any=随意（仅排除楼梯坡道/液体）。无符合瓦片时降级 any 并在 m.habitatFallback 计数告警。
  const habMiss: Record<string, number> = {}
  for (const se of def.entities) {
    const n = rng.int(se.min, se.max)
    const edef = ENTITIES[se.type]
    const hab = edef?.habitat ?? 'any'
    const habOpts = hab === 'indoor' ? { indoor: true as const } : hab === 'outdoor' ? { outdoor: true as const, waterOk: edef?.aquatic === true } : { anyHabitat: true as const }
    const pickSpot = (): { x: number; y: number } => {
      let p = reachFloorTry(10, habOpts)
      if (!p && hab !== 'any') { // 降级：本层无符合栖息地的瓦片（如车库小巷生成失败）
        const key = `${se.type}:${hab}`
        habMiss[key] = (habMiss[key] ?? 0) + 1
        p = reachFloorTry(10, { anyHabitat: true }) ?? reachFloorTry(10, { indoor: true })
      }
      return p ?? { ...m.spawn }
    }
    for (let i = 0; i < n; i++) {
      let p = pickSpot()
      if (edef?.darkAmbusher) {
        for (let t = 0; t < 14; t++) {
          const q = pickSpot()
          const dark = !m.lights.some((l) => Math.hypot(l.x - q.x - 0.5, l.y - q.y - 0.5) < l.r)
          if (dark) { p = q; break }
        }
      }
      m.entities.push(makeEntity(se.type, p.x + 0.5, p.y + 0.5))
    }
  }
  if (Object.keys(habMiss).length > 0) {
    m.habitatFallback = habMiss
    console.warn(`[habitat] L${def.id} 无符合瓦片，降级 any：${Object.entries(habMiss).map(([k, v]) => `${k}×${v}`).join(' ')}`)
  }

  // 物品（独特 + 通用混合）
  // v23 容器化：itemCount 的一部分不再直接丢在地上，而是预先装进本层的容器
  // （箱子/柜子/储物柜/工具箱/行李箱/冰箱/信箱/木桶/保险箱……），需要搜索才能拿到。
  const nItems = rng.int(def.itemCount[0], def.itemCount[1])
  const pool = [...def.items, ...UNIVERSAL_ITEMS]
  let iid = 1
  const bias = def.containerBias ?? 0.45
  const containers = m.structures.filter((s) => s.data?.loot === 1 && CONTAINER_KINDS.includes(s.kind))
  const nInContainer = containers.length ? Math.min(Math.round(nItems * bias), containers.length * 3) : 0
  for (let i = 0; i < nItems - nInContainer; i++) {
    const t0 = rng.weighted(pool.map((p) => ({ v: p.type, w: p.w })))
    const t = t0 === 'almond' && rng.chance(0.1) ? 'cashew' : t0 // v32：腰果水 1/10 概率替代杏仁水
    const p = reachFloor(3)
    m.items.push({ id: iid++, type: t, x: p.x + 0.5, y: p.y + 0.5 })
  }
  for (let i = 0; i < nInContainer; i++) {
    const t0 = rng.weighted(pool.map((p) => ({ v: p.type, w: p.w })))
    const t = t0 === 'almond' && rng.chance(0.1) ? 'cashew' : t0 // v32：腰果水 1/10 概率替代杏仁水
    const c = containers[rng.int(0, containers.length - 1)]
    const cur = Array.isArray(c.data!.lootItems) ? (c.data!.lootItems as string[]) : []
    if (cur.length >= 4) continue
    c.data = { ...c.data, lootItems: [...cur, t] }
  }
  // 保证每层至少 1 盘磁带
  if (!m.items.some((it) => it.type === 'tape')) {
    const p = reachFloor(8, { indoor: true })
    m.items.push({ id: iid++, type: 'tape', x: p.x + 0.5, y: p.y + 0.5 })
  }

  // v26：悬挂生成物放置校验——必须依附有天花板的瓦片，同瓦片不重叠（冲突就近移位或取消）
  fixHanging(m)

  return m
}

// ================= v7：高度档 / 台阶坡道 / 蹲伏低通道 =================
// 在基础地形、预制结构与散点生成物之后、连通校验之前执行。
// 层级主题：L1 下沉检修沟+高台车位；L2 蹲伏低通道+高维修平台；L3 电缆沟+发电机高台；
//           L4 高文件柜顶（跳上）；L5 大堂挑高+下沉舞池；L0 平地。

const encStep = (dir: number, lo: number, hi: number) => dir | (lo << 3) | (hi << 5)

function floorNoStruct(m: GameMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[idx(m, x, y)] === 1 && !isSolidStruct(m, x, y)
}

// 在地图开阔区找 w×h 全地板（无实心结构）矩形；ring=true 时外圈 1 格也须全地板（保证台阶外侧衔接）
function findOpenRect(m: GameMap, rng: RNG, w: number, h: number, ring = false): { x: number; y: number } | null {
  for (let t = 0; t < 500; t++) {
    const x = rng.int(2, m.w - w - 2)
    const y = rng.int(2, m.h - h - 2)
    let ok = true
    for (let j = y - (ring ? 1 : 0); j < y + h + (ring ? 1 : 0) && ok; j++)
      for (let i = x - (ring ? 1 : 0); i < x + w + (ring ? 1 : 0) && ok; i++)
        if (!floorNoStruct(m, i, j)) ok = false
    if (ok) return { x, y }
  }
  return null
}

// 区域盖章高度档（允许覆盖结构瓦片：结构模型按地面高度偏移渲染）
function stampElev(m: GameMap, x: number, y: number, w: number, h: number, e: number) {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++)
      if (m.tiles[idx(m, i, j)] === 1) m.elev[idx(m, i, j)] = e
}

// 下沉沟（1 格宽，两端台阶平滑连接正常地面）
function stampTrench(m: GameMap, rng: RNG, lenMin: number, lenMax: number) {
  const horiz = rng.chance(0.5)
  const len = rng.int(lenMin, lenMax)
  const spot = findOpenRect(m, rng, horiz ? len + 2 : 1, horiz ? 1 : len + 2)
  if (!spot) return false
  const { x, y } = spot
  if (horiz) {
    stampElev(m, x + 1, y, len, 1, 1)
    m.step[idx(m, x, y)] = encStep(2, 1, 0) // 西端：向 -x 上坡（低侧=沟）
    m.step[idx(m, x + len + 1, y)] = encStep(1, 1, 0) // 东端：向 +x 上坡
  } else {
    stampElev(m, x, y + 1, 1, len, 1)
    m.step[idx(m, x, y)] = encStep(4, 1, 0) // 北端：向 -y 上坡
    m.step[idx(m, x, y + len + 1)] = encStep(3, 1, 0) // 南端：向 +y 上坡
  }
  return true
}

// 高台（边缘一枚台阶，台面上放一件奖励品）
function stampPlatform(m: GameMap, rng: RNG, wMin: number, wMax: number, hMin: number, hMax: number, loots: string[]) {
  const w = rng.int(wMin, wMax), h = rng.int(hMin, hMax)
  // 优先带 1 格地板外圈的位置（台阶衔接更自然），找不到则放宽
  const spot = findOpenRect(m, rng, w, h, true) ?? findOpenRect(m, rng, w, h, false)
  if (!spot) return false
  const { x, y } = spot
  stampElev(m, x, y, w, h, 2)
  // 台阶放在西边缘中点（向 +x 上坡到台面，西缘衔接室外平地）
  m.step[idx(m, x, y + (h >> 1))] = encStep(1, 0, 2)
  // 台面奖励（高台专属战利品，引诱跳跃）
  const t = rng.pick(loots)
  m.items.push({ id: 950000 + m.items.length * 7, type: t, x: x + w / 2, y: y + h / 2 })
  return true
}

// 跳跃孤岛高台（无台阶，仅跳跃可上：L4 文件柜顶）
function stampJumpIsle(m: GameMap, rng: RNG, loots: string[]) {
  const w = rng.chance(0.4) ? 2 : 1
  const spot = findOpenRect(m, rng, w, 1, true) ?? findOpenRect(m, rng, w, 1, false)
  if (!spot) return false
  stampElev(m, spot.x, spot.y, w, 1, 2)
  const t = rng.pick(loots)
  m.items.push({ id: 950000 + m.items.length * 7, type: t, x: spot.x + w / 2, y: spot.y + 0.5 })
  return true
}

// 蹲伏低通道：走廊段盖章 crawl（头顶风道，未蹲伏不可进入；2 格宽走廊同样适用）
function markCrawlSegment(m: GameMap, rng: RNG): boolean {
  const isFloor = (x: number, y: number) => m.tiles[idx(m, x, y)] === 1
  for (let t = 0; t < 80; t++) {
    const x = rng.int(2, m.w - 5)
    const y = rng.int(2, m.h - 3)
    if (!floorNoStruct(m, x, y) || m.elev[idx(m, x, y)] !== 0 || m.crawl[idx(m, x, y)]) continue
    const horiz = isFloor(x - 1, y) && isFloor(x + 1, y)
    const vert = !horiz && isFloor(x, y - 1) && isFloor(x, y + 1)
    if (!horiz && !vert) continue
    const len = rng.int(2, 3)
    let ok = true
    for (let k = 1; k < len; k++) {
      const nx = horiz ? x + k : x, ny = horiz ? y : y + k
      if (!floorNoStruct(m, nx, ny) || m.elev[idx(m, nx, ny)] !== 0) { ok = false; break }
    }
    if (!ok) continue
    for (let k = 0; k < len; k++) m.crawl[idx(m, horiz ? x + k : x, horiz ? y : y + k)] = 1
    return true
  }
  return false
}

function applyElevation(m: GameMap, rng: RNG, def: LevelDef, spawnCand: { x: number; y: number }) {
  switch (def.gen) {
    case 'rooms': break // L0 平地
    case 'garage': { // L1：下沉检修沟 ×3 + 高台车位 ×2
      for (let i = 0; i < 3; i++) stampTrench(m, rng, 8, 14)
      for (let i = 0; i < 2; i++) stampPlatform(m, rng, 3, 4, 2, 3, ['battery', 'canned', 'bandage', 'gas'])
      break
    }
    case 'pipes': { // L2：蹲伏低通道 ×3 + 高维修平台 ×3
      for (let i = 0; i < 3; i++) markCrawlSegment(m, rng)
      for (let i = 0; i < 3; i++) stampPlatform(m, rng, 2, 3, 2, 3, ['wrench', 'battery', 'bandage'])
      break
    }
    case 'grid': { // L3：电缆沟 ×3（长）+ 发电机高台 ×2
      for (let i = 0; i < 3; i++) stampTrench(m, rng, 10, 18)
      for (let i = 0; i < 2; i++) stampPlatform(m, rng, 3, 4, 2, 2, ['fuse', 'battery', 'capacitor'])
      break
    }
    case 'office': { // L4：少量高文件柜顶（无台阶，跳跃可上）
      for (let i = 0; i < 6; i++) stampJumpIsle(m, rng, ['almond', 'stapler', 'coffee'])
      break
    }
    case 'hotel': { // L5：大堂挑高 + 下沉舞池（舞池边缘台阶；布局由 gen 固定，读 ballroom 标记矩形）
      // 大堂挑高（gen 'hotel' 固定大堂 4,4,18,14）
      for (let j = 4; j < 18; j++)
        for (let i = 4; i < 22; i++)
          if (m.tiles[idx(m, i, j)] === 1) m.ceiling[idx(m, i, j)] = 1
      // 下沉舞池：读 gen 放置的 ballroom 标记矩形（宴会厅内缩 2 圈作池，北缘近双开门处台阶）
      const br = m.structures.find((s) => s.kind === 'ballroom' && typeof s.data?.rw === 'number')
      if (br) {
        const bx = br.data!.rx as number, by = br.data!.ry as number
        const bw = br.data!.rw as number, bh = br.data!.rh as number
        // 北缘留 2 排门厅平地、南缘留 1 排（镜墙），池区 = 内缩
        const px = bx + 1, py = by + 3, pw = bw - 2, ph = bh - 5
        let ok = true
        for (let j = py; j < py + ph && ok; j++)
          for (let i = px; i < px + pw && ok; i++)
            if (m.tiles[idx(m, i, j)] !== 1 || isSolidStruct(m, i, j)) ok = false
        if (ok) {
          stampElev(m, px, py, pw, ph, 1)
          // 北缘台阶 ×2（向 -y 上坡出池，近双开门纵线 x11..15）
          for (const sx2 of [bx + 7, bx + 11]) {
            if (floorNoStruct(m, sx2, py)) m.step[idx(m, sx2, py)] = encStep(4, 1, 0)
          }
        }
      }
      void spawnCand
      break
    }
  }
}

// ================= v7：室外场景 =================
// L1 卷帘门外小巷（可经门到达）；L2 蹲伏管道通通风井露天；L4 半透玻璃窗外雾中城市（仅观察）；
// L5 庭院泳池（玻璃门可达）+ 客房窗夜景（仅观察）。
// 室外瓦片：outdoor=1, elev=3；无天花板、天空盒、远景楼群剪影由渲染层处理。

// 在室内开阔区圈出一块室外院落：内 rect 变室外地板，外圈砌墙，南侧中点开一扇门（可交互）
function outdoorRoom(m: GameMap, rng: RNG, w: number, h: number, doorKind: 'rollerdoor' | 'glassdoor', lampColor: string, lamps: number, spawnCand: { x: number; y: number }): boolean {
  for (let t = 0; t < 600; t++) {
    const x = rng.int(3, m.w - w - 5)
    const y = rng.int(3, m.h - h - 5)
    let ok = true
    for (let j = y - 1; j < y + h + 1 && ok; j++)
      for (let i = x - 1; i < x + w + 1 && ok; i++) {
        if (m.tiles[idx(m, i, j)] !== 1) { ok = false; break }
        if (anyStructAt(m, i, j)) { ok = false; break } // v8：含非实心装饰/prefabmark
      }
    if (!ok) continue
    // 避开出生区（8 格内）
    const cx = x + w / 2, cy = y + h / 2
    if (Math.hypot(cx - spawnCand.x, cy - spawnCand.y) < 9) continue
    // 外圈砌墙（保留既有结构瓦片不挖）
    for (let j = y - 1; j < y + h + 1; j++)
      for (let i = x - 1; i < x + w + 1; i++) {
        const isRing = j === y - 1 || j === y + h || i === x - 1 || i === x + w
        if (isRing) m.tiles[idx(m, i, j)] = 2
      }
    // 内 rect：室外地面
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        const ii = idx(m, i, j)
        m.tiles[ii] = 1; m.outdoor[ii] = 1; m.elev[ii] = 3; m.wet[ii] = 0
      }
    // 门：南侧墙中点（1 格，可交互开关）
    const dx = x + (w >> 1), dy = y + h
    m.tiles[idx(m, dx, dy)] = 1
    m.outdoor[idx(m, dx, dy)] = 0
    m.elev[idx(m, dx, dy)] = 0
    m.structures.push({ kind: doorKind, x: dx, y: dy, w: 1, h: 1, solid: true, data: { open: 0 } })
    // 路灯/霓虹灯
    for (let n = 0; n < lamps; n++) {
      const lx = x + 1.5 + rng.next() * (w - 3), ly = y + 1.5 + rng.next() * (h - 3)
      m.lights.push({ x: lx, y: ly, r: 7, color: lampColor, flickerSeed: rng.int(1, 999) })
    }
    return true
  }
  return false
}

// L2：蹲伏管道 → 通风井露天。从任意走廊瓦片向墙侧（虚空）挖 crawl 管道，尽头开 3×3 露天井
function ventShaft(m: GameMap, rng: RNG): boolean {
  const nonFloor = (x: number, y: number) => x < 0 || y < 0 || x >= m.w || y >= m.h || m.tiles[idx(m, x, y)] !== 1
  for (let t = 0; t < 600; t++) {
    const x = rng.int(3, m.w - 9)
    const y = rng.int(5, m.h - 6)
    if (m.tiles[idx(m, x, y)] !== 1 || m.elev[idx(m, x, y)] !== 0 || m.outdoor[idx(m, x, y)] === 1 || anyStructAt(m, x, y)) continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      // (dx,dy) 侧为墙，管道 2 格 + 井区（3×3 + 外围 1 格）必须全是非地板（挖入虚空，不破坏既有地形）
      if (!nonFloor(x + dx, y + dy)) continue
      let ok = true
      for (let k = 1; k <= 2 && ok; k++) if (!nonFloor(x + dx * k, y + dy * k)) ok = false
      const sx = x + dx * 3, sy = y + dy * 3
      for (let j = sy - 2; j <= sy + 2 && ok; j++)
        for (let i = sx - 2; i <= sx + 2 && ok; i++)
          if (!nonFloor(i, j)) ok = false
      if (!ok) continue
      // 挖蹲伏管道（crawl=1，未蹲伏不可通过）
      for (let k = 1; k <= 2; k++) {
        const ii = idx(m, x + dx * k, y + dy * k)
        m.tiles[ii] = 1; m.crawl[ii] = 1
      }
      // 挖露天通风井
      for (let j = sy - 1; j <= sy + 1; j++)
        for (let i = sx - 1; i <= sx + 1; i++) {
          const ii = idx(m, i, j)
          m.tiles[ii] = 1; m.outdoor[ii] = 1; m.elev[ii] = 3
        }
      m.lights.push({ x: sx + 0.5, y: sy + 0.5, r: 6, color: '#b8c4cc', flickerSeed: rng.int(1, 999) })
      return true
    }
  }
  return false
}

// 观察窗外景：找一条室内墙线（一侧室内地板、另一侧 ≥3 格虚空），
// 开 n 扇半透玻璃窗（实心不可通过），窗外挖 3 深室外条带（不可达，作城市/夜景剪影背景）
// v8：全量扫描候选墙线再随机挑选（密集办公室布局下纯随机采样经常找不到合规墙线）；
//     水平/垂直墙线分别扫描（旧版 (±1,0) 方向把条带挖进墙线自身，从未生效）
function windowStrip(m: GameMap, rng: RNG, wins: number, lampColor: string | null): boolean {
  // 候选：墙线起点 (x,y)、走向 (ax,ay)（|a|=1 沿墙）、室内侧法向 (dx,dy)
  const cands: { x: number; y: number; ax: number; ay: number; dx: number; dy: number }[] = []
  const structBlocks = (x: number, y: number) =>
    m.structures.some((s) => (s.solid || s.kind === 'prefabmark') && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  const nonFloor = (x: number, y: number) => x < 1 || y < 1 || x >= m.w - 1 || y >= m.h - 1 || m.tiles[idx(m, x, y)] !== 1
  const indoorFloor = (x: number, y: number) =>
    x >= 1 && y >= 1 && x < m.w - 1 && y < m.h - 1 && m.tiles[idx(m, x, y)] === 1 && m.outdoor[idx(m, x, y)] !== 1 && !structBlocks(x, y)
  for (let y = 4; y < m.h - 5; y++) {
    for (let x = 4; x < m.w - 5; x++) {
      for (const [ax, ay] of [[1, 0], [0, 1]] as const) { // 墙线走向：水平/垂直
        for (const [dx, dy] of ay === 0 ? [[0, 1], [0, -1]] as const : [[1, 0], [-1, 0]] as const) {
          // 墙线瓦片 (x + k*ax, y + k*ay)，k = -1..wins（两端各多 1 格实墙）
          let ok = true
          for (let k = -1; k <= wins && ok; k++) {
            const wx = x + k * ax, wy = y + k * ay
            if (wx < 2 || wy < 2 || wx >= m.w - 2 || wy >= m.h - 2) { ok = false; break }
            if (m.tiles[idx(m, wx, wy)] === 1) { ok = false; break } // 墙线本身非地板
            // 室内侧：连续地板无实心结构/prefabmark
            if (!indoorFloor(wx + dx, wy + dy)) { ok = false; break }
            // 室外侧 4 格全非地板（3 深条带 + 1 格隔离，保证窗区不可绕行到达）；
            // 条带（d≤3）必须在地图内层，不得压边界墙
            for (let d = 1; d <= 4; d++) {
              const ox = wx - dx * d, oy = wy - dy * d
              if (d <= 3 && (ox < 1 || oy < 1 || ox >= m.w - 1 || oy >= m.h - 1)) { ok = false; break }
              if (!nonFloor(ox, oy)) { ok = false; break }
            }
            if (!ok) break
          }
          // 条带端缘之外（沿轴 k=-2 / k=wins+1）在条带深度内必须全非地板（防止从端部绕入）
          for (const k of [-2, wins + 1]) {
            const ex = x + k * ax, ey = y + k * ay
            for (let d = 0; d <= 3 && ok; d++)
              if (!nonFloor(ex - dx * d, ey - dy * d)) ok = false
          }
          if (ok) cands.push({ x, y, ax, ay, dx, dy })
        }
      }
    }
  }
  if (!cands.length) return false
  const c = rng.pick(cands)
  // 开窗（k = 0..wins-1）
  for (let k = 0; k < wins; k++) {
    const wx = c.x + k * c.ax, wy = c.y + k * c.ay
    m.tiles[idx(m, wx, wy)] = 1
    m.structures.push({ kind: 'glasswin', x: wx, y: wy, w: 1, h: 1, solid: true, data: { view: 1 } })
  }
  // 窗外条带（3 深，含两端各多 1 格）：室外地面，玻璃阻隔不可达
  for (let k = -1; k <= wins; k++)
    for (let d = 1; d <= 3; d++) {
      const ox = c.x + k * c.ax - c.dx * d, oy = c.y + k * c.ay - c.dy * d
      const ii = idx(m, ox, oy)
      m.tiles[ii] = 1; m.outdoor[ii] = 1; m.elev[ii] = 3
    }
  if (lampColor) m.lights.push({ x: c.x + c.ax * wins / 2 - c.dx * 2 + 0.5, y: c.y + c.ay * wins / 2 - c.dy * 2 + 0.5, r: 6, color: lampColor, flickerSeed: rng.int(1, 999) })
  return true
}

function applyOutdoor(m: GameMap, rng: RNG, def: LevelDef, spawnCand: { x: number; y: number }) {
  switch (def.gen) {
    case 'garage': // L1：卷帘门外小巷（灰黄霾天空/路灯，可经门到达）
      if (!outdoorRoom(m, rng, 12, 6, 'rollerdoor', '#ffd28a', 2, spawnCand))
        outdoorRoom(m, rng, 8, 4, 'rollerdoor', '#ffd28a', 1, spawnCand)
      break
    case 'pipes': // L2：蹲伏管道通通风井露天
      ventShaft(m, rng)
      break
    case 'office': // L4：半透玻璃窗外雾中城市剪影（仅观察不可达）
      windowStrip(m, rng, 4, null)
      break
    case 'hotel': { // L5：庭院泳池已内置于 gen（玻璃门可达）；此处仅客房窗外夜景（仅观察）
      windowStrip(m, rng, 3, '#3a5a9a')
      break
    }
  }
}

// ================= v13：多层结构（真·楼上楼下）+ 液体浅水洼 =================
// 高度带模型：同一瓦片可同时存在主层地板（tiles=1, z≈0）与上层地板（up=1, z=FLOOR_H）。
// 玩家/实体按脚底 z 所在高度带（bandOfZ）分别碰撞；楼梯（stair 连续坡道）、
// 电梯（lift 交互垂直送达）、梯子（climb 攀爬链接）跨层连接。

// 找一块 w×h 全平地（tiles=1/elev=0/室内/非低通道/非坡道）矩形作为上层楼基；
// 外圈 1 格内不得有 prefabmark（避免压预制结构虚空袋），中心距出生点 ≥ spawnDist
function findZone(m: GameMap, rng: RNG, w: number, h: number, spawnDist: number): { x: number; y: number } | null {
  const cands: { x: number; y: number }[] = []
  for (let y = 2; y + h < m.h - 2; y++)
    for (let x = 2; x + w < m.w - 2; x++) {
      let ok = true
      for (let j = y; j < y + h && ok; j++)
        for (let i = x; i < x + w && ok; i++) {
          const ii = idx(m, i, j)
          if (m.tiles[ii] !== 1 || m.elev[ii] !== 0 || m.outdoor[ii] !== 0 || m.crawl[ii] !== 0 || m.step[ii] !== 0) ok = false
        }
      if (!ok) continue
      for (const s of m.structures) {
        if (s.kind !== 'prefabmark') continue
        if (s.x + s.w > x - 1 && s.x < x + w + 1 && s.y + s.h > y - 1 && s.y < y + h + 1) { ok = false; break }
      }
      if (!ok) continue
      if (Math.hypot(x + w / 2 - m.spawn.x, y + h / 2 - m.spawn.y) < spawnDist) continue
      cands.push({ x, y })
    }
  return cands.length ? rng.pick(cands) : null
}

// 铺设直线楼梯跑道：从 (x,y) 起沿 dir 铺 n 格，从 0m 爬到 FLOOR_H（每格升 FLOOR_H/n，≤0.65 可直接走上）
// 返回顶端 landing 格坐标（跑道尽头前一格，调用方保证其 up=1）。跑道格 hi>BAND_MID 的标记 up=1（上层可站）
function stampStairRun(m: GameMap, x: number, y: number, dir: 1 | 2 | 3 | 4, n: number): { lx: number; ly: number } {
  const dx = dir === 1 ? 1 : dir === 2 ? -1 : 0
  const dy = dir === 3 ? 1 : dir === 4 ? -1 : 0
  const stepCm = Math.round((FLOOR_H * 100) / n)
  for (let k = 0; k < n; k++) {
    const sx = x + dx * k, sy = y + dy * k
    const ii = idx(m, sx, sy)
    m.tiles[ii] = 1
    m.stair[ii] = encStair(dir, stepCm * k, stepCm * (k + 1))
    m.step[ii] = 0; m.crawl[ii] = 0; m.elev[ii] = 0
    if (stepCm * (k + 1) / 100 > BAND_MID) m.up[ii] = 1 // 坡道上半段：上层可行走
    else m.up[ii] = 0
  }
  return { lx: x + dx * n, ly: y + dy * n }
}

// 攀爬梯子：base（主层）↔ top（上层，up=1）。结构非实心，引擎做贴近按住前进的竖直攀爬
function addClimbLadder(m: GameMap, baseX: number, baseY: number, topX: number, topY: number): boolean {
  if (m.tiles[idx(m, baseX, baseY)] !== 1 || isSolidStruct(m, baseX, baseY)) return false
  if (m.up[idx(m, topX, topY)] !== 1) return false
  m.structures.push({
    kind: 'ladder', x: baseX, y: baseY, w: 1, h: 1, solid: false,
    data: { climb: 1, tx: topX, ty: topY },
  })
  return true
}

// ---- L4 废弃办公室：主层 + 上层办公室/档案夹层（楼梯间 + 电梯）----
function buildOfficeUpper(m: GameMap, rng: RNG): boolean {
  let zone: { x: number; y: number } | null = null
  let w = 0, h = 0
  for (const [zw, zh, sd] of [[14, 12, 10], [12, 10, 9], [10, 9, 8]] as const) {
    zone = findZone(m, rng, zw, zh, sd)
    if (zone) { w = zw; h = zh; break }
  }
  if (!zone) return false
  const { x: zx, y: zy } = zone
  for (let j = zy; j < zy + h; j++)
    for (let i = zx; i < zx + w; i++) m.up[idx(m, i, j)] = 1
  for (let i = zx; i < zx + w; i++) { m.upWall[idx(m, i, zy)] = 1; m.upWall[idx(m, i, zy + h - 1)] = 1 }
  for (let j = zy; j < zy + h; j++) { m.upWall[idx(m, zx, j)] = 1; m.upWall[idx(m, zx + w - 1, j)] = 1 }
  // 楼梯间：zone 内沿西墙跑道（+x 上坡 5 格，每格 0.6m），顶到 landing
  let stairOk = false
  let landing: { lx: number; ly: number } | null = null
  for (let ty = zy + 2; ty < zy + h - 2 && !stairOk; ty++) {
    let ok = true
    for (let k = 0; k <= 6; k++) { // 跑道 5 格 + landing 1 格，下层须无实心结构
      if (isSolidStruct(m, zx + 1 + k, ty)) { ok = false; break }
    }
    if (!ok) continue
    landing = stampStairRun(m, zx + 1, ty, 1, 5)
    m.up[idx(m, landing.lx, landing.ly)] = 1
    stairOk = true
  }
  if (!stairOk || !landing) { // 回滚楼板
    for (let j = zy; j < zy + h; j++) for (let i = zx; i < zx + w; i++) { m.up[idx(m, i, j)] = 0; m.upWall[idx(m, i, j)] = 0 }
    return false
  }
  // 内部隔墙：上层两个独立房间（办公室 / 档案室），留 1 格门洞；须在楼梯 landing 以东
  if (w >= 12) {
    const partX = zx + Math.max(w >> 1, 7)
    if (partX < zx + w - 2) {
      const doorY = zy + 2 + rng.int(0, h - 5)
      for (let j = zy + 1; j < zy + h - 1; j++) if (j !== doorY) m.upWall[idx(m, partX, j)] = 1
    }
  }
  // 电梯：zone 内找下层无实心结构格（轿厢 1×1，lift 跨层），不在跑道/landing 上
  for (let t = 0; t < 80; t++) {
    const ex = zx + 1 + rng.int(0, w - 2)
    const ey = zy + 1 + rng.int(0, h - 2)
    if (isSolidStruct(m, ex, ey) || m.stair[idx(m, ex, ey)] !== 0) continue
    if (m.upWall[idx(m, ex, ey)] === 1) continue
    // 邻格须能走出（zone 内非 upWall 非跑道）
    let open = 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      if (m.upWall[idx(m, ex + dx, ey + dy)] !== 1 && m.stair[idx(m, ex + dx, ey + dy)] === 0
        && m.up[idx(m, ex + dx, ey + dy)] === 1) open++
    if (open < 2) continue
    m.structures.push({ kind: 'lift', x: ex, y: ey, w: 1, h: 1, solid: false, data: { car: 0, carZ: 0 } })
    return true
  }
  return false // 电梯放不下则整层回滚由调用方处理
}

// ---- L5 恐怖酒店：大堂二楼回廊（楼梯上）+ 布草间夹层（梯子）----
function buildHotelUpper(m: GameMap, rng: RNG): boolean {
  let any = false
  // 大堂 x4..21 y4..17（gen 固定），回廊 = 内圈 2 宽沿墙
  const inLobby = (x: number, y: number) => x >= 4 && x <= 21 && y >= 4 && y <= 17
  // 楼梯跑道：东墙 x20，自 y16 向 -y 爬 5 格至 y12，landing (20,11)
  let stairOk = true
  for (let k = 0; k <= 5; k++) if (isSolidStruct(m, 20, 16 - k)) { stairOk = false; break }
  if (stairOk) {
    for (let y = 4; y <= 17; y++)
      for (let x = 4; x <= 21; x++) {
        const edge = x <= 5 || x >= 20 || y <= 5 || y >= 16
        if (edge) m.up[idx(m, x, y)] = 1
      }
    const land = stampStairRun(m, 20, 16, 4, 5)
    if (inLobby(land.lx, land.ly)) m.up[idx(m, land.lx, land.ly)] = 1
    any = true
  }
  // 布草间夹层：x71..74 y14..17，梯子 base(72,13) → top(72,14)
  const bx0 = 71, by0 = 14
  let linenOk = true
  for (let j = by0; j <= 17 && linenOk; j++)
    for (let i = bx0; i <= 74 && linenOk; i++)
      if (m.tiles[idx(m, i, j)] !== 1) linenOk = false
  if (linenOk && m.tiles[idx(m, 72, 13)] === 1 && !isSolidStruct(m, 72, 13)) {
    for (let j = by0; j <= 17; j++) for (let i = bx0; i <= 74; i++) m.up[idx(m, i, j)] = 1
    if (addClimbLadder(m, 72, 13, 72, 14)) any = true
    else for (let j = by0; j <= 17; j++) for (let i = bx0; i <= 74; i++) m.up[idx(m, i, j)] = 0
  }
  void rng
  return any
}

// ---- L3 电站：高处维修平台（梯子上下）----
function buildGridUpper(m: GameMap, rng: RNG): boolean {
  const zone = findZone(m, rng, 4, 3, 6)
  if (!zone) return false
  // 西邻格作为梯子底（须在楼层地板上且无结构）
  const bx = zone.x - 1, by = zone.y + 1
  if (m.tiles[idx(m, bx, by)] !== 1 || isSolidStruct(m, bx, by)) return false
  for (let j = zone.y; j < zone.y + 3; j++)
    for (let i = zone.x; i < zone.x + 4; i++) m.up[idx(m, i, j)] = 1
  if (!addClimbLadder(m, bx, by, zone.x, by)) {
    for (let j = zone.y; j < zone.y + 3; j++) for (let i = zone.x; i < zone.x + 4; i++) m.up[idx(m, i, j)] = 0
    return false
  }
  return true
}

// ---- L2 管道走廊：浅水洼（不沉没，仅减速+涟漪）----
function addShallowPuddles(m: GameMap, rng: RNG) {
  for (let n = 0; n < 3; n++) {
    for (let t = 0; t < 120; t++) {
      const x = rng.int(2, m.w - 4), y = rng.int(2, m.h - 4)
      let ok = true
      for (let j = y; j < y + 2 && ok; j++)
        for (let i = x; i < x + 2 && ok; i++) {
          const ii = idx(m, i, j)
          if (m.tiles[ii] !== 1 || m.elev[ii] !== 0 || m.outdoor[ii] !== 0 || m.crawl[ii] !== 0
            || m.step[ii] !== 0 || m.liquid[ii] !== 0 || isSolidStruct(m, i, j)) ok = false
        }
      if (!ok) continue
      for (let j = y; j < y + 2; j++) for (let i = x; i < x + 2; i++) m.liquid[idx(m, i, j)] = 2
      break
    }
  }
}

// ---------- 跨层连通 BFS（状态 = 瓦片 × 楼层带）----------
// band0：主层地板（含楼梯坡道）；band1：上层楼板（up=1 且非 upWall）。
// 同层四向通行遵守 JUMP_REACH 高差规则；楼梯格可自由切换高度带（连续坡道）；
// lift 格两层互通（电梯交互）；climb 梯子 base↔top 直连。
export function bfs3D(m: GameMap): Uint8Array {
  const W = m.w, H = m.h
  const reach = new Uint8Array(W * H * 2)
  const OPENABLE: readonly string[] = ['hoteldoor', 'rollerdoor', 'glassdoor']
  const openable = (x: number, y: number, floor: 0 | 1) =>
    m.structures.some((s) => s.solid && OPENABLE.includes(s.kind) && (s.floor ?? 0) === floor && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  // 行走高度（null=该层带不可站立）
  const walkH = (x: number, y: number, band: 0 | 1): number | null => {
    if (x < 0 || y < 0 || x >= W || y >= H) return null
    const i = y * W + x
    const s2 = m.stair[i]
    if (s2 & 7) {
      if (band === 1 && m.up[i] !== 1) return null
      if (solidStructAtFloor(m, x, y, band) && !openable(x, y, band)) return null
      return (((s2 >> 3) & 0x3fff) + ((s2 >> 17) & 0x3fff)) / 200
    }
    if (band === 0) {
      if (m.tiles[i] !== 1) return null
      if (solidStructAtFloor(m, x, y, 0) && !openable(x, y, 0)) return null
      return tileH(m, x, y)
    }
    if (m.up[i] !== 1 || m.upWall[i] === 1) return null
    if (solidStructAtFloor(m, x, y, 1) && !openable(x, y, 1)) return null
    return FLOOR_H
  }
  const lifts = m.structures.filter((s) => s.kind === 'lift')
  const ladders = m.structures.filter((s) => s.kind === 'ladder' && s.data?.climb)
  const q: [number, number, 0 | 1][] = [[m.spawn.x, m.spawn.y, 0]]
  reach[(m.spawn.y * W + m.spawn.x) * 2] = 1
  while (q.length) {
    const [x, y, b] = q.pop()!
    const h0 = walkH(x, y, b)
    if (h0 === null) continue
    const push = (nx: number, ny: number, nb: 0 | 1) => {
      const ii = (ny * W + nx) * 2 + nb
      if (reach[ii]) return
      const nh = walkH(nx, ny, nb)
      if (nh === null || Math.abs(nh - h0) > JUMP_REACH) return
      reach[ii] = 1; q.push([nx, ny, nb])
    }
    // 垂直连接物直达（电梯轿厢/梯子攀爬/楼梯坡道带切换，不受 JUMP_REACH 高差限制）
    const link = (nx: number, ny: number, nb: 0 | 1) => {
      const ii = (ny * W + nx) * 2 + nb
      if (reach[ii] || walkH(nx, ny, nb) === null) return
      reach[ii] = 1; q.push([nx, ny, nb])
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) push(x + dx, y + dy, b)
    // 楼梯格：高度带自由切换（坡道连续）
    if (m.stair[y * W + x] & 7) link(x, y, b === 0 ? 1 : 0)
    // 电梯：同格两层互通
    if (lifts.some((s) => Math.floor(s.x) === x && Math.floor(s.y) === y)) link(x, y, b === 0 ? 1 : 0)
    // 梯子：base↔top
    for (const s of ladders) {
      const tx = s.data!.tx as number, ty = s.data!.ty as number
      if (x === Math.floor(s.x) && y === Math.floor(s.y) && b === 0) link(tx, ty, 1)
      if (x === tx && y === ty && b === 1) link(Math.floor(s.x), Math.floor(s.y), 0)
    }
  }
  return reach
}

// 上层内容（楼板/连通校验通过后放置）：独立房间家具、物品、实体、灯
function placeUpperContent(m: GameMap, rng: RNG, def: LevelDef) {
  const reach = bfs3D(m)
  // 放置前所有可达上层格（放置实心家具不得使其中任何格失联——防止堵死隔墙门洞）
  const prevReachable = new Set<number>()
  for (let i = 0; i < m.w * m.h; i++)
    if (m.up[i] === 1 && m.upWall[i] !== 1 && m.stair[i] === 0 && reach[i * 2 + 1] === 1) prevReachable.add(i)
  const stillConnected = () => {
    const r2 = bfs3D(m)
    for (const i of prevReachable)
      if (!m.structures.some((s) => s.solid && (s.floor ?? 0) === 1 && (i % m.w) >= s.x && (i % m.w) < s.x + s.w && Math.floor(i / m.w) >= s.y && Math.floor(i / m.w) < s.y + s.h)
        && r2[i * 2 + 1] !== 1) return false
    return true
  }
  const freeUp = (x: number, y: number) =>
    m.up[idx(m, x, y)] === 1 && m.upWall[idx(m, x, y)] !== 1 && m.stair[idx(m, x, y)] === 0
    && !m.structures.some((s) => (s.floor ?? 0) === 1 && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    && reach[(y * m.w + x) * 2 + 1] === 1
  const spots: { x: number; y: number }[] = []
  for (let y = 1; y < m.h - 1; y++)
    for (let x = 1; x < m.w - 1; x++)
      if (freeUp(x, y) && !m.structures.some((s) => s.kind === 'lift' && Math.abs(s.x - x) <= 1 && Math.abs(s.y - y) <= 1)) spots.push({ x, y })
  if (spots.length < 6) return
  const take = () => spots.splice(rng.int(0, spots.length - 1), 1)[0]
  // 上层房间家具（L4 档案夹层=文件柜/桌；L5 回廊/夹层=柜/箱；L3 平台=箱）
  const kinds: [Structure['kind'], number, number, number][] = // [kind, w, h, count]
    def.gen === 'office' ? [['desk', 2, 1, 2], ['cabinet', 1, 1, 2], ['crate', 1, 1, 1]]
      : def.gen === 'hotel' ? [['dresser', 1, 1, 1], ['crate', 1, 1, 1], ['table', 1, 1, 1]]
        : [['crate', 1, 1, 1]]
  for (const [kind, w, h, count] of kinds) {
    for (let n = 0; n < count && spots.length > 4; n++) {
      const p = take()
      if (!p) break
      let ok = w === 1
      if (!ok) { // 2×1 需东侧邻格也空
        ok = spots.some((q) => q.x === p.x + 1 && q.y === p.y)
        if (ok) spots.splice(spots.findIndex((q) => q.x === p.x + 1 && q.y === p.y), 1)
      }
      if (!ok) continue
      m.structures.push({ kind, x: p.x, y: p.y, w, h, solid: true, floor: 1, data: kind === 'crate' || kind === 'dresser' ? { loot: 1 } : undefined })
      if (!stillConnected()) m.structures.pop() // 堵门/断路则撤回该家具
    }
  }
  // 上层物品 ×2-3（z=FLOOR_H 悬浮旋转展示）
  const upItems = def.gen === 'office' ? ['almond', 'coffee', 'stapler', 'tape'] : def.gen === 'hotel' ? ['silverware', 'sedative', 'almond'] : ['fuse', 'battery']
  for (let n = 0; n < 3 && spots.length > 2; n++) {
    const p = take()
    if (!p) break
    m.items.push({ id: 970000 + m.items.length * 13, type: rng.pick(upItems), x: p.x + 0.5, y: p.y + 0.5, z: FLOOR_H })
  }
  // 上层实体 ×1（上层房间有独立威胁；v25：上层房间属室内，跳过 outdoor 栖息地的实体）
  const se = def.entities.find((e) => (ENTITIES[e.type]?.habitat ?? 'any') !== 'outdoor') ?? def.entities[0]
  if (se && spots.length > 1) {
    const p = take()
    if (p) m.entities.push(makeEntity(se.type, p.x + 0.5, p.y + 0.5, FLOOR_H))
  }
  // 上层灯 ×2
  for (let n = 0; n < 2 && spots.length > 0; n++) {
    const p = take()
    if (!p) break
    m.lights.push({ x: p.x + 0.5, y: p.y + 0.5, r: 4, color: def.palette.light, flickerSeed: rng.next() * 100, z: FLOOR_H })
  }
}

function applyMultiFloor(m: GameMap, rng: RNG, def: LevelDef) {
  if (def.gen === 'pipes') addShallowPuddles(m, rng)
  let built = false
  if (def.gen === 'office') built = buildOfficeUpper(m, rng)
  else if (def.gen === 'hotel') built = buildHotelUpper(m, rng)
  else if (def.gen === 'grid') built = buildGridUpper(m, rng)
  if (!built) return
  // 跨层连通校验：所有上层可走格（up=1 非 upWall）必须在 band1 可达；失败则整体回滚
  const reach = bfs3D(m)
  let ok = true, upTiles = 0
  for (let i = 0; i < m.w * m.h; i++) {
    if (m.up[i] === 1 && m.upWall[i] !== 1 && m.stair[i] === 0) {
      upTiles++
      if (!reach[i * 2 + 1]) { ok = false; break }
    }
  }
  if (!ok || upTiles < 8) {
    if ((globalThis as { __DBG_MF?: boolean }).__DBG_MF) {
      const bad: string[] = []
      for (let i = 0; i < m.w * m.h; i++)
        if (m.up[i] === 1 && m.upWall[i] !== 1 && m.stair[i] === 0 && !reach[i * 2 + 1]) bad.push(`${i % m.w},${Math.floor(i / m.w)}`)
      console.warn(`[multifloor] L${def.id} 回滚: ok=${ok} upTiles=${upTiles} bad=${bad.length} ${bad.slice(0, 12).join(' ')}`)
    }
    m.up.fill(0); m.upWall.fill(0); m.stair.fill(0)
    m.structures = m.structures.filter((s) => (s.floor ?? 0) === 0 && s.kind !== 'lift' && !(s.kind === 'ladder' && s.data?.climb))
    m.floors = 1
    return
  }
  m.floors = 2
  placeUpperContent(m, rng, def)
}
