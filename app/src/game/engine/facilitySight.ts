import type {Structure} from '../core/types'
import {structBlocksSight,wallAt,type GameMap} from '../world/mapgen'
/** Eye-height ray shared by local and authority-side service validation. */
export function facilitySight(map:GameMap,from:{x:number;y:number},to:{x:number;y:number},target?:Structure){
 const steps=Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/.1)
 for(let i=1;i<steps;i++){const t=i/steps,x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t
  if(wallAt(map,Math.floor(x),Math.floor(y),0)||structBlocksSight(map,x,y,1.55,0,target))return false
 }return true
}
