import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const app=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(app,'reports/l11-reference')
const read=p=>JSON.parse(readFileSync(path.join(app,p),'utf8').replace(/^\uFEFF/,''))
const label=process.argv.find(a=>a.startsWith('--runtime='))?.slice(10)??'inspection-runtime'
const supplement=process.argv.find(a=>a.startsWith('--supplement='))?.slice(13)
if(![label,supplement].filter(Boolean).every(s=>/^[a-z0-9-]+$/.test(s)))throw Error('Invalid runtime report label')
const r=read(`reports/l11-reference/${label}/runtime.json`),ui=read('reports/l11-reference/inspection-ui/runtime.json'),audit=read('reports/l11-reference/inspection/notes.json'),architecture=read('reports/l11-reference/architecture/static.json'),urban=read('reports/l11-urban/layout-check.json'),mesh=read('reports/l11-remake/mesh-check.json'),checks=read('reports/l11-reference/inspection/checks.json')
const s=supplement?read(`reports/l11-reference/${supplement}/runtime.json`):undefined,runs=[r,s].filter(Boolean)
if(runs.some(v=>!v.ok||v.setup.version!==11||v.errors.length||!v.command.includes('--headless=new')||!v.cleanup.profileRemoved)||!ui.ok||!architecture.ok||urban.failures.length||checks.commands.some(c=>c.status!=='passed'))throw Error('Inspection acceptance has incomplete checks')
for(const [source,target]of [['README.md','README-v10.md'],['index.html','index-v10.html']])if(!existsSync(path.join(dir,target)))copyFileSync(path.join(dir,source),path.join(dir,target))
for(const [source,target]of [['reports/l11-reference/architecture/static.json','architecture.json'],['reports/l11-urban/layout-check.json','urban.json'],['reports/l11-remake/mesh-check.json','meshes.json'],['reports/l11-water-collision/static-collision.json','collision.json']])copyFileSync(path.join(app,source),path.join(dir,'inspection',target))
const merge=(a,b,key)=>[...new Map([...a,...b].map(v=>[v[key],v])).values()]
const views=merge(r.views.map(v=>({...v,report:label})),(s?.views??[]).map(v=>({...v,report:supplement})),'id')
const ordinary=merge((r.random??[]).map(v=>({...v,report:label})),(s?.random??[]).map(v=>({...v,report:supplement})),'kind')
const entries=merge(r.validation.flatMap(v=>v.entrances??[]),(s?.validation??[]).flatMap(v=>v.entrances??[]),'id'),rooms=r.roomWalks.flatMap(v=>v.checks),flights=entries.flatMap(e=>e.flights??[]),n=v=>Number(v).toFixed(1)
const gaps=[
  '原图未给出米制尺寸、完整室内平面或连廊内部。台阶尺寸、后部空间、店铺货架布局属于可通行的建模推定，不能称为实测还原。',
  '标牌保留可辨认的词句和阅读方向，但生成纹理的字体字重、字距仍有差异；被遮挡或分辨率不足的海报小字没有补写。',
  '本轮针对 11iconic 和 11canal 修正。其余七张的形状、朝向、文字与细部已录入放大观察页，尚未逐项完成新的模型还原。11lowdensity 的低层高度与此前“不要低矮平房”要求仍有差异，未偷偷改回低层。',
  '11exits 上的白色粗描边和方块视作图片标注；11barricade 不作为恢复人类据点或 NPC 的依据。',
  '当前画面与照片仍有树形、材质微细节、尺度和光照差异，不能把单一取景相似等同于全部细节还原。稳定 60 FPS 尚未达成。',
]
const descriptions={
  '01-office-street':'街面总览：Hope 信号杆路牌、贴墙立牌、转角店铺和前庭的相对关系。',
  '03-canal':'运河总览：右岸宽台阶替代均匀柱廊，蓝色属于相向侧面；缓拱桥与桥墩保留。',
  '14-storefront-corner':'同一间转角商铺，连续玻璃、两个门头、一块垂直于墙的圆形双面挑牌。',
  '15-storefront-interior':'从内部通道进入店铺，检查两面玻璃、陈设和独立临街门洞。室内布局为推定。',
  '16-twin-courtyard':'仰视楼间空间：连廊底板分缝、两端接合、玻璃侧面细框与蓝板。',
  '22-grand-entrance':'右前方宽台阶、扶手和两侧带围栏的种植区。',
  '23-entrance-gardens':'入口正面及侧面围栏，检查真实踏步与落地关系。',
  '29-banner-reading':'PEGASUS / Apartment Residences 由下往上，号码各字正立从上往下。',
  '30-shop-looking-out':'店铺内向转角观察，玻璃后确有可通行空间。',
  '31-roof-link-oblique':'从相反斜向查看连廊支承、底面与两楼侧面，结构不朝相机变化。',
  '32-waterside-steps':'宽台阶接到楼间入口；栏杆沿踏步坡度落地。',
  '33-shop-blade-reverse':'从反方向检查挑牌的背面文字、厚度与固定支架。',
}
const performance=views.map(v=>({id:v.id,report:v.report,medianMs:v.performance.median,p95Ms:v.performance.p95,cpuMedianMs:v.performance.cpuMedian,gpuMedianMs:v.performance.gpuMedian,drawCalls:v.performance.draws,triangles:v.performance.triangles,memory:v.performance.memory}))
const cycles=r.cycles.map(c=>({memory:c.memory,nonPooledTextures:c.nonPooledTextures,cachedAvatarTextures:c.cachedAvatarTextures,programs:c.programs,buildings:c.buildings,references:c.references,roots:c.roots,pending:c.pending,geometryAudit:c.geometryAudit}))
const networkErrors=runs.flatMap(run=>run.networkErrors.map(e=>e.response?{url:e.response.url,status:e.response.status}:{url:e.url,error:e.errorText}))
const summary={version:11,runtime:label,supplement,referenceSeed:r.seed,originals:audit.sources.length,crops:audit.sources.reduce((s,p)=>s+p.regions.length,0),views:views.length,ordinary,entries,flights:flights.length,roomWalks:rooms.length,shopStreetDoor:s?.inspected??r.inspected,bridge:s?.civil??r.civil,performance,hardware:r.hardware,browser:r.browser.product,walking:r.walking,cycles,errors:runs.reduce((n,r)=>n+r.errors.length,0),networkErrors,cleanup:runs.map(run=>({label:run.label,...run.cleanup})),unknowns:gaps}
writeFileSync(path.join(dir,'inspection/acceptance.json'),JSON.stringify(summary,null,2))
const commands=checks.commands.map(c=>c.command).join('\n')
const md=`# Level 11 逐部分观察与结构修正（版本 11）

[原图与实机对照](index.html) · [九张原图／26 个局部放大](inspection/index.html) · [完整运行记录](${label}/runtime.json)${supplement?` · [最终修正复核](${supplement}/runtime.json)`:''} · [本轮检查](inspection/checks.json) · [上一版](README-v10.md)

本轮按原图像素核对位置、朝向、形状和可辨认文字，重点修正 11iconic 的商铺与标牌，以及 11canal 的连廊和右岸入口。原图没有做 AI 增强，裁剪位置和倍率保存在 [notes.json](inspection/notes.json)。对照页支持原像素 100%–500% 缩放、原图切换和拖动查看。

## 本轮修改

- 商铺由一间连续的转角营业厅承接两侧玻璃与门头；增加真实临街入口，货架和收银台避开门口。朝向随建筑旋转，普通城市也使用同一规则。圆牌板面垂直于墙，两面字向一致，圆形碰撞不会产生方形空气墙；雨棚转角补全实体底板和两边檐口，深色涂装保持连续。
- PEGASUS 立牌仍直接贴墙，修正主字、小字及独立数字的阅读方向。Hope 改为信号杆上的蓝白路牌，牌面与灯杆不再互相穿插。原有其他悬挑立牌继续保留为随机装饰。
- 两栋滨水楼保留相向的蓝色侧面和真实楼间空隙，增加红色细横条、细窗框及连廊底面板缝和端部接合。右岸整排大柱廊移除，改为通向楼间入口的宽台阶；示例入口宽 30m、进深 6m、高 1.5m（估计值）。普通城区入口在地块内预留，不挤占公共道路。
- 石材窗台由粗凸台收浅；店铺沿用登记的 CC0 陶瓷地面，放弃原先未经照片支持的强黑白棋盘格。玻璃楼入口移除套用的通用大招牌和小雨棚。照片不能确定的完整室内结构仍标为推定。

四块完整标牌由内置 image_gen 生成，原始输出、提示词与可重跑的裁边／分档处理记录位于 [资产 manifest](../../assets/l11-reference-signs-v2/manifest.json)。没有新增噪点纹理，也没有把生成资产称作 CC0。许可与处理登记见 [L11-ASSET-SOURCES.md](../../public/textures/L11-ASSET-SOURCES.md)。

## 验证

固定 L11 种子 **20261014**（新游戏种子 **20259573**），1920×1080、DPR 1、真实光照与高画质。${views.length} 个实机视角、${ordinary.length} 个普通种子 42 视角。实际双向走过店铺独立入口、三栋建筑的入口与楼梯，并检查 ${rooms.length} 个房门通行样本、缓拱桥和水下桥墩。普通城区店铺入口和带连廊建筑的台阶也经过通行检查。运行错误 ${summary.errors}；网络记录 ${networkErrors.length} 条（本次均为 favicon.ico 404），原始状态保留在 JSON。

完整运行之后，针对雨棚拼接和玻璃楼门头的最后修正，另行运行 ${s?.views.length??0} 个视角与相关通行检查。页面逐视角标明记录来源；卸载重载与移动性能来自完整运行，不把不同轮次的数据拼成一次测试。

静态检查覆盖 ${architecture.buildings} 栋建筑、${Object.keys(architecture.recipes).length} 种参考配方；全部可在普通种子抽样中出现。室内采样 ${urban.buildings} 栋、${urban.rooms} 个房间，家具遗漏 ${urban.missingFurniture.length}，可达性失败 ${urban.failures.length}。模型库 ${mesh.buildings} 种建筑、${mesh.decor} 种装饰，材质／UV／资源释放检查通过。

实际浏览器 ${r.browser.product}；${r.hardware.renderer}。命令行验证 --headless=new，使用本次独立端口与配置目录；运行浏览器、服务器和临时 profile 已关闭／清理。移动采样帧时间中位数 ${n(r.walking.median)}ms、P95 ${n(r.walking.p95)}ms，最长 ${n(r.walking.max)}ms。三次重载几何计数为 ${cycles.map(c=>c.memory.geometries).join('/')}，非角色池纹理为 ${cycles.map(c=>c.nonPooledTextures).join('/')}；角色纹理池有界增长另列。完整性能见 [acceptance.json](inspection/acceptance.json)，资源计数不等于显存字节数，不能宣称全场景稳定 60 FPS。

## 仍需区分的事实与推定

${gaps.map(g=>'- '+g).join('\n')}

## 可复跑命令

工作目录 app：

\x60\x60\x60text
${commands}
node scripts/verify-l11-reference.mjs --label=${label} --case=01,03,14,15,16,22,23,29,30,31,32,33 --validate=west-piers,east-stone,quay-east-near --rooms --architecture --random-cases=retail,twins --lifecycle
${supplement?`node scripts/verify-l11-reference.mjs --label=${supplement} --case=01,14,15,22,23,30,33 --validate=west-piers,east-stone --rooms --architecture --random-cases=retail,twins\n`:''}node scripts/build-l11-inspection-report.mjs
node scripts/check-l11-inspection-report.mjs
node scripts/summarize-l11-inspection.mjs --runtime=${label}${supplement?' --supplement='+supplement:''}
\x60\x60\x60
`
writeFileSync(path.join(dir,'README.md'),md)
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const picture=(file,title)=>`<figure><a href="${file}" target="_blank"><img src="${file}" alt="${esc(title)}" loading="lazy"></a><figcaption>${esc(title)}</figcaption></figure>`
const cards=views.map(v=>`<article id="${esc(v.id)}"><h3>${esc(v.id)}</h3><p>${esc(descriptions[v.id]??'实机检查')}</p>${picture(`${v.report}/${v.id}.png`,descriptions[v.id]??v.id)}<p class="meta">位置 ${v.world.map(n).join(', ')} · 目标 ${v.target.map(n).join(', ')} · FOV ${v.fov}° · <a href="${v.report}/runtime.json">${v.report}</a></p></article>`).join('')
const source=(file,title)=>picture(`../../reference/L11/${file}`,title)
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L11 原图逐部分复核 · v11</title><style>body{margin:0;background:#111923;color:#e7edf1;font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto;padding:24px}a{color:#8fcfff}h1{margin-bottom:8px}nav{position:sticky;top:0;padding:12px;background:#111923f0;z-index:2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:20px}article,figure{margin:0}article{padding:16px;border:1px solid #34495d;border-radius:8px;background:#192532}img{display:block;width:100%;height:auto}figcaption,.meta{font-size:13px;color:#acbac7}h2{margin-top:36px}.notice{border-left:4px solid #d1a567;background:#30291f;padding:14px}li{margin-bottom:8px}</style><main><h1>Level 11 · 逐部分复核 v11</h1><p>位置、朝向、店铺平面、标牌文字与连廊结构。参考种子 20261014／新游戏种子 20259573。</p><nav><a href="inspection/index.html">原图局部放大与观察记录</a> · <a href="README.md">完整说明</a> · <a href="${label}/runtime.json">实际游戏记录</a> · <a href="inspection/checks.json">脚本检查</a> · <a href="index-v10.html">v10 历史</a></nav><p class="notice">本页是当前实现与原图的对照，不能等同于“全部细节已还原”。放大页逐项区分可观察事实与未知信息。实体门洞、台阶、侧面、连廊均使用共用生成数据；相机只用于检验。</p><h2>本轮原图</h2><div class="grid">${source('11iconic.jpg','11iconic 原图：店铺、立牌、路牌、大台阶与种植区')}${source('11canal.png','11canal 原图：双楼相向侧面、连廊底面、右岸台阶与桥')}</div><h2>实际游戏 · 多视角</h2><div class="grid">${cards}</div><h2>普通随机城市</h2><div class="grid">${ordinary.map(v=>`<article><h3>${esc(v.kind)} · 种子 ${v.seed}</h3>${picture(`${v.report}/random-${v.kind}.png`,`${v.architecture} · ${v.id}`)}<p>普通地块按相同建筑组件生成，不依赖参考种子的固定坐标。</p></article>`).join('')}</div><h2>验证与边界</h2><p>9 张原图／26 个局部；${views.length} 个实机视角；${architecture.buildings} 栋普通城市静态抽样，${Object.keys(architecture.recipes).length} 种参考配方均出现；${urban.rooms} 个房间可达性检查。运行错误 ${r.errors.length}。<a href="inspection/acceptance.json">详细数据、性能、硬件与清理记录</a></p><ul>${gaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul><p><a href="../../assets/l11-reference-signs-v2/manifest.json">生成标牌的源图、提示词、PBR 分档和来源记录</a> · <a href="inspection-ui/runtime.json">原像素缩放页的无头浏览器验证</a></p></main></html>`
writeFileSync(path.join(dir,'index.html'),html)
console.log(`Inspection report v11: ${views.length} views, ${ordinary.length} ordinary-city cases`)
