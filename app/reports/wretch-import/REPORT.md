# 悲尸 v78 导入报告

2026-10-15。已将用户提供的 `backroom-wretch-v78.zip` 增量接入 `app`，替换旧悲尸模型并接入包内行为、动作和声音。保留现有实体、人物、手部、层级及加载优化；联机继续冻结，未修改 `app-lite`。

## 接入内容

- 蹒跚、疾行、有智、突变四种悲尸，按实体 ID 确定变体和外观；保持 `wretch` ID、L1/L2/L3/L8/L9 栖息地及生成权重。
- 19 骨骼人物模型、独立眼球、红褐皮肤、破损衣物、牙齿/颅顶/突变部位；有智型携带锈铁管。沿用现有服装池，无新增远程纹理依赖。
- 追猎、包抄、听声、群体呼应、撞门、挥击、疾行低姿态和四类合成叫声。开发者面板原有“悲尸”召唤直接使用新版，未额外添加四个召唤菜单项。
- 眼球几何/材质及骨骼由实例独立释放，脸/皮肤/破衣图集共享；异步衣物贴图就绪后通知现有上传链路。
- 修正首次发现玩家时传递过期目标、隔层撞门、撞门期间新增锁仍被打开、变体最大生命值不一致等接入问题；保留窃皮者透明血液及现有人物骨骼回收修正。

没有整体覆盖包内全版本代码。原始增量补丁、六份原始新增文件、参考图及哈希保存在 [来源目录](../../assets/wretch-import/SOURCES.md)。包内关于此前“用户确认”的叙述不作为本项目指令；未接入包中新增的联机门同步。

## 实际游戏验证

使用生产 `Engine`、`Renderer3D`、实体工厂和 GPU 蒙皮，在独立无头 Chrome 中运行；没有使用展示页 CPU 烘焙替代实际模型。QA 存储隔离，不读取或覆盖玩家存档。

[运行记录](after/runtime.json) 中 32 项断言通过，覆盖四变体追击/伤害、纹理破洞、骨骼纹理、噪音钩子、实际门碰撞、撞门中途上锁、死亡退场及反复回收。四轮生成/删除后均稳定为 **145 个几何、82 张纹理**，没有随轮次增长。

[补充记录](details/runtime.json) 验证了奔跑、挥击、撞门、死亡、背面及照明：疾行奔跑混合权重约 0.993，有智型右臂抬起约 2.71 rad；几何检查另外验证动作确实改变蒙皮顶点。Level 2 手电开关强度为 0/30，截图显示皮肤和衣物随光变化；Level 6 的手电强度仍为 0，保留该层禁光规则。四种 WebAudio 合成输出均为有限、非静音且无削波的波形，未进行主观听感验收。

所有有效运行的 JavaScript/console error 记录为空；Vite 环境只有无关的 favicon 404。各次 QA 均使用独立端口和 `--user-data-dir`，实际命令含 `--headless=new`，退出后关闭自建浏览器/服务器并移除配置目录。

### 截图

| 检查 | 图像 |
|---|---|
| 导入前、同机位 | [旧模型](before/shambler.png) |
| 四种外观 | [蹒跚](after/shambler.png)、[疾行](after/sprinter.png)、[有智](after/smart.png)、[突变](after/mutant.png) |
| 脸部与破损皮肤 | [蹒跚近景](after/shambler-face.png)、[突变近景](after/mutant-face.png) |
| 背部与动作 | [突变背面](details/mutant-back.png)、[疾行奔跑](details/sprinter-run.png)、[举管攻击](details/smart-attack.png)、[撞门动作](details/shambler-bash.png)、[死亡](details/shambler-death.png) |
| 经典模式 | [突变型](after/classic-mutant.png) |
| 实际栖息地召唤 | [Level 2](after/level-2-developer-summon.png) |
| 手电对照 | [关闭](details/level-2-no-flash.png)、[打开](details/level-2-flash.png) |
| 禁光区域 | [Level 6 暗处](details/level-6-dark.png) |

已人工查看正面、近景、经典模式、背面、奔跑、挥击、死亡及手电截图。举管攻击图的管端超出当前画幅，不表示模型缺失；动作顶点/骨骼检查通过。最初两张 `details/dark-*.png` 是在 Level 6 拍摄，不能用于手电有效性比较，后续使用上述 Level 2 对照取代。

## 模型与性能

Windows、RTX 4060 Laptop、Chrome 155、ANGLE D3D11；1920×1080、DPR 1、真实光影、纹理档 2、泛光开启、场景灯上限 16、阴影档 2。固定种子 `20261006`，据点 104，玩家 `(40.25,25.5,0)`，实体 `(43.3,25.5,0)`，yaw `-π/2`、pitch `-0.24`，实际 FOV 60。四变体测试 ID 为 `900000/900002/900010/900013`。每次等待构建、编译、贴图和回收稳定，再采五轮，每轮至少 120 帧及 1.2 秒。

