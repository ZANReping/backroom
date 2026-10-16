import type { Engine } from '../engine'
import type { GenChunk } from '../world/infiniteRegistry'
import type { DevExitSearchRequest, DevExitSearchResult } from '../world/devExitSearch'
import type { DevExitPrepareRequest } from '../world/devTeleportPreparation'
import { devTeleportPreparation, devTeleportStamp } from '../world/devTeleportPreparation'
import { acceptL11Plans } from '../world/l11Layout'

// Repeated developer jumps reuse bounded planning caches. Idle memory is
// released after one minute; canceled/failed Workers are never reused.
let idleWorker:Worker|undefined,idleTimer:ReturnType<typeof setTimeout>|undefined
function acquireWorker(){const worker=idleWorker;idleWorker=undefined;clearTimeout(idleTimer);return worker??new Worker(new URL('../world/devExitSearch.worker.ts',import.meta.url),{type:'module'})}
function releaseWorker(worker:Worker){
  worker.onmessage=null;worker.onerror=null;idleWorker?.terminate();clearTimeout(idleTimer);idleWorker=worker
  idleTimer=setTimeout(()=>{if(idleWorker===worker){worker.terminate();idleWorker=undefined}},60000)
}

/** Search and destination generation share one Worker and its city-plan cache.
 * Only raw deterministic data crosses the boundary; live save/loot state is
 * applied by the usual instantiate path, once, after all chunks are ready. */
export function prepareDevExit(eng:Engine,request:DevExitSearchRequest,signal?:AbortSignal,progress?:(message:string)=>void){
  return new Promise<{found:DevExitSearchResult;chunks:ReadonlyMap<string,GenChunk>;stamp:string}>((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Cancelled','AbortError'));return}
    const map=eng.map!,inf=map.inf!,rev=inf.rev,level=eng.levelDef.id
    const chunks=new Map<string,GenChunk>()
    let found:DevExitSearchResult,preparation:DevExitPrepareRequest,stamp='',done=false
    const worker=acquireWorker()
    let timer:ReturnType<typeof setTimeout>
    const finish=(error?:Error)=>{
      if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort)
      if(error)worker.terminate();else releaseWorker(worker)
      if(error)reject(error);else resolve({found,chunks,stamp})
    }
    const abort=()=>finish(new DOMException('Cancelled','AbortError'))
    const watchdog=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(Error('目的地准备超时，位置未改变。')),35000)}
    const current=()=>eng.map===map&&eng.levelDef.id===level&&inf.rev===rev&&!eng.transition
    watchdog();signal?.addEventListener('abort',abort,{once:true});progress?.('正在查找最近出口…')
    worker.onerror=e=>finish(Error(e.message||'出口准备失败，位置未改变。'))
    worker.onmessage=event=>{
      if(done)return
      const data=event.data
      if(data.error){finish(Error(data.error));return}
      if(!current()){finish(Error('准备期间所在区块已改变，已取消传送。'));return}
      if(data.phase==='found'){
        found=data.result
        if(!found.complete||!found.exit){finish();return}
        preparation=devTeleportPreparation(map,eng.levelDef,found.exit,eng.time)
        stamp=devTeleportStamp(map,preparation,eng.time)
        progress?.('已找到出口，正在准备目的地…');if(done)return;watchdog()
        worker.postMessage({prepare:preparation})
      }else if(data.phase==='chunk'){
        chunks.set(data.key,data.raw)
        progress?.(`正在准备目的地：${chunks.size} / ${preparation.chunks.length} 个区块…`)
      }else if(data.phase==='plan')acceptL11Plans([data.plan])
      else if(data.phase==='ready'){
        if(chunks.size!==preparation.chunks.length||stamp!==devTeleportStamp(map,preparation,eng.time))finish(Error('目的地状态已更新，请重新传送。'))
        else {progress?.('目的地已准备，正在检查安全落点…');finish()}
      }
    }
    worker.postMessage({...request,prepareDestination:true})
  })
}
