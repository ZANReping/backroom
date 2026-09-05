// ================= Level 10「丰裕」无限农田 =================
// 本文件只使用世界坐标纯函数：地形、道路、树篱、湖岸和结构在区块边缘不会换相。
import type { ExitDef, ExitInstance, GroundItem, LevelDef, LightSource, Structure } from '../core/types'
import { CS, GEN_ITEM_BASE, h32 } from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'

export type L10Variant =
  | 'wheatfield' | 'barleyfield' | 'mixedfield' | 'lowland'
  | 'farmstead' | 'worksite' | 'deeplake'

export const L10_VARIANT_NAMES: Record<L10Variant, string> = {
  wheatfield: '小麦田', barleyfield: '大麦田', mixedfield: '混合农田',
  lowland: '低洼湖区', farmstead: '农舍群', worksite: 'M.E.G. 临时作业点',
  deeplake: '深湖',
} as Record<L10Variant, string>

export const L10_VARIANT_LORE: Record<string, string[]> = {
  wheatfield: ['成熟的小麦一直延伸到阴云下的地平线。田间没有可靠的食物来源。'],
  barleyfield: ['更低、更密的大麦随阵风成片伏倒，又缓慢挺直。'],
  mixedfield: ['小麦、大麦、草地和休耕土沿自然弯曲的树篱交错分布。'],
  lowland: ['地势缓慢沉入浅湖和湿地，湖岸留下泥泞的水线。'],
  farmstead: ['棚屋、谷仓和马厩零散地聚在土路旁；多数房间空空如也。'],
  worksite: ['M.E.G. 的折叠桌、测量标记和废弃记录仍留在田边，但这里并非永久据点。'],
  deeplake: ['罕见的深湖没有可见湖底。只有湖心最深处能通往 Level 7。'],
}

export const L10_RARE_VARIANTS: readonly string[] = Object.keys(L10_VARIANT_NAMES)
export const L10_L9_SPAWN = { x: 16.5, y: 20.5 }
export const L10_L11_SPAWN = { x: 16.5, y: 12.5 }

const h01 = (...n: number[]) => h32(...n) / 4294967296
const idx = (x: number, y: number) => y * CS + x
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const mod = (v: number, n: number) => ((v % n) + n) % n
const smooth = (t: number) => t * t * (3 - 2 * t)

function valueNoise(seed: number, salt: number, x: number, y: number, scale: number): number {
  const gx = Math.floor(x / scale), gy = Math.floor(y / scale)
  const fx = smooth(mod(x, scale) / scale), fy = smooth(mod(y, scale) / scale)
  const a = h01(seed, salt, gx, gy), b = h01(seed, salt, gx + 1, gy)
  const c = h01(seed, salt, gx, gy + 1), d = h01(seed, salt, gx + 1, gy + 1)
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy
}

/** 混合农田使用连续世界噪声划分作物/草地，而不是逐 4m 块随机打洞。 */
function mixedCropCoverage(seed: number, wx: number, wy: number): number {
  return valueNoise(seed, 0x1020, wx, wy, 26) * .72 + valueNoise(seed, 0x1021, wx, wy, 11) * .28
}

interface L10BiomeMix {
  crop: number
  grass: number
  bare: number
  wheat: number
  barley: number
  mixed: number
}

const L10_BIOME_SURFACE: Record<L10Variant, L10BiomeMix> = {
  wheatfield: { crop: 1, grass: 0, bare: 0, wheat: 1, barley: 0, mixed: 0 },
  barleyfield: { crop: 1, grass: 0, bare: 0, wheat: 0, barley: 1, mixed: 0 },
  mixedfield: { crop: .74, grass: .22, bare: .04, wheat: .41, barley: .33, mixed: 1 },
  lowland: { crop: 0, grass: .56, bare: .44, wheat: 0, barley: 0, mixed: 0 },
  farmstead: { crop: 0, grass: .34, bare: .66, wheat: 0, barley: 0, mixed: 0 },
  worksite: { crop: 0, grass: .28, bare: .72, wheat: 0, barley: 0, mixed: 0 },
  deeplake: { crop: 0, grass: .46, bare: .54, wheat: 0, barley: 0, mixed: 0 },
}

