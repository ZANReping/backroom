import assert from 'node:assert/strict'
import { l11GroundPolygons } from '../src/game/renderer/l11Ground'
import { area, clipping, rectangle, strip } from '../src/game/world/l11Geometry'
import { l11ChunkData, l11CityPlan, l11VariantAt, l11World } from '../src/game/world/l11Layout'
import { L11 } from '../src/game/levels/l11'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { searchDevExit, exitDistance, l11BuildingExitInstance } from '../src/game/world/devExitSearch'
import type { GameMap } from '../src/game/world/mapgen'
const total=(p:ReturnType<typeof clipping.union>)=>p.reduce((n,p)=>n+area(p),0)
const cases=[]
for(const seed of [20261006,42,99173]){
  let checks=0
  for(let y=-1024;y<=1024&&checks<5;y+=128)for(let x=-1024;x<=1024&&checks<5;x+=128){
    if(l11VariantAt(seed,x,y)!=='park')continue
    const cx=Math.floor(x/32),cy=Math.floor(y/32),data=l11ChunkData(seed,cx,cy),raw=genL11ChunkRaw(L11,seed,cx,cy),domain=rectangle(x,y,32,32)
    const m={w:32,h:32,tint:raw.tint,inf:{ox:x,oy:y}} as GameMap,exclusions=data.buildings.map(b=>b.footprint)
    const ground=l11GroundPolygons(m,data,domain,exclusions),land=clipping.difference(domain,...data.canals.flatMap(c=>c.water),...exclusions)
    if(ground.grass.length&&ground.yard.length)assert(total(clipping.intersection(ground.grass,ground.yard))<.001,'grass and concrete overlap')
    assert(Math.abs(total(ground.grass)+total(ground.yard)-total(land))<.01,'ground coverage changed')
    if(ground.grass.length)for(const road of data.roads)for(let i=1;i<road.points.length;i++)assert(total(clipping.intersection(ground.grass,strip(road.points[i-1],road.points[i],road.width+6)))<.001,'grass overlaps pavement')
    cases.push({seed,x,y,grass:total(ground.grass),yard:total(ground.yard),polygons:ground.grass.length});checks++
  }
  assert(checks>0,'seed has no park sample')
}
// Match nearest exits against an exhaustive surrounding-region oracle. Include
// negative coordinates and a deliberately closer live exit in a later array slot.
const seed=20261006,buildings=[]
for(let my=-1;my<=1;my++)for(let mx=-1;mx<=1;mx++)buildings.push(...l11CityPlan(seed,mx,my).buildings)
for(const [x,y]of [[26.5,26.5],[-500,-400],[1100,300]])for(const kind of ['l11unfinisheddoor','l11liftshaft','l11brickdoor','l11officedoor']){
  const def=L11.exits.find(e=>e.kind===kind)!,expected=buildings.map(b=>l11BuildingExitInstance(b,def)).filter(e=>e!==null).sort((a,b)=>exitDistance(a,x,y)-exitDistance(b,x,y))[0]
  const search=searchDevExit({def:L11,seed,kind,x,y,z:0,live:[]});let next=search.next();while(!next.done)next=search.next()
  assert(next.value.complete&&next.value.exit,'missing nearest exit')
  assert.equal(next.value.exit.l11?.id,expected.l11?.id,'nearest search disagrees with complete region scan')
}
const def=L11.exits[0],near={def,x:-3,y:2,discovered:true},far={def,x:8,y:8,discovered:true}
const search=searchDevExit({def:L11,seed,kind:def.kind,x:0,y:0,z:0,live:[{cx:0,cy:0,exits:[far,near]}]});let next=search.next();while(!next.done)next=search.next()
assert.equal(next.value.exit,near,'uses first exit instead of nearest')
assert(buildings.some(b=>b.exit&&l11World(b,...b.exit.center)[0]<0),'negative-coordinate exits included')
console.log(JSON.stringify({ok:true,parks:cases,nearestChecks:13},null,2))
