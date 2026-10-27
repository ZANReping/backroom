import * as THREE from 'three'
import {createCanvas} from '@napi-rs/canvas'
const memory=new Map<string,string>()
Object.assign(globalThis,{window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},document:{createElement:(tag:string)=>tag==='canvas'?createCanvas(64,64):({style:{}}),getElementById:()=>null,addEventListener(){},removeEventListener(){},body:{appendChild(){}}},localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}})
const {buildHoundMeshJob}=await import('../src/game/renderer/houndMesh')
const {setHoundLod,houndActiveBones}=await import('../src/game/renderer/houndAnim')
const {disposeL8Tree}=await import('../src/game/renderer/l8ModelResources')
const {Engine}=await import('../src/game/engine')
const {L02}=await import('../src/game/levels/l02')
const {L02_ID,l02Layout,genL02Chunk,l02NearestDoor}=await import('../src/game/world/l02Layout')
const C=await import('../src/game/world/l02Collapse')
const R=await import('../src/game/engine/l02Collapse')
const Q=await import('../src/game/engine/levelQuests')
const {L0_EXPLORE_REGIONS}=await import('../src/game/content/levelQuestsL0')
const {L0_SUBLEVELS}=await import('../src/game/content/l0Sublevels')
const {itemBaseValue}=await import('../src/game/engine/merchantTrade')
const {warehouseDepositN}=await import('../src/game/engine/warehouse')
const {buildItemMesh}=await import('../src/game/renderer/itemsMesh')
const {floorHeight,generateLevel}=await import('../src/game/world/mapgen')
let checks=0;function ok(v:unknown,msg:string){checks++;if(!v)throw Error(msg)}
const done=<T>(it:Generator<void,T,unknown>)=>{let n=it.next(),steps=1;while(!n.done&&steps<20000){n=it.next();steps++}if(!n.done)throw Error('unbounded model job');return{value:n.value,steps}}
for(const kind of ['hostile','neutral','ambusher'] as const){
 const {value:g,steps}=done(buildHoundMeshJob(kind==='neutral',17,kind));ok(steps>50,'hound construction yields');ok(g.userData.houndKind===kind,'correct hound shape');g.updateMatrixWorld(true)
 let meshes=0;g.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){meshes++;ok(Array.from(m.geometry.getAttribute('position').array).every(Number.isFinite),'finite vertices');ok(!!m.geometry.getAttribute('uv'),'explicit UV')}});ok(meshes===8,'8 batched hound meshes')
 const bones=houndActiveBones(g);setHoundLod(g,2);ok(houndActiveBones(g)<bones,'far LOD reduces active bone updates');setHoundLod(g,0);ok(houndActiveBones(g)===bones,'LOD restore preserves full skeleton');disposeL8Tree(g)
 const job=buildHoundMeshJob(kind==='neutral',29,kind);for(let i=0;i<90;i++)job.next();job.return(undefined as never);ok(true,'cancelled partial hound job')
}
for(const [cx,cy] of [[0,0],[-1,0],[1,-1],[-2,-2]]){const a=l02Layout(424242,cx,cy),b=l02Layout(424242,cx,cy);ok(JSON.stringify(a)===JSON.stringify(b),'deterministic L02 layout');const c=genL02Chunk(L02,424242,cx,cy);ok(c.structures.every(s=>[s.x,s.y,s.w,s.h].every(Number.isFinite)),'finite L02 collisions');ok(c.tiles.length===1024,'32m chunks preserved')}
const e=new Engine();e.seed=424242;e.loadLevel(0,{mapSeed:424242,firstVisit:false});e.paused=false;e.introT=0;e.devEnabled=true;e.dev.god=true;e.dev.frozenAI=true
const st=Q.levelQuestState(e);e.levelQuests.update(e,.25);ok(!!st.quests.l0_tutorial?.revealed,'L0 tutorial appears');e.questEvent({t:'leaveLevel',from:0,to:1});ok(!st.quests.l0_tutorial.obj.exit,'exit cannot complete before Manila')
st.l0Regions=[...L0_EXPLORE_REGIONS,6];e.levelQuests.update(e,.25);ok(st.quests.l0_tutorial.obj.explore&&st.quests.l0_tutorial.obj.manila,'region goals resolve');e.questEvent({t:'photo',subject:'l0_red_entrance'});ok(st.quests.l0_tutorial.obj.photo_red,'optional camera event');e.questEvent({t:'leaveLevel',from:0,to:1});ok(st.quests.l0_tutorial.done,'tutorial completes on actual departure event')
for(const sub of L0_SUBLEVELS)e.enterL0Sublevel(sub.id);e.levelQuests.update(e,.25);ok(e.countItem('tape_l0')===1,'sublevel goals grant one special tape');for(let i=0;i<3;i++)e.levelQuests.update(e,1);ok(e.countItem('tape_l0')===1,'reward does not duplicate')
const slot=e.player.hotbar.findIndex(s=>s?.type==='tape_l0'),ref=slot>=0?{w:'hotbar' as const,i:slot}:{w:'backpack' as const,i:e.player.backpack.findIndex(s=>s?.type==='tape_l0')};const count=e.countItem('tape_l0');e.dropSlot(ref.w,ref.i);ok(e.countItem('tape_l0')===count,'special tape cannot be discarded');ok(!warehouseDepositN(e,'meg',ref),'special tape cannot enter faction warehouse');ok(e.countItem('tape_l0')===count,'failed deposit preserves original stack')
e.rep.brc=61;ok(e.requestBrcPermit(),'construction permit granted at >60 reputation');ok(!e.requestBrcPermit(),'permit issued only once');ok(e.countItem('brc_permit')===1,'permit is in existing inventory')
ok(itemBaseValue('tape_l0')===null&&itemBaseValue('brc_permit')===null,'key collectibles cannot be sold through merchant recycling');
const snap=e.snapshot();ok(snap.v===1,'main save version unchanged');ok(snap.player.levelQuests?.quests.l0_beyond.rewarded&&snap.player.remodel?.permitIssued,'new progress included in snapshot')
e.loadLevel(L02_ID,{mapSeed:424242,firstVisit:true});ok(e.player.level===L02_ID&&!!e.map?.inf?.l02,'registered L02 loads its infinite generator');ok(e.l02?.stage===0,'collapse starts intact');ok(e.map!.entities.length===0,'L02 does not spawn entities');ok(e.map!.items.some(i=>i.type==='dustmask'),'spawn area contains dust mask')
R.devL02Stage(e,3);R.tickL02(e,.05);ok(e.l02!.stage===3,'collapse debug selects stage');e.l02!.stopped=true;e.player.equip.head=null;e.dev.god=false;e.dev.statLock=false;e.player.hp=100;e.player.sanity=100;e.l02!.dust=.5;e.l02!.dmgAcc=0;e.l02!.puffs=[{x:e.player.x+e.map!.inf!.ox,y:e.player.y+e.map!.inf!.oy,k:1,t0:e.l02!.t}];R.tickL02(e,1);const bare=100-e.player.hp;ok(bare>0,'dust harms unprotected player');e.player.equip.head={type:'dustmask',count:1};e.player.hp=100;e.l02!.dust=.5;e.l02!.dmgAcc=0;e.l02!.puffs=[{x:e.player.x+e.map!.inf!.ox,y:e.player.y+e.map!.inf!.oy,k:1,t0:e.l02!.t}];R.tickL02(e,1);ok(100-e.player.hp<bare,'dust mask reduces actual damage');e.dev.god=true
const door=l02NearestDoor(424242);ok(Math.hypot(door.x-16,door.y-16)>=44&&Math.hypot(door.x-16,door.y-16)<=128,'nearest deterministic return door respects entry exclusion');const inf=e.map!.inf!;Object.assign(e.player,{x:door.x-inf.ox,y:door.y+.8-inf.oy,z:0});R.tickL02(e,.05);ok(e.l02!.stopped,'safe return area stops collapse')
const hole=C.planHole(50,50,[],[],1,0,.5)!;ok(!!hole,'hole can be planned in clear space');hole.dropped=true;C.l02Collapse().holes.push(hole);inf.l02=true;const mid={x:hole.open.x+hole.open.w*.5,y:hole.open.y+hole.open.h*.5};ok((C.l02FloorAt(mid.x,mid.y)??0)<0,'collapsed opening has lower support');ok(C.houseColliders(hole).every(r=>r.w>0&&r.h>0),'house colliders have positive extents');ok(C.housePartition(hole).every(r=>r.w>0&&r.h>0),'partition leaves usable doorway')
const cuts=C.l02Collapse().removedWalls;cuts.length=0;for(let i=0;i<C.L02_TUNING.maxWalls;i++)cuts.push({x:1000+i*4,y:1000,w:3,h:.2,axis:'x',dir:1,t0:i});const first=cuts[0];ok(!(globalThis as any).__l02QA.wall(e)&&cuts.length===C.L02_TUNING.maxWalls&&cuts[0]===first,'wall budget cannot resurrect an old visible wall over a missing collider');
e.loadLevel(0,{mapSeed:424242,firstVisit:false});e.loadLevel(L02_ID,{mapSeed:424242,firstVisit:false});ok(C.l02Collapse().holes.length===0&&e.l02?.t===0,'re-entry resets transient collapse');ok(e.countItem('tape_l0')===1&&e.countItem('brc_permit')===1,'travel preserves key items');ok(e.player.levelQuests?.quests.l0_beyond.rewarded,'travel preserves task reward record')
for(const type of ['tape_l0','brc_permit','dustmask']){const g=buildItemMesh(type,{halo:false});let meshes=0;g.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){meshes++;ok(Array.from(m.geometry.getAttribute('position').array).every(Number.isFinite),'finite item vertices')}});ok(meshes>0&&meshes<24,'dedicated bounded item model '+type);disposeL8Tree(g)}
console.log(JSON.stringify({checks,failures:0,scope:'cooperative hounds, L0 quests/key items/save, L02 generation/collapse/facilities'}))
