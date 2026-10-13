# Level 10 重制包接入报告

2026-10-09，范围为 `app` 与根 `info.md`。用户包：`C:/Users/ZANRe/Downloads/backroom-l10.zip`。保留已有物品、UI、实体、Level 1 和其它工作区修改；联机维持冻结。

## 合入内容

- 世界坐标田块、作物用途与种植行向，树篱/树列及缺口，湖岸/湖底连续高度。
- 农舍院落、红色谷仓、马厩、小棚、外屋、圆草捆、油菜花、树冠叶片。
- 分层地表混合、连续风场、作物避让玩家、按水深和视角变化的水面。
- 原包的通用水面改动涉及 L7 海面、L8 地下湖、L9 泳池；L5 保留其专用实现。
- 四张新贴图、可复现生成脚本、原包预览和 patch。[原包来源与 SHA256](../../assets/l10-import/SOURCE.md)，[纹理许可](../../public/textures/L10-ASSET-SOURCES.md)。

共享文件按补丁逐项合并；两处 Level 1 已变更的地形上下文手动适配，没有覆盖其新版建筑/烘焙代码。额外修复：

1. 新贴图纳入层级预载。
2. 地表、建筑与植物按经典/真实模式分别缓存，切换回原模式复用对应材质。
3. 地表和水面 shader 链式保留材质工厂现有钩子。
4. 水面接入雨量、风向及流式窗口原点，离开 L10 清除其雨量覆盖。
5. 建筑细节、树冠与树篱 UV 使用世界坐标，窗口重定位后保持一致。
6. 重建时释放天空球几何和独立材质，避免每次切换增加一个几何资源。

## 验证

| 检查 | 结果 |
| --- | --- |
| `npm run check:l10` | 6,870 项通过：确定性、田块比例、道路、出口、岸坡、建筑地基及区块归属 |
| `npm run check:l10-model-import` | 5,839 项通过：7 类模型、两种材质模式、有限坐标/法线/UV、模式缓存、窗口重定位 |
| `npm run check:texture-images` | 96 项通过 |
| `npm run check:static-batch-job` | 11,621 项通过，包含取消与回收 |
| `npm run check:model-warmup` | 66 项通过 |
| `npm run check:program-completion` | 58 项通过 |
| `check-l8-surfaces.ts` 直接 esbuild 后执行 | 28,792 项通过 |
| `npm run build` | 通过；保留已有字体解析、PostCSS 和大 bundle 提示，见 `build.log` |

真实生产 Engine + Renderer、独立内存存储、种子 `20261006`；每模式 31 项运行断言，保存 22 张游戏截图：

- 两模式各七个视角：田野入口、农舍、谷仓正面、谷仓内部、湖岸、小麦、油菜。
- 谷仓正门每 0.15m 检查身体净空，实际移动穿过门洞；侧墙阻挡有效。
- 保存世界坐标并恢复谷仓落点，位置精确恢复；检查雨天风场、雨滴参数与窗口原点。
- 三轮湖岸/谷仓往返后资源稳定。真实模式为几何/纹理/程序 `302/331/74`；经典模式 `200/308/61`。
- 双模式预热后六次交替切换，经典模式稳定为 `205/315/122`，真实模式 `284/333/130`。见 [最终切换数据](mode-rebuilds.json)。首次同时预热两种模式会增加有界物品/着色器缓存，不把这一轮当泄漏基线。
- L7/L8/L9 真实光影水面高低档、L10 经典光影水面高低档，检查水深属性与运行时 shader。截图属于实际层级场景。

最终浏览器错误记录见 `classic-errors.json`、`realistic-errors.json`。测试未使用日常浏览器。`browser.json` 保存真实 `--headless=new`、专属 `.cache/l10-qa`、端口 `9238` 的启动参数。

本任务 QA 浏览器及 Vite 服务已关闭，3007/9238 无剩余监听，见 `cleanup.json`。

## 画面

