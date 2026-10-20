# 天空盒与体积云更新包导入

2026-10-09，单机 Three.js `app`。来源为用户提供的 `backroom-sky.zip`；原包内容及 SHA-256 见 [来源记录](../../assets/sky-import/SOURCE.md)。未覆盖整份旧渲染器，保留工作区现有 L1、L10、实体和 UI 修改。

## 合并内容

- 九个天空配置（L2/3/4/5/6/7/9/10/11）统一使用球壳云层光线步进、云内遮光与散射、日/月盘、星野及卷云。
- 天空跟随相机高度，地平线接场景雾色。雨、雾、阵风改变 L10/L11 云量，L9 浓雾继续作用于天空。
- 云层以 512×192、每帧 1/6 行刷新；经典模式或最低纹理档改为 256×96、每帧 1/4 行。常规每帧增加一个离屏绘制，首次填充整图。
- 独立回收天空网格、云图网格、两份材质和云图目标；共享噪声使用计数，最后一个天空退出时释放 GPU 存储。中途取消有限层构建也释放已创建天空。
- 恢复离屏渲染前的目标、立方体面、mip、自动清屏状态，包括异常路径。修正反向 `smoothstep` 的跨驱动未定义行为。

## 实际画面

实际 Engine/Renderer、独立内存存储、种子 `20261006`、1920×1080、DPR 1、FOV 75、关闭颗粒、手电关闭。L10 固定位置为世界 `(17,21,0)`（窗口原点 `(-64,-64)`），yaw=0、pitch=0.28，天气 calm。每个额外机位的数据保存为 `l*-camera.json`（最初 L6/L9/L11 为各层出生点）。

| 对照 | 截图 |
| --- | --- |
| L10 原天空 | [改造前](before-l10-realistic.png) |
| L10 云层厚度、地平雾色 | [真实模式](after-l10-realistic.png)、[经典模式](after-l10-classic.png) |
| L7 海面与云层 | [海面](after-l7-realistic.png)，世界 `(64,64,0.6)` |
| L9 夜空 | [街区夜空](after-l9-realistic.png) |
| L11 天际线 | [城市](after-l11-realistic.png) |
| L6 近黑环境 | [苔原夜空](after-l6-realistic.png) |
| L4 雾雨与天空接入 | [虚空外侧](after-l4-realistic.png)，QA 高度 6 米；画面横滚来自该层虚空状态 |
| 九层独立预览 | [真实](after-profiles.png)、[经典](after-profiles-classic.png)，t=60 固定时间 |

已查看生成截图并对照原包预览：保留各层色调，L10 条纹状云改为有厚度的层云，L6 保持近黑，L7 天空随海面雾色衔接。预览图下半部黑色为预览场景地面，实际海面图无同样的黑带。低档云形更粗，属于降低采样步数和分辨率的预期差异。

## 自动验证

- `npm run build`：通过；现有字体、PostCSS 与大包警告仍存在，详见 [构建日志](build.log)。
- `npm run check:texture-images`：96 项通过。
- `npm run check:model-warmup`：66 项通过。
- `npm run check:program-completion`：58 项通过。
- `npm run verify:sky-import -- after`：实际游戏天空位置、风时间、四种天气参数、最低/最高纹理档反复切换、九层云图全像素有限值与透射率范围、立方体目标恢复、异常恢复、两种模式重建检查通过。像素级检查合计 4,644,935 次，见 [runtime.json](runtime.json)。
- 每个临时天空销毁后，几何与纹理数量精确回到创建前；游戏每次换模式的五个天空私有资源均仅释放一次；销毁临时天空不会释放仍在使用的共享噪声。
- 游戏整体纹理数量在同一模式回访时稳定；可见几何首传使几何计数出现 5 个左右波动、程序缓存继续预热，未把所有游戏资源都宣称为严格恒定。详细计数见 `runtime.json`、`resource-debug.json`。
- `node scripts/verify-sky-import.mjs textures`：复用原有 `verifier/sky-textures.js`，验证 Worker 位图不变、占位纹理替换、反射等待与 Worker 不可用回退。结果见 [sky-textures.json](sky-textures.json)。
- `node scripts/verify-sky-import.mjs profiles`：断言预览实际使用 512/256 宽度，分别保存九层真实/经典截图。
- 浏览器控制台/运行时错误为空：`after-errors.json`、`profiles-errors.json`、`textures-errors.json`。

## 性能记录

设备报告为 **RTX 4060 Laptop GPU，ANGLE D3D11**，独立 **HeadlessChrome**。同一 L10 固定画面、真实模式、中高纹理档、预热后各五轮，每轮至少 180 帧、至少 1.2 秒。全量原始结果见 [改造前](before-performance.json)、[改造后](after-performance.json)、[汇总](performance-summary.json)。

| 指标 | 改造前五轮 | 改造后五轮 |
| --- | --- | --- |
| RAF 中位帧时间 | 均 4.2 ms | 均 4.2 ms |
| RAF P95 | 8.3–8.4 ms | 4.3–8.3 ms |
| GPU 中位耗时 | 4.39–4.43 ms | 3.23–3.72 ms |
| GPU P95 | 5.92–6.52 ms | 7.83–8.80 ms |
| 绘制调用 | 302 | 303 |
| 三角面 | 442,001 | 440,243 |

该固定场景达到 16.7/20 ms 的帧时间目标；GPU P95 有增加，因此不声称所有场景都变快。主场景截图统计不含完整路径移动压力测试，其他层的 `l*-stats.json` 包含冷构建帧，不能作为各层稳态性能结论。L4 冷构建仍有明显长帧。本轮未测试 Android 真机或全层长时间游玩。

## 复现与清理

在 `app` 运行以下命令（每个聊天须使用空闲独立端口与独立 profile）：

```powershell
$env:L0_VERIFY='1'
npm run dev -- --host 127.0.0.1 --port 3008 --strictPort
```

另起 Chrome：`--headless=new --enable-automation --no-first-run --no-default-browser-check --remote-debugging-port=9239 --user-data-dir="<项目绝对路径>/app/.cache/sky-qa"`，打开 `http://127.0.0.1:3008/verifier/l0-remake.html?level=10&mode=realistic`。

```powershell
npm run verify:sky-import -- after
node scripts/verify-sky-import.mjs profiles
node scripts/verify-sky-import.mjs textures
```

`SKY_QA_URL`/`SKY_QA_CDP` 可覆盖地址和端口。脚本校验真实 headless 参数和专用 profile。基线使用本地 `.cache/sky-import/baseline/game` 快照运行 `before`；该快照不是生产代码。测试后按 `browser-process.json`/`server-process.json` 核对身份，再关闭本次浏览器与服务器；结果见 `cleanup.json`。用户浏览器和其他任务的服务未连接或关闭。
