# DECORATIONS —— 装饰物分类清单（v53）

> 由 `app/src/game/content/decorRegistry.ts` 统一注册表生成，内容以注册表为准。
> 纯文档：改动装饰物请先更新注册表，再同步本表。分类定义：
> **有碰撞体积**（solid 结构）/ **无碰撞体积（低模）**（非实心结构 + 渲染侧道具）/ **仅贴图贴花**；
> 「交互」「容器」为附加标记——容器必然同时可交互（一个装饰物可兼具多标记）。
> 生成层级按生成器实际摆放审计（infinite L0–L3 / mapgen+mapgenDeep L4–L11·L601 / mapgenOutpost 据点 101–105·L274），
> 排序：组内按最小生成层级在前，同层级按中文名。

## 有碰撞体积（95）

_structures.ts 低模 + solid=true，进 structColliders 真实阻挡_

| 名称 | id | 交互 | 容器 | 生成层级 |
|---|---|---|---|---|
| 补给箱 | `crate` | ✓ | ✓ | L0、L1、L2、L3、L4、L5、L6、L7、L8、L9、L10、L11、L601 |
| 拱门 | `arch` |  |  | L0 |
| 柱子 | `pillar` |  |  | L0、L1、L5、据点101 |
| 桌子 | `table` |  |  | L0、L1、L2、L4、L5、L7、L9、L11、L601、据点101、据点102、据点103、据点104、据点105、据点106、L274 |
| 办公桌 | `desk` |  |  | L1、L2、L4、L11、据点101、据点102、据点103、据点105、据点106 |
| 保安亭（电源拉杆） | `booth` | ✓ |  | L1 |
| 储物柜 | `locker` | ✓ | ✓ | L1、L2、L3、L5、L11、L601 |
| 床 | `bed` |  |  | L1、L2、L4、L5、L9、L274 |
| 废弃汽车 | `car` | ✓ | ✓ | L1、L9、L11 |
| 复印机 | `copier` |  |  | L1、L4、据点101、据点103、据点106 |
| 工具箱 | `toolbox` | ✓ | ✓ | L1、L3、L10 |
| 拱顶柱 | `vaultcol` |  |  | L1 |
| 脚手架 | `scaffold` |  |  | L1 |
| 墨黑色金属门 | `inkdoor` | ✓ |  | L1 |
| 施工路障 | `roadblock` |  |  | L1 |
| 树篱 | `hedgerow` |  |  | L1、L10 |
| 行李箱 | `suitcase` | ✓ | ✓ | L1、L9、L11 |
| 储物货架 | `binshelf` |  |  | L2、L3、据点101、据点102、据点103、据点104、据点105、据点106、L274 |
| 大号台式电脑 | `bigcomputer` |  |  | L2、据点106 |
| 代墙大型机器 | `machinewall` |  |  | L2 |
| 发电机 | `generator` |  |  | L2、L3 |
| 锅炉 | `boiler` |  |  | L2、L3、L5、据点101、据点102、据点106 |
| 客房门 | `hoteldoor` | ✓ |  | L2、L4、L5、L7、L9、L11 |
| 配电柜 | `cabinet` | ✓ | ✓ | L2、L3、L4、L5 |
| 主发电机 | `maingen` |  |  | L2 |
| M.E.G. 补给箱 | `megcrate` | ✓ | ✓ | L2、L3、L4 |
| 保险箱 | `safebox` | ✓ | ✓ | L3 |
| 冲压工位 | `pressmachine` |  |  | L3 |
| 电动给水泵 | `feedpump` |  |  | L3 |
| 风化的希腊女像 | `statue` | ✓ |  | L3 |
| 哥特圆柱 | `column` |  |  | L3 |
| 母线龙门架 | `busbar` |  |  | L3、L5 |
| 配电盘柜 | `switchboard` |  |  | L3、据点106 |
| 汽轮发电机组 | `turbinegen` |  |  | L3 |
| 球形黄铜锅炉 | `sphboiler` |  |  | L3、L5 |
| 圣所天使像 | `angelstatue` |  |  | L3 |
| 铁栅栏 | `barfence` |  |  | L3 |
| 油浸式变压器 | `transformer` |  |  | L3 |
| 有序管架 | `piperack` |  |  | L3、L5 |
| 栅栏门 | `bargate` | ✓ |  | L3 |
| 蒸汽集箱 | `manifold` |  |  | L3、L5 |
| 装配线传送带 | `conveyor` |  |  | L3 |
| 装配线工作台 | `worktable` |  |  | L3 |
| 办公隔间 | `cubicle` |  |  | L4 |
| 半透玻璃窗 | `glasswin` | ✓ |  | L4、L274 |
| 服务器机柜 | `server` | ✓ |  | L4 |
| 梯子 | `ladder` |  |  | L4、L5、L6、L7、L8、L9、L10、L11、L601 |
| 自动售货机 | `vending` | ✓ |  | L4、L11、据点105、据点106 |
| 玻璃门 | `glassdoor` | ✓ |  | —（未生成） |
| 柜子 | `dresser` | ✓ | ✓ | L5、L9 |
| 镜子 | `mirror` |  |  | —（未生成） |
| 前台 | `frontdesk` | ✓ |  | 据点106 |
| 跳台 | `divingboard` |  |  | L5 |
| 健身卧推凳 | `gymbench` |  |  | L5 |
| 留声机 | `phonograph` |  |  | L5 |
| 深色木门碰撞块 | `darkdoorblock` |  |  | L5 |
| 红木纹方柱 | `redpillar` |  |  | L5 |
| 异形小桌 | `oddtable` |  |  | L5 |
| 熔炉 | `furnace` |  |  | L5 |
| 跑步机 | `treadmill` |  |  | L5 |
| 哑铃架 | `dumbbellrack` |  |  | L5 |
| 动感单车 | `spinbike` |  |  | L5 |
| 木桶 | `barrel` | ✓ | ✓ | L7 |
| 书柜 | `bookcase` | ✓ | ✓ | L7 |
| 营地摊位 | `campstall` | ✓ | ✓ | L8 |
| 冰箱 | `fridge` | ✓ | ✓ | L9、L11 |
| 路灯 | `streetlamp` |  |  | L9、L11 |
| 信箱 | `mailbox` | ✓ | ✓ | L9 |
| 游乐场管道 | `playpipe` |  |  | L9 |
| 地铁入口 | `subwayent` |  |  | L11 |
| 街机柜 | `arcadecab` | ✓ |  | L11 |
| 图书馆书架 | `libshelf` |  |  | L5、L601、据点101、据点102、据点103、据点105、据点106 |
| 双层床 | `bunkbed` |  |  | 据点101、据点102、据点103、据点104、据点106 |
| 无线电机柜 | `serverrack` |  |  | 据点101、据点102、据点106 |
| 花坛 | `planter` |  |  | L5、据点102、据点103、据点104、据点106、L274 |
| 垃圾桶 | `trashbin` |  |  | 据点102、据点103、据点104、据点106 |
| 长椅 | `bench` |  |  | 据点102、据点103、据点104、据点105、据点106、L274 |
| 标本罐 | `specimentank` |  |  | 据点103 |
| 病床 | `hospitalbed` |  |  | 据点103、据点106 |
| 实验台 | `labbench` |  |  | 据点103 |
| 药品柜 | `medcabinet` |  |  | 据点103、据点106 |
| 餐桌 | `dtable` |  |  | L5、据点104、据点106 |
| 厨房料理台 | `kcounter` |  |  | 据点104、据点106、L274 |
| 水槽 | `sink` |  |  | 据点104、据点106 |
| 卧式冷冻柜 | `freezer` |  |  | 据点104 |
| 灶台 | `stove` |  |  | 据点104 |
| 扶手栏杆 | `handrail` |  |  | 据点105、据点106 |
| 双人沙发 | `sofa` |  |  | L5、据点108 |
| 塔式服务器机箱 | `servercase` |  |  | 据点106 |
| 墙体窗 | `wallwindow` |  |  | 据点101、据点105、据点106、据点107 |
| 立式大电视 | `tvset` |  |  | 据点106 |
| 弧形塑料休闲椅 | `loungechair` |  |  | L5、据点106 |
| 卷帘门 | `rollerdoor` | ✓ |  | 据点105 |
| 木托盘堆 | `pallet` |  |  | 据点105 |
| 讲坛 | `pulpit` |  |  | 据点108、L274 |
| 杰瑞的栖木 | `perch` |  |  | L274 |
| 圣水盆 | `holyfont` |  |  | 据点108、L274 |
| 电梯（保留类型） | `elevator` |  |  | —（未生成） |
| 门（保留类型） | `door` |  |  | —（未生成） |
| 圆形拱门（保留类型） | `roundarch` |  |  | —（未生成） |

