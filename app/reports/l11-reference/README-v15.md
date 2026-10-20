# Level 11 位置、朝向与绿化细节复核（参考版本 15）

[原图和实机对照](index.html) · [原像素放大](inspection/index.html) · [本轮数据](greenery-v15-verified/acceptance.json) · [v14 店铺与连廊](README-v14.md)

- 行道树改成相连的浅灰分叉树干、细枝与宽幅修剪叶冠；补齐树皮 CC0 颜色、OpenGL 法线和独立粗糙度通道。原始纹理不改，运行时按参考调整颜色，没有噪点纹理。
- 大楼梯旁的围栏花园及双塔水岸前庭使用连续种植带。布置随建筑入口方向和退界旋转，避让楼梯、步行通道与其他室外道具，普通城市也使用同一规则。
- 修正建筑叶冠误用半尺寸、矮灌木叶片稀疏和双面法线翻转；近景细枝连接种植面与叶冠，远景保留相同种植带轮廓。
- 修正精细渲染模型将非实体细枝误收进碰撞的问题。花坛墙体和压顶可碰撞，树干与主枝可承接下落；叶片和灌木细枝不产生空气墙。
- 为可变尺寸叶冠的源几何缓存设置 96 项／32 MiB 上限，超限回收最久未使用的数据；已经合批的场景模型保持有效。

## 检查范围

L11 种子 **20261014**／新游戏种子 **20259573**，1920×1080、DPR 1。高画质真实光照包含 8 个固定视角，额外检查普通种子的双塔和围栏花园。低画质经典光照包含 2 个相同机位。原图观察页共 9 张原图、28 个局部；按原像素放大，没有 AI 补细节。

- **店铺朝向与转角**：两侧玻璃店面共用实体柱网；横招位于柱间、圆形挑牌固定在柱上。 可透视与门前通行已保留，货架和广告细节仍待还原。
- **右前方入口**：宽直梯，两侧扶手、灰墙与围栏花园；种植体不进入踏步。 宽度和完整级数为推定。
- **行道树与街面位置**：树干在路缘内侧；主干分叉，冠幅宽且有修剪轮廓。 树种及精确尺寸不能从照片确认。
- **双塔侧面与顶部连接**：相向蓝色立面属于两栋楼；楼间空间在顶端由实体连廊连接。 底面有板缝；面板比例及连接节点仍有差异。
- **滨水台阶与种植带**：连续挡墙托住绿化，分置台阶两侧；前方岸道开放。 种植带沿立面旋转，实际细枝不阻挡。
- **运河桥、桥墩与岸栏**：真实缓拱、实体桥板和桥墩；岸边石柱间为细金属栏片。 既有 v13 结构回归通过；桥梁细部尚未逐一复刻。

## 验证结果

静态检查采样 3706 栋普通城市建筑，出现全部 29 种参考配方，含 26 段连续滨水种植带；模型库 30 种建筑、103 种装饰。树皮 6 个资产的真实尺寸、MD5 与上游元数据吻合；16 组叶冠几何检查覆盖完整边界、叶片 UV 和缓存。标牌、普通道具的旋转碰撞及摆放检查通过。装饰原型数量未用换色或枝叶变体重复计数。

实机通过树干阻挡／主枝落地、花坛墙体／顶部落地、叶片与细枝非实体、两栋入口及楼梯、店门双向通行、拱桥／桥墩、外梯、岸道和普通世界回归。三次卸载重载通过，几何计数 1804/1804/1804，非角色池纹理 80/80/80，角色池纹理 22/23/26；这些是资源计数，不是显存字节数。高画质运行完成后补上叶冠源几何缓存上限；几何生成算法未改，缓存回收用静态压力检查和低画质／经典光照的三次重载另外验证，后者缓存字节数 5853400/5853400/5853400。

浏览器 **Chrome/155.0.8059.40**，显卡 **ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)**。完整移动采样中位数 8.3ms、P95 16.7ms、最长 229.2ms；采样末绘制调用 354、三角形 2350516。不同运行的驻留场景不同，不将其解释为受控性能对比。运行错误 0；网络日志见 runtime.json。所有 QA 使用真正 --headless=new、独立端口与 profile，已清理，并用只读进程／监听端口检查独立复核。

## 仍待还原

- 照片没有米制尺寸、完整室内平面或连廊内部。树种、分枝数量、柱宽、楼高、后部房间和隐藏细枝均属建模推定，不能称实测复原。
- 店铺商品、海报图案和照明密度、连廊面板比例与金属连接件仍需继续还原；看不清的文字没有擅自补写。
- 树冠形状已调整，但枝叶密度、叶片尺度、剪修边缘仍有差异；长种植带近看还能看出规则分布。
- 当前街道纵深、建筑体量、幕墙反射、铺装与整体光照仍与照片存在明显差距，不能宣布几乎完全一致。其他七张图保留逐项观察记录，尚未全部完成实机对照。
- 本轮低画质／经典光照覆盖两个视角、绿化碰撞、移动与三次重载，未重跑全部室内。移动有长帧，尚未达成所有场景稳定 60 FPS。

## 保留的迭代记录

- [greenery-v15-draft](greenery-v15-draft/runtime.json)：首轮：树冠稀疏、树皮偏棕。
- [greenery-v15-light](greenery-v15-light/runtime.json)：调整树皮与叶片法线；连续绿化尚未修正。
- [greenery-v15-final](greenery-v15-final/runtime.json)：8 个视角与完整通行检查通过，但侧视发现灌木悬空。
- [greenery-v15-grounded](greenery-v15-grounded/runtime.json)：补齐落地细枝后，下落检查暴露精细渲染的碰撞标记问题；该轮失败记录保留。

## 可复跑命令

工作目录 app：

```text
npm run build
npm run check:l11-greenery
npm run check:l11-architecture
npm run check:l11-meshes
npm run check:l11-props
npm run check:l11-collision
node scripts/verify-l11-reference.mjs --label=greenery-v15-verified --case=01,03,14,22,31,32,43,44 --validate=east-stone,quay-east-near --architecture --random-cases=twins,garden --greenery --lifecycle
node scripts/verify-l11-reference.mjs --label=greenery-v15-low-classic --case=01,44 --low --classic --visual-only --greenery --lifecycle
./scripts/check-l11-qa-cleanup.ps1 -Labels 'greenery-v15-verified','greenery-v15-low-classic'
node scripts/inspect-l11-references.mjs
node scripts/build-l11-inspection-report.mjs
node scripts/summarize-l11-greenery.mjs
```

构建仍有既有的大包、字体路径及静态／动态导入提示。资产来源及运行时加工见 [L11-ASSET-SOURCES.md](../../public/textures/L11-ASSET-SOURCES.md)。
