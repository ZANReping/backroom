# DECORATIONS —— 装饰物分类清单

> 由 `app/src/game/content/decorRegistry.ts` 统一注册表生成。修改模型先更新注册定义，再同步本表。尺寸以米计；交互不等同于可搜刮。

## 有碰撞体积（213）

| 名称 | ID | 交互 | 容器 | 生成层级 | 说明 |
|---|---|---|---|---|---|
| 补给箱 | `crate` | ✓ | ✓ | L0、L1、L2、L3、L4、L5、L6、L7、L8、L9、L11、L601 | 全常规层+结局层：infinite/通用散点/mapgenDeep/预制件；L10 仅由专属农舍生成器明确放置 |
| 拱门 | `arch` |  |  | L0 | infinite L0 拱门房变体 |
| 柱子 | `pillar` |  |  | L0、L1、L5、据点101 | infinite L0 柱厅/迷宫、infiniteL1、infiniteL5 主厅红木柱、Alpha 基地；有限 garage 柱网为死代码 |
| 桌子 | `table` |  |  | L0、L1、L2、L4、L5、L7、L9、L11、L601、据点101、据点102、据点103、据点104、据点105、据点106、L274 | 马尼拉室/民居/办公室/酒店/入口小屋/房屋/楼内/图书馆/据点手工 |
| 办公桌 | `desk` |  |  | L1、L2、L4、L11、据点101、据点102、据点103、据点105、据点106 | infiniteL1/L2 房间、L4 办公室+夹层、L11 楼内、据点手工 |
| 保安亭（电源拉杆） | `booth` | ✓ |  | L1 | 仅 mapgen 有限 garage 分支放置——L1 已无限化，当前实际不到达 |
| 储物柜 | `locker` | ✓ | ✓ | L1、L2、L3、L5、L11、L601 | infiniteL1/L2/L3、infiniteL5 健身房储物柜排、mapgenDeep L11 楼内/L601 阅览室 |
| 床 | `bed` |  |  | L1、L2、L4、L5、L9、L274 | infiniteL1/L2 卧室、L4 megoutpost 预制件、infiniteL5 客房、L9 房屋、L274 居住区 |
| 废弃汽车 | `car` | ✓ | ✓ | L1、L9、L11 | infiniteL1 parking 段、mapgenDeep L9/L11；有限 garage 车队为死代码 |
| 复印机 | `copier` |  |  | L1、L4、据点101、据点103、据点106 | infiniteL1 民居段、L4 复印区、Alpha/希波克拉底手工 |
| 工具箱 | `toolbox` | ✓ | ✓ | L1、L3、L10 | infiniteL1/L3 容器掷点（L1 放置为非实心）、L10 谷仓 |
| 拱顶柱 | `vaultcol` |  |  | L1 | infiniteL1 哥特段（可伸连拱板） |
| 脚手架 | `scaffold` |  |  | L1 | infiniteL1 衔尾段 |
| 墨黑色金属门 | `inkdoor` | ✓ |  | L1 | infiniteL1 维护通廊连接门 |
| 施工路障 | `roadblock` |  |  | L1 | infiniteL1 衔尾段 |
| 树篱 | `hedgerow` |  |  | L1、L10 | infiniteL1 花园段、infinite L10 地块分隔 |
| 行李箱 | `suitcase` | ✓ | ✓ | L1、L9、L11 | infiniteL1（非实心放置）、mapgenDeep L9 房屋/L11 楼内 |
| 储物货架 | `binshelf` |  |  | L2、L3、据点101、据点102、据点103、据点104、据点105、据点106、L274 | infiniteL2 储藏房/L3 装配间；据点与 L274 圣器架 |
| 大号台式电脑 | `bigcomputer` |  |  | L2、据点106 | infiniteL2 电脑房 |
| 代墙大型机器 | `machinewall` |  |  | L2 | infiniteL2 墙面段（data.mv 机型） |
| 发电机 | `generator` |  |  | L2、L3 | infiniteL2 机器壁龛/机房、infiniteL3 廊道机器 |
| 锅炉 | `boiler` |  |  | L2、L3、L5、据点101、据点102、据点106 | infiniteL2 锅炉房、infiniteL3 锅炉房、L5 hotelboiler 预制件、据点手工 |
| 客房门 | `hoteldoor` | ✓ |  | L2、L4、L5、L7、L9、L11 | infiniteL2 房间门、L4 办公室门、infiniteL5 客房门（25% 上锁可撬——有限 L5 房门锁机制保留）、L7 门廊尽头舱门（data.l7porch 强制落海）、L9/L11 房屋门 |
| 配电柜 | `cabinet` | ✓ | ✓ | L2、L3、L4、L5 | infiniteL2/L3 壁龛、L4 办公室沿墙与档案夹层（floor=1）、infiniteL5 主厅/维修大厅 |
| 主发电机 | `maingen` |  |  | L2 | infiniteL2 大机房（maingenroom 预制件随 L3 无限化成死代码） |
| M.E.G. 补给箱 | `megcrate` | ✓ | ✓ | L2、L3、L4 | infiniteL2 储藏房、infiniteL3 容器掷点、L4 megoutpost 预制件 |
| 办理终端 | `trade_terminal` | ✓ |  | 据点102、L3 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 保险箱 | `safebox` | ✓ | ✓ | L3 | infiniteL3 容器掷点（需撬棍） |
| 冲压工位 | `pressmachine` |  |  | L3 | infiniteL3 装配线 |
| 电动给水泵 | `feedpump` |  |  | L3 | infiniteL3 锅炉房 |
| 风化的希腊女像 | `statue` | ✓ |  | L3 | infiniteL3 铁栅栏后砖砌区段 |
| 哥特圆柱 | `column` |  |  | L3 | infiniteL3 圣所苍白柱（types 注释的哥特段用法已改由 vaultcol 承担） |
| 晦暗廊道管排 | `l3service` |  |  | L3 | infiniteL3 晦暗廊道管排（实心碰撞，渲染由专用批处理） |
| 母线龙门架 | `busbar` |  |  | L3、L5 | infiniteL3 发电室、infiniteL5 维修大厅 |
| 配电盘柜 | `switchboard` |  |  | L3、据点106 | infiniteL3 发电室 |
| 汽轮发电机组 | `turbinegen` |  |  | L3 | infiniteL3 发电室 |
| 球形黄铜锅炉 | `sphboiler` |  |  | L3、L5 | infiniteL3 锅炉房（2×2 铆接球罐）、infiniteL5 锅炉房机组 |
| 圣所天使像 | `angelstatue` |  |  | L3 | infiniteL3 圣所 |
| 铁栅栏 | `barfence` |  |  | L3 | infiniteL3 封死廊道（不可通行；灰白/黑色涂装变种） |
| 油浸式变压器 | `transformer` |  |  | L3 | infiniteL3 发电室 |
| 有序管架 | `piperack` |  |  | L3、L5 | infiniteL3 锅炉房、infiniteL5 维修大厅/锅炉房管道丛林 |
| 栅栏门 | `bargate` | ✓ |  | L3 | infiniteL3 铁栅栏中的门扇（开/关切实心；灰白/黑色涂装变种） |
| 蒸汽集箱 | `manifold` |  |  | L3、L5 | infiniteL3 锅炉房、infiniteL5 锅炉房集汽包 |
| 装配线传送带 | `conveyor` |  |  | L3 | infiniteL3 装配间 |
| 装配线工作台 | `worktable` |  |  | L3 | infiniteL3 装配间 |
| 办公隔间 | `cubicle` |  |  | L4 | mapgen office 工位矩阵 |
| 半透玻璃窗 | `glasswin` | ✓ |  | L4、L274 | infiniteL4 窗景区整排窗（data.deg 定向 + data.rain 雨痕，窗外 outdoor 虚空，仅观察不可达）；L274 蓝白圣辉彩窗 |
| 服务器机柜 | `server` | ✓ |  | L4 | mapgen office 机房（刷门禁卡进入） |
| 井口护栏（仅碰撞） | `stairrail` |  |  | L4、L5 | v54：oldstairs 古典楼梯井口围合护栏——无模型（可见护栏在出口模型里），structColliders 细条碰撞（侧栏杆+尽头横栏，入梯口留缺）；L4/L5 无限层楼梯出口 |
| 自动售货机 | `vending` | ✓ |  | L4、L11、据点105、据点106 | infiniteL4 办公间区/小房间区墙边（data.trade 免费取用、25% 卡死）、mapgenDeep L11 楼内、EL3A 上层 |
| 白布酒店餐桌 | `l5_dining_set` |  |  | L5 | L5 可复用静态装饰；默认尺寸 2×2×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 包覆管道组 | `l5_insulated_pipe` |  |  | L5 | L5 可复用静态装饰；默认尺寸 2×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 餐桌 | `dtable` |  |  | L5、据点104、据点106 | infiniteL5 餐厅白桌布餐桌阵列；Tom 的餐馆大堂（白桌布圆桌+餐椅） |
| 动感单车 | `spinbike` |  |  | L5 | v55：infiniteL5 健身房 |
| 防滑低跳板 | `l5_pool_board` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 拱形玻璃装饰门 | `l5_arched_window` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×5.775，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 古董条纹沙发 | `l5_antique_sofa` |  |  | L5 | L5 可复用静态装饰；默认尺寸 2×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 柜子 | `dresser` | ✓ | ✓ | L5、L9 | infiniteL5 客房（loot 容器）；mapgenDeep L9 房屋 |
| 红木纹方柱 | `redpillar` |  |  | L5 | v55：infiniteL5 主厅柱阵（红色大理石观感 + 金色柱头/柱础；挑高自适应） |
| 红色白脉石柱 | `l5_marble_column` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×5.775，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 花坛 | `planter` |  |  | L5、据点102、据点103、据点104、据点106、L274 | infiniteL5 主厅盆栽；商场风绿化装饰 |
| 健身卧推凳 | `gymbench` |  |  | L5 | v54：infiniteL5 健身房（凳面+杠铃架+杠铃片组；data.deg 朝向） |
| 酒店木床 | `l5_guest_bed` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×2×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 酒店棕榈盆栽 | `l5_palm` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 兰花三脚圆桌 | `l5_orchid_table` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 老式熔炉 | `l5_furnace` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 老式卧式锅炉 | `l5_horizontal_boiler` |  |  | L5 | L5 可复用静态装饰；默认尺寸 2×3×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 留声机 | `phonograph` |  |  | L5 | v54：infiniteL5 休息室（木柜座+黄铜大喇叭+唱盘；柜类贴墙朝向约定） |
| 跑步机 | `treadmill` |  |  | L5 | v55：infiniteL5 健身房 |
| 熔炉 | `furnace` |  |  | L5 | v55：infiniteL5 锅炉房（砖砌炉体 + 炉膛口微光 + 烟道） |
| 深木书架 | `l5_bookcase` |  |  | L5 | L5 可复用静态装饰；默认尺寸 2×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 深色木门碰撞块（仅碰撞） | `darkdoorblock` |  |  | L5 | v55：infiniteL5 darkwooddoor 出口格——无模型（可见门在出口模型里），整格实心碰撞（关闭时不可穿） |
| 双人沙发 | `sofa` |  |  | L5、据点108 | infiniteL5 主厅/休息室古董沙发（data.color 实例配色；柜类贴墙朝向约定，data.deg 覆盖）；蓝色救赎休息室 |
| 跳台 | `divingboard` |  |  | L5 | v54：infiniteL5 游泳池深水端（短柱+悬挑跳板，板面可站上；data.deg 朝向） |
| 图书馆书架 | `libshelf` |  |  | L5、L601、据点101、据点102、据点103、据点105、据点106 | infiniteL5 主厅书架/橱柜；mapgenDeep L601 书架阵；据点档案架手工 |
| 维护配电柜 | `l5_service_panel` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 哑铃架 | `dumbbellrack` |  |  | L5 | v55：infiniteL5 健身房 |
| 异形小桌 | `oddtable` |  |  | L5 | v55：infiniteL5 贝弗莉室中央（不规则歪腿 + 桌面饮料瓶群 + 未打完的麻将） |
| 饮料麻将桌 | `l5_mahjong_table` |  |  | L5 | L5 可复用静态装饰；默认尺寸 2×2×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 泳池毛巾长凳 | `l5_pool_bench` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 方尖碑 | `obelisk` |  |  | L6 | infiniteL6 地表稀有地标，可阅读模糊刻字 |
| 晶簇 | `crystalcluster` |  |  | L6 | infiniteL6 地表稀有晶簇 |
| 苔原巨石 | `tundrarock` |  |  | L6 | infiniteL6 地表稀疏巨石 |
| 木桶 | `barrel` | ✓ | ✓ | L7 | mapgenDeep L7 海床散点 |
| 书柜 | `bookcase` | ✓ | ✓ | L7 | mapgenDeep L7 入口房间 |
| 洞穴突岩 | `caveboulder` |  |  | L8 | infiniteL8；按生态使用不同真实岩石 PBR |
| 营地摊位 | `campstall` | ✓ | ✓ | L8 | mapgenDeep L8 营地中枢 |
| 钟乳石与石笋 | `stalagspike` |  |  | L8 | infiniteL8；按生态密度生成，分别贴紧洞顶/洞底并带精细碰撞 |
| 冰箱 | `fridge` | ✓ | ✓ | L9、L11 | mapgenDeep L9 房屋/L11 楼内 |
| 电视矮柜 | `l9tvconsole` |  |  | L9 | infiniteL9 住宅客厅，电视置于离地柜体 |
| 郊区住宅透明窗 | `l9window` |  |  | L9 | infiniteL9 一层真实墙洞与透明玻璃 |
| 路灯 | `streetlamp` |  |  | L9、L11 | mapgenDeep L9 街道 / L11 常亮路灯 |
| 信箱 | `mailbox` | ✓ | ✓ | L9 | mapgenDeep L9 房屋门前 |
| 游乐场管道 | `playpipe` |  |  | L9 | mapgenDeep L9 |
| 户外厕所 | `l10outhouse` |  |  | L10 | infinite L10 附属建筑 |
| 田间树列 | `l10tree` |  |  | L10 | infinite L10 地块分隔树列 |
| 压缩干草块 | `l10haybale` |  |  | L10 | infinite L10 贴地生成，使用独立 PBR 干草材质与模型碰撞 |
| 地铁入口 | `subwayent` |  |  | L11 | mapgenDeep L11 |
| 街机柜 | `arcadecab` | ✓ |  | L11 | mapgenDeep L11（任何交互送去 Level 25） |
| 阿谢儿·利沃纪念陈列 | `alpha_memorial` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.2×0.4×1.9，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 半透明玻璃窗与百叶帘 | `alpha_blinds` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.2×0.18×1.45，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 编号值班储物柜 | `alpha_lockers` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.5×0.48×1.85，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 编号纸质档案抽屉柜 | `alpha_archive_bank` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.65×0.62×2.4，档案署模型来自 content/alphaArchiveDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 不锈钢通风操作柜 | `alpha_fumehood` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3.4×0.9×3.65，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 穿孔角钢周转箱货架 | `alpha_rack` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3×0.65×2.4，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 床头柜与台灯 | `alpha_bedside` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.5×0.45×1.12，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 大会厅翻折式扶手座椅 | `alpha_hall_seat` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.72×0.85×1.05，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 大会厅讲台与演示设备 | `alpha_hall_podium` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.2×0.72×1.16，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 大会厅可步行阶梯台 | `alpha_hall_tier` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 18×1.8×0.12，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 档案归还推车 | `alpha_archive_trolley` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.8×0.5×1.1，档案署模型来自 content/alphaArchiveDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 档案检索与阅览台 | `alpha_archive_reader` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.8×0.8×1.05，档案署模型来自 content/alphaArchiveDecor.ts；默认无交互，data.facility=1 时承接档案查询业务；始终非容器 |
| 档案员布面隔断与 L 形工位 | `alpha_archive_cubicle` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3×2.5×1.8，档案署模型来自 content/alphaArchiveDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 档案员软垫转椅 | `alpha_archive_chair` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.65×0.68×1.05，档案署模型来自 content/alphaArchiveDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 多媒体图书馆双面书架 | `alpha_library_shelf` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.4×0.72×2.22，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 分类抽屉样品与器械架 | `alpha_sample_rack` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.4×0.78×2.2，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 分类回收桶组 | `alpha_recycling` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.25×0.43×0.83，社区走廊模型来自 content/alphaCommunityDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 封箱胶带包裹与托盘 | `alpha_parcel_stack` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.45×1.15×1.95，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 缝补台与线轴 | `alpha_mending_table` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.7×0.65×1.05，社区走廊模型来自 content/alphaCommunityDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 公共茶水台与保温壶 | `alpha_tea_cart` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.8×0.58×1.3，社区走廊模型来自 content/alphaCommunityDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 黑色管架会议椅 | `alpha_chair` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.5×0.54×0.86，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 技术支援多屏开发工作台 | `alpha_tech_bench` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3.6×2.2×1.4，档案署模型来自 content/alphaArchiveDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 监督者高背办公椅 | `alpha_executive_chair` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.76×0.78×1.26，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 监督者会客沙发 | `alpha_executive_sofa` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.5×0.9×0.9，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 监督者木制办公桌 | `alpha_executive_desk` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3.2×1.1×1.22，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 监督者书柜与文件边柜 | `alpha_executive_bookcase` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3×0.44×2.4，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 居民餐桌与木椅 | `alpha_home_table` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.3×1.8×0.86，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 居民公共厨房 | `alpha_home_kitchen` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3.8×0.66×2.2，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 居民晾衣架 | `alpha_drying_rack` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.5×0.55×1.65，社区走廊模型来自 content/alphaCommunityDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 居民图书和日用品交换架 | `alpha_swap_shelf` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.6×0.34×1.65，社区走廊模型来自 content/alphaCommunityDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 居民信格与投递箱 | `alpha_postbox` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.5×0.32×1.55，社区走廊模型来自 content/alphaCommunityDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 居民衣柜与日用品 | `alpha_home_wardrobe` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.5×0.56×2.05，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 居民阅读扶手椅 | `alpha_reading_chair` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.86×0.88×0.9，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 菌菇生产压制菌棒 | `alpha_mushroom_block` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.64×0.6×0.74，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 菌菇收获与培养记录台 | `alpha_grow_station` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.4×0.75×1.45，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 扩建板材与施工物料 | `alpha_build_supplies` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.5×0.85×1.2，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 扩建工程围挡 | `alpha_build_barrier` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2×0.32×1.15，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 扩建木工作业台 | `alpha_build_bench` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.2×0.8×1.3，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 蓝灰开放周转箱堆 | `alpha_bins` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.65×0.48×1.1，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 蓝色吊柜研究员工位 | `alpha_office_station` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.6×0.65×2.28，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 贸易中转包裹手推车 | `alpha_parcel_cart` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.1×0.85×1.5，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 贸易中转登记与失物柜台 | `alpha_dispatch_desk` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.2×0.85×1.25，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 贸易中转分拣货架 | `alpha_sorting_rack` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3×0.65×2.4，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 米色层压板课桌 | `alpha_desk` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.8×0.65×0.76，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 模拟无线电机柜与操作台 | `alpha_radio` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 4.8×1.15×2.35，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 木抽屉不锈钢实验台 | `alpha_labbench` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3×0.8×0.94，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 木制双层床与梯子 | `alpha_bunk` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.15×1×2.05，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 墙体窗 | `wallwindow` |  |  | 据点101、据点105、据点106、据点107 | 代替整格内隔墙（下 1/3 墙+中段玻璃+上段接顶；整格 solid；代墙模式同 machinewall） |
| 实验岛台与记录器具 | `alpha_lab_island` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3.6×1.1×0.9，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 双层床 | `bunkbed` |  |  | 据点101、据点102、据点103、据点104、据点106 | 据点民居/员工区手工 |
| 天鹰段混凝土柱与梁 | `alpha_aquila_column` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.85×0.85×3.6，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 停放补给推车 | `alpha_cart` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.85×0.6×0.95，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 图书馆电脑与耳机工作台 | `alpha_library_terminal` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.5×0.75×1.22，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 图书馆借还服务柜台 | `alpha_library_counter` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3×0.85×1.15，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 外勤挂衣与鞋靴架 | `alpha_mudroom` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.8×0.48×1.8，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 无线电操作转椅 | `alpha_swivel` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.6×0.65×1，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 无线电机柜 | `serverrack` |  |  | 据点101、据点102、据点106 | Alpha 中控室、商人之家机房 |
| 洗衣机与折衣台 | `alpha_laundry` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.6×0.7×1.05，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 行囊与换洗衣物 | `alpha_bags` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.7×0.55×0.65，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 行政署不锈钢导流栏 | `alpha_queue_rail` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3×0.2×1.05，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 行政署穿孔金属联排候座 | `alpha_waiting_seats` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3.2×1.15×0.97，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 行政署深木接待前台 | `alpha_reception_counter` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 4.2×2×1.22，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 样品冷藏柜 | `alpha_cold_cabinet` | ✓ |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.35×0.8×2.2，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 饮水与杯具台 | `alpha_water` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.2×0.55×1.5，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 值班单人床 | `alpha_bed` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.1×1×0.6，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 走廊盆栽 | `alpha_planter` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.5×0.5×1.2，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 走廊棋盘与休息桌 | `alpha_rest_table` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.25×0.8×0.76，社区走廊模型来自 content/alphaCommunityDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 走廊休息长椅 | `alpha_bench` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.1×0.55×0.84，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| Alpha 灰泥／木护墙墙段 | `alpha_wall` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3×0.18×2.9，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| Alpha 双扇检查门与返程标识 | `alpha_entry_portal` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.8×0.24×2.65，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 玻璃商品柜 | `trade_showcase` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 打包台 | `trade_pack` | ✓ |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 分类仓储架 | `trade_rack` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 封签验货台 | `trade_seal` | ✓ |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 货运手推车 | `trade_cart` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 交易柜台 | `trade_counter` | ✓ |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 警备检查台 | `trade_security` | ✓ |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 卷帘储藏室门框 | `trade_frame` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 垃圾桶 | `trashbin` |  |  | 据点102、据点103、据点104、据点106 | 商场风装饰 |
| 贸易包柱 | `trade_column` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 贸易玻璃隔断 | `trade_glass` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 贸易墙段 | `trade_wall` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 排队栏杆组 | `trade_queue` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 浅蓝色固定汽车展品 | `trade_car` | ✓ |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 商品壁架 | `trade_goods` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 商铺门面 | `trade_shop` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 商业街拱架 | `trade_arch` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 托盘货组 | `trade_pallet` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 外摆货摊 | `trade_stall` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 物流台秤 | `trade_scale` | ✓ |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 异常货物箱 | `trade_anomaly` | ✓ |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 长椅 | `bench` |  |  | 据点102、据点103、据点104、据点105、据点106、L274 | 商场/候诊/餐厅长椅、EL3A 上层、L274 教堂长凳 |
| 标本罐 | `specimentank` |  |  | 据点103 | 希波克拉底实验室 |
| 病床 | `hospitalbed` |  |  | 据点103、据点106 | 希波克拉底病房 |
| 实验台 | `labbench` |  |  | 据点103 | 希波克拉底实验室（让开门线） |
| 药品柜 | `medcabinet` |  |  | 据点103、据点106 | 希波克拉底药房门（非容器——据点铁律） |
| 厨房料理台 | `kcounter` |  |  | 据点104、据点106、L274 | Tom 的餐馆厨房；L274 祭衣台 |
| 水槽 | `sink` |  |  | 据点104、据点106 | Tom 的餐馆厨房 |
| 卧式冷冻柜 | `freezer` |  |  | 据点104 | Tom 的餐馆冷库（非容器——据点铁律） |
| 灶台 | `stove` |  |  | 据点104 | Tom 的餐馆厨房 |
| 扶手栏杆 | `handrail` |  |  | 据点105、据点106 | EL3A 夹楼边缘/阶梯两侧（细条碰撞盒） |
| 卷帘门 | `rollerdoor` | ✓ |  | 据点105 | EL3A 储藏区门；L1 小巷卷帘门随有限 garage 成死代码 |
| 木托盘堆 | `pallet` |  |  | 据点105 | EL3A 仓库 |
| 立式大电视 | `tvset` |  |  | 据点106 | Gemma 2F 电视娱乐室隔断间（深色机身+底座支脚+微亮屏；data.deg 朝向，缺省柜类贴墙约定） |
| 前台 | `frontdesk` | ✓ |  | 据点106 | Gemma 前台；有限 mapgen hotel 大堂（交易点）随 L5 无限化成死代码 |
| 塔式服务器机箱 | `servercase` |  |  | 据点106 | Gemma 基地 3F 机房沿墙成排（指示灯点阵+顶部散热栅；柜类碰撞约定） |
| 讲坛 | `pulpit` |  |  | L274、据点108 | L274 教堂；蓝色救赎祈祷角 |
| 圣水盆 | `holyfont` |  |  | L274、据点108 | L274 教堂（蓝色圣水微光）；蓝色救赎祈祷角 |
| 杰瑞的栖木 | `perch` |  |  | L274 | L274 大厅中央（鹉主 Entity 7 栖息） |
| 玻璃门 | `glassdoor` | ✓ |  |  | 有限 mapgen hotel 庭院泳池门——L5 已无限化（新 L5 单层无户外庭院），当前实际不到达（死代码） |
| 电梯（保留类型） | `elevator` |  |  |  | 无任何生成器放置（实际载客电梯是 lift） |
| 镜子 | `mirror` |  |  |  | 有限 mapgen hotel 大堂/宴会厅 + beverlyhall 预制件——L5 已无限化，当前实际不到达（死代码） |
| 门（保留类型） | `door` |  |  |  | 无任何生成器放置（仅 mapgen 校验代码引用；L5 structures 列表为死文档） |
| 圆形拱门（保留类型） | `roundarch` |  |  |  | 无任何生成器放置 |

