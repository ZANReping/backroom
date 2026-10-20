# UI 包导入记录

- 来源：用户提供的 `C:\Users\ZANRe\Downloads\backroom-ui.zip`
- SHA256：`635d70f4ae3dc04e4b81342c98b1ab625916b3cdb2156836cc0b1a554f0bcf55`
- 日期：2026-10-07
- 授权范围：用户提供该包用于当前项目。本记录不推断作者、开源许可证或对外再分发权限。

本次导入基于归档的 `backroom-ui.patch` 反向重建基线。以下 10 个组件与 `index.css` 共 11 个文件均在复制前通过基线 SHA256 校验，确认与当前源文件一致后按哈希保护复制：

- `src/components/DeathScreen.tsx`
- `src/components/DialogOverlay.tsx`
- `src/components/HUD.tsx`
- `src/components/InventoryOverlay.tsx`
- `src/components/LoadingScreen.tsx`
- `src/components/LootPanel.tsx`
- `src/components/PauseMenu.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/TitleScreen.tsx`
- `src/components/VictoryScreen.tsx`
- `src/index.css`

归档文件位于本目录：原始 `README.md`、`backroom-ui.patch`、6 张 `previews/` 图片，以及 `import-files.json`。

本次范围不修改 `app-lite`、游戏逻辑或联机功能；联机继续冻结。

验收记录：[`../../reports/ui-import/REPORT.md`](../../reports/ui-import/REPORT.md)

导入后窄屏结算布局和开关无障碍属性的小修复见验收记录；`final-files.json` 保存最终文件 SHA256，原包补丁和预览保持不变。