## 无碰撞体积（低模）（104）

_m.structures solid=false 结构 + renderer/decorations/props.ts 道具（prop:*）_

| 名称 | id | 交互 | 容器 | 生成层级 |
|---|---|---|---|---|
| 吊线荧光灯 | `hanglight` |  |  | L0、L1、L7、据点103 |
| 墙上插板 | `socket` |  |  | L0、L1、L2 |
| 通风口 | `vent` |  |  | L0、L1、L2、L4、L5、L7 |
| 涂鸦 | `graffiti` | ✓ |  | L0、L1、L2、L3、L4、L5、L6、L7、L8、L9、L10、L11、L601 |
| 歪斜荧光灯 | `prop:l0_tiltlamp` |  |  | L0 |
| 荧光灯阵列 | `lightgrid` |  |  | L0、L1、L5、L7 |
| M.E.G. 文档 | `megdoc` | ✓ |  | L0、据点101、据点106 |
| 办公转椅 | `officechair` |  |  | L1、L2、据点101、据点102、据点103、据点105、据点106 |
| 定居点地标 | `landmark` | ✓ |  | L1、L2 |
| 发光蘑菇 | `glowshroom` |  |  | L1、L8 |
| 废弃车（纯视觉） | `prop:l1_wreckcar` |  |  | L1 |
| 管道 | `pipes` |  |  | L1、L2、L3、L5、据点101、据点106 |
| 建材碎料堆 | `debrispile` |  |  | L1、L2、L3、据点105 |
| 交通锥 | `prop:l1_cone` |  |  | L1 |
| 尸体 | `corpse` | ✓ | ✓ | L1、L2、L4、L5、L6、L7、L8、L9、L10、L11、L601 |
| 天花通风管 | `ceilvent` |  |  | L1 |
| 突出墙壁的锈蚀钢筋 | `rebar` |  |  | L1 |
| 相片 | `photo` |  |  | L1、据点101、据点102、据点103、据点104、据点105、据点106 |
| 小麦/大麦丛 | `wheatpatch` |  |  | L1、L10 |
| 保温棉破损碎块 | `prop:l2_insulation` |  |  | L2 |
| 标语海报 | `megposter` |  |  | L2、L3、据点101、据点102、据点103、据点104、据点105、据点106、L274 |
| 滴水管（含小水洼贴花） | `prop:l2_drippipe` |  |  | L2 |
| 碎金属堆 | `scrap` |  |  | L2、L3 |
| 未涂黑的窗户（陷阱） | `windowtrap` | ✓ |  | L2、L4 |
| 压力表 | `gauge` |  |  | L2、据点101、据点102 |
| 蒸汽阀门 | `valve` | ✓ |  | L2、L3、L5 |
| 穿孔电缆桥架 | `cabletray` |  |  | L3、L5 |
| 倒塌的大理石柱 | `fallencolumn` |  |  | L3 |
| 地面排水格栅 | `floordrain` |  |  | L3 |
| 电缆沟 | `trench` |  |  | L3 |
| 电缆束沿墙走线 | `prop:l3_cablerun` |  |  | L3 |
| 电缆线束 | `cables` |  |  | L3 |
| 吊装长条荧光灯 | `factlamp` |  |  | L3 |
| 高压警示牌 | `warningsign` |  |  | L3、据点106 |
| 配电箱（壁挂） | `elecbox` | ✓ | ✓ | L3 |
| 闪烁指示灯排 | `prop:l3_indicators` |  |  | L3 |
| 烛台 | `candlestand` |  |  | L3、L5、据点108、L274 |
| 尸鼠陷阱 | `rattrap` |  |  | L3 |
| 大幅画作 | `bigpainting` |  |  | L3 |
| 彩色玻璃花窗 | `stainedglass` |  |  | L3 |
| 翻倒的转椅 | `prop:l4_fallenchair` |  |  | L4 |
| 涂黑的窗户 | `windowblack` | ✓ |  | L4、L9 |
| 饮水机 | `prop:l4_watercooler` |  |  | L4 |
| 预制件标记（不可见） | `prefabmark` |  |  | L4、L5 |
| 载客电梯 | `lift` | ✓ |  | L4 |
| 壁灯 | `sconce` |  |  | L5、L601 |
| 泳池扶梯 | `poolladder` |  |  | L5 |
| 华丽地毯 | `rug` |  |  | L5 |
| 装饰横梁 | `ceilingbeam` |  |  | L5 |
| 墙面字牌 | `wallsign` |  |  | L5 |
| 人字折叠梯 | `foldladder` |  |  | L5 |
| 烫金邀请函 | `invitation` | ✓ |  | L5 |
| 酒店窗 | `hotelwindow` |  |  | —（未生成） |
| 客房服务推车 | `prop:l5_servicecart` |  |  | L5 |
| 水晶吊灯 | `chandelier` |  |  | L5 |
| 行李车 | `prop:l5_luggagecart` |  |  | L5 |
| 宴会厅（标记） | `ballroom` |  |  | —（未生成） |
| 走廊尽头花瓶 | `prop:l5_vase` |  |  | L5 |
| 绊线 | `tripwire` |  |  | L6 |
| 被丢弃的手电 | `prop:l6_flashlight` |  |  | L6 |
| 电灯开关 | `lightswitch` | ✓ |  | L6 |
| 墙面刻痕/盲文 | `braille` | ✓ |  | L6 |
| 热管道 | `hotpipe` |  |  | L6 |
| 沿墙管道支架 | `prop:l6_pipebracket` |  |  | L6 |
| 骨堆 | `bonepile` | ✓ | ✓ | L7、L8 |
| 巨鱼骨架 | `fishbones` |  |  | L7 |
| 散落骨头 | `prop:l7_bones` |  |  | L7 |
| 深渊焦油岩堆 | `seatarpit` |  |  | L7 |
| 系缆桩（尼龙绳锚点） | `ropeanchor` | ✓ |  | L7 |
| 锈蚀金属碎片 | `prop:l7_rustscrap` |  |  | L7 |
| 岩石小岛 | `rockisle` |  |  | L7 |
| 第九之路路标 | `roadsign` | ✓ |  | L8 |
| 发光苔藓斑 | `prop:l8_glowmoss` |  |  | L8 |
| 焦油之手 | `tarhands` |  |  | L8 |
| 手形岩刺 | `handspike` | ✓ |  | L8 |
| 碎石堆 | `prop:l8_rubble` |  |  | L8 |
| 岩刺 | `stalagspike` |  |  | L8 |
| 白色栅栏 | `picketfence` |  |  | L9 |
| 郊区房屋（标记） | `house` |  |  | L9 |
| 街边垃圾桶 | `prop:l9_trashcan` |  |  | L9 |
| 卡模嵌套房屋 | `clipfuse` | ✓ |  | L9 |
| 落叶 | `prop:l9_leaves` |  |  | L9 |
| 干草堆 | `prop:l10_hay` |  |  | L10 |
| 谷仓（标记） | `barn` |  |  | L10 |
| 木料 | `prop:l10_timber` |  |  | L10 |
| 油菜地块 | `canolaplot` |  |  | L10 |
| 店面 | `shopfront` |  |  | L11 |
| 广告柱 | `prop:l11_adpillar` |  |  | L11 |
| 黑色镜面窗 | `blackwindow` |  |  | L11 |
| 混凝土楼体（标记） | `towerblock` |  |  | L11 |
| 街道垃圾桶 | `prop:l11_trashcan` |  |  | L11 |
| 施工脚手架 | `prop:l11_scaffold` |  |  | L11 |
| M.E.G. 标记路牌 | `megsign` | ✓ |  | L11 |
| 「家门」 | `homedoor` |  |  | L601 |
| 金属字母 | `endletters` | ✓ |  | L601 |
| 摊开在地上的书 | `prop:l601_books` |  |  | L601 |
| 阅览灯 | `prop:l601_readlamp` |  |  | L601 |
| 软木公告栏 | `noticeboard` |  |  | 据点101、据点102、据点103、据点104、据点105、据点106、L274 |
| 通风口格栅 | `ventgrate` |  |  | 据点101、据点103、据点104 |
| 投影幕+黑板 | `screenboard` |  |  | 据点101、据点102、据点103、据点106 |
| 悬挂店招 | `shopsign` |  |  | 据点102、据点104 |
| 输液架 | `ivstand` |  |  | 据点103、据点106 |
| 壁挂斜照大灯 | `walllamp` |  |  | 据点105 |
| 挂式平板电视 | `walltv` |  |  | 据点101、据点105、据点106、据点107 |
| 教堂穹顶 | `domering` |  |  | L274 |
| 湿地毯（保留类型） | `wet` |  |  | —（未生成） |

