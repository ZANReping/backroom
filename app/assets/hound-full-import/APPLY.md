# 猎犬（Entity 8）重制 · 完整补丁（阶段 1 + 1.1 + 2 + 3 + 3.1 + 3.2）

**基于远端 main 032a79a。** 补丁 = 工作副本 hd-wt 的 `25e8bd7..e24ddaa`（25e8bd7 是 032a79a 的子集基线：src / scripts / html / configs，不含 reports / public / assets），
包含六次提交：6575c71（阶段 1 建模）、3673419（阶段 1.1 修模型）、7f6f626（阶段 2 动画）、5b293cd（阶段 3 行为与机制）、958338c（阶段 3.1 扑倒挣脱进度条 HUD）、e24ddaa（阶段 3.2 第一人称被扑倒实机测试与修复）。

## 内容
- `hound-full.patch`：`git diff --binary 25e8bd7 e24ddaa`（80 个文件，含 reports/hound 下的截图，二进制差分）。
- `HOUND-REMAKE.md`：设计与实现说明（各阶段做法、HD 数值表、LOD、已知问题）。
- `hound-stage3.jpg`：阶段 3 示意图（左：群猎包抄站位；右：pin 前爪落在玩家胸口）。
- `hound-fp-pin.jpg`：阶段 3.2 游戏实机第一人称四时刻（扑中 / 被咬红闪 / 挣脱 55% / 挣脱后硬直）。
- `hound-pinhud.jpg`：阶段 3.1 压制中的挣脱进度条 HUD 示意（左：桌面 1280×720；右：移动端 390×844，带「挣脱」情境按钮）。

## 应用
在 032a79a 的仓库根目录（含 `app/`）：

```bash
git apply --check --binary hound-full.patch   # 先检查
git apply --binary hound-full.patch           # 应用（按二进制处理，不要转换换行符）
```

补丁不改 `tsconfig*.json`、`.gitignore`，也不带任何遗留的未跟踪文件。

## 验证（2026-10-25）
- 在 hd-wt（HEAD e24ddaa）上 `git apply -R --check --binary hound-full.patch` rc=0；
  在 25e8bd7 的干净 worktree 上 `git apply --check --binary` rc=0、`git apply --binary` rc=0，应用后整棵树与 e24ddaa 相同（`git write-tree` = a4bbf98）。
- `cd app && node_modules/.bin/tsc --noEmit -p tsconfig.app.json` rc=0。
- `npm run check:hound`（121/121）、`npm run check:hound-integration`（meshes 8 / triangles 22770 / sharedTextures 2）、`npm run check:hounds`、`npm run check:entity-forms`（252）、`npm run check:hound-anim` 全过。
- 截图：`cd app && node scripts/verify-hound.mjs stage3 pinhud pinhud-mobile`；第一人称实机：`node scripts/verify-hound-fp.mjs --held=crowbar` + `python3 scripts/hound-fp-sheet.py`（vite 3496 / CDP 9496，`?cpu=1`，同时只开一个浏览器，结束按 pid 关闭）。

## 阶段 3 改动的文件
- 机制：`src/game/engine/houndAI.ts`（HD 表 + 全部机制）。
- 接入：`src/game/engine.ts`（`crosshairRay`）、`engine/movement.ts`（`houndControlsPlayer`）、`engine/special.ts`（`houndPin` 情境动作「挣脱」）、
  `renderer/renderer.ts`（压倒视角、`animateHound` 传距离与玩家位置）、`renderer/houndAnim.ts`（新相位映射、步幅缩放、pin 前爪落点、LOD 三档）、
  `entities/critters.ts`（图鉴）、`entities/forms.ts`（三形态描述）。
- 验收 / 预览：`scripts/check-hound.ts`（新增，`npm run check:hound`）、`scripts/check-hound-integration.ts`（L3 实机直视段改为准星跟随头部）、
  `src/proto/houndProto.ts`（`?view=stage3`）、`scripts/verify-hound.mjs`（`stage3`）、`reports/hound/stage3.jpg`。

## 阶段 3.1 改动的文件
- `src/game/engine/houndAI.ts`：`houndPinOverlay` / `HoundPinHud` / `PIN_BITE_FLASH`（每口撕咬记 `hd.biteAt`、手电照脸记 `pinFlash`；挣脱规则不变）。
- `src/components/houndPinHud.tsx`（新增）：`HoundPinHud` + 纯展示 `HoundPinBar`；`src/components/HUD.tsx` 一行接入（`// [hound]`）。
- 验收 / 预览：`scripts/check-hound.ts`（新增「挣脱进度条 HUD」16 项）、`proto-hound-pinhud.html` + `src/proto/houndPinHudProto.tsx`、`scripts/verify-hound.mjs`（`pinhud` / `pinhud-mobile`）、`reports/hound/pinhud*.png|jpg`。
