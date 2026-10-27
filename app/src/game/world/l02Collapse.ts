// Level 0.2「重塑的混乱」第二阶段：崩塌事件的纯数据层（世界坐标；主线程与渲染共用，无 three 依赖）。
// 设定：https://backrooms-wiki-cn.wikidot.com/level-0-2 （作者 PandaShark71004，译者 JLhze）——
//   「Level 0.2 的结构并不稳定……吊顶板会掉落、隔墙会倒塌、地板会塌陷，露出下方未完工的房屋框架。」（转述）
// 崩塌状态只存在于本次进入：每次进入 Level 0.2 都从完整状态开始（resetL02Collapse），不写存档。
//   - removedWalls：倒塌的隔墙段（碰撞体在区块实例化/实时注入时被切掉，着色器按矩形丢弃墙面片元）
//   - holes：地板塌陷口 + 下方未完工房屋（open=塌陷口，house=房屋外框；ramp=可爬出的碎料坡道）
//   - tiles：掉落的吊顶板（着色器丢弃吊顶片元，渲染层在洞口上方画设备层）
import type { Structure } from '../core/types'
import type { GenChunk } from './infiniteRegistry'
import { L0_HEIGHT } from './l0Architecture'

export interface Rect { x: number; y: number; w: number; h: number }

/** 崩塌阶段（数据驱动，可调）。rate=每分钟事件数；dust=该阶段的基础粉尘浓度（0..1）。 */
export interface CollapseStage {
  name: string
  /** 进入本层后多少秒进入该阶段。 */
  at: number
  tileRate: number
  wallRate: number
  floorRate: number
  dust: number
  /** 镜头微震幅度（0..1）。 */
  shake: number
  msg?: string
}
export const L02_STAGES: CollapseStage[] = [
  { name: '异响', at: 0, tileRate: 0, wallRate: 0, floorRate: 0, dust: 0, shake: 0, msg: '吊顶深处传来一声闷响，像有什么东西在龙骨上慢慢挪动。' },
  { name: '落板', at: 20, tileRate: 9, wallRate: 0, floorRate: 0, dust: 0.08, shake: 0.05, msg: '一块矿棉板从吊顶上松脱，砸在地毯上碎成粉。头顶的龙骨在嘎吱作响。' },
  { name: '倒墙', at: 65, tileRate: 12, wallRate: 3, floorRate: 0, dust: 0.16, shake: 0.1, msg: '远处一面隔墙整片倒了下去。空气里开始飘起石膏粉。' },
  { name: '塌陷', at: 125, tileRate: 14, wallRate: 3.5, floorRate: 1.4, dust: 0.24, shake: 0.16, msg: '地毯底下发出木板断裂的声音——地板在往下沉。' },
  { name: '崩解', at: 195, tileRate: 18, wallRate: 4.5, floorRate: 2, dust: 0.32, shake: 0.22, msg: '整层都在往下掉。找到那扇门，别停下。' },
]

/** 可调参数（第二阶段）。 */
export const L02_TUNING = {
  /** 喘息：每隔 every 秒有 dur 秒不发生新事件、基础粉尘减半（探索/拾取文档的窗口）。 */
  lullEvery: 42, lullDur: 11,
  /** 事件预警时长（秒）：吊顶板下垂掉灰 / 隔墙开裂 / 地板裂纹。 */
  tileWarn: 1.1, wallWarn: 1.6, floorWarn: 2.2,
  /** 吊顶板事件有多大比例瞄准玩家附近（其余随机落在 3–12 m 内）。 */
  tileAimShare: 0.45,
  /** 伤害（HP）：吊顶板砸中 / 隔墙压中 / 跌入塌陷口；粉尘每秒伤害 = dust × dustDps。 */
  tileDamage: 14, wallDamage: 22, fallDamage: 9, dustDps: 2.6,
  /** 口罩（dustmask，头部装备）粉尘伤害倍率。 */
  maskFactor: 0.3,
  /** 每次事件扬起的粉尘团：峰值、半径（m）、衰减时间（秒）。 */
  puffTile: 0.35, puffWall: 0.75, puffFloor: 0.9, puffR: 5, puffLife: 14,
  /** 塌陷口下方房屋深度（m）、房屋外框比塌陷口每侧大多少（m）、碎料坡道宽（m）。 */
  houseDepth: 2.7, houseMargin: 1.3, rampW: 1.25,
  /** 隔墙倒塌段长度范围（m）。 */
  wallSegMin: 2.2, wallSegMax: 4,
  /** 同时存在的上限（超过后最早的掉落吊顶板不再计入着色器——仍保留碰撞/伤害逻辑无关）。 */
  maxTiles: 48, maxWalls: 24, maxHoles: 6,
  /** 返回门：到达任意一扇门前 stopR 米内崩塌停止（门的位置见 l02Layout.l02DoorOfCell）。 */
  stopR: 3.5,
}

