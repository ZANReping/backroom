// 前厅 P2（M3）：楼栋门厅 → 小区 → 第六大街 → 十字路口 → 旧仓路后巷——手工布局数据（地图生成、渲染与交互共用）。
// 与家（world/foyerLayout.ts）同一张地图（level 900），位于家的东侧，西侧由高楼立面遮挡视线。
// 坐标：x=东，y=南，单位米（1 瓦片 = 1m）。招牌/品牌均为虚构中性名称，不指向具体国家。
import type { GameMap } from './mapgen'
import type { Structure } from '../core/types'
import type { RNG } from '../core/rng'
import type { NpcDef } from '../content/npcs'
import type { AvatarCfg } from '../core/avatar'
/** 楼梯编码（同 mapgen.encStair；此处内联避免循环依赖）。 */
const encStair = (dir: number, loCm: number, hiCm: number) => dir | (loCm << 3) | (hiCm << 17)

/** 地图边长（家 + 街区）。 */
export const FOYER_MAP_SIZE = 160

export type StreetAreaId = 'lobby' | 'compound' | 'gate' | 'street' | 'cross' | 'store' | 'alley'
export interface StreetArea { id: StreetAreaId; name: string; x0: number; y0: number; x1: number; y1: number; outdoor: boolean }

/** 可行走区域（半开区间，瓦片）。按顺序判定：小区域在前。 */
export const STREET_AREAS: StreetArea[] = [
  { id: 'lobby', name: '单元门厅', x0: 34, y0: 9, x1: 46, y1: 14, outdoor: false },
  { id: 'store', name: '24H 便利店', x0: 70, y0: 60, x1: 84, y1: 69, outdoor: true },
  { id: 'gate', name: '小区门口', x0: 58, y0: 44, x1: 62, y1: 46, outdoor: true },
  { id: 'alley', name: '旧仓路后巷', x0: 131, y0: 60, x1: 135, y1: 88, outdoor: true },
  { id: 'cross', name: '十字路口', x0: 104, y0: 32, x1: 116, y1: 74, outdoor: true },
  { id: 'compound', name: '小区', x0: 28, y0: 15, x1: 80, y1: 44, outdoor: true },
  { id: 'street', name: '第六大街', x0: 28, y0: 46, x1: 152, y1: 60, outdoor: true },
]

export function streetAreaAt(x: number, y: number): StreetArea | undefined {
  for (const a of STREET_AREAS) if (x >= a.x0 && x < a.x1 && y >= a.y0 && y < a.y1) return a
  return undefined
}

// ---- 楼梯（门厅西侧：最后半跑楼梯，+1.2m 平台 → 地面）----
/** 平台（elev 2 = +1.2m）与两格楼梯坡道（向东下降）。 */
export const STAIR_LANDING = { x0: 34, y0: 10, x1: 36, y1: 12 }
export const STAIR_RAMP = { x0: 36, y0: 10, x1: 38, y1: 12 }
export const STAIR_TOP_Z = 1.2
/** 下楼到达点：站在平台上，面朝楼梯（东）。yaw：-π/2=东，π=南，0=北，π/2=西。 */
export const STREET_ARRIVE = { x: 34.8, y: 11.0, yaw: -Math.PI / 2 }
/** 家里楼道东墙上的安全通道门（下楼入口）。 */
export const HOME_STAIR_DOOR = { x: 8, y: 16.9, w: 0.95 }
/** 单元门（门厅南墙，玻璃门）。 */
export const UNIT_DOOR = { x0: 41, x1: 43, y: 14 }

/** Actual street-interior ceiling planes, shared by geometry and head collision. */
export function streetCeilingAt(x: number, y: number): number {
  if (y >= UNIT_DOOR.y && y < UNIT_DOOR.y + 1 && x >= UNIT_DOOR.x0 && x < UNIT_DOOR.x1) return 2.6
  const area = streetAreaAt(x, y)
  if (area?.id === 'store') return 3.1
  if (area?.id !== 'lobby') return Infinity
  return x >= STAIR_LANDING.x0 && x < STAIR_RAMP.x1 && y >= STAIR_LANDING.y0 && y < STAIR_LANDING.y1 ? 4.6 : 3.0
}

