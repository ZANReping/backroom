# Level 1 第九轮：哥特柱网比例、机位与烘焙开销

本轮基线为 `../iteration-8/final/reference/` 中实际生成的十八张截图。用户要求继续校准摄像角度，当前同时检查机位与真实建筑比例，不以改变源图标记位置或后期图像变形来通过比对。

## 本轮修改

- 哥特段单独调整机位仍无法同时吻合近柱宽度、远柱高度。联合拟合柱径、起拱高度、位置、FOV 和姿态，限制滚转，保留源图上的五个标记位置；对应世界坐标随真实建筑更新。采用柱径 0.794m、起拱 1.7184m，机位与模块统一保存在 `l1ReferenceCases.ts`。实际截图相机对应的标记点最大误差 2.29%，局部轮廓及明暗差异另行保留。
- 哥特柱身与拱面复用已有混凝土纹理，通过同一世界坐标投影增加不规则污损及施工接缝。停车线复用已有 CC0 磨损地面扫描，降低均匀亮白的条带感；没有增加贴图下载或生成素材。
- 光照烘焙的直接可见性查询在首次碰撞后停止；漫反射传递仍查询最近命中。三份真实高/低档建筑的网格、光照、方向、门洞权重及探针 SHA-256 与修改前逐字节相同。单次 Node CPU 诊断中烘焙从 3679→2229ms、3574→1608ms、473→344ms；这是诊断采样，不是五轮浏览器帧时间结论。数据保存在 `visibility-baseline.json` 和 `visibility-optimized.json`。
- 第二次实际截图使圆柱角向明暗条带更加明显。根因是窄面贴图块退化为单个角向采样；现在圆柱侧面至少保留两个角向端点，真实/经典四组圆柱检查覆盖 1584 条共享边，端点照度最大差值为 0。烘焙版本升为 11，重新生成全部 162 份展示区块，旧结果由版本校验拒收。
- 直接可见性优化另以当前 r11 算法和关闭提前返回的同版算法作差分，加入哥特曲面场景，共四份结果的全部数组/探针逐字节相同，见 `visibility-r11-baseline.json` 与 `visibility-r11-optimized.json`。该诊断与离线任务并行，耗时只能辅助定位，不能声称标准化速度增幅。

## 复现

```powershell
# app 目录
node scripts/check-l1-bake-visibility.mjs
npm run check:l1-vault-mesh
```

## 当前实际验证

`final/result-capture.json` 通过：十八个固定参考视点、普通种子 1/42/7391 的六个跨区视点，以及五个经典模式场景全部由独占无头 Chrome 实拍；运行异常和控制台错误为 0。本轮没有放宽 120s 预热超时；此前未完成的普通种子冷加载已完成，但这不等于首次进入或移动帧时间达标。

十八组当前截图和叠加图见 `comparison/`。48 个稀疏对应点都进入 3% 范围；已人工查看全部三张联系表及重点单图。仍明显不相似之处包括：普通天鹰湿区面积和反射、圆柱天鹰管线与前景物资、明亮/干净天鹰的远景墙柱、阴暗天鹰的侧向投影、哥特灯位与近柱污损、跃金钢梁/灯盘、衔尾施工陈设、花园植被密度、小径材质磨损及箱堆背景。标记点只是已标注特征，不能代表这些缺项已经通过。

高低档圆柱照明连续性、462 组图集、693 个区块的落点、80 个连通布局案例、低档 UV/有限值/17 条受光接缝及 162 份 r11 离线资源校验通过。最终构建、性能及受光/存档回归见下面的已验证状态，尚不能宣称全部相似。

## 第九轮已验证状态（2026-10-09）

本轮实际验证已完成，但总体还原仍未完成。`build.log` 记录生产构建成功，Vite 用时 13.80s；`final/result-classic.json`、`result-performance.json`、`result-movement.json` 与 `result-resources.json` 均通过。单机行为 39 项、照明/迁移 14 项及缓存相关的 `final/runtime.json`、`final/v4-runtime.json`、`final/bake-transport.json` 检查通过。

六个代表区各五轮稳态帧时间中位数为 4.2ms、P95 为 4.3ms；切区阶段最高 RAF 为 416.5ms。持续移动中位数为 4.2ms、P95 为 12.5ms、最大值为 221ms。四轮资源稳定为几何 322、纹理 117、程序 87，门洞绑定为 7。48 个稀疏标记点在 3% 内不能代表全图通过，现有视觉差异清单继续保留。

新增 GPU 原生点光跳过计算的检查；同场景 shader A/B 在同一浏览器内对三张图逐像素完全一致，结果见 `shader-ab-output-compare.json`。原跨进程对照的 `shader-output-compare.json` 因橙色物品随机旋转造成小区域差异而失败，原始报告保留，像素差阈值未改。CPU 可见性优化的 SHA 一致记录也保留。

复现（工作目录为 `app`，使用本轮独立服务和 CDP）：

```powershell
$env:L1_QA_URL='http://127.0.0.1:3013'
$env:L1_QA_CDP='9264'
$env:L1_QA_REPORT='iteration-9/final'
node scripts/verify-l1-detail-runtime.mjs classic
node scripts/verify-l1-detail-runtime.mjs performance
node scripts/verify-l1-detail-runtime.mjs movement
node scripts/verify-l1-detail-runtime.mjs resources
node scripts/verify-l1-detail-runtime.mjs refinement
$env:L1_QA_REPORT='iteration-9/shader-ab'
node scripts/verify-l1-detail-runtime.mjs shader-ab
node scripts/compare-l1-shader-output.mjs --same-scene
npm run build
```

上述 `verify-l1-detail-runtime.mjs` 子命令须分别执行；A/B 输入位于 `reports/l1-remake/iteration-9/shader-ab`，阶段名为 `shader-ab`。还原差异与长帧问题仍未完成，联机继续冻结。
