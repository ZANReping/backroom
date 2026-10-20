# Poolface v82 验收

来源、合并方式和重现命令见 [接入说明](../../POOLFACE-V82.md)。本轮仅合入 120 张池脸贴图、四处文本增量及材质缓存键修正，保留当前固定人物对齐和 UI。

- [男性中肤色：之前](before/pool-0-2.png)／[之后](after/pool-0-2.png)
- [女性浅肤色：之前](before/pool-1-0.png)／[之后](after/pool-1-0.png)
- [金发：之前](before/blonde.png)／[之后](after/blonde.png)
- [光头：之前](before/bald.png)／[之后](after/bald.png)
- [眨眼](after/blink.png)、[实际游戏中的随机人物](../holster/desktop/poolfaces-in-game.png)

已人工检查发际线轮廓、原照片头发残留、皮肤修补、金发／深发／光头过渡与闭眼。新贴图消除了旧版本明显下探到眉眼附近的方块状发区，仍保留人物原有的复古多边形风格。

画廊分别读取旧代码／旧贴图及新代码／新贴图，以同一相机和灯光逐组显示男女、五档肤色、每档三种身份。两次运行各 **122 项**通过；重建后的 GPU 资源均稳定为 3 个几何、39 张已上传贴图、4 个程序。这是画廊的资源计数，不是全游戏性能测量。

自动回归通过：`check:retro-avatar` **2,441**、`check:npc-face-alignment` **549**（91 名固定 NPC）、`check:avatar-framing` **264**、`check:shrimp` **57**。实际游戏验证随机 NPC 正确读取 `/pool/` 贴图与 v82 发区材质。

1920×1080、像素比 1，画廊 yaw 0.22、FOV 28，固定半身相机 `(0,1.60,1.12)` 指向 `(0,1.57,0)`。游戏场景为种子 `20261006`、Tom 餐馆（104），截图及运行参数保存在对应 JSON。前后全目录含 13 张图，`source/` 则是包内原预览，不属于本地验收。

原始数据：[导入贴图哈希](assets.json)、[文本增量](text-import.json)、[之前](before/result.json)、[之后](after/result.json)。生产构建日志见 [build.log](../holster/build.log)；字体路径、PostCSS 和大代码块提示仍是现有构建提示。浏览器均为独立配置的真正无头 Chrome，结束后清理所属进程及临时用户目录。

[最终文件清单](final-manifest.json) 记录合入后的哈希；[保留检查](preservation.json) 确认 120 张贴图与附件输出完全一致，固定人物面部校准、形象编辑及人士预览相关文件保持本轮修改前的内容。