// ---- 循环门洞：小区门口与巷口为同一模块（回程异常时无缝传送）----
export const GATE_ARCH = { x0: 58, x1: 62, y0: 44, y1: 46 }
export const ALLEY_ARCH = { x0: 131, x1: 135, y0: 60, y1: 62 }
export const ARCH_LOOP_DELTA = { dx: ALLEY_ARCH.x0 - GATE_ARCH.x0, dy: ALLEY_ARCH.y0 - GATE_ARCH.y0 }

/** 建筑体块（实心，不可进入；渲染为夜间立面）。style：res=住宅、office=办公、shop=底商楼、brick=砖墙仓库。 */
export interface StreetBuilding { id: string; x0: number; y0: number; x1: number; y1: number; h: number; style: 'res' | 'office' | 'shop' | 'brick' | 'wall' }
export const STREET_BUILDINGS: StreetBuilding[] = [
  // 西侧遮挡立面（挡住家的方向；整条视线边界）
  { id: 'west_block', x0: 22, y0: 0, x1: 28, y1: 96, h: 32, style: 'res' },
  { id: 'bldg_a', x0: 28, y0: 2, x1: 50, y1: 15, h: 24, style: 'res' }, // 玩家的楼栋（门厅/楼梯在内部）
  { id: 'bldg_b', x0: 50, y0: 2, x1: 80, y1: 15, h: 27, style: 'res' },
  { id: 'bldg_c', x0: 80, y0: 6, x1: 94, y1: 46, h: 30, style: 'res' },
  { id: 'office_n', x0: 94, y0: 6, x1: 104, y1: 46, h: 36, style: 'office' },
  { id: 'office_ne', x0: 116, y0: 10, x1: 152, y1: 46, h: 34, style: 'office' },
  { id: 'east_block', x0: 152, y0: 10, x1: 158, y1: 96, h: 30, style: 'office' },
  { id: 'shops_w', x0: 28, y0: 60, x1: 104, y1: 82, h: 18, style: 'shop' },
  { id: 'shops_e1', x0: 116, y0: 60, x1: 131, y1: 92, h: 16, style: 'brick' },
  { id: 'shops_e2', x0: 135, y0: 60, x1: 152, y1: 92, h: 15, style: 'brick' },
  { id: 'alley_end', x0: 131, y0: 88, x1: 135, y1: 92, h: 12, style: 'brick' },
  { id: 'cross_s', x0: 104, y0: 76, x1: 116, y1: 84, h: 20, style: 'office' },
  { id: 'cross_n', x0: 104, y0: 20, x1: 116, y1: 30, h: 26, style: 'office' },
  // 小区南围墙（门洞两侧）
  { id: 'wall_w', x0: 28, y0: 44, x1: 58, y1: 46, h: 2.2, style: 'wall' },
  { id: 'wall_e', x0: 62, y0: 44, x1: 80, y1: 46, h: 2.2, style: 'wall' },
]

/** 临街店面（南侧底商，朝北）。kind=招牌样式。 */
export interface StreetShop { id: string; x0: number; x1: number; y: number; kind: 'mart' | 'laundry' | 'pharmacy' | 'lease' | 'noodle' | 'repair'; name: string; open: boolean }
export const STREET_SHOPS: StreetShop[] = [
  { id: 'shop_noodle', x0: 30, x1: 42, y: 60, kind: 'noodle', name: '面馆（已打烊）', open: false },
  { id: 'shop_pharmacy', x0: 44, x1: 54, y: 60, kind: 'pharmacy', name: '药房', open: true },
  { id: 'shop_laundry', x0: 56, x1: 68, y: 60, kind: 'laundry', name: '自助洗衣店', open: true },
  { id: 'shop_mart', x0: 70, x1: 84, y: 60, kind: 'mart', name: '24H 便利店', open: true },
  { id: 'shop_lease', x0: 86, x1: 102, y: 60, kind: 'lease', name: '空铺（招租）', open: false },
  { id: 'shop_repair', x0: 118, x1: 129, y: 60, kind: 'repair', name: '手机维修（已打烊）', open: false },
  { id: 'shop_lease2', x0: 137, x1: 150, y: 60, kind: 'lease', name: '空铺', open: false },
]
/** 便利店入口（玻璃自动门）。 */
export const MART_DOOR = { x0: 76, x1: 78, y: 60 }

