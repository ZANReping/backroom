import assert from 'node:assert/strict'
import {l3PipeTurn,l3PipeElbow} from '../src/game/renderer/l3PipeRouting'

let corners=0
for(const concave of [true,false])for(const sx of [-1,1])for(const sz of [-1,1]){
 const floor=(x:number,z:number)=>concave?(x+.5)*sx>0&&(z+.5)*sz>0:(x+.5)*sx>0||(z+.5)*sz>0
 const inward=concave?sx:-sx,side=-sz
 const a=l3PipeTurn('x',0,0,inward,side,floor);assert(a);assert.equal(a.concave,concave)
 const b=l3PipeTurn('z',0,0,a.otherInward,a.otherSide,floor);assert(b)
 for(let k=0;k<5;k++){
  const inset=.075+k*.039,y=2.59-k*.095
  const x=l3PipeElbow('x',0,0,inward,side,a,inset,y)
  const z=l3PipeElbow('z',0,0,a.otherInward,a.otherSide,b,inset,y)
  const distance=(p:number[],q:number[])=>Math.hypot(...p.map((v,i)=>v-q[i]))
  assert(distance(x.points[0],z.points.at(-1)!)<1e-8,'both runs share exactly the same tangent points')
  assert(distance(x.points.at(-1)!,z.points[0])<1e-8,'perpendicular run joins without gap')
  assert(x.trim>0&&x.trim<.5,'one-tile run keeps a positive straight between two corners')
  assert(Math.abs(x.points[0][0]-inward*x.trim)<1e-8)
  assert(Math.abs(x.points[0][2]+side*(.015+inset))<1e-8)
  const radius=k===0?.036:.021
  for(const p of x.points){
   assert(p.every(Number.isFinite))
   // Sample the full pipe cross section against the solid wall quadrants.
   for(let i=0;i<16;i++){
    const a=i*Math.PI/8,px=p[0]+Math.cos(a)*radius,pz=p[2]+Math.sin(a)*radius
    assert(floor(Math.floor(px),Math.floor(pz)),'rounded elbow stays outside masonry')
   }
  }
 }
 corners++
}
assert.equal(l3PipeTurn('x',0,0,1,-1,(_x,z)=>z>=0),null,'straight seam is not a corner')
console.log(`${corners} inner/outer corner orientations × 5 pipes: tangent continuity, wall clearance and finite geometry passed`)
