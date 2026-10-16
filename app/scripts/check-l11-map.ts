import assert from 'node:assert/strict'
import { l11CityPlan, l11World, L11_VARIANT_NAMES } from '../src/game/world/l11Layout'
import { inPolygon } from '../src/game/world/l11Geometry'
import { L11_BUILDINGS } from '../src/game/content/l11Buildings'
import { L11_ROOM_NAMES } from '../src/game/world/l11Interiors'
import { retainL11MapPlans, readL11MapPlans, retryL11MapPlans, l11MapPlanStatus } from '../src/game/content/l11MapPlans'
import {
  L11_MAP_BUILDINGS, L11_MAP_DISTRICTS, fitL11Map, l11KnownRuns, l11MapContext, l11MapKnown,
  l11RoomMapColor, mapProject, mapUnproject, zoomMapView,
} from '../src/game/content/l11MapModel'
import type { Engine } from '../src/game/engine'
import { mapSight } from '../src/game/world/mapSight'

const close = (a:number,b:number,eps=1e-8) => assert(Math.abs(a-b)<eps, `${a} != ${b}`)
const pointClose = (a:[number,number],b:[number,number]) => { close(a[0],b[0]); close(a[1],b[1]) }

for (const view of [
  {x:-43.25,y:18.5,scale:.35,width:320,height:180},
  {x:7.1,y:-91.6,scale:2.75,width:640,height:480},
  {x:1024.5,y:-1024.25,scale:11,width:800,height:600},
]) for (const p of [[-100.25,55.5],[0,0],[17.75,-39.125]] as [number,number][]) {
  pointClose(mapUnproject(view,...mapProject(view,...p)),p)
  const anchor:[number,number] = [137.25,91.5]
  const worldBefore=mapUnproject(view,...anchor),zoomed=zoomMapView(view,view.scale*1.75,...anchor)
  pointClose(mapUnproject(zoomed,...anchor),worldBefore)
}

for (const def of L11_BUILDINGS) assert(L11_MAP_BUILDINGS[def.group], `missing map style for ${def.id}`)
for (const [variant,name] of Object.entries(L11_VARIANT_NAMES)) {
  const district=L11_MAP_DISTRICTS[variant as keyof typeof L11_MAP_DISTRICTS]
  assert(district?.label&&district.color, `missing district map style for ${variant}`)
  assert.equal(district.label,name,`district label mismatch for ${variant}`)
}
for (const kind of Object.keys(L11_ROOM_NAMES)) assert(l11RoomMapColor(kind as keyof typeof L11_ROOM_NAMES), `missing room color for ${kind}`)

const plan=l11CityPlan(20261006,0,0)
const buildings=plan.buildings
assert(buildings.length>0)
const liveBuildings=buildings.map(l11=>({l11,kind:'building',x:l11.x,y:l11.y,w:l11.w,h:l11.h}))
const city={
  map:{w:32,h:32,structures:liveBuildings,exits:[],items:[],inf:{ox:0,oy:0,explored:new Map<string,Uint8Array>(),chunks:new Map()}},
  explored:new Uint8Array(32*32),player:{level:11,x:0,y:0,z:0,floor:0},
} as unknown as Engine
const accessible=buildings.find(b=>!b.sealed&&b.accessible>0&&b.volumes.length>0)!
assert(accessible)
const volume=accessible.volumes[0]
const inside=l11World(accessible,volume.x+volume.w/2,volume.y+volume.d/2)
city.player.x=inside[0];city.player.y=inside[1];city.player.z=accessible.base+volume.lo+.4;city.player.floor=0
assert.equal(l11MapContext(city).kind,'interior')
assert.equal(l11MapContext(city).floor,0)
const upper=buildings.find(b=>!b.sealed&&b.accessible>1&&b.volumes.length>0)!
assert(upper,'expected an accessible multi-floor building')
const upperVolume=upper.volumes[0],upperPoint=l11World(upper,upperVolume.x+upperVolume.w/2,upperVolume.y+upperVolume.d/2)
city.player.x=upperPoint[0];city.player.y=upperPoint[1];city.player.floor=1;city.player.z=upper.base+3+upperVolume.lo+.4
assert.equal(l11MapContext(city).kind,'interior');assert.equal(l11MapContext(city).floor,1)
city.player.floor=0
city.player.z=accessible.base+accessible.accessible*3+10
assert.equal(l11MapContext(city).kind,'city','roof above accessible volume stays outdoors')
city.player.z=accessible.base+volume.lo+.4
const courtyard=buildings.find(b=>b.footprint.length>1)!
assert(courtyard,'expected a courtyard building')
const hole=courtyard.footprint[1].slice(0,-1)
const cx=hole.reduce((s,p)=>s+p[0],0)/hole.length,cy=hole.reduce((s,p)=>s+p[1],0)/hole.length
assert(!inPolygon(cx,cy,courtyard.footprint[0]),'courtyard sample must be outside solid footprint')
city.player.x=cx;city.player.y=cy;city.player.z=courtyard.base+.5
assert.equal(l11MapContext(city).kind,'city','courtyard hole must remain outdoors')
const sealed=buildings.find(b=>b.sealed)!
assert(sealed)
const sealedVolume=sealed.volumes[0],sealedPoint=l11World(sealed,sealedVolume.x+sealedVolume.w/2,sealedVolume.y+sealedVolume.d/2)
assert(inPolygon(sealedPoint[0],sealedPoint[1],sealed.footprint),'sealed sample must be inside footprint')
city.player.x=sealedPoint[0];city.player.y=sealedPoint[1];city.player.z=sealed.base+.5
assert.equal(l11MapContext(city).kind,'city','sealed building must not be enterable')
city.player.floor=-1
assert.deepEqual(l11MapContext(city),{kind:'metro',id:'metro',floor:-1,title:'地铁步行通道'})

