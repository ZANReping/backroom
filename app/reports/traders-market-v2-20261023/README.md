# 商人之家市场 v2 接入验收 · 2026-10-23

已接入原项目 `E:\ZAN\backroom\app`。主力店 A（66×81.6 米）成为八个部门的批发市场，包含货架、商品、结算台、会员台、收货设备、108 块导视及 18 名市场人物。其余空铺、旧任务与仓储权限、银行账户保留；外部 BNTG 人物不迁入。六件新增物品的图标、地面和手持模型、库存、使用及滋水枪液体表均接入。

## 来源与合并范围

- 用户文件：`C:/Users/ZANRe/Downloads/backroom-traders-market-v2.zip`。
- SHA256：`83c30a1bebae8f56f5c89c038081f64f6f4ce7052768ff7f69dc8aa725fb950d`。
- [导入清单](import-manifest.json)、[11 张贴图/图标的原始字节校验](asset-hashes.json)。市场 v1 依赖与 v2 增量一并合入；当前已实现的 NPC 闲置动作未被旧补丁覆盖。
- 保留工作区其他改动；GitHub 副本、app-lite、冻结的联机代码未修改。本轮未提交 Git。
- 来源及包内生成提示词保存在 `app/SIGNS-SOURCES.md`、`public/textures/items-refined/SOURCES.md`。包内旧 SwiftShader 预览结果不是此次验收依据。

接入时适配 TypeScript 不允许的参数属性写法；修正办公室铭牌的底座厚度/朝向。市场入口旧“只收压印币”图稿改用原生文字铭牌，支持现金、信用点与混合支付。市场加载阶段提前请求六件物品的共享图集，避免首次手持出现纯灰占位。图集生成脚本支持 Windows 字体路径及独立输出目录；交付仍使用原压缩包 PNG/JPG。

## 自动检查

| 检查 | 结果 |
|---|---|
| `npm run build` | 生产构建通过；保留现有大包体积警告 |
| `npm run check:traders-market` | 743 项：档口库存、标牌、人物归属、位置/朝向、通路、碰撞、预留部门 |
| `npm run check:market-items` | 27 项：医疗箱次数及用尽、火盐拆分及满包拒绝、两种新液体 |
| `npm run check:refined-items` | 2,310 项；60 件细化物品最大 980 三角面、3 批次；UV 和实例释放通过 |
| `npm run check:item-batches` | 29 项通过 |
| `npm run check:model-warmup` | 111 项通过 |
| `npm run check:texture-images` | 96 项通过 |
| `check:traders-keep / fitout / gates / dressing / visibility` | 全部通过 |
| `npm run check:bntg-bank` | 交易原子性、旧存档、现金/信用点及 ATM 模型通过 |
| `python scripts/gen-market-item-atlas.py --output .cache/traders-market-v2-20261023/regenerated-atlas` | Windows 执行通过，没有覆盖交付贴图 |

## 实际游戏流程

使用实际 React App 与 Engine，Chrome `--headless=new`，独立动态端口与临时 profile；未连接用户浏览器。真实模式 **85 项**、经典模式 **84 项**通过，两个模式各保存 31 张截图，浏览器运行错误及网络失败均为 0。结束后仅关闭本轮自建浏览器/服务器并删除自己的 profile。

- 从缺少 `bntgBank` 字段的旧格式快照进入商人之家，余额默认 0；原六名联系人、本地居民与 18 名市场人物归属正确。
- 实际按 E 打开银行 ATM，存款/取款、双击确认幂等、取消与金额校验、横竖屏窗口布局。
- 糖佬原有交易、照明档口信用点购买、急救箱档口混合支付；存档后完整页面重载，账户与商品不重复。
- 逐一走到八位老板的柜台前，准星命中对应 NPC，打开对话与交易，均显示信用点结算。
- 六件物品逐一按快捷栏键拿出，颜色/法线/真实模式粗糙度已加载；拍摄第一人称实物。
- 两种医疗箱经过真实使用计时分别恢复 30/40 HP、消耗一次；丢下医疗箱后用实际准星扫描和 E 捡回，剩余 3 次不变。
- 火盐一盒拆成 5 份、记忆汁液装入滋水枪。真实模式额外完整重载一次，医疗箱 3/7 次及 5 份火盐恢复正确。
- 跨区往返三轮后资源稳定；ATM 开关 12 次资源稳定；新开局清空旧银行账户。

