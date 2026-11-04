import {ALL_LEVEL_DEFS,FOYER_LEVEL_DEF,L02_LEVEL_DEF,levelLabel} from '/src/game/levels/index.ts'
import {prepareChunkWindow} from '/src/game/world/chunkCache.ts'
export const entryLevels=[...ALL_LEVEL_DEFS,FOYER_LEVEL_DEF,L02_LEVEL_DEF].map(d=>({id:d.id,name:levelLabel(d.id),title:d.name,infinite:!!d.infinite,gen:d.gen}))
export function attach(qa,mode='realistic'){
 const {engine:e,renderer:r,look}=qa
 r.setLightMode(mode);r.setTextureQuality(1);r.setDetailDistance(1);r.setSceneLightLimit(16);r.setLoadingBudget(6);r.setChunkBudget(3);r.setShadows(true);r.setLightShadows(2);r.setBloomFx(true);r.setPhotography(1,0,0,'neutral');r.setParticleDensity(.7)
 document.querySelector('aside')?.remove()
 e.dev.god=true;e.dev.statLock=true;e.dev.frozenAI=true;e.paused=true;e.introT=0
 const frame=()=>new Promise(requestAnimationFrame),draw=()=>{r.three.info.reset();r.applyView(e);r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)}
 let row
 for(const name of ['buildLevel','buildInfiniteChunk','warmSceneTextures','warmFlashModel','warmShrimpHeld','warmMothModels','warmNguithrModel','warmArmsModels','warmWatchModels','warmWranglerModels','warmBursterModel','warmFoyerScene']){
  if(typeof r[name]!=='function')continue
  const orig=r[name];r[name]=function*(...args){const job=orig.apply(this,args);try{for(;;){const t=performance.now(),v=job.next(),ms=performance.now()-t;if(row){const m=row.cpu[name]??={steps:0,ms:0,maxMs:0};m.steps++;m.ms+=ms;m.maxMs=Math.max(m.maxMs,ms)}if(v.done)return v.value;yield v.value}}finally{job.return()}}
 }
 const original=r.three.compileAsync;r.three.compileAsync=function(...a){const t=performance.now(),p=original.apply(this,a),m={target:!!this.getRenderTarget(),submitMs:performance.now()-t,elapsedMs:null};if(row)row.compiles.push(m);return p.finally(()=>m.elapsedMs=performance.now()-t)}
 const state=()=>({ready:!!e.map&&r.isNearWorldReady(e),built:!!e.map&&r.builtMap===e.map,chunks:r.chunkGroups.size,chunkJobs:r.chunkBuilds?.size??0,finite:!!r.finiteTask,env:!!r.pendingEnvProbe,flash:!!r.flashWarmup,flashKey:!!r.flashWarmupKey,shrimp:!!r.shrimpHeldWarmup,shrimpKey:!!r.shrimpHeldWarmupKey,nguithr:!!r.nguithrWarmup,moth:!r.mothWarmupDone,arms:!!r.armsWarmup,watch:!r.watchWarmupDone,wrangler:!r.wranglerWarmupDone,burster:!r.bursterWarmupDone,foyer:!r.foyerWarmDone,npcs:r.npcMeshes.size,items:r.itemMeshes.size,entities:r.entityMeshes.size,modelQueue:r.itemWarmup.size,images:[...r.worldTextures].filter(t=>t.userData.fileImagePending).length,memory:{...r.three.info.memory},programs:r.three.info.programs.length})
 async function measure(id,seed=424242){
  const def=[...ALL_LEVEL_DEFS,FOYER_LEVEL_DEF,L02_LEVEL_DEF].find(d=>d.id===id);if(!def)throw Error('Unregistered entry '+id)
  row={id,name:levelLabel(id),title:def.name,seed,mode,cpu:{},compiles:[],milestones:[],status:'prepare'};const t=performance.now();row.started=t;e.seed=seed
  await prepareChunkWindow(def,seed);row.prepareMs=performance.now()-t
  const gen=performance.now();e.loadLevel(id,{mapSeed:seed,firstVisit:true});row.generationMs=performance.now()-gen
  e.dev.god=true;e.dev.statLock=true;e.dev.frozenAI=true;e.paused=true;e.introT=0;look.yaw=0;look.pitch=0
  row.status='scene';let last=performance.now(),sample=-1,prev=last;row.frames=0;row.cpuMs=0;row.cpuMaxMs=0;row.frameMaxMs=0
  while(performance.now()-t<90000){await frame();const now=performance.now(),cpu=performance.now();draw();const ms=performance.now()-cpu;row.cpuMs+=ms;row.cpuMaxMs=Math.max(row.cpuMaxMs,ms);row.frameMaxMs=Math.max(row.frameMaxMs,now-prev);prev=now;row.frames++;row.elapsedMs=performance.now()-t;if(now-sample>=500){row.milestones.push({ms:row.elapsedMs,...state()});sample=now}if(r.isNearWorldReady(e)){row.status='ready';break}last=now}
  if(row.status!=='ready')row.status='timeout';row.readyMs=performance.now()-t
  if(row.status==='ready'){for(let i=0;i<2;i++){await frame();draw()}}
  row.loadMs=performance.now()-t;row.final=state();row.foyerWarmStats=r.foyerWarmStats;if(id===102)row.staticBakeWorkers=(await import('/src/game/renderer/tradersBakeQueue.ts')).tradersBakeStats();row.spawn={x:e.player.x,y:e.player.y,z:e.player.z};row.structures=e.map.structures.length;row.lightCount=e.map.lights.length
  return row
 }
 const gl=r.three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info')
 qa.entrySpeed={measure,state,levels:entryLevels,get current(){return row}}
 return {baseURI:document.baseURI,levels:entryLevels,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),cores:navigator.hardwareConcurrency,visibility:document.visibilityState,focused:document.hasFocus(),viewport:[innerWidth,innerHeight],mode,settings:{textureQuality:1,detailDistance:100,sceneLightLimit:16,loadingBudget:6,chunkBudget:3,shadows:true,lightShadows:2,bloom:true,ao:1,dpr:devicePixelRatio}}
}
