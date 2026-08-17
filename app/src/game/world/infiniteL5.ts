// ================= v54：Level 5「恐怖酒店」无限 chunk 生成 =================
// 布局基调：无限 1930 年代酒店综合楼——世界坐标纯函数走廊网（竖廊 3 宽 / 横廊 2 高，全部贯穿，
// 天然全连通；红地毯走廊即层级地板红调）。v55：大厅不再单街区——**2×2 街区合并为跨多 chunk 的
// 大厅格**（约 35×35 内腔，世界坐标纯函数决定大厅矩形，各 chunk 各雕自己部分，天然缝合）：
//   四类大厅——主厅 mainhall（挑高 ceiling=1，红金墙纸/水晶吊灯/红木柱/古董沙发/书架/壁灯/盆栽；
//     电梯嵌墙壁龛槽位只在主厅四周墙里）；贝弗莉室 beverly（极宽敞空旷 + 中央小桌 + 巨吊灯 + 门洞全敞开）；
//     维修大厅 maintenance（现代维修区：明亮灯板/管道桥架/母线/配电柜）；餐厅 dining（白桌布餐桌阵列 + 吊灯 + 舞台角）。
//   大厅周边墙壁多扇门 + 多个走廊入口（每侧 2 门洞：50% 装门 / 其余敞开；贝弗莉全敞开），走廊网把大厅串起来。
//   非大厅格的街区为五类房间——客房 guestroom（2×2 小房间：床/梳妆台/桌/椅，房门 25% 上锁可撬
//     [同有限 L5 hoteldoor data.locked]，~0.5% 房门被「深色木门」替代 → Level 9）；
//     休息室 lounge（沙发/休闲椅/茶几/留声机/烛台）；健身房 gym（现代风：卧推凳/储物柜/明亮灯板）；
//     游泳池 pool（室内泳池 liquid 浅水/深水 + 扶梯 + 跳台）；
//     锅炉房 boilerroom（管道丛林 + 锅炉 + 阀门 + 暖光；深处完全黑暗的门 boilerdeep → Level 6）。
// 区域判定：l5RegionAt(seed, wx, wy) → 大厅/房间矩形 + 变体（走廊瓦片 variant=null）——HUD 区域名 /
//   DevPanel 传送落点均以矩形为准，区域间以走廊为界。
// 出口链：电梯（主厅壁龛槽位：regionHost 8×8 超区域 1 槽位 + 出生 chunk 保底，dest 3 免费回程，
//   arriveElevator 双向链不变）；年久失修的古典楼梯（oldstairs → Level 4，8×8 超区域 ~55% 宿主
//   + 出生 chunk 保底 1 部——玩家从 L4 经古典楼梯进 L5 时落在这部楼梯 2 格外的空旷地板，见 engine/level.ts）；
//   锅炉房深处完全黑暗的门（boilerdeep → Level 6，每个锅炉房街区 1 扇，无灯）；深色木门（darkwooddoor
//   → Level 9，客房房门 ~0.5% 替代）。
// 实体低密度：池仅猎犬/笑魇/窃皮者/死亡飞蛾（死亡飞蛾主巢——额外单列概率，占比最高），
//   总密度 ~1.7%/chunk 明显低于其他层；出生安全区（|cx|,|cy|≤1）不生成。
import { RNG } from '../core/rng'
import { UNIVERSAL_ITEMS } from '../content/items'
import type { LevelDef, Structure, LightSource, ExitInstance, GroundItem } from '../core/types'
import { CS, RS, h32, GEN_ITEM_BASE, regionHost, exitTarget } from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'

// ---------- 变体 ----------
export type L5Hall = 'mainhall' | 'beverly' | 'maintenance' | 'dining'
export type L5Room = 'guestroom' | 'lounge' | 'gym' | 'pool' | 'boilerroom'
export type L5Variant = L5Hall | L5Room
export const L5_VARIANT_NAMES: Record<L5Variant, string> = {
  mainhall: '主厅', beverly: '贝弗莉室', maintenance: '维修大厅', dining: '餐厅',
  guestroom: '客房', lounge: '休息室', gym: '健身房', pool: '游泳池', boilerroom: '锅炉房',
}
export const L5_VARIANT_LORE: Record<string, string[]> = {
  mainhall: [
    '主厅——挑高的酒店大堂：红金墙纸、黑胡桃木柱、大理石地面与水晶吊灯。古董沙发的绒面一尘不染，电梯门嵌在四周墙里，像从未离开过 1937 年。',
    '档案提醒：主厅是本层的枢纽——电梯嵌在主厅的墙里。这里的干净不正常：污渍会自行消失，包括你留下的。',
  ],
  beverly: [
    '贝弗莉室——极宽敞的空旷大厅，只有中央一张小桌与头顶的巨吊灯。墙上的门洞多得离谱，每一扇都通向你已经走过的地方。',
    '档案记录：贝弗莉室（Beverly Room）的桌面有时摆着饮料，有时摆着一局没下完的麻将。别坐下。墙后的派对喧闹声在这里最清楚。',
  ],
  maintenance: [
    '维修大厅——与酒店年代不符的现代维修区：金属护墙板、灰色地坪、亮得刺眼的灯板，管道桥架与母线沿墙走得整整齐齐。',
    '档案提醒：维修区灯最亮、最安全，也最容易迷路——所有桥架长得一模一样。沿着灯板走，别数门。',
  ],
  dining: [
    '餐厅——白桌布餐桌阵列一丝不苟，吊灯把银餐具照得发亮。角落的舞台空着，但唱针落下的声音像刚停了一秒。',
    '档案记录：餐厅的东西看起来都能吃。档案的建议是：看起来能吃的，恰恰都别吃。',
  ],
  guestroom: [
    '客房——床、梳妆台、桌椅，床单平整得像刚有人起身。部分房门上了锁，撬棍和万能钥匙都还有效。',
    '档案提醒：客房里偶尔有一扇颜色深得不对劲的木门。档案只记录了一句：那不是客房门，别推。',
  ],
  lounge: [
    '休息室——1920 年代风格的沙发与扶手椅围着茶几，留声机的喇叭歪向墙角，烛台还亮着。坐下来的人会不自觉地等一首永远不会开始的爵士乐。',
    '档案提醒：休息室适合恢复理智，不适合过夜。留声机自己转起来的时候，离开。',
  ],
  gym: [
    '健身房——与酒店格格不入的现代器械区：卧推凳、杠铃、储物柜，灯板白得发冷。杠铃片上的灰比别处都薄。',
    '档案记录：谁在用它？档案没有答案，只有一句附注：器械的位置会变。',
  ],
  pool: [
    '游泳池——室内泳池的水面纹丝不动，瓷砖白得发青，扶梯与跳台像是昨天才擦过。水很干净，干净得看不见底。',
    '档案警告：泳池深水区没有底的照片记录。下水的人回来了，但他们描述的水下结构对不上任何图纸。',
  ],
  boilerroom: [
    '锅炉房——管道丛林包裹着铆接锅炉，阀门在暖光里渗出热气。往深处走，光会越来越少——最里面有一扇完全黑暗的门。',
    '档案记录：锅炉房深处那扇黑门后面没有锅炉。M.E.G. 的建基路线从那里下行到 Level 6——如果你受得了没有光。',
  ],
}
// 传送页/图鉴「变种房间」：L2 先例——全部变体皆可传（九种全列）
export const L5_RARE_VARIANTS: readonly string[] = [
  'mainhall', 'beverly', 'maintenance', 'dining', 'guestroom', 'lounge', 'gym', 'pool', 'boilerroom',
]

const h01 = (...n: number[]) => h32(...n) / 4294967296
const L5_HALLS: readonly string[] = ['mainhall', 'beverly', 'maintenance', 'dining']

// ---------- 走廊网（世界坐标纯函数：相邻 chunk 天然对齐）----------
const VSP = 20 // 竖廊名义间距（瓦片）
const HSP = 20 // 横廊名义间距
export const l5CorrX = (seed: number, k: number) =>
  13 + k * VSP + (k === 0 ? 0 : (h32(seed, 0x5c0, k) % 7) - 3) // 竖廊西缘；宽 3
export const l5RowY = (seed: number, r: number) =>
  13 + r * HSP + (r === 0 ? 0 : (h32(seed, 0x5d0, r) % 7) - 3) // 横廊北缘；高 2

// 街区矩形（内腔）：x0..x1 × y0..y1（四周留 1 格墙线，墙外即走廊）
function blockRect(seed: number, k: number, r: number) {
  return { x0: l5CorrX(seed, k) + 4, x1: l5CorrX(seed, k + 1) - 2, y0: l5RowY(seed, r) + 3, y1: l5RowY(seed, r + 1) - 2 }
}

