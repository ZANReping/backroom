// ================= v41：Level 2「废弃公共带」无限 chunk 生成 =================
// 布局基调：数条狭窄的平行竖直（南北向）廊道——可走净空 3 瓦片，廊道间距很远（16~32），
// 横向（东西向）连廊周期性出现把它们接通；部分竖直廊道中断（尽头很遥远，尽头前必有横道）。
// 全部走向由「世界坐标确定性函数」决定（廊道列位置 corrX(k)、横道行位置 rowY(r)、服役判定
// serve(k,r)），相邻 chunk 天然对齐缝合；任何 carved 地板经横道全连通（l2inf-smoke BFS 断言）。
// 四变体按 L1 群系噪声成片聚集：整洁/晦暗（等率）/肮脏（第三）/扭曲（最低）。
// 门：廊道侧墙门位确定性生成——大多数锁死（sealed，任何方式打不开）；少数未上锁的门后是
// 横向连廊（双开门）或大设备房/补给间/电脑房/卧室/空房间；消防出口替换一小部分未上锁的门
// （dest back/3）；罕见办公走廊（大量办公椅 + L4 风 tint，尽头 dest 4）。
// v42：出口率对齐 L0/L1（每 RS×RS chunk 超区域约 1 个出口，区域指定「出口段」门控，出生块保底）；
// 墙面段系统——贴墙平行粗管（实心收窄净宽 3→2）/代墙平行管道/代墙大型机器（五变体），段旁禁门，
// 平行管道端头必带弧形拐弯（endEl 入顶/入地）；天花板两缘细管+电缆线束装饰；
// 办公走廊仅单一开口（房间/连廊/其他办公走廊避让）；房间按内容动态放大最小开间、结构间 ≥1 净空；
// 新增卧室房型（床+桌+椅+充足灯光），无面灵仅在卧室生成；尸鼠（合并死亡鼠）成群 2~3 生成。
import { RNG } from './rng'
import { UNIVERSAL_ITEMS } from './items'
import type { LevelDef, Structure, LightSource, ExitInstance, GroundItem } from './types'
import { CS, RS, h32, GEN_ITEM_BASE } from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'
import { jerryFollowerDef, type NpcDef } from './npcs' // v45：信众宣传间驻防 NPC

// ---------- 变体 ----------
export type L2Variant = 'tidy' | 'dim' | 'dirty' | 'warped'
export const L2_VARIANT_NAMES: Record<L2Variant, string> = {
  tidy: '整洁的廊道', dim: '晦暗的廊道', dirty: '肮脏的廊道', warped: '扭曲的廊道',
}
// 区段档案（图鉴；设定依据 wikidot/Fandom Level 2 管道走廊条目衍生的区域化演绎）
export const L2_VARIANT_LORE: Record<string, string[]> = {
  tidy: [
    '整洁的廊道——管道排列整齐，灯光明亮而稳定，地面少见杂物。部分机器仍在运行：压力表指针微微颤动，发电机散热口吹出温热的风，仿佛维护人员刚刚离开。',
    '档案提醒：整洁不代表安全。运行中的机器意味着管道里仍有高压蒸汽——别碰红色的阀门，也别把「还在运转」误认为「有人来过」。',
  ],
  dim: [
    '晦暗的廊道——灯管数量充足、排列整齐，却几乎全部奄奄一息：低亮度、低色温，像一层永远擦不干净的黄昏。管道与墙面布满均匀的积灰，你的手电照上去会扬起细细的尘。',
    '积灰上没有脚印。这是最让流浪者不安的地方——这条廊道已经很久没有任何东西走过，包括实体。档案建议：灰尘太完整的地方，往往有东西不想被看见。',
  ],
  dirty: [
    '肮脏的廊道——金属普遍生锈，墙面洇着锈橙色的水痕，地面散落碎石与废弃金属。灯稀疏，但每一盏都亮得发烫，把锈迹照成一片暖橙色。这里的机器大多已经死去：锅炉冰冷，发电机沉默。',
    '生锈的管道脆弱易裂。档案记录过多起因倚靠管线导致的烫伤与割伤——在肮脏的廊道里，走路走中间，什么都别扶。',
  ],
  warped: [
    '扭曲的廊道——灯光的排列毫无逻辑：有的三盏挤在一起，有的隔出几十米的纯黑；明暗不定，闪烁不停。大小管道不再顺墙而走，而是直接横穿廊道——矮的拦腰，低的压顶。',
    '通过扭曲段必须蹲伏爬行或跨越台阶。档案警告：爬行时你的视野贴地，听不见也看不见前方——先听，再爬。管道蠕虫偏爱这种廊道。',
  ],
}
export const L2_RARE_VARIANTS: readonly string[] = ['tidy', 'dim', 'dirty', 'warped']

const h01 = (...n: number[]) => h32(...n) / 4294967296

// ---------- 变体判定（群系式聚集，同 L1 的低频值噪声群系图）----------
const BIOME_S = 5 // 群系尺度（chunk）
const biomeSmooth = (t: number) => t * t * (3 - 2 * t)
function biomeNoise(seed: number, cx: number, cy: number): number {
  const fx = cx / BIOME_S, fy = cy / BIOME_S
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const tx = biomeSmooth(fx - x0), ty = biomeSmooth(fy - y0)
  const v00 = h01(seed, 0xb200, x0, y0), v10 = h01(seed, 0xb200, x0 + 1, y0)
  const v01 = h01(seed, 0xb200, x0, y0 + 1), v11 = h01(seed, 0xb200, x0 + 1, y0 + 1)
  const a = v00 + (v10 - v00) * tx, b = v01 + (v11 - v01) * tx
  return a + (b - a) * ty
}
// 频率：扭曲最低（14%）< 肮脏第三（26%）< 晦暗 = 整洁（各 30%）
const pickVariant = (r: number): L2Variant =>
  r < 0.14 ? 'warped' : r < 0.4 ? 'dirty' : r < 0.7 ? 'dim' : 'tidy'

export function l2VariantOf(seed: number, cx: number, cy: number): L2Variant {
  if (cx === 0 && cy === 0) return 'tidy' // 出生 chunk 恒为整洁的廊道（安全引入）
  if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) {
    // 出生安全区：整洁/晦暗
    return h01(seed, 0xb211, cx, cy) < 0.5 ? 'tidy' : 'dim'
  }
  if (h01(seed, 0x1e21, cx, cy) < 0.06) return pickVariant(h01(seed, 0x1e22, cx, cy)) // 6% 异质
  return pickVariant(biomeNoise(seed, cx, cy))
}

// ---------- 廊道网（世界坐标纯函数：相邻 chunk 天然对齐）----------
const VSP = 24 // 竖直廊道名义间距（瓦片）
const HSP = 28 // 横向连廊名义间距（瓦片）
// 廊道 k 的西缘 x（净宽 3：x ∈ [corrX, corrX+2]）；k=0 固定在 13（出生点世界 15,15 必在廊道内）
export const l2CorrX = (seed: number, k: number) =>
  13 + k * VSP + (k === 0 ? 0 : (h32(seed, 0xc0, k) % 9) - 4)
// 横道 r 的北缘 y（高 2：y ∈ [rowY, rowY+1]）；r=0 固定在 13
export const l2RowY = (seed: number, r: number) =>
  13 + r * HSP + (r === 0 ? 0 : (h32(seed, 0xd0, r) % 9) - 4)
// 廊道 k 是否贯穿区块 r（rowY(r) 与 rowY(r+1) 之间）；不贯穿则两端各留一段「尽头很遥远」的 stub
const l2Serve = (seed: number, k: number, r: number) =>
  (k === 0 && (r === 0 || r === -1)) || h01(seed, 0xb1, k, r) < 0.78 // 出生廊道纵贯出生区块
