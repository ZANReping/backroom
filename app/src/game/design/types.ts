// ================= v54：设计模式数据模型（DESIGN-GUIDE.md §1–§3 的 TypeScript 镜像）=================
// 「设计 JSON」是重制游戏内容的唯一事实来源：玩家在设计模式编辑布局/图鉴文案后导出，
// 再由落地流程逐条写回代码。本文件字段与 DESIGN-GUIDE.md 一一对应；
// 数据提取见 extractLayouts.ts / extractCodex.ts，导出组装见 buildDesignFile.ts。

/** 设计文件总格式（§1） */
export interface DesignFile {
  format: 'backroom-design/v1' // 版本标识；不一致先停下核对
  exportedAt: string // 导出时间（ISO 8601）
  layouts?: LayoutEntry[] // 布局条目（§2）
  codex?: CodexEntry[] // 图鉴文案条目（§3）
}

/** 布局条目类别：outpost=据点 / prefab=预制件 / variant=无限层变体（32×32 chunk） */
export type LayoutKind = 'outpost' | 'prefab' | 'variant'

/** 楼梯坡道格：dir 1东 2西 3南 4北；lo/hi=坡道两端高度（米，如 0→3 表示主层→2F 板顶） */
export interface StairEntry {
  x: number
  y: number
  dir: number
  lo: number
  hi: number
  onRandomSample?: boolean // v54：随机样例上的新增/修改（见 StructEntry.onRandomSample）
  remove?: boolean // v54：墓碑标记（随机样例上「删除」决定性对象）
}

/** 结构实例：data.deg 提升为顶层 deg 字段（度，逆时针），其余 data 原样透传不删改 */
export interface StructEntry {
  kind: string
  x: number
  y: number
  w: number
  h: number
  solid: boolean
  floor?: number // 所属楼层（0=主层 1=2F 2=3F；缺省 0）
  deg?: number // 朝向（度；源数据 data.deg）
  data?: Record<string, number | string | boolean | string[]> // 其余 data 原样
  /** v54：随机生成物标记（变体 chunk 内概率摆放的结构；缺省/false=决定性摆放）。
   *  随机对象不写死坐标——复刻时只调生成率（chance/spawnRules），见 DESIGN-GUIDE §2 规则 7 */
  random?: boolean
  chance?: number // 该对象的生成概率（生成器源码审计值；无固定概率=次数随机，缺省）
  /** v54：在随机样例（randomized 布局）上做的新增/修改——复刻时必须写进生成器保证必出
   *  （或按 customNote 调整生成规则）；样例其余内容不得照抄坐标，见 DESIGN-GUIDE §2 规则 7 */
  onRandomSample?: boolean
  remove?: boolean // v54：随机样例上「删除」一个决定性对象的墓碑标记（样例不能照抄，故以标记表达）
}

/** NPC 落位：floor=所在层 0/1/2 */
export interface NpcEntry {
  id: string // 注册表 id；'random'=随机居民槽（flavor 指定池）；'new:<名字>'=全新固定 NPC（newNpc 带设定）
  x: number
  y: number
  floor: number
  flavor?: string // v54：随机居民池风味（meg/bntg/ariane/mixed/el3a=genRandomNpcs 池；jerry=jerryFollowerDef 池；brc=brcWorkerDef 池）
  newNpc?: { name: string; role: string; desc: string } // v54：全新固定 NPC 设定（落地时先注册 content/npcs.ts 再落位）
  random?: boolean // v54：随机生成的 NPC（变体 chunk 内按概率/数量生成）
  onRandomSample?: boolean // v54：随机样例上的新增/修改（见 StructEntry.onRandomSample）
  remove?: boolean
}

/** 实体实例：marks=chunk raw 标记（calm/scale/hostile/tool/l3face/human/capybara，仅记录存在的标记） */
export interface EntityEntry {
  type: string
  x: number
  y: number
  marks?: Record<string, number | boolean>
  random?: boolean // v54：随机生成（变体 chunk 实体基本都是；见 StructEntry.random 规则）
  chance?: number
  onRandomSample?: boolean // v54：随机样例上的新增/修改
  remove?: boolean
}

