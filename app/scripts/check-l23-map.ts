import assert from 'node:assert/strict'
import { createCanvas, Path2D } from '@napi-rs/canvas'
import { drawL23Map, l23MapRegion } from '../src/game/content/l23Map'
import { L23_MAP_KEY, L23_MAP_MARKS } from '../src/game/content/l23MapKey'

;(globalThis as any).Path2D = Path2D

const ids = (xs: readonly { id: string }[]) => {
  assert.equal(new Set(xs.map((x) => x.id)).size, xs.length, '图例 id 必须唯一')
}
ids(L23_MAP_KEY[2]); ids(L23_MAP_KEY[3]); ids(L23_MAP_MARKS)
assert.equal(L23_MAP_KEY[2].length, 6)
assert.equal(L23_MAP_KEY[3].length, 7)
assert.equal(L23_MAP_MARKS.length, 4)

// Generator tint/variant combinations used by L2/L3 stay stable and map to
// distinct visual regions. Feature-room margins mirror the actual generators.
assert.equal(l23MapRegion(2, 'narrow', 0, 4, 4), 'narrow')
assert.equal(l23MapRegion(2, 'normal', 12, 4, 4), 'dirty')
assert.equal(l23MapRegion(2, 'normal', 13, 4, 4), 'dim')
assert.equal(l23MapRegion(2, 'normal', 15, 4, 4), 'warped')
assert.equal(l23MapRegion(2, 'normal', 16, 4, 4), 'office')
assert.equal(l23MapRegion(3, 'assembly', 0, 2, 2), 'assembly')
assert.equal(l23MapRegion(3, 'genhall', 0, 3, 3), 'genhall')
assert.equal(l23MapRegion(3, 'boiler', 0, 10, 10), 'lit')
assert.equal(l23MapRegion(3, 'boiler', 0, 11, 11), 'boiler')
assert.equal(l23MapRegion(3, 'normal', 19, 4, 4), 'dark')
assert.equal(l23MapRegion(3, 'normal', 20, 4, 4), 'sanct')

const w = 32, h = 32
const tiles = new Uint8Array(w * h); tiles.fill(1)
const tint = new Uint8Array(w * h); tint.fill(12); tint[4 * w + 4] = 16
const explored = new Uint8Array(w * h); explored.fill(1)
const chunk = { key: '0,0', cx: 0, cy: 0, tiles, tint, structures: [], variant: 'normal' }
const map: any = { w, h, inf: { ox: 0, oy: 0, chunks: new Map([['0,0', chunk]]), explored: new Map([['0,0', explored]]) } }
const engine: any = { map, levelDef: { id: 2 }, explored, devEnabled: false, dev: { mapReveal: false } }
const beforeTiles = tiles.slice(), beforeTint = tint.slice(), beforeExplored = explored.slice()
const ctx = createCanvas(96, 96).getContext('2d') as unknown as CanvasRenderingContext2D
drawL23Map(ctx, engine, { x0: 0, y0: 0, x1: 32, y1: 32, scale: 3 })
assert.deepEqual(tiles, beforeTiles, '绘制不能修改地图瓦片')
assert.deepEqual(tint, beforeTint, '绘制不能修改区域数据')
assert.deepEqual(explored, beforeExplored, '绘制不能修改探索记录')

// Unknown cells are clipped by the explored bitmap. A no-exploration render
// must still complete without throwing and must not reveal preview geometry.
explored.fill(0)
ctx.clearRect(0,0,96,96)
drawL23Map(ctx, engine, { x0: 0, y0: 0, x1: 32, y1: 32, scale: 3 })
assert.ok(ctx.getImageData(0,0,96,96).data.every((v,i)=>i%4!==3||v===0),'未探索地图必须保持透明，不泄露区域')
console.log('L2/L3 map legend, region classification, immutable draw and exploration clipping: PASS')
