import * as THREE from 'three'
import {NPCS,npcAvatar,brcWorkerDef} from '../src/game/content/npcs'
import {buildCharacterModel} from '../src/game/renderer/characterModel'
import {retroModelReady} from '../src/game/renderer/retroAvatar'
import {disposeCharacterModel} from '../src/game/renderer/retroResources'
import {npcPortrait} from '../src/components/npcPortrait'
import {humanoidMotion} from '../src/game/renderer/humanoidMotion'
import {NpcGearFit} from '../src/game/renderer/npcGearFit'
export async function checkNpcGearRuntime(qa:any){
 let checks=0;const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks++},frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()))
 const e=qa.eng,r=qa.r,source=e.npcs.find((n:any)=>n.id==='nightingale')??e.npcs[0]
 ok(source,'Alpha NPCs available')
 const view=async(mode:string)=>{if(e.player.level!==101)await qa.scene(101);qa.mode(mode);const n=e.npcs.find((n:any)=>n.id===source.id);e.player.x=n.x;e.player.y=n.y+2.1;e.player.z=0;n.facing=Math.PI/2;qa.look.yaw=0;qa.look.pitch=.05;r.setFov(55);await qa.warm();qa.freezeRenderTime(1.25);await frame();return qa.stats()}
 ;(window as any).gearRuntimeView=view
 ;(window as any).gearRuntimePerformance=async()=>{
  await qa.scene(104);qa.mode('realistic')
  // The current settlement blueprint omits Joey. Add him only to this isolated
  // engine fixture, so the production NPC renderer and performance animation run.
  let n=e.npcs.find((v:any)=>v.id==='joey');const fixture=!n
  if(!n){n={...e.npcs[0],id:'joey',def:NPCS.joey,x:41,y:31,homeX:41,homeY:31,tx:41,ty:31,facing:Math.PI/2,floor:0,dead:false,hostile:false};e.npcs.push(n)}
  ok(n.def===NPCS.joey,'Registered Joey definition used by actual game renderer')
  e.player.x=n.x;e.player.y=n.y+2.2;e.player.z=0;n.facing=Math.PI/2;qa.look.yaw=0;qa.look.pitch=.09;r.setFov(55);e.joeyPlaying=true
  await qa.warm();qa.freezeRenderTime(1.25);for(let i=0;i<90;i++)await frame()
  const rec=r.npcMeshes.get('joey'),rig=humanoidMotion(rec.grp)!.rig,guitar=rig.bones.spine.children.find(o=>o.userData.joeyGuitar)!
  ok(rec.guitarK>.99,'Existing gameplay performance animation reaches playing pose')
  const fit=new NpcGearFit({userData:{retro:rig}} as THREE.Object3D);let maxContactError=0
  for(let i=0;i<24;i++){await frame();for(const side of ['left','right'] as const){const hand=fit.hand(side),p=rig.bones[hand.bone].localToWorld(new THREE.Vector3(...hand.point).sub(fit.bind.get(hand.bone)!)),target=guitar.localToWorld(side==='right'?new THREE.Vector3(.024,-.035+Math.sin(r.time*8.8)*.016,.041):new THREE.Vector3(0,.30,.027));maxContactError=Math.max(maxContactError,p.distanceTo(target))}}
  ok(maxContactError<.008,'Actual game guitar hand contact within 8 mm');return{fixture,maxContactError,stats:qa.stats()}
 }
 await view('realistic')
 const visible=[...r.npcMeshes.entries()] as [string,any][];ok(visible.length>0,'Production renderer has NPC meshes')
 for(const [id,rec] of visible){let model:THREE.Object3D|undefined;rec.grp.traverse((o:THREE.Object3D)=>{if(o.userData.npcGear)model=o});ok(model,'Production NPC uses shared fitted factory '+id)}
 const portrait=[]
 for(const id of ['tom','aiko','martin','nightingale']){const d=NPCS[id],m=buildCharacterModel(npcAvatar(d),{npcId:id,npcDef:d});for(let i=0;i<240&&!retroModelReady(m);i++)await new Promise(r=>setTimeout(r,30));ok(retroModelReady(m),'Textures ready '+id);disposeCharacterModel(m);const image=npcPortrait(npcAvatar(d),id,d,128,'identity');ok(image.startsWith('data:image/'),'Portrait rendered '+id);portrait.push(id)}
 // Actual scene, actual material/shadow pipeline: animate, retire and rebuild each equipment family.
 const defs=[NPCS.aiko,NPCS.tom,NPCS.joey,NPCS.morel,brcWorkerDef(400,3,2,0)],cycles=[]
 for(let round=0;round<4;round++){
  const models=defs.map(d=>buildCharacterModel(npcAvatar(d),{npcId:d.id,npcDef:d,driven:true}))
  models.forEach((m,i)=>{m.position.set(source.x+(i-2)*.5,0,source.y);r.scene.add(m)})
  for(let t=0;t<24;t++){for(const m of models){humanoidMotion(m)!.update({time:t/24,x:t*.025,y:0,z:0,facing:Math.PI/2,tool:true});m.userData.retroUpdate(t/24)}await frame()}
  for(const m of models){r.scene.remove(m);disposeCharacterModel(m)}await frame();await frame();cycles.push({...r.three.info.memory})
 }
 ok(cycles.slice(1).every(v=>v.geometries===cycles[1].geometries&&v.textures===cycles[1].textures),'GPU resources stable after NPC disposal')
 const modes=[],samples=[];for(const mode of ['realistic','classic']){await view(mode);modes.push({mode,stats:qa.stats()});for(let i=0;i<5;i++)samples.push({mode,...await qa.sample(100,1200)})}
 return {checks,portrait,cycles,modes,samples}
}
