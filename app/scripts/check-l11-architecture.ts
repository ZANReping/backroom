import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
import { l11CityPlan,l11ChunkData,l11SpaceAt,l11SurfaceAt,l11World,l11VolumePolygon,clearL11PlanCache } from '../src/game/world/l11Layout'
import { l11ArchitectureVolumes } from '../src/game/content/l11Architecture'
import { l11QuayWing } from '../src/game/world/l11QuayWing'
import { L11_REFERENCE_LOTS,L11_REFERENCE_SEED } from '../src/game/world/l11ReferenceDistrict'
import { l11ReferenceDetails } from '../src/game/world/l11ReferenceDetails'
import { l11VerticalSignMount } from '../src/game/world/l11VerticalSignMounts'
import { l11EntranceFrame,l11EntranceSurface } from '../src/game/world/l11Entrance'
import { l11BridgeDeck,l11StreetHeight,l11BridgePiers,L11_BRIDGE_TOP_LIFT } from '../src/game/world/l11Hydrology'
import { l11SolidHits } from '../src/game/world/l11Solid'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { l11RoomFixtures } from '../src/game/world/l11RoomFurnishing'
import { clipping,area,inPolygon } from '../src/game/world/l11Geometry'
import { ShapeUtils,Vector2 } from 'three'
import {l11Shopfront} from '../src/game/world/l11Shopfront'
import {l11ShopSigns,l11ShopSignSolids} from '../src/game/world/l11ShopSigns'
import {l11WallSegments,l11BuildingColliders} from '../src/game/world/l11Collision'
import {l11BoxSolid,l11SolidCollider,transformL11Solid} from '../src/game/world/l11Solid'
import {l11RetailBays,l11RetailPiers} from '../src/game/world/l11RetailFacade'
import {l11QuayPlanting} from '../src/game/world/l11QuayPlanting'
import {l11Twins} from '../src/game/world/l11Twins'

