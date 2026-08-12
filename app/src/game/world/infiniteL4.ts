// ================= v54：Level 4「废弃办公室」无限 chunk 生成 =================
// 布局基调：无限办公楼楼层——世界坐标纯函数走廊网（竖廊 3 宽 / 横廊 2 高，全部贯穿，
// 天然全连通），走廊之间的「街区」按群系噪声聚集成四种区段（chunk 边界天然缝合）：
//   办公间区 officehall（~30%）：开阔大厅，两侧靠墙整齐排布办公隔间（参考图一）；灯网整齐充足。
//   空旷区 open（~25%）：几乎无家具的大空间，稀疏立柱（参考图二）；灯网稍疏但仍充足。
//   窗景区 windowview（~15%）：一侧整排半透玻璃窗（glasswin data.deg 定向 + data.rain 雨痕），
//     窗外 3 深虚空条带（outdoor=1：不生成地板/天花板几何——真虚空只见雾灰天空；
//     虚空内有雨丝[瓦片钳制不漏进窗内]与雨雾片[非边界格锚定]）；灯网密度同其他区段、亮度略暗。
//   小房间区 smallrooms（~30%）：2×2 工作室/小办公室（桌 + 台式电脑/柜）；只有小房间有家具。
// 出口链：电梯（regionHost 8×8 超区域 1 槽位 + 出生 chunk 保底，dest 3 免费回程；
//   西/东墙门洞位雕 1 格壁龛嵌墙、房内背面格回砌成墙——薄墙让 1 格成厚墙，同 L3 v51 观感）；
//   年久失修的古典楼梯（oldstairs → Level 5，8×8 超区域 ~40% 宿主，小概率；v54b 假楼梯已删除）；
//   小房间每个 ~1.5% 藏「年久失修的活板门」（trapdoor，落地木框铁环盖板，通往 Level 6）。
// 雨声：常驻环境音（audio.startRain/stopRain，loadLevel 按 id===4 驱动）。
import { RNG } from '../core/rng'
import { UNIVERSAL_ITEMS } from '../content/items'
import type { LevelDef, Structure, LightSource, ExitInstance, GroundItem } from '../core/types'
import { CS, RS, h32, GEN_ITEM_BASE, regionHost, exitTarget } from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'

// ---------- 区段 ----------
export type L4Variant = 'officehall' | 'open' | 'windowview' | 'smallrooms'
export const L4_VARIANT_NAMES: Record<L4Variant, string> = {
  officehall: '办公间区', open: '空旷区', windowview: '窗景区', smallrooms: '小房间区',
}
export const L4_VARIANT_LORE: Record<string, string[]> = {
  officehall: [
    '办公间区——开阔的办公大厅，两侧靠墙整齐排着办公隔间，椅子还停在主人离开时的角度。荧光灯网把这里照得雪亮，桌面上却只有灰。',
    '档案提醒：大厅里几乎找不到物资——补给都集中在小房间。路过时看一眼隔间挡板后面就行，别停下来翻。',
  ],
  open: [
    '空旷区——近乎一无所有的大空间：地毯、立柱、裸露的门框，仅此而已。脚步声在这里传得很远，远到像有人在应和。',
    '档案建议：空旷区适合赶路，不适合停留。没有遮蔽物的开阔地，猎犬远远就能看见你。',
  ],
  windowview: [
    '窗景区——整排半透玻璃窗外是永不散去的雾：楼群剪影在灰白里沉浮，大雨永不止歇，雨痕在玻璃上爬成细密的网。自然光从这里渗进来，冷得像腌过的水。',
    '档案记录：窗景区的灯网和别处一样密，只是更暗——不是没电，是这层楼的电似乎偏爱远离窗边。别试图翻越玻璃；窗外没有地板，只有雨和雾。',
  ],
  smallrooms: [
    '小房间区——走廊之间隔出的工作室与小办公室：一张桌子、一台还亮着微光的台式电脑、一只文件柜。本层级绝大多数物资都藏在这类小房间里。',
    '档案提醒：小房间是 Level 4 的补给点（杏仁水全后室最多），也是盲角最多的地方——进门前先听门后有没有呼吸声。',
  ],
}
export const L4_RARE_VARIANTS: readonly string[] = ['windowview']

const h01 = (...n: number[]) => h32(...n) / 4294967296

// ---------- 区段判定（街区级群系噪声聚集，尺度 ~2 街区）----------
function blockNoise(seed: number, k: number, r: number): number {
  const S = 2
  const fx = k / S, fy = r / S
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const sm = (t: number) => t * t * (3 - 2 * t)
  const tx = sm(fx - x0), ty = sm(fy - y0)
  const v00 = h01(seed, 0x4b00, x0, y0), v10 = h01(seed, 0x4b00, x0 + 1, y0)
  const v01 = h01(seed, 0x4b00, x0, y0 + 1), v11 = h01(seed, 0x4b00, x0 + 1, y0 + 1)
  const a = v00 + (v10 - v00) * tx, b = v01 + (v11 - v01) * tx
  return a + (b - a) * ty
}

