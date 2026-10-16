import type { L11Building } from './l11Types'
import { rectangle,transform,type Point } from './l11Geometry'

export function l11EntranceFrame(b:L11Building){
  const a=b.doorAngle-b.angle,tx=Math.cos(a),ty=Math.sin(a),nx=ty,ny=-tx
  const point=(u:number,v:number):Point=>[b.doorLocal[0]+tx*u+nx*v,b.doorLocal[1]+ty*u+ny*v]
  return {tx,ty,nx,ny,point}
}
export function l11EntranceFootprint(b:L11Building){
  const e=b.entrance!;const {point}=l11EntranceFrame(b),p=point(0,0),a=b.doorAngle-b.angle
  return transform(transform(rectangle(-e.width/2-(e.gardens?5:0),-e.run,e.width+(e.gardens?10:0),e.run),...p,a),b.ox,b.oy,b.angle)
}
export function l11EntranceSurface(b:L11Building,x:number,y:number){
  const e=b.entrance;if(!e)return null
  const c=Math.cos(b.angle),s=Math.sin(b.angle),u=(x-b.ox)*c+(y-b.oy)*s,v=-(x-b.ox)*s+(y-b.oy)*c,{tx,ty,nx,ny}=l11EntranceFrame(b),dx=u-b.doorLocal[0],dy=v-b.doorLocal[1],along=dx*tx+dy*ty,out=dx*nx+dy*ny
  if(Math.abs(along)>e.width/2||out<-.1||out>e.run+.02)return null
  const landing=Math.min(1.5,e.run*.25),steps=Math.round(e.rise/.15),k=Math.min(steps,Math.max(0,Math.ceil((e.run-out)/(e.run-landing)*steps)))
  return b.base-e.rise+e.rise*k/steps
}
