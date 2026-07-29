// 多无限层级注册表（独立无依赖模块，避免 infinite.ts ↔ infiniteL1.ts 循环初始化 TDZ）
import type { LevelDef, Structure, GroundItem, LightSource, ExitInstance } from './types'

// chunk 原始生成数据（世界坐标内容；纯函数：同种子同坐标必一致）
export interface GenChunk {
  variant: string // 变体 id（L0=maze/pillars/… L1=aisle/parking/…）
  tiles: Uint8Array
  wet: Uint8Array
  elev: Uint8Array
  step: Uint8Array
  tint: Uint8Array
  structures: Structure[]
  items: GroundItem[]
  lights: LightSource[]
  exits: ExitInstance[]
  entities: { type: string; x: number; y: number }[]
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
