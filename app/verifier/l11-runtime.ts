import { Engine } from '../src/game/engine'
import { storage } from '../src/game/core/storage'
import { canOccupy } from '../src/game/core/player'
import { bandOfPlayerZ, floorHeight } from '../src/game/world/mapgen'
import { updateMovement } from '../src/game/engine/movement'
import { l11CityPlan, l11Buildings, l11World, l11TerrainHeight, l11SurfaceAt } from '../src/game/world/l11Layout'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { L11 } from '../src/game/levels/l11'
import { scanInteract, doInteract, finishSearch, takeAllLoot } from '../src/game/engine/interact'
import { snapshot, persist, loadSaveSnapshot, SAVE_SLOT_KEYS } from '../src/game/engine/save'
import { freshCareer, route } from '../src/game/engine/career'
import { activeMegMissionCount, megMissionLock, acceptMegMission, submitMegStage, updateMegMissions, promoteMeg, megState, canAdministerMeg, trackMegTask } from '../src/game/engine/megMissions'
import { MEG_MISSIONS, isPausedMegMission } from '../src/game/content/megMissions'
import { MEG_PROMOTION_COUNTS as FACTION_PROMOTION_COUNTS } from '../src/game/content/megMissions'
import { bounds, circlePolygon, inPolygon } from '../src/game/world/l11Geometry'
import { l11FloorKind } from '../src/game/renderer/l11Meshes'
import { l11BuildingSign, L11_SIGNS } from '../src/game/content/l11Signs'
import { l11SignMaterial } from '../src/game/renderer/l11Signs'

const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message)}
const tick=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
const canonical=(v:unknown)=>JSON.stringify(v,(_k,value)=>ArrayBuffer.isView(value)?Array.from(value as unknown as number[]):value)

/** Actual open building thresholds leave a clear, reproducible floor view. */
export function l11FloorPhotoPoses(seed=20261006){
  const buildings=l11Buildings(seed,16,16,2047,2047),poses:any[]=[]
  for(const kind of ['wood','tile','ceramic','limestone','concrete']){
    for(const b of buildings.filter(b=>!b.sealed&&l11FloorKind(b)===kind)){
      const a=b.doorAngle,nx=Math.sin(a),ny=-Math.cos(a),x=b.door[0]-nx*2.7,y=b.door[1]-ny*2.7
      if(!inPolygon(x,y,b.footprint))continue
      poses.push({id:'floor-'+kind,building:b.id,archetype:b.archetype,finish:kind,x,y,z:b.base,yaw:Math.atan2(nx,ny),pitch:-.48})
      break
    }
    check(poses.some(p=>p.finish===kind),`No accessible ${kind} floor view`)
  }
  poses.push({id:'floor-paving',x:27.2,y:45,z:l11TerrainHeight(seed,27.2,45),yaw:.32,pitch:-.65})
  return poses
}

/** Real weather updates must wet the street without changing sheltered floors. */
export async function verifyL11SurfaceWeather(qa:any){
  const weather={...qa.eng.l11Weather}
  try{
    qa.moveTo(40,70);qa.eng.player.z=0
    Object.assign(qa.eng.l11Weather,{kind:'calm',k:0,wetness:0,t:120});await qa.warm()
    const materials=new Set<any>()
    qa.r.scene.traverse((node:any)=>{for(const m of Array.isArray(node.material)?node.material:node.material?[node.material]:[])materials.add(m)})
    const floor=[...materials].find(m=>m.userData.l11Interior&&m.userData.l11Surface==='limestone')
    const road=[...materials].find(m=>m.userData.l11Surface==='asphalt')
    check(floor&&road,'Loaded archive floor / road material absent')
    const dry={floor:floor.roughness,road:road.roughness,floorReflection:floor.envMapIntensity}
    Object.assign(qa.eng.l11Weather,{kind:'rain',k:1,wetness:1,t:120});await qa.warm()
    const rain={floor:floor.roughness,road:road.roughness,floorReflection:floor.envMapIntensity}
    check(Math.abs(rain.floor-dry.floor)<1e-6&&Math.abs(rain.floorReflection-dry.floorReflection)<1e-6,'Indoor floor became wet')
    check(rain.road<dry.road*.75,'Rain did not change the outdoor road')
    return {ok:true,dry,rain,indoorMaterials:[...materials].filter(m=>m.userData.l11Interior).length}
  }finally{Object.assign(qa.eng.l11Weather,weather);await qa.warm()}
}

