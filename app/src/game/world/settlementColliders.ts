import {tradersFitoutColliders} from '../content/tradersFitout'
import { alphaParts, isAlphaKind } from '../content/alphaDecor'
import { tradeParts, isTradeKind } from '../content/tradeDecor'
import type { Structure } from '../core/types'
import type { ColliderBox } from './mapgen'

type Data = NonNullable<Structure['data']>
interface Cached {
  kind: Structure['kind']; x: number; y: number; w: number; h: number; solid: boolean
  data: Data; keys: number; boxes: ColliderBox[]
}
// Authored components are deterministic. LOS, NPC placement and movement used
// to reconstruct every shelf, binder and chair just to ask for its solid parts.
// Weak ownership releases the result with its map; edits still invalidate it.
const cache = new WeakMap<Structure, Cached>()
function sameData(a: Cached, data: Structure['data']) {
  let keys = 0
  for (const key in data) {
    keys++
    const before = a.data[key], after = data[key]
    if (Array.isArray(after)) {
      if (!Array.isArray(before) || before.length !== after.length || after.some((v,i) => v !== before[i])) return false
    } else if (!Object.is(before, after)) return false
  }
  return keys === a.keys
}

/** Shared read-only collision result, or null for other structure families. */
export function settlementColliders(s: Structure): ColliderBox[] | null {
  if(s.data?.tradersWindow)return s.solid?[{x0:s.x,y0:s.y,x1:s.x+s.w,y1:s.y+s.h,bottom:0,top:3.12,stand:false}]:[]
  if(s.data?.tradersModel)return tradersFitoutColliders(s)
  const alpha = isAlphaKind(s.kind)
  if (!alpha && !isTradeKind(s.kind)) return null
  const hit = cache.get(s)
  if (hit && hit.kind === s.kind && hit.x === s.x && hit.y === s.y && hit.w === s.w && hit.h === s.h
      && hit.solid === s.solid && sameData(hit, s.data)) return hit.boxes
  const boxes: ColliderBox[] = []
  const a = Number(s.data?.deg ?? 0) * Math.PI / 180, c = Math.cos(a), v = Math.sin(a)
  if (!alpha || s.solid) for (const p of alpha ? alphaParts(s) : tradeParts(s)) {
    if (!p.solid) continue
    const points = [[p.x,p.y],[p.x+p.w,p.y],[p.x,p.y+p.d],[p.x+p.w,p.y+p.d]].map(([x,y]) => {
      const yaw='yaw' in p?Number(p.yaw??0):0,pc=Math.cos(yaw),ps=Math.sin(yaw),dx=x-p.x-p.w/2,dy=y-p.y-p.d/2
      x=p.x+p.w/2+dx*pc+dy*ps;y=p.y+p.d/2-dx*ps+dy*pc
      x -= s.w/2; y -= s.h/2
      return [s.x+s.w/2+x*c+y*v, s.y+s.h/2-x*v+y*c]
    })
    const stand = alpha && 'stand' in p && !!p.stand
    boxes.push({x0:Math.min(...points.map(p=>p[0])),x1:Math.max(...points.map(p=>p[0])),
      y0:Math.min(...points.map(p=>p[1])),y1:Math.max(...points.map(p=>p[1])),
      ...(stand ? {} : {bottom:p.z}),top:p.z+p.h,stand})
  }
  const data: Data = {}
  for (const key in s.data) { const value = s.data[key]; data[key] = Array.isArray(value) ? [...value] : value }
  cache.set(s, {kind:s.kind,x:s.x,y:s.y,w:s.w,h:s.h,solid:s.solid,data,keys:Object.keys(data).length,boxes})
  return boxes
}
