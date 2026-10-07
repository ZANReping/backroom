import {genL0Architecture,l0RegionOf,newL0Space,l0RestoredDropPosition,type L0Layout,type L0SpaceState} from './l0Architecture'
import { newL1Dynamics, restoreL1Container, rememberL1Container, type L1Dynamics } from './l1Dynamics'
// ================= v17：Level 0「教学关卡」无限 chunk 流式生成 =================
// 以玩家为中心按 32×32 瓦片 chunk 流式生成/卸载；chunk 用「世界种子+chunk 坐标」
// 确定性生成（同种子重访同 chunk 内容一致）。chunk 间通过共享边哈希的「边缘开口」
// 缝合：每条 chunk 边界的走廊开口位置由两侧 chunk 用同一哈希计算，墙壁/走廊自然衔接。
// 迷宫（回溯 DFS，全覆盖连通）+ 柱厅（旧 pillars 别名）+ 开阔区混合；稀有变体房间见 variantOf。
import { RNG } from '../core/rng'
import {placeL0StarterSupplies} from './starterSupplies'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { preparedL11, prefetchL11 } from './l11ChunkCache'
import { takePreparedChunk, prefetchChunks } from './chunkCache'
import { makeEntity, type Entity } from '../entities'
import type { NpcState } from '../content/npcs'
import type { GameMap } from './mapgen'
import { fixHanging, HANGING_KINDS, waterItemZForTile } from './mapgen'
export { waterItemZForTile } // Level 7 无限生成器：chunk raw 阶段计算水面漂浮/水底沉没物品高度
import type { ExitInstance, FloorBand, GroundItem, LevelDef, LightSource, Structure } from '../core/types'

export const CS = 32 // chunk 边长（瓦片）
export const WIN_R = 2 // 窗口半径（chunk）：5×5 chunk = 160×160 瓦片
export const WIN_CHUNKS = WIN_R * 2 + 1
export const WIN_TILES = WIN_CHUNKS * CS
export const RS = 8 // 出口保底超区域边长（chunk）：8×8 chunk = 256m，任意 500m 半径圆必含完整区域
export const GEN_ITEM_BASE = 0x200000 // 生成器固有物品 id 起点（玩家掉落物 id < 此值）

export type L0Variant =
  | 'maze' | 'pillars' | 'open' // 常规：迷宫 / 柱厅（pillars 为旧别名）/ 开阔区
  | 'arch' | 'pillarhall' | 'pit' // 较稀有：拱厅 / 柱厅 / 深坑
  | 'blackout' | 'manila' // 稀有：熄灯区 / 马尼拉室
  | 'red' // 极稀有：红室

export const VARIANT_NAMES: Record<L0Variant, string> = {
  maze: '迷宫', pillars: '柱厅', open: '开阔区',
  arch: '拱厅', pillarhall: '柱厅', pit: '深坑',
  blackout: '熄灯区', manila: '马尼拉室', red: '红室',
}
// 变种房间（开发者面板/图鉴档案展示用；常规地形 maze/pillars/open 不计入）
export const RARE_VARIANTS: readonly L0Variant[] = ['arch', 'pillarhall', 'pit', 'blackout', 'manila', 'red']

// 变种房间详细档案（图鉴；设定依据 Backrooms 维基 Level 0「结构异常」章节）
export const VARIANT_LORE: Record<string, string[]> = {
  arch: [
    '苍白墙壁上点缀着连续的拱形孔洞，地毯明显增厚，拱洞宽度恰好可供体型较小者倚坐片刻，暂时摆脱湿润的地面。',
    '拱厅是 Level 0 中稳定性最佳的区域：身后的空间既不会移动，也不会发生形变，是流浪者辨认方向、喘息休整的锚点。档案建议：可以喘息，但别过夜——稳定不代表安全。',
  ],
  pillarhall: [
    '纵横交错、棋盘状排列的巨大立柱房间，有时绵延数英里。地毯绒毛较浅、地面相对干燥，是本层少数适合入睡的区域。',
    '多名流浪者报告：探索柱厅时身后的路径会频繁变动，立柱位置不再对称，来路因此难以辨认。档案建议：选好朝向，坚持走下去，不要试图原路返回。',
  ],
  pit: [
    '直通地底深处的方形坑洞，成群出现且呈整齐的网格状排列，通常不难绕行。坑内一片漆黑，光线只能穿透数英尺，往下望不见底。',
    '坠入者遭遇何种命运尚不可知——没有任何坠落后生还的报告。身体极度疲惫或脱水时判断力下降，深坑将变得格外危险。档案要求：发现坑群立刻绕行，严禁靠近探头张望。',
  ],
  blackout: [
    '完全无照明的整片区域。荧光灯不再嗡鸣，四周陷入死一般的寂静；墙壁触感粗糙，部分地面向下凹陷，低洼处常有没过脚踝的积液。',
    '在低可见度的掩映下，熄灯区会不断变动，极难穿行。档案建议：一旦误入，立刻向视线中的第一缕微光狂奔，或循着任意嗡鸣声前行，直至找到出口。',
  ],
  manila: [
    'The Manila Room（马尼拉室）。Level 0 中罕见出现的一间 8×8 米净室，厚墙四面设有木门并连接外环廊；菱形壁纸、木地板、偏置的八角柜桌和一正一倒两把椅子构成固定陈设。生存难度 0，无敌对实体。',
    '它是 Level 0「孤立效应」唯一已知的例外：房间与外环廊的核心区域解除孤立效应，所有进入者都能在同一位置看见彼此；边缘则以渐变方式显现，因此成为流浪者约定的安全会合点。',
    '桌上保留盖有 M.E.G. 徽记的文件夹，内容涵盖剪辑（no-clip）说明、最常见与最危险实体的图鉴，以及重要层级指南；柜内保留一次性补给。补给不会自动补货，搜刮状态应由房间持续记录。',
    '灯光保持平稳，接近房间时 Level 0 的嗡鸣逐渐退去，随后响起舒缓的钢琴声。房间不会触发敲墙惊吓、强制熄灯或理智伤害。',
  ],
  red: [
    '与 Level 0 整体完全割裂的异常区域。一旦完全进入便再也无法逃离，面临死循环的困境；即便只是身处附近，也会引发严重的幽闭恐惧与急性妄想。',
    '可借助迹象判断距离：色调是否变为红色，地毯是否变得厚重、粘稠且粗砺，墙纸是否剥落、露出下方的血红色。档案唯一的应对方法：彻底远离——即刻转身，径直离开。',
  ],
}

