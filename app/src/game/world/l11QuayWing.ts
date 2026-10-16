import type { L11Building,L11Volume } from './l11Types'
import {rectangle,transform,type Point} from './l11Geometry'

/** Canonical frontage coordinates: u runs along the quay, v goes into the
 * building. The same service wall, projecting glazed wing and stair recess
 * rotate together, including on ordinary oblique city lots. */
export function l11QuayWing(w:number,d:number,front:L11Building['front']){
  const ew=front==='e'||front==='w',span=ew?d:w,depth=ew?w:d,projection=Math.min(5,depth*.19),wing=span*.35,stair=Math.min(6.8,span*.3)
  const point=(u:number,v:number):Point=>front==='e'?[w-v,u]:front==='w'?[v,d-u]:front==='s'?[w-u,d-v]:[u,v]
  const local=(x:number,y:number):Point=>front==='e'?[y,w-x]:front==='w'?[d-y,x]:front==='s'?[w-x,d-y]:[x,y]
  const rect=(u:number,v:number,width:number,length:number,lo:number,hi:number):L11Volume=>{
    const a=point(u,v),b=point(u+width,v+length)
    return {x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),w:Math.abs(b[0]-a[0]),d:Math.abs(b[1]-a[1]),lo,hi}
  }
  return {span,depth,projection,wing,stair,point,local,rect,ew}
}
export function l11QuayStairFootprint(b:L11Building){
  const q=l11QuayWing(b.width,b.depth,b.front),v=q.rect(q.wing,0,q.stair+.4,q.projection+.12,0,3)
  return transform(rectangle(v.x,v.y,v.w,v.d),b.ox,b.oy,b.angle)
}
