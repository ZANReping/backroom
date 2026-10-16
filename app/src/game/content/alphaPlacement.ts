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
  const angle='yaw' in p?Number(p.yaw??0):0,pc=Math.cos(angle),ps=Math.sin(angle)
  const points=[[p.x,p.y],[p.x+p.w,p.y],[p.x,p.y+p.d],[p.x+p.w,p.y+p.d]].map(([x,y])=>{
   const dx=x-p.x-p.w/2,dy=y-p.y-p.d/2
   x=p.x+p.w/2+dx*pc+dy*ps-s.w/2;y=p.y+p.d/2-dx*ps+dy*pc-s.h/2
   return [s.x+s.w/2+x*c+y*v,s.y+s.h/2-x*v+y*c]
  })
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1])
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),bottom:p.z,top:p.z+p.h,solid:p.solid}
 })
}
export const alphaOverlap=(a:Rect,b:Rect)=>a.x<b.x+b.w-1e-4&&a.x+a.w>b.x+1e-4&&a.y<b.y+b.h-1e-4&&a.y+a.h>b.y+1e-4
export function blocksAlphaDoor(s:Structure,doors:Rect[]){
 if(['alpha_wall','alpha_floor','alpha_ceiling','alpha_light','alpha_conduit','alpha_trim'].includes(s.kind))return false
 return alphaWorldParts(s).some(p=>p.top>.12&&p.bottom<2.25&&doors.some(d=>alphaOverlap(p,d)))
}

const wallMounted=new Set(['alpha_map','alpha_notice','alpha_clock','alpha_home_frame','alpha_community_board','alpha_safety','alpha_board','alpha_sign','alpha_lab_shelf','alpha_climate'])
export const isAlphaWallMounted=(s:Structure)=>wallMounted.has(s.kind)&&!s.data?.stand&&s.data?.skin!=='suspended'&&s.data?.skin!=='portable'
/** Backing planes, rather than prop centres, share the actual wall face. */
export function alphaMountSupport(s:Structure,structures:Structure[]){
 const a=Number(s.data?.deg??0)*Math.PI/180,nx=Math.round(Math.sin(a)),ny=Math.round(Math.cos(a)),cx=s.x+s.w/2,cy=s.y+s.h/2
 const back=cx*nx+cy*ny-s.h/2,tangent=cx*ny-cy*nx
 const parts=alphaParts(s),bottom=Math.min(...parts.map(p=>p.z)),top=Math.max(...parts.map(p=>p.z+p.h))
 const candidates=structures.filter(w=>w.kind==='alpha_wall'&&w.data?.skin!=='door_frame').map(w=>{
  const tx=(w.x+w.w/2)*ny-(w.y+w.h/2)*nx,half=(Math.abs(ny)*w.w+Math.abs(nx)*w.h)/2
  const face=(w.x+w.w/2)*nx+(w.y+w.h/2)*ny+(Math.abs(nx)*w.w+Math.abs(ny)*w.h)/2
  return {face,lo:tx-half,hi:tx+half,z:Number(w.data?.z??0),top:Number(w.data?.z??0)+Number(w.data?.height??2.9)}
 }).filter(w=>Math.abs(back-w.face)<.35&&w.hi>tangent-s.w/2&&w.lo<tangent+s.w/2&&w.z<=bottom+.001&&w.top>=top-.001)
 for(const wall of candidates.sort((a,b)=>Math.abs(back-a.face)-Math.abs(back-b.face))){
  let end=tangent-s.w/2
  for(const v of candidates.filter(w=>Math.abs(w.face-wall.face)<.001).sort((a,b)=>a.lo-b.lo))if(v.lo<=end+.001)end=Math.max(end,v.hi)
  if(end>=tangent+s.w/2-.001)return {nx,ny,gap:back-wall.face,face:wall.face}
 }
 return null
}
export function fitAlphaWallMounts(structures:Structure[]){
 const unsupported:Structure[]=[]
 for(const s of structures.filter(isAlphaWallMounted)){
  const support=alphaMountSupport(s,structures)
  if(!support){unsupported.push(s);continue}
  s.x+=support.nx*(.002-support.gap);s.y+=support.ny*(.002-support.gap)
 }
 return unsupported
}