/** 街道道具（渲染按 kind 建模；solid=碰撞盒；top=碰撞顶高）。rot：0=正面朝南(+y) 90=朝东 180=朝北 270=朝西。 */
export interface StreetProp { id: string; kind: string; x: number; y: number; w: number; d: number; rot: 0 | 90 | 180 | 270; top: number; solid: boolean; v?: number; label?: string }
const S = (id: string, kind: string, x: number, y: number, w: number, d: number, rot: StreetProp['rot'], top: number, solid = true, v = 0, label?: string): StreetProp => ({ id, kind, x, y, w, d, rot, top, solid, v, label })

/** 路灯（灯杆位置；灯头向 dir 伸出）。 */
export interface StreetLamp { id: string; x: number; y: number; dir: 0 | 90 | 180 | 270; h: number; area: 'compound' | 'street' | 'alley' | 'arch' | 'cross' }
export const STREET_LAMPS: StreetLamp[] = (() => {
  const out: StreetLamp[] = []
  // 第六大街：北侧人行道路缘（灯头朝南），南侧路缘（灯头朝北），错位排列
  for (let x = 34, i = 0; x < 150; x += 16, i++) out.push({ id: 'sl_n' + i, x, y: 48.6, dir: 0, h: 6.2, area: x > 103 && x < 117 ? 'cross' : 'street' })
  for (let x = 42, i = 0; x < 150; x += 16, i++) if (x < 102 || x > 118) out.push({ id: 'sl_s' + i, x, y: 57.4, dir: 180, h: 6.2, area: 'street' })
  // 十字路口南北向
  out.push({ id: 'sl_c1', x: 104.5, y: 38, dir: 90, h: 6.2, area: 'cross' }, { id: 'sl_c2', x: 115.5, y: 68, dir: 270, h: 6.2, area: 'cross' })
  // 小区庭院灯（矮杆）
  for (const [x, y] of [[36, 19], [48, 21], [60, 19], [72, 21], [40, 31], [56, 30], [70, 33], [52, 41], [66, 41]] as const) out.push({ id: `cl_${x}_${y}`, x, y, dir: 0, h: 3.6, area: 'compound' })
  // 巷子：墙上的老壁灯
  out.push({ id: 'al_1', x: 131.2, y: 70, dir: 90, h: 3.4, area: 'alley' }, { id: 'al_2', x: 134.8, y: 81, dir: 270, h: 3.4, area: 'alley' })
  // 门洞吸顶灯（小区门口与巷口为同一模块）
  out.push({ id: 'arch_gate', x: 60, y: 45, dir: 0, h: 2.75, area: 'arch' }, { id: 'arch_alley', x: 133, y: 61, dir: 0, h: 2.75, area: 'arch' })
  return out
})()

