import assert from 'node:assert/strict'
const memory=new Map<string,string>()
Object.assign(globalThis,{window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},document:{createElement:()=>({getContext:()=>null,style:{}}),getElementById:()=>null,addEventListener(){},removeEventListener(){},body:{appendChild(){}}},localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}})
await import('../src/game/world/mapgen')
const {Engine}=await import('../src/game/engine')
const {captureL0,restoreL0,enterL0Red,tickL0,l0VisibleTo,l0Connected}=await import('../src/game/engine/l0State')
const {genL0Architecture,l0Layout}=await import('../src/game/world/l0Architecture')
const {l0WallMount}=await import('../src/game/world/l0Architecture')
const {updateSurvival}=await import('../src/game/engine/survival')
const {placeBonusStairs}=await import('../src/game/engine/level')
const {floorHeight}=await import('../src/game/world/mapgen')
const e=new Engine();e.seed=20261006;e.loadLevel(0,{mapSeed:e.seed,firstVisit:false})
const map=e.map!,inf=map.inf!,generated=map.items[0]
if(generated){inf.taken.add(generated.id);map.items=map.items.filter(v=>v!==generated)}
map.items.push({id:.8123,type:'almond',x:e.player.x,y:e.player.y})
const wall=map.structures.find(s=>s.data?.l0Wall)!,wx=wall.x,wy=wall.y
e.explored[Math.floor(e.player.y)*map.w+Math.floor(e.player.x)]=1
e.l0World=captureL0(e);assert(e.l0World?.chunks.some(([,s])=>s.extraItems.some(i=>i.id===.8123)),'fresh unslotted drop saved')
restoreL0(e);assert(map.items.some(v=>v.id===.8123),'drop restored');assert(!generated||!map.items.some(v=>v.id===generated.id),'taken generated item stays taken');assert(e.explored.some(Boolean),'exploration restored')
assert(map.structures.some(s=>s.x===wx&&s.y===wy),'same seed geometry restored')
// Same-world sealing: entry never changes the map, position, items or seed.
const {commitL0Revision,l0GateObserved}=await import('../src/game/engine/l0State')
const {redZonesNear,insideRedZone}=await import('../src/game/world/l0RedZone')
const {look}=await import('../src/game/renderer/shared')
e.player.x=496-inf.ox;e.player.y=0-inf.oy;e.updateInfiniteWindow()
const world=e.map!,before={x:e.player.x,y:e.player.y},zone=redZonesNear(e.seed,15,0).find(z=>z.id==='reference-red')!
assert(zone)
world.items.push({id:.9123,type:'canned',x:e.player.x,y:e.player.y})
enterL0Red(e);assert.equal(e.map,world);assert.equal(e.player.x,before.x);assert.equal(e.player.y,before.y);assert.equal(world.inf!.l0!.space,'shared')
assert(world.inf!.l0!.redProgress?.[zone.id]?.entered)
const facingGate=zone.gates[0];e.player.x=facingGate.x+facingGate.w/2-world.inf!.ox;e.player.y=facingGate.y+2-world.inf!.oy;look.yaw=0
assert(l0GateObserved(e,facingGate),'observed aperture stays open')
e.player.x=496-world.inf!.ox;e.player.y=0-world.inf!.oy
for(let n=0;n<16;n++){look.yaw=n*Math.PI/4;e.time+=1;tickL0(e,.1);const pending=world.inf!.l0Pending;if(pending)commitL0Revision(e,pending)}
assert.equal(world.inf!.l0!.redProgress![zone.id].closed.length,zone.gates.length,'unseen openings eventually all seal')
assert(world.inf!.l0!.trapped);assert.equal(e.map,world,'sealing never replaces world');assert.equal(world.items.filter(v=>v.id===.9123).length,1)
const position={x:e.player.x,y:e.player.y};e.time+=60;tickL0(e,1);assert.deepEqual({x:e.player.x,y:e.player.y},position,'real route loops never teleport')
e.l0World=captureL0(e);restoreL0(e);assert.equal(world.inf!.l0!.redProgress![zone.id].closed.length,zone.gates.length)
assert.equal(world.items.filter(v=>v.id===.9123).length,1,'seals and drops survive restore')
const snap=e.snapshot();assert.equal(snap.v,1);memory.set('br_save_slot1',JSON.stringify(snap))
const restarted=new Engine();restarted.newRun(e.seed,'normal','slot1');assert(restarted.map!.inf!.l0!.trapped);assert(insideRedZone(zone,restarted.player.x+restarted.map!.inf!.ox,restarted.player.y+restarted.map!.inf!.oy))
const fresh=new Engine();fresh.newRun(e.seed,'normal','slot1',true);assert(!fresh.map!.inf!.l0!.trapped,'explicit new game with same seed ignores old progress')
const {devMapTeleport}=await import('../src/game/engine/devMap')
restarted.devEnabled=true;assert(!await devMapTeleport(restarted,{x:16,y:16,floor:0}),'map cannot leave sealed red room')
const old={...snap,l0World:undefined,l0SharedWorld:undefined};memory.set('br_save_slot1',JSON.stringify(old));const migrated=new Engine();migrated.newRun(e.seed,'normal','slot1');assert(!migrated.map!.inf!.l0?.trapped);assert.equal(migrated.player.hp,snap.player.hp);assert(migrated.snapshot().l0World)
// Legacy private-red data is moved once to a sealed real enclosure.
const legacy=structuredClone(snap);legacy.l0World!.space.space='red:solo';legacy.l0World!.generationVersion=2
memory.set('br_save_slot1',JSON.stringify(legacy));const legacyEngine=new Engine();legacyEngine.newRun(e.seed,'normal','slot1');assert.equal(legacyEngine.map!.inf!.l0!.space,'shared');assert(legacyEngine.map!.inf!.l0!.trapped);assert.equal(legacyEngine.map!.items.filter(i=>i.id===.9123).length,1)
for(let x=-8;x<=8;x++)for(let y=-8;y<=8;y++){
 const a=genL0Architecture(e.levelDef,781,x,y,undefined,0),b=genL0Architecture(e.levelDef,781,x,y,undefined,1)
 assert.deepEqual(a.items,b.items,'layout revisions preserve item identities/types/positions')
 assert.deepEqual(a.structures.filter(s=>!s.data?.l0Wall),b.structures.filter(s=>!s.data?.l0Wall),'layout revisions preserve interactive state IDs')
 if(['maze','open','pillarhall','blackout'].includes(a.variant)&&!a.l0!.redZones?.length)assert(l0Connected(a.l0!),`connected normal ${x},${y} ${a.l0!.baseRegion} ${a.variant}`)
}
const box=l0Layout(1,5,5,'maze').walls[0];assert(l0VisibleTo(box,{x:box.x,y:box.y,yaw:0}),'12m protection')

