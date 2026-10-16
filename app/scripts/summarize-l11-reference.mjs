import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const app=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(app,'reports/l11-reference')
const read=p=>JSON.parse(readFileSync(path.join(app,p),'utf8'))
const runs=Object.fromEntries(['final','low-final','classic-final'].map(label=>[label,read(`reports/l11-reference/${label}/runtime.json`)]))
for(const [label,r]of Object.entries(runs))if(!r.ok||r.setup?.version!==7||!r.cleanup?.profileRemoved||r.errors.length)throw Error(`Unverified/current report: ${label}`)
const final=runs.final,staticPlan=read('reports/l11-reference/static.json'),clearance=read('reports/l11-reference/interior-clearance.json')
const entrances=final.validation.flatMap(v=>v.entrances),flights=entrances.flatMap(e=>e.flights),walks=final.roomWalks.flatMap(r=>r.checks)
const n=v=>Number.isFinite(v)?v.toFixed(1):'未提供'
const row=(label,p)=>`| ${label} | ${n(p.median)} | ${n(p.p95)} | ${n(p.max)} | ${p.draws} | ${p.triangles.toLocaleString('en-US')} |`
const rows=final.views.map(v=>row(v.id,v.performance))
const compat=Object.entries(runs).filter(([k])=>k!=='final').map(([k,r])=>`| ${k} | ${r.mode} / ${r.low?'低':'高'} | ${r.views.length} | ${r.errors.length} | ${r.cleanup.profileRemoved?'已清理':'未清理'} |`)
const cycles=final.cycles.map((c,i)=>`| ${i+1} | ${c.geometryAudit.scene.cpu} | ${c.geometryAudit.offScene} | ${c.nonPooledTextures} | ${c.cachedAvatarTextures} | ${c.roots} |`)
const summary={date:new Date().toISOString(),newGameSeed:20259573,l11Seed:20261014,referenceVersion:7,visualTarget:'partial: reference composition and physical district implemented; near-identical photographic appearance not achieved',browser:final.browser,gpu:final.performance.gpu,staticPlan,doorApproaches:clearance.approaches,entrances:entrances.length,stairs:flights.length,roomWalkDirections:walks.length,interaction:final.interaction,walking:final.walking,cycles:final.cycles,compatibility:Object.fromEntries(Object.entries(runs).map(([k,r])=>[k,{ok:r.ok,views:r.views.length,errors:r.errors.length,cleanup:r.cleanup}])),commands:['npm run check:l11-reference','npm run check:l11','npm run check:l11-map','npm run check:l11-meshes','npm run check:l11-collision','npm run check:l11-waterways','npm run check:l11-urban','npm run check:l11-dressing','npm run check:model-warmup','npm run check:program-completion','npm run build','node scripts/verify-l11-reference.mjs --label=final --rooms --interaction --lifecycle','node scripts/verify-l11-reference.mjs --quick --visual-only --low --label=low-final','node scripts/verify-l11-reference.mjs --quick --visual-only --classic --label=classic-final']}
writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2))
const report=`# Level 11 参考城区验证记录

本轮将三张参考图对应的街道、公寓和运河建筑群接入实际城市规划。新增与细化的建筑具有完整体量、背面、屋顶、入口和室内布局。**目前达到的是可行走的参考场景重建；尚不能认定与照片“几乎完全一致”。** [打开原图与游戏截图对照页](index.html)。

## 复现

新游戏种子输入 **20259573**。游戏现有规则为 L11 地图种子 = 新游戏种子 + 1441，因此对应的 L11 种子是 **20261014**。不要将两者混用。已建立的旧存档保留原 L11 地图种子。

| 场景 | 世界坐标 x, y | 参考图 |
|---|---|---|
| 办公街 | 272, 415 | 11iconic.jpg |
| 砖石公寓 | 108, 535 | 11scenes.jpg |
| 运河桥 | 760, 967.8 | 11canal.png |

这些坐标只用于复现截图，生成器不读取相机。三组场景处于同一宏区，连接正常道路与无限城市；可沿路到达，亦可用现有开发地图的右键安全传送检查。参考布局版本 7；街景缓存版本 5。原图在 \`app/reference/L11/\`，拍摄视角与固定设置在 \`app/verifier/l11-reference.ts\`。

## 已实现

- 27 栋真实参考建筑、37 个组合体量、40 个开放楼层；六类立面覆盖竖肋、石材窗格、幕墙、横窗、砖公寓和玻璃核心。远处楼群也有实际地块与首层入口。
- 窗洞深度、框料、窗台、百叶和窗帘；室内隔墙在外墙相交处有封闭构造。屋顶设备、底层柱廊、实体雨棚、台阶及完整立牌使用共享空间描述。
- 街树采用 CC0 叶片图集和立体枝叶；调整静态轿车外形、施工围挡、公交站、沿岸设施、道路标线与不同铺装。非道路装饰按旋转占地检查车道，长椅位于步道内。
- HDR 天空与太阳方向一致；按材质控制环境反射，限制过亮反射源，改善日照、玻璃、沥青和远景雾。真实光照高画质使用 4× MSAA。保留真实水面反射与 1.2 米浅水、0.65 米实体桥板。
- 建筑 LOD 按建筑包围体到相机的距离切换；远景立面消除重叠面闪烁。优化视野更新和交互射线，保留精确身体碰撞；薄玻璃采用精确线段阻挡，不能隔窗搜刮。
- 修复切换质量、卸载区块期间的材质预编译竞态；补充接待台实际模型突出部分与门前通行净空检查。

## 实际运行结果

主档使用真正的 \`--headless=new\`，独立 Vite/CDP 端口、独立浏览器配置目录。调用生产 Engine 和 Renderer，未使用假场景。固定 1920×1080、DPR 1、晴朗天气、时间 10、真实光照与高画质。每次运行的实际命令行和进程号保存在对应 \`runtime.json\`。

- 浏览器：${final.browser.product}。
- 渲染硬件：${final.performance.gpu}。
- 12 张主视角、反向、背面与室内截图；另存一张正常步行截图。
- ${entrances.length} 栋建筑实际穿过入口；${flights.length} 段楼梯实际双向行走；${entrances.reduce((s,e)=>s+e.doors,0)} 个房门中心可站立。
- 各建筑各开放楼层的每种房间类型抽取一间，完成 ${walks.length} 次双向门口行走；全部 ${clearance.doors} 扇门的 ${clearance.approaches} 个两侧位置另以实际家具碰撞体检查。
- 室内目标柜可开始搜刮，封闭玻璃/墙后的同一目标不能隔窗触发。
- 实际按住 W 跨区块步行：${n(Math.hypot(final.walkEnd.x-final.walkStart.x,final.walkEnd.y-final.walkStart.y))} 米；随后进行三轮办公街→公寓→运河→办公街的卸载重载。
- 运行错误 ${final.errors.length} 个；网络日志中的 favicon 404 单独保留，不作为模型或纹理加载成功的替代。

| 稳态视角 | 中位帧时间 ms | P95 ms | 最大 ms | 绘制调用 | 三角形 |
|---|---:|---:|---:|---:|---:|
${rows.join('\n')}
${row('正常步行 / 跨区块',final.walking)}

主档的普通步行 CPU 中位/P95 为 ${n(final.walking.cpuMedian)}/${n(final.walking.cpuP95)}ms，GPU 中位/P95 为 ${n(final.walking.gpuMedian)}/${n(final.walking.gpuP95)}ms。切区与首次程序/资源准备仍可能出现长帧；以上结果不能等同于所有设备、所有瞬间稳定 60 FPS。CPU 和 GPU 时间会重叠，不能直接相加。

| 兼容抽查 | 光照 / 画质 | 主视角数 | 运行错误 | 浏览器与配置目录 |
|---|---|---:|---:|---|
${compat.join('\n')}

低画质与经典光照抽查三组室外主视角；完整室内、楼梯、交互、步行和重载验证在主档执行。

| 重载轮次 | 场景 CPU 几何 | 场景外几何 | 非角色池纹理 | 缓存角色纹理 | 区块根节点 |
|---|---:|---:|---:|---:|---:|
${cycles.join('\n')}

角色纹理是有上限的复用缓存，允许暖机到 57；场景与非池资源单独检查。这里记录的是 Three.js 资源计数和 CPU 几何审计，**不是显存字节数**。所有本次 QA 浏览器、服务器和临时配置目录均由脚本按所属进程清理。

## 静态检查与命令

所有命令从 \`app\` 执行：

\`\`\`text
${summary.commands.join('\n')}
node scripts/summarize-l11-reference.mjs
\`\`\`

\`check:l11-reference\` 检查参考城区道路连通、建筑/道路/水体无交叠、跨区块稳定实例、加载顺序、LOD、车辆几何、街具车道净空和全部门前家具净空。

\`check:l11-meshes\` 验证 30 个基础建筑原型、100 个装饰原型、32 个既有完整标牌及几何释放。本轮新增立牌有独立注册记录，不重复计入原有 32 张图集牌面。

\`check:l11-urban\` 覆盖多个普通种子和负坐标的 173 栋建筑、223 个楼层、1940 个房间；\`check:l11-dressing\` 扫描 2052 个区块，100 种装饰均有生成。原有生成、地图、浅水桥体、存档迁移和暂停任务静态回归通过。

生产构建通过。仍保留项目已有字体解析、Browserslist、PostCSS、动态/静态重复导入及包体大小警告；未为此改变其他项目或冻结的联机实现。

## 视觉差距与资产记录

三个场景的建筑类型、街墙、窗型、橙色立牌和滨水体量已有对应关系。逐张检查同时确认：车辆与背景建筑仍有程序化造型感；树冠轮廓与原图不同；道路旧化、柔和间接光和密集城市细节仍不足，水面也不能视为照片复刻。此次功能与通行检查通过，不代表视觉近似目标已完全达到。

所有铺装/家具材质继续使用已登记的 CC0 资产，新增天空与树叶来自 Poly Haven；没有引入噪点纹理。来源、作者、准确许可、PBR 通道与质量档见 [L11-ASSET-SOURCES.md](../../public/textures/L11-ASSET-SOURCES.md)。橙色完整立牌为项目 AI 生成资产，其 [原始图与提示词](../../assets/l11-reference-signs/manifest.json)及处理脚本已保存，不声称为第三方 CC0 素材。

原始机器结果：[主档](final/runtime.json)、[低画质](low-final/runtime.json)、[经典光照](classic-final/runtime.json)、[汇总](summary.json)、[房门净空](interior-clearance.json)。
`
writeFileSync(path.join(dir,'README.md'),report)
console.log(JSON.stringify({ok:true,newGameSeed:summary.newGameSeed,l11Seed:summary.l11Seed,entrances:summary.entrances,stairs:summary.stairs,roomWalkDirections:summary.roomWalkDirections,walkingMedian:summary.walking.median,walkingP95:summary.walking.p95}))
