# Level 11 位置、朝向与沿岸建筑复核（版本 12）

[当前原图／实机对照](index.html) · [9 张原图／27 个局部放大](inspection/index.html) · [本轮实机记录](canal-v12-final/runtime.json) · [检查和性能](canal-v12-final/acceptance.json) · [v11 店铺与连廊记录](README-v11.md)

本轮继续按原图像素核对，重点纠正 11canal 左岸小楼的体量与方向。此前“整面玻璃与阳台叠层”的判断已撤回：少窗长墙沿岸，玻璃体量向河岸凸出，楼梯位于交接的暗槽中。新增 [小楼局部](inspection/canal-annex.png)，观察与未知项保存在 [原图记录](inspection/notes.json)，不使用 AI 放大补细节。

## 本轮修改

- 左岸小楼改为真实 L 形占地：少窗长墙沿岸延伸，玻璃翼楼向岸边凸出，折返外梯位于两体量之间。外梯的踏步、平台、斜向扶手和碰撞使用同一几何描述，平台接到墙面。
- 近处高楼改为更密的浅绿灰幕墙竖框；小楼长墙区分窄竖窗和短横窗，玻璃翼楼单独使用幕墙。移除这两类楼入口处未经照片支持的通用大招牌。
- 参考区两岸改为连续步行铺装；普通城市也会确定性生成步行岸道。机动车道交叉口保持连续，步道不生成车辆、停车标线或公交设施。外梯范围不再投放街道杂物。
- 可进入楼层、房间、门窗、内部楼梯和地图随实际 L 形占地生成，四种朝向共用同一规则。地图新增步行岸道颜色与图例。
- 保留上一轮店铺与屋顶连廊的结构修正，并复核连廊反向仰视。本轮没有重新生成标牌或添加噪点纹理。

## 验证

固定 L11 种子 **20261014**（新游戏种子 **20259573**），1920×1080、DPR 1、高画质、真实光照。7 个建筑视角、2 个普通种子 42 视角、1 张生产地图界面截图已逐张查看。

实际双向走过两岸步道（4 段）、小楼外梯首层折返（上下共 6 段）、三栋建筑入口与内部楼梯，并检查 54 个房门样本、店铺独立入口、缓拱桥与 2 座水下桥墩。普通种子的两种建筑也实际进入并检查；参考相机只用于观察，建筑结构来自共享数据。

静态检查覆盖 3706 栋普通城市建筑，29 种参考配方均出现；参考区 796 个门、1592 次接近检查通过。城市室内采样 173 栋、1991 个房间，可达性失败 0、家具遗漏 0。模型库 30 种建筑、102 种装饰，碰撞、材质、UV 和资源释放检查通过。构建通过，仍有既有的大包／混用静态动态导入提示。

实际浏览器 Chrome/155.0.8059.40，ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)；启动参数含 --headless=new，端口 8223/8224 使用独立 profile。运行错误 0，网络记录 2 条（均为 favicon.ico 404）。浏览器、服务器与临时 profile 已清理。原像素观察页另经无头浏览器检验，36/36 张图完整加载，100%／200% 缩放、原图切换与关闭均通过。

移动帧时间中位数 16.6ms、P95 45.8ms、最长 320.8ms。三次卸载重载后的几何计数 1814/1814/1814，非角色池纹理 77/77/77；角色池纹理另列为 21/24/26。资源计数不等于显存字节数。静止视角、CPU/GPU 采样和具体绘制调用见 [acceptance.json](canal-v12-final/acceptance.json)。

## 尚未还原与推定内容

- 原图中可观察的是长墙、凸出玻璃翼楼与暗槽楼梯的位置关系。当前 11 层、52×38m 占地、5m 凸出和外梯净宽是推定参数；背立面、室内房间、封闭服务门的位置也不是照片实测结果。
- 楼梯和立面结构已更正，但原图的细框比例、外梯实体侧板、窗帘与玻璃反光仍有差异。当前玻璃翼楼没有达到逐像素相同。
- 原图桥梁的绿色梁、岸边石柱分段栏杆、成片绿化与树冠形态仍需继续细化；当前运河总览的远景密度、岸线尺度及光照也与原图不同。
- 其余七张参考图已有原像素观察记录，尚未逐项完成新的模型还原。店铺和连廊的历史修正、文字可辨识边界见 v11 报告；本轮不能代表这些部分全部验收完成。
- 运行使用高画质与真实光照。移动长帧仍存在，不能宣称全场景稳定 60 FPS；本轮没有重新做低画质、经典光照和完整存档迁移的实机验收。

## 可复跑命令

工作目录 app：

```text
npm run build
npm run check:l11
npm run check:l11-reference
npm run check:l11-architecture
npm run check:l11-meshes
npm run check:l11-collision
npm run check:l11-urban
npm run check:l11-map
node scripts/verify-l11-reference.mjs --label=canal-v12-final --case=03,31,34,35,36,37,38 --validate=quay-west-near,quay-west-annex,quay-east-near --rooms --architecture --random-cases=quay-service-wing,green-curtain --map --lifecycle
node scripts/inspect-l11-references.mjs
node scripts/build-l11-inspection-report.mjs
node scripts/check-l11-inspection-report.mjs
node scripts/summarize-l11-canal.mjs --runtime=canal-v12-final
```
