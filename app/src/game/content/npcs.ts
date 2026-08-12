// NPC 注册表：据点中有名有姓的居民——每人都有姓名、职业、性格与经历。
// NPC 不是实体（不进 ENTITIES / m.entities，开发者面板不可召唤）；
// 建模复用玩家模型（buildPlayerModel），每人的形象为手工定制的固定配置（独特、精致、不变），
// 制服经上衣/徽章定制，标志性配饰由渲染层按 id 附加。
// 对话：lines 为预制对话树（未接入 LLM API 时玩家只能选预制回复）；
// 接入 API 后可在 DialogOverlay 自由输入（人设由 personality/background 组装 system prompt）。
import type { AvatarCfg } from '../core/avatar'
import { DEFAULT_AVATAR } from '../core/avatar'

export interface DialogueNode {
  npc: string // NPC 台词
  opts: { text: string; next?: number; action?: 'trade' | 'leave' }[] // 玩家回复选项
}

export interface NpcDef {
  id: string
  name: string
  role: string // 职业
  faction?: string // 所属团体（factions.ts；缺省 'meg'）
  personality: string // 性格
  background: string // 经历
  uniform?: { top: string; topStyle?: number; badge?: string } // 制服：上衣色/款式 + 胸口徽章色
  avatar: Partial<AvatarCfg> // 形象（手工定制的固定配置：性别/发型/发色/肤色/裤色/表情；上衣由制服覆盖）
  currency?: 'eaglecoin' | 'presses' | 'almond' // 交易货币（缺省天鹰币；BNTG 系为压印币；v54：'almond'=直接以杏仁水计价为 Gamma 基地军需官所用——wikidot 惯例杏仁水是通用等价物）
  trade?: { item: string; price: number }[] // 商品（按 currency 货币定价）
  barter?: { give: string; giveN: number; get: string; getN: number; give2?: string; give2N?: number }[] // 以物易物（玩家给 give×giveN[ + give2×give2N]、换得 get×getN；阿丽亚娜/Tom 的餐馆无货币专用，与 trade 互斥）
  workLoop?: 'hammer' | 'saw' | 'paint' | 'mop' // v39：装修工作循环动作（BRC 员工：锚定工作点不游荡，渲染层 procedual 驱动手臂+工具）
  warehouse?: 'meg' | 'bntg' // v54：寄存仓库 NPC——声望 ≥10（或 BNTG 付 5 压印币临时）时对话出现「寄存物品/取回物品」（阵营互通仓库，48 栏位）
  medic?: boolean // v55：医疗身份 NPC（杜邦/马丁/莫雷尔/萨伊拉）——疫疾三阶以上对话出现「求治感染」（清除感染值）
  lines: DialogueNode[] // 预制对话树（0=开场）
  idle: string[] // 自言自语（头顶气泡）
}

/** NPC 形象：固定配置（独特、精致、不变），制服覆盖上衣 */
export function npcAvatar(def: NpcDef): AvatarCfg {
  const cfg = { ...DEFAULT_AVATAR, ...def.avatar }
  if (def.uniform) { cfg.top = def.uniform.top; cfg.topStyle = def.uniform.topStyle ?? 3 }
  return cfg
}

// ---------- v35：随机 NPC（据点空旷区的普通居民：名称/职业/性格/经历随机且不重叠） ----------
import { randomAvatar } from '../core/avatar'

const RAND_NAMES = ['卡尔', '安娜', '汤姆', '阿岚', '罗伊', '米娅', '老周', '埃文', '索菲', '杰克', '妮娜', '卢卡斯']
const RAND_ROLES = ['巡逻队员', '后勤厨师', '仓库管理员', '维修学徒', '园丁', '向导', '图书助理', '哨兵']
const RAND_PERS = [
  '沉默寡言，但做事极稳。',
  '热心肠，见谁都聊两句。',
  '谨小慎微，规矩挂在嘴边。',
  '大大咧咧，笑声比脚步声先到。',
  '慢条斯理，说什么都要想三秒。',
  '眼里有活，手上永远停不下来。',
]
const RAND_BGS = [
  '三年前从 Level 0 被巡逻队救回，此后再没离开过基地。',
  '曾是外勤干员，膝盖受伤后转为内勤。',
  '在基地出生的第二代，熟悉这里的每一条走廊。',
  '随 Gemma 基地的商队而来，最后留在了这里。',
  '记不得自己怎么切进来的——是夜莺从电波里找到了他。',
  '在别的定居点待不下去，听说这里「规矩但管饭」就来了。',
]
const RAND_IDLE = [
  '今天的配给表看了吗……',
  '走廊这头的灯又闪了。',
  '听说跃金段又停电了。',
  '巡逻队今天回来得挺早。',
  '食堂今晚有加餐，别去晚了。',
  '这批补给得点两遍数。',
]

/** 生成 n 名随机 NPC（同一 rand 源下确定；名称/职业/性格/经历各自不重叠；按团体换名称/职业/经历/闲聊池） */
export function genRandomNpcs(rand: () => number, n: number, faction: 'meg' | 'bntg' | 'ariane' | 'mixed' | 'el3a' = 'meg'): NpcDef[] {
  const shuf = <T,>(arr: T[]): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
    return a
  }
  const bntg = faction === 'bntg'
  const ariane = faction === 'ariane'
  const el3a = faction === 'el3a' // v46：EL3A 仓储物流风味（不再与 Tom 餐馆的 mixed 共用）
  const mixed = faction === 'mixed' // v38：Tom 的餐馆食客——来自不同团体的流浪者（faction 按序轮换，对话提及来历）
  const names = shuf(ariane
    ? ['卡米尔', '蕾雅', '马蒂斯', '奥雷利安', '索菲', '朱利安', '克洛伊', '埃洛迪', '雷诺', '玛戈', '露易丝', '巴斯德']
    : el3a
    ? ['鲁索', '马尔科', '黛安', '科瓦奇', '贝伦特', '阿丽克', '托宾', '芙蕾', '加斯东', '娜迪亚', '埃米尔', '珀尔']
    : bntg
    ? ['薇拉', '班', '罗恩', '黛西', '奥斯卡', '皮普', '汉娜', '格雷', '桑迪', '莫特', '莉兹', '科林']
    : mixed
    ? ['小林', '玛尔塔', '老宋', '佩德罗', '阿依莎', '凯文', '陈默', '伊万', '格蕾丝', '哈桑', '薇薇安', '阿岩']
    : RAND_NAMES)
  const roles = shuf(ariane
    ? ['护工', '药剂师', '化验员', '消毒员', '档案护士', '救护学徒']
    : el3a
    ? ['叉车司机', '盘点员', '质检员', '装卸学徒', '仓管文员', '押运护卫']
    : bntg
    ? ['店员', '账房学徒', '押运员', '摊位主', '信使', '鉴定学徒', '仓库点数员', '采购员']
    : mixed
    ? ['避难者', '旅人', '吟游诗人', '行商', '前哨队员', '讲故事的人']
    : RAND_ROLES)
  const pers = shuf(RAND_PERS)
  // v38：mixed 食客的经历按各自团体轮换（每人一句来历；轮换确定，同团体内部不重叠）
  const MIXED_FACS = ['meg', 'bntg', 'ariane', 'wanderer'] as const
  const MIXED_BGS: Record<(typeof MIXED_FACS)[number], string[]> = {
    meg: shuf(['在 Alpha 基地受训的新干员，休班溜出来吃顿热的。', '替罗经点小队跑腿的，地标布到哪里，人就走到哪里。', 'Alpha 基地的仓库点数员——食堂的饭吃腻了，你懂的。']),
    bntg: shuf(['商人之家的押运员，跑完一趟跃金段就想来点热汤。', '做买卖路过天鹰段——算账算到半夜，来这儿透口气。', '替保险库送货的，回程路上闻见香味就拐进来了。']),
    ariane: shuf(['希波克拉底 - 1 的护工，下夜班来喝一碗热汤。', '给研究所送样本回来，顺道歇脚。', '药房里闻了一天消毒水，来这儿闻闻番茄味。']),
    wanderer: shuf(['没有团体的散人，靠捡补给和讲故事换饭吃。', '还在找出口的普通流浪者——和你一样。', '在维护通廊躲了三天停电，出来第一件事就是找口热的。']),
  }
  const FAC_FULL: Record<(typeof MIXED_FACS)[number], string> = { meg: 'M.E.G.', bntg: 'B.N.T.G.', ariane: '阿丽亚娜集团', wanderer: '无团体' }
  const bgs = shuf(ariane
    ? ['医学院没毕业就切进了后室，在这里才算真正学完了医。',
      '随赫尔墨斯团队的勘探队行医三年，最后留在研究所。',
      '家人在「疫疾」里没有撑过来——从此再没离开过药房。',
      '被希波克拉底团队从 Level 2 的蒸汽里救回来，决定留下来报恩。',
      '在前厅是护士，在后室还是护士——这里的病人更需要她。',
      '听说这里「干净、明亮、管饭，还能救人」，就再没想过别的地方。']
    : el3a
    ? ['在 Level 3 的电站边抢了三年货，调来 EL3A 那天睡了整整两天。',
      '跑 L2-L3 物资线的老押运，认得每一道蒸汽阀门的声音。',
      '商人之家调来的账房，嫌市场街太吵，主动申请来看仓库。',
      '在整洁的廊道里迷过路，是分拣队把他捡回来的——后来就留下了。',
      '麦考利的老部下，跟着他从跃金段一路调到 EL3A。',
      '以前在 Level 11 的货站干活，切错了门，干脆在 EL3A 落了脚。']
    : bntg
    ? ['随身贩商队走了三年，最后决定留下来看店。',
      '欠了奥托一个人情，正在打工还债。',
      '在新时代广场长大的，来商人之家轮岗。',
      '据说最会砍价，但从不对新人出手。',
      '押运时差点把货丢进红室，从此只做内勤。',
      '跟着商队跑遍了跃金段，认得每一块地砖。']
    : RAND_BGS)
  const idles = shuf(ariane
    ? ['三号床的体温记录该更新了。',
      '消毒液又见底，得去催配给。',
      '走廊尽头的门记得随手关——无菌区。',
      '今天的空气过滤网换过了吗？',
      '绷带按床头发放，别多拿。',
      '勒费弗尔又在征集奇怪的样本了。']
    : el3a
    ? ['十七号排的托盘又歪了。',
      'Level 3 那批货今晚到，得腾出两排货架。',
      '盘点表差三箱，谁动过五号排？',
      '押运组还没回来，外面的蒸汽声不对劲。',
      '直销价归直销价，账不能乱。',
      '夹楼的灯别关，麦考利主管说的。']
    : bntg
    ? ['今天的汇率没动，稳。',
      '那批货还在保险库里压着。',
      '商队明天走跃金段东线。',
      '别碰货架，碰了就得买。',
      '收银台少两枚压印币，谁拿的？',
      '新到一批货，点数到半夜。']
    : mixed
    ? ['这口热汤，值半条命。',
      'Tom 说今天的面包是新烤的。',
      '别问来历——吃饭的时候，大家都是邻居。',
      '下一站去哪？吃完再说。',
      '听说哥特段又停电了……先喝汤。',
      '这儿的千层面，值得专门跑一趟。']
    : RAND_IDLE)
  const out: NpcDef[] = []
  for (let i = 0; i < n; i++) {
    const name = names[i % names.length]
    const role = roles[i % roles.length]
    const per = pers[i % pers.length]
    const fac = mixed ? MIXED_FACS[i % MIXED_FACS.length] : el3a ? 'bntg' : faction // v46：el3a 风味池的 NPC 仍属 BNTG（声望/对话按团体）
    const bg = mixed ? MIXED_BGS[fac as (typeof MIXED_FACS)[number]][Math.floor(i / MIXED_FACS.length) % 3] : bgs[i % bgs.length]
    const guard = ariane || mixed ? false : el3a ? role === '押运护卫' : bntg ? role === '押运员' : role === '巡逻队员' || role === '哨兵'
    out.push({
      id: `rand_${i}`,
      name,
      role,
      faction: fac,
      personality: per,
      background: bg,
      uniform: ariane // 希波克拉底团队全员白色制服 + 紫徽章
        ? { top: '#eceef2', topStyle: 3, badge: '#8676e2' }
        : el3a // EL3A 仓储队：BNTG 灰绿制服全员统一
        ? { top: '#5c6d5e', topStyle: 3, badge: '#e8e8e0' }
        : mixed // 食客：有团体的穿该团体色上衣，流浪者便装
        ? fac === 'meg' ? { top: '#a5a45a', topStyle: 3, badge: '#2a2d33' }
        : fac === 'bntg' ? { top: '#5c6d5e', topStyle: 3, badge: '#e8e8e0' }
        : fac === 'ariane' ? { top: '#eceef2', topStyle: 3, badge: '#8676e2' }
        : undefined
        : guard ? (bntg ? { top: '#5c6d5e', topStyle: 3, badge: '#e8e8e0' } : { top: '#c9a03a', topStyle: 3, badge: '#2a2d33' }) : undefined,
      avatar: randomAvatar(rand),
      currency: bntg || el3a ? 'presses' : mixed ? undefined : 'eaglecoin',
      lines: mixed
        ? [
          {
            npc: `哦，生面孔。我是${name}，${role}。${per.replace('。', '——')}${bg}……你也是来吃饭的？随便坐，Tom 的炉子就没熄过。`,
            opts: [
              { text: '你是哪个团体的人？', next: 1 },
              { text: '不打扰你吃饭了。', action: 'leave' },
            ],
          },
          {
            npc: fac === 'wanderer'
              ? '哪个团体都不是。我一个人走，走到哪算哪——不过 Tom 这儿我总会绕回来。他的热汤，比大多数团体的人情味都足。'
              : `${FAC_FULL[fac as (typeof MIXED_FACS)[number]]}的人——${fac === 'meg' ? '在 Alpha 基地有铺位，但食堂的饭……你懂的。' : fac === 'bntg' ? '买卖归买卖，吃饭归吃饭。' : '研究所里只有配给和消毒水味。'}不过在这儿没人管你是哪个团体的，Tom 只问你带没带食材。`,
            opts: [{ text: '有道理。回头见。', action: 'leave' }],
          },
        ]
        : [
        {
          npc: ariane
            ? `你好，我是${name}，研究所的${role}。${per.replace('。', '——')}${bg}需要处理伤口，还是随便看看？`
            : el3a
            ? `哦，生面孔。${name}，EL3A 的${role}。${per.replace('。', '——')}${bg}……要换货去楼下兑换间，要搭话就快点，手上还有活。`
            : bntg
            ? `${name}，${role}。${per}${bg}……总之，要买点什么，还是先逛逛？`
            : `你好，我是${name}，基地的${role}。${per.replace('。', '——')}${bg.includes('第二代') ? '，我可是在这儿长大的。' : ''}有什么事吗？`,
          opts: [
            { text: ariane ? '研究所里最近怎么样？' : el3a ? '这条物资线是怎么跑的？' : bntg ? '最近生意怎么样？' : '基地里最近怎么样？', next: 1 },
            { text: '没什么，随便走走。', action: 'leave' },
          ],
        },
        {
          npc: ariane
            ? `${bg}……所以对我来说，能在这里救人就是全部意义了。你要是带着医疗物资，医师和护士长都收——我们这儿只认能救命的东西。`
            : el3a
            ? 'L2、L3 搜刮来的物资先进 EL3A 的中转仓，清点、打包、贴签，再由押运组送往各层级的居住地——Alpha 基地的电池、商人之家的罐头、希波克拉底的绷带，都打这儿过。你要是腿脚利索，去找麦考利主管，他那儿永远缺押运的人。'
            : bntg
            ? '生意就是一切进一切出。你有货，我有价；你有钱，我有货。公平得很。'
            : `${bg}……所以对我来说，这里就是家了。你呢，流浪者？要是还没地方去，跟Justin聊聊，他最会安置新人。`,
          opts: [{ text: ariane ? '多谢，回头见。' : el3a ? '回头见。' : bntg ? '回头见。' : '多谢，回头见。', action: 'leave' }],
        },
      ],
      idle: idles.slice(0, 3),
    })
  }
  return out
}