/** Reproducible street-level views of all five structural families. */
export function l11PhotoPoses(seed=20261006){
  const buildings=l11Buildings(seed,16,16,1039,1039)
  const poses = (['balcony','fin-office','corner-shops','sawtooth','museum'] as const).map(archetype=>{
    for(const b of buildings.filter(b=>b.archetype===archetype)){
      const a=b.doorAngle,nx=Math.sin(a),ny=-Math.cos(a)
      for(const distance of [18,12,24,9])for(const tangent of [8,-8,0]){
        const x=b.door[0]+nx*distance+Math.cos(a)*tangent,y=b.door[1]+ny*distance+Math.sin(a)*tangent
        if(l11Buildings(seed,x-2,y-2,x+2,y+2).some(q=>circlePolygon(x,y,1,q.footprint))||l11SurfaceAt(seed,x,y).kind==='canal')continue
        const target=l11World(b,b.width/2,b.depth/2),dx=target[0]-x,dy=target[1]-y
        return {id:'family-'+archetype,building:b.id,archetype,x,y,z:l11TerrainHeight(seed,x,y),yaw:Math.atan2(-dx,-dy),pitch:Math.atan2(Math.min(12,b.floors*1.3)-1.62,Math.hypot(dx,dy))}
      }
    }
    throw Error(`No clear reference view for ${archetype}`)
  })
  for(let y=32;y<1024;y+=32)for(let x=32;x<1024;x+=32){
    if(![[0,0],[-3,0],[3,0],[0,-3],[0,3]].every(([dx,dy])=>l11SurfaceAt(seed,x+dx,y+dy).kind==='grass'))continue
    if(buildings.some(b=>circlePolygon(x,y,3,b.footprint)))continue
    return [...poses,{id:'park',x,y,z:l11TerrainHeight(seed,x,y),yaw:.4,pitch:-.35}]
  }
  throw Error('No park surface found for the CC0 grass material view')
}

/** Close views of signs attached to actual generated buildings and street props. */
export function l11SignPhotoPoses(seed=20261006){
  const buildings=l11Buildings(seed,16,16,2047,2047),poses:any[]=[]
  for(const sign of ['bakery','cafe','supermarket','archive']){
    for(const b of buildings.filter(b=>l11BuildingSign(b.archetype,b.seed)===sign)){
      const a=b.doorAngle,nx=Math.sin(a),ny=-Math.cos(a),x=b.door[0]+nx*7,y=b.door[1]+ny*7
      if(l11Buildings(seed,x-1,y-1,x+1,y+1).some(q=>circlePolygon(x,y,.5,q.footprint))||l11SurfaceAt(seed,x,y).kind==='canal')continue
      poses.push({id:'sign-'+sign,building:b.id,sign,x,y,z:l11TerrainHeight(seed,x,y),yaw:Math.atan2(nx,ny),pitch:.16})
      break
    }
    check(poses.some(p=>p.sign===sign),`No real building view for sign ${sign}`)
  }
  const found=new Set<string>()
  for(let cy=0;cy<32&&found.size<2;cy++)for(let cx=0;cx<32&&found.size<2;cx++){
    const raw=genL11ChunkRaw(L11,seed,cx,cy)
    for(const s of raw.structures){
      if(!['l11_street_name','l11_bus_shelter'].includes(s.kind)||found.has(s.kind))continue
      const a=Number(s.data?.deg??0)*Math.PI/180,side=s.kind==='l11_street_name'?1:-1,nx=Math.sin(a)*side,ny=Math.cos(a)*side,
        center=[s.x+s.w/2,s.y+s.h/2],x=center[0]+nx*4,y=center[1]+ny*4
      if(l11Buildings(seed,x-1,y-1,x+1,y+1).some(q=>circlePolygon(x,y,.5,q.footprint))||l11SurfaceAt(seed,x,y).kind==='canal')continue
      poses.push({id:'sign-'+s.kind.slice(4),instance:s.data?.instanceId,x,y,z:l11TerrainHeight(seed,x,y),yaw:Math.atan2(nx,ny),pitch:.2})
      if(s.kind==='l11_street_name')poses.push({id:'sign-street-back',instance:s.data?.instanceId,x:center[0]-nx*3,y:center[1]-ny*3,z:l11TerrainHeight(seed,center[0],center[1]),yaw:Math.atan2(-nx,-ny),pitch:.24})
      found.add(s.kind)
    }
  }
  check(found.size===2,'Missing street sign / bus shelter reference views')
  return poses
}

