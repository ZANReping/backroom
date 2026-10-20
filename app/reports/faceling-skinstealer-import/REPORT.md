# 无面灵与窃皮者 v73–v77 导入验收

日期：2026-10-14。范围：`app` 与根 `info.md`，单人游戏。保留已有工作区内容，按增量补丁合并，未覆盖整套旧 renderer、人物或手部文件。压缩包信息和 Wikidot 署名见 [SOURCES.md](../../assets/faceling-skinstealer-import/SOURCES.md)。

## 已接入

- 普通无面灵：五档肤色的无五官皮肤；L3 进化无面灵：固定种子的异常眼、鼻、口、耳，最多三个脸面器官，保留原石器变体。骨骼、身体、衣服继续复用现有人物系统。
- 窃皮者：约 2.15 米真身、吸盘皮肤颜色/高度纹理、长臂手指、白眼、待机/追猎/攻击动画；随机人类伪装及 L5 侍者制服，0.7 秒剥皮过渡和借话气泡。
- 伪装、现形、温顺、饥饿、激怒状态；可搭话，近战/射击/滋水枪/投掷能击中伪装。HP 80、速度 2.6、伤害 25，按包内设计更新图鉴和 L1 低权重生成池。
- 合并补齐：真实 alpha 的透明血，眩晕中受击现形，视锥外消化/换皮，状态计时重置，新模型射线命中高度，L0/L1 环境光照，变身残影/气泡切层释放及共享贴图保护。

## 验证结果

| 检查 | 结果 |
|---|---|
| `npm run check:skinstealers` | 33 项行为检查通过，含追加的视锥、计时、立即现形、alpha 检查 |
| `npm run check:faceling-skinstealer-models` | 139,174 次断言通过；5,000 个 planner 种子、属性/UV/索引/骨骼权重、确定性、独占/共享资源、动画矩阵 |
| `npm run verify:faceling-skinstealer` | 实际 Engine/Renderer 26 项检查通过，包含生产近战、射击、滋水枪、投掷、搭话、近身现形和切层回收 |
| `node scripts/verify-faceling-skinstealer.mjs environments` | L0 暗区手电开/关、L5 侍者伪装、L3 进化无面灵的实际场景截图已检查 |
| `check:retro-avatar` / `check:retro-hands` | 2,441 / 12,032 次断言通过，保留人物与手部接入 |
| `check:hounds` / `check:dullers` | 通过 |
| `check:texture-images` / `check:model-warmup` / `check:item-batches` | 96 / 83 / 29 项通过 |
| `npm run build` | 最终类型检查与生产构建通过，Vite 27.24 秒 |

构建仍有字体运行时解析、PostCSS `from` 和大 bundle 提示。第一次沙箱构建因 Windows `realpath` EPERM 失败，在相同目录重新执行后成功。初期验证脚本字段/射线等待问题已修正；最终 `after-errors.json`、`environments-errors.json` 均为 `[]`。

模型统计见 `models.json`：样本普通无面灵 1,994–2,118 三角面、4 材质绘制组；L3 样本 2,188–2,346 三角面、5 组；窃皮者真身 8,992 三角面、23 网格绘制，4 张共享程序纹理。绘制组统计不含额外阴影 passes。

实际游戏连续四轮、每轮三次变身与删除后均保持 **145 geometries / 83 textures**；切层时剥皮残影和气泡清零。独立实例释放不会释放其他实例或共享图片。

## 截图与性能

实际测试：Windows、RTX 4060 Laptop / ANGLE D3D11、Chrome `--headless=new`，1920×1080、DPR 1、种子 `20261006`、纹理档 2、真实光影/泛光、场景灯上限 16。经典模式也截图复查。浏览器完整参数在 `browser.json`，坐标与场景参数在 `runtime.json`、`level-0/3/5.json`。

- `game-faceling.png`、`game-faceling-l3.png`、`game-faceling-l3-close.png`：普通/L3 无面灵和异常器官近景。
- `game-skin-human.png`、`game-skin-true.png`、`game-skin-true-close.png`、`game-skin-peel.png`：人皮、真身、近景和剥皮。
- `game-faceling-classic.png`、`game-skin-classic.png`：经典模式。
- `game-level-0.png`、`game-dark-off.png`：手电照出身体/阴影；关灯后身体变暗、仅白眼微弱可见。
- `game-level-5.png`、`game-level-3.png`：真实 L5/L3 地图中的新外形。

餐馆据点固定场景预热后五轮采样：帧间隔中位数均约 **4.2 ms**，P95 **4.3–8.4 ms**；GPU 中位数 **3.75–4.79 ms**，P95 **6.36–7.58 ms**。内存均为 168 geometries / 104 textures。记录帧的 draws 为 162 或 750，triangles 为 54,269 或 326,337（含该帧场景及阴影绘制）；不能把此值当成单个实体绘制数。详见 `performance.json` 和 `performance-summary.json`。

限制：这些是导入后的固定场景测量，没有执行完整改前/改后性能对照。首次模型/着色器准备存在数百毫秒尖峰。L5 全部 25 区块预热首次超过 60 秒，再等待约 33.3 秒才完成；其 `level-5.json` 包含构建期间统计，**不是稳定 60 FPS 验收**。此处没有重构 L5 整层加载。Android 真机、长时间全地图压力测试未验证。实体状态仍沿用现有活动实体生命周期，本包不增加每只实体的读档持久化。联机按要求冻结，不参与本次验收。

## 复现

在 `app` 目录执行上述 `npm run check:*` 和 `npm run build`。实际游戏验证使用独立服务、独立浏览器目录，避免接触日常浏览器或玩家存档：

```powershell
$env:L0_VERIFY='1'
npm run dev -- --host 127.0.0.1 --port 3012 --strictPort
```

另开终端启动 Chrome（必须保留 `--headless=new`），浏览器目录为当前 `app/.cache/faceling-skinstealer-qa`，CDP 端口 `9243`，初始 URL 为 `http://127.0.0.1:3012/verifier/l0-remake.html?level=104`：

```powershell
$qaProfile = Join-Path (Get-Location) '.cache\faceling-skinstealer-qa'
Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' -WindowStyle Hidden -ArgumentList '--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--remote-debugging-port=9243',('--user-data-dir="'+$qaProfile+'"'),'http://127.0.0.1:3012/verifier/l0-remake.html?level=104'
npm run verify:faceling-skinstealer
node scripts/verify-faceling-skinstealer.mjs environments
node scripts/verify-faceling-skinstealer.mjs cleanup
```

端口可通过 `ENTITY_QA_URL` / `ENTITY_QA_CDP` 改动；先确认未被占用。fixture 使用隔离内存存储，运行的是项目实际引擎和渲染器。结束时核验并关闭本次服务进程。本次清理已完成：`cleanup.json` 的 `clean: true`，独占端口和 QA 浏览器均无残留。