// stub 长 10~18 并钳制到区块高 -8（不会穿过下一条横道；两端 stub 可能相接=该区块反而贯通，无害）
const l2BlockH = (seed: number, r: number) => l2RowY(seed, r + 1) - l2RowY(seed, r)
const l2StubN = (seed: number, k: number, r: number) =>
  Math.min(10 + (h32(seed, 0xb2, k, r) % 9), l2BlockH(seed, r) - 8) // 北 stub（自 rowY(r) 南伸）
const l2StubS = (seed: number, k: number, r: number) =>
  Math.min(10 + (h32(seed, 0xb3, k, r) % 9), l2BlockH(seed, r) - 8) // 南 stub（自 rowY(r+1) 北伸）

// 廊道 k 在世界行 y 处是否有地板（冒烟与通道接驳校验共用；纯函数）
export function l2CorridorFloorAt(seed: number, k: number, y: number): boolean {
  // 定位区块 r：rowY(r) ≤ y ≤ rowY(r+1)+1（行单调，二分附近 ±2 覆盖抖动）
  const r0 = Math.round((y - 13) / HSP)
  for (let r = r0 - 2; r <= r0 + 2; r++) {
    const ya = l2RowY(seed, r), yb = l2RowY(seed, r + 1)
    if (y < ya || y > yb + 1) continue
    if (y <= ya + 1 || y >= yb) return true // 横道（含邻接横道的接口行）
    if (l2Serve(seed, k, r)) return true
    if (y <= ya + l2StubN(seed, k, r)) return true // 北 stub
    if (y >= yb + 1 - l2StubS(seed, k, r)) return true // 南 stub
    return false
  }
  return false
}

// ---------- 墙面段处理（v42：世界纯函数——门位/壁龛/生成器共用，跨 chunk 一致）----------
// 三种段（沿廊道走向成段出现）：
//   fpipes=贴墙平行粗管群（实心占 1 条车道边：净宽 3→2，不堵死；两侧同行不会同时出现）
//   wpipes=代墙平行管道（整段墙面化身不同粗细的管排，不占净空；段旁 ±1 禁止生成门）
//   wmach =代墙大型机器（锅炉/发电机组/主发电机/机柜排/变压器五种 mv 变体；段旁同样禁门）
// 任何平行管道段（含天花板两缘管线装饰）两端都打 endEl 弯头标记：渲染为弧形拐弯接入
// 天花板或地板，不留悬空断头。endEl：1=向上入顶 2=向下入地；endS：1=该端为南（y 大）端。
export interface L2WallSeg { y0: number; y1: number; mode: 'fpipes' | 'wpipes' | 'wmach'; mv: number }
export function l2WallSegsAt(seed: number, k: number, r: number): { west: L2WallSeg[]; east: L2WallSeg[] } {
  const ya = l2RowY(seed, r), yb = l2RowY(seed, r + 1)
  // 可行范围：横道之间（ya+2..yb-1）；不贯穿区块时只落在 stub 有地板的行
  const clampSeg = (y0: number, y1: number): { y0: number; y1: number } | null => {
    y0 = Math.max(y0, ya + 2); y1 = Math.min(y1, yb - 1)
    if (!l2Serve(seed, k, r)) {
      const nEnd = ya + l2StubN(seed, k, r), sStart = yb + 1 - l2StubS(seed, k, r)
      if (y0 <= nEnd) y1 = Math.min(y1, nEnd)
      else if (y1 >= sStart) y0 = Math.max(y0, sStart)
      else return null // 整段落在中断空隙：取消
    }
    return y1 - y0 >= 2 ? { y0, y1 } : null
  }
  const mk = (side: number): L2WallSeg[] => {
    const segs: L2WallSeg[] = []
    for (const t of [0, 1]) {
      const roll = h01(seed, 0xc1, k, r, side, t)
      if (roll >= 0.38) continue
      const mode: L2WallSeg['mode'] = roll < 0.17 ? 'fpipes' : roll < 0.31 ? 'wpipes' : 'wmach'
      const len = 3 + (h32(seed, 0xc2, k, r, side, t) % 6) // 3..8
      const y0 = ya + 3 + t * 11 + (h32(seed, 0xc4, k, r, side, t) % 5)
      const cl = clampSeg(y0, y0 + len - 1)
      if (cl) segs.push({ ...cl, mode, mv: h32(seed, 0xc6, k, r, side, t) % 5 })
    }
    return segs
  }
  const west = mk(0), east = mk(1)
  // 出生块保底消防出口槽位（k=0,r=0,side=1,t=0）：剔除覆盖其 ±1 的东侧段（保底出口必须可达）
  if (k === 0 && r === 0) {
    const yf = l2RowY(seed, 0) + 4 + (h32(seed, 0xd6, 0, 0, 1, 0) % 4)
    for (let i = east.length - 1; i >= 0; i--) if (east[i].y0 - 1 <= yf && yf <= east[i].y1 + 1) east.splice(i, 1)
  }
  // 贴墙粗管（fpipes）两侧同行会把净宽压到 1（<1.5）：按段哈希定胜负，负方整段取消（净宽保持 ≥2）
  const winWest = h01(seed, 0xc5, k, r) < 0.5
  const drop = new Set<L2WallSeg>()
  for (const a of west)
    for (const b of east)
      if (a.mode === 'fpipes' && b.mode === 'fpipes' && a.y0 <= b.y1 && b.y0 <= a.y1) drop.add(winWest ? b : a)
  return { west: west.filter((s) => !drop.has(s)), east: east.filter((s) => !drop.has(s)) }
}

// ---------- 门位（世界纯函数；提升为模块级供办公走廊矩形/冒烟共用）----------
export type L2DoorType = 'sealed' | 'open' | 'fire' | 'office'
export function l2DoorSlotAt(seed: number, k: number, r: number, side: number, t: number): { y: number; type: L2DoorType } | null {
  // 出生 chunk 保底一个消防出口（v42：绕过密度门控/段避让/出口段门控——保底必须无条件成立）
  const forced = k === 0 && r === 0 && side === 1 && t === 0
  if (!forced && h01(seed, 0xd4, k, r, side, t) >= 0.42) return null // 门密度别太高（每廊道段几扇）
  const y = l2RowY(seed, r) + 4 + t * 8 + (h32(seed, 0xd6, k, r, side, t) % 4)
  const ya = l2RowY(seed, r), yb = l2RowY(seed, r + 1)
  if (l2Serve(seed, k, r)) { if (y > yb - 3) return null }
  else { if (t > 0 || y > ya + l2StubN(seed, k, r) - 2) return null } // 不贯穿区块：仅北 stub 根部一扇
  // v42：墙面段（贴墙管排/代墙管道/代墙机器）旁 ±1 禁止生成门（管排挡门、代墙段无墙可开门）；
  // 出生块保底出口不受段避让影响（其东侧段也已在 l2WallSegsAt 中剔除）
  let h = h01(seed, 0xd5, k, r, side, t)
  if (forced) h = 0.9
  if (!forced) {
    const segs = side === 0 ? l2WallSegsAt(seed, k, r).west : l2WallSegsAt(seed, k, r).east
    for (const sg of segs) if (y >= sg.y0 - 1 && y <= sg.y1 + 1) return null
  }
  // v44：未上锁门占比上调（open 26%→39%，+13 个百分点；锁死门仍占多数——相当部分 open 槽位
  // 因连廊/房间/办公走廊退让规则退化为锁死门，l2inf-smoke 断言锁死 ≥50%）
  let type: L2DoorType = h < 0.47 ? 'sealed' : h < 0.86 ? 'open' : h < 0.96 ? 'fire' : 'office'
  // v42：出口率对齐 L0/L1（每 RS×RS chunk 超区域约 1 个出口）——消防出口/办公走廊只出现在
  // 「区域指定出口段」廊道块，其余降回锁死的门（出生块保底不受门控）
  if ((type === 'fire' || type === 'office') && !forced && !l2ExitHostBlock(seed, k, r)) type = 'sealed'
  return { y, type }
}
// 出口段门控：每个 RS×RS chunk 超区域按哈希指定约 1 个廊道块为出口段（参照 L0/L1 超区域保底 1 出口）
const L2_RGN = RS * CS // 超区域边长（瓦片）= 8×32 = 256
export function l2ExitHostBlock(seed: number, k: number, r: number): boolean {
  const rx = Math.floor(l2CorrX(seed, k) / L2_RGN), ry = Math.floor(l2RowY(seed, r) / L2_RGN)
  return h32(seed, 0xe57, k, r) % 20 === h32(seed, 0xe56, rx, ry) % 20
}

