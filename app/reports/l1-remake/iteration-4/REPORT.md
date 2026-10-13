# Level 1 第四轮：连续材质、构件和停电光照

2026-10-08。范围为 `app` 和根项目说明；保留工作区中的其它模型/UI改动，联机继续冻结。本轮实现了十项细化及“材质不按方格变化”的补充要求；功能检查通过，但性能与精确参考复刻尚未全部通过。

## 实现与证据

| 请求 | 本轮结果 | 证据 |
| --- | --- | --- |
| 光照接近 Level 0 的处理 | 区分原生灯/玩家光源，向下发光响应、近地间接光衰减、两盏软阴影；L1 灯影按质量档错峰更新 | [天鹰](current/reference/parking-common.png)、[跃金](current/reference/storage.png) |
| 柱子装饰变体 | 稳定世界哈希选择护角、局部补漆、附墙管线/夹具、裸面和剥落；哥特柱不叠加第二柱帽 | [衔尾](current/reference/ouroboros.png)、模型测试 |
| 顶面线缆和白管 | 天鹰部分跨间的四道红线、衔尾六道红线及白色回管，连续段合并后按材质合批 | [小房间顶线](current/reference/parking-room.png)、[衔尾](current/reference/ouroboros.png) |
| 整层莫名刷新 | 板条箱低频异常原来递增 `inf.redo`，现在只切换箱子根节点显隐并重拼碰撞索引 | [39 项运行检查](current/runtime.json)中的区块身份、重建号、搜刮不重置检查 |
| 长方体箱与编号 | 约 0.99×0.71×0.68 米箱体，前后数字 00–99 及向上标记，碰撞深度同步 | [板条箱](current/reference/crate.png)、`check:l1-props` |
| 跃金墙顶与色差 | 取消 3.25 米隔墙上限，墙面接到 6.4 米屋顶；色差沿世界连续变化 | [跃金](current/reference/storage.png)、墙顶高度测试 |
| 花园光束 | 最多四束斜向柔边体积光近似，共一个实例绘制批次；经典/低档关闭；原生停电立即消失 | [花园](current/reference/garden.png)、[停电断言](current/power-checks.json) |
| 衔尾粗粝感 | 外墙混入既有剥落图，地面法线/粗糙度和大尺度色差增强调制 | [衔尾](current/reference/ouroboros.png) |
| 小径淡蓝冷色 | 砖墙和侧房粉刷调整冷色，沿用原 CC0 图 | [走廊](current/reference/path-corridor.png)、[侧房](current/reference/path-room.png) |
| 人眼曝光与闪烁 | 预警阶段保持曝光；停电暗适应 3.6 秒时间常数、增益最多 1.35；复电快速回落 | [数值序列](current/power.json)、`check:l1-exposure` |
| 平滑材质与区段过渡 | 2 米采样、16 米支持范围的连续材质场，世界 UV、连续色差与磨损；重定位不改变同一世界位置 | [交界前](current/detail/transition--8.png)、[交界](current/detail/transition-0.png)、[交界后](current/detail/transition-8.png)、[相机参数](current/detail-cameras.json) |

