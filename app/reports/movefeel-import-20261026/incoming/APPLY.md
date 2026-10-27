# 应用移动手感补丁

基线：backroom main `032a79a`（仓库根目录执行）。补丁为 `git diff --binary`，含 1 张图（app/reports/movefeel/curves.jpg）。

```bash
cd backroom                       # 仓库根（含 app/）
git apply --check movefeel.patch  # 先检查
git apply movefeel.patch          # 应用
cd app
npx tsc --noEmit -p tsconfig.app.json
npm run check:movefeel            # 81 项
npm run check:swim                # 回归
node scripts/verify-movefeel.mjs  # 可选：曲线预览 → reports/movefeel/curves.jpg（需要无头 Chromium，vite 端口 3497）
```

撤销：`git apply -R movefeel.patch`。

注意：文件按原样（LF）修改，不要用会改换行的工具重新保存；补丁只改 `app/` 下 20 个文件（修改 12 个、新增 8 个）。
调参都在 `app/src/game/engine/moveTuning.ts` 的 `MV` 表，详见 MOVEFEEL.md。
