# 关闭界面后恢复鼠标视角

2026-11-12。游戏内弹窗打开时释放游戏画布的指针锁定，关闭最后一层界面并返回可操作的场景时重新请求原始鼠标输入。按 Esc 关闭时，等待松键和浏览器处理完该按键后再请求。打开据点入口的过场结束后恢复视角。恢复失败时可以点游戏画面重试。

锁定确认后，游戏继续使用浏览器传递的原始相对位移。关闭按钮的点击不会进入游戏攻击逻辑。未完成的锁定请求遇到新界面时会释放，避免挡住新面板。浏览器手动释放鼠标时，游戏等待下一次明确的捕获操作或界面关闭。 [Pointer Lock 2.0](https://w3c.github.io/pointerlock/)

使用 Windows Chrome 157.0.8103.50 的原生指针锁定，独立 `--headless=new` 浏览器、配置目录和调试端口。验收从种子 `20261006` 的 Tom 餐馆存档启动实际 App，使用内存存档，通过 CDP 派发真实键盘和鼠标输入。

| 检查 | 结果 |
| --- | --- |
| 原代码 | 第一次点击完成原生锁定，按 I 打开和关闭背包后保持解锁。[复现记录](before/result.json) |
| 桌面 | 31 项通过，覆盖背包快捷键和关闭按钮、地图、长时间阅读后用 Esc 关闭、图鉴内文档、现场业务、手机、暂停和设置、搜刮面板叠加、切入办公区 EL3A、回到标题、拒绝和延迟回包。关闭后派发鼠标移动，实际视角改变。[运行记录](desktop/result.json) |
| 桌面触控模拟 | 844×390 视口，6 项通过。触控打开与关闭背包、文档的过程中，桌面指针锁定请求为 0。[运行记录](touch/result.json) |
| 原始鼠标输入回归 | `npm run check:mouse-look` 通过。 |
| 生产构建 | `npm run build` 通过。[构建日志](build.log) |

桌面测试对锁定拒绝和延迟确认各注入一次可控条件，其余成功锁定由 Chrome 原生接口完成。三次最终验收均已清理所用浏览器、服务和配置目录。浏览器实测范围为 Windows Chrome，触控使用桌面模拟。

[背包打开](desktop/inventory.png) · [文档打开](desktop/document.png) · [关闭后回到游戏](desktop/after-close.png)

在 `E:\ZAN\backroom\app` 下复现。

```powershell
node scripts/verify-pointer-resume.mjs
node scripts/verify-pointer-resume.mjs --touch
npm run check:mouse-look
npm run build
```

需要复现原行为时，`node scripts/verify-pointer-resume.mjs --before` 从本次保留的 `.cache/pointer-resume/App.before.tsx` 读取旧代码，仅在隔离的 Vite 服务中替换对应模块。