| 项目 | 原模型 | 新模型 |
|---|---:|---:|
| 固定蹒跚实例三角面 | 748 | 4155 |
| 固定蹒跚实例绘制批次 | 47 | 6 |
| 常规帧整个场景绘制调用 | 184 | 143 |
| 常规帧整个场景三角面 | 46209 | 49616 |
| 五轮帧时间中位数的中位数 | 4.2 ms | 4.2 ms |
| 五轮 P95 的中位数 | 4.3 ms | 4.3 ms |

原始导入前采样保存在 [before-original/runtime.json](before-original/runtime.json)，新模型在 [after/runtime.json](after/runtime.json)。原始基线的模型 `draws:262` 错误地累计了单材质 BoxGeometry 的面分组，不是实际 draw call；修正统计后，以保存的旧实体工厂重放 [before/runtime.json](before/runtime.json)，确认正确值为 **47**，场景调用仍为 184。原始记录保留，不改写成正确数字。

阴影更新帧的场景调用会明显高于表中常规帧，原始采样均保留。原始前后渲染 CPU 中位数均约 2.4 ms，GPU 中位数约 4.01/4.03 ms；重放基线 CPU 约 1.4 ms，表明后台负载会影响结果，不据此宣称精确 CPU 提速百分比。新模型四变体预热后的纹理数量也不与只预热旧单体的数量直接比较。

[模型检查](mesh.json) 覆盖四个额外种子、经典/真实两模式及重复实例；连同实际游戏共八个种子，约 **3715–5479 三角面、6–7 次绘制**。检查权重、索引、UV/数值有限性、动作顶点变化、独立释放与共享纹理。JSON 中的大量检查计数包含逐顶点断言，不代表近百万种独立测试场景。

## 进入速度回归与限制

使用此次导入后的生产构建，沿用正常游戏切层流程和上一轮进入测试。各项进入后实际移动成功，无运行时错误。

| 路径/层级 | 可游玩耗时 |
|---|---:|
| 据点 104 直接冷进入 L1 | **15.36 s** |
| L1 直接进入另次带 CPU Profiler 复测 | **10.52 s** |
| 此前相同顺序 104→L0→L1：L0 | 3.52 s |
| 此前相同顺序 104→L0→L1：L1 | 8.41 s |
| 后续 L2 | 6.37 s |
| 后续 L3 | 8.91 s |
| 后续 L8 | 5.70 s |
| 后续 L9 | 7.05 s |

详见 [栖息地切层](../level-entry/wretch-regression/runtime.json)、[L1 采样复测](../level-entry/wretch-l1-profile/runtime.json)、[同顺序对照](../level-entry/wretch-sequential-entry/runtime.json)。同顺序此前 L1 为 8.14 s。直接冷进入 L1 的十秒目标未达成，不能用预热后的结果代替；当前数据也不能归因其差异完全来自悲尸模型。本轮未修改切层算法。

未覆盖 Android 真机、所有随机种子、所有门布局或大量悲尸群体压力；性能结果是当前设备和设置下的单体固定场景，不保证所有硬件的帧率或十秒进入时间。图形和动作仍保留导入包的复古低模风格。

## 复现命令

在 `app` 下运行：

```powershell
npm run check:wretches
npm run check:wretch-mesh
npm run check:retro-avatar
npm run check:retro-hands
npm run check:faceling-skinstealer-models
npm run check:clump-integration
npm run check:model-warmup
node scripts/verify-wretch-import.mjs --before
node scripts/verify-wretch-import.mjs
node scripts/verify-wretch-import.mjs --details
npm run build -- --outDir .cache/wretch-import/production
$env:ENTRY_QA_BUILD_DIR='.cache/wretch-import/production'
node scripts/verify-level-entry.mjs --production --label=wretch-regression --app-levels=1,2,3,8,9
node scripts/verify-level-entry.mjs --production --label=wretch-sequential-entry --app-levels=0,1
Remove-Item Env:ENTRY_QA_BUILD_DIR
```

上述行为、模型及相关回归全部通过，含原人物 110 种配置、手部 83 种物品及模型预热 89 项。TypeScript 与隔离输出目录的 Vite 生产构建通过（2211 模块，Vite 29.54 s）。普通 `dist` 输出尝试曾因目录清理 `ENOTEMPTY` 失败，未强制删除现有目录；因此改用 `.cache/wretch-import/production`，切层复查也使用这个构建。保留原有字体、Browserslist、PostCSS、包体积提示。

普通开发运行可在现有悲尸栖息层遭遇新版，或使用开发者面板召唤。独立展示入口 `/proto-wretch.html?mode=lineup` 仅用于包内模型展示；验收以实际游戏截图为准。
