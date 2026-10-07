import {l0Hash,type L0Layout,type L0Wall} from './l0Architecture'
import {l0BaseRegion} from './l0Regions'

/** Architectural bays deliberately do not coincide with 32 m streaming cells.
 * Every chunk clips the same world-space partitions, including negative space.
 * Separated L/T partitions leave multiple routes rather than sealed rooms. */
export function continuousL0Partitions(a:L0Layout,seed:number){
 const X=a.cx*32,Y=a.cy*32,out:L0Wall[]=[]
 const append=(x:number,y:number,w:number,h:number)=>{
  if(x<22&&x+w>10&&y<22&&y+h>10)return // initial safe landing
  const x0=Math.max(X,x),y0=Math.max(Y,y),x1=Math.min(X+32,x+w),y1=Math.min(Y+32,y+h)
  if(x1-x0>.001&&y1-y0>.001)out.push({x:x0,y:y0,w:x1-x0,h:y1-y0,bottom:0,top:2.7,surface:'wall'})
 }
 for(let by=Math.floor((Y-12)/12);by<=Math.floor((Y+32)/12);by++)for(let bx=Math.floor((X-12)/12);bx<=Math.floor((X+32)/12);bx++){
  // Offset the bay lattice from whole-metre clipping edges as well: wall
  // ends should not repeatedly coincide with a streaming seam by accident.
  const h=l0Hash(seed,bx,by,0xace1),x=bx*12+1.137+(h%4)*.25,y=by*12+1.137+((h>>>4)%4)*.25
  const owner=l0BaseRegion(seed,Math.floor(x/32),Math.floor(y/32)),dense=owner!=='open'
  const len=(dense?8:7.1)+((h>>>8)%5)*.3,vertical=!!(h&0x10000),arm=dense?5.2:3.3
  const wx=x,wy=y
  // Only interior, single-chunk partitions may participate in local revisions.
  const movable=wx>X+2&&wy>Y+2&&wx+(vertical?arm:len)<X+30&&wy+(vertical?len:arm)<Y+30
  const shift=movable&&a.revision%2&&h%3===0?.75:0
  append(wx+(vertical?shift:0),wy+(vertical?0:shift),vertical?.24:len,vertical?len:.24)
  // The whole world-space elbow exists on both sides of a streaming edge.
  if((h>>>17)%100<(dense?78:64))append(wx+(vertical?shift:0),wy+(vertical?0:shift),vertical?arm:.24,vertical?.24:arm)
 }
 return out
}
