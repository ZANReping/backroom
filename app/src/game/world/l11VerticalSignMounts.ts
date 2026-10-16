import type { L11Building } from './l11Types'
import { l11VerticalSign } from '../content/l11VerticalSigns'

/** Both models and physics attach to an actual upper volume, never a lot edge
 * outside a setback. Mounts are ordinary deterministic building data. */
export function l11VerticalSignMount(b:L11Building){
  const choice=b.verticalSign;if(!choice)return null
  const spec=l11VerticalSign(choice.id),volume=b.volumes.filter(v=>!v.soffit&&v.hi-v.lo>=spec.height+1).sort((a,c)=>c.hi-a.hi||c.w*c.d-a.w*a.d)[0]
  if(!volume)return null
  const side=choice.side,nx=side==='e'?1:side==='w'?-1:0,nz=side==='s'?1:side==='n'?-1:0,tx=nz,tz=-nx
  const u=Math.max(spec.width/2+.7,Math.min(4,Math.min(volume.w,volume.d)*.2))
  const faceX=nx?volume.x+(nx>0?volume.w:0):volume.x+u,faceZ=nz?volume.y+(nz>0?volume.d:0):volume.y+volume.d-u
  const blade=choice.mount==='blade',offset=blade?spec.width/2+.32:.29,y=Math.max(volume.lo+.5,Math.min(9,volume.hi-spec.height-1))+spec.height/2
  const x=faceX+nx*offset,z=faceZ+nz*offset,angle=Math.atan2(nx,nz)+(blade?Math.PI/2:0)
  const w=Math.abs(Math.cos(angle))*spec.width+Math.abs(Math.sin(angle))*spec.depth,d=Math.abs(Math.sin(angle))*spec.width+Math.abs(Math.cos(angle))*spec.depth
  return {spec,blade,x,y,z,angle,w,d,faceX,faceZ,nx,nz,tx,tz,offset}
}
