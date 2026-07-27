# Verifier 索引（append-only）

## v1（2026-07-25 创建）
**测量目标**：实体/物品 3D 模型正确性与完整性的验收标准
**检查项**：
1. 全部实体类型有专属 3D 模型分支（无缺失/无全共用 fallback），复杂度达标（mesh>5 或顶点>100）
2. 全部实体正面=+X（面部特征质心在 +X 半球）
3. 每种实体 idle/walk/chase/attack/death 动画覆盖
4. 全部物品有 3D 拾取模型与背包图标
5. 图标贴图素材存 public/textures/icons/，来源可商用并记录于 SOURCES.md，每张 <64KB
6. `npm run build` 与 `npx tsc --noEmit` 通过
7. Playwright 截图每种实体形态可辨
**执行方式**：`verifier/v1/check.mts`（node 断言 189 项）+ `verifier/v1/shots.py`（15 实体截图目检）
**与前一版差异**：首版

## 运行记录
- 2026-07-25 lead 复跑：`npx tsx verifier/v1/check.mts` → exit 0，189 通过 / 0 失败（另见 verifier/runs/2025-06-14-v14-models.md）
