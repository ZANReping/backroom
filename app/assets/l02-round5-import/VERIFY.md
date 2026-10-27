# Level 0.2 第五轮验证（2026-10-26）

- 分支 `level-0-2`；本轮基线 `983cde3`；被测代码 HEAD `4ab3e51`（本提交只加报告/QA 脚本，不改游戏代码）
- 构建：`cd app && npx vite build` → `app/dist`；基线 dist 由 `983cde3` worktree 构建
- 服务：`python3 -m http.server 5262 --bind 127.0.0.1 --directory app/dist`
- 浏览器：Playwright + 系统 chromium，`headless=True`，SwiftShader（`--use-angle=swiftshader`），1280×720，URL 带 `?cpu=1`；拦截 `fonts.googleapis.com` / `fonts.gstatic.com`
- 种子：`qa_r5_outlet.py` / `qa_r5_whiteline.py` 用 `SEED=20261025`

## 结果

| 脚本 | 改后（4ab3e51） | 改前（983cde3） | 文件 |
|---|---|---|---|
| `qa_round5.py`（九项检查 + 前后取景） | 18/18 PASS | 4/18（预期：改前没有这些功能） | `qa-round5-after.json` / `qa-round5-base-983cde3.json` |
| `qa_stage2.py`（崩塌/返回门/Wi‑Fi 等回归） | 27/27 PASS | — | `qa-stage2.json` |
| `qa_stage1.py`（施工许可→L0.2 入口回归） | 17/17 PASS | — | `qa-stage1.json` |
| `qa_r5_outlet.py`（插座墙整面倒，最近 4 处插座） | 3/3 PASS（三角形 0、碰撞体 0、无「插座（通电）」提示） | — | `qa-r5-outlet.json` |
| `qa_r5_whiteline.py`（出生点平视 5 个像素射线求交） | 5 条射线均命中地毯/吊顶，无墙面 | 命中 `l02-wall` x=23、y 15.92–16.08 墙端面 | `qa-r5-whiteline-after.json` / `qa-r5-whiteline-base-983cde3.json` |

所有改后运行：页面错误 0、控制台错误 0。

`qa_stage1.py` 适配：第⑨项起领取施工许可时会弹出纸质许可证（BrcDocument，暂停游戏），旧脚本只点对话「告辞。」，许可证仍开着导致游戏时间不走、后续 `sim()` 全部超时（第一次重跑因此 1 项 FAIL，属脚本问题，不是游戏问题）。`close_overlays()` 现在会再点「放回」关闭单据；另加可选环境变量 `VIEW`（视口，默认 1280x720）与 `SIM_CAP`（单次 sim 上限秒数，默认 150）。本次结果用默认值跑出。

## 前后对比拼图（`sheets/`，JPG）

由 `make_sheet_r5.py r5/base r5/after r5/map OUT` 生成，共 13 张（10 个条目，其中 ②、⑥、⑨ 各两张）：
01 倒墙残留 · 02 / 02b 装饰物细化 · 03 吊顶灯盘 · 04 吊顶碰撞 · 05 进入标题与图鉴子层级 · 06 墙密度实景 / 06-08 布局俯视 · 07 开发者面板 · 08 返回门 · 09 / 09b 施工单据（桌面 / 移动端）· 10 出生点白线。已逐张目检，无文字溢出。

## 待确认

- 第 3 项灯盘间距按吊顶板整数倍取 3.6×4.2 m 晶格（Level 0 本体为 4 m 网格），需用户确认是否接受。

## 未验证

- 真机 GPU 帧率、移动端触屏、有头浏览器。