/**
 * 在每条 32m chunk 边界两侧各建立 10m 连续混合带。边界正中两侧都得到 50/50，
 * 远离边界则平滑回到本生态；角落以双轴权重同时采样四个相邻 chunk，不产生直角硬缝。
 */
export function l10BiomeMixAt(seed: number, wx: number, wy: number, forced?: string): L10BiomeMix {
  if (forced && forced in L10_BIOME_SURFACE) return L10_BIOME_SURFACE[forced as L10Variant]
  const cx = Math.floor(wx / CS), cy = Math.floor(wy / CS)
  const fx = wx - cx * CS, fy = wy - cy * CS
  const band = 10
  const axis = (f: number): { d: number; w: number } => {
    if (f < band) return { d: -1, w: .5 * (1 - smooth(f / band)) }
    if (f > CS - band) return { d: 1, w: .5 * (1 - smooth((CS - f) / band)) }
    return { d: 0, w: 0 }
  }
  const bx = axis(fx), by = axis(fy)
  const xs = bx.w > 0 ? [{ d: 0, w: 1 - bx.w }, { d: bx.d, w: bx.w }] : [{ d: 0, w: 1 }]
  const ys = by.w > 0 ? [{ d: 0, w: 1 - by.w }, { d: by.d, w: by.w }] : [{ d: 0, w: 1 }]
  const out: L10BiomeMix = { crop: 0, grass: 0, bare: 0, wheat: 0, barley: 0, mixed: 0 }
  for (const sx of xs) for (const sy of ys) {
    const weight = sx.w * sy.w
    const p = L10_BIOME_SURFACE[l10VariantOf(seed, cx + sx.d, cy + sy.d)]
    out.crop += p.crop * weight; out.grass += p.grass * weight; out.bare += p.bare * weight
    out.wheat += p.wheat * weight; out.barley += p.barley * weight; out.mixed += p.mixed * weight
  }
  return out
}

// 2×2 区块为同一农业区域；固定阈值严格对应 44/20/18/10/5/2/1。
export function l10VariantOf(seed: number, cx: number, cy: number): L10Variant {
  if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) return 'mixedfield'
  const mx = Math.floor(cx / 2), my = Math.floor(cy / 2)
  const r = h01(seed, 0x10a0, mx, my)
  if (r < .44) return 'wheatfield'
  if (r < .64) return 'barleyfield'
  if (r < .82) return 'mixedfield'
  if (r < .92) return 'lowland'
  if (r < .97) return 'farmstead'
  if (r < .99) return 'worksite'
  return 'deeplake'
}

// 东西向主路跨世界连续弯曲；支路每 160m 左右纵向汇入主路。
export function l10MainRoadY(seed: number, wx: number, band = 0): number {
  const base = band * 256 + 16
  return base + Math.sin(wx * .0105 + h01(seed, 0x10b0, band) * 6.283) * 7
    + Math.sin(wx * .0032 + h01(seed, 0x10b1, band) * 6.283) * 4
}

function roadInfo(seed: number, wx: number, wy: number) {
  const band = Math.round((wy - 16) / 256)
  const mainY = l10MainRoadY(seed, wx, band)
  let d = Math.abs(wy - mainY)
  let branch = false
  const bx0 = Math.round((wx - 72) / 160)
  for (let k = -1; k <= 1; k++) {
    const bx = 72 + (bx0 + k) * 160 + (h01(seed, 0x10b2, bx0 + k) - .5) * 30
    const bd = Math.abs(wx - bx)
    if (bd < d && Math.abs(wy - mainY) < 118) { d = bd; branch = true }
  }
  return { d, branch, mainY }
}

