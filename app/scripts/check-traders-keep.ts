import assert from 'node:assert/strict'
import {performance} from 'node:perf_hooks'
import {createTradersMap,generateTradersChunk,streamTradersWorld,ensureTradersAt,syncTradersResidents,captureTradersWorld,restoreTradersWorld,tradersHomes} from '../src/game/world/tradersWorld'
import {TRADERS_BOUNDS,TRADERS_ROOMS,TRADERS_VAULT_CELLS,TRADERS_DOORS,TRADERS_SERVICES,TRADERS_CARGO_SLOTS,TRADERS_SPAWN,tradersContains,tradersCeilingAt} from '../src/game/content/tradersLayout'
import {tradersFurnishingsForChunk} from '../src/game/content/tradersFurnishings'
import {createTradersResident} from '../src/game/content/tradersPeople'
import {levelDefOf} from '../src/game/levels'
import {enableRuntimeStructCollisionIndex,ceilingHeightAt} from '../src/game/world/mapgen'
import {canOccupy} from '../src/game/core/player'
import {factionState} from '../src/game/engine/factionMissions'
import {freshCareer,route} from '../src/game/engine/career'
import {migrateBntg,advanceVault,updateBntg,bntgDoorAllowed,performBntgAction} from '../src/game/engine/bntg'
import {tradersIrradiance,tradersStaticVisibility} from '../src/game/renderer/tradersBakedLighting'
import type {Engine} from '../src/game/engine'
const start=performance.now(),def=levelDefOf(102)!,m=createTradersMap(def,424242)
assert.equal(TRADERS_BOUNDS.w,420);assert.equal(TRADERS_BOUNDS.h,276)
assert.equal(TRADERS_VAULT_CELLS.length,128);assert.equal(TRADERS_DOORS.length,128)
assert.equal(TRADERS_ROOMS.filter(r=>r.kind==='shop').length,28)
assert.equal(TRADERS_ROOMS.filter(r=>r.kind==='anchor').length,4)
assert.equal(m.traders!.chunks.size,0);assert.equal(m.npcs!.length,0)
assert.equal(m.traders!.homes.length,160);assert.equal(new Set(m.traders!.homes.map(h=>h.id)).size,160)
assert.deepEqual(tradersHomes(424242),tradersHomes(424242));assert.deepEqual(tradersHomes(424242),tradersHomes(123),'authored duty and seat anchors are stable across appearance seeds')
assert.deepEqual(createTradersResident(99,424242),createTradersResident(99,424242))
for(let i=0;i<154;i++){const {def:n}=createTradersResident(i,424242);assert(!n.trade&&!n.barter&&!n.warehouse,'no new shops via crowd NPCs')}
const all=[]
for(let cy=0;cy<9;cy++)for(let cx=0;cx<14;cx++){
 const a=tradersFurnishingsForChunk(cx,cy);assert.deepEqual(a,tradersFurnishingsForChunk(cx,cy),'deterministic props');all.push(...a)
 for(const s of a){assert([s.x,s.y,s.w,s.h].every(Number.isFinite));assert(tradersContains({x:cx*32,y:cy*32,w:32,h:32},s.x+s.w/2,s.y+s.h/2));assert(s.w>0&&s.h>0)}
}
assert.equal(new Set(all.map(s=>s.data!.tradersId)).size,all.length,'no duplicated seam furniture')
for(const s of all){const room=TRADERS_ROOMS.find(r=>String(s.data!.tradersId).startsWith(r.id+'.'));if(room){assert(s.x>=room.x&&s.y>=room.y&&s.x+s.w<=room.x+room.w&&s.y+s.h<=room.y+room.h,'furniture within '+room.id);assert(!['shop','anchor'].includes(room.kind))}}
assert.equal(all.filter(s=>s.kind==='trade_car').length,1)
assert(all.filter(s=>s.data?.tradersProp==='cafe_table').length>=60)
assert(canOccupy(m,TRADERS_SPAWN.x,TRADERS_SPAWN.y,.32,{z:.02,band:0}))
for(const d of TRADERS_DOORS){const door=m.structures.find(s=>s.data?.tradersId===d.id)!;door.data!.open=1;door.solid=false}
enableRuntimeStructCollisionIndex(m)
// Walk a body all the way through every real opening, including adjoining office rooms.
for(const r of TRADERS_ROOMS){
 const x=r.side==='w'?r.x:r.side==='e'?r.x+r.w:r.x+r.w/2,y=r.side==='n'?r.y:r.side==='s'?r.y+r.h:r.y+r.h/2
 const dx=r.side==='w'||r.side==='e'?1:0,dy=1-dx
 for(let t=-.8;t<=.81;t+=.2)assert(canOccupy(m,x+dx*t,y+dy*t,.30,{z:.02,band:0}),'blocked doorway '+r.id+' '+t)
}
for(const r of TRADERS_ROOMS){const x=r.x+r.w/2,y=r.y+r.h/2;assert(Math.abs(ceilingHeightAt(m,x,y,4.8,0)-tradersCeilingAt(x,y))<.001,'ceiling '+r.id)}
// A full-layout navigation audit is test-only: runtime never does this upfront.
const nav=createTradersMap(def,424242)
for(let cy=0;cy<9;cy++)for(let cx=0;cx<14;cx++)generateTradersChunk(nav,cx,cy)
for(const d of nav.structures)if(d.data?.tradersDoor){d.solid=false;d.data!.open=1}
enableRuntimeStructCollisionIndex(nav)
const seen=new Set<number>(),walk=new Int8Array(nav.w*nav.h),q=[Math.floor(TRADERS_SPAWN.y)*nav.w+Math.floor(TRADERS_SPAWN.x)]
const free=(i:number)=>{if(!walk[i])walk[i]=canOccupy(nav,i%nav.w+.5,Math.floor(i/nav.w)+.5,.3,{z:.02,band:0})?1:-1;return walk[i]>0}
seen.add(q[0])
for(let head=0;head<q.length;head++){
 const i=q[head],x=i%nav.w,y=Math.floor(i/nav.w)
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const nx=x+dx,ny=y+dy,j=ny*nav.w+nx
  if(nx<1||ny<1||nx>=nav.w-1||ny>=nav.h-1||seen.has(j)||!free(j))continue
  if(![.25,.5,.75].every(t=>canOccupy(nav,x+.5+dx*t,y+.5+dy*t,.3,{z:.02,band:0})))continue
  seen.add(j);q.push(j)
 }
}
for(const r of TRADERS_ROOMS){
 const reachable=[...seen].some(i=>tradersContains(r,i%nav.w+.5,Math.floor(i/nav.w)+.5))
 assert(reachable,'furnished room reachable from west gate '+r.id)
}
// State is independent of detail-window lifetime.
const cell=TRADERS_VAULT_CELLS[0],door=m.structures.find(s=>s.data?.room===cell.id)!
door.data!.open=1
const c=generateTradersChunk(m,Math.floor(cell.x/32),Math.floor(cell.y/32))!
const changed=c.details.find(s=>s.data?.tradersId);if(changed)changed.looted=true
const save=captureTradersWorld(m)!,restored=createTradersMap(def,424242);restoreTradersWorld(restored,save)
const restoredDoor=restored.structures.find(s=>s.data?.room===cell.id)!
assert.equal(restoredDoor.data!.open,1);assert.equal(restoredDoor.solid,false);assert(canOccupy(restored,restoredDoor.x+restoredDoor.w/2,restoredDoor.y,.3,{z:.02,band:0}))
if(changed){const cc=generateTradersChunk(restored,c.cx,c.cy)!;assert(cc.details.find(s=>s.data!.tradersId===changed.data!.tradersId)!.looted)}
const eng={seed:424242,career:freshCareer(),rep:{bntg:20},map:m,player:{level:102,x:TRADERS_SPAWN.x,y:TRADERS_SPAWN.y},npcs:[],knownNpcs:[],msg(){}} as unknown as Engine
for(const [x,y] of [[9,109],[214,174],[370,252],[24,220],[214,109]]){
 eng.player.x=x;eng.player.y=y
 for(let i=0;i<30;i++){streamTradersWorld(m,x,y,2);syncTradersResidents(eng,true)}
 assert(m.traders!.chunks.size<70,'bounded detail window');assert(eng.npcs.length<=32,'bounded active crowd')
}
assert(m.traders!.definitions.size<160,'remote residents remain definitions-free until approached')
assert.equal(new Set(m.traders!.base.filter(s=>s.data?.cargoId!==undefined).map(s=>s.data!.cargoId)).size,3)
factionState(eng,'bntg')
const career=route(eng,'bntg');career.joined=true;career.task=4;career.rank=1;career.active=true
const b=migrateBntg(eng),before=structuredClone(b.vault);eng.paused=true;updateBntg(eng,100);assert.deepEqual(b.vault,before)
eng.paused=false;advanceVault(b.vault,91,eng.seed);advanceVault(b.vault,5,eng.seed);assert.equal(new Set(b.vault.slots).size,3);assert(b.vault.slots.every(i=>TRADERS_CARGO_SLOTS[i]))
assert(bntgDoorAllowed(eng,door),'temporary ordinary cell permit')
assert(!bntgDoorAllowed(eng,m.structures.find(s=>s.data?.room==='storage_5')!),'secure access stays restricted')
career.task=1;career.work=0
const scale=m.structures.find(s=>s.data?.facility&&(s.data.services as string[])?.includes('inspect'))!
eng.player.x=scale.x+scale.w/2;eng.player.y=scale.y+scale.h/2
const cargo=m.structures.find(s=>s.data?.manifest==='TH-001')!;cargo.data!.seal='BROKEN';assert.match(performBntgAction(eng,'package'),/封签不符/)
assert(TRADERS_SERVICES.every(s=>m.structures.some(p=>p.data?.tradersId==='service_'+s.id)))
const beforeChunks=m.traders!.chunks.size
for(const x of [31.999,32,32.001,63.999,64.001]){const light=tradersIrradiance(x,.02,109,0,1,0);assert(light.every(Number.isFinite))}
const a=tradersIrradiance(31.999,.02,109,0,1,0),bake=tradersIrradiance(32.001,.02,109,0,1,0);assert(Math.max(...a.map((v,i)=>Math.abs(v-bake[i])))<.005)
assert.equal(m.traders!.chunks.size,beforeChunks,'baking does not load neighbours')
assert(!tradersStaticVisibility(10,1,20,10,1,3),'outer wall blocks light')
ensureTradersAt(restored,TRADERS_SPAWN.x,TRADERS_SPAWN.y,6)
console.log(JSON.stringify({ok:true,elapsedMs:performance.now()-start,walkableConnectedCells:seen.size,rooms:TRADERS_ROOMS.length,cells:128,shops:28,anchors:4,props:all.length,tables:all.filter(s=>s.data?.tradersProp==='cafe_table').length,homes:160,maxActive:32,peakChunks:m.traders!.peakChunks,cpuChunkMaxMs:m.traders!.maxCpuMs},null,2))
