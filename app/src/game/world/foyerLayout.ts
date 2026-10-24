// 前厅（序章，level id 900）：玩家的家——手工布局数据（地图生成、渲染与交互共用）。
// 坐标：地图 x=东，y=南（Three.js z），单位米；1 瓦片 = 1m。
// 外墙沿用瓦片墙（tiles=2），室内隔墙为 0.12m 薄墙结构（foyerprop/wall），门洞位于隔墙缺口。
// 现代城市公寓，风格不指向具体国家；招牌/品牌均为虚构中性名称。
import type { GameMap } from './mapgen'
import type { LevelDef, Structure } from '../core/types'
import type { RNG } from '../core/rng'
import { genFoyerStreet, streetCeilingAt } from './foyerStreetLayout'
import { partitionBlocks, wallUnion } from './foyerShell'
export const foyerWallBlocks = () => partitionBlocks(FOYER_PARTITIONS, FOYER_CEIL, FOYER_WALL_T, FOYER_DOOR_H)
export const foyerWallUnion = () => wallUnion(foyerWallBlocks())

export const FOYER_ID = 900
export const FOYER_W = 30
export const FOYER_H = 24
/** 室内净高（视觉吊顶）；灯具一律以 fixZ 贴吊顶，避免引擎默认层高 3m 的灯盒。 */
export const FOYER_CEIL = 2.8
/** Visible ceiling footprint; the front doorway connects the home and landing. */
export const FOYER_HOME_CEILINGS = [
  { x0: 4, y0: 4, x1: 17, y1: 14 },
  { x0: 5, y0: 14, x1: 6, y1: 15 },
  { x0: 4, y0: 15, x1: 8, y1: 18 },
] as const

export function foyerCeilingAt(m: GameMap, x: number, y: number): number {
  const tx = Math.floor(x), ty = Math.floor(y)
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] !== 1) return Infinity
  if (FOYER_HOME_CEILINGS.some(r => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) return FOYER_CEIL
  return streetCeilingAt(x, y)
}
export const FOYER_WALL_T = 0.12
export const FOYER_DOOR_H = 2.1

export type FoyerRoomId = 'bedroom' | 'bath' | 'kitchen' | 'living' | 'entry' | 'stair'
export interface FoyerRoom { id: FoyerRoomId; name: string; x0: number; y0: number; x1: number; y1: number; floor: 'oak' | 'ash' | 'tile60' | 'tile30' | 'terrazzo'; wall: 'paintWarm' | 'paintSage' | 'tileWhite' | 'paintCool' | 'stairPaint' }

export const FOYER_ROOMS: FoyerRoom[] = [
  { id: 'bedroom', name: '卧室', x0: 4, y0: 4, x1: 9, y1: 9, floor: 'oak', wall: 'paintSage' },
  { id: 'bath', name: '卫生间', x0: 9, y0: 4, x1: 12, y1: 8, floor: 'tile30', wall: 'tileWhite' },
  { id: 'kitchen', name: '厨房', x0: 12, y0: 4, x1: 17, y1: 8, floor: 'tile60', wall: 'paintWarm' },
  { id: 'living', name: '客厅', x0: 9, y0: 8, x1: 17, y1: 14, floor: 'ash', wall: 'paintWarm' },
  { id: 'entry', name: '玄关', x0: 4, y0: 9, x1: 9, y1: 14, floor: 'ash', wall: 'paintWarm' },
  { id: 'stair', name: '楼道', x0: 4, y0: 15, x1: 8, y1: 18, floor: 'terrazzo', wall: 'stairPaint' },
]

export function foyerRoomAt(x: number, y: number): FoyerRoom | undefined {
  // 客厅与厨房/卫生间相接：先判定小房间
  for (const id of ['bath', 'kitchen', 'bedroom', 'entry', 'stair', 'living'] as FoyerRoomId[]) {
    const r = FOYER_ROOMS.find((v) => v.id === id)!
    if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return r
  }
  return undefined
}

/**
 * 家中（含楼道与防盗门门洞）。渲染层据此切换「家中写实光照 / 街区夜景」两套设置：门洞瓦片 (5,14) 不属于任何房间，
 * 若只用 foyerRoomAt，玩家穿过防盗门的一瞬间会被判为「室外」→ 点光池盏数变化 → 全场景着色器重编译（出门卡顿的主因）。
 */
