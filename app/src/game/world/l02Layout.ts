// Level 0.2「重塑的混乱」——无限 chunk 生成（第一阶段：外观 + 基础布局）。
// 设定：https://backrooms-wiki-cn.wikidot.com/level-0-2 （作者 PandaShark71004，译者 JLhze）。
// 架构数据沿用 Level 0 的 L0Layout（薄墙矩形 + 灯盘 + 世界坐标），这样渲染、烘焙光照、碰撞、
// 墙面挂载全部复用 Level 0 的管线；layout.theme='l02' 让渲染层换用本层材质与防撞条。
// 与 L0 的区别：只有直角隔墙，墙线落在 4 m 模数网格上（更规整）；开阔区像空置的办公楼层；
// 没有红室/熄灯/深坑/马尼拉等异常区域；灯盘严格对齐 0.6×1.2 m 矿棉板吊顶网格。
import type { ExitDef, LevelDef, Structure } from '../core/types'
import type { GenChunk } from './infiniteRegistry'
import { registerInfiniteLevel } from './infiniteRegistry'
import { L0_HEIGHT, type L0Layout, type L0Wall } from './l0Architecture'
import { l0Hash } from './l0Regions'
import { RNG } from '../core/rng'
import { l0TrimWalls, l0OutletPositions } from './l0WallDetails'

/** Level 0.2 内部 id（独立 id 空间：序章 900 之后；不占 LEVELS 下标、不进图鉴遍历）。 */
export const L02_ID = 902
export const L02_HEIGHT = L0_HEIGHT
/** 隔墙厚度（参考图墙端可见约 15 cm 厚的石膏板隔墙）。 */
export const L02_WALL_T = 0.16
/** 墙线模数（m）：隔墙只落在 4 m 网格上，形成规整的直角房间。 */
export const L02_MODULE = 4
/** 防撞条：离地高度（条带中心）与条高（m）。 */
export const L02_RAIL_Y = 0.3
export const L02_RAIL_H = 0.06
/** 吊顶板尺寸：x 向 1.2 m、z 向 0.6 m（2×4 英尺），灯盘占一整块板。 */
export const L02_TILE_X = 1.2
export const L02_TILE_Z = 0.6
/** 灯盘间距（吊顶板个数）：第五轮改用 Level 0 本体灯盘（同模型/材质/发光），布置也向 Level 0 的 4 m 网格靠拢——
 *  取最接近 4 m 的吊顶板整数倍：x 每 3 块（3.6 m）、z 每 7 块（4.2 m），平均 3.9 m；灯盘仍占满一整块 1.2×0.6 m 板（不压龙骨）。 */
export const L02_LAMP_EVERY_X = 3
export const L02_LAMP_EVERY_Z = 7
/** 灯盘所在的吊顶板（板索引 kx=floor(x/1.2)、kz=floor(z/0.6)）。 */
export const l02LampTile = (kx: number, kz: number) =>
  ((kx % L02_LAMP_EVERY_X) + L02_LAMP_EVERY_X) % L02_LAMP_EVERY_X === 1 && ((kz % L02_LAMP_EVERY_Z) + L02_LAMP_EVERY_Z) % L02_LAMP_EVERY_Z === 3

export type L02Region = 'rooms' | 'office'
/** 设施种类（kind='l02fix' 结构的 data.fix）。 */
export type L02FixKind = 'outlet' | 'clipboard' | 'router' | 'toilet' | 'sink' | 'stall' | 'restroom'
/** 板夹文档 id（content/docs.ts）。 */
export const L02_DOCS = ['brc_slogan', 'brc_took', 'brc_report'] as const
/** 返回门出口定义（与 levels/l02.ts 的 exits[0] 一致）。 */
export const L02_RETURN_EXIT: ExitDef = { kind: 'remodelreturn', name: '返回 Level 0 的门', dest: 0, anim: 'shutter' }

const rand = (...v: number[]) => l0Hash(...v) / 4294967296
const contains = (r: { x: number; y: number; w: number; h: number }, x: number, y: number, pad = 0) =>
  x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad

