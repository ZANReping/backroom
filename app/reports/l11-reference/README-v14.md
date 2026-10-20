# Level 11 店铺、连廊与滨水细节复核（版本 14）

[原图与实机对照](index.html) · [原像素放大观察](inspection/index.html) · [本轮数据](storefront-v14-final/acceptance.json) · [v12 沿岸体量与步道](README-v12.md) · [v11 文字与方向](README-v11.md)

- 店铺补齐深色落地柱，柱网贯穿首层、上层和两侧转角；入口切开立面后，窗格不再重新起算。模型、旋转碰撞和普通城市使用同一组实体柱。
- 完整 Famima!! 横招落在实际柱间，圆形挑牌的支架固定在柱子上并留出板面距离。保留既有文字与图案，没有重画或补写原图中看不清的海报小字。
- 沿岸新增登记的石柱金属栏杆，包含柱脚、柱身、压顶、横杆和细竖杆；近景、远景和区块加载共用放置规则，普通步行岸道也能生成。
- 拱桥侧面改为绿色中带与上下边带，保留真实桥板厚度、弧度和桥墩；远景补齐朝下的桥底面。
- 保留并复核两栋楼的相向蓝色侧面、真实楼间空隙和楼顶连廊；反向仰视与普通种子双塔均检查，未通过移动相机掩盖结构问题。

## 实际游戏验证

L11 种子 **20261014**，新游戏种子 **20259573**，1920×1080、DPR 1、高画质、真实光照。原相机保持不变，另从店内、反向街角、桥下和普通城市检查结构。9 张原图和 27 个局部放大保留原像素。

| 运行 | 范围 | 结果 |
|---|---|---|
| [canal-v13](canal-v13/runtime.json) | 5 个视角、普通种子石柱栏杆、桥梁、外梯、步道与三次重载 | 通过 |
| [storefront-v14](storefront-v14/runtime.json) | 6 个视角、普通店铺及双塔、38 个房门样本、店门和柱体碰撞、移动与三次重载 | 通过；该轮截图发现文字被柱遮挡，已进一步调整 |
| [storefront-v14-final](storefront-v14-final/runtime.json) | 门头位置修正后的 5 个视角、普通店铺、入口/房门/柱体以及土木通行回归 | 通过 |

普通世界建筑检查采样 3706 栋，29 种参考配方全部出现。水岸检查覆盖 6272 个栏杆模块和 127 个区块样本，非参考种子包含 787 个石柱模块。模型库 30 种建筑、103 种装饰，碰撞与构建通过。最终店铺运行检查 20 个房门样本，实际双向进出街门，突出玻璃面的柱体有碰撞，柱外人行空间可通行。

浏览器 **Chrome/155.0.8059.40**；硬件 **ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)**。每轮均验证 --headless=new，使用独立端口与 profile，运行错误均为 0；网络记录均为本站 favicon.ico 404。三个运行的浏览器、服务器、profile 已清理，各目录的 process-cleanup.json 保存独立进程及端口复查。

移动与重载数据来自门头位置最后微调前的完整 storefront-v14 运行：帧时间中位数 8.3ms、P95 16.9ms、最长 220.8ms；采样末绘制调用 357、三角形 2193814。三次重载几何计数 1817/1817/1817，非角色池纹理 77/77/77，角色池纹理 17/20/23。这些是资源计数，不是显存字节数；不同运行的驻留场景不同，不据此声称性能提升。

## 仍待还原

- 照片没有米制尺寸、完整室内平面和连廊内部。当前柱宽、4m 栏杆模块、楼高、店内货架与后部房间为推定，不能视为实测还原。
- 店铺海报、商品包装、室内照明密度、字体字重与照片仍有差异；横招文字已不被实体柱截断，特定观察角度仍可能被前景树干遮住。
- 运河桥梁目前完成绿色梁侧分带，尚未逐项复刻所有连接件；石柱颜色、栏杆细部、树冠形态、成片绿化、岸线尺度和远处城市密度仍需继续对照。
- 玻璃、铺装、天空与光照尚未达到照片观感。其余七张参考图保留原像素观察记录，不能据这轮两个场景的检查宣称全部还原。
- 本轮实机使用高画质、真实光照；没有重跑低画质和经典光照全套验收。移动仍有长帧，尚未实现全场景稳定 60 FPS。

## 可复跑命令

工作目录 app：

```text
npm run build
npm run check:l11
npm run check:l11-waterways
npm run check:l11-reference
npm run check:l11-architecture
npm run check:l11-meshes
npm run check:l11-collision
node scripts/verify-l11-reference.mjs --label=canal-v13 --case=03,17,40,41,42 --validate=quay-west-annex --architecture --random-cases=stone-quay --lifecycle
node scripts/verify-l11-reference.mjs --label=storefront-v14 --case=01,14,15,30,31,33 --validate=west-piers,quay-east-near --rooms --architecture --random-cases=retail,twins --lifecycle
node scripts/verify-l11-reference.mjs --label=storefront-v14-final --case=01,14,15,30,33 --validate=west-piers --rooms --architecture --random-cases=retail
node scripts/summarize-l11-details.mjs
```

v13 的规划、迁移及任务检查来自 [该轮静态记录](canal-v13/checks.json)；v14 的最终检查见 [checks.json](storefront-v14-final/checks.json)。构建初次在沙箱启动 esbuild 时遇到 EPERM，随后获准运行同一构建命令并成功；保留 v14-build-sandbox.log。构建仍有既有的大包、字体路径与静态/动态导入提示。
