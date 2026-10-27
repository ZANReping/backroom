# 爬菌 Crawlers 接入验收（2026-10-25）

在原项目 E:/ZAN/backroom/app 增量合并 creeper-full.zip。当前内容见 [接入说明](../../CREEPER-IMPORT.md)，原包哈希、作者／许可状态见 [来源记录](../../assets/creeper-import/SOURCES.md)。包内历史报告未作为本机验收数据使用。

## 接入与修复

接入三种宿主模型、分阶段动作、自然生成、隐藏孢子负荷与病程、第一人称感染、烧灼自救、孢子团、墙角蜘蛛、感染肉、存档、图鉴和开发者召唤。保留当前商人 X 快捷键、近战／枪械模型与手部缓存。

模型分帧构建并走现有贴图／GPU 预备队列；共享资源受保护，取消任务与实例回收释放私有资源。补齐枪械支撑手和瞄准淡出，避免浮空覆盖物。修复空白 tile 0 被误当作墙导致装饰悬空，改用实际墙体 tile 2；爬菌人补齐噪声听觉和遮墙命中保护。新开局重置感染，烧毁装饰跨存读档保留。

## 自动检查

| 命令 | 结果 |
| --- | --- |
| npm run check:creeper | 90 / 90 |
| npm run check:creeper-integration | 120 / 120 |
| npm run check:entity-forms | 263，52 形态 / 11 父类 |
| npm run check:entity-preparation | 17 |
| npm run check:retro-hands | 17314，117 物品类型 |
| npm run check:merchant-trade | 44 / 44 |
| npm run check:item-batches | 29 |
| npm run build | 通过，44.71 秒 |

原始命令输出在本目录各 check-*.log 和 build.log。集成检查覆盖真实宿主几何／UV 有限性、协作构建与中途取消、共享与私有资源释放、指甲缓存淘汰、旧档／新开局、遮墙攻击、真实噪声分派和装饰墙体支撑。

## 实际游戏

两个最终目录为 validated-realistic 和 validated-classic；各 result.json 保存完整断言、浏览器命令、GPU、端口、错误与资源记录。两种模式各 64 项断言通过，无 JS／WebGL 错误；只有原站点 favicon.ico 404，无游戏资产失败。之前的运行目录保留为定位记录：曾修复测试夹具的 InvSlot.count、aimHeld、流式坐标和整数地面查询；最终目录不再使用这些错误夹具。

使用真实 App、真实 L2 地图和实际渲染器，独立内存存档；关卡种子 424242，1920×1080 / DPR 1 / 渲染比例 100%，textureQuality 2，关闭动态分辨率／动态曝光／颗粒／镜头摇动。GPU 为 NVIDIA RTX 4060 Laptop，经 ANGLE D3D11 原生渲染，无软件回退。主取景世界坐标 (14.5, 2.5)，朝 -Y，FOV 72；小宿主目标高度 0.14m、人形 0.28m。经典结果还保存逐阶段 origin 与 yaw/pitch，流式局部坐标需加 origin 还原。墙角装饰取景世界坐标 (59.76, -9.24)，朝向 (60.96, -8.04)，实体挂高 1.55m。

| 模式 | 菜单继续到 L2 可玩 ms | 冷源模块到主界面 ms | 冷源模块到可玩 ms | 游戏断言 |
| --- | --- | --- | --- | --- |
| realistic | 1769.54 | 10359.6 | 16868.6 | 64 |
| classic | 1576.42 | 11398.6 | 15856.18 | 64 |

这些进入时间区分了开发服务器冷源模块加载与实际继续存档，不能用于声称所有关卡冷启动低于十秒。

实际流程覆盖自然感染体、开发者三种召唤、连续两次扑击（HP 100→56、负荷 50）、感染宿主死亡与肉掉落、孢子暴露和火盐清理、真实墙角蜘蛛、2/3/4 阶手部、近战持握、枪械双手与瞄准淡出、键盘 X 和触控情境自救（打火机保留、只扣一次血）、图鉴 12 次轮换和三个变种。感染数值／存档／跨墙行为同时有 CPU 回归；没有把运行速度加快的病程截图称为自然等待十二分钟的实测。

## 固定场景性能和回收

主取景中放置一只爬菌人，预备后每轮记录 120 次 requestAnimationFrame，共五轮。帧时间为浏览器帧间隔，CPU 为真实 Renderer.render 全调用持续时间；绘制调用／三角形显式关闭 info.autoReset 后每帧计数，包含阴影与后处理。没有将它们冒充 GPU timer query。

