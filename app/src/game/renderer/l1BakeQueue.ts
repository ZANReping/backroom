import type {L1ArchitectureData} from '../world/l1BuildingTypes'
import type {L1BakeQuality,L1BakeResult} from '../world/l1BakeTypes'
import {L1_BAKE_REVISION} from '../world/l1BakeTypes'
import {readL1Bake,saveL1Bake} from './l1BakeStorage'
interface Entry {key:string;data:L1ArchitectureData;quality:L1BakeQuality;compressed?:ArrayBuffer;result?:L1BakeResult;error?:string;pending:boolean;loading?:boolean;used:number}
const entries=new Map<string,Entry>(),workers:{worker:Worker;entry?:Entry}[]=[]
let clock=0,id=0,hits=0,diskHits=0,offlineLoads=0,computations=0,completed=0,stale=0,bytes=0
const maxBytes=96*1024*1024
function trim(){for(const [key,e]of [...entries].sort((a,b)=>a[1].used-b[1].used)){if(bytes<=maxBytes&&entries.size<80)break;if(e.pending)continue;bytes-=e.result?.metrics.bytes??0;entries.delete(key)}}
function dispatch(){for(const w of workers){if(w.entry)continue;const next=[...entries.values()].find(e=>e.pending&&!e.loading&&!workers.some(w=>w.entry===e));if(!next)break;w.entry=next;const compressed=next.compressed;next.compressed=undefined;w.worker.postMessage({id:++id,seed:next.data.seed,cx:next.data.cx,cy:next.data.cy,quality:next.quality,fingerprint:next.data.fingerprint,compressed},compressed?[compressed]:[])}}
function init(){
 if(workers.length)return
 const mobile=typeof navigator!=='undefined'&&/Android|iPhone|iPad/i.test(navigator.userAgent)
 const logicalCores=typeof navigator!=='undefined'&&Number.isFinite(navigator.hardwareConcurrency)&&navigator.hardwareConcurrency>0?Math.floor(navigator.hardwareConcurrency):4
 const workerCount=mobile?1:Math.min(8,Math.max(1,Math.floor(logicalCores/2)))
 for(let i=0;i<workerCount;i++){
  const w:{worker:Worker;entry?:Entry}={worker:new Worker(new URL('../world/l1Bake.worker.ts',import.meta.url),{type:'module'})};workers.push(w)
  w.worker.onmessage=({data}:{data:{result?:L1BakeResult;error?:string}})=>{
   const e=w.entry;w.entry=undefined;if(!e){dispatch();return}
   e.pending=false
   if(entries.get(e.key)!==e||data.result&&data.result.fingerprint!==e.data.fingerprint){stale++;entries.delete(e.key)}
   else if(data.error)e.error=data.error
   else if(data.result){e.result=data.result;bytes+=data.result.metrics.bytes;completed++;if(data.result.metrics.decodeMs!==undefined)offlineLoads++;else computations++;void saveL1Bake(e.key,data.result)}
   trim();dispatch()
  }
  w.worker.onerror=e=>{if(w.entry){w.entry.pending=false;w.entry.error=e.message}w.entry=undefined;dispatch()}
 }
}
export function requestL1Bake(data:L1ArchitectureData,quality:L1BakeQuality):Entry {
 const key=`4:${L1_BAKE_REVISION}:${data.seed}:${data.cx},${data.cy}:${data.fingerprint}:${quality}`,hit=entries.get(key)
 if(hit){hit.used=++clock;if(hit.result)hits++;return hit}
 init();const entry:Entry={key,data,quality,pending:true,loading:true,used:++clock};entries.set(key,entry);trim()
 void readL1Bake(key,data.seed,data.cx,data.cy,quality,data.fingerprint).catch(()=>undefined).then(result=>{
  if(entries.get(key)!==entry)return
  entry.loading=false;if(result){if('compressed' in result)entry.compressed=result.compressed;else{entry.result=result;entry.pending=false;bytes+=result.metrics.bytes;hits++;diskHits++;trim()}}dispatch()
 });return entry
}
export function retainL1Bakes(seed:number,keys:Set<string>){
 for(const [key,e]of entries)if(e.pending&&(e.data.seed!==seed||!keys.has(`${e.data.cx},${e.data.cy}`))&&!workers.some(w=>w.entry===e)){entries.delete(key);stale++}
}
export function l1BakeStats(){return{entries:entries.size,bytes,hits,diskHits,offlineLoads,computations,completed,stale,workers:workers.length,active:workers.filter(w=>w.entry).length,queued:[...entries.values()].filter(e=>e.pending).length,stages:[...entries.values()].filter(e=>e.result).map(e=>({key:e.key,...e.result!.metrics}))}}
export function disposeL1Bakes(){for(const w of workers)w.worker.terminate();workers.length=0;entries.clear();bytes=0}
