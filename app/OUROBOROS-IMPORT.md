# L1 衔尾段 v3.4 接入

2026-10-21，原项目 `E:\ZAN\backroom\app`。接入用户提供的 `backroom-ouro-v34.zip`，累计包含 v3.2、v3.3、v3.4；布局、区段面积与出现概率保持原规则。

衔尾段现在使用灰暖水泥地、暗色裸楼板、喷涂防火棉包覆的横梁和矩形风管，以及喷涂、双色漆和素混凝土三类柱子。墙面图集按世界 UV 划分抹灰、裸砌块、粉黄补丁与黑色上墙；喷涂表面采用包内 v3.4 的柔和低对比贴图。新增红色喷淋支管、柱帽鼓包、斜靠黑格栅和胶合板／桶罐材料堆。地面碎料缩小，脚手架和路障减少，B.R.C. 员工改为每区块约 35% 概率一名。

原直灯改为松垂 LED 灯带，按材质实例化。衔尾段灯源只向下发光，普通生成的功率从 1.55 调为 1.1（固定参考取景区域保留此前的 1.7 校准覆盖）；表面反射率与新版灰暗施工场景同步。小径入口在衔尾大厅一侧采用米黄木门，交互和 EXIT 标识保留。

集成适配：

- 保留当前手臂、Nguithr、花园植物、天鹰逐大厅材质、据点流式加载、光照分步准备、连续阴影与物品缓存；没有使用包内覆盖这些后续改动的旧副本。
- 墙面和双色柱复用原有单个颜色采样器读取图集，不增加额外自定义纹理采样器；经典与真实材质都接入。使用共享混凝土法线，喷涂面的法线强度为 0.3，避免请求包内不存在的新表面法线。
- 施工道具和员工密度通过独立随机流筛选，保留原候选的随机序列与物资／风口标识，避免外观更新重新掷出无关内容。
- 灯带几何模板只作为 CPU 缓存，每个批次独立克隆；新道具按材质合并并共享程序纹理。
- 格栅和材料堆紧邻真实柱体，位置不足时省略，避免被通用摆放逻辑挪到走道中央。木门同时查询门洞两侧的大厅，避免中心落在小径后漏用衔尾样式。
- L1 建筑生成版本仍为 6，主存档仍为 v1；光照修订升为 19，并重新发布参考窗口的离线烘焙。其他种子继续使用现有分步 Worker 烘焙路径。
- 包内临时全局生成、曝光和相机覆盖钩子未接入正式游戏。

来源、原图、提示词和文件校验见 [附件来源](assets/sources/ouro-v34/README.md)、[纹理记录](public/textures/l1/SOURCES.md)。本轮实际游戏截图与数据见 [验收记录](reports/ouro-import-20261021/README.md)，包内截图仅作历史参考。

在 `app` 运行：

```powershell
npm run check:ouro-import
npm run check:l1-v2
npm run check:l1v3-nguithr
npm run check:l1-progressive
npm run check:l1-offline
npm run build
npm run verify:ouro-import -- --seed=20261006 --label=review-realistic
npm run verify:ouro-import -- --seed=20261006 --classic --label=review-classic
```

重新发布离线光照：

```powershell
npm run prebake:l1-smooth -- --out reports/ouro-import-20261021/offline --reuse
```

验收器运行实际 App、独立无头 Chrome、隔离存储与自动分配端口；结束或失败后清理所属进程和浏览器目录。可用 `--scenes=ouroboros,ouro-left,ouro-ceiling,ouro-back` 选择取景，`--no-sample` 跳过性能采样。可用 `CHROME_PATH` 指定 Chrome。脚本记录原生 GPU，并拒绝以软件渲染替代实测。
