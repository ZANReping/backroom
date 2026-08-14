// Level 6 双层无限生成：地表苔原写入 tiles/outdoor/elev；地下廊道写入 dn/dnWall。
// 两层共享同一套世界坐标和 chunk 生命周期，废弃楼梯井与塌陷坑在层内切换 FloorBand。
import { RNG } from '../core/rng'
import type { ExitInstance, GroundItem, LevelDef, Structure } from '../core/types'
import { CS, GEN_ITEM_BASE, RS, h32, regionHost } from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'

export type L6Variant = 'tundra' | 'deadwood' | 'stinkfield' | 'shattered'
export const L6_VARIANT_NAMES: Record<L6Variant, string> = {
  tundra: '贫瘠苔原', deadwood: '枯林', stinkfield: '恶臭草地', shattered: '塌陷地带',
}
export const L6_VARIANT_LORE: Record<string, string[]> = {
  tundra: ['近黑天空下的辽阔苔原没有地平线。天然光微弱得只能勾出枯灌木和巨石的轮廓。'],
  deadwood: ['枯死的灌木聚成稀疏森林；远处偶尔传来鸟鸣，但天空里从未见过鸟。'],
  stinkfield: ['一片腐败气味浓重的草地横在冻土上。风声像幻听，停步后又只剩彻底寂静。'],
  shattered: ['冻土被成片深坑撕开。脆弱地面随时可能塌进下方庞大的廊道网络。'],
}
export const L6_RARE_VARIANTS: readonly string[] = ['deadwood', 'stinkfield', 'shattered']

const h01 = (...n: number[]) => h32(...n) / 4294967296
const mod = (n: number, d: number) => ((n % d) + d) % d
const smooth = (t: number) => t * t * (3 - 2 * t)
function terrainNoise(seed: number, wx: number, wy: number): number {
  const S = 18, fx = wx / S, fy = wy / S, x0 = Math.floor(fx), y0 = Math.floor(fy)
  const tx = smooth(fx - x0), ty = smooth(fy - y0)
  const v = (x: number, y: number) => h01(seed, 0x6650, x, y) * 2 - 1
  const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx
  const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx
  return (a + (b - a) * ty) * 0.22
}

export function l6VariantOf(seed: number, cx: number, cy: number): L6Variant {
  if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) return 'tundra'
  const r = h01(seed, 0x6601, Math.floor(cx / 3), Math.floor(cy / 3))
  return r < 0.16 ? 'shattered' : r < 0.34 ? 'stinkfield' : r < 0.58 ? 'deadwood' : 'tundra'
}

/** 地下全局连通廊道网：纵横主廊在世界坐标上周期贯穿，局部侧室不会破坏主网。 */
export function l6UndergroundAt(wx: number, wy: number): boolean {
  const vx = mod(wx - 13, 24)
  const hy = mod(wy - 13, 28)
  return vx <= 3 || hy <= 2
}

function pitAt(seed: number, wx: number, wy: number, density = 1): boolean {
  if (Math.abs(wx - 15) < 7 && Math.abs(wy - 15) < 7) return false
  const S = 34
  const bx = Math.floor(wx / S), by = Math.floor(wy / S)
  for (let cy = by - 1; cy <= by + 1; cy++) for (let cx = bx - 1; cx <= bx + 1; cx++) {
    if (h01(seed, 0x6610, cx, cy) > 0.42 * density) continue
    const px = cx * S + 7 + (h32(seed, 0x6611, cx, cy) % 20)
    const py = cy * S + 7 + (h32(seed, 0x6612, cx, cy) % 20)
    const r = 2.2 + (h32(seed, 0x6613, cx, cy) % 20) / 10
    if ((wx + 0.5 - px) ** 2 + (wy + 0.5 - py) ** 2 < r * r) return true
  }
  return false
}