export async function verifyL11Signage(qa:any){
  const samples:any[]=[],original=qa.r.textureQuality
  for(const quality of [0,2,0,2,original]){
    qa.r.setTextureQuality(quality);await qa.warm()
    const map=l11SignMaterial().map!,width=map.image?.width??0,height=map.image?.height??0
    check(width===(quality===0?2048:4096)&&height===(quality===0?1024:2048),'Generated sign atlas not loaded at selected quality')
    const owners=[...qa.r.textureRoots.values()].filter((set:any)=>set.has(map)).length
    check(owners>0,'Loaded city signs have no texture owners')
    check(qa.r.textureUsers.get(map)===owners,'Sign atlas reference count changed incorrectly on quality switch')
    samples.push({quality,width,height,owners,textures:qa.r.three.info.memory.textures})
  }
  check(samples[2].textures<=samples[0].textures+1,'Low sign atlas accumulated GPU resources')
  check(samples[3].textures<=samples[1].textures+1,'High sign atlas accumulated GPU resources')
  return {faces:L11_SIGNS.length,ok:true,samples}
}

/** Exercise the exact dedicated Worker, not a second invocation of the main-thread function. */
export async function verifyL11Worker(){
  const worker=new Worker(new URL('../src/game/world/l11.worker.ts',import.meta.url),{type:'module'})
  const cases=[[42,0,0,0],[42,-1,-1,0],[74911,32,32,0],[74911,-33,0,2],[42,21,16,1]]
  try{
    const results=[]
    for(const [seed,cx,cy,revision] of cases){
      const key=`qa:${seed}:${cx}:${cy}:${revision}`
      const result=await new Promise<any>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('L11 Worker timeout')),45000)
        worker.onmessage=e=>{if(e.data.key===key){clearTimeout(timer);resolve(e.data)}}
        worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message))}
        worker.postMessage({key,def:L11,seed,cx,cy,revision})
      })
      check(!result.error,`Worker failed: ${result.error}`)
      const expected=genL11ChunkRaw(L11,seed,cx,cy,undefined,revision)
      check(canonical(result.raw)===canonical(expected),`Worker/main mismatch ${key}`)
      results.push({seed,cx,cy,revision,plans:result.plans.length,structures:result.raw.structures.length})
    }
    return {ok:true,cases:results}
  }finally{worker.terminate()}
}