/** 区块类型：约 55% 规整隔间（迷宫版）、45% 空置办公层（开阔区版）。出生区块固定为开阔。 */
export function l02RegionOf(seed: number, cx: number, cy: number): L02Region {
  if (cx === 0 && cy === 0) return 'office'
  // 2×2 区块共享一次判定，开阔区连成整片楼层，而不是零碎的空格。
  return rand(seed, 0x0d2, Math.floor(cx / 2), Math.floor(cy / 2)) < 0.45 ? 'office' : 'rooms'
}

/** 出生点附近保持开阔（世界坐标，玩家从施工门进入后站在这里）。 */
const SPAWN_CLEAR = { x: 9, y: 9, w: 14, h: 14 }

function onSpawnLine(w: L0Wall): boolean {
  const horiz = w.w > w.h, mid = horiz ? w.y + w.h / 2 : w.x + w.w / 2
  // 短臂墙端面可能因半墙厚偏离出生轴线。
  const half = (horiz ? w.h : w.w) * 0.5
  if (Math.abs(mid - (horiz ? L02_SPAWN.y : L02_SPAWN.x)) > half + 0.01) return false
  const a = horiz ? w.x : w.y, b = horiz ? w.x + w.w : w.y + w.h, s = horiz ? L02_SPAWN.x : L02_SPAWN.y
  return Math.max(a - s, s - b, 0) < 24
}
function clipOut(walls: L0Wall[], p: { x: number; y: number; w: number; h: number }): L0Wall[] {
  return walls.flatMap((w) => {
    if (w.x >= p.x + p.w || w.x + w.w <= p.x || w.y >= p.y + p.h || w.y + w.h <= p.y) return [w]
    if (w.w > w.h) return [{ ...w, w: Math.max(0, p.x - w.x) }, { ...w, x: Math.max(w.x, p.x + p.w), w: Math.max(0, w.x + w.w - p.x - p.w) }].filter((v) => v.w > 0.6)
    return [{ ...w, h: Math.max(0, p.y - w.y) }, { ...w, y: Math.max(w.y, p.y + p.h), h: Math.max(0, w.y + w.h - p.y - p.h) }].filter((v) => v.h > 0.6)
  })
}

/** 规整隔间：8×8 个 4 m 房格，生成树打通 + 额外拆墙，墙段在房格边线上；区块边界不砌墙（与邻块无缝连通）。 */
function roomWalls(seed: number, cx: number, cy: number): L0Wall[] {
  const X = cx * 32, Y = cy * 32, N = 8, S = L02_MODULE, T = L02_WALL_T
  const parent = Array.from({ length: N * N }, (_, i) => i)
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])))
  const edges: { a: number; b: number; axis: 0 | 1; x: number; y: number; rank: number }[] = []
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (const axis of [0, 1] as const)
    if (axis === 0 ? x < N - 1 : y < N - 1) edges.push({ a: y * N + x, b: axis === 0 ? y * N + x + 1 : (y + 1) * N + x, axis, x, y, rank: l0Hash(seed, cx, cy, x, y, axis, 0x2a) })
  edges.sort((a, b) => a.rank - b.rank)
  const walls: L0Wall[] = []
  for (const e of edges) {
    const a = root(e.a), b = root(e.b)
    if (a !== b) { parent[a] = b; continue }
    // 生成树外的边约 55% 保留为墙（第五轮 45%→55%，墙略密约两成）：比 L0 迷宫更开阔，但仍是房间—走廊的感觉；
    // 生成树本身全部打通，加墙只动树外的边，所以连通性不变（返回门/洗手间/出生区只会再切掉墙，不会封死）
    if (e.rank % 100 >= 55) continue
    // axis 0：房格 (x,y) 与 (x+1,y) 之间的竖墙；axis 1：与 (x,y+1) 之间的横墙
    if (e.axis === 0) walls.push({ x: X + (e.x + 1) * S - T / 2, y: Y + e.y * S - (e.y === 0 ? 0 : T / 2), w: T, h: S + (e.y === 0 ? T / 2 : T), bottom: 0, top: L02_HEIGHT, surface: 'wall' })
    else walls.push({ x: X + e.x * S - (e.x === 0 ? 0 : T / 2), y: Y + (e.y + 1) * S - T / 2, w: S + (e.x === 0 ? T / 2 : T), h: T, bottom: 0, top: L02_HEIGHT, surface: 'wall' })
  }
  return mergeCollinear(walls)
}

