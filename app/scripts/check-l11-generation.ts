import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { L11 } from '../src/game/levels/l11'
import { OUTPOST_LEVEL_DEFS } from '../src/game/levels'
import { l11CityPlan, l11ChunkData, l11Buildings, l11World, l11StairRect, l11TerrainHeight, l11CanalX, l11MetroRamp, clearL11PlanCache, L11_SPAWNS, L11_VERSION } from '../src/game/world/l11Layout'
import { clipping, area, bounds, intersects, inPolygon, segmentDistance } from '../src/game/world/l11Geometry'
import { l11WallSegments } from '../src/game/world/l11Collision'
import { generateLevel, floorHeight, bandOfPlayerZ, structBlocksCircle, structStandTopAt } from '../src/game/world/mapgen'
import { canOccupy } from '../src/game/core/player'
import { captureL11, restoreL11 } from '../src/game/engine/l11State'
import { updateInfinite } from '../src/game/world/infinite'
import type { Engine } from '../src/game/engine'

const started=performance.now(),times:number[]=[],report={plans:0,chunks:0,entrances:0,courtyardEntrances:0,stairs:0,rotated:0,bridges:0,shared:0,blockSpacingPairs:0,minBlockSpacing:Infinity,save:false}
const planCases=[[0,0],[-1,-1],[-2,0],[1,-1]] as const
for(const seed of [1,42,74911])for(const [mx,my] of planCases){
  const p=l11CityPlan(seed,mx,my);report.plans++
  assert.deepEqual(p.stages,['terrain','roads','blocks','buildings','alleys','dressing'])
  const below=l11CityPlan(seed,mx,my+1),right=l11CityPlan(seed,mx+1,my)
  assert.equal(p.boundary.south,below.boundary.north);assert.equal(p.boundary.east,right.boundary.west)
  const seam=p.bounds.y+1024,cx=l11CanalX(seed,mx,seam)
  for(const dx of [-8,0,8])assert(p.canals.some(c=>c.water.some(q=>inPolygon(cx+dx,seam-.002,q)))&&below.canals.some(c=>c.water.some(q=>inPolygon(cx+dx,seam+.002,q))),`water seam ${seed}:${mx}:${my} at ${cx+dx},${seam}`)
  // Every road joins the common graph, including waterfront and oblique collectors.
  const reached=new Set([0]);let changed=true
  while(changed){changed=false;for(let j=0;j<p.roads.length;j++)if(!reached.has(j))for(const i of reached){const a=p.roads[i],b=p.roads[j];if(intersects(a.bounds,b.bounds)&&clipping.intersection(a.polygon,b.polygon).some(q=>area(q)>.005)){reached.add(j);changed=true;break}}}
  assert.equal(reached.size,p.roads.length,`road graph ${seed}:${mx}:${my}`)
  for(const bridge of p.bridges){assert(clipping.intersection(bridge.polygon,p.canals.flatMap(c=>c.water)).length);assert(p.roads.some(r=>r.id===bridge.roadId));report.bridges++}
  for(let i=0;i<p.buildings.length;i++){
    const b=p.buildings[i]
    assert(b.accessible<=3&&b.accessible<=b.floors);assert.equal(b.sealed,b.accessible===0)
    for(let j=i+1;j<p.buildings.length;j++){const q=p.buildings[j];if(intersects(b,q))assert(!clipping.intersection(b.footprint,q.footprint).some(q=>area(q)>.01),`building overlap ${b.id} / ${q.id}`)}
    for(const st of b.stairs){assert(!clipping.difference(l11StairRect(st,.7),b.localFootprint).some(q=>area(q)>.01),'stair/landing inside footprint')}
  }
  for(let i=0;i<p.buildings.length;i++)for(let j=i+1;j<p.buildings.length;j++){
    const a=p.buildings[i],b=p.buildings[j];if(a.blockId!==b.blockId)continue
    const ringA=a.footprint[0],ringB=b.footprint[0];let nearest=Infinity
    for(const v of ringA.slice(0,-1))for(let k=1;k<ringB.length;k++)nearest=Math.min(nearest,segmentDistance(v[0],v[1],ringB[k-1],ringB[k]))
    for(const v of ringB.slice(0,-1))for(let k=1;k<ringA.length;k++)nearest=Math.min(nearest,segmentDistance(v[0],v[1],ringA[k-1],ringA[k]))
    assert(nearest>=3.95,`block spacing ${a.id} / ${b.id}: ${nearest}`);report.blockSpacingPairs++;report.minBlockSpacing=Math.min(report.minBlockSpacing,nearest)
  }
  const serial=JSON.stringify(p);clearL11PlanCache();l11CityPlan(seed,mx+1,my-1);assert.equal(JSON.stringify(l11CityPlan(seed,mx,my)),serial,'order-independent plan')
}
for(const seed of [1,42,74911])for(const [cx,cy] of [[-33,-1],[-1,0],[0,0],[1,2],[16,16],[32,32],[33,-1],[22,9]]){
  const t=performance.now(),a=genL11ChunkRaw(L11,seed,cx,cy);times.push(performance.now()-t)
  assert.deepEqual(genL11ChunkRaw(L11,seed,cx,cy),a,'deterministic raw')
  const changed=genL11ChunkRaw(L11,seed,cx,cy,undefined,7)
  for(const key of ['tiles','up','up2','dn','liquid','tint','stair','exits','l11'] as const)assert.deepEqual(a[key],changed[key],`revision preserves ${key}`)
  assert.deepEqual(a.structures.map(s=>[s.kind,s.x,s.y,s.data?.sid]),changed.structures.map(s=>[s.kind,s.x,s.y,s.data?.sid]))
  assert.equal(a.npcs.length,0);assert(a.tiles.every(t=>t===1||t===2));report.chunks++
  for(const s of a.structures)assert([s.x,s.y,s.w,s.h].every(Number.isFinite))
}
assert(!OUTPOST_LEVEL_DEFS[115],'Beta removed from active level directory')
const city=generateLevel(L11,42,false),inf=city.inf!,explored=new Uint8Array(city.w*city.h)
const move=(x:number,y:number)=>updateInfinite(city,L11,x-inf.ox,y-inf.oy,explored)
const free=(x:number,y:number,z=0)=>canOccupy(city,x-inf.ox,y-inf.oy,.32,{z,band:bandOfPlayerZ(city,z,x-inf.ox,y-inf.oy)})
for(const p of Object.values(L11_SPAWNS))assert(free(p.x,p.y),`safe spawn ${p.x},${p.y}`)
const samples=l11Buildings(42,16,16,1040,1040).filter(b=>!b.sealed)
for(const b of samples){
  move(b.door[0],b.door[1]);const nx=Math.sin(b.doorAngle),ny=-Math.cos(b.doorAngle)
  for(let t=-1.6;t<=1.6;t+=.2)assert(free(b.door[0]+nx*t,b.door[1]+ny*t,b.base),`entrance ${b.id} t=${t}`)
  report.entrances++
  for(const wall of l11WallSegments(b).filter(w=>w.entrance)){
    const mx=(wall.a[0]+wall.b[0])/2,my=(wall.a[1]+wall.b[1])/2,dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],len=Math.hypot(dx,dy)
    for(let t=-1.2;t<=1.2001;t+=.2){const [x,y]=l11World(b,mx-dy/len*t,my+dx/len*t);assert(free(x,y,b.base),`courtyard entrance ${b.id} t=${t}`)}
    report.courtyardEntrances++
  }
  for(const s of b.stairs){
    for(let t=.4;t<=s.length-.3;t+=.3){
      const [x,y]=l11World(b,s.x+(s.axis==='x'?t:s.width/2),s.y+(s.axis==='y'?t:s.width/2)),ramp=b.base+s.flight*3+t*3/s.length
      // The circular foot rests on the highest intersected real tread, not the
      // old centreline ramp (which places the body inside the next stair riser).
      const z=structStandTopAt(city,x-inf.ox,y-inf.oy,ramp+.15,bandOfPlayerZ(city,ramp,x-inf.ox,y-inf.oy))
      assert(z>=ramp-.02&&z<=ramp+.35,`stair tread height ${b.id} ${s.flight} ${t}: ${z}/${ramp}`)
      assert(free(x,y,z),`stair ${b.id} ${s.flight} ${t}`)
    }
    report.stairs++
  }
  if(b.angle){const live=city.structures.find(s=>s.l11?.id===b.id)!;for(const [x,y]of [[b.x+.15,b.y+.15],[b.x+b.w-.15,b.y+.15],[b.x+.15,b.y+b.h-.15]])if(!inPolygon(x,y,b.footprint)){assert(!structBlocksCircle({...city,structures:[live],inf:undefined},x-inf.ox,y-inf.oy,.04,b.base,0),'no rotated AABB airwall');report.rotated++;break}}
}
move(27.5,124)
for(let y=120.4;y<130;y+=.2){const z=l11MetroRamp(27.5,y)!;assert(free(27.5,y,z),`metro ramp ${y}`)}
for(let x=16.5;x<28;x+=.25)assert(free(x,132,-5),`metro platform ${x}`)
// A building remains the same live object after its first owning chunk leaves.
move(26.5,26.5);const archive=city.structures.find(s=>s.l11?.id==='l11:public-archive')!
for(const y of [58,90,122]){move(55,y);assert.equal(city.structures.find(s=>s.l11?.id==='l11:public-archive'),archive);assert.equal(city.structures.filter(s=>s.l11?.id==='l11:public-archive').length,1);report.shared++}
move(26.5,26.5)
const fixture={map:city,player:{level:11},explored,l11World:undefined} as unknown as Engine
const locker=city.structures.find(s=>s.kind==='locker')!,lockerId=locker.data!.sid
assert(locker);locker.looted=true;locker.data={...locker.data,lootItems:[],searched:1}
city.items.push({id:101,type:'almond',x:city.spawn.x,y:city.spawn.y});explored.fill(1)
const snapshot=JSON.parse(JSON.stringify(captureL11(fixture))),restored=generateLevel(L11,42,false)
const loaded={map:restored,player:{level:11},explored:new Uint8Array(restored.w*restored.h),l11World:snapshot} as unknown as Engine
restoreL11(loaded);restoreL11(loaded)
assert.equal(snapshot.version,2);assert.equal(restored.items.filter(i=>i.id===101).length,1);assert(restored.structures.find(s=>s.data?.sid===lockerId)?.looted)
assert(loaded.explored.every(v=>v===1));restored.inf!.cityClock=1
updateInfinite(restored,L11,800-restored.inf!.ox,800-restored.inf!.oy,loaded.explored);restored.inf!.state.clear();restored.inf!.cityClock=400
updateInfinite(restored,L11,26.5-restored.inf!.ox,26.5-restored.inf!.oy,loaded.explored)
assert(restored.structures.find(s=>s.data?.sid===lockerId)?.looted);report.save=true
assert.equal(floorHeight(city,26.5-inf.ox,26.5-inf.oy),l11TerrainHeight(42,26.5,26.5))
assert.equal(l11ChunkData(42,0,0).version,L11_VERSION)
times.sort((a,b)=>a-b)
const result={...report,elapsedMs:performance.now()-started,chunkMs:{mean:times.reduce((a,b)=>a+b,0)/times.length,p95:times[Math.floor(times.length*.95)],max:times.at(-1)}}
mkdirSync('reports/l11-remake',{recursive:true});writeFileSync('reports/l11-remake/generation-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
