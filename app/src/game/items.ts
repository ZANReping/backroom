// 物品定义（通用池 + 各层独特物品）
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic'
export const ITEM_RARITY_LABEL: Record<ItemRarity, string> = { common: '常见', uncommon: '少见', rare: '稀有', epic: '珍稀' }
export const ITEM_RARITY_COLOR: Record<ItemRarity, string> = { common: 'var(--text-dim)', uncommon: '#8fd98f', rare: '#6fa8ff', epic: 'var(--amber)' }

export type EquipSlot = 'offhand' | 'body' | 'gloves' | 'head' | 'pocket'
export interface ItemDef {
  type: string
  name: string
  desc: string
  stack: number
  use?: 'eat' | 'heal' | 'sanity' | 'battery' | 'stamina' | 'bigsanity' | 'light' | 'none' | 'cure'
  value?: number
  weapon?: number // 近战伤害
  passive?: string
  equip?: EquipSlot // 装备位：offhand=副手（打火机）body=身体（服饰）gloves=手套 pocket=口袋（护符/钥匙类）
  unique?: number // 所属层级（undefined=通用）
  /** 后室物品：现实生活中没有、或具有不同于现实的超自然效果；缺省=普通物品（现实制品） */
  anomalous?: boolean
  /** 稀有度：common 常见 / uncommon 少见 / rare 稀有 / epic 珍稀（缺省按 common 展示） */
  rarity?: ItemRarity
  /** 可投掷：手持时左键掷出（explode=范围伤害 shock=电击+眩晕 noise=声响引怪 lure=引路者诱饵） */
  throw?: 'explode' | 'shock' | 'noise' | 'lure'
  glyph: string // 绘制用
}

