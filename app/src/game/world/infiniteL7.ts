// ================= Level 7「Thalassophobia」无限 chunk 生成 =================
// 设计总纲（Wikidot Level 7 为主，Fandom 骨粉浓雾/重力异常作为氛围事件吸收）：
//
// 1) 入口房间（世界坐标纯函数，固定在 chunk (0,0) 内，绝不随机；v57n：位于 2F）：
//    锈蚀金属舱体楼板写入 up/upWall：一层保持完整海面/海床，舱体悬浮在 3m 高的 2F。
//    房间矩形 x11..18 × y12..17（8×6），门廊 x14..15 × y18..24；
//    舱体墙=upWall，所有家具/舱门/系缆桩均标记 floor:1。
//    西墙立 1×3 金属书橱（可搜索，来历不明的书籍由 bookcase 容器池提供）；
//    小号咖啡桌（x14,y14）+ 一把椅子（x16,y14）；低垂荧光吊灯（hanglight data.cabin）+ 通风口。
//    门廊尽头是钢灰舱门（x14,y24），门外（x14,y25）即深海。开门瞬间 forceL7PorchDrop 把门边玩家甩入海中。
//    门廊入口（x15,y18）有系缆桩 ropeanchor：部署后绳索先沿门廊延伸到出口（x15,y23），
//    再从出口外一格（x15,y25）垂到海面；海面可靠近绳底攀回 2F 门廊出口。
//    世界原点 (15,15) 即出生点：spawnWorld + spawnFloor=1 固定落在 2F 舱室内。
// 2) 无限海洋：除岩石岛外，所有瓦片 tile=1、liquid=1（深海可下潜游泳）、elev=0、wet=1；
//    舱体下方的一层瓦片同样是海面/海床，因此舱底是镂空悬海结构。
//    海面普遍自然光：L7 专用 ambient/hemi 基线 + 大半径冷色自然光 + 提亮的半透明海面材质。
// 3) 四个深度带 = 真正的垂直轴（v57o）：每瓦片海床深度由世界坐标 fBm 噪声生成
//    （10m~430m，舱体附近保持浅海），深度带按「海床深度」垂直划分：
//      daylight <24m / twilight <90m / midnight <230m / abyss ≥230m。
//    海床高度、水下雾、光衰减、水压伤害都按 seaFloor 逐瓦片计算；
//    玩家可实际下潜穿越四个深度带，内容按深度带落在对应海床上。
// 4) 岩石岛：chunk 本地确定性圆形岩岛（完全落在本 chunk 内，不跨边界），liquid=0、
//    中心 elev=2、岸线 elev=0，中心放 rockisle；避让入口房间/出生点/固定出口。
// 5) 出口（v57t 起只有两种，各有专属建模）：
//    - l7cave：午夜带海床上概率出现的岩洞洞口 → Level 8；每个午夜 8×8 宿主区域必有锚点；
//    - notexit：深水中极罕见地漂着一扇标着「不是出口」的门 → Level 4（出口自带 z，浮在水中）。
// 6) 实体：出生安全区（|cx|,|cy|≤1）不生成。小小只在日光带/暮色带；7 层之物只在
//    午夜带/深渊带；v57t 起死亡飞蛾不再生成。
// 7) 物资：地面物品按 zone 概率散在水面/水底（z 由 waterItemZForTile 决定——金属/肉罐下沉，
//    绳索/纸张/木制品漂浮）；容器 bookcase/barrel/crate/bonepile/corpse 挂 sid 持久化搜刮。
//
// 纯函数契约：同 (seed,cx,cy) 永远输出相同 GenChunk；动态状态（容器搜刮/物品拾取）走 sid/taken。
import { RNG } from '../core/rng'
import { UNIVERSAL_ITEMS } from '../content/items'
import type { LevelDef, Structure, LightSource, ExitInstance, GroundItem } from '../core/types'
import { CS, GEN_ITEM_BASE, RS, h32, regionHost, waterItemZForTile } from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'

