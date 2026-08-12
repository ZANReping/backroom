// 多无限层级注册表（独立无依赖模块，避免 infinite.ts ↔ infiniteL1.ts 循环初始化 TDZ）
import type { LevelDef, Structure, GroundItem, LightSource, ExitInstance } from '../core/types'
import type { NpcDef } from '../content/npcs' // 仅类型引用（编译期擦除，不产生运行时环）

// chunk 原始生成数据（世界坐标内容；纯函数：同种子同坐标必一致）
export interface GenChunk {
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
  structures: Structure[]
  items: GroundItem[]
  lights: LightSource[]
  exits: ExitInstance[]
  // v41：calm=实例级被动（L2 死亡飞蛾通常不主动攻击玩家）——instantiate 浅拷贝 def 置 passive
  // v44：scale=实例级体型缩放（L2 温顺死亡飞蛾 0.6）——instantiate 一并浅拷贝带入 def
  entities: { type: string; x: number; y: number; calm?: boolean; scale?: number; facing?: number; hostile?: 1; tool?: 1; l3face?: 1; human?: 1; capybara?: 1 }[] // v53 增：L3 高智能实体 raw 标记（hostile 剥除被动 / tool 石器 / l3face 错位器官 / human 伪装流浪者 / capybara 水豚形态）
  // v39：chunk 生成 NPC（BRC 员工随衔尾段 chunk 生成；定义完整内嵌，按 chunk 确定性生成）
  npcs?: { def: NpcDef; x: number; y: number; facing?: number }[]
  // v27：栖息地降级计数（`${type}:${habitat}` → 次数，与有限层 GameMap.habitatFallback 同契约）；
  // 无符合瓦片时降级 any 并在此计数，缝合进窗口时并入 m.habitatFallback
  habFallback?: Record<string, number>
}

export interface InfiniteLevelImpl {
  genRaw: (def: LevelDef, seed: number, cx: number, cy: number, forceVariant?: string) => GenChunk
  variantOf: (seed: number, cx: number, cy: number) => string
  rareVariants: readonly string[]
  variantNames: Record<string, string>
  variantLore: Record<string, string[]>
}

const implRegistry = new Map<number, InfiniteLevelImpl>()
export function registerInfiniteLevel(id: number, impl: InfiniteLevelImpl) { implRegistry.set(id, impl) }
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
