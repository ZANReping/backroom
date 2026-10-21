# L4 E2b / 近战武器 / 牧蛇接入验证（2026-10-21）

已接入原项目 E:/ZAN/backroom/app。L4 采用附件连续楼层规划和 E2b 窗洞修正；五把近战武器采用新模型、挥砍/耐久/修理；牧蛇采用新模型、动画、催眠、吞噬、护幼及场景道具。保留既有 L1、人物/手部和其他实体更新，主存档版本 v:1，联机继续封闭。功能/来源见 [接入说明](../../L4-MELEE-WRANGLER-IMPORT.md) 和 [署名记录](../../assets/sources/l4-melee-wrangler-20261021/SOURCES.md)。

## 实际游戏

真正的 Chrome --headless=new，ANGLE / NVIDIA RTX 4060 Laptop / Direct3D11，1920×1080、DPR=1、native、textureQuality=2、动态分辨率与动态曝光关闭、固定种子 424242，实际 App/Engine/Renderer。使用独立内存存储，不写入玩家的浏览器存档；独立动态端口/profile，清理记录逐轮保留。

- [真实完整运行](realistic-v2/result.json)：78 项，零控制台/运行错误、零失败资源请求。L4 菜单继续到可玩 8.94s，L8 进入 8.38s。
- [经典完整运行](classic-v1/result.json)：78 项，同样零错误/失败请求。L4 4.57s，L8 3.31s。
- [真实 L4 补测](realistic-steady/result.json) / [经典 L4 补测](classic-steady/result.json)：各 13 项，额外检查真实饮水机补水及只接取一次杏仁水；全 25 区块完成后采样。相机世界位置、yaw/pitch/FOV、加载等待都在 JSON。
- 完整流程覆盖七个 L4 视角、五种武器完好/残件/磨损、实际轻击/蓄力、修理、丢下再拾取、四种牧蛇外观、催眠/手电解除、吞噬/1HP/30m 安全落点、六轮创建回收及三类图鉴预览。自然 AI 的催眠由凝视触发；吞噬前将同一实际实体设到 windup，后续扑击、吞咽、返回由真实引擎推进。模型截图为冻结 AI 的取景，不代表随机事件全过程。

## 视觉检查

已人工查看实际截图：L4 办公隔间的桌面/隔板和纹理、连续柱网、正交窗洞方向；五把武器中重点查看斧头完好/残件及管钳握姿；牧蛇雄性、雌性、孕体、幼体和图鉴。没有缺贴图或着色器失效。巨体在测试岩壁处与既有第九大道路牌重叠，记录中保留；未用图像编辑清除。小房间取景有门扇遮挡，不宣称是参考图像素对齐验收。可浏览 [截图索引](gallery.html)。

## 性能与回收

每项预热后五轮、每轮 80 个 RAF 间隔。下表为每轮中位数范围 / 每轮 P95 范围；draw/triangles 汇总实际世界、阴影与后处理，不是单模型统计。RAF 包含浏览器调度和主线程耗时，不等于 GPU 时间。初轮完整运行仍有后台远区构建，另补测 L4 全 25 区块；两批原始数据均保留。

| 场景 | 中位 / P95（ms） | 绘制调用 | 三角面 |
| --- | --- | --- | --- |
| L4 全窗口 realistic | 22.7–42.3 / 41.9–93.0 | 1865 / 1458 | 3583469 / 2112917 / 2187217 |
| L4 全窗口 classic | 9.7–17.7 / 13.7–25.3 | 1037 | 716651 |
| L8 单牧蛇 realistic | 6.4–7.6 / 11.1–12.9 | 263 | 202791 |
| L8 单牧蛇 classic | 4.1–4.2 / 4.8–5.5 | 249 | 202777 |

**L4 真实模式尚未达到 60 FPS / P95 20ms，经典模式部分轮次也超过 20ms。** 完成附近场景后仍需构建远处，跨区准备记录包含超过十秒的样本；单个入口少于十秒不代表所有种子/设备/连续传送。完整窗口静态细节、透明窗和阴影提交仍有优化余地。本轮没有可信的旧布局同场景 A/B 性能结论，也没有 Android 真机结果。

六轮牧蛇创建/清理后，真实模式最后三轮空场几何/纹理/programs 均为 586/88/106，经典为 650/66/100；前几轮允许共享纹理首次上传，后续稳定。私有脊线 DataTexture 随材质释放，其他实例保持有效；共享 Canvas 纹理不随实例销毁。

## 自动回归

最终生产构建及以下命令通过，日志在 [regressions](regressions/final-results.json)：

- check:l4：114,469 项（确定性、可达性、窗洞、灯具、饮水机）。
- check:melee：131；check:wrangler：61。
- check:l4-melee-wrangler-integration：最终 16 项，真实 API 覆盖旧堆叠、不同耐久移动、丢拾、修理取消/换件、JSON 字段、饮水机区块快照和个人 frame 清理。
- check:l4-melee-wrangler-resources：2,950,192 个属性/索引/UV/实例隔离与释放断言（不是同等数量的独立场景），两种材质模式、十种武器状态、四类牧蛇及卵枝/洞口。
- check:entity-forms：最终 213 项 / 36 个形态 / 10 类；原脚本硬编码 33/9，因此首轮失败，已更新数量并增加牧蛇显式种类断言。
- model-warmup、program-completion、entity-preparation、retro-hands、item-batches、refined-items、six-items、deathmoth、watch、arms-integration、nguithr 回归通过。旧任务的报告在测试前备份、结束后恢复，本轮拷贝在 regressions。

## 复现

在 E:/ZAN/backroom/app 执行：

```powershell
npm run check:l4
npm run check:melee
npm run check:wrangler
npm run check:l4-melee-wrangler-integration
npm run check:l4-melee-wrangler-resources
npm run check:entity-forms
npm run build
node scripts/verify-l4-melee-wrangler-import.mjs --label=realistic-repeat
node scripts/verify-l4-melee-wrangler-import.mjs --classic --label=classic-repeat
node scripts/verify-l4-melee-wrangler-import.mjs --l4-only --label=realistic-steady-repeat
```

脚本要求本机 Chrome 和原生 GPU，未用 SwiftShader。--label 使用新的输出目录名以保留已有证据。title 预览和模块冷加载不属于 entryMs；firstPlayableMs 字段包含它们，应单独读取。

## 未覆盖与原始失败

未覆盖长时间 L2 自然偶发事件、完整新旧档跨进程恢复、全部种子和移动端真机。饮水机当前沿运行中区块状态保存，未新增 L4 跨进程世界账本。NPC 挥击沿用原判定。L4 新生成材质缺少上游的完整生成 prompt/原始图/外部处理脚本，已在来源记录标注。

[realistic-v1](realistic-v1/result.json) 保留首轮失败：验证器错误要求吞噬后 AI 立即进入 under，而实际先进入 retreat；修正测试判据后完整复跑通过，没有为测试改变 AI。首轮还包含 favicon 404，已给验证页面内联空图标消除。生产构建保留已有字体/PostCSS/大 chunk 警告，未将这些警告当作新功能通过证据。
