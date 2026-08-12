// ================= v51：Level 3「发电站」无限 chunk 生成 =================
// 布局基调：不规则廊道网——竖直（南北向）廊道宽 1~4 瓦片（逐区块变化，1 宽=一人宽砖砌隧道，
// 两侧尽是砖墙、灯光微弱），横向（东西向）连廊高 2~3 周期性接通；部分竖直廊道区块缺席（长短不一）。
// 全部走向由「世界坐标确定性函数」决定（廊道列位置 corrX(k)、段宽 corrW(k,r)、横道行位置 rowY(r)、
// 服役判定 serve(k,r)），相邻 chunk 天然对齐缝合。
// 铁栅栏：部分竖直廊道段被整段铁栅栏封死（barfence：无门、不可破坏、不可通行——另一侧可见不可达）；
// 部分栅栏带可交互栅栏门（bargate）。出生安全区（|k|≤1 且 |r|≤1）与横道 ±5 内不设栅栏。
// 变体（chunk 级）：照明廊道/晦暗廊道按群系噪声聚集；四种「特征房间」chunk（wikidot：四类房间位于
// 过道各处，存放本层级大部分稀缺资源，装配线数量尤为突出）——装配线 ~3.0% / 发电室 ~1.6% /
// 锅炉房 ~1.6% / 圣所 ~0.5%。房间 chunk=整间围合房间（28×28 内腔 + 2 格墙缘；廊道止于墙环，
// 门洞 1~2 宽、半数铁栅栏门），内容高密度按房型布置；走既有变种房间机制（dev 传送/区域名显示）。
// 墙面装饰：配电箱（elecbox，可搜索容器，附近有电流嗡鸣）/电缆线束（cables，沿墙顶走线拐上天花板）；
// 宽廊道侧墙偶有机器壁龛（发电机/配电柜/管道/阀门）与电缆沟（trench）。
// 开阔厅：服役廊道段 ~7% 在一侧带出小片矩形开阔区（6~10 深 × 5~9 长），零星机器与灯光，空旷感。
// 雕像与宗教画：无门的整段铁栅栏之后 ~22% 立一尊风化的希腊女像（栏后 1~3 格、廊道中线，孤立展品）；
// 栏后墙上偶见白色画布状天使宗教画（angel_fresco，大多位于栅栏之后——wikidot）。
// 圣所=tint 20 苍白圣石地面（砖墙保留）+ 大理石柱 + 大型天使像；唯一天然避实体庇护所——
// 实体畏惧天使雕像，不进入圣所 chunk 及其八邻（含入口走廊）。
// 物资：全后室最富——每 chunk 2~4 地面物品 + 1~2 容器 + 火盐/磁带/湿地旱虾。
import { RNG } from '../core/rng'
import { UNIVERSAL_ITEMS } from '../content/items'
import type { LevelDef, Structure, LightSource, ExitInstance, GroundItem } from '../core/types'
import { CS, h32, GEN_ITEM_BASE, exitTarget } from './infinite' // v54：出口改用 L3 专属 RS3/regionHost3（RS/regionHost 留给 L0/L1）
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'

// ---------- 变体 ----------
export type L3Variant = 'lit' | 'dark' | 'assembly' | 'genhall' | 'boiler' | 'sanct'
export const L3_VARIANT_NAMES: Record<L3Variant, string> = {
  lit: '照明廊道', dark: '晦暗廊道',
  assembly: '装配线', genhall: '发电室', boiler: '锅炉房', sanct: '圣所',
}
// 区段档案（图鉴；设定依据 wikidot/Fandom Level 3「Electrical Station」条目衍生的区域化演绎）
export const L3_VARIANT_LORE: Record<string, string[]> = {
  lit: [
    '照明廊道——荧光灯沿廊道整齐排布，光线昏暗却井然有序。砖墙上配电箱低声嗡鸣，电缆线束沿墙顶爬上天花板，像这座电站从未熄灭的脉搏。',
    '档案提醒：灯亮着不代表有人在维护。Level 3 的电网自行运转了无法考证的年头——嗡鸣最响的地方，往往也是实体最常巡逻的地方。',
  ],
  dark: [
    '晦暗廊道——灯稀疏到十几步才有一盏，光圈之间的黑暗浓得像固体。砖墙吸走手电的光，你只能听见远处配电箱的电流声和自己的脚步。',
    '档案建议：在晦暗区段，笑魇与电弧体的目击报告显著增多。贴着有灯的一侧走，别在黑暗里停留——这里的黑暗不属于你。',
  ],
  assembly: [
    '装配线——极为开阔的工厂式房间：长传送带一排排延伸，带上还散落着板材与零件，吊装荧光灯把这里照成全层级最亮的地方。本层级大部分稀缺物资都堆在这类房间里。',
    '档案警告：实体经常进入这些房间——而且它们知道人类也会这样做。捡物资时别看传送带，看门。',
  ],
  genhall: [
    '发电室——幽暗的电气设备大厅：主发电机低沉轰鸣，母线龙门架横跨头顶，铜排与成束粗缆在绝缘子串之间延伸。杏仁水与火盐在这里较大量出现。',
    '档案提醒：设备大多仍在运转。别碰铜排，别倚龙门架——嗡鸣最响的角落，电弧随时可能劈下来。',
  ],
  boiler: [
    '锅炉房——铆接的黄铜球罐在暖黄的昏暗里起伏，管道丛林爬满砖墙。研究人员推测：层级管道里流淌的神秘黑色液体，正是这些锅炉产生的。',
    '档案建议：别尝排水沟里的东西。别问为什么需要排水沟。',
  ],
  sanct: [
    '圣所——希腊-罗马式大教堂室内：大理石列柱、散落一地的倒塌柱身、砖墙上的天使宗教画，以及中央那尊吹着长号角的大型天使铜像。长椅、钢琴、管风琴——大教堂该有的东西全都明显缺失。',
    '这是本层级唯一天然的避实体庇护所：所有实体看到天使雕像都会恐惧惊慌，大多数时候它们甚至不会进入包含圣所入口的走廊。雕像坚不可摧，无法移动。',
  ],
}
export const L3_RARE_VARIANTS: readonly string[] = ['assembly', 'genhall', 'boiler', 'sanct']

const h01 = (...n: number[]) => h32(...n) / 4294967296

// ---------- 变体判定（群系式聚集，同 L1/L2 的低频值噪声群系图）----------
const BIOME_S = 5 // 群系尺度（chunk）
const biomeSmooth = (t: number) => t * t * (3 - 2 * t)
function biomeNoise(seed: number, cx: number, cy: number): number {
  const fx = cx / BIOME_S, fy = cy / BIOME_S
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const tx = biomeSmooth(fx - x0), ty = biomeSmooth(fy - y0)
  const v00 = h01(seed, 0xb300, x0, y0), v10 = h01(seed, 0xb300, x0 + 1, y0)
  const v01 = h01(seed, 0xb300, x0, y0 + 1), v11 = h01(seed, 0xb300, x0 + 1, y0 + 1)
  const a = v00 + (v10 - v00) * tx, b = v01 + (v11 - v01) * tx
  return a + (b - a) * ty
}

export function l3VariantOf(seed: number, cx: number, cy: number): L3Variant {
  if (cx === 0 && cy === 0) return 'lit' // 出生 chunk 恒为照明廊道（安全引入）
  if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) {
    // 出生安全区：照明/晦暗各半（不设特征房间）
    return h01(seed, 0xb311, cx, cy) < 0.5 ? 'lit' : 'dark'
  }
  // 特征房间 chunk（wikidot：四类房间位于过道各处；装配线数量尤为突出）
  const rr = h01(seed, 0xb410, cx, cy)
  if (rr < 0.03) return 'assembly' // ~3.0%（最常见）
  if (rr < 0.046) return 'genhall' // ~1.6%
  if (rr < 0.062) return 'boiler' // ~1.6%
  if (rr < 0.067) return 'sanct' // ~0.5%（极小概率）
  if (h01(seed, 0x1e31, cx, cy) < 0.06) return h01(seed, 0x1e32, cx, cy) < 0.35 ? 'dark' : 'lit' // 6% 异质
  return biomeNoise(seed, cx, cy) < 0.35 ? 'dark' : 'lit' // 照明 ~65% / 晦暗 ~35%
}

// ---------- 廊道网（世界坐标纯函数：相邻 chunk 天然对齐）----------
const VSP = 16 // 竖直廊道名义间距（瓦片）
const HSP = 18 // 横向连廊名义间距（瓦片）
// 廊道 k 的西缘 x；k=0 固定在 13（出生点世界 15,15 必在廊道内——corrW(0,0) 保底 ≥3）
export const l3CorrX = (seed: number, k: number) =>
  13 + k * VSP + (k === 0 ? 0 : (h32(seed, 0xc0, k) % 11) - 5)
// 廊道 k 在区块 r 的段宽（1~4：1=18% 一人宽砖砌隧道 / 2=42% / 3=28% / 4=12%）——逐区块变化=廊道宽窄不一
export const l3CorrW = (seed: number, k: number, r: number) => {
  if (k === 0 && r === 0) return 3 + (h32(seed, 0xc3, k, r) % 2) // 出生段保底 3~4 宽（覆盖出生点 15,15）
  const roll = h01(seed, 0xc2, k, r)
  return roll < 0.18 ? 1 : roll < 0.6 ? 2 : roll < 0.88 ? 3 : 4
}
// 横道 r 的北缘 y；r=0 固定在 13
export const l3RowY = (seed: number, r: number) =>
  13 + r * HSP + (r === 0 ? 0 : (h32(seed, 0xd0, r) % 13) - 6)
// 横道 r 的高度（2=75% / 3=25%）
export const l3RowH = (seed: number, r: number) => (h01(seed, 0xd2, r) < 0.75 ? 2 : 3)
// 廊道 k 是否贯穿区块 r（rowY(r) 与 rowY(r+1) 之间）；不贯穿则该段缺席（廊道长短不一）
export const l3Serve = (seed: number, k: number, r: number) =>
  (k === 0 && (r === 0 || r === -1)) || h01(seed, 0xb1, k, r) < 0.78 // 出生廊道纵贯出生区块

