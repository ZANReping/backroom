// Offline comparison of recorded UI evidence; never drives a browser.
import {readFileSync,writeFileSync} from 'node:fs'
import {createCanvas,loadImage} from '@napi-rs/canvas'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const app=new URL('../',import.meta.url),root=new URL('reports/l1-remake/iteration-3/',app)
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'))
const old=read('baseline/regions-performance.json'),now=read('current/regions-performance.json')
for(const row of [...old,...now])for(const key of ['viewport','renderSize'])if(JSON.stringify(row[key])!=='[1920,1080]')throw Error(`Unexpected ${key}: ${row.anchor}`)
const max=(row,key)=>Math.max(...row.rounds.map(x=>x[key]))
const min=(row,key)=>Math.min(...row.rounds.map(x=>x[key]))
const rows=now.map(n=>{const b=old.find(x=>x.anchor===n.anchor);return{anchor:n.anchor,before:{median:max(b,'median'),p95:max(b,'p95'),triangles:[min(b,'triangles'),max(b,'triangles')],draws:[min(b,'draws'),max(b,'draws')],cold:b.build.maxFrame,generationMs:b.build.generationMs},after:{median:max(n,'median'),p95:max(n,'p95'),triangles:[min(n,'triangles'),max(n,'triangles')],draws:[min(n,'draws'),max(n,'draws')],cold:n.build.maxFrame,generationMs:n.build.generationMs}}})
writeFileSync(new URL('comparison/performance.json',root),JSON.stringify(rows,null,2))
const lines=['# 同轮前后对照','','修改前后均显式记录 viewport 与 renderSize 为 1920×1080。每区域五轮，表中帧时间取最差轮。管线合并减少面数，并未显著改善已接近刷新间隔的稳态 RAF；冷构建没有通过预算。','','| 场景 | 中位数前→后 ms | P95 前→后 ms | 三角面范围前→后 | 绘制调用前→后 | 构建期长帧前→后 ms |','| --- | --- | --- | --- | --- | --- |']
for(const r of rows){const b=r.before,a=r.after;lines.push(`| ${r.anchor} | ${b.median.toFixed(2)} → ${a.median.toFixed(2)} | ${b.p95.toFixed(2)} → ${a.p95.toFixed(2)} | ${b.triangles.join('–')} → ${a.triangles.join('–')} | ${b.draws.join('–')} → ${a.draws.join('–')} | ${b.cold.toFixed(1)} → ${a.cold.toFixed(1)} |`)}
lines.push('','绘制调用和三角面范围来自轮末帧，受按频率更新的阴影/反射影响；不能将不同刷新相位的轮末值视为完整帧分布。同步生成时间是 moveTo 的 updateInfiniteWindow；构建期峰值为 RAF 间隔，包含调度/构建/着色器等，不能直接当成单个函数耗时。前后测试在同一隐藏内置浏览器依序进行，未清除驱动缓存，也非多次进程冷启动的统计。')
writeFileSync(new URL('COMPARISON.md',root),lines.join('\n')+'\n')
const ids=['parking-common','path-room','storage'],canvas=createCanvas(1440,1200),ctx=canvas.getContext('2d')
ctx.fillStyle='#181b1e';ctx.fillRect(0,0,1440,1200);ctx.font='20px sans-serif';ctx.fillStyle='#fff'
for(const [i,id]of ids.entries()){
 ctx.fillText(`${id}      before | after`,12,i*400+26)
 for(const [j,kind]of ['baseline','current'].entries()){
  const im=await loadImage(fileURLToPath(new URL(`${kind}/reference/${id}.png`,root))),s=Math.min(690/im.width,358/im.height)
  ctx.drawImage(im,j*720+(720-im.width*s)/2,i*400+36,im.width*s,im.height*s)
 }
}
writeFileSync(new URL('comparison/before-after.jpg',root),canvas.toBuffer('image/jpeg'))
const sources=['renderer/l1Architecture.ts','renderer/l1Materials.ts','world/l1Architecture.ts','world/l1Spatial.ts']
const hashes=sources.map(file=>({file,before:createHash('sha256').update(readFileSync(new URL('.cache/l1-iteration3-before/src/game/'+file,app))).digest('hex'),after:createHash('sha256').update(readFileSync(new URL('src/game/'+file,app))).digest('hex')}))
writeFileSync(new URL('source-hashes.json',root),JSON.stringify(hashes,null,2))
console.log('Saved validated viewport comparison, before/after sheet and source hashes.')