export const ITEMS: Record<string, ItemDef> = {
  almond: { type: 'almond', name: '杏仁水', desc: '甜腻的液体，后室里最受欢迎的补给。', stack: 3, use: 'sanity', value: 30, anomalous: true, rarity: 'uncommon', glyph: 'bottle' },
  canned: { type: 'canned', name: '罐装食品', desc: '标签已经脱落的罐头。', stack: 3, use: 'eat', value: 35, rarity: 'common', glyph: 'can' },
  bandage: { type: 'bandage', name: '绷带', desc: '还算干净的一卷绷带。', stack: 3, use: 'heal', value: 30, rarity: 'common', glyph: 'bandage' },
  disinfectant: { type: 'disinfectant', name: '消毒液', desc: '希波克拉底团队标准配发的医用消毒液，气味刺鼻。可消去疫疾（疫疾尚未实装——目前使用仅作预防性消毒）。', stack: 3, use: 'cure', value: 25, rarity: 'uncommon', glyph: 'bottle' },
  battery: { type: 'battery', name: '手电筒电池', desc: '为手电筒充能的电池。', stack: 3, use: 'battery', value: 50, rarity: 'common', glyph: 'battery' },
  flashlight: { type: 'flashlight', name: '手电筒', desc: '可靠的老式手电。装在副手提供主光源，按 F 开关，耗电。', stack: 1, passive: '主光源', equip: 'offhand', rarity: 'uncommon', glyph: 'flashlight' },
  crowbar: { type: 'crowbar', name: '撬棍', desc: '沉重的撬棍。可当作武器，也能撬开补给箱。', stack: 1, weapon: 25, rarity: 'uncommon', glyph: 'crowbar' },
  tape: { type: 'tape', name: '磁带', desc: '一盘标着编号的磁带。集齐 6 盘，也许能揭开真相……（胜利条件）', stack: 6, rarity: 'epic', glyph: 'tape' },
  lighter: { type: 'lighter', name: '打火机', desc: '微弱的火苗。装备后提供一小圈额外的光。', stack: 1, passive: '微光照明', equip: 'offhand', rarity: 'uncommon', glyph: 'lighter' },
  rabbit: { type: 'rabbit', name: '幸运兔脚', desc: '毛茸茸的护符。携带时提升稀有物品掉落。', stack: 1, passive: '幸运提升', equip: 'pocket', anomalous: true, rarity: 'rare', glyph: 'rabbit' },
  wallpaper: { type: 'wallpaper', name: '壁纸碎片', desc: '从墙上剥落的黄色壁纸。似乎没有任何用处，但你还是收了起来。', stack: 5, unique: 0, rarity: 'common', glyph: 'scrap' },
  glowstick: { type: 'glowstick', name: '荧光棒', desc: '掰亮后能照亮周围一小片区域，持续很久。', stack: 3, unique: 0, use: 'light', value: 1, rarity: 'common', glyph: 'stick' },
  carkey: { type: 'carkey', name: '车钥匙', desc: '停车场的车钥匙。可以打开废弃汽车的后备箱。', stack: 2, unique: 1, equip: 'pocket', rarity: 'uncommon', glyph: 'key' },
  gas: { type: 'gas', name: '火油桶', desc: '半桶火油——熔化的火盐制成的易燃液体，熏香味。也许能点燃什么……', stack: 2, unique: 1, use: 'none', throw: 'explode', rarity: 'rare', glyph: 'gas' },
  firesalt: { type: 'firesalt', name: '火盐晶体', desc: '一小撮橙色半透明晶体碎片，受冲击即爆裂出炽热的火花——后室探险者的首选自卫武器。（Object 15）', stack: 3, use: 'none', throw: 'explode', rarity: 'uncommon', anomalous: true, glyph: 'firesalt' },
  liquidpain: { type: 'liquidpain', name: '液态痛苦', desc: '半透明的淡红色液体——杏仁水的致命变种。绝不能喝。但装进滋水枪，它就是武器。（Object 48）', stack: 1, use: 'eat', anomalous: true, rarity: 'epic', glyph: 'pain' },
  manmade: { type: 'manmade', name: '人制品', desc: '一包用糖果纸简单包裹的「产品」，散发着不正常的甜香。吃下后的 5 分钟内：无法进食其他食物、治疗减半、始终感到饥饿、体力恢复减半消耗加倍，但受伤略轻。（Entity 36 的产品）', stack: 1, use: 'eat', value: 15, anomalous: true, rarity: 'uncommon', glyph: 'meat' },
  // ---------- Object 5：B.N.T.G. 糖果（商人之家糖果贩兑换，统一 饥饿+5 理智+5，糖瘾 60s）----------
  candysilver: { type: 'candysilver', name: '银舌头', desc: '舌头形状的金属质感糖果，只在口中融化——吃下去说话都顺了几分。（Object 5）', stack: 8, use: 'eat', value: 5, anomalous: true, rarity: 'uncommon', glyph: 'candy' },
  candybullet: { type: 'candybullet', name: '咀嚼子弹', desc: '银箔包裹的子弹形巧克力，硬得硌牙。（Object 5）', stack: 8, use: 'eat', value: 5, anomalous: true, rarity: 'uncommon', glyph: 'candy' },
  candygun: { type: 'candygun', name: '枪糖', desc: '金属仿真枪造型的糖。直接吞食有窒息风险——但有人会为那只「枪」冒险。（Object 5）', stack: 8, use: 'eat', value: 5, anomalous: true, rarity: 'uncommon', glyph: 'candy' },
  candystanley: { type: 'candystanley', name: '纸片人斯坦利', desc: '人形扁平糖纸，放在舌头上会迅速融化。（Object 5）', stack: 8, use: 'eat', value: 5, anomalous: true, rarity: 'uncommon', glyph: 'candy' },
  candywaste: { type: 'candywaste', name: '危害废料', desc: '极酸的硬糖，形似迷你危险废物桶。（Object 5）', stack: 8, use: 'eat', value: 5, anomalous: true, rarity: 'uncommon', glyph: 'candy' },
  candygenius: { type: 'candygenius', name: '天才糖', desc: '粉色威化糖，上面印着「2+2=4」「土耳其的首都是安卡拉」「E=MC2」。（Object 5）', stack: 8, use: 'eat', value: 5, anomalous: true, rarity: 'uncommon', glyph: 'candy' },
  candymint: { type: 'candymint', name: '杏仁薄荷糖', desc: 'O 形薄荷糖，薄荷混着杏仁味。（Object 5）', stack: 8, use: 'eat', value: 5, anomalous: true, rarity: 'uncommon', glyph: 'candy' },
  // 首次进入 Level 1 时出生点旁的纸条（wikidot Level 1：探险者总署附在杏仁水瓶上的留言；查看即收录图鉴「文档」）
  welcomenote: { type: 'welcomenote', name: '致新流浪者的纸条', desc: '一张折起的横线纸，字迹工整。是探险者总署留给新流浪者的。', stack: 1, unique: 1, use: 'none', rarity: 'rare', glyph: 'scrap' },
  wrench: { type: 'wrench', name: '扳手', desc: '沉重的管钳。可以封住泄漏的蒸汽阀门，也可当武器。', stack: 1, unique: 2, weapon: 20, rarity: 'uncommon', glyph: 'wrench' },
  gloves: { type: 'gloves', name: '隔热手套', desc: '厚重的石棉手套。装备后免疫蒸汽与热管道的伤害。', stack: 1, unique: 2, passive: '隔热', equip: 'gloves', rarity: 'uncommon', glyph: 'gloves' },
  suit: { type: 'suit', name: '绝缘服', desc: '橡胶绝缘服。装备后免疫电弧伤害。', stack: 1, unique: 3, passive: '绝缘', equip: 'body', rarity: 'uncommon', glyph: 'suit' },
  fuse: { type: 'fuse', name: '保险丝', desc: '粗大的工业保险丝。电梯井需要 2 枚才能启动。', stack: 4, unique: 3, rarity: 'common', glyph: 'fuse' },
  capacitor: { type: 'capacitor', name: '瓶装闪电', desc: '一只塞着软木塞的玻璃烧瓶，瓶内一道蓝色闪电疾走不休——封存着约十亿焦耳的电荷。（即 Object 42「瓶装闪电」）', stack: 2, unique: 3, use: 'none', throw: 'shock', rarity: 'uncommon', anomalous: true, glyph: 'cap' },
  dryshrimp: { type: 'dryshrimp', name: '旱虾', desc: '一只完整的旱虾——生吃也完全安全，是后室里最受欢迎的应急口粮。也可以带给 Tom 加工成菜。', stack: 2, use: 'eat', value: 25, anomalous: true, rarity: 'common', glyph: 'shrimp' },
  friedshrimp: { type: 'friedshrimp', name: '酥炸旱虾', desc: 'Tom 的招牌小手笔：整虾裹粉酥炸，壳都炸得焦香——「连壳吃，钙质满满！」', stack: 2, use: 'eat', value: 45, rarity: 'uncommon', glyph: 'shrimp' },
  coffee: { type: 'coffee', name: '咖啡', desc: '自动售货机里的罐装咖啡。', stack: 3, unique: 4, use: 'stamina', value: 1, rarity: 'common', glyph: 'coffee' },
  stapler: { type: 'stapler', name: '订书机', desc: '沉重的订书机，掷出去足以吸引注意。', stack: 2, unique: 4, use: 'none', throw: 'noise', rarity: 'common', glyph: 'stapler' },
  keycard: { type: 'keycard', name: '门禁卡', desc: '一张员工门禁卡。可以打开员工电梯与服务器机房。', stack: 1, unique: 4, equip: 'pocket', rarity: 'uncommon', glyph: 'card' },
  skeleton: { type: 'skeleton', name: '万能钥匙', desc: '酒店黄铜万能钥匙。可以打开任意一扇上锁的门。', stack: 1, unique: 5, equip: 'pocket', anomalous: true, rarity: 'rare', glyph: 'skeleton' },
  silverware: { type: 'silverware', name: '银餐具', desc: '擦得发亮的银质餐具。侍者也许会感兴趣。', stack: 3, unique: 5, rarity: 'uncommon', glyph: 'silver' },
  sedative: { type: 'sedative', name: '镇定剂', desc: '一针强效镇定剂。', stack: 2, unique: 5, use: 'bigsanity', value: 60, rarity: 'uncommon', glyph: 'syringe' },

  // ================= v23：Level 6–11 与 Level 601 专属物品（设定依据 Backrooms Wikidot）=================
  // Level 6「Lights Out」——本层没有任何补给记载，只有前人留下的东西
  chalkstub: { type: 'chalkstub', name: '粉笔头', desc: '前人在墙上刻记号时留下的。黑暗中你只能靠手摸——在墙上留下记号，至少知道自己有没有走过。（手持右键：在面前的墙上画一道白色记号）', stack: 3, unique: 6, use: 'none', rarity: 'common', glyph: 'chalk' },
  megfolder: { type: 'megfolder', name: 'M.E.G. 文件夹', desc: '盖着 M.E.G. 徽记的牛皮纸文件夹。内含剪辑（no-clip）说明、常见实体图鉴与重要层级指南。约 36% 的新流浪者靠它离开了 Level 0。', stack: 2, use: 'sanity', value: 20, rarity: 'uncommon', glyph: 'folder' },

  // Level 7「Thalassophobia」
  rope: { type: 'rope', name: '尼龙绳', desc: '一卷结实的尼龙绳。Wikidot 明确建议进入 Level 7 前携带绳索或梯子——否则掉进水里就再也爬不回入口房间。', stack: 1, unique: 7, equip: 'pocket', passive: '可攀回高处', rarity: 'uncommon', glyph: 'rope' },
  divemask: { type: 'divemask', name: '潜水面罩', desc: '海面上方的空气有种未知性质，能让人屏息约三十分钟。有了它，还能更久一点。', stack: 1, unique: 7, equip: 'head', passive: '延长屏息', rarity: 'uncommon', glyph: 'mask' },
  thingmeat: { type: 'thingmeat', name: '巨兽之肉', desc: '油腻、富脂、黏滑，强烈的硫磺味。档案强调：必须生食——加热会唤醒里面休眠的寄生虫。', stack: 2, unique: 7, use: 'eat', value: 55, anomalous: true, rarity: 'rare', glyph: 'meat' },
  oddbook: { type: 'oddbook', name: '来源不明的书', desc: '入口房间书柜上的一本书。没有作者，没有出版信息，翻开却读得下去。', stack: 2, unique: 7, use: 'sanity', value: 25, anomalous: true, rarity: 'rare', glyph: 'book' },

  // Level 8「Cave Systems」
  cavingsuit: { type: 'cavingsuit', name: '洞穴保温服', desc: '内层抓绒、外层防水聚酯纤维，缝满实用口袋。Harmouth 洞穴学会的标准配发。装备后抵御洞内 10–15°C 的长期失温。', stack: 1, unique: 8, equip: 'body', passive: '保温', rarity: 'uncommon', glyph: 'suit' },
  xenonmarble: { type: 'xenonmarble', name: '氙气玻璃珠', desc: '在淡水溪底捞到的。这是引路者（Entity 35）的筑巢材料——那些蓝绿色的「宝石星星」也许会感兴趣。', stack: 3, unique: 8, use: 'none', throw: 'lure', anomalous: true, rarity: 'rare', glyph: 'marble' },
  driedfruit: { type: 'driedfruit', name: '干果与干菜', desc: '洞穴聚落配发的维生素 C 来源。长期不见天日的人格外需要它。', stack: 3, unique: 8, use: 'eat', value: 30, rarity: 'common', glyph: 'fruit' },
  uvlamp: { type: 'uvlamp', name: '人工紫外灯', desc: '不见日照的日子太久了。这盏灯补的不是照明，是维生素 D。', stack: 2, unique: 8, use: 'light', value: 2, rarity: 'uncommon', glyph: 'uv' },
  stonekazoo: { type: 'stonekazoo', name: '石卡祖笛', desc: '天然形成的岩刺，形状恰好是一支卡祖笛，检测证实没有任何人工雕刻痕迹。吹一声，回声会比你预想的更响——足以把实体引往别处。', stack: 1, unique: 8, use: 'none', anomalous: true, rarity: 'rare', glyph: 'kazoo' },

  // Level 9「The Suburbs」
  pockets: { type: 'pockets', name: 'Pockets', desc: 'Object 51。一块能吞下远超自身体积的布袋，背包上限 +4。⚠ M.E.G. 红字警告：切勿把 Pockets 带入 Level 9——邻里守望会立刻找上门。', stack: 1, unique: 9, equip: 'pocket', passive: '背包 +4 · L9 危险', anomalous: true, rarity: 'epic', glyph: 'pocket' },
  housekey: { type: 'housekey', name: '门廊钥匙', desc: '从某户人家的门垫下摸出来的。郊区的房子看上去有人住，只是永远没有电。', stack: 2, unique: 9, equip: 'pocket', rarity: 'uncommon', glyph: 'key' },

  // Level 10「Bumper Crop」
  wheatgrain: { type: 'wheatgrain', name: '割下的小麦', desc: '可安全食用，磨成面粉还能当增稠剂。M.E.G. 已停止在此收割——他们对它的营养价值存疑。', stack: 4, unique: 10, use: 'eat', value: 20, rarity: 'common', glyph: 'wheat' },
  nails: { type: 'nails', name: '一把钉子', desc: '谷仓里到处都是。配上木材，能把一扇门钉死一会儿。', stack: 4, unique: 10, use: 'none', rarity: 'common', glyph: 'nails' },
  timber: { type: 'timber', name: '木板', desc: '从棚屋上拆下来的木板。挥起来沉得很，也能拿来封门。', stack: 2, unique: 10, weapon: 22, rarity: 'common', glyph: 'timber' },

  // Level 11「The City That Never Sleeps」
  presses: { type: 'presses', name: 'B.N.T.G.压印币', desc: 'B.N.T.G. 在新时代广场与商人之家通用的压印币。「繁荣缔造和平」——一瓶杏仁水可兑两枚。', stack: 60, unique: 11, anomalous: true, rarity: 'rare', glyph: 'coin' },
  pamphlet: { type: 'pamphlet', name: '宣传册', desc: '在 Level 11 买到、在别处才用得上的东西。纸页上印着一座你没去过的层级。', stack: 2, unique: 11, use: 'sanity', value: 20, anomalous: true, rarity: 'rare', glyph: 'book' },
  citywater: { type: 'citywater', name: '市政自来水', desc: '这座城市自行发电、供水、回收废物、生产食物。水龙头是真的能出水的——只是一个人也没有。', stack: 3, unique: 11, use: 'sanity', value: 25, anomalous: true, rarity: 'common', glyph: 'bottle' },
  // v43：办公区EL3A 物流任务——缠满胶带的密封包裹，面单写着收件人（目的地见委托详情；不可堆叠，每件占一格）
  parcel: { type: 'parcel', name: '物流包裹', desc: '办公区EL3A 分拣队打包的标准物流包裹，胶带缠了三圈，面单上盖着 B.N.T.G. 天平章。收件人写在委托详情里——当面交付，别弄丢了。', stack: 1, use: 'none', rarity: 'uncommon', glyph: 'box' },

  // Level 601「The End」
  endnote: { type: 'endnote', name: '烧焦的字条', desc: '「别信那扇门。我数过了，我家的走廊没有这么长。—— 第 7 次」。理智 −（真相从来不让人好受），但你会记住它。', stack: 3, unique: 12, rarity: 'rare', glyph: 'scrap' },

  // ===== v32：后室扩展物品 =====
  cashew: { type: 'cashew', name: '腰果水', desc: '看起来和杏仁水几乎一模一样——但千万别搞混。', stack: 3, use: 'sanity', value: -30, anomalous: true, rarity: 'uncommon', glyph: 'bottle' },
  knife: { type: 'knife', name: '刀', desc: '一把还算锋利的刀。', stack: 1, weapon: 30, rarity: 'uncommon', glyph: 'knife' },
  axe: { type: 'axe', name: '斧头', desc: '沉重的消防斧。也能劈开上锁的门——但斧刃经不起太多次硬碰。', stack: 1, weapon: 45, rarity: 'rare', glyph: 'axe' },
  headlamp: { type: 'headlamp', name: '头灯', desc: '戴在头上的探照灯，与手电筒共用电池。', stack: 1, equip: 'head', passive: '头灯光源（共用电池）', rarity: 'uncommon', glyph: 'headlamp' },
  notebook: { type: 'notebook', name: '笔记本和笔', desc: '一本皮面笔记本，笔还插在书脊上。', stack: 1, use: 'none', rarity: 'uncommon', glyph: 'notebook' },
  fuyouyu: { type: 'fuyouyu', name: '福友玉', desc: '一块温润的玉佩，贴着皮肤时，能感到它细微的暖意变化。', stack: 1, equip: 'pocket', passive: '实体感应', anomalous: true, rarity: 'rare', glyph: 'jade' },
  squirtgun: { type: 'squirtgun', name: '滋水枪', desc: '造型过分鲜艳的玩具水枪。在右侧信息栏可以为储罐装入液体。', stack: 1, use: 'none', anomalous: true, rarity: 'rare', glyph: 'watergun' },
  warpberry: { type: 'warpberry', name: '迁跃浆果', desc: '表皮泛着空间涟漪的浆果——据说它认得「家」的方向。每颗都记得自己被发现的地方。', stack: 2, use: 'eat', value: 15, anomalous: true, rarity: 'epic', glyph: 'berry' },
  royalration: { type: 'royalration', name: '皇家口粮', desc: '传说中的甘美之物，一口便足以忘记饥饿与恐惧。只是从没有人能只吃一口。', stack: 1, use: 'eat', value: 100, anomalous: true, rarity: 'epic', glyph: 'ration' },
  // M.E.G. Alpha 基地通用货币（仅限 Alpha 基地内交易使用；与杏仁水 1:1 互换）
  eaglecoin: { type: 'eaglecoin', name: '天鹰币', desc: 'M.E.G. 在天鹰段发行的铜黄色硬币，铸有展翅的雄鹰。Alpha 基地的硬通货——仅限基地内使用。', stack: 30, anomalous: true, rarity: 'uncommon', glyph: 'coin' },

  // ===== v38：Tom 的餐馆菜肴（仅 Tom 处以物易物可得，无层级掉落；设定：wikidot 汤姆餐厅）=====
  tomatosoup: { type: 'tomatosoup', name: '番茄浓汤', desc: 'Tom 的拿手汤——慢炖三个小时的番茄，酸甜里带一点罗勒香。在后室喝到热汤本身就像个奇迹。', stack: 2, use: 'eat', value: 45, rarity: 'common', glyph: 'bowl' },
  gardensalad: { type: 'gardensalad', name: '田园沙拉', desc: '干果干菜重新焕发出生机的一盘——爱子坚持要在上面摆一片完整的叶子。', stack: 2, use: 'stamina', value: 40, rarity: 'uncommon', glyph: 'bowl' },
  garlicbread: { type: 'garlicbread', name: '蒜香烤面包', desc: '炉边现烤，蒜香黄油渗进每一道切缝。「小心，「幸运」最怕切大蒜。」——爱子语。', stack: 2, use: 'eat', value: 40, rarity: 'common', glyph: 'bread' },
  pasta: { type: 'pasta', name: '番茄意面', desc: '正经的意大利做法：番茄酱汁收得浓稠，面条弹牙。Tom 会说「Al dente！」然后盯着看你第一口的表情。', stack: 2, use: 'eat', value: 65, rarity: 'uncommon', glyph: 'plate' },
  meatstew: { type: 'meatstew', name: '炖肉煲', desc: '巨兽之肉炖到酥烂，硫磺味全化成浓郁肉香。吃完感觉伤口都好得快了些。', stack: 2, use: 'heal', value: 70, rarity: 'uncommon', glyph: 'bowl' },
  pizza: { type: 'pizza', name: '意式披萨', desc: '薄底、焦边、番茄与融化的奶酪。在后室，这是接近「正常生活」的最短路径。', stack: 2, use: 'eat', value: 70, rarity: 'uncommon', glyph: 'plate' },
  lasagna: { type: 'lasagna', name: '千层面', desc: '一层肉酱一层白酱，烤到表面金黄。一口下去的满足感，足以让人暂时忘记自己迷失在哪一层。', stack: 1, use: 'bigsanity', value: 85, rarity: 'uncommon', glyph: 'plate' },
  tomsspecial: { type: 'tomsspecial', name: 'Tom 招牌炖菜', desc: '菜单上没有、只换给识货人的一锅——配方是 Esposito 家三代人的秘密。吃完你会明白为什么这家小餐馆从不缺客人。', stack: 1, use: 'eat', value: 130, rarity: 'rare', glyph: 'bowl' },
  // 来料加工（爱子经手）：玩家自带食材，餐馆代做
  grilledsteak: { type: 'grilledsteak', name: '烤兽肉排', desc: '来料加工：巨兽之肉烤得外焦里嫩。档案警告生食才安全——但吃过这口的人都不打算回头。', stack: 2, use: 'eat', value: 85, rarity: 'uncommon', glyph: 'meat' },
  jambread: { type: 'jambread', name: '果酱面包', desc: '来料加工：干果与干菜熬成果酱，厚厚地抹在新烤的面包上。', stack: 2, use: 'eat', value: 45, rarity: 'common', glyph: 'bread' },
}

// 通用物品掉落权重
export const UNIVERSAL_ITEMS: { type: string; w: number }[] = [
  { type: 'almond', w: 18 },
  { type: 'canned', w: 18 },
  { type: 'bandage', w: 14 },
  { type: 'battery', w: 14 },
  { type: 'crowbar', w: 5 },
  { type: 'tape', w: 10 },
  { type: 'lighter', w: 5 },
  { type: 'rabbit', w: 3 },
  { type: 'warpberry', w: 1 }, // 迁跃浆果：十分稀有，混在食物产地
  { type: 'royalration', w: 0.3 }, // 皇家口粮：极其极其稀有
  { type: 'liquidpain', w: 0.25 }, // 液态痛苦：极其稀有，任意层级任何时间都可能找到
]

export function itemName(t: string): string {
  return ITEMS[t]?.name ?? t
}
