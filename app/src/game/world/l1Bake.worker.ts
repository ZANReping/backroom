/// <reference lib="webworker" />
import {bakeL1} from './l1Bake'
import {l1BakeBuffers,L1_BAKE_REVISION,type L1BakeQuality,type L1BakeResult} from './l1BakeTypes'
declare const self:DedicatedWorkerGlobalScope
self.onmessage=async({data}:{data:{id:number;seed:number;cx:number;cy:number;quality:L1BakeQuality;fingerprint:string;compressed?:ArrayBuffer;initial?:boolean}})=>{
 try{
  let result:L1BakeResult|undefined
  if(data.compressed)try{
   const started=performance.now(),header=new Uint8Array(data.compressed,0,Math.min(2,data.compressed.byteLength))
   // A .gz URL may be served with Content-Encoding:gzip; Fetch then supplies
   // already-decoded JSON. Static hosts without that header supply gzip bytes.
   const json=header[0]===31&&header[1]===139?await new Response(new Blob([data.compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(data.compressed)
   const decode=(v:any):any=>{
    if(v?.type&&v.base64){const s=atob(v.base64),raw=new Uint8Array(s.length);for(let i=0;i<s.length;i++)raw[i]=s.charCodeAt(i);const types={Uint8Array,Uint16Array,Uint32Array,Float32Array},ctor=types[v.type as keyof typeof types];if(!ctor)throw Error('Invalid bake buffer');return new ctor(raw.buffer)}
    if(Array.isArray(v))return v.map(decode);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));return v
   }
   const r=decode(JSON.parse(json)) as L1BakeResult
   if(!r.provisional&&r.version===4&&r.bakeRevision===L1_BAKE_REVISION&&r.fingerprint===data.fingerprint&&r.quality===data.quality&&r.seed===data.seed&&r.cx===data.cx&&r.cy===data.cy){result=r;result.metrics.decodeMs=performance.now()-started}
  }catch{/* Corrupt or stale offline data falls back to the same deterministic integrator. */}
  result??=bakeL1(data.seed,data.cx,data.cy,data.quality,!!data.initial&&data.quality==='high');self.postMessage({id:data.id,result},l1BakeBuffers(result))
 }
 catch(e){self.postMessage({id:data.id,error:String(e)})}
}
