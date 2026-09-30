import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { buildMothMesh, animateMoth } from '../src/game/renderer/mothMeshes'
import type { MothForm } from '../src/game/entities/types'
Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(128,128),createElementNS:()=>{throw new Error('headless')}}})
const forms:MothForm[]=['male','female','larva','guard'],metrics=[]
for(const form of forms){
 const start=performance.now(),g=buildMothMesh(form),ms=performance.now()-start;let meshes=0,triangles=0
 g.traverse(o=>{const m=o as THREE.SkinnedMesh;if(!m.isMesh)return;meshes++;assert(m.isSkinnedMesh);const p=m.geometry.getAttribute('position');assert(Array.from(p.array).every(Number.isFinite));triangles+=(m.geometry.index?.count??p.count)/3;const weights=m.geometry.getAttribute('skinWeight');for(let i=0;i<weights.count;i++)assert(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-5)})
 assert(meshes<=6,`${form}: material batches ${meshes}`)
 const parts=g.userData.parts as Record<string,THREE.Object3D>,legs=Object.keys(parts).filter(n=>n.startsWith('mothLeg'))
 assert.equal(legs.length,form==='guard'?8:form==='larva'?0:6)
 if(form!=='larva')for(const s of [-1,1])for(let pair=0;pair<2;pair++){assert(parts[`mothWing${s}_${pair}`]);assert(parts[`mothWingTip${s}_${pair}`])}
 g.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(g),size=box.getSize(new THREE.Vector3())
 if(form==='male')assert(size.z>.60&&size.z<.78)
 if(form==='female')assert(size.z>.82&&size.z<1.03)
 if(form==='guard')assert(size.y>1.10&&size.y<1.40)
 if(form==='larva')assert(size.x>.24&&size.x<.35)
 for(let frame=0;frame<150;frame++){
  animateMoth(g,frame/60,1/60,1.2,frame%30/30);g.updateMatrixWorld(true)
  g.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite),`${form} nonfinite animation`))
  if(form==='guard')for(const name of legs){const foot=parts[name.replace('mothLeg','mothFoot')],p=foot.getWorldPosition(new THREE.Vector3());assert(p.y>=-.001&&p.y<.14,`foot penetrates floor: ${p.y}`)}
 }
 const a=buildMothMesh(form),b=buildMothMesh(form),am=a.children.find(o=>(o as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh,bm=b.children.find(o=>(o as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh
 assert.notEqual(am.geometry,bm.geometry);assert.notEqual(am.skeleton,bm.skeleton);assert.notEqual(am.skeleton.bones[0],bm.skeleton.bones[0]);am.geometry.dispose();am.skeleton.dispose()
 assert(bm.geometry.getAttribute('position'));assert(bm.skeleton.bones.length>0)
 const before=bm.skeleton.bones.map(x=>x.quaternion.toArray());animateMoth(a,5,.1,3);assert.deepEqual(bm.skeleton.bones.map(x=>x.quaternion.toArray()),before,'animation leaked across instances')
 metrics.push({form,meshes,triangles,size:size.toArray().map(v=>+v.toFixed(3)),templateMs:+ms.toFixed(1)})
}
console.log(JSON.stringify(metrics,null,2))
