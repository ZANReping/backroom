# 钝人更新包导入验收 · 2026-10-08

已将 `backroom-duller.zip` 中的无面长臂模型、动作、专属 AI、合成穿墙音效、携物掉落、杏仁水驱避和图鉴内容接入 `app`。保留原物种 ID、基础属性及生成表。单机范围，联机继续冻结。来源、哈希和本地修正见 [导入记录](../../assets/duller-import/IMPORT.md)。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run check:dullers` | 原包 18 项行为检查通过 |
| `npm run check:duller-integration` | 351 项断言通过 |
| `check:hounds` / `check:hound-integration` | 通过，共享几何辅助方法及战斗、移动钩子回归 |
| `check:smilers` / `check:smiler-integration` / `check:smiler-forms` | 通过 |
| Level 2 经典 / 真实生产渲染 | 各 20 项核心检查通过，另截取四种姿态；无浏览器运行错误 |
| `npm run build` | 通过；保留已有字体路径、Browserslist、PostCSS、动态导入及大包提示 |

集成检查覆盖：实际 Engine 的厚墙/薄隔墙、地面/上层楼板、完整潜伏—伸臂—拖拽—按住—逃离过程、净空和深坑保护、单一抓取者、抓取期间普通移动/重力、中途快照、受击/致命攻击/死亡/杏仁水/冻结/移除实体的安全释放、按住时地形变化、流式原点移动、引擎间气味隔离、开发者召唤、携物只掉落一次，以及几何/UV/法线/动画有限数值和独立释放。

实际浏览器使用生产 `Engine` 和渲染器、真实 Level 2 建筑，完成隔墙抓取与伤害结算，玩家从 100 HP 变为 65.5 HP 并安全释放。其后冻结姿态检查四种模型表现。独立内存存储不写用户存档。初次截图取景被非实心管道仪表遮住，已改选无遮挡真实墙面并后退取景；没有替换场景几何或材质。初次 favicon 404 已在独立验证页面中通过空图标处理，最终错误记录为空。

## 模型及回收

- 本体 23 个 Mesh、18,110 三角面（包含隐藏的污痕网格）；携罐头时合计 35 个 Mesh、19,690 三角面。Mesh 数不等同于含阴影通道的实际 GPU 绘制次数。
- 三张共享 256² 程序化贴图；每实例几何/材质独立。携物变更不会重建身体。
- 皮肤/头部与原包近景预览对照一致，生产模式下确认贴图和头部纵向骨棱、四肢轮廓、携物及贴墙污痕正常显示。
- 每轮同时生成两只、移除后等待预热队列清空，连续三轮资源数完全一致：真实模式几何 **969** / 贴图 **163** / 程序 **51**；经典模式 **938 / 139 / 36**。这些是整个验证场景的回收后总数。

## 截图与数据

- [原型全姿态](prototype-poses.png)、[头部近景](prototype-close.png)、[原型墙面](prototype-wall.png)。
- 真实模式：[游荡/携物](game-realistic-roam.png)、[真实墙面伸臂](game-realistic-reach.png)、[按住](game-realistic-hold.png)、[逃离](game-realistic-flee.png)。
- 经典模式：[游荡/携物](game-classic-roam.png)、[真实墙面伸臂](game-classic-reach.png)、[按住](game-classic-hold.png)、[逃离](game-classic-flee.png)。
- [真实检查与资源数据](game-realistic.json)、[经典检查与资源数据](game-classic.json)、[浏览器版本](browser.json)、[实际启动参数](browser-launch.json)。
- `*-errors.json` 保存浏览器错误；`check-*.log` 与 `build.log` 保存命令结果。

## 复现

在 `app` 中运行 `npm run check:dullers`、`npm run check:duller-integration` 和 `npm run build`。

浏览器检查：设置 `L0_VERIFY=1`，运行 `npm run dev -- --host 127.0.0.1 --port 3007 --strictPort`。另启独立 Chrome，参数包含 `--headless=new --remote-debugging-port=9238 --user-data-dir=<app>/.cache/duller-qa`，打开 `http://127.0.0.1:3007/proto-duller.html`。禁止复用日常浏览器或其它任务的配置目录/调试端口。

依次运行：

```text
node scripts/verify-duller-import.mjs proto
node scripts/verify-duller-import.mjs game realistic
node scripts/verify-duller-import.mjs game classic
```

可用 `DULLER_QA_URL` / `DULLER_QA_CDP` 指定独立服务与调试端口。固定种子 `20261006`；生产截图视口 1600×1000、DPR 1、FOV 64，原型 1600×800；取景坐标记录在 JSON，墙面视图沿入口法线后退至 1.6 米处。浏览器以 `--headless=new` 启动，进程记录与 HeadlessChrome UA 双重确认；没有操作用户浏览器。

## 验收边界

本轮为脚本化实际游戏检查，未进行人工长时间游玩或音效听感评价，未做 Android 真机检查。JSON 的帧时间来自包含切换/预热的验证过程，不是预热后五轮、1080p 固定负载的正式性能基准；不据此宣称达到某个 FPS 目标。原有笑魇随机相位可见性检查的已知不稳定项见猎犬导入报告，本轮未改动该姿态模块，也未将固定相位结果冒充全面通过。

`dl` 瞬时 AI 状态不入存档，读档不会继续正在进行的抓取；保存时已把玩家写到经过碰撞验证的安全端点。主存档仍为 v1。
