# 旱虾 v81 接入验收

2026-10-17。接入范围与来源见 [实现说明](../../SHRIMP-REMAKE.md)，最终代码／图标 SHA-256 见 [文件清单](final-manifest.json)。`source/` 是压缩包自带预览，下面的 `runtime-*` 才是本项目实际游戏运行结果。

与导入前完整源码快照逐文件比对，已有文件的差异全部落在预期的 15 个接入文件；前一轮人物面部校准和形象编辑文件保持原样。[保留检查](preservation.json)。

## 画面对照

| 项目 | 导入前 | 导入后 |
| --- | --- | --- |
| 真实光影实体 | [旧模型](before-realistic/crawl.png) | [新模型](runtime-realistic/crawl.png) |
| 经典光影实体 | [旧模型](before-classic/crawl.png) | [新模型](runtime-classic/crawl.png) |
| 真实光影物品 | [两种旧物品](before-realistic/items.png) | [旱虾、活旱虾、酥炸旱虾](runtime-realistic/items.png) |
| 经典光影物品 | [旧物品](before-classic/items.png) | [新物品](runtime-classic/items.png) |

已检查分节和贴图方向、鳍片边缘、眼柄／前附肢、地面高度及手持遮挡；[游泳](runtime-realistic/swim.png)、[分裂](runtime-realistic/split.png)、[手持](runtime-realistic/handheld.png)另有近景。`held.png` 为挣扎姿态展示，实际钝人按住与捕食过程由下述真实 AI 检查覆盖。掉落物沿用游戏的悬浮旋转和拾取光环。

固定场景：种子 `20261006`，层级 `104`（EL3A），1920×1080、像素比 1、纹理档 2、真实／经典光影。玩家坐标 `(41.7,25.5,0)`、蹲姿；实体 `(43.25,25.5,0)`、朝向 `-1`，相机 yaw `-π/2`、pitch `-0.5`，实际 FOV 60。其他取景参数保存在各 `result.json` 及 `verifier/shrimp-import.ts`。

## 功能与回归

- `npm run check:shrimp`：**57/57**，含局部／全窗口分裂上限、同时完成分裂、背包满、游泳、受惊、钝人中断捕食和模型结构。[日志](check-shrimp.log)。
- `npm run verify:shrimp` 和 `npm run verify:shrimp -- --classic`：各 **18 项**真实引擎检查通过，覆盖 E 扫描与活抓、重复交互不复制、丢弃放生、无害 AI、实际食用、Tom 配方、死亡掉落与重复结算、分裂子体、钝人按住／吃掉／诱饵冷却、飞蛾追击时忽略普通虾并改吃诱饵、反复回收。
- `check:dullers`、`check:duller-integration`（351）、`check:refined-items`（2,050）、`check:item-batches`（29）、`check:entity-forms`（200）、`check:entity-preparation`（17）、`check:rats`（50）及 `check:model-warmup`（111）通过。精细物品工厂为 54 件，三种旱虾由专用工厂处理。
- `npx tsc -b --pretty false`、`npm run build` 通过。[构建日志](build.log)仍包含项目已有的字体路径、PostCSS 和较大代码块提示。
- 浏览器运行无脚本／着色器错误，无资源请求失败（除验证页自身的 `favicon.ico` 404）。各报告记录实际 `--headless=new`、独立用户目录／端口及清理结果。使用内存存储，不覆盖玩家存档。

真实光影连续四轮回收后保持 **152 个几何、96 张贴图**；经典保持 **145 个几何、66 张贴图**。这些是整个场景的 GPU 资源计数，包含已经预备的物品与捕食者共享贴图，不是单只旱虾的成本。

## 桌面采样与限制

GPU：NVIDIA GeForce RTX 4060 Laptop，Chrome Headless、ANGLE D3D11。同一取景预热后分别采样五轮，每轮至少 120 帧且至少 1.2 秒。原始帧时间、绘制调用、三角面与资源计数见四个目录的 `result.json`；汇总见 [采样数据](performance.json)。

| 场景 | 五轮中位帧时间的中位数 | 五轮 P95 的中位数 |
| --- | --- | --- |
| 真实，导入前 | 4.2 ms | 4.3 ms |
| 真实，导入后 | 4.2 ms | 4.3 ms |
| 经典，导入前 | 4.2 ms | 4.3 ms |
| 经典，导入后 | 4.2 ms | 4.3 ms |

实体自身从 **28 网格／336 三角面**变为 **8 网格／6,520 三角面**；三种静态物品各 **3 网格／6,520 三角面**。细节增加，绘制批次减少。当前桌面采样接近帧率上限，不能用相同帧时间推断 GPU 成本完全相同。真实模式受阴影更新帧影响，末帧调用数会波动；不把单帧计数当作全场景调用上限。

新实体首次完成整条显示准备链约真实模式 1.33 秒、经典模式 0.60 秒；这是生成、队列等待与 GPU 预热的合计等待时间，不能等同于单帧卡顿。上述真实模式运行与构建时间部分重合，不作为严格无干扰性能基准。尚未做大群旱虾压力测试和 Android 真机验证；鳍片阴影深度形变仍为包内已知限制。

## 重现命令

在 `app` 执行：

```powershell
npm run verify:shrimp
npm run verify:shrimp -- --classic
npm run verify:shrimp -- --baseline
npm run verify:shrimp -- --baseline --classic
```

两个 baseline 命令需要本次导入前留存于 `.cache/shrimp-v81-baseline/` 的完整 `src` 快照。日常运行游戏不需要该快照。压缩包的全量补丁与覆盖目录没有直接覆盖当前项目。
