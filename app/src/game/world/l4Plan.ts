// Level 4 v2 — one continuous office building (Fandom rewrite: https://backrooms.fandom.com/zh/wiki/Level_4).
// No void seas. The floor is tiled by large floor plates ("blocks") separated by 3-tile facade strips:
// both faces of a strip carry a window band (fake rain sky, the lore says the sky outside is static and false),
// the middle tile is the outer wall. Strips are crossed by 2-wide passages every 16–20 m.
// Each block has a service core (looping stairwell, toilets, pantry, optional elevator) and one of four
// layouts matching the reference photos:
//   hall     — Level-4-new / Level4RewriteBackground: vast empty carpet, white columns, window perimeter
//   cubicle  — Level4Workrooms1: two banks of fabric cubicles per aisle, glazed meeting room at the aisle end
//   open     — Level4altbg: columns on carpet, pale doors into small side rooms around the core
//   rooms    — Liminal_Office: perimeter window corridor, grid of small offices / workrooms / corridors
import { h32 } from './infiniteSeed'
import type { Structure } from '../core/types'
import type { L4Variant } from './l4Layout'

export type L4BlockType = 'hall' | 'cubicle' | 'open' | 'rooms'
export const L4_ROW_PITCH = 64, L4_COL_PITCH = 80, L4_FACADE = 3
export type L4Op =
  | { o: 'rect'; x0: number; y0: number; x1: number; y1: number; t: number; style?: L4Variant }
  | { o: 'add'; kind: Structure['kind']; x: number; y: number; w: number; h: number; solid: boolean; data: Structure['data'] }
  | { o: 'light'; x: number; y: number; style: L4Variant; on: boolean }
  | { o: 'elev'; x: number; y: number }
  | { o: 'exit'; kind: string; x: number; y: number }
export interface L4Block {
  i: number; j: number; x0: number; x1: number; y0: number; y1: number
  ix0: number; iy0: number; ix1: number; iy1: number // interior, inclusive
  type: L4BlockType
  core: { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }
  elevSlot: { x: number; y: number; bx: number; by: number }
  ops: L4Op[]
}

const jit = (seed: number, salt: number, a: number, b: number, span: number) => (h32(seed, salt, a, b) % (span * 2 + 1)) - span
export function l4RowEdge(seed: number, j: number) { return j * L4_ROW_PITCH + (j === 0 ? 0 : jit(seed, 0x4d01, j, 0, 8)) }
export function l4ColEdge(seed: number, i: number, j: number) { return i * L4_COL_PITCH + (j & 1) * 40 + (i === 0 && j === 0 ? 0 : jit(seed, 0x4d02, i, j, 10)) }
export function l4RowOf(seed: number, y: number) {
  let j = Math.floor(y / L4_ROW_PITCH)
  while (y < l4RowEdge(seed, j)) j--
  while (y >= l4RowEdge(seed, j + 1)) j++
  return j
}
export function l4ColOf(seed: number, x: number, j: number) {
  let i = Math.floor((x - (j & 1) * 40) / L4_COL_PITCH)
  while (x < l4ColEdge(seed, i, j)) i--
  while (x >= l4ColEdge(seed, i + 1, j)) i++
  return i
}
export function l4BlockIndex(seed: number, x: number, y: number) { const j = l4RowOf(seed, y); return { i: l4ColOf(seed, x, j), j } }
/** true when (x,y) is inside some block's interior (not a facade strip) */
export function l4InteriorAt(seed: number, x: number, y: number) {
  const j = l4RowOf(seed, y), i = l4ColOf(seed, x, j)
  return x >= l4ColEdge(seed, i, j) + L4_FACADE && y >= l4RowEdge(seed, j) + L4_FACADE
}
export function l4BlockType(seed: number, i: number, j: number): L4BlockType {
  if (i === 0 && j === 0) return 'open'
  const n = h32(seed, 0x4d10, i, j) % 100
  return n < 25 ? 'hall' : n < 55 ? 'cubicle' : n < 73 ? 'open' : 'rooms'
}

