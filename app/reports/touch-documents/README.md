# 移动端点按打开文档

在真实游戏中，交互键的 touchstart 打开文档并卸载触控面板。同一次触摸产生的兼容点击随后落在新出现的遮罩上，文档随即关闭。原始事件顺序见 [修复前记录](before/result.json)。浏览器允许在触控期间页面发生变化时重新选择兼容点击的目标。 [Touch Events 规范](https://www.w3.org/community/reports/touchevents/CG-FINAL-touch-events-20240704/#mouse-events)

横屏、竖屏、自定义布局的攻击／交互按钮均在原生 touchstart 上阻止这次兼容点击。交互依然在按下时提交，抬手后文档留在屏幕上。

Windows Chrome 无头触控模拟验证了普通文档、马尼拉文件、竖屏短按和长按，以及攻击键的按住和释放。自定义按键和图鉴文档入口也通过检查。 [默认布局](verified/result.json) · [自定义布局](custom/result.json) · [图鉴](codex/result.json) · [竖屏截图](verified/default-portrait.png)

在 E 盘原项目的 app 目录运行 `node .cache/check-touch-doc.mjs --touch`，自定义布局加 `--custom`，图鉴加 `--codex`。`npm run build` 已通过。 [构建日志](build.log)

触控使用桌面模拟。测试浏览器、服务和配置目录均已清理。
