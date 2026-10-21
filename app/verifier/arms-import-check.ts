
import * as THREE from 'three'
import {makeEntity} from '../src/game/entities'
import * as A from '../src/game/engine/armsAI'
import {canOccupy} from '../src/game/core/player'
import {ceilingHeightAt,floorHeight} from '../src/game/world/mapgen'
import {WALL_H} from '../src/game/renderer/shared'
import {armsBudget,armsRig,armsVent} from '../src/game/renderer/armsMesh'
const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
const until=async(f:()=>unknown,label:string,ms=90000)=>{const start=performance.now();while(!f()){if(performance.now()-start>ms)throw Error('Timeout '+label);await sleep(40)}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 let arm:any,homeWorld:any
 // Isolate this actual-Engine test from ambient blackout encounters; the real arms AI remains unchanged.
 const originalEntities=e.updateEntities.bind(e)
 e.updateEntities=(...args:any[])=>{if(arm)e.map.entities=e.map.entities.filter((q:any)=>q.id===arm.id);return originalEntities(...args)}
 const ok=(v:unknown,message:string)=>{if(!v)throw Error(message);checks.push(message)}
 const memory=()=>({...r.three.info.memory,programs:r.three.info.programs.length})
 const center=()=>({x:homeWorld.x-e.map.inf.ox,y:homeWorld.y-e.map.inf.oy})
 const state=()=>{
  const root=r.entityMeshes.get(arm?.id),rig=root?armsRig(armsVent(root.userData.armsHome)!.anchor.children[0]):null
  return{mode:arm?.ar?.mode,clipT:arm?.ar?.clipT,phase:e.armsRun.phase,black:A.armsOverlay(e).black,struggle:e.armsRun.struggle,hp:e.player.hp,world:[e.player.x+e.map.inf.ox,e.player.y+e.map.inf.oy,e.player.z],visible:!!root?.visible,gpuSkin:!!rig?.mesh.visible,cpuProxy:!!rig?.mesh.userData.cpuProxy,count:rig?.count,stat:arm?.ar?.stat,resources:memory(),budget:root?armsBudget(root):null}
 }
 const status=()=>({level:e.player.level,paused:e.paused,over:e.over,current:arm?state():null,near:r.isNearWorldReady(e),chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size,memory:memory()})
 const aim=(x:number,y:number,tx:number,ty:number,h:number,light=true)=>{
  Object.assign(e.player,{x,y,z:0,vz:0,crouching:false,flashlight:light,battery:100})
  Object.assign(app.look,{yaw:Math.atan2(x-tx,y-ty),pitch:Math.atan2(h-1.62,Math.hypot(x-tx,y-ty)),roll:0})
 }
 const dark=()=>{
  e.dev.phenOff.delete('flicker')
  if(!A.armsBlackout(e)){e.blackoutPendingDur=9999;e.applyBlackout()}
  e.blackoutT=9999
 }
 const reset=()=>{
  e.paused=true;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.over=false;e.input.mx=e.input.my=0;e.input.jump=false
  Object.assign(e.armsRun,A.freshArmsRun())
  const s=arm.ar;Object.assign(s,{mode:'hidden',cd:0,t:0,clipT:0,noise:0,expo:0,lose:0,hpSeen:A.ARMS.hp,banishT:0,wasDark:A.armsBlackout(e),spit:null,spitVent:null})
  arm.hp=A.ARMS.hp;arm.dead=false;arm.hidden=true;arm.attackCd=0
  e.player.hp=100;e.player.sanity=100;e.handsStowed=true
 }
 document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click()
 const setup=async()=>{
  e.paused=true;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.phenOff.add('flicker');e.handsStowed=true;e.endBlackout()
  const m=e.map,p=e.player,H=WALL_H[e.levelDef.gen]??3;let spot:any
  for(let d=0;d<35&&!spot;d++)for(let dy=-d;dy<=d&&!spot;dy++)for(let dx=-d;dx<=d&&!spot;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==d)continue
   const x=Math.floor(p.x)+dx+.5,y=Math.floor(p.y)+dy+.5,c=ceilingHeightAt(m,x,y,H,0);if(c<2.6||c>4.2||!Number.isFinite(c))continue
   let valid=true
   for(let b=-4;b<=4&&valid;b+=.5)for(let a=-4;a<=4&&valid;a+=.5)if(a*a+b*b<=16)valid=canOccupy(m,x+a,y+b,.32,{z:0,band:0})&&Math.abs(floorHeight(m,x+a,y+b,0))<.02
   if(valid)spot={x,y,ceil:c}
  }
  ok(spot,'real L1 hall has a clear ceiling and collision-safe floor')
  homeWorld={x:spot.x+m.inf.ox,y:spot.y+m.inf.oy}
  m.entities=[];for(const c of m.inf.chunks.values())c.entities=[]
  arm=makeEntity('arms',spot.x,spot.y,0);arm.id=990015;m.entities.push(arm)
  m.inf.chunks.get(Math.floor(homeWorld.x/32)+','+Math.floor(homeWorld.y/32))?.entities.push(arm)
  const s=A.armsState(e,arm),start=performance.now()
  e.player.equip.offhand={type:'flashlight',count:1};aim(spot.x+2.8,spot.y+1.2,spot.x,spot.y,s.vent.ceil-.6)
  await until(()=>r.entityMeshes.get(arm.id)?.visible&&!arm.presentationPending,'first arms GPU preparation')
  const root=r.entityMeshes.get(arm.id),rig=armsRig(armsVent(root.userData.armsHome)!.anchor.children[0])!
  ok(rig.count===s.count&&root.userData.armsHome.userData.armsKey===s.count+':'+s.seed,'real instance starts with the correct prepared count and seed')
  const rec={name:'setup',prepareMs:performance.now()-start,homeWorld,spot,seed:s.seed,...state()};records.push(rec);return rec
 }
 const poseEntity=async(clip:string)=>{
  reset();const s=arm.ar,v=center(),mz=A.armsMouthZ(s.vent)
  aim(v.x+2.8,v.y+1.1,v.x,v.y,mz-.85)
  const clips:any={hidden:0,emerge:3.1,search:2,lunge:1.13,grab:.45,drag:1.2,burnRetreat:.75}
  s.mode=clip;s.clipT=clips[clip]??1;s.t=s.clipT;arm.hidden=clip==='hidden'
  s.strike={wx:e.player.x+e.map.inf.ox,wy:e.player.y+e.map.inf.oy,z:A.ARMS.chestH}
  s.grabFrom={...s.strike};s.dragTo={wx:s.vent.wx+.3,wy:s.vent.wy,z:mz-1}
  if(clip==='grab'||clip==='drag'){
   e.armsRun.captor=arm.id;e.armsRun.phase='held';e.armsRun.struggle=3
   const c=A.armsHeldChest(e,arm)!;e.player.x=c.wx-e.map.inf.ox;e.player.y=c.wy-e.map.inf.oy;e.player.z=c.z-A.ARMS.chestH
   app.look.pitch=.72
  }
  await sleep(450);const st=state()
  if(clip!=='hidden')ok(st.gpuSkin&&!st.cpuProxy,'native GPU skin is visible in '+clip)
  const rec={name:clip,...st};records.push(rec);return rec
 }
 const liveGrab=async()=>{
  reset();dark();const v=center(),s=arm.ar
  aim(v.x+2.2,v.y+.25,v.x,v.y,A.armsMouthZ(s.vent)-.8,false)
  e.dev.god=false;e.dev.frozenAI=false;e.dev.statLock=true;e.paused=false
  const trace:any[]=[];let previous='',start=performance.now()
  for(let k=0;k<6;k++){e.noiseEvent(e.player.x,e.player.y,10,true);await sleep(110)}
  await until(()=>{
   const key=s.mode+':'+e.armsRun.phase;if(key!==previous){trace.push({ms:performance.now()-start,...state()});previous=key}
   return e.armsRun.phase==='held'
  },'live noise, warning, emergence and grab',30000)
  ok(s.stat.grabs>0&&e.player.hp<100,'real AI warning and lunge grab the player and deal damage')
  const rec={name:'live-grab',trace,...state()};records.push(rec);return rec
 }
 const escape=async()=>{
  await until(()=>arm.ar.stat.escapes>0,'actual jump-key struggle',7000)
  ok(e.armsRun.phase!=='held','keyboard struggle releases the player')
  await until(()=>e.armsRun.phase==='none','escape landing',5000)
  ok(A.armsLandingOk(e,e.player.x,e.player.y,e.player.z),'escaped player lands outside solids')
  e.paused=true;e.dev.frozenAI=true;const rec={name:'escape',...state()};records.push(rec);return rec
 }
 const transit=async()=>{
  await liveGrab();const s=arm.ar,trace:any[]=[];records.push({name:'transit-trace',trace});let previous='',sawInside=false
  await until(()=>{
   const key=s.mode+':'+e.armsRun.phase
   if(key!==previous){trace.push({ms:e.time,...state()});previous=key}
   if(e.armsRun.phase==='inside')sawInside=true
   return e.armsRun.hint==='spat'&&e.armsRun.phase==='none'
  },'real drag, swallow and safe spit',40000)
  const distance=Math.hypot(e.player.x+e.map.inf.ox-s.vent.wx,e.player.y+e.map.inf.oy-s.vent.wy)
  ok(sawInside&&s.stat.swallows>0,'real movement and HUD enter the duct phase')
  ok(e.player.hp<=54.01&&e.player.hp>=A.ARMS.minHp&&!e.over,'swallow applies internal non-lethal injury while shielding outside damage')
  ok(distance>=A.ARMS.spitMin-2&&distance<=A.ARMS.spitMax+2&&A.armsLandingOk(e,e.player.x,e.player.y,e.player.z),'spit reaches a safe distant floor')
  const hpAtLanding=e.player.hp
  e.paused=true;e.dev.frozenAI=true;e.dev.god=true
  const sv=s.spitVent??s.temps.at(-1)??s.vent
  app.look.yaw=Math.atan2(e.player.x-(sv.wx-e.map.inf.ox),e.player.y-(sv.wy-e.map.inf.oy));app.look.pitch=.55;e.player.flashlight=true
  await until(()=>r.isNearWorldReady(e)&&!r.chunkBuilds.size,'streaming after spit',90000)
  const rec={name:'transit',distance,hpAtLanding,trace,...state()};records.push(rec);return rec
 }
 const burn=async()=>{
  reset();dark();const s=arm.ar,v=center()
  aim(v.x+3.2,v.y+.3,v.x,v.y,A.armsMouthZ(s.vent)-.7,true)
  s.mode='search';s.t=1;s.clipT=1;arm.hidden=false;arm.attackCd=10
  e.dev.frozenAI=false;e.paused=false
  await until(()=>s.mode==='burnRetreat','actual flashlight burn retreat',7000)
  await until(()=>s.clipT>=.65,'burn pose',4000)
  e.paused=true;e.dev.frozenAI=true
  ok(s.stat.burns>0,'real flashlight repels the arms');const rec={name:'burn',...state()};records.push(rec);return rec
 }
 const debris=async()=>{
  e.paused=false;e.dev.frozenAI=false
  await until(()=>arm.ar.marks.some((m:any)=>m.kind==='burn'),'actual burnt debris',6000)
  e.paused=true;e.dev.frozenAI=true;const v=center();aim(v.x+1.8,v.y+.2,v.x,v.y,0.08)
  await sleep(500);ok(!!r.entityMeshes.get(arm.id).userData.armsMarks.size,'burnt debris is rendered')
  const rec={name:'debris',...state()};records.push(rec);return rec
 }
 const banish=async()=>{
  const kills=e.player.kills;arm.hp=0;e.killCheck(arm)
  ok(!arm.dead&&arm.ar.mode==='banished'&&e.player.kills===kills,'health depletion banishes without counting a kill')
  const rec={name:'banished',...state()};records.push(rec);return rec
 }
 const cycles=async()=>{
  reset();e.endBlackout();e.dev.phenOff.add('flicker');e.particles=[];const v=center();aim(v.x+2.6,v.y+.2,v.x,v.y,2.3)
  const remove=()=>{e.map.entities=e.map.entities.filter((x:any)=>x.id!==arm.id);for(const c of e.map.inf.chunks.values())c.entities=c.entities.filter((x:any)=>x.id!==arm.id)}
  remove();await until(()=>!r.entityMeshes.has(arm.id),'initial recycle');await sleep(900)
  const samples=[]
  for(let k=0;k<6;k++){
   arm=makeEntity('arms',v.x,v.y,0);arm.id=991015+k;const s=A.armsState(e,arm);s.mode='search';s.clipT=2;s.t=2;arm.hidden=false;s.marks.push({kind:'burn',wx:s.vent.wx,wy:s.vent.wy,z:s.vent.floorZ,age:1,seed:15});e.map.entities.push(arm)
   await until(()=>{const root=r.entityMeshes.get(arm.id);return root?.visible&&!arm.presentationPending&&armsRig(armsVent(root.userData.armsHome)!.anchor.children[0])?.mesh.visible},'cycle preparation');await sleep(100)
   const shown=memory();remove();await until(()=>!r.entityMeshes.has(arm.id),'cycle recycle');await sleep(500);samples.push({shown,empty:memory()})
  }
  ok(new Set(samples.slice(-3).map(s=>JSON.stringify(s.empty))).size===1,'last three recycle rounds stabilize resources')
  records.push({name:'cycles',samples});return samples
 }
 const sample=async()=>{await sleep(400);return{memory:memory(),draws:r.three.info.render.calls,triangles:r.three.info.render.triangles}}
 return{setup,poseEntity,liveGrab,escape,transit,burn,debris,banish,cycles,sample,state,status,summary:()=>({checks,records,status:status()})}
}
