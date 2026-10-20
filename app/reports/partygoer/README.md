# 派对客接入验收

当前接入说明：[PARTYGOER-REMAKE.md](../../PARTYGOER-REMAKE.md)。原包完整保存在 `assets/partygoer-import`；下列截图由本次实际游戏与当前模型重新生成。

## 命令

```powershell
npm run check:partygoers
npm run verify:partygoer -- classic
npm run verify:partygoer -- realistic
npm run build
```

静态结果：[static.log](static.log)，113/113 项通过。构建结果：[build.log](build.log)。相关回归的完整输出保存在同目录 `check-*.log`。

## 实际游戏

使用生产 App、真实地图、游戏实体工厂、AI、近战、投掷落地、库存和图鉴。种子 `6767`，内部层级 `12`（L601），自然生成的黄色派对客，1920×1080、FOV 72、纹理质量 2、固定原生分辨率。每张截图的位置、朝向、姿态、预算及资源数量都保存在 JSON 中。

- 经典光影：[result.json](classic/result.json)、[server.log](classic/server.log)
- 真实光影：[result.json](realistic/result.json)、[server.log](realistic/server.log)

各模式 47 项检查通过。实际流程覆盖近身暴起、抓咬、转化、近战断臂、开胸、击倒、爬行、复苏、火盐烧尽、食用蛋糕、Alt 收起限制、图鉴换角度及转化死亡结局。复苏后的检查允许实体立即继续追击或抓挠，验证其恢复活动、血量与断臂状态，不强制停留在单一的瞬时 AI 状态。

六张游戏模型截图为冻结 AI 后设置姿态量的视觉检查，不是自然战斗录像；功能断言单独执行真实入口和状态推进。图鉴与结局截图来自真实 UI。

结局截图在真实 UI 的有限入场动画完成帧采集，自动脚本对这些有限动画调用 `finish()` 使无头截图稳定，未修改产品 UI 样式和内容。

| 内容 | 经典光影 | 真实光影 |
| --- | --- | --- |
| 正面 | [idle](classic/idle.png) | [idle](realistic/idle.png) |
| 递蛋糕 | [offer](classic/offer.png) | [offer](realistic/offer.png) |
| 抓咬 | [bite](classic/bite.png) | [bite](realistic/bite.png) |
| 狂战士 | [berserk](classic/berserk.png) | [berserk](realistic/berserk.png) |
| 爬行及封闭穹顶 | [crawl](classic/crawl.png) | [crawl](realistic/crawl.png) |
| 焚烧姿态 | [burn](classic/burn.png) | [burn](realistic/burn.png) |
| 图鉴换角度 | [archive](classic/archive.png) | [archive](realistic/archive.png) |
| 满值转化结局 | [joined](classic/joined.png) | [joined](realistic/joined.png) |
| 外貌图集 | [colors](classic/gallery-colors.png) | [colors](realistic/gallery-colors.png) |
| 姿态图集 | [poses](classic/gallery-poses.png) | [poses](realistic/gallery-poses.png) |
| 近景 | [close](classic/gallery-close.png) | [close](realistic/gallery-close.png) |

## 预算与清理

GPU 为 `NVIDIA GeForce RTX 4060 Laptop / ANGLE Direct3D11`，全程使用原生 GPU 蒙皮，没有 `cpu=1`、CPU 代理网格或软件光栅替代。模型最大 6 次绘制、7,956 三角面。三轮分别新增四只再移除后，经典模式均回到 453 个几何／36 张纹理，真实模式均回到 474 个几何／54 张纹理；这些是完整场景的数量，包含玩家、建筑与道具。幸存模型及共享纹理仍正常显示。

脚本验证自己的无头启动参数、调试端口和配置目录，结束时关闭自己的浏览器和开发服务器、移除自己的临时配置目录。当前结果中无运行错误；开发服务器的 favicon 缺失单独保留在网络记录中。截图或资源数量稳定不等于完整帧时间测试，本轮未新增移动设备或全层级 FPS 结论。
