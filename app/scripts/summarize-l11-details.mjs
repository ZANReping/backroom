import {readFileSync,writeFileSync,copyFileSync,existsSync,statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const app=fileURLToPath(new URL('../',import.meta.url)),root=path.join(app,'reports/l11-reference')
const read=(file)=>JSON.parse(readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''))
const write=(file,data)=>writeFileSync(path.join(root,file),JSON.stringify(data,null,2)+'\n')
const labels=['canal-v13','storefront-v14','storefront-v14-final'],runs=labels.map(label=>({label,...read(`${label}/runtime.json`)}))
const [canal,full,final]=runs,n=v=>Number(v).toFixed(1)
for(const r of runs){
  if(!r.ok||r.errors.length||!r.command.includes('--headless=new')||!r.cleanup.profileRemoved||!read(`${r.label}/process-cleanup.json`).cleanupConfirmed)throw Error(`Incomplete runtime/cleanup: ${r.label}`)
}
if(canal.setup.version!==13||full.setup.version!==14||final.setup.version!==14||full.cycles.length!==3||!final.inspected.pier.outerFaceBlocked||!final.random.find(r=>r.kind==='retail')?.validation.pier.pavementClear)throw Error('Missing version / storefront physics evidence')
const water=read('canal-v13/waterways.json'),audit=read('inspection/notes.json')
if(!water.ok||water.ordinaryStone<1||water.quayChunkSamples<1)throw Error('Missing ordinary quay / seam coverage')
const snapshots=[['../l11-remake/mesh-check.json','meshes.json'],['architecture/static.json','architecture.json'],['../l11-water-collision/static-collision.json','collision.json'],['interior-clearance.json','interior-clearance.json']]
for(const [source,target]of snapshots)copyFileSync(path.join(root,source),path.join(root,final.label,target))
const mesh=read(`${final.label}/meshes.json`),architecture=read(`${final.label}/architecture.json`),clearance=read(`${final.label}/interior-clearance.json`)
if(mesh.decor!==103||mesh.buildings!==30||!architecture.ok||clearance.failures.length)throw Error('Incomplete static results')
const specs=[['build','build','✓ built in'],['check:l11-reference','reference','"approaches": 1592'],['check:l11-architecture','architecture','"recipes": {'],['check:l11-meshes','meshes','"uniqueTextures"'],['check:l11-collision','collision','L11 collision checks passed']]
const checks=specs.map(([command,key,marker])=>{
  const source=path.join(root,`v14-${key}.log`)
  if(!readFileSync(source,'utf8').includes(marker))throw Error(`Missing success marker: ${source}`)
  copyFileSync(source,path.join(root,final.label,`${key}.log`))
  return {command:`npm run ${command}`,status:'passed',log:`${key}.log`,completed:statSync(source).mtime.toISOString()}
})
write(`${final.label}/checks.json`,{version:14,checks})
const commands=[
  'node scripts/verify-l11-reference.mjs --label=canal-v13 --case=03,17,40,41,42 --validate=quay-west-annex --architecture --random-cases=stone-quay --lifecycle',
  'node scripts/verify-l11-reference.mjs --label=storefront-v14 --case=01,14,15,30,31,33 --validate=west-piers,quay-east-near --rooms --architecture --random-cases=retail,twins --lifecycle',
  'node scripts/verify-l11-reference.mjs --label=storefront-v14-final --case=01,14,15,30,33 --validate=west-piers --rooms --architecture --random-cases=retail',
]
const compact=r=>({label:r.label,version:r.setup.version,setup:r.setup,command:commands[labels.indexOf(r.label)],views:r.views.map(v=>({id:v.id,world:v.world,target:v.target,fov:v.fov,lighting:v.lighting,performance:v.performance})),ordinary:r.random,entrances:r.validation,roomDoorSamples:r.roomWalks?.reduce((n,v)=>n+v.checks.length,0)??0,shop:r.inspected,civil:r.civil,walking:r.walking,cycles:r.cycles?.map(c=>({memory:c.memory,nonPooledTextures:c.nonPooledTextures,cachedAvatarTextures:c.cachedAvatarTextures,geometryAudit:c.geometryAudit})),browser:r.browser.product,hardware:r.hardware,errors:r.errors,networkErrors:r.networkErrors.map(e=>e.response?{url:e.response.url,status:e.response.status}:{url:e.url,error:e.errorText}),cleanup:r.cleanup})
const changes=[
  '店铺补齐深色落地柱，柱网贯穿首层、上层和两侧转角；入口切开立面后，窗格不再重新起算。模型、旋转碰撞和普通城市使用同一组实体柱。',
  '完整 Famima!! 横招落在实际柱间，圆形挑牌的支架固定在柱子上并留出板面距离。保留既有文字与图案，没有重画或补写原图中看不清的海报小字。',
  '沿岸新增登记的石柱金属栏杆，包含柱脚、柱身、压顶、横杆和细竖杆；近景、远景和区块加载共用放置规则，普通步行岸道也能生成。',
  '拱桥侧面改为绿色中带与上下边带，保留真实桥板厚度、弧度和桥墩；远景补齐朝下的桥底面。',
  '保留并复核两栋楼的相向蓝色侧面、真实楼间空隙和楼顶连廊；反向仰视与普通种子双塔均检查，未通过移动相机掩盖结构问题。',
]
const gaps=[
  '照片没有米制尺寸、完整室内平面和连廊内部。当前柱宽、4m 栏杆模块、楼高、店内货架与后部房间为推定，不能视为实测还原。',
  '店铺海报、商品包装、室内照明密度、字体字重与照片仍有差异；横招文字已不被实体柱截断，特定观察角度仍可能被前景树干遮住。',
  '运河桥梁目前完成绿色梁侧分带，尚未逐项复刻所有连接件；石柱颜色、栏杆细部、树冠形态、成片绿化、岸线尺度和远处城市密度仍需继续对照。',
  '玻璃、铺装、天空与光照尚未达到照片观感。其余七张参考图保留原像素观察记录，不能据这轮两个场景的检查宣称全部还原。',
  '本轮实机使用高画质、真实光照；没有重跑低画质和经典光照全套验收。移动仍有长帧，尚未实现全场景稳定 60 FPS。',
]
const summary={version:14,changes,remaining:gaps,checks,canalChecks:read('canal-v13/checks.json'),runs:runs.map(compact),comparison:'Runs have different view/asset residency; frame times are not a controlled before/after performance comparison.'}
write(`${canal.label}/acceptance.json`,compact(canal));write(`${final.label}/acceptance.json`,summary)
const md=`# Level 11 店铺、连廊与滨水细节复核（版本 14）

[原图与实机对照](index.html) · [原像素放大观察](inspection/index.html) · [本轮数据](${final.label}/acceptance.json) · [v12 沿岸体量与步道](README-v12.md) · [v11 文字与方向](README-v11.md)

${changes.map(v=>'- '+v).join('\n')}

## 实际游戏验证

L11 种子 **${final.seed}**，新游戏种子 **${final.setup.newGameSeed}**，1920×1080、DPR 1、高画质、真实光照。原相机保持不变，另从店内、反向街角、桥下和普通城市检查结构。${audit.sources.length} 张原图和 ${audit.sources.reduce((n,s)=>n+s.regions.length,0)} 个局部放大保留原像素。

| 运行 | 范围 | 结果 |
|---|---|---|
| [canal-v13](${canal.label}/runtime.json) | 5 个视角、普通种子石柱栏杆、桥梁、外梯、步道与三次重载 | 通过 |
| [storefront-v14](${full.label}/runtime.json) | 6 个视角、普通店铺及双塔、38 个房门样本、店门和柱体碰撞、移动与三次重载 | 通过；该轮截图发现文字被柱遮挡，已进一步调整 |
| [storefront-v14-final](${final.label}/runtime.json) | 门头位置修正后的 5 个视角、普通店铺、入口/房门/柱体以及土木通行回归 | 通过 |

普通世界建筑检查采样 ${architecture.buildings} 栋，${Object.keys(architecture.recipes).length} 种参考配方全部出现。水岸检查覆盖 ${water.quayModules} 个栏杆模块和 ${water.quayChunkSamples} 个区块样本，非参考种子包含 ${water.ordinaryStone} 个石柱模块。模型库 ${mesh.buildings} 种建筑、${mesh.decor} 种装饰，碰撞与构建通过。最终店铺运行检查 ${final.roomWalks.reduce((n,v)=>n+v.checks.length,0)} 个房门样本，实际双向进出街门，突出玻璃面的柱体有碰撞，柱外人行空间可通行。

浏览器 **${full.browser.product}**；硬件 **${full.hardware.renderer}**。每轮均验证 --headless=new，使用独立端口与 profile，运行错误均为 0；网络记录均为本站 favicon.ico 404。三个运行的浏览器、服务器、profile 已清理，各目录的 process-cleanup.json 保存独立进程及端口复查。

移动与重载数据来自门头位置最后微调前的完整 storefront-v14 运行：帧时间中位数 ${n(full.walking.median)}ms、P95 ${n(full.walking.p95)}ms、最长 ${n(full.walking.max)}ms；采样末绘制调用 ${full.walking.draws}、三角形 ${full.walking.triangles}。三次重载几何计数 ${full.cycles.map(c=>c.memory.geometries).join('/')}，非角色池纹理 ${full.cycles.map(c=>c.nonPooledTextures).join('/')}，角色池纹理 ${full.cycles.map(c=>c.cachedAvatarTextures).join('/')}。这些是资源计数，不是显存字节数；不同运行的驻留场景不同，不据此声称性能提升。

## 仍待还原

${gaps.map(v=>'- '+v).join('\n')}

## 可复跑命令

工作目录 app：

\x60\x60\x60text
npm run build
npm run check:l11
npm run check:l11-waterways
npm run check:l11-reference
npm run check:l11-architecture
npm run check:l11-meshes
npm run check:l11-collision
${commands.join('\n')}
node scripts/summarize-l11-details.mjs
\x60\x60\x60

v13 的规划、迁移及任务检查来自 [该轮静态记录](canal-v13/checks.json)；v14 的最终检查见 [checks.json](${final.label}/checks.json)。构建初次在沙箱启动 esbuild 时遇到 EPERM，随后获准运行同一构建命令并成功；保留 v14-build-sandbox.log。构建仍有既有的大包、字体路径与静态/动态导入提示。
`
writeFileSync(path.join(root,'README.md'),md)
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const pic=(file,title)=>{if(!existsSync(path.join(root,file)))throw Error(`Missing image ${file}`);return `<figure><a href="${file}" target="_blank"><img src="${file}" alt="${esc(title)}" loading="lazy"></a><figcaption>${esc(title)}</figcaption></figure>`}
const card=(label,id,title,note)=>`<article><h3>${esc(title)}</h3>${pic(`${label}/${id}.png`,title)}<p>${esc(note)}</p><small>记录：${label}</small></article>`
const shopCards=[['14-storefront-corner','街角两侧店面','深色柱落地，横招位于柱间；圆形挑牌从柱上伸出。'],['33-shop-blade-reverse','反向检查完整店名','完整字样、圆牌反面及其与立柱的连接。'],['15-storefront-interior','店内看向街门','门外有连续人行道，室内货架和收银台仍属推定布局。'],['30-shop-looking-out','店内检查玻璃转角','同一营业厅的两面玻璃，柱体和窗框在室内也保持一致。']].map(([id,title,note])=>card(final.label,id,title,note)).join('')
const canalCards=[['03-canal','运河总览','同一固定相机；新增石柱分段栏杆与绿色桥缘。'],['40-stone-quay-rail','近看石柱和金属栏片','压顶可从上方落脚，竖杆之间保留实际空隙。'],['41-green-bridge','拱桥侧面','上下绿色边带沿真实弧线连续，桥墩与桥板保持实体。'],['42-bridge-under','水位附近仰视桥底','近景和远景均有朝下的桥底，桥板仍有厚度。']].map(([id,title,note])=>card(canal.label,id,title,note)).join('')
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L11 店铺与水岸逐项复核 · v14</title><style>body{margin:0;background:#111923;color:#e7edf1;font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto;padding:24px}a{color:#8fcfff}nav{position:sticky;top:0;padding:12px;background:#111923ed;z-index:2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr));gap:20px}article,figure{margin:0}article{padding:16px;border:1px solid #34495d;border-radius:8px;background:#192532}img{display:block;width:100%;height:auto}figcaption,small{font-size:13px;color:#acbac7}h2{margin-top:36px}.notice{border-left:4px solid #d1a567;background:#30291f;padding:14px}li{margin-bottom:8px}.crop img{max-height:600px;object-fit:contain;image-rendering:pixelated}</style><main><h1>Level 11 · 店铺、连廊与水岸 v14</h1><p>按原像素核对朝向、位置、结构和可辨认文字。L11 种子 ${final.seed}／新游戏种子 ${final.setup.newGameSeed}。</p><nav><a href="inspection/index.html">原图 100%–500% 放大</a> · <a href="README.md">说明与复跑命令</a> · <a href="${final.label}/acceptance.json">本轮数据</a> · <a href="index-v12.html">v12 沿岸建筑</a> · <a href="index-v11.html">v11 文字与入口</a></nav><p class="notice">当前仍在逐项还原。照片未展示的室内、米制尺寸和背立面明确记为推定；通过通行与碰撞检查不代表已经与照片完全相同。</p><h2>原图证据</h2><div class="grid">${pic('../../reference/L11/11iconic.jpg','11iconic 原图')}${pic('../../reference/L11/11canal.png','11canal 原图')}<div class="crop">${pic('inspection/left-shop.png','原像素局部：深色落地柱、玻璃、横招和圆形挑牌')}</div><div class="crop">${pic('inspection/canal-roof-link.png','原像素局部：相向蓝色侧面、连廊底板与窗格')}</div></div><h2>本轮修改</h2><ul>${changes.map(v=>`<li>${esc(v)}</li>`).join('')}</ul><h2>店铺 · 最终修正后</h2><div class="grid">${shopCards}</div><h2>水岸与桥梁</h2><div class="grid">${canalCards}</div><h2>连廊与普通世界</h2><div class="grid">${card(full.label,'31-roof-link-oblique','连廊反向仰视','底板分缝连接两侧楼体，蓝色是楼体的内侧立面。')}${card(full.label,'random-twins','普通种子 42 · 双塔','可以直接看见楼间空隙和顶部连接，结构也来自正常生成。')}${card(final.label,'random-retail','普通种子 42 · 店铺','同样的柱网、柱间门头、转角挑牌与真实街门。')}${card(canal.label,'random-stone-quay','普通种子 42 · 石柱岸栏','共享水岸规则生成，区块接缝与顶部碰撞通过检查。')}</div><h2>检查与尚未完成的部分</h2><p>构建、建筑、参考区、模型和碰撞检查通过。完整移动采样 P95 ${n(full.walking.p95)}ms，最长 ${n(full.walking.max)}ms；仍有长帧。不同轮次记录分别保存，<a href="README.md">范围、浏览器、硬件及清理结果</a>可查。</p><ul>${gaps.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></main></html>`
writeFileSync(path.join(root,'index.html'),html)
console.log('L11 v14 detail report written; separate v13, v14 and final-check records retained.')
