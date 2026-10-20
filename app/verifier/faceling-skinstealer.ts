import * as THREE from 'three'
import {makeEntity,applyL3Variant} from '../src/game/entities'
import {initSkinStealer,updateSkinStealer,beginSkinStealerFrame,skinStealerTalk,playerAlone} from '../src/game/engine/skinStealerAI'
import {retroModelReady} from '../src/game/renderer/retroAvatar'
import {canOccupy} from '../src/game/core/player'
import {groundHeightAt} from '../src/game/world/mapgen'

// Uses the production Engine and Renderer from l0-remake's isolated-storage game.
export async function verifyEntities(qa:any){
 const e=qa.eng,r=qa.r,p=e.player,frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
 let checks=0;const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks++}
 const wait=async(n=4)=>{for(let i=0;i<n;i++)await frame()}
 qa.setFrozen(true);e.paused=false;e.dev.frozenAI=true;p.flashlight=false
 p.x=40.5;p.y=25.5;p.z=0;p.facing=0
 const origin={x:43.3,y:25.5,z:0}
 ok(canOccupy(e.map,origin.x,origin.y,.3,{z:0,band:0,crouch:false}),'model location has physical clearance')
 qa.look.yaw=-Math.PI/2;qa.look.pitch=.08;qa.look.roll=0;r.setFov(60)
 const f=makeEntity('faceling',origin.x,origin.y,0);f.id=900009
 const s=makeEntity('skinstealer',origin.x,origin.y,0);s.id=900012
 const view=async(name:string)=>{
  e.map.entities=[];e.particles=[];await wait();p.x=39.8;p.y=25.5;p.facing=0
  qa.look.yaw=-Math.PI/2;qa.look.pitch=.08;r.setFov(60)
  if(name.startsWith('faceling')){
   f.def={...f.def,l3face:false,tool:false};if(name.includes('l3'))applyL3Variant(f,()=>.9)
   f.x=origin.x;f.y=origin.y;f.facing=Math.PI;f.animT=1;f.state='idle';e.map.entities=[f]
  }else{
   s.x=origin.x;s.y=origin.y;s.facing=Math.PI;s.dead=false;s.hp=s.def.hp;s.animT=1;s.state='idle'
   initSkinStealer(e,s,name==='skin-human'||name==='skin-peel'?'skinned':'docile');e.map.entities=[s]
   if(name==='skin-human'){skinStealerTalk(e,s);s.ss!.bubbleText='有人吗？';s.ss!.bubbleT=10}
  }
  await wait(15)
  const g=r.entityMeshes.get(name.startsWith('faceling')?f.id:s.id)
  for(let i=0;i<200&&!retroModelReady(g);i++)await new Promise(resolve=>setTimeout(resolve,25))
  await wait(10)
  if(name==='skin-peel'){s.hp-=5;e.killCheck(s);await wait(2);qa.freezeRenderTime(1.25)}
  
  if(name.endsWith('close')){p.x=42.15;qa.look.pitch=name.startsWith('faceling')?0:-.17;r.setFov(48);await wait(4)}
  return {name,position:[p.x,p.y,p.z],yaw:qa.look.yaw,pitch:qa.look.pitch,fov:r.camera.fov,entity:{id:name.startsWith('faceling')?f.id:s.id,...origin}}
 }
 ;(window as any).entityView=view
 await view('faceling');ok(r.entityMeshes.get(f.id)?.userData.parts.head.isBone,'ordinary faceling uses production skeletal model')
 let skin:THREE.SkinnedMesh|undefined;r.entityMeshes.get(f.id).traverse((o:THREE.Object3D)=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)skin=o as THREE.SkinnedMesh})
 const mat=(skin!.material as THREE.MeshLambertMaterial[])[2]
 ok(mat.map?.image.width>2 && mat.map?.userData.ready,'faceless full texture loaded')
 await view('faceling-l3');ok(r.entityMeshes.get(f.id)?.userData.facePlan.organs.length<=3,'L3 organs attached to production faceling')
 await view('skin-human');ok(r.entityMeshes.get(s.id)?.userData.parts.head.isBone,'human disguise uses current avatar')
 ok(r.skinBubbles.get(s.id)?.mesh.visible,'borrowed line bubble shown')
 p.x=41.1;qa.look.pitch=.16;e.scanInteract();ok(e.interactTarget?.kind==='skinstealer','production interaction targets human disguise')
 const prior=s.ss!.lineIdx;e.doInteract();ok(s.ss!.lineIdx===prior+1,'interaction repeats borrowed line')
 // A local companion changes behavior without any multiplayer machinery.
 const npcs=e.npcs;e.npcs=[];ok(playerAlone(e),'alone without NPC')
 e.npcs=[{x:p.x+.4,y:p.y,floor:0,dead:false,hostile:false}];ok(!playerAlone(e),'nearby same-floor companion protects')
 e.npcs[0].floor=1;ok(playerAlone(e),'different-floor NPC does not protect');e.npcs=[]
 e.dev.invisible=false;s.x=p.x+1.8;s.y=p.y;s.ss!.timer=100
 beginSkinStealerFrame(e,1/30);updateSkinStealer(e,s,1/30,1.8,1)
 ok(s.ss!.phase==='reveal'&&!s.disguised,'close approach reveals disguise in production game')
 await wait(3);ok(r.skinPeels.length>0,'old skin enters fade animation');ok(r.entityMeshes.get(s.id)?.userData.ssRig,'true body rendered')
 await new Promise(resolve=>setTimeout(resolve,900));await wait();ok(!r.skinPeels.length,'skin animation resources retired')
 initSkinStealer(e,s,'skinned');s.x=origin.x;s.ss!.bubbleT=0;await wait(10)
 // All damage routes reach killCheck; this must reveal even while stun is active.
 s.stunT=.6;s.hp-=8;e.killCheck(s);ok(s.ss!.phase==='reveal'&&!s.disguised,'damage immediately reveals stunned disguise')
 s.stunT=0;e.npcs=npcs;await wait(15)
 // Exercise actual melee, ray and projectile damage entry points.
 e.npcs=[];e.dev.noAttackCooldown=true;p.hotbar.fill(null);p.selected=0;p.facing=0;qa.look.yaw=-Math.PI/2;qa.look.pitch=0
 await wait(3)
 const reset=()=>{s.dead=false;s.hp=s.def.hp;s.x=p.x+1.1;s.y=p.y;s.z=p.z;s.stunT=0;initSkinStealer(e,s,'skinned')}
 reset();e.attack();ok(s.hp<80&&s.ss!.phase==='reveal','production melee damages and reveals disguise')
 reset();e.chocoCd=0;e.shootChocolate();ok(s.hp===79&&s.ss!.phase==='reveal','production ray shot hits human disguise')
 reset();e.squirtTank='almond';e.squirtAmmo=1;e.squirt();ok(s.hp===72&&s.ss!.phase==='reveal','production squirt hit reveals disguise')
 reset();e.landProjectile({type:'capacitor',floorZ:0,z:0,vx:0,vy:0,vz:0,id:999,x:s.x,y:s.y},s.x,s.y)
 ok(s.hp<80&&s.ss!.phase==='reveal','production thrown lightning reveals disguise')
 e.npcs=npcs;e.dev.noAttackCooldown=false;e.squirtAmmo=0;e.squirtTank='none'
 const cycles=async()=>{
  e.map.entities=[];await qa.warm()
  const results=[]
  for(let round=0;round<4;round++){
   for(let j=0;j<3;j++){
    initSkinStealer(e,s,'skinned');s.hp=s.def.hp;s.dead=false;s.x=origin.x;s.y=origin.y;e.map.entities=[s];s.ss!.bubbleText='有人吗？';s.ss!.bubbleT=10
    await wait(5);s.hp-=4;e.killCheck(s);await wait(3)
    e.map.entities=[];await wait(4)
   }
   await qa.warm();ok(!r.skinPeels.length&&!r.skinBubbles.size,'transient objects released after removal')
   results.push({...r.three.info.memory})
  }
  ok(results.slice(1).every(v=>v.geometries===results[1].geometries&&v.textures===results[1].textures),'resource counts stable after repeated transformations')
  // Switching scenes while a peel and bubble are alive exercises clearLevel.
  await view('skin-peel');await qa.scene(104);await qa.warm()
  ok(!r.skinPeels.length&&!r.skinBubbles.size,'level switch clears transient skin objects')
  return {checks,results}
 }
 ;(window as any).entityCycles=cycles
 await view('skin-true');await qa.warm()
 return {checks,stats:qa.stats(),origin,seed:20261006}
}

