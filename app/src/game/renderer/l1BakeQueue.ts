import type {L1ArchitectureData} from '../world/l1BuildingTypes'
import type {L1BakeQuality,L1BakeResult} from '../world/l1BakeTypes'
import {L1_BAKE_REVISION} from '../world/l1BakeTypes'
import {readL1Bake,saveL1Bake} from './l1BakeStorage'
interface Entry {key:string;data:L1ArchitectureData;quality:L1BakeQuality;compressed?:ArrayBuffer;result?:L1BakeResult;error?:string;pending:boolean;refining:boolean;loading?:boolean;used:number;priority:number}
interface Slot {worker:Worker;entry?:Entry;initial?:boolean}
const entries=new Map<string,Entry>(),workers:Slot[]=[]
let clock=0,id=0,hits=0,diskHits=0,offlineLoads=0,computations=0,completed=0,stale=0,bytes=0,previews=0
const maxBytes=96*1024*1024
function trim(){
 for(const [key,e]of [...entries].sort((a,b)=>a[1].used-b[1].used)){
  if(bytes<=maxBytes&&entries.size<80)break
  if(e.pending||e.refining)continue
  bytes-=e.result?.metrics.bytes??0;entries.delete(key)
 }
}
function dispatch(){
 const ranked=[...entries.values()].sort((a,b)=>a.priority-b.priority||a.used-b.used)
 for(const w of workers){
  if(w.entry)continue
  const idle=(e:Entry)=>!e.loading&&!workers.some(w=>w.entry===e)
  // Presentation always wins; reserve capacity for newly visible architecture.
  let next=ranked.find(e=>e.pending&&idle(e)),initial=true
  const finalLimit=workers.length===1?1:Math.min(2,workers.length-1)
  if(!next&&workers.filter(w=>w.entry&&!w.initial).length<finalLimit){next=ranked.find(e=>e.refining&&!e.pending&&idle(e));initial=false}
  if(!next)continue
  w.entry=next;w.initial=initial
  const compressed=next.compressed;next.compressed=undefined
  w.worker.postMessage({id:++id,seed:next.data.seed,cx:next.data.cx,cy:next.data.cy,quality:next.quality,fingerprint:next.data.fingerprint,initial,compressed},compressed?[compressed]:[])
 }
}
/** The provisional pass changes radiance only, never geometry or UV layout. */
function reuseGeometry(before:L1BakeResult|undefined,after:L1BakeResult){
 if(!before?.provisional||after.provisional||before.fingerprint!==after.fingerprint||before.size!==after.size||before.meshes.length!==after.meshes.length)return
 for(let i=0;i<after.meshes.length;i++){
  const a=before.meshes[i],b=after.meshes[i]
  if(a.style!==b.style||a.surface!==b.surface||a.position.length!==b.position.length||a.index.length!==b.index.length)return
 }
 after.meshes=before.meshes
}
function init(){
 if(workers.length)return
 const mobile=typeof navigator!=='undefined'&&/Android|iPhone|iPad/i.test(navigator.userAgent)
 const cores=typeof navigator!=='undefined'&&navigator.hardwareConcurrency>0?Math.floor(navigator.hardwareConcurrency):4
 const count=mobile?1:Math.min(4,Math.max(1,Math.floor(cores/2)))
 for(let i=0;i<count;i++){
  const w:Slot={worker:new Worker(new URL('../world/l1Bake.worker.ts',import.meta.url),{type:'module'})};workers.push(w)
  w.worker.onmessage=({data}:{data:{result?:L1BakeResult;error?:string}})=>{
   const e=w.entry;w.entry=undefined;if(!e){dispatch();return}
   if(entries.get(e.key)!==e){stale++}
   else if(data.result&&data.result.fingerprint!==e.data.fingerprint){stale++;bytes-=e.result?.metrics.bytes??0;entries.delete(e.key)}
   else if(data.error){e.pending=false;e.refining=false;e.error=data.error}
   else if(data.result){
    reuseGeometry(e.result,data.result)
    bytes+=data.result.metrics.bytes-(e.result?.metrics.bytes??0);e.result=data.result;e.pending=false
    e.refining=!!data.result.provisional;completed++
    if(e.refining)previews++
    else{if(data.result.metrics.decodeMs!==undefined)offlineLoads++;else computations++;void saveL1Bake(e.key,data.result)}
   }
   trim();dispatch()
  }
  w.worker.onerror=event=>{if(w.entry){w.entry.pending=false;w.entry.refining=false;w.entry.error=event.message}w.entry=undefined;dispatch()}
 }
}
export function requestL1Bake(data:L1ArchitectureData,quality:L1BakeQuality,priority?:number):Entry {
 const key=`4:${L1_BAKE_REVISION}:${data.seed}:${data.cx},${data.cy}:${data.fingerprint}:${quality}`,hit=entries.get(key)
 if(hit){hit.used=++clock;if(priority!==undefined)hit.priority=priority;if(hit.result)hits++;return hit}
 init();const entry:Entry={key,data,quality,pending:true,refining:false,loading:true,used:++clock,priority:priority??Infinity};entries.set(key,entry);trim()
 void readL1Bake(key,data.seed,data.cx,data.cy,quality,data.fingerprint).catch(()=>undefined).then(result=>{
  if(entries.get(key)!==entry)return
  entry.loading=false
  if(result){if('compressed'in result)entry.compressed=result.compressed;else{entry.result=result;entry.pending=false;bytes+=result.metrics.bytes;hits++;diskHits++;trim()}}
  dispatch()
 });return entry
}
export function retainL1Bakes(seed:number,keys:Set<string>){
 for(const [key,e]of entries)if((e.pending||e.refining)&&(e.data.seed!==seed||!keys.has(`${e.data.cx},${e.data.cy}`))){
  entries.delete(key);bytes-=e.result?.metrics.bytes??0;stale++
 }
}
export function l1BakeStats(){return{entries:entries.size,bytes,hits,diskHits,offlineLoads,computations,completed,stale,previews,workers:workers.length,active:workers.filter(w=>w.entry).length,queued:[...entries.values()].filter(e=>e.pending||e.refining).length,initialQueued:[...entries.values()].filter(e=>e.pending).length,refining:[...entries.values()].filter(e=>e.refining).length,stages:[...entries.values()].filter(e=>e.result).map(e=>({key:e.key,provisional:!!e.result!.provisional,...e.result!.metrics}))}}
/** Leaving L1 stops CPU work immediately; completed cache entries remain reusable. */
export function cancelL1BakeWork(){
 for(const w of workers)w.worker.terminate();workers.length=0
 for(const [key,e]of entries)if(e.pending||e.refining){bytes-=e.result?.metrics.bytes??0;entries.delete(key)}
}
export function disposeL1Bakes(){for(const w of workers)w.worker.terminate();workers.length=0;entries.clear();bytes=0}