/** 光源（z=灯具高度基准 / fixZ=绝对安装高度，缺省按层高规则） */
export interface LightEntry {
  x: number
  y: number
  r: number
  color: string
  z?: number
  fixZ?: number
  onRandomSample?: boolean // v54：随机样例上的新增/修改
  remove?: boolean
}

/** 地面物品（预制件/变体的固定物资落位） */
export interface ItemEntry {
  type: string
  x: number
  y: number
  random?: boolean // v54：随机生成物（见 StructEntry.random 规则）
  chance?: number
  onRandomSample?: boolean // v54：随机样例上的新增/修改
  remove?: boolean
}

/** 出口实例：dest=目标层级 id 或 'random'/'win'/'back'（back=返回进入据点前的层级） */
export interface ExitEntry {
  kind: string
  name: string
  dest: number | 'random' | 'win' | 'back'
  x: number
  y: number
  onRandomSample?: boolean // v54：随机样例上的新增/修改
  remove?: boolean
}

/** 区域名标注（点标注：x,y=标注中心，z=楼层带 0主层/1上层/2三层；
 *  v54：可选矩形范围 x0/y0/x1/y1——玩家落在矩形内（同楼层带）优先显示该区域名，缺省=点标注） */
export interface ZoneEntry {
  name: string
  x: number
  y: number
  z: number
  x0?: number
  y0?: number
  x1?: number
  y1?: number
}

/** 生成概率规则：key=「文件.语义」风格（映射生成器中的具名常量或调用点），note=中文说明 */
export interface SpawnRule {
  key: string
  value: number | string
  note: string
}

/** 布局条目（§2）。缺省字段=保持现状；空数组=清空该部分。 */
export interface LayoutEntry {
  kind: LayoutKind
  id: string // outpost=content/outposts.ts 键；prefab=prefabs 的 id；variant="l0:manila" 形式
  name: string // 显示名
  level: number // 所属主层级
  size: [number, number] // 瓦片宽×高（variant 固定 32×32 chunk）
  /** v54：纯随机布局标记（variant 必为 true）——tiles/结构等只是「某一样子」，
   *  复刻只改生成器概率/规则参数（spawnRules/chance），不写死坐标；seed=本样例的采样种子 */
  randomized?: boolean
  seed?: number
  customNote?: string // v54：玩家自由文本修改要求（如「圣所大门改成双开」；Agent 逐条落实或提出疑问）
  tiles: string[] // 主层（1F）瓦片行：'#'=墙 '.'=地板；行=y 递增，字符=x 递增
  up?: string[] // 2F 楼板格（'#'=有楼板）；多层同理 up2=3F
  upWall?: string[] // 2F 墙体；upWall2=3F 墙体
  up2?: string[]
  upWall2?: string[]
  stair?: StairEntry[] // 楼梯坡道格
  structures?: StructEntry[]
  npcs?: NpcEntry[]
  entities?: EntityEntry[]
  items?: ItemEntry[] // 固定物品落位（预制件/变体；§2 未列，提取时一并导出供参考）
  lights?: LightEntry[]
  exits?: ExitEntry[]
  zones?: ZoneEntry[]
  floors?: number // 可行走楼层总数（缺省 1）
  spawnRules?: SpawnRule[]
}

/** 图鉴文案条目类别（§3 的 8 类；v54 任务1：cecs 评分已并入 entity/level/item 条目的 fields） */
export type CodexKind =
  | 'entity' | 'item' | 'level' | 'phenomenon' | 'faction' | 'outpost' | 'npc' | 'doc'

/**
 * 图鉴文案条目（§3）：fields 键=源文件字段点号路径（嵌套用点号，数组用数字下标），
 * 值=完整替换文本（不是 diff）。cecs 类为评分数据（codexScores.ts；v54 起可编辑，映射见 §3 附表）。
 */
export interface CodexEntry {
  kind: CodexKind
  id: string
  fields: Record<string, string | number>
  /** v54 任务2：新建条目（设计模式「新建」产生；落地=按 DESIGN-GUIDE §3 新建条目注册流程创建） */
  new?: boolean
  generate?: 'fromDescription' | 'auto' // fromDescription=Agent 依 fields.name/desc 生成全部设定；auto=完全自动生成
}