export interface LiveChunk {
  l0?: L0Layout
  up2?: Uint8Array
  upWall2?: Uint8Array
  stair?: Uint32Array
  key: string
  cx: number
  cy: number
  variant: string // v29：变体 id（L0=maze/pillars/… L1=aisle/parking/…，宽松化为 string 支持多无限层级）
  tiles: Uint8Array // CS*CS 局部
  wet: Uint8Array
  elev: Uint8Array
  tint: Uint8Array // 0=无 1=马尼拉 2=红室 3=熄灯
  crawl: Uint8Array // v41：蹲伏低通道（L2 扭曲的廊道；其余层级恒全 0）
  outdoor?: Uint8Array // v54：室外瓦片（L4 窗景区窗外虚空；缺省=全室内，stitch 补 0）
  ceiling?: Uint8Array // v54：挑高瓦片（L5 主厅；缺省=正常层高，stitch 补 0）
  liquid?: Uint8Array // v54：液体瓦片（L5 室内泳池；缺省=无液体，stitch 补 0）
  dn?: Uint8Array // v56 九轮：地下可走地板瓦片（Level 6 -1F；缺省=全 0）
  dnWall?: Uint8Array // v56 九轮：地下墙体瓦片（Level 6 -1F；缺省=全 0）
  up?: Uint8Array // v57m：上层楼板瓦片（L7 入口舱体 2F）
  upWall?: Uint8Array // v57m：上层墙体瓦片（L7 入口舱体墙壁）
  seaFloor?: Float32Array // v57o：海床深度（L7 垂直深度轴）
  terrain?: Float32Array
  caveCeil?: Float32Array // L8 有机洞穴绝对洞顶高度
  // 以下为「活体」对象（窗口坐标，随窗口平移；跨平移保持对象身份与状态）
  structures: Structure[]
  items: GroundItem[]
  lights: LightSource[]
  exits: ExitInstance[]
  entities: Entity[] // v25：chunk 生成实体（L0 实体绝迹故恒为空；卸载即消失，不持久化动态状态）
  npcs: NpcState[] // v39：chunk 生成 NPC（衔尾段 BRC 员工；与实体同一契约——卸载即消失，重访按 raw 重建）
  habFallback?: Record<string, number> // v27：本 chunk 栖息地降级计数（缝合时并入 m.habitatFallback）
}

// 被卸载 chunk 的动态状态（loot/开门/已读涂鸦/掉落物/追加光源/出口发现）
export interface ChunkDynState {
  structs: { sid: number; looted?: boolean; data?: Record<string, number | string | boolean | string[]> }[]
  extraItems: GroundItem[] // 世界坐标
  extraLights: LightSource[] // 世界坐标
  exitDisc: boolean
}

export interface InfiniteState {
  l0Pending?: import("../engine/l0State").L0Pending
  l0?: L0SpaceState
  mothAlerts?: { all: boolean; nests: Record<string, boolean> }
  l1Dynamics?: L1Dynamics
  // Compact permanent inventory ledger, independent of the bounded geometry/chunk cache.
  cityContainers?: Record<string, { items: string[]; looted?: boolean; searched?: boolean }>
  cityClock?: number
  cityMutable?: boolean
  cityRevisions?: Record<string, number>
  cityUnloaded?: Record<string, number>
  seed: number
  ox: number // 窗口原点（世界瓦片坐标，chunk 对齐）
  oy: number
  chunks: Map<string, LiveChunk> // 当前窗口内已加载 chunk（≤25）
  explored: Map<string, Uint8Array> // 每 chunk 已探索位图（CS*CS，持久；小地图用）
  state: Map<string, ChunkDynState> // 已卸载 chunk 动态状态（有界 LRU）
  taken: Set<number> // 已拾取的生成器固有物品 id
  regionExits: Map<string, { x: number; y: number }> // 超区域出口世界坐标缓存
  regionExitMiss: Set<string> // v57t：无出口区域的负缓存（L7 稀有出口——避免 HUD 每次全量生成宿主 chunk）
  rev: number // 窗口版本号（每次平移 +1，渲染层同步用）
  redo?: number // chunk 几何强制重建计数（红室蔓延等全图着色变化时 +1，渲染层据此重建全部已构建 chunk）
  plague?: boolean // 红室蔓延：玩家进入红室后，全部区域（含新生成）强制红室化且不产物资
  blackout?: boolean // v29：L1 停电事件——stitch 时剔除 gen=1 且无 keep 标记的灯（维护通廊 keep 灯除外）
}

// ---------- 确定性哈希（负坐标安全）----------
export function h32(...nums: number[]): number {
  let h = 0x811c9dc5
  for (const n of nums) {
    h ^= n >>> 0
    h = Math.imul(h, 0x01000193)
    h ^= h >>> 13
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 16
  }
  return h >>> 0
}
const h01 = (...n: number[]) => h32(...n) / 4294967296

export const chunkKey = (cx: number, cy: number) => `${cx},${cy}`
// 结构稳定 sid：窗口内 (cx&0xff, cy&0xff) 不重复（窗口仅 5 chunk 宽），n<16 个带状态结构/chunk

// ---------- 变体判定（独立哈希流，不消耗布局 RNG）----------
export function variantOf(seed:number,cx:number,cy:number):L0Variant{return l0RegionOf(seed,cx,cy)}

// ---------- 多无限层级注册表（v29：L0 内置；L1 等由 infiniteL1.ts 注册，避免循环依赖）----------
// 实现位于 infiniteRegistry.ts（无依赖独立模块，防循环初始化 TDZ）
import { registerInfiniteLevel, infiniteImplFor, type GenChunk } from './infiniteRegistry'
export { infiniteImplFor, type GenChunk }

