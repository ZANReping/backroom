import * as THREE from 'three'
import { buildAvatarModel, retroModelReady } from '../src/game/renderer/retroAvatar'
import { disposeCharacterModel } from '../src/game/renderer/retroResources'
import { DEFAULT_AVATAR } from '../src/game/core/avatar'
import { makeEntity } from '../src/game/entities'
import { NPCS, npcAvatar } from '../src/game/content/npcs'
import { buildCharacterModel } from '../src/game/renderer/characterModel'

export async function verifyRetroAvatar(qa:any){
 let checks=0;const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks++}
 const e=qa.eng,r=qa.r,p=e.player,frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
 const tom=e.npcs.find((n:any)=>n.id==='tom');ok(tom,'Tom spawned in restaurant')
 const view=async(mode:string)=>{
  qa.mode(mode);p.x=tom.x+.1;p.y=tom.y+2.4;p.z=0;tom.facing=Math.atan2(p.y-tom.y,p.x-tom.x)
  const dx=tom.x-p.x,dy=tom.y-p.y;qa.look.yaw=Math.atan2(-dx,-dy);qa.look.pitch=.16
  r.setFov(60);await qa.warm();qa.freezeRenderTime(1.25);await frame()
 }
 ;(window as any).retroView=view
 await view('realistic')
 const rec=r.npcMeshes.get('tom');ok(rec,'Production renderer builds Tom')
 let skin:THREE.SkinnedMesh|undefined;rec.grp.traverse((o:THREE.Object3D)=>{if(o.userData.retro?.mesh)skin=o.userData.retro.mesh})
 ok(skin?.skeleton.bones.length===19,'Production renderer uses 19-bone character')
 // Validate the uploaded pixels, not only HTMLImage.ready: a 2x2 placeholder
 // allocation must be replaced when the full face arrives on a cold start.
 const face=(skin!.material as THREE.MeshLambertMaterial[])[1].map!
 const target=new THREE.WebGLRenderTarget(64,64),testScene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10)
 camera.position.z=2
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:face}));testScene.add(plane)
 const priorTarget=r.three.getRenderTarget();r.three.setRenderTarget(target);r.three.render(testScene,camera)
 const pixels=new Uint8Array(64*64*4);r.three.readRenderTargetPixels(target,0,0,64,64,pixels);r.three.setRenderTarget(priorTarget)
 const shades=new Set<number>();for(let i=0;i<pixels.length;i+=4)shades.add((pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2])
 ok(shades.size>100,'Cold face texture has uploaded detail rather than placeholder');plane.geometry.dispose();plane.material.dispose();target.dispose()
 const arm=rec.parts.armL,initial=arm.rotation.x;tom.tx=tom.x+2;tom.moveT=10
 for(let i=0;i<12;i++){e.time+=1/60;e.updateNpcs(1/60);await frame()}
 ok(arm.rotation.x!==initial,'Actual NPC displacement drives new arm');tom.tx=tom.x;tom.ty=tom.y
 const variants=[]
 for(const id of ['kat','tom','aiko','kowalski','joey']){
  const model=buildCharacterModel(npcAvatar(NPCS[id]),{npcId:id,npcDef:NPCS[id],driven:true});r.scene.add(model);model.position.set(tom.x,0,tom.y)
  for(let i=0;i<200&&!retroModelReady(model);i++)await new Promise(resolve=>setTimeout(resolve,30))
  ok(retroModelReady(model),id+' textures ready');model.userData.retroUpdate(1.2);await frame()
  variants.push({id,...model.userData.retro.diagnostics});r.scene.remove(model);disposeCharacterModel(model)
 }
 const ent=makeEntity('faceling',p.x-1,p.y-1,0);e.map.entities.push(ent);for(let i=0;i<12;i++)await frame()
 const fg=r.entityMeshes.get(ent.id);ok(!!fg?.userData.retroUpdate,'Faceling has new animation dispatcher');ok(fg?.userData.parts.head?.isBone,'Faceling bone attachments')
 e.map.entities=e.map.entities.filter((v:any)=>v!==ent);await frame()
 const a=buildAvatarModel(DEFAULT_AVATAR),b=buildAvatarModel(DEFAULT_AVATAR),bm=b.userData.retro.mesh
 a.position.set(p.x-1,0,p.y-1);b.position.set(p.x-1.8,0,p.y-1);r.scene.add(a,b)
 for(let i=0;i<200&&!retroModelReady(b);i++)await new Promise(resolve=>setTimeout(resolve,30))
 await frame();let textureDisposals=0,boneDisposals=0
 const maps=new Set<THREE.Texture>();for(const m of bm.material)if(m.map)maps.add(m.map)
 for(const t of maps)t.addEventListener('dispose',()=>textureDisposals++)
 a.userData.retro.mesh.skeleton.boneTexture.addEventListener('dispose',()=>boneDisposals++)
 r.scene.remove(a);disposeCharacterModel(a);await frame()
 ok(boneDisposals===1,'Rendered bone texture disposed');ok(textureDisposals===0&&retroModelReady(b),'Other avatar keeps shared texture alive');r.scene.remove(b);disposeCharacterModel(b)
 const cycles=[]
 for(let round=0;round<4;round++){
  const models=Array.from({length:12},(_,i)=>buildAvatarModel({...DEFAULT_AVATAR,hair:i%16}));for(const m of models){m.position.set(tom.x,0,tom.y);r.scene.add(m)}await frame();await frame()
  for(const m of models){r.scene.remove(m);disposeCharacterModel(m)}await frame();await frame();cycles.push({...r.three.info.memory})
 }
 ok(cycles.slice(1).every(v=>v.geometries===cycles[1].geometries&&v.textures===cycles[1].textures),'Repeated avatar disposal stabilizes resources')
 for(const mode of ['classic','realistic']){await view(mode);ok(r.npcMeshes.get('tom')?.parts.head?.isBone,mode+' rebuild retains model')}
 return {checks,variants,cycles,stats:qa.stats()}
}
