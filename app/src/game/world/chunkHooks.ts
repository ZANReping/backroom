// [creeper] 无限层 chunk 实体实例化后的钩子（不引入任何模块，避免 world/infinite ↔ engine 的循环导入）。
// engine/creeperAI 在模块加载时登记：按比例把尸鼠 / 蛛形纲替换成爬菌感染体、极罕见注入爬菌人。
import type { Entity } from '../entities/types'
export type ChunkSpawnHook = (levelId: number, seed: number, cx: number, cy: number, CS: number, tiles: ArrayLike<number>, entities: Entity[], ox: number, oy: number) => void
export const CHUNK_SPAWN_HOOKS: ChunkSpawnHook[] = []
