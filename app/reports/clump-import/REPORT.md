# 肢团 v67 集成验收（2026-10-14）

已将用户提供的 clump-remake-v67.zip 按差异合并至当前 app。保留先前笑魇、猎犬、钝人、无面灵、窃皮者、人物、手部和层级改动；没有修改 app-lite 或联机模块。

## 接入内容与修正

- 普通肢团与 L3 高智能肢团：融合 SDF 肉团、蒙皮伸出/盘绕肢体、眼口、武器及全部姿态；皮肤纹理由代码生成、全局共享，几何/材质/骨骼由实例持有。
- 专属听觉、起步/爆发/混乱期、蓄力抓取、按键挣脱、非致命吞食与饱足、绝食状态；L3 石器/砖块/滋水枪/骨刺、贴顶俯扑及相应音效。
- 使用当前 litMaterial，经典 Lambert、真实 Standard；接入现有区域受光，降低默认环境反射影响。共享贴图不随单个实例回收。
- 主臂在完整连续骨链上伸展到 3 米，保持收回姿态；修正包内腕部伸展距离不足。死亡收回伸展比例。
- 击杀抓取者立即释放玩家；开发者召唤在应用 L3 变种后初始化 AI，并使用实际地板高度。贴顶动作查询真实顶高，没有屋顶时退出贴顶/引体状态。
- 普通肢团不再创建未挂入场景的 L3 武器几何。

## 自动检查

生产构建 npm run build 通过（41.91s）；Vite 仍提示现有大型 bundle。沙箱首次构建出现 realpath EPERM，同一命令在本机权限下通过，日志保留。

通过：npm run check:clumps（65 项原包行为检查）、npm run check:clump-integration（2 模式 × 2 变种 × 6 种子，所有 UV/数值/索引/权重/骨骼/3m 主臂/实例释放），npm run check:l3、check:skinstealers、check:hounds、check:dullers、check:smilers、check:retro-hands、check:faceling-skinstealer-models、check:model-warmup。

模型预算：普通 10986–11422 三角面、5 绘制、34 骨骼；L3 11950–12314 三角面、6 可见绘制、47 骨骼。详见 models.json / behavior.log。

## 实际游戏与截图

使用真正无头 Chrome（--headless=new），独立 profile app/.cache/clump-qa、CDP 9243、Vite 3012，隔离内存存储、种子 20261006、1920×1080 / DPR1、纹理档2、真实/经典光影、环境场景104及L3。正常游戏 Engine/Renderer，未使用 CPU 烘焙蒙皮或原型页替代验收。

runtime.json 验证实际 updateMovement/updateEntities/killCheck 的蓄力、拖拽、连按挣脱、吞食留血、击杀/冻结释放与 GPU boneTexture。level-3.json 验证 L3 开发者召唤具有 90 生命、高智能状态和相应模型。

截图：game-normal / fasting / grab / devour / l3-brick / l3-squirt / l3-ceiling / death / classic / level-3.png；对应 view-*.json 保存位置、朝向、FOV。已人工查看模型正面、伸臂、吞食、贴顶、经典材质和 L3 场景截图。浏览器没有游戏运行时或着色器错误；初次 favicon.ico 404 单独保留在错误日志。

资源：4 轮、每轮3次普通/L3召唤和回收后，均为 145 geometries / 73 textures，未持续增长。

## 性能与边界

显卡 ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)。预热后5轮、每轮至少180帧：帧间隔中位 9.6–9.6 ms，P95 9.7–9.7 ms；GPU 中位 7.9–8.2 ms，P95 13.5–16.5 ms。场景单只 L3，非全层级/大群体压力结果。绘制调用包含环境与周期性阴影更新，不能当作实体单独绘制预算。

首次新形态 CPU 构建仍较重，Node 测得最高 312.8 ms；最多6种 SDF 形态缓存后复用。没有把预热帧时间当作首次生成无卡顿的证明。L3 scene 切换记录含建筑构建/着色器编译尖峰，level-3.json 的累计分位数不作为稳定性能结论。

未验证 Android 真机、大群体长期压力、完整长期追逐调参或主观音效听感。伸出肢体没有逐骨墙体碰撞，狭窄位置仍可能穿墙；主臂管体在极端骨骼弯曲下可见低模折痕。

## 复现

在 app 运行 npm run check:clumps、npm run check:clump-integration、npm run build。浏览器验收先以 L0_VERIFY=1 启动 npm run dev -- --host 127.0.0.1 --port 3012 --strictPort，再用独立 .cache/clump-qa profile 启动 Chrome --headless=new --enable-automation --remote-debugging-port=9243，打开 /verifier/l0-remake.html?level=104；运行 npm run verify:clump。

本任务的浏览器/服务器清理结果见 cleanup.json。原包来源和文件哈希见 ../../assets/clump-import/；CLUMP-REMAKE.md 内的上游验收记录不等于本项目验收结果。
