# 原项目同步验收（2026-10-20）

本轮将已完成的 L1 v3 与 Nguithr 重制接入同步到原项目 `E:\ZAN\backroom`。GitHub 副本仅作为只读来源；后续以原项目为主，已记入根目录 [AGENTS.md](../../../AGENTS.md) 和 [info.md](../../../info.md)。

- 精确清单共 212 个文件：42 个原文件在复制前与接入基线逐字节一致，另新增 170 个文件，未发现合并冲突。
- 42 个原文件先备份到 `E:\ZAN\backroom\.cache\sync-l1v3-nguithr-20261020\backup`，SHA-256 再核验通过。目录规则修改前的 AGENTS.md 也单独备份。
- 清单外 1,181 个源代码、脚本及验证文件经只读核对一致；原项目其它已有修改保留。
- 最终 211 个清单文件与已验收来源逐字节一致，info.md 仅额外增加本次目录与验收记录；GitHub 来源各文件和原 AGENTS.md 哈希未变。详见 [清单](manifest.json)、[复制结果](copy-result.json)、[最终审计](audit.json)。
- 不变更依赖版本或锁文件；L1 生成版本 6、最终烘焙修订 17 及主存档 v1 保留。

在原项目 `app` 目录重新运行，全部通过：

```powershell
npm run build
npm run check:l1v3-nguithr
npm run check:nguithr
npm run check:nguithr-anim
npm run check:l1-progressive
npm run check:model-warmup
npm run check:shrimp-item-cache
node scripts/verify-l1v3-nguithr.mjs --seed=20261006 --scenes=spawn,parking-props,garden --label=original-project
```

[构建结果](build.json) / [构建日志](build.log)；[专项结果与耗时](checks.json)。模型接入 49,718 项断言、Nguithr 80/80 项机制、全部动画、最终烘焙相等与预热检查通过。本次新生成的 [模型检查数据](static-original.json) 与 [机制记录](mechanics-original.txt) 单独保留，复制过来的上轮报告继续保留原始内容。

实际 App 使用独立 Vite 服务、Chrome `--headless=new`、1920×1080、真实光影及 NVIDIA RTX 4060 Laptop / D3D11。点击继续至 L1 可玩为 **8.47 秒**；不包含程序启动和标题页等待，也不代表全层级性能重测。

出生场景、天鹰道具和花园检查通过，已查看截图；Nguithr 原生 GPU 蒙皮、五段姿态、切囊→镇静→垂降→进食、键盘挣脱及镇静腺掉落检查通过。六轮生成／回收后均稳定为 672 个几何、174 张纹理、100 个程序（包含整个已加载世界）。游戏运行与资源请求错误为 0，仅浏览器 favicon.ico 返回无关的 404。测试浏览器、独立服务及用户目录已清理。

[实际运行完整数据](../l1v3-nguithr-20261020/original-project/result.json) · [天鹰道具截图](../l1v3-nguithr-20261020/original-project/parking-props.png) · [花园截图](../l1v3-nguithr-20261020/original-project/garden.png) · [Nguithr 截图](../l1v3-nguithr-20261020/original-project/nguithr-idle.png) · [机器可读汇总](summary.json) · [清理确认](cleanup.json)

本轮为目录同步与原目录复验；上轮完整经典／真实光影、其它相关层级及来源记录见 [接入说明](../../L1V3-NGUITHR-IMPORT.md) 与 [上轮完整报告](../l1v3-nguithr-20261020/README.md)。