// ---------- 边缘开口（两侧 chunk 共享同一边哈希 → 自然缝合）----------
// 竖直边（cx, cy）|(cx+1, cy) 之间：key = ('v', cx+1, cy)；水平边：('h', cx, cy+1)
// 开口槽位对齐迷宫格（10 格），开口 2 瓦片宽
export function edgeOpen(seed: number, vertical: boolean, a: number, b: number): boolean[] {
  const slots = new Array<boolean>(10).fill(false)
  let count = 0
  for (let k = 0; k < 10; k++) {
    if (h01(seed, vertical ? 0xed9e : 0xed9f, a, b, k) < 0.3) { slots[k] = true; count++ }
  }
  if (count === 0) slots[h32(seed, vertical ? 0xf0c0 : 0xf0c1, a, b) % 10] = true // 每条边保底 1 开口
  return slots
}

// 台阶编码（与 mapgen 一致：dir(低3位) | lo档<<3 | hi档<<5；档：0正常 1低洼-1.2m）
export const encStep = (dir: number, lo: number, hi: number) => dir | (lo << 3) | (hi << 5)

// ---------- 出口保底：每 RS×RS chunk 超区域恰有 1 个出口「闪烁的墙壁」 ----------
export function regionHost(seed: number, rx: number, ry: number): { cx: number; cy: number } {
  return {
    cx: rx * RS + (h32(seed, 0xe11, rx, ry) % RS),
    cy: ry * RS + (h32(seed, 0xe12, rx, ry) % RS),
  }
}
// 出口 chunk 内目标点（确定性；实际出口=最近的「地板且邻墙」瓦片）
export function exitTarget(seed: number, cx: number, cy: number): { x: number; y: number } {
  return { x: 6 + (h32(seed, 0xe21, cx, cy) % 20), y: 6 + (h32(seed, 0xe22, cx, cy) % 20) }
}

// ---------- chunk 生成（世界坐标内容；纯函数：同种子同坐标必一致）----------
// ---------- chunk 生成（世界坐标内容；纯函数：同种子同坐标必一致；GenChunk 契约见 infiniteRegistry）----------
// v54：导出供设计模式数据提取（game/design/extractLayouts.ts）按变体生成代表性 chunk；游戏行为不变
export function genL0ChunkRaw(def:LevelDef,seed:number,cx:number,cy:number,forceVariant?:L0Variant):GenChunk {
  return genL0Architecture(def,seed,cx,cy,forceVariant)
}

// ================= 窗口管理：加载/卸载/平移/状态持久化 =================

const STATE_CAP = 600 // 卸载 chunk 动态状态 LRU 上限（内存控制）
const EXPLORED_CAP = 800 // 已探索位图上限

function mapSetCapped<K, V>(map: Map<K, V>, key: K, val: V, cap: number) {
  if (map.has(key)) map.delete(key)
  map.set(key, val)
  while (map.size > cap) map.delete(map.keys().next().value!)
}

