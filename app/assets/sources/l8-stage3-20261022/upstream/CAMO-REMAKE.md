# 迷彩爬行者（Entity 31）重制

参考：中文维基 Entity 31「迷彩爬行者」与 Level 8 正文（会用全部四条手臂抓起巨石砸向地面）。模型与贴图全部运行时程序化生成。

ZAN 的决定：
- 2026-10-21：方案 A「四臂潜伏者」（阶段 1）。
- 2026-10-22：阶段 3 机制设定——静止贴壁伪装、失明只靠声音、2–3 只群猎互援、近身举石砸地（取消远程投石）、投掷物能把它们引开、只在 L8 成组生成。

工作副本 /workspace/work/l8-wt。不改存档格式和联机协议。

## 第 1 阶段：建模（`renderer/camoCrawlerMesh.ts`）
佝偻双足，上臂粗长（举石/砸地），下臂撑地；乳白盲眼、昆虫双颚、干裂皮板，奇数 seed 长硬鬃。全部材质接入同一组 uCamo 统一量：伪装时按世界坐标三平面采样岩面，只在轮廓边缘留一圈淡暗边。预览 `proto-camocrawler.html`。

## 第 2 阶段：动画（`renderer/camoCrawlerAnim.ts`）
11 个片段：idle_camo / reveal / listen / walk / run / call / lift / slam / distracted / hit / death。每个片段是「时间 → 姿态」的纯函数。`CAMO_SLAM_IMPACT_T=0.45`，`CAMO_LIFT_GRAB_T=0.36`。

## 第 3 阶段：机制（`engine/camoAI.ts`、`world/camoSpawn.ts`、`renderer/camoRender.ts`）

### 状态机
```
cling（贴壁伪装，uCamo 0.95）
  │ 听到声音 / 被碰到 / 被打
  ▼
reveal 1.2s ──► listen 1.6s（片段从 t=0.6 接；身体慢慢转向声源，头歪向声源）
                  │ 本组还没人召唤 → call 2.0s（25m 内同伴全部惊醒、共享声源）
                  ▼
        stalk（潜行 1.5m/s）/ charge（冲刺 4.2m/s）→ 声源最后的位置
                  │ 到了没人 → search（每轮 3s，听到新声音就再追）
                  │ 玩家 ≤2.2m 且刚出过声（或贴身 ≤1.2m）→ lift 1.0s → slam 0.8s（0.45s 触地）→ recover 0.7s
                  │ 失去声源 12–20s → return（1.1m/s 走回原伪装点）→ cling，uCamo 2.5s 内升回 0.95
  投掷物落点 ──► charge 去落点 → distracted 10–12s（期间忽略响度 <9 的噪音）→ search / return
  受击 ──► hit 0.55s → （本组没召唤过就 call）→ 追击或直接 lift
```
运行时状态在 `e.cc`（不入存档/联机）。为了兼容图鉴遭遇与联机快照，通用 `e.state` 同步映射：cling→idle，return→wander，lift/slam→attack，追击/召唤/受击→chase，其余→investigate。

