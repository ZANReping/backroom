// 共享类型定义
export const TILE = 32

export type TileType = 0 | 1 | 2 // 0=虚空 1=地板 2=墙

export interface Palette {
  floor: string
  floorAlt: string
  wall: string
  wallTop: string
  accent: string
  light: string
  decal: string
}

// v23：新增 noclip（相位穿透）/ collapse（地面坍塌坠落）/ sink（沉没）/ dawn（破晓白场）
export type ExitAnim = 'bloom' | 'shutter' | 'iris' | 'glitch' | 'fall' | 'noclip' | 'collapse' | 'sink' | 'dawn'

export interface ExitDef {
  kind: string
  name: string
  dest: number | 'random' | 'win'
  anim: ExitAnim
  req?: { fuses?: number; keycard?: boolean; lever?: boolean; tapes?: number; rope?: boolean; lantern?: boolean }
  reqText?: string
  fallDamage?: number
  /** v23：切入演出（进入下一层时播放的过场类型），缺省按目标层 entryAnim */
  cutIn?: CutInKind
}

/** v23 切入（进入层级）过场类型 */
export type CutInKind = 'fall' | 'collapse' | 'wade' | 'crawl' | 'step' | 'surface' | 'dark'

export interface SpawnEntry {
  type: string
  w: number
  min: number
  max: number
}

export interface LevelDef {
  id: number
  name: string
  flavor: string
  lore?: string // 图鉴/档案长文本（官方设定）
  exitDesc?: string // 图鉴：出口描述
  palette: Palette
  gen: 'rooms' | 'garage' | 'pipes' | 'grid' | 'office' | 'hotel'
    // v23：Level 6–11 与 Level 601 的新生成器
    | 'darkhall' | 'ocean' | 'caves' | 'suburb' | 'field' | 'city' | 'library'
  size: number
  infinite?: boolean // v17：无限 chunk 流式生成（L0 专用路径；有限层级缺省 false）
  skipPrefabs?: string[] // v8：生成器已内置同类区域的层级跳过指定 prefab（如 L5 内置客房/宴会厅）
  entities: SpawnEntry[]
  items: { type: string; w: number }[]
  itemCount: [number, number]
  structures: string[]
  exits: ExitDef[]
  entrance: string
  lightDensity: number
  darkness: number

  // ================= v23 新增字段 =================
  /** 显示编号（缺省=id）。Level 601 在数组中排在末位，但对玩家显示 601 */
  displayId?: number
  /** 官方生存难度分级（Survival Difficulty，wiki 卡片） */
  sd?: string
  /** 光照系数：所有光源半径/强度倍率。L6=0（外带光源完全失效）、L8=0.12（100 流明只剩 12 流明） */
  lightMul?: number
  /** 熵效应：电池/食物/理智的额外损耗倍率（L8=2.2） */
  entropy?: number
  /** 「Level 11 Effect」：实体主动攻击倾向下降的系数（0=正常，1=完全被动）。主动攻击会解除 */
  pacify?: number
  /** 补给放入容器（箱子/柜子/桶）的比例（0–1，缺省 0.45）——v23 容器化掉落 */
  containerBias?: number
  /** 室外天空色（缺省查 SKY 表） */
  sky?: string
  /** 进入本层时的默认切入过场 */
  entryAnim?: CutInKind
  /** 本层是否禁用手电（L6：任何外带光源都不发光） */
  noFlashlight?: boolean
  /** 该层为水域主导（L7）：全局呼吸/浮力规则 */
  aquatic?: boolean
  /** 强制生成 exits 数组里的全部出口（Level 601 结局层需要真假两扇门同时存在） */
  allExits?: boolean
  /** 「random」出口可落到的层级上界（缺省 = 常规层末位，不含结局层） */
  noRandomDest?: boolean
}

export interface ExitInstance {
  def: ExitDef
  x: number
  y: number
  discovered: boolean
}

