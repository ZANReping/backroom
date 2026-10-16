import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = path.join(root, 'reports/l11-reference/inspection')
const notes = JSON.parse(fs.readFileSync(path.join(reportDir, 'notes.json'), 'utf8'))
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
const sourcePath = file => `../../../reference/L11/${encodeURIComponent(file)}`

const nav = notes.sources.map(source => `<a href="#${esc(source.file)}">${esc(source.file)}</a>`).join(' · ')
const cards = notes.sources.map(source => {
  const regions = source.regions.map(region => {
    const crop = `./${encodeURIComponent(region.crop)}`
    const observed = region.observed.map(item => `<li>${esc(item)}</li>`).join('')
    const unknown = region.unknown.map(item => `<li>${esc(item)}</li>`).join('')
    const rect = region.pixels.join(', ')
    return `<article class="region" id="${esc(source.file)}-${esc(region.id)}">
      <h3>${esc(region.title)}</h3>
      <div class="media"><button class="image-button" data-original="${sourcePath(source.file)}" data-crop="${crop}" data-title="${esc(region.title)}"><img src="${crop}" alt="${esc(region.title)} 裁剪图" loading="lazy"></button></div>
      <p class="coords">原图像素矩形：<code>[${esc(rect)}]</code> · 放大倍率：${esc(region.scale)}×</p>
      <h4>已观察</h4><ul>${observed}</ul>
      <h4 class="unknown-title">未知或不可确认</h4><ul class="unknown">${unknown}</ul>
    </article>`
  }).join('\n')
  return `<section class="source" id="${esc(source.file)}"><h2>${esc(source.file)}</h2>
    <p class="source-meta">原图：<a href="${sourcePath(source.file)}" target="_blank" rel="noopener"><img class="source-thumb" src="${sourcePath(source.file)}" alt="${esc(source.file)} 原图缩略图" loading="lazy">打开原图</a> · 尺寸：${esc(source.width)} × ${esc(source.height)} px</p>
    <div class="regions">${regions}</div></section>`
}).join('\n')

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L11 参考图逐项观察</title>
<style>
:root{color-scheme:dark;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#111923;color:#e8edf2}body{margin:0;line-height:1.6}main{max-width:1500px;margin:auto;padding:24px}h1{margin:0 0 8px;color:#fff}h2{margin-top:42px;border-bottom:1px solid #43505c;padding-bottom:6px}h3{margin-top:0;color:#d9ecff}h4{margin:12px 0 2px;color:#bfe3ff}.notice{background:#2c2520;border:1px solid #816746;padding:14px;border-radius:8px}.nav{position:sticky;top:0;background:#111923ee;padding:10px 0;z-index:2}.nav a,a{color:#8fceff}.source-meta,.coords{color:#a9b5c0;font-size:.92rem}.source-thumb{width:120px;max-height:80px;object-fit:contain;vertical-align:middle;margin-right:8px;border:1px solid #526779}.regions{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:18px}.region{background:#1b2530;border:1px solid #334352;border-radius:10px;padding:14px}.media{background:#0b1117;min-height:140px;display:grid;place-items:center;overflow:hidden}.image-button{border:0;background:none;padding:0;cursor:zoom-in;max-width:100%}.image-button img{display:block;max-width:100%;height:auto}.unknown{color:#a8a8a8}.unknown-title{color:#c2a98d}code{color:#f0d89b}dialog{width:min(96vw,1200px);height:min(92vh,900px);background:#111923;color:#eee;border:1px solid #5a7185;border-radius:8px;padding:10px}dialog::backdrop{background:#000b}.viewer-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.viewer-bar button,.viewer-bar select{background:#263848;color:#fff;border:1px solid #58748b;padding:6px 10px;border-radius:4px;cursor:pointer}.viewer{height:calc(100% - 52px);overflow:auto;background:#05080b;cursor:grab}.viewer.dragging{cursor:grabbing}.viewer img{display:block;max-width:none;transform-origin:top left}
</style></head><body><main><h1>L11 参考图逐项观察</h1><p class="notice">本报告直接使用原图像素裁剪，不进行 AI 增强或像素编辑。放大只能帮助观察已有细节，不能揭示原图中不存在的细节；米制尺寸与字体身份均为估计，不能把当前游戏截图等同于最终还原。</p><nav class="nav">${nav} · <a href="../index.html">返回报告首页</a></nav>${cards}<p><a href="../inspection-runtime/runtime.json">运行时检查 JSON</a> · <a href="../README.md">重制报告 README</a> · <a href="../../../assets/l11-reference-signs-v2/manifest.json">标牌资产 manifest</a></p></main>
<dialog id="viewer"><div class="viewer-bar"><strong id="viewer-title"></strong><button data-mode="crop">裁剪图</button><button data-mode="original">原图</button><label>缩放 <input id="zoom" type="range" min="100" max="500" value="100" step="25"> <output id="zoom-value">100%</output></label><button id="close">关闭</button></div><div class="viewer"><img id="viewer-image" alt=""></div></dialog>
<script>const d=document.querySelector('#viewer'),im=document.querySelector('#viewer-image'),title=document.querySelector('#viewer-title'),zoom=document.querySelector('#zoom'),out=document.querySelector('#zoom-value'),pane=document.querySelector('.viewer');let paths={};const fit=()=>{if(im.naturalWidth){im.style.width=Math.round(im.naturalWidth*Number(zoom.value)/100)+'px';im.style.height='auto'}};document.querySelectorAll('.image-button').forEach(b=>b.addEventListener('click',()=>{paths={crop:b.dataset.crop,original:b.dataset.original};title.textContent=b.dataset.title;zoom.value=100;out.value='100%';im.onload=fit;im.src=paths.crop;d.showModal()}));document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{im.onload=fit;im.src=paths[b.dataset.mode]}));zoom.addEventListener('input',()=>{out.value=zoom.value+'%';fit()});let drag=false,lastX=0,lastY=0;pane.addEventListener('pointerdown',e=>{if(e.target!==im)return;drag=true;lastX=e.clientX;lastY=e.clientY;pane.classList.add('dragging');pane.setPointerCapture(e.pointerId)});pane.addEventListener('pointermove',e=>{if(!drag)return;pane.scrollLeft-=e.clientX-lastX;pane.scrollTop-=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY});const stop=e=>{drag=false;pane.classList.remove('dragging');if(e?.pointerId!=null&&pane.hasPointerCapture(e.pointerId))pane.releasePointerCapture(e.pointerId)};pane.addEventListener('pointerup',stop);pane.addEventListener('pointercancel',stop);document.querySelector('#close').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d)d.close()});</script></body></html>`
fs.writeFileSync(path.join(reportDir, 'index.html'), html)
console.log(`wrote ${path.join(reportDir, 'index.html')} (${notes.sources.length} sources, ${notes.sources.reduce((n,s)=>n+s.regions.length,0)} regions)`)
