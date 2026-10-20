# 实体分类、尸鼠 v79–v80 与首次出现优化

2026-10-15。本轮在 `app` 增量合并用户提供的 `backroom-rat-v79-v80.zip`，保留既有物品、人物、飞行、层级与工作区改动。联机保持冻结，未修改协议或同步实现；未向 `app-lite` 传播。

## 实现结果

- 肢团仅显示普通／高智能两类；绝食、具体武器仍是个体状态，不再单列子变种。钝人不再显示子变种选择。无面灵仅显示普通／敌意两类，敌意对应 L3 的异常五官与原有持石器概率。父实体 ID 和遇见计数保持原样。
- 图鉴和开发者召唤共用注册表，现有 9 类父实体共 33 个子变种／初始状态。旧参数保留兼容读取，不再出现在选择列表。
- 接入常见、无毛、旅馆、水豚、穴顶五种尸鼠的 v80 模型、毛壳、动画和 v79 行为。接入水豚种音箱气泡、电击陷阱／土制炸弹、L2 尸体装饰、尸鼠肉掉落及食用。
- 尸鼠使用现有经典／真实材质工厂；共享程序纹理与实例几何／材质分别管理。合批后检查最终引用再释放资源，修复临时几何未释放问题；毛壳不投影且 10 米外隐藏。补齐同层装置触发与伤害判断，避免隔层误伤。

## 首次出现处理

所有实体进入相同准备路径：限制每帧创建数量，按真实 HDR 输出目标分批编译，逐张上传共享纹理，分批提交零绘制范围的几何以建立 GPU 缓冲。场景和模型层级、可见性、绘制范围及渲染状态在每一步后恢复；取消后停止后续工作，编译未完成的资源延迟释放。

肢团 SDF 和表面网格、死亡飞蛾纹理分别拆成可取消的 CPU 工作片；尸鼠毛皮／裸皮／毛丝贴图分别准备。模型尚在准备队列时暂停该实体的移动与攻击，避免模型未显现时伤害玩家；近处实体准备纳入加载完成判断。准备并未移走模型细节或替换成简化占位图。

全部 38 种父实体均完成三轮改前／改后对照。表内为三轮峰值的中位数，单位 ms：

| 实体 | 主线程渲染峰值，改前 → 后 | 实际帧间隔峰值，改前 → 后 |
|---|---:|---:|
| 肢团 | 1973.1 → 49.3 | 1973.3 → 65.2 |
| 死亡飞蛾 | 4907.9 → 24.9 | 4908.5 → 301.2 |
| 钝人 | 2334.4 → 38.8 | 2335.1 → 92.3 |
| 猎犬 | 555.3 → 30.2 | 555.9 → 41.4 |
| 笑魇 | 262.4 → 6.2 | 262.7 → 8.4 |
| 悲尸 | 1370.3 → 143.1 | 1374.0 → 143.4 |
| 七层之物 | 4542.6 → 59.2 | 4543.4 → 59.8 |

完整 38 行、显现等待、最坏轮次、环境和原始数据见 [性能对照](performance.md)。新尸鼠含毛壳，不能与旧方块模型作相同内容的性能比较；改后其 CPU 峰值中位数为 25.7ms、帧间隔峰值中位数为 58.2ms。全部改后记录中最坏 CPU 为 198.8ms，最坏帧间隔为 325.7ms；仍有首见长帧，不能称为全部稳定 60 FPS。部分模型等待准备约一秒，测到最长 1.94 秒，这与画面整段冻结不同。

## 实际游戏验证

独立无头 Chrome，启动参数实际包含 `--headless=new`；每次使用独立配置目录和空闲端口。固定种子 `20261006`，L104 据点，1920×1080、DPR 1、原生分辨率。通过真实 HUD 选择和召唤，使用生产 Engine／Renderer；临时存储不覆盖玩家存档。

经典和真实模式各通过 35 项运行断言：分类选项、五种尸鼠从 UI 到 AI／模型一致、普通种不主动伤人、冲刺逃跑、受伤反击与减速、水豚指挥、电击陷阱、炸弹、准备期无移动攻击、掉肉幂等、食用、九区块尸体确定性及四轮模型重建回收。L2 固定样本共 12 具尸体，均不阻挡通路。几何和纹理在每模式的四轮回收中保持稳定，具体数量见各自 JSON。