// 由确定性 raw 数据 + 持久动态状态实例化「活体」chunk（窗口坐标对象）
function instantiate(def: LevelDef, inf: InfiniteState, cx: number, cy: number, ox: number, oy: number): LiveChunk {
  const key = chunkKey(cx, cy)
  if (def.id === 11 && inf.cityUnloaded?.[key] !== undefined) {
    const last=inf.cityUnloaded[key], age=(inf.cityClock??0)-last, revision=inf.cityRevisions?.[key]??0
    if (inf.cityMutable !== false && age>=180 && h32(inf.seed,cx,cy,revision,Math.floor(last))%100<12) (inf.cityRevisions??={})[key]=revision+1
    delete inf.cityUnloaded[key]
  }
  const raw = def.id === 0 ? genL0Architecture(def,inf.seed,cx,cy,undefined,inf.l0?.revisions[key]??0,inf.l0?.redProgress) : def.id === 11 ? preparedL11(def, inf.seed, cx, cy, inf.cityRevisions?.[key] ?? 0)
    : (!inf.plague ? takePreparedChunk(def, inf.seed, cx, cy) : undefined) ?? infiniteImplFor(def.id).genRaw(def, inf.seed, cx, cy, inf.plague ? 'red' : undefined)
  const st = inf.state.get(key)
  const structures: Structure[] = raw.structures.map((s) => {
    const live: Structure = { ...s, x: s.x - ox, y: s.y - oy, data: s.data ? { ...s.data } : undefined }
    const saved = st?.structs.find((q) => q.sid === (s.data?.sid as number | undefined))
    if (saved) {
      if (saved.looted) live.looted = true
      if (saved.data) {
        const dynamic={...saved.data}
        if(def.id===11){delete dynamic.color;delete dynamic.style;delete dynamic.revision}
        live.data = { ...live.data, ...dynamic }
        // v31：可交互门（维护通廊墨黑金属门）——恢复 open 时同步 solid（开门不阻挡）
        // v41：hoteldoor 同样恢复（L2 废弃公共带的房间门）
        // v51：bargate 同样恢复（L3 发电站铁栅栏门）
        if ((live.kind === 'inkdoor' || live.kind === 'hoteldoor' || live.kind === 'bargate') && saved.data.open !== undefined) live.solid = !saved.data.open
      }
    }
    const inventory=def.id===11?inf.cityContainers?.[`${key}:${s.data?.sid}`]:undefined
    if(inventory){live.looted=inventory.looted;live.data={...live.data,lootItems:[...inventory.items],searched:inventory.searched?1:0}}
    if(def.id===1)restoreL1Container(inf.l1Dynamics??=newL1Dynamics(),inf.seed,cx,cy,live,ox,oy)
    return live
  })
  const items: GroundItem[] = raw.items
    .filter((it) => !inf.taken.has(it.id))
    .map((it) => ({ ...it, x: it.x - ox, y: it.y - oy }))
  // 卸载时保存的玩家掉落物（世界坐标 → 窗口坐标）
  for (const e of st?.extraItems ?? []) {
    if (!inf.taken.has(e.id)) {const p=raw.l0?l0RestoredDropPosition(raw.l0,e.x,e.y):e;items.push({ ...e, x:p.x-ox, y:p.y-oy })}
  }
  const lights: LightSource[] = raw.lights.map((l) => ({ ...l, x: l.x - ox, y: l.y - oy }))
  for (const e of st?.extraLights ?? []) {const p=raw.l0?l0RestoredDropPosition(raw.l0,e.x,e.y):e;lights.push({ ...e, x:p.x-ox, y:p.y-oy })}
  const exits: ExitInstance[] = raw.exits.map((e) => ({ def: e.def, x: e.x - ox, y: e.y - oy, floor: e.floor, z: e.z, discovered: st?.exitDisc ?? false }))
  // v25：chunk 实体（栖息地过滤结果，世界坐标 → 窗口坐标）
  // v41：calm 实例标记（L2 被动死亡飞蛾）——浅拷贝 def 置被动语义，不污染共享实体定义
  // v44：scale 实例标记（L2 温顺死亡飞蛾体型 0.6）——与 calm 一并浅拷贝带入
  const entities: Entity[] = raw.entities.map((e) => {
    const ent = makeEntity(e.type, e.x - ox, e.y - oy, e.z ?? 0, e.mothForm)
    ent.mothNest = e.mothNest
    if (ent.def.type === 'deathmoth' && inf.mothAlerts?.all && ent.def.mothForm !== 'larva') ent.provoked = true
    if (e.calm || e.scale !== undefined) ent.def = { ...ent.def, ...(e.calm ? { passive: true } : {}), ...(e.scale !== undefined ? { scale: e.scale } : {}) }
    if (def.id === 5 && ent.def.type === 'deathmoth' && ent.def.mothForm === 'male') ent.def = { ...ent.def, passive: true, grudge: true, hunts: undefined }
    // v53：L3 高智能实体标记——hostile 剥除被动（无面灵转敌意）；tool 石器（伤害 +6）；
    // l3face/capybara 形态变体；human 窃皮者伪装成流浪者（接近后暴起，见 entityAI）
    if (e.hostile || e.tool || e.l3face || e.capybara) ent.def = { ...ent.def, ...(e.hostile ? { passive: false } : {}), ...(e.tool ? { tool: true, damage: ent.def.damage + 6 } : {}), ...(e.l3face ? { l3face: true } : {}), ...(e.capybara ? { capybara: true } : {}) }
    if (e.ceilingCrawler || e.arachnidMorph || e.arachnidBreed !== undefined || e.herbivore) ent.def = {
      ...ent.def,
      ...(e.ceilingCrawler ? { ceilingCrawler: true } : {}),
      ...(e.arachnidMorph ? { arachnidMorph: e.arachnidMorph } : {}),
      ...(e.arachnidBreed !== undefined ? { arachnidBreed: e.arachnidBreed } : {}),
      ...(e.herbivore ? { herbivore: true, passive: true } : {}),
    }
    if (e.human) ent.disguised = 'human'
    if (e.facing !== undefined) ent.facing = e.facing // v51：人制品售货机等生成时指定朝向
    return ent
  }).filter((e) => {
    // v58：「7 层之物」全窗口唯一——已有活体在载时，新 chunk 的个体不再挂载（本层同时只存在一只）
    return !(e.def.type === 'thething' && [...inf.chunks.values()].some((c) => c.entities.some((q) => q.def.type === 'thething' && !q.dead)))
  })
  // v39：chunk NPC（BRC 员工；定义由 raw 内嵌，工作点即岗位锚点，面向工作面）
  const npcs: NpcState[] = (raw.npcs ?? []).map((sp) => ({
    id: sp.def.id, def: sp.def,
    x: sp.x - ox, y: sp.y - oy, facing: sp.facing ?? Math.random() * Math.PI * 2,
    homeX: sp.x - ox, homeY: sp.y - oy, homeFacing: sp.facing,
    tx: sp.x - ox, ty: sp.y - oy,
    moveT: 1 + Math.random() * 5, bubbleText: '', bubbleT: 0,
    hp: sp.def.faction === 'brc' ? 55 : sp.def.faction === 'jerry' ? 45 : undefined, // BRC 员工/信众可伤害可杀死；其余 NPC 无敌（据点居民契约）
  }))
  return { key, cx, cy, l0: raw.l0, variant: raw.variant, tiles: raw.tiles, wet: raw.wet, elev: raw.elev, tint: raw.tint, crawl: raw.crawl, outdoor: raw.outdoor, ceiling: raw.ceiling, liquid: raw.liquid, dn: raw.dn, dnWall: raw.dnWall, up: raw.up, upWall: raw.upWall, up2: raw.up2, upWall2: raw.upWall2, stair: raw.stair, seaFloor: raw.seaFloor, terrain: raw.terrain, caveCeil: raw.caveCeil, structures, items, lights, exits, entities, npcs, habFallback: raw.habFallback }
}

