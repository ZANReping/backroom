// NPC 注册表：据点中有名有姓的居民——每人都有姓名、职业、性格与经历。
// NPC 不是实体（不进 ENTITIES / m.entities，开发者面板不可召唤）；
// 建模复用玩家模型（buildPlayerModel），每人的形象为手工定制的固定配置（独特、精致、不变），
// 制服经上衣/徽章定制，标志性配饰由渲染层按 id 附加。
// 对话：lines 为预制对话树（未接入 LLM API 时玩家只能选预制回复）；
// 接入 API 后可在 DialogOverlay 自由输入（人设由 personality/background 组装 system prompt）。
import type { AvatarCfg } from './avatar'
import { DEFAULT_AVATAR } from './avatar'

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
  currency?: 'eaglecoin' | 'presses' // 交易货币（缺省天鹰币；BNTG 系为压印币）
  trade?: { item: string; price: number }[] // 商品（按 currency 货币定价）
  barter?: { give: string; giveN: number; get: string; getN: number; give2?: string; give2N?: number }[] // 以物易物（玩家给 give×giveN[ + give2×give2N]、换得 get×getN；阿丽亚娜/Tom 的餐馆无货币专用，与 trade 互斥）
  workLoop?: 'hammer' | 'saw' | 'paint' | 'mop' // v39：装修工作循环动作（BRC 员工：锚定工作点不游荡，渲染层 procedual 驱动手臂+工具）
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
import { randomAvatar } from './avatar'

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
  '随 Gamma 基地的商队而来，最后留在了这里。',
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
  floor?: 0 | 1 // v46：所在楼层带（0=主层 1=上层；缺省 0）——多层据点的上层居民（EL3A 夹楼办公区）
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
import { RNG } from './rng'

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
    id: 'faust', name: 'Faust 博士', role: '首席研究员',
    personality: '狂热好奇，一谈起生物就忘了时间，常常对着样本自言自语。',
    background: '从前站点 01.3 带来一箱子器材和一身伤疤，主持研究署的植物、微生物、人类及类人三个方向。',
    uniform: { top: '#e8e8e0', topStyle: 1, badge: '#3a5a4a' },
    avatar: { gender: 0, hair: 2, hairColor: '#9a9a9e', skin: '#c9a58a', pants: '#3a3f46', pantsStyle: 0, face: 1 },
    lines: [
      {
        npc: '哦？活人！我是说——欢迎，实验室很少有不穿白大褂的访客。Faust，首席研究员。植物、微生物、人类及类人，三个方向我都管。',
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
    idle: ['这批货的账又对不上了……', '杏仁水，硬通货，永远不嫌多。', 'Gamma 基地的商队下周到。', '谁把我的算盘拿走了？！'],
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
    avatar: { gender: 0, hair: 4, hairColor: '#5a4a2a', skin: '#e8b890', pants: '#3a352e', pantsStyle: 0, face: 1 },
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
    id: 'shen', name: '塞德里克', role: '经理 · 首席鉴定师', faction: 'bntg',
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
        npc: '坐。塞德里克，首席鉴定师。买货先看货——我的柜台上没有次品，当然，也没有「捡漏」这个词。',
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
    id: 'tang', name: '玛戈', role: '雇员 · 杂货摊主', faction: 'bntg',
    personality: '嘴碎热情，见谁都是「老主顾」，卖东西总要搭一句使用心得。',
    background: '市场街资历最老的摊主。从电池到保温服，他的杂货摊养活了大半个商人之家。',
    uniform: { top: '#6a5a40', topStyle: 2, badge: '#5c6d5e' },
    avatar: { gender: 1, hair: 5, hairColor: '#4a3020', skin: '#f0c8a8', pants: '#3a352e', pantsStyle: 0, face: 1 },
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
        npc: '哟，老主顾——哎，认错了？没事，从今天起你就是老主顾了！玛戈的杂货摊，样样都有，样样都「稍微」贵那么一点点，嘿嘿。',
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
    id: 'kui', name: '布洛克', role: 'TGPF 警备队长', faction: 'bntg',
    personality: '沉默寡言，站姿像一堵墙；对越界者只说一次「退后」。',
    background: '贸易集团警备处（TGPF）的精锐，前雇佣兵，如今带一支小队守着交易保险库。传闻他一个人吓退过一整个觊觎保险库的小团体。',
    uniform: { top: '#3a3f46', topStyle: 3, badge: '#5c6d5e' },
    avatar: { gender: 0, hair: 2, hairColor: '#232326', skin: '#7d5a3c', pants: '#2a2d33', pantsStyle: 0, face: 2 },
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
    avatar: { gender: 0, hair: 1, hairColor: '#1a1a1c', skin: '#7d5a3c', pants: '#2a2d33', pantsStyle: 0, face: 0 },
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
    avatar: { gender: 0, hair: 7, hairColor: '#7a5a30', skin: '#c9a58a', pants: '#d8dae0', pantsStyle: 2, face: 1 },
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
}