// ---------- 办公走廊矩形（v42：房间/连廊/其他办公走廊据此避让——办公走廊仅与一条竖直廊道单一开口相连）----------
export function l2OfficeHallAt(seed: number, k: number, r: number, side: number, t: number): { x0: number; x1: number; y: number } | null {
  const slot = l2DoorSlotAt(seed, k, r, side, t)
  if (!slot || slot.type !== 'office') return null
  const X = l2CorrX(seed, k)
  const dx = side === 0 ? X - 1 : X + 3
  const sgn = side === 0 ? -1 : 1
  let len = 8 + (h32(seed, 0xd12, k, r, side, t) % 6)
  const x0 = dx + sgn
  // 端头不贴到相邻廊道（留 ≥2 格墙）——与生成处同公式
  const maxLen = side === 1 ? l2CorrX(seed, k + 1) - 3 - x0 + 1 : x0 - (l2CorrX(seed, k - 1) + 4) + 1
  len = Math.max(6, Math.min(len, maxLen))
  const x1 = side === 1 ? x0 + len - 1 : x0 - len + 1
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y: slot.y }
}

// ---------- 房间布局（v45：提升为模块级纯函数——生成器与信众宣传间判定/领地查询共用，跨 chunk 一致）----------
export interface L2RoomLayout {
  roll: number // 房型抽取（<0.35 大设备房 / <0.6 补给间 / <0.8 电脑房 / <0.9 卧室 / 否则空房间）
  x0: number; y0: number; x1: number; y1: number // 房间内腔矩形（世界瓦片，含端点）
  rw: number; rh: number
  doorX: number; doorY: number // 门洞瓦片（廊道侧墙线上）
}
/** 门后房间布局（仅 'open' 且非横向连廊的槽位；放不下房间返回 null） */
export function l2RoomLayoutAt(seed: number, k: number, r: number, side: number, t: number): L2RoomLayout | null {
  const slot = l2DoorSlotAt(seed, k, r, side, t)
  if (!slot || slot.type !== 'open') return null
  if (h01(seed, 0xd7, k, r, side, t) < 0.28) return null // 横向连廊（双开门）
  const X = l2CorrX(seed, k)
  const doorX = side === 0 ? X - 1 : X + 3 // 门洞瓦片（廊道侧墙线上）
  const doorY = slot.y
  const roll = new RNG(h32(seed, 0xfe, k, r, side, t)).next()
  // 按房型内容动态放大最小开间（放得下才不挤）；上限=不顶穿相邻廊道/不吃掉下一横道
  const needW = roll < 0.35 ? 5 : roll < 0.9 ? 4 : 3
  const needH = roll < 0.9 ? 4 : 3
  let rw = 3 + (h32(seed, 0xd8, k, r, side, t) % 5) // 3..7
  let rh = 3 + (h32(seed, 0xda, k, r, side, t) % 4) // 3..6
  const maxRw = side === 1 ? l2CorrX(seed, k + 1) - 3 - doorX : doorX - l2CorrX(seed, k - 1) - 4
  rw = Math.min(Math.max(rw, needW), maxRw)
  const y0 = doorY - 1
  rh = Math.min(Math.max(rh, needH), l2RowY(seed, r + 1) - 2 - y0 + 1) // 不吃掉下一横道
  const x0 = side === 1 ? doorX + 1 : doorX - rw
  const x1 = side === 1 ? doorX + rw : doorX - 1
  if (rh < 3 || rw < 3) return null // 放不下房间（生成处退化为锁死的门）
  return { roll, x0, y0, x1, y1: y0 + rh - 1, rw, rh, doorX, doorY }
}
/** v45：信众宣传间判定——卧室房型（roll∈[0.8,0.9)）中 ~8% 改生成（无无面灵，信众 NPC + 满墙海报） */
export function l2IsJerryRoom(seed: number, k: number, r: number, side: number, t: number): boolean {
  const lay = l2RoomLayoutAt(seed, k, r, side, t)
  return lay !== null && lay.roll >= 0.8 && lay.roll < 0.9 && h01(seed, 0xd14, k, r, side, t) < 0.08
}
/** v45：世界坐标是否处于某信众宣传间矩形（含门洞）内——HUD「信众领地」声望显示用（仿衔尾段 ouroboros） */
export function l2JerryRoomRectAt(seed: number, wx: number, wy: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const k0 = Math.round((wx - 13) / VSP), r0 = Math.round((wy - 13) / HSP)
  const tx = Math.floor(wx), ty = Math.floor(wy)
  for (let k = k0 - 1; k <= k0 + 1; k++)
    for (let r = r0 - 1; r <= r0 + 1; r++)
      for (const side of [0, 1])
        for (const t of [0, 1, 2]) {
          if (!l2IsJerryRoom(seed, k, r, side, t)) continue
          const L = l2RoomLayoutAt(seed, k, r, side, t)!
          if (tx >= Math.min(L.doorX, L.x0) && tx <= Math.max(L.doorX, L.x1) && ty >= L.y0 && ty <= L.y1)
            return { x0: L.x0, y0: L.y0, x1: L.x1, y1: L.y1 }
        }
  return null
}

