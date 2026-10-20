import * as THREE from 'three'
import {object70Keep} from '../src/game/decorations/object70'

const sleep=(ms=50)=>new Promise(r=>setTimeout(r,ms))
const until=async(fn:()=>unknown,label:string)=>{for(let i=0;i<900;i++){if(fn())return;await sleep(40)}throw Error('Timeout '+label)}
const key=(code:string)=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true,cancelable:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true,cancelable:true}))}

export function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 let corpse:any,wx=-10,wy=-23
 const ok=(c:unknown,label:string)=>{if(!c)throw Error(label);checks.push(label)}
 const world=(s:any)=>({x:s.x+(e.map.inf?.ox??0),y:s.y+(e.map.inf?.oy??0)})
 const model=()=>r.structMeshes.get(corpse)
 const stats=()=>({geometry:r.three.info.memory.geometries,textures:r.three.info.memory.textures,programs:r.three.info.programs?.length,chunks:r.chunkGroups.size})
 const state=()=>({before:app.before,seed:e.mapSeed,world:[wx,wy],position:[e.player.x+(e.map.inf?.ox??0),e.player.y+(e.map.inf?.oy??0),e.player.z],yaw:app.look.yaw,pitch:app.look.pitch,mode:r.lightMode,fov:r.camera.fov,sid:corpse?.data?.sid,looted:!!corpse?.looted,opened:corpse?.data?.opened,items:corpse?.data?.lootItems,open:model()?.userData.open,stats:stats()})
 const arm=()=>{e.dev.god=true;e.dev.frozenAI=true;e.dev.statLock=false;e.dev.bright=false;e.introT=0;e.blackoutT=0;e.blackoutWarnT=0;e.handsStowed=true;e.player.equip.offhand={type:'flashlight',count:1};e.player.flashlight=true;e.player.battery=100;e.player.flashJamT=0;e.syncPassives()}
 const locate=()=>{corpse=e.map.structures.find((s:any)=>s.kind==='corpse'&&world(s).x===wx&&world(s).y===wy);if(!corpse)throw Error('Expected naturally generated corpse at '+[wx,wy])}
 const aim=async()=>{
  locate();const p=e.player
  // Inspect a natural corpse in the generated L1; no test-only structure is inserted.
  const {canOccupy}=await import(/* @vite-ignore */`${app.source}/game/core/player.ts`)
  const {floorHeight}=await import(/* @vite-ignore */`${app.source}/game/world/mapgen.ts`)
  let found=false
  for(const [dx,dy]of [[0,1.7],[1.5,.6],[-1.5,.6],[0,-1.7],[1.5,-.6],[-1.5,-.6]]){
   const x=corpse.x+.5+dx,y=corpse.y+.5+dy,z=floorHeight(e.map,x,y,corpse.floor??0)
   if(canOccupy(e.map,x,y,.23,{z,band:corpse.floor??0})){p.x=x;p.y=y;p.z=z;p.floor=corpse.floor??0;p.vz=0;found=true;break}
  }
  ok(found,'Natural corpse has a collision-safe viewing position')
  await until(()=>!!model(),'natural corpse model');await sleep(700);locate()
  for(const dy of [-.1,.05,.2])for(const dx of [0,.12,-.12]){
   const tx=corpse.x+.5+dx,ty=corpse.y+.5+dy
   app.look.yaw=Math.atan2(-(tx-p.x),-(ty-p.y));app.look.pitch=Math.atan2(.13-(p.z+1.6),Math.hypot(tx-p.x,ty-p.y));app.look.roll=0
   await sleep(60);e.scanInteract()
   if(e.interactTarget?.s===corpse)return
  }
  throw Error('Actual interaction scan cannot select the corpse')
 }
 const prepare=async()=>{
  if(app.before)ok(app.engine===(window as any).__engine,'Baseline App aliases use the same old engine singleton')
  arm();e.player.hotbar.fill(null);e.player.backpack.fill(null);e.usingItem=null;e.searching=null;e.closeLootPanel();locate()
  ok(object70Keep(1,wx,wy),'Reference corpse survives deterministic density thinning')
  await aim();ok(e.interactTarget?.kind==='corpse','Production interaction ray selects the generated corpse')
  if(!app.before){ok(!!model().getObjectByName('object70'),'New model is installed in actual L1');ok(Number.isFinite(corpse.data.sid)&&corpse.data.sid<0,'Legacy decoration gets a deterministic persistent SID');const skins:any[]=[];model().traverse((o:any)=>{if(o.isSkinnedMesh)skins.push(o)});ok(skins.length===0,'Runtime corpse uses a static baked mesh')}
  return state()
 }
 const startSearch=async()=>{
  key('KeyE');await until(()=>e.searching?.sid===corpse.data.sid,'E interaction');ok(e.searching?.sid===corpse.data.sid,'Production E starts a real corpse search')
  await until(()=>e.searching?.t>.72,'search progress')
  ok(model().userData.open>0&&model().userData.open<.5,'Briefcase moves during the search progress bar')
  const lid=model().getObjectByName('lid');ok(lid&&Math.abs(lid.rotation.z)<.03,'Lid stays shut until the search completes')
  const loot=JSON.stringify(corpse.data.lootItems)
  // Cancel the ongoing search, then reopen its existing inventory.
  e.searching=null;await sleep(450);ok(model().userData.open<.1,'Interrupted search returns the case to the hand')
  key('KeyE');await until(()=>e.searching?.t>.7,'restart progress')
  ok(JSON.stringify(corpse.data.lootItems)===loot,'Restarting search does not reroll its contents')
  return state()
 }
 const finishSearch=async()=>{
  await until(()=>e.lootPanel?.sid===corpse.data.sid,'production loot panel');await sleep(1200)
  ok(corpse.data.opened===1&&corpse.data.searched===1,'Completed search persists opened/searched flags')
  ok(model().getObjectByName('lid').rotation.z>1.8,'Actual renderer opens the briefcase lid')
  ok(model().getObjectByName('goods').scale.x===1,'Briefcase contents become visible')
  ok(document.body.textContent?.includes('尸体'),'Production loot UI is visible')
  return state()
 }
 const takeAndRestore=async()=>{
  const items=[...e.lootPanel.items];ok(items.length>=2,'New corpse loot pool supplies two common items')
  const before=items.map((t:string)=>e.countItem(t));e.takeAllLoot();e.closeLootPanel();await sleep(250)
  ok(corpse.looted&&corpse.data.lootItems.length===0,'Taking the loot empties the persistent inventory')
  ok(model().getObjectByName('goods').scale.x<.01,'Taking everything hides the model contents')
  ok(items.every((t:string,i:number)=>e.countItem(t)>before[i]),'Loot is added to the actual player inventory')
  e.persist();const snap=JSON.parse(app.memory.get('br_save_slot1'));ok(snap.l1World&&Object.keys(snap.l1World.dynamics.containers).length>0,'Real v1 save contains the corpse container state')
  const inventory=JSON.stringify(e.player.hotbar)+JSON.stringify(e.player.backpack)
  e.newRun(20261017,e.difficulty,'slot1');arm();locate();await aim();await sleep(700)
  ok(corpse.looted&&corpse.data.opened===1&&corpse.data.lootItems.length===0,'Reading the real save restores an open and empty corpse')
  ok(model().getObjectByName('lid').rotation.z>1.8&&model().getObjectByName('goods').scale.x<.01,'Restored model is open and contains no duplicated supplies')
  key('KeyE');await sleep(100);ok(!e.lootPanel&&!e.searching,'Searching a restored empty corpse gives no second reward')
  ok(JSON.stringify(e.player.hotbar)+JSON.stringify(e.player.backpack)===inventory,'Reloading preserves inventory quantities')
  return state()
 }
 const bentoPrepare=async()=>{
  e.player.hotbar.fill(null);e.player.hotbar[0]={type:'bento',count:2};e.player.selected=0;e.handsStowed=false;await sleep(500)
  ok(r.vmHeld==='bento','Bento is rendered by the actual held-item cache')
  const {buildItemMesh}=await import('../src/game/renderer/itemsMesh')
  const {disposeCharacterModel}=await import('../src/game/renderer/retroResources')
  const a=buildItemMesh('bento',{halo:false}),b=buildItemMesh('bento',{halo:false});let shared=false
  const mats=new Set<any>();a.traverse((o:any)=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m)});b.traverse((o:any)=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(mats.has(m))shared=true})
  ok(!shared,'Separate bento instances own separate materials');disposeCharacterModel(a);disposeCharacterModel(b)
  return state()
 }
 const eatBento=async()=>{
  e.player.hunger=20;e.useSlot('hotbar',0);ok(e.usingItem?.type==='bento','Bento enters the actual timed eating action')
  await until(()=>!e.usingItem,'bento eating');ok(e.player.hotbar[0]?.count===1&&e.player.hunger>63,'Eating consumes one bento and restores 45 hunger')
  e.toggleHands();e.useSlot('hotbar',0);ok(!e.usingItem&&e.player.hotbar[0].count===1,'Stowing also blocks using the newly imported consumable')
  return state()
 }
 const retirement=async()=>{
  const settle=async()=>{
   // The entry gate only promises nearby scenery. Wait for the full visible
   // streamed window and retired resources before comparing memory counts.
   await until(()=>{
    const inf=e.map.inf,reach=(r.fogEnabled?Math.min(r.camera.far,r.scene.fog?.far??60):r.camera.far)+32
    for(const c of inf.chunks.values()){
     const x=c.cx*32-inf.ox,y=c.cy*32-inf.oy,dx=Math.max(x-e.player.x,0,e.player.x-x-32),dy=Math.max(y-e.player.y,0,e.player.y-y-32)
     if(dx*dx+dy*dy<=reach*reach&&!r.chunkGroups.has(c.key))return false
    }
    return !r.chunkBuilds.size&&!r.retiredWorld.length&&r.isNearWorldReady(e)&&!!model()
   },'full streamed window and disposal');await sleep(1000)
  }
  await settle()
  for(let cycle=0;cycle<3;cycle++){
   for(const mode of ['classic','realistic']){r.setLightMode(mode);await settle();ok(!!model().getObjectByName('object70'),'Corpse survives material-mode rebuild '+cycle+'/'+mode)}
   records.push(stats())
  }
  ok(records[2].geometry<=records[1].geometry+4&&records[2].textures<=records[1].textures+2,'Repeated quality rebuilds keep geometry and texture counts stable '+JSON.stringify(records))
  return{records,state:state()}
 }
 return{ready:true,prepare,startSearch,finishSearch,takeAndRestore,bentoPrepare,eatBento,retirement,result:()=>({checks:[...checks],state:state(),records,memoryKeys:[...app.memory.keys()]})}
}
