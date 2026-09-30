// World-space architecture. Each 80m district has one 40×40m void sea (25%).
// The remaining rectangular office wings form a connected land network.
import { h32 } from './infinite'
import type { GameMap } from './mapgen'
export type L4Variant = 'officehall' | 'open' | 'windowview' | 'smallrooms'
export const L4_CELL = 20
export const L4_HEIGHT = 2.9
export const l4Cell = (v: number) => Math.floor((v - 13) / L4_CELL)
export const l4Origin = (k: number) => 13 + k * L4_CELL
export function l4VoidCell(seed: number, k: number, r: number) {
  const mx = Math.floor(k / 4), my = Math.floor(r / 4)
  // A one-cell land margin on at least two sides prevents isolated islands.
  const sx = 1 + h32(seed, 0x4a01, mx, my) % 2
  const sy = 1 + h32(seed, 0x4a02, mx, my) % 2
  return k - mx * 4 >= sx && k - mx * 4 < sx + 2 && r - my * 4 >= sy && r - my * 4 < sy + 2
}
export const l4VoidAt = (seed: number, x: number, y: number) => l4VoidCell(seed, l4Cell(x), l4Cell(y))
export function l4Coast(seed: number, k: number, r: number) {
  return [l4VoidCell(seed,k,r-1),l4VoidCell(seed,k+1,r),l4VoidCell(seed,k,r+1),l4VoidCell(seed,k-1,r)]
}
export function l4Biome(seed: number, k: number, r: number): L4Variant {
  if(k===0&&r===0)return 'officehall'
  if(l4Coast(seed,k,r).some(Boolean)&&h32(seed,0x4b12,k,r)%100<38)return 'windowview'
  const n=h32(seed,0x4b13,Math.floor(k/2),Math.floor(r/2))%100
  return n<38?'officehall':n<68?'open':'smallrooms'
}
export const L4_TINT: Record<L4Variant,number> = {officehall:51,open:52,windowview:53,smallrooms:54}
export function l4StyleAt(m: GameMap,x:number,y:number):L4Variant {
  const t=m.tint[Math.floor(y)*m.w+Math.floor(x)]
  return t===53?'windowview':t===52?'open':t===54?'smallrooms':'officehall'
}
