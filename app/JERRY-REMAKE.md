# 杰瑞重制接入

2026-10-18，将用户提供的 `jerry-remake.zip` 选择性合并到当前 `app`。源包基于较早版本，本次保留现有派对客、旱虾、人物／手部、Alt 收起主手、图鉴预览和 Level 0 测试场地的实现。

## 模型和行为

- `jerry` 继续是原实体 ID，在 Level 274 自然生成。新模型为接近一米全长的紫蓝金刚鹦鹉，包含钴蓝羽毛、黄色眼圈、黑色巨喙、分层尾羽和握住横杆的双爪。实际预算为 **2,868 三角面、3 次绘制、14 根骨骼**。
- T 形栖木横杆顶面为 1.48 米，模型与碰撞按同一尺寸制作。闲置时转头注视、歪头、梳羽、抖羽、伸展；说话时喙开合，完整台词同时进入消息栏。
- 青鸟神父周期性接鸟、讲道、送回栖木。渲染按现有人物的实际肩骨位置和朝向贴合；起落使用短距扑腾，落地后蹦跳返回，不使用持续悬空飞行。
- 受伤、低声望或被信众目击杏仁水驯服时，杰瑞可从栖木／肩头尖啸扑击。信众新增投石索、近战与低血量击晕、拖走、劫掠和暂时休战；辛克莱可组织伏击。
- 距离、注视和接触累积教化，25／50／75 阈值各触发一次短暂木僵、镜头转向及醒来后的低头诵咏反馈。满教化保留离开限制；杏仁水驯服清零教化并留下会消退的失神残响。去程序化保留当局理智上限代价。
- 新增蓝羽传单、流浪者日志残页的地面／手持模型和 128² 透明像素图标。阅读后记录 L2 信众宣传间方位，在小地图和大地图显示标记；远处目的地显示于地图视口边缘，并注明距离。

| 参数 | 数值 |
| --- | --- |
| 主动初次搭话 / 普通对话距离 | 4.5 / 5.5 米 |
| 普通对话间隔 | 11～17 秒，按两句话开始时间计算 |
| 教化范围 / 普通与注视累积 | 6 米 / 每秒 0.15 与 0.5 |
| 接触增量 / 冷却 | +25 / 20 秒 |
| 木僵 / 虔诚反馈 | 2.6 / 1.2 秒 |
| 扑击距离 / 伤害 / 冷却 | 1～7.5 米 / 24 / 12 秒 |
| 驯服残响最长时长 | 300 秒 |
| 去程序化后的当局理智上限 | 75 |
| 信众击晕血量线 / 醒来最低血量 | 12 / 18 |

新增 AI 状态仅留在当局内存，新开局重置；现有教化、驯服、誓言与同意传教等存档字段继续使用。续档按已有教化值推断已发生的阈值。该包的残响、理智上限、飞石和传单方位不新增存档字段。

## 合并修正

1. 场景与图鉴调用同一工厂，实例独立持有几何、材质和骨架，共享程序化羽毛贴图。关闭预览或移除另一只鸟不会释放存活实例的资源。
2. 保留当前 GPU 着色器预热和隐藏准备流程；未接入源包对整个场景启用的 CPU 蒙皮替身。原型页的可选 CPU 调试仅用于原型，实际游戏验收使用原生 GPU 蒙皮。
3. 使用实际肩骨朝向，修正旧朝向约定差异；首次 AI 步进前也将双爪朝向对齐横杆。死亡从当前栖息高度连续坠落，避免立即跳到地面。
4. 气泡背景根据行数和文字宽度收缩，短回复及尖啸不再占满四行面板；文字不受场景雾和色调映射冲淡。
5. 木僵、击晕及失神期间，移动、攻击、物品使用和交互统一锁定；快捷操作不能绕过保护。Alt 收起主手仍继续生效。
6. 修正家具碰撞边缘被生成期连通回填误做成通顶墙的问题，并保留当前 Alpha、其它据点与薄墙生成实现。

## 复现与验收

在 `app` 目录运行：

```powershell
npm run check:jerry
npm run verify:jerry -- classic
npm run verify:jerry -- realistic
npm run build
```

专项 **120 项通过**；两种光影的实际游戏检查各 **59 项通过**。实际游戏从标题菜单继续隔离的内存存档，使用 Level 274、种子 `6767`、1920×1080、纹理质量 2、原生分辨率。验证 GPU 为 RTX 4060 Laptop / ANGLE Direct3D11；检查了栖木、肩头正侧背面、扑击、木僵、诵咏、驯服、信众击晕、图鉴换角度、死亡坠落及 L2 地图标记。连续三轮生成四只再回收，最终几何和贴图数量稳定。

开发服务器另提供 `/proto-jerry.html?mode=poses`；支持 `front`、`side`、`back`、`close`、`shoulder`、`perch`，加 `&real=1` 使用真实材质。

完整截图、资源数量、相关回归和已存在的 Alpha 碰撞断言失败见 [验收记录](reports/jerry/README.md)。本轮未进行持续帧时间压力测试或 Android 真机测试。

## 来源与许可

- 用户输入：[原始 ZIP](assets/jerry-import/jerry-remake.zip)，SHA256：`6d14974dd652e337a8be7d880adb90a8776eb8a271930d7c0df931816741dbe8`。代码未附独立许可证声明，按用户提供与接入请求保存来源，不自行声明额外开源许可。
- [源包说明](assets/jerry-import/UPSTREAM.md)保留原作者交付记录；其中 CPU 渲染截图与旧测试结论属于历史记录，本轮以本项目验收报告为准。[哈希清单](assets/jerry-import/manifest.json)区分原始 ZIP、首轮原样拷贝与最终合并文件。
- 设定参考 [Wikidot Entity 7 中文页](https://backrooms-wiki-cn.wikidot.com/entity-7)及[英文页](https://backrooms-wiki.wikidot.com/entity-7)。重写作者 **Sariastuff**，原作者 **1000dumplings**；中文译者 **owl4513、jiaoyanerlan2**；文本采用 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。本游戏模型、台词和机制为适应游戏的改编，不表示原条目规定了这些数值。
- 原页面鸟类照片参考署名：**eflon**，[Hyacinth Macaw](https://www.flickr.com/photos/23094783@N03/3153577197)，[CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)；**Giles Laurent**，[Hyacinth macaw couple](https://commons.wikimedia.org/wiki/File:007_Hyacinth_macaw_couple_under_Pink_Ip%C3%AA_tree_in_Encontro_das_%C3%81guas_State_Park_Photo_by_Giles_Laurent.jpg)，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。本次未将这两张照片导入贴图。
- 羽毛颜色／凹凸纹理由 `src/game/renderer/jerryMesh.ts` 的 Canvas 算法生成，没有新增外部照片贴图。两张物品像素图为项目原创，画法保存在 `scripts/gen-item-icons.py`，来源记录见 [图标来源](public/textures/icons/SOURCES.md)。
