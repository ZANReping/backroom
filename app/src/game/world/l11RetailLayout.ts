import type { L11Building } from './l11Types'
import { l11InteriorPlan, type L11Room, type L11InteriorFloor } from './l11Interiors'
import { l11Shopfront } from './l11Shopfront'
import { segmentDistance, type Point } from './l11Geometry'

/** u runs along the shopfront; v runs into the shop. Both furniture and lights
 * follow this frame on every compass orientation and rotated city block. */
export function l11RetailFrame(b:L11Building,r:L11Room,f:L11InteriorFloor){
  const doors=f.doors.filter(d=>d.from===r.id||d.to===r.id)
  const street=doors.find(d=>d.to==='street'),door=street??doors[0]
  const edges:[L11Building['front'],number][]=[['n',Math.abs((door?.center[1]??r.y)-r.y)],['s',Math.abs((door?.center[1]??r.y)-r.y-r.h)],['w',Math.abs((door?.center[0]??r.x)-r.x)],['e',Math.abs((door?.center[0]??r.x)-r.x-r.w)]]
  const corner=l11Shopfront(b),isCorner=r.floor===0&&corner?.available&&Math.abs(r.x-corner.x)<.01&&Math.abs(r.y-corner.y)<.01
  const side=isCorner?corner.side:edges.sort((a,c)=>a[1]-c[1])[0][0]
  const angle=side==='n'?0:side==='s'?Math.PI:side==='e'?Math.PI/2:-Math.PI/2
  const W=side==='n'||side==='s'?r.w:r.h,D=side==='n'||side==='s'?r.h:r.w
  const point=(u:number,v:number):Point=>side==='n'?[r.x+u,r.y+v]:side==='s'?[r.x+r.w-u,r.y+r.h-v]:side==='e'?[r.x+r.w-v,r.y+u]:[r.x+v,r.y+r.h-u]
  return {side,angle,W,D,point}
}

export function l11RetailLayout(b:L11Building,r:L11Room,f:L11InteriorFloor){
  const frame=l11RetailFrame(b,r,f),{W,D,point,angle}=frame
  const fixtures:{key:string;x:number;y:number;angle:number}[]=[],lights:{x:number;y:number;angle:number}[]=[]
  const add=(key:string,u:number,v:number,turn=0)=>{const [x,y]=point(u,v);fixtures.push({key,x,y,angle:angle+turn})}
  // A street-facing checkout, clear shopfront zone, central through route and
  // cross-aisles at the ends of double-sided gondolas. Do not face all racks east.
  add('retail_checkout',Math.min(1.65,W*.25),Math.min(2.15,D*.3))
  if(W>=4.8&&D>=5.2){
    for(const u of [W*.25,W*.75])for(let v=3.8;v<D-2;v+=1.36)add('retail_gondola',u,v,Math.PI/2)
  }else{
    for(const u of [W*.25,W*.75])add('display_rack',u,D*.6)
  }
  // Tall refrigerated cabinets belong against opaque interior walls. The
  // glazed return remains transparent when looking in from the other street.
  for(let u=.95;u<W-.8;u+=1.28){
    const rear=point(u,D)
    if(f.walls.some(w=>segmentDistance(...rear,w.a,w.b)<.03))add('retail_cooler',u,D-.56)
  }
  // Suspended linear fixtures form rows over the actual aisles, not one tiny
  // lamp at the centre of a 140m² shop. Physical sources share the same layout.
  const cols=Math.max(1,Math.ceil(W/3.6)),rows=Math.max(1,Math.ceil(D/3.5))
  for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
    const [x,y]=point((i+.5)*W/cols,(j+.5)*D/rows);lights.push({x,y,angle:angle+Math.PI/2})
  }
  return {frame,fixtures,lights}
}

/** Only the ground-floor corner tenant is visible through these two glazed
 * elevations. Rooms behind its partitions and upstairs stay independently lit. */
export function l11VisibleRetailRoom(b:L11Building,worldX:number,worldY:number,feet:number):string|undefined {
  if(Math.abs(feet-b.base)>1.6)return
  const shop=l11Shopfront(b);if(!shop?.available)return
  const c=Math.cos(b.angle),s=Math.sin(b.angle),dx=worldX-b.ox,dy=worldY-b.oy,x=dx*c+dy*s,y=-dx*s+dy*c
  const faces=[shop.side,shop.back]
  const visible=faces.some(side=>{
    const ew=side==='e'||side==='w',face=side==='e'?b.width:side==='s'?b.depth:0,n=side==='e'||side==='s'?1:-1
    const distance=((ew?x:y)-face)*n,along=ew?y:x,lo=ew?shop.y:shop.x,span=ew?shop.h:shop.w
    return distance>=-.1&&distance<18&&along>lo-3&&along<lo+span+3
  })
  if(visible)return l11InteriorPlan(b).floors[0]?.rooms.find(r=>r.kind==='shop'&&Math.abs(r.x-shop.x)<.01&&Math.abs(r.y-shop.y)<.01)?.id
}
