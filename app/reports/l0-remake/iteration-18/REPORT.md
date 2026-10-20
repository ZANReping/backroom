# Level 0 第 18 轮：生成间距、墙体和地图（2026-10-07）

本轮只修改 app 和根项目说明。联机保持关闭；没有新增或验收联机要求。沿用既有纹理及许可记录，没有新增外部模型或生成图像。

## 对应本轮十四项要求

1. 停止生成 Level 0 补给箱；仍消耗原随机抽样步骤，避免后续散落物品身份/抽样改变。马尼拉柜内固定补给保留。
2. 碰撞改为实际身体高度相交，脚底仅接触井壁顶面不构成穿入。五方向实走均能下落，保留跳跃与致命坠落。
3. 出口在原有不透明墙体材质中调制自发光，墙纸 UV、法线和几何连续。构建时计算遮挡后的受光基值，运行时与墙面同步闪烁；周边地面和墙面响应。不添加透明贴片、灯池数量或额外渲染遍数。该照明是静态遮挡基值加动态强度，不能冒称实时 GI。
4. 黄室装饰线距地 18cm、高 2.5cm，按完整相连墙组以约 12% 概率选取，包含转角和窄端面。超过 28m 的相连墙网不生成，以确保确定性邻域能覆盖整组，避免加载边界截断选择。
5. 拱门柱漆色提亮为 #d9ceb0，按参考保留浅卡其。横向内墙移到实心支柱处相接，不再穿过拱洞；使用同一碰撞数据。
6. 图例仅保留在大地图，小地图下方不显示图例。
7. 标准大小地图和 Alpha 地图共用方向箭头、浅色视野扇形；扇形角度读取相机实际水平 FOV。前方开图半径 8m，近身环 1.6m，Level 0 用精确线段/薄墙相交遮挡。已探索记录保留，原本全开的据点保持全开。大地图独立容器尺寸测量，首次打开即为可用最大宽度（桌面上限 480px）。
8. 标准矩形灯仍为 1.05×0.6m、四根管，直径恢复 44mm，中心距 110mm；格栅随之调整，保持 420 三角面和有效泛光。
9. 迷宫正交墙端点统一到接点外沿，消除原 12cm 凸口；继续仅生成实体并集的外露面，不叠加墙盒。
10. 马尼拉四面内墙各增加一组插座，避开门洞；红室内不生成插座。
11. 拱门地毯最大减速 10%，红室最大减速 40%，随区域权重连续过渡。
12. 地图先读取当前活跃窗口，远处结果有上限缓存；后台按 6ms 预算批处理，取消过期任务。预览不创建运行中实体，不更改探索或世界状态。
13. 深坑候选按世界坐标确定性优先级稀疏化，禁止正交或斜角邻接。
14. 256×256m 区域最多保留一个原有马尼拉候选，并对相邻大区域做至少 256m 的切比雪夫中心间距约束。展示房间优先保留。保留存续房间的物件身份和原红室围墙位置，避免读档改变已封闭红室。被新墙覆盖的旧掉落只移到同区块、同红室内的近邻安全点。

## 验证

- 新检查：16900 个区域、89 间马尼拉、1052 片深坑；96 个区块无补给箱，1000 组装饰线选择、3 处跨区块连接、四个马尼拉插座、零红室插座、五向落坑、跳跃和视野开图通过。见 [记录](refinements.json)。
- 现有 check:l0 的生成、存档、封口、18 组材质/模型检查通过。新增 check:l0-refinements 已纳入 check:l0。生产构建通过；仍有原有大包、字体路径及 Browserslist/PostCSS 警告。
- UI 20 项通过，浏览器错误 0；覆盖首次尺寸、拖动、右键传送、地图全开与小地图无图例，另检查 Level 1、Level 4、Alpha 地图。
- 实际门柜、搜刮、存档、封口和闪烁墙出口交互 47 项通过。没有靠独立出口贴片提供交互。
- 出口明灭对照 331788 个像素改变，其中画面下部 154946 个像素响应；另有遮挡基值测试确认墙背面不受光。
- 当前窗口 0.30ms；首次远处 120m 视口 475.90ms；重复命中缓存 0.00ms。2048m 外、256m 视口 81 块 867.50ms，取消及失败传送回滚通过。远处首次生成仍需数百毫秒，不能把缓存命中时间当成冷加载时间。
- 地图 CPU 单次绘制：mini 中位 0.80ms / P95 1.60ms；large 中位 1.70ms / P95 2.80ms。开图读取提速不代表每次画布重绘都同幅度提速。

## 性能

