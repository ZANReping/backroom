# Tiny final 接入验收

原目录 E:/ZAN/backroom/app；日期 2026-10-22。结果摘要在 [acceptance.json](acceptance.json)，单项命令结果在 [checks.json](checks.json)，来源见 [SOURCE.json](../../assets/sources/tiny-final-20261022/SOURCE.json)。

## 实际游戏

真实 App 的标题页／继续游戏进入流程；种子 424242，1920×1080、原生分辨率、关闭动态分辨率及动态曝光。Chrome 使用 --headless=new、独立 profile 和端口；GPU 为 ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)。验收设置启用无敌和固定镜头以观测机制，使用动作、实体 AI、拾取物、渲染器及 UI 均为正式实现。吹奏中段截图短暂冻结使用计时器，之后恢复；逼退和回门按自然计时运行。

| 模式 | 实际断言 | L7 近处可玩 | L8 近处可玩 | 三轮回收后的几何／纹理 |
|---|---:|---:|---:|---|
| 真实 | 38 | 3.84s | 5.11s | 487/159 → 487/159 → 487/159 |
| 经典 | 41 | 1.49s | 2.94s | 330/134 → 330/134 → 330/134 |

两轮无运行时错误及失败资源请求，QA 浏览器、服务器及独立 profile 均已清理。近处可玩用时不等于完整远景全部完成，也不是全设备／全种子十秒保证。result.json 中 calls/triangles 是后处理末次 pass 计数，不作为全场绘制调用性能结论；本轮未进行五轮整场帧时或 Android 真机性能验收。

覆盖自然门区、实际瞄准对话、连续四次真实使用、水下耗氧、门放行、自然回门与无敌伤害守卫，第一人称静止／吹奏，唯一乐器洞、十一件物件贴合、自然笛子与风铃交互，以及稳定窗口中三轮模型生成／释放。经典模式还通过实际 UI 打开新对话和模型预览并和平退出。

- [真实门区](final-realistic/perch.png) · [近景](final-realistic/close.png) · [逼退](final-realistic/flee.png)
- [手持](final-realistic/hold.png) · [吹奏](final-realistic/blowing.png)
- [乐器洞](final-realistic/cave.png) · [反向](final-realistic/reverse.png) · [风铃](final-realistic/chime.png)
- [经典门区](final-classic/perch.png) · [对话](final-classic/talk.png) · [经典乐器洞](final-classic/cave.png)

## 自动检查

小小行为 87/87，含 8 种子乐器洞可达、唯一生成、壁面／地面／洞顶贴合和新增流式原点检查。模型资源 25062 项检查通过：七动画各六帧、有限属性／矩阵／UV、独立几何和材质、共享纹理、取消构建及实际队列完成；详见 [resources.json](resources.json)。

实际模型统计：小小 12750 三角／58 网格批次；石卡祖笛 726 三角／1 批次，满足现有物品 1200／3 上限；风铃 1620 三角／7 批次（6 根管独立摆动）。这些是工厂全部部件统计，并非单帧视锥可见批次。

L7 生成、实体变种、协作准备、物品合批／UV、Arachnid、Curabitur、Lightguide、Burster、Mangled、Jerry 与近战回归通过；最终生产构建另见 build.log。

迷彩爬行者旧脚本使用未固定的 Math.random，初次出现两项移动／脚步断言失败；只读替换集成前源码对照时也出现过局部坐标偏移断言失败。固定同一随机序列后，导入前和导入后均 53/53 通过。保留原失败日志和 [受控前后对照](camo-baseline-seeded.json)，未为掩盖差异更改生产 AI。重现受控当前版本：先运行 npm run check:camo 完成打包，再运行 node --import ./reports/tiny-final-20261022/camo-fixed-seed.mjs .cache/check-camo.mjs。

## 复现与原文件保护

正式命令和入口见 [接入说明](../../TINY-REMAKE.md)。verifier/tiny-final-check.ts 内记录相机、世界坐标及落点；L7 门中心为 (-134.5,15.5)，L8 乐器洞中心为 (114.260722,1.577916)，层级种子都是 424242。两种光影分别独立运行。

原文件备份 .cache/tiny-final-20261022/before；语义补丁及冲突处理日志在同一目录。冻结文件哈希检查见 [preservation.json](preservation.json)。早期失败取景保存在其余报告子目录，最终验收以 final-realistic 和 final-classic 为准。
