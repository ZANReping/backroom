# 主手收起验收

2026-10-17。实现与玩法边界见 [HOLSTER.md](../../HOLSTER.md)。使用完整生产 `App`、真实引擎／渲染器及其原有输入监听，不以模型预览代替玩法测试。验证页仅用内存存档准备种子 `20261006` 的 Tom 餐馆（104），通过标题页「继续游戏」进入，不读写玩家存档。

最终桌面检查 **40 项**通过（包含实际游戏随机人物贴图检查），默认／左手／自定义触控布局各 **16 项**通过；生产构建通过。另有 [3 组旧键位迁移检查](keybind-migration.json) 全部通过：保留旧 Alt 绑定，必要时将新动作设为右 Alt 或留空供玩家改绑。

## 键盘与机制

[取出](desktop/drawn.png)／[收起](desktop/stowed.png)／[重新取出并食用](desktop/restored.png)。桌面固定 1920×1080、像素比 1，主相机参数和实体坐标见 `verifier/holster-check.ts` 与报告。

以 Chrome CDP 真正按下左 Alt、右 Alt，检查手部退出／恢复。其余覆盖真实键盘改绑后的攻击与快捷使用、按键重复、键位改绑、快捷栏切换、使用中断不扣物品、保留攻击冷却、近战／投掷／粉笔／滋水枪／枪糖入口拦截、背包使用、E 拾取、移动、F1 恢复后仍保持收起，以及副手照明与准星。临时将攻击／使用改绑为 T／Y，以便在无头环境中直接验证键盘路径，不依赖鼠标指针锁定。

## 触控模拟

- [默认布局](touch/default-stowed.png)
- [左手布局](touch/left-stowed.png)
- [自定义位置与缩放](touch/custom-stowed.png)

844×390、像素比 1，通过 CDP touchStart／touchEnd 点击真实按钮。每组检查收起／取出、实际手部显示、48px 触摸目标、安全边界、可访问状态、攻击与快捷使用阻止；旧布局缺少新按钮时使用默认位置。按钮与滚轮模拟／快捷使用分开摆放，并保留交互按钮可用。

这些是 Windows 桌面 Chrome 的触控模拟，不是 Android 真机结果；竖屏游戏仍遵循原有横屏提示，未放开现有方向限制。

## 输出与重现

```powershell
npm run verify:holster
npm run verify:holster -- --touch
npm run build
```

[桌面完整结果](desktop/result.json)、[三组触控结果](touch/result.json)、[构建日志](build.log)。各报告保存检查项、材质资源与启动参数，校验 `--headless=new`、独立端口和浏览器用户目录，最后回收当前验收创建的浏览器与服务器。没有修改联机实现或 `app-lite`。
