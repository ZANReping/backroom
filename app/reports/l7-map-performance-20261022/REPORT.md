# L7 地图性能验收报告

- 环境：RTX 4060 Laptop，1920×1080，headless Chrome，独立内存存储，原生 0.1ms 计时分辨率。
- 采样：mini、big、wide 各预热后 5 轮，每轮 25 次 2D 地图 CPU 绘制。
- 结果：mini 旧版约 1.1ms → 优化后 `<0.1ms`；big 约 7.1ms → `<0.1ms`；wide 约 10.7ms → `<0.1ms`。冷启动分别为 4.4ms、11.0ms、17.3ms。
- 渐进加载：首批远图 29.1ms，取消恢复 0.2ms，64 格完整加载 937.9ms，缓存重开 0.1ms。
- 缓存：海床 LRU 384 条，等深线 192 块，每 Engine 6 张图像；仅缓存纯地形，中心优先并渐进回调，取消后可复用。
- 传送：原地图右键开发者传送固定 L7 floor0，脚底为海床 `+0.02m`，清除旧游泳/攀爬状态；两个实景海床约 `-205.427m`、`-118.117m`。
- 验收：36/36 通过，接受记录见 [result.json](./actual-game-accepted/result.json)。

截图：[overview.png](./actual-game-accepted/overview.png)、[maps.png](./actual-game-accepted/maps.png)、[loading.png](./actual-game-accepted/loading.png)、[teleport.png](./actual-game-accepted/teleport.png)、[fog.png](./actual-game-accepted/fog.png)。

复现：`npm run check:l7-map-cache`、`npm run verify:l7-map-performance`。数据只代表地图绘制，不代表整游戏 FPS；尚未进行 Android 真机验证。