export interface RemovedWall extends Rect { /** 倒向：+1/-1（沿墙法线）。 */ dir: 1 | -1; axis: 'x' | 'y'; t0: number; /** 两端是否为自由端（[起点, 终点]；自由端的丢弃矩形外扩了 L02_FREE_END_PAD）。 */ freeEnds?: [boolean, boolean]; /** 原墙装了防撞条（倒下的墙板也带条）。 */ rail?: boolean }
export interface Hole { id: number; open: Rect; house: Rect; ramp: Rect; /** 坡道升高方向：+x/-x/+y/-y。 */ rampDir: 'px' | 'nx' | 'py' | 'ny'; depth: number; t0: number; /** 塌陷完成（地面已经下沉）。 */ dropped: boolean }
export interface FallenTile extends Rect { t0: number }

export interface L02CollapseState {
  removedWalls: RemovedWall[]
  holes: Hole[]
  tiles: FallenTile[]
  nextHole: number
}
let active: L02CollapseState = { removedWalls: [], holes: [], tiles: [], nextHole: 1 }
export function l02Collapse(): L02CollapseState { return active }
export function resetL02Collapse() { active = { removedWalls: [], holes: [], tiles: [], nextHole: 1 } }

const inR = (r: Rect, x: number, y: number, pad = 0) => x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad
export const rectsOverlap = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad

/**
 * 地面高度覆盖（mapgen.floorHeight 在 L0.2 区块里调用；世界坐标）。null=不覆盖（地面 0）。
 * feet：调用方的脚底高度。房屋外框在塌陷口以外的部分仍在楼板下方——脚底低于 -0.9 m（人在房屋里）才取房屋地面。
 */
export function l02FloorAt(wx: number, wy: number, feet?: number): number | null {
  for (const h of active.holes) {
    if (!h.dropped || !inR(h.house, wx, wy)) continue
    if (inR(h.ramp, wx, wy)) {
      const r = h.ramp
      const t = h.rampDir === 'px' ? (wx - r.x) / r.w : h.rampDir === 'nx' ? 1 - (wx - r.x) / r.w : h.rampDir === 'py' ? (wy - r.y) / r.h : 1 - (wy - r.y) / r.h
      return -h.depth * (1 - Math.min(1, Math.max(0, t)))
    }
    if (inR(h.open, wx, wy)) return -h.depth
    if (feet !== undefined && feet < -0.9) return -h.depth
  }
  return null
}
/** 玩家是否在房屋楼板下方（用来压头顶高度）：在房屋外框内、塌陷口外、且脚底低于 -0.9 m。 */
export function l02UnderSlab(wx: number, wy: number, feet: number): Hole | null {
  if (feet >= -0.9) return null
  for (const h of active.holes) if (h.dropped && inR(h.house, wx, wy) && !inR(h.open, wx, wy)) return h
  return null
}
/** 吊顶碰撞高度（世界坐标，绝对高度）：吊顶板底面 = L0_HEIGHT；吊顶板已掉落的那一格露出设备层，
 *  顶高取设备层楼板底（l02Scene.plenumMesh 的暗盒顶 = 吊顶 + 0.5 m，留 5 cm 余量）。
 *  地板塌陷口/未完工房屋不在这里处理：房屋楼板底由 l02UnderSlab 压头顶，塌陷口上方仍是完整吊顶（2.7 m），
 *  不会挡跌落与沿坡道爬出的路径（坑底 -2.7 m 到吊顶有 5.4 m）。 */
export const L02_PLENUM_UP = 0.45
export function l02CeilingAt(wx: number, wy: number): number {
  for (const t of active.tiles) if (inR(t, wx, wy)) return L0_HEIGHT + L02_PLENUM_UP
  return L0_HEIGHT
}
/** 头顶与吊顶之间保留的余量（m）：眼高 = 脚底 + 1.55 m + 头部晃动，余量保证相机近裁面不切进吊顶。 */
export const L02_HEAD_CLEAR = 0.12
export function l02HoleAt(wx: number, wy: number): Hole | null {
  for (const h of active.holes) if (h.dropped && inR(h.open, wx, wy)) return h
  return null
}