export function foyerHomeAt(x: number, y: number): boolean {
  return !!foyerRoomAt(x, y) || (x >= 5 && x < 6 && y >= 14 && y < 15)
}

/** 室内隔墙（沿 x 或 y 的轴向线段；gaps=门洞/开口区间，沿线段方向）。 */
export interface FoyerPartition { id: string; axis: 'x' | 'y'; at: number; from: number; to: number; gaps: { a: number; b: number; door?: string; lintel?: boolean }[]; sides: [FoyerRoomId, FoyerRoomId] }
export const FOYER_PARTITIONS: FoyerPartition[] = [
  // axis 'y' = 竖直墙（x 固定 at，沿 y 从 from 到 to）；sides=[西侧房间, 东侧房间]
  { id: 'bed-bath', axis: 'y', at: 9, from: 4, to: 9, gaps: [], sides: ['bedroom', 'bath'] },
  { id: 'entry-living', axis: 'y', at: 9, from: 9, to: 11, gaps: [], sides: ['entry', 'living'] },
  { id: 'bath-kitchen', axis: 'y', at: 12, from: 4, to: 8, gaps: [], sides: ['bath', 'kitchen'] },
  // axis 'x' = 水平墙（y 固定 at，沿 x）；sides=[北侧房间, 南侧房间]
  { id: 'bed-entry', axis: 'x', at: 9, from: 4, to: 9, gaps: [{ a: 7.5, b: 8.4, door: 'door_bedroom', lintel: true }], sides: ['bedroom', 'entry'] },
  { id: 'bath-living', axis: 'x', at: 8, from: 9, to: 12, gaps: [{ a: 10.05, b: 10.85, door: 'door_bath', lintel: true }], sides: ['bath', 'living'] },
]

/** 外墙窗（嵌在瓦片外墙的内表面上）。side=墙所在方位；a/b=沿墙区间；sill/top=窗台/窗顶高度。 */
export interface FoyerWindow { id: string; side: 'n' | 's' | 'e' | 'w'; at: number; a: number; b: number; sill: number; top: number; room: FoyerRoomId; view: 'city' | 'cityLow' }
export const FOYER_WINDOWS: FoyerWindow[] = [
  { id: 'win_bedroom', side: 'n', at: 4, a: 5.3, b: 6.9, sill: 0.85, top: 2.35, room: 'bedroom', view: 'city' },
  { id: 'win_kitchen', side: 'n', at: 4, a: 13.55, b: 14.65, sill: 1.12, top: 2.0, room: 'kitchen', view: 'city' },
  { id: 'win_living', side: 's', at: 14, a: 12.6, b: 15.6, sill: 0.25, top: 2.45, room: 'living', view: 'cityLow' },
  { id: 'win_living_e', side: 'e', at: 17, a: 8.6, b: 9.6, sill: 0.9, top: 2.3, room: 'living', view: 'city' },
]

/** 门（铰链门；hinge=铰链所在端点，closed 时门板沿墙线，打开时向 swing 方向旋转 90°）。 */
export interface FoyerDoor { id: string; label: string; axis: 'x' | 'y'; at: number; a: number; b: number; hinge: 'a' | 'b'; swing: 1 | -1; style: 'interior' | 'bath' | 'security'; locked?: boolean }
export const FOYER_DOORS: FoyerDoor[] = [
  { id: 'door_bedroom', label: '卧室门', axis: 'x', at: 9, a: 7.5, b: 8.4, hinge: 'b', swing: -1, style: 'interior' },
  { id: 'door_bath', label: '卫生间门', axis: 'x', at: 8, a: 10.05, b: 10.85, hinge: 'a', swing: -1, style: 'bath' },
  // 防盗门：位于南外墙瓦片 (5,14) 的内侧面，向室内（北）开
  { id: 'door_front', label: '防盗门', axis: 'x', at: 14.06, a: 5.02, b: 5.98, hinge: 'a', swing: -1, style: 'security' },
]

