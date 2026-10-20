# Level 11 逐部分观察与结构修正（版本 11）

[原图与实机对照](index.html) · [九张原图／26 个局部放大](inspection/index.html) · [完整运行记录](inspection-runtime/runtime.json) · [最终修正复核](inspection-final/runtime.json) · [本轮检查](inspection/checks.json) · [上一版](README-v10.md)

本轮按原图像素核对位置、朝向、形状和可辨认文字，重点修正 11iconic 的商铺与标牌，以及 11canal 的连廊和右岸入口。原图没有做 AI 增强，裁剪位置和倍率保存在 [notes.json](inspection/notes.json)。对照页支持原像素 100%–500% 缩放、原图切换和拖动查看。

## 本轮修改

- 商铺由一间连续的转角营业厅承接两侧玻璃与门头；增加真实临街入口，货架和收银台避开门口。朝向随建筑旋转，普通城市也使用同一规则。圆牌板面垂直于墙，两面字向一致，圆形碰撞不会产生方形空气墙；雨棚转角补全实体底板和两边檐口，深色涂装保持连续。
- PEGASUS 立牌仍直接贴墙，修正主字、小字及独立数字的阅读方向。Hope 改为信号杆上的蓝白路牌，牌面与灯杆不再互相穿插。原有其他悬挑立牌继续保留为随机装饰。
- 两栋滨水楼保留相向的蓝色侧面和真实楼间空隙，增加红色细横条、细窗框及连廊底面板缝和端部接合。右岸整排大柱廊移除，改为通向楼间入口的宽台阶；示例入口宽 30m、进深 6m、高 1.5m（估计值）。普通城区入口在地块内预留，不挤占公共道路。
- 石材窗台由粗凸台收浅；店铺沿用登记的 CC0 陶瓷地面，放弃原先未经照片支持的强黑白棋盘格。玻璃楼入口移除套用的通用大招牌和小雨棚。照片不能确定的完整室内结构仍标为推定。

四块完整标牌由内置 image_gen 生成，原始输出、提示词与可重跑的裁边／分档处理记录位于 [资产 manifest](../../assets/l11-reference-signs-v2/manifest.json)。没有新增噪点纹理，也没有把生成资产称作 CC0。许可与处理登记见 [L11-ASSET-SOURCES.md](../../public/textures/L11-ASSET-SOURCES.md)。

## 验证

固定 L11 种子 **20261014**（新游戏种子 **20259573**），1920×1080、DPR 1、真实光照与高画质。12 个实机视角、2 个普通种子 42 视角。实际双向走过店铺独立入口、三栋建筑的入口与楼梯，并检查 56 个房门通行样本、缓拱桥和水下桥墩。普通城区店铺入口和带连廊建筑的台阶也经过通行检查。运行错误 0；网络记录 3 条（本次均为 favicon.ico 404），原始状态保留在 JSON。

完整运行之后，针对雨棚拼接和玻璃楼门头的最后修正，另行运行 7 个视角与相关通行检查。页面逐视角标明记录来源；卸载重载与移动性能来自完整运行，不把不同轮次的数据拼成一次测试。

静态检查覆盖 3706 栋建筑、29 种参考配方；全部可在普通种子抽样中出现。室内采样 173 栋、1989 个房间，家具遗漏 0，可达性失败 0。模型库 30 种建筑、102 种装饰，材质／UV／资源释放检查通过。

实际浏览器 Chrome/155.0.8059.40；ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)。命令行验证 --headless=new，使用本次独立端口与配置目录；运行浏览器、服务器和临时 profile 已关闭／清理。移动采样帧时间中位数 16.7ms、P95 37.6ms，最长 379.2ms。三次重载几何计数为 1805/1805/1805，非角色池纹理为 77/77/77；角色纹理池有界增长另列。完整性能见 [acceptance.json](inspection/acceptance.json)，资源计数不等于显存字节数，不能宣称全场景稳定 60 FPS。

## 仍需区分的事实与推定

- 原图未给出米制尺寸、完整室内平面或连廊内部。台阶尺寸、后部空间、店铺货架布局属于可通行的建模推定，不能称为实测还原。
- 标牌保留可辨认的词句和阅读方向，但生成纹理的字体字重、字距仍有差异；被遮挡或分辨率不足的海报小字没有补写。
- 本轮针对 11iconic 和 11canal 修正。其余七张的形状、朝向、文字与细部已录入放大观察页，尚未逐项完成新的模型还原。11lowdensity 的低层高度与此前“不要低矮平房”要求仍有差异，未偷偷改回低层。
- 11exits 上的白色粗描边和方块视作图片标注；11barricade 不作为恢复人类据点或 NPC 的依据。
- 当前画面与照片仍有树形、材质微细节、尺度和光照差异，不能把单一取景相似等同于全部细节还原。稳定 60 FPS 尚未达成。

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
node scripts/verify-l11-reference.mjs --label=inspection-runtime --case=01,03,14,15,16,22,23,29,30,31,32,33 --validate=west-piers,east-stone,quay-east-near --rooms --architecture --random-cases=retail,twins --lifecycle
node scripts/verify-l11-reference.mjs --label=inspection-final --case=01,14,15,22,23,30,33 --validate=west-piers,east-stone --rooms --architecture --random-cases=retail,twins
node scripts/build-l11-inspection-report.mjs
node scripts/check-l11-inspection-report.mjs
node scripts/summarize-l11-inspection.mjs --runtime=inspection-runtime --supplement=inspection-final
```
