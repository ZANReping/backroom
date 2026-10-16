import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'
import { loadImage } from '@napi-rs/canvas'
import { access } from 'node:fs/promises'
import { L11_BUILDINGS } from '../src/game/content/l11Buildings'
import { L11_DECOR_DEFS } from '../src/game/content/l11Decor'
import { L11_VERTICAL_SIGNS } from '../src/game/content/l11VerticalSigns'
import { L11_INSPECTED_SIGNS } from '../src/game/content/l11ReferenceSigns'
import { DECOR_REGISTRY } from '../src/game/content/decorRegistry'
import { l11PropParts } from '../src/game/content/l11PropParts'
import { l11PropGeometry } from '../src/game/renderer/l11PropGeometry'
import { buildL11Building, buildL11Structure, buildL11TerrainJob, buildL11DistantCity } from '../src/game/renderer/l11Meshes'
import { CityBatch } from '../src/game/renderer/l11Batch'
import { addL11Sign } from '../src/game/renderer/l11Signs'
import { L11_SIGNS, L11_SIGN_IDS, L11_BUILDING_SIGNS, l11StreetSign } from '../src/game/content/l11Signs'
import { l11Material,l11UnfinishedConcrete } from '../src/game/renderer/l11Materials'
import { addL11ExitParts } from '../src/game/renderer/l11Exits'
import { l11Buildings } from '../src/game/world/l11Layout'
import { l11World } from '../src/game/world/l11Layout'
import { l11QuayPlanting } from '../src/game/world/l11QuayPlanting'
import { l11BuildingColliders } from '../src/game/world/l11Collision'
import { l11SolidSurface } from '../src/game/world/l11Solid'
import { L11_REFERENCE_SEED } from '../src/game/world/l11ReferenceDistrict'
import { referenceFacade } from '../src/game/renderer/l11ReferenceFacades'
import { rectangle,transform } from '../src/game/world/l11Geometry'
import type { L11FacadeProfile } from '../src/game/world/l11ReferenceDistrict'
import { generateLevel } from '../src/game/world/mapgen'
import { L11 } from '../src/game/levels/l11'
Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128) } })

