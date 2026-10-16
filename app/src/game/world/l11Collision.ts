import type { Structure } from '../core/types'
import * as THREE from 'three'
import clipping from 'polygon-clipping'
import { type Polygon, type Point } from './l11Geometry'
import type { L11Building } from './l11Types'
import { l11InteriorWalls, l11BuildingColumns,l11VolumePolygon,l11StairRect } from './l11Layout'
import { l11PropParts } from '../content/l11PropParts'
import type { L11PropPart } from '../content/l11PropKit'
import { l11PropShape } from '../content/l11PropShapes'
import { l11ReferenceDetails } from './l11ReferenceDetails'
import { l11ShopSignSolids } from './l11ShopSigns'
import { l11Shopfront } from './l11Shopfront'
import { l11StreetSignSolids } from './l11StreetSignSolids'
import { l11SpecialBuildingParts,l11ShaftParts,l11ExitPartSolid,l11ExitDoorSolid,l11ArchiveBackingParts } from './l11ExitGeometry'
import { l11BoxSolid,l11MeshSolid,l11PlateSolid,l11SolidCollider,makeL11Solid,transformL11Solid,type L11Solid,type L11SolidCollider,type SolidPoint } from './l11Solid'

/** Wall segments and the entrance aperture are shared with the mesh builder. */
export function l11WallSegments(b:L11Building):{a:Point;b:Point;entrance:boolean}[]{
  const out:{a:Point;b:Point;entrance:boolean}[]=[]
  const shop=l11Shopfront(b),doors=shop?.available?[b.doorLocal,shop.door]:[b.doorLocal]
  for(const ring of b.localFootprint){
    // A courtyard is connected to the ground-floor circulation through the
    // inner edge closest to the street entrance. Meshes use this same aperture.
    const innerDoor=ring===b.localFootprint[0]?undefined:ring.slice(1).map((p,i)=>({i,len:Math.hypot(p[0]-ring[i][0],p[1]-ring[i][1]),distance:Math.hypot((p[0]+ring[i][0])/2-b.doorLocal[0],(p[1]+ring[i][1])/2-b.doorLocal[1])})).filter(e=>e.len>3).sort((a,b)=>a.distance-b.distance)[0]?.i
    for(let i=0;i<ring.length-1;i++){
    const a=ring[i],p=ring[i+1],len=Math.hypot(p[0]-a[0],p[1]-a[1])
    const tx=(p[0]-a[0])/len,ty=(p[1]-a[1])/len
    const centers=i===innerDoor?[len/2]:doors.flatMap(d=>{const t=(d[0]-a[0])*tx+(d[1]-a[1])*ty,off=Math.abs((d[0]-a[0])*ty-(d[1]-a[1])*tx);return off<.01&&t>1.2&&t<len-1.2?[t]:[]})
    if(!centers.length||b.sealed){out.push({a,b:p,entrance:false});continue}
    const point=(t:number):Point=>[a[0]+tx*t,a[1]+ty*t];let cursor=0
    for(const t of centers.sort((u,v)=>u-v)){const lo=Math.max(cursor,t-1.2),hi=t+1.2;if(lo>cursor)out.push({a:point(cursor),b:point(lo),entrance:false});out.push({a:point(lo),b:point(hi),entrance:true});cursor=hi}
    if(cursor<len)out.push({a:point(cursor),b:p,entrance:false})
  }
  }
  return out
}
const detailed=new WeakMap<Structure,readonly L11Solid[]>()
type HorizontalBounds={x0:number;y0:number;x1:number;y1:number}
const detailedBounds=new WeakMap<Structure,HorizontalBounds>()
const propBounds=new Map<string,HorizontalBounds>()
const horizontalBounds=(points:Iterable<readonly number[]>):HorizontalBounds=>{
  const out={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity}
  for(const p of points){out.x0=Math.min(out.x0,p[0]);out.x1=Math.max(out.x1,p[0]);out.y0=Math.min(out.y0,p[2]);out.y1=Math.max(out.y1,p[2])}return out
}
/** Broad-phase bounds never instantiate thousands of detailed facade
 * colliders. Their exact meshes are queried only near the player's body. */