// ---------- 大厅格（v55：2×2 街区合并为跨多 chunk 大房间）----------
// 大厅格 (hk,hr) 覆盖街区 k∈{2hk,2hk+1}、r∈{2hr,2hr+1}；矩形内腔含被吸收的街区内墙与穿行走廊段
export function l5HallAt(seed: number, hk: number, hr: number): L5Hall | null {
  if (hk === 0 && hr === 0) return 'mainhall' // 出生大厅格恒为主厅（挑高、灯亮、安全引入；电梯/古典楼梯保底所在）
  if (h01(seed, 0x5b20, hk, hr) >= 0.5) return null // ~50% 大厅格（其余为房间街区群）
  const v = h01(seed, 0x5b21, hk, hr)
  return v < 0.4 ? 'mainhall' : v < 0.65 ? 'dining' : v < 0.85 ? 'maintenance' : 'beverly'
}
// 大厅矩形（内腔，世界瓦片）：自街区 (2hk,2hr) 西北角到街区 (2hk+1,2hr+1) 东南角
export function l5HallRect(seed: number, hk: number, hr: number) {
  return {
    x0: l5CorrX(seed, 2 * hk) + 4, x1: l5CorrX(seed, 2 * hk + 2) - 2,
    y0: l5RowY(seed, 2 * hr) + 3, y1: l5RowY(seed, 2 * hr + 2) - 2,
  }
}
// 大厅门洞位（世界纯函数：每侧 2 个，共 8 个；距角 ≥3 格——门规则自保证：沿墙两侧皆墙）
// salt 供 hoteldoor 掷点（与门位绑定，跨 chunk 一致）
export function l5HallOpenings(seed: number, hk: number, hr: number): { x: number; y: number; salt: number }[] {
  const { x0, x1, y0, y1 } = l5HallRect(seed, hk, hr)
  return [
    { x: x0 + 3, y: y0 - 1, salt: 0x5d30 }, { x: x1 - 3, y: y0 - 1, salt: 0x5d31 }, // 北
    { x: x0 + 3, y: y1 + 1, salt: 0x5d32 }, { x: x1 - 3, y: y1 + 1, salt: 0x5d33 }, // 南
    { x: x0 - 1, y: y0 + 3, salt: 0x5d34 }, { x: x0 - 1, y: y1 - 3, salt: 0x5d35 }, // 西
    { x: x1 + 1, y: y0 + 3, salt: 0x5d36 }, { x: x1 + 1, y: y1 - 3, salt: 0x5d37 }, // 东
  ]
}

// ---------- 房间街区（非大厅格的街区逐一掷点；锅炉房聚集成片——v55）----------
export function l5BlockBiome(seed: number, k: number, r: number): L5Variant {
  const hall = l5HallAt(seed, k >> 1, r >> 1)
  if (hall) return hall
  const v = h01(seed, 0x5b11, k, r)
  // 锅炉房聚集：基础掷点 ≥0.9 为锅炉房；西/北邻块是锅炉房时 ≥0.72 即随迁（链式成片）
  if (v >= 0.9) return 'boilerroom'
  if (v >= 0.72 && (h01(seed, 0x5b11, k - 1, r) >= 0.9 || h01(seed, 0x5b11, k, r - 1) >= 0.9)) return 'boilerroom'
  return v < 0.55 ? 'guestroom' : v < 0.7 ? 'lounge' : v < 0.8 ? 'gym' : 'pool'
}
// 锅炉房片（cluster）根判定：西/北/四角邻均非锅炉房——每片恰一扇黑门（v55；含对角合并抑制）
export function l5BoilerRoot(seed: number, k: number, r: number): boolean {
  const B = (kk: number, rr: number) => l5BlockBiome(seed, kk, rr) === 'boilerroom'
  return B(k, r) && !B(k - 1, r) && !B(k, r - 1) && !B(k - 1, r - 1) && !B(k + 1, r - 1) && !B(k - 1, r + 1) && !B(k + 1, r + 1)
}

// ---------- 区域判定（HUD 区域名 / DevPanel 传送落点；区域间以走廊为界）----------
export interface L5Region { variant: L5Variant | null; x0: number; y0: number; x1: number; y1: number } // variant=null=红地毯走廊
export function l5RegionAt(seed: number, wx: number, wy: number): L5Region | null {
  const ke = Math.round((wx - 17) / VSP), re = Math.round((wy - 16) / HSP)
  // 先查大厅格（覆盖 2×2 街区）
  for (let hk = (ke >> 1) - 1; hk <= (ke >> 1) + 1; hk++)
    for (let hr = (re >> 1) - 1; hr <= (re >> 1) + 1; hr++) {
      const hall = l5HallAt(seed, hk, hr)
      if (!hall) continue
      const rc = l5HallRect(seed, hk, hr)
      if (wx >= rc.x0 - 1 && wx <= rc.x1 + 1 && wy >= rc.y0 - 1 && wy <= rc.y1 + 1)
        return { variant: hall, ...rc }
    }
  // 再查房间街区
  for (let k = ke - 1; k <= ke + 1; k++)
    for (let r = re - 1; r <= re + 1; r++) {
      if (l5HallAt(seed, k >> 1, r >> 1)) continue // 大厅格内无独立街区
      const rc = blockRect(seed, k, r)
      if (wx >= rc.x0 - 1 && wx <= rc.x1 + 1 && wy >= rc.y0 - 1 && wy <= rc.y1 + 1)
        return { variant: l5BlockBiome(seed, k, r) as L5Variant, ...rc }
    }
  return null // 走廊
}

// 街区门洞位（世界纯函数：北/西墙恒各 1，南/东 35%）。
// 返回顺序即优先级：北 > 西 > 南 > 东；salt 供 hoteldoor/darkwooddoor 掷点（与门位绑定，跨 chunk 一致）
function blockOpenings(seed: number, k: number, r: number): { x: number; y: number; salt: number }[] {
  const { x0, x1, y0, y1 } = blockRect(seed, k, r)
  const biome = l5BlockBiome(seed, k, r)
  // 客房街区内墙线（xm 竖墙 / ym 横墙）：门洞不得与其相接（否则门「穿墙侧」一邻是内墙——门规则违例）
  const xm = (x0 + x1) >> 1, ym = (y0 + y1) >> 1
  const dodgeX = (x: number) => (biome === 'guestroom' && x === xm ? (x + 1 <= x1 - 2 ? x + 1 : x - 1) : x)
  const dodgeY = (y: number) => (biome === 'guestroom' && y === ym ? (y + 1 <= y1 - 2 ? y + 1 : y - 1) : y)
  const out: { x: number; y: number; salt: number }[] = []
  out.push({ x: dodgeX(x0 + 2 + (h32(seed, 0x5d2, k, r) % Math.max(1, x1 - x0 - 3))), y: y0 - 1, salt: 0x5d3 })
  out.push({ x: x0 - 1, y: dodgeY(y0 + 2 + (h32(seed, 0x5d4, k, r) % Math.max(1, y1 - y0 - 3))), salt: 0x5d5 })
  if (h01(seed, 0x5d6, k, r) < 0.35)
    out.push({ x: dodgeX(x0 + 2 + (h32(seed, 0x5d7, k, r) % Math.max(1, x1 - x0 - 3))), y: y1 + 1, salt: 0x5d8 })
  if (h01(seed, 0x5d9, k, r) < 0.35)
    out.push({ x: x1 + 1, y: dodgeY(y0 + 2 + (h32(seed, 0x5da, k, r) % Math.max(1, y1 - y0 - 3))), salt: 0x5db })
  return out
}

// 电梯槽位（世界纯函数；主厅四周墙嵌墙壁龛——槽位=主厅大厅格的第一个西/东门洞，
// 门洞格雕开作壁龛、房内背面格回砌成墙；同 L4 壁龛槽位法。只用西/东门洞：geometry 门洞开凿
// 按 +x/-x 优先取邻墙，南北向壁龛会把门洞开到侧面墙）。候选大厅格按矩形外切距离排序，
// 只取主厅（覆盖半径 ±2 大厅格，实测必然命中；兜底最近大厅格不退空槽）。
export function l5ElevSlot(seed: number, rx: number, ry: number): { x: number; y: number; bx: number; by: number } | null {
  const host = regionHost(seed, rx, ry)
  const t = exitTarget(seed, host.cx, host.cy)
  const wtx = host.cx * CS + t.x, wty = host.cy * CS + t.y
  const he = Math.round((wtx - 17) / (VSP * 2)), re = Math.round((wty - 16) / (HSP * 2))
  const cands: { hk: number; hr: number; d: number }[] = []
  for (let hk = he - 2; hk <= he + 2; hk++)
    for (let hr = re - 2; hr <= re + 2; hr++) {
      const { x0, x1, y0, y1 } = l5HallRect(seed, hk, hr)
      const d = Math.max(x0 - wtx, wtx - x1, y0 - wty, wty - y1, 0)
      cands.push({ hk, hr, d })
    }
  cands.sort((a, b) => a.d - b.d)
  for (const pass of [true, false]) // 第一遍只取主厅；极端兜底放宽到任意大厅格
    for (const c of cands) {
      const hall = l5HallAt(seed, c.hk, c.hr)
      if (!hall) continue
      if (pass && hall !== 'mainhall') continue
      const { x0, x1 } = l5HallRect(seed, c.hk, c.hr)
      for (const op of l5HallOpenings(seed, c.hk, c.hr)) {
        if (op.x === x0 - 1) return { x: op.x, y: op.y, bx: x0, by: op.y } // 西墙门洞：背面=房内 (x0, oy)
        if (op.x === x1 + 1) return { x: op.x, y: op.y, bx: x1, by: op.y } // 东墙门洞：背面=房内 (x1, oy)
      }
    }
  return null
}
// 出生电梯槽位：出生 chunk 保底——大厅格 (0,0)（恒主厅）的西墙门洞（v51 arriveElevator 落点在其旁）
export function l5SpawnElevSlot(seed: number): { x: number; y: number; bx: number; by: number } | null {
  const { x0, x1 } = l5HallRect(seed, 0, 0)
  for (const op of l5HallOpenings(seed, 0, 0)) {
    if (op.x === x0 - 1) return { x: op.x, y: op.y, bx: x0, by: op.y }
    if (op.x === x1 + 1) return { x: op.x, y: op.y, bx: x1, by: op.y }
  }
  return null
}

