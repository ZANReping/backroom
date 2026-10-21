手臂（Entité 15-FR）重制 第 1–3 阶段交付包
- arms-remake.patch：相对基线 002514e 的完整补丁（含新增文件），在仓库根目录执行 git apply arms-remake.patch（路径以 app/ 开头）
- new-files/：新增文件原文件（同样以 app/ 为前缀）
- ARMS-REMAKE.md：说明文档（第 3 阶段见文末）
- reports/arms/：截图、GIF、自检结果、回归日志（regress-base = 改动前，regress-after = 改动后）
校验：git apply -R --check（在改动后的工作副本上）与 git apply --check（在干净的 002514e 上）均通过
