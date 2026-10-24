# 售货机、无面灵、窗户与 NPC 待机接入验收

原项目：E:/ZAN/backroom/app。四个附件采用三方合并接入，保留当前游泳、L7 地图、近战、手部、人物饰品及据点岗位更新。未同步 GitHub 副本或 app-lite。来源、文件哈希与许可说明见 [provenance.json](provenance.json)，导入前源快照与合并记录保存在 app/.cache/four-import-20261023；[逐文件记录](import-audit.json) 用于追踪本次导入，不代表其它会话的改动归属。

## 当前结果

- 生产构建通过；四包机制检查：窗户 85、无面灵 49、售货机 81、NPC 待机 12100 项通过。集成资源／材质／坐标／实例切换检查 626 项通过。命令与输出见 [最终检查](final-checks/summary.json)。
- 11 组既有 L7、游泳、人物动作、坐姿、模型、饰品与面部对齐回归通过，见 [回归汇总](regressions/summary.json)。
- 实际 App：真实光影 35 项、经典光影 37 项通过；最终 L4 阴影调整后另有 10 项窗口显示／消失／交互检查通过。记录分别见 [真实光影](actual-game-realistic-final/result.json)、[经典光影](actual-game-classic-accepted/result.json)、[最终 L4](l4-frame-budgeted/result.json)。这些接受记录没有浏览器运行／GPU 着色器错误或失败请求。
- 使用 RTX 4060 Laptop 原生 D3D11 GPU、1920×1080、DPR 1、seed 424242，Chrome --headless=new，独立端口／临时档案／内存存档。检查没有使用软件光栅器或玩家存档；浏览器、服务器及临时档案已清理。

## 实景与适配

[售货机界面](actual-game-realistic-final/vending.png)、[出货](actual-game-realistic-final/vendDispense.png)、[Entity 36 活化](actual-game-realistic-final/e36.png)、[三种年龄外貌](actual-game-realistic-final/facelings.png)、[幼体安抚](actual-game-realistic-final/soothe.png)、[L2 钢格窗](actual-game-realistic-final/windowL2.png)、[L4 窗体](l4-frame-budgeted/windowL4.png)、[L4 消失封墙](l4-frame-budgeted/windowL4Vanish.png)、[L601 木窗](actual-game-realistic-final/windowL601.png)、[伸手动画](actual-game-realistic-final/windowReach.png)、[消失后原墙](actual-game-realistic-final/windowVanish.png)、[Alpha NPC 待机](actual-game-realistic-final/npcIdle.png)。对应经典画面在 [经典光影目录](actual-game-classic-accepted/result.json) 的同名 PNG。

检查重点包括：真实八格 UI 出货取货仅增加一次物品，打开机器时不暂停出货动画且清除遗留操作；Entity 36 仅被攻击后伸腿活化；年龄体型和人物骨架有效；按住安抚结束哭闹；三种窗体与既有窗口对齐，景观／模糊人影／关节手臂可见；窗户消失不会重建世界，原交互关闭，L4 留下实体墙；固定 NPC 不越出岗位范围且头部／手部有待机动作。

修复导入时发现的雾着色器变量、旧伏击隐藏标记、材质克隆句柄、世界坐标种子、流式座位重定位和过期窗体交互。售货机实体在现有队列中分帧构建，普通机不创建无用骨臂，暗格人物仅拆解后准备；活化复用预热模型。几何与材质归实例所有，贴图共享。窗体局部状态通过实例矩阵切换，沿用 L4 小构件免投影规则，并错开两盏静态灯的阴影刷新。

## 资源与性能

[反复创建／回收](actual-game-resource-accepted/result.json) 在所有当前区块、上传及释放队列就绪后采样。连续四轮创建和移除售货机实体及窗口，移除后的 GPU 几何数均为 1008；纹理首次 120，之后稳定为 121。此前过早采样把远处区块继续上传误判为泄漏，诊断记录保留在 resource-diagnostic。

同一 L4 视角 150 帧观测：

| 渲染路径 | 中位帧时间 | P95 |
| --- | ---: | ---: |
| 导入前渲染器／结构构建备份 | 8.3 ms | 12.4 ms |
| 初次集成，阴影预算调整前 | 16.7 ms | 29.1 ms |
| 当前版本 | 12.5 ms | 16.7 ms |

见 [前基线](l4-frame-before/result.json)、[初次集成](l4-frame-after/result.json)、[当前观测](l4-frame-budgeted/result.json)。前基线在实际 App 内只读覆盖备份 renderer.ts／structures.ts，其它依赖保持当前版本。当前固定视角满足中位 ≤16.7 ms、P95 ≤20 ms，但仍高于前基线；这不是全层性能认证或零开销结论。资源压力脚本在其它缓存／阴影状态中还记录过 37.5／58.3 ms，保留原始数据，不用视觉验收代替性能验收。

逐阶段旧字段 calls 是后处理最后一遍的计数，不能当作完整场景调用数。l4Frame／modelChurn 的 frameSample 才是在完整帧中累加 WebGL 提交、包含阴影与后处理的记录。

## 复现与限制

在 app 目录运行：

```powershell
npm run check:window
npm run check:faceling
npm run check:vending
npm run check:npc-idle
npm run check:four-import
npm run build
npm run verify:four-import -- --label=manual-realistic
npm run verify:four-import -- --classic --label=manual-classic
npm run verify:four-import -- --steps=modelChurn --label=manual-resources
npm run verify:four-import -- --steps=l4Frame --label=manual-frame
```

--baseline 仅供已有 .cache/four-import-20261023/before 快照的当前工作区做导入前渲染对照。QA 服务没有开启 HMR，也不使用运行中的用户服务器。

历史失败诊断保留：actual-game-realistic-3 为雾着色器编译失败；actual-game-classic-final 为 UI 尚未刷新按钮时自动点击的脚本竞态；resource-diagnostic 为未等待远处区块完成的资源基线问题。对应修正和重新验收均有独立记录。

尚未做 Android 真机验证。普通机器库存按附件设计留在运行时；卡货标记／机器种子按区块保存。构建保留既有字体路径、Browserslist、PostCSS 和体积警告。原包的原型截图／报告不计作本次实际游戏通过证据。
