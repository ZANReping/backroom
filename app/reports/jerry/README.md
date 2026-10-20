# 杰瑞重制验收

2026-10-18。实现与许可见 [JERRY-REMAKE.md](../../JERRY-REMAKE.md)。测试使用生产 `App`、`Engine`、实体工厂与渲染器；仅存储换成页面内存，未接触玩家存档。

## 结果与复现

```powershell
npm run check:jerry
npm run verify:jerry -- classic
npm run verify:jerry -- realistic
npm run build
```

| 检查 | 结果 |
| --- | --- |
| Jerry 模型、生成、教化、驯服、信众、释放与输入保护 | [120/120](static.log) |
| 两张物品图标的尺寸、透明通道与生成结果 | [逐字节复现通过](icon-reproduction.json) |
| 经典模式实际游戏 | [59 项](classic/result.json) |
| 真实光影实际游戏 | [59 项](realistic/result.json) |
| 生产构建 | [通过](build.log) |
| Alpha 生成 / 据点通行 | [56,365 项](alpha.log) / [五个据点通过](settlements.log) |
| NPC 装饰 / 人物动作 | [30,377 项](npc-gear.log) / [17,618 项](humanoid-motion.log) |
| 职业去程序化等现有流程 | [通过](careers.log) |
| 模型预热 / CPU 准备队列 | [111 项](model-warmup.log) / [17 项](entity-preparation.log) |
| 实体变种 / 物品合批 | [200 项](entity-forms.log) / [29 项](item-batches.log) |
| 派对客 / L0 测试场地保留 | [113 项](partygoers.log) / [70 项](l0-testfield.log) |

实际游戏种子 `6767`，Level 274，1920×1080，纹理质量 2，FOV 60°，原生分辨率，关闭动态分辨率、动态曝光和颗粒。使用独立端口与独立 profile 的 Chrome `--headless=new`。GPU 查询记录为 **NVIDIA GeForce RTX 4060 Laptop / ANGLE Direct3D11**；源包的 `cpu=1` 替身和软件 GPU 路径均未启用。

栖木使用自然生成的杰瑞；肩头截图调用同一 AI 模块的立即讲道入口固定阶段，再根据实际人物骨骼检查接触点与朝向。扑击由受伤状态经实际 AI 触发。功能检查使用实际 E 交互、物品槽使用、扑击伤害、击晕结算、图鉴按钮、死亡结算和地图绘制；不是仅对摆好的姿态截图。每张模型视角的位置、朝向、高度和取景参数保存在各模式 JSON 的 `initial`、`views`、`contact`、`devotion` 等字段中。

两种模式均无运行时异常、模型／贴图请求失败或 WebGL 上下文丢失。缺省 `/favicon.ico` 的 404 单独保留在请求记录中。构建仍有 PostCSS `from`、L11 材质混合静态／动态导入及大包提示，完整文本见构建日志。

## 实际游戏截图

| 视角 | 经典 | 真实 |
| --- | --- | --- |
| 栖木全景 | [截图](classic/perch.png) | [截图](realistic/perch.png) |
| 正面近景与抓杆 | [截图](classic/perch-close.png) | [截图](realistic/perch-close.png) |
| 神父肩头正面 | [截图](classic/shoulder.png) | [截图](realistic/shoulder.png) |
| 肩头侧面 | [截图](classic/shoulder-side.png) | [截图](realistic/shoulder-side.png) |
| 肩头背面与尾羽 | [截图](classic/shoulder-back.png) | [截图](realistic/shoulder-back.png) |
| 实际扑击 | [截图](classic/pounce.png) | [截图](realistic/pounce.png) |
| 木僵 | [截图](classic/stupor.png) | [截图](realistic/stupor.png) |
| 低头诵咏 | [截图](classic/devotion.png) | [截图](realistic/devotion.png) |
| 图鉴第二角度 | [截图](classic/archive.png) | [截图](realistic/archive.png) |
| 连续坠落 | [截图](classic/fall.png) | [截图](realistic/fall.png) |
| L2 传单方位标记 | [截图](classic/lure-map.png) | [截图](realistic/lure-map.png) |

## 资源与边界

每轮生成四个独立实例，等待实际 GPU 准备后再移除，连续三轮：

| 模式 | 第一轮 几何／贴图／程序 | 第二轮 | 第三轮 |
| --- | --- | --- | --- |
| 经典 | 349 / 48 / 36 | 349 / 48 / 36 | 349 / 48 / 36 |
| 真实 | 357 / 67 / 58 | 357 / 67 / 58 | 357 / 67 / 58 |

表中为整场景资源，包含 NPC、气泡与环境缓存；三轮均保持稳定。两个存活实例的几何、材质和骨架独立；释放 A 后 B 可继续摆姿和渲染，图鉴关闭后场景模型继续显示。模型本身为 2,868 面、3 次绘制、14 根骨骼；飞石使用有上限的实例池。源包与合并哈希的最终核对见 [集成审计](integration-audit.json)。

本轮为功能、视觉与资源稳定性检查，没有据此声明持续 60 FPS、首次生成延迟或移动端性能。真实光影使用现有 L274 环境配置，本轮没有重新校准整个据点的环境照明。

## 已存在的回归失败

`npm run check:outpost-colliders` 在 `alpha_office_station at -25 degrees` 的几何断言失败，见 [日志](outpost-colliders.log)。将本次导入前所有可用文件快照代回后，仍复现同一失败；前后测试 bundle 字节与 SHA256 完全相同，运行时依赖均为本次未修改的 Alpha／贸易据点模块。证据见 [快照对照](outpost-baseline.json)、[导入前运行日志](outpost-baseline.log)。该项没有记为通过，也未为接入杰瑞而更改无关据点碰撞规则。

QA 浏览器、服务器退出及临时 profile 清理由脚本 `finally` 执行，结果记在每种模式的 `cleanup` 字段；只清理本任务创建的进程。[最终进程核对](process-cleanup.json)中本任务 profile 对应的残留进程为零。
