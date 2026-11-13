import type {Engine} from '../engine'
import {floorHeight,structColliders,wallAt} from './mapgen'
import {mapVision} from '../content/mapPlayer'
import {look} from '../renderer/shared'
import {inPolygon,type Polygon} from './l11Geometry'
import {l11BuildingSightColliders} from './l11Collision'
import {seatedEyeHeight,seatedEyeOffset} from '../engine/seating'
type Rect={x:number;y:number;w:number;h:number;polygon?:Polygon}
function polygonRay(polygon:Polygon,x:number,y:number,dx:number,dy:number){
 if(inPolygon(x,y,polygon))return 0
 let best=Infinity
 for(const ring of polygon)for(let i=1;i<ring.length;i++){
  const a=ring[i-1],b=ring[i],ex=b[0]-a[0],ey=b[1]-a[1],den=dx*ey-dy*ex
  if(Math.abs(den)<1e-9)continue
  const ax=a[0]-x,ay=a[1]-y,t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den
  if(t>=0&&u>=0&&u<=1)best=Math.min(best,t)
 }
 return best
}
export type MapSight={points:{x:number;y:number}[];cells:number[];range:number}
const states=new WeakMap<Engine,{time:number;gameTime:number;x:number;y:number;z:number;band:number;yaw:number;fov:number;range:number;rev:number;map:unknown;sight:MapSight}>()
const cityBins=new WeakMap<Engine,{map:unknown;structures:unknown;rev:number;band:number;low:number;high:number;bins:Map<number,Rect[]>}>()
const revealed=new WeakMap<Engine,{cells:number[];explored:unknown}>()
/** Ray/grid traversal visits only visible cells, rather than doing a long LOS
 * test for every tile in a large circle. Both map overlays and exploration use
 * these exact hit points. Querying a paused map never reveals new cells. */