/** 运行时 NPC 状态（引擎每帧驱动：就近游荡 + 偶尔自言自语） */
export interface NpcState {
  id: string
  def: NpcDef
  x: number; y: number; facing: number
  floor?: 0 | 1 | 2 // v46：所在楼层带（0=主层 1=上层；缺省 0）——多层据点的上层居民（EL3A 夹楼办公区）；v54：2=第三层（Gamma 基地行政部）
  homeX: number; homeY: number // 岗位锚点（游荡不远离）
  homeFacing?: number // v39：工作点朝向（BRC 员工锚定面向墙/脚手架；普通 NPC 不设）
  tx: number; ty: number // 当前挪动目标
  moveT: number // 下次决策倒计时
  bubbleText: string // 自言自语内容（头顶气泡）
  bubbleT: number // 气泡剩余秒数
  // v39：敌对/生命（BRC 员工——坦白后转为敌对：追击+近战；可被玩家反击杀死）
  hostile?: boolean
  hp?: number // 缺省=不可伤害（据点居民）；BRC 员工生成时初始化
  dead?: boolean
  deathT?: number // 死亡动画剩余秒数（渲染层倒地/下沉，归零后移除）
  atkT?: number // 敌对近战冷却
}

// ================= v39：后室装修公司（BRC）员工 =================
// 穿制服的黑影：没有面部特征的黑色剪影 + 淡蓝搭扣风衣/红肩铠/白围裙/棕羊毛裤/黑雨靴/
// 黑腰带/深灰军式贝雷帽（正面金属徽章按级别铜/银/金）。名称取自家用物品/果蔬英文名
// （wikidot 员工「Toaster」梗）；沉默——对话从不回应；锚定在工作点保持装修动作；
// 不会交易。定义按 chunk 坐标确定性生成（同种子同 chunk 必得同一批员工）。
export const BRC_WORKER_NAMES: readonly string[] = [
  'Spoon', 'Kettle', 'Apple', 'Chair', 'Broom', 'Onion', 'Towel', 'Lamp', 'Plum', 'Wrench',
  'Bucket', 'Mirror', 'Candle', 'Fork', 'Carpet', 'Potato', 'Shelf', 'Melon', 'Brush', 'Pillow',
  'Stool', 'Radio', 'Curtain', 'Blanket',
]
export const BRC_WORK_LOOPS = ['hammer', 'saw', 'paint', 'mop'] as const
export type BrcWorkLoop = (typeof BRC_WORK_LOOPS)[number]
// 级别徽章（贝雷帽正面金属徽章材质；wikidot：最低铜，然后银，随后金）
export const BRC_BADGE: Record<string, { tier: string; color: string }> = {
  copper: { tier: '铜', color: '#b87333' },
  silver: { tier: '银', color: '#c0c0c8' },
  gold: { tier: '金', color: '#d4af37' },
}

// 本地 FNV 哈希（与 infinite.ts 的 h32 同源；npcs.ts 不引 infinite 避免环）
const bh32 = (...nums: number[]): number => {
  let h = 0x811c9dc5
  for (const n of nums) {
    h ^= n >>> 0
    h = Math.imul(h, 0x01000193)
    h ^= h >>> 13
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 16
  }
  return h >>> 0
}
const bh01 = (...n: number[]) => bh32(...n) / 4294967296

/** 确定性生成第 i 名 BRC 员工定义（同种子同 chunk 同序号必一致） */
export function brcWorkerDef(seed: number, cx: number, cy: number, i: number): NpcDef {
  // 同 chunk 员工不重名：第 0 名直取，其余从排除前面名称的余池中取
  const first = BRC_WORKER_NAMES[bh32(seed, 0xbb1, cx, cy, 0) % BRC_WORKER_NAMES.length]
  const name = i === 0
    ? first
    : BRC_WORKER_NAMES.filter((n) => n !== first)[bh32(seed, 0xbb2, cx, cy, i) % (BRC_WORKER_NAMES.length - 1)]
  const r = bh01(seed, 0xbb3, cx, cy, i)
  const rank = r < 0.6 ? 'copper' : r < 0.9 ? 'silver' : 'gold' // 铜最常见，金罕见
  const badge = BRC_BADGE[rank]
  const workLoop = BRC_WORK_LOOPS[bh32(seed, 0xbb4, cx, cy, i) % BRC_WORK_LOOPS.length]
  return {
    id: `brc_${cx}_${cy}_${i}`,
    name,
    role: `装修员工 · ${badge.tier}徽`,
    faction: 'brc',
    personality: '沉默。无论你说什么、做什么，他都没有停下手里的活。',
    background: `后室装修公司的${badge.tier}徽员工。漆黑的剪影轮廓上看不到任何五官，制服却笔挺得像刚熨过。他手中的活计从不停歇——仿佛「装修」本身就是他存在的全部意义。`,
    uniform: { top: '#7a9ab8', topStyle: 3, badge: badge.color }, // 淡蓝搭扣风衣（贝雷帽徽章色复用 badge 字段）
    avatar: { gender: 0, hair: 0, hairColor: '#0b0b0e', skin: '#0b0b0e', pants: '#6a4e34', pantsStyle: 0, face: 0 }, // 黑影：皮肤/发色近黑
    workLoop,
    lines: [{ npc: '（对方没有回应，继续手中的活。）', opts: [] }], // 沉默：永不回应
    idle: [], // 沉默：没有自言自语
  }
}

// ================= v45：杰瑞的信众（The Followers Of Jerry） =================
// L2 信众宣传间驻防的信众：外文音译名 + 主题色制服（#4142a5 上衣 / #0071c9 徽章）。
// 定义按房间槽位确定性生成（同种子同房必得同一人）。行为（approach 主动靠近+传教/敌意阈值）
// 由引擎按 faction='jerry' 驱动；对话专属选项见 DialogOverlay 的 jerry 分支。
import { RNG } from '../core/rng'

/** 信众传教词（approach 停下后高频自言自语的 bubble 池；v48 圣经体：庄重、排比，「祂」「尔等」「凡」） */
export const JERRY_PREACH_LINES: readonly string[] = [
  '鹉主杰瑞，至大至圣，凡有气息者皆当颂祂的名。',
  '尔等感受过祂的凝视吗？祂的眼目遍察每一条廊道。',
  '蓝羽者，圣也；凡见祂羽色者，便见了光。',
  '凡诵念鹉主之名的，廊道必为他缩短，门必为他敞开。',
  '尔等疲乏的流浪者啊，来吧，鹉主的荫下必有安息。',
  '祂知道每一扇门后的路，凡跟随祂的，必不迷失。',
  '兄弟姐妹啊，你心困苦吗？鹉主的光必照你前行。',
  'Level 274 是圣地——祂的宝座立在那里，直到永远。',
  '不要害怕，鹉主喜悦访客，如同牧者喜悦迷羊归栏。',
  '你今日赞美鹉主了吗？受恩者不可忘记祂的恩典。',
]
/** 玩家被教化后的诵咏词（HUD 消息流；Level 274 内周期性不受控咏出） */
export const JERRY_CHANT_LINES: readonly string[] = [
  '鹉主杰瑞，至大至圣，愿祂的名受颂赞，直到永远……',
  '赞美蓝羽，赞美鹉主，从今时直到世世代代……',
  '杰瑞在上，指引我路，纵经暗廊也不惧怕……',
  '凡诵祂名的，廊道退避；凡信祂的，墙壁让路……',
  '我愿栖息于祂的穹顶之下，如雀鸟归于檐前……',
  '祂目光所及之处，即为圣地，即为家园……',
]

const JERRY_FOLLOWER_NAMES: readonly string[] = [
  '佩珀', '珀莉', '泽弗', '科拉', '奥利弗', '芙罗拉', '德鲁', '塞西', '米拉', '格温', '劳尔', '蒂娜',
]

/** 确定性生成信众定义（同种子同槽位序号必一致；nums=房间槽位坐标哈希输入） */
export function jerryFollowerDef(...nums: number[]): NpcDef {
  const id = `jerry_${nums.join('_')}`
  const name = JERRY_FOLLOWER_NAMES[bh32(0x7e1, ...nums) % JERRY_FOLLOWER_NAMES.length]
  const rng = new RNG(bh32(0x7e2, ...nums))
  return {
    id,
    name,
    role: '信众 · 传教者',
    faction: 'jerry',
    personality: '热诚得近乎固执，开口闭口都是鹉主——仿佛世上再没有第二件值得谈论的事。',
    background: `杰瑞的信众传教者，驻守在这间贴满海报的宣传间里。${name}逢人便宣讲鹉主的伟大，并热情邀请「足够虔诚」的流浪者前往圣地 Level 274。`,
    uniform: { top: '#4142a5', topStyle: 3, badge: '#0071c9' }, // 主题色制服 + 副主题色徽章
    avatar: randomAvatar(() => rng.next()),
    lines: [
      {
        npc: `哦！一位流浪者！我是${name}，鹉主杰瑞的仆人。你来得正好——请听我一言：杰瑞是后室至大的存在，超乎一切层级，没有之一。`,
        opts: [{ text: '继续听下去。', next: 1 }],
      },
      {
        npc: '祂的蓝羽是圣的颜色，祂知道每一扇门后的路。只要你足够虔诚，我们便引你朝见祂——Level 274，杰瑞的房间。鹉主在上，祂必赐福于你。',
        opts: [{ text: '点头称是。', next: 0 }],
      },
    ],
    idle: [...JERRY_PREACH_LINES.slice(0, 3)],
  }
}

