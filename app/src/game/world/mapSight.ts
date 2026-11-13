import {l11BuildingSightColliders} from './l11Collision'
import {seatedEyeHeight,seatedEyeOffset} from '../engine/seating'
import type {Engine} from '../engine'
import {floorHeight,structColliders,wallAt} from './mapgen'
import {mapVision} from '../content/mapPlayer'
import {look} from '../renderer/shared'
import {traceMapSight,type SightField,type SightQuery,type SightRect as Rect} from './mapSightTrace'
import {requestSight,sightWorkerAvailable} from './mapSightWorker'
export type {MapSight} from './mapSightTrace'
import type {MapSight} from './mapSightTrace'
const states=new WeakMap<Engine,{time:number;gameTime:number;x:number;y:number;z:number;band:number;yaw:number;fov:number;range:number;rev:number;mapRev:number;map:unknown;sight:MapSight;field:SightField;query:SightQuery}>()
const cityBins=new WeakMap<Engine,{map:unknown;structures:unknown;rev:number;mapRev:number;band:number;low:number;high:number;bins:Map<number,Rect[]>;field?:SightField}>()
const revealed=new WeakMap<Engine,{cells:number[];explored:unknown}>()
/** Ray/grid traversal visits only visible cells, rather than doing a long LOS
 * test for every tile in a large circle. Both map overlays and exploration use
 * these exact hit points. Querying a paused map never reveals new cells. */
function prepareSight(eng:Engine,yaw=look.yaw){
 const m=eng.map!,p=eng.player,range=Math.min(mapVision.range,Math.hypot(m.w,m.h)),old=states.get(eng),rev=m.inf?.rev??eng.mapRev,time=performance.now()
 const eye=p.z+(eng.seating?seatedEyeHeight(eng):p.crouching?.95:1.55),band=p.floor,fov=mapVision.fov,city=p.level===11
 const offset=seatedEyeOffset(eng),ox=p.x+offset.x,oy=p.y+offset.y
 // Wall-clock expiry also catches opening a door while the map/game is paused.
 if(old&&old.map===m&&old.rev===rev&&old.mapRev===eng.mapRev&&time-old.time<80&&eng.time-old.gameTime<.08&&(city?Math.hypot(p.x-old.x,p.y-old.y)<.18&&Math.abs(eye-old.z)<.12&&Math.abs(yaw-old.yaw)<.006:p.x===old.x&&p.y===old.y&&eye===old.z&&yaw===old.yaw)&&band===old.band&&fov===old.fov&&old.range===range)return {cached:old.sight,field:old.field,query:old.query}
 const cached=city?cityBins.get(eng):undefined,reuse=cached&&cached.map===m&&cached.structures===m.structures&&cached.rev===rev&&cached.mapRev===eng.mapRev&&cached.band===band&&eye>cached.low&&eye<cached.high
 const bins=reuse?cached.bins:new Map<number,Rect[]>()
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
 if(city)cityBins.set(eng,{map:m,structures:m.structures,rev,mapRev:eng.mapRev,band,low,high,bins})
 }
 let wallEntry=wallFields.get(m)
 if(!wallEntry||wallEntry.rev!==rev||wallEntry.mapRev!==eng.mapRev||wallEntry.tiles!==m.tiles||wallEntry.band!==band){
  const walls=city?null:new Uint8Array(m.w*m.h)
  if(walls)for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++)walls[y*m.w+x]=Number(wallAt(m,x,y,band))
  wallEntry={rev,mapRev:eng.mapRev,tiles:m.tiles,band,walls};wallFields.set(m,wallEntry)
 }
 const query:SightQuery={ox,oy,offsetX:offset.x,offsetY:offset.y,yaw,range,fov,near:mapVision.near}
 let field:SightField
 if(reuse&&cached.field)field=cached.field
 else field={w:m.w,h:m.h,walls:wallEntry.walls,bins}
 if(city){const c=cityBins.get(eng);if(c)c.field=field}
 return {field,query,stamp:{time,gameTime:eng.time,x:p.x,y:p.y,z:eye,band,yaw,fov,range,rev,mapRev:eng.mapRev,map:m}}
}
const wallFields=new WeakMap<object,{rev:number;mapRev:number;tiles:Uint8Array;band:number;walls:Uint8Array|null}>()
/** Synchronous, exact-pose query for an open map; it never reveals cells. */
export function mapSight(eng:Engine,yaw=look.yaw):MapSight{
 const p=prepareSight(eng,yaw)
 if(p.cached)return p.cached
 const sight=traceMapSight(p.field,p.query)
 states.set(eng,{...p.stamp!,sight,field:p.field,query:p.query})
 return sight
}
type Observation={at:number;pending:boolean;map:unknown;rev:number;mapRev:number;band:number;ox:number;oy:number;explored:unknown;cells:Uint32Array}
const observations=new WeakMap<Engine,Observation>()
/** Exploration can lag by one Worker job, but accepts only genuinely observed
 * cells from the same map/window/revision. The UI fan stays exact and synchronous. */
export function revealMapSight(eng:Engine){
 if(![1,5,11].includes(eng.player.level)||!sightWorkerAvailable()){observations.delete(eng);return revealSynchronous(eng)}
 const m=eng.map!,mapRev=eng.mapRev,band=eng.player.floor,rev=m.inf?.rev??eng.mapRev,ox=m.inf?.ox??0,oy=m.inf?.oy??0,now=performance.now()
 let state=observations.get(eng)
 if(!state||state.map!==m||state.rev!==rev||state.mapRev!==mapRev||state.band!==band||state.ox!==ox||state.oy!==oy||state.explored!==eng.explored){
  state={at:-Infinity,pending:false,map:m,rev,mapRev,band,ox,oy,explored:eng.explored,cells:new Uint32Array()}
  observations.set(eng,state)
 }
 // At most 12.5 observations per second, independent of render/simulation FPS.
 if(state.pending||now-state.at<80)return state.cells
 state.at=now;state.pending=true
 const prep=prepareSight(eng),owner=state,explored=eng.explored
 const accepted=requestSight(prep.field,prep.query,cells=>{
  owner.pending=false
  if(!cells||observations.get(eng)!==owner||eng.map!==m||eng.explored!==explored||eng.mapRev!==mapRev||eng.player.floor!==band||(m.inf?.rev??eng.mapRev)!==rev||(m.inf?.ox??0)!==ox||(m.inf?.oy??0)!==oy)return
  owner.cells=cells
  for(const i of cells)if(i<explored.length)explored[i]=1
 })
 if(!accepted){state.pending=false;observations.delete(eng);return revealSynchronous(eng)}
 return state.cells
}
function revealSynchronous(eng:Engine){
 const cells=mapSight(eng).cells,old=revealed.get(eng)
 if(old?.cells===cells&&old.explored===eng.explored)return cells
 for(const i of cells)eng.explored[i]=1
 revealed.set(eng,{cells,explored:eng.explored})
 return cells
}
