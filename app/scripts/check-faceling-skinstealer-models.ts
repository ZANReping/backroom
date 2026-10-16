import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createCanvas} from '@napi-rs/canvas'
import * as THREE from 'three'
import {buildEntityMesh} from '../src/game/renderer/entitiesMesh'
import {buildSkinStealerMesh,animateSkinStealer} from '../src/game/renderer/skinStealerMesh'
import {planFacelingFace} from '../src/game/renderer/facelingFace'
import {disposeCharacterModel} from '../src/game/renderer/retroResources'
import {makeEntity} from '../src/game/entities'
import type {SkinStealerState} from '../src/game/engine/skinStealerAI'
Object.defineProperty(globalThis,'document',{value:{createElement:(tag:string)=>tag==='canvas'?createCanvas(256,256):{},createElementNS:()=>({addEventListener(){},removeEventListener(){}})}})
let checks=0;const ok=(v:unknown,s:string)=>{assert(v,s);checks++}
for(let seed=0;seed<5000;seed++){
 const a=planFacelingFace(seed);ok(JSON.stringify(a)===JSON.stringify(planFacelingFace(seed)),`determinism ${seed}`)
 ok(a.organs.length<=3&&new Set(a.organs.map(o=>o.kind)).size>=2,`organ counts ${seed}`)
 ok(a.missing.length>0,`missing class ${seed}`)
 ok(a.organs.filter(o=>o.kind==='eye'&&o.normal).length<=1,`no normal eye pair ${seed}`)
 ok(!a.organs.some(o=>o.kind==='mouth'&&Math.abs(o.t-.211)<.045&&Math.abs(o.x)<.15&&Math.abs(o.rot)<.15),`abnormal mouth ${seed}`)
}
function resources(root:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();let draws=0,tris=0
 root.traverse(o=>{
  const m=o as THREE.Mesh;if(!m.isMesh)return
  geometries.add(m.geometry);draws+=Array.isArray(m.material)?m.geometry.groups.length:1
  for(const mat of Array.isArray(m.material)?m.material:[m.material]){materials.add(mat);for(const x of Object.values(mat))if(x?.isTexture)textures.add(x)}
  const g=m.geometry,pos=g.getAttribute('position');tris+=(g.index?.count??pos.count)/3
  for(const [name,a] of Object.entries(g.attributes))ok(Array.from(a.array).every(Number.isFinite),`finite ${name}`)
  if(g.index)ok(Array.from(g.index.array).every(i=>Number.isInteger(i)&&i>=0&&i<pos.count),'index bounds')
  ok(!!g.getAttribute('uv'),'UV exists')
  if((m as THREE.SkinnedMesh).isSkinnedMesh){
   const sk=m as THREE.SkinnedMesh,w=g.getAttribute('skinWeight'),idx=g.getAttribute('skinIndex')
   ok(Array.from(idx.array).every(v=>Number.isInteger(v)&&v>=0&&v<sk.skeleton.bones.length),'bone index bounds')
   for(let i=0;i<w.count;i++)ok(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-5,'normalized bone weights')
  }
 });return {geometries,materials,textures,draws,tris}
}
function pair(factory:()=>THREE.Group){
 const a=factory(),b=factory(),ar=resources(a),br=resources(b),ag=[...ar.geometries],bg=[...br.geometries]
 ok(ag.length===bg.length,'same geometry count')
 for(let i=0;i<ag.length;i++){
  ok(ag[i]!==bg[i],'exclusive geometry')
  for(const [n,attribute] of Object.entries(ag[i].attributes))assert.deepEqual(attribute.array,bg[i].getAttribute(n).array,`seeded ${n}`)
  assert.deepEqual(ag[i].index?.array,bg[i].index?.array,'seeded indices')
 }
 ok([...ar.materials].every(m=>!br.materials.has(m)),'exclusive materials')
 ok(ar.textures.size>0&&[...ar.textures].every(t=>br.textures.has(t)),'actual shared textures present')
 const counts=new Map<THREE.BufferGeometry|THREE.Material|THREE.Texture,number>()
 for(const x of [...ar.geometries,...ar.materials,...br.geometries,...br.materials,...ar.textures]){counts.set(x,0);x.addEventListener('dispose',()=>counts.set(x,counts.get(x)!+1))}
 disposeCharacterModel(a)
 ok([...ar.geometries,...ar.materials].every(x=>counts.get(x)===1),'first instance all owned disposed once')
 ok([...br.geometries,...br.materials,...ar.textures].every(x=>counts.get(x)===0),'second instance and shared maps alive')
 disposeCharacterModel(b)
 ok([...br.geometries,...br.materials].every(x=>counts.get(x)===1),'second owned disposed once')
 ok([...ar.textures].every(x=>counts.get(x)===0),'shared maps retained')
 return {draws:ar.draws,tris:ar.tris,sharedTextures:ar.textures.size}
}
const stats=[]
for(const l3face of [false,true])for(const seed of [1,9,77,301])stats.push({kind:'faceling',l3face,seed,...pair(()=>buildEntityMesh('faceling',{seed,l3face}))})
stats.push({kind:'skinstealer',...pair(()=>buildSkinStealerMesh(12))})
for(const phase of ['docile','hunt','reveal'] as const){
 const root=buildSkinStealerMesh(12),e=makeEntity('skinstealer',0,0);e.ss={phase,emerge:phase==='reveal'?.7:0} as SkinStealerState
 for(let tick=0;tick<90;tick++){e.animT+=.04;e.lungeT=tick>50?.25:0;animateSkinStealer(root,e,tick/30,0);root.updateMatrixWorld(true);root.traverse(o=>ok(o.matrixWorld.elements.every(Number.isFinite),'finite animated matrix'))}
 disposeCharacterModel(root)
}
mkdirSync('reports/faceling-skinstealer-import',{recursive:true});writeFileSync('reports/faceling-skinstealer-import/models.json',JSON.stringify({checks,plannerSeeds:5000,stats},null,2)+'\n');console.log(JSON.stringify({checks,stats},null,2))
