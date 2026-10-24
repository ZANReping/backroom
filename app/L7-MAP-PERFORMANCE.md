# L7 地图性能与海床传送

## 实现摘要

Level 7 的大地图、小地图和远端预览使用纯地形数据路径。海床预览采用以 `seed,cx,cy` 为键的最多 **384 条** LRU 缓存，命中时移动到队尾；等深线块缓存最多 **192 个**，每个 Engine 的地图图像缓存上限为 **6 张**。缓存只保存海床地形，不生成实体、掉落物或 Three.js 运行场景。地图请求按中心优先、渐进回调分批返回；取消后已发布的批次保留，可被下一次预览复用。

地图仍使用原有地图系统。开发者模式下右键地图传送固定到 L7 `floor0`，目标玩家脚底放在海床高度 `+0.02m`，并清除旧的游泳、攀爬和外部水流状态；其他层级继续使用原有安全落点检查。

## 验收环境与结果

实机浏览器验收使用 RTX 4060 Laptop、1920×1080、headless Chrome，独立内存存储；地图绘制采用浏览器原生 0.1ms 计时分辨率。每个尺寸在预热后进行 5 轮、每轮 25 次 2D 地图 CPU 绘制采样。该数据描述地图绘制，不代表整游戏 FPS，也不代表 Android 真机性能。

接受的实机记录见 [result.json](./reports/l7-map-performance-20261022/actual-game-accepted/result.json)。结果为 `ok: true`，L7 地图与传送检查 **36/36** 通过；相关 L7 回归也已通过。

| 场景 | 旧版稳定中位数 | 优化后稳定中位数 | 冷启动 | 备注 |
| --- | ---: | ---: | ---: | --- |
| mini | 约 1.1ms | <0.1ms | 4.4ms | 已发现深度与区域带保持一致 |
| big | 约 7.1ms | <0.1ms | 11.0ms | 保留等深线和图例 |
| wide | 约 10.7ms | <0.1ms | 17.3ms | 远端区域不泄漏未知深度 |

渐进加载首批远图约 **29.1ms**；取消后恢复约 **0.2ms**；64 格完整加载约 **937.9ms**；缓存重新打开约 **0.1ms**。实际传送记录的海床高度约为 `-205.427m` 与 `-118.117m`，玩家脚底分别为海床 `+0.02m`。

截图证据：

- [overview.png](./reports/l7-map-performance-20261022/actual-game-accepted/overview.png)
- [maps.png](./reports/l7-map-performance-20261022/actual-game-accepted/maps.png)
- [loading.png](./reports/l7-map-performance-20261022/actual-game-accepted/loading.png)
- [teleport.png](./reports/l7-map-performance-20261022/actual-game-accepted/teleport.png)
- [fog.png](./reports/l7-map-performance-20261022/actual-game-accepted/fog.png)

## 复现

在 `app` 目录执行：

```powershell
npm run check:l7-map-cache
npm run verify:l7-map-performance
```

前者验证缓存上限、命中和地形预览不生成实体；后者使用接受的真实游戏流程验证地图绘制、取消恢复、探索迷雾、右键传送和负坐标传送。尚未进行 Android 真机验证。
