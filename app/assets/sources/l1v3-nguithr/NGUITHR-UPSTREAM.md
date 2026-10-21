# Nguithr'xurh（Entity 16）重制 · 第 1 阶段：静态建模

- 模型：`src/game/renderer/nguithrMesh.ts` → `buildNguithrMesh(scale=1)`（夹 0.75–1.3）、`buildNguithrNest(count=4, seed=16)`（夹 3–6 个网囊）、`nguithrNest(group)` 取巢句柄、`nguithrBudget()`。
- 形体：避日目。7 对环纹步足 + 1 对深褐须肢 = 16 附肢，另有一对巨螯（上不动指 + 下活动指 + 螯齿）、一对黑亮中眼、9 节斑纹腹部。体长约 0.74m，腿展约 1.8m。
- 预算：1 个 SkinnedMesh / 3 次绘制（体表图集、附肢环纹、光泽件）/ 4674 三角面 / 58 根骨骼（命名见文件头；`NG_BONES`、`NG_LEGS`、`NG_PALPS` 导出关节点与外展方向，给第 2 阶段 IK 用）。
- 天花板倒挂：`grp.rotation.x = Math.PI; grp.position.y = 天花板高度`。巢的局部 y=0 即天花板平面，内容全部向下。
- 巢：绒丝贴片 1 + 丝线 1 + 网囊外壳/镇静液/破囊残壳 3 个 InstancedMesh（共 5 次绘制）；句柄 `sacs[i].hide()/show()/pop()`，`setSacGlow(emissive, specular)` 调手电反光。
- 原型：`proto-nguithr.html?mode=under|side|front|nest|pop|plan|scales[&real=1][&cpu=1]`；截图：`npx vite --port 3376 --strictPort` 后 `node scripts/verify-nguithr.mjs [视图...]`，输出 `reports/nguithr/`。
- 尚未接入 `entitiesMesh.ts`（游戏仍用旧 12 腿简模），第 2 阶段做动画/AI 时再替换。

# 第 2 阶段：程序化动画（+ 第 1 阶段遗留修正）

## 遗留修正
- **俯视腿太直**：静息姿态改由 IK 摆出——足尖径向收到约 0.85 倍（膝部明显拱起），每条腿有固定的外展角/径向/膝弯侧偏随机微偏（左右、前后不对称）；极向量带侧向分量（前足膝外偏、后足膝外偏），俯视时腿呈折线。`buildNguithrAnimated()` 构建后立即摆静息姿态，游戏里不会再出现绑定姿态的直腿。
- **网囊白边（煎蛋感）**：外壳改为单面（FrontSide）+ 不透明度 0.62 + 偏黄底色；内液放大到外壳的 0.93 倍；外壳球面加密（26×16）。破囊残壳改为程序生成：每列随机撕裂深度、奇偶列交错成锯齿、约 1/5 列拉成长垂片并外翻，单独一份双面材质。
- **天花板丝线偏亮**：LineBasicMaterial 改为 `#8a8579`、不透明度 0.32、参与雾。垂降挂丝同样压暗（不透明度 0.5×thread）。

## 动画 API（`src/game/renderer/nguithrAnim.ts`）
- `NguithrPose`：纯数值姿态量。挂载 `flip`（0 倒挂 → 0.5 头朝下吊丝 → 1 正立，绕纺器点俯仰）、`drop`（沿丝下降，世界 m）、`thread`（挂丝可见度）、`dead`（侧翻）；身体 `crouch/bodyPitch/bodyRoll/bodyYaw/shiftX/shiftZ/breath/tremble`；步足 `plant`（1 贴附 IK / 0 自由）`speed/turn/gaitPhase/spread/tuck/cower/dangle/curl/reel/twitch`；口器 `headPitch/headYaw/chelOpen/chelBite/chelSpread/palpHold/palpRaise/palpTuck`；动作 `reach + reachX/Y/Z`（切丝目标，挂载系）`reachSaw/spray/abdLift/abdPulse`。默认值 `NG_POSE_DEFAULT`，构造 `nguithrPose(partial)`，插值 `lerpNguithrPose`。
- `poseNguithr(grp, pose, t)`：无状态摆骨骼。贴附足尖在挂载系（附着面 y≈0）求目标，身体怎么动足尖都原地不动；自由足尖/须肢在胸节局部系；基节偏航 + 腿节/胫跗节两骨解析 IK。只写骨骼局部变换 → GPU 蒙皮直接可用，QA 的 CPU 蒙皮替身照常每帧烘焙。
- `NguithrAnimator(scale, init)`：`set(partial)` 设目标，`update(dt)` 逐字段指数平滑（时间常数表 `TAU`：受惊/喷射快、移动/转向慢），并按速度积分 `gaitPhase`。所有过渡都是姿态量插值。
- 步态：14 足波形步态（后足先迈、向前传递，左右反相），占空比 0.75；`speed`（m/s）与 `turn`（rad/s）同时决定每只足的支撑期滑移（v + ω×r），所以原地转向、边走边转都对。`nguithrStepRoot(grp, pose, dt)` 按同一速度推进外层组（正立/倒挂通用），足尖不打滑。
- 坐标工具：`nguithrToMount(grp, 世界点)`（切丝目标）、`nguithrWorldAxes(grp, fwd, up)`、`nguithrMouthPoint(grp)`（喷液/撕咬发射点，第 3 阶段喷射粒子从这里出）、`nguithrFloorDrop(天花板高, 缩放)`（落地所需 drop）。
- 挂载换手：倒挂外层组在 `flip=1, drop=nguithrFloorDrop(H, s)` 时，与「外层组正立放地面、flip=0、沿朝向前移 0.67×s m」完全等价，第 3 阶段可在落地后换成地面挂载（反之爬升前换回）。
- 片段（演示/参考时间线）：`nguithrClipPose(clip, t, {ceil, scale, reach})` → 目标姿态；`NG_CLIPS` 列出时长/循环/挂载；`NG_CUT_POP_T`（切丝片段里网囊该 pop 的时刻）；`loop` 串联 idle → cut → descend → crawl（出去、掉头、回来）→ spray → feed → climb → sleep → cower（共 `NG_LOOP_DUR` 秒）。