## 无碰撞体积（低模）（168）

| 名称 | ID | 交互 | 容器 | 生成层级 | 说明 |
|---|---|---|---|---|---|
| 吊线荧光灯 | `hanglight` |  |  | L0、L1、L7、据点103 | infinite L0/L1 placeFree；L7 金属舱体吊灯（data.cabin 低垂）；希波克拉底手术区无影灯 |
| 墙上插板 | `socket` |  |  | L0、L1、L2 | infinite L0–L2 placeWallHug |
| 通风口 | `vent` |  |  | L0、L1、L2、L4、L5、L7 | infinite L0–L2 placeWallHug；L4/L5 通用散点 ×3；L7 金属舱体墙面 |
| 涂鸦 | `graffiti` | ✓ |  | L0、L1、L2、L3、L4、L5、L6、L7、L9、L11、L601 | infinite L0–L3 贴墙、mapgen 通用散点 + mapgenDeep 固定点；L8/L10 不生成墙面贴花 |
| 歪斜荧光灯 | `prop:l0_tiltlamp` |  |  | L0 | buildDecorations gen=rooms |
| 荧光灯阵列 | `lightgrid` |  |  | L0、L1、L5、L7 | infinite L0/L1 placeFree、infiniteL5 维修大厅/健身房灯板；mapgenDeep L7 入口房间 |
| M.E.G. 文档 | `megdoc` | ✓ |  | L0、据点101、据点106 | infinite L0 马尼拉室桌上、Alpha 基地档案室 |
| 办公转椅 | `officechair` |  |  | L1、L2、据点101、据点102、据点103、据点105、据点106 | infiniteL1 民居/L2 房间；据点手工 |
| 定居点地标 | `landmark` | ✓ |  | L1、L2 | infiniteL1 各段（alpha/tom/bntg/ariane）、infiniteL2 tidy 段（el3a） |
| 发光蘑菇 | `glowshroom` |  |  | L1、L8 | infiniteL1 花园段、mapgenDeep L8 罗特尼斯大丛林；高大变体实心 |
| 废弃车（纯视觉） | `prop:l1_wreckcar` |  |  | L1 | buildDecorations gen=garage（仅 parking 段） |
| 管道 | `pipes` |  |  | L1、L2、L3、L5、据点101、据点106 | 碰撞视放置点：L2 沿墙/立管段（data.run/wall）实心，贴墙/顶管非实心；L5 由 hotelboiler 预制件 |
| 建材碎料堆 | `debrispile` |  |  | L1、L2、L3、据点105 | infiniteL1 衔尾段、infiniteL2/L3 地面散件、EL3A 仓库 |
| 交通锥 | `prop:l1_cone` |  |  | L1 | buildDecorations gen=garage |
| 尸体 | `corpse` | ✓ | ✓ | L1、L2、L4、L5、L6、L7、L8、L9、L11、L601 | infiniteL1/L2、有限层通用散点、mapgenDeep 各层 |
| 天花通风管 | `ceilvent` |  |  | L1 | infiniteL1（停电时「手臂」由此伸出） |
| 突出墙壁的锈蚀钢筋 | `rebar` |  |  | L1 | infiniteL1（靠近划伤——引擎判定，非 scanInteract 交互） |
| 相片 | `photo` |  |  | L1、据点101、据点102、据点103、据点104、据点105、据点106 | infiniteL1 民居段照片墙；据点墙面装饰 |
| 小麦/大麦丛 | `wheatpatch` |  |  | L1、L10 | infiniteL1 花园段、infinite L10 农田 |
| 保温棉破损碎块 | `prop:l2_insulation` |  |  | L2 | buildDecorations gen=pipes |
| 标语海报 | `megposter` |  |  | L2、L3、据点101、据点102、据点103、据点104、据点105、据点106、L274 | L2 信众宣传海报/L3 天使宗教画；据点各团体海报 |
| 滴水管（含小水洼贴花） | `prop:l2_drippipe` |  |  | L2 | buildDecorations gen=pipes |
| 碎金属堆 | `scrap` |  |  | L2、L3 | infiniteL2/L3 肮脏廊道地面散件 |
| 未涂黑的窗户（陷阱） | `windowtrap` | ✓ |  | L2、L4 | infiniteL2 壁龛窗、L4 scatter/blackwinroom 预制件 |
| 压力表 | `gauge` |  |  | L2、据点101、据点102 | infiniteL2 机房家具；Alpha/商人之家手工布置 |
| 蒸汽阀门 | `valve` | ✓ |  | L2、L3、L5 | infiniteL2/infiniteL3 墙面段；L5 hotelboiler 预制件 |
| 壁挂电气接线罩 | `electricalriser` | ✓ |  | L3 | infiniteL3 照明廊道壁挂电气装饰（纯装饰，可查看，非容器） |
| 彩色玻璃花窗 | `stainedglass` |  |  | L3 | infiniteL3 圣所内腔墙 2~4 扇；data.tex/pw/ph 自定义，跨度校验同大幅画作（v53b） |
| 穿孔电缆桥架 | `cabletray` |  |  | L3、L5 | infiniteL3 顺墙高位、infiniteL5 维修大厅 |
| 大幅画作 | `bigpainting` | ✓ |  | L3 | infiniteL3 ~25% chunk 廊道砖墙；data.tex/pw/ph 自定义贴图与尺寸，放置前校验墙面连续且足够大（v53 艺术品） |
| 倒塌的大理石柱 | `fallencolumn` |  |  | L3 | infiniteL3 圣所瓦砾 |
| 地面排水格栅 | `floordrain` |  |  | L3 | infiniteL3 锅炉房 |
| 电缆沟 | `trench` |  |  | L3 | infiniteL3 发电室/锅炉房地面沟槽 |
| 电缆束沿墙走线 | `prop:l3_cablerun` |  |  | L3 | buildDecorations gen=grid |
| 电缆线束 | `cables` |  |  | L3 | infiniteL3 沿墙顶走线 |
| 吊装长条荧光灯 | `factlamp` |  |  | L3 | infiniteL3 装配间（配套光源 noFix） |
| 高压警示牌 | `warningsign` |  |  | L3、据点106 | infiniteL3 贴墙 |
| 配电箱（壁挂） | `elecbox` | ✓ | ✓ | L3 | infiniteL3 挂墙容器（附近有电流嗡鸣） |
| 闪烁指示灯排 | `prop:l3_indicators` |  |  | L3 | buildDecorations gen=grid |
| 尸鼠陷阱 | `rattrap` |  |  | L3 | infiniteL3 ~9% chunk 地面；踩上触发（data.sprung），v53 高智能尸鼠 |
| 梯子（仅攀爬梯） | `ladder` |  |  | L3、L5 | v54：装饰性生成点全删（通用散点/L5 楼梯间固定/L10 谷仓）——仅存 data.climb 攀爬梯（非实心）：L3 电站维修平台、L5 布草间夹层；结构定义/碰撞保留；v55c：infiniteL5 装饰梯点位改用 foldladder 人字折叠梯 |
| 烛台 | `candlestand` |  |  | L3、L5、L274、据点108 | infiniteL3 圣所、infiniteL5 休息室/餐厅舞台角、L274 教堂（自发光烛火）；蓝色救赎祈祷角/小室 |
| 翻倒的转椅 | `prop:l4_fallenchair` |  |  | L4 | buildDecorations gen=office |
| 涂黑的窗户 | `windowblack` | ✓ |  | L4、L9 | prefabs/scatter L4 贴墙 + blackwinroom 预制件；mapgenDeep L9 房屋 |
| 饮水机 | `prop:l4_watercooler` |  |  | L4 | buildDecorations gen=office |
| 预制件标记（不可见） | `prefabmark` |  |  | L4、L5 | 有限层预制件埋点（可达性校验/冒烟断言用）；L0–L3 预制件为死代码 |
| 载客电梯 | `lift` | ✓ |  | L4 | mapgen office 夹层电梯（轿厢垂直送达上层） |
| 壁灯 | `sconce` |  |  | L5、L601 | infiniteL5 主厅/休息室烛台壁灯；mapgenDeep L601 阅览室 |
| 彩绘木梁 | `l5_ornate_beam` |  |  | L5 | L5 可复用静态装饰；默认尺寸 4×1×5.775，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 古铜烛台吊灯 | `l5_candle_chandelier` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×5.775，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 红边花毯 | `l5_bordered_rug` |  |  | L5 | L5 可复用静态装饰；默认尺寸 4×4×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 弧形塑料休闲椅 | `loungechair` |  |  | L5、据点106 | infiniteL5 客房/休息室（data.color 实例配色）；Gemma 2F 电视娱乐室（一体成型弧面+四细腿） |
| 华丽地毯 | `rug` |  |  | L5 | L5 大厅/房间独立地毯块（CC0 真实织物 PBR，data.tex 红/蓝、data.layer 多层叠放）；走廊直接使用连续世界 UV 地毯地形 |
| 酒店筒灯 | `l5_downlight` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 救生圈与水深牌 | `l5_pool_safety` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 客房服务推车 | `prop:l5_servicecart` |  |  | L5 | buildDecorations gen=hotel |
| 墙面字牌 | `wallsign` |  |  | L5 | v55：infiniteL5（程序贴图：主厅金色房号牌/维修大厅「员工专用」/贝弗莉「Beverly Room」银牌；data.text/gold） |
| 人字折叠梯 | `foldladder` |  |  | L5 | v55：infiniteL5 锅炉房/维修大厅（双侧斜杆+踏板+顶部铰链；纯装饰非攀爬——替代旧装饰 ladder 点位） |
| 双臂电烛台 | `l5_candle_sconce` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 水晶吊灯 | `chandelier` |  |  | L5 | infiniteL5 主厅/贝弗莉室巨吊灯/餐厅吊灯（带光源） |
| 烫金邀请函 | `invitation` | ✓ |  | L5 | v55b：infiniteL5 贝弗莉室地面散落（信封+烫金边+火漆印；可交互——地标链路前往原住民；data.outpost=originals） |
| 维护电梯门面 | `l5_service_lift` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 舞厅巨型吊灯 | `l5_ballroom_chandelier` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×5.775，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 行李车 | `prop:l5_luggagecart` |  |  | L5 | buildDecorations gen=hotel |
| 泳池不锈钢扶梯 | `l5_pool_ladder` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 泳池扶梯 | `poolladder` |  |  | L5 | v54：infiniteL5 游泳池池缘（双弯管扶手+横档；data.deg 朝向） |
| 装饰横梁 | `ceilingbeam` |  |  | L5 | v55：infiniteL5 主厅吊顶格横梁（沿 local X 横跨全厅；贴挑高顶） |
| 走廊尽头花瓶 | `prop:l5_vase` |  |  | L5 | buildDecorations gen=hotel |
| 走廊碗形顶灯 | `l5_bowl_light` |  |  | L5 | L5 可复用静态装饰；默认尺寸 1×1×3.3，模型与材质参考 renderer/l5Meshes.ts；data.l5=1；不参与交互 |
| 被丢弃的手电 | `prop:l6_flashlight` |  |  | L6 | buildDecorations gen=darkhall |
| 恶臭草地 | `stinkgrass` |  |  | L6 | infiniteL6 地表森林间草地 |
| 废弃楼梯井 | `l6stairwell` |  |  | L6 | infiniteL6 地表/地下同坐标双向切层入口 |
| 枯灌木 | `deadshrub` |  |  | L6 | infiniteL6 地表苔原散点 |
| 墙面刻痕/盲文 | `braille` | ✓ |  | L6 | infiniteL6 地下廊道贴墙 |
| 天然洞口 | `l6cave` |  |  | L6 | infiniteL6 地下稀有出口，通往 L8 |
| 锈蚀管道网 | `hotpipe` |  |  | L6 | infiniteL6 地下廊道贴墙；旧 mapgenDeep L6 分支为死代码 |
| 沿墙管道支架 | `prop:l6_pipebracket` |  |  | L6 | buildDecorations gen=darkhall |
| 骨堆 | `bonepile` | ✓ | ✓ | L7、L8 | mapgenDeep L7/L8 散点 |
| 巨鱼骨架 | `fishbones` |  |  | L7 | mapgenDeep L7 |
| 散落骨头 | `prop:l7_bones` |  |  | L7 | buildDecorations gen=ocean |
| 深渊焦油岩堆 | `seatarpit` |  |  | L7 | mapgenDeep L7 |
| 系缆桩（尼龙绳锚点） | `ropeanchor` |  |  | L7 | infiniteL7 门廊入口；data.deployed 持久化，绳索自门廊出口垂至海面，可靠近攀爬 |
| 锈蚀金属碎片 | `prop:l7_rustscrap` |  |  | L7 | buildDecorations gen=ocean |
| 岩石小岛 | `rockisle` |  |  | L7 | mapgenDeep L7 |
| 地下湖侵蚀石岸 | `cavebank` |  |  | L8 | infiniteL8 固定地下湖岸线 |
| 第九大道路标 | `roadsign` | ✓ |  | L8 | infiniteL8 固定路线（每 50 米一块，带 M.E.G. 标志） |
| 洞顶蓝色荧光点群 | `caveglowpoints` |  |  | L8 | infiniteL8 多维之路；GPU 粒子自由漂移并提供极弱生物光 |
| 洞穴苔藓斑 | `cavemoss` |  |  | L8 | infiniteL8 罗特尼斯大丛林泥土地表 |
| 洞穴小型蕨类 | `cavefern` |  |  | L8 | infiniteL8 罗特尼斯大丛林泥土地表 |
| 发光苔藓斑 | `prop:l8_glowmoss` |  |  | L8 | buildDecorations gen=caves |
| 化能合成菌毯 | `fungalmat` |  |  | L8 | infiniteL8 新莫维勒窟开阔洞厅地表 |
| 焦油之手 | `tarhands` |  |  | L8 | mapgenDeep L8 |
| 巨臂林地洞厅天气 | `handweather` |  |  | L8 | infiniteL8 高洞厅；云雾、风雨、雷电与极光 |
| 手形岩刺 | `handspike` | ✓ |  | L8 | mapgenDeep L8 巨臂林地；约 40% 为实心 |
| 碎石堆 | `prop:l8_rubble` |  |  | L8 | buildDecorations gen=caves |
| 溪流微光细菌 | `cavebacteria` |  |  | L8 | infiniteL8 多维之路浅溪；随水面漂移的微光粒子 |
| 血红色发光苔藓 | `bloodmoss` |  |  | L8 | infiniteL8 巨臂林地；地面与洞壁区块合批贴花 |
| 白色栅栏 | `picketfence` |  |  | L9 | mapgenDeep L9 前院 |
| 多方向木路标 | `l9directionsign` |  |  | L9 | infiniteL9 道路旁人行道 |
| 后院菜畦 | `l9vegbed` |  |  | L9 | infiniteL9 现代住宅与连片后院 |
| 后院花盆 | `l9planter` |  |  | L9 | infiniteL9 现代住宅后院 |
| 郊区房屋（标记） | `house` |  |  | L9 | mapgenDeep L9（墙体由瓦片雕刻，内含家具） |
| 街边垃圾桶 | `prop:l9_trashcan` |  |  | L9 | buildDecorations gen=suburb |
| 卡模嵌套房屋 | `clipfuse` | ✓ |  | L9 | mapgenDeep L9 空间异常地标 |
| 邻里守望警告牌 | `l9watchsign` |  |  | L9 | infiniteL9 道路旁人行道 |
| 落叶 | `prop:l9_leaves` |  |  | L9 | buildDecorations gen=suburb |
| 谷仓（标记） | `barn` |  |  | L10 | infiniteL10（墙体由连续地块雕刻，内含工具箱/补给箱） |
| 旧挖掘点 | `l10digsite` |  |  | L10 | infinite L10 可触发土壤涌动事件的地标 |
| 马厩 | `l10stable` |  |  | L10 | infinite L10 农业建筑 |
| 木料 | `prop:l10_timber` |  |  | L10 | buildDecorations gen=field |
| 田间棚屋 | `l10shed` |  |  | L10 | infinite L10 小型空置建筑 |
| M.E.G. 临时作业点 | `l10worksite` |  |  | L10 | infinite L10 临时测量与收割作业点 |
| 店面 | `shopfront` |  |  | L11 | mapgenDeep L11（招牌即传送门线索） |
| 广告柱 | `prop:l11_adpillar` |  |  | L11 | buildDecorations gen=city |
| 黑色镜面窗 | `blackwindow` |  |  | L11 | mapgenDeep L11 楼体外墙 |
| 混凝土楼体（标记） | `towerblock` |  |  | L11 | mapgenDeep L11（墙体由瓦片雕刻） |
| 街道垃圾桶 | `prop:l11_trashcan` |  |  | L11 | buildDecorations gen=city |
| 施工脚手架 | `prop:l11_scaffold` |  |  | L11 | buildDecorations gen=city |
| M.E.G. 标记路牌 | `megsign` | ✓ |  | L11 | mapgenDeep L11（交互同 roadsign 通路） |
| 「家门」 | `homedoor` |  |  | L601 | mapgenDeep L601 假现实入口（出口结构，不走 scanInteract） |
| 金属字母 | `endletters` | ✓ |  | L601 | mapgenDeep L601 中央（the end is near） |
| 摊开在地上的书 | `prop:l601_books` |  |  | L601 | buildDecorations gen=library |
| 阅览灯 | `prop:l601_readlamp` |  |  | L601 | buildDecorations gen=library |
| 办公室空调与除湿机 | `alpha_climate` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.9×0.3×0.48，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 表面安装电线管 | `alpha_conduit` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 4×0.07×0.06，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 大会厅投影幕与教学板 | `alpha_hall_screen` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 6×0.18×3.8，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 档案室激光打印机 | `alpha_archive_printer` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.56×0.56×0.35，档案署模型来自 content/alphaArchiveDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 吊装投影机 | `alpha_projector` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.4×0.35×0.22，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 挂式平板电视 | `walltv` |  |  | 据点101、据点105、据点106、据点107 | mountOnWall 贴墙：黑框+微亮屏幕；据点休息/娱乐区 |
| 黑板与下拉投影幕 | `alpha_board` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 6×0.15×2.7，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 换班与失物招领公告板 | `alpha_notice` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.8×0.075×1.05，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 居民装框风景画 | `alpha_home_frame` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.9×0.055×0.62，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 灭火器与急救壁柜 | `alpha_safety` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.9×0.18×0.85，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 模拟挂钟 | `alpha_clock` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.32×0.045×0.32，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 柔性局部排风臂 | `alpha_extractor` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 2.3×0.5×1.55，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 软木公告栏 | `noticeboard` |  |  | 据点101、据点102、据点103、据点104、据点105、据点106、L274 | 据点墙面装饰（deco 落点校验） |
| 社区手写留言板 | `alpha_community_board` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.9×0.075×1.12，社区走廊模型来自 content/alphaCommunityDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 实验室吊装风管与轨道灯 | `alpha_lab_duct` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 4×0.7×0.65，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 实验室试剂文献壁架 | `alpha_lab_shelf` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3×0.32×1.3，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 通风口格栅 | `ventgrate` |  |  | 据点101、据点103、据点104 | 据点天花板通风口 |
| 投影幕+黑板 | `screenboard` |  |  | 据点101、据点102、据点103、据点106 | 会议室/教室贴墙 |
| 图书馆红色灯带吊楣 | `alpha_library_soffit` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.55×12×0.22，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 显微镜与检测仪 | `alpha_microscope` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 0.8×0.5×0.56，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 行政署灯槽与格井吊顶 | `alpha_admin_cove` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 7.4×9.8×0.55，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 行政署会客区织物地毯 | `alpha_admin_rug` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 6×4×0.025，行政署模型来自 content/alphaAdminDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 荧光灯／暖色吸顶灯 | `alpha_light` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.25×0.3×0.12，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 装框行动地图 | `alpha_map` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.2×0.06×0.9，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 走廊护墙与防撞条 | `alpha_trim` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 3×0.055×1.15，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| Alpha 地面模块 | `alpha_floor` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 4×4×0.12，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| Alpha 吊顶模块 | `alpha_ceiling` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 4×4×0.12，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| Alpha 房间导引牌 | `alpha_sign` |  |  | 据点101 | Alpha 基地可复用静态装饰；默认尺寸 1.5×0.04×0.3，模型与碰撞来自 content/alphaDecor.ts；默认无交互，data.facility=1 时承接现场业务；始终非容器 |
| 报价板 | `trade_prices` | ✓ |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 编号门牌 | `trade_number` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 金属屋面 | `trade_roof` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 据点服务锚点 | `settlementstation` |  |  | 据点102、据点103、据点104 | 服务数据，商人之家附着于注册柜台；Alpha 改由实际家具的 data.facility 承接 |
| 贸易地坪模块 | `trade_floor` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 贸易吊顶 | `trade_ceiling` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 贸易主梁 | `trade_beam` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 设备管线段 | `trade_duct` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 悬挂店招 | `shopsign` |  |  | 据点102、据点104 | 商人之家市场街、Tom 的餐馆前台 |
| 悬挂招牌 | `trade_sign` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 业务灯箱 | `trade_lightbox` |  |  | 据点102 | 可复用贸易构件；模型、碰撞、尺寸与参数见 tradeDecor；静态货物不进入搜刮表 |
| 输液架 | `ivstand` |  |  | 据点103、据点106 | 希波克拉底病房 |
| 壁挂斜照大灯 | `walllamp` |  |  | 据点105 | EL3A 挑高仓库区（灯具模型+fixZ 光源） |
| 教堂穹顶 | `domering` |  |  | L274 | L274 大厅中央（环形肋+拱肋+圣辉盘） |
| 酒店窗 | `hotelwindow` |  |  |  | 有限 mapgen hotel 客房 + guestroom 预制件 + scatter——L5 已无限化，当前实际不到达（死代码） |
| 湿地毯（保留类型） | `wet` |  |  |  | 无结构放置——湿地毯实际是 m.wet 瓦片标记；仅 L0 structures 列表残留 |
| 宴会厅（标记） | `ballroom` |  |  |  | 有限 mapgen hotel 宴会厅标记结构（data 记矩形，无碰撞）——L5 已无限化，当前实际不到达（死代码） |

