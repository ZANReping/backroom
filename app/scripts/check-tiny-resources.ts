import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createCanvas} from '@napi-rs/canvas'
import * as THREE from 'three'
Object.assign(globalThis,{document:{createElement:()=>createCanvas(32,32),createElementNS:()=>{throw Error('headless')}},window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})}})
const {buildTinyMesh,buildTinyJob}=await import('../src/game/renderer/tinyMesh')
const {animateTiny,sampleTiny,TINY_CLIPS}=await import('../src/game/renderer/tinyAnim')
const {buildStoneWindchime}=await import('../src/game/renderer/stoneInstrumentsMesh')
const {buildRefinedItemMesh}=await import('../src/game/renderer/refinedItemMesh')
const {L8EntityPreparation}=await import('../src/game/renderer/l8EntityPreparation')
const {makeEntity}=await import('../src/game/entities')
const {setMaterialMode}=await import('../src/game/renderer/shared')
let checks=0
const ok=(v:unknown,label:string)=>{assert(v,label);checks++}
function inspect(root:THREE.Object3D){
 const geo=new Set<THREE.BufferGeometry>(),mat=new Set<THREE.Material>(),tex=new Set<THREE.Texture>();let triangles=0,draws=0
 root.updateMatrixWorld(true)
 root.traverse(o=>{
  ok(o.matrixWorld.elements.every(Number.isFinite),'finite world matrix '+o.name)
  const mesh=o as THREE.Mesh;if(!mesh.isMesh)return
  const g=mesh.geometry;geo.add(g)
  for(const name of ['position','normal','uv']){const a=g.getAttribute(name);ok(a&&Array.from(a.array).every(Number.isFinite),'finite '+name+' '+o.name)}
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material]
  draws+=Array.isArray(mesh.material)?Math.max(1,g.groups.length):1
  triangles+=(g.index?.count??g.attributes.position.count)/3*((mesh as THREE.InstancedMesh).isInstancedMesh?(mesh as THREE.InstancedMesh).count:1)
  for(const m of mats){mat.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)tex.add(v)}
 })
 const b=new THREE.Box3().setFromObject(root,true);ok(!b.isEmpty()&&[...b.min,...b.max].every(Number.isFinite),'finite nonempty bounds')
 return{geo,mat,tex,triangles,draws}
}
function dispose(root:THREE.Object3D){const r=inspect(root);for(const g of r.geo)g.dispose();for(const m of r.mat)m.dispose()}
function isolated(a:THREE.Object3D,b:THREE.Object3D,label:string,shared=false){
 const A=inspect(a),B=inspect(b);ok([...A.geo].every(g=>!B.geo.has(g)),label+' geometry private');ok([...A.mat].every(m=>!B.mat.has(m)),label+' material private')
 if(shared){ok(A.tex.size===4&&B.tex.size===4,'four shared Tiny procedural textures');ok([...A.tex].every(t=>B.tex.has(t)&&t.userData.entityShared===true),'shared texture marker and identity')}
 let otherDisposals=0;const watched=[...B.geo,...B.mat],handler=()=>otherDisposals++;watched.forEach(o=>o.addEventListener('dispose',handler))
 dispose(a);ok(otherDisposals===0,label+' disposing A does not dispose B');inspect(b);watched.forEach(o=>o.removeEventListener('dispose',handler))
 return{A,B}
}
const rows=[]
for(const mode of ['classic','realistic'] as const){
 setMaterialMode(mode)
 const a=buildTinyMesh(),b=buildTinyMesh()
 const {A}=isolated(a,b,'Tiny '+mode,true)
 ok(Object.keys(TINY_CLIPS).length===7,'seven registered animation clips')
 for(const [name,clip]of Object.entries(TINY_CLIPS))for(let i=0;i<6;i++){const t=clip.dur*i/(clip.loop?6:5);animateTiny(b,sampleTiny(name,t));inspect(b)}
 rows.push({mode,type:'tiny',triangles:A.triangles,draws:A.draws,clips:7,samples:42});dispose(b)
 const k1=buildRefinedItemMesh('stonekazoo'),k2=buildRefinedItemMesh('stonekazoo'),K=isolated(k1,k2,'stonekazoo '+mode).A
 ok(K.triangles>=60&&K.triangles<=1200,'kazoo existing 1200 triangle budget');ok(K.draws<=3,'kazoo existing 3 batch budget');rows.push({mode,type:'stonekazoo',triangles:K.triangles,draws:K.draws});dispose(k2)
 const w1=buildStoneWindchime(new THREE.MeshLambertMaterial()),w2=buildStoneWindchime(new THREE.MeshLambertMaterial()),W=isolated(w1,w2,'chime '+mode).A
 ok(w1.userData.rods.length===6&&w2.userData.rods.length===6,'six independently animated chime rods');rows.push({mode,type:'stonechime',triangles:W.triangles,draws:W.draws});dispose(w2)
}
let disposedGeometry=0;const original=THREE.BufferGeometry.prototype.dispose
THREE.BufferGeometry.prototype.dispose=function(){disposedGeometry++;return original.call(this)}
try{const job=buildTinyJob();for(let i=0;i<4;i++)ok(!job.next().done,'cooperative Tiny job yields');job.return(undefined as never);ok(disposedGeometry>0,'cancelled Tiny job frees partial geometries')}finally{THREE.BufferGeometry.prototype.dispose=original}
const e=makeEntity('tiny',0,0),live=new Set([e]),queue=new L8EntityPreparation();ok(queue.request(e,{})===null,'Tiny enters cooperative renderer queue');let ready:THREE.Group|null=null,rounds=0
for(;rounds<1000&&!ready;rounds++){queue.advance(live,20);ready=queue.request(e,{})}
ok(!!ready,'queued Tiny really completes');if(ready)dispose(ready);queue.clear()
mkdirSync('reports/tiny-final-20261022',{recursive:true});writeFileSync('reports/tiny-final-20261022/resources.json',JSON.stringify({ok:true,checks,rows,queueRounds:rounds},null,2));console.log(JSON.stringify({checks,rows,queueRounds:rounds}))
