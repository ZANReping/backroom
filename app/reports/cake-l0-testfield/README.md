# 丝绒蛋糕像素图与 L0 测试场地修复

2026-10-18，修改范围为 `app` 和根说明，保留已有改动。

丝绒蛋糕补齐透明背景的原创像素图：32×32 原稿、深色轮廓、深红糕体、奶油夹心、纸托与蜡烛，最近邻放大至 128×128 RGBA。背包、快捷栏和装备格通过既有 `ItemGlyph` 加载同一 PNG。来源和生成流程见 [图标来源](../../public/textures/icons/SOURCES.md)；资产为 [item_velvetcake.png](../../public/textures/icons/pixel/item_velvetcake.png)。

测试场地入口为 **开发者面板 → 传送 → 测试场地（L0）**。旧实现只修改瓦片和部分碰撞列表，新的薄墙建筑、深坑开口和区域材质仍由 `L0Layout` 生成；对照场景中保留了 284 段墙。

现在以世界坐标记录一片 80×80 米的临时场地，将同一覆盖应用于活跃区块、重新加载的区块、邻域受光、碰撞和区域查询。跨边界的墙和坑口按实际边缘裁切，场地内使用平整地毯和规则照明；清理残留拱门、物件、插座和马尼拉地板／天花板。未修改区域继续采用原生成数据，场地外的新掉落物保持身份。取消旧的待提交建筑任务，并避免测试时重新插入墙体。

重复激活会清场并返回同一片场地。覆盖仅存在于当前地图运行期间，不进入 `L0WorldSave`；重新生成层级后恢复正常布局。测试后新丢下的物品可以随区块卸载、重载，既不消失也不重复。

## 复现

在 `app` 目录运行：

```powershell
python scripts/gen-item-icons.py
npm run check:l0-testfield
npm run verify:cake-l0-testfield -- classic
npm run verify:cake-l0-testfield -- realistic
npm run build
```

图标生成器跳过已有 PNG；`icon.log` 另行比较内存中重新绘制的图像，确认与保存图像逐像素一致、背景透明且无插值像素。

浏览器验证使用实际 App、标题“继续游戏”、开发者面板按钮与原版背包。存储替换为页面内存，不读写玩家存档。种子 `7391`，1920×1080、FOV 72、纹理质量 2、固定原生分辨率、关闭动态曝光和动态分辨率。前后场地均为世界坐标 `x=14..94, y=-24..56`，取景点 `(54,16,0)`，yaw `.42`、pitch `-.03`。

`before` 截图使用[修复前函数快照](../../verifier/fixtures/l0-testfield-before.ts)和当前渲染器，重现旧入口清瓦片后仍有墙的问题；后续截图来自修复后的真实按钮。实际移动累计约 22.67 米，关闭穿墙与飞行的默认状态，覆盖跨区块碰撞；随后离开约 320 米再返回，确认真正发生卸载与重载。

## 验收结果

| 检查 | 结果 |
| --- | --- |
| 专项检查 | [70 项通过](static.log)，含七种区域、负坐标、墙／坑裁切、掉落身份、重载与临时存档边界 |
| 马尼拉边缘 | 部分房间清理后，剩余地板、天花板和插座都位于场地外；实际生成网格检查通过 |
| 图标 | [规格与确定性检查通过](icon.log)，实际背包／快捷栏加载，无缺图回退 |
| 经典／真实光影 | 各 24 项实际游戏检查通过，无运行错误或 WebGL 上下文丢失 |
| 资源回收 | 三轮重新激活后，经典均为 241 几何／32 纹理，真实均为 248 几何／56 纹理；为完整场景数量 |
| 相关回归 | l0-architecture、l0-continuity、l0-state、l0-meshes（18 次区域／光影构建）、l0-visibility、partygoers 通过，日志位于本目录 |
| 生产构建 | [通过](build.log)，原有大包等提示保留在日志中 |

使用 RTX 4060 Laptop / ANGLE Direct3D11、真正无头 Chrome，各次运行使用独立端口和配置目录；验收浏览器及服务器已由各自脚本关闭。网络记录仅有开发服务器 favicon 缺失。未进行 Android 真机或持续帧时间测试。

| 内容 | 经典光影 | 真实光影 |
| --- | --- | --- |
| 旧入口残留墙体 | [before](classic/before.png) | [before](realistic/before.png) |
| 实际按钮生成空场 | [field](classic/field.png) | [field](realistic/field.png) |
| 背包像素图 | [cake-icon](classic/cake-icon.png) | [cake-icon](realistic/cake-icon.png) |
| 卸载后返回 | [returned](classic/returned.png) | [returned](realistic/returned.png) |
| 三次重新激活 | [final](classic/final.png) | [final](realistic/final.png) |
| 详细断言、资源与清理 | [result.json](classic/result.json) | [result.json](realistic/result.json) |
