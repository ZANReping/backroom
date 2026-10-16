import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const app=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(app,'reports/l11-reference'),label='facade-accepted'
const read=p=>JSON.parse(readFileSync(path.join(dir,p),'utf8').replace(/^\uFEFF/,''))
const main=read(`${label}/runtime.json`),fixLabel='facade-final',fix=read(`${fixLabel}/runtime.json`),shortWalk=read('facade-surface-fix/runtime.json'),s=read('architecture/static.json'),checks=read('facades/checks.json')
// The last patch changes only distant facade tessellation. Keep the physical
// entry/room evidence, and replace affected views and lifecycle measurements
// with the focused run made after the floating-point boundary correction.
const r={...main,views:main.views.map(v=>fix.views.find(f=>f.id===v.id)??v),walking:fix.walking,walkStart:fix.walkStart,walkEnd:fix.walkEnd,cycles:fix.cycles}
const compatibility=['facade-low','facade-classic'].map(label=>({label,...read(`${label}/runtime.json`)}))
const clean=r=>r.ok&&r.command.includes('--headless=new')&&r.cleanup.profileRemoved&&r.cleanup.browserExit!==null&&r.cleanup.serverExit!==null&&!r.errors.length
if(!clean(main)||!clean(fix)||r.setup.version!==10||fix.setup.version!==10||!s.ok||!compatibility.every(clean)||checks.commands.some(c=>c.status!=='passed'))throw Error('Facade acceptance is incomplete')
const entries=r.validation.flatMap(v=>v.entrances),flights=entries.flatMap(v=>v.flights),rooms=r.roomWalks.flatMap(v=>v.checks)
if(!r.civil?.ok||!['garden','glazed-terrace'].every(kind=>r.random.some(v=>v.kind===kind&&v.validation?.ok)))throw Error('Missing physical traversal evidence')
mkdirSync(path.join(dir,'facades'),{recursive:true})
writeFileSync(path.join(dir,'facades/static.json'),JSON.stringify(s,null,2))
for(const file of ['README.md','index.html']){const ext=path.extname(file),historical=path.join(dir,file.slice(0,-ext.length)+'-v9'+ext);if(!existsSync(historical))copyFileSync(path.join(dir,file),historical)}
const n=v=>Number.isFinite(v)?v.toFixed(1):'—',table=r.views.map(v=>`| ${v.id} | ${n(v.performance.median)} | ${n(v.performance.p95)} | ${v.performance.draws} | ${v.performance.triangles.toLocaleString('en-US')} |`)
const command=`node scripts/verify-l11-reference.mjs --label=${label} --case=01,03,04,14,15,22,23,24,25,26,27,28 --validate=east-stone,east-ribbon,west-piers --rooms --lifecycle --architecture --random-cases=glazed-terrace,garden`
writeFileSync(path.join(dir,'README.md'),`# Level 11 大入口与立面复核（版本 10）

[参考图与实际游戏对照](index.html) · [通行与室内运行结果](${label}/runtime.json) · [远景修正后补拍](${fixLabel}/runtime.json) · [普通城市抽样](facades/static.json) · [检查记录](facades/checks.json) · [版本 9 历史报告](README-v9.md)

## 入口和建筑

11iconic 最近的右侧建筑保留宽 **22m**、进深 **6m**、抬高 **2.1m** 的大入口：14 级 15cm 踏步、1.5m 顶部平台、斜扶手，以及两侧带金属围栏的花园。实际入口与首层一起抬高；从街道上台阶、进门及楼内上下楼使用相同的空间数据。前庭在地块阶段预留，街道装饰避开台阶与入口。

重新对照原图后，最近建筑改为深色玻璃幕墙和金属竖框；后方带 PEGASUS 贴墙立牌的建筑使用石材窗格立面。玻璃楼具有环绕四面的基座分缝、层间遮挡带和可见真实房间；石材楼增加窗洞进深、窗帘和细窗框。背面、侧面及室内均单独实拍检查。远近模型共用楼层基准，防止抬高或旋转后的建筑在远景中换成另一种立面。逐层远景在浮点高度边界处曾多生成极薄窗带，已增加容差并以 0.03m / 2.17m 基准、20 层和七种立面复核。

这些结构也进入普通随机生成：${s.buildings} 栋抽样建筑中有 ${s.architectures['glazed-terrace']} 栋玻璃幕墙类型，${s.stairs} 处抬高入口，${s.gardens} 处带花园入口；${Object.keys(s.recipes).length} 种参考体量配方全部出现。抽样种子为 ${s.seeds.join('、')}，包括负坐标和不同生成顺序。普通种子 42 的花园入口与玻璃楼入口均在实际游戏中验证，参考城区只固定排列。

## 街道与兼容性

道路标线现在依据真正的路网交点生成，覆盖内部十字路口、丁字路口与斜交路口。交叉口中间停止画车道线，远景使用相同规则。宽道路增加连续行道树，避开道路和入口占地。日照朝向与 HDR 天空同步调整；石材和沥青继续使用登记的 CC0 材质，压低原始扫描的过强色差，没有新增噪点纹理。来源和处理见[资产记录](../../public/textures/L11-ASSET-SOURCES.md)。

运河双楼侧面、屋顶连廊、缓拱桥与桥墩，以及透明玻璃店铺和室内陈设沿用上一轮修正，本轮重新检查相关视角和通行。其他参考的版本 9 截图仍保留在[历史画廊](index-v9.html)。

## 实际游戏验证

新游戏种子 **20259573** 对应 L11 地图种子 **20261014**。大台阶坐标约 **291,367**；街景坐标 272,415；运河主视角 760,967.8。参考配方版本 10、街景版本 7，存档世界版本仍为 2。

- ${r.views.length} 个参考视角、${r.random.length} 个普通城市视角，固定 1920×1080、DPR 1、真实光照、高画质、晴天与时间 10。
- ${entries.length} 栋重点建筑入口、${flights.length} 段室内楼梯双向行走、${entries.reduce((sum,e)=>sum+e.doors,0)} 个门口碰撞检查、${rooms.length} 次实际房门行走。
- 普通城市带花园入口与玻璃幕墙入口测试通过；缓拱桥双向通过，桥下可通行，${r.civil.piers} 个桥墩具有水下碰撞。
- 连续步行 ${n(Math.hypot(r.walkEnd.x-r.walkStart.x,r.walkEnd.y-r.walkStart.y))}m 并跨区块；实际按键持续 ${n(fix.walkWallMs/1000)} 秒，三轮卸载/重载检查通过。
- 主轮与远景补拍运行错误均为 0；网络异常分别 ${main.networkErrors.length} / ${fix.networkErrors.length}，原始记录保存在各轮 runtime.json。低画质与经典光照另各抽查 ${compatibility[0].views.length} / ${compatibility[1].views.length} 个视角，均通过。
- ${r.browser.product}；实际渲染硬件 **${r.hardware.renderer}**。浏览器命令行确认 --headless=new，独立端口和临时配置；本轮浏览器、服务器和配置目录已清理。

## 性能

| 视角 | 中位帧时间 ms | P95 ms | 绘制调用 | 三角形 |
|---|---:|---:|---:|---:|
${table.join('\n')}
| 正常步行/切区 | ${n(r.walking.median)} | ${n(r.walking.p95)} | ${r.walking.draws} | ${r.walking.triangles.toLocaleString('en-US')} |

01、03、04 视角及步行/资源数据来自远景楼层边界修正后的专项运行，其他行来自主轮。步行性能仍取开始的固定 24 秒样本，最大帧时间 ${n(r.walking.max)}ms。三轮非角色池纹理数 ${r.cycles.map(c=>c.nonPooledTextures).join(' / ')}，场景 CPU 几何数 ${r.cycles.map(c=>c.geometryAudit.scene.cpu).join(' / ')}。这些是资源计数，并非显存字节数。切区与部分视角仍有长帧，不能据此宣称全部场景稳定 60 FPS。兼容性抽查的帧时间不并入这张性能表。

**保留的失败记录：** [首次远景补拍](facade-surface-fix/runtime.json)在 24 秒内仅走了 ${n(Math.hypot(shortWalk.walkEnd.x-shortWalk.walkStart.x,shortWalk.walkEnd.y-shortWalk.walkStart.y))}m（中位 ${n(shortWalk.walking.median)}ms / P95 ${n(shortWalk.walking.p95)}ms），没有达到原脚本的 50m 覆盖要求，已标记失败并清理资源。最终脚本保留同样的 24 秒性能样本，允许最多 60 秒的按键行走以覆盖 70m，仍要求至少 50m 且区块版本递增；额外样本单独保存，不用于稀释性能数据。此项只证明通行，不代表低帧率问题已解决。

## 检查命令

工作目录 app：

\`\`\`text
${checks.commands.map(c=>c.command).join('\n')}
${command}
node scripts/verify-l11-reference.mjs --label=facade-final --case=01,03,04 --visual-only --lifecycle
node scripts/verify-l11-reference.mjs --label=facade-low --case=01,22 --visual-only --low
node scripts/verify-l11-reference.mjs --label=facade-classic --case=01,22 --visual-only --classic
node scripts/summarize-l11-facades.mjs
\`\`\`

路口测试包含十字、丁字、45° 斜交、负坐标、重复道路和参考/普通城市路网；模型测试包含七种立面在局部/旋转世界坐标下的楼层、材质与几何一致性。生产构建通过；既有字体路径与产物体积警告见构建日志。首次主轮验收受运行会话中断影响，没有作为通过证据；其截图保存在 facade-interrupted-v10，遗留配置目录已清理，随后完整重跑。

## 视觉范围

大台阶、两侧花园、正确的前后立面类型及实体内部已经实现。画面仍有程序化建模感，车辆、树形、部分室内密度、建筑比例和间接光与照片存在差距；本报告不把结构和通行通过等同于全部参考图的近乎完全复刻。本轮没有修改 app-lite、Godot 或冻结的联机实现。
`)
const fig=(src,caption)=>`<figure><a href="${src}"><img src="${src}" alt="${caption}" loading="lazy"></a><figcaption>${caption}</figcaption></figure>`
const game=(id,caption)=>fig(`${fix.views.some(v=>v.id===id)?fixLabel:label}/${id}.png`,caption),ref=(file,caption)=>fig(`../../reference/L11/${file}`,caption)
writeFileSync(path.join(dir,'index.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L11 大入口与立面 · 版本 10</title><style>
body{margin:0;padding:30px 20px 60px;background:#f4f5f2;color:#253134;font:16px/1.6 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto}h1{font-size:28px;margin:0}h2{margin:32px 0 12px;font-size:21px}a{color:#17616b}figure{margin:0;background:white;border:1px solid #dce2de}img{display:block;width:100%;height:auto}figcaption{padding:9px 12px}p{max-width:1100px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.notice{border-left:4px solid #397a79;padding:12px 16px;background:white}nav{display:flex;flex-wrap:wrap;gap:20px;margin:20px 0}@media(max-width:780px){.grid{grid-template-columns:1fr}body{padding:18px 12px}}
</style></head><body><main><h1>L11 大入口与立面 · 版本 10</h1>
<p class="notice">最近右侧建筑：宽 22m、进深 6m 的台阶，14 级踏步、顶部平台、扶手与围栏花园。新游戏种子 <b>20259573</b> → L11 种子 <b>20261014</b>。普通城市也生成同类建筑。画面仍未达到照片级一致。</p>
<nav><a href="README.md">验证与性能报告</a><a href="${label}/runtime.json">实际游戏原始结果</a><a href="facades/static.json">随机分布</a><a href="index-v9.html">上一轮画廊</a></nav>
<h2>11iconic：大台阶和围栏花园</h2><div class="grid">${ref('11iconic.jpg','参考原图')}${game('01-office-street','实际游戏：玻璃幕墙前楼与石材后楼')}${game('22-grand-entrance','从街道观察宽台阶、平台、扶手和花园')}${game('23-entrance-gardens','入口近景：花园留在台阶两侧')}</div>
<h2>建筑的侧面、背面与真实室内</h2><div class="grid">${game('26-glazed-rear','玻璃楼背面和基座分缝')}${game('24-glazed-office','抬高首层内的实际办公室')}${game('27-glazed-upper','上层办公室')}${game('25-stone-advert','后方石材楼与贴墙 PEGASUS 立牌')}${game('28-stone-side','石材楼侧面：窗洞、窗框和窗帘')}${game('04-office-reverse','反向街景')}</div>
<h2>透明店铺与运河复核</h2><div class="grid">${game('14-storefront-corner','玻璃后是真实店铺')}${game('15-storefront-interior','店铺内部陈设')}${ref('11canal.png','运河参考原图')}${game('03-canal','双楼内侧立面、屋顶连廊和缓拱桥')}</div>
<h2>普通随机城市 · 种子 42</h2><div class="grid">${game('random-glazed-terrace','普通地块：玻璃幕墙和抬高入口，已实际进门')}${game('random-garden','普通地块：预留前庭的台阶与围栏花园，已实际进门及上下楼')}</div>
<p>普通世界抽样 ${s.buildings} 栋建筑，其中 ${s.architectures['glazed-terrace']} 栋玻璃幕墙类型、${s.stairs} 处抬高入口和 ${s.gardens} 处花园入口。低画质、经典光照与资源释放记录见完整报告。</p>
</main></body></html>`)
writeFileSync(path.join(dir,'facades/summary.json'),JSON.stringify({ok:true,version:10,entries:entries.length,flights:flights.length,roomWalks:rooms.length,views:r.views.length,ordinaryViews:r.random.length,ordinaryBuildings:s.buildings,architectures:s.architectures,civil:r.civil,hardware:r.hardware,walking:r.walking,cleanup:r.cleanup,finalFacadeReview:{label:fixLabel,views:fix.views.map(v=>v.id),cleanup:fix.cleanup,errors:fix.errors},compatibility:compatibility.map(c=>({label:c.label,ok:c.ok,cleanup:c.cleanup,errors:c.errors})),checks},null,2))
console.log(JSON.stringify({ok:true,version:10,entries:entries.length,flights:flights.length,roomWalks:rooms.length,views:r.views.length,ordinaryViews:r.random.length}))
