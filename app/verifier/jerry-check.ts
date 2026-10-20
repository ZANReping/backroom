import * as THREE from 'three'
import {makeEntity} from '../src/game/entities'
import {canOccupy} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
import * as J from '../src/game/engine/jerryAI'
import {updateItemUse} from '../src/game/engine/inventory'
import {jerryBudget,jerryShoulderPoint} from '../src/game/renderer/jerryMesh'
import {humanoidMotion} from '../src/game/renderer/humanoidMotion'
import {entityPortraitStats} from '../src/components/entityPortrait'

const sleep=(ms=60)=>new Promise(r=>setTimeout(r,ms))
const until=async(f:()=>unknown,label:string)=>{const t=performance.now();while(!f()){if(performance.now()-t>60000)throw Error('Timeout '+label);await sleep(60)}}
const key=(code:string)=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}))}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label)}
 const q=e.map.entities.find((v:any)=>v.def.type==='jerry'),home={x:q.x,y:q.y,z:q.z,facing:q.facing}
 const model=()=>r.entityMeshes.get(q.id)
 const memory=()=>({...r.three.info.memory,programs:r.three.info.programs.length})
 const diag=()=>({mode:app.mode,seed:e.seed,mapSeed:e.mapSeed,player:[e.player.x,e.player.y,e.player.z],position:[q.x,q.y,q.z],facing:q.facing,alt:q.jy?.alt,pose:q.jy?.mode,fov:r.camera.fov,look:[app.look.yaw,app.look.pitch],indoctrination:e.indoctrination,budget:model()?jerryBudget(model()):null,memory:memory()})
 function reset(){Object.assign(q,home,{dead:false,deathT:0,hp:q.def.hp,stunT:0});delete q.jy;const s=J.jerryState(q);s.idleT=9999;s.spokeIntro=true;s.speakT=9999;e.jerryRun=J.freshJerryRun();e.indoctrination=0;e.jerryTamed=false;e.jerryContactCd=0;e.rep.jerry=0;e.handsStowed=true;e.usingItem=null;e.player.hp=100;e.player.sanity=100;e.dev.god=true;e.dev.statLock=true}
 async function warm(){
  const t=performance.now();let stable=t,last=''
  while(true){
   const sig=JSON.stringify(memory())
   if(r.finiteTask||r.precompileRunning||r.precompileDirty||r.precompileTimer!==null||r.retiredWorld.length||r.retiredTextures.size||sig!==last){last=sig;stable=performance.now()}
   if(performance.now()-t>1500&&performance.now()-stable>600)return
   if(performance.now()-t>90000)throw Error('Warmup timeout '+sig)
   await sleep(100)
  }
 }
 async function view(x:number,y:number,z:number,distance:number,angle=-Math.PI/2){
  let found=false
  for(let k=0;k<96;k++){
   const a=angle+(k%2===0?1:-1)*Math.ceil(k/2)*Math.PI/48,px=x+Math.cos(a)*distance,py=y+Math.sin(a)*distance,pz=floorHeight(e.map,px,py,0)
   if(!canOccupy(e.map,px,py,.24,{z:pz,band:0})||!J.jerryLos(e,px,py,x,y))continue
   Object.assign(e.player,{x:px,y:py,z:pz,vz:0,floor:0});app.look.yaw=Math.atan2(-(x-px),-(y-py));app.look.pitch=Math.atan2(z-(pz+1.6),distance);app.look.roll=0;e.player.facing=Math.atan2(y-py,x-px);found=true;break
  }
  ok(found,'Collision-safe camera at '+distance+' metres');r.setFov(60);await sleep(180)
 }
 function tick(t:number,withNpcs=false){e.dev.frozenAI=false;for(let k=0;k<t*60;k++){e.time+=1/60;if(withNpcs)e.updateNpcs(1/60);else J.updateJerryPlayer(e,1/60);J.updateJerryEntity(e,q,1/60,Math.hypot(q.x-e.player.x,q.y-e.player.y))}e.dev.frozenAI=true}
 const prepare=async()=>{
  e.devEnabled=true;e.dev.frozenAI=true;e.dev.bright=false;e.introT=0;e.blackoutT=0;reset();e.player.flashlight=false
  document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click()
  ok(e.player.level===274&&e.map.entities.filter((v:any)=>v.def.type==='jerry').length===1,'Natural L274 has exactly one Jerry')
  const perch=e.map.structures.find((s:any)=>s.kind==='perch')
  ok(perch&&Math.floor(q.x)===perch.x&&Math.floor(q.y)===perch.y,'Natural specimen aligns with its perch')
  await view(q.x,q.y,1.7,2.7,q.facing);await until(()=>model()?.visible&&!q.presentationPending,'native Jerry model');await warm()
  const rig=model().userData.jerryRig,b=jerryBudget(model())
  ok(rig.body.isSkinnedMesh&&rig.body.visible&&!rig.cpuMesh&&!rig.cpuProxy,'Actual game uses native GPU skinning')
  ok(b.tris<=3000&&b.draws===3&&b.bones===14,'Actual model meets 3000 triangles, three draws and fourteen bones')
  ok(app.mode==='classic'?rig.featherMat.isMeshLambertMaterial:rig.featherMat.isMeshStandardMaterial,'Selected classic/realistic material path is active')
  ok(Math.abs(model().position.y-1.48)<.001,'Feet rest at the 1.48-metre perch height')
  ok(!r.three.getContext().isContextLost(),'Native WebGL context is alive');return diag()
 }
 const visual=async(name:string)=>{
  reset()
  if(name.startsWith('shoulder')){
   ok(J.forceSermon(e),'Production sermon places Jerry on Bluebird');tick(.1,true)
   const n=e.npcs.find((n:any)=>n.id==='bluebird');n.sermon.t=99999
   for(const npc of e.npcs)npc.bubbleT=0
   q.jy.bubbleT=0
   const rec=r.npcMeshes?.get(n.id)??r.npcGroups?.get(n.id)
   await view(q.x,q.y,1.55,2.9,name==='shoulder-back'?-Math.PI/2:name==='shoulder-side'?0:Math.PI/2);await sleep(300)
   // Renderer anchors against the actual posed avatar bones, not fixed-height geometry.
   const actualRec=rec??r.npcMeshes?.get(n.id)??r.npcGroups?.get(n.id)
   const bones=actualRec?.grp&&humanoidMotion(actualRec.grp)?.rig.bones
   ok(!!bones,'Current Bluebird avatar exposes shoulder bones')
   const foot=jerryShoulderPoint(bones.upperArmL,bones.clavicleL,new THREE.Vector3())
   ok(model().position.distanceTo(foot)<.001,'Bird feet follow the real posed shoulder')
   ok(model().quaternion.angleTo(actualRec.grp.quaternion)<.001,'Bird uses the carrier world orientation')
  }else if(name==='pounce'){
   await view(q.x,q.y,1.3,4.0,Math.PI/2);J.jerryHurt(e,q);tick(.03);ok(q.jy.mode==='pounce','Damaging Jerry triggers its actual pounce AI');tick(.2);await sleep(150)
   ok(q.jy.spread>.5&&q.jy.alt<1.48,'Live pounce opens wings while descending')
  }else await view(q.x,q.y,1.7,1.45,q.facing)
  const record={name,...diag()};records.push(record);return record
 }
 const contact=async()=>{
  reset();q.facing=Math.PI/2;await view(q.x,q.y,1.48,1.3,Math.PI/2)
  const box=J.jerryInteractBox(e,q);await view(q.x,q.y,box.z,1.3,Math.PI/2);e.scanInteract()
  ok(e.interactTarget?.kind==='jerry','Actual camera ray selects Jerry, not its perch')
  ;(document.activeElement as HTMLElement)?.blur();key('KeyE');await until(()=>e.indoctrination>=25,'E contact');await until(()=>!!document.querySelector('[data-jerry-trance]'),'stupor HUD')
  ok(J.jerryInputLock(e)&&e.jerryRun.stupor?.stage===0,'Actual E interaction triggers first stupor and input lock')
  e.handsStowed=false;e.player.hotbar[0]={type:'almond',count:1};e.player.selected=0
  ok(!e.useSlot('hotbar',0)&&!e.usingItem&&e.player.hotbar[0]?.count===1,'Inventory input cannot bypass the live stupor lock')
  const stamina=e.player.stamina,rep=e.rep.jerry,indoct=e.indoctrination;e.attack();e.jerryContactCd=0;e.doInteract();e.jerryContactCd=20
  ok(e.player.stamina===stamina&&e.indoctrination===indoct&&e.rep.jerry===rep,'Direct attack and E interaction cannot bypass stupor');e.handsStowed=true
  return{...diag(),overlay:J.jerryOverlay(e)}
 }
 const devotion=async()=>{
  await until(()=>J.jerryOverlay(e).devotion>.7,'devotion phase');await until(()=>document.body.textContent?.includes('你低下头，双手交叠在胸前'),'devotion caption')
  ok(J.jerryInputLock(e)&&J.jerryOverlay(e).devotion>.05,'Devotion phase uses the production locked-input caption');return{...diag(),overlay:J.jerryOverlay(e)}
 }
 const mechanisms=async()=>{
  reset();await view(q.x,q.y,1.48,1.3,Math.PI/2);e.handsStowed=false;e.player.hotbar[0]={type:'almond',count:1};e.player.selected=0
  e.player.facing=Math.atan2(q.y-e.player.y,q.x-e.player.x);e.useSlot('hotbar',0);updateItemUse(e,10)
  ok(e.jerryTamed&&e.indoctrination===0&&e.player.hotbar[0]===null,'Actual almond-water inventory use tames Jerry and consumes one bottle')
  ok(e.jerryRun.echoT>0&&e.jerryRun.echoT<=300,'Taming leaves the bounded stupor echo')
  e.handsStowed=true;e.player.hotbar[0]={type:'almond',count:1};e.usingItem=null;e.useSlot('hotbar',0);updateItemUse(e,10)
  ok(e.player.hotbar[0]?.count===1,'Existing holster blocks almond use')
  reset();const hp=e.player.hp;e.dev.god=false;e.dev.statLock=false;await view(q.x,q.y,1.48,3.5,Math.PI/2);J.jerryHurt(e,q);tick(1.8)
  ok(e.player.hp<hp&&q.jy.hitDone,'Actual pounce resolves player damage once')
  e.player.hp=10;e.jerryRun.nonLethal=true;e.hurtPlayer(9,'信众的投石索');e.jerryRun.nonLethal=false
  ok(!e.over&&e.jerryRun.ko&&e.player.hp>=1,'Actual follower damage knocks out instead of killing')
  J.updateJerryPlayer(e,6)
  ok(e.jerryRun.truceT>0&&!e.jerryRun.ko,'Knockout recovery starts a temporary truce')
  e.player.hotbar[0]={type:'jerryflyer',count:1};e.handsStowed=false;e.usingItem=null;e.useSlot('hotbar',0);updateItemUse(e,10)
  ok(e.jerryRun.lureMarks.length>0||e.jerryRun.lurePending,'Reading the actual flyer records a Jerry-room lure')
  ok(!JSON.stringify(e.snapshot()).includes('jerryRun'),'Runtime remake state does not replace the existing save schema')
  reset();await view(q.x,q.y,1.7,2.7);e.player.hotbar[0]={type:'jerryflyer',count:1};e.player.hotbar[1]={type:'fakelog',count:1}
  await until(()=>document.querySelector<HTMLImageElement>('img[src$="item_jerryflyer.png"]')?.naturalWidth===128,'flyer pixel icon')
  ok(document.querySelector<HTMLImageElement>('img[src$="item_fakelog.png"]')?.naturalWidth===128,'Both new paper items load dedicated 128px pixel icons')
  return{checks:[...checks],state:diag()}
 }
 const archive=async()=>{
  key('KeyG');await until(()=>document.querySelector('.codex-cat'),'codex');const b=[...document.querySelectorAll<HTMLElement>('.codex-cat')].find(v=>v.textContent?.trim()==='实体')!;b.click();await sleep(100)
  document.querySelector<HTMLElement>('[data-entity-card="jerry"]')!.click();await until(()=>document.querySelector('[data-entity-preview="jerry"]'),'archive card')
  const f=document.querySelector<HTMLElement>('[data-entity-preview="jerry"]')!;f.scrollIntoView({block:'center'});await until(()=>f.dataset.state==='ready','native Jerry archive image')
  const src=f.querySelector<HTMLImageElement>('img')!.src;f.querySelector<HTMLButtonElement>('button')!.click();await until(()=>f.dataset.state==='ready'&&f.dataset.view==='1','second portrait view')
  ok(f.querySelector<HTMLImageElement>('img')!.src!==src,'Real entity codex generates the remake and changes angle on click');return{state:f.dataset.state,view:f.dataset.view,cache:entityPortraitStats()}
 }
 const retirement=async()=>{
  document.querySelector<HTMLElement>('.wb-head [aria-label="关闭"]')!.click();await sleep(120);reset();await view(q.x,q.y,1.7,2.7)
  const rounds=[]
  for(let i=0;i<3;i++){
   const extra=Array.from({length:4},(_,k)=>{const v=makeEntity('jerry',q.x+(k%2)*.3,q.y+Math.floor(k/2)*.3,q.z);J.jerryState(v);return v});e.map.entities.push(...extra)
   await until(()=>extra.every(v=>r.entityMeshes.get(v.id)?.visible&&!v.presentationPending),'new native models')
   ok(extra.every(v=>r.entityMeshes.get(v.id).userData.jerryRig.body.geometry!==model().userData.jerryRig.body.geometry),'Each live model independently owns its geometry')
   e.map.entities=e.map.entities.filter((v:any)=>!extra.includes(v));await until(()=>extra.every(v=>!r.entityMeshes.has(v.id)),'removed model resources');await warm();rounds.push(memory())
  }
  ok(rounds[2].geometries===rounds[1].geometries&&rounds[2].textures===rounds[1].textures,'Repeated spawn and release stabilizes GPU geometry and textures')
  ok(model().visible&&model().userData.jerryRig.body.visible&&!r.three.getContext().isContextLost(),'Releasing neighbours and portrait preserves the world bird')
  return{rounds,remaining:diag()}
 }
 const death=async()=>{
  reset();await view(q.x,q.y,1.5,2.7,q.facing+.35);const start=model().position.y
  q.hp=0;e.killCheck(q);await sleep(80)
  ok(q.dead&&e.rep.jerry===-100,'Actual Jerry kill makes the followers fully hostile')
  ok(model()&&model().position.y>start-.2,'Death begins at the current perch height without snapping to the floor')
  await sleep(240);ok(model()&&model().position.y<start-.3&&model().position.y>.08,'Dying bird visibly falls before resource retirement')
  return{...diag(),startHeight:start,renderedHeight:model().position.y,deathT:q.deathT}
 }
 const lureMap=async()=>{
  // Exercise the new papers through the real inventory and both map renderers.
  e.loadLevel(2,{mapSeed:6767,firstVisit:false});e.introT=0;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.handsStowed=false
  await until(()=>r.isNearWorldReady(e),'L2 actual nearby scene');await until(()=>!document.querySelector('[role="status"]')?.textContent?.includes('正在准备附近场景'),'loading overlay closed')
  e.jerryRun=J.freshJerryRun();e.player.hotbar[0]={type:'jerryflyer',count:1};e.player.hotbar[1]={type:'fakelog',count:1};e.usingItem=null
  e.useSlot('hotbar',0);updateItemUse(e,10);const marks=J.jerryLureMarks(e)
  ok(marks.length===1&&e.player.hotbar[0]===null,'Actual L2 flyer reading resolves one deterministic room marker')
  // Observe the text drawn by the actual map canvases, without replacing any draw.
  const seen:{text:string;x:number;y:number;width:number;height:number}[]=[],proto=CanvasRenderingContext2D.prototype,fill=proto.fillText
  proto.fillText=function(text:string,x:number,y:number,maxWidth?:number){const mat=this.getTransform();seen.push({text,x:mat.a*x+mat.c*y+mat.e,y:mat.b*x+mat.d*y+mat.f,width:this.canvas.width,height:this.canvas.height});if(maxWidth===undefined)fill.call(this,text,x,y);else fill.call(this,text,x,y,maxWidth)}
  try{
   key('KeyM');await until(()=>document.querySelector('.wb-tabs'),'actual big map');await until(()=>seen.some(t=>t.text.includes(marks[0].name)&&t.width>=400),'big map room marker')
   ok(seen.some(t=>t.text.includes(marks[0].name)&&t.width>=400&&t.x>=8&&t.x<=t.width-8&&t.y>=10&&t.y<=t.height-8),'Production big map keeps the distant room marker inside its visible viewport')
   await sleep(200)
   return{level:e.player.level,marks,recordedDraws:seen.filter(t=>t.text.includes(marks[0].name)),origin:[e.map.inf.ox,e.map.inf.oy]}
  }finally{proto.fillText=fill}
 }
 return{prepare,visual,contact,devotion,mechanisms,archive,retirement,death,lureMap,result:()=>({checks:[...checks],records,state:diag()})}
}