| 片段 | 挂载 | 内容 |
|---|---|---|
| idle | 天花板 | 几乎不动：呼吸（腹部 ±1.8% 起伏）+ 每 3.7s 时段约 60% 概率单腿抽动一次 |
| cut | 天花板 | 身体偏向目标、同侧最前足伸到网囊吊丝上段锯动，2.7s 时 pop，收回 |
| descend | 天花板→地面 | 蹲伏蓄力 → 松足，绕纺器翻成头朝下挂丝（后两对足操丝）→ 沿丝下落 → 前足先探地、翻正、落地缓冲蹲伏 |
| crawl | 地面 | 0.12m/s 慢速波形步态，4–7.5s 左转 |
| feed | 地面 | 俯身、两螯交替前后撕咬、螯指开合、须肢抱持、腹部起伏 |
| climb | 地面→天花板 | 落地反过程：翻成头朝下、后足交替收丝上升、近顶翻回倒挂、足尖贴回 |
| sleep | 天花板 | 足尖向身体轴收拢、膝高拱贴身、身体压低，呼吸减半、不抽腿 |
| cower | 天花板 | 0.3s 内缩成一团（足尖强收、膝合拢成笼、身体紧贴天花板）+ 颤抖，不反击 |
| dead | 地面 | 抽搐 → 侧翻背部着地（翻滚中抬起）、腿向腹面蜷起朝天 |
| spray | 地面 | 前身抬起、螯外张全开、须肢高举、腹部上翘，1.6s 短促前冲喷射姿态（粒子留给第 3 阶段） |

## 原型 / 验收
- `proto-nguithr.html?anim=<片段>&t=<秒>[&view=under|wide|side|front3q|top|follow&cam=x,y,z][&play=1][&cpu=1][&real=1]`。截帧确定性：每次都从 0 以 1/60s 重模拟动画器；`window.__render(t)` 可同页重渲。`&play=1` 实时循环（真 GPU 蒙皮用这个看）。
- 截图：`node scripts/verify-nguithr.mjs anim-...`（视图表见脚本，输出 `reports/nguithr/anim-*.png`）；序列帧 `frames:<片段>:<视图>:<t0>:<t1>:<步长>[:宽x高]` → `reports/nguithr/frames/`，`anim-crawl.gif` 由序列帧经 ffmpeg 合成。
- 数值自检：`npm run check:nguithr-anim`（Node 无 DOM）：全部片段 1/60s 步进，检查骨骼无 NaN、CPU 蒙皮后顶点穿天花板/地面 ≤6cm、相邻 0.1s 骨骼最大转角。结果存 `reports/nguithr/anim-check.txt`。

## 已知不足
- 足尖贴附是「按速度滑移」的程序化步态，不记世界坐标：AI 实际位移必须与 `pose.speed/turn` 一致（用 `nguithrStepRoot` 就一致），否则会打滑；地面不平时足尖不做射线贴地。
- 切丝够不到时（网囊离身体 >~1.05m）足尖停在可达球面上；第 3 阶段需先把它移近。
- 腿与腿之间没有碰撞，受击缩身/休眠时会有腿交叉；死亡翻滚的过渡中个别腿节扫进地面约 5cm、骨骼单帧转角较大（≈0.9rad/0.1s，像抽搐）。
- 挂丝是一条 1 像素线（LineSegments），远处几乎看不见；需要更醒目时可换成细长四边形条带。
- 无头 SwiftShader 无法跑 GPU 蒙皮（第 1 阶段已知），截图全用 CPU 替身；GPU 路径只写骨骼，未在真 GPU 上截图验证。