city.player.floor=0
city.map!.inf!.ox=0;city.map!.inf!.oy=0
city.explored.fill(0);city.explored[2*32+3]=1
city.map!.inf!.chunks.set('0,0',{})
city.map!.inf!.explored.set('-1,-2',new Uint8Array(32*32))
city.map!.inf!.explored.get('-1,-2')![31*32+31]=1
const before=city.explored.slice(),history=city.map!.inf!.explored.get('-1,-2')!.slice()
assert(l11MapKnown(city,3,2));assert(l11MapKnown(city,-1,-33))
assert(!l11MapKnown(city,4,2));const knownRuns=l11KnownRuns(city,{x:-32,y:-64,w:40,h:64});assert(knownRuns.some(r=>r.y===-33&&r.x<=-1&&r.x+r.w>-1));assert(l11MapKnown(city,-1,-33))
assert.deepEqual(city.explored,before);assert.deepEqual(city.map!.inf!.explored.get('-1,-2'),history)

const rotated=buildings.find(b=>!b.sealed&&Math.abs(b.angle)>.1)!
assert(rotated&&Math.abs(rotated.angle)>.1,'expected a rotated accessible building')
const mapContext={kind:'interior' as const,id:rotated.id,floor:0,building:rotated,title:'test'}
const fitted=fitL11Map(city,mapContext,420,280)
for(const ring of rotated.footprint)for(const [x,y] of ring){const [px,py]=mapProject(fitted,x,y);assert(px>=-1&&px<=421&&py>=-1&&py<=281,`footprint outside fitted view: ${px},${py}`)}

// Worker construction failures are cached, retryable, and must not leak global state.
const workerDescriptor=Object.getOwnPropertyDescriptor(globalThis,'Worker')
let workerAttempts=0
const failingWorker=function(){workerAttempts++;throw new Error('test worker construction failure')}
const releasePlans=retainL11MapPlans()
try {
  Object.defineProperty(globalThis,'Worker',{configurable:true,writable:true,value:failingWorker})
  const remoteView={x:99*1024+16,y:-121*1024+16,w:32,h:32}
  const known=[remoteView]
  const first=readL11MapPlans(94727,remoteView,known)
  assert.equal(workerAttempts,1);assert.equal(first.error,false)
  const second=readL11MapPlans(94727,remoteView,known)
  assert.equal(workerAttempts,1);assert.equal(second.error,true);assert.equal(second.loading,false)
  retryL11MapPlans()
  const retried=readL11MapPlans(94727,remoteView,known)
  assert.equal(workerAttempts,2);assert.equal(retried.error,false)
} finally {
  releasePlans()
  if(workerDescriptor)Object.defineProperty(globalThis,'Worker',workerDescriptor)
  else delete (globalThis as {Worker?:unknown}).Worker
}
const released=l11MapPlanStatus()
assert.deepEqual(released,{clients:0,worker:false,pending:0,cached:0,failed:0})

// L11 sight regression: use only the public archive and its production
// building sight colliders, including the shared room/entrance aperture.
const archive=l11CityPlan(20261014,0,0).buildings.find(b=>b.id==='l11:public-archive')!
assert(archive,'public archive exists')
const archiveStructure:any={kind:'l11building',x:archive.x,y:archive.y,w:archive.w,h:archive.depth,solid:true,l11:archive,data:{}}
const sightMap:any={w:160,h:160,structures:[archiveStructure],exits:[],items:[],inf:{ox:0,oy:0,rev:1,explored:new Map(),chunks:new Map()}}
const sightEngine:any={map:sightMap,mapRev:1,time:0,level:11,player:{level:11,x:0,y:0,z:0,floor:0,crouching:false},explored:new Uint8Array(160*160)}
const westDoor=archive.doorAngle&&Math.sin(archive.doorAngle)<-.7?archive:archive
const outward=[Math.sin(westDoor.doorAngle),-Math.cos(westDoor.doorAngle)] as [number,number]
assert(outward[0]<-.7,'archive west door faces west')
const door=westDoor.door
const central=(yaw:number)=>{sightEngine.time++;const sight=mapSight(sightEngine,yaw),i=Math.floor(sight.points.length/2),p=sight.points[i];return Math.hypot(p.x,p.y)}
const eastYaw=Math.atan2(-1,0)
const doorOutside:[number,number]=[door[0]+outward[0]*3,door[1]+outward[1]*3]
// Player z is feet height; mapSight adds the 1.55m eye offset itself.
sightEngine.player.x=doorOutside[0];sightEngine.player.y=doorOutside[1];sightEngine.player.z=archive.base;sightEngine.player.floor=0
assert(central(eastYaw)>8,'west entrance ray passes through real door opening')
const wallOutside:[number,number]=[door[0]+outward[0]*3,door[1]+4]
sightEngine.player.x=wallOutside[0];sightEngine.player.y=wallOutside[1]
assert(central(eastYaw)<8,'west exterior wall blocks sight')
sightEngine.player.z=archive.base+archive.floors*3+4
assert(central(eastYaw)>8,'roof-height sight does not reuse low-eye obstacle')
const shift=32
sightEngine.player.z=archive.base;sightEngine.player.x+=shift;sightEngine.player.y+=shift;archiveStructure.x+=shift;archiveStructure.y+=shift;sightMap.inf.rev++;sightEngine.time++
const translatedSight=central(eastYaw);assert(translatedSight<8,`translated exterior wall keeps relative sight result: ${translatedSight}`)

console.log(`L11 map checks passed: ${buildings.length} buildings, ${Object.keys(L11_ROOM_NAMES).length} room colors, negative chunks and interior contexts verified`)
