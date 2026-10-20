# 人士图鉴与形象编辑（2026-10-17）

人士图鉴现在使用正面的头、颈、肩肖像，按人物实际头型、头发及帽饰计算取景。形象编辑分为“头部”和“身体”标签；头部标签拉近镜头，身体标签显示全身。鼠标或触控拖动预览旋转，松开后保持朝向；方向键也能调整，Home 恢复正面。

## 打开性能

旧实现会在 React 渲染期间同步建模、截图，并在任意人物贴图加载完成后重新触发整组肖像。现在 `NpcPortraitImage` 先显示固定尺寸占位图，进入视口附近才排队生成，离开视口或关闭界面时取消未完成任务。

- 肖像共用一个离屏 WebGL 画布，每帧最多完成一张，最多保留两个等待贴图的模型。
- 按人物外观、配饰、画幅和尺寸缓存；上限 160 张／8 MiB。重复打开直接使用已生成的图片。
- 贴图完成只唤醒生成队列，不再广播重绘所有 React 图片。
- 保留上一张肖像的一个模型，直到下一张完成渲染后再释放，让共享着色器程序连续复用。模型不会随浏览人数无限累积。
- 人士列表使用浏览器的 `content-visibility` 降低屏外布局成本。M.E.G. 联系人同步采用头肩照片。

## 形象编辑

头部包含肤色、发型、发色、表情、眼镜和胡须；身体包含性别、上衣、裤子和鞋子。修改仍立即保存。切换标签、改变外观和拖动时复用同一预览画布；停止自动旋转，保留轻微待机动作。预览限制为约 30 FPS，屏外或页面隐藏时停止绘制。

`src/game/renderer/avatarFraming.ts` 为编辑器与肖像共用的取景逻辑，直接使用骨骼及带权重顶点的世界坐标，避免用固定高度裁掉帽子。没有人体骨骼的 Tiny 保留其实际实体造型，并取上半身。

## 验证与复现

在 `app` 目录运行：

```powershell
npm run check:avatar-framing
npm run verify:people-ui -- verified
npm run build
npx eslint src/components/AvatarEditor.tsx src/components/AvatarPreview.tsx src/components/NpcPortraitImage.tsx src/components/npcPortrait.ts src/components/MegContacts.tsx src/game/renderer/avatarFraming.ts
```

浏览器脚本使用独立端口、临时配置目录及真正的 `--headless=new` Chrome。人士检查通过生产 `InventoryOverlay` 和真实模型工厂运行，使用隔离的内存存储解锁全部 96 名人士；形象编辑另外覆盖实际应用主菜单入口。不会修改玩家存档。

通过 264 项取景断言、9 项编辑器交互检查及既有 24 项形象 UI 回归；覆盖桌面鼠标拖动、触控拖动、键盘标签切换、编辑保存、滚动补载、重复打开与取消生成。生产构建及定向 ESLint 通过。详细数据、截图和限制见 [验收记录](reports/people-ui/README.md)。

本次复用已有模型及贴图，未新增外部美术资产。
