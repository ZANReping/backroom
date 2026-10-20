import {readFileSync,writeFileSync} from 'node:fs'
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,'')),root='reports/l1-entry-shrimp/'
const beforeEntry=json('reports/level-entry/l1-entry-shrimp-before/runtime.json'),afterEntry=json('reports/level-entry/l1-entry-shrimp-after-profile/runtime.json'),otherSeed=json('reports/level-entry/l1-entry-shrimp-seed42/runtime.json')
const before=json(root+'before-realistic-20261020/result.json'),full=json(root+'after-realistic-20261020/result.json'),after=json(root+'after-realistic-20261020-pickup/result.json'),classic=json(root+'after-classic-20261020-pickup/result.json')
const leaving=json(root+'after-realistic-20261020-pickup-leave/result.json')
const a=beforeEntry.cases[0].cold,b=afterEntry.cases[0].cold
const summary={date:'2026-10-20',seed:20261020,viewport:[1920,1080],gpu:after.gpu,scope:'Isolated true-headless native-GPU Chrome. Cold level-entry samples use the same 500us CPU-profiler setting. Full App samples also include real E-key interaction and hotbar switching. No Android or general 60FPS certification.',
 entry:{beforeMs:a.loadMs,afterMs:b.loadMs,reductionPercent:(1-b.loadMs/a.loadMs)*100,beforePreparationMs:a.preparationMs,afterPreparationMs:b.preparationMs,beforeSceneMs:a.sceneMs,afterSceneMs:b.sceneMs,otherSeed:{seed:42,ms:otherSeed.cases[0].cold.loadMs}},
 application:{developmentFirstPlayableBeforeMs:before.firstPlayableMs,developmentFirstPlayableAfterMs:full.firstPlayableMs,note:'Includes Vite module loading, title readiness, and Continue UI. Not the same metric as a running-game level transition.'},
 shrimp:{before:before.catch,after:after.catch,classic:classic.catch,note:'renderMax is main-thread render() wall time, including driver work; it is not a GPU timer query. A measured zero uses the browser timer resolution.'},
 background:{chunks:full.refined.chunks,finalChunks:full.refined.final,queued:full.refined.bakes.queued,active:full.refined.bakes.active,readyCacheBytes:full.refined.bakes.bytes,maximumObservedQueueBytes:Math.max(...full.summary.refinements.map(s=>s.bakes.bytes)),elapsedFromFirstInspectionMs:full.summary.refinements.at(-1).at-full.summary.refinements[0].at,note:'All 25 high-detail bakes remain expensive and finish in the background. This full run overlapped later script/build checks, so elapsed time is diagnostic rather than an isolated throughput benchmark.'},
 leavingL1:leaving.leave,
 passed:[beforeEntry,afterEntry,otherSeed,before,full,after,classic,leaving].every(r=>r.ok)&&full.refined.final===25&&full.refined.bakes.queued===0,
 cleanup:[beforeEntry,afterEntry,otherSeed,before,full,after,classic,leaving].map(r=>r.cleanup)}
writeFileSync(root+'summary.json',JSON.stringify(summary,null,2)+'\n')
writeFileSync(root+'source-baseline.json',JSON.stringify(json('.cache/l1-entry-shrimp/baseline.json').map(({path,sha256})=>({path,sha256})),null,2)+'\n')
console.log(JSON.stringify({passed:summary.passed,entry:summary.entry,firstHoldBefore:before.catch.first.ms,firstHoldAfter:after.catch.first.ms,renderBefore:before.catch.firstFrame.renderMax,renderAfter:after.catch.firstFrame.renderMax,background:summary.background}))
if(!summary.passed)process.exitCode=1
