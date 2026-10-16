import type { L11Road,L11CityPlan } from './l11Types'
import type { Point } from './l11Geometry'

export interface L11Crosswalk { id:string; roadId:string; segment:number; t:number; center:Point; axis:Point; width:number }
const crossingsCache=new WeakMap<readonly L11Road[],L11Crosswalk[]>()
const seamsCache=new WeakMap<L11CityPlan,Map<string,{plans:L11CityPlan[];crossings:L11Crosswalk[]}>>()
/** At a macro seam the renderer uses roads on both sides of the seam. */
export function l11PlanCrosswalks(plans:L11CityPlan[]):L11Crosswalk[]{
  if(plans.length===1)return l11Crosswalks(plans[0].roads)
  let cache=seamsCache.get(plans[0]);if(!cache){cache=new Map();seamsCache.set(plans[0],cache)}
  const key=plans.map(p=>p.id).join('|'),hit=cache.get(key)
  if(hit&&hit.plans.every((p,i)=>p===plans[i]))return hit.crossings
  const crossings=l11Crosswalks(plans.flatMap(p=>p.roads));cache.set(key,{plans,crossings});return crossings
}
/** The same full planning graph supplies painted stripes and pedestrian routes. */
export function l11Crosswalks(roads:readonly L11Road[]):L11Crosswalk[]{
  const hit=crossingsCache.get(roads);if(hit)return hit
  const out:L11Crosswalk[]=[]
  for(const road of roads)for(let segment=1;segment<road.points.length;segment++){
    const a=road.points[segment-1],b=road.points[segment],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.01)continue
    const axis:Point=[(b[0]-a[0])/len,(b[1]-a[1])/len]
    for(const t of l11CrossingPositions(road,segment,roads))out.push({id:`${road.id}:cross:${segment}:${t.toFixed(3)}`,roadId:road.id,segment,t,center:[a[0]+axis[0]*t,a[1]+axis[1]*t],axis,width:road.width})
  }
  crossingsCache.set(roads,out);return out
}

/** Crossings sit beyond the complete junction envelope, including skew roads.
 * Use the full macro road graph, not only roads intersecting a render chunk:
 * the junction itself can be just outside the chunk containing its crossing. */
export function l11CrossingPositions(road:L11Road,segment:number,roads:readonly L11Road[]):number[]{
  if(road.pedestrian||road.class==='waterfront')return []
  const a=road.points[segment-1],b=road.points[segment],length=Math.hypot(b[0]-a[0],b[1]-a[1])
  if(length<28)return []
  const dx=(b[0]-a[0])/length,dy=(b[1]-a[1])/length,junctions:{t:number;extent:number}[]=[]
  for(const other of roads){
    if(other.id===road.id)continue
    for(let i=1;i<other.points.length;i++){
      const p=other.points[i-1],q=other.points[i],len=Math.hypot(q[0]-p[0],q[1]-p[1]);if(len<.01)continue
      const ux=(q[0]-p[0])/len,uy=(q[1]-p[1])/len,cross=dx*uy-dy*ux
      // Shallow merges need lane/merge markings rather than a zebra crossing.
      if(Math.abs(cross)<.35)continue
      const vx=p[0]-a[0],vy=p[1]-a[1],t=(vx*uy-vy*ux)/cross,u=(vx*dy-vy*dx)/cross
      if(t<-.01||t>length+.01||u<-.01||u>len+.01)continue
      const extent=(other.width/2+Math.abs(dx*ux+dy*uy)*road.width/2)/Math.abs(cross)
      const existing=junctions.find(j=>Math.abs(j.t-t)<.25)
      if(existing)existing.extent=Math.max(existing.extent,extent);else junctions.push({t,extent})
    }
  }
  const positions=junctions.flatMap(j=>[-1,1].map(side=>j.t+side*(j.extent+2.1)))
    .filter(t=>t>2&&t<length-2&&junctions.every(j=>Math.abs(t-j.t)>j.extent+1.5))
    .sort((a,b)=>a-b)
  return positions.filter((t,i)=>!i||t-positions[i-1]>4)
}

export const l11YellowCrossing=(seed:number,road:L11Road)=>road.class==='arterial'&&((seed%3)+3)%3===1