export const STREET_PROPS: StreetProp[] = [
  // ---- 门厅 ----
  S('lobby_mail', 'mailboxes', 45.75, 11.5, 0.4, 2.4, 270, 1.8, true),
  S('lobby_notice', 'noticeboard', 40.5, 9.08, 1.6, 0.1, 0, 2.0, false, 0, '公告栏'),
  S('lobby_lift', 'lift', 44, 9.1, 1.4, 0.2, 0, 2.2, false, 0, '电梯'),
  S('lobby_plant', 'plant', 39, 13.4, 0.6, 0.6, 0, 1.2, true),
  S('lobby_stair_rail', 'stairrail', 37, 12.06, 2.0, 0.08, 0, 1.0, true),
  // ---- 小区 ----
  S('bikeshed', 'bikeshed', 33, 36.5, 8, 3, 180, 2.4, false),
  S('bikeshed_back', 'shedback', 33, 37.9, 8, 0.2, 0, 2.4, true),
  S('bikes', 'bikes', 33, 37.0, 7.4, 1.4, 180, 1.0, true),
  S('planter1', 'planter', 36, 24.5, 6, 4, 0, 0.5, true),
  S('planter2', 'planter', 52, 24.5, 8, 4, 0, 0.5, true),
  S('planter3', 'planter', 70, 25, 6, 5, 0, 0.5, true),
  S('planter4', 'planter', 46, 33.5, 7, 3, 0, 0.5, true),
  S('planter5', 'planter', 70, 37.5, 6, 3, 0, 0.5, true),
  S('tree1', 'tree', 34.5, 24.5, 0.5, 0.5, 0, 3, true, 1),
  S('tree2', 'tree', 37.5, 24.5, 0.5, 0.5, 0, 3, true, 2),
  S('tree3', 'tree', 50, 24.5, 0.5, 0.5, 0, 3, true, 3),
  S('tree4', 'tree', 54, 24.5, 0.5, 0.5, 0, 3, true, 4),
  S('tree5', 'tree', 70, 25, 0.5, 0.5, 0, 3, true, 5),
  S('tree6', 'tree', 44, 33.5, 0.5, 0.5, 0, 3, true, 6),
  S('tree7', 'tree', 48, 33.5, 0.5, 0.5, 0, 3, true, 7),
  S('tree8', 'tree', 70, 37.5, 0.5, 0.5, 0, 3, true, 8),
  S('bench1', 'bench', 44, 27.5, 1.6, 0.5, 180, 0.45, true),
  S('bench2', 'bench', 60, 27.5, 1.6, 0.5, 180, 0.45, true),
  S('ccar1', 'car', 76.5, 22, 1.85, 4.4, 0, 1.45, true, 1),
  S('ccar2', 'car', 76.5, 28, 1.85, 4.4, 0, 1.45, true, 2),
  S('ccar3', 'car', 76.5, 34, 1.85, 4.4, 180, 1.45, true, 3),
  S('cbins', 'bins', 30.2, 30, 1.0, 3.0, 90, 1.1, true),
  S('guard', 'guardbooth', 64, 42.2, 2.4, 2.2, 180, 2.6, true, 0, '门岗'),
  S('cplay', 'swing', 60, 35, 3, 1.8, 0, 2.2, true),
  // ---- 第六大街 ----
  S('busstop', 'busstop', 52, 58.3, 4.2, 1.4, 180, 2.5, false, 0),
  S('busstop_back', 'shedback', 52, 59.1, 4.2, 0.12, 0, 2.4, true),
  S('poster_bus', 'missing', 52.6, 59.02, 0.62, 0.02, 180, 1.6, false, 1, '寻人启事'),
  S('pole1', 'upole', 66, 57.6, 0.3, 0.3, 0, 7, true, 1),
  S('poster_pole', 'missing', 66, 57.43, 0.42, 0.02, 180, 1.5, false, 2, '寻人启事'),
  S('pole2', 'upole', 98, 48.3, 0.3, 0.3, 0, 7, true, 2),
  S('poster_pole2', 'missing', 98, 48.47, 0.42, 0.02, 0, 1.5, false, 3, '寻人启事'),
  S('car1', 'car', 38, 55.6, 4.4, 1.85, 270, 1.45, true, 4),
  S('car2', 'car', 47, 55.6, 4.4, 1.85, 270, 1.45, true, 5),
  S('taxi', 'car', 88, 55.6, 4.4, 1.85, 270, 1.45, true, 9),
  S('van', 'van', 96, 50.6, 5.2, 2.0, 90, 2.2, true, 6),
  S('car3', 'car', 126, 50.4, 4.4, 1.85, 90, 1.45, true, 7),
  S('car4', 'car', 140, 55.6, 4.4, 1.85, 270, 1.45, true, 8),
  S('bin1', 'bin', 58.5, 57.6, 0.5, 0.5, 0, 0.95, true),
  S('bin2', 'bin', 84.6, 57.6, 0.5, 0.5, 0, 0.95, true),
  S('bin3', 'bin', 120, 48.4, 0.5, 0.5, 0, 0.95, true),
  S('hydrant', 'hydrant', 102.4, 57.6, 0.35, 0.35, 0, 0.8, true),
  S('bollards_m', 'bollards', 77, 58.9, 4, 0.25, 0, 0.9, false),
  S('mart_sign', 'standsign', 80.5, 59.2, 0.6, 0.45, 0, 1.0, true),
  S('vending', 'vending', 85.2, 59.4, 0.9, 0.8, 180, 1.9, true, 0, '自动售货机'),
  S('scooters', 'bikes', 92, 58.9, 4.0, 1.0, 180, 1.0, true, 1),
  S('ac1', 'acunit', 48, 59.9, 0.8, 0.3, 180, 0, false),
  // 街道两端：施工围挡 + 车
  S('fence_w', 'fence', 28.6, 52.5, 0.4, 13, 90, 2.2, true),
  S('fence_e', 'fence', 151.4, 52.5, 0.4, 13, 270, 2.2, true),
  S('truck_e', 'van', 147, 52.5, 6, 2.2, 90, 2.6, true, 3),
  // 十字路口：南北两端施工围挡
  S('fence_cn', 'fence', 110, 32.4, 12, 0.4, 0, 2.2, true),
  S('fence_cs', 'fence', 110, 73.6, 12, 0.4, 180, 2.2, true),
  S('cone1', 'cone', 108, 34, 0.4, 0.4, 0, 0.7, true),
  S('cone2', 'cone', 112, 72, 0.4, 0.4, 0, 0.7, true),
  // 红绿灯（四角；rot=信号灯朝向）
  S('tl_nw', 'trafficlight', 103.4, 48.4, 0.3, 0.3, 0, 4.8, true, 0),
  S('tl_ne', 'trafficlight', 116.6, 48.4, 0.3, 0.3, 270, 4.8, true, 1),
  S('tl_sw', 'trafficlight', 103.4, 57.6, 0.3, 0.3, 90, 4.8, true, 1),
  S('tl_se', 'trafficlight', 116.6, 57.6, 0.3, 0.3, 180, 4.8, true, 0),
  S('streetsign', 'streetsign', 116.6, 59.4, 0.2, 0.2, 0, 3.2, true),
  // ---- 便利店内部 ----
  S('mart_shelf1', 'shelf', 74, 63.5, 3.2, 0.7, 0, 1.6, true, 1),
  S('mart_shelf2', 'shelf', 74, 66, 3.2, 0.7, 0, 1.6, true, 2),
  S('mart_shelf3', 'shelf', 79.5, 64.5, 3.2, 0.7, 0, 1.6, true, 3),
  S('mart_cooler', 'cooler', 77, 68.55, 6, 0.8, 180, 2.0, true),
  S('mart_counter', 'counter', 82.6, 62.6, 1.0, 3.0, 270, 1.0, true, 0, '收银台'),
  S('mart_magazine', 'shelf', 70.5, 64.2, 0.6, 3.0, 90, 1.4, true, 4),
  S('mart_poster', 'missing', 72.4, 59.97, 0.42, 0.02, 180, 1.5, false, 4, '寻人启事'),
  // ---- 旧仓路后巷 ----
  S('al_dumpster', 'dumpster', 133.7, 66, 1.6, 1.0, 270, 1.3, true),
  S('al_pipes', 'pipes', 134.95, 72, 0.1, 6, 270, 0, false),
  S('al_ac1', 'acunit', 131.15, 64, 0.3, 0.8, 90, 0, false),
  S('al_ac2', 'acunit', 134.85, 75, 0.3, 0.8, 270, 0, false),
  S('al_bins', 'bins', 131.5, 83, 1.0, 2.0, 90, 1.1, true),
  S('al_crates', 'crates', 134.2, 85.5, 1.2, 1.2, 0, 0.9, true),
  S('al_puddle', 'puddle', 132.8, 74, 1.6, 2.4, 0, 0, false),
  S('al_sign', 'alleysign', 131.1, 62.6, 0.1, 0.5, 90, 2.6, false),
]