export function mapSight(eng:Engine,yaw=look.yaw):MapSight{
 const m=eng.map!,p=eng.player,range=Math.min(mapVision.range,Math.hypot(m.w,m.h)),old=states.get(eng),rev=m.inf?.rev??eng.mapRev,time=performance.now()
 const eye=p.z+(eng.seating?seatedEyeHeight(eng):p.crouching?.95:1.55),band=p.floor,fov=mapVision.fov,city=p.level===11
 const offset=seatedEyeOffset(eng),ox=p.x+offset.x,oy=p.y+offset.y
 // Wall-clock expiry also catches opening a door while the map/game is paused.
 if(old&&old.map===m&&old.rev===rev&&time-old.time<80&&eng.time-old.gameTime<.08&&(city?Math.hypot(p.x-old.x,p.y-old.y)<.18&&Math.abs(eye-old.z)<.12&&Math.abs(yaw-old.yaw)<.006:p.x===old.x&&p.y===old.y&&eye===old.z&&yaw===old.yaw)&&band===old.band&&fov===old.fov&&old.range===range)return old.sight
 const cached=city?cityBins.get(eng):undefined,reuse=cached&&cached.map===m&&cached.structures===m.structures&&cached.rev===rev&&cached.band===band&&eye>cached.low&&eye<cached.high
 const bins=reuse?cached.bins:new Map<number,Rect[]>(),cells=new Set<number>(),points:MapSight['points']=[]
 let low=-Infinity,high=Infinity
 if(!reuse){
 for(const s of m.structures){
  if(!s.solid||s.data?.noSight===1||(!s.l11&&(s.floor??0)!==band))continue
  const base=s.l11?.base??floorHeight(m,s.x+s.w/2,s.y+s.h/2,band)
  for(const b of city&&s.l11?l11BuildingSightColliders(s):structColliders(s,m)){
   const bottom=base+(b.bottom??0)-.04,top=base+(s.kind==='frontdesk'?1.24:b.top)+.04
   // Reuse the city index until the eye crosses an actual vertical obstacle
   // boundary. Gentle terrain and ordinary footsteps need no re-indexing.
   if(eye<bottom){high=Math.min(high,bottom);continue}
   if(eye>top){low=Math.max(low,top);continue}
   low=Math.max(low,bottom);high=Math.min(high,top)
   if(!city&&(b.x0>p.x+range||b.x1<p.x-range||b.y0>p.y+range||b.y1<p.y-range))continue
   const r:Rect={x:b.x0,y:b.y0,w:b.x1-b.x0,h:b.y1-b.y0,polygon:b.polygon}
   for(let y=Math.max(0,Math.floor(b.y0));y<=Math.min(m.h-1,Math.floor(b.y1));y++)for(let x=Math.max(0,Math.floor(b.x0));x<=Math.min(m.w-1,Math.floor(b.x1));x++){const k=y*m.w+x,list=bins.get(k)??[];list.push(r);bins.set(k,list)}
  }
 }
 if(city)cityBins.set(eng,{map:m,structures:m.structures,rev,band,low,high,bins})
 }
 const ray=(angle:number,reach:number)=>{
  const dx=-Math.sin(angle),dy=-Math.cos(angle),sx=dx<0?-1:1,sy=dy<0?-1:1
  let x=Math.floor(ox),y=Math.floor(oy),t=0,tx=Math.abs(dx)<1e-8?Infinity:((dx<0?x:x+1)-ox)/dx,ty=Math.abs(dy)<1e-8?Infinity:((dy<0?y:y+1)-oy)/dy
  while(t<=reach&&x>=0&&y>=0&&x<m.w&&y<m.h){
   const i=y*m.w+x;cells.add(i)
   if(!city&&wallAt(m,x,y,band))return Math.min(t,reach)
   let hit=Infinity
   for(const b of bins.get(i)??[]){
    let lo=0,hi=reach
    if(Math.abs(dx)<1e-8){if(ox<b.x||ox>b.x+b.w)continue}else{const a=(b.x-ox)/dx,c=(b.x+b.w-ox)/dx;lo=Math.max(lo,Math.min(a,c));hi=Math.min(hi,Math.max(a,c))}
    if(Math.abs(dy)<1e-8){if(oy<b.y||oy>b.y+b.h)continue}else{const a=(b.y-oy)/dy,c=(b.y+b.h-oy)/dy;lo=Math.max(lo,Math.min(a,c));hi=Math.min(hi,Math.max(a,c))}
    if(lo<=hi&&hi>.001){if(b.polygon)lo=polygonRay(b.polygon,ox,oy,dx,dy);if(lo<=hi&&lo<=Math.min(tx,ty)+.0001)hit=Math.min(hit,lo)}
   }
   if(hit<Infinity)return Math.min(hit,reach)
   if(Math.abs(tx-ty)<1e-7){t=tx;x+=sx;y+=sy;tx+=1/Math.abs(dx);ty+=1/Math.abs(dy)}
   else if(tx<ty){t=tx;x+=sx;tx+=1/Math.abs(dx)}else{t=ty;y+=sy;ty+=1/Math.abs(dy)}
  }
  return Math.min(t,reach)
 }
 const count=Math.max(24,Math.ceil(range*fov*2.5))
 for(let i=0;i<=count;i++){
  const angle=yaw-fov/2+fov*i/count,distance=ray(angle,range)
  points.push({x:offset.x-Math.sin(angle)*distance,y:offset.y-Math.cos(angle)*distance})
 }
 for(let i=0;i<32;i++)ray(i*Math.PI/16,mapVision.near)
 const sight={points,cells:[...cells],range}
 states.set(eng,{time,gameTime:eng.time,x:p.x,y:p.y,z:eye,band,yaw,fov,range,rev,map:m,sight})
 return sight
}
export function revealMapSight(eng:Engine){
 const cells=mapSight(eng).cells,old=revealed.get(eng)
 if(old?.cells===cells&&old.explored===eng.explored)return
 for(const i of cells)eng.explored[i]=1
 revealed.set(eng,{cells,explored:eng.explored})
}
