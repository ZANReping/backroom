import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import * as THREE from 'three'
import { L11_DECOR_DEFS, l11DecorDef } from '../src/game/content/l11Decor'
import { L11PropBuilder, l11PartPoint, type L11PropPart } from '../src/game/content/l11PropKit'
import { l11PropParts } from '../src/game/content/l11PropParts'
import { l11PropGeometry } from '../src/game/renderer/l11PropGeometry'
import { l11PropColliders, l11StructureBounds, l11BuildingColliders, setL11BuildingSolids } from '../src/game/world/l11Collision'
import { l11CityPlan } from '../src/game/world/l11Layout'
import { l11BoxSolid, l11PlateSolid, l11SolidCollider, l11SolidHits, l11SolidSegmentHit, l11SolidSurface, transformL11Solid, makeL11Solid, type L11Solid, type SolidPoint } from '../src/game/world/l11Solid'
import { circlePolygon } from '../src/game/world/l11Geometry'
import { l11StreetSignSolids } from '../src/game/world/l11StreetSignSolids'
import type { Structure } from '../src/game/core/types'

const close=(a:number,b:number,label:string,tol=2e-5)=>assert(Math.abs(a-b)<=tol,`${label}: ${a} != ${b}`)
const structure=(id:string,deg=0):Structure=>{const d=l11DecorDef(id)!;return {kind:id,x:11.25,y:-7.75,w:d.w,h:d.d,solid:d.solid,data:{deg}}}
const partWorld=(p:L11PropPart, v:THREE.Vector3, s:Structure)=>{const a=-Number(s.data?.deg??0)*Math.PI/180,c=Math.cos(a),n=Math.sin(a),x=s.x+s.w/2+v.x*c-v.z*n,z=s.y+s.h/2+v.x*n+v.z*c;return [x,v.y,z] as const}

// 1. The cylinder footprint must remain the 16-sided mesh footprint rather than an AABB.
const table=structure('l11_cafe_table'),tableParts=l11PropParts('l11_cafe_table'),tableColliders=l11PropColliders(table)
const baseIndex=tableParts.findIndex(p=>p.shape==='cylinder')
assert(baseIndex>=0,'cafe table cylinder exists')
const base=tableColliders[baseIndex], basePart=tableParts[baseIndex]
const baseRadius=basePart.w/2
assert(circlePolygon(table.x+table.w/2+baseRadius*.99,table.y+table.h/2,0,base.polygon),'inside cylinder footprint blocks')
assert(!circlePolygon(table.x+table.w/2+baseRadius*1.12,table.y+table.h/2,0,base.polygon),'outside cylinder footprint is clear')

// 2. A tilted thin bar only blocks the vertical interval occupied by its real mesh.
const tilt=makeL11Solid([[-.04,-1,-.04],[.04,-1,-.04],[.04,-1,.04],[-.04,-1,.04],[-.04,1,-.04],[.04,1,-.04],[.04,1,.04],[-.04,1,.04]],[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])
const euler=new THREE.Euler(.37,-.43,.29),rot=new THREE.Matrix4().makeRotationFromEuler(euler)
const tilted: L11Solid={...tilt,vertices:tilt.vertices.map(p=>new THREE.Vector3(...p).applyMatrix4(rot).toArray() as SolidPoint)}
const tiltedCollider=l11SolidCollider(tilted)
assert(!l11SolidHits(tiltedCollider,.25,0,.01,-.3,.3),'low interval away from tilted bar does not block')
assert(l11SolidHits(tiltedCollider,0,0,.01,-.02,.02),'real bar centre height blocks')

