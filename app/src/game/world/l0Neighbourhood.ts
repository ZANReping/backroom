import type {LevelDef} from '../core/types'
import {genL0Architecture,type L0Layout,type L0SpaceState} from './l0Architecture'
const cache=new Map<string,L0Layout>()
/** Deterministic lighting halo, including unloaded neighbours and their saved revisions. */
export function l0LightingNeighbours(def:LevelDef,seed:number,a:L0Layout,state?:L0SpaceState,overrides?:Map<string,L0Layout>){
 const out:L0Layout[]=[],sealed=JSON.stringify(state?.redProgress??{})
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  if(!dx&&!dy)continue
  const cx=a.cx+dx,cy=a.cy+dy,key=`${cx},${cy}`,override=overrides?.get(key)
  if(override){out.push(override);continue}
  const revision=state?.revisions[key]??0,cacheKey=`${seed}:${key}:${revision}:${sealed}`
  let layout=cache.get(cacheKey)
  if(!layout){layout=genL0Architecture(def,seed,cx,cy,undefined,revision,state?.redProgress).l0!;if(cache.size>256)cache.clear();cache.set(cacheKey,layout)}
  out.push(layout)
 }
 return out
}
