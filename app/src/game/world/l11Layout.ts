// Pure, world-coordinate city grammar. Safe to import from workers and headless checks.
export const L11_CS = 32
export const L11_VERSION = 1
export type L11Variant = 'lowrise' | 'apartments' | 'mixed' | 'highrise' | 'industrial' | 'park' | 'transit' | 'capital' | 'timesquare'
export type L11EntrySource = 9 | 10 | 'beta' | 'default'
export const L11_VARIANT_NAMES: Record<L11Variant, string> = {
  lowrise: '低层住宅区', apartments: '中层公寓区', mixed: '混合街区', highrise: '高层办公区',
  industrial: '工业与运河区', park: '市政公园区', transit: '交通枢纽区', capital: '首都', timesquare: '新时代广场',
}
export const L11_VARIANT_LORE = Object.fromEntries(Object.entries(L11_VARIANT_NAMES).map(([k, v]) => [k, [
  `${v}：街道、建筑与城市设施始终运转。转过身后，有些细节似乎不再一样。`,
]]))
export const l11Hash = (...ns: number[]) => {
  let h = 0x811c9dc5
  for (const n of ns) { h ^= n >>> 0; h = Math.imul(h, 0x01000193); h ^= h >>> 13; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 16 }
  return h >>> 0
}
export const l11Rand = (...n: number[]) => l11Hash(...n) / 4294967296
const mod = (a: number, b: number) => ((a % b) + b) % b
const cuts = [16, 112, 208, 336, 432, 528]
export interface L11Axis { lo: number; hi: number; road: number; width: number; distance: number; block: number }
export function l11Axis(p: number): L11Axis {
  const m = Math.floor((p - 16) / 512), q = p - m * 512
  let k = 0
  while (k < 4 && q >= cuts[k + 1]) k++
  const lo = m * 512 + cuts[k], hi = m * 512 + cuts[k + 1]
  const nearLo = p - lo < hi - p, edge = nearLo ? k : k + 1
  const road = nearLo ? lo : hi, width = edge === 0 || edge === 2 || edge === 5 ? 16 : 10
  return { lo, hi, road, width, distance: Math.abs(p - road), block: m * 5 + k }
}
export const L11_SPAWNS = { 9: { x: 26.5, y: 48.5 }, 10: { x: 48.5, y: 26.5 }, beta: { x: 55.5, y: 42.5 }, default: { x: 26.5, y: 26.5 } }
export function l11Anchors(seed: number) {
  return {
    capital: { x: 272 + (l11Hash(seed, 101) % 2) * 512, y: 272, radius: 112 },
    timesquare: { x: -240 - (l11Hash(seed, 102) % 2) * 512, y: 272, radius: 80 },
    beta: { x: 56, y: 48, radius: 16 },
  }
}
export function l11VariantAt(seed: number, x: number, y: number): L11Variant {
  const a = l11Anchors(seed)
  for (const key of ['capital', 'timesquare'] as const) if (Math.abs(x - a[key].x) < a[key].radius && Math.abs(y - a[key].y) < a[key].radius) return key
  if (x >= -16 && x <= 128 && y >= -16 && y <= 128) return 'lowrise'
  const ax = l11Axis(x), ay = l11Axis(y)
  const r = l11Rand(seed, 111, Math.floor(ax.block / 2), Math.floor(ay.block / 2))
  return r < .22 ? 'lowrise' : r < .42 ? 'apartments' : r < .64 ? 'mixed' : r < .82 ? 'highrise' : r < .92 ? 'industrial' : r < .97 ? 'park' : 'transit'
}
export const l11VariantOf = (seed: number, cx: number, cy: number) => l11VariantAt(seed, cx * 32 + 16, cy * 32 + 16)
export interface L11Surface { kind: 'road' | 'sidewalk' | 'yard' | 'grass' | 'canal' | 'bridge' | 'plaza'; roadX: boolean; marking: boolean; crosswalk: boolean }
export function l11SurfaceAt(seed: number, x: number, y: number, forced?: L11Variant): L11Surface {
  const ax = l11Axis(x), ay = l11Axis(y), v = forced ?? l11VariantAt(seed, x, y)
  const roadX = ay.distance < ax.distance
  const a = roadX ? ay : ax, b = roadX ? ax : ay
  const road = a.distance < a.width / 2
  let kind: L11Surface['kind'] = road ? 'road' : a.distance < a.width / 2 + 3 ? 'sidewalk' : 'yard'
  const center = (ax.lo + ax.hi) / 2
  // Canal corridors have world-anchored banks, road bridges and closed lock ends.
  const canal = mod(ax.block, 7) === 4 && mod(Math.floor((y - 16) / 512), 3) === 1 && mod(y - 16, 512) > 28 && mod(y - 16, 512) < 480
  if (canal && Math.abs(x - center) < 5) kind = road || ay.distance < ay.width / 2 + 3 ? 'bridge' : 'canal'
  else if (kind === 'yard' && (v === 'park' || (v === 'lowrise' && l11Rand(seed, ax.block, ay.block) < .2))) kind = 'grass'
  const anchors = l11Anchors(seed)
  for (const key of ['capital', 'timesquare', 'beta'] as const) {
    const c = anchors[key], r = key === 'beta' ? 18 : 24
    if (Math.abs(x - c.x) < r && Math.abs(y - c.y) < r && !road) kind = 'plaza'
  }
  return { kind, roadX, marking: road && a.distance < .12 && mod(roadX ? x : y, 8) < 4 && b.distance > b.width / 2 + 4,
    crosswalk: road && Math.abs(b.distance - (b.width / 2 + 2)) < 1.5 && mod(roadX ? y : x, 1.7) < .8 }
}
export interface L11Building {
  id: string; x: number; y: number; w: number; h: number; floors: number; accessible: number; sealed: boolean
  style: number; finish: number; use: number; front: 'n' | 's' | 'e' | 'w'; district: L11Variant; seed: number
}
export const L11_USES = ['公寓', '办公楼', '商住楼', '零售店', '停车楼', '学校', '商场', '工厂', '交通站', '博物馆', '体育馆']
const density: Record<L11Variant, number> = { lowrise: 2, apartments: 7, mixed: 6, highrise: 20, industrial: 3, park: 2, transit: 6, capital: 4, timesquare: 11 }
function densityAt(seed: number, x: number, y: number, forced?: L11Variant) {
  if (forced) return density[forced]
  // Interpolate density over neighbouring blocks to soften skyline height transitions.
  let sum = density[l11VariantAt(seed, x, y)] * 4
  for (const [dx, dy] of [[-64,0],[64,0],[0,-64],[0,64]]) sum += density[l11VariantAt(seed, x + dx, y + dy)]
  return sum / 8
}
/** Buildings belong to their origin chunk. Every intersecting chunk samples the same footprint for collision. */
export function l11Buildings(seed: number, x0: number, y0: number, x1: number, y1: number, forced?: L11Variant): L11Building[] {
  const out: L11Building[] = [], seen = new Set<string>()
  for (let yy = y0 - 32; yy < y1 + 32; yy += 24) for (let xx = x0 - 32; xx < x1 + 32; xx += 24) {
    const ax = l11Axis(xx), ay = l11Axis(yy), key = `${ax.block}:${ay.block}`
    if (seen.has(key)) continue
    seen.add(key)
    const left = ax.lo + (mod(ax.block, 5) === 0 || mod(ax.block, 5) === 2 ? 8 : 5) + 5
    const top = ay.lo + (mod(ay.block, 5) === 0 || mod(ay.block, 5) === 2 ? 8 : 5) + 5
    const right = ax.hi - (mod(ax.block + 1, 5) === 0 || mod(ax.block + 1, 5) === 2 ? 8 : 5) - 5
    const bottom = ay.hi - (mod(ay.block + 1, 5) === 0 || mod(ay.block + 1, 5) === 2 ? 8 : 5) - 5
    const cols = Math.max(2, Math.floor((right - left) / 26)), rows = Math.max(2, Math.floor((bottom - top) / 26))
    const sw = (right - left) / cols, sh = (bottom - top) / rows
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      // Interior lots become courtyards/alley space, with perimeter buildings facing the road.
      if (i > 0 && i < cols - 1 && j > 0 && j < rows - 1) continue
      const hs = l11Hash(seed, 112, ax.block, ay.block, i, j)
      const x = Math.round(left + i * sw), y = Math.round(top + j * sh)
      const w = Math.floor(sw - 3), h = Math.floor(sh - 3)
      if (x + w <= x0 || y + h <= y0 || x >= x1 || y >= y1) continue
      const v = forced ?? l11VariantAt(seed, x + w / 2, y + h / 2)
      if (v === 'park' && hs % 12 !== 0) continue
      const a = l11Anchors(seed)
      if (Object.entries(a).some(([k,c]) => {
        const r = k === 'beta' ? 20 : 25
        return x < c.x + r && x + w > c.x - r && y < c.y + r && y + h > c.y - r
      })) continue
      // Preserve canal banks and sidewalks all the way through neighbouring chunks.
      if ([x, x + w / 2, x + w - .1].some(px => [y, y + h / 2, y + h - .1].some(py => ['canal', 'bridge'].includes(l11SurfaceAt(seed, px, py, forced).kind)))) continue
      const sealed = hs % 3 === 0, r = l11Rand(hs, 1)
      const use = r < .28 ? 0 : r < .53 ? 1 : r < .71 ? 2 : r < .81 ? 3 : r < .87 ? 4 : r < .90 ? 5 : r < .93 ? 6 : r < .96 ? 7 : r < .98 ? 8 : r < .99 ? 9 : 10
      const d = densityAt(seed, x + w / 2, y + h / 2, forced)
      let floors = Math.max(1, Math.min(30, Math.round(d * (.72 + l11Rand(hs, 2) * .65))))
      if (sealed) floors = Math.max(10, floors + 4 + hs % 6)
      const ar = l11Rand(hs, 3), accessible = sealed ? 0 : ar < .7 ? 1 : ar < .95 ? Math.min(2, floors) : Math.min(3, floors)
      if (!sealed && ar >= .95) floors = accessible
      const front = j === 0 ? 'n' : j === rows - 1 ? 's' : i === 0 ? 'w' : 'e'
      out.push({ id: `l11:${ax.block}:${ay.block}:${i}:${j}`, x, y, w, h, floors, accessible, sealed,
        style: hs % 7, finish: l11Hash(hs, 4) % 6, use, front, district: v, seed: hs })
    }
  }
  return out
}
export function l11Door(b: L11Building) {
  return { x: b.front === 'w' ? b.x : b.front === 'e' ? b.x + b.w - 1 : b.x + Math.floor(b.w / 2),
    y: b.front === 'n' ? b.y : b.front === 's' ? b.y + b.h - 1 : b.y + Math.floor(b.h / 2) }
}

/** Continuous metro ramp: one safe 10 m descent alongside each 512 m arterial. */
export function l11MetroRamp(x:number,y:number):number|null {
  const sx=Math.floor((x-26)/512)*512+26, sy=Math.floor((y-40)/192)*192+40
  if(x<sx||x>=sx+3||y<sy||y>=sy+10)return null
  return -Math.min(5,(y-sy)*.5) || 0
}
