import * as THREE from 'three'
import {makeEntity,entityForm} from '../src/game/entities'
import {canOccupy} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
import {initNW,nwCaptor,releaseNW,NW} from '../src/game/engine/watchAI'
import {mothFx,updateMoth} from '../src/game/engine/mothAI'
import {mangledGeometryReady} from '../src/game/renderer/watchRender'
import {mothBudget} from '../src/game/renderer/deathmothMesh'
import {rigBudget} from '../src/game/renderer/rigKit'
import {l5NestLayout} from '../src/game/world/infiniteL5'
const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
const until=async(f:()=>unknown,label:string,ms=120000)=>{const at=performance.now();while(!f()){if(performance.now()-at>ms)throw Error('Timeout '+label);await sleep(40)}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[];let base={x:e.player.x,y:e.player.y},active:any[]=[];let serial=0
 const originalRender=r.render;r.three.info.autoReset=false
 r.render=function(...args:any[]){r.three.info.reset();return originalRender.apply(this,args)}
 const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label)}
 const memory=()=>({...r.three.info.memory,programs:r.three.info.programs.length})
 const allSkins=(root:any)=>{const a:THREE.SkinnedMesh[]=[];root?.traverse((o:any)=>{if(o.isSkinnedMesh&&o.visible)a.push(o)});return a}
 const clear=()=>{releaseNW(e);active=[];if(e.map){e.map.entities=[];for(const c of e.map.inf?.chunks.values()??[])c.entities=[]}e.particles=[]}
 const reset=()=>{e.paused=true;e.over=false;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.invisible=false;e.dev.bright=true;e.l9FogPhase='idle';e.l9FogT=9999;e.l9FogK=0;e.handsStowed=true;e.player.hp=100;e.player.sanity=100;e.player.flashJamT=0;e.player.slowT=0;e.player.z=0;e.player.vz=0;e.input.mx=e.input.my=0;e.input.jump=e.input.attack=e.input.interact=false}
 const aim=(x:number,y:number,tx:number,ty:number,z:number)=>{Object.assign(e.player,{x,y,z:0,vz:0,crouching:false,flashlight:true,battery:100});e.player.equip.offhand={type:'flashlight',count:1};Object.assign(app.look,{yaw:Math.atan2(x-tx,y-ty),pitch:Math.atan2(z-1.62,Math.hypot(x-tx,y-ty)),roll:0})}
 const add=(type:string,dist:number,form?:string)=>{
  const q=makeEntity(type,base.x+dist,base.y,0,form as any);q.id=990000+(++serial);q.facing=Math.PI;q.targetX=q.x;q.targetY=q.y
  if(type==='deathmoth'){q.z=form==='male'||form==='female'?1.05:0;updateMoth(e,q,0,1e6,1)}else initNW(q)
  active.push(q);e.map.entities.push(q);return q
 }
 const prepared=async(q:any)=>{const at=performance.now();await until(()=>r.entityMeshes.get(q.id)?.visible&&!q.presentationPending,'actual model GPU ready '+q.def.type);await sleep(180);const root=r.entityMeshes.get(q.id),skins=allSkins(root);ok(skins.length>0&&skins.every(s=>s.visible&&!s.userData.cpuProxy),'native GPU skins shown: '+q.def.type+'/'+(q.def.mothForm??''));for(const m of skins){m.updateMatrixWorld(true);m.skeleton.update();const v=new THREE.Vector3();for(let i=0;i<m.geometry.attributes.position.count;i+=Math.max(1,Math.floor(m.geometry.attributes.position.count/20))){m.getVertexPosition(i,v);ok(v.toArray().every(Number.isFinite),'finite GPU skin vertices')}}return{prepareMs:performance.now()-at,budget:q.def.type==='deathmoth'?mothBudget(root):rigBudget(root),memory:memory(),skins:skins.length}}
 const status=()=>({level:e.player.level,paused:e.paused,near:r.isNearWorldReady(e),chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size,memory:memory(),active:active.map(q=>({type:q.def.type,form:q.def.mothForm,phase:q.nw?.phase,clip:q.mt?.clip,visible:r.entityMeshes.get(q.id)?.visible,pending:q.presentationPending}))})
 const setup=async()=>{
  reset();clear();const m=e.map,p=e.player
  let spot:any
  for(let d=0;d<35&&!spot;d++)for(let dy=-d;dy<=d&&!spot;dy++)for(let dx=-d;dx<=d&&!spot;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==d)continue
   const x=Math.floor(p.x)+dx+.5,y=Math.floor(p.y)+dy+.5;let good=true
   for(let k=0;k<=26;k+=1.5)if(!canOccupy(m,x+k,y,.34,{z:0})||m.outdoor?.[Math.floor(y)*m.w+Math.floor(x+k)]!==1){good=false;break}
   if(good)spot={x,y}
  }
  ok(spot,'real Level 9 has a collision-safe outdoor road');base=spot;aim(base.x,base.y,base.x+8,base.y,1.7)
  document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click()
  await until(()=>r.isNearWorldReady(e),'L9 world and native prewarm');return{base,world:[base.x+m.inf.ox,base.y+m.inf.oy],...status()}
 }
 const scene=async(name:string)=>{
  reset();clear();let q:any
  if(name.startsWith('moth-')){
   const form=name.slice(5);q=add('deathmoth',form==='larva'?0.8:form==='guard'?1.6:1.2,form)
   q.mt.clip=form==='guard'?'rear':form==='larva'?'crawl':'hover';q.mt.clipT=.8
   aim(base.x,base.y,q.x,q.y,form==='guard'?.55:form==='larva'?.055:1.05)
  }else{
   const type=name.startsWith('watcher')?'watcher':name.startsWith('mangled')?'mangled':name;q=add(type,type==='mangled'?(name==='mangled-wide'?55:25):type==='strider'?5.7:6)
   q.nw.clip=type==='watcher'?(name==='watcher-beam'?'beam':'charge'):type==='strider'?'walk':'snatch';q.nw.clipT=type==='mangled'?.8:1.2;q.nw.phase=type==='watcher'?(name==='watcher-beam'?'beam':'charge'):'patrol';q.nw.aimX=base.x;q.nw.aimY=base.y;q.nw.aimZ=1.5
   aim(base.x,base.y,q.x,q.y,type==='mangled'?17:type==='strider'?1.8:1.75)
   if(name==='watcher-beam'){e.dev.bright=false}
  }
  const detail=await prepared(q)
  if(q.def.type==='mangled'){await until(()=>mangledGeometryReady(0),'background detailed mangled geometry');await sleep(500)}
  await sleep(650);const root=r.entityMeshes.get(q.id)
  const rec={name,type:q.def.type,form:q.def.mothForm,detail,finalBudget:q.def.type==='deathmoth'?mothBudget(root):rigBudget(root),player:[e.player.x,e.player.y,e.player.z],entity:[q.x,q.y,q.z],look:{...app.look},mode:app.mode};records.push(rec);return rec
 }
 const mechanics=async()=>{
  reset();clear();aim(base.x,base.y,base.x+7,base.y,1.75)
  const w=add('watcher',7);await prepared(w);e.player.equip.offhand=null;e.player.flashlight=false;e.dev.god=false;e.dev.frozenAI=false;e.paused=false
  await until(()=>w.nw.phase==='charge','actual Engine watcher charge',8000);const chargeHp=e.player.hp;await until(()=>w.nw.phase==='beam','actual Engine watcher beam',8000);await until(()=>e.player.hp<chargeHp,'actual watcher beam damage',3000);const hitHp=e.player.hp
  ok(hitHp>0&&hitHp<chargeHp,'watcher beam has warning and deals non-instant damage through actual Engine loop')
  e.paused=true;e.dev.frozenAI=true;e.dev.god=true;reset();clear()
  aim(base.x,base.y,base.x+1.55,base.y,1.5);const s=add('strider',1.55);await prepared(s);e.player.flashlight=false;e.dev.god=false;e.dev.frozenAI=false;e.paused=false
  await until(()=>nwCaptor(e)===s,'actual Engine strider grab',12000);ok(s.nw.phase==='grab','strider reaches and grabs in the running game')
  for(let k=0;k<10&&nwCaptor(e);k++){e.input.jump=true;await sleep(65);e.input.jump=false;await sleep(65)}
  await until(()=>!nwCaptor(e),'struggle release',4000);ok(e.player.hp>0,'actual movement jump-edge struggle releases player alive')
  e.paused=true;e.dev.frozenAI=true;reset();clear();aim(base.x,base.y,base.x+1.2,base.y,1.05)
  const moth=add('deathmoth',1.2,'male');await prepared(moth);e.handsStowed=false;e.player.hotbar[0]={type:'almond',count:2};e.player.selected=0;e.player.facing=0
  const almondBefore=e.countItem('almond');ok(e.useSlot('hotbar',0),'real inventory begins almond feeding');ok(e.usingItem?.targetMoth===moth.id,'actual crosshair targets a flying male above melee height');e.paused=false;e.dev.frozenAI=true
  await until(()=>!e.usingItem,'complete almond use',7000);ok(moth.mt.tamed&&e.countItem('almond')===almondBefore-1,'actual consume animation completion tames one male and consumes exactly one bottle')
  reset();e.handsStowed=true
  const result={chargeHp,hitHp,strugglePhase:s.nw.phase,tamed:moth.mt.tamed,hp:e.player.hp};records.push({name:'mechanics',...result});return result
 }
 const cycles=async()=>{
  reset();clear();aim(base.x,base.y,base.x+6,base.y,2)
  const samples:any[]=[]
  for(let k=0;k<6;k++){
   const qs=[add('deathmoth',2,'male'),add('deathmoth',2.5,'female'),add('deathmoth',3,'guard'),add('deathmoth',3.4,'larva'),add('watcher',6),add('strider',7),add('mangled',25)]
   for(const q of qs)await prepared(q)
   await until(()=>mangledGeometryReady(0),'cycle high geometry');await sleep(300);const shown=memory();clear();await until(()=>qs.every(q=>!r.entityMeshes.has(q.id)),'actual entity recycle');await sleep(700);samples.push({shown,empty:memory()})
  }
  ok(new Set(samples.slice(-3).map(s=>JSON.stringify(s.empty))).size===1,'last three complete model creation and recycle rounds stabilize GPU resources');records.push({name:'cycles',samples});return samples
 }
 const sample=async()=>{
  reset();clear();const q=add('mangled',25);aim(base.x,base.y,q.x,q.y,17);await prepared(q);await until(()=>mangledGeometryReady(0),'performance complete detail');await sleep(700)
  const rounds=[];for(let n=0;n<5;n++){
   const times:number[]=[],draws:number[]=[],tris:number[]=[];let last=performance.now()
   for(let k=0;k<90;k++){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const now=performance.now();times.push(now-last);last=now;draws.push(r.three.info.render.calls);tris.push(r.three.info.render.triangles)}
   times.sort((a,b)=>a-b);draws.sort((a,b)=>a-b);tris.sort((a,b)=>a-b);rounds.push({median:times[45],p95:times[85],drawCalls:{median:draws[45],min:draws[0],max:draws.at(-1)},triangles:tris[45]})
  }
  return{scope:'Actual Chrome headless requestAnimationFrame cadence, developer fixed lighting, L9 mangled scene; not a GPU timer or Android result',rounds,memory:memory()}
 }
 const level5=async()=>{
  reset();clear();const start=performance.now();e.loadLevel(5,{mapSeed:20261006,firstVisit:false});e.paused=true;e.dev.frozenAI=true;e.dev.god=true;e.dev.bright=true;e.handsStowed=true
  await until(()=>r.isNearWorldReady(e),'actual level5 loading and prewarm',180000)
  const entryMs=performance.now()-start
  let layout:any
  for(let d=0;d<=30&&!layout;d++)for(let hr=-d;hr<=d&&!layout;hr++)for(let hk=-d;hk<=d&&!layout;hk++)if(Math.max(Math.abs(hk),Math.abs(hr))===d)layout=l5NestLayout(e.map.inf.seed,hk,hr)
  ok(layout,'deterministic actual Level 5 layout contains a main nest')
  e.player.x=layout.doorX+1.7-e.map.inf.ox;e.player.y=layout.doorY+.5-e.map.inf.oy;e.updateInfiniteWindow()
  await until(()=>r.isNearWorldReady(e),'stream actual main-nest neighborhood',180000)
  const n=e.map.inf.mothNests?.[layout.id] as any;ok(n,'L5 main nest registered by actual generator')
  const ox=e.map.inf.ox,oy=e.map.inf.oy;let at={x:n.doorX+1.7-ox,y:n.doorY+.5-oy};if(!canOccupy(e.map,at.x,at.y,.32,{z:0}))at={x:n.cx-ox,y:n.cy-oy}
  aim(at.x,at.y,n.doorX-ox,n.doorY+.5-oy,1.3);await sleep(200)
  e.scanInteract();const entryDoor=e.interactTarget?.s
  if(entryDoor?.data?.mothNest===n.id){e.doInteract();await sleep(400)}
  const inside={x:n.x1-.8-ox,y:n.cy+1.4-oy};ok(canOccupy(e.map,inside.x,inside.y,.32,{z:0}),'main nest interior has a safe player position')
  aim(inside.x,inside.y,n.x0+2-ox,n.y0+2-oy,1.15);e.dev.bright=false;await sleep(2400)
  ok(r.mothView?.root.parent===r.scene&&r.mothView.root.children.some((g:any)=>g.name==='mothNest:'+n.id),'actual Level 5 nest props displayed through world view')
  let instances=0;r.mothView.root.traverse((o:any)=>{if(o.isInstancedMesh)instances++});ok(instances>0,'nest eggs use instancing')
  const result={entryMs,totalWithNestTeleportMs:performance.now()-start,nest:n.id,world:[n.cx,n.cy],instances,memory:memory()};records.push({name:'level5',...result});return result
 }
 const portraits=async()=>{
  const {requestEntityPortrait,entityPortraitStats}=await import('../src/components/entityPortrait')
  const images=[]
  for(const [type,step,name] of [['deathmoth',0,'male'],['deathmoth',4,'female'],['deathmoth',8,'larva'],['deathmoth',12,'guard'],['watcher',0,'watcher'],['strider',0,'strider'],['mangled',0,'mangled']] as const){
   const result=await new Promise<any>(resolve=>requestEntityPortrait(type,resolve,step))
   ok(result.status==='ready'&&result.src.startsWith('data:image/png;base64,'),'actual entity archive portrait generated for '+name)
   images.push({name,src:result.src})
  }
  return{images,stats:entityPortraitStats()}
 }
 return{setup,scene,mechanics,cycles,sample,level5,portraits,status,summary:()=>({checks,records,status:status()})}
}
