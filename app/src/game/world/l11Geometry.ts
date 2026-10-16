import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'

export type Point = [number, number]
export type { MultiPolygon, Polygon, Ring }
// A fixed sub-millimetre grid prevents almost-collinear road seams from
// producing unmatched sweep-line segments, including at negative coordinates.
type Geometry = Polygon | MultiPolygon
const snapped = new WeakMap<Geometry, Geometry>()
function snap(p:Geometry,scale=10000):Geometry {
  if(scale===10000&&snapped.has(p))return snapped.get(p)!
  const visit=(a:unknown):unknown=>Array.isArray(a)?a.map(visit):Math.round(Number(a)*scale)/scale
  const out=visit(p) as Geometry
  if(scale===10000)snapped.set(p,out)
  return out
}
function operation(name:keyof typeof polygonClipping,first:Geometry,...rest:Geometry[]):MultiPolygon {
  try{return polygonClipping[name](snap(first),...rest.map(p=>snap(p)))}
  catch(error){
    // Still deterministic, with at most one millimetre of geometric tolerance.
    // Never replace failed geometry with an empty city block.
    try{return polygonClipping[name](snap(first,1000),...rest.map(p=>snap(p,1000)))}
    catch{throw new Error(`L11 ${name}: ${String(error)}`)}
  }
}
export const clipping={
  union:(first:Geometry,...rest:Geometry[])=>operation('union',first,...rest),
  intersection:(first:Geometry,...rest:Geometry[])=>operation('intersection',first,...rest),
  difference:(first:Geometry,...rest:Geometry[])=>operation('difference',first,...rest),
  xor:(first:Geometry,...rest:Geometry[])=>operation('xor',first,...rest),
}
export const rectangle = (x:number,y:number,w:number,h:number):Polygon => [[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]
export const ringArea = (r:Ring) => Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0))/2
export const area = (p:Polygon) => ringArea(p[0])-p.slice(1).reduce((s,r)=>s+ringArea(r),0)
export function bounds(p:Polygon|MultiPolygon) {
  const points=p.flat(3) as number[], xs:number[]=[],ys:number[]=[]
  for(let i=0;i<points.length;i+=2){xs.push(points[i]);ys.push(points[i+1])}
  const x=Math.min(...xs),y=Math.min(...ys)
  return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y}
}
export function inRing(x:number,y:number,r:Ring) {
  let inside=false
  for(let i=0,j=r.length-1;i<r.length;j=i++){
    const a=r[i],b=r[j]
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside
  }
  return inside
}
export const inPolygon=(x:number,y:number,p:Polygon)=>inRing(x,y,p[0])&&!p.slice(1).some(r=>inRing(x,y,r))
export function segmentDistance(x:number,y:number,a:Point,b:Point) {
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)))
  return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)
}
export function circlePolygon(x:number,y:number,r:number,p:Polygon) {
  if(inPolygon(x,y,p))return true
  return p.some(ring=>ring.some((a,i)=>segmentDistance(x,y,a,ring[(i+1)%ring.length])<=r+1e-7))
}
export function transform(p:Polygon,x:number,y:number,angle:number):Polygon {
  const c=Math.cos(angle),s=Math.sin(angle)
  return p.map(r=>r.map(([u,v])=>[x+u*c-v*s,y+u*s+v*c]))
}
export function strip(a:Point,b:Point,width:number):Polygon {
  const d=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/d*width/2,ny=(b[0]-a[0])/d*width/2
  return [[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny],[a[0]+nx,a[1]+ny]]]
}
export const intersects=(a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number})=>a.x+a.w>b.x&&a.y+a.h>b.y&&a.x<b.x+b.w&&a.y<b.y+b.h
