import * as THREE from 'three'
import { L7_ARENA } from '../src/game/world/infiniteL7'
import { l8InstrumentCave } from '../src/game/world/infiniteL8'
import { floorHeight, caveVolumeFieldAt } from '../src/game/world/mapgen'
import { makeEntity } from '../src/game/entities'
import { TINY, tinyState } from '../src/game/engine/tinyAI'
const sleep=(n=80)=>new Promise(r=>setTimeout(r,n))
const until=async(f:()=>unknown,label:string,limit=90000)=>{const start=performance.now();while(!f()){if(performance.now()-start>limit)throw Error('Timeout '+label);await sleep()} }
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label)}
 let pin:{x:number;y:number;z:number;yaw:number;pitch:number}|null=null,raf=0,actor:any
 const tick=()=>{if(pin&&e.map){const p=e.player;p.x=pin.x-(e.map.inf?.ox??0);p.y=pin.y-(e.map.inf?.oy??0);p.z=pin.z;p.vz=0;app.look.yaw=pin.yaw;app.look.pitch=pin.pitch}raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick)
 const aim=(wx:number,wy:number,z:number,tx:number,ty:number,tz:number)=>{pin={x:wx,y:wy,z,yaw:Math.atan2(wx-tx,wy-ty),pitch:Math.atan2(tz-(z+1.62),Math.hypot(tx-wx,ty-wy))};e.player.facing=Math.atan2(ty-wy,tx-wx);tickOnce()}
 const tickOnce=()=>{if(!pin)return;const p=e.player;p.x=pin.x-(e.map.inf?.ox??0);p.y=pin.y-(e.map.inf?.oy??0);p.z=pin.z;p.vz=0;app.look.yaw=pin.yaw;app.look.pitch=pin.pitch}
 const clear=()=>{e.map.entities=[];for(const c of e.map.inf?.chunks.values()??[])c.entities=[]}
 const ready=()=>r.isNearWorldReady(e)&&!document.querySelector('.loading-screen')
 const reset=()=>{pin=null;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.invisible=false;e.dev.bright=false;e.over=false;e.transition=null;e.introT=0;e.input.mx=e.input.my=0;e.input.attack=e.input.attackHeld=e.input.interact=false;e.handsStowed=false;e.usingItem=null;e.player.vz=0}
 const load=async(id:number)=>{reset();const start=performance.now();e.loadLevel(id,{mapSeed:424242,firstVisit:false});reset();await until(ready,'level '+id,180000);return{level:id,entryMs:performance.now()-start}}
 const equip=()=>{const p=e.player;p.flashlight=true;p.battery=100;p.equip.offhand={type:'flashlight',count:1};p.hotbar[0]={type:'stonekazoo',count:1};p.selected=0;e.syncPassives();e.handsStowed=false}
 const status=()=>({level:e.player.level,player:{x:e.player.x+(e.map.inf?.ox??0),y:e.player.y+(e.map.inf?.oy??0),z:e.player.z},chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size,memory:{...r.three.info.memory},calls:r.three.info.render.calls,triangles:r.three.info.render.triangles})
 const perch=async()=>{
  const entry=await load(7);equip();const a=L7_ARENA
  aim(a.x+6.7,a.y+3.9,-a.depth+1.32,a.x+.5,a.y+.5,-a.depth+1.77);e.updateInfiniteWindow()
  await until(()=>ready()&&e.map.exits.some((x:any)=>x.def.kind==='littledoor')&&e.map.entities.some((x:any)=>x.def.type==='tiny'),'arena streamed',180000)
  actor=e.map.entities.find((x:any)=>x.def.type==='tiny');e.map.entities=e.map.entities.filter((x:any)=>x===actor);for(const c of e.map.inf.chunks.values())c.entities=c.entities.filter((x:any)=>x===actor)
  e.dev.frozenAI=false;await sleep(180);e.dev.frozenAI=true
  await until(()=>r.entityMeshes.has(actor.id)&&!actor.presentationPending,'Tiny GPU ready');await sleep(350)
  ok(e.tinyBlocksLittleDoor(),'natural Tiny guards generated L9 door');ok(r.entityMeshes.get(actor.id).userData.parts.pelt,'new shark-pelt model in actual renderer')
  records.push({name:'perch',...entry,...status()});return records.at(-1)
 }
 const close=async()=>{const a=L7_ARENA;aim(a.x+2.9,a.y+1.4,-a.depth+.62,a.x+.5,a.y+.5,actor.z+1.1);await sleep(400);e.scanInteract();ok(e.interactTarget?.kind==='tiny','actual aiming finds Tiny conversation');return{target:e.interactTarget.label,...status()}}
 const talk=async()=>{e.doInteract();await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent?.includes('你是什么东西')),'actual Tiny dialogue opens');await sleep(350);ok(true,'updated Tiny dialogue opens in actual App');return status()}
 const leaveTalk=async()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('（退开）'));ok(b,'Tiny peaceful leave reply');b!.click();await until(()=>!e.paused,'dialogue closes');ok(!actor.provoked,'peaceful dialogue does not provoke Tiny');return status()}
 const blowFour=async()=>{
  const a=L7_ARENA;aim(a.x+5.1,a.y+1.1,-a.depth+.82,a.x+.5,a.y+.5,-a.depth+1.9);equip();e.dev.statLock=false;e.dev.frozenAI=false;e.breathT=0;await sleep(100)
  const start=e.breathT,phases=[]
  for(let i=0;i<4;i++){e.useSlot('hotbar',0);ok(e.usingItem?.anim==='blow','use starts blow animation '+i);await until(()=>!e.usingItem,'blow finishes',2500);phases.push(actor.tiny?.phase);if(i<3)await sleep(80)}
  ok(actor.tiny.phase==='repel'&&actor.tiny.repels===1,'four actual timed uses repel Tiny');ok(e.submerged&&e.breathT-start>=20,'underwater blows spend at least twenty seconds of oxygen');ok(e.player.hotbar[0].count===1,'stone kazoo is reusable')
  return{phases,oxygen:e.breathT-start,state:actor.tiny.phase,...status()}
 }
 const flee=async()=>{await until(()=>!e.tinyBlocksLittleDoor(),'door opens after Tiny swims away',7000);ok(actor.tiny.phase==='repel','door opens during repel');e.dev.frozenAI=true;e.dev.statLock=true;const a=L7_ARENA,wx=actor.x+e.map.inf.ox,wy=actor.y+e.map.inf.oy;aim(a.x+5.1,a.y+1.1,-a.depth+.82,wx,wy,actor.z+1.2);await sleep(250);return{distance:Math.hypot(wx-a.x-.5,wy-a.y-.5),phase:actor.tiny.phase,blocked:e.tinyBlocksLittleDoor(),...status()}}
 const hold=async()=>{await sleep(450);ok(r.vmItem&&r.vmHeld==='stonekazoo','actual first-person kazoo model selected');return{held:r.vmHeld,...status()}}
 let useFn:any
 const blowing=async()=>{e.useSlot('hotbar',0);await until(()=>e.usingItem?.t>.2,'blow middle',2500);useFn=e.updateItemUse;e.updateItemUse=()=>{};await sleep(120);ok(e.usingItem.anim==='blow'&&Math.abs(r.vm.rotation.y)>.2,'first-person hand raises and turns kazoo toward mouth');return{anim:e.usingItem.anim,t:e.usingItem.t,duration:e.usingItem.dur,rotation:r.vm.rotation.toArray(),...status()}}
 const returned=async()=>{if(useFn){e.updateItemUse=useFn;useFn=null}e.usingItem=null;e.dev.frozenAI=false;e.dev.statLock=true;await until(()=>actor.tiny.phase==='perch'&&e.tinyBlocksLittleDoor(),'Tiny returns to door',45000);e.dev.frozenAI=true;ok(true,'Tiny returns and blocks door after repel expires');actor.hp=-99999;e.killCheck(actor);ok(!actor.dead&&actor.hp===actor.def.hp&&actor.provoked,'actual combat guard prevents death and provokes Tiny');return{phase:actor.tiny.phase,hp:actor.hp,...status()}}
 const cave=async()=>{
  const entry=await load(8);equip();clear();const c=l8InstrumentCave(e.map.inf.seed),wx=c.x+Math.cos(c.rot)*3.3,wy=c.y+Math.sin(c.rot)*3.3
  aim(wx,wy,c.floor,c.x-Math.cos(c.rot)*2.5,c.y-Math.sin(c.rot)*2.5,c.floor+.9);e.updateInfiniteWindow();await until(()=>ready()&&e.map.structures.some((s:any)=>s.kind==='stoneinstruments'),'instrument cave streaming',180000);clear()
  aim(wx,wy,floorHeight(e.map,wx-e.map.inf.ox,wy-e.map.inf.oy),c.x-Math.cos(c.rot)*2.5,c.y-Math.sin(c.rot)*2.5,c.floor+.9);await sleep(700)
  const roots:any[]=[];r.scene.traverse((o:any)=>{if(o.name==='instrumentCave')roots.push(o)})
  ok(roots.length===1,'single generated instrument cave rendered');const root=roots[0];ok(root.userData.seats.length===11&&root.userData.seats.every((s:any)=>s.ok),'all eleven instruments fit actual cave field')
  const samples:any[]=[];root.updateWorldMatrix(true,true);root.traverse((o:any)=>{if(!o.isMesh||!o.name.startsWith('instr:'))return;let min=Infinity,max=-Infinity;const p=o.geometry.attributes.position,v=new THREE.Vector3();for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/220))){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);const f=caveVolumeFieldAt(e.map,v.x,v.y,v.z);min=Math.min(min,f);max=Math.max(max,f)}samples.push({kind:o.name,minField:min,maxField:max});if(o.name==='instr:kazoospike'){const column=root.children.find((c:any)=>c.isMesh&&!c.name.startsWith('instr:'));ok(column,'stalactite extension reaches roof');column.updateWorldMatrix(true,false);const box=new THREE.Box3().setFromObject(column,true),spikeBox=new THREE.Box3().setFromObject(o,true);ok(box.intersectsBox(spikeBox),'stalactite joins its extension');const top=box.getCenter(new THREE.Vector3());top.y=box.max.y-.02;ok(caveVolumeFieldAt(e.map,top.x,top.y,top.z)<0,'extension inserts into actual cave roof')}else ok(min>-.1&&min<.11,'rendered instrument contacts rock with single ground offset: '+o.name+' '+min.toFixed(3))})
  const kazoo=e.map.items.filter((q:any)=>q.type==='stonekazoo'&&Math.hypot(q.x+e.map.inf.ox-c.x,q.y+e.map.inf.oy-c.y)<5);ok(kazoo.length===1,'one natural stone kazoo below broken stalactite');records.push({name:'cave',...entry,cave:c,samples,...status()});return records.at(-1)
 }
 const reverse=async()=>{const c=l8InstrumentCave(e.map.inf.seed),wx=c.x-Math.cos(c.rot)*2.6+Math.cos(c.rot+Math.PI/2)*.8,wy=c.y-Math.sin(c.rot)*2.6+Math.sin(c.rot+Math.PI/2)*.8;aim(wx,wy,floorHeight(e.map,wx-e.map.inf.ox,wy-e.map.inf.oy),c.x+Math.cos(c.rot)*1.5,c.y+Math.sin(c.rot)*1.5,c.floor+1);await sleep(400);return status()}
 const chime=async()=>{const s=e.map.structures.find((s:any)=>s.kind==='stonechime');ok(s,'natural stone chime');const sx=s.x+.5,sy=s.y+.5,sz=floorHeight(e.map,sx,sy),wx=sx+e.map.inf.ox,wy=sy+e.map.inf.oy;const c=l8InstrumentCave(e.map.inf.seed);aim(wx+Math.cos(c.rot)*1.2,wy+Math.sin(c.rot)*1.2,sz,wx,wy,sz+2);await sleep(300);e.scanInteract();ok(e.interactTarget?.kind==='stonechime','actual aiming finds chime');e.doInteract();await sleep(350);ok(s.data.ring===1,'actual interaction starts ninety-second stone chime');return{target:e.interactTarget?.kind,ring:s.data.ring,...status()}}
 const recycle=async()=>{await perch();await until(()=>r.chunkBuilds.size===0,'fixed streaming window settles');await sleep(4500);const baseline={...r.three.info.memory},a=L7_ARENA,rows=[];for(let i=0;i<3;i++){const q=makeEntity('tiny',a.x+4-e.map.inf.ox,a.y+1-e.map.inf.oy,-a.depth+1);q.def={...q.def,passive:true};e.map.entities.push(q);await until(()=>r.entityMeshes.has(q.id)&&!q.presentationPending,'recycle model ready');await sleep(150);e.map.entities=e.map.entities.filter((n:any)=>n!==q);await until(()=>!r.entityMeshes.has(q.id),'recycle removed');await sleep(700);rows.push({...r.three.info.memory})}ok(rows.every(x=>x.geometries===rows[0].geometries&&x.textures===rows[0].textures),'three fixed-scene model recycle rounds retain stable geometry and texture counts');return{baseline,rows,...status()}}
 const cleanup=async()=>{if(useFn)e.updateItemUse=useFn;pin=null;cancelAnimationFrame(raf);await load(4);clear();await sleep(500);ok(![...r.entityMeshes.values()].some((o:any)=>o.userData.entityType==='tiny'),'Tiny model removed on level switch');return status()}
 return{perch,close,talk,leaveTalk,blowFour,flee,hold,blowing,returned,cave,reverse,chime,recycle,cleanup,summary:()=>({checks,records,status:status()})}
}
