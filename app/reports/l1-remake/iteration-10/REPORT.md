# Level 1 第十轮：对照镜头与积水反射

承接[第九轮十八组机位校准](../iteration-9/REPORT.md)，本轮集中检查普通天鹰、水洼天鹰和明亮天鹰。实际相机、FOV、画幅见 `final/actual-cameras.json`；未经图像配准的并排与叠加见 `comparison/`。三个视点的七个已标注点仍在 3% 内，不能代表全部轮廓或材质已还原。

## 修改

- 原反射以 15Hz 更新，改变画幅/FOV 后第一帧可能沿用旧投影。现在镜头投影改变时立即更新；普通移动仍保持原刷新上限。`final/water-projection.json` 覆盖横屏、竖屏和 55°/70° FOV，四次切换均在同一帧匹配镜头。
- 去除反射的额外深绿色衰减，采用中性反射和水面 Fresnel 权重，仍共用一张 512² 反射目标。首次检查暴露重复的圆形点光高光，原截图和数据保存在 `before-highlight-fix/`。修正后地面承担原生烘焙受光，水面显示实际灯管倒影，便携光源继续实时计算。
- 根据记录的普通天鹰相机，将参考图水洼位置反投影到真实地面，调整左侧水洼与两条细流，保留干燥通行带。计算记录在 `floor-calibration.json`；几何、湿地脚步和反射读取同一份世界数据。普通种子的水洼分布规则不变。
- 更新普通天鹰九份离线区块，并校验全部 162 份离线数据指纹。生成版本仍为 4，烘焙修订仍为 11；不改变存档格式和物品身份。
- 沿用[已记录来源的材质](../../../public/textures/l1/SOURCES.md)，没有新增位图素材或照片背景。

## 验证与限制

生产构建通过（`build.log`，Vite 16.38s），保留原有字体、PostCSS 和包大小提示。80 组连通布局、33 组布局及加载顺序/净空/旧掉落/UV/湿区接缝检查通过，见 `static-refinements.log`。162 份离线文件校验通过，见 `offline-check.json`。

独占 Chrome `--headless=new`、profile 和 CDP 9264 完成三组真实参考、三组经典模式和四次镜头切换。14 项实际照明/迁移检查通过，包括停电关闭原生光、手电与绿色荧光棒有效、供电变化不重建区块及迁移幂等。`final/result-*.json` 的运行异常和控制台错误均为 0。已经人工检查三组对照及经典/停电光源截图。

RTX 4060 Laptop、1920×1080，三个湿区各五轮稳态中位数 4.2ms、P95 4.3ms；切区构建最高 RAF 358.5ms，见 [性能表](PERFORMANCE.md)。本轮没有重测全层持续移动与四轮回收；第九轮移动最大 221ms、切区最大 416.5ms 的限制继续保留，不宣称长帧已解决或 Android 真机通过。`git diff --check` 返回工作树不可用，未修改 Git 配置。

仍未相似：普通天鹰顶面桥架过粗、远景墙柱与物资位置；水洼天鹰左侧柱网、围挡及湿区轮廓；明亮天鹰后墙开口、顶灯和悬线。水面边缘与粗糙度也需细化。其它十五组的哥特灯位、衔尾陈设、花园植被等差异继续见第九轮报告。本轮局部检查不代表十八组全部通过。

## 复现

在 `app` 目录启动独占服务：

```powershell
$env:L0_VERIFY='1'
npx vite --host 127.0.0.1 --port 3013 --strictPort
```

另一终端执行，脚本自行启动并关闭独占无头浏览器：

```powershell
$env:L1_QA_URL='http://127.0.0.1:3013'
$env:L1_QA_CDP='9264'
$env:L1_QA_REPORT='iteration-10/final'
$env:L1_QA_ANCHORS='parking-common,parking-water,parking-bright'
node scripts/verify-l1-detail-runtime.mjs reference
node scripts/verify-l1-detail-runtime.mjs classic
node scripts/verify-l1-detail-runtime.mjs v4
node scripts/verify-l1-detail-runtime.mjs water-inspect
node scripts/verify-l1-detail-runtime.mjs performance
$env:L1_QA_ITERATION='iteration-10'
npx esbuild scripts/export-l1-v4-references.ts --bundle --platform=node --format=esm --outfile=.cache/export-l1-v4-references.mjs
node .cache/export-l1-v4-references.mjs
node scripts/compare-l1-v4.mjs
node scripts/summarize-l1-v4.mjs
npm run check:l1-refinements
npm run build
```

联机保持冻结，修改限定于 `app` 与项目说明；据点内部、`app-lite` 和其它工作区改动保留。验证结束后已核对并关闭本任务 Vite 3013；独占无头浏览器均由脚本退出，归属与端口清理结果见 `cleanup.json`。
