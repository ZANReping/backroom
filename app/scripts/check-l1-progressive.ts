import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {bakeL1} from '../src/game/world/l1Bake'
import {buildL1Data} from '../src/game/world/l1Building'
import {requestL1Bake,retainL1Bakes,l1BakeStats,disposeL1Bakes,cancelL1BakeWork} from '../src/game/renderer/l1BakeQueue'
import type {L1BakeResult} from '../src/game/world/l1BakeTypes'
const decode=(v:any):any=>{if(v?.base64){const raw=Buffer.from(v.base64,'base64'),a=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);return new ({Uint8Array,Uint16Array,Uint32Array,Float32Array} as any)[v.type](a)}if(Array.isArray(v))return v.map(decode);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));return v}
const manifest=JSON.parse(readFileSync('public/assets/l1-bakes/manifest.json','utf8')),row=manifest.chunks.find((r:any)=>r.cx===0&&r.cy===0&&r.quality==='high')
assert(row,'published entry bake exists')
const full=bakeL1(row.seed,row.cx,row.cy,'high'),published=decode(JSON.parse(gunzipSync(readFileSync('public/assets/l1-bakes/'+row.file)).toString())) as L1BakeResult
const preview=bakeL1(row.seed,row.cx,row.cy,'high',true)
assert.equal(full.provisional,undefined);assert.equal(preview.provisional,true)
assert.deepEqual(full.irradiance,published.irradiance,'final radiance matches the current published revision')
assert.deepEqual(full.direction,published.direction);assert.deepEqual(full.portalWeights,published.portalWeights)
assert.deepEqual(full.meshes,published.meshes,'published geometry remains identical')
assert.deepEqual(preview.meshes,full.meshes,'first presentation has final geometry and UVs')
assert.equal(preview.size,full.size);assert(preview.metrics.rays<full.metrics.rays*.4,'initial pass substantially reduces transport work')
assert(preview.irradiance.some(v=>v>0));assert(preview.irradiance.every(v=>(v&0x7c00)!==0x7c00))
class FakeWorker {
 static all:FakeWorker[]=[]
 onmessage:any;onerror:any;message:any;terminated=false
 constructor(){FakeWorker.all.push(this)}
 postMessage(message:any){this.message=message}
 terminate(){this.terminated=true}
 finish(provisional=true){const m=this.message;this.message=null;const result={...preview,seed:m.seed,cx:m.cx,cy:m.cy,fingerprint:m.fingerprint,provisional:provisional?true:undefined,metrics:{...preview.metrics,bytes:1000}};this.onmessage({data:{id:m.id,result}})}
}
Object.defineProperty(globalThis,'Worker',{value:FakeWorker});Object.defineProperty(globalThis,'navigator',{value:{hardwareConcurrency:8,userAgent:'Desktop'}})
const tick=()=>new Promise(r=>setTimeout(r,0)),data=buildL1Data(20261020,0,0),entries=[]
for(let i=0;i<9;i++)entries.push(requestL1Bake({...data,cx:i,fingerprint:'test-'+i},'high'))
await tick();assert.equal(FakeWorker.all.length,4,'bounded worker pool')
assert(FakeWorker.all.every(w=>w.message.initial),'presentation work is first')
while(l1BakeStats().initialQueued){const worker=FakeWorker.all.find(w=>w.message?.initial)!;assert(worker);worker.finish();await tick()}
assert(entries.every(e=>!e.pending&&e.result?.provisional),'geometry is available before refinement')
assert(FakeWorker.all.filter(w=>w.message&&!w.message.initial).length<=2,'bounded background refinement')
const geometry=entries[0].result!.meshes,worker=FakeWorker.all.find(w=>w.message?.cx===0)!
assert(worker);worker.finish(false);assert.equal(entries[0].result!.provisional,undefined);assert.equal(entries[0].result!.meshes,geometry,'final pass reuses installed buffers')
const old=FakeWorker.all.find(w=>w.message)!,oldMessage=old.message
retainL1Bakes(-1,new Set());const replacement=requestL1Bake({...data,cx:oldMessage.cx,fingerprint:oldMessage.fingerprint},'high');await tick();old.finish();await tick()
assert.equal(requestL1Bake({...data,cx:oldMessage.cx,fingerprint:oldMessage.fingerprint},'high'),replacement,'stale response cannot delete replacement')
assert(l1BakeStats().bytes>=0);cancelL1BakeWork();assert.equal(l1BakeStats().active,0);assert.equal(l1BakeStats().queued,0);assert.equal(l1BakeStats().workers,0)
assert.equal(requestL1Bake(data,'high').pending,true,'a new scene can create a fresh pool after cancellation')
disposeL1Bakes();assert.equal(l1BakeStats().bytes,0);assert(FakeWorker.all.every(w=>w.terminated))
console.log(JSON.stringify({passed:true,finalRevision:full.bakeRevision,geometryIdentical:true,initialRays:preview.metrics.rays,finalRays:full.metrics.rays,queuePriority:true,staleResponse:true}))