真实模式结果：[runtime.json](market-realistic-final/runtime.json)。经典模式结果：[runtime.json](market-classic/runtime.json)。两者校验脚本一致；真实模式最后追加了一次多次使用物品的整页读档断言。

## 视觉记录

已检查入口、左右档口、货架通道、收货区、结算区、营业告示、交易面板与全部新物品的实际截图。图中央淡色“开发者模式”字样是现有 HUD 水印。

| 视角 | 真实模式 | 经典模式 |
|---|---|---|
| 市场入口 | [截图](market-realistic-final/20-market-entry.png) | [截图](market-classic/20-market-entry.png) |
| 档口与老板 | [截图](market-realistic-final/22-left-stalls.png) | [截图](market-classic/22-left-stalls.png) |
| 托盘货架 | [截图](market-realistic-final/24-rack-aisle.png) | [截图](market-classic/24-rack-aisle.png) |
| 收货区 | [截图](market-realistic-final/25-receiving.png) | [截图](market-classic/25-receiving.png) |
| 信用点营业告示 | [截图](market-realistic-final/27-market-credit-notice.png) | [截图](market-classic/27-market-credit-notice.png) |
| 急救箱档口交易 | [截图](market-realistic-final/21-trade-medkits.png) | [截图](market-classic/21-trade-medkits.png) |
| 记忆汁液手持 | [截图](market-realistic-final/30-held-memoryjuice.png) | [截图](market-classic/30-held-memoryjuice.png) |
| 户外医疗箱手持 | [截图](market-realistic-final/30-held-outdoorkit.png) | [截图](market-classic/30-held-outdoorkit.png) |

## 性能与回收

设备由 WebGL 查询确认为 NVIDIA GeForce RTX 4060 Laptop GPU / D3D11。1920×1080 原生分辨率、DPR 1、动态分辨率关闭、自动曝光关闭。固定种子 424242，市场 `(43,89)`，yaw=0、pitch=-0.04；构建完成再预热 2.5 秒，各采样 5×90 帧。表中为五轮各自中位数/P95 的范围，记录整帧绘制量。

| 模式 | 帧间隔中位数 | P95 | 绘制调用 | 三角面 | 附近 NPC |
|---|---:|---:|---:|---:|---:|
| 真实 | 5.7–6.7 ms | 9.1–10.4 ms | 477 | 572,867 | 31 |
| 经典 | 4.2–5.0 ms | 6.6–8.1 ms | 474 | 584,801 | 31 |

市场人数仍由 32 人上限管理。真/经典模式在本次固定市场视角均低于 16.7 ms 中位数和 20 ms P95；这是 Chrome 无头环境的 RAF 帧间隔，不能作为 Android 真机或所有视角的性能结论。两次路线状态分别保留 28/29 个区块（真实模式追加读档），因此数据不用于精确比较两种光影的性能差值。

三轮“市场→办公后区→市场”结束后，真实模式每轮均为 **1135 几何 / 111 贴图**，经典模式每轮均为 **1151 / 115**；都是 28 个区块、31 名附近人物、0 个待构建任务。另有银行固定视角 5 轮数据及 12 次 ATM 交互回收记录，见各 runtime.json。

## 复现

在 `E:\ZAN\backroom\app` 运行：

```powershell
npm run check:traders-market
npm run check:market-items
npm run check:bntg-bank
npm run check:refined-items
npm run build
npm run verify:traders-market -- --label=market-realistic-repeat
npm run verify:traders-market -- --classic --label=market-classic-repeat
```

运行脚本会独立创建测试存档和浏览器，不覆盖日常玩家存档。常规游玩：进入商人之家，前往西北角主力店 A；各档口在中间通道两侧。继续旧商人之家存档即可加载更新，无需清空进度。

未额外执行所有层级、所有实体的大范围回归；此次验证限定于本包涉及的市场、银行、物品与公共模型/贴图加载路径。包内已声明“暂无功能”的巴别润唇膏继续为收藏物，驱笑剂和记忆汁液的滋水枪效果按包内设计等同清水。
