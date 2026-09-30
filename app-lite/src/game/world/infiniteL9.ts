// ================= Level 9「郊区」无限区块重制 =================
// 世界坐标纯函数保证街道、城市化路线与住宅跨区块连续；住宅本体限制在单区块内，
// 以便流式卸载时不重复生成大型模型。L9 的黑雾与残缺者属于运行时事件，见 engine/ambient.ts。
import { RNG } from '../core/rng'
import type { ExitDef, ExitInstance, GroundItem, LevelDef, LightSource, Structure } from '../core/types'
import { CS, GEN_ITEM_BASE, h32 } from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'

export type L9Variant =
  | 'residential' | 'rainstreet' | 'culdesac' | 'blackout'
  | 'backyards' | 'fused' | 'fieldedge' | 'playground' | 'powerline'
  | 'poolblock' | 'cityapproach' | 'forest'

export const L9_VARIANT_NAMES: Record<L9Variant, string> = {
  residential: '寂静住宅街', rainstreet: '雨后街区',
  culdesac: '死胡同', blackout: '完全停电街区', backyards: '连片后院',
  fused: '嵌合住宅街', fieldedge: '田野边缘', playground: '废弃游乐场',
  powerline: '输电线走廊', poolblock: '泳池住宅街', cityapproach: '城市化公路',
  forest: '午夜森林',
}

export const L9_VARIANT_LORE: Record<string, string[]> = {
  residential: ['没有一栋住宅完全相同。家具崭新、房间齐全，唯独电网像从未存在过。'],
  rainstreet: ['沥青仍被雨水浸透，水洼倒映着没有星星的天空。'],
  culdesac: ['道路在一圈互相注视的房屋前终止。每一个窗帘后都像有人。'],
  blackout: ['这里连偶尔闪烁的路灯都没有。电子设备发出的微光会引来邻里守望。'],
  backyards: ['围栏把草坪切成狭长的后院；烧烤架、秋千和躺椅都留在原位。'],
  fused: ['两座住宅互相穿入，屋顶与墙体共享了不可能存在的体积。'],
  fieldedge: ['最后一排住宅之外是无边田野；一条窄小土径离开郊区。'],
  playground: ['褪色的秋千和滑梯在风里轻响，白光从一截儿童管道内部渗出。'],
  powerline: ['输电塔一直伸向黑暗深处，但所有电线都没有电流。'],
  poolblock: ['后院泳池仍蓄满冰冷的水，水泵却没有任何电源。'],
  cityapproach: ['箭头路牌越来越密，湿路面也逐渐变成更宽、更平整的城市柏油路。'],
  forest: ['两排住宅突然被密林取代。林带环绕着整片街区，只剩湿路从树干之间继续延伸。'],
}

export const L9_RARE_VARIANTS: readonly string[] = Object.keys(L9_VARIANT_NAMES)

export const L9_L5_DOOR_SPAWN = { x: 9.5, y: 14.5 }
export const L9_POOL_SPAWN = { x: 24.5, y: 28.5 }
export const L9_CAVE_SPAWN = { x: 3.5, y: 16.5 }
export const L9_ROUTE_SPACING = 72

const h01 = (...n: number[]) => h32(...n) / 4294967296
const idx = (x: number, y: number) => y * CS + x
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const sidOf = (seed: number, cx: number, cy: number, n: number) =>
  (h32(seed, 0x9190, cx, cy, n) & 0x7fffffff) || 1

export function l9ArrowCount(seed: number): number { return 6 + (h32(seed, 0x9a90) % 5) }

export function l9ArrowPoint(seed: number, n: number): { x: number; y: number } {
  const x = 48 + n * L9_ROUTE_SPACING
  const y = Math.round(16
    + Math.sin((n + 0.5) * 1.37 + (seed & 255) * 0.013) * 12
    + ((h32(seed, 0x9a91, n) % 13) - 6))
  return { x, y }
}

function l9RegionHost(seed: number, rx: number, ry: number) {
  const bx = h32(seed, 0x9f10, rx, ry) % 8
  const by = h32(seed, 0x9f11, rx, ry) % 8
  for (let n = 0; n < 64; n++) {
    // 遍历本 8×8 区域全部 64 个位置。旧的 n*3/n*5 同步步进每 8 次就重复，
    // 实际只检查了八个对角点，加入森林环带后可能错误地把田野出口塞回林带。
    const ix = n & 7, iy = n >> 3
    const cx = rx * 8 + ((bx + ix) % 8)
    const cy = ry * 8 + ((by + iy + ix * 5) % 8)
    if ((cx !== 0 || cy !== 0) && !routeChunk(seed, cx, cy) && !forestRingChunk(seed, cx, cy)) return { cx, cy }
  }
  return { cx: rx * 8 + bx, cy: ry * 8 + by }
}

function segDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const d2 = dx * dx + dy * dy || 1
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / d2, 0, 1)
  const qx = ax + dx * t, qy = ay + dy * t
  return { d: Math.hypot(px - qx, py - qy), t, qx, qy }
}

export function l9RouteInfo(seed: number, wx: number, wy: number) {
  const count = l9ArrowCount(seed)
  let a = { x: 1, y: 16 }
  let best = { d: Infinity, progress: 0, qx: a.x, qy: a.y }
  for (let n = 0; n < count; n++) {
    const b = l9ArrowPoint(seed, n)
    const q = segDistance(wx, wy, a.x, a.y, b.x, b.y)
    const progress = (n + q.t) / Math.max(1, count - 0.2)
    if (q.d < best.d) best = { d: q.d, progress, qx: q.qx, qy: q.qy }
    a = b
  }
  return best
}

