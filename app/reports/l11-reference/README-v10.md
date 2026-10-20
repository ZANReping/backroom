# Level 11 大入口与立面复核（版本 10）

[参考图与实际游戏对照](index.html) · [通行与室内运行结果](facade-accepted/runtime.json) · [远景修正后补拍](facade-final/runtime.json) · [普通城市抽样](facades/static.json) · [检查记录](facades/checks.json) · [版本 9 历史报告](README-v9.md)

## 入口和建筑

11iconic 最近的右侧建筑保留宽 **22m**、进深 **6m**、抬高 **2.1m** 的大入口：14 级 15cm 踏步、1.5m 顶部平台、斜扶手，以及两侧带金属围栏的花园。实际入口与首层一起抬高；从街道上台阶、进门及楼内上下楼使用相同的空间数据。前庭在地块阶段预留，街道装饰避开台阶与入口。

重新对照原图后，最近建筑改为深色玻璃幕墙和金属竖框；后方带 PEGASUS 贴墙立牌的建筑使用石材窗格立面。玻璃楼具有环绕四面的基座分缝、层间遮挡带和可见真实房间；石材楼增加窗洞进深、窗帘和细窗框。背面、侧面及室内均单独实拍检查。远近模型共用楼层基准，防止抬高或旋转后的建筑在远景中换成另一种立面。逐层远景在浮点高度边界处曾多生成极薄窗带，已增加容差并以 0.03m / 2.17m 基准、20 层和七种立面复核。

这些结构也进入普通随机生成：3706 栋抽样建筑中有 39 栋玻璃幕墙类型，56 处抬高入口，17 处带花园入口；29 种参考体量配方全部出现。抽样种子为 42、7391、-17、20261006，包括负坐标和不同生成顺序。普通种子 42 的花园入口与玻璃楼入口均在实际游戏中验证，参考城区只固定排列。

## 街道与兼容性

道路标线现在依据真正的路网交点生成，覆盖内部十字路口、丁字路口与斜交路口。交叉口中间停止画车道线，远景使用相同规则。宽道路增加连续行道树，避开道路和入口占地。日照朝向与 HDR 天空同步调整；石材和沥青继续使用登记的 CC0 材质，压低原始扫描的过强色差，没有新增噪点纹理。来源和处理见[资产记录](../../public/textures/L11-ASSET-SOURCES.md)。

运河双楼侧面、屋顶连廊、缓拱桥与桥墩，以及透明玻璃店铺和室内陈设沿用上一轮修正，本轮重新检查相关视角和通行。其他参考的版本 9 截图仍保留在[历史画廊](index-v9.html)。

## 实际游戏验证

新游戏种子 **20259573** 对应 L11 地图种子 **20261014**。大台阶坐标约 **291,367**；街景坐标 272,415；运河主视角 760,967.8。参考配方版本 10、街景版本 7，存档世界版本仍为 2。

- 12 个参考视角、2 个普通城市视角，固定 1920×1080、DPR 1、真实光照、高画质、晴天与时间 10。
- 3 栋重点建筑入口、3 段室内楼梯双向行走、90 个门口碰撞检查、56 次实际房门行走。
- 普通城市带花园入口与玻璃幕墙入口测试通过；缓拱桥双向通过，桥下可通行，2 个桥墩具有水下碰撞。
- 连续步行 75.9m 并跨区块；实际按键持续 24.1 秒，三轮卸载/重载检查通过。
- 主轮与远景补拍运行错误均为 0；网络异常分别 2 / 2，原始记录保存在各轮 runtime.json。低画质与经典光照另各抽查 2 / 2 个视角，均通过。
- Chrome/155.0.8059.40；实际渲染硬件 **ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)**。浏览器命令行确认 --headless=new，独立端口和临时配置；本轮浏览器、服务器和配置目录已清理。

## 性能

