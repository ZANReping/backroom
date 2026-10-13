import type {Engine} from '../engine'
import type {FloorBand} from '../core/types'
import {floorHeight,structColliders} from '../world/mapgen'
import {canOccupy,PLAYER_RADIUS} from '../core/player'
import {insideRedZone,redZonesNear} from '../world/l0RedZone'
export type DevMapCell={cx:number;cy:number;tiles:Uint8Array;tint:Uint8Array;elev:Uint8Array;regions?:Uint8Array;pits?:{x:number;y:number;w:number;h:number}[];walls:{x:number;y:number;w:number;h:number}[]}
export type DevMapPreview={cells:DevMapCell[];labels:{x:number;y:number;text:string}[]}
let worker:Worker|undefined,serial=0
const previewCache=new Map<string,DevMapCell>()
let active:{id:number;resolve:(v:DevMapPreview)=>void;reject:(e:unknown)=>void;data:DevMapPreview}|undefined
export function requestDevMapPreview(eng:Engine,view:{x:number;y:number;span:number;floor:number},signal:AbortSignal):Promise<DevMapPreview>{
 const m=eng.map;if(!eng.devEnabled||!m||signal.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'))
 const {floor}=view,span=Math.max(32,Math.min(512,view.span)),inf=m.inf
 const coords:{cx:number;cy:number}[]=[]
 for(let cy=Math.floor((view.y-span/2)/32);cy<=Math.floor((view.y+span/2)/32);cy++)for(let cx=Math.floor((view.x-span/2)/32);cx<=Math.floor((view.x+span/2)/32);cx++)coords.push({cx,cy})
 if(!inf){
  const cells:DevMapCell[]=[],source=floor<0?m.dn:floor===1?m.up:floor===2?m.up2:m.tiles
  for(const c of coords){const tiles=new Uint8Array(1024),tint=new Uint8Array(1024),elev=new Uint8Array(1024)
   for(let i=0;i<1024;i++){const x=c.cx*32+i%32,y=c.cy*32+(i>>5);if(x>=0&&y>=0&&x<m.w&&y<m.h){const j=y*m.w+x;tiles[i]=source[j];tint[i]=m.tint[j];elev[i]=m.elev[j]}}
   const walls=m.structures.filter(s=>s.solid&&(s.floor??0)===floor).flatMap(s=>structColliders(s,m)).filter(r=>r.x0<c.cx*32+32&&r.x1>c.cx*32&&r.y0<c.cy*32+32&&r.y1>c.cy*32).map(r=>({x:r.x0,y:r.y0,w:r.x1-r.x0,h:r.y1-r.y0}))
   cells.push({...c,tiles,tint,elev,walls})
  }return Promise.resolve({cells,labels:[]})
 }
 if(active){worker?.postMessage({cancel:true,id:active.id});active.reject(new DOMException('Replaced','AbortError'));active=undefined}
 const ready:DevMapPreview={cells:[],labels:[]},missing:typeof coords=[],keys=new Map<string,string>()
 const stateKey=JSON.stringify(inf.l0?.redProgress??{})
 for(const c of coords){
  const cellKey=`${c.cx},${c.cy}`,key=`${eng.levelDef.id}:${inf.seed}:${floor}:${cellKey}:${inf.l0?.revisions[cellKey]??0}:${stateKey}`,live=inf.chunks.get(cellKey)
  keys.set(cellKey,key)
  if(live){
   const source=floor<0?live.dn:floor===1?live.up:floor===2?live.up2:live.tiles
   const walls=live.l0?live.l0.walls.filter(w=>w.bottom<1.8&&w.top>.05).map(w=>({x:w.x,y:w.y,w:w.w,h:w.h})):live.structures.filter(s=>s.solid&&(s.floor??0)===floor).flatMap(s=>structColliders(s,m)).map(r=>({x:r.x0+inf.ox,y:r.y0+inf.oy,w:r.x1-r.x0,h:r.y1-r.y0}))
   ready.cells.push({...c,tiles:source??new Uint8Array(1024),tint:live.tint,elev:live.elev,walls,regions:live.l0?.mapRegions,pits:live.l0?.pits})
  }else{const cached=previewCache.get(key);if(cached)ready.cells.push(cached);else missing.push(c)}
 }
 // The normal opening view is already live: no worker startup or regeneration.
 if(!missing.length)return Promise.resolve(ready)
 if(!worker){worker=new Worker(new URL('../world/devMap.worker.ts',import.meta.url),{type:'module'});worker.onmessage=e=>{
  const a=active;if(!a||e.data.id!==a.id)return
  if(e.data.error){a.reject(Error(e.data.error));active=undefined}
  else if(e.data.done){a.resolve(a.data);active=undefined}
  else{a.data.cells.push(e.data.cell);if(e.data.label)a.data.labels.push(e.data.label)}
 };worker.onerror=e=>{active?.reject(Error(e.message));active=undefined;worker?.terminate();worker=undefined}}
 const id=++serial
 return new Promise<DevMapPreview>((resolve,reject)=>{
  active={id,resolve,reject,data:ready}
  signal.addEventListener('abort',()=>{if(active?.id===id){active.reject(new DOMException('Cancelled','AbortError'));active=undefined;worker?.postMessage({cancel:true,id})}},{once:true})
  // Worker only computes raw records; it cannot access the live map, entities or renderer.
  worker!.postMessage({id,def:eng.levelDef,seed:inf.seed,coords:missing,floor,state:inf.l0})
 }).then(data=>{
  const result=data as DevMapPreview
  for(const c of result.cells)if(!inf.chunks.has(`${c.cx},${c.cy}`)){const key=keys.get(`${c.cx},${c.cy}`)!;previewCache.set(key,c);if(previewCache.size>256)previewCache.delete(previewCache.keys().next().value!)}
  for(const c of result.cells){const live=inf.chunks.get(`${c.cx},${c.cy}`);if(live?.l0){c.walls=live.l0.walls.filter(w=>w.bottom<1.8&&w.top>.05).map(w=>({x:w.x,y:w.y,w:w.w,h:w.h}));c.regions=live.l0.mapRegions;c.pits=live.l0.pits}}
  return result
 })
}
export async function devMapTeleport(eng:Engine,target:{x:number;y:number;floor:number}):Promise<boolean>{
 const m=eng.map;if(!eng.devEnabled||!m||![target.x,target.y].every(Number.isFinite)||Math.max(Math.abs(target.x),Math.abs(target.y))>1e6||![-1,0,1,2].includes(target.floor))return false
 const inf=m.inf,wx=eng.player.x+(inf?.ox??0),wy=eng.player.y+(inf?.oy??0)
 const confinement=inf?.l0?redZonesNear(inf.seed,Math.floor(wx/32),Math.floor(wy/32)).find(z=>insideRedZone(z,wx,wy)&&inf.l0?.redProgress?.[z.id]?.closed.length===z.gates.length):undefined
 if(confinement&&!insideRedZone(confinement,target.x,target.y,.4)){eng.msg('当前红室已封闭，地图传送只能选择围墙内部。','system');return false}
 const snapshot=structuredClone(m),explored=eng.explored.slice(),previous={...eng.player},floor=target.floor as FloorBand
 const transient={fakes:structuredClone(eng.fakes),particles:structuredClone(eng.particles),projectiles:structuredClone(eng.projectiles),npcs:eng.npcs,searching:eng.searching,lootPanel:eng.lootPanel,interactTarget:eng.interactTarget,ride:eng.ride,climb:eng.climb,porchDrop:eng.porchDrop,bonusExit:eng.bonusExit}
 if(floor===-1&&!m.hasUnderground||floor===1&&!m.up.some(Boolean)&&!inf||floor===2&&!m.up2.some(Boolean)&&!inf)return false
 try{
  eng.player.x=target.x-(inf?.ox??0);eng.player.y=target.y-(inf?.oy??0);eng.player.floor=floor
  if(inf)eng.updateInfiniteWindow()
  const x=target.x-(m.inf?.ox??0),y=target.y-(m.inf?.oy??0)
  const candidates=[{x,y}]
  for(let r=.25;r<=3;r+=.25)for(let i=0;i<32;i++)candidates.push({x:x+r*Math.cos(i*Math.PI/16),y:y+r*Math.sin(i*Math.PI/16)})
  for(const p of candidates){
   if(p.x<1||p.y<1||p.x>=m.w-1||p.y>=m.h-1)continue
   if(confinement&&!insideRedZone(confinement,p.x+m.inf!.ox,p.y+m.inf!.oy,.4))continue
   const z=floorHeight(m,p.x,p.y,floor),i=Math.floor(p.y)*m.w+Math.floor(p.x)
   if(floor===0&&z< -1||m.liquid[i]===1||!canOccupy(m,p.x,p.y,PLAYER_RADIUS,{z:z+.02,band:floor,crouch:false}))continue
   Object.assign(eng.player,{x:p.x,y:p.y,z:z+.02,vz:0,floor,crouching:false});eng.msg(`[DEV] 已传送至 ${target.x.toFixed(1)}, ${target.y.toFixed(1)}`,'system');return true
  }
 }catch{/* Restore the same player and world state on failure. */}
 eng.map=snapshot;eng.mapRev++;eng.explored=explored;Object.assign(eng,transient);Object.assign(eng.player,previous);eng.msg('目标附近 3 米内没有安全落点，已保留原位置。','system');return false
}
