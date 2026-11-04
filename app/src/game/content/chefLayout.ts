// [chef] 厨师（Entity 800「The Chef」）阶段 3：L5 餐厅大厅格扩建的摆放（世界瓦片坐标，纯函数——相邻 chunk 各自雕刻天然缝合）。
// 餐厅大厅格（l5HallRect，约 28–40 × 28–40）北面 10 行划出后场：
//   储藏室 pantry（西）｜ 厨房 kitchen（中：唯一的燃气灶 + 炖菜大锅、刀墙、备餐台）｜ 冷库 cold（东：铁管 + 手铐、冻肉架）
//   厨房 ↔ 餐厅：南墙中间一对弹簧门（双开，推得开，不上锁）；厨房 ↔ 储藏室 / 冷库：各一道门（储藏室是门洞，冷库是一扇厚门）。
//   餐厅南墙中间加一道双开正门（打烊时厨师在里面绑绳闩门）；北面原有的两个门洞不开（会直接通进后场）。
// 家具与动画对齐（chefAnim 文件头的摆放常量，厨师 root 空间 +Z 正前、+X 角色左侧；世界 f = atan2(dy, dx)，−π/2 = 朝北）：
//   灶台：台面 0.90、前沿 z 0.50 → 灶台结构 2×1 占北墙下第一行，前沿 = 该行南沿；厨师站在前沿以南 0.5 m 正对灶台；炖锅底心在他前方 0.78 m。
//   刀墙：墙面 z 0.54、挂杆 1.55、那把雕刻刀在 root x −0.12（朝北时 = 世界东 +0.12）。
//   双开门：门面 z 0.60、把手 x ±0.09（门缝两侧）、门闩 1.22 → 厨师站在门缝正中、门面以内 0.60 m。
//   餐桌（餐厅专用的白桌布桌 chefprop table：桌面 0.74 = CHEF_TABLE、宽 1.5 × 深 1.3，桌沿距中心 0.65；椅面 0.46 在东西两侧）：厨师敲桌站在桌子南 / 北沿外 0.42 m。
// 地图坐标 = 世界坐标 − (inf.ox, inf.oy)；AI / 渲染各自换算。
import { l5HallAt, l5HallRect } from '../world/infiniteL5'

export interface TileRect { x0: number; y0: number; x1: number; y1: number }
export interface Spot { x: number; y: number; f: number }
export interface ChefSite {
  hk: number; hr: number
  /** 整个大厅内腔（含后场） */
  hall: TileRect
  bcx: number; bcy: number
  /** 后场南墙所在行（墙） */
  sy: number
  /** 餐厅（后场墙以南） */
  dining: TileRect
  pantry: TileRect; kitchen: TileRect; cold: TileRect
  /** 弹簧门两格（后场墙上） */
  swing: { x: number; y: number }[]
  pantryDoor: { x: number; y: number }
  coldDoor: { x: number; y: number }
  /** 正门两格（餐厅南墙上，墙外就是走廊） */
  front: { x: number; y: number }
  /** 燃气灶结构（2×1）、刀墙（1×1 贴北墙）、铁管（1×1 贴冷库东墙）、服务铃台（1×1） */
  stove: { x: number; y: number; w: number; h: number }
  knife: { x: number; y: number }
  pipe: { x: number; y: number }
  bell: { x: number; y: number }
  /** 世界坐标（米）站位 */
  at: {
    stove: Spot // 灶前（idle 搅锅 / vomitPot / stoveLean）
    knife: Spot // 刀墙前（takeKnife）
    barricade: Spot // 正门内（barricade）
    cuff: Spot // 被铐在铁管上的人（坐在地上，背靠东墙）
    coldIn: Spot // 冷库门内一步（他拿着刀进来）
    swingIn: { x: number; y: number } // 弹簧门厨房一侧
    swingOut: { x: number; y: number } // 弹簧门餐厅一侧
    bellAt: { x: number; y: number } // 铃
    bellStand: Spot // 应铃时站的地方（铃台北侧）
    hook: { x: number; y: number } // 那口带把手的锅挂在灶台东侧的钩子上（世界米）
  }
  /** 餐桌格（chefprop table，1×1 碰撞；模型 1.5 × 1.3、桌面 0.74） */
  tables: { x: number; y: number }[]
}
export const CHEF_SERVICE_ROWS = 10
/** [jazz] 爵士脑 E197 阶段 3：餐厅东北角让出给舞台 / 观众区 / 吧台（content/jazzLayout）——这块里不摆餐桌（桌模型 1.5 × 1.3 会伸出格子 ±0.25 m，再留 1 格） */
export const inJazzBlock = (x1: number, sy: number, x: number, y: number) => x >= x1 - 12 && y <= sy + 13
export const TABLE_EDGE = 0.65, TAP_OFF = 0.42

