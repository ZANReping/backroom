import { bounds, circlePolygon, inPolygon, type Point, type Polygon } from './l11Geometry'

/** Metres, Three-compatible XYZ (Y is vertical). Convex pieces retain their
 * actual height-dependent section instead of extruding a projected AABB. */
export type SolidPoint = [number,number,number]
export interface L11Solid { vertices:SolidPoint[]; faces:number[][]; edges:[number,number][] }
export interface L11SolidCollider {
  x0:number;y0:number;x1:number;y1:number;bottom:number;top:number;stand:boolean;polygon:Polygon;volume:L11Solid
  pieces?:L11SolidCollider[]
}
export function convexHull2(points:Point[]):Point[]{
  const ps=[...new Map(points.map(p=>[`${p[0].toFixed(7)},${p[1].toFixed(7)}`,p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1])
  if(ps.length<3)return ps
  const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lo:Point[]=[],hi:Point[]=[]
  for(const p of ps){while(lo.length>1&&cross(lo.at(-2)!,lo.at(-1)!,p)<=1e-10)lo.pop();lo.push(p)}
  for(let i=ps.length-1;i>=0;i--){const p=ps[i];while(hi.length>1&&cross(hi.at(-2)!,hi.at(-1)!,p)<=1e-10)hi.pop();hi.push(p)}
  const out=lo.slice(0,-1).concat(hi.slice(0,-1));out.push(out[0]);return out
}
export function makeL11Solid(vertices:SolidPoint[],faces:number[][]):L11Solid {
  const seen=new Map<string,[number,number]>()
  for(const f of faces)for(let i=0;i<f.length;i++){const a=f[i],b=f[(i+1)%f.length];seen.set(a<b?`${a}:${b}`:`${b}:${a}`,[a,b])}
  return {vertices,faces,edges:[...seen.values()]}
}
export function l11MeshSolid(positions:ArrayLike<number>,indices:ArrayLike<number>):L11Solid {
  const vertices:SolidPoint[]=[],remap:number[]=[],keys=new Map<string,number>()
  for(let i=0;i<positions.length;i+=3){const p:SolidPoint=[positions[i],positions[i+1],positions[i+2]],key=p.map(n=>n.toFixed(6)).join(',');let id=keys.get(key);if(id===undefined){id=vertices.length;vertices.push(p);keys.set(key,id)}remap.push(id)}
  const faces:number[][]=[]
  for(let i=0;i<indices.length;i+=3){const f=[remap[indices[i]],remap[indices[i+1]],remap[indices[i+2]]];if(new Set(f).size===3)faces.push(f)}
  return makeL11Solid(vertices,faces)
}
export function l11BoxSolid(x:number,y:number,z:number,w:number,h:number,d:number):L11Solid {
  return makeL11Solid([[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]].map(p=>[x+p[0]*w/2,y+p[1]*h/2,z+p[2]*d/2]),[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])
}
/** A render plane has no volume. Give it 4mm of thickness *below* its visible
 * face, preserving the roof/floor datum and its exact sloping profile. */
export function l11PlateSolid(points:SolidPoint[],thickness=.004):L11Solid|null {
  const [a,b,c]=points,ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2]
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz)
  if(len<1e-8)return null
  if(ny<0)len=-len;nx/=len;ny/=len;nz/=len
  const n=points.length,vertices=points.concat(points.map(p=>[p[0]-nx*thickness,p[1]-ny*thickness,p[2]-nz*thickness] as SolidPoint))
  return makeL11Solid(vertices,[points.map((_,i)=>i),points.map((_,i)=>n+i),...points.map((_,i)=>[i,(i+1)%n,(i+1)%n+n,i+n])])
}
export function transformL11Solid(s:L11Solid,x:number,z:number,angle:number,y=0):L11Solid {
  const c=Math.cos(angle),n=Math.sin(angle)
  return {...s,vertices:s.vertices.map(p=>[x+p[0]*c-p[2]*n,y+p[1],z+p[0]*n+p[2]*c])}
}
export function l11SolidCollider(volume:L11Solid):L11SolidCollider {
  const polygon=[convexHull2(volume.vertices.map(p=>[p[0],p[2]]))],b=bounds(polygon),heights=volume.vertices.map(p=>p[1])
  return {x0:b.x,y0:b.y,x1:b.x+b.w,y1:b.y+b.h,bottom:Math.min(...heights),top:Math.max(...heights),stand:true,polygon,volume}
}
/** Clip the convex solid by the character's vertical interval, then intersect
 * the resulting exact horizontal projection with the character's circle. */
export function l11SolidHits(b:L11SolidCollider,x:number,y:number,r:number,lo:number,hi:number):boolean {
  if(b.pieces)return b.pieces.some(p=>l11SolidHits(p,x,y,r,lo,hi))
  lo+=.0001;hi-=.0001
  if(lo>=b.top||hi<=b.bottom||x+r<b.x0||x-r>b.x1||y+r<b.y0||y-r>b.y1)return false
  const points:Point[]=[],v=b.volume.vertices
  for(const p of v)if(p[1]>=lo&&p[1]<=hi)points.push([p[0],p[2]])
  for(const [i,j]of b.volume.edges){const a=v[i],c=v[j],d=c[1]-a[1];if(Math.abs(d)<1e-9)continue
    for(const h of [lo,hi]){const t=(h-a[1])/d;if(t>=0&&t<=1)points.push([a[0]+(c[0]-a[0])*t,a[2]+(c[2]-a[2])*t])}
  }
  return points.length>=3&&circlePolygon(x,y,r,[convexHull2(points)])
}
/** Exact segment/mesh test for millimetre glass and thin rails. Point samples
 * can jump across these surfaces even though body collision is correct. */
