import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const app=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(app,'reports/l11-reference'),label='architecture-accepted'
const read=p=>JSON.parse(readFileSync(path.join(dir,p),'utf8'))
const r=read(`${label}/runtime.json`),s=read('architecture/static.json'),signReview=read('architecture-signs/runtime.json')
if(!r.ok||r.setup.version!==9||!r.command.includes('--headless=new')||!r.cleanup.profileRemoved||r.errors.length||!s.ok)throw Error('Architecture acceptance is incomplete')
if(!signReview.ok||signReview.errors.length||!signReview.cleanup.profileRemoved)throw Error('Projecting-sign review is incomplete')
const entries=r.validation.flatMap(v=>v.entrances),flights=entries.flatMap(v=>v.flights),rooms=r.roomWalks.flatMap(v=>v.checks),randomGarden=r.random.find(v=>v.kind==='garden')
if(!randomGarden.validation?.ok||!r.civil?.ok)throw Error('Missing physical traversal evidence')
const n=v=>Number.isFinite(v)?v.toFixed(1):'—'
const table=r.views.map(v=>`| ${v.id} | ${n(v.performance.median)} | ${n(v.performance.p95)} | ${v.performance.draws} | ${v.performance.triangles.toLocaleString('en-US')} |`)
const command=`node scripts/verify-l11-reference.mjs --label=${label} --case=01,03,14,15,16,17,18,19,20,21,22,23 --validate=east-stone,west-piers,blue-retail,service-loft,brick-housing --rooms --lifecycle --architecture`
const checks=read('architecture/checks.json')
const report=`# Level 11 建筑结构与随机生成复核（版本 9）

[原图与最新游戏截图](index.html) · [运行原始结果](${label}/runtime.json) · [普通城市抽样](architecture/static.json) · [本轮检查命令](architecture/checks.json)

## 本轮修改

- 11iconic 最近的右侧建筑采用宽 22m、进深 6m、抬高 2.1m 的入口：14 级 15cm 高踏步、1.5m 平台、斜扶手和两侧带金属围栏的花园。模型、楼层高度、碰撞和区块归属共用同一描述；入口前庭禁止街边道具占用。普通城市中的同类建筑先预留前庭再生成入口。
- 11canal 的两座楼使用各自朝内的蓝色侧面，中间保留实际空隙，顶部连廊连接两楼。桥面改为缓拱形，带实体底面、桥台连接及落在桥面范围内的桥墩；道路、栏杆和水下碰撞跟随同一高度曲线。
- 11iconic 的橙色牌面直接贴墙。普通城市同时支持贴墙和悬挑两种结构，四种完整竖式牌面（Pegasus、hotel、clinic、cinema）。新增的三个牌面为 AI 生成资产，保留源图、提示词与处理脚本；不作为三个新增装饰原型重复计数。
- 左侧首层店铺采用透明玻璃、独立房间、货架、收银台、灯具和完整店招。店铺在走廊规划前预留，玻璃后面是可进入的实际空间。
- 后续参考细化了 11lowdensity 的蓝色斜雨棚商铺、退台屋顶与设备，以及 11unfinishedinterior 的混凝土工作间、外露梁、服务桥架、梯子和电缆盘。蓝雨棚商铺保留多层体量。砖楼门框和信箱已改为随入口朝向旋转。
- 修复抬高首层建筑的楼层判断，避免入口或室内楼梯下降时被错误归入上层；玩家、道具和相关单人行为查询传入实际位置。

固定种子仅固定城区排列。${Object.keys(s.recipes).length} 种参考体量配方全部在普通生成器抽样中出现，会适配地块尺寸、朝向和楼层；构件与装饰使用同一登记和碰撞流程。基础库为 30 种建筑原型、102 种装饰原型，32 张既有图集牌面另加四种竖式牌面。

## 复现和覆盖

新游戏种子 **20259573** 对应 L11 地图种子 **20261014**。办公室街道坐标 272,415；大台阶 291,367；运河主视角 760,967.8；蓝雨棚街 116,643。生成器不读取相机。参考配方版本 9、街景版本 6，存档世界版本仍为 2。

普通世界静态检查使用种子 ${s.seeds.join('、')}，覆盖负坐标和不同加载次序：${s.buildings} 栋建筑、${s.twins} 组双楼、${s.arches} 处桥梁、${s.piers} 组桥墩、${s.stairs} 处抬高入口，其中 ${s.gardens} 处有花园。四种牌面 × 两种安装方式均有生成。

实际游戏使用 ${r.browser.product}，真正的无头 Chrome、独立配置目录、独立 Vite/CDP 端口；1920×1080、DPR 1、真实光照、高画质、固定晴天和时间 10。渲染设备：**${r.hardware.renderer}**。

- ${r.views.length} 个参考视角及 ${r.random.length} 个普通种子视角；截图均来自生产 Engine 和 Renderer。
- 悬挑立牌另有[补拍记录](architecture-signs/runtime.json)：原先抽到的上部立牌从近处被裙房遮挡，补拍选择普通种子中下部立面的立牌；没有为截图改变建筑。
- ${entries.length} 栋重点建筑入口、${flights.length} 段室内楼梯双向行走，${entries.reduce((sum,e)=>sum+e.doors,0)} 个门口碰撞检查；${rooms.length} 次实际房门行走。
- 大台阶上下行、普通种子带花园入口及其楼梯均已测试。拱桥两个方向实际通过，桥下净空可通行、${r.civil.piers} 个桥墩有水下碰撞。
- 连续步行 ${n(Math.hypot(r.walkEnd.x-r.walkStart.x,r.walkEnd.y-r.walkStart.y))}m 并跨区块，三轮卸载/重载检查资源计数与实例引用。
- 运行错误 ${r.errors.length}；网络异常 ${r.networkErrors.length}（详见原始日志）。本轮所属浏览器、服务器和临时配置目录已清理。

## 性能实测

| 视角 | 中位帧时间 ms | P95 ms | 绘制调用 | 三角形 |
|---|---:|---:|---:|---:|
${table.join('\n')}
| 正常步行/切区 | ${n(r.walking.median)} | ${n(r.walking.p95)} | ${r.walking.draws} | ${r.walking.triangles.toLocaleString('en-US')} |

步行最大帧时间 ${n(r.walking.max)}ms。三轮非角色池纹理数为 ${r.cycles.map(c=>c.nonPooledTextures).join(' / ')}，场景 CPU 几何数为 ${r.cycles.map(c=>c.geometryAudit.scene.cpu).join(' / ')}。这些是 Three.js 资源计数，并非显存字节数。切区仍有长帧，不能认定所有视角稳定 60 FPS。

## 检查命令

工作目录为 app：

\`\`\`text
${checks.commands.map(c=>c.command).join('\n')}
${command}
node scripts/summarize-l11-architecture.mjs
\`\`\`

${checks.commands.filter(c=>c.status!=='passed').map(c=>`- **未通过/未覆盖：** ${c.command}：${c.note}`).join('\n')||'上述静态检查全部通过。'}

本轮低画质 3 个视角、经典光照 2 个视角均通过，错误为 0，浏览器/服务器/临时配置均已清理。这两轮兼容性抽查并行运行，其帧时间不用于性能结论。未列为本轮检查的旧报告仅作历史记录。此前版本 7 的运行结果与性能保存在 [历史报告](README-v7.md)，不与本轮数值混用。

附加工具限制：Git 空白差异检查在本会话返回“必须在工作树中运行”，未能完成；未修改 Git 配置。上述编译、生成、碰撞和实际游戏检查独立通过。

## 视觉与素材说明

结构误读、随机生成适用性和通行问题已经按上述范围修改并检查；目前画面仍有程序化建模感，绿化、车辆、部分门窗比例、街道磨损和间接光与照片存在差距，不能称为全部照片的像素级复刻。新增参考采用结构和用途特征，未将原图投射到镜头前充当建筑。

铺装、家具和叶片继续使用登记过的 CC0 材质；没有新增噪点纹理。竖牌来源和高低质量通道见 [资产记录](../../public/textures/L11-ASSET-SOURCES.md)与[生成清单](../../assets/l11-vertical-signs/manifest.json)。本轮只更改 app 与对应文档，联机继续冻结。
`
const historical=path.join(dir,'README-v7.md');if(!existsSync(historical))writeFileSync(historical,readFileSync(path.join(dir,'README.md')))
writeFileSync(path.join(dir,'README.md'),report)
const fig=(src,caption)=>`<figure><a href="${src}"><img src="${src}" alt="${caption}" loading="lazy"></a><figcaption>${caption}</figcaption></figure>`
const game=(id,caption)=>fig(`${id==='random-blade-sign'?'architecture-signs':label}/${id}.png`,caption),ref=(file,caption)=>fig(`../../reference/L11/${file}`,caption)
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L11 建筑结构与参考图对照</title><style>
body{margin:0;padding:30px 20px 60px;background:#f4f5f2;color:#253134;font:16px/1.6 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto}h1{font-size:28px;margin:0}h2{margin:32px 0 12px;font-size:21px}a{color:#17616b}figure{margin:0;background:white;border:1px solid #dce2de}img{display:block;width:100%;height:auto}figcaption{padding:9px 12px}p{max-width:1050px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.notice{border-left:4px solid #397a79;padding:12px 16px;background:white}nav{display:flex;flex-wrap:wrap;gap:20px;margin:20px 0}@media(max-width:780px){.grid{grid-template-columns:1fr}body{padding:18px 12px}}
</style></head><body><main><h1>L11 建筑结构与参考图对照 · 版本 9</h1>
<p class="notice">新游戏种子 <b>20259573</b> → L11 种子 <b>20261014</b>。普通世界另以种子 <b>42</b> 实拍，四个种子共检查 ${s.buildings} 栋建筑。这里展示实体几何与真实室内，画面仍未达到照片级一致。</p>
<nav><a href="README.md">完整验证与性能报告</a><a href="${label}/runtime.json">本轮运行结果</a><a href="architecture/static.json">随机生成分布</a><a href="architecture/checks.json">检查命令与限制</a></nav>
<h2>11iconic：完整店铺、贴墙立牌与入口前庭</h2><div class="grid">${ref('11iconic.jpg','参考原图：11iconic')}${game('01-office-street','实际游戏：办公街整体')}${game('22-grand-entrance','22m 宽大台阶、斜扶手与两侧围栏花园')}${game('23-entrance-gardens','14 级踏步、1.5m 平台与可通行入口')}${game('14-storefront-corner','透明玻璃后是实际店铺')}${game('15-storefront-interior','从真实门口观察店铺货架与收银台')}</div>
<h2>11canal：蓝色内侧立面、屋顶连廊和缓拱桥</h2><div class="grid">${ref('11canal.png','参考原图：11canal')}${game('03-canal','实际游戏：运河整体')}${game('16-twin-courtyard','两楼之间有空隙，顶部连廊连接两楼')}${game('17-arch-side','侧面检查拱形桥面、实体底板与桥墩')}</div>
<h2>继续细化其他参考</h2><div class="grid">${ref('11lowdensity.jpg','参考原图：蓝色雨棚商业街')}${game('18-blue-shops','多层蓝色斜雨棚商铺')}${game('19-blue-shops-rear','背面与退台屋顶')}${game('21-service-upper','工作间上层与楼内结构')}${ref('11unfinishedinterior.jpg','参考原图：未完工室内')}${game('20-service-workshop','实际工作间：梁、梯子、工作台及施工陈设')}</div>
<h2>普通随机城市中的同类结构 · 种子 42</h2><div class="grid">${game('random-retail','普通地块：带真实店铺的办公楼')}${game('random-twins','普通地块：蓝色侧立面与屋顶连廊')}${game('random-garden','普通地块：预留前庭的大台阶与花园')}${game('random-wall-sign','随机贴墙立牌')}${game('random-blade-sign','随机悬挑立牌')}${game('13-walking','正常步行跨区块检查')}</div>
<nav><a href="README-v7.md">上一轮历史报告</a><a href="final/02-brick-apartments.png">上一轮公寓截图</a><a href="../../assets/l11-vertical-signs/prompts.json">新增完整立牌提示词</a></nav></main></body></html>`
writeFileSync(path.join(dir,'index.html'),html)
writeFileSync(path.join(dir,'architecture/summary.json'),JSON.stringify({ok:true,version:r.setup.version,ordinaryBuildings:s.buildings,recipes:s.recipes,entries:entries.length,flights:flights.length,roomWalks:rooms.length,randomGarden:randomGarden.validation,signReview:signReview.random,civil:r.civil,hardware:r.hardware,walking:r.walking,cleanup:r.cleanup,checks},null,2))
console.log(JSON.stringify({ok:true,entries:entries.length,flights:flights.length,roomWalks:rooms.length,views:r.views.length,ordinaryViews:r.random.length}))