function lakeInfo(seed: number, cx: number, cy: number, variant: L10Variant, wx: number, wy: number) {
  if (variant !== 'lowland' && variant !== 'deeplake') return null
  const mx = Math.floor(cx / 2), my = Math.floor(cy / 2)
  const centerX = mx * CS * 2 + 32 + (h01(seed, 0x10c0, mx, my) - .5) * 13
  const centerY = my * CS * 2 + 32 + (h01(seed, 0x10c1, mx, my) - .5) * 13
  const radius = variant === 'deeplake' ? 17 + h01(seed, 0x10c2, mx, my) * 4 : 10 + h01(seed, 0x10c3, mx, my) * 5
  const ang = Math.atan2(wy - centerY, wx - centerX)
  const warpedR = radius * (1 + Math.sin(ang * 3 + h01(seed, 0x10c4, mx, my) * 6) * .10
    + Math.sin(ang * 5 + 1.7) * .055)
  const d = Math.hypot((wx - centerX) * .92, (wy - centerY) * 1.06)
  return { centerX, centerY, radius: warpedR, d, deep: variant === 'deeplake' }
}

const exitOf = (def: LevelDef, kind: string): ExitDef | undefined => def.exits.find(e => e.kind === kind)
const sidOf = (seed: number, cx: number, cy: number, n: number) => (h32(seed, 0x10d0, cx, cy, n) & 0x7fffffff) || 1

// 每个 16×16 chunk 超区域在主路上有一个确定性的 Level 11 终点。
function longRoadPoint(seed: number, rx: number, ry: number) {
  // 从原点出生步道到首个终点约 484～495m；后续每个 16×16 chunk 超区域仍各有一个终点。
  const x = rx * 512 + 511 - (h32(seed, 0x10e0, rx, ry) % 12)
  const band = ry * 2
  return { x: x + .5, y: l10MainRoadY(seed, x, band) + .5 }
}

/** 轻量测试/HUD 共用的 16×16 chunk 超区域出口坐标，不生成区块。 */
export const l10RegionExitPoint = (seed: number, rx: number, ry: number) => longRoadPoint(seed, rx, ry)

