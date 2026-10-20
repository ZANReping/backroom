# 远距离传送性能优化

本次优化开发者出口工具的远距离传送，以及无限地图跳转共用的远景构建和贴图交接。

- 查找出口与目的地区块预生成共用 Worker，原始网格通过 transferable buffers 传输。规划缓存可复用，空闲 60 秒回收；取消或失败立即终止。
- 在后台准备 5×5 区块及缺失的远景规划后，主线程按原 instantiate / stitch 流程接入。永久搜刮、装饰修订和已有建筑实例仍由主线程应用，保留最近出口与安全落点校验。后台准备不完整、被取消或场景已变化时不移动玩家。
- 远景运河、栏杆、桥墩和水面分批处理；水面仅跳过必定无水的包围框区域，几何、UV、深度与原算法相同。
- 跨窗口给共享贴图最多 4 秒交接期，避免尚未被新模型引用就释放；层级退出仍走原释放逻辑。
- 开发者界面显示目的地区块准备进度，取消按钮覆盖整个准备过程。

## 验证

实际游戏使用真实无头 Chrome、独立端口和专用 profile；截图已检查。固定种子 20261006，1080p，真实光照，细节距离 0.55、8 灯，关闭阴影和 Bloom。实际 GPU、浏览器版本及命令参数均保存于 runtime.json。存档由 verifier 的内存 storage 隔离，不访问用户日常存档。

执行命令：

```text
node scripts/verify-dev-teleport-performance.mjs --label=baseline --cases=outbound,return
node scripts/verify-dev-teleport-performance.mjs --label=baseline --cases=far --profile
node scripts/verify-dev-teleport-performance.mjs --label=optimized --cases=outbound,return,cancel,repeat,far
node scripts/verify-dev-teleport-performance.mjs --label=regression --cases=generic
npm run check:dev-teleport
npx esbuild scripts/check-l11-water-job.ts --bundle --platform=node --format=esm --outfile=.cache/check-l11-water-job.mjs
node .cache/check-l11-water-job.mjs
npm run build
./scripts/check-dev-teleport-cleanup.ps1
node scripts/summarize-dev-teleport-performance.mjs
```

静态检查覆盖 L0/L1/L11 在负坐标的原始生成与预生成等价、L11 装饰版本修订、不完整准备数据不得修改原窗口。水面检查为 4 种形状 × 2 种网格精度，共 8 组，逐项比较原算法的浮点缓冲区。

真实运行覆盖首次办公间传送、返回档案馆、重复传送、14.78 公里传送、在收到第一个目的地区块时取消、L0 自然出口传送。每次落地和渲染完成后都验证实际身体碰撞；确认场景仅持有当前窗口区块，旧模型及待回收贴图队列清空。

## 数据说明和范围

- 同口径 500 米测试在 baseline/near-runtime.json 与 optimized/runtime.json；完整表格见 index.html / comparison.json。
- 附近就绪为 renderer 原生 24 米邻域门槛。settledMs 还包含整个可见窗口、远景、后台上传和资源释放，及 verifier 的一秒稳定观察期。
- 首次冷传送把远景规划等待提前，因此 actionMs 可能略增；优化重点是主线程停顿与附近场景可用时间。后续重复查找复用 Worker 规划缓存。
- far 基线启用 CPU Profiler，优化后测量未启用，因此不将两者作为严格同比。目录中 cpuprofile 为开发期间诊断采样，最终数字以 optimized/runtime.json 为准。
- 最终运行零 JS 错误；网络记录中仅有原本的 favicon.ico 404。构建仅保留已有大包提示。
- 未对其他开发者快捷传送的全部目的地逐一验收；L1 本次做生成一致性检查，未做完整浏览器运行；没有重新承诺稳态 60 FPS。联机、app-lite 和 Godot 不在本次范围。

测试进程、端口与配置目录的只读清理确认见 cleanup.json。