// Manila is a calm meeting space: stats still drain, but sanity never recovers.
function atWorld(x:number,y:number){const t=new Engine();t.seed=20261006;t.loadLevel(0,{mapSeed:t.seed,firstVisit:false});const inf=t.map!.inf!;t.player.x=x-inf.ox;t.player.y=y-inf.oy;t.updateInfiniteWindow();t.dev.god=false;t.dev.statLock=false;t.player.sanity=70;t.player.hunger=100;t.player.thirst=100;return t}
const manila=atWorld(592,16),beforeSanity=manila.player.sanity
updateSurvival(manila,1,{drain:1,dmg:1},0)
assert.equal(manila.player.sanity,beforeSanity,'Manila meeting does not restore sanity')
assert(manila.player.hunger<100&&manila.player.thirst<100,'Manila still drains hunger and thirst')
const edge=atWorld(584,16),ordinary=atWorld(13.5,25.7),warning=atWorld(486.5,27)
for(const t of [edge,ordinary,warning])updateSurvival(t,1,{drain:1,dmg:1},0)
assert(70-edge.player.sanity<70-ordinary.player.sanity,'meeting edge sanity loss is lower than ordinary yellow room')
assert(70-warning.player.sanity>70-ordinary.player.sanity,'red-room warning sanity loss is higher than yellow room')
const red=atWorld(500,5),redMap=red.map!;tickL0(red,.1);assert.equal(red.map,redMap);const redSanity=red.player.sanity;updateSurvival(red,1,{drain:1,dmg:1},0);assert(red.player.sanity<redSanity,'survival continues in the real red zone')
const warningOnly=atWorld(479,27);tickL0(warningOnly,.1);assert(!warningOnly.map!.inf!.l0?.trapped,'outside the perimeter is escapable')
const puddle=atWorld(395,14);assert.equal(floorHeight(puddle.map!,puddle.player.x,puddle.player.y),-.055,'shallow puddle geometry and collision have the same depth');assert.equal(floorHeight(puddle.map!,puddle.player.x+3,puddle.player.y),0,'dry floor retains original height')

