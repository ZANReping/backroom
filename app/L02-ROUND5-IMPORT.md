# Level 0.2 第五轮升级接入

2026-10-26，增量接入用户提供的 `L0.2-第五轮升级包.zip`，目标为原项目 `E:/ZAN/backroom/app`。附件从 `983cde3` 升级到 `6334e68`，游戏代码至 `4ab3e51`。保留已有猎犬、爬菌、人物、手部、序章、物品和资源回收修改。

## 当前变化

- 倒墙切口覆盖墙顶、墙脚、自由端、护角、防撞条与凸出的插座面盖；倒下的墙板保留相应细节。墙体碰撞和贴墙小件同步移除，正在使用的插座随墙消失并断开手机充电。
- 细化马桶、隔断、洗手台、路由器和板夹，以及吊顶内喷淋／风管／桥架和楼板下房屋的管卡、接线盒、施工灯、工具、桶、锥桶等。按材质合批，使用既有 PBR 与顶点受光。
- 灯盘复用 Level 0 本体模型、发光色和光源参数，按适合本层吊顶的 **3.6×4.2 米**晶格布置，并避开墙体；保留与普通 Level 0 的区别。
- 补齐 2.7 米吊顶的身体碰撞与 12cm 相机余量；掉板处的设备层允许额外 45cm 高度。塌陷和碎石坡通行保持正常。
- 进入卡明确显示“Level 0.2 · 重塑的混乱”及副标题；实际进入后，图鉴 Level 0 页的“子层级”区块解锁本层。天顶站、冰室仍为锁定占位。
- 隔间的树外边留墙率提升至 55%，办公室候选墙段增加到 4–7；入口视轴附近移除容易形成白色竖线的生成墙，保持通行。
- 开发者世界面板的“Level 0.2”分区默认收起，展开后保留施工许可、施工点和崩塌调试。
- 返回门改为每个 64×64 米门区确定性选择候选位置，出生点 44 米内不放门；可遇到多扇返回门，接近任意一扇都会停止崩塌，交互后返回原施工点。入口提示指向最近的门。
- BRC 文档使用施工许可证、日志、工作单、巡检记录表四种纸质版式，包括表头、填写栏、签名、印章和来源页脚。领取许可时会打开许可证，按 Esc 或“放回”继续。
- 出生区保证附近有 Wi-Fi 路由器和“公司口号”板夹；没有合适的近墙位置时采用包内的入口旁落地摆放。

本地合并还保留／补齐了：塌墙上限达到 24 段后不淘汰旧切口、门数据缓存上限、实例私有几何释放和共享材质保护；修正 L 形短臂偏半墙厚时仍可能留下入口竖线的情况，并消除新材质传入未定义 `side` 的 Three.js 提示。

## 操作与兼容

施工许可仍需 BRC 声望大于 60，并在 Level 0 的合适完整墙面附近使用。许可和磁带的关键物品保护不变，主存档仍为 `v:1`；本层崩塌仍为每次进入的临时状态。原功能介绍见 [首次接入说明](HOUND-L02-IMPORT.md)，返回门距离以本轮自然生成规则为准。

本轮只修改 `app` 与根说明。联机保持封闭，未更新 GitHub 副本或 `app-lite`。

## 验证

```powershell
npm run check:l02-round5
npm run check:hound-l02-integration
npm run check:l0-architecture
npm run check:l0-meshes
npm run check:l0-presentation
npm run check:foyer-entry
npm run check:phone-stat-lock
npm run build
node scripts/verify-l02-round5-import.mjs --label=review-realistic
node scripts/verify-l02-round5-import.mjs --classic --label=review-classic
node scripts/verify-l02-round5-import.mjs --perf-only --label=review-steady-realistic
node scripts/verify-l02-round5-import.mjs --classic --perf-only --label=review-steady-classic
node scripts/verify-l02-round5-import.mjs --visual-only --label=review-closeups
```

浏览器脚本使用独立端口、临时配置、内存存档和真正无头的原生 GPU Chrome。固定 L0.2 验收种子为 `20261025`，不触碰玩家存档；默认 Chrome 路径可通过 `CHROME_PATH` 覆盖。

[来源、原包示例与版本清单](assets/l02-round5-import/SOURCES.md)；[实测报告、性能与限制](reports/l02-round5-import-20261026/README.md)；[截图索引](reports/l02-round5-import-20261026/comparison.html)。原包 SwiftShader 报告仅保留为来源证据，本轮另做了原生 GPU 验收。