// chunk 显示变体 = 覆盖 chunk 中心瓦片的区域变体（走廊上则取最近区域）
export function l5VariantOf(seed: number, cx: number, cy: number): L5Variant {
  const x = cx * CS + 16, y = cy * CS + 16
  const hit = l5RegionAt(seed, x, y)
  if (hit?.variant) return hit.variant
  // 走廊 chunk：取最近的大厅/街区变体（仅供显示与传送搜索）
  const ke = Math.round((x - 17) / VSP), re = Math.round((y - 16) / HSP)
  let best: L5Variant = 'mainhall', bd = 1e9
  for (let hk = (ke >> 1) - 1; hk <= (ke >> 1) + 1; hk++)
    for (let hr = (re >> 1) - 1; hr <= (re >> 1) + 1; hr++) {
      const hall = l5HallAt(seed, hk, hr)
      if (!hall) continue
      const rc = l5HallRect(seed, hk, hr)
      const d = Math.max(rc.x0 - x, x - rc.x1, rc.y0 - y, y - rc.y1, 0)
      if (d < bd) { bd = d; best = hall }
    }
  for (let k = ke - 1; k <= ke + 1; k++)
    for (let r = re - 1; r <= re + 1; r++) {
      if (l5HallAt(seed, k >> 1, r >> 1)) continue
      const rc = blockRect(seed, k, r)
      const d = Math.max(rc.x0 - x, x - rc.x1, rc.y0 - y, y - rc.y1, 0)
      if (d < bd) { bd = d; best = l5BlockBiome(seed, k, r) }
    }
  return best
}

