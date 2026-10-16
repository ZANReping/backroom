import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const out=fileURLToPath(new URL('../reports/smiler-trees/',import.meta.url))
const read=name=>JSON.parse(readFileSync(path.join(out,name,'runtime.json'),'utf8'))
const before=read('before-realistic-final'),after=read('after-realistic-final'),classic=read('after-classic-final')
const beforePerf=read('before-realistic-steady'),afterPerf=read('after-realistic-steady')
const retakes=[read('after-realistic-eyes'),read('after-classic-eyes')]
for(const run of [before,after,classic,beforePerf,afterPerf,...retakes])if(!run.ok)throw Error(`Cannot summarize incomplete run ${run.run}`)
const rows=['l9-street','l10-field'].map(id=>({id,before:beforePerf.views.find(v=>v.id===id).view,after:afterPerf.views.find(v=>v.id===id).view,classic:classic.views.find(v=>v.id===id).view}))
for(const row of rows)if(JSON.stringify(row.before.pose)!==JSON.stringify(row.after.pose))throw Error(`Camera mismatch: ${row.id}`)
const n=v=>Number(v).toFixed(2)
const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)]
const table=rows.map(row=>[row.id,...['before','after','classic'].map(key=>{const ss=row[key].samples;return`${n(median(ss.map(s=>s.median)))} / ${n(median(ss.map(s=>s.p95)))} ms; ${Math.min(...ss.map(s=>s.draws))}–${Math.max(...ss.map(s=>s.draws))} calls; ${Math.max(...ss.map(s=>s.triangles))} triangles peak`})])
writeFileSync(path.join(out,'comparison.json'),JSON.stringify({seed:20261006,gpu:after.gpu,rows,smiler:afterPerf.runtime,classic:classic.runtime,retakes},null,2))
const labels={'common-windup':'普通笑魇：蓄力','common-impact':'普通笑魇：命中','phantom-windup':'幽影笑魇：蓄力','phantom-impact':'幽影笑魇：命中','starved-windup':'饥饿笑魇：蓄力','starved-impact':'饥饿笑魇：命中','canid-windup':'犬形笑魇：蓄力','canid-impact':'犬形笑魇：命中','great-windup':'巨笑魇：蓄力','great-impact':'巨笑魇：命中','great-outdoor':'巨笑魇：室外近距离','l9-street':'L9 实际街景','l10-field':'L10 实际田野','l9-forms':'L9 六种树形，统一田野光照','l9-forms-back':'L9 树形背面','l10-forms':'L10 六种树形','l10-forms-back':'L10 树形背面'}
const esc=s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
const captureFolder=(folder,id)=>folder.startsWith('after-')&&id.startsWith('phantom-')?folder.replace('-final','-eyes'):folder
const figure=(folder,id,label)=>{const actual=captureFolder(folder,id);return `<figure><a href="${actual}/case-${id}.png"><img loading="lazy" src="${actual}/case-${id}.png" alt="${esc(label)}"></a><figcaption>${esc(label)}</figcaption></figure>`}
writeFileSync(path.join(out,'comparison.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>笑魇攻击与 L9/L10 树木对照</title><style>body{max-width:1560px;margin:32px auto;padding:0 20px;background:#151a1c;color:#e7e8e4;font:16px/1.65 system-ui}h1{font-size:28px}a{color:#a9d1bc}section{margin:36px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;display:block}figcaption{padding:8px;background:#20292d}td,th{padding:10px;text-align:left;border-bottom:1px solid #435052}table{width:100%;border-collapse:collapse}pre{white-space:pre-wrap}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><h1>笑魇攻击与 L9/L10 树木对照</h1><p>种子 20261006 · 1920×1080 · 真正无头 Chrome · ${esc(after.gpu)}</p><p>树木实景使用相同世界坐标；六树形检视使用生产模型与 L10 的阴天光照，另保留 L9 夜间实景。笑魇对照分别使用改前／改后的实际攻击停距，取蓄力 0.24s 与出击 0.38s。点击图片查看原图。</p><table><tr><th>场景</th><th>改前真实</th><th>改后真实</th><th>改后经典</th></tr>${table.map(r=>'<tr>'+r.map(c=>`<td>${esc(c)}</td>`).join('')+'</tr>').join('')}</table><p>帧时间为 RAF 中位数 / P95；调用与三角面包含阴影等渲染通道。这里只是固定视角短采样，不代表所有设备或完整游戏性能。</p>${after.cases.map(id=>`<section><h2>${esc(labels[id]||id)}</h2><div class="pair">${figure('before-realistic-final',id,'改前 · 真实')}${figure('after-realistic-final',id,'改后 · 真实')}</div><details><summary>经典模式</summary>${figure('after-classic-final',id,'改后 · 经典')}</details></section>`).join('')}<p><a href="REPORT.md">完整验证说明</a> · <a href="comparison.json">机器可读数据</a></p></html>`)
console.log(JSON.stringify(table,null,2))

// Saved contact sheets make visual review repeatable without opening 34 tabs.
async function sheet(filename,entries,columns=2){
  const w=640,h=388,canvas=createCanvas(w*columns,h*Math.ceil(entries.length/columns)),ctx=canvas.getContext('2d')
  ctx.fillStyle='#151a1c';ctx.fillRect(0,0,canvas.width,canvas.height)
  for(let i=0;i<entries.length;i++){
    const [folder,id]=entries[i],x=i%columns*w,y=Math.floor(i/columns)*h
    ctx.drawImage(await loadImage(path.join(out,captureFolder(folder,id),`case-${id}.png`)),x,y,w,360)
    ctx.fillStyle='#e7e8e4';ctx.font='17px Arial';ctx.fillText(`${folder} / ${id}`,x+8,y+381)
  }
  writeFileSync(path.join(out,filename),canvas.toBuffer('image/png'))
}
for(const mode of ['realistic','classic'])await sheet(`attacks-${mode}.png`,['common','phantom','starved','canid','great'].flatMap(k=>['windup','impact'].map(a=>[`after-${mode}-final`,`${k}-${a}`])))
await sheet('trees-before-after.png',['l9-street','l10-field','l9-forms','l10-forms','l9-forms-back','l10-forms-back'].flatMap(id=>['before-realistic-final','after-realistic-final'].map(folder=>[folder,id])))
