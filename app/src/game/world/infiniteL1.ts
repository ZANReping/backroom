// ================= v29：Level 1「宜居地带」无限 chunk 生成 =================
// 布局基调（wikidot/Fandom 共识）：开阔停车层、工业仓储厅与多个主题区段的无尽缝合体。
// 开阔大厅 + 墙块孤岛 + 柱阵 + 悬挂荧光灯，而非 L0 的迷宫。
// v30：区段（Sections）扩展——天鹰段/过道/跃金段/哥特段/衔尾段/花园段与嵌入各区段门后的白墙小径；
// 原始装饰与旧灯光在末尾 applyL1Architecture 统一替换，最终五区与小径共享同一停电规则。
import { RNG } from '../core/rng'
import { applyL1Architecture } from './l1Architecture'
import {l1PlacementWallV2,l1ReferenceAt} from './l1Spatial'
import { UNIVERSAL_ITEMS } from '../content/items'
import { ENTITIES } from '../entities'
import { brcWorkerDef, type NpcDef } from '../content/npcs'
import type { LevelDef, Structure, LightSource, ExitInstance, GroundItem } from '../core/types'
import {
  CS, RS, GEN_ITEM_BASE, h32, regionHost, exitTarget, edgeOpen,
} from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'

// ---------- 变体 ----------
export type L1Variant =
  | 'parking' | 'aisle' | 'storage' | 'gothic' | 'ouroboros' | 'garden'
  | 'maintenance' | 'fabled'
export const L1_VARIANT_NAMES: Record<L1Variant, string> = {
  parking: '天鹰段', aisle: '过道', storage: '跃金段', gothic: '哥特段',
  ouroboros: '衔尾段', garden: '花园段',
  maintenance: '小径', fabled: '传说段',
}
// 区段档案（图鉴；设定依据 wikidot「宜居地带」区段概念与 Fandom 特殊区域条目）
export const L1_VARIANT_LORE: Record<string, string[]> = {
  parking: [
    '天鹰段——Level 1 最常见的区段。灰色墙面与地坪，加上巨型混凝土柱子，空旷得像没有车辆的停车层；新流浪者从黄色厅房切入时总会落在这里。探险者总署在此设立了 Alpha 基地，巡逻队穿着明亮淡黄外套、佩戴雄鹰徽章。',
    '天花板上漏水的小管子偶尔滴落水珠，但那些水不适合安全饮用。地面四散的水坑闻起来不甚干净，有种塑料般的死水气息。',
  ],
  aisle: [
    '「地下停车场和废弃仓库的无尽缝合体」。宽敞开阔的过道绵延数英里，单调褪色的墙壁间偶尔立起混凝土支柱，天花板的管道间不时传来零星的金属撞击声。',
    '宜居地带受非欧几何影响：你感知的距离不过是感官的假象。档案建议用地标导航——彩色的柱子、配电柜、板条箱——行进时保持视线固定。',
  ],
  storage: [
    '跃金段——白墙、工业梁架与裸露风管组成挑高仓库，悬吊灯盘照亮灰褐地坪，彩色管线和标识点缀其间。照明充足，板条箱成群，是搜集杏仁水、罐装食品和武器的重要场所。',
    '但有时板条箱会被液态痛苦填满，原因不明。翻翻看不亏，但别在箱子堆里逗留太久。',
  ],
  gothic: [
    '哥特段——成排的粗壮圆柱望不到头，柱顶像漏斗一样展开，与邻柱连成连绵的拱腹，像一座被搬进地下的交叉拱停车场。光线在这里总是偏暗，石柱的影子拉得很长。',
    '档案记载，拱腹之下的回声会延迟数秒才返回，仿佛大厅比看起来大得多。不要在拱廊下呼喊同伴的名字。',
  ],
  ouroboros: [
    '衔尾段——永无止境的施工状态。灰色毛坯混凝土、铲到一半露出补丁的墙、深色吊顶上裸露的风管与红色管道；脚手架搭了又拆、拆了又搭，路障围住的区域从未完工。',
    '这里是后室装修公司的领域。穿制服的黑影员工在墙边与脚手架旁日夜敲打——他们从不回应，也从不停手。档案备注：模仿他们的动作似乎能换取好感；但如果你对他们的同事动过手，千万不要当面说出来。',
  ],
  garden: [
    '花园段——青翠欲滴的色调与勃勃生机的表象：绿色植物与充足的阳光，在永夜的后室里像一场过于美好的梦。',
    '⚠ 切勿久留。进入者会患上「植殖癌」：行为逐渐僵硬，视野逐渐变绿，皮肤浮现叶脉——最终，你将原地生根，成为花园里又一株安静的植物。',
  ],
  fabled: [
    '传说段——曾经的人类要塞，迷失在时间之中。朱漆木梁、木护墙板与磨砂玻璃隔断还留着三百年前的温馨风貌，绚丽的霓虹与彩色电缆却已涌入古色古香的房间。',
    '后室会改变，但从未忘记它过去的模样。或许数十年后，这里也会褪成地下无数仓库大厅中平凡无奇的一个。',
  ],
  maintenance: [
    '白刷砖墙围出狭长、曲折的稳定走廊，裸露管线沿着梁顶延伸，门后散布着旧座椅、杂物和不同用途的小房间。',
    '各区段带绿色应急标识的金属门通往小径。停电时这里同样失去照明；实体较少，却仍可能从门外追入。关门并保持安静有助于避难。',
  ],
}
export const L1_RARE_VARIANTS: readonly string[] = ['storage', 'gothic', 'ouroboros', 'garden', 'maintenance', 'fabled']