// 3. Cafe table top supports, while its open underside remains traversable.
const topIndex=tableParts.findIndex(p=>p.surface==='wood'&&p.y>.7),top=tableColliders[topIndex]
assert(top,'cafe tabletop collider exists')
const tx=table.x+table.w/2+.18,tz=table.y+table.h/2
assert(l11SolidSurface(top,tx,tz,.02,true)>.7,'tabletop upper surface is queryable')
assert(!l11SolidHits(top,tx,tz,.03,.4,.6),'space beneath tabletop remains open')
assert(l11SolidSurface(top,tx,tz,.02,false)<.74,'tabletop underside is queryable')

// 4. Every solid definition keeps every transformed render vertex inside its own collider.
for(const id of ['l11_sedan','l11_box_truck']){
  const s=structure(id,37),parts=l11PropParts(id),colliders=l11PropColliders(s),solidParts=parts.filter(p=>p.solid)
  // The street-name model has two rendered plates whose shared pole is
  // emitted as an additional solid part by the municipal builder.
  assert.equal(colliders.length,solidParts.length+l11StreetSignSolids(s).length,`${id} collider count`)
  for(const p of parts){if(!p.solid)continue;const ci=solidParts.indexOf(p),{geometry,matrix}=l11PropGeometry(p),pos=geometry.getAttribute('position'),collider=colliders[ci]
    for(let i=0;i<pos.count;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(matrix),[x,,z]=partWorld(p,v,s);assert(x>=collider.x0-2e-5&&x<=collider.x1+2e-5&&z>=collider.y0-2e-5&&z<=collider.y1+2e-5,`${id} vertex bounds`);assert(v.y>=collider.bottom-2e-5&&v.y<=collider.top+2e-5,`${id} vertex height`);assert(circlePolygon(x,z,2e-5,collider.polygon),`${id} vertex polygon`)}
  }
}
for(const d of L11_DECOR_DEFS){const s=structure(d.id,37),parts=l11PropParts(d.id),solidParts=parts.filter(p=>p.solid),colliders=l11PropColliders(s),signSolids=l11StreetSignSolids(s);assert.equal(colliders.length,solidParts.length+signSolids.length,`${d.id} collider count`);for(const p of parts){if(!p.solid)continue;const ci=solidParts.indexOf(p),{geometry,matrix}=l11PropGeometry(p),pos=geometry.getAttribute('position'),c=colliders[ci];for(let i=0;i<pos.count;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(matrix),[x,,z]=partWorld(p,v,s);assert(x>=c.x0-2e-5&&x<=c.x1+2e-5&&z>=c.y0-2e-5&&z<=c.y1+2e-5,`${d.id} bounds`);assert(v.y>=c.bottom-2e-5&&v.y<=c.top+2e-5,`${d.id} height`);assert(circlePolygon(x,z,2e-5,c.polygon),`${d.id} polygon`)}}}

// 5. Sloped plates expose continuous upper/lower surfaces and no false side hit.
const quay=structure('l11_quay_balustrade'),quayParts=l11PropParts(quay.kind),quaySolids=l11PropColliders(quay),qx=quay.x+quay.w/2,qz=quay.y+quay.h/2
const cap=quaySolids[quayParts.findIndex(p=>p.surface==='concrete'&&p.y>1)]
assert(cap,'quay pier cap is registered as a solid')
close(l11SolidSurface(cap,qx,qz,.01,true),1.1,'quay cap supports from above')
const opening=qx+.23+(2-.02-.23)*5.5/13
assert(!quaySolids.some(s=>l11SolidHits(s,opening,qz,.002,.3,.8)),'space between fine pickets is not a solid panel')
assert(quaySolids.some(s=>l11SolidHits(s,opening,qz,.26,.3,.8)),'railing stops a player-sized capsule')
const plate=l11PlateSolid([[-1,1,-1],[1,2,-1],[1,2,1],[-1,1,1]])!
const pc=l11SolidCollider(plate)
close(l11SolidSurface(pc,0,0,.01,true),1.505,'sloped plate upper surface')
const plateBottom=l11SolidSurface(pc,0,0,.01,false)
assert(plateBottom>1.48&&plateBottom<1.5,`sloped plate lower surface: ${plateBottom}`)
assert(l11SolidHits(pc,0,0,.01,1.4,1.6),'sloped plate centre hit')
assert(!l11SolidHits(pc,2,0,.01,1.4,1.6),'sloped plate side clear')