/** 空置办公层：少量长直隔墙、L 形转角与独立短墙，全部落在 4 m 网格线上。 */
function officeWalls(seed: number, cx: number, cy: number): L0Wall[] {
  const X = cx * 32, Y = cy * 32, T = L02_WALL_T, S = L02_MODULE
  const rng = new RNG(l0Hash(seed, cx, cy, 0x0ff1))
  const out: L0Wall[] = []
  const n = rng.int(4, 7) // 第五轮 3–6 → 4–7 段（约 +20%；与已有墙仍保持 ≥1.6 m 间距，不形成夹缝）
  for (let i = 0; i < n; i++) {
    const vertical = rng.chance(0.5)
    const line = rng.int(1, 7) * S // 网格线位置（不在区块边界上）
    const start = rng.int(0, 5) * S
    const len = Math.min(32 - start, rng.int(2, 5) * S - (rng.chance(0.5) ? S / 2 : 0))
    if (len < 2) continue
    const w: L0Wall = vertical
      ? { x: X + line - T / 2, y: Y + start, w: T, h: len, bottom: 0, top: L02_HEIGHT, surface: 'wall' }
      : { x: X + start, y: Y + line - T / 2, w: len, h: T, bottom: 0, top: L02_HEIGHT, surface: 'wall' }
    // 和已有墙至少隔开 1.6 m（平行），避免形成夹缝
    if (out.some((o) => w.x < o.x + o.w + 1.6 && w.x + w.w > o.x - 1.6 && w.y < o.y + o.h + 1.6 && w.y + w.h > o.y - 1.6)) continue
    out.push(w)
    // 一半概率在一端加短臂成 L 形
    if (rng.chance(0.5)) {
      const arm = rng.int(1, 2) * S * 0.75
      const endX = vertical ? w.x : (rng.chance(0.5) ? w.x : w.x + w.w - T)
      const endY = vertical ? (rng.chance(0.5) ? w.y : w.y + w.h - T) : w.y
      const dir = rng.chance(0.5) ? 1 : -1
      const a: L0Wall = vertical
        ? { x: dir > 0 ? endX : endX - arm + T, y: endY, w: arm, h: T, bottom: 0, top: L02_HEIGHT, surface: 'wall' }
        : { x: endX, y: dir > 0 ? endY : endY - arm + T, w: T, h: arm, bottom: 0, top: L02_HEIGHT, surface: 'wall' }
      if (a.x >= X && a.y >= Y && a.x + a.w <= X + 32 && a.y + a.h <= Y + 32) out.push(a)
    }
  }
  return out
}

/** 同一直线上首尾相接的墙段合并（减少端面与重叠面）。 */
function mergeCollinear(walls: L0Wall[]): L0Wall[] {
  const out: L0Wall[] = []
  const sorted = [...walls].sort((a, b) => (a.w > a.h ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y))
  for (const w of sorted) {
    const prev = out.find((p) => (p.w > p.h) === (w.w > w.h) && (w.w > w.h
      ? Math.abs(p.y - w.y) < 1e-4 && Math.abs(p.h - w.h) < 1e-4 && w.x <= p.x + p.w + 1e-4 && w.x >= p.x
      : Math.abs(p.x - w.x) < 1e-4 && Math.abs(p.w - w.w) < 1e-4 && w.y <= p.y + p.h + 1e-4 && w.y >= p.y))
    if (prev) {
      if (w.w > w.h) prev.w = Math.max(prev.x + prev.w, w.x + w.w) - prev.x
      else prev.h = Math.max(prev.y + prev.h, w.y + w.h) - prev.y
    } else out.push({ ...w })
  }
  return out
}


