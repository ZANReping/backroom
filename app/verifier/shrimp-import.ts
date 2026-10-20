import {initShrimp,releaseShrimp,SHRIMP_LOCAL_CAP} from '../src/game/engine/shrimpAI'
import {initDuller} from '../src/game/engine/dullerAI'
import {NPCS} from '../src/game/content/npcs'
import {ITEMS} from '../src/game/content/items'
let baseline=false,make:any
const checks:string[]=[]
const ok=(value:unknown,label:string)=>{if(!value)throw Error(label);checks.push(label)}
const tick=async(n=1)=>{for(let i=0;i<n;i++)await new Promise<void>(r=>requestAnimationFrame(()=>r()))}
async function ready(qa:any,id:number){
 const start=performance.now()
 while(performance.now()-start<20000){await tick();const model=qa.r.entityMeshes.get(id);if(model?.visible&&!qa.eng.map.entities.find((e:any)=>e.id===id)?.presentationPending&&qa.r.itemWarmup.ready(model))return{model,ms:performance.now()-start}}
 throw Error('Shrimp presentation did not finish preparing')
}
const inventoryCount=(eng:any,type:string)=>[...eng.player.hotbar,...eng.player.backpack].reduce((n:number,s:any)=>n+(s?.type===type?s.count:0),0)
function setup(qa:any){
 const e=qa.eng,p=e.player;qa.setFrozen(true);e.paused=false;e.dev.god=true;e.dev.frozenAI=true;e.dev.invisible=false
 e.map.entities=[];e.map.items=[];e.npcs=[];e.particles=[];e.usingItem=null;e.interactT=0
 p.x=41.7;p.y=25.5;p.z=0;p.floor=0;p.facing=0;p.crouching=true;p.flashlight=false;p.selected=0;p.hp=100;p.sanity=100
 p.hotbar.fill(null);p.backpack.fill(null);p.equip.offhand=null
 qa.look.yaw=-Math.PI/2;qa.look.pitch=-.5;qa.look.roll=0;qa.r.setFov(48)
}
export async function mount(qa:any,before=false){
 baseline=before
 const root=baseline?'/.cache/shrimp-v81-baseline/src/game':'/src/game'
 make=(await import(/* @vite-ignore */root+'/entities/index.ts')).makeEntity
 setup(qa)
 return{seed:20261006,baseline,viewport:[innerWidth,innerHeight],liveItem:!baseline&&!!ITEMS.liveshrimp}
}
export async function view(qa:any,pose='crawl'){
 setup(qa);const eng=qa.eng,p=eng.player,r=qa.r
 if(pose==='handheld'){
  p.hotbar[0]={type:'liveshrimp',count:1};qa.look.pitch=-.15
  await qa.warm();await tick(12)
  return{pose,stats:qa.stats()}
 }
 if(pose==='items'){
  const types=baseline?['dryshrimp','friedshrimp']:['dryshrimp','liveshrimp','friedshrimp']
  types.forEach((type,i)=>eng.map.items.push({id:818100+i,type,x:43.1,y:24.85+i*.65}))
  qa.look.pitch=-.55;r.setFov(58);await qa.warm();await tick(8)
  return{pose,types,stats:qa.stats()}
 }
 const e=make('dryshrimp',43.25,25.5,0);e.id=8181;e.facing=-1.0;e.state=pose==='rest'?'idle':'wander'
 if(!baseline){
  const s=initShrimp(e);s.size=1;s.splitIn=900;s.phase=pose;s.speed=pose==='rest'||pose==='split'?0:.36;s.swim=pose==='swim'?1:0;s.wet=pose==='swim';s.split=pose==='split'?.8:0;s.t=pose==='split'?3.2:0
  if(pose==='swim')s.speed=.58
 }
 eng.map.entities=[e];const {model,ms}=await ready(qa,e.id);qa.freezeRenderTime(2.4);await tick(8)
 let meshes=0,triangles=0;model.traverse((o:any)=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3}})
 return{pose,meshes,triangles,prepareMs:ms,position:model.position.toArray(),fov:r.camera.fov,yaw:qa.look.yaw,pitch:qa.look.pitch,stats:qa.stats()}
}
export async function mechanisms(qa:any){
 const eng=qa.eng,p=eng.player,r=qa.r
 await view(qa,'crawl');let shrimp=eng.map.entities[0]
 shrimp.x=p.x+.65;shrimp.y=p.y;shrimp.presentationPending=false
 let scanned=false
 for(let pitch=-1.45;pitch<-.1;pitch+=.025){qa.look.pitch=pitch;eng.scanInteract();if(eng.interactTarget?.kind==='shrimp'){scanned=true;break}}
 ok(scanned,'Actual interaction scan selects the live shrimp')
 eng.doInteract();ok(shrimp.dead&&shrimp.sh.caught&&inventoryCount(eng,'liveshrimp')===1,'E interaction catches exactly one live item')
 eng.doInteract();ok(inventoryCount(eng,'liveshrimp')===1,'Repeated interaction cannot duplicate the catch')
 let where:any='hotbar',index=p.hotbar.findIndex((s:any)=>s?.type==='liveshrimp')
 if(index<0){where='backpack';index=p.backpack.findIndex((s:any)=>s?.type==='liveshrimp')}
 eng.dropSlot(where,index);shrimp=eng.map.entities.find((e:any)=>!e.dead&&e.def.type==='dryshrimp')
 ok(shrimp&&Number.isFinite(shrimp.x)&&Number.isFinite(shrimp.y)&&shrimp.x>p.x,'Drop releases an entity in the actual facing direction')
 ok(inventoryCount(eng,'liveshrimp')===0&&shrimp.sh.bait===40,'Drop consumes the live item once and enables forty-second bait')
 await ready(qa,shrimp.id)
 eng.dev.frozenAI=false;const health=p.hp
 for(let i=0;i<90;i++)eng.updateEntities(1/30,1)
 ok(p.hp===health,'Unprovoked live shrimp causes zero damage through actual AI')
 eng.dev.frozenAI=true
 eng.map.entities=[];eng.map.items=[];p.hotbar[0]={type:'liveshrimp',count:1};p.hunger=20;eng.useSlot('hotbar',0);eng.updateItemUse(8)
 ok(p.hunger===45&&!p.hotbar[0],'Actual inventory consumes live shrimp and restores 25 hunger')
 ok(NPCS.tom.barter?.some(t=>t.give==='liveshrimp'&&t.get==='friedshrimp'),'Tom exposes the live-to-fried recipe')
 await view(qa,'crawl');shrimp=eng.map.entities[0];shrimp.hp=0;eng.killCheck(shrimp)
 ok(shrimp.dead&&eng.map.items.filter((i:any)=>i.type==='dryshrimp').length===1,'Player kill drops one dead shrimp item')
 eng.killCheck(shrimp);ok(eng.map.items.filter((i:any)=>i.type==='dryshrimp').length===1,'Repeated death check cannot duplicate food')
 await view(qa,'crawl');shrimp=eng.map.entities[0];eng.dev.frozenAI=false;shrimp.sh.phase='split';shrimp.sh.t=3.99;shrimp.sh.split=.99
 eng.updateEntities(1/30,1)
 ok(eng.map.entities.filter((e:any)=>!e.dead&&e.def.type==='dryshrimp').length===2,'Actual AI completes mitosis and adds one child')
 const child=eng.map.entities.find((e:any)=>e!==shrimp);ok(child.sh.size===shrimp.sh.size&&child.sh.grow<1,'Child inherits its parent size and grows in')
 eng.dev.frozenAI=true
 setup(qa);const victim=releaseShrimp(eng,43.3,25.5,0),duller=make('duller',44.5,25.5,0);duller.id=8189;initDuller(eng,duller,null)
 p.x=39;p.facing=Math.PI;qa.look.yaw=Math.PI/2;eng.map.entities.unshift(duller)
 await ready(qa,victim.id);await ready(qa,duller.id);eng.dev.frozenAI=false
 let held=false,feeding=false
 for(let i=0;i<360&&!victim.dead;i++){eng.updateEntities(1/30,1);held ||=victim.sh.phase==='held';feeding ||=duller.dl.phase==='feed'}
 ok(held&&feeding&&victim.dead&&victim.sh.eater===duller,'Actual duller AI approaches, holds and eats the bait')
 ok(!eng.map.items.length&&duller.dl.spook>10,'Predation drops no food and grants bait distraction cooldown')
 eng.dev.frozenAI=true
 setup(qa);const food=make('dryshrimp',43.3,25.5,0),moth=make('deathmoth',44,25.5,.9)
 food.id=8190;moth.id=8191;initShrimp(food);eng.map.entities=[moth,food];p.x=38
 await ready(qa,food.id);await ready(qa,moth.id)
 moth.state='chase';moth.stateT=5;moth.huntScanT=0;eng.dev.frozenAI=false
 eng.updateEntities(1/30,1)
 ok(!food.dead&&!moth.targetEnt,'Chasing moth ignores a regular shrimp')
 food.sh.bait=40;moth.huntScanT=0;moth.state='chase';eng.updateEntities(1/30,1)
 ok(food.dead&&food.sh.eater===moth&&!eng.map.items.length,'Chasing moth diverts to released bait and eats it without loot')
 eng.dev.frozenAI=true
 const memory=[]
 for(let cycle=0;cycle<4;cycle++){
  await view(qa,'crawl');eng.map.entities=[];eng.map.items=[];await tick(8);await qa.warm();memory.push({...r.three.info.memory})
 }
 ok(memory.slice(1).every(m=>m.geometries===memory[1].geometries&&m.textures===memory[1].textures),'Repeated entity disposal stabilizes GPU resources')
 ok(SHRIMP_LOCAL_CAP===4,'Local split cap remains four')
 return{checks,memory}
}
export async function benchmark(qa:any){
 await view(qa,'crawl');await qa.warm()
 const rounds=[]
 for(let i=0;i<5;i++)rounds.push(await qa.sample(120,1200))
 return{rounds,description:'One live shrimp, warmed EL3A room, five sequential samples; includes the existing scene and postprocessing.'}
}