| 模式 | 轮次 | 帧中位 ms | 帧 P95 ms | CPU 中位 / P95 ms | 绘制调用 | 三角形 |
| --- | --- | --- | --- | --- | --- | --- |
| realistic | 1 | 4.2 | 8.3 | 3.2 / 5.4 | 392 | 240733 |
| realistic | 2 | 4.2 | 8.4 | 3.2 / 5.6 | 392 | 240733 |
| realistic | 3 | 4.2 | 8.4 | 3.2 / 5.6 | 392 | 240733 |
| realistic | 4 | 4.2 | 8.3 | 3.2 / 5.6 | 392 | 240733 |
| realistic | 5 | 4.2 | 8.4 | 3.2 / 5.8 | 392 | 240733 |
| classic | 1 | 4.2 | 8.4 | 3.8 / 5.5 | 378 | 240719 |
| classic | 2 | 4.2 | 8.4 | 3.7 / 4.8 | 378 | 240719 |
| classic | 3 | 4.2 | 8.4 | 3.6 / 6.1 | 378 | 240719 |
| classic | 4 | 4.2 | 8.4 | 3.8 / 6.8 | 378 | 240719 |
| classic | 5 | 4.2 | 8.4 | 3.4 / 5.1 | 378 | 240719 |

反复生成和移除宿主、装饰与感染手部，预热后采样三轮 GPU 资源计数：

| 模式 | 第一轮 几何/纹理 | 第二轮 | 第三轮 |
| --- | --- | --- | --- |
| realistic | 1180 / 273 | 1180 / 273 | 1180 / 273 |
| classic | 1064 / 248 | 1064 / 248 | 1064 / 248 |

经典模式首次准备另有一次记录：尸鼠1阶 578ms、4阶 558.3ms、蛛形纲4阶 891.3ms、爬菌人 1356.8ms（均含确认可见后的250ms等待）。对应帧间隔峰值 8.4 / 4.3 / 12.6 / 29.2ms。该记录说明准备已拆帧，但不宣称零卡顿。原包爬菌人远档仍约6.5万三角形、多个近处个体的压力未在此固定单件场景证明。没有本次导入前相同夹具的对照，因此不声称相对旧版的提升百分比。

## 视觉记录

已人工查看真实和经典墙角装饰、爬菌人、感染手部、枪械持握、感染肉与图鉴截图；原包参考为 [原始蒙太奇](../../assets/creeper-import/UPSTREAM-creeper-stage3.jpg)。[并排截图索引](comparison.html)。

| 场景 | 真实光影 | 经典光影 |
| --- | --- | --- |
| 尸鼠 1 阶 | [真实](validated-realistic/rat1.png) | [经典](validated-classic/rat1.png) |
| 尸鼠 4 阶 | [真实](validated-realistic/rat4.png) | [经典](validated-classic/rat4.png) |
| 蛛形纲 4 阶 | [真实](validated-realistic/spider4.png) | [经典](validated-classic/spider4.png) |
| 爬菌人 | [真实](validated-realistic/human.png) | [经典](validated-classic/human.png) |
| 连续扑击 | [真实](validated-realistic/humanAttack.png) | [经典](validated-classic/humanAttack.png) |
| 死亡与掉落 | [真实](validated-realistic/death.png) | [经典](validated-classic/death.png) |
| 孢子污染 | [真实](validated-realistic/spores.png) | [经典](validated-classic/spores.png) |
| 真实墙体上的蜘蛛 | [真实](validated-realistic/decor.png) | [经典](validated-classic/decor.png) |
| 感染肉模型与图标 | [真实](validated-realistic/meat.png) | [经典](validated-classic/meat.png) |
| 2 阶手部 | [真实](validated-realistic/stage2.png) | [经典](validated-classic/stage2.png) |
| 3 阶手部 | [真实](validated-realistic/stage3.png) | [经典](validated-classic/stage3.png) |
| 4 阶手部 | [真实](validated-realistic/stage4.png) | [经典](validated-classic/stage4.png) |
| 近战持握 | [真实](validated-realistic/heldWeapon.png) | [经典](validated-classic/heldWeapon.png) |
| 枪械双手 | [真实](validated-realistic/gun.png) | [经典](validated-classic/gun.png) |
| 瞄准淡出 | [真实](validated-realistic/gunAim.png) | [经典](validated-classic/gunAim.png) |
| 键盘烧灼自救 | [真实](validated-realistic/cured-desktop.png) | [经典](validated-classic/cured-desktop.png) |
| 触控情境按钮 | [真实](validated-realistic/touch-cauterize-ready.png) | [经典](validated-classic/touch-cauterize-ready.png) |
| 触控自救结果 | [真实](validated-realistic/cured-touch.png) | [经典](validated-classic/cured-touch.png) |
| 图鉴预览 | [真实](validated-realistic/codex-creeper.png) | [经典](validated-classic/codex-creeper.png) |
| 图鉴轮换 | [真实](validated-realistic/codex-creeper-cycle.png) | [经典](validated-classic/codex-creeper-cycle.png) |

## 复现与边界

在 app 目录：

```powershell
npm run verify:creeper-import -- --label=review-realistic
npm run verify:creeper-import -- --classic --label=review-classic
```

脚本自动分配独占端口、以 --headless=new 启动专属 Chrome 配置，验证 GPU 与所属命令，最终清理浏览器／服务器和配置目录。本次两次最终运行均已清理。桌面触控900×600只验证输入，未测试 Android 真机；自然生成的L3/L5/L8使用同一来源逻辑并有自动回归，实际场景截图集中在L2，不宣称全层级均做过长期游玩验收。主存档仍v:1。联机保持封闭，不更新app-lite或GitHub副本。