// 6. The delivery bicycle's segmented ring leaves its wheel centre open.
const bike=structure('l11_delivery_bike'),bikeColliders=l11PropColliders(bike),rings=bikeColliders.filter(c=>c.pieces)
assert(rings.length>=2,'delivery bike ring pieces retained')
for(const ring of rings)assert(!l11SolidHits(ring,bike.x+bike.w/2,bike.y+bike.h/2,.025,.2,1.1),'ring centre remains open')

const shelter=structure('l11_bus_shelter'),shelterParts=l11PropParts('l11_bus_shelter'),shelterSolid=shelterParts.filter(p=>p.solid),shelterColliders=l11PropColliders(shelter)
const glassIndex=shelterParts.findIndex(p=>p.shape==='plane'&&p.surface==='glass'&&p.solid)
assert(glassIndex>=0,'bus shelter solid glass panel exists')
const glass=shelterParts[glassIndex],glassCollider=shelterColliders[shelterSolid.indexOf(glass)],glassShape=l11PropGeometry(glass),glassPos=glassShape.geometry.getAttribute('position'),glassCenter=new THREE.Vector3(),glassNormal=new THREE.Vector3()
for(let i=0;i<glassPos.count;i++)glassCenter.add(new THREE.Vector3().fromBufferAttribute(glassPos,i))
glassCenter.multiplyScalar(1/glassPos.count).applyMatrix4(glassShape.matrix)
glassNormal.fromBufferAttribute(glassShape.geometry.getAttribute('normal'),0).transformDirection(glassShape.matrix)
const [glassX,,glassZ]=partWorld(glass,glassCenter,shelter),awayX=glassX+glassNormal.x*.2,awayZ=glassZ+glassNormal.z*.2
assert(l11SolidHits(glassCollider,glassX,glassZ,.012,glassCollider.bottom-.01,glassCollider.top+.01),'bus shelter glass centre blocks')
assert(!l11SolidHits(glassCollider,awayX,awayZ,.012,glassCollider.bottom-.01,glassCollider.top+.01),'20cm away from glass face is clear')
for(let i=0;i<glassPos.count;i++){const v=new THREE.Vector3().fromBufferAttribute(glassPos,i).applyMatrix4(glassShape.matrix),[x,,z]=partWorld(glass,v,shelter);assert(x>=glassCollider.x0-2e-5&&x<=glassCollider.x1+2e-5&&z>=glassCollider.y0-2e-5&&z<=glassCollider.y1+2e-5,'glass polygon boundary');assert(v.y>=glassCollider.bottom-2e-5&&v.y<=glassCollider.top+2e-5,'glass height boundary')}

// 7. Broad-phase prop bounds cover every solid render part after rotations and moves.
for(const d of L11_DECOR_DEFS){if(!d.solid)continue;for(const deg of [0,37,-123])for(const [x,y] of [[11.25,-7.75],[-123.5,88.25],[407.75,-316.5]] as const){
  const s={...structure(d.id,deg),x,y},bound=l11StructureBounds(s),parts=l11PropParts(d.id),solidParts=parts.filter(p=>p.solid),colliders=l11PropColliders(s)
  for(const p of parts){if(!p.solid)continue;const ci=solidParts.indexOf(p),{geometry,matrix}=l11PropGeometry(p),pos=geometry.getAttribute('position'),c=colliders[ci]
    for(let i=0;i<pos.count;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(matrix),[px,,pz]=partWorld(p,v,s);assert(px>=bound.x0-2e-5&&px<=bound.x1+2e-5&&pz>=bound.y0-2e-5&&pz<=bound.y1+2e-5,`${d.id} broad bounds ${deg} ${x},${y}`);assert(px>=c.x0-2e-5&&px<=c.x1+2e-5&&pz>=c.y0-2e-5&&pz<=c.y1+2e-5,`${d.id} collider ${deg} ${x},${y}`)}}
}}

