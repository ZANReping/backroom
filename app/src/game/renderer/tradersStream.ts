import * as THREE from 'three'
import type {Engine} from '../engine'
import type {GameMap} from '../world/mapgen'
import type {LevelDef,Structure} from '../core/types'
import {streamTradersWorld,syncTradersResidents,type TradersChunk} from '../world/tradersWorld'
import {TRADERS_BOUNDS,TRADERS_ENTRIES,tradersIntersects} from '../content/tradersLayout'
import {isTradeKind} from '../content/tradeDecor'
import {tradersVisibleChunks,tradersVaultsToPrepare} from './tradersVisibility'
import {ChunkBuildQueue} from './chunkBuildQueue'
import {TradersAssets,buildTradersArchitecture,buildTradersRoundTable,bakeTradersProp,buildTradersShutter,buildTradersCargo} from './tradersMeshes'
import {buildTradersFitout} from './tradersFitoutMeshes'
import {buildStructure} from './structures'
import {buildTradersGate} from './tradersGates'
import {batchStaticRootsJob} from './staticBatch'
import {compileSceneJob,uploadSceneJob,afterRendererCompile} from './sceneWarmup'
interface RecordModel{s:Structure;root:THREE.Group}
export interface TradersStreamHost{
 three:THREE.WebGLRenderer;scene:THREE.Scene;camera:THREE.PerspectiveCamera
 target:()=>THREE.WebGLRenderTarget|null;shadow:()=>THREE.SpotLight|null
 prepare:(s:Structure,root:THREE.Group)=>void
 warm:(root:THREE.Object3D)=>Generator<void,void,unknown>
 add:(key:string,c:TradersChunk|undefined,g:THREE.Group,models:RecordModel[],exits:THREE.Object3D[])=>void
 remove:(key:string,g:THREE.Group,models:RecordModel[])=>void
 retire:(g:THREE.Group)=>void
}
const dist=(c:TradersChunk,x:number,y:number)=>Math.hypot(Math.max(c.bounds.x-x,0,x-c.bounds.x-c.bounds.w),Math.max(c.bounds.y-y,0,y-c.bounds.y-c.bounds.h))
export class TradersSceneStream{
 readonly assets=new TradersAssets()
 readonly jobs=new ChunkBuildQueue<{key:string;stamp:string;iter:Generator<void,void,unknown>}>()
 readonly architectureJobs=new ChunkBuildQueue<{key:string;iter:Generator<void,void,unknown>}>()
 readonly architecture=new Map<string,THREE.Group>()
 readonly groups=new Map<string,{group:THREE.Group;models:RecordModel[];stamp:string}>()
 private stamps=new Map<string,string>()
 private stampsRevision=-1
 private preparedVaults=new Set<string>()
 private globalReady=false
 private lastX=NaN
 private lastY=NaN
 disposed=false
 readonly map:GameMap
 readonly def:LevelDef
 readonly host:TradersStreamHost
 constructor(map:GameMap,def:LevelDef,host:TradersStreamHost){this.map=map;this.def=def;this.host=host}
 sync(engine:Engine,budget:number,paused:boolean){
  streamTradersWorld(this.map,engine.player.x,engine.player.y,paused?Math.min(2,budget):1.1)
  syncTradersResidents(engine)
  const chunks=this.map.traders!.chunks
  const jumped=Number.isFinite(this.lastX)&&Math.hypot(engine.player.x-this.lastX,engine.player.y-this.lastY)>32
  this.lastX=engine.player.x;this.lastY=engine.player.y
  let changed=false
  for(const id of tradersVaultsToPrepare(this.map,engine.player.x,engine.player.y))if(!this.preparedVaults.has(id)){this.preparedVaults.add(id);changed=true}
  if(changed||this.stampsRevision!==this.map.traders!.revision){
   for(const key of this.stamps.keys())if(!chunks.has(key))this.stamps.delete(key)
   for(const c of chunks.values())this.stamps.set(c.key,c.structures.filter(s=>s.data?.tradersVaultContents&&this.preparedVaults.has(String(s.data.tradersVaultContents))).map(s=>s.data!.tradersId).join('|'))
   this.stampsRevision=this.map.traders!.revision
  }
  this.jobs.cancelWhere(job=>job.key!=='@global'&&(!chunks.has(job.key)||job.stamp!==this.stamps.get(job.key)||jumped&&dist(chunks.get(job.key)!,engine.player.x,engine.player.y)>24))
  this.architectureJobs.cancelWhere(job=>!chunks.has(job.key)||jumped&&dist(chunks.get(job.key)!,engine.player.x,engine.player.y)>24)
  for(const [key,group] of this.architecture)if(!chunks.has(key)){this.host.remove('@architecture:'+key,group,[]);this.host.retire(group);this.architecture.delete(key)}
  for(const [key,record] of this.groups)if(key!=='@global'&&!chunks.has(key)){this.host.remove(key,record.group,record.models);this.host.retire(record.group);this.groups.delete(key)}
  if(!this.globalReady&&!this.jobs.has('@global'))this.jobs.add({key:'@global',stamp:'',iter:this.build(undefined,'')})
  const visible=tradersVisibleChunks(this.map,engine.player.x,engine.player.y,Math.min(94,this.host.camera.far))
  const walls=[...chunks.values()].filter(c=>!this.architecture.has(c.key)&&!this.architectureJobs.has(c.key)).sort((a,b)=>Number(visible.has(b.key))-Number(visible.has(a.key))||dist(a,engine.player.x,engine.player.y)-dist(b,engine.player.x,engine.player.y))
  for(const c of walls){if(this.architectureJobs.size>=4)break;this.architectureJobs.add({key:c.key,iter:this.buildArchitecture(c)})}
  const pending=[...chunks.values()].filter(c=>this.architecture.has(c.key)&&(!this.groups.has(c.key)||this.groups.get(c.key)!.stamp!==this.stamps.get(c.key))&&!this.jobs.has(c.key)).sort((a,b)=>dist(a,engine.player.x,engine.player.y)-dist(b,engine.player.x,engine.player.y))
  for(const c of pending){if(this.jobs.size>=3)break;this.jobs.add({key:c.key,stamp:this.stamps.get(c.key)!,iter:this.build(c,this.stamps.get(c.key)!)})}
  // Catch up the visible architecture and nearby furniture after a jump. Doubling the
  // normal slice (capped at the 6 ms loading budget) avoids empty scenery while
  // preserving the configured low-budget mobile path and ordinary walking cost.
  const urgent=!this.ready(engine.player.x,engine.player.y)
  const slice=urgent?Math.min(6,Math.max(.4,budget)*2):Math.max(.4,budget),start=performance.now()
  // Architecture has its own queue: a distant wall never waits for hundreds of
  // parcels, furniture baking or item meshes in an earlier chunk to finish.
  this.architectureJobs.advance(slice*.65,paused||urgent?1024:160)
  this.jobs.advance(Math.max(.15,slice-(performance.now()-start)),paused||urgent?1024:160)
 }
 ready(x:number,y:number,reach=24){
  if(!this.globalReady||this.map.traders!.pendingNearNpcs)return false
  const required=Math.max(reach,Math.min(94,this.host.camera.far)),visible=tradersVisibleChunks(this.map,x,y,required)
  for(let cy=Math.floor((y-required)/32);cy<=Math.floor((y+required)/32);cy++)for(let cx=Math.floor((x-required)/32);cx<=Math.floor((x+required)/32);cx++){
   const r={x:cx*32,y:cy*32,w:32,h:32},d=Math.hypot(Math.max(r.x-x,0,x-r.x-32),Math.max(r.y-y,0,y-r.y-32))
   if(!tradersIntersects(r,TRADERS_BOUNDS))continue
   const key=cx+','+cy
   if((visible.has(key)&&!this.architecture.has(key))||(d<=reach&&(!this.architecture.has(key)||!this.groups.has(key)||this.groups.get(key)!.stamp!==this.stamps.get(key))))return false
  }
  return true
 }
 private *buildArchitecture(c:TradersChunk):Generator<void,void,unknown>{
  const host=this.host,g=new THREE.Group(),key=c.key;let installed=false;g.name='traders-architecture:'+key
  try{
   yield* buildTradersArchitecture(this.map,c,g,this.assets)
   yield* host.warm(g)
   yield* compileSceneJob(host.three,g,host.camera,host.scene,host.target())
   yield* uploadSceneJob(host.three,g,host.camera,host.scene,false,host.shadow(),host.target())
   if(this.disposed)return
   host.scene.add(g);host.add('@architecture:'+key,c,g,[],[]);this.architecture.set(key,g);installed=true
  }finally{if(!installed)host.retire(g)}
 }
 private *build(c:TradersChunk|undefined,stamp:string):Generator<void,void,unknown>{
  const host=this.host,g=new THREE.Group(),key=c?.key??'@global',models:RecordModel[]=[],exits:THREE.Object3D[]=[],staticRoots:THREE.Object3D[]=[]
  let installed=false;g.name='traders-chunk:'+key
  try{
   const allowed=new Set(stamp.split('|')),source=c?.structures.filter(s=>!s.data?.tradersVaultContents||allowed.has(String(s.data.tradersId)))??this.map.traders!.base.filter(s=>s.data?.cargoId!==undefined)
   for(const s of source){
    if(isTradeKind(s.kind)&&s.kind!=='trade_anomaly'&&!s.data?.tradersModel)continue
    let root:THREE.Group|null
    if(s.data?.tradersModel)root=buildTradersFitout(s,this.assets)
    else if(s.data?.tradersDoor)root=buildTradersShutter(s,this.assets)
    else if(s.kind==='trade_anomaly')root=buildTradersCargo(s,this.assets)
    else if(s.data?.tradersProp==='cafe_table')root=buildTradersRoundTable(s,this.assets)
    else root=buildStructure(s,this.def,this.map,4.8) as THREE.Group|null
    if(!root)continue
    g.add(root);host.prepare(s,root)
    if(!s.data?.tradersDoor&&s.kind!=='trade_anomaly'){yield* bakeTradersProp(root,this.assets);staticRoots.push(root)}
    models.push({s,root});yield
   }
   if(staticRoots.length){const batch=new THREE.Group();batch.name='traders-furniture';batch.userData.noCollision=true;yield* batchStaticRootsJob(batch,staticRoots);g.add(batch);for(const root of staticRoots)if(root.parent!==batch){root.userData.colliderProxy=true;root.visible=false}}
   if(c)for(const e of this.map.exits)if(e.x+.5>=c.bounds.x&&e.x+.5<c.bounds.x+32&&e.y+.5>=c.bounds.y&&e.y+.5<c.bounds.y+32){
    const entry=TRADERS_ENTRIES.find(entry=>Math.hypot(entry.x-e.x-.5,entry.y-e.y-.5)<.01)
    if(!entry)throw Error('Missing Traders Keep gate plan')
    const root=yield* buildTradersGate(entry,this.assets)
    root.userData.exitRef=e;root.userData.interactionTarget={kind:'exit',exit:e}
    g.add(root);exits.push(root);yield
   }
   yield* host.warm(g)
   yield* compileSceneJob(host.three,g,host.camera,host.scene,host.target())
   yield* uploadSceneJob(host.three,g,host.camera,host.scene,false,host.shadow(),host.target())
   if(this.disposed)return
   const previous=this.groups.get(key)
   if(previous){
    const oldDoors=new Map(previous.models.filter(v=>v.s.data?.tradersDoor).map(v=>[v.s,v.root]))
    for(const model of models){const before=oldDoors.get(model.s);if(!before)continue
     const open=Number(before.userData.open??model.s.data?.open??0);model.root.userData.open=open
     model.root.traverse(o=>{if(o.userData.lid){o.position.y=open*Number(model.root.userData.rollerLift??1.85);o.scale.y=1-open*.8}})
    }
    host.remove(key,previous.group,previous.models);host.retire(previous.group)
   }
   host.scene.add(g);host.add(key,c,g,models,exits);this.groups.set(key,{group:g,models,stamp});if(!c)this.globalReady=true;installed=true
  }finally{
   if(!installed)host.retire(g)
  }
 }
 dispose(){
  if(this.disposed)return;this.disposed=true
  this.jobs.cancelWhere(()=>true);this.architectureJobs.cancelWhere(()=>true)
  for(const [key,g] of this.architecture){this.host.remove('@architecture:'+key,g,[]);this.host.retire(g)}
  this.architecture.clear()
  for(const [key,r] of this.groups){this.host.remove(key,r.group,r.models);this.host.retire(r.group)}
  this.groups.clear();this.stamps.clear();this.preparedVaults.clear()
  afterRendererCompile(this.host.three,()=>this.assets.dispose())
 }
}