| 视角 | 中位帧时间 ms | P95 ms | 绘制调用 | 三角形 |
|---|---:|---:|---:|---:|
| 01-office-street | 12.7 | 22.9 | 1233 | 4,921,676 |
| 03-canal | 4.6 | 10.7 | 234 | 1,543,903 |
| 04-office-reverse | 16.3 | 21.0 | 599 | 2,289,617 |
| 14-storefront-corner | 25.0 | 37.5 | 608 | 1,962,378 |
| 15-storefront-interior | 29.2 | 45.9 | 541 | 2,562,166 |
| 22-grand-entrance | 20.9 | 37.5 | 1298 | 5,979,322 |
| 23-entrance-gardens | 16.8 | 33.3 | 1142 | 5,320,673 |
| 24-glazed-office | 20.7 | 25.1 | 659 | 2,328,158 |
| 25-stone-advert | 20.8 | 29.2 | 2200 | 8,009,593 |
| 26-glazed-rear | 112.5 | 279.2 | 658 | 2,593,214 |
| 27-glazed-upper | 16.7 | 29.1 | 543 | 2,375,537 |
| 28-stone-side | 16.7 | 25.0 | 501 | 2,024,402 |
| 正常步行/切区 | 25.0 | 49.7 | 2242 | 7,682,346 |

01、03、04 视角及步行/资源数据来自远景楼层边界修正后的专项运行，其他行来自主轮。步行性能仍取开始的固定 24 秒样本，最大帧时间 450.0ms。三轮非角色池纹理数 77 / 77 / 77，场景 CPU 几何数 2108 / 2108 / 2108。这些是资源计数，并非显存字节数。切区与部分视角仍有长帧，不能据此宣称全部场景稳定 60 FPS。兼容性抽查的帧时间不并入这张性能表。

**保留的失败记录：** [首次远景补拍](facade-surface-fix/runtime.json)在 24 秒内仅走了 43.3m（中位 50.1ms / P95 187.5ms），没有达到原脚本的 50m 覆盖要求，已标记失败并清理资源。最终脚本保留同样的 24 秒性能样本，允许最多 60 秒的按键行走以覆盖 70m，仍要求至少 50m 且区块版本递增；额外样本单独保存，不用于稀释性能数据。此项只证明通行，不代表低帧率问题已解决。

## 检查命令

工作目录 app：

```text
npm run check:l11
npm run check:l11-dressing
npm run check:l11-collision
npm run check:l11-reference
npm run check:l11-architecture
npm run check:l11-meshes
npm run check:l11-urban
node node_modules/esbuild/bin/esbuild scripts/check-l11-road-markings.ts --bundle --platform=node --format=esm --outfile=.cache/check-l11-road-markings.mjs
node .cache/check-l11-road-markings.mjs
npm run build
node scripts/verify-l11-reference.mjs --label=facade-accepted --case=01,03,04,14,15,22,23,24,25,26,27,28 --validate=east-stone,east-ribbon,west-piers --rooms --lifecycle --architecture --random-cases=glazed-terrace,garden
node scripts/verify-l11-reference.mjs --label=facade-final --case=01,03,04 --visual-only --lifecycle
node scripts/verify-l11-reference.mjs --label=facade-low --case=01,22 --visual-only --low
node scripts/verify-l11-reference.mjs --label=facade-classic --case=01,22 --visual-only --classic
node scripts/summarize-l11-facades.mjs
```

路口测试包含十字、丁字、45° 斜交、负坐标、重复道路和参考/普通城市路网；模型测试包含七种立面在局部/旋转世界坐标下的楼层、材质与几何一致性。生产构建通过；既有字体路径与产物体积警告见构建日志。首次主轮验收受运行会话中断影响，没有作为通过证据；其截图保存在 facade-interrupted-v10，遗留配置目录已清理，随后完整重跑。

## 视觉范围

大台阶、两侧花园、正确的前后立面类型及实体内部已经实现。画面仍有程序化建模感，车辆、树形、部分室内密度、建筑比例和间接光与照片存在差距；本报告不把结构和通行通过等同于全部参考图的近乎完全复刻。本轮没有修改 app-lite、Godot 或冻结的联机实现。