const cache = new Map<string, L4Block>()
export function l4Block(seed: number, i: number, j: number): L4Block {
  const key = `${seed}:${i}:${j}`, hit = cache.get(key)
  if (hit) return hit
  const b = buildBlock(seed, i, j)
  if (cache.size > 512) cache.delete(cache.keys().next().value!)
  cache.set(key, b)
  return b
}

function buildBlock(seed: number, i: number, j: number): L4Block {
  const x0 = l4ColEdge(seed, i, j), x1 = l4ColEdge(seed, i + 1, j) - 1, y0 = l4RowEdge(seed, j), y1 = l4RowEdge(seed, j + 1) - 1
  const ix0 = x0 + L4_FACADE, iy0 = y0 + L4_FACADE, ix1 = x1, iy1 = y1
  const type = l4BlockType(seed, i, j)
  const ops: L4Op[] = []
  const rect = (a: number, b: number, c: number, d: number, t: number, style?: L4Variant) => ops.push({ o: 'rect', x0: a, y0: b, x1: c, y1: d, t, style })
  const add = (kind: Structure['kind'], x: number, y: number, w = 1, h = 1, solid = true, data: Structure['data'] = {}) => ops.push({ o: 'add', kind, x, y, w, h, solid, data })
  const H = (salt: number, a = 0, b = 0) => h32(seed, salt, i * 977 + a, j * 613 + b)
  const base: L4Variant = type === 'cubicle' ? 'officehall' : type === 'rooms' ? 'smallrooms' : type === 'hall' ? 'hall' : 'open'
  const door = (x: number, y: number, axis: 'x' | 'y', glass = false, room?: string) => { rect(x, y, x, y, 1, base); add(glass ? 'glassdoor' : 'hoteldoor', x, y, 1, 1, true, { open: 0, axis, officeDoor: 1, ...(room ? { room } : {}) }) }

  // ---- facade strips (west + north of this block; they also carry windows facing the neighbours)
  rect(x0, y0, x1, iy0 - 1, 2); rect(x0, y0, ix0 - 1, y1, 2)
  rect(ix0, iy0, ix1, iy1, 1, base)

  // passages through the north strip (to row j-1) and west strip (to block i-1)
  const passN: number[] = [], passW: number[] = []
  for (let s = ix0 + 3; s + 6 < ix1 - 3; s += 20) {
    const p = Math.min(ix1 - 6, s + 3 + H(0x4d21, s) % 12)
    let ok = true
    for (let t = -2; t <= 3; t++) if (!l4InteriorAt(seed, p + t, y0 - 1)) ok = false
    if (ok) { passN.push(p); rect(p, y0, p + 1, iy0 - 1, 1, base) }
  }
  for (let s = iy0 + 3; s + 6 < iy1 - 3; s += 16) {
    const p = Math.min(iy1 - 6, s + 3 + H(0x4d22, s) % 8)
    passW.push(p); rect(x0, p, ix0 - 1, p + 1, 1, base)
  }
  // window bays: deg = [north-outside 180, east-outside 90, south-outside 0, west-outside 270]
  const win = (x: number, y: number, deg: number, t: number, id: string) => {
    rect(x, y, x, y, 1)
    // mesh 绕 Y 旋转 deg 后本地 +X 指向：0→+x, 180→-x, 90→-y, 270→+y；侧板必须落在靠窗间墙(t=0)的一侧，否则会在窗中间伸出薄墙
    const flip = deg === 180 || deg === 90
    add('glasswin', x, y, 1, 1, true, { deg, rain: 1, coast: 1, l4Facade: 1, mullion: t % 2 === 0 ? 1 : 0, revealLeft: (flip ? t === 3 : t === 1) ? 1 : 0, revealRight: (flip ? t === 1 : t === 3) ? 1 : 0, windowId: id })
  }
  const nearPass = (p: number, list: number[]) => list.some(q => p >= q - 1 && p <= q + 2)
  for (let x = ix0 + 2; x <= ix1 - 2; x++) {
    const t = (x - ix0) % 4; if (t === 0 || nearPass(x, passN)) continue
    win(x, iy0 - 1, 180, t, `${i}:${j}:n:${Math.floor((x - ix0) / 4)}`) // faces this block
    if (l4InteriorAt(seed, x, y0 - 1) && l4InteriorAt(seed, x - 1, y0 - 1) && l4InteriorAt(seed, x + 1, y0 - 1)) win(x, y0, 0, t, `${i}:${j}:s:${Math.floor((x - ix0) / 4)}`)
  }
  for (let y = iy0 + 2; y <= iy1 - 2; y++) {
    const t = (y - iy0) % 4; if (t === 0 || nearPass(y, passW)) continue
    win(ix0 - 1, y, 270, t, `${i}:${j}:w:${Math.floor((y - iy0) / 4)}`)
    win(x0, y, 90, t, `${i}:${j}:e:${Math.floor((y - iy0) / 4)}`)
  }

  // ---- service core
  const ccx = Math.floor((ix0 + ix1) / 2), ccy = Math.floor((iy0 + iy1) / 2)
  const core = { x0: ccx - 6, y0: ccy - 7, x1: ccx + 5, y1: ccy + 6, cx: ccx, cy: ccy }
  const elevSlot = { x: core.x0, y: ccy + 3, bx: core.x0 + 1, by: ccy + 3 }
  const drawCore = () => {
    rect(core.x0, core.y0, core.x1, core.y1, 2); rect(core.x0 + 1, core.y0 + 1, core.x1 - 1, core.y1 - 1, 1, 'smallrooms')
    rect(ccx - 4, core.y0, ccx - 3, core.y0, 1, 'smallrooms') // stair entry from the north
    rect(ccx - 1, core.y0 + 1, ccx - 1, core.y1 - 1, 2) // stair side | service side
    rect(ccx, ccy, ccx + 4, ccy, 2) // toilet | pantry
    const sx = ccx - 5, sy = ccy - 5
    add('l4stairs', sx, sy, 4, 6, true, { loop: 1 })
    ops.push({ o: 'elev', x: sx, y: sy })
    door(core.x0, ccy + 5, 'y')
    door(core.x1, ccy - 3, 'y', false, 'toilet'); door(core.x1, ccy + 3, 'y', false, 'pantry')
    add('l4prop', ccx, ccy - 6, 3, 2, true, { detail: 'toilet', room: 'toilet', tile: [ccx, ccy - 6, 5, 6].map(String) })
    add('l4prop', ccx, ccy + 1, 3, 1, true, { detail: 'pantry', room: 'pantry', tile: [ccx, ccy + 1, 5, 5].map(String) })
    if (H(0x4d31) % 100 < 45) add('vending', ccx - 4, ccy + 4, 1, 1, true, { trade: 1 })
    if (H(0x4d32) % 100 < 15) add('landmark', core.x0 - 1, ccy + 1, 1, 1, false, { outpost: 'omega', poster: 1, tex: 'omega_poster.png' })
    add('l4prop', core.x0 - 1, ccy - 1, 1, 1, false, { detail: 'wallDecor', deg: 270, wallOffset: 1 })
    // Fandom: water dispensers here hand out almond water (≈30% of them); the rest are ordinary coolers.
    add('watercooler', core.x0 - 1, ccy - 6, 1, 1, true, { deg: 270, almond: H(0x4d33) % 100 < 30 ? 1 : 0, water: 4 })
    if (type !== 'open') add('l4prop', ccx + 2, core.y1 + 1, 1, 1, false, { detail: 'wallDecor', deg: 0, wallOffset: 1 })
  }
  const inCore = (x: number, y: number, m = 0) => x >= core.x0 - m && x <= core.x1 + m && y >= core.y0 - m && y <= core.y1 + m
  const colGrid = (skip: (x: number, y: number) => boolean) => {
    for (let y = iy0 + 6; y <= iy1 - 4; y += 8) for (let x = ix0 + 6; x <= ix1 - 4; x += 8) if (!skip(x, y)) add('pillar', x, y, 1, 1, true, { l4Col: 1 })
  }

  if (type === 'hall') {
    colGrid((x, y) => inCore(x, y, 2)); drawCore()
    if (H(0x4d34) % 100 < 60) { const wx = ix0 + 6 + 8 * (1 + H(0x4d35) % 2), wy = iy0 + 6 + 1; add('watercooler', wx, wy, 1, 1, true, { deg: 0, almond: H(0x4d36) % 100 < 30 ? 1 : 0, water: 4 }) }
    if (H(0x4d40) % 100 < 9) { const sx = ccx + 10, sy = Math.min(iy1 - 3, ccy + 9); ops.push({ o: 'exit', kind: 'oldstairs', x: sx, y: sy }) }
  } else if (type === 'open') {
    colGrid((x, y) => x >= core.x0 - 3 && x <= core.x1 + 9 && y >= core.y0 - 4 && y <= core.y1 + 9); drawCore()
    // small side rooms east of and below the core, pale doors on their outer sides (ref Level4altbg)
    const ex0 = core.x1 + 1, ex1 = ex0 + 6, ey0 = core.y0 - 2, ey1 = core.y1 + 7
    rect(ex0, ey0, ex1, ey1, 2)
    const n = 3, hgt = Math.floor((ey1 - ey0 - 1) / n)
    for (let r = 0; r < n; r++) {
      const ry0 = ey0 + 1 + r * hgt, ry1 = r === n - 1 ? ey1 - 1 : ry0 + hgt - 2
      rect(ex0 + 1, ry0, ex1 - 1, ry1, 1, 'smallrooms'); door(ex1, Math.floor((ry0 + ry1) / 2), 'y')
    }
    rect(ex0, ccy - 3, ex0, ccy - 3, 1, 'smallrooms'); rect(ex0, ccy + 3, ex0, ccy + 3, 1, 'smallrooms')
    const sy0 = core.y1 + 1, sy1 = core.y1 + 7
    rect(core.x0 - 1, sy0, ex0, sy1, 2)
    for (const [ra, rb] of [[core.x0, ccx - 1], [ccx + 1, ex0 - 1]]) { rect(ra, sy0 + 1, rb, sy1 - 1, 1, 'smallrooms'); door(Math.floor((ra + rb) / 2), sy1, 'x') }
    add('l4prop', ccx - 3, sy0 + 1, 1, 1, false, { detail: 'wallDecor', deg: 0, wallOffset: 1 })
  } else if (type === 'cubicle') {
    drawCore()
    for (let mx = ix0 + 3; mx + 11 <= ix1 - 2; mx += 15) {
      const clash = (ya: number, yb: number) => mx <= core.x1 + 2 && mx + 11 >= core.x0 - 2 && yb >= core.y0 - 2 && ya <= core.y1 + 2
      const gy = iy0 + 7
      if (!clash(iy0 + 1, gy)) {
        for (let x = mx; x <= mx + 11; x++) { rect(x, gy, x, gy, 1); if (x !== mx + 5) add('glasswin', x, gy, 1, 1, true, { partition: 1, deg: 0 }) }
        for (let y = iy0 + 1; y < gy; y++) for (const x of [mx, mx + 11]) { rect(x, y, x, y, 1); add('glasswin', x, y, 1, 1, true, { partition: 1, deg: 90 }) }
        rect(mx + 5, gy, mx + 5, gy, 1); add('glassdoor', mx + 5, gy, 1, 1, true, { open: 0, axis: 'x', officeDoor: 1 })
        add('table', mx + 4, iy0 + 4, 4, 1, true, { meeting: 1 })
        for (const x of [mx + 3, mx + 5, mx + 7, mx + 9]) add('officechair', x, iy0 + 3, 1, 1, false, { deg: 180 })
        for (const x of [mx + 4, mx + 6, mx + 8]) add('officechair', x, iy0 + 5.2, 1, 1, false, { deg: 0 })
      }
      for (let y = gy + 3; y + 1 <= iy1 - 3; y += 2) {
        if (clash(y, y + 1)) continue
        add('cubicle', mx, y, 4, 2, true, { deg: 270 }); add('officechair', mx + 2.4, y + .45, 1, 1, false, { deg: 90 })
        add('cubicle', mx + 8, y, 4, 2, true, { deg: 90 }); add('officechair', mx + 8.6, y + .45, 1, 1, false, { deg: 270 })
      }
      if (!clash(iy1 - 2, iy1)) add('l4prop', mx + 5, iy1 - 1, 1, 1, true, { detail: 'printer' })
    }
  } else { // rooms
    const ax0 = ix0 + 3, ay0 = iy0 + 3, ax1 = ix1 - 3, ay1 = iy1 - 3
    rect(ix0, iy0, ix1, iy1, 1, 'smallrooms'); rect(ax0, ay0, ax1, ay1, 2)
    const W = ax1 - ax0 + 1, Hh = ay1 - ay0 + 1, nC = Math.max(1, Math.floor((W - 2) / 12)), nR = Math.max(1, Math.floor((Hh + 1) / 7))
    const rowH = Math.floor((Hh + 1) / nR)
    for (let c = 0; c < nC; c++) {
      const cx0 = ax0 + c * 12, cx1 = c === nC - 1 ? ax1 : cx0 + 11
      rect(cx0, ay0, cx0 + 1, ay1, 1, 'smallrooms') // corridor
      for (let r = 0; r < nR; r++) {
        const ry0 = ay0 + r * rowH, ry1 = r === nR - 1 ? ay1 : ry0 + rowH - 2
        const rx0 = cx0 + 3, rx1 = cx1 - (c === nC - 1 ? 0 : 1)
        if (rx1 - rx0 < 3 || ry1 - ry0 < 3) continue
        // cells next to the core open up into a small lobby around it instead of leaving dead wall mass
        if (rx1 >= core.x0 - 3 && cx0 + 2 <= core.x1 + 3 && ry1 >= core.y0 - 3 && ry0 <= core.y1 + 3) { rect(cx0 + 2, ry0 - (r > 0 ? 1 : 0), rx1, ry1, 1, 'smallrooms'); continue }
        rect(rx0, ry0, rx1, ry1, 1, 'smallrooms')
        const dy = ry0 + 1 + H(0x4d50, c, r) % Math.max(1, ry1 - ry0 - 2)
        door(cx0 + 2, dy, 'y')
        const sv = H(0x4d51, c, r) % 10, detail = sv === 0 ? 'server' : sv === 1 ? 'archive' : sv === 2 ? 'printer' : null
        if (detail) add('l4prop', rx0 + 1, ry0, detail === 'archive' ? 2 : 1, 1, true, { detail, room: detail })
        else { add('desk', rx0 + 1, ry0 + 1, 2, 1, true); add('officechair', rx0 + 1.5, ry0 + 2.2, 1, 1, false, { deg: 0 }); if (rx1 - rx0 >= 5) add('cabinet', rx1 - 1, ry0, 1, 1, true, { loot: 1 }) }
        if (H(0x4d52, c, r) % 1000 < 15) ops.push({ o: 'exit', kind: 'trapdoor', x: rx1 - 1, y: ry1 - 1 })
      }
    }
    // walkway ring around the core joins it to the corridor grid
    rect(core.x0 - 2, core.y0 - 2, core.x1 + 2, core.y1 + 2, 1, 'smallrooms')
    drawCore()
  }
  // abandoned-office clutter in the big open zones (hall / open): beside columns, never in the core ring
  if (type === 'hall' || type === 'open') {
    const kinds = ['boxes', 'boxes', 'chairstack', 'plant', 'whiteboard', 'desks'] as const
    const n = 3 + H(0x4d60) % 4
    for (let k = 0; k < n; k++) {
      const cx = ix0 + 6 + 8 * (1 + H(0x4d61, k) % Math.max(1, Math.floor((ix1 - ix0 - 10) / 8) - 1)), cy = iy0 + 6 + 8 * (1 + H(0x4d62, k) % Math.max(1, Math.floor((iy1 - iy0 - 10) / 8) - 1))
      const x = cx + 3 + H(0x4d66, k) % 2, y = cy + 3 // mid-bay, clear of the column grid
      if (inCore(x, y, type === 'open' ? 9 : 3) || x >= ix1 - 3 || y >= iy1 - 3) continue
      if (ops.some(o => o.o === 'add' && o.x < x + 3 && o.x + o.w > x - 1 && o.y < y + 3 && o.y + o.h > y - 1.5)) continue
      const kind = kinds[H(0x4d63, k) % kinds.length], deg = [0, 90, 180, 270][H(0x4d64, k) % 4]
      if (kind === 'desks') { // a forgotten desk pair with chairs
        add('desk', x, y, 2, 1, true); add('desk', x, y + 1, 2, 1, true)
        add('officechair', x + .5, y - .8, 1, 1, false, { deg: 180 }); add('officechair', x + 1.2, y + 2.2, 1, 1, false, { deg: H(0x4d65, k) % 2 ? 20 : 0 })
      } else add('l4prop', x, y, 1, 1, kind !== 'plant', { detail: kind, deg })
    }
  }
  // ceiling services and lights (world-aligned 4×3 grid)
  for (let y = iy0 + 1; y <= iy1; y++) for (let x = ix0 + 1; x <= ix1; x++) {
    if ((x & 3) !== 1 || ((y % 3) + 3) % 3 !== 1) continue // negative-y blocks had no lamps before D
    ops.push({ o: 'light', x, y, style: base, on: true }) // v2: lights work (user 2026-10-21: no mass blackout)
  }
  for (let y = iy0 + 6; y <= iy1 - 4; y += 9) for (let x = ix0 + 7; x <= ix1 - 4; x += 8) add('l4prop', x, y, 1, 1, false, { detail: 'services' })
  // Place stair shafts only in a clear three-by-five-metre bay, including the approach.
  for(let n=ops.length-1;n>=0;n--){const op=ops[n];if(op.o!=='exit')continue
    const clear=(x:number,y:number)=>{
      const r=op.kind==='oldstairs'?{x0:x-.8,y0:y-3.7,x1:x+1.8,y1:y+1.7}:{x0:x-.25,y0:y-.25,x1:x+1.25,y1:y+1.25}
      if(r.x0<ix0+1||r.x1>ix1||r.y0<iy0+1||r.y1>iy1)return false
      if(op.kind==='oldstairs'&&r.x0<core.x1+2&&r.x1>core.x0-1&&r.y0<core.y1+2&&r.y1>core.y0-1)return false
      return !ops.some(a=>a.o==='add'&&a.solid&&a.x<r.x1&&a.x+a.w>r.x0&&a.y<r.y1&&a.y+a.h>r.y0)
    }
    if(clear(op.x,op.y))continue
    if(op.kind!=='oldstairs'){ops.splice(n,1);continue}
    let found=false
    for(let d=1;d<=16&&!found;d++)for(let dy=-d;dy<=d&&!found;dy++)for(let dx=-d;dx<=d&&!found;dx++)if(Math.max(Math.abs(dx),Math.abs(dy))===d&&clear(op.x+dx,op.y+dy)){op.x+=dx;op.y+=dy;found=true}
    if(!found)ops.splice(n,1)
  }
  return { i, j, x0, x1, y0, y1, ix0, iy0, ix1, iy1, type, core, elevSlot, ops }
}
