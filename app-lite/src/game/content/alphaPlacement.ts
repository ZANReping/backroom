import type { Structure } from '../core/types'
import type { Rect, RoomSpec } from './settlementTypes'
import { alphaParts, isAlphaKind } from './alphaDecor'

export interface AlphaDoorway extends Rect { room:string; side:RoomSpec['door']; cx:number; cy:number }
export const alphaWindowOpenings=(r:Rect)=>{
 const width=2.2,gap=1,count=Math.max(1,Math.floor((r.h-2+gap)/(width+gap)))
 const start=(r.h-count*width-(count-1)*gap)/2
 return Array.from({length:count},(_,i)=>({offset:start+i*(width+gap),width,bottom:.9,height:1.45}))
}
/** Full 1.8 m doorway and 1.35 m approach on each side; no furniture may occupy it. */
export function alphaDoorway(r:RoomSpec,side=r.door):AlphaDoorway {
 const horizontal=side==='n'||side==='s',length=horizontal?r.w:r.h
 const offset=r.id==='radio'&&side==='n'?length-2.5:(length-1.8)/2
 const cx=horizontal?r.x+offset+.9:side==='e'?r.x+r.w-.09:r.x+.09
 const cy=horizontal?(side==='s'?r.y+r.h-.09:r.y+.09):r.y+offset+.9
 return {room:r.id,side,cx,cy,x:cx-(horizontal?1.02:1.35),y:cy-(horizontal?1.35:1.02),w:horizontal?2.04:2.7,h:horizontal?2.7:2.04}
}
export function alphaWorldParts(s:Structure){
 const parts=isAlphaKind(s.kind)?alphaParts(s):[{x:0,y:0,z:Number(s.data?.z??0),w:s.w,d:s.h,h:Number(s.data?.height??2),solid:s.solid}]
 const rad=Number(s.data?.deg??0)*Math.PI/180,c=Math.cos(rad),v=Math.sin(rad)
 return parts.map(p=>{
  const points=[[p.x,p.y],[p.x+p.w,p.y],[p.x,p.y+p.d],[p.x+p.w,p.y+p.d]].map(([x,y])=>{x-=s.w/2;y-=s.h/2;return [s.x+s.w/2+x*c+y*v,s.y+s.h/2-x*v+y*c]})
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1])
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),bottom:p.z,top:p.z+p.h,solid:p.solid}
 })
}
export const alphaOverlap=(a:Rect,b:Rect)=>a.x<b.x+b.w-1e-4&&a.x+a.w>b.x+1e-4&&a.y<b.y+b.h-1e-4&&a.y+a.h>b.y+1e-4
export function blocksAlphaDoor(s:Structure,doors:Rect[]){
 if(['alpha_wall','alpha_floor','alpha_ceiling','alpha_light','alpha_conduit','alpha_trim'].includes(s.kind))return false
 return alphaWorldParts(s).some(p=>p.top>.12&&p.bottom<2.25&&doors.some(d=>alphaOverlap(p,d)))
}