// 8. Reference buildings cover planned fallback solids and published outward details.
const referenceBuildings=l11CityPlan(20261014,0,0).buildings.filter(b=>b.id.includes(':reference:')).slice(0,4)
for(const source of referenceBuildings)for(const deg of [0,37,-123])for(const [dx,dy] of [[0,0],[-123.5,88.25],[407.75,-316.5]] as const){
  const b={...source,angle:deg*Math.PI/180},s:any={kind:'l11building',x:source.x+dx,y:source.y+dy,w:source.w,h:source.d,solid:true,l11:b,data:{deg:0}}
  const contains=(label:string)=>{const bound=l11StructureBounds(s),boxes=l11BuildingColliders(s);for(const c of boxes)for(const [x,y] of [[c.x0,c.y0],[c.x0,c.y1],[c.x1,c.y0],[c.x1,c.y1]])assert(x>=bound.x0-2e-5&&x<=bound.x1+2e-5&&y>=bound.y0-2e-5&&y<=bound.y1+2e-5,`${label} collider bounds`)}
  contains(`${source.id} planned ${deg}deg ${dx},${dy}`)
  setL11BuildingSolids(s,[l11BoxSolid(source.width/2,1.5,source.depth/2,source.width,3,source.depth),l11BoxSolid(source.width+2,2,source.depth/2,4,4,3)])
  contains(`${source.id} published ${deg}deg ${dx},${dy}`)
}

const repeat=structure('l11_bus_shelter',37),repeatA=l11StructureBounds(repeat),repeatB=l11StructureBounds(repeat)
assert.deepEqual(repeatA,repeatB,'prop broad bounds deterministic')

// A 4mm pane between samples blocks reach-through from either side, while
// rays above/alongside it remain clear; rotations and rebases retain this.
for(const angle of [0,.63,-1.9])for(const [ox,oy]of [[0,0],[-137.25,208.5]]){
  const pane=l11SolidCollider(transformL11Solid(l11BoxSolid(0,1.5,.047,2,2,.004),ox,oy,angle))
  const world=(x:number,y:number,z:number):SolidPoint=>[ox+x*Math.cos(angle)-z*Math.sin(angle),y,oy+x*Math.sin(angle)+z*Math.cos(angle)]
  for(const [a,b] of [[world(0,1.3,-1),world(0,1.7,1)],[world(0,1.7,1),world(0,1.3,-1)]])assert(l11SolidSegmentHit(pane,a,b),'thin glass segment blocked')
  assert(!l11SolidSegmentHit(pane,world(1.2,1.5,-1),world(1.2,1.5,1)),'clear beside pane')
  assert(!l11SolidSegmentHit(pane,world(0,2.7,-1),world(0,2.7,1)),'clear above pane')
}

const movedSedan=structure('l11_sedan',37),sedanBefore=l11StructureBounds(movedSedan)
l11PropColliders(movedSedan);movedSedan.x+=73.25;movedSedan.y-=41.5
const sedanAfter=l11StructureBounds(movedSedan),sedanBoxes=l11PropColliders(movedSedan)
for(const c of sedanBoxes)for(const [x,y] of [[c.x0,c.y0],[c.x0,c.y1],[c.x1,c.y0],[c.x1,c.y1]])assert(x>=sedanAfter.x0-2e-5&&x<=sedanAfter.x1+2e-5&&y>=sedanAfter.y0-2e-5&&y<=sedanAfter.y1+2e-5,'moved sedan cached bounds')
assert.notDeepEqual(sedanBefore,sedanAfter,'moved sedan bounds update')