// ---------- chunk 生成（纯函数：同种子同坐标必一致；GenChunk 契约见 infiniteRegistry）----------
export function genL5ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string): GenChunk {
  const rng = new RNG(h32(seed, cx, cy, 0x5a5))
  const tiles = new Uint8Array(CS * CS).fill(2)
  const wet = new Uint8Array(CS * CS)
  const elev = new Uint8Array(CS * CS)
  const step = new Uint8Array(CS * CS)
  const tint = new Uint8Array(CS * CS)
  const crawl = new Uint8Array(CS * CS)
  const outdoor = new Uint8Array(CS * CS) // v54：新 L5 单层全室内（恒全 0——无 outdoor/up/up2）
  const ceiling = new Uint8Array(CS * CS) // 主厅挑高 ceiling=1（GenChunk 第二个 ceiling 用例，首个无限层用例）
  const liquid = new Uint8Array(CS * CS) // 室内泳池（1=深水/2=浅水，同有限层 m.liquid 契约）
  const structures: Structure[] = []
  const items: GroundItem[] = []
  const lights: LightSource[] = []
  const exits: ExitInstance[] = []
  const entities: { type: string; x: number; y: number }[] = []
  const li = (x: number, y: number) => y * CS + x
  const isF = (x: number, y: number) => x >= 0 && y >= 0 && x < CS && y < CS && tiles[li(x, y)] === 1
  const WX = cx * CS, WY = cy * CS
  const inChunk = (x: number, y: number) => x >= WX && x < WX + CS && y >= WY && y < WY + CS
  // 出生点（世界 15,15）附近 2 格内不放实心结构（生成不变量：出生点必为可站立地板）
  const nearSpawn = (x: number, y: number) => Math.max(Math.abs(x - 15), Math.abs(y - 15)) <= 2
  let itemN = 0
  let sidN = 0
  const sidOf = (n: number) => ((cx & 0xff) << 24) | ((cy & 0xff) << 16) | ((n & 0xff) << 4) | 1 // v55：动态状态结构（留声机启停/饮料桌取走）挂 sid 持久化
  const pushStruct = (kind: Structure['kind'], x: number, y: number, w: number, h: number, solid: boolean, data?: Structure['data']) => {
    if (!inChunk(x, y)) return
    structures.push({ kind, x, y, w, h, solid, data })
  }
  const pushStructSid = (kind: Structure['kind'], x: number, y: number, w: number, h: number, solid: boolean, data?: Structure['data']) =>
    pushStruct(kind, x, y, w, h, solid, { ...data, sid: sidOf(sidN++) })
  const pushItem = (type: string, x: number, y: number) => {
    if (!inChunk(x, y)) return
    items.push({ id: GEN_ITEM_BASE + ((cx & 0xff) << 12) + ((cy & 0xff) << 4) + (itemN++ & 0xf), type, x: x + 0.5, y: y + 0.5 })
  }
  // v55：跨 chunk 大贴花结构（地毯/横梁）按 chunk 裁剪推送——两半各自成结构、边缘相接视觉无缝
  // （设计模式布局条目按 32×32 chunk 边界断言；结构无动态状态，切片安全）
  const pushClipped = (kind: Structure['kind'], x: number, y: number, w: number, h: number, data?: Structure['data']) => {
    const nx0 = Math.max(x, WX), ny0 = Math.max(y, WY)
    const nx1 = Math.min(x + w - 1, WX + CS - 1), ny1 = Math.min(y + h - 1, WY + CS - 1)
    if (nx1 < nx0 || ny1 < ny0) return
    structures.push({ kind, x: nx0, y: ny0, w: nx1 - nx0 + 1, h: ny1 - ny0 + 1, solid: false, data })
  }
  const pushLight = (x: number, y: number, r: number, color: string, extra?: Partial<LightSource>) => {
    if (!inChunk(x, y)) return
    lights.push({ x: x + 0.5, y: y + 0.5, r, color, flickerSeed: rng.next() * 100, gen: 1, ...extra })
  }
  // 世界矩形雕刻/砌墙（裁剪到本 chunk；布局是世界坐标函数，相邻 chunk 各自雕刻天然缝合）
  const carveRectW = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        tiles[li(x - WX, y - WY)] = 1
  }
  const wallRectW = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        tiles[li(x - WX, y - WY)] = 2
  }
  const ceilRectW = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        ceiling[li(x - WX, y - WY)] = 1
  }
  const wetRectW = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        wet[li(x - WX, y - WY)] = v
  }
  const liquidRectW = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        liquid[li(x - WX, y - WY)] = v
  }
  // v55：tint 着色（21=走廊红金地毯 22=大厅/休息室/客房暖毯 23=泳池瓷砖 24=锅炉房深色 25=维修灰金属 26=健身房灰蓝）
  const tintRectW = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        tint[li(x - WX, y - WY)] = v
  }
  const solidAtL = (x: number, y: number) =>
    structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)

  const kMin = Math.floor((WX - CS - 13) / VSP) - 1, kMax = Math.ceil((WX + 2 * CS - 13) / VSP) + 1
  const rMin = Math.floor((WY - CS - 13) / HSP) - 1, rMax = Math.ceil((WY + 2 * CS - 13) / HSP) + 1

  // ---- 走廊网（全部贯穿：横廊接通所有竖廊 → 天然全连通；tint 21=无缝酒红锦缎地毯走廊）----
  for (let r = rMin; r <= rMax; r++) {
    const ry = l5RowY(seed, r)
    if (ry + 1 < WY - CS || ry > WY + 2 * CS) continue
    carveRectW(WX - CS, ry, WX + 2 * CS, ry + 1)
    tintRectW(WX - CS, ry, WX + 2 * CS, ry + 1, 21)
  }
  for (let k = kMin; k <= kMax; k++) {
    const kx = l5CorrX(seed, k)
    if (kx + 2 < WX - CS || kx > WX + 2 * CS) continue
    carveRectW(kx, WY - CS, kx + 2, WY + 2 * CS)
    tintRectW(kx, WY - CS, kx + 2, WY + 2 * CS, 21)
  }

  // ---- 大厅格 / 房间街区 ----
  const findExitDef = (kind: string) => def.exits.find((e) => e.kind === kind)
  const darkDoorDef = findExitDef('darkwooddoor')
  const boilerDef = findExitDef('boilerdeep')
  // 电梯槽位集合（本 chunk 附近 3×3 超区域 + 出生保底）——大厅门洞掷点时避让
  const slotMap = new Map<string, { bx: number; by: number }>() // 键=壁龛格 → 房内背面格
  {
    const rx0 = Math.floor(cx / RS), ry0 = Math.floor(cy / RS)
    for (let dry = -1; dry <= 1; dry++)
      for (let drx = -1; drx <= 1; drx++) {
        const sl = l5ElevSlot(seed, rx0 + drx, ry0 + dry)
        if (sl) slotMap.set(`${sl.x},${sl.y}`, { bx: sl.bx, by: sl.by })
      }
    const sp = l5SpawnElevSlot(seed)
    if (sp) slotMap.set(`${sp.x},${sp.y}`, { bx: sp.bx, by: sp.by })
  }

  // ---- 大厅格（四类大厅；2×2 街区合并大房间）----
  for (let hk = (kMin >> 1) - 1; hk <= (kMax >> 1) + 1; hk++) {
    for (let hr = (rMin >> 1) - 1; hr <= (rMax >> 1) + 1; hr++) {
      const hall0 = l5HallAt(seed, hk, hr)
      if (!hall0) continue
      const { x0, x1, y0, y1 } = l5HallRect(seed, hk, hr)
      if (x1 < WX - 8 || x0 > WX + CS + 8 || y1 < WY - 8 || y0 > WY + CS + 8) continue
      const biome = ((forceVariant && L5_HALLS.includes(forceVariant) ? forceVariant : hall0)) as L5Hall
      carveRectW(x0, y0, x1, y1) // 合并内腔（街区内墙与穿行走廊段一并吸收）
      // v55b（任务2）：大厅围墙环回砌——2×2 合并大厅横跨一条走廊线，走廊雕刻会把围墙环穿出一截 3 宽缺口
      // （未计划的额外入口 + 贴墙件浮空的根因）；8 门洞与电梯壁龛除外
      const opSet = new Set(l5HallOpenings(seed, hk, hr).map((o) => `${o.x},${o.y}`))
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (!opSet.has(`${x},${y0 - 1}`)) wallRectW(x, y0 - 1, x, y0 - 1)
        if (!opSet.has(`${x},${y1 + 1}`)) wallRectW(x, y1 + 1, x, y1 + 1)
      }
      for (let y = y0 - 1; y <= y1 + 1; y++) {
        if (!opSet.has(`${x0 - 1},${y}`)) wallRectW(x0 - 1, y, x0 - 1, y)
        if (!opSet.has(`${x1 + 1},${y}`)) wallRectW(x1 + 1, y, x1 + 1, y)
      }
      // v55：大厅地面 tint 分色（覆盖走廊地毯 tint——雕刻顺序走廊在先）
      tintRectW(x0, y0, x1, y1, biome === 'maintenance' ? 25 : 22)
      const backSet = new Set<string>() // 回砌格 + 门洞正前方格（家具避让——门后第一格被堵=入口孤岛）
      const wallUsed = new Set<string>() // v55（任务5）：贴墙装饰互斥——wallsign/sconce/photo/bigpainting/贴墙柜 同瓦片不重叠
      for (let oi = 0; oi < 8; oi++) {
        const op = l5HallOpenings(seed, hk, hr)[oi]
        const slot = slotMap.get(`${op.x},${op.y}`)
        if (slot) { // 电梯壁龛：门洞格雕开（出口嵌墙）+ 房内背面格回砌成墙（薄墙让 1 格成厚墙）、不装门
          carveRectW(op.x, op.y, op.x, op.y)
          wallRectW(slot.bx, slot.by, slot.bx, slot.by)
          backSet.add(`${slot.bx},${slot.by}`)
          continue
        }
        carveRectW(op.x, op.y, op.x, op.y)
        // 多扇门 + 多个走廊入口并存：每侧第 1 口装门（北恒装/南东西 50%；维修大厅=员工门四侧第 1 口恒装），
        // 第 2 口恒敞开；贝弗莉室 8 口全敞开。电梯壁龛只占西/东第 1 口——北门恒装门保底
        const doorSlot = oi % 2 === 0 && (oi === 0 || biome === 'maintenance' || h01(seed, op.salt, hk, hr) < 0.5)
        const hasDoor = biome !== 'beverly' && doorSlot && !nearSpawn(op.x, op.y)
        if (hasDoor)
          pushStruct('hoteldoor', op.x, op.y, 1, 1, true, { open: 0, hue: h32(seed, op.salt + 1, hk, hr) % 5 })
        // 门旁标牌（墙内侧贴墙字牌；门洞间距 ≥3 保证邻位背后是墙）：
        // 主厅=金色房号牌（坐标哈希确定性房号）；维修大厅北门=「员工专用」+ 警示牌；贝弗莉=银色「Beverly Room」
        const sxn = op.y === y0 - 1 || op.y === y1 + 1 ? op.x + 1 : op.x // 标牌瓦片（房内贴墙）
        const syn = op.y === y0 - 1 ? y0 : op.y === y1 + 1 ? y1 : op.y + 1
        if (biome === 'mainhall' && hasDoor) {
          pushStruct('wallsign', sxn, syn, 1, 1, false, { text: String(100 + (h32(seed, 0x5d40 + oi, hk, hr) % 900)), gold: 1 })
          wallUsed.add(`${sxn},${syn}`)
        } else if (biome === 'maintenance' && oi === 0) {
          pushStruct('wallsign', sxn, syn, 1, 1, false, { text: '员工专用' })
          wallUsed.add(`${sxn},${syn}`)
          pushStruct('warningsign', op.x - 1, y0, 1, 1, false)
          wallUsed.add(`${op.x - 1},${y0}`)
        } else if (biome === 'beverly' && oi % 2 === 0) {
          pushStruct('wallsign', sxn, syn, 1, 1, false, { text: 'Beverly Room' })
          wallUsed.add(`${sxn},${syn}`)
        }
        // 门洞正前方格禁放实心家具
        if (op.y === y0 - 1) backSet.add(`${op.x},${y0}`)
        else if (op.y === y1 + 1) backSet.add(`${op.x},${y1}`)
        else if (op.x === x0 - 1) backSet.add(`${x0},${op.y}`)
        else backSet.add(`${x1},${op.y}`)
      }

      const bcx = (x0 + x1) >> 1, bcy = (y0 + y1) >> 1 // 大厅中心
      if (biome === 'mainhall') {
        // 主厅：挑高（ceiling=1）+ 水晶吊灯 ×2 + 红木纹方柱阵（金柱头）+ 装饰横梁 + 古董沙发/茶几 +
        // 书架橱柜 + 烛台壁灯 + 盆栽 + 照片墙 + 多层地毯（红毯上叠蓝金小块）；暖金灯网
        ceilRectW(x0, y0, x1, y1)
        for (const [chx, chy] of [[bcx - 8, bcy], [bcx + 8, bcy]] as const) {
          if (!solidAtL(chx, chy)) pushStruct('chandelier', chx, chy, 1, 1, false)
          // v55（任务7/8）：吊灯正下方大半径暖光（灯具模型即吊灯本身——noFix，fixZ 贴挑高灯位 5.775−0.55）+ 挑高补光
          pushLight(chx, chy, 8.5, '#ffd9a0', { fixZ: 5.22, noFix: 1 })
        }
        for (let px = x0 + 5; px <= x1 - 4; px += 9)
          for (let py = y0 + 5; py <= y1 - 4; py += 9)
            if (!nearSpawn(px, py) && !backSet.has(`${px},${py}`)) pushStruct('redpillar', px, py, 1, 1, true)
        // 装饰横梁（吊顶格）：沿 X 横跨全厅 2 道（跨 chunk 切片推送）
        for (const by2 of [bcy - 9, bcy + 9] as const)
          pushClipped('ceilingbeam', x0, by2, x1 - x0 + 1, 1)
        if (!backSet.has(`${bcx - 3},${bcy + 2}`)) pushStruct('sofa', bcx - 3, bcy + 2, 1, 1, true, { deg: 90, color: '#8a4a52' }) // 酒红绒面
        if (!backSet.has(`${bcx + 3},${bcy + 2}`)) pushStruct('sofa', bcx + 3, bcy + 2, 1, 1, true, { deg: 270, color: '#8a4a52' })
        if (!solidAtL(bcx, bcy + 2) && !backSet.has(`${bcx},${bcy + 2}`)) pushStruct('table', bcx, bcy + 2, 1, 1, true, { vase: 1 }) // 古典雕花木桌 + 桌上花瓶（任务7/9）
        for (let sy = y0 + 4; sy <= y1 - 4; sy += 8) {
          if (!backSet.has(`${x0},${sy}`)) { pushStruct('libshelf', x0, sy, 1, 1, true); wallUsed.add(`${x0},${sy}`) }
          // v55（任务10）：主厅配电柜删除——东墙列改盆栽/沙发装饰（无 elecbox/cabinet 类）
          if (!backSet.has(`${x1},${sy}`)) {
            pushStruct(sy % 16 < 8 ? 'planter' : 'sofa', x1, sy, 1, 1, true, sy % 16 < 8 ? undefined : { deg: 270, color: '#5a8a6a' })
            wallUsed.add(`${x1},${sy}`)
          }
        }
        // 烛台壁灯 + 配套暖光（贴墙互斥：wallUsed 占位；背后是门洞的不放——浮空修复）
        for (let sx = x0 + 6; sx <= x1 - 6; sx += 10) {
          if (!backSet.has(`${sx},${y0}`) && !wallUsed.has(`${sx},${y0}`) && !opSet.has(`${sx},${y0 - 1}`)) {
            pushStruct('sconce', sx, y0, 1, 1, false)
            wallUsed.add(`${sx},${y0}`)
            pushLight(sx, y0, 2.4, '#ffcf90', { fixZ: 1.95, noFix: 1 }) // v55（任务13）：壁灯配套暖光（灯具模型=烛台自发光，光源同位贴墙）
          }
          if (!backSet.has(`${sx},${y1}`) && !wallUsed.has(`${sx},${y1}`) && !opSet.has(`${sx},${y1 + 1}`)) {
            pushStruct('sconce', sx, y1, 1, 1, false)
            wallUsed.add(`${sx},${y1}`)
            pushLight(sx, y1, 2.4, '#ffcf90', { fixZ: 1.95, noFix: 1 })
          }
        }
        // 古典肖像画（任务5：bigpainting 机制——l5_portrait1/2/3 程序绘制，贴北/南墙内侧，wallUsed 互斥 + 门洞避让）
        {
          const arts = ['l5_portrait1.png', 'l5_portrait2.png', 'l5_portrait3.png']
          let ai = h32(seed, 0x5b8, hk, hr) % 3
          for (let sx = x0 + 4; sx <= x1 - 4; sx += 8) {
            if (!backSet.has(`${sx},${y0}`) && !solidAtL(sx, y0) && !wallUsed.has(`${sx},${y0}`) && !opSet.has(`${sx},${y0 - 1}`)) {
              pushStruct('bigpainting', sx, y0, 1, 1, false, { tex: arts[ai++ % 3], pw: 1.12, ph: 1.4 })
              wallUsed.add(`${sx},${y0}`)
              pushLight(sx, y0 + 1, 2.2, '#e8d0a0', { fixZ: 2.4, noFix: 1 }) // 画框照光
            }
            if (!backSet.has(`${sx},${y1}`) && !solidAtL(sx, y1) && !wallUsed.has(`${sx},${y1}`) && !opSet.has(`${sx},${y1 + 1}`)) {
              pushStruct('bigpainting', sx, y1, 1, 1, false, { tex: arts[ai++ % 3], pw: 1.12, ph: 1.4 })
              wallUsed.add(`${sx},${y1}`)
            }
          }
        }
        // 照片墙（北/南墙内侧相框成排，photo 按瓦片哈希多变种；wallUsed 互斥 + 门洞避让）
        for (let sx = x0 + 4; sx <= x1 - 4; sx += 6) {
          if (!backSet.has(`${sx},${y0}`) && !solidAtL(sx, y0) && !wallUsed.has(`${sx},${y0}`) && !opSet.has(`${sx},${y0 - 1}`)) { pushStruct('photo', sx, y0, 1, 1, false); wallUsed.add(`${sx},${y0}`) }
          if (!backSet.has(`${sx},${y1}`) && !solidAtL(sx, y1) && !wallUsed.has(`${sx},${y1}`) && !opSet.has(`${sx},${y1 + 1}`)) { pushStruct('photo', sx, y1, 1, 1, false); wallUsed.add(`${sx},${y1}`) }
        }
        // 家常酒店标志（v55：主厅墙壁 ~30%/厅 一块；landmark 贴墙标志形，地标卡可跳转）
        if (h01(seed, 0x5c21, hk, hr) < 0.3)
          for (let sx = x0 + 5; sx <= x1 - 5; sx += 7) {
            if (backSet.has(`${sx},${y0}`) || solidAtL(sx, y0) || wallUsed.has(`${sx},${y0}`) || opSet.has(`${sx},${y0 - 1}`)) continue
            pushStruct('landmark', sx, y0, 1, 1, false, { outpost: 'homely', poster: 1, tex: 'l5_homelysign.png' })
            wallUsed.add(`${sx},${y0}`)
            break
          }
        // 多层地毯：中央红金大地毯 + 上叠蓝金小块（data.layer 抬高防 z-fight；跨 chunk 切片推送）
        pushClipped('rug', bcx - 3, bcy - 4, 6, 8)
        pushClipped('rug', bcx - 2, bcy - 2, 4, 5, { tex: 'l5_carpet.jpg', layer: 1 })
        for (const [px2, py2] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const)
          if (!backSet.has(`${px2},${py2}`) && !solidAtL(px2, py2)) pushStruct('planter', px2, py2, 1, 1, true)
        // v55（任务8）：挑高不昏暗——补充灯网加密（4 格，暖金）+ 吊灯大半径主光（见上）
        for (let x = x0 + 2; x <= x1 - 1; x += 4)
          for (let y = y0 + 2; y <= y1 - 1; y += 4) pushLight(x, y, 4.5, '#ffd9a0')
      } else if (biome === 'beverly') {
        // 贝弗莉室：挑高（ceiling=1，任务3）+ 极宽敞空旷 + 中央异形小桌（正中居位，多瓶饮料 + 未打完的麻将）+ 巨吊灯大半径暖光 + 蓝金大地毯；门洞全敞开
        ceilRectW(x0, y0, x1, y1)
        pushStruct('chandelier', bcx, bcy, 1, 1, false)
        pushLight(bcx, bcy, 8.5, '#ffe3b0', { fixZ: 5.22, noFix: 1 }) // 巨吊灯——全厅最亮（模型即灯具，光源点同位贴挑高灯位）
        pushClipped('rug', bcx - 3, bcy - 3, 7, 7, { tex: 'l5_carpet.jpg' }) // 中央金红大地毯（跨 chunk 切片推送）
        if (!solidAtL(bcx, bcy) && !backSet.has(`${bcx},${bcy}`))
          pushStruct('oddtable', bcx, bcy, 1, 1, true) // 房间矩形几何中心（取整）
        // 邀请函（原住民准入）：贝弗莉室地毯上 ~30%/厅 散落一封——v55b 起为可交互装饰结构（阅读即弹地标卡可前往）
        if (h01(seed, 0x5c22, hk, hr) < 0.3 && !solidAtL(bcx + 2, bcy + 1))
          pushStruct('invitation', bcx + 2, bcy + 1, 1, 1, false, { outpost: 'originals' })
        for (let x = x0 + 3; x <= x1 - 1; x += 5) // 稀疏暖光（空旷感；v55 加密一档——挑高不留暗区）
          for (let y = y0 + 3; y <= y1 - 1; y += 5) pushLight(x, y, 4, '#ffd9a0')
      } else if (biome === 'maintenance') {
        // 维修大厅：现代维修区——明亮灯板 + 管道桥架/电缆桥架/母线 + 配电柜；冷白充足
        for (let x = x0 + 2; x <= x1 - 1; x += 4)
          for (let y = y0 + 2; y <= y1 - 1; y += 4) {
            pushLight(x, y, 4.5, '#e8f0f2')
            if (((x + y) & 3) === 0) pushStruct('lightgrid', x, y, 1, 1, false)
          }
        for (let x = x0 + 1; x <= x1 - 1; x += 3)
          if (!backSet.has(`${x},${y0}`)) pushStruct('piperack', x, y0, 1, 1, true, { valve: h01(seed, 0x5b3, x, hk, hr) < 0.3 ? 1 : 0 })
        for (let y = y0 + 1; y <= y1 - 1; y += 3)
          if (!backSet.has(`${x1},${y}`)) pushStruct('cabletray', x1, y, 1, 1, false, { rot: 1 })
        for (let bz = y0 + 6; bz <= y1 - 6; bz += 12)
          if (!solidAtL(bcx, bz) && !backSet.has(`${bcx},${bz}`)) pushStruct('busbar', bcx - 1, bz, 3, 1, true)
        if (!backSet.has(`${x1},${y1}`) && !solidAtL(x1, y1)) pushStruct('cabinet', x1, y1, 1, 1, true, { loot: 1 })
        if (!backSet.has(`${x0},${y1}`) && !solidAtL(x0, y1)) pushStruct('foldladder', x0, y1, 1, 1, false, { deg: 90 }) // v55c（任务7）：人字折叠梯（纯装饰非攀爬）
      } else {
        // 餐厅：挑高（ceiling=1，任务3）+ 白桌布餐桌阵列 + 吊灯 ×3 + 蓝金中央长毯 + 舞台角（东南角台口两张桌 + 角上烛台；桌子不压角格邻位——防 1 格孤岛）
        ceilRectW(x0, y0, x1, y1)
        pushClipped('rug', bcx - 1, y0 + 2, 3, y1 - y0 - 3, { tex: 'l5_carpet.jpg' })
        for (let x = x0 + 2; x <= x1 - 2; x += 3)
          for (let y = y0 + 2; y <= y1 - 2; y += 3)
            if (!nearSpawn(x, y) && !backSet.has(`${x},${y}`)) pushStruct('dtable', x, y, 1, 1, true)
        for (const [chx, chy] of [[bcx - 9, bcy], [bcx, bcy], [bcx + 9, bcy]] as const) {
          if (!solidAtL(chx, chy)) pushStruct('chandelier', chx, chy, 1, 1, false)
          pushLight(chx, chy, 8, '#ffe3b0', { fixZ: 5.22, noFix: 1 }) // 吊灯大半径主光（模型即灯具）
        }
        if (!solidAtL(x1 - 2, y1) && !backSet.has(`${x1 - 2},${y1}`)) pushStruct('table', x1 - 2, y1, 1, 1, true)
        if (!solidAtL(x1, y1 - 2) && !backSet.has(`${x1},${y1 - 2}`)) pushStruct('table', x1, y1 - 2, 1, 1, true)
        if (!solidAtL(x1, y1) && !backSet.has(`${x1},${y1}`)) pushStruct('candlestand', x1, y1, 1, 1, false)
        for (let x = x0 + 2; x <= x1 - 1; x += 4) // v55（任务8）：餐厅补光加密（挑高不昏暗）
          for (let y = y0 + 2; y <= y1 - 1; y += 4) pushLight(x, y, 4, '#ffd9a0')
      }
    }
  }

  // ---- 房间街区（五类房间；大厅格内的街区跳过）----
  for (let k = kMin; k <= kMax; k++) {
    for (let r = rMin; r <= rMax; r++) {
      if (l5HallAt(seed, k >> 1, r >> 1)) continue
      const { x0, x1, y0, y1 } = blockRect(seed, k, r)
      if (x1 < WX - 8 || x0 > WX + CS + 8 || y1 < WY - 8 || y0 > WY + CS + 8) continue
      const biome = ((forceVariant && !L5_HALLS.includes(forceVariant) ? forceVariant : l5BlockBiome(seed, k, r))) as L5Room
      carveRectW(x0, y0, x1, y1)
      // v55：房间地面 tint 分色（客房/休息室暖毯 22、泳池瓷砖 23、锅炉房深色 24、健身房灰蓝 26）
      tintRectW(x0, y0, x1, y1, biome === 'pool' ? 23 : biome === 'boilerroom' ? 24 : biome === 'gym' ? 26 : 22)
      const backSet = new Set<string>()
      const openings = blockOpenings(seed, k, r)
      // 门洞正前方格（房内第一格）禁放实心家具——否则门被堵死、房间成孤岛（v54 据点铁律同款）
      for (const op of openings) {
        if (op.y === y0 - 1) backSet.add(`${op.x},${y0}`)
        else if (op.y === y1 + 1) backSet.add(`${op.x},${y1}`)
        else if (op.x === x0 - 1) backSet.add(`${x0},${op.y}`)
        else backSet.add(`${x1},${op.y}`)
      }
      // 客房房门掷点助手：~0.5% 深色木门（→Level 9，替代正常房门）/ 其余 75% 装 hoteldoor（25% 上锁可撬——保留有限 L5 房门锁机制）
      const guestDoor = (x: number, y: number, salt: number) => {
        const roll = h01(seed, salt, k, r)
        if (darkDoorDef && roll < 0.003 && !nearSpawn(x, y)) {
          if (inChunk(x, y) && !exits.some((e) => Math.floor(e.x) === x && Math.floor(e.y) === y)) {
            exits.push({ def: darkDoorDef, x, y, discovered: false }) // 锚点瓦片归属 chunk 推送（跨 chunk 恰 1 个）
            pushStruct('darkdoorblock', x, y, 1, 1, true) // v55：关闭时不可穿——实心碰撞块（仅碰撞无模型；E 交互切层不变）
          }
          return
        }
        if (roll < 0.755 && !nearSpawn(x, y))
          pushStruct('hoteldoor', x, y, 1, 1, true, { open: 0, hue: h32(seed, salt + 1, k, r) % 5, locked: h01(seed, salt + 2, k, r) < 0.25 ? 1 : 0 })
      }
      for (const op of openings) {
        carveRectW(op.x, op.y, op.x, op.y)
        if (biome === 'guestroom') guestDoor(op.x, op.y, op.salt)
        else if (h01(seed, op.salt, k, r) < 0.5 && !nearSpawn(op.x, op.y))
          pushStruct('hoteldoor', op.x, op.y, 1, 1, true, { open: 0, hue: h32(seed, op.salt + 1, k, r) % 5 })
      }

      const bcx = (x0 + x1) >> 1, bcy = (y0 + y1) >> 1 // 街区中心
      if (biome === 'guestroom') {
        // 客房区：2×2 小房间（内墙 + 每半墙 1 门洞互通；床/梳妆台/桌/椅；每室一灯）
        const xm = (x0 + x1) >> 1, ym = (y0 + y1) >> 1
        wallRectW(xm, y0, xm, y1)
        wallRectW(x0, ym, x1, ym)
        const hx1 = xm, hy1 = y0 + 1 + (h32(seed, 0x5e1, k, r) % Math.max(1, ym - y0 - 1)) // 竖墙门洞（上）
        const hx2 = xm, hy2 = ym + 1 + (h32(seed, 0x5e2, k, r) % Math.max(1, y1 - ym - 1)) // 竖墙门洞（下）
        const hx3 = x0 + 1 + (h32(seed, 0x5e3, k, r) % Math.max(1, xm - x0 - 1)), hy3 = ym // 横墙门洞（左）
        const hx4 = xm + 1 + (h32(seed, 0x5e4, k, r) % Math.max(1, x1 - xm - 1)), hy4 = ym // 横墙门洞（右）
        for (const [hx, hy, hsalt] of [[hx1, hy1, 0x5e5], [hx2, hy2, 0x5e6], [hx3, hy3, 0x5e7], [hx4, hy4, 0x5e8]] as const) {
          carveRectW(hx, hy, hx, hy)
          guestDoor(hx, hy, hsalt) // 内门同掷点（~0.5% 深色木门 / 75% 房门 25% 上锁）
        }
        // 内门正前方两格同样禁放实心家具（客房内门洞防堵）
        for (const [fx, fy] of [[xm - 1, hy1], [xm + 1, hy1], [xm - 1, hy2], [xm + 1, hy2], [hx3, ym - 1], [hx3, ym + 1], [hx4, ym - 1], [hx4, ym + 1]] as const)
          backSet.add(`${fx},${fy}`)
        const rooms: [number, number, number, number][] = [
          [x0, y0, xm - 1, ym - 1], [xm + 1, y0, x1, ym - 1], [x0, ym + 1, xm - 1, y1], [xm + 1, ym + 1, x1, y1],
        ]
        for (let ri = 0; ri < 4; ri++) {
          const [rx0, ry0, rx1, ry1] = rooms[ri]
          if (rx1 - rx0 < 2 || ry1 - ry0 < 2) continue
          // 床（里侧墙边 1×2，床头靠墙——data.deg 显式朝向见任务8床朝向助手）+ 梳妆台（loot）+ 50% 桌 + 40% 休闲椅
          const bedN = h01(seed, 0x5ea + ri, k, r) < 0.5 // 床贴北/南墙
          const bx = rx0 + (h32(seed, 0x5eb + ri, k, r) % Math.max(1, rx1 - rx0))
          const by = bedN ? ry0 : ry1 - 1
          if (!nearSpawn(bx, by) && !solidAtL(bx, by) && !solidAtL(bx, by + 1) && !backSet.has(`${bx},${by}`) && !backSet.has(`${bx},${by + 1}`))
            pushStruct('bed', bx, by, 1, 2, true, { deg: bedN ? 180 : 0 }) // 床头朝墙（北墙床床头朝北=deg180；南墙床朝南=deg0）
          const dx2 = bedN ? rx1 : rx0, dy2 = bedN ? ry0 : ry1
          if (!solidAtL(dx2, dy2) && !backSet.has(`${dx2},${dy2}`)) pushStruct('dresser', dx2, dy2, 1, 1, true, { loot: 1 })
          const tx2 = (rx0 + rx1) >> 1, ty2 = (ry0 + ry1) >> 1
          pushClipped('rug', tx2 - 1, ty2 - 1, 2, 2) // 客房小块红金地毯（床/桌下）
          if (h01(seed, 0x5ec + ri, k, r) < 0.5 && !solidAtL(tx2, ty2) && !backSet.has(`${tx2},${ty2}`)) {
            pushStruct('table', tx2, ty2, 1, 1, true)
            if (h01(seed, 0x5ed + ri, k, r) < 0.4 && !solidAtL(tx2 + 1, ty2) && !backSet.has(`${tx2 + 1},${ty2}`))
              pushStruct('loungechair', tx2 + 1, ty2, 1, 1, false, { color: '#7a5a3a' })
          }
          pushLight(Math.floor((rx0 + rx1) / 2), Math.floor((ry0 + ry1) / 2), 3.6, '#ffd9a0')
        }
      } else if (biome === 'lounge') {
        // 休息室：1920 风沙发/休闲椅/茶几 + 留声机 + 烛台 + 壁灯 + 红金地毯（昏暖）
        pushClipped('rug', bcx - 2, bcy - 2, 5, 4)
        if (!backSet.has(`${bcx - 2},${bcy}`)) pushStruct('sofa', bcx - 2, bcy, 1, 1, true, { deg: 90, color: '#5a8a6a' })
        if (!backSet.has(`${bcx + 2},${bcy}`)) pushStruct('loungechair', bcx + 2, bcy, 1, 1, false, { color: '#8a4a52' })
        if (!backSet.has(`${bcx + 2},${bcy + 2}`)) pushStruct('loungechair', bcx + 2, bcy + 2, 1, 1, false, { color: '#5a76b8' })
        if (!solidAtL(bcx, bcy) && !backSet.has(`${bcx},${bcy}`)) pushStructSid('table', bcx, bcy, 1, 1, true, { drink: 1 }) // 茶几（桌上饮料可拿取，任务20；sid 持久化取走态）
        if (!backSet.has(`${x0},${y0}`) && !solidAtL(x0, y0)) pushStructSid('phonograph', x0, y0, 1, 1, true, { on: 1 }) // 留声机（播放中；sid 持久化启停态）
        if (!backSet.has(`${x1},${y0}`) && !solidAtL(x1, y0)) pushStruct('candlestand', x1, y0, 1, 1, false)
        if (!backSet.has(`${x0},${bcy + 3}`)) pushStruct('sconce', x0, bcy + 3, 1, 1, false)
        pushLight(bcx, bcy, 3.4, '#ffcf90')
        pushLight(x0 + 1, y0 + 1, 2.6, '#ffbf80')
      } else if (biome === 'gym') {
        // 健身房：现代风——卧推凳 + 跑步机/哑铃架/动感单车（v55 任务19）+ 储物柜排 + 明亮灯板（冷白）
        if (!backSet.has(`${x0 + 2},${y0 + 2}`) && !solidAtL(x0 + 2, y0 + 2)) pushStruct('treadmill', x0 + 2, y0 + 2, 1, 1, true, { deg: 0 })
        if (!backSet.has(`${x0 + 5},${y0 + 2}`) && !solidAtL(x0 + 5, y0 + 2)) pushStruct('spinbike', x0 + 5, y0 + 2, 1, 1, true, { deg: 0 })
        if (!backSet.has(`${bcx},${y1}`) && !solidAtL(bcx, y1)) pushStruct('dumbbellrack', bcx - 1, y1, 2, 1, true)
        for (let i = 0, n = 1 + (h32(seed, 0x5b4, k, r) % 2); i < n; i++) {
          const gx = x0 + 2 + ((h32(seed, 0x5b5 + i, k, r) % Math.max(1, x1 - x0 - 4)))
          const gy = y0 + 5 + i * 3
          if (gy > y1 - 2) break
          if (!nearSpawn(gx, gy) && !solidAtL(gx, gy) && !backSet.has(`${gx},${gy}`))
            pushStruct('gymbench', gx, gy, 1, 1, true, { deg: 0 })
        }
        for (let x = x1; x >= x1 - 2; x--)
          if (!backSet.has(`${x},${y0}`) && !solidAtL(x, y0)) pushStruct('locker', x, y0, 1, 1, true, { loot: 1 })
        for (let x = x0 + 2; x <= x1 - 1; x += 4)
          for (let y = y0 + 2; y <= y1 - 1; y += 4) {
            pushLight(x, y, 4.5, '#eef2f0')
            if (((x + y) & 3) === 1) pushStruct('lightgrid', x, y, 1, 1, false)
          }
      } else if (biome === 'pool') {
        // 游泳池：室内泳池（浅水缘 liquid=2 / 深水心 liquid=1）+ 瓷砖湿区 + 扶梯 ×2 + 深水端跳台；青白冷光
        const px0 = x0 + 2, px1 = x1 - 2, py0 = y0 + 2, py1 = y1 - 2 // 池体（四周留 2 格走道，不堵门洞）
        liquidRectW(px0, py0, px1, py1, 2)
        liquidRectW(px0 + 2, py0 + 2, px1 - 2, py1 - 2, 1)
        wetRectW(px0 - 1, py0 - 1, px1 + 1, py1 + 1, 1)
        // 扶梯：池缘南北各一（非实心；格=池缘外走道贴池格）
        pushStruct('poolladder', px0 + 1, py0 - 1, 1, 1, false, { deg: 180 })
        pushStruct('poolladder', px1 - 1, py1 + 1, 1, 1, false, { deg: 0 })
        // 跳台：深水端（南缘中点走道格，朝向池心）
        const dbx = (px0 + px1) >> 1
        if (!backSet.has(`${dbx},${py1 + 1}`)) pushStruct('divingboard', dbx, py1 + 1, 1, 1, true, { deg: 0 })
        // v55（任务9）：泳池灯位加密——四角 + 池长边中点 + 顶灯（冷白青，配水面观感，不留暗角）
        pushLight(bcx - 2, bcy, 5, '#bfe0e8')
        pushLight(bcx + 2, bcy, 5, '#bfe0e8')
        for (const [lx2, ly2] of [[px0 - 1, py0 - 1], [px1 + 1, py0 - 1], [px0 - 1, py1 + 1], [px1 + 1, py1 + 1]] as const)
          pushLight(lx2, ly2, 4.2, '#cfe8ee')
      } else {
        // 锅炉房（v55 任务18：缩小街区——内腔回砌两圈成厚墙小室，门洞凿 2 深门洞隧道；
        // v55c 任务8：取消机器代墙——一律回砌厚墙，机器只作内容摆放；每片至多一扇黑门[l5BoilerRoot]，贴墙放置；
        // 可通行性由 l5inf-smoke「锅炉房内 BFS 可走遍 + 门洞可达」离线断言兜底）：
        // 管道丛林（piperack + pipes/valve 散件 + manifold 集汽包）+ boiler/sphboiler 机组 + furnace 熔炉 + 靠墙装饰梯；暖琥珀微光
        const ix0 = x0 + 2, iy0 = y0 + 2, ix1 = x1 - 2, iy1 = y1 - 2 // 内腔（~9×10）
        wallRectW(x0, y0, x1, y0 + 1)
        wallRectW(x0, y1 - 1, x1, y1)
        wallRectW(x0, y0, x0 + 1, y1)
        wallRectW(x1 - 1, y0, x1, y1)
        for (const op of openings) { // 门洞隧道（2 深）+ 隧道口正前方格禁放实心家具
          if (op.y === y0 - 1) { carveRectW(op.x, y0, op.x, y0 + 1); backSet.add(`${op.x},${iy0}`) }
          else if (op.y === y1 + 1) { carveRectW(op.x, y1 - 1, op.x, y1); backSet.add(`${op.x},${iy1}`) }
          else if (op.x === x0 - 1) { carveRectW(x0, op.y, x0 + 1, op.y); backSet.add(`${ix0},${op.y}`) }
          else { carveRectW(x1 - 1, op.y, x1, op.y); backSet.add(`${ix1},${op.y}`) }
        }
        const icx = (ix0 + ix1) >> 1, icy = (iy0 + iy1) >> 1
        for (let x = ix0; x <= ix1; x += 2)
          if (!backSet.has(`${x},${iy0}`)) pushStruct('piperack', x, iy0, 1, 1, true, { valve: h01(seed, 0x5b7, x, k, r) < 0.35 ? 1 : 0 })
        for (let y = iy0 + 1; y <= iy1 - 1; y += 3) {
          if (!backSet.has(`${ix0},${y}`)) pushStruct('pipes', ix0, y, 1, 1, false)
          if (!backSet.has(`${ix1},${y}`)) pushStruct('pipes', ix1, y, 1, 1, false)
        }
        if (!backSet.has(`${icx},${icy - 2}`) && !solidAtL(icx - 1, icy - 2) && !solidAtL(icx, icy - 2) && !solidAtL(icx + 1, icy - 2))
          pushStruct('manifold', icx - 1, icy - 2, 3, 1, true) // 集汽包居中（不贴管架行——管架间隙格被围死会成 1 格孤岛）
        if (!solidAtL(icx - 2, icy) && !backSet.has(`${icx - 2},${icy}`)) pushStruct('boiler', icx - 2, icy, 1, 1, true)
        if (!solidAtL(icx + 1, icy) && !backSet.has(`${icx + 1},${icy}`) && !backSet.has(`${icx + 2},${icy + 1}`)) pushStruct('sphboiler', icx + 1, icy, 2, 2, true)
        // 熔炉（贴东墙；东北内角常被管架/门前格占用——东墙中部落位，让位则下移一格）
        if (!backSet.has(`${ix1},${icy - 1}`) && !solidAtL(ix1, icy - 1)) pushStruct('furnace', ix1, icy - 1, 1, 1, true)
        else if (!backSet.has(`${ix1},${icy + 1}`) && !solidAtL(ix1, icy + 1)) pushStruct('furnace', ix1, icy + 1, 1, 1, true)
        if (!backSet.has(`${ix0},${iy1}`) && !solidAtL(ix0, iy1)) pushStruct('foldladder', ix0, iy1, 1, 1, false, { deg: 90 }) // 人字折叠梯（任务7，纯装饰非攀爬）
        if (!backSet.has(`${ix1},${icy + 2}`)) pushStruct('valve', ix1, icy + 2, 1, 1, false)
        // 深处完全黑暗的门（boilerdeep → Level 6）：距全部门洞最远的可放置内角，无灯（灯下避让见下）
        const corners = ([[ix0, iy0], [ix1, iy0], [ix0, iy1], [ix1, iy1]] as const)
          .map(([ccx, ccy]) => {
            let dmin = 1e9
            for (const op of openings) dmin = Math.min(dmin, Math.abs(op.x - ccx) + Math.abs(op.y - ccy))
            return { ccx, ccy, dmin }
          })
          .sort((a, b) => b.dmin - a.dmin)
        let ddx = corners[0].ccx, ddy = corners[0].ccy
        for (const c of corners) { // 最远优先，首个可放置角（实心/回砌/已占则让位次远角）
          if (!solidAtL(c.ccx, c.ccy) && !backSet.has(`${c.ccx},${c.ccy}`)
            && !exits.some((e) => Math.floor(e.x) === c.ccx && Math.floor(e.y) === c.ccy)) { ddx = c.ccx; ddy = c.ccy; break }
        }
        if (boilerDef && l5BoilerRoot(seed, k, r) && inChunk(ddx, ddy)) // v55b：每片至多一扇黑门（仅片根街区内放置；角落=贴墙）
          exits.push({ def: boilerDef, x: ddx, y: ddy, discovered: false })
        // 暖琥珀稀疏灯网——距黑门 5 格内不设灯（完全黑暗）
        for (let x = ix0 + 1; x <= ix1 - 1; x += 4)
          for (let y = iy0 + 1; y <= iy1 - 1; y += 4)
            if (Math.abs(x - ddx) + Math.abs(y - ddy) > 5) pushLight(x, y, 3.2, '#e8a860')
      }
    }
  }

  // ---- 走廊灯网（暖金，竖廊/横廊每 7 格一盏；落在大厅内腔的跳过——大厅有自己的灯网）----
  // 走廊地毯由 tint 21 地形网格以世界 UV 连续渲染；不再叠加 rug runner，避免横竖交汇处
  // 两个共面平面 z-fighting 和不同长宽比造成的纹样拉伸。顶部灯带仍每 4 格排列。
  for (let k = kMin; k <= kMax; k++) {
    const kx = l5CorrX(seed, k), off = h32(seed, 0x5c11, k) % 7
    if (kx + 1 < WX || kx + 1 > WX + CS - 1) continue
    for (let y = WY - (WY % 7) + off; y < WY + CS; y += 7)
      if (l5RegionAt(seed, kx + 1, y)?.variant == null) pushLight(kx + 1, y, 4.2, '#ffd9a0')
    const roff = h32(seed, 0x5c13, k) % 8
    for (let y = WY - (WY % 8) + roff; y < WY + CS; y += 8) {
      if (l5RegionAt(seed, kx + 1, y + 3)?.variant != null || l5RegionAt(seed, kx + 1, y)?.variant != null) continue
      if (((y >> 3) & 1) === 0) pushStruct('lightgrid', kx + 1, y + 4, 1, 1, false) // 顶部灯带
    }
  }
  for (let r = rMin; r <= rMax; r++) {
    const ry = l5RowY(seed, r), off = h32(seed, 0x5c12, r) % 7
    if (ry < WY || ry > WY + CS - 1) continue
    for (let x = WX - (WX % 7) + off; x < WX + CS; x += 7)
      if (l5RegionAt(seed, x, ry)?.variant == null) pushLight(x, ry, 4.2, '#ffd9a0')
    const roff = h32(seed, 0x5c14, r) % 8
    for (let x = WX - (WX % 8) + roff; x < WX + CS; x += 8) {
      if (l5RegionAt(seed, x + 3, ry)?.variant != null || l5RegionAt(seed, x, ry)?.variant != null) continue
      if (((x >> 3) & 1) === 0) pushStruct('lightgrid', x + 4, ry, 1, 1, false)
    }
  }

  // ---- 出口 ①：电梯（→L3 免费回程；主厅壁龛槽位：每 8×8 超区域 1 槽位 + 出生 chunk 保底）----
  // 嵌墙同 L4 壁龛槽位法；槽位瓦片归属哪个 chunk 就由哪个 chunk 推出口（恰 1 个）。
  const elevDef = findExitDef('elevatorshaft')
  if (elevDef) {
    for (const [key] of slotMap) {
      const [sx, sy] = key.split(',').map(Number)
      if (!inChunk(sx, sy)) continue // 非本 chunk 归属——由所属 chunk 推
      if (exits.some((e) => Math.floor(e.x) === sx && Math.floor(e.y) === sy)) continue
      exits.push({ def: elevDef, x: sx, y: sy, discovered: false })
      pushLight(sx - WX, sy - WY, 2.5, '#f5e37a')
    }
  }

  // ---- 出口 ②：年久失修的古典楼梯（oldstairs → Level 4；8×8 超区域 ~55% 宿主 + 出生 chunk 保底 1 部）----
  // 出生 chunk 保底：玩家从 L4 经古典楼梯进 L5 的落点楼梯（engine loadLevel 把出生点放到楼梯 2 格外空旷地板）
  {
    const oldDef = findExitDef('oldstairs')
    const rx = Math.floor(cx / RS), ry = Math.floor(cy / RS)
    const host = regionHost(seed, rx, ry)
    const hosted = oldDef && host.cx === cx && host.cy === cy && h01(seed, 0x5e82, rx, ry) < 0.55
    const spawnHosted = oldDef && cx === 0 && cy === 0
    if (hosted || spawnHosted) {
      // 楼梯位：邻墙地板 + 反侧 4 格畅通（可行走阶梯机制硬要求；与 L0/L4/dev 召唤同判据）
      const runOk = (x: number, y: number): number[] | null => {
        for (const [wx2, wy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (isF(x + wx2, y + wy2)) continue
          let clear = true
          for (let s2 = 1; s2 <= 4; s2++) if (!isF(x - wx2 * s2, y - wy2 * s2) || solidAtL(WX + x - wx2 * s2, WY + y - wy2 * s2)) { clear = false; break }
          if (clear) return [wx2, wy2]
        }
        return null
      }
      let spot: { x: number; y: number; dir: number[] } | null = null
      const saltBase = spawnHosted ? 0x5e73 : 0x5e71
      for (let i = 0; i < 80 && !spot; i++) {
        const x = 4 + (h32(seed, saltBase + i * 7, cx, cy) % (CS - 8))
        const y = 4 + (h32(seed, saltBase + i * 7 + 3, cx, cy) % (CS - 8))
        if (!isF(x, y) || solidAtL(WX + x, WY + y) || nearSpawn(WX + x, WY + y)) continue
        if (isF(x + 1, y) && isF(x - 1, y) && isF(x, y + 1) && isF(x, y - 1)) continue // 需邻墙
        if (exits.some((e) => Math.floor(e.x) === WX + x && Math.floor(e.y) === WY + y)) continue
        const dir = runOk(x, y)
        if (!dir) continue
        // 入梯口净空——楼梯格至少一侧横邻是地板（侧向登梯口），井口段另有 stairrail 护栏
        if (!isF(x + dir[1], y + dir[0]) && !isF(x - dir[1], y - dir[0])) continue
        spot = { x, y, dir }
      }
      if (spot) {
        exits.push({ def: oldDef!, x: WX + spot.x, y: WY + spot.y, discovered: false })
        pushLight(spot.x, spot.y, 2.5, '#c9a24a') // 暖金微光（与电梯黄区分）
        // 下行走向 3 格标为深渊洞口（elev=4，视觉开洞；同 L0/L4 先例）
        for (let s2 = 1; s2 <= 3; s2++) elev[li(spot.x - spot.dir[0] * s2, spot.y - spot.dir[1] * s2)] = 4
        // 井口护栏碰撞（stairrail 仅碰撞无模型；侧栏杆沿洞口两侧、尽头横栏——入梯口留在楼梯格两侧）
        const railDeg = Math.round((Math.atan2(spot.dir[0], spot.dir[1]) * 180) / Math.PI)
        for (let k2 = 1; k2 <= 3; k2++)
          pushStruct('stairrail', WX + spot.x - spot.dir[0] * k2, WY + spot.y - spot.dir[1] * k2, 1, 1, true,
            { deg: railDeg, end: k2 === 3 ? 1 : 0 }) // 注意世界坐标（spot 是 chunk 局部）
      }
    }
  }

  // ---- 定居点地标（v55：L5 三据点）----
  // ① 告示（家政服务哨所）：走廊墙 ~1.5%/chunk，贴墙校验同 L4 海报地标；出生 chunk 跳过
  if (!(cx === 0 && cy === 0) && rng.chance(0.015)) {
    for (let t = 0; t < 40; t++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(WX + x, WY + y) || nearSpawn(WX + x, WY + y)) continue
      if (l5RegionAt(seed, WX + x, WY + y)?.variant != null) continue // 只贴走廊墙
      const wE = !isF(x + 1, y), wW = !isF(x - 1, y), wS = !isF(x, y + 1), wN = !isF(x, y - 1)
      if (!(wE || wW || wS || wN)) continue // 必须有邻侧墙（贴墙不浮空）
      if ((wE && wW) || (wS && wN)) continue // 狭窄贯通位不挂（同 L3/L4 既有约束）
      pushStruct('landmark', WX + x, WY + y, 1, 1, false, { outpost: 'housekeeping', poster: 1, tex: 'l5_notice.png' })
      break
    }
  }

  // ---- 物品（酒店杂物：银餐具/镇静剂/万能钥匙；每 chunk 1~2 地面物品）----
  {
    const pool2 = [...def.items, ...UNIVERSAL_ITEMS]
    for (let i = 0, n = rng.int(1, 2); i < n; i++) {
      const t = rng.weighted(pool2.map((p) => ({ v: p.type, w: p.w })))
      for (let tr = 0; tr < 30; tr++) {
        const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
        if (!isF(x, y) || solidAtL(WX + x, WY + y) || nearSpawn(WX + x, WY + y)) continue
        pushItem(t, WX + x, WY + y)
        break
      }
    }
  }

  // ---- 实体（低密度：~1.2%/chunk 按 def.entities 权重[死亡飞蛾最高] + 0.5% 死亡飞蛾单列[主巢]；
  //      合计 ~1.7%/chunk 明显低于其他层；出生安全区 |cx|,|cy|≤1 不生成。
  //      v55 定稿：死亡飞蛾集群 2~4 只一小群；窃皮者带 human 伪装标记[渲染层按 L5 给酒店侍者形象]；
  //      池含 Nguithr'xurh 与尸鼠[渲染层按 L5 给正装变种]）----
  if (def.entities.length > 0 && (Math.abs(cx) > 1 || Math.abs(cy) > 1)) {
    const drop = (t: string, human = false) => {
      for (let tr = 0; tr < 40; tr++) {
        const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
        if (!isF(x, y) || solidAtL(WX + x, WY + y) || liquid[li(x, y)]) continue // 不落泳池水面
        entities.push({ type: t, x: WX + x + 0.5, y: WY + y + 0.5, ...(human ? { human: 1 as const } : {}) })
        return { x, y }
      }
      return null
    }
    const dropNear = (t: string, cx0: number, cy0: number) => { // 集群伴生：首领 3 格内落位
      for (let tr = 0; tr < 20; tr++) {
        const x = cx0 + rng.int(-3, 3), y = cy0 + rng.int(-3, 3)
        if (x < 2 || y < 2 || x > CS - 3 || y > CS - 3) continue
        if (!isF(x, y) || solidAtL(WX + x, WY + y) || liquid[li(x, y)]) continue
        entities.push({ type: t, x: WX + x + 0.5, y: WY + y + 0.5 })
        return true
      }
      return false
    }
    if (h01(seed, 0x5e91, cx, cy) < 0.006) {
      const t = rng.weighted(def.entities.map((e) => ({ v: e.type, w: e.w })))
      const first = drop(t, t === 'skinstealer')
      if (t === 'deathmoth' && first) // 主巢集群：首领落下后 1~3 只伴生（3 格内）
        for (let i = 0, n = 1 + (h32(seed, 0x5e93, cx, cy) % 3); i < n; i++) dropNear('deathmoth', first.x, first.y)
    }
    if (def.entities.some((e) => e.type === 'deathmoth') && h01(seed, 0x5e92, cx, cy) < 0.0025) {
      const first = drop('deathmoth') // 主巢单列（集群规模更小：1~2 只）
      if (first && h01(seed, 0x5e94, cx, cy) < 0.5) dropNear('deathmoth', first.x, first.y)
    }
  }

  const variant = forceVariant ?? l5VariantOf(seed, cx, cy)
  // v58：电梯门碰撞体积——每个电梯出口壁龛格补一个仅碰撞结构（玩家/实体不再嵌进门扇平面；
  // 放在全部生成决策之后，避免影响 solidAtL 等放置判定）
  for (const e of exits) if (e.def.kind === 'elevatorshaft') pushStruct('elevdoor', e.x, e.y, 1, 1, true, { noSight: 1 })
  return { variant, tiles, wet, elev, step, tint, crawl, outdoor, ceiling, liquid, structures, items, lights, exits, entities }
}

// ---------- 注册（mapgen generateLevel → generateInfinite 经注册表分派）----------
registerInfiniteLevel(5, {
  genRaw: genL5ChunkRaw,
  variantOf: l5VariantOf,
  rareVariants: L5_RARE_VARIANTS,
  variantNames: L5_VARIANT_NAMES,
  variantLore: L5_VARIANT_LORE,
})
