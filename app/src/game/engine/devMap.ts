import {ensureTradersAt} from '../world/tradersWorld'
import type {Engine} from '../engine'
import type {FloorBand} from '../core/types'
import {floorHeight,structColliders} from '../world/mapgen'
import {canOccupy,PLAYER_RADIUS} from '../core/player'
import {insideRedZone,redZonesNear} from '../world/l0RedZone'
import {l1MapGeometry,type L1MapDoor} from '../world/l1MapData'
import {rememberL7ChartCell,recalledL7ChartCell} from '../world/l7ChartCache'
import {prepareChunkWindow} from '../world/chunkCache'
import {resetSwim} from './swim'
export type DevMapCell={seaFloor?:Float32Array;liquid?:Uint8Array;cx:number;cy:number;variant?:string;crawl?:Uint8Array;tiles:Uint8Array;tint:Uint8Array;elev:Uint8Array;regions?:Uint8Array;wet?:Uint8Array;doors?:L1MapDoor[];pits?:{x:number;y:number;w:number;h:number}[];walls:{x:number;y:number;w:number;h:number;round?:boolean;kind?:string}[]}
export type DevMapPreview={cells:DevMapCell[];labels:{x:number;y:number;text:string}[];level?:number;seed?:number}
let worker:Worker|undefined,serial=0
const previewCache=new Map<string,DevMapCell>(),chartTiles=new Uint8Array(1024).fill(1),chartTint=new Uint8Array(1024)
type Task={id:number;level:number;seed:number;resolve:(v:DevMapPreview)=>void;reject:(e:unknown)=>void;data:DevMapPreview;keys:Map<string,string>;signal:AbortSignal;abort:()=>void;progress?:ReturnType<typeof setTimeout>;publish?:()=>void}
let active:Task|undefined
const put=(key:string,cell:DevMapCell)=>{previewCache.delete(key);previewCache.set(key,cell);while(previewCache.size>256)previewCache.delete(previewCache.keys().next().value!)}
function close(task:Task){if(task.progress)clearTimeout(task.progress);task.signal.removeEventListener('abort',task.abort);if(active===task)active=undefined}
function ensureWorker(){
 if(worker)return
 worker=new Worker(new URL('../world/devMap.worker.ts',import.meta.url),{type:'module'})
 worker.onmessage=e=>{
  const a=active;if(!a||e.data.id!==a.id)return
  if(e.data.error){close(a);a.reject(Error(e.data.error));return}
  if(e.data.done){a.publish?.();close(a);a.resolve(a.data);return}
  const c=e.data.cell as DevMapCell;a.data.cells.push(c);if(e.data.label)a.data.labels.push(e.data.label)
  // Retain completed cells immediately, even if the next drag cancels this job.
  if(a.level===7&&c.seaFloor&&c.liquid){rememberL7ChartCell(a.seed,{cx:c.cx,cy:c.cy,seaFloor:c.seaFloor,liquid:c.liquid,elev:c.elev});const key=a.keys.get(`${c.cx},${c.cy}`);if(key)put(key,c)}
  if(a.publish&&!a.progress)a.progress=setTimeout(()=>{a.progress=undefined;if(active===a&&!a.signal.aborted)a.publish?.()},16)
 }
 worker.onerror=e=>{const a=active;if(a){close(a);a.reject(Error(e.message))}worker?.terminate();worker=undefined}
}
export function requestDevMapPreview(eng:Engine,view:{x:number;y:number;span:number;floor:number},signal:AbortSignal,onProgress?:(data:DevMapPreview)=>void):Promise<DevMapPreview>{
 const m=eng.map;if(!m||(!eng.devEnabled&&!m.l1Architecture&&![2,3,4,7].includes(eng.levelDef.id))||signal.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'))
 const {floor}=view,span=Math.max(32,Math.min(512,view.span)),inf=m.inf,level=eng.levelDef.id
 const coords:{cx:number;cy:number}[]=[]
 for(let cy=Math.floor((view.y-span/2)/32);cy<=Math.floor((view.y+span/2)/32);cy++)for(let cx=Math.floor((view.x-span/2)/32);cx<=Math.floor((view.x+span/2)/32);cx++){
  const key=`${cx},${cy}`
  if((m.l1Architecture||[2,3,4,7].includes(level))&&!(eng.devEnabled&&eng.dev.mapReveal)&&!inf?.chunks.has(key)&&!inf?.explored.get(key)?.some(Boolean))continue
  coords.push({cx,cy})
 }
 if(!inf){
  const cells:DevMapCell[]=[],source=floor<0?m.dn:floor===1?m.up:floor===2?m.up2:m.tiles
  for(const c of coords){const tiles=new Uint8Array(1024),tint=new Uint8Array(1024),elev=new Uint8Array(1024)
   for(let i=0;i<1024;i++){const x=c.cx*32+i%32,y=c.cy*32+(i>>5);if(x>=0&&y>=0&&x<m.w&&y<m.h){const j=y*m.w+x;tiles[i]=source[j];tint[i]=m.tint[j];elev[i]=m.elev[j]}}
   const walls=m.structures.filter(s=>s.solid&&(s.floor??0)===floor).flatMap(s=>structColliders(s,m)).filter(r=>r.x0<c.cx*32+32&&r.x1>c.cx*32&&r.y0<c.cy*32+32&&r.y1>c.cy*32).map(r=>({x:r.x0,y:r.y0,w:r.x1-r.x0,h:r.y1-r.y0}))
   cells.push({...c,tiles,tint,elev,walls})
  }return Promise.resolve({cells,labels:[],level})
 }
 if(active){const old=active;worker?.postMessage({cancel:true,id:old.id});close(old);old.reject(new DOMException('Replaced','AbortError'))}
 const ready:DevMapPreview={cells:[],labels:[],level,seed:inf.seed},missing:typeof coords=[],keys=new Map<string,string>()
 const stateKey=JSON.stringify(inf.l0?.redProgress??{})
 for(const c of coords){
  const cellKey=`${c.cx},${c.cy}`,key=`${level}:${inf.seed}:${floor}:${cellKey}:${inf.l0?.revisions[cellKey]??0}:${stateKey}`,live=inf.chunks.get(cellKey)
  keys.set(cellKey,key)
  if(level===7){
   const chart=live?.seaFloor&&live.liquid?rememberL7ChartCell(inf.seed,{...c,seaFloor:live.seaFloor,liquid:live.liquid,elev:live.elev}):recalledL7ChartCell(inf.seed,c.cx,c.cy)
   if(chart){ready.cells.push({...chart,variant:c.cx===0&&c.cy===0?'entry':'ocean',tiles:chartTiles,tint:chartTint,walls:[]});continue}
  }
  if(live){
   const source=floor<0?live.dn:floor===1?live.up:floor===2?live.up2:live.tiles,l1=live.l1?l1MapGeometry(live.l1):undefined
   const walls=l1?.walls??(live.l0?live.l0.walls.filter(w=>w.bottom<1.8&&w.top>.05).map(w=>({x:w.x,y:w.y,w:w.w,h:w.h})):live.structures.filter(s=>s.solid&&(s.floor??0)===floor).flatMap(s=>structColliders(s,m).map(r=>({x:r.x0+inf.ox,y:r.y0+inf.oy,w:r.x1-r.x0,h:r.y1-r.y0,kind:s.kind}))))
   ready.cells.push({...c,variant:live.variant,crawl:live.crawl,tiles:source??new Uint8Array(1024),tint:live.tint,elev:live.elev,walls,regions:l1?.regions??live.l0?.mapRegions,pits:live.l0?.pits,wet:l1?.wet,doors:l1?.doors})
  }else{const cached=previewCache.get(key);if(cached){previewCache.delete(key);previewCache.set(key,cached);ready.cells.push(cached)}else missing.push(c)}
 }
 const publish=()=>{if(!signal.aborted)onProgress?.({...ready,cells:[...ready.cells],labels:[...ready.labels]})}
 publish()
 if(signal.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'))
 if(!missing.length)return Promise.resolve(ready)
 if(level===7)missing.sort((a,b)=>Math.hypot(a.cx*32+16-view.x,a.cy*32+16-view.y)-Math.hypot(b.cx*32+16-view.x,b.cy*32+16-view.y))
 ensureWorker();const id=++serial
 return new Promise<DevMapPreview>((resolve,reject)=>{
  const task:Task={id,level,seed:inf.seed,resolve,reject,data:ready,keys,signal,abort:()=>{if(active===task){close(task);worker?.postMessage({cancel:true,id});reject(new DOMException('Cancelled','AbortError'))}},publish:onProgress?publish:undefined}
  active=task;signal.addEventListener('abort',task.abort,{once:true})
  worker!.postMessage({id,def:eng.levelDef,seed:inf.seed,coords:missing,floor,state:inf.l0})
 }).then(result=>{
  for(const c of result.cells)if(!inf.chunks.has(`${c.cx},${c.cy}`)){const key=keys.get(`${c.cx},${c.cy}`);if(key)put(key,c)}
  for(const c of result.cells){const live=inf.chunks.get(`${c.cx},${c.cy}`);if(live?.l0){c.walls=live.l0.walls.filter(w=>w.bottom<1.8&&w.top>.05).map(w=>({x:w.x,y:w.y,w:w.w,h:w.h}));c.regions=live.l0.mapRegions;c.pits=live.l0.pits}else if(live?.l1){const a=l1MapGeometry(live.l1);c.walls=a.walls;c.regions=a.regions;c.wet=a.wet;c.doors=a.doors}}
  return result
 })
}

export async function devMapTeleport(eng:Engine,target:{x:number;y:number;floor:number}):Promise<boolean>{
 const m=eng.map;if(!eng.devEnabled||!m||![target.x,target.y].every(Number.isFinite)||Math.max(Math.abs(target.x),Math.abs(target.y))>1e6||![-1,0,1,2].includes(target.floor))return false
 const inf=m.inf,wx=eng.player.x+(inf?.ox??0),wy=eng.player.y+(inf?.oy??0)
 const confinement=inf?.l0?redZonesNear(inf.seed,Math.floor(wx/32),Math.floor(wy/32)).find(z=>insideRedZone(z,wx,wy)&&inf.l0?.redProgress?.[z.id]?.closed.length===z.gates.length):undefined
 if(confinement&&!insideRedZone(confinement,target.x,target.y,.4)){eng.msg('当前红室已封闭，地图传送只能选择围墙内部。','system');return false}
 const l7=eng.levelDef.id===7
 // Prepare distant L7 raw chunks off the main thread before changing position.
 if(l7&&inf){const cx=Math.floor(target.x/32),cy=Math.floor(target.y/32);let missing=false;for(let y=cy-2;y<=cy+2;y++)for(let x=cx-2;x<=cx+2;x++)if(!inf.chunks.has(`${x},${y}`))missing=true
  if(missing)await prepareChunkWindow(eng.levelDef,inf.seed,cx,cy)
  if(eng.map!==m||!eng.devEnabled)return false
 }
 const snapshot=structuredClone(m),explored=eng.explored.slice(),previous={...eng.player},floor=(l7?0:target.floor) as FloorBand
 const transient={fakes:structuredClone(eng.fakes),particles:structuredClone(eng.particles),projectiles:structuredClone(eng.projectiles),npcs:eng.npcs,searching:eng.searching,lootPanel:eng.lootPanel,interactTarget:eng.interactTarget,ride:eng.ride,climb:eng.climb,porchDrop:eng.porchDrop,bonusExit:eng.bonusExit}
 if(floor===-1&&!m.hasUnderground||floor===1&&!m.up.some(Boolean)&&!inf||floor===2&&!m.up2.some(Boolean)&&!inf)return false
 try{
  eng.player.x=target.x-(inf?.ox??0);eng.player.y=target.y-(inf?.oy??0);eng.player.floor=floor
  if(inf)eng.updateInfiniteWindow()
  if(m.traders)ensureTradersAt(m,target.x,target.y,6)
  const x=target.x-(m.inf?.ox??0),y=target.y-(m.inf?.oy??0)
  const candidates=[{x,y}]
  for(let r=.25;r<=3;r+=.25)for(let i=0;i<32;i++)candidates.push({x:x+r*Math.cos(i*Math.PI/16),y:y+r*Math.sin(i*Math.PI/16)})
  for(const p of candidates){
   if(p.x<1||p.y<1||p.x>=m.w-1||p.y>=m.h-1)continue
   if(confinement&&!insideRedZone(confinement,p.x+m.inf!.ox,p.y+m.inf!.oy,.4))continue
   const z=floorHeight(m,p.x,p.y,floor),i=Math.floor(p.y)*m.w+Math.floor(p.x)
   if(!Number.isFinite(z)||(!l7&&(floor===0&&z< -1||m.liquid[i]===1))||!canOccupy(m,p.x,p.y,PLAYER_RADIUS,{z:z+.02,band:floor,crouch:false,...(l7?{from:p}:{})}))continue
   Object.assign(eng.player,{x:p.x,y:p.y,z:z+.02,vz:0,floor,crouching:false});if(l7){eng.seating=eng.ride=eng.climb=eng.porchDrop=null;eng.onStairs=false;eng.moveIt.acc=0;resetSwim(eng.swim);eng.breathT=0;eng.inLiquid=m.liquid[i]===1?1:0;eng.submerged=eng.inLiquid===1&&z+1.55<0;eng.wasSubmerged=eng.submerged}eng.msg(`[DEV] 已传送至 ${target.x.toFixed(1)}, ${target.y.toFixed(1)}`,'system');return true
  }
 }catch{/* Restore the same player and world state on failure. */}
 eng.map=snapshot;eng.mapRev++;eng.explored=explored;Object.assign(eng,transient);Object.assign(eng.player,previous);eng.msg('目标附近 3 米内没有安全落点，已保留原位置。','system');return false
}
