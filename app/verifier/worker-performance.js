import {Engine} from '/src/game/engine.ts'
import {getRenderer} from '/src/game/renderer/renderer.ts'
import {look} from '/src/game/renderer/shared.ts'
import {storage} from '/src/game/core/storage.ts'
import {audio} from '/src/game/core/audio.ts'
import {prepareChunkWindow} from '/src/game/world/chunkCache.ts'
import {levelDefOf} from '/src/game/levels/index.ts'
storage.get=()=>null;storage.set=()=>{};storage.remove=()=>{};audio.setMuted(true)
const query=new URLSearchParams(location.search),mode=query.get('mode')==='classic'?'classic':'realistic'
const canvas=document.querySelector('canvas'),engine=new Engine(),renderer=getRenderer(canvas),status=document.querySelector('#status')
renderer.resize(1920,1080,1);renderer.setLightMode(mode);renderer.setTextureQuality(2);renderer.setSceneLightLimit(16);renderer.setDetailDistance(.65);renderer.setChunkBudget(2);renderer.setLoadingBudget(4);renderer.setParticleDensity(.25);renderer.setBloomFx(true);renderer.setShadows(true);renderer.three.info.autoReset=false
// Fixed static-world protocol: optional, unrelated entity catalogue prewarms are
// measured separately by the actual-App tests, not allowed to vary between runs.
renderer.advanceOptionalModels=()=>{}
const next=()=>new Promise(requestAnimationFrame),quant=(a,q)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*q)]??0
const summarize=rows=>({samples:rows.length,frameMedian:quant(rows.map(r=>r.frame),.5),frameP95:quant(rows.map(r=>r.frame),.95),logicMedian:quant(rows.map(r=>r.logic),.5),logicP95:quant(rows.map(r=>r.logic),.95),renderMedian:quant(rows.map(r=>r.render),.5),renderP95:quant(rows.map(r=>r.render),.95),cpuMedian:quant(rows.map(r=>r.logic+r.render),.5),cpuP95:quant(rows.map(r=>r.logic+r.render),.95),drawCalls:quant(rows.map(r=>r.calls),.5),triangles:quant(rows.map(r=>r.triangles),.5),over50:rows.filter(r=>r.frame>50).length})
let longs=[];new PerformanceObserver(list=>{for(const e of list.getEntries())longs.push({at:e.startTime,ms:e.duration})}).observe({type:'longtask',buffered:true})
const gl=renderer.three.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),gpu=[]
const polls=[]
function poll(){if(!ext)return;while(polls.length&&gl.getQueryParameter(polls[0],gl.QUERY_RESULT_AVAILABLE)){const q=polls.shift();if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q)}}
function draw(dt){
 renderer.three.info.reset();const t=performance.now();renderer.applyView(engine);engine.update(dt);const logic=performance.now()-t
 let q=null;poll();if(ext&&polls.length<4){q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q)}
 const rt=performance.now();renderer.render(canvas,engine,{grain:false,flicker:0,shake:false},dt);const render=performance.now()-rt
 if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);polls.push(q)}
 return {logic,render,calls:renderer.three.info.render.calls,triangles:renderer.three.info.render.triangles}
}
function preparation(){return {chunks:renderer.chunkBuilds.size,finite:!!renderer.finiteTask,distant:!!renderer.cityDistantTask,modelJobs:renderer.itemWarmup.jobs.size,cpuJobs:renderer.entityCpuWarmup.jobs.size}}
async function measure(level){
 status.textContent='Level '+level+' 准备完整静态场景';let seed=424242+level,random=12345
 Math.random=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296}
 const at=performance.now();await prepareChunkWindow(levelDefOf(level),seed);engine.seed=seed;engine.loadLevel(level,{mapSeed:seed,firstVisit:false});engine.dev.god=true;engine.dev.statLock=true;engine.dev.frozenAI=true;engine.dev.phenOff.add('flicker');engine.introT=0;engine.paused=true;look.yaw=0;look.pitch=0;look.roll=0
 const warm=[];let last=await next(),quiet=0
 while(quiet<60||warm.length<720){
  if(performance.now()-at>240000)throw Error('Full-scene warmup timeout: '+JSON.stringify(preparation()))
  const now=await next(),dt=Math.min(.05,(now-last)/1000);last=now;engine.paused=!renderer.isNearWorldReady(engine);look.yaw=warm.length*Math.PI*2/360;warm.push(draw(dt))
  const p=preparation(),ready=renderer.isTitleWorldReady(engine)
  quiet=ready&&!p.chunks&&!p.finite&&!p.distant&&!p.modelJobs&&!p.cpuJobs?quiet+1:0
 }
 look.yaw=0
 const warmupMs=performance.now()-at,rounds=[]
 longs=[];gpu.length=0;engine.paused=false
 for(let round=0;round<5;round++){
  status.textContent='Level '+level+' 第 '+(round+1)+' / 5 轮';const rows=[];let rendered=await next()
  while(rows.length<120){
   const now=await next(),elapsed=now-rendered
   if(elapsed<1000/60-.3)continue
   rendered=now;look.yaw=rows.length*Math.PI*2/120
   rows.push({frame:elapsed,...draw(Math.min(.05,elapsed/1000))})
  }
  rounds.push({summary:summarize(rows),rows})
 }
 const sight=await import('/src/game/world/mapSightWorker.ts'),pixels=await import('/src/game/renderer/pbrPixelQueue.ts'),geo=await import('/src/game/renderer/hotelGeometryQueue.ts')
 const result={level,seed,warmupMs,warmupCpuMax:Math.max(...warm.map(r=>r.logic+r.render)),rounds,summary:summarize(rounds.flatMap(r=>r.rows)),longs:[...longs],gpu:ext?{samples:gpu.length,median:quant(gpu,.5),p95:quant(gpu,.95)}:null,workers:{sight:sight.sightWorkerStats(),pixels:pixels.pbrPixelStats(),geometry:geo.hotelGeometryStats()},resources:{...renderer.three.info.memory},preparation:preparation()}
 status.textContent='Level '+level+' 完成';return result
}
const debug=gl.getExtension('WEBGL_debug_renderer_info')
window.workerPerf={measure,engine,renderer,environment:{mode,seedProtocol:'424242 + level; deterministic Math.random per level',viewport:[1920,1080],targetHz:60,dynamicResolution:false,dpr:1,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gpuTimer:!!ext,hardwareConcurrency:navigator.hardwareConcurrency,staticWorld:'full chunk/build queue + distant skyline + model preparation drained; simulation active once near-ready; two complete 360-degree warmup turns + 60 quiet frames; optional catalogue prewarming disabled equally in both variants'}}
