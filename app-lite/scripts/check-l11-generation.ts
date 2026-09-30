import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { L11 } from '../src/game/levels/l11'
import { l11Buildings, l11Door, l11MetroRamp, L11_SPAWNS } from '../src/game/world/l11Layout'
import { generateLevel, floorHeight, bandOfPlayerZ } from '../src/game/world/mapgen'
import { canOccupy } from '../src/game/core/player'
import { LBETA } from '../src/game/levels/l115'
import { captureL11, restoreL11 } from '../src/game/engine/l11State'
import { updateInfinite } from '../src/game/world/infinite'
import type { Engine } from '../src/game/engine'
const times:number[]=[]
for(const seed of [1,42,74911])for(let cy=-4;cy<=4;cy++)for(let cx=-4;cx<=4;cx++){
  const t=performance.now(), a=genL11ChunkRaw(L11,seed,cx,cy);times.push(performance.now()-t)
  const b=genL11ChunkRaw(L11,seed,cx,cy)
  assert.deepEqual(a,b,`determinism ${seed}:${cx},${cy}`)
  const changed=genL11ChunkRaw(L11,seed,cx,cy,undefined,7)
  for(const key of ['tiles','up','up2','dn','liquid','tint','stair','exits'] as const)assert.deepEqual(a[key],changed[key],`cosmetic revision preserves ${key}`)
  assert.deepEqual(a.structures.filter(s=>s.kind==='l11building'),changed.structures.filter(s=>s.kind==='l11building'))
  assert(a.entities.length<=1);assert(a.tiles.every(t=>t===1||t===2))
  for(const s of a.structures)assert(Number.isFinite(s.x)&&Number.isFinite(s.y))
}
for(const seed of [1,42,74911])for(const p of Object.values(L11_SPAWNS)){
  const cx=Math.floor(p.x/32),cy=Math.floor(p.y/32),r=genL11ChunkRaw(L11,seed,cx,cy),i=Math.floor(p.y-cy*32)*32+Math.floor(p.x-cx*32)
  assert.equal(r.tiles[i],1,`safe spawn ${seed} ${p.x},${p.y}`);assert.equal(r.liquid![i],0)
  assert(!r.structures.some(s=>s.solid&&p.x>=s.x&&p.x<s.x+s.w&&p.y>=s.y&&p.y<s.y+s.h),'spawn collision')
}
const buildings=l11Buildings(42,-128,-128,256,256)
assert(buildings.some(b=>b.sealed&&b.floors>=10));assert(buildings.some(b=>b.accessible>=2))
for(const b of buildings){
  const door=l11Door(b),c=genL11ChunkRaw(L11,42,Math.floor(door.x/32),Math.floor(door.y/32))
  const i=((door.y%32+32)%32)*32+(door.x%32+32)%32
  if(!b.sealed)assert.equal(c.tiles[i],1,`door aperture ${b.id}`)
}
assert.equal(l11MetroRamp(27,40),0);assert.equal(l11MetroRamp(27,49),-4.5)
assert.equal(L11.infinite,true)
const city=generateLevel(L11,42,false)
assert(city.inf);assert.equal(city.inf.chunks.size,25);assert(city.floors>=2);assert(city.hasUnderground)
for(const p of Object.values(L11_SPAWNS))assert(canOccupy(city,p.x-city.inf.ox,p.y-city.inf.oy,.32,{z:0}),`live safe ${p.x},${p.y}`)
assert(city.structures.some(s=>s.kind==='l11subway'))
for(let y=40;y<50;y+=.2){const x=27.5-city.inf.ox,ly=y-city.inf.oy,z=floorHeight(city,x,ly);assert(canOccupy(city,x,ly,.24,{z,band:bandOfPlayerZ(city,z)}),`metro passable at ${y},${z}`)}
const beta=generateLevel(LBETA,42,false)
assert.equal(beta.floors,2);assert.equal(beta.exits.find(e=>e.def.kind==='basebeta')?.floor,1)
for(let x=40;x<56;x+=.25)assert(canOccupy(beta,x,44.5,.24,{z:3,band:1}),`Beta bridge ${x}`)
assert.equal(beta.npcs?.find(n=>n.id==='l11_archivist')?.floor,1)
assert.equal(beta.lights.filter(l=>l.z===0).length,8);assert.equal(beta.lights.filter(l=>l.z===3).length,8)
// Save without shifting first: newly dropped items/lights and explored pixels must survive.
const fixture={map:city,player:{level:11},explored:new Uint8Array(city.w*city.h),l11World:undefined} as unknown as Engine
const locker=city.structures.find(s=>s.kind==='locker')!,door=city.structures.find(s=>s.kind==='hoteldoor')!
const lockerId=locker.data!.sid,doorId=door.data!.sid
locker.looted=true;locker.data={...locker.data,lootItems:[],searched:1};door.data!.open=1;door.solid=false
city.items.push({id:101,type:'almond',x:city.spawn.x,y:city.spawn.y})
city.lights.push({x:city.spawn.x,y:city.spawn.y,z:0,r:3,color:'#fff',flickerSeed:0})
fixture.explored.fill(1)
const snapshot=JSON.parse(JSON.stringify(captureL11(fixture)))
const restored=generateLevel(L11,42,false),loaded={map:restored,player:{level:11},explored:new Uint8Array(restored.w*restored.h),l11World:snapshot} as unknown as Engine
restoreL11(loaded);restoreL11(loaded) // Restoration must be idempotent.
assert.equal(restored.items.filter(i=>i.id===101).length,1)
assert.equal(restored.lights.filter(l=>!l.gen).length,1)
assert.equal(restored.structures.find(s=>s.data?.sid===doorId)?.solid,false)
assert(restored.structures.find(s=>s.data?.sid===lockerId)?.looted)
assert(loaded.explored.every(v=>v===1))
// Evict detailed chunk state: the permanent compact loot ledger must still prevent refill.
restored.inf!.cityClock=1
updateInfinite(restored,L11,800-restored.inf!.ox,800-restored.inf!.oy,loaded.explored)
restored.inf!.state.clear();restored.inf!.cityClock=400
updateInfinite(restored,L11,26.5-restored.inf!.ox,26.5-restored.inf!.oy,loaded.explored)
assert(restored.structures.find(s=>s.data?.sid===lockerId)?.looted)
assert.deepEqual(restored.structures.find(s=>s.data?.sid===lockerId)?.data?.lootItems,[])
times.sort((a,b)=>a-b)
console.log(JSON.stringify({chunks:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1),buildings:buildings.length},null,2))
