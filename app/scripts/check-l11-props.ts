import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import * as THREE from 'three'
import { L11_DECOR_DEFS, l11DecorDef } from '../src/game/content/l11Decor'
import { L11PropBuilder, l11PartPoint } from '../src/game/content/l11PropKit'
import { l11PropParts } from '../src/game/content/l11PropParts'
import { l11PropGeometry } from '../src/game/renderer/l11PropGeometry'
import { l11PropColliders } from '../src/game/world/l11Collision'
import { l11StreetSignSolids } from '../src/game/world/l11StreetSignSolids'
import { l11CurbFacing, l11TrafficFacing, l11WallSlot, l11FootprintsOverlap,L11_ROAD_SURFACE_LIFT } from '../src/game/world/l11Dressing'
import { rectangle, transform, inPolygon, circlePolygon } from '../src/game/world/l11Geometry'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { l11Local } from '../src/game/world/l11Layout'
import { L11 } from '../src/game/levels/l11'
import type { Structure } from '../src/game/core/types'

const close=(actual:number,expected:number,label:string,tol=1e-5)=>assert(Math.abs(actual-expected)<tol,`${label}: ${actual} / ${expected}`)
const report={prototypes:0,parts:0,rotations:0,uvFaces:0,colliderVertices:0,placements:0,roadInsets:0,byRole:{} as Record<string,number>,bounds:{} as Record<string,number[]>}
const builder=new L11PropBuilder(l11DecorDef('l11_workbench')!)
for(const [rx,ry,rz]of [[0,0,0],[.24,.71,-.33],[Math.PI/2,0,Math.PI/2],[0,Math.PI/2,0]]){
  const p=builder.box(.2,.4,-.7,.3,.8,1.4,'wood');Object.assign(p,{rx,ry,rz})
  const {matrix}=l11PropGeometry(p)
  for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
    const a=l11PartPoint(p,x*p.w,y*p.h,z*p.d),b=new THREE.Vector3(x,y,z).applyMatrix4(matrix)
    a.forEach((v,i)=>close(v,b.getComponent(i),'XYZ transform'));report.rotations++
  }
}
for(const end of [[1,2,3],[-2,1,-3],[0,-2,0],[2,0,0]] as [number,number,number][]){
  const start:[number,number,number]=[.1,.2,.3],p=builder.bar(start,end),a=l11PartPoint(p,0,-p.h/2,0),b=l11PartPoint(p,0,p.h/2,0)
  start.forEach((v,i)=>close(v,a[i],'bar start'));end.forEach((v,i)=>close(v,b[i],'bar end'))
}
for(const shape of ['box','plane']as const){
  const p=builder.box(0,0,0,2,.1,.6,'wood');p.shape=shape;p.grain='x';p.uvOffset=[0,0]
  const {geometry,uv}=l11PropGeometry(p),n=geometry.getAttribute('normal'),pos=geometry.getAttribute('position')
  for(let i=0;i<pos.count;i++){
    if(Math.abs(n.getY(i))>.99||Math.abs(n.getZ(i))>.99){close(uv[i*2],pos.getX(i)*2,'wood follows long X grain');report.uvFaces++}
  }
}
const cylinder=builder.cylinder(0,0,0,.2,1,'metal'),c=l11PropGeometry(cylinder),normal=c.geometry.getAttribute('normal'),cu=c.geometry.getAttribute('uv')
for(let i=0;i<normal.count;i++)if(Math.abs(normal.getY(i))<.1)close(c.uv[i*2],cu.getX(i)*Math.PI*.4,'cylinder circumference')
const board=builder.box(0,0,0,1.2,.025,.14,'rawwood');board.grain='x';board.uvOffset=[0,0]
const rawWood=l11PropGeometry(board)
for(let i=0;i<rawWood.geometry.attributes.position.count;i++)if(Math.abs(rawWood.geometry.attributes.normal.getY(i))>.99)close(rawWood.uv[i*2+1],rawWood.geometry.attributes.position.getX(i)*board.w,'Wood092 V grain follows the board')

