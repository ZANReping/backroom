# Ferren、遗物与前厅接入（2026-10-23）

已接入原项目 E:\ZAN\backroom，保留现有商店、枪械、手部、实体和地图改动；未修改 GitHub 副本、app-lite 或联机实现。

- 管道蠕虫停止自然生成：统一 naturalSpawn 策略拦截旧缓存，L2 生成器保留装饰管道及随机数步进。实体定义、旧档和开发者手动召唤保留。
- Ferren：商人之家（102）唯一一只貂色雪貂，12 段模型动画、20 分钟作息、摸摸／训练打扰／盖被子与短程切行。X 或触屏情境按钮；快速点按锁存，不必按住。作息和被子记入存档。
- 九件遗物补充模型：acidcallus、ashpile、jerryflyer、fakelog、sedgland、bento、curabiturgel、curabiturspore、curabiturrepellent。颜色／OpenGL 法线／粗糙度图集、五张缺失像素图标及生成脚本已接入；市场物品与枪械工厂保留。
- 序章“前厅”（900）：首次新开局进入家中；完成后默认从 L0 开始，设置“启用前厅”可重玩。包含可操作家具、电脑新闻／论坛、手机／独立电量／拍照／笔记、HUD 教程、夜间街区、回程异常及现实破碎过场；随后在 L0 找回随身物品。
- 前厅门／抽屉姿态与碰撞随档恢复；坠落队列可保存并只结算一次，未带个人手电时保留 L0 保底手电。兼容缺省无前厅字段的旧档。没携带可选背包时不永久锁死库存 HUD。

## 附件与来源

| 附件 | SHA256 |
| --- | --- |
| ferren-full.zip | DDCFC44127E057BCCDD81BCD0D52B94A0E20B9E06C494BC6C6BD1E47AEDAFC93 |
| items-relic.zip | 0F8B58451E79C1840471BD8AC29AF168B3C233F480228CA43362B2F5B6268BC6 |
| 前厅-序章-完整包.zip | B897DC89D63BD249BBC4A070E231BB004D77F86EF3C135620FF94CAF9CDDA3A6 |

均来自用户指定的 C:/Users/ZANRe/Downloads。导入时备份既有文件，Ferren／Relic 按补丁重建共同基线三方合并；前厅包未实际附带 README 提到的 patch，以完整源码对照共同历史备份逐项合并。附件原有验收报告未当作本项目的验收结果。逐文件来源与最终哈希见 [import-audit.json](reports/ferren-relic-foyer-20261023/import-audit.json)。

设定改编依据 [Entity 92 — Ferren](https://backrooms-wiki-cn.wikidot.com/entity-92)：原作者 **noah rabe**，译者 **Pedder**，[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。其 Wikidot 配图 Ferret_2008.png 的作者 Alfredo Gutiérrez，许可 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)，[原图](https://commons.wikimedia.org/wiki/File:Ferret_2008.png)仅作资料参考，本轮未复制照片到游戏资产。

前厅 13 套 PBR 为 Poly Haven 扫描资产，[CC0 1.0](https://polyhaven.com/license)；逐项作者、原链接、本地文件、尺寸、ORM 打包及色调修改见 [素材登记](public/textures/foyer/FOYER-ASSET-SOURCES.md)。保留 prepare-foyer-textures.py。Relic 图集由附件中的 gen-refined-item-atlas.mjs 程序绘制，保留 OpenGL 法线、粗糙度与边缘扩展；未复制外部照片，不另行给附件代码指定新许可。

## 验收与复现

实际游戏双光影验收、截图、五轮原生 GPU 数据及未覆盖范围见 [验收报告](reports/ferren-relic-foyer-20261023/README.md)。

~~~text
npm run check:ferren
npm run check:refined-items
npm run check:ferren-foyer-integration
npm run check:pipeworm-disabled
npm run verify:ferren-foyer -- --skip --perf --label=my-realistic
npm run verify:ferren-foyer -- --classic --perf --touch --label=my-classic
npm run build
~~~

验收脚本自建端口、Chrome 配置与内存存档，以 --headless=new 和本机硬件 GPU 运行；结束时只关闭自身进程。--touch 为桌面触控模拟，不代表 Android 真机性能。