## 仅贴图贴花（17）

| 名称 | ID | 交互 | 容器 | 生成层级 | 说明 |
|---|---|---|---|---|---|
| 地毯水渍 | `decal:l0_stain` |  |  | L0 | buildDecorations gen=rooms |
| 墙纸剥落补丁 | `decal:l0_peel` |  |  | L0 | buildDecorations gen=rooms |
| 远处假门（贴画） | `decal:l0_fakedoor` |  |  | L0 | buildDecorations gen=rooms |
| 停车编号牌 | `decal:l1_parksign` |  |  | L1 | buildDecorations gen=garage |
| 油渍 | `decal:l1_oil` |  |  | L1 | buildDecorations gen=garage |
| 警示带 | `decal:l2_caution` |  |  | L2 | buildDecorations gen=pipes |
| 压力表盘贴花 | `decal:l2_gaugedial` |  |  | L2 | buildDecorations gen=pipes |
| 警告标识牌 | `decal:l3_warnsign` |  |  | L3 | buildDecorations gen=grid |
| 白板残留字迹 | `decal:l4_whiteboard` |  |  | L4 | buildDecorations gen=office |
| 散落文件纸张 | `decal:l4_papers` |  |  | L4 | buildDecorations gen=office（实例化贴图平面） |
| 油画（含金框边条） | `decal:l5_painting` |  |  | L5 | buildDecorations gen=hotel（画框四边为低模，同一特征） |
| 墙上划痕与手印 | `decal:l6_scratch` |  |  | L6 | buildDecorations gen=darkhall |
| 海床地毯碎片 | `decal:l7_carpet` |  |  | L7 | buildDecorations gen=ocean |
| 湿沥青水洼 | `decal:l9_puddle` |  |  | L9 | buildDecorations gen=suburb |
| 车辙 | `decal:l10_ruts` |  |  | L10 | buildDecorations gen=field |
| 街道标识 | `decal:l11_streetsign` |  |  | L11 | buildDecorations gen=city |
| 图书馆挂画 | `decal:l601_painting` |  |  | L601 | buildDecorations gen=library |