/** 巷子调查点（E 调查 / 手机相机拍照）。z=目标中心高度。 */
export interface StreetClue { id: 'graffiti' | 'boxes' | 'cctv'; label: string; x: number; y: number; z: number; range: number; radius: number }
export const STREET_CLUES: StreetClue[] = [
  { id: 'graffiti', label: '墙上的涂鸦', x: 131.08, y: 69.5, z: 1.45, range: 2.6, radius: 0.8 },
  { id: 'boxes', label: '一堆湿纸箱', x: 133.9, y: 78.0, z: 0.5, range: 2.2, radius: 0.7 },
  { id: 'cctv', label: '旧监控摄像头', x: 134.4, y: 87.75, z: 3.1, range: 4.2, radius: 0.35 },
]
/** 纸箱堆碰撞（调查点 boxes 的实体）。 */
export const CLUE_BOXES = { x0: 133.1, y0: 77.1, x1: 134.9, y1: 78.9, top: 1.0 }

/** 便利店 + 门厅 + 门洞等室内光源。 */
export const STREET_INDOOR_LIGHTS = [
  { x: 41, y: 11.5, r: 5, color: '#e9eef0', fixZ: 2.75, mul: 0.36 }, // 门厅
  { x: 36.5, y: 11, r: 3.5, color: '#dfe8f0', fixZ: 3.9, mul: 0.3 }, // 楼梯
  { x: 74, y: 64, r: 6, color: '#f2f6ff', fixZ: 2.95, mul: 0.5 }, // 便利店
  { x: 80, y: 65, r: 6, color: '#f2f6ff', fixZ: 2.95, mul: 0.5 },
]