// ---------- 变体 / 深度带 ----------
export type L7Variant = 'entry' | 'ocean' | 'daylight' | 'twilight' | 'midnight' | 'abyss' // daylight..abyss 仅供深度显示/传送历史兼容，生成不再按水平区块划分
export const L7_VARIANT_NAMES: Record<L7Variant, string> = {
  entry: '入口房间', ocean: '开放海洋', daylight: '有光带', twilight: '微光带', midnight: '午夜带', abyss: '深渊',
}
export const L7_VARIANT_LORE: Record<string, string[]> = {
  entry: [
    '入口房间——从 Level 6 下来的楼梯尽头。左墙一架书橱，里面有几本来源不明的书；一张小咖啡桌、一把椅子、一盏荧光吊灯。',
    '地毯上积着一层不深于水洼的浅水。房间侧向嵌在海洋空间的天花板里：南墙门廊之外，重力就换成了海的那一套。',
    '档案警告：一旦跨出门廊落进海里，没有绳索或梯子的人很难再爬回这间屋子。',
  ],
  daylight: [
    '有光带（Daylight Zone）——四个深度带里最亮也最荒芜的一层。头顶是混凝土天花板，脚下只有看不到边的海水。',
    '这里没有任何固定光源，却弥漫着来源不明的昏暗自然光；水面亮得能看见海床，海床上却几乎什么都没有。',
  ],
  twilight: [
    '微光带（Twilight Zone）——下潜约一公里会到达的区域。光几乎消失，海床上开始出现散乱的骨头和锈蚀的金属。',
    '在骨堆之间，偶尔能看见一具完整的类人骨架：下颌异常增大，牙很尖，两条腿的末端是鳍。',
  ],
  midnight: [
    '午夜带（Midnight Zone）——再往下约三公里，光被彻底吞掉。大量类人骨架之间，躺着结构「不可理解」的巨鱼骨架。',
    '在海床上能捞到合成纤维的碎片。档案说，这说明午夜带的海床下面也铺着地毯。',
  ],
  abyss: [
    '深渊（The Abyss）——七公里以下。没有光，没有鱼，只有山丘状的焦油与岩石堆，气泡不停地从里面冒出来。',
    '在这里失去意识的人会在别处醒来。档案不建议你验证这句话。',
  ],
}
export const L7_RARE_VARIANTS: readonly string[] = ['entry', 'ocean']

// 入口房间与世界固定地标（世界瓦片坐标）
export const L7_ORIGIN = { x: 15, y: 15 } // 出生点 = 世界原点
export const L7_ENTRY = { x0: 11, y0: 12, x1: 18, y1: 17, doorX: [14, 15], doorY: 18 }
// 增长后的门廊：自房间南墙门口向南延伸，尽头是一扇通往海洋的舱门（hoteldoor data.l7porch）
export const L7_PORCH = { x0: 13, x1: 16, y0: 18, y1: 24, innerX0: 14, innerX1: 15, door: { x: 14, y: 24 }, drop: { x: 14, y: 25 } }
// 尼龙绳系缆桩位于门廊入口；部署后绳索从门廊出口 (15,24) 垂到舱门外海面 (14,25)
export const L7_ROPE = { anchor: { x: 15, y: 18 }, top: { x: 15, y: 23 }, base: { x: 15, y: 25 } }

// v58：「小小的谎言」环形结构场——入口房间正西 150m 暮色带浅台（世界坐标纯函数，各 chunk 一致裁剪）
export const L7_ARENA = { x: -135, y: 15, r: 12, depth: 46 } // 圆心 / 石柱环半径 / 压平海床深度（暮色带 24~90m）

const h01 = (...n: number[]) => h32(...n) / 4294967296
const smooth = (t: number) => t * t * (3 - 2 * t)

/** 平滑值噪声：给海床深度场提供连续、无缝的水平变化。 */
function l7ValueNoise(seed: number, salt: number, wx: number, wy: number, scale: number): number {
  const fx = wx / scale, fy = wy / scale
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const tx = smooth(fx - x0), ty = smooth(fy - y0)
  const v = (x: number, y: number) => h01(seed, salt, x, y) * 2 - 1
  const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx
  const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx
  return (a + (b - a) * ty) * 0.5
}