export function genL10ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forced?: string): GenChunk {
  const variant = (forced as L10Variant | undefined) ?? l10VariantOf(seed, cx, cy)
  const WX = cx * CS, WY = cy * CS
  const tiles = new Uint8Array(CS * CS).fill(1)
  const wet = new Uint8Array(CS * CS)
  const elev = new Uint8Array(CS * CS).fill(3)
  const step = new Uint8Array(CS * CS)
  const tint = new Uint8Array(CS * CS).fill(44) // 干土
  const crawl = new Uint8Array(CS * CS)
  const outdoor = new Uint8Array(CS * CS).fill(1)
  const ceiling = new Uint8Array(CS * CS)
  const liquid = new Uint8Array(CS * CS)
  const seaFloor = new Float32Array(CS * CS).fill(1.7)
  const terrain = new Float32Array(CS * CS)
  const structures: Structure[] = []
  const items: GroundItem[] = []
  const lights: LightSource[] = []
  const exits: ExitInstance[] = []
  const entities: GenChunk['entities'] = []
  let stateN = 0, itemN = 0

  const add = (kind: Structure['kind'], x: number, y: number, w = 1, h = 1, solid = false, data?: Structure['data']) => {
    if (x + w <= 0 || y + h <= 0 || x >= CS || y >= CS) return
    const dyn = data && (data.loot || data.interactive || kind === 'l10digsite') ? { ...data, sid: sidOf(seed, cx, cy, stateN++) } : data
    structures.push({ kind, x: WX + x, y: WY + y, w, h, solid, data: dyn })
  }
  const occupied = (wx: number, wy: number, pad = 0) => structures.some(s =>
    wx >= s.x - pad && wx <= s.x + s.w + pad && wy >= s.y - pad && wy <= s.y + s.h + pad)
  const carveFarmBuilding = (x0: number, y0: number, w: number, h: number, frontNorth: boolean) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= CS || y >= CS) continue
      const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1
      const i = idx(x, y)
      tiles[i] = edge ? 2 : 1
      outdoor[i] = 0
      tint[i] = 49 // 室内旧木板地面；墙体仍由层级墙面与外侧木板模型共同表现
      liquid[i] = 0; wet[i] = 0
    }
    const doorX = x0 + Math.floor(w / 2)
    const doorY = frontNorth ? y0 : y0 + h - 1
    if (doorX >= 0 && doorY >= 0 && doorX < CS && doorY < CS) tiles[idx(doorX, doorY)] = 1
  }

  // 柔和起伏、道路剖面与湖盆全部逐世界采样，因此跨 chunk 无缝。
  // 湖岸在水线处精确回到 y=0，湖底则把同一 terrain 高度场连续压低；渲染、碰撞
  // 与水深都读取这条曲线，避免“地面仍是平的、只把水面抬高”的假湖泊。
  for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
    const wx = WX + x + .5, wy = WY + y + .5, i = idx(x, y)
    const broad = valueNoise(seed, 0x1010, wx, wy, 80) - .5
    const fine = valueNoise(seed, 0x1011, wx, wy, 23) - .5
    terrain[i] = broad * .74 + fine * .20
    // 生态边缘同时混合麦茬、草地与干土。低频世界噪声负责形成连片的不规则舌状边缘，
    // 小比例哈希抖动只打散最后一圈瓦片；所有采样均使用世界坐标，跨 chunk 不换相。
    const mix = l10BiomeMixAt(seed, wx, wy, forced)
    const mixedGrowth = 1 + (mixedCropCoverage(seed, wx, wy) - .5) * .34 * mix.mixed
    const cropChance = clamp(mix.crop * mixedGrowth, 0, 1)
    const grassChance = clamp(mix.grass + Math.max(0, mix.crop - cropChance) * .65, 0, 1 - cropChance)
    const surfacePick = valueNoise(seed, 0x1023, wx, wy, 4.5) * .78
      + h01(seed, 0x1024, Math.floor(wx), Math.floor(wy)) * .22
    tint[i] = surfacePick < cropChance ? 50 : surfacePick < cropChance + grassChance ? 45 : 44
    const road = roadInfo(seed, wx, wy)
    if (road.d < 3.25) {
      const cross = road.d
      tint[i] = cross > .72 && cross < 1.48 ? 46 : cross < .52 ? 45 : 47
      wet[i] = cross > .72 && cross < 1.48 ? 1 : 0
      terrain[i] -= Math.max(0, 1 - road.d / 3.25) * .10
    }
    const lake = lakeInfo(seed, cx, cy, variant, wx, wy)
    if (lake) {
      const shore = lake.radius - lake.d
      if (shore > -3.2) {
        tint[i] = 48
        wet[i] = 1
        if (shore <= 0) {
          const bankT = smooth(clamp((shore + 3.2) / 3.2, 0, 1))
          terrain[i] *= 1 - bankT // 岸坡由原地形平滑收束至统一水位 y=0
        }
      }
      if (shore > 0) {
        liquid[i] = 1
        const depthT = smooth(clamp(shore / Math.max(3, lake.radius * .82), 0, 1))
        seaFloor[i] = .06 + depthT * (lake.deep ? 6.25 : 2.05)
        terrain[i] = -seaFloor[i]
      }
    }
  }

  // 24m 世界网格树篱：用 4m 长段，保留确定性缺口并给道路/湖岸让行。
  for (let gy = Math.floor(WY / 24) * 24; gy <= WY + CS; gy += 24) {
    for (let wx = Math.floor(WX / 4) * 4; wx < WX + CS; wx += 4) {
      if (wx < WX || Math.abs(roadInfo(seed, wx + 2, gy).d) < 5 || mod(Math.floor(wx / 4) + h32(seed, gy), 17) < 3) continue
      const l = lakeInfo(seed, cx, cy, variant, wx + 2, gy)
      if (l && l.d < l.radius + 3.5) continue
      add('hedgerow', wx - WX, gy - WY - .38, 4, .76, true, { axis: 'x', wind: 1 })
    }
  }
  for (let gx = Math.floor(WX / 24) * 24; gx <= WX + CS; gx += 24) {
    for (let wy = Math.floor(WY / 4) * 4; wy < WY + CS; wy += 4) {
      if (wy < WY || roadInfo(seed, gx, wy + 2).d < 5 || mod(Math.floor(wy / 4) + h32(seed, gx), 19) < 3) continue
      const l = lakeInfo(seed, cx, cy, variant, gx, wy + 2)
      if (l && l.d < l.radius + 3.5) continue
      add('hedgerow', gx - WX - .38, wy - WY, .76, 4, true, { axis: 'y', wind: 1 })
    }
  }

  // 压缩干草块是正式实心结构，不再由渲染器随机撒无碰撞黄色方块。锚点对齐 4m
  // 作物块中心，使后续麦田生成会为它准确留出一小块落脚地。
  if (variant === 'wheatfield' || variant === 'barleyfield' || variant === 'mixedfield') {
    const roll = h01(seed, 0x1038, cx, cy)
    const wanted = roll < .17 ? 2 : roll < .64 ? 1 : 0
    for (let n = 0; n < wanted; n++) {
      for (let attempt = 0; attempt < 18; attempt++) {
        const salt = n * 31 + attempt
        const x = 2 + (h32(seed, 0x1039, cx, cy, salt) % 8) * 4 + (h01(seed, 0x103a, cx, cy, salt) - .5) * .5
        const y = 2 + (h32(seed, 0x103b, cx, cy, salt) % 8) * 4 + (h01(seed, 0x103c, cx, cy, salt) - .5) * .5
        const wx = WX + x, wy = WY + y
        const tx = clamp(Math.floor(x), 0, CS - 1), ty = clamp(Math.floor(y), 0, CS - 1)
        if (roadInfo(seed, wx, wy).d < 5 || liquid[idx(tx, ty)] || tint[idx(tx, ty)] === 48 || occupied(wx, wy, 1.1)) continue
        const bw = .78 + h01(seed, 0x103d, cx, cy, salt) * .42
        const bd = .72 + h01(seed, 0x103e, cx, cy, salt) * .38
        const bh = .54 + h01(seed, 0x103f, cx, cy, salt) * .24
        add('l10haybale', x - bw / 2, y - bd / 2, bw, bd, true, {
          height: bh,
          deg: Math.floor(h01(seed, 0x1043, cx, cy, salt) * 360),
        })
        break
      }
    }
  }

  // 麦田以 4×4m 覆盖块进入渲染器，再归并成 16×16m LOD 单元。过渡带不再在
  // 生态边界突然截断：麦簇密度随同一生态权重逐渐降低，并延伸到相邻地形约 10m。
  for (let y = 0; y < CS; y += 4) for (let x = 0; x < CS; x += 4) {
    const wx = WX + x + 2, wy = WY + y + 2
    if (roadInfo(seed, wx, wy).d < 5 || occupied(wx, wy, .5)) continue
    let blockedByWater = false
    for (let py = y; py < Math.min(CS, y + 4) && !blockedByWater; py++) for (let px = x; px < Math.min(CS, x + 4); px++) {
      const pi = idx(px, py)
      if (liquid[pi] === 1 || tint[pi] === 48) { blockedByWater = true; break }
    }
    if (blockedByWater) continue
    const mix = l10BiomeMixAt(seed, wx, wy, forced)
    const growth = 1 + (mixedCropCoverage(seed, wx, wy) - .5) * .34 * mix.mixed
    const cropAmount = clamp(mix.crop * growth, 0, 1)
    if (cropAmount < .075) continue
    const speciesTotal = Math.max(.0001, mix.wheat + mix.barley)
    const barleyChance = mix.barley / speciesTotal
    const barley = valueNoise(seed, 0x1022, wx, wy, 38) < barleyChance
    add('wheatpatch', x, y, 4, 4, false, {
      barley: barley ? 1 : 0,
      density: .94 * Math.max(.12, cropAmount),
      transition: cropAmount < .82 ? 1 : 0,
      wind: 1,
    })
  }

  // 树列按 16m 世界锚点稀疏生成，碰撞只落在树干。
  for (let wy = Math.ceil(WY / 16) * 16; wy < WY + CS; wy += 16) for (let wx = Math.ceil(WX / 16) * 16; wx < WX + CS; wx += 16) {
    if (roadInfo(seed, wx, wy).d < 6 || h01(seed, 0x1030, wx / 16, wy / 16) > .16) continue
    const l = lakeInfo(seed, cx, cy, variant, wx, wy)
    if ((l && l.d < l.radius + 2) || occupied(wx, wy, 1)) continue
    add('l10tree', wx - WX - .5, wy - WY - .5, 1, 1, true, { v: h32(seed, 0x1031, wx, wy) % 4, wind: 1 })
  }

  // 区域主体只在 2×2 宏区块的确定宿主中生成一次。
  const mx = Math.floor(cx / 2), my = Math.floor(cy / 2)
  const hostCx = mx * 2 + (h32(seed, 0x1040, mx, my) & 1)
  const hostCy = my * 2 + (h32(seed, 0x1041, mx, my) & 1)
  if (cx === hostCx && cy === hostCy && variant === 'farmstead') {
    const kind = (['l10shed', 'l10stable', 'barn', 'l10outhouse'] as const)[h32(seed, 0x1042, mx, my) % 4]
    const dims = kind === 'l10stable' || kind === 'barn' ? [11, 8] : kind === 'l10shed' ? [7, 6] : [3, 3]
    const bx = 10, roadNorth = roadInfo(seed, WX + 15, WY + 16).mainY < WY + 16
    const by = roadNorth ? 17 : 7
    carveFarmBuilding(bx, by, dims[0], dims[1], roadNorth)
    add(kind, bx, by, dims[0], dims[1], false, { deg: roadNorth ? 180 : 0, material: 'weathered_wood' })
    add('toolbox', bx + 2, by + 2, 1, 1, true, { loot: 1, lootItems: ['timber', 'nails'], l10Interior: 1 })
    if (kind !== 'l10outhouse') add('crate', bx + dims[0] - 3, by + 2, 1.4, 1.4, true, { loot: 1, lootItems: ['timber', 'nails'], l10Interior: 1 })
  }
  if (cx === hostCx && cy === hostCy && variant === 'worksite') {
    add('l10worksite', 10, 10, 10, 7, false, { interactive: 1, temporary: 1 })
    add('table', 12, 12, 2.2, 1.1, true, { folding: 1 })
    add('toolbox', 16, 12, 1, 1, true, { loot: 1, lootItems: ['nails', 'timber'] })
  }
  // 旧挖掘点是局部、可持久化事件；不会开放自由挖地。
  if (variant !== 'lowland' && variant !== 'deeplake' && h01(seed, 0x1050, cx, cy) < .012) {
    const x = 7 + h32(seed, 0x1051, cx, cy) % 18, y = 7 + h32(seed, 0x1052, cx, cy) % 18
    if (roadInfo(seed, WX + x, WY + y).d > 6 && !occupied(WX + x, WY + y, 2)) add('l10digsite', x - 1, y - 1, 2, 2, false, { interactive: 1, dug: 0 })
  }

  // 可收割穗极少；不在整片农田散落大量物品。
  if ((variant === 'wheatfield' || variant === 'mixedfield') && h01(seed, 0x1060, cx, cy) < .055) {
    const x = 5 + h32(seed, 0x1061, cx, cy) % 22, y = 5 + h32(seed, 0x1062, cx, cy) % 22
    if (roadInfo(seed, WX + x, WY + y).d > 5) items.push({ id: GEN_ITEM_BASE + (h32(seed, 0x1063, cx, cy, itemN++) & 0xfffff), type: 'wheatgrain', x: WX + x + .5, y: WY + y + .5 })
  }

  // 罕见深湖：只有湖心深水触发 Level 7；普通湖绝不带出口。
  if (variant === 'deeplake') {
    const l = lakeInfo(seed, cx, cy, variant, WX + 16, WY + 16)!
    const hx = Math.floor(l.centerX / CS), hy = Math.floor(l.centerY / CS)
    if (hx === cx && hy === cy) {
      const ex = exitOf(def, 'lakeswim')
      if (ex) exits.push({ def: ex, x: l.centerX, y: l.centerY, z: -2.8, discovered: false })
    }
  }

  // 每个 16×16 超区域一个土路尽头；与道路同轴，不使用额外路牌。
  const rx = Math.floor(cx / 16), ry = Math.floor(cy / 16), end = longRoadPoint(seed, rx, ry)
  if (Math.floor(end.x / CS) === cx && Math.floor(end.y / CS) === cy) {
    const ex = exitOf(def, 'longroad')
    if (ex) exits.push({ def: ex, x: end.x, y: end.y, discovered: false })
  }

  // 刚性建筑不能像麦秆一样逐顶点贴随地面起伏。为房屋墙体、作业点和干草块生成
  // 确定性的局部地基平台，并用缓坡接回原高度场。目标高度取占地内平均值，可同时
  // 避免一侧悬空和另一侧深埋；树木、树篱、作物等柔性结构仍保持自然坡面。
  const foundationKinds = new Set<Structure['kind']>([
    'l10shed', 'l10stable', 'l10outhouse', 'barn', 'l10worksite', 'l10haybale',
  ])
  for (const s of structures) {
    if (!foundationKinds.has(s.kind)) continue
    const localX0 = s.x - WX, localY0 = s.y - WY
    const localX1 = localX0 + s.w, localY1 = localY0 + s.h
    let target = 0, samples = 0
    for (let y = Math.max(0, Math.floor(localY0)); y < Math.min(CS, Math.ceil(localY1)); y++) {
      for (let x = Math.max(0, Math.floor(localX0)); x < Math.min(CS, Math.ceil(localX1)); x++) {
        const i = idx(x, y)
        if (liquid[i]) continue
        target += terrain[i]; samples++
      }
    }
    if (!samples) continue
    target /= samples
    const small = s.kind === 'l10haybale'
    const flatPad = small ? .28 : .82
    const apron = small ? .72 : 1.8
    const fx0 = localX0 - flatPad, fy0 = localY0 - flatPad
    const fx1 = localX1 + flatPad, fy1 = localY1 + flatPad
    for (let y = Math.max(0, Math.floor(fy0 - apron)); y < Math.min(CS, Math.ceil(fy1 + apron)); y++) {
      for (let x = Math.max(0, Math.floor(fx0 - apron)); x < Math.min(CS, Math.ceil(fx1 + apron)); x++) {
        const i = idx(x, y)
        if (liquid[i]) continue
        const px = x + .5, py = y + .5
        const dx = Math.max(fx0 - px, 0, px - fx1)
        const dy = Math.max(fy0 - py, 0, py - fy1)
        const distance = Math.hypot(dx, dy)
        if (distance >= apron) continue
        const blend = distance <= 0 ? 1 : smooth(1 - distance / apron)
        terrain[i] += (target - terrain[i]) * blend
      }
    }
  }

  return { variant, tiles, wet, elev, step, tint, crawl, outdoor, ceiling, liquid, seaFloor, terrain, structures, items, lights, exits, entities }
}

registerInfiniteLevel(10, {
  genRaw: genL10ChunkRaw,
  variantOf: l10VariantOf,
  rareVariants: L10_RARE_VARIANTS,
  variantNames: L10_VARIANT_NAMES,
  variantLore: L10_VARIANT_LORE,
  spawnWorld: L10_L9_SPAWN,
  spawnFloor: 0,
  regionExitPos: (seed, rx, ry) => {
    // HUD 超区域以 8×8 chunk 计；两组 HUD 区域映射到同一 16×16 路线终点。
    return l10RegionExitPoint(seed, Math.floor(rx / 2), Math.floor(ry / 2))
  },
})