## 商贸构件默认尺寸与参数

模型和复合碰撞均来自 `tradeDecor.ts`；支持独立摆放、设计模式三维预览与旋转。布局存储 `kind/x/y/w/h/data`，尺寸参数 width/depth 对应结构 w/h；高度、安装高度、朝向、颜色、标签和业务参数存入 data。颜色或店号变体不重复计数。静态货物不进入搜刮表；`trade_car` 仅为交易保险库不可驾驶、不可搜刮的固定展品，普通 L1 仍不生成汽车。任务箱以 cargoId 独立管理。

| 名称 | ID | 宽×深×高 | 碰撞 | 交互 |
|---|---|---|---|---|
| 贸易地坪模块 | `trade_floor` | 4×4×0.16 |  |  |
| 贸易墙段 | `trade_wall` | 4×0.2×3.6 | ✓ |  |
| 贸易玻璃隔断 | `trade_glass` | 4×0.12×3 | ✓ |  |
| 贸易包柱 | `trade_column` | 0.6×0.6×4.8 | ✓ |  |
| 贸易主梁 | `trade_beam` | 6×0.4×0.4 |  |  |
| 商业街拱架 | `trade_arch` | 6×0.35×5.2 | ✓ |  |
| 贸易吊顶 | `trade_ceiling` | 4×4×0.2 |  |  |
| 金属屋面 | `trade_roof` | 4×4×0.2 |  |  |
| 设备管线段 | `trade_duct` | 6×0.45×0.35 |  |  |
| 卷帘储藏室门框 | `trade_frame` | 3.2×0.3×2.8 | ✓ |  |
| 交易柜台 | `trade_counter` | 4×0.9×1.1 | ✓ | ✓ |
| 办理终端 | `trade_terminal` | 2×1×1.2 | ✓ | ✓ |
| 排队栏杆组 | `trade_queue` | 3×0.1×1 | ✓ |  |
| 业务灯箱 | `trade_lightbox` | 5×0.15×0.65 |  |  |
| 报价板 | `trade_prices` | 2×0.15×1.3 |  | ✓ |
| 商铺门面 | `trade_shop` | 6×0.3×3.6 | ✓ |  |
| 玻璃商品柜 | `trade_showcase` | 2×1×1.2 | ✓ |  |
| 商品壁架 | `trade_goods` | 2×1×1.2 | ✓ |  |
| 悬挂招牌 | `trade_sign` | 1.1×0.1×2.4 |  |  |
| 外摆货摊 | `trade_stall` | 2×1×1.2 | ✓ |  |
| 物流台秤 | `trade_scale` | 2×1×1.2 | ✓ | ✓ |
| 封签验货台 | `trade_seal` | 2×1×1.2 | ✓ | ✓ |
| 打包台 | `trade_pack` | 2×1×1.2 | ✓ | ✓ |
| 托盘货组 | `trade_pallet` | 2×1×1.2 | ✓ |  |
| 货运手推车 | `trade_cart` | 2×1×1.2 | ✓ |  |
| 分类仓储架 | `trade_rack` | 5×0.9×2.3 | ✓ |  |
| 编号门牌 | `trade_number` | 1×0.08×0.35 |  |  |
| 异常货物箱 | `trade_anomaly` | 2×1×1.2 | ✓ | ✓ |
| 警备检查台 | `trade_security` | 2×1×1.2 | ✓ | ✓ |
| 浅蓝色固定汽车展品 | `trade_car` | 4.5×1.8×1.35 | ✓ | ✓ |