// 栅栏判定（世界纯函数）：竖直段 ~18% 整段铁栅栏封死（gate=-1），~9% 栅栏+1 宽栅栏门。
// 出生安全区（|k|≤1 且 |r|≤1）与横道 ±5 瓦片内不设栅栏。
export function l3FenceAt(seed: number, k: number, r: number): { y: number; gate: number } | null {
  if (Math.abs(k) <= 1 && Math.abs(r) <= 1) return null
  if (!l3Serve(seed, k, r)) return null
  const roll = h01(seed, 0xf3, k, r)
  if (roll >= 0.27) return null
  const ya = l3RowY(seed, r), yb = l3RowY(seed, r + 1)
  const lo = ya + l3RowH(seed, r) + 4, hi = yb - 5 // 与南北横道各保持 ≥5 格
  if (hi < lo) return null
  const y = lo + (h32(seed, 0xf5, k, r) % (hi - lo + 1))
  // v53b：栅栏门两侧必须有链接墙壁的铁栅栏——仅 ≥3 宽段设门，门位钳制在 [1, W-2]（左右各至少 1 格
  // 铁栅栏连到两侧墙壁）；1~2 宽段滚到门位时降级为整段封死（贴墙的门没有意义）
  const W = l3CorrW(seed, k, r)
  if (roll < 0.18 || W < 3) return { y, gate: -1 }
  return { y, gate: 1 + (h32(seed, 0xf4, k, r) % (W - 2)) }
}

// 开阔厅判定（世界纯函数）：服役竖直段 ~7% 在一侧（side 0 西 / 1 东）带出矩形开阔厅，
// 6~10 深（自廊道墙向外）× 5~9 长（沿廊道）。出生安全区不设；栅栏行穿厅（±1 余量）则取消；
// 深度钳制到与相邻廊道间留 ≥2 格墙，放不下（<4 深）则取消。
export function l3HallAt(seed: number, k: number, r: number, side: number): { x0: number; x1: number; y0: number; y1: number } | null {
  if (Math.abs(k) <= 1 && Math.abs(r) <= 1) return null
  if (!l3Serve(seed, k, r)) return null
  if (h01(seed, 0xb4, k, r) >= 0.07 || h32(seed, 0xb5, k, r) % 2 !== side) return null
  const X = l3CorrX(seed, k), W = l3CorrW(seed, k, r)
  const ya = l3RowY(seed, r), yb = l3RowY(seed, r + 1)
  const lo = ya + l3RowH(seed, r) + 1, hi = yb - 2
  const len = 5 + (h32(seed, 0xb7, k, r) % 5) // 5~9 长
  if (hi - lo + 1 < len) return null
  let depth = 6 + (h32(seed, 0xb6, k, r) % 5) // 6~10 深
  if (side === 1) depth = Math.min(depth, l3CorrX(seed, k + 1) - X - W - 2)
  else depth = Math.min(depth, X - (l3CorrX(seed, k - 1) + l3CorrW(seed, k - 1, r)) - 2)
  if (depth < 4) return null
  const y0 = lo + (h32(seed, 0xb8, k, r) % (hi - lo + 2 - len))
  const y1 = y0 + len - 1
  const fence = l3FenceAt(seed, k, r)
  if (fence && fence.y >= y0 - 1 && fence.y <= y1 + 1) return null // 栅栏不得穿厅
  return side === 1 ? { x0: X + W, x1: X + W + depth - 1, y0, y1 } : { x0: X - depth, x1: X - 1, y0, y1 }
}