// 把已加载 chunk 内容缝合进窗口数组与对象列表
function stitch(m: GameMap, explored?: Uint8Array) {
  const inf = m.inf!
  const W = m.w
  m.tiles.fill(0)
  m.wet.fill(0); m.elev.fill(0); m.outdoor.fill(0); m.step.fill(0)
  m.crawl.fill(0); m.ceiling.fill(0); m.up.fill(0); m.upWall.fill(0)
  m.up2.fill(0); m.upWall2.fill(0) // v54：三层数组同步清空
  m.stair.fill(0); m.liquid.fill(0); m.tint.fill(0)
  m.seaFloor.fill(1.7) // v57o：非 L7 chunk 回落到标准池深
  m.dn.fill(0); m.dnWall.fill(0) // v56 九轮：地下平面数组同步清除
  m.terrain?.fill(0)
  m.caveCeil?.fill(0)
  if (explored) explored.fill(0)
  m.structures = []; m.items = []; m.lights = []; m.exits = []
  const habFb: Record<string, number> = {}
  for (const c of inf.chunks.values()) {
    if (c.habFallback) for (const [k, v] of Object.entries(c.habFallback)) habFb[k] = (habFb[k] ?? 0) + v
    const x0 = c.cx * CS - inf.ox, y0 = c.cy * CS - inf.oy
    for (let y = 0; y < CS; y++) {
      const dstRow = (y0 + y) * W + x0
      const srcRow = y * CS
      for (let x = 0; x < CS; x++) {
        const si = srcRow + x, di = dstRow + x
        m.tiles[di] = c.tiles[si]
        m.wet[di] = c.wet[si]
        m.elev[di] = c.elev[si]
        m.tint[di] = c.tint[si]
        m.crawl[di] = c.crawl[si] // v41：蹲伏低通道随窗口缝合（L2 扭曲的廊道）
        if (c.outdoor) m.outdoor[di] = c.outdoor[si] // v54：室外瓦片随窗口缝合（L4 窗景区窗外虚空）
        if (c.ceiling) m.ceiling[di] = c.ceiling[si] // v54：挑高瓦片随窗口缝合（L5 主厅挑高）
        if (c.liquid) m.liquid[di] = c.liquid[si] // v54：液体瓦片随窗口缝合（L5 室内泳池）
        if (c.dn) m.dn[di] = c.dn[si] // v56 九轮：地下可走地板随窗口缝合（L6 -1F 走廊）
        if (c.seaFloor) m.seaFloor[di] = c.seaFloor[si] // v57o：海床深度随窗口缝合（L7 垂直深度轴）
        if (c.dnWall) m.dnWall[di] = c.dnWall[si] // v56 九轮：地下墙体随窗口缝合（L6 -1F）
        if (c.up) m.up[di] = c.up[si] // v57m：上层楼板随窗口缝合（L7 入口舱体 2F）
        if (c.upWall) m.upWall[di] = c.upWall[si] // v57m：上层墙体随窗口缝合
        if (c.up2) m.up2[di] = c.up2[si]
        if (c.upWall2) m.upWall2[di] = c.upWall2[si]
        if (c.stair) m.stair[di] = c.stair[si]
        if (c.terrain && m.terrain) m.terrain[di] = c.terrain[si]
        if (c.caveCeil && m.caveCeil) m.caveCeil[di] = c.caveCeil[si]
      }
    }
    // 台阶：raw 的 step 未存进 LiveChunk（pit 台阶由 elev 派生重建）——这里按 elev 边重建
    m.structures.push(...c.structures.filter(s=>!s.data?.l1Hidden))
    m.items.push(...c.items.filter((it) => !inf.taken.has(it.id)))
    m.lights.push(...c.lights)
    m.exits.push(...c.exits)
    // v25：chunk 实体按对象身份并入（不重建 m.entities，保留活体状态；已死实体由引擎清理）
    for (const e of c.entities) if (!e.dead && !m.entities.includes(e)) m.entities.push(e)
    if (explored) {
      const bm = inf.explored.get(c.key)
      if (bm)
        for (let y = 0; y < CS; y++)
          for (let x = 0; x < CS; x++) if (bm[y * CS + x]) explored[(y0 + y) * W + x0 + x] = 1
    }
  }
  // v57m：窗口内任一 chunk 提供上层楼板时，本层按 2F 图处理（L7 入口舱体）
  m.floors = [...inf.chunks.values()].some(c => c.up2?.some(v => v === 1)) ? 3 : [...inf.chunks.values()].some((c) => c.up?.some((v) => v === 1)) ? 2 : 1
  m.hasUnderground = [...inf.chunks.values()].some(c => c.dn?.some(v => v === 1))
  // v27：栖息地降级计数并入（与有限层 GameMap.habitatFallback 同契约，供验证器/调试面板读取）
  m.habitatFallback = habFb
  // v29：L1 停电事件——剔除层级固有灯（维护通廊 keep 灯与玩家追加灯保留）
  if (inf.blackout) m.lights = m.lights.filter((l) => l.keep === 1 || !l.gen)
  // pit 台阶重建：低洼与正常高度交界处生成双向坡道（确定性，与生成器一致）
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (m.elev[i] !== 1) continue
      if (x > 0 && m.elev[i - 1] === 0) m.step[i] = encStep(2, 1, 0)
      else if (x < W - 1 && m.elev[i + 1] === 0) m.step[i] = encStep(1, 1, 0)
      else if (y > 0 && m.elev[i - W] === 0) m.step[i] = encStep(4, 1, 0)
      else if (y < W - 1 && m.elev[i + W] === 0) m.step[i] = encStep(3, 1, 0)
    }
  // v26：窗口级悬挂物兜底校验（跨 chunk 边界查重/天花板依附；冲突就近移位或取消）。
  // m.structures 与 LiveChunk.structures 共享对象引用——取消项需同步回各 chunk，
  // 否则下次窗口平移重新缝合时被移除的悬挂物会复活
  fixHanging(m)
  for (const c of inf.chunks.values()) {
    if (c.structures.some((s) => HANGING_KINDS.includes(s.kind)))
      c.structures = c.structures.filter((s) => !HANGING_KINDS.includes(s.kind) || m.structures.includes(s))
  }
}

// 保存窗口已探索位图到各 chunk（平移/卸载前调用）
export function saveExplored(m: GameMap, explored: Uint8Array) {
  const inf = m.inf!
  const W = m.w
  for (const c of inf.chunks.values()) {
    const x0 = c.cx * CS - inf.ox, y0 = c.cy * CS - inf.oy
    let bm = inf.explored.get(c.key)
    if (!bm) { bm = new Uint8Array(CS * CS); mapSetCapped(inf.explored, c.key, bm, inf.l0?Infinity:EXPLORED_CAP) }
    for (let y = 0; y < CS; y++)
      for (let x = 0; x < CS; x++) {
        const v = explored[(y0 + y) * W + x0 + x]
        if (v) bm[y * CS + x] = 1
      }
  }
}

// 卸载 chunk：持久化动态状态（世界坐标存储）
export function snapshotChunkState(m: GameMap, c: LiveChunk):ChunkDynState {
  const inf = m.inf!
  const st: ChunkDynState = { structs: [], extraItems: [], extraLights: [], exitDisc: false }
  for (const s of c.structures) {
    if(m.l1Architecture)rememberL1Container(inf.l1Dynamics??=newL1Dynamics(),c.cx,c.cy,s)
    const sid = s.data?.sid as number | undefined
    if (sid === undefined) continue
    const rec: ChunkDynState['structs'][number] = { sid }
    if (s.looted) rec.looted = true
    // 保存可能变化的 data 字段（门/容器/涂鸦/窗户等）
    const d = s.data
    if (d) {
      const dyn: Record<string, number | string | boolean | string[]> = {}
      for (const k of ['open', 'locked', 'opened', 'triggered', 'readHint', 'loreIdx', 'on', 'car', 'carZ', 'searched', 'deployed', 'forced'] as const) {
        const v = d[k]
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') dyn[k] = v
      }
      // v18：容器持久内容物（剩余物品数组，拷贝防引用共享）
      if (Array.isArray(d.lootItems)) dyn.lootItems = [...(d.lootItems as string[])]
      if (Object.keys(dyn).length) rec.data = dyn
    }
    if (rec.looted || rec.data) st.structs.push(rec)
    if(inf.cityClock!==undefined&&Array.isArray(d?.lootItems)&&(s.looted||d.searched||d.opened)){
      (inf.cityContainers??={})[`${c.key}:${sid}`]={items:[...d.lootItems],looted:s.looted,searched:!!d.searched}
    }
  }
  for (const it of c.items) {
    if (it.id < GEN_ITEM_BASE && m.items.includes(it)) st.extraItems.push({ ...it, x: it.x + inf.ox, y: it.y + inf.oy })
  }
  for (const l of c.lights) {
    if (!l.gen) st.extraLights.push({ ...l, x: l.x + inf.ox, y: l.y + inf.oy })
  }
  for (const e of c.exits) if (e.discovered) st.exitDisc = true
  return st
}
function evictChunk(m:GameMap,c:LiveChunk){
  const inf=m.inf!,st=snapshotChunkState(m,c)
  // v25：卸载 chunk 时其实体一并移出窗口（不持久化；重访时按 raw 栖息地过滤结果重建）
  if (c.entities.length > 0) m.entities = m.entities.filter((e) => !c.entities.includes(e))
  mapSetCapped(inf.state, c.key, st, inf.l0?Infinity:STATE_CAP)
  inf.chunks.delete(c.key)
  if (inf.cityClock !== undefined) (inf.cityUnloaded??={})[c.key]=inf.cityClock
}