/** 家具/陈设（渲染层按 kind 建模；solid=碰撞；top=碰撞顶高）。x/y=中心；w=沿 x、d=沿 y 的占地（已含朝向）；rot=模型正面朝向（0=朝南 +y，90=朝东 +x，180=朝北，270=朝西）。 */
export interface FoyerProp { id: string; kind: string; x: number; y: number; w: number; d: number; rot: 0 | 90 | 180 | 270; top: number; solid: boolean; room: FoyerRoomId; label?: string }
const P = (id: string, kind: string, room: FoyerRoomId, x0: number, y0: number, x1: number, y1: number, rot: FoyerProp['rot'], top: number, solid = true, label?: string): FoyerProp =>
  ({ id, kind, room, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0, rot, top, solid, label })

export const FOYER_PROPS: FoyerProp[] = [
  // ---- 卧室 ----
  P('desk', 'desk', 'bedroom', 4.0, 5.0, 4.68, 6.5, 90, 0.76, true, '书桌'),
  P('computer', 'computer', 'bedroom', 4.05, 5.35, 4.45, 6.15, 90, 1.25, false, '电脑'),
  P('desk_chair', 'deskchair', 'bedroom', 4.95, 5.45, 5.55, 6.05, 270, 0.5, false), // 开场坐姿：不设碰撞
  P('phone_dock', 'phonedock', 'bedroom', 4.48, 6.18, 4.62, 6.36, 90, 0.8, false, '手机'),
  P('desk_drawer', 'deskdrawer', 'bedroom', 4.05, 5.05, 4.62, 5.5, 90, 0.7, false, '书桌抽屉'),
  P('desk_lamp', 'desklamp', 'bedroom', 4.08, 6.28, 4.28, 6.46, 90, 1.2, false),
  P('bed', 'bed', 'bedroom', 7.34, 4.02, 8.92, 6.12, 0, 0.55, true, '床'),
  P('nightstand', 'nightstand', 'bedroom', 6.8, 4.02, 7.3, 4.48, 0, 0.55, true, '床头柜'),
  P('wardrobe', 'wardrobe', 'bedroom', 4.04, 8.34, 5.94, 8.94, 180, 2.2, true, '衣柜'),
  P('shelf_bed', 'figshelf', 'bedroom', 4.04, 6.85, 4.38, 8.0, 90, 1.85, true),
  P('rug_bed', 'rug', 'bedroom', 5.4, 6.4, 7.3, 7.9, 0, 0.01, false),
  P('poster_level0', 'poster', 'bedroom', 4.0, 5.4, 4.04, 6.1, 90, 2.5, false),
  P('poster_bed2', 'poster2', 'bedroom', 8.89, 6.85, 8.94, 7.55, 270, 2.3, false),
  P('laundry', 'laundry', 'bedroom', 6.2, 8.5, 6.7, 8.94, 180, 0.5, true),
  P('ceil_bedroom', 'ceilinglamp', 'bedroom', 6.3, 6.3, 6.7, 6.7, 0, 0, false),
  // ---- 卫生间 ----
  P('shower', 'shower', 'bath', 10.84, 4.0, 11.94, 5.15, 0, 2.0, true),
  P('toilet', 'toilet', 'bath', 11.36, 5.85, 11.94, 6.35, 270, 0.42, true),
  P('vanity', 'vanity', 'bath', 9.06, 4.9, 9.61, 5.9, 90, 0.86, true),
  P('washer', 'washer', 'bath', 9.07, 6.2, 9.69, 6.82, 90, 0.86, true),
  P('towel', 'towel', 'bath', 11.86, 6.6, 11.94, 7.4, 270, 1.6, false),
  P('ceil_bath', 'ceilinglamp', 'bath', 10.3, 5.8, 10.7, 6.2, 0, 0, false),
  // ---- 厨房 ----
  P('counter_n', 'counter', 'kitchen', 12.06, 4.0, 16.18, 4.64, 0, 0.92, true),
  P('sink', 'sink', 'kitchen', 13.7, 4.06, 14.5, 4.58, 0, 0.92, false, '水槽'),
  P('stove', 'stove', 'kitchen', 14.95, 4.06, 15.65, 4.58, 0, 0.92, false, '灶台'),
  P('fridge', 'fridge', 'kitchen', 16.22, 4.02, 16.96, 4.76, 0, 1.86, true, '冰箱'),
  P('counter_w', 'counter', 'kitchen', 12.06, 4.64, 12.68, 6.4, 90, 0.92, true),
  P('upper_n', 'uppercab', 'kitchen', 12.06, 4.0, 13.45, 4.36, 0, 2.2, false),
  P('upper_n2', 'uppercab', 'kitchen', 14.75, 4.0, 14.95, 4.36, 0, 2.2, false),
  P('hood', 'hood', 'kitchen', 14.95, 4.0, 15.65, 4.48, 0, 2.2, false),
  P('upper_n3', 'uppercab', 'kitchen', 15.65, 4.0, 16.18, 4.36, 0, 2.2, false),
  P('island', 'island', 'kitchen', 13.2, 6.85, 16.0, 7.5, 0, 0.92, true),
  P('stool1', 'stool', 'living', 13.75, 7.75, 14.15, 8.15, 180, 0.65, true),
  P('stool2', 'stool', 'living', 15.0, 7.75, 15.4, 8.15, 180, 0.65, true),
  P('microwave', 'microwave', 'kitchen', 12.12, 5.3, 12.57, 5.85, 90, 1.2, false),
  P('kettle', 'kettle', 'kitchen', 12.17, 6.0, 12.42, 6.25, 90, 1.15, false),
  P('pend1', 'pendant', 'kitchen', 13.9, 7.0, 14.1, 7.2, 0, 0, false),
  P('pend2', 'pendant', 'kitchen', 15.1, 7.0, 15.3, 7.2, 0, 0, false),
  P('ceil_kitchen', 'ceilinglamp', 'kitchen', 14.3, 5.4, 14.7, 5.8, 0, 0, false),
  // ---- 客厅 ----
  P('sofa', 'sofa', 'living', 10.9, 9.7, 11.85, 12.3, 90, 0.82, true, '沙发'),
  P('coffee', 'coffeetable', 'living', 12.7, 10.45, 13.8, 11.55, 90, 0.42, true, '茶几'),
  P('tvstand', 'tvstand', 'living', 16.5, 9.9, 16.98, 12.1, 270, 0.5, true),
  P('tv', 'tv', 'living', 16.87, 10.35, 17.0, 11.65, 270, 1.75, false, '电视'),
  P('rug_living', 'rug2', 'living', 11.7, 9.8, 15.6, 12.2, 0, 0.01, false),
  P('floorlamp', 'floorlamp', 'living', 10.95, 12.55, 11.35, 12.95, 90, 1.6, true),
  P('plant1', 'plant', 'living', 16.35, 13.3, 16.9, 13.9, 0, 1.4, true),
  P('plant2', 'plant', 'living', 9.2, 13.42, 9.65, 13.92, 0, 1.0, true), // 贴客厅西南角（原位置与餐桌一起把玄关→客厅的开口挤到 <0.6m）
  P('bookcase', 'bookcase', 'living', 9.07, 8.1, 9.43, 9.6, 90, 2.0, true),
  P('armchair', 'armchair', 'living', 13.0, 12.65, 13.85, 13.5, 180, 0.8, true),
  P('sidetable', 'sidetable', 'living', 10.95, 9.15, 11.4, 9.6, 90, 0.55, true),
  P('poster_living', 'framedart', 'living', 9.06, 9.8, 9.1, 10.9, 90, 2.2, false), // 挂在玄关/客厅隔墙（y 9–11）上；原 y 11.2–12.6 处为开放边界、无墙
  P('clock', 'wallclock', 'living', 10.6, 13.95, 11.0, 14.0, 180, 2.3, false, '挂钟'), // 原位置在南窗（x 12.6–15.6）玻璃上，移到窗西侧实墙
  P('ceil_living', 'ceilinglamp', 'living', 13.4, 10.8, 13.8, 11.2, 0, 0, false),
  // ---- 玄关 ----
  P('shoecab', 'shoecab', 'entry', 4.04, 11.5, 4.46, 13.6, 90, 1.0, true, '鞋柜'),
  P('mirror_entry', 'mirror', 'entry', 4.0, 11.9, 4.04, 13.2, 90, 2.0, false),
  P('coathook', 'coathook', 'entry', 6.4, 13.9, 7.6, 14.0, 180, 1.9, false),
  P('doormat', 'doormat', 'entry', 5.0, 13.25, 6.0, 13.9, 0, 0.01, false),
  // 餐桌移到玄关灯正下方（原 x 7.2–8.5 正挡在玄关→客厅开口前：与隔墙端头/盆栽之间只剩 0.6m，玩家进不了客厅和厨房）
  P('dining', 'diningtable', 'entry', 5.55, 10.75, 6.85, 11.65, 0, 0.75, true),
  P('chair_d1', 'chair', 'entry', 5.98, 10.18, 6.43, 10.63, 0, 0.45, true),
  P('chair_d2', 'chair', 'entry', 5.98, 11.77, 6.43, 12.22, 180, 0.45, true),
  P('umbrella', 'umbrella', 'entry', 4.1, 13.62, 4.38, 13.9, 0, 0.6, true),
  P('intercom', 'intercom', 'entry', 6.08, 13.97, 6.28, 14.0, 180, 1.5, false),
  P('ceil_entry', 'ceilinglamp', 'entry', 6.0, 11.0, 6.4, 11.4, 0, 0, false),
  // ---- 楼道（P2 继续：此处只是封闭的楼道段） ----
  P('meterbox', 'meterbox', 'stair', 4.0, 15.4, 4.23, 16.2, 90, 1.9, false),
  P('mailbox', 'mailboxes', 'stair', 7.77, 15.2, 8.0, 16.4, 270, 1.6, false),
  P('stair_barrier', 'barrier', 'stair', 4.2, 17.35, 6.6, 17.7, 0, 1.0, true),
  P('stair_flyers', 'flyers', 'stair', 5.4, 17.96, 6.8, 18.0, 180, 1.8, false),
  P('ceil_stair', 'stairlamp', 'stair', 5.82, 16.22, 6.18, 16.58, 0, 0, false), // 声控灯灯罩（亮度随声控状态，renderer 动态材质）
]

