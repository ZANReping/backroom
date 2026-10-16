import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const app=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(app,'reports/alpha-refinement')
const load=name=>JSON.parse(readFileSync(path.join(dir,name,'runtime.json'),'utf8'))
const before=load('realistic-before'),after=load('realistic-final'),classic=load('classic-final')
if(!before.ok||!after.ok||!classic.ok)throw Error('Only successful runs may be summarized')
const refs={
 radio:['探险署/中控室.jpg','中控室','机柜扬声器、操作台接线、五辐转椅与门框；台下遮挡与柜内暗部。'],
 meeting:['探险署/会议室.png','会议室','层压板桌面、桌腿横撑及轻微错位；白色地砖和暖灰墙面。'],
 storage:['探险署/贮存室.jpg','贮存室','开口蓝灰周转箱、钢架底脚、编号标签和通行间距。'],
 dorm:['探险署/探险署卧室.png','探险署卧室','木护墙、床褥、白色隔柱与床边用品；暖色受光、较暗木顶。'],
 laboratory:['研究署/实验室与检测室.jpg','实验室','连续排风软管、管道吊架、托盘与试管架；台下及吊柜阴影。'],
 office:['研究署/办公室.png','研究署办公室','蓝色上柜、工位接线和插座；冷色地板与中性灯光。'],
 specimens:['研究署/贮藏间.jpg','样本贮藏间','标号容器、托盘货架、抽屉；标签可读性与架内遮挡。'],
 archivists:['档案署/办公室.jpg','档案办公室','桌面电脑和纸张、隔断、绿色转椅；材质粗糙度与细节。'],
 tech:['档案署/技术支援部门.png','技术支援部门','U 型工作台、键盘电话、落地线缆与五辐椅脚。'],
 paper_archive:['档案署/纸质档案馆.jpg','纸质档案馆','连续抽屉、拉手和编号；纵深、地面与柜底接触暗部。'],
 admin_lobby:['行政署/行政部门.jpg','行政接待','等候椅、接待台、门洞收口与地砖边带；柔和槽灯。'],
 assembly:['行政署/大会厅.png','大会厅','台阶、中央过道、成排座椅与投影；座下阴影。'],
 trade:['行政署/贸易中转站.jpg','贸易中转站','货架、纸箱封箱带、运输标签及推车；货物之间的遮挡。'],
 mushrooms:['生活区/菌菇种植.jpg','菌菇种植','深色培养块、岩质墙壁与维护通道；较低照度环境。'],
 library:['生活区/图书馆.jpg','图书馆','连续书架、红色吊顶、筒灯与奶油色柱；共享图集和合批。'],
 zephyr:['生活区/西风区.png','西风区','浅色上墙、木护墙、走廊管线与门框；连续板缝及纵深。'],
}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],f=n=>Number(n).toFixed(2)
const rows=r=>r.runtime.samples.map(s=>({id:s.id,draws:s.rounds[0].draws,triangles:s.rounds[0].triangles,cpu:median(s.rounds.map(x=>x.cpuMedian)),gpu:median(s.rounds.map(x=>x.gpuMedian)),frame:median(s.rounds.map(x=>x.median)),p95:median(s.rounds.map(x=>x.p95)),gpuP95:median(s.rounds.map(x=>x.gpuP95))}))
const a=rows(before),b=rows(after),c=rows(classic)
const summary={before: {entry:before.entry,samples:a},after:{entry:after.entry,samples:b},classic:{entry:classic.entry,samples:c},regressions:{realistic:after.runtime.regressions,classic:classic.runtime.regressions}}
writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n')
const table=a.map((x,i)=>{const y=b[i];return`| ${refs[x.id][1]} | ${x.draws} → ${y.draws} | ${x.triangles} → ${y.triangles} | ${f(x.cpu)} → ${f(y.cpu)} | ${f(x.gpu)} → ${f(y.gpu)} | ${f(x.frame)} / ${f(x.p95)} → ${f(y.frame)} / ${f(y.p95)} |`}).join('\n')
const viewTable=Object.entries(refs).map(([id,[file,name,notes]])=>`| ${name} | [原参考](../../reference/Alpha/${file}) | [之前](realistic-before/case-${id}.png) / [真实](realistic-final/case-${id}.png) / [经典](classic-final/case-${id}.png) | ${notes} |`).join('\n')
const report=`# Alpha 基地细化验收

## 结果与范围

已核对布局图和 16 张室内参考，保留原有房间功能与通路，以实际游戏模型完成离线光照、家具细节及材质调整。真实/经典各 16 个固定视角、手电叠加、设施交互、居民对话、旧档迁移、画质切换及进出基地检查完成。图片为实际地图渲染，未用参考照片作背景或材质；这是空间与视觉特征还原，不是逐像素照片复刻。

生产构建通过。Alpha 通行/摆放 56,367 项、坐姿 308 项、实例颜色 747 项检查通过；光照图 934,470 项检查通过，真实机柜墙面阻挡、门洞透光及台面/台下明暗关系成立。

## 桌面性能

设备：${after.gpu}。${after.browser?.product??'Chrome headless'}，1920×1080、像素比 1、FOV 70、固定种子 424242；关闭动态分辨率，关闭验证画面颗粒、摇晃和全局闪烁。每个位置先等待资源与编译稳定，再采样五轮，每轮至少 100 帧且至少 1.2 秒。表格取五轮各项统计的中位值，原始逐轮记录保留在 JSON 中。

| 场景 | 绘制调用 前 → 后 | 三角面 前 → 后 | CPU 中位 ms | GPU 中位 ms | 帧间隔 中位/P95 ms 前 → 后 |
|---|---:|---:|---:|---:|---:|
${table}

帧间隔受 headless Chrome 刷新节奏影响，与 CPU、GPU 计时分开报告。此次所有代表场景的稳定帧间隔中位/P95 都低于 16.7/20 ms；不将此结果表述为所有设备、所有视角的帧率保证。经典模式数据见 [经典原始数据](classic-final/runtime.json)。Android 真机及移动端触控均未实测。

初次进入至预热稳定：${f(before.entry.elapsed/1000)} s → ${f(after.entry.elapsed/1000)} s（该计时含至少 3 秒预热等待，并非可操作时间）。地图生成 ${f(before.entry.generationMs)} → ${f(after.entry.generationMs)} ms；加载期间最大 RAF 间隔 ${f(before.entry.maxFrame)} → ${f(after.entry.maxFrame)} ms。加载阶段仍存在明显长帧，不计入稳定游玩帧时间。

首次完整巡视后的资源：几何 ${before.runtime.samples[0].rounds[0].memory.geometries} → ${after.runtime.samples[0].rounds[0].memory.geometries}，纹理 ${before.runtime.samples[0].rounds[0].memory.textures} → ${after.runtime.samples[0].rounds[0].memory.textures}。实例专用光照坐标增加了几何对象，但色差合批与标牌图集减少提交和纹理。几何计数不是显存字节数；新光照图单份 GPU RGBA 约 44.3 MiB，CPU 解码图与面坐标保留一份供返回时使用。

真实模式三次进出后资源：${JSON.stringify(after.runtime.regressions.cycles)}；两轮往返画质后：${JSON.stringify(after.runtime.regressions.qualityCycles)}。经典模式对应记录也稳定。已验证离开 Alpha 后烘焙材质引用归零、返回后恢复，固定灯不更新阴影、手电照明保持有效。

## 参考与截图

[三栏对照页面](comparison.html)包含原参考、改造前与改造后，可点击原图查看。逐图位置、朝向、FOV、几何指纹和可站立性记录在 [真实模式 JSON](realistic-final/runtime.json) 与 [经典模式 JSON](classic-final/runtime.json)。布局依据：[基地布局](../../reference/Alpha/alpha基地布局.png)。

| 场景 | 参考 | 游戏截图 | 核对重点 |
|---|---|---|---|
${viewTable}

补充：[真实模式手电](realistic-final/condition-flashlight.png)、[经典模式手电](classic-final/condition-flashlight.png)。木墙在第一轮细化截图中仍有亚像素条带断续，最终版本改用导数抗锯齿板缝，恢复木纹层次并减少 7,425 个部件。

## 交互、兼容与限制

每种模式分别通过既有 Alpha 67 项设施/出口/存档检查、100 项居民/社区检查。覆盖服务家具可达、三处基地出口、历史布局迁移保留背包/职业/声望、当前布局位置恢复及移动。各最终拍摄位置均可站立。没有更改任务数值、准入和多人功能。

烘焙为固定场景有遮挡直接光加一次漫反射近似，小五金使用低频面光照；动态人物与开门不会更新整张间接光图，手电继续实时照明。低成本模型仍保留简化轮廓，参考照片的具体物品数量、随机杂物和光学细节不作逐像素保证。

最终浏览器错误 ${after.errors.length}/${classic.errors.length}，资源请求错误 ${after.networkErrors.length}/${classic.networkErrors.length}（真实/经典）。若原始 JSON 中出现 ANGLE/PMREM 的浮点常量精度警告，属于驱动编译提示，未出现 shader 失败。构建仍报告已有字体路径、PostCSS、L11 混合导入及大 chunk 提示，构建退出码为 0。

## 复现与文件

参见 [实现及命令](../../ALPHA-REFINEMENT.md)。运行：

\`\`\`sh
npm run check:alpha
npm run check:alpha-bake
npm run check:seating
npm run check:instance-colors
npm run build
node scripts/verify-alpha-refinement.mjs --label=final
node scripts/verify-alpha-refinement.mjs --classic --label=final
node scripts/summarize-alpha-refinement.mjs
\`\`\`

脚本使用独立 QA 配置、端口和真实 headless 浏览器，结束后清理；不读取玩家存档。基线保存在 realistic-before，最终验收为 realistic-final/classic-final；其他目录为迭代诊断，不计作最终成绩。
`
writeFileSync(path.join(dir,'REPORT.md'),report)
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
const img=(src,label)=>`<figure><figcaption>${label}</figcaption><a href="${encodeURI(src)}"><img loading="lazy" src="${encodeURI(src)}" alt="${esc(label)}"></a></figure>`
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alpha 基地参考对照</title><style>body{margin:24px;background:#161d21;color:#e3e9e7;font:16px/1.7 system-ui}h1{font-size:28px}h2{margin-bottom:4px}a{color:#a9d5c6}nav{display:flex;gap:12px;flex-wrap:wrap}section{border-top:1px solid #3a484b;margin-top:30px;scroll-margin-top:20px}.row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}figcaption{font-size:14px;color:#b5c2bf}img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#0d1114}p{color:#b5c2bf;max-width:1200px}@media(max-width:900px){.row{grid-template-columns:1fr}}</style><h1>Alpha 基地 · 参考 / 改造前 / 改造后</h1><p>使用实际游戏固定取景，1920×1080。参考照片的画幅不同，完整显示；点击图片可看原尺寸。<a href="REPORT.md">性能与验证记录</a> · <a href="../../reference/Alpha/alpha基地布局.png">基地布局</a></p><nav>${Object.entries(refs).map(([id,[,name]])=>`<a href="#${id}">${name}</a>`).join('')}</nav>${Object.entries(refs).map(([id,[file,name,notes]])=>`<section id="${id}"><h2>${name}</h2><p>${notes} <a href="classic-final/case-${id}.png">经典模式</a></p><div class="row">${img('../../reference/Alpha/'+file,'用户提供参考')}${img('realistic-before/case-'+id+'.png','改造前')}${img('realistic-final/case-'+id+'.png','最终真实模式')}</div></section>`).join('')}</html>`
writeFileSync(path.join(dir,'comparison.html'),html)
console.log(JSON.stringify({report:path.join(dir,'REPORT.md'),samples:b}))
