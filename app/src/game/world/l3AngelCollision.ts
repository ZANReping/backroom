import type { Structure } from '../core/types'

export interface L3AngelColliderBox {
  x0: number; y0: number; x1: number; y1: number
  bottom?: number
  top: number
  stand: false
}
const cache=new WeakMap<Structure,{x:number;y:number;w:number;h:number;deg:number;boxes:L3AngelColliderBox[]}>()

/** Finite collision pieces matching the scaled angel sculpture, without its empty air volume. */
export function l3AngelCollision(s: Structure): L3AngelColliderBox[] {
  const deg=Number(s.data?.deg??0),old=cache.get(s)
  if(old&&old.x===s.x&&old.y===s.y&&old.w===s.w&&old.h===s.h&&old.deg===deg)return old.boxes
  const scale = 1.55
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2
  const a = deg * Math.PI / 180
  const ca = Math.cos(a), sa = Math.sin(a)
  const out: L3AngelColliderBox[] = []
  const add = (lx: number, lz: number, w: number, d: number, bottom: number, top: number) => {
    const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]
      .map(([x, z]) => [cx + (lx + x) * ca + (lz + z) * sa, cy - (lx + x) * sa + (lz + z) * ca])
    out.push({
      x0: Math.min(...corners.map(p => p[0])), y0: Math.min(...corners.map(p => p[1])),
      x1: Math.max(...corners.map(p => p[0])), y1: Math.max(...corners.map(p => p[1])),
      bottom, top, stand: false,
    })
  }
  // Filled horizontal slices of the circular plinth, including its centre.
  // Tangent boxes around a ring would leave holes and protrude past the stone.
  const baseR = .43 * scale
  for (let i = 0; i < 8; i++) {
    const z0=-baseR+i*baseR/4,z1=z0+baseR/4
    const near=Math.min(Math.abs(z0),Math.abs(z1))
    add(0,(z0+z1)/2,2*Math.sqrt(baseR*baseR-near*near),z1-z0,0,.72*scale)
  }
  // Narrow robe/body only; the open space below the raised wings stays walkable.
  add(.02 * scale, .015*scale, .66 * scale, .52 * scale, .68 * scale, 2.34 * scale)
  add(.016*scale,-.025*scale,.31*scale,.29*scale,2.25*scale,2.72*scale)
  // Separate high arm and wing spans, following the existing feather loft envelope.
  for (const side of [-1, 1]) {
    add(side*.43*scale,.06*scale,.58*scale,.22*scale,2.08*scale,2.54*scale)
    add(side*.39*scale,-.19*scale,.52*scale,.23*scale,2.15*scale,2.69*scale)
    add(side*.78*scale,-.27*scale,.42*scale,.25*scale,2.30*scale,2.83*scale)
    add(side*1.14*scale,-.33*scale,.43*scale,.20*scale,2.51*scale,2.94*scale)
  }
  // Low end of the trumpet is still elevated; it must not block the floor below.
  add(-.86*scale,.04*scale,.28*scale,.22*scale,1.87*scale,2.29*scale)
  cache.set(s,{x:s.x,y:s.y,w:s.w,h:s.h,deg,boxes:out})
  return out
}
