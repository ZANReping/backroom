// Scripted behavior checks use the real Engine/Renderer in the QA game.
export async function verify(qa) {
  const {engine:e,renderer:r}=qa,checks=[]
  const ok=(value,label)=>{if(!value)throw Error(label);checks.push(label)}
  await qa.entrySpeed.measure(104)
  const map={...e.map,inf:undefined,traders:undefined,items:[],entities:[]}
  const actor={...e.player,hotbar:[],backpack:[],equip:{...e.player.equip,pockets:[],offhand:null}}
  const fake=Object.create(e);Object.assign(fake,{map,player:actor,npcs:[]})
  const renderer=Object.create(r)
  Object.assign(renderer,{builtMap:map,finiteTask:null,levelGroup:r.levelGroup,pendingEnvProbe:null,flashWarmupKey:'ready',flashWarmup:null,shrimpHeldWarmupKey:'',shrimpHeldWarmup:null,nguithrWarmupKey:'',nguithrWarmup:null,armsWarmupKey:'',armsWarmup:null,mothWarmupDone:false,watchWarmupDone:false,wranglerWarmupDone:false,bursterWarmupDone:false,itemMeshes:new Map(),npcMeshes:new Map(),entityMeshes:new Map()})
  for(const id of [1,2,3,5,8,9,11]){
    actor.level=id
    ok(renderer.isNearWorldReady(fake),'unspawned template variants do not block Level '+id)
  }
  const entity={id:991001,x:actor.x+1,y:actor.y,def:{type:'smiler'},dead:false,hidden:false}
  map.entities=[entity];ok(!renderer.isNearWorldReady(fake),'missing actual nearby entity still blocks entry')
  entity.hidden=true;ok(renderer.isNearWorldReady(fake),'hidden entity keeps original exemption');entity.hidden=false
  entity.dead=true;ok(renderer.isNearWorldReady(fake),'dead entity keeps original exemption');entity.dead=false
  entity.x=actor.x+25;ok(renderer.isNearWorldReady(fake),'far entity keeps original visibility reach');entity.x=actor.x+1
  const owner={};renderer.entityMeshes.set(entity.id,owner);renderer.itemWarmup={ready:()=>false,advance(){}}
  ok(!renderer.isNearWorldReady(fake),'actual owner waiting for its first GPU upload still blocks entry')
  renderer.itemWarmup.ready=()=>true;ok(renderer.isNearWorldReady(fake),'actual owner ready allows entry')
  map.entities=[];map.items=[{id:1,type:'liveshrimp',x:actor.x+30,y:actor.y}]
  ok(!renderer.isNearWorldReady(fake),'available catch still requires first-person shrimp preparation')
  map.items=[];fake.npcs=[{id:'qa-near',x:actor.x,y:actor.y}]
  ok(!renderer.isNearWorldReady(fake),'actual near NPC still blocks entry');fake.npcs=[]
  map.items=[{id:2,type:'almond',x:actor.x,y:actor.y}]
  ok(!renderer.isNearWorldReady(fake),'actual near dropped item still blocks entry');map.items=[]
  let optional=0,required=0
  renderer.itemWarmup={advance(){required++},ready:()=>true}
  renderer.advanceFlashWarmup=()=>{};renderer.advanceOptionalModels=()=>{optional++};renderer.isNearWorldReady=()=>true
  fake.paused=true;renderer.advanceEntryModels(fake,performance.now());ok(optional===0&&required===1,'paused entry runs required work only')
  fake.paused=false;renderer.advanceEntryModels(fake,performance.now());ok(optional===1,'spare active frame advances optional work')
  renderer.advanceEntryModels(fake,performance.now()-20);ok(optional===1,'busy frame leaves optional templates queued')
  const counts={nguithr:0,moth:0}
  actor.level=5;Object.assign(renderer,{optionalModelCursor:0,shrimpHeldWarmup:null,heldCache:new Map([[renderer.lightMode+':liveshrimp',{}]]),advanceNguithrWarmup:()=>{counts.nguithr++},mothWarmup:{next(){counts.moth++;return{done:false}}}})
  for(let n=0;n<8;n++)r.advanceOptionalModels.call(renderer,fake,true)
  ok(counts.nguithr===4&&counts.moth===4,'background round robin advances one applicable family per frame')
  e.newRun(424242,'normal','slot1',true,900);e.paused=false;e.introT=0;e.dev.god=false;e.dev.statLock=false
  Object.assign(e.player,{hunger:61,thirst:47,stamina:100,battery:80,flashlight:true,sanity:70,infection:0})
  const before={hunger:e.player.hunger,thirst:e.player.thirst,battery:e.player.battery}
  for(let n=0;n<600;n++)e.update(1/60)
  ok(e.player.hunger===61&&e.player.thirst===47,'10 simulated seconds of real foyer engine updates preserve hunger and thirst')
  ok(e.player.battery<before.battery,'other survival timers still run in foyer')
  e.devFastForward(60);ok(e.player.hunger===61&&e.player.thirst===47,'foyer developer time skip preserves hunger and thirst')
  e.loadLevel(0,{mapSeed:424242,firstVisit:true});e.paused=false;e.introT=0
  for(let n=0;n<120;n++)e.update(1/60)
  ok(e.player.hunger<61&&e.player.thirst<47,'normal drain resumes after leaving the foyer')
  return{passed:checks.length,checks,foyerBefore:before,backroomsAfter:{hunger:e.player.hunger,thirst:e.player.thirst}}
}
