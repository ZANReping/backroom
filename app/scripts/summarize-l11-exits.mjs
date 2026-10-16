import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/l11-exits')
const read=p=>JSON.parse(readFileSync(path.join(out,p),'utf8'))
const run=read('runtime-final/runtime.json'),materials=read('materials-final/runtime.json'),brick=read('brick-final/runtime.json'),generation=read('generation.json')
if(!run.ok||!materials.ok||!brick.ok)throw Error('Final QA did not pass')
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const modes=[['完整功能','runtime-final',run],['最终混凝土 UV 与井坑','materials-final',materials],['最终砖墙 UV','brick-final',brick]]
const gpu=run.scenes.l11unfinisheddoor.stats.gpu
const doors=generation.cases.filter(c=>c.seed===run.seed).flatMap(c=>c.exits),seen=new Set(),locations=doors.filter(d=>!seen.has(d.kind)&&seen.add(d.kind))
const names={l11unfinisheddoor:'混凝土空壳楼 → L1',l11liftshaft:'开放混凝土楼电梯井 → L2',l11brickdoor:'砖墙木门铁栅窗楼 → L3',l11officedoor:'上层办公间 → L4'}
const rows=locations.map(d=>`| ${names[d.kind]} | ${d.door.map(n=>n.toFixed(2)).join(', ')} | ${d.floor+1} |`).join('\n')
const md=`# L11 出口扩展验收

新增稀有空壳楼门 → L1、开放烂尾楼电梯井 → L2、砖墙木门铁栅窗楼 → L3、办公楼上层房门 → L4。烂尾楼柱、梁、板、核心筒和井壁直接复用 L1 裸混凝土使用的 CC0 Concrete034 颜色／OpenGL 法线／粗糙度图；净重复 .32 次/米、法线 .24、粗糙度 .86。沿用城市室外光照，不引入 L1 的室内烘焙光或噪点占位。近、远模型的纹理尺度一致。

L1 空壳楼封闭首层、无房间和家具，具有真实柱梁、楼板及未装修核心筒；L2 楼首层可进入，入口至井口有净空，井坑深 3.5 米。砖楼收窄至最多 13 米临街宽，保留左侧小木门、右侧大铁栅窗、内层窗框／下部浅色窗板和门灯；维持城市多层体量。两种特殊原型由稀有出口规划器登记后选取，不进入普通高频建筑池。

## 密度与稳定性

- 每 1024 米宏区、每种新增出口最多一个，并允许该种缺席；每街区最多一个新增出口。
- 新出口建筑中心至少相隔 180 米；旋转轮廓距宏区边界保留 120 米，避免边界两侧聚集。
- 两处道路标牌出口相隔约 93 米，移除了其旁重复的指向标牌；不会在一个街区超过两处。
- 四种种子、12 个宏区中，L1/L2/L3/L4 分别出现 ${generation.counts.l11unfinisheddoor}/${generation.counts.l11liftshaft}/${generation.counts.l11brickdoor}/${generation.counts.l11officedoor} 次；包含负坐标、改变加载顺序和装饰修订。Worker 与主线程实际比对 5 处出口一致。
- 生成缓存版本升为 3；原 l11v2 实例标识不变。世界存档仍为版本 2，以可选 archiveUnlocked 保存拆封状态，旧档缺少该字段时保持封条。

## Level 601

公共档案馆木门位于 (36.24, 87.00)，直接贴在实墙上，上方标示 EXIT 出口，门面有交叉封条，旁边为磁带提交箱。首次交互要求并消耗六盘随身磁带，拆封但不传送；再次交互进入 Level 601（内部 ID 12）。完整运行验证 0/5 盘不扣除，7 盘提交后剩 1 盘；较早视觉复查另验证恰好 6 盘。读档和离开后返回保留拆封状态，不再收费。

## 最终运行

种子 ${run.seed}，1920×1080，真实光照、细节距离 .55、场景灯上限 8、关闭阴影和泛光；Chrome 使用 --headless=new、独立配置目录和独立端口。所有场景为实际游戏渲染，未使用测试专属建筑或出口。

浏览器：${run.browser.product}。GPU：${gpu}。

实际抵达层级：${run.transitions.map(t=>t.level===12?'601':t.level).join('、')}。办公楼实际爬楼梯，电梯井从楼外走到井口触发。最终混凝土与砖楼局部复查再次抵达 L2、L3。三组运行无控制台／运行时错误；网络日志保留了验证页 favicon.ico 的 404，贴图未出现加载失败。

| 出口（该种子中首个样本） | 世界 X, Y | 楼层 |
|---|---|---|
${rows}

本次为出口、材质、碰撞与状态验证，并非稳定 60 FPS 性能验收；采样计数保留在 runtime.json。没有重复完整经典／低画质检查。未修改多人实现或 app-lite。

## 执行命令

\`\`\`text
npm run check:l11-exits
npm run check:l11
npm run check:l11-meshes
npm run build
node scripts/verify-l11-exits.mjs
node scripts/verify-l11-exits.mjs --materials-only
node scripts/verify-l11-exits.mjs --brick-only
\`\`\`

全部通过。模型检查覆盖 32 建筑／108 装饰及已注册标牌，增加了 L1 三通道复用、物理 UV 尺度、近远模型一致性和不修改城市共享纹理的断言。构建保留既有字体 URL、PostCSS 和产物体积警告，见 build.log。

浏览器、服务器和配置目录均由脚本创建并清理；独立进程与端口复核见 cleanup.json。完整数据：[runtime-final/runtime.json](runtime-final/runtime.json)、[materials-final/runtime.json](materials-final/runtime.json)、[brick-final/runtime.json](brick-final/runtime.json)。资产来源见 [L11-ASSET-SOURCES.md](../../public/textures/L11-ASSET-SOURCES.md)。
`
writeFileSync(path.join(out,'RESULTS.md'),md)
const figure=(src,title,caption='')=>{if(!existsSync(path.resolve(out,src)))throw Error('Missing image '+src);return `<figure><a href="${esc(src)}"><img loading="lazy" src="${esc(src)}" alt="${esc(title)}"></a><figcaption><strong>${esc(title)}</strong>${caption?'<br>'+esc(caption):''}</figcaption></figure>`}
const pics=[
 ['../../reference/L11/exits/unfinished-frame-user.png','用户参考 · 未完工混凝土楼','用户提供的结构参考；原图保存，未用作材质。'],
 ['materials-final/l11unfinisheddoor-rear.png','L1 空壳楼 · 后侧','L1 混凝土贴图，实体柱梁与逐层楼板。'],
 ['materials-final/l11unfinisheddoor-exterior.png','L1 空壳楼 · 临街侧'],
 ['materials-final/l11unfinisheddoor-detail.png','L1 木门与混凝土近景'],
 ['materials-final/l11liftshaft-exterior.png','L2 开放烂尾楼'],
 ['materials-final/l11liftshaft-detail.png','L2 电梯井入口','首层保持未装修状态，无办公室、住宅陈设。'],
 ['materials-final/shaft-pit.png','L2 井坑深度','井壁、井底、导轨和楼板洞口具有真实深度。'],
 ['materials-final/arrival-2.png','步入电梯井后抵达 L2'],
 ['../../reference/L11/exits/brick-wood-door-user.png','用户参考 · 砖墙、木门、铁栅窗'],
 ['brick-final/brick-exterior.png','L3 砖楼 · 临街侧','左侧小门／右侧大窗，多层城市体量。'],
 ['brick-final/brick-detail.png','L3 木门与连续砖纹近景'],
 ['runtime-final/l11officedoor-detail.png','L4 上层办公间门','出口使用正常办公室的上层房间与楼梯。'],
 ['runtime-final/archive-0.png','L601 · 封条尚未拆除'],
 ['runtime-final/archive-7.png','L601 · 提交磁带后拆封','第一步只提交并拆封；第二步才进入。'],
 ['runtime-final/arrival-601.png','第二次交互后抵达 Level 601'],
 ['runtime-final/archive-revisit.png','离开后返回仍保持拆封']
]
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L11 出口扩展验收</title><style>body{margin:0;background:#edf0ed;color:#263431;font:16px/1.65 system-ui,'Microsoft YaHei',sans-serif}main{max-width:1480px;margin:auto;padding:32px}h1{margin:0;font-size:32px}p{max-width:1100px}.badge{color:#146b49;background:#d5e7d9;display:inline-block;padding:5px 12px;border-radius:6px}a{color:#196260}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0;background:#fff;border:1px solid #d4dbd7;border-radius:8px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:12px 16px}table{border-collapse:collapse;width:100%;margin:20px 0;background:white}td,th{padding:10px 14px;text-align:left;border:1px solid #d4dbd7}small{color:#5c6964}@media(max-width:800px){main{padding:16px}.grid{grid-template-columns:1fr}}</style><main><span class="badge">出口与最终材质检查通过</span><h1>L11 出口扩展</h1><p>稀有建筑通往 L1、L2、L3，上层办公间通往 L4；档案馆通过提交六盘磁带拆封，再次交互进入 L601。烂尾楼直接复用 L1 的 CC0 裸混凝土贴图。下图均为实际游戏截图，可点击原尺寸查看。</p><p><a href="RESULTS.md">完整验收说明与命令</a> · <a href="generation.json">12 个宏区的生成数据</a> · <a href="cleanup.json">独立清理复核</a> · <a href="../../public/textures/L11-ASSET-SOURCES.md">素材来源</a></p><table><tr><th>检查</th><th>结果</th><th>证据</th></tr>${modes.map(([name,dir,r])=>`<tr><td>${name}</td><td>通过，${r.errors.length} 个运行错误</td><td><a href="${dir}/runtime.json">数据</a> / <a href="${dir}/console.json">控制台</a></td></tr>`).join('')}</table><p><small>固定种子 ${run.seed} · 1920×1080 · ${esc(run.browser.product)} · ${esc(gpu)}。本轮验证出口功能与外观，未声称稳定 60 FPS。网络记录仅包含验证页 favicon 404。</small></p><div class="grid">${pics.map(p=>figure(...p)).join('')}</div></main></html>`
writeFileSync(path.join(out,'index.html'),html)
console.log('L11 exit report written: '+path.join(out,'index.html'))
