import * as THREE from 'three'
import {makeEntity} from '../src/game/entities'
import {canOccupy,PLAYER_RADIUS} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
import {WIN,isOrdinaryWindow,windowMount,stepWindowWorld,updateWindowEntity} from '../src/game/engine/windowAI'
import {openVending,structMachine,vendingView,vm36,vm36Struck} from '../src/game/engine/vendingAI'
import {npcIdleForce,npcIdleView} from '../src/game/engine/npcIdle'
import {humanoidMotion} from '../src/game/renderer/humanoidMotion'
const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
const until=async(fn:()=>unknown,label:string,limit=90000)=>{const t=performance.now();while(!fn()){if(performance.now()-t>limit)throw Error('Timeout '+label);await sleep()}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],originalP={...WIN.SPAWN_P};let pad:{x:number;y:number}|null=null,s:any,vm:any,faces:any[]=[],npc:any,windowEntity:any,windowHost:any
 const ok=(v:unknown,msg:string)=>{if(!v)throw Error(msg);checks.push(msg)}
 const ready=()=>r.isNearWorldReady(e)&&!e.paused&&!document.querySelector('.loading-screen')
 const clear=()=>{e.map.entities=[];for(const c of e.map.inf?.chunks.values()??[])c.entities=[]}
 const stand=(x:number,y:number)=>canOccupy(e.map,x,y,PLAYER_RADIUS,{z:floorHeight(e.map,x,y,0)+.02,band:0,crouch:false})
 const aim=(x:number,y:number,z=1)=>{const p=e.player,dx=x-p.x,dy=y-p.y;p.facing=Math.atan2(dy,dx);app.look.yaw=-p.facing-Math.PI/2;app.look.pitch=Math.atan2(z-p.z-1.58,Math.hypot(dx,dy));app.look.roll=0}
 const go=(x:number,y:number)=>{e.seating=e.ride=e.climb=e.porchDrop=null;Object.assign(e.player,{x,y,z:floorHeight(e.map,x,y,0)+.02,vz:0,floor:0,crouching:false});e.moveIt.acc=0;e.input.mx=e.input.my=0;e.input.attack=false;e.specialHeld=false}
 const load=async(level:number)=>{e.devEnabled=true;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.invisible=true;e.dev.bright=false;e.loadLevel(level,{mapSeed:424242,firstVisit:false});e.introT=0;e.over=false;e.transition=null;e.handsStowed=true;await until(ready,'load '+level);clear();await sleep(250)}
 const findPad=()=>{const m=e.map,p=e.player,found:{x:number;y:number;d:number}[]=[];for(let y=Math.max(3,Math.floor(p.y)-32);y<Math.min(m.h-3,p.y+32);y++)for(let x=Math.max(3,Math.floor(p.x)-32);x<Math.min(m.w-3,p.x+32);x++){
  let valid=true;for(let dy=-2;dy<=2&&valid;dy++)for(let dx=-2;dx<=2;dx++)if(!stand(x+.5+dx,y+.5+dy)||Math.abs(floorHeight(m,x+.5+dx,y+.5+dy,0))>.1){valid=false;break}
  if(valid)found.push({x:x+.5,y:y+.5,d:Math.hypot(x-p.x,y-p.y)})
 }found.sort((a,b)=>a.d-b.d);if(!found.length)throw Error('No natural open pad');return found[0]}
 const status=()=>({level:e.player.level,player:{x:e.player.x,y:e.player.y,z:e.player.z},entities:r.entityMeshes.size,memory:{...r.three.info.memory},calls:r.three.info.render.calls,checks:checks.length})
 const vending=async()=>{
  await load(4);pad=findPad();go(pad.x,pad.y+1.8);aim(pad.x,pad.y-2);ok(e.devSpawnDecor('vending'),'Original developer placement creates vending structure')
  s=e.map.structures.at(-1);s.data={...s.data,trade:1,deg:0};s.x=Math.floor(pad.x);s.y=Math.floor(pad.y-1);await until(()=>r.structMeshes.get(s),'vending structure');await until(ready,'vending geometry')
  go(s.x+.5,s.y+2.7);aim(s.x+.5,s.y+.5,1.0);await sleep(200);openVending(e,{s});await until(()=>document.querySelector('.vm-panel'),'real vending UI')
  const root=r.structMeshes.get(s);ok(root?.getObjectByName('vmBody'),'Actual structure uses new vending model');ok(vendingView(e)?.slots.length===8,'Real overlay shows eight slots');return{...status(),stock:structMachine(e,s).stock,brand:structMachine(e,s).brand}
 }
 const vendDispense=async()=>{
  const before=e.countItem(structMachine(e,s).products[0]),random=Math.random;try{Math.random=()=>.9;(document.querySelector('.vm-slot')as HTMLButtonElement).click()}finally{Math.random=random}
  await until(()=>!!vendingView(e)?.bin,'animated product reaches bin',10000);ok(!e.paused,'Vending overlay leaves actual game running')
  const product=structMachine(e,s).products[0];await until(()=>{const b=document.querySelector('.vm-bin')as HTMLButtonElement;return b&&!b.disabled},'React bin button refresh');(document.querySelector('.vm-bin')as HTMLButtonElement).click();ok(e.countItem(product)===before+1,'Real overlay take button adds selected product once');await sleep(200)
  return{...status(),product,bin:vendingView(e)?.bin,stock:structMachine(e,s).stock}
 }
 const e36=async()=>{
  (document.querySelector('.vm-close')as HTMLButtonElement)?.click();await sleep(150);clear();e.map.structures=e.map.structures.filter((q:any)=>q!==s);for(const c of e.map.inf?.chunks.values()??[])c.structures=c.structures.filter((q:any)=>q!==s);if(e.map.inf)e.map.inf.redo=(e.map.inf.redo??0)+1;e.mapRev++;await until(()=>!r.structMeshes.has(s)&&ready(),'remove previous QA vending');go(pad!.x,pad!.y+1.5);aim(pad!.x,pad!.y-1,1.2)
  vm=makeEntity('vendingmachine',pad!.x,pad!.y-1,0);vm.facing=Math.PI/2;e.map.entities.push(vm);vm36(vm,e)
  await until(()=>r.entityMeshes.get(vm.id)?.userData.entryPrepared&&!vm.presentationPending,'E36 GPU preparation');await sleep(200)
  const root=r.entityMeshes.get(vm.id);ok(!!root?.userData.vending,'Actual E36 uses shared remake rig');vm36Struck(e,vm,10);e.dev.invisible=false;e.dev.frozenAI=false;await sleep(1000);e.dev.frozenAI=true
  ok(vm.vm.mode==='emerge'||vm.vm.mode==='chase','Attacking E36 starts emergence animation');return{...status(),mode:vm.vm.mode,bodyY:r.entityMeshes.get(vm.id)?.userData.vending?.body.position.y}
 }
 const facelings=async()=>{
  clear();e.dev.invisible=true;e.dev.frozenAI=true;go(pad!.x,pad!.y+2);aim(pad!.x,pad!.y-1,.95)
  faces=['child','adult','elder'].map((age,i)=>{const ent=makeEntity('faceling',pad!.x+(i-1)*1.05,pad!.y-1,0);ent.fcAge=age as any;ent.facing=Math.PI/2;ent.state='idle';e.map.entities.push(ent);return ent})
  await until(()=>faces.every(q=>r.entityMeshes.get(q.id)?.userData.entryPrepared&&!q.presentationPending),'faceling preparation');await sleep(200)
  const sizes=faces.map(q=>new THREE.Box3().setFromObject(r.entityMeshes.get(q.id)).getSize(new THREE.Vector3()).y)
  ok(sizes[0]<sizes[1]*.78,'Actual child mesh is shorter than adult');ok(faces.every(q=>humanoidMotion(r.entityMeshes.get(q.id))),'All ages retain animated humanoid rigs');return{...status(),heights:sizes}
 }
 const soothe=async()=>{
  const child=faces[0];faces.slice(1).forEach(q=>q.dead=true);go(child.x,child.y+1.1);aim(child.x,child.y,.5);e.dev.invisible=false;e.dev.frozenAI=false
  const {updateFaceling}=await import('../src/game/engine/facelingAI');updateFaceling(e,child,0);Object.assign(child.fc,{mode:'tantrum',modeT:0,gesture:'tantrum',gT:2,gW:1,cryT:99});await sleep(250)
  e.specialHeld=true;await until(()=>child.fc.mode==='soothed'||child.fc.mode==='hug'||child.fc.mode==='follow','actual held soothe',7000);e.specialHeld=false;ok(child.fc.mode!=='tantrum','Holding special input soothes a visible child');e.dev.frozenAI=true;return{...status(),mode:child.fc.mode}
 }
 const windows=async(level:number)=>{
  await load(level);WIN.SPAWN_P[level]=0
  const candidates=e.map.structures.filter((s:any)=>isOrdinaryWindow(level,s)).map((s:any)=>({s,mt:windowMount(e,s)})).filter((c:any)=>c.mt).sort((a:any,b:any)=>Math.hypot(a.s.x-e.player.x,a.s.y-e.player.y)-Math.hypot(b.s.x-e.player.x,b.s.y-e.player.y))
  let chosen:any,point:any;for(const c of candidates){const mt=c.mt;for(const dist of [2.8,2.2,1.8]){const x=mt.wx-(e.map.inf?.ox??0)+mt.nx*dist,y=mt.wy-(e.map.inf?.oy??0)+mt.ny*dist;if(stand(x,y)){chosen=c;point={x,y};break}}if(chosen)break}
  ok(chosen,'Generated Level '+level+' has a safely approachable window');go(point.x,point.y);e.winRun.reg.clear();e.winRun.reg.set(`${level}:${Math.round(chosen.mt.wx*4)}:${Math.round(chosen.mt.wy*4)}`,{life:'occupied',sil:.85,lifeT:0,seed:3});e.winRun.scanT=0;stepWindowWorld(e,.016)
  const key=chosen.mt,ent=e.map.entities.find((q:any)=>q.win&&Math.hypot(q.win.wx-key.wx,q.win.wy-key.wy)<.1);ok(ent,'Window entity attaches to an existing generated window')
  windowEntity=ent;windowHost=chosen.s;ent.win.mode='lure';ent.win.modeT=1;ent.win.reg.sil=.85;ent.win.reg.life='occupied';aim(ent.x,ent.y,level===2?1.45:1.75)
  await until(()=>r.entityMeshes.get(ent.id)?.userData.entryPrepared&&!ent.presentationPending,'window rig');await sleep(250);const g=r.entityMeshes.get(ent.id);r.scene.updateMatrixWorld(true);ok(g.visible&&!ent.hidden,'Occupied window scenery is visible in the actual scene');const w=g.userData.window,pane=w.pane,wp=pane.getWorldPosition(new THREE.Vector3()),cam=r.camera,dir=wp.clone().sub(cam.position).normalize(),ray=new THREE.Raycaster(cam.position,dir),hits=ray.intersectObjects(r.scene.children,true).filter((h:any)=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent}return true}).slice(0,12).map((h:any)=>({name:h.object.name,type:h.object.type,mat:h.object.material?.type,d:h.distance,p:h.point.toArray(),entity:h.object===pane}));const diag={origin:[e.map.inf?.ox,e.map.inf?.oy],host:chosen.s,ent:{x:ent.x,y:ent.y,hidden:ent.hidden,pending:ent.presentationPending,win:ent.win},root:{p:g.position.toArray(),world:g.getWorldPosition(new THREE.Vector3()).toArray(),visible:g.visible,scale:g.scale.toArray(),rot:g.rotation.toArray()},pane:{p:wp.toArray(),visible:pane.visible,side:pane.material.side,clip:wp.clone().project(cam).toArray(),uniforms:{sil:w.uniforms.uSil.value,vanish:w.uniforms.uVanish.value,bright:w.uniforms.uBright.value}},camera:{p:cam.position.toArray(),rot:cam.rotation.toArray()},hits};ok(g.userData.window.style===(level===2?'l2':level===4?'l4':'l601'),'Entity uses layer-specific window model');return{...status(),style:g.userData.window.style,mount:chosen.mt,diag}
 }
 const windowReach=async()=>{const w=windowEntity.win;w.mode='reach';w.modeT=.37;await sleep(200);const g=r.entityMeshes.get(windowEntity.id);ok(g.userData.window.arm.visible,'Window reach clip exposes its articulated arm in the game');return status()}
 const windowVanish=async()=>{
  const w=windowEntity.win;w.reg.life='dying';w.reg.lifeT=0;w.mode='vanish';w.modeT=WIN.VANISH_T;updateWindowEntity(e,windowEntity,.016);e.winRun.scanT=0;stepWindowWorld(e,.016)
  ok(windowHost.data.windowGone===1,'Expired window removes its ordinary host model to expose the real wall');const rev=e.mapRev,world=r.levelGroup;await sleep(300);await until(ready,'vanished window world');const host=r.structMeshes.get(windowHost);ok(host&&!host.userData.windowOpen.visible,'Expired host window hides its ordinary frame and glass');ok(e.mapRev===rev&&r.levelGroup===world,'Window disappearance retains the existing world geometry');if(host.userData.windowClosed)ok(host.userData.windowClosed.visible,'Expired L4 window becomes a solid matching facade wall');ok(!r.entityMeshes.has(windowEntity.id),'Vanished entity GPU model is retired');e.scanInteract();ok(e.interactTarget?.s!==windowHost,'Expired window cannot still offer its old interaction');return status()
 }
 const npcIdle=async()=>{
  await load(101);const source=e.npcs.find((n:any)=>!n.dead&&n.def.faction==='meg');ok(source,'Alpha retains its assigned residents');npc=source
  go(npc.x+Math.cos(npc.facing)*2.4,npc.y+Math.sin(npc.facing)*2.4);aim(npc.x,npc.y,1.2);await until(()=>r.npcMeshes.get(npc.id),'NPC render')
  const rec=r.npcMeshes.get(npc.id),rig=humanoidMotion(rec.grp)!.rig,position={x:npc.x,y:npc.y},before=rig.bones.head.quaternion.clone();await sleep(1800)
  ok(Math.hypot(npc.x-position.x,npc.y-position.y)<1.4,'Alpha NPC remains within assigned local duty range');ok(before.angleTo(rig.bones.head.quaternion)>.0001,'Actual duty NPC has subtle idle motion')
  const st=npcIdleForce(npc,'watch');st.actDur=4;st.actT=1.5;await sleep(350);return{...status(),npc:npc.id,act:npcIdleView(npc)?.act}
 }
 const modelChurn=async()=>{
  WIN.SPAWN_P[4]=0;await windows(4);const template=windowEntity;clear();e.winRun.reg.clear();await until(()=>r.entityMeshes.size===0,'resource baseline retirement');let quietSince=0;await until(()=>{const quiet=r.chunkBuilds.size===0&&r.chunkGroups.size===e.map.inf.chunks.size&&r.itemWarmup.jobs.size===0&&r.retiredWorld.length===0;if(!quiet)quietSince=0;else quietSince||=performance.now();return quiet&&performance.now()-quietSince>800},'all loaded chunks and upload/disposal queues settle')
  const samples:any[]=[];for(let i=0;i<4;i++){
   const machine=makeEntity('vendingmachine',e.player.x+2,e.player.y-1,0);vm36(machine,e);machine.facing=Math.PI/2
   const win=makeEntity('windowent',template.x,template.y,0);win.hidden=false;win.win={...template.win,reg:{...template.win.reg,life:'occupied',sil:.85},mode:'idle'}
   e.map.entities.push(machine,win);await until(()=>[machine,win].every(q=>r.entityMeshes.get(q.id)?.userData.entryPrepared&&!q.presentationPending),'resource rigs prepared');await sleep(200)
   const shown={...r.three.info.memory};clear();await until(()=>r.entityMeshes.size===0,'resource models retired');await sleep(450);samples.push({shown,retired:{...r.three.info.memory}})
  }
  app.resourceSamples=samples;const warm=samples.slice(1).map(q=>q.retired);ok(Math.max(...warm.map(q=>q.geometries))-Math.min(...warm.map(q=>q.geometries))<=1,'Repeated vending/window retirements keep GPU geometry stable after warmup');ok(Math.max(...warm.map(q=>q.textures))-Math.min(...warm.map(q=>q.textures))<=1,'Repeated vending/window retirements retain shared GPU textures without growth')
  const info=r.three.info,auto=info.autoReset,frames:any[]=[];info.autoReset=false;info.reset();let last=performance.now();try{for(let i=0;i<120;i++)await new Promise<void>(resolve=>requestAnimationFrame(now=>{frames.push({ms:now-last,calls:info.render.calls,triangles:info.render.triangles});last=now;info.reset();resolve()}))}finally{info.autoReset=auto;info.reset()}
  const sorted=frames.slice(5).map(f=>f.ms).sort((a,b)=>a-b),at=(p:number)=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];Object.assign(WIN.SPAWN_P,originalP);return{samples,frameSample:{frames:frames.slice(5),medianMs:at(.5),p95Ms:at(.95)},...status()}
 }
 const l4Frame=async()=>{
  WIN.SPAWN_P[4]=0;await load(4);go(78.5,69);aim(78.5,66.45,1.75);let quietSince=0;await until(()=>{const quiet=r.chunkBuilds.size===0&&r.chunkGroups.size===e.map.inf.chunks.size&&r.itemWarmup.jobs.size===0&&r.retiredWorld.length===0;if(!quiet)quietSince=0;else quietSince||=performance.now();return quiet&&performance.now()-quietSince>800},'frame sample world settled')
  const info=r.three.info,auto=info.autoReset,frames:any[]=[];info.autoReset=false;info.reset();let last=performance.now();try{for(let i=0;i<155;i++)await new Promise<void>(resolve=>requestAnimationFrame(now=>{frames.push({ms:now-last,calls:info.render.calls,triangles:info.render.triangles});last=now;info.reset();resolve()}))}finally{info.autoReset=auto;info.reset()}
  const data=frames.slice(5),sorted=data.map(f=>f.ms).sort((a,b)=>a-b),at=(p:number)=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];Object.assign(WIN.SPAWN_P,originalP);return{frames:data,medianMs:at(.5),p95Ms:at(.95),...status()}
 }
 const cleanup=async()=>{Object.assign(WIN.SPAWN_P,originalP);e.specialHeld=false;await load(4);return status()}
 return{vending,vendDispense,e36,facelings,soothe,windowL2:()=>windows(2),windowL4:()=>windows(4),windowL601:()=>windows(12),windowReach,windowL4Vanish:windowVanish,windowVanish,npcIdle,cleanup,modelChurn,l4Frame,summary:()=>({checks,status:status(),resourceSamples:app.resourceSamples})}
}
