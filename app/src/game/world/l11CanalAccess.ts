import { bounds,segmentDistance } from './l11Geometry'
import { l11Hash } from './l11Layout'
import { L11_WATER_SURFACE,l11TerrainHeight } from './l11Hydrology'
import type { L11Canal,L11Road,L11ChunkData } from './l11Types'
export interface L11CanalAccess {key:'canal_ladder'|'sewer_outlet';id:string;x:number;y:number;angle:number;base:number;landX:number;landY:number;landZ:number;side:number}
const chunkCache=new WeakMap<L11ChunkData,L11CanalAccess[]>()
export function l11ChunkCanalAccess(data:L11ChunkData){
  let hit=chunkCache.get(data);if(!hit){hit=data.canals.flatMap(c=>l11CanalAccess(data.seed,c,data.roads,data.cy*32-6,data.cy*32+38));chunkCache.set(data,hit)}return hit
}

/** Stations use world Y and seed, never chunk ownership or dressing revision. */
export function l11CanalAccess(seed:number,canal:L11Canal,roads:readonly L11Road[],y0:number,y1:number):L11CanalAccess[]{
  const out:L11CanalAccess[]=[],bb=bounds(canal.water)
  for(let y=Math.ceil(Math.max(y0,bb.y)/32)*32;y<Math.min(y1,bb.y+bb.h);y+=32){
    const edges:{x:number;dx:number;dy:number}[]=[]
    for(const polygon of canal.water)for(const ring of polygon)for(let i=1;i<ring.length;i++){
      const a=ring[i-1],b=ring[i];if(y<Math.min(a[1],b[1])||y>=Math.max(a[1],b[1])||Math.abs(b[1]-a[1])<.001)continue
      edges.push({x:a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]),dx:b[0]-a[0],dy:b[1]-a[1]})
    }
    edges.sort((a,b)=>a.x-b.x);if(edges.length<2)continue
    for(const side of [-1,1]){
      const e=side<0?edges[0]:edges.at(-1)!,stripe=Math.floor((bb.x+bb.w/2)/1024),h=l11Hash(seed,stripe,y,side,723)
      const ladder=y%64===0&&h%10<3,drain=!ladder&&h%7===0;if(!ladder&&!drain)continue
      const length=Math.hypot(e.dx,e.dy),nx=side*Math.abs(e.dy)/length,ny=-side*e.dx*Math.sign(e.dy)/length
      if(roads.some(r=>!r.pedestrian&&r.points.slice(1).some((p,k)=>segmentDistance(e.x,y,r.points[k],p)<r.width/2+4)))continue
      const key=ladder?'canal_ladder':'sewer_outlet',offset=ladder?.44:.12,x=e.x-nx*offset,py=y-ny*offset
      const landX=e.x+nx*1.6,landY=y+ny*1.6
      out.push({key,id:`canal:${seed}:${stripe}:${key}:${y}:${side}`,x,y:py,angle:Math.atan2(-nx,ny),base:ladder?L11_WATER_SURFACE-1.4:L11_WATER_SURFACE-.2,landX,landY,landZ:l11TerrainHeight(seed,landX,landY)+.03,side})
    }
  }
  return out
}
