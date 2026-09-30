import type {GameMap} from './mapgen'
import type {Structure} from '../core/types'
import {l3StyleAt,L3_NARROW_TINT} from './l3Architecture'

export function l3VariationHash(seed:number,x:number,z:number,salt:number){
 let h=(seed^Math.imul(x,0x45d9f3b)^Math.imul(z,0x119de1f3)^salt)>>>0
 h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b)
 return (h^(h>>>16))>>>0
}

/** All parts on one fence plane share their finish, including at chunk seams. */
export function l3FenceFinish(seed:number,s:Structure):'black'|'pale'{
 const vertical=!!s.data?.rot||s.h>s.w
 return l3VariationHash(seed,vertical?Math.floor(s.x):Math.floor(s.y),vertical?1:0,0x3f31)%3===0?'black':'pale'
}

export const L3_PURPLE_BRICK_CHUNK_RATE=512
export const l3HasPurpleBrick=(seed:number,cx:number,cz:number)=>l3VariationHash(seed,cx,cz,0x3b1c)%L3_PURPLE_BRICK_CHUNK_RATE===0

export function findL3PurpleBrick(m:GameMap,cx:number,cz:number){
 const inf=m.inf
 if(!inf||!l3HasPurpleBrick(inf.seed,cx,cz))return null
 const x0=cx*32-inf.ox,z0=cz*32-inf.oy
 const floor=(x:number,z:number)=>x>=0&&z>=0&&x<m.w&&z<m.h&&m.tiles[z*m.w+x]===1
 let best:{x:number;z:number;y:number;nx:number;nz:number;width:number;height:number;hash:number}|null=null
 for(let z=z0+1;z<z0+31;z++)for(let x=x0+1;x<x0+31;x++){
  if(!floor(x,z)||m.tint[z*m.w+x]===L3_NARROW_TINT||l3StyleAt(m,x+.5,z+.5)==='assembly')continue
  if(m.structures.some(s=>x+.5>=s.x-.2&&x+.5<=s.x+s.w+.2&&z+.5>=s.y-.2&&z+.5<=s.y+s.h+.2))continue
  for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
   if(floor(x+dx,z+dz))continue
   let wx=x+inf.ox+.5+dx*.5,wz=z+inf.oy+.5+dz*.5
   // Factory-brick photo: this exact rectangle is inside a complete brick in
   // the top texture course. Align to the wall's .8 world UV, leaving mortar.
   const u=(wx+wz)*.8,shift=(Math.floor(u)+.197-u)/.8
   if(Math.abs(shift)>.36)continue
   if(dx)wz+=shift;else wx+=shift
   const hash=l3VariationHash(inf.seed,Math.floor(wx*8),Math.floor(wz*8),0x312f+dx+dz*3)
   if(best&&best.hash<=hash)continue
   best={x:wx-inf.ox-dx*.003,z:wz-inf.oy-dz*.003,y:(.966+(hash%2))/.8,nx:-dx,nz:-dz,width:.17/.8,height:.044/.8,hash}
  }
 }
 return best
}
