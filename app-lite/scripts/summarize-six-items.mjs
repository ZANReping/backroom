import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const dir=fileURLToPath(new URL('../reports/six-items/',import.meta.url))
const read=name=>JSON.parse(readFileSync(dir+name,'utf8'))
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)]
const summary=[]
for(const mode of ['classic','realistic']){
  const before=read(`before-${mode}-performance.json`),after=read(`after-${mode}-performance.json`)
  for(let i=0;i<before.length;i++){
    const b=before[i],a=after[i]
    if(b.renderer!==a.renderer||JSON.stringify(b.viewport)!==JSON.stringify(a.viewport)||a.rows.length!==5||b.rows.length!==5)throw Error('Incomparable benchmark configuration')
    const stats=c=>Object.fromEntries(['frameMedian','frameP95','drawMedian','drawP95'].map(k=>[k,median(c.rows.map(r=>r[k]))]))
    const bs=stats(b),as=stats(a)
    const passed=a.rows[0].calls<=b.rows[0].calls&&['frameMedian','frameP95'].every(k=>as[k]-bs[k]<=Math.max(bs[k]*.05,.5))
    summary.push({mode,type:a.type,before:bs,after:as,calls:[b.rows[0].calls,a.rows[0].calls],triangles:[b.rows[0].triangles,a.rows[0].triangles],passed})
  }
  for(const version of ['before','after']){
    const memory=read(`${version}-${mode}-lifecycle.json`)
    if(memory.some(r=>JSON.stringify(r)!==JSON.stringify(memory[0])))throw Error(`${version}/${mode} resource count grows`)
  }
}
writeFileSync(dir+'summary.json',JSON.stringify({date:'2026-10-04',aggregation:'median of five round statistics; raw per-round samples retained in performance JSON',allPassed:summary.every(r=>r.passed),summary},null,2)+'\n')
for(const r of summary)console.log(`${r.mode}/${r.type}: ${r.passed?'PASS':'FAIL'}; draws ${r.calls.join(' -> ')}; median/P95 ${r.after.frameMedian.toFixed(2)}/${r.after.frameP95.toFixed(2)} ms`)
if(summary.some(r=>!r.passed))process.exitCode=1