1600×1000，FOV 75，贴图质量 2、场景灯上限 16、阴影档 2、泛光开启。相机世界位置和目标在 `classic-views.json` / `realistic-views.json`；取景算法为 `src/proto/l10Views.ts`。

| 区域 | 真实光影 | 经典光影 |
| --- | --- | --- |
| 田野 | [截图](realistic-spawn.png) | [截图](classic-spawn.png) |
| 农舍 | [截图](realistic-farm.png) | [截图](classic-farm.png) |
| 谷仓 | [截图](realistic-barn.png) | [截图](classic-barn.png) |
| 谷仓内部 | [截图](realistic-barnin.png) | [截图](classic-barnin.png) |
| 湖岸 | [截图](realistic-lake.png) | [截图](classic-lake.png) |
| 小麦 | [截图](realistic-field.png) | [截图](classic-field.png) |
| 油菜 | [截图](realistic-canola.png) | [截图](classic-canola.png) |

已人工查看生成截图：主要结构、种植区域、谷仓梁架与地基、水面均能显示，与包内预览方向一致。树冠和叶簇仍能看出低模轮廓；这是原包模型的视觉特征，本次没有另行重画。没有宣称与包内不同画幅/位置的截图逐像素一致。

## 性能与限制

RTX 4060 Laptop / ANGLE D3D11，1920×1080、DPR 1，真实光影、雨量/湿度 1、谷仓正面固定视角。预热后五轮，每轮至少 180 帧且不少于 1.2 秒；[原始结果](performance-realistic-rain.json)、[设置来源](performance-context.json)。

五轮中位帧时间均约 **8.3ms**，P95 均 **12.5ms**；GPU 中位数 8.33–8.76ms，GPU P95 11.84–12.73ms；376 绘制调用、395,337 三角面。该固定视角达到既有 16.7/20ms 稳态目标，不能代表所有区域、连续快速移动或移动端。

首次全窗口冷构建/模式编译曾超过原验证器 60 秒等待上限，随后可完成；验证专用等待上限提高至 180 秒，不修改游戏加载预算。旧的 `initial-mode-rebuilds.json` 保留了天空回收修复前的每轮几何增长数据。最初部分水面截图朝向未对准湖/池，已调整验证相机重新截图；没有以“场景里有水材质”代替画面检查。

本次没有进行导入前后同场景完整性能对照、长时间自由跑图或 Android 真机验证。没有修改存档主版本，旧种子会生成新版田块，沿用既有碰撞安全落点恢复；未新增旧版 L10 世界逐物件迁移及通用地面物品存档能力。

## 复现

在 `app` 目录运行上表命令。L8 脚本：

```powershell
npx esbuild scripts/check-l8-surfaces.ts --bundle --platform=node --format=esm --outfile=.cache/check-l8-surfaces.mjs
node .cache/check-l8-surfaces.mjs
```

检查端口空闲后启动独立服务：

```powershell
$env:L0_VERIFY='1'
npm run dev -- --host 127.0.0.1 --port 3007 --strictPort
```

另一个 PowerShell 仍在 `app` 目录，使用专属 profile：

```powershell
$l10Profile=Join-Path (Get-Location) '.cache/l10-qa'
Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' -WindowStyle Hidden -ArgumentList @('--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--remote-debugging-port=9238',('--user-data-dir="'+$l10Profile+'"'),'http://127.0.0.1:3007/verifier/l0-remake.html?level=10')
node scripts/verify-l10-import.mjs realistic
node scripts/verify-l10-import.mjs classic
$env:L10_QA_WATER='1'
node scripts/verify-l10-import.mjs realistic
$env:L10_QA_WATER_LEVELS='10'
node scripts/verify-l10-import.mjs classic
```

每条命令串行执行。结束时依据专属 profile、监听端口及启动命令核实进程归属后关闭本次 QA 浏览器/服务器；不要关闭日常浏览器或其它任务服务。
