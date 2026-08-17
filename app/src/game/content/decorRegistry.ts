// v53：装饰物统一注册表（只读聚合，不改任何现有系统行为）。
// 覆盖三类装饰物：
//   solid    有碰撞体积的结构（structures.ts 低模 + solid=true，进 structColliders）
//   nonsolid 无碰撞体积的结构/低模道具（m.structures solid=false，或 renderer/decorations/props.ts 道具）
//   decal    仅贴图贴花（renderer/decorations/decals.ts，贴墙/地面平面）
// 附加标记：container=可搜索容器（聚合 decorations/containers.ts 的 CONTAINERS）；
//   interactive=scanInteract 可交互（聚合 decorations/lore.ts 的 DECOR_VIEWS + engine 交互 case）。
// 生成层级按生成器实际摆放审计填写（依据写在各条 note；labels 见 DECOR_LEVEL_ORDER）：
//   infinite.ts(L0) / infiniteL1.ts(L1) / infiniteL2.ts(L2) / infiniteL3.ts(L3) / infiniteL4.ts(L4，v54) /
//   infiniteL5.ts(L5) / infiniteL6.ts(L6) / mapgen.ts + mapgenDeep.ts + prefabs/(L7–L11/L601) /
//   mapgenOutpost.ts(据点 101–109 与 L274)。
// 注意：LevelDef.structures 列表目前无任何消费者（纯文档，与生成器可能脱节），本表以生成器代码为准；
//   L0–L6 已无限化（def.infinite），mapgen 的旧有限分支及 mapgenDeep L6 分支为死代码。
import { CONTAINERS } from '../decorations/containers'
import { DECOR_VIEWS } from '../decorations/lore'

export type DecorCategory = 'solid' | 'nonsolid' | 'decal'

// 层级标签的规范排序（DECORATIONS.md 组内排序用）：L0–L11 → L601 → 据点 101–108 → L274
export const DECOR_LEVEL_ORDER: readonly string[] = [
  'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11',
  'L601', '据点101', '据点102', '据点103', '据点104', '据点105', '据点106', '据点107', '据点108', 'L274',
]

export interface DecorEntry {
  id: string // StructKind，或渲染侧贴花/道具 id（decal:*/prop:*）
  name: string // 中文名
  cat: DecorCategory
  container: boolean // 可搜索容器（CONTAINERS 登记；容器必然同时可交互）
  interactive: boolean // scanInteract 可交互（查看/开关门/交易/机关等）
  levels: readonly string[] // 生成的层级（取 DECOR_LEVEL_ORDER 标签；空数组=类型保留但当前不生成）
  note?: string // 审计依据 / 混用说明
}

// engine scanInteract 中既非容器也不在 DECOR_VIEWS 的可交互 kind（门/机关/交易点等）
const INTERACT_EXTRA: ReadonlySet<string> = new Set([
  'lift', 'lightswitch', 'megsign', 'arcadecab',
  'hoteldoor', 'rollerdoor', 'glassdoor', 'inkdoor', 'bargate',
  'windowtrap', 'megdoc', 'landmark', 'invitation', 'valve', 'booth', 'server', 'vending', 'frontdesk',
])

type RawEntry = Omit<DecorEntry, 'container' | 'interactive'>
const S = (id: string, name: string, cat: DecorCategory, levels: readonly string[], note?: string): RawEntry =>
  ({ id, name, cat, levels, note })

