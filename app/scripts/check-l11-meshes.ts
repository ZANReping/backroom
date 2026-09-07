import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import * as THREE from 'three'
import { buildL11Building, buildL11TerrainJob, buildL11DistantCity } from '../src/game/renderer/l11Meshes'
import { l11Material } from '../src/game/renderer/l11Materials'
import { l11Buildings } from '../src/game/world/l11Layout'
import { generateLevel } from '../src/game/world/mapgen'
import { L11 } from '../src/game/levels/l11'
Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(128,128),createElementNS:()=>{throw new Error('headless: no network image loader')}}})
for(const k of ['concrete','asphalt','brick','plaster','tiles','metal','wood'])for(const suffix of ['','_normal','_roughness']){
  const image=await loadImage(`public/textures/l11_${k}${suffix}.jpg`);assert.equal(Math.max(image.width,image.height),1024);assert(Math.min(image.width,image.height)>=512)
}
// Match the real loading screen's material warmup, without a browser or GPU context.
for(const kind of ['concrete','asphalt','brick','plaster','tile','metal','wood','grass','glass','sealedglass'] as const)l11Material(kind)
for(const [kind,tint]of [['concrete','#d9dad3'],['metal','#657171'],['paint','#d9d7b7']]as const)l11Material(kind,tint)
const meshTimes:number[]=[],buildingSlices:number[]=[],terrainSlices:number[]=[];let meshes=0,triangles=0
function inspect(root:THREE.Object3D){root.traverse(o=>{const m=o as THREE.Mesh;if(!m.geometry)return;meshes++
  assert(m.geometry.attributes.uv);assert(m.geometry.attributes.normal)
  assert(Array.from(m.geometry.attributes.position.array).every(Number.isFinite))
  triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3
  m.geometry.dispose()
})}
for(const b of l11Buildings(42,-128,-128,256,256).slice(0,32)){
  const job=buildL11Building({kind:'l11building',x:b.x,y:b.y,w:b.w,h:b.h,solid:b.sealed,data:{...b}})
  let total=0
  for(;;){const t=performance.now(),r=job.next(),ms=performance.now()-t;buildingSlices.push(ms);total+=ms;if(r.done){inspect(r.value);break}}
  meshTimes.push(total)
}
const m=generateLevel(L11,42,false),g=new THREE.Group(),terrain=buildL11TerrainJob(m,g,{x0:64,y0:64,x1:96,y1:96})
for(;;){const t=performance.now(),r=terrain.next();terrainSlices.push(performance.now()-t);if(r.done)break}inspect(g)
const distant=buildL11DistantCity(42,-64,-64),tasks:number[]=[]
for(;;){const t=performance.now(),r=distant.next();tasks.push(performance.now()-t);if(r.done){inspect(r.value);break}}
meshTimes.sort((a,b)=>a-b)
console.log(JSON.stringify({buildings:meshTimes.length,geometryMeshes:meshes,triangles,buildingMedianMs:meshTimes[16],buildingMaxSliceMs:Math.max(...buildingSlices),terrainMaxSliceMs:Math.max(...terrainSlices),distantMaxSliceMs:Math.max(...tasks)},null,2))