export function l11StructureBounds(s:Structure):HorizontalBounds{
  let box:HorizontalBounds,angle:number,x:number,y:number
  if(s.l11){
    const b=s.l11;box=detailedBounds.get(s)??{x0:-2,y0:-2,x1:b.width+2,y1:b.depth+2}
    if(!detailedBounds.has(s))for(const p of l11ReferenceDetails(b)){box.x0=Math.min(box.x0,p.x-p.w/2);box.y0=Math.min(box.y0,p.z-p.d/2);box.x1=Math.max(box.x1,p.x+p.w/2);box.y1=Math.max(box.y1,p.z+p.d/2)}
    angle=b.angle;x=b.ox+s.x-b.x;y=b.oy+s.y-b.y
  }else{
    let hit=propBounds.get(s.kind)
    if(!hit){
      const vertices:SolidPoint[]=[],v=new THREE.Vector3()
      for(const p of l11PropParts(s.kind))if(p.solid){const {geometry,matrix}=l11PropShape(p),pos=geometry.getAttribute('position');for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(matrix);vertices.push([v.x,v.y,v.z])}}
      hit=horizontalBounds(vertices);propBounds.set(s.kind,hit)
    }
    box={...hit};for(const solid of l11StreetSignSolids(s)){const extra=horizontalBounds(solid.vertices);box.x0=Math.min(box.x0,extra.x0);box.y0=Math.min(box.y0,extra.y0);box.x1=Math.max(box.x1,extra.x1);box.y1=Math.max(box.y1,extra.y1)}
    angle=-Number(s.data?.deg??0)*Math.PI/180;x=s.x+s.w/2;y=s.y+s.h/2
  }
  const c=Math.cos(angle),n=Math.sin(angle)
  return horizontalBounds([[box.x0,0,box.y0],[box.x0,0,box.y1],[box.x1,0,box.y0],[box.x1,0,box.y1]].map(p=>[x+p[0]*c-p[2]*n,0,y+p[0]*n+p[2]*c]))
}
const cache=new WeakMap<Structure,{x:number;y:number;boxes:L11SolidCollider[]}>()
const sightCache=new WeakMap<Structure,{x:number;y:number;boxes:L11SolidCollider[]}>()
export let l11CollisionRevision=0
/** Published only after the complete LOD builder succeeds. Detail-zero physical
 * geometry remains authoritative when a coarser visual LOD is selected. */