/** 拾取物在场景中的位置（渲染层与交互共用）。 */
export const FOYER_PICKUP_POS = {
  backpack: { x: 4.72, y: 8.54, z: 0.08 }, // 衣柜底层（柜门打开才可见）
  flashlight_bed: { x: 7.48, y: 5.3, z: 0.0 }, // 床底靠西侧边缘（蹲下可见）
  flashlight_drawer: { x: 7.125, y: 4.57, z: 0.437 }, // 床头柜抽屉里（随抽屉滑出）
  water: { x: 16.42, y: 4.57, z: 0.98 }, // 冰箱中层（门打开才可见）
  snack: { x: 16.72, y: 4.57, z: 1.4 }, // 冰箱上层
}

/** 楼道声控灯光源（engine/foyer.ts 按声控状态改写其 intensityMul）。 */
export const FOYER_CORRIDOR_LIGHT = { x: 6.0, y: 16.4, mul: 0.42 }

/** 临时出口：楼道尽头的楼梯间门（P3 由 RealityBreak 替换）。 */
export const FOYER_TEMP_EXIT = { x: 7, y: 17 }
/** 出生点：坐在书桌前（第 0 幕：23:40，屏幕上开着新闻网站）。 */
export const FOYER_SPAWN = { x: 5.25, y: 5.75, yaw: Math.PI / 2, pitch: -0.12 }

