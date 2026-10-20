# NPC 面部贴图 v6 验收

2026-10-17。最终运行记录为 [after-final/result.json](after-final/result.json)，`ok: true`。`after/` 保存了首次验证器在任意时间点断言“眨眼已结束”的失败记录；最终版按实际闭眼时刻检查恢复，未因此改动贴图或游戏动画周期。

[前后对照](comparison.html) · [接入说明](../../NPC-FACES-V6.md) · [来源记录](../../public/textures/npc-retro/NAMED-FACES-SOURCES.md)

## 验证

| 项目 | 结果 |
|---|---|
| 资产导入 | 393 文件，SHA-256 与原包逐文件一致；182 张专属 PNG、120 张池脸 PNG、91 张源 WEBP |
| `check:retro-named-faces` | 1,248 项通过，91 人缺图 0、重复内容 0 |
| `check:retro-avatar` | 2,441 项通过，110 个原人物配置 |
| `check:npc-gear` | 30,377 项通过，114 个配饰配置 |
| `check-npc-material-keys` | 27 项通过 |
| `npm run build` | 通过；日志见 [build.log](build.log)，已有字体路径、PostCSS 和大包体提示保留 |
| 无头浏览器 | 197 项通过；91 张命名脸、95 个预览、4 个静态头像、眨眼与回退路径 |
| 实际游戏 | Alpha 夜莺确认使用 `named/nightingale/`；经典和真实光影通过，无着色器错误或贴图请求失败 |

所有人物贴图仍为 128²、nearest 采样、无 mipmap；模型几何和材质组数量不变。头饰、眼镜、口罩和耳机仍使用此前的贴合模型。

已保存全部 12 张目录图，并重点复查近景、红／金／灰发和光头、闭眼、配饰及实际游戏截图。**已知源图问题：**部分合成闭眼图仍有睁眼残影，例如莱恩。测试通过表示贴图完整、加载和动画切换正确，不表示源包闭眼图没有美术问题；原图本轮按包完整保留。参见 [blink.png](after-final/blink.png) 和包内 `named/lan/neutral-blink.png`。

## 固定场景性能

Windows／Chrome `--headless=new`／RTX 4060 Laptop（ANGLE D3D11），1920×1080、像素比 1、种子 `20261006`，Alpha 夜莺近景、FOV 48、距 NPC 1.5 米。预热后每种模式五轮，每轮至少 100 帧及 1.2 秒。以下中位数为五轮中位，P95 为最差一轮。

| 模式 | 帧间隔中位（前 → 后） | 帧间隔 P95（前 → 后） | GPU 中位（前 → 后） | 实际绘制调用 | 三角面 |
|---|---:|---:|---:|---:|---:|
| 真实 | 4.20 → 4.20 ms | 4.30 → 4.30 ms | 4.10 → 3.95 ms | 212 → 212 | 216,549 → 216,549 |
| 经典 | 4.20 → 4.20 ms | 4.30 → 4.30 ms | 3.40 → 3.68 ms | 198 → 198 | 216,535 → 216,535 |

变化在固定场景采样范围内，未增加绘制调用或三角面。专属脸增加共享纹理的种类，按实际使用的身份加载和缓存；这里没有把短时近景结果推断为所有 NPC 同时出现或 Android 真机结论。原始 `samples` 保留 CPU、GPU 和帧间隔分别测量的数据。

## 复现与进程

`npm run verify:npc-faces -- review` 会在 `reports/npc-faces-v6/review/` 保存图片、控制台和网络记录。固定相机与人物集合见 `verifier/npc-faces.ts`，实际游戏取景见 `scripts/verify-npc-faces.mjs`。生成画廊使用 `node scripts/summarize-npc-faces.mjs review`。修改前 `before/` 为留存基线，当前代码不能直接重建旧贴图。

前后运行各使用独占服务器、调试端口及临时 profile，均已退出并删除 profile。记录中的唯一 404 是无关的 `favicon.ico`；没有贴图 404。没有访问日常浏览器或玩家存档。
