# Level 1 第十二轮：摄影机方向、阴暗天鹰墙面与连续受光

本轮优先落实参考摄影机校准。普通天鹰和阴暗天鹰新增真实柱缘、横向管线、纵向管线的方向约束，联合调整位置、眼高、yaw、pitch、roll 与垂直 FOV。采用源图画幅、展示种子 `20261006`、固定渲染时间 15、关闭自动曝光，直接保存实际渲染；没有后期透视配准、拉伸或调色。圆柱天鹰作为未改镜头的回归对照。

## 摄影机与测量

相对各参考中心的最新相机参数如下，方向角单位为弧度。

| 场景 | X / Z（米） | 眼高（米） | yaw | pitch | roll | 垂直 FOV |
|---|---|---:|---:|---:|---:|---:|
| 普通天鹰 | -0.0573 / 9.3037 | 1.5884 | 0.3291 | 0.0868 | 0.0084 | 55.9277° |
| 阴暗天鹰 | 2.5322 / 11.1027 | 1.5005 | 0.0386 | 0.0216 | 0.0026 | 42.5875° |

相同标注对第十一轮记录机位与本轮实际机位重新投影：普通天鹰五条参考线平均绝对方向误差 `2.65° → 0.34°`，阴暗天鹰六条线 `25.16° → 0.22°`；线端垂直误差上限分别降至画面高度的 `0.24% / 0.17%`。圆柱天鹰维持上一轮 `2.12°`。记录见 [camera-direction-change.json](camera-direction-change.json)，基线来源显式保存在 `beforeFile`。

三个场景共 10 个稀疏标注点均在横纵 3% 内（普通/圆柱/阴暗最大分别 1.79%、2.07%、1.69%）。标注读取约有 1% 不确定性，点位和方向指标均不能证明完整视觉还原。实际矩阵、FOV、宽高比见 `final/actual-cameras.json`，18 个场景的标定配置见 `reference-data.json`，包含本轮新增导出的建筑模块与细墙数据。

[三组未经配准的并排及 50% 叠加](comparison/thumbnails-1.png)；[逐点误差表](VISUAL.md)。阴暗天鹰 `camera-only/` 保留仅修改相机、尚未修改建筑的中间截图，左侧大块前景柱遮挡通过真实机位变化解除。

## 实际场景修改

- 阴暗天鹰右侧增加 30cm 厚连续墙及转折，按绝对世界坐标裁切区块。使用正常建筑数据、烘焙与实体碰撞，背面可达；墙柱重叠时从建筑生成阶段避免重复实体。
- 增加第三种服务管架配置，主管、桥架和横档参与实际遮挡，调整管架高度和主灯安装位置、方向、功率及范围。灯具模型与烘焙源仍共用安装数据，没有额外实时灯或阴影贴图。
- 新墙两侧、转角和 Z=32 区块交界已通过实际 `canOccupy` 检查；地图视线止于细墙真实表面。13 项检查及正背面记录见 `final/partitions.json`、`back-check/`，背面另使用正常手电补拍。
- 经典模式复查发现密集构件挤占图集后，2m 地面/吊顶面片会降为单个中心光照样本，形成方格。现在宽大面片最低保留 2×2 端点样本，图集不足时走现有有界扩容。修复前图片保存在 `classic-before-sample-fix/`，修复后见 `classic-r12/` 及 `final/classic/`。
- 烘焙修订升级至 `12`，建筑生成版本仍为 4，存档格式不变。全部 18 视角共 162 块离线文件已重新生成并逐项验证版本、指纹及文件内容，压缩合计 105,897,746 字节。旧烘焙缓存不再命中。旧 r11 检查保存在 `checks-r11/`。
- 沿用已有开放许可纹理；本轮没有新增位图素材。联机保持冻结，据点内部及其它工作区更改保留。

## 验证与限制

462 个高/低档图集布局检查通过，覆盖 padding、最低连续采样、有限 UV、重复烘焙确定性；当前最大图集 512²，未越过 1024² 上限。三种管线配置的有限尺寸、确定性、正负区块接缝及墙体截断检查通过，693 个区块的物资落点与身份检查通过。

实际浏览器仅使用独占 Chrome `--headless=new`、profile `.cache/l1-qa-chrome-9264`、CDP 9264、Vite 3013。最终运行和性能数据见 `final/result-*.json`、[PERFORMANCE.md](PERFORMANCE.md)；日志保留已有 `PCFSoftShadowMap` 弃用提示，不能把“无运行错误”描述为“无任何警告”。本轮没有 Android 真机测试。

