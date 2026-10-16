import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import * as THREE from 'three'
import {NPCS,npcAvatar,brcWorkerDef,jerryFollowerDef,genRandomNpcs} from '../src/game/content/npcs'
import {buildCharacterModel} from '../src/game/renderer/characterModel'
import {disposeCharacterModel} from '../src/game/renderer/retroResources'
import {applyNpcGear} from '../src/game/renderer/npcGear'
import {humanoidMotion} from '../src/game/renderer/humanoidMotion'
import {NpcGearFit} from '../src/game/renderer/npcGearFit'
import {poseNpcGuitarHands} from '../src/game/renderer/npcGearPose'
import {buildNpcBoneSpear} from '../src/game/renderer/npcBoneSpear'
let checks=0;const ok=(v:unknown,s:string)=>{assert(v,s);checks++}
let seed=17;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32)
const defs=[...Object.values(NPCS),...Array.from({length:12},(_,i)=>brcWorkerDef(400,3,2,i)),...Array.from({length:3},(_,i)=>jerryFollowerDef(1,2,i)),...genRandomNpcs(random,8)]
const rows=[]
for(const def of defs){
 const start=performance.now(),m=buildCharacterModel(npcAvatar(def),{npcId:def.id,npcDef:def,driven:true}),ms=performance.now()-start,rig=m.userData.retro,gear=m.userData.npcGear
 let tris=0,draws=0,gearMesh:THREE.SkinnedMesh|undefined
 m.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.geometry)return
  const g=mesh.geometry;tris+=(g.index?.count??g.attributes.position.count)/3;draws+=g.groups.length||1
  for(const [n,a] of Object.entries(g.attributes))ok(Array.from(a.array).every(Number.isFinite),def.id+' finite '+n)
  if(mesh.userData.npcGear){gearMesh=mesh as THREE.SkinnedMesh;ok(gearMesh.skeleton===rig.mesh.skeleton,def.id+' shares body skeleton');ok((mesh.material as THREE.MeshLambertMaterial).map!.userData.retroShared,def.id+' shared atlas');ok(Array.from(g.attributes.uv.array).every(v=>v>=0&&v<=1),def.id+' atlas UV')
   for(let i=0;i<g.attributes.skinWeight.count;i++){const w=g.attributes.skinWeight,ix=g.attributes.skinIndex;let total=0;for(let j=0;j<4;j++){total+=w.getComponent(i,j);assert(ix.getComponent(i,j)<19)}assert(Math.abs(total-1)<1e-5)}checks++
  }
 })
 ok(gear&&gear.draws<=1,def.id+' one merged accessory draw');ok(tris<8000,def.id+' geometry budget')
 const children=rig.group.children.length;applyNpcGear(m,def.id,def);ok(children===rig.group.children.length,def.id+' idempotent')
 const motion=humanoidMotion(m)!
 for(let t=0;t<20;t++){motion.update({time:t/24,x:t*.035,y:0,z:0,facing:0,tool:!!def.workLoop});rig.update(t/24);m.updateMatrixWorld(true);rig.mesh.skeleton.update();ok(Array.from(rig.mesh.skeleton.boneMatrices).every(Number.isFinite),def.id+' animated bones')
  if(gearMesh){const a=gearMesh.geometry.attributes.position;for(let i=0;i<a.count;i+=Math.max(1,Math.floor(a.count/12))){const p=new THREE.Vector3().fromBufferAttribute(a,i);gearMesh.applyBoneTransform(i,p);ok(p.toArray().every(Number.isFinite),def.id+' animated gear')}}
 }
 rows.push({id:def.id,ms,tris,draws,gear});disposeCharacterModel(m)
}
const def=NPCS.tom,a=buildCharacterModel(npcAvatar(def),{npcId:def.id,npcDef:def}),b=buildCharacterModel(npcAvatar(def),{npcId:def.id,npcDef:def})
const ga=a.userData.retro.group.children.find((o:THREE.Object3D)=>o.userData.npcGear) as THREE.SkinnedMesh,gb=b.userData.retro.group.children.find((o:THREE.Object3D)=>o.userData.npcGear) as THREE.SkinnedMesh
ok(ga.geometry!==gb.geometry&&ga.material!==gb.material,'private geometry and materials')
const ma=ga.material as THREE.MeshLambertMaterial,mb=gb.material as THREE.MeshLambertMaterial;ok(ma.map===mb.map,'shared map')
let mapsFreed=0,bonesFreed=0;ma.map!.addEventListener('dispose',()=>mapsFreed++);ga.skeleton.computeBoneTexture();ga.skeleton.boneTexture!.addEventListener('dispose',()=>bonesFreed++)
disposeCharacterModel(a);ok(mapsFreed===0&&bonesFreed===1,'free rig exactly once, retain atlas');ok(gb.geometry.attributes.position.count>0,'other instance remains valid');disposeCharacterModel(b)
const joey=buildCharacterModel(npcAvatar(NPCS.joey),{npcId:'joey',npcDef:NPCS.joey,driven:true}),rig=joey.userData.retro,fit=new NpcGearFit(joey)
const guitar=rig.bones.spine.children.find((o:THREE.Object3D)=>o.userData.joeyGuitar) as THREE.Group
guitar.position.fromArray(guitar.userData.gearPlay);guitar.rotation.set(0,-.1,.95)
let maxContactError=0
for(let i=0;i<20;i++){
 const time=i*.1;rig.bones.spine.rotation.set(Math.sin(time)*.08,Math.cos(time)*.09,0);joey.rotation.y=time
 poseNpcGuitarHands(rig,guitar,1,time);joey.updateMatrixWorld(true)
 for(const side of ['left','right'] as const){
  const hand=fit.hand(side),bind=fit.bind.get(hand.bone)!,actual=rig.bones[hand.bone].localToWorld(new THREE.Vector3(...hand.point).sub(bind))
  const target=guitar.localToWorld(side==='right'?new THREE.Vector3(.024,-.035+Math.sin(time*8.8)*.016,.041):new THREE.Vector3(0,.30,.027))
  const error=actual.distanceTo(target);maxContactError=Math.max(error,maxContactError);ok(error<.008,`Playing ${side} hand remains on guitar within 8 mm: ${error}, actual=${actual.toArray()}, target=${target.toArray()}`)
 }
}
disposeCharacterModel(joey)
const spear=buildNpcBoneSpear();let spearDraws=0;spear.traverse(o=>{if((o as THREE.Mesh).isMesh)spearDraws++});ok(spearDraws===1,'Tiny bone spear merged');disposeCharacterModel(spear)
mkdirSync('reports/npc-gear',{recursive:true});writeFileSync('reports/npc-gear/geometry.json',JSON.stringify({checks,models:rows.length,maxContactError,rows},null,2))
console.log(JSON.stringify({checks,models:rows.length,maxTriangles:Math.max(...rows.map(r=>r.tris)),maxDraws:Math.max(...rows.map(r=>r.draws)),medianBuildMs:rows.map(r=>r.ms).sort((a,b)=>a-b)[Math.floor(rows.length/2)]}))