const SOLID_KINDS_OVERRIDE: Record<string, boolean> = {}

/**
 * 可坐家具（复用项目座椅系统 engine/seating.ts：靠近出现「坐下」，坐姿眼高/朝向/视角限制/起身检查都由它处理）。
 * 返回相对家具占地中心的座面（地图坐标偏移 x=东、z=南；y=座面高度；yaw=坐下后面朝方向，0=南、π/2=东）。
 */
export function foyerSeats(pid: string): { x: number; y: number; z: number; yaw: number; label: string; relaxed?: boolean }[] {
  const p = FOYER_PROPS.find((v) => v.id === pid)
  if (!p) return []
  const yaw = (p.rot * Math.PI) / 180
  const fwd = (d: number) => ({ x: Math.sin(yaw) * d, z: Math.cos(yaw) * d }) // 沿家具正面方向的偏移
  switch (p.kind) {
    case 'sofa': { const f = fwd(0.1); return [-0.74, 0, 0.74].map((u) => ({ x: f.x + Math.cos(yaw) * u, z: f.z - Math.sin(yaw) * u, y: 0.5, yaw, label: '沙发', relaxed: true })) }
    case 'armchair': { const f = fwd(0.05); return [{ ...f, y: 0.45, yaw, label: '扶手椅', relaxed: true }] }
    case 'chair': return [{ x: 0, z: 0, y: 0.47, yaw, label: '餐椅' }]
    case 'stool': return [{ x: 0, z: 0, y: 0.68, yaw, label: '吧凳' }]
    case 'deskchair': return [{ x: 0, z: 0, y: 0.5, yaw, label: '电脑椅' }]
    case 'toilet': { const f = fwd(0.04); return [{ ...f, y: 0.42, yaw, label: '马桶' }] }
    case 'bed': // 床沿：西侧（面朝房间）与床尾
      return [{ x: -p.w / 2 + 0.28, z: 0.15, y: 0.56, yaw: -Math.PI / 2, label: '床边' }, { x: 0.1, z: p.d / 2 - 0.26, y: 0.56, yaw: 0, label: '床尾' }]
  }
  return []
}

