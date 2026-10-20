import * as Spatial from '../src/game/world/l1Spatial'
import {l1BakeStats} from '../src/game/renderer/l1BakeQueue'
import {canOccupy} from '../src/game/core/player'
import {l1NativePower} from '../src/game/renderer/l1Probes'

const sleep=(ms=80)=>new Promise(r=>setTimeout(r,ms))
const until=async(f:()=>unknown,label:string,timeout=180000)=>{const start=performance.now();while(!f()){if(performance.now()-start>timeout)throw Error('Timeout '+label);await sleep(100)}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[],seed=20261006
 // Count the entire frame, including composer passes; Three.js otherwise only
 // exposes the final fullscreen triangle. This instrumentation lives in QA.
 const originalRender=r.render.bind(r),renderCpu:number[]=[];r.three.info.autoReset=false
 r.render=(...args:any[])=>{r.three.info.reset();const t=performance.now();try{return originalRender(...args)}finally{renderCpu.push(performance.now()-t);if(renderCpu.length>180)renderCpu.shift()}}
 const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label)}
 const memory=()=>({...r.three.info.memory,programs:r.three.info.programs.length,groups:r.chunkGroups.size})
 const status=()=>({stage:app.stage,mode:app.mode,seed,mapSeed:e.mapSeed,world:[e.player.x+e.map.inf.ox,e.player.y+e.map.inf.oy,e.player.z],camera:r.camera.position.toArray(),yaw:app.look.yaw,pitch:app.look.pitch,roll:app.look.roll,fov:r.camera.fov,generation:Spatial.L1_GENERATION_VERSION,resources:memory(),draws:r.three.info.render.calls,triangles:r.three.info.render.triangles,bake:l1BakeStats()})
 async function warm(){
  const start=performance.now();let stable=start,last=''
  while(true){
   const b=l1BakeStats(),sig=JSON.stringify(memory()),ready=r.isNearWorldReady(e)
   if(!ready||b.active||b.queued||r.cityChunkTask||r.precompileRunning||r.precompileDirty||r.precompileTimer!==null||r.retiredWorld.length||sig!==last){stable=performance.now();last=sig}
   if(performance.now()-start>1400&&performance.now()-stable>650)return{elapsedMs:performance.now()-start,...memory()}
   if(performance.now()-start>180000)throw Error('L1 warmup '+JSON.stringify({ready,bake:b,resources:memory()}))
   await sleep(100)
  }
 }
 function pose(x:number,y:number,z:number,yaw:number,pitch:number,fov=70,roll=0){
  let inf=e.map.inf;e.player.x=x-inf.ox;e.player.y=y-inf.oy;e.updateInfiniteWindow();inf=e.map.inf
  Object.assign(e.player,{x:x-inf.ox,y:y-inf.oy,z,vz:0,floor:0,flashlight:false});Object.assign(app.look,{yaw,pitch,roll});r.setFov(fov,35);e.time=15
 }
 const prepare=async()=>{
  e.devEnabled=true;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.bright=false;e.dev.phenOff.add('flicker');e.handsStowed=true;e.introT=0;e.blackoutT=0;e.blackoutWarnT=0;e.player.flashlight=false
  document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click()
  await until(()=>r.isNearWorldReady(e),'actual L1 entry');await until(()=>!document.querySelector('[role="status"]')?.textContent?.includes('正在准备附近场景'),'loading overlay')
  ok(e.player.level===1&&canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z,band:0}),'Actual game enters L1 with body clearance')
  e.paused=true;pose(15.5,15.5,0,.45,.02,70);await warm()
  ok(!r.three.getContext().isContextLost(),'Native WebGL context alive');return status()
 }
 const scene=async(name:string)=>{
  e.endBlackout();e.dev.phenOff.add('flicker');e.blackoutWarnT=0;e.plantK=0;e.player.flashlight=false;e.paused=true
  let a:any
  if(name==='spawn')a={x:15.5,y:15.5,z:0,yaw:.45,pitch:.02,fov:70}
  else if(app.stage==='before')a=Spatial.L1_PHOTO_ANCHORS.find(v=>v.id===name)
  else if(name==='fabled'){
   const P=await import('../src/game/world/l1Plan'),regs=P.l1PlanRegions(seed,-3400,-3400,3400,3400).filter(v=>v.section==='fabled').sort((a,b)=>Math.hypot(a.ix0,a.iy0)-Math.hypot(b.ix0,b.iy0)),b=regs[0]
   ok(!!b,'A real fabled fortress region exists');a={x:b.ix0+6.5,y:b.iy1-6.5,z:0,yaw:0,pitch:.01,fov:72,region:b.id}
  }else if(name==='path-room'||name==='path-corridor'||name==='barber-room'){
   const P=await import('../src/game/world/l1Plan')
   if(name==='path-room'||name==='barber-room'){
    const rooms=P.l1PlanRooms(seed,-850,-850,850,850),b=name==='barber-room'?rooms.filter(v=>v.type==='sickbay'&&((v.x0*73856093^v.y0*19349663)>>>0)%2===0).sort((a,b)=>Math.hypot(a.x0,a.y0)-Math.hypot(b.x0,b.y0))[0]:rooms.find(v=>v.type==='office')??rooms[0]
    ok(!!b,'Authored path side room exists')
    const tx=(b.x0+b.x1)/2,ty=(b.y0+b.y1)/2,dx=tx-b.door.x-.5,dy=ty-b.door.y-.5,n=Math.hypot(dx,dy)
    const x=Math.max(b.x0+.7,Math.min(b.x1-.7,b.door.x+.5+dx/n)),y=Math.max(b.y0+.7,Math.min(b.y1-.7,b.door.y+.5+dy/n))
    a={x,y,z:0,yaw:Math.atan2(x-tx,y-ty),pitch:-.12,fov:75,room:b}
   }else{
    const doors=P.l1PlanDoors(seed,-500,-500,500,500);let found:any
    for(const d of doors){const nx=d.dir===0?1:d.dir===1?-1:0,ny=d.dir===2?1:d.dir===3?-1:0,x=d.x-nx*2+.5,y=d.y-ny*2+.5
     if(!P.l1PlanTile(seed,Math.floor(x),Math.floor(y)).floor)continue
     for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]])if(Array.from({length:10},(_,i)=>P.l1PlanTile(seed,Math.floor(x+dx*i),Math.floor(y+dy*i))).every(t=>t.floor&&t.style==='maintenance'&&!t.door&&!t.room)){found={x,y,z:0,yaw:Math.atan2(-dx,-dy),pitch:0,fov:70};break}
     if(found)break
    }
    ok(!!found,'Actual path contains a straight corridor view');a=found
   }
  }else{
   const S=Spatial as typeof Spatial&{l1FindReference:(seed:number,id:string,rx?:number)=>unknown}
   a=S.l1FindReference(seed,name,2400);ok(!!a,'Reference bay exists inside a generated hall: '+name)
  }
  ok(!!a,'Scene camera available: '+name);pose(a.x,a.y,a.z??0,a.yaw,a.pitch,a.fov??70,a.roll??0)
  if(name==='power-out'){e.dev.phenOff.delete('flicker');e.blackoutPendingDur=60;e.applyBlackout()}
  const warmed=await warm();ok(!r.three.getContext().isContextLost(),'Scene renders without context loss: '+name)
  const rec={name,anchor:a,warmed,...status()};records.push(rec);return rec
 }
 const sample=async()=>{
  await scene('spawn');await warm();const rounds=[]
  for(let k=0;k<5;k++){
   const frames:number[]=[];let previous=performance.now()
   await new Promise<void>(resolve=>{const frame=(t:number)=>{frames.push(t-previous);previous=t;if(frames.length>=91)resolve();else requestAnimationFrame(frame)};requestAnimationFrame(frame)})
   const sorted=frames.slice(1).sort((a,b)=>a-b),q=(p:number)=>sorted[Math.floor((sorted.length-1)*p)]
   const cpu=renderCpu.slice(-90).sort((a,b)=>a-b)
   rounds.push({median:q(.5),p95:q(.95),renderCpuMedian:cpu[Math.floor(cpu.length*.5)],renderCpuP95:cpu[Math.floor(cpu.length*.95)],draws:r.three.info.render.calls,triangles:r.three.info.render.triangles,resources:memory()})
  }
  ok(rounds.every(v=>Number.isFinite(v.median)&&v.median>0),'Five warmed native-resolution frame samples recorded')
  return{rounds,scope:'Actual App animation frame cadence, true headless native GPU; not GPU timer queries',state:status()}
 }
 const mechanisms=async()=>{
  await scene('spawn');ok(canOccupy(e.map,e.player.x,e.player.y,.32,{z:0,band:0}),'Remade spawn remains walkable')
  const start=[e.player.x,e.player.y];e.input.mx=1;e.input.my=0
  for(let i=0;i<45;i++)e.updateMovement(1/60,{dmg:1,drain:1},false)
  e.input.mx=0;ok(Math.hypot(e.player.x-start[0],e.player.y-start[1])>1,'Real movement advances through the arrival hall')
  const P=await import('../src/game/world/l1Plan'),doors=P.l1PlanDoors(seed,-280,-280,280,280).sort((a,b)=>Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y))
  let interacted=false
  for(const d of doors.slice(0,20)){
   const nx=d.dir===0?1:d.dir===1?-1:0,ny=d.dir===2?1:d.dir===3?-1:0,w=d.axis==='x'?1:2,h=d.axis==='x'?2:1
   const x=d.x+w/2+nx*1.65,y=d.y+h/2+ny*1.65
   pose(x,y,0,Math.atan2(nx,ny),0,70);await warm()
   if(!canOccupy(e.map,e.player.x,e.player.y,.32,{z:0,band:0}))continue
   e.scanInteract();const target=e.interactTarget
   if(target?.kind!=='inkdoor'||target.s?.data?.l1PortalId!==d.id)continue
   const s=target.s;s.data.open=0;s.solid=true;e.scanInteract();e.doInteract();await sleep(700)
   ok(s.data.open===1&&!s.solid,'Actual interaction opens the hall/path metal door')
   e.scanInteract();e.doInteract();await sleep(700)
   ok(s.data.open===0&&s.solid,'Actual interaction closes the same metal door');interacted=true;break
  }
  ok(interacted,'A generated hall/path door can be reached and operated')
  await scene('spawn')
  e.dev.phenOff.delete('flicker');e.blackoutPendingDur=60;e.applyBlackout();await sleep(200)
  ok(e.map.inf.blackout&&e.blackoutT>0,'Actual blackout event disables native lamps')
  ok(Math.abs(l1NativePower.value-.04)<.001,'Blackout retains the supplied four-percent baked residual')
  e.endBlackout();e.dev.phenOff.add('flicker');await sleep(100);ok(l1NativePower.value===1,'Power restoration restores native lighting')
  const {captureL1,restoreL1}=await import('../src/game/engine/l1State');e.l1World=captureL1(e);e.l1World.generation=4
  e.l1World.migration={from:1,to:4,applied:true}
  const taken=[...e.map.inf.taken],dynamics=JSON.stringify(e.l1World.dynamics),inventory=()=>JSON.stringify([e.player.hotbar,e.player.backpack,e.player.equip]),bag=inventory()
  restoreL1(e);ok(e.l1World.generation===Spatial.L1_GENERATION_VERSION,'Previous layout save migrates to the integrated generation')
  ok(e.l1World.migration.to===Spatial.L1_GENERATION_VERSION,'A previously migrated v4 save still receives the new migration')
  ok(inventory()===bag&&JSON.stringify([...e.map.inf.taken])===JSON.stringify(taken)&&JSON.stringify(e.l1World.dynamics)===dynamics,'Migration preserves inventory, taken identities and container progress')
  const {restoreSavedPlayerPosition}=await import('../src/game/engine/level'),inf=e.map.inf,c=inf.chunks.values().next().value,b=c.l1.boxes.find((b:any)=>b.solid&&b.min[1]<1&&b.max[1]>1)
  ok(!!b,'New architecture contains an obstruction for legacy-position testing')
  const placement=restoreSavedPlayerPosition(e,{x:(b.min[0]+b.max[0])/2,y:(b.min[2]+b.max[2])/2})
  ok(placement!=='exact'&&canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z,band:0}),'An old position covered by a new wall moves to nearby walkable floor')
  await warm()
  return{checks:[...checks],state:status()}
 }
 const resources=async()=>{
  await scene('spawn');const rounds=[],npcTick=e.updateNpcs
  const graffitiPool=(await import('../src/game/renderer/textures')).graffitiTextures()
  const textureDetails=()=>[...r.textureUsers].map(([t,users]:any)=>({
   name:t.name,src:t.source?.data?.currentSrc??t.source?.data?.src??'',type:t.type,width:t.image?.width,height:t.image?.height,users,
   graffitiVariant:graffitiPool.indexOf(t),
   roots:[...r.textureRoots].filter(([,set]:any)=>set.has(t)).map(([root]:any)=>[...r.chunkGroups].find(([,value]:any)=>value.group===root)?.[0]??root.name),
  })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  // Hold actor positions and speech timers constant only during the resource
  // comparison; otherwise NPC visibility/portrait creation changes the sample.
  e.updateNpcs=()=>{}
  try{
   const settled=()=>{
    const tail=rounds.slice(-3)
    // Legacy graffiti selects a random entry of a fixed shared pool when a
    // chunk is rebuilt. Check that bounded pool separately, and require exact
    // convergence for all other GPU textures and persistent world references.
    return tail.length===3&&tail.every(v=>v.geometries===tail[0].geometries&&v.programs===tail[0].programs&&v.groups===tail[0].groups&&v.nonGraffitiOwners===tail[0].nonGraffitiOwners&&v.nonGraffitiGpuTextures===tail[0].nonGraffitiGpuTextures&&v.retiredTextures===0&&v.graffitiVariants.length<=graffitiPool.length)
   }
   for(let k=0;k<6;k++){
    pose(111.5,15.5,0,.45,.02,70);await warm();pose(15.5,15.5,0,.45,.02,70);await warm();await sleep(4500)
    const m=memory(),texturesLive=textureDetails(),graffitiVariants=texturesLive.filter(t=>t.graffitiVariant>=0).map(t=>t.graffitiVariant).sort((a,b)=>a-b)
    rounds.push({...m,textureOwners:r.textureUsers.size,nonGraffitiOwners:r.textureUsers.size-graffitiVariants.length,nonGraffitiGpuTextures:m.textures-graffitiVariants.length,graffitiVariants,retiredTextures:r.retiredTextures.size,npcs:r.npcMeshes.size,entities:r.entityMeshes.size,items:r.itemMeshes.size,dynamics:{epoch:e.map.inf.l1Dynamics.epoch,hidden:Object.keys(e.map.inf.l1Dynamics.hidden).length},texturesLive})
    if(k>=4&&settled())break
   }
   records.push({name:'streaming-resources',rounds})
   ok(settled(),'Streaming geometry, programs and non-graffiti textures settle exactly; random graffiti stays within its fixed shared pool')
   return{rounds,state:status(),graffitiPoolSize:graffitiPool.length,scope:'Fixed NPC positions/speech timers; actual streaming; wait beyond the four-second texture handoff; three settled samples; legacy random graffiti verified separately by texture identity'}
  }finally{e.updateNpcs=npcTick}
 }
 const barber=async()=>{
  const rec=await scene('barber-room'),s=e.map.structures.find((s:any)=>s.kind==='barberchair'&&s.data?.l1Room===rec.anchor.room.id)
  ok(!!s,'D generates hydraulic barber chairs inside a real path room')
  const {seatsFor}=await import('../src/game/world/seating'),{beginSitting,updateSitting,standUp}=await import('../src/game/engine/seating'),a=seatsFor(s,e.map,1)[0]
  const inf=e.map.inf
  pose(a.x+inf.ox+Math.sin(a.yaw)*.85,a.y+inf.oy+Math.cos(a.yaw)*.85,0,a.yaw+Math.PI,-.12,75);await warm()
  e.introT=0;e.player.vz=0;e.input.mx=e.input.my=0;e.input.jump=e.input.crouch=false
  ok(beginSitting(e,s),'The generated D barber chair accepts the existing sit interaction')
  for(let i=0;i<60;i++)updateSitting(e,1/60)
  ok(e.seating?.phase==='seated'&&e.seating?.blend===1,'Sit animation settles on the model cushion')
  app.look.pitch=-.65;await sleep(250)
  return{...status(),seat:a,chair:{x:s.x+inf.ox,y:s.y+inf.oy,deg:s.data?.deg},stand:async()=>{ok(standUp(e),'The player can stand up from the D chair');for(let i=0;i<60;i++)updateSitting(e,1/60);ok(!e.seating&&canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z,band:0}),'Standing animation returns to collision-safe floor')}}
 }
 let seatedCheck:any
 return{prepare,scene,sample,mechanisms,resources,barber:async()=>{seatedCheck=await barber();const {stand,...state}=seatedCheck;void stand;return state},stand:async()=>{await seatedCheck.stand();return status()},result:()=>({checks:[...checks],records,state:status()})}
}
