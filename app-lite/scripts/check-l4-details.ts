
import { genL4ChunkRaw } from '../src/game/world/infiniteL4'
import { L4 } from '../src/game/levels/l4'
import { l4VoidAt } from '../src/game/world/l4Layout'
import {CS} from '../src/game/world/infinite'


const seeds = [424242, 17, 9091]
const kinds = ['services','wallkit','printer','pantry','toilet','server','archive'] as const

const counts = new Map<string, number>()
let checks = 0
const fail = (message: string): never => { throw new Error(`L4_DETAILS_FAIL: ${message}`) }
const cache = new Map<string, ReturnType<typeof genL4ChunkRaw>>()
const get = (seed: number, cx: number, cy: number) => {
  const key = `${seed}:${cx}:${cy}`; let c = cache.get(key)
  if (!c) { c = genL4ChunkRaw(L4, seed, cx, cy); cache.set(key, c) }
  return c
}
const tileAt = (seed: number, x: number, y: number) => {
  const cx = Math.floor(x / CS), cy = Math.floor(y / CS), c = get(seed, cx, cy)
  const ix = x - cx * CS, iy = y - cy * CS
  return { c, i: iy * CS + ix }
}

for (const seed of seeds) {
  cache.clear()
  for (let cx = -4; cx <= 4; cx++) for (let cy = -4; cy <= 4; cy++) get(seed, cx, cy)
  const samples=[...cache.values()]
  for (const c of samples) for (const s of c.structures) if (s.kind === 'l4prop') {
    const detail = String(s.data?.detail ?? '')
    counts.set(detail, (counts.get(detail) ?? 0) + 1)
    if (detail === 'services' || detail === 'wallkit') { if (s.solid) fail(`${detail} must be non-solid`); checks++ }
    if (s.solid) {
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
        const t = tileAt(seed, x, y); if (t.c.outdoor[t.i] || t.c.tiles[t.i] !== 1) fail(`${detail} at ${x},${y} is not indoor floor`)
        checks++
      }
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const d of get(seed,Math.floor(s.x/CS)+dx,Math.floor(s.y/CS)+dy).structures)if((d.kind==='hoteldoor'||d.kind==='glassdoor')&&d.x+.5>s.x&&d.x+.5<s.x+s.w&&d.y+.5>s.y&&d.y+.5<s.y+s.h)fail(`${detail} covers door center`)
    }
    const stairs = c.structures.filter(v => v.kind === 'l4stairs')
    if (s.solid && stairs.some(v => s.x < v.x + v.w && s.x + s.w > v.x && s.y < v.y + v.h && s.y + s.h > v.y)) fail(`${detail} overlaps stairs`)
  }
  for (const kind of kinds) if (!counts.get(kind)) fail(`${kind} has no generated instances`)
  for (const v of cache.values()) for (const s of v.structures) if (s.kind === 'l4stairs') {
    if (l4VoidAt(seed, s.x, s.y)) fail('stairs footprint is outdoor')
  }
}
console.log(`L4 detail checks passed: ${checks}`)
console.log(`Generated l4prop counts: ${[...counts.entries()].map(([k,v]) => `${k}=${v}`).join(', ')}`)

