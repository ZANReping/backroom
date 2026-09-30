import { genL11ChunkRaw } from './l11Raw'
import type { LevelDef } from '../core/types'
self.onmessage=(e:MessageEvent<{key:string;def:LevelDef;seed:number;cx:number;cy:number;revision:number}>)=>{
  const {key,def,seed,cx,cy,revision}=e.data
  try { self.postMessage({key,raw:genL11ChunkRaw(def,seed,cx,cy,undefined,revision)}) }
  catch(error){self.postMessage({key,error:String(error)})}
}