/** 未完工房屋的碰撞体（世界坐标）：四面外墙（胶合板 + 龙骨）+ 一道带门洞的内隔墙（不挡坡道）。 */
export function houseColliders(h: Hole): Rect[] {
  const F = h.house, O = h.open, t = 0.14, out: Rect[] = []
  out.push({ x: F.x - t, y: F.y - t, w: F.w + 2 * t, h: t }, { x: F.x - t, y: F.y + F.h, w: F.w + 2 * t, h: t })
  out.push({ x: F.x - t, y: F.y, w: t, h: F.h }, { x: F.x + F.w, y: F.y, w: t, h: F.h })
  for (const p of housePartition(h)) out.push(p)
  void O
  return out
}
/** 内隔墙：垂直于坡道方向的一道龙骨墙，从坡道对侧的外墙伸出，留 1.1 m 门洞，止于坡道车道之外。 */
export function housePartition(h: Hole): Rect[] {
  const F = h.house, O = h.open, R = h.ramp, t = 0.1
  const alongX = h.rampDir === 'px' || h.rampDir === 'nx'
  if (alongX) {
    const x = O.x + O.w * 0.42
    // 坡道在 O 的北侧（R.y==O.y）或南侧
    const north = R.y <= O.y + 0.01
    const y0 = north ? R.y + R.h + 0.3 : F.y, y1 = north ? F.y + F.h : R.y - 0.3
    const len = y1 - y0, door = 1.1, d0 = y0 + len * 0.55
    return [{ x: x - t / 2, y: y0, w: t, h: d0 - y0 }, { x: x - t / 2, y: d0 + door, w: t, h: Math.max(0, y1 - d0 - door) }].filter((r) => r.h > 0.3)
  }
  const y = O.y + O.h * 0.42
  const west = R.x <= O.x + 0.01
  const x0 = west ? R.x + R.w + 0.3 : F.x, x1 = west ? F.x + F.w : R.x - 0.3
  const len = x1 - x0, door = 1.1, d0 = x0 + len * 0.55
  return [{ x: x0, y: y - t / 2, w: d0 - x0, h: t }, { x: d0 + door, y: y - t / 2, w: Math.max(0, x1 - d0 - door), h: t }].filter((r) => r.w > 0.3)
}

const HOUSE_SID = 0x6c020000
/** 隔墙段被切掉后剩下的部分（世界坐标矩形）。 */
function cutWall(s: { x: number; y: number; w: number; h: number }, cuts: RemovedWall[]): Rect[] {
  let parts: Rect[] = [{ x: s.x, y: s.y, w: s.w, h: s.h }]
  for (const c of cuts) {
    parts = parts.flatMap((p) => {
      if (!rectsOverlap(p, c, -0.001)) return [p]
      if (p.w >= p.h) return [{ ...p, w: c.x - p.x }, { ...p, x: c.x + c.w, w: p.x + p.w - c.x - c.w }].filter((v) => v.w > 0.05)
      return [{ ...p, h: c.y - p.y }, { ...p, y: c.y + c.h, h: p.y + p.h - c.y - c.h }].filter((v) => v.h > 0.05)
    })
  }
  return parts
}
/** 把当前崩塌状态应用到一组结构（坐标系 = 世界坐标减 (ox,oy)）：切掉倒塌的隔墙段、加入房屋碰撞体。返回新数组。 */
export function applyCollapseToStructures(list: Structure[], X: number, Y: number, ox: number, oy: number): Structure[] {
  const { removedWalls, holes } = active
  if (!removedWalls.length && !holes.length) return list
  const out: Structure[] = []
  for (const s of list) {
    const tall = s.data?.l0Wall && !s.data?.l0Prop && !s.data?.l02House && Number(s.data?.bottom) <= 0 && Number(s.data?.top) > 2
    if (!tall || !removedWalls.length) { if (!s.data?.l02House) out.push(s); continue }
    const world = { x: s.x + ox, y: s.y + oy, w: s.w, h: s.h }
    const hits = removedWalls.filter((c) => rectsOverlap(world, c, -0.001))
    if (!hits.length) { out.push(s); continue }
    cutWall(world, hits).forEach((p, i) => out.push({ ...s, x: p.x - ox, y: p.y - oy, w: p.w, h: p.h, data: { ...s.data, sid: Number(s.data?.sid ?? 0) ^ (0x5100 + i), l02Cut: 1 } }))
  }
  for (const h of holes) {
    if (!h.dropped) continue
    houseColliders(h).forEach((r, i) => {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2
      if (cx < X || cx >= X + 32 || cy < Y || cy >= Y + 32) return
      out.push({ kind: 'pillar', x: r.x - ox, y: r.y - oy, w: r.w, h: r.h, solid: true, data: { l0Wall: 1, l02House: 1, bottom: -h.depth - 0.1, top: -0.3, sid: HOUSE_SID + h.id * 64 + i } })
    })
  }
  return out
}
/** 区块实例化钩子（infinite.ts）：原始数据为世界坐标，返回新对象不改输入。 */
export function applyL02Collapse(raw: GenChunk, cx: number, cy: number): GenChunk {
  if (!active.removedWalls.length && !active.holes.length) return raw
  return { ...raw, structures: applyCollapseToStructures(raw.structures, cx * 32, cy * 32, 0, 0) }
}

