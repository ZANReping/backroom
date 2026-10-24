# 商人之家六店与枪械包接入验收（2026-10-23）

目标目录：`E:\ZAN\backroom\app`。来源为用户提供的 `C:\Users\ZANRe\Downloads\backroom-full-shops-guns.zip`，SHA-256 `aa92431ab00cf2b96996bc7e018933f79d2c3f9345736a73907e81239ac34800`。本次以市场 v2 增量合并至当前工程，保留已有银行、手部、近战、无面灵、售货机、窗户及居民待机等改动。联机维持封闭。

## 接入内容

- 北步行街 N02 五金、N04 工装、N07 糖果、N10 文具、N12 户外、N14 兵械库：75 组专用陈设，18 套地/墙/顶 PBR 通道，店内灯具、门头、店主和店员岗位。其他空铺继续预留。
- 五把枪：双管猎枪、杠杆步枪、单动转轮、前装滑膛枪、活门后膛步枪；六种弹药、像素图标、世界模型、双手持握、装填/退壳/击发/贴腮、弹孔与硝烟。N14 提供整盒购买、试射道和纸靶报环。
- 整盒弹药接入当前 BNTG 现金/信用点/混合支付：整盒容量校验先于扣款，不能放下时不扣款。
- 枪身弹仓、选弹、前装进度、转轮位置随具体物品存储，兼容旧档。临时动作、瞄准、特效在新开局/换层清空。
- 原六位联系人保留；糖佬迁至 N07，不复制身份。新增 11 个持久店铺岗位，加原有市场18人及职业居民154人，共189个岗位；附近上限仍为32人。流式区块按原路径分批构建。

## 合并适配与修正

保留当前输入锁、手部/近战动作和居民逻辑，恢复枪械 `buildHeldItem → gunRig` 的专用入口。切枪先归还右手，再解算新握持；失焦/打开界面清除瞄准，触控取消不触发延迟装填。当前 Entity 36 与无面灵年龄命中范围沿用现有规则。第一次跨入禁枪区就拦截击发，避免先消耗一发再收枪。

换弹释放旧部件；飞壳最多16个，弹孔最多90个。换层清空，流式原点变化同步平移特效。实例几何和材质独立释放，程序贴图共享；最终销毁也释放闪光、弹孔模板及手部临时资源。静态枪模型分别为2672/2612/1704/1808/1704三角面。

## 自动检查

| 检查 | 结果 |
|---|---|
| 生产构建 `npm run build` | 通过；保留现有大包体积提示 |
| `check:traders-shops` | 1508项通过；含门口至柜台寻路、物件/人物碰撞和纹理完整性 |
| `check:firearms` | 137项通过；枪弹机制、命中、动画连续性、五种装填、丢拾及保存 |
| `check:firearm-resources` | 25项通过；真实dispose观测、双实例隔离、共享贴图保留及手持入口 |
| `check:bntg-bank` | 通过；现金/信用点/混合购买整盒及容量不足时原子拒绝 |
| `check:traders-keep` | 通过；连通单元106047、岗位189、活动上限32、库房128 |
| `check:item-batches` / `check:texture-images` / `check:model-warmup` | 29 / 96 / 111项通过 |
| `check:traders-market` / `check:market-items` | 749 / 27项通过 |
| `check:melee` / `check:retro-hands` / `check:swim` / `check:refined-items` | 均通过；详见对应日志 |
| `check:traders-fitout` / `check:traders-dressing` | 均通过 |

上述命令的日志保存在本目录；`*-final.log` 为最后一次相关检查，资源检查日志为 `check-firearm-resources.log`。

## 实际游戏流程与截图

使用真正的React游戏入口、Engine、流式渲染和存档，不以原型页代替。两种模式各93项检查通过；每次用独立存储、随机Vite/CDP端口与 `--headless=new` Chrome155，结束后仅回收自己的浏览器/服务器并删除自己的临时配置。控制台错误0、网络资源失败0。

覆盖六店进入/真实E交互/货单、旧存档银行迁移与交易、全部五枪六盒的信用购买（713信用点）、五枪腰射/贴腮/装填/击发、选弹轮盘、失焦清除瞄准、离开试射位或转向自动收枪、回到靶道延迟恢复、真实E拾取保留弹仓、整页读档清除临时动作、触控瞄准与取消、反复射击资源稳定。

| 内容 | 真实模式 | 经典模式 |
|---|---|---|
| 六店入口/柜台/交易 | [全部截图](shops-realistic-final/runtime.json)（20/21/22前缀） | [全部截图](shops-classic-final/runtime.json) |
| 糖果铺 | [入口](shops-realistic-final/20-candy-entrance.png) | [入口](shops-classic-final/20-candy-entrance.png) |
| 文具铺 | [入口](shops-realistic-final/20-office-entrance.png) | [入口](shops-classic-final/20-office-entrance.png) |
| 枪店 | [入口](shops-realistic-final/20-guns-entrance.png) | [入口](shops-classic-final/20-guns-entrance.png) |
| 双管瞄准/装填 | [瞄准](shops-realistic-final/31-dbshotgun-ads.png)、[装填](shops-realistic-final/32-dbshotgun-reload.png) | [瞄准](shops-classic-final/31-dbshotgun-ads.png) |
| 前装 | [装填](shops-realistic-final/32-musket-reload.png) | [装填](shops-classic-final/32-musket-reload.png) |
| 弹药轮盘 | [截图](shops-realistic-final/34-ammo-wheel.png) | [截图](shops-classic-final/34-ammo-wheel.png) |
| 触控模拟 | [844×390](shops-realistic-final/36-touch-controls.png) | [844×390](shops-classic-final/36-touch-controls.png) |

