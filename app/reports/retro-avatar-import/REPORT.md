# 复古人物模型导入记录

日期：2026-10-14。来源：用户提供的 `backroom-retro-avatar-full.zip`。
SHA256：`0A05EC4C996EE62AF4D968C3BC73D8A80EE866274F2DFF5DD74208CDD6A359E4`。

## 接入内容

- 玩家形象编辑、装备预览、NPC 档案及阵营证件照使用新的骨骼人物。
- 据点普通居民和四个专属人物 Kat、Tom、佐藤爱子、科瓦尔斯基；无面灵及人形伪装共用人物工厂。
- 16 种可选发型、8 款上衣、6 款裤装、表情/眼镜/鞋子，以及新增胡须选项；保留原 AvatarCfg 字段与存储键。
- 导入 268 个运行时纹理及源图/manifest 文件，10,201,677 字节，与归档逐文件 SHA256 一致。保留两个 Python 纹理处理脚本。来源和包内许可声明见 `../../assets/retro-avatar-import/SOURCES.md`。
- 原有第一人称手部仍使用 viewmodel。本次没有替换旧 playerModel 或远端玩家实现。

## 接入修正

模型、材质和 Skeleton 独立释放，脸/服装图片跨实例共享。修复 2×2 占位图先上传后阻止 128×128 图片更新的冷启动问题；现在上传前释放旧 GPU 分配，并用实际 GPU 像素差异验证。

静态头像在贴图到达后刷新，完成的肖像缓存最多 96 项。形象编辑只重建模型，复用 WebGL 上下文。新人物保留区域环境光照 shader；无面灵种子固定，外部骨骼动画和原有配饰挂点继续工作。

## 验证

在 app 目录运行：

```powershell
npm run check:retro-avatar
npm run check:model-warmup
npm run check:program-completion
npm run check:texture-images
npm run check:smiler-integration
npm run check:hound-integration
npm run check:duller-integration
npm run build
```

- 人物模型：2,441 项检查，110 种配置，覆盖 UV 范围、有限数值、19 骨骼、权重、预算、装备、独立释放及资源路径。这组配置为 1,692–2,562 三角、4–6 个材质组；复杂组合的预算上限仍为 7 组。
- 模型预热 83、程序完成 58、贴图生命周期 96 项通过；笑魇、猎犬和钝人回归通过（钝人 351 项）。笑魇测试的旧地图夹具补齐了 `inf.chunks`，未改生产逻辑或断言。
- 实际 Engine/Renderer：17 项检查，覆盖餐馆 NPC 的骨骼驱动、四位专属人物、配饰、无面灵、冷加载像素、共享贴图、重复回收和两种光影。
- 实际 React 形象编辑组件：24 项检查，覆盖冷头像刷新、新胡须选项、10 次变更的保存、预览上下文稳定。
- 正式主菜单“形象编辑”入口也已打开验证，8 个选择器、新胡须选项与模型预览正常，见 `bootstrap.json`；浏览器错误记录为空。
- 生产构建通过。仍有项目已有的大包、字体/CSS、动态与静态导入混用等构建警告，详见 `build.txt`。
- 最终运行检查无浏览器 console/runtime 错误，见 `browser-errors.json`。

## 视觉复现

独立 Vite 端口 3010、CDP 端口 9241、浏览器 profile `app/.cache/retro-avatar-qa`。Chrome 必须使用 `--headless=new --enable-automation`；脚本核对实际启动参数与 profile。不能连接日常浏览器。

```powershell
$env:L0_VERIFY='1'
npm run dev -- --host 127.0.0.1 --port 3010 --strictPort
# 另行启动独立 Chrome，使用上述 profile、CDP 端口和真正的 headless 参数
npm run verify:retro-avatar
node scripts/verify-retro-avatar.mjs bootstrap
node scripts/verify-retro-avatar.mjs cleanup
# 结束本次 QA 的 Vite 服务；只终止与记录的 PID/完整命令行一致的进程
```

游戏检查使用独立内存存储，不覆盖玩家存档。Tom 场景为据点 104、种子 20261006、1920×1080/DPR1、FOV60、玩家位置 (29.1,26.4,0)，完整参数见 `camera-*.json`。

- `game-tom-realistic.png`、`game-tom-classic.png`：实际游戏中的人物、服装和受光。
- `models-compare.png`：原方块模型与导入模型逐人对照。
- `models-close.png`：四位专属人物的面部、发型和领口。
- `models-hair-row-*.png`、`models-beards-close-1.png`：发型及胡须。
- `models-player-part-equip.png`：头灯/防护服/手套/潜水面罩/夜视装备。
- `models-named-ids-joey-walk-1.png`：原有配饰与步态挂点。
- `avatar-ui.png`、`main-avatar-editor.png`：编辑器与正式主菜单入口。

模型展示页使用 `live=1`，检查 GPU 蒙皮而非 CPU 烘焙替身。以上截图已打开检查。

## 性能与边界

本机 NVIDIA RTX 4060 Laptop，Chrome ANGLE/D3D11，1080p。餐馆固定近景、经典光影、预热后五轮（每轮至少 180 帧/1.2 秒）：

| 指标 | 五轮结果 |
|---|---|
| 帧间隔中位数 / P95 | 4.2 / 4.3 ms |
| CPU 中位数 | 1.1–1.3 ms |
| GPU 中位数 / P95 | 3.76–3.95 / 4.34–5.56 ms |
| 场景绘制 / 三角 | 85 / 32,961 |

数据只代表该固定场景，无导入前整场性能对照，不作为 Android 真机结论。四轮各创建/回收 12 人后，几何稳定为 144、纹理稳定为 102（第一轮尚有闭眼贴图首次上传），详见 `runtime.json`。

包内仍记录了长风衣在较大步幅下可能与腿相交、中长发侧面有发片感、胡须上沿有低模阶梯等外观限制；本轮保留其建模风格。没有宣称穷举所有服装组合与极端动作，也未测试 Android 真机或重新生成全部纹理。