// 初始生成（无限层级入口；v29 泛化：按 def.id 经注册表分派 chunk 生成器）
// v29：firstVisit=false 时跳过出生点物资散落（初始物资仅首次到层刷新，杜绝往返刷物资）
export function generateInfinite(def: LevelDef, seed: number, firstVisit = true): GameMap {
  const W = WIN_TILES
  const impl = infiniteImplFor(def.id)
  const m: GameMap = {
    l1Architecture: def.id === 1,
    w: W, h: W,
    tiles: new Uint8Array(W * W),
    structures: [], items: [], lights: [], exits: [], entities: [],
    spawn: { x: WIN_R * CS + 16, y: WIN_R * CS + 16 },
    wet: new Uint8Array(W * W),
    elev: new Uint8Array(W * W),
    outdoor: new Uint8Array(W * W),
    step: new Uint8Array(W * W),
    crawl: new Uint8Array(W * W),
    ceiling: new Uint8Array(W * W),
    up: new Uint8Array(W * W),
    upWall: new Uint8Array(W * W),
    up2: new Uint8Array(W * W), // v54：三层楼板（无限层缺省无三层）
    upWall2: new Uint8Array(W * W),
    stair: new Int32Array(W * W),
    liquid: new Uint8Array(W * W),
    seaFloor: new Float32Array(W * W).fill(1.7),
    floors: 1,
    tint: new Uint8Array(W * W),
    dn: new Uint8Array(W * W), // v56 九轮：地下平面（Level 6 -1F；其余层级全 0）
    dnWall: new Uint8Array(W * W), // v56 九轮：地下墙体（Level 6 -1F；其余层级全 0）
    hasUnderground: def.id === 6,
    terrain: new Float32Array(W * W),
    caveCeil: new Float32Array(W * W),
    organicCave: impl.caveVolume !== undefined,
    caveVolumeId: impl.caveVolume ? def.id : undefined,
    l7SeaTerrain: def.id === 7,
    l10LakeTerrain: def.id === 10,
    inf: {
      seed, ox: -WIN_R * CS, oy: -WIN_R * CS,
      l0: def.id===0?newL0Space():undefined,
      chunks: new Map(), explored: new Map(), state: new Map(),
      taken: new Set(), regionExits: new Map(), regionExitMiss: new Set(), rev: 0,
    },
  }
  const inf = m.inf!
  for (let cy = -WIN_R; cy <= WIN_R; cy++)
    for (let cx = -WIN_R; cx <= WIN_R; cx++)
      inf.chunks.set(chunkKey(cx, cy), instantiate(def, inf, cx, cy, inf.ox, inf.oy))
  stitch(m)
  // 出生点：缺省=世界原点 chunk 中心（局部 15,15）；无限层级可用 spawnWorld 指定固定出生点
  // （Level 7 入口房间——进入 L7 固定出生在 2F 舱体里）。兜底螺旋找「该楼层带地板且无实心结构遮挡」的落点。
  const spawnW = impl.spawnWorld ?? { x: 15, y: 15 }
  const spawnFloor = impl.spawnFloor ?? 0
  const spx = spawnW.x - inf.ox, spy = spawnW.y - inf.oy
  m.spawn = { x: spx, y: spy }
  const spawnBlocked = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= W) return true
    // L2 racks use fractional footprints. Validate the actual player centre
    // (loadLevel adds .5), including body radius, rather than the tile corner.
    if(def.id===0||def.id===2)return !canOccupy(m,x+.5,y+.5,PLAYER_RADIUS,{z:0})
    const i = y * W + x
    if (spawnFloor === 1) {
      if (m.up[i] !== 1 || m.upWall[i] === 1) return true
      return m.structures.some((s) => s.solid && (s.floor ?? 0) === 1 && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    }
    if (m.tiles[i] !== 1) return true
    return m.structures.some((s) => s.solid && (s.floor ?? 0) === 0 && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  }
  if (spawnBlocked(spx, spy)) {
    outer: for (let r = 1; r < 10; r++)
      for (let j = -r; j <= r; j++)
        for (let i = -r; i <= r; i++)
          if (!spawnBlocked(spx + i, spy + j)) { m.spawn = { x: spx + i, y: spy + j }; break outer }
  }
  // 开局物资散落（玩家一无所有：绷带 + 杏仁水 + 手电筒 + 随机消耗品，散在出生点周围）
  // v29：仅 Level 0 首次到层（firstVisit）刷新——重访不再重复生成；Level 1 起不再发放
  if (firstVisit && def.id === 0) {
    const rng0 = new RNG(h32(seed, 0x5eed))
    placeL0StarterSupplies(m,rng0.pick(['bandage','canned','battery','glowstick','coffee']))
  }
  // v34：首次进入 Level 1——出生点旁放「致新流浪者的纸条」+ 一瓶杏仁水
  // （wikidot Level 1：探险者总署把纸条附在特别制作的杏仁水瓶上；查看纸条即收录图鉴「文档」）
  if (firstVisit && def.id === 1) {
    const rng0 = new RNG(h32(seed, 0x5eed, 1))
    const scatter = ['welcomenote', 'almond']
    const solidAt0 = (x: number, y: number) =>
      m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    let placed = 0
    for (let r = 1; r < 6 && placed < scatter.length; r++) {
      for (let t = 0; t < 40 && placed < scatter.length; t++) {
        const x = m.spawn.x + rng0.int(-r, r), y = m.spawn.y + rng0.int(-r, r)
        if (x < 1 || y < 1 || x >= W - 1 || y >= W - 1) continue
        if (m.tiles[y * W + x] !== 1 || solidAt0(x, y)) continue
        if (m.items.some((it) => Math.abs(it.x - x - 0.5) < 0.9 && Math.abs(it.y - y - 0.5) < 0.9)) continue
        m.items.push({ id: Math.random(), type: scatter[placed++], x: x + 0.5, y: y + 0.5 })
      }
    }
  }
  return m
}

