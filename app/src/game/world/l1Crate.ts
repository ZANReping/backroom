import type {Structure} from '../core/types'
// A stack is one persistent shipping consignment/inventory. Adding a visible
// upper case never allocates another loot identity or regenerates its contents.
export const L1_CRATE={width:1.28,depth:.71,height:.68}
export function l1CrateCount(s:Structure){return Number(s.data?.l1Stack)===2?2:1}
type CaseCollider={x0:number;y0:number;x1:number;y1:number;top:number;stand:boolean;polygon:[number,number][][]}
const colliderCache=new WeakMap<Structure,{x:number;y:number;w:number;h:number;angle:number;count:number;box:CaseCollider}>()

/** The shipping case has a continuous wooden lid even after its boards are
 * merged by material. Keep its support surface independent of mesh batching. */
export function l1CrateCollider(s:Structure){
 const cx=s.x+s.w/2,cy=s.y+s.h/2,angle=Number(s.data?.deg??0)*Math.PI/180
 const a=Number.isFinite(angle)?angle:0,count=l1CrateCount(s),old=colliderCache.get(s)
 if(old&&old.x===s.x&&old.y===s.y&&old.w===s.w&&old.h===s.h&&old.angle===a&&old.count===count)return old.box
 const c=Math.cos(a),sn=Math.sin(a)
 const polygon:[number,number][]=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{
  const px=x*L1_CRATE.width/2,py=y*L1_CRATE.depth/2
  return[cx+px*c+py*sn,cy+py*c-px*sn]
 })
 const box={x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1])),top:L1_CRATE.height*count,stand:true,polygon:[polygon]}
 colliderCache.set(s,{x:s.x,y:s.y,w:s.w,h:s.h,angle:a,count,box});return box
}
