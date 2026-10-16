import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../reports/npc-gear/',import.meta.url)),label=process.argv[2]??'after-final'
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid report label')
const before=JSON.parse(readFileSync(root+'before/result.json')),after=JSON.parse(readFileSync(root+label+'/result.json'))
if(!after.ok)throw Error('Cannot summarize a failed verification as final')
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const details=[['hats','帽冠、帽檐与头型'],['medical','眼镜、耳机与口罩'],['hands','工作工具与握持'],['back','背带与背负'],['seated','坐姿与衣物弯折']]
const panel=(title,oldPath,newPath)=>`<section><h2>${esc(title)}</h2><div class="pair">${oldPath?`<figure><figcaption>修改前</figcaption><a href="${oldPath}"><img loading="lazy" src="${oldPath}" alt="修改前 ${esc(title)}"></a></figure>`:''}<figure><figcaption>修改后</figcaption><a href="${newPath}"><img loading="lazy" src="${newPath}" alt="修改后 ${esc(title)}"></a></figure></div></section>`
const rows=before.models.filter(v=>v.id!=='tiny').map(b=>({b,a:after.models.find(a=>a.id===b.id)})).filter(r=>r.a)
const median=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)]
const modes=['realistic','classic'].map(mode=>{const s=after.game.samples.filter(v=>v.mode===mode);return {mode,frameMedian:median(s.map(v=>v.median)),worstP95:Math.max(...s.map(v=>v.p95)),gpuMedian:median(s.map(v=>v.gpuMedian)),worstGpuP95:Math.max(...s.map(v=>v.gpuP95)),draws:s[0].draws}})
const summary={ok:after.ok,errors:after.errors.length,comparableModels:rows.length,medianTriangles:{before:median(rows.map(r=>r.b.triangles)),after:median(rows.map(r=>r.a.triangles))},medianMaterialGroups:{before:median(rows.map(r=>r.b.draws)),after:median(rows.map(r=>r.a.draws))},modes,cycles:after.game.cycles,cleanup:after.cleanup}
writeFileSync(root+'summary.json',JSON.stringify(summary,null,2))
const gallery=details.map(([id,title])=>panel(title,`before/${id}.png`,`${label}/${id}.png`)).join('')
const catalogs=Array.from({length:Math.ceil(after.models.length/8)},(_,i)=>{const file='catalog-'+String(i).padStart(2,'0')+'.png';return panel(`配置目录 ${i+1}`,existsSync(root+'before/'+file)?'before/'+file:null,label+'/'+file)}).join('')
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NPC 配饰前后对照</title><style>
body{margin:0;background:#202522;color:#e5e4db;font:16px/1.6 system-ui,sans-serif}main{max-width:1800px;margin:auto;padding:32px}h1{margin:0}h2{font-size:21px;margin-top:40px}a{color:#bfd6cc}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}figure{margin:0;background:#292e2a}figcaption{padding:8px 14px}img{width:100%;height:auto;display:block}table{border-collapse:collapse;width:100%}td,th{padding:7px 12px;border-bottom:1px solid #556056;text-align:left}.note{max-width:1000px;color:#c5cbc4}@media(max-width:800px){main{padding:16px}.pair{grid-template-columns:1fr}}</style><main>
<h1>NPC 配饰：复古写实与骨骼贴合</h1><p>2026-10-17 · 1920×1080 · 共 ${after.models.length} 个视觉配置 · <a href="README.md">验收说明</a> · <a href="${label}/result.json">原始运行数据</a></p>
<p class="note">每张图片可点击查看原图。前后使用相同中性灯光和固定相机。姿态细节图检查了帽下头发、镜腿、耳带、肩章、衣面背带及手腕工具。末组增加了随机职业角色；Tiny 后图为实际实体外形，与此前通用人物预览不作性能比较。</p>
${gallery}${panel('吉他演奏与 Tiny 骨矛',null,`${label}/performing.png`)}
${['realistic','classic','performing'].map(v=>panel('实际游戏：'+({realistic:'Alpha 真实光影',classic:'Alpha 经典光影',performing:'餐馆演奏（隔离 NPC 测试实例）'}[v]),null,`${label}/game-${v}.png`)).join('')}
<h2>同一组人物的网格成本</h2><p class="note">${rows.length} 个可比人形配置，材质组中位数 ${summary.medianMaterialGroups.before} → ${summary.medianMaterialGroups.after}；三角面中位数 ${summary.medianTriangles.before} → ${summary.medianTriangles.after}。这是独立模型的材质组统计，不等于场景实际绘制调用；修改前场景仍有其他合批步骤，不能据此推算帧率增幅。</p>
<details><summary>展开逐人物数据</summary><table><thead><tr><th>NPC</th><th>三角面（前 → 后）</th><th>材质组（前 → 后）</th></tr></thead><tbody>${rows.map(({b,a})=>`<tr><td>${esc(b.id)}</td><td>${b.triangles} → ${a.triangles}</td><td>${b.draws} → ${a.draws}</td></tr>`).join('')}</tbody></table></details>
<h2>全体配置</h2><p class="note">前 12 组保留旧版图像作为比较；最后一组为本轮补充的职业变体。</p>${catalogs}</main></html>`
writeFileSync(root+'comparison.html',html)
console.log(JSON.stringify(summary,null,2))
