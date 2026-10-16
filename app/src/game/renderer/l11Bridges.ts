import { CityBatch } from './l11Batch'
import { l11Material } from './l11Materials'
import { l11BridgeDeck,l11BridgePiers } from '../world/l11Hydrology'
import type { L11ChunkData } from '../world/l11Types'
import { clipping,rectangle,transform } from '../world/l11Geometry'
import { addL11BridgeSkin } from './l11BridgeSkin'

/** Closed concrete slab beneath the asphalt and pedestrian paving. Bottom
 * normals point down; side walls follow the complete clipped bridge boundary. */
export function addL11BridgeDeck(batch:CityBatch,data:L11ChunkData,ox:number,oy:number){
  const deck=l11BridgeDeck(data),mat=l11Material('concrete','#969c96')
  for(const b of deck.colliders){
    const v=b.volume.vertices.map(p=>[p[0]-ox,p[1],p[2]-oy])
    batch.quad(mat,[v[0],v[1],v[2],v[2]],[0,1,0])
    batch.quad(mat,[v[3],v[4],v[5],v[5]],[0,-1,0])
  }
  addL11BridgeSkin(batch,deck.polygons,data,ox,oy)
  const domain=rectangle(data.cx*32,data.cy*32,32,32)
  for(const bridge of data.bridges)for(const p of l11BridgePiers(data.seed,bridge)){
    for(const poly of clipping.intersection(p.polygon,domain))batch.prism(mat,transform(poly,-ox,-oy,0),p.bottom,p.top)
  }
}
