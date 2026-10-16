import { bounds,segmentDistance } from './l11Geometry'
import { l11TerrainHeight } from './l11Hydrology'
import type { L11Canal,L11Road } from './l11Types'
import { l11CanalAccess } from './l11CanalAccess'

export interface L11QuayRailPlacement {x:number;y:number;angle:number;grade:number;id:string;kind:'canal_railing'|'quay_balustrade';side:number}

/** World-anchored four metre modules, shared by streamed physics and the
 * distant view. Macro boundaries and loading order never shift the post row. */
export function l11QuayRailPlacements(seed:number,canal:L11Canal,roads:readonly L11Road[],y0:number,y1:number):L11QuayRailPlacement[]{
  const out:L11QuayRailPlacement[]=[],kind=canal.pedestrian?'quay_balustrade':'canal_railing',bb=bounds(canal.water)
  const ladders=l11CanalAccess(seed,canal,roads,y0-4,y1+4).filter(p=>p.key==='canal_ladder')
  for(let y=Math.ceil(Math.max(y0,bb.y)/4)*4;y<Math.min(y1,bb.y+bb.h);y+=4)for(const side of [-1,1]){
    const si=canal.points.findIndex((p,i)=>i>0&&p[1]>=y);if(si<1)continue
    const a=canal.points[si-1],b=canal.points[si],t=(y-a[1])/(b[1]-a[1]),x=a[0]+(b[0]-a[0])*t+side*(canal.width/2+.35),angle=Math.atan2(b[1]-a[1],b[0]-a[0]),dx=Math.cos(angle),dy=Math.sin(angle)
    if(roads.some(r=>r.points.slice(1).some((p,k)=>segmentDistance(x,y,r.points[k],p)<r.width/2+2.5)))continue
    if(ladders.some(p=>p.side===side&&Math.hypot(p.x-x,p.y-y)<2.8))continue
    const grade=(l11TerrainHeight(seed,x+dx*2,y+dy*2)-l11TerrainHeight(seed,x-dx*2,y-dy*2))/4
    out.push({x,y,angle,grade,kind,side,id:'canal:'+seed+':rail:'+Math.round(x)+':'+y})
  }
  return out
}