export function l4BlockBiome(seed: number, k: number, r: number): L4Variant {
  if (k === 0 && r === 0) return 'officehall' // 出生街区恒为办公间区（灯亮、安全引入）
  if (h01(seed, 0x4b10, k, r) < 0.06) { // 6% 异质（打破群系聚集）
    const v = h01(seed, 0x4b11, k, r)
    return v < 0.3 ? 'officehall' : v < 0.55 ? 'open' : v < 0.7 ? 'windowview' : 'smallrooms'
  }
  // 值噪声分布向 0.5 收拢——阈值按实测占比校准（办公间 ~30 / 空旷 ~25 / 窗景 ~15 / 小房间 ~30）
  const v = blockNoise(seed, k, r)
  return v < 0.36 ? 'officehall' : v < 0.57 ? 'open' : v < 0.7 ? 'windowview' : 'smallrooms'
}

// ---------- 走廊网（世界坐标纯函数：相邻 chunk 天然对齐）----------
const VSP = 20 // 竖廊名义间距（瓦片）
const HSP = 20 // 横廊名义间距
export const l4CorrX = (seed: number, k: number) =>
  13 + k * VSP + (k === 0 ? 0 : (h32(seed, 0x4c0, k) % 7) - 3) // 竖廊西缘；宽 3
export const l4RowY = (seed: number, r: number) =>
  13 + r * HSP + (r === 0 ? 0 : (h32(seed, 0x4d0, r) % 7) - 3) // 横廊北缘；高 2

// 街区矩形（内腔）：x0..x1 × y0..y1（四周留 1 格墙线，墙外即走廊）
function blockRect(seed: number, k: number, r: number) {
  return { x0: l4CorrX(seed, k) + 4, x1: l4CorrX(seed, k + 1) - 2, y0: l4RowY(seed, r) + 3, y1: l4RowY(seed, r + 1) - 2 }
}

// 街区门洞位（世界纯函数：北/西墙恒各 1，南/东 35%；窗景区窗所在侧不开——门洞直通虚空违反「仅观察」）
// 返回顺序即优先级：北 > 西 > 南 > 东；salt 供 hoteldoor 掷点（与门位绑定，跨 chunk 一致）
function blockOpenings(seed: number, k: number, r: number): { x: number; y: number; salt: number }[] {
  const { x0, x1, y0, y1 } = blockRect(seed, k, r)
  const biome = l4BlockBiome(seed, k, r)
  const winSide = biome === 'windowview' ? h32(seed, 0x4c1, k, r) % 4 : -1 // 0北 1东 2南 3西
  // 小房间区内墙线（xm 竖墙 / ym 横墙）：门洞不得与其相接（否则门「穿墙侧」一邻是内墙——门规则违例）
  const xm = (x0 + x1) >> 1, ym = (y0 + y1) >> 1
  const dodgeX = (x: number) => (biome === 'smallrooms' && x === xm ? (x + 1 <= x1 - 2 ? x + 1 : x - 1) : x)
  const dodgeY = (y: number) => (biome === 'smallrooms' && y === ym ? (y + 1 <= y1 - 2 ? y + 1 : y - 1) : y)
  const out: { x: number; y: number; salt: number }[] = []
  if (winSide !== 0) out.push({ x: dodgeX(x0 + 2 + (h32(seed, 0x4d2, k, r) % Math.max(1, x1 - x0 - 3))), y: y0 - 1, salt: 0x4d3 })
  if (winSide !== 3) out.push({ x: x0 - 1, y: dodgeY(y0 + 2 + (h32(seed, 0x4d4, k, r) % Math.max(1, y1 - y0 - 3))), salt: 0x4d5 })
  if (winSide !== 2 && (winSide >= 0 || h01(seed, 0x4d6, k, r) < 0.35))
    out.push({ x: dodgeX(x0 + 2 + (h32(seed, 0x4d7, k, r) % Math.max(1, x1 - x0 - 3))), y: y1 + 1, salt: 0x4d8 })
  if (winSide !== 1 && (winSide >= 0 || h01(seed, 0x4d9, k, r) < 0.35))
    out.push({ x: x1 + 1, y: dodgeY(y0 + 2 + (h32(seed, 0x4da, k, r) % Math.max(1, y1 - y0 - 3))), salt: 0x4db })
  return out
}

