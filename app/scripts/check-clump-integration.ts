import assert from 'node:assert/strict'
import {writeFileSync,mkdirSync} from 'node:fs'
import {createCanvas} from '@napi-rs/canvas'
import * as THREE from 'three'
import {buildEntityMesh} from '../src/game/renderer/entitiesMesh'
import {animateClump,animateClumpDeath,type ClumpRig} from '../src/game/renderer/clumpMesh'
import {initClump} from '../src/game/engine/clumpAI'
import {makeEntity,applyL3Variant} from '../src/game/entities'
import {setMaterialMode} from '../src/game/renderer/shared'
import {disposeCharacterModel} from '../src/game/renderer/retroResources'
Object.assign(globalThis,{document:{createElement:()=>createCanvas(256,256)}})
let checks=0
const ok=(v:unknown,s:string)=>{assert(v,s);checks++}
const finite=(a:ArrayLike<number>)=>Array.from(a).every(Number.isFinite)
const stats:object[]=[]
for(const mode of ['classic','realistic'] as const){
 setMaterialMode(mode)
 for(const l3 of [false,true])for(let seed=0;seed<6;seed++){
  const t0=performance.now(),g=buildEntityMesh('clump',{seed,l3clump:l3}),buildMs=performance.now()-t0
  const e=makeEntity('clump',0,0);if(l3)applyL3Variant(e)
  initClump({map:{inf:{ox:0,oy:0}},player:{}} as any,e)
  g.scale.setScalar(e.def.scale??1);e.cl!.weapon=l3?'brick':'none'
  animateClump(g,e,1,0)
  const rig=g.userData.clumpRig as ClumpRig
  let tris=0,draws=0,skin:THREE.SkinnedMesh|undefined
  g.traverse(o=>{
   const m=o as THREE.Mesh;if(!m.isMesh)return
   const geo=m.geometry,n=geo.attributes.position.count
   tris+=(geo.index?.count??n)/3
   let visible=true;for(let p:THREE.Object3D|null=o;p;p=p.parent)visible=visible&&p.visible
   if(visible)draws+=Array.isArray(m.material)?geo.groups.filter(x=>m.material[x.materialIndex??0]?.visible).length:Number(m.material.visible)
   for(const [name,a] of Object.entries(geo.attributes))ok(finite(a.array),`${mode}/${l3}/${seed} finite ${name}`)
   if(geo.index)ok(Array.from(geo.index.array).every(i=>i>=0&&i<n),'valid indices')
   if((m as THREE.SkinnedMesh).isSkinnedMesh){
    skin=m as THREE.SkinnedMesh
    const w=geo.getAttribute('skinWeight'),si=geo.getAttribute('skinIndex')
    ok(w.count===n&&si.count===n&&!!geo.attributes.uv,'complete skinned UV attributes')
    for(let k=0;k<n;k++){
     let sum=0
     for(let j=0;j<4;j++){const v=w.array[k*4+j],idx=si.array[k*4+j];sum+=v;ok(v>=0&&v<=1&&Number.isInteger(idx)&&idx<skin.skeleton.bones.length,'valid skin binding')}
     ok(Math.abs(sum-1)<1e-4,'normalized skin weights')
    }
   }
  })
  ok(tris<=(l3?13000:12000),'triangle budget');ok(draws<=(l3?6:5),'visible draw budget')
  // The unlit dark throat is intentional; the body uses the scene's material path.
  ok(mode==='classic'?rig.mat instanceof THREE.MeshLambertMaterial:rig.mat instanceof THREE.MeshStandardMaterial,'body material follows mode')
  ok(!!rig.mat.map&&rig.mat.map.userData.entityShared&&rig.mat.map.image.width===256,'real shared procedural texture')
  for(const phase of ['roam','hunt','windup','grab','devour','fasting','pounce','pullup','selfharm'] as const){
   Object.assign(e.cl!,{phase,speed:phase==='hunt'?5:0,arm:phase==='grab'?1:0,armLen:3,mouth:phase==='devour'?1:0,wind:phase==='windup'?1:0,sit:phase==='fasting'?1:0,ceil:phase==='pounce'?1:0})
   animateClump(g,e,1.3,0,3);g.updateMatrixWorld(true);skin!.skeleton.update()
   g.traverse(o=>ok(finite(o.matrixWorld.elements),'animated matrix finite'))
   if(phase==='grab'){
    const wrist=rig.main.b.at(-1)!.getWorldPosition(new THREE.Vector3())
    ok(Math.abs(wrist.x-3)<.3&&wrist.y>.2,`arm reaches 3m: ${mode}/${l3}/${seed}: ${wrist.toArray()}`)
   }
  }
  animateClumpDeath(g,.7);g.updateMatrixWorld(true);g.traverse(o=>ok(finite(o.matrixWorld.elements),'death matrix finite'))
  stats.push({mode,l3,seed,tris,draws,bones:skin!.skeleton.bones.length,buildMs});disposeCharacterModel(g)
 }
}
function resources(g:THREE.Group){
 const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>(),bones=new Set<THREE.Skeleton>(),tex=new Set<THREE.Texture>()
 g.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;geos.add(m.geometry);if((m as THREE.SkinnedMesh).isSkinnedMesh)bones.add((m as THREE.SkinnedMesh).skeleton);for(const mat of Array.isArray(m.material)?m.material:[m.material]){mats.add(mat);const map=(mat as THREE.MeshLambertMaterial).map;if(map)tex.add(map)}})
 return {geos,mats,bones,tex,owned:[...geos,...mats,...bones]}
}
for(const l3 of [false,true]){
 const a=buildEntityMesh('clump',{seed:2,l3clump:l3}),b=buildEntityMesh('clump',{seed:2,l3clump:l3}),ra=resources(a),rb=resources(b)
 ok(ra.owned.every(x=>!rb.owned.includes(x)),'independent geometry/material/skeleton')
 ok(ra.tex.size===1&&rb.tex.size===1&&[...ra.tex][0]===[...rb.tex][0],'textures shared across instances')
 const counts=new Map<object,number>();for(const x of [...ra.owned,...rb.owned,...ra.tex]){counts.set(x,0);const dispose=x.dispose.bind(x);x.dispose=()=>{counts.set(x,counts.get(x)!+1);dispose()}}
 disposeCharacterModel(a)
 ok(ra.owned.every(x=>counts.get(x)===1),'each owned resource disposed once')
 ok([...rb.owned,...ra.tex].every(x=>counts.get(x)===0),'other instance/shared textures remain')
 const e=makeEntity('clump',0,0);if(l3)applyL3Variant(e);initClump({map:{},player:{}}as any,e);animateClump(b,e,2,0);b.updateMatrixWorld(true)
 b.traverse(o=>ok(finite(o.matrixWorld.elements),'survivor still animates'))
 disposeCharacterModel(b);ok(rb.owned.every(x=>counts.get(x)===1),'second instance releases resources');ok([...ra.tex].every(x=>counts.get(x)===0),'shared texture not disposed')
}
mkdirSync('reports/clump-import',{recursive:true});writeFileSync('reports/clump-import/models.json',JSON.stringify({checks,stats},null,2)+'\n')
console.log(JSON.stringify({checks,stats},null,2))