export function genL6ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string): GenChunk {
  const variant = (forceVariant as L6Variant | undefined) ?? l6VariantOf(seed, cx, cy)
  const rng = new RNG(h32(seed, 0x6600, cx, cy))
  const N = CS * CS
  const tiles = new Uint8Array(N).fill(1)
  const wet = new Uint8Array(N)
  const elev = new Uint8Array(N).fill(3)
  const step = new Uint8Array(N)
  // 枯林使用灰褐冻土，恶臭草原使用病态橄榄色；其余仍是冷暗苔原。
  const surfaceTint = variant === 'deadwood' ? 27 : variant === 'stinkfield' ? 28 : 24
  const tint = new Uint8Array(N).fill(surfaceTint)
  const crawl = new Uint8Array(N)
  const outdoor = new Uint8Array(N).fill(1)
  const dn = new Uint8Array(N)
  const dnWall = new Uint8Array(N)
  const terrain = new Float32Array(N)
  const structures: Structure[] = []
  const items: GroundItem[] = []
  const exits: ExitInstance[] = []
  const WX = cx * CS, WY = cy * CS
  const li = (x: number, y: number) => y * CS + x
  let sid = 0, itemId = 0
  const push = (kind: Structure['kind'], wx: number, wy: number, w: number, h: number, solid: boolean, floor: -1 | 0 = 0, data?: Structure['data']) => {
    structures.push({ kind, x: wx, y: wy, w, h, solid, floor, data: { ...data, sid: ((cx & 0xff) << 24) | ((cy & 0xff) << 16) | ((sid++ & 0xff) << 4) | 6 } })
  }

  for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
    const wx = WX + x, wy = WY + y, i = li(x, y)
    terrain[i] = terrainNoise(seed, wx + 0.5, wy + 0.5)
    if (pitAt(seed, wx, wy, variant === 'shattered' ? 1.55 : 1)) elev[i] = 4
    const open = l6UndergroundAt(wx, wy)
    dn[i] = open ? 1 : 0
    dnWall[i] = open ? 0 : 1
  }

  // 地表自然物：由 chunk 锚点归属，跨窗口不重复。
  const surfaceClear = (x: number, y: number, radius = 1) => {
    for (let yy = Math.floor(y - radius); yy <= Math.ceil(y + radius); yy++)
      for (let xx = Math.floor(x - radius); xx <= Math.ceil(x + radius); xx++)
        if (xx < 1 || yy < 1 || xx >= CS - 1 || yy >= CS - 1 || elev[li(xx, yy)] === 4) return false
    return Math.abs(WX + x - 15) >= 5 || Math.abs(WY + y - 15) >= 5
  }

  const surfaceCount = variant === 'deadwood' ? rng.int(38, 56) : variant === 'stinkfield' ? rng.int(28, 42) : rng.int(10, 20)
  for (let n = 0; n < surfaceCount; n++) {
    const x = rng.int(2, CS - 4), y = rng.int(2, CS - 4), wx = WX + x, wy = WY + y
    if (!surfaceClear(x, y, variant === 'stinkfield' ? 2 : 1)) continue
    const r = rng.next()
    if (variant === 'deadwood' && r < 0.82) {
      push('deadshrub', wx, wy, 0.75, 0.75, true, 0, { tree: true, rot: rng.range(0, 6.28), scale: rng.range(1.05, 1.8) })
    } else if (variant === 'stinkfield' && r < 0.84) {
      const w = rng.range(2.8, 4.8), h = rng.range(2.8, 4.8)
      push('stinkgrass', wx, wy, w, h, false, 0, { rot: rng.range(0, 6.28), density: rng.range(0.8, 1.25) })
    } else if (r < 0.69) push('deadshrub', wx, wy, 1, 1, false, 0, { rot: rng.range(0, 6.28), scale: rng.range(0.8, 1.5) })
    else if (r < 0.88) push('tundrarock', wx, wy, rng.range(0.7, 1.8), rng.range(0.7, 1.8), true, 0, { rot: rng.range(0, 6.28) })
    else push('crystalcluster', wx, wy, 1, 1, true, 0, { blue: rng.chance(0.45) })
  }

  // 每个 4×4 chunk 区域固定一座双向楼梯井；原点附近必有一座，保证所有入口都可换层。
  const sr = 4, rx = Math.floor(cx / sr), ry = Math.floor(cy / sr)
  const scx = rx * sr + (h32(seed, 0x6620, rx, ry) % sr)
  const scy = ry * sr + (h32(seed, 0x6621, rx, ry) % sr)
  if ((cx === 0 && cy === 0) || (cx === scx && cy === scy)) {
    let sx = cx === 0 && cy === 0 ? 15 : 6 + (h32(seed, 0x6622, cx, cy) % 20)
    const sy = cx === 0 && cy === 0 ? 15 : 6 + (h32(seed, 0x6623, cx, cy) % 20)
    // 地下端必须落在廊道上。
    for (let r = 0; r < 12 && !l6UndergroundAt(WX + sx, WY + sy); r++) sx = mod(sx + 1, CS - 4) + 2
    elev[li(sx, sy)] = 3
    push('l6stairwell', WX + sx, WY + sy, 1, 1, false, 0, { end: 'surface' })
    push('l6stairwell', WX + sx, WY + sy, 1, 1, false, -1, { end: 'underground' })
  }

  // 大空地中的方尖碑。
  if (h01(seed, 0x6630, cx, cy) < 0.035) {
    const x = 12 + (h32(seed, 0x6631, cx, cy) % 8), y = 12 + (h32(seed, 0x6632, cx, cy) % 8)
    if (elev[li(x, y)] !== 4) push('obelisk', WX + x, WY + y, 2, 2, true, 0, { glyph: h32(seed, cx, cy) % 7 })
  }

  // 地下锈蚀管道网与霉斑路标；全部保持黑暗，不生成任何灯或实体。
  for (let n = 0, count = rng.int(6, 12); n < count; n++) {
    const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
    if (!dn[li(x, y)]) continue
    push(n % 3 === 0 ? 'braille' : 'hotpipe', WX + x, WY + y, 1, 1, false, -1, { rust: 1, mold: 1, deg: rng.int(0, 3) * 90 })
  }

  // 地表罕见海浪楼梯井/深海锈蚀活板门 → L7；地下自然洞穴 → L8。
  // 宿主种子与无限出口定位器保持一致；每个稀疏区域各有一处地表和地下出口。
  const rrX = Math.floor(cx / RS), rrY = Math.floor(cy / RS), host = regionHost(seed, rrX, rrY)
  if (host.cx === cx && host.cy === cy) {
    const sx = 7 + (h32(seed, 0x6671, cx, cy) % 18), sy = 7 + (h32(seed, 0x6672, cx, cy) % 18)
    // 海浪井及相邻落脚格绝不能与深坑或大型自然物重叠。
    for (let y = sy - 1; y <= sy + 1; y++) for (let x = sx - 1; x <= sx + 1; x++) elev[li(x, y)] = 3
    const natural = new Set<Structure['kind']>(['deadshrub', 'stinkgrass', 'tundrarock', 'crystalcluster'])
    for (let i = structures.length - 1; i >= 0; i--) {
      const s = structures[i]
      if ((s.floor ?? 0) === 0 && natural.has(s.kind) && Math.hypot(s.x + s.w / 2 - (WX + sx + 0.5), s.y + s.h / 2 - (WY + sy + 0.5)) < 2.5) structures.splice(i, 1)
    }
    const sea = def.exits.find((q) => q.kind === 'seahatch')
    if (sea) exits.push({ def: sea, x: WX + sx, y: WY + sy, floor: 0, discovered: false })

    const ax = 7 + (h32(seed, 0x6675, cx, cy) % 18), ay = 7 + (h32(seed, 0x6676, cx, cy) % 18)
    let cave: { x: number; y: number } | null = null
    for (let r = 0; r < CS && !cave; r++) for (let dy = -r; dy <= r && !cave; dy++) for (const dx of [-r, r]) {
      const x = ax + dx, y = ay + dy
      if (x >= 2 && y >= 2 && x < CS - 2 && y < CS - 2 && l6UndergroundAt(WX + x, WY + y)) { cave = { x, y }; break }
    }
    const caveDef = def.exits.find((q) => q.kind === 'cave8')
    if (cave && caveDef) {
      exits.push({ def: caveDef, x: WX + cave.x, y: WY + cave.y, floor: -1, discovered: false })
      push('l6cave', WX + cave.x, WY + cave.y, 1, 1, false, -1)
    }
  }

  // 极稀少的前人遗留物，绝不投放电子光源。
  if (rng.chance(0.13)) items.push({ id: GEN_ITEM_BASE + ((cx & 0xff) << 12) + ((cy & 0xff) << 4) + itemId++, type: rng.chance(0.7) ? 'chalkstub' : 'rope', x: WX + rng.int(3, 29) + 0.5, y: WY + rng.int(3, 29) + 0.5 })

  return { variant, tiles, wet, elev, step, tint, crawl, outdoor, dn, dnWall, terrain, structures, items, lights: [], exits, entities: [] }
}

registerInfiniteLevel(6, {
  genRaw: genL6ChunkRaw,
  variantOf: l6VariantOf,
  rareVariants: L6_RARE_VARIANTS,
  variantNames: L6_VARIANT_NAMES,
  variantLore: L6_VARIANT_LORE,
})
