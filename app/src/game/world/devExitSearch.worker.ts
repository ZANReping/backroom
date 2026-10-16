import './mapgen'
import { searchDevExit, type DevExitSearchRequest } from './devExitSearch'
import type { DevExitPrepareRequest } from './devTeleportPreparation'
import { genL0Architecture } from './l0Architecture'
import { genL11ChunkRaw } from './l11Raw'
import { infiniteImplFor } from './infiniteRegistry'
import { l11CityPlan } from './l11Layout'

function* prepare(q:DevExitPrepareRequest){
  for(const c of q.chunks){
    const raw=q.def.id===11?genL11ChunkRaw(q.def,q.seed,c.cx,c.cy,undefined,c.revision)
      :q.def.id===0?genL0Architecture(q.def,q.seed,c.cx,c.cy,undefined,c.revision,q.state?.redProgress)
      :infiniteImplFor(q.def.id).genRaw(q.def,q.seed,c.cx,c.cy,q.plague?'red':undefined)
    const transfer=new Set<ArrayBuffer>()
    for(const value of Object.values(raw))if(ArrayBuffer.isView(value)&&value.buffer instanceof ArrayBuffer)transfer.add(value.buffer)
    self.postMessage({phase:'chunk',key:`${c.cx},${c.cy}`,raw},{transfer:[...transfer]});yield
  }
  // The distant skyline and ground use the same 880m planning envelope.
  // Supply those plans too: a new macroregion must never be generated during
  // the first render after a long jump. One message per plan bounds delivery.
  for(const {mx,my}of q.cityPlans??[]){self.postMessage({phase:'plan',plan:l11CityPlan(q.seed,mx,my)});yield}
}

self.onmessage=(event:MessageEvent<(DevExitSearchRequest&{prepareDestination?:boolean})|{prepare:DevExitPrepareRequest}>)=>{
  if('prepare' in event.data){
    const job=prepare(event.data.prepare)
    const pump=()=>{try{if(job.next().done)self.postMessage({phase:'ready'});else setTimeout(pump,0)}catch(error){self.postMessage({error:String(error)})}}
    pump();return
  }
  const destination=event.data.prepareDestination
  const job=searchDevExit(event.data)
  const pump=()=>{
    try{
      const deadline=performance.now()+8
      do{const next=job.next();if(next.done){self.postMessage(destination?{phase:'found',result:next.value}:next.value);return}}while(performance.now()<deadline)
      setTimeout(pump,0)
    }catch(error){self.postMessage({error:String(error)})}
  }
  pump()
}
