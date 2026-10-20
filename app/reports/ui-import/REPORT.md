# UI 优化包导入与验证

日期：2026-10-07。来源为用户提供的 `backroom-ui.zip`，详见 [来源与导入记录](../../assets/ui-import/IMPORT.md)。

## 导入内容

导入 10 个生产组件与 `src/index.css`：标题、HUD、暂停、设置、背包/图鉴、对话、搜刮、死亡、胜利及加载界面。包含档案式标题、状态条和快捷栏、设置分类侧栏、移动端抽屉、背包工作台、主题配色及结算样式。

使用压缩包补丁反向重建原始基线，逐文件与工作区比较；11 个文件均匹配后才复制，并校验复制时文件哈希。没有整体覆盖项目或执行包内脚本。原始补丁、说明、6 张设计预览和前后哈希归档在 `app/assets/ui-import/`。

导入后仅追加三处小修复：

- 宽度 ≤640px 时将胜利印章内收，修复 390px 竖屏右缘裁切。
- 宽度 ≤360px 时缩小死亡标题和卡片内边距，修复 320×568 标题折行引起的上下裁切。
- 设置开关使用 `role="switch"` 与 `aria-checked`，移除重复的 `aria-pressed`。

9 个组件仍与原包逐字节相同；`SettingsModal.tsx` 和 `index.css` 的上述修复另列在 [最终文件哈希](../../assets/ui-import/final-files.json)。游戏逻辑、物品模型、存档结构和 `app-lite` 不在本次修改范围。联机继续冻结。

## 验证范围与证据

生产构建 `npm run build` 通过，完整输出保存在 [build.log](build.log)。仍有项目已有的可选字体地址、Browserslist、PostCSS、静态/动态重复导入和较大 bundle 警告。

使用独立 Chrome 测试配置：真实应用入口验证标题 → 设置 → 画面页 → 返回 → 图鉴；其他状态通过生产组件验证页复现。验证页使用内存存储及有限测试地图，不改玩家存档，不代替游戏场景渲染性能测试。

| 检查 | 结果 |
|---|---|
| 桌面 1440×900、触控模拟 390×844 / 844×390 | 十个界面均有截图；主要面板边界通过 |
| 320×568 窄屏 | 死亡卡片、胜利印章修复后边界通过 |
| 设置 | 难度、开关、六个分类、四个画面分页可切换；八种主题可激活 |
| 背包工作台 | 背包、图鉴、状态、地图、日志、任务分页可切换 |
| 搜刮 | 单件入包、剩余计数更新、全部拿取、空容器提示、关闭通过 |
| 存档 UI | 暂停选择手动槽 → 内存存储保存 → 成功提示 → 标题继续页显示层级，通过 |
| 浏览器异常 | 验证过程没有未捕获 JavaScript 异常 |

67 项独立检查通过，保存 45 张截图；逐项检查、面板坐标与视口记录见 [verification.json](verification.json)。React 改动复查覆盖新增事件路径、状态派生、订阅清理和开关语义；未引入新的 API 请求、依赖或游戏逻辑。

## 截图

以下前 3 张来自实际应用入口；其余为生产组件的隔离状态，背景是验证页渐变色。

- [实际标题](app-title-desktop.png)、[实际设置](app-settings-desktop.png)、[实际图鉴](app-codex-desktop.png)
- [桌面 HUD](desktop-hud.png)、[暂停](desktop-pause.png)、[背包](desktop-inventory.png)、[搜刮](desktop-loot.png)
- [竖屏设置](portrait-settings.png)、[竖屏对话](portrait-dialog.png)、[竖屏胜利](portrait-victory.png)
- [横屏标题](landscape-title.png)、[横屏背包](landscape-inventory.png)、[横屏结算](landscape-death.png)
- [窄屏死亡](narrow-death.png)、[窄屏胜利](narrow-victory.png)
- [保存选择](desktop-save-picker.png)、[继续选择](desktop-continue-picker.png)、[浅色主题](theme-liminal.png)

原包视觉方向与截图比对保留在 [previews](../../assets/ui-import/previews/)；没有重新设计或替换包内方案。

## 复现

1. 在 `app` 执行 `npm run build`。
2. 启动本地服务：PowerShell 执行 `$env:L0_VERIFY='1'`，再执行 `npm run dev -- --host 127.0.0.1 --port 3007 --strictPort`；若端口已在使用，可复用当前项目服务或选其他端口。
3. 启动独立 Chrome 配置，设置 `--remote-debugging-port=9238`，打开 `http://127.0.0.1:3007`。不要附着到日常使用的浏览器配置。
4. 在 `app` 执行 `node scripts/verify-ui-import.mjs`。可通过 `UI_IMPORT_URL`、`UI_IMPORT_CDP` 修改服务地址与调试端口。`--finish` / `--ends` 仅用于在已有结果上继续指定验证阶段。
5. 手动组件检查入口为 `/verifier/ui-import.html`；控制台 `__ui.show('settings')` 可切换到 `title/settings/hud/pause/inventory/dialog/loot/death/victory/loading`。

手机尺寸为桌面 Chrome 触控模拟，不是 Android/iOS 真机验收。本轮未重新执行全游戏玩法、GPU 性能或全主题 WCAG 审计；原包有关对比度的声明保留为来源说明，不作为本轮独立审计结论。