export type StructKind =
  | 'pillar' | 'car' | 'booth' | 'pipes' | 'valve' | 'gauge' | 'boiler'
  | 'generator' | 'cabinet' | 'trench' | 'cubicle' | 'copier' | 'server' | 'vending'
  | 'desk' | 'door' | 'ballroom' | 'lightgrid' | 'wet'   | 'graffiti' | 'crate'
  | 'corpse' | 'ladder' | 'vent' | 'mirror' | 'elevator' | 'frontdesk' | 'bed' | 'sconce'
  | 'socket' // 墙上插板（L0 装饰：米色插座面板）
  // v6 新增：层级特色生成物与预制结构内容
  | 'hoteldoor' // 可交互房门（开关/上锁，撬棍/万能钥匙）
  | 'windowblack' // L4 涂黑窗户（安全装饰）
  | 'windowtrap' // L4 未涂黑窗户=陷阱（靠近触发）
  | 'hotelwindow' // L5 酒店窗（装饰）
  | 'table' // 桌子（宴会厅/客房）
  | 'chandelier' // L5 水晶吊灯（带光源）
  | 'hanglight' // L0 荧光灯吊线版（带光源，闪烁）
  | 'dresser' // 柜子（可搜索容器）
  | 'arch' // L0 拱门
  | 'maingen' // L3 主发电机（大型）
  | 'megcrate' // M.E.G. 补给箱（富补给容器）
  | 'prefabmark' // 预制结构标记（不可见，冒烟断言用）
  // v7 新增：室外场景门窗
  | 'glasswin' // 半透玻璃窗（实心，仅观察不可达：L4 雾中城市 / L5 客房夜景）
  | 'rollerdoor' // 卷帘门（可交互开关，L1 通室外小巷）
  | 'glassdoor' // 玻璃门（可交互开关，L5 通庭院泳池）
  // v13 新增：多层结构
  | 'lift' // 载客电梯（交互后轿厢垂直送达另一层）

  // ===== v23：Level 6「Lights Out」 =====
  | 'hotpipe'      // 输送加热液体的金属管道（Fandom L6；黑暗中唯一的触觉导航线索）
  | 'lightswitch'  // 「世界最安静的房间」里的电灯开关——官方警告：不要拨
  | 'tripwire'     // 绊线（绊到即切出 Level 6.1）
  | 'braille'      // 墙面刻痕/盲文路标（前人留下的方向记号）
  // ===== v23：Level 7「Thalassophobia」 =====
  | 'bookcase'     // 入口房间的书柜（容器：来源不明的书）
  | 'barrel'       // 木桶（容器：杏仁水）
  | 'rockisle'     // 未知岩石构成的小岛
  | 'bonepile'     // 骨堆（容器；下颌增大、腿末端成鳍的类人骨架）
  | 'fishbones'    // 不可理解的巨鱼骨架（Midnight Zone）
  | 'seatarpit'    // 深渊焦油与岩石堆（持续冒泡）
  // ===== v23：Level 8「Cave Systems」 =====
  | 'stalagspike'  // 岩刺：各角度混乱突出、打结/锯齿/分叉
  | 'handspike'    // Handyland 手形岩刺（带指纹）+ 血红色发光苔藓
  | 'glowshroom'   // Rottnest Jungle 多彩生物发光蘑菇（可长到小树大小）
  | 'tarhands'     // 焦油之手（95°C 焦油池，伸出覆满焦油的手臂拖人）
  | 'roadsign'     // 第九之路路标（每 50 米一个，带 M.E.G. 标志）
  | 'campstall'    // Hollow Nest / Harmouth 营地摊位（补给与向导）
  // ===== v23：Level 9「The Suburbs」 =====
  | 'house'        // 郊区房屋（有家具、但没有电）
  | 'streetlamp'   // 路灯（多数熄灭，少数闪烁/常亮）
  | 'mailbox'      // 信箱（容器）
  | 'picketfence'  // 白色栅栏
  | 'clipfuse'     // 两栋"卡模"嵌套在一起的房子（空间异常地标）
  | 'playpipe'     // 游乐场管道结构（内部发白光）
  // ===== v23：Level 10「Bumper Crop」 =====
  | 'wheatpatch'   // 小麦/大麦丛
  | 'hedgerow'     // 分隔地块的树篱（永远同一高度）
  | 'barn'         // 谷仓 / 马厩（木材与钉子）
  | 'canolaplot'   // 罕见的油菜地块（刺眼的黄，是一扇门）
  // ===== v23：Level 11「The City That Never Sleeps」 =====
  | 'towerblock'   // 混凝土峭壁般的楼体
  | 'blackwindow'  // 暗淡的黑色镀膜镜面窗（只反射，看不到室内）
  | 'shopfront'    // 带招牌的店面（招牌即传送门线索）
  | 'subwayent'    // 地铁入口
  | 'arcadecab'    // 位置不合常理的街机柜（任何交互都送你去 Level 25）
  | 'megsign'      // M.E.G. 标记与路牌
  // ===== v23：Level 601「The End」 =====
  | 'libshelf'     // 近乎无限的图书馆书架
  | 'endletters'   // 中央金属字母：the end is near
  | 'homedoor'     // 「家门」——为闯入者量身定制的假现实入口
  // ===== v23：通用新容器（物品生成容器化）=====
  | 'locker'       // 储物柜
  | 'toolbox'      // 工具箱
  | 'suitcase'     // 行李箱 / 背包
  | 'fridge'       // 冰箱 / 冷柜
  | 'safebox'      // 保险箱（需撬棍）

export interface Structure {
  kind: StructKind
  x: number
  y: number
  w: number
  h: number
  solid: boolean
  looted?: boolean
  locked?: boolean
  floor?: number // v13：所属楼层（0=主层，1=上层；缺省 0）。lift 跨层不设
  data?: Record<string, number | string | boolean | string[]>
}

export interface GroundItem {
  id: number
  type: string
  x: number
  y: number
  fake?: boolean
  z?: number // v13：所在高度（米；缺省=所在地面高度，上层物品=FLOOR_H）
}

export interface LightSource {
  x: number
  y: number
  r: number
  color: string
  flickerSeed: number
  z?: number // v13：灯具高度基准（米；缺省按层高/室外规则）
  gen?: number // v17：无限模式标记——1=chunk 生成器固有灯（窗口迁移不需另存）；缺省=玩家/事件追加
}

// v7 数据契约：GameMap 含 elev（0正常/1低洼-1.2m/2高台+1.2m/3室外地面）与 outdoor（0室内/1室外），
// 定义于 mapgen.ts，此处类型再导出便于 UI 层统一从 types 引用
export type { GameMap } from './mapgen'