export const NPCS: Record<string, NpcDef> = {
  kat: {
    id: 'kat', name: 'Kat', role: '监督者',
    personality: '严厉务实，话里不留情面，但心里装着基地里的每一个人。',
    background: 'Alpha 基地落成那年她就在了，看着它从一圈帐篷长成一座城镇。她管理的配给表精确到每一瓶杏仁水。',
    uniform: { top: '#3a3f46', topStyle: 3, badge: '#c9a03a' },
    avatar: { gender: 1, hair: 1, hairColor: '#232326', skin: '#c9a58a', pants: '#2a2d33', pantsStyle: 0, face: 2 },
    lines: [
      {
        npc: '站住。新面孔？登记过吗？……算了，看你这样子也是刚切进来。说吧，什么事。',
        opts: [
          { text: '我想了解 Alpha 基地。', next: 1 },
          { text: '我能在这里做点什么？', next: 2 },
          { text: '打扰了。', action: 'leave' },
        ],
      },
      {
        npc: 'Alpha 基地是总署最老的家。探险署管训练和救援，研究署捣鼓瓶瓶罐罐，档案署记下一切，行政署——也就是我——盯着所有人别把这里搞砸。记住：守规矩，你就安全。',
        opts: [
          { text: '我该怎么守规矩？', next: 3 },
          { text: '明白了。', action: 'leave' },
        ],
      },
      {
        npc: '想干活？去找探险署，他们永远缺人。救援、勘探、搬东西——先证明你不会拖后腿。',
        opts: [{ text: '我会的。', action: 'leave' }],
      },
      {
        npc: '一，别在走廊里跑。二，配给按表领取，不多拿。三，听到警报就近进屋关门。做到这三条，你和我一样长寿。',
        opts: [{ text: '记下了。', action: 'leave' }],
      },
    ],
    idle: ['第三区的配给表还没送过来……', '又有人把装备堆在走廊里。', '警报器该检修了，记下来。', '今晚巡逻班次加倍。'],
  },
  justin: {
    id: 'justin', name: 'Justin Zimals', role: '监督者议会代表',
    personality: '热忱健谈，逢人先笑，迎新辞令张口就来。',
    background: '负责新流浪者的接待与资质认证，亲手写过上千封欢迎信——每一封他都坚持亲笔签名。',
    uniform: { top: '#c9a03a', topStyle: 3, badge: '#2a2d33' },
    avatar: { gender: 0, hair: 3, hairColor: '#4a3020', skin: '#f0c8a8', pants: '#3a352e', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '祝贺你，流浪者！我是 Justin Zimals，监督者议会代表。从今天起，你在 Level 1 漫无目的游荡的日子结束了！',
        opts: [
          { text: '这里真的安全吗？', next: 1 },
          { text: '什么是资质认证？', next: 2 },
          { text: '谢谢，我先四处看看。', action: 'leave' },
        ],
      },
      {
        npc: '比外面安全一万倍。墙是实的，灯是亮的，人是活的。当然——别把「安全」理解成「可以为所欲为」，Kat 会找我麻烦的，哈哈。',
        opts: [
          { text: 'Kat 是？', next: 3 },
          { text: '好地方。', action: 'leave' },
        ],
      },
      {
        npc: 'M.E.G. 资质认证！我们会评估你的本事，把你分到最合适的岗位——探险、归档、研究，或者维护社区。放心，在这里没有人闲着。',
        opts: [{ text: '我考虑考虑。', action: 'leave' }],
      },
      {
        npc: '我们的监督者。别被她的脸色吓到，她骂你的时候其实是在乎你。……这话别说是我说的。',
        opts: [{ text: '我会保密的。', action: 'leave' }],
      },
    ],
    idle: ['欢迎信又该更新了……', '下批新人的认证安排在周几来着？', '咖啡，先喝咖啡。'],
  },
  nightingale: {
    id: 'nightingale', name: '「夜莺」', role: '无线电操作员',
    personality: '沉静可靠，话极少，只有在电波里才滔滔不绝。',
    background: '三年里从电波中救回四十多个迷路的流浪者。没人见过她离开中控室，据说她睡觉也戴着耳机。',
    uniform: { top: '#3a5a4a', topStyle: 2, badge: '#c9a03a' },
    avatar: { gender: 1, hair: 4, hairColor: '#232326', skin: '#c9a58a', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '……嗯。新干员？这里是中控室。无线电二十四小时在线，迷路了就对着任何一台 M.E.G. 电台报坐标。',
        opts: [
          { text: '你是怎么救人的？', next: 1 },
          { text: '外面情况怎么样？', next: 2 },
          { text: '不打扰你值班了。', action: 'leave' },
        ],
      },
      {
        npc: '听。脚步声、呼吸、电流声下面的呼救。分辨出来，指给他们最近的地标。就这么简单，也就这么难。',
        opts: [{ text: '厉害。', action: 'leave' }],
      },
      {
        npc: '天鹰段今晚安静得反常。跃金段有三起「闪烁」。你最近别往黑的地方去——别怪我没提醒。',
        opts: [{ text: '谢了。', action: 'leave' }],
      },
    ],
    idle: ['频道 4 又有杂音……', '03 小队，收到请回答。', '这个频段的回声不对劲。'],
  },
  river: {
    id: 'river', name: 'River', role: '高级档案员',
    personality: '考据癖，一句话能引三条档案编号，对错别字零容忍。',
    background: '他撰写的层级草稿摞起来比他自己还高。坚信一份好档案能换回一条命。',
    uniform: { top: '#5a4a3a', topStyle: 1, badge: '#c9a03a' },
    avatar: { gender: 0, hair: 6, hairColor: '#4a3020', skin: '#f0c8a8', pants: '#2e3a4a', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '嘘——先别出声，我在对一段目击记录的措辞。……好了。你是新来的？档案署，River。这里的每一页纸都可能救你一命。',
        opts: [
          { text: '档案真的那么重要？', next: 1 },
          { text: '我能帮什么忙？', next: 2 },
          { text: '你去忙。', action: 'leave' },
        ],
      },
      {
        npc: '知道红室吗？知道「闪烁」吗？都是拿命换回来的字。读档案的人少走一步弯路，写档案的人就值回票价。',
        opts: [{ text: '受教了。', action: 'leave' }],
      },
      {
        npc: '会写字就行。把你见过的层级、实体、怪事原原本本告诉我，我来归档。别编——编出来的东西我会一眼看穿。',
        opts: [{ text: '成交。', action: 'leave' }],
      },
    ],
    idle: ['这条目击记录和 43 号档案矛盾……', '草稿、草稿，永远改不完的草稿。', 'Entity 96 的条目该校订了。'],
  },
  faust: {
    id: 'faust', name: '浮士德·格雷', role: '首席研究员',
    personality: '狂热好奇，一谈起生物就忘了时间，常常对着样本自言自语。',
    background: '从前站点 01.3 带来一箱子器材和一身伤疤，主持研究署的植物、微生物、人类及类人三个方向。',
    uniform: { top: '#e8e8e0', topStyle: 1, badge: '#3a5a4a' },
    avatar: { gender: 0, hair: 2, hairColor: '#9a9a9e', skin: '#c9a58a', pants: '#3a3f46', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '哦？活人！我是说——欢迎，实验室很少有不穿白大褂的访客。浮士德·格雷，首席研究员。植物、微生物、人类及类人，三个方向我都管。',
        opts: [
          { text: '你在研究什么？', next: 1 },
          { text: '类人……是指无面灵？', next: 2 },
          { text: '我先走了。', action: 'leave' },
        ],
      },
      {
        npc: '上周是杏仁水的成分逆推，这周是花园段植物的趋光性。想知道真相吗——我们对这座基地的了解，还不到它对我们的了解的万分之一。',
        opts: [{ text: '……深奥。', action: 'leave' }],
      },
      {
        npc: '正是！迷人的样本。面部平滑，没有五官，却能「看」到你。别问我怎么做到的，问就是「我们还不知道」。你要是在外面看到落单的，替我们拍张照。',
        opts: [{ text: '尽量吧。', action: 'leave' }],
      },
    ],
    idle: ['培养皿该换了……', '这个样本的细胞壁不对劲。', '通风系统滤网——谁动了我的滤网？'],
  },
  suanpan: {
    id: 'suanpan', name: '「算盘」', role: '军需官',
    warehouse: 'meg', // v54：Alpha 基地寄存 NPC
    personality: '精明热络，报价时六亲不认，算账时算盘珠子打得比枪还响。',
    background: '跑过三条贸易路线的老行商，据说能用一瓶杏仁水换出一间仓库。现在坐镇贸易路线中转站。',
    uniform: { top: '#6a3a3a', topStyle: 1, badge: '#c9a03a' },
    avatar: { gender: 0, hair: 3, hairColor: '#232326', skin: '#a87f5c', pants: '#3a352e', pantsStyle: 0, face: 1 },
    trade: [
      { item: 'skeleton', price: 8 },
      { item: 'squirtgun', price: 12 },
      { item: 'fuyouyu', price: 10 },
      { item: 'royalration', price: 30 },
      { item: 'warpberry', price: 20 },
    ],
    lines: [
      {
        npc: '哟，生面孔。军需官「算盘」，贸易路线中转站归我管。规矩：杏仁水结账，概不赊欠。想看看货？',
        opts: [
          { text: '看看货。', action: 'trade' },
          { text: '杏仁水为什么是货币？', next: 1 },
          { text: '下次再来。', action: 'leave' },
        ],
      },
      {
        npc: '甜、顶饿、镇定心神，还不愁没有。在这鬼地方，还有比这更像钱的东西吗？攒着点花，新人。',
        opts: [
          { text: '有道理。那看看货。', action: 'trade' },
          { text: '告辞。', action: 'leave' },
        ],
      },
    ],
    idle: ['这批货的账又对不上了……', '杏仁水，硬通货，永远不嫌多。', 'Gemma 基地的商队下周到。', '谁把我的算盘拿走了？！'],
  },

  // ================= BNTG 商人之家（不结盟贸易集团；压印币结算，更贵更多样） =================
  lan: {
    id: 'lan', name: '莱恩·卡特', role: '雇员 · 行商/迎新大使', faction: 'bntg',
    personality: '热络健谈，三句话不离「买卖」，但对初来者意外地有耐心。',
    background: '跑了五年商队的资深信使，如今坐镇入口迎接流浪者——规划路线、组织远行、维护补给线，顺便发发押运委托。',
    uniform: { top: '#5c6d5e', topStyle: 3, badge: '#e8e8e0' },
    avatar: { gender: 0, hair: 3, hairColor: '#232326', skin: '#c9a58a', pants: '#3a352e', pantsStyle: 0, face: 1 },
    currency: 'presses',
    lines: [
      {
        npc: '欢迎来到商人之家！莱恩·卡特，行商兼迎新大使。规矩只有一条：一切明码标价。想逛逛市场、接点押运的活，还是找个地方歇脚？',
        opts: [
          { text: '这里是什么地方？', next: 1 },
          { text: '有什么委托可以接？', next: 2 },
          { text: '我先随便看看。', action: 'leave' },
        ],
      },
      {
        npc: '商人之家——B.N.T.G. 在跃金段的门面，后室最大的「活市场」。中心那座保险库更是宝贝：后室数一数二的集中式存储设施。只要你付得起价，这里什么都有。',
        opts: [
          { text: '压印币怎么算？', next: 3 },
          { text: '不错。', action: 'leave' },
        ],
      },
      {
        npc: '押运与征集，随你挑。押运是把货送给 M.E.G. 的朋友，征集是我们高价收稀有商品——报酬都是压印币，一瓶杏仁水兑两枚，童叟无欺。',
        opts: [{ text: '那就来点活。', action: 'leave' }],
      },
      {
        npc: '压印币，B.N.T.G. 的硬通货。一瓶杏仁水换两枚，两枚换回一瓶——我们只赚差价的手续费，不多，就一点点名声。',
        opts: [{ text: '明白了。', action: 'leave' }],
      },
    ],
    idle: ['东线的商队该回来了……', '迎新手册又该加一页。', '汇率稳定，天下太平。'],
  },
  candyman: {
    id: 'candyman', name: '「糖佬」希德', role: '雇员 · 糖果贩', faction: 'bntg',
    personality: '笑眯眯的瘦高个，围裙上永远沾着糖渍，见谁都先递一颗试吃装。',
    background: '原 B.N.T.G. 糖果矿的打包工，如今在市场街支起糖果摊。关于糖果从哪儿来，他只说「矿上见」三个字，再笑。',
    uniform: { top: '#c9a0b8', topStyle: 1, badge: '#e8b93c' }, // 粉色围裙 + 糖果金徽章
    avatar: { gender: 0, hair: 12, hairColor: '#5a4a2a', skin: '#e8b890', pants: '#3a352e', pantsStyle: 0, face: 1, glasses: 1 }, // v54b：短卷发 + 圆框眼镜（糖果贩）
    currency: 'presses',
    barter: [
      { give: 'presses', giveN: 5, get: 'candysilver', getN: 8 },
      { give: 'presses', giveN: 5, get: 'candybullet', getN: 8 },
      { give: 'presses', giveN: 5, get: 'candygun', getN: 8 },
      { give: 'presses', giveN: 5, get: 'candystanley', getN: 8 },
      { give: 'presses', giveN: 5, get: 'candywaste', getN: 8 },
      { give: 'presses', giveN: 5, get: 'candygenius', getN: 8 },
      { give: 'presses', giveN: 5, get: 'candymint', getN: 8 },
    ],
    lines: [
      {
        npc: '要点糖吗？B.N.T.G. 最新产品，独立包装，一包一磅。5 枚压印币一组，七种口味——银舌头、咀嚼子弹、枪糖、纸片人、危害废料、天才糖、杏仁薄荷。自己挑。',
        opts: [
          { text: '看看货。', action: 'trade' },
          { text: '这糖吃了真的没事吗？', next: 1 },
          { text: '先不了。', action: 'leave' },
        ],
      },
      {
        npc: '官方说法是「轻微超自然效果，持续数小时」。我的建议是别一次吞一整包——上一个这么干的哥们，现在见谁都推销危害废料。要货就说。',
        opts: [
          { text: '看看货。', action: 'trade' },
          { text: '先不了。', action: 'leave' },
        ],
      },
    ],
    idle: ['来点糖吧，新到的货。', '糖渍洗都洗不掉……算了，也算招牌。', '万圣节那阵子才真叫忙。'],
  },
  laozhangfang: {
    id: 'laozhangfang', name: '奥托·格雷', role: '主管 · 保险库总账', faction: 'bntg',
    personality: '慢条斯理，算盘珠子比枪子儿还准；见钱眼开，但开的每一眼都有账本。',
    background: '主管级的总会计，商人之家创立那年就在打算盘。保险库每一笔进出都要过他的手——据说没有他算不清的账，只有他不想算的账。',
    uniform: { top: '#4a5248', topStyle: 1, badge: '#c9a03a' },
    avatar: { gender: 0, hair: 2, hairColor: '#9a9a9e', skin: '#c9a58a', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    currency: 'presses',
    trade: [
      { item: 'skeleton', price: 20 },
      { item: 'royalration', price: 70 },
      { item: 'warpberry', price: 48 },
    ],
    lines: [
      {
        npc: '嗯……账平了。哦，客人？奥托·格雷，保险库总账。看什么货？先说好，保险库的东西，价格后面都要再加一道「保管费」。',
        opts: [
          { text: '看看货。', action: 'trade' },
          { text: '保险库有多大？', next: 1 },
          { text: '不打扰。', action: 'leave' },
        ],
      },
      {
        npc: '车库式储藏室，一整圈。冗余物资、隔离的异常物品、等着交付的高价值商品——从最低级的毛贼到某些知名组织，谁都想咬一口。所以这里常年重兵把守。',
        opts: [{ text: '那就看看「高价值商品」。', action: 'trade' }],
      },
    ],
    idle: ['这笔保管费记到东区账上……', '又有人想白看保险库。', '算盘珠子该上油了。'],
  },
  shen: {
    id: 'shen', name: '塞德里克·科尔曼', role: '经理 · 首席鉴定师', faction: 'bntg',
    personality: '眼毒嘴慢，看货一眼报价，从不说第二遍。',
    background: '走南闯北鉴定过无数「后室异物」。只要从他手里过的货，真假贵贱一目了然——稀有物件就找他。',
    uniform: { top: '#3a3f46', topStyle: 1, badge: '#5c6d5e' },
    avatar: { gender: 0, hair: 6, hairColor: '#232326', skin: '#f0c8a8', pants: '#2e3a4a', pantsStyle: 0, face: 0 },
    currency: 'presses',
    trade: [
      { item: 'royalration', price: 70 },
      { item: 'warpberry', price: 48 },
      { item: 'fuyouyu', price: 24 },
      { item: 'squirtgun', price: 30 },
    ],
    lines: [
      {
        npc: '坐。塞德里克·科尔曼，首席鉴定师。买货先看货——我的柜台上没有次品，当然，也没有「捡漏」这个词。',
        opts: [
          { text: '看看货。', action: 'trade' },
          { text: '你怎么看 rarity 的？', next: 1 },
          { text: '告辞。', action: 'leave' },
        ],
      },
      {
        npc: '稀有度？我只看三样：来路、数量、还有你付不付得起。第三样最重要。',
        opts: [{ text: '……现实。', action: 'leave' }],
      },
    ],
    idle: ['这批玉器里混了个假的。', '报价单重印，涨半成。'],
  },
  tang: {
    id: 'tang', name: '玛戈·坦恩', role: '雇员 · 杂货摊主', faction: 'bntg',
    personality: '嘴碎热情，见谁都是「老主顾」，卖东西总要搭一句使用心得。',
    background: '市场街资历最老的摊主。从电池到保温服，他的杂货摊养活了大半个商人之家。',
    uniform: { top: '#6a5a40', topStyle: 2, badge: '#5c6d5e' },
    avatar: { gender: 1, hair: 14, hairColor: '#4a3020', skin: '#f0c8a8', pants: '#3a352e', pantsStyle: 0, face: 1 }, // v54b：双丸子（杂货摊主）
    currency: 'presses',
    trade: [
      { item: 'headlamp', price: 26 },
      { item: 'axe', price: 52 },
      { item: 'cavingsuit', price: 30 },
      { item: 'divemask', price: 24 },
      { item: 'notebook', price: 16 },
      { item: 'uvlamp', price: 34 },
      { item: 'stonekazoo', price: 20 },
      { item: 'oddbook', price: 12 },
    ],
    lines: [
      {
        npc: '哟，老主顾——哎，认错了？没事，从今天起你就是老主顾了！玛戈·坦恩的杂货摊，样样都有，样样都「稍微」贵那么一点点，嘿嘿。',
        opts: [
          { text: '看看货。', action: 'trade' },
          { text: '为什么比 Alpha 基地贵？', next: 1 },
          { text: '回头再来。', action: 'leave' },
        ],
      },
      {
        npc: '哎哟，话不能这么讲。他们那是「救济价」，我们这是「市场价」——运费、保管费、保险费，哪样不要钱？再说，我这儿能买到他们那儿买不到的。',
        opts: [{ text: '行吧，看看货。', action: 'trade' }],
      },
    ],
    idle: ['头灯又卖断货了……', '给老主顾留一把好斧头。', '今天的流水不错，嘿嘿。'],
  },
  kui: {
    id: 'kui', name: '布洛克·奎', role: 'TGPF 警备队长', faction: 'bntg',
    personality: '沉默寡言，站姿像一堵墙；对越界者只说一次「退后」。',
    background: '贸易集团警备处（TGPF）的精锐，前雇佣兵，如今带一支小队守着交易保险库。传闻他一个人吓退过一整个觊觎保险库的小团体。',
    uniform: { top: '#3a3f46', topStyle: 3, badge: '#5c6d5e' },
    avatar: { gender: 0, hair: 2, hairColor: '#232326', skin: '#7d5a3c', pants: '#2a2d33', pantsStyle: 0, face: 2, glasses: 3 }, // v54b：墨镜（警备队长）
    currency: 'presses',
    lines: [
      {
        npc: '站住。保险库重地，闲人免进。……买货去市场街，别在这儿晃。',
        opts: [
          { text: '保险库里有什么？', next: 1 },
          { text: '我马上走。', action: 'leave' },
        ],
      },
      {
        npc: '储藏室、高价值商品、还有不该存在的东西。我的工作是确保它们哪一样都到不了你手里。除非——你走正门，付压印币。',
        opts: [{ text: '明白。', action: 'leave' }],
      },
    ],
    idle: ['三区巡逻完毕。', '卷帘门，再检查一遍。'],
  },

  // ================= 办公区EL3A（BNTG 物流中转站；压印币结算，灰绿制服） =================
  mccauley: {
    id: 'mccauley', name: '霍利斯·麦考利', role: '物流主管', faction: 'bntg',
    personality: '干脆利落，运单过目不忘；最恨两件事——包裹受潮，和把包裹弄丢还不敢认的人。',
    background: '跑了十年跨层级押运的老信使，如今坐镇 EL3A 调度所有进出仓的物资。他手里那本运单登记簿，记着每一箱杏仁水的来路和去向。',
    uniform: { top: '#4a5a4e', topStyle: 1, badge: '#e8e8e0' },
    avatar: { gender: 0, hair: 2, hairColor: '#3a2c1c', skin: '#c9a58a', pants: '#2a2d33', pantsStyle: 0, face: 2 },
    currency: 'presses',
    lines: [
      {
        npc: '站直了，运单不看弯腰的人。霍利斯·麦考利，EL3A 物流主管。这里每一箱货都有来路和去向——想搭把手押运，还是随便看看？',
        opts: [
          { text: 'EL3A 是做什么的？', next: 1 },
          { text: '押运有什么规矩？', next: 2 },
          { text: '我先四处看看。', action: 'leave' },
        ],
      },
      {
        npc: '中转站。Level 2、Level 3 搜刮来的物资在这儿清点、打包、再分往各层级的居住地——Alpha 基地、商人之家、希波克拉底，甚至 Tom 那张餐桌。你吃的那罐豆子，多半经过我的仓库。',
        opts: [{ text: '了不起。', action: 'leave' }],
      },
      {
        npc: '三条。一，包裹当面交给收件人，签收才算数；二，包裹别弄丢——占你一格背包，看好了；三，真弄丢了，回来找我认栽，别硬撑。认栽扣点名声，硬撑坏的是整条补给线。',
        opts: [{ text: '记住了。', action: 'leave' }],
      },
    ],
    idle: ['十七号运单该到商人之家了……', '这批货的缠膜谁打的？松了。', '去 Level 3 的押运员还没回来。', '登记簿，笔又没墨了。'],
  },
  vesper: {
    id: 'vesper', name: '薇拉·维斯珀', role: '兑换员', faction: 'bntg',
    warehouse: 'bntg', // v54：EL3A 寄存 NPC
    personality: '笑盈盈的，找零从不出错；对真正落魄的流浪者会悄悄把秤压低一点。',
    background: '兑换间的掌柜，商人之家派来的老账房。她坚持 EL3A 的兑换价必须比「家里」低——「仓库直销，不赚过路人的救命钱」。',
    uniform: { top: '#5c6d5e', topStyle: 2, badge: '#e8e8e0' },
    avatar: { gender: 1, hair: 5, hairColor: '#6a4a2a', skin: '#f0c8a8', pants: '#3a352e', pantsStyle: 0, face: 1 },
    currency: 'presses',
    trade: [
      // 仓库直销价：比商人之家的「市场价」便宜（那边还要加一道保管费）
      { item: 'almond', price: 2 },
      { item: 'canned', price: 2 },
      { item: 'bandage', price: 1 },
      { item: 'battery', price: 2 },
    ],
    lines: [
      {
        npc: '来，坐。薇拉·维斯珀，兑换间归我管。杏仁水、罐头、绷带、电池——仓库直销价，比商人之家那边便宜。压印币结账，看看？',
        opts: [
          { text: '看看货。', action: 'trade' },
          { text: '为什么比商人之家便宜？', next: 1 },
          { text: '下次再来。', action: 'leave' },
        ],
      },
      {
        npc: '那边是「市场价」——运费、保管费、保险费，样样都加一道。我这儿是仓库后门，货从托盘直接到你手里，自然便宜。……对了，要是你真到了弹尽粮绝的地步，跟我说一声，别硬扛。',
        opts: [{ text: '那就看看货。', action: 'trade' }],
      },
    ],
    idle: ['今天的流水又平了。', '绷带不多了，得找分拣队补。', '便宜归便宜，账不能乱。'],
  },
  pidge: {
    id: 'pidge', name: '皮奇·伦德尔', role: '分拣员', faction: 'bntg',
    personality: '手脚麻利，眼睛毒，一眼能挑出缠膜打松的托盘；爱念叨他的「三件清」口诀。',
    background: '仓库分拣队的老手，每天经手上百箱物资。据说他闭着眼睛也能摸出罐头和电池的区别——靠掂。',
    uniform: { top: '#5c6d5e', topStyle: 3, badge: '#e8e8e0' },
    avatar: { gender: 0, hair: 3, hairColor: '#232326', skin: '#a87f5c', pants: '#3a352e', pantsStyle: 0, face: 0 },
    currency: 'presses',
    lines: [
      {
        npc: '借过借过——哦，客人？皮奇·伦德尔，分拣的。别站通道中间，托盘不长眼。',
        opts: [
          { text: '分拣都做什么？', next: 1 },
          { text: '这就让开。', action: 'leave' },
        ],
      },
      {
        npc: '三件清：清点、清洁、清楚。进来的货先点数，再擦一遍，最后登记上簿——哪一步都不能糊。麦考利主管的簿子对不上数，整个仓库都得陪着翻箱倒柜。',
        opts: [{ text: '辛苦了。', action: 'leave' }],
      },
    ],
    idle: ['三号排，杏仁水二十箱。', '这托缠膜又松了……', '点两遍，再点两遍。'],
  },
  boone: {
    id: 'boone', name: '布恩·哈洛', role: '搬运工', faction: 'bntg',
    personality: '膀大腰圆，话比行李带还少；信奉「搬得动的都不是事儿」。',
    background: '从商人之家押运队退下来的壮劳力，如今专职在 EL3A 仓库码托盘。一个人能扛两只标准箱，还能腾出手来扶门。',
    uniform: { top: '#4a5248', topStyle: 3, badge: '#e8e8e0' },
    avatar: { gender: 0, hair: 1, hairColor: '#1a1a1c', skin: '#7d5a3c', pants: '#2a2d33', pantsStyle: 0, face: 0, beard: 2, shoes: 2 }, // v54b：络腮胡 + 皮靴（搬运工）
    currency: 'presses',
    lines: [
      {
        npc: '嗯。布恩，搬货的。仓库里小心脚下，托盘边、台阶口，别绊着。',
        opts: [
          { text: '一天要搬多少？', next: 1 },
          { text: '好。', action: 'leave' },
        ],
      },
      {
        npc: '没数过。码到顶，再拆，再码。夹楼的办公间用的家具也是我扛上去的——走的那部扶手梯。你要上去看看？梯子稳，扶手抓牢。',
        opts: [{ text: '回头见。', action: 'leave' }],
      },
    ],
    idle: ['这批码南墙。', '托盘腿断了，换一块。', '（他哼着不成调的号子）'],
  },
  whitfield: {
    id: 'whitfield', name: '玛德琳·惠特菲尔德', role: '运营主任', faction: 'bntg',
    personality: '温和而精确，调度表从不出错；喜欢站在夹楼栏杆边，看中庭的托盘像河一样流。',
    background: 'EL3A 的运营主任，主管仓储调度。商人之家的老人，五年前带着半本调度规程来到 EL3A，把这座中转仓的吞吐翻了一倍——夹楼上的办公室就是她盯出来的。',
    uniform: { top: '#4a5a4e', topStyle: 1, badge: '#c9a03a' },
    avatar: { gender: 1, hair: 5, hairColor: '#4a3020', skin: '#e8c8a8', pants: '#2a2d33', pantsStyle: 0, face: 1 },
    currency: 'presses',
    lines: [
      {
        npc: '欢迎来到夹楼——从这儿往下看，整座仓库都是活的。玛德琳·惠特菲尔德，EL3A 运营主任。第一次来？我给你讲讲这条线。',
        opts: [
          { text: 'EL3A 是怎么运转的？', next: 1 },
          { text: '夹楼上都有什么？', next: 2 },
          { text: '不了，我自己转转。', action: 'leave' },
        ],
      },
      {
        npc: 'Level 2、Level 3 搜刮来的物资，先运到楼下的中转仓——清点、打包、贴签，再由押运组分往各层级的居住地：Alpha 基地的电池、商人之家的罐头、希波克拉底的绷带，都打这儿过。想搭把手？去楼下找麦考利，他的押运队永远缺人；缺物资就找维斯珀，直销价。',
        opts: [{ text: '明白了，谢谢。', action: 'leave' }],
      },
      {
        npc: '档案室、休息室、我的办公室，还有南边的值班铺——办公区全在夹楼上，和仓库共用一根房梁。楼下存货，楼上办公，栏杆边能俯瞰整个中庭。别靠在楼梯口的栏杆上走神，那两部梯子上来下去都是托盘。',
        opts: [{ text: '我会小心的。', action: 'leave' }],
      },
    ],
    idle: ['南线押运该回来了……', '调度表又重排了一遍。', '中庭的托盘声，听久了像雨。', '夹楼的视野最好——整座仓库都在眼下。'],
  },
  kowalski: {
    id: 'kowalski', name: '斯坦尼斯·科瓦尔斯基', role: '退休会计', faction: 'bntg',
    personality: '絮叨而和善，心算比谁都快；休息室的常客，兜里永远揣着一颗水果糖。',
    background: 'B.N.T.G. 的老会计，退休后不肯回家，天天泡在 EL3A 的休息室帮维斯珀对账。据说他记得商人之家开业第一天的每一笔账——包括 Tom 欠他的那顿千层面。',
    uniform: { top: '#6a5a40', topStyle: 1, badge: '#5c6d5e' },
    avatar: { gender: 0, hair: 2, hairColor: '#9a9a9e', skin: '#c9a58a', pants: '#3a352e', pantsStyle: 0, face: 0 },
    currency: 'presses',
    lines: [
      {
        npc: '哦——客人？坐，坐。斯坦尼斯·科瓦尔斯基，算账的，退休啦。这颗糖给你？……不要？也好，省一颗。这休息室是整个 EL3A 最亮堂的地方，我常在这儿帮维斯珀对账。',
        opts: [
          { text: '您在这里多久了？', next: 1 },
          { text: '听说您认识 Tom？', next: 2 },
          { text: '不打扰您了。', action: 'leave' },
        ],
      },
      {
        npc: '商人之家开业第一天我就在——那天的账我到现在还记得：杏仁水出四十瓶，压印币进八十一枚，差一枚，是奥托那小子算错的。这毛病他一辈子没改，哈哈。……现在好喽，退休了，就爱坐这儿听楼下搬托盘的声音。',
        opts: [{ text: '您老保重。', action: 'leave' }],
      },
      {
        npc: '（压低声音）认识，怎么不认识——Tommaso 还欠我一顿千层面呢，记账上：「应收款待·千层面·壹份」。你别告诉他我说的。……他的餐馆在 Level 1 天鹰段，要去的话替我问声好，就说账还没清。',
        opts: [{ text: '一定带到。', action: 'leave' }],
      },
    ],
    idle: ['糖，吃一颗？', '这笔账，三十年前也是这么错的。', '休息室的灯比账房亮堂。', '数字从不说谎，说账的人会。', '千层面……记账上。'],
  },

  // ================= 希波克拉底 - 1（阿丽亚娜集团；全员白色制服 + 紫徽章，法语人名） =================
  lecomte: {
    id: 'lecomte', name: '尼古拉·勒孔特', role: '通信主管', faction: 'ariane',
    personality: '严谨有礼，三句话不离电台与频道；对初来者的耐心是职业练出来的。',
    background: '集团通信网络的搭建者之一，负责希波克拉底 - 1 与各团队前哨之间的联络与日志，研究所里没有一条消息不经过他的手。',
    uniform: { top: '#eceef2', topStyle: 3, badge: '#8676e2' },
    avatar: { gender: 0, hair: 3, hairColor: '#4a3020', skin: '#f0c8a8', pants: '#d8dae0', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '欢迎来到希波克拉底 - 1。尼古拉·勒孔特，通信主管。这里是阿丽亚娜集团的医药研究所——外科、异常生物学与医疗救助的中枢。有什么可以帮你？',
        opts: [
          { text: '这里是做什么的？', next: 1 },
          { text: '阿丽亚娜集团是？', next: 2 },
          { text: '我先四处看看。', action: 'leave' },
        ],
      },
      {
        npc: '病房、手术室、生物实验室、药房——我们收治流浪者，也研究这座后室的「病」。如果你带着医疗物资，杜邦医师和马丁护士长愿意以物易物。',
        opts: [
          { text: '以物易物？', next: 3 },
          { text: '明白了。', action: 'leave' },
        ],
      },
      {
        npc: '由八支专业团队联合而成的团体，我们希波克拉底团队是其中之一——外科医师与医学、生物学研究人员。别处的团队擅长勘探与战斗，我们擅长让人活下去。',
        opts: [{ text: '令人敬佩。', action: 'leave' }],
      },
      {
        npc: '正是。集团不发行货币——绷带与消毒液在我们这就是硬通货。交给医师，换杏仁水、罐头和电池。',
        opts: [{ text: '好，回头见。', action: 'leave' }],
      },
    ],
    idle: ['频道 3 又静默了……', '给塔那托斯团队的回电还没发。', '日志：本月接诊 41 例。', '信号良好，各前哨平安。'],
  },
  muller: {
    id: 'muller', name: '塞巴斯蒂安·穆勒', role: '编外合作伙伴 · 昆虫学家', faction: 'ariane',
    personality: '古怪热忱，谈起异常生物两眼放光，常常忘了对方听不听得懂。',
    background: '并非集团正式成员——一位自愿挂靠的昆虫学家，研究后室节肢动物与异常生物。团队忍他的怪癖，因为他的标本柜救过好几条命。',
    uniform: { top: '#eceef2', topStyle: 1, badge: '#8676e2' },
    avatar: { gender: 0, hair: 7, hairColor: '#7a5a30', skin: '#c9a58a', pants: '#d8dae0', pantsStyle: 2, face: 1, beard: 1 }, // v54b：山羊胡（昆虫学家）
    lines: [
      {
        npc: '哦！一位访客。塞巴斯蒂安·穆勒，编外合作伙伴——昆虫学家，严格说不算集团的人。来参观我的小家伙们吗？后室的节肢动物，比前厅的精彩一万倍。',
        opts: [
          { text: '你在研究什么？', next: 1 },
          { text: '疫疾是怎么回事？', next: 2 },
          { text: '不打扰了。', action: 'leave' },
        ],
      },
      {
        npc: '异常生物的解剖学与行为学。上周解剖了一截肢团的附肢——那肌肉纤维的排列，完全违背力学常识！如果你在外面捡到奇怪的样本，勒费弗尔在隔壁征集。',
        opts: [{ text: '有意思。', action: 'leave' }],
      },
      {
        npc: 'Entity 19，一种异常病原。希波克拉底团队正在追查它的传播媒介——很可能与某些节肢动物有关，这正是我被请来的原因。在解药问世之前，消毒液是你最好的朋友。',
        opts: [{ text: '我会备上一瓶。', action: 'leave' }],
      },
    ],
    idle: ['这只的复眼结构……不得了。', '样本标签又写错了，重写。', '触角对电场有反应？', '培养皿别碰！谢谢配合。'],
  },
  dupont: {
    id: 'dupont', name: '卡米尔·杜邦', role: '主任医师', faction: 'ariane',
    medic: true,
    personality: '干练寡言，问诊三句切中要害；对物资进出锱铢必较，因为每一卷绷带都是一条命。',
    background: '希波克拉底团队外科的台柱子，主刀过上千台「不按理出牌」的手术。手术室与研究所的医疗物资调配都由她拍板。',
    uniform: { top: '#eceef2', topStyle: 1, badge: '#8676e2' },
    avatar: { gender: 1, hair: 6, hairColor: '#232326', skin: '#f0c8a8', pants: '#d8dae0', pantsStyle: 0, face: 2 },
    barter: [
      { give: 'bandage', giveN: 1, get: 'almond', getN: 1 },
      { give: 'disinfectant', giveN: 1, get: 'canned', getN: 1 },
    ],
    lines: [
      {
        npc: '手术刚结束，长话短说。卡米尔·杜邦，主任医师。需要清创缝合，还是想换点物资？',
        opts: [
          { text: '看看以物易物。', action: 'trade' },
          { text: '手术室忙吗？', next: 1 },
          { text: '你先忙。', action: 'leave' },
        ],
      },
      {
        npc: '永远忙。外伤、感染、还有那些「不按理出牌」的伤——后室的伤口从不照着教科书来。好在我们的外科团队是最好的。',
        opts: [
          { text: '那看看交换吧。', action: 'trade' },
          { text: '保重。', action: 'leave' },
        ],
      },
    ],
    idle: ['下一场手术在半小时后。', '缝合线库存见底了。', '术前消毒，再检查一遍。'],
  },
  morel: {
    id: 'morel', name: '奥雷利安·莫雷尔', role: '外科医生', faction: 'ariane',
    medic: true,
    personality: '温和沉稳，脚步永远放得很轻；值夜班时会挨个给病人掖好被角。',
    background: '杜邦医师的第一助手，病房区的常驻外科医生。据说他缝合的伤口，愈合后连疤都比别人的浅。',
    uniform: { top: '#eceef2', topStyle: 1, badge: '#8676e2' },
    avatar: { gender: 0, hair: 2, hairColor: '#232326', skin: '#a87f5c', pants: '#d8dae0', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '轻一点，病人们刚睡下。奥雷利安·莫雷尔，外科医生。你是来换药的，还是单纯迷路了？',
        opts: [
          { text: '这里的病人多吗？', next: 1 },
          { text: '迷路了，马上走。', action: 'leave' },
        ],
      },
      {
        npc: '几间病房常年满员：被猎犬撕伤的、误触陷阱的、还有在黑暗里吓破了胆的。绷带永远不够——如果你有多余的，去找杜邦医师，她不会亏待你。',
        opts: [{ text: '记下了。', action: 'leave' }],
      },
    ],
    idle: ['3 号床退烧了。', '绷带，绷带，永远缺绷带。', '查房记录补完再走。'],
  },
  martin: {
    id: 'martin', name: '蕾雅·马丁', role: '护士长', faction: 'ariane',
    medic: true,
    personality: '麻利泼辣，进门先盯你的手消没消毒；嘴上数落人，手里配药从不出错。',
    background: '药房与病房护理的总管，研究所的配给制度有一半是她定的。新学徒最怕她的晨检，也最服她。',
    uniform: { top: '#eceef2', topStyle: 3, badge: '#8676e2' },
    avatar: { gender: 1, hair: 1, hairColor: '#8a3a2a', skin: '#c9a58a', pants: '#d8dae0', pantsStyle: 0, face: 2 },
    barter: [
      { give: 'bandage', giveN: 2, get: 'battery', getN: 1 },
      { give: 'disinfectant', giveN: 2, get: 'bandage', getN: 3 },
    ],
    lines: [
      {
        npc: '站住，手消了毒再进来。……好了。蕾雅·马丁，护士长，药房归我管。换物资？还是想领一份预防消毒？',
        opts: [
          { text: '看看能换什么。', action: 'trade' },
          { text: '药房里有什么？', next: 1 },
          { text: '告辞。', action: 'leave' },
        ],
      },
      {
        npc: '绷带、消毒液、镇定剂——按配给发放。流浪者的那份，用医疗物资来换。我们不收硬币，只收能救人的东西。',
        opts: [
          { text: '那看看交换。', action: 'trade' },
          { text: '明白。', action: 'leave' },
        ],
      },
    ],
    idle: ['配药单核两遍。', '药房温度偏高了半度。', '新来的学徒又忘了手消。'],
  },
  lefevre: {
    id: 'lefevre', name: '马蒂斯·勒费弗尔', role: '实验室技术员', faction: 'ariane',
    personality: '一丝不苟，登记本上字迹像印刷体；谈起征集清单时难得地健谈。',
    background: '实验室的大管家：穆勒的样本登记、团队的异常物品征集与入库，都过他的手。每一件异常样本都有他手写的编号。',
    uniform: { top: '#eceef2', topStyle: 1, badge: '#8676e2' },
    avatar: { gender: 0, hair: 1, hairColor: '#232326', skin: '#f0c8a8', pants: '#d8dae0', pantsStyle: 2, face: 0 },
    lines: [
      {
        npc: '马蒂斯·勒费弗尔，实验室技术员。穆勒先生的样本登记、团队的异常物品征集，都过我的手。你是来送样本的，还是来接征集委托的？',
        opts: [
          { text: '为什么要收集异常物品？', next: 1 },
          { text: '随便看看。', action: 'leave' },
        ],
      },
      {
        npc: '杏仁水为什么能镇定心神？万能钥匙为什么开得了所有的锁？后室的超自然物品里藏着医学的答案——也许还有「疫疾」的解药。每一件样本，都可能救下一条命。',
        opts: [{ text: '我愿意帮忙。', action: 'leave' }],
      },
    ],
    idle: ['样本柜该除霜了。', '这批杏仁水的 pH 值不对。', '征集清单更新：兔脚优先。'],
  },

  // ================= Tom 的餐馆（不属于任何团体的独立餐馆；以物易物——食材换菜，无货币） =================
  tom: {
    id: 'tom', name: 'Tommaso「Tom」Esposito', role: '厨师 · 店主', faction: 'wanderer',
    personality: '乐观开朗，嗓门和炉火一样旺；坚信好好吃饭的人才有力气找出口。',
    background: '意大利裔美国人，前厅开过半生家庭餐馆。切进后室后做的第一件事不是找出口，而是重新点起炉火——如今这家小餐馆是天鹰段最像「家」的地方。',
    uniform: { top: '#f0eee8', topStyle: 1, badge: '#b04030' }, // 白色厨师服 + 暖红徽章
    avatar: { gender: 0, hair: 2, hairColor: '#3a2a1a', skin: '#e8b890', pants: '#2a2d33', pantsStyle: 0, face: 1 },
    barter: [
      // 简单（1 份基础资源）
      { give: 'canned', giveN: 1, get: 'tomatosoup', getN: 1 },
      { give: 'canned', giveN: 1, get: 'garlicbread', getN: 1 },
      { give: 'driedfruit', giveN: 1, get: 'gardensalad', getN: 1 },
      // 中等（罐装×2 / 巨兽之肉×1 / 旱虾×1 / 杏仁水×1+罐装×1）
      { give: 'canned', giveN: 2, get: 'pasta', getN: 1 },
      { give: 'thingmeat', giveN: 1, get: 'meatstew', getN: 1 },
      { give: 'dryshrimp', giveN: 1, get: 'friedshrimp', getN: 1 },
      { give: 'almond', giveN: 1, give2: 'canned', give2N: 1, get: 'pizza', getN: 1 },
      // 复杂（巨兽之肉×2 / 皇家口粮×1 / 杏仁水×2+罐装×2）
      { give: 'thingmeat', giveN: 2, get: 'lasagna', getN: 1 },
      { give: 'royalration', giveN: 1, get: 'tomsspecial', getN: 1 },
      { give: 'almond', giveN: 2, give2: 'canned', give2N: 2, get: 'tomsspecial', getN: 1 },
    ],
    lines: [
      {
        npc: 'Buongiorno！欢迎欢迎！我是 Tom，Tommaso Esposito——不过在这儿人人都叫我 Tom。坐，随便坐！炉子上的汤刚开。你带食材了吗？',
        opts: [
          { text: '看看能换什么菜。', action: 'trade' },
          { text: '这里不收钱吗？', next: 1 },
          { text: '爱子是？', next: 2 },
          { text: '先转转。', action: 'leave' },
        ],
      },
      {
        npc: '钱？Mamma mia，钱在这里炖不出一锅好汤！罐头、干果、肉——这才是厨房里说得通的语言。你给我食材，我给你一盘 bellissimo 的热菜。公平吧？',
        opts: [
          { text: '那看看菜单。', action: 'trade' },
          { text: '有道理。', action: 'leave' },
        ],
      },
      {
        npc: '佐藤爱子，我的跑堂，也是这家餐馆唯一的员工。别看她话少——她肩上扛着的包袱，比冷库里的冻肉还重。对她客气点，别盯着她看。……想吃加工菜找她，她的手比我稳。',
        opts: [
          { text: '明白了。', action: 'leave' },
        ],
      },
    ],
    idle: ['盐……盐在哪儿？', 'Mamma mia，火又小了。', '今天的面包发得正好！', '番茄要再炖一小时，急不得。', '谁把罗勒碰掉了？'],
  },
  aiko: {
    id: 'aiko', name: '佐藤爱子', role: '前台 · 跑堂（兼职）', faction: 'wanderer',
    personality: '内向安静，话少但观察力强；只有在这家餐馆里，她才偶尔露出一点自在。',
    background: '25 岁的日裔女性。流浪者口中从实体手里救过三百多人的「撒玛利亚人」——她本人极厌恶这个外号和随之而来的人气，拒绝谈论那把从不离身的金色斧头「幸运」。打工攒补给，只为找到回前厅的路。',
    uniform: { top: '#c97a4a', topStyle: 2, badge: '#f0e6d0' }, // 暖色系跑堂制服
    avatar: { gender: 1, hair: 1, hairColor: '#1a1a1c', skin: '#f0d8c8', pants: '#3a3f46', pantsStyle: 0, face: 0 },
    barter: [
      // 来料加工（玩家自带食材，餐馆代做）
      { give: 'thingmeat', giveN: 1, get: 'grilledsteak', getN: 1 },
      { give: 'driedfruit', giveN: 2, get: 'jambread', getN: 1 },
    ],
    lines: [
      {
        npc: '……欢迎。坐哪里都可以。要加工食材的话，给我看看。（她擦了擦手，声音很轻）',
        opts: [
          { text: '来料加工（看看能做什么）。', action: 'trade' },
          { text: '你是「撒玛利亚人」吗？', next: 1 },
          { text: '为什么会在这里打工？', next: 2 },
          { text: '不打扰了。', action: 'leave' },
        ],
      },
      {
        npc: '……别那么叫我。我只是个想回家的普通流浪者，做过一些事，仅此而已。拜托，别盯着我看，也别告诉别人你在这里见过我。吃饭吧，汤要凉了。',
        opts: [{ text: '……抱歉。', action: 'leave' }],
      },
      {
        npc: 'Tom 是个好人。这里暖，有饭吃，没人问东问西。（她顿了顿）……而且攒补给比我想象的快。等攒够了，我就去找回家的路。就这样。',
        opts: [{ text: '祝你早日回家。', action: 'leave' }],
      },
    ],
    idle: ['……三号桌的汤好了。', '（她在轻轻擦拭一把金色的斧头）', '今天的客人……有点多。', '番茄酱在第二个柜子。', '……别看我。'],
  },

  // ================= v53b：M.E.G. Gamma 基地（Level 3 子层级，三层结构 106/107/108）=================
  brandt: {
    id: 'brandt', name: '布兰特·科尔', role: '军需官', // faction 缺省 'meg'
    warehouse: 'meg', // v54：Gemma 基地寄存 NPC
    personality: '嗓门大，手更快，报价单一拍就响；对刚摸进基地的流浪者总会多塞半瓶水。',
    background: 'Gemma 基地的军需官，坐镇公共部的补给兑换处。早些年在 Level 3 的电站廊道里跑了五年搜刮队，如今守着货架发配给——「灯亮着的地方，就不能让人饿死。」',
    uniform: { top: '#4a4640', topStyle: 3, badge: '#c9a03a' }, // MEG 制服 + 鹰徽金徽章
    avatar: { gender: 0, hair: 3, hairColor: '#3a2a1a', skin: '#c9a58a', pants: '#2a2d33', pantsStyle: 0, face: 1 },
    currency: 'almond', // v54：Gamma 基地直接以杏仁水计价（wikidot 惯例：杏仁水是通用等价物；不发天鹰币）
    trade: [ // 基础物资平价供应（杏仁水计价）
      { item: 'bandage', price: 1 },
      { item: 'canned', price: 1 },
      { item: 'battery', price: 2 },
      { item: 'crowbar', price: 5 },
    ],
    lines: [
      {
        npc: '欢迎来到 Gemma 基地，流浪者。布兰特·科尔，军需官。绷带、罐头、电池、撬棍——后室的硬通货只有一种：杏仁水。按瓶结账，概不赊欠。想看看货？',
        opts: [
          { text: '看看货。', action: 'trade' },
          { text: '这里是什么地方？', next: 1 },
          { text: '你们不收天鹰币吗？', next: 2 },
          { text: '下次再来。', action: 'leave' },
        ],
      },
      {
        npc: 'Gemma 基地——总署在 Level 3 的主要根据地，这层最大的开阔区全让我们占了。监督者团队零八年就勘探了这里，一层公共部随便逛：食堂有热饭，医疗角能包扎；二层住宅部，三层行政部——没事儿别上去打扰穆尼奥斯主管。要货就说。',
        opts: [
          { text: '那看看货。', action: 'trade' },
          { text: '记下了。', action: 'leave' },
        ],
      },
      {
        npc: '天鹰币是天鹰段的东西，运到这儿就算纪念币了。在 Level 3，杏仁水就是钱——甜、顶饿、镇定心神，装配线房间的货架上整排整排地出。搜刮队拿命换回来，我按瓶给你换成能活命的东西。公平得很。',
        opts: [
          { text: '有道理。那看看货。', action: 'trade' },
          { text: '告辞。', action: 'leave' },
        ],
      },
    ],
    idle: ['电池按南墙码，罐头按日期摆——别动我的货架。', '今天的配给表又超了……', '撬棍只剩最后几把，搜刮队该补货了。', '灯亮着的地方，就不能让人饿死。', '装配线那边又报物资点，明早出队。'],
  },
  meilin: {
    id: 'meilin', name: '梅·林', role: '后勤官', // faction 缺省 'meg'
    personality: '温和利落，记事本从不离手；哪个床位漏水、哪间宿舍缺毯子，她比住户本人先知道。',
    background: 'Gemma 基地住宅部的后勤官，管着二层数百个床位的分配、修缮与配给。据说她能在三十秒内给任何一个新到的流浪者腾出一张干净的床。',
    uniform: { top: '#3a4a46', topStyle: 2, badge: '#c9a03a' },
    avatar: { gender: 1, hair: 1, hairColor: '#232326', skin: '#f0c8a8', pants: '#3a352e', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '新面孔？我是梅·林，住宅部的后勤官。这一层是住人的地方——宿舍、洗漱间、休息角都在二层。要找床位的话，先去一层登记，再来找我。',
        opts: [
          { text: '这里住了多少人？', next: 1 },
          { text: '在 Gemma 基地生活是什么感觉？', next: 2 },
          { text: '不打扰你了。', action: 'leave' },
        ],
      },
      {
        npc: '常年驻防数百名成员，加上来往的流浪者，床位永远紧张。双层床挨双层床，洗漱间早上要排队——但每个人都有热水和干净毯子，这是底线。搜刮队轮班回来，头一件事就是把脏衣服丢进储物角，第二件事是睡到闹钟响。',
        opts: [{ text: '辛苦了。', action: 'leave' }],
      },
      {
        npc: '外面是电站，门一关就是家。熄灯后你听不见实体的动静，只听得见上下铺的呼吸声——在后室，这已经是最奢侈的安稳了。哦对，休息角的幕布今晚放纪录片，讲的是监督者团队零八年初勘这一层的事，有空就来看。',
        opts: [{ text: '我会去的。', action: 'leave' }],
      },
    ],
    idle: ['三号宿舍的床板该修了……', '毯子配给再核一遍。', '洗漱间的热水阀，谁又没关紧。', '新到五个人，床位——挤一挤总会有的。', '晾衣绳又满了，让二班往休息角拉一根。'],
  },
  harper: {
    id: 'harper', name: '米内尔瓦·穆尼奥斯', role: '基地主管', // faction 缺省 'meg'
    personality: '沉稳寡言，每句话都经过权衡；谈起 Level 3 的考察数据时，眼里才有光。',
    background: 'Gemma 基地的主管，主持 Level 3 的全部考察与驻防工作。从第一批地标布设到三层行政部的档案体系，这座基地的一砖一瓦都经过她的调度。',
    uniform: { top: '#3a3f46', topStyle: 3, badge: '#c9a03a' },
    avatar: { gender: 1, hair: 5, hairColor: '#4a3020', skin: '#e8c8a8', pants: '#2a2d33', pantsStyle: 0, face: 2 },
    lines: [
      {
        npc: '站住脚就喘口气吧——你能顺着地标走到这里，说明罗经点小队的工作没有白费。米内尔瓦·穆尼奥斯，Gemma 基地主管。这里是行政部，Level 3 的一切考察工作都汇总到这三层楼上。',
        opts: [
          { text: 'Gemma 基地在做些什么？', next: 1 },
          { text: '能跟我讲讲 Level 3 吗？', next: 2 },
          { text: '这基地有多少年头了？', next: 3 },
          { text: '我该怎么离开这里？', next: 4 },
          { text: '打扰了。', action: 'leave' },
        ],
      },
      {
        npc: '驻防、补给、考察。这一层的电网是后室最富的资源——也是引来实体最多的地方。Level 3 的实体聪明得反常：尸鼠会在地面设陷阱，无面灵会抄起石块。我们绘制廊道、统计实体出没、研究它们的智能从哪来，再把瓶装闪电和火盐登记造册，报告送回 Alpha 基地。数百号人常年驻守，就靠这些档案让后来者少送命。',
        opts: [{ text: '值得敬佩。', action: 'leave' }],
      },
      {
        npc: '危险、嘈杂、物资丰富。装配线房间里堆着全后室最富的补给，但实体也知道你会去——看门，别看货。要是看见铁栅栏，别硬闯；要是灯突然全灭，贴着墙走。还有：圣所里的雕像别碰，那是这一层唯一的庇护所。',
        opts: [{ text: '我记下了。', action: 'leave' }],
      },
      {
        npc: '监督者团队 2008 年第一次勘探这一层，营地就扎在这片开阔区——全层级最大的一块。帐篷换成板房，板房浇成三层楼，电网接了又修、修了又接，就成了你今天看到的 Gemma 基地。持续运作至今，一天没熄过灯。',
        opts: [{ text: '一天没熄过灯，了不起。', action: 'leave' }],
      },
      {
        npc: '回 Level 3 走一层的北门。要离开这一层，去找电梯井——嵌在廊道墙里的那种，集齐两枚保险丝就能让它动起来，向上到 Level 4 或者 Level 5。祝你好运，流浪者。',
        opts: [{ text: '多谢。', action: 'leave' }],
      },
    ],
    idle: ['第三季度的考察报告……又滞后了。', '罗经点小队下周补地标，东段廊道优先。', '保险丝的库存只剩个位数了。', '档案室那排新册子，编目编到今天半夜。', '高智能实体那卷档案，再校一遍。'],
  },
  mateo: {
    id: 'mateo', name: '马特奥·雷耶斯', role: '住户 · 退役搜刮队员', // faction 缺省 'meg'
    personality: '乐呵呵的老住户，见谁都让半张床；讲起外面的廊道就停不下来。',
    background: 'Gemma 基地住宅部的老住户，年轻时跑过八年搜刮队，膝盖伤了之后退下来。如今每天把宿舍区收拾得整整齐齐，谁新来他都指点两句。',
    uniform: { top: '#4a4640', topStyle: 2, badge: '#c9a03a' },
    avatar: { gender: 0, hair: 2, hairColor: '#6a6a6e', skin: '#a87f5c', pants: '#3a352e', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '哟，新面孔！马特奥·雷耶斯，住二层的。别客气，这一层都是自己人——宿舍随便看，洗漱间早上要排队，别跟梅·林抢热水。',
        opts: [
          { text: '你在这里住了多久了？', next: 1 },
          { text: '外面走廊危险吗？', next: 2 },
          { text: '回头再聊。', action: 'leave' },
        ],
      },
      {
        npc: '三年喽。三层楼还没浇起来的时候我就进来了，睡过板房，搬过砖。现在？现在是享福——灯亮着，饭热着，还有人给我换床单。',
        opts: [{ text: '挺好。', action: 'leave' }],
      },
      {
        npc: '比以前精。尸鼠会下套，无面灵会捡石头砸你——都是练出来的。别慌，贴着灯走，认地标，实在跑不过就往圣所跑，实体不敢进。',
        opts: [{ text: '记下了。', action: 'leave' }],
      },
    ],
    idle: ['今晚休息角放纪录片，别忘了。', '谁的袜子又丢在走廊？', '二层巡逻一切正常。', '新床板比旧的结实。'],
  },
  isaac: {
    id: 'isaac', name: '艾萨克·冯·克莱斯特', role: '研究员（高智能实体）', // faction 缺省 'meg'
    personality: '慢条斯理，镜片后面的眼睛总在记录什么；谈起实体行为学时语速会突然加快。',
    background: 'Gemma 基地行政部的研究员，主持 Level 3 高智能实体行为档案——尸鼠的陷阱布置、无面灵的工具使用，每一条目击记录都经他校订。',
    uniform: { top: '#e8e8e0', topStyle: 1, badge: '#3a5a4a' },
    avatar: { gender: 0, hair: 2, hairColor: '#4a3020', skin: '#e8c8a8', pants: '#3a3f46', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '请进——行政部难得有客人。艾萨克·冯·克莱斯特，研究员。你在外面见过会设陷阱的老鼠吗？见过，我们就是同事了。',
        opts: [
          { text: '高智能实体是怎么回事？', next: 1 },
          { text: '你在研究什么？', next: 2 },
          { text: '不打扰你工作。', action: 'leave' },
        ],
      },
      {
        npc: 'Level 3 的实体聪明得反常：尸鼠在地面布置陷阱等猎物，无面灵会抄起石器当武器，笑魇懂得在灯下守株待兔。我们还在写答案——也许是层级在训练它们，也许是它们在相互学习。档案室第三排，自己看。',
        opts: [{ text: '细思极恐。', action: 'leave' }],
      },
      {
        npc: '陷阱样本的行为测绘。每一条记录都要标时间、区段、光照——马虎一个字，下一条命就没了。你要是目击到什么异常行为，来三层找我，档案署给记录的报酬。',
        opts: [{ text: '成交。', action: 'leave' }],
      },
    ],
    idle: ['第 47 号样本的陷阱位置又变了……', '这卷磁带要送回 Alpha。', '尸鼠群体的协作半径，再核一遍。'],
  },
  aurora: {
    id: 'aurora', name: '奥萝拉·陈', role: '档案员', // faction 缺省 'meg'
    personality: '安静细致，编目从不跳号；能找到任何一卷档案的位置，闭着眼。',
    background: 'Gemma 基地档案室的档案员，三年里把 Level 3 的考察记录从一堆散页编成了整面墙的册子。',
    uniform: { top: '#5a4a3a', topStyle: 1, badge: '#c9a03a' },
    avatar: { gender: 1, hair: 6, hairColor: '#232326', skin: '#f0c8a8', pants: '#2e3a4a', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '小声——这里是档案室。奥萝拉·陈，管编目的。查什么？层级记录、实体行为、物资流向，报编号就行。',
        opts: [
          { text: '这里都有什么档案？', next: 1 },
          { text: '就随便看看。', action: 'leave' },
        ],
      },
      {
        npc: '零八年首勘的原始记录、逐年的实体出没统计、每一批运回 Alpha 的报告副本。最老的那几卷纸都脆了，翻的时候用指尖。',
        opts: [{ text: '我会小心的。', action: 'leave' }],
      },
    ],
    idle: ['C-12 到 C-19，编目今天收工。', '这批报告该装订了。', '谁把 08 年的卷宗放错了格子……'],
  },

  // ================= v54：B.N.T.G. 存储设施（Level 3 子层级，id 107）=================
  dorian: {
    id: 'dorian', name: '卡尔迪达·里维拉', role: '仓管主管', faction: 'bntg',
    warehouse: 'bntg', // v54：存储设施寄存 NPC
    personality: '一丝不苟，点数时谁说话跟谁急；但对按规矩来的流浪者意外地好说话。',
    background: '存储设施的仓管主管，B.N.T.G. 的老仓管。Level 3 的每一箱货进她的仓，都要过两遍数——「这座仓的账，比商人之家的保险库还平。」',
    uniform: { top: '#5c6d5e', topStyle: 3, badge: '#e8e8e0' }, // BNTG 灰绿制服
    avatar: { gender: 1, hair: 5, hairColor: '#4a3020', skin: '#e8c8a8', pants: '#2a2d33', pantsStyle: 0, face: 1 },
    currency: 'presses',
    trade: [ // 仓库平价（货就堆在身后货架上，比商人之家便宜）
      { item: 'almond', price: 2 },
      { item: 'canned', price: 2 },
      { item: 'bandage', price: 1 },
      { item: 'battery', price: 2 },
      { item: 'crowbar', price: 4 },
    ],
    lines: [
      {
        npc: '站住，先别碰货架。卡尔迪达·里维拉，仓管主管。规矩：入库登记，出库批条，兑换压印币现结。要换基础物资？杏仁水、罐头、绷带、电池、撬棍——仓库平价，比「家里」便宜。',
        opts: [
          { text: '看看货。', action: 'trade' },
          { text: '这座设施是做什么的？', next: 1 },
          { text: '下次再来。', action: 'leave' },
        ],
      },
      {
        npc: 'Level 3 搜刮来的物资都先堆进这座仓——装配线的罐头、发电室的电池、整卷整卷的电缆。点数、登记、上架，再由商队转运到各层级的商站。你要是有力气，押运队的活去 EL3A 问；要换货，找我就行。',
        opts: [
          { text: '那就看看货。', action: 'trade' },
          { text: '明白了。', action: 'leave' },
        ],
      },
    ],
    idle: ['三号排又歪了两箱……', '这批电池入库数对不上，谁经的手？', '仓里的灯，一盏都不许关。', '点两遍，再点两遍。'],
  },
  gunter: {
    id: 'gunter', name: '布鲁诺·冈特', role: '守卫', faction: 'bntg',
    personality: '膀大腰圆，抱着警棍打盹也能听见脚步声；话少，眼睛一直在货架之间扫。',
    background: '存储设施的守卫队长，从商人之家押运队调来的老手。电站廊道里什么都会往仓门口凑——实体的、不实体——他守了两年，一只都没放进去过。',
    uniform: { top: '#4a5248', topStyle: 3, badge: '#e8e8e0' },
    avatar: { gender: 0, hair: 1, hairColor: '#1a1a1c', skin: '#7d5a3c', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    currency: 'presses',
    lines: [
      {
        npc: '嗯。仓里重地，别乱摸。……流浪者？兑换找里维拉主管，往里走。我守我的门。',
        opts: [
          { text: '这里也有实体来？', next: 1 },
          { text: '不打扰你站岗。', action: 'leave' },
        ],
      },
      {
        npc: '多得很。尸鼠最贼——专挑半夜啃托盘的缠膜。上个月还有只笑魇顺着停电摸进来，灯一亮就走了。所以仓里的灯永远全开：光是这里最管用的墙。',
        opts: [{ text: '受教了。', action: 'leave' }],
      },
    ],
    idle: ['……谁？哦，风。', '后半夜换岗前再巡一遍。', '缠膜又让啃了——尸鼠比贼精。'],
  },
  pippa: {
    id: 'pippa', name: '琵帕·洛', role: '盘点员', faction: 'bntg',
    personality: '手脚麻利，报数像唱歌；最大的乐趣是把盘点表写得一行不差。',
    background: '存储设施的盘点员，每天抱着夹板在货架排之间穿梭。她说她闭着眼睛都能背出七号排有多少罐杏仁水——没人敢跟她赌。',
    uniform: { top: '#5c6d5e', topStyle: 2, badge: '#e8e8e0' },
    avatar: { gender: 1, hair: 1, hairColor: '#232326', skin: '#f0c8a8', pants: '#3a352e', pantsStyle: 0, face: 1 },
    currency: 'presses',
    lines: [
      {
        npc: '借过借过——盘点呢。哦，客人？琵帕·洛，盘点的。换货找主管，别挡货架……不过你要是从外头来的，跟我说说外面的事也行。',
        opts: [
          { text: '仓里都存些什么？', next: 1 },
          { text: '你忙你的。', action: 'leave' },
        ],
      },
      {
        npc: '什么都有——罐头、电池、电缆、工具，还有些说不清来路的「异常件」，单独封存。最多的还是杏仁水：Level 3 的装配线房间里，它整排整排地出。盘完这排还有下排，我先忙啦。',
        opts: [{ text: '回头见。', action: 'leave' }],
      },
    ],
    idle: ['七号排，杏仁水四十瓶……四十一？', '夹板又写满了，得领新的。', '这排的托盘码得真齐，好看。'],
  },

  // ================= v54：M.E.G. Omega 基地（Level 4 子层级，id 109）固定 NPC =================
  // （注册在 jerry 系之前——图鉴「人士」页信众仍排最后；制服=MEG 行政灰蓝）
  whitaker: {
    id: 'whitaker', name: '艾略特·惠特克', role: '基地主管', faction: 'meg',
    personality: '一丝不苟，签字笔永远别在同一个口袋；说话像在做会议纪要。',
    background: 'Omega 基地的第三任主管，管着全后室最大的一笔档案和最难算的一笔库存。他坚持所有出入记录必须手写两份——「服务器会坏，纸不会」。',
    uniform: { top: '#4a5568', topStyle: 3, badge: '#d9b13b' },
    avatar: { gender: 0, hair: 2, hairColor: '#3a3a3e', skin: '#e8c8a8', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '艾略特·惠特克，基地主管。补给找仓管，查档找档案员，报修……填表。流浪者，你在 Omega 的每一瓶杏仁水都有编号——别让我发现编号对不上。',
        opts: [
          { text: '基地为什么建在 Level 4？', next: 1 },
          { text: '明白，不添乱。', action: 'leave' },
        ],
      },
      {
        npc: '杏仁水、实体绝迹、楼层稳定——还有比这更适合当枢纽的地方吗？我们把每层楼的窗景区都编了号，雨声当白噪音用。去忙吧，别挡灯。',
        opts: [{ text: '告辞。', action: 'leave' }],
      },
    ],
    idle: ['第 114 号档案柜的钥匙……在哪来着。', '库存表今晚必须平。', '谁把订书机又拿走了？'],
  },
  irene: {
    id: 'irene', name: '艾琳·福斯特', role: '档案员', faction: 'meg',
    personality: '轻声细语，记性惊人；对档案柜的排序有宗教般的坚持。',
    background: 'Omega 的档案员，能从五十个柜子里徒手抽出任何一卷记录。她说这一层的历史比她见过的任何档案都长——「我们只是最新的一批批注」。',
    uniform: { top: '#5a6474', topStyle: 2, badge: '#d9b13b' },
    avatar: { gender: 1, hair: 3, hairColor: '#4a3524', skin: '#f0c8a8', pants: '#3a352e', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '找什么档案？层级记录按编号，事故报告按年份，补给流水……按我的心情。开玩笑的——按日期。你是新来的流浪者吧，要查 Level 4 的平面图吗？',
        opts: [
          { text: '这里有 Level 4 的记录？', next: 1 },
          { text: '随便看看。', action: 'leave' },
        ],
      },
      {
        npc: '当然。窗景区的雾在 1987 年的记录里就一模一样，雨从没停过。至于那些楼梯——旧档里写着「楼梯大多不通向任何地方」，后来主管把这句划掉了，只留古典楼梯和活板门的索引。档案只记确认过的路。',
        opts: [{ text: '多谢。', action: 'leave' }],
      },
    ],
    idle: ['B-17 柜，事故卷……齐了。', '这卷的标签又褪色了。', '嘘——档案室轻声。'],
  },
  grove: {
    id: 'grove', name: '德温·格罗夫', role: '数据技师', faction: 'meg',
    personality: '顶着黑眼圈，见谁都先问「你动过交换机没有」；修机器比说话利索。',
    background: '数据中心的守夜人。整层楼的台式机、服务器阵列和备份磁带都归他管。他坚称阵列深夜会自己「换挡」——监控里什么也没拍到，他说是监控坏了。',
    uniform: { top: '#3e4a5a', topStyle: 2, badge: '#d9b13b' },
    avatar: { gender: 0, hair: 1, hairColor: '#232326', skin: '#c9a58a', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '德温·格罗夫，管服务器的。别碰阵列，别倚机柜，别把咖啡放在UPS上——上一个人的咖啡渍到现在还在散热孔里。有什么事？',
        opts: [
          { text: '这些机器还在算什么？', next: 1 },
          { text: '我什么也不碰。', action: 'leave' },
        ],
      },
      {
        npc: '备份。主要是备份。地图、档案、补给流水——每天凌晨全量一份。这层楼的电稳定得不像后室，我得对得起它。……你要是听见阵列半夜换挡的声音，别在意。我在意的够两个人份了。',
        opts: [{ text: '当我没问。', action: 'leave' }],
      },
    ],
    idle: ['三号阵列的风扇该清了。', '备份进度 97%……别在这时候跳闸。', '谁又把终端亮度调满了。'],
  },
  hobbs: {
    id: 'hobbs', name: '厄尔·霍布斯', role: '仓管', faction: 'meg',
    warehouse: 'meg', // v54：Omega 基地寄存 NPC
    personality: '寡言，手臂上全是搬箱子的茧；报库存从不看本子。',
    background: 'Omega 仓储区的仓管，每天清点杏仁水与罐头。别的基地仓管靠表，他靠手——掂一掂就知道哪箱少了一瓶。',
    uniform: { top: '#4a5568', topStyle: 0, badge: '#d9b13b' },
    avatar: { gender: 0, hair: 0, hairColor: '#1a1a1c', skin: '#7d5a3c', pants: '#3a352e', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '厄尔·霍布斯，管仓。要领补给去登记，货架别乱翻。……角落那扇旧活板门？通 Level 6。没事别掀，下面黑得很。',
        opts: [
          { text: '仓里杏仁水真那么多？', next: 1 },
          { text: '知道了。', action: 'leave' },
        ],
      },
      {
        npc: '整层楼最不缺的就是它。走廊散的都捡不完，何况还有装配——哦那是 L3 的事。反正在你这层，渴不着。行了，我点数呢。',
        opts: [{ text: '打扰。', action: 'leave' }],
      },
    ],
    idle: ['十七箱，封条完好。', '这箱轻了半瓶……嗯？', '活板门的扣环又得紧了。'],
  },
  saira: {
    id: 'saira', name: '萨伊拉·昆恩', role: '医护', faction: 'meg',
    medic: true,
    personality: '温声细语但不容拒绝；先看你的瞳孔再听你说事。',
    background: '居住区的驻点医护，管擦伤、低血糖和「在窗景区待太久」引发的心神不宁。她的医嘱永远同一句：去睡一觉，多喝杏仁水。',
    uniform: { top: '#e8e8e0', topStyle: 2, badge: '#4a5568' },
    avatar: { gender: 1, hair: 1, hairColor: '#232326', skin: '#c98a5a', pants: '#4a5568', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '坐。手伸出来——抖得不算厉害，还行。萨伊拉·昆恩，这里的医护。在 Level 4 迷路多久了？理智还稳吗？',
        opts: [
          { text: '这里也会有人受伤？', next: 1 },
          { text: '我没事，谢谢。', action: 'leave' },
        ],
      },
      {
        npc: '大多是摔的——踩空楼梯、掀活板门不看下面。真正难办的是另一种：在窗边坐一下午的人。雨声听久了，有人会忘了站起来。难受的话随时来找我，或者至少……去人多的地方待着。',
        opts: [{ text: '我会注意的。', action: 'leave' }],
      },
    ],
    idle: ['绷带剩得不多了。', '今天瞳孔都好，好兆头。', '雨声当白噪音可以，当摇篮曲不行。'],
  },
  voss: {
    id: 'voss', name: '迪特·沃斯', role: '守卫', faction: 'meg',
    personality: '站得笔直，登记提问三件套从没换过顺序；其实很想找人聊天。',
    background: 'Omega 前厅守卫，负责出入登记。这层几乎看不到实体，他的主要工作是提醒流浪者别踩到数据线的线槽。',
    uniform: { top: '#3e4a5a', topStyle: 3, badge: '#d9b13b' },
    avatar: { gender: 0, hair: 1, hairColor: '#3a2e22', skin: '#e8c8a8', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '站住——名字、来处、事由。……迪特·沃斯，前厅守卫。第一次来 Omega？里面请，主管在东侧办公区。楼梯间和仓储区在东南，别乱掀地上的盖子。',
        opts: [
          { text: '这层真的没有实体？', next: 1 },
          { text: '我进去看看。', action: 'leave' },
        ],
      },
      {
        npc: '几乎。猎犬和钝人一年露不了几面，进了灯网范围更是闻所未闻——所以这里才叫枢纽。但走廊尽头的窗景区少去：不是危险，是……容易发呆。登记完就放行。',
        opts: [{ text: '明白。', action: 'leave' }],
      },
    ],
    idle: ['名字、来处、事由。……哦，没人。', '今天的登记簿好薄。', '灯全亮，一切正常。'],
  },

  // ================= v55：Level 5 三处据点固定 NPC（注册在 jerry 系之前——信众仍排注册表末尾） =================
  // ---- M.E.G. 哨所「家政服务」（id 110）：MEG 行政灰蓝制服 ----
  barclay: {
    id: 'barclay', name: '巴克利·奥登', role: '哨所长', faction: 'meg',
    personality: '慢条斯理，登记簿不离手；说话像前台接线员，永远先问「您需要什么服务」。',
    background: 'Omega 基地调来的老内勤，主动申请带这个前哨。「家政服务」这个诨名就是他起的——他说大组织也该学着给人铺床。',
    uniform: { top: '#4a5568', topStyle: 3, badge: '#d9b13b' },
    avatar: { gender: 0, hair: 2, hairColor: '#5a5a5e', skin: '#d8b090', pants: '#2a2d33', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '欢迎来到「家政服务」。巴克利·奥登，哨所长。补给找佩特拉，报修找奥蒂斯——迷路的话，先喝口水再说话。',
        opts: [
          { text: '这哨所是干什么的？', next: 1 },
          { text: '名字挺特别。', next: 2 },
          { text: '不打扰了。', action: 'leave' },
        ],
      },
      {
        npc: '登记飞蛾巢位、收留迷路的人、把「贝弗莉室今晚又开了派对」写进周报。小活计，但总得有人做——这一层太干净了，干净到需要有人盯着。',
        opts: [{ text: '辛苦了。', action: 'leave' }],
      },
      {
        npc: '自嘲罢了。扫不完的走廊，擦不完的灰——可你猜怎么着？这层楼会自己变干净。我们的工作是弄明白「谁在打扫」。',
        opts: [{ text: '祝早日破案。', action: 'leave' }],
      },
    ],
    idle: ['周报还差两段。', '今晚谁值前半夜？', '桌子我又擦了一遍。'],
  },
  petra: {
    id: 'petra', name: '佩特拉·沃斯', role: '补给员', faction: 'meg',
    personality: '手脚麻利，报数像唱票；看人先看鞋带——「鞋带系不好的人活不长」。',
    background: '哨所的补给与配给总管。杏仁水按瓶记账，但她从不多收流浪者一滴——「这一层最缺的不是水，是活着回来的人」。',
    uniform: { top: '#4a5568', topStyle: 3, badge: '#d9b13b' },
    avatar: { gender: 1, hair: 1, hairColor: '#7a4a2a', skin: '#e8c0a0', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    currency: 'almond', // 杏仁水计价（wikidot 通用等价物惯例，同 Gamma 军需官）
    trade: [
      { item: 'canned', price: 1 }, { item: 'bandage', price: 1 }, { item: 'coffee', price: 2 },
      { item: 'sedative', price: 2 }, { item: 'glowstick', price: 1 },
    ],
    lines: [
      {
        npc: '要补给？佩特拉·沃斯，管架子的。杏仁水计价，明码标账——别跟我讨价还价，我的账从来没错过。',
        opts: [
          { text: '看看货架。', action: 'trade' },
          { text: '这里物资紧张吗？', next: 1 },
          { text: '就看看。', action: 'leave' },
        ],
      },
      {
        npc: '哨所不紧张，走廊紧张。锅炉房那条线下周还要去一趟——上次少了两节电池，记在飞蛾头上。',
        opts: [{ text: '那先换点吧。', action: 'trade' }, { text: '祝顺利。', action: 'leave' }],
      },
    ],
    idle: ['杏仁水四十瓶……整。', '鞋带。', '下周的配给表得重排。'],
  },
  otis: {
    id: 'otis', name: '奥蒂斯·兰格', role: '维修工', faction: 'meg',
    personality: '寡言，工具腰带叮当响；说起灯管和门轴才打开话匣子。',
    background: '哨所的勤杂维修。灯具、门锁、那张总吱呀响的桌子都归他管。他说这一层的东西「从不坏，只是旧」——这让他很不安。',
    uniform: { top: '#4a5568', topStyle: 3, badge: '#d9b13b' },
    avatar: { gender: 0, hair: 3, hairColor: '#2a2a2e', skin: '#a87f5c', pants: '#3a3d33', pantsStyle: 2, face: 0 },
    lines: [
      {
        npc: '奥蒂斯。修东西的。灯闪了、门卡了、床晃了，言语一声。',
        opts: [
          { text: '这层楼有什么要修的？', next: 1 },
          { text: '回头见。', action: 'leave' },
        ],
      },
      {
        npc: '说实话——没有。我巡了三星期，一颗螺丝都没松过。旧而不坏，你懂我意思吗？就像有人天天上油。……别盯着走廊尽头的门看，那不是我们的门。',
        opts: [{ text: '我记下了。', action: 'leave' }],
      },
    ],
    idle: ['工具带又磨破了。', '三号灯管……不用换。', '门轴今天也很安静。'],
  },
  // ---- 家常酒店（id 111）：现代酒店制服（青灰/米白） ----
  vivian: {
    id: 'vivian', name: '维维安·克罗斯', role: '前台接待', faction: 'homely',
    personality: '职业微笑无懈可击，语速永远比电梯还稳；记性极好，见过一次的客人绝不会忘。',
    background: '家常酒店的前台。她说酒店「一直在营业」，对「酒店外面是什么」这个问题永远回答「走廊」。登记簿上的字迹从来不变。',
    uniform: { top: '#5a8a9a', topStyle: 1, badge: '#e2dccf' },
    avatar: { gender: 1, hair: 4, hairColor: '#2a2226', skin: '#f0c8a8', pants: '#3a3f46', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '欢迎光临家常酒店。维维安·克罗斯，今晚的前台。您的登记已备案——房卡按号排好了，长住短歇，皆受欢迎。',
        opts: [
          { text: '酒店一直在这里吗？', next: 1 },
          { text: '有什么规矩？', next: 2 },
          { text: '随便看看。', action: 'leave' },
        ],
      },
      {
        npc: '一直在营业。昨天、上周、1937 年——都是营业日。您问外面？外面是走廊，女士/先生。走廊不归我们管。',
        opts: [{ text: '……好吧。', action: 'leave' }],
      },
      {
        npc: '只有一条：先登记。登记过的客人，酒店都记得。对了——夜里听见歌声请别循着去找，那不是我们的服务范围。',
        opts: [{ text: '明白了。', action: 'leave' }],
      },
    ],
    idle: ['207 的客人还没退……哦，他续住了。', '房卡按号排好。', '欢迎回家。'],
  },
  margot: {
    id: 'margot', name: '玛戈·林', role: '服务员', faction: 'homely',
    personality: '轻快利落，端着托盘也能侧身让路；喜欢打听走廊尽头的事。',
    background: '酒店餐厅角的服务员，调咖啡的手艺是在前厅学的。她说自己「送错一层楼」就再也没找到原来的酒店。',
    uniform: { top: '#e2dccf', topStyle: 1, badge: '#5a8a9a' },
    avatar: { gender: 1, hair: 8, hairColor: '#4a3020', skin: '#e8c0a0', pants: '#3a3f46', pantsStyle: 0, face: 1 },
    currency: 'almond',
    trade: [{ item: 'coffee', price: 1 }, { item: 'canned', price: 1 }, { item: 'silverware', price: 1 }],
    lines: [
      {
        npc: '嗨——坐！玛戈，端盘子的。咖啡是现调的，别问豆子哪来的，问了就喝不下去了。',
        opts: [
          { text: '来点喝的。', action: 'trade' },
          { text: '你怎么到这家酒店的？', next: 1 },
          { text: '先不坐。', action: 'leave' },
        ],
      },
      {
        npc: '送错一层楼呗。推着餐车拐了个弯，走廊就变成红地毯了。这儿的前台人很好，就收留了我——反正客人总是要喝咖啡的。',
        opts: [{ text: '来一杯。', action: 'trade' }, { text: '回头聊。', action: 'leave' }],
      },
    ],
    idle: ['3 号桌续杯。', '托盘该擦了。', '今晚的甜品是……还是杏仁水。'],
  },
  harold: {
    id: 'harold', name: '哈罗德·芬奇', role: '长住客', faction: 'homely',
    personality: '温和而心不在焉，总抱着一本翻旧的书；聊起酒店像聊一位老朋友。',
    background: '住在 207 的长住客——住了多久他自己也说不清。每天在大堂读同一本书，书页从不翻动。',
    uniform: { top: '#6a5a48', topStyle: 6, badge: '#8a7a5a' },
    avatar: { gender: 0, hair: 2, hairColor: '#8a8a8e', skin: '#d8b090', pants: '#3a3630', pantsStyle: 0, face: 0, glasses: 1 },
    lines: [
      {
        npc: '哦——新面孔。哈罗德·芬奇，207 的住客。别在意我，我只是这里的一件旧家具。',
        opts: [
          { text: '住了多久了？', next: 1 },
          { text: '这本书好看吗？', next: 2 },
          { text: '不打扰您读书。', action: 'leave' },
        ],
      },
      {
        npc: '久到前台换了……不，前台没换过。久到走廊都认识我了。离开？哦不，这本书还没读完。',
        opts: [{ text: '保重。', action: 'leave' }],
      },
      {
        npc: '好看。每一页都好看。就是……怎么说呢，每次读到这里，我都觉得下一页该不一样了。它从来没有。',
        opts: [{ text: '祝阅读愉快。', action: 'leave' }],
      },
    ],
    idle: ['下一页……', '207 的灯很暖。', '今天的大堂也很干净。'],
  },
  // ---- 原住民（id 112）：历史著名失踪者——1930 前老式服装配色 ----
  amelia: {
    id: 'amelia', name: '阿梅莉亚·埃尔哈特', role: '飞行员', faction: 'originals',
    personality: '爽利坦率，笑声爽朗；说起飞行时眼睛发亮，对「失踪」二字笑而不答。',
    background: '1937 年环球飞行途中失踪的传奇飞行员。在这里她仍穿着飞行夹克，偶尔抬头——像还在找一片能降落的天。',
    uniform: { top: '#5a4a36', topStyle: 3, badge: '#b8924a' }, // 皮飞行夹克
    avatar: { gender: 1, hair: 2, hairColor: '#6a4a2a', skin: '#e8c0a0', pants: '#4a3f36', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '看得出自己的翅膀是什么的人可不多。阿梅莉亚·埃尔哈特——飞行员。曾经是，现在也是。只是跑道有点难找。',
        opts: [
          { text: '您还记得那一夜吗？', next: 1 },
          { text: '这里的人都很特别。', next: 2 },
          { text: '荣幸之至。', action: 'leave' },
        ],
      },
      {
        npc: '仪表正常，无线电正常，然后——灯变了颜色。再落地时，跑道变成了红地毯。我们都「不谈来路」，这是屋里的规矩。……但天上没有云的那一夜，我记得。',
        opts: [{ text: '我懂规矩。', action: 'leave' }],
      },
      {
        npc: '都是不肯认命的人。船长还在等他的海，阿斯特还在算他的账。我？我在等一扇朝上的门。看见的话，告诉我一声。',
        opts: [{ text: '一定。', action: 'leave' }],
      },
    ],
    idle:['风向不对。', '仪表盘会喜欢这里的灯光。', '下次起飞，不会太远了。'],
  },
  dorothy: {
    id: 'dorothy', name: '多萝西·阿诺德', role: '名媛', faction: 'originals',
    personality: '优雅矜持，措辞考究；对礼仪一丝不苟，对过去只字不提。',
    background: '1910 年纽约上流社会失踪的名媛。她仍像赴茶会一样端坐在客厅里，帽子压得恰到好处。',
    uniform: { top: '#4a3a46', topStyle: 6, badge: '#b8924a' }, // 深色长裙毛衣风
    avatar: { gender: 1, hair: 8, hairColor: '#3a2a22', skin: '#f0d0b8', pants: '#3a2e36', pantsStyle: 5, face: 0 },
    lines: [
      {
        npc: '下午好。多萝西·阿诺德。您收到了邀请函——那么，欢迎。茶还是咖啡？我们这里什么都旧，只有待客之道是新的。',
        opts: [
          { text: '您住在这里很久了吧。', next: 1 },
          { text: '这屋子真讲究。', next: 2 },
          { text: '叨扰了。', action: 'leave' },
        ],
      },
      {
        npc: '「久」是个没有礼数的词，亲爱的。这里的钟不往前走，我们也不数日子。重要的是——客人上门时，客厅是体面的。',
        opts: [{ text: '说得是。', action: 'leave' }],
      },
      {
        npc: '谢谢。每一件都有它的位置，每一位客人也是。贝弗莉室的派对再热闹，我们的客厅更安静——安静，才听得见一架好留声机。',
        opts: [{ text: '告辞。', action: 'leave' }],
      },
    ],
    idle: ['茶要七分烫。', '帽子不能歪。', '今天有客人来吗？'],
  },
  astor: {
    id: 'astor', name: '约翰·雅各布·阿斯特四世', role: '实业家', faction: 'originals',
    personality: '沉稳威严，谈生意像在董事会上；对「以物易物」有老派商人的执着。',
    background: '1912 年随巨轮沉没的实业家与首富。在这里他仍管着一间「账房」——用旧时代的器物换你这个时代的补给，童叟无欺。',
    uniform: { top: '#2e2a33', topStyle: 7, badge: '#b8924a' }, // 长礼服风衣
    avatar: { gender: 0, hair: 3, hairColor: '#4a4a4e', skin: '#d8b090', pants: '#22252a', pantsStyle: 0, face: 2, beard: 2 },
    barter: [ // 旧时代器物 ↔ 现代补给（无货币团体）
      { give: 'silverware', giveN: 1, get: 'almond', getN: 2 }, // 银餐具换杏仁水
      { give: 'canned', giveN: 2, get: 'skeleton', getN: 1 }, // 罐头换万能钥匙（他的收藏很多）
      { give: 'battery', giveN: 2, get: 'sedative', getN: 1 },
      { give: 'glowstick', giveN: 2, get: 'coffee', getN: 1 },
    ],
    lines: [
      {
        npc: '约翰·雅各布·阿斯特四世。坐。在我的年代，信用就是黄金；在这里，黄金不如一瓶干净的水。想换点什么？我的价码一向公道。',
        opts: [
          { text: '看看你的货。', action: 'trade' },
          { text: '您还在记账？', next: 1 },
          { text: '改日再谈。', action: 'leave' },
        ],
      },
      {
        npc: '账不能停。进出相抵，日子才有着落。这艘……这间屋子的账，我记了二十五年——收入是客人的故事，支出是我们的沉默。平衡得很。',
        opts: [{ text: '那看看货吧。', action: 'trade' }, { text: '好一个平衡。', action: 'leave' }],
      },
    ],
    idle: ['收入：故事三则。', '银器该擦了。', '账平，心安。'],
  },
  smith: {
    id: 'smith', name: '爱德华·史密斯', role: '船长', faction: 'originals',
    personality: '威严寡言，站姿如临舰桥；对职责的执着近乎固执。',
    background: '1912 年与船共存亡的邮轮船长。在这里他仍每日「巡视」客厅与走廊，像巡视甲板。他的怀表停在那个夜晚。',
    uniform: { top: '#23262e', topStyle: 7, badge: '#c9c4b0' }, // 船长制服
    avatar: { gender: 0, hair: 2, hairColor: '#9a9a9e', skin: '#d8b090', pants: '#22252a', pantsStyle: 0, face: 2, beard: 2 },
    lines: [
      {
        npc: '爱德华·史密斯，船长。这里没有海，但客人就是乘客——乘客平安，船长就没失职。',
        opts: [
          { text: '您还在当船长。', next: 1 },
          { text: '这屋子归您管吗？', next: 2 },
          { text: '告辞。', action: 'leave' },
        ],
      },
      {
        npc: '船沉了，船长没有走。这一次也一样——不管这间客厅是什么，我站在这里，它就是我的舰桥。',
        opts: [{ text: '向您致敬。', action: 'leave' }],
      },
      {
        npc: '各管一摊。多萝西管礼仪，阿斯特管账，我管平安。夜里有响动就来叫我——在海上，我从没让一个乘客掉队。',
        opts: [{ text: '记下了。', action: 'leave' }],
      },
    ],
    idle: ['海况良好。', '怀表又该上弦了。', '巡视完毕。'],
  },
  hoffa: {
    id: 'hoffa', name: '吉米·霍法', role: '工会领袖', faction: 'originals',
    personality: '粗中有细，说话像谈判；对「兄弟」二字极看重，也最护短。',
    background: '1975 年消失在停车场里的工会领袖——屋里最「新」的原住民。他说自己只是「来晚了几十年」，并坚持每个人都该有份公平的配给。',
    uniform: { top: '#3a3630', topStyle: 3, badge: '#8a6d3a' },
    avatar: { gender: 0, hair: 2, hairColor: '#3a3a3e', skin: '#c99878', pants: '#2a2d33', pantsStyle: 0, face: 2 },
    barter: [
      { give: 'canned', giveN: 1, get: 'bandage', getN: 1 },
      { give: 'almond', giveN: 1, get: 'battery', getN: 1 },
      { give: 'sedative', giveN: 1, get: 'coffee', getN: 2 },
    ],
    lines: [
      {
        npc: '吉米·霍法。别管那些头衔——在这儿我就是管配给的。兄弟们缺什么，你就说什么；公平交换，谁也不欠谁。',
        opts: [
          { text: '看看怎么换。', action: 'trade' },
          { text: '你是怎么来的？', next: 1 },
          { text: '先不换。', action: 'leave' },
        ],
      },
      {
        npc: '哈。屋里的规矩——不谈来路。我只能说：等人这种事情，我最有耐心。等了几十年，等到一间上锁的客厅。……至少这里的兄弟讲信用。',
        opts: [{ text: '看看货。', action: 'trade' }, { text: '保重。', action: 'leave' }],
      },
    ],
    idle: ['配给表给我看看。', '谁也不欠谁。', '停车场……算了。'],
  },
  white: {
    id: 'white', name: '约翰·怀特', role: '总督', faction: 'originals',
    personality: '持重克制，惯于在出发前把每件事安排停当；谈到「回去接人」时眼神会飘向门口。',
    background: '1587 年罗阿诺克殖民地的总督——回英格兰求援三年，归来时营地只剩刻在树上的字。在这里他仍维持着「临时总督府」的体面：出入有登记，访者有座次。',
    uniform: { top: '#3e3a2e', topStyle: 7, badge: '#b8924a' }, // 都铎风长外套
    avatar: { gender: 0, hair: 1, hairColor: '#6a5a42', skin: '#d8b090', pants: '#2e2a24', pantsStyle: 0, face: 2, beard: 1 },
    barter: [
      { give: 'almond', giveN: 2, get: 'glowstick', getN: 2 }, // 总督的应急储备
      { give: 'bandage', giveN: 2, get: 'sedative', getN: 1 },
    ],
    lines: [
      {
        npc: '欢迎来到我们的小居留地。约翰·怀特——曾是罗阿诺克的总督。现在也是。营地可以小，规矩不能散：来客请登记姓名。',
        opts: [
          { text: '罗阿诺克……后来呢？', next: 1 },
          { text: '能换些物资吗？', action: 'trade' },
          { text: '打扰了。', action: 'leave' },
        ],
      },
      {
        npc: '我回去求援，只离开了三年。三年！归来时栅栏还在，器物还在，人——一个都不在。树上刻着「CROATOAN」。……在这里我至少知道大家都在哪儿。这就够了。',
        opts: [{ text: '您节哀。', action: 'leave' }],
      },
    ],
    idle: ['营地的名册，今日无缺。', '树上没有字。很好。', '补给还够一周。'],
  },
  northup: {
    id: 'northup', name: '所罗门·诺瑟普', role: '作家 · 小提琴手', faction: 'originals',
    personality: '沉静而坚韧，言辞有书卷气；谈及自由时极轻、极慢，像怕惊动什么。',
    background: '《为奴十二年》的作者——生于自由、被劫为奴、又夺回自由的人。在这里他带着一本写不完的笔记和一把听不见的琴。',
    uniform: { top: '#2e3a3c', topStyle: 1, badge: '#b8924a' }, // 深色衬衫
    avatar: { gender: 0, hair: 1, hairColor: '#1c1a18', skin: '#6a4a34', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    barter: [
      { give: 'coffee', giveN: 1, get: 'bandage', getN: 1 }, // 他的笔记换你的热咖啡
      { give: 'glowstick', giveN: 1, get: 'almond', getN: 1 },
    ],
    lines: [
      {
        npc: '晚上好，朋友。所罗门·诺瑟普。一个曾经自由、又失去过自由、又把它找回来的人。这间屋子里的每一位，都懂得「找回」二字的分量。',
        opts: [
          { text: '你在写什么？', next: 1 },
          { text: '能换点什么吗？', action: 'trade' },
          { text: '告辞。', action: 'leave' },
        ],
      },
      {
        npc: '笔记。把每一天记下来——墙不会说话，纸会。我丢过十二年，一页都没记下；如今的日子再慢，也一页不落。自由这东西，写下来才算数。',
        opts: [{ text: '祝你写满每一页。', action: 'leave' }],
      },
    ],
    idle: ['今天这一页，很平静。', '琴声在心里。', '自由要写下来。'],
  },

  // ================= v45/v47：杰瑞的信众（The Followers Of Jerry）——Level 274 固定 NPC =================
  // v47：整体移至注册表末尾（图鉴「人士」页按注册表序显示，信众排最后）；
  // 对话树/自言自语不含「（……）」式舞台指示（一律风味正文）。
  zeph: {
    id: 'zeph', name: '泽弗修士', role: '信众 · 侍立者', faction: 'jerry',
    personality: '沉静虔诚，语速缓慢，三句话不离鹉主的教诲。',
    background: '最早找到杰瑞的房间的信众之一。他自称曾在廊道里迷路七天，是「一阵蓝色的振翅声」把他带到了这里——从此再不离开主间半步。',
    uniform: { top: '#4142a5', topStyle: 3, badge: '#0071c9' },
    avatar: { gender: 0, hair: 2, hairColor: '#3a3a3e', skin: '#c9a58a', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '愿你被鹉主注视。我是泽弗，祂的仆人。你站在圣地之中——当压低声音，当放缓脚步，因为祂就在穹顶之下看着你。',
        opts: [
          { text: '这里是什么地方？', next: 1 },
          { text: '我能为鹉主做些什么？', next: 2 },
          { text: '叨扰了。', action: 'leave' },
        ],
      },
      {
        npc: '杰瑞的房间，Level 274。前厅之外是喧嚣的廊道，穹顶之下唯有神圣。祂不言语，却知晓万事——每一扇门后的路，每一名流浪者的归处，都在祂眼中。',
        opts: [{ text: '令人敬畏。', action: 'leave' }],
      },
      {
        npc: '上前接触祂吧，当怀着敬意。鹉主必赐福于你——你也将渐渐明白，为何我们称这为「教化」。若你的虔诚与名望已经足够，我还可以把传扬祂名的使命托付给你。',
        opts: [{ text: '我明白了。', action: 'leave' }],
      },
    ],
    idle: ['低声诵念：鹉主在上，祂的名当受颂赞……', '穹顶的光今日又亮了一分。', '祂今日看了我三次，这是何等的恩典。', '当保持安静——这里是圣地。'],
  },
  polly: {
    id: 'polly', name: '珀莉修女', role: '信众 · 侍立者', faction: 'jerry',
    personality: '热诚健谈，把每一位访客都当作未来的兄弟姐妹。',
    background: '曾是无门无派的流浪者，在 Level 2 的宣传间里被同僚引到杰瑞面前。她说那是她「第一次感到后室不再饥饿」——如今她在主间侍立，迎接每一位来客。',
    uniform: { top: '#4142a5', topStyle: 3, badge: '#0071c9' },
    avatar: { gender: 1, hair: 1, hairColor: '#4a3020', skin: '#f0c8a8', pants: '#2a2d33', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '欢迎你，远方的兄弟姐妹！我是珀莉。别紧张——鹉主喜悦访客。你看祂，那蓝羽何等美丽，不是吗？',
        opts: [
          { text: '祂……只是一只鹦鹉？', next: 1 },
          { text: '我听说祂喜欢杏仁水？', next: 2 },
          { text: '先不聊了。', action: 'leave' },
        ],
      },
      {
        npc: '嘘——此话在这里可不敬。祂是鹉主，是后室至大的存在。你多接触祂几次，自会明白：诵咏将从你口中自然流出，那感觉……如同归家。',
        opts: [{ text: '我会试试。', action: 'leave' }],
      },
      {
        npc: '她忽然压低声音：……告诉你一个秘密——杏仁水能「驯服」祂，被驯服的鹉主便不再教化你。但千万别在我们面前行这事，那是亵渎。你什么都没有听见。',
        opts: [{ text: '多谢提醒。', action: 'leave' }],
      },
    ],
    idle: ['祂今日心情甚好，羽毛都是亮的。', '又有兄弟姐妹要归入我们了，这是喜事。', '嘘——听，祂在整理羽毛。', '蓝羽之下，皆是家人。'],
  },
  bluebird: {
    // v47：青鸟神父（wikidot 杰瑞的信众：信众的领袖——蓝袍誓衣，鹉主偶尔站上他的肩头）
    id: 'bluebird', name: '青鸟神父', role: '信众 · 神父（领袖）', faction: 'jerry',
    personality: '温和而威严，布道时声音仿佛自穹顶落下；对鹉主的忠诚不容一丝怀疑。',
    background: '杰瑞的信众的领袖。据说他与鹉主亲近到祂会偶尔站上他的肩头——那一身蓝色长袍，是他对杰瑞永恒忠诚的誓衣。信众间流传一句话：青鸟神父与我们同在。',
    uniform: { top: '#2a5fd8', topStyle: 3, badge: '#d4af37' }, // 蓝色长袍 + 金饰（npcGear 附加袍摆/高冠/肩头小鹉）
    avatar: { gender: 0, hair: 0, hairColor: '#d8d8dc', skin: '#d8b898', pants: '#1a2a6e', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '愿鹉主的蓝羽庇护你，孩子。我是青鸟神父——信众的牧者，鹉主在人间最亲近的仆人。你能来到圣地，是祂的旨意。',
        opts: [
          { text: '您与鹉主很亲近？', next: 1 },
          { text: '这座圣堂是您主持修建的？', next: 2 },
          { text: '叨扰了，神父。', action: 'leave' },
        ],
      },
      {
        npc: '亲近？孩子，祂偶尔站上我的肩头——信众都曾见过。祂信任我，正如我将自己全然交托给祂。这身蓝袍是我的誓衣：此生只侍奉一位主，那就是鹉主杰瑞。',
        opts: [{ text: '令人敬仰。', action: 'leave' }],
      },
      {
        npc: '穹顶、长椅、彩玻、圣水盆——一梁一柱，皆是信众亲手立起。居住区收容疲惫的兄弟姐妹，告解室倾听迷途的灵魂。这里不只是一个房间——是后室之中，唯一配称作「家」的地方。',
        opts: [{ text: '我会怀着敬意参观。', action: 'leave' }],
      },
    ],
    idle: ['青鸟与我们同在，直到永远。', '祂的目光自穹顶而下，从未移开分毫。', '今晚的诵咏，由年长的兄弟姐妹领唱。', '愿迷途者都能听见蓝羽的声音。'],
  },
  sinclair: {
    // v47：辛克莱·贝克特（wikidot 杰瑞的信众：最臭名昭著的成员——便装、狂热，曾领导对 M.E.G. 等团体的攻击）
    id: 'sinclair', name: '辛克莱·贝克特', role: '信众 · 狂热者', faction: 'jerry',
    personality: '狂热、锋利、不知疲倦；便装之下是信众中最臭名昭著的执行力。',
    background: '杰瑞的信众中最臭名昭著的成员之一。便装出行的她曾领导多次对 M.E.G. 与其他团体的攻击——「我曾认为此处没有希望，但杰瑞找到并指引了我。」如今她在圣地静修，锋芒未减。',
    uniform: { top: '#4a4a52', topStyle: 1, badge: '#4142a5' }, // 便装（灰蓝便服 + 信众色胸章；蓝羽胸针/日记本见 npcGear）
    avatar: { gender: 1, hair: 2, hairColor: '#2a2018', skin: '#e8c8a8', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '站住——哦，别紧张。我是辛克莱·贝克特。你大概听过我的名字：信众中最「臭名昭著」的那个。在这里，我只是鹉主的一名仆人。',
        opts: [
          { text: '你攻击过 M.E.G.？', next: 1 },
          { text: '是什么让你追随鹉主？', next: 2 },
          { text: '先不聊了。', action: 'leave' },
        ],
      },
      {
        npc: '他们称那为攻击，我称那为护教。凡向鹉主拔刀的，我便向他拔刀——就是如此。别那样看我：若你所守护的被人踩进泥里，你也会动手。',
        opts: [{ text: '我记下了。', action: 'leave' }],
      },
      {
        npc: '我曾以为此处没有希望——后室只会吃人。但杰瑞寻见了我，指引了我。第一次接触祂时我便明白：我存在的理由，就是让更多迷路的灵魂听见祂的名。',
        opts: [{ text: '愿祂也指引我。', action: 'leave' }],
      },
    ],
    idle: ['祂指引了我，也必指引你。', '便装便于行事——袍子会拖慢拳头。', 'Level 11 那次？是他们不敬在先。', '日记快写满了，该寻一本新的了。'],
  },

  // ================= v54：蓝色救赎（Level 3 信众圣所，id 108）——仍在注册表末尾（jerry 系之后） =================
  // 对话树/自言自语为圣经体风味正文（不含「（……）」式舞台指示）；圣所内不主动传教、不显示认同选项
  // （引擎按 level 108 拦截，同 L274 规则）
  theron: {
    id: 'theron', name: '塞隆修士', role: '信众 · 圣所司事', faction: 'jerry',
    personality: '低眉垂目，声如圣辉自高处落下；守门与待客之间，分寸从不逾矩。',
    background: '蓝色救赎的司事。信众在 Level 3 立起第一块蓝石时他就在场——从此守着圣所的门，只放虔徒入内。',
    uniform: { top: '#4142a5', topStyle: 3, badge: '#0071c9' },
    avatar: { gender: 0, hair: 0, hairColor: '#9a9a9e', skin: '#c9a58a', pants: '#2a2d33', pantsStyle: 0, face: 0 },
    lines: [
      {
        npc: '愿你被鹉主注视。我是塞隆，圣所的司事。你能踏入蓝色救赎，足见你的虔诚已蒙垂顾——凡真心寻求祂的，祂必不拒绝。',
        opts: [
          { text: '这里是什么地方？', next: 1 },
          { text: '你们如何建起这座圣所？', next: 2 },
          { text: '叨扰了。', action: 'leave' },
        ],
      },
      {
        npc: '蓝色救赎——信众在 Level 3 的圣所。电站的嗡鸣到不了蓝石之内，这里的寂静只为诵咏而设。长椅朝讲坛，圣水常盈，烛火不熄：凡劳累的兄弟姐妹，皆可在此得安息。',
        opts: [{ text: '愿鹉主保佑这座圣所。', action: 'leave' }],
      },
      {
        npc: '一砖一石，皆是信众亲手从廊道深处运来、亲手砌起。有人问我：为何在这危险之地立圣所？我答：正因危险，迷路的人才最需要一盏蓝灯。',
        opts: [{ text: '说得好。', action: 'leave' }],
      },
    ],
    idle: ['烛火当彻夜不熄。', '圣水盆该续了。', '凡寻求祂的，必寻见。', '今日又有三位兄弟姐妹诵咏至天明。'],
  },
  aella: {
    id: 'aella', name: '艾拉修女', role: '信众 · 静修者', faction: 'jerry',
    personality: '轻声细语，怀里永远抱着一本抄经；长椅末端的固定座位就是她的世界。',
    background: '曾在 Level 3 的晦暗廊道里断了三日干粮，是一阵蓝色的振翅声引她摸到圣所门前。如今她在蓝色救赎静修，誊抄鹉主的颂词。',
    uniform: { top: '#4142a5', topStyle: 3, badge: '#0071c9' },
    avatar: { gender: 1, hair: 1, hairColor: '#4a3020', skin: '#f0c8a8', pants: '#2a2d33', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '嘘——轻些，兄弟姐妹。我是艾拉，在此静修。你既进得来，便是同路的人。坐吧，圣辉之下，不必说话。',
        opts: [
          { text: '你是怎么来到这里的？', next: 1 },
          { text: '你在抄写什么？', next: 2 },
          { text: '不打扰你了。', action: 'leave' },
        ],
      },
      {
        npc: '断了三日干粮，灯一盏盏灭下去，我以为我便要死在那条廊道里。然后我听见振翅——蓝色的，很轻，像有人在黑暗里翻一页书。我跟着那声音走，就走到了圣所的门前。祂拯救了我，我便把余生献给祂。',
        opts: [{ text: '愿祂也听见我。', action: 'leave' }],
      },
      {
        npc: '颂词。每抄一遍，心里就亮一分。待抄满一百卷，我要把它们带回杰瑞的房间——那是我们共同的圣地。',
        opts: [{ text: '祝你早日抄满。', action: 'leave' }],
      },
    ],
    idle: ['蓝羽之下，皆是家人。', '愿迷路的，都得着这盏蓝灯。', '这一卷，献给引我的振翅声。'],
  },
}
