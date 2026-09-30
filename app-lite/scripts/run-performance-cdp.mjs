// Connect to a disposable Chromium test session; no dependency or saved profile required.
// Usage: node scripts/run-performance-cdp.mjs <browser-websocket-url> <cpu-rate> <output.json> [levels-csv|checks|occlusion|batches|l8batches|moving|transforms|npcs|npcruntime|warmup|cancel|colors|instancecolors|items|textures|textureimages|materials|modelwarmup|halopass|glass|glasspasses|l4batchjob|compilevariants|staticbatchjob|loadingbudget|infiniteterrain|l9colorcancel|sky|walking|crossings]
import { writeFile } from 'node:fs/promises'
const [url, rate='1', output='.check/performance-final.json', levels] = process.argv.slice(2)
if (!url) throw new Error('Provide the test browser CDP WebSocket URL')
const socket = new WebSocket(url), pending = new Map(), runtimeDiagnostics=[]
let sequence=0
socket.addEventListener('message', event => {
  const message=JSON.parse(event.data), job=pending.get(message.id)
  if(message.method==='Runtime.exceptionThrown')runtimeDiagnostics.push(message.params.exceptionDetails)
  if(message.method==='Log.entryAdded'&&(message.params.entry.level==='error'||/WebGL/i.test(message.params.entry.text)))runtimeDiagnostics.push(message.params.entry)
  if(job){pending.delete(message.id);message.error?job.reject(new Error(JSON.stringify(message.error))):job.resolve(message.result)}
})
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
  const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}))
})
const {targetInfos}=await send('Target.getTargets')
const target=targetInfos.find(t=>t.type==='page'&&t.url.includes('/verifier/performance.html'))
if(!target)throw new Error('Open verifier/performance.html in the test browser first')
const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})
try {
  await send('Page.bringToFront',{},sessionId)
  await send('Runtime.enable',{},sessionId)
  await send('Log.enable',{},sessionId)
  runtimeDiagnostics.length=0
  await send('Emulation.setCPUThrottlingRate',{rate:Number(rate)},sessionId)
  const ids=levels&&!['checks','occlusion','batches','l8batches','moving','npcs','npcruntime','warmup','cancel','colors','instancecolors','items','textures','textureimages','materials','modelwarmup','halopass','glass','glasspasses','l4batchjob','compilevariants','staticbatchjob','loadingbudget','infiniteterrain','l9colorcancel','transforms','sky','walking','crossings'].includes(levels)?JSON.stringify(levels.split(',').map(Number)):'undefined'
  const expression=levels==='walking' ? `(async()=>({walking:await perfQA.walk([4,5,105,106]),environment:perfQA.report()}))()` : levels==='sky' ? `(async()=>({sky:await(await import('/verifier/sky-textures.js?v='+Date.now())).verifySkyTextures()}))()` : levels==='batches' ? `(async()=>({batches:await(await import('/verifier/performance-batches.js?v='+Date.now())).verifyStaticBatches()}))()` : levels==='occlusion' ? `(async()=>({occlusion:await(await import('/verifier/occlusion.js?v='+Date.now())).verifyOcclusion()}))()` : levels==='checks'
    ? `(async()=>({regression:await (await import('/verifier/performance-regression.js')).runPerformanceRegressions(),flows:await (await import('/verifier/performance-flows.js')).verifyPerformanceFlows()}))()`
    : levels==='crossings' ? `(async()=>{const {measureChunkCrossings}=await import('/verifier/performance-flows.js?v='+Date.now());const crossings=[];for(const id of [0,4,5,8,11])crossings.push(await measureChunkCrossings(id,6));return {crossings,environment:perfQA.report()}})()`
    : levels==='l8batches' ? `(async()=>({l8batches:await(await import('/verifier/l8-batches.js?v='+Date.now())).verifyL8Batches()}))()`
    : levels==='moving' ? `(async()=>{const {verifyMovingInstances}=await import('/verifier/moving-instances.js?v='+Date.now());const modes=[await verifyMovingInstances('classic'),await verifyMovingInstances('realistic')];return {moving:{passed:modes.reduce((n,m)=>n+m.passed,0),modes}}})()`
    : levels==='transforms' ? `(async()=>({transforms:await(await import('/verifier/static-transforms.js?v='+Date.now())).verifyStaticTransforms()}))()`
    : levels==='npcs' ? `(async()=>({npcs:await(await import('/verifier/npc-batches.js?v='+Date.now())).verifyNpcBatches()}))()`
    : levels==='textures' ? `(async()=>({textures:await(await import('/verifier/texture-reuse.js?v='+Date.now())).verifyTextureReuse()}))()`
    : levels==='textureimages' ? `(async()=>({textureimages:await(await import('/verifier/texture-images.js?v='+Date.now())).verifyTextureImages()}))()`
    : levels==='materials' ? `(async()=>({materials:await(await import('/verifier/material-textures.js?v='+Date.now())).verifyMaterialTextures()}))()`
    : levels==='modelwarmup' ? `(async()=>({modelwarmup:await(await import('/verifier/model-warmup.js?v='+Date.now())).verifyModelWarmup()}))()`
    : levels==='halopass' ? `(async()=>({halopass:await(await import('/verifier/halo-pass.js?v='+Date.now())).verifyHaloPass()}))()`
    : levels==='glass' ? `(async()=>({glass:await(await import('/verifier/architectural-glass.js?v='+Date.now())).verifyArchitecturalGlass()}))()`
    : levels==='l4batchjob' ? `(async()=>({l4batchjob:await(await import('/verifier/l4-batch-job.js?v='+Date.now())).verifyL4BatchJob()}))()`
    : levels==='compilevariants' ? `(async()=>({compilevariants:await(await import('/verifier/compile-variants.js?v='+Date.now())).verifyCompileVariants()}))()`
    : levels==='staticbatchjob' ? `(async()=>({staticbatchjob:await(await import('/verifier/static-batch-job.js?v='+Date.now())).verifyStaticBatchJob()}))()`
    : levels==='loadingbudget' ? `(async()=>({loadingbudget:await(await import('/verifier/loading-budget.js?v='+Date.now())).verifyLoadingBudget()}))()`
    : levels==='infiniteterrain' ? `(async()=>({infiniteterrain:await(await import('/verifier/infinite-terrain-job.js?v='+Date.now())).verifyInfiniteTerrainJob()}))()`
    : levels==='l9colorcancel' ? `(async()=>({l9colorcancel:await(await import('/verifier/l9-color-cancellation.js?v='+Date.now())).verifyL9ColorCancellation()}))()`
    : levels==='instancecolors' ? `(async()=>({instancecolors:await(await import('/verifier/instance-colors.js?v='+Date.now())).verifyInstanceColors()}))()`
    : levels==='glasspasses' ? `(async()=>({glasspasses:await(await import('/verifier/architectural-glass-passes.js?v='+Date.now())).verifyArchitecturalGlassPasses()}))()`
    : levels==='items' ? `(async()=>({items:await(await import('/verifier/item-batches.js?v='+Date.now())).verifyItemBatches()}))()`
    : levels==='colors' ? `(async()=>({colors:await(await import('/verifier/static-colors.js?v='+Date.now())).verifyStaticColors()}))()`
    : levels==='cancel' ? `(async()=>({cancel:await(await import('/verifier/loading-cancellation.js?v='+Date.now())).verifyLoadingCancellation()}))()`
    : levels==='warmup' ? `(async()=>({warmup:await(await import('/verifier/scene-warmup.js?v='+Date.now())).verifySceneWarmup()}))()`
    : levels==='npcruntime' ? `(async()=>({npcruntime:await(await import('/verifier/npc-runtime.js?v='+Date.now())).verifyNpcRuntime()}))()`
    : `(async()=>{if(perfQA.busy)throw new Error('Benchmark already running');perfQA.results.length=0;await perfQA.run(${ids},240);return perfQA.report()})()`
  const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId)
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails))
  const report={...result.result.value,cpuThrottle:Number(rate),runtimeDiagnostics,environmentNote:'Desktop Chromium CPU throttling only; GPU remains desktop hardware. This does not certify Android performance.'}
  await writeFile(output,JSON.stringify(report,null,2))
  console.log(JSON.stringify(report.instancecolors?{passed:report.instancecolors.passed,comparisons:report.instancecolors.comparisons}:report.glasspasses?{passed:report.glasspasses.passed,comparisons:report.glasspasses.comparisons}:report.l9colorcancel?{passed:report.l9colorcancel.passed,comparisons:report.l9colorcancel.comparisons}:report.infiniteterrain?{passed:report.infiniteterrain.passed,comparisons:report.infiniteterrain.comparisons}:report.loadingbudget?{passed:report.loadingbudget.passed,comparisons:report.loadingbudget.comparisons}:report.staticbatchjob?{passed:report.staticbatchjob.passed,comparisons:report.staticbatchjob.comparisons}:report.glass?{passed:report.glass.passed,comparisons:report.glass.comparisons}:report.compilevariants?{passed:report.compilevariants.passed,comparisons:report.compilevariants.comparisons}:report.l4batchjob?{passed:report.l4batchjob.passed,comparisons:report.l4batchjob.comparisons}:report.halopass?{passed:report.halopass.passed,comparisons:report.halopass.comparisons}:report.modelwarmup?{passed:report.modelwarmup.passed,comparisons:report.modelwarmup.comparisons}:report.materials?{passed:report.materials.passed,comparisons:report.materials.comparisons}:report.textureimages?{passed:report.textureimages.passed,comparisons:report.textureimages.comparisons}:report.textures?{passed:report.textures.passed,cases:report.textures.cases}:report.items?{passed:report.items.passed,rayChecks:report.items.rayChecks}:report.colors?{passed:report.colors.passed}:report.cancel?{passed:report.cancel.passed,materials:report.cancel.materials}:report.warmup?{passed:report.warmup.passed}:report.npcruntime?{passed:report.npcruntime.passed,rows:report.npcruntime.rows.length}:report.npcs?{passed:report.npcs.passed,cases:report.npcs.cases}:report.transforms?{passed:report.transforms.passed,matrixChecks:report.transforms.matrixChecks}:report.moving?{passed:report.moving.passed,modes:report.moving.modes.map(m=>({lightMode:m.lightMode,passed:m.passed,shelves:m.shelves,sources:m.sources}))}:report.l8batches?{passed:report.l8batches.passed,rows:report.l8batches.rows}:report.crossings?report.crossings.map(r=>({level:r.level,shiftMs:Math.max(...r.rows.map(row=>row.shiftMs)),maxBuildMs:Math.max(...r.rows.map(row=>row.maxBuildMs)),count:r.rows.length})):report.walking??(report.results?report.results.map(r=>({level:r.level,cpuP90:r.steady.cpuP90,frameP90:r.steady.frameP90,startupMax:r.startup.cpuMax,calls:r.steady.drawCallsP50})):report.sky?report.sky:report.batches?{batches:report.batches.passed}:report.occlusion?{occlusion:report.occlusion.passed,hiddenMax:Math.max(...report.occlusion.rows.map(r=>r.hidden))}:{regression:report.regression.passed,flows:report.flows.passed}),null,2))
} finally {
  await send('Emulation.setCPUThrottlingRate',{rate:1},sessionId)
  await send('Target.detachFromTarget',{sessionId})
  socket.close()
}