const start=performance.now(), disposed=new Set<THREE.BufferGeometry>(), materials=new Set<string>(), textures=new Set<string>(), report={buildings:0,decor:0,signs:0,geometryMeshes:0,triangles:0,timingsMs:{} as Record<string,number>,resources:{disposedGeometry:0},bounds:{} as Record<string,number[]>,uniqueMaterials:0,uniqueTextures:0}
assert.equal(L11_SIGNS.length,32); assert.equal(L11_SIGN_IDS.size,32+L11_INSPECTED_SIGNS.length)
for(const ids of Object.values(L11_BUILDING_SIGNS))for(const id of ids)assert(L11_SIGN_IDS.has(id),`building sign ${id}`)
for(const f of L11_SIGNS){assert(f.uv.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&f.uv[0]<f.uv[2]&&f.uv[1]<f.uv[3],`${f.id} UV`);await access('assets/l11-signage/'+f.source)}
for(let i=0;i<L11_SIGNS.length;i++)for(let j=i+1;j<L11_SIGNS.length;j++){const a=L11_SIGNS[i].uv,b=L11_SIGNS[j].uv;assert(a[2]<=b[0]||b[2]<=a[0]||a[3]<=b[1]||b[3]<=a[1],`sign atlas overlap ${L11_SIGNS[i].id}/${L11_SIGNS[j].id}`)}
await access('public/textures/L11-ASSET-SOURCES.md'); const high=await loadImage('public/textures/l11_signs.png'),low=await loadImage('public/textures/l11_signs_low.png'); assert.equal(high.width,4096);assert.equal(high.height,2048);assert.equal(low.width,2048);assert.equal(low.height,1024)
assert.equal(L11_BUILDINGS.length,32); assert.equal(new Set(L11_BUILDINGS.map(x=>x.id)).size,32)
assert.equal(L11_VERTICAL_SIGNS.length,4)
for(const sign of L11_VERTICAL_SIGNS){
  await access(sign.source)
  const image=await loadImage('public/textures/'+sign.albedo),small=await loadImage('public/textures/'+sign.lowAlbedo)
  assert(image.width>0&&image.height>image.width&&small.width<image.width&&small.height<image.height,`${sign.id} vertical quality tiers`)
  for(const name of [sign.normal,sign.roughness]){const channel=await loadImage('public/textures/'+name);assert.equal(channel.width,image.width,`${sign.id} channel width`);assert.equal(channel.height,image.height,`${sign.id} channel height`)}
}
assert.equal(L11_DECOR_DEFS.length,108); assert.equal(new Set(L11_DECOR_DEFS.map(x=>x.id)).size,108)
for(const [k,n] of Object.entries({municipal:20,commerce:25,waterfront:18,service:15,interior:30}))assert.equal(L11_DECOR_DEFS.filter(x=>x.category===k).length,n,k)
for(const d of L11_DECOR_DEFS){assert.equal(DECOR_REGISTRY.filter(x=>x.id===d.id).length,1,d.id);const parts=l11PropParts(d.id);assert(parts.length>0,d.id);for(const p of parts){for(const v of [p.x,p.y,p.z,p.w,p.h,p.d])assert(Number.isFinite(v),`${d.id} finite`);const {geometry,matrix}=l11PropGeometry(p);geometry.computeBoundingBox();const extent=geometry.boundingBox!.clone().applyMatrix4(matrix).getSize(new THREE.Vector3());if(d.id!=='l11_ceiling_light')assert(extent.x<=d.w*4&&extent.z<=d.d*4&&extent.y<=Math.max(.15,d.height*4),`${d.id} transformed part bounds`)}}report.decor=108
for(const k of ['concrete','asphalt','brick','plaster','tile','metal','wood','grass','glass','sealedglass'] as const)l11Material(k)
// The L1 concrete scan must retain metre scale on both near and transformed
// distant geometry without changing the maps shared by ordinary city concrete.
{
  const base=l11Material('concrete'),reuse=l11UnfinishedConcrete(),near=new THREE.Group(),far=new THREE.Group(),a=new CityBatch(),b=new CityBatch(),shift=new THREE.Matrix4().makeTranslation(83,2,-71).multiply(new THREE.Matrix4().makeRotationY(.37))
  const parts=[{x:2,y:4,z:3,w:4,h:8,d:.5,surface:'concrete' as const}]
  addL11ExitParts(a,parts,undefined,true);addL11ExitParts(b,parts,shift,true);a.finish(near);b.finish(far)
  assert.equal(reuse.map,base.map);assert.equal(reuse.normalMap,base.normalMap);assert.equal(reuse.roughnessMap,base.roughnessMap)
  assert.equal(reuse.normalScale.x,.24);assert.equal(reuse.roughness,.86);assert.equal(base.map!.repeat.x,.5,'city texture repeat not mutated')
  const n=(near.children[0] as THREE.Mesh).geometry,f=(far.children[0] as THREE.Mesh).geometry,p=n.attributes.position,norm=n.attributes.normal,uv=n.attributes.uv,v=new THREE.Vector3()
  assert.deepEqual(Array.from(uv.array),Array.from(f.attributes.uv.array),'near/far concrete UV agreement')
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(shift);assert(v.distanceTo(new THREE.Vector3().fromBufferAttribute(f.attributes.position,i))<.0001);const top=Math.abs(norm.getY(i))>.55,xFace=Math.abs(norm.getX(i))>Math.abs(norm.getZ(i));assert(Math.abs(uv.getX(i)*reuse.map!.repeat.x-(top?p.getX(i):xFace?p.getZ(i):p.getX(i))*.32)<.00001);assert(Math.abs(uv.getY(i)*reuse.map!.repeat.y-(top?p.getZ(i):p.getY(i))*.32)<.00001)}
  n.dispose();f.dispose()
}
function inspect(root:THREE.Object3D, name='model', requireLod=false){const box=new THREE.Box3().setFromObject(root);assert(!box.isEmpty(),`${name} bounds nonempty`);for(const v of [...box.min.toArray(),...box.max.toArray()])assert(Number.isFinite(v),`${name} bounds finite`);if(requireLod){const lods:THREE.LOD[]=[];root.traverse(o=>{if(o.type==='LOD')lods.push(o as THREE.LOD)});assert.equal(lods.length,1,`${name} one LOD`);assert.equal(lods[0].levels.length,3,`${name} three LOD levels`);const ds=lods[0].levels.map(x=>x.distance);assert(ds[1]>ds[0]&&ds[2]>ds[1],`${name} LOD thresholds`)}root.traverse(o=>{const m=o as THREE.Mesh;if(!m.geometry)return;report.geometryMeshes++;report.triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;for(const a of ['position','normal','uv']){assert(m.geometry.attributes[a],a);assert(Array.from(m.geometry.attributes[a].array).every(Number.isFinite),a)}const mats=Array.isArray(m.material)?m.material:[m.material];for(const mat of mats){assert(mat,`${name} material`);materials.add(mat.uuid);for(const v of [mat.opacity,mat.roughness,mat.metalness])if(v!==undefined)assert(Number.isFinite(v),`${name} material finite`);const map=(mat as THREE.Material & {map?:THREE.Texture}).map;if(map){assert(m.geometry.attributes.uv,`${name} mapped UV`);textures.add(map.uuid)}}assert(!disposed.has(m.geometry),`${name} geometry reused after disposal`);m.geometry.dispose();disposed.add(m.geometry);report.resources.disposedGeometry++});report.bounds[name]=[...box.min.toArray(),...box.max.toArray()]}
for(const d of L11_DECOR_DEFS){const root=buildL11Structure({kind:d.id,x:0,y:0,w:d.w,h:d.d,solid:d.solid,data:{decorId:d.id}});assert(root&&root.children.length>0,`${d.id} rendered`);inspect(root,d.id)}
for(const f of L11_SIGNS){const batch=new CityBatch();addL11Sign(batch,f.id,0,2,0,0,3,3/4.2,true);const g=new THREE.Group();batch.finish(g);inspect(g,`sign:${f.id}`)}
for(const f of L11_INSPECTED_SIGNS){
  await access(f.source)
  const image=await loadImage('public/textures/'+f.albedo),low=await loadImage('public/textures/'+f.lowAlbedo)
  assert.equal(image.width,low.width*2);assert.equal(image.height,low.height*2)
  for(const channel of [f.normal,f.roughness]){const map=await loadImage('public/textures/'+channel);assert.equal(map.width,image.width);assert.equal(map.height,image.height)}
  const batch=new CityBatch();addL11Sign(batch,f.id,0,2,0,Math.PI/2,f.width,f.height,true);const g=new THREE.Group();batch.finish(g);inspect(g,`sign:${f.id}`)
}
assert.equal(l11StreetSign('road-x:street:1:0:1'),l11StreetSign('road-x:street:segment:offset:side'))
report.signs=32+L11_INSPECTED_SIGNS.length
const found=new Map<string,ReturnType<typeof l11Buildings>[number]>();for(const seed of [42,-17,74911])for(const b of l11Buildings(seed,-1024,-1024,1024,1024))if(!found.has(b.archetype))found.set(b.archetype,b);assert.equal(found.size,32)
// A raised/rotated distant building must retain the same storey pattern and
// materials. World height must not select different blinds or blue core bays.
for(const base of [.03,2.17])for(const profile of ['civic-piers','sandstone-grid','blue-curtain','green-curtain','service-wall','bronze-curtain','white-ribbon','brick-apartments','glazed-core'] as L11FacadeProfile[])for(const architecture of profile==='white-ribbon'?[undefined,'ribbon-twins'] as const:profile==='service-wall'?[undefined,'quay-service-wing'] as const:[undefined]){
  const b={...found.get('fin-office')!,facadeProfile:profile,architecture,base,angle:.31,sealed:true,accessible:0},p=rectangle(0,0,b.width,b.depth),local=new THREE.Group(),world=new THREE.Group(),a=new CityBatch(),c=new CityBatch()
  // Test many translated storeys: (base + floor) + 3 can be a few ULPs less
  // than base + (floor + 3), which must never create an extra inverted bay.
  for(let floor=0;floor<60;floor+=3){
    referenceFacade(a,b,p,floor,floor+3,2)
    referenceFacade(c,b,transform(p,321,-187,b.angle),floor+b.base,floor+3+b.base,2,undefined,b.angle,b.base)
  }
  a.finish(local);c.finish(world)
  assert.equal(local.children.length,world.children.length,`${profile} world-frame material count`)
  const matrix=new THREE.Matrix4().makeTranslation(321,b.base,-187).multiply(new THREE.Matrix4().makeRotationY(-b.angle)),v=new THREE.Vector3()
  local.children.forEach((o,i)=>{const near=o as THREE.Mesh,far=world.children[i] as THREE.Mesh;assert.equal(near.material,far.material,`${profile} world-frame material`);const p=near.geometry.attributes.position,q=far.geometry.attributes.position;assert.equal(p.count,q.count,`${profile} world-frame bays`);for(let j=0;j<p.count;j++){v.fromBufferAttribute(p,j).applyMatrix4(matrix);assert(v.distanceTo(new THREE.Vector3().fromBufferAttribute(q,j))<.0001,`${profile} transformed frame vertex`)}})
  inspect(local,`facade-local:${profile}:${architecture??'plain'}:${base}`);inspect(world,`facade-world:${profile}:${architecture??'plain'}:${base}`)
}
for(const spec of L11_BUILDINGS){const b=found.get(spec.id)!,root=new THREE.Group(),t=performance.now(),job=buildL11Building({kind:'l11building',x:b.x,y:b.y,w:b.w,h:b.h,solid:true,l11:b,data:{buildingId:b.id}});for(;;){const r=job.next();if(r.done){root.add(r.value);break}}inspect(root,`building:${spec.id}`,true);report.timingsMs[`building:${spec.id}`]=performance.now()-t}report.buildings=32
const twins=l11Buildings(L11_REFERENCE_SEED,760,790,950,960).find(b=>b.id.endsWith(':reference:quay-east-near'))
assert(twins,'reference quay-east-near building')
const twinStructure={kind:'l11building',x:twins.x,y:twins.y,w:twins.w,h:twins.h,solid:true,l11:twins,data:{buildingId:twins.id}}
const twinJob=buildL11Building(twinStructure);let twinRoot:THREE.Group|undefined
for(;;){const r=twinJob.next();if(r.done){twinRoot=r.value;break}}
assert(twinRoot,'quay collision regression built a complete model')
const twinColliders=l11BuildingColliders(twinStructure),beds=l11QuayPlanting(twins)
assert.equal(beds.length,2,'quay planting beds')
for(const bed of beds){const [wx,wz]=l11World(twins,bed.x-bed.w/2+.1,bed.z),relative=Math.max(...twinColliders.map(c=>l11SolidSurface(c,wx,wz,.32))),highest=twins.base+relative,expected=twins.base+bed.bottom+.705
  assert(Math.abs(highest-expected)<=.04,`quay planting outside surface ${highest} expected ${expected}`)
  assert(highest<expected+.04,`non-solid planting stem became collider ${highest}`)
}
inspect(twinRoot,'building:reference-quay-collision',true)
const tg=new THREE.Group(),terrain=buildL11TerrainJob(generateLevel(L11,42,false),tg,{x0:64,y0:64,x1:96,y1:96});while(!terrain.next().done){}inspect(tg)
const distant=buildL11DistantCity(42,-64,-64);for(;;){const r=distant.next();if(r.done){inspect(r.value);break}}
report.decor=108;report.uniqueMaterials=materials.size;report.uniqueTextures=textures.size;assert.equal(report.resources.disposedGeometry,report.geometryMeshes,'every geometry disposed');report.timingsMs.total=performance.now()-start;await mkdir('reports/l11-remake',{recursive:true});await writeFile('reports/l11-remake/mesh-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