// ---------- chunk 生成（纯函数：同种子同坐标必一致；GenChunk 契约见 infiniteRegistry）----------
// v53：L3 高智能实体实例标记（wikidot Level 3 条目；instantiate 浅拷贝带入 def）。
// v54：抽成统一出口——廊道实体与装配线大房间「额外实体」两条生成路径必须下发同一套标记，
// 否则同层同类实体形态/行为分叉（尸鼠缺 capybara 标记 → 渲染成深褐形态而非水豚形态）。
function l3EntityMarks(type: string, r: RNG): { hostile?: 1; tool?: 1; l3face?: 1; human?: 1; capybara?: 1; scale?: number } {
  switch (type) {
    case 'faceling': return { hostile: 1, l3face: 1, ...(r.chance(0.4) ? { tool: 1 as const } : {}) } // 敌意 + 错位面部器官；~40% 持石器
    case 'skinstealer': return { human: 1 } // 伪装成流浪者（接近后暴起，见 entityAI）
    case 'corpserat': return { capybara: 1, scale: 1.45 } // 水豚形态、体型变大
    case 'clump': return { scale: 1.2 } // 体型变大一点（追击更快/会转弯见 entityAI）
    default: return {}
  }
}
export function genL3ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string): GenChunk {
  const variant = (forceVariant ?? l3VariantOf(seed, cx, cy)) as L3Variant
  // 特征房间 chunk：整间围合房间（内腔局部 RM..CS-1-RM；墙环 RM-1 与 CS-RM；廊道排除区 RM-1..CS-RM）。
  // RM=房间墙缘厚：发电室/锅炉房 5（内腔 22×22，约小 1/4），装配线/圣所 2（内腔 28×28）
  const ROOM = variant === 'assembly' || variant === 'genhall' || variant === 'boiler' || variant === 'sanct'
  const RM = variant === 'genhall' || variant === 'boiler' ? 5 : 2
  const rng = new RNG(h32(seed, cx, cy, 0x1a3))
  const tiles = new Uint8Array(CS * CS).fill(2)
  const wet = new Uint8Array(CS * CS)
  const elev = new Uint8Array(CS * CS)
  const step = new Uint8Array(CS * CS)
  const tint = new Uint8Array(CS * CS)
  const crawl = new Uint8Array(CS * CS)
  const structures: Structure[] = []
  const items: GroundItem[] = []
  const lights: LightSource[] = []
  const exits: ExitInstance[] = []
  const entities: { type: string; x: number; y: number; calm?: boolean; scale?: number; hostile?: 1; tool?: 1; l3face?: 1; human?: 1; capybara?: 1 }[] = []
  const li = (x: number, y: number) => y * CS + x
  const isF = (x: number, y: number) => x >= 0 && y >= 0 && x < CS && y < CS && tiles[li(x, y)] === 1
  const WX = cx * CS, WY = cy * CS
  const inChunk = (x: number, y: number) => x >= WX && x < WX + CS && y >= WY && y < WY + CS
  // 出生点（世界 15,15）附近 2 格内不放实心结构（生成不变量：出生点必为可站立地板）
  const nearSpawn = (x: number, y: number) => Math.max(Math.abs(x - 15), Math.abs(y - 15)) <= 2
  let sidN = 0, itemN = 0
  const sidOf = (n: number) => ((cx & 0xff) << 24) | ((cy & 0xff) << 16) | ((n & 0xff) << 4) | 1
  // 结构按「锚点瓦片归属 chunk」推送（世界坐标内容跨 chunk 由各 chunk 一致雕刻，结构不重复）
  const pushStruct = (kind: Structure['kind'], x: number, y: number, w: number, h: number, solid: boolean, withSid = false, data?: Structure['data']) => {
    if (!inChunk(x, y)) return
    const d = withSid ? { ...data, sid: sidOf(sidN++) } : data
    structures.push({ kind, x, y, w, h, solid, data: d })
  }
  const pushItem = (type: string, x: number, y: number) => {
    if (!inChunk(x, y)) return
    items.push({ id: GEN_ITEM_BASE + ((cx & 0xff) << 12) + ((cy & 0xff) << 4) + (itemN++ & 0xf), type, x: x + 0.5, y: y + 0.5 })
  }
  const pushLight = (x: number, y: number, r: number, color: string, extra?: Partial<LightSource>) => {
    if (!inChunk(x, y)) return
    lights.push({ x: x + 0.5, y: y + 0.5, r, color, flickerSeed: rng.next() * 100, gen: 1, ...extra })
  }
  // 世界矩形雕刻（裁剪到本 chunk；布局是世界坐标函数，相邻 chunk 各自雕刻天然缝合）
  const carveRectW = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        tiles[li(x - WX, y - WY)] = 1
  }
  // 廊道雕刻：房间 chunk 中廊道止于房间墙环（排除区局部 RM-1..CS-RM 不雕，门洞另行打通）
  const carveCorrW = (x0: number, y0: number, x1: number, y1: number) => {
    if (!ROOM) return carveRectW(x0, y0, x1, y1)
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++) {
        const lx = x - WX, ly = y - WY
        if (lx >= RM - 1 && ly >= RM - 1 && lx <= CS - RM && ly <= CS - RM) continue
        tiles[li(lx, ly)] = 1
      }
  }
  const solidAtL = (x: number, y: number) =>
    structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)

  // ---- 廊道/横道范围（覆盖本 chunk 及其特征外溢）----
  const kMin = Math.floor((WX - 8 - 13) / VSP) - 1, kMax = Math.ceil((WX + CS + 8 - 13) / VSP) + 1
  const rMin = Math.floor((WY - 24 - 13) / HSP) - 1, rMax = Math.ceil((WY + CS + 24 - 13) / HSP) + 1

  // ---- 横道（贯穿东西，全部廊道经横道互联）----
  for (let r = rMin; r <= rMax; r++) {
    const ry = l3RowY(seed, r), rh = l3RowH(seed, r)
    if (ry + rh - 1 < WY || ry > WY + CS - 1) continue
    carveRectW(WX - CS, ry, WX + 2 * CS, ry + rh - 1)
  }
  // ---- 竖直廊道（按区块服役；缺席=该段不存在，长短不一）----
  for (let k = kMin; k <= kMax; k++) {
    const X = l3CorrX(seed, k)
    if (X + 4 < WX - 8 || X > WX + CS + 8) continue
    for (let r = rMin; r <= rMax; r++) {
      const ya = l3RowY(seed, r), yb = l3RowY(seed, r + 1), rh1 = l3RowH(seed, r + 1)
      if (yb + rh1 - 1 < WY || ya > WY + CS - 1) continue
      if (!l3Serve(seed, k, r)) continue
      carveCorrW(X, ya, X + l3CorrW(seed, k, r) - 1, yb + rh1 - 1)
    }
  }

  // ---- 铁栅栏 / 栅栏门（世界纯函数 l3FenceAt；锚点=西侧瓦片归属 chunk）----
  for (let k = kMin; k <= kMax; k++) {
    const X = l3CorrX(seed, k)
    if (ROOM || X + 4 < WX - 4 || X > WX + CS + 4) continue // 特征房间 chunk：不设栅栏（围栏止于房间墙外）
    for (let r = rMin; r <= rMax; r++) {
      const fence = l3FenceAt(seed, k, r)
      if (!fence) continue
      const W = l3CorrW(seed, k, r)
      if (fence.gate < 0) {
        pushStruct('barfence', X, fence.y, W, 1, true)
      } else {
        // v53b：门位已钳制在 [1, W-2]——左右铁栅栏必然存在并链接两侧墙壁
        pushStruct('barfence', X, fence.y, fence.gate, 1, true)
        pushStruct('bargate', X + fence.gate, fence.y, 1, 1, true, true, { open: 0 })
        pushStruct('barfence', X + fence.gate + 1, fence.y, W - fence.gate - 1, 1, true)
      }
    }
  }

  // ---- 特征房间（chunk 变体：装配线/发电室/锅炉房/圣所；wikidot：四类房间位于过道各处）----
  // 整间围合房间：内腔 28×28（局部 2..CS-3），廊道止于墙环；每条触及房间的廊道/横道在墙环上
  // 开 1~2 宽门洞（50% 铁栅栏门），保证房间必可进入且全局连通；门口→房间中心留 2 宽净空路径。
  if (ROOM) {
    carveRectW(WX + RM, WY + RM, WX + CS - 1 - RM, WY + CS - 1 - RM) // 内腔
    // 门洞：扫描四边外圈（局部 0 / CS-1）已雕刻的廊道地板，在对应墙环（局部 RM-1 / CS-RM）打门
    const doorLanes: { x: number; y: number }[] = [] // 门洞内腔侧瓦片（世界坐标；门洞补光用）
    const doorPaths: { x: number; y: number }[] = [] // 每个门洞一个路径锚点（2 宽门洞只算一条路径，避免路径过宽）
    const scanEdge = (edge: number) => { // 0北 1南 2西 3东
      let start = -1
      const runs: [number, number][] = []
      for (let i = RM; i <= CS - 1 - RM; i++) {
        const f = edge === 0 ? tiles[li(i, 0)] === 1 : edge === 1 ? tiles[li(i, CS - 1)] === 1
          : edge === 2 ? tiles[li(0, i)] === 1 : tiles[li(CS - 1, i)] === 1
        if (f && start < 0) start = i
        if (!f && start >= 0) { runs.push([start, i - 1]); start = -1 }
      }
      if (start >= 0) runs.push([start, CS - 1 - RM])
      for (const [a, b] of runs) {
        const dd = a + (h32(seed, 0xdd, cx, cy, edge, a) % (b - a + 1)) // 门位（取触边段内一格）
        const wide = b > a && h01(seed, 0xde, cx, cy, edge, a) < 0.5 // 1~2 宽
        // v53b：铁栅栏门仅落在 2 宽门洞——门扇一格 + 另一格铁栅栏封死并连到墙环
        //（1 宽门洞设门两侧必然贴墙、旁边没有铁栅栏，故 1 宽门洞一律为敞开洞口）
        const gate = wide && h01(seed, 0xdf, cx, cy, edge, a) < 0.5 // 50% 铁栅栏门（监狱工业风）
        const ring = (t: number): [number, number] => edge === 0 ? [t, RM - 1] : edge === 1 ? [t, CS - RM] : edge === 2 ? [RM - 1, t] : [CS - RM, t]
        const cells = wide ? [dd, dd + 1] : [dd]
        for (const t of cells) {
          const [dx, dy] = ring(t)
          tiles[li(dx, dy)] = 1 // 门洞打通
          doorLanes.push({ x: WX + dx + (edge === 2 ? 1 : edge === 3 ? -1 : 0), y: WY + dy + (edge === 0 ? 1 : edge === 1 ? -1 : 0) })
        }
        { // 路径锚点=门洞第一格的内腔侧瓦片
          const [dx, dy] = ring(cells[0])
          doorPaths.push({ x: WX + dx + (edge === 2 ? 1 : edge === 3 ? -1 : 0), y: WY + dy + (edge === 0 ? 1 : edge === 1 ? -1 : 0) })
        }
        if (gate) { // 铁栅栏门落在门洞第一格；另一格铁栅栏封死——门两侧必有连墙铁栅栏（v53b）
          const [gx, gy] = ring(cells[0])
          pushStruct('bargate', WX + gx, WY + gy, 1, 1, true, true, { open: 0, ...(edge >= 2 ? { rot: 1 } : {}) })
          const [fx, fy] = ring(cells[1])
          pushStruct('barfence', WX + fx, WY + fy, 1, 1, true, true, edge >= 2 ? { rot: 1 } : undefined)
        }
      }
    }
    for (const e of [0, 1, 2, 3]) scanEdge(e)
    // 门洞补光（门口与廊道残段至少基本可读）
    for (const d of doorLanes) pushLight(d.x, d.y, 2.0, '#d8d2c2')
    // 门口→房间中心的 2 宽净空路径（实心摆放全部避让；每个门洞一条）
    const pathTiles = new Set<number>()
    const C = CS >> 1 // 16
    for (const d of doorPaths) {
      const dxL = d.x - WX, dyL = d.y - WY
      if (dyL === RM || dyL === CS - 1 - RM) { // 南北门：竖直双车道
        const lane2 = Math.min(Math.max(dxL + (dxL < C ? 1 : -1), RM), CS - 1 - RM)
        for (let y = RM; y <= CS - 1 - RM; y++) { pathTiles.add(li(dxL, y)); pathTiles.add(li(lane2, y)) }
      } else { // 东西门：水平双车道
        const lane2 = Math.min(Math.max(dyL + (dyL < C ? 1 : -1), RM), CS - 1 - RM)
        for (let x = RM; x <= CS - 1 - RM; x++) { pathTiles.add(li(x, dyL)); pathTiles.add(li(x, lane2)) }
      }
    }
    // 房间内摆放助手（世界坐标；内腔局部 RM..CS-1-RM）
    const RIX0 = WX + RM, RIY0 = WY + RM, RIX1 = WX + CS - 1 - RM, RIY1 = WY + CS - 1 - RM
    const onPath = (x: number, y: number) => pathTiles.has(li(x - WX, y - WY))
    const structAtW = (x: number, y: number, w = 1, h = 1) =>
      structures.some((s2) => x < s2.x + s2.w && x + w > s2.x && y < s2.y + s2.h && y + h > s2.y)
    const roomFreeRect = (x: number, y: number, w: number, h: number) => {
      if (x < RIX0 || y < RIY0 || x + w - 1 > RIX1 || y + h - 1 > RIY1) return false
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (solidAtL(i, j) || onPath(i, j)) return false
      return true
    }
    const rr = new RNG(h32(seed, 0x7010, cx, cy)) // 房间内容 RNG（chunk 特征坐标键控）
    const roomRand = (solid: boolean): { x: number; y: number } | null => {
      for (let t = 0; t < 40; t++) {
        const x = rr.int(RIX0, RIX1), y = rr.int(RIY0, RIY1)
        if (solid && (solidAtL(x, y) || onPath(x, y))) continue
        if (structAtW(x, y)) continue
        return { x, y }
      }
      return null
    }
    const roomEdge = (solid: boolean): { x: number; y: number } | null => { // 贴内腔墙瓦片（渲染层 wallDir/mountOnWall 定向）
      for (let t = 0; t < 40; t++) {
        const se = rr.int(0, 3)
        const x = se === 0 ? RIX0 : se === 1 ? RIX1 : rr.int(RIX0, RIX1)
        const y = se === 2 ? RIY0 : se === 3 ? RIY1 : rr.int(RIY0, RIY1)
        if (solid && (solidAtL(x, y) || onPath(x, y))) continue
        if (structAtW(x, y)) continue
        return { x, y }
      }
      return null
    }

    if (variant === 'assembly') {
      // 装配线（wikidot：极为开阔宽敞的工厂式设施，设有传送带；实体较多；物资极丰富）——全层级最亮的房间。
      // 传送带阵（排距 5 = 3 排带 + 2 巷；同排三列段口对齐=可穿越通道；取最优相位的前 3 条排带）。
      // 排相位 5 选 1：取「可用排总覆盖」最高者——门口竖直路径会整列吃掉碰上的排
      let beltAll: number[] = [], bestScore = -1
      for (let phase = 0; phase < 5; phase++) {
        const cols: number[] = []
        let score = 0
        for (let x = 4 + phase; x + 2 <= CS - 3; x += 5) {
          let freeN = 0
          for (const lx of [x, x + 1, x + 2]) for (let y = 4; y <= CS - 5; y++) if (!onPath(WX + lx, WY + y)) freeN++
          if (freeN >= 45) { cols.push(x); score += freeN }
        }
        if (score > bestScore) { bestScore = score; beltAll = cols }
      }
      const beltX = beltAll.slice(0, 3) // 2~3 条排带（wikidot：极为开阔宽敞——不铺满）
      for (const bx of beltX) {
        let y = 3
        while (y <= CS - 8) {
          const okC = (lx: number, yy: number) => !solidAtL(WX + lx, WY + yy) && !onPath(WX + lx, WY + yy)
          let free = 0
          while (y + free <= CS - 4 && okC(bx, y + free) && okC(bx + 1, y + free) && okC(bx + 2, y + free)) free++
          if (free >= 4) {
            const segLen = Math.min(free, 7 + rr.int(0, 2))
            for (const lx of [bx, bx + 1, bx + 2])
              pushStruct('conveyor', WX + lx, WY + y, 1, segLen, true, false, { rot: 1 })
            y += segLen + 1 // 段间 1 格豁口（三列对齐=穿越口）
          } else y += free + 1
        }
        // 沿排带两侧巷道的冲压工位（每 4 格一座，面朝排带；东西两侧择优落位）
        for (let sy = 4; sy <= CS - 6; sy += 4) {
          for (const px2 of [bx + 3, bx - 1]) {
            if (px2 < 2 || px2 > CS - 3 || onPath(WX + px2, WY + sy) || solidAtL(WX + px2, WY + sy) || structAtW(WX + px2, WY + sy)) continue
            pushStruct('pressmachine', WX + px2, WY + sy, 1, 1, true, false, { deg: px2 > bx ? 270 : 90 })
            break
          }
        }
      }
      // 成排吊装荧光灯：每排每 4 格一盏（整齐对齐排列；灯具模型=factlamp，光源 noFix 不画默认灯盒）
      for (const bx of beltX)
        for (let y = 4; y <= CS - 5; y += 4) {
          if (onPath(WX + bx, WY + y)) continue
          pushStruct('factlamp', WX + bx, WY + y, 1, 1, false, false, { rot: 1 })
          pushLight(WX + bx, WY + y, 3.5, '#e8e4da', { noFix: 1, fixZ: 3.65 })
        }
      // 巷道光网：巷道中心（排间 2 宽巷）每 4 格一盏，与排灯错开
      for (const bx of beltX)
        for (let y = 6; y <= CS - 4; y += 4) {
          if (bx + 3 > CS - 3) continue
          if (!onPath(WX + bx + 3, WY + y)) pushLight(WX + bx + 3, WY + y, 3.5, '#e8e4da')
        }
      // 周界作业带：北/南墙单排工作台长排（排带端头）+ 东/西墙储物货架长排（与排带重叠处自动跳过）
      for (const wy2 of [RIY0, RIY1])
        for (let x = RIX0; x <= RIX1 - 1; x += 2)
          if (roomFreeRect(x, wy2, 2, 1)) pushStruct('worktable', x, wy2, 2, 1, true, false, { vise: h01(seed, 0x7b30, cx, cy, x, wy2) < 0.4 ? 1 : 0 })
      for (const wx2 of [RIX0, RIX1])
        for (let y = RIY0; y <= RIY1; y += 2)
          if (roomFreeRect(wx2, y, 1, 2)) pushStruct('binshelf', wx2, y, 1, 2, true)
      // 物资群集（wikidot：杏仁水瓶群集案例拍摄于装配线）：3 簇工具散件 + 30% 额外杏仁水×2
      for (let c2 = 0; c2 < 3; c2++) {
        const ctr = roomRand(false)
        if (!ctr) continue
        for (let i = 0, n = rr.int(2, 3); i < n; i++) {
          const t = rr.pick(['wrench', 'crowbar', 'battery', 'nails', 'timber'] as const)
          const ix = Math.min(Math.max(ctr.x + rr.int(-1, 1), RIX0), RIX1)
          const iy = Math.min(Math.max(ctr.y + rr.int(-1, 1), RIY0), RIY1)
          if (!solidAtL(ix, iy)) pushItem(t, ix, iy)
        }
      }
      if (rr.chance(0.3)) for (let i = 0; i < 2; i++) { const p = roomRand(false); if (p) pushItem('almond', p.x, p.y) }
      // 两侧墙顶管线（天花板细管 + 线束）
      for (let y2 = RIY0 + 1; y2 <= RIY1 - 1; y2 += 3)
        for (const x2 of [RIX0, RIX1])
          if (!solidAtL(x2, y2) && !structAtW(x2, y2)) pushStruct('pipes', x2, y2, 1, 1, false, false, { ceil: 1, side: x2 === RIX0 ? 0 : 1 })
      // 额外实体 2~3 只（wikidot：实体经常进入这些房间，而且它们知道人类也会这样做）
      // v54：与廊道实体同走 l3EntityMarks——此前裸 push，抽中尸鼠缺 capybara 标记被渲染成深褐错变种
      for (let i = 0, n = rr.int(2, 3); i < n; i++) {
        const p = roomRand(false)
        if (!p) continue
        const t2 = rr.weighted(def.entities.map((e) => ({ v: e.type, w: e.w })))
        entities.push({ type: t2, x: p.x + 0.5, y: p.y + 0.5, ...l3EntityMarks(t2, rr) })
      }
    } else if (variant === 'genhall') {
      // 发电室（wikidot：普遍拥有较大空间，内部陈列诸多电气设备；杏仁水与火盐较大量出现）。规范化布局：
      // 中央汽轮发电机组列（1×3 ×2~3，节距 5=机组 3 + 检修净空 2，同向中轴行）+ 西墙配电盘列（+顶电缆桥架）
      // + 东北角变压器组 + 母线龙门架跨列 + 东墙配电箱/警示牌 + 电缆沟通道 + 冷白光网
      let tN = 0
      outer: for (const ty of [WY + C, WY + C - 4, WY + C + 4]) // 汽轮发电机组列（多行后备：门径穿列则换行）
        for (let i = 0; i < 4; i++) {
          const tx = RIX0 + 4 + i * 5
          if (roomFreeRect(tx, ty, 3, 1)) { pushStruct('turbinegen', tx, ty, 3, 1, true); tN++ }
          if (tN >= 3) break outer
        }
      while (tN < 2) { // 再后备：中轴 ±6 行内逐格扫描（发电室必须有机组列）
        let done = false
        for (let dy = -6; dy <= 6 && !done; dy++)
          for (let x = RIX0 + 2; x <= RIX1 - 4 && !done; x++)
            if (roomFreeRect(x, WY + C + dy, 3, 1)) { pushStruct('turbinegen', x, WY + C + dy, 3, 1, true); tN++; done = true }
        if (!done) break
      }
      // 配电盘列：四墙择优（门径会整列吃掉贴墙列位；横墙列位则配电盘横排、桥架转向）
      const walls = [
        { vert: true, at: RIX0, deg: 90 }, { vert: true, at: RIX1, deg: 270 },
        { vert: false, at: RIY0, deg: 0 }, { vert: false, at: RIY1, deg: 180 },
      ]
      const wallFreeN = (w: (typeof walls)[0]) => {
        let n = 0
        for (let i = RM + 1; i <= CS - 2 - RM; i++) {
          const x = w.vert ? w.at : WX + i, y = w.vert ? WY + i : w.at
          if (!onPath(x, y) && !solidAtL(x, y) && !structAtW(x, y)) n++
        }
        return n
      }
      const sbW = walls.reduce((a, b) => (wallFreeN(b) > wallFreeN(a) ? b : a))
      for (let i = RM + 1; i <= CS - 2 - RM; i++) {
        const x = sbW.vert ? sbW.at : WX + i, y = sbW.vert ? WY + i : sbW.at
        if (onPath(x, y) || solidAtL(x, y) || structAtW(x, y)) continue
        pushStruct('switchboard', x, y, 1, 1, true, false, { deg: sbW.deg })
        pushStruct('cabletray', x, y, 1, 1, false, false, sbW.vert ? {} : { rot: 1 }) // 顶部电缆桥架（同瓦片高位，非实心）
      }
      // 变压器组（2 台 2×2，四角顺序取首个放得的）
      let tPlaced = 0
      for (const [tx, ty] of [[RIX1 - 3, RIY0 + 1], [RIX0 + 1, RIY0 + 1], [RIX1 - 3, RIY1 - 3], [RIX0 + 1, RIY1 - 3]] as const) {
        if (tPlaced >= 2) break
        if (roomFreeRect(tx, ty, 2, 2)) { pushStruct('transformer', tx, ty, 2, 2, true); tPlaced++ }
      }
      // 母线龙门架 2 跨（平行于机组列南北两侧）
      for (const by of [WY + C - 3, WY + C + 3]) {
        for (let t = 0; t < 20; t++) {
          const bx = rr.int(RIX0 + 2, RIX1 - 6)
          if (!roomFreeRect(bx, by, 4, 1)) continue
          pushStruct('busbar', bx, by, 4, 1, true)
          break
        }
      }
      // 对侧墙配电箱一列 + 警示牌
      const ebX = sbW.vert ? (sbW.at === RIX0 ? RIX1 : RIX0) : RIX0
      let eb = 0
      for (let y = RIY0 + 2; y <= RIY1 - 2 && eb < 3; y += 3) {
        if (onPath(ebX, y) || solidAtL(ebX, y) || structAtW(ebX, y)) continue
        pushStruct('elecbox', ebX, y, 1, 1, false, true, { loot: 1 })
        eb++
      }
      for (let i = 0; i < 2; i++) { const p = roomEdge(false); if (p) pushStruct('warningsign', p.x, p.y, 1, 1, false, false, { tilt: rr.int(0, 3) }) }
      // 电缆沟通道：机组列与配电盘列之间（非实心）
      if (sbW.vert)
        for (let y = RIY0 + 3; y <= RIY1 - 3; y++) {
          const x = sbW.at === RIX0 ? RIX0 + 2 : RIX1 - 2
          if (!solidAtL(x, y) && !onPath(x, y) && !structAtW(x, y)) pushStruct('trench', x, y, 1, 1, false)
        }
      else
        for (let x = RIX0 + 3; x <= RIX1 - 3; x++) {
          const y = sbW.at === RIY0 ? RIY0 + 2 : RIY1 - 2
          if (!solidAtL(x, y) && !onPath(x, y) && !structAtW(x, y)) pushStruct('trench', x, y, 1, 1, false)
        }
      for (let i = 0, n = rr.int(2, 3); i < n; i++) { const p = roomRand(false); if (p) pushItem('almond', p.x, p.y) } // 杏仁水较大量
      for (let i = 0; i < 2; i++) { const p = roomRand(false); if (p) pushItem('firesalt', p.x, p.y) } // 火盐 ×2
      // 灯光：5 格冷白光网（对齐房间矩形/设备阵列）+ 机组列指示光点
      for (let x = 5; x <= CS - 6; x += 5)
        for (let y = 5; y <= CS - 6; y += 5) pushLight(WX + x, WY + y, 3.5, '#c8d4e0')
      if (tN > 0) for (let i = 0; i < 2; i++) pushLight(RIX0 + 4 + i * 5 + 1, WY + C, 1.6, '#9adfff')
    } else if (variant === 'boiler') {
      // 锅炉房（wikidot：多个锅炉设备；研究人员推测它们产生了管道内的神秘黑色液体）——暖黄。规范化布局：
      // 北墙下等距锅炉列（膛板朝南、面向烧火过道）+ 锅炉对间给水泵 + 南侧蒸汽集箱 + 三面墙有序管架
      // + 每台炉前排水格栅；4 格暖色光网
      // 锅炉列（节距 6：3×3 大锅炉与 2×2 球罐交替，局部 y=3 起，行下移后备）
      const bRects: { x0: number; x1: number }[] = []
      for (let i = 0; i < 3; i++) {
        const kind = (i + h32(seed, 0x7d1, cx, cy)) % 2 === 0 ? 'boiler' : 'sphboiler'
        const w = kind === 'boiler' ? 3 : 2
        const bx = RIX0 + 1 + i * 6
        for (const by of [RIY0 + 1, RIY0 + 2])
          if (roomFreeRect(bx, by, w, w)) { pushStruct(kind, bx, by, w, w, true); bRects.push({ x0: bx, x1: bx + w - 1 }); break }
        // 炉前排水格栅（每台居中，烧火过道内）
        if (!solidAtL(bx + (w >> 1), RIY0 + 5)) pushStruct('floordrain', bx + (w >> 1), RIY0 + 5, 1, 1, false)
      }
      // 给水泵：锅炉之间的隙位列（按实际落位找空档，多行扫描，至多 2 台）
      {
        let pumps = 0
        outer3: for (const y of [RIY0 + 2, RIY0 + 3, RIY0 + 4, RIY0 + 1])
          for (let x = RIX0 + 1; x <= RIX1 - 1; x++) {
            if (bRects.some((b) => x >= b.x0 && x <= b.x1)) continue // 锅炉本体列
            if (onPath(x, y) || solidAtL(x, y) || structAtW(x, y)) continue
            pushStruct('feedpump', x, y, 1, 1, true)
            pumps++
            x += 3 // 两台泵拉开间距
            if (pumps >= 2) break outer3
          }
      }
      // 蒸汽集箱（1×3，烧火过道南缘沿 X；多行后备）
      outer2: for (const my of [RIY0 + 8, RIY0 + 9, RIY0 + 10, RIY0 + 7])
        for (let mx = RIX0 + 3; mx <= RIX1 - 5; mx++)
          if (roomFreeRect(mx, my, 3, 1)) { pushStruct('manifold', mx, my, 3, 1, true); break outer2 }
      // 有序管架：东/西墙整列（管顺墙南北向）+ 北墙整列（rot 顺墙东西向）；每 ~4 格带下吊阀轮
      for (let y = RIY0; y <= RIY1; y++)
        for (const x of [RIX0, RIX1]) {
          if (onPath(x, y) || solidAtL(x, y) || structAtW(x, y)) continue
          pushStruct('piperack', x, y, 1, 1, true, false, { valve: (y - RIY0) % 4 === 1 ? 1 : 0 })
        }
      for (let x = RIX0 + 2; x <= RIX1 - 2; x++) {
        if (onPath(x, RIY0) || solidAtL(x, RIY0) || structAtW(x, RIY0)) continue
        pushStruct('piperack', x, RIY0, 1, 1, true, false, { rot: 1, valve: (x - RIX0) % 4 === 2 ? 1 : 0 })
      }
      // 黑色液体导流沟 1 道（视觉氛围，非实心）+ 储物柜 30%
      {
        const p = roomRand(false)
        if (p) for (let j = 0, n2 = rr.int(2, 4); j < n2 && p.y + j <= RIY1; j++) if (!solidAtL(p.x, p.y + j)) pushStruct('trench', p.x, p.y + j, 1, 1, false)
      }
      if (rr.chance(0.3)) { const p = roomEdge(true); if (p) pushStruct('locker', p.x, p.y, 1, 1, true, true, { loot: 1 }) }
      // 灯光：4 格暖黄光网（对齐房间矩形内腔，处处可读）
      for (let x = RM + 1; x <= CS - 2 - RM; x += 4)
        for (let y = RM + 1; y <= CS - 2 - RM; y += 4) pushLight(WX + x, WY + y, 3.2, '#ffb35c')
    } else {
      // 圣所（wikidot：希腊-罗马式大教堂室内；长椅/钢琴/管风琴明显缺失；大量天使神祇宗教意象；
      // 墙壁维持砖墙；至少一尊大型天使雕像居中或祭坛抬高）——唯一天然避实体庇护所（tint 20 + 引擎威慑）
      for (let y = 2; y <= CS - 3; y++) for (let x = 2; x <= CS - 3; x++) if (tiles[li(x, y)] === 1) tint[li(x, y)] = 20 // 苍白圣石地面（仅地板；墙面保留砖砌）
      let angelAt: { x: number; y: number } | null = null // 天使像位置（烛台两翼摆位用）
      // 列柱阵：中殿两列（x=9 / CS-10）+ 两侧副列（x=4 / CS-5），均每 2 格一根；门口路径处缺柱
      for (let y = 4; y <= CS - 5; y += 2)
        for (const x of [9, CS - 10, 4, CS - 5])
          if (!onPath(WX + x, WY + y) && !solidAtL(WX + x, WY + y)) pushStruct('column', WX + x, WY + y, 1, 1, true, false, { pale: 1 })
      { // 大型天使像：70% 房间中央 / 30% 尽端石台（data.plinth 垫高）；门径全占时中心螺旋后备（圣所必有像）
        const raised = rr.chance(0.3)
        const cands: [number, number][] = raised ? [[C, 4], [C, 5], [C - 1, 4]] : [[C, C], [C - 1, C], [C, C - 1], [C - 1, C - 1]]
        let placed = false
        for (const [ax, ay] of cands)
          if (!placed && !onPath(WX + ax, WY + ay) && !solidAtL(WX + ax, WY + ay)) {
            pushStruct('angelstatue', WX + ax, WY + ay, 1, 1, true, false, raised ? { plinth: 1 } : {})
            pushLight(WX + ax, WY + ay, 4, '#e8c98a') // 圣像顶光
            angelAt = { x: WX + ax, y: WY + ay }
            placed = true
          }
        if (!placed)
          outer: for (let rad = 1; rad <= 10; rad++)
            for (let dy = -rad; dy <= rad; dy++)
              for (let dx = -rad; dx <= rad; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
                const ax = C + dx, ay = C + dy
                if (ax < 2 || ay < 2 || ax > CS - 3 || ay > CS - 3) continue
                if (onPath(WX + ax, WY + ay) || solidAtL(WX + ax, WY + ay)) continue
                pushStruct('angelstatue', WX + ax, WY + ay, 1, 1, true, false, raised ? { plinth: 1 } : {})
                pushLight(WX + ax, WY + ay, 4, '#e8c98a')
                angelAt = { x: WX + ax, y: WY + ay }
                placed = true
                break outer
              }
      }
      // 烛台一对，分立天使像两翼（非实心，自发光烛火）
      if (angelAt)
        for (const sd of [-1, 1]) {
          const cx2 = angelAt.x + sd, cy2 = angelAt.y
          if (cx2 < RIX0 || cx2 > RIX1 || onPath(cx2, cy2) || solidAtL(cx2, cy2) || structAtW(cx2, cy2)) continue
          pushStruct('candlestand', cx2, cy2, 1, 1, false)
        }
      for (let i = 0, n = rr.int(3, 5); i < n; i++) { // 倒塌柱残件（非实心瓦砾）
        const p = roomRand(false)
        if (!p) continue
        const tall = rr.chance(0.5) && p.y + 1 <= RIY1 && !structAtW(p.x, p.y + 1)
        pushStruct('fallencolumn', p.x, p.y, 1, tall ? 2 : 1, false)
      }
      for (let i = 0, n = rr.int(4, 6); i < n; i++) { const p = roomEdge(true); if (p) pushStruct('statue', p.x, p.y, 1, 1, true, false, { dmg: rr.int(0, 2) }) } // 贴墙小雕像
      for (let i = 0, n = rr.int(4, 6); i < n; i++) { const p = roomEdge(false); if (p) pushStruct('megposter', p.x, p.y, 1, 1, false, false, { tex: 'angel_fresco.png', tall: 1 }) } // 天使宗教画
      if (rr.chance(0.3)) { const p = roomEdge(false); if (p) pushStruct('graffiti', p.x, p.y, 1, 1, false, true, { lore: rr.int(0, 5) }) }
      // 灯光：中殿双列暖光（每 4 格一盏 ×2 列，充足而庄重）+ 圣像顶光（上方 block 已放）
      for (const lx of [C - 2, C + 2])
        for (let y = 4; y <= CS - 5; y += 4) pushLight(WX + lx, WY + y, 3.2, '#e8c98a')
      // v53b：两侧副殿补灯（侧列柱内侧各一列，同 4 格间距）——灯光覆盖整个大厅，不再只有中殿亮
      for (const lx of [5, CS - 6])
        for (let y = 4; y <= CS - 5; y += 4) pushLight(WX + lx, WY + y, 3.0, '#e8c98a')
    }
  }

  // ---- 开阔厅（世界纯函数 l3HallAt；先于壁龛雕刻——壁龛自动避让已非墙的位置）----
  for (let k = kMin; k <= kMax; k++) {
    const X = l3CorrX(seed, k)
    if (ROOM || X + 4 < WX - 12 || X > WX + CS + 12) continue // 特征房间 chunk：不设开阔厅
    for (let r = rMin; r <= rMax; r++) {
      for (const side of [0, 1] as const) {
        const hall = l3HallAt(seed, k, r, side)
        if (hall) carveRectW(hall.x0, hall.y0, hall.x1, hall.y1)
      }
    }
  }
  // ---- 开阔厅内容（锚点归属 chunk；厅可跨 chunk，两个 chunk 须经同一 hrng 序列作出一致摆放）----
  for (let k = kMin; k <= kMax; k++) {
    const X = l3CorrX(seed, k)
    if (ROOM || X + 4 < WX - 12 || X > WX + CS + 12) continue
    for (let r = rMin; r <= rMax; r++) {
      for (const side of [0, 1] as const) {
        const hall = l3HallAt(seed, k, r, side)
        if (!hall) continue
        const hrng = new RNG(h32(seed, 0xfe3, k, r))
        const len = hall.y1 - hall.y0 + 1
        const fx = side === 1 ? hall.x1 : hall.x0 // 深墙一列（机器贴最里墙）
        // 1~2 台机器（贴深墙；锅炉 3×3 仅在放得下的厅）
        for (let i = 0, n = hrng.int(1, 2); i < n; i++) {
          const roll = hrng.next()
          if (roll < 0.25 && len >= 5) { // 锅炉（3×3，贴深墙占厅一端）
            const bx = side === 1 ? hall.x1 - 2 : hall.x0
            const by = hall.y0 + hrng.int(0, len - 3)
            if (!solidAtL(bx + 1, by + 1)) pushStruct('boiler', bx, by, 3, 3, true)
            continue
          }
          const fy = hall.y0 + hrng.int(0, len - 1)
          if (solidAtL(fx, fy)) continue
          if (roll < 0.55) pushStruct('generator', fx, fy, 1, 1, true)
          else if (roll < 0.8) pushStruct('cabinet', fx, fy, 1, 1, true, true, { loot: 1 })
          else pushStruct('pipes', fx, fy, 1, 1, false)
        }
        // 30% 一件补给容器（厅内任意空地）
        if (hrng.chance(0.3)) {
          const kind = hrng.pick(['crate', 'megcrate', 'locker'] as const)
          for (let t = 0; t < 20; t++) {
            const px = hrng.int(hall.x0, hall.x1), py = hrng.int(hall.y0, hall.y1)
            if (solidAtL(px, py)) continue
            pushStruct(kind, px, py, 1, 1, true, true, { loot: 1 })
            break
          }
        }
        // 20% 一小段电缆沟
        if (hrng.chance(0.2)) {
          const tx = hrng.int(hall.x0 + 1, hall.x1 - 1), ty0 = hrng.int(hall.y0, hall.y1 - 1)
          for (let i = 0, n = hrng.int(2, 3); i < n; i++)
            if (!solidAtL(tx, ty0 + i)) pushStruct('trench', tx, ty0 + i, 1, 1, false)
        }
        // 25% 深墙上一只配电箱（loot + sid；墙邻瓦片，wallDir 渲染定向）
        if (hrng.chance(0.25)) {
          const ey = hall.y0 + hrng.int(0, len - 1)
          if (!solidAtL(fx, ey)) pushStruct('elecbox', fx, ey, 1, 1, false, true, { loot: 1 })
        }
        // 1~2 盏灯（按变体：照明=冷白 3.5 / 晦暗=昏黄 2.4，稀疏）
        for (let i = 0, n = hrng.int(1, 2); i < n; i++) {
          const lx = hrng.int(hall.x0, hall.x1), ly = hrng.int(hall.y0, hall.y1)
          if (solidAtL(lx, ly)) continue
          if (variant === 'lit') pushLight(lx, ly, 3.5, '#d8dce0')
          else pushLight(lx, ly, 2.4, '#c9b694')
        }
      }
    }
  }

  // ---- 机器壁龛（宽 ≥3 廊道 ~30%/段：侧墙掏 1 深 1~2 宽壁龛，放发电机/配电柜/管道/阀门）----
  for (let k = kMin; k <= kMax; k++) {
    const X = l3CorrX(seed, k)
    if (ROOM || X + 4 < WX - 4 || X > WX + CS + 4) continue // 特征房间 chunk：不设壁龛
    for (let r = rMin; r <= rMax; r++) {
      if (!l3Serve(seed, k, r)) continue
      const W = l3CorrW(seed, k, r)
      if (W < 3 || h01(seed, 0xa4, k, r) >= 0.3) continue
      const ya = l3RowY(seed, r), yb = l3RowY(seed, r + 1)
      const side = h32(seed, 0xa5, k, r) % 2 // 0 西墙 1 东墙
      if (l3HallAt(seed, k, r, side)) continue // 该侧已带开阔厅（壁龛让位）
      const wallx = side === 0 ? X - 1 : X + W
      const nw = 1 + (h32(seed, 0xa6, k, r) % 2)
      const lo = ya + l3RowH(seed, r) + 1, hi = yb - 2
      if (hi - lo + 1 < nw) continue
      const y0 = lo + (h32(seed, 0xa7, k, r) % (hi - lo + 2 - nw))
      const fence = l3FenceAt(seed, k, r)
      if (fence && fence.y >= y0 - 1 && fence.y <= y0 + nw) continue // 避开栅栏行
      let ok = true
      for (let i = 0; i < nw; i++)
        if (inChunk(wallx, y0 + i) && tiles[li(wallx - WX, y0 + i - WY)] !== 2) ok = false // 只掏仍是墙的瓦片
      if (!ok) continue
      for (let i = 0; i < nw; i++) {
        carveRectW(wallx, y0 + i, wallx, y0 + i)
        const roll = h01(seed, 0xa8, k, r, i)
        if (roll < 0.35) pushStruct('generator', wallx, y0 + i, 1, 1, true)
        else if (roll < 0.6) pushStruct('cabinet', wallx, y0 + i, 1, 1, true, true, { loot: 1 })
        else if (roll < 0.8) pushStruct('pipes', wallx, y0 + i, 1, 1, false)
        else pushStruct('valve', wallx, y0 + i, 1, 1, false, false, { on: h01(seed, 0xa9, k, r, i) < 0.5 ? 1 : 0 })
      }
    }
  }

  // ---- 电缆沟（trench，非实心；宽 ≥2 廊道 ~15%/段，2~5 格一段）----
  for (let k = kMin; k <= kMax; k++) {
    const X = l3CorrX(seed, k)
    if (ROOM || X + 4 < WX || X > WX + CS - 1) continue
    for (let r = rMin; r <= rMax; r++) {
      if (!l3Serve(seed, k, r)) continue
      const W = l3CorrW(seed, k, r)
      if (W < 2 || h01(seed, 0xaa, k, r) >= 0.15) continue
      const ya = l3RowY(seed, r), yb = l3RowY(seed, r + 1)
      const lane = X + (h32(seed, 0xab, k, r) % W)
      const len = 2 + (h32(seed, 0xac, k, r) % 4) // 2..5
      const lo = ya + l3RowH(seed, r) + 1, hi = yb - 2 - len
      if (hi < lo) continue
      const y0 = lo + (h32(seed, 0xad, k, r) % (hi - lo + 1))
      const fence = l3FenceAt(seed, k, r)
      for (let i = 0; i < len; i++) {
        const y = y0 + i
        if (fence && fence.y === y) continue
        if (!inChunk(lane, y) || !isF(lane - WX, y - WY) || solidAtL(lane, y)) continue
        pushStruct('trench', lane, y, 1, 1, false)
      }
    }
  }

  // ---- 电缆线束（cables，非实心贴墙装饰；连续 4~8 格成排，横贯长缆）----
  // 竖直廊道 ~50%/段（锚点跨 chunk 一致：位置是世界坐标函数）
  for (let k = kMin; k <= kMax; k++) {
    const X = l3CorrX(seed, k)
    if (ROOM || X + 4 < WX || X > WX + CS - 1) continue
    for (let r = rMin; r <= rMax; r++) {
      if (!l3Serve(seed, k, r) || h01(seed, 0xc7, k, r) >= 0.5) continue
      const W = l3CorrW(seed, k, r)
      const ya = l3RowY(seed, r), yb = l3RowY(seed, r + 1)
      const side = h32(seed, 0xc9, k, r) % 2 // 0 西墙邻 1 东墙邻
      const x = side === 0 ? X : X + W - 1
      const fence = l3FenceAt(seed, k, r)
      // 竖直成排仅走廊道纯内腔（南北横道行带由横向成排负责）——相邻段共享行带，不避会在交叉口重复放置
      const segTop = ya + l3RowH(seed, r), segBot = yb - 1
      const runLen = 4 + (h32(seed, 0xca, k, r, side) % 5) // 成排长度 4~8
      const maxStart = segBot - runLen + 1
      if (maxStart <= segTop) continue
      const runStart = segTop + (h32(seed, 0xcb, k, r, side) % (maxStart - segTop + 1))
      for (let y = runStart; y < runStart + runLen; y++) {
        if (fence && fence.y === y) continue
        if (!inChunk(x, y) || !isF(x - WX, y - WY) || solidAtL(x, y)) continue
        pushStruct('cables', x, y, 1, 1, false)
      }
    }
  }
  // 横向连廊 ~40%/条（北/南墙邻车道；世界坐标 9 格周期内连续 5 格成排，跨 chunk 自然对齐）
  for (let r = rMin; r <= rMax; r++) {
    const ry = l3RowY(seed, r), rh = l3RowH(seed, r)
    if (ry + rh - 1 < WY || ry > WY + CS - 1) continue
    if (ROOM || h01(seed, 0xc7, r, 0x99) >= 0.4) continue
    const side = h32(seed, 0xc9, r, 0x99) % 2
    const y = side === 0 ? ry : ry + rh - 1
    const off = h32(seed, 0xcb, r, 0x99, side) % 9
    for (let x = WX; x < WX + CS; x++) {
      if (((x - off) % 9 + 9) % 9 >= 5) continue // 每 9 格周期取连续 5 格成排
      if (!isF(x - WX, y - WY) || solidAtL(x, y)) continue
      if (structures.some((s2) => x >= s2.x && x < s2.x + s2.w && y >= s2.y && y < s2.y + s2.h)) continue // 与竖直成排交叉口不重叠
      pushStruct('cables', x, y, 1, 1, false)
    }
  }

  // ---- 配电箱（elecbox，可搜索容器；宽 ≥2 廊道 ~22%/段一台，墙邻地板瓦片）----
  for (let k = kMin; k <= kMax; k++) {
    const X = l3CorrX(seed, k)
    if (ROOM || X + 4 < WX || X > WX + CS - 1) continue
    for (let r = rMin; r <= rMax; r++) {
      if (!l3Serve(seed, k, r)) continue
      const W = l3CorrW(seed, k, r)
      if (W < 2 || h01(seed, 0xe1, k, r) >= 0.22) continue
      const ya = l3RowY(seed, r), yb = l3RowY(seed, r + 1)
      const side = h32(seed, 0xe2, k, r) % 2
      const x = side === 0 ? X : X + W - 1
      const lo = ya + l3RowH(seed, r) + 1, hi = yb - 2
      if (hi < lo) continue
      const y = lo + (h32(seed, 0xe3, k, r) % (hi - lo + 1))
      const fence = l3FenceAt(seed, k, r)
      if (fence && fence.y === y) continue
      if (!inChunk(x, y) || !isF(x - WX, y - WY) || solidAtL(x, y)) continue
      pushStruct('elecbox', x, y, 1, 1, false, true, { loot: 1 })
    }
  }

  // ---- 风化的雕像与宗教画（仅无门的整段铁栅栏之后：栏后 1~3 格，孤立展品）----
  // 雕像 ~22%（栏后区域保持空旷，雕像即唯一陈列；data.dmg 0 双臂残桩 / 1 单臂残桩+斜首 / 2 无头）；
  // 天使宗教画（wikidot：白色画布状宗教画作大多位于栅栏之后）——有雕像 25% 同挂，无雕像 20% 独挂
  for (let k = kMin; k <= kMax; k++) {
    const X = l3CorrX(seed, k)
    if (ROOM || X + 4 < WX || X > WX + CS - 1) continue
    for (let r = rMin; r <= rMax; r++) {
      const fence = l3FenceAt(seed, k, r)
      if (!fence || fence.gate >= 0) continue // 仅整段封死的栅栏（带栅栏门的不放）
      const W = l3CorrW(seed, k, r)
      const hasStatue = h01(seed, 0xf6, k, r) < 0.22
      if (hasStatue) {
        const dir = h01(seed, 0xf7, k, r) < 0.5 ? -1 : 1 // 栏北 / 栏南
        const dist = 1 + (h32(seed, 0xf8, k, r) % 3) // 栏后 1~3 格
        // 中线车道（偶数宽任选一条中央车道）
        const sx = X + (W >> 1) - (W % 2 === 0 ? h32(seed, 0xf9, k, r) % 2 : 0)
        const sy = fence.y + dir * dist
        if (inChunk(sx, sy) && isF(sx - WX, sy - WY)
          && !structures.some((s2) => sx >= s2.x && sx < s2.x + s2.w && sy >= s2.y && sy < s2.y + s2.h))
          pushStruct('statue', sx, sy, 1, 1, true, false, { dmg: h32(seed, 0xfa, k, r) % 3 })
      }
      if (h01(seed, 0xfb, k, r) < (hasStatue ? 0.25 : 0.2)) {
        const dir = h01(seed, 0xfc, k, r) < 0.5 ? -1 : 1
        const dist = 1 + (h32(seed, 0xfd, k, r) % 3)
        const side2 = h32(seed, 0xfe, k, r) % 2 // 0 西墙邻 1 东墙邻
        const px = side2 === 0 ? X : X + W - 1
        const py = fence.y + dir * dist
        if (inChunk(px, py) && isF(px - WX, py - WY)
          && !structures.some((s2) => px >= s2.x && px < s2.x + s2.w && py >= s2.y && py < s2.y + s2.h))
          pushStruct('megposter', px, py, 1, 1, false, false, { tex: 'angel_fresco.png', tall: 1 }) // 竖幅天使宗教画
      }
    }
  }

  // ---- 灯光（按变体沿廊道/横道布置；1 宽隧道覆盖为微弱灯光）----
  for (let k = kMin; k <= kMax; k++) {
    const X = l3CorrX(seed, k)
    if (ROOM || X + 4 < WX || X > WX + CS - 1) continue // 特征房间 chunk：灯光由房间内容提供
    for (let r = rMin; r <= rMax; r++) {
      if (!l3Serve(seed, k, r)) continue
      const W = l3CorrW(seed, k, r)
      const ya = l3RowY(seed, r), yb = l3RowY(seed, r + 1), rh1 = l3RowH(seed, r + 1)
      const lane = X + (W >> 1)
      if (lane < WX + 1 || lane > WX + CS - 2) continue
      const narrow = W === 1
      let y = Math.max(ya, WY + 1) + rng.int(0, 2)
      const yEnd = Math.min(yb + rh1 - 1, WY + CS - 2)
      while (y <= yEnd) {
        if (isF(lane - WX, y - WY) && !solidAtL(lane, y)) {
          if (narrow) pushLight(lane, y, 1.8, '#b0a48a') // 一人宽砖砌隧道：微弱灯光
          else if (variant === 'lit') pushLight(lane, y, rng.range(3.0, 3.6), '#d8dce0') // 昏暗但有序的冷白荧光
          else pushLight(lane, y, rng.range(2.2, 2.6), '#c9b694') // 晦暗区：稀疏昏黄
        }
        y += narrow ? rng.int(8, 14) : variant === 'lit' ? rng.int(5, 7) : rng.int(14, 22)
      }
    }
  }
  for (let r = rMin; r <= rMax; r++) {
    const ry = l3RowY(seed, r), rh = l3RowH(seed, r)
    if (ry < WY + 1 || ry > WY + CS - 2) continue
    if (ROOM) continue
    const laneY = ry + (rh >> 1)
    let x = WX + 2 + rng.int(0, 3)
    while (x < WX + CS - 2) {
      if (isF(x - WX, laneY - WY) && !solidAtL(x, laneY)) {
        if (variant === 'lit') pushLight(x, laneY, rng.range(3.0, 3.6), '#d8dce0')
        else pushLight(x, laneY, rng.range(2.2, 2.6), '#c9b694')
      }
      x += variant === 'lit' ? rng.int(5, 7) : rng.int(14, 22)
    }
  }

  // ---- 变体 tint（照明=18 砖墙暖灰 / 晦暗=19 积灰暗棕；只染地板、不覆盖已盖章）----
  // 特征房间 chunk 一律按照明廊道基底着色（圣所内腔已先盖 20，门洞残段取 18）
  const vTint = variant === 'dark' ? 19 : 18
  for (let y = 0; y < CS; y++)
    for (let x = 0; x < CS; x++)
      if (tiles[li(x, y)] === 1 && tint[li(x, y)] === 0) tint[li(x, y)] = vTint

  // ---- 地面散件/墙面细节（晦暗区：碎料堆/废金属；全变体少量涂鸦）----
  const placeOnFloor = (kind: Structure['kind'], solid: boolean, withSid = false, data?: Structure['data']): boolean => {
    for (let t = 0; t < 80; t++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
      if (structures.some((s2) => WX + x >= s2.x && WX + x < s2.x + s2.w && WY + y >= s2.y && WY + y < s2.y + s2.h)) continue
      if (solid && nearSpawn(WX + x, WY + y)) continue
      pushStruct(kind, WX + x, WY + y, 1, 1, solid, withSid, data)
      return true
    }
    return false
  }
  const placeWallHug = (kind: Structure['kind'], withSid = false, data?: Structure['data']): boolean => {
    for (let t = 0; t < 120; t++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
      if (!(isF(x + 1, y) && isF(x - 1, y) && isF(x, y + 1) && isF(x, y - 1))) {
        pushStruct(kind, WX + x, WY + y, 1, 1, false, withSid, data)
        return true
      }
    }
    return false
  }
  if (variant === 'dark') {
    for (let i = 0, n = rng.int(1, 2); i < n; i++) placeOnFloor('debrispile', false)
    for (let i = 0, n = rng.int(1, 2); i < n; i++) placeOnFloor('scrap', false)
    if (rng.chance(0.25)) placeWallHug('graffiti', true, { lore: rng.int(0, 5) })
  } else if (rng.chance(0.12)) placeWallHug('graffiti', true, { lore: rng.int(0, 5) })

  // ---- 物品（全后室最富：每 chunk 2~4 地面物品 + 低频磁带保底）----
  {
    const pool = [...def.items, ...UNIVERSAL_ITEMS]
    for (let i = 0, n = rng.int(2, 4); i < n; i++) {
      const t0 = rng.weighted(pool.map((p) => ({ v: p.type, w: p.w })))
      const t = t0 === 'almond' && rng.chance(0.1) ? 'cashew' : t0
      for (let tr = 0; tr < 30; tr++) {
        const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
        if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
        pushItem(t, WX + x, WY + y)
        break
      }
    }
    if (rng.chance(0.1)) {
      for (let tr = 0; tr < 40; tr++) {
        const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
        if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
        pushItem('tape', WX + x, WY + y)
        break
      }
    }
  }

  // ---- 容器（每 chunk 1~2 台：配电柜/工具箱/储物柜/M.E.G. 补给箱/保险箱；不堵一人宽隧道）----
  for (let i = 0, n = rng.int(1, 2); i < n; i++) {
    const kind = rng.pick(['cabinet', 'toolbox', 'locker', 'megcrate', 'safebox'] as const)
    for (let tr = 0; tr < 60; tr++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(WX + x, WY + y) || nearSpawn(WX + x, WY + y)) continue
      // 一人宽隧道：东西或南北对侧同为墙——实心容器放进去会堵死唯一通道（v51 修复：
      // 旧判据「至少一个四邻是地板」廊道内恒真，等于没拦）；并要求贴墙放置不挡路
      const wE = !isF(x + 1, y), wW = !isF(x - 1, y), wS = !isF(x, y + 1), wN = !isF(x, y - 1)
      if ((wE && wW) || (wS && wN)) continue
      if (!(wE || wW || wS || wN)) continue
      pushStruct(kind, WX + x, WY + y, 1, 1, true, true, { loot: 1 })
      break
    }
  }

  // ---- v53b：圣所彩色玻璃花窗（参考图三联窗：红翼持天平/三天使吹号/金翼持心）——贴内腔墙 2~4 扇。
  // 刻意放在容器/物品摆放之后：跨度校验必须能看到全部既有结构（此前在房间段内放置，
  // 晚到的容器会插进花窗跨度）。校验同大幅画作：跨度内每格背后皆墙（门洞否决）、前方皆地板、无既有结构 ----
  if (variant === 'sanct') {
    const GLASS = ['l3_glass_scales.png', 'l3_glass_trumpets.png', 'l3_glass_heart.png']
    for (let i = 0, n = rng.int(2, 4); i < n; i++) {
      let done2 = false
      for (let t = 0; t < 40 && !done2; t++) {
        const se = rng.int(0, 3) // 内腔四缘（局部 2 / CS-3，即 2 格厚墙环内侧）
        const x = se === 0 ? 2 : se === 1 ? CS - 3 : rng.int(2, CS - 3)
        const y = se === 2 ? 2 : se === 3 ? CS - 3 : rng.int(2, CS - 3)
        if (!isF(x, y)) continue
        const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]
        const d = dirs.find(([ddx, ddy]) => !isF(x + ddx, y + ddy))
        if (!d) continue
        const ph = 2.0 + rng.next() * 0.4 // 高 2.0~2.4m
        const pw = ph * (512 / 768) // 宽按贴图宽高比适配（不拉伸），约 1.3~1.6m
        const k = Math.ceil((pw - 0.6) / 2)
        const ax = d[1] !== 0 ? 1 : 0, ay = d[1] !== 0 ? 0 : 1
        let ok3 = true
        for (let j = -k; j <= k && ok3; j++) {
          const tx = x + ax * j, ty = y + ay * j
          if (tx < 1 || ty < 1 || tx >= CS - 1 || ty >= CS - 1) { ok3 = false; break }
          if (isF(tx + d[0], ty + d[1]) || !isF(tx, ty)) { ok3 = false; break }
          if (structures.some((s2) => tx + WX < s2.x + s2.w && tx + WX + 1 > s2.x && ty + WY < s2.y + s2.h && ty + WY + 1 > s2.y)) { ok3 = false; break }
        }
        if (!ok3) continue
        pushStruct('stainedglass', WX + x, WY + y, 1, 1, false, false, { tex: GLASS[i % 3], pw, ph })
        done2 = true
      }
    }
  }

  // ---- 火盐晶体（Object 15）：约 15% 的 chunk 在角落（≥2 面墙）产 1~2 枚 ----
  if (rng.chance(0.15)) {
    for (let i = 0, n = rng.int(1, 2); i < n; i++) {
      for (let t = 0; t < 40; t++) {
        const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
        if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
        const walls = (!isF(x + 1, y) ? 1 : 0) + (!isF(x - 1, y) ? 1 : 0) + (!isF(x, y + 1) ? 1 : 0) + (!isF(x, y - 1) ? 1 : 0)
        if (walls < 2) continue
        pushItem('firesalt', WX + x, WY + y)
        break
      }
    }
  }

  // ---- 湿地 + 旱虾（Entity 20）：约 22% 的 chunk 盖 1~3 格湿地并生成 1~2 只旱虾（圣所不生成）----
  if (variant !== 'sanct' && rng.chance(0.22)) {
    const wets: number[] = []
    for (let i = 0, n = rng.int(1, 3); i < n; i++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (isF(x, y) && tint[li(x, y)] !== 20 && !solidAtL(WX + x, WY + y)) { wet[li(x, y)] = 1; wets.push(li(x, y)) }
    }
    for (let i = 0, n = Math.min(wets.length, rng.int(1, 2)); i < n; i++) {
      const j = wets[rng.int(0, wets.length - 1)]
      entities.push({ type: 'dryshrimp', x: WX + (j % CS) + 0.5, y: WY + ((j / CS) | 0) + 0.5 }) // 世界坐标（GenChunk 契约）
    }
  }

  // ---- 实体（~38% 一只，~12% 第二只；笑魇必须落在无灯黑暗处；出生 chunk 与圣所不生成）----
  if (variant !== 'sanct' && (cx !== 0 || cy !== 0)) {
    const pickFloor = (dark: boolean): { x: number; y: number } | null => {
      for (let t = 0; t < 40; t++) {
        const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
        if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
        if (tint[li(x, y)] === 20) continue // 圣所（tint 20）永不生成实体
        if (dark && lights.some((l) => Math.hypot(l.x - (WX + x + 0.5), l.y - (WY + y + 0.5)) < l.r)) continue
        return { x: WX + x, y: WY + y }
      }
      return null
    }
    const n = rng.chance(0.38) ? (rng.chance(0.12) ? 2 : 1) : 0
    for (let i = 0; i < n; i++) {
      const type = rng.weighted(def.entities.map((e) => ({ v: e.type, w: e.w })))
      const p = pickFloor(type === 'smiler')
      if (!p) continue
      // v53：L3 高智能实体（wikidot Level 3）——按类型下发实例标记（instantiate 浅拷贝带入 def）
      if (type === 'deathmoth') {
        // 死亡飞蛾：更倾向于集群生成（2~4 只一小群，落在彼此相邻的地板格）
        for (let k = 0, cnt = rng.int(2, 4); k < cnt; k++) {
          const q = k === 0 ? p : pickFloor(false)
          if (q) entities.push({ type, x: q.x + 0.5, y: q.y + 0.5 })
        }
        continue
      }
      entities.push({ type, x: p.x + 0.5, y: p.y + 0.5, ...l3EntityMarks(type, rng) }) // v53 实例标记（v54 统一出口 l3EntityMarks）
    }
  }

  // ---- v53：尸鼠陷阱（wikidot L3：高智能尸鼠会在地面设陷阱）——~9% chunk 一处，
  // 玩家或实体踩上即被标记为尸鼠的猎物（触发逻辑见 engine/movement.ts 与 engine/entityAI.ts）----
  if (variant !== 'sanct' && (cx !== 0 || cy !== 0) && rng.chance(0.09)) {
    for (let t = 0; t < 20; t++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
      if (structures.some((s2) => s2.x === WX + x && s2.y === WY + y)) continue // 不与既有结构同格
      if (tint[li(x, y)] === 20) continue
      pushStruct('rattrap', WX + x, WY + y, 1, 1, false)
      break
    }
  }

  // ---- v53：大幅画作（wikidot L3「艺术品」：砖墙表面覆盖大块白色画布状材质，绘有来历不明的画作/素描）----
  // ~25% chunk 一处（v53b 提高生成率）。画布比例与贴图严格适配（宽=高×贴图宽高比，不拉伸）。
  // 放置前强制校验——画作必须挂在连续且足够大的墙面上，不卡进墙里：
  // ① 画作跨度内每一格背后都必须是墙（遇门洞/断口/虚空即否决）；② 跨度内正前方都必须是地板；
  // ③ 画前至少 2 格净空（一人宽隧道不挂，观看距离都不够）；④ 跨度内无既有结构
  if (variant !== 'sanct' && (cx !== 0 || cy !== 0) && rng.chance(0.25)) { // v53b：生成率 0.12→0.25
    const ARTS = [ // tex + 贴图宽高比（宽/高）——画布比例必须与贴图适配，不允许拉伸
      { tex: 'l3_art_angel.png', ar: 0.8 }, { tex: 'l3_art_skeleton.png', ar: 0.8 }, { tex: 'l3_art_sketch.png', ar: 0.8 },
    ]
    for (let t = 0; t < 40; t++) {
      const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
      if (!isF(x, y)) continue
      const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      const [dx, dy] = dirs[rng.int(0, 3)]
      if (isF(x + dx, y + dy)) continue // 该侧必须是墙
      if (!isF(x - dx, y - dy)) continue // 画前至少 2 格净空
      const art = ARTS[rng.int(0, 2)]
      const ph = 1.6 + rng.next() * 0.6 // 画布高 1.6~2.2m（底边 0.9m，墙高 4.2 远够用）
      const pw = ph * art.ar // v53b：宽按贴图宽高比推导（512×640 → 0.8），画布与贴图同比例不拉伸
      const k = Math.ceil((pw - 0.6) / 2) // 两端各探出中心格的格数（0.6m 余量防压门洞边）
      const ax = dy !== 0 ? 1 : 0, ay = dy !== 0 ? 0 : 1 // 沿墙走向单位向量
      let ok2 = true
      for (let i = -k; i <= k && ok2; i++) {
        const tx2 = x + ax * i, ty2 = y + ay * i
        if (tx2 < 1 || ty2 < 1 || tx2 >= CS - 1 || ty2 >= CS - 1) { ok2 = false; break }
        if (isF(tx2 + dx, ty2 + dy) || !isF(tx2, ty2)) { ok2 = false; break }
        if (tint[li(tx2, ty2)] === 20) { ok2 = false; break }
        if (structures.some((s2) => tx2 + WX < s2.x + s2.w && tx2 + WX + 1 > s2.x && ty2 + WY < s2.y + s2.h && ty2 + WY + 1 > s2.y)) { ok2 = false; break }
      }
      if (!ok2) continue
      pushStruct('bigpainting', WX + x, WY + y, 1, 1, false, false, { tex: art.tex, pw, ph })
      break
    }
  }

  // ---- v54：L3 三据点定居点地标（全部贴墙海报形——EL3A 海报形地标先例：data.poster=1 + data.tex）----
  // Gemma 基地（gamma ~3%）/ BNTG 存储设施（storage ~3%）独立判定；蓝色救赎（bluesalvation ~1%）显著更低。
  // 贴墙校验同 bigpainting 级别：挂点即地板 + 有邻侧墙（海报贴墙不浮空）、非一人宽隧道（对侧同为墙）、
  // 出生 chunk 与圣所/特征房间 chunk 不放。
  const posterLandmark = (outpost: string, tex: string, p: number) => {
    if (ROOM || (cx === 0 && cy === 0) || !rng.chance(p)) return // ROOM 含圣所（variant==='sanct'）——庇护所不打扰
    for (let t = 0; t < 40; t++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(WX + x, WY + y) || nearSpawn(WX + x, WY + y)) continue
      const wE = !isF(x + 1, y), wW = !isF(x - 1, y), wS = !isF(x, y + 1), wN = !isF(x, y - 1)
      if (!(wE || wW || wS || wN)) continue // 必须有邻侧墙（贴墙不浮空）
      if ((wE && wW) || (wS && wN)) continue // 一人宽隧道不挂（v53b 起 L3 地标既有约束）
      pushStruct('landmark', WX + x, WY + y, 1, 1, false, false, { outpost, poster: 1, tex })
      return
    }
  }
  posterLandmark('gamma', 'gamma_poster.png', 0.03)
  posterLandmark('storage', 'l3storage_poster.png', 0.03)
  posterLandmark('bluesalvation', 'bluesalvation_poster.png', 0.01)

  // ---- 出口（regionHost 超区域保底：每 RS3×RS3 chunk 区域 1 个，电梯 →L4/L5 各半，嵌墙放置）----
  // v54：L3 出口加密——专属超区域边长 RS3=6（192m，密度 ×1.78），不复用 RS=8（L0/L1 共用，不动）
  const RS3 = 6
  const regionHost3 = (sd: number, rx: number, ry: number) => ({
    cx: rx * RS3 + (h32(sd, 0xe11, rx, ry) % RS3),
    cy: ry * RS3 + (h32(sd, 0xe12, rx, ry) % RS3),
  })
  {
    const rx = Math.floor(cx / RS3), ry = Math.floor(cy / RS3)
    const host = regionHost3(seed, rx, ry)
    if (host.cx === cx && host.cy === cy && def.exits.length >= 2) {
      const t = exitTarget(seed, cx, cy)
      const er = h01(seed, 0xe9, rx, ry)
      const edef = def.exits[er < 0.5 ? 0 : 1] // v51：唯二电梯出口——电梯（→L4）/ 电梯（→L5）各半
      // 嵌墙：外向螺旋找「一侧为墙且墙后再 1 格仍非地板」的廊道地板，向墙内掏 1 格壁龛放电梯门
      // （门扇凹进墙面观感；几何层 DOOR_EXIT_KINDS 在壁龛旁墙开门洞）
      let spot: { x: number; y: number; nx: number; ny: number } | null = null
      outer: for (let rad = 0; rad <= 18 && !spot; rad++) {
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
            const x = t.x + dx, y = t.y + dy
            if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
            for (const [wx2, wy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              if (isF(x + wx2, y + wy2) || isF(x + wx2 * 2, y + wy2 * 2)) continue // 需墙 + 墙后仍实心
              spot = { x, y, nx: x + wx2, ny: y + wy2 }
              break outer
            }
          }
      }
      if (spot) {
        carveRectW(WX + spot.nx, WY + spot.ny, WX + spot.nx, WY + spot.ny) // 墙内 1 格壁龛
        exits.push({ def: edef, x: WX + spot.nx, y: WY + spot.ny, discovered: false })
        pushLight(WX + spot.nx, WY + spot.ny, 2.5, '#f5e37a') // 出口黄色标识灯
      }
    }
  }

  return { variant, tiles, wet, elev, step, tint, crawl, structures, items, lights, exits, entities }
}

// ---------- 注册（mapgen generateLevel → generateInfinite 经注册表分派）----------
registerInfiniteLevel(3, {
  genRaw: genL3ChunkRaw,
  variantOf: l3VariantOf,
  rareVariants: L3_RARE_VARIANTS,
  variantNames: L3_VARIANT_NAMES,
  variantLore: L3_VARIANT_LORE,
})
