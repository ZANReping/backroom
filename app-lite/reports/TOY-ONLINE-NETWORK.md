# Toy 线上联机排查 · 2026-09-26

用户场景：一端 B站 App、一端电脑浏览器，不在同一 Wi-Fi，失败发生在加入房间。

## 实际实现与证据

- 入口 `https://www.bilibili.com/toy/BackroomsRoguelike/index.html` 是平台外壳；游戏在 `www.bilibilitoy.com` 的版本化 iframe 内运行。
- `?room=4VD2` 被正确传入 iframe 并预填。线上所用 JS 为 `index-BFVL2c9V.js`，与此前上传包一致。
- 真实页面可以建立 `wss://0.peerjs.com/peerjs` 信令连接并创建房间。两个隔离桌面客户端在真实页面中可加入、准备、开局、同步及退出；实际数据通道是 host ↔ host 直连。
- Toy SDK 用于分享、二维码和容器；游戏的多人传输仍是 PeerJS/WebRTC。SDK 未给这个实现提供跨网游戏中继。
- 强制中继测试失败。现有 PeerJS TURN 报域名查询错误，旧 Open Relay TCP/TLS 地址报连接失败；额外测试的公开服务也未取得 relay 候选。结果见 `turn-probe.json` 和 `turn-staticauth-probe.json`。

这能证明代码和平台桌面 iframe 的直连路径可用，也能证明现有配置缺少已验证可用的中继。不能用本机直连成功证明 App ↔ 不同网络电脑已修复；未拿到用户两台设备的 ICE 日志，不能排除 App 后台挂起或其他设备限制。

## 本次代码补强

1. 移除未经验证且本次不可用的硬编码公共 TURN；使用 `multiplayer.json` 配置真实 TURN、HTTPS 临时凭据接口和可选 PeerJS 信令地址，保留旧 VITE_TURN 环境变量兼容。
2. 每次连接重新获取临时凭据，限制获取时间，校验地址与凭据；未配置中继时不会假称已启用中继。
3. 大厅“联机诊断”能报告无中继配置；配置后实际申请 relay 候选，不以信令连接成功作为中继通过的依据。
4. 区分信令超时与数据通道建立失败，检测浏览器 WebRTC 能力；修复连接完成前退出大厅导致异步残留会话的问题。

## 验证与发布状态

- `multiplayer-published.json`：线上原包的桌面 iframe 实测。
- `multiplayer-toy-preview.json`：在同一个真实平台外壳内，仅通过测试浏览器路由替换为本地新 JS/config 验证；**没有改动线上部署**。
- `check-multiplayer-config.ts`：配置路径、格式、凭据刷新和失败处理检查。
- 新 ZIP 已重新构建并执行 50MB 检查，体积见 `package.json`。原版 app 未改。

**尚未完成：用户 App ↔ 电脑跨网络稳定连接。** 用户目前无 TURN 账号/公网服务器；本包默认仍是直连模式。必须先取得可用 TURN 服务并填入配置，再在用户两端进行实测。操作见 `../MULTIPLAYER-SETUP.md`。

服务商当前说明：[Open Relay 官方文档](https://www.metered.ca/tools/openrelay/)。其常规接入要求账户/API 获取 ICE 配置，不应继续照抄历史固定账号；管理 API Key 不得直接写入公开发布包。
