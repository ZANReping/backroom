# 实体子变种、开发者召唤布局与飞行（2026-10-15）

## 实现与使用

统一注册表 `src/game/entities/forms.ts` 同时供实体工厂、图鉴和开发者面板使用。保留父实体 ID、图鉴解锁条件及自然生成规则，显式选择的子变种不再被当前层级的自动形态覆盖。冻结 AI 时也立即初始化模型需要的状态。

| 父实体 | 数量 | 子变种 / 初始状态 |
| --- | ---: | --- |
| 死亡飞蛾 | 4 | 原有雄性、雌性、护卫、幼虫 |
| 笑魇 | 5 | 原有普通、饥饿、巨笑魇、犬形、幻影 |
| 猎犬 | 3 | 普通、中立、高智能伏击 |
| 钝人 | 2 | 空手、携物 |
| 无面灵 | 3 | 普通、错位五官、持械 |
| 窃皮者 | 3 | 人皮伪装、温顺真身、饥饿真身 |
| 肢团 | 7 | 普通、绝食、高智能、高智能绝食、砖块、石块、滋水枪 |
| 悲尸 | 4 | 蹒跚、疾行、有智、突变 |
| 尸鼠 | 5 | 深褐、灰白、旅馆、水豚、罗特尼斯洞顶形态 |
| 蛛形纲 | 5 | 蜘蛛、蝎、蜱、螨、食草 |
| 合计 | **41** | **10 类父实体**，包括此前已有的飞蛾和笑魇 |

携物、绝食、伪装与饥饿阶段标为“初始状态”，后续仍受原 AI 控制，不会每帧强制重置。肢团战斗中产生的骨武器仍由原机制处理。悲尸形态、属性和模型共用纯定义，保留自然随机种子的结果。飞行实体召唤后立即取得当前楼层的飞行高度，避免冻结 AI 时贴地；洞顶尸鼠也可在有真实天花板的室内观察。

开发者面板 → 召唤 → 实体：支持名称 / 英文父 ID / 子变种名称搜索、自然生成层级筛选。每类实体使用同一张卡片选择形态并召唤，保留筛选前的选择，显示当前形态说明和生成结果。图鉴在原行为信息解锁条件下显示相同的子变种。

开发者面板 → 世界 → 飞行：按住绑定的跳跃键垂直上升，按住蹲下键垂直下降，松开悬停；水平移动照常。不开穿墙时保留玩家半径及站立高度碰撞，包括薄墙、家具、地面、楼板和天花板。开启穿墙后才绕过这些碰撞。关闭飞行恢复重力，关闭开发者模式同时关闭飞行。触控蹲下按钮在飞行中改为按住下降、松开或取消停止。

## 自动检查

以下命令在 `app` 目录执行：

```powershell
npm run check:entity-forms
npm run check:dev-flight
npm run check:wretches
npm run check:wretch-mesh
npm run check:hounds
npm run check:dullers
npm run check:skinstealers
npm run check:clumps
npx esbuild scripts/check-l4-collisions.ts --bundle --platform=node --format=esm --outfile=.cache/check-l4-collisions.mjs
node .cache/check-l4-collisions.mjs
npm run check:l11-collision
npm run verify:dev-tools
npm run verify:dev-tools -- --followup
npm run verify:dev-tools -- --flight-only
npm run build -- --outDir .cache/dev-forms-flight/production
```

- 子变种注册 / 属性 / AI 初始状态：**233 项通过**。
- 飞行体积、薄墙滑动、楼板与开放挑空、穿墙、固定步长：**19 项通过**。
- 悲尸、猎犬、钝人、窃皮者、肢团原有相关检查通过。
- Level 4 原有碰撞：**418 项通过**；Level 11：**106 个碰撞体定义及旋转 / 斜面 / 玻璃检查通过**。
- 最终 TypeScript 与生产构建通过，Vite 构建阶段 **16.54 秒**，见 [build.log](build.log)。现有字体路径、Browserslist、PostCSS、混合静态 / 动态导入和大包警告仍在。

## 实际游戏与截图

使用真实游戏 Engine、Renderer、HUD、TouchControls，在独立验证入口运行。固定种子 **20261006**，场景 **104 / Tom 的餐馆**，真实光影，桌面 **1920×1080**。逐形态截图的玩家位置、朝向、FOV、召唤结果与资源数记录在 JSON 的 `variants` 中。脚本自动使用空闲服务端口、独立浏览器调试端口与临时 profile，并检查 Chrome 实际命令行含 `--headless=new`。

- [首轮记录](runtime-initial.json)：**41 个形态均通过实际面板召唤及模型 / AI 对应检查**。该轮整体结果为失败，因为资源检查不断生成新人物外观，触发共享脸部与服装贴图缓存增长，不能据此认定实例泄漏。
- [最终形态 / 回收记录](runtime.json)：修正飞蛾初始高度与室内洞顶尸鼠后，针对四种飞蛾和洞顶尸鼠复验通过；改为反复重建同一组外观，四轮释放后的资源数均为 **145 几何 / 109 纹理**。未出现运行时或控制台错误。
- [最终飞行 / 窄屏记录](flight/runtime.json)：实际场景的十项升降、悬停、碰撞、穿墙、恢复重力与开发者开关检查通过；CDP 键盘按住上升、释放悬停、按住下降通过。飞行站立碰撞高 **1.7 米**，包含相机近裁剪面所需头部余量。
- 实际 **390×844 CSS 像素**的窄屏 UI 无卡片横向溢出，触控按住下降与取消释放通过。此前根目录 `mobile-spawn.png` 是 Chrome 缩放后的宽布局，最终窄屏证据使用下方 `flight/` 版本。

| 内容 | 截图 |
| --- | --- |
| 子变种选择与悲尸突变型 | [wretch-mutant.png](wretch-mutant.png) |
| 携物钝人 | [duller-carrying.png](duller-carrying.png) |
| 持械无面灵 | [faceling-tool.png](faceling-tool.png) |
| 肢团滋水枪 | [clump-squirt.png](clump-squirt.png) |
| 室内洞顶尸鼠 | [corpserat-ceiling.png](corpserat-ceiling.png) |
| 世界飞行开关、顶面下悬停 | [world-flight-active.png](flight/world-flight-active.png) |
| 窄屏召唤面板 | [mobile-spawn.png](flight/mobile-spawn.png) |

截图已目视检查实体形态、面板排列、顶面遮挡与窄屏溢出。其余逐形态截图保存在本目录。原始失败记录保留；最终运行无脚本错误，网络记录仅有验证入口的 `favicon.ico` 404。各轮浏览器和服务均已关闭，独立 profile 已删除。

## 范围与限制

本轮没有改写实体美术资源与自然出现概率。资源稳定性结论针对相同外观的实例回收，不把首次共享贴图预热计为泄漏。飞行已有有限层、多楼层、地形与洞穴的碰撞处理，但实际浏览器检查集中于固定室内场景，未逐层人工验证全部洞穴、电梯、楼梯和水下组合。390 像素检查为桌面触控模拟，不代表 Android 真机测试。没有新增联机开发或测试；联机继续封闭，`app-lite` 不变。
