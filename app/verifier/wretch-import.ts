import * as THREE from 'three'
import { makeEntity } from '../src/game/entities'
import { wretchKind, WRETCH_STATS, initWretch, wretchCanBash } from '../src/game/engine/wretchAI'
import { canOccupy } from '../src/game/core/player'
import { groundHeightAt } from '../src/game/world/mapgen'
import { GameAudio } from '../src/game/core/audio'

const tick = async (n=8) => { for(let i=0;i<n;i++) await new Promise<void>(r=>requestAnimationFrame(()=>r())) }
export async function setupWretches(qa:any, baseline=false) {
  const eng=qa.eng,p=eng.player,r=qa.r
  qa.setFrozen(true);eng.dev.frozenAI=true;eng.paused=false;eng.dev.god=true
  const ids:Record<string,number>={}
  for(let id=900000;Object.keys(ids).length<4;id++) ids[wretchKind(id)]??=id
  const baselineModule='/reports/wretch-import/baseline-factory.ts'
  const oldFactory=baseline ? (await import(/* @vite-ignore */baselineModule)).buildEntityMesh : undefined
  let motionFrame=0
  const view=async(kind='shambler',pose='front')=>{
    cancelAnimationFrame(motionFrame)
    const e=makeEntity('wretch',43.3,25.5,0);e.id=ids[kind];e.facing=Math.PI
    if(!baseline)initWretch(eng,e)
    eng.map.entities=[e];eng.particles=[];p.x=40.25;p.y=25.5;p.z=0;p.hp=100;p.sanity=100;p.crouching=false
    p.flashlight=false;qa.look.yaw=-Math.PI/2;qa.look.pitch=-.24;qa.look.roll=0;r.setFov(52)
    if(pose==='close'){p.x=42.1;qa.look.pitch=-.05;r.setFov(55)}
    if(pose==='back')e.facing=0
    if(pose==='attack'){e.lungeT=.21;e.animT=2.2;e.state='attack';if(e.wr)e.wr.strikeT=.2}
    if(pose==='bash'){e.state='attack';if(e.wr){e.wr.bashS={x:42,y:25,w:1,h:1} as any;e.wr.bashT=1}}
    if(pose==='death'){e.dead=true;e.deathT=.8}
    if(pose==='flash'){p.flashlight=true;r.scene.environmentIntensity=0}
    if(oldFactory){
      const previous=r.entityMeshes.get(e.id)
      if(previous){r.scene.remove(previous);r.disposeItemModel(previous)}
      const old=oldFactory('wretch',{seed:e.id});old.userData.entType='wretch'
      r.enableShadows(old);r.entityMeshes.set(e.id,old);r.scene.add(old)
    }
    await tick(12)
    if(pose==='run'){
      // Keep the stride advancing through CDP capture. Stopping it before the
      // screenshot legitimately blends the production rig back to idle.
      e.state='chase';let previous=performance.now()
      const advance=(now:number)=>{
        if(!eng.map.entities.includes(e))return
        e.animT+=4.6*Math.min(.05,(now-previous)/1000);previous=now
        motionFrame=requestAnimationFrame(advance)
      }
      motionFrame=requestAnimationFrame(advance);await tick(48)
    }
    const g=r.entityMeshes.get(e.id)
    const rig=g?.userData.wretchRig
    const animation=rig?{run:g.userData.wrRun,spine:rig.npc.bones.spine.rotation.x,pipeArm:rig.npc.bones.upperArmR.rotation.x}:undefined
    if(pose==='run'&&!(animation?.run>.8))throw Error('Sprinter did not enter running pose')
    if(pose==='attack'&&kind==='smart'&&!(animation?.pipeArm < -2.4))throw Error('Smart wretch did not lift its pipe arm')
    let triangles=0,draws=0,skinned=0,ready=true
    g?.traverse((o:THREE.Object3D)=>{const m=o as THREE.Mesh;if(!m.isMesh)return
      triangles+=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3
      draws+=Array.isArray(m.material)?m.geometry.groups.length||1:1
      if((m as THREE.SkinnedMesh).isSkinnedMesh&&(m as THREE.SkinnedMesh).skeleton.boneTexture)skinned++
      for(const mat of Array.isArray(m.material)?m.material:[m.material])if((mat as THREE.MeshStandardMaterial).map?.userData.ready===false)ready=false
    })
    return {kind,pose,id:e.id,player:[p.x,p.y,p.z],entity:[e.x,e.y,e.z],yaw:qa.look.yaw,pitch:qa.look.pitch,fov:r.camera.fov,triangles,draws,skinned,ready,animation,stats:qa.stats()}
  }
  ;(window as any).wretchView=view
  ;(window as any).wretchIds=ids
  if(!canOccupy(eng.map,43.3,25.5,.35,{z:0,band:0,crouch:false}))throw Error('QA entity position obstructed')
  await view();await qa.warm()
  return {ids,baseline,seed:20261006,stats:qa.stats()}
}

