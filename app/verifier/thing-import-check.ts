import * as THREE from 'three'
import {l7SeaFloorAt} from '../src/game/world/infiniteL7'
import {floorHeight} from '../src/game/world/mapgen'
import {makeEntity} from '../src/game/entities'
import {updateThing,thingSurface,writeTar,THINGM} from '../src/game/engine/thingAI'
import {thingVisibleTris} from '../src/game/renderer/thingMesh'
import {ITEMS} from '../src/game/content/items'
const sleep=(ms=80)=>new Promise(r=>setTimeout(r,ms))
const until=async(fn:()=>unknown,label:string,limit=90000)=>{const t=performance.now();while(!fn()){if(performance.now()-t>limit)throw Error('Timeout '+label);await sleep()}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks.push(s)}
 let pin:any=null,raf=0,actor:any,center={x:-340,y:-240,z:-120}
 const tick=()=>{if(pin&&e.map){const p=e.player;p.x=pin.x-(e.map.inf?.ox??0);p.y=pin.y-(e.map.inf?.oy??0);p.z=pin.z;p.vz=0;app.look.yaw=pin.yaw;app.look.pitch=pin.pitch;p.facing=pin.facing}raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick)
 const aim=(x:number,y:number,z:number,tx:number,ty:number,tz:number)=>{pin={x,y,z,yaw:Math.atan2(x-tx,y-ty),pitch:Math.atan2(tz-z-1.62,Math.hypot(tx-x,ty-y)),facing:Math.atan2(ty-y,tx-x)};e.player.x=x-(e.map.inf?.ox??0);e.player.y=y-(e.map.inf?.oy??0);e.player.z=z;app.look.yaw=pin.yaw;app.look.pitch=pin.pitch;e.player.facing=pin.facing}
 const clear=()=>{e.map.entities=[];for(const c of e.map.inf?.chunks.values()??[])c.entities=[]}
 const ready=()=>r.isNearWorldReady(e)&&!document.querySelector('.loading-screen')
 const reset=()=>{pin=null;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.bright=false;e.dev.invisible=false;e.over=false;e.transition=null;e.introT=0;e.input.mx=e.input.my=0;e.input.attack=e.input.attackHeld=e.input.interact=false;e.handsStowed=false;e.usingItem=null}
 const status=()=>({level:e.player.level,center,player:{x:e.player.x+(e.map.inf?.ox??0),y:e.player.y+(e.map.inf?.oy??0),z:e.player.z},mode:r.lightMode,actor:actor?{live:e.map.entities.includes(actor),pending:actor.presentationPending,state:actor.state,th:{dormant:actor.th?.dormant,lost:actor.th?.lost,still:actor.th?.still,lastPx:actor.th?.lastPx,lastPy:actor.th?.lastPy,originX:actor.th?.originX,originY:actor.th?.originY},x:actor.x,y:actor.y,flashlight:e.player.flashlight,lightOn:e.flashActive,paused:e.paused,ai:e.dev.frozenAI}:null,memory:{...r.three.info.memory},chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size,visibleTriangles:actor&&r.entityMeshes.has(actor.id)?thingVisibleTris(r.entityMeshes.get(actor.id)):0})
 const equip=(light=true)=>{const p=e.player;p.flashlight=light;p.battery=100;p.equip.offhand={type:'flashlight',count:1};p.hotbar[0]={type:'knife',count:1};p.selected=0;e.syncPassives()}
 const model=()=>r.entityMeshes.get(actor.id)
 const overview=async()=>{
  reset();const start=performance.now();e.loadLevel(7,{mapSeed:424242,firstVisit:false});reset();await until(ready,'L7 entry',180000)
  center.z=-l7SeaFloorAt(424242,center.x,center.y)+15
  aim(center.x+19,center.y+12,center.z-1,center.x+1,center.y,center.z);e.updateInfiniteWindow();await until(ready,'ocean streaming',180000);clear();equip()
  actor=makeEntity('thething',center.x-e.map.inf.ox,center.y-e.map.inf.oy,center.z);actor.facing=0;e.map.entities.push(actor);e.map.inf.chunks.get(`${Math.floor(center.x/32)},${Math.floor(center.y/32)}`)?.entities.push(actor);updateThing(e,actor,.001,25,false,false);actor.th.dormant=true;actor.state='idle'
  await until(()=>model()&&!actor.presentationPending,'cooperative model and GPU upload');await until(()=>model().userData.thingLod[0].nodes.hi.length,'detailed head');await sleep(1400)
  ok(model().userData.parts.jaw&&model().userData.parts.gillL&&model().userData.thingSegmentCount===28,'new head, jaw, gills and 28 body segments are rendered in actual App')
  ok(model().userData.thingLod[0].hiOn,'near head uses detailed LOD');ok(ITEMS.thingmeat.name==='彼物之肉','item keeps thingmeat ID and new name')
  const out={entryAndStreamingMs:performance.now()-start,headHi:model().userData.thingLod[0].hiOn,...status()};records.push(out);return out
 }
 const close=async()=>{aim(center.x+12,center.y+8,center.z-.8,center.x+4,center.y,center.z+.1);await sleep(1000);ok(model().userData.thingLureMat.emissiveIntensity>0,'lure emission is animated');return status()}
 const bite=async()=>{actor.th.dormant=false;actor.state='attack';actor.lungeT=.22;await sleep(700);ok(model().userData.thingAnim.clip==='bite'&&model().userData.parts.jaw.rotation.z<-.45,'actual attack state opens articulated jaw');return{jaw:model().userData.parts.jaw.rotation.z,...status()}}
 const side=async()=>{actor.state='idle';actor.lungeT=0;const x=center.x-THINGM.HEAD_C-THINGM.SEG*2.5;aim(x,center.y+13,center.z-.5,x,center.y,center.z);await sleep(1100);ok(model().userData.parts.seg2,'body is animated near player');return status()}
 const harvest=async()=>{
  const n=actor.th.chain[3],n2=actor.th.chain[4],x=(n.x+n2.x)/2+e.map.inf.ox,y=(n.y+n2.y)/2+e.map.inf.oy
  actor.th.dormant=true;actor.state='idle';equip(false);e.thingMeatCd=0;actor.th.cut=0;actor.th.meat=3
  aim(x,y+THINGM.BODY_R0+1.05,actor.z-1.35,x,y,actor.z);await sleep(350);ok(thingSurface(e,actor).d<THINGM.MELEE,'actual player is within harvest surface reach')
  const meat=()=>[...e.player.hotbar,...e.player.backpack].filter((s:any)=>s?.type==='thingmeat').reduce((n:number,s:any)=>n+s.count,0),before=meat()
  for(let i=0;i<3;i++){e.attackCooldownT=0;e.hitStopT=0;e.player.stamina=100;e.attack();await until(()=>!e.meleePending,'knife timed strike',3000);await sleep(100)}
  ok(meat()===before+1,'three actual timed knife swings yield exactly one piece');ok(actor.th.dormant,'harvesting a sleeping Thing does not wake it');ok(e.thingMeatCd>18,'harvest cooldown starts');const out={meat:meat(),d:thingSurface(e,actor).d,...status()};records.push(out);return out
 }
 const consume=async()=>{const p=e.player;let where='hotbar',i=p.hotbar.findIndex((s:any)=>s?.type==='thingmeat');if(i<0){where='backpack';i=p.backpack.findIndex((s:any)=>s?.type==='thingmeat')}ok(i>=0,'harvested item available in real inventory');e.useSlot(where,i);await until(()=>!e.usingItem&&e.thingBreathT>590,'real meat consumption',7000);ok(e.thingBreathT>590,'sulfur breath starts after eating');return{breath:e.thingBreathT,...status()}}
 const still=async()=>{e.thingBreathT=0;e.thingBreathPingT=30;e.player.flashlight=false;actor.th.dormant=false;actor.th.lost=false;actor.th.still=0;actor.activated=true;actor.state='chase';actor.stateT=0;actor.attackCd=0;aim(center.x+13.5,center.y,actor.z-1.35,center.x,center.y,actor.z);e.dev.frozenAI=false;await until(()=>actor.th.lost,'stationary target lost',9000);pin=null;await sleep(1300);ok(actor.th.lost&&actor.state!=='chase'&&actor.state!=='attack','stationary dark player stays lost after generic AI update');e.dev.frozenAI=true;return{state:actor.state,lost:actor.th.lost,...status()}}
 const recoil=async()=>{actor.th.fleeT=6;actor.th.dormant=false;actor.state='wander';await sleep(700);ok(model().userData.thingAnim.clip==='flee','flee state selects dedicated animation');return status()}
 const seabed=async()=>{actor.th.fleeT=0;actor.th.dormant=true;actor.state='idle';const x=center.x+25,y=center.y+17,z=floorHeight(e.map,x-e.map.inf.ox,y-e.map.inf.oy,0);equip(true);aim(x,y,z+.3,x-2,y-3,z);await sleep(850);let count=0;r.scene.traverse((o:any)=>{const ms=!o.material?[]:Array.isArray(o.material)?o.material:[o.material];for(const m of ms)if(m.customProgramCacheKey?.().includes('l7seabed'))count++});ok(count>0,'actual streamed seabed uses new triplanar material');return{seabedMeshes:count,...status()}}
 const tar=async()=>{const random=Math.random;let t:any;try{Math.random=()=>.25;t=writeTar(e,true)}finally{Math.random=random}ok(t,'new tar writing added through gameplay function');await until(()=>ready()&&r.chunkBuilds.size===0,'tar geometry revision',180000);const x=t.x+t.w/2+e.map.inf.ox,y=t.y+t.h/2+e.map.inf.oy,z=floorHeight(e.map,t.x+t.w/2,t.y+t.h/2,0);equip(true);aim(x+1.5,y+2,z+1.5,x,y,z);await sleep(900);return{text:t.data.text,read:t.data.read,coordinates:{x,y,z},...status()}}
 const frames=async()=>{
  await close();await until(()=>r.chunkBuilds.size===0,'fixed benchmark window',180000);await sleep(1500)
  await until(()=>!model().userData.thingLod.some((u:any)=>u.job),'benchmark LOD preparation',30000)
  const rounds=[]
  for(let round=0;round<5;round++){
   const a:number[]=[];let last=performance.now()
   for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);const now=performance.now();a.push(now-last);last=now}
   a.sort((x,y)=>x-y);rounds.push({median:a[60],p95:a[114],n:a.length})
  }
  const sorted=(key:string)=>rounds.map((x:any)=>x[key]).sort((a,b)=>a-b)
  return{median:sorted('median')[2],p95:sorted('p95')[2],n:600,rounds,...status()}
 }
 const recycle=async()=>{await close();await until(()=>r.chunkBuilds.size===0,'streamed window settles',180000);await sleep(3500);const rows=[];for(let i=0;i<3;i++){const q=makeEntity('thething',actor.x,actor.y+1,actor.z);q.facing=actor.facing;e.map.entities.push(q);await until(()=>r.entityMeshes.has(q.id)&&!q.presentationPending,'second instance ready');const qg=r.entityMeshes.get(q.id);await until(()=>qg.userData.thingLod[0].nodes.hi.length,'second detailed head');const original=model().userData.thingLureMat.emissiveIntensity;ok(qg.userData.thingLureMat!==model().userData.thingLureMat,'live instances own emission materials '+i);e.map.entities=e.map.entities.filter((a:any)=>a!==q);await until(()=>!r.entityMeshes.has(q.id),'second instance removed');await sleep(1000);ok(model().userData.thingLureMat.emissiveIntensity>0&&original>0,'surviving instance remains valid '+i);rows.push({...r.three.info.memory})}ok(rows.every(m=>m.geometries===rows[0].geometries&&m.textures===rows[0].textures),'three recycle rounds have stable GPU geometry and texture counts');records.push({recycle:rows});return{rows,...status()}}
 const cleanup=async()=>{pin=null;cancelAnimationFrame(raf);reset();e.loadLevel(4,{mapSeed:424242,firstVisit:false});reset();await until(ready,'cleanup L4',180000);clear();await sleep(900);ok(![...r.entityMeshes.values()].some((g:any)=>g.userData.entType==='thething'),'new model is removed on level switch');return status()}
 return{overview,close,bite,side,harvest,consume,still,recoil,seabed,tar,frames,recycle,cleanup,summary:()=>({checks,records,status:status()})}
}
