# 爬菌（Entity 17）重制 · 完整补丁（阶段 1 + 阶段 2 + 阶段 3）

**基于远端 main 032a79a。** 补丁 = 工作副本 crp-wt 的 `efedfae..c444baa`（efedfae 是 032a79a 的子集基线：src / scripts / html / configs，不含 reports / public / assets），
包含三次提交：a99309a（阶段 1 建模 + 爬菌人重做）、a88c3a4（阶段 1 收尾 + 阶段 2 动画）、c444baa（阶段 3 机制 + 收尾）。

## 内容
- `creeper-full.patch`：`git diff --binary efedfae c444baa`（含 reports/creeper 下的截图，二进制差分）。
- `CREEPER-REMAKE.md`：设计与实现说明（各阶段做法、CR 数值表、LOD 三角形 / 绘制次数、已知问题）。
- `creeper-stage3.jpg`：阶段 3 汇总截图（LOD 三档 / 第一人称各阶段手臂 / 爬菌人扑击根位移 + 拖腿 / 孢子团 / 实机 L2）。

## 应用
在 032a79a 的仓库根目录（含 `app/`）：

```bash
git apply --check --binary creeper-full.patch   # 先检查
git apply --binary creeper-full.patch           # 应用（按二进制处理，不要转换换行符；不要用会改 CRLF 的工具）
# 或者保留提交信息：在 032a79a 上 git am 不适用（这是 diff 不是 mbox），直接 apply 后自行提交
```

补丁不改 `tsconfig*.json`、`.gitignore`，也不带任何遗留的未跟踪文件。

## 验证（已在干净的 032a79a 解包 /workspace/work/newmain2/backroom-main 的副本上做过）
- `git apply --check --binary` rc=0，`git apply --binary` rc=0（只有一个「文件末尾空行」的空白警告，可忽略），应用后与 crp-wt 的文件逐字节一致。
- `cd app && node_modules/.bin/tsc --noEmit -p tsconfig.app.json` rc=0。
- `cd app && npm run check:creeper` → 90/90 passed。
- 截图：`cd app && node scripts/verify-creeper.mjs lod fp spores anim-human-lunge3 anim-rat-drag`（vite 3495 / CDP 9495，同时只开一个浏览器，结束按 pid 关闭）；
  实机：`node scripts/verify-creeper.mjs game-l2`（需要 app/public 资源；软件渲染下进游戏要几分钟）。

## 新增 / 主要改动的文件
- 新增：`src/game/engine/creeperAI.ts`（全部机制 + CR 数值表）、`src/game/renderer/creeperRender.ts`（模型 / 动画接入 / LOD / 孢子团与僵尸蜘蛛 / 第一人称手臂）、
  `src/game/world/chunkHooks.ts`（chunk 实例化钩子）、`scripts/check-creeper.ts`（`npm run check:creeper`）、`src/game/renderer/creeperMesh.ts` / `creeperAnim.ts`（阶段 1–2）、
  `proto-creeper.html` + `src/proto/creeperProto.ts`、`scripts/verify-creeper.mjs`、`scripts/creeper-gif.py`。
- 接入：engine.ts、engine/{entityAI,combat,inventory,interact,special,save}.ts、entities/{critters,forms,spawns,types}.ts、content/{items,codexScores}.ts、
  renderer/{renderer,entitiesMesh,entityArchiveModel,itemsMesh,retroViewHand}.ts、world/infinite.ts、components/HUD.tsx、package.json（共 32 个源码 / 文档文件 + reports/creeper 截图）。
