# Backroom — Level 4 v2 E2b（窗洞薄墙修复）
- incremental-vs-E2-75a7158.patch：相对 E2 的增量
- full-vs-upstream-8423ae3.patch：相对上游 8423ae3 的完整补丁
- overlay/：本次改动文件
- preview-before-after.jpg：参考 / 修复前 / 修复后（三个机位）

修复：窗洞侧板方向未跟随立面旋转，朝北/朝东的窗把侧板放在两扇窗中间。改 world/l4Plan.ts；check:l4 新增侧板贴墙检查（114469 passed, 0 failed）。