const l1=new Engine();l1.loadLevel(1,{mapSeed:42,firstVisit:false});const exitsBefore=l1.map!.exits.length;placeBonusStairs(l1);assert.equal(l1.map!.exits.length,exitsBefore,'retired bonus stairs do not add an L1 exit');assert.equal(l1.bonusExit,null,'retired bonus stairs keep bonusExit empty')
const exit=manila.map!.exits.find(e=>Math.abs(e.x+manila.map!.inf!.ox-584.3)<.1)!;assert(exit,'Manila reliable exit exists');const mounted=l0WallMount(manila.map!,exit.x+.5,exit.y+.5);assert(mounted,'Manila reliable exit is mounted on an actual thin wall')
console.log('L0 state checks passed: save/load/migration, same-world sealing, no teleport, no duplication, immutable supplies, connectivity, observation safety.')

// Generation 1 -> 3 preserves progress and moves only drops covered by a new
// partition. A repeated restore must not duplicate or move the item again.
const updated=new Engine();updated.seed=7391;updated.loadLevel(0,{mapSeed:7391,firstVisit:false})
const updateSave=captureL0(updated)!,newChunk=genL0Architecture(updated.levelDef,7391,0,0)
const obstruction=newChunk.l0!.walls.find(w=>w.bottom===0&&Math.max(w.w,w.h)>2)!
assert(obstruction,'normal layout provides an obstruction fixture')
updateSave.generationVersion=1
const state=updateSave.chunks.find(([key])=>key==='0,0')![1]
state.extraItems.push({id:.871,type:'almond',x:obstruction.x+obstruction.w/2,y:obstruction.y+obstruction.h/2})
const takenBefore=updateSave.taken.slice(),searchBefore=structuredClone(state.structs)
updated.l0World=updateSave;restoreL0(updated)
assert.equal(updated.l0World?.generationVersion,3,'layout migration marked once')
assert.deepEqual(updated.l0World?.taken,takenBefore,'taken ledger survives migration')
assert.deepEqual(updated.l0World?.chunks.find(([key])=>key==='0,0')![1].structs,searchBefore,'container search state survives migration')
const moved=updated.map!.items.find(it=>it.id===.871)!;assert(moved,'drop survives migration')
const movedWorld={x:moved.x+updated.map!.inf!.ox,y:moved.y+updated.map!.inf!.oy}
assert(!newChunk.l0!.walls.some(w=>w.bottom<1.5&&movedWorld.x>w.x-.3&&movedWorld.x<w.x+w.w+.3&&movedWorld.y>w.y-.3&&movedWorld.y<w.y+w.h+.3),'migrated drop clears new walls')
updated.l0World=captureL0(updated);restoreL0(updated)
assert.equal(updated.map!.items.filter(it=>it.id===.871).length,1,'migration and reload do not duplicate drop')
const same=updated.map!.items.find(it=>it.id===.871)!
assert(Math.abs(same.x+updated.map!.inf!.ox-movedWorld.x)<1e-6&&Math.abs(same.y+updated.map!.inf!.oy-movedWorld.y)<1e-6,'generation 3 retains migrated coordinates')
console.log('L0 generation 3 migration checks passed')

