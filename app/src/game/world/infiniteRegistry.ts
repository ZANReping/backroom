// 多无限层级注册表（独立无依赖模块，避免 infinite.ts ↔ infiniteL1.ts 循环初始化 TDZ）
import type { LevelDef, Structure, GroundItem, LightSource, ExitInstance } from '../core/types'
import type { NpcDef } from '../content/npcs' // 仅类型引用（编译期擦除，不产生运行时环）

// chunk 原始生成数据（世界坐标内容；纯函数：同种子同坐标必一致）
export interface GenChunk {
  l0?: import('./l0Architecture').L0Layout
  variant: string // 变体 id（L0=maze/pillars/… L1=aisle/parking/…）
  tiles: Uint8Array
  wet: Uint8Array
  elev: Uint8Array
  step: Uint8Array
  tint: Uint8Array
  crawl: Uint8Array // v41：蹲伏低通道（L2 扭曲的廊道横穿管道；L0/L1 恒全 0）
  outdoor?: Uint8Array // v54：室外瓦片（L4 窗景区窗外虚空条带；其余层级缺省=全室内）
  ceiling?: Uint8Array // v54：挑高瓦片（L5 主厅 ceiling=1；缺省=全部正常层高）
  liquid?: Uint8Array // v54：液体瓦片（L5 室内泳池 1=深水/2=浅水，同有限层 m.liquid 契约；缺省=无液体）
  dn?: Uint8Array // v56 九轮：地下可走地板瓦片（L6 -1F 走廊；缺省=全 0）
  dnWall?: Uint8Array // v56 九轮：地下墙体瓦片（L6 -1F；缺省=全 0）
  up?: Uint8Array // v57m：上层楼板瓦片（L7 入口舱体位于 2F；其余层级缺省）
  upWall?: Uint8Array // v57m：上层墙体瓦片（L7 入口舱体墙壁；缺省=全 0）
  up2?: Uint8Array
  upWall2?: Uint8Array
  stair?: Uint32Array
  terrain?: Float32Array // 室外自然地形微起伏（米；缺省=0）
  /** L8 有机洞穴的绝对洞顶高度；与 terrain 共用世界坐标连续采样。 */
  caveCeil?: Float32Array
  seaFloor?: Float32Array // v57o：每瓦片海床深度（米，水面以下；L7 垂直深度轴；缺省=1.7）
  structures: Structure[]
  items: GroundItem[]
  lights: LightSource[]
  exits: ExitInstance[]
  // v41：calm=实例级被动（L2 死亡飞蛾通常不主动攻击玩家）——instantiate 浅拷贝 def 置 passive
  // v44：scale=实例级体型缩放（L2 温顺死亡飞蛾 0.6）——instantiate 一并浅拷贝带入 def
  entities: {
    type: string; x: number; y: number; z?: number; calm?: boolean; scale?: number; facing?: number
    hostile?: 1; tool?: 1; l3face?: 1; human?: 1; capybara?: 1
    ceilingCrawler?: 1
    arachnidMorph?: 'spider' | 'scorpion' | 'tick' | 'mite'
    arachnidBreed?: number
    herbivore?: 1
    mothNest?: string
    mothForm?: import('../entities/types').MothForm
  }[] // v60：L8 增加洞顶尸鼠与蛛形纲实例生态变体
  // v39：chunk 生成 NPC（BRC 员工随衔尾段 chunk 生成；定义完整内嵌，按 chunk 确定性生成）
  npcs?: { def: NpcDef; x: number; y: number; facing?: number }[]
  // v27：栖息地降级计数（`${type}:${habitat}` → 次数，与有限层 GameMap.habitatFallback 同契约）；
  // 无符合瓦片时降级 any 并在此计数，缝合进窗口时并入 m.habitatFallback
  habFallback?: Record<string, number>
}

/**
 * 体积洞穴的一根世界坐标采样柱。margin 是未计圆角/三维岩面噪声前的水平净空，
 * floor/ceiling 是洞底与洞顶的基准包络；真正可见边界由 field=0 唯一决定。
 */
