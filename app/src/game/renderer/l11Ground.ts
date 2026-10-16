import type { GameMap } from '../world/mapgen'
import type { L11ChunkData } from '../world/l11Types'
import { bounds, clipping, intersects, rectangle, strip, type Polygon, type MultiPolygon } from '../world/l11Geometry'

/** A park owns its ground polygon. Never lay grass over a second concrete
 * surface: different triangulations intersect even if given a small Y offset. */
export function l11GroundPolygons(m: GameMap, data: L11ChunkData, domain: Polygon, exclusions: Polygon[]) {
  const ox=m.inf?.ox??0,oy=m.inf?.oy??0,b=bounds(domain),runs:Polygon[]=[]
  const x0=Math.floor(b.x),x1=Math.ceil(b.x+b.w),y0=Math.floor(b.y),y1=Math.ceil(b.y+b.h)
  const grassAt=(x:number,y:number)=>x-ox>=0&&y-oy>=0&&x-ox<m.w&&y-oy<m.h&&m.tint[(y-oy)*m.w+x-ox]===54
  // Merge runs before clipping, instead of generating 1,024 overlapping tiles.
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;){
    if(!grassAt(x,y)){x++;continue}
    const start=x;while(x<x1&&grassAt(x,y))x++
    runs.push(rectangle(start,y,x-start,1))
  }
  const water=data.canals.flatMap(c=>c.water)
  let grass:MultiPolygon=[]
  if(runs.length){
    const hard: (Polygon|MultiPolygon)[]=[...exclusions,...water,rectangle(28,54,52,48),...data.canals.map(c=>c.banks),...data.alleys.map(a=>a.polygon)]
    for(const road of data.roads)for(let i=1;i<road.points.length;i++)hard.push(strip(road.points[i-1],road.points[i],road.width+6))
    for(const building of data.buildings)for(const ring of building.footprint)for(let i=1;i<ring.length;i++){
      const p=ring[i-1],q=ring[i],len=Math.hypot(q[0]-p[0],q[1]-p[1]);if(len<5)continue
      if(Math.hypot((p[0]+q[0])/2-building.door[0],(p[1]+q[1])/2-building.door[1])<7)continue
      const nx=(q[1]-p[1])/len,ny=-(q[0]-p[0])/len
      hard.push(strip([p[0]+nx*.65,p[1]+ny*.65],[q[0]+nx*.65,q[1]+ny*.65],1.1))
    }
    grass=clipping.difference(clipping.intersection(clipping.union(runs[0],...runs.slice(1)),domain),...hard.filter(p=>intersects(bounds(p),b)))
  }
  const yard=clipping.difference(domain,...water,...exclusions,...grass)
  return {grass,yard}
}
