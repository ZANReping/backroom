import {makeEntity} from '../src/game/entities'
import {canOccupy} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
import {updateEntities} from '../src/game/engine/entityAI'
import {updateItemUse} from '../src/game/engine/inventory'
import {initPartygoer,PARTY,partygoerDamage} from '../src/game/engine/partygoerAI'
import {partygoerBudget,PARTYGOER_CPU_SKIN} from '../src/game/renderer/partygoerMesh'
import {entityPortraitStats} from '../src/components/entityPortrait'
import {partygoerLook} from '../src/game/entities/partygoerLook'

const sleep=(ms=60)=>new Promise(r=>setTimeout(r,ms))
const until=async(fn:()=>unknown,label:string)=>{for(let i=0;i<750;i++){if(fn())return;await sleep(40)}throw Error('Timeout '+label)}
const key=(code:string)=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}))}

export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(value:unknown,label:string)=>{if(!value)throw Error(label);checks.push(label)}
 let q:any,home:any,originals:any[]
 const model=()=>r.entityMeshes.get(q.id)
 const memory=()=>({geometries:r.three.info.memory.geometries,textures:r.three.info.memory.textures,programs:r.three.info.programs?.length,entities:r.entityMeshes.size})
 const diag=()=>{const g=model(),rig=g?.userData.pgRig;return{seed:e.seed,mapSeed:e.mapSeed,mode:app.mode,id:q?.id,hp:q?.hp,armHp:q?.pg?.armHp,position:[q?.x,q?.y,q?.z],player:[e.player.x,e.player.y,e.player.z],yaw:app.look.yaw,pitch:app.look.pitch,fov:r.camera.fov,phase:q?.pg?.phase,intern:rig?.intern,color:rig?.color,nativeSkin:!!rig?.body.visible,cpuSkin:!!rig?.cpuMesh,lost:r.three.getContext().isContextLost(),budget:g?partygoerBudget(g):null,memory:memory()}}
 const reset=()=>{Object.assign(q,home,{dead:false,deathT:0,hp:q.def.hp,stunT:0,attackCd:0,provoked:false,presentationPending:false});initPartygoer(e,q)}
 const face=()=>{q.facing=Math.atan2(e.player.y-q.y,e.player.x-q.x);const dx=q.x-e.player.x,dy=q.y-e.player.y;app.look.yaw=Math.atan2(-dx,-dy);app.look.pitch=Math.atan2(1.25-(e.player.z+1.6),Math.hypot(dx,dy));app.look.roll=0;e.player.facing=Math.atan2(dy,dx)}
 const view=async(distance=3.6)=>{
  const p=e.player;let found=false
  for(let i=0;i<96;i++){const a=i/96*Math.PI*2,x=q.x+Math.cos(a)*distance,y=q.y+Math.sin(a)*distance,z=floorHeight(e.map,x,y,0)
   if(canOccupy(e.map,x,y,.24,{z,band:0})&&e.los(x,y,q.x,q.y)){Object.assign(p,{x,y,z,vz:0,floor:0});found=true;break}}
  ok(found,'Collision-safe camera position at '+distance+' metres');face();await sleep(140)
 }
 const advance=(seconds:number)=>{e.dev.frozenAI=false;for(let t=0;t<seconds;t+=1/60){e.time+=1/60;updateEntities(e,1/60,1)}e.dev.frozenAI=true}
 const prepare=async()=>{
  e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.bright=false;e.handsStowed=true;e.introT=0;e.blackoutT=0
  e.player.equip.offhand={type:'flashlight',count:1};e.player.flashlight=true;e.player.battery=100;e.syncPassives()
  originals=[...e.map.entities];const pack=originals.filter((v:any)=>v.def.type==='partygoer')
  ok(pack.length>=2&&pack.length<=4,'Natural L601 partygoer pack has two to four members')
  q=pack.find((v:any)=>partygoerLook(v.id).color==='yellow')??pack[0];home={x:q.x,y:q.y,z:q.z,facing:q.facing,targetX:q.x,targetY:q.y};reset()
  ok(e.map.items.some((i:any)=>i.type==='velvetcake'),'Natural generation places velvet cake bait')
  ok(e.map.structures.some((s:any)=>s.kind==='megposter'&&s.data?.party),'Natural generation places party posters')
  // Isolate the natural specimen for close visual inspection and combat checks.
  e.map.entities=[q];await view();await until(()=>model()?.visible&&!q.presentationPending,'GPU model warmup')
  const d=diag();ok(!PARTYGOER_CPU_SKIN&&d.nativeSkin&&!d.cpuSkin,'Production GPU skinning renders; no QA CPU replacement')
  ok(!d.lost,'WebGL context stays alive');ok(d.budget.draws<=6&&d.budget.tris<=8000,'Actual model obeys six draws and eight thousand triangle budget')
  ok(app.mode==='classic'?model().userData.pgRig.skinMat.isMeshLambertMaterial:model().userData.pgRig.skinMat.isMeshStandardMaterial,'Model uses the selected lighting material path')
  return d
 }
 const visual=async(name:string)=>{
  reset();e.partyConv=0;e.dev.god=true;e.dev.statLock=true
  const s=q.pg
  if(name==='offer')Object.assign(s,{offer:1,wave:.2})
  if(name==='bite')Object.assign(s,{phase:'bite',reach:1,bite:1})
  if(['berserk','crawl','burn'].includes(name))Object.assign(s,{phase:'hunt',berserk:true,armHp:[0,0],armCut:[1,1],open:1,claw:.4})
  if(name==='crawl'||name==='burn')Object.assign(s,{phase:name==='burn'?'burn':'crawl',down:1,crawl:1,claw:0,downT:9,gait:3})
  if(name==='burn')Object.assign(s,{burn:.62})
  await view(name==='berserk'?4:3.6);await sleep(300)
  const d={name,stagedPose:true,...diag()};ok(!d.lost&&d.nativeSkin,'Native GPU pose visible: '+name);records.push(d);return d
 }
 const mechanisms=async()=>{
  reset();e.dev.god=false;e.dev.statLock=false;e.player.hp=100;e.partyConv=0;await view(1.55)
  advance(.55);ok(q.pg.phase!=='party','Approaching a natural specimen ends its friendly disguise')
  advance(1.2);ok(e.partyConv>=20&&e.player.hp<100,'Actual AI grab-bite damages the player and adds conversion')
  reset();await view(1.3);e.handsStowed=false;e.player.hotbar[0]={type:'axe',count:1};e.player.selected=0;e.dev.noAttackCooldown=true
  const strike=async(part:'armL'|'armR'|'head')=>{
   const f=q.facing,lx=Math.sin(f),ly=-Math.cos(f),sgn=part==='armL'?1:-1
   const tx=q.x+(part==='head'?0:lx*sgn*.42),ty=q.y+(part==='head'?0:ly*sgn*.42),tz=q.z+(part==='head'?1.96:1.22)
   const dx=tx-e.player.x,dy=ty-e.player.y,dz=tz-(e.player.z+1.6),n=Math.hypot(dx,dy,dz)
   app.look.yaw=Math.atan2(-dx,-dy);app.look.pitch=Math.atan2(dz,Math.hypot(dx,dy));e.player.facing=Math.atan2(dy,dx)
   await sleep(60);Object.assign(app.look,{rayX:dx/n,rayY:dy/n,rayZ:dz/n});e.attackCooldownT=0;e.player.stamina=100;e.attack()
  }
  for(const side of ['armL','armR'] as const)for(let i=0;i<5&&q.pg.armHp[side==='armL'?0:1]>0;i++)await strike(side)
  ok(q.pg.armHp.every((hp:number)=>hp<=0)&&q.pg.berserk,'Production melee can sever both arms and reveal the berserker')
  q.stunT=0;const conv=e.partyConv;advance(1.6);ok(e.partyConv===conv,'Berserker cannot add conversion after losing both mouths')
  e.dev.god=true
  for(let i=0;i<20&&q.pg.phase!=='down';i++){await strike('head');e.player.hp=100}
  ok(q.pg.phase==='down'&&!q.dead,'Head strikes knock the berserker down without awarding a kill')
  q.stunT=0;advance(PARTY.DOWN_T+.2);ok(q.pg.phase==='crawl'&&!q.dead,'Actual AI starts crawling after its down delay')
  advance(PARTY.REVIVE_T);ok(!['down','crawl','burn'].includes(q.pg.phase)&&q.hp>1&&!q.dead&&q.pg.armHp.every((hp:number)=>hp<=0),'Untreated body revives without regenerating its arms')
  partygoerDamage(e,q,999,'melee','head');q.stunT=0;ok(q.pg.phase==='down','Revived berserker can be knocked down again')
  // Real projectile landing path, with the existing fire salt item.
  const {landProjectile}=await import('../src/game/engine/combat')
  landProjectile(e,{type:'firesalt',floorZ:q.z,x:q.x,y:q.y,z:q.z,vx:0,vy:0,vz:0,t:0} as any,q.x,q.y)
  ok(q.pg.phase==='burn','A real fire-salt landing ignites the downed body')
  advance(PARTY.BURN_T+.1);ok(q.dead&&q.pg.burned,'Burning completes through the actual kill and loot path')
  reset();e.dev.god=false;e.partyConv=0;e.player.hp=100;e.handsStowed=false;e.player.hotbar[0]={type:'velvetcake',count:1};e.usingItem=null;e.useSlot('hotbar',0);updateItemUse(e,10)
  ok(e.partyConv===30&&e.player.hotbar[0]===null,'Eating velvet cake consumes the actual inventory item and adds conversion')
  e.handsStowed=true;e.usingItem=null;e.player.hotbar[0]={type:'velvetcake',count:1};e.useSlot('hotbar',0);updateItemUse(e,10)
  ok(e.partyConv===30&&e.player.hotbar[0]?.type==='velvetcake','Existing Alt holster still blocks cake use')
  const snap=e.snapshot();ok(!JSON.stringify(snap).includes('partyConv'),'Runtime conversion does not change the save format')
  e.partyConv=0;e.dev.god=true;e.dev.statLock=true;e.handsStowed=true;reset();await view();return{checks:[...checks],state:diag()}
 }
 const archive=async()=>{
  key('KeyG');await until(()=>!!document.querySelector('.codex-cat'),'actual codex')
  const entity=[...document.querySelectorAll('.codex-cat')].find(b=>b.textContent?.trim()==='实体') as HTMLElement;entity.click();await sleep(70)
  ;(document.querySelector('[data-entity-card="partygoer"]') as HTMLElement).click()
  await until(()=>!!document.querySelector('[data-entity-preview="partygoer"]'),'partygoer archive')
  const f=document.querySelector<HTMLElement>('[data-entity-preview="partygoer"]')!;f.scrollIntoView({block:'center'})
  await until(()=>f.dataset.state==='ready','automatic new-model archive image');const img=f.querySelector('img')!;await img.decode();const src=img.src
  ;(f.querySelector('button') as HTMLElement).click();await until(()=>f.dataset.state==='ready'&&f.dataset.view==='1','archive rotation')
  ok(f.querySelector('img')!.src!==src,'Existing entity archive generates the remake and changes angle on click')
  return{state:f.dataset.state,view:f.dataset.view,cache:entityPortraitStats()}
 }
 const retirement=async()=>{
  ;(document.querySelector('.wb-head [aria-label="关闭"]') as HTMLElement).click();await sleep(100)
  e.dev.frozenAI=true;e.dev.god=true;e.map.entities=[q];reset();await view()
  const rounds=[]
  for(let k=0;k<3;k++){
   const extra=Array.from({length:4},(_,i)=>{const v=makeEntity('partygoer',q.x+(i%2)*.5,q.y+Math.floor(i/2)*.5,q.z);initPartygoer(e,v);return v})
   e.map.entities.push(...extra);await until(()=>extra.every(v=>r.entityMeshes.get(v.id)?.visible&&!v.presentationPending),'spawned model warmup')
   ok(extra.every(v=>r.entityMeshes.get(v.id).userData.pgRig.body.visible),'New instances use native GPU skinning')
   e.map.entities=[q];await until(()=>extra.every(v=>!r.entityMeshes.has(v.id)),'entity resource retirement');await sleep(150);rounds.push(memory())
  }
  ok(rounds[2].geometries===rounds[1].geometries&&rounds[2].textures===rounds[1].textures,'Repeated spawn and retirement stabilizes geometry and texture counts')
  ok(model()?.visible&&!r.three.getContext().isContextLost(),'Releasing neighbours preserves the surviving model and shared textures')
  return{rounds,remaining:diag()}
 }
 const transform=async()=>{
  reset();e.dev.god=false;e.dev.statLock=false;e.handsStowed=false;e.partyConv=90;e.player.hp=100;e.usingItem=null;e.player.hotbar[0]={type:'velvetcake',count:1}
  const before=e.map.entities.length;e.useSlot('hotbar',0);updateItemUse(e,10)
  ok(e.over&&e.partyConv===100,'Conversion reaches its actual game-over ending')
  const fresh=e.map.entities.find((v:any)=>v.id!==q.id&&v.def.type==='partygoer')
  ok(e.map.entities.length===before+1&&fresh?.pg?.intern&&fresh.pg.balloon,'Joining the party spawns one balloon-carrying intern at the player')
  await until(()=>r.entityMeshes.get(fresh.id)?.visible,'converted intern rendering')
  ok(!!r.entityMeshes.get(fresh.id).userData.pgRig.balloon,'The converted intern actually renders its red balloon')
  await until(()=>document.querySelector('.end-cause')?.textContent?.includes('加入了派对'),'actual ending UI')
  await sleep(1800)
  // Snapshot finite entrance animations at their final frame; keep the endless
  // caret running. This does not change the product's styles or ending content.
  let finished=0
  for(const animation of document.querySelector('.end-card')!.getAnimations({subtree:true})){
   if(Number.isFinite(animation.effect?.getComputedTiming().endTime)){animation.finish();finished++}
  }
  await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
  ok(Number(getComputedStyle(document.querySelector('.end-cause')!).opacity)>.9,'Ending cause is visible at its completed animation frame')
  return{over:e.over,cause:document.querySelector('.end-cause')?.textContent,conversion:e.partyConv,intern:fresh.id,finishedEntranceAnimations:finished}
 }
 return{prepare,visual,mechanisms,archive,retirement,transform,result:()=>({checks:[...checks],records,state:diag(),memory:memory()})}
}
