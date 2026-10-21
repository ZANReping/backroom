import assert from 'node:assert/strict'
import {createTradersMap,generateTradersChunk} from '../src/game/world/tradersWorld'
import {levelDefOf} from '../src/game/levels'
import * as THREE from 'three'
import {TRADERS_DRESSING,TRADERS_DRESSING_SKIPPED} from '../src/game/content/tradersDressing'
import {TRADERS_WALLS,TRADERS_ROOMS,tradersContains} from '../src/game/content/tradersLayout'
import {buildTradersFitout} from '../src/game/renderer/tradersFitoutMeshes'
import {DRESSING_SIZE,type DressingKind} from '../src/game/content/tradersDressingShapes'
import {tradersFitoutColliders} from '../src/game/content/tradersFitout'
import {bakeTradersGeometry,type TradersProbe,type TradersProbeField} from '../src/game/renderer/tradersBakedLighting'
import {seatsFor} from '../src/game/world/seating'
import {buildTradersShutter,tradersCeilingStep,type TradersAssets} from '../src/game/renderer/tradersMeshes'
const mats=new Map<string,THREE.Material>(),assets={material:(surface:string,color:string)=>{const key=surface+color;let m=mats.get(key);if(!m){m=new THREE.MeshStandardMaterial({color});m.userData.surface=surface;mats.set(key,m)}return m},labelGeometry:(_t:string,w:number,h:number)=>new THREE.PlaneGeometry(w,h)} as unknown as TradersAssets
const issues:unknown[]=[],counts:Record<string,number>={},models:unknown[]=[],tested=new Set<string>()
const m=createTradersMap(levelDefOf(102)!,424242);assert.equal(m.traders!.chunks.size,0);for(let y=0;y<9;y++)for(let x=0;x<14;x++)generateTradersChunk(m,x,y)
for(const s of m.structures.filter(s=>s.data?.tradersModel)){
 const model=String(s.data?.dressing??s.data?.tradersModel);counts[model]=(counts[model]??0)+1
 const root=buildTradersFitout(s,assets)!;root.updateMatrixWorld(true)
 const box=new THREE.Box3().setFromObject(root),cx=s.x+s.w/2,cy=s.y+s.h/2
 if(s.data?.tradersModel==='dressing'&&(box.min.x<s.x-.07||box.max.x>s.x+s.w+.07||box.min.z<s.y-.07||box.max.z>s.y+s.h+.07||box.max.y>Number(s.data?.height??DRESSING_SIZE[model as DressingKind][2])+.08||box.min.y<-.025))issues.push({id:s.data?.tradersId,issue:'bounds',nominal:[s.x,s.y,s.w,s.h],min:box.min.toArray(),max:box.max.toArray()})
 if(s.data?.wallId){const wall=TRADERS_WALLS.find(w=>w.id===s.data?.wallId)!,nx=Number(s.data?.wallNormalX),ny=Number(s.data?.wallNormalY),angle=Number(s.data?.deg)*Math.PI/180
  if(Math.sin(angle)*nx+Math.cos(angle)*ny<.999)issues.push({id:s.data?.tradersId,issue:'facing'})
  const back=nx>0?box.min.x-(wall.x+wall.w):nx<0?wall.x-box.max.x:ny>0?box.min.z-(wall.y+wall.h):wall.y-box.max.z
  if(back<-.02||back>.065)issues.push({id:s.data?.tradersId,issue:'wall gap',gap:back,cx,cy})
 }
 let triangles=0,meshes=0;root.traverse(o=>{if((o as THREE.Mesh).isMesh){meshes++;const g=(o as THREE.Mesh).geometry;triangles+=(g.index?.count??g.getAttribute('position').count)/3;for(const k of ['position','normal','uv'])for(const n of g.getAttribute(k).array)if(!Number.isFinite(n))throw Error('invalid '+k);g.dispose()}})
 if(!tested.has(model)){tested.add(model);models.push({model,triangles,meshes})}
}
// New dressing must not invent business or stock inside reserved empty shops.
for(const s of TRADERS_DRESSING){
 assert(!s.data?.facility&&!s.data?.services,'decorative objects are not service stations')
 assert(!TRADERS_ROOMS.some(r=>(r.kind==='shop'||r.kind==='anchor'||r.id==='rail_terminal'||r.id==='dock')&&tradersContains(r,s.x+s.w/2,s.y+s.h/2)),'excluded interiors remain untouched')
}
const overlaps:unknown[]=[]
const dressing=m.structures.filter(s=>s.data?.tradersId?.toString().startsWith('dress.'))
for(let i=0;i<dressing.length;i++)for(let j=i+1;j<dressing.length;j++)for(const a of tradersFitoutColliders(dressing[i]))for(const b of tradersFitoutColliders(dressing[j])){
 const dx=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0),dz=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0),dy=Math.min(a.top,b.top)-Math.max(a.bottom,b.bottom)
 if(dx>.04&&dz>.04&&dy>.04)overlaps.push([dressing[i].data?.tradersId,dressing[j].data?.tradersId,[dx,dz,dy]])
}
for(const s of m.structures.filter(s=>/^boardroom\.chair\./.test(String(s.data?.tradersId)))){
 const t=m.structures.find(s=>s.data?.tradersId==='boardroom.meeting_table')!,seat=seatsFor(s,m,102)[0],dx=t.x+t.w/2-seat.x,dz=t.y+t.h/2-seat.y
 assert(Math.sin(seat.yaw)*dx+Math.cos(seat.yaw)*dz>0,'meeting chair faces its table')
}
// Cast real rays through the generated circular cut-outs. A filled slab at .90m
// would be hit before the basin drain, even when bounds/UV checks still pass.
const wash=buildTradersFitout({kind:'trade_counter',x:-1.6,y:-.375,w:3.2,h:.75,solid:true,data:{tradersModel:'dressing',dressing:'washcounter'}},assets)!
wash.updateMatrixWorld(true)
for(const x of [-3.2*.27,3.2*.27]){
 const ray=new THREE.Raycaster(new THREE.Vector3(x,1.1,0),new THREE.Vector3(0,-1,0)),hits=ray.intersectObject(wash,true)
 assert(hits.length&&hits[0].point.y<.84&&hits[0].point.y>.78,'countertop must have an actual hole into the basin')
}
wash.traverse(o=>{if((o as THREE.Mesh).isMesh)(o as THREE.Mesh).geometry.dispose()})
// Probe interpolation follows world positions and clamps outside endpoints.
const probeGeo=new THREE.BufferGeometry(),positions=[-1,0,0,0,0,0,2.5,0,0,5,0,0,7.5,0,0,10,0,0,11,0,0]
probeGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));probeGeo.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:7},()=>[0,1,0]).flat(),3))
const field:TradersProbeField={axis:'x',low:10,high:20,probes:[.2,.4,.6].map(v=>Array.from({length:6},()=>[v,v,v] as const) as TradersProbe)}
const bake=bakeTradersGeometry(probeGeo,new THREE.Matrix4().makeTranslation(10,0,0),field);while(!bake.next().done){}
for(let i=0;i<7;i++)assert(Math.abs(probeGeo.getAttribute('tradersLight').getX(i)-[.2,.2,.3,.4,.5,.6,.6][i])<.00001,'continuous world-space probe interpolation')
field.bottom=10;field.top=12;field.rows=[field.probes,field.probes.map(p=>p.map(([r,g,b])=>[r+.2,g+.2,b+.2] as const))]
const verticalBake=bakeTradersGeometry(probeGeo,new THREE.Matrix4().makeTranslation(10,11,0),field);while(!verticalBake.next().done){}
for(let i=0;i<7;i++)assert(Math.abs(probeGeo.getAttribute('tradersLight').getX(i)-[.3,.3,.4,.5,.6,.7,.7][i])<.00001,'vertical probe gradient follows world height')
probeGeo.dispose()
// Open vault shutters stay attached to the roll housing and leave real headroom.
const shutter=buildTradersShutter({kind:'rollerdoor',x:0,y:0,w:2.1,h:.18,solid:false,data:{height:2.7,open:1}},assets);shutter.updateMatrixWorld(true)
shutter.traverse(o=>{if((o as THREE.Mesh).isMesh){if(o.userData.lid){const b=new THREE.Box3().setFromObject(o);assert(b.min.y>2.1&&b.max.y<=2.72,'open shutter stays at its actual lintel')} (o as THREE.Mesh).geometry.dispose()}})
// The low washroom roof starts at z=126.4. Tangential cell edges on its
// exterior must not sample that low region at just one endpoint and grow spikes.
assert.equal(tradersCeilingStep(314,126,314,126.4,1,0,4.8,4.8),null,'no corner-only ceiling fascia')
const step=tradersCeilingStep(315,126.4,314,126.4,0,1,4.8,4.8)!
assert(step,'actual ceiling height change is closed')
assert.equal(step.points[1],3);assert.equal(step.points[4],3)
const va=new THREE.Vector3().fromArray(step.points,0),vb=new THREE.Vector3().fromArray(step.points,3),vc=new THREE.Vector3().fromArray(step.points,6)
assert(vb.sub(va).cross(vc.sub(va)).normalize().dot(new THREE.Vector3().fromArray(step.normals))>.999,'fascia normal matches actual winding and faces the tall room')
// Independently owned geometry; disposing an instance must not dispose shared
// materials or the second instance. GPU lifetime is also exercised by browser QA.
const sample=m.structures.find(s=>s.data?.dressing==='teapoint')!,one=buildTradersFitout(sample,assets)!,two=buildTradersFitout(sample,assets)!
const second=new Set<THREE.BufferGeometry>();let disposedSecond=0,disposedShared=0
for(const material of mats.values())material.addEventListener('dispose',()=>disposedShared++)
two.traverse(o=>{if((o as THREE.Mesh).isMesh){const geo=(o as THREE.Mesh).geometry;second.add(geo);geo.addEventListener('dispose',()=>disposedSecond++)}})
one.traverse(o=>{if((o as THREE.Mesh).isMesh){const geo=(o as THREE.Mesh).geometry;assert(!second.has(geo),'independent geometry');geo.dispose()}})
assert.equal(disposedSecond,0);assert.equal(disposedShared,0)
two.traverse(o=>{if((o as THREE.Mesh).isMesh)(o as THREE.Mesh).geometry.dispose()})
for(const mat of mats.values())mat.dispose()
console.log(JSON.stringify({ok:issues.length===0&&overlaps.length===0,dressing:TRADERS_DRESSING.length,skipped:TRADERS_DRESSING_SKIPPED,counts,models,issues,overlaps,checks:['reserved interiors empty','wall backing and front normals','rotated mesh/collider dimensions','finite geometry and UVs','meeting chairs face table','actual basin cut-outs','instance geometry and shared material disposal','world-space probe interpolation and endpoint clamps','open shutter headroom and lintel alignment','ceiling height transitions without corner spikes']},null,2))
if(issues.length||overlaps.length)process.exitCode=1
