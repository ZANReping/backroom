// Level 0 任务探针：玩家所在区域类型（复用 l0Map.ts 的 L0_MAP_KEY 与区域栅格 mapRegions）、
// 红室入口拍照判定。只读运行时数据，不改世界。
import type { Engine } from '../engine'
import { redZonesNear, insideRedZone, type L0RedGate, type L0RedZone } from '../world/l0RedZone'
import { look } from '../renderer/shared'
import { l0GateObserved } from './l0State'

/** 区域 id（L0_MAP_KEY：0 黄室 1 柱厅 2 红室 3 熄灯区 4 深坑 5 拱门 6 马尼拉）。 */
export const L0R = { yellow: 0, pillars: 1, red: 2, blackout: 3, pit: 4, arch: 5, manila: 6 } as const

/** 世界格 (wx,wy) 的区域 id；未加载/不可走返回 null。 */
export function l0RegionAtWorld(eng: Engine, wx: number, wy: number): number | null {
  const inf = eng.map?.inf
  if (!inf?.l0) return null
  const ix = Math.floor(wx), iy = Math.floor(wy), cx = Math.floor(ix / 32), cy = Math.floor(iy / 32)
  const c = inf.chunks.get(`${cx},${cy}`)
  const regions = c?.l0?.mapRegions
  if (!c || !regions) return null
  const i = (iy - cy * 32) * 32 + ix - cx * 32
  // 深坑格是坑洞本身（tiles 仍为 1，地面在 -10m），这里不过滤 tiles 以便识别坑区
  if (c.tiles[i] !== 1 && regions[i] !== L0R.pit) return null
  return regions[i]
}

/** 玩家脚下区域 id。 */
export function l0RegionAtPlayer(eng: Engine): number | null {
  const inf = eng.map?.inf
  if (eng.player.level !== 0 || !inf?.l0) return null
  return l0RegionAtWorld(eng, eng.player.x + inf.ox, eng.player.y + inf.oy)
}

/** 本次探测到的区域类型集合：脚下区域；深坑是掉下去会摔死的坑洞，站到坑边（2 格内）即算到达深坑区。 */
export function l0RegionsHere(eng: Engine): number[] {
  const inf = eng.map?.inf
  if (eng.player.level !== 0 || !inf?.l0) return []
  const wx = eng.player.x + inf.ox, wy = eng.player.y + inf.oy
  const out: number[] = []
  const here = l0RegionAtWorld(eng, wx, wy)
  if (here !== null) out.push(here)
  if (here !== L0R.pit) {
    outer: for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (l0RegionAtWorld(eng, wx + dx, wy + dy) === L0R.pit) { out.push(L0R.pit); break outer }
    }
  }
  return out
}

function zonesAround(eng: Engine): L0RedZone[] {
  const inf = eng.map!.inf!
  const wx = eng.player.x + inf.ox, wy = eng.player.y + inf.oy
  const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32)
  const seen = new Map<string, L0RedZone>()
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const z of redZonesNear(inf.seed, cx + dx, cy + dy)) seen.set(z.id, z)
  return [...seen.values()]
}

/** 拍红室入口参数：距入口中心最远 RED_PHOTO_DIST 米、视线与入口方向夹角不超过 RED_PHOTO_CONE。 */
export const RED_PHOTO_DIST = 5
export const RED_PHOTO_CONE = 35 * Math.PI / 180

export interface RedEntranceShot { zone: string; gate: string; dist: number; angle: number }
/**
 * 拍照时是否拍到了红室入口：玩家在红室外（不在任何红室围合内、脚下不是区域 2），
 * 离某个仍开着的红室入口几米内，且大致面向它（并且入口没有被墙挡住）。
 */
export function redEntranceInShot(eng: Engine): RedEntranceShot | null {
  const inf = eng.map?.inf
  if (eng.player.level !== 0 || !inf?.l0) return null
  const px = eng.player.x + inf.ox, py = eng.player.y + inf.oy
  if (l0RegionAtWorld(eng, px, py) === L0R.red) return null
  const zones = zonesAround(eng)
  if (zones.some((z) => insideRedZone(z, px, py))) return null
  const fx = -Math.sin(look.yaw), fy = -Math.cos(look.yaw)
  let best: RedEntranceShot | null = null
  for (const z of zones) {
    const closed = inf.l0.redProgress?.[z.id]?.closed ?? []
    for (const g of z.gates as L0RedGate[]) {
      if (closed.includes(g.id)) continue
      const gx = g.x + g.w / 2, gy = g.y + g.h / 2
      const dx = gx - px, dy = gy - py, d = Math.hypot(dx, dy)
      if (d > RED_PHOTO_DIST) continue
      const ang = d < 0.6 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy) / d)))
      if (ang > RED_PHOTO_CONE) continue
      if (!l0GateObserved(eng, g)) continue
      if (!best || d < best.dist) best = { zone: z.id, gate: g.id, dist: d, angle: ang }
    }
  }
  return best
}