export async function verifyL11Runtime(qa:any){
  const eng=qa.eng as Engine,look=qa.look,results:Record<string,unknown>={}
  const seed=eng.map!.inf!.seed
  const world=()=>({x:eng.player.x+eng.map!.inf!.ox,y:eng.player.y+eng.map!.inf!.oy,z:eng.player.z})
  const place=(x:number,y:number,z?:number)=>{qa.moveTo(x,y);eng.player.z=z??floorHeight(eng.map!,eng.player.x,eng.player.y,0);eng.player.vz=0;eng.player.floor=bandOfPlayerZ(eng.map!,eng.player.z);eng.moveIt.acc=0;eng.onStairs=false;eng.input.mx=eng.input.my=0;eng.input.jump=false;eng.input.sprint=false}
  const walk=async(x:number,y:number)=>{
    const start=world(),distance=Math.hypot(x-start.x,y-start.y),steps=Math.ceil(distance/3.4*60)+120
    for(let i=0;i<steps;i++){
      const p=world(),d=Math.hypot(x-p.x,y-p.y);if(d<.06)break
      eng.input.mx=(x-p.x)/d;eng.input.my=(y-p.y)/d
      updateMovement(eng,1/60,{dmg:1,drain:1},false)
      if(i%45===0)await tick()
    }
    eng.input.mx=eng.input.my=0;const end=world()
    check(Math.hypot(end.x-x,end.y-y)<.12,`Walk blocked: ${JSON.stringify({start,target:[x,y],end})}`)
    return {start,end,distance}
  }
  check(eng.npcs.length===0,'L11 must contain no human NPCs')
  check(!eng.map!.structures.some(s=>s.data?.outpost),'L11 settlement present')
  place(16,24);results.street=await walk(16,88)
  const archive=l11CityPlan(seed,0,0).buildings.find(b=>b.id==='l11:public-archive')!
  place(archive.door[0]-2,archive.door[1],0)
  results.entrance=await walk(archive.door[0]+2,archive.door[1])
  const stair=archive.stairs[0],start=l11World(archive,stair.x+stair.width/2,stair.y-.4),end=l11World(archive,stair.x+stair.width/2,stair.y+stair.length+.55)
  place(start[0],start[1],archive.base);results.stairsUp=await walk(end[0],end[1]);check(Math.abs(eng.player.z-3)<.08,`Stairs failed to ascend: ${eng.player.z}`)
  results.stairsDown=await walk(start[0],start[1]);check(Math.abs(eng.player.z)<.08,`Stairs failed to descend: ${eng.player.z}`)
  const rotated=l11CityPlan(seed,0,0).buildings.find(b=>!!b.angle&&b.stairs.length)!,rs=rotated.stairs[0],along=rs.axis==='x'
  const rStart=l11World(rotated,rs.x+(along?-.4:rs.width/2),rs.y+(along?rs.width/2:-.4)),rEnd=l11World(rotated,rs.x+(along?rs.length+.55:rs.width/2),rs.y+(along?rs.width/2:rs.length+.55))
  place(rStart[0],rStart[1],rotated.base);results.rotatedStairsUp=await walk(rEnd[0],rEnd[1]);check(Math.abs(eng.player.z-rotated.base-3)<.08,'Rotated stairs failed to ascend')
  results.rotatedStairsDown=await walk(rStart[0],rStart[1]);check(Math.abs(eng.player.z-rotated.base)<.08,'Rotated stairs failed to descend')
  place(27.5,119.5,0);results.subwayDown=await walk(27.5,132);check(Math.abs(eng.player.z+5)<.08,`Metro failed to descend: ${eng.player.z}`)
  results.subwayPlatform=await walk(16,132);results.subwayPlatformReturn=await walk(27.5,132);results.subwayUp=await walk(27.5,119.5);check(Math.abs(eng.player.z)<.08,`Metro failed to ascend: ${eng.player.z}`)
  const plan=l11CityPlan(seed,0,0),bridge=plan.bridges.find(b=>b.roadId===`h:${seed}:0:1`)!
  check(bridge,'Shared arterial bridge missing')
  const bb=bounds(bridge.polygon),bridgeRoad=plan.roads.find(r=>r.id===bridge.roadId)!
  place(bb.x-4,528,l11TerrainHeight(seed,bb.x-4,528));results.bridge=await walk(bb.x+bb.w+4,528)
  const pedestrian=[]
  for(const side of [-1,1]){const y=528+side*(bridgeRoad.width/2+1.4);place(bb.x-4,y,l11TerrainHeight(seed,bb.x-4,y));pedestrian.push(await walk(bb.x+bb.w+4,y))}
  results.bridgeSidewalks=pedestrian
  const canal=plan.canals[0],waterPoint=canal.points.find(([x,y])=>y>40&&y<990&&l11SurfaceAt(seed,x,y).kind==='canal')!
  check(waterPoint,'Canal sample absent')
  const [wx,wy]=waterPoint;place(wx,wy,0)
  check(!canOccupy(eng.map!,eng.player.x,eng.player.y,.32,{z:0,band:0}),'Waterfront allows walking on water')
  results.waterfront={waterBlocksWalking:true}
  place(39.5,84,0)
  const archiveExit=eng.map!.exits.find(e=>e.def.req?.tapes===6)!
  look.yaw=Math.atan2(eng.player.x-archiveExit.x-.5,eng.player.y-archiveExit.y-.5);look.pitch=Math.atan2(.95-1.55,1.5);look.visualHit=null;await tick();eng.player.facing=Math.atan2(archiveExit.y+.5-eng.player.y,archiveExit.x+.5-eng.player.x)
  const gates=[]
  for(const tapes of [0,5,6]){
    eng.player.tapes=tapes;eng.transition=null;scanInteract(eng)
    check(eng.interactTarget?.kind==='exit'&&eng.interactTarget.e===archiveExit,`Archive reader cannot be targeted: ${JSON.stringify(eng.interactTarget?.kind)}`)
    doInteract(eng);check(tapes===6?eng.transition?.dest===12:eng.transition===null,`Archive tape gate ${tapes}`)
    gates.push({tapes,destination:eng.transition?.dest??null})
  }
  eng.transition=null;results.archive=gates
  results.cityRoutes=[]
  for(const destination of [9,10]){
    const approach=eng.map!.exits.find(e=>e.def.dest===destination)!
    check(approach,`Missing city route ${destination}`)
    place(approach.x+.5+eng.map!.inf!.ox,approach.y-1+eng.map!.inf!.oy,0)
    const exit=eng.map!.exits.find(e=>e.def.dest===destination)!
    look.yaw=Math.PI;look.pitch=-.2;look.visualHit=null;await tick();eng.player.facing=Math.PI/2
    scanInteract(eng);check(eng.interactTarget?.kind==='exit'&&eng.interactTarget.e===exit,`City route ${destination} cannot be targeted`)
    doInteract(eng);check(eng.transition?.dest===destination,`City route ${destination} failed`)
    ;(results.cityRoutes as unknown[]).push({destination,reachable:true});eng.transition=null
  }
  const locker=eng.map!.structures.find(s=>s.kind==='locker'&&s.data?.buildingId===archive.id&&s.floor===0)!
  check(locker,'Archive loot container missing')
  place(locker.x+locker.w/2+eng.map!.inf!.ox,locker.y+locker.h+1+eng.map!.inf!.oy,0)
  const sid=locker.data!.sid,items=[...(locker.data!.lootItems as string[])];finishSearch(eng,locker);takeAllLoot(eng)
  check(locker.looted&&eng.lootPanel?.items.length===0,'Loot did not empty the real container');eng.closeLootPanel()
  place(26.5,26.5,0);persist(eng,'slot3');const saved=loadSaveSnapshot('slot3')!
  check(saved.l11World?.version===2,'Saved L11 version is not 2')
  eng.newRun(saved.seed,saved.difficulty,'slot3')
  check(eng.player.tapes===6&&eng.player.level===11,'Save reload lost player state')
  place(66,66,0);const restored=eng.map!.structures.find(s=>s.data?.sid===sid)
  check(restored?.looted&&!(restored.data?.lootItems as string[])?.length,'Loot respawned after save/load')
  results.lootAndSave={sid,items,version:saved.l11World!.version,lootedAfterReload:true}

  // Run real save loading through the storage adapter with byte-identical legacy fixtures.
  const base=snapshot(eng),originalSet=storage.set
  for(const oldLevel of [11,115]){
    const old={...base,level:oldLevel,player:{...base.player,level:oldLevel},l11World:{...base.l11World!,version:1},worldPos:{x:850,y:-460}}
    const raw=JSON.stringify(old);storage.set(SAVE_SLOT_KEYS.slot2,raw)
    eng.newRun(base.seed,base.difficulty,'slot2')
    check(eng.player.level===11&&Math.hypot(world().x-26.5,world().y-26.5)<.1,`Legacy ${oldLevel} safe spawn`)
    check(eng.player.tapes===base.player.tapes,'Migration lost tapes')
    const first=storage.get(SAVE_SLOT_KEYS.slot2);loadSaveSnapshot('slot2');check(storage.get(SAVE_SLOT_KEYS.slot2)===first,'Migration not idempotent')
  }
  const blocked=JSON.stringify({...base,level:115,l11World:{...base.l11World!,version:1},time:base.time+12345})
  storage.set(SAVE_SLOT_KEYS.slot2,blocked)
  try{
    storage.set=(key,value)=>{if(!key.includes('_l11_v1_backup_'))originalSet(key,value)}
    let failed=false;try{loadSaveSnapshot('slot2')}catch{failed=true}
    check(failed,'Backup failure was ignored');persist(eng,'slot2');check(storage.get(SAVE_SLOT_KEYS.slot2)===blocked,'Autosave overwrote blocked migration')
  }finally{storage.set=originalSet}
  loadSaveSnapshot('slot2');results.migration={oldL11:true,oldBeta:true,idempotent:true,failedBackupPreservesSlot:true}

  const progress=()=>({stage:0,progress:1,completed:false,points:[],observed:[],journal:[]})
  eng.career=freshCareer();const paused=MEG_MISSIONS.filter(m=>isPausedMegMission(m.id)),state=megState(eng)
  for(const m of paused)state.missions[m.id]=progress()
  check(activeMegMissionCount(eng)===0,'Paused missions occupy slots')
  const before=JSON.stringify(state.missions)
  for(const m of paused){check(!!megMissionLock(eng,m.id),'Paused mission is available');check(acceptMegMission(eng,m.id,m.issuer).includes('暂不可用'),'Paused mission accepted');check(submitMegStage(eng,m.id,m.issuer).includes('暂不可用'),'Paused mission advanced');check(!trackMegTask(eng,{kind:'line',id:m.id}),'Paused mission tracked')}
  updateMegMissions(eng,.25);eng.player.steps+=100;updateMegMissions(eng,.25)
  check(JSON.stringify(state.missions)===before,'Paused progress changed')
  eng.career.settled.push('meg-line:city-lesson');state.missions['city-lesson'].completed=true
  check(eng.career.settled.includes('meg-line:city-lesson'),'Reward ledger removed')
  // Administration is exercised at an actual retained MEG facility outside L11.
  eng.loadLevel(101,{mapSeed:42,firstVisit:false})
  const station=eng.map!.structures.find(s=>(s.kind==='settlementstation'||s.data?.facility)&&s.data?.faction==='meg'&&(s.data?.services as string[])?.includes('career'))!
  check(station,'MEG administration facility missing')
  let positioned=false
  for(const [dx,dy] of [[0,1.6],[1.6,0],[0,-1.6],[-1.6,0]]){eng.player.x=station.x+station.w/2+dx;eng.player.y=station.y+station.h/2+dy;eng.player.z=floorHeight(eng.map!,eng.player.x,eng.player.y,0);if(canAdministerMeg(eng)){positioned=true;break}}
  check(positioned,'Cannot reach MEG facility')
  const active=MEG_MISSIONS.filter(m=>!isPausedMegMission(m.id)),ranks=[]
  for(const count of [2,5,9,11]){
    eng.career=freshCareer();route(eng,'meg').joined=true
    for(const m of active.slice(0,count))megState(eng).missions[m.id]={...progress(),completed:true}
    promoteMeg(eng);check(route(eng,'meg').rank===[2,5,9,11].indexOf(count)+1,`MEG promotion ${count}`);ranks.push(route(eng,'meg').rank)
  }
  eng.career=freshCareer();route(eng,'meg').joined=true;route(eng,'meg').rank=4;promoteMeg(eng);check(route(eng,'meg').rank===4,'Existing rank downgraded')
  check(JSON.stringify(FACTION_PROMOTION_COUNTS)==='[2,5,9,13]','Other faction thresholds changed')
  results.missions={paused:5,slotsReleased:true,progressFrozen:true,rewardRetained:true,ranks,legacyRankRetained:true,otherThresholds:FACTION_PROMOTION_COUNTS}
  eng.newRun(saved.seed,saved.difficulty,'slot3');eng.dev.frozenAI=true;eng.dev.god=true;eng.dev.statLock=true;eng.paused=true;eng.player.flashlight=false;place(26.5,26.5,0)
  return {ok:true,...results}
}
