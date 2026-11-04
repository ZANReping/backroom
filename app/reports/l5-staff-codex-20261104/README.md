# Level 5 员工图鉴 v2 接入验收

用户提供的 `l5-staff-codex-v2.zip` 包含第一版全部界面改动，并修订七位员工的头像取景。采用 v2 的组件和取景参数，定向合并到现有图鉴及住客登记簿。两份附件的 JPG 用作验收参考。运行时头像由现有实体模型生成，复用实体图鉴的离屏工作室。

- 野兽、迎宾女郎、厨师和爵士脑各有独立员工档案，按已有的 1／3／6 次遭遇分档展示。记录读取当前存档。野兽档案的婉拒代价与契约时限直接取游戏规则。
- 七位员工遇见后显示 116×148 的棕调头像，未遇见时保持剪影。相同光影模式下再次打开登记簿复用头像，首次七张头像对应七次模型构建。关闭后工作室自动释放 WebGL 上下文。
- 经典和真实光影各通过 20 项实际游戏检查。使用独立 Chrome Headless 和内存存档，种子为 515151.25，桌面视口 1920×1080。另验证 844×390 横屏触控模拟，无横向溢出。未测试移动真机。
- 生产构建及 `check:l5-integration`、`check:l5hotel`、`check:beast`、`check:bellhop`、`check:concierge`、`check:entity-preparation` 通过。

[真实光影结果](realistic/result.json) · [经典光影结果](classic/result.json) · [七张头像](realistic/portraits.png) · [员工名录](realistic/ledger.png) · [野兽完整档案](realistic/beast-full.png) · [触控模拟](realistic/touch.png)

在 `app` 下复现：

```powershell
npm run build
node scripts/verify-l5-staff-codex.mjs --label=realistic
node scripts/verify-l5-staff-codex.mjs --classic --label=classic
```
