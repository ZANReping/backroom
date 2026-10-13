# Level 1 第十一轮：镜头方向与天鹰顶面构件

本轮继续校准真实场景，重点处理圆柱天鹰的比较镜头和天鹰顶面的管线。全部十八张参考均已复拍；[并排与 50% 叠加](comparison/thumbnails-1.png)直接使用实际渲染，没有后期透视变形、图像配准或调色。完整相机记录在 `final/actual-cameras.json`，展示种子仍为 `20261006`。

## 镜头校准

原圆柱天鹰只有两个点约束，不能充分确定相机的七个参数。新增第二、第三根立柱的柱脚和六条柱缘/纵向边线，并把原本读在柱身上的“柱顶”标记修正至柱梁连接位置 `(234,77)`；原始照片为 835×617，标注坐标保存在 `l1ReferenceCases.ts`，旧标注仍可见前轮报告。本轮 50 点与前轮 48 点不是完全相同的测量集，不比较通过率百分比。

圆柱场景相机改为相对中心 `(1.4838, 6.7814)`、眼高 `1.7504m`、yaw `0.1737`、pitch `-0.2386`、roll `-0.0462` 弧度、垂直 FOV `58.3555°`，使用原图画幅。机位净空已在实际运行检查。`camera-only/` 保留只改相机、尚未更新建筑的中间截图。

以同一组线标注回测旧/新实际镜头，平均绝对方向偏差由 `9.73°` 降至 `2.12°`，线端垂直误差上限由画面高度的 `5.72%` 降至 `1.22%`，见 `camera-direction-change.json`。这只是方向测量，不能证明墙柱、纹理或遮挡已匹配；最差一条顶面梁线仍有约 `5.14°` 的方向差异。

相机脚本通过齐次消失点增加方向约束，包含相机平移不改变消失方向、反转线端不改变绝对误差、消失点在无穷远等验证。今后可按照片继续补充方向线，而不依赖少数柱脚点拟合。

## 建筑与光照数据

- 用共享的 `l1ParkingServices` 替换天鹰旧的 4m 格点服务网格。细管、窄桥架、螺杆吊架与喷淋头按柱网连续生成，墙体处停止，区块边界只裁切长度。天鹰普通种子也使用同一套规则；没有按相机隐藏构件。
- 普通天鹰两根细主管位于顶板下约 17cm；参考图管线经已记录镜头反投影到真实顶面，结果在 `ceiling-calibration.json`。删除此前低垂的大型粗桥架。
- 圆柱参考区使用红色密集管架、圆/方交替柱列与真实走廊尽端隔墙；左侧保留可通行开口。渲染、碰撞、地图和受光均读取同一建筑数据，背面可达。
- 重新发布受影响的 99 份天鹰离线区块，全部 162 份现有烘焙文件指纹校验通过；建筑版本 4、烘焙算法修订 11、存档格式不变。缓存指纹随建筑内容更新。
- 沿用已记录许可的混凝土、金属与地面素材；没有新增位图资产、照片背景或实时灯。

## 验证

生产构建通过（最终 Vite 13.00s，`build.log`）。693 个区块的物资落点/身份/有限数值检查、462 个低/高档图集容量检查、80 组连通布局及 33 种布局变化检查通过。新增管线回归检查覆盖两种服务配置、正负区块接缝、实际墙体截断、有限尺寸与加载确定性。普通种子的服务配置不随整个区块的圆柱占比切换，避免新管线在区块边界突变。

独占 Chrome `--headless=new`、profile `.cache/l1-qa-chrome-9264`、CDP 9264、Vite 3013。十八张真实模式参考图和六张经典模式图均已输出。39 项单机机制、14 项照明/迁移与 9 项缓存检查通过，原生烘焙、手电、投出荧光棒和停电同步仍正常。控制台和运行异常见 `final/console-*.json`；每阶段成功状态见 `final/result-*.json`。

六场景各五轮，稳态中位数 5.9–6.0ms、P95 6.1–6.6ms；切区最高 RAF 808.1ms，仍未达标。四轮回收稳定为几何 326、纹理 117、程序 87、门洞绑定 7。完整稳态、持续移动和回收数据以[性能表](PERFORMANCE.md)及其原始 JSON 为准；不把稳态通过当作构建长帧已解决，也不作为 Android 真机结论。`git diff --check` 仍返回工作树不可用，未修改 Git 配置。

持续移动实测中位数 6.0ms、P95 11.1ms、最大 184.9ms，仍有构建长帧。普通种子区段交界三张实拍保存在 `final/detail/`；此处仍有明显的直线地面材质分界和拱顶接合问题，尚待后续修正。所有六个验证阶段的控制台/运行错误均为 0。清理首次自动审批超时未执行，重试成功：已核对并关闭本任务 Vite PID 19056，独占浏览器和端口均无残留，见 `cleanup.json`。

## 尚未达到参考的部分

[误差表](VISUAL.md)中 50 个稀疏点位于 3% 以内，仍不能作为全场景视觉验收。已检查全部十八组对照：阴暗天鹰的前景柱与箱体遮挡、光源位置和长阴影仍明显不同；普通天鹰仍缺少照片中柱脚磨损、右侧围挡和更细致的湿区；圆柱天鹰管架位置、局部灯具与地面杂物仍需校准。明亮/干净天鹰、小径顶部偏亮，衔尾陈设和材质、花园植被、哥特远景灯位仍有差异。整体“全部相似”尚未完成。

## 复现

在 `app` 目录启动独占服务：

```powershell
$env:L0_VERIFY='1'
npx vite --host 127.0.0.1 --port 3013 --strictPort
```

另一终端执行：

```powershell
$env:L1_QA_URL='http://127.0.0.1:3013'
$env:L1_QA_CDP='9264'
$env:L1_QA_REPORT='iteration-11/final'
node scripts/verify-l1-detail-runtime.mjs reference
$env:L1_QA_ANCHORS='parking-common,parking-round,parking-dim,storage,gothic,garden'
node scripts/verify-l1-detail-runtime.mjs refinement
node scripts/verify-l1-detail-runtime.mjs classic
node scripts/verify-l1-detail-runtime.mjs resources
node scripts/verify-l1-detail-runtime.mjs movement
node scripts/verify-l1-detail-runtime.mjs detail
$env:L1_QA_ITERATION='iteration-11'
Remove-Item Env:L1_QA_ANCHORS -ErrorAction SilentlyContinue
npx esbuild scripts/export-l1-v4-references.ts --bundle --platform=node --format=esm --outfile=.cache/export-l1-v4-references.mjs
node .cache/export-l1-v4-references.mjs
node scripts/compare-l1-v4.mjs
node scripts/check-l1-camera-directions.mjs
node scripts/summarize-l1-v4.mjs
npx esbuild scripts/check-l1-parking-services.ts --bundle --platform=node --format=esm --outfile=.cache/check-l1-parking-services.mjs
node .cache/check-l1-parking-services.mjs
npm run check:l1-refinements
npm run build
```

联机继续冻结，据点内部、`app-lite` 和其它工作区改动保留。QA 进程清理记录见 `cleanup.json`。
