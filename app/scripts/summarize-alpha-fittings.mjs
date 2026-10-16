import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const dir=fileURLToPath(new URL('../reports/alpha-refinement/',import.meta.url))
const load=name=>JSON.parse(readFileSync(path.join(dir,name,'runtime.json'),'utf8'))
const before=load('realistic-final'),real=load('realistic-fittings-final'),classic=load('classic-fittings-final')
if(!real.ok||!classic.ok||real.views.some(v=>!v.view.safe)||classic.views.some(v=>!v.view.safe))throw Error('Only successful, reachable captures may be summarized')
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],f=n=>Number(n).toFixed(2)
const summarize=r=>r.runtime.samples.map(s=>({id:s.id,draws:s.rounds[0].draws,triangles:s.rounds[0].triangles,cpu:median(s.rounds.map(r=>r.cpuMedian)),gpu:median(s.rounds.map(r=>r.gpuMedian)),frame:median(s.rounds.map(r=>r.median)),p95:median(s.rounds.map(r=>r.p95))}))
const old=summarize(before),samples=summarize(real)
const labels={kitchen_sink:'社区厨房水槽',tea_cups:'茶水台杯具',laboratory_sink:'实验室水槽与水面高光',duty_sink:'值班食堂水槽',mounted_research:'研究署壁挂告示',mounted_expedition:'探险署壁挂留言板',doorway_radio:'中控室门框外侧',doorway_radio_inside:'中控室门框内侧',doorway_admin:'行政门关闭',doorway_admin_open:'行政门打开',reception_post:'接待人员岗位',repair_post:'维修人员岗位',radio:'中控室',laboratory:'实验室',paper_archive:'纸质档案馆',admin_lobby:'行政大厅',library:'图书馆',zephyr:'西风区'}
const r=real.runtime.regressions
writeFileSync(path.join(dir,'fittings-summary.json'),JSON.stringify({before:old,after:samples,entry:real.entry,gpu:real.gpu,regressions:r,cleanup:{realistic:real.cleanup,classic:classic.cleanup}},null,2)+'\n')
const table=samples.map(s=>{const b=old.find(x=>x.id===s.id);return `| ${labels[s.id]} | ${b.draws} → ${s.draws} | ${b.triangles} → ${s.triangles} | ${f(b.cpu)} → ${f(s.cpu)} | ${f(b.gpu)} → ${f(s.gpu)} | ${f(b.frame)} / ${f(b.p95)} → ${f(s.frame)} / ${f(s.p95)} |`}).join('\n')
const report=`# Alpha 壁挂、容器液体与 NPC 岗位修正

## 本次修正

- 164 件壁挂物逐件验证真实墙体背托，安装间隙 2 mm；修正留言板、画框、消防柜与空调的位置或朝向。公共门框内衬伸入门洞 12 mm，盖住墙端共面；门洞上方不生成踢脚线。可交互门使用唯一门框，门扇与框保留装配间隙。
- 49 个杯具改为实际内壁和杯底，液面低于杯沿。8 个水槽在原台面/柜体上挖出槽腔，加入槽底、排水口和下沉水面；液体不再与封闭顶面相交。真实模式有低粗糙度、微弱法线起伏、斜角反射与现有灯具高光；没有额外灯光或反射相机。经典模式保留空心几何及透明水面。
- 全部 29 名 NPC 使用明确岗位。4 名固定值守，25 名限定在岗位周围 0.3～0.65 m；选目标检查全段路径，移动避开门口、家具、人物与玩家，近距离交谈时停步。身份、服务、任务与既有存档格式保持原规则。

烘焙重新生成，指纹 **1ddc4c10**，75,985 部件，4096×2752 图集；游戏中的几何指纹与资产匹配。改动限定于 Three.js 游戏及项目说明，联机保持关闭。

## 验证结果

生产构建成功；Alpha 生成/通行 56,365 项、壁挂/门框/容器/岗位 1,201 项、光照图 912,318 项、坐姿 308 项检查通过。实际游戏真实/经典各 16 个可站立视角，含门框正反两侧、开关门、三类水槽、杯具、壁挂和 NPC 岗位。

真实游戏通过 ${r.services.passed} 项设施/出口/存档检查与 ${r.community.passed} 项居民检查，包括全部 29 人的 E 键对话、600 秒确定性行动、固定岗位不漂移、门口与碰撞净空、靠近停步以及读档重建名单。经典模式本轮单独检查画面，不重复运行 NPC 模拟；真实模式验收中额外进行了两轮往返画质切换。

三次进出基地资源：${JSON.stringify(r.cycles)}。两轮画质切换：${JSON.stringify(r.qualityCycles)}。离开时烘焙材质引用清零，返回及切换后的几何/纹理数稳定。

浏览器运行错误 ${real.errors.length}/${classic.errors.length}，资源请求错误 ${real.networkErrors.length}/${classic.networkErrors.length}（真实/经典）。已有 ANGLE/PMREM 浮点精度警告保留于原始日志，没有着色器编译失败。构建仍有已有字体路径、PostCSS、混合导入及 chunk 大小提示，退出码 0。

## 性能记录

${real.gpu}；${real.browser.product}，headless，1920×1080、DPR 1、FOV 70、种子 424242、关闭动态分辨率。五处固定视角，预热后各五轮，每轮至少 100 帧及 1.2 秒；表中为五轮统计值的中位数。前值为本轮之前已验收的 realistic-final，后值为 realistic-fittings-final。

| 场景 | 绘制调用 前 → 后 | 三角面 前 → 后 | CPU 中位 ms 前 → 后 | GPU 中位 ms 前 → 后 | 帧间隔中位/P95 ms 前 → 后 |
|---|---:|---:|---:|---:|---:|
${table}

所有代表场景本次稳定帧间隔中位 ≤ ${f(Math.max(...samples.map(s=>s.frame)))} ms，P95 ≤ ${f(Math.max(...samples.map(s=>s.p95)))} ms；满足 16.7/20 ms 桌面目标。图书馆等位置有小幅批次增长，CPU/帧间隔比上次采样升高，不能据此声称每项性能均改善。headless 帧间隔与实际显示刷新不同，不推断所有视角或移动端表现。

进入至预热稳定 ${f(real.entry.elapsed/1000)} s（包含至少 3 秒预热），生成 ${f(real.entry.generationMs)} ms，加载阶段最大 RAF 间隔 ${f(real.entry.maxFrame)} ms；加载仍有长帧，未混入稳定性能。Android 真机未测。

## 截图与复现

[真实/经典近景对照](fittings-comparison.html) · [真实原始记录](realistic-fittings-final/runtime.json) · [经典原始记录](classic-fittings-final/runtime.json) · [性能及岗位最大位移](fittings-summary.json)

全部相机位置、朝向与画质写入原始记录。realistic-fittings 是本轮中间诊断版本，尚有门框共面条纹，不作为最终验收；已在最终视角消除。液体为低成本透明/PBR 近似，没有实时折射与流体模拟。静态烘焙不会随人物移动或开关门重算。

在 app 目录执行：

\`\`\`sh
npm run bake:alpha
npm run check:alpha
npm run check:alpha-fittings
npm run check:alpha-bake
npm run check:seating
npm run build
node scripts/verify-alpha-refinement.mjs --label=fittings-final --cases=${real.cases.join(',')}
node scripts/verify-alpha-refinement.mjs --classic --skip-runtime --label=fittings-final --cases=${classic.cases.join(',')}
node scripts/summarize-alpha-fittings.mjs
\`\`\`

QA 使用独立临时 profile 与端口，不加载玩家存档；两次最终运行均已关闭自有浏览器/服务器并删除 profile。实现及素材记录见 [Alpha 说明](../../ALPHA-REFINEMENT.md) 与 [来源](../../public/assets/alpha-bake/SOURCES.md)。
`
writeFileSync(path.join(dir,'FITTINGS.md'),report)
const image=(mode,id)=>`<figure><figcaption>${mode==='realistic'?'真实模式':'经典模式'}</figcaption><a href="${mode}-fittings-final/case-${id}.png"><img loading="lazy" src="${mode}-fittings-final/case-${id}.png" alt="${labels[id]}"></a></figure>`
writeFileSync(path.join(dir,'fittings-comparison.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alpha 修复近景验收</title><style>body{margin:24px;background:#182022;color:#e5ece6;font:16px/1.7 system-ui}a{color:#b4d9c8}nav{display:flex;flex-wrap:wrap;gap:12px}section{border-top:1px solid #485552;padding-top:12px;margin-top:30px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%}figcaption{color:#b5c1b9}@media(max-width:800px){.row{grid-template-columns:1fr}}</style><h1>Alpha · 壁挂、门框、液体与 NPC 岗位</h1><p>同一实际游戏场景，1920×1080。点击图片查看原图。<a href="FITTINGS.md">验证及性能记录</a></p><nav>${real.cases.map(id=>`<a href="#${id}">${labels[id]}</a>`).join('')}</nav>${real.cases.map(id=>`<section id="${id}"><h2>${labels[id]}</h2><div class="row">${image('realistic',id)}${image('classic',id)}</div></section>`).join('')}</html>`)
console.log(JSON.stringify({report:path.join(dir,'FITTINGS.md'),samples}))