/** 全高隔墙（用于选倒塌段）：世界坐标。 */
export interface WallRect extends Rect { sid: number }
/** 在墙 w 上选一段长 len 的倒塌段（靠近点 (px,py)）。 */
export function pickWallSegment(w: Rect, px: number, py: number, len: number, t0: number, dirSeed: number): RemovedWall {
  const horiz = w.w >= w.h
  const L = horiz ? w.w : w.h, seg = Math.min(L, len)
  const along = horiz ? px - w.x : py - w.y
  const start = Math.min(L - seg, Math.max(0, along - seg / 2))
  // 墙太短（只剩短头）时整段倒
  const s0 = L - seg < 0.8 ? 0 : start, s1 = L - seg < 0.8 ? L : start + seg
  // 把防撞条（外伸 1.4 cm）与烘焙在墙面上的插座面板（面板+面盖+螺钉外伸约 2.35 cm）一并包进丢弃矩形；
  // 以前 2 cm 时插座最外 3 mm（面盖/螺钉）会悬在倒掉的墙原位（第五轮 QA：独立短墙整面倒检查发现）
  const pad = 0.03
  const r: Rect = horiz ? { x: w.x + s0, y: w.y - pad, w: s1 - s0, h: w.h + 2 * pad } : { x: w.x - pad, y: w.y + s0, w: w.w + 2 * pad, h: s1 - s0 }
  return { ...r, axis: horiz ? 'x' : 'y', dir: dirSeed > 0.5 ? 1 : -1, t0 }
}
/** 墙端余量（m）：倒塌段的某一端如果正好是墙的自由端（外面没有别的全高墙接着），丢弃矩形沿墙向外多包 3 cm——
 *  墙端面（宽=墙厚的竖直面）、端头护角条与防撞条外伸的 1.4 cm 都正好落在原矩形边界上，着色器按「严格在矩形内」丢弃，
 *  边界上的片元会留下一片竖直的薄贴图（第五轮用户截图）。连着别的墙的一端不外扩（断口由 capMeshes 补断面）。 */
export const L02_FREE_END_PAD = 0.03
export function extendFreeEnds(seg: RemovedWall, walls: Rect[]): RemovedWall {
  const horiz = seg.axis === 'x', cx = seg.x + seg.w / 2, cy = seg.y + seg.h / 2
  const hit = (x: number, y: number) => walls.some((r) => x > r.x - 0.01 && x < r.x + r.w + 0.01 && y > r.y - 0.01 && y < r.y + r.h + 0.01)
  const P = L02_FREE_END_PAD, out: RemovedWall = { ...seg }
  const a = horiz ? !hit(seg.x - 0.05, cy) : !hit(cx, seg.y - 0.05)
  const b = horiz ? !hit(seg.x + seg.w + 0.05, cy) : !hit(cx, seg.y + seg.h + 0.05)
  if (horiz) { if (a) { out.x -= P; out.w += P } if (b) out.w += P }
  else { if (a) { out.y -= P; out.h += P } if (b) out.h += P }
  out.freeEnds = [a, b]
  return out
}
/** 塌陷口规划：在中心 (cx,cy) 附近放一个不压墙的开口（尽量大），返回 Hole（未下沉）。 */
export function planHole(cx: number, cy: number, walls: Rect[], avoid: Rect[], id: number, t0: number, flip: number): Hole | null {
  const sizes: [number, number][] = [[5.6, 4.2], [4.8, 3.6], [4.2, 3.4], [3.6, 3.2]]
  for (const [a, b] of sizes) for (const rot of [0, 1]) {
    const w = rot ? b : a, h = rot ? a : b
    const open: Rect = { x: Math.round((cx - w / 2) * 10) / 10, y: Math.round((cy - h / 2) * 10) / 10, w, h }
    if (walls.some((r) => rectsOverlap(open, r, 0.3))) continue
    if (avoid.some((r) => rectsOverlap(open, r, 0.6))) continue
    const M = L02_TUNING.houseMargin, house: Rect = { x: open.x - M, y: open.y - M, w: open.w + 2 * M, h: open.h + 2 * M }
    if (active.holes.some((o) => rectsOverlap(house, o.house, 0.6))) continue
    const R = L02_TUNING.rampW, alongX = w >= h
    const ramp: Rect = alongX ? { x: open.x, y: flip > 0.5 ? open.y : open.y + open.h - R, w: open.w, h: R } : { x: flip > 0.5 ? open.x : open.x + open.w - R, y: open.y, w: R, h: open.h }
    const rampDir = alongX ? (flip > 0.25 && flip < 0.75 ? 'px' : 'nx') : (flip > 0.25 && flip < 0.75 ? 'py' : 'ny')
    return { id, open, house, ramp, rampDir, depth: L02_TUNING.houseDepth, t0, dropped: false }
  }
  return null
}