export interface CaveVolumeColumn {
  floor: number
  ceiling: number
  margin: number
  rounding?: number
}

export interface CaveVolumeMaterialDef {
  texture: string
  normalTexture?: string
  roughnessTexture?: string
  color?: string
  textureScale?: number
  normalStrength?: number
  roughness?: number
  envBase?: number
}

/**
 * 可复用的洞穴类层级契约：正场值为空气，负场值为岩体。
 * 渲染器、脚底/洞顶高度和玩家三维碰撞必须读取同一套函数，禁止再拆成地板/墙/顶三套几何。
 */
export interface CaveVolumeDef {
  column: (seed: number, worldX: number, worldZ: number) => CaveVolumeColumn
  field: (seed: number, worldX: number, worldY: number, worldZ: number, column?: CaveVolumeColumn) => number
  ground: (seed: number, worldX: number, worldZ: number) => number
  roof: (seed: number, worldX: number, worldZ: number) => number
  horizontalSegments?: number
  verticalMin?: number
  verticalMax?: number
  verticalStep?: number
  texture?: string
  color?: string
  /** 生态/地质带专属 PBR 岩石；键与 chunk variant 一致。 */
  materials?: Record<string, CaveVolumeMaterialDef>
}

export interface InfiniteLevelImpl {
  genRaw: (def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string) => GenChunk
  variantOf: (seed: number, cx: number, cy: number) => string
  rareVariants: readonly string[]
  variantNames: Record<string, string>
  variantLore: Record<string, string[]>
  /** 固定出生点（世界瓦片坐标；缺省=世界原点 chunk 中心 15,15）。Level 7 用它把出生点锁在入口房间内。 */
  spawnWorld?: { x: number; y: number }
  /** 固定出生楼层带（缺省 0=主层）。Level 7 入口舱体位于 2F，设为 1。 */
  spawnFloor?: -1 | 0 | 1 | 2
  /** v57t：轻量解析式区域出口锚点（不生成完整 chunk；L7 稀有出口用，避免 HUD 出口指引每次全量生成宿主 chunk）。 */
  regionExitPos?: (seed: number, rx: number, ry: number) => { x: number; y: number; z?: number } | null
  /** 新洞穴类层级模式：三维隐式场一次生成洞底、侧壁和洞顶。 */
  caveVolume?: CaveVolumeDef
}

const implRegistry = new Map<number, InfiniteLevelImpl>()
const implRevisions = new Map<number, number>()
export function registerInfiniteLevel(id: number, impl: InfiniteLevelImpl) { implRegistry.set(id, impl); implRevisions.set(id, (implRevisions.get(id) ?? 0) + 1) }
export function infiniteImplRevision(id: number) { return implRevisions.get(id) ?? 0 }
export function infiniteImplFor(id: number): InfiniteLevelImpl {
  const impl = implRegistry.get(id)
  if (!impl) throw new Error(`无限层级 ${id} 未注册 chunk 生成器`)
  return impl
}

// v55：床类朝向助手（任务8）——床头一侧靠墙。data.deg=床头朝向（0=南+y 90=东+x 180=北-y 270=西-x，
// 床头板所在端=朝向端；渲染层按 (deg+180)° 旋转——床模型床头一律建在局部 -z）。
// 竖放床（h>w）只看北/南端靠墙；横放只看西/东端；方形床四端按 北→南→西→东 取第一面墙；无墙返回 null（保持缺省朝向）。
export function bedHeadDeg(isWall: (x: number, y: number) => boolean, x: number, y: number, w: number, h: number): number | null {
  const n = isWall(x, y - 1), s = isWall(x, y + h), wst = isWall(x - 1, y), e = isWall(x + w, y)
  if (h > w) { if (n) return 180; if (s) return 0 }
  else if (w > h) { if (wst) return 270; if (e) return 90 }
  else { if (n) return 180; if (s) return 0; if (wst) return 270; if (e) return 90 }
  return null
}