export function setL11BuildingSolids(s:Structure,solids:readonly L11Solid[]){detailed.set(s,solids);detailedBounds.set(s,horizontalBounds(solids.flatMap(p=>p.vertices)));cache.delete(s);l11CollisionRevision++}
function plannedBuildingSolids(b:L11Building):L11Solid[]{
  if(b.archetype==='unfinished-frame'||b.archetype==='barred-brick')return [...l11SpecialBuildingParts(b),...l11ShaftParts(b)].map(l11ExitPartSolid).concat(l11ExitDoorSolid(b))
  const out:L11Solid[]=[]
  const wall=(a:Point,c:Point,lo:number,hi:number,t=.26)=>{if(hi<=lo)return;out.push(transformL11Solid(l11BoxSolid(0,(lo+hi)/2,0,Math.hypot(c[0]-a[0],c[1]-a[1]),hi-lo,t),(a[0]+c[0])/2,(a[1]+c[1])/2,Math.atan2(c[1]-a[1],c[0]-a[0])))}
  const plane=(p:Polygon,h:number)=>{const rings=p.map(r=>r.slice(0,-1).map(p=>new THREE.Vector2(...p))),pts=rings.flat();for(const ids of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))){const s=l11PlateSolid(ids.map(i=>[pts[i].x,h,pts[i].y]));if(s)out.push(s)}}
  // Collision exists before rendering: complete room shell, correct openings,
  // slab holes, stair treads and distinct upper volumes instead of one tower.
  if(!b.sealed){
    for(let f=0;f<b.accessible;f++){
      for(const w of l11WallSegments(b))wall(w.a,w.b,f*3+(w.entrance&&f===0?2.45:0),(f+1)*3)
      const holes=f?[l11StairRect(b.stairs[f-1])]:[]
      for(const p of holes.length?clipping.difference(b.localFootprint,...holes):[b.localFootprint]){plane(p,f*3+.015);if(f)plane(p,f*3-.12)}
    }
    plane(b.localFootprint,b.accessible*3-.12)
    for(const w of l11InteriorWalls(b))wall(w.a,w.b,w.floor*3,w.floor*3+2.88,.16)
    for(const s of b.stairs)for(let k=0;k<18;k++){const x=s.axis==='x';out.push(l11BoxSolid(s.x+(x?(k+.5)*s.length/18:s.width/2),s.flight*3+(k+1)/6-.065,s.y+(x?s.width/2:(k+.5)*s.length/18),x?s.length/18:s.width,.13,x?s.width:s.length/18))}
  }
  for(const [x,y]of l11BuildingColumns(b))out.push(l11BoxSolid(x,1.4,y,.3,2.8,.3))
  for(const v of b.volumes){const p=l11VolumePolygon(v),lo=Math.max(v.lo,b.sealed?0:b.accessible*3)
    if(v.hi>lo)for(const r of p)for(let i=1;i<r.length;i++)wall(r[i-1],r[i],lo,v.hi)
    plane(p,v.hi)
    if(v.soffit)out.push(l11BoxSolid(v.x+v.w/2,v.lo+.08,v.y+v.d/2,v.w,.16,v.d))
  }
  for(const p of l11ReferenceDetails(b))if(p.solid!==false){const solid=l11BoxSolid(p.x,p.y,p.z,p.w,p.h,p.d);if(p.slope)solid.vertices=solid.vertices.map(v=>[v[0],v[1]+(v[0]-p.x)*p.slope![0]+(v[2]-p.z)*p.slope![1],v[2]]);out.push(solid)}
  out.push(...l11ShopSignSolids(b))
  out.push(...l11ExitDoorSolid(b))
  out.push(...l11ArchiveBackingParts(b).map(l11ExitPartSolid))
  return out
}
export function l11BuildingColliders(s:Structure):L11SolidCollider[]{
  const hit=cache.get(s);if(hit&&hit.x===s.x&&hit.y===s.y)return hit.boxes
  const b=s.l11!,solids=detailed.get(s)??plannedBuildingSolids(b)
  const boxes=solids.map(p=>l11SolidCollider(transformL11Solid(p,b.ox+s.x-b.x,b.oy+s.y-b.y,b.angle)))
  cache.set(s,{x:s.x,y:s.y,boxes});return boxes
}
/** The exploration map follows the shared room/envelope plan. Window mullions,
 * cornices and roof hardware do not introduce extra rooms or thousands of
 * visibility obstacles; body collision still uses the detailed physical mesh. */