const report={seeds:[42,7391,-17,20261006],buildings:0,recipes:{} as Record<string,number>,facadeProfiles:{} as Record<string,number>,architectures:{} as Record<string,number>,normalGlazedEntrance:false,mounts:{} as Record<string,number>,twins:0,arches:0,piers:0,stairs:0,gardens:0,quayBeds:0,determinism:0,examples:[] as unknown[]}
for(const seed of report.seeds)for(const [mx,my]of [[0,0],[-1,-1],[1,0]]){
  const plan=l11CityPlan(seed,mx,my)
  for(const b of plan.buildings){report.buildings++;if(b.facadeProfile)report.facadeProfiles[b.facadeProfile]=(report.facadeProfiles[b.facadeProfile]??0)+1;if(b.architecture)report.architectures[b.architecture]=(report.architectures[b.architecture]??0)+1;if(b.architecture==='glazed-terrace'&&b.entrance)report.normalGlazedEntrance=true;if(b.sourceRecipe){report.recipes[b.sourceRecipe]=(report.recipes[b.sourceRecipe]??0)+1;if(report.recipes[b.sourceRecipe]===1)report.examples.push({seed,mx,my,recipe:b.sourceRecipe,id:b.id,x:b.door[0],y:b.door[1]})}
    const mount=l11VerticalSignMount(b)
    if(mount){const k=mount.spec.id+':'+b.verticalSign!.mount;report.mounts[k]=(report.mounts[k]??0)+1;assert(mount.y-mount.spec.height/2>=3,'clear street headroom');assert(l11ReferenceDetails(b).some(p=>p.y===mount.y&&p.h===mount.spec.height))}
    if(b.architecture==='ribbon-twins'){
      report.twins++;const inner=b.volumes.filter(v=>v.faceProfiles),connector=b.volumes.find(v=>v.soffit)!
      assert.equal(inner.length,2);assert(connector&&connector.lo===b.floors*3-3)
      const q=l11Twins(b.width,b.depth,b.front),u0=q.local(connector.x,connector.y)[0],u1=q.local(connector.x+connector.w,connector.y+connector.d)[0]
      assert(q.gap>=2,'actual air gap between towers')
      assert(!b.volumes.some(v=>v.facadeProfile==='glazed-core'),'no freestanding blue third tower')
      assert(Math.abs(Math.min(u0,u1)-q.start)<.001&&Math.abs(Math.max(u0,u1)-q.end)<.001,'roof connector actually reaches both towers')
      assert.equal(inner[0].faceProfiles![q.inwardFirst],'glazed-core');assert.equal(inner[1].faceProfiles![q.inwardSecond],'glazed-core')
      const door=q.local(...b.doorLocal);assert(Math.abs(door[0]-(q.start+q.gap/2))<.001&&Math.abs(door[1])<.001,'twins entry faces the street below the connector')
    }
    if(b.entrance){
      if(b.entrance.gardens)report.gardens++
      report.stairs++;const {point}=l11EntranceFrame(b),e=b.entrance
      let last=-Infinity
      for(let k=0;k<=30;k++){
        const uv=point(0,e.run*(1-k/30)),world=l11World(b,...uv),h=l11EntranceSurface(b,...world)!
        assert(h>=last-1e-5);last=h
        const d=l11ChunkData(seed,Math.floor(world[0]/32),Math.floor(world[1]/32));assert(d.buildings.some(q=>q.id===b.id),'steps retain building across chunk seam')
        assert(Math.abs(l11SpaceAt(d,...world,0,h).height-h)<.001)
      }
      assert(Math.abs(last-b.base)<.001)
      const frame=l11EntranceFrame(b)
      for(const bed of l11QuayPlanting(b)){
        const u=(bed.x-b.doorLocal[0])*frame.tx+(bed.z-b.doorLocal[1])*frame.ty,out=(bed.x-b.doorLocal[0])*frame.nx+(bed.z-b.doorLocal[1])*frame.ny,halfSpan=(Math.abs(frame.tx)*bed.w+Math.abs(frame.ty)*bed.d)/2,halfDepth=(Math.abs(frame.nx)*bed.w+Math.abs(frame.ny)*bed.d)/2
        assert(Math.abs(u)-halfSpan>=e.width/2+.79,'continuous planting stays beside the stair, including rotated lots')
        assert(out-halfDepth>=.24&&out+halfDepth<=e.run,'bed is inside the entrance setback')
        const crown=l11ReferenceDetails(b).find(p=>p.surface==='grass'&&p.solid===false&&p.x===bed.x&&p.z===bed.z&&p.w>bed.w-.4&&p.d>bed.d-.4)
        assert(crown,'whole bed receives continuous, non-solid foliage')
        assert(crown.y-crown.h/2<bed.bottom+.705,'leaf crown overlaps the planting surface instead of floating')
        assert(!clipping.intersection(bed.footprint,b.footprint).some(p=>area(p)>.001),'bed stays outside the building')
        report.quayBeds++
      }
    }
  }
  for(const bridge of plan.bridges){
    const a=bridge.arch!;assert(a);const rings=bridge.polygon.map(r=>r.slice(0,-1).map(p=>new Vector2(...p))),points=rings.flat()
    // A merged crossing can be L-shaped: its bounding-box centre need not be
    // over the deck. Sample the actual polygon's triangles, including joins.
    for(const tri of ShapeUtils.triangulateShape(rings[0],rings.slice(1))){
      const [u,v,w]=tri.map(i=>points[i]);if(Math.abs((v.x-u.x)*(w.y-u.y)-(v.y-u.y)*(w.x-u.x))<1e-6)continue
      const world:[number,number]=[tri.reduce((s,i)=>s+points[i].x/3,0),tri.reduce((s,i)=>s+points[i].y/3,0)],data=l11ChunkData(seed,Math.floor(world[0]/32),Math.floor(world[1]/32)),deck=l11BridgeDeck(data)
      const top=l11SpaceAt(data,...world,0,10).height;assert(Math.abs(top-l11StreetHeight(data,...world))<.015,JSON.stringify({seed,id:bridge.id,world,top,sampled:l11StreetHeight(data,...world)}))
      assert(deck.colliders.some(c=>l11SolidHits(c,...world,.01,top+L11_BRIDGE_TOP_LIFT-.2,top+L11_BRIDGE_TOP_LIFT-.1)),JSON.stringify({seed,id:bridge.id,world,top}))
    }
    report.arches++;for(const p of l11BridgePiers(seed,bridge)){report.piers++;assert(p.top>p.bottom);assert(area(p.polygon)>.1);assert(!clipping.difference(p.polygon,a.deck??[bridge.polygon]).some(q=>area(q)>.001))}
  }
  const before=JSON.stringify(plan);clearL11PlanCache();l11CityPlan(seed,mx+1,my);l11CityPlan(seed,mx,my-1);assert.equal(JSON.stringify(l11CityPlan(seed,mx,my)),before);report.determinism++
}
assert.deepEqual(L11_REFERENCE_LOTS.map(l=>l.key).filter(k=>!report.recipes[k]),[],'every showcase building recipe also occurs in normal worlds')
assert.equal(Object.keys(report.mounts).length,8,'four sign faces in both wall and blade mounts')
assert(report.gardens>0,'large stairs and fenced gardens also occur in normal worlds')
assert(report.quayBeds>0,'continuous waterfront planting also occurs in normal worlds')
assert(report.facadeProfiles['bronze-curtain']>0,'bronze-curtain facade occurs in normal worlds')
assert(report.architectures['glazed-terrace']>0,'glazed-terrace architecture occurs in normal worlds')
assert(report.normalGlazedEntrance,'a normal glazed-terrace building has a walkable entrance')
assert(report.facadeProfiles['green-curtain']>0,'dense green-grey curtain occurs in normal worlds')
assert(report.architectures['quay-service-wing']>0,'asymmetric quayside architecture occurs in normal worlds')
const showcase=l11CityPlan(L11_REFERENCE_SEED,0,0),shop=showcase.buildings.find(b=>b.sourceRecipe==='west-piers'&&b.id.includes(':reference:'))!,hall=showcase.buildings.find(b=>b.id.endsWith(':reference:east-stone'))!
const annex=showcase.buildings.find(b=>b.id.endsWith(':reference:quay-west-annex'))!
for(const front of ['n','s','e','w'] as const){
  const volumes=l11ArchitectureVolumes('quay-service-wing',annex.width,annex.depth,annex.floors,front),polys=volumes.map(l11VolumePolygon),b={...annex,front,sealed:true,accessible:0,stairs:[],angle:.31,base:0,volumes,localFootprint:clipping.union(polys[0],...polys.slice(1))[0]}
  const q=l11QuayWing(b.width,b.depth,front),u=q.wing+.2+q.stair-.425,v=q.projection/2,y=3
  assert.equal(volumes[0].facadeProfile,'service-wall');assert.equal(volumes[1].facadeProfile,'green-curtain')
  assert(!inPolygon(...q.point(u,v),b.localFootprint),'stair recess is outside the interior envelope')
  const parts=l11ReferenceDetails(b);for(const p of parts.filter(p=>p.y>=0&&p.y<b.floors*3))assert(p.x-p.w/2>=-.15&&p.z-p.d/2>=-.15&&p.x+p.w/2<=b.width+.15&&p.z+p.d/2<=b.depth+.15,'stair flights and landings stay inside the reserved lot')
  const [x,z]=l11World(b,...q.point(u,v)),solids=l11BuildingColliders({kind:'l11building',x:b.x,y:b.y,w:b.w,h:b.h,solid:true,l11:b})
  assert(solids.some(s=>l11SolidHits(s,x,z,.01,y-.19,y-.01)),'external landing blocks feet and head from both sides')
  assert(!solids.some(s=>l11SolidHits(s,x,z,.01,y+.2,y+1.8)),'real headroom on the external landing')
}
const pedestrian=showcase.roads.filter(r=>r.class==='waterfront');assert(pedestrian.length===2&&pedestrian.every(r=>r.pedestrian),'reference waterfront is pedestrian')
for(const x of [726,794]){const s=l11SurfaceAt(L11_REFERENCE_SEED,x,860,undefined,showcase);assert.equal(s.kind,'sidewalk');assert.equal(s.marking,false)}
assert.equal(l11SurfaceAt(L11_REFERENCE_SEED,726,816,undefined,showcase).kind,'road','motor crossing overrides promenade surface')
assert.equal(l11SurfaceAt(L11_REFERENCE_SEED,726,816,undefined,{...showcase,roads:[...showcase.roads].reverse()}).kind,'road','surface classification does not depend on road order')
let ordinaryPromenades=0,ordinaryQuays=0
for(const seed of [42,7391,-17,20261006])for(const mx of [-1,0,1]){
  const a=l11CityPlan(seed,mx,-1).roads.filter(r=>r.class==='waterfront'),b=l11CityPlan(seed,mx,0).roads.filter(r=>r.class==='waterfront')
  assert.deepEqual(a.map(r=>!!r.pedestrian),b.map(r=>!!r.pedestrian),'traffic policy continuous across canal macro boundaries')
  for(const r of b)r.pedestrian?ordinaryPromenades++:ordinaryQuays++
}
assert(ordinaryPromenades>0&&ordinaryQuays>0,'both pedestrian and motor quays occur outside showcase seeds')
assert.equal(hall.archetype,'fin-office');assert.equal(hall.facadeProfile,'bronze-curtain');assert.equal(hall.architecture,'glazed-terrace');assert(hall.entrance&&hall.entrance.width>=20&&hall.entrance.run>=6&&hall.entrance.gardens)
const ribbon=showcase.buildings.find(b=>b.id.endsWith(':reference:east-ribbon'))!;assert.equal(ribbon.facadeProfile,'sandstone-grid');assert.equal(ribbon.verticalSign?.id,'pegasus');assert.equal(ribbon.verticalSign?.mount,'flush')
assert(l11InteriorPlan(shop).floors[0].rooms.some(r=>r.kind==='shop'))
for(const key of ['retail_gondola','retail_checkout','retail_cooler'])assert(l11RoomFixtures(shop).some(p=>p.roomKind==='shop'&&p.key===key),'retail program includes '+key)
const store=l11Shopfront(shop)!,floor=l11InteriorPlan(shop).floors[0]
assert(store.available,'corner shop is a furnished, accessible tenant')
const cornerRoom=floor.rooms.find(r=>r.kind==='shop'&&Math.abs(r.x-store.x)<.01&&Math.abs(r.y-store.y)<.01)!
assert(cornerRoom&&floor.doors.some(d=>d.from===cornerRoom.id&&d.to==='street'),'corner tenant has its own street door')
assert(l11WallSegments(shop).some(w=>w.entrance&&Math.hypot((w.a[0]+w.b[0])/2-store.door[0],(w.a[1]+w.b[1])/2-store.door[1])<.001),'shop exterior door agrees with collision facade')
for(const front of ['e','s','w','n'] as const){
  const b={...shop,front},signs=l11ShopSigns(b),round=signs.filter(p=>p.spec.shape==='circle')
  const corner=l11Shopfront(b)!,projection=b.width>50?1.8:1.1
  const [wx,wy]=l11World(b,corner.corner[0]+(corner.east?1:-1)*projection*.6,corner.corner[1]+(corner.south?1:-1)*projection*.6)
  const canopy=l11BuildingColliders({kind:'l11building',x:b.x,y:b.y,w:b.w,h:b.h,solid:true,l11:b})
  assert(canopy.some(c=>l11SolidHits(c,wx,wy,.01,b.base+2.96,b.base+3.08)),'canopy wraps the outside corner without a missing square')
  assert(!canopy.some(c=>l11SolidHits(c,wx,wy,.01,b.base+.1,b.base+2.7)),'corner canopy keeps the pavement clear underneath')
  assert.equal(signs.length,3,'two fascias and one projecting round board');assert.equal(round.length,1)
  const q=round[0],normal=front==='e'?[1,0]:front==='w'?[-1,0]:front==='s'?[0,1]:[0,-1]
  assert(Math.abs(Math.sin(q.angle)*normal[0]+Math.cos(q.angle)*normal[1])<1e-6,'round sign plane is perpendicular to its actual building face')
  const solid=l11SolidCollider(l11ShopSignSolids(b)[signs.indexOf(q)])
  assert(l11SolidHits(solid,q.x,q.z,.001,q.y-.02,q.y+.02),'round face centre blocks')
  const tangent=[Math.cos(q.angle),-Math.sin(q.angle)],cx=q.x+tangent[0]*q.spec.width*.47,cz=q.z+tangent[1]*q.spec.width*.47
  assert(!l11SolidHits(solid,cx,cz,.001,q.y+q.spec.height*.46,q.y+q.spec.height*.48),'round sign corners do not create a square air wall')
}
// Ground retail piers are architectural details, not a facade-only visual
// effect. Check representative sides and both sides of the corner shop.
for(const front of ['e','s','w','n'] as const){
  const b={...shop,front,angle:.37},piers=l11RetailPiers(b),details=l11ReferenceDetails(b)
  assert(piers.length>0,`retail piers on ${front}`)
  for(const p of piers){
    const d=details.find(q=>Math.abs(q.x-p.x)<.001&&Math.abs(q.z-p.z)<.001&&Math.abs(q.w-p.w)<.001&&Math.abs(q.d-p.d)<.001)
    assert(d&&Math.abs(d.h-2.94)<.001,`retail pier detail matches ${front}`)
    const [wx,wz]=l11World(b,p.x,p.z),pierCollider=l11SolidCollider(transformL11Solid(l11BoxSolid(p.x,1.47,p.z,p.w,2.94,p.d),b.ox,b.oy,b.angle,b.base))
    assert(l11SolidHits(pierCollider,wx,wz,.01,b.base+.1,b.base+2.84),`retail pier body blocks ${front}`)
    assert(!l11SolidHits(pierCollider,wx,wz,.01,b.base+3.04,b.base+3.14),`retail pier top clears ${front}`)
  }
  const doors=[b.doorLocal,l11Shopfront(b)?.door].filter((p):p is [number,number]=>!!p)
  const pierColliders=piers.map(p=>l11SolidCollider(transformL11Solid(l11BoxSolid(p.x,1.47,p.z,p.w,2.94,p.d),b.ox,b.oy,b.angle,b.base)))
  for(const door of doors){
    const outward=Math.abs(door[0])<.01?[-1,0]:Math.abs(door[0]-b.width)<.01?[1,0]:Math.abs(door[1])<.01?[0,-1]:[0,1]
    for(const side of [-.8,.8]){const [wx,wz]=l11World(b,door[0]+outward[0]*side,door[1]+outward[1]*side);assert(!pierColliders.some(c=>l11SolidHits(c,wx,wz,.01,b.base+.15,b.base+2.7)),`retail doorway channel clear ${front}`)}
  }
}
for(const axis of ['x','y'] as const)for(const reverse of [false,true]){
  const extent=axis==='x'?shop.width:shop.depth,split=extent*.43
  const point=(t:number):[number,number]=>axis==='x'?[reverse?extent-t:t,0]:[0,reverse?extent-t:t]
  const whole=l11RetailBays(shop,point(0),point(extent)),first=l11RetailBays(shop,point(0),point(split)),second=l11RetailBays(shop,point(split),point(extent))
  const unique=(v:number[])=>[...new Set(v.map(v=>Math.round(v*1e6)/1e6))].sort((a,b)=>a-b)
  assert.deepEqual(unique(first.flatMap(v=>[v.l,v.r]).concat(second.flatMap(v=>[v.l+split,v.r+split]))),unique(whole.flatMap(v=>[v.l,v.r])),`retail bay grid survives non-module ${axis} split, reverse=${reverse}`)
}
const bounds=(s:{vertices:[number,number,number][]})=>{const xs=s.vertices.map(v=>v[0]),ys=s.vertices.map(v=>v[1]),zs=s.vertices.map(v=>v[2]);return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys),z0:Math.min(...zs),z1:Math.max(...zs)}}
for(const front of ['e','s','w','n'] as const){const b={...shop,front},piers=l11RetailPiers(b),pierBoxes=piers.map(p=>bounds(transformL11Solid(l11BoxSolid(p.x,1.47,p.z,p.w,2.94,p.d),b.ox,b.oy,b.angle,b.base))),signs=l11ShopSigns(b),rects=signs.map((s,i)=>({s,box:bounds(transformL11Solid(l11ShopSignSolids(b)[i],b.ox,b.oy,b.angle,b.base))})).filter(v=>v.s.spec.shape!=='circle');for(const sign of rects)for(const pier of pierBoxes)assert(!(sign.box.x0<pier.x1&&sign.box.x1>pier.x0&&sign.box.y0<pier.y1&&sign.box.y1>pier.y0&&sign.box.z0<pier.z1&&sign.box.z1>pier.z0),`rectangular fascia overlaps pier ${front}`)}
const twins=showcase.buildings.find(b=>b.id.endsWith(':reference:quay-east-near'))!,link=twins.volumes.find(v=>v.soffit)!
assert(twins.entrance&&twins.entrance.width>=28,'broad waterside steps')
assert(Math.abs(twins.doorLocal[1]-twins.depth*.67)<.001,'entrance aligned with the recess below the rooftop link')
assert(!l11ReferenceDetails(twins).some(p=>p.h===6&&p.w===.72),'no uniform right-bank colonnade')
const solids=l11BuildingColliders({kind:'l11building',x:twins.x,y:twins.y,w:twins.w,h:twins.h,solid:true,l11:twins}),[cx,cy]=l11World(twins,link.x+link.w/2,link.y+link.d/2)
assert(solids.some(s=>l11SolidHits(s,cx,cy,.01,link.lo-.16,link.lo-.04)),'roof link has a physical panelled underside')
assert(!solids.some(s=>l11SolidHits(s,cx,cy,.01,link.lo-2,link.lo-1)),'clear air beneath the roof link')
for(const b of showcase.buildings.filter(b=>b.id.includes(':reference:')))for(const other of showcase.buildings)if(b!==other)assert(!clipping.intersection(b.footprint,other.footprint).some(p=>area(p)>.001),'showcase/ordinary building overlap')
mkdirSync('reports/l11-reference/architecture',{recursive:true});writeFileSync('reports/l11-reference/architecture/static.json',JSON.stringify({ok:true,...report},null,2));console.log(JSON.stringify(report,null,2))