/** 门的碰撞框（关闭=沿门洞；打开=沿铰链侧墙面的薄板）。 */
export function foyerDoorBox(d: FoyerDoor, open: boolean): { x0: number; y0: number; x1: number; y1: number } {
  const t = 0.05
  const len = d.b - d.a
  const hx = d.hinge === 'a' ? d.a : d.b
  if (d.axis === 'x') {
    if (!open) return { x0: d.a, y0: d.at - t, x1: d.b, y1: d.at + t }
    const y0 = d.swing < 0 ? d.at - len : d.at, y1 = d.swing < 0 ? d.at : d.at + len
    return { x0: hx - t, y0, x1: hx + t, y1 }
  }
  if (!open) return { x0: d.at - t, y0: d.a, x1: d.at + t, y1: d.b }
  const x0 = d.swing < 0 ? d.at - len : d.at, x1 = d.swing < 0 ? d.at : d.at + len
  const hy = d.hinge === 'a' ? d.a : d.b
  return { x0, y0: hy - t, x1, y1: hy + t }
}

/** 前厅结构碰撞（mapgen.structColliders 调用）。 */
export function foyerColliders(s: Structure): { x0: number; y0: number; x1: number; y1: number; bottom?: number; top: number; stand: boolean }[] {
  const d = s.data ?? {}
  if (d.foyer === 'seat') return [] // 只用于坐下交互的代理（电脑椅：开场坐姿处，不设碰撞）
  if (d.foyer === 'door') {
    const door = FOYER_DOORS.find((v) => v.id === d.pid)
    if (!door) return []
    return [{ ...foyerDoorBox(door, !!d.open), bottom: 0, top: FOYER_DOOR_H, stand: false }]
  }
  return [{ x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h, bottom: Number(d.bottom ?? 0), top: Number(d.top ?? 1), stand: !!d.stand }]
}

