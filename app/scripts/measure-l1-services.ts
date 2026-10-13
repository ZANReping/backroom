// Reproduce with esbuild --bundle --platform=node --format=esm --external:@napi-rs/canvas.
// The optional baseline is a local source snapshot, never a production dependency.
import {createCanvas} from '@napi-rs/canvas'
import {mkdirSync,writeFileSync} from 'node:fs'
import * as THREE from 'three'
import {buildL1Architecture as current} from '../src/game/renderer/l1Architecture'
import {buildL1Architecture as baseline} from '../.cache/l1-iteration3-before/src/game/renderer/l1Architecture'
import {disposeL1Owned} from '../src/game/renderer/l1Materials'
Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(128,128),createElementNS:()=>({})}})
const rows=[]
for(const variant of ['parking','storage','ouroboros','maintenance']){
 const results=[]
 for(const build of [baseline,current]){
  const times:number[]=[],steps:number[]=[],counts:number[]=[]
  for(let round=0;round<7;round++){
   const group=new THREE.Group(),m={w:32,h:32,tiles:new Uint8Array(1024).fill(1),structures:[],l1Architecture:true,inf:{ox:-64,oy:-32,seed:7391,chunks:new Map()}} as any
   const job=build(m,{x0:0,y0:0,x1:32,y1:32,variant},group,[],[]),start=performance.now();let peak=0
   for(;;){const t=performance.now(),done=job.next().done;peak=Math.max(peak,performance.now()-t);if(done)break}
   if(round>=2){times.push(performance.now()-start);steps.push(peak)}
   let triangles=0;group.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.geometry)triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3})
   counts.push(triangles);group.traverse(disposeL1Owned);group.traverse(o=>(o as THREE.Mesh).geometry?.dispose())
  }
  results.push({triangles:counts[0],buildMs:times,maxStepMs:steps})
 }
 rows.push({variant,baseline:results[0],current:results[1]})
}
const dir='reports/l1-remake/iteration-3';mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/service-geometry.json`,JSON.stringify(rows,null,2));console.log(JSON.stringify(rows,null,2))
