import type { GameMap } from '../world/mapgen'

/** Animated bone capsules, relative to the entity. x/y are map axes, z is height. */
export type MangledLegCollider = { ax:number; ay:number; az:number; bx:number; by:number; bz:number; radius:number }
type Contact = { x:number; y:number; reach:number }
function contacts(m:GameMap,x:number,y:number,r:number,z:number,height:number):Contact[] {
 const result:Contact[]=[]
 for(const e of m.entities??[]){
  if(e.def.type!=='mangled'||e.dead||e.hp<=0||!e.mangledLegs||Math.hypot(x-e.x,y-e.y)>42)continue
  for(const c of e.mangledLegs){
   const az=(e.z??0)+c.az,bz=(e.z??0)+c.bz,dz=bz-az
   let t0=0,t1=1
   if(Math.abs(dz)<1e-6){if(az+c.radius<z||az-c.radius>z+height)continue}
   else{const a=(z-c.radius-az)/dz,b=(z+height+c.radius-az)/dz;t0=Math.max(0,Math.min(a,b));t1=Math.min(1,Math.max(a,b));if(t0>t1)continue}
   const ax=e.x+c.ax,ay=e.y+c.ay,dx=c.bx-c.ax,dy=c.by-c.ay,l=dx*dx+dy*dy
   const t=Math.max(t0,Math.min(t1,l>1e-9?((x-ax)*dx+(y-ay)*dy)/l:t0)),px=ax+dx*t,py=ay+dy*t,reach=r+c.radius
   if((x-px)**2+(y-py)**2<reach*reach-1e-6)result.push({x:px,y:py,reach})
  }
 }
 return result
}
export function mangledLegBlocks(m:GameMap,x:number,y:number,r:number,z:number,height:number){return contacts(m,x,y,r,z,height).length>0}
export function mangledLegEscapePoints(m:GameMap,x:number,y:number,r:number,z:number,height:number){
 const points:{x:number;y:number}[]=[]
 for(const c of contacts(m,x,y,r,z,height)){
  const a=Math.atan2(y-c.y,x-c.x)
  for(let i=0;i<8;i++){const angle=a+i*Math.PI/4;points.push({x:c.x+Math.cos(angle)*(c.reach+.008),y:c.y+Math.sin(angle)*(c.reach+.008)})}
 }
 return points
}
