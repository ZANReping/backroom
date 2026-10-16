import { genL11ChunkRaw } from './l11Raw'
import type { LevelDef } from '../core/types'
import { l11CityPlan } from './l11Layout'
const sent=new Set<string>()
self.onmessage=(e:MessageEvent<{key:string;def:LevelDef;seed:number;cx:number;cy:number;revision:number}>)=>{
  const {key,def,seed,cx,cy,revision}=e.data
  try {
    const raw=genL11ChunkRaw(def,seed,cx,cy,undefined,revision),plans=[]
    for(let my=Math.floor((cy*32-16)/1024);my<=Math.floor((cy*32+16)/1024);my++)for(let mx=Math.floor((cx*32-16)/1024);mx<=Math.floor((cx*32+16)/1024);mx++){
      const plan=l11CityPlan(seed,mx,my);if(!sent.has(plan.id)){sent.add(plan.id);plans.push(plan)}
    }
    self.postMessage({key,raw,plans})
  }
  catch(error){self.postMessage({key,error:String(error)})}
}