// ---------- 第二阶段：返回门 / 洗手间 / 设施 ----------
/** 返回门（第五轮：自然生成）。像其他无限层的出口一样由区块布局确定性生成：
 *  每 L02_DOOR_CELL×L02_DOOR_CELL 个区块（64 m 见方的「门区」）恰好挑一个区块放一扇门——区块顺序、门在区块里的 4 m 网格位置都由种子哈希决定；
 *  距出生点（入口，16,16）不足 L02_DOOR_MIN 米的候选跳过、换门区里的下一个区块（入口附近不会一出门就有门）。
 *  门区 64 m 见方 ⇒ 任意位置 ~90 m 内总有门；出生点最近的门实测约 45–60 m（见 reports/level-0-2/round5）。 */
export const L02_DOOR_CELL = 2
export const L02_DOOR_MIN = 44
export const L02_SPAWN = { x: 16, y: 16 }
export interface L02ReturnDoor {
  /** 门面中点（世界坐标，门贴在 +y 面）与朝向（门面法线 = (sin yaw, cos yaw) = +y）。 */
  x: number; y: number; yaw: number
  /** 承门的独立短墙、门前清空区（世界坐标）。 */
  wall: { x: number; y: number; w: number; h: number }
  clear: { x: number; y: number; w: number; h: number }
  cx: number; cy: number
}
function doorCandidate(seed: number, cx: number, cy: number): L02ReturnDoor {
  const X = cx * 32, Y = cy * 32, T = L02_WALL_T
  // 门所在的墙线：x 取 4 m 网格顶点 X+8…X+24，墙线 Y+4…Y+24（门前 4.2 m 清空区与门后 1.2 m 都留在区块内）
  const x = X + (2 + Math.floor(rand(seed, 0xd0a, cx, cy) * 5)) * L02_MODULE
  const line = Y + (1 + Math.floor(rand(seed, 0xd0b, cx, cy) * 6)) * L02_MODULE
  return {
    x, y: line + T / 2, yaw: 0, cx, cy,
    wall: { x: x - 1.8, y: line - T / 2, w: 3.6, h: T },
    clear: { x: x - 2.6, y: line - 1.2, w: 5.2, h: 5.4 },
  }
}
const doorCache = new Map<string, L02ReturnDoor | null>()
/** 门区 (sx,sy) 的那扇门（没有合格候选时为 null——只会发生在紧贴出生点的门区）。纯函数，主线程与 chunk worker 共用。 */
export function l02DoorOfCell(seed: number, sx: number, sy: number): L02ReturnDoor | null {
  const key = `${seed}:${sx},${sy}`
  if (doorCache.has(key)) return doorCache.get(key)!
  const N = L02_DOOR_CELL, cells: { cx: number; cy: number; r: number }[] = []
  for (let dy = 0; dy < N; dy++) for (let dx = 0; dx < N; dx++) cells.push({ cx: sx * N + dx, cy: sy * N + dy, r: rand(seed, 0xd00, sx * N + dx, sy * N + dy) })
  cells.sort((a, b) => a.r - b.r)
  let out: L02ReturnDoor | null = null
  for (const c of cells) {
    const d = doorCandidate(seed, c.cx, c.cy)
    if (Math.hypot(d.x - L02_SPAWN.x, d.y - L02_SPAWN.y) < L02_DOOR_MIN) continue
    out = d; break
  }
  if (doorCache.size >= 128) doorCache.delete(doorCache.keys().next().value!)
  doorCache.set(key, out)
  return out
}
/** 区块 (cx,cy) 里的返回门（没有则 null）。 */
export function l02DoorOf(seed: number, cx: number, cy: number): L02ReturnDoor | null {
  const N = L02_DOOR_CELL, d = l02DoorOfCell(seed, Math.floor(cx / N), Math.floor(cy / N))
  return d && d.cx === cx && d.cy === cy ? d : null
}
/** (x,y) 半径 r 内的全部返回门（世界坐标），按距离排序。 */
export function l02DoorsNear(seed: number, x: number, y: number, r: number): L02ReturnDoor[] {
  const S = 32 * L02_DOOR_CELL, out: L02ReturnDoor[] = []
  for (let sy = Math.floor((y - r) / S); sy <= Math.floor((y + r) / S); sy++) for (let sx = Math.floor((x - r) / S); sx <= Math.floor((x + r) / S); sx++) {
    const d = l02DoorOfCell(seed, sx, sy)
    if (d && Math.hypot(d.x - x, d.y - y) <= r) out.push(d)
  }
  return out.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
}
/** 离 (x,y) 最近的返回门（默认从入口算）。门区 64 m ⇒ 192 m 内必有。 */
export function l02NearestDoor(seed: number, x = L02_SPAWN.x, y = L02_SPAWN.y): L02ReturnDoor {
  return l02DoorsNear(seed, x, y, 128)[0] ?? l02DoorsNear(seed, x, y, 256)[0]
}
/** 洗手间（偶尔出现在空置办公层区块）：6×4 m 小间；门洞朝 +y。 */
export interface L02Restroom { x: number; y: number; w: number; h: number; door: { x: number; w: number } }
export function l02RestroomOf(seed: number, cx: number, cy: number): L02Restroom | null {
  if (cx === 0 && cy === 0) return null
  if (l02RegionOf(seed, cx, cy) !== 'office') return null
  if (rand(seed, 0x7011e7, cx, cy) >= 0.3) return null
  if (l02DoorOf(seed, cx, cy)) return null // 有返回门的区块不放洗手间（两者都要大片清空区）
  const X = cx * 32, Y = cy * 32
  const gx = 1 + Math.floor(rand(seed, 0x7012, cx, cy) * 5), gy = 1 + Math.floor(rand(seed, 0x7013, cx, cy) * 5)
  const x = X + gx * L02_MODULE, y = Y + gy * L02_MODULE
  return { x, y, w: 6, h: 4, door: { x: x + 3.9, w: 1.1 } }
}
function restroomWalls(r: L02Restroom): L0Wall[] {
  const T = L02_WALL_T, H = L02_HEIGHT, w = (x: number, y: number, ww: number, hh: number): L0Wall => ({ x, y, w: ww, h: hh, bottom: 0, top: H, surface: 'wall' })
  return [
    w(r.x - T / 2, r.y - T / 2, r.w + T, T), // 后墙
    w(r.x - T / 2, r.y + T / 2, T, r.h - T), w(r.x + r.w - T / 2, r.y + T / 2, T, r.h - T), // 两侧
    w(r.x - T / 2, r.y + r.h - T / 2, r.door.x - r.x + T / 2, T), // 前墙（门洞左）
    w(r.door.x + r.door.w, r.y + r.h - T / 2, r.x + r.w + T / 2 - r.door.x - r.door.w, T), // 前墙（门洞右）
  ]
}