无浏览器控制台／运行异常；验证入口有一条 `favicon.ico` 404，未发生游戏资源加载失败。创建的 QA 浏览器、服务和专用配置目录均已清理，记录保存在 `cleanup`。

| 内容 | 真实模式截图 | 经典模式截图 |
|---|---|---|
| 开发者召唤 | [面板](rat-runtime-realistic/summon-rat-variants.png) | [面板](rat-runtime-classic/summon-rat-variants.png) |
| 常见种 | [侧面](rat-runtime-realistic/common-side.png) | [侧面](rat-runtime-classic/common-side.png) |
| 无毛种 | [正面](rat-runtime-realistic/hairless-front.png) | [正面](rat-runtime-classic/hairless-front.png) |
| 旅馆种 | [侧面](rat-runtime-realistic/hotel-side.png) | [侧面](rat-runtime-classic/hotel-side.png) |
| 水豚种 | [正面](rat-runtime-realistic/capybara-front.png) | [正面](rat-runtime-classic/capybara-front.png) |
| 穴顶种 | [倒挂](rat-runtime-realistic/cave-side.png) | [倒挂](rat-runtime-classic/cave-side.png) |
| 陷阱／炸弹 | [装置](rat-runtime-realistic/capybara-and-devices.png) | [装置](rat-runtime-classic/capybara-and-devices.png) |

已检查截图中的耳、胡须、牙、服饰、配件、毛壳、裸皮及倒挂方向，并与原包 v80 预览比较；模型保持导入包造型。材质受所在游戏场景照明影响，截图并非以原包预览作为背景。每张实际相机位置、朝向、FOV、网格和三角面数位于 [真实模式记录](rat-runtime-realistic/runtime.json) 和 [经典模式记录](rat-runtime-classic/runtime.json)。

## 脚本和构建

以下命令在 `app` 目录执行，日志在 [checks](checks/)：

| 命令 | 结果 |
|---|---|
| `npm run check:rats` | 50 项通过 |
| `npm run check:rat-mesh` | 1,222 项，通过五种模型、两种材质和两种装置 |
| `npm run check:entity-forms` | 200 项，通过 33 条目／9 父类 |
| `npm run check:entity-preparation` | 17 项，去重／调度／取消／缓存通过 |
| `npm run check:model-warmup` | 111 项，编译／上传／取消／状态恢复通过 |
| `npm run check:program-completion` | 58 项通过 |
| `npm run check:clump-integration` | 3,739,591 次属性／行为断言通过 |
| `npm run check:refined-items` | 2,118 项；56 件物品，每件 ≤1,200 面／3 批次 |
| `npm run check:l2` | 75 区块、150 交界、6,254 可达格等检查通过 |
| `npm run check:dev-flight` | 19 项通过 |
| `npm run build -- --outDir .cache/rat-v80/production` | TypeScript 与生产构建通过，Vite 24.63 秒 |

构建仍有大于 500kB 的既有包体提示。实际游戏复现：`npm run verify:rat-import` 和 `npm run verify:rat-import -- --classic`。性能复现命令及基线目录要求见 [性能对照](performance.md)。

## 范围和限制

- 本次性能测试针对固定场景的首次模型准备，保留同轮已使用的共享缓存；不是每种实体各启动一台完全冷机器，也不是全部层级进入速度重新验收。
- 未穷尽所有自然栖息地、攻击／换形状态、海量同时召唤或 Android 真机。经典模式完成行为与外观检查，未进行三轮全实体性能对照。
- 原包的陷阱、炸弹、气泡和短期 AI 状态只存在于当前运行期，不新增存档结构。本文不承诺这些临时状态跨读档保留。
- 原包作者／许可没有明确标注，按用户提供内容记录；来源、校验和、改动及预览用途见 [素材记录](../../assets/rat-import/SOURCES.md)。完整设计和接入细节见 [RAT-REMAKE.md](../../RAT-REMAKE.md)。
