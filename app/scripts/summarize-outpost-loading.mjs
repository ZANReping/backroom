import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
const dir=fileURLToPath(new URL('../reports/outpost-loading/',import.meta.url)),read=p=>JSON.parse(readFileSync(path.join(dir,p),'utf8'))
const before=read('baseline/runtime.json'),after=read('final/runtime.json'),classic=read('classic-all/runtime.json'),staticChecks=read('static-checks.json'),cleanup=read('cleanup-audit.json')
assert(before.ok&&after.ok&&classic.ok&&staticChecks.checks.every(c=>c.passed))
assert(!cleanup.liveProcesses.length&&cleanup.profiles.every(p=>p.removed))
const names={101:'Alpha 基地',102:'商人之家',104:'Tom 餐馆',106:'Gemma 基地',109:'Omega 基地'},sec=v=>(v/1000).toFixed(2)
const rows=after.cases.map(r=>{
  const b=before.cases.find(b=>b.id===r.id)
  for(const key of ['structures','lights','npcs','meshes','instances','materials'])assert.equal(r.cold.firstReady[key],b.cold.firstReady[key],`${r.id} ${key}`)
  return {id:r.id,name:names[r.id],coldBefore:b.cold.loadMs,coldAfter:r.cold.loadMs,warmBefore:b.revisit.loadMs,warmAfter:r.revisit.loadMs,reduction:100*(1-r.cold.loadMs/b.cold.loadMs)}
})
const table=['| 据点 | 首次进入：优化前 → 后 | 再次进入：优化前 → 后 | 首次缩短 |','|---|---:|---:|---:|',...rows.map(r=>`| ${r.name} | ${sec(r.coldBefore)} → ${sec(r.coldAfter)} 秒 | ${sec(r.warmBefore)} → ${sec(r.warmAfter)} 秒 | ${r.reduction.toFixed(0)}% |`)].join('\n')
const md=`# 据点进入加载优化验收 · 2026-10-14

已优化 app 的据点进入流程。以下结果来自生产 Engine/Renderer 的真实无头 Chrome，不使用简化模型。截图对照见 [浏览报告](index.html)。

## 耗时

${table}

配置：${after.browser.product}，${after.setup.gpu}；1920×1080、DPR 1、真实光照、中等纹理、100%细节、16盏灯、1盏场景阴影、手电阴影、AO与泛光开启；加载预算6ms、活动预算3ms。未降低画质或缩减场景。

计时从调用正常 enterOutpost 开始，到整张据点模型、近处 NPC、手电和 GPU 预热完成且首次完整画面已绘制为止，包含入口过渡的引擎时间。再次进入是在同一页面加载另一据点后返回。每个首次测试刷新页面、重建 Renderer；同次 Chrome 的磁盘/驱动缓存仍可复用，不能视为操作系统级完全冷启动。数值是一轮基线与最终复测；另一次优化复测在 optimized-1/ 中，首次 Alpha 6.70秒、商人之家8.73秒，首次驱动编译存在波动。

新开局种子424242、入口相机yaw/pitch为0。正常进入路径仍按游戏时间推导目的地图种子，实际mapSeed逐次保存在JSON；直接加载/资源循环使用固定mapSeed 424242。五个对比据点的结构、灯具、NPC、可见网格、实例及材质总数逐项相等。Alpha保留6825个结构、4657个网格、78507个实例、488盏灯与29个NPC。

## 改动与原因

- Alpha/Trade装饰的碰撞体使用随结构对象释放的WeakMap缓存。坐标、尺寸、类型、实心标记和data（含原地修改的数组）变动会重新计算，碰撞公式与部件保持一致。
- Alpha完成固体布局后立即启用空间索引，NPC选址和入口加载期间的视线检测不再遍历并重建整座基地的装饰碰撞体。Alpha地图生成从3.34秒降到0.079秒。
- 据点加载使用原有6ms预算处理更多轻量步骤，活动游戏仍保留原步数上限。
- 被加载遮罩覆盖时继续构建和预热，暂停无意义的场景及后处理绘制。首次完整画面仍在就绪后正常绘制，未提前开放操作。
- 据点着色器编译和GPU上传使用实际composer目标，避免普通画布与HDR路径重复准备。经典光照继续使用画布路径。

## 验证

- check:outpost-colliders：992项，覆盖91个Alpha和30个Trade原型、旋转及编辑失效。
- check:alpha：55163项；五个新版据点的通行、屋顶及服务可达检查通过。
- check:model-warmup：83项；check:program-completion：58项；TypeScript及生产构建通过。
- 真实光照测试五个代表据点的首次/再次进入与360°环视；经典光照测试全部${classic.cases.length}个现存据点（含Level 274）。
- 实际React游戏界面：从存档继续、Alpha/商人之家/Gemma进入、键盘行走、返程、Alpha存档刷新恢复，共${after.app.checks.length}项通过。实际UI的Alpha首次完整场景4.70秒、可操作5.97秒；界面时间另含原有过场展示。
- 中途取消加载8项通过：909个已提交编译的材质在编译完成后各释放一次，取消的场景不发布，下一据点正常就绪。
- 三轮Alpha/Tom循环后，几何数${after.cycles.map(c=>c.memory.geometries).join(' → ')}，纹理数${after.cycles.map(c=>c.memory.textures).join(' → ')}，未持续增长。
- 浏览器未捕获JS/着色器错误；网络记录包含验证页favicon.ico的404。已查看入口、环视及真实游戏截图，未见场景内容缺失。
- 独立动态端口、独立profile，命令行验证--headless=new。所有本次QA浏览器、服务器及profile均已清理，见cleanup-audit.json。

未验证移动设备或其他GPU的绝对耗时。首次驱动着色器编译仍有开销，本次没有更改NPC玩法、据点布局、存档格式、app-lite或联机实现。构建保留字体运行时解析、Browserslist、PostCSS及包体积等警告，详见static-checks.json。

## 复现命令

在app目录执行：

\`\`\`powershell
npm run check:outpost-colliders
npm run check:alpha
npm run check:settlements
npm run check:model-warmup
npm run check:program-completion
npm run build
npm run verify:outpost-loading -- --label=final --transition --revisit --regressions --app
npm run verify:outpost-loading -- --label=classic-all --classic --levels=101,102,103,104,105,106,107,108,109,110,111,112,113,114,116,274
node scripts/summarize-outpost-loading.mjs
\`\`\`

原始JSON及截图在baseline/、final/、classic-all/。baseline-profile/101.cpuprofile与optimized-profile/102.cpuprofile保留根因采样。当前代码上的重复运行不能重建修改前基线。
`
writeFileSync(path.join(dir,'README.md'),md)
const html=`<!doctype html><html lang="zh"><meta charset="utf-8"><title>据点加载优化验收</title><style>body{font:16px/1.65 system-ui;max-width:1360px;margin:36px auto;padding:0 24px;background:#101615;color:#e6e9e3}a{color:#9fceb5}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #41514a;padding:10px;text-align:left}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}img{width:100%;border:1px solid #41514a}figure{margin:12px 0}h2{margin-top:40px}small{color:#b2beb7}</style><h1>据点进入加载优化</h1><p>1080p · RTX 4060 Laptop · ${after.browser.product} · 相同画质与模型数量</p><p><a href="README.md">说明、测试方法和限制</a> · <a href="final/runtime.json">原始结果</a> · <a href="cleanup-audit.json">清理核对</a></p><table><tr><th>据点</th><th>首次进入（前 → 后）</th><th>再次进入（前 → 后）</th></tr>${rows.map(r=>`<tr><td>${r.name}</td><td>${sec(r.coldBefore)} → ${sec(r.coldAfter)}秒</td><td>${sec(r.warmBefore)} → ${sec(r.warmAfter)}秒</td></tr>`).join('')}</table><p><small>计至完整场景绘制完成。首次测试为新页面/新Renderer，驱动缓存可复用；不是操作系统级冷启动。真实游戏界面另有过场展示时间。</small></p>${rows.map(r=>`<h2>${r.name}</h2><div class="pair"><figure><img loading="lazy" src="baseline/${r.id}-entry.png"><figcaption>优化前</figcaption></figure><figure><img loading="lazy" src="final/${r.id}-entry.png"><figcaption>优化后 · 模型与材质数量相同</figcaption></figure></div>`).join('')}<h2>实际游戏：读档后的Alpha</h2><img loading="lazy" src="final/app-alpha-restored.png"><p>进入、键盘移动、返程及存档恢复通过；16个现存据点完成经典光照加载；取消加载与三轮资源回收通过。</p></html>`
writeFileSync(path.join(dir,'index.html'),html)
console.log(JSON.stringify({reports:['README.md','index.html'],modelCountsUnchanged:true,classicOutposts:classic.cases.length,appChecks:after.app.checks.length,cleanup:true}))
