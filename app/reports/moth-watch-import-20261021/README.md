# 死亡飞蛾与 L9 实体接入验收（2026-10-21）

完成死亡飞蛾四形态及主巢／卫星巢、观察者（用户所称守望者）、挺进者、残缺者的单人游戏接入。实现说明见 [MOTH-WATCH-IMPORT.md](../../MOTH-WATCH-IMPORT.md)，原始包与许可记录见 [来源说明](../../assets/sources/moth-watch-20261021/README.md)。原项目为 `E:\ZAN\backroom`；未同步 GitHub 副本。

## 验证环境与结论

Windows、Chrome `--headless=new`、1920×1080、原生分辨率、贴图质量 2、种子 `20261006`；真实和经典光影分别运行。GPU 为 NVIDIA GeForce RTX 4060 Laptop GPU / ANGLE D3D11，未使用软件光栅或 CPU 蒙皮替身；WebGL contextLost 均为 false。验收使用真实 App、Engine、渲染器、物品使用和流式生成，隔离存储不读写玩家存档。

- [真实模式完整游戏记录](realistic-v3/result.json)及[经典模式完整游戏记录](classic-v1/result.json)各通过 1787 项检查；包含光束蓄力／实际伤害、抓取及通过实际移动输入挣脱、空中雄蛾喂食和恰好消耗一瓶杏仁水。
- [真实模式细节记录](realistic-details/result.json)及[经典模式细节记录](classic-details/result.json)各通过 12 项检查，生成七种实际图鉴预览，并补充六种模型／UV 近景；均使用原生 GPU 蒙皮。
- 四个接受记录均为 `ok:true`、运行错误 0、失败资源请求 0。主巢由真实 Level 5 生成器确定，区块 `-2,-3`、世界坐标 `(-60,-100)`，进入室内后实际呈现 9 个实例化卵／骨骼对象。
- 六轮同时生成、移除七种模型后，真实模式空场资源始终为 2145 几何／222 贴图／88 程序，经典模式为 2078／146／86。资源保留包含流式世界、模型缓存与共享贴图，不要求空场归零。模型工厂独立释放、LOD 往返、取消预热和释放后剩余实例可用另有专项检查。

模型展示画面使用显式开发者固定照明以检查结构；光束、巢穴和手电画面使用相应实际效果。原型近景只作为纹理与骨架补充，实际游戏截图及机制检查仍由游戏验收入口产生。

## 截图

| 内容 | 真实光影 | 经典光影 |
| --- | --- | --- |
| 观察者／守望者 | [实际游戏](realistic-v3/watcher.png) | [实际游戏](classic-v1/watcher.png) |
| 蓄力光束 | [实际游戏](realistic-v3/watcher-beam.png) | [实际游戏](classic-v1/watcher-beam.png) |
| 挺进者 | [实际游戏](realistic-v3/strider.png) | [实际游戏](classic-v1/strider.png) |
| 残缺者近／远景 | [近景](realistic-v3/mangled.png)、[远景](realistic-v3/mangled-wide.png) | [近景](classic-v1/mangled.png)、[远景](classic-v1/mangled-wide.png) |
| 雄性／雌性飞蛾 | [雄性](realistic-v3/moth-male.png)、[雌性](realistic-v3/moth-female.png) | [雄性](classic-v1/moth-male.png)、[雌性](classic-v1/moth-female.png) |
| 兵蛾／幼虫 | [兵蛾](realistic-v3/moth-guard.png)、[幼虫](realistic-v3/moth-larva.png) | [兵蛾](classic-v1/moth-guard.png)、[幼虫](classic-v1/moth-larva.png) |
| Level 5 主巢室内 | [手电照明](realistic-details/level5-nest.png) | [手电照明](classic-details/level5-nest.png) |
| 翅面 UV | [近景](realistic-details/asset-deathmoth-top.png) | [近景](classic-details/asset-deathmoth-top.png) |
| 眼球／兵蛾细节 | [观察者](realistic-details/asset-watch-eye.png)、[兵蛾](realistic-details/asset-deathmoth-guardhead.png) | [观察者](classic-details/asset-watch-eye.png)、[兵蛾](classic-details/asset-deathmoth-guardhead.png) |
| 实际图鉴服务生成 | [雄蛾](realistic-details/portrait-male.png)、[残缺者](realistic-details/portrait-mangled.png) | [雄蛾](classic-details/portrait-male.png)、[残缺者](classic-details/portrait-mangled.png) |

检查可见的翅面花纹、眼球虹膜与血管、骨骼蒙皮、兵蛾口器／触角、残缺者多部位／烟雾以及巢内实例化物件；未发现缺失主体、贴图镜像或非有限蒙皮坐标。

## 自动检查与生产构建

| `check:deathmoth` | 通过 | [日志](deathmoth.log) |
| `check:deathmoth-anim` | 通过 | [日志](deathmoth-anim.log) |
| `check:watch` | 通过 | [日志](watch.log) |
| `check:moth-watch-resources` | 通过 | [日志](moth-watch-resources.log) |
| `check:entity-forms` | 通过 | [日志](entity-forms.log) |
| `check:model-warmup` | 通过 | [日志](model-warmup.log) |
| `check:program-completion` | 通过 | [日志](program-completion.log) |
| `check:entity-preparation` | 通过 | [日志](entity-preparation.log) |
| `check:shrimp` | 通过 | [日志](shrimp.log) |
| `check:shrimp-item-cache` | 通过 | [日志](shrimp-item-cache.log) |
| `check:nguithr` | 通过 | [日志](nguithr.log) |
| `check:nguithr-anim` | 通过 | [日志](nguithr-anim.log) |
| `check:arms-integration` | 通过 | [日志](arms-integration.log) |