export async function environmentEntity(qa:any,level:number){
 await qa.scene(level)
 if(level===0)await qa.anchor('blackout')
 const e=qa.eng,p=e.player,r=qa.r,m=e.map
 let target:{x:number;y:number;z:number}|undefined
 for(const distance of [3.5,3,2.5])for(let i=0;i<24&&!target;i++){
  const a=i*Math.PI/12,x=p.x+Math.cos(a)*distance,y=p.y+Math.sin(a)*distance,z=groundHeightAt(m,x,y)
  if(Math.abs(z-p.z)<.6&&canOccupy(m,x,y,.35,{z,band:0,crouch:false})&&e.los(p.x,p.y,x,y))target={x,y,z}
 }
 if(!target)throw Error('No clear fixture position at level '+level)
 const s=makeEntity(level===3?'faceling':'skinstealer',target.x,target.y,target.z);s.id=900077;s.facing=Math.atan2(p.y-s.y,p.x-s.x)
 if(level===3)applyL3Variant(s,()=>.9);else initSkinStealer(e,s,level===5?'skinned':'docile')
 e.map.entities=[s];qa.look.yaw=Math.atan2(p.x-s.x,p.y-s.y);qa.look.pitch=0;r.setFov(65)
 e.paused=false;p.equip.offhand={type:'flashlight',count:1};e.syncPassives();p.flashlight=level===0
 const warmups=[]
 for(let attempt=0;attempt<3;attempt++){
  try {warmups.push(await qa.warm());break}
  catch(error){if(!String(error).includes('Warmup timed out')||attempt===2)throw error;warmups.push({retry:String(error)})}
 }
 return {level,entity:target,player:{x:p.x,y:p.y,z:p.z},look:{...qa.look},seed:20261006,warmups,stats:qa.stats()}
}
