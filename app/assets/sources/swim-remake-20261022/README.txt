游泳重制整包（基线 3df2900 → fa7f3e9，共 3 个提交）
- 739af5f 阶段 1：控制器与物理
- 0be56ae 阶段 2：手感与反馈
- fa7f3e9 阶段 3：机制

swim-all.patch     一次性应用全部改动：在仓库根目录 git apply swim-all.patch
stages/            分阶段的补丁（按 1→2→3 顺序应用）
files/             改动后的完整文件（路径与仓库一致）
SWIM-REMAKE.md     设计与数值文档（也在 files/app/ 里）
*.png / *.gif      曲线图、实机 GIF、屏气三段截图、阶段 3 机制图
验证：cd app && npm run check:swim（89 项）
