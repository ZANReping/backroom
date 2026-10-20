# 第一人称手部 v71/v72 导入验证

2026-10-14。来源：用户提供的 `backroom-hands-all-v71-v72.zip`；哈希与许可记录见 [SOURCES](../../assets/hands-import/SOURCES.md)。仅合并手部增量，没有覆盖完整 renderer，也没有重新导入旧人物/层级代码。保留已有工作区修改；联机继续冻结，app-lite 未修改。

## 接入内容与修复

- `retroViewHand.ts`：四指分节、拇指、掌腕、前臂及袖口。按物品可见表面采样调整握姿；右手工具、瓶罐和空拳，左手手电/打火机共用模型。
- `viewmodel.ts`/`renderer.ts`：肤色、隔热手套、防护服、短袖/背心/长袖联动；沿用原使用计时器、武器/投掷/搜索节奏和持物缓存，检视绕握持位置转动。
- 修复原包缓存不完整释放，改为最多 16 份握姿的 LRU；释放初始空几何、淘汰几何及实例材质，保留共享袖子图像。隐藏父节点内的模型不参与接触采样，父级变换先正确更新。
- 新手部接入既有 L0 局部熄灯/暗部色度及 L1 间接光探针；无手部自发光、额外灯光或后处理。
- 保留原型页的 hands/items、anims、looks、flash 检查入口。随包 15 张图是上游预览，位于 `reports/retro-npc/v71`、`v72`，不作为本次游戏验收证据。

## 验证结果

| 命令（在 app 目录） | 结果 |
|---|---|
| `npm run check:retro-hands` | 12,032 项断言；83 个枚举条目（含空手、枪糖形态），492 个有物品的左右手/袖长组合；每手 448 或 520 三角，最多 2 次绘制 |
| `npm run verify:hands -- after` | 271 项实际 Engine/Renderer 检查；当前物品切换、接触几何缓存、检视复位、实际饮用消耗、投掷单次生成、挥砍、装备/袖长、暂停/隐藏及经典/真实模式 |
| `npm run verify:hands -- dark` | 固定展示熄灯区；位置查询确认 blackout=1，真实/经典模式及手电开关截图 |
| `npm run check:model-warmup` | 83 项通过 |
| `npm run check:program-completion` | 58 项通过 |
| `npm run check:texture-images` | 96 项通过 |
| `npm run check:item-batches` | 29 项通过 |
| `npm run build` | TypeScript + Vite 通过，Vite 32.07s；已有字体/CSS/大包警告保留 |

生产构建初次被沙箱文件解析权限阻止（`build-sandbox-error.log`），正常本机权限重跑成功（`build.log`）。最终 `after-errors.json`、`dark-errors.json` 无运行/着色器错误；基线只有 favicon 404。

四轮八物品往返切换后，GPU 几何/纹理稳定为 **270 / 129**；单位检查另覆盖每份观察到的缓存几何释放一次、材质释放一次、纹理共享及销毁另一实例不受影响。几何/UV 数值检查不能代替逐角度接触验证。

## 实际游戏截图

以下图已打开检查；手指为原包复古低模风格，刻意保留棱面。

- [导入前](before-crowbar.png) / [导入后](after-crowbar.png)：相同出生点、手电与撬棍。
- [长袖工具](game-crowbar.png)、[短袖](game-short.png)、[手套](game-gloves.png)、[打火机](game-lighter.png)。
- [饮用中段](game-drink.png)、[滋水枪](game-squirtgun.png)、[检视斧头](game-inspect.png)。
- [熄灯区手电开](game-dark.png)、[手电关](game-dark-off.png)、[经典模式](game-dark-classic.png)。手部在未受直接照明时为黑色轮廓，不自行提亮。
- [物品预览](models-items.png)、[动作预览](models-anims.png)、[外观联动](models-looks.png)、[副手预览](models-flash.png)。这些是当前代码的独立模型预览，实际游戏检查见上面的 game 文件。

## 性能与限制

同一设备：Windows、RTX 4060 Laptop / ANGLE D3D11、真正无头 Chrome 154，1920×1080、DPR 1、真实光影、纹理 2、场景灯 16、手电开启、FOV 75。固定种子 20261006，据点 104，位置 (40.5,25.5,0)，yaw=.42、pitch=.015；默认短袖。预热后前后各五轮，每轮至少 180 帧/1.2 秒。原始数据：`before-performance.json`、`after-performance.json`。

| 项目 | 导入前 | 导入后 |
|---|---:|---:|
| 五轮帧时间中位数 | 4.2 ms | 4.2 ms |
| 五轮 P95 范围 | 4.4–4.7 ms | 4.5–4.7 ms |
| CPU 中位数范围 | 2.8–2.9 ms | 2.7–2.8 ms |
| GPU 中位数范围 | 3.42–3.67 ms | 3.19–3.69 ms |
| 普通帧绘制调用 | 137 | 136 |
| 普通帧三角数 | 38,793 | 39,653 |
| 热状态几何 / 纹理 | 151 / 92 | 150 / 92 |

原始记录前后各一次统计末帧碰到环境探针刷新：702/701 调用、301,869/302,729 三角。保留原始数值；表中的普通帧并非最大调用数。本对照只能说明这个静止视角的稳态成本，没有验证所有层级、持续移动或 Android 真机。

首次切到尚未准备的物品仍有长帧：最终全物品扫描最大 449.8ms（滋水枪），其它约 310–326ms。该测量包含模型、纹理/着色器准备和两帧等待，不能等同握姿求解时间。补充单次 CPU 探查，五种代表物的接触求解为 8.5–13.8ms，命中缓存时低于计时分辨率；此非五轮性能结论。未据稳态结果宣称首次切换无卡顿。

接触求解是有限表面采样，并非精确实体碰撞。小物件、扁物件和较粗物品仍可能出现手指留缝/拇指伸出，检视中绕轴转动也未穷举全部相位；不能承诺所有物品零穿插。手部模型保持包内比例。饮用中段瓶身接近屏幕右上方是既有动作节奏。没有修改消耗、伤害、投掷结算、存档字段或人物形象格式。

## 复现

在 `app` 下启动独立服务器：

```powershell
$env:L0_VERIFY='1'
npm run dev -- --host 127.0.0.1 --port 3011 --strictPort
```

启动专用浏览器，必须使用真实 headless 参数和独立 profile（本次启动与进程记录见 `browser.json`、`processes.json`）：

```powershell
$qaProfile = Join-Path (Get-Location) '.cache\hands-qa'
Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' -WindowStyle Hidden -ArgumentList '--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--remote-debugging-port=9242',('--user-data-dir="'+$qaProfile+'"'),'http://127.0.0.1:3011/verifier/l0-remake.html?level=104'
npm run verify:hands -- after
npm run verify:hands -- dark
npm run verify:hands -- cleanup
```

验证页面使用内存存储和实际游戏渲染器，不读取/覆盖玩家存档。`before` 命令只能对旧代码运行；本次旧文件快照保留在 `.cache/hands-import/baseline`，不要在当前代码上重跑并冒充旧版基线。测试完按 `processes.json` 核对命令行，仅关闭自己的服务器。报告目录保留清理记录。