export function l11SolidSegmentHit(b:L11SolidCollider,from:SolidPoint,to:SolidPoint):boolean {
  if(b.pieces)return b.pieces.some(p=>l11SolidSegmentHit(p,from,to))
  const direction=to.map((n,i)=>n-from[i]),min=[b.x0,b.bottom,b.y0],max=[b.x1,b.top,b.y1]
  let enter=0,exit=1
  for(let i=0;i<3;i++){
    if(Math.abs(direction[i])<1e-10){if(from[i]<min[i]-1e-7||from[i]>max[i]+1e-7)return false;continue}
    const a=(min[i]-from[i])/direction[i],c=(max[i]-from[i])/direction[i]
    enter=Math.max(enter,Math.min(a,c));exit=Math.min(exit,Math.max(a,c));if(enter>exit+1e-7)return false
  }
  const v=b.volume.vertices,[dx,dy,dz]=direction
  for(const face of b.volume.faces)for(let i=1;i<face.length-1;i++){
    const a=v[face[0]],c=v[face[i]],d=v[face[i+1]],ux=c[0]-a[0],uy=c[1]-a[1],uz=c[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2]
    const px=dy*vz-dz*vy,py=dz*vx-dx*vz,pz=dx*vy-dy*vx,det=ux*px+uy*py+uz*pz
    if(Math.abs(det)<1e-10)continue
    const tx=from[0]-a[0],ty=from[1]-a[1],tz=from[2]-a[2],u=(tx*px+ty*py+tz*pz)/det
    if(u< -1e-7||u>1+1e-7)continue
    const qx=ty*uz-tz*uy,qy=tz*ux-tx*uz,qz=tx*uy-ty*ux,w=(dx*qx+dy*qy+dz*qz)/det
    if(w< -1e-7||u+w>1+1e-7)continue
    const t=(vx*qx+vy*qy+vz*qz)/det
    if(t>.00001&&t<.99999)return true
  }
  return false
}
/** Exact extremum of a plane clipped to a convex face and the circular foot.
 * Checks vertices, circle/edge intersections and the plane's circle extremum. */
export function l11SolidSurface(b:L11SolidCollider,x:number,y:number,r:number,upper=true):number {
  if(b.pieces)return b.pieces.reduce((h,p)=>upper?Math.max(h,l11SolidSurface(p,x,y,r,upper)):Math.min(h,l11SolidSurface(p,x,y,r,upper)),upper?-Infinity:Infinity)
  let best=upper?-Infinity:Infinity
  const v=b.volume.vertices,center=v.reduce((a,p)=>[a[0]+p[0]/v.length,a[1]+p[1]/v.length,a[2]+p[2]/v.length] as SolidPoint,[0,0,0] as SolidPoint)
  for(const ids of b.volume.faces){
    const a=v[ids[0]],c=v[ids[1]],d=v[ids[2]],u=c.map((n,i)=>n-a[i]),w=d.map((n,i)=>n-a[i])
    let nx=u[1]*w[2]-u[2]*w[1],ny=u[2]*w[0]-u[0]*w[2],nz=u[0]*w[1]-u[1]*w[0]
    if(nx*(center[0]-a[0])+ny*(center[1]-a[1])+nz*(center[2]-a[2])>0){nx=-nx;ny=-ny;nz=-nz}
    if(upper?ny<1e-9:ny> -1e-9)continue
    const ring=ids.map(i=>[v[i][0],v[i][2]] as Point);ring.push(ring[0]);const polygon=[ring]
    if(!circlePolygon(x,y,r,polygon))continue
    const gx=-nx/ny,gy=-nz/ny,at=(u:number,w:number)=>a[1]+gx*(u-a[0])+gy*(w-a[2]),sample=(u:number,w:number)=>{const h=at(u,w);best=upper?Math.max(best,h):Math.min(best,h)}
    if(inPolygon(x,y,polygon))sample(x,y)
    const length=Math.hypot(gx,gy),sign=upper?1:-1
    if(length>1e-9){const u=x+sign*r*gx/length,w=y+sign*r*gy/length;if(inPolygon(u,w,polygon))sample(u,w)}
    for(let i=1;i<ring.length;i++){
      const p=ring[i-1],q=ring[i],dx=q[0]-p[0],dy=q[1]-p[1],px=p[0]-x,py=p[1]-y,A=dx*dx+dy*dy,B=2*(px*dx+py*dy),C=px*px+py*py-r*r
      if(C<=1e-9)sample(...p)
      const disc=B*B-4*A*C;if(A<1e-12||disc<0)continue
      for(const t of [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)])if(t>=0&&t<=1)sample(p[0]+t*dx,p[1]+t*dy)
    }
  }
  return best
}
