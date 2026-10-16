import {readFileSync,writeFileSync,copyFileSync,existsSync,statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const app=fileURLToPath(new URL('../',import.meta.url)),root=path.join(app,'reports/l11-reference')
const label=process.argv.find(a=>a.startsWith('--runtime='))?.slice(10)??'canal-v12-final'
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid runtime label')
const dir=path.join(root,label),read=p=>JSON.parse(readFileSync(path.join(app,p),'utf8').replace(/^\uFEFF/,''))
const r=read(`reports/l11-reference/${label}/runtime.json`),audit=read('reports/l11-reference/inspection/notes.json'),ui=read('reports/l11-reference/inspection-ui/runtime.json')
const architecture=read('reports/l11-reference/architecture/static.json'),urban=read('reports/l11-urban/layout-check.json'),mesh=read('reports/l11-remake/mesh-check.json'),clearance=read('reports/l11-reference/interior-clearance.json')
if(!r.ok||r.setup.version!==12||r.errors.length||!r.command.includes('--headless=new')||!r.cleanup.profileRemoved||!ui.ok||!architecture.ok||urban.failures.length||clearance.failures.length)throw Error('Canal report requires successful v12 runtime and static checks')
if(r.civil.externalStairs.length!==6||r.civil.promenades.length!==4||r.cycles.length!==3||!r.map.legend.includes('步行岸道'))throw Error('Missing canal traversal / lifecycle / map evidence')
for(const [source,target]of [['README.md','README-v11.md'],['index.html','index-v11.html']])if(!existsSync(path.join(root,target)))copyFileSync(path.join(root,source),path.join(root,target))
for(const [source,target]of [['reports/l11-reference/architecture/static.json','architecture.json'],['reports/l11-urban/layout-check.json','urban.json'],['reports/l11-remake/mesh-check.json','meshes.json'],['reports/l11-reference/interior-clearance.json','interior-clearance.json'],['reports/l11-reference/inspection/notes.json','reference-observations.json'],['reports/l11-reference/inspection-ui/runtime.json','inspection-ui.json']])copyFileSync(path.join(app,source),path.join(dir,target))
const checkSpecs=[['build','build','✓ built in'],['check:l11','generation','L11 missions OK'],['check:l11-reference','reference','"approaches": 1592'],['check:l11-architecture','architecture','"recipes": {'],['check:l11-meshes','meshes','"uniqueTextures"'],['check:l11-collision','collision','L11 collision checks passed'],['check:l11-urban','urban','"failures": 0'],['check:l11-map','map','L11 map checks passed']]
const checks=checkSpecs.map(([command,name,marker])=>{
  const file=path.join(root,`v12-${name}.log`),text=readFileSync(file,'utf8')
  if(!text.includes(marker))throw Error(`Missing successful log: ${command}`)
  copyFileSync(file,path.join(dir,`${name}.log`))
  return {command:`npm run ${command}`,status:'passed',log:`${name}.log`,completed:statSync(file).mtime.toISOString()}
})
const runtimeCommand=`node scripts/verify-l11-reference.mjs --label=${label} --case=03,31,34,35,36,37,38 --validate=quay-west-near,quay-west-annex,quay-east-near --rooms --architecture --random-cases=quay-service-wing,green-curtain --map --lifecycle`
const rooms=r.roomWalks.reduce((n,v)=>n+v.checks.length,0),crops=audit.sources.reduce((n,s)=>n+s.regions.length,0),n=v=>Number(v).toFixed(1)
const changes=[
  '左岸小楼改为真实 L 形占地：少窗长墙沿岸延伸，玻璃翼楼向岸边凸出，折返外梯位于两体量之间。外梯的踏步、平台、斜向扶手和碰撞使用同一几何描述，平台接到墙面。',
  '近处高楼改为更密的浅绿灰幕墙竖框；小楼长墙区分窄竖窗和短横窗，玻璃翼楼单独使用幕墙。移除这两类楼入口处未经照片支持的通用大招牌。',
  '参考区两岸改为连续步行铺装；普通城市也会确定性生成步行岸道。机动车道交叉口保持连续，步道不生成车辆、停车标线或公交设施。外梯范围不再投放街道杂物。',
  '可进入楼层、房间、门窗、内部楼梯和地图随实际 L 形占地生成，四种朝向共用同一规则。地图新增步行岸道颜色与图例。',
  '保留上一轮店铺与屋顶连廊的结构修正，并复核连廊反向仰视。本轮没有重新生成标牌或添加噪点纹理。',
]
const gaps=[
  '原图中可观察的是长墙、凸出玻璃翼楼与暗槽楼梯的位置关系。当前 11 层、52×38m 占地、5m 凸出和外梯净宽是推定参数；背立面、室内房间、封闭服务门的位置也不是照片实测结果。',
  '楼梯和立面结构已更正，但原图的细框比例、外梯实体侧板、窗帘与玻璃反光仍有差异。当前玻璃翼楼没有达到逐像素相同。',
  '原图桥梁的绿色梁、岸边石柱分段栏杆、成片绿化与树冠形态仍需继续细化；当前运河总览的远景密度、岸线尺度及光照也与原图不同。',
  '其余七张参考图已有原像素观察记录，尚未逐项完成新的模型还原。店铺和连廊的历史修正、文字可辨识边界见 v11 报告；本轮不能代表这些部分全部验收完成。',
  '运行使用高画质与真实光照。移动长帧仍存在，不能宣称全场景稳定 60 FPS；本轮没有重新做低画质、经典光照和完整存档迁移的实机验收。',
]
const network=r.networkErrors.map(e=>e.response?{url:e.response.url,status:e.response.status}:{url:e.url,error:e.errorText})
const summary={version:12,runtime:label,referenceSeed:r.seed,setup:r.setup,originals:audit.sources.length,crops,checks,runtimeCommand,views:r.views.map(v=>({id:v.id,world:v.world,target:v.target,fov:v.fov,lighting:v.lighting,performance:v.performance})),ordinary:r.random,entrances:r.validation,roomWalks:rooms,civil:{...r.civil,walks:r.civil.walks.map(w=>({start:w.start,end:w.end,error:w.error}))},map:r.map,walking:r.walking,cycles:r.cycles.map(c=>({memory:c.memory,nonPooledTextures:c.nonPooledTextures,cachedAvatarTextures:c.cachedAvatarTextures,pending:c.pending,geometryAudit:c.geometryAudit})),browser:r.browser.product,hardware:r.hardware,errors:r.errors,networkErrors:network,cleanup:r.cleanup,changes,remaining:gaps}
writeFileSync(path.join(dir,'acceptance.json'),JSON.stringify(summary,null,2)+'\n')
writeFileSync(path.join(dir,'checks.json'),JSON.stringify({commands:checks},null,2)+'\n')
const description={
  '03-canal':'运河总览：保持原检验相机，检查两岸体量和步行铺装。',
  '31-roof-link-oblique':'连廊反向仰视：两楼相向侧面、连廊底板与端部接合。树冠遮挡仍可见。',
  '34-quay-service-side':'沿岸正向：少窗长墙、凸出的玻璃翼楼、外梯和门口的相对位置。',
  '35-quay-balcony-front':'从相反方向检查玻璃翼楼、折返外梯、平台接墙及两侧立面。文件名保留旧编号，当前已不是阳台方案。',
  '36-green-mullions':'近处高楼转角：密竖框、玻璃层间带和底部柱廊。',
  '37-quay-annex-interior':'小楼可进入办公室：墙窗与家具朝向，内部布局是推定。',
  '38-quay-annex-rear':'背面：实体窗洞与竖、横窗区分；原图未展示此面，属于结构补全。',
}
const cmd=[...checks.map(c=>c.command),runtimeCommand,'node scripts/inspect-l11-references.mjs','node scripts/build-l11-inspection-report.mjs','node scripts/check-l11-inspection-report.mjs',`node scripts/summarize-l11-canal.mjs --runtime=${label}`].join('\n')
const md=`# Level 11 位置、朝向与沿岸建筑复核（版本 12）

[当前原图／实机对照](index.html) · [${audit.sources.length} 张原图／${crops} 个局部放大](inspection/index.html) · [本轮实机记录](${label}/runtime.json) · [检查和性能](${label}/acceptance.json) · [v11 店铺与连廊记录](README-v11.md)

本轮继续按原图像素核对，重点纠正 11canal 左岸小楼的体量与方向。此前“整面玻璃与阳台叠层”的判断已撤回：少窗长墙沿岸，玻璃体量向河岸凸出，楼梯位于交接的暗槽中。新增 [小楼局部](inspection/canal-annex.png)，观察与未知项保存在 [原图记录](inspection/notes.json)，不使用 AI 放大补细节。

## 本轮修改

${changes.map(v=>'- '+v).join('\n')}

## 验证

固定 L11 种子 **${r.seed}**（新游戏种子 **${r.setup.newGameSeed}**），1920×1080、DPR 1、高画质、真实光照。${r.views.length} 个建筑视角、2 个普通种子 42 视角、1 张生产地图界面截图已逐张查看。

实际双向走过两岸步道（4 段）、小楼外梯首层折返（上下共 6 段）、三栋建筑入口与内部楼梯，并检查 ${rooms} 个房门样本、店铺独立入口、缓拱桥与 2 座水下桥墩。普通种子的两种建筑也实际进入并检查；参考相机只用于观察，建筑结构来自共享数据。

静态检查覆盖 ${architecture.buildings} 栋普通城市建筑，${Object.keys(architecture.recipes).length} 种参考配方均出现；参考区 ${clearance.doors} 个门、${clearance.approaches} 次接近检查通过。城市室内采样 ${urban.buildings} 栋、${urban.rooms} 个房间，可达性失败 ${urban.failures.length}、家具遗漏 ${urban.missingFurniture.length}。模型库 ${mesh.buildings} 种建筑、${mesh.decor} 种装饰，碰撞、材质、UV 和资源释放检查通过。构建通过，仍有既有的大包／混用静态动态导入提示。

实际浏览器 ${r.browser.product}，${r.hardware.renderer}；启动参数含 --headless=new，端口 ${r.port}/${r.cdp} 使用独立 profile。运行错误 ${r.errors.length}，网络记录 ${network.length} 条（均为 favicon.ico 404）。浏览器、服务器与临时 profile 已清理。原像素观察页另经无头浏览器检验，${ui.images.complete}/${ui.images.total} 张图完整加载，100%／200% 缩放、原图切换与关闭均通过。

移动帧时间中位数 ${n(r.walking.median)}ms、P95 ${n(r.walking.p95)}ms、最长 ${n(r.walking.max)}ms。三次卸载重载后的几何计数 ${r.cycles.map(c=>c.memory.geometries).join('/')}，非角色池纹理 ${r.cycles.map(c=>c.nonPooledTextures).join('/')}；角色池纹理另列为 ${r.cycles.map(c=>c.cachedAvatarTextures).join('/')}。资源计数不等于显存字节数。静止视角、CPU/GPU 采样和具体绘制调用见 [acceptance.json](${label}/acceptance.json)。

## 尚未还原与推定内容

${gaps.map(v=>'- '+v).join('\n')}

## 可复跑命令

工作目录 app：

\x60\x60\x60text
${cmd}
\x60\x60\x60
`
writeFileSync(path.join(root,'README.md'),md)
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const picture=(file,title)=>`<figure><a href="${file}" target="_blank"><img src="${file}" alt="${esc(title)}" loading="lazy"></a><figcaption>${esc(title)}</figcaption></figure>`
const cards=r.views.map(v=>`<article><h3>${esc(v.id)}</h3><p>${esc(description[v.id])}</p>${picture(`${label}/${v.id}.png`,description[v.id])}<p class="meta">位置 ${v.world.map(n).join(', ')} · 目标 ${v.target.map(n).join(', ')} · FOV ${v.fov}°</p></article>`).join('')
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L11 位置与朝向复核 · v12</title><style>body{margin:0;background:#111923;color:#e7edf1;font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto;padding:24px}a{color:#8fcfff}nav{position:sticky;top:0;padding:12px;background:#111923f0;z-index:2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:20px}article,figure{margin:0}article{padding:16px;border:1px solid #34495d;border-radius:8px;background:#192532}img{display:block;width:100%;height:auto}figcaption,.meta{font-size:13px;color:#acbac7}h2{margin-top:36px}.notice{border-left:4px solid #d1a567;background:#30291f;padding:14px}li{margin-bottom:8px}.crop img{max-height:640px;object-fit:contain;image-rendering:pixelated}</style><main><h1>Level 11 · 位置与朝向复核 v12</h1><p>左岸长墙、玻璃翼楼、外梯、步行岸道，以及相反方向的连廊检查。L11 种子 ${r.seed}／新游戏种子 ${r.setup.newGameSeed}。</p><nav><a href="inspection/index.html">原图 100%–500% 放大</a> · <a href="README.md">说明与复跑命令</a> · <a href="${label}/acceptance.json">通行、性能与清理记录</a> · <a href="index-v11.html">v11 店铺与连廊</a></nav><p class="notice">当前是逐部分修正记录，全部细节还原尚未完成。原图能观察到的位置关系与推定尺寸分别登记，不能用取景相似代替结构验收。</p><h2>原图与局部证据</h2><div class="grid">${picture('../../reference/L11/11canal.png','11canal 原图')}<div class="crop">${picture('inspection/canal-annex.png','原像素局部：长墙沿岸，玻璃翼楼凸出，交接处可见楼梯和平台')}</div></div><h2>本轮修正</h2><ul>${changes.map(v=>`<li>${esc(v)}</li>`).join('')}</ul><h2>实际游戏 · 正面、反面与室内</h2><div class="grid">${cards}</div><h2>普通种子与生产地图</h2><div class="grid">${r.random.map(v=>`<article><h3>普通种子 ${v.seed} · ${esc(v.kind)}</h3>${picture(`${label}/random-${v.kind}.png`,v.id)}<p>按普通地块和朝向生成；入口通行已实测。</p></article>`).join('')}<article><h3>步行岸道与机动车交叉口</h3>${picture(`${label}/39-canal-map.png`,'生产大地图与图例，显示已探索区域')}<p>浅米色为步行岸道，白色为车行道路。L 形占地与场景共用规划数据。</p></article></div><h2>验证</h2><p>7 个建筑视角、2 个普通种子视角、1 张地图；${rooms} 个房门样本；4 段步道与 6 段外梯通行。移动 P95 ${n(r.walking.p95)}ms，最长 ${n(r.walking.max)}ms，尚未稳定 60 FPS。<a href="${label}/runtime.json">完整原始记录</a></p><h2>尚未完成与推定内容</h2><ul>${gaps.map(v=>`<li>${esc(v)}</li>`).join('')}</ul><p><a href="inspection/index.html">全部 ${audit.sources.length} 张原图／${crops} 个局部观察</a> · <a href="${label}/checks.json">静态检查记录</a> · <a href="${label}/inspection-ui.json">放大观察页浏览器检查</a></p></main></html>`
writeFileSync(path.join(root,'index.html'),html)
console.log(`Canal v12 report: ${r.views.length} views, ${r.random.length} ordinary cases, ${crops} original-pixel crops`)
