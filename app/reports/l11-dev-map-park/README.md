# L11 地图、出口工具与公园地面修复

2026-10-16 · `app` 单人模式。最终完整验收通过。

## 修改

- 大地图的当前位置、出口、地铁、档案馆、建筑入口和搜刮状态图例移至地图下方，横向排列；窄屏自动换行。室内与地铁保留各自适用的符号，地图尺寸仍由 canvas 容器测量。
- 开发者出口工具提供独立的“召唤出口”和“传送到出口”模式。按类型和目的地选择，显示实际层级名称（包括 Level 601），支持取消查找和结果提示。
- 召唤检查建筑、楼层、道路、通行与间距条件。未完工楼、砖楼、电梯井和档案馆使用其实际宿主；普通多层办公楼可新增上层办公间出口，门的模型与碰撞同步更新。重复召唤不会移动玩家。路牌保留 90 米间距和同街区数量限制。开发召唤沿用临时出口生命周期，宿主区块完全卸载后失效。
- 传送在 Worker 中搜索未加载区域，按空间距离下界确认最近出口，再检查目标周围 6 米的实际碰撞和落脚高度；排除深水、井口、楼梯半坡和不受支撑的边缘。取消、查找失败或无安全落点时保留原位。L11 搜索区域上限 4 千米，其他无限层为 2 千米，另有运行时间预算；未能确认最近出口时会明确提示。
- 公园草地从混凝土底面中裁出独立区域，合并格子后生成地面，剔除道路、步道、水体、建筑和广场范围；保留现有 CC0 材质及世界坐标 UV。
- Level 0 的开发召唤同时适配实际薄墙，并同步墙面闪烁效果。

## 验证结果

- `npm run build` 成功。完整日志见 `build.log`。
- 出口、表面、模型检查成功；模型检查覆盖 32 种建筑和 108 种装饰。
- 3 个种子、15 个公园区块的草地/底面面积覆盖与道路裁切检查通过，包含负坐标；13 个最近出口静态比较通过。
- 实际游戏验证城市/窄屏/室内/地铁地图，5 种 L11 建筑出口的最近定位、安全落点和合法位置恢复；验证新增办公门的碰撞、路牌召唤及相邻路牌拒绝、取消查找和不合法召唤。
- 公园 3 个视角、75 个实际渲染地面采样及步行检查通过；草地下无同高混凝土/铺装重复层。
- Level 0 实际召唤与安全传送回归通过。
- 浏览器运行错误 0；网络仅记录验证页 `/favicon.ico` 的 404。
- 本次浏览器、Vite 服务、子进程、监听端口和配置目录均已检查清理，见 `cleanup.json`。

浏览器：Chrome/155.0.8059.40，实际 `--headless=new`；1920×1080、窄屏 820×950，真实光照，种子 20261006。
渲染硬件：ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)。

本轮未逐层重测其他层级全部出口，也未进行新的 60 FPS 性能验收。深水与洞顶类型只恢复符合原生成条件的环境宿主。

## 执行命令

在 `app` 中执行（清理脚本通过 PowerShell）：

```text
npm run build
npm run check:l11-exits
npm run check:l11-surfaces
npm run check:l11-meshes
npx esbuild scripts/check-l11-dev-ground.ts --bundle --platform=node --format=esm --outfile=.cache/check-l11-dev-ground.mjs
node .cache/check-l11-dev-ground.mjs
node scripts/verify-l11-dev-map-park.mjs
node scripts/verify-l11-dev-map-park.mjs --park-only
node scripts/verify-l11-dev-map-park.mjs --summon-only
./scripts/check-l11-dev-cleanup.ps1
```

原始数据：`runtime/runtime.json`、`runtime/console.json`、`ground-check.json`、`verification.json`。
截图入口：`index.html`。