const h01 = (...n: number[]) => h32(...n) / 4294967296

export { l1LayoutVariant as l1VariantOf } from './l1Layout'
import { l1LayoutVariant as l1VariantOf } from './l1Layout'

// ---------- chunk 生成（纯函数：同种子同坐标必一致）----------
function genL1LegacyManifest(def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string): GenChunk {
  const variant = (forceVariant ?? l1VariantOf(seed, cx, cy)) as L1Variant
  const rng = new RNG(h32(seed, cx, cy, 0x1a1))
  const tiles = new Uint8Array(CS * CS).fill(2)
  const wet = new Uint8Array(CS * CS)
  const elev = new Uint8Array(CS * CS)
  const step = new Uint8Array(CS * CS)
  const tint = new Uint8Array(CS * CS)
  const crawl = new Uint8Array(CS * CS) // v41：GenChunk 契约新增（L1 无蹲伏低通道，恒全 0）
  const structures: Structure[] = []
  const items: GroundItem[] = []
  const lights: LightSource[] = []
  const exits: ExitInstance[] = []
  const entities: { type: string; x: number; y: number }[] = []
  const npcs: { def: NpcDef; x: number; y: number; facing?: number }[] = []
  const li = (x: number, y: number) => y * CS + x
  const isF = (x: number, y: number) => x >= 0 && y >= 0 && x < CS && y < CS && tiles[li(x, y)] === 1
  const WX = cx * CS, WY = cy * CS
  const photo=l1ReferenceAt(seed,WX+16,WY+16)
  let sidN = 0, itemN = 0
  const sidOf = (n: number) => ((cx & 0xff) << 24) | ((cy & 0xff) << 16) | ((n & 0xff) << 4) | 1
  const pushStruct = (kind: Structure['kind'], x: number, y: number, w: number, h: number, solid: boolean, withSid = false, data?: Structure['data']) => {
    const d = withSid ? { ...data, sid: sidOf(sidN++) } : data
    structures.push({ kind, x: WX + x, y: WY + y, w, h, solid, data: d })
  }
  const pushItem = (type: string, x: number, y: number) => {
    items.push({ id: GEN_ITEM_BASE + ((cx & 0xff) << 12) + ((cy & 0xff) << 4) + (itemN++ & 0xf), type, x: WX + x + 0.5, y: WY + y + 0.5 })
  }
  const pushLight = (x: number, y: number, r: number, color: string, keep = false) => {
    lights.push({ x: WX + x + 0.5, y: WY + y + 0.5, r, color, flickerSeed: rng.next() * 100, gen: 1, ...(keep ? { keep: 1 as const } : {}) })
  }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(1, y0); y <= Math.min(CS - 2, y1); y++)
      for (let x = Math.max(1, x0); x <= Math.min(CS - 2, x1); x++) tiles[li(x, y)] = 1
  }
  const solidAtL = (x: number, y: number) =>
    structures.some((s) => s.solid && WX + x >= s.x && WX + x < s.x + s.w && WY + y >= s.y && WY + y < s.y + s.h)
  // 空地放置（本 chunk 3..28 区域，需外圈全地板）
  const placeFree = (kind: Structure['kind'], w: number, h: number, solid: boolean, withSid = false, data?: Structure['data']): boolean => {
    for (let t = 0; t < 80; t++) {
      const x = rng.int(3, CS - w - 4), y = rng.int(3, CS - h - 4)
      let ok = true
      for (let j = y - 1; j <= y + h && ok; j++)
        for (let i = x - 1; i <= x + w && ok; i++)
          if (!isF(i, j) || solidAtL(i, j)) ok = false
      if (!ok) continue
      pushStruct(kind, x, y, w, h, solid, withSid, data)
      return true
    }
    return false
  }
  // 贴墙放置（涂鸦/通风口/钢筋；需相邻非地板）
  const placeWallHug = (kind: Structure['kind'], withSid = false, data?: Structure['data']): boolean => {
    for (let t = 0; t < 120; t++) {
      const x = rng.int(3, CS - 4), y = rng.int(3, CS - 4)
      if (!isF(x, y) || solidAtL(x, y)) continue
      if (!(isF(x + 1, y) && isF(x - 1, y) && isF(x, y + 1) && isF(x, y - 1))) {
        pushStruct(kind, x, y, 1, 1, false, withSid, data)
        return true
      }
    }
    return false
  }
  // 走廊放置（维护通廊 2 宽走廊专用：只要求本格地板，非实心小物件）
  const placeLoose = (kind: Structure['kind'], withSid = false, data?: Structure['data']): boolean => {
    for (let t = 0; t < 120; t++) {
      const x = rng.int(1, CS - 2), y = rng.int(1, CS - 2)
      if (!isF(x, y) || solidAtL(x, y)) continue
      pushStruct(kind, x, y, 1, 1, false, withSid, data)
      return true
    }
    return false
  }

  // ---- 基础地形（v31：L1 房间可无缝衔接——非维护通廊之间边界默认开放，仅按共享边哈希留
  // 零星墙柱；维护通廊与其他区段之间总有整面墙，每一邻接边只在共享门位开一扇可交互墨黑金属门）----
  const east = edgeOpen(seed, true, cx + 1, cy)
  const west = edgeOpen(seed, true, cx, cy)
  const south = edgeOpen(seed, false, cx, cy + 1)
  const north = edgeOpen(seed, false, cx, cy)
  // 邻 chunk 变体（l1VariantOf 为纯函数，安全调用）
  const vE = l1VariantOf(seed, cx + 1, cy), vW = l1VariantOf(seed, cx - 1, cy)
  const vS = l1VariantOf(seed, cx, cy + 1), vN = l1VariantOf(seed, cx, cy - 1)
  // 维护通廊门位：共享边哈希（两侧 chunk 算得同一槽位，对齐走廊槽位 2+3k）
  const doorSlot = (vertical: boolean, a: number, b: number) => 2 + 3 * (h32(seed, vertical ? 0xd001 : 0xd002, a, b) % 10)
  const dE = doorSlot(true, cx + 1, cy), dW = doorSlot(true, cx, cy)
  const dS = doorSlot(false, cx, cy + 1), dN = doorSlot(false, cx, cy)
  // 原始共享边装饰；末尾 applyL1Architecture 会统一替换最终区段与小径边界。
  // No decorative boundary walls: the streaming grid must remain invisible.
  if (variant === 'maintenance') {
    // 维护通廊：整 chunk 实心，只雕 2 宽曲折走廊（狭窄且如迷宫）
    // 主走廊一横一纵（对齐开口槽位 2+3k），口字形内环与之相交成迷宫
    const hy = photo?.variant==='maintenance'?14:2 + 3 * rng.int(1, 8)
    const vx = photo?.variant==='maintenance'?14:2 + 3 * rng.int(1, 8)
    carve(1, hy, CS - 2, hy + 1)
    carve(vx, 1, vx + 1, CS - 2)
    const r0 = 2 + 3 * rng.int(0, 2), r1 = 2 + 3 * rng.int(6, 8)
    carve(r0, r0, r1 + 1, r0 + 1)
    carve(r0, r1, r1 + 1, r1 + 1)
    carve(r0, r0, r0 + 1, r1 + 1)
    carve(r1, r0, r1 + 1, r1 + 1)
    // Rooms branch from the stable corridor rather than occupying a separate district.
    if(photo?.id==='path-room'||!photo&&rng.chance(.45)){
      carve(vx,19,Math.min(28,vx+6),20)
      carve(Math.min(23,vx+3),18,Math.min(28,vx+6),26)
    }
    // 边缘开口：与其他区段相邻的边 → 整边墙体，仅在共享门位开一扇墨黑金属门（可交互开关）；
    // 与维护通廊相邻的边 → 走廊槽位直接连通（同区段不设门）
    const connect = (x0: number, y0: number, dx: number, dy: number) => {
      let x = x0, y = y0
      for (let d = 0; d < CS; d++) {
        const x2 = dy !== 0 ? x + 1 : x, y2 = dx !== 0 ? y + 1 : y
        if (x2 < 0 || y2 < 0 || x2 >= CS || y2 >= CS) break
        if (isF(x, y) && isF(x2, y2)) break
        tiles[li(x, y)] = 1
        tiles[li(x2, y2)] = 1
        x += dx; y += dy
      }
    }
    for (let k = 0; k < 10; k++) {
      const t = 2 + 3 * k
      if (vE !== 'maintenance' ? t === dE : east[k]) {
        tiles[li(CS - 1, t)] = 1; tiles[li(CS - 1, t + 1)] = 1; connect(CS - 2, t, -1, 0)
        if (vE !== 'maintenance') pushStruct('inkdoor', CS - 1, t, 1, 2, true, true, { open: 0 })
      }
      if (vW !== 'maintenance' ? t === dW : west[k]) {
        tiles[li(0, t)] = 1; tiles[li(0, t + 1)] = 1; connect(1, t, 1, 0)
        if (vW !== 'maintenance') pushStruct('inkdoor', 0, t, 1, 2, true, true, { open: 0 })
      }
      if (vS !== 'maintenance' ? t === dS : south[k]) {
        tiles[li(t, CS - 1)] = 1; tiles[li(t + 1, CS - 1)] = 1; connect(t, CS - 2, 0, -1)
        if (vS !== 'maintenance') pushStruct('inkdoor', t, CS - 1, 2, 1, true, true, { open: 0, rot: 1 })
      }
      if (vN !== 'maintenance' ? t === dN : north[k]) {
        tiles[li(t, 0)] = 1; tiles[li(t + 1, 0)] = 1; connect(t, 1, 0, 1)
        if (vN !== 'maintenance') pushStruct('inkdoor', t, 0, 2, 1, true, true, { open: 0, rot: 1 })
      }
    }
  } else {
    // 开阔大厅：整 chunk 雕通到边缘（仅留 1 格外圈墙环）
    tiles.fill(1)
    // 边界：邻维护通廊 → 整边墙体，仅在共享门位开 2 宽门洞（门本体在维护通廊一侧）；
    // 否则 → 房间无缝衔接，仅零星墙柱
    for (let t = 1; t < CS - 1; t++) {
      if (vE === 'maintenance') tiles[li(CS - 1, t)] = t===dE||t===dE+1?1:2
      if (vW === 'maintenance') tiles[li(0, t)] = t===dW||t===dW+1?1:2
      if (vS === 'maintenance') tiles[li(t, CS - 1)] = t===dS||t===dS+1?1:2
      if (vN === 'maintenance') tiles[li(t, 0)] = t===dN||t===dN+1?1:2
    }
    // 墙块孤岛（不贴外圈，保持 chunk 间开阔连通；数量按变体）
    for(let y=0;y<CS;y++)for(let x=0;x<CS;x++)if(l1PlacementWallV2(seed,WX+x,WY+y,variant))tiles[li(x,y)]=2
    const nBlocks = variant === 'ouroboros' ? rng.int(0,1) : 0
    for (let b = 0; b < nBlocks; b++) {
      const bw = rng.int(2, 3), bh = rng.int(2, 3)
      const bx = rng.int(5, CS - 5 - bw), by = rng.int(5, CS - 5 - bh)
      if (Math.abs(bx - 16) + Math.abs(by - 16) < 3) continue // 通道中心留空
      if (cx === 0 && cy === 0 && Math.abs(bx - 15) + Math.abs(by - 15) < 4) continue // 出生点（局部 15,15）留空，不压遮挡物
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) tiles[li(x, y)] = 2
    }
    // Reserve a body-wide approach to every shared path doorway after world partitions.
    if(vE==='maintenance')for(let x=CS-4;x<CS;x++)for(let y=dE;y<=dE+1;y++)tiles[li(x,y)]=1
    if(vW==='maintenance')for(let x=0;x<4;x++)for(let y=dW;y<=dW+1;y++)tiles[li(x,y)]=1
    if(vS==='maintenance')for(let y=CS-4;y<CS;y++)for(let x=dS;x<=dS+1;x++)tiles[li(x,y)]=1
    if(vN==='maintenance')for(let y=0;y<4;y++)for(let x=dN;x<=dN+1;x++)tiles[li(x,y)]=1
  }

  // ---- 变体内容 ----
  switch (variant) {
    case 'aisle': {
      // 开阔过道：稀疏立柱，连接相邻区段；空间尺度在此发生收缩或扩张。
      for (let i = 0, n = rng.int(1, 3); i < n; i++) placeFree('pillar', 1, 1, true)
      if (rng.chance(0.2)) placeFree('car', 2, 3, true)
      if (rng.chance(0.4)) placeWallHug('rebar')
      break
    }
    case 'parking': {
      // 天鹰段：规则柱阵与天花板漏水小水管；地面积水由独立的确定性洼地系统表现。
      for (let y = 6; y < CS - 5; y += 6)
        for (let x = 6; x < CS - 5; x += 6)
          if (rng.chance(0.8)) pushStruct('pillar', x + rng.int(-1, 1), y + rng.int(-1, 1), 1, 1, true)
      for (let i = 0, n = rng.int(2, 4); i < n; i++) placeFree('car', 2, 3, true)
      if (rng.chance(0.5)) placeFree('suitcase', 1, 1, false, true, { loot: 1 })
      for (let i = 0, n = rng.int(1, 3); i < n; i++) placeWallHug('pipes')
      for (let i = 0, n = rng.int(2, 4); i < n; i++) {
        const x0 = rng.int(3, CS - 4), y0 = rng.int(3, CS - 4)
        for (let j = 0; j < 4; j++) {
          const x = x0 + rng.int(-1, 1), y = y0 + rng.int(-1, 1)
          if (isF(x, y)) wet[li(x, y)] = 1
        }
      }
      // v35：定居点地标——天鹰段小概率出现（wikidot：M.E.G. 罗经点小队放置的引路标志）
      if (rng.chance(0.06)) placeFree('landmark', 1, 1, false, false, { outpost: 'alpha' })
      // v38：Tom 的餐馆地标——天鹰段更小概率出现（与 alpha 独立判定，暖红布料）
      if (rng.chance(0.025)) placeFree('landmark', 1, 1, false, false, { outpost: 'tom' })
      break
    }
    case 'storage': {
      // 跃金段：更像仓库——板条箱成群（唯一资源来源）+ 工具箱/储物柜/行李箱；
      // 照明充足（加密网格、正常灯光）+ 高饱和度金色地表/墙壁/天花板（tint=7，见渲染层 tint 表）
      for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) tint[li(x, y)] = 7
      for (let i = 0, n = rng.int(4, 6); i < n; i++) placeFree('crate', 1, 1, true, true, { loot: 1 })
      if (rng.chance(0.7)) placeFree('toolbox', 1, 1, false, true, { loot: 1 })
      if (rng.chance(0.6)) placeFree('locker', 1, 1, true, true, { loot: 1 })
      if (rng.chance(0.4)) placeFree('suitcase', 1, 1, false, true, { loot: 1 })
      // v35：BNTG 商人之家地标——跃金段小概率出现（深绿天平布料 + 压印币）
      if (rng.chance(0.06)) placeFree('landmark', 1, 1, false, false, { outpost: 'bntg' })
      break
    }
    case 'gothic': {
      // 哥特段（v34 按参考图重做）：拱顶柱森林——规则柱网（5 格间距），粗圆柱柱顶喇叭展开，
      // 相邻柱之间以连拱板连成连续拱腹（参照地下停车场交叉拱）；暖暗灯光照度极低
      const G = [4, 9, 14, 19, 24, 29]
      const last = G[G.length - 1]
      for (const x of G) for (const y of G) {
        if (!isF(x, y) || solidAtL(x, y)) continue
        pushStruct('vaultcol', x, y, 1, 1, true, false, {
          archX: x < last ? 1 : 0, spanX: 5,
          archY: y < last ? 1 : 0, spanY: 5,
        })
      }
      if (rng.chance(0.5)) placeWallHug('graffiti', true, { lore: rng.int(0, 5) })
      // v32：滋水枪——很小概率出现在拱廊深处
      if (rng.chance(0.05)) {
        for (let tr = 0; tr < 30; tr++) {
          const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
          if (!isF(x, y) || solidAtL(x, y)) continue
          pushItem('squirtgun', x, y)
          break
        }
      }
      // v37：阿丽亚娜集团地标——哥特段小概率出现（紫环布料 + 消毒液）
      if (rng.chance(0.06)) placeFree('landmark', 1, 1, false, false, { outpost: 'ariane' })
      break
    }
    case 'ouroboros': {
      // 衔尾段（v39 施工化）：灰色毛坯混凝土 + 铲到一半的补丁墙 + 深色裸露吊顶
      // （tint=10 基底，散布 tint=11 补丁斑块——地面读作新浇水泥补丁、墙面读作残存粉刷）；
      // 脚手架/红色管道/施工路障加密 + 建材碎料堆散落；灯光最终受统一停电规则影响。
      for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) tint[li(x, y)] = 10
      for (let b = 0, nB = rng.int(5, 8); b < nB; b++) { // 补丁斑块（2~4 格不规则团）
        const px0 = rng.int(2, CS - 3), py0 = rng.int(2, CS - 3)
        for (let j = 0, nJ = rng.int(2, 4); j < nJ; j++) {
          const px = px0 + rng.int(-1, 1), py = py0 + rng.int(-1, 1)
          if (px >= 0 && py >= 0 && px < CS && py < CS) tint[li(px, py)] = 11
        }
      }
      for (let i = 0, n = rng.int(3, 5); i < n; i++) placeFree('scaffold', 2, 1, true)
      for (let i = 0, n = rng.int(4, 6); i < n; i++) placeFree('roadblock', 1, 1, true)
      for (let i = 0, n = rng.int(2, 3); i < n; i++) placeWallHug('pipes') // 红色管道（裸露管线）
      for (let i = 0, n = rng.int(1, 3); i < n; i++) placeFree('debrispile', 1, 1, false) // 建材碎料堆
      for (let i = 0, n = rng.int(2, 4); i < n; i++) {
        const bw = rng.int(2, 4)
        const bx = rng.int(5, CS - 6 - bw), by = rng.int(5, CS - 7)
        if (Math.abs(bx - 16) + Math.abs(by - 16) < 3) continue
        for (let x = bx; x < bx + bw; x++) {
          tiles[li(x, by)] = 2
          if (isF(x, by + 1) && !solidAtL(x, by + 1) && rng.chance(0.4)) pushStruct('rebar', x, by + 1, 1, 1, false)
        }
      }
      if (rng.chance(0.5)) placeFree('crate', 1, 1, true, true, { loot: 1 })
      if (rng.chance(0.5)) placeFree('toolbox', 1, 1, false, true, { loot: 1 })
      // v39：BRC 员工 1~2 名——锚定在工作点（面向脚手架/路障/墙），永不游荡（见 npcs.ts）
      const anchorAt = (): { x: number; y: number; face: number } | null => {
        const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
        for (let t = 0; t < 120; t++) {
          const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
          if (!isF(x, y) || solidAtL(x, y)) continue
          if (npcs.some((n2) => Math.abs(n2.x - (WX + x + 0.5)) < 1 && Math.abs(n2.y - (WY + y + 0.5)) < 1)) continue
          const opts: number[] = []
          for (let d = 0; d < 4; d++) {
            const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
            if (!isF(nx, ny) || solidAtL(nx, ny)) opts.push(d) // 邻墙/邻实心结构 = 工作面
          }
          if (!opts.length) continue
          const d = opts[rng.int(0, opts.length - 1)]
          return { x, y, face: Math.atan2(DIRS[d][1], DIRS[d][0]) }
        }
        return null
      }
      for (let i = 0, n = rng.int(1, 2); i < n; i++) {
        const p = anchorAt()
        if (!p) break
        npcs.push({ def: brcWorkerDef(seed, cx, cy, i), x: WX + p.x + 0.5, y: WY + p.y + 0.5, facing: p.face })
        structures.push({kind:'settlementstation',x:WX+p.x+.8,y:WY+p.y+.6,w:.4,h:.3,solid:false,data:{room:'brc_work',label:'B.R.C. 外部协作工位',faction:'brc',services:['training','inspect','report','dispatch','repair','equipment','stabilize'],access:0}})
      }
      break
    }
    case 'garden': {
      // 花园段：青翠欲滴的色调（tint=6）与勃勃生机的表象——大量绿植 + 充足阳光；
      // 灯光最终受统一停电规则影响。⚠ 进入者将逐渐患上「植殖癌」（engine 侧按所在 chunk 变体推进）
      for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) tint[li(x, y)] = 6
      for (let i = 0, n = rng.int(6, 9); i < n; i++) placeFree('wheatpatch', rng.int(1, 2), rng.int(1, 2), false)
      for (let i = 0, n = rng.int(2, 4); i < n; i++) placeFree('hedgerow', rng.int(2, 3), 1, true)
      for (let i = 0, n = rng.int(2, 4); i < n; i++) placeFree('glowshroom', 1, 1, false)
      break
    }
    case 'maintenance': {
      // 维护通廊：狭窄迷宫走廊（地形已在上方雕出，墨黑金属门已落在各开口）——
      // 白色调 tint=5、沿走廊布置普通照明（最终受统一停电规则影响）、裸露管线/配电箱、实体极少
      for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) tint[li(x, y)] = 5
      for (let i = 0, n = rng.int(1, 3); i < n; i++) placeLoose('toolbox', true, { loot: 1 })
      if (rng.chance(0.5)) placeLoose('locker', true, { loot: 1 })
      if (rng.chance(0.4)) placeLoose('suitcase', true, { loot: 1 })
      placeWallHug('pipes')
      if (rng.chance(0.6)) placeWallHug('vent')
      placeWallHug('graffiti', true, { lore: rng.int(0, 5) })
      // v35：小径侧室（wikidot：小径里并非没有房间——只是这些房间和宜居地带其他区域相同，
      // 它们的存在毫无意义，既无价值也不合常理）：小型办公室/砖围狭室/大型医务室/橡胶房间/画作宽房
      if (rng.chance(0.45)) {
        const type = rng.pick(['office', 'cell', 'sickbay', 'rubber', 'gallery'] as const)
        const [rw, rh] = type === 'office' ? [6, 5] : type === 'cell' ? [4, 4] : type === 'sickbay' ? [8, 6] : type === 'rubber' ? [5, 5] : [9, 7]
        for (let tr = 0; tr < 20; tr++) {
          const rx = rng.int(3, CS - 4 - rw), ry = rng.int(3, CS - 4 - rh)
          // 矩形内部必须全是未雕的墙（不破坏既有走廊）
          let solidAll = true
          for (let y = ry; y < ry + rh && solidAll; y++)
            for (let x = rx; x < rx + rw && solidAll; x++)
              if (tiles[li(x, y)] !== 2) solidAll = false
          if (!solidAll) continue
          // 至少一条边外有走廊地板可开门
          let door: [number, number] | null = null
          for (let x = rx; x < rx + rw && !door; x++) {
            if (isF(x, ry - 1)) door = [x, ry]
            else if (isF(x, ry + rh)) door = [x, ry + rh - 1]
          }
          for (let y = ry; y < ry + rh && !door; y++) {
            if (isF(rx - 1, y)) door = [rx, y]
            else if (isF(rx + rw, y)) door = [rx + rw - 1, y]
          }
          if (!door) continue
          carve(rx, ry, rx + rw - 1, ry + rh - 1)
          tiles[li(door[0], door[1])] = 1
          const cxx = rx + (rw >> 1), cyy = ry + (rh >> 1)
          if (type === 'office') {
            // 小型办公室：办公桌一张 + 老旧电脑一台；天花仅悬一盏灯泡，显得昏暗
            pushStruct('desk', cxx, cyy, 1, 1, true)
            pushStruct('copier', cxx, cyy - 1, 1, 1, true)
            pushStruct('officechair', cxx, cyy + 1, 1, 1, false)
            pushLight(cxx, cyy, 2.2, '#d9c39a', true)
          } else if (type === 'cell') {
            // 四周被墙围绕的狭小空间：空室
            pushLight(cxx, cyy, 2.5, '#e8e8e0', true)
          } else if (type === 'sickbay') {
            // 大型医务室：床头贴北墙一张病床（v55 任务8：床头靠墙，deg=180 朝北），周围几张桌子
            // 北门洞正对时床让一列（门线正前方不放实心家具）
            const bxx = door[1] === ry - 1 && door[0] === cxx ? cxx - 1 : cxx
            pushStruct('bed', bxx, ry, 1, 1, true, false, { deg: 180 })
            pushStruct('table', cxx - 2, cyy, 1, 1, true)
            pushStruct('table', cxx + 2, cyy, 1, 1, true)
            pushStruct('table', cxx, cyy + 2, 1, 1, true)
            pushLight(cxx - 1, cyy, 3, '#e8e8e0', true)
            pushLight(cxx + 1, cyy, 3, '#e8e8e0', true)
          } else if (type === 'rubber') {
            // 橡胶房间：中间一把椅子（有时嵌入地板——低模简化为中心转椅）
            pushStruct('officechair', cxx, cyy, 1, 1, false)
            pushLight(cxx, cyy, 3, '#e8e8e0', true)
          } else {
            // 宽敞房间：墙上和地板上都挂着画作（贴房间边缘墙位，门所在边改放对边）
            const doorSouth = door[1] === ry + rh - 1
            const py = doorSouth ? ry : ry + rh - 1
            pushStruct('photo', rx + 1, py, 1, 1, false)
            pushStruct('photo', rx + rw - 2, py, 1, 1, false)
            pushStruct('photo', cxx, cyy + 1, 1, 1, false, false, { flat: 1 })
            pushLight(cxx, cyy, 4, '#e8e8e0', true)
          }
          break
        }
      }
      break
    }
  }

  // ---- 通用内容 ----
  // 悬挂荧光灯：网格保底（明灭不定——15% 格位缺灯形成暗区）。
  // v30：各区段灯光差异化——小径、花园与衔尾保留各自色温和布置，但所有原生灯最终受统一停电规则影响；
  // 跃金段照明充足（加密网格、正常灯光），哥特段偏暗暖色。
  if (variant === 'maintenance') {
    for (let y = 2; y < CS - 2; y += 4)
      for (let x = 2; x < CS - 2; x += 4)
        if (isF(x, y)) pushLight(x, y, rng.range(4.5, 6), '#e8e8e0', true)
  } else if (variant === 'garden') {
    for (let gy = 0; gy < 3; gy++)
      for (let gx = 0; gx < 3; gx++) {
        const x = gx * 10 + 6, y = gy * 10 + 6
        if (isF(x, y)) pushLight(x, y, rng.range(6.5, 8), '#fff3d6', true)
      }
  } else {
    const step0 = variant === 'storage' ? 6 : 8 // 跃金段：照明充足（加密网格）
    for (let gy = 0; gy * step0 + 3 < CS - 2; gy++)
      for (let gx = 0; gx * step0 + 3 < CS - 2; gx++) {
        if (variant !== 'ouroboros' && h01(seed, 0xf11c, cx, cy, gx, gy) < 0.15) continue // 灯光明灭：部分格位灯管缺席
        const x = gx * step0 + 3 + rng.int(0, 2), y = gy * step0 + 3 + rng.int(0, 2)
        if (!isF(x, y)) continue
        if (variant === 'ouroboros') pushLight(x, y, rng.range(5, 6.5), '#ffb35c', true) // 原始施工灯；最终受统一停电规则影响
        else if (variant === 'gothic') pushLight(x, y, rng.range(3.5, 4.5), '#c9a86a') // 偏暗暖色
        else pushLight(x, y, rng.range(4.5, 6.5), def.palette.light)
      }
    if (rng.chance(0.45)) placeFree('lightgrid', 2, 1, false)
    if (rng.chance(0.3)) placeFree('hanglight', 1, 1, false)
  }
  // 地面湿润标记保留给玩法系统；可见洼地由 renderer 的确定性几何生成。
  for (let i = 0, n = rng.int(0, 2); i < n; i++) {
    const x0 = rng.int(3, CS - 4), y0 = rng.int(3, CS - 4)
    for (let j = 0; j < 5; j++) {
      const x = x0 + rng.int(-1, 1), y = y0 + rng.int(-1, 1)
      if (isF(x, y)) wet[li(x, y)] = 1
    }
  }
  // 通风口/插座/涂鸦/尸体
  if (rng.chance(0.3)) placeWallHug('vent')
  if (rng.chance(0.55)) placeWallHug('socket')
  if (variant !== 'maintenance' && rng.chance(0.45)) placeWallHug('graffiti', true, { lore: rng.int(0, 5) })
  if (rng.chance(0.15)) placeFree('corpse', 1, 1, false)
  // 物品（独特 + 通用池；磁带低频保底；仓储区额外 +1）
  const pool = [...def.items, ...UNIVERSAL_ITEMS]
  for (let i = 0, n = rng.int(1, variant === 'storage' ? 3 : 2); i < n; i++) {
    const t0 = rng.weighted(pool.map((p) => ({ v: p.type, w: p.w })))
    const t = t0 === 'almond' && rng.chance(0.1) ? 'cashew' : t0 // v32：腰果水 1/10 概率替代杏仁水
    for (let tr = 0; tr < 30; tr++) {
      const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
      if (!isF(x, y) || solidAtL(x, y)) continue
      pushItem(t, x, y)
      break
    }
  }
  if (h01(seed, 0x7a9e, cx, cy) < 0.1) {
    for (let tr = 0; tr < 40; tr++) {
      const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
      if (!isF(x, y) || solidAtL(x, y)) continue
      pushItem('tape', x, y)
      break
    }
  }

  // ---- 出口（本 chunk 为所在超区域宿主 → 放置 1 个出口，类型按区域哈希轮换）----
  const rx = Math.floor(cx / RS), ry = Math.floor(cy / RS)
  const host = regionHost(seed, rx, ry)
  if (host.cx === cx && host.cy === cy && def.exits.length > 0) {
    const exitDef = def.exits[h32(seed, 0xe33, rx, ry) % def.exits.length]
    const tgt = exitTarget(seed, cx, cy)
    let best = -1, bd = 1e9
    for (let y = 1; y < CS - 1; y++)
      for (let x = 1; x < CS - 1; x++) {
        if (!isF(x, y) || solidAtL(x, y)) continue
        if (isF(x + 1, y) && isF(x - 1, y) && isF(x, y + 1) && isF(x, y - 1)) continue // 需邻墙
        const d = Math.hypot(x - tgt.x, y - tgt.y)
        if (d < bd) { bd = d; best = li(x, y) }
      }
    if(best<0){
      // Open halls still require their region's guaranteed exit. Add a short real
      // service partition only where its entire footprint is clear.
      for(let y=3;y<CS-3;y++)for(let x=3;x<CS-3;x++){
        let free=true
        for(let dz=-1;dz<=1;dz++)for(let dx=0;dx<=2;dx++)if(!isF(x+dx,y+dz)||solidAtL(x+dx,y+dz)||items.some(q=>Math.hypot(q.x-WX-x-dx,q.y-WY-y-dz)<1.5))free=false
        const d=Math.hypot(x-tgt.x,y-tgt.y);if(free&&d<bd){best=li(x,y);bd=d}
      }
      if(best>=0){const x=best%CS,y=Math.floor(best/CS);for(let dy=-1;dy<=1;dy++)tiles[li(x+1,y+dy)]=2}
    }
    if (best >= 0) {
      const ex = best % CS, ey = Math.floor(best / CS)
      exits.push({ def: exitDef, x: WX + ex, y: WY + ey, discovered: false })
      pushLight(ex, ey, 3.5, '#f5e37a')
      placeWallHug('graffiti', true, { loreKind: 'exitguide' })
    }
  }

  // ---- v33：少量自天花板向下伸出的通风管道（「手臂」巢位；维护通廊/花园段不出现）----
  // 层级灯光熄灭（「闪烁」停电）时，手臂从管内伸出猎捕——见 engine.updateEntities 的 arms 分支
  if (variant !== 'maintenance' && variant !== 'garden' && rng.chance(0.06)) {
    for (let t = 0; t < 40; t++) {
      const x = rng.int(3, CS - 4), y = rng.int(3, CS - 4)
      if (!isF(x, y) || solidAtL(x, y)) continue
      pushStruct('ceilvent', x, y, 1, 1, false)
      entities.push({ type: 'arms', x: WX + x + 0.5, y: WY + y + 0.5 })
      break
    }
  }

  // ---- 实体（栖息地过滤，与有限层/infinite.ts 同一契约；v29b：L1 实体极少——
  // wikidot Class 1「安全稳定」，仅停电区/黑暗处较多）----
  // L1 chunk 窗口缝合时 outdoor 恒为 0（全室内；花园段为室内园艺造景而非室外瓦片），
  // 故 outdoor 栖息地实体（如 carrier 运输车）在无符合瓦片时降级 any 并计数告警。
  const habFallback: Record<string, number> = {}
  if (def.entities.length > 0) {
    const nE = variant === 'maintenance' || variant === 'garden' ? (rng.chance(0.05) ? 1 : 0) // 维护通廊/花园段几无可遇
      : rng.chance(0.15) ? 1 : 0 // 常规区段：稀疏偶遇
    for (let i = 0; i < nE; i++) {
      const type = rng.weighted(def.entities.map((e) => ({ v: e.type, w: e.w })))
      const hab = ENTITIES[type]?.habitat ?? 'any'
      const tryPick = (want: 'indoor' | 'outdoor' | 'any'): { x: number; y: number } | null => {
        for (let t = 0; t < 40; t++) {
          const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
          if (!isF(x, y) || solidAtL(x, y)) continue
          if (want === 'outdoor') continue // L1 chunk 无室外瓦片（全室内）
          return { x, y }
        }
        return null
      }
      let p = tryPick(hab)
      if (!p && hab !== 'any') { habFallback[`${type}:${hab}`] = (habFallback[`${type}:${hab}`] ?? 0) + 1; p = tryPick('any') }
      if (p) entities.push({ type, x: WX + p.x + 0.5, y: WY + p.y + 0.5 })
    }
    const habMiss = Object.values(habFallback).reduce((a, b) => a + b, 0)
    if (habMiss > 0) console.warn(`[habitat] L1 无限 chunk(${cx},${cy}) 无符合瓦片，降级 any ×${habMiss}`)
  }

  // 旱虾（Entity 20）：约 1/4 的 chunk 在潮湿地面上生成 1–2 只（无害游荡；L0 不生成）
  if (rng.chance(0.25)) {
    const wets: number[] = []
    for (let i = 0; i < CS * CS; i++) if (wet[i] === 1 && tiles[i] === 1) wets.push(i)
    for (let k = 0, n = Math.min(wets.length, rng.int(1, 2)); k < n; k++) {
      const i = wets[rng.int(0, wets.length - 1)]
      entities.push({ type: 'dryshrimp', x: WX + (i % CS) + 0.5, y: WY + ((i / CS) | 0) + 0.5 })
    }
  }
  // Nguithr'xurh（Entity 16）：约 4% 的 chunk 在天花板上结一球状网囊
  if (rng.chance(0.04)) {
    for (let t = 0; t < 30; t++) {
      const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
      if (!isF(x, y) || solidAtL(x, y)) continue
      entities.push({ type: 'nguithr', x: WX + x + 0.5, y: WY + y + 0.5 })
      break
    }
  }
  // 火盐晶体（Object 15）：前五个层级的角落产生（约 18% chunk 一枚）
  if (rng.chance(0.18)) {
    for (let t = 0; t < 40; t++) {
      const x = rng.int(2, CS - 3), y = rng.int(2, CS - 3)
      if (!isF(x, y) || solidAtL(x, y)) continue
      const walls = (!isF(x + 1, y) ? 1 : 0) + (!isF(x - 1, y) ? 1 : 0) + (!isF(x, y + 1) ? 1 : 0) + (!isF(x, y - 1) ? 1 : 0)
      if (walls < 2) continue
      pushItem('firesalt', x, y)
      break
    }
  }

  return applyL1Architecture({ variant, tiles, wet, elev, step, tint, crawl, structures, items, lights, exits, entities, npcs, habFallback }, cx, cy, seed, true)
}

// ---------- 注册（mapgen generateLevel → generateInfinite 经注册表分派）----------
import {buildL1Data} from './l1Building'
import {placeL1Content} from './l1Placement'
import type {L1StyleName} from './l1BuildingTypes'
export function genL1ChunkRaw(def:LevelDef,seed:number,cx:number,cy:number,forceVariant?:string):GenChunk {
  const architecture=buildL1Data(seed,cx,cy,forceVariant&&forceVariant!=='aisle'?forceVariant as L1StyleName:undefined)
  const content=genL1LegacyManifest(def,seed,cx,cy,forceVariant)
  if(architecture.exit){const p=architecture.exit,exitDef=def.exits.find(e=>e.kind===p.kind)
    if(exitDef)content.exits=[{def:exitDef,x:p.x,y:p.z,discovered:false,l1:{wallDir:p.dir}}]
  }
  return placeL1Content(content,architecture)
}
registerInfiniteLevel(1, {
  genRaw: genL1ChunkRaw,
  variantOf: l1VariantOf,
  rareVariants: L1_RARE_VARIANTS,
  variantNames: L1_VARIANT_NAMES,
  variantLore: L1_VARIANT_LORE,
})

