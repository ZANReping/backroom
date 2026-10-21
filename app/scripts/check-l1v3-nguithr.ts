import assert from 'node:assert/strict'
import {createCanvas} from '@napi-rs/canvas'
import * as THREE from 'three'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {prepareNguithrJob,nguithrResourcesReady,nguithrBudget,nguithrNest,prepareNguithrGeometry} from '../src/game/renderer/nguithrMesh'
import {buildNguithrEntityMesh} from '../src/game/renderer/entitiesMesh'
import {setMaterialMode} from '../src/game/renderer/shared'
import {l1Material,L1_EAGLE_SKINS} from '../src/game/renderer/l1Materials'
import {l1PlanRegions} from '../src/game/world/l1Plan'
import {l1ParkingSkin,L1_GENERATION_VERSION} from '../src/game/world/l1Spatial'
import {l1SurfaceMeshes} from '../src/game/renderer/l1SurfaceMeshes'
import {L1_BAKE_REVISION} from '../src/game/world/l1BakeTypes'
import {buildL1GardenPlants} from '../src/game/renderer/l1GardenPlants'
import {buildL1Data} from '../src/game/world/l1Building'
import {l1FindReference} from '../src/game/world/l1Spatial'
let checks=0;const ok=(v:unknown,msg:string)=>{assert(v,msg);checks++}
Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(512,512),createElementNS:()=>({})}})
const cancelled=prepareNguithrJob();cancelled.next();cancelled.return();ok(!nguithrResourcesReady(),'cancelled preparation is not published')
const slices:number[]=[];const prep=prepareNguithrJob();let step
for(let i=0;i<100;i++){const t=performance.now();step=prep.next();slices.push(performance.now()-t);if(step.done)break}
ok(step?.done&&nguithrResourcesReady()&&slices.length>20&&slices.length<40,'bounded, cooperative geometry and texture preparation')
const resources=(g:THREE.Object3D)=>{const geo=new Set<THREE.BufferGeometry>(),mat=new Set<THREE.Material>(),skin=new Set<THREE.Skeleton>();g.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geo.add(m.geometry);if(m.material)for(const a of Array.isArray(m.material)?m.material:[m.material])mat.add(a);if((m as THREE.SkinnedMesh).isSkinnedMesh)skin.add((m as THREE.SkinnedMesh).skeleton)});return{geo,mat,skin}}
const modes=[]
for(const mode of ['classic','realistic'] as const){
 setMaterialMode(mode)
 const a=buildNguithrEntityMesh(.9,6,123),b=buildNguithrEntityMesh(1.1,4,321),ra=resources(a),rb=resources(b)
 ok([...ra.geo].every(g=>!rb.geo.has(g))&&[...ra.mat].every(m=>!rb.mat.has(m)),'independent entity/nest geometry and materials: '+mode)
 ok(!ra.geo.has(prepareNguithrGeometry().geo),'template is never owned by an instance')
 const nest=nguithrNest(a.userData.ngNest)!;ok(nest.sacs.length===6,'complete nest exists before GPU preparation');a.userData.ngNest.traverse((o:THREE.Object3D)=>ok(!!o.userData.noCastShadow||o===a.userData.ngNest,'transparent nest pieces never cast rectangular shadows'))
 const spider=nguithrBudget(a.userData.ngSpider);ok(spider.meshes===1&&spider.draws===3&&spider.tris<=5000&&spider.bones===58,'spider budget: '+mode)
 const whole=nguithrBudget(a);ok(whole.draws===7&&whole.tris<19000,'bounded instanced nest budget (line draw excluded): '+mode)
 nest.sacs[0].pop();nest.sacs[1].hide();ok(nest.sacs[0].state==='popped'&&nest.sacs[1].state==='hidden'&&nguithrNest(b.userData.ngNest)!.sacs.every(s=>s.state==='intact'),'sac visibility isolated by instance')
 for(const g of ra.geo){for(const key of ['position','normal','uv','skinWeight']){const attr=g.getAttribute(key);if(attr)ok([...attr.array].every(Number.isFinite),'finite '+key)}const sw=g.getAttribute('skinWeight');if(sw)for(let i=0;i<sw.count;i++)ok(Math.abs(sw.getX(i)+sw.getY(i)+sw.getZ(i)+sw.getW(i)-1)<1e-5,'normalized skin weights')}
 let released=0;for(const x of [...rb.geo,...rb.mat])x.addEventListener('dispose',()=>released++);for(const skeleton of rb.skin){const dispose=skeleton.dispose.bind(skeleton);skeleton.dispose=()=>{released++;dispose()}}
 for(const x of [...ra.geo,...ra.mat,...ra.skin])x.dispose();ok(released===0,'releasing a leaves b usable')
 for(const x of [...rb.geo,...rb.mat,...rb.skin])x.dispose();ok(released===rb.geo.size+rb.mat.size+rb.skin.size,'all b resources retired')
 for(const skin of Object.keys(L1_EAGLE_SKINS))for(const surface of ['floor','wall','columnRaw','ceiling'] as const){const m=l1Material('parking@'+skin,surface);ok(m.userData.l1ExtraTextures?.length===1,'eagle tint participates in texture warmup: '+skin+'/'+surface)}
 const plant=l1Material('garden','plant') as THREE.MeshLambertMaterial;ok(plant.side===THREE.DoubleSide&&plant.alphaTest===.5&&!plant.transparent&&!plant.normalMap,'classic and real foliage cutouts match')
 for(const [style,surface]of [['garden','ground'],['ouroboros','wall']]as const)ok((l1Material(style,surface).userData.l1ExtraTextures?.length??0)===(style==='garden'?2:0),'all custom samplers pre-uploaded: '+style)
 modes.push({mode,spider,whole})
}
const skins=new Set<string>()
for(const seed of [7,42,20261006])for(const r of l1PlanRegions(seed,-600,-600,600,600).filter(r=>r.section==='parking')){
 const skin=l1ParkingSkin(seed,r.ix0+3,r.iy0+3);skins.add(skin)
 for(const t of [.1,.5,.9])ok(l1ParkingSkin(seed,r.ix0+(r.ix1-r.ix0)*t,r.iy0+(r.iy1-r.iy0)*t)===skin,'one look per full parking hall across chunk seams')
}
ok(skins.size>=7,'weighted ordinary halls have visual variety')
const manifest=JSON.parse(readFileSync('public/assets/l1-bakes/manifest.json','utf8'));let triangles=0,partitions=0
function decode(v:any):any{if(v?.base64){const raw=Buffer.from(v.base64,'base64'),a=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);return new ({Float32Array,Uint8Array,Uint16Array,Uint32Array} as any)[v.type](a)}if(Array.isArray(v))return v.map(decode);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));return v}
for(const row of manifest.chunks.filter((r:any)=>r.quality==='high').slice(0,6)){
 const data=decode(JSON.parse(gunzipSync(readFileSync('public/assets/l1-bakes/'+row.file)).toString()))
 for(const mesh of data.meshes){const parts=l1SurfaceMeshes(row.seed,row.cx,row.cy,mesh);partitions+=parts.length
  ok(parts.every(b=>b.position===mesh.position&&b.uv===mesh.uv&&b.uv1===mesh.uv1&&b.normal===mesh.normal),'partition preserves original baked arrays and UVs')
  assert.deepEqual(parts.flatMap(b=>[...b.index]).sort((a,b)=>a-b),[...mesh.index].sort((a,b)=>a-b));checks++;triangles+=mesh.index.length/3
 }
}
ok(L1_GENERATION_VERSION===6&&L1_BAKE_REVISION===19,'architecture generation and final bake remain unchanged')
const garden=l1FindReference(20261006,'garden',2400)!,cx=Math.floor(garden.centerX/32),cy=Math.floor(garden.centerY/32),data=buildL1Data(20261006,cx,cy)
const plantRoots:THREE.Group[]=[]
for(const mode of ['classic','realistic']as const){setMaterialMode(mode);const root=new THREE.Group(),job=buildL1GardenPlants(data,0,0,root);let step=job.next();while(!step.done)step=job.next();const lod=root.getObjectByName('l1-garden-plants-lod') as THREE.LOD;ok(!!lod&&lod.levels.length===3,'new atlas vegetation is present in baked '+mode);let previous=Infinity;for(const level of lod.levels){const mesh=level.object as THREE.Mesh,count=mesh.geometry.attributes.position.count;ok(count>0&&count<=previous,'plant LOD reduces geometry');previous=count;for(const value of mesh.geometry.attributes.position.array)ok(Number.isFinite(value),'finite plant position');const uv=mesh.geometry.attributes.uv;for(let i=0;i<uv.count;i++)ok(uv.getX(i)>0&&uv.getX(i)<1&&uv.getY(i)>0&&uv.getY(i)<1,'plant atlas gutters');}plantRoots.push(root)}
const childA=plantRoots[0].getObjectByName('l1-garden-plants-lod') as THREE.LOD,childB=plantRoots[1].getObjectByName('l1-garden-plants-lod') as THREE.LOD
assert.deepEqual((childA.levels[0].object as THREE.Mesh).geometry.attributes.position.array,(childB.levels[0].object as THREE.Mesh).geometry.attributes.position.array);checks++
for(const root of plantRoots)root.traverse(o=>(o as THREE.Mesh).geometry?.dispose())
const out={checks,slices:{count:slices.length,maxMs:Math.max(...slices),totalMs:slices.reduce((a,b)=>a+b,0)},modes,skins:[...skins],triangles,partitions}
mkdirSync('reports/l1v3-nguithr-20261020',{recursive:true});writeFileSync('reports/l1v3-nguithr-20261020/static.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2))