/** 海床深度原始场（未平滑）。v57q：公开入口再做 3×3 加权低通，确保相邻瓦片/相邻 chunk 平滑。 */
function l7SeaFloorRaw(seed: number, wx: number, wy: number): number {
  const n = l7ValueNoise(seed, 0x170a, wx, wy, 260) * 0.5
    + l7ValueNoise(seed, 0x170b, wx, wy, 600) * 0.32
    + l7ValueNoise(seed, 0x170c, wx, wy, 900) * 0.18
  // v57s：罕见的上升海床——用确定性稀疏岛核抬高海床，越过海平面后形成荒岛。
  // 岛核连续、跨 chunk 使用同一世界坐标，因此岛屿边缘与周围海床平滑衔接。
  const IS = 160
  const cx0 = Math.floor(wx / IS), cy0 = Math.floor(wy / IS)
  let rise = 0
  for (let gy = -1; gy <= 1; gy++)
    for (let gx = -1; gx <= 1; gx++) {
      const ccx = cx0 + gx, ccy = cy0 + gy
      if (h01(seed, 0x1710, ccx, ccy) >= 0.03) continue
      const px = ccx * IS + 55 + (h32(seed, 0x1711, ccx, ccy) % 50)
      const py = ccy * IS + 55 + (h32(seed, 0x1712, ccx, ccy) % 50)
      const rr = 18 + (h32(seed, 0x1713, ccx, ccy) % 26)
      const d = Math.hypot(wx - px, wy - py)
      if (d < rr) rise += 85 * Math.pow(1 - d / rr, 2)
    }
  const raw0 = 10 + Math.pow(Math.max(0, Math.min(1, n + 0.5)), 2.0) * 460 - rise
  // v58：真实随机起伏——中尺度沙丘/海岭/海沟（36~90m 倍频，振幅随深度放大，深渊带呈山丘状，
  // 与档案「山丘状的焦油与岩石堆」一致）+ 小尺度碎起伏（13m 沙纹）；
  // 出生浅滩经 k 混合保持平缓，岛核区 bd=0 自动平息（岛屿判定不受干扰）
  const bd = Math.max(0, raw0)
  const mid = l7ValueNoise(seed, 0x171d, wx, wy, 90) * 0.55 + l7ValueNoise(seed, 0x171e, wx, wy, 36) * 0.45
  const ridge = 1 - Math.abs(l7ValueNoise(seed, 0x171f, wx, wy, 55) * 2) // 脊状沙纹（三角尖峰 0..1）
  const detail = bd * (0.11 * mid + 0.05 * (ridge - 0.45))
    + l7ValueNoise(seed, 0x1720, wx, wy, 13) * Math.min(2.0, 0.4 + bd * 0.012)
  let raw = raw0 + detail
  // v58：环形结构场海床压平——圆心 26m 内渐变为平坦暮色浅台（跨 chunk 连续，与岛核判定错开）
  const ad = Math.hypot(wx - L7_ARENA.x, wy - L7_ARENA.y)
  if (ad < 26) {
    const flat = L7_ARENA.depth + l7ValueNoise(seed, 0x1721, wx, wy, 7) * 1.1 // 场内微起伏
    const kf = smooth(Math.min(1, Math.max(0, (ad - L7_ARENA.r) / 14))) // 环外 14m 渐变带
    raw = flat + (raw - flat) * kf
  }
  const r = Math.hypot(wx - L7_ORIGIN.x, wy - L7_ORIGIN.y)
  // v57t：出生点所在 chunk 内是几乎平坦的浅海台地（r≲22 时 k=0，海床只随 3×3 低通轻微起伏），
  // 离开出生 chunk 后才开始向深处过渡，约 150m 外完全交给 fBm 深海场。
  const shallow = 7 + Math.min(r, 22) * 0.02
  const k = smooth(Math.min(1, Math.max(0, (r - 22) / 128)))
  return shallow + (raw - shallow) * k
}

/** 瓦片级海床深度（米，水面以下，正数）。3×3 低通让出生点浅海与外界海床、chunk 边界都连续平滑。 */
export function l7SeaFloorAt(seed: number, wx: number, wy: number): number {
  let sum = 0
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1
      sum += l7SeaFloorRaw(seed, wx + dx, wy + dy) * w
    }
  return Math.max(0, sum / 16)
}

/** v57t：世界瓦片是否能成为荒岛（与 genL7ChunkRaw 的判定完全一致：海床抬升到 0.6m 以内，
 *  且避开出生台地、入口舱体/门廊）。 */
export function l7CanIslandAt(seed: number, wx: number, wy: number): boolean {
  if (l7SeaFloorAt(seed, wx, wy) > 0.6) return false
  if (Math.hypot(wx - L7_ORIGIN.x, wy - L7_ORIGIN.y) < 64) return false
  if (wx >= L7_ENTRY.x0 - 4 && wx <= L7_ENTRY.x1 + 4 && wy >= L7_ENTRY.y0 - 4 && wy <= L7_PORCH.y1 + 4) return false
  return true
}

/** v57t：解析式搜索最近的荒岛（开发者面板「传送到最近岛屿」）。只扫描 160m 岛核单元——与
 *  l7SeaFloorRaw 的岛核完全同源，无需逐瓦片生成整个海洋。 */
export function l7NearestIsland(seed: number, wx: number, wy: number, maxR = 2200): { x: number; y: number; d: number } | null {
  const IS = 160
  const pcx = Math.floor(wx / IS), pcy = Math.floor(wy / IS)
  const rings = Math.max(1, Math.ceil(maxR / IS) + 1)
  let best: { x: number; y: number; d: number } | null = null
  for (let r = 0; r <= rings; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const ccx = pcx + dx, ccy = pcy + dy
        if (h01(seed, 0x1710, ccx, ccy) >= 0.03) continue
        const px = ccx * IS + 55 + (h32(seed, 0x1711, ccx, ccy) % 50)
        const py = ccy * IS + 55 + (h32(seed, 0x1712, ccx, ccy) % 50)
        if (!l7CanIslandAt(seed, px, py)) continue
        const d = Math.hypot(px - wx, py - wy)
        if (!best || d < best.d) best = { x: px, y: py, d }
      }
    }
  }
  return best
}

/** 深度带按「瓦片海床深度」垂直划分（不是距入口的水平距离）。 */
export function l7ZoneAt(seed: number, wx: number, wy: number): Exclude<L7Variant, 'entry'> {
  const d = l7SeaFloorAt(seed, wx, wy)
  if (d < 24) return 'daylight'
  if (d < 90) return 'twilight'
  if (d < 230) return 'midnight'
  return 'abyss'
}

/** v57p：chunk 不再按水平区块划分光带——非出生 chunk 一律是开放海洋；深度带只由玩家所在瓦片 seaFloor 决定。 */
export function l7VariantOf(seed: number, cx: number, cy: number): L7Variant {
  void seed
  if (cx === 0 && cy === 0) return 'entry'
  return 'ocean'
}

