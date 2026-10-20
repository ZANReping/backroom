import {makeEntity} from '../src/game/entities'
import {initShrimp} from '../src/game/engine/shrimpAI'
import {l1BakeStats} from '../src/game/renderer/l1BakeQueue'
import {canOccupy} from '../src/game/core/player'
const tick=()=>new Promise<number>(r=>requestAnimationFrame(r))
const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
const percentile=(a:number[],q:number)=>a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))]
export async function mount(app:any,before=false){
 const e=app.engine,r=app.renderer(),checks:string[]=[],held:any[]=[],frames:number[]=[],cpu:number[]=[],updates:number[]=[],refinements:any[]=[];let catchEntity:any
 const set=r.setHeldItem,render=r.render,update=e.update;let last=0,lastStage=''
 r.setHeldItem=function(type:string){const start=performance.now();try{return set.call(this,type)}finally{held.push({type,ms:performance.now()-start,at:performance.now()})}}
 e.update=function(...args:any[]){const start=performance.now();try{return update.apply(this,args)}finally{updates.push(performance.now()-start)}}
 r.render=function(...args:any[]){const now=performance.now();if(last)frames.push(now-last);last=now;const start=performance.now();try{return render.apply(this,args)}finally{cpu.push(performance.now()-start)}}
 const ok=(v:unknown,name:string)=>{if(!v)throw Error(name);checks.push(name)}
 const status=()=>({near:r.isNearWorldReady(e),chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size,bakes:l1BakeStats(),memory:{...r.three.info.memory},shrimpReady:!r.shrimpHeldWarmup&&!!r.heldCache.get(`${r.lightMode}:liveshrimp`),held:r.vmHeld})
 e.dev.god=true;e.dev.frozenAI=true;e.dev.statLock=true;e.dev.phenOff.add('flicker');e.introT=0;e.endBlackout();e.input.mx=e.input.my=0
 document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click()
 const inspect=()=>{
  let final=0,initial=0
  for(const {group}of r.chunkGroups.values()){
   let texture:any
   group.traverse((o:any)=>{if(o.material?.lightMap)texture=o.material.lightMap})
   if(!texture)continue
   // Final textures use the same packed chart/buffer sizes and material count.
   if(!group.userData.l1BakeProvisional)final++
   initial++
  }
  const s=status(),stage=[s.chunks,s.bakes.completed,s.bakes.previews,s.bakes.computations].join(':')
  if(stage!==lastStage){refinements.push({at:performance.now(),...s});lastStage=stage}
  return{...s,geometryChunks:initial,final}
 }
 const waitWorld=async()=>{const start=performance.now();while(performance.now()-start<180000){const s=inspect();if(s.chunks===e.map.inf.chunks.size&&!s.tasks&&(before||s.bakes.initialQueued===0))return s;await sleep(100)}throw Error('Initial world did not finish streaming')}
 const waitRefined=async()=>{const start=performance.now();while(performance.now()-start<300000){const s=inspect();if(!s.bakes.active&&!s.bakes.queued&&!s.tasks){await sleep(800);return inspect()}await sleep(250)}throw Error('Final bake did not complete')}
 const prepareCatch=async()=>{
  e.map.entities=[];e.map.items=[];e.player.hotbar.fill(null);e.player.backpack.fill(null);e.player.selected=0;e.handsStowed=false;e.usingItem=null
  e.player.crouching=true;e.player.flashlight=false;e.player.equip.offhand=null
  let position:any
  for(let d=0;d<8&&!position;d++)for(let a=0;a<8;a++){
   const x=e.player.x+Math.cos(a*Math.PI/4)*d,y=e.player.y+Math.sin(a*Math.PI/4)*d
   if(canOccupy(e.map,x,y,.32,{z:0,band:0})&&canOccupy(e.map,x+.7,y,.32,{z:0,band:0})){position={x,y};break}
  }
  ok(position,'catch camera has physical clearance');Object.assign(e.player,position,{z:0,vz:0,floor:0})
  const shrimp=makeEntity('dryshrimp',e.player.x+.65,e.player.y,0);catchEntity=shrimp;shrimp.id=919191;initShrimp(shrimp);shrimp.sh!.splitIn=900;shrimp.state='idle';e.map.entities.push(shrimp)
  app.look.yaw=-Math.PI/2;app.look.pitch=-.9;app.look.roll=0
  const start=performance.now()
  while(performance.now()-start<15000){await tick();if(!shrimp.presentationPending&&r.entityMeshes.get(shrimp.id)?.visible)break}
  ok(r.entityMeshes.get(shrimp.id)?.visible,'live entity is prepared before E interaction')
  // The production scan uses the current camera ray, refreshed by actual App frames.
  let scanned=false
  for(let pitch=-1.5;pitch<-.1;pitch+=.04){app.look.pitch=pitch;await tick();e.scanInteract();if(e.interactTarget?.kind==='shrimp'){scanned=true;break}}
  ok(scanned,'production interaction ray selects live shrimp')
  await sleep(250);frames.length=cpu.length=updates.length=held.length=0;last=0
  return{target:e.interactTarget.kind,position,prepared:status().shrimpReady}
 }
 const captureCatch=async()=>{
  const start=performance.now();while(performance.now()-start<8000){if(r.vmHeld==='liveshrimp')break;await tick()}
  ok(r.vmHeld==='liveshrimp','E catch puts live shrimp in actual viewmodel')
  ok(catchEntity.dead&&catchEntity.sh.caught&&e.player.hotbar.reduce((n:number,s:any)=>n+(s?.type==='liveshrimp'?s.count:0),0)===1,'E catches the same entity exactly once')
  const first=held.find(h=>h.type==='liveshrimp');ok(first,'first holding measured')
  const firstFrame={count:frames.length,median:percentile(frames,.5),p95:percentile(frames,.95),max:Math.max(...frames),renderMax:Math.max(...cpu),updateMax:Math.max(...updates)}
  app.look.pitch=-.15;await sleep(500)
  const item=r.vmItem,hand=r.vmParts.right.skin.geometry
  const swaps=[]
  for(let i=0;i<5;i++){e.player.selected=1;await sleep(250);e.player.selected=0;await sleep(300);swaps.push(held.filter(h=>h.type==='liveshrimp').at(-1)?.ms)}
  ok(r.vmItem===item&&r.vmParts.right.skin.geometry===hand,'repeated hotbar selection reuses exact shrimp and contact buffers')
  return{first,firstFrame,swaps,status:status(),geometry:item.children.length}
 }
 const summary=()=>({before,checks,held,refinements,status:inspect()})
 const leave=async()=>{const prior=l1BakeStats();e.loadLevel(2,{mapSeed:20261020,firstVisit:false});await tick();await tick();const next=l1BakeStats();ok(e.player.level===2&&next.active===0&&next.queued===0&&next.workers===0,'leaving L1 immediately stops background bake workers');return{prior:{active:prior.active,queued:prior.queued},after:{active:next.active,queued:next.queued,workers:next.workers}}}
 return{status,inspect,waitWorld,waitRefined,prepareCatch,captureCatch,summary,leave}
}
