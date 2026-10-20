import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const root='reports/l1-placement-fixes',read=p=>JSON.parse(readFileSync(`${root}/${p}`,'utf8'))
const runs=['before-realistic','after-realistic','after-classic','after-realistic-details'].map(name=>{
 const r=read(`${name}/result.json`)
 if(!r.ok||r.errors.length||r.failedRequests.some(q=>!q.url.endsWith('/favicon.ico'))||!r.cleanup.profileRemoved)throw Error('Failed or unclean QA: '+name)
 return {name,checks:r.summary.checks.length,scenes:r.scenes.length,entryMs:r.entryMs,gpu:r.gpu,cleanup:r.cleanup}
})
const checks=['l1','l1-v2','l1-props','l1-services','l1-bake','l1-vault-mesh','l1-room-dressing','l1-d-import','l1-interactions','l1-offline','l1-placement-fixes']
for(const name of checks){const log=readFileSync(`${root}/check-${name}.log`,'utf8');if(!log.length||/AssertionError|ERR_ASSERTION|Error TS\d|error TS\d/.test(log))throw Error('Regression log: '+name)}
const build=readFileSync(`${root}/build.log`,'utf8');if(!/built in \d/.test(build)||/error TS\d/.test(build))throw Error('Production build did not pass')
const files=['src/game/world/infiniteSeed.ts','src/game/world/infinite.ts','src/game/world/l1Building.ts','src/game/world/l1BuildingTypes.ts','src/game/world/l1Layout.ts','src/game/world/l1Spatial.ts','src/game/world/l1Placement.ts','src/game/world/l1WallFixtures.ts','src/game/world/l1OutpostSites.ts','src/game/world/infiniteL1.ts','src/game/world/l1Bake.ts','src/game/world/l1BakeTypes.ts','src/game/core/types.ts','src/game/renderer/structures.ts','src/game/renderer/renderer.ts','src/game/renderer/l1BakedScene.ts','src/game/renderer/l1OutpostEntrance.ts','public/assets/l1-bakes/manifest.json']
const sourceHashes=Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))
const manifest=JSON.parse(readFileSync('public/assets/l1-bakes/manifest.json','utf8')),stat=read('static.json')
const result={ok:true,generation:6,bakeRevision:manifest.bakeRevision,bakedChunks:manifest.chunks.length,staticChecks:stat.checks,coverage:stat.counts,runs,regressions:checks.map(n=>'check:'+n),build:'passed',sourceHashes}
writeFileSync(`${root}/summary.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:result.ok,staticChecks:result.staticChecks,runs:runs.map(v=>({name:v.name,checks:v.checks})),bakedChunks:result.bakedChunks}))
