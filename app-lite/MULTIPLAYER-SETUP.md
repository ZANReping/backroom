# Toy 联机配置

当前实现：Toy SDK 分享相对邀请链接 → PeerJS 公共信令交换连接信息 → WebRTC 数据通道传输游戏状态。Toy SDK 本身不提供本游戏可用的房间服务器或跨网中继。

已发布页面实际是 `www.bilibili.com` 外壳 + `www.bilibilitoy.com` 内容 iframe。房间参数可传入，信令 WSS 可建立，本机两个隔离客户端在这个真实页面中可完成联机。需要 TURN 的网络没有因此得到保障。

## 不需要重编译的配置

修改 `public/multiplayer.json` 后构建；如果直接修改上传产物，则修改 `dist/multiplayer.json` 后重新压缩 dist。配置与 index.html 放在同一目录，Toy 版本路径下也可读取。

默认 `iceServers: []` 表示只尝试直连，**没有中继保证**。不要填入网上未经验证的固定账号，也不要误认为建房成功就代表双方能传输数据。

已有 TURN 凭据时，示例（占位值必须换成服务方提供的真实值）：

```json
{
  "iceServers": [{
    "urls": ["turns:YOUR_TURN_HOST:443?transport=tcp"],
    "username": "YOUR_TURN_USERNAME",
    "credential": "YOUR_TURN_CREDENTIAL"
  }],
  "relayOnly": false
}
```

普通长期 TURN 账号会暴露给客户端；生产环境宜用有过期时间的凭据。支持 `iceServersEndpoint` 指向自己的 HTTPS 凭据接口，每次建房/加入重新读取，返回 ICE 数组或 `{ "iceServers": [...] }`，接口必须允许游戏内容域的 CORS 请求。**不要把服务商管理 API Key 写入此公开文件。** 原有 `VITE_TURN_URL/USER/PASS` 仍兼容。

`signaling` 可配置兼容 PeerJS 的 WSS 服务 host/port/path/key；只换信令不能解决 NAT 穿透。`relayOnly: true` 用于验收中继，不能在未配置 TURN 时启用。

## 验收

先在大厅点“联机诊断”；配置了 TURN 时会实际申请 relay 候选，12 秒内未得到候选就报告失败。取得候选只证明可以分配通道，最终仍需双方准备、开局和状态同步。

分别测试同 Wi-Fi、不同运营商、手机数据网络，确认房主保持页面前台。四位房间码仅在房主在线时有效，重新建房会产生新码。Level 0 的孤立效应会隐藏队友。

没有可用 TURN 或公网中继时，纯静态 ZIP 无法保证两个禁止直连的网络互通。本次没有为用户注册账户或部署服务。当前默认包仍为直连模式，不能宣称跨网联机已彻底修好。
