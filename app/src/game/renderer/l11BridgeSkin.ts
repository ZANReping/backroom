import { ShapeUtils,Vector2 } from 'three'
import { CityBatch } from './l11Batch'
import { l11Material } from './l11Materials'
import { l11StreetHeight,L11_BRIDGE_TOP_LIFT,L11_BRIDGE_THICKNESS } from '../world/l11Hydrology'
import type { L11ChunkData } from '../world/l11Types'
import type { Polygon } from '../world/l11Geometry'

/** The steel edge and concrete underside follow the same arch stations as
 * the closed collision slab. UVs remain metric on oblique faces. */
export function addL11BridgeSkin(batch:CityBatch,polygons:readonly Polygon[],data:Pick<L11ChunkData,'seed'|'bridges'>,ox:number,oy:number,underside=false){
  const web=l11Material('metal','#557d6a'),edge=l11Material('metal','#426754'),concrete=l11Material('concrete','#969c96')
  for(const p of polygons){
    for(const ring of p)for(let i=1;i<ring.length;i++){
      const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<1e-6)continue
      const ah=l11StreetHeight(data,...a)+L11_BRIDGE_TOP_LIFT,bh=l11StreetHeight(data,...b)+L11_BRIDGE_TOP_LIFT,normal=[dy/len,0,-dx/len]
      // Flange edges and web are contiguous bands, without coplanar overlays.
      for(const [lo,hi,mat]of [[0,.065,edge],[.065,L11_BRIDGE_THICKNESS-.065,web],[L11_BRIDGE_THICKNESS-.065,L11_BRIDGE_THICKNESS,edge]] as const){
        batch.quad(mat,[[a[0]-ox,ah-lo,a[1]-oy],[b[0]-ox,bh-lo,b[1]-oy],[b[0]-ox,bh-hi,b[1]-oy],[a[0]-ox,ah-hi,a[1]-oy]],normal)
      }
    }
    if(underside){
      const rings=p.map(r=>r.slice(0,-1).map(v=>new Vector2(...v))),points=rings.flat()
      for(const tri of ShapeUtils.triangulateShape(rings[0],rings.slice(1))){
        const v=tri.map(i=>[points[i].x-ox,l11StreetHeight(data,points[i].x,points[i].y)+L11_BRIDGE_TOP_LIFT-L11_BRIDGE_THICKNESS,points[i].y-oy])
        batch.quad(concrete,[v[0],v[1],v[2],v[2]],[0,-1,0])
      }
    }
  }
}
