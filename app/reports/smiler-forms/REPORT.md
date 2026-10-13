# 笑魇子变种注册与开发者召唤 · 2026-10-07

参照死亡飞蛾，将普通、幽影、饥饿、犬形、巨型登记为 Entity 3 的五个子变种；继续共用 `smiler` 类型、图鉴和遭遇进度，不增加独立实体条目。

开发者面板「召唤 → 实体」的笑魇行增加子变种选择框。选择后按笑魇按钮，每次生成一个指定个体。模型、属性和 AI 当场确定，冻结 AI 时也能显示正确变种；恢复 AI 后不会重新随机。犬形调试召唤只生成一只，正常游戏的权重与犬群机制保持不变。图鉴增加子变种外形和行为，行为仍需共用的三次遭遇解锁。

实现中新增 `EntityDef.smilerKind`，实体工厂与开发者 API 的形态参数支持 `MothForm | SmilerKind`。自然生成未指定形态时仍由原 AI 权重选择。渲染器在 AI 尚未初始化时从实例定义读取形态。旧死亡飞蛾调用及别名继续有效；本轮未修改联机。

验证通过：

- `npm run check:smiler-forms`：实体工厂、共同图鉴、冻结/活动 AI 的确定变种、单只犬形、楼层落点、失败召唤及死亡飞蛾回归。
- `npm run check:smilers`：22 项原行为检查。
- `npm run check:smiler-integration`：诱饵、区块缓存、模型/实例释放等既有接入检查。
- `npm run build`：TypeScript 与生产打包通过，既有字体、Browserslist、PostCSS 和 chunk 警告保留。
- 独立存储的生产 UI 组件完成 12 项浏览器检查，五种下拉选择均通过真实按钮处理函数创建相应实体；图鉴第一/第三次遭遇的锁定和解锁正确，浏览器异常为零。React 检查确认选择状态局部持有、列表 key 和可访问标签存在，未新增全局订阅或逐帧计算。

截图：[开发者选择](developer-selection.png)、[行为未解锁](codex-locked.png)、[行为已解锁](codex-unlocked.png)。[浏览器检查结果](verification.json)

复现 UI：开启 `L0_VERIFY=1` 的本地 Vite 服务，在独立 QA Chrome 中打开 `http://127.0.0.1:3007/verifier/ui-import.html?dev`，调试端口 `9238`，执行 `node scripts/verify-smiler-forms.mjs`。可用 `SMILER_QA_URL`、`SMILER_QA_CDP` 改地址/端口；验证器不写玩家存档。

此轮没有改动几何和音效，也未重做性能基线或移动真机测试。上轮导入报告中的模型限制仍适用。
