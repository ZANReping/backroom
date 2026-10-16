import type { Structure } from '../core/types'
import { l11TerrainHeight } from './l11Hydrology'
import { l11BoxSolid,l11SolidCollider } from './l11Solid'
export const L11_METRO_FLOOR=-5,L11_METRO_CEILING=-2
export const l11MetroOrigin=(x:number,y:number)=>({x:Math.floor((x-26)/512)*512+26,y:Math.floor((y-120)/512)*512+120})
export function l11MetroRampHeight(x:number,y:number,seed=0):number|null{
  const a=l11MetroOrigin(x,y);if(x<a.x||x>a.x+3||y<a.y||y>a.y+10)return null
  const top=l11TerrainHeight(seed,a.x+1.5,a.y);return top+(L11_METRO_FLOOR-top)*(y-a.y)/10
}
/** Solid retaining walls and the headboard use the same boxes in rendering/physics. */
export function l11MetroParts(s:Structure){
  const top=Number(s.data?.ground??0),parts=[]
  for(const side of [-1,1])parts.push({x:side*1.62,y:(top+.8-5.15)/2,z:5,w:.24,h:top+.8+5.15,d:10})
  for(const side of [-1,1])parts.push({x:side*1.62,y:top+1.6,z:0,w:.1,h:1.6,d:.1})
  parts.push({x:0,y:top+2.55,z:0,w:3.5,h:.12,d:1.2})
  return parts
}
export function l11MetroColliders(s:Structure){return l11MetroParts(s).map(p=>l11SolidCollider(l11BoxSolid(s.x+1.5+p.x,p.y,s.y+p.z,p.w,p.h,p.d)))}
