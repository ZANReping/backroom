# 阵营寄存仓库界面 v2

基线：GitHub 032a79a。上次交付（商店界面）为 560f9d5，本次为 a0cbbed。

- backroom-warehouse-ui-incremental.patch：在商店界面包（560f9d5）之上直接打
- backroom-warehouse-ui-full.patch：在 032a79a 上一次打齐（含商店界面）
- overlay/：相对 032a79a 改动/新增的完整文件，按路径覆盖即可
- preview/：改前改后对比（cmp_meg / cmp_bntg）与手机截图（mobile）

打补丁：`git apply --binary backroom-warehouse-ui-incremental.patch`
验收：`npm run check:warehouse-ui`（22 项），说明见 app/WAREHOUSE-UI.md。
