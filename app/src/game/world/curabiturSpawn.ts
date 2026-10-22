// 受眷鸟（Entity 37）L8 生成后处理：在 genL8ChunkRaw 返回前调用一次（// [L8-curabitur]）。
// 这个文件会进 chunk worker：只依赖纯常量与哈希，不引入实体注册表、three 或引擎。
// 所有判定都用 h32 哈希，不消耗生成器的 rng，所以不会打乱同一区块里其他内容的随机序列。
//
// 做三件事：
// 1. 把原生成表放下的受眷鸟挪到「洞顶够高」的位置（洞顶-地面 ≥ minClearance）；附近找不到就删掉。
// 2. 普通生成组的栖点下方以 roostGelChance 的概率放一罐受眷胶（「巢穴附近小概率拾取」）。
// 3. 星群：每个区块 swarmChance（0.5%）概率生成 12–16 只聚在一起的受眷鸟。
import type { GroundItem } from '../core/types'
import { CB_ITEM, CURABITUR } from '../engine/curabiturTuning'
import { h32 } from './infiniteSeed'

const CS = 32 // 与 world/infinite.ts 的 CS 一致（这里不 import infinite，避免把整个流式世界拖进 worker 依赖）
const GEN_ITEM_BASE = 0x200000 // 同 world/infinite.ts
const h01 = (...n: number[]) => h32(...n) / 4294967296

export type SurfaceFn = (seed: number, wx: number, wy: number) => number
export interface CurabiturRawEntity { type: string; x: number; y: number; z?: number; scale?: number }

/** 星群判定（纯函数，验收脚本直接抽样统计概率） */
export function curabiturSwarmRoll(seed: number, cx: number, cy: number): boolean {
  if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) return false // 出生湖厅不出星群
  return h01(seed, 0x8c73, cx, cy) < CURABITUR.swarmChance
}
/** 栖点受眷胶判定 */
export function curabiturRoostGelRoll(seed: number, cx: number, cy: number): boolean {
  return h01(seed, 0x8c71, cx, cy) < CURABITUR.roostGelChance
}

/**
 * 在区块内找一个洞顶足够高的悬浮点：从 (nearX, nearY)（区块局部瓦片坐标）向外按方环搜索，步长 2 瓦片。
 * 要求：可走地面、不是地下湖、离岩壁 ≥ 1.3m、洞顶-地面 ≥ minClear。
 */
export function findHighSpot(seed: number, cx: number, cy: number, tiles: Uint8Array, liquid: Uint8Array,
  margin: SurfaceFn, ground: SurfaceFn, roof: SurfaceFn, nearX: number, nearY: number, minClear: number = CURABITUR.minClearance, maxR = 14) {
  const WX = cx * CS, WY = cy * CS
  for (let r = 0; r <= maxR; r += 2) for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
    const x = Math.round(nearX) + dx, y = Math.round(nearY) + dy
    if (x < 2 || y < 2 || x > CS - 3 || y > CS - 3) continue
    const i = y * CS + x
    if (tiles[i] !== 1 || liquid[i] === 1) continue
    const wx = WX + x + 0.5, wy = WY + y + 0.5
    if (margin(seed, wx, wy) < 1.3) continue
    const clear = roof(seed, wx, wy) - ground(seed, wx, wy)
    if (clear >= minClear) return { x: wx, y: wy, clear }
  }
  return null
}

export function curabiturChunkPass(seed: number, cx: number, cy: number, tiles: Uint8Array, liquid: Uint8Array,
  entities: CurabiturRawEntity[], items: GroundItem[], margin: SurfaceFn, ground: SurfaceFn, roof: SurfaceFn) {
  const WX = cx * CS, WY = cy * CS
  // 1. 挪到高洞顶处
  let roost: { x: number; y: number } | null = null
  for (let k = entities.length - 1; k >= 0; k--) {
    const e = entities[k]
    if (e.type !== 'curabitur') continue
    const spot = findHighSpot(seed, cx, cy, tiles, liquid, margin, ground, roof, e.x - WX - 0.5, e.y - WY - 0.5)
    if (!spot) { entities.splice(k, 1); continue }
    // 同组个体彼此错开约 1–2m，避免叠在同一点
    const a = h01(seed, 0x8c70, cx, cy, k) * Math.PI * 2, d = roost ? Math.min(1.2 + h01(seed, 0x8c74, cx, cy, k), Math.max(0, margin(seed, roost.x, roost.y) - 0.5)) : 0
    e.x = (roost?.x ?? spot.x) + Math.cos(a) * d; e.y = (roost?.y ?? spot.y) + Math.sin(a) * d
    roost ??= spot
  }
  // 2. 栖点受眷胶
  if (roost && curabiturRoostGelRoll(seed, cx, cy)) {
    const a = h01(seed, 0x8c75, cx, cy) * Math.PI * 2
    items.push({ id: GEN_ITEM_BASE + (h32(seed, 0x8c72, cx, cy) & 0xfffff), type: CB_ITEM.gel, x: roost.x + Math.cos(a) * 0.6, y: roost.y + Math.sin(a) * 0.6 })
  }
  // 3. 星群
  if (curabiturSwarmRoll(seed, cx, cy)) {
    const sx = 4 + (h32(seed, 0x8c76, cx, cy) % 24), sy = 4 + (h32(seed, 0x8c77, cx, cy) % 24)
    const spot = findHighSpot(seed, cx, cy, tiles, liquid, margin, ground, roof, sx, sy, CURABITUR.minClearance + 0.8, 16)
    if (spot) {
      const n = CURABITUR.swarmMin + (h32(seed, 0x8c78, cx, cy) % (CURABITUR.swarmMax - CURABITUR.swarmMin + 1))
      for (let k = 0; k < n; k++) {
        // 向日葵排布：一团而不重叠
        let rr = CURABITUR.swarmR * Math.sqrt((k + 0.5) / n)
        const a = k * 2.39996 + h01(seed, 0x8c79, cx, cy) * 6.28
        // 成员点落进岩壁或湖面时向中心收拢（最多收到 0.3m）
        for (; rr > 0.3; rr *= 0.6) {
          const lx = Math.floor(spot.x + Math.cos(a) * rr - WX), ly = Math.floor(spot.y + Math.sin(a) * rr - WY)
          const i = ly * CS + lx
          if (lx >= 0 && ly >= 0 && lx < CS && ly < CS && tiles[i] === 1 && liquid[i] !== 1 && margin(seed, WX + lx + 0.5, WY + ly + 0.5) > 0.7) break
        }
        entities.push({ type: 'curabitur', x: spot.x + Math.cos(a) * rr, y: spot.y + Math.sin(a) * rr, scale: 0.88 + h01(seed, 0x8c7a, cx, cy, k) * 0.2 })
      }
    }
  }
}