## 仅贴图贴花（19）

_renderer/decorations/decals.ts 贴墙/地面平面（decal:*），无几何体积_

| 名称 | id | 交互 | 容器 | 生成层级 |
|---|---|---|---|---|
| 地毯水渍 | `decal:l0_stain` |  |  | L0 |
| 墙纸剥落补丁 | `decal:l0_peel` |  |  | L0 |
| 远处假门（贴画） | `decal:l0_fakedoor` |  |  | L0 |
| 停车编号牌 | `decal:l1_parksign` |  |  | L1 |
| 油渍 | `decal:l1_oil` |  |  | L1 |
| 警示带 | `decal:l2_caution` |  |  | L2 |
| 压力表盘贴花 | `decal:l2_gaugedial` |  |  | L2 |
| 警告标识牌 | `decal:l3_warnsign` |  |  | L3 |
| 白板残留字迹 | `decal:l4_whiteboard` |  |  | L4 |
| 散落文件纸张 | `decal:l4_papers` |  |  | L4 |
| 油画（含金框边条） | `decal:l5_painting` |  |  | L5 |
| 墙上划痕与手印 | `decal:l6_scratch` |  |  | L6 |
| 海床地毯碎片 | `decal:l7_carpet` |  |  | L7 |
| 风化旧路标贴画 | `decal:l8_roadsign` |  |  | L8 |
| 岩壁风化痕 | `decal:l8_rockwear` |  |  | L8 |
| 湿沥青水洼 | `decal:l9_puddle` |  |  | L9 |
| 车辙 | `decal:l10_ruts` |  |  | L10 |
| 街道标识 | `decal:l11_streetsign` |  |  | L11 |
| 图书馆挂画 | `decal:l601_painting` |  |  | L601 |

## 统计

- 条目总数 218：结构类 172 / 贴花 19 / 低模道具 27
- 可交互 43（其中容器 17）