/** 纯深度带：按海床深度垂直划分（供瓦片级内容与 HUD 使用）。 */
export function l7ZoneOfDepth(depth: number): Exclude<L7Variant, 'entry' | 'ocean'> {
  if (depth < 24) return 'daylight'
  if (depth < 90) return 'twilight'
  if (depth < 230) return 'midnight'
  return 'abyss'
}

// ---------- chunk 生成（纯函数） ----------
export function genL7ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string): GenChunk {
  const variant = (forceVariant as L7Variant | undefined) ?? l7VariantOf(seed, cx, cy)
  const rng = new RNG(h32(seed, 0x1700, cx, cy))
  const N = CS * CS
  const tiles = new Uint8Array(N).fill(1) // 开放海洋：整 chunk 都是可走深水
  const wet = new Uint8Array(N).fill(1)
  const elev = new Uint8Array(N)
  const step = new Uint8Array(N)
  const tint = new Uint8Array(N) // v57p：不再按水平 chunk 涂光带 tint；光照完全由深度驱动
  const crawl = new Uint8Array(N)
  const liquid = new Uint8Array(N).fill(1)
  const seaFloor = new Float32Array(N) // v57o：每瓦片海床深度（垂直深度轴）
  const up = new Uint8Array(N) // v57m：L7 入口舱体位于 2F
  const upWall = new Uint8Array(N)
  const outdoor = new Uint8Array(N) // v57r：除入口舱体以外的海洋全部为室外——无天花板，使用室外自然光
  const structures: Structure[] = []
  const items: GroundItem[] = []
  const lights: LightSource[] = []
  const exits: ExitInstance[] = []
  const entities: GenChunk['entities'] = []
  const li = (x: number, y: number) => y * CS + x
  const WX = cx * CS, WY = cy * CS
  for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) seaFloor[li(x, y)] = l7SeaFloorAt(seed, WX + x, WY + y)
  const inChunk = (x: number, y: number) => x >= WX && x < WX + CS && y >= WY && y < WY + CS
  let sidN = 0, itemN = 0
  const sidOf = (n: number) => ((cx & 0xff) << 24) | ((cy & 0xff) << 16) | ((n & 0xff) << 4) | 7
  const pushStruct = (kind: Structure['kind'], x: number, y: number, w: number, h: number, solid: boolean, withSid = false, data?: Structure['data'], floor: 0 | 1 | 2 = 0) => {
    if (!inChunk(x, y)) return
    const d = withSid ? { ...data, sid: sidOf(sidN++) } : data
    structures.push({ kind, x, y, w, h, solid, data: d, floor })
  }
  const pushItem = (type: string, x: number, y: number) => {
    if (!inChunk(x, y)) return
    items.push({ id: GEN_ITEM_BASE + ((cx & 0xff) << 12) + ((cy & 0xff) << 4) + (itemN++ & 0xf), type, x: x + 0.5, y: y + 0.5, z: waterItemZForTile(1, 0, type, seaFloor[(y - WY) * CS + (x - WX)]) })
  }
  const pushLight = (x: number, y: number, r: number, color: string, noFix = true, extra?: Partial<LightSource>) => {
    if (!inChunk(x, y)) return
    lights.push({ x: x + 0.5, y: y + 0.5, r, color, flickerSeed: rng.next() * 100, gen: 1, ...(noFix ? { noFix: 1 as const } : {}), ...extra })
  }
  const solidAt = (x: number, y: number) =>
    structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  const isWaterTile = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < CS && y < CS && tiles[li(x, y)] === 1 && liquid[li(x, y)] === 1
  const nearEntry = (x: number, y: number, pad = 2) =>
    cx === 0 && cy === 0 && x >= L7_ENTRY.x0 - pad && x <= L7_ENTRY.x1 + pad && y >= L7_ENTRY.y0 - pad && y <= L7_PORCH.y1 + pad
  // v57t：固定出口（海山/管道环）已删除——本层只有午夜海床岩洞与深水漂浮门两种出口；
  const exitAt = (x: number, y: number, pad = 1) =>
    exits.some((e) => Math.hypot(WX + x - e.x, WY + y - e.y) < pad)
  // v57t：旧固定出口已删除；保留旧调用名，统一避让本 chunk 已生成的岩洞/浮门
  const nearFixedExit = (x: number, y: number, pad = 2) => exitAt(x, y, pad)

  // ---- 入口房间 + 增长门廊 + 舱门（仅 chunk (0,0)；v57m：整体位于 2F 上层楼板） ----
  if (cx === 0 && cy === 0) {
    const { x0, y0, x1, y1, doorX, doorY } = L7_ENTRY
    const { x0: px0, x1: px1, y0: py0, y1: py1, innerX0, innerX1, door: seaDoor, drop } = L7_PORCH
    // 舱体楼板写 up 数组；一层保持海洋水面/水底，舱体悬在海面上方（下方镂空）
    const setCabinFloor = (wx0: number, wy0: number, wx1: number, wy1: number) => {
      for (let y = wy0; y <= wy1; y++)
        for (let x = wx0; x <= wx1; x++)
          if (inChunk(x, y)) up[li(x - WX, y - WY)] = 1
    }
    setCabinFloor(x0, y0, x1, y1)
    setCabinFloor(innerX0, py0, innerX1, py1)
    // 舱体墙写 up + upWall：2F 有墙，一层仍是无障碍海面
    const setCabinWall = (wx: number, wy: number) => {
      if (!inChunk(wx, wy)) return
      const i = li(wx - WX, wy - WY)
      up[i] = 1; upWall[i] = 1
    }
    // 房间外墙：北/东/西；南墙只留两格进入门廊
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      setCabinWall(x, y0 - 1)
      if (!doorX.includes(x)) setCabinWall(x, doorY)
    }
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      setCabinWall(x0 - 1, y)
      setCabinWall(x1 + 1, y)
    }
    // 门廊侧墙 + 南端墙；南端只留舱门 x14（x15 为门框墙）
    for (let y = py0; y <= py1; y++) {
      setCabinWall(px0, y)
      setCabinWall(px1, y)
    }
    for (let x = px0; x <= px1; x++) if (x !== seaDoor.x) setCabinWall(x, py1)
    // 家具齐全：西墙金属书橱（来历不明的书）+ 小号咖啡桌 + 一把椅子 + 荧光吊灯 + 舱室通风口
    pushStruct('bookcase', x0, y0 + 1, 1, 3, true, true, { loot: 1, cabin: 1, lootItems: ['oddbook'] }, 1) // v57t：固定一本「来源不明的书」
    pushStruct('table', 14, 14, 1, 1, true, false, { cabin: 1 }, 1)
    pushStruct('table', 16, 14, 1, 1, true, false, { chair: 1, deg: 270, cabin: 1 }, 1)
    pushStruct('hanglight', 15, 13, 1, 1, false, false, { cabin: 1 }, 1)
    pushLight(15, 13, 8.0, '#eae2c4', true, { fixZ: 4.15 }) // 吊灯悬在 2F 舱室居住高度（v58：6.0→8.0 房间太暗）
    pushLight(15, 21, 5.0, '#f0e8d2', true, { fixZ: 4.15 }) // v58：门廊补一盏暖光——从 L6 楼梯进门正对门廊有光可寻
    pushStruct('vent', 18, 13, 1, 1, false, false, undefined, 1)
    // 门廊入口的系缆桩：使用尼龙绳后 deployed=1，绳索先沿门廊延伸到出口，再从出口外一格垂到海面
    pushStruct('ropeanchor', L7_ROPE.anchor.x, L7_ROPE.anchor.y, 1, 1, false, true, {
      deployed: 0,
      ropeDX: L7_ROPE.top.x - L7_ROPE.anchor.x, ropeDY: L7_ROPE.top.y - L7_ROPE.anchor.y,
      baseDX: L7_ROPE.base.x - L7_ROPE.anchor.x, baseDY: L7_ROPE.base.y - L7_ROPE.anchor.y,
    }, 1)
    // 门廊尽头通往海洋的舱门（钢灰；开启时会把门边的人强制抛出门外落海）
    pushStruct('hoteldoor', seaDoor.x, seaDoor.y, 1, 1, true, true, {
      open: 0, hue: 2, l7porch: 1, dropDX: drop.x - seaDoor.x, dropDY: drop.y - seaDoor.y,
    }, 1)
  }

  // v57r：舱体之外全部是室外开放海洋（无天花板）；舱体楼板及其下方保持室内，以保留 2F 舱室天花板与船底
  for (let i = 0; i < N; i++) outdoor[i] = liquid[i] === 1 && up[i] !== 1 ? 1 : 0

  // ---- v57t：新出口系统（两种，各有专属建模） ----
  // 1) 午夜带海床：岩洞洞口（l7cave → Level 8）。每个 8×8 chunk 超区域的宿主 chunk 若落在午夜带，
  //    必有一个岩洞作为解析式出口锚点；非宿主 chunk 另有 4% 概率额外生成。
  // 2) 深水中极罕见：一扇漂浮的「不是出口」的门（notexit → Level 4）。
  {
    const caveDef = def.exits.find((e) => e.kind === 'l7cave')
    const doorDef = def.exits.find((e) => e.kind === 'notexit')
    if (caveDef || doorDef) {
      const zoneAtLocal = (x: number, y: number) => l7ZoneOfDepth(seaFloor[li(x, y)])
      const findWaterFor = (want: 'midnight' | 'deep', avoid: Set<string>): { x: number; y: number } | null => {
        const tx0 = 6 + (h32(seed, 0x171a, cx, cy) % 20)
        const ty0 = 6 + (h32(seed, 0x171b, cx, cy) % 20)
        for (let rad = 0; rad < 12; rad++) {
          for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
              const x = tx0 + dx, y = ty0 + dy
              if (x < 1 || y < 1 || x >= CS - 1 || y >= CS - 1) continue
              if (!isWaterTile(x, y) || nearEntry(x, y, 3) || exitAt(x, y, 2) || solidAt(WX + x, WY + y)) continue
              if (avoid.has(`${x},${y}`)) continue
              const z = zoneAtLocal(x, y)
              if (want === 'midnight' && z !== 'midnight') continue
              if (want === 'deep' && z === 'daylight') continue
              return { x, y }
            }
          }
        }
        return null
      }
      const rx = Math.floor(cx / RS), ry = Math.floor(cy / RS)
      const host = regionHost(seed, rx, ry)
      const isHost = host.cx === cx && host.cy === cy
      const hostZone = l7ZoneAt(seed, WX + 16, WY + 16)
      const midnightHost = isHost && !(cx === 0 && cy === 0) && hostZone === 'midnight'
      // 午夜宿主区域必有一个岩洞（出口指引可用）；其余午夜区域概率出现
      const caveRoll = caveDef && (midnightHost || h01(seed, 0x1715, cx, cy) < 0.04)
      if (caveRoll) {
        const spot = findWaterFor('midnight', new Set())
        if (spot) {
          exits.push({ def: caveDef, x: WX + spot.x, y: WY + spot.y, discovered: false })
          pushLight(spot.x, spot.y, 3.2, '#5fd8e8')
        }
      }
      // 「不是出口」的门：宿主深水区 6%，普通深水 chunk 0.6%——比岩洞稀有得多
      const doorRoll = doorDef && (
        (isHost && !(cx === 0 && cy === 0) && hostZone !== 'daylight' && h01(seed, 0x1716, cx, cy) < 0.06)
        || (!isHost && h01(seed, 0x1717, cx, cy) < 0.006)
      )
      if (doorRoll) {
        const used = new Set(exits.filter((e) => e.def.kind === 'l7cave').map((e) => `${e.x - WX},${e.y - WY}`))
        const spot = findWaterFor('deep', used)
        if (spot) {
          const depth = seaFloor[li(spot.x, spot.y)]
          // 门漂在深水层中，而不是海床上：约取深度 35%~45%，最深不超过 -90m
          const ez = -Math.max(20, Math.min(90, depth * 0.4))
          exits.push({ def: doorDef, x: WX + spot.x, y: WY + spot.y, z: ez, discovered: false })
        }
      }
    }
  }

  // ---- v57s：海床向上起伏形成的荒岛（不再随机丢石头岛） ----
  // 当海床深度被噪声抬升到 0.6m 以内时，该瓦片露出水面成为陆地；
  // raw<0 的瓦片是岛心，抬高 1.2m。出生点/舱体周边与固定出口附近不生成岛屿。
  {
    const centers: { x: number; y: number }[] = []
    for (let y = 0; y < CS; y++)
      for (let x = 0; x < CS; x++) {
        const i = li(x, y)
        if (tiles[i] !== 1 || liquid[i] !== 1 || up[i] === 1 || seaFloor[i] > 0.6) continue
        if (!l7CanIslandAt(seed, WX + x, WY + y) || exitAt(x, y, 3)) continue
        const raw = l7SeaFloorRaw(seed, WX + x, WY + y)
        liquid[i] = 0; wet[i] = 0; seaFloor[i] = 0; outdoor[i] = 1; tint[i] = 0
        elev[i] = raw < -0.8 ? 2 : 0 // 岛心抬高、岸线平齐水面
        if (raw < -0.8 && !centers.some((c) => Math.hypot(c.x - x, c.y - y) < 3)) centers.push({ x, y })
      }
    for (const c of centers) pushStruct('rockisle', WX + c.x, WY + c.y, 1, 1, false)
  }

  // ---- v58：环形结构场「小小的谎言」（入口正西 150m 暮色带；世界坐标纯函数，各 chunk 裁剪自己那份） ----
  {
    const A = L7_ARENA
    // 粗判本 chunk 是否覆盖场区（圆心距 chunk 中心 < 半边长 + 场区外扩半径）
    if (Math.hypot(WX + CS / 2 - A.x, WY + CS / 2 - A.y) < CS / 2 + 22) {
      // 石柱外环 ×10 + 内环 ×6（v 控制三款变体）；水下管道环切向 ×6
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.31
        const x = Math.round(A.x + Math.cos(a) * 11), y = Math.round(A.y + Math.sin(a) * 11)
        if (isWaterTile(x - WX, y - WY)) pushStruct('seapillar', x, y, 1, 1, true, false, { v: i % 3 })
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.62
        const x = Math.round(A.x + Math.cos(a) * 6.5), y = Math.round(A.y + Math.sin(a) * 6.5)
        if (isWaterTile(x - WX, y - WY)) pushStruct('seapillar', x, y, 1, 1, true, false, { v: (i + 1) % 3 })
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.05
        const x = Math.round(A.x + Math.cos(a) * 8.6), y = Math.round(A.y + Math.sin(a) * 8.6)
        if (isWaterTile(x - WX, y - WY)) pushStruct('seapipe', x, y, 1, 1, true, false, { deg: Math.round((a * 180) / Math.PI + 90) })
      }
      // 中心圆形石台（可踏上的 0.42m 低台）与场心内容仅由归属 chunk 推送一次
      pushStruct('seadais', A.x - 1, A.y - 1, 3, 3, true)
      if (inChunk(A.x, A.y)) {
        // 台心表面嵌一扇木门——「小小的谎言」→ Level 9
        const doorDef = def.exits.find((e) => e.kind === 'littledoor')
        if (doorDef) exits.push({ def: doorDef, x: A.x, y: A.y, z: -L7_ARENA.depth + 0.42, discovered: false })
        // 「小小」固定生成于场心（calm=可对话被动个体；被激怒前不主动攻击）
        entities.push({ type: 'tiny', x: A.x + 0.5, y: A.y + 0.5, calm: true })
      }
      // 环外骸骨带：骨堆（1/3 可搜刮）与巨鱼骨碎片，确定性散点
      for (let i = 0; i < 9; i++) {
        const a = h01(seed, 0x1730, i) * Math.PI * 2
        const r = 13.5 + h01(seed, 0x1731, i) * 5
        const x = Math.round(A.x + Math.cos(a) * r), y = Math.round(A.y + Math.sin(a) * r)
        if (!isWaterTile(x - WX, y - WY) || solidAt(x, y)) continue
        if (i % 3 === 2) pushStruct('fishbones', x, y, 2, 1, false)
        else pushStruct('bonepile', x, y, 1, 1, false, i % 3 === 0, { loot: 1 })
      }
    }
  }

  // ---- 深度带遗骸与容器（v57p：按「放置点海床深度」选择内容，海床相互连续、平滑过渡） ----
  const zoneAt = (x: number, y: number) => l7ZoneOfDepth(seaFloor[li(x, y)])
  const placeOnWater = (kind: Structure['kind'], w: number, h: number, solid: boolean, withSid = false, data?: Structure['data'], want?: ReturnType<typeof zoneAt>): boolean => {
    for (let tr = 0; tr < 60; tr++) {
      const x = rng.int(3, CS - 3 - Math.max(0, w - 1)), y = rng.int(3, CS - 3 - Math.max(0, h - 1))
      if (nearEntry(x, y, 2) || nearFixedExit(x, y, 2)) continue
      if (want && zoneAt(x, y) !== want) continue
      let ok = true
      for (let j = y; j < y + h && ok; j++)
        for (let i = x; i < x + w && ok; i++)
          if (!isWaterTile(i, j) || solidAt(WX + i, WY + j)) ok = false
      if (!ok) continue
      pushStruct(kind, WX + x, WY + y, w, h, solid, withSid, data)
      return true
    }
    return false
  }
  // 有光带：荒芜，只有零星木桶/板条箱
  if (rng.chance(0.5)) placeOnWater('barrel', 1, 1, true, true, { loot: 1 }, 'daylight')
  if (rng.chance(0.35)) placeOnWater('crate', 1, 1, true, true, { loot: 1 }, 'daylight')
  // 微光带：骨堆、锈桶、巨鱼骨开始出现
  for (let i = 0, n = rng.int(1, 2); i < n; i++) placeOnWater('bonepile', 1, 1, false, true, { loot: 1 }, 'twilight')
  if (rng.chance(0.45)) placeOnWater('barrel', 1, 1, true, true, { loot: 1 }, 'twilight')
  if (rng.chance(0.24)) placeOnWater('fishbones', 3, 2, false, false, undefined, 'twilight')
  if (rng.chance(0.08)) placeOnWater('corpse', 1, 1, false, true, { loot: 1 }, 'twilight')
  // 午夜带：大量遗骸与巨鱼骨
  for (let i = 0, n = rng.int(2, 3); i < n; i++) placeOnWater('bonepile', 1, 1, false, true, { loot: 1 }, 'midnight')
  if (rng.chance(0.45)) placeOnWater('fishbones', 3, 2, false, false, undefined, 'midnight')
  if (rng.chance(0.22)) placeOnWater('barrel', 1, 1, true, true, { loot: 1 }, 'midnight')
  if (rng.chance(0.1)) placeOnWater('corpse', 1, 1, false, true, { loot: 1 }, 'midnight')
  // 深渊带：焦油岩堆持续冒泡
  for (let i = 0, n = rng.int(2, 3); i < n; i++) placeOnWater('seatarpit', 2, 2, false, false, { bubbles: 1 }, 'abyss')
  if (rng.chance(0.7)) placeOnWater('bonepile', 1, 1, false, true, { loot: 1 }, 'abyss')
  if (rng.chance(0.16)) placeOnWater('fishbones', 3, 2, false, false, undefined, 'abyss')

  // ---- 实体（v57p：按放置点海床深度垂直划分；出生安全区 |cx|,|cy|≤1 不生成） ----
  if (!(Math.abs(cx) <= 1 && Math.abs(cy) <= 1)) {
    const placeEntityIn = (type: string, want: ReturnType<typeof zoneAt>): boolean => {
      for (let tr = 0; tr < 60; tr++) {
        const x = rng.int(3, CS - 4), y = rng.int(3, CS - 4)
        if (nearEntry(x, y, 3) || nearFixedExit(x, y, 4) || !isWaterTile(x, y) || solidAt(WX + x, WY + y)) continue
        if (zoneAt(x, y) !== want) continue
        entities.push({ type, x: WX + x + 0.5, y: WY + y + 0.5 })
        return true
      }
      return false
    }
    // v58：小小不再自然生成——唯一可对话个体固定在「小小的谎言」环形场（仍归属 L7 图鉴分类）；
    // 7 层之物只能在午夜带/深渊带；死亡飞蛾不再出现于 L7
    if (rng.chance(0.14)) placeEntityIn('thething', 'midnight')
    if (rng.chance(0.2)) placeEntityIn('thething', 'abyss')
  }

  // ---- 漂浮物/沉底物（v57p：按落点深度决定补给密度，深渊几乎无补给） ----
  {
    const pool = [...def.items, ...UNIVERSAL_ITEMS]
    for (let tr = 0; tr < 50; tr++) {
      const x = rng.int(3, CS - 4), y = rng.int(3, CS - 4)
      if (nearEntry(x, y, 2) || nearFixedExit(x, y, 3) || !isWaterTile(x, y) || solidAt(WX + x, WY + y)) continue
      const z = zoneAt(x, y)
      const chance = z === 'daylight' ? 0.5 : z === 'twilight' ? 0.36 : z === 'midnight' ? 0.16 : 0.06
      if (!rng.chance(chance)) continue
      const t0 = rng.weighted(pool.map((p) => ({ v: p.type, w: p.w })))
      pushItem(t0 === 'almond' && rng.chance(0.1) ? 'cashew' : t0, WX + x, WY + y)
      break
    }
  }
  if (h01(seed, 0x1720, cx, cy) < 0.08) {
    for (let tr = 0; tr < 50; tr++) {
      const x = rng.int(3, CS - 4), y = rng.int(3, CS - 4)
      if (nearEntry(x, y, 2) || nearFixedExit(x, y, 3) || !isWaterTile(x, y) || solidAt(WX + x, WY + y)) continue
      if (zoneAt(x, y) === 'abyss') continue
      pushItem('tape', WX + x, WY + y)
      break
    }
  }

  return { variant, tiles, wet, elev, step, tint, crawl, outdoor, liquid, seaFloor, up, upWall, structures, items, lights, exits, entities }
}

