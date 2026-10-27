import * as THREE from 'three'
import type { Entity } from '../entities'
import type { EntityMeshOpts } from './entitiesMesh'
import { prepareArachnidTextures } from './arachnidMesh'
import { prepareCamoTextures } from './camoCrawlerMesh'
import { prepareCurabiturTextures } from './curabiturMesh'
import { buildArachnidEntityJob } from './arachnidRender'
import { buildCamoEntityJob } from './camoRender'
import { buildCurabiturEntityJob } from './curabiturRender'
import { buildLightguideEntityMesh } from './lightguideRender'
import { buildTinyJob } from './tinyMesh'
import { buildThingJob } from './thingMesh'
import { disposeL8Tree } from './l8ModelResources'
import { buildVendingEntityJob } from './entitiesMesh'
import { buildCreeperEntityJob } from './creeperRender'
import { buildHoundMeshJob } from './houndMesh'
const types=new Set(['arachnid','camocrawler','curabitur','lightguide','tiny','thething','vendingmachine','vmad','creeper','hound'])
export const isL8Remade=(type:string)=>types.has(type)
let sharedReady=false
function* shared():Generator<void,void>{
 if(sharedReady)return
 yield* prepareArachnidTextures();yield* prepareCamoTextures();yield* prepareCurabiturTextures()
 sharedReady=true
}
function* model(type:string,o:EntityMeshOpts):Generator<void,THREE.Group,unknown>{
 if(type==='vendingmachine'||type==='vmad')return yield* buildVendingEntityJob(type,o)
 if(type==='creeper')return yield* buildCreeperEntityJob(o.creep)
 if(type==='hound')return yield*buildHoundMeshJob(!!o.houndNeutral,o.seed??0,o.houndKind)
 if(type==='tiny')return yield* buildTinyJob()
 if(type==='thething')return yield* buildThingJob()
 if(type==='arachnid')return yield* buildArachnidEntityJob(o)
 if(type==='camocrawler')return yield* buildCamoEntityJob(o.seed)
 if(type==='curabitur')return yield* buildCurabiturEntityJob(o)
 yield;return buildLightguideEntityMesh(o.seed??0)
}
type Job={iter:Generator<void,THREE.Group,unknown>;ready?:THREE.Group;key?:string}
/** Instance jobs own partial meshes and are cancelled when their entity leaves the window. */
export class L8EntityPreparation{
 private jobs=new Map<Entity,Job>()
 private shared:Generator<void,void>|null=null
 request(e:Entity,opts:EntityMeshOpts):THREE.Group|null{
  let job=this.jobs.get(e)
  const key=e.def.type==='hound'?JSON.stringify([opts.houndNeutral,opts.houndKind,opts.seed]):undefined
  if(job&&job.key!==key){if(job.ready)disposeL8Tree(job.ready);else job.iter.return(undefined as never);this.jobs.delete(e);job=undefined}
  if(!job){job={iter:model(e.def.type,opts),key};this.jobs.set(e,job)}
  if(!job.ready)return null
  this.jobs.delete(e);return job.ready
 }
 advance(live:ReadonlySet<Entity>,budgetMs=1.5){
  for(const[e,j]of this.jobs)if(!live.has(e)){if(j.ready)disposeL8Tree(j.ready);else j.iter.return(undefined as never);this.jobs.delete(e)}
  if(!this.jobs.size)return
  const end=performance.now()+budgetMs
  if(!sharedReady&&[...this.jobs.keys()].some(e=>['arachnid','camocrawler','curabitur','lightguide'].includes(e.def.type))){this.shared??=shared();for(let n=0;n<12&&performance.now()<end;n++)if(this.shared.next().done){this.shared=null;break}if(!sharedReady)return}
  const steps=[...this.jobs.keys()].some(e=>e.def.type==='hound')?128:16
  for(let n=0;n<steps&&performance.now()<end;n++){
   const next=[...this.jobs].find(([,j])=>!j.ready);if(!next)break
   const[e,j]=next;this.jobs.delete(e);this.jobs.set(e,j)
   const step=j.iter.next();if(step.done)j.ready=step.value
  }
 }
 clear(){for(const j of this.jobs.values())if(j.ready)disposeL8Tree(j.ready);else j.iter.return(undefined as never);this.jobs.clear();this.shared?.return();this.shared=null}
}
