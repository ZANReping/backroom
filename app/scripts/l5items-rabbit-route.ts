// [l5items] 发条兔寻路前后对比数据（合成大堂：两张桌子；los 不被桌子挡）→ JSON（出图用）
import { createCanvas } from '@napi-rs/canvas'
Object.assign(globalThis, { document: { createElement: () => createCanvas(8, 8), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } })
const { bfsPath } = await import('../src/game/engine/spokesAI')
const W = 20, Hh = 12, tiles = new Uint8Array(W * Hh).fill(1)
for (let x = 0; x < W; x++) { tiles[x] = 0; tiles[(Hh - 1) * W + x] = 0 } for (let y = 0; y < Hh; y++) { tiles[y * W] = 0; tiles[y * W + W - 1] = 0 }
const structures = [{ kind: 'dtable', x: 7, y: 4, w: 2, h: 3, solid: false }, { kind: 'dtable', x: 12, y: 6, w: 2, h: 3, solid: false }]
const losFree = () => true // 桌子不挡视线
const eng: any = { map: { w: W, h: Hh, tiles, structures }, los: losFree }
const a = { x: 2.5, y: 5.5 }, b = { x: 17.5, y: 6.5 }
const after = bfsPath(eng, a.x, a.y, b.x, b.y)
// 修前：只按视线拉直 = 起点直连终点（桌子不阻挡视线、旧版桌子也不计入阻挡）
const before = [b]
console.log(JSON.stringify({ W, H: Hh, tiles: Array.from(tiles), tables: structures, a, before, after }))
