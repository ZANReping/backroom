import {structColliders} from './mapgen'
// Keep mapgen first: it initializes registered generators before L7's cyclic imports.
import {l7BathymetryCell} from './l7Bathymetry'
import {infiniteImplFor,type GenChunk} from './infiniteRegistry'
import {genL0Architecture,type L0SpaceState} from './l0Architecture'
import type {LevelDef} from '../core/types'
import {buildL1Data} from './l1Building'
import {l1MapGeometry} from './l1MapData'
type Request={id:number;def:LevelDef;seed:number;coords:{cx:number;cy:number}[];floor:number;state?:L0SpaceState;cancel?:boolean}
const cache=new Map<string,GenChunk>()
let current:Request|undefined,index=0
self.onmessage=(e:MessageEvent<Request>)=>{if(e.data.cancel){if(current?.id===e.data.id)current=undefined;return}current=e.data;index=0;setTimeout(()=>pump(e.data.id),0)}
function pump(id:number){
 const job=current;if(!job||job.id!==id)return
 const deadline=performance.now()+6
 do{
 const at=job.coords[index++];if(!at){self.postMessage({id:job.id,done:true});current=undefined;return}
 try{
  if(job.def.id===1){
   const geometry=l1MapGeometry(buildL1Data(job.seed,at.cx,at.cy))
   self.postMessage({id:job.id,cell:{...at,...geometry,tint:new Uint8Array(1024),elev:new Uint8Array(1024)}})
   continue
  }
  if(job.def.id===7){self.postMessage({id:job.id,cell:l7BathymetryCell(job.seed,at.cx,at.cy)});continue}
  const key=JSON.stringify([job.def.id,job.seed,at,job.state?.revisions[`${at.cx},${at.cy}`]??0,job.state?.redProgress])
  let raw=cache.get(key)
  if(!raw){raw=job.def.id===0?genL0Architecture(job.def,job.seed,at.cx,at.cy,undefined,job.state?.revisions[`${at.cx},${at.cy}`]??0,job.state?.redProgress):infiniteImplFor(job.def.id).genRaw(job.def,job.seed,at.cx,at.cy);cache.set(key,raw);if(cache.size>256)cache.delete(cache.keys().next().value!)}
  const tiles=job.floor<0?raw.dn:job.floor===1?raw.up:job.floor===2?raw.up2:raw.tiles
  const walls=raw.l0?.walls.filter(w=>w.bottom<1.8&&w.top>.05).map(w=>({x:w.x,y:w.y,w:w.w,h:w.h}))??raw.structures.filter(s=>s.solid&&(s.floor??0)===job.floor).flatMap(s=>structColliders(s).filter(b=>(b.bottom??0)<1.6&&b.top>.05).map(b=>({x:b.x0,y:b.y0,w:b.x1-b.x0,h:b.y1-b.y0,kind:s.kind})))
  self.postMessage({id:job.id,cell:{...at,variant:raw.variant,crawl:raw.crawl,tiles:tiles??new Uint8Array(1024),tint:raw.tint,elev:raw.elev,walls,regions:raw.l0?.mapRegions,pits:raw.l0?.pits},label:{x:at.cx*32+16,y:at.cy*32+16,text:raw.variant}})
 }catch(error){self.postMessage({id:job.id,error:String(error)});current=undefined;return}
 }while(performance.now()<deadline&&current?.id===id)
 setTimeout(()=>pump(id),0)
}
