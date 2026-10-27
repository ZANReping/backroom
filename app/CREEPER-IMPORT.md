# 爬菌 Crawlers 接入说明（2026-10-25）

开发目录为 `E:/ZAN/backroom/app`。增量接入用户提供的 `creeper-full.zip`，保留当前手部、武器、商人、图鉴、场景加载和其他工作区修改。

## 游戏内容

- 新增父实体「爬菌」（Entity 17），注册「尸鼠感染体」「蛛形纲感染体」「爬菌人」三个子形态。开发者面板可分别召唤；图鉴使用真实模型生成预览，点击可以轮换角度和形态。
- 尸鼠／蛛形纲有 1–4 阶感染外观和动作；5 阶爬菌人为断腰、无腿、双臂撑地的焦尸形态。保留原包菌球、菌丝、绒毛、余烬、拖腿、扑击和死亡动画。
- L2、L3、L8 及 L5 锅炉房接入原包确定性生成和宿主替换；墙角感染蜘蛛只在真实墙体支撑处出现。爬菌人可以看见、听见并追击玩家，命中时检查真实视线。
- 隐藏孢子负荷、环境相关病程、阶段症状、感染传播、死亡孢子、火盐清除和长白毛尸鼠肉接入现有结算。1 阶察觉伤口后可用特殊交互键 X（触控端同一情境按钮）烧灼自救；2 阶起失去该选项。
- 2–4 阶感染外观跟随现有双手、近战武器与枪械支撑手；瞄准淡出同步隐藏覆盖物。感染肉有专属模型和像素图标。

## 与当前项目的适配

模型使用现有分帧构建、贴图准备、GPU 上传与着色器预热队列，准备完成后显示。世界装饰每帧最多构建一个；取消和退出时释放实例私有资源，共享材质、几何和贴图继续有效。手部指甲缓存随对应握姿几何释放；图鉴克隆实例材质，避免修改场景共享材质。

保留商人 X 快捷键，烧灼操作只触发一次；高阶段交易拒绝同时覆盖快捷交易。新增感染状态通过可选字段保存，主存档版本保持 v:1；烧毁的墙角装饰记录也会保存。新开局清理感染，普通换层保留病程。

原包的阶段设计记录保留在 [CREEPER-REMAKE.md](CREEPER-REMAKE.md)，原始版本、参考蒙太奇及来源哈希保存在 [assets/creeper-import](assets/creeper-import/SOURCES.md)。包内未声明独立许可，记录中未自行补写授权。

## 检查与复现

在 app 目录运行：

```powershell
npm run check:creeper
npm run check:creeper-integration
npm run check:entity-forms
npm run check:entity-preparation
npm run check:retro-hands
npm run check:merchant-trade
npm run check:item-batches
npm run build
npm run verify:creeper-import -- --label=review-realistic
npm run verify:creeper-import -- --classic --label=review-classic
```

实际游戏验证使用独立内存存档、L2 种子 424242、1920×1080 原生 GPU、真正无头 Chrome。脚本自动分配专用端口与配置目录，结束后清理自己的进程；不会覆盖玩家存档。Windows Chrome 默认路径可用 `CHROME_PATH` 覆盖。

本次两个模式各通过 64 项实际游戏断言，原包 90 项与集成 120 项检查、相关回归及生产构建通过。截图、全部数值、固定视角和边界见 [验收报告](reports/creeper-import-20261025/README.md)。桌面触控模拟仅验证输入，不代表 Android 实机性能。

## 保留的限制

原包爬菌人主体几何较密，远档仍约 6.5 万三角形，多个近处个体的成本需要后续单独减面。首见已拆分准备，但不承诺零卡顿；本机经典模式单次爬菌人首次准备记录仍有 29.2 ms 帧间隔峰值。专属音效继续复用已有 aggro／hurt 音效。

联机继续封闭，本次未修改协议或联机逻辑；未更新 GitHub 副本或 app-lite。
