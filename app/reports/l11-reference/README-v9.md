# Level 11 建筑结构与随机生成复核（版本 9）

[原图与最新游戏截图](index.html) · [运行原始结果](architecture-accepted/runtime.json) · [普通城市抽样](architecture/static.json) · [本轮检查命令](architecture/checks.json)

## 本轮修改

- 11iconic 最近的右侧建筑采用宽 22m、进深 6m、抬高 2.1m 的入口：14 级 15cm 高踏步、1.5m 平台、斜扶手和两侧带金属围栏的花园。模型、楼层高度、碰撞和区块归属共用同一描述；入口前庭禁止街边道具占用。普通城市中的同类建筑先预留前庭再生成入口。
- 11canal 的两座楼使用各自朝内的蓝色侧面，中间保留实际空隙，顶部连廊连接两楼。桥面改为缓拱形，带实体底面、桥台连接及落在桥面范围内的桥墩；道路、栏杆和水下碰撞跟随同一高度曲线。
- 11iconic 的橙色牌面直接贴墙。普通城市同时支持贴墙和悬挑两种结构，四种完整竖式牌面（Pegasus、hotel、clinic、cinema）。新增的三个牌面为 AI 生成资产，保留源图、提示词与处理脚本；不作为三个新增装饰原型重复计数。
- 左侧首层店铺采用透明玻璃、独立房间、货架、收银台、灯具和完整店招。店铺在走廊规划前预留，玻璃后面是可进入的实际空间。
- 后续参考细化了 11lowdensity 的蓝色斜雨棚商铺、退台屋顶与设备，以及 11unfinishedinterior 的混凝土工作间、外露梁、服务桥架、梯子和电缆盘。蓝雨棚商铺保留多层体量。砖楼门框和信箱已改为随入口朝向旋转。
- 修复抬高首层建筑的楼层判断，避免入口或室内楼梯下降时被错误归入上层；玩家、道具和相关单人行为查询传入实际位置。

固定种子仅固定城区排列。29 种参考体量配方全部在普通生成器抽样中出现，会适配地块尺寸、朝向和楼层；构件与装饰使用同一登记和碰撞流程。基础库为 30 种建筑原型、102 种装饰原型，32 张既有图集牌面另加四种竖式牌面。

## 复现和覆盖

新游戏种子 **20259573** 对应 L11 地图种子 **20261014**。办公室街道坐标 272,415；大台阶 291,367；运河主视角 760,967.8；蓝雨棚街 116,643。生成器不读取相机。参考配方版本 9、街景版本 6，存档世界版本仍为 2。

普通世界静态检查使用种子 42、7391、-17、20261006，覆盖负坐标和不同加载次序：3706 栋建筑、47 组双楼、184 处桥梁、268 组桥墩、29 处抬高入口，其中 9 处有花园。四种牌面 × 两种安装方式均有生成。

实际游戏使用 Chrome/155.0.8059.40，真正的无头 Chrome、独立配置目录、独立 Vite/CDP 端口；1920×1080、DPR 1、真实光照、高画质、固定晴天和时间 10。渲染设备：**ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)**。

- 12 个参考视角及 5 个普通种子视角；截图均来自生产 Engine 和 Renderer。
- 悬挑立牌另有[补拍记录](architecture-signs/runtime.json)：原先抽到的上部立牌从近处被裙房遮挡，补拍选择普通种子中下部立面的立牌；没有为截图改变建筑。
- 5 栋重点建筑入口、6 段室内楼梯双向行走，266 个门口碰撞检查；94 次实际房门行走。
- 大台阶上下行、普通种子带花园入口及其楼梯均已测试。拱桥两个方向实际通过，桥下净空可通行、2 个桥墩有水下碰撞。
- 连续步行 77.3m 并跨区块，三轮卸载/重载检查资源计数与实例引用。
- 运行错误 0；网络异常 2（详见原始日志）。本轮所属浏览器、服务器和临时配置目录已清理。

