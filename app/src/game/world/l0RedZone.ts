import type {L0Layout,L0Rect,L0Wall} from './l0Architecture'
import {l0EffectPatches,type L0EffectPatch} from './l0Regions'

export interface L0RedGate extends L0Rect {id:string;face:'nx'|'px'|'nz'|'pz'}
export interface L0RedZone {id:string;bounds:L0Rect;gates:L0RedGate[]}
export interface L0RedProgress {closed:string[];entered:boolean;lastSeal:number}
export type L0RedProgressMap=Record<string,L0RedProgress>
export function redZoneFromPatch(p:L0EffectPatch):L0RedZone{
 const bounds={x:p.x-p.rx,y:p.y-p.ry,w:p.rx*2,h:p.ry*2},gates:L0RedGate[]=[],T=.26
 for(const side of ['north','south','west','east']as const){
  const horizontal=side==='north'||side==='south',length=horizontal?bounds.w:bounds.h,count=Math.max(2,Math.floor(length/10))
  for(let i=0;i<count;i++){
   const offset=(i+1)*length/(count+1)-.8
   gates.push({id:`${side}:${i}`,x:bounds.x+(horizontal?offset:side==='east'?bounds.w-T:0),y:bounds.y+(horizontal?(side==='south'?bounds.h-T:0):offset),w:horizontal?1.6:T,h:horizontal?T:1.6,face:side==='north'?'pz':side==='south'?'nz':side==='west'?'px':'nx'})
  }
 }
 return{id:p.id,bounds,gates}
}
export function redZonesNear(seed:number,cx:number,cy:number):L0RedZone[]{return l0EffectPatches(seed,cx,cy).filter(p=>p.kind==='red').map(redZoneFromPatch)}
export function insideRedZone(zone:L0RedZone,x:number,y:number,pad=0){const r=zone.bounds;return x>r.x+pad&&x<r.x+r.w-pad&&y>r.y+pad&&y<r.y+r.h-pad}
export const redGateClearance=(g:L0RedGate):L0Rect=>({x:g.x-1.2,y:g.y-1.2,w:g.w+2.4,h:g.h+2.4})
/** Real enclosure, open on first visit. Opposite faces receive different paper. */
export function applyRedZoneWalls(a:L0Layout,progress:L0RedProgressMap={}){
 const X=a.cx*32,Y=a.cy*32,T=.26,append=(r:L0Rect,face:L0Wall['redFace'],gate?:string,zone?:string)=>{
  const x=Math.max(X,r.x),y=Math.max(Y,r.y),w=Math.min(X+32,r.x+r.w)-x,h=Math.min(Y+32,r.y+r.h)-y
  if(w>.001&&h>.001)a.walls.push({x,y,w,h,bottom:0,top:2.7,surface:'wall',redFace:face,redGate:gate,redZone:zone})
 }
 a.redZones=redZonesNear(a.seed,a.cx,a.cy)
 for(const z of a.redZones){
  // Keep all entrances physically usable; original partitions elsewhere survive conversion.
  for(const g of z.gates){
   const cut=redGateClearance(g)
   a.walls=a.walls.flatMap(w=>{
    if(w.redZone||w.x>=cut.x+cut.w||w.x+w.w<=cut.x||w.y>=cut.y+cut.h||w.y+w.h<=cut.y)return[w]
    return w.w>w.h?[{...w,w:Math.max(0,cut.x-w.x)},{...w,x:Math.max(w.x,cut.x+cut.w),w:Math.max(0,w.x+w.w-cut.x-cut.w)}].filter(v=>v.w>.08):[{...w,h:Math.max(0,cut.y-w.y)},{...w,y:Math.max(w.y,cut.y+cut.h),h:Math.max(0,w.y+w.h-cut.y-cut.h)}].filter(v=>v.h>.08)
   })
  }
  for(const [face,horizontal,start,length,fixed]of [
   ['pz',true,z.bounds.x,z.bounds.w,z.bounds.y],['nz',true,z.bounds.x,z.bounds.w,z.bounds.y+z.bounds.h-T],
   ['px',false,z.bounds.y,z.bounds.h,z.bounds.x],['nx',false,z.bounds.y,z.bounds.h,z.bounds.x+z.bounds.w-T]
  ]as const){
   const gates=z.gates.filter(g=>g.face===face).sort((a,b)=>horizontal?a.x-b.x:a.y-b.y);let at=start
   for(const g of gates){const edge=horizontal?g.x:g.y;append(horizontal?{x:at,y:fixed,w:edge-at,h:T}:{x:fixed,y:at,w:T,h:edge-at},face,undefined,z.id);at=edge+1.6
    if(progress[z.id]?.closed.includes(g.id))append(g,face,g.id,z.id)
   }
   append(horizontal?{x:at,y:fixed,w:start+length-at,h:T}:{x:fixed,y:at,w:T,h:start+length-at},face,undefined,z.id)
  }
 }
}
