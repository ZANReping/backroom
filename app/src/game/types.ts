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
  dest: number | 'random' | 'win' | 'back' // back=返回进入据点前的层级（engine.outpostReturn）
  anim: ExitAnim
  req?: { fuses?: number; keycard?: boolean; lever?: boolean; tapes?: number; rope?: boolean; lantern?: boolean }
  reqText?: string
  fallDamage?: number
  /** v23：切入演出（进入下一层时播放的过场类型），缺省按目标层 entryAnim */
  cutIn?: CutInKind
}

/** v23 切入（进入层级）过场类型；v35 追加 'outpost'（抵达据点：路标汇拢 + 暖光亮起） */
export type CutInKind = 'fall' | 'collapse' | 'wade' | 'crawl' | 'step' | 'surface' | 'dark' | 'outpost'

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
    // v35：据点（完全手工布局的特殊小层级，mapgenOutpost.ts）
    | 'outpost'
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
  /** 层级短标签（缺省=`Level ${displayId ?? id}`）。据点等专有名称层级用（如「Alpha 基地」） */
  label?: string
  /** 进入本层即获得完整地图（据点：规模有限且对居民开放） */
  fullMap?: boolean
  /** 官方生存难度分级（Survival Difficulty，wiki 卡片） */
  sd?: string
  /** 光照系数：所有光源半径/强度倍率。L6=0（外带光源完全失效）、L8=0.12（100 流明只剩 12 流明） */
  lightMul?: number
  /** 灯光柔和度：点光源强度倍率（<1 更柔和；配合更密的保底光源让照度更均匀）。L0=0.7 */
  lightSoft?: number
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
  | 'rebar' // 突出墙壁的锈蚀钢筋（L1：靠近划伤，wikidot/Fandom 破伤风梗）
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
  // ===== v30：Level 1 区段扩展（天鹰/跃金/哥特/衔尾/花园/维护通廊）=====
  | 'column'       // 哥特段圆柱（圆形石柱）
  | 'roundarch'    // 哥特段圆形拱门（半圆拱顶，非实心，可从拱洞穿行）
  | 'vaultcol'     // 哥特段拱顶柱（v34：粗圆柱 + 柱顶喇叭展开，可按 data.archX/archY 伸出连拱板）
  | 'scaffold'     // 衔尾段脚手架（杆件框架 + 踏板）
  | 'roadblock'    // 衔尾段施工路障（条纹护栏）
  | 'debrispile'   // 衔尾段建材碎料堆（砖块/木板/沙堆；非容器，不阻挡通行）
  | 'inkdoor'      // 维护通廊墨黑色金属门框（非实心，可通行）
  | 'megdoc'       // M.E.G. 文档（可交互打开文档视图；查看后存入图鉴「文档」）
  // ===== v33：Level 1 实体扩展 =====
  | 'ceilvent'     // 自天花板向下伸出的通风管道（停电时「手臂」由此伸出猎捕）
  | 'landmark'     // 定居点地标（亮色布料挂物资+纸条；交互显示据点介绍，可前往对应据点）
  // ===== v35：据点（Alpha 基地）家具 =====
  | 'serverrack'   // 中控室无线电机柜（表盘/指示灯/线缆）
  | 'officechair'  // 办公转椅
  | 'binshelf'     // 储物货架（蓝灰收纳箱）
  | 'bunkbed'      // 双层床（民居）
  | 'screenboard'  // 投影幕 + 黑板（会议室/教室，贴墙）
  | 'noticeboard'  // 软木公告栏（据点墙面装饰）
  | 'megposter'    // M.E.G. 标语海报（据点墙面装饰）
  | 'photo'        // 相片（据点墙面装饰）
  | 'shopsign'     // 悬挂店招（市场街/大厅：吊杆 + 贴图招牌板 + 描边灯）
  | 'ventgrate'    // 天花板通风口格栅（仅通风口，无整条管道）
  // ===== v36：商人之家商场风装饰 =====
  | 'bench'        // 商场长椅（木座面 + 靠背 + 金属短腿）
  | 'planter'      // 花坛（矮石框 + 泥土 + 绿植）
  | 'trashbin'     // 商场垃圾桶（金属圆筒 + 深色投口）
  // ===== v37：希波克拉底 - 1（阿丽亚娜集团据点）医疗家具 =====
  | 'hospitalbed'  // 病床（金属框 + 白床垫 + 枕头 + 床头摇起）
  | 'ivstand'      // 输液架（立杆 + 挂钩 + 半透明输液袋）
  | 'medcabinet'   // 药品柜（白柜 + 玻璃门 + 紫十字）
  | 'labbench'     // 实验台（台案 + 显微镜 + 试管组 + 烧杯）
  | 'specimentank' // 标本罐（玻璃圆筒 + 半透明自发光液体 + 内部样本块）
  // ===== v38：Tom 的餐馆（独立餐馆据点）家具 =====
  | 'stove'        // 灶台（不锈钢灶 + 四个炉眼 + 锅 + 防油背板）
  | 'kcounter'     // 厨房料理台（台面 + 橱柜 + 挂勺/刀架）
  | 'sink'         // 水槽（台盆 + 水龙头）
  | 'freezer'      // 卧式冷冻柜（白柜 + 顶盖；非容器——据点禁用 loot 容器）
  | 'dtable'       // 餐桌（白桌布圆桌 + 餐盘餐具 + 小烛台 + 对侧两把餐椅）
  // ===== v41：Level 2「废弃公共带」无限化 =====
  | 'bigcomputer'  // 大号台式电脑（大机箱 + CRT 微光屏 + 键盘；L2 电脑房）
  | 'scrap'        // 碎金属堆（扭曲金属片 + 短管；肮脏的廊道地面散件，非容器不阻挡）
  // ===== v42：Level 2 墙面段 =====
  | 'machinewall'  // 代墙大型机器（整段代替 L2 廊道墙面：data.mv 0 锅炉/1 发电机组/2 主发电机/3 机柜排/4 变压器）
  // ===== v43：办公区EL3A（BNTG 双层据点）仓储家具 =====
  | 'pallet'       // 木托盘堆（木托盘 + 缠绕膜包裹的箱堆；仓库装饰，非容器）
  | 'handrail'     // 扶手栏杆（夹楼边缘/阶梯两侧：立柱 + 横杆；v46 实心化——细条碰撞盒真实阻挡；
                   // v49 斜扶手——data.h0/h1=坡道面在瓦片局部 -x/+x 端的高度[相对结构底座]，扶手旋转对齐坡角）
  // ===== v46：办公区EL3A 真多层重排 =====
  | 'walllamp'     // 壁挂斜照大灯（贴墙灯箱向下投光 + 配套光源；挑高仓库区照明，非实心）
  // ===== v45：Level 274「杰瑞的房间」（教堂风穹顶主间）=====
  | 'domering'     // 教堂穹顶（置于大厅中央，非实心：同心环形肋 + 放射拱肋 + 顶心圣辉盘；data.r=半径 data.apex=顶高）
  | 'perch'        // 杰瑞的栖木（立柱 + 顶部横杆 + 金饰托盘；鹉主 Entity 7 栖息其上）
  // ===== v47：Level 274 教堂细化（居住区 + 教堂房间/装饰）=====
  | 'pulpit'       // 讲坛（高台 + 斜面讲案 + 金饰鹉徽；data.deg 朝向，缺省朝南）
  | 'candlestand'  // 烛台（细杆三臂烛架 + 自发光烛火，非实心）
  | 'holyfont'     // 圣水盆（石盆 + 蓝色圣水微光；杰瑞的信众以蓝为圣色）

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
  count?: number // 堆叠数量（玩家整叠丢弃时保留；缺省=1）
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
  fixZ?: number // v46：灯具绝对安装高度（米；壁灯/立灯用——光源点取 fixZ-0.2，与 z 互斥，z 优先）
  noFix?: 1 // v46：不渲染默认自发光灯具盒（实体灯具由结构模型提供——walllamp/立灯，杜绝悬空灯）
  gen?: number // v17：无限模式标记——1=chunk 生成器固有灯（窗口迁移不需另存）；缺省=玩家/事件追加
  keep?: 1 // v29：停电保留灯（L1 维护通廊：永远灯火通明，停电事件/熄灯 stitch 均不熄灭）
}

// v7 数据契约：GameMap 含 elev（0正常/1低洼-1.2m/2高台+1.2m/3室外地面）与 outdoor（0室内/1室外），
// 定义于 mapgen.ts，此处类型再导出便于 UI 层统一从 types 引用
export type { GameMap } from './mapgen'