/** 生成前厅地图（gen='outpost' 的 id 900 分支）。 */
export function genFoyer(m: GameMap, rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  void SOLID_KINDS_OVERRIDE
  m.foyer = true // Derived authored geometry; regenerated on load, not a save field.
  const idx = (x: number, y: number) => y * m.w + x
  // 外墙环 + 室内全地板
  const fillRect = (x0: number, y0: number, x1: number, y1: number, v: 0 | 1 | 2) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m.tiles[idx(x, y)] = v
  }
  fillRect(3, 3, 18, 15, 2)
  fillRect(4, 4, 17, 14, 1)
  fillRect(3, 14, 9, 19, 2)
  fillRect(4, 15, 8, 18, 1)
  m.tiles[idx(5, 14)] = 1 // 防盗门门洞
  // 房间 tint（渲染层选择地面/墙面材质；HUD 区域名）
  FOYER_ROOMS.forEach((r, i) => { for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) m.tint[idx(x, y)] = 60 + i })
  m.tint[idx(5, 14)] = 60 + FOYER_ROOMS.findIndex((r) => r.id === 'entry')

  const push = (s: Structure) => m.structures.push(s)
  // Rendering and collision share closed, joined wall volumes, including headers.
  for (const b of foyerWallBlocks()) push({ kind: 'foyerprop', x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, solid: true, data: { foyer: 'wall', pid: b.id, bottom: b.bottom, top: b.top } })
  // 门
  for (const d of FOYER_DOORS) {
    const t = 0.06
    const box = d.axis === 'x' ? { x: d.a, y: d.at - t, w: d.b - d.a, h: 2 * t } : { x: d.at - t, y: d.a, w: 2 * t, h: d.b - d.a }
    push({ kind: 'foyerprop', ...box, solid: true, data: { foyer: 'door', pid: d.id, open: 0 } })
  }
  // 家具碰撞
  for (const p of FOYER_PROPS) {
    if (!p.solid) {
      // 不设碰撞的可坐家具（电脑椅）：放一个无碰撞的交互代理，座椅系统据此提供「坐下」
      if (foyerSeats(p.id).length) push({ kind: 'foyerprop', x: p.x - p.w / 2, y: p.y - p.d / 2, w: p.w, h: p.d, solid: false, data: { foyer: 'seat', pid: p.id, top: p.top } })
      continue
    }
    push({ kind: 'foyerprop', x: p.x - p.w / 2, y: p.y - p.d / 2, w: p.w, h: p.d, solid: true, data: { foyer: 'prop', pid: p.id, top: p.top } })
  }
  // 灯光（全部 fixZ 贴吊顶/灯具，noFix：灯具模型由渲染层前厅模块提供）
  const L = (x: number, y: number, r: number, color: string, fixZ: number, intensityMul = 1) =>
    m.lights.push({ x, y, r, color, fixZ, noFix: 1, intensityMul, flickerSeed: rng.next() * 100 })
  L(6.5, 6.5, 6, '#ffe2b8', FOYER_CEIL - 0.02, 0.3) // 卧室吸顶灯（暖白，夜里调暗）
  L(4.45, 6.35, 3.2, '#ffd59a', 1.55, 0.45) // 书桌台灯
  L(10.5, 6.0, 4, '#f4f2ea', FOYER_CEIL - 0.02, 0.38) // 卫生间
  L(14.5, 5.6, 5, '#fff0d8', FOYER_CEIL - 0.02, 0.36) // 厨房吸顶
  L(14.6, 7.1, 3.8, '#ffd8a0', 2.05, 0.34) // 岛台吊灯
  L(13.6, 11.0, 6.5, '#ffe6c4', FOYER_CEIL - 0.02, 0.3) // 客厅吸顶
  L(11.15, 12.75, 3.6, '#ffc888', 1.75, 0.45) // 落地灯
  L(6.2, 11.2, 5, '#ffe8c8', FOYER_CEIL - 0.02, 0.32) // 玄关
  L(FOYER_CORRIDOR_LIGHT.x, FOYER_CORRIDOR_LIGHT.y, 5, '#dfe8f0', 2.75, 0) // 楼道声控灯（冷白；初始熄灭，脚步声点亮）
  // M3：楼道东墙的安全通道门 → 下楼进入街区（engine/foyerStreet.ts）；不再放置临时出口门。
  // 回程异常结束时由 engine/foyerStreet.ts 直接调用 def.exits[0]（沿用 Cutscene 'fall' → Level 0；M4 由 RealityBreak 替换）。
  void def
  m.spawn = { x: Math.floor(FOYER_SPAWN.x), y: Math.floor(FOYER_SPAWN.y) }
  m.zones = FOYER_ROOMS.map((r) => ({ name: r.name, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }))
  genFoyerStreet(m, rng) // M3：楼栋门厅 → 小区 → 第六大街 → 旧仓路后巷
  return [{ cx: 6, cy: 6 }]
}