RTX 4060 Laptop / ANGLE D3D11，1920×1080、DPR 1、真实模式、纹理高、16 场景灯、2 场景阴影、关闭动态分辨率。独立无界面 Chrome 关闭帧率上限。每场预热至区块、编译、回收完成并稳定一秒，各采五轮、每轮至少 120 帧/1.2 秒。以下为固定场景渲染，RAF、CPU、GPU 分列；不等于所有游戏逻辑或 Android 真机性能。

| 场景 | RAF 中位范围 ms | RAF P95 最大 | CPU P95 最大 | GPU P95 最大 | 绘制调用 | 三角面 |
|---|---:|---:|---:|---:|---:|---:|
| yellow | 1.40–1.70 | 4.50 | 4.20 | 4.34 | 156 | 300151 |
| arch | 1.50–1.60 | 3.70 | 3.50 | 3.96 | 155 | 235267 |
| 柱厅 | 1.10–2.80 | 5.40 | 4.40 | 7.34 | 106 | 236931 |
| pits | 1.70–2.20 | 19.10 | 23.50 | 7.90 | 152 | 293223 |
| blackout | 1.60–1.70 | 15.90 | 15.60 | 6.90 | 120 | 266185 |
| red | 1.40–1.50 | 18.20 | 18.60 | 6.80 | 133 | 247619 |
| manila-inside | 1.80–2.50 | 20.00 | 27.20 | 8.07 | 136 | 249037 |
| sealed-red | 2.10–2.30 | 5.80 | 5.30 | 5.19 | 171 | 245719 |
| 7391 @ 16,16 | 4.40–5.50 | 6.20 | 5.80 | 7.26 | 160 | 288089 |
| 7391 @ 29,27 | 2.30–3.10 | 9.60 | 6.30 | 6.80 | 193 | 250755 |
| 7391 @ 33,27 | 2.80–6.80 | 10.30 | 8.50 | 8.47 | 191 | 247091 |
| 7391 @ 64,46 | 2.00–2.10 | 10.50 | 10.10 | 6.50 | 194 | 231151 |
| 781 @ -32,-16 | 1.70–1.90 | 19.10 | 21.00 | 7.26 | 154 | 248263 |
| 42561 @ 48,31 | 1.90–2.00 | 19.00 | 20.30 | 7.72 | 178 | 265649 |

RAF/GPU 稳态阈值（中位≤16.7ms、P95≤20ms）：通过。CPU render P95 最大 27.20ms，部分轮次超过 20ms，不能据此宣称全程稳定 60 FPS。五轮切换与回收：资源稳定；最终 188 几何、59 纹理、77 程序。普通地图冷构建最大帧 372.90ms，冷构建仍会有长帧。

## 截图与复现

- [拱门参考角度](after-arch-reference.png)、[接点](after-arch-joint-realistic.png)、[末端](after-arch-end-realistic.png)、[灯具泛光](after-lamp-bloom-on.png)。
- [出口暗相](after-wall-exit-off.png) / [出口亮相](after-wall-exit-on.png)，位置与相位见 after-refinements.json。
- [马尼拉插座近景](after-detail-outlet.png)，四面实际位置见 world/l0WallDetails.ts。
- [小地图](arch-minimap.png)、[大地图](arch-original-map.png)、[四方向符号](map-orientations.png)、[Level 1](all-map-1.png)、[Level 4](all-map-4.png)、[Alpha](all-map-101.png)。
- 十二个参考取景点及实际相机参数见 after-anchors.json；叠加图为同目录 overlay-*.png，对照图为 compare-*.jpg，[总览](reference-contact.jpg)。原第 17 轮截图作为前态保留。本轮重点是明确列出的修复，未声称所有参考投影和色调逐像素一致。

```powershell
cd app; $env:L0_VERIFY='1'; npm run dev -- --host 127.0.0.1 --port 3004 --strictPort
# 另开终端；使用独立 Chrome 配置、CDP 9235、打开 verifier/l0-remake.html
$env:QA_TAG='iteration-18'
npm run check:l0
npm run build
node scripts/verify-l0-remake.mjs after anchors
node scripts/verify-l0-remake.mjs after refinements
node scripts/verify-l0-remake.mjs after presentation
node scripts/verify-l0-remake.mjs after bloom
node scripts/verify-l0-remake.mjs after functional
node scripts/verify-l0-remake.mjs after map-preview
$env:QA_ALL_MAPS='1'; node scripts/verify-l0-controls.mjs
node scripts/verify-l0-remake.mjs after regions
node scripts/verify-l0-remake.mjs after normal
node scripts/verify-l0-remake.mjs after lifecycle
python scripts/compare-l0-references.py iteration-18
node scripts/summarize-l0-refinements.mjs
```

基准顺序执行，不与生产构建、其他浏览器测试或重型检查并行。主存档 v:1、L0 生成版本 3 保留。