/** 纯函数：同种子同坐标必一致（主线程与 chunk worker 共用）。 */
export function l02Layout(seed: number, cx: number, cy: number): L0Layout {
  const X = cx * 32, Y = cy * 32
  const region = l02RegionOf(seed, cx, cy)
  let walls = region === 'rooms' ? roomWalls(seed, cx, cy) : officeWalls(seed, cx, cy)
  if (cx === 0 && cy === 0) walls = clipOut(walls, SPAWN_CLEAR)
  // 入口（16,16）正好在 4 m 网格线交点上：落在 x=16 / y=16 这两条线上的墙从入口看过去是正对端面，
  // 整面墙被 16 cm 宽的端面挡住，像一根贯穿地面到吊顶的细白竖线。入口 24 m 内这两条线上的墙不砌（只拆墙，连通性不受影响）。
  if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) walls = walls.filter((w) => !onSpawnLine(w))
  // 返回门（自然生成，见 l02DoorOfCell）：承门短墙（同材质隔墙，落在 4 m 网格线上）+ 门前清空
  const door = l02DoorOf(seed, cx, cy)
  if (door) walls = [...clipOut(walls, door.clear), { ...door.wall, bottom: 0, top: L02_HEIGHT, surface: 'wall' }]
  // 洗手间：清空周围 1.2 m 后砌一圈墙
  const rest = l02RestroomOf(seed, cx, cy)
  if (rest) walls = [...clipOut(walls, { x: rest.x - 1.2, y: rest.y - 1.2, w: rest.w + 2.4, h: rest.h + 2.4 }), ...restroomWalls(rest)]
  const a: L0Layout = {
    theme: 'l02', seed, cx, cy, region: 'open', baseRegion: 'open', revision: 0, reference: false,
    walls, pits: [], puddles: [], arches: [], lamps: [], vents: [], props: [],
  }
  // 灯盘：世界坐标晶格，严格落在吊顶板中心；与 Level 0 同一避墙规则（灯盘中心 0.65 m 内有墙即省略）
  const kx0 = Math.ceil((X - L02_TILE_X / 2) / L02_TILE_X), kx1 = Math.floor((X + 32 - L02_TILE_X / 2) / L02_TILE_X)
  const kz0 = Math.ceil((Y - L02_TILE_Z / 2) / L02_TILE_Z), kz1 = Math.floor((Y + 32 - L02_TILE_Z / 2) / L02_TILE_Z)
  for (let kz = kz0; kz <= kz1; kz++) {
    if (((kz % L02_LAMP_EVERY_Z) + L02_LAMP_EVERY_Z) % L02_LAMP_EVERY_Z !== 3) continue
    for (let kx = kx0; kx <= kx1; kx++) {
      if (((kx % L02_LAMP_EVERY_X) + L02_LAMP_EVERY_X) % L02_LAMP_EVERY_X !== 1) continue
      const x = kx * L02_TILE_X + L02_TILE_X / 2, y = kz * L02_TILE_Z + L02_TILE_Z / 2
      if (x < X || x >= X + 32 || y < Y || y >= Y + 32) continue
      if (walls.some((w) => contains(w, x - 0.65, y - 0.35, 0) || contains(w, x + 0.65, y + 0.35, 0) || contains(w, x, y, 0.65))) continue
      a.lamps.push({ x, y, red: false, off: false, round: false, width: 1.2, depth: 0.6 })
    }
  }
  // 少量回风口（复用 L0 风口模型），落在板中心
  for (const [tx, tz] of [[7, 13], [20, 26]]) {
    const vx = Math.floor((X + tx) / L02_TILE_X) * L02_TILE_X + 0.38, vz = Math.floor((Y + tz) / L02_TILE_Z) * L02_TILE_Z + 0.08
    if (vz + 0.44 > Y + 32) continue
    if (!walls.some((w) => contains(w, vx + 0.22, vz + 0.22, 0.6)) && !a.lamps.some((l) => Math.hypot(l.x - vx, l.y - vz) < 1.2)) a.vents!.push({ x: vx, y: vz, w: 0.44, h: 0.44 })
  }
  return a
}

