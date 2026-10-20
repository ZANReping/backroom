import * as THREE from 'three'
import {makeEntity,applyL3Variant} from '../src/game/entities'
import {initClump,clumpCaptor,releaseClumpPlayer} from '../src/game/engine/clumpAI'
import {canOccupy} from '../src/game/core/player'
import {groundHeightAt} from '../src/game/world/mapgen'

// Runs against the production Engine/Renderer with l0-remake's isolated storage.
export async function verifyClump(qa:any){
 const eng=qa.eng,p=eng.player,r=qa.r,checks:string[]=[]
 const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks.push(s)}
 const wait=async(n=5)=>{for(let i=0;i<n;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))}
 qa.setFrozen(true);eng.paused=false;eng.dev.invisible=false
 const origin={x:43.3,y:25.5,z:0}
 const normal=makeEntity('clump',origin.x,origin.y,0);normal.id=900021;normal.provoked=true
 const l3=makeEntity('clump',origin.x,origin.y,0);l3.id=900023;applyL3Variant(l3)
 const reset=(e=normal)=>{
  releaseClumpPlayer(eng);eng.map.entities=[e];eng.particles=[]
  p.x=41;p.y=25.5;p.z=0;p.hp=100;p.sanity=100;p.thirst=100;p.slowT=0;p.facing=0;p.vz=0
  eng.input.jump=false;eng.input.attack=false;eng.input.interact=false;eng.input.mx=0;eng.input.my=0
  e.x=origin.x;e.y=origin.y;e.z=origin.z;e.hp=e.def.hp;e.dead=false;e.stunT=0;e.attackCd=0;e.facing=Math.PI
  initClump(eng,e);e.cl!.phase='hunt';e.cl!.heardT=0
  qa.look.yaw=-Math.PI/2;qa.look.pitch=-.2;qa.look.roll=0;r.setFov(60)
 }
 ok(canOccupy(eng.map,origin.x,origin.y,.35,{z:0,band:0,crouch:false}),'entity location has actual clearance')
 const step=(n:number)=>{for(let i=0;i<n;i++){eng.updateMovement(1/60,{dmg:1,drain:1},false);eng.updateEntities(1/60,1)}}
 eng.dev.frozenAI=false;eng.dev.god=false
 reset();step(48);ok(normal.cl!.phase==='grab'&&clumpCaptor(eng)===normal,'production AI winds up and captures player')
 const distance=Math.hypot(p.x-normal.x,p.y-normal.y);step(12)
 ok(Math.hypot(p.x-normal.x,p.y-normal.y)<distance,'production movement allows collision-checked dragging')
 for(let i=0;i<7;i++){eng.input.jump=true;step(1);eng.input.jump=false;step(1)}
 ok(!clumpCaptor(eng)&&normal.cl!.phase==='recoil','jump presses escape through actual movement hook')
 reset();step(340);ok(!clumpCaptor(eng)&&normal.cl!.phase==='sated'&&p.hp>0&&p.hp<=8,'devour is nonlethal and spits player out')
 reset();step(48);normal.hp=0;eng.killCheck(normal)
 ok(normal.dead&&!clumpCaptor(eng),'killing captor immediately releases player')
 reset();step(48);eng.dev.frozenAI=true;eng.updateMovement(1/60,{dmg:1,drain:1},false)
 ok(!clumpCaptor(eng),'freezing AI releases capture')
 eng.dev.god=true;eng.dev.frozenAI=true
 const view=async(name:string)=>{
  reset(name.startsWith('l3')?l3:normal);eng.dev.frozenAI=true
  const e=eng.map.entities[0];p.x=39.8;qa.look.pitch=-.23;r.setFov(60)
  const s=e.cl!;Object.assign(s,{phase:'roam',speed:0,arm:0,mouth:0,sit:0,ceil:0,wind:0,weapon:s.l3?'brick':'none',gait:2})
  if(name==='fasting')Object.assign(s,{phase:'fasting',sit:1})
  if(name==='grab')Object.assign(s,{phase:'grab',arm:1,armLen:3})
  if(name==='devour')Object.assign(s,{phase:'devour',arm:.35,armLen:.7,mouth:1})
  if(name==='l3-squirt')Object.assign(s,{phase:'hunt',weapon:'squirt',shot:.5})
  if(name==='l3-ceiling'){Object.assign(s,{phase:'hunt',ceil:1,onCeil:true,speed:3});qa.look.pitch=.23}else s.onCeil=false
  if(name==='death'){e.dead=true;e.deathT=.8}
  await wait(12)
  const g=r.entityMeshes.get(e.id);ok(g?.userData.clumpRig,'production renderer creates clump rig')
  let gpuSkin=false;g.traverse((o:THREE.Object3D)=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)gpuSkin=!!(o as THREE.SkinnedMesh).skeleton.boneTexture})
  ok(gpuSkin,'GPU bone texture uploaded without CPU baking')
  return {name,player:[p.x,p.y,p.z],entity:[e.x,e.y,e.z],yaw:qa.look.yaw,pitch:qa.look.pitch,fov:r.camera.fov,stats:qa.stats()}
 }
 ;(window as any).clumpView=view
 ;(window as any).clumpCycles=async()=>{
  const memory=[]
  for(let round=0;round<4;round++){
   for(let i=0;i<3;i++){await view(i%2?'normal':'l3-brick');eng.map.entities=[];await wait(5)}
   await qa.warm();memory.push({...r.three.info.memory})
  }
  ok(memory.slice(1).every(v=>v.geometries===memory[1].geometries&&v.textures===memory[1].textures),'GPU resources stabilize after repeated spawn/remove')
  return {memory,checks}
 }
 await view('normal');await qa.warm()
 return {checks,seed:20261006,stats:qa.stats()}
}

export async function levelThree(qa:any){
 await qa.scene(3);const eng=qa.eng,p=eng.player,r=qa.r,m=eng.map
 eng.map.entities=[];eng.dev.frozenAI=true;eng.paused=false
 let found=false
 for(let a=0;a<Math.PI*2;a+=Math.PI/12){
  const x=p.x+Math.cos(a)*3.5,y=p.y+Math.sin(a)*3.5
  if(!canOccupy(m,x,y,.35,{z:p.z,band:p.floor,crouch:false})||!eng.los(p.x,p.y,x,y))continue
  qa.look.yaw=Math.atan2(p.x-x,p.y-y);qa.look.pitch=-.12
  if(eng.devSpawnEntity('clump',3.5)){found=true;break}
 }
 if(!found)throw Error('No safe L3 developer summon position')
 const e=m.entities.at(-1)
 if(!e.def.l3clump||!e.cl?.l3||e.hp!==90||e.z!==groundHeightAt(m,e.x,e.y,p.floor))throw Error('L3 developer summon variant/height mismatch')
 e.facing=Math.atan2(p.y-e.y,p.x-e.x);r.setFov(60)
 await qa.warm()
 if(!r.entityMeshes.get(e.id)?.userData.l3clump)throw Error('L3 model variant missing')
 return {seed:20261006,player:[p.x,p.y,p.z],entity:{id:e.id,position:[e.x,e.y,e.z],hp:e.hp,weapon:e.cl.weapon},yaw:qa.look.yaw,pitch:qa.look.pitch,fov:r.camera.fov,stats:qa.stats()}
}