## 第 3 阶段：AI / 机制接入

### 状态与存档
- 新增 `src/game/engine/nguithrAI.ts`，所有数值集中在常量表 `NG` 中（下表摘录）。
- 运行时状态只保存在内存里：实体上是 `e.ng`，引擎上是 `eng.ngRun`。后者登记在 effects 表中，开新局或换层时重置。
- 不新增存档字段，不改联机协议。
- 状态流转：静伏 → 切囊 → 观察窗口 → 全部放下 → 天花板挪位 → 垂降 → 进食 → 地面（极慢，玩家离开 4m 即放弃）→ 爬升 → 回巢 → 休眠 → 重织。另有两个分支：缩身（天花板上受击）和喷液捕食小实体。

### 关键数值
| 项目 | 数值 |
|---|---|
| 网囊数 / 个体缩放 | 3–6 个 / 实际生成 0.85–1.15（模型支持 0.75–1.3） |
| 触发 | 玩家在完整网囊正下方 0.6m 内；0.35s 后网囊爆开 |
| 轻度镇静 | 洒落半径 1.6m，持续 7s，移速 ×0.72；伴随视野发雾、低通闷音、HUD 含糊 |
| 观察窗口 | 5s（前 1.4s 宽限）；仍在巢下 2.2m 内则放下全部网囊 |
| 重度镇静 | 持续 16s，理智立即 −15，之后每秒 −1.2；无法移动，画面变暗 |
| 挣脱 | 跳跃上升沿或 A/D 换向计数；轻度 1 下，重度 14 下；挣脱值每秒衰减 1.1；挣脱后残留 1.5s 轻度 |
| 移动 | 天花板 0.7m/s；垂降/爬升 ×1.5 倍速；地面 0.22m/s；离开 4m 放弃；地面最长停留 25s |
| 进食 | 每秒 4 伤害，进食期间重度镇静至少续到 2.5s |
| 撕咬 | 8 伤害，附带 1.5s 轻度 |
| 休眠 / 重织 | 休眠 18s，之后每 22s 补一个网囊；玩家在 7m 内不补 |
| 反制 | 投掷物可破囊（1.6m 内 2.5s 小剂量轻度）；命中本体 10 伤害；天花板上受击缩身 2.6s，不反击；手电照到网囊会反光 |
| 喷液捕食 | 范围 3.2m，冷却 20s；目标为旱虾、尸鼠（不含卡皮巴拉形态） |
| 生成 | L1/L2 每 chunk 4%；L3 新增 6%（圣所不生成）；18% 的巢点为 2–3 只群居；L5 池权重 6→2；L8 槽位再按 1/3 概率生成 |
| 掉落 | 新物品「镇静腺」`sedgland`：吞服后生命 +15、理智 +10，解除迟缓与缠丝麻痹 |

### 接入改动
- `engine.ts`：重度镇静并入 introLock。
- `entityAI.ts`：删除旧的 `updateNguithr`，改为分派到新模块。
- `combat.ts`：投掷物命中判定与击杀掉落。
- `movement.ts`：轻度镇静减速。
- `audio.ts`：新增 `setMuffled`。
- 其他：`effects.ts`、`types.ts`、`items.ts`、`inventory.ts`、`HUD.tsx`、`itemsMesh.ts`、像素图标。
- 渲染：
  - 删除 `entitiesMesh.ts` 旧的 12 腿简模，改用蒙皮模型 + `NguithrAnimator`。
  - `renderer.ts` 新增 `updateNguithrMesh`，负责倒挂/落地挂载、巢同步和手电反光。
  - `?cpu=1` 时使用 CPU 蒙皮（`syncSceneCpuSkins`）。
- 生成：`infiniteL1/2/3/8.ts`、`l5.ts`、`spawns.ts`（层级 [1,2,3,8]）、`extractLayouts.ts`。
- `l3.ts`：删除电弧体生成（实体定义保留）。

### QA
- `npm run check:nguithr`：73/73 通过，结果见 `reports/nguithr/mechanics-check.txt`。
- `check:nguithr-anim` 通过。
- 另外 20 项回归全部通过，日志在 `reports/nguithr/regress/`。
- tsc 通过；eslint 无新增问题。
- 游戏内截图：`scripts/verify-nguithr-game.mjs`（L1，`?cpu=1`）生成 `reports/nguithr/game-*.png`；`game-live-*` 是真实 AI 不冻结时的全流程实测。

### 第 3 阶段已知不足
- 群居的几只各自独立触发，没有联动。
- 天花板爬行不检测墙体。
- 喷液粒子显示为方块。
- 网囊距离超过 1.05m 时，切囊动作的足尖碰不到吊丝。
- 实体卸载后再次出现需要重新上传几何，可能有轻微卡顿。
- GPU 蒙皮尚未在真实显卡上验证。
