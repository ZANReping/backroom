import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../reports/npc-faces-v6/',import.meta.url)),label=process.argv[2]??'after-final'
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid report label')
const before=JSON.parse(readFileSync(root+'before/result.json')),after=JSON.parse(readFileSync(root+label+'/result.json'))
if(!before.ok||!after.ok)throw Error('Cannot summarize failed verification as final')
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)]
const stats=data=>['realistic','classic'].map(mode=>{const a=data.samples.filter(v=>v.mode===mode);return{mode,median:median(a.map(v=>v.median)),worstP95:Math.max(...a.map(v=>v.p95)),gpuMedian:median(a.map(v=>v.gpuMedian)),draws:a[0].draws,triangles:a[0].triangles}})
const summary={before:stats(before),after:stats(after),checks:after.checks.checks,named:after.checks.named,errors:after.errors.length,assetFailures:after.failedRequests.filter(r=>!r.url.endsWith('/favicon.ico')),cleanup:after.cleanup}
writeFileSync(root+'summary.json',JSON.stringify(summary,null,2))
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const pair=(title,name)=>`<section><h2>${esc(title)}</h2><div class="pair">${['before',label].map((d,i)=>`<figure><figcaption>${i?'修改后':'修改前'}</figcaption><a href="${d}/${name}.png"><img loading="lazy" src="${d}/${name}.png" alt="${esc(title)} ${i?'后':'前'}"></a></figure>`).join('')}</div></section>`
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NPC 面孔 v6 对照</title><style>body{margin:0;background:#202522;color:#e5e4db;font:16px/1.6 system-ui,sans-serif}main{max-width:1800px;margin:auto;padding:30px}h2{margin-top:36px;font-size:22px}a{color:#b8d8c5}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}figure{margin:0;background:#292c2b}figcaption{padding:8px 12px}img{display:block;width:100%;height:auto}.portraits{display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap}.portraits img{width:160px}p{max-width:1150px}@media(max-width:850px){main{padding:15px}.pair{grid-template-columns:1fr}}</style><main>
<h1>NPC 面孔 v6：前后对照</h1><p>2026-10-17 · 95 个固定人形配置，91 张新专属面孔 · <a href="README.md">验收与限制</a> · <a href="${label}/result.json">原始数据</a></p>
<p>固定相机、中性画廊灯光，1920×1080；图片可点击打开原图。新资产按包完整导入，帽饰、眼镜、耳机、衣物和手持物继续使用现有贴合模型。</p>
${pair('面孔近景','close')}${pair('发区：红发、金发、灰发与光头','hair-colors')}${pair('帽子、口罩、护目镜与眼镜','accessories')}
<p>闭眼图的切换和恢复已验证。源包部分合成图仍有原眼残影，例如左侧莱恩；此图保留该问题供复查。</p>${pair('闭眼贴图','blink')}
${pair('实际游戏：Alpha 真实光影','game-realistic')}${pair('实际游戏：Alpha 经典光影','game-classic')}
<h2>档案／对话头像</h2><div class="portraits">${['lan','morel','faust','nightingale'].map(id=>`<figure><figcaption>${id}</figcaption><img src="${label}/portrait-${id}.png" alt="${id} 头像"></figure>`).join('')}</div>
<h2>所有固定人形配置</h2>${Array.from({length:Math.ceil(after.models.length/8)},(_,i)=>pair(`目录 ${i+1}`,'catalog-'+String(i).padStart(2,'0'))).join('')}</main></html>`
writeFileSync(root+'comparison.html',html)
console.log(JSON.stringify(summary,null,2))
