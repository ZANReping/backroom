import { Engine } from '../src/game/engine'
import { ALPHA_BLUEPRINT, ALPHA_ENTRIES } from '../src/game/content/alphaBlueprint'
import { canOccupy } from '../src/game/core/player'
import { availableStation } from '../src/game/engine/career'
import { structureInteractionProfile } from '../src/game/engine/interact'
import { look } from '../src/game/renderer'
import { enableRuntimeStructCollisionIndex } from '../src/game/world/mapgen'
import { ALPHA_PEOPLE, ALPHA_REVISIONS } from '../src/game/content/alphaPeople'
import { ALPHA_PLACEMENT_CLEARANCES } from '../src/game/content/alphaBlueprint'
import { updateNpcs } from '../src/game/engine/npc'
import { RNG } from '../src/game/core/rng'

/** Runs against a separate Engine, restoring the verification browser's storage afterward. */
export function verifyAlphaRuntime(){
 const backup=Object.entries(localStorage),savedLook={yaw:look.yaw,pitch:look.pitch,rayX:look.rayX,rayY:look.rayY,rayZ:look.rayZ},results:string[]=[]
 const check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);results.push(label)}
 const e=new Engine();e.seed=742901;e.paused=true;e.dev.god=true;e.loadLevel(101,{mapSeed:424242,firstVisit:false});e.introT=0
 try{
  check(!e.map!.structures.some(s=>s.kind==='settlementstation'),'floating service markers removed')
  for(const s of ALPHA_BLUEPRINT.services.filter(s=>!s.access)){
   let found=false
   for(let radius=.8;radius<=2.4&&!found;radius+=.4)for(let i=0;i<32&&!found;i++){
    const x=s.x+Math.sin(i*Math.PI/16)*radius,y=s.y+Math.cos(i*Math.PI/16)*radius
    if(!canOccupy(e.map!,x,y,.32,{z:0,band:0,crouch:false}))continue
    Object.assign(e.player,{x,y,z:0,floor:0});look.yaw=Math.atan2(x-s.x,y-s.y);look.pitch=-.13;look.visualHit=null;look.rayX=s.x-x;look.rayY=s.y-y;look.rayZ=structureInteractionProfile(e.map!.structures.find(p=>p.data?.facility&&p.data?.room===s.zone)!).centerZ-1.55
    e.scanInteract();found=e.interactTarget?.s?.data?.room===s.zone
   }
   check(found,'E interaction reachable: '+s.id)
   check(availableStation(e,s.services[0],'meg')===e.interactTarget?.s,'physical furniture accepts service: '+s.id)
   let opened='';const off=e.on(event=>{if(event.kind==='facility'||event.kind==='faction')opened=event.kind})
   e.doInteract();off()
   check(opened===(s.services.includes('career')?'faction':'facility')&&e.activeStation===s.zone,'service panel opens from furniture: '+s.id)
  }
  for(const exit of e.map!.exits){
   const entry=ALPHA_ENTRIES.find(r=>r.exit.x===exit.x&&r.exit.y===exit.y)!,rad=entry.mount.deg*Math.PI/180
   Object.assign(e.player,{x:exit.x+.5+Math.sin(rad)*1.3,y:exit.y+.5+Math.cos(rad)*1.3,z:0,floor:0})
   look.visualHit=null;look.yaw=Math.atan2(e.player.x-exit.x-.5,e.player.y-exit.y-.5);look.pitch=-.15
   look.rayX=exit.x+.5-e.player.x;look.rayY=exit.y+.5-e.player.y;look.rayZ=-.6
   e.scanInteract();check(e.interactTarget?.e===exit,'wall-mounted entrance is targetable: '+exit.def.name)
   e.transition=null;e.outpostReturn=1;e.doInteract();check(e.transition?.dest===1,'returns to Level 1: '+exit.def.name)
  }
  e.transition=null;e.player.x=30.5;e.player.y=33;e.rep.meg=45
  const snap=e.snapshot();check(snap.alphaLayout===5,'new residential layout marker written')
  snap.player.x=0;snap.player.y=0;delete snap.alphaLayout
  const moneyBefore=JSON.stringify(snap.player.inv),careerBefore=JSON.stringify(snap.career),warehouseBefore=JSON.stringify(snap.warehouses)
  localStorage.setItem('br_save_slot3',JSON.stringify(snap));e.newRun(e.seed,'normal','slot3')
  check(e.player.x===e.map!.spawn.x&&e.player.y===e.map!.spawn.y,'old layout relocates to north arrival')
  check(JSON.stringify(e.player.inv)===moneyBefore,'inventory preserved across layout migration')
  check(JSON.stringify(e.snapshot().career)===careerBefore,'career state preserved across migration')
  check(JSON.stringify(e.warehouses)===warehouseBefore&&e.rep.meg===45,'warehouse and reputation preserved')
  for(const version of [1,2,3,4] as const){
   const previous=e.snapshot();previous.alphaLayout=version;previous.player.x=60;previous.player.y=23
   localStorage.setItem('br_save_slot3',JSON.stringify(previous));e.newRun(e.seed,'normal','slot3')
   check(e.player.x===e.map!.spawn.x&&e.player.y===e.map!.spawn.y,'previous layout '+version+' relocates safely')
   check(JSON.stringify(e.player.inv)===moneyBefore&&e.rep.meg===45,'previous layout '+version+' preserves inventory and reputation')
  }
  e.player.x=30.5;e.player.y=33;const current=e.snapshot();localStorage.setItem('br_save_slot3',JSON.stringify(current));e.newRun(e.seed,'normal','slot3')
  check(Math.hypot(e.player.x-30.5,e.player.y-33)<.05,'current layout restores exact safe position')
  enableRuntimeStructCollisionIndex(e.map!)
  check(canOccupy(e.map!,e.player.x,e.player.y,.32,{z:0,band:0,crouch:false}),'restored player can move')
  return {passed:results.length,results}
 }finally{
  localStorage.clear();for(const [k,v] of backup)localStorage.setItem(k,v)
  Object.assign(look,savedLook)
 }
}