已检查以上实景及五枪动作截图。柜台与武器动作缩略对照见 [六店柜台](shop-counters-contact.jpg)、[五枪动作](gun-actions-contact.jpg)，完整原尺寸图均在各模式目录。早期 `shops-realistic` 及开发日志保留失败定位记录，以 `*-final/runtime.json` 为最终结果。

## 五轮固定场景数据

设备：RTX4060 Laptop（由WebGL实际返回GPU字符串确认）、1920×1080、原生渲染比例、动态分辨率/动态曝光关闭、纹理质量1、场景灯上限16、阴影质量1。种子424242，Level102，试射位 `(335.6,32.95,0)`，朝向近靶；每轮预热后取90个rAF帧间隔，五轮。开发者God/属性锁与冻结敌对AI用于复现；附近NPC为8名。下表是这一固定取景的无头浏览器帧间隔，不是全部场景或Android真机性能结论。

| 模式/轮次 | 中位ms | P95 ms | 绘制调用 | 三角面 | 几何/贴图 |
|---|---:|---:|---:|---:|---|
| 真实/1 | 4.20 | 6.10 | 163 | 98769 | 1130/128 |
| 真实/2 | 4.50 | 7.60 | 163 | 98769 | 1130/128 |
| 真实/3 | 4.40 | 6.70 | 163 | 98769 | 1130/128 |
| 真实/4 | 4.20 | 6.10 | 163 | 98769 | 1130/128 |
| 真实/5 | 4.20 | 8.70 | 163 | 98769 | 1130/128 |
| 经典/1 | 4.20 | 4.70 | 148 | 98311 | 1123/90 |
| 经典/2 | 4.10 | 4.60 | 148 | 98311 | 1123/90 |
| 经典/3 | 4.10 | 4.80 | 148 | 98311 | 1123/90 |
| 经典/4 | 4.10 | 4.70 | 148 | 98311 | 1123/90 |
| 经典/5 | 4.20 | 4.70 | 148 | 98311 | 1123/90 |

连续三轮（每轮三次装填/击发）清理临时特效后，真实模式稳定为1130几何/128贴图，经典为1123/90；飞壳、弹孔、烟雾均归零。两模式另通过12轮ATM开关后的资源稳定检查。

银行取景也保留五轮原始数据：真实模式中位9.2–16.2ms、P95 16.5–24.8ms；经典中位4.1–4.5ms、P95 5.6–6.4ms。真实模式银行取景部分P95超过20ms，没有把试射道通过当作全据点达到20ms。未建立本次导入前同场景的严格帧时间基线，因此不声称性能提升或无回退。

## 素材及复现限制

54张店铺PBR JPEG共5,010,433字节，颜色1024²、法线512²、粗糙度512²；其余22张图（标牌/图标等）也核对源字节与可解码性。审计见 [店铺贴图](asset-audit.md)、[其他图像](asset-extra-audit.md)、[原始导入清单](import-manifest.json) 和 [最终文件哈希](final-files.json)。

素材作者/AI来源来自包内声明，记录于 `public/textures/traders/shops/SOURCES.md` 与 `SIGNS-SOURCES.md`。没有重新生成用户贴图。包内未提供AI原始PNG及独立许可文件，因此不能复原原始生成过程或推定额外授权。处理脚本改为显式源/输出目录；缺图时在写入前失败，完整交付图可直接使用。

触控验证是桌面浏览器模拟，未测试Android真机。纸靶、实体机制、保存/拾取均有检查；没有做全部实体逐种人工实战或全据点32人最重画面的性能认证。

## 复现命令

```powershell
cd E:\ZAN\backroom\app
npm run check:traders-shops
npm run check:firearms
npm run check:firearm-resources
npm run check:bntg-bank
npm run check:traders-keep
npm run check:item-batches
npm run check:texture-images
npm run check:model-warmup
npm run build
npm run verify:shops-guns -- --label=shops-realistic-final
npm run verify:shops-guns -- --classic --label=shops-classic-final
```

真实游戏操作：在商人之家北街六家店主前按E交易；N14购买枪弹后移至西侧长凳后的试射位，朝纸靶取枪。左键击发、右键按住瞄准、R轻按装填/长按选弹、Alt收起。测试脚本为适配无头指针锁，用现有自定义键位接口把攻击临时绑K、瞄准绑B，仅写入该测试配置；不修改玩家日常键位。
