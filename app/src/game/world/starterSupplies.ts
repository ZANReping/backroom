import type {GameMap} from './mapgen'
import {canOccupy,PLAYER_RADIUS} from '../core/player'
/** Exhaust the reachable neighbourhood instead of gambling on random attempts. */
export function placeL0StarterSupplies(m:GameMap,extra:string){
 const queue=[{x:m.spawn.x+.5,y:m.spawn.y+.5}],seen=new Set<string>(['0,0']),spots:{x:number;y:number}[]=[]
 for(let i=0;i<queue.length;i++){
  const p=queue[i];spots.push(p)
  for(const [dx,dy]of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){
   const x=p.x+dx,y=p.y+dy,ix=Math.round((x-queue[0].x)*2),iy=Math.round((y-queue[0].y)*2),key=`${ix},${iy}`
   if(Math.abs(ix)>16||Math.abs(iy)>16||seen.has(key))continue;seen.add(key)
   if(x<1||y<1||x>=m.w-1||y>=m.h-1||!canOccupy(m,x,y,PLAYER_RADIUS,{z:0}))continue
   queue.push({x,y})
  }
 }
 const clear=spots.filter(p=>Math.hypot(p.x-queue[0].x,p.y-queue[0].y)>=1)
 for(const type of ['flashlight','bandage','almond',extra]){
  const p=clear.find(p=>!m.items.some(it=>Math.hypot(it.x-p.x,it.y-p.y)<.9))??queue[0]
  const item={id:Math.random(),type,x:p.x,y:p.y}
  m.items.push(item)
  // Restitching before the first streaming move must retain the starter items.
  const inf=m.inf
  inf?.chunks.get(`${Math.floor((p.x+inf.ox)/32)},${Math.floor((p.y+inf.oy)/32)}`)?.items.push(item)
 }
}
