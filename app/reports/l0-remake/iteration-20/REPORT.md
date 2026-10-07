# 第 20 轮：视野预览遮挡、荧光棒、柔边出口与文档动画

2026-10-07。修改限定 app 与根说明，保留已有工作区改动。

## 改动与根因

- 大地图、小地图与 Alpha 导览的浅色视野区域共用开图射线的实际终点，遇整格墙、薄墙和关闭的门截断。遮挡按玩家楼层和眼高查询，低矮家具不会遮住站立视线。查询本身不改写探索进度；地图全开仍不能使预览穿墙。缓存包含位置、朝向、眼高、楼层、FOV、距离及地图修订，静止时最多缓存 80ms；小地图每秒最多八次检查静止时的门状态。
- 荧光棒失效根因是点光池索引不等于 Three.js 的着色器点光索引：打火机占一个位置，阴影灯还会提前排序。经典模式实测：池位置 0 的绿光在实际着色器位置 1，被值为 1 的静态灯掩码屏蔽。现按场景实际可见点光和阴影顺序生成掩码，荧光棒、打火机等实时光源保留，顶灯避免重复受光。灯池容量不增加。
- 闪烁出口恢复约 1.04×2.04m 的亮色矩形，边缘约 20cm 连续羽化，四角圆滑过渡。亮区直接写在实体墙材质中，保留墙纸细节、原交互和周围有遮挡的受光闪烁，不添加贴片、灯或绘制批次。
- 基金会欢迎信接入现有 `slideUp` 动画：0.28 秒透明度渐入并从下方 24px 回到正常位置。

## 验证

- `npm run check:l0-visibility`：薄墙精确终点、墙后透明像素、查询不探索、开门、其它楼层、低矮结构、最近碰撞、整格墙；24 组灯池/阴影/荧光棒位置排列和隐藏/嵌套光源通过。见 [visibility.json](visibility.json)。
- `npm run check:l0-experience`：100 种子首访补给、视野距离、曝光、预设、实际投掷/回收及存档回归通过，结果写入本目录 [experience.json](experience.json)。
- Chrome/ANGLE、RTX 4060 Laptop、1280×720，经典 8 灯无阴影、真实 8 灯无阴影、真实 16 灯两盏阴影：均通过实际投掷、绿色环境受光、瞄准拾取、拾取后撤销光源。绿色受光变化的地面像素分别为 269442 / 277570 / 276769，远大于物品本身；见 [runtime-visibility.json](runtime-visibility.json)。
- 出口明灭截图确认柔边矩形和地板反光变化；原地图预览未增减物品、实体、区块或探索记录，见 [after-refinements.json](after-refinements.json)。
- 原版 Level 0 地图的拖动、缩放、右键传送、首次尺寸、全开、薄墙与区域图例检查通过，见 [controls.json](controls.json)。设置与文件 UI 11 项检查通过，实际动画采样为 opacity 0 → 0.519 → 1、位移 24 → 11.544 → 0px，见 [experience-ui.json](experience-ui.json)。
- 最终 `npm run build` 通过；日志保留现有字体、Browserslist/PostCSS 和大包提示，见 [build.log](build.log)。

本轮 Node 未缓存的 120×120/60m 薄墙查询中位数 0.294ms、P95 0.480ms。浏览器图片检查中的 `stats` 不是五轮 GPU 性能测试，不据此宣称全层级性能验收。移动截图仅为桌面触控模拟。

扩展检查已绘制 Level 1 和 Level 4 地图，但直接加载 Alpha 时等待附近场景超过 120 秒；重试据点入口又受地图暂停与过场状态阻挡。因此 Alpha 完整场景加载/地图验收未完成，不能视作通过。原始记录为 [controls-initial.json](controls-initial.json)、[controls-alpha-route.json](controls-alpha-route.json)。未为绕过检查而修改据点加载逻辑。

## 截图与复现

- [柔边出口点亮](after-wall-exit-on.png) / [熄灭](after-wall-exit-off.png)
- [经典熄灯区荧光棒](classic-8-0-glow.png) / [无荧光棒](classic-8-0-dark.png)
- [真实光影荧光棒](realistic-16-2-glow.png)
- [实际大地图](original-map.png) / [拱门小地图](arch-minimap.png)
- [文档](foundation-letter.png) / [手机尺寸](foundation-letter-mobile.png)
- [遮挡绘制单元检查输出](map-clipped-fan.png)（透明画布，不是游戏截图）

在 app 目录运行 `npm run check:l0-visibility`；其它回归通过 `QA_OUT=reports/l0-remake/iteration-20` 指定报告目录。启动 `L0_VERIFY=1` 的 Vite 3004 端口，用独立 Chrome profile、CDP 9235 打开 `/verifier/l0-remake.html`。依次运行 `node scripts/verify-l0-visibility.mjs`、设置 `QA_TAG=iteration-20` 后运行 `node scripts/verify-l0-remake.mjs after refinements`、`node scripts/verify-l0-experience.mjs`、`node scripts/verify-l0-controls.mjs`（默认只做当前 Level 0 控件验收）。测试期间避免改动源码触发 HMR。所有 UI 测试使用独立浏览器存储，不覆盖玩家进度。
