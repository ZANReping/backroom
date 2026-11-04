import assert from 'node:assert/strict'
import * as THREE from 'three'
import { bakeTradersGeometry, clearTradersBakeCache, tradersIrradiance } from '../src/game/renderer/tradersBakedLighting'
import { requestTradersBake, cancelTradersBakeWork, tradersBakeStats } from '../src/game/renderer/tradersBakeQueue'
import { Builder, type TradersAssets } from '../src/game/renderer/tradersMeshes'
let checks=0
const ok=(v:unknown,label:string)=>{assert(v,label);checks++}
const geometry=new THREE.BoxGeometry(4,4,4,6,6,6).translate(9,2,109),positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal')
const run=(job:Generator<void,void,unknown>)=>{for(let i=0;i<100000;i++)if(job.next().done)return;throw Error('Unfinished test generator')}
clearTradersBakeCache();run(bakeTradersGeometry(geometry))
const expected=new Float32Array(geometry.getAttribute('tradersLight').array)
ok(expected.length===positions.count*3&&expected.every(Number.isFinite),'original CPU path produces finite full-quality radiance')
type Payload={id:number;positions:Float32Array;normals:Float32Array}
const workers:FakeWorker[]=[]
class FakeWorker {
 onmessage:((event:{data:{id:number;colors:Float32Array}})=>void)|null=null
 onerror:(()=>void)|null=null
 stopped=false;payload:Payload|null=null
 constructor(){workers.push(this)}
 postMessage(payload:Payload){this.payload=payload}
 terminate(){this.stopped=true}
 finish(){const data=this.payload!;this.payload=null;clearTradersBakeCache();const colors=new Float32Array(data.positions.length);for(let i=0;i<colors.length;i+=3)colors.set(tradersIrradiance(data.positions[i],data.positions[i+1],data.positions[i+2],data.normals[i],data.normals[i+1],data.normals[i+2]),i);this.onmessage!({data:{id:data.id,colors}})}
}
Object.defineProperty(globalThis,'Worker',{configurable:true,value:FakeWorker})
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{hardwareConcurrency:16,userAgent:'desktop QA'}})
const initial=requestTradersBake(positions,normals)!
ok(initial.pending&&workers.length===2,'desktop static solve is delegated to at most two workers')
const slot=workers.find(w=>w.payload)!
ok(slot.payload!.positions.buffer!==positions.array.buffer&&slot.payload!.normals.buffer!==normals.array.buffer,'transferred inputs are copies, never the live geometry buffers')
slot.finish()
assert.deepEqual(initial.colors,expected);checks++
ok(!initial.pending&&!initial.failed,'worker result matches original solver exactly and signals completion')
const next=geometry.clone();next.deleteAttribute('tradersLight')
const job=bakeTradersGeometry(next);job.next()
ok(!next.hasAttribute('tradersLight'),'pending solve does not publish incomplete illumination')
workers.find(w=>w.payload)!.finish();run(job)
assert.deepEqual(next.getAttribute('tradersLight').array,expected);checks++
ok(positions.array.byteLength>0&&normals.array.byteLength>0,'live geometry remains usable after worker completion')
const cancelled=geometry.clone();cancelled.deleteAttribute('tradersLight');const cancelledJob=bakeTradersGeometry(cancelled);cancelledJob.next();cancelledJob.return()
workers.find(w=>w.payload)!.finish()
ok(!cancelled.hasAttribute('tradersLight'),'late worker completion cannot publish cancelled geometry')
const tiny=new THREE.BoxGeometry();ok(requestTradersBake(tiny.getAttribute('position'),tiny.getAttribute('normal'))===null,'small attributes retain the cheap CPU path')
const mat=new THREE.MeshLambertMaterial();mat.userData.tradersBaked=true
const builder=new Builder({} as TradersAssets),parent=new THREE.Group();builder.add(geometry.clone(),mat,false)
const dispose=THREE.BufferGeometry.prototype.dispose;let disposed=0
THREE.BufferGeometry.prototype.dispose=function(){disposed++;dispose.call(this)}
try{const build=builder.finish(parent);build.next();const before=disposed;build.return();ok(disposed===before+1&&parent.children.length===0,'cancelled merged geometry is disposed before publication')}finally{THREE.BufferGeometry.prototype.dispose=dispose;builder.dispose()}
workers.filter(w=>w.payload).forEach(w=>w.finish())
const queued=[]
for(let i=0;i<25;i++){const q=requestTradersBake(positions,normals);if(q)queued.push(q)}
ok(tradersBakeStats().queued<=16&&queued.length<=18,'pending buffers and workers remain bounded')
cancelTradersBakeWork()
ok(tradersBakeStats().workers===0&&tradersBakeStats().queued===0&&queued.every(q=>!q.pending),'leaving a level terminates all workers and clears requests')
ok(workers.every(w=>w.stopped),'only owned worker instances were terminated')
const failedGeo=geometry.clone();failedGeo.deleteAttribute('tradersLight');const failedJob=bakeTradersGeometry(failedGeo);failedJob.next();workers.findLast(w=>w.payload)!.onerror!();clearTradersBakeCache();run(failedJob)
assert.deepEqual(failedGeo.getAttribute('tradersLight').array,expected);checks++
ok(tradersBakeStats().failed&&tradersBakeStats().workers===0,'worker failure falls back to the full original solver, never to missing light')
cancelTradersBakeWork();for(const g of [geometry,next,cancelled,tiny,failedGeo])g.dispose();mat.dispose()
console.log(JSON.stringify({passed:checks,scope:'exact static radiance, bounded concurrency, cancellation, disposal and CPU fallback'}))
