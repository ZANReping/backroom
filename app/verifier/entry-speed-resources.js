import { tradersBakeStats } from '/src/game/renderer/tradersBakeQueue.ts'
import { afterRendererCompile } from '/src/game/renderer/sceneWarmup.ts'
export async function verify(qa){
 const {engine:e,renderer:r,look}=qa,checks=[],cycles=[]
 const ok=(v,label)=>{checks.push({ok:!!v,label});if(!v)throw Error(label)}
 const frame=()=>new Promise(requestAnimationFrame),draw=()=>{r.applyView(e);r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)}
 const state=()=>({memory:{...r.three.info.memory},programs:r.three.info.programs.length,bakes:tradersBakeStats(),retired:r.retiredWorld.length,textures:r.retiredTextures.size,level:e.player.level,ready:r.isNearWorldReady(e)})
 const load=id=>{e.loadLevel(id,{mapSeed:424242,firstVisit:false});e.dev.god=true;e.dev.statLock=true;e.dev.frozenAI=true;e.paused=true;e.introT=0;look.yaw=0;look.pitch=0}
 const until=async(fn,label,ms=45000)=>{const t=performance.now();while(!fn()){await frame();draw();if(performance.now()-t>ms)throw Error('Timeout '+label)}}
 load(102);await until(()=>tradersBakeStats().active>0,'active real bake worker')
 ok(tradersBakeStats().workers<=2,'real static-light workers bounded to two')
 const activeBeforeCancel=state();load(104);await until(()=>r.isNearWorldReady(e),'cancel merchant to Tom')
 ok(tradersBakeStats().workers===0&&tradersBakeStats().queued===0,'leaving during baking terminates owned workers and requests')
 ok(![...r.chunkGroups.keys()].some(k=>k.startsWith('@architecture:')),'cancelled merchant roots cannot publish into the next level')
 let compiling=false,entered=false;const orig=r.compileFoyerVariants
 r.compileFoyerVariants=function*(...a){compiling=true;entered=true;try{yield*orig.apply(this,a)}finally{compiling=false}}
 load(900);await until(()=>compiling,'real foyer variant compilation')
 ok(entered&&!!r.finiteTask,'cancellation happens during an unfinished finite scene')
 load(104);await until(()=>r.isNearWorldReady(e),'cancel foyer to Tom');await new Promise(resolve=>afterRendererCompile(r.three,resolve))
 for(let i=0;i<12;i++){await frame();draw()}
 ok(!compiling&&r.levelCfg.id===104&&r.levelGroup?.parent===r.scene,'cancelled alternate-light compilation restores real map ownership')
 ok(!r.foyer&&!r.foyerStreet,'cancelled foyer does not retain scene controllers')
 r.compileFoyerVariants=orig
 for(let i=0;i<4;i++){
  load(102);await until(()=>r.isNearWorldReady(e),'merchant cycle '+i)
  ok(tradersBakeStats().workers<=2,'cycle '+i+' respects worker limit')
  load(104);await until(()=>r.isNearWorldReady(e),'Tom cycle '+i)
  await new Promise(resolve=>afterRendererCompile(r.three,resolve))
  for(let n=0;n<45;n++){await frame();draw()}
  ok(tradersBakeStats().workers===0&&tradersBakeStats().queued===0,'cycle '+i+' releases all workers')
  cycles.push(state())
 }
 const a=cycles.at(-2).memory,b=cycles.at(-1).memory
 ok(b.geometries<=a.geometries+2&&b.textures<=a.textures+2,'last repeated cycles have stable GPU resource counts')
 return{checks,passed:checks.length,activeBeforeCancel,cycles,final:state()}
}