允许参数：width / depth / height / z / deg / color / label / service / cargoId。设施支持 services、faction、room、access；普通未配置设施仅提供查看说明。

## Level 5 酒店构件默认尺寸

25 项构件均支持设计模式预览与旋转；这些静态构件不生成容器或交互记录，游戏原有交互物仍保留。

| 名称 | ID | 宽×深 | 安装高度 | 碰撞 |
|---|---|---|---|---|
| 红色白脉石柱 | `l5_marble_column` | 1×1 | 5.775 | ✓ |
| 彩绘木梁 | `l5_ornate_beam` | 4×1 | 5.775 |  |
| 古铜烛台吊灯 | `l5_candle_chandelier` | 1×1 | 5.775 |  |
| 酒店棕榈盆栽 | `l5_palm` | 1×1 | 3.3 | ✓ |
| 兰花三脚圆桌 | `l5_orchid_table` | 1×1 | 3.3 | ✓ |
| 古董条纹沙发 | `l5_antique_sofa` | 2×1 | 3.3 | ✓ |
| 深木书架 | `l5_bookcase` | 2×1 | 3.3 | ✓ |
| 双臂电烛台 | `l5_candle_sconce` | 1×1 | 3.3 |  |
| 拱形玻璃装饰门 | `l5_arched_window` | 1×1 | 5.775 | ✓ |
| 红边花毯 | `l5_bordered_rug` | 4×4 | 3.3 |  |
| 走廊碗形顶灯 | `l5_bowl_light` | 1×1 | 3.3 |  |
| 酒店筒灯 | `l5_downlight` | 1×1 | 3.3 |  |
| 舞厅巨型吊灯 | `l5_ballroom_chandelier` | 1×1 | 5.775 |  |
| 饮料麻将桌 | `l5_mahjong_table` | 2×2 | 3.3 | ✓ |
| 维护配电柜 | `l5_service_panel` | 1×1 | 3.3 | ✓ |
| 老式卧式锅炉 | `l5_horizontal_boiler` | 2×3 | 3.3 | ✓ |
| 包覆管道组 | `l5_insulated_pipe` | 2×1 | 3.3 | ✓ |
| 老式熔炉 | `l5_furnace` | 1×1 | 3.3 | ✓ |
| 酒店木床 | `l5_guest_bed` | 1×2 | 3.3 | ✓ |
| 白布酒店餐桌 | `l5_dining_set` | 2×2 | 3.3 | ✓ |
| 维护电梯门面 | `l5_service_lift` | 1×1 | 3.3 |  |
| 泳池不锈钢扶梯 | `l5_pool_ladder` | 1×1 | 3.3 |  |
| 防滑低跳板 | `l5_pool_board` | 1×1 | 3.3 | ✓ |
| 泳池毛巾长凳 | `l5_pool_bench` | 1×1 | 3.3 | ✓ |
| 救生圈与水深牌 | `l5_pool_safety` | 1×1 | 3.3 |  |

