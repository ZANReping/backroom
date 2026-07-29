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
  use?: 'eat' | 'heal' | 'sanity' | 'battery' | 'stamina' | 'bigsanity' | 'light' | 'none'
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
  battery: { type: 'battery', name: '手电筒电池', desc: '为手电筒充能的电池。', stack: 3, use: 'battery', value: 50, rarity: 'common', glyph: 'battery' },
  flashlight: { type: 'flashlight', name: '手电筒', desc: '可靠的老式手电。装在副手提供主光源，按 F 开关，耗电。', stack: 1, passive: '主光源', equip: 'offhand', rarity: 'uncommon', glyph: 'flashlight' },
  crowbar: { type: 'crowbar', name: '撬棍', desc: '沉重的撬棍。可当作武器，也能撬开补给箱。', stack: 1, weapon: 25, rarity: 'uncommon', glyph: 'crowbar' },
  tape: { type: 'tape', name: '磁带', desc: '一盘标着编号的磁带。集齐 6 盘，也许能揭开真相……（胜利条件）', stack: 6, rarity: 'epic', glyph: 'tape' },
  lighter: { type: 'lighter', name: '打火机', desc: '微弱的火苗。装备后提供一小圈额外的光。', stack: 1, passive: '微光照明', equip: 'offhand', rarity: 'uncommon', glyph: 'lighter' },
  rabbit: { type: 'rabbit', name: '幸运兔脚', desc: '毛茸茸的护符。携带时提升稀有物品掉落。', stack: 1, passive: '幸运提升', equip: 'pocket', anomalous: true, rarity: 'rare', glyph: 'rabbit' },
  wallpaper: { type: 'wallpaper', name: '壁纸碎片', desc: '从墙上剥落的黄色壁纸。似乎没有任何用处，但你还是收了起来。', stack: 5, unique: 0, rarity: 'common', glyph: 'scrap' },
  glowstick: { type: 'glowstick', name: '荧光棒', desc: '掰亮后能照亮周围一小片区域，持续很久。', stack: 3, unique: 0, use: 'light', value: 1, rarity: 'common', glyph: 'stick' },
  carkey: { type: 'carkey', name: '车钥匙', desc: '停车场的车钥匙。可以打开废弃汽车的后备箱。', stack: 2, unique: 1, equip: 'pocket', rarity: 'uncommon', glyph: 'key' },
  gas: { type: 'gas', name: '汽油罐', desc: '半罐汽油。也许能点燃什么……', stack: 2, unique: 1, use: 'none', throw: 'explode', rarity: 'common', glyph: 'gas' },
  wrench: { type: 'wrench', name: '扳手', desc: '沉重的管钳。可以封住泄漏的蒸汽阀门，也可当武器。', stack: 1, unique: 2, weapon: 20, rarity: 'uncommon', glyph: 'wrench' },
  gloves: { type: 'gloves', name: '隔热手套', desc: '厚重的石棉手套。装备后免疫蒸汽与热管道的伤害。', stack: 1, unique: 2, passive: '隔热', equip: 'gloves', rarity: 'uncommon', glyph: 'gloves' },
  suit: { type: 'suit', name: '绝缘服', desc: '橡胶绝缘服。装备后免疫电弧伤害。', stack: 1, unique: 3, passive: '绝缘', equip: 'body', rarity: 'uncommon', glyph: 'suit' },
  fuse: { type: 'fuse', name: '保险丝', desc: '粗大的工业保险丝。电梯井需要 2 枚才能启动。', stack: 4, unique: 3, rarity: 'common', glyph: 'fuse' },
  capacitor: { type: 'capacitor', name: '电容器', desc: '充满电荷的电容器。', stack: 2, unique: 3, use: 'none', throw: 'shock', rarity: 'uncommon', glyph: 'cap' },
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
  presses: { type: 'presses', name: 'presses（压印币）', desc: 'B.N.T.G. 在 New Times Square 使用的专属货币。对不知情的访客，市场会给交易豁免——但有它总归方便。', stack: 6, unique: 11, anomalous: true, rarity: 'rare', glyph: 'coin' },
  pamphlet: { type: 'pamphlet', name: '宣传册', desc: '在 Level 11 买到、在别处才用得上的东西。纸页上印着一座你没去过的层级。', stack: 2, unique: 11, use: 'sanity', value: 20, anomalous: true, rarity: 'rare', glyph: 'book' },
  citywater: { type: 'citywater', name: '市政自来水', desc: '这座城市自行发电、供水、回收废物、生产食物。水龙头是真的能出水的——只是一个人也没有。', stack: 3, unique: 11, use: 'sanity', value: 25, anomalous: true, rarity: 'common', glyph: 'bottle' },

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
  warpberry: { type: 'warpberry', name: '迁跃浆果', desc: '表皮泛着空间涟漪的浆果——据说它认得「家」的方向。', stack: 2, use: 'eat', value: 15, anomalous: true, rarity: 'epic', glyph: 'berry' },
  royalration: { type: 'royalration', name: '皇家口粮', desc: '传说中的甘美之物，一口便足以忘记饥饿与恐惧。只是从没有人能只吃一口。', stack: 3, use: 'eat', value: 100, anomalous: true, rarity: 'epic', glyph: 'ration' },
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
]

export function itemName(t: string): string {
  return ITEMS[t]?.name ?? t
}
