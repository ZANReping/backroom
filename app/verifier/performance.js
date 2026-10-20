import { Engine } from '/src/game/engine.ts'
import { look } from '/src/game/renderer/shared.ts'
const query = new URLSearchParams(location.search)
const { getRenderer } = await import(query.has('instanceColorBaseline') ? '/.check/renderer-instance-color-baseline.ts' : query.has('buildProfile') ? '/.check/renderer-builder-profile.ts' : query.has('l9ColorBaseline') ? '/.check/renderer-l9-color-baseline.ts' : query.has('variantBaseline') ? '/.check/renderer-variants-baseline.ts' : query.has('staticJobBaseline') ? '/.check/renderer-static-job-baseline.ts' : query.has('batchJobBaseline') ? '/.check/renderer-l4-batch-baseline.ts' : query.has('itemBaseline') ? '/.check/renderer-item-baseline.ts' : query.has('colorBaseline') ? '/.check/renderer-color-baseline.ts' : query.has('baseline') ? './renderer-baseline.ts' : '/src/game/renderer/renderer.ts')
import { ALL_LEVEL_DEFS } from '/src/game/levels/index.ts'
import { storage } from '/src/game/core/storage.ts'
import { audio } from '/src/game/core/audio.ts'
import { prepareChunkWindow } from '/src/game/world/chunkCache.ts'

storage.get = () => null; storage.set = () => {}; storage.remove = () => {}
audio.setMuted(true)
const canvas = document.querySelector('canvas'), engine = new Engine(), renderer = getRenderer(canvas)
const status = document.querySelector('#status'), output = document.querySelector('#result')
const levels = ALL_LEVEL_DEFS.map(d => d.id)
const select = document.querySelector('#level')
for (const id of levels) select.add(new Option(`Level ${id}`, String(id)))
renderer.resize(innerWidth, innerHeight, 1)
renderer.setSceneLightLimit?.(8); renderer.setChunkBudget?.(2); renderer.three.info.autoReset=false;
renderer.setLoadingBudget?.(4)
renderer.setShadows(false); renderer.setBloomFx(false)
renderer.setLightMode('classic'); renderer.setTextureQuality(0)
renderer.setDetailDistance(.65); renderer.setParticleDensity(.25)
const nextFrame = () => new Promise(requestAnimationFrame)
const percentile = (a, q) => [...a].sort((x,y) => x-y)[Math.floor((a.length-1)*q)] ?? 0
const summary = rows => ({ samples: rows.length,
  frameP50: percentile(rows.map(r=>r.frame), .5), frameP90: percentile(rows.map(r=>r.frame), .9),
  frameP95: percentile(rows.map(r=>r.frame), .95), frameMax: Math.max(0,...rows.map(r=>r.frame)),
  cpuP90: percentile(rows.map(r=>r.cpu),.9), cpuMax: Math.max(0,...rows.map(r=>r.cpu)),
  framesOver50ms: rows.filter(r=>r.frame>50).length,
  fractionWithin60HzBudget: rows.filter(r=>r.frame<=1000/60+.75).length/Math.max(1,rows.length),
  drawCallsP50: percentile(rows.map(r=>r.calls),.5), trianglesP50: percentile(rows.map(r=>r.triangles),.5) })
