# 枪械握持与瞄准手部接入（2026-10-24）

已接入原工程 `E:\ZAN\backroom\app`。五把枪采用更新后的前臂方向、护木托握、转轮双手包握、长枪眼位及枪托轮廓；瞄准时两手与袖子平滑淡至约 0.38 不透明度，离开瞄准、Alt 收枪和换物品均恢复。

## 来源及合并范围

- 用户提供 `C:\Users\ZANRe\Downloads\backroom-firearms-adshands.zip`，31,758,069 字节，SHA-256：`16c5b1b054191b1f0c36a20c380356fb4ec84a4f1ad2bb24755a20e5d31d4550`。
- 包内握持基线 `3e4a942`，更新 `8848701`，上游基线 `8b9a720`。当前工程没有中间握姿包，因此逐文件合入累计 overlay；以此前 full-shops 的源文件为共同基线，保留当前工程修正。未执行/应用包含其他功能的全量补丁。
- 运行代码：`firearmAnim.ts`、`firearmGuns.ts`、`firearmMesh.ts`、`firearmView.ts`、`retroViewHand.ts`；更新 `firearmsProto.ts` 诊断预览和相关检查。
- 本轮无新增外部模型或运行时图像资产。枪械材质沿用程序纹理，手和袖子沿用人物的共享贴图；包内 JPEG 为作者提供的效果参考。来源及本地修改见 [文件摘要](import-manifest.json)。
- 修改局限于 `app` 和根 `info.md`，保留已有更改及 7.30×7.05 米试射位，维持既有枪械数值、操作和存档字段；联机继续冻结。

## 工程适配

1. 共用 `FirearmView` 每次切枪重算该枪的瞄准变换，避免沿用上一把枪的眼位。
2. 转轮接触求解用的代理借用枪和手的资源，移除代理时只断开引用，不销毁借用几何/材质。临时弹药及抛壳仍按原有所有权释放。
3. 同一枪身的代理使用稳定接触缓存键，避免每次取枪重复求解/上传握姿；缓存仍有 16 项上限，人物袖长和姿势继续参与键值。
4. 半透明手增加共享原几何的深度代理，避免手指/掌心多层叠色；普通握持隐藏代理，短袖/无袖每手一个、长袖每手两个附加深度批次。新增三种袖长和重复举枪回归。
5. 保留现有抛壳/弹孔上限、跨流式原点平移、换层清理及手持模型缓存；不新增灯光。

## 自动检查

| 命令 | 结果 |
|---|---|
| `npm run check:firearms` | 147/147；五枪瞄准窗内手部顶点均为 0 |
| `npm run check:firearm-resources` | 48/48；资源隔离、恢复透明度、共用视图及转轮重复取枪 |
| `npm run check:retro-hands` | 17,232；116 类物品 / 690 组统计 |
| `npm run check:melee` | 131/131 |
| `npm run check:swim` | 89/89 |
| `npm run check:swim-integration` | 60/60 |
| `npm run check:refined-items` | 2,672；69 件，最多 1,108 三角面 / 3 批次 |
| `npm run build` | 成功，见 [最终构建日志](build-final.log) |

构建保留现有字体路径、PostCSS 及大 chunk 警告；本轮实际页面没有资源请求失败。各命令的日志位于本目录。

## 实际游戏验收

通过主界面“继续游戏 → 存档槽 1”进入正式 N14，未用模型原型代替实际对局。每种光影覆盖五枪腰射/瞄准/退出瞄准、真实 R 装填与 K 测试键击发、切换撬棍/打火机、Alt 收枪；另连续做八轮五枪切换与瞄准，共 40 次。

| 模式 | 实际检查 | 最后三轮几何数 | 贴图数 | 着色器程序数 | 控制台错误 / 请求失败 |
|---|---|---|---|---|---|
| 真实 | 35/35 | 1218 | 131 | 67 | 0 / 0 |
| 经典 | 35/35 | 1211 | 93 | 53 | 0 / 0 |

上述是同一固定视角的整场景资源数，预热后末三轮完全一致，不是单个枪模型预算，也不代表整游戏帧率承诺。初始审计中每轮多缓存一项转轮握姿，扩展采样证明是有界 LRU 预热；随后用稳定接触键消除了重复求解，最终结果在 `*-final/runtime.json`。初始/审计记录另保留用于追查。