/** v57t：L7 区域宿主出口锚点的轻量解析式版本。与 genL7ChunkRaw 的宿主出口判定逐条一致，
 *  但不生成整 chunk 海床数组——HUD 每帧出口指引首次求解时不再造成数百毫秒卡顿。 */
export function l7RegionExitAnchor(seed: number, rx: number, ry: number): { x: number; y: number; z?: number } | null {
  const host = regionHost(seed, rx, ry)
  const { cx, cy } = host
  if (cx === 0 && cy === 0) return null
  const WX = cx * CS, WY = cy * CS
  const hostZone = l7ZoneAt(seed, WX + 16, WY + 16)
  const zoneOf = (x: number, y: number) => l7ZoneAt(seed, WX + x, WY + y)
  const findWater = (want: 'midnight' | 'deep', avoid: Set<string>): { x: number; y: number } | null => {
    const tx0 = 6 + (h32(seed, 0x171a, cx, cy) % 20)
    const ty0 = 6 + (h32(seed, 0x171b, cx, cy) % 20)
    for (let rad = 0; rad < 12; rad++) {
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
          const x = tx0 + dx, y = ty0 + dy
          if (x < 1 || y < 1 || x >= CS - 1 || y >= CS - 1) continue
          if (avoid.has(`${x},${y}`)) continue
          const z = zoneOf(x, y)
          if (want === 'midnight' && z !== 'midnight') continue
          if (want === 'deep' && z === 'daylight') continue
          return { x, y }
        }
      }
    }
    return null
  }
  if (hostZone === 'midnight') {
    const spot = findWater('midnight', new Set())
    if (spot) return { x: WX + spot.x, y: WY + spot.y }
  } else if (hostZone !== 'daylight' && h01(seed, 0x1716, cx, cy) < 0.06) {
    const spot = findWater('deep', new Set())
    if (spot) {
      const depth = l7SeaFloorAt(seed, WX + spot.x, WY + spot.y)
      return { x: WX + spot.x, y: WY + spot.y, z: -Math.max(20, Math.min(90, depth * 0.4)) }
    }
  }
  return null
}

// ---------- 注册（mapgen generateLevel → generateInfinite 经注册表分派） ----------
registerInfiniteLevel(7, {
  genRaw: genL7ChunkRaw,
  variantOf: l7VariantOf,
  rareVariants: L7_RARE_VARIANTS,
  variantNames: L7_VARIANT_NAMES,
  variantLore: L7_VARIANT_LORE,
  spawnWorld: { x: L7_ORIGIN.x, y: L7_ORIGIN.y },
  spawnFloor: 1,
  regionExitPos: l7RegionExitAnchor,
})