// A v3 save from before the pillar merge can contain a drop in a new column.
const {legacyL0Region}=await import('../src/game/world/l0Regions')
let legacyColumn:{cx:number;cy:number;x:number;y:number}|undefined
for(let cy=-6;cy<=6&&!legacyColumn;cy++)for(let cx=-6;cx<=6&&!legacyColumn;cx++)if(legacyL0Region(7391,cx,cy)==='pillars'){
 const next=genL0Architecture(updated.levelDef,7391,cx,cy).l0!,old=l0Layout(7391,cx,cy,undefined,0,true)
 const w=next.walls.find(w=>!w.redZone&&w.bottom===0&&!old.walls.some(v=>w.x+w.w/2>v.x&&w.x+w.w/2<v.x+v.w&&w.y+w.h/2>v.y&&w.y+w.h/2<v.y+v.h))
 if(w)legacyColumn={cx,cy,x:w.x+w.w/2,y:w.y+w.h/2}
}
assert(legacyColumn)
const hall=new Engine();hall.seed=7391;hall.loadLevel(0,{mapSeed:7391,firstVisit:false})
hall.player.x=legacyColumn.x-hall.map!.inf!.ox;hall.player.y=legacyColumn.y-hall.map!.inf!.oy;hall.updateInfiniteWindow()
hall.map!.items.push({id:.873,type:'almond',x:legacyColumn.x-hall.map!.inf!.ox,y:legacyColumn.y-hall.map!.inf!.oy})
hall.l0World=captureL0(hall);assert.equal(hall.l0World!.generationVersion,3);restoreL0(hall)
const repaired=hall.map!.items.find(it=>it.id===.873)!,rp={x:repaired.x+hall.map!.inf!.ox,y:repaired.y+hall.map!.inf!.oy}
const repairedLayout=genL0Architecture(hall.levelDef,7391,legacyColumn.cx,legacyColumn.cy).l0!
assert(Math.hypot(rp.x-legacyColumn.x,rp.y-legacyColumn.y)>0,'buried v3 drop was not repaired')
assert(!repairedLayout.walls.some(w=>w.bottom<1.5&&w.top>0&&rp.x>w.x-.12&&rp.x<w.x+w.w+.12&&rp.y>w.y-.12&&rp.y<w.y+w.h+.12))
for(const z of repairedLayout.redZones??[])assert.equal(insideRedZone(z,rp.x,rp.y),insideRedZone(z,legacyColumn.x,legacyColumn.y),'repair crossed a red enclosure')
hall.l0World=captureL0(hall);restoreL0(hall)
assert.equal(hall.map!.items.filter(it=>it.id===.873).length,1)
const stableDrop=hall.map!.items.find(it=>it.id===.873)!
assert.equal(stableDrop.x+hall.map!.inf!.ox,rp.x);assert.equal(stableDrop.y+hall.map!.inf!.oy,rp.y)
const {l0RestoredDropPosition}=await import('../src/game/world/l0Architecture')
const narrowEnclosure={id:'repair-boundary-fixture',bounds:{x:legacyColumn.x-.75,y:legacyColumn.y-3,w:1.5,h:6},gates:[]}
const confined=l0RestoredDropPosition({...repairedLayout,redZones:[narrowEnclosure]},legacyColumn.x,legacyColumn.y)
assert(insideRedZone(narrowEnclosure,confined.x,confined.y),'nearest free point outside the enclosure must be rejected')
assert(Math.hypot(confined.x-legacyColumn.x,confined.y-legacyColumn.y)>0,'repair should find the safe point along the enclosure')
console.log('L0 merged hall restores a buried v3 drop once without duplication')