## Alpha 基地构件默认尺寸

91 项构件中，通用模型来自 `content/alphaDecor.ts`；研究署/入口模型来自 `content/alphaResearchDecor.ts`；档案署模型来自 `content/alphaArchiveDecor.ts`；行政署模型来自 `content/alphaAdminDecor.ts`；居民区模型来自 `content/alphaResidentialDecor.ts`；社区走廊模型来自 `content/alphaCommunityDecor.ts`；支持设计模式预览与旋转，这些静态构件默认不是容器，只有带有 facility 数据的业务家具承接现场业务；档案柜编号遵循“字母通道 + 1 位自底向上层数 + 2 位水平位置”（例如 A124）。

| 名称 | ID | 宽×深 | 安装高度 | 碰撞 |
|---|---|---|---|---|
| 木抽屉不锈钢实验台 | `alpha_labbench` | 3×0.8 | 0.94 | ✓ |
| 不锈钢通风操作柜 | `alpha_fumehood` | 3.4×0.9 | 3.65 | ✓ |
| 实验岛台与记录器具 | `alpha_lab_island` | 3.6×1.1 | 0.9 | ✓ |
| 实验室试剂文献壁架 | `alpha_lab_shelf` | 3×0.32 | 1.3 |  |
| 实验室吊装风管与轨道灯 | `alpha_lab_duct` | 4×0.7 | 0.65 |  |
| 柔性局部排风臂 | `alpha_extractor` | 2.3×0.5 | 1.55 |  |
| 显微镜与检测仪 | `alpha_microscope` | 0.8×0.5 | 0.56 |  |
| 蓝色吊柜研究员工位 | `alpha_office_station` | 1.6×0.65 | 2.28 | ✓ |
| 办公室空调与除湿机 | `alpha_climate` | 0.9×0.3 | 0.48 |  |
| 分类抽屉样品与器械架 | `alpha_sample_rack` | 2.4×0.78 | 2.2 | ✓ |
| 样品冷藏柜 | `alpha_cold_cabinet` | 1.35×0.8 | 2.2 | ✓ |
| Alpha 双扇检查门与返程标识 | `alpha_entry_portal` | 1.8×0.24 | 2.65 | ✓ |
| 档案员布面隔断与 L 形工位 | `alpha_archive_cubicle` | 3×2.5 | 1.8 | ✓ |
| 档案员软垫转椅 | `alpha_archive_chair` | 0.65×0.68 | 1.05 | ✓ |
| 技术支援多屏开发工作台 | `alpha_tech_bench` | 3.6×2.2 | 1.4 | ✓ |
| 编号纸质档案抽屉柜 | `alpha_archive_bank` | 1.65×0.62 | 2.4 | ✓ |
| 档案检索与阅览台 | `alpha_archive_reader` | 1.8×0.8 | 1.05 | ✓ |
| 档案归还推车 | `alpha_archive_trolley` | 0.8×0.5 | 1.1 | ✓ |
| 档案室激光打印机 | `alpha_archive_printer` | 0.56×0.56 | 0.35 |  |
| 行政署深木接待前台 | `alpha_reception_counter` | 4.2×2 | 1.22 | ✓ |
| 行政署穿孔金属联排候座 | `alpha_waiting_seats` | 3.2×1.15 | 0.97 | ✓ |
| 行政署不锈钢导流栏 | `alpha_queue_rail` | 3×0.2 | 1.05 | ✓ |
| 行政署灯槽与格井吊顶 | `alpha_admin_cove` | 7.4×9.8 | 0.55 |  |
| 大会厅翻折式扶手座椅 | `alpha_hall_seat` | 0.72×0.85 | 1.05 | ✓ |
| 大会厅可步行阶梯台 | `alpha_hall_tier` | 18×1.8 | 0.12 | ✓ |
| 大会厅投影幕与教学板 | `alpha_hall_screen` | 6×0.18 | 3.8 |  |
| 大会厅讲台与演示设备 | `alpha_hall_podium` | 1.2×0.72 | 1.16 | ✓ |
| 封箱胶带包裹与托盘 | `alpha_parcel_stack` | 1.45×1.15 | 1.95 | ✓ |
| 贸易中转分拣货架 | `alpha_sorting_rack` | 3×0.65 | 2.4 | ✓ |
| 贸易中转包裹手推车 | `alpha_parcel_cart` | 1.1×0.85 | 1.5 | ✓ |
| 贸易中转登记与失物柜台 | `alpha_dispatch_desk` | 2.2×0.85 | 1.25 | ✓ |
| 监督者木制办公桌 | `alpha_executive_desk` | 3.2×1.1 | 1.22 | ✓ |
| 监督者书柜与文件边柜 | `alpha_executive_bookcase` | 3×0.44 | 2.4 | ✓ |
| 监督者会客沙发 | `alpha_executive_sofa` | 2.5×0.9 | 0.9 | ✓ |
| 监督者高背办公椅 | `alpha_executive_chair` | 0.76×0.78 | 1.26 | ✓ |
| 行政署会客区织物地毯 | `alpha_admin_rug` | 6×4 | 0.025 |  |
| 菌菇生产压制菌棒 | `alpha_mushroom_block` | 0.64×0.6 | 0.74 | ✓ |
| 菌菇收获与培养记录台 | `alpha_grow_station` | 2.4×0.75 | 1.45 | ✓ |
| 多媒体图书馆双面书架 | `alpha_library_shelf` | 2.4×0.72 | 2.22 | ✓ |
| 图书馆电脑与耳机工作台 | `alpha_library_terminal` | 1.5×0.75 | 1.22 | ✓ |
| 图书馆借还服务柜台 | `alpha_library_counter` | 3×0.85 | 1.15 | ✓ |
| 居民阅读扶手椅 | `alpha_reading_chair` | 0.86×0.88 | 0.9 | ✓ |
| 图书馆红色灯带吊楣 | `alpha_library_soffit` | 1.55×12 | 0.22 |  |
| 居民衣柜与日用品 | `alpha_home_wardrobe` | 1.5×0.56 | 2.05 | ✓ |
| 居民公共厨房 | `alpha_home_kitchen` | 3.8×0.66 | 2.2 | ✓ |
| 居民餐桌与木椅 | `alpha_home_table` | 2.3×1.8 | 0.86 | ✓ |
| 洗衣机与折衣台 | `alpha_laundry` | 2.6×0.7 | 1.05 | ✓ |
| 阿谢儿·利沃纪念陈列 | `alpha_memorial` | 2.2×0.4 | 1.9 | ✓ |
| 居民装框风景画 | `alpha_home_frame` | 0.9×0.055 | 0.62 |  |
| 扩建板材与施工物料 | `alpha_build_supplies` | 2.5×0.85 | 1.2 | ✓ |
| 扩建木工作业台 | `alpha_build_bench` | 2.2×0.8 | 1.3 | ✓ |
| 扩建工程围挡 | `alpha_build_barrier` | 2×0.32 | 1.15 | ✓ |
| 天鹰段混凝土柱与梁 | `alpha_aquila_column` | 0.85×0.85 | 3.6 | ✓ |
| 居民信格与投递箱 | `alpha_postbox` | 1.5×0.32 | 1.55 | ✓ |
| 公共茶水台与保温壶 | `alpha_tea_cart` | 1.8×0.58 | 1.3 | ✓ |
| 居民图书和日用品交换架 | `alpha_swap_shelf` | 1.6×0.34 | 1.65 | ✓ |
| 缝补台与线轴 | `alpha_mending_table` | 1.7×0.65 | 1.05 | ✓ |
| 分类回收桶组 | `alpha_recycling` | 1.25×0.43 | 0.83 | ✓ |
| 居民晾衣架 | `alpha_drying_rack` | 1.5×0.55 | 1.65 | ✓ |
| 社区手写留言板 | `alpha_community_board` | 1.9×0.075 | 1.12 |  |
| 走廊棋盘与休息桌 | `alpha_rest_table` | 1.25×0.8 | 0.76 | ✓ |
| Alpha 灰泥／木护墙墙段 | `alpha_wall` | 3×0.18 | 2.9 | ✓ |
| Alpha 地面模块 | `alpha_floor` | 4×4 | 0.12 |  |
| Alpha 吊顶模块 | `alpha_ceiling` | 4×4 | 0.12 |  |
| 模拟无线电机柜与操作台 | `alpha_radio` | 4.8×1.15 | 2.35 | ✓ |
| 黑色管架会议椅 | `alpha_chair` | 0.5×0.54 | 0.86 | ✓ |
| 无线电操作转椅 | `alpha_swivel` | 0.6×0.65 | 1 | ✓ |
| 米色层压板课桌 | `alpha_desk` | 1.8×0.65 | 0.76 | ✓ |
| 黑板与下拉投影幕 | `alpha_board` | 6×0.15 | 2.7 |  |
| 吊装投影机 | `alpha_projector` | 0.4×0.35 | 0.22 |  |
| 穿孔角钢周转箱货架 | `alpha_rack` | 3×0.65 | 2.4 | ✓ |
| 蓝灰开放周转箱堆 | `alpha_bins` | 0.65×0.48 | 1.1 | ✓ |
| 木制双层床与梯子 | `alpha_bunk` | 2.15×1 | 2.05 | ✓ |
| 值班单人床 | `alpha_bed` | 2.1×1 | 0.6 | ✓ |
| 床头柜与台灯 | `alpha_bedside` | 0.5×0.45 | 1.12 | ✓ |
| 行囊与换洗衣物 | `alpha_bags` | 0.7×0.55 | 0.65 | ✓ |
| 荧光灯／暖色吸顶灯 | `alpha_light` | 1.25×0.3 | 0.12 |  |
| 半透明玻璃窗与百叶帘 | `alpha_blinds` | 2.2×0.18 | 1.45 | ✓ |
| 模拟挂钟 | `alpha_clock` | 0.32×0.045 | 0.32 |  |
| 换班与失物招领公告板 | `alpha_notice` | 1.8×0.075 | 1.05 |  |
| 走廊休息长椅 | `alpha_bench` | 2.1×0.55 | 0.84 | ✓ |
| 编号值班储物柜 | `alpha_lockers` | 1.5×0.48 | 1.85 | ✓ |
| 饮水与杯具台 | `alpha_water` | 1.2×0.55 | 1.5 | ✓ |
| 灭火器与急救壁柜 | `alpha_safety` | 0.9×0.18 | 0.85 |  |
| 外勤挂衣与鞋靴架 | `alpha_mudroom` | 1.8×0.48 | 1.8 | ✓ |
| 停放补给推车 | `alpha_cart` | 0.85×0.6 | 0.95 | ✓ |
| 走廊盆栽 | `alpha_planter` | 0.5×0.5 | 1.2 | ✓ |
| 走廊护墙与防撞条 | `alpha_trim` | 3×0.055 | 1.15 |  |
| 装框行动地图 | `alpha_map` | 1.2×0.06 | 0.9 |  |
| Alpha 房间导引牌 | `alpha_sign` | 1.5×0.04 | 0.3 |  |
| 表面安装电线管 | `alpha_conduit` | 4×0.07 | 0.06 |  |

## 统计

- 条目总数 398；可交互 65，容器 17。
- 重建命令：在 app 内运行 `npx esbuild scripts/sync-decorations.ts --bundle --platform=node --format=esm --outfile=.cache/sync-decorations.mjs` 后运行 `node .cache/sync-decorations.mjs`。