// 电梯槽位（世界纯函数；L3 v51 式嵌墙壁龛——出口格=向墙内雕出的 1 格壁龛，背面格保持砌墙）。
// L4 全是 1 格薄墙（墙后必为房间），故壁龛取「西/东墙门洞位」：壁龛格雕开、房内背面格回砌成墙
// （房间让出 1 格——厚墙由此而来）；只用西/东门洞是因为 geometry 门洞开凿按 +x/-x 优先取邻墙
// （南北向壁龛会把门洞开到侧面墙——L3 廊道全部东西向壁龛同理）。
// 区域宿主 chunk 的 exitTarget 所在街区（或最近街区）的第一个西/东门洞；槽位归属 chunk 推出口。
export function l4ElevSlot(seed: number, rx: number, ry: number): { x: number; y: number; bx: number; by: number } | null {
  const host = regionHost(seed, rx, ry)
  const t = exitTarget(seed, host.cx, host.cy)
  const wtx = host.cx * CS + t.x, wty = host.cy * CS + t.y
  const ke = Math.round((wtx - 17) / VSP), re = Math.round((wty - 16) / HSP)
  const cands: { k: number; r: number; d: number }[] = []
  for (let k = ke - 2; k <= ke + 2; k++)
    for (let r = re - 2; r <= re + 2; r++) {
      const { x0, x1, y0, y1 } = blockRect(seed, k, r)
      const d = Math.max(x0 - wtx, wtx - x1, y0 - wty, wty - y1, 0) // 矩形外切距离（0=包含）
      cands.push({ k, r, d })
    }
  cands.sort((a, b) => a.d - b.d)
  for (const c of cands) {
    const { x0, x1 } = blockRect(seed, c.k, c.r)
    for (const op of blockOpenings(seed, c.k, c.r)) {
      if (op.x === x0 - 1) return { x: op.x, y: op.y, bx: x0, by: op.y } // 西墙门洞：背面=房内 (x0, oy)
      if (op.x === x1 + 1) return { x: op.x, y: op.y, bx: x1, by: op.y } // 东墙门洞：背面=房内 (x1, oy)
    }
  }
  return null
}
// 出生电梯槽位：出生 chunk 保底——街区 (0,0) 的西墙门洞（v51 arriveElevator 落点在其旁）
export function l4SpawnElevSlot(seed: number): { x: number; y: number; bx: number; by: number } | null {
  const { x0, x1 } = blockRect(seed, 0, 0)
  for (const op of blockOpenings(seed, 0, 0)) {
    if (op.x === x0 - 1) return { x: op.x, y: op.y, bx: x0, by: op.y }
    if (op.x === x1 + 1) return { x: op.x, y: op.y, bx: x1, by: op.y }
  }
  return null
}

// chunk 显示变体 = 覆盖 chunk 中心瓦片的街区区段（走廊上则取西侧/北侧街区）
export function l4VariantOf(seed: number, cx: number, cy: number): L4Variant {
  const x = cx * CS + 16, y = cy * CS + 16
  const k = Math.round((x - 17) / VSP), r = Math.round((y - 16) / HSP)
  return l4BlockBiome(seed, k, r)
}

