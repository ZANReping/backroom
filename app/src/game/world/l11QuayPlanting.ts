import type { L11Building } from './l11Types'
import { l11EntranceFrame } from './l11Entrance'
import { rectangle,transform } from './l11Geometry'
type QuayBed={x:number;z:number;w:number;d:number;bottom:number;footprint:ReturnType<typeof rectangle>}
const cache=new WeakMap<L11Building,QuayBed[]>()

/** Continuous beds beside the waterfront stair, inside the same setback.
 * The photograph establishes their relationship to the facade/steps; world
 * measurements are inferred. This recipe also belongs to ordinary twins. */
export function l11QuayPlanting(b:L11Building){
  const hit=cache.get(b);if(hit)return hit
  const e=b.entrance
  if(b.architecture!=='ribbon-twins'||!e)return []
  const {tx,ty,point}=l11EntranceFrame(b),along=b.localFootprint[0].map(p=>(p[0]-b.doorLocal[0])*tx+(p[1]-b.doorLocal[1])*ty)
  const lo=Math.min(...along)+.8,hi=Math.max(...along)-.8,clear=e.width/2+.8,depth=Math.min(3.6,e.run-.8)
  if(depth<.7)return []
  const beds=[[lo,-clear],[clear,hi]].filter(([a,z])=>z-a>1.4).map(([a,z])=>{
    const p=point((a+z)/2,.25+depth/2),width=z-a,w=Math.abs(tx)*width+Math.abs(ty)*depth,d=Math.abs(ty)*width+Math.abs(tx)*depth
    return {x:p[0],z:p[1],w,d,bottom:-e.rise,footprint:transform(rectangle(p[0]-w/2-.08,p[1]-d/2-.08,w+.16,d+.16),b.ox,b.oy,b.angle)}
  })
  cache.set(b,beds);return beds
}
