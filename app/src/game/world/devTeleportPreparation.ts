import type { LevelDef, ExitInstance } from '../core/types'
import type { L0SpaceState } from './l0Architecture'
import type { GameMap } from './mapgen'
import { l11NextDressingRevision } from './infinite'
import { peekL11CityPlan } from './l11Layout'

export interface DevExitPrepareRequest {
  def:LevelDef;seed:number;state?:L0SpaceState;plague?:boolean
  chunks:{cx:number;cy:number;revision:number}[]
  cityPlans?:{mx:number;my:number}[]
}

export function devTeleportPreparation(map:GameMap,def:LevelDef,exit:ExitInstance,clock:number):DevExitPrepareRequest {
  const inf=map.inf!,cx=Math.floor((exit.x+.5)/32),cy=Math.floor((exit.y+.5)/32)
  const chunks:DevExitPrepareRequest['chunks']=[]
  for(let r=0;r<=2;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==r||inf.chunks.has(`${cx+dx},${cy+dy}`))continue
    const x=cx+dx,y=cy+dy
    chunks.push({cx:x,cy:y,revision:def.id===11?l11NextDressingRevision(inf,x,y,clock):inf.l0?.revisions[`${x},${y}`]??0})
  }
  const cityPlans=[] as {mx:number;my:number}[]
  if(def.id===11){const ox=(cx-2)*32,oy=(cy-2)*32
    for(let my=Math.floor((oy-376)/1024);my<=Math.floor((oy+504)/1024);my++)for(let mx=Math.floor((ox-376)/1024);mx<=Math.floor((ox+504)/1024);mx++)if(!peekL11CityPlan(inf.seed,mx,my))cityPlans.push({mx,my})
  }
  return {def,seed:inf.seed,state:inf.l0,plague:inf.plague,chunks,cityPlans}
}

export function devTeleportStamp(map:GameMap,q:DevExitPrepareRequest,clock:number){
  const inf=map.inf!
  return JSON.stringify([inf.rev,inf.plague,inf.l0?.redProgress,q.chunks.map(c=>q.def.id===11?l11NextDressingRevision(inf,c.cx,c.cy,clock):inf.l0?.revisions[`${c.cx},${c.cy}`]??0)])
}