export function genL02Chunk(def: LevelDef, seed: number, cx: number, cy: number): GenChunk {
  const a = l02Layout(seed, cx, cy), X = cx * 32, Y = cy * 32
  const raw: GenChunk = {
    l0: a, variant: l02RegionOf(seed, cx, cy),
    tiles: new Uint8Array(1024).fill(1), wet: new Uint8Array(1024), elev: new Uint8Array(1024), step: new Uint8Array(1024),
    tint: new Uint8Array(1024), crawl: new Uint8Array(1024), structures: [], items: [], lights: [], exits: [], entities: [],
  }
  let sid = 0
  const struct = (s: Omit<Structure, 'data'> & { data: NonNullable<Structure['data']> }) => raw.structures.push({ ...s, data: { ...s.data, sid: l0Hash(seed, cx, cy, 0x02a, ++sid) } })
  for (const w of a.walls) struct({ kind: 'pillar', x: w.x, y: w.y, w: w.w, h: w.h, solid: true, data: { l0Wall: 1, bottom: w.bottom, top: w.top } })
  // 光源：与 Level 0 本体灯盘同参数（world/l0Architecture.ts：r 4.2、#f7f4dd、intensityMul 0.42；烘焙在顶点色里，实时点光只补高光）
  for (const l of a.lamps) raw.lights.push({ x: l.x, y: l.y, r: 4.2, color: '#f7f4dd', flickerSeed: l0Hash(seed, Math.round(l.x * 10), Math.round(l.y * 10)), fixZ: L02_HEIGHT - 0.04, noFix: 1, gen: 1, intensityMul: 0.42 })
  // ---- 返回门（本层唯一的出口种类；按门区自然生成，可能同时看到多扇）----
  const door = l02DoorOf(seed, cx, cy)
  if (door) raw.exits.push({ def: L02_RETURN_EXIT, x: door.x - 0.5, y: door.y + 0.02 - 0.5, discovered: true, l02: { yaw: door.yaw } })
  // ---- 设施（偶尔生成；全部为 kind='l02fix'，模型由 renderer/l02Scene.ts 绘制，交互见 engine/l02Collapse.ts）----
  const fix = (f: L02FixKind, x: number, y: number, yaw: number, extra: Record<string, number | string> = {}, solid = false, hw = 0.2, hd = 0.2, top = 0.5) =>
    struct({ kind: 'l02fix', x: x - hw, y: y - hd, w: hw * 2, h: hd * 2, solid, data: { fix: f, fx: x, fy: y, yaw, ...extra, ...(solid ? { l0Wall: 1, l0Prop: 1, bottom: 0, top } : {}) } })
  const trims = l0TrimWalls(seed, [...a.walls, ...l02Neighbours(seed, a).flatMap((n) => n.walls)])
  // 可用插座：沿用 L0 插座位置（l0OutletPositions），约 45% 通电（绿色指示灯）
  for (const o of l0OutletPositions(a)) {
    if (l0Hash(seed, Math.round(o.x * 100), Math.round(o.y * 100), 0x0e1) % 100 >= 45) continue
    const host = a.walls.find((w) => o.x >= w.x && o.x <= w.x + w.w && Math.abs(w.y + w.h - o.y) < 0.01)
    fix('outlet', o.x, o.y + 0.03, 0, { h: host && trims.has(host) ? 0.46 : 0.335 }, false, 0.12, 0.06)
  }
  // 贴墙的地面摆放点：横墙 +y 面前 0.32 m
  const wallSpots = (salt: number) => {
    const out: { x: number; y: number }[] = []
    for (const w of a.walls) {
      if (w.w < 2.2 || w.h > 0.5 || w.bottom > 0) continue
      const x = w.x + 0.8 + (l0Hash(seed, salt, Math.round(w.x * 10), Math.round(w.y * 10)) % 100) / 100 * (w.w - 1.6), y = w.y + w.h + 0.32
      if (x < X + 0.5 || x > X + 31.5 || y < Y + 0.5 || y > Y + 31.5) continue
      if (a.walls.some((v) => v !== w && contains(v, x, y, 0.45))) continue
      if (door && contains(door.clear, x, y, 0.3)) continue
      out.push({ x, y })
    }
    return out
  }
  const rest = l02RestroomOf(seed, cx, cy)
  if (rest) {
    // 洗手间：两个隔间（马桶 + 隔板）靠后墙，洗手台在左墙
    for (const [i, sx] of [rest.x + 3.2, rest.x + 4.8].entries()) {
      fix('toilet', sx, rest.y + 0.45, 0, { i }, true, 0.22, 0.32, 0.45)
      fix('stall', sx - 0.8, rest.y + 0.8, 0, { i }, true, 0.03, 0.75, 1.9)
    }
    fix('stall', rest.x + 5.6, rest.y + 0.8, 0, { i: 2, end: 1 }, true, 0.03, 0.75, 1.9)
    fix('sink', rest.x + 0.35, rest.y + 1.6, Math.PI / 2, {}, true, 0.27, 0.3, 0.85)
    fix('sink', rest.x + 0.35, rest.y + 2.8, Math.PI / 2, { i: 1 }, true, 0.27, 0.3, 0.85)
    fix('restroom', rest.x + rest.w / 2, rest.y + rest.h / 2, 0, { rx: rest.x, ry: rest.y, rw: rest.w, rh: rest.h, dx: rest.door.x, dw: rest.door.w }, false, rest.w / 2, rest.h / 2)
  }
  const spots = wallSpots(0x5b0)
  // Wi‑Fi 路由器（出生区块必有，其余约 30% 区块）：放在墙脚地上，天线朝上
  // 出生区块：取离入口最近的墙脚摆放点；没有墙脚点、或最近的也在 14 m 外（Wi‑Fi 半径 16 m）时，放在入口旁地上（施工临时网络）。
  // 以前按哈希随机挑：400 个种子里约 6% 出生区块没有路由器、另约 10% 落在 16 m 外，入口收不到信号。
  const near = (s: { x: number; y: number }) => Math.hypot(s.x - L02_SPAWN.x, s.y - L02_SPAWN.y)
  if (cx === 0 && cy === 0) {
    const sp = spots.length ? spots.reduce((b, s) => (near(s) < near(b) ? s : b)) : null
    if (sp && near(sp) <= 14) { fix('router', sp.x, sp.y - 0.12, 0, {}, false, 0.14, 0.09); spots.splice(spots.indexOf(sp), 1) }
    else fix('router', L02_SPAWN.x - 1.8, L02_SPAWN.y - 2.4, 0, {}, false, 0.14, 0.09)
  } else if (spots.length && rand(seed, 0x3f1, cx, cy) < 0.3) {
    const sp = spots[l0Hash(seed, cx, cy, 0x3f2) % spots.length]
    fix('router', sp.x, sp.y - 0.12, 0, {}, false, 0.14, 0.09)
    spots.splice(spots.indexOf(sp), 1)
  }
  // 后室装修公司板夹（约 28% 区块；出生区块必有第一份「公司口号」）
  // 出生区块同样取最近的墙脚点，没有合适的点（>14 m 或已被路由器占用）就放在入口旁地上——以前约 22% 种子出生区块没有这份板夹
  if (cx === 0 && cy === 0) {
    const sp = spots.length ? spots.reduce((b, s) => (near(s) < near(b) ? s : b)) : null
    const p = sp && near(sp) <= 14 ? sp : { x: L02_SPAWN.x + 2.0, y: L02_SPAWN.y - 2.6 }
    fix('clipboard', p.x, p.y, 0, { doc: L02_DOCS[0] }, false, 0.18, 0.14)
  } else if (spots.length && rand(seed, 0xc1b, cx, cy) < 0.28) {
    const sp = spots[l0Hash(seed, cx, cy, 0xc1c) % spots.length]
    const doc = l0Hash(seed, cx, cy, 0xc1d) % 3
    fix('clipboard', sp.x, sp.y, 0, { doc: L02_DOCS[doc] }, false, 0.18, 0.14)
  }
  // 口罩：出生区块固定一只（离入口几步远）
  if (cx === 0 && cy === 0) raw.items.push({ id: 0x200000 + l0Hash(seed, 0x3a5c), type: 'dustmask', x: 19.5, y: 14.5 })
  // 零星补给（本层不是补给点）
  const rng = new RNG(l0Hash(seed, cx, cy, 0x51))
  const pool = def.items
  for (let i = 0, n = rng.int(0, 1); i < n && pool.length; i++) {
    for (let t = 0; t < 20; t++) {
      const x = X + rng.int(2, 29) + 0.5, y = Y + rng.int(2, 29) + 0.5
      if (a.walls.some((w) => contains(w, x, y, 0.8))) continue
      raw.items.push({ id: 0x200000 + l0Hash(seed, cx, cy, 0x02b, i), type: rng.weighted(pool.map((v) => ({ v: v.type, w: v.w }))), x, y })
      break
    }
  }
  return raw
}

const neighbourCache = new Map<string, L0Layout>()
/** 烘焙光照的邻块光晕（确定性：未加载的邻块按种子重算）。 */
export function l02Neighbours(seed: number, a: L0Layout): L0Layout[] {
  const out: L0Layout[] = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue
    const key = `${seed}:${a.cx + dx},${a.cy + dy}`
    let l = neighbourCache.get(key)
    if (!l) { l = l02Layout(seed, a.cx + dx, a.cy + dy); if (neighbourCache.size > 128) neighbourCache.clear(); neighbourCache.set(key, l) }
    out.push(l)
  }
  return out
}

registerInfiniteLevel(L02_ID, {
  genRaw: (def, seed, cx, cy) => genL02Chunk(def, seed, cx, cy),
  variantOf: (seed, cx, cy) => l02RegionOf(seed, cx, cy),
  rareVariants: [],
  variantNames: { rooms: '规整隔间', office: '空置办公层' },
  variantLore: {},
  spawnWorld: { x: 16, y: 16 },
})