export function chefSiteRect(hk: number, hr: number, r: TileRect): ChefSite | null {
  const { x0, y0, x1, y1 } = r
  if (x1 - x0 < 25 || y1 - y0 < 24) return null
  const bcx = (x0 + x1) >> 1, bcy = (y0 + y1) >> 1
  const sy = y0 + CHEF_SERVICE_ROWS
  const pantry = { x0, y0, x1: x0 + 7, y1: sy - 1 }, cold = { x0: x1 - 7, y0, x1, y1: sy - 1 }
  const kitchen = { x0: x0 + 9, y0, x1: x1 - 9, y1: sy - 1 }
  const dining = { x0, y0: sy + 1, x1, y1 }
  const N = -Math.PI / 2, S = Math.PI / 2, W = Math.PI
  const tables: { x: number; y: number }[] = []
  for (let x = x0 + 3; x <= x1 - 3; x += 5) for (let y = y0 + 3; y <= y1 - 3; y += 5) if (y >= sy + 3 && Math.abs(x - bcx) > 2 && !inJazzBlock(x1, sy, x, y)) tables.push({ x, y })
  const stove = { x: bcx, y: y0, w: 2, h: 1 }
  const knife = { x: bcx + 3, y: y0 }
  const pipe = { x: x1, y: y0 + 3 }
  const bell = { x: x0 + 1, y: y1 - 1 }
  return {
    hk, hr, hall: { x0, y0, x1, y1 }, bcx, bcy, sy, dining, pantry, kitchen, cold,
    swing: [{ x: bcx, y: sy }, { x: bcx + 1, y: sy }],
    pantryDoor: { x: x0 + 8, y: y0 + 6 }, coldDoor: { x: x1 - 8, y: y0 + 6 },
    front: { x: bcx, y: y1 + 1 }, stove, knife, pipe, bell,
    at: {
      stove: { x: bcx + 1, y: y0 + 1.5, f: N },
      knife: { x: knife.x + 0.5 - 0.12, y: y0 + 0.54, f: N },
      barricade: { x: bcx + 1, y: y1 + 1 - 0.6, f: S },
      cuff: { x: x1 + 1 - 0.42, y: pipe.y + 0.5, f: W },
      coldIn: { x: x1 - 6.4, y: y0 + 6.5, f: 0 },
      swingIn: { x: bcx + 1, y: sy - 1.2 }, swingOut: { x: bcx + 1, y: sy + 1.6 },
      bellAt: { x: bell.x + 0.5, y: bell.y + 0.5 },
      bellStand: { x: bell.x + 0.5, y: bell.y - 0.55, f: S },
      hook: { x: bcx + 2.25, y: y0 + 0.12 },
    },
    tables,
  }
}
/** 世界瓦片 → 这个大厅格的厨师后场（不是餐厅 → null） */
export function chefSiteAt(seed: number, hk: number, hr: number): ChefSite | null {
  if (l5HallAt(seed, hk, hr) !== 'dining') return null
  return chefSiteRect(hk, hr, l5HallRect(seed, hk, hr))
}
export const inRect = (r: TileRect, x: number, y: number) => x >= r.x0 && x < r.x1 + 1 && y >= r.y0 && y < r.y1 + 1
/** 某世界点在不在后场（储藏室 / 厨房 / 冷库，含两道隔墙门洞） */
export function inService(site: ChefSite, x: number, y: number) { return x >= site.hall.x0 && x < site.hall.x1 + 1 && y >= site.hall.y0 && y < site.sy }
export function inDining(site: ChefSite, x: number, y: number) { return inRect(site.dining, x, y) }
export function inHall(site: ChefSite, x: number, y: number) { return x >= site.hall.x0 && x < site.hall.x1 + 1 && y >= site.hall.y0 && y < site.hall.y1 + 1 }
/** 敲桌站位：桌子南 / 北沿外 0.42 m（远离玩家的那一侧优先），面朝桌子 */
export function tapSpots(t: { x: number; y: number }): Spot[] {
  const cx = t.x + 0.5, cy = t.y + 0.5, o = TABLE_EDGE + TAP_OFF
  // CHEF_TAP_AT 在 root x −0.3（他的右手边）：朝北站时右手 = 东，朝南站时右手 = 西 → 站位反向偏 0.3 m，指尖落在桌子中线
  return [{ x: cx - 0.3, y: cy + o, f: -Math.PI / 2 }, { x: cx + 0.3, y: cy - o, f: Math.PI / 2 }]
}
