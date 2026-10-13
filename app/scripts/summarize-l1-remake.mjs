// Summarize saved measurements only. This script does not launch/control a browser.
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve,sep} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const reportBase=resolve(fileURLToPath(new URL('../reports/l1-remake/',import.meta.url)))
const reportRoot=resolve(reportBase,process.argv[2]??'.')
if(reportRoot!==reportBase&&!reportRoot.startsWith(reportBase+sep))throw new Error('Report root must remain inside app/reports/l1-remake')
const base=pathToFileURL(reportRoot+sep)
const read=file=>JSON.parse(readFileSync(new URL(file,base),'utf8'))
const regions=read('current/regions-performance.json'),resources=read('current/resources.json').resources
const gothicPath=new URL('current/gothic-final-performance.json',base),gothic=existsSync(fileURLToPath(gothicPath))?JSON.parse(readFileSync(gothicPath,'utf8')):null
// The first report's Gothic file was measured after its geometry repair.
// Keep that historical behavior; same-code diagnostic followups never replace rows.
const gothicRow=regions.find(r=>r.variant==='gothic')
if(gothic&&gothicRow){gothicRow.rounds=gothic.rounds;gothicRow.build=gothic.build}
const followupPath=new URL('current/ouroboros-followup.json',base),followup=existsSync(fileURLToPath(followupPath))?JSON.parse(readFileSync(followupPath,'utf8')):null
const names={parking:'天鹰',storage:'跃金',gothic:'哥特',ouroboros:'衔尾',garden:'花园',maintenance:'小径'}
const max=(rows,key)=>Math.max(...rows.map(r=>r[key])),range=(rows,key)=>`${Math.min(...rows.map(r=>r[key]))}–${max(rows,key)}`
const summaries=regions.map(row=>({region:row.variant,anchor:row.anchor,rounds:row.rounds.length,median:max(row.rounds,'median'),p95:max(row.rounds,'p95'),cpuP95:max(row.rounds,'cpuP95'),gpuP95:max(row.rounds,'gpuP95'),buildPeak:row.build.maxFrame,draws:range(row.rounds,'draws'),triangles:range(row.rounds,'triangles'),passed:row.rounds.length===5&&row.rounds.every(r=>r.median<=16.7&&r.p95<=20)}))
const f=n=>n.toFixed(2)
const lines=['# Level 1 最终性能统计','','所有时间单位为毫秒。列出五轮中最差的中位数和 P95，不取最好一轮。绘制调用/三角面是各轮末帧的范围；反射与阴影按频率更新，因此不是逐帧完整分布。','','| 区域 | 中位数（最差轮） | P95（最差轮） | CPU P95 | GPU P95 | 轮末绘制调用 | 轮末三角面 | 构建期峰值 | 稳态目标 |','| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |']
for(const r of summaries)lines.push(`| ${names[r.region]} | ${f(r.median)} | ${f(r.p95)} | ${f(r.cpuP95)} | ${f(r.gpuP95)} | ${r.draws} | ${r.triangles} | ${f(r.buildPeak)} | ${r.passed?'通过':'未通过'} |`)
lines.push('',`以上六区均检查实际区段标识。${gothic?'哥特行采用柱顶接合及材质统一后的[单独五轮复测](current/gothic-final-performance.json)，其余五区来自同批完整测试。':'各区数据来自同批完整测试。'} RAF 帧间隔、CPU render 调用和 GPU 查询是不同测量，不能互相替代；构建峰值是该次构建期的最大帧间隔，不是五轮稳态平均，也不能推导为所有冷启动的上限。`)
if(followup){
  lines.push('','## 衔尾独立复测','','同一代码和设置下进行；原始整批结果保留，单独复测不推翻初测超标，也不能据此确定初测原因。[复测原始数据](current/ouroboros-followup.json)。','','| 轮次 | median | p95 | cpuP95 | gpuP95 |','| ---: | ---: | ---: | ---: | ---: |')
  const rounds=Array.isArray(followup)?followup:followup.rounds
  for(const [i,r] of rounds.slice(0,5).entries())lines.push(`| ${i+1} | ${f(r.median)} | ${f(r.p95)} | ${f(r.cpuP95)} | ${f(r.gpuP95)} |`)
}
lines.push('','## 回收测试','','| 轮次 | 几何 | 纹理 | 程序 |','| --- | ---: | ---: | ---: |')
resources.forEach((r,i)=>lines.push(`| ${i+1} | ${r.memory.geometries} | ${r.memory.textures} | ${r.programs} |`))
lines.push('','四轮均依次访问花园、跃金、哥特、天鹰，切换经典/真实，最终回到天鹰。几何、纹理与程序数量以表中实测值为准。','','原始数据：[六区域五轮](current/regions-performance.json)、[资源回收](current/resources.json)。冷构建仍未达到单帧预算，实际持续快速跨区、Android 真机及逐图建筑轮廓误差尚未通过验收。','','[方法、对照与限制](REPORT.md)。')
writeFileSync(new URL('PERFORMANCE.md',base),lines.join('\n')+'\n')
writeFileSync(new URL('current/summary.json',base),JSON.stringify({summaries,allSteadyPassed:summaries.every(r=>r.passed),resources:resources.map(r=>({memory:r.memory,programs:r.programs})),...(followup?{followup}: {})},null,2)+'\n')
console.log(`${summaries.filter(r=>r.passed).length}/${summaries.length} steady regions passed; cold-build peaks reported separately.`)