export async function verifyWretches(qa:any){
 const eng=qa.eng,p=eng.player,r=qa.r,checks:string[]=[],views:any[]=[]
 const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks.push(s)}
 const view=(window as any).wretchView,ids=(window as any).wretchIds
 const step=(n:number)=>{for(let i=0;i<n;i++)eng.updateEntities(1/60,1)}
 eng.dev.invisible=false
 for(const kind of Object.keys(ids)){
  await view(kind);const e=eng.map.entities[0]
  eng.dev.frozenAI=false;eng.dev.god=false
  step(120)
  ok(p.hp<100,`${kind}: production AI chases and damages the player`)
  ok(e.wr.kind===kind&&e.def.hp===WRETCH_STATS[kind as keyof typeof WRETCH_STATS].hp,`${kind}: model/AI/max health agree`)
  eng.dev.frozenAI=true;eng.dev.god=true
  await view(kind)
  await qa.warm()
  const row=await view(kind);views.push(row)
  ok(row.skinned===1&&row.ready,`${kind}: GPU skinning and cloth textures ready`)
  const g=r.entityMeshes.get(ids[kind]);let alpha=false,skin=false
  g.traverse((o:any)=>{for(const mat of !o.material?[]:Array.isArray(o.material)?o.material:[o.material]){
    if(mat.alphaTest===.5&&mat.map?.image?.getContext){const d=mat.map.image.getContext('2d').getImageData(0,0,128,128).data;alpha=Array.from(d).some((a,i)=>i%4===3&&a===0)}
    if(mat.name?.endsWith('/ skin')&&mat.map?.image?.width===64)skin=true
  }})
  ok(alpha&&skin,`${kind}: actual cloth cutouts and separate skin atlas`)
 }
 await view('shambler');const e=eng.map.entities[0]
 eng.dev.frozenAI=false;eng.dev.god=true;eng.dev.invisible=true
 eng.noiseEvent(p.x,p.y,12,true)
 ok(e.wr.alertT>0&&e.wr.lastX===p.x, 'production noise hook alerts wretch at source position')
 const target={...p};p.x=39;p.y=25.5;e.x=41.25;e.y=25.5
 const door:any={kind:'hoteldoor',x:40.5,y:25,w:1,h:1,floor:0,solid:true,data:{}}
 eng.map.structures.push(door)
 ok(!canOccupy(eng.map,41,25.5,.3,{z:0,band:0,crouch:false}),'closed door uses actual game collider')
 e.wr.bashS=door;e.wr.bashT=0;e.wr.alertT=30;e.wr.lostT=0
 step(160)
 ok(!door.solid&&door.data.open===1,'production AI opens door and removes solid collider')
 for(const kind of ['hoteldoor','bargate','inkdoor','glassdoor','rollerdoor']){
  door.kind=kind;door.solid=true;door.data={locked:1};e.wr.bashS=door;e.wr.bashT=3;e.wr.alertT=30
  step(1);ok(door.solid&&!door.data.open&&!e.wr.bashS,`${kind}: lock added during bash remains closed`)
  ok(!wretchCanBash(door),`${kind}: protected door eligibility`)
 }
 eng.map.structures=eng.map.structures.filter((s:any)=>s!==door)
 p.x=target.x;p.y=target.y;eng.dev.invisible=false;eng.dev.frozenAI=true
 await view('smart');const dead=eng.map.entities[0];dead.hp=0;eng.killCheck(dead)
 ok(dead.dead,'production death handler accepts remade wretch');step(120);await tick()
 ok(!r.entityMeshes.has(dead.id),'dead wretch mesh retires')
 ;(window as any).wretchCycles=async()=>{
  const memory=[]
  for(let round=0;round<4;round++){
   for(const kind of Object.keys(ids)){await view(kind);eng.map.entities=[];await tick()}
   await qa.warm();memory.push({...r.three.info.memory})
  }
  ok(memory.slice(1).every(v=>v.geometries===memory[1].geometries&&v.textures===memory[1].textures),'spawn/remove resources stabilize across four cycles')
  return {memory,checks}
 }
 return {checks,views}
}

