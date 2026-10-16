import { l11SurfaceAt } from './l11Layout'
import { segmentDistance } from './l11Geometry'
import type { L11ChunkData,L11Road,L11Variant } from './l11Types'

export type L11BridgeRailPlacement={x:number;y:number;angle:number;grade:number;id:string}

/** Single source of truth for the four metre bridge rail sampling used by
 * streamed structures and the distant terrain pass. */
export function l11BridgeRailPlacements(seed:number,road:L11Road,si:number,start:number,end:number,plan:Pick<L11ChunkData,'roads'|'canals'>&Partial<Pick<L11ChunkData,'bridges'>>,forced?:L11Variant):L11BridgeRailPlacement[]{
  const a=road.points[si-1],b=road.points[si],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(!length)return []
  const dx=(b[0]-a[0])/length,dy=(b[1]-a[1])/length,angle=Math.atan2(dy,dx),out:L11BridgeRailPlacement[]=[]
  for(let t=Math.max(2,start);t<Math.min(length,end);t+=4)for(const side of [-1,1]){
    const offset=side*(road.width/2+2.8),x=a[0]+dx*t-dy*offset,y=a[1]+dy*t+dx*offset
    if(l11SurfaceAt(seed,x,y,forced,plan).kind!=='bridge')continue
    if(plan.roads.some(r=>r.id!==road.id&&r.points.slice(1).some((p,k)=>segmentDistance(x,y,r.points[k],p)<r.width/2+3.2)))continue
    const grade=(l11SurfaceAt(seed,x+dx*2,y+dy*2,forced,plan).height-l11SurfaceAt(seed,x-dx*2,y-dy*2,forced,plan).height)/4
    out.push({x,y,angle,grade,id:road.id+':bridge-rail:'+si+':'+t+':'+side})
  }
  return out
}
