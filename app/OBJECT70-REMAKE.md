# Object 70 尸体细化 v83

2026-10-17，接入用户提供的 `backroom-object70-v83.zip`。仅合入本版新增文件和相关文本增量，未执行包内完整补丁或覆盖已有源码。修改前源码快照为 `.cache/object70-v83-before/`，导入记录、实际游戏截图与回归结果见 [验收记录](reports/object70-v83/README.md)。

## 接入内容

- 场景可搜刮结构 `corpse` 改为俯卧、头侧转的复古人物：五种西装、两种手臂姿势，带皮鞋、右手银戒、颈部暗斑和老式公文包。
- 新鲜／腐败／白骨外观约按 70%／20%／10% 选择；这是按世界坐标固定的外观变体，没有新增随时间腐烂机制。白骨款沿用附件的局部颅骨／指骨方案。
- 公文包随搜索进度抽出、弹扣，完成后开盖约 112°；中断则回收，取空后保持敞开且隐藏内容物。已有 `opened`、`searched`、`lootItems`、`looted` 字段继续生效。
- 搜索时长 1.8 秒，普通掉落两件，新增便当、水和文具等池内容及稀有私人物件。新增 `bento` 自制便当：食用恢复 45 饥饿，含地面／手持模型、像素图标和图鉴分类。
- 候选尸体按确定性哈希保留约一半，有限和无限生成均接入；不消耗生成器随机数。其它建筑、实体和物资生成规则保持原有顺序。

这次替换的是 `corpse` 场景容器，击杀实体或 NPC 的死亡动画继续使用原实现。

## 与当前项目的兼容修正

俯卧人物使用现有人物工厂的可选 `specPatch`，保留固定 NPC 专属脸、面部对齐、Poolface v82 和现有配饰。静态模型约 2.5k 三角面；公文包的静态小件先按材质合并，可动部件沿用现有容器动画及合批接口，不为尸体保留运行骨骼。

每种光影模式缓存有限的 CPU 模板；运行实例各自持有几何与材质，图片共用。卸载尸体、回收便当、重建画质不会释放其它实例。公文包、便当及小配件使用现有受光材质工厂，支持经典／真实模式及区域受光。

为原来没有 SID 的尸体补充由层级、世界坐标和楼层派生的负数标识，保留已存在的标识。这样 Level 1 的自然生成尸体可以复用现有搜刮持久化，流式窗口平移不改变身份。本轮实际存读档验收覆盖 Level 1；没有重做其它层级的通用存档规则，也没有提高主存档版本。

Alt 收起时同样不能食用便当，拾取和搜索仍可进行。

## 来源与许可

归档 SHA256：`6092df64855bb8be0fd8b53f67877e839fe835c933ae328d7dc02b7255352e9e2`。归档模型为 TypeScript 程序几何；新增图片仅为附件提供的 `public/textures/icons/pixel/item_bento.png`，128×128，保留原成品。可复现绘图逻辑合入 `scripts/gen-item-icons.py`，正常使用不必重跑整个图标生成器。

设定参考 [Wikidot 中文站 Object 70](https://backrooms-wiki-cn.wikidot.com/object-70)，作者 [Sariastuff](https://www.wikidot.com/user:info/sariastuff)，译者 [Ambersight](https://www.wikidot.com/user:info/ambersight)，页面标注 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。本实现将条目中的人物、服装和公文包特征转为游戏几何与交互，未下载维基图片。

附件没有单独提供模型／图标作者署名或 SPDX 许可文件，记录为用户提供的更新资产，不推定为 CC0。复用的人物脸池和衣物沿用 [NPC 面部 v6](NPC-FACES-V6.md) 与 [Poolface v82](POOLFACE-V82.md) 的原有来源记录。

## 验证

```powershell
npm run check:object70
npm run verify:object70
npm run verify:object70 -- --before
npm run build
```

前后比较的 `--before` 需要本轮修改前快照；正常游戏和常规静态检查不依赖该快照。游戏验收页仅使用独立的内存存档，浏览器为真正无头 Chrome，结束后清理所属浏览器、服务器和临时配置。