// 每帧调用：玩家跨出中心 chunk 时平移窗口（流式加载/卸载）。
// 返回平移量（瓦片；引擎据此反向平移玩家/粒子等动态坐标），未平移返回 null。
export function updateInfinite(m: GameMap, def: LevelDef, px: number, py: number, explored?: Uint8Array): { dx: number; dy: number } | null {
  const inf = m.inf
  if (!inf) return null
  const pcx = Math.floor((inf.ox + px) / CS)
  const pcy = Math.floor((inf.oy + py) / CS)
  if (def.id === 11) prefetchL11(def, inf.seed, pcx, pcy, inf.cityRevisions)
  else if (!inf.plague) prefetchChunks(def, inf.seed, pcx, pcy, inf.chunks)
  const nox = (pcx - WIN_R) * CS
  const noy = (pcy - WIN_R) * CS
  if (nox === inf.ox && noy === inf.oy) return null
  const dx = nox - inf.ox, dy = noy - inf.oy

  if (explored) saveExplored(m, explored)
  // 吸收漂浮掉落物/追加光源到所属 chunk 活体列表（按旧窗口世界边界）
  const inAnyChunk = <T>(list: (c: LiveChunk) => T[], v: T) => {
    for (const c of inf.chunks.values()) if (list(c).includes(v)) return true
    return false
  }
  const absorb = <T extends { x: number; y: number }>(arr: T[], pred: (v: T) => boolean, getList: (c: LiveChunk) => T[]) => {
    for (const v of arr) {
      if (!pred(v) || inAnyChunk(getList, v)) continue
      const ccx = Math.floor((inf.ox + v.x) / CS), ccy = Math.floor((inf.oy + v.y) / CS)
      const c = inf.chunks.get(chunkKey(ccx, ccy))
      if (c) getList(c).push(v)
    }
  }
  absorb(m.items, (it) => it.id < GEN_ITEM_BASE, (c) => c.items)
  absorb(m.lights, (l) => !l.gen, (c) => c.lights)

  // v33：实体归属重定——追击/游荡离开出生 chunk 的实体改挂当前所在 chunk。
  // 否则其实体仍属出生 chunk，该 chunk 掉出窗口卸载时会把正在玩家脸上的实体一并移除
  // （“追击途中凭空消失”）；重定后实体随所在 chunk 存活，只有离玩家足够远才被卸载。
  for (const e of m.entities) {
    if (e.dead) continue
    const ccx = Math.floor((inf.ox + e.x) / CS), ccy = Math.floor((inf.oy + e.y) / CS)
    const home = inf.chunks.get(chunkKey(ccx, ccy))
    if (home?.entities.includes(e)) continue
    // 脱离旧归属（所在 chunk 未加载时 home 为空：高速位移的兜底——先摘出来，走下方无归属平移）
    for (const oc of inf.chunks.values()) {
      const i = oc.entities.indexOf(e)
      if (i >= 0) { oc.entities.splice(i, 1); break }
    }
    if (home) home.entities.push(e)
  }
  // v39：NPC 归属重定（与实体同契约）——锚定员工本不移动，仅坦白后敌对追击的员工会跨 chunk
  for (const c of inf.chunks.values()) {
    for (let i = c.npcs.length - 1; i >= 0; i--) {
      const n = c.npcs[i]
      if (n.dead) continue
      const ccx = Math.floor((inf.ox + n.x) / CS), ccy = Math.floor((inf.oy + n.y) / CS)
      const home = inf.chunks.get(chunkKey(ccx, ccy))
      if (!home || home === c) continue
      c.npcs.splice(i, 1)
      home.npcs.push(n)
    }
  }

  // 卸载窗口外 chunk（持久化动态状态）
  const ncx0 = pcx - WIN_R, ncy0 = pcy - WIN_R
  for (const c of [...inf.chunks.values()]) {
    if (c.cx < ncx0 || c.cx > ncx0 + WIN_CHUNKS - 1 || c.cy < ncy0 || c.cy > ncy0 + WIN_CHUNKS - 1) evictChunk(m, c)
  }
  // 幸存 chunk：活体对象随窗口反向平移
  for (const c of inf.chunks.values()) {
    for (const s of c.structures) { s.x -= dx; s.y -= dy }
    for (const it of c.items) { it.x -= dx; it.y -= dy }
    for (const l of c.lights) { l.x -= dx; l.y -= dy }
    for (const e of c.exits) { e.x -= dx; e.y -= dy }
    for (const e of c.entities) { e.x -= dx; e.y -= dy; e.targetX -= dx; e.targetY -= dy } // v25；v33 补 target（游荡/调查目标同为窗口坐标）
    for (const n of c.npcs) { n.x -= dx; n.y -= dy; n.homeX -= dx; n.homeY -= dy; n.tx -= dx; n.ty -= dy } // v39：chunk NPC 同样随窗口平移
  }
  // v33：仍无 chunk 归属的实体（所在 chunk 未加载的召唤/事件实体）同样随窗口平移，
  // 否则窗口跳动后它们保留旧窗口坐标——视觉上相对世界“瞬移”一个 chunk
  for (const e of m.entities) if (!inAnyChunk((c) => c.entities, e)) { e.x -= dx; e.y -= dy; e.targetX -= dx; e.targetY -= dy }
  inf.ox = nox; inf.oy = noy
  // 加载新进入窗口的 chunk
  for (let cy = ncy0; cy < ncy0 + WIN_CHUNKS; cy++)
    for (let cx = ncx0; cx < ncx0 + WIN_CHUNKS; cx++) {
      const key = chunkKey(cx, cy)
      if (!inf.chunks.has(key)) inf.chunks.set(key, instantiate(def, inf, cx, cy, inf.ox, inf.oy))
    }
  stitch(m, explored)
  inf.rev++
  return { dx, dy }
}