export async function verifyWretchHabitat(qa:any,level=2){
 await qa.scene(level);await qa.warm()
 const eng=qa.eng,p=eng.player,r=qa.r
 eng.map.entities=[];eng.dev.frozenAI=true;eng.paused=false
 let found=false
 for(let a=0;a<Math.PI*2;a+=Math.PI/12){
  const x=p.x+Math.cos(a)*3,y=p.y+Math.sin(a)*3
  if(!canOccupy(eng.map,x,y,.35,{z:p.z,band:p.floor,crouch:false})||!eng.los(p.x,p.y,x,y))continue
  qa.look.yaw=Math.atan2(p.x-x,p.y-y);qa.look.pitch=-.18
  if(eng.devSpawnEntity('wretch',3)){found=true;break}
 }
 if(!found)throw Error('No safe developer summon point in L'+level)
 const e=eng.map.entities.at(-1)
 if(!e.wr||e.hp!==WRETCH_STATS[e.wr.kind as keyof typeof WRETCH_STATS].hp||e.z!==groundHeightAt(eng.map,e.x,e.y,p.floor))throw Error('Developer summon variant/height mismatch')
 e.facing=Math.atan2(p.y-e.y,p.x-e.x);r.setFov(60);await qa.warm()
 if(!r.entityMeshes.get(e.id)?.userData.wretchRig)throw Error('Habitat wretch rig missing')
 return {level,seed:20261006,entity:{id:e.id,position:[e.x,e.y,e.z],kind:e.wr.kind,hp:e.hp},player:[p.x,p.y,p.z],stats:qa.stats()}
}

export async function verifyWretchVoices(){
 const rows=[]
 for(const kind of Object.keys(WRETCH_STATS) as (keyof typeof WRETCH_STATS)[]){
  const context=new OfflineAudioContext(1,96000,48000),voice=new GameAudio(),bus=context.createGain()
  bus.connect(context.destination);Object.assign(voice,{ctx:context,sfx:bus})
  voice.wretchVoice(1,WRETCH_STATS[kind].voice[0],kind)
  const buffer=await context.startRendering(),data=buffer.getChannelData(0)
  let square=0,peak=0,changes=0
  for(let i=0;i<data.length;i++){if(!Number.isFinite(data[i]))throw Error('Nonfinite voice sample');square+=data[i]**2;peak=Math.max(peak,Math.abs(data[i]));if(i&&data[i]*data[i-1]<0)changes++}
  const rms=Math.sqrt(square/data.length)
  if(rms<.0001||peak>1)throw Error('Silent/clipped '+kind+' voice')
  rows.push({kind,sampleRate:48000,samples:data.length,peak,rms,zeroCrossings:changes})
 }
 return rows
}
