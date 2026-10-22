# 商人之家 NPC 归属与 B.N.T.G. 银行 ATM

日期：2026-10-22。实现目录：`E:/ZAN/backroom/app`。本次修改原项目，没有同步 GitHub 副本。既有未完成商铺与未开通区域保持原规划，联机继续关闭。

## 完成内容

商人之家保留六名原设固定联系人和 154 名当地居民；附近活动上限仍为 32 人。外部 B.N.T.G. 人物不再被放进商人之家，读取旧据点记录时也过滤已移除的错误落点，保留人物、任务、声望和职业进度。

| 固定人物 | ID | 归属 |
|---|---|---|
| 莱恩·卡特 | lan | 商人之家迎新／公共服务 |
| 「糖佬」希德 | candyman | 商人之家公共区 |
| 奥托·格雷 | laozhangfang | 商人之家保险库总账 |
| 塞德里克·科尔曼 | shen | 商人之家鉴定工位 |
| 玛戈·坦恩 | tang | 商人之家杂货服务工位 |
| 布洛克·奎 | kui | 商人之家警备办公区 |
| 薇拉·维斯珀 | vesper | 保留在 Level 2 · EL3A，不进入商人之家 |
| 卡尔迪达·里维拉 | dorian | 保留在 Level 3 · 存储设施／仓管办公角，不进入商人之家 |

银行南墙增加两台 ATM，中心平面坐标为 `(103, 105.382)`、`(107, 105.382)`，正面朝北。走到正面并瞄准后按 **E**，移动端使用既有交互键。

- 1 枚压印币 = 1 信用点，存取款均无手续费。存入扣除随身实体币，取款把信用点兑换回实体币。
- B.N.T.G. 商人交易提供“信用点”“现金”和“优先信用点、差额现金”三种支付方式，外部据点的 B.N.T.G. 商人也适用。原商品价格、声望／银舌头折扣、糖佬批量换物数量和杏仁水兑换比例保持原有规则。
- 原有临时仓储服务费支持信用点与现金混合支付，并保留同一对话内已付费许可。
- 账户属于当前存档；主存档版本仍为 `v:1`，新增可选 `bntgBank` 字段。新开局与不含该字段的旧档余额为 0；账户余额和最近 12 笔明细持久化。
- 先校验余额、实际商人／ATM、背包容量，再一次性提交背包与账户。交易失败、取消、金额无效时不扣款；连续点击确认只提交一次。

## 模型与终端界面

ATM 使用带凹入屏幕的金属机身、侧挡板、读卡口、数字键盘、红黄绿功能键和两个现金槽。每台模型 **2,630 三角面、10 个网格／绘制批次**；标签按材质合并。几何由实例持有，材质和已有图集共享，不新增灯光、后处理或专用纹理下载。

UI 为金属终端外壳及内嵌银行屏幕，包含存款、取款、余额、明细四项服务，以及金额输入、确认、短暂处理状态和交易回执。支持键盘、实体式屏幕键盘、快捷金额、Esc 返回、焦点约束和移动端横竖屏。每次交易后立即保存，关闭处理画面不会重复扣款。

模型、UI 和银行文案为项目原创。材质沿用项目现有 CC0／自绘资产；来源记录见 [TRADERS-KEEP-SOURCES.md](../../TRADERS-KEEP-SOURCES.md)。

## 自动与实际游戏验证

- 银行逻辑／人物归属／模型检查：**38 项通过**，涵盖多堆叠现金、金额上限、满背包、仅信用点／仅现金／混合支付、优惠、换物、远处和其他阵营拒绝、存读档、旧 NPC 落点清理及实例释放。见 [bank-check.json](bank-check.json)。
- 实际 React 界面、真实 Engine 和存档槽：真实／经典模式各 **35 项通过**，各保存 14 张截图；两轮均无浏览器运行时错误和网络失败。
- 实际交易链：150 枚现金 → 存入 100 → 取出 20 → 信用点换八颗银舌头 → 信用点购买头灯 → 取出 44 → 用 5 信用点 + 11 枚现金购买笔记本。最终 103 枚现金、0 信用点，6 笔账目；重新载入后金额与物品一致。
- 相关回归：`check:traders-fitout`、`check:traders-keep`、`check:traders-gates`、`check:traders-visibility`、`check:traders-dressing` 通过。内饰 142 组、当地居民 154 人、128 间库房和 28 个空铺保持可达与原数量；未发现新增岗位／家具重叠。
- `check:arms` **80/80 通过**，同时确认快照包含新增可选银行字段、没有混入实体运行时状态。见 [存档回归日志](arms-save-regression.log)。
- 针对本次银行与交易 UI 的 ESLint 通过；生产构建通过。见 [eslint.log](eslint.log)、[build.log](build.log)。构建仍提示既有大包、字体路径等警告，没有构建错误。

