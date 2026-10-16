import type {L11Building,L11Volume} from './l11Types'
import type {Point} from './l11Geometry'

/** u follows the frontage; v goes from the street into the two slabs. The
 * connector and the shared entrance rotate with the lot's street side. */
export function l11Twins(w:number,d:number,front:L11Building['front']){
  const ew=front==='e'||front==='w',span=ew?d:w,depth=ew?w:d
  const start=span*.57,gap=span*.2,end=start+gap,linkDepth=Math.max(3.5,Math.min(12,depth*.15))
  const point=(u:number,v:number):Point=>front==='w'?[v,u]:front==='e'?[w-v,u]:front==='s'?[u,d-v]:[u,v]
  const local=(x:number,z:number):Point=>front==='w'?[z,x]:front==='e'?[z,w-x]:front==='s'?[x,d-z]:[x,z]
  const rect=(u:number,v:number,width:number,length:number,lo:number,hi:number):L11Volume=>{
    const a=point(u,v),b=point(u+width,v+length)
    return {x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),w:Math.abs(b[0]-a[0]),d:Math.abs(b[1]-a[1]),lo,hi}
  }
  const inwardFirst=ew?'s':'e',inwardSecond=ew?'n':'w'
  return {ew,span,depth,start,gap,end,linkDepth,point,local,rect,inwardFirst,inwardSecond} as const
}
