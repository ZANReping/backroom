import type { LevelDef } from '../core/types'
import type { GenChunk } from './infiniteRegistry'
import { genL11ChunkRaw } from './l11Raw'
const ready=new Map<string,GenChunk>(),pending=new Set<string>()
let worker:Worker|undefined,failed=false,last=''
const keyOf=(s:number,x:number,y:number,r:number)=>`${s}:${x}:${y}:${r}`
export function prefetchL11(def:LevelDef,seed:number,cx:number,cy:number,revisions:Record<string,number>={}){
  if(typeof Worker==='undefined'||failed)return
  const cell=`${seed}:${cx}:${cy}`;if(cell===last)return;last=cell
  if(!worker){try{worker=new Worker(new URL('./l11.worker.ts',import.meta.url),{type:'module'});worker.onmessage=e=>{pending.delete(e.data.key);if(e.data.raw){ready.set(e.data.key,e.data.raw);while(ready.size>96)ready.delete(ready.keys().next().value!)}};worker.onerror=()=>{failed=true;pending.clear();worker?.terminate();worker=undefined}}catch{failed=true;return}}
  // The extra ring is generated before crossing a live-window boundary; no DOM or render state in the worker.
  for(let radius=0;radius<=3;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue
    const x=cx+dx,y=cy+dy,revision=revisions[`${x},${y}`]??0,key=keyOf(seed,x,y,revision)
    if(ready.has(key)||pending.has(key)||pending.size>=96)continue
    pending.add(key);worker!.postMessage({key,def,seed,cx:x,cy:y,revision})
  }
}
export function preparedL11(def:LevelDef,seed:number,cx:number,cy:number,revision=0):GenChunk {
  const key=keyOf(seed,cx,cy,revision),raw=ready.get(key)
  if(raw)return raw
  return genL11ChunkRaw(def,seed,cx,cy,undefined,revision)
}
