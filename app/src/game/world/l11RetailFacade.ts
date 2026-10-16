import type {L11Building} from './l11Types'
import type {Point} from './l11Geometry'
import {l11Shopfront} from './l11Shopfront'

/** The structural grid continues across doors and storeys. Splitting a wall
 * into doorway segments must not restart its window/column spacing. */
export function l11RetailBays(b:Pick<L11Building,'width'|'depth'>,a:Point,z:Point){
  const dx=z[0]-a[0],dy=z[1]-a[1],length=Math.hypot(dx,dy),alongX=Math.abs(dx)>Math.abs(dy)
  const extent=alongX?b.width:b.depth,start=alongX?(dx>0?a[0]:b.width-a[0]):dy>0?a[1]:b.depth-a[1]
  const count=Math.max(1,Math.round(extent/2.25)),pitch=extent/count
  return Array.from({length:Math.max(0,Math.ceil((start+length-1e-6)/pitch)-Math.floor((start+1e-6)/pitch))},(_,j)=>{
    const index=Math.floor((start+1e-6)/pitch)+j,l=index*pitch-start,r=(index+1)*pitch-start
    return {index,l,r,pitch,start:Math.max(0,l),end:Math.min(length,r)}
  })
}

/** Wider ground piers carry alternate upper bays. Entrances keep their full
 * aperture; the canopy acts as the lintel over a skipped support. */
export function l11RetailPiers(b:L11Building){
  if(b.architecture!=='pier-retail')return []
  const shop=l11Shopfront(b),doors=shop?.available?[b.doorLocal,shop.door]:[b.doorLocal]
  const out:{x:number;z:number;w:number;d:number}[]=[],seen=new Set<string>()
  for(const ring of b.localFootprint)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],z=ring[i],len=Math.hypot(z[0]-a[0],z[1]-a[1]),tx=(z[0]-a[0])/len,tz=(z[1]-a[1])/len
    const count=Math.max(1,Math.round(len/2.25)),pitch=len/count
    for(let k=0;k<=count;k++){
      if(k!==count&&k%2)continue
      const x=a[0]+tx*k*pitch,y=a[1]+tz*k*pitch,corner=k===0||k===count,key=`${x.toFixed(5)},${y.toFixed(5)}`
      if(seen.has(key)||doors.some(p=>Math.hypot(x-p[0],y-p[1])<1.55))continue
      seen.add(key)
      out.push({x:corner?x:x+tz*.08,z:corner?y:y-tx*.08,w:corner?.58:Math.abs(tx)*.52+Math.abs(tz)*.68,d:corner?.58:Math.abs(tz)*.52+Math.abs(tx)*.68})
    }
  }
  return out
}
