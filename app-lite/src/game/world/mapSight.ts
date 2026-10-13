import type {Engine} from '../engine'
import {floorHeight,structColliders,wallAt} from './mapgen'
import {mapVision} from '../content/mapPlayer'
import {look} from '../renderer/shared'
type Rect={x:number;y:number;w:number;h:number}
export type MapSight={points:{x:number;y:number}[];cells:number[];range:number}
const states=new WeakMap<Engine,{time:number;gameTime:number;x:number;y:number;z:number;band:number;yaw:number;fov:number;range:number;rev:number;map:unknown;sight:MapSight}>()
/** Ray/grid traversal visits only visible cells, rather than doing a long LOS
 * test for every tile in a large circle. Both map overlays and exploration use
 * these exact hit points. Querying a paused map never reveals new cells. */
export function mapSight(eng:Engine,yaw=look.yaw):MapSight{
 const m=eng.map!,p=eng.player,range=Math.min(mapVision.range,Math.hypot(m.w,m.h)),old=states.get(eng),rev=m.inf?.rev??eng.mapRev,time=performance.now()
 const eye=p.z+(p.crouching?.95:1.55),band=p.floor,fov=mapVision.fov
 // Wall-clock expiry also catches opening a door while the map/game is paused.
 if(old&&old.map===m&&old.rev===rev&&time-old.time<80&&eng.time-old.gameTime<.08&&p.x===old.x&&p.y===old.y&&eye===old.z&&band===old.band&&yaw===old.yaw&&fov===old.fov&&old.range===range)return old.sight
 const bins=new Map<number,Rect[]>(),cells=new Set<number>(),points:MapSight['points']=[]
 for(const s of m.structures){
  if(!s.solid||s.data?.noSight===1||(s.floor??0)!==band)continue
  const base=floorHeight(m,s.x+s.w/2,s.y+s.h/2,band)
  for(const b of structColliders(s,m)){
   if(eye<base+(b.bottom??0)-.04||eye>base+(s.kind==='frontdesk'?1.24:b.top)+.04)continue
   if(b.x0>p.x+range||b.x1<p.x-range||b.y0>p.y+range||b.y1<p.y-range)continue
   const r={x:b.x0,y:b.y0,w:b.x1-b.x0,h:b.y1-b.y0}
   for(let y=Math.max(0,Math.floor(b.y0));y<=Math.min(m.h-1,Math.floor(b.y1));y++)for(let x=Math.max(0,Math.floor(b.x0));x<=Math.min(m.w-1,Math.floor(b.x1));x++){const k=y*m.w+x,list=bins.get(k)??[];list.push(r);bins.set(k,list)}
  }
 }
 const ray=(angle:number,reach:number)=>{
  const dx=-Math.sin(angle),dy=-Math.cos(angle),sx=dx<0?-1:1,sy=dy<0?-1:1
  let x=Math.floor(p.x),y=Math.floor(p.y),t=0,tx=Math.abs(dx)<1e-8?Infinity:((dx<0?x:x+1)-p.x)/dx,ty=Math.abs(dy)<1e-8?Infinity:((dy<0?y:y+1)-p.y)/dy
  while(t<=reach&&x>=0&&y>=0&&x<m.w&&y<m.h){
   const i=y*m.w+x;cells.add(i)
   if(wallAt(m,x,y,band))return Math.min(t,reach)
   let hit=Infinity
   for(const b of bins.get(i)??[]){
    let lo=0,hi=reach
    if(Math.abs(dx)<1e-8){if(p.x<b.x||p.x>b.x+b.w)continue}else{const a=(b.x-p.x)/dx,c=(b.x+b.w-p.x)/dx;lo=Math.max(lo,Math.min(a,c));hi=Math.min(hi,Math.max(a,c))}
    if(Math.abs(dy)<1e-8){if(p.y<b.y||p.y>b.y+b.h)continue}else{const a=(b.y-p.y)/dy,c=(b.y+b.h-p.y)/dy;lo=Math.max(lo,Math.min(a,c));hi=Math.min(hi,Math.max(a,c))}
    if(lo<=hi&&hi>.001&&lo<=Math.min(tx,ty)+.0001)hit=Math.min(hit,lo)
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
  points.push({x:-Math.sin(angle)*distance,y:-Math.cos(angle)*distance})
 }
 for(let i=0;i<32;i++)ray(i*Math.PI/16,mapVision.near)
 const sight={points,cells:[...cells],range}
 states.set(eng,{time,gameTime:eng.time,x:p.x,y:p.y,z:eye,band,yaw,fov,range,rev,map:m,sight})
 return sight
}
export function revealMapSight(eng:Engine){
 for(const i of mapSight(eng).cells)eng.explored[i]=1
}