function suburbRoadDistance(_seed: number, wx: number, wy: number): number {
  // 道路严格沿 32m 街区边界延伸。旧版 64m 波浪网格令草地空洞巨大，也使住宅无法稳定朝向道路。
  const edgeDistance = (v: number) => {
    const m = ((v % CS) + CS) % CS
    return Math.min(m, CS - m)
  }
  return Math.min(edgeDistance(wx), edgeDistance(wy))
}

function routeChunk(seed: number, cx: number, cy: number) {
  const x = cx * CS + CS / 2, y = cy * CS + CS / 2
  return l9RouteInfo(seed, x, y).d < 27
}

// 每个 14×14 区块的大街区都由确定性的森林环带围住。环带在宏区块边界
// 两侧各占 1 个区块，相接后总厚度正好为 2 个区块，不再形成旧版 4 层林带。
// 按世界种子平移环带，既保持无限世界可复现，也避免所有存档都在同一组
// 绝对坐标遇到森林。
const L9_FOREST_MACRO = 14
const L9_FOREST_HALF_BAND = 1
const posMod = (v: number, n: number) => ((v % n) + n) % n
function forestRingChunk(seed: number, cx: number, cy: number): boolean {
  const ox = h32(seed, 0x9f71) % L9_FOREST_MACRO
  const oy = h32(seed, 0x9f72) % L9_FOREST_MACRO
  const lx = posMod(cx + ox, L9_FOREST_MACRO)
  const ly = posMod(cy + oy, L9_FOREST_MACRO)
  return lx < L9_FOREST_HALF_BAND || ly < L9_FOREST_HALF_BAND
    || lx >= L9_FOREST_MACRO - L9_FOREST_HALF_BAND || ly >= L9_FOREST_MACRO - L9_FOREST_HALF_BAND
}

export function l9VariantOf(seed: number, cx: number, cy: number): L9Variant {
  // L8 第九大道石洞所在出生区固定为林中住宅边缘；L5 门口住宅与 L7 泳池仍由
  // 下方固定预制锚点生成，不会因森林变体而丢失。
  if (cx === 0 && cy === 0) return 'forest'
  if (routeChunk(seed, cx, cy)) return 'cityapproach'
  if (forestRingChunk(seed, cx, cy)) return 'forest'
  // 8×8 区域只有一个田野边缘宿主，保证 Level 10 出口稀少但持续存在。
  const rx = Math.floor(cx / 8), ry = Math.floor(cy / 8)
  const { cx: hx, cy: hy } = l9RegionHost(seed, rx, ry)
  if (cx === hx && cy === hy) return 'fieldedge'
  const macroX = Math.floor(cx / 2), macroY = Math.floor(cy / 2)
  const r = h01(seed, 0x9b00, macroX, macroY)
  if (r < 0.08) return 'rainstreet'
  if (r < 0.14) return 'culdesac'
  if (r < 0.19) return 'blackout'
  if (r < 0.28) return 'backyards'
  if (r < 0.31) return 'fused'
  if (r < 0.36) return 'playground'
  if (r < 0.42) return 'powerline'
  if (r < 0.50) return 'poolblock'
  return 'residential'
}

const exitDef = (def: LevelDef, kind: string): ExitDef | undefined => def.exits.find(e => e.kind === kind)