## 性能实测

| 视角 | 中位帧时间 ms | P95 ms | 绘制调用 | 三角形 |
|---|---:|---:|---:|---:|
| 01-office-street | 8.3 | 12.6 | 644 | 2,087,050 |
| 03-canal | 4.2 | 8.4 | 222 | 1,505,543 |
| 14-storefront-corner | 8.3 | 12.5 | 590 | 1,723,688 |
| 15-storefront-interior | 12.4 | 20.9 | 575 | 2,297,712 |
| 16-twin-courtyard | 4.2 | 8.4 | 265 | 1,560,248 |
| 17-arch-side | 4.2 | 8.4 | 179 | 1,343,647 |
| 18-blue-shops | 4.3 | 12.4 | 432 | 1,645,680 |
| 19-blue-shops-rear | 4.2 | 8.4 | 921 | 2,849,343 |
| 20-service-workshop | 8.3 | 12.6 | 450 | 1,488,651 |
| 21-service-upper | 8.3 | 12.6 | 761 | 1,965,059 |
| 22-grand-entrance | 8.3 | 12.5 | 605 | 2,077,764 |
| 23-entrance-gardens | 8.4 | 16.6 | 1494 | 6,110,290 |
| 正常步行/切区 | 12.5 | 25.0 | 1073 | 4,883,519 |

步行最大帧时间 354.2ms。三轮非角色池纹理数为 78 / 78 / 78，场景 CPU 几何数为 2156 / 2156 / 2156。这些是 Three.js 资源计数，并非显存字节数。切区仍有长帧，不能认定所有视角稳定 60 FPS。

## 检查命令

工作目录为 app：

```text
npm run check:l11
npm run check:l11-reference
npm run check:l11-architecture
npm run check:l11-meshes
npm run check:l11-collision
npm run check:l11-waterways
npm run check:l11-urban
npm run check:l11-dressing
npm run check:l11-map
npm run build
node scripts/verify-l11-reference.mjs --label=architecture-low --case=01,03,22 --visual-only --low
node scripts/verify-l11-reference.mjs --label=architecture-classic --case=03,22 --visual-only --classic
node scripts/verify-l11-reference.mjs --label=architecture-signs --case=22 --visual-only --architecture --random-cases=blade-sign
node scripts/verify-l11-reference.mjs --label=architecture-accepted --case=01,03,14,15,16,17,18,19,20,21,22,23 --validate=east-stone,west-piers,blue-retail,service-loft,brick-housing --rooms --lifecycle --architecture
node scripts/summarize-l11-architecture.mjs
```

上述静态检查全部通过。

本轮低画质 3 个视角、经典光照 2 个视角均通过，错误为 0，浏览器/服务器/临时配置均已清理。这两轮兼容性抽查并行运行，其帧时间不用于性能结论。未列为本轮检查的旧报告仅作历史记录。此前版本 7 的运行结果与性能保存在 [历史报告](README-v7.md)，不与本轮数值混用。

附加工具限制：Git 空白差异检查在本会话返回“必须在工作树中运行”，未能完成；未修改 Git 配置。上述编译、生成、碰撞和实际游戏检查独立通过。

## 视觉与素材说明

结构误读、随机生成适用性和通行问题已经按上述范围修改并检查；目前画面仍有程序化建模感，绿化、车辆、部分门窗比例、街道磨损和间接光与照片存在差距，不能称为全部照片的像素级复刻。新增参考采用结构和用途特征，未将原图投射到镜头前充当建筑。

铺装、家具和叶片继续使用登记过的 CC0 材质；没有新增噪点纹理。竖牌来源和高低质量通道见 [资产记录](../../public/textures/L11-ASSET-SOURCES.md)与[生成清单](../../assets/l11-vertical-signs/manifest.json)。本轮只更改 app 与对应文档，联机继续冻结。