let busy=false
const results = []
const walkingResults = []
async function measure(id, samples=360) {
  status.textContent=`Level ${id} 正在加载`; await nextFrame()
  const preparedAt=performance.now()
  await prepareChunkWindow(ALL_LEVEL_DEFS.find(d=>d.id===id),424242)
  const preparationMs=performance.now()-preparedAt
  const t=performance.now()
  engine.newRun(424242,'normal'); engine.loadLevel(id,{mapSeed:424242,firstVisit:false})
  const generationMs=performance.now()-t
  engine.dev.god=true;engine.dev.statLock=true;engine.introT=0;engine.paused=true
  look.yaw=0;look.pitch=0
  let last=await nextFrame(), rows=[], startup=[], quiet=0, previousChunks=-1, waitingForMap=true
  const startedAt=performance.now()
  while(startup.length<180 || quiet<30) {
    if(performance.now()-startedAt>180_000) throw new Error(`Level ${id}: scene readiness timed out`)
    const now=await nextFrame(), dt=(now-last)/1000;last=now
    const start=performance.now()
    look.yaw+=.009
    renderer.three.info.reset();renderer.applyView(engine)
    if(waitingForMap && (renderer.isNearWorldReady?.(engine)??true)) waitingForMap=false
    engine.paused=waitingForMap;engine.update(Math.min(dt,.05))
    renderer.render(canvas,engine,{grain:false,flicker:.7,shake:false},Math.min(dt,.05))
    const info=renderer.three.info.render
    const row={frame:dt*1000,cpu:performance.now()-start,calls:info.calls,triangles:info.triangles}
    startup.push(row)
    const chunks=renderer.chunkGroups.size
    const ready=renderer.isNearWorldReady?.(engine)??true
    quiet=ready&&!renderer.cityChunkTask&&!renderer.finiteTask&&chunks===previousChunks?quiet+1:0
    previousChunks=chunks
  }
  const warmupMs=performance.now()-startedAt
  status.textContent=`Level ${id} · 360° 稳态环视`
  waitingForMap=false;engine.paused=false
  for(let n=0;n<samples;n++) {
    const now=await nextFrame(),dt=(now-last)/1000;last=now
    const start=performance.now();look.yaw+=Math.PI*2/samples
    renderer.three.info.reset();renderer.applyView(engine);engine.update(Math.min(dt,.05))
    renderer.render(canvas,engine,{grain:false,flicker:.7,shake:false},Math.min(dt,.05))
    const info=renderer.three.info.render
    rows.push({frame:dt*1000,cpu:performance.now()-start,calls:info.calls,triangles:info.triangles})
  }
  const result={level:id,preparationMs,generationMs,warmupMs,startup:summary(startup),steady:summary(rows),memory:{...renderer.three.info.memory},chunks:renderer.chunkGroups.size}
  results.push(result); output.textContent=JSON.stringify(result,null,2);status.textContent=`Level ${id} 完成`
  return result
}
async function run(ids=levels,samples=360){if(busy)return;busy=true;try{for(const id of ids)await measure(id,samples)}finally{busy=false}return results}
const report=()=>({device:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,
  renderSize:[canvas.width,canvas.height],capturedAt:new Date().toISOString(),startupProtocol:'Pause simulation until scene readiness, matching App waitingForMap; older captures ran simulation during loading.',
  gpu:(()=>{const gl=renderer.three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})(),
  hardwareConcurrency:navigator.hardwareConcurrency,seed:424242,profile:'classic / 65% details / 25% particles / DPR 1 / 8 lights / no shadows',
  buildBudgets:{activeMs:renderer.chunkBudgetMs,loadingMs:renderer.loadingBudgetMs},
  note:'60Hz 的显示帧间隔存在调度误差，预算比例允许 0.75ms；此比例不能证明严格超过 60fps。桌面模拟不能替代 Android 真机。',results,walkingResults})
async function walk(ids=[Number(select.value)]) {
  if(busy)throw new Error('Benchmark already running')
  busy=true
  try{
    const {measureWalking}=await import('./performance-walking.js')
    for(const id of ids){const result=await measureWalking(id);walkingResults.push(result);output.textContent=JSON.stringify(result,null,2)}
    status.textContent='行走与操作完成'
  }finally{busy=false}
  return walkingResults
}
document.querySelector('#run').onclick=()=>run([Number(select.value)])
document.querySelector('#walk').onclick=()=>walk()
document.querySelector('#all').onclick=()=>run()
document.querySelector('#download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}));a.download='backroom-performance.json';a.click();URL.revokeObjectURL(a.href)}
window.perfQA={engine,renderer,look,run,walk,measure,report,results,get busy(){return busy}}
status.textContent='就绪'


