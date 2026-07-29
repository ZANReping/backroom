// v23：Level 6–11 与 Level 601 的实体定义
// 设定依据：The Backrooms Wiki（Wikidot，backrooms-wiki.wikidot.com）为主，
// 外观细节在 Wikidot 缺失处补以 Backrooms Fandom 条目并在档案中注明。
// 文风统一为 M.E.G. 档案。
import type { EntityDef } from './types'

export const DEEP_ENTITIES: Record<string, EntityDef> = {
  // ==================== Level 6「Lights Out」 ====================
  mimicry: {
    type: 'mimicry', name: '模仿者', hp: 60, speed: 1.9, damage: 22, sight: 2, hearing: 11,
    darkAmbusher: true, voiceLure: true, hearsSprint: true, color: '#20242a', habitat: 'indoor',
    desc: '黑暗里传来同伴的声音在叫你的名字。你的同伴此刻正站在你旁边，一言不发。',
    codex: {
      no: 'Level 6 社区「Mimicry」', danger: '4 级（高威胁）', habitat: 'Level 6',
      behavior: '不靠视觉——本层根本没有光可用。它靠声音定位，并用完美复制的人声把你叫到它面前。你跑步的脚步声是它最喜欢的邀请。',
      counter: '停下、蹲低、不要出声，更不要回应任何呼唤你名字的声音。它模仿得了音色，模仿不了你和那个人之间的具体事。',
      lore: [
        'Mimicry 是 Level 6 官方记录的两个「社区」之一，成员约四人。他们声称已完全适应绝对黑暗，并掌握了包括人声在内的完美声音模仿能力。',
        '档案的措辞值得逐字阅读：他们「自己也清楚自身构成威胁，应当回避」。M.E.G. 至今没有为这条记录改过一个字。',
        '本层另有一份档案：一名重伤幸存者被寻回，缺一只眼球、胸口有创伤、一条腿骨折，声称在黑暗中遭到「类人」袭击者攻击。分类可能有误，也可能只是精神崩溃——两种解释都没有被推翻。',
      ],
      sighting: '「它用我妹妹的声音喊了我三次。第四次它换成了我自己的声音。」——Level 6 录音残片。',
    },
    aggroStinger: true,
  },

  // ==================== Level 7「Thalassophobia」 ====================
  tiny: {
    type: 'tiny', name: '小不点', hp: 90, speed: 2.4, damage: 24, sight: 5, hearing: 14,
    hearsSprint: true, color: '#5a7a86', habitat: 'outdoor', aquatic: true, // L7 有光带/微光带海面
    desc: '活动于有光带与微光带的海洋捕食者。听觉极其敏锐——比任何一双眼睛都灵。',
    codex: {
      no: 'Entity 720「Tiny」', danger: '4 级（高威胁）', habitat: 'Level 7 · Daylight / Twilight Zone',
      behavior: '在浅水层巡游，凭声音锁定目标。它与更深处的「7 层之物」之间似乎存在互不侵犯的默契，双方从不越界。',
      counter: '它的听觉是长处也是弱点——巨响会让它失去定位。安静下潜，或制造一次远处的声响再走。',
      lore: [
        '首次记录于 2019 年 4 月 18 日。名字来自最初那份报告里的一句自嘲，之后就没有人再笑得出来。',
        '在速度与力量上，全 Level 7 只有它能与 The Thing On Level 7 相提并论。两者的领地边界精确得像是谈好的。',
        '⚠ Wikidot 的 Level 7 条目已被官方标记为 outdated，Tiny 的外观描述未收录。本档案的形象基于目击者的声呐轮廓记录重建，不具正典效力。',
      ],
      sighting: '「我把空罐头往东边扔了。它整个转了过去。我往西游了四十分钟。」——Level 7 幸存者简报。',
    },
    aggroStinger: true,
  },
  thething: {
    type: 'thething', name: '7 层之物', hp: 260, speed: 1.7, damage: 45, sight: 9, hearing: 8,
    lightAverse: true, huge: 2.6, color: '#2e3a40', habitat: 'outdoor', aquatic: true, // L7 开放水域（午夜区/深渊上部）
    desc: '它已经杀光了这片海洋里的所有其他生命。器官长在不该长的位置，鳍与鳃错位生长，体表覆着一层与雾几乎相同的细白粉尘。',
    codex: {
      no: 'The Thing On Level 7', danger: '5 级（极端威胁）', habitat: 'Level 7 · Midnight Zone 与 Abyss 上部',
      behavior: '栖息于午夜带以下。对光极度敏感——任何主动照明都等于在向它报到。',
      counter: '关灯。这不是建议，是唯一的建议。它不会快速追击，也不会进入狭窄空间——岩隙与水下洞穴是活路。',
      lore: [
        'Wikidot 的记载只有两条：它杀光了这片海里的一切，以及它怕光。没有外观描述——这也是该条目被判定 outdated 的原因之一。',
        '外观细节来自 Fandom 版本：体量巨大到从未有人同时观测到它的头与尾；由于相交的重力矢量，器官生长在非常规位置，呈堆叠状；鳍与鳃错位且多数不具功能；体表覆盖的细白粉尘成分与本层的雾几乎相同。（非 Wikidot 正典，仅作形象参考。）',
        '两版设定对它的性格判断完全相反：Wikidot 称其为清空整片海洋的顶级掠食者，Fandom 称其没有已知攻击手段、甚至可食用。M.E.G. 的现场守则采信前者。',
      ],
      sighting: '「探照灯扫过去的那一秒，四百米开外的水整个鼓了起来。我们关了灯，然后再没有人说话。」',
    },
    aggroStinger: true,
  },

  // ==================== Level 8「Cave Systems」 ====================
  wrangler: {
    type: 'wrangler', name: '缠斗者', hp: 200, speed: 2.2, damage: 40, sight: 8, hearing: 9,
    phases: true, huge: 1.9, color: '#4a3c34', habitat: 'any',
    desc: '蛇形巨型捕食者，长度以英里计。成体有一颗类人的头，白色发光的眼睛；雄性永远挂着令人不安的宽阔笑容。',
    codex: {
      no: 'Wrangler（Level 8 顶级掠食者）', danger: '5 级（极端威胁）', habitat: 'Level 8 全境',
      behavior: '能钻穿岩石，或直接 no-clip 穿过表面进行捕猎——墙壁与岩层拦不住它。追击时靠震动而非视线。',
      counter: '没有任何有效的正面手段。留在「第九之路」的稳定之岛之间，跟着 M.E.G. 路标走；离开标记路径就等于把自己交出去。',
      lore: [
        '成体拥有类人的头部与白色发光的眼睛。雄性面部永远保持着一个宽阔的笑容；雌性面部则呈节肢动物状，下颚长出钳肢。',
        '「Level 8 事件」中的那一只长达七十英里，M.E.G. 与联合部队消耗了数百吨 pyroil 才把它焚毁。事件后的结构位移，反而让 Kavragost 废墟第一次变得可以进入。',
        '它不需要通道。你听见的岩石开裂声，就是通道正在被造出来的声音。',
      ],
      sighting: '「石壁上鼓起一个包，然后是一张脸，然后是笑。我们跑了。三个人回来了。」——Harmouth 营地 4 号。',
    },
    aggroStinger: true,
  },
  camocrawler: {
    type: 'camocrawler', name: '迷彩爬行者', hp: 110, speed: 2.0, damage: 30, sight: 0, hearing: 13,
    blind: true, throws: true, hearsSprint: true, color: '#5c5a4a', habitat: 'any',
    desc: '失明，靠回声定位。四条手臂，其中一对专门用来抬起并投掷巨石。领地性极强。',
    codex: {
      no: 'Camo Crawler', danger: '4 级（高威胁）', habitat: 'Level 8 · Handyland 及周边洞系',
      behavior: '完全失明，用回声定位锁定目标；一旦锁定，会用四条手臂中的一对抬起巨石远距离投掷。对闯入领地的反应极其激烈。',
      counter: '它听不见「安静」。蹲行、避免奔跑、别在开阔洞厅里被它对上——石头的射程比你以为的远。',
      lore: [
        '本层特征性地黑暗，而且会主动削弱光：一支 100 流明的标准手电在这里只发出约 12 流明。对一个失明的猎手来说，这是主场。',
        '它的四条手臂分工明确：前一对负责移动与攀附，后一对专职投掷。M.E.G. 记录过一次超过三十米的命中。',
        '与 Handyland 的 Smilers、Nguithr\'xhurs 共享领地，但彼此从不冲突——原因未知。',
      ],
      sighting: '「它先是不动。你以为它没发现你。它是在听你还会不会再迈一步。」',
    },
    aggroStinger: true,
  },
  lightguide: {
    type: 'lightguide', name: '引路者', hp: 30, speed: 1.4, damage: 0, sight: 8, hearing: 6,
    passive: true, friendly: true, color: '#66e0d0', habitat: 'any',
    desc: '生物发光的小生物，外观像一颗缀满宝石的星星，发出蓝绿色的辉光。它不靠近，也不远离——它在等你跟上来。',
    codex: {
      no: 'Entity 35「Light Guides」', danger: '0 级（无害·友善）', habitat: 'Level 8 · Hyperspace Lane',
      behavior: '会主动协助流浪者穿过某些通道。它们在淡水溪流底部用氙气玻璃珠筑巢——把玻璃珠扔出去，它们通常会过来。',
      counter: '不需要应对。真要说的话：不要抢它们的玻璃珠，也不要在它们带路时掉队。',
      lore: [
        '后室中屈指可数的友善实体之一。栖息于 Hyperspace Lane——那是由 23 条狭窄通道构成的网络，通道内的发光细菌与真菌以杏仁水沉积物为食，提供着微弱的自然照明。',
        '同一水系里还有无眼的鱼、虾和蝾螈。溪底能找到氙气玻璃珠，那是引路者的筑巢材料。',
        '没有人知道它们为什么帮忙。Harmouth 洞穴学会的说法是：「在这种地方，愿意等你的东西就值得跟着。」',
      ],
      sighting: '「洞顶飘着几点蓝绿色的光。它们没有靠近，也没有远离。我跟了三个小时，出来了。」',
    },
    aggroStinger: false,
  },
  deathrat: {
    type: 'deathrat', name: '死亡鼠', hp: 26, speed: 3.1, damage: 9, sight: 5, hearing: 8,
    color: '#3e3630', habitat: 'any',
    desc: '成群出没的原生啮齿实体。它们在具有双向重力的洞穴天顶筑巢，靠通风管道往返 Level 2。',
    codex: {
      no: 'Death Rats（Level 8 原生种）', danger: '2 级（低威胁·成群时 3 级）', habitat: 'Level 8 · Rottnest Jungle 天顶',
      behavior: '单只几乎不构成威胁，成群时会把人逼进死路。它们沿着连通 Level 2 的通风管道两头跑。',
      counter: '它们怕光也怕响动。一次踢击、一支荧光棒，通常足够让整群散开。',
      lore: [
        'Rottnest Jungle 是一个拥有独特双向重力的巨大洞厅，死亡鼠群落就栖息在它的「天顶」上——从下往上看，那是一整片倒挂的巢。',
        '鼠类排泄物形成的肥沃土壤，支撑起了洞厅里那片多彩的生物发光蘑菇森林，部分能长到小树那么大。整个生态系统的底座，是老鼠拉的屎。',
        '经 Rottnest Jungle 天顶的通风口可以离开 Level 8 前往 Level 2——但因死亡鼠数量太多，M.E.G. 不建议这条路。',
      ],
      sighting: '「抬头的时候我以为洞顶在动。洞顶确实在动。」',
    },
    aggroStinger: false,
  },
  wretch: {
    type: 'wretch', name: '可怜虫', hp: 75, speed: 1.8, damage: 20, sight: 6, hearing: 6,
    color: '#8a4a3a', habitat: 'any',
    desc: '红棕色、干燥剥落的皮肤，布满孔洞与脓疱；骷髅般消瘦，眼睑已经溶解——它的眼睛永远闭不上。',
    codex: {
      no: 'Entity 15「Wretches」', danger: '3 级（中威胁·具传染性）', habitat: 'Level 8 难民营 / Level 9 郊区',
      behavior: '行为近似僵尸：迟缓、执着、成群。它们曾经是人——转化过程被认为源于食物、水与睡眠的长期剥夺。',
      counter: '保持距离，不要被抓伤。M.E.G. 明确要求：出现皮肤发红剥落、眼球充血、脱发等症状者立即就医。这是传染病，不是隐喻。',
      lore: [
        '第 2 阶段：皮肤与肌肉组织以非自然的方式溶解，形成孔洞与脓疱，渗出浓稠的红棕色分泌物；表皮发红剥落，眼球充血发炎，脱发。',
        '第 3 阶段：指甲与牙齿脱落，并在身体别处以异常的数量和尺寸重新长出；眼睑、嘴唇与软骨溶解，眼睛永久无法闭合，在眼窝中狂乱转动。',
        '部分个体出现更严重的突变：错位的眼睛、脱臼或多余的肢体，甚至是肉质的、骨骼状的「翅膀」。在无人监管的难民营里，它们蔓延得最快。',
      ],
      sighting: '「营地第九天，有人开始不睡觉。第十四天，那个人不再说话。第十六天，我们烧了那顶帐篷。」',
    },
    aggroStinger: true,
  },

  // ==================== Level 9「The Suburbs」 ====================
  watcher: {
    type: 'watcher', name: '观察者', hp: 120, speed: 0.7, damage: 34, sight: 12, hearing: 4,
    beamAttack: true, color: '#d8d2c4', habitat: 'outdoor', // L9 郊区街道
    desc: '巨型眼球状结构，表面伸出多条视神经与血管，静默悬浮。它发射的光束能把活体瞬间化为细灰色粉尘。',
    codex: {
      no: 'Entity 96「The Neighborhood Watch」· Watchers', danger: '5 级（极端威胁）', habitat: 'Level 9',
      behavior: '悬浮不动，缓慢转向。锁定后从远距离发射光束——被击中的活体会当场化为细灰色的粉尘。',
      counter: '打断视线：绕到房屋、栅栏或树后。⚠ 最重要的一条：**绝对不要把 Pockets 带进 Level 9**，那会立刻把它们全部引来。同时关闭一切电子设备。',
      lore: [
        '邻里守望分三种形态：Watchers（悬浮的巨型眼球）、Striders（六足猎手）、Swimmers（犬类大小的水生变种，八条视神经呈章鱼式排列）。',
        '它们会破坏并腐蚀电子设备。M.E.G. 的现场纪律是：进入 Level 9 前关机、取出电池、检查背包里有没有 Object 51。',
        '本层没有任何已建立的基地或社区。这不是巧合。',
      ],
      sighting: '「它没有眨眼，因为它没有眼睑。它只是转过来，然后我旁边那个人变成了地上的一小堆灰。」',
    },
    aggroStinger: true,
  },
  strider: {
    type: 'strider', name: '阔步者', hp: 150, speed: 2.9, damage: 38, sight: 10, hearing: 7,
    charger: true, huge: 1.6, color: '#c8b9a4', habitat: 'outdoor', // L9 街道巡逻
    desc: '中央一颗眼球，下方六条约 2.4 米长的附肢——由脉络膜、神经与血管构成。体积约一辆汽车大小。',
    codex: {
      no: 'Entity 96「The Neighborhood Watch」· Striders', danger: '5 级（极端威胁）', habitat: 'Level 9',
      behavior: '六足奔行，速度极快。抓住猎物后以高达 90 英里/小时的速度把对方往地面或墙面猛砸。',
      counter: '进屋、关门、别用手电。它在开阔街道上是无解的；郊区房屋的门框是你唯一的地形优势。',
      lore: [
        '附肢的构成材料被逐条确认过：脉络膜、视神经、血管。它不是长了腿的眼睛，它是把眼睛的组成部分当腿在用。',
        '与 Watchers 共享一套感知——一只发现你，全部都知道。',
        'Level 9 是一片处于午夜时分的无限郊区，黑暗程度与 Level 6 相仿。你听得见它踩在湿沥青上的六声落点，但要等它进了路灯下才看得见。',
      ],
      sighting: '「六下。每一步之间的间隔是一样的。然后间隔变短了。」',
    },
    aggroStinger: true,
  },
  mangled: {
    type: 'mangled', name: '残破者', hp: 320, speed: 1.5, damage: 50, sight: 9, hearing: 10,
    voiceLure: true, smokeShroud: true, huge: 3.2, color: '#4a4048', habitat: 'outdoor', // L9 PA3 区及周边山口
    desc: '体量巨大、形态不定，目击描述多为「蜘蛛状、约一栋房子大小」。它自身生成浓密翻涌的烟雾遮蔽真身——烟雾之下，是无数张人脸融合成的单一团块。',
    codex: {
      no: 'Entity 63「The Mangled」', danger: '5 级（极端威胁）', habitat: 'Level 9 · PA3 区及周边山口',
      behavior: '出现前伴随气温骤降与地面震动——它的体量足以自行制造天气现象。以触须捕捉猎物并将其吸收同化；被同化者的声音会出现在它此后的发声里。',
      counter: '它会主动用你熟悉的人脸和声音诱骗你靠近。有记录的逃脱方式只有一种：no-clip 撤离。听见有人在雾里叫你的名字，就往反方向走。',
      lore: [
        '目击报告的差异极大，因为几乎没有人看到过烟雾以下的部分。少数报告一致的地方是：那不是一个身体，那是很多张脸挤在一起，构成类似大脑的整体结构。',
        '雾是它出生的方式。Level 9 的街道起雾时，M.E.G. 的守则是立即离开当前街区，不要判断，不要确认。',
        '「你能在它的发声中听见受害者的声音」——这句话在档案里被单独列为一条，不属于任何段落。',
      ],
      sighting: '「雾里是我父亲的声音。我父亲三年前就在 Level 4 没的。我转身跑了。」',
    },
    aggroStinger: true,
  },

  // ==================== Level 10「Bumper Crop」 ====================
  soilworm: {
    type: 'soilworm', name: '土壤蠕虫', hp: 18, speed: 1.6, damage: 7, sight: 2, hearing: 5,
    ambusher: true, color: '#8a6a52', habitat: 'outdoor', // L10 田野地表下
    desc: '栖息在地表以下约一米处的小型蠕虫状实体。只要你不往深处挖，它们就一直待在下面。',
    codex: {
      no: 'Level 10 原生蠕虫（未正式命名）', danger: '1 级（低威胁）', habitat: 'Level 10 · 地表以下约 1 米',
      behavior: '平时完全不出土。向更深处挖掘会引发它们大量、迅速地涌出，并存在钻入皮肤的风险。',
      counter: '别挖。这是 Level 10 唯一需要遵守的规则——本层敌对实体评分是 0/5，前提是你不动土。',
      lore: [
        'Level 10 的官方生存难度是 Class 1：逃脱难度 2/5、环境风险 1/5、敌对实体 0/5。整片无限延伸的麦田里，唯一有记录的生物就是它们。',
        '土壤具疏水性，无法灌溉；土路上播下的种子不会发芽。这片田地长得出小麦，却拒绝一切别的东西——包括你想埋下去的任何念头。',
        'M.E.G. 已停止在本层收割小麦，理由是对其营养价值存疑。他们没有说是因为蠕虫。',
      ],
      sighting: '「我们挖到第三铲的时候，土整个动了起来。我们把铲子扔在那儿走了。」',
    },
    aggroStinger: false,
  },

  // ==================== Level 601「The End」 ====================
  partygoer: {
    type: 'partygoer', name: '派对客', hp: 130, speed: 2.5, damage: 34, sight: 8, hearing: 7,
    feignNeutral: true, secondArms: true, color: '#e8c93c', habitat: 'indoor',
    desc: '高大的两足噩梦，光滑的皮革质感皮肤，通体鲜黄。脸上刻着一个涂满血的笑脸符号「=)」。长而软的面条状手臂，末端不是手，而是环着倒钩牙的吸盘状的口。',
    codex: {
      no: 'Entity 67「Partygoers =)」', danger: '5 级（极端威胁）', habitat: 'The SS Fun =) · Level 601',
      behavior: '会先装作友善——它们真的以为自己在办派对。近身后胸前甲壳会打开，弹出藏在里面的第二对强壮带爪之手。那才是攻击形态。',
      counter: '它们近视。保持八米以上距离、不要接受任何递过来的东西、绝对不要吃它们的蛋糕（M.E.G. 档案原文：DO NOT EAT）。',
      lore: [
        '皮肤主色为鲜黄，另有红、蓝、绿、白等变体记录。腿部厚重呈块状，皮肤光滑如皮革——不是毛皮，也不是黏膜。',
        '脸上那个用血涂出的「=)」，其笑弧形状与恐惧蜈蚣（Phobic Centipede）的笑弧完全一致。Myra Oberlyn 的解剖图里专门标注了这一点。',
        '⚠ 关于「从 Level 1 天花板 no-clip 就能进入派对层」的传闻，全部已被证伪。它们出现在 Level 601 的原因是：那里有一场永远不散的、为你量身定制的派对。',
      ],
      sighting: '「它把蛋糕推到我面前，胸口咔哒响了一声。我没有低头看。」——M.E.G. 档案 partygoerCakeCC。',
    },
    aggroStinger: true,
  },

  // ==================== 跨层：Entity 2 ====================
  windowent: {
    type: 'windowent', name: '窗户', hp: 90, speed: 0, damage: 32, sight: 5, hearing: 0,
    stationary: true, ambusher: true, color: '#6a5a44', habitat: 'indoor',
    desc: '一扇再普通不过的木框窗，玻璃后是一片模糊扭曲、却诡异地熟悉的风景。风景里站着一个深色的、轮廓不清的人形剪影。',
    codex: {
      no: 'Entity 2「Windows」', danger: '4 级（高威胁·固定）', habitat: 'Level 0 / 24 / 77 / 79 / 80 / 102 / 103 / 108 / 116 / 117 / 406',
      behavior: '在任何表面显现，但遵循基本建筑逻辑，偏好墙面而非天花板；常直接占据既有窗户的位置。靠得太近的人会被拽进去。',
      counter: '每个人看到的风景都不一样，因为影像来自你自己的感知。**不要长时间注视，不要伸手，更不要走近。**',
      lore: [
        '它是由持续认知思维构成的掠食性思维空间的物理显现。每扇窗显示的风景与窗外的真实环境毫无关系。',
        '「被占据的窗」内有一个深色、轮廓不清的人形剪影。幸存者称那剪影像自己认识的人，有时同时像好几个人。新形成的被占据窗，其剪影的体型与身高会与被吞噬者一致。',
        '剪影会逐渐失去清晰度与不透明度，直到无法辨认——除非它吞噬新的受害者。所以一扇「清晰的窗」，意味着它最近吃过东西。',
      ],
      sighting: '「窗外是我小时候家门口那条路。我家在三楼，那条路不可能在这个高度。」',
    },
    aggroStinger: true,
  },
}
