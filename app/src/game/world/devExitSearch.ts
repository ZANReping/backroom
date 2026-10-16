import type { ExitDef, ExitInstance, LevelDef } from '../core/types'
import type { L0SpaceState } from './l0Architecture'
import { genL0Architecture } from './l0Architecture'
import { infiniteImplFor } from './infiniteRegistry'
import { l11CityPlan, l11World } from './l11Layout'
import { L11_ROAD_EXITS } from './l11ExitPlan'
import type { L11Building } from './l11Types'

export interface DevExitSearchRequest {
  def:LevelDef;seed:number;kind:string;destination?:ExitDef['dest'];x:number;y:number;z:number
  live:{cx:number;cy:number;exits:ExitInstance[]}[];state?:L0SpaceState;plague?:boolean
}
export interface DevExitSearchResult {exit:ExitInstance|null;complete:boolean;searched:number}
export const exitMatches=(e:ExitInstance,kind:string,destination?:ExitDef['dest'])=>e.def.kind===kind&&(destination===undefined||e.def.dest===destination)
export const exitDistance=(e:ExitInstance,x:number,y:number,z=0)=>Math.hypot(e.x+.5-x,e.y+.5-y,(e.z??(e.floor??0)*3)-z)
export function l11BuildingExitInstance(b:L11Building,def:ExitDef):ExitInstance|null {
  const q=b.exit;if(!q||q.kind!==def.kind)return null
  const [x,y]=l11World(b,...q.center)
  return {def,x:x-.5,y:y-.5,z:b.base+q.floor*3+.02,floor:q.floor,discovered:false,l11:{id:b.id+':exit',buildingId:b.id,blockId:b.blockId,angle:b.angle+q.angle,width:q.width}}
}

/** Ordered by a lower distance bound, not "first ring with a match". Live
 * records override raw generation, including manually added/removed exits. */
export function* searchDevExit(q:DevExitSearchRequest):Generator<void,DevExitSearchResult> {
  const live=new Map(q.live.map(c=>[`${c.cx},${c.cy}`,c.exits]))
  let best:ExitInstance|null=null,distance=Infinity,searched=0
  const consider=(e:ExitInstance)=>{if(!exitMatches(e,q.kind,q.destination))return;const d=exitDistance(e,q.x,q.y,q.z);if(d<distance){distance=d;best=e}}
  for(const c of q.live)for(const e of c.exits)consider(e)
  const rawCandidate=(e:ExitInstance)=>{if(!live.has(`${Math.floor((e.x+.5)/32)},${Math.floor((e.y+.5)/32)}`))consider(e)}
  const def=q.def.exits.find(e=>e.kind===q.kind&&(q.destination===undefined||e.dest===q.destination))
  if(!def)return {exit:null,complete:true,searched}
  if(q.def.id===11&&(q.kind==='basebeta'||L11_ROAD_EXITS.some(e=>e.kind===q.kind))){
    if(q.kind==='basebeta'){
      const b=l11CityPlan(q.seed,0,0).buildings.find(b=>b.id==='l11:public-archive')
      const e=b&&l11BuildingExitInstance(b,def);if(e)rawCandidate(e)
    }else for(const p of L11_ROAD_EXITS)if(p.kind===q.kind)rawCandidate({def,x:p.x,y:p.y,discovered:false})
    return {exit:best,complete:true,searched:1}
  }
  const city=q.def.id===11,size=city?1024:32,offset=city?16:0,range=city?4096:2048
  const cells:{cx:number;cy:number;lower:number}[]=[]
  for(let cy=Math.floor((q.y-range-offset)/size);cy<=Math.floor((q.y+range-offset)/size);cy++)for(let cx=Math.floor((q.x-range-offset)/size);cx<=Math.floor((q.x+range-offset)/size);cx++){
    const x=cx*size+offset,y=cy*size+offset,lower=Math.hypot(Math.max(x-q.x,0,q.x-x-size),Math.max(y-q.y,0,q.y-y-size))
    if(lower<=range)cells.push({cx,cy,lower})
  }
  cells.sort((a,b)=>a.lower-b.lower||a.cy-b.cy||a.cx-b.cx)
  const deadline=performance.now()+25000
  for(const cell of cells){
    if(cell.lower>distance)return {exit:best,complete:true,searched}
    if(performance.now()>deadline)return {exit:best,complete:false,searched}
    if(city){
      for(const b of l11CityPlan(q.seed,cell.cx,cell.cy).buildings){const e=l11BuildingExitInstance(b,def);if(e)rawCandidate(e)}
    }else if(!live.has(`${cell.cx},${cell.cy}`)){
      const raw=q.def.id===0?genL0Architecture(q.def,q.seed,cell.cx,cell.cy,q.plague?'red':undefined,q.state?.revisions[`${cell.cx},${cell.cy}`]??0,q.state?.redProgress):infiniteImplFor(q.def.id).genRaw(q.def,q.seed,cell.cx,cell.cy,q.plague?'red':undefined)
      for(const e of raw.exits)consider(e)
    }
    searched++;yield
  }
  return {exit:best,complete:distance<=range,searched}
}
