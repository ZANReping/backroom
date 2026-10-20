import {L1_BAKE_REVISION} from '../src/game/world/l1BakeTypes'

const same=(a:ArrayLike<number>,b:ArrayLike<number>)=>a.length===b.length&&Array.from(a).every((v,i)=>v===b[i])
async function task(payload:any,bytes:ArrayBuffer){
 const worker=new Worker(new URL('../src/game/world/l1Bake.worker.ts',import.meta.url),{type:'module'}),id=1
 try{return await new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('bake worker timeout')),30000);worker.onmessage=e=>{if(e.data.id!==id)return;clearTimeout(timer);e.data.error?reject(Error(e.data.error)):resolve(e.data.result)};worker.onerror=e=>{clearTimeout(timer);reject(e.error??Error(e.message))};worker.postMessage({...payload,id,compressed:bytes},[bytes])})}finally{worker.terminate()}
}
export async function verifyL1BakeTransport(qa:any){
 await qa.warm();const manifest=await (await fetch('/assets/l1-bakes/manifest.json')).json(),entry=manifest.chunks.find((x:any)=>x.seed===20261006&&x.cx===64&&x.cy===0&&x.quality==='high');if(!entry)throw Error('offline high bake missing')
 const raw=await (await fetch('/assets/l1-bakes/'+entry.file)).arrayBuffer(),header=new Uint8Array(raw,0,2),json=header[0]===31&&header[1]===139?await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():raw,gzip=await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),payload={seed:20261006,cx:64,cy:0,quality:'high',fingerprint:entry.fingerprint},a=await task(payload,json),b=await task(payload,gzip)
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(`l1-static-v4-r${L1_BAKE_REVISION}`,2);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('QA cache database blocked'))})
 let usage:any[]=[],keys:IDBValidKey[]=[]
 try{await new Promise<void>((resolve,reject)=>{const t=db.transaction(['usage','bakes']),u=t.objectStore('usage').getAll(),k=t.objectStore('bakes').getAllKeys();u.onsuccess=()=>{usage=u.result};k.onsuccess=()=>{keys=k.result};t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}finally{db.close()}
 const base=a.irradiance,mesh=a.meshes[0].position,keySet=new Set(keys),checks={decodeA:a.metrics.decodeMs>=0,decodeB:b.metrics.decodeMs>=0,fingerprintA:a.fingerprint===entry.fingerprint,fingerprintB:b.fingerprint===entry.fingerprint,irradiance:same(base,b.irradiance),meshPosition:same(mesh,b.meshes[0].position),cacheKeys:keys.length===usage.length&&usage.every(v=>keySet.has(v.key)),cacheBytes:usage.reduce((n,v)=>n+(v.bytes??0),0)<=128*1024*1024,usageNoResult:usage.every(v=>v.result===undefined)}
 if(Object.values(checks).some(v=>!v))throw Error('Bake transport/cache checks: '+JSON.stringify(checks))
 return{checks,decodeMs:{raw:a.metrics.decodeMs,gzip:b.metrics.decodeMs},cache:{count:usage.length,bytes:usage.reduce((n,v)=>n+(v.bytes??0),0)}}
}
