import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { L11 } from '../src/game/levels/l11'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { clipping, area, bounds, intersects, inPolygon } from '../src/game/world/l11Geometry'
import { l11CityPlan, l11ChunkData, clearL11PlanCache, l11StairRect, l11CanalX } from '../src/game/world/l11Layout'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { L11_REFERENCE_LOTS } from '../src/game/world/l11ReferenceDistrict'
import { L11_REFERENCE_SEED } from '../src/game/world/l11ReferenceDistrict'
import { performance } from 'node:perf_hooks'
import * as THREE from 'three'
import { L11BuildingLOD } from '../src/game/renderer/l11BuildingLOD'
import { l11PropParts } from '../src/game/content/l11PropParts'
import { l11PropShape } from '../src/game/content/l11PropShapes'
import { l11PropGeometry } from '../src/game/renderer/l11PropGeometry'
import { l11ReferenceDetails } from '../src/game/world/l11ReferenceDetails'
import { l11BoxSolid, l11SolidCollider, l11SolidHits, transformL11Solid } from '../src/game/world/l11Solid'
import { l11FoliageGeometry } from '../src/game/renderer/l11FoliageGeometry'

const started=performance.now(),report={buildings:0,facadeProfiles:0,volumes:0,accessibleFloors:0,rooms:0,doors:0,stairs:0,chunks:0,shared:0,roadConnections:0,deterministic:0}
const p=l11CityPlan(L11_REFERENCE_SEED,0,0), lotKeys=new Set(L11_REFERENCE_LOTS.map(l=>l.key))
const refs=p.buildings.filter(b=>b.id.includes(':reference:'))
assert.equal(refs.length,L11_REFERENCE_LOTS.length)
const refsById=new Map(refs.map(b=>[b.id,b]))
for(const b of refs){
  assert(b.facadeProfile);assert(b.volumes.length>0);assert(b.floors>=3&&b.accessible>=1&&b.accessible<=3);assert(lotKeys.has(b.id.split(':').at(-1)!))
  assert(!clipping.difference(b.footprint,p.blocks.find(q=>q.id===b.blockId)!.polygon).some(q=>area(q)>.001),`building outside block ${b.id}`)
  report.buildings++;report.facadeProfiles++;report.volumes+=b.volumes.length
  const plan=l11InteriorPlan(b);assert(plan.floors.length===b.accessible)
  for(const f of plan.floors){assert(f.rooms.length>0);report.accessibleFloors++;report.rooms+=f.rooms.length;report.doors+=f.doors.length
    for(const r of f.rooms)for(const [x,y] of [[r.x+.01,r.y+.01],[r.x+r.w-.01,r.y+.01],[r.x+.01,r.y+r.h-.01],[r.x+r.w-.01,r.y+r.h-.01]])assert(inPolygon(x,y,b.localFootprint),`room ${r.id} outside`)
  }
  for(const s of b.stairs){assert(!clipping.difference(l11StairRect(s,.7),b.localFootprint).some(q=>area(q)>.001));report.stairs++}
}
for(let i=0;i<refs.length;i++)for(let j=i+1;j<refs.length;j++)assert(!clipping.intersection(refs[i].footprint,refs[j].footprint).some(q=>area(q)>.01),`reference overlap ${refs[i].id}/${refs[j].id}`)
for(const b of refs)for(const r of p.roads)assert(!clipping.intersection(b.footprint,r.polygon).some(q=>area(q)>.01),`building/road overlap ${b.id}`)
for(const b of refs)for(const c of p.canals)assert(!clipping.intersection(b.footprint,c.water).some(q=>area(q)>.01),`building/canal overlap ${b.id}`)
for(const b of refs){const details=l11ReferenceDetails(b),colliders=details.map(d=>l11SolidCollider(transformL11Solid(l11BoxSolid(d.x,d.y,d.z,d.w,d.h,d.d),b.ox,b.oy,b.angle,b.base)))
  for(const d of details){for(const n of [d.x,d.y,d.z,d.w,d.h,d.d])assert(Number.isFinite(n));assert(d.w>0&&d.h>0&&d.d>0);if(d.y-d.h/2>=2.5)continue
    const world=colliders[details.indexOf(d)].polygon;for(const r of p.roads){const overlap=Math.max(0,...clipping.intersection(world,r.polygon).map(q=>area(q)));assert(overlap<=.001,`detail/road ${b.id} ${d.x},${d.z} overlap=${overlap}`)}for(const c of p.canals)assert(!clipping.intersection(world,c.water).some(q=>area(q)>.001),`detail/canal ${b.id}`);for(const q of refs)if(q!==b)assert(!clipping.intersection(world,q.footprint).some(v=>area(v)>.001),`detail/building ${b.id}`)
  }
  const door=b.door,nx=Math.sin(b.doorAngle),nz=-Math.cos(b.doorAngle),hits=(sign:number)=>{for(let along=-1;along<=1;along+=.25)for(let y=.03;y<=2.35;y+=.3){const x=door[0]+nx*sign*.8+Math.cos(b.doorAngle)*along,z=door[1]+nz*sign*.8+Math.sin(b.doorAngle)*along;if(colliders.some(c=>l11SolidHits(c,x,z,.02,b.base+y,b.base+y+.02)))return true}return false};assert(!hits(1)&&!hits(-1),`door detail blockage ${b.id}`)
}
for(const [w,h,d] of [[1,1,1],[2,1.5,.8]] as const){const g=l11FoliageGeometry(w,h,d),pos=g.getAttribute('position'),uv=g.getAttribute('uv'),box=new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);assert(box.min.x>=-w&&box.max.x<=w&&box.min.y>=-h&&box.max.y<=h&&box.min.z>=-d&&box.max.z<=d);for(let i=0;i<pos.count;i++)for(const n of [pos.getX(i),pos.getY(i),pos.getZ(i),uv.getX(i),uv.getY(i)])assert(Number.isFinite(n));for(let i=0;i<uv.count;i++)assert(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);assert.strictEqual(l11FoliageGeometry(w,h,d),g)}
const reached=new Set([0]);for(let changed=true;changed;){changed=false;for(let j=0;j<p.roads.length;j++)if(!reached.has(j))for(const i of reached)if(intersects(p.roads[i].bounds,p.roads[j].bounds)&&clipping.intersection(p.roads[i].polygon,p.roads[j].polygon).some(q=>area(q)>.005)){reached.add(j);changed=true;break}}
assert.equal(reached.size,p.roads.length);report.roadConnections=reached.size
const below=l11CityPlan(L11_REFERENCE_SEED,0,1),canal=l11CanalX(L11_REFERENCE_SEED,0,1040)
for(const dx of [-8,8]){assert(p.canals.some(c=>c.water.some(q=>inPolygon(canal+dx,1039.99,q))));assert(below.canals.some(c=>c.water.some(q=>inPolygon(canal+dx,1040.01,q))))}
const chunkSet=new Set<string>();for(const b of refs){for(let cx=Math.floor(b.x/32);cx<=Math.floor((b.x+b.w)/32);cx++)for(let cy=Math.floor(b.y/32);cy<=Math.floor((b.y+b.depth)/32);cy++)chunkSet.add(`${cx},${cy}`)}
const first=new Map<string,string>();for(const key of chunkSet){const [cx,cy]=key.split(',').map(Number),d=l11ChunkData(L11_REFERENCE_SEED,cx,cy);for(const b of d.buildings)if(refsById.has(b.id)){const s=JSON.stringify(b);if(first.has(b.id))assert.equal(first.get(b.id),s);else first.set(b.id,s);report.shared++}report.chunks++}
clearL11PlanCache();for(const key of [...chunkSet].reverse()){const [cx,cy]=key.split(',').map(Number);l11ChunkData(L11_REFERENCE_SEED,cx,cy)}for(const b of refs){const now=JSON.stringify([...chunkSet].flatMap(key=>{const [cx,cy]=key.split(',').map(Number);return l11ChunkData(L11_REFERENCE_SEED,cx,cy).buildings}).find(q=>q.id===b.id));assert.equal(now,first.get(b.id))}
for(const [cx,cy] of [[8,12],[4,17],[23,29]]){const a=genL11ChunkRaw(L11,L11_REFERENCE_SEED,cx,cy),b=genL11ChunkRaw(L11,L11_REFERENCE_SEED,cx,cy),v=genL11ChunkRaw(L11,L11_REFERENCE_SEED,cx,cy,undefined,7);assert.deepEqual(a,b);for(const k of ['roads','buildings','tiles','exits','sid'] as const)if(k in a)assert.deepEqual(a[k],v[k],`revision ${k}`);report.deterministic++}
const lodBuilding=refs.find(b=>b.id.endsWith('brick-housing'))!
const lod=new L11BuildingLOD(lodBuilding),levels=[new THREE.Group(),new THREE.Group(),new THREE.Group()]
lod.addLevel(levels[0],0);lod.addLevel(levels[1],65);lod.addLevel(levels[2],150)
lod.position.set(lodBuilding.ox,lodBuilding.base,lodBuilding.oy);lod.rotation.y=-lodBuilding.angle
const camera=new THREE.PerspectiveCamera();camera.zoom=1
const checkLod=(target:L11BuildingLOD,x:number,z:number,expected:number)=>{camera.position.set(x,lodBuilding.base+2,z);camera.updateMatrixWorld();target.update(camera);assert.equal(target.getCurrentLevel(),expected,`LOD ${x},${z}`)}
const endX=lodBuilding.ox+lodBuilding.width,endZ=lodBuilding.oy+lodBuilding.depth
checkLod(lod,endX-.5,endZ-.5,0);checkLod(lod,endX+2,endZ+2,0);checkLod(lod,endX+80,endZ+2,1);checkLod(lod,endX+180,endZ+2,2)
const rotated=new L11BuildingLOD(lodBuilding),rotLevels=[new THREE.Group(),new THREE.Group(),new THREE.Group()],parent=new THREE.Group();rotated.addLevel(rotLevels[0],0);rotated.addLevel(rotLevels[1],65);rotated.addLevel(rotLevels[2],150);parent.add(rotated);parent.position.copy(lod.position);parent.rotation.y=Math.PI/2;parent.updateWorldMatrix(true,true);const rotatedEye=rotated.localToWorld(new THREE.Vector3(lodBuilding.width+80,2,lodBuilding.depth/2));checkLod(rotated,rotatedEye.x,rotatedEye.z,1)
const sedanParts=l11PropParts('l11_sedan'),cabin=sedanParts.find(p=>p.surface==='sealedglass'&&p.profile)!,profile=cabin.profile!
assert(profile.length>=4,'sedan profile points')
const top=profile.filter(([,y])=>y===Math.max(...profile.map(p=>p[1]))),bottom=profile.filter(([,y])=>y===Math.min(...profile.map(p=>p[1])));assert(top.length>=2&&bottom.length>=2)
const span=(v:[number,number][])=>Math.max(...v.map(p=>p[0]))-Math.min(...v.map(p=>p[0]));assert(span(top)<span(bottom),'sedan wedge taper')
const shaped=l11PropShape(cabin),position=shaped.geometry.getAttribute('position');for(let i=0;i<position.count;i++)for(const n of [position.getX(i),position.getY(i),position.getZ(i)])assert(Number.isFinite(n),'sedan finite geometry')
const indices=shaped.geometry.index?Array.from(shaped.geometry.index.array):Array.from({length:position.count},(_,i)=>i);assert(indices.length%3===0,'sedan triangles')
const point=(i:number)=>new THREE.Vector3(position.getX(i),position.getY(i),position.getZ(i));for(let i=0;i<indices.length;i+=3){const a=point(indices[i]),b=point(indices[i+1]),c=point(indices[i+2]);assert(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-10,'sedan triangle area')}
const boundsFor=(id:string)=>{const box=new THREE.Box3(),parts=l11PropParts(id);for(const part of parts){const shape=l11PropGeometry(part),pos=shape.geometry.getAttribute('position');for(let i=0;i<pos.count;i++)box.expandByPoint(new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(shape.matrix))}return box}
assert(boundsFor('l11_sedan').max.y<=1.52,'sedan full vehicle height');assert(boundsFor('l11_taxi').max.y<=1.72,'taxi full vehicle height')
const result={...report,elapsedMs:performance.now()-started};mkdirSync('reports/l11-reference',{recursive:true});writeFileSync('reports/l11-reference/static.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