### 数值表（`CAMO` 常量）
| 项 | 值 | 说明 |
|---|---|---|
| 生命 / 抗性 | 110 / 无 | 沿用原值 |
| 伪装度 | 0.95 | `CAMO_IDLE_LEVEL`；回壁后 2.5s 内渐升 |
| 听觉 | 距离 ≤ 响度 × 1.15（伪装中）/ × 1.4（惊醒后） | 失明，不放大小声 |
| 听觉下限 | 响度 < 1.5 听不见 | 蹲行脚步响度 1 → 完全静音 |
| 声源响度 | 蹲行 1、行走 4、交互 6–16、跳跃落地 7、挥击 8、奔跑 10、投掷物落点 12、砸地 12、开枪 14、汽油罐 18 | 行走/奔跑/挥击/交互走原 `noiseEvent`；落地、开枪、投掷物是新钩子 |
| 召唤半径 | 25m | 同一时刻只有一只召唤 |
| 移动 | 潜行 1.5、冲刺 4.2、回壁 1.1 m/s | 玩家行走 3.4、奔跑 6.0：走着逃不掉，跑得掉。片段播放速率 = 实际速度 / 片段根位移速度，脚不打滑 |
| 冲刺条件 | 声源响度 ≥ 9，或距离 < 8m，或在赶往投掷物落点 | 否则潜行 |
| 出手距离 | ≤ 2.2m，高差 < 1.2m | 且最近 2.5s 内听到的声源离玩家 < 3m，或贴身 ≤ 1.2m |
| 砸地 | lift 1.0s + slam 0.8s，触地 0.45s | 冷却 0.9s |
| 震伤 | 半径 2.5m；中心 35，线性衰减到边缘 10.5（×难度系数） | `camoSlamDamage(d)` |
| 震屏 | 7m 内，0.75 × (1 − d/7) | |
| 踉跄 | 减速 0.5 + 1.4 × (1 − d/2.5) 秒；推开 0.22–0.55m | 推开前做碰撞检查 |
| 巨石 | 留在原地 45s（最后 1s 沉入地面），最多 8 块；半径 0.42m 实心 | 玩家不能穿过，可当掩体 |
| 引开 | 10–12s（原通用 investigate 6s，约 ×1.8） | 期间忽略响度 < 9 |
| 失去声源回壁 | 12–20s | 每次惊醒时随机 |
| 生成 | 只在 L8；每组 2–3 只，散布在锚点 7m 内，间距 ≥ 1.8m | 凑不够两只的整组放弃 |
| 生成密度 | 普通生态带：每区块 28% 抽签放一组；巨臂林地：每 4×4 宏区 1 槽一组 | 原为 28% × 1 只 与 2 槽 × 1 只；实测每区块约 0.29 只（原 ≈0.28） |
| 掉落 | 无 | 原版也没有掉落 |

### 贴壁
- `world/camoSpawn.ts`（纯函数，Worker 里也能跑）：从锚点附近的候选点出发，先粗测最近岩面（10 方向），再在贴壁点上迭代三次：在离地 0.55/1.05/1.5m 三个高度、法线反方向 ±46° 的扇面里细测，把最近的岩面调到离中心 0.4m（模型背后的墙面在 x=−0.34，再留 0.06）。朝向 = 背对最近岩面。要求身前 0.7m 是空腔、贴壁点与候选点地面高差 ≤ 0.7m。
- L8 用真实三维岩体场（`l8VolumeField` + `l8VolumeColumn`，同一水平点三个高度共用一次柱采样），其他层退回瓦片可走性（只给开发者召唤用）。
- 每组成本约 15ms（一次柱采样约 35µs，一组约 1100 次），只在 28% 的区块里发生。

### 渲染
- `buildCamoEntity`：阶段 1 网格 + 手上巨石。全部伪装材质改为共享 `uRock / uRockScale / uRockTint / uRockOffset` 四个统一量对象，每只只有自己的 `uCamo`；程序 cache key 统一为 `camo31-world`。
- 共享统一量每帧只更新一次：按玩家所在生态带取 `caveVolume.materials[variant]` 的洞壁贴图、贴图缩放和颜色，并把窗口原点 (ox, 0, oy) 加到三平面坐标上，所以爬行者身上的岩纹和身后洞壁的岩纹是同一张图、同一个相位。
- `animateCamo`：读 `e.cc.clip / clipT` 采样；切片段时 0.18s 姿态混合。14m 内每帧采样，14–30m 以 8Hz 采样，30m 外停在最后一个姿态。联机客人端没有 `e.cc` 时按通用 state 选片段。
- 砸地触地后，手上的巨石隐藏，交给 `syncCamoBoulders` 在同一位置画同一种子的巨石（看不出交接）。
- 死亡：`deathT` 1.4→0 映射到 death 片段 0→1.8s。