for(const def of L11_DECOR_DEFS){
  assert.equal(def.front,'-z');const pieces=l11PropParts(def.id),box=new THREE.Box3()
  const s:Structure={kind:def.id,x:5,y:-9,w:def.w,h:def.d,solid:def.solid,data:{deg:37}}
  const colliders=l11PropColliders(s),solid=pieces.filter(p=>p.solid)
  assert.equal(colliders.length,solid.length+l11StreetSignSolids(s).length,`${def.id} includes attached sign collision`)
  for(const p of pieces){
    const {geometry,matrix,uv}=l11PropGeometry(p),pos=geometry.getAttribute('position')
    assert(uv.every(Number.isFinite));assert.equal(uv.length,pos.count*2)
    for(let i=0;i<pos.count;i++){
      const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(matrix);box.expandByPoint(v)
      if(p.solid){
        const collider=colliders[solid.indexOf(p)],angle=-37*Math.PI/180,x=s.x+s.w/2+v.x*Math.cos(angle)-v.z*Math.sin(angle),y=s.y+s.h/2+v.x*Math.sin(angle)+v.z*Math.cos(angle)
        assert(v.y>=collider.bottom-1e-5&&v.y<=collider.top+1e-5,`${def.id} collider height`)
        assert(circlePolygon(x,y,.00002,collider.polygon),`${def.id} render/collision rotation`);report.colliderVertices++
      }
    }
    report.parts++
  }
  assert(box.min.y>=-.055,`${def.id} below floor: ${box.min.y}`)
  report.bounds[def.id]=[...box.min.toArray(),...box.max.toArray()];report.prototypes++
}
// Regressions that generic finite/bounds checks cannot detect.
const ring=(id:string)=>l11PropParts('l11_'+id).find(p=>p.shape==='ring')!
for(const id of ['manhole','stove','fountain'])close(Math.abs(ring(id).rx??0),Math.PI/2,id+' horizontal ring')
close(ring('life_ring').rx??0,0,'upright life ring');close(ring('delivery_bike').ry??0,Math.PI/2,'bicycle wheel plane')
assert(l11PropParts('l11_sofa').some(p=>p.surface==='fabric'))
for(const id of ['phone_booth','exhibit_case','park_lamp','bus_shelter'])assert(l11PropParts('l11_'+id).some(p=>p.shape==='plane'&&p.surface==='glass'),id+' single glass panes')
const room=rectangle(-8,-7,16,14)
for(const [u,v]of [[-7,0],[7,0],[0,-6],[0,6]]){
  const slot=l11WallSlot(room,u,v,1.2,.6)!;assert(slot)
  assert(inPolygon(slot.u+Math.sin(slot.turn),slot.v-Math.cos(slot.turn),room))
  close(Math.hypot(slot.u-slot.wall[0],slot.v-slot.wall[1]),.48,'cabinet rear gap')
}
const courtyard=[...room,...rectangle(-2,-2,4,4)]
const inner=l11WallSlot(courtyard,0,-2.6,1,.5)!;assert(inPolygon(inner.u+Math.sin(inner.turn),inner.v-Math.cos(inner.turn),courtyard))
assert(l11FootprintsOverlap(rectangle(-1,-.1,2,.2),rectangle(-.1,-1,.2,2)),'crossing thin footprints')
assert(!l11FootprintsOverlap(rectangle(-.5,-.5,1,1),courtyard),'courtyard hole remains empty')
assert(!l11FootprintsOverlap(transform(rectangle(-.5,-.5,1,1),-12,-12,.63),room))
for(const a of [0,.27,-.46,Math.PI/2])for(const side of [-1,1]){
  close(Math.sin(l11CurbFacing(a,side)),Math.sin(a)*side,'curb normal X');close(-Math.cos(l11CurbFacing(a,side)),-Math.cos(a)*side,'curb normal Y')
  close(Math.sin(l11TrafficFacing(a,side)),-Math.cos(a)*side,'traffic X');close(-Math.cos(l11TrafficFacing(a,side)),-Math.sin(a)*side,'traffic Y')
}
for(const seed of [42,20261006,-17])for(const [cx,cy]of [...Array.from({length:12},(_,i)=>i).flatMap(y=>Array.from({length:12},(_,x)=>[x,y])),...Array.from({length:12},(_,y)=>y).flatMap(y=>Array.from({length:8},(_,x)=>[x+20,y])),[-1,-1],[-32,0],[31,32],[32,31],[-33,-32]]){
  const raw=genL11ChunkRaw(L11,seed,cx,cy)
  for(const s of raw.structures){
    if(s.data?.roadInset){
      const box=new THREE.Box3()
      for(const part of l11PropParts(s.kind)){const {geometry,matrix}=l11PropGeometry(part);geometry.computeBoundingBox();box.union(geometry.boundingBox!.clone().applyMatrix4(matrix))}
      const mount=Number(s.data.mount)
      assert(box.max.y+mount>L11_ROAD_SURFACE_LIFT+.002&&box.min.y+mount<L11_ROAD_SURFACE_LIFT,'inset is visible above asphalt and embedded in it')
      assert(box.max.y+mount<L11_ROAD_SURFACE_LIFT+.02,'inset has no raised lip taller than 2cm');report.roadInsets++
    }
    const data=s.data,role=String(data?.placementRole??'');if(!role)continue
    const angle=-Number(data?.deg??0)*Math.PI/180,x=s.x+s.w/2,y=s.y+s.h/2,dx=Number(data?.facingX)-x,dy=Number(data?.facingY)-y
    const dot=(Math.sin(angle)*dx-Math.cos(angle)*dy)/Math.hypot(dx,dy)
    close(dot,1,`${s.kind} ${role} faces its target`)
    if(role==='wall'){
      const b=raw.l11!.buildings.find(b=>b.id===data?.buildingId)!,def=l11DecorDef(s.kind)!
      const uv=l11Local(b,x,y),ahead=l11Local(b,x+Math.sin(angle)*.2,y-Math.cos(angle)*.2)
      assert(inPolygon(...uv,b.localFootprint)&&inPolygon(...ahead,b.localFootprint),'wall furniture faces room')
      close(Math.hypot(x-Number(data?.wallX),y-Number(data?.wallY)),def.d/2+.18,'generated cabinet back to wall')
    }
    if(data?.l11Interior){
      const def=l11DecorDef(s.kind)!,footprint=transform(rectangle(-def.w/2,-def.d/2,def.w,def.d),x,y,angle)
      for(const locker of raw.structures.filter(q=>q.kind==='locker'&&q.floor===s.floor))assert(!l11FootprintsOverlap(footprint,rectangle(locker.x,locker.y,locker.w,locker.h)),`${s.kind} overlaps searchable locker`)
    }
    report.placements++;report.byRole[role]=(report.byRole[role]??0)+1
  }
}
for(const role of ['wall','seating','vehicle','roadside','traffic-signal','service-wall','waterfront-seat'])assert(report.byRole[role]>0,`${role} sampled`)
assert(report.roadInsets>0,'road inset height sampled')
await mkdir('reports/l11-props',{recursive:true});await writeFile('reports/l11-props/prop-check.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({...report,bounds:undefined},null,2))