export function l11BuildingSightColliders(s:Structure):L11SolidCollider[]{
  const hit=sightCache.get(s);if(hit&&hit.x===s.x&&hit.y===s.y)return hit.boxes
  const b=s.l11!,boxes=plannedBuildingSolids(b).map(p=>l11SolidCollider(transformL11Solid(p,b.ox+s.x-b.x,b.oy+s.y-b.y,b.angle)))
  sightCache.set(s,{x:s.x,y:s.y,boxes});return boxes
}
const partSolids=new WeakMap<L11PropPart,L11Solid[]>()
function propSolids(p:L11PropPart):L11Solid[]{
  const hit=partSolids.get(p);if(hit)return hit
  const {geometry,matrix}=l11PropShape(p),pos=geometry.getAttribute('position'),v=new THREE.Vector3(),vertices:SolidPoint[]=[]
  for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(matrix);vertices.push(v.toArray() as SolidPoint)}
  let out:L11Solid[]
  if(p.shape==='plane'){
    const plate=l11PlateSolid([vertices[0],vertices[1],vertices[3],vertices[2]]);out=plate?[plate]:[]
  }else if(p.shape==='ring'){
    // A torus is not convex. Keep each tube segment separate so the wheel's
    // centre stays empty, including when its plane is rotated vertically.
    const {radialSegments:n,tubularSegments:m}=(geometry as THREE.TorusGeometry).parameters
    out=Array.from({length:m},(_,k)=>{
      const points=Array.from({length:n*2},(_,i)=>vertices[(i%n)*(m+1)+k+Math.floor(i/n)])
      return makeL11Solid(points,[Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>i+n),...Array.from({length:n},(_,i)=>[i,(i+1)%n,(i+1)%n+n,i+n])])
    })
  }else out=[l11MeshSolid(vertices.flat(),geometry.index?.array??Array.from({length:pos.count},(_,i)=>i))]
  partSolids.set(p,out);return out
}
const propCache=new WeakMap<Structure,{x:number;y:number;deg:number;boxes:L11SolidCollider[]}>()
export function l11PropColliders(s:Structure):L11SolidCollider[]{
  const deg=Number(s.data?.deg??0),hit=propCache.get(s);if(hit&&hit.x===s.x&&hit.y===s.y&&hit.deg===deg)return hit.boxes
  const angle=-deg*Math.PI/180,cx=s.x+s.w/2,cy=s.y+s.h/2
  const boxes=l11PropParts(s.kind).filter(p=>p.solid).map(p=>{
    const grade=Number(s.data?.grade??0)
    const pieces=propSolids(p).map(v=>l11SolidCollider(transformL11Solid(grade?{...v,vertices:v.vertices.map(q=>[q[0],q[1]+q[0]*grade,q[2]] as SolidPoint)}:v,cx,cy,angle)))
    if(pieces.length===1)return pieces[0]
    const envelope=l11SolidCollider(makeL11Solid(pieces.flatMap(p=>p.volume.vertices),[]));envelope.pieces=pieces;return envelope
  })
  boxes.push(...l11StreetSignSolids(s).map(v=>l11SolidCollider(transformL11Solid(v,cx,cy,angle))))
  propCache.set(s,{x:s.x,y:s.y,deg,boxes});return boxes
}
const nearby=new WeakMap<readonly L11SolidCollider[],Map<string,L11SolidCollider[]>>()
/** A building can contain thousands of real trim/roof pieces. Narrow phase
 * visits only the 2m cells under the body, never all pieces on every step. */
export function l11CollidersNear(boxes:readonly L11SolidCollider[],x:number,y:number,r:number):Iterable<L11SolidCollider>{
  let grid=nearby.get(boxes)
  if(!grid){grid=new Map();for(const b of boxes)for(let j=Math.floor(b.y0/2);j<=Math.floor(b.y1/2);j++)for(let i=Math.floor(b.x0/2);i<=Math.floor(b.x1/2);i++){const key=`${i},${j}`,items=grid.get(key);if(items)items.push(b);else grid.set(key,[b])}nearby.set(boxes,grid)}
  const found=new Set<L11SolidCollider>()
  for(let j=Math.floor((y-r)/2);j<=Math.floor((y+r)/2);j++)for(let i=Math.floor((x-r)/2);i<=Math.floor((x+r)/2);i++)for(const b of grid.get(`${i},${j}`)??[])if(x+r>=b.x0&&x-r<=b.x1&&y+r>=b.y0&&y-r<=b.y1)found.add(b)
  return found
}
