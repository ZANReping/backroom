# 残缺之雾、L4 地图与出口验收

2026-10-21，在原项目 E:/ZAN/backroom/app 完成。保存本轮修改前文件于 .cache/l9-l4-regions-20261021/before，未覆盖此前用户/其他任务的改动。仅更新 app 与根 info.md；GitHub 副本、app-lite 和联机功能未更新。

## 已验证行为

- 残缺者从玩家完整水平视锥外的远处出现，已有模型随后沿实际室外通路接近，绕过阻挡；雾与接近过程同步形成。主体浓雾为 120–180 秒，之后约 50 秒渐散，实体以普通速度的 85% 离开。注视时不删除；转身且持续离开视野至少两秒才回收，无死亡掉落。提前关闭雾时只变淡。
- L4 原版大小地图共用四种区域颜色与不同纹样，大地图有图例，墙柱和玻璃门窗有区别。未知区域不泄露纹样或墙线，地图绘制不改探索进度；验证负坐标、预览与已加载区块优先级。
- L1 独立过道、L4 独立窗景分类从可选区域和档案中移除；真实连接通路和雨景窗保留。L4 不再生成 tint 53 或独立窗边照明；NPC 文案及根说明同步校正。
- L4 电梯：三米真实墙洞、封闭背墙、向西朝向，与实际门框和碰撞一致；原版交互后进入 L3。古典楼梯：明确向北下行，开口/护栏跨区块连续，实际下行进入 L5。活板门排除家具冲突，实际交互进入 L6。

## 自动检查

| 检查 | 结果 |
| --- | --- |
| npm run check:l9-fog | 482 项断言通过，覆盖视野外生成、浓雾时长、实际步行状态机、障碍绕行、双阶段退场、流式原点变化与无掉落回收 |
| npm run check:l4-region-exits | 三种子 363 个区块及 Canvas 绘制通过；95249 项含未知区域逐像素遮蔽断言，非 95249 个独立场景 |
| npm run check:l4 | 114500/114500 通过，三种子可达性均 100%，含出口和生成回归 |
| npm run check:l1 | L1 architecture/district/anomaly/crate/puddle checks 通过 |
| npm run check:watch | 39/39 通过，原普通观察者、挺进者、残缺者行为保持 |
| node node_modules/typescript/bin/tsc -b | 通过 |
| npm run build | 通过；Vite 仍有既有大包提示 |

原始日志见本目录的 fog-final.log、region-exits.log、l4-initial.log、l1.log、watch-final.log、typecheck-final.log、build-final.log。中间失败记录保留；实际游戏排查修复了小数坐标查询整数瓦片及直线 AI 被真实树木/住宅阻挡的问题。最终以下三个验收记录均通过，运行时错误、控制台 error 与资源失败请求均为零。

## 实际游戏

使用原版 App、独立内存存档、真实生成地图及已有模型；Chrome --headless=new、每次独立 profile/CDP/服务端端口，1920×1080 原生分辨率。GPU 为 NVIDIA GeForce RTX 4060 Laptop，经 WEBGL_debug_renderer_info 检查，未使用软件渲染。classic/realistic 光影，seed=424242；动态分辨率及动态曝光关闭，纹理档 2。截图全部人工检查。

| 运行 | 断言 | 入口测量 | 记录 |
| --- | --- | --- | --- |
| l4-realistic-final | 30 | 7.20 秒 | [l4-realistic-final/result.json](l4-realistic-final/result.json) |
| l4-classic-final | 30 | 6.51 秒 | [l4-classic-final/result.json](l4-classic-final/result.json) |
| fog-final | 8 | 7.50 秒 | [fog-final/result.json](fog-final/result.json) |

入口测量为测试夹具点击继续后到附近可玩，单轮且可能与构建并发，不能作为五轮性能基准或所有层级十秒内的承诺。雾事件自然步行到 active，验证实际 120–180 秒计时；为缩短重复验收，仅在进入 active 后、及退场采样十二秒后缩短剩余计时，仍通过真实 RAF 驱动，未瞬移实体、改材质或替换世界。完整逻辑时长另由脚本推进检查。

三次最终运行的浏览器、服务端及独立 profile 均已回收，具体 cleanup 和实际启动参数记录在 result.json。本轮不作 Android 或全层级性能结论；此前 L4 完整窗口真实光影的性能限制仍见 [导入报告](../l4-melee-wrangler-import-20261021/REPORT.md)。

## 截图

- [真实光影原版地图](l4-realistic-final/l4-original-map.png)、[经典光影原版地图](l4-classic-final/l4-original-map.png)
- [电梯墙洞](l4-realistic-final/l4-exit-elevatorshaft.png)、[古典楼梯入口](l4-realistic-final/l4-exit-oldstairs.png)、[活板门](l4-realistic-final/l4-exit-trapdoor.png)
- [残缺者刚到来](fog-final/l9-arrival-looking.png)、[主体浓雾](fog-final/l9-active.png)、[散雾离开](fog-final/l9-departure.png)、[雾散后继续注视](fog-final/l9-cleared-watching.png)、[移开视野后回收](fog-final/l9-retired.png)

## 复现

在 app 中运行以下命令，使用各自临时端口/浏览器，不连接日常浏览器：

```powershell
npm run check:l9-fog
npm run check:l4-region-exits
npm run check:l4
npm run check:watch
npm run check:l1
npm run verify:l9-l4-regions -- --l4-only --label=l4-realistic
npm run verify:l9-l4-regions -- --classic --l4-only --label=l4-classic
npm run verify:l9-l4-regions -- --fog-only --label=fog-realistic
npm run build
```

手工检查可在 seed 424242 的 L4 打开原版地图，开发者全开后看区域图例与大小地图。三类实际出口的世界锚点为：电梯 (-329,-408)、古典楼梯 (49,-214)、活板门 (-92,-474)，截图视点与朝向存于 result.json。到 L9 在开发者现象中启用残缺之雾，保持原方向等待视野外生成，再回头观察走近与退场；不使用冻结 AI 或一键照明。

生成版本改变后，重新生成的旧 L4 世界位置可能不同；不改主存档版本与物品功能。没有新增外部资产，模型/材质作者与许可沿用此前导入记录。
