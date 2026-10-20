// One shared portrait studio. Visible UI thumbnails are queued outside React render.
import * as THREE from 'three'
import type {AvatarCfg} from '@/game/core/avatar'
import type {NpcDef} from '@/game/content/npcs'
import {buildCharacterModel} from '@/game/renderer/characterModel'
import {retroModelReady} from '@/game/renderer/retroAvatar'
import {disposeCharacterModel,subscribeRetroTextures} from '@/game/renderer/retroResources'
import {buildNpcEntityPreview} from '@/game/renderer/npcEntityPreview'
import {avatarFrame} from '@/game/renderer/avatarFraming'

export type PortraitRequest={avatar:AvatarCfg;npcId?:string;npcDef?:NpcDef;size?:number;framing?:'full'|'identity'}
const cache=new Map<string,string>(),MAX_CACHE=160,MAX_BYTES=8*1024*1024
let cacheBytes=0,renderer:THREE.WebGLRenderer|null=null,scene:THREE.Scene|null=null,camera:THREE.PerspectiveCamera|null=null,retainedModel:THREE.Group|null=null,builds=0,renders=0
export function npcPortraitKey({avatar,npcId,npcDef,size=96,framing='full'}:PortraitRequest){return JSON.stringify([avatar,npcId,npcDef?.uniform?.badge,npcDef?.workLoop,npcDef?.communityGear,npcDef?.faction,size,framing])}
export function cachedNpcPortrait(request:PortraitRequest){return cache.get(npcPortraitKey(request))}
function remember(key:string,url:string){
 const old=cache.get(key);if(old){cacheBytes-=old.length*2;cache.delete(key)}
 cache.set(key,url);cacheBytes+=url.length*2
 while(cache.size>MAX_CACHE||cacheBytes>MAX_BYTES){const first=cache.keys().next().value!;cacheBytes-=cache.get(first)!.length*2;cache.delete(first)}
}
function modelFor(p:PortraitRequest){builds++;return buildNpcEntityPreview(p.npcId)??buildCharacterModel(p.avatar,{npcId:p.npcId,npcDef:p.npcDef,driven:true})}
function paint(model:THREE.Group,p:PortraitRequest){
 if(!renderer){
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setPixelRatio(1)
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(36,1/1.45,.01,20)
  scene.add(new THREE.AmbientLight(0xffffff,.7));const key=new THREE.DirectionalLight(0xfff2d0,1.3);key.position.set(1.6,2.6,2.2);scene.add(key)
  const rim=new THREE.DirectionalLight(0x9ab0d0,.55);rim.position.set(-2,1.4,-1.6);scene.add(rim)
 }
 const size=p.size??96,identity=p.framing==='identity';renderer.setSize(size,Math.round(size*1.45),false)
 model.rotation.y=identity?0:.45;scene!.add(model)
 try{
  const fit=avatarFrame(model,camera!,identity?'head':'body');camera!.position.copy(fit.target).add(new THREE.Vector3(0,0,fit.distance));camera!.lookAt(fit.target)
  renderer.render(scene!,camera!);renders++;const url=renderer.domElement.toDataURL('image/png')
  // Overlap ownership until the next model has rendered, keeping shared shader
  // programs alive instead of disposing and recompiling them for every photo.
  const previous=retainedModel;retainedModel=model;if(previous&&previous!==model)disposeCharacterModel(previous)
  return url
 }finally{scene!.remove(model)}
}
/** Synchronous compatibility entry point; UI components use requestNpcPortrait instead. */
export function npcPortrait(avatar:AvatarCfg,npcId?:string,npcDef?:NpcDef,size=96,framing:'full'|'identity'='full'){
 const p={avatar,npcId,npcDef,size,framing},key=npcPortraitKey(p),hit=cache.get(key);if(hit)return hit
 const model=modelFor(p)
 try{const url=paint(model,p);if(retroModelReady(model))remember(key,url);return url}finally{if(model!==retainedModel)disposeCharacterModel(model)}
}

type Job={key:string;request:PortraitRequest;listeners:Set<(url:string)=>void>;model?:THREE.Group}
const jobs=new Map<string,Job>();let scheduled=0,wakeTimer=0
function schedule(afterPaint=false){if(!jobs.size||scheduled||wakeTimer)return;if(afterPaint)wakeTimer=window.setTimeout(()=>{wakeTimer=0;scheduled=requestAnimationFrame(tick)},40);else scheduled=requestAnimationFrame(tick)}
function finish(job:Job,url:string){
 jobs.delete(job.key);if(job.model){if(job.model!==retainedModel)disposeCharacterModel(job.model);job.model=undefined}
 for(const listener of job.listeners)listener(url)
 job.listeners.clear()
}
function tick(){
 scheduled=0
 // Upload/render at most one portrait per frame. Keep two texture loads in flight.
 for(const job of jobs.values())if(job.model&&retroModelReady(job.model)){
  try{const url=paint(job.model,job.request);remember(job.key,url);finish(job,url)}catch{finish(job,'')}
  schedule();return
 }
 const active=[...jobs.values()].filter(j=>j.model).length
 if(active<2){const next=[...jobs.values()].find(j=>!j.model);if(next){try{next.model=modelFor(next.request)}catch{finish(next,'')}schedule()}}
 // Texture completion wakes waiting jobs; no per-frame polling or React broadcasts.
}
subscribeRetroTextures(()=>schedule())
export function requestNpcPortrait(request:PortraitRequest,listener:(url:string)=>void){
 const key=npcPortraitKey(request),hit=cache.get(key)
 if(hit){cache.delete(key);cache.set(key,hit);listener(hit);return()=>{}}
 let job=jobs.get(key);if(!job){job={key,request,listeners:new Set()};jobs.set(key,job)}job.listeners.add(listener);schedule(true)
 return()=>{if(!job!.listeners.delete(listener)||job!.listeners.size||jobs.get(key)!==job)return;jobs.delete(key);if(job!.model){disposeCharacterModel(job!.model);job!.model=undefined}if(!jobs.size){if(scheduled)cancelAnimationFrame(scheduled);if(wakeTimer)clearTimeout(wakeTimer);scheduled=wakeTimer=0}}
}
export const npcPortraitStats=()=>({builds,renders,cached:cache.size,cacheBytes,queued:jobs.size,waiting:[...jobs.values()].filter(j=>j.model).length,memory:renderer?{...renderer.info.memory}:null})
