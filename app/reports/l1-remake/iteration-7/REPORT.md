# Level 1 第七轮：仓库、小径房间与哥特拱根

本轮继续调整真实建筑、相机和烘焙，重点是跃金仓库、小径侧房及哥特柱厅。**整体照片相似度仍未通过验收**；关键点重合不能替代全部轮廓、灯位、阴影和材料的检查。当前生成版本仍为 4、主存档与 L1WorldSave 版本仍为 1，联机保持冻结。

## 相机与对照

相机现在支持位置、眼高、偏航、俯仰、垂直 FOV 和小幅滚转。跃金与小径更换了错误或被遮挡的对应点；哥特补充右侧柱脚和起拱标记，避免仅凭近柱宽度拟合整个大厅。源图标记约有 1% 人工读取误差。三个共线柱脚不能唯一确定仓库相机，仍需梁线与灯位约束。

验收截图固定中性呼吸相位，消除加载等待造成的最多 8mm 眼高漂移。每张照片保存渲染器实际使用的相机位置、旋转、FOV、画幅和暂停状态，比较脚本优先使用这些实际参数。没有对游戏截图做后期透视配准、颜色匹配或裁切伪装。

全部十八组已重新截图并生成叠加。44 个已标注对应点中 40 个在横纵各 3% 内；哥特 3/5，最大 4.15%，箱子 0/2，最大 38.41%。仓库 0.12%、小径侧房 0.46% 是所选点的最大偏差，未覆盖所有梁线、开口、灯具和陈设。因本轮标记数量及部分对应关系已校正，不能把点数与第六轮直接换算成整体相似度提升百分比。

- [实际截图相机](final/actual-cameras.json)与[源图标记及建筑参数](reference-data.json)。眼高按摄影取景点记录，仓库约 0.357m、哥特约 2.254m，不把这些取景点描述为默认站立视高。
- [逐点误差及亮暗表](VISUAL.md)、[原始误差 CSV](comparison/landmark-errors.csv)。
- [跃金对照](comparison/storage-compare.png)、[哥特对照](comparison/gothic-compare.png)、[小径对照](comparison/path-room-compare.png)，每张依次为参考、游戏、原位置 50% 叠加。
- [参考截图](final/reference)、[普通种子](final/normal)、[经典模式](final/classic)。前三轮尝试保留在 pass-1、pass-2、pass-3；repair-check 是修复网格后、更新哥特相机前的截图；camera-candidate 是更新后的候选。

## 建筑、模型与材质

跃金仓库采用真实工字柱、纵向深梁、横向次梁、成对圆形风管与管箍。梁深与灯的悬挂高度共用模块参数，避免把灯埋进梁内；扩大展示柱网跨距并调整相机。金属吊顶采用 ambientCG CorrugatedSteel009，作者 Lennart Demes，CC0 1.0。保留原始 Color/NormalGL/Roughness 文件及可复现的 512² 处理脚本，法线缩放后重新归一化。[完整来源和修改记录](../../../assets/sources/CorrugatedSteel009/SOURCE.md)。

小径侧房改为狭长主室与右侧凹间，白刷墙的归属按实际房间边界切分。房间建成后才摆放两把旧椅、空调外机、告示牌和油漆桶，避免旧地图的落点检查提前丢失陈设。座椅降低靠背总高度，外机补上风扇、护圈、螺钉，油漆桶具备盖口与提手；均复用普通种子陈设。初始散落物资避让有陈设的房间及 1.75m 入口周边，保留 ID 和数量；不限制玩家主动丢弃物品。

哥特拱根按真实圆柱截面裁切。此前二维覆盖面积正确，但多边形内部存在 T 接点：新增顶点的高度不落在邻边的线性插值上，因此在三维中形成三角裂缝。本轮将这些点插入两侧边界，再以中心扇形三角化保留所有分段。高档 24 边、低档 12 边均检查覆盖面积及三维边高连续性；实际截图确认原裂缝消失。曲面和柱身的颜色、粗糙度及法线采用世界尺度三向投影，照明继续使用独立 UV1，不把表面纹理挤在水平投影里。

烘焙修订升为 r10，发布数据包含全部 18 个参考、162 个区块。离线读取先校验烘焙修订，避免下载并解码已经过期的数据；哥特网格修订另计入建筑内容指纹。当前 gzip 总量为 117,834,210 字节，逐个解压检查当前建筑指纹，不只核对 manifest 行数。

## 验证及未达标项

