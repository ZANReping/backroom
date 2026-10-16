import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const out=fileURLToPath(new URL('../reports/l11-navigation-interiors/',import.meta.url))
const read=name=>JSON.parse(readFileSync(path.join(out,name+'.json'),'utf8').replace(/^\uFEFF/,''))
const before=read('baseline-active'),after=read('final'),entry=read('entry'),cross=read('crosswalks'),cleanup=read('cleanup')
if(!after.ok||!entry.ok||!cross.ok||!cleanup.passed)throw Error('Verification incomplete')
const ecology=JSON.parse(readFileSync(path.join(out,'ecology.log'),'utf8').trim().split(/\r?\n/).at(-1))
if(!ecology.ok||!readFileSync(path.join(out,'build.log'),'utf8').includes('built in'))throw Error('Checks/build incomplete')
const f=n=>Number(n).toFixed(1),a=after.activeOffice.stats,b=before.activeOffice.stats,walkers=after.walkers
const body=`# L11 斑马线通行与楼内性能

日期：2026-10-16。范围：Three.js app。

## 修复

- 斑马线路径按道路边缘和标线边界切分，检查整段通行空间。失败的对角边不再将可由其他方向到达的节点标记为不可用；转向前检查从当前实际位置到下一路点的连线，避免过早略过拐角。
- 保留过街前的短暂停留、避让玩家、碰撞、室内岗位和激怒后反击。旋转道路的标线边界采用极小浮点容差。
- L11 的实时可见格直接复用大小地图已计算的视域，移除每帧约 200 次重复的旧式视线步进。建筑视线/通行查询使用已有空间索引筛选附近碰撞体，保持原判定规则。
- 图鉴已记录的实体不再为重复登记进行视线检查；内饰渲染仅为当前区块实际包含陈设的建筑创建分组，进楼与传送后及时更新可见性和阴影。

## 固定场景性能

${after.browser.product}，真正无头 Chrome；1920×1080，真实光照、16 个场景灯、2 个点光阴影槽，默认细节和纹理档。GPU：${a.gpu}。
种子 20261006，同一办公室、相同相机。完整游戏逻辑、实体 AI 开启，玩家站立；每次至少 120 帧、至少 2.4 秒。CPU profiler 单独采集。

| 指标 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 完整循环帧时间中位数 | ${f(b.median)} ms | ${f(a.median)} ms |
| 完整循环帧时间 P95 | ${f(b.p95)} ms | ${f(a.p95)} ms |
| 渲染 CPU 中位数 | ${f(b.cpuMedian)} ms | ${f(a.cpuMedian)} ms |
| GPU 中位数 | ${f(b.gpuMedian)} ms | ${f(a.gpuMedian)} ms |
| 首次开启模拟在内的单帧最大值 | ${f(b.max)} ms | ${f(a.max)} ms |
| 内饰分组 / 其中空分组 | 400 / 377 | 23 / 0 |

街道、商铺、办公室固定视角的正常绘制次数及三角形中位数与基线相同，保持原建筑、陈设、材质和阴影质量。主要收益来自减少游戏逻辑的重复计算。

实际按 W 从街道步行约 4 米进入商铺：成功进入、最终碰撞位置合法，${entry.entry.frames} 帧，中位 ${f(entry.entry.median)} ms、P95 ${f(entry.entry.p95)} ms、峰值 ${f(entry.entry.max)} ms。完整模拟第一次启用仍有 ${f(a.max)} ms 的初始化峰值；本次结果不代表所有城区或所有硬件都无长帧。

## 验证

- 斑马线专项 ${cross.checks} 项：已复现的拐角、旋转道路、负坐标、细密采样对照、8 名行人连续 180 秒运动。
- 既有生态 ${ecology.checks} 项：种子 1、42、20261006，负坐标、宏区边界、岗位、过街及跨区实体去重。
- 实际游戏碰撞/视域 ${after.parity.checks} 项：${after.parity.blocked} 个阻挡点、${after.parity.open} 个空地采样，原点平移前后索引与完整碰撞集合一致；地图可见性额外旧式视线调用为 ${after.parity.legacyVisibilityRays}。
- 实际游戏 8 名行人再运行 180 秒：全部步行超过 110 米，最长连续停留 ${f(Math.max(...walkers.map(w=>w.maxStalled)))} 秒（包含休息、规划与过街等待）；原复现最长约 89.4 秒的卡住未再出现。
- npm run build 通过。保留已有字体、Browserslist、PostCSS 与大包提示，见 build.log。
- 运行时错误 0；唯一网络 404 为测试页 favicon.ico。
- 本次独立端口、Chrome 配置目录、浏览器和服务器已清理；只读进程/端口复查通过。

## 复测

~~~text
npm run check:l11-crosswalks
npm run check:l11-ecology
npm run verify:l11-navigation-interiors
node scripts/verify-l11-navigation-interiors.mjs entry
npm run build
pwsh -NoProfile -File scripts/check-l11-navigation-cleanup.ps1
~~~

基线文件 baseline-active.json 记录性能修复前的实际运行；final.json 为最终版本。before.json 保存最初长期停滞复现。CPU profile、截图、日志与 cleanup.json 位于本目录。测试页使用隔离存储，不接触玩家存档。
`
writeFileSync(path.join(out,'README.md'),body)
const rows=[['办公室帧时间中位数',b.median,a.median],['办公室帧时间 P95',b.p95,a.p95],['渲染 CPU 中位数',b.cpuMedian,a.cpuMedian],['GPU 中位数',b.gpuMedian,a.gpuMedian]].map(v=>`<tr><td>${v[0]}</td><td>${f(v[1])} ms</td><td>${f(v[2])} ms</td></tr>`).join('')
writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L11 通行与室内性能验收</title><style>
body{margin:0;background:#eef2ef;color:#18332c;font:16px/1.7 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1160px;margin:auto;padding:42px 24px}h1{font-size:34px;line-height:1.3}h2{font-size:22px;margin:0 0 14px}section{padding:26px;margin:24px 0;background:#fff;border-radius:15px;border:1px solid #d5e2da}.muted{color:#577267}.badge{color:#236545;font-weight:600}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #dce6e0}th{background:#f5f8f6}button{font:inherit;cursor:pointer;border:1px solid #bed3c6;background:white;color:#244f3c;padding:7px 20px;border-radius:8px;margin:0 8px 14px 0}button[aria-pressed=true]{background:#244f3c;color:white}img{display:block;width:100%;border-radius:8px}a{color:#186b47}p{margin:12px 0}code{background:#edf3ef;padding:2px 5px}ul{padding-left:22px}.notice{border-left:4px solid #b78a48;padding-left:14px;color:#70552e}.links{display:flex;flex-wrap:wrap;gap:16px}</style><main>
<span class="badge">实际游戏验证通过 · 2026-10-16</span><h1>Level 11<br>斑马线通行与楼内性能</h1><p class="muted">固定种子 20261006 · Chrome 155 · RTX 4060 Laptop · 1920 × 1080 · 真实光照</p>
<section><h2>修复结果</h2><ul><li>路径完整检查标线和路缘边界，修复无面灵卡在斑马线拐角后反复重寻路。</li><li>复用地图视域，减少重复视线计算；附近碰撞查询使用空间索引。</li><li>移除区块中的空内饰分组，保留建筑、陈设与合批质量。</li></ul><p>专项测试 ${cross.checks} 项、生态回归 ${ecology.checks} 项、运行时碰撞与视域检查 ${after.parity.checks} 项通过。生产构建通过，测试进程已清理。</p></section>
<section><h2>完整游戏循环的办公室性能</h2><table><thead><tr><th>指标</th><th>修改前</th><th>修改后</th></tr></thead><tbody>${rows}</tbody></table><p class="muted">相同相机与设置，开启实际 AI 和游戏逻辑。内饰分组从 400 个降到 23 个，空分组从 377 个降到 0 个。三组静态视角的绘制次数与三角形中位数保持一致。</p><p class="notice">实际步行进楼成功，中位 ${f(entry.entry.median)} ms、P95 ${f(entry.entry.p95)} ms，仍有 ${f(entry.entry.max)} ms 单帧峰值。第一次启用完整模拟还记录到 ${f(a.max)} ms 初始化峰值。</p></section>
<section><h2>相同视角画面对照</h2><div id="views"><button data-view="office" aria-pressed="true">办公室</button><button data-view="shop" aria-pressed="false">商铺</button><button data-view="street" aria-pressed="false">街道</button></div><div id="versions"><button data-version="baseline-active" aria-pressed="false">修改前</button><button data-version="final" aria-pressed="true">修改后</button></div><img id="comparison" src="final-office.png" alt="修改后办公室实机截图"><p class="muted" id="caption">修改后 · 办公室</p></section>
<section><h2>实际步行进楼</h2><img src="entry-inside.png" alt="从街道穿过门口进入建筑后的实际画面"><p>通过真实键盘输入步行，验证门口通行及最终碰撞位置。</p></section>
<section><h2>原始验收记录</h2><div class="links"><a href="README.md">完整说明与复测命令</a><a href="baseline-active.json">性能基线</a><a href="final.json">最终实机数据</a><a href="entry.json">步行进楼</a><a href="crosswalks.json">斑马线检查</a><a href="ecology.log">生态回归</a><a href="build.log">生产构建</a><a href="cleanup.json">进程清理</a></div><p class="muted">控制台运行时错误 0；测试页 favicon.ico 返回 404。测试存储与玩家存档隔离。</p></section>
</main><script>let view='office',version='final';const names={office:'办公室',shop:'商铺',street:'街道'};function draw(){document.querySelector('#comparison').src=version+'-'+view+'.png';document.querySelector('#caption').textContent=(version==='final'?'修改后':'修改前')+' · '+names[view];for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',b.dataset.view===view);for(const b of document.querySelectorAll('[data-version]'))b.setAttribute('aria-pressed',b.dataset.version===version)}document.querySelector('#views').onclick=e=>{if(e.target.dataset.view){view=e.target.dataset.view;draw()}};document.querySelector('#versions').onclick=e=>{if(e.target.dataset.version){version=e.target.dataset.version;draw()}};</script></html>`)
console.log(JSON.stringify({report:path.join(out,'index.html'),checks:cross.checks+ecology.checks+after.parity.checks,ok:true}))
