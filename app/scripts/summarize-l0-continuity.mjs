import {readFileSync,writeFileSync} from 'node:fs';
const dir=new URL('../reports/l0-remake/iteration-16/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,dir),'utf8'));
const base=read('baseline-v2-performance.json')[0],fixed=read('after-performance.json')[0],normal=read('after-normal.json'),regions=read('after-regions.json'),life=read('after-lifecycle.json'),continuity=read('continuity.json'),controls=read('controls.json'),preview=read('after-map-preview.json'),functional=read('after-functional.json');
const max=(rows,key)=>Math.max(...rows.map(r=>r[key]??0)),min=(rows,key)=>Math.min(...rows.map(r=>r[key]??Infinity)),f=x=>Number(x).toFixed(2),range=(rows,key)=>`${f(min(rows,key))}–${f(max(rows,key))}`;
const row=(label,data)=>`| ${label} | ${range(data.rounds,'median')} | ${f(max(data.rounds,'p95'))} | ${f(max(data.rounds,'cpuP95'))} | ${f(max(data.rounds,'gpuP95'))} | ${data.rounds[0].draws} | ${data.rounds[0].triangles.toLocaleString('en-US')} |`;
const all=[fixed,...normal,...regions],steady=all.every(s=>s.rounds.every(r=>r.median<=16.7&&r.p95<=20&&r.gpuP95!==null&&r.gpuP95<=20)),stable=life.every(x=>JSON.stringify(x.stats.memory)===JSON.stringify(life[0].stats.memory)&&x.stats.programs===life[0].stats.programs);
const lines=[
'# Level 0 第 16 轮验证（2026-10-07）','',
'## 已实施','',
'- 普通迷宫改为 8×8 错位单元的连通布局；生成时检查连接两条相对边界的任意直线，包括斜线。物资留口和红室门口净空先参与检查，失败时重新选择通路与格点，避免后续留口打通整区。展示种子原参考构图保留。',
'- 矩形灯具取消黑色罩壳，使用四根真实灯管和薄金属格栅。只有灯管发光；恢复 Level 0 的 HDR 泛光设置开关，取消重复灯晕。每盏矩形灯 420 三角面，仍按材质合批。',
'- 邻域建筑数据决定静态受光，墙角只输出实体并集外表面，墙底阴影改为连续过渡。熄灯保留原贴图，以局部照度降低暗处色度；手电恢复被照亮处的颜色，夜视和开发者照明显式覆盖。',
'- 原版地图增加开发者全开开关与右键安全传送；没有独立地图或开发者面板内地图。拖动与传送分开；远处预览在 worker 生成轻量记录，缓存上限 256 区块，不创建运行中的场景、物品或实体。',
'- 设置删除全层级启动预载，种子接受 XXXX-XXXX 或 uint32 十进制，只影响下一次新游戏。同种子重新开局不会误读原存档。',
'- 红室在原地图进行视野外物理封口，无独立世界、无循环传送。联机保持关闭，本轮未更新或执行联机检查。','',
'## 验证结果','',
`- 生成：${continuity.mazeSamples} 组基础迷宫、${continuity.finalMazeChecks} 组含物资/区域入口的最终迷宫通过防贯穿；${continuity.seed7391.archChecks} 处拱门与马尼拉间隔检查通过。平均 ${f(continuity.averageWalls)} 段墙。`,
`- 种子 7391 的 104,976 位置抽样：红室核心约 ${f(continuity.seed7391.weights.red/continuity.seed7391.weights.total*100)}%，熄灯核心约 ${f(continuity.seed7391.weights.blackout/continuity.seed7391.weights.total*100)}%；旧区块占比约 1.37% / 3.76%，统计口径并不完全相同。`,
`- 原版设置/地图交互 ${controls.checks.length} 项通过，浏览器错误 ${controls.errors.length}。远处 2048 米、${preview.span} 米视口生成 ${preview.cells} 个轻量区块，用时 ${f(preview.elapsedMs)} ms；取消过期请求、世界状态不变、失败传送回滚均通过。`,
`- 实际门柜、存档和 GPU 替换检查 ${functional.checks.length} 项通过。参考红室 ${functional.red.gates} 个开口最终全封闭；位置与世界对象不变，碰撞和画面同帧切换。`,
'- 生产构建、check:l0（种子/建筑/连续性/保存迁移/18 组网格）、八项共用模型/纹理/合批回归通过。细项见 [CPU 回归](shared-regressions.json)、[运行时检查](after-functional.json)、[地图检查](controls.json)。',
`- 五轮跨区、经典/真实模式与纹理质量切换：资源计数${stable?'稳定':'未稳定'}，每轮回到同一位置均为 ${life[0].stats.memory.geometries} 几何、${life[0].stats.memory.textures} 纹理、${life[0].stats.programs} 程序。见 [回收记录](after-lifecycle.json)。`,'',
'## 性能','',
'RTX 4060 Laptop / ANGLE D3D11，1920×1080、DPR 1、真实模式、高纹理、16 场景灯、2 场景阴影，关闭动态分辨率。独立无界面 Chrome，取消浏览器帧率上限；先完成所有可见区块、编译和回收，再取五轮，每轮至少 120 帧且 1.2 秒。RAF 是浏览器调度间隔，CPU 是 render 调用耗时，GPU 为 EXT_disjoint_timer_query_webgl2；不能把 RAF 倒数当作显示器实际帧率。','',
'| 场景 | RAF 中位数范围 ms | 最差轮 P95 ms | CPU P95 ms | GPU P95 ms | 绘制调用 | 三角面 |',
'|---|---:|---:|---:|---:|---:|---:|',row('修改前 v2 固定场景',base),row('当前固定场景',fixed),...normal.map(x=>row(`${x.pose.seed} @ ${x.pose.x},${x.pose.y}`,x)),...regions.map(x=>row(x.region,x)),'',
`本轮所测稳态场景${steady?'达到':'未全部达到'} 16.7 ms 中位数 / 20 ms P95 目标。密度与灯管细节增加后，固定场景绘制调用 ${base.rounds[0].draws}→${fixed.rounds[0].draws}、三角面 ${base.rounds[0].triangles.toLocaleString('en-US')}→${fixed.rounds[0].triangles.toLocaleString('en-US')}；没有声称总渲染成本下降。`,
'',
'优化内容是消除重复工作：遮挡候选按空间格缓存，射线矩形测试不再分配临时数组；毫米级灯具部件共用灯具受光样本；灯具构建分帧；材质仅按着色逻辑区分程序，纹理名不再触发重复编译。构建依然沿用有预算的队列、材质合批和实例回收。',
'',
`仍有限制：固定场景预热 ${f(fixed.warmup.elapsed/1000)} 秒、记录到的构建长帧 ${f(fixed.build.maxFrame)} ms；普通场景构建峰值 ${f(Math.min(...normal.map(x=>x.build.maxFrame)))}–${f(Math.max(...normal.map(x=>x.build.maxFrame)))} ms。首次全新浏览器编译/上传另曾记录约 1.58 秒长帧，不能宣称冷加载或切换全程满足 60 FPS。`,
'',
'一次测试期间浏览器即使停止绘制仍出现 38.2 ms 空帧下限；这批数据单独保存在 browser-throttled-* 与 [空帧诊断](browser-timing-diagnostic.json)，不作为游戏性能结果。基线和最终表格已在同一独立浏览器条件下重测。','',
'## 画面对照与边界','',
'- [十二参考图并排](reference-contact.jpg)、各 compare-*.jpg 和 overlay-*.png；实际相机参数见 [anchors](after-anchors.json)。',
'- [四灯管近景](after-detail-lamp.png)、[泛光关闭](after-lamp-bloom-off.png)、[泛光开启](after-lamp-bloom-on.png)。',
'- [普通迷宫近景](after-normal-7391-33-27.png)、[原版地图右键传送](original-map.png)、[种子设置](settings-seed.png)。',
'- [熄灯原景](after-blackout-dark.png)、[手电恢复颜色](after-blackout-flashlight.png)、[夜视](after-blackout-nightvision.png)；经典模式及背面手电见 *-classic.png / *-back-flashlight.png。',
'- GPU AO 回归确认斜平墙不产生假遮蔽，同时保留接触阴影；红室短暂失焦与低理智失焦取最大值，不叠加强模糊。',
'',
'主要参考构图、灯列、材质颜色已作对照，但没有宣称十二张图全部达到 3% 轮廓误差：红室整体亮暗、马尼拉家具在画面的投影以及部分柱距仍与原图不同。没有 Android 真机性能结论，也没有将历史全层性能结果充当本轮结果。','',
'## 复现','',
'从 app 目录运行 npm run check:l0 与 npm run build。设置 L0_VERIFY=1，启动 Vite 于 3004，独立 Chrome 配置以 9235 开启本机调试并打开 /verifier/l0-remake.html。设 QA_TAG=iteration-16；顺序运行 node scripts/verify-l0-remake.mjs after anchors、bloom、views、blackout、photo、focus、functional、map-preview、normal、regions、lifecycle。固定层基准设置 QA_LEVEL=0 后运行 baseline-v2 bench 和 after bench；不要同时运行构建或其他基准。UI 检查运行 node scripts/verify-l0-controls.mjs。最后运行 node scripts/summarize-l0-continuity.mjs 与 python scripts/compare-l0-references.py iteration-16。','',
'基线源代码保存在 .cache/l0-v2-baseline/src，本轮报告前的历史截图/报告在 ../iteration-16-before/。验证器使用独立内存存储；UI 自动检查使用独立浏览器上下文，不覆盖正常游戏存档。','',
'设计与素材来源见 [项目说明](../../../LEVEL0-REMAKE.md)、[素材许可](../../../public/textures/l0-remake/SOURCES.md) 和 [Bumper-Crop 思路记录](../../../BUMPER-LIGHTING.md)。此次只参考已保存的固定提交中缓存、队列和合批思路，未移植未经明确许可的源码或素材。',''
];
writeFileSync(new URL('REPORT.md',dir),lines.join('\n'));writeFileSync(new URL('summary.json',dir),JSON.stringify({steady,stable,maxRafP95:Math.max(...all.map(x=>max(x.rounds,'p95'))),maxGpuP95:Math.max(...all.map(x=>max(x.rounds,'gpuP95'))),scenes:all.length},null,2));
console.log('Wrote iteration-16 report. Steady target:',steady,'Resource stability:',stable);