实际运行检查包括 39 项单机机制、14 项静态照明/停电/便携光源/迁移检查及九项缓存传输检查，日志位于 final。几何与陈设变更后另运行 693 个区块的物资落点回归、房间陈设/实例释放、拱根边界及全部离线文件校验。生产构建日志单独保存为 [build.log](build.log)。这不等于完成原计划所有验收。

当前稳态性能范围、五轮原始数据与构建峰值见 [PERFORMANCE.md](PERFORMANCE.md)。第六轮仍存在天鹰/小径 P95、持续移动长帧等未达标项；本轮没有以局部稳态通过覆盖这些结果，也没有声称 Android 真机达标。

本轮最终正式采样覆盖仓库和哥特各五轮：RTX 4060 Laptop / Chrome 154 / 1080p，仓库中位数 4.2–12.5ms、P95 8.4–16.7ms；哥特中位数 4.2ms、P95 4.3–8.3ms。两者稳态通过，但跨区构建最大 RAF 分别为 454.2ms、320.7ms，仍明显超出帧预算。哥特相机/FOV及几何已变，不能用与旧数据的绘制量差直接声称性能优化比例。此前网格修复前的采样保留于 pre-vault-repair，最终表仅使用最新 performance 运行。未在本轮重做六区完整性能、长距离移动和四轮资源回收，沿用第六轮的未通过状态。

| 场景 | 仍需修正的差异 |
|---|---|
| 跃金 | 参考柱列与主梁方向更接近；顶面亮条过强，管架、灯位、地面斑驳及墙面细节仍不同。共线标记不足以证明整幅构图通过。 |
| 哥特 | 裂缝已修复，远近柱网取景更接近；右侧起拱点仍有约 4% 偏差，拱曲率、柱身/拱根烘焙明暗接缝、侧向阴影、灯位和停车线仍不匹配。 |
| 小径侧房 | 后墙透视、双椅及右侧设备已对应；椅面仍偏方，墙面过亮且过净，近处灯管、右侧门柱、告示文字及地面粗糙度仍不同。 |
| 其余参考 | 本轮复拍用于回归；未把第六轮记录的湿区、管线、花园植被、双箱叠放及施工细部差异标记为已完成。 |

原计划的相邻安装屏障、更多轮廓/灯位标记、花园分级细节以及移动构建尖峰仍待继续。地图预览、存档迁移、停电权重及便携光源机制沿用现有 v4 实现。

## 失败记录与复现

pass-2 的哥特统一增密尝试使单块烘焙接近 18 秒并触发 120 秒预热看门狗，故退回仅对陡曲面增加采样；超时不计为通过。repair-check 首次 Chrome 受沙箱 crashpad 限制未启动，保留 failure-reference.json；随后的隔离无头检查成功。Vite 沙箱 realpath 的 EPERM 单独保留为 build-sandbox-error.log，未归类为项目编译错误。

使用本任务独占 Vite 3013、CDP 9264、`.cache/l1-qa-chrome-9264`；实际启动参数含 `--headless=new`。没有接入日常浏览器，也未使用内置浏览器。工作目录为 app：

结束时按 PID 及完整命令确认并关闭本任务服务器，无剩余专属 Chrome 进程，见 [cleanup.json](cleanup.json)。

```powershell
$env:L0_VERIFY='1'
npm run dev -- --host 127.0.0.1 --port 3013 --strictPort
# 另一个终端
$env:L1_QA_URL='http://127.0.0.1:3013'
$env:L1_QA_CDP='9264'
$env:L1_QA_REPORT='iteration-7/final'
$env:L1_QA_ITERATION='iteration-7'
node scripts/verify-l1-detail-runtime.mjs capture
node scripts/verify-l1-detail-runtime.mjs classic
node scripts/verify-l1-detail-runtime.mjs refinement
npm run check:l1-vault-mesh
npm run check:l1-room-dressing
npm run check:l1-offline
npm run check:l1-bake -- --high
node scripts/compare-l1-v4.mjs
node scripts/summarize-l1-v4.mjs
npm run build
```

`refinement` 包括单机机制、v4、缓存及稳态性能。`L1_QA_ANCHORS` 可筛选参考截图和稳态性能，但不会跳过机制回归；未设置时覆盖默认六区。性能采样应独占运行，不与构建或离线烘焙并发。重新生成标定数据使用 scripts/export-l1-v4-references.ts 的 esbuild 命令，重烘焙使用 `npm run prebake:l1 -- --anchors ... --radius 1 --out iteration-7/offline --publish --merge`。