// ---------- 结构类装饰物（StructKind；建模在 renderer/structures.ts）----------
const RAW: RawEntry[] = [
  // ===== 通用 / L0–L5 =====
  S('pillar', '柱子', 'solid', ['L0', 'L1', 'L5', '据点101'], 'infinite L0 柱厅/迷宫、infiniteL1、infiniteL5 主厅红木柱、Alpha 基地；有限 garage 柱网为死代码'),
  S('car', '废弃汽车', 'solid', ['L1', 'L9', 'L11'], 'infiniteL1 parking 段、mapgenDeep L9/L11；有限 garage 车队为死代码'),
  S('booth', '保安亭（电源拉杆）', 'solid', ['L1'], '仅 mapgen 有限 garage 分支放置——L1 已无限化，当前实际不到达'),
  S('pipes', '管道', 'nonsolid', ['L1', 'L2', 'L3', 'L5', '据点101', '据点106'], '碰撞视放置点：L2 沿墙/立管段（data.run/wall）实心，贴墙/顶管非实心；L5 由 hotelboiler 预制件'),
  S('valve', '蒸汽阀门', 'nonsolid', ['L2', 'L3', 'L5'], 'infiniteL2/infiniteL3 墙面段；L5 hotelboiler 预制件'),
  S('gauge', '压力表', 'nonsolid', ['L2', '据点101', '据点102'], 'infiniteL2 机房家具；Alpha/商人之家手工布置'),
  S('boiler', '锅炉', 'solid', ['L2', 'L3', 'L5', '据点101', '据点102', '据点106'], 'infiniteL2 锅炉房、infiniteL3 锅炉房、L5 hotelboiler 预制件、据点手工'),
  S('generator', '发电机', 'solid', ['L2', 'L3'], 'infiniteL2 机器壁龛/机房、infiniteL3 廊道机器'),
  S('cabinet', '配电柜', 'solid', ['L2', 'L3', 'L4', 'L5'], 'infiniteL2/L3 壁龛、L4 办公室沿墙与档案夹层（floor=1）、infiniteL5 主厅/维修大厅'),
  S('trench', '电缆沟', 'nonsolid', ['L3'], 'infiniteL3 发电室/锅炉房地面沟槽'),
  S('cubicle', '办公隔间', 'solid', ['L4'], 'mapgen office 工位矩阵'),
  S('copier', '复印机', 'solid', ['L1', 'L4', '据点101', '据点103', '据点106'], 'infiniteL1 民居段、L4 复印区、Alpha/希波克拉底手工'),
  S('server', '服务器机柜', 'solid', ['L4'], 'mapgen office 机房（刷门禁卡进入）'),
  S('vending', '自动售货机', 'solid', ['L4', 'L11', '据点105', '据点106'], 'infiniteL4 办公间区/小房间区墙边（data.trade 免费取用、25% 卡死）、mapgenDeep L11 楼内、EL3A 上层'),
  S('desk', '办公桌', 'solid', ['L1', 'L2', 'L4', 'L11', '据点101', '据点102', '据点103', '据点105', '据点106'], 'infiniteL1/L2 房间、L4 办公室+夹层、L11 楼内、据点手工'),
  S('door', '门（保留类型）', 'solid', [], '无任何生成器放置（仅 mapgen 校验代码引用；L5 structures 列表为死文档）'),
  S('ballroom', '宴会厅（标记）', 'nonsolid', [], '有限 mapgen hotel 宴会厅标记结构（data 记矩形，无碰撞）——L5 已无限化，当前实际不到达（死代码）'),
  S('lightgrid', '荧光灯阵列', 'nonsolid', ['L0', 'L1', 'L5', 'L7'], 'infinite L0/L1 placeFree、infiniteL5 维修大厅/健身房灯板；mapgenDeep L7 入口房间'),
  S('wet', '湿地毯（保留类型）', 'nonsolid', [], '无结构放置——湿地毯实际是 m.wet 瓦片标记；仅 L0 structures 列表残留'),
  S('graffiti', '涂鸦', 'nonsolid', ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L601'], 'infinite L0–L3 贴墙、mapgen 通用散点（有限层 8/5 处）+ mapgenDeep 固定点'),
  S('crate', '补给箱', 'solid', ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L601'], '全常规层+结局层：infinite/通用散点/mapgenDeep/预制件；据点铁律不放 loot 容器'),
  S('corpse', '尸体', 'nonsolid', ['L1', 'L2', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L601'], 'infiniteL1/L2、有限层通用散点、mapgenDeep 各层'),
  S('ladder', '梯子（仅攀爬梯）', 'nonsolid', ['L3', 'L5'], 'v54：装饰性生成点全删（通用散点/L5 楼梯间固定/L10 谷仓）——仅存 data.climb 攀爬梯（非实心）：L3 电站维修平台、L5 布草间夹层；结构定义/碰撞保留；v55c：infiniteL5 装饰梯点位改用 foldladder 人字折叠梯'),
  S('stairrail', '井口护栏（仅碰撞）', 'solid', ['L4', 'L5'], 'v54：oldstairs 古典楼梯井口围合护栏——无模型（可见护栏在出口模型里），structColliders 细条碰撞（侧栏杆+尽头横栏，入梯口留缺）；L4/L5 无限层楼梯出口'),
  S('vent', '通风口', 'nonsolid', ['L0', 'L1', 'L2', 'L4', 'L5', 'L7'], 'infinite L0–L2 placeWallHug；L4/L5 通用散点 ×3；L7 金属舱体墙面'),
  S('mirror', '镜子', 'solid', [], '有限 mapgen hotel 大堂/宴会厅 + beverlyhall 预制件——L5 已无限化，当前实际不到达（死代码）'),
  S('elevator', '电梯（保留类型）', 'solid', [], '无任何生成器放置（实际载客电梯是 lift）'),
  S('frontdesk', '前台', 'solid', ['据点106'], 'Gemma 前台；有限 mapgen hotel 大堂（交易点）随 L5 无限化成死代码'),
  S('bed', '床', 'solid', ['L1', 'L2', 'L4', 'L5', 'L9', 'L274'], 'infiniteL1/L2 卧室、L4 megoutpost 预制件、infiniteL5 客房、L9 房屋、L274 居住区'),
  S('sconce', '壁灯', 'nonsolid', ['L5', 'L601'], 'infiniteL5 主厅/休息室烛台壁灯；mapgenDeep L601 阅览室'),
  S('socket', '墙上插板', 'nonsolid', ['L0', 'L1', 'L2'], 'infinite L0–L2 placeWallHug'),
  S('rebar', '突出墙壁的锈蚀钢筋', 'nonsolid', ['L1'], 'infiniteL1（靠近划伤——引擎判定，非 scanInteract 交互）'),
  S('hoteldoor', '客房门', 'solid', ['L2', 'L4', 'L5', 'L7', 'L9', 'L11'], 'infiniteL2 房间门、L4 办公室门、infiniteL5 客房门（25% 上锁可撬——有限 L5 房门锁机制保留）、L7 门廊尽头舱门（data.l7porch 强制落海）、L9/L11 房屋门'),
  S('windowblack', '涂黑的窗户', 'nonsolid', ['L4', 'L9'], 'prefabs/scatter L4 贴墙 + blackwinroom 预制件；mapgenDeep L9 房屋'),
  S('windowtrap', '未涂黑的窗户（陷阱）', 'nonsolid', ['L2', 'L4'], 'infiniteL2 壁龛窗、L4 scatter/blackwinroom 预制件'),
  S('hotelwindow', '酒店窗', 'nonsolid', [], '有限 mapgen hotel 客房 + guestroom 预制件 + scatter——L5 已无限化，当前实际不到达（死代码）'),
  S('table', '桌子', 'solid', ['L0', 'L1', 'L2', 'L4', 'L5', 'L7', 'L9', 'L11', 'L601', '据点101', '据点102', '据点103', '据点104', '据点105', '据点106', 'L274'], '马尼拉室/民居/办公室/酒店/入口小屋/房屋/楼内/图书馆/据点手工'),
  S('chandelier', '水晶吊灯', 'nonsolid', ['L5'], 'infiniteL5 主厅/贝弗莉室巨吊灯/餐厅吊灯（带光源）'),
  S('hanglight', '吊线荧光灯', 'nonsolid', ['L0', 'L1', 'L7', '据点103'], 'infinite L0/L1 placeFree；L7 金属舱体吊灯（data.cabin 低垂）；希波克拉底手术区无影灯'),
  S('dresser', '柜子', 'solid', ['L5', 'L9'], 'infiniteL5 客房（loot 容器）；mapgenDeep L9 房屋'),
  S('arch', '拱门', 'solid', ['L0'], 'infinite L0 拱门房变体'),
  S('maingen', '主发电机', 'solid', ['L2'], 'infiniteL2 大机房（maingenroom 预制件随 L3 无限化成死代码）'),
  S('megcrate', 'M.E.G. 补给箱', 'solid', ['L2', 'L3', 'L4'], 'infiniteL2 储藏房、infiniteL3 容器掷点、L4 megoutpost 预制件'),
  S('prefabmark', '预制件标记（不可见）', 'nonsolid', ['L4', 'L5'], '有限层预制件埋点（可达性校验/冒烟断言用）；L0–L3 预制件为死代码'),
  S('glasswin', '半透玻璃窗', 'solid', ['L4', 'L274'], 'infiniteL4 窗景区整排窗（data.deg 定向 + data.rain 雨痕，窗外 outdoor 虚空，仅观察不可达）；L274 蓝白圣辉彩窗'),
  S('rollerdoor', '卷帘门', 'solid', ['据点105'], 'EL3A 储藏区门；L1 小巷卷帘门随有限 garage 成死代码'),
  S('glassdoor', '玻璃门', 'solid', [], '有限 mapgen hotel 庭院泳池门——L5 已无限化（新 L5 单层无户外庭院），当前实际不到达（死代码）'),
  S('lift', '载客电梯', 'nonsolid', ['L4'], 'mapgen office 夹层电梯（轿厢垂直送达上层）'),
  // ===== L6–L11 / L601 =====
  S('hotpipe', '锈蚀管道网', 'nonsolid', ['L6'], 'infiniteL6 地下廊道贴墙；旧 mapgenDeep L6 分支为死代码'),
  S('braille', '墙面刻痕/盲文', 'nonsolid', ['L6'], 'infiniteL6 地下廊道贴墙'),
  S('deadshrub', '枯灌木', 'nonsolid', ['L6'], 'infiniteL6 地表苔原散点'),
  S('tundrarock', '苔原巨石', 'solid', ['L6'], 'infiniteL6 地表稀疏巨石'),
  S('crystalcluster', '晶簇', 'solid', ['L6'], 'infiniteL6 地表稀有晶簇'),
  S('stinkgrass', '恶臭草地', 'nonsolid', ['L6'], 'infiniteL6 地表森林间草地'),
  S('obelisk', '方尖碑', 'solid', ['L6'], 'infiniteL6 地表稀有地标，可阅读模糊刻字'),
  S('l6stairwell', '废弃楼梯井', 'nonsolid', ['L6'], 'infiniteL6 地表/地下同坐标双向切层入口'),
  S('l6cave', '天然洞口', 'nonsolid', ['L6'], 'infiniteL6 地下稀有出口，通往 L8'),
  S('bookcase', '书柜', 'solid', ['L7'], 'mapgenDeep L7 入口房间'),
  S('barrel', '木桶', 'solid', ['L7'], 'mapgenDeep L7 海床散点'),
  S('rockisle', '岩石小岛', 'nonsolid', ['L7'], 'mapgenDeep L7'),
  S('bonepile', '骨堆', 'nonsolid', ['L7', 'L8'], 'mapgenDeep L7/L8 散点'),
  S('fishbones', '巨鱼骨架', 'nonsolid', ['L7'], 'mapgenDeep L7'),
  S('seatarpit', '深渊焦油岩堆', 'nonsolid', ['L7'], 'mapgenDeep L7'),
  S('ropeanchor', '系缆桩（尼龙绳锚点）', 'nonsolid', ['L7'], 'infiniteL7 门廊入口；data.deployed 持久化，绳索自门廊出口垂至海面，可靠近攀爬'),
  S('stalagspike', '岩刺', 'nonsolid', ['L8'], 'mapgenDeep L8；空地放置约 35% 为实心'),
  S('handspike', '手形岩刺', 'nonsolid', ['L8'], 'mapgenDeep L8 Handyland；约 40% 为实心'),
  S('glowshroom', '发光蘑菇', 'nonsolid', ['L1', 'L8'], 'infiniteL1 花园段、mapgenDeep L8 Rottnest Jungle；高大变体实心'),
  S('tarhands', '焦油之手', 'nonsolid', ['L8'], 'mapgenDeep L8'),
  S('roadsign', '第九之路路标', 'nonsolid', ['L8'], 'mapgenDeep L8（带 M.E.G. 标志）'),
  S('campstall', '营地摊位', 'solid', ['L8'], 'mapgenDeep L8 营地中枢'),
  S('house', '郊区房屋（标记）', 'nonsolid', ['L9'], 'mapgenDeep L9（墙体由瓦片雕刻，内含家具）'),
  S('streetlamp', '路灯', 'solid', ['L9', 'L11'], 'mapgenDeep L9 街道 / L11 常亮路灯'),
  S('mailbox', '信箱', 'solid', ['L9'], 'mapgenDeep L9 房屋门前'),
  S('picketfence', '白色栅栏', 'nonsolid', ['L9'], 'mapgenDeep L9 前院'),
  S('clipfuse', '卡模嵌套房屋', 'nonsolid', ['L9'], 'mapgenDeep L9 空间异常地标'),
  S('playpipe', '游乐场管道', 'solid', ['L9'], 'mapgenDeep L9'),
  S('wheatpatch', '小麦/大麦丛', 'nonsolid', ['L1', 'L10'], 'infiniteL1 花园段、mapgenDeep L10 农田'),
  S('hedgerow', '树篱', 'solid', ['L1', 'L10'], 'infiniteL1 花园段、mapgenDeep L10 地块分隔'),
  S('barn', '谷仓（标记）', 'nonsolid', ['L10'], 'mapgenDeep L10（墙体由瓦片雕刻，内含工具箱/补给箱）'),
  S('canolaplot', '油菜地块', 'nonsolid', ['L10'], 'mapgenDeep L10（出口提示地标）'),
  S('towerblock', '混凝土楼体（标记）', 'nonsolid', ['L11'], 'mapgenDeep L11（墙体由瓦片雕刻）'),
  S('blackwindow', '黑色镜面窗', 'nonsolid', ['L11'], 'mapgenDeep L11 楼体外墙'),
  S('shopfront', '店面', 'nonsolid', ['L11'], 'mapgenDeep L11（招牌即传送门线索）'),
  S('subwayent', '地铁入口', 'solid', ['L11'], 'mapgenDeep L11'),
  S('arcadecab', '街机柜', 'solid', ['L11'], 'mapgenDeep L11（任何交互送去 Level 25）'),
  S('megsign', 'M.E.G. 标记路牌', 'nonsolid', ['L11'], 'mapgenDeep L11（交互同 roadsign 通路）'),
  S('libshelf', '图书馆书架', 'solid', ['L5', 'L601', '据点101', '据点102', '据点103', '据点105', '据点106'], 'infiniteL5 主厅书架/橱柜；mapgenDeep L601 书架阵；据点档案架手工'),
  S('endletters', '金属字母', 'nonsolid', ['L601'], 'mapgenDeep L601 中央（the end is near）'),
  S('homedoor', '「家门」', 'nonsolid', ['L601'], 'mapgenDeep L601 假现实入口（出口结构，不走 scanInteract）'),
  // ===== 通用容器 =====
  S('locker', '储物柜', 'solid', ['L1', 'L2', 'L3', 'L5', 'L11', 'L601'], 'infiniteL1/L2/L3、infiniteL5 健身房储物柜排、mapgenDeep L11 楼内/L601 阅览室'),
  S('toolbox', '工具箱', 'solid', ['L1', 'L3', 'L10'], 'infiniteL1/L3 容器掷点（L1 放置为非实心）、L10 谷仓'),
  S('suitcase', '行李箱', 'solid', ['L1', 'L9', 'L11'], 'infiniteL1（非实心放置）、mapgenDeep L9 房屋/L11 楼内'),
  S('fridge', '冰箱', 'solid', ['L9', 'L11'], 'mapgenDeep L9 房屋/L11 楼内'),
  S('safebox', '保险箱', 'solid', ['L3'], 'infiniteL3 容器掷点（需撬棍）'),
  // ===== L1 区段 / L2 / L3 无限化 =====
  S('column', '哥特圆柱', 'solid', ['L3'], 'infiniteL3 圣所苍白柱（types 注释的哥特段用法已改由 vaultcol 承担）'),
  S('roundarch', '圆形拱门（保留类型）', 'solid', [], '无任何生成器放置'),
  S('vaultcol', '拱顶柱', 'solid', ['L1'], 'infiniteL1 哥特段（可伸连拱板）'),
  S('scaffold', '脚手架', 'solid', ['L1'], 'infiniteL1 衔尾段'),
  S('roadblock', '施工路障', 'solid', ['L1'], 'infiniteL1 衔尾段'),
  S('debrispile', '建材碎料堆', 'nonsolid', ['L1', 'L2', 'L3', '据点105'], 'infiniteL1 衔尾段、infiniteL2/L3 地面散件、EL3A 仓库'),
  S('inkdoor', '墨黑色金属门', 'solid', ['L1'], 'infiniteL1 维护通廊连接门'),
  S('megdoc', 'M.E.G. 文档', 'nonsolid', ['L0', '据点101', '据点106'], 'infinite L0 马尼拉室桌上、Alpha 基地档案室'),
  S('ceilvent', '天花通风管', 'nonsolid', ['L1'], 'infiniteL1（停电时「手臂」由此伸出）'),
  S('landmark', '定居点地标', 'nonsolid', ['L1', 'L2'], 'infiniteL1 各段（alpha/tom/bntg/ariane）、infiniteL2 tidy 段（el3a）'),
  // ===== 据点家具 =====
  S('serverrack', '无线电机柜', 'solid', ['据点101', '据点102', '据点106'], 'Alpha 中控室、商人之家机房'),
  S('officechair', '办公转椅', 'nonsolid', ['L1', 'L2', '据点101', '据点102', '据点103', '据点105', '据点106'], 'infiniteL1 民居/L2 房间；据点手工'),
  S('binshelf', '储物货架', 'solid', ['L2', 'L3', '据点101', '据点102', '据点103', '据点104', '据点105', '据点106', 'L274'], 'infiniteL2 储藏房/L3 装配间；据点与 L274 圣器架'),
  S('bunkbed', '双层床', 'solid', ['据点101', '据点102', '据点103', '据点104', '据点106'], '据点民居/员工区手工'),
  S('screenboard', '投影幕+黑板', 'nonsolid', ['据点101', '据点102', '据点103', '据点106'], '会议室/教室贴墙'),
  S('noticeboard', '软木公告栏', 'nonsolid', ['据点101', '据点102', '据点103', '据点104', '据点105', '据点106', 'L274'], '据点墙面装饰（deco 落点校验）'),
  S('megposter', '标语海报', 'nonsolid', ['L2', 'L3', '据点101', '据点102', '据点103', '据点104', '据点105', '据点106', 'L274'], 'L2 信众宣传海报/L3 天使宗教画；据点各团体海报'),
  S('photo', '相片', 'nonsolid', ['L1', '据点101', '据点102', '据点103', '据点104', '据点105', '据点106'], 'infiniteL1 民居段照片墙；据点墙面装饰'),
  S('shopsign', '悬挂店招', 'nonsolid', ['据点102', '据点104'], '商人之家市场街、Tom 的餐馆前台'),
  S('ventgrate', '通风口格栅', 'nonsolid', ['据点101', '据点103', '据点104'], '据点天花板通风口'),
  S('bench', '长椅', 'solid', ['据点102', '据点103', '据点104', '据点105', '据点106', 'L274'], '商场/候诊/餐厅长椅、EL3A 上层、L274 教堂长凳'),
  S('planter', '花坛', 'solid', ['L5', '据点102', '据点103', '据点104', '据点106', 'L274'], 'infiniteL5 主厅盆栽；商场风绿化装饰'),
  S('trashbin', '垃圾桶', 'solid', ['据点102', '据点103', '据点104', '据点106'], '商场风装饰'),
  S('hospitalbed', '病床', 'solid', ['据点103', '据点106'], '希波克拉底病房'),
  S('ivstand', '输液架', 'nonsolid', ['据点103', '据点106'], '希波克拉底病房'),
  S('medcabinet', '药品柜', 'solid', ['据点103', '据点106'], '希波克拉底药房门（非容器——据点铁律）'),
  S('labbench', '实验台', 'solid', ['据点103'], '希波克拉底实验室（让开门线）'),
  S('specimentank', '标本罐', 'solid', ['据点103'], '希波克拉底实验室'),
  S('stove', '灶台', 'solid', ['据点104'], 'Tom 的餐馆厨房'),
  S('kcounter', '厨房料理台', 'solid', ['据点104', '据点106', 'L274'], 'Tom 的餐馆厨房；L274 祭衣台'),
  S('sink', '水槽', 'solid', ['据点104', '据点106'], 'Tom 的餐馆厨房'),
  S('freezer', '卧式冷冻柜', 'solid', ['据点104'], 'Tom 的餐馆冷库（非容器——据点铁律）'),
  S('dtable', '餐桌', 'solid', ['L5', '据点104', '据点106'], 'infiniteL5 餐厅白桌布餐桌阵列；Tom 的餐馆大堂（白桌布圆桌+餐椅）'),
  // ===== L2/L3 机器与 L274 =====
  S('bigcomputer', '大号台式电脑', 'solid', ['L2', '据点106'], 'infiniteL2 电脑房'),
  S('scrap', '碎金属堆', 'nonsolid', ['L2', 'L3'], 'infiniteL2/L3 肮脏廊道地面散件'),
  S('machinewall', '代墙大型机器', 'solid', ['L2'], 'infiniteL2 墙面段（data.mv 机型）'),
  S('pallet', '木托盘堆', 'solid', ['据点105'], 'EL3A 仓库'),
  S('handrail', '扶手栏杆', 'solid', ['据点105', '据点106'], 'EL3A 夹楼边缘/阶梯两侧（细条碰撞盒）'),
  S('walllamp', '壁挂斜照大灯', 'nonsolid', ['据点105'], 'EL3A 挑高仓库区（灯具模型+fixZ 光源）'),
  S('domering', '教堂穹顶', 'nonsolid', ['L274'], 'L274 大厅中央（环形肋+拱肋+圣辉盘）'),
  S('perch', '杰瑞的栖木', 'solid', ['L274'], 'L274 大厅中央（鹉主 Entity 7 栖息）'),
  S('pulpit', '讲坛', 'solid', ['L274', '据点108'], 'L274 教堂；蓝色救赎祈祷角'),
  S('candlestand', '烛台', 'nonsolid', ['L3', 'L5', 'L274', '据点108'], 'infiniteL3 圣所、infiniteL5 休息室/餐厅舞台角、L274 教堂（自发光烛火）；蓝色救赎祈祷角/小室'),
  S('holyfont', '圣水盆', 'solid', ['L274', '据点108'], 'L274 教堂（蓝色圣水微光）；蓝色救赎祈祷角'),
  // ===== v54：据点新装饰 =====
  S('sofa', '双人沙发', 'solid', ['L5', '据点108'], 'infiniteL5 主厅/休息室古董沙发（data.color 实例配色；柜类贴墙朝向约定，data.deg 覆盖）；蓝色救赎休息室'),
  S('servercase', '塔式服务器机箱', 'solid', ['据点106'], 'Gemma 基地 3F 机房沿墙成排（指示灯点阵+顶部散热栅；柜类碰撞约定）'),
  S('walltv', '挂式平板电视', 'nonsolid', ['据点101', '据点105', '据点106', '据点107'], 'mountOnWall 贴墙：黑框+微亮屏幕；据点休息/娱乐区'),
  S('wallwindow', '墙体窗', 'solid', ['据点101', '据点105', '据点106', '据点107'], '代替整格内隔墙（下 1/3 墙+中段玻璃+上段接顶；整格 solid；代墙模式同 machinewall）'),
  S('tvset', '立式大电视', 'solid', ['据点106'], 'Gemma 2F 电视娱乐室隔断间（深色机身+底座支脚+微亮屏；data.deg 朝向，缺省柜类贴墙约定）'),
  S('loungechair', '弧形塑料休闲椅', 'nonsolid', ['L5', '据点106'], 'infiniteL5 客房/休息室（data.color 实例配色）；Gemma 2F 电视娱乐室（一体成型弧面+四细腿）'),
  S('phonograph', '留声机', 'solid', ['L5'], 'v54：infiniteL5 休息室（木柜座+黄铜大喇叭+唱盘；柜类贴墙朝向约定）'),
  S('poolladder', '泳池扶梯', 'nonsolid', ['L5'], 'v54：infiniteL5 游泳池池缘（双弯管扶手+横档；data.deg 朝向）'),
  S('divingboard', '跳台', 'solid', ['L5'], 'v54：infiniteL5 游泳池深水端（短柱+悬挑跳板，板面可站上；data.deg 朝向）'),
  S('gymbench', '健身卧推凳', 'solid', ['L5'], 'v54：infiniteL5 健身房（凳面+杠铃架+杠铃片组；data.deg 朝向）'),
  S('darkdoorblock', '深色木门碰撞块（仅碰撞）', 'solid', ['L5'], 'v55：infiniteL5 darkwooddoor 出口格——无模型（可见门在出口模型里），整格实心碰撞（关闭时不可穿）'),
  S('rug', '华丽地毯', 'nonsolid', ['L5'], 'L5 大厅/房间独立地毯块（CC0 真实织物 PBR，data.tex 红/蓝、data.layer 多层叠放）；走廊直接使用连续世界 UV 地毯地形'),
  S('redpillar', '红木纹方柱', 'solid', ['L5'], 'v55：infiniteL5 主厅柱阵（红色大理石观感 + 金色柱头/柱础；挑高自适应）'),
  S('ceilingbeam', '装饰横梁', 'nonsolid', ['L5'], 'v55：infiniteL5 主厅吊顶格横梁（沿 local X 横跨全厅；贴挑高顶）'),
  S('oddtable', '异形小桌', 'solid', ['L5'], 'v55：infiniteL5 贝弗莉室中央（不规则歪腿 + 桌面饮料瓶群 + 未打完的麻将）'),
  S('furnace', '熔炉', 'solid', ['L5'], 'v55：infiniteL5 锅炉房（砖砌炉体 + 炉膛口微光 + 烟道）'),
  S('treadmill', '跑步机', 'solid', ['L5'], 'v55：infiniteL5 健身房'),
  S('dumbbellrack', '哑铃架', 'solid', ['L5'], 'v55：infiniteL5 健身房'),
  S('spinbike', '动感单车', 'solid', ['L5'], 'v55：infiniteL5 健身房'),
  S('wallsign', '墙面字牌', 'nonsolid', ['L5'], 'v55：infiniteL5（程序贴图：主厅金色房号牌/维修大厅「员工专用」/贝弗莉「Beverly Room」银牌；data.text/gold）'),
  S('foldladder', '人字折叠梯', 'nonsolid', ['L5'], 'v55：infiniteL5 锅炉房/维修大厅（双侧斜杆+踏板+顶部铰链；纯装饰非攀爬——替代旧装饰 ladder 点位）'),
  S('invitation', '烫金邀请函', 'nonsolid', ['L5'], 'v55b：infiniteL5 贝弗莉室地面散落（信封+烫金边+火漆印；可交互——地标链路前往原住民；data.outpost=originals）'),
  // ===== v51：L3 发电站 =====
  S('elecbox', '配电箱（壁挂）', 'nonsolid', ['L3'], 'infiniteL3 挂墙容器（附近有电流嗡鸣）'),
  S('cables', '电缆线束', 'nonsolid', ['L3'], 'infiniteL3 沿墙顶走线'),
  S('barfence', '铁栅栏', 'solid', ['L3'], 'infiniteL3 封死廊道（不可通行）'),
  S('bargate', '栅栏门', 'solid', ['L3'], 'infiniteL3 铁栅栏中的门扇（开/关切实心）'),
  S('statue', '风化的希腊女像', 'solid', ['L3'], 'infiniteL3 铁栅栏后砖砌区段'),
  S('conveyor', '装配线传送带', 'solid', ['L3'], 'infiniteL3 装配间'),
  S('angelstatue', '圣所天使像', 'solid', ['L3'], 'infiniteL3 圣所'),
  S('fallencolumn', '倒塌的大理石柱', 'nonsolid', ['L3'], 'infiniteL3 圣所瓦砾'),
  S('busbar', '母线龙门架', 'solid', ['L3', 'L5'], 'infiniteL3 发电室、infiniteL5 维修大厅'),
  S('warningsign', '高压警示牌', 'nonsolid', ['L3', '据点106'], 'infiniteL3 贴墙'),
  S('worktable', '装配线工作台', 'solid', ['L3'], 'infiniteL3 装配间'),
  S('factlamp', '吊装长条荧光灯', 'nonsolid', ['L3'], 'infiniteL3 装配间（配套光源 noFix）'),
  S('sphboiler', '球形黄铜锅炉', 'solid', ['L3', 'L5'], 'infiniteL3 锅炉房（2×2 铆接球罐）、infiniteL5 锅炉房机组'),
  S('floordrain', '地面排水格栅', 'nonsolid', ['L3'], 'infiniteL3 锅炉房'),
  S('turbinegen', '汽轮发电机组', 'solid', ['L3'], 'infiniteL3 发电室'),
  S('switchboard', '配电盘柜', 'solid', ['L3', '据点106'], 'infiniteL3 发电室'),
  S('transformer', '油浸式变压器', 'solid', ['L3'], 'infiniteL3 发电室'),
  S('pressmachine', '冲压工位', 'solid', ['L3'], 'infiniteL3 装配线'),
  S('feedpump', '电动给水泵', 'solid', ['L3'], 'infiniteL3 锅炉房'),
  S('manifold', '蒸汽集箱', 'solid', ['L3', 'L5'], 'infiniteL3 锅炉房、infiniteL5 锅炉房集汽包'),
  S('piperack', '有序管架', 'solid', ['L3', 'L5'], 'infiniteL3 锅炉房、infiniteL5 维修大厅/锅炉房管道丛林'),
  S('cabletray', '穿孔电缆桥架', 'nonsolid', ['L3', 'L5'], 'infiniteL3 顺墙高位、infiniteL5 维修大厅'),
  S('rattrap', '尸鼠陷阱', 'nonsolid', ['L3'], 'infiniteL3 ~9% chunk 地面；踩上触发（data.sprung），v53 高智能尸鼠'),
  S('bigpainting', '大幅画作', 'nonsolid', ['L3'], 'infiniteL3 ~25% chunk 廊道砖墙；data.tex/pw/ph 自定义贴图与尺寸，放置前校验墙面连续且足够大（v53 艺术品）'),
  S('stainedglass', '彩色玻璃花窗', 'nonsolid', ['L3'], 'infiniteL3 圣所内腔墙 2~4 扇；data.tex/pw/ph 自定义，跨度校验同大幅画作（v53b）'),

  // ===== 渲染侧：仅贴图贴花（renderer/decorations/decals.ts；不进 m.structures）=====
  S('decal:l0_peel', '墙纸剥落补丁', 'decal', ['L0'], 'buildDecorations gen=rooms'),
  S('decal:l0_stain', '地毯水渍', 'decal', ['L0'], 'buildDecorations gen=rooms'),
  S('decal:l0_fakedoor', '远处假门（贴画）', 'decal', ['L0'], 'buildDecorations gen=rooms'),
  S('decal:l1_oil', '油渍', 'decal', ['L1'], 'buildDecorations gen=garage'),
  S('decal:l1_parksign', '停车编号牌', 'decal', ['L1'], 'buildDecorations gen=garage'),
  S('decal:l2_gaugedial', '压力表盘贴花', 'decal', ['L2'], 'buildDecorations gen=pipes'),
  S('decal:l2_caution', '警示带', 'decal', ['L2'], 'buildDecorations gen=pipes'),
  S('decal:l3_warnsign', '警告标识牌', 'decal', ['L3'], 'buildDecorations gen=grid'),
  S('decal:l4_papers', '散落文件纸张', 'decal', ['L4'], 'buildDecorations gen=office（实例化贴图平面）'),
  S('decal:l4_whiteboard', '白板残留字迹', 'decal', ['L4'], 'buildDecorations gen=office'),
  S('decal:l5_painting', '油画（含金框边条）', 'decal', ['L5'], 'buildDecorations gen=hotel（画框四边为低模，同一特征）'),
  S('decal:l6_scratch', '墙上划痕与手印', 'decal', ['L6'], 'buildDecorations gen=darkhall'),
  S('decal:l7_carpet', '海床地毯碎片', 'decal', ['L7'], 'buildDecorations gen=ocean'),
  S('decal:l8_rockwear', '岩壁风化痕', 'decal', ['L8'], 'buildDecorations gen=caves'),
  S('decal:l8_roadsign', '风化旧路标贴画', 'decal', ['L8'], 'buildDecorations gen=caves'),
  S('decal:l9_puddle', '湿沥青水洼', 'decal', ['L9'], 'buildDecorations gen=suburb'),
  S('decal:l10_ruts', '车辙', 'decal', ['L10'], 'buildDecorations gen=field'),
  S('decal:l11_streetsign', '街道标识', 'decal', ['L11'], 'buildDecorations gen=city'),
  S('decal:l601_painting', '图书馆挂画', 'decal', ['L601'], 'buildDecorations gen=library'),

  // ===== 渲染侧：无碰撞低模道具（renderer/decorations/props.ts；不进 m.structures）=====
  S('prop:l0_tiltlamp', '歪斜荧光灯', 'nonsolid', ['L0'], 'buildDecorations gen=rooms'),
  S('prop:l1_wreckcar', '废弃车（纯视觉）', 'nonsolid', ['L1'], 'buildDecorations gen=garage（仅 parking 段）'),
  S('prop:l1_cone', '交通锥', 'nonsolid', ['L1'], 'buildDecorations gen=garage'),
  S('prop:l2_drippipe', '滴水管（含小水洼贴花）', 'nonsolid', ['L2'], 'buildDecorations gen=pipes'),
  S('prop:l2_insulation', '保温棉破损碎块', 'nonsolid', ['L2'], 'buildDecorations gen=pipes'),
  S('prop:l3_indicators', '闪烁指示灯排', 'nonsolid', ['L3'], 'buildDecorations gen=grid'),
  S('prop:l3_cablerun', '电缆束沿墙走线', 'nonsolid', ['L3'], 'buildDecorations gen=grid'),
  S('prop:l4_fallenchair', '翻倒的转椅', 'nonsolid', ['L4'], 'buildDecorations gen=office'),
  S('prop:l4_watercooler', '饮水机', 'nonsolid', ['L4'], 'buildDecorations gen=office'),
  S('prop:l5_luggagecart', '行李车', 'nonsolid', ['L5'], 'buildDecorations gen=hotel'),
  S('prop:l5_servicecart', '客房服务推车', 'nonsolid', ['L5'], 'buildDecorations gen=hotel'),
  S('prop:l5_vase', '走廊尽头花瓶', 'nonsolid', ['L5'], 'buildDecorations gen=hotel'),
  S('prop:l6_pipebracket', '沿墙管道支架', 'nonsolid', ['L6'], 'buildDecorations gen=darkhall'),
  S('prop:l6_flashlight', '被丢弃的手电', 'nonsolid', ['L6'], 'buildDecorations gen=darkhall'),
  S('prop:l7_rustscrap', '锈蚀金属碎片', 'nonsolid', ['L7'], 'buildDecorations gen=ocean'),
  S('prop:l7_bones', '散落骨头', 'nonsolid', ['L7'], 'buildDecorations gen=ocean'),
  S('prop:l8_rubble', '碎石堆', 'nonsolid', ['L8'], 'buildDecorations gen=caves'),
  S('prop:l8_glowmoss', '发光苔藓斑', 'nonsolid', ['L8'], 'buildDecorations gen=caves'),
  S('prop:l9_leaves', '落叶', 'nonsolid', ['L9'], 'buildDecorations gen=suburb'),
  S('prop:l9_trashcan', '街边垃圾桶', 'nonsolid', ['L9'], 'buildDecorations gen=suburb'),
  S('prop:l10_hay', '干草堆', 'nonsolid', ['L10'], 'buildDecorations gen=field'),
  S('prop:l10_timber', '木料', 'nonsolid', ['L10'], 'buildDecorations gen=field'),
  S('prop:l11_adpillar', '广告柱', 'nonsolid', ['L11'], 'buildDecorations gen=city'),
  S('prop:l11_scaffold', '施工脚手架', 'nonsolid', ['L11'], 'buildDecorations gen=city'),
  S('prop:l11_trashcan', '街道垃圾桶', 'nonsolid', ['L11'], 'buildDecorations gen=city'),
  S('prop:l601_books', '摊开在地上的书', 'nonsolid', ['L601'], 'buildDecorations gen=library'),
  S('prop:l601_readlamp', '阅览灯', 'nonsolid', ['L601'], 'buildDecorations gen=library'),
]

// 容器/可交互标记从既有注册表聚合派生（单一事实源，禁止在本表手改）：
//   container    = CONTAINERS（decorations/containers.ts）
//   interactive  = 容器 ∪ DECOR_VIEWS（decorations/lore.ts）∪ INTERACT_EXTRA（engine scanInteract case）
export const DECOR_REGISTRY: readonly DecorEntry[] = RAW.map((e) => ({
  ...e,
  container: !!CONTAINERS[e.id],
  interactive: !!CONTAINERS[e.id] || !!DECOR_VIEWS[e.id] || INTERACT_EXTRA.has(e.id),
}))

// 层级排序键（取条目最小层级下标；无层级排最后）——DECORATIONS.md 组内排序用
export function decorLevelSortKey(e: DecorEntry): number {
  let best = Number.MAX_SAFE_INTEGER
  for (const l of e.levels) {
    const i = DECOR_LEVEL_ORDER.indexOf(l)
    if (i >= 0 && i < best) best = i
  }
  return best
}