// ---------- chunk 生成（纯函数：同种子同坐标必一致；GenChunk 契约见 infiniteRegistry）----------
export function genL4ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string): GenChunk {
  const rng = new RNG(h32(seed, cx, cy, 0x4a4))
  const tiles = new Uint8Array(CS * CS).fill(2)
  const wet = new Uint8Array(CS * CS)
  const elev = new Uint8Array(CS * CS)
  const step = new Uint8Array(CS * CS)
  const tint = new Uint8Array(CS * CS)
  const crawl = new Uint8Array(CS * CS)
  const outdoor = new Uint8Array(CS * CS) // v54：窗景区窗外虚空条带（GenChunk 首个 outdoor 用例）
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
  const pushStruct = (kind: Structure['kind'], x: number, y: number, w: number, h: number, solid: boolean, data?: Structure['data']) => {
    if (!inChunk(x, y)) return
    structures.push({ kind, x, y, w, h, solid, data })
  }
  const pushItem = (type: string, x: number, y: number) => {
    if (!inChunk(x, y)) return
    items.push({ id: GEN_ITEM_BASE + ((cx & 0xff) << 12) + ((cy & 0xff) << 4) + (itemN++ & 0xf), type, x: x + 0.5, y: y + 0.5 })
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
  const outdoorRectW = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(y0, WY); y <= Math.min(y1, WY + CS - 1); y++)
      for (let x = Math.max(x0, WX); x <= Math.min(x1, WX + CS - 1); x++)
        outdoor[li(x - WX, y - WY)] = 1
  }
  const solidAtL = (x: number, y: number) =>
    structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)

  const kMin = Math.floor((WX - CS - 13) / VSP) - 1, kMax = Math.ceil((WX + 2 * CS - 13) / VSP) + 1
  const rMin = Math.floor((WY - CS - 13) / HSP) - 1, rMax = Math.ceil((WY + 2 * CS - 13) / HSP) + 1

  // ---- 走廊网（全部贯穿：横廊接通所有竖廊 → 天然全连通）----
  for (let r = rMin; r <= rMax; r++) {
    const ry = l4RowY(seed, r)
    if (ry + 1 < WY - CS || ry > WY + 2 * CS) continue
    carveRectW(WX - CS, ry, WX + 2 * CS, ry + 1)
  }
  for (let k = kMin; k <= kMax; k++) {
    const kx = l4CorrX(seed, k)
    if (kx + 2 < WX - CS || kx > WX + 2 * CS) continue
    carveRectW(kx, WY - CS, kx + 2, WY + 2 * CS)
  }
  // v54c：出生小广场删除——出生点 (15,15) 恒在竖廊 k=0（13..15）内，本就必是地板；
  // 旧 plaza 雕刻（12..18）误伤相邻街区的墙线（东墙列 x=12/南墙行 y=12 被清出一片缺口）

  // ---- 街区（四区段）----
  const findExitDef = (kind: string) => def.exits.find((e) => e.kind === kind)
  for (let k = kMin; k <= kMax; k++) {
    for (let r = rMin; r <= rMax; r++) {
      const { x0, x1, y0, y1 } = blockRect(seed, k, r)
      if (x1 < WX - 8 || x0 > WX + CS + 8 || y1 < WY - 8 || y0 > WY + CS + 8) continue
      const biome = (forceVariant ?? l4BlockBiome(seed, k, r)) as L4Variant
      carveRectW(x0, y0, x1, y1)
      // 门洞（blockOpenings 统一决定：北/西恒开、南/东 35%、窗侧不开、避让小房间内墙线；
      // 半数装 hoteldoor——无限层门规则自保证：沿墙两侧皆墙、穿墙两侧皆地板）。
      // 电梯槽位门洞：雕开作壁龛（出口嵌墙）、房内背面格回砌成墙（薄墙让出 1 格成厚墙）、不装门；
      // 槽位=世界纯函数，所有 chunk 判定一致。backSet=回砌格（家具/活板门避让）
      const slotMap = new Map<string, { bx: number; by: number }>() // 键=壁龛格 → 房内背面格
      const backSet = new Set<string>() // 回砌格（家具/活板门避让）
      {
        const crx = Math.floor(Math.floor(((x0 + x1) / 2) / CS) / RS), cry = Math.floor(Math.floor(((y0 + y1) / 2) / CS) / RS)
        for (let dry = -1; dry <= 1; dry++)
          for (let drx = -1; drx <= 1; drx++) {
            const sl = l4ElevSlot(seed, crx + drx, cry + dry)
            if (sl) slotMap.set(`${sl.x},${sl.y}`, { bx: sl.bx, by: sl.by })
          }
        const sp = l4SpawnElevSlot(seed)
        if (sp) slotMap.set(`${sp.x},${sp.y}`, { bx: sp.bx, by: sp.by })
      }
      for (const op of blockOpenings(seed, k, r)) {
        const slot = slotMap.get(`${op.x},${op.y}`)
        if (slot) { // 电梯壁龛：门洞格雕开（出口嵌墙）+ 房内背面格回砌成墙（薄墙让 1 格成厚墙）、不装门
          carveRectW(op.x, op.y, op.x, op.y)
          wallRectW(slot.bx, slot.by, slot.bx, slot.by)
          backSet.add(`${slot.bx},${slot.by}`)
          continue
        }
        carveRectW(op.x, op.y, op.x, op.y)
        if (h01(seed, op.salt, k, r) < 0.5 && !nearSpawn(op.x, op.y))
          pushStruct('hoteldoor', op.x, op.y, 1, 1, true, { open: 0, hue: h32(seed, op.salt + 1, k, r) % 5 })
      }

      if (biome === 'officehall') {
        // 办公间区：两侧靠墙整齐隔间排（挡板 + 转椅），灯网 4 格整齐充足
        for (let x = x0 + 1; x <= x1 - 1; x += 2) {
          if (h01(seed, 0x4b1, x, k, r) < 0.75 && !nearSpawn(x, y0 + 1) && !backSet.has(`${x},${y0 + 1}`)) {
            pushStruct('cubicle', x, y0 + 1, 1, 1, true)
            if (h01(seed, 0x4b2, x, k, r) < 0.6 && !backSet.has(`${x},${y0 + 2}`)) pushStruct('officechair', x, y0 + 2, 1, 1, false)
          }
          if (h01(seed, 0x4b3, x, k, r) < 0.75 && !nearSpawn(x, y1 - 1) && !backSet.has(`${x},${y1 - 1}`)) {
            pushStruct('cubicle', x, y1 - 1, 1, 1, true)
            if (h01(seed, 0x4b4, x, k, r) < 0.6 && !backSet.has(`${x},${y1 - 2}`)) pushStruct('officechair', x, y1 - 2, 1, 1, false)
          }
        }
        for (let x = x0 + 2; x <= x1 - 1; x += 4)
          for (let y = y0 + 2; y <= y1 - 1; y += 4) pushLight(x, y, 4.5, '#f2ead8')
        // v54b：自动售货机（wikidot L4 设定）——~30% 办公间区沿北墙/西墙边一台（免费取用+卡死机制见 interact vending case）
        if (h01(seed, 0x4b9, k, r) < 0.3) {
          const vx = x0 + 1 + (h32(seed, 0x4ba, k, r) % Math.max(1, x1 - x0 - 1))
          if (h01(seed, 0x4bb, k, r) < 0.5) { // 北墙边（贴 y0，门洞正前方格避让）
            if (!nearSpawn(vx, y0) && !solidAtL(vx, y0) && !backSet.has(`${vx},${y0}`)
              && !blockOpenings(seed, k, r).some((op) => op.x === vx && op.y === y0 - 1))
              pushStruct('vending', vx, y0, 1, 1, true, { trade: 1 })
          } else { // 西墙边
            const vy2 = y0 + 1 + (h32(seed, 0x4bc, k, r) % Math.max(1, y1 - y0 - 1))
            if (!nearSpawn(x0, vy2) && !solidAtL(x0, vy2) && !backSet.has(`${x0},${vy2}`)
              && !blockOpenings(seed, k, r).some((op) => op.y === vy2 && op.x === x0 - 1))
              pushStruct('vending', x0, vy2, 1, 1, true, { trade: 1 })
          }
        }
      } else if (biome === 'open') {
        // 空旷区：稀疏立柱 + 稍疏灯网（仍充足）
        for (let i = 0, n = 1 + (h32(seed, 0x4b5, k, r) % 2); i < n; i++) {
          const px = x0 + 3 + (h32(seed, 0x4b6 + i, k, r) % Math.max(1, x1 - x0 - 5))
          const py = y0 + 3 + (h32(seed, 0x4b8 + i, k, r) % Math.max(1, y1 - y0 - 5))
          if (!nearSpawn(px, py) && !backSet.has(`${px},${py}`)) pushStruct('pillar', px, py, 1, 1, true)
        }
        for (let x = x0 + 2; x <= x1 - 1; x += 5)
          for (let y = y0 + 2; y <= y1 - 1; y += 5) pushLight(x, y, 4.2, '#f2ead8')
      } else if (biome === 'windowview') {
        // 窗景区：一侧整排半透玻璃窗（朝向由 data.deg 显式给定：框贴街区外缘、玻璃面朝室内）；
        // 窗外 3 深虚空条带（outdoor=1——雾灰天空 + 永不消散的大雨）；
        // v54b：灯网密度与其他区段一致（4 格灯网）、亮度略暗（半径 ×0.65 冷白）+ 窗口天光，不留黑区
        const d = h32(seed, 0x4c1, k, r) % 4 // 0=北 1=东 2=南 3=西（条带所在侧）
        const deg = d === 2 ? 0 : d === 0 ? 180 : d === 1 ? 90 : 270 // inner 贴 +z 侧 → 条带方向
        if (d === 0 || d === 2) {
          const wy = d === 2 ? y1 - 3 : y0 + 3
          for (let x = x0; x <= x1; x++) pushStruct('glasswin', x, wy, 1, 1, true, { view: 1, rain: 1, deg })
          outdoorRectW(x0, d === 2 ? y1 - 2 : y0, x1, d === 2 ? y1 : y0 + 2)
          pushLight(Math.floor((x0 + x1) / 2), d === 2 ? y1 - 1 : y0 + 1, 6, '#c3cbce') // 窗口天光
        } else {
          const wx2 = d === 1 ? x1 - 3 : x0 + 3
          for (let y = y0; y <= y1; y++) pushStruct('glasswin', wx2, y, 1, 1, true, { view: 1, rain: 1, deg })
          outdoorRectW(d === 1 ? x1 - 2 : x0, y0, d === 1 ? x1 : x0 + 2, y1)
          pushLight(d === 1 ? x1 - 1 : x0 + 1, Math.floor((y0 + y1) / 2), 6, '#c3cbce')
        }
        for (let x = x0 + 2; x <= x1 - 1; x += 4) // 4 格灯网（同办公间区密度；半径 4.5×0.65≈2.9 略暗冷色）
          for (let y = y0 + 2; y <= y1 - 1; y += 4) pushLight(x, y, 2.9, '#dce4e6')
      } else {
        // 小房间区：2×2 工作室（内墙 + 每半墙 1 门洞互通；桌 + 台式电脑/柜/转椅；每室一灯）
        const xm = (x0 + x1) >> 1, ym = (y0 + y1) >> 1
        wallRectW(xm, y0, xm, y1)
        wallRectW(x0, ym, x1, ym)
        carveRectW(xm, y0 + 1 + (h32(seed, 0x4e1, k, r) % Math.max(1, ym - y0 - 1)), xm, y0 + 1 + (h32(seed, 0x4e1, k, r) % Math.max(1, ym - y0 - 1))) // 竖墙上门洞（上）
        carveRectW(xm, ym + 1 + (h32(seed, 0x4e2, k, r) % Math.max(1, y1 - ym - 1)), xm, ym + 1 + (h32(seed, 0x4e2, k, r) % Math.max(1, y1 - ym - 1))) // 竖墙门洞（下）
        carveRectW(x0 + 1 + (h32(seed, 0x4e3, k, r) % Math.max(1, xm - x0 - 1)), ym, x0 + 1 + (h32(seed, 0x4e3, k, r) % Math.max(1, xm - x0 - 1)), ym) // 横墙门洞（左）
        carveRectW(xm + 1 + (h32(seed, 0x4e4, k, r) % Math.max(1, x1 - xm - 1)), ym, xm + 1 + (h32(seed, 0x4e4, k, r) % Math.max(1, x1 - xm - 1)), ym) // 横墙门洞（右）
        const trapDef = findExitDef('trapdoor')
        const rooms: [number, number, number, number][] = [
          [x0, y0, xm - 1, ym - 1], [xm + 1, y0, x1, ym - 1], [x0, ym + 1, xm - 1, y1], [xm + 1, ym + 1, x1, y1],
        ]
        for (let ri = 0; ri < 4; ri++) {
          const [rx0, ry0, rx1, ry1] = rooms[ri]
          if (rx1 - rx0 < 2 || ry1 - ry0 < 2) continue
          // 家具（只有小房间有家具：桌 + 50% 台式电脑 / 40% 柜 / 50% 转椅）
          const dx = rx0 + 1 + (h32(seed, 0x4e5 + ri, k, r) % Math.max(1, rx1 - rx0 - 1))
          const dy = ry0 + 1 + (h32(seed, 0x4e9 + ri, k, r) % Math.max(1, ry1 - ry0 - 1))
          if (!nearSpawn(dx, dy) && !solidAtL(dx, dy) && !backSet.has(`${dx},${dy}`)) {
            // v54c：工位二选一——配大号台式机的工位用简桌（table），desk（自带小屏幕）工位不紧邻 bigcomputer
            const withBig = h01(seed, 0x4ed, ri, k, r) < 0.5
            pushStruct(withBig ? 'table' : 'desk', dx, dy, 1, 1, true)
            if (withBig) {
              const by = dy - 1 >= ry0 ? dy - 1 : dy + 1
              if (!solidAtL(dx, by) && !backSet.has(`${dx},${by}`)) pushStruct('bigcomputer', dx, by, 1, 1, true)
            }
            if (h01(seed, 0x4ee, ri, k, r) < 0.5 && !solidAtL(dx, dy + 1 <= ry1 ? dy + 1 : dy - 1) && !backSet.has(`${dx},${dy + 1 <= ry1 ? dy + 1 : dy - 1}`))
              pushStruct('officechair', dx, dy + 1 <= ry1 ? dy + 1 : dy - 1, 1, 1, false)
          }
          if (h01(seed, 0x4ef, ri, k, r) < 0.4) {
            const cab = h01(seed, 0x4f1, ri, k, r) < 0.5 ? 'cabinet' : 'locker' // 柜贴房间随机角
            const ccx = h01(seed, 0x4f2, ri, k, r) < 0.5 ? rx0 : rx1
            const ccy = h01(seed, 0x4f3, ri, k, r) < 0.5 ? ry0 : ry1
            if (!nearSpawn(ccx, ccy) && !solidAtL(ccx, ccy) && !backSet.has(`${ccx},${ccy}`)) pushStruct(cab, ccx, ccy, 1, 1, true, { loot: 1 })
          }
          // v54b：小房间区 ~15%/街区一台自动售货机（第一个子房间的东北/西南角，免费取用）
          if (ri === 0 && h01(seed, 0x4f7, k, r) < 0.15) {
            const vx = h01(seed, 0x4f8, k, r) < 0.5 ? rx0 : rx1, vy = h01(seed, 0x4f9, k, r) < 0.5 ? ry0 : ry1
            if (!nearSpawn(vx, vy) && !solidAtL(vx, vy) && !backSet.has(`${vx},${vy}`)) pushStruct('vending', vx, vy, 1, 1, true, { trade: 1 })
          }
          pushLight(Math.floor((rx0 + rx1) / 2), Math.floor((ry0 + ry1) / 2), 4, '#f2ead8')
          // 年久失修的活板门（极小概率 ~1.5%/小房间，通往 Level 6）
          // 锚点唯一候选（确定性单点）：不归本 chunk 即由所属 chunk 放置——不得逐 chunk 重掷（否则一室多门）
          if (trapDef && h01(seed, 0x4f4, ri, k, r) < 0.015) {
            const tx2 = rx0 + (h32(seed, 0x4f5 + ri, k, r) % Math.max(1, rx1 - rx0 + 1))
            const ty2 = ry0 + (h32(seed, 0x4f6 + ri, k, r) % Math.max(1, ry1 - ry0 + 1))
            if (inChunk(tx2, ty2) && !nearSpawn(tx2, ty2) && !solidAtL(tx2, ty2) && !backSet.has(`${tx2},${ty2}`)
              && !exits.some((e) => Math.floor(e.x) === tx2 && Math.floor(e.y) === ty2)) {
              exits.push({ def: trapDef, x: tx2, y: ty2, discovered: false })
              pushLight(tx2, ty2, 2, '#8a9a6a')
            }
          }
        }
      }
    }
  }

  // ---- 走廊灯网（充足照明：竖廊/横廊每 7 格一盏）----
  for (let k = kMin; k <= kMax; k++) {
    const kx = l4CorrX(seed, k), off = h32(seed, 0x4c11, k) % 7
    if (kx + 1 < WX || kx + 1 > WX + CS - 1) continue
    for (let y = WY - (WY % 7) + off; y < WY + CS; y += 7) pushLight(kx + 1, y, 4.2, '#f2ead8')
  }
  for (let r = rMin; r <= rMax; r++) {
    const ry = l4RowY(seed, r), off = h32(seed, 0x4c12, r) % 7
    if (ry < WY || ry > WY + CS - 1) continue
    for (let x = WX - (WX % 7) + off; x < WX + CS; x += 7) pushLight(x, ry, 4.2, '#f2ead8')
  }

  // ---- 出口 ①：电梯（→L3 免费回程；每 8×8 超区域 1 槽位 + 出生 chunk 保底 1 槽位）----
  // 嵌墙（L3 v51 式壁龛）：槽位=西/东墙门洞位——门洞格雕开作壁龛、房内背面格回砌成墙
  // （L4 全是 1 格薄墙，房间让出 1 格成厚墙；geometry DOOR_EXIT_KINDS 在背面墙格开门洞）。
  // 槽位=世界纯函数 l4ElevSlot/l4SpawnElevSlot；槽位瓦片归属哪个 chunk 就由哪个 chunk 推出口（恰 1 个）。
  const elevDef = findExitDef('elevatorshaft')
  if (elevDef) {
    const slots: { x: number; y: number }[] = []
    const rx = Math.floor(cx / RS), ry = Math.floor(cy / RS)
    for (let dry = -1; dry <= 1; dry++)
      for (let drx = -1; drx <= 1; drx++) {
        const sl = l4ElevSlot(seed, rx + drx, ry + dry) // 相邻区域槽位可能落在本 chunk（槽位距宿主 ≤1 chunk）
        if (sl) slots.push(sl)
      }
    const sp = l4SpawnElevSlot(seed)
    if (sp) slots.push(sp)
    for (const sl of slots) {
      if (!inChunk(sl.x, sl.y)) continue // 非本 chunk 归属——由所属 chunk 推
      if (exits.some((e) => Math.floor(e.x) === sl.x && Math.floor(e.y) === sl.y)) continue
      exits.push({ def: elevDef, x: sl.x, y: sl.y, discovered: false })
      pushLight(sl.x - WX, sl.y - WY, 2.5, '#f5e37a')
    }
  }

  // ---- 出口 ②：年久失修的古典楼梯（oldstairs → Level 5；8×8 超区域 ~40% 宿主，小概率）----
  // v54b：假楼梯（同层互传）已删除——L4 的楼梯出口只有古典楼梯
  {
    const oldDef = findExitDef('oldstairs')
    const rx = Math.floor(cx / RS), ry = Math.floor(cy / RS)
    const host = regionHost(seed, rx, ry)
    if (oldDef && host.cx === cx && host.cy === cy && h01(seed, 0x4e82, rx, ry) < 0.55) { // v54c：宿主率 40%→55%
      // 楼梯位：邻墙地板 + 反侧 4 格畅通（可行走阶梯机制硬要求；与 L0/dev 召唤同判据）
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
      for (let i = 0; i < 80 && !spot; i++) {
        const x = 4 + (h32(seed, 0x4e71 + i * 7, cx, cy) % (CS - 8))
        const y = 4 + (h32(seed, 0x4e71 + i * 7 + 3, cx, cy) % (CS - 8))
        if (!isF(x, y) || solidAtL(WX + x, WY + y) || nearSpawn(WX + x, WY + y)) continue
        if (isF(x + 1, y) && isF(x - 1, y) && isF(x, y + 1) && isF(x, y - 1)) continue // 需邻墙
        if (exits.some((e) => Math.floor(e.x) === WX + x && Math.floor(e.y) === WY + y)) continue
        const dir = runOk(x, y)
        if (!dir) continue
        // v54c：入梯口净空——楼梯格至少一侧横邻是地板（侧向登梯口），井口段另有 stairrail 护栏
        if (!isF(x + dir[1], y + dir[0]) && !isF(x - dir[1], y - dir[0])) continue
        spot = { x, y, dir }
      }
      if (spot) {
        exits.push({ def: oldDef, x: WX + spot.x, y: WY + spot.y, discovered: false })
        pushLight(spot.x, spot.y, 2.5, '#c9a24a') // 暖金微光（与电梯黄区分）
        // 下行走向 3 格标为深渊洞口（elev=4，视觉开洞；同 L0 灰色阶梯先例）
        for (let s2 = 1; s2 <= 3; s2++) elev[li(spot.x - spot.dir[0] * s2, spot.y - spot.dir[1] * s2)] = 4
        // v54b：井口护栏碰撞（stairrail 仅碰撞无模型；侧栏杆沿洞口两侧、尽头横栏——入梯口留在楼梯格两侧）
        const railDeg = Math.round((Math.atan2(spot.dir[0], spot.dir[1]) * 180) / Math.PI)
        for (let k2 = 1; k2 <= 3; k2++)
          pushStruct('stairrail', WX + spot.x - spot.dir[0] * k2, WY + spot.y - spot.dir[1] * k2, 1, 1, true,
            { deg: railDeg, end: k2 === 3 ? 1 : 0 }) // 注意世界坐标（spot 是 chunk 局部）
      }
    }
  }

  // ---- 定居点海报地标（M.E.G. Omega 基地 ~2.5%/chunk；贴墙校验同 L3 海报地标）----
  if (!(cx === 0 && cy === 0) && rng.chance(0.025)) {
    for (let t = 0; t < 40; t++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(WX + x, WY + y) || nearSpawn(WX + x, WY + y)) continue
      const wE = !isF(x + 1, y), wW = !isF(x - 1, y), wS = !isF(x, y + 1), wN = !isF(x, y - 1)
      if (!(wE || wW || wS || wN)) continue // 必须有邻侧墙（贴墙不浮空）
      if ((wE && wW) || (wS && wN)) continue // 狭窄贯通位不挂（同 L3 既有约束）
      pushStruct('landmark', WX + x, WY + y, 1, 1, false, { outpost: 'omega', poster: 1, tex: 'omega_poster.png' })
      break
    }
  }

  // ---- 物品（杏仁水全后室最多：def.items 杏仁水权重 40 显著最高；v54b 每 chunk 2~3 地面物品）----
  {
    const pool = [...def.items, ...UNIVERSAL_ITEMS]
    for (let i = 0, n = rng.int(2, 3); i < n; i++) {
      const t = rng.weighted(pool.map((p) => ({ v: p.type, w: p.w })))
      for (let tr = 0; tr < 30; tr++) {
        const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
        if (!isF(x, y) || solidAtL(WX + x, WY + y) || nearSpawn(WX + x, WY + y)) continue
        pushItem(t, WX + x, WY + y)
        break
      }
    }
  }

  // ---- 实体（几乎不生成：~1.2%/chunk 一只，池里只有猎犬/钝人；出生安全区不生成）----
  if (def.entities.length > 0 && (Math.abs(cx) > 1 || Math.abs(cy) > 1) && h01(seed, 0x4e91, cx, cy) < 0.012) {
    const t = rng.weighted(def.entities.map((e) => ({ v: e.type, w: e.w })))
    for (let tr = 0; tr < 40; tr++) {
      const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
      if (!isF(x, y) || solidAtL(WX + x, WY + y)) continue
      entities.push({ type: t, x: WX + x + 0.5, y: WY + y + 0.5 })
      break
    }
  }

  const variant = forceVariant ?? l4VariantOf(seed, cx, cy)
  return { variant, tiles, wet, elev, step, tint, crawl, outdoor, structures, items, lights, exits, entities }
}

// ---------- 注册（mapgen generateLevel → generateInfinite 经注册表分派）----------
registerInfiniteLevel(4, {
  genRaw: genL4ChunkRaw,
  variantOf: l4VariantOf,
  rareVariants: L4_RARE_VARIANTS,
  variantNames: L4_VARIANT_NAMES,
  variantLore: L4_VARIANT_LORE,
})
