# 主界面存档背景与 HUD 层级字体

2026-10-08，Three.js `app`。

主界面按保存时间选择最新有效槽位，与“继续游戏”副标题共用选择函数。普通存档、自动存档及据点均按内部层级 ID 解析；无有效存档时使用 Level 0、种子 1337。使用存档的地图种子生成该层级入口附近的真实场景，保留缓慢环视；不将背景预览写回玩家存档，也不推进生存或 NPC 行为。保存退出、删除槽位后重新选择背景。

启动 HTML 的“正在寻找入口”覆盖层持续显示到附近几何、模型预热、材质图像和连续三帧渲染就绪。菜单不再仅因 React 已挂载而提前显示。文件请求失败或超时使用既有程序化材质兜底；场景构建异常显示重试入口。

HUD 桌面与触控分支复用 `levelTitleTheme` 和 `LevelTitleTheme.css`，使用对应字体、字距、字重、色彩及文字阴影，保留紧凑排版；不加入加载界面的全屏构图或循环动画。据点按其内部 ID 选字体，而非父层级编号。

## 实际游戏验证

- 独立 Chrome `--headless=new`，CDP 9388，Vite 3188；通过 `Browser.getBrowserCommandLine` 检查真实启动选项及专属 profile。脚本拒绝使用已占用端口，结束或失败均清理自己创建的进程。
- 1440×900、DPR 1、原生分辨率、固定 renderScale 100、关闭动态分辨率、经典光影。触控横屏为 844×390 的桌面模拟。
- 无存档 → Level 0；较新自动槽 Level 4 覆盖较旧手动槽 Level 1；背景和继续摘要一致；启动前后两个存档字符串不变、正式玩家状态不变。
- 真实点击继续 → Level 4 HUD；开发者切换 Level 10 → 手写字体 HUD；暂停菜单保存退出 → Level 10 背景。另覆盖有限层 104（Tom 的餐馆）、Level 5、损坏 JSON 回退。
- 全流程 19 项断言通过，未捕获运行时异常，未记录网络失败，见 [verification.json](verification.json)。
- 关闭缓存并人为延迟 Level 4 贴图 1.5 秒：请求发生时启动遮罩存在、菜单不存在、准备中的背景层级为 4。补充 9 项断言通过，见 [loading.json](loading.json)。
- 已目视检查主界面、桌面/横屏 HUD、启动遮罩截图；未发现字体溢出或提前出现空白主菜单。

截图：[启动期间](boot-preparing-level4.png)、[办公室背景](latest-auto-level4.png)、[旅馆背景](hotel-level5.png)、[餐馆背景](finite-tom-diner.png)、[保存退出](quit-saved-level10.png)、[Level 10 HUD](game-level10-hud.png)、[触控横屏 HUD](game-level10-hud-mobile.png)。

## 复现命令

在 `app` 下运行：

```powershell
npm run build
npm run check:texture-images
npm run check:model-warmup
node scripts/verify-title-save.mjs
node scripts/verify-title-save.mjs --loading-only
```

生产构建通过；贴图生命周期 96 项、模型预热 66 项通过。最后两项脚本自动启动与关闭专属服务器/浏览器，测试数据只写入该 profile 的 localStorage；不读取日常浏览器。

开发模式日志仍有已有 `plugin-inspect-react-code` 向 Fragment 注入 `code-path` 的 React 警告；生产构建仍有现有字体路径、Browserslist、PostCSS 与包体提示。记录在 `server-console.log` / `loading-console.log`，未将其计为本轮修复。未遍历所有层级、全部画质组合或 Android 真机；启动耗时受冷编译及缓存影响，不作为正式性能测评。
