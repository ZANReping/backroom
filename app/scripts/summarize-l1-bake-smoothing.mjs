import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createCanvas,loadImage} from '@napi-rs/canvas'
const root='reports/l1-bake-smoothing',read=p=>JSON.parse(readFileSync(`${root}/${p}`,'utf8'))
const baseline=read('before-realistic-benchmark/result.json'),final=read('after-realistic/result.json'),classic=read('after-classic/result.json'),gothic=read('after-realistic-gothic/result.json'),stat=read('static.json'),offline=JSON.parse(readFileSync('public/assets/l1-bakes/manifest.json','utf8'))
for(const [name,r]of Object.entries({baseline,final,classic,gothic})){
 if(!r.ok||r.errors.length||!r.cleanup.profileRemoved||r.gpu.contextLost||!/4060/.test(r.gpu.renderer))throw Error('Incomplete native game QA: '+name)
}
const q=(a,p)=>a.slice().sort((a,b)=>a-b)[Math.floor((a.length-1)*p)]
const perf=r=>({scope:r.bench.scope,rounds:r.bench.rounds.map(v=>({median:v.median,p95:v.p95,cpuMedian:v.cpuMedian,cpuP95:v.cpuP95,drawsMedian:v.drawsMedian,trianglesMedian:v.trianglesMedian,memory:v.memory})),medianOfMedians:q(r.bench.rounds.map(v=>v.median),.5),medianP95:q(r.bench.rounds.map(v=>v.p95),.5),worstP95:Math.max(...r.bench.rounds.map(v=>v.p95)),cpuMedian:q(r.bench.rounds.map(v=>v.cpuMedian),.5),cpuP95:q(r.bench.rounds.map(v=>v.cpuP95),.5)})
const beforePerf=perf(baseline),afterPerf=perf(final)
const files=['src/game/world/l1Bake.ts','src/game/world/l1BakeTypes.ts','public/assets/l1-bakes/manifest.json']
const summary={passed:stat.passed,bakeRevision:offline.bakeRevision,assertions:stat.assertions,publishedChunks:offline.chunks.length,coveredSamples:stat.cases.reduce((n,c)=>n+c.after.covered,0),litUnderSolids:stat.cases.reduce((n,c)=>n+c.after.litUnder,0),entryMs:{before:baseline.entryMs,after:final.entryMs},performance:{before:beforePerf,after:afterPerf,desktopTarget:{median:afterPerf.medianOfMedians<=16.7,p95:afterPerf.worstP95<=20}},hashes:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))}
for(const scene of ['parking-common-contact','parking-round-contact','parking-dim','gothic']){
 const source=scene==='gothic'?'after-realistic-gothic':'after-realistic',a=await loadImage(`${root}/before-realistic/${scene}.png`),b=await loadImage(`${root}/${source}/${scene}.png`)
 const W=900,H=506,canvas=createCanvas(W*2+16,H+42),c=canvas.getContext('2d')
 c.fillStyle='#171a1d';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#ffffff';c.font='20px sans-serif';c.fillText('Before',14,28);c.fillText('After',W+30,28)
 c.drawImage(a,0,42,W,H);c.drawImage(b,W+16,42,W,H);writeFileSync(`${root}/${scene}-comparison.png`,canvas.toBuffer('image/png'))
}
const logs=['bake','offline','generation','placement','vault','services','detail','import','interactions','build']
summary.logs=Object.fromEntries(logs.map(v=>[v,existsSync(`${root}/${v}.log`)]))
writeFileSync(`${root}/summary.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary))