const movedBuilding:any={kind:'l11building',x:referenceBuildings[0].x,y:referenceBuildings[0].y,w:referenceBuildings[0].w,h:referenceBuildings[0].d,solid:true,l11:{...referenceBuildings[0],angle:37*Math.PI/180},data:{deg:0}}
setL11BuildingSolids(movedBuilding,[l11BoxSolid(referenceBuildings[0].width/2,1.5,referenceBuildings[0].depth/2,referenceBuildings[0].width,3,referenceBuildings[0].depth),l11BoxSolid(referenceBuildings[0].width+2,2,referenceBuildings[0].depth/2,4,4,3)])
l11StructureBounds(movedBuilding);l11BuildingColliders(movedBuilding);movedBuilding.x+=91.5;movedBuilding.y-=37.25
const movedBuildingBounds=l11StructureBounds(movedBuilding),movedBuildingBoxes=l11BuildingColliders(movedBuilding)
for(const c of movedBuildingBoxes)for(const [x,y] of [[c.x0,c.y0],[c.x0,c.y1],[c.x1,c.y0],[c.x1,c.y1]])assert(x>=movedBuildingBounds.x0-2e-5&&x<=movedBuildingBounds.x1+2e-5&&y>=movedBuildingBounds.y0-2e-5&&y<=movedBuildingBounds.y1+2e-5,'moved published building cached bounds')

// 9. Street-sign plates are appended after prop parts and follow the same
// rotation, top/bottom and broad-bound rules as the rendered sign geometry.
for(const [kind,signId] of [['l11_signal','hope'],['l11_street_name','hope'],['l11_street_name','canal-road']] as const)for(const deg of [0,37,-123]){
  const s={...structure(kind,deg),data:{deg,signId}} as Structure
  const extra=l11StreetSignSolids(s),colliders=l11PropColliders(s),parts=l11PropParts(kind),solidParts=parts.filter(p=>p.solid)
  assert.equal(colliders.length,solidParts.length+extra.length,`${kind}/${signId}/${deg} appended sign count`)
  const bounds=l11StructureBounds(s),local=extra[0],angle=-deg*Math.PI/180,cx=s.x+s.w/2,cy=s.y+s.h/2
  const transformed=transformL11Solid(local,cx,cy,angle),plate=colliders[colliders.length-1]
  for(const v of transformed.vertices){assert(circlePolygon(v[0],v[2],2e-5,plate.polygon),`${kind}/${signId}/${deg} sign vertex polygon`);assert(v[0]>=bounds.x0-2e-5&&v[0]<=bounds.x1+2e-5&&v[2]>=bounds.y0-2e-5&&v[2]<=bounds.y1+2e-5,`${kind}/${signId}/${deg} sign bounds`)}
  assert(l11SolidSurface(plate,(plate.x0+plate.x1)/2,(plate.y0+plate.y1)/2,.02,true)>=plate.top-2e-2,`${kind}/${signId}/${deg} sign top query`)
  assert(l11SolidSurface(plate,(plate.x0+plate.x1)/2,(plate.y0+plate.y1)/2,.02,false)<=plate.bottom+2e-2,`${kind}/${signId}/${deg} sign bottom query`)
}

const result={passed:true,definitions:L11_DECOR_DEFS.length,segmentedRings:rings.length,checks:['cylinder footprint','rotated thin bar','cafe table surfaces','vehicle and all decor vertices','sloped plate','delivery bike ring opening','bus shelter glass panel','all decor broad bounds at three angles and translations','reference planned and published building bounds','same-coordinate bounds determinism','street sign plate vertices and top/bottom bounds'],tolerance:2e-5}
await mkdir('reports/l11-water-collision',{recursive:true});await writeFile('reports/l11-water-collision/static-collision.json',JSON.stringify(result,null,2))
console.log(`L11 collision checks passed: ${L11_DECOR_DEFS.length} definitions, ${rings.length} segmented rings, rotated vertex bounds, sloped surfaces and glass panel verified`)