新增资源专项共 5,048,917 次标量／属性检查，覆盖两种材质模式、七种形态、UV／有限数值／蒙皮权重、实例所有权、共享贴图、预热取消与 LOD 复用。这是属性检查次数，不代表同等数量的独立场景。死亡飞蛾行为 33/33、动画 77/77，L9 行为 39/39。其他检查覆盖实体子形态、模型预热、GPU 程序完成、旱虾物品缓存、Nguithr 与手臂既有功能。

最终 [生产构建日志](build.log)通过；保留 Vite 关于大于 500 kB 分块的提示。汇总数据见 [summary.json](summary.json)，命令退出状态见 [regressions.json](regressions.json)。

## 进入时间与帧时间

| 接受记录 | L9 继续游戏进入／秒 | L5 切层进入／秒 | 验收页面启动／秒 | 页面导航至首次可玩／秒 |
| --- | ---: | ---: | ---: | ---: |
| realistic-v3 | 4.14 | 6.76 | 10.92 | 22.32 |
| classic-v1 | 2.84 | 4.20 | 11.65 | 19.32 |
| realistic-details | 3.19 | 7.62 | 16.28 | 27.03 |
| classic-details | 2.95 | 4.74 | 12.15 | 20.13 |

L9 进入时间从继续存档操作到加载界面消失，L5 从切层到加载就绪；均不含浏览器／开发服务器启动。页面启动先生成隔离验收存档并动态导入 App，最后一列还包含验收轮询及菜单步骤，因此不能将“层级进入在十秒以内”说成“从冷启动网页到可玩在十秒以内”。巢穴记录中的 `totalWithNestTeleportMs` 另外包含查找、远程流式加载、门交互与截图等待，不是层级进入耗时。以上是本机本次运行结果，未覆盖所有层级或 Android。

固定 L9 残缺者场景预热后采样五轮；指标为真实 Chrome requestAnimationFrame 帧间隔，不是 GPU timer。开发者固定照明、关闭动态分辨率及动态曝光。绘制统计每帧在 Renderer3D 入口清零，包含全世界、阴影、后处理，而非单个实体；阴影更新导致各帧批次变化。

| 模式 | 轮次 | 中位／ms | P95／ms | 整帧绘制调用中位（最小–最大） | 三角面中位 |
| --- | ---: | ---: | ---: | --- | ---: |
| 真实 | 1 | 13.90 | 18.50 | 2788（1562–3071） | 1977969 |
| 真实 | 2 | 13.70 | 18.60 | 2787（1561–2949） | 1977921 |
| 真实 | 3 | 13.30 | 17.30 | 2787（1561–3070） | 1977921 |
| 真实 | 4 | 13.30 | 18.40 | 2788（1562–3071） | 1977969 |
| 真实 | 5 | 14.30 | 18.40 | 2787（1561–3069） | 1977921 |
| 经典 | 1 | 7.80 | 14.30 | 747（747–2255） | 410653 |
| 经典 | 2 | 7.50 | 13.80 | 748（747–2257） | 410701 |
| 经典 | 3 | 7.50 | 13.50 | 748（748–2135） | 410701 |
| 经典 | 4 | 7.20 | 12.80 | 748（747–2255） | 410701 |
| 经典 | 5 | 6.80 | 11.90 | 747（747–2134） | 410653 |

本场景真实模式五轮中位 13.3–14.3 ms、P95 17.3–18.6 ms，经典模式中位 6.8–7.8 ms、P95 11.9–14.3 ms；全部满足本次代表场景的 16.7／20 ms 目标。没有同场景改造前的计时基线，不据此声称百分比提升或所有场景都达到目标。测量结束资源为真实 2150／223／88、经典 2083／147／86（几何／贴图／程序），含重新显示的测量实体。

## 复现

在 `E:\ZAN\backroom\app` 执行：

```powershell
npm run check:deathmoth
npm run check:deathmoth-anim
npm run check:watch
npm run check:moth-watch-resources
npm run build
node scripts/verify-moth-watch-import.mjs --label=realistic-repeat
node scripts/verify-moth-watch-import.mjs --classic --label=classic-repeat
node scripts/verify-moth-watch-import.mjs --details-only --label=realistic-detail-repeat
node scripts/verify-moth-watch-import.mjs --classic --details-only --label=classic-detail-repeat
```

可用 `CHROME_PATH` 指向本机 Chrome；原生 GPU 不可用时脚本明确失败，不回退为软件结果。每次使用新的 label 保留旧记录。驱动自动分配专属服务器／CDP 端口和浏览器配置目录，校验实际启动参数；所有接受记录的浏览器、服务器均已结束，临时 profile 均已移除，PID／端口及清理状态保存在各目录 `session.json`／`result.json`。最终进程核验见 [cleanup.json](cleanup.json)。

尚未额外实现上游预留 swimmer、全局寻路或新增完整配音库；跟随沿用现有移动，熟人声音沿用通用耳语及文本。未更改多人冻结状态或主存档版本。上游包内历史 CPU 替身截图与旧验收不作为本地通过证据。