## 静态银行场景采样

RTX 4060 Laptop GPU，ANGLE／D3D11，独立 Chrome `--headless=new`；种子 `424242`，Level `102`，1920×1080，原生分辨率、动态分辨率及动态曝光关闭，纹理档位 1，场景灯上限 16，阴影档位 1。银行取景中心约 `(105, 101.8)`，朝南（yaw π，pitch −0.13）；准确落点与视角序列保存在验证脚本。

等待当前位置完整流式窗口准备完毕（43 个数据区块、44 个已构建组、0 个待构建任务），冻结 NPC 移动后，以 RAF 间隔采样 5 轮，每轮 90 帧。以下是**已加载静态银行场景**的帧间隔，不代表移动、进场构建峰值或整个据点的综合性能。经典轮次运行时存在其他构建工作，不用两轮差值推断渲染模式的性能高低。

| 轮次 | 真实模式中位 / P95（ms） | 经典模式中位 / P95（ms） |
|---|---|---|
| 1 | 4.4 / 6.0 | 5.9 / 9.6 |
| 2 | 4.5 / 6.3 | 5.6 / 7.7 |
| 3 | 4.8 / 7.1 | 5.9 / 9.0 |
| 4 | 4.6 / 6.1 | 5.5 / 8.5 |
| 5 | 4.4 / 7.1 | 5.7 / 9.9 |

| 指标 | 真实 | 经典 |
|---|---:|---:|
| 场景绘制调用 | 473 | 459 |
| 场景三角面 | 244,745 | 244,731 |
| 连续 12 次开关 ATM 后几何数量 | 2,111 → 2,111 → 2,111 | 2,104 → 2,104 → 2,104 |
| 连续 12 次开关 ATM 后纹理数量 | 136 → 136 → 136 | 106 → 106 → 106 |

较早一轮 `bank-real-final-20261022` 在完整流式窗口尚未准备完时开始采样，误将后续区块加载计作资源增长；该失败记录保留。正式结果改为等待完整窗口后测量，连续开关资源稳定。没有用删除失败记录替代修正测量条件。

原始记录：[真实模式](bank-real-verified-20261022/runtime.json)、[经典模式](bank-classic-verified-20261022/runtime.json)。两轮浏览器与开发服务均已退出，独立临时配置目录已删除。390×844 与 844×390 是桌面视口模拟，未做 Android 真机性能验收。

## 截图

| 内容 | 真实模式截图 |
|---|---|
| 两台 ATM 与周围空间 | [场景](bank-real-verified-20261022/01-bank-machines.png) |
| 终端主菜单 | [主菜单](bank-real-verified-20261022/02-atm-home.png) |
| 存款金额、确认、回执 | [金额](bank-real-verified-20261022/03-deposit-amount.png) · [确认](bank-real-verified-20261022/04-deposit-confirm.png) · [回执](bank-real-verified-20261022/05-deposit-receipt.png) |
| 取款和明细 | [取款](bank-real-verified-20261022/06-withdrawal-receipt.png) · [明细](bank-real-verified-20261022/07-statement.png) |
| 移动端布局模拟 | [竖屏](bank-real-verified-20261022/08-atm-mobile.png) · [横屏](bank-real-verified-20261022/09-atm-landscape.png) |
| 信用点及混合支付 | [糖佬](bank-real-verified-20261022/10-candy-credit-payment.png) · [头灯购买](bank-real-verified-20261022/11-merchant-credit-receipt.png) · [混合支付](bank-real-verified-20261022/12-mixed-payment.png) |
| 读档恢复 | [明细恢复](bank-real-verified-20261022/13-restored-ledger.png) |
| 经典模式模型回归 | [经典场景](bank-classic-verified-20261022/01-bank-machines.png) |

## 复现命令

在 `E:/ZAN/backroom/app` 执行，验证脚本会使用独立临时浏览器配置、动态端口和隔离存档，不使用日常浏览器：

```powershell
npm run check:bntg-bank
npm run check:traders-fitout
npm run check:traders-keep
npm run check:traders-gates
npm run check:traders-visibility
npm run check:traders-dressing
npm run check:arms
npx eslint src/components/BntgAtm.tsx src/components/DialogOverlay.tsx src/game/engine/bntgBank.ts
npm run build
npm run verify:bntg-bank -- --label=bank-real-recheck
npm run verify:bntg-bank -- --classic --label=bank-classic-recheck
```

手动：继续已有存档或新开局到商人之家银行，靠近 ATM 正面按 E；尝试存取款，再向糖佬或玛戈购买并切换支付方式。查看 ATM 明细，退出后读档确认余额。原有其它层级的 B.N.T.G. 人物仍在其所属据点。