// ---------- chunk 生成（纯函数：同种子同坐标必一致；GenChunk 契约见 infiniteRegistry）----------
export function genL2ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string): GenChunk {
  const variant = (forceVariant ?? l2VariantOf(seed, cx, cy)) as L2Variant
  const rng = new RNG(h32(seed, cx, cy, 0x1a2))
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
  const entities: { type: string; x: number; y: number; calm?: boolean; scale?: number }[] = []
  const npcs: { def: NpcDef; x: number; y: number; facing?: number }[] = [] // v45：信众宣传间驻防 NPC
  const li = (x: number, y: number) => y * CS + x
  const isF = (x: number, y: number) => x >= 0 && y >= 0 && x < CS && y < CS && tiles[li(x, y)] === 1
  const WX = cx * CS, WY = cy * CS
  const inChunk = (x: number, y: number) => x >= WX && x < WX + CS && y >= WY && y < WY + CS
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
  const pushLight = (x: number, y: number, r: number, color: string) => {
    if (!inChunk(x, y)) return
    lights.push({ x: x + 0.5, y: y + 0.5, r, color, flickerSeed: rng.next() * 100, gen: 1 })
  }
  // 世界矩形雕刻（裁剪到本 chunk；布局是世界坐标函数，相邻 chunk 各自雕刻天然缝合）
  const carveRectW = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        tiles[li(x - WX, y - WY)] = 1
  }
  const stampTintW = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        tint[li(x - WX, y - WY)] = t
  }
  const stampCrawlW = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        crawl[li(x - WX, y - WY)] = 1
  }
  const stampElevW = (x0: number, y0: number, x1: number, y1: number, e: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        elev[li(x - WX, y - WY)] = e
  }
  const solidAtL = (x: number, y: number) =>
    structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)

  // ---- 廊道/横道范围（覆盖本 chunk 及其特征外溢：房间最深 10、stub 沿纵轴）----
  const kMin = Math.floor((WX - 14 - 13) / VSP) - 1, kMax = Math.ceil((WX + CS + 14 - 13) / VSP) + 1
  const rMin = Math.floor((WY - 34 - 13) / HSP) - 1, rMax = Math.ceil((WY + CS + 34 - 13) / HSP) + 1

  // ---- 横道（贯穿东西，全部廊道经横道互联）----
  for (let r = rMin; r <= rMax; r++) {
    const ry = l2RowY(seed, r)
    if (ry + 1 < WY || ry > WY + CS - 1) continue
    carveRectW(WX - CS, ry, WX + 2 * CS, ry + 1)
  }
  // ---- 竖直廊道（按区块服役/留 stub）----
  for (let k = kMin; k <= kMax; k++) {
    const X = l2CorrX(seed, k)
    if (X + 2 < WX - 12 || X > WX + CS + 12) continue
    for (let r = rMin; r <= rMax; r++) {
      const ya = l2RowY(seed, r), yb = l2RowY(seed, r + 1)
      if (yb + 1 < WY || ya > WY + CS - 1) continue
      if (l2Serve(seed, k, r)) carveRectW(X, ya, X + 2, yb + 1)
      else {
        carveRectW(X, ya, X + 2, ya + l2StubN(seed, k, r))
        carveRectW(X, yb + 1 - l2StubS(seed, k, r), X + 2, yb + 1)
      }
    }
  }

  // ---- 门位（世界纯函数，见模块级 l2DoorSlotAt；此处别名保持调用点不变）----
  type DoorSlot = { y: number; type: L2DoorType }
  const doorSlotAt = (k: number, r: number, side: number, t: number): DoorSlot | null => l2DoorSlotAt(seed, k, r, side, t)
  // 矩形（含 ±1 墙）是否与任一办公走廊相交——相交则房间/连廊退让，保证办公走廊只有单一开口。
  // before：仅考虑键序小于 before 的走廊（办公走廊之间相互避让时定胜负，跨 chunk 确定性一致）
  type HallKey = [number, number, number, number]
  const keyLt = (a: HallKey, b: HallKey) =>
    a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && (a[2] < b[2] || (a[2] === b[2] && a[3] < b[3])))))
  const hitsOfficeHall = (x0: number, y0: number, x1: number, y1: number, self?: HallKey, before?: HallKey): boolean => {
    for (let k2 = kMin - 1; k2 <= kMax + 1; k2++)
      for (let r2 = rMin; r2 <= rMax; r2++)
        for (const side2 of [0, 1])
          for (const t2 of [0, 1, 2]) {
            const key: HallKey = [k2, r2, side2, t2]
            if (self && key[0] === self[0] && key[1] === self[1] && key[2] === self[2] && key[3] === self[3]) continue
            if (before && !keyLt(key, before)) continue
            const hall = l2OfficeHallAt(seed, k2, r2, side2, t2)
            if (hall && x0 <= hall.x1 + 1 && x1 >= hall.x0 - 1 && y0 <= hall.y + 2 && y1 >= hall.y - 2) return true
          }
    return false
  }

  // ---- 门与门后内容 ----
  const machineDead = variant === 'dirty' ? 1 : 0 // 肮脏的廊道：机器多为废弃状态（暗色/不发光）
  for (let k = kMin; k <= kMax; k++) {
    const X = l2CorrX(seed, k)
    if (X + 2 < WX - 12 || X > WX + CS + 12) continue
    for (let r = rMin; r <= rMax; r++) {
      const ya = l2RowY(seed, r), yb = l2RowY(seed, r + 1)
      if (yb + 1 < WY - 14 || ya > WY + CS + 14) continue
      for (const side of [0, 1] as const) {
        const sgn = side === 0 ? -1 : 1
        const dx = side === 0 ? X - 1 : X + 3 // 门洞瓦片（廊道侧墙线上）
        for (const t of [0, 1, 2]) {
          const slot = doorSlotAt(k, r, side, t)
          if (!slot) continue
          const { y, type } = slot
          const hue = h32(seed, 0xd11, k, r, side, t) % 5 // 颜色/材料各异
          if (type === 'sealed') {
            // 锁死的门：门洞 + 门后 1 格壁龛（大多数门以特殊方式上锁，任何方式都打不开）
            carveRectW(Math.min(dx, dx + sgn), y, Math.max(dx, dx + sgn), y)
            pushStruct('hoteldoor', dx, y, 1, 1, true, true, { open: 0, locked: 1, sealed: 1, hue })
            continue
          }
          if (type === 'fire') {
            // 消防出口（替换一小部分未上锁的门）：只雕 1 格门洞凹龛，出口本体嵌在凹龛尽头的墙里
            if (def.exits.length < 2) continue
            carveRectW(dx, y, dx, y)
            const edef = h01(seed, 0xd9, k, r, side, t) < 0.5 ? def.exits[0] : def.exits[1]
            if (inChunk(dx, y)) exits.push({ def: edef, x: dx, y, discovered: false })
            pushLight(dx, y, 2.2, '#3ae06a') // 绿色 EXIT 灯牌的微光
            continue
          }
          if (type === 'office') {
            // 办公走廊（罕见）：未上锁的门后是一条 L4 风走廊——大量办公椅，尽头出口 → Level 4
            if (def.exits.length < 3) continue
            // v42：仅与一条竖直廊道单一开口相连——与键序更小的其他办公走廊相交时退让（封口）
            const frng = new RNG(h32(seed, 0xfe, k, r, side, t))
            let len = 8 + (h32(seed, 0xd12, k, r, side, t) % 6)
            const x0 = dx + sgn
            // 端头不贴到相邻廊道（留 ≥2 格墙）
            const maxLen = side === 1 ? l2CorrX(seed, k + 1) - 3 - x0 + 1 : x0 - (l2CorrX(seed, k - 1) + 4) + 1
            len = Math.max(6, Math.min(len, maxLen))
            const x1 = side === 1 ? x0 + len - 1 : x0 - len + 1
            if (hitsOfficeHall(Math.min(x0, x1), y - 1, Math.max(x0, x1), y + 1, [k, r, side, t], [k, r, side, t])) {
              carveRectW(Math.min(dx, dx + sgn), y, Math.max(dx, dx + sgn), y)
              pushStruct('hoteldoor', dx, y, 1, 1, true, true, { open: 0, locked: 1, sealed: 1, hue })
              continue
            }
            carveRectW(dx, y, dx, y) // 门洞（唯一开口）
            carveRectW(Math.min(x0, x1), y - 1, Math.max(x0, x1), y + 1) // 3 宽走廊
            stampTintW(Math.min(x0, x1), y - 1, Math.max(x0, x1), y + 1, 16) // L4 风墙面/地面
            pushStruct('hoteldoor', dx, y, 1, 1, true, true, { open: 0, hue })
            // 大量办公椅（两侧交替；非实心，走廊保持可走）
            for (let i = 1; i < len - 1; i++) {
              const cx2 = x0 + sgn * i
              if (frng.chance(0.75)) pushStruct('officechair', cx2, y + (i % 2 === 0 ? -1 : 1), 1, 1, false, false, { rot: i % 4 })
              else if (frng.chance(0.3)) pushStruct('desk', cx2, y + (i % 2 === 0 ? -1 : 1), 1, 1, true)
            }
            for (let i = 2; i < len - 1; i += 4) pushLight(x0 + sgn * i, y, 3.2, '#ffe9b0') // L4 暖白
            // 尽头出口（端头瓦片地板，尽头墙后留死——orientDoor 朝向端墙）
            const ex1 = x1
            if (inChunk(ex1, y)) exits.push({ def: def.exits[2], x: ex1, y, discovered: false })
            pushLight(ex1, y, 2.5, '#f5e37a')
            continue
          }
          // type === 'open'：未上锁的门——横向连廊（双开门）或大小各异的房间
          if (h01(seed, 0xd7, k, r, side, t) < 0.28) {
            // 横向连接廊道（2 高，通到相邻竖直廊道；双开门）
            if (l2Serve(seed, k, r) && y + 1 > yb - 3) { // 双开门的下扇会顶到下一横道：退化为单门壁龛
              carveRectW(Math.min(dx, dx + sgn), y, Math.max(dx, dx + sgn), y)
              pushStruct('hoteldoor', dx, y, 1, 1, true, true, { open: 0, hue })
              continue
            }
            const k2 = side === 1 ? k + 1 : k - 1
            const block2 = ((): number => { // 目标廊道在 y 处的区块
              const r0 = Math.round((y - 13) / HSP)
              for (let rr = r0 - 2; rr <= r0 + 2; rr++)
                if (y >= l2RowY(seed, rr) && y <= l2RowY(seed, rr + 1) + 1) return rr
              return r0
            })()
            // 目标廊道该处须有地板，且其面向门位不与本通道冲突（|Δy|≤2 会破双门规则）
            let ok = l2CorridorFloorAt(seed, k2, y) && l2CorridorFloorAt(seed, k2, y + 1)
            for (const t2 of [0, 1, 2]) {
              const s2 = doorSlotAt(k2, block2, side === 1 ? 0 : 1, t2)
              if (s2 && Math.abs(s2.y - y) <= 2) ok = false
            }
            if (!ok) { // 接不上：退回锁死的门
              carveRectW(Math.min(dx, dx + sgn), y, Math.max(dx, dx + sgn), y)
              pushStruct('hoteldoor', dx, y, 1, 1, true, true, { open: 0, locked: 1, sealed: 1, hue })
              continue
            }
            const px = side === 1 ? l2CorrX(seed, k2) : l2CorrX(seed, k2) + 2 // 目标廊道近缘车道
            // v42：连廊不得横穿办公走廊（否则会给办公走廊开出第二个口）——相交则退回锁死的门
            if (hitsOfficeHall(Math.min(dx, px), y, Math.max(dx, px), y + 1)) {
              carveRectW(Math.min(dx, dx + sgn), y, Math.max(dx, dx + sgn), y)
              pushStruct('hoteldoor', dx, y, 1, 1, true, true, { open: 0, locked: 1, sealed: 1, hue })
              continue
            }
            carveRectW(Math.min(dx, px), y, Math.max(dx, px), y + 1)
            pushStruct('hoteldoor', dx, y, 1, 1, true, true, { open: 0, dbl: 1, hue })
            pushStruct('hoteldoor', dx, y + 1, 1, 1, true, true, { open: 0, dbl: 1, hue })
            continue
          }
          // 房间（大小各异：大设备房/补给间/电脑房/卧室/空房间；v42 最小开间 + 结构间 ≥1 净空）
          {
            const frng = new RNG(h32(seed, 0xfe, k, r, side, t))
            const roll = frng.next() // 与 l2RoomLayoutAt 同一 RNG 序列（roll 必一致）
            // v45：布局走模块级纯函数（信众宣传间判定/领地矩形共用同一几何）
            const lay = l2RoomLayoutAt(seed, k, r, side, t)
            if (!lay) { // 放不下房间：退化为锁死的门
              carveRectW(Math.min(dx, dx + sgn), y, Math.max(dx, dx + sgn), y)
              pushStruct('hoteldoor', dx, y, 1, 1, true, true, { open: 0, locked: 1, sealed: 1, hue })
              continue
            }
            const { x0, y0, x1, rw, rh } = lay
            // v45：卧室房型 ~8% 改生成信众宣传间
            const jerryRoom = l2IsJerryRoom(seed, k, r, side, t)
            // v42：房间不得蹭开办公走廊的侧墙（办公走廊仅单一开口）——相交则退化为锁死的门
            if (hitsOfficeHall(x0, y0, x1, y0 + rh - 1)) {
              carveRectW(Math.min(dx, dx + sgn), y, Math.max(dx, dx + sgn), y)
              pushStruct('hoteldoor', dx, y, 1, 1, true, true, { open: 0, locked: 1, sealed: 1, hue })
              continue
            }
            carveRectW(dx, y, dx, y) // 门洞
            carveRectW(x0, y0, x1, y0 + rh - 1)
            pushStruct('hoteldoor', dx, y, 1, 1, true, true, { open: 0, hue })
            const rcx = x0 + (rw >> 1), rcy = y0 + (rh >> 1)
            // 房间内布置助手：结构间保留 ≥1 格净空、门口 1 格内不放实心（从离门最远处摆起）。
            // 只用 frng/纯哈希——房间可跨 chunk，两个 chunk 必须作出完全一致的摆放决定
            const solids: { x: number; y: number; w: number; h: number }[] = []
            const doorInX = side === 1 ? x0 : x1 // 门内侧瓦片
            const furnOK = (fx: number, fy: number, fw: number, fh: number) => {
              if (fx < x0 || fy < y0 || fx + fw - 1 > x1 || fy + fh - 1 > y0 + rh - 1) return false
              for (const s2 of solids)
                if (fx - 1 < s2.x + s2.w && fx + fw + 1 > s2.x && fy - 1 < s2.y + s2.h && fy + fh + 1 > s2.y) return false
              for (let j = fy; j < fy + fh; j++)
                for (let i = fx; i < fx + fw; i++)
                  if (Math.max(Math.abs(i - doorInX), Math.abs(j - y)) <= 1) return false
              return true
            }
            const placeFurn = (kind: Structure['kind'], w: number, h: number, solid: boolean, withSid = false, data?: Structure['data']): boolean => {
              const cand: [number, number][] = []
              for (let j = y0; j <= y0 + rh - h; j++) for (let i = x0; i <= x1 - w + 1; i++) cand.push([i, j])
              const dd = (i: number, j: number) => Math.hypot(i + w / 2 - doorInX, j + h / 2 - y)
              cand.sort((a, b) => dd(b[0], b[1]) - dd(a[0], a[1]) || a[1] - b[1] || a[0] - b[0])
              for (const [i, j] of cand)
                if (furnOK(i, j, w, h)) {
                  solids.push({ x: i, y: j, w, h })
                  pushStruct(kind, i, j, w, h, solid, withSid, data)
                  return true
                }
              return false
            }
            let bedroom = false
            if (roll < 0.35) {
              // 大设备房：大号工业设备（锅炉/主发电机/发电机）+ 管线表盘（按最终开间降级）
              if (rw >= 5 && rh >= 5) placeFurn('boiler', 3, 3, true, false, { dead: machineDead })
              else if (rw >= 4 && rh >= 3) placeFurn('maingen', Math.min(3, rw - 2), 2, true, false, { dead: machineDead })
              else placeFurn('generator', 2, 1, true, false, { dead: machineDead })
              placeFurn('pipes', 1, 1, false, false, { rust: machineDead })
              if (frng.chance(0.6)) placeFurn('gauge', 1, 1, false)
            } else if (roll < 0.6) {
              // 补给间：补给箱（crate/megcrate 带 loot）+ 货架
              placeFurn('crate', 1, 1, true, true, { loot: 1 })
              if (frng.chance(0.55)) placeFurn('megcrate', 1, 1, true, true, { loot: 1 })
              if (frng.chance(0.6)) placeFurn('binshelf', 1, 1, true)
              if (frng.chance(0.4)) placeFurn('locker', 1, 1, true, true, { loot: 1 })
              if (frng.chance(0.3) && !solids.some((s2) => rcx >= s2.x && rcx < s2.x + s2.w && rcy >= s2.y && rcy < s2.y + s2.h)) {
                const pool = [...def.items, ...UNIVERSAL_ITEMS]
                pushItem(frng.weighted(pool.map((p) => ({ v: p.type, w: p.w }))), rcx, rcy)
              }
            } else if (roll < 0.8) {
              // 电脑房：大号台式电脑 + 桌椅（微光屏）
              placeFurn('bigcomputer', 2, 1, true, false, { dead: machineDead })
              placeFurn('officechair', 1, 1, false, false, { rot: 2 })
              if (frng.chance(0.6)) placeFurn('table', 1, 1, true)
            } else if (roll < 0.9) {
              // 卧室（v42 新增房型：床 + 桌 + 椅 + 充足灯光——无面灵只在这类房间生成）
              // v45：~8% 改生成信众宣传间（无无面灵；1 名信众 NPC；墙壁贴满宣传海报）
              bedroom = true
              placeFurn('bed', 1, 2, true)
              placeFurn('table', 1, 1, true)
              placeFurn('officechair', 1, 1, false, false, { rot: frng.int(0, 3) })
              if (!jerryRoom && frng.chance(0.4)) placeFurn('binshelf', 1, 1, true)
            } else {
              // 空房间
              if (frng.chance(0.3)) placeFurn('corpse', 1, 1, false, true, { loot: 1 })
              if (frng.chance(0.5)) placeFurn('graffiti', 1, 1, false, true, { lore: frng.int(0, 5) })
            }
            // 灯光：卧室保底充足灯光；其余房间 65% 一盏
            if (bedroom) {
              pushLight(rcx, rcy, 3.8, variant === 'dirty' ? '#ffb35c' : '#e8e4da')
              if (frng.chance(0.7)) pushLight(x0 + 1, y0 + 1, 2.8, '#ffe9b0')
            } else if (frng.chance(0.65)) pushLight(rcx, rcy, variant === 'dim' ? 2.2 : 3.5, variant === 'dirty' ? '#ffb35c' : variant === 'dim' ? '#a8946a' : '#e8e4da')
            // 无面灵：只生成于卧室类房间内（锚点=房间中心，由归属 chunk 推送防重复；v45 信众宣传间无无面灵）
            if (bedroom && !jerryRoom && frng.chance(0.4) && inChunk(rcx, rcy)) entities.push({ type: 'faceling', x: rcx + 0.5, y: rcy + 0.5 })
            // v45：信众宣传间内容——满墙信众宣传海报（megposter data.tex=jerry_poster.png 贴一圈）+ 1 名信众 NPC
            if (jerryRoom) {
              // 海报：内腔边缘瓦片（外侧即墙，渲染层 mountOnWall 强制贴最近墙），避开实心家具与门内一格
              let posters = 0
              for (let py = y0; py <= y0 + rh - 1 && posters < 24; py++)
                for (let px = x0; px <= x1 && posters < 24; px++) {
                  if (!(px === x0 || px === x1 || py === y0 || py === y0 + rh - 1)) continue
                  if (px === doorInX && py === y) continue // 门内一格留空（门侧两翼照贴——满墙宣传）
                  if (solids.some((s2) => px >= s2.x && px < s2.x + s2.w && py >= s2.y && py < s2.y + s2.h)) continue
                  pushStruct('megposter', px, py, 1, 1, false, false, { tex: 'jerry_poster.png' })
                  posters++
                }
              // 信众 NPC：房内非边缘、无实心、离门最远的瓦片（同种子同房同位；定义按槽位确定性生成）
              const cand: [number, number][] = []
              for (let py = y0 + 1; py <= y0 + rh - 2; py++)
                for (let px = x0 + 1; px <= x1 - 1; px++) {
                  if (solids.some((s2) => px >= s2.x && px < s2.x + s2.w && py >= s2.y && py < s2.y + s2.h)) continue
                  if (Math.max(Math.abs(px - doorInX), Math.abs(py - y)) <= 1) continue
                  cand.push([px, py])
                }
              cand.sort((a, b) =>
                (Math.hypot(b[0] - doorInX, b[1] - y) - Math.hypot(a[0] - doorInX, a[1] - y)) || a[1] - b[1] || a[0] - b[0])
              const spot = cand[0] ?? [rcx, rcy]
              if (inChunk(spot[0], spot[1]))
                npcs.push({ def: jerryFollowerDef(seed, k, r, side, t), x: spot[0] + 0.5, y: spot[1] + 0.5, facing: Math.atan2(y - spot[1] - 0.5, doorInX - spot[0] - 0.5) })
            }
          }
        }
      }
    }
  }

  // ---- 贴墙机器壁龛（狭窄感来自两侧贴墙机器；不占 3 宽净空）----
  {
    const density = variant === 'tidy' ? 0.5 : variant === 'dim' ? 0.4 : variant === 'dirty' ? 0.35 : 0.3
    for (let k = kMin; k <= kMax; k++) {
      const X = l2CorrX(seed, k)
      if (X + 2 < WX - 6 || X > WX + CS + 6) continue
      for (let r = rMin; r <= rMax; r++) {
        const ya = l2RowY(seed, r), yb = l2RowY(seed, r + 1)
        if (yb < WY || ya > WY + CS - 1) continue
        for (const side of [0, 1] as const) {
          const ax = side === 0 ? X - 1 : X + 3
          for (const t of [0, 1]) {
            if (h01(seed, 0xa2, k, r, side, t) >= density) continue
            const y = ya + 6 + t * 9 + (h32(seed, 0xa1, k, r, side, t) % 4)
            if (l2Serve(seed, k, r)) { if (y > yb - 3) continue }
            else if (y > ya + l2StubN(seed, k, r) - 2) continue
            // 与门位保持 ≥3 格（门规则：门两侧必须为墙；双开门占 y..y+1 两格，统一按 |Δy|≤2 避让）
            let clash = false
            for (const t2 of [0, 1, 2]) {
              const s2 = doorSlotAt(k, r, side, t2)
              if (s2 && Math.abs(s2.y - y) <= 2) clash = true
            }
            if (clash) continue
            // v42：与墙面段（贴墙管排/代墙管道/代墙机器）保持 ≥1 格
            for (const sg of (side === 0 ? l2WallSegsAt(seed, k, r).west : l2WallSegsAt(seed, k, r).east))
              if (y >= sg.y0 - 1 && y <= sg.y1 + 1) clash = true
            if (clash) continue
            // 壁龛只开在仍是墙的位置（房间/通道/横道已雕刻处跳过）
            if (!inChunk(ax, y)) continue
            if (isF(ax - WX, y - WY)) continue
            carveRectW(ax, y, ax, y)
            const crng = new RNG(h32(seed, 0xa3, k, r, side, t))
            const roll = crng.next()
            if (roll < 0.4) pushStruct('generator', ax, y, 1, 1, true, false, { dead: machineDead })
            else if (roll < 0.65) pushStruct('cabinet', ax, y, 1, 1, true, true, { loot: 1 })
            else if (roll < 0.85) pushStruct('pipes', ax, y, 1, 1, false, false, { rust: machineDead })
            else pushStruct('valve', ax, y, 1, 1, false, false, { on: crng.chance(0.5) ? 1 : 0 })
          }
        }
      }
    }
  }

  // ---- 扭曲的廊道：横穿廊道的大小管道（蹲伏低通道 crawl=1 / 高差下沉台阶）----
  if (variant === 'warped') {
    for (let k = kMin; k <= kMax; k++) {
      const X = l2CorrX(seed, k)
      if (X + 2 < WX || X > WX + CS - 1) continue
      for (let r = rMin; r <= rMax; r++) {
        const ya = l2RowY(seed, r), yb = l2RowY(seed, r + 1)
        if (yb < WY || ya > WY + CS - 1 || !l2Serve(seed, k, r)) continue
        // 蹲伏横穿管（1~2 处/区块）：3 宽整排 crawl + 横跨管道模型
        // v42：避开贴墙平行粗管段（fpipes）——横穿管与纵向管排交叉会互相穿插
        const fpSegs = [...l2WallSegsAt(seed, k, r).west, ...l2WallSegsAt(seed, k, r).east].filter((s2) => s2.mode === 'fpipes')
        const hitFp = (yy: number) => fpSegs.some((s2) => yy >= s2.y0 - 1 && yy <= s2.y1 + 1)
        const nC = h01(seed, 0xb4, k, r) < 0.7 ? 1 : 2
        for (let i = 0; i < nC; i++) {
          let y = ya + 5 + i * 11 + (h32(seed, 0xb4 + i, k, r) % 5)
          if (hitFp(y)) y += 3 // 与贴墙管排冲突：下移 3 格再试，仍冲突则放弃本处
          if (y > yb - 4 || hitFp(y)) continue
          stampCrawlW(X, y, X + 2, y)
          pushStruct('pipes', X, y, 3, 1, false, false, { cross: 1, rust: 0 })
        }
        // 高差下沉台阶（stitch 按 elev 边界自动生成双向坡道）
        if (h01(seed, 0xb5, k, r) < 0.45) {
          const y = ya + 9 + (h32(seed, 0xb5, k, r) % 7)
          if (y <= yb - 4) stampElevW(X, y, X + 2, y, 1)
        }
      }
    }
  }

  // ---- 墙面段生成（v42：贴墙平行粗管 fpipes / 代墙管道 wpipes / 代墙大型机器 wmach）----
  // fpipes：实心占 1 条车道边（净宽 3→2 ≥1.5m，永不两侧同段堵死——见 l2WallSegsAt）；
  // wpipes/wmach：落在墙线（净宽不变，整段墙面化身管排/大型设备；段旁无门——见 l2DoorSlotAt）。
  // 平行管道段两端瓦片打 endEl 弯头标记（1=入顶 2=入地；endS=1 为南端），渲染弧形拐弯不留断头。
  for (let k = kMin; k <= kMax; k++) {
    const X = l2CorrX(seed, k)
    if (X + 2 < WX - 6 || X > WX + CS + 6) continue
    for (let r = rMin; r <= rMax; r++) {
      const ya = l2RowY(seed, r), yb = l2RowY(seed, r + 1)
      if (yb < WY || ya > WY + CS - 1) continue
      for (const side of [0, 1] as const) {
        const segs = side === 0 ? l2WallSegsAt(seed, k, r).west : l2WallSegsAt(seed, k, r).east
        const lx = side === 0 ? X : X + 2 // fpipes 贴墙车道边
        const wx = side === 0 ? X - 1 : X + 3 // wpipes/wmach/顶缘管线 墙线
        for (const seg of segs) {
          const tx = seg.mode === 'fpipes' ? lx : wx
          const eN = (h32(seed, 0xc9, k, r, side, seg.y0) % 2) + 1 // 北端弯头方向
          const eS = (h32(seed, 0xca, k, r, side, seg.y0) % 2) + 1 // 南端弯头方向
          for (let yy = seg.y0; yy <= seg.y1; yy++) {
            if (!inChunk(tx, yy)) continue
            const end = yy === seg.y0 ? { endEl: eN, endS: 0 } : yy === seg.y1 ? { endEl: eS, endS: 1 } : null
            if (seg.mode === 'fpipes') {
              // 只要地板、非 crawl、无实心（门位/壁龛/横穿管已按纯函数避让，正常不会跳过）
              if (!isF(tx - WX, yy - WY) || crawl[li(tx - WX, yy - WY)] === 1 || solidAtL(tx, yy)) continue
              pushStruct('pipes', tx, yy, 1, 1, true, false, { run: 1, side, rust: machineDead, ...(end ?? {}) })
            } else {
              if (tiles[li(tx - WX, yy - WY)] !== 2) continue // 代墙：只落在仍是墙的瓦片
              if (seg.mode === 'wpipes') pushStruct('pipes', tx, yy, 1, 1, true, false, { wall: 1, side, rust: machineDead, ...(end ?? {}) })
              else pushStruct('machinewall', tx, yy, 1, 1, true, false, { mv: seg.mv, side, dead: machineDead })
            }
          }
        }
        // 天花板两缘管线装饰（task 8：细管 + 电缆线束沿廊道走向，非实心纯装饰；端头同样拐弯入顶/墙）
        if (h01(seed, 0xc7, k, r, side) < 0.38) {
          const len = 4 + (h32(seed, 0xcb, k, r, side) % 7) // 4..10
          const y0 = ya + 3 + (h32(seed, 0xcc, k, r, side) % 5)
          const eN = (h32(seed, 0xcd, k, r, side) % 2) + 1
          const eS = (h32(seed, 0xce, k, r, side) % 2) + 1
          const blocked = (yy: number) => segs.some((s2) => s2.mode !== 'fpipes' && yy >= s2.y0 && yy <= s2.y1)
          const run: number[] = []
          for (let yy = y0; yy <= Math.min(y0 + len + 6, yb - 1) && run.length < len; yy++) {
            const ok2 = inChunk(wx, yy) && tiles[li(wx - WX, yy - WY)] === 2 && l2CorridorFloorAt(seed, k, yy) && !blocked(yy)
            if (ok2) run.push(yy)
            else if (run.length) break // 开始后遇阻即收尾（端头打弯头）
          }
          if (run.length >= 2)
            for (let i = 0; i < run.length; i++) {
              const end = i === 0 ? { endEl: eN, endS: 0 } : i === run.length - 1 ? { endEl: eS, endS: 1 } : null
              pushStruct('pipes', wx, run[i], 1, 1, false, false, { ceil: 1, side, rust: machineDead, ...(end ?? {}) })
            }
        }
      }
    }
  }

  // ---- 窗户（windowtrap）：仅罕见地出现在走廊尽头的墙上 ----
  for (let k = kMin; k <= kMax; k++) {
    const X = l2CorrX(seed, k)
    if (X + 2 < WX || X > WX + CS - 1) continue
    for (let r = rMin; r <= rMax; r++) {
      if (l2Serve(seed, k, r)) continue
      const ya = l2RowY(seed, r), yb = l2RowY(seed, r + 1)
      const deadEnd = ya + l2StubN(seed, k, r) < yb + 1 - l2StubS(seed, k, r) // 两端 stub 未相接才是真尽头
      if (!deadEnd) continue
      if (h01(seed, 0xb6, k, r, 0) < 0.1) pushStruct('windowtrap', X + 1, ya + l2StubN(seed, k, r), 1, 1, false, true, {})
      if (h01(seed, 0xb6, k, r, 1) < 0.1) pushStruct('windowtrap', X + 1, yb + 1 - l2StubS(seed, k, r), 1, 1, false, true, {})
    }
  }

  // ---- 变体 tint（肮脏=锈橙棕 12 / 晦暗=积灰灰暗 13 / 整洁=洁净 14 / 扭曲=病绿 15）----
  const vTint = variant === 'dirty' ? 12 : variant === 'dim' ? 13 : variant === 'tidy' ? 14 : 15
  for (let y = 0; y < CS; y++)
    for (let x = 0; x < CS; x++)
      if (tint[li(x, y)] === 0) tint[li(x, y)] = vTint // 办公走廊的 16 已先盖章，不覆盖

  // ---- 灯光（按变体沿廊道/横道布置；扭曲=间距随机聚集分散）----
  const lightGap = variant === 'tidy' ? 6 : variant === 'dim' ? 5 : variant === 'dirty' ? 11 : 4
  const lightSpec = (): { r: number; c: string } => {
    switch (variant) {
      case 'tidy': return { r: rng.range(4.5, 5.5), c: '#e8e4da' } // 明亮整齐洁净
      case 'dim': return { r: rng.range(2.2, 2.8), c: '#a8946a' } // 充足但昏暗（低亮度低色温）
      case 'dirty': return { r: rng.range(5, 6), c: '#ffb35c' } // 稀疏但每盏较亮暖光
      default: { // 扭曲：明暗不定、色彩混乱
        const c = rng.pick(['#e8e4da', '#ffb35c', '#ff5a4a', '#c8c8b0'])
        return { r: rng.range(2.2, 5), c }
      }
    }
  }
  for (let k = kMin; k <= kMax; k++) {
    const X = l2CorrX(seed, k)
    const lane = X + 1
    if (lane < WX + 1 || lane > WX + CS - 2) continue
    let y = WY + 2 + rng.int(0, 2)
    while (y < WY + CS - 2) {
      if (isF(lane - WX, y - WY) && crawl[li(lane - WX, y - WY)] !== 1) {
        const s = lightSpec()
        pushLight(lane, y, s.r, s.c)
      }
      y += variant === 'warped' ? rng.int(2, 13) : lightGap // 扭曲：随机聚集/分散
    }
  }
  for (let r = rMin; r <= rMax; r++) {
    const ry = l2RowY(seed, r)
    if (ry < WY + 1 || ry > WY + CS - 2) continue
    let x = WX + 2 + rng.int(0, 3)
    while (x < WX + CS - 2) {
      if (isF(x - WX, ry - WY) && crawl[li(x - WX, ry - WY)] !== 1) {
        const s = lightSpec()
        pushLight(x, ry, s.r, s.c)
      }
      x += variant === 'warped' ? rng.int(3, 14) : 7
    }
  }

  // ---- 地面散件/墙面细节/湿地（肮脏：碎石与废弃金属；全变体：涂鸦/通风口/插板）----
  const placeOnFloor = (kind: Structure['kind'], solid: boolean, withSid = false, data?: Structure['data']): boolean => {
    for (let t = 0; t < 80; t++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(WX + x, WY + y) || crawl[li(x, y)] === 1) continue
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
  if (variant === 'dirty') {
    for (let i = 0, n = rng.int(1, 3); i < n; i++) placeOnFloor('debrispile', false)
    for (let i = 0, n = rng.int(1, 3); i < n; i++) placeOnFloor('scrap', false)
    // 锈水洼
    for (let i = 0, n = rng.int(1, 2); i < n; i++) {
      const x0 = rng.int(2, CS - 3), y0 = rng.int(2, CS - 3)
      for (let j = 0; j < 4; j++) {
        const x = x0 + rng.int(-1, 1), y = y0 + rng.int(-1, 1)
        if (isF(x, y)) wet[li(x, y)] = 1
      }
    }
  }
  for (let i = 0, n = rng.int(1, 3); i < n; i++) placeWallHug('pipes', false, { rust: machineDead })
  if (rng.chance(0.3)) placeWallHug('vent')
  if (rng.chance(0.4)) placeWallHug('socket')
  if (rng.chance(0.45)) placeWallHug('graffiti', true, { lore: rng.int(0, 5) })
  if (rng.chance(0.1)) placeOnFloor('corpse', false, true, { loot: 1 })
  // v46：办公区EL3A 地标改为贴墙海报——整洁的廊道小概率出现（BNTG 绿底海报「办公区EL3A 存储与分配」，
  // 贴在廊道墙上（placeWallHug 保证有墙可贴）；data.outpost='el3a' + data.poster=1，交互/标注/前往不变）
  if (variant === 'tidy' && rng.chance(0.02)) placeWallHug('landmark', false, { outpost: 'el3a', poster: 1, tex: 'el3a_poster.png' })

  // ---- 物品（补给极度匮乏：0~1 地面物品；磁带低频保底）----
  if (rng.chance(0.5)) {
    const pool = [...def.items, ...UNIVERSAL_ITEMS]
    const t0 = rng.weighted(pool.map((p) => ({ v: p.type, w: p.w })))
    const t = t0 === 'almond' && rng.chance(0.1) ? 'cashew' : t0
    for (let tr = 0; tr < 30; tr++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
      pushItem(t, WX + x, WY + y)
      break
    }
  }
  if (h01(seed, 0x7a9e, cx, cy) < 0.08) {
    for (let tr = 0; tr < 40; tr++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
      pushItem('tape', WX + x, WY + y)
      break
    }
  }

  // ---- 实体（低密度；按变体/黑暗度区分；无面灵只在卧室——见房间生成）----
  {
    const eChance = variant === 'tidy' ? 0.12 : variant === 'dim' ? 0.2 : variant === 'dirty' ? 0.28 : 0.26
    const pickFloor = (dark: boolean): { x: number; y: number } | null => {
      for (let t = 0; t < 40; t++) {
        const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
        if (!isF(x, y) || solidAtL(WX + x, WY + y) || crawl[li(x, y)] === 1) continue
        if (dark && lights.some((l) => Math.hypot(l.x - (WX + x + 0.5), l.y - (WY + y + 0.5)) < l.r)) continue
        return { x: WX + x, y: WY + y }
      }
      return null
    }
    if (rng.chance(eChance)) {
      // 笑魇：概率出现在黑暗廊道（肮脏/扭曲/晦暗低照度区），替代池中一次抽取
      const smiler = variant !== 'tidy' && rng.chance(0.3)
      const type = smiler ? 'smiler' : rng.weighted(def.entities.map((e) => ({ v: e.type, w: e.w })))
      if (type === 'corpserat') {
        // 尸鼠成群生成（v42：2~3 只一组，组内相距 ≤2 格；全组由同一只抽取产生）
        const p0 = pickFloor(false)
        if (p0) {
          entities.push({ type, x: p0.x + 0.5, y: p0.y + 0.5 })
          for (let i = 0, n = rng.int(2, 3); i < n - 1; i++) {
            for (let t = 0; t < 20; t++) {
              const x = p0.x + rng.int(-2, 2), y = p0.y + rng.int(-2, 2)
              if (x < WX + 1 || y < WY + 1 || x >= WX + CS - 1 || y >= WY + CS - 1) continue
              if (!isF(x - WX, y - WY) || solidAtL(x, y) || crawl[li(x - WX, y - WY)] === 1) continue
              entities.push({ type, x: x + 0.5, y: y + 0.5 })
              break
            }
          }
        }
      } else {
        const p = pickFloor(type === 'smiler')
        // v44：L2 死亡飞蛾为温顺小体型个体（calm 被动 + scale 0.6；被玩家/尸鼠攻击会反击）
        if (p) entities.push({ type, x: p.x + 0.5, y: p.y + 0.5, ...(type === 'deathmoth' ? { calm: true, scale: 0.6 } : {}) })
      }
    }
    // 管道蠕虫：小概率伪装成管道（静态拟态——看起来就是一根普通 pipes，近身才破土）
    if ((variant === 'dirty' || variant === 'warped') && rng.chance(0.05)) {
      const p = pickFloor(false)
      if (p) {
        pushStruct('pipes', p.x, p.y, 1, 1, false, false, { rust: machineDead })
        entities.push({ type: 'pipeworm', x: p.x + 0.5, y: p.y + 0.5 })
      }
    }
  }

  return { variant, tiles, wet, elev, step, tint, crawl, structures, items, lights, exits, entities, npcs }
}

// ---------- 注册（mapgen generateLevel → generateInfinite 经注册表分派）----------
registerInfiniteLevel(2, {
  genRaw: genL2ChunkRaw,
  variantOf: l2VariantOf,
  rareVariants: L2_RARE_VARIANTS,
  variantNames: L2_VARIANT_NAMES,
  variantLore: L2_VARIANT_LORE,
})