验证设备：NVIDIA GeForce RTX 4060 Laptop，ANGLE / Direct3D11，Chrome `--headless=new`，1920×1080 原生分辨率。两个独立浏览器配置、端口和开发服务器均由脚本创建；完成后关闭本次进程并删除临时配置，`cleanup.profileRemoved=true`。

## 截图与复现

| 枪械 | 接入前 | 当前瞄准 | 当前瞄准 | 当前其他姿势 |
|---|---|---|---|---|
| 双管猎枪 | [旧版实景](../shops-guns-import-20261023/shops-realistic-final/31-dbshotgun-ads.png) | [真实](realistic-final/11-dbshotgun-ads.png) | [经典](classic-final/11-dbshotgun-ads.png) | [腰射](realistic-final/10-dbshotgun-hip.png) / [装填](realistic-final/12-dbshotgun-reload.png) |
| 杠杆步枪 | [旧版实景](../shops-guns-import-20261023/shops-realistic-final/31-leverrifle-ads.png) | [真实](realistic-final/11-leverrifle-ads.png) | [经典](classic-final/11-leverrifle-ads.png) | [腰射](realistic-final/10-leverrifle-hip.png) / [装填](realistic-final/12-leverrifle-reload.png) |
| 单动转轮 | [旧版实景](../shops-guns-import-20261023/shops-realistic-final/31-revolver-ads.png) | [真实](realistic-final/11-revolver-ads.png) | [经典](classic-final/11-revolver-ads.png) | [腰射](realistic-final/10-revolver-hip.png) / [装填](realistic-final/12-revolver-reload.png) |
| 前装滑膛枪 | [旧版实景](../shops-guns-import-20261023/shops-realistic-final/31-musket-ads.png) | [真实](realistic-final/11-musket-ads.png) | [经典](classic-final/11-musket-ads.png) | [腰射](realistic-final/10-musket-hip.png) / [装填](realistic-final/12-musket-reload.png) |
| 活门后膛步枪 | [旧版实景](../shops-guns-import-20261023/shops-realistic-final/31-trapdoor-ads.png) | [真实](realistic-final/11-trapdoor-ads.png) | [经典](classic-final/11-trapdoor-ads.png) | [腰射](realistic-final/10-trapdoor-hip.png) / [装填](realistic-final/12-trapdoor-reload.png) |

接入前截图来自上次正式游戏验收，拍摄位置/镜头与本轮略有不同，仅作握姿与遮挡对照，不作像素级对齐。当前截图已检查准星、托握、前臂和手部淡化。另见 [切回撬棍](realistic-final/20-crowbar-restored.png)、[切回打火机](realistic-final/21-lighter-restored.png) 和 [Alt 收枪](realistic-final/22-holstered.png)。

在 `E:\ZAN\backroom\app` 执行：

```powershell
node reports/firearms-adshands-20261024/verify.mjs --label=realistic-recheck
node reports/firearms-adshands-20261024/verify.mjs --classic --label=classic-recheck
```

脚本自动选独立端口和临时配置；需要本机 Chrome（可用 `CHROME_PATH` 指定），不连接日常浏览器，也不读取/覆盖玩家存档。测试专用物品与按键仅写入临时配置。

固定条件：种子 `424242`、商人之家 `102`、站位 `(335.6, 32.6, 0)`、朝北近靶，yaw `0`、pitch 约 `-0.01371`；初始 FOV 使用默认设置，瞄准沿用各枪 FOV 倍率。纹理质量 1、场景灯上限 16、阴影 1；关闭动态分辨率/曝光、颗粒和震动。冻结附近 AI/属性只用于保持截图与资源采样可重复。

本轮针对桌面单人握持接入；未进行 Android 真机、实体交战压力或全层级帧率重测。装填/弹药结算由既有枪械回归和正式试射共同覆盖。源码原型仍可用 `proto-firearms.html?mode=grip&gun=dbshotgun`、`?mode=hands` 查看，`&opaque=1` 可检查不透明手的占屏面积。
