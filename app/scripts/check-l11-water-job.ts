import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { bounds, clipping, rectangle, type Polygon } from '../src/game/world/l11Geometry'
import { L11_WATER_DEPTH, L11_WATER_SURFACE } from '../src/game/world/l11Hydrology'
import { l11CanalWaterJob } from '../src/game/renderer/l11Water'

const ox=-37.25,oy=19.5
const rect=(x:number,y:number,w:number,h:number):Polygon=>rectangle(x,y,w,h)
const fixtures:{name:string;polygons:Polygon[]}[]=[
  {name:'negative-rectangle',polygons:[rect(-13.5,-9.25,17.25,8.5)]},
  {name:'distant-narrow-canals',polygons:[rect(-300,-32,6,64),rect(300,-32,6,64)]},
  {name:'water-with-hole',polygons:[[[[-14,-8],[14,-8],[14,8],[-14,8],[-14,-8]],[[-5,-3],[5,-3],[5,3],[-5,3],[-5,-3]]]]},
  {name:'touching-overlap',polygons:[rect(2,2,11,6),rect(10,5,12,7)]},
]
const expected=(polygons:Polygon[],cell:number)=>{
  const merged=clipping.union(polygons[0],...polygons.slice(1)),bb=bounds(merged),positions:number[]=[],normals:number[]=[],uv:number[]=[],depth:number[]=[]
  for(let y=Math.floor(bb.y/cell)*cell;y<bb.y+bb.h;y+=cell)for(let x=Math.floor(bb.x/cell)*cell;x<bb.x+bb.w;x+=cell){
    for(const p of clipping.intersection(merged,rectangle(x,y,cell,cell))){
      const rings=p.map(r=>r.slice(0,-1).map(q=>new THREE.Vector2(...q))),pts=rings.flat()
      for(const tri of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1)))for(const i of [tri[0],tri[2],tri[1]]){const q=pts[i];positions.push(q.x-ox,L11_WATER_SURFACE,q.y-oy);normals.push(0,1,0);uv.push(q.x,q.y);depth.push(L11_WATER_DEPTH)}
    }
  }
  return Object.fromEntries(Object.entries({position:positions,normal:normals,uv,aDepth:depth}).map(([k,v])=>[k,Array.from(new Float32Array(v))]))
}
const attrs=(mesh:THREE.Mesh)=>Object.fromEntries(['position','normal','uv','aDepth'].map(k=>{const a=mesh.geometry.getAttribute(k);return [k,Array.from(a.array)]}))
const report:{fixture:string;cell:number;yieldCount:number;vertices:number;ok:boolean}[]=[]
for(const fixture of fixtures)for(const cell of [2,8]){
  const job=l11CanalWaterJob(fixture.polygons,ox,oy,false,cell);let yielded=0,next=job.next();while(!next.done){yielded++;next=job.next()}const mesh=next.value
  assert(mesh,`${fixture.name}/${cell} returned no mesh`)
  const actual=attrs(mesh),want=expected(fixture.polygons,cell)
  for(const k of Object.keys(want))assert.deepEqual(actual[k],want[k],`${fixture.name}/${cell} ${k}`)
  assert.equal(mesh.geometry.getAttribute('position').count,want.position.length/3)
  mesh.geometry.dispose();report.push({fixture:fixture.name,cell,yieldCount:yielded,vertices:want.position.length/3,ok:true})
}
assert(report.find(x=>x.fixture==='distant-narrow-canals'&&x.cell===2)!.yieldCount>1,'large fixture did not yield across frames')
mkdirSync('reports/dev-teleport-performance',{recursive:true});writeFileSync('reports/dev-teleport-performance/water-check.json',JSON.stringify({ok:true,fixtures:report},null,2));console.log(JSON.stringify({ok:true,fixtures:report}))
