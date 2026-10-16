import { L11_VERSION, peekL11CityPlan } from '../world/l11Layout'
import type { L11CityPlan } from '../world/l11Types'
import type { MapBounds } from './l11MapModel'

const cache=new Map<string,L11CityPlan>(),failed=new Set<string>()
const queue=new Map<string,{key:string;seed:number;mx:number;my:number}>()
let worker:Worker|undefined,active='',clients=0
const keyOf=(seed:number,x:number,y:number)=>`${L11_VERSION}:${seed}:${x}:${y}`
function pump(){
  if(active||!clients||!queue.size)return
  const next=queue.values().next().value!;queue.delete(next.key);active=next.key
  try {
    if(!worker){
      worker=new Worker(new URL('../world/l11Map.worker.ts',import.meta.url),{type:'module'})
      worker.onmessage=({data}:{data:{key:string;plan?:L11CityPlan;error?:string}})=>{
        if(!clients||data.key!==active)return
        if(data.plan&&data.plan.version===L11_VERSION){
          cache.set(data.key,data.plan)
          while(cache.size>12)cache.delete(cache.keys().next().value!)
        }else failed.add(data.key)
        active='';pump()
      }
      worker.onerror=()=>{failed.add(active);active='';worker?.terminate();worker=undefined;queue.clear()}
    }
    worker.postMessage(next)
  } catch { if(active)failed.add(active);worker?.terminate();worker=undefined;active='';queue.clear() }
}
export function retainL11MapPlans(){
  clients++
  return ()=>{if(--clients===0){worker?.terminate();worker=undefined;active='';queue.clear();cache.clear();failed.clear()}}
}
export function l11MapPlanStatus(){return {clients,worker:!!worker,pending:queue.size+Number(!!active),cached:cache.size,failed:failed.size}}
export function retryL11MapPlans(){failed.clear()}
export function readL11MapPlans(seed:number,view:MapBounds,known:readonly MapBounds[],reveal=false){
  const plans:L11CityPlan[]=[]
  let loading=false,error=false
  for(let my=Math.floor((view.y-16)/1024);my<=Math.floor((view.y+view.h-16)/1024);my++){
    for(let mx=Math.floor((view.x-16)/1024);mx<=Math.floor((view.x+view.w-16)/1024);mx++){
      const key=keyOf(seed,mx,my),hit=peekL11CityPlan(seed,mx,my)??cache.get(key)
      if(hit){plans.push(hit);continue}
      // Request only macroregions intersecting exploration, or the explicit dev reveal.
      const needed=reveal||known.some(r=>r.x+r.w>mx*1024+16&&r.x<(mx+1)*1024+16&&r.y+r.h>my*1024+16&&r.y<(my+1)*1024+16)
      if(!needed)continue
      if(failed.has(key)){error=true;continue}
      loading=true
      if(active!==key&&!queue.has(key)&&queue.size<16)queue.set(key,{key,seed,mx,my})
    }
  }
  pump();return {plans,loading,error}
}
