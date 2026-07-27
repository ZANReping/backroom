// 预制件公共类型与内容辅助（墙壁/装饰/实体/物品位置固定设计）
import { RNG } from '../rng'
import type { GameMap } from '../mapgen'
import type { Structure, StructKind } from '../types'

export const idx = (m: { w: number }, x: number, y: number) => y * m.w + x
export const isFloor = (m: GameMap, x: number, y: number) =>
  x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[idx(m, x, y)] === 1

interface FillCtx {
  m: GameMap
  rng: RNG
  x: number // 房间左上角
  y: number
  w: number
  h: number
  doorX: number // 门洞瓦片（房间边缘）
  doorY: number
}

export interface PrefabDef {
  id: string
  name: string
  prob: number // 生成概率（1 = 100%）
  min: number
  max: number
  w: number
  h: number
  // carve=向墙区开洞造房（默认）；overlay=植入既有开阔区域（迷宫/停车场等无厚墙区的层级）
  mode?: 'carve' | 'overlay'
  fill: (c: FillCtx) => void
}

// ---------- 预制件内容辅助 ----------
export function S(c: FillCtx, kind: StructKind, x: number, y: number, w: number, h: number, solid: boolean, data?: Structure['data']) {
  // prefabmark 附带预制件矩形（mapgen 可达性校验/孤岛移除用）
  if (kind === 'prefabmark') data = { ...data, rx: c.x, ry: c.y, rw: c.w, rh: c.h }
  c.m.structures.push({ kind, x: c.x + x, y: c.y + y, w, h, solid, data })
}
export function light(c: FillCtx, x: number, y: number, r: number, color: string) {
  c.m.lights.push({ x: c.x + x, y: c.y + y, r, color, flickerSeed: c.rng.next() * 100 })
}
export function drop(c: FillCtx, type: string, x: number, y: number) {
  c.m.items.push({ id: 900000 + c.m.items.length * 13 + Math.floor(c.rng.next() * 7), type, x: c.x + x, y: c.y + y })
}
