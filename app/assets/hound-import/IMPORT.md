# 猎犬更新包导入记录

- 日期：2026-10-08。
- 用户提供：`C:\Users\ZANRe\Downloads\backroom-hound.zip`，1,504,178 字节。
- SHA-256：`a2ef90ef73c1305a546ad4178f5b494a5d9d6aed45b5fb64a2b838bd2e04213a`。
- 原包补丁、README、设计说明和四张预览分别保留为 `hound-remake.patch`、`ORIGINAL-README.txt`、`ORIGINAL-HOUND-REMAKE.md`、`previews/`。
- 原包未单列源码作者和独立源码许可证；本记录不推定其为某种开源许可。按用户授权合并至现有项目。

## 设定与造型来源

2026-10-08 核对 [Wikidot Entity 8](https://backrooms-wiki-cn.wikidot.com/entity-8)：原作者 Palico22，重写者 1000dumplings；站点文章采用 CC BY-SA 3.0。原包将条目附图作为造型参考，图片作者 chompgwenarts，条目署名块标明 CC BY-SA 4.0，链接至 [原作者 Tumblr](https://www.tumblr.com/chompgwenarts/764183878119342080?source=share)。未下载、复制该图片到运行时纹理。

`src/game/renderer/houndMesh.ts` 包含原包的程序化几何和两张 256² Canvas 贴图生成方法；皮肤与毛发贴图在运行时生成并共享缓存，不包含外部位图资源。`src/game/core/audio.ts` 的嚎叫由振荡器合成。游戏中的时长、距离和伤害是项目玩法参数，不是维基原文的精确数值。

## 合并与修正

逐段合并现有文件，保留此前笑魇停距、巨型弯腰、物品、UI 和 Level 1 的工作区修改。只接入单机逻辑，联机继续冻结。

修正原包的引擎/地图间缓存共用、流式坐标漂移、首次受击漏判、同类楼层过滤、隔墙/隐身扑击、Level 3 伏击与直视状态相互抢占。玩家首击即使致命也会触发中立同类反应。开发者召唤初始化中立状态，并使用当前楼层高度。

修正皮肤污渍与毛发横向平铺时的随机参数不一致；以有限次平面双骨求解校正伏低/坐姿和步态落脚，不增加模型面数或网格。每实例独立拥有几何与材质，两个贴图共享；移除实例时保留贴图。

当前实现说明见 [HOUND-REMAKE.md](../../HOUND-REMAKE.md)，检查和截图见 [验收记录](../../reports/hound-import/REPORT.md)。
