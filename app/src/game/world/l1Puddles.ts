import {l1Noise,l1ParkingAt,l1ReferenceAt,L1_PHOTO_ANCHORS} from './l1Spatial'
export interface L1Puddle {x:number;y:number;rx:number;ry:number;angle:number;phase:number}
/** Neighbouring chunks query the same overlapping leak footprints, including negative coordinates. */
export function l1Puddles(seed:number,cx:number,cy:number):L1Puddle[]{
 const out:L1Puddle[]=[]
 // Authored leaks are ordinary footprint data: rendering, reflections and wet
 // footsteps all consume them, in free play as well as at the recorded camera.
 const near=new Set<(typeof L1_PHOTO_ANCHORS)[number]>()
 for(const dx of [-32,16,64])for(const dy of [-32,16,64]){const a=l1ReferenceAt(seed,cx*32+dx,cy*32+dy);if(a)near.add(a)}
 for(const a of near){
  if(!['parking-common','parking-water','parking-bright'].includes(a.id))continue
  if(Math.abs(cx*32+16-a.centerX)>48||Math.abs(cy*32+16-a.centerY)>48)continue
  if(a.id==='parking-common'){
   // Floor landmarks back-projected through the recorded 800 × 600 camera:
   // broad left leak and two narrow runnels along the dry travel lane.
   out.push({x:a.centerX-3.1,y:a.centerY-3,rx:.55,ry:13,angle:.06,phase:1.3})
   out.push({x:a.centerX-.85,y:a.centerY-4,rx:.38,ry:14,angle:-.02,phase:3.1})
   out.push({x:a.centerX-3.9,y:a.centerY+5.1,rx:3.6,ry:1.65,angle:-.15,phase:2.4})
   out.push({x:a.centerX-8.4,y:a.centerY-3.5,rx:3.9,ry:8,angle:.08,phase:4.1})
   out.push({x:a.centerX+1.6,y:a.centerY+2.7,rx:.65,ry:.38,angle:.2,phase:2.1})
  }else{
   out.push({x:a.centerX+1.5,y:a.centerY-.5,rx:2.6,ry:5.7,angle:.12,phase:1.3})
   out.push({x:a.centerX+2.2,y:a.centerY-6,rx:1.2,ry:5.6,angle:.16,phase:3.1})
  }
 }
 for(let gz=Math.floor((cy*32-20)/24);gz<=Math.floor((cy*32+52)/24);gz++)
 for(let gx=Math.floor((cx*32-20)/24);gx<=Math.floor((cx*32+52)/24);gx++){
  const x=gx*24+5+l1Noise(gx,gz,seed^17)*14,y=gz*24+5+l1Noise(gx,gz,seed^29)*14
  if(l1ReferenceAt(seed,x,y))continue
  const wet=l1ParkingAt(seed,x,y).wet
  if(wet<.3||l1Noise(gx,gz,seed^43)>(wet-.25)*1.35)continue
  const angle=l1Noise(gx,gz,seed^59)*Math.PI*2,rx=3+wet*7,ry=1.1+wet*3
  out.push({x,y,rx,ry,angle,phase:l1Noise(gx,gz,seed^89)*6.28})
  out.push({x:x+Math.cos(angle)*rx*.8,y:y+Math.sin(angle)*rx*.8,rx:rx*.75,ry:ry*.42,angle,phase:l1Noise(gx,gz,seed^97)*6.28})
 }
 return out
}
export function l1PuddleField(p:L1Puddle,x:number,y:number):number {
 const dx=x-p.x,dy=y-p.y,c=Math.cos(p.angle),s=Math.sin(p.angle),u=(dx*c+dy*s)/p.rx,v=(-dx*s+dy*c)/p.ry
 const a=Math.atan2(v,u)
 // Shallow leaks spread along rough concrete, with narrow runnels and dry islands.
 // World-continuous terms keep the same shoreline on either side of a chunk seam.
 const jag=.82+.13*Math.sin(a*3+p.phase)+.09*Math.cos(a*7+p.phase*.7)+.055*Math.sin(a*13-p.phase)
 const rough=.075*Math.sin(x*2.7+y*.61+p.phase)*Math.cos(y*3.1-x*.43)+.032*Math.sin(x*7.9+y*5.3)
 const channel=.06*Math.sin((dx*c+dy*s)*2.1+p.phase)
 return jag+rough+channel-Math.hypot(u,v)
}
export const l1PuddleContains=(p:L1Puddle,x:number,y:number)=>l1PuddleField(p,x,y)>=0