## 接入点（共享文件里的钩子，全部标 `// [L8-camo]`）
| 文件 | 位置 | 内容 |
|---|---|---|
| `engine/entityAI.ts` | import 区 | `beginCamoFrame, camoSound, updateCamo` |
| | `noiseEvent` 开头 | `camoSound(eng, x, y, radius)`：所有原有噪音事件进 camoAI 队列 |
| | `noiseEvent` 实体循环 | `camocrawler` 直接 `continue`；删掉旧的 `def.blind` 听觉分支 |
| | `updateEntities` 帧开头 | `beginCamoFrame(eng, dt)` |
| | `generic:` 段 | `updateCamo(...)` 后 `break generic`；删掉旧的 `def.blind` 冲向声源分支 |
| `engine/combat.ts` | import 区 / `killCheck` / `shootChocolate` / `landProjectile` | `camoHurt`（受击）、枪声响度 14、投掷物落点 `camoProjectileLanded` |
| `engine/movement.ts` | import 区 / 跳跃落地（vz < −4） | `camoSound(eng, p.x, p.y, 7)`：只进迷彩爬行者的队列，不改其他实体 |
| `engine/dev.ts` | import 区 / `initDevEntity` | 召唤后 `initCamo` 就近贴壁 |
| `world/infiniteL8.ts` | import 区 / `placeEntity` 之后 / 巨臂林地槽 / 普通生态带 | `placeCamoPack()` 替换原 `placeEntity('camocrawler', 1)` |
| `entities/types.ts` | `Entity` | `cc?: CamoState`；删掉 `EntityDef.throws` |
| `entities/deep.ts` | `camocrawler` | 去掉 `throws`，damage 35，图鉴描述按新机制改写 |
| `renderer/entitiesMesh.ts` | import 区 / `buildEntityMesh` 开头 / 旧 case | `buildCamoEntity`；旧方块模型分支删除 |
| `renderer/renderer.ts` | import 区 / 实体动画 / 死亡分支 / 实体循环之后 | `animateCamo`、`animateCamoDeath`、`syncCamoBoulders` |
| `package.json` | scripts | `check:camo`、`verify:camo-ingame` |

## 验收
- `npm run check:camo`：53/53，真实 Engine + 真实 L8 生成 + 真实 step 循环。结果写入 `reports/camo/mechanics-check.txt`。覆盖：听觉半径、下蹲静音（真实输入蹲行 3 秒）、跳跃落地/开枪进入队列、reveal→listen（t=0.6）→call→追击、群体呼叫（25m 内惊醒、40m 外不动、只有一只 call）、砸地伤害曲线与触地时机、踉跄、巨石留存与阻挡、躲到 4m 外不受伤、引开时长与引开期间忽略噪音、失去声源回壁与伪装度回升、受击/死亡、只在 L8 生成、组规模 2–3、贴壁几何、共享统一量与动画降频。
- `node scripts/verify-camo-ingame.mjs`（端口 3451/9451）：真实应用读 L8 存档进入，岩壁上放一组，截图存 `reports/camo-ingame/`。2026-10-22 重跑：01 远景（6.5m）主个体贴壁、伪装度 0.95，在准星处能分辨出轮廓（伪装下本来就很淡）；08 冲刺追击时被拍的那只离玩家 4.75m（`verify-result.json` 的 `chargeDist`，脚本只在 3.5–7m 内停下拍）。

## 已知不足
- 移动仍用现有的直线 `stepEntity`，没有寻路；声源在岩柱另一侧时会被卡住，卡 1 秒后按「到达」处理转入搜索。
- 失明个体的「察觉玩家就在身边」只看最近的声源，不考虑隔墙：隔着薄岩壁出声也会被砸（伤害有高差限制）。
- 巨石只挡玩家，不挡实体，也不挡投掷物。
- 共享统一量按玩家所在生态带切换；站在生态带交界时，另一侧的爬行者会用这一侧的岩纹。
- `buildEntityMesh` 拿不到实体 id，长毛个体（奇数 seed）按创建顺序交替，不随实体固定。
- 说话类交互没有单独的声音钩子（游戏里没有玩家语音），NPC 对话不出声。
- 联机：AI、巨石只在房主本机运行，巨石不同步（多人协议冻结）。