/** Actual E-targeting, deterministic walking and same-version save recovery for public life. */
export function verifyAlphaCommunityRuntime(){
 const backup=Object.entries(localStorage),savedLook={yaw:look.yaw,pitch:look.pitch,rayX:look.rayX,rayY:look.rayY,rayZ:look.rayZ},originalRandom=Math.random,results:string[]=[]
 const check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);results.push(label)}
 const e=new Engine();e.seed=742901;e.paused=true;e.dev.god=true;e.loadLevel(101,{mapSeed:424242,firstVisit:false});e.introT=0
 const ids=[...Object.keys(ALPHA_PEOPLE),...Object.keys(ALPHA_REVISIONS)]
 try{
  enableRuntimeStructCollisionIndex(e.map!)
  check(e.npcs.length===29,'all 29 residents instantiated')
  for(const id of ids){
   const n=e.npcs.find(n=>n.id===id)!;check(!!n,'named resident instantiated: '+id)
   let found=false
   for(let radius=.8;radius<=2.1&&!found;radius+=.25)for(let j=0;j<24&&!found;j++){
    const x=n.x+Math.sin(j*Math.PI/12)*radius,y=n.y+Math.cos(j*Math.PI/12)*radius
    if(!canOccupy(e.map!,x,y,.32,{z:0,band:0,crouch:false}))continue
    Object.assign(e.player,{x,y,z:0,floor:0});look.visualHit=null;look.yaw=Math.atan2(x-n.x,y-n.y);look.pitch=-.06;look.rayX=n.x-x;look.rayY=n.y-y;look.rayZ=-.12
    e.scanInteract();found=e.interactTarget?.npc?.id===id
   }
   check(found,'resident can be targeted from clear floor: '+id)
   let opened='';const off=e.on(event=>{if(event.kind==='dialog')opened=event.text??''});e.doInteract();off()
   check(opened===id,'E opens correct resident dialogue: '+id)
  }
  const rng=new RNG(17041);Math.random=()=>rng.next()
  for(let frame=0;frame<600;frame++){
   updateNpcs(e,.1)
   for(const n of e.npcs){
    if(!canOccupy(e.map!,n.x,n.y,.24,{z:0,band:0,crouch:false}))throw new Error('NPC walks into furnishing: '+n.id)
    if(ALPHA_PLACEMENT_CLEARANCES.some(r=>n.x>r.x-.22&&n.x<r.x+r.w+.22&&n.y>r.y-.22&&n.y<r.y+r.h+.22))throw new Error('NPC occupies a door approach: '+n.id)
   }
  }
  check(true,'60 seconds of NPC walking preserves doors and body clearance')
  for(const id of ids){const n=e.npcs.find(n=>n.id===id)!;check(Math.hypot(n.x-n.homeX,n.y-n.homeY)<=(n.def.wanderRadius??3)+.08,'resident stays near assigned work pocket: '+id)}
  // A version-5 save may have been made where a new corridor furnishing now stands.
  e.player.x=34;e.player.y=101.45;const snap=e.snapshot(),inventory=JSON.stringify(snap.player.inv)
  localStorage.setItem('br_save_slot3',JSON.stringify(snap));e.newRun(e.seed,'normal','slot3')
  check(canOccupy(e.map!,e.player.x,e.player.y,.32,{z:0,band:0,crouch:false}),'old corridor position resolves outside new furniture')
  check(JSON.stringify(e.player.inv)===inventory&&e.npcs.length===29,'save keeps inventory and rebuilds community roster')
  return {passed:results.length,results}
 }finally{
  Math.random=originalRandom;localStorage.clear();for(const [k,v] of backup)localStorage.setItem(k,v);Object.assign(look,savedLook)
 }
}