export function genL9ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string): GenChunk {
  const variant = (forceVariant as L9Variant | undefined) ?? l9VariantOf(seed, cx, cy)
  const rng = new RNG(h32(seed, 0x9c00, cx, cy))
  const WX = cx * CS, WY = cy * CS
  const tiles = new Uint8Array(CS * CS).fill(1)
  const wet = new Uint8Array(CS * CS)
  const elev = new Uint8Array(CS * CS).fill(3)
  const step = new Uint8Array(CS * CS)
  const tint = new Uint8Array(CS * CS).fill(36) // L9 草坪
  const crawl = new Uint8Array(CS * CS)
  const outdoor = new Uint8Array(CS * CS).fill(1)
  const ceiling = new Uint8Array(CS * CS)
  const liquid = new Uint8Array(CS * CS)
  const seaFloor = new Float32Array(CS * CS).fill(1.7)
  const structures: Structure[] = []
  const items: GroundItem[] = []
  const lights: LightSource[] = []
  const exits: ExitInstance[] = []
  const entities: GenChunk['entities'] = []
  let stateN = 0, itemN = 0

  const local = (wx: number, wy: number) => ({ x: wx - WX, y: wy - WY })
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < CS && y < CS
  const add = (kind: Structure['kind'], x: number, y: number, w = 1, h = 1, solid = false, data?: Structure['data']) => {
    // 区块边缘的后院/泳池附件不得泄漏到相邻区块；相邻区块会自行生成自己的内容。
    if (x + w <= 0 || y + h <= 0 || x >= CS || y >= CS) return
    structures.push({ kind, x: WX + x, y: WY + y, w, h, solid, data })
  }
  const setSurface = (x: number, y: number, t: number) => {
    if (!inside(x, y)) return
    const i = idx(x, y); tiles[i] = 1; elev[i] = 3; outdoor[i] = 1; tint[i] = t
  }

  // 基础路网 + 第九大道引导路线。越接近最终路牌，柏油越平整、越城市化。
  for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
    const wx = WX + x + 0.5, wy = WY + y + 0.5
    const route = l9RouteInfo(seed, wx, wy)
    const rd = Math.min(suburbRoadDistance(seed, wx, wy), route.d)
    // 森林中的道路应是较窄的穿林支路，而非与住宅区同宽的双向街道。
    const roadHalfWidth = variant === 'forest' ? 2.05 : 3.15
    if (rd < roadHalfWidth) tint[idx(x, y)] = route.d < roadHalfWidth && route.progress > 0.55 ? 39 : 34
    // 午夜森林只保留穿林道路；路沿外直接衔接草地、灌木和树木，不再在
    // 相邻森林区块之间延续住宅区的人行道。
    else if (rd < 4.7 && variant !== 'forest') tint[idx(x, y)] = 35
    // 每种街区都可能残留雨后积水；雨后街区和第九大道更常见。旧逻辑只给极少数
    // 特殊区块 7.5% 的道路格做标记，普通住宅街实际上完全看不到水洼。
    const puddleChance = variant === 'rainstreet' ? 0.22 : route.d < 4.2 ? 0.12 : 0.055
    if (rd < roadHalfWidth - .05 && h01(seed, 0x9d10, Math.floor(wx), Math.floor(wy)) < puddleChance) wet[idx(x, y)] = 1
  }
  if (variant === 'culdesac') {
    // 环形回车场覆盖普通路网表面，但仍保留一条接入道路；不是只换一个变体名字。
    for (let y = 7; y <= 25; y++) for (let x = 7; x <= 25; x++) {
      const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16)
      if (d < 5.4) tint[idx(x, y)] = 34
      else if (d < 7.0) tint[idx(x, y)] = 35
    }
    for (let y = 16; y < CS; y++) for (let x = 13; x <= 18; x++) tint[idx(x, y)] = x === 13 || x === 18 ? 35 : 34
  }

  type HouseFront = 'n' | 's' | 'e' | 'w'
  const roadClear = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!inside(x, y)) return false
      if (tint[idx(x, y)] === 34 || tint[idx(x, y)] === 35 || tint[idx(x, y)] === 39) return false
    }
    return true
  }

  const placeHouse = (x0: number, y0: number, w: number, h: number, style: number, front: HouseFront, pool = false) => {
    // 房屋内部不属于室外；外墙和隔墙统一参与碰撞，门格单独雕空。
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!inside(x, y)) continue
      const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1
      const i = idx(x, y)
      tiles[i] = edge ? 2 : 1; elev[i] = 0; outdoor[i] = 0; tint[i] = edge ? 41 : 37
    }
    const doorX = front === 'e' ? x0 + w - 1 : front === 'w' ? x0 : x0 + Math.floor(w / 2)
    const doorY = front === 'n' ? y0 : front === 's' ? y0 + h - 1 : y0 + Math.floor(h / 2)
    tiles[idx(doorX, doorY)] = 1
    tint[idx(doorX, doorY)] = 37
    // 一层窗户是实际墙洞：先雕空墙格，再用薄玻璃结构封住碰撞。玩家能透过玻璃看到真实家具，
    // 而不是在完整墙面上再贴一张黑色窗片。窗组件会按实际层高自动补齐上下墙段。
    const carveWindow = (wx: number, wy: number, side: HouseFront) => {
      if (!inside(wx, wy) || (wx === doorX && wy === doorY)) return
      tiles[idx(wx, wy)] = 1; tint[idx(wx, wy)] = 37; outdoor[idx(wx, wy)] = 0
      const sx = side === 'e' ? wx + .84 : wx
      const sy = side === 's' ? wy + .84 : wy
      const sw = side === 'e' || side === 'w' ? .16 : 1
      const sh = side === 'n' || side === 's' ? .16 : 1
      const wdeg = side === 'n' ? 180 : side === 's' ? 0 : side === 'e' ? 90 : 270
      add('l9window', sx, sy, sw, sh, true, { deg: wdeg, style })
    }
    const xWins = [...new Set([x0 + Math.max(2, Math.floor(w * .24)), x0 + w - 1 - Math.max(2, Math.floor(w * .24))])]
    const yWins = [...new Set([y0 + Math.max(2, Math.floor(h * .28)), y0 + h - 1 - Math.max(2, Math.floor(h * .28))])]
    for (const x of xWins) {
      if (!((style === 0 || style === 10 || style === 11) && x < x0 + w / 2)) carveWindow(x, y0, 'n')
      carveWindow(x, y0 + h - 1, 's')
    }
    for (const y of yWins) { carveWindow(x0, y, 'w'); carveWindow(x0 + w - 1, y, 'e') }
    const layout = style % 3
    const midY = y0 + clamp(Math.floor(h * (layout === 1 ? .48 : .58)), 3, h - 3)
    const splitX = x0 + clamp(Math.floor(w * (layout === 2 ? .45 : .61)), 4, w - 4)
    const wall = (x: number, y: number) => { if (inside(x, y)) { tiles[idx(x, y)] = 2; tint[idx(x, y)] = 41 } }
    if (layout === 0) {
      for (let x = x0 + 1; x < x0 + w - 1; x++) if (x !== x0 + 3 && x !== x0 + w - 4) wall(x, midY)
      for (let y = y0 + 1; y < midY; y++) if (y !== y0 + 2) wall(splitX, y)
    } else if (layout === 1) {
      for (let y = y0 + 1; y < y0 + h - 1; y++) if (y !== y0 + 3 && y !== y0 + h - 3) wall(splitX, y)
      for (let x = x0 + 1; x < splitX; x++) if (x !== x0 + 3) wall(x, midY)
    } else {
      for (let x = splitX; x < x0 + w - 1; x++) if (x !== x0 + w - 3) wall(x, midY)
      for (let y = y0 + 1; y <= midY; y++) if (y !== y0 + 2) wall(splitX, y)
    }

    // 三角山墙住宅仍是正常两层洋楼，A 字只属于正面局部屋顶轮廓，不能让一块
    // 巨型斜顶从一楼一直罩住整栋建筑。
    const stories = style >= 16 ? 2 : style === 0 || style === 8 ? 1 : style === 6 ? 3 : 2
    const deg = front === 'n' ? 180 : front === 's' ? 0 : front === 'e' ? 90 : 270
    const doorOffset = front === 'n' || front === 's'
      ? doorX + .5 - (x0 + w / 2)
      : doorY + .5 - (y0 + h / 2)
    add('house', x0, y0, w, h, false, { style, layout, stories, front, pool, deg, doorOffset })
    // 门扇使用 16cm 深的真实薄碰撞，并贴到外墙外沿；旧版 1×1m 门体位于墙格中心，视觉和碰撞都像卡进墙里。
    const doorSX = front === 'e' ? doorX + .84 : doorX
    const doorSY = front === 's' ? doorY + .84 : doorY
    const doorSW = front === 'e' || front === 'w' ? .16 : 1
    const doorSH = front === 'n' || front === 's' ? .16 : 1
    add('hoteldoor', doorSX, doorSY, doorSW, doorSH, true, { sid: sidOf(seed, cx, cy, stateN++), open: 0, locked: 0, l9: 1, style, deg })

    // 家具统一做整块占地校验；不再靠一套固定坐标硬塞进不同尺寸/布局的墙里。
    const reserved: { x: number; y: number; w: number; h: number }[] = []
    if (front === 'n') reserved.push({ x: doorX - 1, y: y0, w: 3, h: 3 })
    else if (front === 's') reserved.push({ x: doorX - 1, y: y0 + h - 3, w: 3, h: 3 })
    else if (front === 'w') reserved.push({ x: x0, y: doorY - 1, w: 3, h: 3 })
    else reserved.push({ x: x0 + w - 3, y: doorY - 1, w: 3, h: 3 })
    const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    const clearInterior = (x: number, y: number, fw: number, fh: number) => {
      if (x < x0 + 1 || y < y0 + 1 || x + fw > x0 + w - 1 || y + fh > y0 + h - 1) return false
      const rect = { x, y, w: fw, h: fh }
      if (reserved.some(r => overlaps(rect, r))) return false
      for (let yy = Math.floor(y); yy < Math.ceil(y + fh); yy++) for (let xx = Math.floor(x); xx < Math.ceil(x + fw); xx++) {
        if (!inside(xx, yy) || tiles[idx(xx, yy)] !== 1) return false
      }
      return !structures.some(s => s.solid && overlaps(rect, { x: s.x - WX, y: s.y - WY, w: s.w, h: s.h }))
    }
    const put = (kind: Structure['kind'], spots: [number, number][], fw = 1, fh = 1, solid = true, data?: Structure['data']) => {
      for (const [x, y] of spots) if (clearInterior(x, y, fw, fh)) { add(kind, x, y, fw, fh, solid, data); return true }
      return false
    }
    const sofaColor = ['#48505b', '#58604b', '#663d45', '#5b5148'][style % 4]
    put('sofa', [[x0 + 1, midY + 1], [x0 + 1, y0 + h - 3], [splitX + 1, midY + 1]], 3, 1, true, { deg: 90, color: sofaColor })
    if (style % 4 === 1) put('l9diningtable', [[x0 + 5, midY + 1], [splitX + 1, midY + 1]], 2, 2, true, { style })
    else put('l9coffeetable', [[x0 + 5, midY + 2], [x0 + 2, midY + 2]], 2, 1, true, { style })
    put('l9tvconsole', [[x0 + 1, y0 + h - 2], [x0 + w - 2, midY + 1]], 1, 1, true, { deg: 180, style })
    put('kcounter', [[x0 + 1, y0 + 1], [x0 + 1, midY - 2]], 2, 1, true, { deg: 0, style })
    put('sink', [[x0 + 3, y0 + 1], [x0 + 3, midY - 2]], 1, 1, true, { deg: 0 })
    put('fridge', [[x0 + 1, y0 + 3], [x0 + 1, midY - 3]], 1, 1, true, { sid: sidOf(seed, cx, cy, stateN++), style })
    put('bed', [[splitX + 1, y0 + 1], [x0 + w - 3, y0 + 1]], 2, 2, true, { deg: 180, style })
    put('dresser', [[splitX + 1, midY - 2], [x0 + w - 3, y0 + 4]], 2, 1, true, { sid: sidOf(seed, cx, cy, stateN++), deg: 0 })
    put('l9toilet', [[x0 + 1, midY - 2], [x0 + w - 2, midY - 2]], 1, 1, true, { deg: 0 })
    put('l9bathtub', [[x0 + 2, midY - 2], [x0 + w - 3, midY - 2]], 2, 1, true, { deg: 0 })
    put(style % 2 === 0 ? 'l9fireplace' : 'l9bookshelf', [[x0 + w - 2, midY + 1], [x0 + 1, midY + 1]], 1, 1, true, { deg: 270 })
    put('l9floorlamp', [[x0 + 2, midY + 2], [x0 + w - 2, y0 + h - 2]], 1, 1, false, { off: 1 })
    put('l9stair', [[x0 + w - 2, y0 + h - 3], [x0 + w - 2, y0 + 1]], 1, 2, true, { locked: 1, deg })

    // 从门槛到人行道的独立混凝土小径；只覆盖草坪，不切断道路和人行道材质。
    const pathTile = (x: number, y: number) => { if (inside(x, y) && outdoor[idx(x, y)] === 1 && tint[idx(x, y)] === 36) tint[idx(x, y)] = 40 }
    const hasGarage = style === 0 || style === 10 || style === 11
    const garageAcross = front === 'n' || front === 's'
      ? Math.round(x0 + w / 2 - w * .27)
      : Math.round(y0 + h / 2 + (front === 'e' ? h * .27 : -h * .27))
    if (front === 'n' || front === 's') {
      const ya = front === 'n' ? 5 : doorY + 1, yb = front === 'n' ? doorY - 1 : 26
      for (let y = ya; y <= yb; y++) for (let x = doorX - 1; x <= doorX; x++) pathTile(x, y)
      if (hasGarage) {
        for (let y = ya; y <= yb; y++) for (let x = garageAcross - 1; x <= garageAcross + 1; x++) pathTile(x, y)
      }
      const mailY = front === 'n' ? Math.max(5, doorY - 1) : Math.min(26, doorY + 1)
      add('mailbox', doorX + (style % 2 ? 2 : -2) + .25, mailY + .25, .5, .5, true, { sid: sidOf(seed, cx, cy, stateN++), deg })
      const fenceY = front === 'n' ? doorY - 1 : doorY + 1
      for (let fx = x0; fx < x0 + w; fx++) if (Math.abs(fx - doorX) > 1 && (!hasGarage || Math.abs(fx - garageAcross) > 1)) add('picketfence', fx, fenceY + .44, 1, .12, true, { deg: 0 })
    } else {
      const xa = front === 'w' ? 5 : doorX + 1, xb = front === 'w' ? doorX - 1 : 26
      for (let x = xa; x <= xb; x++) for (let y = doorY - 1; y <= doorY; y++) pathTile(x, y)
      if (hasGarage) {
        for (let x = xa; x <= xb; x++) for (let y = garageAcross - 1; y <= garageAcross + 1; y++) pathTile(x, y)
      }
      const mailX = front === 'w' ? Math.max(5, doorX - 1) : Math.min(26, doorX + 1)
      add('mailbox', mailX + .25, doorY + (style % 2 ? 2 : -2) + .25, .5, .5, true, { sid: sidOf(seed, cx, cy, stateN++), deg })
      const fenceX = front === 'w' ? doorX - 1 : doorX + 1
      for (let fy = y0; fy < y0 + h; fy++) if (Math.abs(fy - doorY) > 1 && (!hasGarage || Math.abs(fy - garageAcross) > 1)) add('picketfence', fenceX + .44, fy, .12, 1, true, { deg: 90 })
    }

    // 现代住宅与后院街区生成真正的后院使用痕迹：高脚花盆和低矮菜畦均留出通行缝隙。
    if (!pool && (variant === 'backyards' || style >= 12 || h01(seed, 0x9c80, cx, cy, x0, y0) < .22)) {
      if (front === 'n' || front === 's') {
        const by = front === 'n' ? y0 + h + .15 : y0 - 1.05
        add('l9vegbed', x0 + Math.max(2, Math.floor(w * .2)), by, Math.min(3.4, w * .24), .9, false, { style })
        add('l9planter', x0 + w - 2.1, by + .1, 1.25, .65, false, { style })
      } else {
        const bx = front === 'w' ? x0 + w + .15 : x0 - 1.05
        add('l9vegbed', bx, y0 + Math.max(2, Math.floor(h * .2)), .9, Math.min(3.4, h * .24), false, { style, deg: 90 })
        add('l9planter', bx + .1, y0 + h - 2.1, .65, 1.25, false, { style, deg: 90 })
      }
    }

    if (pool) {
      let py0 = front === 'n' ? y0 + h + 1 : y0 - 5
      // 区块边缘住宅的真正后院可能落到未加载的邻区块；改到另一侧，确保“泳池住宅街”一定看得到泳池。
      if (py0 < 1 || py0 + 5 > CS) py0 = front === 'n' ? y0 - 5 : y0 + h + 1
      for (let y = py0; y < py0 + 5; y++) for (let x = x0 + 2; x < x0 + w - 2; x++) {
        if (!inside(x, y)) continue
        setSurface(x, y, 38)
        if (x > x0 + 2 && x < x0 + w - 3 && y > py0 && y < py0 + 4) {
          liquid[idx(x, y)] = 1; seaFloor[idx(x, y)] = 1.55 + ((x + y) & 1) * 0.12
        }
      }
      add('poolladder', x0 + 3, py0 + 1, 1, 1, false, { deg: 90 })
      add('l9poolfilter', x0 + w - 3, py0, 1, 1, true, { style })
      add('l9patiochair', x0 + 1, py0 + 1, 1, 2, false, { deg: 90, color: '#d5d0c2' })
    }
  }

  const styleFor = (lot: number) => {
    const roll = h32(seed, 0x9c24, cx, cy, lot)
    // 约三分之一住宅选用四种 A 字/交叉山墙外形，且相邻地块继续由坐标哈希打散。
    if (roll % 100 < 34) return 16 + (h32(seed, 0x9c25, cx, cy, lot) % 4)
    const base = ((cx * 5 + cy * 7 + lot * 5) % 16 + 16) % 16
    return (base + (roll % 4)) % 16
  }

  if (cx === 0 && cy === 0) {
    // L5 门口住宅（北侧）与 L7 入水泳池住宅（南侧）为固定出生锚点。
    placeHouse(2, 3, 15, 11, 12, 's', false)
    placeHouse(17, 17, 14, 8, 15, 'n', true)
    const cave = exitDef(def, 'l9caveback')
    if (cave) exits.push({ def: cave, x: WX + 1, y: WY + 16, discovered: false })
  } else if (variant !== 'fieldedge' && variant !== 'playground' && variant !== 'powerline' && variant !== 'forest') {
    let placed = 0
    if (variant === 'poolblock') {
      if (roadClear(6, 6, 20, 10)) { placeHouse(6, 6, 20, 10, styleFor(0), 'n', true); placed++ }
    } else if (variant === 'backyards') {
      // 单侧洋楼给后方留下完整草坪，不再把“后院街区”压成两排背靠背火柴盒。
      const wide = 19, inset = Math.floor((CS - wide) / 2)
      if (roadClear(inset, 6, wide, 10)) { placeHouse(inset, 6, wide, 10, Math.max(12, styleFor(0)), 'n', false); placed++ }
    } else {
      const axis = h32(seed, 0x9c21, cx, cy) & 1
      const wide = 18 + (h32(seed, 0x9c22, cx, cy) % 2)
      const inset = Math.floor((CS - wide) / 2)
      const lots: { x: number; y: number; w: number; h: number; front: HouseFront }[] = axis === 0
        ? [{ x: inset, y: 6, w: wide, h: 9, front: 'n' }, { x: inset, y: 18, w: wide, h: 9, front: 's' }]
        : [{ x: 6, y: inset, w: 9, h: wide, front: 'w' }, { x: 18, y: inset, w: 9, h: wide, front: 'e' }]
      // cityapproach 的第九大道可能切入其中一个地块；另一个仍会沿路正常生成，避免两侧突然大片空白。
      for (let k = 0; k < lots.length; k++) {
        const l = lots[k]
        if (!roadClear(l.x, l.y, l.w, l.h)) continue
        placeHouse(l.x, l.y, l.w, l.h, styleFor(k), l.front, false)
        placed++
      }
    }
    if (variant === 'fused' && placed > 0) add('clipfuse', 9, 9, 13, 12, false, { style: h32(seed, cx, cy) % 4 })
  }

  if (variant === 'fieldedge') {
    // 道路在田野前收窄为土径；超区域宿主仅生成一个实际出口。
    for (let y = 0; y < CS; y++) for (let x = 22; x < CS; x++) {
      setSurface(x, y, x < 25 && Math.abs(y - 16) < 3 ? 34 : 36)
    }
    for (let x = 24; x < CS; x++) for (let y = 15; y <= 17; y++) tint[idx(x, y)] = 43
    const e = exitDef(def, 'grasspath')
    if (e) exits.push({ def: e, x: WX + 29, y: WY + 16, discovered: false })
    add('l9fieldgate', 25, 14, 1, 5, false, { deg: 90 })
  }

  if (variant === 'playground') {
    add('playpipe', 13.1, 13.3, 2.8, 1.4, true, { glow: 1 })
    add('l9swing', 20.75, 10.9, 3.5, 1.2, true, { rust: 1 })
    add('l9slide', 7.8, 20.75, 1.4, 3.5, true, { faded: 1 })
  } else if (variant === 'powerline') {
    add('l9powerpole', 7, 7, 2, 2, true, { wires: 1 })
    add('l9powerpole', 23, 23, 2, 2, true, { wires: 1 })
  }

  // 路牌逐段引向 L11；只有最后一块是出口，其余为可交互方向标。
  const arrowCount = l9ArrowCount(seed)
  for (let n = 0; n < arrowCount; n++) {
    const p = l9ArrowPoint(seed, n), q = local(p.x, p.y)
    if (!inside(q.x, q.y)) continue
    if (n === arrowCount - 1) {
      const e = exitDef(def, 'arrowsign')
      if (e) exits.push({ def: e, x: p.x, y: p.y, discovered: false })
    } else {
      const next = l9ArrowPoint(seed, n + 1)
      const dx = next.x - p.x, dy = next.y - p.y
      // 路牌图案中的箭头沿模型局部 +X 指向。旧公式把局部 +Z（牌面法线）
      // 对准下一块路牌，结果视觉箭头始终与实际提示方向相差约 90°。
      const deg = Math.atan2(-dy, dx) * 180 / Math.PI
      add('l9arrowsign', Math.floor(q.x), Math.floor(q.y), 1, 1, false, { seq: n + 1, total: arrowCount, nextX: next.x, nextY: next.y, final: 0, deg })
    }
  }

  // 路灯沿道路边缘的内侧人行道等距排列，而不是在整块区块里随机撒点。世界坐标取模
  // 让相邻区块共用同一根 8/9m 节拍，跨区块观察时仍是连续、整齐的郊区灯列。
  if (variant !== 'blackout') {
    const city = variant === 'cityapproach'
    const spacing = city ? 7 : 9
    const roadAt = (x: number, y: number) => {
      if (!inside(x, y)) return false
      const t = tint[idx(x, y)]
      return t === 34 || t === 39
    }
    const candidates: { x: number; y: number; deg: number; roadDx: number; roadDy: number; rank: number }[] = []
    for (let y = 2; y <= 29; y++) for (let x = 2; x <= 29; x++) {
      if (tint[idx(x, y)] !== 35) continue
      const verticalAligned = ((WY + y + 3) % spacing + spacing) % spacing === 0
      const horizontalAligned = ((WX + x + 3) % spacing + spacing) % spacing === 0
      // 灯臂在模型中沿局部 +X。只从确实紧邻的道路方向中选取一个，并将
      // +X 旋向道路；转角处即使有两个候选方向，也绝不会朝向草坪或房屋。
      const facings = [
        roadAt(x + 1, y) && verticalAligned ? { dx: 1, dy: 0, deg: 0 } : null,
        roadAt(x - 1, y) && verticalAligned ? { dx: -1, dy: 0, deg: 180 } : null,
        roadAt(x, y - 1) && horizontalAligned ? { dx: 0, dy: -1, deg: 90 } : null,
        roadAt(x, y + 1) && horizontalAligned ? { dx: 0, dy: 1, deg: 270 } : null,
      ].filter((v): v is { dx: number; dy: number; deg: number } => v !== null)
      if (!facings.length) continue
      if (structures.some(s => Math.hypot(s.x + s.w / 2 - (WX + x + .5), s.y + s.h / 2 - (WY + y + .5)) < 2.35)) continue
      const facing = facings[h32(seed, 0x9d30, WX + x, WY + y) % facings.length]
      candidates.push({ x, y, deg: facing.deg, roadDx: facing.dx, roadDy: facing.dy, rank: h32(seed, 0x9d31, WX + x, WY + y) })
    }
    // 哈希只决定同一节拍内先取哪几盏；最小间距保证不会在转角挤成一团。
    candidates.sort((a, b) => a.rank - b.rank)
    const chosen: { x: number; y: number; deg: number; roadDx: number; roadDy: number }[] = []
    const lampLimit = city ? 6 : variant === 'culdesac' ? 5 : 4
    for (const p of candidates) {
      if (chosen.length >= lampLimit) break
      if (chosen.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 5.5)) continue
      chosen.push(p)
    }
    for (let a = 0; a < chosen.length; a++) {
      const { x, y, deg, roadDx, roadDy } = chosen[a]
      const powerRoll = h01(seed, 0x9d32, WX + x, WY + y)
      // 普通街区仍以断电灯为多数，但亮灯率约由 33% 提至 45%；城市化路段约 58%。
      const mode = powerRoll < (city ? 0.24 : 0.16) ? 2
        : powerRoll < (city ? 0.58 : 0.45) ? 1 : 0
      add('streetlamp', x, y, 1, 1, true, { mode, style: city ? 1 : 0, deg })
      if (mode) lights.push({
        // 光源点与可见灯头保持一致，而不是仍停留在立杆中心。
        x: WX + x + 0.5 + roadDx * .46, y: WY + y + 0.5 + roadDy * .46,
        r: mode === 2 ? 8 : 6, color: '#e4b36b',
        flickerSeed: mode === 1 ? h32(seed, 0x9d33, WX + x, WY + y) : 0, gen: 1, noFix: 1,
        intensityMul: mode === 2 ? 0.72 : 0.45, occluded: 1, outdoorOnly: 1,
      })
    }
  }

  // 人行道街景：邻里守望警告牌与多方向木路标只占用极细立柱，不阻断玩家通行。
  // 候选点严格来自道路旁的人行道，并避开已有路灯、信箱和出口路牌。
  const sidewalkCandidates = (): { x: number; y: number; deg: number; rank: number }[] => {
    const out: { x: number; y: number; deg: number; rank: number }[] = []
    const roadAt = (x: number, y: number) => inside(x, y) && (tint[idx(x, y)] === 34 || tint[idx(x, y)] === 39)
    for (let y = 2; y <= 29; y++) for (let x = 2; x <= 29; x++) {
      if (tint[idx(x, y)] !== 35) continue
      let deg: number | null = null
      if (roadAt(x, y - 1)) deg = 180
      else if (roadAt(x + 1, y)) deg = 90
      else if (roadAt(x, y + 1)) deg = 0
      else if (roadAt(x - 1, y)) deg = 270
      if (deg === null) continue
      const wx = WX + x + .5, wy = WY + y + .5
      if (structures.some(s => Math.hypot(s.x + s.w / 2 - wx, s.y + s.h / 2 - wy) < 2.2)) continue
      out.push({ x, y, deg, rank: h32(seed, 0x9d41, WX + x, WY + y) })
    }
    return out.sort((a, b) => a.rank - b.rank)
  }
  const signSpots = sidewalkCandidates()
  const takeSignSpot = () => signSpots.shift()
  if (variant === 'cityapproach' || rng.chance(.42)) {
    const p = takeSignSpot()
    if (p) add('l9watchsign', p.x + .28, p.y + .28, .44, .44, false, { deg: p.deg, style: h32(seed, 0x9d42, cx, cy) % 3 })
  }
  if (variant === 'cityapproach' || rng.chance(.24)) {
    const p = takeSignSpot()
    if (p) add('l9directionsign', p.x + .28, p.y + .28, .44, .44, false, { deg: p.deg, style: h32(seed, 0x9d43, cx, cy) % 4 })
  }

  const freeAt = (x: number, y: number, outdoorsOnly = false) => {
    if (!inside(x, y) || tiles[idx(x, y)] !== 1) return false
    if (outdoorsOnly && outdoor[idx(x, y)] !== 1) return false
    const wx = WX + x + 0.5, wy = WY + y + 0.5
    return !structures.some(s => s.solid && wx >= s.x && wx < s.x + s.w && wy >= s.y && wy < s.y + s.h)
  }
  const pickFree = (outdoorsOnly = false): { x: number; y: number } | null => {
    for (let a = 0; a < 48; a++) {
      const x = rng.int(2, 29), y = rng.int(2, 29)
      if (freeAt(x, y, outdoorsOnly)) return { x, y }
    }
    return null
  }
  const pickGrass = (houseClearance = .5, accept?: (x: number, y: number) => boolean): { x: number; y: number } | null => {
    for (let a = 0; a < 72; a++) {
      const x = rng.int(5, 26), y = rng.int(5, 26)
      if (accept && !accept(x, y)) continue
      const wx = WX + x + .5, wy = WY + y + .5
      const nearHouse = structures.some(s => s.kind === 'house'
        && wx >= s.x - houseClearance && wx <= s.x + s.w + houseClearance
        && wy >= s.y - houseClearance && wy <= s.y + s.h + houseClearance)
      if (!nearHouse && tint[idx(x, y)] === 36 && freeAt(x, y, true)) return { x, y }
    }
    return null
  }

  // 死胡同、田野边缘和城市化公路由三侧林缘半包围；L8 洞口出生区也固定落在
  // 西侧密林的小空地中。树只落在草坪，公路、人行道、房屋小径和出口净空不会被占用。
  const halfForest = variant === 'culdesac' || variant === 'fieldedge' || variant === 'cityapproach'
  const openSide = h32(seed, 0x9e19, cx, cy) & 3
  const halfForestAt = (x: number, y: number) => {
    const north = y < 12 && openSide !== 0
    const east = x > 19 && openSide !== 1
    const south = y > 19 && openSide !== 2
    const west = x < 12 && openSide !== 3
    return north || east || south || west
  }
  const caveForestAt = (x: number, y: number) => x < 15
    && Math.hypot(x + .5 - L9_CAVE_SPAWN.x, y + .5 - L9_CAVE_SPAWN.y) > 3.2
    && Math.hypot(x + .5 - L9_L5_DOOR_SPAWN.x, y + .5 - L9_L5_DOOR_SPAWN.y) > 2.6
  const forestAt = cx === 0 && cy === 0 ? caveForestAt
    : variant === 'forest' ? undefined
      : halfForest ? halfForestAt : undefined
  // 树木碰撞只覆盖细树干，树冠与灌木不挡路；森林密度受硬上限约束并进入静态实例批次。
  const treeCount = cx === 0 && cy === 0 ? 12
    : variant === 'forest' ? 17 + (h32(seed, 0x9e18, cx, cy) % 5)
      : halfForest ? 11 + (h32(seed, 0x9e17, cx, cy) % 4)
        : variant === 'backyards' ? 4 : variant === 'playground' ? 3 : 2 + (rng.chance(.32) ? 1 : 0)
  for (let n = 0; n < treeCount; n++) {
    const p = pickGrass(cx === 0 && cy === 0 ? .8 : variant === 'forest' ? .2 : 1.1, forestAt)
    if (p) add('l9tree', p.x + .32, p.y + .32, .36, .36, true, { style: h32(seed, 0x9e21, cx, cy, n) % 5, scale: 85 + (h32(seed, 0x9e22, cx, cy, n) % 41) })
  }
  const shrubCount = cx === 0 && cy === 0 ? 11
    : variant === 'forest' ? 14 + (h32(seed, 0x9e23, cx, cy) % 5)
      : halfForest ? 10 + (h32(seed, 0x9e23, cx, cy) % 4)
        : variant === 'backyards' || variant === 'poolblock' ? 7 + (h32(seed, 0x9e23, cx, cy) & 1) : 4 + (h32(seed, 0x9e23, cx, cy) % 3)
  for (let n = 0; n < shrubCount; n++) {
    const p = pickGrass(0, forestAt)
    if (p) add('l9shrub', p.x, p.y, 1, 1, false, { style: h32(seed, 0x9e24, cx, cy, n) % 4, scale: 72 + (h32(seed, 0x9e25, cx, cy, n) % 45) })
  }

  // 新增街景装饰保持轻量；所有大型住宅细节都固定在结构标记内部合批。
  if (rng.chance(0.42)) {
    const p = pickFree(true)
    if (p) add('l9leafpile', p.x, p.y, 2, 1, false, { wet: variant === 'rainstreet' ? 1 : 0 })
  }
  if (rng.chance(0.24)) {
    const p = pickFree(true)
    if (p) add('l9trashbag', p.x, p.y, 1, 1, false, { count: rng.int(1, 3) })
  }
  if (variant === 'backyards') {
    const p = pickFree(true)
    if (p) add('l9barbecue', p.x, p.y, 1, 1, true, { rust: 1 })
  }

  // 可搜刮物仍保持稀疏；实体密度提高，但出生街区外围仍保留安全缓冲。
  if (Math.abs(cx) + Math.abs(cy) > 2 && rng.chance(0.16)) {
    const p = pickFree(false)
    const pool = ['battery', 'almond', 'bandage', 'housekey']
    if (p) items.push({ id: GEN_ITEM_BASE + (h32(seed, 0x9e10, cx, cy, itemN++) & 0xfffff), type: pool[rng.int(0, pool.length - 1)], x: WX + p.x + 0.5, y: WY + p.y + 0.5 })
  }
  if (Math.abs(cx) + Math.abs(cy) > 2 && rng.chance(variant === 'blackout' ? 0.36 : 0.3)) {
    const count = 1 + (rng.chance(0.2) ? 1 : 0)
    for (let n = 0; n < count; n++) {
      const type = rng.weighted(def.entities.map(e => ({ v: e.type, w: e.w })))
      const streetHunter = type === 'watcher' || type === 'strider' || type === 'hound'
      for (let attempt = 0; attempt < 10; attempt++) {
        const p = pickFree(streetHunter)
        if (!p) break
        const ex = WX + p.x + 0.5, ey = WY + p.y + 0.5
        if (entities.some(e => Math.hypot(e.x - ex, e.y - ey) < 4)) continue
        entities.push({ type, x: ex, y: ey, calm: type === 'deathmoth' ? true : undefined })
        break
      }
    }
  }

  return { variant, tiles, wet, elev, step, tint, crawl, outdoor, ceiling, liquid, seaFloor, structures, items, lights, exits, entities }
}

registerInfiniteLevel(9, {
  genRaw: genL9ChunkRaw,
  variantOf: l9VariantOf,
  rareVariants: L9_RARE_VARIANTS,
  variantNames: L9_VARIANT_NAMES,
  variantLore: L9_VARIANT_LORE,
  spawnWorld: L9_CAVE_SPAWN,
  spawnFloor: 0,
  regionExitPos: (seed, rx, ry) => {
    const h = l9RegionHost(seed, rx, ry)
    return { x: h.cx * CS + 29, y: h.cy * CS + 16 }
  },
})