最终生产构建成功（Vite 24.59s，`build-r12.log`；保留既有大 chunk 提示）。r12 的 39 项单机机制、14 项照明/迁移、9 项缓存检查通过，真实/经典三个场景均已保存并人工查看。RTX 4060 Laptop、1080p、预热后三场景各五轮，稳态中位数为 4.2–5.4ms，P95 为 8.3–12.5ms。切区构建最大 RAF 804.2ms，仍未达到连续游玩的目标；本轮未重新测量长距离移动，不覆盖前轮 184.9ms 移动长帧的问题。`git diff --check` 仍因当前 Git 工作树配置返回不可用，未擅自修改配置。

四轮普通→圆柱→阴暗天鹰→经典→真实切换，几何计数为 252/265/265/265，纹理始终 103，程序始终 86，门洞绑定始终 4；第二轮后没有继续增长，不能描述成第一轮起完全相同。最终浏览器阶段运行异常和 console error 均为 0。进程所有权与独占端口清理见 `cleanup.json`。

本轮仅复拍三个重点参考场景；其它十五场景的最新完整对照仍在第十一轮，不计入本轮新的视觉通过项。观察到的剩余差异：普通天鹰顶面偏亮、主管的位置和湿区轮廓未完全对应；阴暗天鹰仍缺少参考中的长条地面阴影、右侧明暗条带及管架细节，前景板条箱依旧保留正常物资身份；圆柱天鹰墙灯与磨损/杂物分布仍不匹配。整体还原尚未完成。

## 复现命令

在 `app` 下启动独占服务器（端口冲突时使用空闲端口，并同步修改 `L1_QA_URL`）：

```powershell
$env:L0_VERIFY='1'
npx vite --host 127.0.0.1 --port 3013 --strictPort
```

另一个终端执行，验证结束后仅关闭自己启动的进程：

```powershell
$env:L1_QA_ITERATION='iteration-12'
$env:L1_QA_URL='http://127.0.0.1:3013'
$env:L1_QA_CDP='9264'
$env:L1_QA_REPORT='iteration-12/final'
$env:L1_QA_ANCHORS='parking-common,parking-round,parking-dim'
npx esbuild scripts/fit-l1-cameras.ts --bundle --platform=node --format=esm --outfile=.cache/fit-l1-cameras.mjs
node .cache/fit-l1-cameras.mjs
# 拟合仅输出建议，必须人工检查真实截图后才更改相机参数。
node scripts/verify-l1-detail-runtime.mjs reference
node scripts/verify-l1-detail-runtime.mjs partitions
node scripts/verify-l1-detail-runtime.mjs refinement
node scripts/verify-l1-detail-runtime.mjs classic
node scripts/verify-l1-detail-runtime.mjs resources
npx esbuild scripts/export-l1-v4-references.ts --bundle --platform=node --format=esm --outfile=.cache/export-l1-v4-references.mjs
node .cache/export-l1-v4-references.mjs
node scripts/compare-l1-v4.mjs
node scripts/check-l1-camera-directions.mjs
node scripts/summarize-l1-v4.mjs
npx esbuild scripts/check-l1-parking-services.ts --bundle --platform=node --format=esm --outfile=.cache/check-l1-parking-services.mjs
node .cache/check-l1-parking-services.mjs
npx esbuild scripts/check-l1-v4-placement.ts --bundle --platform=node --format=esm --outfile=.cache/check-l1-v4-placement.mjs
node .cache/check-l1-v4-placement.mjs
npx esbuild scripts/check-l1-atlas-capacity.ts --bundle --platform=node --format=esm --outfile=.cache/check-l1-atlas-capacity.mjs
node .cache/check-l1-atlas-capacity.mjs
npx esbuild scripts/check-l1-offline.ts --bundle --platform=node --format=esm --outfile=.cache/check-l1-offline.mjs
node .cache/check-l1-offline.mjs
npm run build
```

重建全部预计算文件：

```powershell
npx esbuild scripts/prebake-l1.ts --bundle --platform=node --format=esm --outfile=.cache/prebake-l1.mjs
node .cache/prebake-l1.mjs --anchors parking-common,parking-round,parking-room,parking-water,parking-bright,parking-clean,parking-dry,parking-dim,parking-dark,parking-props,storage,gothic,ouroboros,garden,path-corridor,path-room,crate,power-out --radius 1 --out iteration-12/offline-r12 --publish
```
