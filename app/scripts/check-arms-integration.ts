import assert from 'node:assert/strict'
import {createCanvas} from '@napi-rs/canvas'
import * as THREE from 'three'
import {mkdirSync,writeFileSync} from 'node:fs'
import {setMaterialMode} from '../src/game/renderer/shared'
import {buildEntityMesh} from '../src/game/renderer/entitiesMesh'
import {armsBudget,armsRig,buildArmsMesh,buildArmsVent} from '../src/game/renderer/armsMesh'
import {armsClipPose,poseArms} from '../src/game/renderer/armsAnim'
import {armsResourcesReady,prepareArmsJob} from '../src/game/renderer/armsMesh'

Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(256,256),createElementNS:()=>({})}})
let checks=0
const ok=(v:unknown,msg:string)=>{assert(v,msg);checks++}
const finite=(a:ArrayLike<number>)=>Array.from(a).every(Number.isFinite)
function resources(root:THREE.Object3D){const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>(),skins=new Set<THREE.Skeleton>(),tex=new Set<THREE.Texture>();root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;geos.add(m.geometry);for(const x of Array.isArray(m.material)?m.material:[m.material]){mats.add(x);for(const k of ['map','normalMap','roughnessMap','metalnessMap','alphaMap'] as const){const t=(x as any)[k] as THREE.Texture|undefined;if(t)tex.add(t)}}if((m as THREE.SkinnedMesh).isSkinnedMesh)skins.add((m as THREE.SkinnedMesh).skeleton)});return{geos,mats,skins,tex}}
function inspectArms(root:THREE.Object3D,count:number,label:string){const sk:THREE.SkinnedMesh[]=[];root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;for(const a of Object.values(m.geometry.attributes))ok(finite(a.array),`${label} finite attribute`);for(const list of Object.values(m.geometry.morphAttributes))for(const a of list)ok(finite(a.array),`${label} finite morph displacement`);if((m as THREE.SkinnedMesh).isSkinnedMesh)sk.push(m as THREE.SkinnedMesh)});ok(sk.length===1&&sk[0].geometry.groups.length===2,`${label} skinned mesh/groups`);const m=sk[0],g=m.geometry,w=g.getAttribute('skinWeight'),si=g.getAttribute('skinIndex');for(let i=0;i<w.count;i++){let sum=0;for(let j=0;j<4;j++){const v=w.array[i*4+j],idx=si.array[i*4+j];sum+=v;ok(Number.isFinite(v)&&Number.isInteger(idx)&&idx>=0&&idx<m.skeleton.bones.length,`${label} skin binding`)}ok(Math.abs(sum-1)<1e-4,`${label} normalized weights`)}ok(m.skeleton.bones.length===1+26*count,`${label} bone count`);return m}
const modes:any[]=[]
for(const mode of ['classic','realistic'] as const){setMaterialMode(mode);for(const count of [1,2,3]){const a=buildArmsMesh(count,15),b=buildArmsMesh(count,15),checkedA=inspectArms(a,count,`${mode}/${count}`),checkedB=inspectArms(b,count,`${mode}/${count}/b`),ra=resources(a),rb=resources(b);ok(checkedA!==checkedB,'distinct skinned meshes');ok([...ra.geos].every(x=>!rb.geos.has(x))&&[...ra.mats].every(x=>!rb.mats.has(x))&&[...ra.skins].every(x=>!rb.skins.has(x)),'private resources');ok(ra.tex.size>0&&[...ra.tex].every(x=>rb.tex.has(x))&&[...ra.tex].every(x=>x.userData.entityShared===true),'shared entity textures');const va=buildArmsVent(),vb=buildArmsVent();ok(armsBudget(va).meshes===2&&armsBudget(va).draws===2&&armsBudget(vb).draws===2,'vent budget');const ea=buildEntityMesh('arms',{arms:{count,seed:15}}),eb=buildEntityMesh('arms',{arms:{count,seed:15}});ok(armsBudget(ea).meshes===3&&armsBudget(ea).draws===4,'entity vent plus arms budget');const erA=resources(ea),erB=resources(eb);ok([...erA.geos].every(x=>!erB.geos.has(x))&&[...erA.mats].every(x=>!erB.mats.has(x)),'entity private resources');modes.push({mode,count,arms:armsBudget(a),vent:armsBudget(va),entity:armsBudget(ea)});for(const x of [...ra.geos,...ra.mats,...ra.skins])x.dispose();const survivor=armsRig(b)!;poseArms(survivor,armsClipPose('search',2,{count}),2);b.updateMatrixWorld(true);b.traverse(o=>ok(finite(o.matrixWorld.elements),'survivor pose finite'));for(const x of [...rb.geos,...rb.mats,...rb.skins])x.dispose();for(const root of [va,vb,ea,eb]){const owned=resources(root);for(const x of [...owned.geos,...owned.mats,...owned.skins])x.dispose()}}}
const prepResults:any[]=[];for(const seed of [717,718]){const cancelled=prepareArmsJob(1,seed);cancelled.next();cancelled.return();ok(!armsResourcesReady(1,seed),`cancelled seed ${seed} not ready`);const job=prepareArmsJob(1,seed);let step:IteratorResult<void>;let n=0;do{step=job.next();n++}while(!step.done&&n<100);ok(step.done&&armsResourcesReady(1,seed),`prepared seed ${seed}`);prepResults.push({seed,steps:n,ready:armsResourcesReady(1,seed)})}
// Cancel after an arm has allocated its temporary geometry, then retry.
let disposedOnCancel=0
const originalDispose=THREE.BufferGeometry.prototype.dispose
THREE.BufferGeometry.prototype.dispose=function(){disposedOnCancel++;return originalDispose.call(this)}
try {
 const partial=prepareArmsJob(3,719);for(let i=0;i<7;i++)partial.next();partial.return()
 ok(disposedOnCancel>0&&!armsResourcesReady(3,719),'partially prepared geometry is released without publishing readiness')
} finally {THREE.BufferGeometry.prototype.dispose=originalDispose}
const retry=prepareArmsJob(3,719);let retried=retry.next();for(let i=0;!retried.done&&i<100;i++)retried=retry.next()
ok(retried.done&&armsResourcesReady(3,719),'cancelled multi-arm geometry can be prepared again')
const out={checks,modes,prepResults,disposedOnCancel};mkdirSync('reports/arms-import-20261020',{recursive:true});writeFileSync('reports/arms-import-20261020/integration.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2))
