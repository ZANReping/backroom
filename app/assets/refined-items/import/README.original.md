# Backroom 物品模型细化包（2026-10-07）

细化了 `app/src/game/renderer/itemsMesh.ts` 中仍用方块/圆柱拼接的全部 **55 件物品**，并为其配了 UV 与四套 PBR 图集。未提交到仓库。

## 目录
- `patch/refined-items.patch` —— 基于 main 最新提交的完整补丁（含二进制贴图）。在仓库根目录运行：`git apply patch/refined-items.patch`
- `files/` —— 改动/新增文件的原样拷贝（与仓库路径一致），可直接覆盖。
- `models/obj/` + `models/textures/` —— 每件物品的 OBJ+MTL（引用图集颜色/法线/粗糙度），可直接导入 Blender 检查 UV。
- `preview/contact-sheet.png`、`preview/items/` —— 每件两个角度的离线预览（软件光栅化，仅看外形与 UV）。
- `report.json` —— 每件面数、批次、尺寸、所用图集。

## 详细说明
见 `files/app/REFINED-ITEM-MODELS.md`（规范、逐件外形说明、验收项）。

## 验证
`npm run check:refined-items`（1,748 项通过）、`check:six-items`、`check:item-batches`、`check:model-warmup`、`check:texture-images`、`npm run build` 均通过。
未在浏览器/GPU 内实机截图测帧。
