import assert from 'node:assert/strict'
import { mkdir,writeFile } from 'node:fs/promises'
import { l11CanalX,l11CityPlan,l11ChunkData,l11SpaceAt } from '../src/game/world/l11Layout'
import { l11QuayRailPlacements } from '../src/game/world/l11QuayRails'
import { l11CanalAccess } from '../src/game/world/l11CanalAccess'
import { l11MetroParts,l11MetroColliders,l11MetroRampHeight } from '../src/game/world/l11Metro'
import type { Structure } from '../src/game/core/types'
import { L11_REFERENCE_SEED } from '../src/game/world/l11ReferenceDistrict'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { L11 } from '../src/game/levels/l11'
import { L11_WATER_SURFACE,L11_WATER_DEPTH,L11_CANAL_BED,L11_BRIDGE_THICKNESS,l11CanalAt,l11BridgeDeck } from '../src/game/world/l11Hydrology'
import { l11SolidHits,l11SolidSurface } from '../src/game/world/l11Solid'
import { circlePolygon } from '../src/game/world/l11Geometry'

const close=(a:number,b:number)=>assert(Math.abs(a-b)<.0001,`${a} != ${b}`)
const report={samples:0,bridgePrisms:0,negative:0,seams:0,rawWaterTiles:0,quayModules:0,quayChunkSamples:0,ordinaryStone:0,ordinaryMetal:0,ladders:0,outlets:0,accessChunks:0,metroWalls:0,waterDepth:L11_WATER_DEPTH,anchors:[] as unknown[]}
close(L11_WATER_DEPTH,5);close(L11_WATER_SURFACE-L11_CANAL_BED,L11_WATER_DEPTH)
for(const seed of [20261006,7391])for(const stripe of [-1,0])for(const y of [-1008.01,-1007.99,15.99,16.01,527.8,528.2,558,1023.99,1024.01,1039.99,1040.01]){
  const x=l11CanalX(seed,stripe,y),data=l11ChunkData(seed,Math.floor(x/32),Math.floor(y/32)),w=l11CanalAt(data,x,y)
  assert(w,'Canal missing');close(w.surface,L11_WATER_SURFACE);close(w.bottom,L11_CANAL_BED)
  const below=l11SpaceAt(data,x,y,-1,L11_CANAL_BED)
  close(below.height,L11_CANAL_BED);assert(below.walkable,'Canal bed incorrectly treated as inaccessible metro')
  report.samples++;if(x<0||y<0)report.negative++;if(Math.abs(y-Math.round(y/16)*16)<.02)report.seams++
  const deck=l11BridgeDeck(data)
  for(const b of deck.colliders){
    const v=b.volume.vertices,x=(v[0][0]+v[1][0]+v[2][0])/3,y=(v[0][2]+v[1][2]+v[2][2])/3
    const top=l11SolidSurface(b,x,y,0),bottom=l11SolidSurface(b,x,y,0,false)
    close(top-bottom,L11_BRIDGE_THICKNESS)
    assert(l11SolidHits(b,x,y,0,bottom+.01,top-.01),'Slab not solid')
    assert(!l11SolidHits(b,x,y,0,bottom-.4,bottom-.01),'Air below slab is blocked')
    assert(!l11SolidHits(b,x,y,0,top+.01,top+1),'Air above slab is blocked')
    assert(data.bridges.some(q=>circlePolygon(x,y,.0002,q.polygon)),`Bridge collider outside crossing: ${seed}/${x},${y}`)
    report.bridgePrisms++
  }
  if(seed===20261006&&stripe===0)report.anchors.push({x,y,bridge:w.bridge})
}
const seed=20261006,y=558,x=l11CanalX(seed,0,y),raw=genL11ChunkRaw(L11,seed,Math.floor(x/32),Math.floor(y/32))
for(let i=0;i<1024;i++)if(raw.liquid![i]===1){close(raw.seaFloor![i],-L11_CANAL_BED);close(raw.terrain![i],L11_CANAL_BED);report.rawWaterTiles++}
assert(report.rawWaterTiles>0);assert(report.bridgePrisms>0)
for(const seed of [L11_REFERENCE_SEED,42,7391,-17])for(const mx of [-1,0]){
  const ids=new Set<string>()
  for(const my of [-1,0]){
    const plan=l11CityPlan(seed,mx,my)
    for(const canal of plan.canals){
      const rails=l11QuayRailPlacements(seed,canal,plan.roads,plan.bounds.y-32,plan.bounds.y+1056)
      const access=l11CanalAccess(seed,canal,plan.roads,plan.bounds.y,plan.bounds.y+1024)
      for(const p of access){
        const ladder=p.key==='canal_ladder';ladder?report.ladders++:report.outlets++
        const dx=p.landX-p.x,dy=p.landY-p.y,len=Math.hypot(dx,dy)
        assert(Math.sin(p.angle)*dx/len-Math.cos(p.angle)*dy/len<-.999,'ladder/outlet front faces water')
        if(ladder)assert(!rails.some(r=>r.side===p.side&&Math.hypot(r.x-p.x,r.y-p.y)<2.8),'rail blocks ladder access')
        const cx=Math.floor(p.x/32),cy=Math.floor(p.y/32),data=l11ChunkData(seed,cx,cy)
        const local=data.canals.flatMap(c=>l11CanalAccess(seed,c,data.roads,cy*32-2,cy*32+34)).find(q=>q.id===p.id)
        assert.deepEqual(local,p,'access station agrees between macro and owning chunk')
        if(report.accessChunks%13===0){const raw=genL11ChunkRaw(L11,seed,cx,cy);assert.equal(raw.structures.filter(s=>s.data?.instanceId===p.id).length,1,'access station streams exactly once')}
        report.accessChunks++
      }
      for(const [i,rail]of rails.entries()){
        assert(!ids.has(rail.id),'no duplicate stone pier at a macro boundary');ids.add(rail.id)
        assert(rail.y>=plan.bounds.y&&rail.y<plan.bounds.y+plan.bounds.h,'no extrapolated rail outside its macro domain')
        assert.equal(rail.kind,canal.pedestrian?'quay_balustrade':'canal_railing')
        report.quayModules++
        if(seed!==L11_REFERENCE_SEED)rail.kind==='quay_balustrade'?report.ordinaryStone++:report.ordinaryMetal++
        if(i%53!==0)continue
        const cx=Math.floor(rail.x/32),cy=Math.floor(rail.y/32),data=l11ChunkData(seed,cx,cy)
        const local=data.canals.flatMap(c=>l11QuayRailPlacements(seed,c,data.roads,cy*32,cy*32+32)).find(r=>r.id===rail.id)
        assert.deepEqual(local,rail,'near/chunk and distant/macro placement agree')
        const raw=genL11ChunkRaw(L11,seed,cx,cy),placed=raw.structures.filter(s=>s.data?.instanceId===rail.id)
        assert.equal(placed.length,1,'module generated exactly once in its owning chunk')
        assert.equal(placed[0].kind,'l11_'+rail.kind);report.quayChunkSamples++
      }
    }
  }
}
assert(report.ordinaryStone>0&&report.ordinaryMetal>0,'both stone and metal railing variants occur in ordinary seeds')
assert(report.ladders>0&&report.outlets>0,'both bank accessories occur in ordinary generation')
for(const origin of [[26,120],[-486,-392],[538,632]]){
  const [x,y]=origin,top=l11MetroRampHeight(x+1.5,y,seed)!,s:Structure={kind:'l11subway',x,y,w:3,h:10,solid:true,data:{ground:top}}
  const parts=l11MetroParts(s),colliders=l11MetroColliders(s)
  close(l11MetroRampHeight(x+1.5,y+10,seed)!,-5)
  for(let i=0;i<2;i++){const p=parts[i],c=colliders[i];for(const z of [-4.8,-3,-1,.3])assert(l11SolidHits(c,x+1.5+p.x,y+5,.1,z,z+.2),'retaining wall missing collision at '+z);close(c.top,p.y+p.h/2);close(c.bottom,p.y-p.h/2);report.metroWalls++}
}
await mkdir('reports/l11-waterways',{recursive:true});await writeFile('reports/l11-waterways/static.json',JSON.stringify({ok:true,...report},null,2));console.log(JSON.stringify(report,null,2))