新增材质场复用已有扫描，未添加 AI 生成纹理。数字图集为脚本原创线段，不使用外部字体。来源、作者、许可及处理路径见 [来源记录](../../../L1-REMAKE-SOURCES.md) 和 [贴图记录](../../../public/textures/l1/SOURCES.md)。花园光束参考 [threex.volumetricspotlight](https://github.com/jeromeetienne/threex.volumetricspotlight) 的轻量几何思路，shader 为本项目实现。

## 视觉对照

已检查十八参考视角、六张普通种子/加载边界图、三张经典模式、三张真实区段交界和六张停电曝光序列。参考/游戏并排图：[1](comparison/sheet-1.jpg)、[2](comparison/sheet-2.jpg)、[3](comparison/sheet-3.jpg)；逐图半透明叠加在同目录。另有 [第三轮/本轮六视角对照](comparison/previous-current.jpg)；旧图来自内置浏览器，新图来自无头 Chrome，不能据此声称同环境性能提升。

场景没有以照片背景、假墙或验证专用材质替代真实建筑。普通种子与展示种子共用实现。地面不再因加载区块抽取颜色；交界截图使用种子 7391，天鹰→跃金，世界坐标约 (-752,-752)。相机记录在 `current/*cameras.json`。

仍有明确差异：天鹰部分参考中更复杂的光斑、裸顶细节与柱距尚不一致；衔尾剥落形状仍较规则；花园植被密度、叶片形态及参考的日光分布未精确重合。箱号为通用数字标记，没有复制参考图文字。没有宣称建筑轮廓 3% 误差通过。

## 无头浏览器与运行检查

本轮按用户最新要求使用独立 Chrome 154.0.8037.98，实际启动参数包含 `--headless=new`；使用直接 CDP，不再依赖内置浏览器验证。独立配置目录 `.cache/l1-iteration4-chrome-9249`，调试仅绑定 127.0.0.1:9249，本轮服务器为 3009。每批结束关闭自身浏览器。完整参数及 GPU 信息保存在 `current/environment-*.json`。

- 39 项实际生产引擎检查通过：停电、便携光、读档、箱子显隐/搜刮/碰撞及无整层重建、花园结算、小径门的准星与开关、据点入口、十八相机净空。
- 六项实际停电/曝光断言通过：亮时有光束、暗时无光束、恢复光束、曝光上限、预警冻结、区块身份稳定。曝光采样约 1.279 → 1.283（停电 0.2 秒）→ 1.327（4 秒）→ 1.308（复电 0.1 秒）→ 1.279（1.1 秒）。
- 构建、L1 生成、道具 UV/预算/释放、服务几何、80 组连通布局与 33 组区块布局、材质重定位/过渡、曝光时间常数通过；合批 11,621 项、贴图生命周期 96 项、预热 66 项回归通过。
- 浏览器 JS 异常和 console error 为 0；D3D shader 编译器有浮点精度 warning，原始警告未丢弃。Chrome 更新服务的宿主权限警告保存在 stderr，不是游戏异常。

沙箱最初无法启动 Chrome（Crashpad named pipe 错误），改在宿主环境启动同一专用无头脚本后成功。首个截图批次被其它工作区编辑触发的 Vite HMR 打断，之后启用已有 `L0_VERIFY=1` 关闭热更新并重做全部截图。一次生产构建遇到正在编辑的 `combat.ts` 未使用导入错误，该工作区编辑完成后构建通过；没有为此改动其它功能。上述中断记录保留为 `current/attempt-*.json`。

## 性能及资源

RTX 4060 Laptop / ANGLE D3D11，1920×1080 视口及实际画布，DPR 1，真实模式、高纹理、16 个灯池槽、两盏场景软阴影、固定渲染尺寸、泛光，冻结游戏状态。各场景预热至构建与资源稳定后五轮，每轮至少 120 帧、1.2 秒；记录 RAF、CPU render 和 GPU 查询，三者不可互换。停电曝光序列独立打开人眼曝光；性能测试使用验收页默认曝光设置。

首批天鹰/跃金/衔尾 P95 分别最高 24.8/20.8/20.9ms，记录在 [首批完整数据](current/regions-performance-initial.json)。随后将 L1 周期阴影更新调整为 200/100/50ms，并避免长帧后同帧补刷两组周期阴影；光源/几何失效仍立即刷新。重新测量全部六区，不挑选最好一轮替换失败项。

最终六区全部中位数 ≤12.5ms；哥特、衔尾、花园、小径达到 P95≤20ms，天鹰和跃金最差轮仍 20.9ms，**4/6 达到稳态目标**。冷构建期最大帧间隔达到 1,046ms，尚未达到平滑跨区的要求。详见 [性能表](PERFORMANCE.md) 和 [原始五轮](current/regions-performance.json)。与前三轮内置浏览器不同环境，不给出跨浏览器速度提升百分比。

四轮花园→跃金→哥特→天鹰、经典/真实切换后均为 **506 个几何、68 张纹理、130 个程序**，没有逐轮增长；[资源记录](current/resources.json)。本轮额外构件使驻留几何比第三轮更多，稳定不等于零成本。资源检查在最终阴影频率调整前进行，该调整不分配或释放资源。

尚未验收：长时间自由移动/动态实体的完整帧分布、极快连续跨区、Android 真机、所有相机的量化轮廓误差。固定取景和桌面结果不能替代这些验收。

## 复现

工作目录 `app`。先启动独立服务器，验证结束关闭自己的服务器：

```powershell
$env:L0_VERIFY='1'
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3009 --strictPort
```

另一个终端：

```powershell
npm run check:l1
npm run check:l1-props
npm run check:l1-services
npm run check:l1-refinements
npm run check:l1-detail
npm run check:l1-exposure
npm run check:static-batch-job
npm run check:texture-images
npm run check:model-warmup
npm run build
node scripts/verify-l1-detail-runtime.mjs all
node scripts/verify-l1-remake.mjs iteration-4
node scripts/compare-l1-iteration4.mjs
node scripts/summarize-l1-remake.mjs iteration-4
```

浏览器阶段也可单独运行 `runtime/capture/detail/power/performance/resources`。环境变量 `L1_QA_URL`、`L1_QA_CDP` 和 `L1_QA_CHROME` 可指定本任务独立实例，脚本不会接管已占用调试端口。