// ---------- 红室蔓延：玩家进入红室后触发，已加载区域就地红室化，后续新 chunk 强制红室 ----------
export function applyRedPlague(m: GameMap) {
  const inf = m.inf
  if (!inf || inf.plague) return
  inf.plague = true
  for (const c of inf.chunks.values()) {
    c.variant = 'red'
    c.tint.fill(2)
    for (const l of c.lights) if (l.gen) l.color = '#ff2a1a'
    c.items = c.items.filter((it) => it.id < GEN_ITEM_BASE) // 撤掉生成物资（保留玩家掉落物）
  }
  stitch(m)
  inf.rev++
  inf.redo = (inf.redo ?? 0) + 1 // 已烘焙的 chunk 几何颜色失效，通知渲染层全部重建
}

// ---------- 无限模式出口定位（解析式：无需加载 chunk，超区域出口世界坐标缓存）----------
export function l0RegionExitPos(m: GameMap, rx: number, ry: number, def: LevelDef, floor?: FloorBand): { x: number; y: number } | null {
  const inf = m.inf!
  const key = `${rx},${ry},${floor ?? '*'}`
  const hit = inf.regionExits.get(key)
  if (hit) return hit
  if (inf.regionExitMiss.has(key)) return null // v57t：无出口区域不再重复生成宿主 chunk
  if(inf.l0?.trapped)return null
  const impl = infiniteImplFor(def.id)
  const host = regionHost(inf.seed, rx, ry)
  // v57t：L7 用轻量解析式锚点（完整 chunk 生成只为拿一个出口位置太贵；HUD 每帧都会调用最近出口）
  const light = impl.regionExitPos?.(inf.seed, rx, ry)
  const e = light ?? (() => {
    const raw = impl.genRaw(def, inf.seed, host.cx, host.cy, inf.plague ? 'red' : undefined)
    const found = raw.exits.find((q) => floor === undefined || (q.floor ?? 0) === floor)
    return found ? { x: found.x + 0.5, y: found.y + 0.5, z: found.z } : null
  })()
  if (!e) {
    if (inf.regionExitMiss.size < 2048) inf.regionExitMiss.add(key)
    return null
  }
  // light 锚点返回瓦片坐标（与 raw exits.x 同约定），统一转瓦片中心
  const pos = light ? { x: e.x + 0.5, y: e.y + 0.5 } : { x: e.x, y: e.y }
  mapSetCapped(inf.regionExits, key, pos, 256)
  return pos
}

// 距世界点 (wx, wy) 最近的保底出口（返回窗口坐标 + 距离）
export function l0NearestExit(m: GameMap, def: LevelDef, wx: number, wy: number, floor?: FloorBand): { x: number; y: number; d: number } | null {
  const inf = m.inf
  if (!inf) return null
  const rx = Math.floor(wx / (CS * RS)), ry = Math.floor(wy / (CS * RS))
  let best: { x: number; y: number } | null = null, bd = 1e9
  // v57t：L7 的新出口（午夜岩洞/深水浮门）按概率稀疏分布——按区域环逐圈外扩搜索，
  // 找到当前最近环中的出口即可停止（更外环的距离必然更远）。
  const maxRing = def.id === 7 ? 5 : 1
  for (let r = 0; r <= maxRing && !best; r++) {
    for (let j = ry - r; j <= ry + r; j++) {
      for (let i = rx - r; i <= rx + r; i++) {
        if (Math.max(Math.abs(i - rx), Math.abs(j - ry)) !== r) continue
        const p = l0RegionExitPos(m, i, j, def, floor)
        if (!p) continue
        const d = Math.hypot(p.x - wx, p.y - wy)
        if (d < bd) { bd = d; best = p }
      }
    }
  }
  if (!best) return null
  return { x: best.x - inf.ox - 0.5, y: best.y - inf.oy - 0.5, d: bd }
}

// ---------- 开发者/测试辅助：搜索最近指定变体 chunk（世界坐标中心）----------
// v29：fn 参数支持多无限层级（缺省 L0 variantOf；L1 传 infiniteImplFor(1).variantOf）
export function findNearestVariant(seed: number, wx: number, wy: number, kind: string, maxR = 60, fn: (seed: number, cx: number, cy: number) => string = variantOf): { cx: number; cy: number; d: number } | null {
  const pcx = Math.floor(wx / CS), pcy = Math.floor(wy / CS)
  let bcx = 0, bcy = 0, bd = 1e9, found = false
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const cx = pcx + dx, cy = pcy + dy
        if (fn(seed, cx, cy) !== kind) continue
        const d = Math.hypot(dx, dy)
        if (d < bd) { bd = d; bcx = cx; bcy = cy; found = true }
      }
    if (found) return { cx: bcx, cy: bcy, d: bd }
  }
  return null
}

// ---------- v29：外部触发重缝合（停电恢复等需要立即按当前 chunk 重建窗口数组）----------
export function restitch(m: GameMap) {
  if (m.inf) stitch(m)
}

// L0 注册（内置层级；L1 等由 infiniteL1.ts 自行注册）
registerInfiniteLevel(0, {
  genRaw: (def, seed, cx, cy, fv) => genL0ChunkRaw(def, seed, cx, cy, fv as L0Variant | undefined),
  variantOf,
  rareVariants: RARE_VARIANTS,
  variantNames: Object.fromEntries(Object.entries(VARIANT_NAMES).filter(([key]) => key !== 'pillars')) as Record<L0Variant, string>,
  variantLore: VARIANT_LORE,
})

/** Restore a saved L0 space without consuming items or changing other levels. */
export function rebuildL0(m:GameMap,def:LevelDef,explored?:Uint8Array){
 const inf=m.inf!;for(const c of [...inf.chunks.values()])inf.chunks.set(c.key,instantiate(def,inf,c.cx,c.cy,inf.ox,inf.oy));stitch(m,explored);inf.rev++;inf.redo=(inf.redo??0)+1
}