/** 生成街区（genFoyer 末尾调用）：瓦片、高度、室外标记、碰撞代理、灯光与区域名。 */
export function genFoyerStreet(m: GameMap, rng: RNG) {
  const idx = (x: number, y: number) => y * m.w + x
  const rect = (x0: number, y0: number, x1: number, y1: number, fn: (i: number, x: number, y: number) => void) => {
    for (let y = Math.max(0, y0); y < Math.min(m.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(m.w, x1); x++) fn(idx(x, y), x, y)
  }
  STREET_AREAS.forEach((a, k) => rect(a.x0, a.y0, a.x1, a.y1, (i) => { m.tiles[i] = 1; m.outdoor[i] = a.outdoor ? 1 : 0; m.elev[i] = a.outdoor ? 3 : 0; m.tint[i] = 80 + k }))
  // 门厅：只有中间一段是地面（楼梯平台/坡道 + 门厅），单元门门洞
    rect(STAIR_LANDING.x0, STAIR_LANDING.y0, STAIR_LANDING.x1, STAIR_LANDING.y1, (i) => { m.elev[i] = 2 })
  rect(STAIR_RAMP.x0, STAIR_RAMP.y0, STAIR_RAMP.x1, STAIR_RAMP.y1, (i, x) => {
    m.elev[i] = 0
    const hi = x === STAIR_RAMP.x0 ? 120 : 60, lo = hi - 60
    m.stair[i] = encStair(2, lo, hi) // dir 2：向 -x 升高（向东下降）
  })
  rect(UNIT_DOOR.x0, UNIT_DOOR.y, UNIT_DOOR.x1, UNIT_DOOR.y + 1, (i) => { m.tiles[i] = 1; m.outdoor[i] = 0; m.tint[i] = 80 })
  // 便利店：只有店内为地面；外墙/玻璃立面由碰撞代理与瓦片边界提供
  // （store 区域已在 STREET_AREAS 中设为地面）
  // 建筑体块与围墙：实心（覆盖之前写入的地面，例如围墙两侧）
  for (const b of STREET_BUILDINGS) rect(b.x0, b.y0, b.x1, b.y1, (i) => { m.tiles[i] = 2; m.outdoor[i] = 0 })
  // 被建筑覆盖后重新打开：门厅、便利店、门洞、巷子
  for (const id of ['lobby', 'store', 'gate', 'alley'] as StreetAreaId[]) {
    const a = STREET_AREAS.find((v) => v.id === id)!
    rect(a.x0, a.y0, a.x1, a.y1, (i, x, y) => {
      if (id === 'lobby' && x < 38 && !(y >= 10 && y < 12)) return
      m.tiles[i] = 1; m.outdoor[i] = a.outdoor ? 1 : 0
    })
  }
  rect(UNIT_DOOR.x0, UNIT_DOOR.y, UNIT_DOOR.x1, UNIT_DOOR.y + 1, (i) => { m.tiles[i] = 1 })

  const push = (s: Structure) => m.structures.push(s)
  const box = (pid: string, x0: number, y0: number, x1: number, y1: number, top: number) =>
    push({ kind: 'foyerprop', x: x0, y: y0, w: x1 - x0, h: y1 - y0, solid: true, data: { foyer: 'street', pid, top } })
  for (const p of STREET_PROPS) if (p.solid) box(p.id, p.x - p.w / 2, p.y - p.d / 2, p.x + p.w / 2, p.y + p.d / 2, p.top)
  box('clue_boxes', CLUE_BOXES.x0, CLUE_BOXES.y0, CLUE_BOXES.x1, CLUE_BOXES.y1, CLUE_BOXES.top)
  // 路灯杆碰撞
  for (const l of STREET_LAMPS) if (l.area !== 'arch' && l.area !== 'alley') box(l.id, l.x - 0.14, l.y - 0.14, l.x + 0.14, l.y + 0.14, l.h)
  // 店面：玻璃/卷帘立面（y=60 线，向店外 0.12m）；便利店留出自动门
  for (const s of STREET_SHOPS) {
    if (s.kind !== 'mart') continue
    box('mart_glass_w', s.x0, s.y - 0.06, MART_DOOR.x0, s.y + 0.12, 3)
    box('mart_glass_e', MART_DOOR.x1, s.y - 0.06, s.x1, s.y + 0.12, 3)
  }
  // 门厅单元门两侧墙（门厅南墙线 y=15 已由瓦片封住）——楼梯平台的栏杆（防止从平台南/北侧掉下：瓦片已封）
  // 灯光：路灯（noFix=灯具由前厅街区渲染提供；outdoorOnly：玩家回到室内时退出回弹估算）
  for (const l of STREET_LAMPS) {
    const off = l.area === 'arch' || l.area === 'alley' ? 0 : l.area === 'compound' ? 0.25 : 1.1
    const dx = l.dir === 90 ? off : l.dir === 270 ? -off : 0, dy = l.dir === 0 ? off : l.dir === 180 ? -off : 0
    const r = l.area === 'compound' ? 5 : l.area === 'arch' ? 3.2 : l.area === 'alley' ? 4.2 : 8
    const color = l.area === 'compound' ? '#ffd9a8' : l.area === 'alley' ? '#ffcf8a' : l.area === 'arch' ? '#f0e6d0' : '#ffe2b0'
    const mul = l.area === 'compound' ? 0.42 : l.area === 'alley' ? 0.38 : l.area === 'arch' ? 0.3 : 0.55
    m.lights.push({ x: l.x + dx, y: l.y + dy, r, color, fixZ: l.h - 0.05, noFix: 1, intensityMul: mul, flickerSeed: rng.next() * 100, outdoorOnly: l.area === 'arch' ? undefined : 1 })
  }
  for (const L of STREET_INDOOR_LIGHTS) m.lights.push({ x: L.x, y: L.y, r: L.r, color: L.color, fixZ: L.fixZ, noFix: 1, intensityMul: L.mul, flickerSeed: rng.next() * 100 })
  // 招牌灯箱（暖/冷色补光）
  for (const s of STREET_SHOPS) if (s.open) m.lights.push({ x: (s.x0 + s.x1) / 2, y: s.y - 1.2, r: 4.5, color: s.kind === 'mart' ? '#e8f2ff' : s.kind === 'pharmacy' ? '#d8ffe4' : '#e0ecff', fixZ: 3.2, noFix: 1, intensityMul: 0.3, flickerSeed: rng.next() * 100, outdoorOnly: 1 })
  m.zones = [...(m.zones ?? []), ...STREET_AREAS.map((a) => ({ name: a.name, x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 }))]
  // 街景路人：复用项目的 NPC 系统（人物模型/步态/AI：engine/npc.ts 路线分支），回程异常时由 foyerStreet 移除
  m.npcDefs = [...(m.npcDefs ?? []), ...FOYER_PEDS.map(foyerPedDef)]
  m.npcs = [...(m.npcs ?? []), ...FOYER_PEDS.map((d) => ({ id: d.id, x: d.route ? d.route[0][0] : d.x, y: d.route ? d.route[0][1] : d.y, facing: d.facing ?? 0 }))]
}

// ---- 街景路人（夜里零星几个：人行道往返、公交站/店门口驻足看手机）----
interface FoyerPed { id: string; x: number; y: number; route?: [number, number][]; speed?: number; facing?: number; look: Partial<AvatarCfg> }
export const FOYER_PEDS: FoyerPed[] = [
  { id: 'foyer_ped_0', x: 40, y: 47.2, route: [[40, 47.2], [96, 47.2]], speed: 1.25, look: { gender: 0, hair: 1, hairColor: '#232326', top: '#2b3440', topStyle: 3, pants: '#2a2d33', pantsStyle: 3, shoes: 1, skin: '#c9a58a' } },
  { id: 'foyer_ped_1', x: 86, y: 58.45, route: [[86, 58.45], [100, 58.45]], speed: 1.05, look: { gender: 1, hair: 11, hairColor: '#4a3020', top: '#5a3c33', topStyle: 7, pants: '#2a2d33', pantsStyle: 0, shoes: 2, skin: '#f0c8a8' } },
  { id: 'foyer_ped_2', x: 51, y: 58.75, facing: -Math.PI / 2, look: { gender: 0, hair: 7, hairColor: '#232326', top: '#3d4a3a', topStyle: 2, pants: '#3a352e', pantsStyle: 4, shoes: 1, skin: '#a87f5c', glasses: 2 } },
  { id: 'foyer_ped_3', x: 118, y: 47.4, route: [[118, 47.4], [146, 47.4]], speed: 1.15, look: { gender: 1, hair: 15, hairColor: '#232326', top: '#2e2e34', topStyle: 3, pants: '#2e3a4a', pantsStyle: 3, shoes: 1, skin: '#c9a58a' } },
  { id: 'foyer_ped_4', x: 44, y: 29.6, route: [[44, 29.6], [68, 29.6]], speed: 0.95, look: { gender: 0, hair: 3, hairColor: '#9a9a9e', top: '#6a5d4d', topStyle: 6, pants: '#4a4a42', pantsStyle: 0, shoes: 0, skin: '#c9a58a', glasses: 1 } },
  { id: 'foyer_ped_5', x: 87.4, y: 58.9, facing: -Math.PI / 2, look: { gender: 1, hair: 4, hairColor: '#7a5a30', top: '#20242a', topStyle: 2, pants: '#2a2d33', pantsStyle: 5, shoes: 1, skin: '#7d5a3c' } },
  { id: 'foyer_ped_6', x: 104.5, y: 58.6, route: [[103, 57.9], [72, 57.9]], speed: 1.0, look: { gender: 0, hair: 12, hairColor: '#4a3020', top: '#3a3f46', topStyle: 0, pants: '#2e3a4a', pantsStyle: 3, shoes: 1, skin: '#f0c8a8' } },
]
function foyerPedDef(d: FoyerPed): NpcDef {
  return {
    id: d.id, name: '路人', role: '行人', faction: 'wanderer', personality: '', background: '', ambient: true,
    avatar: { face: 0, beard: 0, glasses: 0, ...d.look }, lines: [], idle: [],
    route: d.route, routeSpeed: d.speed, wanderRadius: d.route ? undefined : 0.35,
  }
}

/** 路灯的光源（按灯杆 id 在地图光源中定位：生成顺序与 STREET_LAMPS 一致）。 */
export function streetLampLights(m: GameMap): { lamp: StreetLamp; light: import('../core/types').LightSource; base: number }[] {
  const out: { lamp: StreetLamp; light: import('../core/types').LightSource; base: number }[] = []
  for (const lamp of STREET_LAMPS) {
    const light = m.lights.find((l) => Math.abs(l.x - lamp.x) < 1.3 && Math.abs(l.y - lamp.y) < 1.3 && l.noFix === 1 && Math.abs((l.fixZ ?? 0) - (lamp.h - 0.05)) < 0.01)
    if (light) out.push({ lamp, light, base: light.intensityMul ?? 1 })
  }
  return out
}
