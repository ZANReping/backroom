import {canOccupy,PLAYER_RADIUS} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
import {look} from '../src/game/renderer/shared'
import {OUTPOSTS} from '../src/game/content/outposts'
import {infiniteImplFor} from '../src/game/world/infinite'

export async function mount(api:any){
 const e=api.engine,r=api.renderer(),checks:string[]=[],rows:any[]=[],sleep=(n=100)=>new Promise(resolve=>setTimeout(resolve,n))
 const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label)}
 const until=async(fn:()=>unknown,label:string)=>{const t=performance.now();while(!fn()){if(performance.now()-t>120000)throw Error('Timeout '+label);await sleep()}}
 const coords=()=>({level:e.player.level,mapSeed:e.mapSeed,x:e.player.x+(e.map.inf?.ox??0),y:e.player.y+(e.map.inf?.oy??0),z:e.player.z,floor:e.player.floor,yaw:look.yaw,pitch:look.pitch})
 const summary=()=>({level:e.player.level,position:coords(),checks:[...checks],rows:[...rows]})
 const ready=async()=>{await until(()=>r.isNearWorldReady(e)&&!document.querySelector('.loading-screen'),'actual geometry');await sleep(250)}
 const aim=(x:number,y:number,z:number)=>{look.yaw=Math.atan2(e.player.x-x,e.player.y-y);look.pitch=Math.atan2(z-e.player.z-1.55,Math.hypot(x-e.player.x,y-e.player.y));look.visualHit=null;look.roll=0}
 const control=()=>{e.devEnabled=true;e.dev.god=true;e.dev.statLock=true;e.dev.frozenAI=true;e.dev.fly=false;e.dev.noclip=false;e.introT=0;e.handsStowed=true;e.input.mx=e.input.my=0;e.input.interact=false;e.paused=false}
 let source:any,id='',markerWorld:any
 const approach=async(target:any,kind:string)=>{
  const m=e.map,band=target.floor??0,tx=target.x+(kind==='exit'?.5:target.w/2),ty=target.y+(kind==='exit'?.5:target.h/2)
  for(const distance of [1.1,1.35,.9,1.5,.7])for(let k=0;k<24;k++){
   const angle=k*Math.PI/12,x=tx+Math.sin(angle)*distance,y=ty+Math.cos(angle)*distance,z=floorHeight(m,x,y,band)
   if(!canOccupy(m,x,y,PLAYER_RADIUS,{z,band}))continue
   Object.assign(e.player,{x,y,z,floor:band,vz:0,crouching:false});aim(tx,ty,z+(kind==='exit'?1.05:1.3));e.scanInteract()
   if(e.interactTarget?.kind===kind&&(kind==='exit'?e.interactTarget.e===target:e.interactTarget.s===target)){
    await sleep(100);e.scanInteract();if(e.interactTarget?.kind===kind)return
   }
  }
  throw Error('No usable real '+kind+' approach '+id)
 }
 const setup=async(outpost:string,seed:number)=>{
  id=outpost;control();e.transition=null;e.loadLevel(OUTPOSTS[id].parent,{mapSeed:seed,firstVisit:false});control()
  const inf=e.map.inf;ok(inf,'source is streaming map')
  let found=e.map.structures.find((s:any)=>s.data?.outpost===id)
  markerWorld=found?{x:found.x+inf.ox,y:found.y+inf.oy}:undefined
  if(!markerWorld){
   const impl=infiniteImplFor(e.player.level)
   outer:for(let ring=1;ring<=10;ring++)for(let dy=-ring;dy<=ring;dy++)for(let dx=-ring;dx<=ring;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==ring)continue
    const raw=impl.genRaw(e.levelDef,seed,dx,dy),s=raw.structures.find((s:any)=>s.data?.outpost===id)
    if(s){markerWorld={x:s.x,y:s.y};break outer}
   }
  }
  ok(markerWorld,id+' real generated entrance exists')
  Object.assign(e.player,{x:markerWorld.x+.5-inf.ox,y:markerWorld.y+2-inf.oy,z:0,floor:0,vz:0});e.updateInfiniteWindow()
  await ready()
  found=e.map.structures.find((s:any)=>s.data?.outpost===id&&Math.hypot(s.x+e.map.inf.ox-markerWorld.x,s.y+e.map.inf.oy-markerWorld.y)<.01)
  ok(found,id+' exact entrance window loaded');await approach(found,'landmark');await ready();e.scanInteract()
  ok(e.interactTarget?.s===found&&e.interactTarget?.kind==='landmark',id+' real E aims at landmark')
  source=coords();rows.push({phase:'before',outpost:id,source,markerWorld});return summary()
 }
 const inside=async()=>{
  ok(e.player.level===OUTPOSTS[id].levelId,id+' landmark button enters base');await ready();control()
  const a=e.career.returnAnchor;ok(a?.mapSeed===source.mapSeed,id+' full source seed retained');ok(a?.x===source.x&&a?.y===source.y,id+' absolute approach retained')
  e.time+=173.75
  if(id==='omega'){
   e.persist()
   e.newRun(e.seed,'normal',e.saveSlot,false);control();await ready()
   ok(e.player.level===OUTPOSTS[id].levelId,'actual save resumes inside base');ok(e.career.returnAnchor?.mapSeed===source.mapSeed,'actual save retains origin seed')
  }
  rows.push({phase:'inside',outpost:id,position:coords(),anchor:e.career.returnAnchor});return summary()
 }
 const exitSetup=async()=>{
  control();const ex=e.map.exits.find((x:any)=>x.def.dest==='back');ok(ex,id+' real back door exists');await approach(ex,'exit');await ready();e.scanInteract();ok(e.interactTarget?.e===ex,id+' real E targets back door');return summary()
 }
 const returned=async()=>{
  await ready();const a=coords();ok(a.level===source.level,id+' returns to parent');ok(a.mapSeed===source.mapSeed,id+' returns to original map')
  ok(Math.hypot(a.x-source.x,a.y-source.y)<.05,id+' returns to original entrance approach');ok(Math.abs(a.z-source.z)<.04,id+' returns at correct height')
  ok(Math.abs(a.yaw-source.yaw)<.001,id+' restores approach direction');ok(canOccupy(e.map,e.player.x,e.player.y,PLAYER_RADIUS,{z:e.player.z,band:e.player.floor}),id+' return body clear')
  ok(e.map.structures.some((s:any)=>s.data?.outpost===id&&Math.hypot(s.x+e.map.inf.ox-markerWorld.x,s.y+e.map.inf.oy-markerWorld.y)<.01),id+' same actual entrance still exists')
  ok(!e.career.returning&&e.outpostReturn===null,id+' return token consumed');rows.push({phase:'after',outpost:id,source,returned:a,markerWorld})
  return summary()
 }
 return {summary,setupOmega:()=>setup('omega',888123.625),insideOmega:inside,exitOmega:exitSetup,returnedOmega:returned,
  setupAlpha:()=>setup('alpha',424242),insideAlpha:inside,exitAlpha:exitSetup,returnedAlpha:returned,
  cleanup:()=>{e.input.mx=e.input.my=0;e.input.interact=false;return summary()}}
}
