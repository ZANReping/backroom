import assert from 'node:assert/strict'
import {clipL1VaultTriangle,l1VaultSplitHeight} from '../src/game/world/l1VaultMesh'
import {buildL1Data,l1BuildingRoof,l1ModuleAt} from '../src/game/world/l1Building'
import {L1_PHOTO_ANCHORS,L1_SHOWCASE_SEED} from '../src/game/world/l1Spatial'
const a=L1_PHOTO_ANCHORS.find(a=>a.id==='gothic')!,p=l1ModuleAt(L1_SHOWCASE_SEED,a.centerX,a.centerY),cx=p.phaseX,cz=p.phaseZ,r=p.columnWidth/2
assert.equal(l1ModuleAt(0,0,0,'gothic').springHeight,undefined)
const generated=buildL1Data(L1_SHOWCASE_SEED,Math.floor(a.centerX/32),0,'gothic').boxes.find(b=>b.id.startsWith('column:'))!
const columnX=(generated.min[0]+generated.max[0])/2,columnZ=(generated.min[2]+generated.max[2])/2
assert.equal(generated.max[1],l1BuildingRoof(L1_SHOWCASE_SEED,columnX,columnZ,true))
// A split on an existing edge must not resample the curved surface and open a
// crack against the adjoining unsplit triangle.
assert.equal(l1VaultSplitHeight(L1_SHOWCASE_SEED,[[cx+1,2,cz],[cx+2,3,cz],[cx+2,4,cz+1]],[cx+1.5,cz]),2.5)
type P=[number,number]
for(const [step,segments]of [[1/6,24],[1/3,12]]){
 let area=0,seam=0
 const n=Math.round(4/step)
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){
  const point=(dx:number,dz:number):P=>[cx-2+(x+dx)*step,cz-2+(z+dz)*step]
  for(const tri of [[point(0,0),point(1,0),point(1,1)],[point(0,0),point(1,1),point(0,1)]]){
   const pieces=clipL1VaultTriangle(L1_SHOWCASE_SEED,tri,segments)??[tri]
   const spatial=tri.map(v=>[v[0],l1BuildingRoof(L1_SHOWCASE_SEED,v[0],v[1],true),v[1]] as [number,number,number])
   // A vertex on another polygon's edge must also be that edge's vertex when
   // its height is not linear. Otherwise the XZ coverage test misses 3D cracks.
   const vertices=pieces.flat()
   for(const polygon of pieces)for(let j=0;j<polygon.length;j++){
    const a=polygon[j],b=polygon[(j+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],d2=dx*dx+dz*dz
    if(d2<1e-15)continue
    for(const v of vertices){const t=((v[0]-a[0])*dx+(v[1]-a[1])*dz)/d2
     if(t<1e-7||t>1-1e-7||Math.hypot(v[0]-a[0]-dx*t,v[1]-a[1]-dz*t)>1e-8)continue
     const linear=l1VaultSplitHeight(L1_SHOWCASE_SEED,spatial,a)*(1-t)+l1VaultSplitHeight(L1_SHOWCASE_SEED,spatial,b)*t
     assert(Math.abs(linear-l1VaultSplitHeight(L1_SHOWCASE_SEED,spatial,v))<1e-6,'nonconforming springing edge opens a 3D crack')
    }
   }
   for(const polygon of pieces){
    for(const v of polygon){
     assert(v.every(Number.isFinite))
     if(Math.hypot(v[0]-cx,v[1]-cz)<=r+1e-8&&!tri.some(q=>Math.hypot(q[0]-v[0],q[1]-v[1])<1e-7)){
      assert(Math.abs(l1BuildingRoof(L1_SHOWCASE_SEED,v[0],v[1],true)-(p.springHeight??1.35))<1e-5,'shaft/roof boundary height');seam++
     }
    }
    for(let j=1;j<polygon.length-1;j++){const [v,b,c]=[polygon[0],polygon[j],polygon[j+1]];area+=Math.abs((b[0]-v[0])*(c[1]-v[1])-(b[1]-v[1])*(c[0]-v[0]))/2}
   }
  }
 }
 const expected=16-segments*r*r*Math.sin(2*Math.PI/segments)/2
 assert(Math.abs(area-expected)<1e-5,`roof coverage ${segments}: ${area} vs ${expected}`);assert(seam>0)
 console.log(JSON.stringify({segments,area,expected,seam}))
}
