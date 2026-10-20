import { entityForms, makeEntity } from '../src/game/entities'
import { initRat, placeGear, updateRatGear, ratProvoke } from '../src/game/engine/ratAI'
import { genL2ChunkRaw } from '../src/game/world/infiniteL2'
import { LEVELS } from '../src/game/levels'
import { canOccupy } from '../src/game/core/player'
import * as dev from './dev-tools'

const tick = async (n=1) => { for(let i=0;i<n;i++)await new Promise<void>(r=>requestAnimationFrame(()=>r())) }
const forms = entityForms('corpserat')
const checks:string[]=[]
const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks.push(s)}
async function ready(qa:any,id:number) {
  const start=performance.now()
  while(performance.now()-start<15000){await tick();const g=qa.r.entityMeshes.get(id);if(g?.visible&&qa.r.itemWarmup.ready(g)&&!qa.eng.map.entities.find((e:any)=>e.id===id)?.presentationPending)return g}
  throw Error('Entity preparation timeout: '+id)
}
export async function mount(qa:any) {
  const manifest=await dev.mount(qa)
  ok(entityForms('clump').length===2,'Clump has only two variants')
  ok(entityForms('faceling').length===2&&entityForms('faceling')[1].name==='敌意无面灵','Faceling has common/hostile variants')
  ok(entityForms('duller').length===0,'Duller has no subvariants')
  ok(manifest.forms.length===33,'Shared registry has 33 entries across nine parent types')
  for(const type of ['clump','faceling','duller']) {
    const form=entityForms(type)[0]?.id
    await dev.summon(qa,type,form)
    const select=document.querySelector(`[data-entity="${type}"] select`) as HTMLSelectElement|null
    ok(type==='duller'?!select:select?.options.length===3,`${type}: production HUD options reflect simplified taxonomy`)
  }
  for(const f of forms) {
    await dev.summon(qa,'corpserat',f.id)
    const e=qa.eng.map.entities.at(-1),g=await ready(qa,e.id)
    ok(e.rt?.morph===f.traits?.ratMorph&&g.userData.ratRig.morph===e.rt.morph,`${f.id}: UI → entity factory → AI → model agree`)
  }
  return {checks,manifest,seed:20261006,viewport:[innerWidth,innerHeight]}
}
export async function view(qa:any,kind='common',pose='side') {
  const eng=qa.eng,p=eng.player,r=qa.r
  qa.setFrozen(true);eng.paused=false;eng.devEnabled=true;eng.dev.frozenAI=true;eng.dev.god=true;eng.dev.invisible=false
  eng.map.entities=[];eng.map.ratGear=[];eng.particles=[]
  p.x=41.7;p.y=25.5;p.z=0;p.floor=0;p.crouching=true;p.flashlight=false;p.hp=100;p.sanity=100
  qa.look.yaw=-Math.PI/2;qa.look.pitch=-.45;qa.look.roll=0;r.setFov(48)
  const form=forms.find(f=>f.traits?.ratMorph===kind)!
  const e=makeEntity('corpserat',43.3,25.5,0,form.id);e.id=8100+forms.indexOf(form);e.facing=pose==='front'?Math.PI:-Math.PI/2
  initRat(eng,e);e.rt!.phase=kind==='capybara'?'command':'watch';e.rt!.phaseT=100;e.state='idle'
  if(kind==='capybara'){p.x=40.3;qa.look.pitch=-.12;r.setFov(52);e.rt!.bubbleText='目标出现。';e.rt!.bubbleT=3}
  if(kind==='cave'){p.crouching=false;qa.look.pitch=.45}
  if(pose==='run'){e.rt!.phase='roam';e.state='wander';e.animT=1}
  r.entityFacing.delete(e.id)
  eng.map.entities=[e];const g=await ready(qa,e.id);await tick(12)
  let meshes=0,triangles=0;g.traverse((o:any)=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3}})
  return {kind,pose,id:e.id,position:g.position.toArray(),morph:g.userData.ratRig.morph,meshes,triangles,eye:[r.camera.position.x,r.camera.position.y,r.camera.position.z],yaw:qa.look.yaw,pitch:qa.look.pitch,fov:r.camera.fov,memory:{...r.three.info.memory}}
}
export async function mechanisms(qa:any) {
  const eng=qa.eng,p=eng.player,r=qa.r
  const step=(n:number)=>{for(let i=0;i<n;i++)eng.updateEntities(1/30,1)}
  await view(qa,'common');let e=eng.map.entities[0]
  eng.dev.frozenAI=false;eng.dev.god=false;p.x=e.x-2.8;p.hp=100
  step(60);ok(p.hp===100&&!e.provoked,'Actual AI leaves unprovoked player unharmed')
  e.rt.phase='roam';e.rt.phaseT=10;p.x=e.x-2.5;p.y=e.y;eng.input.sprint=true;step(2)
  ok(e.rt.phase==='flee','Actual AI flees nearby sprinting player');eng.input.sprint=false
  e.x=p.x+.5;e.y=p.y;e.hp--;step(20)
  ok(e.provoked&&p.hp<100&&p.slowT>0,'Actual AI retaliates and applies ankle slowdown')
  e.presentationPending=true;p.hp=100;const state=[e.x,e.y,e.attackCd];step(30)
  ok(p.hp===100&&state[0]===e.x&&state[1]===e.y&&state[2]===e.attackCd,'Pending model cannot move/attack invisibly')
  e.presentationPending=false
  await view(qa,'capybara');e=eng.map.entities[0]
  const sightPoint=Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return [e.x+Math.cos(a)*7,e.y+Math.sin(a)*7]})
    .find(([x,y])=>canOccupy(eng.map,x,y,.32,{z:0,crouch:false,band:0})&&eng.los(e.x,e.y,x,y))
  ok(sightPoint,'Capybara fixture provides an unobstructed seven-metre sightline')
  eng.dev.frozenAI=false;eng.dev.god=false;[p.x,p.y]=sightPoint!;p.hp=100;step(60)
  ok(e.rt.phase==='command'&&e.hp===45&&e.def.damage===10&&p.hp===100,`Actual capybara keeps distance and commands (${e.rt.phase}, HP ${e.hp}, damage ${e.def.damage}, player HP ${p.hp})`)
  eng.dev.frozenAI=true;eng.map.ratGear=[]
  const trap=placeGear(eng,{...e,x:p.x,y:p.y},undefined,'trap');trap.dud=false
  updateRatGear(eng,1/30,1)
  ok(trap.sprung&&p.hp===92&&p.flashJamT>0,'Actual trap damages, slows and jams flashlight')
  eng.map.ratGear=[];p.hp=100
  const bomb=placeGear(eng,{...e,x:p.x+1,y:p.y},undefined,'bomb');bomb.dud=false
  for(let i=0;i<50;i++)updateRatGear(eng,1/30,1)
  ok(p.hp<100&&eng.map.ratGear.length===0,'Actual bomb triggers, explodes and retires')
  eng.map.ratGear=[];eng.dev.god=true;eng.map.items=[];e.hp=0;eng.killCheck(e)
  ok(e.dead&&eng.map.items.filter((v:any)=>v.type==='ratmeat').length===1,'Capybara kill drops one corpse-rat meat item')
  eng.killCheck(e);ok(eng.map.items.filter((v:any)=>v.type==='ratmeat').length===1,'Repeated death check cannot duplicate meat')
  p.hotbar[0]={type:'ratmeat',count:1};p.hunger=20;eng.usingItem=null
  const random=Math.random;Math.random=()=>.1
  try {eng.useSlot('hotbar',0);eng.updateItemUse(8)} finally {Math.random=random}
  ok(p.hunger===38&&!p.hotbar[0],'Actual inventory consumes meat once and restores 18 hunger')
  const def=LEVELS.find(l=>l.id===2)!,corpses:any[]=[]
  for(let cy=-1;cy<=1;cy++)for(let cx=-1;cx<=1;cx++){
    const a=genL2ChunkRaw(def,20261006,cx,cy),b=genL2ChunkRaw(def,20261006,cx,cy)
    const list=(c:any)=>c.structures.filter((s:any)=>s.kind==='ratcorpse')
    ok(JSON.stringify(list(a))===JSON.stringify(list(b)),`L2 corpse positions deterministic at ${cx},${cy}`);corpses.push(...list(a))
  }
  ok(corpses.length>0&&corpses.every(s=>!s.solid),'L2 generates decorative rat corpses without blocking corridors')
  const memory=[]
  for(let cycle=0;cycle<4;cycle++){
    for(const f of forms){await view(qa,f.traits!.ratMorph as string);eng.map.entities=[];await tick(3)}
    eng.map.ratGear=[];eng.map.items=[];await qa.warm();memory.push({...r.three.info.memory})
  }
  ok(memory.slice(1).every(v=>v.geometries===memory[1].geometries&&v.textures===memory[1].textures),'Four rebuild/disposal cycles stabilize GPU resources')
  return {checks,memory,corpses:corpses.length}
}
export async function gears(qa:any) {
  await view(qa,'capybara','front');const eng=qa.eng,p=eng.player,e=eng.map.entities[0]
  e.rt.phase='plant';eng.map.ratGear=[]
  placeGear(eng,{...e,x:42.3,y:25.1},undefined,'trap');placeGear(eng,{...e,x:42.3,y:25.8},undefined,'bomb')
  p.x=40.25;qa.look.pitch=-.32;await tick(25)
  ok(qa.r.ratGearMeshes.size===2,'Actual renderer displays both world-coordinate rat devices')
  return {checks,gears:eng.map.ratGear.map((g:any)=>({kind:g.kind,position:[g.wx,g.wy,g.wz]}))}
}
